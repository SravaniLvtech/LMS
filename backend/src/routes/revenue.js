const express = require('express');
const mongoose = require('mongoose');
const Order   = require('../models/Order');
const Payment = require('../models/Payment');
const Tutor   = require('../models/Tutor');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const ADMIN_ROLES = ['super_admin', 'finance', 'operations', 'support_agent'];
const pad    = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Fill a dense daily array between fromDate and toDate, zeroing missing days.
function buildDailyChart(dailyRaw, fromDate, toDate) {
  const byDate = {};
  dailyRaw.forEach(({ _id, amount }) => {
    byDate[`${_id.year}-${pad(_id.month)}-${pad(_id.day)}`] = amount;
  });
  const chart = [];
  const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const end = new Date(toDate.getFullYear(),   toDate.getMonth(),   toDate.getDate());
  while (cur <= end) {
    const key = fmtDate(cur);
    chart.push({ date: key, amount: byDate[key] || 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return chart;
}

// ── GET /revenue/overview ──────────────────────────────────────────────────────
// Query params: from=YYYY-MM-DD  to=YYYY-MM-DD  (default: this month)
// Accessible by all admin roles + tutor (tutor sees only their tutorShare)
router.get('/overview', protect, async (req, res) => {
  try {
    const { role, linkedId } = req.user;
    const isTutor = role === 'tutor';
    const isAdmin = ADMIN_ROLES.includes(role);

    if (!isTutor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (isTutor && !linkedId) {
      return res.status(400).json({ success: false, message: 'Tutor profile not linked to this account' });
    }

    // ── Date range ─────────────────────────────────────────────────────────────
    const now = new Date();
    let fromDate, toDate;

    if (req.query.from && req.query.to) {
      const [fy, fm, fd] = req.query.from.split('-').map(Number);
      const [ty, tm, td] = req.query.to.split('-').map(Number);
      fromDate = new Date(fy, fm - 1, fd,  0,  0,  0,   0);
      toDate   = new Date(ty, tm - 1, td, 23, 59, 59, 999);
    } else {
      // Default: current month up to today
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    // ── Shared pipeline stages ─────────────────────────────────────────────────
    const baseMatch = { paymentStatus: 'paid' };
    if (isTutor) baseMatch.tutor = new mongoose.Types.ObjectId(linkedId);

    const dateStages = [
      { $addFields: { effectiveDate: { $ifNull: ['$paidAt', '$createdAt'] } } },
      { $match: { effectiveDate: { $gte: fromDate, $lte: toDate } } },
    ];

    // ── TUTOR branch ───────────────────────────────────────────────────────────
    if (isTutor) {
      const [statsRaw, dailyRaw] = await Promise.all([
        Order.aggregate([
          { $match: baseMatch },
          ...dateStages,
          {
            $group: {
              _id: null,
              earnings:      { $sum: '$tutorShare' },
              sessionCount:  { $sum: '$sessionCount' },
              liveEarnings:  {
                $sum: { $cond: [{ $in: ['$type', ['live_single', 'live_pack']] }, '$tutorShare', 0] },
              },
              videoEarnings: {
                $sum: { $cond: [{ $eq: ['$type', 'video_course'] }, '$tutorShare', 0] },
              },
            },
          },
        ]),
        Order.aggregate([
          { $match: baseMatch },
          ...dateStages,
          {
            $group: {
              _id: {
                year:  { $year:  '$effectiveDate' },
                month: { $month: '$effectiveDate' },
                day:   { $dayOfMonth: '$effectiveDate' },
              },
              amount: { $sum: '$tutorShare' },
            },
          },
          { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]),
      ]);

      const s = statsRaw[0] || { earnings: 0, sessionCount: 0, liveEarnings: 0, videoEarnings: 0 };
      const avgPerSession = s.sessionCount > 0
        ? Number((s.earnings / s.sessionCount).toFixed(2))
        : 0;

      return res.json({
        success: true,
        data: {
          role: 'tutor',
          period:       { from: fmtDate(fromDate), to: fmtDate(toDate) },
          grossRevenue: Number(s.earnings.toFixed(2)),
          sessionCount: s.sessionCount,
          avgPerSession,
          tutorCutPct:  70,
          breakdown: {
            liveRevenue:  Number(s.liveEarnings.toFixed(2)),
            videoRevenue: Number(s.videoEarnings.toFixed(2)),
          },
          dailyRevenue: buildDailyChart(dailyRaw, fromDate, toDate),
        },
      });
    }

    // ── ADMIN branch ───────────────────────────────────────────────────────────
    const [statsRaw, dailyRaw, byType, pendingPayouts] = await Promise.all([
      Order.aggregate([
        { $match: baseMatch },
        ...dateStages,
        {
          $group: {
            _id: null,
            grossRevenue:  { $sum: '$amountBeforeTax' },
            tutorPayouts:  { $sum: '$tutorShare' },
            platformShare: { $sum: '$platformShare' },
            taxCollected:  { $sum: '$taxAmount' },
            sessionCount:  { $sum: '$sessionCount' },
          },
        },
      ]),
      Order.aggregate([
        { $match: baseMatch },
        ...dateStages,
        {
          $group: {
            _id: {
              year:  { $year:  '$effectiveDate' },
              month: { $month: '$effectiveDate' },
              day:   { $dayOfMonth: '$effectiveDate' },
            },
            amount: { $sum: '$amountBeforeTax' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),
      Order.aggregate([
        { $match: baseMatch },
        ...dateStages,
        { $group: { _id: '$type', revenue: { $sum: '$amountBeforeTax' } } },
      ]),
      Payment.find({ status: 'pending' }).populate('tutor', 'name').lean(),
    ]);

    const s = statsRaw[0] || {
      grossRevenue: 0, tutorPayouts: 0, platformShare: 0, taxCollected: 0, sessionCount: 0,
    };
    const avgPerSession = s.sessionCount > 0
      ? Number((s.grossRevenue / s.sessionCount).toFixed(2))
      : 0;
    const typeMap = Object.fromEntries(byType.map((t) => [t._id, t.revenue]));

    return res.json({
      success: true,
      data: {
        role: 'admin',
        period:       { from: fmtDate(fromDate), to: fmtDate(toDate) },
        grossRevenue:  Number(s.grossRevenue.toFixed(2)),
        tutorPayouts:  Number(s.tutorPayouts.toFixed(2)),
        platformShare: Number(s.platformShare.toFixed(2)),
        taxCollected:  Number(s.taxCollected.toFixed(2)),
        sessionCount:  s.sessionCount,
        avgPerSession,
        breakdown: {
          liveRevenue:  Number(((typeMap.live_single || 0) + (typeMap.live_pack || 0)).toFixed(2)),
          videoRevenue: Number((typeMap.video_course || 0).toFixed(2)),
        },
        dailyRevenue: buildDailyChart(dailyRaw, fromDate, toDate),
        pendingPayouts,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /revenue/pay/:paymentId ───────────────────────────────────────────────
router.post('/pay/:paymentId', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.paymentId,
      { status: 'completed', processedAt: new Date(), transactionId: `TXN-${Date.now()}` },
      { new: true },
    ).populate('tutor', 'name');

    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    await Tutor.findByIdAndUpdate(payment.tutor._id, { pendingPayout: 0 });

    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /revenue/pay-all ──────────────────────────────────────────────────────
router.post('/pay-all', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const pending = await Payment.find({ status: 'pending' });
    await Promise.all(
      pending.map((p) =>
        Payment.findByIdAndUpdate(p._id, {
          status: 'completed',
          processedAt: new Date(),
          transactionId: `TXN-${Date.now()}-${p._id}`,
        }),
      ),
    );
    await Tutor.updateMany({}, { pendingPayout: 0 });

    res.json({ success: true, message: `${pending.length} payouts processed`, count: pending.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
