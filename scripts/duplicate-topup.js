// idempotency
// should only process once with the same topup id (idempo)

const crypto = require('crypto')
const { newGuest, topup, readState, settle, report } = require('./lib')

;(async () => {
  const cookie = await newGuest()
  const before = await readState(cookie)
  const topupId = crypto.randomUUID()
  await topup(cookie, 1000, topupId)
  await settle(cookie)
  await topup(cookie, 1000, topupId) // resent with the same idempotency id
  const after = await settle(cookie)
  const ok = report(
    '同一個 topupId 送兩次，每次 1000',
    before.currency + 1000,
    after.currency,
  )
  process.exit(ok ? 0 : 1)
})()
