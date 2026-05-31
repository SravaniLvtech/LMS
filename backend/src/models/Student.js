const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  tutor: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
  subject: String,
  scheduledAt: { type: Date, required: true },
  duration: { type: Number, default: 60 },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled_tutor', 'cancelled_student', 'no_show'],
    default: 'scheduled',
  },
  studentAttendance: {
    type: String,
    enum: ['present', 'partial', 'absent', 'holiday', null],
    default: null,
  },
  tutorAttendance: {
    type: String,
    enum: ['present', 'late', 'no_show', 'future', null],
    default: null,
  },
  tutorDelayMinutes: { type: Number, default: 0 },
  amount: { type: Number, default: 249 },
  tutorShare: { type: Number, default: 174.30 },
  platformShare: { type: Number, default: 74.70 },
  refunded: { type: Boolean, default: false },
  type: {
    type: String,
    enum: ['live_single', 'live_pack', 'video_course'],
    default: 'live_single',
  },
});

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  parentName: String,
  parentEmail: String,
  parentPhone: String,
  phone: String,
  grade: String,
  subjects: [String],
  profileImage: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  sessions: [sessionSchema],
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
