// also move infra setting to here, also to set the process in the right sequence
// connect DB -> MQ
// shutdown MQ -> DB

require('dotenv').config()
const mongoose = require('mongoose')
const { startConsumer } = require('../que/queue')

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 8000)

module.exports = async function runWorker(workerName, queueName, handler) {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(`[${workerName}] mongoDB connected.`)
    const consumer = await startConsumer(queueName, handler)
    console.log(`[${workerName}] 開始處理 ${queueName}`)

    let stopping = false
    const shutdown = async (signal) => {
      if (stopping) return

      stopping = true
      console.log(
        `[${workerName}] 收到 ${signal}：停止接收新訊息，等待處理中的訊息完成…`,
      )

      setTimeout(() => {
        console.error(
          `[${workerName}] 超過 ${SHUTDOWN_TIMEOUT_MS}ms 仍未完成，強制結束`,
        )
        process.exit(1)
      }, SHUTDOWN_TIMEOUT_MS).unref()

      try {
        await consumer.stop()
        await mongoose.disconnect()
        console.log(`[${workerName}] 已安全關閉`)
        process.exit(0)
      } catch (err) {
        // 不 catch 的話要等上面的逾時才結束，log 也看不到真正的原因
        console.error(`[${workerName}] 關閉時發生錯誤：`, err)
        process.exit(1)
      }
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  } catch (err) {
    console.error(`[${workerName}] 啟動失敗：`, err)
    process.exit(1) // pm2 reboot
  }
}
