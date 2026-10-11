const crypto = require('crypto')
const mongoose = require('mongoose')
const User = require('../models/user')
const Levelup = require('../models/levelup')
const { PermanentError } = require('../que/queue')
const runWorker = require('./run-worker')
const {
  MAX_LEVEL,
  LEVEL_UP_COST,
  SLOTS,
  upgradeRate,
} = require('../config/game')

const WORKER_DELAY_MS = Number(process.env.WORKER_DELAY_MS || 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// reset sets every slot back to Lv 1, so running it twice is harmless
const resetGear = async ({ userId }) => {
  if (typeof userId !== 'string')
    throw new PermanentError('userId must be a string')
  await sleep(WORKER_DELAY_MS)
  await User.updateOne(
    { _id: userId },
    { $set: { helmet_lv: 1, armor_lv: 1, weapon_lv: 1 } },
  )
  console.log(`[levelup] ${userId} reset`)
}

// Levelup and User are two documents: update both in one transaction,
// otherwise a crash in between charges twice or locks in a result without charging
const attemptLevelUp = async ({ levelupId }) => {
  if (typeof levelupId !== 'string') {
    throw new PermanentError('levelupId must be a string')
  }
  await sleep(WORKER_DELAY_MS)

  // roll once outside the transaction: withTransaction may rerun the callback,
  // and rolling inside would give the user another chance on every retry
  const roll = crypto.randomInt(1_000_000) / 1_000_000

  const session = await mongoose.startSession()
  try {
    let outcome = null
    await session.withTransaction(async () => {
      outcome = null

      // only pending records are processed; done means it was handled already
      const levelup = await Levelup.findOne({
        _id: levelupId,
        status: 'pending',
      }).session(session)
      if (!levelup) return

      const { slot, userId } = levelup
      if (!SLOTS.includes(slot)) {
        throw new PermanentError(`unknown slot: ${slot}`)
      }

      const user = await User.findById(userId, `currency ${slot}`).session(
        session,
      )
      const fromLv = user?.[slot]

      let result
      if (!user || user.currency < LEVEL_UP_COST || fromLv >= MAX_LEVEL) {
        result = 'rejected'
      } else {
        result = roll < upgradeRate(fromLv) ? 'success' : 'fail'
        // a failed attempt still costs gems; the level only goes up on success.
        // matching on fromLv turns a concurrent change into a write conflict and a retry
        const inc = { currency: -LEVEL_UP_COST }
        if (result === 'success') inc[slot] = 1
        await User.updateOne(
          { _id: userId, currency: { $gte: LEVEL_UP_COST }, [slot]: fromLv },
          { $inc: inc },
          { session },
        )
      }

      const toLv = result === 'success' ? fromLv + 1 : fromLv
      await Levelup.updateOne(
        { _id: levelupId, status: 'pending' },
        { $set: { status: 'done', result, fromLv, toLv } },
        { session },
      )
      outcome = { userId, slot, result, fromLv, toLv }
    })

    // log only after commit: the callback may run more than once
    if (!outcome) {
      console.log(
        `[levelup] ${levelupId}: already processed or missing, skipped`,
      )
    } else {
      const { userId, slot, result, fromLv, toLv } = outcome
      console.log(
        `[levelup] ${userId} ${slot}: ${result} (Lv ${fromLv} -> ${toLv})`,
      )
    }
  } finally {
    await session.endSession()
  }
}

// startConsumer handles JSON.parse and ack / nack; this only handles the payload
const processLevelUp = async (payload) => {
  if (payload.location === 'reset') return resetGear(payload)
  return attemptLevelUp(payload)
}

runWorker('levelupWorker', 'levelupQueue', processLevelUp)
