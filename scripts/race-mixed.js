// consistency - race process on the same account at the same time

const { newGuest, topup, gearup, readState, settle, report } = require('./lib')

;(async () => {
  const cookie = await newGuest()
  const before = await readState(cookie)

  await Promise.all([
    ...Array.from({ length: 20 }, () => topup(cookie, 100)),
    gearup(cookie, 'helmet_lv'),
    gearup(cookie, 'armor_lv'),
    gearup(cookie, 'weapon_lv'),
  ])

  const after = await settle(cookie)
  const expected = {
    currency: before.currency + 20 * 100 - 3 * 500,
    helmet: before.helmet + 1,
    armor: before.armor + 1,
    weapon: before.weapon + 1,
  }

  const ok = report('同時儲值 20 筆 × 100，並升級三件裝備', expected, after)
  process.exit(ok ? 0 : 1)
})()
