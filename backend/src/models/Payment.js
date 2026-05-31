const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  tutor: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  amount: { type: Number, required: true },
  sessionCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  method: { type: String, default: 'easebuzz' },
  transactionId: String,
  processedAt: Date,
  weekOf: Date,
  failureReason: String,
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
