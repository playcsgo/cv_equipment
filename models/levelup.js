const mongoose = require('mongoose')
const Schema = mongoose.Schema

// one upgrade attempt; _id is the levelupId sent by the form (idempotency key)
// - the unique _id rejects resends and double clicks
// - status moves pending -> done once; the dice result is stored on done and never re-rolled
const levelupSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    slot: { type: String, required: true },
    status: { type: String, enum: ['pending', 'done'], default: 'pending' },
    // success: upgraded, fail: charged but not upgraded, rejected: not enough gems or max level (not charged)
    result: { type: String, enum: ['success', 'fail', 'rejected'] },
    fromLv: Number,
    toLv: Number,
    createdAt: { type: Date, default: Date.now, expires: 3600 }, // demo data expires after an hour
  },
  { versionKey: false },
)

module.exports = mongoose.model('eq_levelup', levelupSchema)
