// License expiry notices: the card on Admin → Overview / License, and the red bar every
// logged-in user sees once the license has run out (grace period).
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { licenseAPI } from '../lib/licenseClient';
import useAuthStore from '../store/useAuthStore';
import { licenseMessage } from '../lib/licenseFormat';

const TONES = {
  ok:    { box: 'bg-white border-gray-200',        dot: 'bg-green-500',  title: 'text-navy' },
  muted: { box: 'bg-white border-gray-200',        dot: 'bg-gray-300',   title: 'text-gray-600' },
  amber: { box: 'bg-amber-50 border-amber-300',    dot: 'bg-amber-500',  title: 'text-amber-900' },
  red:   { box: 'bg-red-50 border-red-300',        dot: 'bg-red-600',    title: 'text-red-800' },
};

// Card for Admin → Overview / License. Highlighted when the license is close to its end.
export function LicenseCard({ lic, action = null }) {
  const m = licenseMessage(lic);
  const t = TONES[m.tone];
  const urgent = lic?.status === 'critical' || lic?.status === 'grace';
  return (
    <div className={`rounded-xl border shadow-sm px-5 py-4 flex flex-wrap items-center gap-4 ${t.box}`} role={m.tone === 'red' ? 'alert' : undefined}>
      <span className="relative flex h-3 w-3 shrink-0">
        {urgent && <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${t.dot}`} />}
        <span className={`relative inline-flex h-3 w-3 rounded-full ${t.dot}`} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={`font-bold ${t.title}`}>{m.title}</p>
        <p className="text-sm text-gray-600">{m.text}</p>
      </div>
      {lic?.licensed && (
        <div className="text-sm text-gray-600 text-right">
          <p><b className="text-navy">{lic.devicesUsed ?? '—'}</b> of <b className="text-navy">{lic.devices ?? '∞'}</b> Staff devices</p>
          {lic.id && <p className="text-xs text-gray-400">License No. {lic.id}</p>}
        </div>
      )}
      {action}
    </div>
  );
}

// Thin red bar on every staff screen while the license is in its grace period
// (not on the TV display or the kiosk — those are for the public)
export function LicenseBanner() {
  const token = useAuthStore(s => s.token);
  const { pathname } = useLocation();
  const [lic, setLic] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    const load = () => licenseAPI.status().then(r => setLic(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [token]);

  if (!token || lic?.status !== 'grace' || /^\/(display|kiosk|license-expired)/.test(pathname)) return null;
  const m = licenseMessage(lic);
  return (
    <div role="alert" className="sticky top-0 z-50 bg-red-600 text-white text-sm font-semibold text-center px-4 py-1.5">
      {m.title} — {m.text}
    </div>
  );
}
