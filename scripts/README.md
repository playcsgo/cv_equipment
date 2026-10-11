# 重現腳本

每一支腳本都透過 HTTP 操作網站（和真人點網頁走同一條路徑：route → queue → worker），
所以每個 commit 都能用同一組腳本驗證「修改前 / 修改後」。

## 準備

```bash
docker compose up -d          # mongo（單節點 replica set）、redis、rabbitmq
cp .env.example .env          # 只連本機，絕對不要對 Atlas 跑
pnpm run dev                  # 終端機 1：web
pnpm run worker:payment       # 終端機 2
pnpm run worker:levelup       # 終端機 3
```

RabbitMQ 管理介面：http://localhost:15672（guest / guest），Queues 頁面可以看到 Ready 與 Unacked。

## 一次跑完

| 指令 | 內容 | 前提 |
|---|---|---|
| `pnpm run repro:all --tag F3` | race、mixed、duplicate、invalid、get、gear-duplicate、odds、gear-result、poison | web 和兩個 worker 都開著 |
| `pnpm run repro:chaos --tag E9` | crash、retry、graceful、broker-restart | **先停掉自己開的 payment worker**（腳本會自己啟動、kill）；broker-restart 後 levelup worker 會斷線結束，要重開 |

兩者都會先檢查環境，結果寫進 `scripts/logs/<時間>_<tag>.log`（chaos 是 `_chaos.log`，不進 git）。
任一項 ❌ 時以 exit code 1 結束。

## 單支腳本

| 指令 | 重現什麼 |
|---|---|
| `pnpm run repro:race` | 同一個帳號同時儲值 50 筆 × 100（`pnpm run repro:race 200` 調整筆數） |
| `pnpm run repro:mixed` | 同時儲值 20 筆，並升級三件裝備（兩個 worker 同時改同一位使用者） |
| `pnpm run repro:duplicate` | 同一個 topupId 送兩次：處理完之後重送、同時送兩次 |
| `pnpm run repro:invalid` | 送出不合法的金額（-5000、0、1.5、50001、abc、空白），餘額不應改變 |
| `pnpm run repro:get` | 單純 GET 升級網址（模擬預先載入、爬蟲），資料不應改變 |
| `pnpm run repro:poison` | 兩則壞訊息（`"not json"`、`{"topupId":{"$gt":""}}`）進到 paymentQueue：之後的儲值還會不會入帳、壞訊息有沒有進 DLQ |
| `pnpm run repro:latency` | 儲值、升級的平均回應時間（量測用，沒有 ✅／❌） |
| `pnpm run repro:crash` | 手動版 crash（worker 用 `WORKER_DELAY_MS=3000` 啟動，提示後 3 秒內 Ctrl+C 再重啟） |
| `pnpm run repro:broker-restart` | 手動版 broker-restart（先停 payment worker，看到提示再啟動） |
| `pnpm run repro:graceful` | 手動版 graceful（worker 要用 `WORKER_DELAY_MS=3000 node worker/worker-payment.js` 直接啟動） |
| `pnpm run dlq:replay [queue]` | 工具：修好 bug 後，把 `<queue>.dlq` 的訊息搬回原 queue（預設 paymentQueue） |

## 結果紀錄

每一欄是該 commit 完成後重跑腳本的結果；「—」表示那時腳本還沒寫或沒有記錄。log 在 `scripts/logs/`。

| 腳本 | E0 修改前 | E1 原子操作 | E2–E3 ack／confirm | E4 冪等＋驗證 | E5–E8 | E9 最終回歸 |
|---|---|---|---|---|---|---|
| race | ❌ 10300／15000（50 筆只入帳 3 筆） | ✅ 15000 | ✅ | ✅ | ✅ | ✅ |
| mixed | ❌ 9600／10500（錢少 900） | ✅ 10500，等級 2/2/2 | ✅ | ✅ | ✅ | ✅ |
| duplicate | ❌ 12000／11000（重送也入帳） | ❌ | ❌ | ✅ 重送、同時送都是 11000 | ✅ | ✅ |
| invalid | — | — | — | — | ✅ 10000 不變 | ✅ |
| get | — | — | — | — | E8：✅ GET 回 404，資料不變 | ✅ |
| poison | ❌ worker 當掉，後面的儲值卡在 queue | ❌ 同 E0 | ⚠️ worker 存活、儲值入帳；壞訊息被丟棄 | ⚠️ 同 E2 | ✅ 2 則進 DLQ，後面的儲值正常 | ✅ |
| crash | ❌ 10000／11000（10 筆全部遺失） | — | — | — | — | ✅ kill -9 後 10 則回到 Ready，重啟後 11000 |
| retry | — | — | — | — | — | ✅ 停掉 mongo → 重試 → mongo 回來後入帳，沒進 DLQ |
| graceful | — | — | — | — | E7（修改前）：❌ 0.1 秒結束，5 則留在 queue | ✅ 2.7 秒結束（exit 0），queue 0 則，+500 |
| broker-restart | — | — | — | — | — | ✅ 重啟前後都是 5 則，web 回 302，10600 |
| latency | — | — | — | — | E5：儲值 322 ms | 儲值 **8 ms**、升級 2 ms（E9 回歸時發現 E6 漏拿掉儲值的 `setTimeout(300)`、漏了 `GET /topup/:id`，補上後重量） |

E9 另外用 `pnpm start`（pm2-runtime：web＋兩個 worker）確認：`/readyz` 2 秒內 200、儲值正常入帳；
停止時 pm2 送 **SIGINT**（不是 SIGTERM），web 與兩個 worker 都印出「已安全關閉」。

## E0 觀察

- **race／mixed**：worker 用「findById → 修改 → save()」，同時處理多則訊息時後寫的蓋掉先寫的（lost update）。
- **duplicate**：沒有記錄處理過的 topupId，重送就重複入帳。
- **crash／poison**：`que/queue.js` 用 `noAck: true`，訊息一交給 worker 就被 RabbitMQ 刪除；worker 當掉時處理中的訊息全部遺失。RabbitMQ 管理介面的 Unacked 永遠是 0。
