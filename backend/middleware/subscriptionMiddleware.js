const Subscription = require('../models/Subscription');

// ── SUBSCRIPTION GUARD MIDDLEWARE ──
// Blocks API calls if subscription is expired
// Add to any route that should be gated:
//   router.use(requireSubscription);

const requireSubscription = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    let sub = await Subscription.findOne({ userId });

    if (!sub) {
      // First time — create a 14-day trial automatically
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      sub = await Subscription.create({
        userId, plan: 'trial', status: 'active',
        startDate: new Date(), endDate: trialEnd
      });
    }

    // Auto-expire check
    if (sub.status === 'active' && new Date() > sub.endDate) {
      sub.status = 'expired';
      await sub.save();
    }

    if (sub.isActive()) {
      // Attach subscription info to request
      req.subscription = {
        plan:     sub.plan,
        daysLeft: sub.daysLeft(),
        endDate:  sub.endDate
      };
      return next();
    }

    // Subscription expired or pending
    return res.status(402).json({
      error:       'subscription_expired',
      message:     sub.status === 'pending'
        ? 'Payment verification in progress. Contact admin.'
        : 'Your subscription has expired. Please renew to continue.',
      status:      sub.status,
      plan:        sub.plan,
      endDate:     sub.endDate,
      renewUrl:    '/subscription'
    });

  } catch (err) {
    console.error('Subscription middleware error:', err);
    return next(); // Don't block on middleware errors
  }
};

module.exports = requireSubscription;