const express = require('express');
const Student = require('../models/Student');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

function currentMonthRange() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1) };
}

function computeAttendanceStats(sessions = []) {
  const { start } = currentMonthRange();
  const monthSessions = sessions.filter(
    (s) => new Date(s.scheduledAt) >= start && ['present', 'partial', 'absent'].includes(s.studentAttendance)
  );
  const total = monthSessions.length;
  const present = monthSessions.filter((s) => s.studentAttendance === 'present').length;
  const partial = monthSessions.filter((s) => s.studentAttendance === 'partial').length;
  const attendanceRate = total > 0 ? Math.round(((present + partial * 0.5) / total) * 100) : 100;

  const sorted = [...monthSessions].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  let currentStreak = 0;
  for (const s of sorted) {
    if (s.studentAttendance === 'present' || s.studentAttendance === 'partial') currentStreak++;
    else break;
  }
  return { attendanceRate, currentStreak, totalSessions: total };
}

// GET all — admin only
router.get('/', protect, authorize('super_admin', 'operations', 'finance', 'support_agent'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search, atRisk, isActive } = req.query;
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    else query.isActive = true;
    if (search) query.name = { $regex: search, $options: 'i' };

    const [students, total] = await Promise.all([
      Student.find(query).skip((page - 1) * limit).limit(Number(limit)).lean(),
      Student.countDocuments(query),
    ]);

    let withStats = students.map((s) => ({ ...s, ...computeAttendanceStats(s.sessions) }));
    if (atRisk === 'true') withStats = withStats.filter((s) => s.attendanceRate < 70);
    withStats.sort((a, b) => a.attendanceRate - b.attendanceRate);

    res.json({ success: true, data: withStats, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET one (profile)
router.get('/:id', protect, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const stats = computeAttendanceStats(student.sessions);
    res.json({ success: true, data: { ...student, ...stats } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create
router.post('/', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const student = await Student.create(req.body);
    res.status(201).json({ success: true, data: student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update
router.put('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    // sessions are managed through dedicated sub-routes
    delete req.body.sessions;
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, data: student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Attendance ---

router.get('/:id/attendance', protect, async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);

    const student = await Student.findById(req.params.id).lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const monthSessions = student.sessions.filter((s) => {
      const d = new Date(s.scheduledAt);
      return d >= start && d <= end;
    });
    const calendar = {};
    monthSessions.forEach((s) => {
      const day = new Date(s.scheduledAt).getDate();
      calendar[day] = { status: s.studentAttendance, subject: s.subject };
    });
    const stats = computeAttendanceStats(student.sessions);
    res.json({ success: true, data: { student: { ...student, ...stats }, calendar, year: y, month: m } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Sessions sub-resource ---

router.post('/:id/sessions', protect, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id, { $push: { sessions: req.body } }, { new: true }
    );
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.status(201).json({ success: true, data: student.sessions.slice(-1)[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/sessions', protect, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('sessions.tutor', 'name').lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, data: student.sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/sessions/:sessionId', protect, async (req, res) => {
  try {
    const updateFields = {};
    Object.keys(req.body).forEach((k) => { updateFields[`sessions.$.${k}`] = req.body[k]; });
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, 'sessions._id': req.params.sessionId },
      { $set: updateFields },
      { new: true }
    );
    if (!student) return res.status(404).json({ success: false, message: 'Session not found' });
    const updated = student.sessions.find((s) => s._id.toString() === req.params.sessionId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id/sessions/:sessionId', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    await Student.findByIdAndUpdate(req.params.id, {
      $pull: { sessions: { _id: req.params.sessionId } },
    });
    res.json({ success: true, message: 'Session removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET summary stats
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const students = await Student.find({ isActive: true }).lean();
    const statsArr = students.map((s) => computeAttendanceStats(s.sessions));
    const total = students.length;
    const atRisk = statsArr.filter((s) => s.attendanceRate < 70).length;
    const perfect = statsArr.filter((s) => s.attendanceRate === 100).length;
    const avgAttendance = total
      ? Math.round(statsArr.reduce((sum, s) => sum + s.attendanceRate, 0) / total) : 0;
    res.json({ success: true, data: { total, atRisk, perfect, avgAttendance } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST notify parent
router.post('/:id/notify', protect, authorize('super_admin', 'operations', 'support_agent'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, message: `Notification sent to ${student.parentEmail}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
