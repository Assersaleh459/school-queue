"""Shared clip generation for the SchoolQ voice engine (worker.py) and the dev tool
(tools/voice/generate_voice_pack.py), so both produce identical clips.

clip_key / template_texts must match src/frontend/src/lib/voiceClips.js.
"""
import re

import numpy as np
import soundfile as sf

EDGE_PUNCT = re.compile(r"^[\s.,،؛;:!?؟…-]+|[\s.,،؛;:!?؟…-]+$")
TEMPLATE_VAR = re.compile(r"\{(ticket|number|department|room)\}")


def clip_key(text):
    """Lookup key for a spoken piece: collapse spaces, drop punctuation at the edges."""
    return EDGE_PUNCT.sub("", re.sub(r"\s+", " ", text or "").strip())


def template_texts(template):
    """The fixed (non-variable) pieces of a call template, as lookup keys."""
    return [k for k in (clip_key(t) for t in TEMPLATE_VAR.split(template or "")[::2]) if k]


# ── Number clips: <lang>/n/<1-99>, <lang>/h/<100-900>, ar/wn/<1-99> ("و…" form after a hundred)
ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
        "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def en_words(n):
    if n < 20:
        return ONES[n]
    return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")


def number_slots():
    """Every number clip a voice needs: [(lang, kind, n)] — 315 in total."""
    slots = []
    for n in range(1, 100):
        slots += [("ar", "n", n), ("ar", "wn", n), ("en", "n", n)]
    for h in range(100, 1000, 100):
        slots += [("ar", "h", h), ("en", "h", h)]
    return slots


_ar_words = None


def number_text(lang, kind, n):
    """What to say for a number clip. Arabic uses VoiceTut's Egyptian number words."""
    global _ar_words
    if lang == "en":
        return f"{ONES[n // 100]} hundred" if kind == "h" else en_words(n)
    if kind == "wn":
        # Convert first: the normalizer leaves digits glued to و ("و25") untouched
        if _ar_words is None:
            from voicetut_tts import ArabicNormalizer
            _ar_words = ArabicNormalizer()
        return "و" + _ar_words(str(n))
    return str(n)   # the normalizer turns plain digits into words


def clean(wav, sr, threshold_db=-40.0, pad_ms=25, peak_db=-1.0):
    """Trim leading/trailing silence and peak-normalize so clips join tightly at even volume.
    Returns None for silent audio."""
    wav = np.asarray(wav, dtype=np.float32).flatten()
    peak = float(np.abs(wav).max()) if wav.size else 0.0
    if peak < 1e-4:
        return None
    frame = int(sr * 0.01)
    n = len(wav) // frame
    rms = np.sqrt(np.mean(wav[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    loud = np.where(20 * np.log10(rms / peak) > threshold_db)[0]
    if loud.size == 0:
        return None
    pad = int(sr * pad_ms / 1000)
    wav = wav[max(0, loud[0] * frame - pad): min(len(wav), (loud[-1] + 1) * frame + pad)]
    return wav * (10 ** (peak_db / 20) / np.abs(wav).max())


def load_engine(model_dir, device=None):
    """Load VoiceTut once. GPU (float16) when available, else CPU (float32)."""
    import torch
    from voicetut_tts import VoiceTutTTS
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    dtype = "float16" if device.startswith("cuda") else "float32"
    return VoiceTutTTS.from_pretrained(model_dir, device=device, dtype=dtype), device


# ── Text the model can say. VoiceTut's normalizer always reads digits as Egyptian Arabic words
# (also in English text) and passes symbols like "|" through to the model, which can't say them.
PAUSE_SYMBOLS = re.compile(r"\s*[|/\\*_~^<>\[\]{}=•·]+\s*")
RANGE_DASH = re.compile(r"(\d(?:\s*(?:[AaPp]\.?[Mm]\.?))?)\s*[-–—]\s*(?=\d)")
SPACED_DASH = re.compile(r"\s+[-–—]+\s+")


def en_number(n):
    """0..999999 in English words; longer numbers digit by digit."""
    if n < 100:
        return en_words(n) if n else "zero"
    if n < 1000:
        return f"{ONES[n // 100]} hundred" + (f" {en_words(n % 100)}" if n % 100 else "")
    if n < 1000000:
        return f"{en_number(n // 1000)} thousand" + (f" {en_number(n % 1000)}" if n % 1000 else "")
    return " ".join(en_number(int(d)) for d in str(n))


def en_numbers(text):
    """Digits in English text → English words (times, percents, decimals, long numbers)."""
    def time(m):
        h, mm = int(m.group(1)), int(m.group(2))
        return en_number(h) + ("" if mm == 0 else f" oh {en_number(mm)}" if mm < 10 else f" {en_number(mm)}")
    text = re.sub(r"\b(\d{1,2}):(\d{2})\b", time, text)
    text = re.sub(r"(\d+)\s*%", lambda m: f"{m.group(1)} percent", text)
    text = re.sub(r"\b(\d+)\.(\d+)\b", lambda m: f"{m.group(1)} point " + " ".join(en_number(int(d)) for d in m.group(2)), text)
    text = re.sub(r"\d{7,}", lambda m: " ".join(en_number(int(d)) for d in m.group(0)), text)
    text = re.sub(r"#\s*(?=\d)", "number ", text)
    text = text.replace("&", " and ")
    return re.sub(r"\d+", lambda m: en_number(int(m.group(0))), text)


def speakable(text, lang):
    """What the model is given for `text` (the clip is still saved under the original text)."""
    t = RANGE_DASH.sub(lambda m: m.group(1) + (" إلى " if lang == "ar" else " to "), text or "")
    pause = "، " if lang == "ar" else ", "
    t = SPACED_DASH.sub(pause, t)
    t = PAUSE_SYMBOLS.sub(pause, t)
    if lang == "en":
        t = en_numbers(t)
    t = re.sub(r"\s*([,،])(\s*[,،])+", r"\1", t)          # no double pauses
    return re.sub(r"\s+", " ", t).strip(" ,،")


def synthesize_clip(tts, text, lang, speaker, out_path):
    """Generate one clip and write it as OGG Vorbis. Returns the clip length in seconds, or None if silent."""
    text = speakable(text, lang)
    wav = clean(tts.synthesize(text, speaker=speaker, language="arz" if lang == "ar" else "en"), tts.sampling_rate)
    if wav is None:
        return None
    sf.write(out_path, wav, tts.sampling_rate, format="OGG", subtype="VORBIS")
    return len(wav) / tts.sampling_rate
