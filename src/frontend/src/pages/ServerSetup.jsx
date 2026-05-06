import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ServerSetup() {
  const navigate = useNavigate();
  const api = window.electronAPI;

  const [mode, setMode]         = useState('server');
  const [serverIp, setServerIp] = useState('');
  const [localIPs, setLocalIPs] = useState([]);
  const [status, setStatus]     = useState(null); // { type: 'ok'|'err'|'info', msg }

  useEffect(() => {
    if (!api) return;
    const cfg = api.getConfig();
    if (cfg) {
      setMode(cfg.mode || 'server');
      if (cfg.mode === 'client') {
        try { setServerIp(new URL(cfg.serverUrl).hostname); } catch {}
      }
    }
    setLocalIPs(api.getLocalIPs());
  }, []);

  const testConnection = async () => {
    const ip = serverIp.trim();
    if (!ip) { setStatus({ type: 'err', msg: 'Enter a server IP address first.' }); return; }
    setStatus({ type: 'info', msg: 'Testing connection…' });
    try {
      const res = await fetch(`http://${ip}:3000/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) setStatus({ type: 'ok', msg: '✓ Server is reachable!' });
      else setStatus({ type: 'err', msg: 'Server responded with an error.' });
    } catch {
      setStatus({ type: 'err', msg: '✗ Cannot reach server. Check the IP and make sure SchoolQ is running on that machine.' });
    }
  };

  const save = () => {
    if (!api) return;
    if (mode === 'client' && !serverIp.trim()) {
      setStatus({ type: 'err', msg: 'Enter the server IP address.' });
      return;
    }
    const serverUrl = mode === 'server' ? 'http://localhost:3000' : `http://${serverIp.trim()}:3000`;
    api.saveConfig({ mode, serverUrl });
    setStatus({ type: 'ok', msg: 'Saved — relaunching…' });
    setTimeout(() => api.relaunch(), 800);
  };

  if (!api) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow p-10 max-w-md text-center">
          <p className="text-2xl font-bold text-navy mb-3">Server Settings</p>
          <p className="text-gray-500">Server settings are only available in the desktop application.</p>
          <button onClick={() => navigate('/home')} className="mt-6 bg-teal text-white px-6 py-3 rounded-lg font-semibold">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-lg">
        <div className="mb-6">
          <button onClick={() => navigate('/home')} className="text-teal hover:text-navy text-sm font-semibold">← Back to Home</button>
        </div>

        <h1 className="text-2xl font-black text-navy mb-1">Server Settings</h1>
        <p className="text-gray-500 text-sm mb-8">Configure whether this PC is the server or a client connecting to another machine.</p>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {[
            { value: 'server', icon: '🖥️', label: 'Server', desc: 'This PC hosts the database. All others connect to it.' },
            { value: 'client', icon: '💻', label: 'Client', desc: 'This PC connects to another machine running SchoolQ.' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => { setMode(opt.value); setStatus(null); }}
              className={`border-2 rounded-xl p-5 text-left transition-all ${
                mode === opt.value
                  ? 'border-teal bg-teal bg-opacity-5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-3xl mb-2">{opt.icon}</div>
              <div className="font-bold text-navy">{opt.label}</div>
              <div className="text-xs text-gray-500 mt-1 leading-snug">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Server mode: show local IPs */}
        {mode === 'server' && (
          <div className="mb-6 p-4 bg-navy bg-opacity-5 rounded-xl">
            <p className="text-sm font-semibold text-navy mb-2">This machine's IP address (share with client PCs):</p>
            <div className="flex flex-wrap gap-2">
              {localIPs.length > 0
                ? localIPs.map(ip => (
                    <span key={ip} className="bg-navy text-teal px-3 py-1 rounded-lg text-sm font-bold tracking-wide">{ip}</span>
                  ))
                : <span className="text-gray-400 text-sm">No network adapters detected</span>
              }
            </div>
          </div>
        )}

        {/* Client mode: enter server IP */}
        {mode === 'client' && (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-navy mb-2">Server IP Address</label>
            <input
              type="text"
              value={serverIp}
              onChange={e => setServerIp(e.target.value)}
              placeholder="e.g. 192.168.1.5"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-teal text-lg"
            />
            <p className="text-xs text-gray-400 mt-1">Enter the IP shown on the server machine.</p>
            <button
              onClick={testConnection}
              className="mt-3 w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
            >
              Test Connection
            </button>
          </div>
        )}

        {/* Status */}
        {status && (
          <div className={`mb-4 text-sm font-semibold text-center py-2 px-4 rounded-lg ${
            status.type === 'ok'   ? 'bg-green-50 text-green-700' :
            status.type === 'err'  ? 'bg-red-50 text-red-700' :
                                     'bg-blue-50 text-blue-700'
          }`}>
            {status.msg}
          </div>
        )}

        <button
          onClick={save}
          className="w-full bg-teal text-white py-4 rounded-xl font-bold text-lg hover:bg-opacity-90 transition-opacity"
        >
          Save & Relaunch
        </button>
      </div>
    </div>
  );
}
