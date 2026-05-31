const express = require('express');
const Payment = require('../models/Payment');
const Tutor = require('../models/Tutor');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// GET all
router.get('/', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const { status, tutor, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (tutor) query.tutor = tutor;

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate('tutor', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Payment.countDocuments(query),
    ]);

    res.json({ success: true, data: payments, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET one
router.get('/:id', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('tutor', 'name email');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create
router.post('/', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const payment = await Payment.create(req.body);
    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update
router.put('/:id', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH process individual payout
router.patch('/:id/process', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', processedAt: new Date(), transactionId: `TXN-${Date.now()}` },
      { new: true }
    ).populate('tutor', 'name');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    await Tutor.findByIdAndUpdate(payment.tutor._id, { pendingPayout: 0 });
    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST process all pending
router.post('/process-all', protect, authorize('super_admin', 'finance'), async (req, res) => {
  try {
    const pending = await Payment.find({ status: 'pending' });
    await Promise.all(pending.map((p) =>
      Payment.findByIdAndUpdate(p._id, { status: 'completed', processedAt: new Date(), transactionId: `TXN-${Date.now()}-${p._id}` })
    ));
    await Tutor.updateMany({}, { pendingPayout: 0 });
    res.json({ success: true, message: `${pending.length} payments processed`, count: pending.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
