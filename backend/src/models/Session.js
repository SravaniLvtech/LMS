const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  // ── Course info (denormalised for quick access) ─────────────────────────
  courseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  courseName:  { type: String, required: true, trim: true },
  courseImage: { type: String, trim: true },
  level:       { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
  category:    { type: String, trim: true },
  subject:     { type: String, trim: true },
  grades:      [{ type: String, trim: true }],
  tags:        [{ type: String, trim: true }],

  // ── Instructor ───────────────────────────────────────────────────────────
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', index: true },

  // ── Session position ─────────────────────────────────────────────────────
  sessionNumber: { type: Number, required: true },   // 1-based index in the course
  totalSessions: { type: Number, required: true },   // total sessions in the course

  // ── Schedule ─────────────────────────────────────────────────────────────
  date:            { type: Date, required: true },   // calendar date (midnight UTC of the session day)
  startTime:       { type: String, required: true }, // "09:00"  (local in timezone)
  endTime:         { type: String, required: true }, // "10:00"  (local in timezone)
  startDateTime:   { type: Date, required: true },   // full UTC instant
  endDateTime:     { type: Date, required: true },   // full UTC instant
  timezone:        { type: String, default: 'Asia/Kolkata' },
  durationMinutes: { type: Number, default: 60 },

  // ── Slots / Enrollment ───────────────────────────────────────────────────
  maxSlots:        { type: Number, default: 50 },
  availableSlots:  { type: Number, default: 50 },
  groupMemberList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],

  // ── Status ───────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'scheduled',
  },

  // ── Optional extras ──────────────────────────────────────────────────────
  meetingLink: { type: String, trim: true },
  notes:       { type: String, trim: true },
  price:       { type: Number, default: 0 },      // per-session price (if sold individually)
}, { timestamps: true });

// Virtual: is this session right now?
sessionSchema.virtual('isLive').get(function () {
  const now = new Date();
  return this.startDateTime <= now && this.endDateTime >= now;
});

// Virtual: slots taken
sessionSchema.virtual('enrolledCount').get(function () {
  return this.groupMemberList.length;
});

sessionSchema.set('toJSON', { virtuals: true });
sessionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Session', sessionSchema);
