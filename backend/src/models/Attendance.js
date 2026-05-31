const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  sessionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Session',  required: true },
  courseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course',   required: true },
  tutorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor',    default: null },
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student',  default: null },
  role:       { type: String, enum: ['tutor', 'student'], required: true },
  joinedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

// ── Partial-filter indexes: each index only covers documents of its own role.
//
// Without partialFilterExpression, student records (which also carry tutorId
// for cross-reference) would be included in the tutor index — causing an E11000
// when two different students join the same session (same sessionId + tutorId,
// different studentId).
//
// With partialFilterExpression:
//  • Tutor index  → only role:'tutor' docs → one tutor join per session
//  • Student index→ only role:'student' docs → one join per student per session,
//                   many different students can join the same session freely

attendanceSchema.index(
  { sessionId: 1, tutorId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { role: 'tutor' } }
);

attendanceSchema.index(
  { sessionId: 1, studentId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { role: 'student' } }
);

const Attendance = mongoose.model('Attendance', attendanceSchema);

// Drop ALL previous index variants so Mongoose can recreate the correct ones.
// Each .catch(() => {}) silences "index not found" — safe to run on every start.
mongoose.connection.once('open', () => {
  const col = Attendance.collection;
  col.dropIndex('sessionId_1_tutorId_1').catch(() => {});
  col.dropIndex('sessionId_1_studentId_1').catch(() => {});
  col.dropIndex('sessionId_1_role_1_tutorId_1').catch(() => {});
  col.dropIndex('sessionId_1_role_1_studentId_1').catch(() => {});
});

module.exports = Attendance;
