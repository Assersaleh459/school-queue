const express = require('express');
const router  = express.Router();
const https   = require('https');

// ── Azure Neural TTS (best quality, free 500k chars/month) ────────────────────
// Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env to enable.
// Voices: ar-EG-SalmaNeural (Egyptian Arabic), en-US-AriaNeural (English)
// SSML pauses at punctuation make it sound much more natural.

function escapeSSML(text) {
  return text
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    // Natural pauses at sentence/clause boundaries
    .replace(/\. /g,  '. <break time="450ms"/>')
    .replace(/\? /g,  '? <break time="450ms"/>')
    .replace(/! /g,   '! <break time="350ms"/>')
    .replace(/، /g,   '، <break time="300ms"/>')   // Arabic comma
    .replace(/, /g,   ', <break time="200ms"/>');
}

async function azureTTS(text, lang) {
  const key    = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';
  if (!key) throw new Error('No Azure key');

  const voice   = lang === 'ar' ? 'ar-EG-SalmaNeural' : 'en-US-AriaNeural';
  const xmlLang = lang === 'ar' ? 'ar-EG' : 'en-US';

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}">
    <voice name="${voice}">
      <prosody rate="-8%">${escapeSSML(text)}</prosody>
    </voice>
  </speak>`;

  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type':             'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent':               'SchoolQ/1.0',
      },
      body: ssml,
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) throw new Error(`Azure TTS ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Google Translate TTS (fallback, no key needed) ────────────────────────────

function splitText(text, maxLen = 190) {
  if (text.length <= maxLen) return [text];
  const words = text.split(' ');
  const chunks = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLen) { if (cur) chunks.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function fetchGoogleChunk(text, lang) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=gtx&total=1&idx=0&textlen=${text.length}&prev=input`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://translate.google.com/',
      }
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Google TTS ${res.statusCode}`)); }
      const buf = [];
      res.on('data', d => buf.push(d));
      res.on('end',  () => resolve(Buffer.concat(buf)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function googleTTS(text, lang) {
  const chunks = splitText(text.substring(0, 500));
  const bufs   = await Promise.all(chunks.map(c => fetchGoogleChunk(c, lang)));
  const result = Buffer.concat(bufs);
  // Google occasionally returns HTML (blocked/rate-limited) — detect by MP3 sync byte
  if (result.length < 100 || (result[0] !== 0xFF && result[0] !== 0x49)) {
    throw new Error(`Google TTS returned invalid audio for lang=${lang} (${result.length} bytes)`);
  }
  return result;
}

// ── Route ─────────────────────────────────────────────────────────────────────
// GET /api/tts?text=...&lang=en|ar

router.get('/', async (req, res) => {
  const { text, lang = 'en' } = req.query;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const safeLang = ['en', 'ar'].includes(lang) ? lang : 'en';

  try {
    const audio = process.env.AZURE_SPEECH_KEY
      ? await azureTTS(text, safeLang)
      : await googleTTS(text, safeLang);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(audio);
  } catch (err) {
    console.error('TTS error:', err.message);
    // Try the other provider as emergency fallback
    try {
      const fallback = process.env.AZURE_SPEECH_KEY
        ? await googleTTS(text, safeLang)
        : null;
      if (fallback) { res.setHeader('Content-Type', 'audio/mpeg'); return res.send(fallback); }
    } catch {}
    res.status(502).json({ error: 'TTS service unavailable' });
  }
});

module.exports = router;
