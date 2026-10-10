const User = require('../models/user')
const { PermanentError } = require('../que/queue')
const runWorker = require('./run-worker')
const { MAX_LEVEL, LEVEL_UP_COST, SLOTS } = require('../config/game')

const WORKER_DELAY_MS = Number(process.env.WORKER_DELAY_MS || 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const processLevelUp = async ({ userId, location }) => {
  if (typeof userId !== 'string') throw new PermanentError('userId 必須是字串')
  if (location !== 'reset' && !SLOTS.includes(location)) {
    throw new PermanentError(`unknown slot: ${location}`)
  }
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
runWorker('levelupWorker', 'levelupQueue', processLevelUp)
