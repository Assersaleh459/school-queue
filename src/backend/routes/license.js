const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const lic = require('../license');
const devices = require('../devices');
const socketHandlers = require('../socket/handlers');
const { log } = require('../audit');

const router = express.Router();
const admin = [authMiddleware, requireRole('super_admin', 'admin')];

// Expiry info for every logged-in user (the red "license expired" bar shows on all screens)
router.get('/status', authMiddleware, (req, res) => {
  const cur = lic.current();
  if (!cur) return res.json({ licensed: false });
  const s = cur.state || {};
  res.json({ licensed: true, status: s.status, daysLeft: s.daysLeft, expires: s.expires, grace: s.grace, graceUntil: s.graceUntil, school: s.school });
});

// Admin → License and the Overview card
router.get('/', admin, (req, res) => {
  const cur = lic.current();
  res.json({
    licensed: !!cur,
    blocked: !!cur?.blocked,
    reason: cur?.reason || null,
    clockSetBack: cur?.clockSetBack || null,
    ...(cur?.state || {}),
    devicesUsed: devices.activeCount(),
    activeMinutes: devices.ACTIVE_MINUTES,
    machineId: lic.machineId(),
  });
});

router.get('/devices', admin, (req, res) => res.json(devices.list()));

// Free a device's slot — it is signed out and must log in again (if a slot is free)
router.post('/devices/:id/revoke', admin, (req, res) => {
  if (!devices.revoke(req.params.id)) return res.status(404).json({ error: 'Device not found' });
  socketHandlers.kickDevice(req.params.id);
  log(req.user.user_id, 'DEVICE_REVOKED', 'device', null, { device_id: req.params.id });
  res.json({ success: true });
});

// For the "license expired" screen, before anyone can log in
router.get('/expired', (req, res) => {
  const cur = lic.current();
  if (!cur?.blocked) return res.json({ blocked: false });
  res.json({ blocked: true, duplicate: !!cur.duplicate, reason: cur.reason, school: cur.state?.school || null, expires: cur.duplicate ? null : cur.state?.expires || null, machineId: lic.machineId() });
});

// Renew / upgrade with a new key: super admin — or anyone while the license has run out,
// since nobody can log in then. Only a valid key signed for this PC is accepted.
router.post('/renew', (req, res, next) => (lic.current()?.blocked ? next() : authMiddleware(req, res, () => requireRole('super_admin')(req, res, next))),
  (req, res) => {
    const key = typeof req.body.key === 'string' ? req.body.key.trim() : '';
    if (!key) return res.status(422).json({ error: 'Paste the license key' });
    const r = lic.renew(key);
    if (!r.valid) return res.status(422).json({ error: r.reason });
    log(req.user?.user_id || null, 'LICENSE_RENEWED', 'license', null, {
      id: r.payload.id || null, school: r.payload.school, expires: r.payload.expires || null, devices: r.payload.devices || null,
    });
    req.io.emit('license_updated');
    res.json({ success: true, state: r.state });
  });

// Everything else stops once the license is past its grace period (or invalid)
function licenseGate(req, res, next) {
  const cur = lic.current();
  if (cur?.blocked) return res.status(402).json({ error: cur.reason, code: 'license_expired' });
  next();
}

module.exports = router;
module.exports.licenseGate = licenseGate;
