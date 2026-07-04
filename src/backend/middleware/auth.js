const jwt = require('jsonwebtoken');
const db = require('../database/db');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT is_active FROM users WHERE user_id = ?').get(decoded.user_id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account deactivated' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Allows access if the user has one of the fallback roles, OR has been granted
// the given screen via allowed_pages. Mirrors the frontend screen-access model
// so a non-admin user granted a screen can also use that screen's API.
function requirePageAccess(page, ...fallbackRoles) {
  return (req, res, next) => {
    if (fallbackRoles.includes(req.user.role)) return next();
    try {
      const row = db.prepare('SELECT allowed_pages FROM users WHERE user_id = ?').get(req.user.user_id);
      const pages = row?.allowed_pages ? JSON.parse(row.allowed_pages) : null;
      if (Array.isArray(pages) && pages.includes(page)) return next();
    } catch {}
    return res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = { authMiddleware, requireRole, requirePageAccess };
