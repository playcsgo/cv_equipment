// find the response time, for setting of polling interval
// node scripts/latency.js
const { newGuest, topup, gearup } = require('./lib')

async function measure(fn, times = 10) {
  let total = 0
  for (let i = 0; i < times; i++) {
    const start = performance.now()
    await fn()
    total += performance.now() - start
  }
  return Math.round(total / times)
}

;(async () => {
  const cookie = await newGuest()
  console.log(`儲值平均回應時間：${await measure(() => topup(cookie, 100))} ms`)
  console.log(
    `升級平均回應時間：${await measure(() => gearup(cookie, 'reset'))} ms`,
  )
})()
