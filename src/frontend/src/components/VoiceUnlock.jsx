// Password form for the locked Voice Recordings tools (password from Vyra Systems)
import { useState } from 'react';
import { unlockVoice } from '../lib/voiceLock';

export default function VoiceUnlock({ onUnlocked, autoFocus = true }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlockVoice(password);
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
      <label htmlFor="voice-pass" className="text-xs font-semibold text-gray-500">Voice Recordings password (from Vyra Systems)</label>
      <div className="flex gap-2">
        <input id="voice-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus={autoFocus}
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
