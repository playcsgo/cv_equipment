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

// business logic
const MAX_LEVEL = 4
const LEVEL_UP_COST = 500
const SLOTS = ['helmet_lv', 'armor_lv', 'weapon_lv']

const processLevelUp = async ({ userId, location }) => {
  await sleep(WORKER_DELAY_MS)

  if (location === 'reset') {
    await User.updateOne(
      { _id: userId },
      { $set: { helmet_lv: 1, armor_lv: 1, weapon_lv: 1 } },
    )
    console.log(`[levelup] ${userId} reset`)
    return
  }

  if (!SLOTS.includes(location)) {
    console.warn(`[levelup] unknown slot: ${location}`)
    return
  }

  const result = await User.updateOne(
    {
      _id: userId,
      currency: { $gte: LEVEL_UP_COST },
      [location]: { $lt: MAX_LEVEL },
    },
    { $inc: { currency: -LEVEL_UP_COST, [location]: 1 } },
  )

  if (result.modifiedCount === 0) {
    console.log(
      `[levelup] ${userId} ${location}: 餘額不足、已達 Lv ${MAX_LEVEL}，或使用者不存在`,
    )
  } else {
    console.log(`[levelup] ${userId} ${location} +1`)
  }
}

// consume = subscription
// sub 'levelupQueue', and conduct call back 'processLevelUp'
consumeQueue('levelupQueue', processLevelUp)
