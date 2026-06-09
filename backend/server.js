/**
 * server.js — backend/server.js
 */
const dotenv = require('dotenv');
const path   = require('path');
dotenv.config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ──
const { router: authRouter }         = require('./routes/auth');
const { router: subscriptionRouter } = require('./routes/Subscription'); // capital S
const requireSub = require('./middleware/subscriptionMiddleware');

// Public (no subscription needed)
app.use('/api/auth',         authRouter);
app.use('/api/subscription', subscriptionRouter);
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Gated (subscription required)
app.use('/api/members',    requireSub, require('./routes/members'));
app.use('/api/trainers',   requireSub, require('./routes/trainers'));
app.use('/api/attendance', requireSub, require('./routes/attendance'));

// Serve frontend
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// DB + Start
const PORT      = process.env.PORT      || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gympro';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

app.listen(PORT, () => {
  console.log(`\n🚀 GymPro on port ${PORT}`);
  console.log(`🔐 Auth:         /api/auth`);
  console.log(`💳 Subscription: /api/subscription`);
  console.log(`📁 Members:      /api/members  [gated]`);
  console.log(`📁 Trainers:     /api/trainers [gated]`);
  console.log(`📅 Attendance:   /api/attendance [gated]\n`);
});
