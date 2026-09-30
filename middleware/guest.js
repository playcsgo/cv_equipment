const crypto = require('crypto')
const User = require('../models/user')

module.exports = async (req, res, next) => {
  if (req.isAuthenticated()) return next()
  try {
    const id = crypto.randomBytes(3).toString('hex')
    const user = await User.create({
      name: `Guest-${id}`,
      email: `guest-${id}@demo.local`,
      password: crypto.randomBytes(16).toString('hex')
    })
    req.login(user.toObject(), next)
  } catch (err) {
    next(err)
  }
}
