const express   = require('express');
const router    = express.Router();
const jwt       = require('jsonwebtoken');
const User      = require('../models/User');
const { body, validationResult } = require('express-validator');

const JWT_SECRET    = process.env.JWT_SECRET || 'gympro_secret_key_2024';
const JWT_EXPIRES   = '7d';
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || 'hprabha585@gmail.com').toLowerCase();

// ── Middleware ────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token.' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin')
    return res.status(403).json({ error: 'Admin access only.' });
  next();
};

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'superadmin')
    return res.status(403).json({ error: 'Super-admin access only.' });
  next();
};

// ── JWT builder ───────────────────────────────────────────────
function buildToken(user) {
  return jwt.sign({
    userId:      user._id,
    email:       user.email,
    role:        user.role,
    gymId:       user.gymId || user._id,
    permissions: user.staffPermissions || {}
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── POST /register  ───────────────────────────────────────────
// Public: gym owners register here. superadmin must approve them.
// Staff are never registered this way — gym admin creates them directly.
router.post('/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, gymName } = req.body;
    const emailLower = email.toLowerCase().trim();

    // Block superadmin email from self-registering
    if (emailLower === SUPERADMIN_EMAIL)
      return res.status(400).json({ error: 'This email is reserved.' });

    const existing = await User.findOne({ email: emailLower });
    if (existing) {
      return res.status(400).json({
        error: existing.isApproved
          ? 'Email already registered.'
          : 'Registration already submitted. Waiting for approval.'
      });
    }

    // All public registrations = gym owner (admin) pending approval
    const user = new User({
      name, email: emailLower, password,
      role: 'admin',
      gymName: gymName || '',
      isApproved: false,
      pendingApproval: true
    });
    await user.save();

    res.status(201).json({
      message: 'Registration submitted! GymPro team will approve your account shortly.',
      pendingApproval: true
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /login ───────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    // Staff accounts are pre-approved by their gym admin — skip approval check
    if (user.role !== 'staff' && user.role !== 'superadmin') {
      if (!user.isApproved) {
        if (user.pendingApproval)
          return res.status(401).json({ error: 'Your GymPro account is pending approval by the GymPro team. Please wait.' });
        return res.status(401).json({ error: `Account rejected: ${user.rejectionReason || 'Contact GymPro support.'}` });
      }
    }
    if (!user.isActive)
      return res.status(401).json({ error: 'Account deactivated. Contact your administrator.' });

    if (!await user.comparePassword(password))
      return res.status(401).json({ error: 'Invalid email or password.' });

    user.lastLogin = new Date();
    await user.save();

    const token = buildToken(user);
    res.json({
      message: 'Login successful',
      token,
      user: {
        id:          user._id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        gymId:       user.gymId || user._id,
        gymName:     user.gymName || '',
        permissions: user.staffPermissions || {}
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /me ───────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /pending-approvals  (superadmin sees gym owners waiting) ──
router.get('/pending-approvals', verifyToken, async (req, res) => {
  try {
    // superadmin sees all pending gym-owner (admin) registrations
    // gym admin sees nothing here (they create staff directly)
    if (req.user.role !== 'superadmin')
      return res.json([]);

    const pending = await User.find({
      role: 'admin',
      isApproved: false,
      pendingApproval: true
    }).select('-password').sort({ createdAt: -1 });
    res.json(pending);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /approve/:userId  (superadmin approves gym owner) ───
router.post('/approve/:userId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Only GymPro super-admin can approve gym accounts.' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const me = await User.findById(req.user.userId);
    user.isApproved    = true;
    user.pendingApproval = false;
    user.approvedBy    = req.user.userId;
    user.approvedByName = me ? me.name : 'GymPro';
    user.approvedAt    = new Date();
    user.rejectionReason = '';
    // gymId = own _id (gym owner owns their gym's data)
    user.gymId = user._id;
    await user.save();

    res.json({ message: `${user.name}'s gym account approved.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /reject/:userId  (superadmin rejects gym owner) ─────
router.post('/reject/:userId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Only GymPro super-admin can reject accounts.' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.isApproved    = false;
    user.pendingApproval = false;
    user.isActive      = false;
    user.rejectionReason = req.body.reason || 'Not approved.';
    await user.save();

    res.json({ message: `${user.name}'s registration rejected.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /logout ──────────────────────────────────────────────
router.post('/logout', verifyToken, (req, res) => res.json({ message: 'Logged out.' }));

// ── PATCH /profile ────────────────────────────────────────────
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (req.body.gymData  !== undefined) user.gymData  = req.body.gymData;
    if (req.body.gymName  !== undefined) user.gymName  = req.body.gymName;
    await user.save();
    res.json({ message: 'Profile updated.', user: { id: user._id, name: user.name, gymData: user.gymData, gymName: user.gymName } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, verifyToken, adminOnly, superAdminOnly };
