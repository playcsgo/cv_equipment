const express = require('express')
const router = express.Router()
const home = require('./modules/home')
const topup = require('./modules/topup')
const gearup = require('./modules/gearup')
const { authenticator } = require('../middleware/auth')
const guest = require('../middleware/guest')

router.use('/topup', authenticator, topup)
router.use('/gearup', authenticator, gearup)
router.use('/', guest, home)

module.exports = router
