const express = require('express')
const router = express.Router()
const User = require('../../models/user')

// RobbitMQ
const { sendToQueue } = require('../../que/queue')

router.post('/', (req, res) => {
  const userId = req.user._id
  const amount = +req.body.amount

  if (!amount || isNaN(amount)) {
    return res.status(400).send('Invalid amount');
  }
  const msg = JSON.stringify({ userId, amount })

  sendToQueue('paymentQueue', msg)
    .then(() => {
      console.log('task send to paymentQueue')
      setTimeout(() => {
        res.redirect('/')
      }, 300)
    })
    .catch(err => console.error('[topup.js]', err))


  // User.findById(userId)
  //   .then(user => {
  //     user.currency += amount
  //     user.save()
  //   })
  //   .then(() => res.redirect('/'))
  //   .catch(err => console.error(err))
})

module.exports = router
