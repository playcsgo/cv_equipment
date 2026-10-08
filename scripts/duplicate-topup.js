// idempotency
// should only process once with the same topup id (idempo)

const crypto = require('crypto')
const { newGuest, topup, readState, settle, report } = require('./lib')

async function resendAfterDone() {
  const cookie = await newGuest()
  const before = await readState(cookie)
  const topupId = crypto.randomUUID()
  await topup(cookie, 1000, topupId)
  await settle(cookie)
  await topup(cookie, 1000, topupId) // resent with the same idempotency id
  const after = await settle(cookie)
  return report(
    '處理完之後，同一個 topupId 重送一次（1000）',
    before.currency + 1000,
    after.currency,
  )
}

async function doubleClick() {
  const cookie = await newGuest()
  const before = await readState(cookie)
  const topupId = crypto.randomUUID()

  await Promise.all([
    topup(cookie, 1000, topupId),
    topup(cookie, 1000, topupId),
  ])
  const after = await settle(cookie)

  return report(
    '同時送出兩次相同的 topupId（1000）',
    before.currency + 1000,
    after.currency,
  )
}

;(async () => {
  const ok1 = await resendAfterDone()
  const ok2 = await doubleClick()

  process.exit(ok1 && ok2 ? 0 : 1)
})()
