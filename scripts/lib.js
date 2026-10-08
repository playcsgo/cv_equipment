const crypto = require('crypto')
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function newGuest() {
  const res = await fetch(`${BASE}/`, { redirect: 'manual' })
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  if (!cookie)
    throw new Error(`No Session Cookie!!, need to check web BASE status`)

  return cookie
}

function postForm(cookie, path, fields) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })
}

async function topup(cookie, amount, topupId = crypto.randomUUID()) {
  const res = await postForm(cookie, '/topup', {
    amount: String(amount),
    topupId,
  })
  return res.status
}

async function gearup(cookie, slot) {
  const res = await fetch(`${BASE}/gearup/${slot}`, {
    redirect: 'manual', // required ?
    headers: { cookie },
  })
  return res.status
}

async function readState(cookie) {
  const html = await (await fetch(`${BASE}/`, { headers: { cookie } })).text() //.text() ?
  const num = (re) => Number((html.match(re) || [])[1])

  return {
    currency: num(/fa-gem"><\/i>\s*(-?\d+)/),
    helmet: num(/helmet_(\d)\.png/),
    armor: num(/armor_(\d)\.png/),
    weapon: num(/weapon_(\d)\.png/),
  }
}

async function settle(cookie, { stableMs = 2_000, timeoutMs = 20_000 } = {}) {
  const start = Date.now()
  let last = JSON.stringify(await readState(cookie))
  let stableSince = Date.now()

  while (Date.now() - start < timeoutMs) {
    await sleep(250)
    const now = JSON.stringify(await readState(cookie))
    if (now !== last) {
      last = now
      stableSince = Date.now()
    } else if (Date.now() - stableSince >= stableMs) {
      break
    }
  }

  return JSON.parse(last)
}

function report(label, expected, actual) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  console.log(`${ok ? '✅' : '❌'} ${label}`)
  console.log(`   預期：${JSON.stringify(expected)}`)
  console.log(`   實際：${JSON.stringify(actual)}`)
  return ok
}

module.exports = {
  BASE,
  sleep,
  newGuest,
  postForm,
  topup,
  gearup,
  readState,
  settle,
  report,
}
