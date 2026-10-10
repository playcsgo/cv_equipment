// 一次跑完所有重現腳本，結果寫進 scripts/logs/
// 用法：
//   pnpm run repro:all                    跑全部（crash 要手動操作 worker，不包含在內）
//   pnpm run repro:all --tag E1          log 檔名加上標籤
//   pnpm run repro:all race duplicate     只跑指定的腳本
// poison 在修好之前會讓 payment worker 當掉，所以排在最後

require('dotenv').config()
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const amqp = require('amqplib')
const { BASE } = require('./lib')

const SCRIPTS = {
  race: 'race-topup.js',
  mixed: 'race-mixed.js',
  duplicate: 'duplicate-topup.js',
  invalid: 'invalid-amount.js',
  get: 'get-side-effect.js',
  poison: 'poison.js',
}

const args = process.argv.slice(2).filter((a) => a !== '--') // pnpm 會把 -- 原樣傳進來
const tagIndex = args.indexOf('--tag')
const tag = tagIndex >= 0 ? args.splice(tagIndex, 2)[1] : ''
const names = args.length ? args : Object.keys(SCRIPTS)

const unknown = names.filter((n) => !SCRIPTS[n])
if (unknown.length) {
  console.error(
    `不認識的腳本：${unknown.join('、')}（可用：${Object.keys(SCRIPTS).join('、')}）`,
  )
  process.exit(1)
}

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
const logDir = path.join(__dirname, 'logs')
const logFile = path.join(logDir, `${stamp}${tag ? `_${tag}` : ''}.log`)
fs.mkdirSync(logDir, { recursive: true })

const lines = []
const log = (text = '') => {
  console.log(text)
  lines.push(text)
}

function gitInfo() {
  try {
    const commit = execSync('git log -1 --format="%h %s"', {
      encoding: 'utf8',
    }).trim()
    const dirty = execSync('git status --porcelain', {
      encoding: 'utf8',
    }).trim()
    return `${commit}${dirty ? '（有未 commit 的修改）' : ''}`
  } catch {
    return '（無法讀取 git）'
  }
}

// 先確認 web 和兩個 worker 都在跑，不然每支腳本都會失敗，看不出是 bug 還是環境沒開
async function preflight() {
  const problems = []
  try {
    await fetch(`${BASE}/`, { redirect: 'manual' })
  } catch {
    problems.push(`web 沒有回應（${BASE}）：pnpm run dev`)
  }

  try {
    const conn = await amqp.connect(
      process.env.CLOUDAMQP_URL || 'amqp://localhost',
    )
    conn.on('error', () => {})
    for (const [q, cmd] of [
      ['paymentQueue', 'pnpm run worker:payment'],
      ['levelupQueue', 'pnpm run worker:levelup'],
    ]) {
      const ch = await conn.createChannel()
      ch.on('error', () => {})
      const consumers = await ch
        .checkQueue(q)
        .then((s) => s.consumerCount)
        .catch(() => 0)
      if (consumers === 0) problems.push(`${q} 沒有 worker：${cmd}`)
    }
    await conn.close().catch(() => {})
  } catch {
    problems.push('連不上 RabbitMQ：docker compose up -d')
  }

  return problems
}

function run(name) {
  return new Promise((resolve) => {
    const start = Date.now()
    const child = spawn(
      process.execPath,
      [path.join(__dirname, SCRIPTS[name])],
      {
        env: process.env,
      },
    )
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    child.on('close', (code) => {
      resolve({
        name,
        code,
        output: output.trimEnd(),
        seconds: (Date.now() - start) / 1000,
      })
    })
  })
}

;(async () => {
  const problems = await preflight()
  if (problems.length) {
    console.error('環境還沒準備好：')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  log(`# 重現腳本結果 ${stamp}${tag ? ` [${tag}]` : ''}`)
  log(`commit：${gitInfo()}`)
  log()

  const results = []
  for (const name of names) {
    log(`## ${name}`)
    const r = await run(name)
    log(r.output)
    log(`（exit ${r.code}，${r.seconds.toFixed(1)} 秒）`)
    log()
    results.push(r)
  }

  log('## 總結')
  for (const r of results) {
    log(
      `${r.code === 0 ? '✅' : '❌'} ${r.name.padEnd(10)} ${r.seconds.toFixed(1)} 秒`,
    )
  }
  const passed = results.filter((r) => r.code === 0).length
  log(`${passed}／${results.length} 通過`)
  if (!args.length) log('crash 要手動關 worker，請另外跑：pnpm run repro:crash')

  fs.writeFileSync(logFile, lines.join('\n') + '\n')
  console.log(`\nlog 已寫入 ${path.relative(process.cwd(), logFile)}`)
  process.exit(passed === results.length ? 0 : 1)
})()
