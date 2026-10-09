require('dotenv').config()
const amqp = require('amqplib')

const QUEUE = process.argv[2] || 'paymentQueue'
const DLQ = `${QUEUE}.dlq`

;(async () => {
  const conn = await amqp.connect(
    process.env.CLOUDAMQP_URL || 'amqp://localhost',
  )
  const ch = await conn.createConfirmChannel()
  let moved = 0

  for (;;) {
    const msg = await ch.get(DLQ, { noAck: false })
    if (!msg) break

    const {
      'x-attempts': _attempts,
      'x-death': _death,
      ...deaders
    } = msg.properties.headers

    await new Promise((resolve, reject) => {
      ch.sendToQueue(
        QUEUE,
        msg.content,
        { persistent: true, messageId: msg.properties.messageId, headers },
        (err) => (err ? reject(err) : resolve()),
      )
    })
    ch.ack(msg)
    moved++
  }

  console.log(`已從 ${DLQ} 搬回 ${moved} 則訊息到 ${QUEUE}`)
  await conn.close()
})()
