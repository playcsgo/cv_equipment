# cv_equipment：儲值與裝備升級（RabbitMQ 非同步處理）

一個網路商城的 demo：訪客進站自動拿到一個 guest 帳號，可以儲值寶石、花寶石升級頭盔／盔甲／武器。
儲值和升級都不在 web 裡直接改資料，而是丟進 RabbitMQ，由 worker 處理。

這個 repo 的重點是**可靠性重構**：先寫腳本重現 bug、記下數字，再一步一步修好（E0–E9），
每一步都用同一組腳本驗證。數字與逐步結果見 [scripts/README.md](scripts/README.md)。

## 架構

```
瀏覽器 ──HTTP──► web（Express＋Handlebars，pm2 cluster）
                  │  session 存 Redis
                  │  enqueue（persistent＋publisher confirm）
                  ▼
               RabbitMQ ── paymentQueue ──► worker-payment ──┐
                  │      ── levelupQueue ──► worker-levelup ─┤──► MongoDB（replica set）
                  └─ 失敗的訊息 → paymentQueue.dlq／levelupQueue.dlq    │
                                                                     │
瀏覽器 ◄── 頁面輪詢處理狀態（/topup/:id、/state）◄─────────────────────┘
```

| 檔案 | 職責 |
|---|---|
| `app.js` | Express、session（Redis）、`/healthz`、`/readyz`、優雅關機 |
| `routes/modules/topup.js` | 驗證金額與 topupId → 建立 `Topup`（pending）→ 送進 `paymentQueue` |
| `routes/modules/gearup.js` | `POST /gearup/:slot` → 送進 `levelupQueue` |
| `que/queue.js` | 連線與重連、`enqueue`（confirm）、`startConsumer`（ack／重試／DLQ／`stop()`） |
| `worker/run-worker.js` | worker 共用的啟動與關機流程（先連 DB 再收訊息，關機時反過來） |
| `worker/worker-payment.js` | `processTopUp`：交易內 Topup pending → done＋`$inc` 餘額 |
| `worker/worker-levelup.js` | `processLevelUp`：條件式 `$inc`（錢夠、未滿級才扣錢升級） |
| `ecosystem.config.js` | pm2：web（cluster）＋兩個 worker，`kill_timeout` 10 秒 |

## 可靠性設計

| 問題 | 做法 | 步驟 |
|---|---|---|
| 同時儲值互相覆蓋（50 筆只入帳 3 筆） | 不在 JS 裡讀改寫，改用 MongoDB `$inc` 原子操作 | E1 |
| worker 處理到一半當掉，訊息消失 | `noAck: false`，處理成功才 ack；`prefetch(10)` 限制手上數量 | E2 |
| RabbitMQ 重啟訊息消失、web 之後送不出訊息 | queue `durable`＋訊息 `persistent`；publisher confirm；連線中斷自動重連 | E3 |
| 重送、連點、at-least-once 重新投遞造成重複入帳 | 表單帶 `topupId`（`_id` 唯一）＋worker 狀態機 pending → done，在交易裡和加錢一起完成 | E4 |
| 不合法金額（負數、小數、超大） | route 驗證整數 1–50000；worker 只信任 DB 裡的金額 | E4 |
| 壞訊息讓 worker 當掉或無限重試 | 解析失敗／`PermanentError` 直接進 DLQ；暫時性錯誤延遲重試（1s、2s），第 3 次進 DLQ | E5 |
| 用 `setTimeout(300)` 猜 worker 何時完成 | 馬上回應，頁面輪詢實際狀態 | E6 |
| 升級用 GET，被預先載入、爬蟲、CSRF 觸發 | 改成 `POST`，路由只接受 POST | E7 |
| 部署時處理中的訊息被中斷 | 收到 SIGTERM／SIGINT：停收新訊息 → 等處理完並 ack → 關 channel → 關連線；`/readyz` | E8 |

## 本機執行

需要 Node 20+、pnpm、Docker。

```bash
docker compose up -d        # mongo（單節點 replica set）、redis、rabbitmq
cp .env.example .env        # 只連本機
pnpm install
pnpm run dev                # 終端機 1：web（http://localhost:3000）
pnpm run worker:payment     # 終端機 2
pnpm run worker:levelup     # 終端機 3
```

驗證：

```bash
pnpm run repro:all          # race、mixed、duplicate、invalid、get、poison
pnpm run repro:chaos        # crash、retry、graceful、broker-restart（先停掉自己開的 payment worker）
```

用正式環境的方式啟動（pm2-runtime，web＋兩個 worker 一起）：`pnpm start`

RabbitMQ 管理介面：http://localhost:15672（guest／guest）

## 部署（Render）

`render.yaml` 定義了 web 服務（`pnpm start`，health check `/readyz`）和存 session 的 Key Value。
MongoDB（Atlas）和 RabbitMQ（CloudAMQP）是外部服務，連線字串在 Render 後台設定 `MONGODB_URI`、`CLOUDAMQP_URL`。

注意：

- **部署 E5 之後的版本前，要先到 CloudAMQP 刪掉舊的 `paymentQueue`、`levelupQueue`。**
  新版本宣告 queue 時多了 DLX 參數，舊 queue 參數不同，RabbitMQ 會回 `PRECONDITION_FAILED`，web 和 worker 都起不來。
- 免費方案閒置會休眠，第一次連線要等 cold start。
- demo 資料（guest 帳號、儲值紀錄）一小時後自動刪除。
