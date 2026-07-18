const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { verifyToken, adminOnly, superAdminOnly } = require('./auth');

// ══════════════════════════════════════════════════════════════
//  SUPERADMIN routes  —  only hprabha585@gmail.com
// ══════════════════════════════════════════════════════════════

// GET /admin/gyms  — list all approved gym accounts
router.get('/gyms', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const gyms = await User.find({ role: 'admin', isApproved: true })
      .select('-password').sort({ createdAt: -1 });
    res.json(gyms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /admin/all-gyms-stats — total gyms, pending, staff counts
router.get('/all-gyms-stats', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const totalGyms   = await User.countDocuments({ role: 'admin', isApproved: true });
    const pendingGyms = await User.countDocuments({ role: 'admin', isApproved: false, pendingApproval: true });
    const totalStaff  = await User.countDocuments({ role: 'staff' });
    res.json({ totalGyms, pendingGyms, totalStaff });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /admin/gym/:gymId  — superadmin removes a gym account
router.delete('/gym/:gymId', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const gym = await User.findOneAndDelete({ _id: req.params.gymId, role: 'admin' });
    if (!gym) return res.status(404).json({ error: 'Gym account not found.' });
    // Also remove all staff under this gym
    await User.deleteMany({ gymId: gym._id, role: 'staff' });
    res.json({ message: `${gym.gymName || gym.name} removed.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/gym/:gymId/toggle — superadmin activate/deactivate a gym
router.patch('/gym/:gymId/toggle', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const gym = await User.findOne({ _id: req.params.gymId, role: 'admin' });
    if (!gym) return res.status(404).json({ error: 'Gym not found.' });
    gym.isActive = !gym.isActive;
    await gym.save();
    res.json({ message: `${gym.gymName || gym.name} is now ${gym.isActive ? 'active' : 'suspended'}.`, isActive: gym.isActive });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  GYM ADMIN routes  —  gym owner manages their staff
// ══════════════════════════════════════════════════════════════

// GET /admin/staff  — list staff under this gym admin
router.get('/staff', verifyToken, adminOnly, async (req, res) => {
  try {
    const gymId = req.user.gymId || req.user.userId;
    const staff = await User.find({ gymId, role: 'staff' })
      .select('-password').sort({ createdAt: -1 });
    res.json(staff);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /admin/create-staff  — gym admin creates staff directly (no approval)
router.post('/create-staff', verifyToken, adminOnly, async (req, res) => {
  try {
    if (req.user.role === 'superadmin')
      return res.status(400).json({ error: 'Superadmin does not manage staff. Use a gym admin account.' });

    const { name, email, password, permissions } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });

    const emailLower = email.toLowerCase().trim();
    const existing = await User.findOne({ email: emailLower });
    if (existing) return res.status(400).json({ error: 'Email already registered.' });

    const admin = await User.findById(req.user.userId);
    const gymId = admin.gymId || admin._id;

    const defaultPerms = {
      viewMembers: true, addMembers: true, editMembers: true, deleteMembers: false,
      viewAttendance: true, markAttendance: true, viewTrainers: true,
      viewPayments: true, viewRevenue: false, viewSettings: false
    };

    const staff = new User({
      name, email: emailLower, password,
      role: 'staff',
      gymId,
      isApproved: true,
      pendingApproval: false,
      isActive: true,
      approvedBy: req.user.userId,
      approvedByName: admin.name,
      approvedAt: new Date(),
      staffPermissions: { ...defaultPerms, ...(permissions || {}) }
    });
    await staff.save();

    res.status(201).json({
      message: `Staff account created for ${name}.`,
      staff: { id: staff._id, name: staff.name, email: staff.email }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/staff/:staffId/permissions  — gym admin updates staff access
router.patch('/staff/:staffId/permissions', verifyToken, adminOnly, async (req, res) => {
  try {
    const gymId = String(req.user.gymId || req.user.userId);
    const staff = await User.findById(req.params.staffId);
    if (!staff || staff.role !== 'staff')
      return res.status(404).json({ error: 'Staff not found.' });
    if (String(staff.gymId) !== gymId)
      return res.status(403).json({ error: 'Not your staff member.' });

    // Merge incoming permissions
    Object.assign(staff.staffPermissions, req.body);
    staff.markModified('staffPermissions');
    await staff.save();

    res.json({ message: 'Permissions updated.', permissions: staff.staffPermissions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /admin/user/:userId/toggle  — activate / deactivate staff
router.patch('/user/:userId/toggle', verifyToken, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `${user.name} is now ${user.isActive ? 'active' : 'inactive'}.`, isActive: user.isActive });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /admin/user/:userId  — gym admin removes staff
router.delete('/user/:userId', verifyToken, adminOnly, async (req, res) => {
  try {
    if (req.params.userId === req.user.userId)
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `${user.name} deleted.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /admin/users  — all users (superadmin only)
router.get('/users', verifyToken, superAdminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
