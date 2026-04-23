const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  memberId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Member', 
    required: true 
  },
  date: { 
    type: String,
    required: true 
  },
  status: { 
    type: String, 
    enum: ['Present', 'Absent'], 
    required: true 
  },
  markedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Prevent duplicate attendance for same member on same date per user
attendanceSchema.index({ userId: 1, memberId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);