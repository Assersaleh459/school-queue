// Shown when the license is past its grace period: everything is stopped until a new
// key (signed for this server PC) is entered.
import { useEffect, useState } from 'react';
import { licenseAPI } from '../lib/licenseClient';
import { fmtDate } from '../lib/licenseFormat';

export default function LicenseExpired() {
  const [info, setInfo] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    licenseAPI.expired().then(r => {
      if (!r.data.blocked) window.location.href = '/';
      else setInfo(r.data);
    }).catch(() => setInfo({ blocked: true }));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await licenseAPI.renew(key.trim());
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.error || 'Could not activate the key');
      setBusy(false);
    }
  };

  const copyId = () => {
    navigator.clipboard?.writeText(info.machineId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="h-3 w-3 rounded-full bg-red-600" />
          <h1 className="text-xl font-bold text-red-800">SchoolQ license has expired</h1>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          {info?.expires
            ? `The license${info.school ? ` for ${info.school}` : ''} ended on ${fmtDate(info.expires)}.`
            : `${info?.reason || 'The license for this server is no longer valid'}.`}
          {' '}Contact Vyra Systems for a renewal key and enter it below.
        </p>

        {info?.machineId && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-500 mb-1">Machine ID of this server — send it with your renewal request</p>
            <div className="flex gap-2">
              <code className="flex-1 font-mono text-sm bg-gray-100 rounded-lg px-3 py-2 select-all break-all">{info.machineId}</code>
              <button type="button" onClick={copyId} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 active:scale-95 transition">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <label className="block text-xs font-semibold text-gray-500 mb-1" htmlFor="key">New license key</label>
        <textarea
          id="key"
          value={key}
          onChange={e => setKey(e.target.value)}
          rows={4}
          className="w-full font-mono text-xs border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal"
          placeholder="Paste the key from Vyra Systems"
        />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <button type="submit" disabled={busy || !key.trim()}
          className="mt-4 w-full py-2.5 bg-navy text-white rounded-lg font-semibold hover:bg-opacity-90 active:scale-[0.99] transition disabled:opacity-40">
          {busy ? 'Checking…' : 'Activate'}
        </button>
      </form>
    </div>
  );
}
