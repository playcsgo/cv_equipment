// test for DLQ

require('dotenv').config()
const amqp = require('amqplib')
const { newGuest, topup, readState, settle, report } = require('./lib')

const QUEUE = 'paymentQueue'
const POISONS = ['not json', JSON.stringify({ topupId: { $gt: '' } })]

;(async () => {
  const conn = await amqp.connect(
    process.env.CLOUDAMQP_URL || 'amqp://localhost',
  )
  conn.on('error', () => {})

  const stats = async (q) => {
    const probe = await conn.createChannel()
    probe.on('error', () => {})

    try {
      const { messageCount, consumerCount } = await probe.checkQueue(q)
      await probe.close()
      return { messageCount, consumerCount }
    } catch {
      return null
    }
  }

  if (!(await stats(QUEUE))) {
    console.log(`${QUEUE} 不存在：請先啟動 payment worker`)
    process.exit(1)
  }

  const dlqBefore = (await stats(`${QUEUE}.dlq`))?.messageCount ?? 0

  const ch = await conn.createChannel()
  for (const p of POISONS) ch.sendToQueue(QUEUE, Buffer.from(p))
  console.log(`已送出 ${POISONS.length} 則壞訊息：${POISONS.join('、')}`)

  const cookie = await newGuest()
  const before = await readState(cookie)
  await topup(cookie, 100)
  const after = await settle(cookie)
  const ok1 = report(
    '壞訊息之後的正常儲值 +100',
    before.currency + 100,
    after.currency,
  )

  const main = await stats(QUEUE)
  const dlq = await stats(`${QUEUE}.dlq`)
  console.log(
    `   ${QUEUE}：待處理 ${main.messageCount} 則、consumer ${main.consumerCount} 個`,
  )
  console.log(`   ${QUEUE}.dlq：${dlq ? `${dlq.messageCount} 則` : '不存在'}`)
  const ok2 = report(
    '壞訊息被保存到 DLQ',
    dlqBefore + POISONS.length,
    dlq?.messageCount ?? 0,
  )

  await conn.close().catch(() => {})
  process.exit(ok1 && ok2 ? 0 : 1)
})()
