const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.get('/', authMiddleware, requireRole('super_admin', 'admin'), (req, res) => {
  const users = db.prepare(
    `SELECT u.user_id, u.username, u.full_name, u.role, u.department_id, u.is_active,
       u.created_at, u.last_login, d.name as department_name
     FROM users u
     LEFT JOIN departments d ON u.department_id = d.department_id
     ORDER BY u.created_at DESC`
  ).all();
  res.json(users);
});

router.post('/', authMiddleware, requireRole('super_admin', 'admin'), (req, res) => {
  const { username, password, full_name, role, department_id } = req.body;

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'username, password, full_name, and role are required' });
  }

  const existing = db.prepare('SELECT user_id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role, department_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(username, hash, full_name, role, department_id || null);

  const user = db.prepare(
    'SELECT user_id, username, full_name, role, department_id, is_active, created_at FROM users WHERE user_id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(user);
});

router.put('/:id', authMiddleware, requireRole('super_admin', 'admin'), (req, res) => {
  const { full_name, role, department_id, is_active, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE user_id = ?').run(hash, req.params.id);
  }

  db.prepare(
    `UPDATE users SET
       full_name = ?, role = ?, department_id = ?, is_active = ?
     WHERE user_id = ?`
  ).run(
    full_name ?? user.full_name,
    role ?? user.role,
    department_id !== undefined ? (department_id || null) : user.department_id,
    is_active !== undefined ? (is_active ? 1 : 0) : user.is_active,
    req.params.id
  );

  const updated = db.prepare(
    'SELECT user_id, username, full_name, role, department_id, is_active, created_at FROM users WHERE user_id = ?'
  ).get(req.params.id);

  res.json(updated);
});

router.delete('/:id', authMiddleware, requireRole('super_admin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot deactivate super admin' });

  db.prepare('UPDATE users SET is_active = 0 WHERE user_id = ?').run(req.params.id);
  res.json({ message: 'User deactivated' });
});

module.exports = router;
