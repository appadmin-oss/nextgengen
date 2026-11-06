#!/usr/bin/env python3
"""
English Lab — record the voice clips (owner, 6 Nov 2026: "free, dependable, professional and articulate").

Records every speaking text the Lab declares (eng_audio_jobs() in api/_lib/domain/englishlab-speech.php)
with Kokoro, an open-weights neural voice (Apache-2.0), in its British voices, and writes one MP3 per
text per voice to assets/audio/english/. ONLY MISSING CLIPS are recorded, so running it after adding a
sentence records that sentence and nothing else. The website never runs this: the host only serves files.

Setup (once, on a development machine — not the host):
    python3 -m venv ~/kokoro && ~/kokoro/bin/pip install kokoro-onnx soundfile
    download kokoro-v1.0.onnx and voices-v1.0.bin from
      https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Run:
    KOKORO_DIR=/path/to/model/files ~/kokoro/bin/python tools/english-voices.py
Needs php and ffmpeg on the PATH. Then commit assets/audio/english/ and run `php api/tests/run.php`,
which fails if any speaking text has no recording.
"""
import hashlib, json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio", "english")
MODEL = os.environ.get("KOKORO_DIR", ".")


def jobs():
    php = 'require "api/_lib/domain/englishlab-speech.php"; echo json_encode(eng_audio_jobs(), JSON_UNESCAPED_UNICODE);'
    return json.loads(subprocess.check_output(["php", "-r", php], cwd=ROOT))


def name(text, phonemes, voice):
    # Must match eng_audio_name() in PHP: sha1(text . "\x1F" . phonemes), first 12 hex, then the voice.
    return hashlib.sha1((text + "\x1f" + phonemes).encode("utf-8")).hexdigest()[:12] + "-" + voice + ".mp3"


def main():
    import soundfile as sf
    from kokoro_onnx import Kokoro
    os.makedirs(OUT, exist_ok=True)
    todo = [(t, v, ph) for t, vs, ph in jobs() for v in vs if not os.path.exists(os.path.join(OUT, name(t, ph, v)))]
    print(f"{len(todo)} clip(s) to record")
    if not todo:
        return
    k = Kokoro(os.path.join(MODEL, "kokoro-v1.0.onnx"), os.path.join(MODEL, "voices-v1.0.bin"))
    for i, (text, voice, ph) in enumerate(todo, 1):
        single = len(text.split()) == 1
        # A single word is read a touch slower and with its own phonemes where one is given.
        samples, sr = (k.create(ph, voice=voice, speed=0.9, lang="en-gb", is_phonemes=True) if ph
                       else k.create(text, voice=voice, speed=0.88 if single else 0.95, lang="en-gb"))
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as w:
            sf.write(w.name, samples, sr)
        dst = os.path.join(OUT, name(text, ph, voice))
        # Mono MP3 at 64 kbit/s (plays on every phone); one loudness for every clip; 60 ms of silence first,
        # because some phones swallow the start of a clip and the first consonant IS the lesson.
        subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", w.name, "-af", "adelay=60,loudnorm=I=-16:TP=-1.5:LRA=11",
                               "-ac", "1", "-ar", "24000", "-b:a", "64k", dst])
        os.unlink(w.name)
        print(f"  {i}/{len(todo)} {voice:12} {text}")


if __name__ == "__main__":
    sys.exit(main())
