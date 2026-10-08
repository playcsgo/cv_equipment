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

## 腳本

| 指令 | 重現什麼 |
|---|---|
| `pnpm run repro:race` | 同一個帳號同時儲值 50 筆 × 100（可用 `pnpm run repro:race 200` 調整筆數） |
| `pnpm run repro:mixed` | 同時儲值 20 筆，並升級三件裝備（兩個 worker 同時改同一位使用者） |
| `pnpm run repro:duplicate` | 同一個 topupId 送兩次（處理完之後再重送，不是同時送） |
| `pnpm run repro:crash` | payment worker 處理到一半當掉（worker 要用 `WORKER_DELAY_MS=3000` 啟動，看到提示後 3 秒內 Ctrl+C 再重啟；`WAIT_MS` 調整等待時間） |
| `pnpm run repro:poison` | 壞訊息（`"not json"`）進到 paymentQueue，之後的正常儲值還會不會入帳 |

所有腳本結果是 ❌ 時以 exit code 1 結束。

一次跑完：`pnpm run repro:all --tag E1`（race、mixed、duplicate、poison；crash 要手動，另外跑）。
會先檢查 web 和兩個 worker 有沒有在跑，結果同時寫進 `scripts/logs/<時間>_<tag>.log`（不進 git）。

## 結果紀錄

每一欄是該 commit 完成後重跑腳本的結果。

| 腳本 | E0 修改前 |
|---|---|
| race | ❌ 10300／15000（50 筆只入帳 3 筆） |
| mixed | ❌ 9600／10500，錢少 900（等級 2/2/2 正確） |
| duplicate | ❌ 12000／11000（重送也入帳） |
| crash | ❌ 10000／11000（10 筆全部遺失；Ctrl+C 太慢時會變成 10200，量到的是 lost update） |
| poison | ❌ worker 當掉，後面的儲值卡在 queue；毒訊息因 `noAck: true` 直接消失 |

## E0 觀察

- **race／mixed**：worker 用「findById → 修改 → save()」，同時處理多則訊息時後寫的蓋掉先寫的（lost update）。
- **duplicate**：沒有記錄處理過的 topupId，重送就重複入帳。
- **crash／poison**：`que/queue.js` 用 `noAck: true`，訊息一交給 worker 就被 RabbitMQ 刪除；worker 當掉時處理中的訊息全部遺失。RabbitMQ 管理介面的 Unacked 永遠是 0。
