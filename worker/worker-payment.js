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


const processTopUp = (msg) => {
  const { userId, amount } = JSON.parse(msg.content.toString());
  console.log('userId:', userId);
  console.log('amount:', amount);
  
  User.findById(userId)
    .then(user => {
      user.currency += amount
      user.save()
    })
    .then(() => console.log(`${amount} top up completed`))
    .catch(err => console.error(err))

  // msg.channel.ack(msg);
};

consumeQueue('paymentQueue', processTopUp);
