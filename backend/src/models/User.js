const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Name fields
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true, default: '' },
  name: { type: String, trim: true },          // firstName + lastName (auto-set on save)
  displayName: { type: String, trim: true },   // shown in UI

  // Identity
  dob: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'non_binary', 'prefer_not_to_say'], default: null },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6, select: false },

  role: {
    type: String,
    enum: ['super_admin', 'operations', 'finance', 'support_agent', 'student', 'tutor'],
    default: 'support_agent',
  },
  linkedId: { type: mongoose.Schema.Types.ObjectId, default: null }, // ref to Student or Tutor doc

  // Mobile signup fields
  phone: { type: String, trim: true },
  dialCode: { type: String, trim: true },    // e.g. "+91"
  countryCode: { type: String, trim: true }, // ISO e.g. "IN"

  profileImage: { type: String, trim: true }, // URL or base64 data URL
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  // Keep name in sync with firstName + lastName
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.name = [this.firstName, this.lastName].filter(Boolean).join(' ');
    if (!this.displayName) this.displayName = this.name;
  }
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
