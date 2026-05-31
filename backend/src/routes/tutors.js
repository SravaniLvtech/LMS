const express  = require('express');
const mongoose = require('mongoose');
const Tutor    = require('../models/Tutor');
const User     = require('../models/User');
const Session  = require('../models/Session');
const Order    = require('../models/Order');
const Alert    = require('../models/Alert');
const Review   = require('../models/Review');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support_agent'];

// GET all — admin only
router.get('/', protect, authorize('super_admin', 'operations', 'finance', 'support_agent'), async (req, res) => {
  try {
    const { filter = 'all', sort = 'rating', page = 1, limit = 20, search } = req.query;
    const query = {};
    if (filter === 'top_rated') query.rating = { $gte: 4.5 };
    else if (filter === 'flagged') query.status = 'flagged';
    else if (filter === 'new') query.joinedAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    else if (filter === 'pending') query.status = 'pending_approval';
    if (search) query.name = { $regex: search, $options: 'i' };

    const sortMap = { rating: { rating: -1 }, revenue: { totalRevenue: -1 }, sessions: { totalSessions: -1 } };

    const [tutors, total] = await Promise.all([
      Tutor.find(query).sort(sortMap[sort] || { rating: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean(),
      Tutor.countDocuments(query),
    ]);

    // Live aggregates: sessions count, revenue (tutorShare) and rating (avg) per tutor
    const tutorIds = tutors.map(t => t._id);

    const [sessionCounts, revenueTotals, ratingAggr] = await Promise.all([
      Session.aggregate([
        { $match: { tutorId: { $in: tutorIds } } },
        { $group: { _id: '$tutorId', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { tutor: { $in: tutorIds }, status: { $in: ['confirmed', 'completed'] } } },
        { $group: { _id: '$tutor', revenue: { $sum: '$tutorShare' } } },
      ]),
      Review.aggregate([
        { $match: { tutor: { $in: tutorIds } } },
        { $group: { _id: '$tutor', avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
      ]),
    ]);

    const countMap = {}, revenueMap = {}, ratingMap = {};
    sessionCounts.forEach(c => { countMap[c._id.toString()]   = c.count; });
    revenueTotals.forEach(r => { revenueMap[r._id.toString()] = Number(r.revenue.toFixed(2)); });
    ratingAggr.forEach(r    => { ratingMap[r._id.toString()]  = { rating: Number(r.avgRating.toFixed(2)), reviewCount: r.reviewCount }; });

    const data = tutors.map(t => {
      const id = t._id.toString();
      return {
        ...t,
        totalSessions: countMap[id]           ?? 0,
        totalRevenue:  revenueMap[id]          ?? 0,
        rating:        ratingMap[id]?.rating   ?? t.rating,
        reviewCount:   ratingMap[id]?.reviewCount ?? 0,
      };
    });

    res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET top instructors — sorted by rating, with course count + enrolled students
// Must be before /:id to avoid 'top-instructors' being parsed as an id param
router.get('/top-instructors', protect, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const Course = require('../models/Course');

    const tutors = await Tutor.find({ status: 'active' })
      .sort({ rating: -1 })
      .limit(limit)
      .select('name profileImage rating subjects')
      .lean();

    if (!tutors.length) return res.json({ success: true, data: [] });

    const tutorIds = tutors.map((t) => t._id);

    const [courseCounts, studentCounts] = await Promise.all([
      // Courses created by each tutor
      Course.aggregate([
        { $match: { tutor: { $in: tutorIds }, isActive: true } },
        { $group: { _id: '$tutor', count: { $sum: 1 } } },
      ]),
      // Unique students enrolled per tutor (from paid orders)
      Order.aggregate([
        { $match: { tutor: { $in: tutorIds }, paymentStatus: 'paid' } },
        { $group: { _id: '$tutor', students: { $addToSet: '$studentId' } } },
        { $project: { _id: 1, count: { $size: '$students' } } },
      ]),
    ]);

    const courseMap  = Object.fromEntries(courseCounts.map((c) => [c._id.toString(), c.count]));
    const studentMap = Object.fromEntries(studentCounts.map((s) => [s._id.toString(), s.count]));

    const data = tutors.map((t) => ({
      _id:              t._id,
      name:             t.name,
      profileImage:     t.profileImage || null,
      rating:           t.rating || 0,
      subjects:         t.subjects || [],
      courseCount:      courseMap[t._id.toString()]  || 0,
      studentsEnrolled: studentMap[t._id.toString()] || 0,
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET one
router.get('/:id', protect, async (req, res) => {
  try {
    const oid = new mongoose.Types.ObjectId(req.params.id);

    const [tutor, sessionCount, revenueResult, ratingResult] = await Promise.all([
      Tutor.findById(oid).lean(),
      Session.countDocuments({ tutorId: oid }),
      Order.aggregate([
        { $match: { tutor: oid, status: { $in: ['confirmed', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$tutorShare' } } },
      ]),
      Review.aggregate([
        { $match: { tutor: oid } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
      ]),
    ]);

    if (!tutor) return res.status(404).json({ success: false, message: 'Tutor not found' });

    const totalRevenue = revenueResult[0] ? Number(revenueResult[0].total.toFixed(2)) : 0;
    const rating       = ratingResult[0]  ? Number(ratingResult[0].avgRating.toFixed(2)) : tutor.rating;
    const reviewCount  = ratingResult[0]?.reviewCount ?? 0;

    res.json({ success: true, data: { ...tutor, totalSessions: sessionCount, totalRevenue, rating, reviewCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create
router.post('/', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const tutor = await Tutor.create(req.body);
    res.status(201).json({ success: true, data: tutor });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update
router.put('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    // Prevent manual override of auto-computed rating
    delete req.body.rating;
    const tutor = await Tutor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!tutor) return res.status(404).json({ success: false, message: 'Tutor not found' });
    res.json({ success: true, data: tutor });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const tutor = await Tutor.findByIdAndDelete(req.params.id);
    if (!tutor) return res.status(404).json({ success: false, message: 'Tutor not found' });
    // Remove associated reviews
    await Review.deleteMany({ tutor: req.params.id });
    res.json({ success: true, message: 'Tutor deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Actions ---

router.post('/:id/warn', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const tutor = await Tutor.findByIdAndUpdate(req.params.id, { $inc: { warningCount: 1 } }, { new: true });
    if (!tutor) return res.status(404).json({ success: false, message: 'Tutor not found' });
    await Alert.create({
      type: 'tutor', priority: 'medium',
      title: `Warning issued to ${tutor.name}`,
      description: req.body.reason || 'Admin issued warning',
      refModel: 'Tutor', refId: tutor._id, autoGenerated: false,
      actions: [{ label: 'View Tutor', action: 'view_tutor', style: 'blue' }],
    });
    res.json({ success: true, data: tutor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/suspend', protect, authorize('super_admin'), async (req, res) => {
  try {
    const tutor = await Tutor.findByIdAndUpdate(req.params.id, { status: 'suspended' }, { new: true });
    if (!tutor) return res.status(404).json({ success: false, message: 'Tutor not found' });

    // Deactivate the linked User account so the tutor cannot log in while suspended.
    await User.findOneAndUpdate({ linkedId: tutor._id }, { isActive: false });

    await Alert.create({
      type: 'tutor', priority: 'high',
      title: `${tutor.name} suspended`,
      description: req.body.reason || 'Tutor account suspended by admin',
      refModel: 'Tutor', refId: tutor._id, autoGenerated: false,
    });
    res.json({ success: true, data: tutor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/approve', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const tutor = await Tutor.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    if (!tutor) return res.status(404).json({ success: false, message: 'Tutor not found' });

    // Activate the linked User account.
    // User stores linkedId → Tutor._id (Tutor has no back-reference to User).
    await User.findOneAndUpdate({ linkedId: tutor._id }, { isActive: true });

    res.json({ success: true, data: tutor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET aggregate stats
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const [tutors, totalSessions, revenueResult, ratingResult] = await Promise.all([
      Tutor.find({ status: 'active' }).select('performance').lean(),
      Session.countDocuments({}),
      Order.aggregate([
        { $match: { status: { $in: ['confirmed', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$tutorShare' } } },
      ]),
      Review.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    const totalRevenue  = revenueResult[0] ? Number(revenueResult[0].total.toFixed(2))      : 0;
    const avgRating     = ratingResult[0]  ? Number(ratingResult[0].avgRating.toFixed(2))   : 0;
    const avgCompletion = tutors.length
      ? Number((tutors.reduce((s, t) => s + (t.performance?.completionRate || 0), 0) / tutors.length).toFixed(1)) : 0;

    res.json({ success: true, data: { avgRating, totalRevenue, avgCompletion, totalSessions } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
