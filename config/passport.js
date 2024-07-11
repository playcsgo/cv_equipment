require('dotenv').config()
const User = require('../models/user')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const bcryptjs = require('bcryptjs')
const FacebookStrategy = require('passport-facebook')

module.exports = app => {
  // Middleware
  app.use(passport.initialize())
  app.use(passport.session())

  // LocalStrategy
  passport.use(new LocalStrategy({ usernameField: 'email', passReqToCallback: true }, (req, email, password, done) => {
    User.findOne({ email })
      .lean()
      .then(user => {
        if (!user) {
          return done(null, false, req.flash('warning_msg', '此信箱尚未註冊'))
        }
        return bcryptjs.compare(password, user.password).then(isMatch => {
          if(!isMatch) {
            return done(null, false, req.flash('warning_msg', '信箱密碼錯誤'))
          }
          return done(null, user)
        })
      })
      .catch(err => console.log(err))
  }));
  // facebook Strategy
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_APP_callbackURL,
    profileFields: ['email', 'displayName']
  },(accessToken, refreshToken, profile, done) => {
    const { name, email } = profile._json
    User.findOne({ email })
      .then(user => {
        if (user) return done(null, user)
        const randomPassword = Math.random().toString(36).slice(-8)
        bcryptjs
          .genSalt(10)
          .then(salt => bcryptjs.hash(randomPassword, salt))
          .then(hash => User.create({
            name,
            email,
            password: hash
          }))
          .then(user => done(null, user))
          .catch(err => console.log(err))
      })
  }
))

  // Sessions
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });
  passport.deserializeUser((id, done) => {
    User.findById(id)
      .lean()
      .then(user => done(null, user))
      .catch(err => done(err, null))
  });
}