const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcrypt');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('super_admin', 'admin'));

// --- Settings (super_admin only) ---
router.get('/settings', requireRole('super_admin'), (req, res) => {
  const settings = db.prepare('SELECT * FROM settings ORDER BY setting_key').all();
  res.json(settings);
});

router.put('/settings', requireRole('super_admin'), (req, res) => {
  try {
    const upsert = db.prepare(`
      INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
    `);
    const runAll = db.transaction((obj) => {
      Object.entries(obj).forEach(([k, v]) => upsert.run(k, String(v)));
    });
    runAll(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Settings save error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// --- Departments ---
router.get('/departments', (req, res) => {
  const depts = db.prepare('SELECT * FROM departments ORDER BY display_order').all();
  res.json(depts);
});

router.post('/departments', requireRole('super_admin'), (req, res) => {
  const { name, code, color_code, display_order, is_active } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
  try {
    const result = db.prepare(
      'INSERT INTO departments (name, code, color_code, display_order, is_active) VALUES (?, ?, ?, ?, ?)'
    ).run(name, code.toUpperCase(), color_code || '#19224A', display_order || 99, is_active ? 1 : 0);
    res.json({ success: true, department_id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(400).json({ error: 'Department code already exists' });
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/departments/:id', requireRole('super_admin'), (req, res) => {
  const { name, code, color_code, display_order, is_active } = req.body;
  try {
    db.prepare(`
      UPDATE departments SET name=?, code=?, color_code=?, display_order=?, is_active=?
      WHERE department_id=?
    `).run(name, code?.toUpperCase(), color_code, display_order, is_active ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// --- Users ---
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.user_id, u.username, u.full_name, u.role, u.department_id,
           u.is_active, u.last_login, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.department_id
    ORDER BY u.user_id
  `).all();
  res.json(users);
});

router.post('/users', requireRole('super_admin'), async (req, res) => {
  const { username, password, full_name, role, department_id, is_active } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'username, password, full_name, and role are required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, department_id, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, hash, full_name, role, department_id || null, is_active ? 1 : 0);
    res.json({ success: true, user_id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', requireRole('super_admin'), async (req, res) => {
  const { full_name, role, department_id, is_active, password } = req.body;
  const target = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'super_admin' && is_active === 0) {
    return res.status(403).json({ error: 'Cannot deactivate super_admin' });
  }
  try {
    let hash = target.password_hash;
    if (password) hash = await bcrypt.hash(password, 10);
    db.prepare(`
      UPDATE users SET full_name=?, role=?, department_id=?, is_active=?, password_hash=?
      WHERE user_id=?
    `).run(full_name, role, department_id || null, is_active ? 1 : 0, hash, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// --- Announcements ---
router.get('/announcements', (req, res) => {
  const rows = db.prepare('SELECT * FROM announcements ORDER BY display_order').all();
  res.json(rows);
});

router.post('/announcements', requireRole('super_admin'), (req, res) => {
  const { message_text, message_text_ar, speak_language, display_order, is_active } = req.body;
  if (!message_text) return res.status(400).json({ error: 'message_text is required' });
  const result = db.prepare(
    'INSERT INTO announcements (message_text, message_text_ar, speak_language, display_order, is_active) VALUES (?, ?, ?, ?, ?)'
  ).run(message_text, message_text_ar || null, speak_language || 'en', display_order || 99, is_active ? 1 : 0);
  res.json({ success: true, announcement_id: result.lastInsertRowid });
});

router.put('/announcements/:id', requireRole('super_admin'), (req, res) => {
  const { message_text, message_text_ar, speak_language, display_order, is_active } = req.body;
  db.prepare(
    'UPDATE announcements SET message_text=?, message_text_ar=?, speak_language=?, display_order=?, is_active=? WHERE announcement_id=?'
  ).run(message_text, message_text_ar || null, speak_language || 'en', display_order, is_active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/announcements/:id', requireRole('super_admin'), (req, res) => {
  db.prepare('DELETE FROM announcements WHERE announcement_id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
