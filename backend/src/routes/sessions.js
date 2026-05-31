const express = require('express');
const Session = require('../models/Session');
const Course  = require('../models/Course');
const { protect, authorize } = require('../middleware/auth');
const mongoose = require('mongoose');
const router = express.Router();

// ── Role constants ────────────────────────────────────────────────────────────
const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support_agent'];

// GET sessions (filter by courseId, tutorId, studentId, date range, status)
// Access rules:
//   admin   → can query any sessions freely
//   tutor   → automatically scoped to their own tutorId  (req.user.linkedId)
//   student → automatically scoped to sessions they are enrolled in
router.get('/', protect, async (req, res) => {
  try {
    const role      = req.user.role;
    const linkedId  = req.user.linkedId;
    const isAdmin   = ADMIN_ROLES.includes(role);
    const { courseId, tutorId, studentId, status, from, to, page = 1, limit = 50 } = req.query;
    const query = {};

    if (role === 'tutor') {
      // Tutor can only see their own sessions — ignore any tutorId param
      if (!linkedId) return res.status(403).json({ success: false, message: 'Tutor account not linked' });
      query.tutorId =   new mongoose.Types.ObjectId(linkedId);
    } else if (role === 'student') {
      // Student can only see sessions they are enrolled in — ignore any studentId param
      if (!linkedId) return res.status(403).json({ success: false, message: 'Student account not linked' });
      query.groupMemberList = {$in: [new mongoose.Types.ObjectId(linkedId)]};
    } else if (isAdmin) {
      // Admin: apply optional filters from query params
      if (tutorId)   query.tutorId         = new mongoose.Types.ObjectId(tutorId);
      if (studentId) query.groupMemberList =  { $in: [new mongoose.Types.ObjectId(studentId)] };
    } else {
      return res.status(403).json({ success: false, message: 'Access forbidden' });
    }

    if (courseId) query.courseId = new mongoose.Types.ObjectId(courseId);
    if (status)   query.status   = status;
    if (from || to) {
      query.startDateTime = {};
      if (from) query.startDateTime.$gte = new Date(from);
      if (to)   query.startDateTime.$lte = new Date(to);
    }
    const [sessions, total] = await Promise.all([
      Session.find(query)
        .populate('tutorId',         'name rating')
        .populate('groupMemberList', 'name email')
        .sort({ startDateTime: 1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Session.countDocuments(query),
    ]);

    res.json({ success: true, data: sessions, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET one session
router.get('/:id', protect, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id)
      .populate('tutorId',         'name rating subjects')
      .populate('groupMemberList', 'name email phone');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH update status / meeting link / notes
router.patch('/:id', protect, authorize('super_admin', 'operations', 'support_agent'), async (req, res) => {
  try {
    const allowed = ['status', 'meetingLink', 'notes', 'startDateTime', 'endDateTime'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const session = await Session.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST enroll a student into a session (decrements availableSlots)
router.post('/:id/enroll', protect, async (req, res) => {
  try {
    // If the caller is a student, always use their own linkedId (Student doc _id)
    // Admin/support can pass an explicit studentId in the body
    const role = req.user.role;
    let studentId;
    if (role === 'student') {
      if (!req.user.linkedId) {
        return res.status(403).json({ success: false, message: 'Student account not linked' });
      }
      studentId = req.user.linkedId;
    } else {
      studentId = req.body.studentId;
    }

    if (!studentId) return res.status(400).json({ success: false, message: 'studentId required' });

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.availableSlots <= 0) {
      return res.status(400).json({ success: false, message: 'No available slots in this session' });
    }
    if (session.groupMemberList.map(String).includes(String(studentId))) {
      return res.status(400).json({ success: false, message: 'Student already enrolled' });
    }

    session.groupMemberList.push(studentId);
    session.availableSlots = Math.max(0, session.availableSlots - 1);
    await session.save();

    // Also decrement course-level availableSlots
    await Course.findByIdAndUpdate(session.courseId, { $inc: { availableSlots: -1, enrolledCount: 1 } });

    res.json({ success: true, data: session, message: 'Student enrolled' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST unenroll a student (increments availableSlots)
router.post('/:id/unenroll', protect, async (req, res) => {
  try {
    // Mirror the enroll logic — student role always uses their own linkedId
    const role = req.user.role;
    let studentId;
    if (role === 'student') {
      if (!req.user.linkedId) {
        return res.status(403).json({ success: false, message: 'Student account not linked' });
      }
      studentId = req.user.linkedId;
    } else {
      studentId = req.body.studentId;
    }
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId required' });

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const before = session.groupMemberList.length;
    session.groupMemberList = session.groupMemberList.filter((id) => String(id) !== String(studentId));
    if (session.groupMemberList.length === before) {
      return res.status(400).json({ success: false, message: 'Student not in this session' });
    }
    session.availableSlots = Math.min(session.maxSlots, session.availableSlots + 1);
    await session.save();

    await Course.findByIdAndUpdate(session.courseId, { $inc: { availableSlots: 1, enrolledCount: -1 } });

    res.json({ success: true, data: session, message: 'Student unenrolled' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
