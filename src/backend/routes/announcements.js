const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authMiddleware, requireRole, requirePageAccess } = require('../middleware/auth');
const { rules, checkValidation } = require('../middleware/validate');
const { log } = require('../audit');

// Public — active announcements for the display/home ticker
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

// Management — requires the 'announcements' screen grant (or admin role)
// Add / edit / delete: admins only. Staff with the screen can list and announce (voice.js) but not change the list.
const canEdit = [authMiddleware, requireRole('super_admin', 'admin')];
const canManage = [authMiddleware, requirePageAccess('announcements', 'super_admin', 'admin')];

router.get('/all', canManage, (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY display_order').all();
  res.json(rows);
});

router.post('/', canEdit, rules.createAnnouncement, checkValidation, (req, res) => {
  const { message_text, message_text_ar, speak_language, display_order, is_active } = req.body;
  const result = db.prepare(
    'INSERT INTO announcements (message_text, message_text_ar, speak_language, display_order, is_active) VALUES (?, ?, ?, ?, ?)'
  ).run(message_text, message_text_ar || null, speak_language || 'en', display_order || 99, is_active ? 1 : 0);
  req.io.emit('announcements_updated');   // displays refresh their ticker now
  log(req.user?.user_id, 'ANNOUNCEMENT_CREATED', 'announcement', result.lastInsertRowid, { message_text });
  res.json({ success: true, announcement_id: result.lastInsertRowid });
});

router.put('/:id', canEdit, rules.updateAnnouncement, checkValidation, (req, res) => {
  const { message_text, message_text_ar, speak_language, display_order, is_active } = req.body;
  db.prepare(
    'UPDATE announcements SET message_text=?, message_text_ar=?, speak_language=?, display_order=?, is_active=? WHERE announcement_id=?'
  ).run(message_text, message_text_ar || null, speak_language || 'en', display_order, is_active ? 1 : 0, req.params.id);
  req.io.emit('announcements_updated');
  log(req.user?.user_id, 'ANNOUNCEMENT_UPDATED', 'announcement', parseInt(req.params.id), { message_text });
  res.json({ success: true });
});

router.delete('/:id', canEdit, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE announcement_id = ?').run(req.params.id);
  req.io.emit('announcements_updated');
  log(req.user?.user_id, 'ANNOUNCEMENT_DELETED', 'announcement', parseInt(req.params.id));
  res.json({ success: true });
});

module.exports = router;
