/* ============================================================================
   Lesson blocks — the diagrams a lesson needs, drawn from its own text.

   A music lesson that says "play C, E and G" is asking a ten-year-old to hold
   a keyboard in their head. A chord lesson that names Am without showing the
   shape is a lesson for somebody who already plays. The information was always
   in the lesson; what was missing was the picture.

   WHY FENCED BLOCKS AND NOT A NEW FIELD
   -------------------------------------
   A lesson body is Markdown, stored as text, and it has to survive four
   journeys: the member's screen, the instructor's editor, the Word download
   and the printed PDF. A new `diagram` column would be present on one of those
   and absent from the rest.

   So the notation lives in the body as a fenced block, and this file upgrades
   it on screen:

       ```keys C E G                 a keyboard with those notes down
       ```chord Am                   a guitar chord box
       ```staff C D E F G            notes on a treble staff
       ```swatch #e4032b Rust        colour chips, with their contrast
       ```steps 10 Warm up           a timed run of the session

   Everywhere this file is not loaded — the Word export, a plain-text copy, an
   email — the fence degrades to exactly what it says, which still reads:
   "keys C E G". That is the test a notation has to pass to live in a body.

   NO VENDOR. Every drawing here is hand-built SVG. abcjs and VexFlow are
   better engravers than this will ever be, and both are a runtime dependency
   this repository does not take (CLAUDE.md §1). What is drawn here is what a
   Saturday lesson actually needs: which key, which finger, which fret.
   ========================================================================== */

/* ── Notes and keyboards ─────────────────────────────────────────────────── */

const LB_SEMITONE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const LB_WHITE = ["C", "D", "E", "F", "G", "A", "B"];

/* ── Hearing it, and stepping through it ─────────────────────────────────
 *
 * A diagram of a chord tells a learner where the fingers go. It cannot tell
 * them what the chord SOUNDS like, and for most of these lessons the sound is
 * the thing being taught. So every music block can be played, with the notes
 * lighting up one at a time as they sound.
 *
 * WEB AUDIO, NOT A FILE AND NOT A LIBRARY. A sampled instrument would be
 * megabytes per lesson over a connection a child is paying for (see the
 * hosting plan), and an audio library is a runtime dependency this repository
 * does not take. An oscillator with a short envelope is not a piano, and it is
 * enough to hear an interval, a chord shape or a wrong note — which is what
 * the lesson is asking.
 *
 * The context is built on the FIRST PRESS and never before: browsers refuse
 * audio that the learner did not ask for, and so should we. Everything here
 * degrades to the silent diagram when audio is unavailable, which is the case
 * in the test environment and on a locked-down school device.
 */
let LB_AUDIO = null;
function lbAudio() {
  if (LB_AUDIO !== null) return LB_AUDIO;
  try {
    const C = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    LB_AUDIO = C ? new C() : false;
  } catch (e) { LB_AUDIO = false; }
  return LB_AUDIO;
}

/** MIDI note number → hertz. A4 (69) is 440. */
function lbFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

/** One short note. Silent, harmlessly, wherever there is no audio. */
function lbPlay(midi, when, dur) {
  const ctx = lbAudio();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime + (when || 0), d = dur || 0.55;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = lbFreq(midi);
    /* A plucked envelope: a fast attack and a long decay. A plain on/off
       square clicks at both ends and sounds like a fault rather than a note. */
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + d + 0.05);
  } catch (e) { /* a device that will not play is not a broken lesson */ }
}

/** Does this learner want motion? Respected, not assumed (CLAUDE.md §9). */
function lbStill() {
  try { return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch (e) { return false; }
}

/**
 * Step through a list of {midi} one at a time, lighting each as it sounds.
 * Returns [activeIndex, play, playing] for a block to render against.
 *
 * With reduced motion the notes still sound, in order — the preference is
 * about movement on screen, not about withholding the lesson.
 */
function lbUseSequence(items, gap) {
  const [at, setAt] = React.useState(-1);
  const timers = React.useRef([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const play = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const step = gap || 0.5;
    items.forEach((it, i) => {
      lbPlay(it.midi, i * step, step * 1.6);
      timers.current.push(setTimeout(() => setAt(i), i * step * 1000));
    });
    timers.current.push(setTimeout(() => setAt(-1), items.length * step * 1000 + 400));
  }, [items, gap]);
  return [at, play, at >= 0];
}

/** The play control every music block carries, worded for what it does. */
function LbPlayBtn({ onPlay, label, playing }) {
  return (
    <button type="button" className={"lb-play" + (playing ? " is-on" : "")} onClick={onPlay} aria-label={label}>
      <span aria-hidden="true">▶</span> Hear it
    </button>
  );
}

/** "C", "F#", "Bb4" → {pc: 0-11, octave} — or null when it is not a note. */
function lbNote(tok) {
  const m = String(tok || "").trim().match(/^([A-Ga-g])([#b]?)(\d)?$/);
  if (!m) return null;
  const name = m[1].toUpperCase() + (m[2] || "");
  if (!(name in LB_SEMITONE)) return null;
  return { pc: LB_SEMITONE[name], octave: m[3] ? Number(m[3]) : 4, name };
}

/**
 * A piano keyboard with named notes held down.
 *
 * Two octaves from C, which is what every lesson in the Foundation year works
 * inside. Black keys are drawn after the white ones so they sit on top, the
 * way they do on the instrument.
 */
function LbKeys({ args }) {
  const wanted = String(args || "").split(/[\s,]+/).map(lbNote).filter(Boolean);
  const want = new Set(wanted.map(n => n.pc));
  /* Heard in the order they were written, which is what makes C-E-G a chord
     the learner recognises rather than three circles on a picture. */
  const seq = React.useMemo(() => wanted.map(n => ({ midi: (n.octave + 1) * 12 + n.pc, pc: n.pc })), [args]);
  const [at, play, playing] = lbUseSequence(seq, 0.42);
  const lit = at >= 0 ? seq[at].pc : null;
  const octaves = 2, whitePerOct = 7, w = 26, h = 104;
  const whites = [];
  for (let o = 0; o < octaves; o++) for (let i = 0; i < whitePerOct; i++) whites.push({ o, i, name: LB_WHITE[i], pc: LB_SEMITONE[LB_WHITE[i]] });
  const blacksAfter = [0, 1, 3, 4, 5];   // a black key follows C D F G A
  const label = wanted.length ? wanted.map(n => n.name).join(", ") : "none";

  return (
    <figure className="lb lb-keys">
      <svg viewBox={`0 0 ${whites.length * w} ${h}`} className="lb-svg" role="img"
           aria-label={`Piano keyboard, two octaves. Notes held down: ${label}.`}>
        {whites.map((k, n) => (
          <g key={"w" + n}>
            <rect x={n * w} y="0" width={w} height={h} rx="3"
                  className={"lb-key lb-key-white" + (want.has(k.pc) ? " is-on" : "") + (lit === k.pc ? " is-sounding" : "")}/>
            <text x={n * w + w / 2} y={h - 9} className="lb-key-label">{k.name}</text>
          </g>
        ))}
        {whites.map((k, n) => {
          if (!blacksAfter.includes(k.i)) return null;
          const pc = (k.pc + 1) % 12;
          return <rect key={"b" + n} x={n * w + w * 0.68} y="0" width={w * 0.64} height={h * 0.62} rx="2"
                       className={"lb-key lb-key-black" + (want.has(pc) ? " is-on" : "") + (lit === pc ? " is-sounding" : "")}/>;
        })}
      </svg>
      {!!seq.length && <div className="lb-bar">
        <LbPlayBtn onPlay={play} playing={playing} label={`Play ${label} on the keyboard`}/>
        {/* Every note is also its own button. Nothing here needs a drag, and a
            learner checking ONE note should not have to sit through all of
            them (CLAUDE.md §9). */}
        <span className="lb-notes">
          {wanted.map((n, i) => (
            <button key={i} type="button" className={"lb-pitch" + (at === i ? " is-on" : "")}
                    aria-label={`Play ${n.name}`} onClick={() => lbPlay((n.octave + 1) * 12 + n.pc, 0, 0.6)}>{n.name}</button>
          ))}
        </span>
      </div>}
      <figcaption className="lb-cap">Keys: <b>{label}</b></figcaption>
    </figure>
  );
}

/* ── Guitar chords ───────────────────────────────────────────────────────── */

/* Fret per string, low E to high E. -1 is a muted string, 0 is open.
   The finger row is what to press with, which is the part a beginner is never
   told and then gets wrong for a year. */
const LB_CHORDS = {
  Am:  { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  Em:  { frets: [0, 2, 2, 0, 0, 0],  fingers: [0, 2, 3, 0, 0, 0] },
  C:   { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  G:   { frets: [3, 2, 0, 0, 0, 3],  fingers: [2, 1, 0, 0, 0, 3] },
  D:   { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm:  { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  E:   { frets: [0, 2, 2, 1, 0, 0],  fingers: [0, 2, 3, 1, 0, 0] },
  A:   { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  F:   { frets: [1, 3, 3, 2, 1, 1],  fingers: [1, 3, 4, 2, 1, 1] },
};

/* Open-string pitches, low E to high E, as MIDI numbers. A fretted string
   sounds that many semitones higher, which is the whole of guitar tuning. */
const LB_STRINGS = [40, 45, 50, 55, 59, 64];

/** One chord box. Drawn, and strummed low string to high when pressed. */
function LbChordBox({ name, frets, fingers }) {
  const sw = 18, fh = 24, pad = 16;
  const sounding = React.useMemo(
    () => frets.map((f, i) => (f < 0 ? null : { midi: LB_STRINGS[i] + f, string: i })).filter(Boolean), [name]);
  const [at, play, playing] = lbUseSequence(sounding, 0.11);
  const liveString = at >= 0 ? sounding[at].string : -1;
  const said = frets.map((f, i) => `string ${i + 1} ${f < 0 ? "muted" : f === 0 ? "open" : "fret " + f}`).join(", ");
  return (
    <figure className="lb-chord">
      <svg viewBox={`0 0 ${pad * 2 + sw * 5} ${pad * 2 + fh * 4 + 14}`} className="lb-svg" role="img"
           aria-label={`${name} chord: ${said}.`}>
        {[0, 1, 2, 3, 4, 5].map(i => <line key={"s" + i} x1={pad + i * sw} y1={pad} x2={pad + i * sw} y2={pad + fh * 4}
                                           className={"lb-fret-line" + (liveString === i ? " is-sounding" : "")}/>)}
        {[0, 1, 2, 3, 4].map(f => <line key={"f" + f} x1={pad} y1={pad + f * fh} x2={pad + sw * 5} y2={pad + f * fh}
                                        className={"lb-fret-line" + (f === 0 ? " is-nut" : "")}/>)}
        {frets.map((f, i) => {
          const x = pad + i * sw, live = liveString === i;
          if (f < 0) return <text key={"x" + i} x={x} y={pad - 5} className="lb-chord-mark">×</text>;
          if (f === 0) return <circle key={"o" + i} cx={x} cy={pad - 9} r="4" className={"lb-chord-open" + (live ? " is-sounding" : "")}/>;
          return (
            <g key={"d" + i}>
              <circle cx={x} cy={pad + f * fh - fh / 2} r="7.5" className={"lb-chord-dot" + (live ? " is-sounding" : "")}/>
              {fingers[i] > 0 && <text x={x} y={pad + f * fh - fh / 2 + 4} className="lb-chord-finger">{fingers[i]}</text>}
            </g>
          );
        })}
      </svg>
      {/* Name and play together, under the box they belong to. Three chords
          used to produce three full-width "Hear it" buttons and three
          captions at three different heights, which read as a broken layout
          rather than as three chords. */}
      <figcaption className="lb-chord-foot">
        <b className="lb-chord-name">{name}</b>
        <button type="button" className={"lb-chord-play" + (playing ? " is-on" : "")}
                onClick={play} aria-label={`Strum the ${name} chord`}>
          <span aria-hidden="true">▶</span>
        </button>
      </figcaption>
    </figure>
  );
}

function LbChord({ args }) {
  const names = String(args || "").split(/[\s,]+/).filter(Boolean);
  return (
    <figure className="lb lb-chords">
      <div className="lb-chord-row">
        {names.map((raw, idx) => {
          const key = Object.keys(LB_CHORDS).find(k => k.toLowerCase() === raw.toLowerCase());
          if (!key) return <div key={idx} className="lb-chord-missing">No diagram for <b>{raw}</b> yet — ask your instructor to show you.</div>;
          /* One box, drawn once (LbChordBox). It used to be inlined here and
             again nowhere else, which was fine until the box needed state of
             its own to light the string that is sounding — a component cannot
             hold state inside a .map callback. */
          return <LbChordBox key={idx} name={key} frets={LB_CHORDS[key].frets} fingers={LB_CHORDS[key].fingers}/>;
        })}
      </div>
      <p className="lb-note">× don't play · ○ open string · numbers are which finger presses</p>
    </figure>
  );
}

/* ── Staff notation ──────────────────────────────────────────────────────── */

/**
 * A single treble staff. Enough to show a scale, a phrase or an interval —
 * which is what these lessons ask for — and deliberately not an engraver.
 * Anything that needs beams, ties or two voices belongs on real paper.
 */
function LbStaff({ args }) {
  const notes = String(args || "").split(/[\s,]+/).map(lbNote).filter(Boolean);
  const step = 34, pad = 30, lh = 9;         // line height: a step is half of it
  const W = pad * 2 + Math.max(1, notes.length) * step;
  const top = 28;                            // y of the top staff line
  // Treble: E4 sits on the bottom line. Position counted in staff steps up.
  const diat = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const yOf = n => {
    const steps = (n.octave - 4) * 7 + diat[n.name[0]] - diat.E;
    return top + lh * 4 - steps * (lh / 2);
  };
  /* The box is sized to the notes, not to a guess.
     A fixed height left a dead band above the staff on every lesson that
     stays in the middle of the range — which is every Foundation lesson —
     and pushed the note names a long way under the noteheads they name.
     Keeping a label beside the thing it labels is the one piece of
     instructional-design research worth hard-coding: a learner should not
     have to hold "the fourth one along" in their head to read a diagram. */
  const ys = notes.map(yOf);
  const hiY = ys.length ? Math.min(...ys) : top;
  const loY = ys.length ? Math.max(...ys) : top + lh * 4;
  const yTop = Math.min(top, hiY) - lh * 1.6;                 // room for ledger lines above
  const nameY = Math.max(top + lh * 4, loY) + lh * 2.1;       // names just under the lowest note
  const H = nameY - yTop + lh * 1.2;
  const said = notes.length ? notes.map(n => n.name).join(", ") : "none";
  /* Read left to right, as it is played. Seeing the notehead light as the
     pitch sounds is how a learner connects the dot on the line to the sound,
     which is the entire point of notation and the hardest part to teach from
     a still picture. */
  const seq = React.useMemo(() => notes.map(n => ({ midi: (n.octave + 1) * 12 + n.pc })), [args]);
  const [at, play, playing] = lbUseSequence(seq, 0.5);
  return (
    <figure className="lb lb-staff">
      <svg viewBox={`0 ${yTop} ${W} ${H}`} className="lb-svg" role="img" aria-label={`Treble staff. Notes: ${said}.`}>
        {[0, 1, 2, 3, 4].map(i => <line key={i} x1="10" y1={top + i * lh} x2={W - 10} y2={top + i * lh} className="lb-staff-line"/>)}
        <text x="14" y={top + lh * 3.4} className="lb-clef">𝄞</text>
        {notes.map((n, i) => {
          const x = pad + 24 + i * step, y = yOf(n);
          const ledger = [];
          for (let ly = top + lh * 5; ly <= y; ly += lh) ledger.push(ly);        // below
          for (let ly = top - lh; ly >= y; ly -= lh) ledger.push(ly);            // above
          return (
            <g key={i}>
              {ledger.map((ly, j) => <line key={j} x1={x - 11} y1={ly} x2={x + 11} y2={ly} className="lb-staff-line"/>)}
              <ellipse cx={x} cy={y} rx="6.2" ry="4.6" className={"lb-note-head" + (at === i ? " is-sounding" : "")} transform={`rotate(-18 ${x} ${y})`}/>
              <line x1={x + 6} y1={y} x2={x + 6} y2={y - 30} className="lb-note-stem"/>
              <text x={x} y={nameY} className={"lb-note-name" + (at === i ? " is-sounding" : "")}>{n.name}</text>
            </g>
          );
        })}
      </svg>
      {!!seq.length && <div className="lb-bar">
        <LbPlayBtn onPlay={play} playing={playing} label={`Play the notes: ${said}`}/>
        <span className="lb-notes">
          {notes.map((n, i) => (
            <button key={i} type="button" className={"lb-pitch" + (at === i ? " is-on" : "")}
                    aria-label={`Play ${n.name}`} onClick={() => lbPlay((n.octave + 1) * 12 + n.pc, 0, 0.6)}>{n.name}</button>
          ))}
        </span>
      </div>}
    </figure>
  );
}

/* ── Colour, for the design courses ──────────────────────────────────────── */

/** Relative luminance → the contrast ratio the programme already holds itself
 *  to (§9: 4.5:1 for body text). A palette block says whether its own colours
 *  pass, because a swatch that fails is a lesson in what not to ship. */
function lbLuminance(hex) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const v = [0, 2, 4].map(i => {
    const c = parseInt(f.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function lbContrast(a, b) {
  const l1 = lbLuminance(a), l2 = lbLuminance(b);
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
}

function LbSwatch({ args }) {
  const items = String(args || "").split("|").map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(#[0-9a-f]{3,6})\s*(.*)$/i);
    return m ? { hex: m[1], label: m[2] || m[1] } : null;
  }).filter(Boolean);
  return (
    <figure className="lb lb-swatches">
      <div className="lb-swatch-row">
        {items.map((it, i) => {
          /* Two readings, not one. The question a design lesson actually asks
             is "can I set words IN this colour", and the answer differs on a
             white page and a dark one — a gold that is unreadable on white is
             fine on black. An earlier version reported max(on white, on
             black), which is the contrast of INK ON THE CHIP: that number can
             never fall below 4.58:1 for any colour whatsoever, so its "fails"
             verdict was unreachable and its "passes" meant nothing. */
          const onWhite = lbContrast(it.hex, "#ffffff"), onBlack = lbContrast(it.hex, "#000000");
          const ink = onWhite >= onBlack ? "#ffffff" : "#000000";
          const reads = [{ on: "white", r: onWhite }, { on: "black", r: onBlack }];
          return (
            <div key={i} className="lb-swatch">
              <div className="lb-swatch-chip" style={{ background: it.hex, color: ink }} aria-hidden="true"/>
              <b className="lb-swatch-name">{it.label}</b>
              <span className="lb-swatch-hex">{it.hex.toUpperCase()}</span>
              {reads.map(v => (
                <span key={v.on} className={"lb-swatch-verdict " + (v.r >= 4.5 ? "is-pass" : "is-fail")}>
                  <span className="lb-swatch-ratio">{v.r.toFixed(1) + ":1"}</span>
                  {" as text on " + v.on + " — " + (v.r >= 4.5 ? "passes" : "too faint")}
                  {/* The ratio is a number a learner has no feel for, so the
                      sentence is also SET in that colour on that ground.
                      Seeing "too faint" actually be too faint to read is the
                      lesson; the figure beside it is only the evidence. */}
                  <span className="lb-swatch-demo" style={{ background: v.on === "white" ? "#ffffff" : "#000000", color: it.hex }}
                        aria-hidden="true">Can you read this?</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/* ── The shape of the session ────────────────────────────────────────────── */

/** `steps 10 Warm up | 30 Learn | 40 Play | 10 Pack down` — the ninety minutes,
 *  drawn to scale, so a learner can see where the time actually goes. */
function LbSteps({ args }) {
  const items = String(args || "").split("|").map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(\d+)\s+(.*)$/);
    return m ? { mins: Number(m[1]), label: m[2] } : { mins: 0, label: s };
  });
  const total = items.reduce((n, x) => n + x.mins, 0) || 1;

  /* A real clock for the session, because the picture answers "how long is
     this meant to take" and an instructor on a Saturday needs "how long has
     it taken". It counts in real minutes, announces the stage change politely
     for a screen reader, and can be stopped — a timer with no stop is a
     pressure device, not a teaching one. */
  const [run, setRun] = React.useState(false);
  const [sec, setSec] = React.useState(0);
  React.useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setSec(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [run]);
  let acc = 0, live = -1;
  const mins = sec / 60;
  items.forEach((it, i) => { if (mins >= acc && mins < acc + it.mins) live = i; acc += it.mins; });
  if (run && mins >= total) live = items.length - 1;
  const mmss = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");

  return (
    <figure className="lb lb-steps">
      <ol className="lb-step-list">
        {items.map((it, i) => (
          <li key={i} className={"lb-step" + (live === i ? " is-now" : "") + (live > i ? " is-done" : "")}
              style={{ "--lb-share": (it.mins / total * 100) + "%" }}>
            <span className="lb-step-bar" aria-hidden="true"/>
            <span className="lb-step-min">{it.mins} min</span>
            <span className="lb-step-label">{it.label}</span>
          </li>
        ))}
      </ol>
      <div className="lb-bar">
        <button type="button" className={"lb-play" + (run ? " is-on" : "")} aria-pressed={run}
                aria-label={run ? "Pause the session timer" : "Start the session timer"} onClick={() => setRun(r => !r)}>
          <span aria-hidden="true">{run ? "❚❚" : "▶"}</span> {run ? "Pause" : "Start"}
        </button>
        <button type="button" className="lb-play is-ghost" aria-label="Reset the session timer to zero"
                onClick={() => { setRun(false); setSec(0); }}>Reset</button>
        <span className="lb-clock" role="timer" aria-live="off">{mmss}</span>
        <span className="sr-only" aria-live="polite">{live >= 0 ? "Now: " + items[live].label : ""}</span>
      </div>
      <figcaption className="lb-cap">{total} minutes in total</figcaption>
    </figure>
  );
}

/* ── The registry the markdown renderer asks ─────────────────────────────── */

const LESSON_BLOCKS = {
  keys: LbKeys,
  chord: LbChord, chords: LbChord,
  staff: LbStaff, notes: LbStaff,
  swatch: LbSwatch, palette: LbSwatch,
  steps: LbSteps,
};

/**
 * Does this fence open a lesson diagram? Returns the component and its
 * arguments, or null — in which case the markdown renderer keeps its own
 * behaviour and the block stays a code block, which is what a Coding lesson
 * wants.
 */
function lessonBlockFor(lang, firstLine) {
  const key = String(lang || "").toLowerCase();
  const C = LESSON_BLOCKS[key];
  if (!C) return null;
  return { Component: C, args: firstLine };
}
