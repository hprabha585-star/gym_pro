const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String, required: [true, 'Name is required'], trim: true
  },
  email: {
    type: String, required: [true, 'Email is required'],
    unique: true, lowercase: true, trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String, required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },

  // ─── 3-tier role system ───────────────────────────────────
  // superadmin : app creator (hprabha585@gmail.com) — approves gym owners
  // admin      : gym owner — full gym access, creates/manages staff
  // staff      : gym employee — shared gym data, limited by permissions
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'staff'],
    default: 'admin'          // public registration = gym owner request
  },

  // gymId — the admin's _id whose data this user shares.
  // • superadmin : null (doesn't manage a gym)
  // • admin      : their own _id (set automatically on approval)
  // • staff      : their gym owner's _id (set when admin creates them)
  gymId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Gym name — set by admin in Settings, shown in superadmin dashboard
  gymName: { type: String, default: '' },

  // Granular permissions — only meaningful for staff
  staffPermissions: {
    viewMembers:    { type: Boolean, default: true  },
    addMembers:     { type: Boolean, default: true  },
    editMembers:    { type: Boolean, default: true  },
    deleteMembers:  { type: Boolean, default: false },
    viewAttendance: { type: Boolean, default: true  },
    markAttendance: { type: Boolean, default: true  },
    viewTrainers:   { type: Boolean, default: true  },
    viewPayments:   { type: Boolean, default: true  },
    viewRevenue:    { type: Boolean, default: false },
    viewSettings:   { type: Boolean, default: false }
  },

  // Approval flow (used for admin/gym-owner registration)
  isApproved:      { type: Boolean, default: false },
  pendingApproval: { type: Boolean, default: true  },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedByName:  { type: String,  default: '' },
  approvedAt:      { type: Date },
  rejectionReason: { type: String,  default: '' },

  isActive:   { type: Boolean, default: true  },
  lastLogin:  { type: Date },
  gymData:    { type: String, default: '{}' }

}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(pwd) {
  return bcrypt.compare(pwd, this.password);
};

module.exports = mongoose.model('User', userSchema);
