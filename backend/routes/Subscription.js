const express    = require('express');
const router     = express.Router();
const Subscription = require('../models/Subscription');
const { verifyToken } = require('./auth');

// ── PRICING CONFIG ──
const PLANS = {
  monthly: { price: 299,  days: 30,  label: '1 Month'  },
  yearly:  { price: 2499, days: 365, label: '1 Year'   },
  trial:   { price: 0,    days: 14,  label: '14-Day Trial' }
};

// Bank details for manual transfer
const BANK_DETAILS = {
  accountName:   process.env.BANK_ACCOUNT_NAME   || 'GymPro Software',
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || '1234567890',
  ifsc:          process.env.BANK_IFSC           || 'SBIN0001234',
  bank:          process.env.BANK_NAME           || 'State Bank of India',
  upi:           process.env.BANK_UPI            || 'gympro@upi'
};

// ── GET: Current subscription status ──
router.get('/status', verifyToken, async (req, res) => {
  try {
    let sub = await Subscription.findOne({ userId: req.user.userId });

    if (!sub) {
      // Create free trial for new user
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      sub = await Subscription.create({
        userId:    req.user.userId,
        plan:      'trial',
        status:    'active',
        startDate: new Date(),
        endDate:   trialEnd
      });
    }

    // Auto-expire if past end date
    if (sub.status === 'active' && new Date() > sub.endDate) {
      sub.status = 'expired';
      await sub.save();
    }

    res.json({
      plan:      sub.plan,
      status:    sub.status,
      startDate: sub.startDate,
      endDate:   sub.endDate,
      daysLeft:  sub.daysLeft(),
      isActive:  sub.isActive(),
      plans:     PLANS,
      bankDetails: BANK_DETAILS,
      pendingPayment: sub.status === 'pending' ? {
        utrNumber:   sub.paymentProof.utrNumber,
        amount:      sub.paymentProof.amount,
        submittedAt: sub.paymentProof.submittedAt
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST: Submit payment proof ──
router.post('/submit-payment', verifyToken, async (req, res) => {
  try {
    const { plan, utrNumber, amount, screenshot } = req.body;

    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    if (!utrNumber)   return res.status(400).json({ error: 'UTR number required' });
    if (!amount)      return res.status(400).json({ error: 'Amount required' });

    let sub = await Subscription.findOne({ userId: req.user.userId });
    if (!sub) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      sub = new Subscription({ userId: req.user.userId, endDate: trialEnd });
    }

    sub.status = 'pending';
    sub.paymentProof = {
      utrNumber,
      amount,
      screenshot: screenshot || '',
      submittedAt: new Date()
    };
    // Store which plan they paid for in notes
    sub.paymentProof.notes = plan;
    await sub.save();

    res.json({
      message: 'Payment proof submitted! Admin will verify within 24 hours.',
      status: 'pending'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST: Admin activates subscription ──
router.post('/activate', verifyToken, async (req, res) => {
  try {
    // Only admin can activate
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { userId, plan, notes } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    let sub = await Subscription.findOne({ userId: userId || req.user.userId });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const now   = new Date();
    // If currently active, extend from current end date
    const base  = sub.isActive() ? sub.endDate : now;
    const newEnd = new Date(base);
    newEnd.setDate(newEnd.getDate() + PLANS[plan].days);

    // Save payment history
    sub.paymentHistory.push({
      plan,
      amount:    sub.paymentProof.amount || PLANS[plan].price,
      utrNumber: sub.paymentProof.utrNumber || '',
      paidAt:    now,
      validFrom: base,
      validTo:   newEnd
    });

    sub.plan      = plan;
    sub.status    = 'active';
    sub.startDate = now;
    sub.endDate   = newEnd;
    if (notes) sub.paymentProof.notes = notes;
    sub.paymentProof.verifiedAt = now;
    sub.paymentProof.verifiedBy = req.user.email;
    await sub.save();

    res.json({
      message: `Subscription activated: ${plan} until ${newEnd.toLocaleDateString()}`,
      endDate: newEnd,
      daysLeft: sub.daysLeft()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET: Admin — list all subscriptions ──
router.get('/all', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const subs = await Subscription.find().populate('userId', 'name email role');
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST: Admin rejects a pending payment ──
router.post('/reject', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { userId } = req.body;
    const sub = await Subscription.findOne({ userId });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    sub.status = 'expired';
    sub.paymentProof = { utrNumber:'', amount:0, screenshot:'', notes:'rejected' };
    await sub.save();
    res.json({ message: 'Payment rejected. User status set to expired.' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, PLANS };
