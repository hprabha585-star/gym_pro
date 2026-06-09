/**
 * middleware/subscriptionMiddleware.js
 * Blocks API if subscription expired. Admin always passes.
 */
const Subscription = require('../models/Subscription');

const ADMIN_EMAIL = 'hprabha585@gmail.com';

const requireSubscription = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.userId || req.user.id || req.user._id);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    // Admin always bypasses subscription check
    if (req.user.role === 'admin' || req.user.email === ADMIN_EMAIL) {
      return next();
    }

    let sub = await Subscription.findOne({ userId });

    // Auto-create 14-day trial for new users
    if (!sub) {
      const end = new Date();
      end.setDate(end.getDate() + 14);
      sub = await Subscription.create({
        userId, plan: 'trial', status: 'active',
        startDate: new Date(), endDate: end
      });
    }

    // Auto-expire
    if (sub.status === 'active' && new Date() > sub.endDate) {
      sub.status = 'expired';
      await sub.save();
    }

    if (sub.isActive()) {
      req.subscription = {
        plan: sub.plan, daysLeft: sub.daysLeft(), endDate: sub.endDate
      };
      return next();
    }

    return res.status(402).json({
      error:   'subscription_expired',
      message: sub.status === 'pending'
        ? 'Payment under review. Contact admin to activate.'
        : 'Subscription expired. Please renew.',
      status:  sub.status,
      plan:    sub.plan,
      endDate: sub.endDate
    });

  } catch (err) {
    console.error('subscriptionMiddleware error:', err.message);
    return next(); // Never block on middleware errors
  }
};

module.exports = requireSubscription;
