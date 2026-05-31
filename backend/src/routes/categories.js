const express = require('express');
const Category = require('../models/Category');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Seed defaults if collection is empty
const DEFAULT_CATEGORIES = [
  { name: 'Algebra',       slug: 'algebra',       icon: '🔢', color: '#6366F1', isActive: true },
  { name: 'Geometry',      slug: 'geometry',      icon: '📐', color: '#10B981', isActive: true },
  { name: 'Calculus',      slug: 'calculus',      icon: '∫',  color: '#F59E0B', isActive: true },
  { name: 'Statistics',    slug: 'statistics',    icon: '📊', color: '#3B82F6', isActive: true },
  { name: 'Arithmetic',    slug: 'arithmetic',    icon: '➕', color: '#8B5CF6', isActive: true },
  { name: 'Trigonometry',  slug: 'trigonometry',  icon: '📏', color: '#EF4444', isActive: true },
  { name: 'Other',         slug: 'other',         icon: '📚', color: '#6B7280', isActive: true },
];

async function seedIfEmpty() {
  // Upsert each default so re-running is safe and missing fields get filled in
  await Promise.all(
    DEFAULT_CATEGORIES.map((cat) =>
      Category.updateOne(
        { slug: cat.slug },
        { $setOnInsert: cat },
        { upsert: true },
      )
    )
  );
  // Patch any old documents that are missing isActive
  await Category.updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
}

// GET all
router.get('/', async (req, res) => {
  try {
    await seedIfEmpty();
    const { isActive } = req.query;
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const categories = await Category.find(query).sort({ order: 1, name: 1 }).lean();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create
router.post('/', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update
router.put('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
