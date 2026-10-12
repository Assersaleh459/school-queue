/**
 * SchoolQ — Full Detailed Changelog PDF Generator
 * Generates SchoolQ-Changelog.pdf at the project root.
 */

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../SchoolQ-Changelog.pdf');
const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: false });
doc.pipe(fs.createWriteStream(OUT));

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  navy:    '#19224A',
  teal:    '#5FAEB6',
  green:   '#166534',
  greenBg: '#DCFCE7',
  amber:   '#92400E',
  amberBg: '#FEF3C7',
  red:     '#991B1B',
  redBg:   '#FEE2E2',
  blue:    '#1E40AF',
  blueBg:  '#DBEAFE',
  purple:  '#6B21A8',
  purpleBg:'#F3E8FF',
  gray:    '#374151',
  lgray:   '#9CA3AF',
  xgray:   '#6B7280',
  white:   '#FFFFFF',
  bg:      '#F9FAFB',
  border:  '#E5E7EB',
};

// ── Page helpers ──────────────────────────────────────────────────────────────
function newPage(plain = false) {
  doc.addPage();
  if (!plain) {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.bg).fillColor('black');
  }
  return doc;
}

function W() { return doc.page.width - 100; }  // usable width

function hr(color = C.border, thick = 0.5) {
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y)
     .strokeColor(color).lineWidth(thick).stroke();
  doc.moveDown(0.5);
}

function pill(text, bg, fg = C.white, fontSize = 7) {
  const w = doc.widthOfString(text, { fontSize }) + 14;
  const h = 14;
  const x = doc._x || 50;
  const y = doc.y;
  doc.roundedRect(x, y, w, h, 3).fill(bg);
  doc.fontSize(fontSize).fillColor(fg).font('Helvetica-Bold')
     .text(text, x + 7, y + 3.5, { lineBreak: false });
  return x + w + 5;
}

function tag(text, bg, fg) {
  const old = doc._x;
  pill(text, bg, fg, 7);
  doc.moveDown(1.1);
}

// ── Section title ─────────────────────────────────────────────────────────────
function sectionTitle(text, color = C.teal) {
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor(color).font('Helvetica-Bold')
     .text(text.toUpperCase(), { characterSpacing: 0.5 });
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y)
     .strokeColor(color).lineWidth(0.4).stroke();
  doc.moveDown(0.4);
}

// ── Bullet item ───────────────────────────────────────────────────────────────
function bullet(text, indent = 0, color = C.teal) {
  const ix = 50 + indent;
  const cx = ix + (indent > 0 ? 6 : 8);
  const cy = doc.y + 5.5;
  doc.circle(cx - (indent > 0 ? 3 : 0), cy, indent > 0 ? 1.5 : 2.5)
     .fill(color);
  doc.fontSize(8.5).fillColor(C.gray).font('Helvetica')
     .text(text, cx + 5, doc.y, { width: W() - indent - 14 });
}

function sub(text) { bullet(text, 14, C.lgray); }

// ── Key-value row ─────────────────────────────────────────────────────────────
function kv(key, val, keyColor = C.navy) {
  doc.fontSize(8.5);
  const kw = doc.widthOfString(key + '  ', { fontSize: 8.5 });
  doc.fillColor(keyColor).font('Helvetica-Bold').text(key + '  ', 50, doc.y, { continued: true, width: kw });
  doc.fillColor(C.gray).font('Helvetica').text(val, { width: W() - kw });
}

// ── File change table ─────────────────────────────────────────────────────────
function fileTable(files) {
  // files: [{ path, added, removed, note, isNew }]
  const colW = [260, 45, 45, W() - 350];
  const rowH = 14;
  let y = doc.y;

  // Header
  doc.rect(50, y, W(), rowH).fill(C.navy);
  doc.fontSize(7).fillColor(C.white).font('Helvetica-Bold');
  ['File', '+Lines', '−Lines', 'Note'].forEach((h, i) => {
    const x = 50 + colW.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h, x + 4, y + 4, { width: colW[i] - 4, lineBreak: false });
  });
  y += rowH;

  files.forEach((f, idx) => {
    if (y > 720) {
      doc.y = y;
      newPage();
      y = doc.y;
    }
    const rowColor = idx % 2 === 0 ? C.white : '#F3F4F6';
    doc.rect(50, y, W(), rowH).fill(rowColor);

    doc.fontSize(7).fillColor(C.gray).font('Helvetica');

    // file path (truncated)
    const fp = f.path.length > 52 ? '…' + f.path.slice(-51) : f.path;
    doc.text(fp, 54, y + 4, { width: colW[0] - 4, lineBreak: false });

    // added
    if (f.added > 0) {
      doc.fillColor('#166534').font('Helvetica-Bold')
         .text(`+${f.added}`, 54 + colW[0], y + 4, { width: colW[1] - 4, lineBreak: false });
    }

    // removed
    if (f.removed > 0) {
      doc.fillColor('#991B1B').font('Helvetica-Bold')
         .text(`−${f.removed}`, 54 + colW[0] + colW[1], y + 4, { width: colW[2] - 4, lineBreak: false });
    }

    // note / tag
    doc.fillColor(f.isNew ? '#166534' : C.xgray).font(f.isNew ? 'Helvetica-Bold' : 'Helvetica')
       .text(f.isNew ? '★ NEW FILE' : (f.note || ''), 54 + colW[0] + colW[1] + colW[2], y + 4, { width: colW[3] - 4, lineBreak: false });

    y += rowH;
  });

  doc.rect(50, doc.y, W(), y - doc.y).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.y = y + 4;
  doc.moveDown(0.5);
}

// ── Commit message block ──────────────────────────────────────────────────────
function commitBlock(msg) {
  const lines = msg.trim().split('\n');
  doc.rect(50, doc.y, W(), lines.length * 11 + 12).fill('#F0F9FF').strokeColor('#BAE6FD').lineWidth(0.5).stroke();
  doc.fontSize(7.5).fillColor('#0C4A6E').font('Courier');
  lines.forEach(line => {
    doc.text(line || ' ', 58, doc.y, { width: W() - 16 });
  });
  doc.moveDown(0.6);
}

// ── Version header ────────────────────────────────────────────────────────────
function versionHeader(opts) {
  // opts: { version, date, type, commit, summary, stats }
  // type colors
  const typeMap = {
    initial:  { bg: C.navy,   label: 'INITIAL RELEASE' },
    minor:    { bg: C.blue,   label: 'MINOR UPDATE'    },
    patch:    { bg: C.green,  label: 'PATCH'           },
    fix:      { bg: C.amber,  label: 'BUG FIX'         },
    security: { bg: C.red,    label: 'SECURITY'        },
    ux:       { bg: C.purple, label: 'UX IMPROVEMENT'  },
  };
  const t = typeMap[opts.type] || typeMap.patch;

  if (doc.y > 650) { newPage(); }

  // Thick top border
  doc.rect(50, doc.y, W(), 2).fill(t.bg);
  doc.moveDown(0.15);

  // Header band
  const bannerH = 34;
  const bannerY = doc.y;
  doc.rect(50, bannerY, W(), bannerH).fill(t.bg);

  // Version number
  doc.fontSize(20).fillColor(C.white).font('Helvetica-Bold')
     .text(`v${opts.version}`, 60, bannerY + 7, { lineBreak: false });

  // Type label
  const vw = doc.widthOfString(`v${opts.version}`, { fontSize: 20 });
  doc.fontSize(8).fillColor('rgba(255,255,255,0.75)').font('Helvetica-Bold')
     .text(t.label, 60 + vw + 10, bannerY + 12, { lineBreak: false });

  // Date and commit
  doc.fontSize(8).fillColor(C.white).font('Helvetica')
     .text(opts.date, doc.page.width - 180, bannerY + 7, { lineBreak: false, width: 130, align: 'right' });

  if (opts.commit) {
    doc.fontSize(7).fillColor('rgba(255,255,255,0.7)')
       .text(`commit ${opts.commit}`, doc.page.width - 180, bannerY + 20, { lineBreak: false, width: 130, align: 'right' });
  }

  doc.y = bannerY + bannerH + 8;

  // Summary
  doc.fontSize(10).fillColor(C.navy).font('Helvetica-Bold').text(opts.summary);
  doc.moveDown(0.3);

  // Stats pills
  if (opts.stats) {
    doc.fontSize(7.5).fillColor(C.xgray).font('Helvetica').text(`Files changed: ${opts.stats.files}  ·  `, { continued: true });
    doc.fillColor('#166534').font('Helvetica-Bold').text(`+${opts.stats.added} `, { continued: true });
    doc.fillColor('#991B1B').text(`−${opts.stats.removed}`, { continued: true });
    doc.fillColor(C.lgray).font('Helvetica').text('  lines', { continued: false });
  }
  doc.moveDown(0.4);
  hr(t.bg, 0.5);
}

// ═════════════════════════════════════════════════════════════════════════════
//  COVER PAGE
// ═════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.navy);

// Accent bar
doc.rect(0, 0, 8, doc.page.height).fill(C.teal);

// Title area
doc.fontSize(52).fillColor(C.white).font('Helvetica-Bold').text('SchoolQ', 60, 90);
doc.fontSize(16).fillColor(C.teal).font('Helvetica').text('Queue Management System', 62, 155);
doc.fontSize(11).fillColor('rgba(255,255,255,0.6)').text('Al-Noor International School', 62, 178);

// Divider
doc.rect(62, 205, 60, 2).fill(C.teal);

// Subtitle
doc.fontSize(22).fillColor(C.white).font('Helvetica-Bold').text('Full Changelog', 62, 220);
doc.fontSize(11).fillColor('rgba(255,255,255,0.5)').font('Helvetica')
   .text('Detailed Version History & Release Notes', 62, 248);

// Meta box
doc.rect(62, 285, 420, 90).fill('rgba(255,255,255,0.06)').strokeColor('rgba(255,255,255,0.1)').lineWidth(0.5).stroke();
const metaRows = [
  ['Developer',    'Vyra Systems'],
  ['Contact',      'asserhegazy@vyra-systems.com'],
  ['Product',      'SchoolQ — Queue Management System'],
  ['Client',       'Al-Noor International School'],
  ['Generated',    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })],
  ['Versions',     'v1.2.0 → v1.5.50  (32 releases)'],
];
metaRows.forEach(([k, v], i) => {
  doc.fontSize(8.5).fillColor(C.teal).font('Helvetica-Bold').text(k, 74, 295 + i * 13, { lineBreak: false, width: 90 });
  doc.fillColor('rgba(255,255,255,0.75)').font('Helvetica').text(v, 170, 295 + i * 13, { lineBreak: false });
});

// Version index
doc.fontSize(10).fillColor(C.white).font('Helvetica-Bold').text('Version Index', 62, 400);
doc.rect(62, 415, 420, 1).fill('rgba(255,255,255,0.2)');

const idx = [
  { v:'1.2.0',  date:'06 May 2026', label:'Initial Release',                     type:'initial'  },
  { v:'1.3.0',  date:'06 May 2026', label:'Bilingual TTS Fix & Voice Quality',   type:'patch'    },
  { v:'1.3.1',  date:'07 May 2026', label:'Security Hardening & Performance',    type:'security' },
  { v:'1.3.x',  date:'07 May 2026', label:'Bug Fix Series (5 patches)',           type:'fix'      },
  { v:'1.4.0',  date:'07 May 2026', label:'Permissions, Logo & Audit Log',       type:'minor'    },
  { v:'1.5.15', date:'15 May 2026', label:'Service Types Deep Integration',       type:'minor'    },
  { v:'1.5.16', date:'20 May 2026', label:'Force Logout & Socket Security',       type:'security' },
  { v:'1.5.17', date:'20 May 2026', label:'Input Validation & Security Phases 1–4', type:'security' },
  { v:'1.5.18', date:'20 May 2026', label:'UX, Migration Runner & Test Suite',   type:'ux'       },
  { v:'1.5.25', date:'02 Jun 2026', label:'Cancel Action, Permissions & Ticket Log', type:'minor'  },
  { v:'1.5.26', date:'03 Jun 2026', label:'Reset Ticket Data',                   type:'ux'       },
  { v:'1.5.27', date:'03 Jun 2026', label:'Self-Service Kiosk for Parents',      type:'minor'    },
  { v:'1.5.28', date:'03 Jun 2026', label:'Graceful Port Conflict Handling',     type:'fix'      },
  { v:'1.5.29', date:'03 Jun 2026', label:'TDZ Crash Fix',                       type:'fix'      },
  { v:'1.5.30', date:'03 Jun 2026', label:'Kiosk Auto-Print & Permission',       type:'ux'       },
  { v:'1.5.31', date:'03 Jun 2026', label:'Export/Import Users & Settings',      type:'minor'    },
  { v:'1.5.32', date:'03 Jun 2026', label:'Datatype Mismatch Fix',               type:'fix'      },
  { v:'1.5.33', date:'03 Jun 2026', label:'Migrations Table Schema Fix',         type:'fix'      },
  { v:'1.5.34', date:'03 Jun 2026', label:'Dynamic Port in Server Setup',        type:'fix'      },
  { v:'1.5.35', date:'03 Jun 2026', label:'Music Pause During Announcements',    type:'ux'       },
  { v:'1.5.36', date:'13 Jul 2026', label:'Version Display in Admin Settings',   type:'ux'       },
  { v:'1.5.45', date:'04 Jul 2026', label:'Audio Fixes & Standalone Screens',    type:'minor'    },
  { v:'1.5.46', date:'04 Jul 2026', label:'Archival, Backups & Licensing',       type:'minor'    },
  { v:'1.5.47', date:'12 Oct 2026', label:'Branch Merge (v1.5.36 + v1.5.46)',    type:'patch'    },
  { v:'1.5.48', date:'12 Oct 2026', label:'Timezone & Ticket Numbering Fixes',   type:'fix'      },
  { v:'1.5.49', date:'12 Oct 2026', label:'New License Signing Key',             type:'security' },
  { v:'1.5.50', date:'13 Oct 2026', label:'Staff Setup Test Connection Fix',     type:'fix'      },
];
const typeBadgeColors = {
  initial:'#3B82F6', patch:'#16A34A', security:'#DC2626',
  fix:'#D97706', minor:'#2563EB', ux:'#7C3AED'
};
// Shrink rows as versions accumulate so the index stays above the page number
const idxRowH = Math.min(20, (doc.page.height - 45 - 422) / idx.length);
idx.forEach((r, i) => {
  const y = 422 + i * idxRowH;
  const bc = typeBadgeColors[r.type] || C.navy;
  doc.rect(62, y, 36, Math.min(13, idxRowH - 1)).fill(bc);
  doc.fontSize(7.5).fillColor(C.white).font('Helvetica-Bold')
     .text(`v${r.v}`, 64, y + 3, { lineBreak: false, width: 34 });
  doc.fillColor('rgba(255,255,255,0.8)').font('Helvetica')
     .text(r.label, 104, y + 3, { lineBreak: false });
  doc.fillColor('rgba(255,255,255,0.4)').fontSize(7)
     .text(r.date, doc.page.width - 130, y + 4, { lineBreak: false });
});

// Page number
doc.fontSize(7).fillColor('rgba(255,255,255,0.3)').font('Helvetica')
   .text('Page 1', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

// ═════════════════════════════════════════════════════════════════════════════
//  CHANGELOG PAGES START
// ═════════════════════════════════════════════════════════════════════════════
newPage();

// Page header
doc.fontSize(20).fillColor(C.navy).font('Helvetica-Bold').text('Detailed Release Notes', 50, 44);
doc.fontSize(9).fillColor(C.lgray).font('Helvetica')
   .text('Every change, fix, and improvement — file level detail for all versions', 50, 68);
hr(C.navy, 1);
doc.moveDown(0.5);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.2.0 — INITIAL RELEASE
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.2.0', date: '06 May 2026', type: 'initial',
  commit: '45291daa',
  summary: 'Initial Release — Full queue management system for Al-Noor International School',
  stats: { files: 73, added: 16712, removed: 0 },
});

commitBlock(`Initial commit — SchoolQ v1.2.0

Queue management system for Al-Noor International School.

- Electron app (server + staff installers)
- Node/Express backend with SQLite
- React/Vite frontend
- Bilingual TTS (Azure Neural / Google Translate fallback)
- Arabic + English announcement support
- Custom voice templates in settings`);

sectionTitle('Application Architecture');
bullet('Electron 41 desktop application for Windows (x64)');
sub('Server build: includes backend + frontend + SQLite database');
sub('Staff build: frontend only — connects to server over LAN');
bullet('Node.js / Express backend running on port 3000');
bullet('SQLite database via better-sqlite3 (WAL mode, foreign keys enabled)');
bullet('React 19 + Vite 8 frontend with Tailwind CSS v3');
bullet('Socket.io v4 for real-time bidirectional communication');
bullet('JWT-based authentication with bcrypt password hashing');

sectionTitle('Database Schema (initial tables)');
bullet('users — user_id, username, password_hash, full_name, role, department_id, is_active, created_at, last_login');
bullet('departments — department_id, name, code, color_code, display_order, is_active, created_at');
bullet('service_categories — category_id, department_id, name, estimated_time_minutes, is_active');
bullet('tickets — ticket_id, ticket_number, department_id, category_id, parent_name, student_name, student_id, phone, purpose, priority, status, created_at, called_at, completed_at, service_duration, served_by_user_id, notes, call_count');
bullet('settings — setting_key (PK), setting_value, setting_type');
bullet('announcements — announcement_id, message_text, message_text_ar, is_active, display_order');
bullet('audit_logs — log_id, user_id, action, entity_type, entity_id, details, logged_at');
bullet('Indexes: idx_tickets_dept_status, idx_tickets_created, idx_tickets_number');

sectionTitle('Role System');
bullet('super_admin — full system access, can manage all settings, users, departments');
bullet('admin — queue management, reports, limited settings');
bullet('staff — queue dashboard for their assigned department only');
bullet('reception — ticket creation only');

sectionTitle('Queue Features');
bullet('Ticket creation at reception: parent name, student name, student ID, phone, purpose, priority');
bullet('Priority levels: Regular, Urgent, Elderly (Priority), VIP — shown with color coding and flags on ticket number');
bullet('Ticket number format: DEPT-YYYYMMDD-NNN[flag] (e.g. REG-20260506-001U for urgent)');
bullet('Staff queue dashboard: call next, recall, complete, skip (with reason), no-show, transfer to department');
bullet('Public display screen: live current ticket, department queue status, announcement ticker');
bullet('Ticket receipt printed/displayed on creation with QR-ready data');

sectionTitle('Voice Announcement System');
bullet('TTS endpoint: GET /api/tts?text=...&lang=en|ar');
bullet('Primary engine: Azure Neural TTS (requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env)');
bullet('Fallback engine: Google Translate TTS (mp3 stream, no API key required)');
bullet('Template variables: {ticket} = ticket number, {department} = department name');
bullet('Language modes per announcement: English only, Arabic only, or Both');
bullet('Announcements scroll in a ticker on the public display screen');

sectionTitle('Administration Panel');
bullet('Departments: create, edit, deactivate — with color picker, display order, service categories');
bullet('Users: create, edit, deactivate, assign to department, set role');
bullet('Announcements: create, edit, toggle active, set language, display order');
bullet('Settings: school name, primary color, working hours, TTS templates, no-show threshold, Azure keys');
bullet('Reports: daily summary — tickets served, waiting, no-shows, average service time per department');

sectionTitle('Electron / Build');
bullet('Two electron-builder configs: config/eb-server.json and config/eb-staff.json');
bullet('NSIS installer (non-oneClick, allow directory choice, desktop + start menu shortcuts)');
bullet('preload.js exposes ipcRenderer.invoke/send for config, IP detection, server ping');
bullet('Server build reads DB_PATH from Electron userData to avoid writing to Program Files');

newPage();

// ─────────────────────────────────────────────────────────────────────────────
//  v1.3.0 — BILINGUAL TTS FIX
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.3.0', date: '06 May 2026', type: 'patch',
  commit: '0eb86f53',
  summary: 'Bilingual TTS Fix & Voice Quality Improvements',
  stats: { files: 2, added: 82, removed: 45 },
});

commitBlock(`Fix bilingual TTS and improve voice robustness

- PublicDisplay: replace isSpeaking boolean flag with AbortController pattern
  — each speak() call aborts previous audio + Web Speech, no concurrent drain loops
  — adds 700ms pause between EN and AR for natural bilingual delivery
  — playTTS now has 12s hard timeout, uses {once:true} listeners, and auto-picks
    best neural voice (Microsoft Online/Natural) from Web Speech fallback
  — preloads browser voices on mount so first announcement uses best voice
- tts.js: validate Google TTS response is real MP3 (sync byte check); throws
  instead of silently serving HTML when Google blocks the request`);

sectionTitle('Files Changed');
fileTable([
  { path: 'src/frontend/src/pages/PublicDisplay.jsx', added: 116, removed: 43, note: 'AbortController pattern, 700ms pause, voice preload' },
  { path: 'src/backend/routes/tts.js',                added: 7,   removed: 7,  note: 'MP3 byte validation' },
  { path: 'config/eb-server.json',                    added: 2,   removed: 1,  note: 'Version bump 1.2.0→1.3.0' },
  { path: 'config/eb-staff.json',                     added: 2,   removed: 1,  note: 'Version bump 1.2.0→1.3.0' },
]);

sectionTitle('Technical Details — PublicDisplay.jsx');
bullet('Problem: isSpeaking boolean flag did not prevent overlapping audio when two tickets were called quickly');
bullet('Root cause: audio.play() resolves immediately on playback START, not on END — previous approach treated play() as a blocking call');
bullet('Fix: AbortController — each new speak() call cancels the previous audio element and Web Speech utterance before starting a new one');
bullet('Added 700ms silence gap between English and Arabic for natural bilingual delivery');
bullet('playTTS() now has a 12-second hard timeout via AbortController signal — prevents stuck audio blocking the queue');
bullet('Added {once: true} to all event listeners — prevents listener accumulation across repeated calls');
bullet('Voices preloaded on mount: window.speechSynthesis.getVoices() called at component startup');
sub('Selects Microsoft Online Natural voice if available (highest quality Web Speech)');
sub('Falls back to any en-US or ar-SA voice, then the browser default');

sectionTitle('Technical Details — tts.js');
bullet('Problem: Google occasionally returns an HTML error page instead of MP3 when rate-limited');
bullet('Fix: reads first 3 bytes of response synchronously — valid MP3 starts with ID3 or 0xFF 0xFB');
bullet('If response is HTML (starts with <), throws 502 Bad Gateway instead of serving garbled audio');
bullet('Frontend correctly falls back to Web Speech Synthesis on 502');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.3.1 — SECURITY HARDENING
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.3.1', date: '07 May 2026', type: 'security',
  commit: '61c35f42',
  summary: 'Security Hardening, Performance Improvements & Code Cleanup',
  stats: { files: 13, added: 223, removed: 487 },
});

commitBlock(`Release v1.3.1 — security hardening, performance improvements, cleanup

- CORS: restrict to localhost + private LAN IPs (was open wildcard)
- Auth: add rate limiting to login (20 req / 15 min)
- Tickets: wrap number generation in a transaction to prevent duplicates
- Settings: add in-memory cache (30s TTL) to avoid per-request DB queries
- Server: add gzip compression and morgan request logging
- DB: add morgan, compression, express-rate-limit dependencies
- School name fallback now consistent across queueController and display route
- Deleted unused legacy pages: AdminPanel.jsx, DisplayMonitor.jsx
- README: add security checklist for production deployment`);

sectionTitle('Files Changed');
fileTable([
  { path: 'src/backend/server.js',                          added: 30, removed: 1,   note: 'CORS, rate limit, compression, morgan' },
  { path: 'src/backend/routes/auth.js',                     added: 11, removed: 0,   note: 'loginLimiter middleware applied' },
  { path: 'src/backend/controllers/ticketController.js',    added: 22, removed: 0,   note: 'db.transaction() wrapping' },
  { path: 'src/backend/database/settingsCache.js',          added: 23, removed: 0,   note: 'New file — in-memory cache', isNew: true },
  { path: 'src/backend/controllers/queueController.js',     added: 7,  removed: 1,   note: 'Use settingsCache for school_name' },
  { path: 'src/backend/routes/display.js',                  added: 6,  removed: 1,   note: 'Use settingsCache for school_name' },
  { path: 'src/backend/routes/admin.js',                    added: 2,  removed: 0,   note: 'settingsCache invalidation on settings save' },
  { path: 'package.json',                                   added: 9,  removed: 1,   note: 'Added: morgan, compression, express-rate-limit' },
  { path: 'src/frontend/src/pages/AdminPanel.jsx',          added: 0,  removed: 292, note: 'DELETED — legacy unused page' },
  { path: 'src/frontend/src/pages/DisplayMonitor.jsx',      added: 0,  removed: 166, note: 'DELETED — legacy unused page' },
  { path: 'README.md',                                      added: 16, removed: 1,   note: 'Security deployment checklist' },
]);

sectionTitle('Security — CORS');
bullet('Before: CORS allowed any origin (wildcard *) — any website on any network could call the API');
bullet('After: regex restricts to localhost, 127.0.0.1, and private LAN ranges only:');
sub('192.168.x.x (home/school LAN)');
sub('10.x.x.x (corporate LAN)');
sub('172.16.x.x – 172.31.x.x (Docker / VPN ranges)');
bullet('No-origin requests (same-origin, Electron) still allowed');

sectionTitle('Security — Rate Limiting');
bullet('express-rate-limit applied to POST /api/auth/login endpoint');
bullet('Limit: 20 requests per 15-minute window per IP address');
bullet('Response on limit: HTTP 429 — "Too many login attempts. Try again in 15 minutes."');
bullet('Standard rate-limit response headers added (X-RateLimit-*)');

sectionTitle('Performance — Settings Cache');
bullet('settingsCache.js: Map-based in-memory cache with 30-second TTL');
bullet('Used by queueController (school_name for announcements) and display route');
bullet('Reduces DB queries from every-request to once per 30 seconds for high-read settings');
bullet('cache.get(key) / cache.set(key, value) / cache.invalidate() API');
bullet('Admin settings save calls cache.invalidate() to force fresh read on next request');

sectionTitle('Performance — Compression & Logging');
bullet('compression middleware added — gzip/brotli encoding on all HTTP responses');
bullet('Reduces response size by ~65–80% for JSON payloads, ~75% for frontend JS bundles');
bullet('morgan "dev" format added — logs HTTP method, path, status, response time to console');

sectionTitle('Reliability — Duplicate Ticket Prevention');
bullet('Before: ticket number generation and INSERT were two separate DB operations — race condition possible under concurrent requests');
bullet('After: wrapped in db.transaction() — atomic read-generate-insert prevents duplicate ticket numbers');
bullet('Transaction runs in IMMEDIATE mode (SQLite default) — serialized write access');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.3.x — BUG FIX SERIES
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.3.x', date: '07 May 2026', type: 'fix',
  commit: 'multiple',
  summary: 'Bug Fix Series — 5 Patches (Token, No-Show Setting, Startup, ABI, Final Call)',
  stats: { files: 14, added: 79, removed: 40 },
});

sectionTitle('Fix 1 — JWT Token Expiry & Auto-Logout on 401  [bdc02e5e]');
fileTable([
  { path: 'src/backend/controllers/authController.js', added: 2, removed: 1, note: 'expiresIn: 8h → 24h' },
  { path: 'src/frontend/src/lib/api.js',               added: 12, removed: 0, note: 'Response interceptor for 401 handling', isNew: false },
]);
bullet('Problem: Staff logging in at 7:00 AM were being logged out mid-day due to 8h token expiry');
bullet('Fix: JWT expiry extended from 8h to 24h — covers a full school day regardless of login time');
bullet('Problem: Expired/invalid tokens showed cryptic browser error "Invalid token" with no recovery path');
bullet('Fix: axios response interceptor in api.js — any 401 response triggers:');
sub('localStorage.removeItem("token")');
sub('localStorage.removeItem("user")');
sub('window.location.href = "/login" — automatic redirect');

sectionTitle('Fix 2 — No-Show After X Calls Was Hardcoded to 3  [2c060704]');
fileTable([
  { path: 'src/backend/controllers/queueController.js', added: 7, removed: 2, note: 'Reads from settings DB instead of const 3' },
  { path: 'src/backend/server.js',                      added: 1, removed: 0, note: 'Expose no_show_after_calls in public settings' },
  { path: 'src/frontend/src/pages/QueueDashboard.jsx',  added: 14, removed: 4, note: 'Dynamic noShowAfterCalls state' },
]);
bullet('Problem: noShow() controller had hardcoded value 3 — the admin-configurable setting was being ignored');
bullet('Fix: queueController reads no_show_after_calls from settings table on every call');
bullet('Error message now shows actual value: "Ticket has already received 5 calls (limit: 5)"');
bullet('QueueDashboard fetches no_show_after_calls from /api/settings/public on mount');
bullet('No-show button disabled state and tooltip text use the fetched value instead of hardcoded 3');
bullet('Public settings endpoint updated to include no_show_after_calls key');

sectionTitle('Fix 3 — Electron Startup Silent Crash  [bbe52776]');
fileTable([
  { path: 'electron/main.js', added: 44, removed: 31, note: 'Error dialog, waitForServer timeout 20s→30s' },
]);
bullet('Problem: any require() failure (missing module, DB error, port conflict) caused a completely silent crash');
bullet('Symptom: Electron process was alive in Task Manager but no window ever appeared');
bullet('Fix: startLocalServer() wrapped in try/catch — all errors show a dialog.showErrorBox() before app.quit()');
bullet('Error dialog shows: error type + message + "Please reinstall or contact Vyra Systems"');
bullet('waitForServer timeout increased from 20s to 30s for slower school machines');

sectionTitle('Fix 4 — Native Module ABI Mismatch  [7900ec52]');
fileTable([
  { path: 'config/eb-server.json', added: 1, removed: 0, note: 'buildDependenciesFromSource: true' },
  { path: 'config/eb-staff.json',  added: 1, removed: 0, note: 'buildDependenciesFromSource: true' },
]);
bullet('Problem: better-sqlite3 and bcrypt pre-built for system Node.js (ABI 137) — crashed in Electron 41 (ABI 145)');
bullet('Error: "The module was compiled against a different Node.js version"');
bullet('Fix: buildDependenciesFromSource: true in both builder configs');
bullet('@electron/rebuild recompiles bcrypt and better-sqlite3 from C++ source for the exact Electron ABI at build time');
bullet('Build time increases by ~2 minutes but produces correct binaries — no more crash on launch');

sectionTitle('Fix 5 — Final Call Always Used Final Template  [5a49bcb2]');
fileTable([
  { path: 'src/backend/controllers/queueController.js', added: 4, removed: 1, note: 'is_final logic added' },
  { path: 'src/frontend/src/pages/PublicDisplay.jsx',   added: 2, removed: 1, note: 'Reads is_final from socket data' },
]);
bullet('Problem: every ticket recall used the "final call" TTS template, not just the last one');
bullet('Fix: backend computes is_final = call_count >= no_show_after_calls after incrementing call_count');
bullet('Socket emit for ticket_recalled now includes is_final boolean');
bullet('PublicDisplay.jsx uses is_final to choose between recall_template_en/ar and final_call_template_en/ar');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.4.0 — PERMISSIONS, LOGO, AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.4.0', date: '07 May 2026', type: 'minor',
  commit: '8cedfca0',
  summary: 'Per-User Screen Permissions, School Logo Upload & Full Audit Log',
  stats: { files: 12, added: 125, removed: 27 },
});

commitBlock(`WIP v1.4.0 — permissions, logo, audit log, menu bar removed

- Remove Electron menu bar (File/Edit/View)
- Logo upload in admin settings, stored as base64, shown on public display
- Per-user screen access control (allowed_pages JSON column on users)
- Admin Users form now has Screen Access checkboxes
- ProtectedRoute enforces allowed_pages when set
- Audit log helper wired into auth + ticket creation
- DB migration: adds allowed_pages to users table
- JSON body limit raised to 5mb for base64 logo uploads`);

sectionTitle('Files Changed');
fileTable([
  { path: 'src/backend/audit.js',                           added: 13, removed: 0,  note: 'New audit helper module', isNew: true },
  { path: 'src/frontend/src/pages/admin/Users.jsx',         added: 38, removed: 2,  note: 'Screen Access checkboxes UI' },
  { path: 'src/frontend/src/pages/admin/Settings.jsx',      added: 29, removed: 1,  note: 'Logo upload + preview UI' },
  { path: 'src/frontend/src/App.jsx',                       added: 19, removed: 6,  note: 'ProtectedRoute allowed_pages enforcement' },
  { path: 'src/backend/controllers/authController.js',      added: 13, removed: 3,  note: 'allowed_pages in JWT response, audit login' },
  { path: 'src/backend/routes/admin.js',                    added: 14, removed: 5,  note: 'allowed_pages CRUD, logo setting' },
  { path: 'src/frontend/src/pages/PublicDisplay.jsx',       added: 15, removed: 4,  note: 'School logo display' },
  { path: 'src/backend/database/db.js',                     added: 1,  removed: 0,  note: 'Migration: allowed_pages column' },
  { path: 'src/backend/server.js',                          added: 4,  removed: 2,  note: 'JSON body limit 1mb→5mb' },
  { path: 'src/backend/controllers/queueController.js',     added: 1,  removed: 0,  note: 'Audit ticket_called event' },
  { path: 'src/backend/controllers/ticketController.js',    added: 2,  removed: 0,  note: 'Audit TICKET_CREATED event' },
  { path: 'electron/main.js',                               added: 3,  removed: 1,  note: 'Menu.setApplicationMenu(null)' },
]);

sectionTitle('Screen Access Control');
bullet('New column: users.allowed_pages (TEXT, JSON array, DEFAULT NULL)');
bullet('NULL means no restriction — all screens accessible (backwards compatible with existing users)');
bullet('Example value: ["reception","queue","reports"]');
bullet('ProtectedRoute logic: if page prop is set AND user.allowed_pages is not null, check inclusion');
sub('If page is in allowed_pages → grant access');
sub('If page not in allowed_pages → redirect to /home');
sub('super_admin and admin: allowed_pages is always null → full access');
bullet('Admin Users form: checkboxes for Reception, Queue, Admin, Reports screens');
bullet('PUT /admin/users/:id accepts allowed_pages array, JSON.stringify() before storing');
bullet('GET /api/auth/me includes allowed_pages in response for client-side routing decisions');

sectionTitle('School Logo');
bullet('New setting key: school_logo (TEXT, stores data: base64 URI)');
bullet('Admin Settings: file input (accept image/*, max 2MB), FileReader converts to base64');
bullet('JSON body limit raised from 1MB to 5MB in express.json() to handle base64-encoded images');
bullet('Public display screen shows logo in top-left corner of the display');
bullet('Logo included in public settings endpoint for frontend access without auth');

sectionTitle('Audit Log System');
bullet('audit.js: singleton prepared INSERT statement — INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)');
bullet('log(userId, action, entityType, entityId, details) — details JSON.stringify()\'d');
bullet('Audited actions: LOGIN, TICKET_CREATED, TICKET_CALLED, TICKET_COMPLETED, NO_SHOW, TRANSFER, USER_CREATED, USER_UPDATED, DEPT_CREATED, DEPT_UPDATED, ANNOUNCEMENT_CREATED, ANNOUNCEMENT_DELETED, SETTINGS_UPDATED');
bullet('Audit failures silently swallowed (catch {}) — audit log write errors do not break primary operations');
bullet('Admin panel Audit Log page: date range filter, user filter, action filter, paginated table, export');

sectionTitle('Electron');
bullet('Menu.setApplicationMenu(null) — removes File/Edit/View/Window/Help menu bar from all windows');
bullet('Provides a cleaner kiosk-style appearance appropriate for school deployment');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.15 — SERVICE TYPES DEEP INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.15', date: '15 May 2026', type: 'minor',
  commit: '384d5b4a',
  summary: 'Service Types Deep Integration, Room Numbers & Sequential Bilingual Announcements',
  stats: { files: 27, added: 1526, removed: 422 },
});

commitBlock(`v1.5.15 — service types deep integration, room number, announcement fixes

- Part 1: Reception live wait estimate using per-service estimated_time_minutes
- Part 2: Service Type detailed report tab with estimated vs actual chart + export
- Part 3: Smart estimate suggestions in Departments modal from last 30 days real data
- Add room_number field to departments, {room} variable in voice templates
- Fix announcement TTS: both languages now play sequentially (English then Arabic)
- Fix announcement ticker to use per-announcement speak_language field
- Fix Test Connection in Staff setup via IPC (bypasses CORS from file://)
- Fix screen access permissions, toggleActive wipe bug, Home tile filter order
- Fix port conflict detection with isSchoolQOnPort3000 HTTP check`);

sectionTitle('Files Changed');
fileTable([
  { path: 'src/frontend/src/pages/Reception.jsx',           added: 194, removed: 134, note: 'Complete rewrite — live wait estimate' },
  { path: 'src/frontend/src/pages/Reports.jsx',             added: 459, removed: 284, note: 'Complete rewrite — tab system, service types' },
  { path: 'src/frontend/src/pages/admin/Departments.jsx',   added: 307, removed: 82,  note: 'Smart suggestions, room number form' },
  { path: 'src/frontend/src/pages/admin/QueueControl.jsx',  added: 311, removed: 0,   note: 'New page', isNew: true },
  { path: 'src/frontend/src/pages/admin/AuditLog.jsx',      added: 139, removed: 0,   note: 'New page', isNew: true },
  { path: 'src/backend/routes/reports.js',                  added: 64,  removed: 0,   note: 'New endpoints: /service-types, /category-stats', isNew: true },
  { path: 'src/frontend/src/App.jsx',                       added: 177, removed: 58,  note: 'Route additions, ProtectedRoute fixes' },
  { path: 'src/backend/routes/admin.js',                    added: 81,  removed: 1,   note: 'room_number CRUD, category CRUD' },
  { path: 'src/frontend/src/pages/admin/Announcements.jsx', added: 53,  removed: 10,  note: 'Sequential bilingual playback fix' },
  { path: 'src/frontend/src/pages/PublicDisplay.jsx',       added: 29,  removed: 9,   note: 'applyVars {room}, per-announcement language' },
  { path: 'src/backend/controllers/queueController.js',     added: 10,  removed: 0,   note: 'department_room in socket emits' },
  { path: 'src/frontend/src/lib/api.js',                    added: 13,  removed: 0,   note: 'reportsAPI export added' },
  { path: 'src/backend/database/db.js',                     added: 2,   removed: 0,   note: 'room_number migration' },
  { path: 'electron/main.js',                               added: 42,  removed: 1,   note: 'IPC test-server handler, port check fix' },
  { path: 'src/frontend/src/store/useAuthStore.js',         added: 5,   removed: 0,   note: 'updateUser action' },
  { path: 'src/frontend/src/pages/admin/Users.jsx',         added: 15,  removed: 2,   note: 'Toggle fix' },
  { path: 'src/frontend/src/pages/admin/Settings.jsx',      added: 3,   removed: 1,   note: '{room} hint added' },
  { path: 'electron/preload.js',                            added: 3,   removed: 0,   note: 'testServer IPC bridge' },
]);

sectionTitle('Part 1 — Live Wait Estimate at Reception');
bullet('Two new useEffect hooks: one loads service categories + current queue count when department changes; one recalculates estimate when category or count changes');
bullet('Formula: waitMinutes = Math.ceil(waitingCount × estimatedTimeMinutes / activeStaffCount)');
bullet('Uses selected service category\'s estimated_time_minutes (not a hardcoded value)');
bullet('Falls back to department average estimated time if no category selected');
bullet('Service type dropdown shows "(X min)" label beside each service name');
bullet('Wait estimate banner examples:');
sub('"~15 min — 3 people ahead × 5 min/service"');
sub('"You\'re next — no wait!" — shown when queue is empty');
sub('"~2 min — 1 person ahead" — for short queues');

sectionTitle('Part 2 — Service Type Report Tab');
bullet('Reports.jsx rewritten with a tab system: "Daily Summary" | "Service Types"');
bullet('New DailySummary and ServiceTypeReport sub-components');
bullet('Service Types tab — filters: date range (from/to), department (optional)');
bullet('Table columns: Service Type, Department, Estimated (min), Actual Avg (min), Accuracy, Total, Served, No-Shows');
bullet('AccuracyBadge: green ≤2 min diff, yellow ≤5 min, red >5 min');
bullet('Recharts grouped bar chart: amber bars = Estimated, teal bars = Actual, per service type');
bullet('Export to PDF via jsPDF + jspdf-autotable; Export to Excel via xlsx library');
bullet('Backend: GET /reports/service-types?from=&to=&department_id= — joins tickets with service_categories');
bullet('Backend: GET /reports/category-stats — actual_avg_minutes and sample_count per category (last 30 days)');

sectionTitle('Part 3 — Smart Estimate Suggestions');
bullet('Departments modal fetches reportsAPI.getCategoryStats() when opened');
bullet('Builds catStats Map: category_id → { actual_avg_minutes, sample_count }');
bullet('When editing a service type row, the catStats for that category are shown:');
sub('diff ≤ 2 min: green "✓ your estimate is accurate" — no action needed');
sub('diff > 2 min: amber banner "Actual avg last 30 days: X min (N tickets)" + "Use X min" button');
bullet('"Use X min" button calls setcf("estimated_time_minutes", actualAvg) — updates the form field immediately');
bullet('Sample count shown so admin knows whether data is statistically reliable');

sectionTitle('Room Number Feature');
bullet('DB migration: ALTER TABLE departments ADD COLUMN room_number TEXT DEFAULT NULL');
bullet('Admin Departments form: new "Room Number" text input with hint: "Use {room} in voice templates"');
bullet('PUT /departments/:id and POST /departments now accept and save room_number');
bullet('GET /departments/:id returns room_number in response');
bullet('queueController: ticket_called and ticket_recalled socket emits include department_room: dept.room_number || null');
bullet('PublicDisplay.jsx applyVars() updated: replace({room}) replaces with departmentRoom || empty string');
bullet('Settings page TTS template hints updated: Variables: {ticket}, {department}, {room}');

sectionTitle('Announcement Sequential Playback Fix');
bullet('Problem: admin Test Voice button for "both" language only played English');
bullet('Root cause: handleTest used ternary (lang === "ar" ? ar : en) — "both" fell through to English only');
bullet('Fix: explicit if/else if/else — both case: await playTTS(en), then await playTTS(ar)');
bullet('Problem: both languages were playing simultaneously (overlapping audio)');
bullet('Root cause: audio.play() resolves when playback STARTS (not ends) — awaiting it does not wait for finish');
bullet('Fix: playTTS() returns a Promise that resolves on the "ended" event:');
sub('audio.addEventListener("ended", resolve, { once: true })');
sub('audio.addEventListener("error", resolve, { once: true }) — also resolves on failure to avoid hanging');
sub('audio.play().catch(() => audio.dispatchEvent(new Event("error"))) — surfaces play() rejection');

sectionTitle('Other Bug Fixes (v1.5.15)');
bullet('Staff setup Test Connection: was failing with CORS error because fetch() from file:// has null origin');
sub('Fix: IPC bridge — preload.js exposes testServer(), electron main.js handles via http.get to avoid CORS');
bullet('toggleActive bug: saving user with the toggle button was wiping allowed_pages (spread order issue)');
bullet('Home page tile ordering fixed — admin/super_admin see different tile sets in correct order');
bullet('Port conflict detection: previously any TCP listener on 3000 was killed');
sub('Fix: isSchoolQOnPort3000() HTTP check — only kill if the process on 3000 is NOT SchoolQ');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.16 — FORCE LOGOUT & SOCKET SECURITY
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.16', date: '20 May 2026', type: 'security',
  commit: 'not committed (working changes)',
  summary: 'Force Logout on Deactivation, Socket Authentication & Auth Middleware Hardening',
  stats: { files: 5, added: 120, removed: 18 },
});

sectionTitle('Files Changed');
fileTable([
  { path: 'src/backend/socket/handlers.js',           added: 55, removed: 17, note: 'JWT auth middleware, user-socket tracking, forceLogout' },
  { path: 'src/backend/middleware/auth.js',            added: 5,  removed: 2,  note: 'is_active DB check on every request' },
  { path: 'src/backend/routes/admin.js',               added: 8,  removed: 0,  note: 'forceLogout() call on user deactivation' },
  { path: 'src/frontend/src/lib/useSocket.js',         added: 18, removed: 4,  note: 'token in auth, force_logout listener' },
  { path: 'src/backend/controllers/authController.js', added: 2,  removed: 1,  note: 'JWT expiry 24h→8h' },
]);

sectionTitle('Force Logout Flow');
bullet('Admin deactivates user → PUT /admin/users/:id sets is_active = 0 → socketHandlers.forceLogout(userId) called');
bullet('handlers.js maintains userSockets Map: userId → Set<socketId> — multiple tabs tracked per user');
bullet('forceLogout(io, userId): iterates the Set, calls io.to(socketId).emit("force_logout") for each');
bullet('Frontend useSocket hook listens: socket.on("force_logout", forceLogoutCleanup)');
bullet('forceLogoutCleanup(): localStorage.removeItem("token"), removeItem("user"), window.location.href = "/login"');
bullet('Result: deactivated user\'s browser redirects to /login within ~100ms of admin clicking save');

sectionTitle('Socket Authentication');
bullet('io.use() middleware added in handlers.js — runs before any socket is accepted');
bullet('Reads token from socket.handshake.auth.token');
sub('If no token → next() with no user set (allows public display to connect unauthenticated)');
sub('If token present → jwt.verify() + DB is_active check → socket.userId = decoded.user_id');
sub('If token invalid or user inactive → next(new Error("...")) — connection rejected');
bullet('useSocket.js passes token in connection options: { auth: { token: localStorage.getItem("token") } }');
bullet('useMonitorSocket (public display) passes no auth — intentionally unauthenticated');
bullet('Socket tracking: trackSocket(userId, socketId) on connect, untrackSocket on disconnect');

sectionTitle('Auth Middleware — Active Check');
bullet('Before: auth.js only verified JWT signature — deactivated users could make API calls until token expired');
bullet('After: additional DB query after token decode: SELECT is_active FROM users WHERE user_id = ?');
bullet('If is_active = 0 or user not found → 401 "Account deactivated"');
bullet('api.js 401 interceptor catches this and redirects to /login');
bullet('Performance note: indexed on users(is_active) — fast lookup, minimal overhead per request');

sectionTitle('JWT Expiry');
bullet('Reduced from 24h back to 8h — 24h was a temporary fix for the early-login problem');
bullet('Now that force-logout and is_active check exist, short expiry is safe and preferable');
bullet('8h matches a standard school work day; session always ends at logout or token expiry');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.17 — PHASES 1–4
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.17', date: '20 May 2026', type: 'security',
  commit: 'not committed (working changes)',
  summary: 'Phases 1–4: Input Validation, Per-Install JWT Secret, Rate Limiting, Error Handler & DB Indexes',
  stats: { files: 13, added: 280, removed: 25 },
});

sectionTitle('Files Changed');
fileTable([
  { path: 'src/backend/middleware/validate.js',              added: 65, removed: 0,  note: 'New validation middleware module', isNew: true },
  { path: 'src/backend/middleware/errorHandler.js',          added: 11, removed: 0,  note: 'New centralized error handler', isNew: true },
  { path: 'src/backend/routes/auth.js',                     added: 6,  removed: 2,  note: 'Validation on login, change-password' },
  { path: 'src/backend/routes/tickets.js',                  added: 4,  removed: 1,  note: 'Validation on POST /tickets' },
  { path: 'src/backend/routes/admin.js',                    added: 12, removed: 6,  note: 'Validation on all POST/PUT routes' },
  { path: 'src/backend/server.js',                          added: 16, removed: 2,  note: 'mutationLimiter, errorHandler registration' },
  { path: 'src/backend/database/schema.sql',                added: 9,  removed: 3,  note: '7 new CREATE INDEX statements' },
  { path: 'src/backend/controllers/authController.js',      added: 1,  removed: 1,  note: 'Password min 6→8 chars' },
  { path: 'src/backend/audit.js',                           added: 2,  removed: 1,  note: 'Silent catch {} → logged error' },
  { path: 'electron/main.js',                               added: 12, removed: 2,  note: 'Per-install JWT secret generation' },
  { path: 'config/eb-server.json',                          added: 0,  removed: 1,  note: 'Removed .env from build files list' },
  { path: 'package.json',                                   added: 2,  removed: 1,  note: 'express-validator dependency' },
  { path: 'src/backend/database/schema.sql',                added: 9,  removed: 3,  note: '7 new indexes' },
]);

sectionTitle('Phase 1 — Input Validation (express-validator)');
bullet('validate.js: validation chains using body(), param(), bail() from express-validator');
bullet('checkValidation middleware: calls validationResult(req) — returns HTTP 422 with first error message on failure');
bullet('All validation chains use .bail() — stops on first error per field, avoids cascading messages');
bullet('Rules defined:');
sub('rules.login — username: trim + notEmpty; password: notEmpty');
sub('rules.changePassword — current_password: notEmpty; new_password: isLength({ min: 8 })');
sub('rules.createUser — username: 3–50 chars; password: ≥8 chars; full_name: notEmpty; role: isIn([valid_roles])');
sub('rules.updateUser — full_name: notEmpty; role: isIn([valid_roles])');
sub('rules.createDepartment — name: notEmpty; code: isAlphanumeric + isLength(1–10)');
sub('rules.updateDepartment — same as create');
sub('rules.createAnnouncement — message_text: notEmpty; speak_language: optional isIn(["en","ar","both"])');
sub('rules.createTicket — department_id: isInt({ min:1 }); priority: optional isIn(VALID_PRIORITY); names/phone: optional length limits');
bullet('Applied to: POST /auth/login, PUT /auth/change-password, POST+PUT /admin/users, POST+PUT /admin/departments, POST+PUT /admin/announcements, POST /tickets');

sectionTitle('Phase 2 — Security Hardening');
bullet('Per-install JWT secret — electron/main.js startLocalServer():');
sub('Checks for jwt-secret.txt in app.getPath("userData")');
sub('If absent: crypto.randomBytes(64).toString("hex") → writes to jwt-secret.txt');
sub('Sets process.env.JWT_SECRET from file before requiring backend server');
sub('Result: each installation has a cryptographically unique 512-bit secret');
sub('Removed dotenv call — JWT_SECRET no longer comes from .env');
bullet('.env removed from electron-builder files list in eb-server.json and root package.json build config');
sub('Before: JWT_SECRET was hardcoded "school-queue-secret-2024" and bundled into every installer');
sub('After: .env not included in build; secret generated fresh on first run');
bullet('mutationLimiter added in server.js: 60 requests / 1 minute / IP');
sub('Applied to: /api/tickets, /api/queue, /api/admin (all write-heavy endpoints)');
sub('Login retains its own stricter limiter (20 / 15 min)');
bullet('Minimum password: 6 → 8 characters in authController.changePassword validation');

sectionTitle('Phase 3 — Centralized Error Handler');
bullet('errorHandler.js: standard Express error-handling middleware signature (err, req, res, next)');
bullet('status < 500: pass err.message to client (intentional 4xx errors)');
bullet('status >= 500: log full error to console with method + path; return generic "Internal server error" to client');
bullet('Never exposes stack traces to clients — production-safe');
bullet('Registered as last middleware in server.js: app.use(errorHandler)');
bullet('audit.js: catch {} → catch (err) { console.error("[AUDIT] Failed to write audit log:", action, err.message) }');
sub('Audit failures now visible in server logs but still do not break primary operations');

sectionTitle('Phase 4 — Database Indexes');
bullet('7 new indexes added to schema.sql with CREATE INDEX IF NOT EXISTS — safe to apply to existing databases:');
sub('idx_tickets_completed_at ON tickets(completed_at) — date range queries in service type reports');
sub('idx_tickets_served_by ON tickets(served_by_user_id) — per-staff performance queries');
sub('idx_tickets_category ON tickets(category_id) — service type report JOIN');
sub('idx_audit_logged_at ON audit_logs(logged_at) — audit log date filtering');
sub('idx_audit_user ON audit_logs(user_id) — per-user audit trail');
sub('idx_users_dept ON users(department_id) — staff count per department');
sub('idx_users_active ON users(is_active) — auth middleware active-check lookup');
bullet('Pre-existing indexes retained: idx_tickets_dept_status, idx_tickets_created, idx_tickets_number');
bullet('Impact: report queries covering 30+ day date ranges run significantly faster on databases with 1000+ tickets');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.18 — UX, MIGRATION RUNNER, TESTS
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.18', date: '20 May 2026', type: 'ux',
  commit: 'not committed (working changes)',
  summary: 'Phases 5–7: Toast Notifications, Skeleton Loaders, Migration Runner & Automated Tests',
  stats: { files: 17, added: 420, removed: 45 },
});

sectionTitle('Files Changed');
fileTable([
  { path: 'src/frontend/src/store/useToastStore.js',         added: 22, removed: 0,  note: 'New Zustand toast store', isNew: true },
  { path: 'src/frontend/src/components/Toast.jsx',           added: 34, removed: 0,  note: 'New toast component', isNew: true },
  { path: 'src/backend/middleware/validate.js',              added: 0,  removed: 0,  note: 'Already in v1.5.17' },
  { path: 'src/frontend/src/App.jsx',                        added: 3,  removed: 0,  note: '<Toast /> mounted + import' },
  { path: 'src/frontend/tailwind.config.js',                 added: 5,  removed: 2,  note: 'fade-in keyframe + animation' },
  { path: 'src/frontend/src/pages/QueueDashboard.jsx',       added: 22, removed: 7,  note: 'Toast, skeleton, loading state' },
  { path: 'src/frontend/src/pages/Reception.jsx',            added: 3,  removed: 2,  note: 'alert → toast' },
  { path: 'src/frontend/src/pages/Reports.jsx',              added: 3,  removed: 2,  note: 'alert → toast (2 occurrences)' },
  { path: 'src/frontend/src/pages/admin/QueueControl.jsx',   added: 8,  removed: 7,  note: 'alert → toast (7 occurrences)' },
  { path: 'src/frontend/src/pages/admin/Users.jsx',          added: 2,  removed: 1,  note: 'alert → toast' },
  { path: 'src/frontend/src/pages/admin/Settings.jsx',       added: 3,  removed: 2,  note: 'alert → toast (2 occurrences)' },
  { path: 'src/backend/database/migrations/runner.js',       added: 55, removed: 0,  note: 'New migration runner', isNew: true },
  { path: 'src/backend/database/db.js',                      added: 3,  removed: 6,  note: 'Use runner.js, remove try/catch blocks' },
  { path: 'src/backend/tests/validate.test.js',              added: 45, removed: 0,  note: 'New — 7 tests', isNew: true },
  { path: 'src/backend/tests/auth.test.js',                  added: 72, removed: 0,  note: 'New — 5 tests', isNew: true },
  { path: 'src/backend/tests/tickets.test.js',               added: 58, removed: 0,  note: 'New — 4 tests', isNew: true },
  { path: 'package.json',                                    added: 8,  removed: 1,  note: 'jest, supertest, pdfkit, npm test script' },
]);

sectionTitle('Phase 5 — Toast Notification System');
bullet('useToastStore.js (Zustand): toasts array, addToast(message, type, duration), removeToast(id)');
sub('Auto-dismiss: setTimeout removes toast after duration (4000ms for errors, 3000ms for success/info)');
sub('Monotonic ID counter — no duplicate keys even under rapid toasts');
bullet('Toast.jsx: fixed bottom-right overlay, z-index 9999, stacks vertically with 2px gap');
sub('Types: error (red bg), success (green bg), info (blue bg)');
sub('Icons: ✕ for error, ✓ for success, ℹ for info');
sub('Dismiss button (×) on each toast — calls removeToast(id)');
sub('animate-fade-in CSS class: opacity 0→1 + translateY 8px→0, duration 0.2s ease-out');
bullet('toast helper object: toast.error(msg), toast.success(msg), toast.info(msg)');
sub('Uses useToastStore.getState().addToast() — callable outside React components (from catch blocks)');
bullet('<Toast /> mounted in App.jsx root — single instance, always visible regardless of current route');
bullet('14 alert() calls replaced across 6 files — all errors now non-blocking, dismissable, auto-clearing');

sectionTitle('Phase 5 — Loading Skeleton in QueueDashboard');
bullet('QueueSkeleton component: 3 animated gray bars (h-16 bg-gray-200 animate-pulse rounded-lg)');
bullet('loading state (useState(true)) — set to false in fetchQueue finally block');
bullet('Queue table hidden (CSS class "hidden") while loading = true; skeleton shown instead');
bullet('Prevents flash of "No waiting tickets" empty state on initial load');
bullet('animate-pulse is a Tailwind built-in: opacity oscillates via CSS @keyframes');

sectionTitle('Phase 6 — Proper Migration Runner');
bullet('migrations/runner.js replaces fragile try/catch ALTER TABLE pattern in db.js');
bullet('migrations table: CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TIMESTAMP)');
bullet('On startup: loads applied Set from migrations table, iterates migrations array, skips applied ones');
bullet('Each migration: { id: number, name: string, up: (db) => void }');
bullet('Error handling: "duplicate column" error (SQLite-specific) → marks as applied and continues');
bullet('Other errors → logged to console, migration not marked applied (will retry next start)');
bullet('Console output per applied migration: ✓ Migration 1: add_announcement_speak_language');
bullet('4 existing schema changes ported:');
sub('id:1 — add speak_language to announcements');
sub('id:2 — add allowed_pages to users');
sub('id:3 — add name_ar to departments');
sub('id:4 — add room_number to departments');
bullet('Future changes: add { id: N, name: "description", up: (db) => db.prepare("...").run() } to migrations array');

sectionTitle('Phase 7 — Automated Test Suite (16 tests)');
bullet('Jest + Supertest installed as devDependencies; npm test configured');
bullet('testMatch: **/tests/**/*.test.js — all test files in src/backend/tests/');
bullet('All tests mock the DB (jest.mock("../database/db")) — no Electron native module dependency');
bullet('Why mocking needed: better-sqlite3 is compiled for Electron\'s Node ABI — incompatible with test runner');

kv('validate.test.js', '7 tests — pure middleware, no DB needed', C.green);
sub('createUser: username < 3 chars → 422, invalid role → 422, password < 8 chars → 422, valid data → 200');
sub('createTicket: non-integer department_id → 422, invalid priority → 422, valid data → 200');

kv('auth.test.js', '5 tests — auth routes with mocked DB', C.green);
sub('login: missing username → 422, missing password → 422, wrong password → 401, valid login → 200 + token');
sub('change-password: new_password < 8 chars → 422');

kv('tickets.test.js', '4 tests — ticket routes with mocked DB', C.green);
sub('no auth → 401, missing department_id → 422, invalid priority → 422, valid data → passes validation');

bullet('All 16 tests pass in ~2.7 seconds');
bullet('Test run command: npm test (runs npx jest)');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.25 — CANCEL ACTION, GRANULAR PERMISSIONS, TICKET LOG
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.25', date: '02 Jun 2026', type: 'minor',
  commit: 'dd236e0',
  summary: 'Cancel / Left Action, No-Show Reason, Granular Report Permissions & Ticket Log Wait Time Fix',
  stats: { files: 13, added: 420, removed: 55 },
});
commitBlock(`v1.5.25 — cancel action, no-show reason, granular report permissions, ticket log wait time fix

- Cancel/Left action: customer-left-voluntarily status with required reason
- No-Show now accepts optional reason stored in ticket notes
- Granular report tab permissions: restrict individual report tabs per user
- Ticket log wait_minutes shows elapsed time for currently-waiting tickets`);

sectionTitle('Cancel / Left Action');
bullet('New ticket status: cancelled — distinct from skip (back of queue) and no_show (did not answer calls)');
bullet('Staff clicks "CANCEL / LEFT" on serving panel or waiting row — required reason field shown');
bullet('Backend: PUT /queue/tickets/:id/cancel validates reason is not empty (422 if blank)');
bullet('Ticket updated: status = cancelled, completed_at = now(), notes = "Cancelled: <reason>"');
bullet('Available on both Queue Dashboard and All Queues screen');
bullet('Logged to audit log as TICKET_CANCELLED with reason included');

sectionTitle('No-Show Optional Reason');
bullet('No-Show modal now includes an optional text field for reason');
bullet('When provided, stored in ticket notes as "No-Show: <reason>"');
bullet('Helps track patterns (e.g. parent left, wrong department, etc.)');

sectionTitle('Granular Report Tab Permissions');
bullet('ALL_PAGES in Users.jsx expanded with 5 report sub-keys:');
sub('reports_daily, reports_service_types, reports_transfers, reports_purposes, reports_ticket_log');
bullet('Sub-items visually indented (ml-6) under the Reports parent in the Screen Access list');
bullet('togglePage auto-manages parent: checking any sub-key adds "reports"; removing last sub-key removes "reports"');
bullet('Reports.jsx filters visible tabs at runtime based on user.allowed_pages:');
sub('null → all tabs (role defaults)');
sub('Has reports_* sub-keys → only those tabs shown');
sub('Only "reports" parent key → all tabs shown');
bullet('Active tab auto-corrects to first visible tab on mount if current tab is hidden');
bullet('"cancelled" status added to STATUS_STYLE (gray) and ticket log status filter dropdown');

sectionTitle('Ticket Log Wait Time Fix');
bullet('Previously: wait_minutes only calculated after ticket was called (NULL for still-waiting tickets)');
bullet('Fix: SQL CASE expression — waiting tickets use julianday("now") - julianday(created_at) × 1440');
bullet('Live elapsed wait time now shown for currently waiting tickets in the Ticket Log report');

fileTable([
  { path: 'src/backend/controllers/queueController.js', added: 25, removed: 3,  note: 'cancel action, noShow with reason' },
  { path: 'src/backend/routes/queue.js',                added: 2,  removed: 0,  note: 'PUT /tickets/:id/cancel route' },
  { path: 'src/backend/routes/reports.js',              added: 12, removed: 6,  note: 'wait_minutes fix for waiting tickets' },
  { path: 'src/frontend/src/lib/api.js',                added: 3,  removed: 1,  note: 'cancel(), noShow with reason param' },
  { path: 'src/frontend/src/pages/QueueDashboard.jsx',  added: 68, removed: 18, note: 'cancel modal, no-show reason modal' },
  { path: 'src/frontend/src/pages/AllQueues.jsx',       added: 40, removed: 12, note: 'cancel button + modal' },
  { path: 'src/frontend/src/pages/admin/Users.jsx',     added: 18, removed: 4,  note: 'report sub-permissions, indentation' },
  { path: 'src/frontend/src/pages/Reports.jsx',         added: 22, removed: 8,  note: 'tab filter, cancelled status' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.26 — RESET TICKET DATA
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.26', date: '03 Jun 2026', type: 'ux',
  commit: '33bc461',
  summary: 'Danger Zone — Reset All Ticket Data Feature in Admin Settings',
  stats: { files: 6, added: 50, removed: 5 },
});
bullet('"Danger Zone" section added to Admin Settings (visible to super_admin only)');
bullet('"Reset All Ticket Data" button with two-step confirmation: click → "Are you sure?" → "Yes, Delete All"');
bullet('Deletes all rows from tickets and transfers tables (users, departments, settings unaffected)');
bullet('Broadcasts queue_updated to all department Socket.io rooms immediately after reset');
bullet('Action logged in audit log as TICKETS_RESET');
bullet('Backend: POST /admin/reset-tickets — requireRole super_admin');
bullet('Frontend: Settings.jsx uses user.role check to gate Danger Zone section visibility');
fileTable([
  { path: 'src/backend/routes/admin.js',                added: 16, removed: 0,  note: 'POST /reset-tickets route' },
  { path: 'src/frontend/src/lib/api.js',                added: 1,  removed: 0,  note: 'resetTickets() call' },
  { path: 'src/frontend/src/pages/admin/Settings.jsx',  added: 43, removed: 1,  note: 'Danger Zone UI, useAuthStore import' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.27 — SELF-SERVICE KIOSK
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.27', date: '03 Jun 2026', type: 'minor',
  commit: 'fc14665',
  summary: 'Self-Service Kiosk Screen — Parents Get Tickets Without Reception Staff',
  stats: { files: 10, added: 310, removed: 3 },
});
commitBlock(`v1.5.27 — self-service kiosk screen for parents

New /kiosk page: touch-optimized multi-step flow for parents to
get queue tickets without needing a reception staff member.
No login required — publicly accessible like the display screen.`);

sectionTitle('Kiosk Flow (4 steps)');
bullet('Welcome — "مرحباً · Welcome" full screen with large "Get a Ticket" button');
bullet('Info — Parent name (required) + student name (optional) — large touch-friendly inputs');
bullet('Department — Grid of large tappable department buttons');
bullet('Service Type — Grid of category buttons (only shown if dept has categories); "Other / Not sure" skip option');
bullet('Done — Ticket number displayed large, estimated wait shown, auto-resets after 30 seconds');

sectionTitle('Technical Details');
bullet('/kiosk route added to App.jsx without ProtectedRoute (public, like /display)');
bullet('New backend route: POST /api/kiosk/ticket — no authentication required');
sub('Validates parent_name and department_id, always creates with priority = regular');
sub('Emits queue_updated to dept socket room — staff queues update instantly');
sub('Logs KIOSK_TICKET_CREATED to audit log with null user_id');
bullet('ticketController.js: exported createTicketTx and calculateWaitTime for reuse by kiosk route');
bullet('kioskAPI.createTicket() added to api.js frontend API layer');
bullet('Uses existing departmentAPI.getAll() and departmentAPI.getCategories() (already public endpoints)');
bullet('Settings (school name, logo) loaded from /api/settings/public on mount');
bullet('"Self-Service Kiosk" tile added to Home page for admin navigation (orange color)');

fileTable([
  { path: 'src/backend/routes/kiosk.js',                 added: 35, removed: 0,  note: 'New public ticket creation endpoint', isNew: true },
  { path: 'src/backend/server.js',                        added: 2,  removed: 0,  note: 'Register /api/kiosk route' },
  { path: 'src/backend/controllers/ticketController.js',  added: 3,  removed: 0,  note: 'Export createTicketTx, calculateWaitTime' },
  { path: 'src/frontend/src/pages/Kiosk.jsx',            added: 220, removed: 0, note: 'New touch-optimized kiosk page', isNew: true },
  { path: 'src/frontend/src/lib/api.js',                  added: 3,  removed: 0,  note: 'kioskAPI.createTicket()' },
  { path: 'src/frontend/src/App.jsx',                     added: 2,  removed: 0,  note: '/kiosk route (public)' },
  { path: 'src/frontend/src/pages/Home.jsx',              added: 7,  removed: 0,  note: 'Self-Service Kiosk tile' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.28 — GRACEFUL PORT CONFLICT HANDLING
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.28', date: '03 Jun 2026', type: 'fix',
  commit: '983a165',
  summary: 'Auto Port Scan on Conflict — No Longer Kills Foreign Processes on Port 3000',
  stats: { files: 6, added: 54, removed: 37 },
});
bullet('Old behavior: if port 3000 was busy, Electron forcibly killed the process holding it via PowerShell Stop-Process');
bullet('New behavior: server auto-scans ports 3000–3010, binds to first available, sets process.env.ACTUAL_PORT');
bullet('Electron main.js polls ACTUAL_PORT every 200ms until set, then opens window on that port');
bullet('Removed: isSchoolQOnPort3000(), killPort3000(), exec import from main.js');
bullet('server.js: server.on("error") catches EADDRINUSE — increments port and retries');
bullet('If all 10 ports busy: logs clear error and calls process.exit(1)');
bullet('Staff client URL config (http://server:3000) still works — staff always explicitly configure the port');
fileTable([
  { path: 'src/backend/server.js',  added: 20, removed: 5,  note: 'tryListen(), auto port scan, ACTUAL_PORT' },
  { path: 'electron/main.js',       added: 18, removed: 32, note: 'waitForActualServer(), removed kill logic' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.29 — TDZ CRASH FIX
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.29', date: '03 Jun 2026', type: 'fix',
  commit: '7d746f6',
  summary: 'Fix Temporal Dead Zone Crash — Cannot access createTicketTx before initialization',
  stats: { files: 5, added: 6, removed: 5 },
});
bullet('Error: "Cannot access createTicketTx before initialization" on every startup');
bullet('Root cause: exports.createTicketTx = createTicketTx placed BEFORE the const createTicketTx = db.transaction(...) declaration');
bullet('JavaScript const is not hoisted — accessing it before declaration throws ReferenceError (TDZ)');
bullet('Fix: moved exports.createTicketTx = createTicketTx to AFTER the db.transaction() assignment');
bullet('One-line fix in ticketController.js — no functional change, just export order correction');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.30 — KIOSK AUTO-PRINT & PERMISSION
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.30', date: '03 Jun 2026', type: 'ux',
  commit: '7b82dc4',
  summary: 'Kiosk Auto-Print Ticket + Kiosk Permission in Screen Access',
  stats: { files: 7, added: 186, removed: 208 },
});
bullet('Kiosk now auto-prints ticket immediately after parent selects service or department');
bullet('No manual "Print" button needed — print dialog opens automatically 600ms after ticket creation');
bullet('@media print CSS: kiosk screen hidden, TicketReceipt shown for printing');
bullet('@media screen: receipt div hidden on screen, only shown when printing');
bullet('afterprint event listener resets kiosk to Welcome screen (1.5s grace period)');
bullet('45-second fallback timeout resets screen if printer is offline and afterprint never fires');
bullet('"kiosk" permission key added to ALL_PAGES in Users.jsx Screen Access section');
bullet('Home page kiosk tile uses page: "kiosk" — tile hidden when user has restricted access and kiosk not granted');
fileTable([
  { path: 'src/frontend/src/pages/Kiosk.jsx',      added: 186, removed: 208, note: 'Auto-print, @media CSS, afterprint reset' },
  { path: 'src/frontend/src/pages/admin/Users.jsx', added: 1,   removed: 0,   note: 'kiosk key in ALL_PAGES' },
  { path: 'src/frontend/src/pages/Home.jsx',        added: 1,   removed: 1,   note: 'page: null → page: "kiosk"' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.31 — EXPORT/IMPORT USERS & SETTINGS + SCROLLBAR FIX
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.31', date: '03 Jun 2026', type: 'minor',
  commit: 'bd09e57',
  summary: 'Export/Import Users & Settings, Migrations Runner Restore, Scrollbar Fix',
  stats: { files: 12, added: 180, removed: 21 },
});
sectionTitle('Export/Import Users');
bullet('Admin Users page: "Export" button downloads JSON file of all users (with password_hash for migration)');
bullet('Admin Users page: "Import" button accepts JSON file — creates users that don\'t exist, skips existing usernames');
bullet('Import supports both password_hash (direct) and password (plain — auto-hashed via bcrypt)');
bullet('Results shown: "Imported X users, skipped Y"');
bullet('Endpoints: GET /admin/export/users, POST /admin/import/users — both require super_admin');

sectionTitle('Export/Import Settings');
bullet('Admin Settings page: "Export Settings" downloads current settings as JSON');
bullet('"Import Settings" accepts a JSON file and applies all key-value pairs via existing saveSettings logic');
bullet('After import, local state updates to reflect new values without page reload');

sectionTitle('Other Fixes');
bullet('User form modal: added p-4 padding, max-h-[90vh], overflow-y-auto — form scrolls instead of getting cut off on small screens');
bullet('migrations/runner.js properly restored to source control (was gitignored by incorrect database/ pattern)');
bullet('.gitignore: database/ → /database/ (only ignore root-level database/ folder, not src/backend/database/)');

fileTable([
  { path: 'src/backend/routes/admin.js',                added: 36, removed: 0,  note: 'Export/import users routes' },
  { path: 'src/frontend/src/lib/api.js',                added: 2,  removed: 0,  note: 'exportUsers(), importUsers()' },
  { path: 'src/frontend/src/pages/admin/Users.jsx',     added: 42, removed: 6,  note: 'Export/Import UI buttons + handlers' },
  { path: 'src/frontend/src/pages/admin/Settings.jsx',  added: 42, removed: 1,  note: 'Export/Import settings UI + handlers' },
  { path: '.gitignore',                                  added: 1,  removed: 1,  note: '/database/ fix' },
  { path: 'src/backend/database/migrations/runner.js',  added: 44, removed: 0,  note: 'Restored to source control', isNew: true },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.32 — DATATYPE MISMATCH FIX + ERROR DIAGNOSTICS
// ─────────────────────────────────────────────────────────────────────────────
newPage();
versionHeader({
  version: '1.5.32', date: '03 Jun 2026', type: 'fix',
  commit: 'f168c7f',
  summary: 'Fix Datatype Mismatch on Startup + Improved Error Dialog with Stack Trace',
  stats: { files: 5, added: 6, removed: 6 },
});
bullet('Migration runner was using db.prepare(sql).run() for ALTER TABLE statements');
bullet('Correct API for DDL statements in better-sqlite3 is db.exec() — prepare().run() is for DML only');
bullet('Fix: changed to db.exec(migration.sql) in the for loop');
bullet('Error dialog in Electron now shows full stack trace (err.stack) instead of just err.message');
bullet('Stack trace appears in the "Failed to Start" dialog body — helps diagnose startup failures');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.33 — MIGRATIONS TABLE SCHEMA FIX
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.33', date: '03 Jun 2026', type: 'fix',
  commit: '404e94e',
  summary: 'Fix Migrations Table INTEGER vs TEXT Schema Mismatch — Datatype Mismatch on Existing Databases',
  stats: { files: 5, added: 18, removed: 4 },
});
bullet('Root cause: old database had migrations table created with id INTEGER PRIMARY KEY by an earlier version');
bullet('CREATE TABLE IF NOT EXISTS preserves the wrong schema — no error, table unchanged');
bullet('Then: INSERT INTO migrations (id) VALUES ("001_add_speak_language") fails — cannot insert TEXT into INTEGER PRIMARY KEY');
bullet('SQLite error: "datatype mismatch" — caught by Electron uncaughtException handler → startup fails');
bullet('Fix: use PRAGMA table_info(migrations) to read the actual column type of "id"');
bullet('If type is not TEXT: DROP TABLE IF EXISTS migrations → CREATE TABLE with correct TEXT PRIMARY KEY');
bullet('All migrations re-run (catching "duplicate column name" for already-applied ones) → records inserted into new table');
bullet('Safe for both fresh installs and upgrades — no data loss (migrations table only tracks schema history)');
fileTable([
  { path: 'src/backend/database/migrations/runner.js', added: 14, removed: 0, note: 'PRAGMA type check, drop/recreate if wrong schema' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.34 — DYNAMIC PORT IN SERVER SETUP
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.34', date: '03 Jun 2026', type: 'fix',
  commit: '5702888',
  summary: 'Remove Hardcoded Port 3000 from Server Setup — Test Uses Real IP:Port',
  stats: { files: 7, added: 52, removed: 27 },
});
bullet('ServerSetup.jsx: added Port input field (default 3000) alongside the server IP field');
bullet('"Test Connection" now hits ip:port, shows the exact address tested in the result message');
bullet('Save & Relaunch: server mode saves http://localhost:<window.location.port> (picks up auto-shifted port)');
bullet('Save & Relaunch: client mode saves http://<ip>:<entered-port>');
bullet('preload.js: testServer(ip, port) passes port through IPC channel');
bullet('main.js test-server handler: accepts port parameter, uses parseInt(port) || 3000');
bullet('On existing config load: correctly parses port from saved URL via new URL(cfg.serverUrl).port');
fileTable([
  { path: 'src/frontend/src/pages/ServerSetup.jsx', added: 25, removed: 18, note: 'Port field, dynamic URL building' },
  { path: 'electron/preload.js',                     added: 1,  removed: 1,  note: 'testServer(ip, port)' },
  { path: 'electron/main.js',                        added: 1,  removed: 1,  note: 'Port parameter in HTTP request' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.35 — MUSIC PAUSE DURING ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.35', date: '03 Jun 2026', type: 'ux',
  commit: 'cffe6b0',
  summary: 'Auto-Pause Background Music During Ticket Announcements via Media Key',
  stats: { files: 7, added: 49, removed: 8 },
});
bullet('Problem: display PC plays background music in reception — TTS announcements mix with music');
bullet('Solution: send system-wide Media Play/Pause key before TTS, resume after');
bullet('Works with Spotify, YouTube, VLC, Windows Media Player — any player that responds to media keys');
bullet('On ticket call: music pauses → TTS announcement plays → music resumes automatically');
bullet('Rapid consecutive tickets handled correctly: musicPaused ref prevents double-pause');
sub('First ticket: pause music, play TTS, resume');
sub('Second ticket before first finishes: skip re-pause (already paused), play TTS, resume after last one');
bullet('media-key.ps1 written to userData on app startup — uses keybd_event(VK_MEDIA_PLAY_PAUSE = 0xB3)');
bullet('IPC: preload exposes mediaPlayPause(), main.js handles via execFile powershell');
bullet('No-op when display opened in a regular browser (window.electronAPI not available)');
fileTable([
  { path: 'electron/main.js',                              added: 18, removed: 1,  note: 'media-key.ps1 write on ready, IPC handler' },
  { path: 'electron/preload.js',                           added: 1,  removed: 1,  note: 'mediaPlayPause() exposed' },
  { path: 'src/frontend/src/pages/PublicDisplay.jsx',      added: 18, removed: 6,  note: 'musicPaused ref, pre/post announce IPC call' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.36 — VERSION NUMBER IN ADMIN SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.36', date: '13 Jul 2026', type: 'ux',
  commit: '0a9d170',
  summary: 'Version Number Displayed in Admin Settings Header',
  stats: { files: 2, added: 8, removed: 1 },
});
bullet('vite.config.js: reads version from package.json at build time, injects as __APP_VERSION__ global constant');
bullet('Admin Settings page header now shows the running version as a navy/teal pill badge (e.g. "v1.5.36")');
bullet('Badge appears next to "System Settings" heading — always visible to super_admin');
bullet('No runtime API call needed — version is baked into the bundle at build time');
fileTable([
  { path: 'src/frontend/vite.config.js',                  added: 4,  removed: 0,  note: '__APP_VERSION__ define' },
  { path: 'src/frontend/src/pages/admin/Settings.jsx',    added: 6,  removed: 1,  note: 'Version badge in header' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.45 — AUDIO FIXES, SINGLE INSTANCE, STANDALONE SCREENS
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.45', date: '04 Jul 2026', type: 'minor',
  commit: 'cccfe15',
  summary: 'Announcement Audio Fixes, Single-Instance Server, Standalone Access-Controlled Screens',
  stats: { files: 17, added: 192, removed: 53 },
});
bullet('Silent call/recall fixed — root cause: duplicate Server instances (ports 3000 + 3001) sharing one DB with isolated socket rooms');
sub('Server build now enforces a single instance; Staff/client builds may still open multiple windows');
bullet('Display plays announcements without a click (Electron autoplayPolicy)');
bullet('Music pause now works: Chromium hardware media-key capture disabled so Play/Pause reaches the external player');
bullet('On-screen audio/socket diagnostics removed from the public display');
bullet('Queue Control (/queue-control) and Announcements (/announcements) available outside the Admin panel');
sub('Shared ScreenShell layout, Home tiles, and entries in Users → Screen Access');
sub('New requirePageAccess middleware lets granted non-admins use the announcements API');
bullet('Settings language selector no longer jumps the page scroll');
fileTable([
  { path: 'electron/main.js',                              added: 42, removed: 3,  note: 'Single-instance lock, autoplay, media-key capture off' },
  { path: 'src/backend/middleware/auth.js',                added: 16, removed: 1,  note: 'requirePageAccess()' },
  { path: 'src/backend/routes/announcements.js',           added: 36, removed: 0,  note: 'Page-access gated management routes' },
  { path: 'src/frontend/src/pages/ScreenShell.jsx',        added: 37, removed: 0,  note: 'NEW — standalone screen wrapper' },
  { path: 'src/frontend/src/App.jsx',                      added: 13, removed: 0,  note: 'Standalone routes' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.46 — DATA ARCHIVAL, BACKUPS, OFFLINE LICENSING
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.46', date: '04 Jul 2026', type: 'minor',
  commit: '311fcb2',
  summary: 'Start-a-New-Day Archival, Automatic Backups, Offline License Activation',
  stats: { files: 23, added: 634, removed: 20 },
});
bullet('tickets.archived column (migration 005) — live queues and display hide archived rows, reports still read everything');
bullet('Settings → "Start a New Day" archives current tickets instead of deleting them');
bullet('Automatic daily online DB backup, last 14 kept (database/backup.js)');
sub('Settings → Backups: Backup Now, list, Open Folder, Restore (staged file swapped in on next start)');
bullet('Offline Ed25519 license verification — Server build shows an activation screen, key bound to machine id');
sub('tools/generate-license.js mints per-school keys; private key kept in .keys/ (gitignored, never shipped)');
fileTable([
  { path: 'src/backend/database/backup.js',                added: 54, removed: 0,  note: 'NEW — online backup + prune' },
  { path: 'electron/license.js',                           added: 87, removed: 0,  note: 'NEW — Ed25519 verification' },
  { path: 'electron/activation.html',                      added: 84, removed: 0,  note: 'NEW — activation screen' },
  { path: 'src/backend/routes/admin.js',                   added: 39, removed: 0,  note: 'archive-tickets, backup endpoints' },
  { path: 'src/frontend/src/pages/admin/Settings.jsx',     added: 128, removed: 0, note: 'New Day + Backups sections' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.47 — BRANCH MERGE
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.47', date: '12 Oct 2026', type: 'patch',
  commit: 'fcb4798',
  summary: 'Merged the Unpushed v1.5.36 Work into the v1.5.46 Line',
  stats: { files: 8, added: 367, removed: 11 },
});
bullet('v1.5.36 (version badge + changelog) was committed locally after GitHub had moved to v1.5.46');
bullet('Merge commit joins both histories — nothing from either side was lost; fast-forward push, no force push');

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.48 — TIMEZONE & TICKET NUMBERING FIXES
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.48', date: '12 Oct 2026', type: 'fix',
  commit: 'this release',
  summary: 'Correct Service Times & Clock Display, No Duplicate Ticket Numbers After Skip',
  stats: { files: 14, added: 161, removed: 28 },
});
bullet('Service time was inflated by the server\'s UTC offset (+180 min in Jordan) — SQLite UTC timestamps were parsed as local time');
sub('Migration 006 recomputes existing service_duration values from called_at / completed_at');
bullet('Reception error "UNIQUE constraint failed" after a skip — numbering now continues from the highest sequence issued today');
bullet('Printed ticket, staff dashboard wait time, reports, audit log, users list showed times 3 hours early — fixed');
bullet('Complete is refused unless the ticket is currently being served (no completing waiting or finished tickets)');
bullet('Call-next and transfer record the logged-in user, not a staff_id sent by the browser');
bullet('10 new unit tests (queue.test.js); verified with a full API/socket and browser end-to-end run');
fileTable([
  { path: 'src/backend/controllers/queueController.js',    added: 6,  removed: 3,  note: 'UTC parse, status guard, req.user' },
  { path: 'src/backend/controllers/ticketController.js',   added: 10, removed: 11, note: 'Max-sequence numbering' },
  { path: 'src/backend/database/migrations/runner.js',     added: 9,  removed: 0,  note: 'Migration 006' },
  { path: 'src/backend/tests/queue.test.js',               added: 122, removed: 0, note: 'NEW — 10 tests' },
  { path: 'src/frontend/src/ (6 files)',                   added: 10, removed: 10, note: 'UTC-correct time display' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.49 — NEW LICENSE SIGNING KEY
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.49', date: '12 Oct 2026', type: 'security',
  commit: 'this release',
  summary: 'License Signing Keypair Replaced',
  stats: { files: 7, added: 1, removed: 1 },
});
bullet('The original private signing key was not available on the build machine, so a new Ed25519 keypair was generated');
bullet('electron/license.js now embeds the new public key — license keys minted with the old key no longer activate on 1.5.49+');
sub('Already-activated installs on an older version are unaffected until they upgrade; then they need a key from the new private key');
bullet('New private key stored in .keys/license-private.pem (gitignored, never shipped) — back it up offline');
fileTable([
  { path: 'electron/license.js',                           added: 1,  removed: 1,  note: 'New PUBLIC_KEY' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  v1.5.50 — STAFF SETUP TEST CONNECTION FIX
// ─────────────────────────────────────────────────────────────────────────────
versionHeader({
  version: '1.5.50', date: '13 Oct 2026', type: 'fix',
  commit: 'this release',
  summary: 'First-Time Setup "Test Connection" No Longer Fails Against a Running Server',
  stats: { files: 1, added: 6, removed: 8 },
});
bullet('Test Connection always reported "Could not reach the server", even though Save & Launch connected fine');
bullet('Cause: the setup page is a file:// page (origin "null"); its fetch() was blocked by the server\'s CORS rules');
bullet('Fix: test via the existing main-process testServer() IPC (Node http — no CORS), same check ServerSetup.jsx uses');
fileTable([
  { path: 'electron/setup.html',                           added: 6,  removed: 8,  note: 'testConnection() uses electronAPI.testServer' },
]);

// ─────────────────────────────────────────────────────────────────────────────
//  SUMMARY PAGE
// ─────────────────────────────────────────────────────────────────────────────
newPage();

doc.fontSize(20).fillColor(C.navy).font('Helvetica-Bold').text('Project Statistics', 50, 44);
doc.fontSize(9).fillColor(C.lgray).font('Helvetica').text('Cumulative metrics across all versions', 50, 68);
hr(C.navy, 1);
doc.moveDown(0.5);

sectionTitle('Version Timeline');
const timeline = [
  { v:'v1.2.0',  date:'06 May 2026', type:'initial',  desc:'Initial release — 73 files, 16,712 lines of code' },
  { v:'v1.3.0',  date:'06 May 2026', type:'patch',    desc:'Bilingual TTS fix — AbortController, 700ms pause, MP3 validation' },
  { v:'v1.3.1',  date:'07 May 2026', type:'security', desc:'CORS restriction, rate limiting, settings cache, compression' },
  { v:'v1.3.2',  date:'07 May 2026', type:'fix',      desc:'JWT 8h→24h, 401 auto-logout interceptor' },
  { v:'v1.3.3',  date:'07 May 2026', type:'fix',      desc:'No-show setting hardcoded→DB-driven' },
  { v:'v1.3.4',  date:'07 May 2026', type:'fix',      desc:'Electron startup silent crash → error dialog' },
  { v:'v1.3.5',  date:'07 May 2026', type:'fix',      desc:'Native module ABI mismatch — buildDependenciesFromSource' },
  { v:'v1.3.6',  date:'07 May 2026', type:'fix',      desc:'Final call template — respects no_show_after_calls' },
  { v:'v1.4.0',  date:'07 May 2026', type:'minor',    desc:'Screen permissions, logo upload, audit log, menu bar removed' },
  { v:'v1.5.15', date:'15 May 2026', type:'minor',    desc:'Service types × 3 features, room number, sequential TTS fix' },
  { v:'v1.5.16', date:'20 May 2026', type:'security', desc:'Force logout, socket JWT auth, is_active check, JWT→8h' },
  { v:'v1.5.17', date:'20 May 2026', type:'security', desc:'Input validation, per-install secret, rate limit, error handler, indexes' },
  { v:'v1.5.18', date:'20 May 2026', type:'ux',       desc:'Toast notifications, skeleton loader, migration runner, 16 tests' },
  { v:'v1.5.25', date:'02 Jun 2026', type:'minor',    desc:'Cancel/Left action, no-show reason, granular report permissions, ticket log wait fix' },
  { v:'v1.5.26', date:'03 Jun 2026', type:'ux',       desc:'Reset All Ticket Data — Danger Zone in admin settings' },
  { v:'v1.5.27', date:'03 Jun 2026', type:'minor',    desc:'Self-service kiosk — touch panel for parents to get tickets without staff' },
  { v:'v1.5.28', date:'03 Jun 2026', type:'fix',      desc:'Auto port scan 3000–3010, no longer kills foreign processes' },
  { v:'v1.5.29', date:'03 Jun 2026', type:'fix',      desc:'Temporal dead zone crash fix in ticketController exports' },
  { v:'v1.5.30', date:'03 Jun 2026', type:'ux',       desc:'Kiosk auto-prints ticket + kiosk permission in screen access' },
  { v:'v1.5.31', date:'03 Jun 2026', type:'minor',    desc:'Export/import users & settings, scrollbar fix, migrations restored' },
  { v:'v1.5.32', date:'03 Jun 2026', type:'fix',      desc:'db.exec() for DDL in migration runner, stack trace in error dialog' },
  { v:'v1.5.33', date:'03 Jun 2026', type:'fix',      desc:'Migrations table schema mismatch — PRAGMA detect and recreate' },
  { v:'v1.5.34', date:'03 Jun 2026', type:'fix',      desc:'Dynamic port in ServerSetup — test uses real IP:port, not hardcoded 3000' },
  { v:'v1.5.35', date:'03 Jun 2026', type:'ux',       desc:'Media key pause/resume — music stops during TTS announcements' },
  { v:'v1.5.36', date:'13 Jul 2026', type:'ux',       desc:'Version badge in admin settings header, Vite __APP_VERSION__ injection' },
  { v:'v1.5.45', date:'04 Jul 2026', type:'minor',    desc:'Single-instance server, announcement audio fixes, standalone screens' },
  { v:'v1.5.46', date:'04 Jul 2026', type:'minor',    desc:'New-day archival, automatic backups, offline license activation' },
  { v:'v1.5.47', date:'12 Oct 2026', type:'patch',    desc:'Merge of unpushed v1.5.36 work into the v1.5.46 line' },
  { v:'v1.5.48', date:'12 Oct 2026', type:'fix',      desc:'Timezone-correct service times & clocks, no duplicate numbers after skip' },
  { v:'v1.5.49', date:'12 Oct 2026', type:'security', desc:'New license signing keypair (old private key unavailable)' },
  { v:'v1.5.50', date:'13 Oct 2026', type:'fix',      desc:'Staff first-time setup: Test Connection works (CORS-free IPC check)' },
];
const tc = { initial:C.navy, patch:C.green, security:C.red, fix:C.amber, minor:C.blue, ux:C.purple };
timeline.forEach((r, i) => {
  const y = doc.y;
  doc.rect(50, y + 2, 6, 12).fill(tc[r.type] || C.gray);
  if (i < timeline.length - 1) {
    doc.rect(52, y + 14, 2, 8).fill(C.border);
  }
  doc.fontSize(8).fillColor(C.navy).font('Helvetica-Bold').text(r.v, 64, y + 3, { lineBreak: false, width: 45 });
  doc.fillColor(C.lgray).font('Helvetica').text(r.date, 112, y + 3, { lineBreak: false, width: 80 });
  doc.fillColor(C.gray).text(r.desc, 195, y + 3, { lineBreak: false, width: W() - 145 });
  doc.moveDown(1.35);
});

sectionTitle('Cumulative Change Statistics');
const stats = [
  ['Total versions released',      '32 (v1.2.0 → v1.5.50)'],
  ['Total git commits',            '25+ commits on main branch'],
  ['Total files ever modified',    '~80 unique files touched'],
  ['Lines added across all commits','~22,000+'],
  ['Lines removed across all commits','~2,200+'],
  ['Backend files modified',       '~20 (routes, controllers, middleware, DB)'],
  ['Frontend files modified',      '~30 (pages, components, stores, hooks)'],
  ['New files created',            '13 (audit.js, settingsCache.js, validate.js, errorHandler.js,\n                         runner.js, Toast.jsx, useToastStore.js, 2 new pages, 3 test files, scripts/)'],
  ['Files deleted',                '2 (AdminPanel.jsx, DisplayMonitor.jsx — legacy)'],
  ['Test coverage',                '26 tests — auth, ticket validation, middleware rules, queue logic'],
  ['Supported platforms',          'Windows 10/11 x64 (Electron 41)'],
  ['Node.js runtime (backend)',    'Electron bundled Node (v24-based, ABI 145)'],
];
stats.forEach(([k, v]) => kv(k + ':', v));

sectionTitle('Maturity Assessment by Area');
const mat = [
  { area:'Authentication & Sessions',  grade:'B+', color:C.green,  note:'JWT, bcrypt, force-logout, is_active check, socket auth, 8h expiry' },
  { area:'Input Validation',           grade:'B',  color:C.teal,   note:'express-validator on all write endpoints, 422 with clear messages' },
  { area:'Authorization',              grade:'B',  color:C.teal,   note:'Role + allowed_pages system, ProtectedRoute, requireRole middleware' },
  { area:'Rate Limiting',              grade:'B',  color:C.teal,   note:'Login limiter (20/15min) + mutation limiter (60/min) on all writes' },
  { area:'Error Handling',             grade:'B-', color:C.amber,  note:'Centralized handler, no stack trace exposure, toast UI; no retry logic' },
  { area:'Database Design',            grade:'B',  color:C.teal,   note:'WAL, foreign keys, 10 indexes, migration runner, transactions' },
  { area:'Real-time Features',         grade:'A-', color:C.green,  note:'Socket.io with auth, force-logout events, dept rooms, user tracking' },
  { area:'Logging & Audit',            grade:'C+', color:C.amber,  note:'Audit log table + morgan; no structured logging, no rotation' },
  { area:'Testing',                    grade:'C+', color:C.amber,  note:'26 unit tests; E2E run manually, not automated; no CI pipeline' },
  { area:'Code Organization',          grade:'B+', color:C.green,  note:'Clean route/controller split, Zustand, API layer, no fat controllers' },
  { area:'User Experience',            grade:'B',  color:C.teal,   note:'Toast system, skeleton loaders, real-time updates, bilingual voice' },
  { area:'Build & Deployment',         grade:'B-', color:C.amber,  note:'2 installer targets, per-install secret; no auto-update, no code signing' },
];
mat.forEach(r => {
  const y = doc.y;
  doc.rect(50, y, 30, 14).fill(r.color);
  doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
     .text(r.grade, 52, y + 3, { lineBreak: false, width: 28, align: 'center' });
  doc.fontSize(8).fillColor(C.navy).font('Helvetica-Bold')
     .text(r.area, 86, y + 3, { lineBreak: false, width: 140 });
  doc.fillColor(C.gray).font('Helvetica')
     .text(r.note, 232, y + 3, { lineBreak: false, width: W() - 182 });
  doc.moveDown(1.25);
});

doc.moveDown(0.5);
doc.rect(50, doc.y, W(), 40).fill('#EFF6FF').strokeColor('#BFDBFE').lineWidth(0.5).stroke();
doc.fontSize(11).fillColor(C.navy).font('Helvetica-Bold')
   .text('Overall: Mid-Level — Production-Ready for Controlled School Environment', 58, doc.y - 34);
doc.fontSize(8.5).fillColor(C.gray).font('Helvetica')
   .text('SchoolQ is a well-architected, fully functional system. Security, real-time features, and UX are solid. Remaining gaps (structured logging, E2E tests, CI/CD) are optional for a single-school deployment but recommended before wider rollout.', 58, doc.y, { width: W() - 16 });

// ── Footer on all pages ───────────────────────────────────────────────────────
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  if (i === 0) continue; // cover page has its own footer
  const footerY = doc.page.height - 28;
  doc.rect(50, footerY - 4, W(), 0.5).fill(C.border);
  doc.fontSize(7).fillColor(C.lgray).font('Helvetica')
     .text('SchoolQ Changelog  ·  Vyra Systems  ·  Confidential',
       50, footerY, { lineBreak: false });
  doc.text(`Page ${i + 1} of ${range.count}`,
    50, footerY, { align: 'right', width: W(), lineBreak: false });
}

doc.end();
console.log(`✓ PDF written to: ${OUT}`);
