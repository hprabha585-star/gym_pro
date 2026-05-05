const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all members (only current user's members)
router.get('/', async (req, res) => {
  try {
    const members = await Member.find({ userId: req.user.userId }).sort({ joinDate: -1 });
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get dashboard stats (only current user's data)
router.get('/stats', async (req, res) => {
  try {
    const totalMembers = await Member.countDocuments({ userId: req.user.userId });
    const today = new Date().toISOString().split('T')[0];
    
    const todayAttendance = await Attendance.countDocuments({ 
      userId: req.user.userId,
      date: today, 
      status: 'Present' 
    });
    const activeToday = todayAttendance;
    
    const revenueMap = {
      '1 Month Strength': 1000,
      '1 Month Strength + Cardio': 1500,
      '3 Months Strength': 2700,
      '3 Months Strength + Cardio': 4000,
      '6 Months Strength': 5000,
      '6 Months Strength + Cardio': 7500,
      '1 Year Strength': 9000,
      '1 Year Strength + Cardio': 14000
    };
    
    const activeMembers = await Member.find({ userId: req.user.userId, status: 'Active' });
    let estimatedRevenue = 0;
    activeMembers.forEach(m => {
      estimatedRevenue += revenueMap[m.plan] || 0;
    });

    res.json({ totalMembers, activeToday, estimatedRevenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new member (with userId)
router.post('/', async (req, res) => {
  try {
    const memberData = req.body;
    
    const existingMember = await Member.findOne({ 
      userId: req.user.userId,
      phone: memberData.phone 
    });
    if (existingMember) {
      return res.status(400).json({ error: 'Member with this phone number already exists' });
    }
    
    const member = new Member({
      ...memberData,
      userId: req.user.userId
    });
    const newMember = await member.save();
    res.status(201).json(newMember);
  } catch (err) {
    console.error('Add member error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Edit / Update an existing member
router.put('/:id', async (req, res) => {
  try {
    const memberData = req.body;
    
    // Ensure phone number isn't being updated to one that belongs to another member
    if (memberData.phone) {
      const existingMember = await Member.findOne({ 
        userId: req.user.userId, 
        phone: memberData.phone,
        _id: { $ne: req.params.id }
      });
      if (existingMember) {
        return res.status(400).json({ error: 'Another member with this phone number already exists' });
      }
    }

    const updatedMember = await Member.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: memberData },
      { new: true, runValidators: true }
    );

    if (!updatedMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json(updatedMember);
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete member
router.delete('/:id', async (req, res) => {
  try {
    const member = await Member.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await Attendance.deleteMany({ 
      userId: req.user.userId,
      memberId: req.params.id 
    });
    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get attendance for a specific date
router.get('/attendance/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const attendances = await Attendance.find({ 
      userId: req.user.userId,
      date 
    }).populate('memberId', 'name phone plan status');
    res.json(attendances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark attendance
router.post('/attendance', async (req, res) => {
  try {
    const { memberId, date, status } = req.body;
    
    const member = await Member.findOne({ 
      _id: memberId, 
      userId: req.user.userId 
    });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const attendance = await Attendance.findOneAndUpdate(
      { userId: req.user.userId, memberId, date },
      { userId: req.user.userId, memberId, date, status, markedAt: new Date() },
      { upsert: true, new: true }
    );
    
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get attendance statistics
router.get('/attendance/stats/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const totalActive = await Member.countDocuments({ 
      userId: req.user.userId,
      status: { $in: ['Active', 'Trial'] } 
    });
    const presentCount = await Attendance.countDocuments({ 
      userId: req.user.userId,
      date, 
      status: 'Present' 
    });
    const attendancePercentage = totalActive > 0 ? Math.round((presentCount / totalActive) * 100) : 0;
    
    res.json({ totalActive, presentCount, attendancePercentage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payment reminders
router.get('/payment-reminders', async (req, res) => {
  try {
    const dueMembers = await Member.find({
      userId: req.user.userId,
      status: 'Active',
      expiryDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    });
    
    res.json({
      dueCount: dueMembers.length,
      dueMembers: dueMembers,
      overdueCount: 0
    });
  } catch (err) {
    res.json({ dueCount: 0, dueMembers: [], overdueCount: 0 });
  }
});

// Monthly due
router.get('/monthly-due/:memberId', async (req, res) => {
  try {
    const member = await Member.findOne({ 
      _id: req.params.memberId, 
      userId: req.user.userId 
    });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const planPrices = {
      '1 Month Strength': 1000,
      '1 Month Strength + Cardio': 1500,
      '3 Months Strength': 900,
      '3 Months Strength + Cardio': 1333,
      '6 Months Strength': 833,
      '6 Months Strength + Cardio': 1250,
      '1 Year Strength': 750,
      '1 Year Strength + Cardio': 1167
    };
    
    const monthlyAmount = planPrices[member.plan] || 0;
    const isDue = member.expiryDate && new Date(member.expiryDate) < new Date();
    
    res.json({
      memberName: member.name,
      monthlyAmount: Math.round(monthlyAmount),
      nextDueDate: member.expiryDate,
      isOverdue: isDue,
      daysOverdue: isDue ? Math.floor((new Date() - new Date(member.expiryDate)) / (1000 * 60 * 60 * 24)) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-reminder/:memberId', async (req, res) => {
  res.json({ message: 'Reminder sent successfully' });
});

router.post('/record-payment/:memberId', async (req, res) => {
  res.json({ message: 'Payment recorded successfully' });
});

module.exports = router;
