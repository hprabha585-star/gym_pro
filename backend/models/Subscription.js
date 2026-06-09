/**
 * models/Subscription.js
 * backend/models/Subscription.js
 */
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', required: true, unique: true
  },
  plan:   { type: String, enum: ['trial','monthly','yearly'], default: 'trial' },
  status: { type: String, enum: ['active','expired','pending','cancelled'], default: 'active' },
  startDate: { type: Date, default: Date.now },
  endDate:   { type: Date, required: true },
  paymentProof: {
    utrNumber:   { type: String, default: '' },
    amount:      { type: Number, default: 0 },
    screenshot:  { type: String, default: '' },
    submittedAt: { type: Date },
    verifiedAt:  { type: Date },
    verifiedBy:  { type: String, default: '' },
    notes:       { type: String, default: '' }
  },
  paymentHistory: [{
    plan: String, amount: Number, utrNumber: String,
    paidAt:    { type: Date, default: Date.now },
    validFrom: Date, validTo: Date
  }]
}, { timestamps: true });

subscriptionSchema.methods.isActive = function () {
  return this.status === 'active' && new Date() <= this.endDate;
};
subscriptionSchema.methods.daysLeft = function () {
  return Math.max(0, Math.ceil((this.endDate - new Date()) / 86400000));
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
