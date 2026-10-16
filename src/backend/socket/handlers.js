const jwt = require('jsonwebtoken');
const db = require('../database/db');
const devices = require('../devices');

// A Staff device with the app open stays counted as in use (see devices.js)
const DEVICE_HEARTBEAT_MS = 5 * 60 * 1000;

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
      if (decoded.device_id && devices.isRevoked(decoded.device_id)) return next(new Error('Device signed out'));
      socket.userId = decoded.user_id;
      socket.deviceId = decoded.device_id || null;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id, socket.userId ? `(user ${socket.userId})` : '(public)');

    if (socket.userId) trackSocket(socket.userId, socket.id);
    if (socket.deviceId) {
      socket.join(`device_${socket.deviceId}`);
      devices.touch(socket.deviceId);
    }

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

  setInterval(() => {
    for (const socket of io.of('/').sockets.values()) if (socket.deviceId) devices.touch(socket.deviceId);
  }, DEVICE_HEARTBEAT_MS).unref();

  module.exports.forceLogout = (userId) => forceLogout(io, userId);
  // Admin freed this device's license slot → sign it out now
  module.exports.kickDevice = (deviceId) => io.to(`device_${deviceId}`).emit('force_logout');
};

module.exports.forceLogout = () => {}; // placeholder until handlers(io) is called
module.exports.kickDevice = () => {};
