const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { body, validationResult } = require('express-validator');

const JWT_SECRET    = process.env.JWT_SECRET || 'gympro_secret_key_2024';
const JWT_EXPIRES   = '7d';

/* ─── helpers ────────────────────────────────────────────────── */
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token.' }); }
};

const adminOnly = (req, res, next) => {
  if (!['admin','superadmin'].includes(req.user.role))
    return res.status(403).json({ error: 'Admin access only.' });
  next();
};

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'superadmin')
    return res.status(403).json({ error: 'Super-admin only.' });
  next();
};

function makeToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role,
      gymId: user.gymId || user._id, permissions: user.staffPermissions || {} },
    JWT_SECRET, { expiresIn: JWT_EXPIRES }
  );
}

/* ─── POST /register  (gym admin registers — awaits superadmin approval) ─ */
router.post('/register', [
  body('name').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, gymName } = req.body;

    // Block superadmin email
    if (email.toLowerCase() === 'hprabha585@gmail.com')
      return res.status(400).json({ error: 'This email cannot be used for registration.' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({
      error: existing.isApproved ? 'Email already registered.' : 'Registration already submitted. Awaiting approval.'
    });

    const user = new User({
      name, email, password, gymName: gymName || '',
      role: 'admin', isApproved: false, pendingApproval: true, isActive: true
    });
    await user.save();

    res.status(201).json({ message: 'Registration submitted. Awaiting GymPro approval.', pendingApproval: true });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /register-staff  (staff registers by entering admin email) ─── */
router.post('/register-staff', [
  body('name').notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  body('adminEmail').isEmail().withMessage('Valid admin email required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { name, email, password, adminEmail } = req.body;

    // Find the admin they want to join
    const admin = await User.findOne({ email: adminEmail.toLowerCase(), role: 'admin', isApproved: true, isActive: true });
    if (!admin) return res.status(404).json({ error: 'No approved gym found with that email. Check the admin email and try again.' });

    // Check email not already used
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'This email is already registered.' });

    const staff = new User({
      name, email, password,
      role: 'staff',
      gymId: admin.gymId || admin._id,
      isApproved: false,
      pendingApproval: true,
      isActive: false,
      staffPermissions: {
        viewMembers: true, addMembers: true, editMembers: true, deleteMembers: false,
        viewAttendance: true, markAttendance: true, viewTrainers: true,
        viewPayments: true, viewRevenue: false, viewSettings: false
      }
    });
    await staff.save();

    res.status(201).json({
      message: `Request sent to ${admin.gymName || admin.name}. Please wait for admin approval.`,
      pendingApproval: true
    });
  } catch (err) {
    console.error('Staff register error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /login ─────────────────────────────────────────────── */
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    if (!user.isApproved) {
      if (user.pendingApproval) return res.status(401).json({ error: 'Account pending approval. Please wait.' });
      return res.status(401).json({ error: `Account rejected: ${user.rejectionReason || 'Contact admin.'}` });
    }
    if (!user.isActive) return res.status(401).json({ error: 'Account deactivated. Contact your admin.' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    user.lastLogin = new Date();
    await user.save();

    res.json({
      message: 'Login successful',
      token: makeToken(user),
      user: {
        id: user._id, name: user.name, email: user.email,
        role: user.role, gymId: user.gymId || user._id,
        gymName: user.gymName || '', permissions: user.staffPermissions || {}
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── GET /me ─────────────────────────────────────────────────── */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── GET /pending-approvals  (superadmin: pending gym owners) ── */
router.get('/pending-approvals', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const list = await User.find({ role: 'admin', isApproved: false, pendingApproval: true })
      .select('-password').sort({ createdAt: -1 });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── GET /pending-staff  (admin: pending staff requests for their gym) ─ */
router.get('/pending-staff', verifyToken, adminOnly, async (req, res) => {
  try {
    const gymId = req.user.gymId || req.user.userId;
    const list = await User.find({ role: 'staff', gymId: gymId, isApproved: false, pendingApproval: true })
      .select('-password').sort({ createdAt: -1 });
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── POST /approve/:userId  (superadmin approves gym admin) ──── */
router.post('/approve/:userId', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.isApproved    = true;
    user.pendingApproval = false;
    user.isActive      = true;
    user.approvedBy    = req.user.userId;
    user.approvedAt    = new Date();
    user.rejectionReason = '';
    if (!user.gymId) user.gymId = user._id; // admin owns their own gym
    await user.save();

    res.json({ message: `${user.gymName || user.name} approved.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── POST /approve-staff/:userId  (admin approves staff request) */
router.post('/approve-staff/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const staff = await User.findById(req.params.userId);
    if (!staff || staff.role !== 'staff') return res.status(404).json({ error: 'Staff not found.' });

    // Verify this staff belongs to the approving admin's gym
    const gymId = String(req.user.gymId || req.user.userId);
    if (String(staff.gymId) !== gymId) return res.status(403).json({ error: 'Not your staff request.' });

    staff.isApproved     = true;
    staff.pendingApproval = false;
    staff.isActive       = true;
    staff.approvedBy     = req.user.userId;
    staff.approvedAt     = new Date();
    staff.rejectionReason = '';
    await staff.save();

    res.json({ message: `${staff.name} approved as staff.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── POST /reject/:userId  (superadmin rejects gym admin) ────── */
router.post('/reject/:userId', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.isApproved = false; user.pendingApproval = false;
    user.isActive   = false; user.rejectionReason = req.body.reason || 'Not approved.';
    await user.save();
    res.json({ message: `${user.name} rejected.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── POST /reject-staff/:userId  (admin rejects staff request) ─ */
router.post('/reject-staff/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    const staff = await User.findById(req.params.userId);
    if (!staff) return res.status(404).json({ error: 'Staff not found.' });
    staff.isApproved = false; staff.pendingApproval = false;
    staff.isActive   = false; staff.rejectionReason = req.body.reason || 'Not approved.';
    await staff.save();
    res.json({ message: `${staff.name} rejected.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── POST /logout ───────────────────────────────────────────── */
router.post('/logout', verifyToken, (req, res) => res.json({ message: 'Logged out.' }));

/* --- GET /gym-profile (returns gym owner's gymData - works for both admin and staff) --- */
router.get('/gym-profile', verifyToken, async (req, res) => {
  try {
    const ownerId = req.user.gymId || req.user.userId;
    const owner = await User.findById(ownerId).select('gymData gymName name');
    if (!owner) return res.status(404).json({ error: 'Gym profile not found.' });
    res.json({ gymData: owner.gymData || '{}', gymName: owner.gymName || owner.name || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* --- PATCH /profile (saves to gym owner account so staff and admin share same settings) --- */
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const ownerId = req.user.gymId || req.user.userId;
    const owner = await User.findById(ownerId);
    if (!owner) return res.status(404).json({ error: 'Gym profile not found.' });
    if (req.body.gymData !== undefined) owner.gymData = req.body.gymData;
    if (req.body.gymName !== undefined) owner.gymName = req.body.gymName;
    await owner.save();
    res.json({ message: 'Profile updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, verifyToken, adminOnly, superAdminOnly };
