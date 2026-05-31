const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  courseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  tutorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  status: {
    type: String,
    enum: ['confirmed', 'cancelled', 'expired'],
    default: 'confirmed',
  },
}, { timestamps: true });

// Prevent duplicate subscriptions per student+course
subscriptionSchema.index({ courseId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
