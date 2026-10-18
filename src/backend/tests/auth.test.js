process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.NODE_ENV   = 'test';

// Mock the DB so tests don't need Electron's native better-sqlite3
jest.mock('../database/db', () => {
  const bcrypt = require('bcrypt');
  const hash = bcrypt.hashSync('admin123', 10);

  const mockUser = {
    user_id: 1, username: 'admin', password_hash: hash,
    full_name: 'System Admin', role: 'super_admin',
    department_id: null, is_active: 1,
  };

  const mockPrepare = (sql) => ({
    get:  (...args) => {
      if (sql.includes('SELECT * FROM users WHERE username')) return mockUser;
      if (sql.includes('SELECT is_active FROM users WHERE user_id')) return { is_active: 1 };
      if (sql.includes('FROM users WHERE user_id')) return mockUser;
      return null;
    },
    run:  () => ({ lastInsertRowid: 1, changes: 1 }),
    all:  () => [],
  });

  return { prepare: mockPrepare };
});

jest.mock('../audit', () => ({ log: jest.fn() }));

const request = require('supertest');
const express = require('express');
const app     = express();
app.use(express.json());

const authRoutes = require('../routes/auth');
app.use('/api/auth', authRoutes);
const { authMiddleware } = require('../middleware/auth');
app.get('/api/other', authMiddleware, (req, res) => res.json({ ok: true }));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

describe('POST /api/auth/login — validation', () => {
  test('rejects missing username', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'admin123' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/username/i);
  });

  test('rejects missing password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/password/i);
  });
});

describe('POST /api/auth/login — logic', () => {
  test('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('returns token on valid login', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('super_admin');
  });
});

describe('PUT /api/auth/change-password — validation', () => {
  let token;
  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = res.body.token;
  });

  test('rejects password shorter than 8 characters', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'admin123', new_password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  test('rejects the default password as the new one', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'admin123', new_password: 'admin123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/default/i);
  });
});

describe('default password must be changed', () => {
  let token;
  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = res.body.token;
  });

  test('login with the default password is marked', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.body.user.must_change_password).toBe(true);
  });

  test('other requests are refused until it is changed', async () => {
    const res = await request(app).get('/api/other').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('must_change_password');
  });

  test('"who am I" still works and reports the mark', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.must_change_password).toBe(true);
  });

  test('changing it returns a token that works everywhere', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'admin123', new_password: 'a-new-password' });
    expect(res.status).toBe(200);

    const other = await request(app).get('/api/other').set('Authorization', `Bearer ${res.body.token}`);
    expect(other.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.must_change_password).toBe(false);
  });
});
