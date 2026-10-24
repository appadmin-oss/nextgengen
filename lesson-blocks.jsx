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
                  className={"lb-key lb-key-white" + (want.has(k.pc) ? " is-on" : "")}/>
            <text x={n * w + w / 2} y={h - 9} className="lb-key-label">{k.name}</text>
          </g>
        ))}
        {whites.map((k, n) => {
          if (!blacksAfter.includes(k.i)) return null;
          const pc = (k.pc + 1) % 12;
          return <rect key={"b" + n} x={n * w + w * 0.68} y="0" width={w * 0.64} height={h * 0.62} rx="2"
                       className={"lb-key lb-key-black" + (want.has(pc) ? " is-on" : "")}/>;
        })}
      </svg>
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

function LbChord({ args }) {
  const names = String(args || "").split(/[\s,]+/).filter(Boolean);
  return (
    <figure className="lb lb-chords">
      <div className="lb-chord-row">
        {names.map((raw, idx) => {
          const key = Object.keys(LB_CHORDS).find(k => k.toLowerCase() === raw.toLowerCase());
          if (!key) return <div key={idx} className="lb-chord-missing">No diagram for <b>{raw}</b> yet — ask your instructor to show you.</div>;
          const { frets, fingers } = LB_CHORDS[key];
          const sw = 18, fh = 24, pad = 16;
          const said = frets.map((f, i) => `string ${i + 1} ${f < 0 ? "muted" : f === 0 ? "open" : "fret " + f}`).join(", ");
          return (
            <figure key={idx} className="lb-chord">
              <svg viewBox={`0 0 ${pad * 2 + sw * 5} ${pad * 2 + fh * 4 + 14}`} className="lb-svg" role="img"
                   aria-label={`${key} chord: ${said}.`}>
                {[0, 1, 2, 3, 4, 5].map(i => <line key={"s" + i} x1={pad + i * sw} y1={pad} x2={pad + i * sw} y2={pad + fh * 4} className="lb-fret-line"/>)}
                {[0, 1, 2, 3, 4].map(f => <line key={"f" + f} x1={pad} y1={pad + f * fh} x2={pad + sw * 5} y2={pad + f * fh} className={"lb-fret-line" + (f === 0 ? " is-nut" : "")}/>)}
                {frets.map((f, i) => {
                  const x = pad + i * sw;
                  if (f < 0) return <text key={"x" + i} x={x} y={pad - 5} className="lb-chord-mark">×</text>;
                  if (f === 0) return <circle key={"o" + i} cx={x} cy={pad - 9} r="4" className="lb-chord-open"/>;
                  return (
                    <g key={"d" + i}>
                      <circle cx={x} cy={pad + f * fh - fh / 2} r="7.5" className="lb-chord-dot"/>
                      {fingers[i] > 0 && <text x={x} y={pad + f * fh - fh / 2 + 4} className="lb-chord-finger">{fingers[i]}</text>}
                    </g>
                  );
                })}
              </svg>
              <figcaption className="lb-cap">{key}</figcaption>
            </figure>
          );
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
  const W = pad * 2 + Math.max(1, notes.length) * step, H = 108;
  const top = 28;                            // y of the top staff line
  // Treble: E4 sits on the bottom line. Position counted in staff steps up.
  const diat = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const yOf = n => {
    const steps = (n.octave - 4) * 7 + diat[n.name[0]] - diat.E;
    return top + lh * 4 - steps * (lh / 2);
  };
  const said = notes.length ? notes.map(n => n.name).join(", ") : "none";
  return (
    <figure className="lb lb-staff">
      <svg viewBox={`0 0 ${W} ${H}`} className="lb-svg" role="img" aria-label={`Treble staff. Notes: ${said}.`}>
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
              <ellipse cx={x} cy={y} rx="6.2" ry="4.6" className="lb-note-head" transform={`rotate(-18 ${x} ${y})`}/>
              <line x1={x + 6} y1={y} x2={x + 6} y2={y - 30} className="lb-note-stem"/>
              <text x={x} y={H - 8} className="lb-note-name">{n.name}</text>
            </g>
          );
        })}
      </svg>
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
  return (
    <figure className="lb lb-steps">
      <ol className="lb-step-list">
        {items.map((it, i) => (
          <li key={i} className="lb-step" style={{ "--lb-share": (it.mins / total * 100) + "%" }}>
            <span className="lb-step-bar" aria-hidden="true"/>
            <span className="lb-step-min">{it.mins} min</span>
            <span className="lb-step-label">{it.label}</span>
          </li>
        ))}
      </ol>
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
