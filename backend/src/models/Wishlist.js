const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  courseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  required: true, index: true },
  tutorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
}, { timestamps: true });

// Prevent the same course being saved twice for the same student
wishlistSchema.index({ courseId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
