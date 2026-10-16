// Voice Recordings lock (Vyra password from the license). The unlock token lives in
// sessionStorage — closing the window locks the page again — and goes with every /voice/
// request. Imported once from App.jsx; adds its interceptors to the shared axios instance.
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
