const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken, adminOnly } = require('./auth');

// Get all staff users (admin only)
router.get('/staff', verifyToken, adminOnly, async (req, res) => {
  try {
    const staff = await User.find({ role: 'staff' }).select('-password').sort({ createdAt: -1 });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// Delete user (admin only)
router.delete('/user/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent admin from deleting themselves
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: `User ${user.name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle user active status (admin only)
router.patch('/user/:userId/toggle', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    res.json({ 
      message: `User ${user.name} is now ${user.isActive ? 'active' : 'inactive'}`,
      isActive: user.isActive
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user role (admin only)
router.patch('/user/:userId/role', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.role = role;
    await user.save();
    
    res.json({ 
      message: `User ${user.name} role updated to ${role}`,
      user: { id: user._id, name: user.name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user by ID (admin only)
router.get('/user/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
