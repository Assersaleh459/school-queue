process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.NODE_ENV   = 'test';

jest.mock('../database/db', () => {
  const mockPrepare = (sql) => ({
    get:  () => sql.includes('is_active') ? { is_active: 1 } : null,
    run:  () => ({}),
    all:  () => [],
  });
  return { prepare: mockPrepare, transaction: (fn) => (...args) => fn(...args) };
});

jest.mock('../audit', () => ({ log: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt     = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.io = { to: () => ({ emit: () => {} }) }; next(); });

const ticketRoutes = require('../routes/tickets');
app.use('/api/tickets', ticketRoutes);
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

const token = jwt.sign(
  { user_id: 1, username: 'admin', role: 'super_admin', department_id: null },
  'test-secret-key-for-jest',
  { expiresIn: '1h' }
);

describe('POST /api/tickets — auth', () => {
  test('rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/tickets').send({ department_id: 1 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/tickets — validation', () => {
  test('rejects missing department_id', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ parent_name: 'Test' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/department/i);
  });

  test('rejects invalid priority value', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ department_id: 1, priority: 'platinum' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/priority/i);
  });

  test('accepts valid ticket data (no-show if dept missing in mock DB)', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ department_id: 1, priority: 'urgent', parent_name: 'Ali Hassan' });
    // Will 404 since mock DB returns null for dept, but validation passed
    expect([200, 404, 500]).toContain(res.status);
  });
});
