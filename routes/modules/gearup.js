const express = require('express')
const router = express.Router()
const Levelup = require('../../models/levelup')
const { enqueue } = require('../../que/queue')

const { SLOTS } = require('../../config/game')

const LOCATIONS = ['reset', ...SLOTS]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (req, res, status, message) => {
  req.flash('warning_msg', message)
  res.format({
    html: () => res.redirect('/'),
    json: () => res.status(status).json({ error: message }),
    default: () => res.redirect('/'),
  })
}

router.post('/:location', async (req, res) => {
  const user = req.user
  const location = req.params.location
  if (!LOCATIONS.includes(location)) {
    return fail(req, res, 400, '無此選項')
  }

  const { levelupId } = req.body
  if (typeof levelupId !== 'string' || !UUID_RE.test(levelupId)) {
    return fail(req, res, 400, 'please retry after reload the page')
  }

  try {
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
        return fail(req, res, 400, 'please retry after reload the page')
      }
      if (levelup.status === 'done') {
        return fail(req, res, 409, 'duplicate levelup action')
      }
    }

    await enqueue('levelupQueue', JSON.stringify({ levelupId }), {
      messageId: levelupId,
    })
    res.format({
      html: () => res.redirect('/'),
      json: () => res.status(202).json({ id: levelupId }),
      default: () => res.redirect('/'),
    })
  } catch (err) {
    console.error('[gearup.js]', err)
    fail(req, res, 503, 'system busy, please try later')
  }
})

router.get('/:id', async (req, res) => {
  const levelup = await Levelup.findOne(
    { _id: req.params.id, userId: req.user._id },
    'slot status result fromLv toLv',
  ).lean()
  if (!levelup) return res.status(404).json({ error: 'not_found' })
  const { slot, status, result, fromLv, toLv } = levelup
  res.json({ slot, status, result, fromLv, toLv })
})

module.exports = router
