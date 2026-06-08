/**
 * subscriptionMiddleware.js
 * Place in: backend/middleware/subscriptionMiddleware.js
 *
 * Blocks API access if user's subscription is expired.
 * Returns HTTP 402 with error: "subscription_expired"
 */

const Subscription = require('../models/Subscription');

const requireSubscription = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.userId || req.user.id || req.user._id);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    let sub = await Subscription.findOne({ userId });

    // First time user — create 14-day trial automatically
    if (!sub) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      sub = await Subscription.create({
        userId,
        plan:      'trial',
        status:    'active',
        startDate: new Date(),
        endDate:   trialEnd
      });
    }

    // Auto-expire
    if (sub.status === 'active' && new Date() > sub.endDate) {
      sub.status = 'expired';
      await sub.save();
    }

    if (sub.isActive()) {
      req.subscription = {
        plan:     sub.plan,
        daysLeft: sub.daysLeft(),
        endDate:  sub.endDate
      };
      return next();
    }

    // Block: subscription expired or pending
    return res.status(402).json({
      error:   'subscription_expired',
      message: sub.status === 'pending'
        ? 'Payment under review. Contact admin to activate.'
        : 'Subscription expired. Please renew to continue.',
      status:  sub.status,
      plan:    sub.plan,
      endDate: sub.endDate
    });

  } catch (err) {
    // On DB error, let request through (don't block users on middleware bugs)
    console.error('subscriptionMiddleware error:', err.message);
    return next();
  }
};

module.exports = requireSubscription;
