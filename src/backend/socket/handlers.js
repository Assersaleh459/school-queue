const jwt = require('jsonwebtoken');
const db = require('../database/db');

// userId → Set of socketIds (one user can have multiple tabs open)
const userSockets = new Map();

function trackSocket(userId, socketId) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}

function untrackSocket(userId, socketId) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) userSockets.delete(userId);
  }
}

// Called from admin routes to force-logout a specific user
function forceLogout(io, userId) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.forEach((socketId) => io.to(socketId).emit('force_logout'));
  }
}

module.exports = (io) => {
  // Verify JWT on socket connection; allow unauthenticated for public monitor
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // public display — no token required

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = db.prepare('SELECT is_active FROM users WHERE user_id = ?').get(decoded.user_id);
      if (!user || !user.is_active) return next(new Error('Account deactivated'));
      socket.userId = decoded.user_id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id, socket.userId ? `(user ${socket.userId})` : '(public)');

    if (socket.userId) trackSocket(socket.userId, socket.id);

    socket.on('join_department', (dept_id) => {
      socket.join(`dept_${dept_id}`);
    });

    socket.on('join_monitor', () => {
      socket.join('public_monitor');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
      if (socket.userId) untrackSocket(socket.userId, socket.id);
    });
  });

  module.exports.forceLogout = (userId) => forceLogout(io, userId);
};

module.exports.forceLogout = () => {}; // placeholder until handlers(io) is called
