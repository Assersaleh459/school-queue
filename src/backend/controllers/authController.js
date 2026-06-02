const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { log } = require('../audit');

exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE user_id = ?").run(user.user_id);
    log(user.user_id, 'LOGIN', 'user', user.user_id, { username: user.username });

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        department_id: user.department_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        department_id: user.department_id,
        allowed_pages: user.allowed_pages ? JSON.parse(user.allowed_pages) : null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.me = (req, res) => {
  const user = db.prepare(
    'SELECT user_id, username, full_name, role, department_id, allowed_pages FROM users WHERE user_id = ?'
  ).get(req.user.user_id);
  res.json({
    ...user,
    allowed_pages: user.allowed_pages ? JSON.parse(user.allowed_pages) : null
  });
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(req.user.user_id);
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE user_id = ?').run(hash, user.user_id);
    log(user.user_id, 'CHANGE_PASSWORD', 'user', user.user_id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to change password' });
  }
};
