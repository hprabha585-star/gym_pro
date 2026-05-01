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
  paymentHistory: [{
    amount: Number,
    date: { type: Date, default: Date.now },
    method: String,
    receiptNo: String
  }],
  status: { 
    type: String, 
    enum: ['Active', 'Trial', 'Inactive', 'Expired'], 
    default: 'Active' 
  }
}, { 
  timestamps: true 
});

memberSchema.index({ userId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('Member', memberSchema);