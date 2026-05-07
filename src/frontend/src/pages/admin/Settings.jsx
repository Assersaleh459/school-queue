import { useState, useEffect } from 'react';
import { adminAPI } from '../../lib/api';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminAPI.getSettings()
      .then(res => {
        const obj = {};
        res.data.forEach(s => { obj[s.setting_key] = s.setting_value; });
        setSettings(obj);
      })
      .catch(() => {});
  }, []);

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminAPI.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold text-navy mb-6">System Settings</h2>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Branding */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-navy mb-4 pb-2 border-b">School Branding</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">School Name</label>
              <input
                type="text"
                value={settings.school_name || ''}
                onChange={e => set('school_name', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Primary Color</label>
              <input
                type="color"
                value={settings.primary_color || '#19224A'}
                onChange={e => set('primary_color', e.target.value)}
                className="w-full h-10 border rounded-lg cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">School Logo</label>
            <div className="flex items-center gap-4">
              {settings.school_logo && (
                <img src={settings.school_logo} alt="School logo" className="h-16 w-16 object-contain rounded-lg border" />
              )}
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return; }
                    const reader = new FileReader();
                    reader.onload = ev => set('school_logo', ev.target.result);
                    reader.readAsDataURL(file);
                  }}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal file:text-white file:font-semibold hover:file:bg-opacity-90 cursor-pointer"
                />
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG — max 2MB. Shown on the public display screen.</p>
              </div>
              {settings.school_logo && (
                <button type="button" onClick={() => set('school_logo', '')} className="text-red-500 text-sm hover:underline">Remove</button>
              )}
            </div>
          </div>
        </section>

        {/* Working Hours */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-navy mb-4 pb-2 border-b">Working Hours</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Opening Time</label>
              <input
                type="time"
                value={settings.working_hours_start || '08:00'}
                onChange={e => set('working_hours_start', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Closing Time</label>
              <input
                type="time"
                value={settings.working_hours_end || '15:00'}
                onChange={e => set('working_hours_end', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>
        </section>

        {/* Queue Config */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-navy mb-4 pb-2 border-b">Queue Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Max Wait Alert (minutes)</label>
              <input
                type="number"
                min="1"
                value={settings.max_wait_alert_minutes || 30}
                onChange={e => set('max_wait_alert_minutes', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">No-Show After X Calls</label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.no_show_after_calls || 3}
                onChange={e => set('no_show_after_calls', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>
        </section>

        {/* Audio */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-navy mb-4 pb-2 border-b">Audio &amp; Announcement Settings</h3>
          <div className="space-y-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.audio_enabled === 'true'}
                onChange={e => set('audio_enabled', e.target.checked ? 'true' : 'false')}
                className="w-5 h-5 rounded"
              />
              <span className="font-semibold text-gray-700">Enable Audio Announcements on Display Monitor</span>
            </label>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Announcement Language</label>
              <p className="text-xs text-gray-500 mb-3">Controls the language of ticket call voice announcements on the display screen.</p>
              <div className="flex gap-3">
                {[
                  { value: 'en',   label: 'English',       flag: '🇬🇧' },
                  { value: 'ar',   label: 'Arabic (عربي)',  flag: '🇪🇬' },
                  { value: 'both', label: 'Both',           flag: '🔀' }
                ].map(opt => (
                  <label
                    key={opt.value}
                    className={`flex-1 flex items-center justify-center gap-2 border-2 rounded-xl py-3 cursor-pointer transition-all font-semibold text-sm
                      ${(settings.announcement_language || 'en') === opt.value
                        ? 'border-teal bg-teal bg-opacity-10 text-navy'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                  >
                    <input
                      type="radio"
                      name="announcement_language"
                      value={opt.value}
                      checked={(settings.announcement_language || 'en') === opt.value}
                      onChange={e => set('announcement_language', e.target.value)}
                      className="sr-only"
                    />
                    <span>{opt.flag}</span>
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Voice Templates */}
        <section className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-navy mb-1 pb-2 border-b">Voice Announcement Templates</h3>
          <p className="text-xs text-gray-500 mb-4">
            Customize exactly what is spoken when a ticket is called. Leave empty to use the built-in default.
            <br />
            Variables: <code className="bg-gray-100 px-1 rounded font-mono">{'{ticket}'}</code> = ticket number,{' '}
            <code className="bg-gray-100 px-1 rounded font-mono">{'{department}'}</code> = department name.
          </p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">🇬🇧 English — When called</label>
              <input
                type="text"
                value={settings.call_template_en || ''}
                onChange={e => set('call_template_en', e.target.value)}
                placeholder="Attention please. Number {ticket}, {department}. Please come to the counter."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">🇬🇧 English — Final recall</label>
              <input
                type="text"
                value={settings.recall_template_en || ''}
                onChange={e => set('recall_template_en', e.target.value)}
                placeholder="Final call. Number {ticket}, {department}. Please come forward immediately."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">🇪🇬 Arabic — When called</label>
              <input
                type="text"
                value={settings.call_template_ar || ''}
                onChange={e => set('call_template_ar', e.target.value)}
                dir="rtl"
                placeholder="انتباه. رقم {ticket}، {department}. يرجى التوجه إلى الكاونتر."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal text-sm text-right"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">🇪🇬 Arabic — Final recall</label>
              <input
                type="text"
                value={settings.recall_template_ar || ''}
                onChange={e => set('recall_template_ar', e.target.value)}
                dir="rtl"
                placeholder="آخر نداء. رقم {ticket}، {department}. يرجى التوجه فوراً."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal text-sm text-right"
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-teal text-white py-3 rounded-xl hover:bg-opacity-90 font-bold text-lg disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Settings'}
        </button>
      </form>
    </div>
  );
}
