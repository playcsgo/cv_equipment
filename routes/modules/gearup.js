const express = require('express')
const router = express.Router()
// RabbitMQ
const { enqueue } = require('../../que/queue')

const LOCATIONS = ['reset', 'helmet_lv', 'armor_lv', 'weapon_lv']

router.post('/:location', async (req, res) => {
  const user = req.user
  const location = req.params.location
  if (!LOCATIONS.includes(location)) {
    req.flash('warning_msg', '無此選項')
    return res.redirect('/')
  }
  try {
    await enqueue(
      'levelupQueue',
      JSON.stringify({ userId: user._id, location }),
    )

    const gearFrom = `${user.currency}-${user.helmet_lv}-${user.armor_lv}-${user.weapon_lv}`
    res.redirect(`/?gearFrom=${gearFrom}`)
  } catch (err) {
    console.error('[gearup.js]', err)
    req.flash('warning_msg', '系統忙碌，請稍後再試')
    res.redirect('/')
  }
})

module.exports = router
