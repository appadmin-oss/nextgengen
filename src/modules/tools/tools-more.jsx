/* ── Study tools (/study) — focus timer, typing, calculator, graphs, dictionary ── */

/* ── Focus timer ──────────────────────────────────────────────────────────
 * A study block, then a break. Kept to the wall clock (an end time), not to a
 * counter of ticks, so a phone that sleeps the tab still ends on time. A
 * finished block is logged (signed in), and a soft tone and the tab's title
 * say it is over. Space starts and pauses. */
const STT_FOCUS_PRESETS = [[25, 5, "25 · 5"], [50, 10, "50 · 10"], [15, 3, "15 · 3"], [45, 15, "45 · 15"]];
function sttTone() {
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const c = new A(), o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = 660; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
    o.start(); o.stop(c.currentTime + 1.3); setTimeout(() => c.close && c.close(), 1600);
  } catch (_) {}
}
function SttFocus({ signedIn, onLogged }) {
  const [preset, setPreset] = React.useState(0);
  const [phase, setPhase] = React.useState("work");          // work | break
  const [endAt, setEndAt] = React.useState(0);                // running when > 0
  const [left, setLeft] = React.useState(STT_FOCUS_PRESETS[0][0] * 60);
  const [label, setLabel] = React.useState("");
  const [done, setDone] = React.useState(0);
  const [note, setNote] = React.useState("");
  const total = (phase === "work" ? STT_FOCUS_PRESETS[preset][0] : STT_FOCUS_PRESETS[preset][1]) * 60;
  const running = endAt > 0;
  React.useEffect(() => {
    if (!running) return;
    const tick = () => {
      const s = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        sttTone(); setEndAt(0);
        if (phase === "work") {
          const mins = STT_FOCUS_PRESETS[preset][0];
          setDone(n => n + 1);
          if (signedIn) NGGApi.member.tools.log({ tool: "focus", minutes: mins, label }).then(() => { setNote("Logged " + mins + " minutes."); if (onLogged) onLogged(); }, () => setNote("Couldn’t log that block — you’re probably offline."));
          setPhase("break"); setLeft(STT_FOCUS_PRESETS[preset][1] * 60);
        } else { setPhase("work"); setLeft(STT_FOCUS_PRESETS[preset][0] * 60); }
      }
    };
    tick(); const t = setInterval(tick, 500); return () => clearInterval(t);
  }, [running, endAt]); // eslint-disable-line
  React.useEffect(() => {
    const base = "Study tools · NGG";
    document.title = running ? Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0") + " · " + (phase === "work" ? "Focus" : "Break") : "Focus timer · " + base;
  }, [left, running, phase]);
  const start = () => { setNote(""); setEndAt(Date.now() + left * 1000); };
  const pause = () => setEndAt(0);
  const reset = () => { setEndAt(0); setPhase("work"); setLeft(STT_FOCUS_PRESETS[preset][0] * 60); };
  const choose = i => { if (running) return; setPreset(i); setPhase("work"); setLeft(STT_FOCUS_PRESETS[i][0] * 60); };
  React.useEffect(() => {
    const k = e => { if (e.key === " " && !(e.target && /input|textarea|select|button/i.test(e.target.tagName))) { e.preventDefault(); running ? pause() : start(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const pct = total ? (1 - left / total) : 0, R = 88, C = 2 * Math.PI * R;
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");
  return (
    <div className="stt-stack stt-focus">
      <div className="stt-chips" role="group" aria-label="Block and break length (minutes)">
        {STT_FOCUS_PRESETS.map(([w, b, l], i) => <button key={l} type="button" className={"stt-chip" + (i === preset ? " is-on" : "")} aria-pressed={i === preset} disabled={running} onClick={() => choose(i)}>{l}</button>)}
      </div>
      <div className={"stt-ring" + (phase === "break" ? " is-break" : "")}>
        <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="stt-ring-bg" cx="100" cy="100" r={R}/><circle className="stt-ring-fg" cx="100" cy="100" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - pct)}/></svg>
        <div className="stt-ring-in">
          <span className="stt-ring-t" role="timer" aria-live="off">{mm}:{ss}</span>
          <span className="stt-ring-l">{phase === "work" ? "Focus" : "Break — stand up, drink water"}</span>
        </div>
      </div>
      <p className="stt-sr" aria-live="polite">{left === 0 ? "" : running ? "" : phase === "work" ? "Ready to focus." : "Break time."}</p>
      <div className="stt-row stt-row-c">
        {running ? <button type="button" className="stt-btn is-go" onClick={pause}>Pause <kbd>Space</kbd></button> : <button type="button" className="stt-btn is-go" onClick={start}>{left < total ? "Carry on" : "Start"} <kbd>Space</kbd></button>}
        <button type="button" className="stt-btn" onClick={reset}>Reset</button>
      </div>
      <label className="stt-label" htmlFor="stt-focus-what">What are you working on? (optional)</label>
      <input id="stt-focus-what" className="stt-input" maxLength={120} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Maths homework, page 42"/>
      <p className="stt-meta" aria-live="polite">{done ? done + (done === 1 ? " block" : " blocks") + " done today on this device. " : ""}{note || (!signedIn ? "Sign in to keep a record of your blocks." : "")}</p>
      <p className="stt-fine">Phone face down, in another room if you can. One task per block.</p>
    </div>
  );
}

/* ── Typing practice ────────────────────────────────────────────────────
 * Words a minute = correct characters ÷ 5 per minute (the standard measure);
 * accuracy = correct keystrokes ÷ all keystrokes. The passages are about the
 * things NGG teaches, so practice is reading too. */
const STT_PASSAGES = [
  "A habit is a small thing done every day. Read for ten minutes, write one page, practise one skill. In a year, small things become big ones.",
  "Lagos wakes early. Buses fill, markets open and traders call out their prices. Every busy street is a lesson in business, if you watch closely.",
  "A spreadsheet is a grid of rows and columns. Each box is a cell. A formula in one cell can add, compare or count the numbers in many others.",
  "Courage is not the absence of fear. It is choosing to do the right thing while you are afraid, and doing it again the next day.",
  "Plants make their own food. Their leaves take in light, water and carbon dioxide, and they give out oxygen, which every animal needs to breathe.",
  "To solve a hard problem, write down what you know, what you need, and one small step you can take now. Then take it, and look again.",
  "The Niger is the main river of West Africa. It flows for more than four thousand kilometres through Guinea, Mali, Niger and Nigeria to the sea.",
  "Good code is written for people as much as for machines. Clear names, short functions and kind comments help the next person, who may be you.",
];
function SttTyping({ signedIn }) {
  const [n, setN] = React.useState(() => Math.floor(Math.random() * STT_PASSAGES.length));
  const [typed, setTyped] = React.useState("");
  const [t0, setT0] = React.useState(0);
  const [keys, setKeys] = React.useState({ all: 0, ok: 0 });
  const [res, setRes] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  const ref = React.useRef(null);
  const text = STT_PASSAGES[n];
  React.useEffect(() => { if (!t0 || res) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [t0, res]);
  const correct = (() => { let c = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) c++; return c; })();
  const mins = t0 ? Math.max(1 / 60, ((res ? res.at : now) - t0) / 60000) : 0;
  const wpm = t0 ? Math.round(correct / 5 / mins) : 0;
  const acc = keys.all ? Math.round(keys.ok / keys.all * 100) : 100;
  const onChange = e => {
    if (res) return;
    const v = e.target.value.slice(0, text.length);
    if (!t0 && v) setT0(Date.now());
    if (v.length > typed.length) { const ch = v[v.length - 1]; setKeys(k => ({ all: k.all + 1, ok: k.ok + (ch === text[v.length - 1] ? 1 : 0) })); }
    setTyped(v);
    if (v.length === text.length) {
      const at = Date.now(), m = Math.max(1 / 60, (at - (t0 || at)) / 60000);
      let c = 0; for (let i = 0; i < v.length; i++) if (v[i] === text[i]) c++;
      const w = Math.round(c / 5 / m), a = keys.all + 1 ? Math.round((keys.ok + (v[v.length - 1] === text[v.length - 1] ? 1 : 0)) / (keys.all + 1) * 100) : 100;
      setRes({ at, wpm: w, acc: a });
      if (signedIn && w > 0) NGGApi.member.tools.log({ tool: "typing", wpm: Math.min(250, w), accuracy: a }).catch(() => {});
    }
  };
  const again = next => { setTyped(""); setT0(0); setKeys({ all: 0, ok: 0 }); setRes(null); if (next) setN(i => (i + 1) % STT_PASSAGES.length); setTimeout(() => ref.current && ref.current.focus(), 0); };
  return (
    <div className="stt-stack">
      <p className="stt-type-text" aria-label={"Type this: " + text}>
        {text.split("").map((ch, i) => <span key={i} className={i < typed.length ? (typed[i] === ch ? "is-ok" : "is-bad") : i === typed.length ? "is-cur" : ""} aria-hidden="true">{ch}</span>)}
      </p>
      <label className="stt-label" htmlFor="stt-type-in">Type the passage above</label>
      <textarea id="stt-type-in" ref={ref} className="stt-input stt-type-in" rows={3} value={typed} onChange={onChange} disabled={!!res}
        autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck="false" onPaste={e => e.preventDefault()}/>
      <div className="stt-row" aria-live="polite">
        <span className="stt-stat"><b>{res ? res.wpm : wpm}</b> words a minute</span>
        <span className="stt-stat"><b>{res ? res.acc : acc}%</b> accuracy</span>
        <span className="stt-stat"><b>{Math.round(typed.length / text.length * 100)}%</b> done</span>
      </div>
      {res && <p className="stt-p" role="status">{res.acc >= 95 ? "Accurate and steady — now try to go a little faster." : "Slow down a touch: accuracy first, speed follows."}{signedIn ? " Saved to your record." : ""}</p>}
      <div className="stt-row">
        <button type="button" className="stt-btn is-go" onClick={() => again(true)}>{res ? "Next passage" : "Skip this passage"}</button>
        <button type="button" className="stt-btn" onClick={() => again(false)}>Start again</button>
      </div>
      <p className="stt-fine">Fingers on the home keys (A S D F — J K L ;), eyes on the screen, not the keyboard.</p>
    </div>
  );
}

/* ── Calculator ────────────────────────────────────────────────────────
 * Type the sum, or press the keys. Degrees or radians for angles. The last
 * answer is “ans”. History is this device's only. */
const STT_CALC_KEYS = [
  ["sin(", "cos(", "tan(", "sqrt(", "^"], ["ln(", "log(", "(", ")", "÷"], ["7", "8", "9", "×", "π"],
  ["4", "5", "6", "−", "e"], ["1", "2", "3", "+", "!"], ["0", ".", "ans", "%", "="],
];
function SttCalc() {
  const [expr, setExpr] = React.useState("");
  const [deg, setDeg] = React.useState(true);
  const [ans, setAns] = React.useState(null);
  const [hist, setHist] = React.useState([]);
  const [err, setErr] = React.useState("");
  const ref = React.useRef(null);
  const live = expr.trim() ? sttEval(expr, { ans }, deg) : null;
  const run = () => {
    const r = sttEval(expr, { ans }, deg);
    if (!r.ok) { setErr(r.error); return; }
    setErr(""); setAns(r.value); setHist(h => [{ e: expr, v: r.value }].concat(h).slice(0, 12)); setExpr("");
  };
  const press = k => {
    if (k === "=") return run();
    setErr(""); setExpr(x => x + (k === "ans" ? "ans" : k));
    setTimeout(() => ref.current && ref.current.focus(), 0);
  };
  return (
    <div className="stt-calc">
      <form className="stt-stack" onSubmit={e => { e.preventDefault(); run(); }}>
        <label className="stt-label" htmlFor="stt-calc-in">Sum</label>
        <input id="stt-calc-in" ref={ref} className="stt-input stt-calc-in" value={expr} onChange={e => { setErr(""); setExpr(e.target.value); }}
          placeholder="e.g. 2 × (3 + 4)^2 or sin(30)" autoComplete="off" spellCheck="false" inputMode="text" aria-describedby="stt-calc-out"/>
        {/x/i.test(expr.replace(/max|exp/gi, "")) ? <button type="button" className="stt-link" onClick={() => sttGo("tools", "graph", { fn: expr })}><i className="ph ph-chart-line" aria-hidden="true"/>This has x in it — plot it as a graph</button> : null}
        <p id="stt-calc-out" className={"stt-calc-out" + (err ? " is-err" : "")} aria-live="polite">
          {err ? err : live && live.ok ? "= " + sttFormat(live.value) : ans != null ? "ans = " + sttFormat(ans) : " "}
        </p>
        <div className="stt-row">
          <button type="button" className={"stt-chip" + (deg ? " is-on" : "")} aria-pressed={deg} onClick={() => setDeg(true)}>Degrees</button>
          <button type="button" className={"stt-chip" + (!deg ? " is-on" : "")} aria-pressed={!deg} onClick={() => setDeg(false)}>Radians</button>
          <button type="button" className="stt-chip" onClick={() => setExpr(x => x.slice(0, -1))} aria-label="Delete the last character"><i className="ph ph-backspace" aria-hidden="true"/></button>
          <button type="button" className="stt-chip" onClick={() => { setExpr(""); setErr(""); }}>Clear</button>
        </div>
        <div className="stt-keys" role="group" aria-label="Calculator keys">
          {STT_CALC_KEYS.flat().map(k => <button key={k} type="button" className={"stt-key" + (k === "=" ? " is-eq" : /^[0-9.]$/.test(k) ? " is-num" : "")} onClick={() => press(k)} aria-label={k === "−" ? "minus" : k === "×" ? "times" : k === "÷" ? "divide" : k === "^" ? "to the power of" : k === "!" ? "factorial" : k.replace("(", "")}>{k.replace("(", "")}</button>)}
        </div>
      </form>
      <section className="stt-card stt-hist" aria-labelledby="stt-hist-h">
        <h3 id="stt-hist-h" className="stt-h3">History</h3>
        {!hist.length ? <p className="stt-meta">Your answers appear here. Press one to use it again.</p>
          : <ol className="stt-hist-list">{hist.map((h, i) => <li key={i}><button type="button" className="stt-hist-row" onClick={() => setExpr(x => x + "(" + sttFormat(h.v).replace("∞", "") + ")")}><span>{h.e}</span><b>= {sttFormat(h.v)}</b></button></li>)}</ol>}
        <p className="stt-fine">Functions: sin cos tan asin acos atan sqrt cbrt ln log exp abs round floor ceil fact min(a, b) max(a, b) nroot(x, n) · π e ans</p>
      </section>
    </div>
  );
}

/* ── Graph plotter ─────────────────────────────────────────────────────
 * Up to three functions of x, on a canvas sized to its own box. Zoom and move
 * by buttons (nothing needs a drag), and a table of values for anyone who
 * cannot see the picture. */
const STT_GRAPH_COLOURS = ["#1e4fae", "#b0361c", "#1d6b30"];
function SttGraph() {
  // A sum sent from the calculator ("plot it") becomes the first function.
  const [fns, setFns] = React.useState(() => { const h = sttTakeHandoff(); return h && h.fn ? [h.fn, "", ""] : ["x^2 - 2", "sin(x)", ""]; });
  const [view, setView] = React.useState({ cx: 0, cy: 0, span: 20 });
  const [deg] = React.useState(false);
  const box = React.useRef(null), cv = React.useRef(null);
  const [w, setW] = React.useState(600);
  React.useLayoutEffect(() => {
    const el = box.current; if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width)))); ro.observe(el); return () => ro.disconnect();
  }, []);
  /* Compiled once per edit, and run once at x = 1: a sum that is incomplete
     ("x^2 +") only shows itself when it is worked out, and the plotter would
     otherwise draw nothing and say nothing. */
  const comp = fns.map(f => { if (!f.trim()) return null; try { const rpn = sttCompile(f); sttRun(rpn, { x: 1 }, false); return { rpn }; } catch (e) { return /factorial/.test(e.message) ? { rpn: sttCompile(f) } : { error: e.message }; } });
  const h = Math.round(w * 0.7);
  React.useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1; c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px";
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const xs = view.span, ys = view.span * h / w, x0 = view.cx - xs / 2, y0 = view.cy - ys / 2;
    const px = x => (x - x0) / xs * w, py = y => h - (y - y0) / ys * h;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    // Grid, at a step that keeps lines about 50px apart.
    const raw = xs / (w / 50), base = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map(m => m * base).find(s => s >= raw);
    g.strokeStyle = "#eef0f4"; g.lineWidth = 1; g.fillStyle = "#5a6488"; g.font = "11px ui-sans-serif, system-ui"; g.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x0 + xs; x += step) { g.moveTo(px(x), 0); g.lineTo(px(x), h); }
    for (let y = Math.ceil(y0 / step) * step; y <= y0 + ys; y += step) { g.moveTo(0, py(y)); g.lineTo(w, py(y)); }
    g.stroke();
    g.strokeStyle = "#5a6488"; g.beginPath(); g.moveTo(px(0), 0); g.lineTo(px(0), h); g.moveTo(0, py(0)); g.lineTo(w, py(0)); g.stroke();
    for (let x = Math.ceil(x0 / step) * step; x <= x0 + xs; x += step) if (Math.abs(x) > step / 2) g.fillText(sttFormat(parseFloat(x.toPrecision(6))), px(x) + 2, Math.min(h - 4, Math.max(12, py(0) + 12)));
    for (let y = Math.ceil(y0 / step) * step; y <= y0 + ys; y += step) if (Math.abs(y) > step / 2) g.fillText(sttFormat(parseFloat(y.toPrecision(6))), Math.min(w - 30, Math.max(2, px(0) + 4)), py(y) - 2);
    comp.forEach((cf, i) => {
      if (!cf || !cf.rpn) return;
      g.strokeStyle = STT_GRAPH_COLOURS[i]; g.lineWidth = 2.5; g.beginPath(); let pen = false, lastY = null;
      for (let sx = 0; sx <= w; sx++) {
        const x = x0 + sx / w * xs; let y;
        try { y = sttRun(cf.rpn, { x }, deg); } catch (_) { y = NaN; }
        if (!isFinite(y) || (lastY != null && Math.abs(y - lastY) > ys * 2)) { pen = false; lastY = isFinite(y) ? y : null; continue; }
        const Y = py(y); if (!pen) { g.moveTo(sx, Y); pen = true; } else g.lineTo(sx, Y); lastY = y;
      }
      g.stroke();
    });
  });
  const zoom = f => setView(v => ({ ...v, span: Math.min(1e6, Math.max(1e-3, v.span * f)) }));
  const move = (dx, dy) => setView(v => ({ ...v, cx: v.cx + dx * v.span / 5, cy: v.cy + dy * v.span / 5 }));
  const table = [-2, -1, 0, 1, 2].map(k => view.cx + k * view.span / 8);
  return (
    <div className="stt-stack">
      {fns.map((f, i) => (
        <div key={i} className="stt-fn">
          <label className="stt-fn-l" htmlFor={"stt-fn-" + i} style={{ color: STT_GRAPH_COLOURS[i] }}>y{i + 1} =</label>
          <input id={"stt-fn-" + i} className="stt-input" value={f} onChange={e => setFns(a => a.map((x, j) => j === i ? e.target.value : x))} placeholder={i === 2 ? "Another function of x (optional)" : "A function of x"} spellCheck="false" autoComplete="off"/>
          {comp[i] && comp[i].error ? <p className="stt-err" role="alert">{comp[i].error}</p> : null}
        </div>
      ))}
      <div ref={box} className="stt-graph-box"><canvas ref={cv} className="stt-graph" role="img" aria-label={"Graph of " + fns.filter(Boolean).map((f, i) => "y" + (i + 1) + " = " + f).join(", ")}/></div>
      <div className="stt-row" role="group" aria-label="Move and zoom the graph">
        <button type="button" className="stt-chip" onClick={() => zoom(0.5)} aria-label="Zoom in"><i className="ph ph-magnifying-glass-plus" aria-hidden="true"/></button>
        <button type="button" className="stt-chip" onClick={() => zoom(2)} aria-label="Zoom out"><i className="ph ph-magnifying-glass-minus" aria-hidden="true"/></button>
        <button type="button" className="stt-chip" onClick={() => move(-1, 0)} aria-label="Move left"><i className="ph ph-arrow-left" aria-hidden="true"/></button>
        <button type="button" className="stt-chip" onClick={() => move(1, 0)} aria-label="Move right"><i className="ph ph-arrow-right" aria-hidden="true"/></button>
        <button type="button" className="stt-chip" onClick={() => move(0, 1)} aria-label="Move up"><i className="ph ph-arrow-up" aria-hidden="true"/></button>
        <button type="button" className="stt-chip" onClick={() => move(0, -1)} aria-label="Move down"><i className="ph ph-arrow-down" aria-hidden="true"/></button>
        <button type="button" className="stt-chip" onClick={() => setView({ cx: 0, cy: 0, span: 20 })}>Reset view</button>
      </div>
      <table className="stt-table">
        <caption className="stt-meta">Values near the middle of the graph</caption>
        <thead><tr><th scope="col">x</th>{fns.map((f, i) => f.trim() ? <th key={i} scope="col">y{i + 1}</th> : null)}</tr></thead>
        <tbody>{table.map(x => <tr key={x}><td>{sttFormat(parseFloat(x.toPrecision(6)))}</td>{fns.map((f, i) => f.trim() ? <td key={i}>{comp[i] && comp[i].rpn ? (() => { try { return sttFormat(sttRun(comp[i].rpn, { x }, deg)); } catch (_) { return "—"; } })() : "—"}</td> : null)}</tr>)}</tbody>
      </table>
      <p className="stt-fine">Angles are in radians here. Try 2x + 1, x^3 − 3x, sqrt(x), 1/x, abs(x), or 3sin(2x).</p>
    </div>
  );
}

/* ── Dictionary ─────────────────────────────────────────────────────────
 * The free Dictionary API (dictionaryapi.dev, Wiktionary's data): meanings,
 * examples, synonyms, and how to say it. Nothing is stored. */
/** Add one card to the member's "My words" deck, making the deck the first time. */
async function sttAddToMyWords(front, back) {
  const r = await NGGApi.member.tools.decks();
  const d = (r.decks || []).find(x => x.name === "My words");
  let cards = [];
  if (d) { const full = await NGGApi.member.tools.deck(d.deckId); cards = full.cards || []; if (cards.some(c => c.front.toLowerCase() === front.toLowerCase())) return "already"; }
  await NGGApi.member.tools.save({ deckId: d ? d.deckId : "", name: "My words", source: "From the dictionary", cards: cards.concat([{ front, back }]) });
  return "added";
}
function SttDict({ signedIn }) {
  const [q, setQ] = React.useState("");
  const [st, setSt] = React.useState({ phase: "idle" });
  const [saved, setSaved] = React.useState("");
  const save = async () => {
    const m = (st.entries || []).flatMap(en => en.meanings || [])[0];
    const def = m && m.definitions && m.definitions[0] ? "(" + m.partOfSpeech + ") " + m.definitions[0].definition : "";
    if (!def) return;
    setSaved("…");
    try { const r = await sttAddToMyWords(st.word, def); setSaved(r === "already" ? "Already in My words." : "Added to My words — review it in Flashcards."); }
    catch (e) { setSaved(sttErr(e)); }
  };
  const look = async (word) => {
    setSaved("");
    const w = String(word || q).trim().toLowerCase();
    if (!/^[a-z][a-z' -]{0,40}$/.test(w)) { setSt({ phase: "error", text: "Type one English word (letters only)." }); return; }
    setSt({ phase: "loading" });
    try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(w));
      if (r.status === 404) { setSt({ phase: "none", word: w }); return; }
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      setSt({ phase: "ok", word: w, entries: Array.isArray(j) ? j : [] });
    } catch (e) { setSt({ phase: "error", text: "Couldn’t reach the dictionary. Check your connection.", retry: true, word: w }); }
  };
  const audio = st.phase === "ok" ? ((st.entries[0] && st.entries[0].phonetics) || []).map(p => p.audio).find(Boolean) : "";
  const phon = st.phase === "ok" ? ((st.entries[0] && (st.entries[0].phonetic || ((st.entries[0].phonetics || []).find(p => p.text) || {}).text)) || "") : "";
  return (
    <div className="stt-stack">
      <form role="search" className="stt-row" onSubmit={e => { e.preventDefault(); look(); }}>
        <label className="stt-sr" htmlFor="stt-dict-q">Word</label>
        <input id="stt-dict-q" className="stt-input stt-grow" value={q} onChange={e => setQ(e.target.value)} placeholder="Look up a word" autoCapitalize="off" spellCheck="false" maxLength={40}/>
        <button type="submit" className="stt-btn is-go" disabled={!q.trim()}>Look up</button>
      </form>
      <div role="status" aria-live="polite">
        {st.phase === "idle" ? <p className="stt-meta">Meanings, examples and how to say it — from Wiktionary.</p>
          : st.phase === "loading" ? <SttState kind="loading" text="Looking it up…"/>
          : st.phase === "error" ? <SttState kind="error" text={st.text} retry={st.retry ? () => look(st.word) : null}/>
          : st.phase === "none" ? <SttState kind="empty" text={"No entry for “" + st.word + "”. Check the spelling, or try the word without an ending (“run” for “running”)."}/>
          : <article className="stt-card stt-dict">
              <header className="stt-row stt-row-split">
                <h3 className="stt-h3 stt-word">{st.word} {phon ? <small className="stt-meta">{phon}</small> : null}</h3>
                <div className="stt-row">
                  {audio ? <button type="button" className="stt-chip" onClick={() => { try { new Audio(audio).play(); } catch (_) {} }} aria-label={"Hear how to say " + st.word}><i className="ph ph-speaker-high" aria-hidden="true"/>Hear it</button> : null}
                  {signedIn ? <button type="button" className="stt-chip" onClick={save} disabled={saved === "…"}><i className="ph ph-cards" aria-hidden="true"/>Add to My words</button> : null}
                </div>
              </header>
              {saved && saved !== "…" ? <p className="stt-meta" role="status">{saved}</p> : null}
              {st.entries.flatMap(en => en.meanings || []).slice(0, 6).map((m, i) => (
                <section key={i} className="stt-sense">
                  <p className="stt-pos">{m.partOfSpeech}</p>
                  <ol>{(m.definitions || []).slice(0, 3).map((d, j) => <li key={j}>{d.definition}{d.example ? <span className="stt-ex"> “{d.example}”</span> : null}</li>)}</ol>
                  {(m.synonyms || []).length ? <p className="stt-meta">Similar: {m.synonyms.slice(0, 6).map((s, k) => <button key={k} type="button" className="stt-link" onClick={() => { setQ(s); look(s); }}>{s}</button>)}</p> : null}
                </section>
              ))}
            </article>}
      </div>
    </div>
  );
}

Object.assign(window, { SttFocus, SttTyping, SttCalc, SttGraph, SttDict, STT_PASSAGES });
