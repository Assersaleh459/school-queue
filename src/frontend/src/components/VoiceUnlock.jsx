// Password form for the Vyra-locked pages (password from Vyra Systems).
// kind 'voice' = Voice Recordings (default) · 'wipe' = Fresh Start (its own, different password)
import { useState } from 'react';
import { unlockVoice, unlockWipe } from '../lib/voiceLock';

const KINDS = {
  voice: { label: 'Voice Recordings password (from Vyra Systems)', unlock: unlockVoice },
  wipe:  { label: 'Fresh Start password (from Vyra Systems)',      unlock: unlockWipe },
};

export default function VoiceUnlock({ onUnlocked, autoFocus = true, kind = 'voice' }) {
  const { label, unlock } = KINDS[kind];
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlock(password);
      setPassword('');
      onUnlocked?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not unlock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 max-w-sm">
      <label htmlFor={`${kind}-unlock-pass`} className="text-xs font-semibold text-gray-500">{label}</label>
      <div className="flex gap-2">
        <input id={`${kind}-unlock-pass`} type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus={autoFocus}
          autoComplete="off" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
        <button type="submit" disabled={busy || !password}
          className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 active:scale-95 transition disabled:opacity-40">
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </form>
  );
}
