const mongoose = require('mongoose')
const Schema = mongoose.Schema
const userSchema = new Schema({
  name: {type: String, required: true},
  email: {type: String, required: true},
  password: {type: String, required: true},
  currency: { type: Number, required: true, default: 3000},
  helmet_lv: {type: Number, required: true, default: 1},
  armor_lv: {type: Number, required: true, default: 1},
  weapon_lv: {type: Number, required: true, default: 1},
  createdAt: {type: Date, default: Date.now}
})

module.exports = mongoose.model('eq_user', userSchema)
