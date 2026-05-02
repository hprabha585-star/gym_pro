const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET settings for current user (creates default if not exists)
router.get('/', async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user.userId });
    if (!settings) {
      settings = new Settings({ userId: req.user.userId });
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update settings (upsert)
router.put('/', async (req, res) => {
  try {
    const { upiId, upiName, admissionFee, ptFee, gymName, gymPhone, gymAddress } = req.body;
    const settings = await Settings.findOneAndUpdate(
      { userId: req.user.userId },
      { upiId, upiName, admissionFee, ptFee, gymName, gymPhone, gymAddress },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
