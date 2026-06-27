const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true 
  },
  phone: { 
    type: String, 
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
  },
  email: { 
    type: String, 
    trim: true, 
    lowercase: true
  },
  age: { 
    type: Number, 
    min: [12, 'Age must be at least 12'],
    max: [100, 'Age must be less than 100']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', ''],
    default: ''
  },
  photo: { 
    type: String, 
    default: '' 
  },
  healthConditions: [{
    condition: { type: String },
    severity: { type: String, enum: ['Mild', 'Moderate', 'Severe'] },
    notes: { type: String }
  }],
  medicalNotes: { type: String, default: '' },
  emergencyContact: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    relationship: { type: String, default: '' }
  },
  plan: { 
    type: String, 
    required: [true, 'Plan is required'],
    trim: true
  },
  // Financial fields — stored in DB so they sync across devices
  planPrice: { type: Number, default: 0 },          // actual price charged (after discount)
  discountType: { type: String, default: 'none' },  // 'none' | 'percentage' | 'fixed'
  discountValue: { type: Number, default: 0 },
  discountReason: { type: String, default: '' },
  admissionFee: { type: Number, default: 0 },
  admissionWaived: { type: Boolean, default: false },
  ptEnabled: { type: Boolean, default: false },
  ptFee: { type: Number, default: 0 },
  ptTrainer: { type: String, default: '' },
  ptNotes: { type: String, default: '' },
  joinDate: { 
    type: Date, 
    default: Date.now 
  },
  expiryDate: { 
    type: Date, 
    required: [true, 'Expiry date is required']
  },
  lastPaymentDate: { type: Date },
  nextPaymentDue: { type: Date },
  lastReminderSent: { type: Date },
  // Payment tracking fields
  lastPaymentMethod: { 
    type: String, 
    enum: ['upi', 'cash', 'card', null], 
    default: null 
  },
  lastPaymentAmount: { 
    type: Number, 
    default: 0 
  },
  paymentHistory: [{
    amount: Number,
    date: { type: Date, default: Date.now },
    method: { type: String, enum: ['upi', 'cash', 'card'] },
    receiptNo: String,
    plan: String,
    months: Number,
    type: { type: String, enum: ['plan', 'admission', 'pt'], default: 'plan' }
  }],
  status: { 
    type: String, 
    enum: ['Active', 'Trial', 'Inactive', 'Expired'], 
    default: 'Active' 
  }
}, { 
  timestamps: true 
});

// Compound index to ensure unique phone per user
memberSchema.index({ userId: 1, phone: 1 }, { unique: true });

// Index for expiry date queries
memberSchema.index({ userId: 1, expiryDate: 1 });

// Index for status queries
memberSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Member', memberSchema);
