import { useState, useEffect } from 'react';
import { adminAPI, voiceAPI, settingsAPI } from '../../lib/api';
import { toast } from '../../store/useToastStore';
import { useLiveRefresh } from '../../lib/useLiveRefresh';
import { onServerEvent } from '../../lib/serverLink';
import { announcementTexts, clipKey, phraseUrl, unrecordedTexts } from '../../lib/voiceClips';

const EMPTY = { message_text: '', message_text_ar: '', speak_language: 'en', display_order: '', is_active: true, repeat_count: 1, repeat_gap_minutes: 5 };

const LANG_LABELS = { en: 'EN', ar: 'AR', both: 'EN+AR' };
const LANG_COLORS = { en: 'bg-blue-100 text-blue-700', ar: 'bg-green-100 text-green-800', both: 'bg-purple-100 text-purple-700' };

function playTTS(text, lang) {
  return new Promise((resolve) => {
    const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`);
    audio.addEventListener('ended', resolve, { once: true });
    audio.addEventListener('error', () => {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
        u.addEventListener('end',   resolve, { once: true });
        u.addEventListener('error', resolve, { once: true });
        window.speechSynthesis.speak(u);
      } else {
        resolve();
      }
    }, { once: true });
    audio.play().catch(() => audio.dispatchEvent(new Event('error')));
  });
}

// Plays a recorded clip to the end ('ended', not play() — that resolves on start)
function playUrl(src) {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.addEventListener('ended', resolve, { once: true });
    audio.addEventListener('error', resolve, { once: true });
    audio.play().catch(resolve);
  });
}

// ▶ preview: the announcement voice's recording when there is one, else the online voice
async function preview(a) {
  let voice = {};
  try { const m = (await voiceAPI.manifest()).data || {}; voice = m.announce || m; } catch {}
  for (const t of announcementTexts(a)) {
    const file = voice[t.lang]?.[clipKey(t.text)];
    await (file ? playUrl(phraseUrl(voice, file)) : playTTS(t.text, t.lang));
  }
}

// "recorded" voice mode: { voice, manifest } of the announcement voice; null in "online" mode
async function loadRecordedVoice() {
  const [pub, man] = await Promise.all([settingsAPI.getPublic(), voiceAPI.manifest()]);
  if (pub.data?.voice_mode === 'online') return null;
  const m = man.data || {};
  const a = m.announce || m;
  return { voice: a.voice || m.voice || 'Sarah', manifest: a };
}

const notRecordedHint = (voice) => `Not recorded in the ${voice} voice yet, so the display reads it with the online voice. Record it in Voice Recordings.`;

// announceOnly: the Home screen version (staff with the 'announcements' screen) can only announce.
// The Admin Panel version keeps add / edit / delete / preview.
export default function Announcements({ announceOnly = false }) {
  const [announcements, setAnnouncements] = useState([]);
  const [showForm, setShowForm]           = useState(false);
  const [editing, setEditing]             = useState(null);
  const [form, setForm]                   = useState(EMPTY);
  const [error, setError]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [testing, setTesting]             = useState(false);
  const [recorded, setRecorded]           = useState(null);   // see loadRecordedVoice
  const [series, setSeries]               = useState(null);   // the 📢 series repeating now: { announcement_id, done, total, next_at } or null

  const loadVoice = () => loadRecordedVoice().then(v => { setRecorded(v); return v; }).catch(() => null);
  const loadSeries = () => voiceAPI.announceStatus().then(r => setSeries(r.data || null)).catch(() => {});
  useEffect(() => { load(); loadVoice(); loadSeries(); }, []);

  // Recordings finish in the background and the list can change on another screen: reload when
  // the server says so (one reload per burst of finished clips) and when it comes back
  useLiveRefresh(['voice_updated', 'announcements_updated', 'settings_updated'], () => { load(); loadVoice(); loadSeries(); });
  const notRecorded = (a, v = recorded) => !!v && unrecordedTexts(a, v.manifest).length > 0;

  // 🔁 badge: the server broadcasts every change of the running series; a 30 s tick keeps "next in N min" right
  useEffect(() => {
    const off = onServerEvent('announcement_series', (sr) => setSeries(sr || null));
    const t = setInterval(() => setSeries(sr => (sr ? { ...sr } : sr)), 30000);
    return () => { off(); clearInterval(t); };
  }, []);
  const nextIn = (sr) => Math.max(1, Math.round((new Date(sr.next_at) - Date.now()) / 60000));
  const repeating = (a) => series?.announcement_id === a.announcement_id;

  const load = () => adminAPI.getAnnouncements().then(r => setAnnouncements(r.data)).catch(() => {});

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setShowForm(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      message_text:    a.message_text,
      message_text_ar: a.message_text_ar || '',
      speak_language:  a.speak_language || 'en',
      display_order:   a.display_order,
      is_active:       !!a.is_active,
      repeat_count:    a.repeat_count || 1,
      repeat_gap_minutes: a.repeat_gap_minutes || 5,
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        message_text_ar: form.message_text_ar || null,
        display_order:   parseInt(form.display_order) || 99,
        repeat_count:    parseInt(form.repeat_count) || 1,
        repeat_gap_minutes: parseInt(form.repeat_gap_minutes) || 5,
      };
      if (editing) {
        await adminAPI.updateAnnouncement(editing.announcement_id, payload);
      } else {
        await adminAPI.createAnnouncement(payload);
      }
      setShowForm(false);
      load();
      const v = await loadVoice();
      if (notRecorded(payload, v)) toast.info(`Saved. ${notRecordedHint(v.voice)}`, 8000);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a) => {
    if (!confirm(`Delete announcement "${a.message_text}"?`)) return;
    await adminAPI.deleteAnnouncement(a.announcement_id);
    load();
  };

  const handleTest = async () => {
    if (!form.message_text) return;
    setTesting(true);
    await preview(form);
    setTesting(false);
  };

  // ⏹ Stop repeating (a repeat already playing on the display finishes)
  const handleStop = async () => {
    try {
      await voiceAPI.announceStop();
      setSeries(null);
      toast.info('Stopped repeating');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not stop');
    }
  };

  const repeats = parseInt(form.repeat_count) > 1;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-navy">Announcements ({announcements.length})</h2>
        {!announceOnly && (
          <button
            onClick={openCreate}
            className="bg-teal text-white px-5 py-2 rounded-lg hover:bg-opacity-90 font-semibold"
          >
            + Add Announcement
          </button>
        )}
      </div>

      <div className="space-y-3">
        {announcements.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400">
            {announceOnly ? 'No announcements yet. Ask an administrator to add them.' : 'No announcements yet. Add one to show it on the display monitor.'}
          </div>
        )}
        {announcements.map(a => (
          <div
            key={a.announcement_id}
            className={`bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 ${!a.is_active ? 'opacity-50' : ''}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${LANG_COLORS[a.speak_language || 'en']}`}>
                  {LANG_LABELS[a.speak_language || 'en']}
                </span>
                <p className="font-semibold text-gray-800 truncate">{a.message_text}</p>
                {notRecorded(a) && (
                  <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800" title={notRecordedHint(recorded.voice)}>
                    🎙 Not recorded
                  </span>
                )}
                {repeating(a) && (
                  <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-teal bg-opacity-10 text-navy" title="This announcement is repeating on the display">
                    🔁 Repeating · {series.done} of {series.total} · next in {nextIn(series)} min
                  </span>
                )}
              </div>
              {a.message_text_ar && (
                <p className="text-sm text-gray-500 mt-0.5 text-right font-arabic" dir="rtl">{a.message_text_ar}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Order: {a.display_order} · {a.repeat_count > 1 ? `Repeats ${a.repeat_count}× every ${a.repeat_gap_minutes} min · ` : ''}{a.is_active ? 'Showing on display' : 'Hidden'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {repeating(a) && (
                <button
                  onClick={handleStop}
                  className="px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600"
                  title="Stop repeating this announcement"
                >
                  ⏹ Stop
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    const r = await voiceAPI.announce(a.announcement_id);
                    const n = r.data?.repeat_count || 1;
                    toast.success(n > 1 ? `Announcing ${n} times, every ${r.data.repeat_gap_minutes} min` : 'Announced on the display');
                  } catch (err) {
                    toast.error(err.response?.data?.error || 'Could not announce');
                  }
                }}
                className="px-3 py-1 bg-navy text-white rounded text-sm hover:bg-opacity-80"
                title="Announce on display now (recorded voice if available — see Voice Recordings)"
              >
                {announceOnly ? '📢 Announce' : '📢'}
              </button>
              {!announceOnly && <>
              <button
                onClick={() => preview(a)}
                className="px-3 py-1 bg-teal text-white rounded text-sm hover:bg-opacity-80"
                title="Preview voice"
              >
                ▶
              </button>
              <button
                onClick={() => openEdit(a)}
                className="px-3 py-1 bg-navy text-white rounded text-sm hover:bg-opacity-80"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(a)}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                Delete
              </button>
              </>}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">{editing ? 'Edit Announcement' : 'Add Announcement'}</h2>
            <form onSubmit={handleSave} className="space-y-4">

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">English Text *</label>
                <textarea
                  value={form.message_text}
                  onChange={e => set('message_text', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal resize-none"
                  placeholder="e.g. Please have your documents ready when called."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Arabic Text (اختياري)</label>
                <textarea
                  value={form.message_text_ar}
                  onChange={e => set('message_text_ar', e.target.value)}
                  rows={2}
                  dir="rtl"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal resize-none text-right font-arabic"
                  placeholder="مثال: يرجى إحضار المستندات اللازمة عند النداء."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Voice Language</label>
                <div className="flex gap-2">
                  {[
                    { value: 'en',   label: '🇬🇧 English' },
                    { value: 'ar',   label: '🇪🇬 Arabic' },
                    { value: 'both', label: '🔀 Both' }
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`relative flex-1 text-center border-2 rounded-lg py-2 cursor-pointer text-sm font-semibold transition-all
                        ${form.speak_language === opt.value
                          ? 'border-teal bg-teal bg-opacity-10 text-navy'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      <input
                        type="radio"
                        name="speak_language"
                        value={opt.value}
                        checked={form.speak_language === opt.value}
                        onChange={e => set('speak_language', e.target.value)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={form.display_order}
                    onChange={e => set('display_order', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => set('is_active', e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-semibold text-gray-700">Show on display</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Repeat (times)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.repeat_count}
                    onChange={e => set('repeat_count', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-semibold mb-1 ${repeats ? 'text-gray-700' : 'text-gray-400'}`}>Gap between repeats (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={form.repeat_gap_minutes}
                    disabled={!repeats}
                    onChange={e => set('repeat_gap_minutes', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                {repeats
                  ? `📢 says it ${form.repeat_count} times, ${form.repeat_gap_minutes} min apart. A ticket call is never cut: the announcement waits for it, or plays again after it.`
                  : '📢 says it once. Set Repeat to 2 or more to say it again after a gap.'}
              </p>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !form.message_text}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 disabled:opacity-50 text-sm"
                >
                  {testing ? '...' : '▶ Test Voice'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-teal text-white py-2 rounded-lg font-semibold hover:bg-opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
