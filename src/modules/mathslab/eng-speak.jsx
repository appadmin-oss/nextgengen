/* ============================================================================
   English Lab — "Hear and say" (owner, 6 Nov 2026: "Speaking … Articulation … a bit
   of Duolingo features. Do not use a shitty voice please").

   A lesson step for a topic whose content has `speak` (api/_lib/domain/englishlab-speech.php):
     1. How to say it — where the tongue and lips go, voice on or off, with the sound to hear.
     2. Hear the difference — a minimal pair (ship / sheep) spoken in SEVERAL voices, eight rounds,
        a streak. Perception with many talkers is what transfers to pronunciation (HVPT).
     3. Say it — hear the model (normal or slow), record yourself, and see word by word what was
        understood. Spitch's speech-to-text, trained on Nigerian speech, does the listening, so a
        Nigerian accent is not marked down for being Nigerian.

   THE VOICE: recorded clips (owner: "free, dependable, professional and articulate"). Every speaking
   text is recorded once, in development, with Kokoro's British neural voices (tools/english-voices.py)
   and shipped as a file under assets/audio/english/ — the topic's `speak.audio` lists them. A
   missing clip falls back to a cached server voice if one is configured (NGGApi.member.mathslab.voice),
   then to the device's best NATURAL voice — never the robotic default first.
   Listening falls back the same way: server → the browser's own recogniser → record and play back.
   Nothing needs a drag; every control is a button with a label; results are announced.
   ========================================================================== */

const ENG_SPEAK_ROUNDS = 8;

/* The device's best English voice, for the fallback only: natural/neural voices first, then en-GB/en-NG. */
function engDeviceVoice() {
  try {
    const vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    const en = vs.filter(v => /^en(-|_|$)/i.test(v.lang));
    const rank = v => (/natural|neural|online|premium|enhanced/i.test(v.name) ? 4 : 0) + (/^en[-_](NG|GB)/i.test(v.lang) ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0);
    return en.sort((a, b) => rank(b) - rank(a))[0] || null;
  } catch (_) { return null; }
}

/* Play an allowed Lab text: the server's cached Spitch clip in voice `vi`, or the device fallback. */
const engClipCache = {};
let engNoServerVoice = false;
const engAudio = {};   // text → [recorded clip URL per voice], filled from each topic's speak.audio
/* Who is speaking: the recordings are named …-<voice>.mp3. British voices are on every text; a
   Nigerian voice is on a text only where its clip passed the recogniser check (english-voices-ng.py). */
const ENG_VOICE_NAMES = { bf_emma: "Emma · British", bm_george: "George · British", bf_isabella: "Isabella · British", bm_lewis: "Lewis · British", ng_idera: "Idera · Nigerian", ng_jude: "Jude · Nigerian" };
const engVoiceOf = url => ((String(url).match(/-([a-z]+_[a-z]+)\.mp3$/) || [])[1] || "");
const engVoicesFor = text => (engAudio[text] || []).map(engVoiceOf);
function engPlayUrl(url, slow) {
  const a = new Audio(url);
  a.playbackRate = slow ? 0.75 : 1;
  try { a.preservesPitch = true; } catch (_) {}
  return a.play().then(() => new Promise(res => { a.onended = res; a.onerror = res; }));
}
async function engPlay(text, vi, slow) {
  const rec = engAudio[text];
  // vi is a voice NAME (play that voice, if this text has it) or an index (rotate through the voices).
  if (rec && rec.length && typeof vi === "string") { const u = rec.find(x => engVoiceOf(x) === vi); if (u) return engPlayUrl(u, slow); vi = 0; }
  if (rec && rec.length) return engPlayUrl(rec[((vi || 0) % rec.length + rec.length) % rec.length], slow);
  if (!engNoServerVoice) {
    const key = vi + "|" + text;
    try {
      if (!engClipCache[key]) engClipCache[key] = (await NGGApi.member.mathslab.voice(text, vi)).url;
      const a = new Audio(engClipCache[key]);
      a.playbackRate = slow ? 0.75 : 1;
      try { a.preservesPitch = true; } catch (_) {}
      await a.play();
      return new Promise(res => { a.onended = res; a.onerror = res; });
    } catch (e) {
      delete engClipCache[vi + "|" + text];
      if (e && /tts_not_configured/.test(String(e.code || e.message || e))) engNoServerVoice = true; else throw e;
    }
  }
  if (!window.speechSynthesis) throw new Error("no_voice");
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text);
    const v = engDeviceVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-GB";
    u.rate = slow ? 0.7 : 0.95; u.onend = res; u.onerror = res;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  });
}

/* Word-by-word match (the client twin of eng_word_match, used only with the browser's recogniser). */
function engWordMatch(target, heard) {
  const norm = s => String(s).toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}\s]+/gu, "").split(/\s+/).filter(Boolean);
  const shown = String(target).trim().split(/\s+/), a = norm(target), b = norm(heard);
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ok = new Array(a.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return shown.map((w, k) => ({ w, ok: !!ok[k] }));
}

function EngPlayButton({ text, vi, slow, label, className, onPlay }) {
  const [busy, setBusy] = React.useState(false), [err, setErr] = React.useState("");
  const go = async () => { if (onPlay) onPlay(); setBusy(true); setErr(""); try { await engPlay(text, vi || 0, slow); } catch (_) { setErr("The voice could not play. Check your connection and try again."); } setBusy(false); };
  return <>
    <button type="button" className={className || "stt-btn eng-play"} onClick={go} disabled={busy} aria-label={label || ("Hear “" + text + "”" + (slow ? " slowly" : ""))}>
      <i className={"ph " + (busy ? "ph-waveform" : "ph-speaker-high")} aria-hidden="true"/>{slow ? "Slow" : null}</button>
    {err ? <span className="mlb-meta" role="alert">{err}</span> : null}
  </>;
}

/* 1 · How to say it */
function EngHow({ how }) {
  return <section className="mlb-card eng-how" aria-labelledby="eng-how-h">
    <h3 id="eng-how-h" className="mlb-h3">How to say it</h3>
    <ul className="eng-how-list">{how.map((h, i) => <li key={i} className="eng-how-i">
      <span className="eng-sym">{h[0]}</span><span className="eng-tip">{h[1]}</span>
      <span className="eng-ex">“{h[2]}” <EngPlayButton text={h[2]} vi={i} label={"Hear “" + h[2] + "”"}/></span></li>)}</ul>
  </section>;
}

/* 2 · Hear the difference: eight rounds, rotating voices, a streak. */
function EngHear({ pairs, onDone }) {
  /* One voice for both words of a round, so "hear both" compares the sounds and not two speakers. */
  const pick = () => { const p = pairs[Math.floor(Math.random() * pairs.length)];
    const both = engVoicesFor(p[0]).filter(v => engVoicesFor(p[1]).includes(v));
    return { p, k: Math.random() < .5 ? 0 : 1, vi: both.length ? both[Math.floor(Math.random() * both.length)] : Math.floor(Math.random() * 4) }; };
  const [r, setR] = React.useState(pick), [n, setN] = React.useState(0), [right, setRight] = React.useState(0), [streak, setStreak] = React.useState(0);
  const [said, setSaid] = React.useState(null), [heard, setHeard] = React.useState(false);
  const done = n >= ENG_SPEAK_ROUNDS;
  React.useEffect(() => { if (done && onDone) onDone(); }, [done]); // eslint-disable-line
  const choose = k => { if (said !== null) return; setSaid(k); const ok = k === r.k; setRight(x => x + (ok ? 1 : 0)); setStreak(s => ok ? s + 1 : 0); };
  const next = () => { setN(x => x + 1); setR(pick()); setSaid(null); setHeard(false); };
  return <section className="mlb-card eng-hear" aria-labelledby="eng-hear-h">
    <h3 id="eng-hear-h" className="mlb-h3">Hear the difference</h3>
    <div className="eng-dots" aria-hidden="true">{Array.from({ length: ENG_SPEAK_ROUNDS }, (_, i) => <i key={i} className={i < n ? "is-done" : i === n ? "is-on" : ""}/>)}</div>
    {done ? <p className="mlb-fb is-ok" role="status"><b>{right} of {ENG_SPEAK_ROUNDS} right.</b> {right >= 6 ? "Your ear is tuning in." : "Listen again tomorrow — ears improve with practice."}</p> : <>
      <p className="mlb-meta">Round {n + 1} of {ENG_SPEAK_ROUNDS} · a new voice each time{ENG_VOICE_NAMES[r.vi] ? <> — <b className="eng-voice">{ENG_VOICE_NAMES[r.vi]}</b></> : null}. Press play, then choose the word you heard.</p>
      <div className="eng-hear-play">
        <EngPlayButton text={r.p[r.k]} vi={r.vi} className="mlb-go eng-big" label="Play the word" onPlay={() => setHeard(true)}/>
        <EngPlayButton text={r.p[r.k]} vi={r.vi} slow className="stt-btn" label="Play the word slowly" onPlay={() => setHeard(true)}/>
      </div>
      <div className="eng-choices" role="group" aria-label="Which word did you hear?">{r.p.map((w, k) => (
        <button key={k} type="button" disabled={!heard || said !== null} onClick={() => choose(k)}
          className={"mlb-opt eng-choice" + (said !== null && k === r.k ? " is-right" : "") + (said === k && k !== r.k ? " is-wrong" : "")}>{w}</button>))}</div>
      <div aria-live="polite">{said !== null ? <div className={"mlb-fb " + (said === r.k ? "is-ok" : "is-no")}>
        <b className="mlb-fb-h"><i className={"ph-fill " + (said === r.k ? (streak >= 3 ? "ph-fire" : "ph-check-circle") : "ph-x-circle")} aria-hidden="true"/>
          {said === r.k ? (streak >= 3 ? streak + " in a row!" : "Yes — “" + r.p[r.k] + "”.") : "It was “" + r.p[r.k] + "”."}</b>
        {said !== r.k ? <p>Hear both: <EngPlayButton text={r.p[0]} vi={r.vi} label={"Hear “" + r.p[0] + "”"}/> {r.p[0]} · <EngPlayButton text={r.p[1]} vi={r.vi} label={"Hear “" + r.p[1] + "”"}/> {r.p[1]}</p> : null}
        <button type="button" className="mlb-go" onClick={next}>{n + 1 >= ENG_SPEAK_ROUNDS ? "Finish" : "Next"}</button></div> : null}</div>
    </>}
  </section>;
}

/* 3 · Say it: the server's Nigerian-trained recogniser, then the browser's, then record-and-compare. */
function EngSay({ comp, sentences, onDone }) {
  const [i, setI] = React.useState(0), [phase, setPhase] = React.useState("idle"), [res, setRes] = React.useState(null), [msg, setMsg] = React.useState("");
  const [mode, setMode] = React.useState("server"), [mine, setMine] = React.useState("");
  const rec = React.useRef(null), chunks = React.useRef([]), timer = React.useRef(null);
  const text = sentences[i];
  React.useEffect(() => () => { try { rec.current && rec.current.stop(); } catch (_) {} clearTimeout(timer.current); }, []);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const finish = r => { setRes(r); setPhase("done"); if (onDone) onDone(); };
  const browserListen = () => {
    const s = new SR(); s.lang = "en-GB"; s.interimResults = false; s.maxAlternatives = 1;
    setPhase("rec"); setMsg("");
    s.onresult = e => { const heard = e.results[0][0].transcript; const words = engWordMatch(text, heard); finish({ heard, words, score: words.filter(w => w.ok).length / Math.max(1, words.length) }); };
    s.onerror = () => { setPhase("idle"); setMsg("Nothing was heard. Check the microphone is allowed, then try again."); };
    s.onend = () => setPhase(p => p === "rec" ? "idle" : p);
    s.start(); rec.current = s;
  };
  const start = async () => {
    setRes(null); setMsg("");
    if (mode === "browser" && SR) return browserListen();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { setMsg("The microphone is blocked. Allow it for this site in your browser settings, then press Speak again."); return; }
    const mr = new MediaRecorder(stream); chunks.current = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.current.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
      if (mode === "self") { setMine(URL.createObjectURL(blob)); finish(null); return; }
      setPhase("check");
      const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      try { finish(await NGGApi.member.mathslab.listen(comp, i, data, blob.type)); }
      catch (e) {
        const c = String((e && (e.code || e.message)) || "");
        const next = SR ? "browser" : "self"; setMode(next); setPhase("idle");
        if (next === "self") setMine(URL.createObjectURL(blob));
        setMsg(/not_configured/.test(c) ? (SR ? "Press Speak again — this device will listen." : "Listen to yourself and to the model, and compare.")
          : "That could not be checked just now. " + (SR ? "Press Speak again — this device will listen." : "Listen to yourself and to the model, and compare."));
      }
    };
    mr.start(); rec.current = mr; setPhase("rec");
    timer.current = setTimeout(() => { try { mr.state === "recording" && mr.stop(); } catch (_) {} }, 8000);
  };
  const stop = () => { clearTimeout(timer.current); try { rec.current && rec.current.stop(); } catch (_) {} };
  const nextSentence = () => { setI(x => (x + 1) % sentences.length); setRes(null); setPhase("idle"); setMine(""); setMsg(""); };
  const pct = res ? Math.round((res.score || 0) * 100) : 0;
  return <section className="mlb-card eng-say" aria-labelledby="eng-say-h">
    <h3 id="eng-say-h" className="mlb-h3">Say it</h3>
    <p className="mlb-meta">Sentence {i + 1} of {sentences.length}. Listen, then press Speak and say it clearly.</p>
    <p className="eng-sentence">{res && res.words ? res.words.map((w, k) => <span key={k} className={w.ok ? "eng-w is-ok" : "eng-w is-no"}>{w.w} </span>) : text}</p>
    <div className="eng-say-row">
      <EngPlayButton text={text} vi={i} label="Hear the sentence"/>
      <EngPlayButton text={text} vi={i} slow label="Hear the sentence slowly"/>
      {phase === "rec" ? <button type="button" className="mlb-go eng-big is-rec" onClick={stop}><i className="ph ph-stop-circle" aria-hidden="true"/>Stop</button>
        : <button type="button" className="mlb-go eng-big" onClick={start} disabled={phase === "check"}><i className="ph ph-microphone" aria-hidden="true"/>{phase === "check" ? "Checking…" : "Speak"}</button>}
    </div>
    <div aria-live="polite">
      {msg ? <p className="mlb-meta" role="status">{msg}</p> : null}
      {res && res.words ? <div className={"mlb-fb " + (pct >= 80 ? "is-ok" : "is-no")}>
        <b className="mlb-fb-h"><i className={"ph-fill " + (pct >= 80 ? "ph-check-circle" : "ph-ear")} aria-hidden="true"/>{pct >= 80 ? (pct === 100 ? "Every word came through!" : "Clear — " + pct + "% of the words came through.") : pct + "% of the words came through. The faded ones were not heard."}</b>
        {res.heard ? <p>Heard: “{res.heard}”</p> : null}
        {pct < 80 ? <p>Listen slowly, copy the rhythm, and try again.</p> : null}</div> : null}
      {mine ? <p className="eng-self">Your recording: <audio controls src={mine}/> Compare it with the model above.</p> : null}
    </div>
    {phase === "done" || mine ? <div className="mlb-actions"><button type="button" className="stt-btn" onClick={() => { setRes(null); setPhase("idle"); setMine(""); }}>Try again</button>
      {sentences.length > 1 ? <button type="button" className="mlb-go" onClick={nextSentence}>Next sentence</button> : null}</div> : null}
  </section>;
}

/* 4 · Hear and write: dictation. A recorded sentence is played and typed; each word is marked, so the
   ear, the spelling and the meaning are tested together (owner, 7 Nov 2026: "Add more interactive
   features"). Optional — it never holds the lesson. Capitals and punctuation are not marked here. */
function EngWrite({ sentences }) {
  const [i, setI] = React.useState(0), [val, setVal] = React.useState(""), [res, setRes] = React.useState(null), [heard, setHeard] = React.useState(false);
  const [score, setScore] = React.useState({ right: 0, tried: 0 });
  const t = sentences[i % sentences.length], vi = i + 1;
  const check = e => { if (e) e.preventDefault(); if (!heard || !val.trim() || res) return;
    const words = engWordMatch(t, val), all = words.every(w => w.ok);
    setRes({ words, all }); setScore(x => ({ right: x.right + (all ? 1 : 0), tried: x.tried + 1 })); };
  const next = () => { setI(x => x + 1); setVal(""); setRes(null); setHeard(false); };
  return <section className="mlb-card eng-write" aria-labelledby="eng-write-h">
    <h3 id="eng-write-h" className="mlb-h3">Hear and write</h3>
    <p className="mlb-meta">Listen, then type exactly what you hear. Every word is checked; capitals and punctuation are not.{score.tried ? <> <b>{score.right} of {score.tried} perfect.</b></> : null}</p>
    <div className="eng-hear-play">
      <EngPlayButton text={t} vi={vi} className="mlb-go eng-big" label="Play the sentence" onPlay={() => setHeard(true)}/>
      <EngPlayButton text={t} vi={vi} slow className="stt-btn" label="Play the sentence slowly" onPlay={() => setHeard(true)}/>
    </div>
    <form className="eng-write-row" onSubmit={check}>
      <input className="mlb-in eng-write-in" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        aria-label="Type the sentence you heard" placeholder={heard ? "Type what you heard" : "Play the sentence first"} value={val} disabled={!heard || !!res} onChange={e => setVal(e.target.value)}/>
      <button type="submit" className="mlb-go" disabled={!heard || !val.trim() || !!res}>Check</button>
    </form>
    <div aria-live="polite">{res ? <div className={"mlb-fb " + (res.all ? "is-ok" : "is-no")}>
      <b className="mlb-fb-h"><i className={"ph-fill " + (res.all ? "ph-check-circle" : "ph-x-circle")} aria-hidden="true"/>{res.all ? "Every word right." : res.words.filter(w => w.ok).length + " of " + res.words.length + " words right."}</b>
      <p className="eng-sentence">{res.words.map((w, k) => <React.Fragment key={k}><span className={"eng-w " + (w.ok ? "is-ok" : "is-no")}>{w.w}</span> </React.Fragment>)}</p>
      <button type="button" className="mlb-go" onClick={next}>Next sentence</button></div> : null}</div>
  </section>;
}

/* The lesson step: the parts this topic has, in order. Done once the ear has had its rounds and one
   sentence has been said (or, where a part is missing, the parts that exist). */
function EngSpeak({ comp, speak, onDone }) {
  Object.assign(engAudio, speak.audio || {});
  const [hearOk, setHearOk] = React.useState(!(speak.pairs && speak.pairs.length));
  const [sayOk, setSayOk] = React.useState(!(speak.say && speak.say.length));
  React.useEffect(() => { if (hearOk && sayOk && onDone) onDone(); }, [hearOk, sayOk]); // eslint-disable-line
  return <div className="mlb-stack eng-speak">
    {speak.how && speak.how.length ? <EngHow how={speak.how}/> : null}
    {speak.pairs && speak.pairs.length ? <EngHear pairs={speak.pairs} onDone={() => setHearOk(true)}/> : null}
    {speak.say && speak.say.length ? <EngSay comp={comp} sentences={speak.say} onDone={() => setSayOk(true)}/> : null}
    {speak.say && speak.say.length ? <EngWrite sentences={speak.say}/> : null}
  </div>;
}
