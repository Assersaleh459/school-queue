# Offline announcement voice — seller/dev tool

SchoolQ calls tickets by playing short recorded clips back-to-back, so announcements work with
**no internet** and no speech engine on the school's PCs:

```
«تنبيه من فضلك. التذكرة رقم» + «مية» + «وخمسة وعشرين» + «القسم» + «الحسابات» + «رقم غرفة» + «اتنين»
```

| Clips | Made | Ships | Where |
|---|---|---|---|
| Numbers 1–999 (315 clips, AR + EN) | once | with the app | `src/frontend/public/voice/` |
| Template text + department names | per school | delivered to the school | `%APPDATA%\SchoolQ\voice\` on the school's **server** PC |

Any piece without a recording falls back to the online voice for that piece only.
Admin → *Voice Recordings* lists every piece and whether it is recorded.

## Two ways to make a school's clips

1. **On the school's server (recommended)** — install the optional **Voice Engine** add-on
   (Admin → Voice Recordings → *Install Voice Engine*, ~5 GB, `src/backend/voice-engine/install-engine.ps1`).
   Admins then record anything themselves: *Generate all missing*, *Record* a custom phrase,
   🔁 re-record, 🗑 delete. Announcements can be played on the display with 📢.
   Speed: ~1 min per phrase with an NVIDIA GPU; several minutes per phrase on CPU only
   (the model also takes a few minutes to load the first time, then stays loaded for 10 min).
2. **On the developer PC** with this tool, then copy the files to the school (below).

Both use the same generation code (`src/backend/voice-engine/voicegen.py`), so clips are identical.

Voice: **VoiceTut-TTS, speaker "Sarah"** (Egyptian Arabic + English, Apache-2.0).
Only the generated `.ogg` clips ship — VoiceTut, PyTorch and espeak-ng (GPL) stay on the
developer machine.

> ⚠️ VoiceTut's built-in voices are clones of real speakers and its README asks for consent before
> cloning a real person. Confirm commercial use of "Sarah" with the VoiceTut author before selling
> to other schools — or clone a consenting voice (`--speaker` → `ref_audio`) and regenerate.

## Setup (developer PC, once)

Python 3.10 with an NVIDIA GPU (≥4 GB) recommended — CPU works but is much slower.

```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu126
pip install git+https://github.com/k2-fsa/OmniVoice.git voicetut-tts
# model (2.3 GB) — skip optimizer.bin, it is training-only (4.7 GB)
huggingface-cli download mohammedaly22/VoiceTut-TTS --local-dir voicetut-model --exclude "optimizer.bin"
```

## Making clips

**Numbers** (already in the repo — only redo when changing the voice):
```bash
python tools/voice/generate_voice_pack.py --model voicetut-model --only numbers
```

**A school's pack** — from a copy of that school's database:
```bash
python tools/voice/generate_voice_pack.py --model voicetut-model --only school \
    --school-db school-queue.db --out voice-<school>
# check what will be made first:  add --dry-run
```
Copy the contents of `voice-<school>/` (`manifest.json` + `.ogg` files) into
`%APPDATA%\SchoolQ\voice\` on the school's server PC. The display picks it up within 30 seconds.

Redo the school pack after the school changes its call templates or departments.

## Notes

- Resumable: existing clips are skipped, so a run can be stopped and restarted.
  Delete a clip to regenerate it.
- Each clip is silence-trimmed and peak-normalized (−1 dBFS) so clips join tightly at even volume.
- Arabic numbers use VoiceTut's Egyptian number words. After a hundred the "و" form is used
  (`ar/wn/`): 125 → «مية» + «وخمسة وعشرين».
- `clip_key` / `template_texts` / `DEFAULT_TEMPLATES` must match `src/frontend/src/lib/voiceClips.js`.
