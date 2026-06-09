/**
 * routes/Subscription.js
 * backend/routes/Subscription.js
 */
const express      = require('express');
const router       = express.Router();
const Subscription = require('../models/Subscription');
const { verifyToken } = require('./auth');

const PLANS = {
  monthly: { price: 299,  days: 30,  label: '1 Month' },
  yearly:  { price: 2499, days: 365, label: '1 Year'  },
  trial:   { price: 0,    days: 14,  label: '14-Day Trial' }
};

const BANK_DETAILS = {
  accountName:   process.env.BANK_ACCOUNT_NAME   || 'GymPro Software',
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || '1234567890',
  ifsc:          process.env.BANK_IFSC           || 'SBIN0001234',
  bank:          process.env.BANK_NAME           || 'State Bank of India',
  upi:           process.env.BANK_UPI            || 'gympro@upi'
};

async function getOrCreateSub(userId) {
  let sub = await Subscription.findOne({ userId });
  if (!sub) {
    const end = new Date();
    end.setDate(end.getDate() + 14);
    sub = await Subscription.create({
      userId, plan: 'trial', status: 'active',
      startDate: new Date(), endDate: end
    });
  }
  if (sub.status === 'active' && new Date() > sub.endDate) {
    sub.status = 'expired';
    await sub.save();
  }
  return sub;
}

// GET /api/subscription/status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const sub = await getOrCreateSub(req.user.userId);
    res.json({
      plan: sub.plan, status: sub.status,
      startDate: sub.startDate, endDate: sub.endDate,
      daysLeft: sub.daysLeft(), isActive: sub.isActive(),
      plans: PLANS, bankDetails: BANK_DETAILS,
      pendingPayment: sub.status === 'pending' ? {
        utrNumber: sub.paymentProof.utrNumber,
        amount: sub.paymentProof.amount,
        submittedAt: sub.paymentProof.submittedAt
      } : null
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/subscription/submit-payment
router.post('/submit-payment', verifyToken, async (req, res) => {
  try {
    const { plan, utrNumber, amount, screenshot } = req.body;
    if (!PLANS[plan])  return res.status(400).json({ error: 'Invalid plan' });
    if (!utrNumber)    return res.status(400).json({ error: 'UTR number required' });
    if (!amount)       return res.status(400).json({ error: 'Amount required' });
    const sub = await getOrCreateSub(req.user.userId);
    sub.status = 'pending';
    sub.paymentProof = {
      utrNumber, amount: parseFloat(amount),
      screenshot: screenshot || '',
      submittedAt: new Date(), notes: plan
    };
    await sub.save();
    res.json({ message: 'Payment submitted! Admin will verify within 24 hours.', status: 'pending' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/subscription/activate  (admin only)
router.post('/activate', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { userId, plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    if (!userId)      return res.status(400).json({ error: 'userId required' });
    let sub = await Subscription.findOne({ userId });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    const now    = new Date();
    const base   = sub.isActive() ? sub.endDate : now;
    const newEnd = new Date(base);
    newEnd.setDate(newEnd.getDate() + PLANS[plan].days);
    sub.paymentHistory.push({
      plan, amount: sub.paymentProof?.amount || PLANS[plan].price,
      utrNumber: sub.paymentProof?.utrNumber || '',
      paidAt: now, validFrom: base, validTo: newEnd
    });
    sub.plan = plan; sub.status = 'active';
    sub.startDate = now; sub.endDate = newEnd;
    sub.paymentProof = {
      ...sub.paymentProof,
      verifiedAt: now, verifiedBy: req.user.email
    };
    await sub.save();
    res.json({
      message: `${plan} activated until ${newEnd.toLocaleDateString('en-IN')}`,
      endDate: newEnd, daysLeft: sub.daysLeft()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/subscription/reject  (admin only)
router.post('/reject', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const sub = await Subscription.findOne({ userId });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    sub.status = 'expired';
    sub.paymentProof = {
      utrNumber: '', amount: 0, screenshot: '',
      notes: 'rejected by admin', submittedAt: null
    };
    await sub.save();
    res.json({ message: 'Payment rejected. User set to expired.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/subscription/all  (admin only)
router.get('/all', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const subs = await Subscription.find()
      .populate('userId', 'name email role')
      .sort({ updatedAt: -1 });
    res.json(subs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, PLANS };
