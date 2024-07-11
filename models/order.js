const mongoose = require('mongoose')
const Schema = mongoose.Schema
const orderSchema = new Schema({
  name: {type: String, required: true},
  cost: {type: Number, required: true},
  userId: {
    type: mongoose.Types.ObjectId,
    ref: 'User'
  },
})

module.exports = mongoose.model('eq_order', orderSchema)
