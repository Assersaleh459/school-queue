// The server-side "say it N times, every G minutes" loop behind 📢 (announceSeries.js). No DB.
jest.useFakeTimers();
const series = require('../announceSeries');

const MIN = 60000;
let io;
beforeEach(() => { series.stop(); io = { emit: jest.fn() }; });
afterAll(() => series.stop());

test('3 times every 5 minutes: now, +5, +10, then nothing runs', () => {
  const speak = jest.fn(() => true);
  series.start({ io, announcement_id: 7, count: 3, gapMs: 5 * MIN, speak });
  expect(speak).toHaveBeenCalledTimes(1);
  expect(speak).toHaveBeenLastCalledWith(1);
  expect(series.status()).toMatchObject({ announcement_id: 7, done: 1, total: 3, next_at: expect.any(String) });
  expect(io.emit).toHaveBeenLastCalledWith('announcement_series', expect.objectContaining({ announcement_id: 7, done: 1, total: 3 }));

  jest.advanceTimersByTime(5 * MIN - 1);
  expect(speak).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  expect(speak).toHaveBeenCalledTimes(2);
  expect(speak).toHaveBeenLastCalledWith(2);
  expect(series.status()).toMatchObject({ done: 2, total: 3 });

  jest.advanceTimersByTime(5 * MIN);
  expect(speak).toHaveBeenCalledTimes(3);
  expect(series.status()).toBeNull();
  expect(io.emit).toHaveBeenLastCalledWith('announcement_series', null);

  jest.advanceTimersByTime(60 * MIN);
  expect(speak).toHaveBeenCalledTimes(3);
});

test('once (the default): speak now, nothing left to show', () => {
  const speak = jest.fn(() => true);
  series.start({ io, announcement_id: 1, count: 1, gapMs: MIN, speak });
  expect(speak).toHaveBeenCalledTimes(1);
  expect(series.status()).toBeNull();
  expect(io.emit).toHaveBeenLastCalledWith('announcement_series', null);
});

test('stop() mid-gap: no more repeats, and the screens are told', () => {
  const speak = jest.fn(() => true);
  series.start({ io, announcement_id: 1, count: 3, gapMs: MIN, speak });
  jest.advanceTimersByTime(MIN / 2);
  expect(series.stop()).toEqual({ announcement_id: 1, done: 1, total: 3, next_at: expect.any(String) });
  expect(io.emit).toHaveBeenLastCalledWith('announcement_series', null);
  jest.advanceTimersByTime(5 * MIN);
  expect(speak).toHaveBeenCalledTimes(1);
  expect(series.stop()).toBeNull();
});

test('speak() returning false ends the series (the announcement was deleted)', () => {
  const speak = jest.fn((n) => n < 2);
  series.start({ io, announcement_id: 1, count: 3, gapMs: MIN, speak });
  jest.advanceTimersByTime(MIN);
  expect(speak).toHaveBeenCalledTimes(2);
  expect(series.status()).toBeNull();
  jest.advanceTimersByTime(MIN);
  expect(speak).toHaveBeenCalledTimes(2);
});

test('a new 📢 replaces the running series', () => {
  const first = jest.fn(() => true);
  const second = jest.fn(() => true);
  series.start({ io, announcement_id: 1, count: 3, gapMs: MIN, speak: first });
  series.start({ io, announcement_id: 2, count: 2, gapMs: MIN, speak: second });
  expect(series.status()).toMatchObject({ announcement_id: 2, done: 1, total: 2 });
  jest.advanceTimersByTime(MIN);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
  expect(series.status()).toBeNull();
});

test('a speak() that throws ends the series instead of crashing the timer', () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  const speak = jest.fn((n) => { if (n === 2) throw new Error('db gone'); return true; });
  series.start({ io, announcement_id: 1, count: 3, gapMs: MIN, speak });
  jest.advanceTimersByTime(MIN);
  expect(series.status()).toBeNull();
  jest.advanceTimersByTime(MIN);
  expect(speak).toHaveBeenCalledTimes(2);
  quiet.mockRestore();
});
