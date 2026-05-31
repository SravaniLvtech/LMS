const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  courseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  required: true, index: true },
  tutorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
}, { timestamps: true });

// Prevent the same course being added twice for the same student
cartSchema.index({ courseId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Cart', cartSchema);
