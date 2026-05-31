const express = require('express');
const Student = require('../models/Student');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);

    const role     = req.user.role;
    const linkedId = req.user.linkedId?.toString();
    const isTutor  = role === 'tutor';

    // Tutors are auto-scoped to their own linkedId; admins may pass ?tutorId=
    const scopedTutorId = isTutor ? linkedId : (req.query.tutorId || null);

    if (isTutor && !linkedId) {
      return res.status(403).json({ success: false, message: 'Tutor account not linked' });
    }

    // Gather all sessions in the month across all students
    const allStudents = await Student.find({}).populate('sessions.tutor', 'name status').lean();

    const sessionsInMonth = allStudents.flatMap((s) =>
      s.sessions
        .filter((sess) => {
          const d = new Date(sess.scheduledAt);
          return d >= start && d <= end;
        })
        .map((sess) => ({ ...sess, studentId: s._id }))
    );

    // Group by tutor
    const tutorMap = {};
    sessionsInMonth.forEach((sess) => {
      if (!sess.tutor) return;
      const tid = sess.tutor._id?.toString() || sess.tutor.toString();

      // Scope: skip tutors that don't match the filter
      if (scopedTutorId && tid !== scopedTutorId) return;
      if (!tutorMap[tid]) {
        tutorMap[tid] = {
          tutor: sess.tutor,
          calendar: {},
          onTime: 0,
          late: 0,
          noShow: 0,
          total: 0,
        };
      }
      const day = new Date(sess.scheduledAt).getDate().toString();
      tutorMap[tid].calendar[day] = sess.tutorAttendance || 'future';
      tutorMap[tid].total++;
      if (sess.tutorAttendance === 'present') tutorMap[tid].onTime++;
      else if (sess.tutorAttendance === 'late') tutorMap[tid].late++;
      else if (sess.tutorAttendance === 'no_show') tutorMap[tid].noShow++;
    });

    const results = Object.values(tutorMap).map((t) => {
      const completionRate = t.total
        ? Number((((t.onTime + t.late) / t.total) * 100).toFixed(1))
        : 100;
      return { ...t, completionRate, belowThreshold: completionRate < 75 && t.total >= 3 };
    });

    // Overall stats
    const tracked = sessionsInMonth.filter((s) => s.tutorAttendance && s.tutorAttendance !== 'future');
    const noShowTotal = tracked.filter((s) => s.tutorAttendance === 'no_show').length;
    const onTimeTotal = tracked.filter((s) => s.tutorAttendance === 'present').length;
    const avgCompletion = tracked.length
      ? Number((((tracked.length - noShowTotal) / tracked.length) * 100).toFixed(1))
      : 100;
    const onTimeRate = tracked.length
      ? Number(((onTimeTotal / tracked.length) * 100).toFixed(1))
      : 100;

    res.json({
      success: true,
      data: {
        tutors: results,
        stats: { avgCompletion, onTimeRate, noShowCount: noShowTotal },
        year: y,
        month: m,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
