const mongoose = require('mongoose');
const User = require('./models/User');
const Member = require('./models/Member');
const Trainer = require('./models/Trainer');
const Attendance = require('./models/Attendance');
require('dotenv').config();

async function migrateData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Get first admin user
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('❌ No admin user found. Please create an admin user first.');
      console.log('Run: node create-admin.js');
      return;
    }
    
    console.log(`✅ Found admin user: ${adminUser.email}`);
    
    // Update all members without userId
    const members = await Member.find({ userId: { $exists: false } });
    for (let member of members) {
      member.userId = adminUser._id;
      await member.save();
      console.log(`📝 Updated member: ${member.name}`);
    }
    
    // Update all trainers without userId
    const trainers = await Trainer.find({ userId: { $exists: false } });
    for (let trainer of trainers) {
      trainer.userId = adminUser._id;
      await trainer.save();
      console.log(`📝 Updated trainer: ${trainer.name}`);
    }
    
    // Update all attendance records without userId
    const attendances = await Attendance.find({ userId: { $exists: false } });
    for (let attendance of attendances) {
      attendance.userId = adminUser._id;
      await attendance.save();
    }
    console.log(`📝 Updated ${attendances.length} attendance records`);
    
    console.log('\n✅ Migration completed successfully!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Migration error:', err);
  }
}

migrateData();