// tests for
// 1. are messages still in que when reboot RabitMQ
// 2. if RabbitMQ reconnected after web reconnected
// Need to shutdown works after, otherwise works consume those message too fast....

require('dotenv').config()
const { execSync } = require('child_process')
const amqp = require('amqplib')
const { newGuest, topup, readState, sleep, report } = require('./lib')

const QUEUE = 'paymentQueue'
const WAIT_MS = Number(process.env.WAIT_MS || 20_000)

async function queueStats() {
  const conn = await amqp.connect(
    process.env.CLOUDAMQP_URL || 'amqp://localhost',
  )
  try {
    const ch = await conn.createChannel()
    return await checkQueue(QUEUE)
  } finally {
    await conn.close().catch(() => {})
  }
}

;(async () => {
  if ((await queueStats()).consumerCount > 0) {
    console.log('payment worker still working, please stop it first')
    process.exit(1)
  }

  const cookie = await newGuest()
  const before = await readState(cookie)
  await Promise.all(Array.from({ length: 5 }, () => topup(cookie, 100)))
  console.log(`重啟前 ${QUEUE} 待處理：${(await queueStats()).messageCount} 則`)
  console.log('MQ rebooting...')

  execSync('docker compose restart rabbitmq', { stdio: 'ignore' }) // same as typing 'xxx' in shell

  for (let i = 0; i < 60; i++) {
    try {
      await queueStats()
      break
    } catch {
      await sleep(1_000)
    }
  }

  console.log(`重啟後 ${QUEUE} 待處理：${(await queueStats()).messageCount} 則`)

  const status = await topup(cookie, 100)
  console.log(`重啟後再儲值一筆，web 回應狀態：${status}`)
  console.log(`現在請啟動 payment worker。${WAIT_MS / 1_000} 秒後檢查結果……`)

  await sleep(WAIT_MS)
  const after = await readState(cookie)
  const ok = report(
    'RabbitMQ 重啟前 5 筆＋重啟後 1 筆，全部入帳',
    before.currency + 600,
    after.currency,
  )

  process.exit(ok ? 0 : 1)
})()
