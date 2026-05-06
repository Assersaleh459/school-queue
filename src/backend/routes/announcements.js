const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
  try {
    const announcements = db.prepare(
      'SELECT * FROM announcements WHERE is_active = 1 ORDER BY display_order'
    ).all();
    res.json(announcements);
  } catch (error) {
    console.error('Announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

module.exports = router;
