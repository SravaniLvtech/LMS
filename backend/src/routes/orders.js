const express = require('express');
const Order   = require('../models/Order');
const Student = require('../models/Student');
const Tutor   = require('../models/Tutor');
const Payment = require('../models/Payment');
const Course  = require('../models/Course');
const Session = require('../models/Session');
const User    = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: enroll a student into all future scheduled sessions of a course
// Called whenever an order is confirmed/paid
// ─────────────────────────────────────────────────────────────────────────────
async function enrollStudentInCourse(courseId, studentId) {
  if (!courseId || !studentId) return { enrolled: 0 };

  const now = new Date();

  // Only sessions that are still upcoming, have slots, and don't already include this student
  const targetSessions = await Session.find({
    courseId,
    status:        { $in: ['scheduled'] },
    startDateTime: { $gte: now },
    groupMemberList: { $ne: studentId },
    availableSlots:  { $gt: 0 },
  }).select('_id');

  if (targetSessions.length === 0) return { enrolled: 0 };

  const ids = targetSessions.map((s) => s._id);

  // Bulk: add student + decrement slot count in one operation per session
  await Session.updateMany(
    { _id: { $in: ids } },
    {
      $addToSet: { groupMemberList: studentId },
      $inc:      { availableSlots: -1 },
    }
  );

  // Update course-level counters (one student → one unit)
  await Course.findByIdAndUpdate(courseId, {
    $inc: { enrolledCount: 1, availableSlots: -1 },
  });

  return { enrolled: targetSessions.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: unenroll a student from all future sessions (on cancellation/refund)
// ─────────────────────────────────────────────────────────────────────────────
async function unenrollStudentFromCourse(courseId, studentId) {
  if (!courseId || !studentId) return { unenrolled: 0 };

  const now = new Date();

  const targetSessions = await Session.find({
    courseId,
    startDateTime:   { $gte: now },
    groupMemberList: studentId,
  }).select('_id');

  if (targetSessions.length === 0) return { unenrolled: 0 };

  const ids = targetSessions.map((s) => s._id);

  await Session.updateMany(
    { _id: { $in: ids } },
    {
      $pull: { groupMemberList: studentId },
      $inc:  { availableSlots: 1 },
    }
  );

  await Course.findByIdAndUpdate(courseId, {
    $inc: { enrolledCount: -1, availableSlots: 1 },
  });

  return { unenrolled: targetSessions.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET all
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { status, paymentStatus, type, page = 1, limit = 20, studentId, tutor } = req.query;
    const query = {};
    if (status)        query.status        = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (type)          query.type          = type;
    if (studentId)     query.studentId     = studentId;
    if (tutor)         query.tutor         = tutor;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('studentId', 'name email grade')
        .populate('tutor',     'name subjects rating')
        .populate('courseId',  'courseName')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    res.json({ success: true, data: orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET orders by studentId
// Accepts either Student._id or User._id and returns orders for both
// (handles legacy orders that may have been stored with User._id)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/student/:studentId', protect, async (req, res) => {
  try {
    const { status, paymentStatus, type, page = 1, limit = 20 } = req.query;

    // Resolve the Student document — param could be a Student._id or a User._id
    let student = await Student.findById(req.params.studentId).select('name email grade').lean();
    let resolvedStudentId = req.params.studentId;

    if (!student) {
      // param might be a User._id — look up their linked Student doc
      const userDoc = await User.findById(req.params.studentId).select('linkedId').lean();
      if (userDoc?.linkedId) {
        resolvedStudentId = userDoc.linkedId.toString();
        student = await Student.findById(resolvedStudentId).select('name email grade').lean();
      }
    }

    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    // Also find any User whose linkedId points to this student (to cover legacy orders
    // that were stored with User._id instead of Student._id)
    const linkedUser = await User.findOne({ linkedId: resolvedStudentId }).select('_id').lean();

    // Build a set of IDs to match against — covers both current and legacy storage patterns
    const idSet = new Set([resolvedStudentId, req.params.studentId]);
    if (linkedUser?._id) idSet.add(linkedUser._id.toString());
    const studentIds = [...idSet];

    const query = { studentId: { $in: studentIds } };
    if (status)        query.status        = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (type)          query.type          = type;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('tutor',    'name subjects rating profileImage')
        .populate('courseId', 'courseName category courseImage')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    res.json({
      success: true,
      student,
      data: orders,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      summary: {
        totalOrders: total,
        paidOrders:  paid.length,
        totalSpentINR: paid.reduce((s, o) => s + (o.amountAfterTax || 0), 0),
        totalSessions: paid.reduce((s, o) => s + (o.sessionCount   || 0), 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET stats
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', protect, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalOrders, thisMonth, byType, revenueAgg] = await Promise.all([
      Order.countDocuments({ paymentStatus: 'paid' }),
      Order.countDocuments({ paymentStatus: 'paid', createdAt: { $gte: startOfMonth } }),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: '$type', count: { $sum: 1 }, revenue: { $sum: '$amountAfterTax' } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', paidAt: { $gte: startOfMonth } } },
        { $group: { _id: null, gross: { $sum: '$amountAfterTax' }, tutorShare: { $sum: '$tutorShare' }, platformShare: { $sum: '$platformShare' }, tax: { $sum: '$taxAmount' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalOrders, thisMonth, byType,
        revenue: revenueAgg[0] || { gross: 0, tutorShare: 0, platformShare: 0, tax: 0 },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET one
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('studentId', 'name email grade parentName parentEmail')
      .populate('tutor',     'name subjects rating')
      .populate('courseId',  'courseName description');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST create
// If order is created with paymentStatus:'paid' → enroll immediately
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const {
      tutor, type, subject, courseId, courseName,
      amountBeforeTax, taxRate, exchangeRate, scheduledDates,
      paymentStatus, transactionId, notes,
    } = req.body;

    // When a student places the order themselves, always bind to their own Student doc
    // (req.user.linkedId = Student._id).  Admins can supply any studentId via body.
    const studentId = req.user.role === 'student'
      ? req.user.linkedId
      : (req.body.studentId);

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'studentId required' });
    }

    const [studentDoc, tutorDoc] = await Promise.all([
      Student.findById(studentId),
      Tutor.findById(tutor),
    ]);
    if (!studentDoc) return res.status(404).json({ success: false, message: 'Student not found' });
    if (!tutorDoc)   return res.status(404).json({ success: false, message: 'Tutor not found' });

    // Validate slots if course given
    if (courseId) {
      const course = await Course.findById(courseId);
      if (course && course.availableSlots <= 0) {
        return res.status(400).json({ success: false, message: 'No available slots in this course' });
      }
    }

    const preset = Order.priceFor(type);
    const isPaid = paymentStatus === 'paid';

    const order = await Order.create({
      studentId,
      tutor,
      type,
      subject,
      courseId:        courseId   || null,
      courseName:      courseName || null,
      amountBeforeTax: amountBeforeTax ?? preset.amountBeforeTax,
      taxRate:         taxRate    ?? 18,
      exchangeRate:    exchangeRate ?? 83.5,
      sessionCount:    preset.sessionCount,
      scheduledDates:  scheduledDates || [],
      paymentStatus:   isPaid ? 'paid'      : 'pending',
      status:          isPaid ? 'confirmed' : 'pending',
      transactionId:   isPaid ? (transactionId || `TXN-${Date.now()}`) : undefined,
      paidAt:          isPaid ? new Date() : undefined,
      notes,
    });

    let enrollResult = { enrolled: 0 };

    // If created as paid → enroll student in course sessions immediately
    if (isPaid && courseId) {
      enrollResult = await enrollStudentInCourse(courseId, studentId);

      // Create student sub-document sessions
      if (scheduledDates?.length > 0) {
        const perSession = scheduledDates.length;
        await Student.findByIdAndUpdate(studentId, {
          $push: {
            sessions: {
              $each: scheduledDates.map((date) => ({
                tutor, subject,
                scheduledAt:    date,
                status:         'scheduled',
                tutorAttendance:'future',
                amount:         Number((order.amountBeforeTax / perSession).toFixed(2)),
                tutorShare:     Number((order.tutorShare      / perSession).toFixed(2)),
                platformShare:  Number((order.platformShare   / perSession).toFixed(2)),
                type:           order.type,
              })),
            },
          },
        });
      }

      await Payment.create({
        tutor:        order.tutor,
        amount:       order.tutorShare,
        sessionCount: order.sessionCount,
        status:       'pending',
        weekOf:       nextMonday(),
      });
    }

    res.status(201).json({
      success: true,
      data:    order,
      enrolledSessions: enrollResult.enrolled,
      message: enrollResult.enrolled
        ? `Order created and student enrolled in ${enrollResult.enrolled} sessions`
        : 'Order created',
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT update (no amount changes on paid orders)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const existing = await Order.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });
    if (existing.paymentStatus === 'paid') {
      delete req.body.amountBeforeTax;
      delete req.body.taxRate;
      delete req.body.exchangeRate;
    }
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH confirm-payment  ← main enrollment trigger
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/confirm-payment', protect, async (req, res) => {
  try {
    const { transactionId } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Already paid' });
    }

    // Validate available slots before confirming
    if (order.courseId) {
      const course = await Course.findById(order.courseId);
      if (course && course.availableSlots <= 0) {
        return res.status(400).json({ success: false, message: 'No available slots remaining in this course' });
      }
    }

    // Mark order paid
    order.paymentStatus = 'paid';
    order.status        = 'confirmed';
    order.transactionId = transactionId || `TXN-${Date.now()}`;
    order.paidAt        = new Date();
    await order.save();

    // ── Enroll student in all future sessions of the course ──────────────────
    let enrollResult = { enrolled: 0 };
    if (order.courseId) {
      enrollResult = await enrollStudentInCourse(order.courseId, order.studentId);
    }

    // ── Push session sub-documents into Student record (legacy support) ──────
    if (order.scheduledDates?.length > 0) {
      const perSession = order.scheduledDates.length;
      await Student.findByIdAndUpdate(order.studentId, {
        $push: {
          sessions: {
            $each: order.scheduledDates.map((date) => ({
              tutor:          order.tutor,
              subject:        order.subject,
              scheduledAt:    date,
              status:         'scheduled',
              tutorAttendance:'future',
              amount:         Number((order.amountBeforeTax / perSession).toFixed(2)),
              tutorShare:     Number((order.tutorShare      / perSession).toFixed(2)),
              platformShare:  Number((order.platformShare   / perSession).toFixed(2)),
              type:           order.type,
            })),
          },
        },
      });
    }

    // ── Create tutor payment record ──────────────────────────────────────────
    await Payment.create({
      tutor:        order.tutor,
      amount:       order.tutorShare,
      sessionCount: order.sessionCount,
      status:       'pending',
      weekOf:       nextMonday(),
    });

    const populated = await Order.findById(order._id)
      .populate('studentId', 'name email')
      .populate('tutor',     'name')
      .populate('courseId',  'courseName');

    res.json({
      success: true,
      data:    populated,
      enrolledSessions: enrollResult.enrolled,
      message: enrollResult.enrolled
        ? `Payment confirmed. Student enrolled in ${enrollResult.enrolled} sessions.`
        : 'Payment confirmed.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH cancel  ← unenrolls student from future sessions if order was paid
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/cancel', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const { cancelledBy, reason } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const wasPaid = order.paymentStatus === 'paid';
    const refundAmount = cancelledBy === 'tutor'
      ? order.amountAfterTax
      : order.amountAfterTax * 0.5;

    order.status        = 'cancelled';
    order.paymentStatus = wasPaid ? 'refunded' : order.paymentStatus;
    order.cancelledBy   = cancelledBy;
    order.cancelledAt   = new Date();
    order.refundAmount  = refundAmount;
    order.notes         = reason || order.notes;
    await order.save();

    // ── Unenroll student from future course sessions ──────────────────────────
    let unenrollResult = { unenrolled: 0 };
    if (wasPaid && order.courseId) {
      unenrollResult = await unenrollStudentFromCourse(order.courseId, order.studentId);
    }

    res.json({
      success: true,
      data:    order,
      refundAmount,
      unenrolledSessions: unenrollResult.unenrolled,
      message: unenrollResult.unenrolled
        ? `Order cancelled. Student removed from ${unenrollResult.unenrolled} upcoming sessions.`
        : 'Order cancelled.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────
function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = router;
