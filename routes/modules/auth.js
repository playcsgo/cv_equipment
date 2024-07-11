const express = require('express')
const router = express.Router()
const passport = require('passport')

router.get('/facebook/callback', passport.authenticate('facebook', {
  successRedirect: '/',
  failureRedirect: '/users/login'
}))

module.exports = router
