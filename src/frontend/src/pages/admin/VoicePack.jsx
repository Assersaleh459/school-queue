// Backup & move: voices to / from a file (any PC), and the voice engine (server PC only, ~8 GB)
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { unlockToken } from '../../lib/voiceLock';
import { toast } from '../../store/useToastStore';

export default function VoicePack({ voices, installed, onImported }) {
  const withRecordings = voices.filter(v => v.phrases > 0 || (v.name !== 'Sarah' && v.numbers > 0));
  const [chosen, setChosen] = useState(null);           // export selection (null = all)
  const [staged, setStaged] = useState(null);           // { id, voices } after reading an import file
  const [pick, setPick] = useState({});
  const [upload, setUpload] = useState(null);           // 0..1 while sending the file
  const [engineJob, setEngineJob] = useState(null);     // { kind, progress }
  const enginePack = !!window.electronAPI?.enginePackAvailable?.();

  const selected = chosen ?? withRecordings.map(v => v.name);

  useEffect(() => window.electronAPI?.onEnginePackProgress?.((p) => setEngineJob(j => (j ? { ...j, progress: p } : j))), []);

  const exportVoices = async () => {
    try {
      const r = await api.post('/voice/export-link', { voices: selected });
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
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not read the file');
    } finally {
      setUpload(null);
    }
  };

  const applyImport = async () => {
    const names = staged.voices.filter(v => pick[v.name]).map(v => v.name);
    try {
      const r = await api.post(`/voice/import/${staged.id}`, { voices: names });
      toast.success(`Imported ${r.data.imported.join(', ')}`);
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
              <div className="flex gap-2">
                <button onClick={applyImport} disabled={!Object.values(pick).some(Boolean)}
                  className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 active:scale-95 transition disabled:opacity-40">
                  Import {Object.values(pick).filter(Boolean).length} voice{Object.values(pick).filter(Boolean).length === 1 ? '' : 's'}
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

