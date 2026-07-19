/**
 * create-superadmin.js
 * Run ONCE on server: node create-superadmin.js
 * Creates your (app creator) super-admin account.
 */
const mongoose = require('mongoose');
const User     = require('./models/User');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gympro');
  console.log('✅ MongoDB connected');

  const EMAIL    = 'hprabha585@gmail.com';
  const PASSWORD = 'Hareesh143@';
  const NAME     = 'Hareesh (GymPro Creator)';

  let user = await User.findOne({ email: EMAIL });

  if (user) {
    user.role            = 'superadmin';
    user.isApproved      = true;
    user.pendingApproval = false;
    user.isActive        = true;
    user.name            = NAME;
    await user.save();
    console.log('✅ Super-admin updated');
  } else {
    user = new User({
      name: NAME, email: EMAIL, password: PASSWORD,
      role: 'superadmin',
      isApproved: true, pendingApproval: false, isActive: true
    });
    await user.save();
    console.log('✅ Super-admin created');
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  GymPro Super-Admin Account');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Email    : ${EMAIL}`);
  console.log(`  Password : ${PASSWORD}`);
  console.log(`  Role     : superadmin`);
  console.log(`  Access   : https://gym-pro-mvyv.onrender.com/superadmin.html`);
  console.log('══════════════════════════════════════════════════');
  console.log('\nWorkflow:');
  console.log('  1. Gym owner registers at /login.html');
  console.log('  2. You approve at /superadmin.html');
  console.log('  3. Gym owner logs in, creates staff at /admin.html');
  console.log('  4. Staff logs in — sees same gym data, limited access\n');

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
