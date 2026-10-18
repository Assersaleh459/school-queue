// Clone guard: two servers on one network with the same license — the newer one stops.
// discover() is faked; nothing is sent on the network.
const guard = require('../licenseGuard');

const ID = 'abcdef0123456789';
const licenseId = () => ID;
const other = (extra) => ({ ip: '192.168.1.50', port: 3000, lic: ID, inst: 'ffffffffffffffff', ...extra });

test('another server with the same license that has run longer: this one stops', async () => {
  expect(await guard.check(licenseId, async () => [other({ up: 1e12 })])).toEqual({ ip: '192.168.1.50', port: 3000 });
  expect(guard.duplicate()).toEqual({ ip: '192.168.1.50', port: 3000 });
});

test('the server that was running first keeps working', async () => {
  expect(await guard.check(licenseId, async () => [other({ up: 0 })])).toBeNull();
  expect(guard.duplicate()).toBeNull();
});

test('its own reply, other licenses and old servers without the fields are ignored', async () => {
  const found = [
    other({ inst: guard.INSTANCE, up: 1e12 }),        // this server answering itself
    other({ lic: '0000000000000000', up: 1e12 }),     // another school's server
    { ip: '192.168.1.60', port: 3000, school: 'Old', version: '1.13.2' },   // an older SchoolQ
  ];
  expect(await guard.check(licenseId, async () => found)).toBeNull();
});

test('unlicensed (development) servers are never blocked', async () => {
  expect(await guard.check(() => null, async () => [other({ up: 1e12 })])).toBeNull();
});

test('the block ends when the other server goes away', async () => {
  await guard.check(licenseId, async () => [other({ up: 1e12 })]);
  expect(guard.duplicate()).not.toBeNull();
  await guard.check(licenseId, async () => []);
  expect(guard.duplicate()).toBeNull();
});

test('the reply carries the license id, this run and the uptime', () => {
  expect(guard.announce(licenseId)).toMatchObject({ lic: ID, inst: guard.INSTANCE, up: expect.any(Number) });
  expect(guard.licenseIdOf('KEY')).toMatch(/^[0-9a-f]{16}$/);
  expect(guard.licenseIdOf(' KEY ')).toBe(guard.licenseIdOf('KEY'));
  expect(guard.licenseIdOf('')).toBeNull();
});
