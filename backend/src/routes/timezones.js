const express  = require('express');
const Timezone = require('../models/Timezone');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_TIMEZONES = [
  // ── Asia ──────────────────────────────────────────────────────────────────
  { value: 'Asia/Kolkata',     label: 'IST — India (UTC+5:30)',          offset: '+05:30', region: 'Asia',    country: 'India',        order: 1  },
  { value: 'Asia/Dubai',       label: 'GST — UAE / Dubai (UTC+4)',       offset: '+04:00', region: 'Asia',    country: 'UAE',          order: 2  },
  { value: 'Asia/Riyadh',      label: 'AST — Saudi Arabia (UTC+3)',      offset: '+03:00', region: 'Asia',    country: 'Saudi Arabia', order: 3  },
  { value: 'Asia/Kuwait',      label: 'AST — Kuwait (UTC+3)',            offset: '+03:00', region: 'Asia',    country: 'Kuwait',       order: 4  },
  { value: 'Asia/Qatar',       label: 'AST — Qatar (UTC+3)',             offset: '+03:00', region: 'Asia',    country: 'Qatar',        order: 5  },
  { value: 'Asia/Bahrain',     label: 'AST — Bahrain (UTC+3)',           offset: '+03:00', region: 'Asia',    country: 'Bahrain',      order: 6  },
  { value: 'Asia/Singapore',   label: 'SGT — Singapore (UTC+8)',         offset: '+08:00', region: 'Asia',    country: 'Singapore',    order: 7  },
  { value: 'Asia/Kuala_Lumpur',label: 'MYT — Malaysia (UTC+8)',          offset: '+08:00', region: 'Asia',    country: 'Malaysia',     order: 8  },
  { value: 'Asia/Colombo',     label: 'SLST — Sri Lanka (UTC+5:30)',     offset: '+05:30', region: 'Asia',    country: 'Sri Lanka',    order: 9  },
  { value: 'Asia/Dhaka',       label: 'BST — Bangladesh (UTC+6)',        offset: '+06:00', region: 'Asia',    country: 'Bangladesh',   order: 10 },
  { value: 'Asia/Karachi',     label: 'PKT — Pakistan (UTC+5)',          offset: '+05:00', region: 'Asia',    country: 'Pakistan',     order: 11 },
  { value: 'Asia/Kathmandu',   label: 'NPT — Nepal (UTC+5:45)',          offset: '+05:45', region: 'Asia',    country: 'Nepal',        order: 12 },
  { value: 'Asia/Kabul',       label: 'AFT — Afghanistan (UTC+4:30)',    offset: '+04:30', region: 'Asia',    country: 'Afghanistan',  order: 13 },
  { value: 'Asia/Tehran',      label: 'IRST — Iran (UTC+3:30)',          offset: '+03:30', region: 'Asia',    country: 'Iran',         order: 14 },
  { value: 'Asia/Tokyo',       label: 'JST — Japan (UTC+9)',             offset: '+09:00', region: 'Asia',    country: 'Japan',        order: 15 },
  { value: 'Asia/Shanghai',    label: 'CST — China (UTC+8)',             offset: '+08:00', region: 'Asia',    country: 'China',        order: 16 },
  { value: 'Asia/Seoul',       label: 'KST — South Korea (UTC+9)',       offset: '+09:00', region: 'Asia',    country: 'South Korea',  order: 17 },
  { value: 'Asia/Jakarta',     label: 'WIB — Indonesia / Jakarta (UTC+7)',offset: '+07:00', region: 'Asia',   country: 'Indonesia',    order: 18 },
  { value: 'Asia/Bangkok',     label: 'ICT — Thailand / Bangkok (UTC+7)',offset: '+07:00', region: 'Asia',    country: 'Thailand',     order: 19 },
  { value: 'Asia/Manila',      label: 'PHT — Philippines (UTC+8)',       offset: '+08:00', region: 'Asia',    country: 'Philippines',  order: 20 },

  // ── Europe ────────────────────────────────────────────────────────────────
  { value: 'Europe/London',    label: 'GMT/BST — UK / London',          offset: '+00:00', region: 'Europe',  country: 'UK',           order: 30 },
  { value: 'Europe/Paris',     label: 'CET/CEST — France / Paris (UTC+1)',offset:'+01:00', region: 'Europe',  country: 'France',       order: 31 },
  { value: 'Europe/Berlin',    label: 'CET/CEST — Germany / Berlin (UTC+1)',offset:'+01:00',region:'Europe',  country: 'Germany',      order: 32 },
  { value: 'Europe/Moscow',    label: 'MSK — Russia / Moscow (UTC+3)',   offset: '+03:00', region: 'Europe',  country: 'Russia',       order: 33 },
  { value: 'Europe/Istanbul',  label: 'TRT — Turkey / Istanbul (UTC+3)', offset: '+03:00', region: 'Europe',  country: 'Turkey',       order: 34 },

  // ── Africa ────────────────────────────────────────────────────────────────
  { value: 'Africa/Cairo',     label: 'EET — Egypt / Cairo (UTC+2)',     offset: '+02:00', region: 'Africa',  country: 'Egypt',        order: 40 },
  { value: 'Africa/Nairobi',   label: 'EAT — Kenya / Nairobi (UTC+3)',   offset: '+03:00', region: 'Africa',  country: 'Kenya',        order: 41 },
  { value: 'Africa/Lagos',     label: 'WAT — Nigeria / Lagos (UTC+1)',   offset: '+01:00', region: 'Africa',  country: 'Nigeria',      order: 42 },

  // ── Americas ──────────────────────────────────────────────────────────────
  { value: 'America/New_York', label: 'EST/EDT — USA / New York (UTC-5)', offset: '-05:00', region: 'Americas',country: 'USA',         order: 50 },
  { value: 'America/Chicago',  label: 'CST/CDT — USA / Chicago (UTC-6)', offset: '-06:00', region: 'Americas',country: 'USA',         order: 51 },
  { value: 'America/Denver',   label: 'MST/MDT — USA / Denver (UTC-7)',  offset: '-07:00', region: 'Americas',country: 'USA',         order: 52 },
  { value: 'America/Los_Angeles',label:'PST/PDT — USA / Los Angeles (UTC-8)',offset:'-08:00',region:'Americas',country:'USA',         order: 53 },
  { value: 'America/Toronto',  label: 'EST/EDT — Canada / Toronto (UTC-5)',offset:'-05:00', region: 'Americas',country: 'Canada',     order: 54 },
  { value: 'America/Vancouver',label: 'PST/PDT — Canada / Vancouver (UTC-8)',offset:'-08:00',region:'Americas',country:'Canada',      order: 55 },
  { value: 'America/Sao_Paulo',label: 'BRT — Brazil / São Paulo (UTC-3)',offset: '-03:00', region: 'Americas',country: 'Brazil',      order: 56 },

  // ── Pacific / Other ───────────────────────────────────────────────────────
  { value: 'Australia/Sydney', label: 'AEST/AEDT — Australia / Sydney (UTC+10)',offset:'+10:00',region:'Pacific',country:'Australia', order: 60 },
  { value: 'Pacific/Auckland', label: 'NZST/NZDT — New Zealand (UTC+12)',offset:'+12:00', region: 'Pacific', country: 'New Zealand',  order: 61 },
  { value: 'UTC',              label: 'UTC — Coordinated Universal Time',offset: '+00:00', region: 'Other',   country: '',            order: 99 },
];

async function seedIfEmpty() {
  await Promise.all(
    DEFAULT_TIMEZONES.map((tz) =>
      Timezone.updateOne(
        { value: tz.value },
        { $setOnInsert: { ...tz, isActive: true } },
        { upsert: true },
      )
    )
  );
}

// GET all timezones
router.get('/', async (req, res) => {
  try {
    await seedIfEmpty();
    const { isActive, region } = req.query;
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (region) query.region = region;

    const timezones = await Timezone.find(query).sort({ order: 1, label: 1 }).lean();
    res.json({ success: true, data: timezones });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET one
router.get('/:id', async (req, res) => {
  try {
    const tz = await Timezone.findById(req.params.id);
    if (!tz) return res.status(404).json({ success: false, message: 'Timezone not found' });
    res.json({ success: true, data: tz });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create (admin only)
router.post('/', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const tz = await Timezone.create(req.body);
    res.status(201).json({ success: true, data: tz });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update
router.put('/:id', protect, authorize('super_admin', 'operations'), async (req, res) => {
  try {
    const tz = await Timezone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!tz) return res.status(404).json({ success: false, message: 'Timezone not found' });
    res.json({ success: true, data: tz });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    const tz = await Timezone.findByIdAndDelete(req.params.id);
    if (!tz) return res.status(404).json({ success: false, message: 'Timezone not found' });
    res.json({ success: true, message: 'Timezone deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
