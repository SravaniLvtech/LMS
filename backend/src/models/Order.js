const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Student
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },

  // Tutor
  tutor: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },

  // Course info
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  courseName: { type: String, trim: true },

  type: {
    type: String,
    enum: ['live_single', 'live_pack', 'video_course'],
    required: true,
  },
  subject: { type: String, required: true },

  // Pricing — base is INR before tax
  amountBeforeTax: { type: Number, required: true },   // e.g. 249
  taxRate: { type: Number, default: 2 },               // GST % (2%)
  taxAmount: { type: Number },                         // auto-computed: amountBeforeTax * taxRate / 100
  amountAfterTax: { type: Number },                    // auto-computed: amountBeforeTax + taxAmount
  amountInRupee: { type: Number },                     // = amountAfterTax (INR is base currency)
  amountInDollar: { type: Number },                    // auto-computed from exchange rate
  exchangeRate: { type: Number, default: 83.5 },       // 1 USD = INR (snapshot at order time)

  // Revenue split (on amountBeforeTax — tax is platform-collected)
  tutorShare: { type: Number },                        // 70% of amountBeforeTax
  platformShare: { type: Number },                     // 30% of amountBeforeTax

  sessionCount: { type: Number, default: 1 },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'refunded'],
    default: 'pending',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  transactionId: { type: String },
  paymentMethod: { type: String, default: 'easebuzz' },
  paidAt: { type: Date },

  scheduledDates: [{ type: Date }],
  cancelledBy: { type: String, enum: ['student', 'tutor', null], default: null },
  cancelledAt: { type: Date },
  refundAmount: { type: Number, default: 0 },
  notes: { type: String },
}, { timestamps: true });

// Auto-compute tax and currency fields before every save
orderSchema.pre('save', function (next) {
  if (this.isModified('amountBeforeTax') || this.isModified('taxRate') || this.isModified('exchangeRate') || this.isNew) {
    const base = this.amountBeforeTax || 0;
    const rate = this.taxRate || 18;
    const fx = this.exchangeRate || 83.5;

    this.taxAmount = Number((base * rate / 100).toFixed(2));
    this.amountAfterTax = Number((base + this.taxAmount).toFixed(2));
    this.amountInRupee = this.amountAfterTax;
    this.amountInDollar = Number((this.amountAfterTax / fx).toFixed(2));

    // Revenue split on pre-tax amount
    this.tutorShare = Number((base * 0.70).toFixed(2));
    this.platformShare = Number((base * 0.30).toFixed(2));
  }
  next();
});

// Pricing presets (pre-tax)
orderSchema.statics.priceFor = function (type) {
  const prices = {
    live_single:  { amountBeforeTax: 249,  sessionCount: 1 },
    live_pack:    { amountBeforeTax: 1599, sessionCount: 8 },
    video_course: { amountBeforeTax: 0,    sessionCount: 0 },
  };
  return prices[type] || prices.live_single;
};

module.exports = mongoose.model('Order', orderSchema);
