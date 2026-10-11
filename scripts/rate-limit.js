// rate limit: writes over the per-user limit in one window get 429
// sends invalid amounts: counted before the route, which rejects them, so no data is written
// reads the same RATE_LIMIT_PER_USER as the server (default 120)

const crypto = require('crypto')
const { BASE, newGuest, report } = require('./lib')

const LIMIT = Number(process.env.RATE_LIMIT_PER_USER ?? 120)
const EXTRA = 10

const post = (cookie) =>
  fetch(`${BASE}/topup`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ amount: '0', topupId: crypto.randomUUID() }),
  })

;(async () => {
  if (LIMIT === 0) {
    console.log('RATE_LIMIT_PER_USER=0：限流已關閉，略過')
    process.exit(0)
  }
  const cookie = await newGuest()
  const statuses = []
  // sequential, so the count is deterministic
  for (let i = 0; i < LIMIT + EXTRA; i++)
    statuses.push((await post(cookie)).status)

  const limited = statuses.filter((s) => s === 429).length
  const firstLimited = statuses.indexOf(429)
  console.log(
    `   送出 ${statuses.length} 次：前 ${firstLimited} 次正常處理，之後 ${limited} 次回 429`,
  )

  const ok1 = report(`前 ${LIMIT} 次不會被限流`, LIMIT, firstLimited)
  const ok2 = report(`超過的 ${EXTRA} 次都回 429`, EXTRA, limited)

  const other = await newGuest()
  const otherStatus = (await post(other)).status
  const ok3 = report('其他帳號不受影響', true, otherStatus !== 429)

  process.exit(ok1 && ok2 && ok3 ? 0 : 1)
})()
