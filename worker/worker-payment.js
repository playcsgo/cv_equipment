const { consumeQueue } = require('../que/queue')
const User = require('../models/user')

// connect MongoDB
require('dotenv').config()
const mongoose = require('mongoose')
mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection

db.on('error', (err) => {
  console.log(err)
})
db.once('open', () => {
  console.log('mongoDB connected.')
})

const WORKER_DELAY_MS = Number(process.env.WORKER_DELAY_MS || 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 只處理 payload：JSON.parse 與 ack / nack 由 consumeQueue 負責
// 不要在這裡 catch，錯誤丟出去 consumeQueue 才會 nack
const processTopUp = async ({ userId, amount }) => {
  await sleep(WORKER_DELAY_MS)

  const result = await User.updateOne(
    { _id: userId },
    { $inc: { currency: amount } },
  )
  if (result.matchedCount === 0) {
    console.warn(`[topup] user ${userId} not found`)
  } else {
    console.log(`[topup] ${userId} +${amount}`)
  }
}

consumeQueue('paymentQueue', processTopUp)
