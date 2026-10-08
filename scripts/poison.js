// test for DLQ

require('dotenv').config()
const amqp = require('amqplib')
const { newGuest, topup, readState, settle, report } = require('./lib')

const QUEUE = 'paymentQueue'

;(async () => {
  const conn = await amqp.connect(
    process.env.CLOUDAMQP_URL || 'amqp://localhost',
  )
  conn.on('error', () => {})

  const ch = await conn.createChannel()
  ch.sendToQueue(QUEUE, Buffer.from('not json'))
  console.log('poison msg sent!')

  // a normal operation should success
  const cookie = await newGuest()
  const before = await readState(cookie)
  await topup(cookie, 100)
  const after = await settle(cookie)

  const ok = report(
    '毒訊息之後的正常儲值 +100',
    before.currency + 100,
    after.currency,
  )

  for (const q of [QUEUE, `${QUEUE}.dlq`]) {
    const probe = await conn.createChannel()
    probe.on('error', () => {})

    try {
      const { messageCount, consumerCount } = await probe.checkQueue(q)
      console.log(` ${q} has ${messageCount} msg / ${consumerCount} consumer `)
      await probe.close()
    } catch {
      console.log(` ${q} not exist`)
    }
  }

  await conn.close().catch(() => {})
  process.exit(ok ? 0 : 1)
})()
