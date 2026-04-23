const mongoose = require('mongoose');

const trainerSchema = new mongoose.Schema({
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
  specialty: { 
    type: String, 
    required: [true, 'Specialty is required'],
    trim: true 
  },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive'], 
    default: 'Active' 
  },
  joinDate: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});

// Compound index to ensure unique phone per user
trainerSchema.index({ userId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('Trainer', trainerSchema);