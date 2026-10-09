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

const MAX_ATTEMPTS = 3
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 1_000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class PermanentError extends Error {}

const assertWorkQueue = async (channel, queueName) => {
  await channel.assertQueue(`${queueName}.dlq`, { durable: true })
  await channel.assertQueue(queueName, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: `${queueName}.dlq`,
  })
}

// durable: true only make sure queue exist
// persistent: msg store in drive , make sure message in queue exist

const publish = (channel, queueName, content, { messageId, headers } = {}) =>
  new Promise((resolve, reject) => {
    channel.sendToQueue(
      queueName,
      content,
      { persistent: true, messageId, headers },
      (err) => (err ? reject(err) : resolve()),
    )
  })

const sendToQueue = async (queueName, message, { messageId } = {}) => {
  const channel = await getChannel()
  await assertWorkQueue(channel, queueName)
  await publish(channel, queueName, Buffer.from(message), { messageId })
}

// .consume is subscription
const consumeQueue = async (queueName, handler, { prefetch = 10 } = {}) => {
  const channel = await getChannel()
  await assertWorkQueue(channel, queueName)
  await channel.prefetch(prefetch)

  channel.on('close', () => {
    console.error(`[${queueName}] consumer 連線中斷，結束程序等待重啟`)
    process.exit(1)
  })
  await channel.consume(queueName, async (msg) => {
    if (msg === null) return

    let payload
    try {
      payload = JSON.parse(msg.content.toString())
    } catch (err) {
      console.error(
        `[${queueName}] 訊息格式錯誤，送進 DLQ：`,
        msg.content.toString(),
      )
      channel.nack(msg, false, false)
      return
    }

    try {
      await handler(payload)
      channel.ack(msg)
    } catch (err) {
      const headers = msg.properties.headers || {}
      const attmpts = (headers['x-attempts'] || 0) + 1
      if (err instanceof PermanentError || attmpts >= MAX_ATTEMPTS) {
        console.error(
          `[${queueName}] failed ${attmpts} times. send it to DLQ:`,
          err.message,
        )
        channel.nack(msg, false, false)
        return
      }
      const delay = RETRY_BASE_MS * 2 ** (attmpts - 1)
      console.warn(
        `[${queueName}] failed ${attmpts} times, retry after ${delay / 1_000}s...`,
        err.message,
      )
      await sleep(delay)

      try {
        await publish(channel, queueName, msg.content, {
          messageId: msg.properties.messageId,
          headers: { ...headers, 'x-attempts': attmpts },
        })
        channel.ack(msg)
      } catch {
        channel.nack(msg, false, true)
      }
    }
  })
}

module.exports = { sendToQueue, consumeQueue, PermanentError }
