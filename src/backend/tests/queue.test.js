// Pin a non-UTC zone so timezone bugs reproduce on any machine (Jordan = UTC+3).
process.env.TZ = 'Asia/Amman';
process.env.JWT_SECRET = 'test-secret-key-for-jest';

// Programmable DB mock: each test registers [sqlRegex, (kind, args) => result] handlers.
const mockDb = {
  handlers: [],
  runs: [],
  answer(kind, sql, args) {
    for (const [re, fn] of this.handlers) if (re.test(sql)) return fn(kind, args);
    return kind === 'all' ? [] : undefined;
  },
};

jest.mock('../database/db', () => ({
  prepare: (sql) => ({
    get: (...args) => mockDb.answer('get', sql, args),
    all: (...args) => mockDb.answer('all', sql, args),
    run: (...args) => { mockDb.runs.push({ sql, args }); return { changes: 1, lastInsertRowid: 1 }; },
  }),
  transaction: (fn) => (...args) => fn(...args),
}));

jest.mock('../audit', () => ({ log: jest.fn() }));

const queueController = require('../controllers/queueController');
const { generateTicketNumber } = require('../controllers/ticketController');

// SQLite datetime('now') format: UTC, no zone marker.
const sqliteUtc = (msAgo) => new Date(Date.now() - msAgo).toISOString().slice(0, 19).replace('T', ' ');

function mockRes() {
  return {
    code: 200,
    body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

// Chainable like socket.io: io.to(a).to(b).emit(...)
const room = { to: () => room, emit: () => {} };
const io = { to: () => room };
const findRun = (re) => mockDb.runs.find(r => re.test(r.sql));

beforeEach(() => {
  mockDb.handlers = [];
  mockDb.runs = [];
});

test('test runs in a UTC+3 zone', () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-180);
});

describe('complete', () => {
  const ticket = (overrides) => ({
    ticket_id: 7, ticket_number: 'ADM-20261012-001', department_id: 1,
    status: 'called', called_at: sqliteUtc(5 * 60000), ...overrides,
  });

  test('service_duration is real minutes, not shifted by the UTC offset', () => {
    mockDb.handlers.push([/FROM tickets WHERE ticket_id/, () => ticket()]);
    const res = mockRes();
    queueController.complete({ params: { ticket_id: 7 }, body: { notes: '' }, io, user: { user_id: 5 } }, res);

    expect(res.code).toBe(200);
    const update = findRun(/status = 'completed'/);
    expect(update.args[0]).toBe(5); // called 5 min ago → 5, not 185
  });

  test.each(['waiting', 'completed', 'cancelled', 'no_show'])('rejects completing a %s ticket', (status) => {
    mockDb.handlers.push([/FROM tickets WHERE ticket_id/, () => ticket({ status, called_at: null })]);
    const res = mockRes();
    queueController.complete({ params: { ticket_id: 7 }, body: {}, io, user: { user_id: 5 } }, res);

    expect(res.code).toBe(409);
    expect(findRun(/status = 'completed'/)).toBeUndefined();
  });
});

describe('staff identity comes from the token, not the request body', () => {
  test('callNext records req.user as the server', () => {
    mockDb.handlers.push(
      [/status = 'waiting'/, () => ({ ticket_id: 7, ticket_number: 'ADM-20261012-001' })],
      [/FROM departments/, () => ({ department_id: 1, name: 'Administration', display_order: 1 })],
      [/FROM tickets WHERE ticket_id/, () => ({ ticket_id: 7 })],
    );
    const res = mockRes();
    queueController.callNext({ params: { dept_id: 1 }, body: { staff_id: 999 }, io, user: { user_id: 5 } }, res);

    expect(res.code).toBe(200);
    expect(findRun(/status = 'called'/).args[0]).toBe(5);
  });

  test('transfer records req.user as transferred_by', () => {
    mockDb.handlers.push(
      [/FROM tickets WHERE ticket_id/, () => ({ ticket_id: 7, ticket_number: 'ADM-20261012-001', department_id: 1 })],
      [/FROM departments/, () => ({ department_id: 2, name: 'Accounting' })],
    );
    const res = mockRes();
    queueController.transfer({ params: { ticket_id: 7 }, body: { to_dept_id: 2, reason: 'x', staff_id: 999 }, io, user: { user_id: 5 } }, res);

    expect(res.code).toBe(200);
    expect(findRun(/INSERT INTO transfers/).args[4]).toBe(5);
  });
});

describe('generateTicketNumber', () => {
  const day = new Date('2026-10-12T09:00:00Z');

  test('first ticket of the day is 001, with priority suffix', () => {
    expect(generateTicketNumber('ADM', day, 'regular')).toBe('ADM-20261012-001');
    expect(generateTicketNumber('ADM', day, 'urgent')).toBe('ADM-20261012-001U');
  });

  test('continues from the highest sequence even after a skip moved an older ticket to the newest created_at', () => {
    // 001 was skipped, so it now has the newest created_at.
    mockDb.handlers.push([/ticket_number LIKE/, (kind) => kind === 'get'
      ? { ticket_number: 'ADM-20261012-001' }
      : [{ ticket_number: 'ADM-20261012-001' }, { ticket_number: 'ADM-20261012-002U' }, { ticket_number: 'ADM-20261012-003' }]]);

    expect(generateTicketNumber('ADM', day, 'regular')).toBe('ADM-20261012-004');
  });
});
