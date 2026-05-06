import { useState, useEffect } from 'react';
import { adminAPI } from '../../lib/api';

const EMPTY = { message_text: '', message_text_ar: '', speak_language: 'en', display_order: '', is_active: true };

const LANG_LABELS = { en: 'EN', ar: 'AR', both: 'EN+AR' };
const LANG_COLORS = { en: 'bg-blue-100 text-blue-700', ar: 'bg-green-100 text-green-800', both: 'bg-purple-100 text-purple-700' };

async function playTTS(text, lang) {
  try {
    const url = `/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`;
    const audio = new Audio(url);
    await audio.play();
  } catch {
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'ar' ? 'ar-EG' : 'en-US';
      window.speechSynthesis.speak(u);
    }
  }
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [showForm, setShowForm]           = useState(false);
  const [editing, setEditing]             = useState(null);
  const [form, setForm]                   = useState(EMPTY);
  const [error, setError]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [testing, setTesting]             = useState(false);

  useEffect(() => { load(); }, []);

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
      is_active:       !!a.is_active
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
        display_order:   parseInt(form.display_order) || 99
      };
      if (editing) {
        await adminAPI.updateAnnouncement(editing.announcement_id, payload);
      } else {
        await adminAPI.createAnnouncement(payload);
      }
      setShowForm(false);
      load();
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
    const text = form.speak_language === 'ar' ? (form.message_text_ar || form.message_text) : form.message_text;
    const lang = form.speak_language === 'ar' ? 'ar' : 'en';
    if (!text) return;
    setTesting(true);
    await playTTS(text, lang);
    setTesting(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-navy">Announcements ({announcements.length})</h2>
        <button
          onClick={openCreate}
          className="bg-teal text-white px-5 py-2 rounded-lg hover:bg-opacity-90 font-semibold"
        >
          + Add Announcement
        </button>
      </div>

      <div className="space-y-3">
        {announcements.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400">
            No announcements yet. Add one to show it on the display monitor.
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
              </div>
              {a.message_text_ar && (
                <p className="text-sm text-gray-500 mt-0.5 text-right font-arabic" dir="rtl">{a.message_text_ar}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Order: {a.display_order} · {a.is_active ? 'Showing on display' : 'Hidden'}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={async () => {
                  const text = (a.speak_language === 'ar' && a.message_text_ar) ? a.message_text_ar : a.message_text;
                  const lang = a.speak_language === 'ar' ? 'ar' : 'en';
                  await playTTS(text, lang);
                }}
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
                      className={`flex-1 text-center border-2 rounded-lg py-2 cursor-pointer text-sm font-semibold transition-all
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
