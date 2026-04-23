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

// Serve frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Import auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes.router);

// API Routes (protected)
app.use('/api/members', require('./routes/members'));
app.use('/api/trainers', require('./routes/trainers'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running'
  });
});

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gympro';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));

app.listen(PORT, () => {
  console.log(`\n🚀 Server on http://localhost:${PORT}`);
  console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`📁 Members API: http://localhost:${PORT}/api/members`);
  console.log(`📁 Trainers API: http://localhost:${PORT}/api/trainers\n`);
});