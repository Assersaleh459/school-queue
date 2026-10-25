// Admin → License: what the school's license allows, which Staff devices use it, renewal.
import { useCallback, useEffect, useState } from 'react';
import { licenseAPI } from '../../lib/licenseClient';
import { LicenseCard } from '../../components/LicenseNotice';
import { fmtDate } from '../../lib/licenseFormat';
import { toast } from '../../store/useToastStore';
import { useLiveRefresh } from '../../lib/useLiveRefresh';
import useAuthStore from '../../store/useAuthStore';

// SQLite timestamps are UTC without a "Z"
const ago = (ts) => {
  if (!ts) return '—';
  const min = Math.round((Date.now() - new Date(ts.replace(' ', 'T') + 'Z').getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
};

const KIND = { staff: 'Staff PC', browser: 'Browser', server: 'Server PC' };

export default function License() {
  const user = useAuthStore(s => s.user);
  const [lic, setLic] = useState(null);
  const [list, setList] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    licenseAPI.get().then(r => setLic(r.data)).catch(() => toast.error('Could not load the license'));
    licenseAPI.devices().then(r => setList(r.data)).catch(() => setList([]));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, [load]);
  useLiveRefresh(['license_updated'], load);

  const free = async (d) => {
    if (!confirm(`Free the slot used by "${d.name}"?\n\nAnyone using SchoolQ on it is signed out. It can sign in again later if a slot is free.`)) return;
    try {
      await licenseAPI.revoke(d.device_id);
      toast.success(`${d.name} signed out — slot freed`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not free the slot');
    }
  };

  const renew = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await licenseAPI.renew(key.trim());
      toast.success('New license activated');
      setKey('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not activate the key');
    } finally {
      setBusy(false);
    }
  };

  const copyId = () => {
    navigator.clipboard?.writeText(lic.machineId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const used = lic?.devicesUsed ?? 0;
  const allowed = lic?.devices;     // null = unlimited
  const pct = allowed ? Math.min(100, Math.round((used / allowed) * 100)) : 0;
  const full = allowed && used >= allowed;

  return (
    <div className="max-w-7xl">
      <h2 className="text-2xl font-bold text-navy mb-1">License</h2>
      <p className="text-sm text-gray-500 mb-6">Your SchoolQ license, the Staff devices using it, and renewals.</p>

      {!lic ? <div className="animate-pulse h-20 bg-gray-200 rounded-xl mb-6" /> : (
        <>
          <div className="mb-6"><LicenseCard lic={lic} /></div>

          {lic.licensed && (
            <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <h3 className="text-lg font-bold text-navy mb-4">License details</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-gray-500">Licensed to</dt><dd className="font-semibold text-navy">{lic.school}</dd></div>
                <div><dt className="text-gray-500">License No.</dt><dd className="font-mono">{lic.id || '—'}</dd></div>
                <div><dt className="text-gray-500">Type</dt><dd className="capitalize">{lic.type}</dd></div>
                <div><dt className="text-gray-500">Issued</dt><dd>{fmtDate(lic.issued)}</dd></div>
                <div>
                  <dt className="text-gray-500">Expires</dt>
                  <dd>{lic.expires ? <>{fmtDate(lic.expires)}{lic.daysLeft >= 0 && <span className="text-gray-400"> · {lic.daysLeft} days left</span>}</> : 'Never'}</dd>
                </div>
                {lic.expires && <div><dt className="text-gray-500">Grace after expiry</dt><dd>{lic.grace ? `${lic.grace} day${lic.grace === 1 ? '' : 's'}` : 'None'}</dd></div>}
                <div><dt className="text-gray-500">Staff devices</dt><dd>{allowed ? `${allowed} at once` : 'Unlimited'}</dd></div>
                <div><dt className="text-gray-500">Voice Recordings</dt><dd>{lic.voiceLocked ? 'Locked by Vyra Systems' : 'Open'}</dd></div>
              </dl>
            </section>
          )}
        </>
      )}

      {/* Devices */}
      <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex flex-wrap items-baseline gap-3 mb-1">
          <h3 className="text-lg font-bold text-navy mr-auto">Staff devices</h3>
          <span className={`text-sm font-semibold ${full ? 'text-red-700' : 'text-gray-700'}`}>
            {used} of {allowed ?? '∞'} in use
          </span>
        </div>
        {allowed && (
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={allowed} aria-label="Staff devices in use">
            <div className={`h-full rounded-full transition-[width] duration-500 ${full ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-teal'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="text-xs text-gray-500 mb-4">
          Each PC with the Staff app, or browser, that signs in uses a slot while it is in use (and for {lic?.activeMinutes ?? 15} minutes after).
          The server PC, the TV display and the kiosk are free.
          {full && <b className="text-red-700"> All slots are in use — free one below to let another device sign in.</b>}
        </p>
        {!list ? <div className="animate-pulse h-16 bg-gray-100 rounded-lg" /> : list.length === 0 ? (
          <p className="text-sm text-gray-400">No devices have signed in yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3 font-semibold">Device</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Last user</th>
                  <th className="py-2 pr-3 font-semibold">Last seen</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.device_id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-navy" dir="auto">{d.name}</td>
                    <td className="py-2 pr-3 text-gray-600">{KIND[d.kind] || d.kind}</td>
                    <td className="py-2 pr-3 text-gray-600">{d.last_user || d.last_username || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500">{ago(d.last_seen)}</td>
                    <td className="py-2 pr-3">
                      {d.kind === 'server' ? <span className="text-xs text-gray-400">Free</span>
                        : d.active ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700"><span className="w-2 h-2 rounded-full bg-green-500" />In use</span>
                        : <span className="text-xs text-gray-400">Not in use</span>}
                    </td>
                    <td className="py-2 text-right">
                      {d.kind !== 'server' && d.active === 1 && (
                        <button onClick={() => free(d)} className="px-3 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-95 transition">
                          Free slot
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Renew */}
      <section className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-navy mb-1">Renew or upgrade</h3>
        <p className="text-xs text-gray-500 mb-4">
          To renew, or to get more Staff devices, send this server's Machine ID to Vyra Systems and paste the new key here.
          It takes effect immediately.
        </p>
        {lic?.machineId && (
          <div className="flex gap-2 mb-4">
            <code className="flex-1 font-mono text-sm bg-gray-100 rounded-lg px-3 py-2 select-all break-all" aria-label="Machine ID">{lic.machineId}</code>
            <button type="button" onClick={copyId} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 active:scale-95 transition">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        {user?.role === 'super_admin' ? (
          <form onSubmit={renew} className="flex flex-col gap-2">
            <textarea value={key} onChange={e => setKey(e.target.value)} rows={3} aria-label="New license key"
              placeholder="Paste the new license key"
              className="w-full font-mono text-xs border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal" />
            <button type="submit" disabled={busy || !key.trim()}
              className="self-end px-5 py-2 bg-navy text-white rounded-lg font-semibold hover:bg-opacity-90 active:scale-95 transition disabled:opacity-40">
              {busy ? 'Checking…' : 'Activate new key'}
            </button>
          </form>
        ) : <p className="text-xs text-gray-500">Ask a super admin to enter a new key.</p>}
      </section>
    </div>
  );
}
