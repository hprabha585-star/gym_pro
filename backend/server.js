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

// Import routes
const authRoutes = require('./routes/auth');

// API Routes
app.use('/api/auth',       authRoutes.router);
app.use('/api/members',    require('./routes/members'));
app.use('/api/trainers',   require('./routes/trainers'));
app.use('/api/attendance', require('./routes/attendance'));

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
  console.log(`\n🚀 GymPro Server on port ${PORT}`);
  console.log(`🔐 Auth:       /api/auth`);
  console.log(`📁 Members:    /api/members`);
  console.log(`📁 Trainers:   /api/trainers`);
  console.log(`📅 Attendance: /api/attendance\n`);
});
