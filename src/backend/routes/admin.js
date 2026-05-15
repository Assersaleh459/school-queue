const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcrypt');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { invalidate: invalidateSettingsCache } = require('../settingsCache');
const { log } = require('../audit');

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
    invalidateSettingsCache();
    log(req.user?.user_id, 'SETTINGS_UPDATED', 'settings', null, { keys: Object.keys(req.body) });
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
  const { name, name_ar, code, color_code, display_order, is_active, room_number } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });
  try {
    const result = db.prepare(
      'INSERT INTO departments (name, name_ar, code, color_code, display_order, is_active, room_number) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(name, name_ar || null, code.toUpperCase(), color_code || '#19224A', display_order || 99, is_active ? 1 : 0, room_number || null);
    log(req.user?.user_id, 'DEPT_CREATED', 'department', result.lastInsertRowid, { name, code });
    res.json({ success: true, department_id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(400).json({ error: 'Department code already exists' });
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/departments/:id', requireRole('super_admin'), (req, res) => {
  const { name, name_ar, code, color_code, display_order, is_active, room_number } = req.body;
  try {
    db.prepare(`
      UPDATE departments SET name=?, name_ar=?, code=?, color_code=?, display_order=?, is_active=?, room_number=?
      WHERE department_id=?
    `).run(name, name_ar || null, code?.toUpperCase(), color_code, display_order, is_active ? 1 : 0, room_number || null, req.params.id);
    log(req.user?.user_id, 'DEPT_UPDATED', 'department', parseInt(req.params.id), { name });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// --- Users ---
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.user_id, u.username, u.full_name, u.role, u.department_id,
           u.is_active, u.last_login, u.allowed_pages, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.department_id
    ORDER BY u.user_id
  `).all();
  res.json(users);
});

router.post('/users', requireRole('super_admin'), async (req, res) => {
  const { username, password, full_name, role, department_id, is_active, allowed_pages } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'username, password, full_name, and role are required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const pages = Array.isArray(allowed_pages) && allowed_pages.length ? JSON.stringify(allowed_pages) : null;
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, department_id, is_active, allowed_pages) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hash, full_name, role, department_id || null, is_active ? 1 : 0, pages);
    log(req.user?.user_id, 'USER_CREATED', 'user', result.lastInsertRowid, { username, role });
    res.json({ success: true, user_id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', requireRole('super_admin'), async (req, res) => {
  const { full_name, role, department_id, is_active, password, allowed_pages } = req.body;
  const target = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'super_admin' && is_active === 0) {
    return res.status(403).json({ error: 'Cannot deactivate super_admin' });
  }
  try {
    let hash = target.password_hash;
    if (password) hash = await bcrypt.hash(password, 10);
    const pages = allowed_pages !== undefined
      ? (Array.isArray(allowed_pages) && allowed_pages.length ? JSON.stringify(allowed_pages) : null)
      : target.allowed_pages;
    db.prepare(`
      UPDATE users SET full_name=?, role=?, department_id=?, is_active=?, password_hash=?, allowed_pages=?
      WHERE user_id=?
    `).run(full_name, role, department_id || null, is_active ? 1 : 0, hash, pages, req.params.id);
    log(req.user?.user_id, 'USER_UPDATED', 'user', parseInt(req.params.id), { full_name, role, is_active });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// --- Service Categories ---
router.get('/departments/:id/categories', (req, res) => {
  const cats = db.prepare(
    'SELECT * FROM service_categories WHERE department_id = ? ORDER BY category_id'
  ).all(req.params.id);
  res.json(cats);
});

router.post('/departments/:id/categories', requireRole('super_admin'), (req, res) => {
  const { name, estimated_time_minutes, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare(
    'INSERT INTO service_categories (department_id, name, estimated_time_minutes, is_active) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, name, estimated_time_minutes || 5, is_active ? 1 : 0);
  res.json({ success: true, category_id: result.lastInsertRowid });
});

router.put('/departments/:id/categories/:catId', requireRole('super_admin'), (req, res) => {
  const { name, estimated_time_minutes, is_active } = req.body;
  db.prepare(
    'UPDATE service_categories SET name=?, estimated_time_minutes=?, is_active=? WHERE category_id=? AND department_id=?'
  ).run(name, estimated_time_minutes || 5, is_active ? 1 : 0, req.params.catId, req.params.id);
  res.json({ success: true });
});

router.delete('/departments/:id/categories/:catId', requireRole('super_admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM service_categories WHERE category_id=? AND department_id=?').run(req.params.catId, req.params.id);
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Cannot delete — tickets exist for this service type. Deactivate it instead.' });
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
  log(req.user?.user_id, 'ANNOUNCEMENT_CREATED', 'announcement', result.lastInsertRowid, { message_text });
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
  log(req.user?.user_id, 'ANNOUNCEMENT_DELETED', 'announcement', parseInt(req.params.id));
  res.json({ success: true });
});

// --- Audit Logs ---
router.get('/audit-logs', requireRole('super_admin'), (req, res) => {
  const { limit = 200, offset = 0, action, user_id } = req.query;
  let query = `
    SELECT a.*, u.username, u.full_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.user_id
  `;
  const params = [];
  const where = [];
  if (action) { where.push('a.action LIKE ?'); params.push(`%${action}%`); }
  if (user_id) { where.push('a.user_id = ?'); params.push(user_id); }
  if (where.length) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY a.logged_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

module.exports = router;
