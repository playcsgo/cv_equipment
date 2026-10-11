// upgrade result API (F3): submit with fetch -> 202 { id } -> poll GET /gearup/:id until done
// checks: the result matches the actual gems and level; someone else's record is a 404

const crypto = require('crypto')
const { BASE, newGuest, readState, sleep, report } = require('./lib')

const postJson = (cookie, slot, levelupId) =>
  fetch(`${BASE}/gearup/${slot}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ levelupId }),
  })

const getResult = (cookie, id) =>
  fetch(`${BASE}/gearup/${id}`, { headers: { cookie } }).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }))

;(async () => {
  const cookie = await newGuest()
  const other = await newGuest()
  const before = await readState(cookie)
  const levelupId = crypto.randomUUID()

  const res = await postJson(cookie, 'helmet_lv', levelupId)
  const body = await res.json()
  const ok1 = report(
    'fetch 送出回 202 和這次升級的 id',
    { status: 202, id: levelupId },
    { status: res.status, id: body.id },
  )

  let result = null
  for (let i = 0; i < 40 && !result; i++) {
    await sleep(250)
    const r = await getResult(cookie, levelupId)
    if (r.body.status === 'done') result = r.body
  }
  const after = await readState(cookie)
  console.log(`   結果：${JSON.stringify(result)}`)

  const expected = result && {
    currency: before.currency - 500,
    helmet: result.result === 'success' ? before.helmet + 1 : before.helmet,
  }
  const ok2 = report(
    '結果是 success 或 fail',
    true,
    ['success', 'fail'].includes(result?.result),
  )
  const ok3 = report('結果和實際的錢、等級對得上', expected, {
    currency: after.currency,
    helmet: after.helmet,
  })

  const peek = await getResult(other, levelupId)
  const ok4 = report('別人的升級紀錄回 404', 404, peek.status)

  process.exit(ok1 && ok2 && ok3 && ok4 ? 0 : 1)
})()
