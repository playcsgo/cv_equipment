const express = require('express')
const router = express.Router()
const Topup = require('../../models/topup')

// RabbitMQ
const { enqueue } = require('../../que/queue')

const MAX_TOPUP = 50000
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (req, res, message) => {
  req.flash('warning_msg', message)
  res.redirect('/')
}

router.post('/', async (req, res) => {
  const userId = req.user._id
  const { topupId } = req.body
  const amount = +req.body.amount

  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TOPUP) {
    return fail(req, res, `儲值金額必須是 1 到 ${MAX_TOPUP} 的整數`)
  }
  if (typeof topupId !== 'string' || !UUID_RE.test(topupId)) {
    return fail(req, res, '請重新整理頁面後再試一次')
  }

  try {
    let topup
    try {
      topup = await Topup.create({ _id: topupId, userId, amount })
    } catch (err) {
      if (err.code !== 11_000) throw err

      topup = await Topup.findById(topupId)
      if (!topup || !topup.userId.equals(userId) || topup.amount !== amount) {
        return fail(req, res, 'invalid topup, please reload the page first')
      }
      if (topup.status === 'done') {
        return fail(req, res, 'duplicate topup action')
      }
    }
    await enqueue('paymentQueue', JSON.stringify({ topupId: topup._id }), {
      messageId: topup._id,
    })
    // 送進 queue 就馬上回應；首頁會顯示「儲值處理中」並輪詢 GET /topup/:id
    res.redirect('/')
  } catch (err) {
    console.error('[topup.js]', err)
    fail(req, res, 'system busy, please try later')
  }
})

// 儲值處理狀態（首頁輪詢用）。不是自己的儲值一律 404，不透露它存在
router.get('/:id', async (req, res) => {
  const topup = await Topup.findOne(
    { _id: req.params.id, userId: req.user._id },
    'status',
  ).lean()
  if (!topup) return res.status(404).json({ error: 'not_found' })
  res.json({ status: topup.status })
})

module.exports = router
