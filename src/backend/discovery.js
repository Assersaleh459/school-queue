const dgram = require('dgram');

// LAN discovery. Staff PCs broadcast DISCOVER_MSG to DISCOVERY_PORT and the server
// replies with its real HTTP port — which is not 3000 if another program had it.
// Keep in sync with electron/discovery.js (Staff builds don't ship src/backend).
const DISCOVERY_PORT = 41234;
const DISCOVER_MSG   = 'SCHOOLQ_DISCOVER_V1';

// getInfo() is called per probe so the reply reflects current settings.
function startDiscoveryResponder(getInfo, discoveryPort = DISCOVERY_PORT) {
  const sock = dgram.createSocket('udp4');
  sock.on('message', (msg, rinfo) => {
    if (msg.toString() !== DISCOVER_MSG) return;
    sock.send(JSON.stringify({ app: 'SchoolQ', ...getInfo() }), rinfo.port, rinfo.address);
  });
  // Discovery is a convenience: if the UDP port is taken, the server still runs
  // and Staff PCs can connect by typing the address.
  sock.on('error', (err) => {
    console.warn(`LAN discovery unavailable (UDP ${discoveryPort}): ${err.message}`);
    sock.close();
  });
  sock.bind(discoveryPort);
  return sock;
}

module.exports = { startDiscoveryResponder, DISCOVERY_PORT, DISCOVER_MSG };
