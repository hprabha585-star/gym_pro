const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true  // one settings doc per user
  },
  upiId:        { type: String, default: '' },
  upiName:      { type: String, default: '' },
  admissionFee: { type: Number, default: 0 },
  ptFee:        { type: Number, default: 0 },
  gymName:      { type: String, default: 'GymPro' },
  gymPhone:     { type: String, default: '' },
  gymAddress:   { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
