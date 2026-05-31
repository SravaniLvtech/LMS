const express    = require('express');
const moment     = require('moment-timezone');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const multer     = require('multer');
const cloudinary = require('../config/cloudinary');
const Course     = require('../models/Course');
const Session    = require('../models/Session');
const { protect, authorize } = require('../middleware/auth');

// ── Multer: save to OS temp dir, then stream to Cloudinary ───────────────────
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
      cb(null, `mp-video-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only MP4, WebM, OGG or MOV files are allowed'));
    }
    cb(null, true);
  },
});

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate session objects from course data
// ─────────────────────────────────────────────────────────────────────────────
function buildSessions(course) {
  const {
    _id: courseId, courseName, courseImage, level, category, subject, grades, tags,
    tutor: tutorId, startDate, endDate, startTime, endTime,
    timezone = 'Asia/Kolkata', durationMinutes = 60,
    maxStudents = 1, maxSlots = 50, price = 0,
  } = course;

  const tz        = timezone || 'Asia/Kolkata';
  const slotLimit = Math.min(Number(maxSlots) || 50, 50);  // hard cap 50

  const sessions = [];
  let current = moment.tz(startDate, tz).startOf('day');
  const last  = moment.tz(endDate,   tz).startOf('day');

  // Iterate day-by-day from startDate to endDate
  while (current.isSameOrBefore(last, 'day')) {
    const dateStr = current.format('YYYY-MM-DD');

    const startMoment = moment.tz(`${dateStr} ${startTime}`, 'YYYY-MM-DD HH:mm', tz);
    const endMoment   = moment.tz(`${dateStr} ${endTime}`,   'YYYY-MM-DD HH:mm', tz);

    // Skip if the combined datetime is invalid (bad startTime/endTime)
    if (!startMoment.isValid() || !endMoment.isValid()) {
      current.add(1, 'day');
      continue;
    }

    sessions.push({
      courseId,
      courseName,
      courseImage: courseImage || '',
      level,
      category,
      subject,
      grades:          grades  || [],
      tags:            tags    || [],
      tutorId:         tutorId || null,
      sessionNumber:   sessions.length + 1,   // updated after loop
      totalSessions:   0,                      // set after loop
      date:            current.toDate(),
      startTime,
      endTime,
      startDateTime:   startMoment.toDate(),
      endDateTime:     endMoment.toDate(),
      timezone:        tz,
      durationMinutes: Number(durationMinutes) || 60,
      maxSlots:        slotLimit,
      availableSlots:  slotLimit,
      groupMemberList: [],
      status:          'scheduled',
      price:           Number(price) || 0,
    });

    current.add(1, 'day');
  }

  // Back-fill totalSessions now we know the count
  sessions.forEach((s) => { s.totalSessions = sessions.length; });
  return sessions;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET all
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { subject, type, level, isActive, tutor, page = 1, limit = 20, search, available = "true" } = req.query;
    const query = {};
    if (subject)  query.subject  = subject;
    if (type)     query.type     = type;
    if (level)    query.level    = level;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (tutor)    query.tutor    = tutor;
    if (search)   query.courseName = { $regex: search, $options: 'i' };

    // available=true → hide courses where availableSlots<=0 OR endDate<currentDate
    if (available === 'true') {
      query.availableSlots = { $gt: 0 };       // slots <= 0  → hidden
      const now = new Date();
      query.$or = [                             // endDate < now → hidden
        { endDate: { $gte: now } },             // endDate in future/today → show
        { endDate: null },                      // no endDate set → show
        { endDate: { $exists: false } },        // field absent   → show
      ];
    }

    const [courses, total] = await Promise.all([
      Course.find(query)
        .populate('tutor', 'name rating')
        .populate('assignedInstructor', 'name rating')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Course.countDocuments(query),
    ]);

    res.json({ success: true, data: courses, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET one
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('tutor', 'name rating subjects')
      .populate('assignedInstructor', 'name rating subjects');
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    // Include session count
    const sessionCount = await Session.countDocuments({ courseId: course._id });
    res.json({ success: true, data: { ...course.toJSON(), sessionCount } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST create  — also generates sessions for live courses
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('super_admin', 'operations', 'support_agent'), async (req, res) => {
  try {
    const body = { ...req.body };

    // Enforce slot cap — prefer maxSlots (sent by form), fall back to maxStudents
    const slotLimit = Math.min(Number(body.maxSlots) || Number(body.maxStudents) || 1, 50);
    body.maxSlots       = slotLimit;
    body.availableSlots = slotLimit;
    body.maxStudents    = slotLimit; // keep all three fields in sync

    // Mirror tutor → assignedInstructor
    if (body.tutor) body.assignedInstructor = body.tutor;

    // Create the course first (without startDateTime/endDateTime — set after sessions)
    const course = await Course.create(body);

    let createdSessions = [];

    // Only generate sessions for live courses that have dates
    if (course.type === 'live_single' && course.startDate && course.endDate) {
      const sessionDocs = buildSessions(course.toObject());

      if (sessionDocs.length > 0) {
        createdSessions = await Session.insertMany(sessionDocs);

        // Update course: real sessionCount, startDateTime, endDateTime
        const first = createdSessions[0];
        const last  = createdSessions[createdSessions.length - 1];

        await Course.findByIdAndUpdate(course._id, {
          sessionCount:  createdSessions.length,
          startDateTime: first.startDateTime,
          endDateTime:   last.endDateTime,
        });

        course.sessionCount  = createdSessions.length;
        course.startDateTime = first.startDateTime;
        course.endDateTime   = last.endDateTime;
      }
    }

    res.status(201).json({
      success:  true,
      data:     course,
      sessions: createdSessions.length,
      message:  createdSessions.length
        ? `Course created with ${createdSessions.length} sessions`
        : 'Course created',
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT update
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.tutor) updates.assignedInstructor = updates.tutor;
    // Sync all slot fields when either maxSlots or maxStudents is updated
    if (updates.maxSlots || updates.maxStudents) {
      const slotLimit = Math.min(Number(updates.maxSlots) || Number(updates.maxStudents) || 1, 50);
      updates.maxSlots     = slotLimit;
      updates.maxStudents  = slotLimit;
      updates.availableSlots = slotLimit;
    }

    const course = await Course.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST upload video  — uploads to Cloudinary, stores secure_url in course doc
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/upload-video',
  protect,
  authorize('super_admin', 'operations', 'support_agent', 'tutor'),
  // Step 1 — multer saves file to OS temp dir
  (req, res, next) => videoUpload.single('video')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Invalid file type' });
    }
    next();
  }),
  // Step 2 — stream temp file to Cloudinary, clean up, save URL
  async (req, res) => {
    const tmpPath = req.file?.path;
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No video file provided' });
      }

      // If the course already has a Cloudinary video, delete the old one first
      const existing = await Course.findById(req.params.id).select('videoPublicId').lean();
      if (existing?.videoPublicId) {
        await cloudinary.uploader.destroy(existing.videoPublicId, { resource_type: 'video' })
          .catch(() => {}); // ignore errors if already deleted
      }

      // Upload to Cloudinary
      // public_id is deterministic per course → overwrite: true replaces cleanly
      const publicId = `mathpath/courses/course-${req.params.id}`;
      const result = await cloudinary.uploader.upload(tmpPath, {
        resource_type: 'video',
        public_id:     publicId,
        overwrite:     true,
        chunk_size:    6_000_000, // 6 MB chunks — handles large files without timeout
        timeout:       180_000,   // 3 min upload timeout
      });

      // Remove temp file
      fs.unlinkSync(tmpPath);

      // Persist URL + public_id in course doc
      const course = await Course.findByIdAndUpdate(
        req.params.id,
        { videoUrl: result.secure_url, videoPublicId: result.public_id },
        { new: true, select: 'videoUrl videoPublicId courseName' }
      );
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

      res.json({ success: true, data: { videoUrl: result.secure_url } });
    } catch (err) {
      // Clean up temp file on error
      if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      console.error('Cloudinary upload error:', err.message);
      res.status(500).json({ success: false, message: err.message || 'Video upload failed' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    // Also remove all associated sessions
    await Session.deleteMany({ courseId: req.params.id });
    res.json({ success: true, message: 'Course and its sessions deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
