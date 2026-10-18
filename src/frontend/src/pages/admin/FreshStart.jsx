// Fresh Start (Vyra Systems only): puts this server back to a new install, e.g. after a demo or
// before handing it to a school. Shown only once Voice Recordings is unlocked with the Vyra password.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { voiceAPI } from '../../lib/api';
import { useVoiceLock, lockVoice } from '../../lib/voiceLock';
import useAuthStore from '../../store/useAuthStore';
import VoiceUnlock from '../../components/VoiceUnlock';

const ERASED = [
  'All tickets and their history (reports start empty)',
  'Departments and services',
  'All users — a new admin is made (admin / admin123, a new password is asked at sign-in)',
  'Announcements',
  'The audit log',
  'Staff devices',
  'Settings — the school name goes back to “My School”',
  'Voice recordings (the app goes back to the built-in Sarah numbers)',
];
const KEPT = [
  'The license',
  'The voice engine',
  'A copy of everything erased, in the backups\\before-wipe folder next to the database',
];

export default function FreshStartPage() {
  const voice = useVoiceLock();
  const user = useAuthStore(s => s.user);
  if (!voice.ready) return <div className="animate-pulse h-24 bg-gray-200 rounded-xl max-w-3xl" />;
  if (!voice.locked || user?.role !== 'super_admin') {
    return (
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold text-navy mb-1">Fresh Start</h2>
        <p className="text-sm text-gray-500">Not available on this server.</p>
      </div>
    );
  }
  if (!voice.open) {
    return (
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold text-navy mb-1">Fresh Start</h2>
        <p className="text-sm text-gray-500 mb-6">This page is locked by Vyra Systems.</p>
        <section className="bg-white rounded-xl shadow-sm p-6"><VoiceUnlock /></section>
      </div>
    );
  }
  return <FreshStart />;
}

function FreshStart() {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold text-navy mb-1">Fresh Start</h2>
      <p className="text-sm text-gray-500 mb-6">Vyra Systems only. Puts this server back to a new install — for example after a demo, or before handing it to a school.</p>
      <section className="bg-white rounded-xl shadow-sm p-6 border border-red-200">
        <h3 className="font-semibold text-red-700 mb-2">Erase all school data</h3>
        <p className="text-sm text-gray-600 mb-4">Everyone who is signed in is sent back to the sign-in page.</p>
        <button onClick={() => setOpen(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 active:scale-95 transition">
          Erase all data…
        </button>
      </section>
      {open && <WipeDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function WipeDialog({ onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await voiceAPI.wipe(password);
      lockVoice();
      logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Fresh start failed');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-auto" role="dialog" aria-labelledby="wipe-title">
        <h3 id="wipe-title" className="text-lg font-bold text-red-700 mb-3">Erase all data on this server?</h3>
        <p className="text-sm font-semibold text-gray-700">Erased:</p>
        <ul className="text-sm text-gray-600 list-disc pl-5 mb-3 space-y-0.5">{ERASED.map(t => <li key={t}>{t}</li>)}</ul>
        <p className="text-sm font-semibold text-gray-700">Kept:</p>
        <ul className="text-sm text-gray-600 list-disc pl-5 mb-4 space-y-0.5">{KEPT.map(t => <li key={t}>{t}</li>)}</ul>

        <label htmlFor="wipe-pass" className="block text-xs font-semibold text-gray-500 mb-1">Voice Recordings password (from Vyra Systems)</label>
        <input id="wipe-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="off"
          className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-teal" />
        <label htmlFor="wipe-confirm" className="block text-xs font-semibold text-gray-500 mb-1">Type WIPE to confirm</label>
        <input id="wipe-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off"
          className="w-full px-3 py-2 border rounded-lg text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-red-400" />
        {error && <p className="text-sm text-red-600 mb-3" role="alert">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="submit" disabled={busy || !password || confirm !== 'WIPE'}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
            {busy ? 'Erasing…' : 'Erase everything'}
          </button>
        </div>
      </form>
    </div>
  );
}
