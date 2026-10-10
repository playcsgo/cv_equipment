// test, close without graceful

// WORKER_DELAY_MS=3000 node worker/worker-payment.js
// node scripts/graceful-shutdown.js

const { execSync } = require('child_process')
require('dotenv').config()
const amqp = require('amqplib')
const { newGuest, topup, readState, sleep, report } = require('./lib')

const QUEUE = 'paymentQueue'

;(async () => {
  const pid = Number(
    execSync('pgrep -f "node worker/worker-payment.js" || true')
      .toString()
      .trim()
      .split('\n')[0],
  )
  if (!pid) {
    console.log('找不到 payment worker:請先用 WORKER_DELAY_MS=3000 啟動它')
    process.exit(1)
  }

  const cookie = await newGuest()
  const before = await readState(cookie)
  await Promise.all(Array.from({ length: 5 }, () => topup(cookie, 100)))
  await sleep(1000)

  const start = Date.now()
  process.kill(pid, 'SIGTERM')
  console.log(`已對 payment worker (pid ${pid}）送出 SIGTERM`)
  for (;;) {
    try {
      process.kill(pid, 0)
    } catch {
      break
    }
    await sleep(100)
  }
  console.log(`worker 在 ${((Date.now() - start) / 1000).toFixed(1)} 秒後結束`)

  const after = await readState(cookie)
  const conn = await amqp.connect(
    process.env.CLOUDAMQP_URL || 'amqp://localhost',
  )
  const { messageCount } = await (await conn.createChannel()).checkQueue(QUEUE)
  await conn.close()
  console.log(`   ${QUEUE} 待處理：${messageCount} 則`)
  const ok = report(
    'SIGTERM 之前送出的 5 筆，在 worker 結束前全部處理完',
    before.currency + 500,
    after.currency,
  )
  process.exit(ok ? 0 : 1)
})()
