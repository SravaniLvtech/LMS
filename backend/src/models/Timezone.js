const mongoose = require('mongoose');

const timezoneSchema = new mongoose.Schema({
  value:    { type: String, required: true, unique: true, trim: true }, // IANA key e.g. "Asia/Kolkata"
  label:    { type: String, required: true, trim: true },               // display e.g. "IST — India (UTC+5:30)"
  offset:   { type: String, trim: true },                               // e.g. "+05:30"
  region:   { type: String, trim: true },                               // e.g. "Asia"
  country:  { type: String, trim: true },                               // e.g. "India"
  isActive: { type: Boolean, default: true },
  order:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Timezone', timezoneSchema);
