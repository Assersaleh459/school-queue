// Red bar on every screen (except the public TV display) while the server can't be reached.
// In the Staff app it also looks for the server on the network: if the server came back on a
// different port, the window moves to the new address by itself.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { startServerLink, isServerOnline, onServerStatus } from '../lib/serverLink';

const SEARCH_AFTER_MS = 8000;   // give a plain restart time to finish before searching
const SEARCH_EVERY_MS = 6000;

export default function ServerStatusBanner() {
  const [online, setOnline] = useState(isServerOnline());
  const { pathname } = useLocation();

  useEffect(() => {
    startServerLink();
    setOnline(isServerOnline());
    return onServerStatus(setOnline);
  }, []);

  useEffect(() => {
    if (online || !window.electronAPI?.findServer) return;
    let stopped = false;
    let timer;
    const search = async () => {
      try {
        const url = await window.electronAPI.findServer();
        if (stopped) return;
        if (url && url !== window.location.origin) { window.location.href = url; return; }
      } catch { /* try again */ }
      if (!stopped) timer = setTimeout(search, SEARCH_EVERY_MS);
    };
    timer = setTimeout(search, SEARCH_AFTER_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [online]);

  if (online || pathname === '/display') return null;

  return (
    <div role="alert" className="sticky top-0 z-[60] bg-red-600 text-white text-center text-sm font-semibold px-4 py-2 shadow">
      Cannot reach the SchoolQ server. Trying to reconnect… Your last data is still shown, but changes will not be saved until it is back.
    </div>
  );
}
