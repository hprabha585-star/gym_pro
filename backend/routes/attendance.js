const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET attendance
router.get('/', async (req, res) => {
  try {
    const data = await Attendance.find({
      userId: req.user.userId
    }).populate('memberId');

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MARK attendance
router.post('/', async (req, res) => {
  try {
    const { memberId, status, date } = req.body;

    const attendance = new Attendance({
      userId: req.user.userId,
      memberId,
      status,
      date
    });

    await attendance.save();
    res.status(201).json(attendance);

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;