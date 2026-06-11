const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Generate GYM QR code (for the gym entrance) - NOW WITH URL
router.get('/gym-qr', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create unique QR data for this gym
    const qrData = {
      gymId: userId,
      gymName: user.name || 'GymPro',
      type: 'gym_checkin',
      timestamp: Date.now()
    };
    
    // Encode the data as base64
    const encodedData = Buffer.from(JSON.stringify(qrData)).toString('base64');
    
    // Create a FULL URL that points to your check-in page
    const checkinUrl = `https://gym-pro-mvyv.onrender.com/member-checkin.html?qr=${encodeURIComponent(encodedData)}`;
    
    res.json({
      qrString: checkinUrl,
      qrData: encodedData,
      gymName: user.name,
      gymId: userId,
      checkinUrl: checkinUrl
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Member self check-in (public - members scan gym QR)
router.post('/member-checkin', async (req, res) => {
  try {
    const { qrData, memberId, phoneNumber } = req.body;
    
    if (!qrData) {
      return res.status(400).json({ error: 'QR data required' });
    }
    
    // Decode QR data
    let decoded;
    try {
      const decodedStr = Buffer.from(qrData, 'base64').toString();
      decoded = JSON.parse(decodedStr);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid QR code' });
    }
    
    // Verify it's a gym QR code
    if (decoded.type !== 'gym_checkin') {
      return res.status(400).json({ error: 'Invalid gym QR code' });
    }
    
    const { gymId } = decoded;
    
    // Find member by ID or phone number
    let member;
    if (memberId) {
      member = await Member.findOne({ _id: memberId, userId: gymId });
    } else if (phoneNumber) {
      const cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
      member = await Member.findOne({ phone: cleanPhone, userId: gymId });
    }
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found. Please check your Member ID or Phone number.' });
    }
    
    // Check if member is active
    if (member.status !== 'Active' && member.status !== 'Trial') {
      return res.status(403).json({ error: 'Membership is not active. Please contact gym staff.' });
    }
    
    // Check if membership expired
    if (member.expiryDate) {
      const expiryDate = new Date(member.expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (expiryDate < today) {
        return res.status(403).json({ error: 'Membership expired on ' + expiryDate.toLocaleDateString() + '. Please renew.' });
      }
    }
    
    // Mark attendance for today
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Check if already marked today
    const existingAttendance = await Attendance.findOne({
      userId: gymId,
      memberId: member._id,
      date: todayStr
    });
    
    if (existingAttendance && existingAttendance.status === 'Present') {
      return res.json({
        success: true,
        alreadyChecked: true,
        message: `Welcome back ${member.name}! You already checked in today.`,
        memberName: member.name,
        memberId: member._id,
        checkinTime: existingAttendance.markedAt
      });
    }
    
    const attendance = await Attendance.findOneAndUpdate(
      { userId: gymId, memberId: member._id, date: todayStr },
      { 
        userId: gymId, 
        memberId: member._id, 
        date: todayStr, 
        status: 'Present',
        markedAt: new Date(),
        checkinMethod: 'qr_member'
      },
      { upsert: true, new: true }
    );
    
    // Get attendance streak
    const lastWeekAttendances = await Attendance.find({
      userId: gymId,
      memberId: member._id,
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }
    });
    
    const weeklyCount = lastWeekAttendances.filter(a => a.status === 'Present').length;
    
    res.json({
      success: true,
      message: `✅ Welcome ${member.name}! Your attendance has been marked for today.`,
      memberName: member.name,
      memberId: member._id,
      memberPlan: member.plan,
      expiryDate: member.expiryDate,
      weeklyAttendance: weeklyCount,
      checkinTime: new Date()
    });
    
  } catch (err) {
    console.error('Member check-in error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get member's own attendance history (for member view)
router.post('/my-attendance', async (req, res) => {
  try {
    const { gymQRData, memberId, phoneNumber } = req.body;
    
    if (!gymQRData) {
      return res.status(400).json({ error: 'Gym QR data required' });
    }
    
    // Decode QR data
    const decodedStr = Buffer.from(gymQRData, 'base64').toString();
    const decoded = JSON.parse(decodedStr);
    
    if (decoded.type !== 'gym_checkin') {
      return res.status(400).json({ error: 'Invalid gym QR code' });
    }
    
    const { gymId } = decoded;
    
    // Find member
    let member;
    if (memberId) {
      member = await Member.findOne({ _id: memberId, userId: gymId });
    } else if (phoneNumber) {
      const cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
      member = await Member.findOne({ phone: cleanPhone, userId: gymId });
    }
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Get last 30 days attendance
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const attendances = await Attendance.find({
      userId: gymId,
      memberId: member._id,
      date: { $gte: startDateStr }
    }).sort({ date: -1 });
    
    const history = attendances.map(a => ({
      date: a.date,
      status: a.status,
      checkinMethod: a.checkinMethod
    }));
    
    res.json({
      memberName: member.name,
      memberPlan: member.plan,
      expiryDate: member.expiryDate,
      totalPresent: attendances.filter(a => a.status === 'Present').length,
      history
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all QR check-ins for today
router.get('/today-checkins', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const todayStr = new Date().toISOString().split('T')[0];
    
    const checkins = await Attendance.find({
      userId,
      date: todayStr,
      status: 'Present'
    }).populate('memberId', 'name phone plan');
    
    const members = checkins.map(c => ({
      memberId: c.memberId._id,
      name: c.memberId.name,
      phone: c.memberId.phone,
      plan: c.memberId.plan,
      checkinTime: c.markedAt,
      method: c.checkinMethod
    }));
    
    res.json({
      date: todayStr,
      totalCheckins: members.length,
      members
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
