const express = require('express')
const router = express.Router()
const User = require('../../models/user')

// RabbitMQ
const { sendToQueue } = require('../../que/queue')

const maxLevel = 4


router.get('/:location', (req, res) => {
  const userId = req.user?._id
  const location = req.params.location
  if (location !== 'reset' &&
      location !== 'helmet_lv' &&
      location !== 'armor_lv' &&
      location !== 'weapon_lv') {
        req.flash('warning_msg', '無此選項')
        return res.redirect('/')
      }
  
  const msg = JSON.stringify({ userId, location, maxLevel })
  sendToQueue('levelupQueue', msg)
      .then(() => {
        console.log('task send to levelupQueue')
        setTimeout(() => {
          res.redirect('/')
        }, 300)
      })
      .catch(err => console.error('[gearup.js]', err))

  // User.findById(userId)
  //     .then(user => {
  //       switch(location) {
  //           case 'reset':
  //             user.helmet_lv = 1
  //             user.armor_lv = 1
  //             user.weapon_lv = 1
  //             break

  //           default:
  //             if (user[location] < maxLevel &&
  //               user.currency >= 500 ) {
  //               user[location]++
  //               user.currency -= 500
  //             }
  //             break
  //         }
  //       user.save()
  //     })
  //     .then(() => res.redirect('/'))
  //     .catch(err => console.error(err))
})

module.exports = router
