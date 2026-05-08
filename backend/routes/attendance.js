const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET attendance
router.get('/', async (req, res) => {
  try {
    // Safely grab the user ID regardless of how the JWT token was structured
    const userId = req.user.userId || req.user.id || req.user._id;
    
    const data = await Attendance.find({ userId: userId }).populate('memberId');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MARK attendance (BULLETPROOF METHOD)
router.post('/', async (req, res) => {
  try {
    const { memberId, status, date } = req.body;
    
    // Safely grab the user ID
    const userId = req.user.userId || req.user.id || req.user._id;

    if (!userId) {
      return res.status(400).json({ error: 'Authentication token missing User ID' });
    }

    if (!memberId || !status || !date) {
      return res.status(400).json({ error: 'Missing required attendance fields' });
    }

    // 1. Check if a record already exists for this exact member on this exact day
    let attendance = await Attendance.findOne({
      userId: userId,
      memberId: memberId,
      date: date
    });

    if (attendance) {
      // 2a. If it exists, just update their status
      attendance.status = status;
      attendance.markedAt = Date.now();
      await attendance.save();
    } else {
      // 2b. If it does NOT exist, create a brand new record
      attendance = new Attendance({
        userId: userId,
        memberId: memberId,
        date: date,
        status: status
      });
      await attendance.save();
    }

    // Success! Send it back to the frontend
    res.status(200).json(attendance);

  } catch (err) {
    console.error("Attendance Save Error:", err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
