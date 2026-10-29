/* ── Study tools (/study) — course labs and the AI study tools ───────────
 *
 * One lab for each NGG division, with the member's own division first:
 *   Technology   code playground (HTML/CSS/JS, run in a sandboxed page),
 *                number bases, password strength (Cybersecurity)
 *   Creative     metronome with tap tempo, a playable piano with scales and chords
 *   Media        colour contrast (WCAG), palette maker
 *   Business     break-even and profit, a budget, compound interest
 * And two study-helper tools: Quiz me on a lesson, and Summarise my notes
 * (which can become flashcards). Both spend the day's study-helper allowance.
 */

const STT_LABS = [
  { div: "Technology & Applied Engineering", short: "Tech", icon: "ph-code", labs: [["code", "Code playground"], ["pass", "Password strength"]] },
  { div: "Creative & Performing Arts", short: "Creative", icon: "ph-music-notes", labs: [["metro", "Metronome"], ["piano", "Piano & scales"]] },
  { div: "Media & Content Strategy", short: "Media", icon: "ph-palette", labs: [["contrast", "Colour contrast"], ["palette", "Palette maker"]] },
  { div: "Business Strategy, Operations & Administration", short: "Business", icon: "ph-chart-bar", labs: [["breakeven", "Break-even & profit"], ["budget", "Budget planner"], ["interest", "Savings & interest"]] },
];
const sttNaira = n => "₦" + (isFinite(n) ? Math.round(n).toLocaleString("en-GB") : "—");
const sttNum = v => { const n = parseFloat(String(v).replace(/[,₦\s]/g, "")); return isFinite(n) ? n : 0; };

function SttLabs() {
  const [mine, setMine] = React.useState("");
  const [lab, setLab] = React.useState("");
  React.useEffect(() => { NGGApi.member.tools.lessons().then(r => setMine(r.division || ""), () => setMine("")); }, []);
  const groups = STT_LABS.slice().sort((a, b) => (b.div === mine) - (a.div === mine));
  const all = [].concat(...STT_LABS.map(g => g.labs.map(([id, l]) => ({ id, l, g }))));
  const cur = all.find(x => x.id === lab);
  if (cur) return (
    <div className="stt-stack">
      <button type="button" className="stt-link" onClick={() => setLab("")}><i className="ph ph-arrow-left" aria-hidden="true"/>All course labs</button>
      <h3 className="stt-h3">{cur.l} <small className="stt-meta">· {cur.g.short}</small></h3>
      {lab === "code" ? <SttCode/> : lab === "pass" ? <SttPass/> : lab === "metro" ? <SttMetro/> : lab === "piano" ? <SttPiano/>
        : lab === "contrast" ? <SttContrast/> : lab === "palette" ? <SttPalette/> : lab === "breakeven" ? <SttBreakEven/> : lab === "budget" ? <SttBudget/> : <SttInterest/>}
    </div>
  );
  return (
    <div className="stt-grid">
      {groups.map(g => (
        <section key={g.div} className="stt-card" aria-labelledby={"stt-lab-" + g.short}>
          <h3 id={"stt-lab-" + g.short} className="stt-h3"><i className={"ph " + g.icon} aria-hidden="true"/> {g.short}{g.div === mine ? <span className="stt-due is-due stt-mine">Your division</span> : null}</h3>
          <p className="stt-meta">{g.div}</p>
          <div className="stt-row">{g.labs.map(([id, l]) => <button key={id} type="button" className="stt-btn" onClick={() => setLab(id)}>{l}</button>)}</div>
        </section>
      ))}
    </div>
  );
}

/* ── Code playground ─────────────────────────────────────────────────────
 * The member's code runs in /assets/sandbox/code-sandbox.html, framed with
 * sandbox="allow-scripts" (never allow-same-origin): an opaque origin with no
 * network. Messages from it are believed only from that frame's own window.
 * The work is kept on this device (localStorage), per starter. */
const STT_CODE_STARTERS = {
  hello: { name: "Hello, NGG", html: "<h1>Hello, Lagos!</h1>\n<button id=\"go\">Count</button>\n<p id=\"out\">Pressed 0 times</p>", css: "body { font-family: system-ui, sans-serif; padding: 24px; }\nh1 { color: #1e4fae; }\nbutton { font-size: 18px; padding: 8px 16px; }",
    js: "let n = 0;\ndocument.getElementById('go').addEventListener('click', () => {\n  n++;\n  document.getElementById('out').textContent = 'Pressed ' + n + ' times';\n  console.log('count is', n);\n});" },
  quiz: { name: "A quiz", html: "<h2 id=\"q\"></h2>\n<div id=\"opts\"></div>\n<p id=\"msg\"></p>", css: "body { font-family: system-ui, sans-serif; padding: 24px; }\nbutton { display: block; margin: 6px 0; padding: 8px 12px; font-size: 16px; }",
    js: "const qs = [\n  { q: 'Capital of Nigeria?', a: ['Lagos', 'Abuja', 'Kano'], ok: 1 },\n  { q: '7 × 8?', a: ['54', '56', '64'], ok: 1 },\n];\nlet i = 0, score = 0;\nfunction show() {\n  if (i === qs.length) { document.body.innerHTML = '<h2>You scored ' + score + '/' + qs.length + '</h2>'; return; }\n  document.getElementById('q').textContent = qs[i].q;\n  const box = document.getElementById('opts'); box.innerHTML = '';\n  qs[i].a.forEach((t, k) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { if (k === qs[i].ok) score++; i++; show(); }; box.appendChild(b); });\n}\nshow();" },
  canvas: { name: "Drawing", html: "<canvas id=\"c\" width=\"320\" height=\"240\"></canvas>", css: "body { margin: 0; display: grid; place-items: center; height: 100vh; background: #0c1432; }",
    js: "const g = document.getElementById('c').getContext('2d');\nfor (let i = 0; i < 12; i++) {\n  g.fillStyle = `hsl(${i * 30}, 80%, 60%)`;\n  g.beginPath(); g.arc(160, 120, 110 - i * 9, 0, Math.PI * 2); g.fill();\n}" },
  blank: { name: "Blank", html: "", css: "", js: "" },
};
function sttLocalGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } }
function sttLocalSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
function SttCode() {
  const [starter, setStarter] = React.useState("hello");
  const load = s => sttLocalGet("ngg.study.code." + s, STT_CODE_STARTERS[s]);
  const [code, setCode] = React.useState(() => load("hello"));
  const [pane, setPane] = React.useState("html");
  const [logs, setLogs] = React.useState([]);
  const [ready, setReady] = React.useState(false);
  const frame = React.useRef(null);
  const pending = React.useRef(null);
  React.useEffect(() => {
    const on = ev => {
      const w = frame.current && frame.current.contentWindow;
      if (!w || ev.source !== w) return;              // only our sandbox, never another window
      const d = ev.data || {};
      if (d.type === "ngg-ready") { setReady(true); if (pending.current) { w.postMessage(pending.current, "*"); pending.current = null; } }
      if (d.type === "ngg-console") setLogs(l => l.concat([{ level: String(d.level || "log"), text: String(d.text || "").slice(0, 2000) }]).slice(-80));
    };
    window.addEventListener("message", on); return () => window.removeEventListener("message", on);
  }, []);
  const run = () => {
    setLogs([]); setReady(false);
    pending.current = { type: "ngg-run", html: code.html, css: code.css, js: code.js };
    // A fresh page each run: nothing from the last run survives into the next.
    if (frame.current) frame.current.src = "/assets/sandbox/code-sandbox.html?r=" + Date.now();
    sttLocalSet("ngg.study.code." + starter, code);
  };
  React.useEffect(() => { run(); }, []); // eslint-disable-line
  const pick = s => { sttLocalSet("ngg.study.code." + starter, code); setStarter(s); setCode(load(s)); setTimeout(run, 0); };
  const reset = () => { setCode(STT_CODE_STARTERS[starter]); sttLocalSet("ngg.study.code." + starter, STT_CODE_STARTERS[starter]); };
  const onKey = e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
    if (e.key === "Tab" && !e.shiftKey && !e.altKey) {          // two spaces, as editors do — Esc then Tab leaves the box
      if (e.currentTarget.dataset.escaped === "1") { e.currentTarget.dataset.escaped = ""; return; }
      e.preventDefault(); const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd, v = t.value;
      const nv = v.slice(0, a) + "  " + v.slice(b); setCode(c => ({ ...c, [pane]: nv })); setTimeout(() => { t.selectionStart = t.selectionEnd = a + 2; }, 0);
    }
    if (e.key === "Escape") e.currentTarget.dataset.escaped = "1";
  };
  return (
    <div className="stt-code">
      <div className="stt-stack">
        <div className="stt-row">
          <label className="stt-sr" htmlFor="stt-code-start">Starter</label>
          <select id="stt-code-start" className="stt-input stt-select stt-auto" value={starter} onChange={e => pick(e.target.value)}>
            {Object.keys(STT_CODE_STARTERS).map(k => <option key={k} value={k}>{STT_CODE_STARTERS[k].name}</option>)}
          </select>
          <button type="button" className="stt-btn is-go" onClick={run}><i className="ph ph-play" aria-hidden="true"/>Run <kbd>Ctrl ↵</kbd></button>
          <button type="button" className="stt-btn" onClick={reset}>Reset</button>
        </div>
        <div className="stt-chips" role="tablist" aria-label="Which code">
          {[["html", "HTML"], ["css", "CSS"], ["js", "JavaScript"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={pane === k} className={"stt-chip" + (pane === k ? " is-on" : "")} onClick={() => setPane(k)}>{l}</button>)}
        </div>
        <label className="stt-sr" htmlFor="stt-code-ed">{pane.toUpperCase()} code</label>
        <textarea id="stt-code-ed" className="stt-input stt-editor" spellCheck="false" autoCapitalize="off" autoCorrect="off" value={code[pane]} onKeyDown={onKey}
          onChange={e => { const v = e.target.value; setCode(c => ({ ...c, [pane]: v })); }} aria-describedby="stt-code-help"/>
        <p id="stt-code-help" className="stt-fine">Tab indents; press Esc, then Tab, to leave the box. Your code is kept on this device.</p>
      </div>
      <div className="stt-stack">
        <iframe ref={frame} className="stt-preview" title="Your page" sandbox="allow-scripts allow-modals" referrerPolicy="no-referrer"/>
        <section className="stt-console" aria-labelledby="stt-con-h">
          <h4 id="stt-con-h" className="stt-con-h">Console {!ready ? <small className="stt-meta">· starting…</small> : null}</h4>
          <ol className="stt-con-list" aria-live="polite">{logs.length ? logs.map((l, i) => <li key={i} className={"is-" + l.level}>{l.text}</li>) : <li className="is-quiet">console.log() output and errors appear here.</li>}</ol>
        </section>
      </div>
    </div>
  );
}

function SttBases() {
  const [v, setV] = React.useState("2026");
  const [base, setBase] = React.useState(10);
  const digits = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };
  const clean = v.trim().replace(/^0[xbo]/i, "");
  const ok = clean !== "" && digits[base].test(clean) && clean.length <= 40;
  let n = null; try { n = ok ? BigInt((base === 10 ? "" : base === 16 ? "0x" : base === 8 ? "0o" : "0b") + clean) : null; } catch (_) { n = null; }
  const rows = n == null ? [] : [["Binary (base 2)", n.toString(2)], ["Octal (base 8)", n.toString(8)], ["Decimal (base 10)", n.toString(10)], ["Hexadecimal (base 16)", n.toString(16).toUpperCase()]];
  return (
    <div className="stt-stack">
      <div className="stt-row">
        <label className="stt-sr" htmlFor="stt-b-in">Number</label>
        <input id="stt-b-in" className="stt-input stt-grow stt-mono" value={v} onChange={e => setV(e.target.value)} spellCheck="false" autoComplete="off"/>
        <label className="stt-sr" htmlFor="stt-b-base">Written in</label>
        <select id="stt-b-base" className="stt-input stt-select stt-auto" value={base} onChange={e => setBase(Number(e.target.value))}>
          <option value={10}>Decimal</option><option value={2}>Binary</option><option value={8}>Octal</option><option value={16}>Hex</option>
        </select>
      </div>
      {!ok ? <p className="stt-err" role="alert">{clean === "" ? "Type a whole number." : "That isn’t a " + { 2: "binary number (only 0 and 1)", 8: "octal number (digits 0–7)", 10: "decimal whole number", 16: "hex number (0–9 and A–F)" }[base] + "."}</p>
        : <dl className="stt-dl">{rows.map(([k, x]) => <div key={k}><dt>{k}</dt><dd className="stt-mono">{x}</dd></div>)}<div><dt>Bits needed</dt><dd className="stt-mono">{n.toString(2).length}</dd></div></dl>}
      <p className="stt-fine">Computers store everything as binary. Each hex digit is exactly four binary digits — that is why programmers use it for colours (#1E4FAE) and memory.</p>
    </div>
  );
}

/* Password strength, worked out on this device only — nothing typed here is sent anywhere. */
const STT_COMMON_PW = ["password", "123456", "12345678", "qwerty", "abc123", "111111", "iloveyou", "admin", "welcome", "letmein", "monkey", "football", "nigeria", "lagos", "jesus", "princess", "000000", "password1", "naija", "blessing"];
function sttPwScore(pw) {
  if (!pw) return { bits: 0, label: "", tips: [] };
  let pool = 0; if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(Math.max(pool, 1));
  const tips = [], low = pw.toLowerCase();
  if (STT_COMMON_PW.some(w => low.includes(w))) { bits = Math.min(bits, 12); tips.push("It contains one of the most common passwords. Attackers try those first."); }
  if (/(.)\1\1/.test(pw)) { bits -= 8; tips.push("Avoid the same character three times in a row."); }
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(pw)) { bits -= 10; tips.push("Avoid runs like 1234 or qwer."); }
  if (/(19|20)\d\d/.test(pw)) { bits -= 6; tips.push("A year (like a birthday) is easy to guess."); }
  if (pw.length < 12) tips.push("Use 12 or more characters — length beats symbols.");
  bits = Math.max(0, Math.round(bits));
  const label = bits < 28 ? "Very weak" : bits < 40 ? "Weak" : bits < 60 ? "Fair" : bits < 80 ? "Strong" : "Very strong";
  // Guesses at 10 billion a second (a fast offline attack).
  const secs = Math.pow(2, bits) / 1e10;
  const crack = secs < 1 ? "instantly" : secs < 3600 ? Math.round(secs / 60) + " minutes" : secs < 86400 * 365 ? Math.round(secs / 86400) + " days" : secs < 86400 * 365 * 1e6 ? Math.round(secs / 86400 / 365).toLocaleString("en-GB") + " years" : "longer than people have existed";
  return { bits, label, tips, crack };
}
function SttPass() {
  const [pw, setPw] = React.useState("");
  const [show, setShow] = React.useState(false);
  const s = sttPwScore(pw);
  const lvl = s.bits < 28 ? 0 : s.bits < 40 ? 1 : s.bits < 60 ? 2 : s.bits < 80 ? 3 : 4;
  return (
    <div className="stt-stack">
      <p className="stt-p">Try a password to see how strong it is. This runs on your device — nothing you type here is sent anywhere. Don’t test your real password; test one like it.</p>
      <div className="stt-row">
        <label className="stt-sr" htmlFor="stt-pw">Password to test</label>
        <input id="stt-pw" className="stt-input stt-grow stt-mono" type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} autoComplete="off" spellCheck="false"/>
        <button type="button" className="stt-chip" aria-pressed={show} onClick={() => setShow(x => !x)}>{show ? "Hide" : "Show"}</button>
      </div>
      {pw ? <>
        <div className={"stt-meter is-l" + lvl} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, s.bits)} aria-label={"Strength: " + s.label}><span/></div>
        <p className="stt-p" aria-live="polite"><b>{s.label}</b> · about {s.bits} bits · a fast attacker would need <b>{s.crack}</b></p>
        {s.tips.length ? <ul className="stt-tips">{s.tips.map(t => <li key={t}>{t}</li>)}</ul> : <p className="stt-p">No obvious weaknesses. Use it for one site only, and turn on two-step sign-in.</p>}
      </> : <p className="stt-fine">Best: three or four random words, like <span className="stt-mono">tiger-mango-river-42</span> — long, and easy for you to remember.</p>}
    </div>
  );
}

/* ── Music: metronome and piano. One AudioContext for the page, made on the
 * first press (browsers refuse sound before a person touches the page). */
let _sttAudio = null;
function sttAudio() { try { if (!_sttAudio) _sttAudio = new (window.AudioContext || window.webkitAudioContext)(); if (_sttAudio.state === "suspended") _sttAudio.resume(); } catch (_) { _sttAudio = null; } return _sttAudio; }
function sttBeep(freq, at, dur, vol, type) {
  const c = sttAudio(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(); o.type = type || "sine"; o.frequency.value = freq; o.connect(g); g.connect(c.destination);
  const t = at || c.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.08));
  o.start(t); o.stop(t + (dur || 0.08) + 0.02);
}
function SttMetro() {
  const [bpm, setBpm] = React.useState(90);
  const [beats, setBeats] = React.useState(4);
  const [on, setOn] = React.useState(false);
  const [beat, setBeat] = React.useState(-1);
  const taps = React.useRef([]);
  const sched = React.useRef({ next: 0, n: 0, timer: 0 });
  React.useEffect(() => {
    if (!on) return;
    const c = sttAudio(); if (!c) { setOn(false); return; }
    // Look-ahead scheduling on the audio clock: steady even when the page is busy.
    const s = sched.current; s.next = c.currentTime + 0.06; s.n = 0;
    const tick = () => {
      while (s.next < c.currentTime + 0.12) {
        const accent = s.n % beats === 0;
        sttBeep(accent ? 1500 : 1000, s.next, 0.05, accent ? 0.4 : 0.22, "square");
        const k = s.n % beats, delay = Math.max(0, (s.next - c.currentTime) * 1000);
        setTimeout(() => setBeat(k), delay);
        s.next += 60 / bpm; s.n++;
      }
    };
    tick(); s.timer = setInterval(tick, 25);
    return () => { clearInterval(s.timer); setBeat(-1); };
  }, [on, bpm, beats]);
  const tap = () => {
    const t = performance.now(); taps.current = taps.current.filter(x => t - x < 3000).concat([t]);
    if (taps.current.length >= 2) { const d = taps.current.slice(1).map((x, i) => x - taps.current[i]); setBpm(Math.max(30, Math.min(240, Math.round(60000 / (d.reduce((a, b) => a + b, 0) / d.length))))); }
  };
  const term = bpm < 60 ? "Largo (slow)" : bpm < 76 ? "Adagio" : bpm < 108 ? "Andante – Moderato" : bpm < 132 ? "Allegro" : bpm < 168 ? "Vivace" : "Presto (very fast)";
  return (
    <div className="stt-stack stt-focus">
      <p className="stt-ring-t stt-center" aria-live="off">{bpm} <small className="stt-meta">beats a minute</small></p>
      <p className="stt-meta stt-center">{term}</p>
      <div className="stt-dots" aria-hidden="true">{Array.from({ length: beats }, (_, i) => <span key={i} className={"stt-dot" + (i === beat ? " is-on" : "") + (i === 0 ? " is-first" : "")}/>)}</div>
      <label className="stt-label" htmlFor="stt-bpm">Tempo</label>
      <input id="stt-bpm" type="range" min="30" max="240" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="stt-range"/>
      <div className="stt-row stt-row-c">
        <button type="button" className="stt-chip" onClick={() => setBpm(b => Math.max(30, b - 1))} aria-label="One beat slower">−1</button>
        <button type="button" className="stt-chip" onClick={() => setBpm(b => Math.min(240, b + 1))} aria-label="One beat faster">+1</button>
        <button type="button" className="stt-btn is-go" onClick={() => setOn(x => !x)} aria-pressed={on}>{on ? "Stop" : "Start"}</button>
        <button type="button" className="stt-btn" onClick={tap}>Tap tempo</button>
      </div>
      <div className="stt-chips" role="group" aria-label="Beats in a bar">{[2, 3, 4, 6].map(n => <button key={n} type="button" className={"stt-chip" + (n === beats ? " is-on" : "")} aria-pressed={n === beats} onClick={() => setBeats(n)}>{n}/4</button>)}</div>
      <p className="stt-fine">Practise slowly first, then raise the tempo 4 beats at a time once it is clean.</p>
    </div>
  );
}

const STT_NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const STT_SCALES = { "Major": [0, 2, 4, 5, 7, 9, 11], "Natural minor": [0, 2, 3, 5, 7, 8, 10], "Pentatonic major": [0, 2, 4, 7, 9], "Blues": [0, 3, 5, 6, 7, 10] };
const STT_CHORDS = { "Major": [0, 4, 7], "Minor": [0, 3, 7], "7th": [0, 4, 7, 10], "Sus4": [0, 5, 7] };
const STT_KEYMAP = "awsedftgyhujkolp;";          // computer keys → C4 upwards
function sttFreq(semis) { return 261.63 * Math.pow(2, semis / 12); }   // 0 = middle C
function SttPiano() {
  const [root, setRoot] = React.useState(0);
  const [scale, setScale] = React.useState("Major");
  const [chord, setChord] = React.useState("Major");
  const [lit, setLit] = React.useState([]);
  const play = semis => { sttBeep(sttFreq(semis), 0, 0.9, 0.25, "triangle"); setLit(l => l.concat([semis])); setTimeout(() => setLit(l => l.filter(x => x !== semis)), 300); };
  React.useEffect(() => {
    const k = e => { if (e.repeat || (e.target && /input|textarea|select/i.test(e.target.tagName))) return; const i = STT_KEYMAP.indexOf(e.key.toLowerCase()); if (i >= 0) { e.preventDefault(); play(i); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const inScale = STT_SCALES[scale].map(x => (root + x) % 12);
  const keys = Array.from({ length: 17 }, (_, i) => i);
  const playScale = () => { const c = sttAudio(); if (!c) return; STT_SCALES[scale].concat([12]).forEach((x, i) => setTimeout(() => play(root + x), i * 320)); };
  const playChord = () => STT_CHORDS[chord].forEach(x => play(root + x));
  const whites = keys.filter(i => ![1, 3, 6, 8, 10].includes(i % 12));
  return (
    <div className="stt-stack">
      <div className="stt-piano" role="group" aria-label="Piano keyboard, C to E">
        {whites.map(i => <button key={i} type="button" className={"stt-pkey is-white" + (inScale.includes(i % 12) ? " is-scale" : "") + (lit.includes(i) ? " is-lit" : "")} onClick={() => play(i)}
          aria-label={STT_NOTES[i % 12] + (i >= 12 ? " (high)" : "")}><span>{STT_NOTES[i % 12]}</span><kbd>{STT_KEYMAP[i]}</kbd></button>)}
        {keys.filter(i => [1, 3, 6, 8, 10].includes(i % 12)).map(i => {
          const leftWhites = whites.filter(w => w < i).length;
          return <button key={i} type="button" className={"stt-pkey is-black" + (inScale.includes(i % 12) ? " is-scale" : "") + (lit.includes(i) ? " is-lit" : "")} style={{ left: "calc(" + leftWhites + " * var(--stt-wk) - var(--stt-bk) / 2)" }}
            onClick={() => play(i)} aria-label={STT_NOTES[i % 12]}><kbd>{STT_KEYMAP[i]}</kbd></button>;
        })}
      </div>
      <div className="stt-row">
        <label className="stt-label" htmlFor="stt-root">Key</label>
        <select id="stt-root" className="stt-input stt-select stt-auto" value={root} onChange={e => setRoot(Number(e.target.value))}>{STT_NOTES.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
        <label className="stt-label" htmlFor="stt-scale">Scale</label>
        <select id="stt-scale" className="stt-input stt-select stt-auto" value={scale} onChange={e => setScale(e.target.value)}>{Object.keys(STT_SCALES).map(s => <option key={s}>{s}</option>)}</select>
        <button type="button" className="stt-btn" onClick={playScale}>Play the scale</button>
      </div>
      <p className="stt-p" aria-live="polite"><b>{STT_NOTES[root]} {scale.toLowerCase()}:</b> {STT_SCALES[scale].map(x => STT_NOTES[(root + x) % 12]).join(" – ")}</p>
      <div className="stt-row">
        <label className="stt-label" htmlFor="stt-chord">Chord</label>
        <select id="stt-chord" className="stt-input stt-select stt-auto" value={chord} onChange={e => setChord(e.target.value)}>{Object.keys(STT_CHORDS).map(s => <option key={s}>{s}</option>)}</select>
        <button type="button" className="stt-btn" onClick={playChord}>Play {STT_NOTES[root]} {chord.toLowerCase()}</button>
        <span className="stt-meta">{STT_CHORDS[chord].map(x => STT_NOTES[(root + x) % 12]).join(" + ")}</span>
      </div>
      <p className="stt-fine">Play with your computer keys: A S D F G H J K L ; for the white notes, W E T Y U O P for the black. Notes in the chosen scale are marked.</p>
    </div>
  );
}

/* ── Media: contrast and palettes ──────────────────────────────────────── */
function sttHex(h) { const m = String(h || "").trim().replace(/^#/, ""); const x = m.length === 3 ? m.split("").map(c => c + c).join("") : m; return /^[0-9a-f]{6}$/i.test(x) ? "#" + x.toLowerCase() : null; }
function sttLum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function sttRatio(a, b) { const x = sttLum(a), y = sttLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function sttHsl(hex) {
  let [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [h, s, l];
}
function sttFromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("");
}
function SttContrast() {
  const [fg, setFg] = React.useState("#1e4fae");
  const [bg, setBg] = React.useState("#ffffff");
  const F = sttHex(fg), B = sttHex(bg);
  const r = F && B ? sttRatio(F, B) : null;
  const pass = (n) => r != null && r >= n;
  // The nearest darker (or lighter) text colour that passes 4.5:1, same hue.
  const fix = (() => { if (!F || !B || pass(4.5)) return null; const [h, s, l] = sttHsl(F); const dark = sttLum(B) > 0.4;
    for (let k = 0; k <= 100; k++) { const nl = dark ? l - k / 100 : l + k / 100; if (nl < 0 || nl > 1) break; const c = sttFromHsl(h, s, nl); if (sttRatio(c, B) >= 4.5) return c; } return null; })();
  const field = (id, label, v, set) => (
    <div className="stt-col"><label className="stt-label" htmlFor={id}>{label}</label>
      <div className="stt-row"><input type="color" className="stt-swatch" value={sttHex(v) || "#000000"} onChange={e => set(e.target.value)} aria-label={label + " picker"}/>
        <input id={id} className="stt-input stt-mono stt-auto" value={v} onChange={e => set(e.target.value)} maxLength={7} spellCheck="false"/></div></div>
  );
  return (
    <div className="stt-stack">
      <div className="stt-row">{field("stt-fg", "Text colour", fg, setFg)}{field("stt-bg", "Background", bg, setBg)}
        <button type="button" className="stt-chip" onClick={() => { setFg(bg); setBg(fg); }}>Swap</button></div>
      {r == null ? <p className="stt-err" role="alert">Use colours like #1e4fae.</p> : <>
        {/* The sample's colours ARE the data being checked — the one inline style that belongs here. */}
        <div className="stt-sample" style={{ color: F, background: B }}><p className="stt-sample-big">Big heading text</p><p>Normal body text, like a caption on a poster or a card.</p></div>
        <p className="stt-big" aria-live="polite">{r.toFixed(2)} <small>: 1</small></p>
        <ul className="stt-checks">
          <li className={pass(4.5) ? "is-ok" : "is-bad"}>{pass(4.5) ? "✓" : "✗"} Body text (needs 4.5 : 1)</li>
          <li className={pass(3) ? "is-ok" : "is-bad"}>{pass(3) ? "✓" : "✗"} Large text and icons (needs 3 : 1)</li>
          <li className={pass(7) ? "is-ok" : "is-bad"}>{pass(7) ? "✓" : "✗"} Best for long reading (7 : 1)</li>
        </ul>
        {fix ? <p className="stt-p">Closest text colour that passes: <button type="button" className="stt-link stt-mono" onClick={() => setFg(fix)}>{fix}</button></p> : null}
      </>}
      <p className="stt-fine">The same rule decides whether NGG’s own pages and printed cards are readable (WCAG 2).</p>
    </div>
  );
}
function SttPalette() {
  const [base, setBase] = React.useState("#f5b026");
  const [kind, setKind] = React.useState("Complementary");
  const B = sttHex(base) || "#f5b026";
  const [h, s, l] = sttHsl(B);
  const sets = { Complementary: [0, 180], Analogous: [-30, 0, 30], Triadic: [0, 120, 240], "Split complementary": [0, 150, 210], Monochrome: null };
  const cols = sets[kind] ? sets[kind].map(d => sttFromHsl(h + d, s, l)) : [0.2, 0.35, 0.5, 0.65, 0.8].map(L => sttFromHsl(h, s, L));
  const [copied, setCopied] = React.useState("");
  const copy = c => { try { navigator.clipboard.writeText(c); setCopied(c); setTimeout(() => setCopied(""), 1500); } catch (_) {} };
  return (
    <div className="stt-stack">
      <div className="stt-row">
        <input type="color" className="stt-swatch" value={B} onChange={e => setBase(e.target.value)} aria-label="Base colour picker"/>
        <label className="stt-sr" htmlFor="stt-pal">Base colour</label>
        <input id="stt-pal" className="stt-input stt-mono stt-auto" value={base} onChange={e => setBase(e.target.value)} maxLength={7}/>
        <label className="stt-sr" htmlFor="stt-pal-k">Kind of palette</label>
        <select id="stt-pal-k" className="stt-input stt-select stt-auto" value={kind} onChange={e => setKind(e.target.value)}>{Object.keys(sets).map(k => <option key={k}>{k}</option>)}</select>
      </div>
      <ul className="stt-pal" aria-label={kind + " palette"}>
        {cols.map((c, i) => {
          const ink = sttRatio(c, "#ffffff") >= sttRatio(c, "#0a1130") ? "#ffffff" : "#0a1130";
          return <li key={i}><button type="button" className="stt-pal-c" style={{ background: c, color: ink }} onClick={() => copy(c)} aria-label={"Copy " + c}><span className="stt-mono">{c}</span><small>{copied === c ? "Copied" : "Copy"}</small></button></li>;
        })}
      </ul>
      <p className="stt-fine">Complementary colours sit opposite on the colour wheel and stand out; analogous ones sit together and feel calm. Check text on any of them with Colour contrast.</p>
    </div>
  );
}

/* ── Business: break-even, budget, interest ───────────────────────────── */
function SttField({ id, label, value, set, suffix, help }) {
  return (
    <div className="stt-col">
      <label className="stt-label" htmlFor={id}>{label}</label>
      <div className="stt-row stt-nowrap"><input id={id} className="stt-input stt-mono" inputMode="decimal" value={value} onChange={e => set(e.target.value)} aria-describedby={help ? id + "-h" : undefined}/>{suffix ? <span className="stt-meta">{suffix}</span> : null}</div>
      {help ? <p id={id + "-h"} className="stt-fine">{help}</p> : null}
    </div>
  );
}
function SttBreakEven() {
  const [price, setPrice] = React.useState("1500");
  const [cost, setCost] = React.useState("900");
  const [fixed, setFixed] = React.useState("60000");
  const [sell, setSell] = React.useState("150");
  const P = sttNum(price), C = sttNum(cost), F = sttNum(fixed), Q = sttNum(sell), m = P - C;
  const be = m > 0 ? Math.ceil(F / m) : null, profit = Q * m - F;
  return (
    <div className="stt-stack">
      <div className="stt-form">
        <SttField id="stt-be-p" label="Price of one" value={price} set={setPrice} suffix="₦"/>
        <SttField id="stt-be-c" label="Cost to make one" value={cost} set={setCost} suffix="₦" help="Materials and anything paid per item."/>
        <SttField id="stt-be-f" label="Fixed costs a month" value={fixed} set={setFixed} suffix="₦" help="Rent, data, a stall — paid however many you sell."/>
        <SttField id="stt-be-q" label="How many you expect to sell" value={sell} set={setSell} suffix="a month"/>
      </div>
      <dl className="stt-dl" aria-live="polite">
        <div><dt>Profit on each one (margin)</dt><dd>{sttNaira(m)} · {P > 0 ? Math.round(m / P * 100) : 0}%</dd></div>
        <div><dt>Break-even</dt><dd>{be == null ? "Never — each sale loses money" : be.toLocaleString("en-GB") + " a month"}</dd></div>
        <div><dt>Profit at {Q.toLocaleString("en-GB")} a month</dt><dd className={profit >= 0 ? "is-ok" : "is-bad"}>{sttNaira(profit)}</dd></div>
      </dl>
      {be != null && Q < be ? <p className="stt-p">You need {(be - Q).toLocaleString("en-GB")} more sales a month to stop losing money — or a higher price, or a lower cost.</p> : null}
    </div>
  );
}
function SttBudget() {
  const blank = { label: "", amount: "" };
  const [income, setIncome] = React.useState(() => sttLocalGet("ngg.study.budget", null) || { inc: [{ label: "Pocket money", amount: "10000" }], out: [{ label: "Transport", amount: "4000" }, { label: "Data", amount: "2000" }], goal: "20000" });
  React.useEffect(() => { sttLocalSet("ngg.study.budget", income); }, [income]);
  const sum = xs => xs.reduce((a, x) => a + sttNum(x.amount), 0);
  const ti = sum(income.inc), to = sum(income.out), left = ti - to, goal = sttNum(income.goal);
  const months = left > 0 && goal > 0 ? Math.ceil(goal / left) : null;
  const rows = (k, title) => (
    <fieldset className="stt-fs"><legend className="stt-label">{title}</legend>
      {income[k].map((r, i) => (
        <div key={i} className="stt-row stt-nowrap">
          <label className="stt-sr" htmlFor={"stt-bd-" + k + i}>{title} {i + 1}</label>
          <input id={"stt-bd-" + k + i} className="stt-input" value={r.label} placeholder="What" onChange={e => setIncome(s => ({ ...s, [k]: s[k].map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))}/>
          <label className="stt-sr" htmlFor={"stt-bda-" + k + i}>Amount</label>
          <input id={"stt-bda-" + k + i} className="stt-input stt-mono stt-amt" inputMode="decimal" value={r.amount} placeholder="₦" onChange={e => setIncome(s => ({ ...s, [k]: s[k].map((x, j) => j === i ? { ...x, amount: e.target.value } : x) }))}/>
          <button type="button" className="stt-icon" aria-label={"Remove " + (r.label || "row")} onClick={() => setIncome(s => ({ ...s, [k]: s[k].filter((_, j) => j !== i) }))}><i className="ph ph-x" aria-hidden="true"/></button>
        </div>
      ))}
      <button type="button" className="stt-link" onClick={() => setIncome(s => ({ ...s, [k]: s[k].concat([blank]) }))}>+ Add a line</button>
    </fieldset>
  );
  return (
    <div className="stt-stack">
      <div className="stt-form">{rows("inc", "Money in each month")}{rows("out", "Money out each month")}</div>
      <SttField id="stt-bd-goal" label="Saving for" value={income.goal} set={v => setIncome(s => ({ ...s, goal: v }))} suffix="₦" help="A phone, a course, a business start."/>
      <dl className="stt-dl" aria-live="polite">
        <div><dt>In</dt><dd>{sttNaira(ti)}</dd></div><div><dt>Out</dt><dd>{sttNaira(to)}</dd></div>
        <div><dt>Left each month</dt><dd className={left >= 0 ? "is-ok" : "is-bad"}>{sttNaira(left)}</dd></div>
        <div><dt>Time to your goal</dt><dd>{months == null ? (left <= 0 ? "Spend less or earn more first" : "—") : months + (months === 1 ? " month" : " months")}</dd></div>
      </dl>
      <p className="stt-fine">Kept on this device only. A common rule: needs 50%, wants 30%, saving 20%.</p>
    </div>
  );
}
function SttInterest() {
  const [start, setStart] = React.useState("50000");
  const [monthly, setMonthly] = React.useState("5000");
  const [rate, setRate] = React.useState("10");
  const [years, setYears] = React.useState("3");
  const S = sttNum(start), M = sttNum(monthly), R = sttNum(rate) / 100 / 12, Y = Math.max(0, Math.min(50, Math.round(sttNum(years))));
  const rowsY = []; let bal = S, paid = S;
  for (let m = 1; m <= Y * 12; m++) { bal = bal * (1 + R) + M; paid += M; if (m % 12 === 0) rowsY.push({ y: m / 12, bal, paid }); }
  return (
    <div className="stt-stack">
      <div className="stt-form">
        <SttField id="stt-in-s" label="Start with" value={start} set={setStart} suffix="₦"/>
        <SttField id="stt-in-m" label="Add each month" value={monthly} set={setMonthly} suffix="₦"/>
        <SttField id="stt-in-r" label="Interest a year" value={rate} set={setRate} suffix="%"/>
        <SttField id="stt-in-y" label="For" value={years} set={setYears} suffix="years"/>
      </div>
      <p className="stt-big" aria-live="polite">{sttNaira(bal)} <small>after {Y} {Y === 1 ? "year" : "years"}</small></p>
      <p className="stt-p">You put in {sttNaira(paid)}; interest added {sttNaira(bal - paid)}.</p>
      {rowsY.length ? <table className="stt-table"><caption className="stt-meta">Year by year</caption><thead><tr><th scope="col">Year</th><th scope="col">Put in</th><th scope="col">Balance</th></tr></thead>
        <tbody>{rowsY.map(r => <tr key={r.y}><td>{r.y}</td><td>{sttNaira(r.paid)}</td><td>{sttNaira(r.bal)}</td></tr>)}</tbody></table> : null}
      <p className="stt-fine">Interest compounds monthly here. Real rates change, and inflation means ₦1 next year buys less than ₦1 today.</p>
    </div>
  );
}

/* ── Revise: Quiz me and Summarise my notes (the study helper) ─────────
 * Each quiz or summary uses one of today's study-helper questions. */
function SttQuiz() {
  const [st, setSt] = React.useState({ phase: "loading" });
  const [pick, setPick] = React.useState("");
  const [quiz, setQuiz] = React.useState(null);
  const [i, setI] = React.useState(0);
  const [chosen, setChosen] = React.useState(null);
  const [score, setScore] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [missed, setMissed] = React.useState([]);
  const [savedMiss, setSavedMiss] = React.useState("");
  const load = React.useCallback(() => { setSt({ phase: "loading" }); NGGApi.member.tools.lessons().then(r => { setSt({ phase: "ok", r }); if (r.lessons[0]) setPick(r.lessons[0].unitId); }, e => setSt({ phase: "error", e })); }, []);
  React.useEffect(() => { load(); }, [load]);
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load your lessons. " + sttErr(st.e)} retry={load}/>;
  if (!st.r.lessons.length) return <SttState kind="empty" text="No lessons yet. When your course has lessons, you can be quizzed on any of them."/>;
  if (!st.r.ai) return <SttState kind="empty" text="The study helper isn’t switched on here yet."/>;
  const start = async () => {
    setBusy(true); setErr("");
    try { const r = await NGGApi.member.tools.quiz(pick); setQuiz(r); setI(0); setScore(0); setChosen(null); setMissed([]); setSavedMiss(""); } catch (e) { setErr(sttErr(e)); }
    setBusy(false);
  };
  if (quiz) {
    const q = quiz.questions[i];
    if (!q) {
      // The questions missed go straight into flashcards, so they come back until they are known.
      const saveMissed = async () => {
        setBusy(true);
        try { await NGGApi.member.tools.save({ name: "Missed · " + quiz.title.slice(0, 60), source: quiz.course + " · quiz", cards: missed.map(m => ({ front: m.q, back: m.options[m.answer] + (m.why ? " — " + m.why : "") })) }); setSavedMiss("Saved — they’re in Revise → Flashcards."); }
        catch (e) { setSavedMiss(sttErr(e)); }
        setBusy(false);
      };
      return <SttState kind="empty" text={"You scored " + score + " out of " + quiz.questions.length + " on “" + quiz.title + "”." + (score === quiz.questions.length ? " Perfect." : " Look again at the ones you missed.")}>
        {missed.length ? (savedMiss ? <p className="stt-p" role="status">{savedMiss}</p> : <button type="button" className="stt-btn" onClick={saveMissed} disabled={busy}><i className="ph ph-cards" aria-hidden="true"/>Make flashcards of the {missed.length} I missed</button>) : null}
        <div className="stt-row"><button type="button" className="stt-btn is-go" onClick={start} disabled={busy}>New questions</button><button type="button" className="stt-btn" onClick={() => setQuiz(null)}>Another lesson</button></div></SttState>;
    }
    const answer = k => {
      if (chosen != null) return;
      setChosen(k); const right = k === q.answer; if (right) setScore(s => s + 1); else setMissed(ms => ms.concat([q]));
      if (i === quiz.questions.length - 1) NGGApi.member.tools.log({ tool: "quiz", accuracy: Math.round((score + (right ? 1 : 0)) / quiz.questions.length * 100), cards: quiz.questions.length, label: quiz.title }).catch(() => {});
    };
    return (
      <div className="stt-stack">
        <p className="stt-meta" aria-live="polite">Question {i + 1} of {quiz.questions.length} · {quiz.title}</p>
        <p className="stt-flash-front stt-left">{q.q}</p>
        <div className="stt-opts" role="group" aria-label="Answers">
          {q.options.map((o, k) => <button key={k} type="button" className={"stt-opt" + (chosen == null ? "" : k === q.answer ? " is-ok" : k === chosen ? " is-bad" : "")} onClick={() => answer(k)} disabled={chosen != null}
            aria-pressed={chosen === k}>{String.fromCharCode(65 + k)}. {o}</button>)}
        </div>
        {chosen != null && <p className="stt-p" role="status">{chosen === q.answer ? "Right. " : "Not quite — it’s " + String.fromCharCode(65 + q.answer) + ". "}{q.why}</p>}
        {chosen != null && <button type="button" className="stt-btn is-go" onClick={() => { setI(n => n + 1); setChosen(null); }}>{i === quiz.questions.length - 1 ? "See my score" : "Next question"}</button>}
      </div>
    );
  }
  return (
    <div className="stt-stack">
      <label className="stt-label" htmlFor="stt-qz-l">Lesson</label>
      <select id="stt-qz-l" className="stt-input stt-select" value={pick} onChange={e => setPick(e.target.value)}>{st.r.lessons.map(l => <option key={l.unitId} value={l.unitId}>{l.course} · {l.title}</option>)}</select>
      {err && <p className="stt-err" role="alert">{err}</p>}
      <button type="button" className="stt-btn is-go" onClick={start} disabled={busy || !pick} aria-busy={busy}>{busy ? "Writing your questions…" : "Quiz me"}</button>
      <p className="stt-fine">Five questions on your lesson, written by the study helper. It uses one of today’s study-helper questions, and it can be wrong — check anything that surprises you with your instructor.</p>
    </div>
  );
}
function SttNotes() {
  const [text, setText] = React.useState(() => { try { return sessionStorage.getItem("ngg.study.notes") || ""; } catch (_) { return ""; } });
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [saved, setSaved] = React.useState("");
  React.useEffect(() => { try { sessionStorage.setItem("ngg.study.notes", text); } catch (_) {} }, [text]);
  const go = async () => { setBusy(true); setErr(""); setSaved(""); try { setRes(await NGGApi.member.tools.notes(text)); } catch (e) { setErr(sttErr(e)); } setBusy(false); };
  const toDeck = async () => {
    setBusy(true); setErr("");
    try { await NGGApi.member.tools.save({ name: "Notes · " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" }), source: "From my notes", cards: res.terms }); setSaved("Saved as a deck — find it in Flashcards."); }
    catch (e) { setErr(sttErr(e)); }
    setBusy(false);
  };
  return (
    <div className="stt-stack">
      <label className="stt-label" htmlFor="stt-notes">Your notes</label>
      <textarea id="stt-notes" className="stt-input" rows={8} maxLength={6000} value={text} onChange={e => setText(e.target.value)} placeholder="Paste or type what you wrote in class…"/>
      <p className="stt-fine">{text.length.toLocaleString("en-GB")} / 6,000 characters · uses one of today’s study-helper questions</p>
      {err && <p className="stt-err" role="alert">{err}</p>}
      <button type="button" className="stt-btn is-go" onClick={go} disabled={busy || text.trim().length < 80} aria-busy={busy}>{busy && !res ? "Reading your notes…" : "Summarise"}</button>
      {res && <section className="stt-card" aria-labelledby="stt-sum-h" aria-live="polite">
        <h3 id="stt-sum-h" className="stt-h3">{res.safeguarding ? "Please talk to someone" : "Summary"}</h3>
        <p className="stt-p">{res.summary}</p>
        {res.terms && res.terms.length ? <>
          <h4 className="stt-con-h">Key terms</h4>
          <dl className="stt-dl">{res.terms.map((t, i) => <div key={i}><dt>{t.front}</dt><dd>{t.back}</dd></div>)}</dl>
          {saved ? <p className="stt-p" role="status">{saved}</p> : <button type="button" className="stt-btn" onClick={toDeck} disabled={busy}>Make these flashcards</button>}
        </> : null}
      </section>}
    </div>
  );
}

Object.assign(window, { SttLabs, SttQuiz, SttNotes, sttRatio, sttPwScore, STT_LABS });
