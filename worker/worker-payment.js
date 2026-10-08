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

const processTopUp = async (msg) => {
  const { userId, amount } = JSON.parse(msg.content.toString())

  await sleep(WORKER_DELAY_MS)

  try {
    const result = await User.updateOne(
      { _id: userId },
      { $inc: { currency: amount } },
    )
    if (result.matchedCount === 0) {
      console.warn(`[topup] user ${userId} not found`)
    } else {
      console.log(`[topup] ${userId} +${amount}`)
    }
  } catch (err) {
    console.error('[topup] failed', err)
  }
}

consumeQueue('paymentQueue', processTopUp)
