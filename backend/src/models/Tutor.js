const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
  teachingQuality: { type: Number, default: 0, min: 0, max: 5 },
  punctuality: { type: Number, default: 0, min: 0, max: 100 },
  communication: { type: Number, default: 0, min: 0, max: 5 },
  studentProgress: { type: Number, default: 0, min: 0, max: 5 },
  rebookRate: { type: Number, default: 0, min: 0, max: 100 },
  completionRate: { type: Number, default: 0, min: 0, max: 100 },
  noShowRate: { type: Number, default: 0, min: 0, max: 100 },
}, { _id: false });

const tutorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: String,
  qualification: String,
  experience: { type: Number, default: 0 },
  subjects: [{ type: String }],
  status: {
    type: String,
    enum: ['active', 'pending_approval', 'suspended', 'flagged'],
    default: 'pending_approval',
  },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalSessions: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  pendingPayout: { type: Number, default: 0 },
  performance: { type: performanceSchema, default: () => ({}) },
  profileImage: { type: String, trim: true },
  warningCount: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now },
  // rating is maintained automatically by Review model post-save hook
}, { timestamps: true });

module.exports = mongoose.model('Tutor', tutorSchema);
