const express = require('express')
const router = express.Router()

router.get('/', (req, res) => {
  const user = req.user
  res.render('home', { user })
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
