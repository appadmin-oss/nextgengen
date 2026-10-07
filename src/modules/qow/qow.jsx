/* ============================================================================
   Quote of the week (home page) — one saying a week, Hausa → Igbo → Yorùbá.

   The rotation and the audio live in api/_lib/domain/wisdom.php. A stored clip
   (a staff voice-over, or a native-language rendering made once) plays first;
   failing that, the browser's own voice is used ONLY if it has one for the
   language — reading Yorùbá with an English voice is worse than silence.

   It is built for somebody learning the saying, not only reading it:
   - Speed: the saying can be heard at three quarters or half speed. Clips keep
     their pitch (the browser's own time-stretch), so slower is not deeper.
   - Loop: the reading starts again after a pause until it is stopped, which
     is how a line is learned by ear.
   - English too: after the saying, a breath, then its meaning in English —
     how a person would teach it, rather than two recordings pressed together.
   - Share: the share card (qow-card.jsx) — the saying as an image in three
     sizes and six palettes — with the plain text one press away.
   A clip that will not play says so and offers the button again; it never
   leaves the control looking like it is working.
   ========================================================================== */

const QOW_LANG = { hausa: "Hausa", igbo: "Igbo", yoruba: "Yorùbá" };
const QOW_NATIVE = {
  hausa:  { riddle: "Kacici-kacici", proverb: "Karin magana" },
  igbo:   { riddle: "Gwam gwam gwam", proverb: "Ilụ" },
  yoruba: { riddle: "Àlọ́", proverb: "Òwe" },
};
const QOW_KIND = { riddle: "Riddle", proverb: "Proverb", quote: "Quote" };
/* The speeds offered, and how the status line names each. */
const QOW_RATES = [[1, "1×", ""], [0.75, "0.75×", "slower"], [0.5, "0.5×", "at half speed"]];
const QOW_GAP_MS = 700;      // between the saying and its English
const QOW_LOOP_MS = 1600;    // between one reading and the next, when looping
const QOW_TTS_RATE = 0.9;    // the browser voice's own pace before any slowing

function qowBrowserVoice(code) {
  try {
    if (!code || !window.speechSynthesis) return null;
    return speechSynthesis.getVoices().find(v => (v.lang || "").toLowerCase().split(/[-_]/)[0] === code) || null;
  } catch (_) { return null; }
}
function qowRead(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (_) { return fallback; } }
function qowWrite(key, v) { try { localStorage.setItem(key, String(v)); } catch (_) {} }
/** A stored speed, or 1 when it is missing or not one we offer. */
function qowStoredRate() { const r = parseFloat(qowRead("ngg_qow_rate", "1")); return QOW_RATES.some(x => x[0] === r) ? r : 1; }

function QuoteOfWeek() {
  const [d, setD] = React.useState(null);
  const [reveal, setReveal] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  // "" (idle) | "native" | "gap" | "english" | "again" — which part of the reading is on.
  const [phase, setPhase] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [withEn, setWithEn] = React.useState(() => qowRead("ngg_qow_en", "1") !== "0");
  const [rate, setRate] = React.useState(qowStoredRate);
  const [loop, setLoop] = React.useState(false);
  const [note, setNote] = React.useState("");          // a one-off message: copied, failed
  const [bVoice, setBVoice] = React.useState(null);
  const [sharing, setSharing] = React.useState(false);
  const nativeRef = React.useRef(null);
  const enRef = React.useRef(null);
  const timer = React.useRef(0);
  const noteTimer = React.useRef(0);
  // The latest settings, for callbacks that outlive the render that made them (audio events, timers).
  const live = React.useRef({});
  live.current = { rate, loop, withEn };

  React.useEffect(() => {
    let alive = true;
    NGGApi.public.wisdomWeek().then(r => { if (alive && r && r.saying) setD(r); }).catch(() => {});
    return () => { alive = false; clearTimeout(timer.current); clearTimeout(noteTimer.current); };
  }, []);
  const s = d && d.saying;
  React.useEffect(() => {
    if (!s || s.audioUrl || !window.speechSynthesis) return undefined;
    const pick = () => setBVoice(qowBrowserVoice(s.langCode));
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
    return () => { speechSynthesis.removeEventListener("voiceschanged", pick); try { speechSynthesis.cancel(); } catch (_) {} };
  }, [s]);
  // A speed chosen mid-reading applies to the clip that is playing, at once.
  React.useEffect(() => {
    [nativeRef.current, enRef.current].forEach(a => { if (a) { a.playbackRate = rate; a.preservesPitch = true; } });
  }, [rate, s]);
  if (!s) return null;

  const lang = QOW_LANG[s.language] || "";
  const hasEn = !!(s.audioUrl && s.audioUrlEn);
  const canListen = !!(s.audioUrl || bVoice);
  const playing = phase !== "";

  const say = (text) => { clearTimeout(noteTimer.current); setNote(text); noteTimer.current = setTimeout(() => setNote(""), 4000); };
  const stop = () => {
    clearTimeout(timer.current);
    [nativeRef.current, enRef.current].forEach(a => { if (a) { a.pause(); a.currentTime = 0; } });
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (_) {}
    setPhase(""); setProgress(0);
  };
  const failed = () => { stop(); say("It didn’t play. Try again."); };
  const playClip = (a, p) => {
    if (!a) return failed();
    setPhase(p); setProgress(0);
    a.currentTime = 0; a.playbackRate = live.current.rate; a.preservesPitch = true;
    a.play().catch(failed);
  };
  const speak = () => {
    try { speechSynthesis.cancel(); } catch (_) {}
    const u = new SpeechSynthesisUtterance(s.text);
    u.voice = bVoice; u.lang = bVoice.lang; u.rate = QOW_TTS_RATE * live.current.rate;
    u.onend = () => finished();
    u.onerror = e => { if (e && e.error !== "interrupted" && e.error !== "canceled") failed(); };
    setPhase("native"); setProgress(0);
    speechSynthesis.speak(u);
  };
  const start = () => { if (s.audioUrl) playClip(nativeRef.current, "native"); else speak(); };
  // The end of one whole reading: start again after a pause when looping, else rest.
  const finished = () => {
    if (live.current.loop) { setPhase("again"); setProgress(1); timer.current = setTimeout(start, QOW_LOOP_MS); }
    else stop();
  };
  const nativeEnded = () => {
    if (hasEn && live.current.withEn) { setPhase("gap"); setProgress(1); timer.current = setTimeout(() => playClip(enRef.current, "english"), QOW_GAP_MS); }
    else finished();
  };
  const toggle = () => { if (playing) stop(); else { setNote(""); start(); } };

  const chooseRate = (r) => {
    setRate(r); qowWrite("ngg_qow_rate", r);
    // The browser voice cannot change pace mid-sentence, so the line starts again at the new one.
    if (!s.audioUrl && phase === "native") { live.current.rate = r; speak(); }
  };
  const onRateKey = (e, i) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = QOW_RATES[(i + step + QOW_RATES.length) % QOW_RATES.length][0];
    chooseRate(next);
    const el = e.currentTarget.parentNode.querySelector('[data-rate="' + next + '"]');
    if (el) el.focus();
  };
  const toggleEn = () => {
    const v = !withEn; setWithEn(v); qowWrite("ngg_qow_en", v ? "1" : "0");
    if (!v && (phase === "english" || phase === "gap")) finished();
  };
  const toggleLoop = () => {
    const v = !loop; setLoop(v);
    if (!v && phase === "again") stop();
  };
  /* Share opens the share card (qow-card.jsx): the saying as an image in the
     handoff's three sizes and six palettes, with the text — saying, its
     English, and the link — still one press away for a plain-text share. */
  const shareText = [s.text, s.translation ? "“" + s.translation + "”" : "", "— " + lang + " " + (QOW_KIND[s.kind] || "").toLowerCase() + ", Quote of the week at Next Generation Genius", window.location.origin + "/"].filter(Boolean).join("\n");
  const share = () => setSharing(true);
  const onTime = (e) => { const a = e.currentTarget; setProgress(a.duration ? a.currentTime / a.duration : 0); };

  const native = (QOW_NATIVE[s.language] || {})[s.kind];
  const week = d.week ? fmtDayMonth(d.week + "T12:00:00") : "";
  const pace = (QOW_RATES.find(x => x[0] === rate) || QOW_RATES[0])[2];
  const R = 26, C = 2 * Math.PI * R;
  const status = note
    || (phase === "english" ? "In English…" : phase === "gap" ? "…" : phase === "again" ? "Again in a moment…"
      : phase === "native" ? "In " + lang + (pace ? ", " + pace : "") + "…"
      : "Hear it in " + lang + (pace ? " " + pace : "") + (hasEn && withEn ? ", then English" : ""));

  return (
    <section className={"qow qow-" + s.language} aria-labelledby="qow-h">
      <div className="qow-inner">
        <div className="qow-head">
          <span className="qow-eyebrow" id="qow-h">Quote of the week{week ? " · from " + week : ""}</span>
          <span className="qow-tag">{lang}{native ? " · " + native : ""} <span className="qow-tag-en">{QOW_KIND[s.kind] || ""}</span></span>
        </div>
        <blockquote className="qow-quote" lang={s.langCode}>
          <p className={"qow-text" + (phase === "native" ? " is-speaking" : "")}>{s.text}</p>
          {s.translation && <p className={"qow-tr" + (phase === "english" ? " is-speaking" : "")} lang="en">{s.translation}</p>}
        </blockquote>

        <div className="qow-actions">
          {canListen && (
            <div className="qow-player">
              <button type="button" className={"qow-play" + (playing ? " is-on" : "")} onClick={toggle}
                      aria-pressed={playing} aria-label={(playing ? "Stop" : "Listen to") + " the " + lang}>
                <svg viewBox="0 0 60 60" aria-hidden="true" className="qow-ring">
                  <circle cx="30" cy="30" r={R} className="qow-ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - progress)}/>
                </svg>
                <span className={"qow-play-ico" + (playing ? " is-stop" : "")} aria-hidden="true"/>
              </button>
              <div className="qow-player-side">
                <span className="qow-listen" aria-live="polite">{status}</span>
                <div className="qow-opts">
                  <div className="qow-speed" role="radiogroup" aria-label="Speed">
                    {QOW_RATES.map(([r, label], i) => (
                      <button key={r} type="button" role="radio" data-rate={r} aria-checked={rate === r} tabIndex={rate === r ? 0 : -1}
                              className={"qow-speed-opt" + (rate === r ? " is-on" : "")} onClick={() => chooseRate(r)} onKeyDown={e => onRateKey(e, i)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className={"qow-chip" + (loop ? " is-on" : "")} aria-pressed={loop} onClick={toggleLoop}>Loop</button>
                  {hasEn && <button type="button" className={"qow-chip qow-entoggle" + (withEn ? " is-on" : "")} aria-pressed={withEn} onClick={toggleEn}>English too</button>}
                </div>
              </div>
            </div>
          )}
          {!canListen && note && <span className="qow-listen" aria-live="polite">{note}</span>}
          <span className="qow-spacer"/>
          <div className="qow-btns">
            {s.kind === "riddle" && s.answer && (
              <button type="button" className={"qow-btn" + (reveal ? " is-on" : "")} aria-pressed={reveal} onClick={() => setReveal(v => !v)}>
                {reveal ? "Hide answer" : "Reveal the answer"}
              </button>
            )}
            {s.meaning && (
              <button type="button" className={"qow-btn" + (open ? " is-on" : "")} aria-expanded={open} aria-controls="qow-meaning" onClick={() => setOpen(v => !v)}>
                {open ? "Close" : "What it means"}
              </button>
            )}
            <button type="button" className="qow-btn qow-share" aria-haspopup="dialog" onClick={share}>Share</button>
          </div>
        </div>

        <div className="qow-reveals" aria-live="polite">
          {reveal && s.answer && (
            <div className="qow-answer">
              <span className="qow-k">Answer</span>
              <span className="qow-a" lang={s.langCode}>{s.answer}</span>
              {s.answerTranslation && <span className="qow-a-en">{s.answerTranslation}</span>}
            </div>
          )}
          {open && <p className="qow-meaning" id="qow-meaning"><span className="qow-k">Deeper meaning</span>{s.meaning}</p>}
        </div>
        {s.audioUrl && <audio ref={nativeRef} src={s.audioUrl} preload="none" onEnded={nativeEnded} onError={() => phase && failed()} onTimeUpdate={e => phase === "native" && onTime(e)}/>}
        {sharing && <QowShareSheet saying={s} weekYmd={d.week} shareText={shareText} onClose={() => setSharing(false)}/>}
        {hasEn && <audio ref={enRef} src={s.audioUrlEn} preload="none" onEnded={finished} onError={() => phase && failed()} onTimeUpdate={e => phase === "english" && onTime(e)}/>}
      </div>
    </section>
  );
}
