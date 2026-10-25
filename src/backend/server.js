const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const dotenv = require('dotenv');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { startDiscoveryResponder } = require('./discovery');
const licenseGuard = require('./licenseGuard');
const { licenseId } = require('./license');

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
app.use(express.json({ limit: '5mb' })); // allow base64 logo uploads

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Applied to all POST/PUT/DELETE (write operations)
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const errorHandler = require('./middleware/errorHandler');
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
const kioskRoutes = require('./routes/kiosk');
const voiceRoutes = require('./routes/voice');
const licenseRoutes = require('./routes/license');
const { getSetting } = require('./settingsCache');

const socketHandlers = require('./socket/handlers');
socketHandlers(io);

// New recordings are used immediately: displays and admin pages reload the clip list.
voiceRoutes.engine.on('change', () => io.emit('voice_updated'));

app.use((req, res, next) => {
  req.io = io;
  next();
});

// License first: past its grace period everything else answers 402 until it is renewed
app.use('/api/license', licenseRoutes);
app.use('/api', licenseRoutes.licenseGate);

app.use('/api/tts', ttsRoute);
app.use('/api/auth', authRoutes);
app.use('/api/tickets', mutationLimiter, ticketRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/queue', mutationLimiter, queueRoutes);
app.use('/api/users', userRoutes);
app.use('/api/display', displayRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/admin', mutationLimiter, adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/kiosk', mutationLimiter, kioskRoutes);
app.use('/api/voice', voiceRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Public settings (no auth) — safe keys only
app.get('/api/settings/public', (req, res) => {
  const db = require('./database/db');
  const keys = [
    'school_name', 'primary_color', 'working_hours_start', 'working_hours_end',
    'announcement_language', 'audio_enabled', 'voice_mode', 'media_pause', 'call_banner',
    'call_template_en', 'call_template_ar', 'recall_template_en', 'recall_template_ar',
    'no_show_after_calls', 'max_wait_alert_minutes', 'school_logo',
    'ticket_paper', 'ticket_footer', 'ticket_number_size',
    'ticket_show_parent', 'ticket_show_student', 'ticket_show_time', 'ticket_show_wait',
  ];
  // Same defaults the Settings page shows, so an install that never saved them still gets the alert
  const defaults = { max_wait_alert_minutes: '30', no_show_after_calls: '3' };
  const result = {};
  keys.forEach(k => {
    const row = db.prepare('SELECT setting_value FROM settings WHERE setting_key = ?').get(k);
    result[k] = row?.setting_value || defaults[k] || null;
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

app.use(errorHandler);

const BASE_PORT = parseInt(process.env.PORT) || 3000;

function tryListen(port) {
  server.listen(port);
}

// One handler, not a listen() callback per attempt: those pile up across retries
// and ALL fire on the final success — the stale ones with the busy port.
server.on('listening', () => {
  const port = server.address().port;
  process.env.ACTUAL_PORT = String(port);
  if (port !== BASE_PORT) {
    console.warn(`Port ${BASE_PORT} was in use — bound to http://localhost:${port} instead`);
  } else {
    console.log(`✓ Server running on http://localhost:${port}`);
  }
  startDiscoveryResponder(() => ({
    port,
    school: getSetting('school_name', 'SchoolQ'),
    version: require('../../package.json').version,
    ...licenseGuard.announce(licenseId),
  }));
  licenseGuard.start(licenseId);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const taken = err.port;
    const next  = taken + 1;
    if (next > BASE_PORT + 10) {
      const msg = `Ports ${BASE_PORT}–${BASE_PORT + 10} are all in use by other programs.`;
      console.error(`${msg} Giving up.`);
      // Inside the desktop app, exiting here would close it with no message —
      // hand the error to electron/main.js to show instead.
      if (process.versions.electron) { process.env.SERVER_START_ERROR = msg; return; }
      process.exit(1);
    }
    console.warn(`Port ${taken} is already in use — trying ${next}…`);
    server.close();
    tryListen(next);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

tryListen(BASE_PORT);
