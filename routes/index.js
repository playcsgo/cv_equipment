const express = require('express')
const router = express.Router()
const home = require('./modules/home')
const users = require('./modules/users')
const { authenticator } = require('../middleware/auth')
const auth = require('./modules/auth')
const topup = require('./modules/topup')
const gearup = require('./modules/gearup')

router.use('/auth', auth)
router.use('/users', users)
router.use('/topup', authenticator, topup)
router.use('/gearup', authenticator, gearup)
router.use('/', authenticator, home)

module.exports = router
