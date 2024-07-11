const express = require('express')
const router = express.Router()
const User = require('../../models/user')
const bcryptjs = require('bcryptjs')
const passport = require('passport')

// login-1
router.get('/login', (req, res) => {
  res.render('login')
})
// login-2
router.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/users/login'
}))

// signup-1
router.get('/signup', (req, res) => {
  res.render('signup')
})
// signup-2
router.post('/signup', (req, res) => {
  const { name, email, password } = req.body
  bcryptjs
    .genSalt(10)
    .then(salt => bcryptjs.hash(password, salt))
    .then(hash => {
      User.create({
        name: name,
        email: email,
        password: hash
      })
    })
    .then(() => res.redirect('/'))
    .catch(err => console.log(err))
})
// logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/users/login')
  })
})

module.exports = router
