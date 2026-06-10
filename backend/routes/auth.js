const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');

const JWT_SECRET = process.env.JWT_SECRET || 'gympro_secret_key_2024';
const JWT_EXPIRES_IN = '7d';

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware for admin only
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
};

// Register new user (requires admin approval)
router.post('/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { name, email, password, role } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (!existingUser.isApproved) {
        return res.status(400).json({ error: 'Account already requested. Waiting for admin approval.' });
      }
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    const user = new User({
      name,
      email,
      password,
      role: role || 'staff',
      isApproved: false,
      pendingApproval: true
    });
    
    await user.save();
    
    res.status(201).json({
      message: 'Registration request submitted. Waiting for admin approval.',
      pendingApproval: true
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Login user (check approval status)
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if user is approved
    if (!user.isApproved) {
      if (user.pendingApproval) {
        return res.status(401).json({ error: 'Account pending admin approval. Please wait.' });
      }
      if (user.rejectionReason) {
        return res.status(401).json({ error: `Account rejected: ${user.rejectionReason}` });
      }
      return res.status(401).json({ error: 'Account has been rejected. Contact admin.' });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated. Contact admin.' });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get pending approvals (admin only)
router.get('/pending-approvals', verifyToken, adminOnly, async (req, res) => {
  try {
    const pendingUsers = await User.find({ 
      isApproved: false, 
      pendingApproval: true 
    }).select('-password').sort({ createdAt: -1 });
    res.json(pendingUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve user (admin only)
router.post('/approve/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get admin name
    const admin = await User.findById(req.user.userId);
    
    user.isApproved = true;
    user.pendingApproval = false;
    user.approvedBy = req.user.userId;
    user.approvedByName = admin ? admin.name : 'Admin';
    user.approvedAt = new Date();
    user.rejectionReason = '';
    
    await user.save();
    
    res.json({ 
      message: `User ${user.name} has been approved`,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject user (admin only)
router.post('/reject/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.isApproved = false;
    user.pendingApproval = false;
    user.isActive = false;
    user.rejectionReason = reason || 'No reason provided';
    
    await user.save();
    
    res.json({ 
      message: `User ${user.name} has been rejected`,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout (client side - just inform)
router.post('/logout', verifyToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Get all users (admin only)
router.get('/users', verifyToken, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Profile
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const { gymData } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (gymData !== undefined) {
      user.gymData = gymData;
    }
    
    await user.save();
    res.json({ message: 'Profile updated successfully', user: { id: user._id, name: user.name, gymData: user.gymData } });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

module.exports = { router, verifyToken, adminOnly };
