const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const Topup = require('../../models/topup')

const stateKey = (u) =>
  `${u.currency}-${u.helmet_lv}-${u.armor_lv}-${u.weapon_lv}`

router.get('/', async (req, res, next) => {
  try {
    const user = req.user
    // 還在處理中的儲值：頁面顯示「處理中」並輪詢狀態，完成後自動重新整理
    const pendingTopups = await Topup.find(
      { userId: user._id, status: 'pending' },
      'amount',
    ).lean()
    // 升級沒有獨立的狀態紀錄：gearup 會把「送出前的狀態」帶在網址上，
    // 目前狀態跟它一樣，代表 worker 還沒處理完
    const gearFrom =
      typeof req.query.gearFrom === 'string' ? req.query.gearFrom : null
    res.render('home', {
      user,
      topupId: crypto.randomUUID(), // 冪等鍵：同一個表單連點兩下會帶著同一個 id
      pendingTopups,
      pendingTopupIds: pendingTopups.map((t) => t._id).join(' '),
      awaitingGear:
        gearFrom !== null && gearFrom === stateKey(user) ? gearFrom : null,
    })
  } catch (err) {
    next(err)
  }
})

// 給前端輪詢用：目前的餘額與等級
router.get('/state', (req, res) => {
  const { currency, helmet_lv, armor_lv, weapon_lv } = req.user
  res.json({ currency, helmet_lv, armor_lv, weapon_lv })
})

module.exports = router
