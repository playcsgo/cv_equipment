const { consumeQueue } = require('../que/queue');
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


const processLevelUp = (msg) => {
  const { userId, location, maxLevel } = JSON.parse(msg.content.toString());
  // gearUp Here!!
  console.log('userId:', userId)
  console.log('location:', location)
  console.log('maxLevel:', maxLevel)

  User.findById(userId)
      .then(user => {
        switch(location) {
            case 'reset':
              user.helmet_lv = 1
              user.armor_lv = 1
              user.weapon_lv = 1
              break

            default:
              if (user[location] < maxLevel &&
                user.currency >= 500 ) {
                user[location]++
                user.currency -= 500
              } else {
                console.log(`${location} over Lv_4`)
              }
              break
          }
        user.save()
      })
      .then(() => console.log('gearUp completed'))
      .catch(err => console.error(err))
};


// consume = subscription
// sub 'levelupQueue', and conduct call back 'processLevelUp'
consumeQueue('levelupQueue', processLevelUp);
