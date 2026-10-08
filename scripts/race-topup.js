// race

const { newGuest, topup, readState, settle, report } = require('./lib')

const N = Number(process.argv[2] || 50)

;(async () => {
  const cookie = await newGuest()
  const before = await readState(cookie)
  await Promise.all(Array.from({ length: N }, () => topup(cookie, 100)))
  const after = await settle(cookie)
  const ok = report(
    `同時儲值 ${N} 筆 × 100`,
    before.currency + N * 100,
    after.currency,
  )
  process.exit(ok ? 0 : 1)
})()
