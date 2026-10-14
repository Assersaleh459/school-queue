// Listen & fix: every clip a voice has (315 numbers + phrases) — play, flag "sounds bad",
// redo, and compare a new take with the old one before it goes live.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { voiceAPI } from '../../lib/api';
import { clipId, clipUrls } from '../../lib/voiceBrowse';
import { toast } from '../../store/useToastStore';

const NUMBER_GROUPS = [
  { lang: 'ar', kind: 'n',  title: 'Arabic numbers',    hint: '1–99' },
  { lang: 'ar', kind: 'wn', title: 'Arabic «و» numbers', hint: 'after a hundred — e.g. 125 = مئة «وخمسة وعشرون»' },
  { lang: 'ar', kind: 'h',  title: 'Arabic hundreds',   hint: '100–900' },
  { lang: 'en', kind: 'n',  title: 'English numbers',   hint: '1–99' },
  { lang: 'en', kind: 'h',  title: 'English hundreds',  hint: '100–900' },
];

const jobId = (j) => (j.number ? `n:${j.lang}/${j.number.kind}/${j.number.n}` : `p:${j.lang}:${j.text}`);
const asItem = (c) => (c.kind ? { lang: c.lang, kind: c.kind, n: c.n } : { lang: c.lang, text: c.text });
const nameOf = (c) => (c.kind
  ? `${c.lang === 'ar' ? 'Arabic' : 'English'} ${c.kind === 'wn' ? `«و» ${c.n}` : c.n}`
  : c.text);

// "New take ready — ▶ Old ▶ New · Keep new · Keep old"
export function TakeReview({ onPlay, onKeep, compact = false }) {
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="text-blue-700 font-semibold mr-1">New take ready</span>
      <button onClick={() => onPlay('current')} className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 active:scale-95 transition">▶ Old</button>
      <button onClick={() => onPlay('take')} className="px-2 py-1 rounded border border-blue-300 text-blue-800 hover:bg-blue-50 active:scale-95 transition">▶ New</button>
      <button onClick={() => onKeep('new')} className="px-2.5 py-1 rounded bg-teal text-white font-semibold hover:bg-opacity-90 active:scale-95 transition">Keep new</button>
      <button onClick={() => onKeep('old')} className="px-2.5 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-95 transition">Keep old</button>
    </span>
  );
}

export default function VoiceBrowser({ voices, defaultVoice, installed, engine, onChanged }) {
  const [voice, setVoice]       = useState(defaultVoice);
  const [data, setData]         = useState(null);
  const [stamp, setStamp]       = useState(0);
  const [filter, setFilter]     = useState('all');          // all | flagged | takes
  const [selected, setSelected] = useState(null);           // clip id
  const [playing, setPlaying]   = useState(null);           // clip id being heard
  const [through, setThrough]   = useState(null);           // group key while playing a group through
  const player = useRef(null);
  const gap = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await voiceAPI.clips(voice);
      setData(r.data);
      setStamp(Date.now());
    } catch {
      setData({ voice, numbers: [], phrases: [] });
    }
  }, [voice]);

  // reload on voice change and whenever the engine finishes a clip
  useEffect(() => { load(); }, [load, engine?.done]);

  const busy = new Map();
  for (const j of engine?.queue || []) if (j.voice === voice) busy.set(jobId(j), 'queued');
  if (engine?.current?.voice === voice) busy.set(jobId(engine.current), 'recording');

  const all = useMemo(() => (data ? [...data.phrases, ...data.numbers] : []), [data]);
  const byId = useMemo(() => new Map(all.map(c => [clipId(c), c])), [all]);
  const flagged = all.filter(c => c.flagged);
  const takes = all.filter(c => c.take);
  const visible = (c) => (filter === 'flagged' ? c.flagged : filter === 'takes' ? c.take : true);
  const sel = selected && byId.get(selected);

  // ── Playing ──
  const stop = useCallback(() => {
    clearTimeout(gap.current);
    player.current?.pause();
    player.current = null;
    setPlaying(null);
    setThrough(null);
  }, []);

  const play = useCallback((c, which = 'current', onEnd) => {
    player.current?.pause();
    const a = new Audio(clipUrls(voice, c, stamp)[which]);
    player.current = a;
    setPlaying(clipId(c));
    a.onended = () => { if (player.current === a) { setPlaying(null); onEnd?.(); } };
    a.play().catch(() => { setPlaying(null); toast.error('Could not play this clip'); });
  }, [voice, stamp]);

  // Play a group through, one clip after another — flag the bad ones as you hear them
  const playFrom = (group, clips, i) => {
    const c = clips[i];
    if (!c) { setThrough(null); return; }
    setThrough(group);
    setSelected(clipId(c));
    play(c, 'current', () => { gap.current = setTimeout(() => playFrom(group, clips, i + 1), 350); });
  };
  const playThrough = (group, clips) => {
    const list = clips.filter(c => c.recorded !== false);
    playFrom(group, list, Math.max(0, list.findIndex(c => clipId(c) === selected)));
  };

  useEffect(() => () => { clearTimeout(gap.current); player.current?.pause(); }, []);

  // ── Actions ──
  const toggleFlag = async (c) => {
    try {
      await voiceAPI.flag(voice, [asItem(c)], !c.flagged);
      setData(d => ({
        ...d,
        numbers: d.numbers.map(x => (clipId(x) === clipId(c) ? { ...x, flagged: !c.flagged } : x)),
        phrases: d.phrases.map(x => (clipId(x) === clipId(c) ? { ...x, flagged: !c.flagged } : x)),
      }));
    } catch {
      toast.error('Could not save the flag');
    }
  };

  const redo = async (clips) => {
    try {
      const r = await voiceAPI.generate(clips.map(asItem), true, voice);
      const n = r.data.queued;
      toast.success(!n ? 'Already in the queue'
        : clips.every(c => c.recorded !== false)
          ? `${n} new take${n > 1 ? 's' : ''} queued — the current recording${n > 1 ? 's stay' : ' stays'} in use until you keep the new one`
          : `${n} recording${n > 1 ? 's' : ''} queued`);
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not queue the redo');
    }
  };

  const keep = async (c, which) => {
    try {
      await voiceAPI.keepTakes(voice, [asItem(c)], which);
      toast.success(which === 'new' ? 'New take is now in use' : 'Kept the old recording');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not keep the take');
    }
  };

  const restore = async (c) => {
    if (!confirm(`Go back to the original ${nameOf(c)} that came with SchoolQ?`)) return;
    try {
      await voiceAPI.restore(voice, c);
      toast.success('Original recording restored');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not restore');
    }
  };

  const select = (c) => {
    clearTimeout(gap.current);
    setThrough(null);
    setSelected(clipId(c));
    if (c.recorded !== false) play(c);
  };

  // Keyboard: ← → move & play, F flag, Esc stop
  useEffect(() => {
    const onKey = (e) => {
      if (!sel || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFlag(sel); }
      else if (e.key === 'Escape') stop();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const list = all.filter(c => visible(c) && c.recorded !== false && (sel.kind ? c.lang === sel.lang && c.kind === sel.kind : !c.kind));
        const i = list.findIndex(c => clipId(c) === selected) + (e.key === 'ArrowRight' ? 1 : -1);
        if (list[i]) { e.preventDefault(); select(list[i]); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Render ──
  const chipClass = (c) => {
    const id = clipId(c);
    const state = busy.get(id);
    return [
      'relative h-9 rounded-md text-sm font-semibold tabular-nums transition-all duration-150 active:scale-95',
      c.recorded === false ? 'border border-dashed border-gray-300 text-gray-300 hover:text-gray-500'
        : c.flagged ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
        : 'bg-gray-50 text-gray-800 border border-gray-200 hover:bg-gray-100',
      selected === id ? 'ring-2 ring-teal ring-offset-1' : '',
      playing === id ? 'bg-teal/10' : '',
      state ? 'animate-pulse' : '',
    ].join(' ');
  };

  const Dots = ({ c }) => (
    <span className="absolute top-0.5 right-0.5 flex gap-0.5">
      {c.take && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="New take ready" />}
      {c.edited && <span className="w-1.5 h-1.5 rounded-full bg-gray-400" title="Re-recorded" />}
    </span>
  );

  const phrases = data ? data.phrases.filter(visible) : [];

  return (
    <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h3 className="text-lg font-bold text-navy mr-auto">Listen &amp; fix</h3>
        <select value={voice} onChange={e => { stop(); setData(null); setSelected(null); setVoice(e.target.value); }} className="px-3 py-1.5 border rounded-lg text-sm" aria-label="Voice">
          {voices.map(v => <option key={v.name} value={v.name}>{v.name}{v.active ? ' (calls)' : ''}{v.announcing ? ' (announcements)' : ''}</option>)}
        </select>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Click a clip to hear it (← → for the next one). Mark the ones that sound wrong with <b>⚑</b> (or press <b>F</b>), then redo them.
        A redo is a new take — the old recording stays in use until you choose <b>Keep new</b>.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm" role="tablist">
          {[['all', 'All'], ['flagged', `⚑ Flagged (${flagged.length})`], ['takes', `New takes (${takes.length})`]].map(([k, text]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-md transition-colors ${filter === k ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {text}
            </button>
          ))}
        </div>
        {flagged.length > 0 && (
          <button onClick={() => redo(flagged)} disabled={!installed}
            className="ml-auto px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 active:scale-95 transition disabled:opacity-40">
            🔁 Redo flagged ({flagged.length})
          </button>
        )}
      </div>

      {!data ? (
        <div className="animate-pulse space-y-3">{[1, 2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-5">
          {/* Phrases */}
          {(phrases.length > 0 || filter === 'all') && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-bold text-navy">Phrases &amp; announcements</h4>
                <span className="text-xs text-gray-400">{phrases.length}</span>
              </div>
              {phrases.length === 0 ? <p className="text-xs text-gray-400">None recorded in {voice} yet.</p> : (
                <ul className="divide-y border rounded-lg">
                  {phrases.map(c => {
                    const id = clipId(c);
                    const state = busy.get(id);
                    return (
                      <li key={id}>
                        <button onClick={() => select(c)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${selected === id ? 'bg-teal/10' : 'hover:bg-gray-50'}`}>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-navy text-teal">{c.lang.toUpperCase()}</span>
                          <span className="flex-1 truncate" dir={c.lang === 'ar' ? 'rtl' : 'ltr'}>{c.text}</span>
                          {playing === id && <span className="text-teal text-xs">♪</span>}
                          {state && <span className="text-xs text-blue-700">{state === 'recording' ? 'Recording…' : 'In queue'}</span>}
                          {c.take && <span className="text-xs text-blue-700 font-semibold">New take</span>}
                          {c.flagged && <span className="text-amber-600">⚑</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Numbers */}
          {NUMBER_GROUPS.map(g => {
            const clips = data.numbers.filter(c => c.lang === g.lang && c.kind === g.kind);
            const shown = clips.filter(visible);
            if (!shown.length && filter !== 'all') return null;
            const recorded = clips.filter(c => c.recorded).length;
            const group = `${g.lang}-${g.kind}`;
            const playingHere = through === group;
            return (
              <div key={group}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h4 className="text-sm font-bold text-navy">{g.title}</h4>
                  <span className="text-xs text-gray-400" dir="auto">{g.hint}</span>
                  {recorded < clips.length && <span className="text-xs text-amber-700">{recorded}/{clips.length} recorded</span>}
                  <button onClick={() => (playingHere ? stop() : playThrough(group, shown))} disabled={!recorded}
                    className="ml-auto px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-95 transition disabled:opacity-40">
                    {playingHere ? '■ Stop' : '▶ Play all'}
                  </button>
                </div>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(3.25rem, 1fr))' }}>
                  {shown.map(c => (
                    <button key={clipId(c)} onClick={() => select(c)} className={chipClass(c)}
                      title={nameOf(c)} aria-label={nameOf(c)}>
                      {c.kind === 'wn' ? <span><span className="text-gray-400 font-normal">و</span>{c.n}</span> : c.n}
                      <Dots c={c} />
                      {c.flagged && <span className="absolute -top-1 -left-1 text-[10px]">⚑</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {filter !== 'all' && !all.some(visible) && (
            <p className="text-sm text-gray-500">{filter === 'flagged' ? 'Nothing flagged.' : 'No new takes waiting.'}</p>
          )}

          <p className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />new take ready</span>
            <span><span className="text-amber-600">⚑</span> sounds bad</span>
            {voice === 'Sarah' && <span><span className="inline-block w-2 h-2 rounded-full bg-gray-400 mr-1" />re-recorded (replaces the original)</span>}
          </p>
        </div>
      )}

      {/* Selected clip */}
      {sel && (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="font-semibold text-navy mr-2 truncate max-w-xs" dir="auto">{nameOf(sel)}</span>
          {busy.get(selected) ? (
            <span className="text-sm text-blue-700">{busy.get(selected) === 'recording' ? 'Recording a new take…' : 'New take in queue…'}</span>
          ) : sel.take ? (
            <TakeReview onPlay={(which) => play(sel, which)} onKeep={(which) => keep(sel, which)} />
          ) : (
            <>
              {sel.recorded !== false && (
                <button onClick={() => (playing === selected ? stop() : play(sel))}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 active:scale-95 transition">
                  {playing === selected ? '■ Stop' : '▶ Play'}
                </button>
              )}
              <button onClick={() => toggleFlag(sel)} aria-pressed={!!sel.flagged}
                className={`px-3 py-1.5 rounded-lg text-sm active:scale-95 transition ${sel.flagged ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'border border-gray-300 hover:bg-gray-50'}`}>
                ⚑ {sel.flagged ? 'Flagged' : 'Sounds bad'}
              </button>
              <button onClick={() => redo([sel])} disabled={!installed}
                className="px-3 py-1.5 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-opacity-90 active:scale-95 transition disabled:opacity-40">
                🔁 {sel.recorded === false ? 'Record' : 'Redo'}
              </button>
              {sel.edited && (
                <button onClick={() => restore(sel)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition">
                  ↺ Original
                </button>
              )}
            </>
          )}
          {through && <span className="ml-auto text-xs text-gray-500">Playing through — press <b>F</b> to flag, <b>Esc</b> to stop</span>}
        </div>
      )}
    </section>
  );
}
