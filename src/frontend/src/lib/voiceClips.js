// Offline announcements: build a call from pre-recorded clips instead of a TTS engine.
//
//  /voice/<lang>/n/<1-99>.ogg       numbers (shipped with the app, tools/voice)
//  /voice/<lang>/h/<100-900>.ogg    hundreds
//  /voice/ar/wn/<1-99>.ogg          Arabic "و…" form used after a hundred (مية + وخمسة وعشرين)
//  /api/voice/clips/<file>          per-school clips: template text + department names
//
// clipKey/splitTemplate/DEFAULT_TEMPLATES must stay in sync with tools/voice/generate_voice_pack.py.

export const DEFAULT_TEMPLATES = {
  callEn:   'Attention please. Number {ticket}, {department}. Please come to the counter.',
  callAr:   'انتباه. رقم {ticket}، {department}. يرجى التوجه إلى الكاونتر.',
  recallEn: 'Final call. Number {ticket}, {department}. Please come forward immediately.',
  recallAr: 'آخر نداء. رقم {ticket}، {department}. يرجى التوجه فوراً.',
};

const EDGE_PUNCT = /^[\s.,،؛;:!?؟…-]+|[\s.,،؛;:!?؟…-]+$/g;

// Lookup key for a spoken piece of text: collapse spaces, drop punctuation at the edges.
export function clipKey(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().replace(EDGE_PUNCT, '');
}

// "Number {ticket}, {department}." → [{ text: 'Number' }, { var: 'ticket' }, { var: 'department' }]
export function splitTemplate(template) {
  const parts = [];
  const re = /\{(ticket|number|department|room)\}/g;
  let last = 0;
  let m;
  const pushText = (t) => { const k = clipKey(t); if (k) parts.push({ text: k }); };
  while ((m = re.exec(template))) {
    pushText(template.slice(last, m.index));
    parts.push({ var: m[1] === 'number' ? 'ticket' : m[1] });
    last = re.lastIndex;
  }
  pushText(template.slice(last));
  return parts;
}

// 125 → ['ar/h/100', 'ar/wn/25'];  7 → ['en/n/7'].  null when outside the recorded range.
export function numberClips(n, lang) {
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  const hundreds = Math.floor(n / 100) * 100;
  const rest = n % 100;
  const out = [];
  if (hundreds) out.push(`${lang}/h/${hundreds}`);
  if (rest) out.push(hundreds && lang === 'ar' ? `ar/wn/${rest}` : `${lang}/n/${rest}`);
  return out;
}

// URL of a recorded phrase in the active voice (manifest from /api/voice/manifest)
export function phraseUrl(custom, file) {
  return `${custom.clips || '/api/voice/clips'}/${encodeURIComponent(file)}`;
}

// One language of one call → ordered items: { src } for a recorded clip, { tts } where no
// recording exists (that piece falls back to the online voice).
// vars: { number, department, room }
// custom: the active voice's manifest — { clips, numbers, ar: { key: file }, en: { ... } }
//         (clips/numbers are URL bases; older servers omit them)
export function buildPlan(template, vars, lang, custom = {}) {
  const numbersBase = custom.numbers || '/voice';
  const recorded = (text) => {
    const file = custom[lang]?.[clipKey(text)];
    return file ? { src: phraseUrl(custom, file) } : { tts: text };
  };
  const number = (n, spoken) => {
    const clips = numberClips(n, lang);
    return clips ? clips.map(p => ({ src: `${numbersBase}/${p}.ogg` })) : [{ tts: spoken }];
  };

  const plan = [];
  for (const part of splitTemplate(template)) {
    if (part.text) plan.push(recorded(part.text));
    else if (part.var === 'ticket') plan.push(...number(vars.number, String(vars.number)));
    else if (part.var === 'department' && vars.department) plan.push(recorded(vars.department));
    else if (part.var === 'room' && vars.room) {
      const room = String(vars.room).trim();
      plan.push(...(/^\d+$/.test(room) ? number(parseInt(room, 10), room) : [recorded(room)]));
    }
  }
  return plan;
}

// Which language(s) an announcement is spoken in, and the text for each.
export function announcementTexts(a) {
  const lang = a.speak_language || 'en';
  const langs = lang === 'both' ? ['en', 'ar'] : [lang];
  return langs
    .map(l => ({ lang: l, text: l === 'ar' ? (a.message_text_ar || a.message_text) : a.message_text }))
    .filter(t => clipKey(t.text));
}

// The parts of an announcement the announcement voice has no recording for — the display reads
// those with the online voice (or Windows' voice when offline): [{ lang, text }]
export function unrecordedTexts(announcement, voiceManifest = {}) {
  return announcementTexts(announcement).filter(t => !voiceManifest[t.lang]?.[clipKey(t.text)]);
}

// Every piece the school's announcements need a recording for, once per language:
// [{ lang, text, source: 'template' | 'department' | 'announcement' }]
export function requiredPieces(templates, departments, announcements = []) {
  const pieces = [];
  const add = (lang, text, source) => {
    const key = clipKey(text);
    if (key && !pieces.some(p => p.lang === lang && p.text === key)) pieces.push({ lang, text: key, source });
  };
  for (const [lang, list] of [['en', [templates.callEn, templates.recallEn]], ['ar', [templates.callAr, templates.recallAr]]]) {
    for (const t of list) for (const p of splitTemplate(t || '')) if (p.text) add(lang, p.text, 'template');
    for (const d of departments) add(lang, lang === 'ar' ? (d.name_ar || d.name) : d.name, 'department');
  }
  for (const a of announcements) for (const t of announcementTexts(a)) add(t.lang, t.text, 'announcement');
  return pieces;
}

// Pieces of the current templates/departments that have no recording yet (shown in Settings).
export function missingClips(templates, departments, custom = {}) {
  return requiredPieces(templates, departments)
    .filter(p => !custom[p.lang]?.[p.text])
    .map(({ lang, text }) => ({ lang, text }));
}
