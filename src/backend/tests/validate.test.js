process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.DB_PATH    = ':memory:';
process.env.NODE_ENV   = 'test';

const { rules, checkValidation } = require('../middleware/validate');
const express  = require('express');
const request  = require('supertest');

function makeApp(ruleSet) {
  const app = express();
  app.use(express.json());
  app.post('/test', ruleSet, checkValidation, (req, res) => res.json({ ok: true }));
  return app;
}

describe('Validation rules — createUser', () => {
  const app = makeApp(rules.createUser);

  test('rejects username shorter than 3 chars', async () => {
    const res = await request(app).post('/test').send({ username: 'ab', password: 'password123', full_name: 'Test', role: 'staff' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/3/);
  });

  test('rejects invalid role', async () => {
    const res = await request(app).post('/test').send({ username: 'validuser', password: 'password123', full_name: 'Test', role: 'superuser' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/role/i);
  });

  test('rejects password shorter than 8 chars', async () => {
    const res = await request(app).post('/test').send({ username: 'validuser', password: 'short', full_name: 'Test', role: 'staff' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/8/);
  });

  test('accepts valid user data', async () => {
    const res = await request(app).post('/test').send({ username: 'validuser', password: 'password123', full_name: 'Test User', role: 'staff' });
    expect(res.status).toBe(200);
  });
});

describe('Validation rules — createTicket', () => {
  const app = makeApp(rules.createTicket);

  test('rejects non-integer department_id', async () => {
    const res = await request(app).post('/test').send({ department_id: 'abc' });
    expect(res.status).toBe(422);
  });

  test('rejects invalid priority', async () => {
    const res = await request(app).post('/test').send({ department_id: 1, priority: 'platinum' });
    expect(res.status).toBe(422);
  });

  test('accepts valid ticket data', async () => {
    const res = await request(app).post('/test').send({ department_id: 1, priority: 'urgent' });
    expect(res.status).toBe(200);
  });
});
