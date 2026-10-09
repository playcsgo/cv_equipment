// repeat bug for topup with invalid amount

const { newGuest, postForm, readState, settle, report } = require('./lib')

const INVALID = ['-5000', '0', '1.5', '50001', 'abc', '']

;(async () => {
  const cookie = await newGuest()
  const before = await readState(cookie)

  for (const amount of INVALID) {
    await postForm(cookie, '/topup', { amount, topupId: crypto.randomUUID() })
  }

  const after = await settle(cookie)
  const ok = report(
    `送出不合法的金額 ${JSON.stringify(INVALID)}，餘額不應改變`,
    before.currency,
    after.currency,
  )
  process.exit(ok ? 0 : 1)
})()
