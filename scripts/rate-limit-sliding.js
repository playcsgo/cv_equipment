// sliding window counter (talks to Redis directly, fake clock)
// limit 5 per 1s window; 5 hits at the end of window 0, then:
// - 50 ms into window 1: prev weight 0.95 -> 4.75, a fixed window would allow 5 more
// - 500 ms into window 1: prev weight 0.5 -> 2.5, so only 2 more fit
// two layers share one script: a rejected hit counts on neither layer

require('dotenv').config()
const crypto = require('crypto')
const Redis = require('ioredis')
const { hit, ipKey } = require('../middleware/rateLimit')
const { report } = require('./lib')

const LIMIT = 5
const WINDOW = 1000

;(async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
  const key = `rl:test:${crypto.randomUUID()}`
  const t0 = Math.floor(Date.now() / WINDOW) * WINDOW
  const burst = async (layers, n, now) => {
    let allowed = 0
    for (let i = 0; i < n; i++) {
      if ((await hit(redis, layers, WINDOW, now)).allowed) allowed++
    }
    return allowed
  }
  const one = [{ key, limit: LIMIT }]

  const ok1 = report(
    'window 0 結尾送 5 次：全部通過',
    5,
    await burst(one, 5, t0 + 900),
  )
  const ok2 = report(
    '跨到 window 1 第 50ms 再送 5 次：全部擋下（固定窗口會全部放行）',
    0,
    await burst(one, 5, t0 + WINDOW + 50),
  )
  const ok3 = report(
    'window 1 第 500ms 再送 5 次：上一窗口權重剩 0.5，只放行 2 次',
    2,
    await burst(one, 5, t0 + WINDOW + 500),
  )

  // tight layer (limit 2) + loose layer (limit 100)
  const tight = `rl:test:${crypto.randomUUID()}`
  const loose = `rl:test:${crypto.randomUUID()}`
  const two = [
    { key: loose, limit: 100 },
    { key: tight, limit: 2 },
  ]
  const passed = await burst(two, 5, t0 + 100)
  const looseCount = Number(await redis.get(`${loose}:${t0 / WINDOW}`))
  const ok4 = report(
    '兩層一起算：緊的那層上限 2，送 5 次只放行 2 次',
    2,
    passed,
  )
  const ok5 = report(
    '被擋下的 3 次，寬的那層也不計數（全有或全無）',
    2,
    looseCount,
  )

  const ok6 = report(
    'IPv6 同一個 /56 算同一個人',
    ipKey('2001:db8:1:ab12::1'),
    ipKey('2001:db8:1:abff:ffff::9'),
  )

  await redis.quit()
  process.exit(ok1 && ok2 && ok3 && ok4 && ok5 && ok6 ? 0 : 1)
})()
