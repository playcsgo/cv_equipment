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

// reset: every slot back to Lv 1, no charge
const resetGear = async (userId, session) => {
  await User.updateOne(
    { _id: userId },
    { $set: { helmet_lv: 1, armor_lv: 1, weapon_lv: 1 } },
    { session },
  )
  return { result: 'reset' }
}

// upgrade: read the level -> charge -> +1 only on success. roll is decided outside the transaction
const upgradeGear = async (userId, slot, roll, session) => {
  const user = await User.findById(userId, `currency ${slot}`).session(session)
  const fromLv = user?.[slot]
  if (!user || user.currency < LEVEL_UP_COST || fromLv >= MAX_LEVEL) {
    return { result: 'rejected', fromLv, toLv: fromLv }
  }

  const result = roll < upgradeRate(fromLv) ? 'success' : 'fail'
  // a failed attempt still costs gems; the level only goes up on success.
  // matching on fromLv turns a concurrent change into a write conflict and a retry
  const inc = { currency: -LEVEL_UP_COST }
  if (result === 'success') inc[slot] = 1
  await User.updateOne(
    { _id: userId, currency: { $gte: LEVEL_UP_COST }, [slot]: fromLv },
    { $inc: inc },
    { session },
  )
  return { result, fromLv, toLv: result === 'success' ? fromLv + 1 : fromLv }
}

// Levelup and User are two documents: update both in one transaction,
// otherwise a crash in between charges twice or locks in a result without charging.
// reset goes through the same record so the page can poll it the same way
const processLevelUp = async ({ levelupId }) => {
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
      let change
      if (slot === 'reset') {
        change = await resetGear(userId, session)
      } else if (SLOTS.includes(slot)) {
        change = await upgradeGear(userId, slot, roll, session)
      } else {
        throw new PermanentError(`unknown slot: ${slot}`)
      }

      await Levelup.updateOne(
        { _id: levelupId, status: 'pending' },
        { $set: { status: 'done', ...change } },
        { session },
      )
      outcome = { userId, slot, ...change }
    })

    // log only after commit: the callback may run more than once
    if (!outcome) {
      console.log(
        `[levelup] ${levelupId}: already processed or missing, skipped`,
      )
    } else if (outcome.result === 'reset') {
      console.log(`[levelup] ${outcome.userId} reset`)
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
runWorker('levelupWorker', 'levelupQueue', processLevelUp)
