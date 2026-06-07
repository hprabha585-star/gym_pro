const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ['trial', 'monthly', 'yearly'],
    default: 'trial'
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'pending', 'cancelled'],
    default: 'active'
  },
  startDate: { type: Date, default: Date.now },
  endDate:   { type: Date, required: true },

  // Payment proof fields (manual bank transfer)
  paymentProof: {
    utrNumber:   { type: String, default: '' },
    amount:      { type: Number, default: 0 },
    screenshot:  { type: String, default: '' },  // base64 image
    submittedAt: { type: Date },
    verifiedAt:  { type: Date },
    verifiedBy:  { type: String, default: '' },
    notes:       { type: String, default: '' }
  },

  // History of all payments
  paymentHistory: [{
    plan:      String,
    amount:    Number,
    utrNumber: String,
    paidAt:    { type: Date, default: Date.now },
    validFrom: Date,
    validTo:   Date
  }]
}, { timestamps: true });

// Helper: check if subscription is currently active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && new Date() <= this.endDate;
};

// Days remaining
subscriptionSchema.methods.daysLeft = function() {
  const diff = this.endDate - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
};

module.exports = mongoose.model('Subscription', subscriptionSchema);