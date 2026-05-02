const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET all members
router.get('/', async (req, res) => {
  try {
    const members = await Member.find({ userId: req.user.userId }).sort({ joinDate: -1 });
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single member
router.get('/:id', async (req, res) => {
  try {
    // Skip special routes that use /:id pattern
    if (['stats','attendance','payment-reminders'].includes(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const member = await Member.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add new member
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
    const member = new Member({ ...memberData, userId: req.user.userId });
    const newMember = await member.save();
    res.status(201).json(newMember);
  } catch (err) {
    console.error('Add member error:', err);
    res.status(400).json({ error: err.message });
  }
});

// PUT update member
router.put('/:id', async (req, res) => {
  try {
    const allowedFields = [
      'name','phone','email','age','gender','photo',
      'plan','planPrice','discountType','discountValue','discountReason',
      'admissionFee','admissionWaived',
      'ptEnabled','ptFee','ptTrainer','ptNotes',
      'expiryDate','status',
      'emergencyContact','healthConditions','medicalNotes'
    ];
    const update = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });

    // If phone is being changed, check for duplicates
    if (update.phone) {
      const existing = await Member.findOne({
        userId: req.user.userId,
        phone: update.phone,
        _id: { $ne: req.params.id }
      });
      if (existing) return res.status(400).json({ error: 'Another member with this phone already exists' });
    }

    const member = await Member.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      update,
      { new: true, runValidators: true }
    );
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE member
router.delete('/:id', async (req, res) => {
  try {
    const member = await Member.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await Attendance.deleteMany({ userId: req.user.userId, memberId: req.params.id });
    res.json({ message: 'Member deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET attendance for a specific date
router.get('/attendance/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const attendances = await Attendance.find({ 
      userId: req.user.userId, date 
    }).populate('memberId', 'name phone plan status');
    res.json(attendances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST mark attendance
router.post('/attendance', async (req, res) => {
  try {
    const { memberId, date, status } = req.body;
    const member = await Member.findOne({ _id: memberId, userId: req.user.userId });
    if (!member) return res.status(404).json({ error: 'Member not found' });
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

// GET payment reminders
router.get('/payment-reminders', async (req, res) => {
  try {
    const dueMembers = await Member.find({
      userId: req.user.userId,
      status: 'Active',
      expiryDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    });
    res.json({ dueCount: dueMembers.length, dueMembers, overdueCount: 0 });
  } catch (err) {
    res.json({ dueCount: 0, dueMembers: [], overdueCount: 0 });
  }
});

module.exports = router;
