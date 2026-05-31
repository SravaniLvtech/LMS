const express      = require('express');
const Cart         = require('../models/Cart');
const Course       = require('../models/Course');
const Session      = require('../models/Session');
const Order        = require('../models/Order');
const Subscription = require('../models/Subscription');
const Alert        = require('../models/Alert');
const { protect }  = require('../middleware/auth');

const router   = express.Router();
const TAX_RATE = 2; // 2 % default platform tax

// ── GET  /api/cart  ──────────────────────────────────────────────────────────
// Includes per-item tax breakdown + cart summary totals
router.get('/', protect, async (req, res) => {
  try {
    const { studentId, courseId } = req.query;
    const query = {};
    if (studentId) query.studentId = studentId;
    if (courseId)  query.courseId  = courseId;

    const items = await Cart.find(query)
      .populate('courseId',  'courseName courseImage price discountedPrice level type category subject')
      .populate('tutorId',   'name rating')
      .populate('studentId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Attach pricing with 2% tax to every item
    const withTax = items.map((item) => {
      const basePrice = item.courseId?.discountedPrice ?? item.courseId?.price ?? 0;
      const taxAmount = Number((basePrice * TAX_RATE / 100).toFixed(2));
      const total     = Number((basePrice + taxAmount).toFixed(2));
      return { ...item, pricing: { basePrice, taxRate: TAX_RATE, taxAmount, total } };
    });

    const cartSubtotal = Number(withTax.reduce((s, i) => s + i.pricing.basePrice, 0).toFixed(2));
    const cartTax      = Number(withTax.reduce((s, i) => s + i.pricing.taxAmount, 0).toFixed(2));
    const cartTotal    = Number(withTax.reduce((s, i) => s + i.pricing.total, 0).toFixed(2));

    res.json({
      success: true,
      data: withTax,
      total: items.length,
      summary: { cartSubtotal, cartTax, taxRate: TAX_RATE, cartTotal },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST  /api/cart  ─────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { courseId, tutorId, studentId } = req.body;
    if (!courseId || !studentId) {
      return res.status(400).json({ success: false, message: 'courseId and studentId are required' });
    }

    const existing = await Cart.findOne({ courseId, studentId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Already in cart', data: existing });
    }

    const item = await Cart.create({ courseId, tutorId, studentId });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── POST  /api/cart/checkout  ────────────────────────────────────────────────
// Converts all cart items into paid orders, enrolls the student in sessions,
// saves Subscription records, fires Alert notifications, and clears the cart.
router.post('/checkout', protect, async (req, res) => {
  try {
    const { studentId } = req.body;   // user._id — used only to look up the cart
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId required' });

    // The real Student document ID lives on the authenticated user's linkedId.
    // All Student-collection writes (Order, Session enrollment, Subscription) must use this.
    const studentDocId = req.user?.linkedId?.toString() || studentId;

    const cartItems = await Cart.find({ studentId })
      .populate('courseId',  'courseName courseImage price discountedPrice type subject tutor')
      .populate('tutorId',   'name')
      .populate('studentId', 'name email')
      .lean();

    if (!cartItems.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const results = [];
    const now = new Date();

    for (const item of cartItems) {
      const course = item.courseId;
      if (!course) continue;

      const tutorId   = item.tutorId?._id || course.tutor;
      const basePrice = course.discountedPrice ?? course.price ?? 0;

      // ── 1. Create confirmed paid order (uses Student doc ID) ────────────────
      const order = await Order.create({
        studentId:       studentDocId,
        tutor:           tutorId,
        type:            course.type      || 'live_single',
        subject:         course.subject   || 'Mathematics',
        courseId:        course._id,
        courseName:      course.courseName,
        amountBeforeTax: basePrice,
        taxRate:         TAX_RATE,
        paymentStatus:   'paid',
        status:          'confirmed',
        transactionId:   `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        paidAt:          now,
      });

      // ── 2. Enroll student in all upcoming scheduled sessions ─────────────────
      const targetSessions = await Session.find({
        courseId:        course._id,
        status:          'scheduled',
        startDateTime:   { $gte: now },
        groupMemberList: { $ne: studentDocId },
        availableSlots:  { $gt: 0 },
      }).select('_id');

      let enrolledCount = 0;
      if (targetSessions.length > 0) {
        const ids = targetSessions.map((s) => s._id);
        await Session.updateMany(
          { _id: { $in: ids } },
          { $addToSet: { groupMemberList: studentDocId }, $inc: { availableSlots: -1 } }
        );
        await Course.findByIdAndUpdate(course._id, {
          $inc: { enrolledCount: 1, availableSlots: -1 },
        });
        enrolledCount = targetSessions.length;
      }

      // ── 3. Save / update Subscription (Student doc ID) ────────────────────────
      const subscription = await Subscription.findOneAndUpdate(
        { courseId: course._id, studentId: studentDocId },
        { tutorId, orderId: order._id, status: 'confirmed' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // ── 4. Send notifications via Alerts ─────────────────────────────────────
      const studentName = item.studentId?.name || 'A student';
      await Alert.insertMany([
        {
          type: 'student', priority: 'low',
          title: `Subscribed to ${course.courseName}`,
          description: `${studentName} has subscribed to the course "${course.courseName}"`,
          refModel: 'Student', refId: studentDocId,
          autoGenerated: true,
          actions: [{ label: 'View Student', action: 'view_student', style: 'blue' }],
        },
        {
          type: 'tutor', priority: 'low',
          title: 'New student enrolled',
          description: `${studentName} has subscribed to your course "${course.courseName}"`,
          refModel: 'Tutor', refId: tutorId,
          autoGenerated: true,
          actions: [{ label: 'View Tutor', action: 'view_tutor', style: 'blue' }],
        },
      ]);

      results.push({
        orderId:        order._id,
        courseId:       course._id,
        courseName:     course.courseName,
        enrolledSessions: enrolledCount,
        subscriptionId: subscription._id,
      });
    }

    // ── 5. Clear cart ─────────────────────────────────────────────────────────
    await Cart.deleteMany({ studentId });

    res.json({
      success: true,
      data: results,
      message: `${results.length} course${results.length !== 1 ? 's' : ''} purchased successfully`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE  /api/cart/:id  ───────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const item = await Cart.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Cart item not found' });
    res.json({ success: true, message: 'Removed from cart' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE  /api/cart  (by courseId + studentId)  ────────────────────────────
router.delete('/', protect, async (req, res) => {
  try {
    const { courseId, studentId } = req.query;
    if (!courseId || !studentId) {
      return res.status(400).json({ success: false, message: 'courseId and studentId are required' });
    }
    await Cart.deleteOne({ courseId, studentId });
    res.json({ success: true, message: 'Removed from cart' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
