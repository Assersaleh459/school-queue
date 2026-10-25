// One announcement series at a time: "say it N times, every G minutes" (📢 in Announcements).
// The server keeps the timer, so every display (even one opened mid-series) hears every repeat,
// and the Announcements screen can show progress and stop it. Every change is broadcast as
// 'announcement_series' → { announcement_id, done, total, next_at } or null when nothing runs.
// shortcut: not saved anywhere, so a server restart drops the rest of a series. If a school needs
// repeats to survive a restart, keep the state in app_state and resume it on start-up.

let series = null;   // { io, announcement_id, done, total, gapMs, next_at, timer, speak }

function status() {
  if (!series) return null;
  const { announcement_id, done, total, next_at } = series;
  return { announcement_id, done, total, next_at };
}

function end(io) {
  if (series?.timer) clearTimeout(series.timer);
  series = null;
  io?.emit('announcement_series', null);
}

// Ends the running series (a repeat already on the display finishes). Returns what was running, or null.
function stop() {
  if (!series) return null;
  const was = status();
  end(series.io);
  return was;
}

function tick() {
  const s = series;
  if (!s) return;
  try {
    // speak(n) says repeat n; false ends the series early (e.g. the announcement was deleted)
    if (s.speak(s.done + 1) === false) return end(s.io);
  } catch (err) {
    console.error('Announcement repeat failed:', err);
    return end(s.io);
  }
  s.done++;
  if (s.done >= s.total) return end(s.io);
  s.next_at = new Date(Date.now() + s.gapMs).toISOString();
  s.timer = setTimeout(tick, s.gapMs);
  s.timer.unref?.();
  s.io.emit('announcement_series', status());
}

// Replaces any running series. speak(n) is called now for repeat 1, then every gapMs.
function start({ io, announcement_id, count, gapMs, speak }) {
  stop();
  series = { io, announcement_id, done: 0, total: count, gapMs, next_at: null, timer: null, speak };
  tick();
}

module.exports = { start, stop, status };
