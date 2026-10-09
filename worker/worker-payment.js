const { consumeQueue, PermanentError } = require('../que/queue')
const User = require('../models/user')
const Topup = require('../models/topup')

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
// topup and user currency sould be handle at once with transaction
const processTopUp = async ({ topupId }) => {
  if (typeof topupId !== 'string')
    throw new PermanentError('topupId 必須是字串')
  await sleep(WORKER_DELAY_MS)

  const session = await mongoose.startSession()
  try {
    let credited = null
    await session.withTransaction(async () => {
      credited = null

      const topup = await Topup.findOneAndUpdate(
        { _id: topupId, status: 'pending' },
        { $set: { status: 'done' } },
        { session, new: true },
      )

      if (!topup) return
      await User.updateOne(
        { _id: topup.userId },
        { $inc: { currency: topup.amount } },
        { session },
      )

      credited = topup
    })

    // 交易已經 commit 才印 log（callback 可能被重跑，不能在裡面印）
    if (credited) {
      console.log(`[topup] ${topupId}: ${credited.userId} +${credited.amount}`)
    } else {
      console.log(`[topup] ${topupId}: 已經處理過或不存在，略過`)
    }
  } finally {
    await session.endSession()
  }
}

consumeQueue('paymentQueue', processTopUp)
