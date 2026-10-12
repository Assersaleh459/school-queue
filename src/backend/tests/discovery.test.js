// Real UDP on test ports: the server responder and the Staff-side client together.
const dgram = require('dgram');
const { startDiscoveryResponder } = require('../discovery');
const { discoverServers } = require('../../../electron/discovery');

const sockets = [];
afterEach(() => { sockets.splice(0).forEach(s => { try { s.close(); } catch {} }); });

const listening = (sock) => new Promise(r => sock.once('listening', r));

test('finds a server and reports the HTTP port it actually got', async () => {
  const responder = startDiscoveryResponder(() => ({ port: 3001, school: 'Test School', version: '9.9.9' }), 41291);
  sockets.push(responder);
  await listening(responder);

  const found = await discoverServers({ discoveryPort: 41291, timeoutMs: 800 });

  // A server on this PC answers from several local adapters — reported once, as 127.0.0.1.
  expect(found).toEqual([{ ip: '127.0.0.1', port: 3001, school: 'Test School', version: '9.9.9', thisPC: true }]);
});

test('returns an empty list when no server answers', async () => {
  expect(await discoverServers({ discoveryPort: 41292, timeoutMs: 500 })).toEqual([]);
});

test('responder ignores packets that are not discovery probes', async () => {
  const responder = startDiscoveryResponder(() => ({ port: 3000 }), 41293);
  sockets.push(responder);
  await listening(responder);

  const client = dgram.createSocket('udp4');
  sockets.push(client);
  const replies = [];
  client.on('message', m => replies.push(m.toString()));
  await new Promise(r => client.bind(0, r));
  client.send('hello', 41293, '127.0.0.1');
  await new Promise(r => setTimeout(r, 400));

  expect(replies).toEqual([]);
});

test('a taken discovery port does not crash the server', async () => {
  const squatter = dgram.createSocket('udp4');
  sockets.push(squatter);
  await new Promise(r => squatter.bind(41294, r));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  startDiscoveryResponder(() => ({ port: 3000 }), 41294);
  await new Promise(r => setTimeout(r, 300));

  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/LAN discovery unavailable \(UDP 41294\)/));
  warn.mockRestore();
});
