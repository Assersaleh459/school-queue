const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { log } = require('../audit');
const devices = require('../devices');

// The password every new install starts with (see db.js). It is publicly known, so anyone
// who signs in with it must choose a new one before they can use anything else.
const DEFAULT_PASSWORD = 'admin123';

function signToken(claims) {
  return jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '8h' });
}

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

    // License: only so many Staff devices may be connected at once
    const device = devices.identify(req);
    const allowed = devices.checkLogin(device);
    if (!allowed.ok) {
      log(user.user_id, 'LOGIN_DEVICE_LIMIT', 'device', null, { username: user.username, device: device.name });
      return res.status(403).json({ error: allowed.error, code: 'device_limit' });
    }
    devices.register(device, user.user_id);

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE user_id = ?").run(user.user_id);
    log(user.user_id, 'LOGIN', 'user', user.user_id, { username: user.username });

    const mustChange = password === DEFAULT_PASSWORD;
    const token = signToken({
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      department_id: user.department_id,
      device_id: device.id,
      ...(mustChange && { must_change_password: true })
    });

    res.json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        department_id: user.department_id,
        allowed_pages: user.allowed_pages ? JSON.parse(user.allowed_pages) : null,
        must_change_password: mustChange
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
    allowed_pages: user.allowed_pages ? JSON.parse(user.allowed_pages) : null,
    must_change_password: !!req.user.must_change_password
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
  if (new_password === DEFAULT_PASSWORD) {
    return res.status(400).json({ error: 'Choose a password other than the default one' });
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
    // A fresh token without the "must change password" mark, so the user can carry on
    const { iat, exp, must_change_password, ...claims } = req.user;
    res.json({ success: true, token: signToken(claims) });
  } catch {
    res.status(500).json({ error: 'Failed to change password' });
  }
};
