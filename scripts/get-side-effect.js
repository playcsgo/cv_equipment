const { BASE, newGuest, readState, settle, report } = require('./lib')

;(async () => {
  const cookie = await newGuest()
  const before = await readState(cookie)
  // 模擬瀏覽器預先載入連結：單純 GET 這個網址
  const res = await fetch(`${BASE}/gearup/helmet_lv`, {
    redirect: 'manual',
    headers: { cookie },
  })
  console.log(`GET /gearup/helmet_lv → ${res.status}`)
  const after = await settle(cookie)
  const ok = report('單純 GET 不應該改變任何資料', before, after)
  process.exit(ok ? 0 : 1)
})()
