const dgram = require('dgram');
const http  = require('http');
const os    = require('os');

// Must match src/backend/discovery.js (Staff builds don't ship src/backend).
const DISCOVERY_PORT = 41234;
const DISCOVER_MSG   = 'SCHOOLQ_DISCOVER_V1';

function ipv4Addrs() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(a => a.family === 'IPv4' && !a.internal);
}

// Probe every adapter's directed broadcast (e.g. 192.168.2.255) — on Windows
// 255.255.255.255 often leaves through only one adapter. 127.0.0.1 covers a
// server on this same PC when it has no network.
function probeAddresses() {
  const out = new Set(['255.255.255.255', '127.0.0.1']);
  for (const a of ipv4Addrs()) {
    const ip   = a.address.split('.').map(Number);
    const mask = a.netmask.split('.').map(Number);
    out.add(ip.map((b, i) => b | (~mask[i] & 255)).join('.'));
  }
  return [...out];
}

// Broadcast a probe and collect the SchoolQ servers that answer.
// Resolves to [{ ip, port, school, version }] — never rejects.
function discoverServers({ timeoutMs = 1500, discoveryPort = DISCOVERY_PORT } = {}) {
  return new Promise(resolve => {
    const found = new Map();
    const sock  = dgram.createSocket('udp4');
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      try { sock.close(); } catch {}
      // A server on this PC answers from every local adapter (LAN, WSL, loopback…).
      // Collapse those into one 127.0.0.1 entry — it never changes, unlike virtual adapter IPs.
      const local = new Set(['127.0.0.1', ...ipv4Addrs().map(a => a.address)]);
      const byKey = new Map();
      for (const s of found.values()) {
        const entry = local.has(s.ip) ? { ...s, ip: '127.0.0.1', thisPC: true } : s;
        byKey.set(`${entry.ip}:${entry.port}`, entry);
      }
      resolve([...byKey.values()]);
    };

    sock.on('message', (msg, rinfo) => {
      try {
        const r = JSON.parse(msg.toString());
        if (r.app !== 'SchoolQ' || !r.port) return;
        found.set(`${rinfo.address}:${r.port}`, {
          ip: rinfo.address, port: r.port, school: r.school || '', version: r.version || '',
        });
      } catch {}
    });
    sock.on('error', finish);
    sock.bind(0, () => {
      sock.setBroadcast(true);
      for (const addr of probeAddresses()) sock.send(DISCOVER_MSG, discoveryPort, addr, () => {});
      setTimeout(finish, timeoutMs);
    });
  });
}

// Checks that a SchoolQ server (not just any program) answers at ip:port —
// public settings always include a school_name key.
function testServer(ip, port = 3000) {
  return new Promise(resolve => {
    const req = http.get(
      { host: ip, port: parseInt(port) || 3000, path: '/api/settings/public', timeout: 5000 },
      res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve({ ok: 'school_name' in JSON.parse(data) }); } catch { resolve({ ok: false }); }
        });
      }
    );
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
  });
}

// Staff startup: use the saved server if it answers as SchoolQ. If not — still
// booting, or it moved to another port because 3000 was taken — look for it on
// the LAN, retrying until timeout. Returns the URL to load, or null.
async function findServer(serverUrl, timeoutMs = 20000) {
  let url;
  try { url = new URL(serverUrl); } catch { url = new URL('http://localhost:3000'); }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await testServer(url.hostname, url.port || 3000)).ok) return url.origin;
    const found = await discoverServers();
    if (found.length === 1 && (await testServer(found[0].ip, found[0].port)).ok) {
      return `http://${found[0].ip}:${found[0].port}`;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

module.exports = { discoverServers, testServer, findServer };
