const express = require('express');
const Review = require('../models/Review');
const Tutor = require('../models/Tutor');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/reviews/check-by-student?student=<studentId>&courseIds=id1,id2,...
// Returns the list of courseIds that the student has already reviewed.
router.get('/check-by-student', protect, async (req, res) => {
  try {
    const { student, courseIds } = req.query;
    if (!student) return res.status(400).json({ success: false, message: 'student param required' });

    const ids = courseIds
      ? courseIds.split(',').filter(Boolean)
      : [];

    const query = { student };
    if (ids.length) query.courseId = { $in: ids };

    const reviews = await Review.find(query).select('courseId').lean();
    const reviewed = reviews
      .map((r) => r.courseId?.toString())
      .filter(Boolean);

    res.json({ success: true, data: reviewed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all (filter by tutor)
router.get('/', protect, async (req, res) => {
  try {
    const { tutor, student, courseId, rating, page = 1, limit = 20 } = req.query;
    if (!tutor) return res.status(400).json({ success: false, message: 'tutor query param required' });

    const query = { tutor };
    if (student)  query.student  = student;
    if (courseId) query.courseId = courseId;
    if (rating)   query.rating   = Number(rating);

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('student', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Review.countDocuments(query),
    ]);

    const agg = await Review.aggregate([
      { $match: { tutor: reviews[0]?.tutor || require('mongoose').Types.ObjectId.createFromHexString(tutor) } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const avgRating = agg.length ? Number(agg[0].avg.toFixed(2)) : 0;
    const totalCount = agg.length ? agg[0].count : 0;

    res.json({ success: true, data: reviews, total, avgRating, totalCount, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET reviews by tutorId
router.get('/tutor/:tutorId', protect, async (req, res) => {
  try {
    const { rating, page = 1, limit = 20 } = req.query;

    const tutor = await Tutor.findById(req.params.tutorId).select('name rating subjects').lean();
    if (!tutor) return res.status(404).json({ success: false, message: 'Tutor not found' });

    const query = { tutor: req.params.tutorId };
    if (rating) query.rating = Number(rating);

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate('student', 'name grade profileImage')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Review.countDocuments(query),
    ]);

    // Rating breakdown: count per star (1–5)
    const breakdown = await Review.aggregate([
      { $match: { tutor: tutor._id } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);

    const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: breakdown.find((b) => b._id === star)?.count || 0,
    }));

    res.json({
      success: true,
      tutor,
      data: reviews,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      summary: {
        avgRating: tutor.rating,
        totalReviews: total,
        ratingBreakdown,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET one
router.get('/:id', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id).populate('student', 'name').populate('tutor', 'name');
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    res.json({ success: true, data: review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create
router.post('/', protect, async (req, res) => {
  try {
    const { tutor, student, courseId, parentName, rating, review, topic, sessionDate } = req.body;
    if (!tutor || !parentName || !rating || !review) {
      return res.status(400).json({ success: false, message: 'tutor, parentName, rating and review are required' });
    }
    const tutorExists = await Tutor.findById(tutor);
    if (!tutorExists) return res.status(404).json({ success: false, message: 'Tutor not found' });

    const newReview = await Review.create({ tutor, student, courseId, parentName, rating, review, topic, sessionDate });
    const updatedTutor = await Tutor.findById(tutor).select('name rating');

    res.status(201).json({ success: true, data: newReview, tutorRating: updatedTutor.rating });
  } catch (err) {
    // Duplicate review (unique index on student+courseId)
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'You have already reviewed this course.' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update
router.put('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    // Prevent changing which tutor the review belongs to
    delete req.body.tutor;
    const review = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    // Re-trigger rating recalc if rating changed
    if (req.body.rating !== undefined) {
      const agg = await Review.aggregate([
        { $match: { tutor: review.tutor } },
        { $group: { _id: '$tutor', avgRating: { $avg: '$rating' } } },
      ]);
      const avgRating = agg.length ? Number(agg[0].avgRating.toFixed(2)) : 0;
      await Tutor.findByIdAndUpdate(review.tutor, { rating: avgRating });
    }

    const updatedTutor = await Tutor.findById(review.tutor).select('name rating');
    res.json({ success: true, data: review, tutorRating: updatedTutor.rating });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const deleted = await Review.findOneAndDelete({ _id: req.params.id });
    if (!deleted) return res.status(404).json({ success: false, message: 'Review not found' });
    const updatedTutor = await Tutor.findById(deleted.tutor).select('name rating');
    res.json({ success: true, message: 'Review deleted', tutorRating: updatedTutor?.rating });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
