// Stand-in for voice-engine/worker.py: same stdin/stdout JSON protocol, no model.
// Text "FAIL" → error event; text "CRASH" → process exits mid-job.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const emit = (ev) => process.stdout.write(JSON.stringify(ev) + '\n');
emit({ type: 'ready', device: 'fake' });

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const job = JSON.parse(line);
  if (job.text === 'CRASH') process.exit(3);
  if (job.text === 'FAIL') return emit({ type: 'error', id: job.id, error: 'generated audio was silent' });
  const said = job.number ? `${job.number.kind}${job.number.n}` : job.text;
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  fs.writeFileSync(job.out, `clip:${job.speaker}:${job.lang}:${said}`);
  emit({ type: 'done', id: job.id, seconds: 1, took: 0 });
});
