// 自動跑需要「關 worker／重啟 RabbitMQ／停 Mongo」的情境，結果寫進 scripts/logs/
// 這支腳本會自己啟動、關閉 payment worker，所以執行前要先停掉你開的 payment worker
// （web 和 levelup worker 照常開著；broker-restart 會讓 levelup worker 斷線結束，跑完要重開）
// 用法：
//   pnpm run repro:chaos                     跑全部
//   pnpm run repro:chaos --tag E5            log 檔名加上標籤
//   pnpm run repro:chaos crash retry         只跑指定的情境

require('dotenv').config()
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const amqp = require('amqplib')
const { BASE, sleep, newGuest, topup, readState, settle } = require('./lib')

const ROOT = path.join(__dirname, '..')
const QUEUE = 'paymentQueue'
const AMQP_URL = process.env.CLOUDAMQP_URL || 'amqp://localhost'

const args = process.argv.slice(2).filter((a) => a !== '--')
const tagIndex = args.indexOf('--tag')
const tag = tagIndex >= 0 ? args.splice(tagIndex, 2)[1] : ''

// ---------- 輸出與 log ----------

const lines = []
const log = (text = '') => {
  console.log(text)
  lines.push(text)
}

const check = (label, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  log(`${ok ? '✅' : '❌'} ${label}`)
  log(`   預期：${JSON.stringify(expected)}`)
  log(`   實際：${JSON.stringify(actual)}`)
  return ok
}

// ---------- 外部系統 ----------

const docker = (cmd) =>
  execSync(`docker compose ${cmd}`, { cwd: ROOT, stdio: 'ignore' })

// 每次查詢都開新連線：RabbitMQ 重啟時舊連線會斷
async function queueStats() {
  const conn = await amqp.connect(AMQP_URL)
  conn.on('error', () => {})
  try {
    const ch = await conn.createChannel()
    const { messageCount, consumerCount } = await ch.checkQueue(QUEUE)
    return { ready: messageCount, consumers: consumerCount }
  } finally {
    await conn.close().catch(() => {})
  }
}

async function waitFor(desc, fn, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return true
    } catch {}
    await sleep(250)
  }
  log(`   （等待逾時：${desc}）`)
  return false
}

// ---------- payment worker ----------

let worker = null
let mongoStopped = false

function startWorker(env = {}) {
  const proc = spawn(process.execPath, ['worker/worker-payment.js'], {
    cwd: ROOT,
    env: { ...process.env, ...env },
  })
  proc.output = ''
  proc.stdout.on('data', (d) => (proc.output += d))
  proc.stderr.on('data', (d) => (proc.output += d))
  proc.exited = new Promise((r) => proc.on('exit', r))
  worker = proc
  return waitFor(
    'worker 開始接收訊息',
    async () => (await queueStats()).consumers > 0,
    15_000,
  )
}

async function killWorker(signal = 'SIGKILL') {
  if (!worker) return
  worker.kill(signal)
  await worker.exited
  worker = null
}

const workerLogHas = (re) => worker && re.test(worker.output)

// ---------- 情境 ----------

// E2：worker 處理到一半被殺掉，沒 ack 的訊息要回到 queue，重啟後全部入帳
async function crash() {
  const N = 10
  await startWorker({ WORKER_DELAY_MS: '3000' })
  const cookie = await newGuest()
  const before = await readState(cookie)

  await Promise.all(Array.from({ length: N }, () => topup(cookie, 100)))
  // Ready 變 0 = worker 已經拿走（都還在 sleep，沒有 ack）
  await waitFor(
    'worker 拿走全部訊息',
    async () => (await queueStats()).ready === 0,
    5_000,
  )
  await killWorker('SIGKILL')
  log(`   已在處理途中 kill -9 worker`)

  let ready = 0
  await waitFor(
    '訊息回到 queue',
    async () => (ready = (await queueStats()).ready) === N,
    5_000,
  )
  const ok1 = check('worker 被殺掉後，沒 ack 的訊息回到 Ready', N, ready)

  await startWorker()
  const after = await settle(cookie)
  await killWorker('SIGTERM')
  const ok2 = check(
    `重啟 worker 後 ${N} 筆 × 100 全部入帳`,
    before.currency + N * 100,
    after.currency,
  )
  return ok1 && ok2
}

// E5：處理途中 Mongo 停掉（暫時性錯誤），worker 要延遲重試，Mongo 回來後入帳
async function retry() {
  await startWorker({ WORKER_DELAY_MS: '5000' })
  const cookie = await newGuest()
  const before = await readState(cookie)

  await topup(cookie, 100)
  await waitFor(
    'worker 拿到訊息',
    async () => (await queueStats()).ready === 0,
    5_000,
  )
  docker('stop -t 1 mongo')
  mongoStopped = true
  log('   worker 處理途中停掉 mongo')

  // Mongo 停著直到真的出現一次失敗（driver 會先等 server selection，可能要幾十秒）
  const failed = await waitFor(
    'worker 回報失敗並排程重試',
    () => workerLogHas(/failed 1 times/),
    90_000,
  )
  docker('start mongo')
  mongoStopped = false
  log('   mongo 已重新啟動')

  const credited = await waitFor(
    '重試成功入帳',
    () => workerLogHas(/\[topup\].*\+100/),
    90_000,
  )
  await waitFor(
    'web 讀得到資料',
    async () => (await readState(cookie)).currency > 0,
    30_000,
  )
  const after = await settle(cookie)
  const toDlq = workerLogHas(/DLQ/)
  await killWorker('SIGTERM')

  const ok1 = check('暫時性錯誤有觸發重試', true, failed)
  const ok2 = check('沒有被送進 DLQ', false, toDlq)
  const ok3 = check(
    'Mongo 回來後重試成功，+100 入帳',
    before.currency + 100,
    after.currency,
  )
  return credited && ok1 && ok2 && ok3
}

// E3：RabbitMQ 重啟，queue 裡的訊息要還在，web 要自動重連
async function brokerRestart() {
  const cookie = await newGuest()
  const before = await readState(cookie)

  await Promise.all(Array.from({ length: 5 }, () => topup(cookie, 100)))
  const readyBefore = (await queueStats()).ready

  docker('restart rabbitmq')
  await waitFor(
    'RabbitMQ 恢復連線',
    async () => (await queueStats()) !== null,
    60_000,
  )
  const readyAfter = (await queueStats()).ready
  log(`   重啟前 Ready ${readyBefore} 則，重啟後 ${readyAfter} 則`)

  const status = await topup(cookie, 100)
  await startWorker()
  const after = await settle(cookie)
  await killWorker('SIGTERM')

  const ok1 = check('重啟後訊息還在 queue 裡', readyBefore, readyAfter)
  const ok2 = check('重啟後 web 還送得出訊息（302）', 302, status)
  const ok3 = check(
    '重啟前 5 筆＋重啟後 1 筆全部入帳',
    before.currency + 600,
    after.currency,
  )
  return ok1 && ok2 && ok3
}

const SCENARIOS = { crash, retry, 'broker-restart': brokerRestart }

// ---------- 主流程 ----------

async function preflight() {
  const problems = []
  try {
    await fetch(`${BASE}/`, { redirect: 'manual' })
  } catch {
    problems.push(`web 沒有回應（${BASE}）：pnpm run dev`)
  }
  try {
    if ((await queueStats()).consumers > 0) {
      problems.push(
        `${QUEUE} 已經有 worker：請先停掉你開的 payment worker（這支腳本會自己啟動）`,
      )
    }
  } catch {
    problems.push(
      `連不上 RabbitMQ 或 ${QUEUE} 不存在：docker compose up -d，並先啟動一次 payment worker`,
    )
  }
  try {
    execSync('docker compose ps', { cwd: ROOT, stdio: 'ignore' })
  } catch {
    problems.push('無法執行 docker compose')
  }
  return problems
}

// 中途出錯或按 Ctrl+C 也要把環境還原：關掉 worker、把 mongo 開回來
async function cleanup() {
  if (worker) await killWorker('SIGKILL').catch(() => {})
  if (mongoStopped) {
    try {
      docker('start mongo')
      mongoStopped = false
    } catch {}
  }
}
process.on('SIGINT', async () => {
  await cleanup()
  process.exit(130)
})

;(async () => {
  const names = args.length ? args : Object.keys(SCENARIOS)
  const unknown = names.filter((n) => !SCENARIOS[n])
  if (unknown.length) {
    console.error(
      `不認識的情境：${unknown.join('、')}（可用：${Object.keys(SCENARIOS).join('、')}）`,
    )
    process.exit(1)
  }

  const problems = await preflight()
  if (problems.length) {
    console.error('環境還沒準備好：')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  const pad = (n) => String(n).padStart(2, '0')
  const now = new Date()
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  log(`# 自動故障情境 ${stamp}${tag ? ` [${tag}]` : ''}`)
  log()

  const results = []
  for (const name of names) {
    log(`## ${name}`)
    const start = Date.now()
    let ok = false
    try {
      ok = await SCENARIOS[name]()
    } catch (err) {
      log(`❌ 執行失敗：${err.message}`)
    }
    const workerOutput = worker?.output
    await cleanup()
    if (!ok && workerOutput)
      log(`--- worker 輸出 ---\n${workerOutput.trimEnd()}`)
    const seconds = (Date.now() - start) / 1000
    log(`（${seconds.toFixed(1)} 秒）`)
    log()
    results.push({ name, ok, seconds })
  }

  log('## 總結')
  for (const r of results)
    log(`${r.ok ? '✅' : '❌'} ${r.name.padEnd(15)} ${r.seconds.toFixed(1)} 秒`)
  const passed = results.filter((r) => r.ok).length
  log(`${passed}／${results.length} 通過`)
  if (names.includes('broker-restart')) {
    log('提醒：RabbitMQ 重啟會讓你開著的 levelup worker 斷線結束，請重新啟動它')
  }

  const logDir = path.join(__dirname, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, `${stamp}${tag ? `_${tag}` : ''}_chaos.log`)
  fs.writeFileSync(logFile, lines.join('\n') + '\n')
  console.log(`\nlog 已寫入 ${path.relative(process.cwd(), logFile)}`)
  process.exit(passed === results.length ? 0 : 1)
})()
