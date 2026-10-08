const mongoose = require('mongoose')
const Schema = mongoose.Schema

// using _id as topupId as idempenton id to avoid duplicate process
const topupSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'done'], default: 'pending' },
    createdAt: { type: Date, default: Date.now, expires: 3600 },
  },
  { versionKey: false },
)

module.exports = mongoose.model('eq_topup', topupSchema)
