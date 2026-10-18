// Backup & move: voices to / from a file (any PC), and the voice engine (server PC only, ~8 GB).
// The voices file can also carry the school setup the recordings belong to (call wording,
// departments, announcements, voice choices) — a recording only plays where its exact text exists.
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { unlockToken } from '../../lib/voiceLock';
import { toast } from '../../store/useToastStore';

const SETUP_PARTS = [
  { key: 'callWording',   label: 'Ticket-call wording', count: (c) => (c.callWording ? `${c.callWording} texts` : null) },
  { key: 'departments',   label: 'Departments + services', count: (c) => (c.departments ? `${c.departments} department${c.departments === 1 ? '' : 's'} · ${c.services || 0} service${c.services === 1 ? '' : 's'}` : null) },
  { key: 'announcements', label: 'Announcements', count: (c) => (c.announcements ? `${c.announcements}` : null) },
  { key: 'voices',        label: 'Voice choices', count: (c) => (c.voices ? [c.voices.voice_speaker && `calls: ${c.voices.voice_speaker}`, c.voices.voice_announce && `announcements: ${c.voices.voice_announce}`].filter(Boolean).join(' · ') || null : null) },
];
const ALL_PARTS = Object.fromEntries(SETUP_PARTS.map(p => [p.key, true]));

function setupSummary(done) {
  const bits = [];
  if (done.callWording) bits.push('call wording');
  if (done.departments) bits.push(`${done.departments} department${done.departments === 1 ? '' : 's'}`);
  if (done.services) bits.push(`${done.services} service${done.services === 1 ? '' : 's'}`);
  if (done.announcements) bits.push(`${done.announcements} announcement${done.announcements === 1 ? '' : 's'}`);
  if (done.voices?.length) bits.push('voice choices');
  return bits.join(', ');
}

function SetupChoices({ counts, value, onChange, onlyAvailable = false }) {
  const parts = SETUP_PARTS.filter(p => !onlyAvailable || p.count(counts || {}));
  if (!parts.length) return null;
  return (
    <div className="flex flex-col gap-1 mb-3">
      {parts.map(p => (
        <label key={p.key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!value[p.key]} onChange={e => onChange({ ...value, [p.key]: e.target.checked })} />
          <span className="font-medium text-navy">{p.label}</span>
          <span className="text-xs text-gray-400">{p.count(counts || {}) || 'none'}</span>
        </label>
      ))}
    </div>
  );
}

export default function VoicePack({ voices, installed, onImported }) {
  const withRecordings = voices.filter(v => v.phrases > 0 || (v.name !== 'Sarah' && v.numbers > 0));
  const [chosen, setChosen] = useState(null);           // export selection (null = all)
  const [staged, setStaged] = useState(null);           // { id, voices } after reading an import file
  const [pick, setPick] = useState({});
  const [upload, setUpload] = useState(null);           // 0..1 while sending the file
  const [engineJob, setEngineJob] = useState(null);     // { kind, progress }
  const [include, setInclude] = useState(ALL_PARTS);    // school setup to export with the voices
  const [counts, setCounts] = useState(null);           // what this school has, for the export choices
  const [pickSetup, setPickSetup] = useState({});       // school setup to bring in on import
  const enginePack = !!window.electronAPI?.enginePackAvailable?.();

  const selected = chosen ?? withRecordings.map(v => v.name);

  useEffect(() => window.electronAPI?.onEnginePackProgress?.((p) => setEngineJob(j => (j ? { ...j, progress: p } : j))), []);
  useEffect(() => { api.get('/voice/export-setup').then(r => setCounts(r.data)).catch(() => setCounts({})); }, []);

  const exportVoices = async () => {
    try {
      const r = await api.post('/voice/export-link', { voices: selected, setup: include });
      window.location.href = r.data.url;     // the browser / app saves the file
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not export');
    }
  };

  const readFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUpload(0);
    try {
      const r = await api.post('/voice/import', file, {
        headers: { 'Content-Type': 'application/octet-stream' },
        onUploadProgress: (p) => setUpload(p.total ? p.loaded / p.total : 0),
        timeout: 0,
      });
      setStaged(r.data);
      setPick(Object.fromEntries(r.data.voices.map(v => [v.name, true])));
      setPickSetup(Object.fromEntries(SETUP_PARTS.filter(p => p.count(r.data.setup || {})).map(p => [p.key, true])));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not read the file');
    } finally {
      setUpload(null);
    }
  };

  const applyImport = async () => {
    const names = staged.voices.filter(v => pick[v.name]).map(v => v.name);
    try {
      const r = await api.post(`/voice/import/${staged.id}`, { voices: names, setup: pickSetup });
      const added = setupSummary(r.data.setup || {});
      toast.success([r.data.imported.length && `Imported ${r.data.imported.join(', ')}`, added && `Added ${added}`].filter(Boolean).join(' — ') || 'Nothing new to add');
      setStaged(null);
      onImported?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    }
  };

  const engine = async (kind) => {
    setEngineJob({ kind, progress: 0 });
    const r = await (kind === 'export' ? window.electronAPI.engineExport(unlockToken()) : window.electronAPI.engineImport(unlockToken()));
    setEngineJob(null);
    if (r?.error) toast.error(r.error);
    else if (r?.ok && kind === 'export') toast.success(`Voice engine saved (${(r.bytes / 1073741824).toFixed(1)} GB)`);
    else if (r?.ok) { toast.success('Voice engine installed from the file'); onImported?.(); }
  };

  return (
    <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <h3 className="text-lg font-bold text-navy mb-1">Backup &amp; move</h3>
      <p className="text-xs text-gray-500 mb-5">
        Copy voices and the voice engine to another school's server as files — no big download and no hours of preparing voices there.
      </p>

      {/* Voices */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-bold text-navy mb-2">Export voices</h4>
          {withRecordings.length === 0 ? <p className="text-xs text-gray-400">No voice has recordings yet.</p> : (
            <>
              <div className="flex flex-col gap-1 mb-3">
                {withRecordings.map(v => (
                  <label key={v.name} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(v.name)}
                      onChange={e => setChosen(e.target.checked ? [...selected, v.name] : selected.filter(n => n !== v.name))} />
                    <span className="font-medium text-navy">{v.name}</span>
                    <span className="text-xs text-gray-400">{v.name === 'Sarah' ? `${v.phrases} phrases` : `${v.numbers}/315 numbers · ${v.phrases} phrases`}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs font-semibold text-gray-500 mt-1 mb-1">Also include, so the recordings are used at the other school:</p>
              <SetupChoices counts={counts} value={include} onChange={setInclude} />
              <button onClick={exportVoices} disabled={!selected.length}
                className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 active:scale-95 transition disabled:opacity-40">
                Export {selected.length === withRecordings.length ? 'all' : selected.length} voice{selected.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>

        <div>
          <h4 className="text-sm font-bold text-navy mb-2">Import voices</h4>
          {!staged ? (
            <>
              <p className="text-xs text-gray-500 mb-3">Choose a <span className="font-mono">.schoolq-voices</span> file — you then pick which voices to bring in.</p>
              <label className={`inline-block px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50 active:scale-95 transition cursor-pointer ${upload !== null ? 'opacity-40 pointer-events-none' : ''}`}>
                {upload !== null ? `Reading… ${Math.round(upload * 100)}%` : 'Choose file…'}
                <input type="file" accept=".schoolq-voices" onChange={readFile} className="hidden" aria-label="Voices file" />
              </label>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1 mb-3">
                {staged.voices.map(v => (
                  <label key={v.name} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!pick[v.name]} onChange={e => setPick(p => ({ ...p, [v.name]: e.target.checked }))} />
                    <span className="font-medium text-navy">{v.name}</span>
                    <span className="text-xs text-gray-400">{v.numbers}/315 numbers · {v.phrases} phrases</span>
                    {v.exists && <span className="text-xs text-amber-700">replaces this PC's {v.name}</span>}
                  </label>
                ))}
              </div>
              {staged.setup && (
                <>
                  <p className="text-xs font-semibold text-gray-500 mt-1 mb-1">School setup in this file (added; what this school already has is kept):</p>
                  <SetupChoices counts={staged.setup} value={pickSetup} onChange={setPickSetup} onlyAvailable />
                </>
              )}
              <div className="flex gap-2">
                <button onClick={applyImport} disabled={!Object.values(pick).some(Boolean) && !Object.values(pickSetup).some(Boolean)}
                  className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 active:scale-95 transition disabled:opacity-40">
                  Import
                </button>
                <button onClick={() => setStaged(null)} className="px-3 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50">Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Engine */}
      <div className="mt-6 pt-5 border-t">
        <h4 className="text-sm font-bold text-navy mb-1">Voice engine</h4>
        {!enginePack ? (
          <p className="text-xs text-gray-500">To copy the voice engine (about 8 GB) to or from a file, open this page on the server PC.</p>
        ) : engineJob ? (
          <div className="max-w-md">
            <p className="text-sm text-gray-700 mb-2">{engineJob.kind === 'export' ? 'Saving the voice engine…' : 'Installing the voice engine from the file…'} {Math.round(engineJob.progress * 100)}%</p>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(engineJob.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-teal rounded-full transition-[width] duration-500" style={{ width: `${engineJob.progress * 100}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">This takes a few minutes. Keep SchoolQ open.</p>
          </div>
        ) : installed ? (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => engine('export')} className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 active:scale-95 transition">
              Export engine…
            </button>
            <span className="text-xs text-gray-500">Saves a <span className="font-mono">.schoolq-engine</span> file (about 8 GB) — to an external disk or a USB drive formatted exFAT or NTFS (FAT32 sticks can't hold files over 4 GB).</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => engine('import')} className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 active:scale-95 transition">
              Import engine…
            </button>
            <span className="text-xs text-gray-500">Installs the engine from a <span className="font-mono">.schoolq-engine</span> file instead of downloading it.</span>
          </div>
        )}
      </div>
    </section>
  );
}

