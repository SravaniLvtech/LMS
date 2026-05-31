const express = require('express');
const { protect } = require('../middleware/auth');
const Tutor   = require('../models/Tutor');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Order   = require('../models/Order');
const Payment = require('../models/Payment');
const Alert   = require('../models/Alert');

const router = express.Router();

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Build a filled 30-day chart array from a sparse aggregation result.
// Each entry: { date: 'YYYY-MM-DD', label: '28 Apr', revenue: N, orders: N }
function buildRevenueChart(dailyRaw, referenceNow) {
  const byDate = {};
  dailyRaw.forEach(({ _id, revenue, orders }) => {
    const key = `${_id.year}-${String(_id.month).padStart(2, '0')}-${String(_id.day).padStart(2, '0')}`;
    byDate[key] = { revenue, orders };
  });

  const chart = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(referenceNow);
    d.setDate(d.getDate() - i);
    const y   = d.getFullYear();
    const m   = d.getMonth() + 1;
    const day = d.getDate();
    const key = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    chart.push({
      date:    key,
      label:   `${day} ${MONTH_ABBR[m - 1]}`,
      revenue: byDate[key]?.revenue || 0,
      orders:  byDate[key]?.orders  || 0,
    });
  }
  return chart;
}

router.get('/overview', protect, async (req, res) => {
  try {
    const now = new Date();

    // ── Date windows ──────────────────────────────────────────────────────────
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Last 30 days (includes today): from (today - 29 days) 00:00 → today 23:59
    const last30Start = new Date(todayStart);
    last30Start.setDate(last30Start.getDate() - 29);

    // Previous 30 days (for % change): from (today - 59 days) 00:00 → (today - 30 days) 23:59
    const prev30Start = new Date(todayStart);
    prev30Start.setDate(prev30Start.getDate() - 59);
    const prev30End = new Date(todayStart);
    prev30End.setDate(prev30End.getDate() - 30);
    prev30End.setHours(23, 59, 59, 999);

    // Current calendar month (for session KPIs)
    const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // ── Revenue from Orders (amountBeforeTax, paid only) ─────────────────────
    // Use $ifNull so orders without paidAt fall back to createdAt
    const matchPaid = { paymentStatus: 'paid' };

    const [
      revLast30Raw,
      revPrev30Raw,
      dailyRaw,
      revTodayRaw,
    ] = await Promise.all([
      // Total revenue: last 30 days
      Order.aggregate([
        { $match: matchPaid },
        { $addFields: { effectiveDate: { $ifNull: ['$paidAt', '$createdAt'] } } },
        { $match: { effectiveDate: { $gte: last30Start, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amountBeforeTax' }, count: { $sum: 1 } } },
      ]),
      // Total revenue: previous 30 days (for % change)
      Order.aggregate([
        { $match: matchPaid },
        { $addFields: { effectiveDate: { $ifNull: ['$paidAt', '$createdAt'] } } },
        { $match: { effectiveDate: { $gte: prev30Start, $lte: prev30End } } },
        { $group: { _id: null, total: { $sum: '$amountBeforeTax' } } },
      ]),
      // Daily breakdown: last 30 days
      Order.aggregate([
        { $match: matchPaid },
        { $addFields: { effectiveDate: { $ifNull: ['$paidAt', '$createdAt'] } } },
        { $match: { effectiveDate: { $gte: last30Start, $lte: todayEnd } } },
        {
          $group: {
            _id: {
              year:  { $year:  '$effectiveDate' },
              month: { $month: '$effectiveDate' },
              day:   { $dayOfMonth: '$effectiveDate' },
            },
            revenue: { $sum: '$amountBeforeTax' },
            orders:  { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),
      // Today's revenue only
      Order.aggregate([
        { $match: matchPaid },
        { $addFields: { effectiveDate: { $ifNull: ['$paidAt', '$createdAt'] } } },
        { $match: { effectiveDate: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amountBeforeTax' }, count: { $sum: 1 } } },
      ]),
    ]);

    const revLast30  = revLast30Raw[0]?.total  || 0;
    const revPrev30  = revPrev30Raw[0]?.total   || 0;
    const revToday   = revTodayRaw[0]?.total    || 0;
    const ordersLast30 = revLast30Raw[0]?.count || 0;
    const ordersToday  = revTodayRaw[0]?.count  || 0;

    const revenueChange = revPrev30 > 0
      ? Number((((revLast30 - revPrev30) / revPrev30) * 100).toFixed(1))
      : revLast30 > 0 ? 100 : 0;

    const revenueChart = buildRevenueChart(dailyRaw, now);

    // ── Session KPIs (from Session collection, using startDateTime) ──────────
    const [
      activeStudentsCount,
      totalSessions,
      sessionsThisMonthCount,
      completedThisMonthCount,
      completedLastMonthCount,
    ] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      // Total sessions — no date filter
      Session.countDocuments({}),
      // This month: only PAST sessions (future/upcoming excluded from denominator)
      Session.countDocuments({
        startDateTime: { $gte: startOfMonth },
        $or: [
          { endDateTime: { $lt: now } },                         // already ended
          { status: { $in: ['completed', 'cancelled'] } },       // or explicitly closed
        ],
      }),
      // Completed this month — ran (not cancelled); DB status OR endDateTime passed
      Session.countDocuments({
        startDateTime: { $gte: startOfMonth },
        status: { $ne: 'cancelled' },
        $or: [{ status: 'completed' }, { endDateTime: { $lt: now } }],
      }),
      // Completed last month — DB status OR endDateTime already passed
      Session.countDocuments({
        startDateTime: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        $or: [{ status: 'completed' }, { endDateTime: { $lt: startOfMonth } }],
      }),
    ]);

    const completionRate = sessionsThisMonthCount > 0
      ? Number(((completedThisMonthCount / sessionsThisMonthCount) * 100).toFixed(1))
      : 0;

    // ── Other parallel queries ────────────────────────────────────────────────
    const [activeTutors, pendingAlerts, recentAlerts, pendingTutors, studentComplaints, pendingPayouts, tutorRatings] =
      await Promise.all([
        Tutor.countDocuments({ status: 'active' }),
        Alert.countDocuments({ status: 'unresolved' }),
        Alert.find({ status: 'unresolved' }).sort({ createdAt: -1 }).limit(3).lean(),
        Tutor.countDocuments({ status: 'pending_approval' }),
        Alert.countDocuments({ type: 'student', status: 'unresolved', priority: 'high' }),
        Payment.countDocuments({ status: 'pending' }),
        Tutor.find({ status: 'active' }).select('rating').lean(),
      ]);

    const avgRating = tutorRatings.length
      ? Number((tutorRatings.reduce((s, t) => s + t.rating, 0) / tutorRatings.length).toFixed(1))
      : 0;

    res.json({
      success: true,
      data: {
        kpis: {
          monthlyRevenue: revLast30,
          revenueChange,
          activeStudents:    activeStudentsCount,
          activeTutors,
          totalSessions,                             // all-time, no date filter
          sessionsThisMonth: sessionsThisMonthCount, // this calendar month
          completedSessions: completedThisMonthCount,
        },
        // ── Full revenue breakdown (new) ──────────────────────────────────────
        revenue: {
          last30Days:   revLast30,
          today:        revToday,
          prevPeriod:   revPrev30,
          change:       revenueChange,
          totalOrders:  ordersLast30,
          ordersToday,
          chart:        revenueChart,   // 30 data points, amountBeforeTax per day
        },
        health: {
          sessionCompletion: completionRate,
          avgTutorRating:    avgRating,
          paymentSuccessRate: 96.8,
          complaintRate:      2.1,
          studentRetention:   88.4,
        },
        pendingActions: [
          { label: 'Tutor applications', count: pendingTutors,      severity: 'amber', action: 'review_tutors' },
          { label: 'Student complaints', count: studentComplaints,  severity: 'red',   action: 'view_alerts' },
          { label: 'Payouts due',        count: pendingPayouts,     severity: 'green', action: 'process_payouts' },
        ],
        alertCount: pendingAlerts,
        recentAlerts,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
