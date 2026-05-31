const express     = require('express');
const Wishlist    = require('../models/Wishlist');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── GET  /api/wishlist  ──────────────────────────────────────────────────────
// Optional filters: ?studentId=xxx  &courseId=xxx
router.get('/', protect, async (req, res) => {
  try {
    const { studentId, courseId } = req.query;
    const query = {};
    if (studentId) query.studentId = studentId;
    if (courseId)  query.courseId  = courseId;

    const items = await Wishlist.find(query)
      .populate('courseId',  'courseName courseImage price discountedPrice level type category subject')
      .populate('tutorId',   'name rating')
      .populate('studentId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: items, total: items.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST  /api/wishlist  ─────────────────────────────────────────────────────
// Body: { courseId, tutorId, studentId }
router.post('/', protect, async (req, res) => {
  try {
    const { courseId, tutorId, studentId } = req.body;
    if (!courseId || !studentId) {
      return res.status(400).json({ success: false, message: 'courseId and studentId are required' });
    }

    // Return existing item if already wishlisted (idempotent)
    const existing = await Wishlist.findOne({ courseId, studentId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Already in wishlist', data: existing });
    }

    const item = await Wishlist.create({ courseId, tutorId, studentId });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── DELETE  /api/wishlist/:id  ───────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const item = await Wishlist.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Wishlist item not found' });
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE  /api/wishlist  (by courseId + studentId)  ────────────────────────
router.delete('/', protect, async (req, res) => {
  try {
    const { courseId, studentId } = req.query;
    if (!courseId || !studentId) {
      return res.status(400).json({ success: false, message: 'courseId and studentId are required' });
    }
    await Wishlist.deleteOne({ courseId, studentId });
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
