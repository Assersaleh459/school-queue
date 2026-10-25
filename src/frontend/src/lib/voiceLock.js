// Voice Recordings lock and Fresh Start lock (two separate Vyra passwords from the license).
// Each unlock token lives in sessionStorage — closing the window locks the page again — and goes
// with the matching requests: /voice/* with X-Voice-Unlock, /voice/wipe* with X-Wipe-Unlock.
// Imported once from App.jsx; adds its interceptors to the shared axios instance.
import { useEffect, useState } from 'react';
import api from './api';

const KEY = 'schoolq_voice_unlock';
const EVENT = 'schoolq-voice-lock';

export const unlockToken = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const setToken = (t) => {
  try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT));
};

api.interceptors.request.use((config) => {
  const t = unlockToken();
  if (t && config.url?.startsWith('/voice/')) config.headers['X-Voice-Unlock'] = t;
  return config;
});

api.interceptors.response.use(res => res, (err) => {
  if (err.response?.status === 423 && err.response.data?.code === 'voice_locked' && unlockToken()) setToken(null);
  return Promise.reject(err);
});

export async function unlockVoice(password) {
  const r = await api.post('/voice/unlock', { password });
  setToken(r.data.token);
}

export const lockVoice = () => setToken(null);

// { locked: license has a voice password, open: may use the voice tools now, ready }
export function useVoiceLock() {
  const [locked, setLocked] = useState(null);
  const [token, setTok] = useState(unlockToken());
  useEffect(() => {
    let alive = true;
    api.get('/voice/lock').then(r => { if (alive) setLocked(!!r.data.locked); }).catch(() => { if (alive) setLocked(false); });
    const onChange = () => setTok(unlockToken());
    window.addEventListener(EVENT, onChange);
    return () => { alive = false; window.removeEventListener(EVENT, onChange); };
  }, []);
  return { ready: locked !== null, locked: !!locked, open: locked === false || !!token };
}

// ── Fresh Start: its own password and token ───────────────────────────────────

const WIPE_KEY = 'schoolq_wipe_unlock';
const WIPE_EVENT = 'schoolq-wipe-lock';

export const wipeToken = () => { try { return sessionStorage.getItem(WIPE_KEY); } catch { return null; } };
const setWipeToken = (t) => {
  try { if (t) sessionStorage.setItem(WIPE_KEY, t); else sessionStorage.removeItem(WIPE_KEY); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(WIPE_EVENT));
};

api.interceptors.request.use((config) => {
  const t = wipeToken();
  if (t && config.url?.startsWith('/voice/wipe')) config.headers['X-Wipe-Unlock'] = t;
  return config;
});

api.interceptors.response.use(res => res, (err) => {
  if (err.response?.status === 423 && err.response.data?.code === 'wipe_locked' && wipeToken()) setWipeToken(null);
  return Promise.reject(err);
});

export async function unlockWipe(password) {
  const r = await api.post('/voice/wipe/unlock', { password });
  setWipeToken(r.data.token);
}

export const lockWipe = () => setWipeToken(null);

// { enabled: the license has a Fresh Start password (else the page is off), open: unlocked now, ready }
export function useWipeLock() {
  const [enabled, setEnabled] = useState(null);
  const [token, setTok] = useState(wipeToken());
  useEffect(() => {
    let alive = true;
    api.get('/voice/wipe/lock').then(r => { if (alive) setEnabled(!!r.data.enabled); }).catch(() => { if (alive) setEnabled(false); });
    const onChange = () => setTok(wipeToken());
    window.addEventListener(WIPE_EVENT, onChange);
    return () => { alive = false; window.removeEventListener(WIPE_EVENT, onChange); };
  }, []);
  return { ready: enabled !== null, enabled: !!enabled, open: !!enabled && !!token };
}
