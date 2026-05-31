const express    = require('express');
const mongoose   = require('mongoose');
const { protect } = require('../middleware/auth');
const Attendance = require('../models/Attendance');
const Session    = require('../models/Session');
const Course     = require('../models/Course');

const router = express.Router();

const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support_agent'];

const toId = (v) => {
  try { return new mongoose.Types.ObjectId(v); } catch { return null; }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /join
// Called by frontend when the user clicks "Join Now".
// • tutor   → saves { sessionId, courseId, tutorId, role:'tutor' }
// • student → saves { sessionId, courseId, tutorId (from session), studentId, role:'student' }
// • admin   → no attendance recorded (skipped)
// • video_course → no attendance required (skipped)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/join', protect, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

    const sessionOId = toId(sessionId);
    if (!sessionOId) return res.status(400).json({ success: false, message: 'Invalid sessionId' });

    const role    = req.user.role;
    const isAdmin = ADMIN_ROLES.includes(role);

    // Admins observe; no attendance entry needed
    if (isAdmin) return res.json({ success: true, skipped: true, reason: 'admin_no_attendance' });

    if (role !== 'tutor' && role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access forbidden' });
    }

    if (!req.user.linkedId) {
      return res.status(403).json({ success: false, message: 'Account not linked' });
    }

    const linkedOId = toId(req.user.linkedId);
    if (!linkedOId) return res.status(403).json({ success: false, message: 'Invalid linked account ID' });

    // Fetch session
    const session = await Session.findById(sessionOId).select('courseId tutorId status').lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const courseOId  = toId(session.courseId);
    const tutorOId   = toId(session.tutorId);   // may be null if session has no tutor

    // Skip video courses — no attendance required
    const course = await Course.findById(courseOId).select('type').lean();
    if (course?.type === 'video_course') {
      return res.json({ success: true, skipped: true, reason: 'video_course' });
    }

    let record;

    if (role === 'tutor') {
      // Filter includes role so we never match a student record that also has tutorId set
      const existing = await Attendance.find({ sessionId: sessionOId, tutorId: linkedOId, role: 'tutor' });
      if (existing.length > 0) return res.json({ success: true, alreadyJoined: true, data: existing });

      record = await Attendance.create({
        sessionId: sessionOId,
        courseId:  courseOId,
        tutorId:   linkedOId,
        role:      'tutor',
        joinedAt:  new Date(),
      });
    } else {
      // Filter includes role so we never match a tutor record
      console.log(`Checking existing attendance for student ${linkedOId} in session ${sessionOId}`);
      const existing = await Attendance.find({ sessionId: sessionOId, studentId: linkedOId, role: 'student' });
      console.log('Existing attendance records found:', existing);
      if (existing.length > 0) return res.json({ success: true, alreadyJoined: true, data: existing });

      record = await Attendance.create({
        sessionId:  sessionOId,
        courseId:   courseOId,
        tutorId:    tutorOId,    // null-safe: toId returns null for falsy input
        studentId:  linkedOId,
        role:       'student',
        joinedAt:   new Date(),
      });
    }

    res.json({ success: true, data: record });
  } catch (err) {
    if (err.code === 11000) return res.json({ success: true, alreadyJoined: true });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /
// Returns attendance records scoped by role.
// • tutor   → records where tutorId = user.linkedId
// • student → records where studentId = user.linkedId
// • admin   → all records; filterable by ?tutorId= | ?studentId= | ?sessionId= | ?courseId=
//
// Response includes a summary:
//   total, completed, upcoming, attendanceRate
// Attendance rate is calculated from completed sessions only.
// Upcoming sessions are tagged but excluded from the rate.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const role    = req.user.role;
    const isAdmin = ADMIN_ROLES.includes(role);

    const query = {};

    if (role === 'tutor') {
      if (!req.user.linkedId) return res.status(403).json({ success: false, message: 'Account not linked' });
      query.tutorId = toId(req.user.linkedId);
    } else if (role === 'student') {
      if (!req.user.linkedId) return res.status(403).json({ success: false, message: 'Account not linked' });
      query.studentId = toId(req.user.linkedId);
    } else if (isAdmin) {
      if (req.query.tutorId)   query.tutorId   = toId(req.query.tutorId);
      if (req.query.studentId) query.studentId = toId(req.query.studentId);
      if (req.query.sessionId) query.sessionId = toId(req.query.sessionId);
      if (req.query.courseId)  query.courseId  = toId(req.query.courseId);
    } else {
      return res.status(403).json({ success: false, message: 'Access forbidden' });
    }

    const records = await Attendance.find(query)
      .populate('sessionId',  'startDateTime endDateTime status courseName')
      .populate('courseId',   'courseName type')
      .populate('tutorId',    'name')
      .populate('studentId',  'name grade')
      .sort({ joinedAt: -1 })
      .lean();

    const now = new Date();

    // Tag each record with a display status
    const tagged = records.map((r) => {
      const sess = r.sessionId;
      let displayStatus = 'unknown';
      if (sess) {
        if (sess.status === 'completed' || (sess.endDateTime && new Date(sess.endDateTime) < now)) {
          displayStatus = 'completed';
        } else if (sess.status === 'scheduled' && new Date(sess.startDateTime) > now) {
          displayStatus = 'upcoming';
        } else {
          displayStatus = sess.status || 'scheduled';
        }
      }
      return { ...r, displayStatus };
    });

    const completedCount = tagged.filter((r) => r.displayStatus === 'completed').length;
    const upcomingCount  = tagged.filter((r) => r.displayStatus === 'upcoming').length;
    const total          = tagged.length;

    // Rate = completed sessions attended / all sessions attended
    const attendanceRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    res.json({
      success: true,
      data: tagged,
      summary: { total, completed: completedCount, upcoming: upcomingCount, attendanceRate },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
