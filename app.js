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
const game = require('./config/game')
const db = require('./config/mongoose')
const { closeConnection } = require('./que/queue')

const app = express()
const PORT = process.env.PORT || 3000
const SESSION_TTL_S = 3600
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

app.set('trust proxy', 1)

// for health check
let shuttingDown = false
app.get('/healthz', (req, res) => res.send('ok'))
app.get('/readyz', async (req, res) => {
  if (shuttingDown) return res.status(503).send('shutting down')
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 2000),
  )
  try {
    await Promise.race([
      Promise.all([db.db.admin().ping(), redisClient.ping()]),
      timeout,
    ])
    res.send('ok')
  } catch (err) {
    res.status(503).send('not ready')
  }
})

app.engine(
  'hbs',
  engine({ extname: 'hbs', defaultLayout: 'main', helpers: hbsHelpers }),
)
app.set('view engine', 'hbs')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(methodOverride('_method'))
app.use(
  session({
    store: new RedisStore({ client: redisClient, ttl: SESSION_TTL_S }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_TTL_S * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  }),
)
app.use(flash())
usePassport(app)
app.use((req, res, next) => {
  res.locals.user = req.user
  res.locals.success_msg = req.flash('success_msg')
  res.locals.warning_msg = req.flash('warning_msg')
  res.locals.game = game
  next()
})

app.use(routes)
const server = app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`)
})

// shutdown gracefully
const shutdown = async (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`收到 ${signal}：停止接收新的請求，等待處理中的請求完成…`)
  setTimeout(() => {
    console.error('超過 10 秒仍未完成，強制結束')
    process.exit(1)
  }, 10000).unref()
  await new Promise((resolve) => server.close(resolve))
  await Promise.allSettled([db.close(), redisClient.quit(), closeConnection()])
  console.log('已安全關閉')
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
