// upgrade idempotency (F2): the same levelupId charges once and rolls once

const crypto = require('crypto')
const { newGuest, gearup, readState, settle, report } = require('./lib')

const check = async (label, send) => {
  const cookie = await newGuest()
  const before = await readState(cookie)
  await send(cookie, crypto.randomUUID())
  const after = await settle(cookie)
  const helmetDelta = after.helmet - before.helmet
  const ok1 = report(
    `${label}：只扣一次 500`,
    before.currency - 500,
    after.currency,
  )
  const ok2 = report(
    `${label}：頭盔最多 +1`,
    true,
    helmetDelta === 0 || helmetDelta === 1,
  )
  return ok1 && ok2
}

;(async () => {
  const ok1 = await check(
    '處理完之後重送同一個 levelupId',
    async (cookie, id) => {
      await gearup(cookie, 'helmet_lv', id)
      await settle(cookie)
      await gearup(cookie, 'helmet_lv', id)
    },
  )
  const ok2 = await check('同時送出兩次同一個 levelupId', (cookie, id) =>
    Promise.all([
      gearup(cookie, 'helmet_lv', id),
      gearup(cookie, 'helmet_lv', id),
    ]),
  )
  process.exit(ok1 && ok2 ? 0 : 1)
})()
