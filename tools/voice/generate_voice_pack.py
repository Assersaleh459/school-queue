"""SELLER/DEV-ONLY tool. Generates the offline announcement voice clips with VoiceTut-TTS.

The display plays clips back-to-back ("التذكرة رقم" + "مية" + "وخمسة وعشرين" + ...) so calls
work with no internet and no TTS engine on the school's PCs. Only the generated .ogg clips
ship — this script, VoiceTut, PyTorch and espeak stay on the developer machine.

  numbers  (shipped with the app)  -> src/frontend/public/voice/
  school   (one per school)        -> a folder copied to the school server's %APPDATA%\\SchoolQ\\voice\\
           = the fixed text in that school's call templates + its department names

Usage (Python env with voicetut-tts installed, see tools/voice/README.md):
  python tools/voice/generate_voice_pack.py --model <voicetut-model-dir> --only numbers
  python tools/voice/generate_voice_pack.py --model <dir> --only school --school-db <school-queue.db> --out <dir>

Resumable: clips that already exist are skipped, so it can be stopped and restarted.
"""
import argparse, hashlib, json, os, sqlite3, sys, time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUT = os.path.join(REPO, "src", "frontend", "public", "voice")

# Same generation code as the in-app voice engine, so clips are identical either way.
sys.path.insert(0, os.path.join(REPO, "src", "backend", "voice-engine"))
from voicegen import clip_key, template_texts, load_engine, synthesize_clip, number_slots, number_text  # noqa: E402

# Must match src/frontend/src/lib/voiceClips.js
DEFAULT_TEMPLATES = {
    "call_template_en":   "Attention please. Number {ticket}, {department}. Please come to the counter.",
    "call_template_ar":   "انتباه. رقم {ticket}، {department}. يرجى التوجه إلى الكاونتر.",
    "recall_template_en": "Final call. Number {ticket}, {department}. Please come forward immediately.",
    "recall_template_ar": "آخر نداء. رقم {ticket}، {department}. يرجى التوجه فوراً.",
}

def number_clips():
    """(lang, relative path, text) for all 315 number clips."""
    return [(lang, f"{lang}/{kind}/{n}", number_text(lang, kind, n)) for lang, kind, n in number_slots()]


def school_clips(db_path):
    """Template text pieces + department names from a school's database (opened read-only).
    Returns (clips, manifest) — manifest maps lang -> lookup key -> file name."""
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    settings = dict(db.execute("SELECT setting_key, setting_value FROM settings").fetchall())
    cols = {r[1] for r in db.execute("PRAGMA table_info(departments)")}
    name_ar = "name_ar" if "name_ar" in cols else "NULL"
    depts = db.execute(f"SELECT name, {name_ar} FROM departments WHERE is_active = 1").fetchall()
    db.close()

    texts = {"ar": [], "en": []}
    for lang in ("ar", "en"):
        for kind in ("call", "recall"):
            key = f"{kind}_template_{lang}"
            texts[lang] += template_texts(settings.get(key) or DEFAULT_TEMPLATES[key])
        for name, name_arabic in depts:
            texts[lang].append(clip_key((name_arabic or name) if lang == "ar" else name))

    clips, manifest = [], {"ar": {}, "en": {}}
    for lang, items in texts.items():
        for key in dict.fromkeys(k for k in items if k):          # unique, keep order
            name = f"{lang}-{hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]}"
            manifest[lang][key] = name + ".ogg"
            clips.append((lang, name, key))
    return clips, manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="VoiceTut model dir (or HF repo id)")
    ap.add_argument("--speaker", default="Sarah")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--only", choices=["numbers", "school"], required=True)
    ap.add_argument("--school-db", help="the school's school-queue.db, for --only school")
    ap.add_argument("--dry-run", action="store_true", help="list the clips without generating")
    ap.add_argument("--device", default=None, help="cuda / cpu (auto if omitted)")
    args = ap.parse_args()

    school_manifest = None
    if args.only == "numbers":
        clips = number_clips()
    else:
        if not args.school_db or os.path.abspath(args.out) == os.path.abspath(DEFAULT_OUT):
            sys.exit("--only school needs --school-db and an --out folder (not the shipped voice folder)")
        clips, school_manifest = school_clips(args.school_db)

    todo = [c for c in clips if not os.path.exists(os.path.join(args.out, c[1] + ".ogg"))]
    print(f"{len(clips)} clips, {len(clips) - len(todo)} already done, {len(todo)} to generate", flush=True)
    if args.dry_run:
        for lang, rel, text in clips:
            print(f"  {rel:<20} {text}")
        return
    if school_manifest is not None:
        os.makedirs(args.out, exist_ok=True)
        with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(school_manifest, f, ensure_ascii=False, indent=2)
    if not todo:
        return

    t0 = time.time()
    tts, device = load_engine(args.model, args.device)
    print(f"model loaded on {device} in {time.time() - t0:.0f}s", flush=True)

    failures = []
    for i, (lang, rel, text) in enumerate(todo, 1):
        t = time.time()
        dest = os.path.join(args.out, rel + ".ogg")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        secs = synthesize_clip(tts, text, lang, args.speaker, dest)
        if secs is None:
            failures.append(rel)
            print(f"[{i}/{len(todo)}] {rel}: SILENT — skipped", flush=True)
            continue
        print(f"[{i}/{len(todo)}] {rel:<12} {secs:4.2f}s  ({time.time() - t:4.1f}s)  {text}", flush=True)

    print(f"done in {(time.time() - t0) / 60:.1f} min" + (f" — {len(failures)} silent: {failures}" if failures else ""))


if __name__ == "__main__":
    main()
