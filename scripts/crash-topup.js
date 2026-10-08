// consistency
//  test worker unexpected shut down

const { newGuest, topup, readState, sleep, report } = require('./lib')
const N = Number(process.argv[2] || 10)
const WAIT_MS = Number(process.env.WAIT_MS || 25_000)

;(async () => {
  const cookie = await newGuest()
  const before = await readState(cookie)

  await Promise.all(Array.from({ length: N }, () => topup(cookie, 100)))
  console.log(
    `test sent ${N} process of topup, please shutdown worker in 3s, and reboot it`,
  )
  console.log(`check result after ${WAIT_MS / 1000}... `)

  await sleep(WAIT_MS)
  const after = await readState(cookie)
  const ok = report(
    `worker 中途當掉後，${N} 筆 x 100 是否全部入帳`,
    before.currency + N * 100,
    after.currency,
  )
  process.exit(ok ? 0 : 1)
})()
