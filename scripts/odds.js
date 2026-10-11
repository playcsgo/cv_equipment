// upgrade odds (F2): N new guests each upgrade a Lv 1 helmet once; the success rate should match the config
// usage: node scripts/odds.js [N] (default 200)
// if the worker overrides the rates with UPGRADE_RATES, run this with the same env var

const { newGuest, gearup, readState, sleep, report } = require('./lib')
const { upgradeRate } = require('../config/game')

const N = Number(process.argv[2] || 200)
const BATCH = 20

;(async () => {
  const expected = upgradeRate(1)
  const results = []

  for (let i = 0; i < N; i += BATCH) {
    const size = Math.min(BATCH, N - i)
    const batch = await Promise.all(
      Array.from({ length: size }, async () => {
        const cookie = await newGuest()
        await gearup(cookie, 'helmet_lv')
        // every attempt costs 500: once the gems change, the worker is done
        for (let t = 0; t < 80; t++) {
          const s = await readState(cookie)
          if (s.currency !== 10000) return s.helmet === 2
          await sleep(250)
        }
        return null
      }),
    )
    results.push(...batch)
  }

  const done = results.filter((r) => r !== null)
  const successes = done.filter(Boolean).length
  const rate = successes / done.length
  // 4 standard deviations: a correct config almost never fails, a wrong one (100% or 50%) does
  const sigma = Math.sqrt((expected * (1 - expected)) / done.length)
  const tolerance = Math.max(4 * sigma, 0.02)

  console.log(
    `   ${done.length} 次嘗試（逾時 ${N - done.length} 次），成功 ${successes} 次，成功率 ${(rate * 100).toFixed(1)}%`,
  )
  const ok1 = report('全部嘗試都在時間內處理完', N, done.length)
  const ok2 = report(
    `Lv 1 → 2 成功率接近 ${expected * 100}%（容許 ±${(tolerance * 100).toFixed(1)}%）`,
    true,
    Math.abs(rate - expected) <= tolerance,
  )
  process.exit(ok1 && ok2 ? 0 : 1)
})()
