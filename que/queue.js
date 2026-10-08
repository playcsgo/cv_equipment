const amqp = require('amqplib')

let channelPromise = null

const connect = async () => {
  const connection = await amqp.connect(
    process.env.CLOUDAMQP_URL || 'amqp://localhost',
  )
  connection.on('error', (err) =>
    console.error('[rabbitmq] connecting failed', err.message),
  )
  connection.on('close', () => {
    console.error('[rabbitmq] 連線中斷')
    channelPromise = null
  })

  const channel = await connection.createConfirmChannel()
  channel.on('error', (err) =>
    console.error('[rabbitmq] channel 錯誤：', err.message),
  )
  channel.on('close', () => {
    channelPromise = null
  })

  return channel
}

const getChannel = async () => {
  if (!channelPromise) {
    channelPromise = connect().catch((err) => {
      channelPromise = null
      throw err
    })
  }
  return channelPromise
}

// durable: true only make sure queue exist
// persistent: msg store in drive , make sure message in queue exist

const sendToQueue = async (queueName, message, { messageId } = {}) => {
  const channel = await getChannel()
  await channel.assertQueue(queueName, { durable: true })
  await new Promise((resovle, reject) => {
    channel.sendToQueue(
      queueName,
      Buffer.from(message),
      { persistent: true, messageId },
      (err) => (err ? reject(err) : resovle()),
    )
  })
}

// .consume is subscription
const consumeQueue = async (queueName, handler, { prefetch = 10 } = {}) => {
  const channel = await getChannel()
  await channel.assertQueue(queueName, { durable: true })
  await channel.prefetch(prefetch)

  channel.on('close', () => {
    console.error(`[${queueName}] consumer 連線中斷，結束程序等待重啟`)
    process.exit(1)
  })
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
