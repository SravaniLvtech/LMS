const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  slug: { type: String, required: true, trim: true, unique: true, lowercase: true },
  description: { type: String, trim: true },
  icon: { type: String, trim: true },       // emoji or icon name
  color: { type: String, trim: true },      // hex color for UI
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },      // for custom sort order
}, { timestamps: true });

// Auto-generate slug from name before save
categorySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);
