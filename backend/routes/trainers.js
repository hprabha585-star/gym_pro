const express = require('express');
const router = express.Router();
const Trainer = require('../models/Trainer');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET all trainers
router.get('/', async (req, res) => {
  try {
    const trainers = await Trainer.find({ userId: req.user.userId }).sort({ joinDate: -1 });
    res.json(trainers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single trainer
router.get('/:id', async (req, res) => {
  try {
    const trainer = await Trainer.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
    res.json(trainer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add trainer
router.post('/', async (req, res) => {
  try {
    const { name, phone, specialty, status } = req.body;
    
    const existingTrainer = await Trainer.findOne({ 
      userId: req.user.userId,
      phone 
    });
    if (existingTrainer) {
      return res.status(400).json({ error: 'Trainer with this phone number already exists' });
    }
    
    const trainer = new Trainer({
      userId: req.user.userId,
      name: name.trim(),
      phone: phone.trim(),
      specialty: specialty.trim(),
      status: status || 'Active',
      joinDate: new Date()
    });
    
    const savedTrainer = await trainer.save();
    res.status(201).json(savedTrainer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update trainer
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, specialty, status } = req.body;
    
    const trainer = await Trainer.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { name, phone, specialty, status },
      { new: true, runValidators: true }
    );
    
    if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
    res.json(trainer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE trainer
router.delete('/:id', async (req, res) => {
  try {
    const trainer = await Trainer.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });
    if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
    res.json({ message: 'Trainer deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;