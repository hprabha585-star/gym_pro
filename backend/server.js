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

// ── Import routes ──
const { router: authRouter } = require('./routes/auth');
const requireSub = require('./middleware/subscriptionMiddleware');

// ── Public routes (no subscription check) ──
app.use('/api/auth', authRouter);
app.use('/api/subscription', require('./routes/subscription').router);

// ── Health check (public) ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// ── Protected routes (subscription required) ──
app.use('/api/members',    requireSub, require('./routes/members'));
app.use('/api/trainers',   requireSub, require('./routes/trainers'));
app.use('/api/attendance', requireSub, require('./routes/attendance'));

// ── Serve frontend ──
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// ── Database ──
const PORT      = process.env.PORT      || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gympro';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

app.listen(PORT, () => {
  console.log(`\n🚀 GymPro Server running on port ${PORT}`);
  console.log(`🔐 Auth:         /api/auth`);
  console.log(`💳 Subscription: /api/subscription`);
  console.log(`📁 Members:      /api/members  [subscription gated]`);
  console.log(`📁 Trainers:     /api/trainers [subscription gated]`);
  console.log(`📅 Attendance:   /api/attendance [subscription gated]\n`);
});
