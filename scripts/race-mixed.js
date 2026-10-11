// consistency - race process on the same account at the same time
// upgrades are random since F2: check the gems and that each level moves by 0 or 1

const { newGuest, topup, gearup, readState, settle, report } = require('./lib')

const SLOTS = ['helmet', 'armor', 'weapon']

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
  const ok1 = report(
    '同時儲值 20 筆 × 100，並嘗試升級三件裝備（每次嘗試都扣 500）',
    before.currency + 20 * 100 - 3 * 500,
    after.currency,
  )
  const deltas = Object.fromEntries(SLOTS.map((s) => [s, after[s] - before[s]]))
  const ok2 = report(
    '每件裝備只試一次：等級變化只能是 0（失敗）或 1（成功）',
    true,
    SLOTS.every((s) => deltas[s] === 0 || deltas[s] === 1),
  )
  console.log(`   等級變化：${JSON.stringify(deltas)}`)
  process.exit(ok1 && ok2 ? 0 : 1)
})()
