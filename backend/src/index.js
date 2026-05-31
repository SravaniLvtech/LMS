require('dotenv').config();
const express = require('express');
const path    = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');

const app = express();

connectDB();

app.use(helmet({ crossOriginResourcePolicy: false }));  // allow cross-origin for served uploads
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));

// ── Static files (uploaded videos / images) ───────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' })); // raised to support base64 profile image uploads

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api', limiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/tutors', require('./routes/tutors'));
app.use('/api/students', require('./routes/students'));
app.use('/api/courses',   require('./routes/courses'));
app.use('/api/sessions',  require('./routes/sessions'));
app.use('/api/timezones', require('./routes/timezones'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/revenue', require('./routes/revenue'));
app.use('/api/tutor-attendance', require('./routes/tutorAttendance'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/cart',          require('./routes/cart'));
app.use('/api/wishlist',      require('./routes/wishlist'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/attendance',    require('./routes/attendance'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MathPath API running on port ${PORT}`));
