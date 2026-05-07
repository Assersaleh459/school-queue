const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const dotenv = require('dotenv');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Allow localhost (dev) and any private LAN IP (production school network)
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / non-browser requests
  return /^https?:\/\/(localhost|127\.0\.0\.1|(192\.168|10\.\d+|172\.(1[6-9]|2\d|3[01]))\.\d+)\b/.test(origin);
}

const corsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
};

const io = socketIO(server, {
  cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), methods: ['GET', 'POST'] }
});

app.use(compression());
app.use(morgan('dev'));
app.use(cors(corsOptions));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const ttsRoute   = require('./routes/tts');
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const departmentRoutes = require('./routes/departments');
const queueRoutes = require('./routes/queue');
const userRoutes = require('./routes/users');
const displayRoutes = require('./routes/display');
const announcementRoutes = require('./routes/announcements');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');

const socketHandlers = require('./socket/handlers');
socketHandlers(io);

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use('/api/tts', ttsRoute);
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/users', userRoutes);
app.use('/api/display', displayRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Public settings (no auth) — safe keys only
app.get('/api/settings/public', (req, res) => {
  const db = require('./database/db');
  const keys = [
    'school_name', 'primary_color', 'working_hours_start', 'working_hours_end',
    'announcement_language', 'audio_enabled',
    'call_template_en', 'call_template_ar', 'recall_template_en', 'recall_template_ar',
    'no_show_after_calls',
  ];
  const result = {};
  keys.forEach(k => {
    const row = db.prepare('SELECT setting_value FROM settings WHERE setting_key = ?').get(k);
    result[k] = row?.setting_value || null;
  });
  res.json(result);
});

// Serve React frontend in production (built via npm run build:frontend)
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});
