const amqp = require('amqplib')

let channelPromise = null

let currentConnection = null
let shuttingDown = false

const connect = async () => {
  const connection = await amqp.connect(
    process.env.CLOUDAMQP_URL || 'amqp://localhost',
  )
  currentConnection = connection
  connection.on('error', (err) =>
    console.error('[rabbitmq] connecting failed', err.message),
  )
  connection.on('close', () => {
    if (!shuttingDown) console.error('[rabbitmq] 連線中斷')
    if (currentConnection === connection) currentConnection = null
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

const declareWorkQueue = async (channel, queueName) => {
  await channel.assertQueue(`${queueName}.dlq`, { durable: true })
  await channel.assertQueue(queueName, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: `${queueName}.dlq`,
  })
}

// durable: true only make sure queue exist
// persistent: msg store in drive , make sure message in queue exist

const publishWithConfirm = (
  channel,
  queueName,
  content,
  { messageId, headers } = {},
) =>
  new Promise((resolve, reject) => {
    channel.sendToQueue(
      queueName,
      content,
      { persistent: true, messageId, headers },
      (err) => (err ? reject(err) : resolve()),
    )
  })

const enqueue = async (queueName, message, { messageId } = {}) => {
  const channel = await getChannel()
  await declareWorkQueue(channel, queueName)
  await publishWithConfirm(channel, queueName, Buffer.from(message), {
    messageId,
  })
}

// 啟動一個 consumer（訂閱 queue），回傳 { stop } 用來優雅關機
const startConsumer = async (queueName, handler, { prefetch = 10 } = {}) => {
  const channel = await getChannel()
  await declareWorkQueue(channel, queueName)
  await channel.prefetch(prefetch)

  // nack(msg, allUpTo, requeue)：不放回 → 有 DLX 設定，自動進 DLQ；放回 → 回到 queue 再處理
  const toDlq = (msg) => channel.nack(msg, false, false)
  const putBack = (msg) => channel.nack(msg, false, true)

  channel.on('close', () => {
    if (shuttingDown) return
    console.error(`[${queueName}] consumer 連線中斷，結束程序等待重啟`)
    process.exit(1)
  })

  const inFlight = new Set() // closing items, need to wait for them close.
  const { consumerTag } = await channel.consume(
    queueName,
    (msg) => {
      // null: the server cancelled this consumer (e.g. queue deleted); exit so pm2 restarts and resubscribes
      if (msg === null) {
        if (shuttingDown) return
        console.error(`[${queueName}] consumer 被伺服器取消，結束程序等待重啟`)
        Promise.allSettled([...inFlight]).then(() => process.exit(1))
        return
      }
      const done = handleMessage(msg).catch((err) =>
        console.error(`[${queueName}] 未預期的錯誤：`, err),
      )
      inFlight.add(done)
      done.finally(() => inFlight.delete(done))
    },
    { noAck: false },
  )

  return {
    // 優雅關機：不再收新訊息 → 等處理中的訊息 ack → 先關 channel（確保 ack 送達）→ 關連線
    stop: async () => {
      shuttingDown = true
      await channel.cancel(consumerTag)
      await Promise.allSettled([...inFlight])
      await channel.close().catch(() => {})
      await closeConnection()
    },
  }

  async function handleMessage(msg) {
    let payload
    try {
      payload = JSON.parse(msg.content.toString())
    } catch (err) {
      console.error(
        `[${queueName}] 訊息格式錯誤，送進 DLQ:`,
        msg.content.toString(),
      )
      toDlq(msg)
      return
    }

    try {
      await handler(payload)
      channel.ack(msg)
    } catch (err) {
      const headers = msg.properties.headers || {}
      const attempts = (headers['x-attempts'] || 0) + 1
      if (err instanceof PermanentError || attempts >= MAX_ATTEMPTS) {
        console.error(
          `[${queueName}] failed ${attempts} times. send it to DLQ:`,
          err.message,
        )
        toDlq(msg)
        return
      }
      const delay = RETRY_BASE_MS * 2 ** (attempts - 1)
      console.warn(
        `[${queueName}] failed ${attempts} times, retry after ${delay / 1_000}s...`,
        err.message,
      )
      await sleep(delay)

      try {
        await publishWithConfirm(channel, queueName, msg.content, {
          messageId: msg.properties.messageId,
          headers: { ...headers, 'x-attempts': attempts },
        })
        channel.ack(msg)
      } catch {
        putBack(msg)
      }
    }
  }
}

// 優雅關機用：關閉整條連線（web 的 shutdown 也會呼叫）
const closeConnection = async () => {
  shuttingDown = true
  if (currentConnection) await currentConnection.close().catch(() => {})
}

module.exports = { enqueue, startConsumer, closeConnection, PermanentError }
