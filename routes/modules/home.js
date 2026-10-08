const express = require('express')
const router = express.Router()
const crypto = require('crypto')

router.get('/', (req, res) => {
  const user = req.user
  res.render('home', { user, topupId: crypto.randomUUID() })
  // Expense.find({ userId })
  //   .lean()
  //   .then(expenses => {
  //     let totalAmount = 0
  //     expenses.forEach(expense => {
  //       totalAmount += expense.cost
  //       expense.date = expense.date.toISOString().split('T')[0].replace(/-/g, '/')
  //     })
  //     res.render('index', { expenses, totalAmount })
  //   })
  //   .catch(err => console.log(err))
})

module.exports = router
