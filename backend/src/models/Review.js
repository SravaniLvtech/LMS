const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  tutor:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor',   required: true },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  index: true },
  parentName: { type: String, required: true },
  rating:   { type: Number, required: true, min: 1, max: 5 },
  review:   { type: String, required: true, trim: true },
  topic:    { type: String, trim: true },
  sessionDate: { type: Date },
}, { timestamps: true });

// One review per student per course
reviewSchema.index({ student: 1, courseId: 1 }, { unique: true, sparse: true });

// After save, recompute average rating on the Tutor
reviewSchema.post('save', async function () {
  const Tutor = mongoose.model('Tutor');
  const result = await mongoose.model('Review').aggregate([
    { $match: { tutor: this.tutor } },
    { $group: { _id: '$tutor', avgRating: { $avg: '$rating' } } },
  ]);
  const avgRating = result.length ? Number(result[0].avgRating.toFixed(2)) : 0;
  await Tutor.findByIdAndUpdate(this.tutor, { rating: avgRating });
});

// After delete, also recompute
reviewSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  const Tutor = mongoose.model('Tutor');
  const result = await mongoose.model('Review').aggregate([
    { $match: { tutor: doc.tutor } },
    { $group: { _id: '$tutor', avgRating: { $avg: '$rating' } } },
  ]);
  const avgRating = result.length ? Number(result[0].avgRating.toFixed(2)) : 0;
  await Tutor.findByIdAndUpdate(doc.tutor, { rating: avgRating });
});

module.exports = mongoose.model('Review', reviewSchema);
