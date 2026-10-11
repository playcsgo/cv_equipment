// write rate limit, sliding window counter:
// estimate = prev window count * (1 - elapsed / window) + current window count
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
const PER_USER = Number(process.env.RATE_LIMIT_PER_USER ?? 120)
const PER_IP = Number(process.env.RATE_LIMIT_PER_IP ?? 1_000)

// all layers in one round trip, atomic and all-or-nothing:
// if any layer is over its limit nothing is counted
// KEYS: cur1, prev1, cur2, prev2, ...  ARGV: weight, ttl, limit1, limit2, ...
const SLIDING_HIT = `
local weight = tonumber(ARGV[1])
local estimates = {}
local allowed = 1
for i = 1, #KEYS / 2 do
  local cur = tonumber(redis.call('GET', KEYS[2 * i - 1]) or '0')
  local prev = tonumber(redis.call('GET', KEYS[2 * i]) or '0')
  local estimate = prev * weight + cur
  estimates[i] = estimate
  if estimate + 1 > tonumber(ARGV[2 + i]) then allowed = 0 end
end
local result = {allowed}
for i = 1, #KEYS / 2 do
  if allowed == 1 then
    redis.call('INCR', KEYS[2 * i - 1])
    redis.call('PEXPIRE', KEYS[2 * i - 1], ARGV[2])
    estimates[i] = estimates[i] + 1
  end
  result[i + 1] = tostring(estimates[i])
end
return result
`

// layers: [{ key, limit }]
const hit = async (redis, layers, windowMs = WINDOW_MS, now = Date.now()) => {
  if (!redis.slidingHit) redis.defineCommand('slidingHit', { lua: SLIDING_HIT })
  const index = Math.floor(now / windowMs)
  const elapsed = now - index * windowMs
  const keys = layers.flatMap(({ key }) => [
    `${key}:${index}`,
    `${key}:${index - 1}`,
  ])
  const [allowed, ...estimates] = await redis.slidingHit(
    keys.length,
    ...keys,
    1 - elapsed / windowMs,
    windowMs * 2,
    ...layers.map(({ limit }) => limit),
  )
  return {
    allowed: allowed === 1,
    counts: estimates.map(Number),
    resetMs: windowMs - elapsed,
  }
}

// IPv6: count per /56, one user usually owns the whole block
const ipKey = (ip = '') => {
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  if (!ip.includes(':')) return ip
  const [head, tail = ''] = ip.split('%')[0].split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const full = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t].map(
    (x) => x.padStart(4, '0'),
  )
  return `${full.slice(0, 3).join(':')}:${full[3].slice(0, 2)}/56`
}

const onLimit = (req, res) => {
  const message = '操作太頻繁，請稍後再試'
  req.flash?.('warning_msg', message)
  const html = () =>
    res.send(`<p>${message}。</p><p><a href="/">回首頁</a></p>`)
  res.status(429).format({
    html,
    json: () => res.json({ error: message }),
    default: html,
  })
}

module.exports = (redis) => async (req, res, next) => {
  const layers = [
    { key: `rl:ip:${ipKey(req.ip)}`, limit: PER_IP },
    {
      key: `rl:user:${req.user?._id?.toString() ?? ipKey(req.ip)}`,
      limit: PER_USER,
    },
  ].filter(({ limit }) => limit > 0)
  if (req.method !== 'POST' || !layers.length) return next()

  try {
    const r = await hit(redis, layers)
    // headers show the tightest layer
    const remaining = layers.map(({ limit }, i) => limit - r.counts[i])
    const tightest = remaining.indexOf(Math.min(...remaining))
    const { limit } = layers[tightest]
    const reset = Math.ceil(r.resetMs / 1000)
    res.set('RateLimit-Policy', `${limit};w=${WINDOW_MS / 1000}`)
    res.set(
      'RateLimit',
      `limit=${limit}, remaining=${Math.max(0, Math.floor(remaining[tightest]))}, reset=${reset}`,
    )
    if (r.allowed) return next()
    res.set('Retry-After', String(reset)) // approx: end of the current window
    onLimit(req, res)
  } catch (err) {
    // fail open: a Redis error should not block writes
    console.error('[rateLimit]', err.message)
    next()
  }
}
module.exports.hit = hit
module.exports.ipKey = ipKey
