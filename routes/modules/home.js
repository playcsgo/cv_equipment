const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const Topup = require('../../models/topup')
const { MAX_LEVEL, SLOTS } = require('../../config/game')

router.get('/', async (req, res, next) => {
  try {
    const user = req.user
    // 還在處理中的儲值：頁面顯示「處理中」並輪詢狀態，完成後自動重新整理
    const pendingTopups = await Topup.find(
      { userId: user._id, status: 'pending' },
      'amount',
    ).lean()
    res.render('home', {
      user,
      topupId: crypto.randomUUID(), // 冪等鍵：同一個表單連點兩下會帶著同一個 id
      // idempotency key for gear upgrades: the page replaces it on every click, this one is the no-JS fallback
      levelupId: crypto.randomUUID(),
      pendingTopups,
      pendingTopupIds: pendingTopups.map((t) => t._id).join(' '),
      allMax: SLOTS.every((slot) => user[slot] >= MAX_LEVEL),
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
