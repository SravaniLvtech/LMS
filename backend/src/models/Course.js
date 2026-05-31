const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseName: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  courseImage: { type: String, trim: true },     // URL or file path

  // Categorisation
  category: {
    type: String,
    enum: ['algebra', 'geometry', 'calculus', 'statistics', 'arithmetic', 'trigonometry', 'other'],
    required: true,
  },
  subject: { type: String, required: true, trim: true },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner',
  },
  tags: [{ type: String, trim: true }],
  grades: [{ type: String, trim: true }],   // e.g. ["Grade 6", "Grade 7", "JEE"]

  // Schedule
  startDate:     { type: Date },                             // start calendar date (required for live)
  startTime:     { type: String, trim: true },               // "09:00" local
  endDate:       { type: Date },                             // end calendar date
  endTime:       { type: String, trim: true },               // "10:00" local
  startDateTime: { type: Date },                             // computed: first session start (UTC)
  endDateTime:   { type: Date },                             // computed: last session end (UTC)
  timezone:      { type: String, default: 'Asia/Kolkata' },
  durationMinutes: { type: Number, default: 60 },
  sessionCount:    { type: Number, default: 1 },             // total sessions (set after generation)

  // Delivery
  type: {
    type: String,
    enum: ['live_single', 'video_course'],
    default: 'live_single',
  },
  tutor:               { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
  assignedInstructor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' }, // same as tutor, explicit field
  maxStudents:         { type: Number, default: 1 },         // 1 = 1:1, >1 = group
  maxSlots:            { type: Number, default: 50, max: 50 },
  availableSlots:      { type: Number, default: 50 },
  enrolledCount:       { type: Number, default: 0 },

  // Video (for video_course type)
  videoUrl:      { type: String, trim: true },              // Cloudinary secure_url or local path
  videoPublicId: { type: String, trim: true },              // Cloudinary public_id (for deletion/replacement)

  // Pricing
  price: { type: Number, required: true },                  // base price before tax (INR)
  discountedPrice: { type: Number },                        // optional sale price
  currency: { type: String, default: 'INR' },

  // Status
  isActive: { type: Boolean, default: true },
  isPublished: { type: Boolean, default: false },
}, { timestamps: true });

// Virtual: whether course is currently running
courseSchema.virtual('isOngoing').get(function () {
  const now = new Date();
  return this.startDate <= now && this.endDate >= now;
});

// Virtual: effective price (discounted if set)
courseSchema.virtual('effectivePrice').get(function () {
  return this.discountedPrice != null ? this.discountedPrice : this.price;
});

courseSchema.set('toJSON', { virtuals: true });
courseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Course', courseSchema);
