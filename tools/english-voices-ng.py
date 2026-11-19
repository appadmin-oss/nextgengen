#!/usr/bin/env python3
"""
English Lab — the Nigerian voices (owner, 7 Nov 2026: "Add the Nigerian voices if you can make them
bolder and better").

Records every speaking text (eng_audio_jobs_ng() in api/_lib/domain/englishlab-speech.php) in two
Nigerian voices from YarnGPT2, an open-weights Nigerian-accented English model (Apache-2.0):
Idera and Jude, the two that read test sentences word-perfect when eight were tried.

"BETTER" IS A GATE, NOT A HOPE. The model sometimes swallows a word or loops, and a learner must
never copy a wrong model. So a clip is kept ONLY when a speech recogniser (Whisper) transcribes it
back as exactly the text; otherwise it is tried again with a different seed, up to six times, and
if it never passes the Lab simply has no Nigerian clip for that text — the British voices always
have one (english-voices.py, and the test that requires them). "BOLDER": read a touch slower (the
model rushes), then the same bold chain as every other voice.

Setup (once, on a development machine — the host only serves the files):
    python3 -m venv ~/yarn && ~/yarn/bin/pip install torch torchaudio transformers outetts uroman inflect soundfile
    git clone https://github.com/saheedniyi02/yarngpt  (YARNGPT_SRC = a folder holding it as "yarngpt")
    the WavTokenizer config (wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml)
    and the README's checkpoint (wavtokenizer_large_speech_320_24k.ckpt — the newer "v2" checkpoint
    decodes this model's codes into garbled speech, measured: use the README's)
Run:
    YARNGPT_SRC=… WT_CKPT=… WT_CFG=… ~/yarn/bin/python tools/english-voices-ng.py [--redo]
"""
import hashlib, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio", "english")
SPEAKER = {"ng_idera": "idera", "ng_jude": "jude"}
BOLD = ("adelay=60,atempo=0.92,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=3,equalizer=f=200:t=q:w=1:g=-2,"
        "acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2,loudnorm=I=-14:TP=-1:LRA=7")
TRIES = 6


def jobs():
    php = 'require "api/_lib/domain/englishlab-speech.php"; echo json_encode(eng_audio_jobs_ng(), JSON_UNESCAPED_UNICODE);'
    return json.loads(subprocess.check_output(["php", "-r", php], cwd=ROOT))


def name(text, phonemes, voice):
    return hashlib.sha1((text + "\x1f" + phonemes).encode("utf-8")).hexdigest()[:12] + "-" + voice + ".mp3"


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", s.lower().replace("’", "'"))).strip()


def main():
    import torch, soundfile as sf
    sys.path.insert(0, os.environ["YARNGPT_SRC"])
    from transformers import AutoModelForCausalLM, pipeline
    from yarngpt.audiotokenizer import AudioTokenizerV2
    todo = [(t, v, ph) for t, vs, ph in jobs() for v in vs if "--redo" in sys.argv or not os.path.exists(os.path.join(OUT, name(t, ph, v)))]
    print(f"{len(todo)} clip(s) to try", flush=True)
    if not todo:
        return
    # The tokenizer's arguments are (model path, CHECKPOINT, CONFIG), whatever its parameter names say.
    tok = AudioTokenizerV2("saheedniyi/YarnGPT2", os.environ["WT_CKPT"], os.environ["WT_CFG"])
    model = AutoModelForCausalLM.from_pretrained("saheedniyi/YarnGPT2", torch_dtype="auto")
    asr = pipeline("automatic-speech-recognition", model="openai/whisper-small.en")
    kept = failed = 0
    for i, (text, voice, ph) in enumerate(todo, 1):
        ok = False
        for attempt in range(TRIES):
            torch.manual_seed(attempt + 1)
            ids = tok.tokenize_prompt(tok.create_prompt(text, lang="english", speaker_name=SPEAKER[voice]))
            gen = dict(repetition_penalty=1.1, max_length=4000)
            if attempt:
                gen.update(do_sample=True, temperature=0.3, top_p=0.9)
            audio = tok.get_audio(tok.get_codes(model.generate(input_ids=ids, **gen)))
            with tempfile.TemporaryDirectory() as d:
                raw, done = os.path.join(d, "raw.wav"), os.path.join(d, "bold.wav")
                sf.write(raw, audio.squeeze().cpu().numpy(), 24000)
                subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-af", BOLD, "-ac", "1", "-ar", "24000", done])
                # Pad before transcribing: the recogniser invents words for a bare 0.3 s clip.
                padded = os.path.join(d, "pad.wav")
                subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", done, "-af", "adelay=400,apad=pad_dur=0.6", padded])
                heard = asr(padded)["text"]
                if norm(heard) == norm(text):
                    subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", done, "-ac", "1", "-ar", "24000", "-b:a", "64k", os.path.join(OUT, name(text, ph, voice))])
                    ok = True
                    break
        kept += ok; failed += not ok
        print(f"  {i}/{len(todo)} {voice:9} {'kept' if ok else 'NO  '} (try {attempt + 1}) {text}" + ("" if ok else f"  [heard: {heard.strip()}]"), flush=True)
    print(f"kept {kept}, none passed for {failed}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
