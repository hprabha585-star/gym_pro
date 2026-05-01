const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import routes
const authRoutes = require('./routes/auth');

// ✅ API ROUTES FIRST
app.use('/api/auth', authRoutes.router);
app.use('/api/members', require('./routes/members'));
app.use('/api/trainers', require('./routes/trainers'));
app.use('/api/attendance', require('./routes/attendance'));

// ✅ Health check (only once)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running'
  });
});

// ✅ Serve frontend AFTER API
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ✅ Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ✅ MUST BE LAST (fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Server config
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gympro';

// DB connect
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server on http://localhost:${PORT}`);
  console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`📁 Members API: http://localhost:${PORT}/api/members`);
  console.log(`📁 Trainers API: http://localhost:${PORT}/api/trainers\n`);
});