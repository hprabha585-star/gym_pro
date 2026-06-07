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
const authRoutes     = require('./routes/auth');
const requireSub     = require('./middleware/subscriptionMiddleware');

// Auth routes (NO subscription gate — needed to log in)
app.use('/api/auth', authRoutes.router);

// Subscription routes (NO gate — needed to check/renew)
app.use('/api/subscription', require('./routes/Subscription').router);

// ── GATED ROUTES — blocked if subscription expired ──
app.use('/api/members',   requireSub, require('./routes/members'));
app.use('/api/trainers',  requireSub, require('./routes/trainers'));
app.use('/api/attendance',requireSub, require('./routes/attendance'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', time: new Date() });
});

// Serve frontend
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// DB + Server
const PORT      = process.env.PORT      || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gympro';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

app.listen(PORT, () => {
  console.log(`🚀 Server on http://localhost:${PORT}`);
  console.log(`🔐 Auth:         /api/auth`);
  console.log(`💳 Subscription: /api/subscription`);
  console.log(`📁 Members:      /api/members  [gated]`);
  console.log(`📁 Trainers:     /api/trainers [gated]`);
});
