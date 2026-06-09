/**
 * create-admin.js
 * Run once: node create-admin.js
 * Creates the master admin account for GymPro
 */
const mongoose = require('mongoose');
const User     = require('./models/User');
const Subscription = require('./models/Subscription');
require('dotenv').config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gympro');
    console.log('✅ MongoDB Connected');

    const email    = 'hprabha585@gmail.com';
    const password = 'Hareesh143@';
    const name     = 'GymPro Admin';

    // Check if admin already exists
    const existing = await User.findOne({ email });
    if (existing) {
      // Ensure role is admin
      existing.role = 'admin';
      await existing.save();
      console.log(`✅ Admin already exists — role confirmed as admin`);
      console.log(`   Email: ${email}`);
    } else {
      const admin = new User({ name, email, password, role: 'admin' });
      await admin.save();
      console.log(`✅ Admin created successfully`);
      console.log(`   Name:  ${name}`);
      console.log(`   Email: ${email}`);
    }

    // Give admin a permanent subscription (never expires)
    const adminUser = await User.findOne({ email });
    const permanentEnd = new Date('2099-12-31');
    const existingSub = await Subscription.findOne({ userId: adminUser._id });
    if (!existingSub) {
      await Subscription.create({
        userId: adminUser._id, plan: 'yearly',
        status: 'active', startDate: new Date(), endDate: permanentEnd
      });
      console.log('✅ Admin permanent subscription created');
    } else {
      existingSub.plan = 'yearly'; existingSub.status = 'active';
      existingSub.endDate = permanentEnd;
      await existingSub.save();
      console.log('✅ Admin subscription updated to permanent');
    }

    console.log('\n🎉 Admin setup complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Login URL: https://gym-pro-mvyv.onrender.com/login.html`);
    console.log(`   Email:     hprabha585@gmail.com`);
    console.log(`   Password:  Hareesh143@`);
    console.log(`   Role:      admin`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
