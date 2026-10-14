import { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI, voiceAPI } from '../../lib/api';
import { DEFAULT_TEMPLATES, requiredPieces, phraseUrl } from '../../lib/voiceClips';
import { toast } from '../../store/useToastStore';
import useAuthStore from '../../store/useAuthStore';
import VoiceBrowser, { TakeReview } from './VoiceBrowser';
import { clipUrls, clipId } from '../../lib/voiceBrowse';

const GROUPS = [
  { source: 'template',     title: 'Ticket calls',  hint: 'Fixed words from your call templates (Settings)' },
  { source: 'department',   title: 'Departments',   hint: 'Department names (Arabic name used for Arabic calls)' },
  { source: 'announcement', title: 'Announcements', hint: 'Spoken with “Announce on display”' },
  { source: 'custom',       title: 'Your phrases',  hint: 'Anything you added here' },
];

const STATE_LABEL = {
  off:      { text: 'Idle — starts automatically when needed', cls: 'bg-gray-100 text-gray-600' },
  starting: { text: 'Starting — loading the voice model (a few minutes)', cls: 'bg-amber-100 text-amber-800' },
  ready:    { text: 'Ready', cls: 'bg-green-100 text-green-800' },
  busy:     { text: 'Generating…', cls: 'bg-blue-100 text-blue-800' },
};

function LangBadge({ lang }) {
  return <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-navy text-teal">{lang.toUpperCase()}</span>;
}

export default function VoiceRecordings() {
  const user = useAuthStore(s => s.user);
  const [engine, setEngine]       = useState(null);
  const [manifest, setManifest]   = useState({});
  const [pieces, setPieces]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [phrase, setPhrase]       = useState('');
  const [phraseLang, setPhraseLang] = useState('ar');
  const [voices, setVoices]       = useState([]);
  const [takes, setTakes]         = useState({});   // "<voice>|<clip id>" → clip, for new takes waiting
  const [takesSeen, setTakesSeen] = useState(0);    // bumps on reload, so a take is fetched afresh
  const lastDone = useRef(-1);
  const player = useRef(null);

  const loadVoices = useCallback(() => voiceAPI.voices().then(r => setVoices(r.data)).catch(() => {}), []);

  // New takes waiting in the voices in use, so a 🔁 below can be compared and kept
  const loadTakes = useCallback(async (m) => {
    const names = [...new Set([m.voice || 'Sarah', m.announce?.voice || m.voice || 'Sarah'])];
    const found = {};
    for (const name of names) {
      try {
        for (const c of (await voiceAPI.clips(name)).data.phrases) if (c.take) found[`${name}|${clipId(c)}`] = c;
      } catch { /* older server */ }
    }
    setTakes(found);
    setTakesSeen(n => n + 1);
  }, []);

  const loadPieces = useCallback(async () => {
    const [settings, depts, anns, man] = await Promise.all([
      adminAPI.getSettings(), adminAPI.getDepartments(), adminAPI.getAnnouncements(), voiceAPI.manifest(),
    ]);
    const s = Object.fromEntries(settings.data.map(r => [r.setting_key, r.setting_value]));
    const templates = {
      callEn: s.call_template_en || DEFAULT_TEMPLATES.callEn,     recallEn: s.recall_template_en || DEFAULT_TEMPLATES.recallEn,
      callAr: s.call_template_ar || DEFAULT_TEMPLATES.callAr,     recallAr: s.recall_template_ar || DEFAULT_TEMPLATES.recallAr,
    };
    setPieces(requiredPieces(templates, depts.data.filter(d => d.is_active), anns.data.filter(a => a.is_active)));
    setManifest(man.data || {});
    loadTakes(man.data || {});
  }, [loadTakes]);

  const loadEngine = useCallback(async () => {
    try {
      const r = await voiceAPI.engine();
      setEngine(r.data);
      // a clip finished → refresh the recorded list and voice progress
      if (r.data.done !== lastDone.current) {
        if (lastDone.current !== -1) {
          voiceAPI.manifest().then(m => { setManifest(m.data || {}); loadTakes(m.data || {}); }).catch(() => {});
          loadVoices();
        }
        lastDone.current = r.data.done;
      }
    } catch {}
  }, [loadVoices, loadTakes]);

  useEffect(() => {
    loadPieces().catch(() => toast.error('Failed to load recordings')).finally(() => setLoading(false));
    loadEngine();
    loadVoices();
    const t = setInterval(loadEngine, 3000);
    return () => clearInterval(t);
  }, [loadPieces, loadEngine, loadVoices]);

  // Calls (templates, departments, own phrases) use the calls voice; announcements their own
  const callsVoice    = manifest.voice || 'Sarah';
  const announceVoice = manifest.announce?.voice || callsVoice;
  const manifestOf    = (p) => (p.source === 'announcement' ? manifest.announce || manifest : manifest);
  const voiceOf       = (p) => (p.source === 'announcement' ? announceVoice : callsVoice);
  const recordedFile  = (p) => manifestOf(p)[p.lang]?.[p.text];
  const sameJob       = (j, p) => j && (j.voice || 'Sarah') === voiceOf(p) && j.lang === p.lang && j.text === p.text;
  const isQueued      = (p) => engine?.queue?.some(q => sameJob(q, p));
  const isCurrent     = (p) => sameJob(engine?.current, p);

  // Recorded pieces that aren't required by anything else are the admin's own phrases
  const custom = ['ar', 'en'].flatMap(lang => Object.keys(manifest[lang] || {}).map(text => ({ lang, text, source: 'custom' })))
    .filter(c => !pieces.some(p => p.lang === c.lang && p.text === c.text));
  const all = [...pieces, ...custom];
  const missing = pieces.filter(p => !recordedFile(p) && !isQueued(p) && !isCurrent(p));

  // Records pieces, each in the voice it is spoken in
  const generate = async (items, force = false) => {
    try {
      let queued = 0;
      for (const voice of [...new Set(items.map(voiceOf))]) {
        const batch = items.filter(p => voiceOf(p) === voice).map(({ lang, text }) => ({ lang, text }));
        queued += (await voiceAPI.generate(batch, force, voice)).data.queued;
      }
      toast.success(!queued ? 'Already recorded'
        : force ? `New take queued — the current recording stays in use until you choose “Keep new”`
        : `${queued} recording${queued > 1 ? 's' : ''} queued`);
      loadEngine();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not start generation');
    }
  };

  const remove = async (p) => {
    if (!confirm(`Delete the recording of "${p.text}"? It will use the online voice until recorded again.`)) return;
    try {
      await voiceAPI.remove(p.lang, p.text, voiceOf(p));
      setManifest((await voiceAPI.manifest()).data || {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const playClip = (p, file) => {
    player.current?.pause();
    player.current = new Audio(phraseUrl(manifestOf(p), file));
    player.current.play().catch(() => toast.error('Could not play the recording'));
  };

  const takeOf = (p) => takes[`${voiceOf(p)}|${clipId(p)}`];
  const playTake = (p, which) => {
    player.current?.pause();
    player.current = new Audio(clipUrls(voiceOf(p), takeOf(p), takesSeen)[which]);
    player.current.play().catch(() => toast.error('Could not play the recording'));
  };
  const keepTake = async (p, keep) => {
    try {
      await voiceAPI.keepTakes(voiceOf(p), [{ lang: p.lang, text: p.text }], keep);
      toast.success(keep === 'new' ? 'New take is now in use' : 'Kept the old recording');
      const m = (await voiceAPI.manifest()).data || {};
      setManifest(m);
      loadTakes(m);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not keep the take');
    }
  };

  const togglePause = async () => {
    try {
      await (engine?.paused ? voiceAPI.resume() : voiceAPI.pause());
      loadEngine();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change the engine state');
    }
  };

  // ── Voices ──
  const playSample = async (name) => {
    try {
      const r = await voiceAPI.sample(name);
      player.current?.pause();
      player.current = new Audio(URL.createObjectURL(r.data));
      player.current.play();
    } catch {
      toast.error('No sample available for this voice');
    }
  };

  const prepareVoice = async (v) => {
    const hours = Math.round((v.numbersTotal - v.numbers) / 60);
    if (!confirm(`Prepare the ${v.name} voice?\n\nThis records ${v.numbersTotal - v.numbers} number clips plus your ${pieces.length} phrases in the background — about ${Math.max(1, hours)} hour(s) with a GPU, much longer without. You can keep using SchoolQ meanwhile.`)) return;
    try {
      const r = await voiceAPI.prepare(v.name, pieces.map(({ lang, text }) => ({ lang, text })));
      toast.success(`${r.data.queued} recordings queued for ${v.name}`);
      loadEngine();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not prepare the voice');
    }
  };

  const useVoice = async (v, forWhat) => {
    try {
      await voiceAPI.use(v.name, forWhat);
      const m = (await voiceAPI.manifest()).data || {};
      setManifest(m);
      loadVoices();
      if (forWhat === 'announcements') {
        // Record the announcement sentences in the new voice (a minute or so each)
        const todo = pieces.filter(p => p.source === 'announcement' && !(m.announce || m)[p.lang]?.[p.text]);
        if (todo.length && installed) await voiceAPI.generate(todo.map(({ lang, text }) => ({ lang, text })), false, v.name);
        toast.success(`Announcements now use ${v.name}${todo.length && installed ? ` — recording ${todo.length} announcement${todo.length > 1 ? 's' : ''}` : ''}`);
        loadEngine();
      } else {
        toast.success(`Ticket calls now use the ${v.name} voice`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not switch voice');
    }
  };

  const addPhrase = (e) => {
    e.preventDefault();
    if (!phrase.trim()) return;
    generate([{ lang: phraseLang, text: phrase }]);
    setPhrase('');
  };

  const install = async () => {
    try {
      await voiceAPI.install();
      toast.info('The Voice Engine setup window opened on the server PC. It downloads about 5 GB — follow it there.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not start the installer');
    }
  };

  const installed = engine?.installed;
  const state = STATE_LABEL[engine?.state] || STATE_LABEL.off;

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold text-navy mb-1">Voice Recordings</h2>
      <p className="text-sm text-gray-500 mb-6">
        Ticket calls use the <b>{callsVoice}</b> voice, announcements the <b>{announceVoice}</b> voice.
        Recorded parts work offline; anything not recorded uses the online voice (needs internet).
      </p>

      {/* Engine */}
      <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h3 className="text-lg font-bold text-navy mb-3">Voice Engine</h3>
        {!engine ? (
          <div className="animate-pulse h-6 bg-gray-200 rounded w-1/2" />
        ) : !installed ? (
          <div>
            <p className="text-sm text-gray-700 mb-3">
              The voice engine is not installed on this server, so new recordings can't be made here.
              It's an optional add-on (about 5 GB). An NVIDIA graphics card makes it fast (~1 minute per phrase);
              without one it still works but takes several minutes per phrase.
            </p>
            {user?.role === 'super_admin'
              ? <button onClick={install} className="px-5 py-2 bg-navy text-white rounded-lg font-semibold hover:bg-opacity-90">Install Voice Engine</button>
              : <p className="text-xs text-gray-500">Ask a super admin to install it.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {engine.paused
                ? <span className="px-2.5 py-1 rounded-full font-semibold bg-amber-100 text-amber-800">Paused</span>
                : <span className={`px-2.5 py-1 rounded-full font-semibold ${state.cls}`}>{state.text}</span>}
              {engine.device && <span className="text-gray-500">Running on {engine.device === 'cpu' ? 'CPU (slow)' : 'GPU'}</span>}
              {engine.queue.length > 0 && <span className="text-gray-500">{engine.queue.length} waiting</span>}
              <span className="text-gray-400">{engine.done} made this session</span>
              {(engine.paused || engine.current || engine.queue.length > 0) && (
                <button
                  onClick={togglePause}
                  className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold ${engine.paused ? 'bg-teal text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {engine.paused ? '▶ Resume' : '⏸ Pause'}
                </button>
              )}
            </div>
            {engine.current && (
              <p className="text-sm text-blue-800" dir="auto">
                Recording now: <b>{engine.current.text}</b> <span className="text-gray-500">({engine.current.voice})</span>
                {engine.paused && <span className="text-amber-700"> — will pause after this one</span>}
              </p>
            )}
            {engine.lastError && <p className="text-sm text-red-600">⚠ {engine.lastError}</p>}
            {engine.failed.length > 0 && (
              <p className="text-xs text-red-600">Failed: {engine.failed.map(f => `“${f.text}”`).join(', ')}</p>
            )}
          </div>
        )}
      </section>

      {/* Voice choice */}
      {voices.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-bold text-navy">Voice</h3>
          <p className="text-xs text-gray-500 mb-3">
            <b>Ticket calls</b> are built from pieces, so their voice is <b>prepared</b> first (315 number clips + your
            phrases, recorded in the background). <b>Announcements</b> are whole sentences — any voice can be used
            for them straight away; your announcements are then recorded in it.
          </p>
          <ul className="divide-y">
            {voices.map(v => {
              const preparing = engine && [engine.current, ...(engine.queue || [])].some(j => j?.voice === v.name);
              return (
                <li key={v.name} className="flex items-center gap-3 py-2">
                  <span className="w-24 font-semibold text-navy">{v.name}</span>
                  <span className="w-14 text-xs text-gray-500">{v.gender === 'female' ? 'Female' : v.gender === 'male' ? 'Male' : ''}</span>
                  <span className="flex-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {v.active && <span className="px-2 py-0.5 rounded-full bg-teal text-white font-semibold">Calls</span>}
                    {v.announcing && <span className="px-2 py-0.5 rounded-full bg-navy text-white font-semibold">Announcements</span>}
                    {!v.active && (v.ready ? <span className="text-green-700">Ready · {v.phrases} phrases</span>
                      : preparing ? <span className="text-blue-700">Preparing… numbers {v.numbers}/{v.numbersTotal}</span>
                      : <span className="text-gray-500">Numbers {v.numbers}/{v.numbersTotal}</span>)}
                  </span>
                  {v.hasSample && <button onClick={() => playSample(v.name)} title="Hear this voice" className="px-2 py-1 text-sm rounded hover:bg-gray-100">▶</button>}
                  {!v.ready && !preparing && (
                    <button onClick={() => prepareVoice(v)} disabled={!installed} className="px-3 py-1 text-xs border border-navy text-navy rounded disabled:opacity-40">Prepare</button>
                  )}
                  {v.ready && !v.active && (
                    <button onClick={() => useVoice(v, 'calls')} className="px-3 py-1 text-xs bg-teal text-white rounded">Use for calls</button>
                  )}
                  {!v.announcing && (
                    <button onClick={() => useVoice(v, 'announcements')} className="px-3 py-1 text-xs bg-navy text-white rounded">Use for announcements</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Actions */}
      <section className="bg-white rounded-xl shadow-sm p-6 mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">
            {missing.length === 0 ? '✓ Everything your announcements need is recorded.' : `${missing.length} part${missing.length > 1 ? 's' : ''} not recorded yet.`}
          </p>
          <button
            onClick={() => generate(missing)}
            disabled={!installed || missing.length === 0}
            className="px-5 py-2 bg-teal text-white rounded-lg font-semibold hover:bg-opacity-90 disabled:opacity-40"
          >
            Generate all missing{missing.length ? ` (${missing.length})` : ''}
          </button>
        </div>
        <form onSubmit={addPhrase} className="flex gap-2">
          <select value={phraseLang} onChange={e => setPhraseLang(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="ar">Arabic</option>
            <option value="en">English</option>
          </select>
          <input
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            dir={phraseLang === 'ar' ? 'rtl' : 'ltr'}
            placeholder={phraseLang === 'ar' ? 'اكتب أي جملة لتسجيلها مسبقاً…' : 'Type any phrase to record in advance…'}
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal text-sm"
          />
          <button type="submit" disabled={!installed || !phrase.trim()} className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            Record
          </button>
        </form>
      </section>

      {/* Pieces */}
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-200 rounded-lg" />)}</div>
      ) : GROUPS.map(g => {
        const rows = all.filter(p => p.source === g.source);
        if (!rows.length) return null;
        return (
          <section key={g.source} className="bg-white rounded-xl shadow-sm p-6 mb-4">
            <h3 className="text-lg font-bold text-navy">{g.title}</h3>
            <p className="text-xs text-gray-500 mb-3">{g.hint}</p>
            <ul className="divide-y">
              {rows.map(p => {
                const file = recordedFile(p);
                return (
                  <li key={`${p.lang}:${p.text}`} className="flex items-center gap-3 py-2">
                    <LangBadge lang={p.lang} />
                    <span className="flex-1 text-sm text-gray-800" dir={p.lang === 'ar' ? 'rtl' : 'ltr'}>{p.text}</span>
                    {isCurrent(p) ? <span className="text-xs text-blue-700 font-semibold">Recording…</span>
                      : isQueued(p) ? <span className="text-xs text-gray-500">In queue</span>
                      : file && takeOf(p) ? <TakeReview compact onPlay={(which) => playTake(p, which)} onKeep={(keep) => keepTake(p, keep)} />
                      : file ? (
                        <span className="flex gap-1">
                          <button onClick={() => playClip(p, file)} title="Play" className="px-2 py-1 text-sm rounded hover:bg-gray-100">▶</button>
                          <button onClick={() => generate([p], true)} disabled={!installed} title="Record again" className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">🔁</button>
                          <button onClick={() => remove(p)} title="Delete recording" className="px-2 py-1 text-sm rounded hover:bg-gray-100">🗑</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-amber-700">Not recorded</span>
                          <button onClick={() => generate([p])} disabled={!installed} className="px-2 py-1 text-xs bg-teal text-white rounded disabled:opacity-40">Record</button>
                        </span>
                      )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {voices.length > 0 && (
        <VoiceBrowser key={callsVoice} voices={voices} defaultVoice={callsVoice} installed={installed} engine={engine} onChanged={loadEngine} />
      )}
    </div>
  );
}
