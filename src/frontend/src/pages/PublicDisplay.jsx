import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useMonitorSocket } from '../lib/useSocket';
import TicketNumber from '../components/TicketNumber';
import { DEFAULT_TEMPLATES, buildPlan, announcementTexts, clipKey, phraseUrl } from '../lib/voiceClips';

// ── helpers ───────────────────────────────────────────────────────────────────

function sleep(ms, signal) {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

function pickVoice(lang) {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices
    .filter(v => lang === 'ar' ? v.lang.startsWith('ar') : v.lang.startsWith('en'))
    .sort((a, b) => {
      const score = v =>
        (v.name.includes('Neural') || v.name.includes('Online') || v.name.includes('Natural')) ? 2 :
        (!v.localService) ? 1 : 0;
      return score(b) - score(a);
    })[0] || null;
}

// ── TTS ───────────────────────────────────────────────────────────────────────
// Backend /api/tts is primary (Azure if key set, else Google TTS).
// Web Speech API is fallback — on Edge/Windows, online Neural voices are free.

async function playTTS(text, lang, signal) {
  if (signal?.aborted) return;
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 12000); // hard failsafe
    const done = () => { clearTimeout(timeout); resolve(); };

    const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`);

    signal?.addEventListener('abort', () => { audio.pause(); audio.src = ''; done(); }, { once: true });
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', () => {
      if (!window.speechSynthesis || signal?.aborted) return done();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
      u.rate = 0.85;
      u.addEventListener('end',   done, { once: true });
      u.addEventListener('error', done, { once: true });
      signal?.addEventListener('abort', () => { window.speechSynthesis.cancel(); done(); }, { once: true });
      window.speechSynthesis.speak(u);
    }, { once: true });

    audio.play().catch(() => audio.dispatchEvent(new Event('error')));
  });
}

// ── Recorded clips (offline voice) ────────────────────────────────────────────
// Clips are created up front so they buffer while earlier ones play — joins stay tight.

function loadClip(src) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  return audio;
}

// Resolves on 'ended' (play() resolves when playback merely starts). A missing or
// broken clip is skipped rather than stalling the call.
function playClip(audio, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, 8000); // hard failsafe
    function done() { clearTimeout(timeout); resolve(); }
    signal?.addEventListener('abort', () => { audio.pause(); audio.src = ''; done(); }, { once: true });
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    audio.play().catch(done);
  });
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function toArabicNumerals(str) {
  return String(str).replace(/[0-9]/g, d => AR_DIGITS[d]);
}

function applyVars(template, number, department, lang, departmentAr, room) {
  const dept   = (lang === 'ar' && departmentAr) ? departmentAr : department;
  const numStr = lang === 'ar' ? toArabicNumerals(number) : String(number);
  return template
    .replace(/{ticket}/g,     numStr)
    .replace(/{number}/g,     numStr)
    .replace(/{department}/g, dept)
    .replace(/{room}/g,       room || '');
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PublicDisplay() {
  const [departments, setDepartments]     = useState([]);
  const [displayData, setDisplayData]     = useState({});
  const [schoolName, setSchoolName]       = useState('My School');
  const [schoolLogo, setSchoolLogo]       = useState(null);
  const [currentTime, setCurrentTime]     = useState(new Date());
  const [announcements, setAnnouncements] = useState([]);
  const [announceLang, setAnnounceLang]   = useState('en');

  // All speak-relevant settings in a ref — avoids stale closures in socket handlers
  const s = useRef({ announceLang: 'en', audioEnabled: true, voiceMode: 'recorded', custom: {}, ...DEFAULT_TEMPLATES });

  // One spoken line: ticket calls first (arrival order, never cut), then announcements. A call that
  // arrives while an announcement is speaking cuts it; the announcement goes back to the front of
  // the announcement part and replays from the start after the calls.
  // Entry: { kind: 'call' | 'announcement', key, build, banner } — build() gives fresh items each
  // time (a cut clip can't be replayed). Items: { audio } recorded clip | { text, lang } TTS | { pause }
  const line    = useRef([]);     // waiting entries
  const current = useRef(null);   // { entry, ctrl } speaking now
  const bannerShown     = useRef(false);
  const mediaHeld       = useRef(false); // we paused (or checked) media for the current run of speech
  const mediaWasPlaying = useRef(false); // something was actually playing → show the banner, resume after

  // Plays one entry's items in order, respecting the abort signal.
  const playItems = useCallback(async (items, signal) => {
    for (const item of items) {
      if (signal.aborted) return;
      if (item.pause)      await sleep(item.pause, signal);
      else if (item.audio) await playClip(item.audio, signal);
      else                 await playTTS(item.text, item.lang, signal);
    }
  }, []);

  // Where the announcement part of the line starts = where the next call goes (after the last call)
  const announcementStart = () => {
    const i = line.current.findIndex(e => e.kind === 'announcement');
    return i < 0 ? line.current.length : i;
  };

  // Speaks the line until it is empty. In the SchoolQ desktop app it pauses media that is actually
  // playing (once per run, and only that) and shows a banner for the entry speaking; both are
  // undone when the line empties.
  const runLine = useCallback(async () => {
    if (current.current) return;
    const desktop = window.electronAPI;
    while (line.current.length) {
      const entry = line.current.shift();
      const ctrl = new AbortController();
      current.current = { entry, ctrl };
      if (!mediaHeld.current && s.current.mediaPause && desktop?.mediaPause) {
        mediaHeld.current = true;
        const r = await desktop.mediaPause().catch(() => null);
        mediaWasPlaying.current = (r?.paused || 0) > 0;
      }
      const mode = s.current.callBanner;
      if (entry.banner && desktop?.showBanner && (mode === 'always' || (mode !== 'never' && mediaWasPlaying.current))) {
        desktop.showBanner(entry.banner);
        bannerShown.current = true;
      }
      await playItems(entry.build(), ctrl.signal);
      current.current = null;
      // Cut by a call → replays after the calls now waiting
      if (ctrl.signal.aborted && entry.kind === 'announcement') line.current.splice(announcementStart(), 0, entry);
    }
    if (bannerShown.current) { bannerShown.current = false; desktop?.hideBanner?.(); }
    if (mediaHeld.current) {
      mediaHeld.current = false;
      mediaWasPlaying.current = false;
      await desktop?.mediaResume?.().catch(() => {});
    }
  }, [playItems]);

  const enqueue = useCallback((entry) => {
    const now = current.current?.entry;
    if (entry.kind === 'call') {
      const i = line.current.findIndex(e => e.kind === 'call' && e.key === entry.key);
      if (i >= 0) line.current[i] = entry;                       // a recall of a ticket still waiting
      else line.current.splice(announcementStart(), 0, entry);   // after the last call
      if (now?.kind === 'announcement') {                        // calls win: cut it, it replays after
        current.current.ctrl.abort();
        window.speechSynthesis?.cancel();
      }
    } else {
      const same = e => e.kind === 'announcement' && e.key === entry.key;
      if (line.current.some(same) || (now && same(now))) return; // a repeat that caught up: once is enough
      line.current.push(entry);
    }
    runLine();
  }, [runLine]);

  // Ticket call / recall
  const speak = useCallback((ticketNumber, deptName, deptNameAr, recalled, roomNumber) => {
    if (!s.current.audioEnabled) return;

    const num   = parseInt(ticketNumber.split('-').pop()) || 0;
    const langs = s.current.announceLang === 'both' ? ['en', 'ar'] : [s.current.announceLang];

    const build = () => {
      const items = [];
      for (const lang of langs) {
        const tmpl = recalled
          ? (lang === 'ar' ? s.current.recallAr : s.current.recallEn)
          : (lang === 'ar' ? s.current.callAr   : s.current.callEn);
        // Natural pause between language blocks when using "both"
        if (items.length) items.push({ pause: 700 });

        if (s.current.voiceMode === 'online') {
          items.push({ text: applyVars(tmpl, num, deptName, lang, deptNameAr, roomNumber), lang });
          continue;
        }
        // Recorded voice: numbers + this school's clips; pieces without a recording use TTS
        const department = lang === 'ar' && deptNameAr ? deptNameAr : deptName;
        for (const item of buildPlan(tmpl, { number: num, department, room: roomNumber }, lang, s.current.custom)) {
          items.push(item.src ? { audio: loadClip(item.src) } : { text: item.tts, lang });
        }
      }
      return items;
    };
    enqueue({
      kind: 'call', key: ticketNumber, build,
      banner: { kind: 'call', ticket: ticketNumber, department: deptName, departmentAr: deptNameAr, room: roomNumber, final: !!recalled },
    });
  }, [enqueue]);

  // Admin pressed "Announce on display": the announcement voice's recording if there is one
  const speakAnnouncement = useCallback((data) => {
    if (!s.current.audioEnabled) return;
    const build = () => {
      const voice = s.current.custom.announce || s.current.custom;
      const items = [];
      for (const t of announcementTexts({ message_text: data.text_en, message_text_ar: data.text_ar, speak_language: data.speak_language })) {
        if (items.length) items.push({ pause: 700 });
        const file = s.current.voiceMode !== 'online' && voice[t.lang]?.[clipKey(t.text)];
        items.push(file ? { audio: loadClip(phraseUrl(voice, file)) } : { text: t.text, lang: t.lang });
      }
      return items;
    };
    enqueue({ kind: 'announcement', key: data.text_en, build, banner: { kind: 'announcement', text: data.text_en, textAr: data.text_ar } });
  }, [enqueue]);

  const loadVoice = useCallback(async () => {
    try { const r = await axios.get('/api/voice/manifest'); s.current.custom = r.data || {}; } catch {}
  }, []);

  const onCalled   = useCallback((data) => { fetchDisplayData(); speak(data.ticket_number, data.department_name, data.department_name_ar, false, data.department_room); }, [speak]);
  const onRecalled = useCallback((data) => { speak(data.ticket_number, data.department_name, data.department_name_ar, !!data.is_final, data.department_room); }, [speak]);

  const applySettings = useCallback((data) => {
    if (data.school_name) setSchoolName(data.school_name);
    if (data.school_logo !== undefined) setSchoolLogo(data.school_logo || null);
    const lang = data.announcement_language || 'en';
    s.current.announceLang = lang;
    setAnnounceLang(lang);
    if (data.audio_enabled !== undefined) s.current.audioEnabled = data.audio_enabled !== 'false';
    s.current.voiceMode = data.voice_mode === 'online' ? 'online' : 'recorded';
    s.current.mediaPause = data.media_pause !== 'false';
    s.current.callBanner = ['always', 'never'].includes(data.call_banner) ? data.call_banner : 'media';
    if (data.call_template_en)   s.current.callEn   = data.call_template_en;
    if (data.call_template_ar)   s.current.callAr   = data.call_template_ar;
    if (data.recall_template_en) s.current.recallEn = data.recall_template_en;
    if (data.recall_template_ar) s.current.recallAr = data.recall_template_ar;
  }, []);

  const loadSettings = useCallback(async () => {
    try { const r = await axios.get('/api/settings/public'); applySettings(r.data); } catch {}
    loadVoice();
  }, [applySettings, loadVoice]);

  // Everything refreshes the moment it changes; the timers below are only a safety net
  useMonitorSocket({
    ticket_called: onCalled,
    ticket_recalled: onRecalled,
    announcement_spoken: speakAnnouncement,
    queue_updated: fetchDisplayData,
    settings_updated: loadSettings,
    voice_updated: loadVoice,
    announcements_updated: fetchAnnouncements,
    departments_updated: fetchDisplayData,
  });

  useEffect(() => {
    // Preload browser voices so they're ready on first announcement
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    loadSettings();
    fetchDisplayData();
    fetchAnnouncements();

    const t1 = setInterval(() => setCurrentTime(new Date()), 1000);
    const t2 = setInterval(fetchDisplayData,  10000);
    const t3 = setInterval(loadSettings,      30000);
    const t4 = setInterval(fetchAnnouncements, 60000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4); };
  }, [loadSettings]);

  async function fetchDisplayData() {
    try {
      const r = await axios.get('/api/display/current');
      setDepartments(r.data.departments);
      setDisplayData(r.data.display_data);
      if (r.data.school_name) setSchoolName(r.data.school_name);
    } catch {}
  }

  async function fetchAnnouncements() {
    try { const r = await axios.get('/api/announcements'); setAnnouncements(r.data); } catch {}
  }

  const tickerText = announcements.map(a => {
    const lang = a.speak_language || 'en';
    if (lang === 'ar'   && a.message_text_ar) return a.message_text_ar;
    if (lang === 'both' && a.message_text_ar) return `${a.message_text}   •   ${a.message_text_ar}`;
    return a.message_text;
  }).join('   •   ');

  const n    = departments.length;
  // More departments -> more columns, so every card keeps enough height (max 3 rows).
  const cols = n <= 1 ? 1 : n === 2 ? 2 : n === 4 ? 2 : n <= 6 ? 3 : n <= 12 ? 4 : 5;
  const rows = Math.max(1, Math.ceil(n / cols));

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden select-none">

      <header className="bg-navy text-white py-4 px-8 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          {schoolLogo
            ? <img src={schoolLogo} alt="logo" className="w-12 h-12 object-contain rounded-full bg-white p-0.5 shrink-0" />
            : <div className="w-12 h-12 bg-teal rounded-full flex items-center justify-center shrink-0">
                <span className="text-navy font-black text-lg">
                  {schoolName.split(' ').slice(0, 2).map(w => w[0]).join('')}
                </span>
              </div>
          }
          <h1 className="text-3xl font-bold tracking-wide uppercase">{schoolName}</h1>
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-mono font-bold">
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-teal text-base mt-0.5">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </header>

      <main
        className="flex-1 grid gap-4 p-4 overflow-hidden min-h-0"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {departments.map(dept => {
          const data  = displayData[dept.department_id] || {};
          const color = dept.color_code || '#5FAEB6';
          return (
            <div
              key={dept.department_id}
              className="bg-white rounded-2xl shadow-lg flex flex-col overflow-hidden min-h-0"
              style={{ borderTop: `6px solid ${color}`, containerType: 'size' }}
            >
              {/* Sizes below are min(normal size, share of the card height), so on a small screen every part
                  shrinks and a two-line name can't push "Now serving" out of the card. Big screens look as before. */}
              <div className="px-6 text-center shrink-0" style={{ backgroundColor: color + '1A', paddingBlock: 'min(0.75rem, 2.5cqh)' }}>
                {/* A long single word (ADMINISTRATION) can't wrap, so size the name to the card, never above 1.5rem.
                    shortcut: 0.95em per capital letter incl. spacing (wide fonts on some PCs); widen it if the font changes. */}
                <div style={{ containerType: 'inline-size' }}>
                  <h2
                    className="font-black tracking-wide leading-tight"
                    style={{
                      color,
                      fontSize: `min(1.5rem, 9cqh, calc(100cqw / ${Math.max(...dept.name.split(/\s+/).map(w => w.length), 1) * 0.95}))`,
                    }}
                  >
                    {dept.name.toUpperCase()}
                  </h2>
                </div>
                <p className="text-gray-400 font-semibold" style={{ fontSize: 'min(0.875rem, 5cqh)' }}>{dept.code}</p>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-0 overflow-hidden" style={{ paddingBlock: 'min(1rem, 2cqh)', gap: 'min(0.75rem, 2cqh)' }}>
                <p className="text-gray-400 uppercase tracking-widest font-semibold" style={{ fontSize: 'min(1rem, 6cqh)' }}>Now Serving</p>
                {data.current ? (
                  <>
                    <div className="w-full" style={{ color }}>
                      <TicketNumber
                        value={data.current.ticket_number}
                        maxSize={`min(${cols <= 2 ? '3.5rem' : '2.5rem'}, 14cqh)`}
                        spacing={0.05}
                        className="font-black text-center"
                      />
                    </div>
                    <p className="text-gray-500 font-semibold" style={{ fontSize: 'min(1.25rem, 7cqh)' }}>{data.counter}</p>
                  </>
                ) : (
                  <p className="text-gray-300 font-black" style={{ fontSize: 'min(2.25rem, 12cqh)' }}>— — —</p>
                )}
              </div>

              <div
                className="shrink-0 border-t border-gray-100 px-5 flex justify-between items-center"
                style={{ backgroundColor: color + '08', paddingBlock: 'min(0.75rem, 2.5cqh)' }}
              >
                <div className="text-center">
                  <p className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 'min(0.75rem, 4cqh)' }}>Next</p>
                  <p className="font-bold text-gray-700 whitespace-nowrap" style={{ fontSize: 'min(1.125rem, 7cqh)' }}>{data.next?.ticket_number || '—'}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 'min(0.75rem, 4cqh)' }}>Waiting</p>
                  <p className="font-black" style={{ color, fontSize: 'min(1.5rem, 9cqh)' }}>{data.waiting_count ?? 0}</p>
                </div>
              </div>
            </div>
          );
        })}

        {departments.length === 0 && (
          <div className="flex items-center justify-center text-gray-400 text-2xl">
            Loading queue data...
          </div>
        )}
      </main>

      {tickerText && (
        <footer className="bg-navy text-white py-3 shrink-0 overflow-hidden">
          <div className="animate-scroll whitespace-nowrap">
            <span className="text-xl font-semibold px-8" dir={announceLang === 'ar' ? 'rtl' : 'ltr'}>
              📢 {tickerText}
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
