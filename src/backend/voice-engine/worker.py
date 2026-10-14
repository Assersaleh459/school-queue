"""SchoolQ voice engine worker. Spawned by src/backend/voice-engine/engine.js.

Loads the voice model once, then reads one JSON job per line on stdin and writes one JSON
event per line on stdout:

  in : {"id": "...", "lang": "ar"|"en", "text": "...", "out": "<path>.ogg", "speaker": "Sarah"}
       a number clip sends "number": {"kind": "n"|"wn"|"h", "n": 25} instead of "text"
  out: {"type": "ready", "device": "cuda"|"cpu"}
       {"type": "done",  "id": "...", "seconds": 1.2, "took": 53.1}
       {"type": "error", "id": "...", "error": "..."}

Usage: python worker.py --model <voicetut-model-dir> [--speaker Sarah]
"""
import argparse, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voicegen import load_engine, synthesize_clip, number_text  # noqa: E402


def emit(event):
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--speaker", default="Sarah")
    args = ap.parse_args()

    try:
        tts, device = load_engine(args.model)
    except Exception as e:  # report instead of dying silently
        emit({"type": "fatal", "error": f"{type(e).__name__}: {e}"})
        return 1
    emit({"type": "ready", "device": device})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        t = time.time()
        try:
            os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
            tmp = job["out"] + ".tmp"
            num = job.get("number")
            text = number_text(job["lang"], num["kind"], num["n"]) if num else job["text"]
            secs = synthesize_clip(tts, text, job["lang"], job.get("speaker") or args.speaker, tmp)
            if secs is None:
                emit({"type": "error", "id": job["id"], "error": "generated audio was silent"})
                continue
            os.replace(tmp, job["out"])  # never leave a half-written clip in place
            emit({"type": "done", "id": job["id"], "seconds": round(secs, 2), "took": round(time.time() - t, 1)})
        except Exception as e:
            emit({"type": "error", "id": job["id"], "error": f"{type(e).__name__}: {e}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
