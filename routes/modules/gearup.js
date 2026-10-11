const express = require('express')
const router = express.Router()
const Levelup = require('../../models/levelup')
const { enqueue } = require('../../que/queue')

const { SLOTS } = require('../../config/game')

const LOCATIONS = ['reset', ...SLOTS]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (req, res, message) => {
  req.flash('warning_msg', message)
  res.redirect('/')
}

router.post('/:location', async (req, res) => {
  const user = req.user
  const location = req.params.location
  if (!LOCATIONS.includes(location)) {
    return fail(req, res, '無此選項')
  }
  const gearFrom = `${user.currency}-${user.helmet_lv}-${user.armor_lv}-${user.weapon_lv}`

  try {
    if (location === 'reset') {
      await enqueue(
        'levelupQueue',
        JSON.stringify({ userId: user._id, location }),
      )
      return res.redirect(`/?gearFrom=${gearFrom}`)
    }

    const { levelupId } = req.body
    if (typeof levelupId !== 'string' || !UUID_RE.test(levelupId)) {
      return fail(req, res, 'please retry after reload the page')
    }

    try {
      await Levelup.create({ _id: levelupId, userId: user._id, slot: location })
    } catch (err) {
      if (err.code !== 11_000) throw err
      const levelup = await Levelup.findById(levelupId)
      if (
        !levelup ||
        !levelup.userId.equals(user._id) ||
        levelup.slot !== location
      ) {
        return fail(req, res, 'please retry after reload the page')
      }
      if (levelup.status === 'done') {
        return fail(req, res, 'duplicate levelup action')
      }
    }

    await enqueue('levelupQueue', JSON.stringify({ levelupId }), {
      messageId: levelupId,
    })
    res.redirect(`/?gearFrom=${gearFrom}`)
  } catch (err) {
    console.error('[gearup.js]', err)
    fail(req, res, 'system busy, please try later')
  }
})

module.exports = router
