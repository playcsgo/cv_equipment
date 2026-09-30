require('dotenv').config()
const express = require('express')
const { engine } = require('express-handlebars')
const methodOverride = require('method-override')
const session = require('express-session')
const flash = require('connect-flash')
const RedisStore = require('connect-redis').default
const Redis = require('ioredis')
const routes = require('./routes')
const hbsHelpers = require('./hbsHelpers.js')
const usePassport = require('./config/passport')
require('./config/mongoose')

const app = express()
const PORT = process.env.PORT || 3000
const SESSION_TTL_S = 3600
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

app.set('trust proxy', 1)
app.engine('hbs', engine({ extname: 'hbs', defaultLayout: 'main', helpers: hbsHelpers }))
app.set('view engine', 'hbs')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(methodOverride('_method'))
app.use(session({
  store: new RedisStore({ client: redisClient, ttl: SESSION_TTL_S }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: SESSION_TTL_S * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}))
app.use(flash())
usePassport(app)
app.use((req, res, next) => {
  res.locals.user = req.user
  res.locals.success_msg = req.flash('success_msg')
  res.locals.warning_msg = req.flash('warning_msg')
  next()
})

app.use(routes)
app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`)
})
