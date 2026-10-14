// Shared by Voice Recordings and its Listen & fix panel.
// A clip is a phrase { lang, text, file } or a number { lang, kind: 'n'|'wn'|'h', n }.

export const clipId = (c) => (c.kind ? `n:${c.lang}/${c.kind}/${c.n}` : `p:${c.lang}:${c.text}`);

// URLs of the recording in use and of a new take waiting next to it. stamp busts the
// browser's copy, since a kept take has the same file name as the clip it replaced.
export function clipUrls(voice, c, stamp) {
  const take = c.kind ? `${c.lang}-${c.kind}-${c.n}.ogg` : c.file;
  return {
    current: c.kind ? `/api/voice/numbers/${voice}/${c.lang}/${c.kind}/${c.n}.ogg?v=${stamp}` : `/api/voice/clips/${voice}/${c.file}?v=${stamp}`,
    take: `/api/voice/clips/${voice}/takes/${take}?v=${stamp}`,
  };
}
