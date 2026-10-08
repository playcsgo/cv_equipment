const amqp = require('amqplib')

let connection = null
let channel = null

const connectRabbitMQ = async () => {
  if (!connection) {
    connection = await amqp.connect(
      process.env.CLOUDAMQP_URL || 'amqp://localhost',
    )
  }
  if (!channel) {
    channel = await connection.createChannel()
  }
  return { connection, channel }
}

const getChannel = async () => {
  if (!channel) {
    await connectRabbitMQ()
  }
  return channel
}

const sendToQueue = async (queueName, message) => {
  const channel = await getChannel()
  await channel.assertQueue(queueName, { durable: true })
  channel.sendToQueue(queueName, Buffer.from(message))
}

// .consume is subscription
const consumeQueue = async (queueName, handler, { prefetch = 10 } = {}) => {
  const channel = await getChannel()
  await channel.assertQueue(queueName, { durable: true })
  await channel.prefetch(prefetch)
  await channel.consume(
    queueName,
    async (msg) => {
      if (msg === null) return

      let payload
      try {
        payload = JSON.parse(msg.content.toString())
      } catch (err) {
        console.error(
          `[${queueName}] 訊息格式錯誤，丟棄：`,
          msg.content.toString(),
        )
        channel.nack(msg, false, false)
        return
      }

      try {
        await handler(payload)
        channel.ack(msg)
      } catch (err) {
        console.error(`[${queueName}] 處理失敗：`, err)
        channel.nack(msg, false, false)
      }
    },
    { noAck: false },
  )
}

module.exports = { sendToQueue, consumeQueue }
