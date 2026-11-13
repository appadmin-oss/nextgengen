/* ============================================================================
   Maths Lab — the new interface (docs/MATH-LAB-PLAN.md §11). A tab of the
   study page at /study/lab (/mathlab forwards here).

   Members: the climb (start at MC-001, rise on performance and speed), the
   constellation map, a page per competency with a worked example, practice
   with instant feedback, mastery checks, spaced reviews, stage bosses, XP,
   streak, badges and Coursera-style courses with certificates.
   Everyone else: Maths Lab Lite — practice with marking and worked
   solutions, nothing kept.

   The server marks every answer; this file never holds a key. Maths is
   typeset with KaTeX (vendor/katex, loaded on demand).
   ========================================================================== */

const MLB_STATE_L = { none: "Not started", open: "Ready to learn", locked: "Locked", soon: "In preparation", learning: "Learning", practising: "Practising",
  ready: "Ready to check", review: "Needs a refresh", known: "Known (fast-tracked)", mastered: "Mastered", secure: "Secure", longterm: "Long-term" };
const MLB_GOOD_V = ["known", "mastered", "secure", "longterm"];
const MLB_ERR = { members_only: "The full Lab is for NGG members.", locked: "Finish the topics this builds on first.", not_available: "This topic is still in preparation.",
  not_studied: "Study the lesson first: work through every step, then practise.", quick_today: "You’ve had today’s quick check on this topic — the lesson is the way in now.", already_open: "Practise is already open for this topic.", practice_owed: "Get more practice questions right first — the check can't be retried straight away.", not_ready: "The mastery check opens when your practice shows you are ready.",
  climb_done: "Your climb is finished.", nothing_due: "Nothing is due for review.", boss_locked: "Know every topic in the stage first.", finished: "That session is already finished.",
  network: "You’re offline. Check your connection and try again.", rate_limited: "Slow down a little and try again." };
function mlbErr(e) { const c = e && (e.code || e.message); return MLB_ERR[c] || (e && e.detail) || "That didn’t work. Try again."; }

/* ── Maths typesetting ── */
let _mlbKatex = null;
function useMlbKatex() {
  const [k, setK] = React.useState(() => window.katex || null);
  React.useEffect(() => { if (k) return; (_mlbKatex = _mlbKatex || loadVendor("katex")).then(x => setK(x), () => {}); }, [k]);
  return k;
}
function mlbEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
/** Text with $…$ maths in it → HTML. Text parts are escaped; maths goes through KaTeX (or shows as written while it loads). */
function mlbHtml(text, katex) {
  const parts = String(text == null ? "" : text).split(/(\$[^$]+\$)/g);
  return parts.map(p => {
    if (/^\$[^$]+\$$/.test(p)) {
      const tex = p.slice(1, -1);
      if (katex) { try { return katex.renderToString(tex, { throwOnError: false, output: "htmlAndMathml" }); } catch (_) {} }
      return '<span class="mlb-tex">' + mlbEsc(tex) + "</span>";
    }
    return mlbEsc(p);
  }).join("");
}
function MlbMath({ text, as, className }) {
  const katex = useMlbKatex();
  const Tag = as || "span";
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: mlbHtml(text, katex) }}/>;
}

/* ── Diagrams: drawn from the question's own numbers ── */
function MlbDiagram({ d }) {
  if (!d) return null;
  if (String(d.type || "").indexOf("phy-") === 0) return <PhyDiagram d={d}/>;   // the Physics Lab's figures (phy-visuals.jsx)
  const W = 320;
  if (d.type === "dots") {
    let s = d.seed || 1; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const pts = []; const cols = 6;
    for (let i = 0; i < d.n; i++) pts.push([28 + (i % cols) * 48 + rnd() * 14, 26 + Math.floor(i / cols) * 44 + rnd() * 12]);
    const h = 30 + Math.ceil(d.n / cols) * 44;
    return <svg className="mlb-dia" viewBox={"0 0 " + W + " " + h} role="img" aria-label={d.n + " stars"}>{pts.map((p, i) => <text key={i} x={p[0]} y={p[1] + 10} fontSize="26" textAnchor="middle">★</text>)}</svg>;
  }
  if (d.type === "groups") {
    return <svg className="mlb-dia" viewBox={"0 0 " + W + " 110"} role="img" aria-label={"Two groups of " + d.groups.join(" and ")}>{d.groups.map((g, gi) => (
      <g key={gi} transform={"translate(" + (10 + gi * 160) + ",10)"}><rect width="148" height="90" rx="14" className="mlb-dia-box"/>{Array.from({ length: g }, (_, i) => <circle key={i} cx={22 + (i % 5) * 26} cy={26 + Math.floor(i / 5) * 34} r="10" className="mlb-dia-dot"/>)}</g>))}</svg>;
  }
  if (d.type === "array") {
    const r = 14, gap = 30, w = d.cols * gap + 20, h = d.rows * gap + 20;
    return <svg className="mlb-dia" viewBox={"0 0 " + w + " " + h} role="img" aria-label={d.rows + " rows of " + d.cols + " dots"}>{Array.from({ length: d.rows * d.cols }, (_, i) => <circle key={i} cx={25 + (i % d.cols) * gap} cy={25 + Math.floor(i / d.cols) * gap} r={r / 1.6} className="mlb-dia-dot"/>)}</svg>;
  }
  if (d.type === "numberline") {
    const n = d.count, x0 = 20, x1 = 300, step = (x1 - x0) / n, labels = d.labels || [0, n];
    return <svg className="mlb-dia" viewBox={"0 0 " + W + " 90"} role="img" aria-label="A number line">
      <line x1={x0 - 10} y1="50" x2={x1 + 10} y2="50" className="mlb-dia-axis"/>
      {Array.from({ length: n + 1 }, (_, i) => <g key={i}><line x1={x0 + i * step} y1="42" x2={x0 + i * step} y2="58" className="mlb-dia-axis"/>
        {(labels.indexOf(i) >= 0 || d.arrow == null) ? <text x={x0 + i * step} y="78" textAnchor="middle" className="mlb-dia-t">{d.start + i * d.step}</text> : null}</g>)}
      {d.arrow != null ? <path d={"M" + (x0 + d.arrow * step) + " 38 l-7 -14 h14 z"} className="mlb-dia-arrow"/> : null}
      {d.mark != null ? <circle cx={x0 + d.mark * step} cy="50" r="6" className="mlb-dia-arrow"/> : null}
    </svg>;
  }
  if (d.type === "fractionbar") {
    const w = 280 / d.n;
    return <svg className="mlb-dia" viewBox={"0 0 " + W + " 70"} role="img" aria-label={"A bar in " + d.n + " equal parts, " + d.k + " shaded"}>{Array.from({ length: d.n }, (_, i) => <rect key={i} x={20 + i * w} y="15" width={w} height="40" className={i < d.k ? "mlb-dia-fill" : "mlb-dia-box"}/>)}</svg>;
  }
  if (d.type === "placevalue") {
    const cols = [["Thousands", d.th, 30], ["Hundreds", d.h, 22], ["Tens", d.t, 10], ["Ones", d.o, 8]];
    return <svg className="mlb-dia" viewBox="0 0 320 150" role="img" aria-label="Place-value blocks">{cols.map(([l, c, s], ci) => (
      <g key={l} transform={"translate(" + (8 + ci * 78) + ",8)"}><text x="36" y="12" textAnchor="middle" className="mlb-dia-t">{l}</text>
        {Array.from({ length: c }, (_, i) => <rect key={i} x={6 + (i % 3) * 22} y={22 + Math.floor(i / 3) * 26} width={s === 30 ? 20 : s === 22 ? 18 : s === 10 ? 6 : 8} height={s === 30 ? 20 : s === 22 ? 18 : 20} className="mlb-dia-fill"/>)}</g>))}</svg>;
  }
  if (d.type === "lines") {
    const R = d.range || 6, S = 300, sc = S / (2 * R), X = v => S / 2 + v * sc, Y = v => S / 2 - v * sc;
    return <svg className="mlb-dia mlb-dia-sq" viewBox={"0 0 " + S + " " + S} role="img" aria-label="Two straight-line graphs on a grid">
      {Array.from({ length: 2 * R + 1 }, (_, i) => <g key={i}><line x1={X(i - R)} y1="0" x2={X(i - R)} y2={S} className="mlb-dia-grid"/><line x1="0" y1={Y(i - R)} x2={S} y2={Y(i - R)} className="mlb-dia-grid"/></g>)}
      <line x1="0" y1={Y(0)} x2={S} y2={Y(0)} className="mlb-dia-axis"/><line x1={X(0)} y1="0" x2={X(0)} y2={S} className="mlb-dia-axis"/>
      {d.lines.map(([m, c], i) => <line key={i} x1={X(-R)} y1={Y(m * -R + c)} x2={X(R)} y2={Y(m * R + c)} className={"mlb-dia-line" + (i ? " is-b" : "")}/>)}
      {[-R + 1, R - 1].map(v => <text key={v} x={X(v)} y={Y(0) + 14} textAnchor="middle" className="mlb-dia-t">{v}</text>)}
    </svg>;
  }
  if (d.type === "figure") {
    const P = d.pts || {}, names = Object.keys(P); if (!names.length) return null;
    const xs = names.map(k => P[k][0]), ys = names.map(k => P[k][1]);
    (d.circles || []).forEach(c => { xs.push(c[0] - c[2], c[0] + c[2]); ys.push(c[1] - c[2], c[1] + c[2]); });
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W2 = 320, H2 = 240, pad = 34, sc = Math.min((W2 - 2 * pad) / Math.max(maxX - minX, 1e-6), (H2 - 2 * pad) / Math.max(maxY - minY, 1e-6));
    const X = x => pad + (x - minX) * sc + ((W2 - 2 * pad) - (maxX - minX) * sc) / 2, Y = y => H2 - pad - (y - minY) * sc - ((H2 - 2 * pad) - (maxY - minY) * sc) / 2;
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    return <svg className="mlb-dia" viewBox={"0 0 " + W2 + " " + H2} role="img" aria-label={"A figure with points " + names.join(", ")}>
      {(d.circles || []).map((c, i) => <circle key={"c" + i} cx={X(c[0])} cy={Y(c[1])} r={c[2] * sc} className="mlb-dia-shape"/>)}
      {(d.segs || []).map((s, i) => { const a = P[s[0]], b = P[s[1]]; if (!a || !b) return null; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, u = unit([cx, cy], [mx, my]);
        return <g key={"s" + i}><line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} className="mlb-dia-edge"/>
          {s[2] ? <text x={X(mx) + u[0] * 16} y={Y(my) - u[1] * 16 + 4} textAnchor="middle" className="mlb-dia-t">{s[2]}</text> : null}</g>; })}
      {(d.angles || []).map((g, i) => { const p = P[g[0]], v = P[g[1]], q = P[g[2]]; if (!p || !v || !q) return null; const u1 = unit(v, p), u2 = unit(v, q), r = 22;
        const bis = unit([0, 0], [u1[0] + u2[0], u1[1] + u2[1]]);
        return <g key={"a" + i}><path d={"M" + (X(v[0]) + u1[0] * r) + " " + (Y(v[1]) - u1[1] * r) + " A" + r + " " + r + " 0 0 " + ((u1[0] * u2[1] - u1[1] * u2[0]) > 0 ? 0 : 1) + " " + (X(v[0]) + u2[0] * r) + " " + (Y(v[1]) - u2[1] * r)} className="mlb-dia-ang"/>
          <text x={X(v[0]) + bis[0] * 40} y={Y(v[1]) - bis[1] * 40 + 4} textAnchor="middle" className="mlb-dia-t is-ang">{g[3]}</text></g>; })}
      {(d.right || []).map((g, i) => { const p = P[g[0]], v = P[g[1]], q = P[g[2]]; if (!p || !v || !q) return null; const u1 = unit(v, p), u2 = unit(v, q), r = 12;
        const a = [X(v[0]) + u1[0] * r, Y(v[1]) - u1[1] * r], b = [a[0] + u2[0] * r, a[1] - u2[1] * r], c = [X(v[0]) + u2[0] * r, Y(v[1]) - u2[1] * r];
        return <path key={"r" + i} d={"M" + a.join(" ") + " L" + b.join(" ") + " L" + c.join(" ")} className="mlb-dia-ang"/>; })}
      {names.map(k => { const u = unit([cx, cy], P[k]); return <g key={k}><circle cx={X(P[k][0])} cy={Y(P[k][1])} r="3.5" className="mlb-dia-dot"/>
        <text x={X(P[k][0]) + u[0] * 14} y={Y(P[k][1]) - u[1] * 14 + 5} textAnchor="middle" className="mlb-dia-t is-pt">{k}</text></g>; })}
    </svg>;
  }
  if (d.type === "plot") {
    const R = d.range || 6;
    return <MlbPlot R={R} label="A graph on a grid">
      {(X, Y) => <React.Fragment>
        {(d.curves || []).map((c, i) => <path key={i} d={mlbCurve(c[0] === "line" ? x => c[1] * x + c[2] : x => c[1] * x * x + c[2] * x + c[3], R, X, Y)} className={"mlb-dia-line" + (i ? " is-b" : "")}/>)}
        {(d.pts || []).map((p, i) => <g key={"p" + i}><circle cx={X(p[0])} cy={Y(p[1])} r="5" className="mlb-dia-arrow"/>{p[2] ? <text x={X(p[0]) + 8} y={Y(p[1]) - 8} className="mlb-dia-t">{p[2]}</text> : null}</g>)}
      </React.Fragment>}
    </MlbPlot>;
  }
  return null;
}

/* ── Plotting helpers shared by question diagrams and the explorers ── */
function mlbCurve(f, R, X, Y) {
  let d = "", pen = false;
  for (let i = 0; i <= 240; i++) {
    const x = -R + (2 * R) * i / 240, y = f(x);
    if (!isFinite(y) || Math.abs(y) > R * 3) { pen = false; continue; }
    d += (pen ? " L" : " M") + X(x).toFixed(1) + " " + Y(y).toFixed(1); pen = true;
  }
  return d;
}
function MlbPlot({ R, children, label, S }) {
  const size = S || 300, sc = size / (2 * R), X = v => size / 2 + v * sc, Y = v => size / 2 - v * sc, cid = "mlbp" + React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const tick = R <= 6 ? 1 : R <= 12 ? 2 : 5;
  return (
    <svg className="mlb-dia mlb-dia-sq" viewBox={"0 0 " + size + " " + size} role="img" aria-label={label}>
      <defs><clipPath id={cid}><rect width={size} height={size}/></clipPath></defs>
      {Array.from({ length: 2 * R + 1 }, (_, i) => <g key={i}><line x1={X(i - R)} y1="0" x2={X(i - R)} y2={size} className="mlb-dia-grid"/><line x1="0" y1={Y(i - R)} x2={size} y2={Y(i - R)} className="mlb-dia-grid"/></g>)}
      <line x1="0" y1={Y(0)} x2={size} y2={Y(0)} className="mlb-dia-axis"/><line x1={X(0)} y1="0" x2={X(0)} y2={size} className="mlb-dia-axis"/>
      {Array.from({ length: Math.floor(R / tick) * 2 + 1 }, (_, i) => (i - Math.floor(R / tick)) * tick).filter(v => v && Math.abs(v) < R).map(v =>
        <g key={"t" + v}><text x={X(v)} y={Y(0) + 13} textAnchor="middle" className="mlb-dia-tick">{v}</text><text x={X(0) - 5} y={Y(v) + 4} textAnchor="end" className="mlb-dia-tick">{v}</text></g>)}
      <g clipPath={"url(#" + cid + ")"}>{children(X, Y, sc)}</g>
    </svg>
  );
}
/* A labelled range control: keyboard (arrows, Page Up/Down, Home/End) and touch, never a drag on the figure. */
function MlbSlider({ label, value, min, max, step, onChange, fmt }) {
  const id = React.useId();
  return (
    <div className="mlb-sl"><label htmlFor={id} className="mlb-sl-l"><MlbMath text={label}/></label>
      <input id={id} type="range" className="mlb-sl-in" min={min} max={max} step={step || 1} value={value} onChange={e => onChange(Number(e.target.value))}/>
      <output htmlFor={id} className="mlb-sl-v">{fmt ? fmt(value) : value}</output></div>
  );
}
const mlbR = (v, k) => { const p = Math.pow(10, k == null ? 2 : k); return String(Math.round(v * p) / p); };
const mlbComma = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");   // fixed, not the device locale
const mlbSign = (v, k) => (v < 0 ? "- " + mlbR(-v, k) : "+ " + mlbR(v, k));

/* ── Explore it: one small interactive per big idea. Registry, then the explorers. ── */
const MLB_EXPLORE = {
  numline: ["MC-008", "MC-011", "MC-012", "MC-021", "MC-022"],
  array: ["MC-014", "MC-015", "MC-016", "MC-017"],
  area: ["MC-045", "MC-056", "MC-058"],
  fraction: ["MC-025", "MC-026", "MC-027", "MC-030"],
  triangle: ["MC-072", "MC-073", "MC-074", "MC-075"],
  pythag: ["MC-077", "MC-096", "MC-111"],
  sector: ["MC-078", "MC-083", "MC-141"],
  line: ["MC-055", "MC-091", "MC-093", "MC-094", "MC-095", "MC-099"],
  quad: ["MC-098", "MC-101", "MC-102", "MC-103", "MC-104", "MC-106", "MC-157"],
  unit: ["MC-112", "MC-142", "MC-143", "MC-145", "MC-146"],
  chord: ["MC-151", "MC-152", "MC-153"],
  riemann: ["MC-158", "MC-159", "MC-160"],
  chance: ["MC-120", "MC-166"],
  series: ["MC-070", "MC-129"],
  growth: ["MC-038", "MC-063", "MC-169"],
  logs: ["MC-068", "MC-069", "MC-155"],
  ...PHY_EXPLORE,   // the Physics Lab's explorers (phy-visuals.jsx, loaded first)
};
/* One small challenge per explorer, in words an eleven-year-old can follow: a thing to DO and a
   thing to notice. The owner's rule: easy to understand, never dumbed down. */
const MLB_TRY = {
  numline: "Start at 3 and add −5. Which way did you jump? Now try adding a positive number.",
  array: "Make 3 rows of 7. Press “Turn it on its side”. Did the number of dots change?",
  area: "Make the two pieces the same width. Then make one piece really thin. Do the two parts still add up to the whole?",
  fraction: "Shade 1 part out of 2. Now cut each part into 3. Is the shaded length still the same?",
  triangle: "Make angle A as big as you can. What happens to the other angles? What do all three add up to?",
  pythag: "Find sides that make the long side a whole number. Hint: try 3 and 4, then 6 and 8.",
  sector: "Set the angle to 360°. That is the whole circle. Now try 180°: what fraction is that?",
  line: "Make the gradient 0. What does the line look like? Now make it negative.",
  quad: "Move c up until the curve stops touching the x-axis. Watch the discriminant: what sign is it now?",
  unit: "Move the angle into each quarter of the circle. Which of sin and cos turn negative?",
  chord: "Make the gap h smaller and smaller. Watch the orange line and the number.",
  riemann: "Start with 1 strip, then use more and more. How close can you get to the exact area?",
  chance: "Roll 10 times, then 1000 times. When do the bars look most even?",
  series: "Set r to 0.5 and add more terms. Does the total keep growing for ever?",
  growth: "Set the rate to 10% and the years to 30. Which line pulls ahead, and why?",
  logs: "Set the power to 0. Whatever the base, where is the dot? Now make the power negative: is the number still above zero?",
  ...PHY_TRY,
};
function mlbExplorerFor(comp) { for (const k in MLB_EXPLORE) if (MLB_EXPLORE[k].indexOf(comp) >= 0) return k; return null; }
function MlbExplore({ comp, onDone }) {
  /* Report the first real interaction once, AFTER the event: updating the lesson inside the
     slider's own input event swallowed that first move (the range snapped back). */
  const told = React.useRef(false); const [tried, setTried] = React.useState(false);
  const [gen, setGen] = React.useState(0);   // bumped by Reset: remounts the explorer at its starting values
  const tell = () => { if (told.current) return; told.current = true; setTimeout(() => { setTried(true); if (onDone) onDone(); }, 0); };
  const k = mlbExplorerFor(comp); if (!k) return null;
  const E = { numline: MlbExNumline, array: MlbExArray, area: MlbExArea, fraction: MlbExFraction, triangle: MlbExTriangle, pythag: MlbExPythag, sector: MlbExSector,
    line: MlbExLine, quad: MlbExQuad, unit: MlbExUnit, chord: MlbExChord, riemann: MlbExRiemann, chance: MlbExChance, series: MlbExSeries, growth: MlbExGrowth, logs: MlbExLog, ...PHY_EXPLORERS }[k];
  return (
    <section className="mlb-card mlb-explore" aria-labelledby="mlb-ex-h"
      onInputCapture={e => { if (e.target.closest("input")) tell(); }} onClickCapture={e => { if (e.target.closest(".mlb-ex button")) tell(); }}>
      <div className="mlb-ex-head">
        <h3 id="mlb-ex-h" className="mlb-h3"><i className="ph ph-sliders-horizontal" aria-hidden="true"/> Explore it</h3>
        {tried ? <button type="button" className="mlb-ex-reset" onClick={() => setGen(g => g + 1)}><i className="ph ph-arrow-counter-clockwise" aria-hidden="true"/> Reset</button> : null}
      </div>
      <PhyPredict k={k} tried={tried}>
        <p className="mlb-ex-try"><b>Try this:</b> {MLB_TRY[k]}</p>
        <E key={gen}/>
      </PhyPredict>
    </section>
  );
}
function MlbExOut({ children }) { return <div className="mlb-ex-out" role="status" aria-live="polite">{children}</div>; }

function MlbExNumline() {
  const [a, setA] = React.useState(3), [b, setB] = React.useState(-5);
  const x0 = 20, W = 300, X = v => x0 + (v + 10) * (W - 2 * x0 + 20) / 20 - 10, s = a + b, y = 44;
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 90" role="img" aria-label={"A jump from " + a + " by " + b + " landing on " + s}>
      <line x1="10" y1={y} x2="310" y2={y} className="mlb-dia-axis"/>
      {Array.from({ length: 21 }, (_, i) => i - 10).map(v => <g key={v}><line x1={X(v)} y1={y - (v % 5 ? 4 : 8)} x2={X(v)} y2={y + (v % 5 ? 4 : 8)} className="mlb-dia-axis"/>{v % 5 === 0 ? <text x={X(v)} y={y + 24} textAnchor="middle" className="mlb-dia-tick">{v}</text> : null}</g>)}
      <path d={"M" + X(a) + " " + y + " Q" + (X(a) + X(s)) / 2 + " " + (y - 40) + " " + X(s) + " " + y} className={"mlb-dia-jump" + (b < 0 ? " is-b" : "")}/>
      <circle cx={X(a)} cy={y} r="6" className="mlb-dia-dot"/><circle cx={X(s)} cy={y} r="6" className="mlb-dia-arrow"/>
    </svg>
    <MlbSlider label="Start at $a$" value={a} min={-10} max={10} onChange={setA}/>
    <MlbSlider label="Add $b$" value={b} min={-10} max={10} onChange={setB}/>
    <MlbExOut><MlbMath text={"$" + a + " + (" + b + ") = " + s + "$" + (Math.abs(s) > 10 ? " (off the line)" : "") + ". " + (b < 0 ? "Adding a negative number moves you LEFT. It is the same as taking away " + (-b) + "." : b === 0 ? "Adding zero does not move you at all." : "Adding a positive number moves you right.")}/></MlbExOut>
  </div>;
}
function MlbExArray() {
  const [r, setR] = React.useState(3), [c, setC] = React.useState(7), [t, setT] = React.useState(false);
  const rows = t ? c : r, cols = t ? r : c, g = Math.min(28, 280 / Math.max(cols, rows));
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox={"0 0 320 " + (rows * g + 20)} role="img" aria-label={rows + " rows of " + cols}>
      {Array.from({ length: rows * cols }, (_, i) => <circle key={i} cx={20 + (i % cols) * g} cy={14 + Math.floor(i / cols) * g} r={g / 3} className="mlb-dia-dot"/>)}</svg>
    <MlbSlider label="Rows" value={r} min={1} max={10} onChange={setR}/><MlbSlider label="Columns" value={c} min={1} max={10} onChange={setC}/>
    <button type="button" className="stt-btn" aria-pressed={t} onClick={() => setT(!t)}>Turn it on its side</button>
    <MlbExOut><MlbMath text={"$" + rows + " \\times " + cols + " = " + (r * c) + "$. Turning it on its side swaps the rows and columns, but the dots stay the same, so $" + r + " \\times " + c + " = " + c + " \\times " + r + "$. And $" + (r * c) + " \\div " + r + " = " + c + "$: division is reading the array back."}/></MlbExOut>
  </div>;
}
function MlbExArea() {
  const [a, setA] = React.useState(4), [b, setB] = React.useState(5), [c, setC] = React.useState(3);
  const u = Math.min(260 / (b + c), 150 / a);
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox={"0 0 320 " + (a * u + 40)} role="img" aria-label={"A rectangle " + a + " by " + (b + c) + " split into " + a * b + " and " + a * c}>
      <rect x="30" y="10" width={b * u} height={a * u} className="mlb-dia-fill"/><rect x={30 + b * u} y="10" width={c * u} height={a * u} className="mlb-dia-fill2"/>
      <text x={30 + b * u / 2} y={14 + a * u / 2} textAnchor="middle" className="mlb-dia-t">{a * b}</text><text x={30 + b * u + c * u / 2} y={14 + a * u / 2} textAnchor="middle" className="mlb-dia-t">{a * c}</text>
      <text x="18" y={14 + a * u / 2} textAnchor="middle" className="mlb-dia-t">{a}</text>
      <text x={30 + b * u / 2} y={a * u + 30} textAnchor="middle" className="mlb-dia-t">{b}</text><text x={30 + b * u + c * u / 2} y={a * u + 30} textAnchor="middle" className="mlb-dia-t">{c}</text>
    </svg>
    <MlbSlider label="$a$ (height)" value={a} min={1} max={9} onChange={setA}/><MlbSlider label="$b$" value={b} min={1} max={9} onChange={setB}/><MlbSlider label="$c$" value={c} min={1} max={9} onChange={setC}/>
    <MlbExOut><MlbMath text={"$" + a + "(" + b + " + " + c + ") = " + a + " \\times " + b + " + " + a + " \\times " + c + " = " + (a * b) + " + " + (a * c) + " = " + (a * (b + c)) + "$. It is one rectangle, counted all at once or in two pieces. That is why you can open up brackets."}/></MlbExOut>
  </div>;
}
function MlbExFraction() {
  const [n, setN] = React.useState(4), [k, setK] = React.useState(3), [m, setM] = React.useState(2);
  const kk = Math.min(k, n), bar = (parts, shade, y) => Array.from({ length: parts }, (_, i) => <rect key={i} x={20 + i * 280 / parts} y={y} width={280 / parts} height="34" className={i < shade ? "mlb-dia-fill" : "mlb-dia-box"}/>);
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 100" role="img" aria-label={kk + " out of " + n + " and " + kk * m + " out of " + n * m}>{bar(n, kk, 8)}{bar(n * m, kk * m, 56)}</svg>
    <MlbSlider label="Parts in the whole" value={n} min={2} max={10} onChange={setN}/><MlbSlider label="Parts shaded" value={kk} min={0} max={n} onChange={setK}/><MlbSlider label="Cut each part into" value={m} min={1} max={5} onChange={setM}/>
    <MlbExOut><MlbMath text={"$\\frac{" + kk + "}{" + n + "} = \\frac{" + (kk * m) + "}{" + (n * m) + "}$. Same shaded length, just cut into smaller pieces. $= " + mlbR(kk / n, 3) + " = " + mlbR(kk / n * 100, 1) + "\\%$."}/></MlbExOut>
  </div>;
}
function MlbExTriangle() {
  const [A, setA] = React.useState(50), [B, setB] = React.useState(70);
  const Bc = Math.min(B, 175 - A), C = 180 - A - Bc, rad = Math.PI / 180, base = 6, h = base * Math.sin(A * rad) * Math.sin(Bc * rad) / Math.sin((A + Bc) * rad), cx = h / Math.tan(A * rad);
  const P = { A: [0, 0], B: [base, 0], C: [cx, h] };
  return <div className="mlb-ex">
    <MlbDiagram d={{ type: "figure", pts: P, segs: [["A", "B"], ["B", "C"], ["C", "A"]], angles: [["B", "A", "C", A + "°"], ["C", "B", "A", Bc + "°"], ["A", "C", "B", C + "°"]] }}/>
    <MlbSlider label="Angle at A" value={A} min={10} max={160} onChange={setA} fmt={v => v + "°"}/><MlbSlider label="Angle at B" value={Bc} min={5} max={170 - A} onChange={setB} fmt={v => v + "°"}/>
    <MlbExOut><MlbMath text={"$" + A + "^\\circ + " + Bc + "^\\circ + " + C + "^\\circ = 180^\\circ$. Whatever triangle you make, the three angles always add up to 180° — a straight line."}/></MlbExOut>
  </div>;
}
function MlbExPythag() {
  const [a, setA] = React.useState(3), [b, setB] = React.useState(4), c = Math.hypot(a, b);
  /* Units, y down. Right angle at A; B along the base (side b), C straight up (side a). Each square
     is built on the OUTER side of its edge: sq(p, q) turns p→q a quarter-turn to find the far side. */
  const A = [0, 0], B = [b, 0], C = [0, -a];
  const sq = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1]; return [p, q, [q[0] - dy, q[1] + dx], [p[0] - dy, p[1] + dx]]; };
  const S = [[sq(A, B), "mlb-dia-fill", b * b], [sq(C, A), "mlb-dia-fill2", a * a], [sq(B, C), "mlb-dia-box", c * c]];
  const all = S.reduce((z, x) => z.concat(x[0]), []), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), u = Math.min(300 / (Math.max(...xs) - x0), 280 / (Math.max(...ys) - y0));
  const T = p => [10 + (p[0] - x0) * u, 10 + (p[1] - y0) * u], pts = q => q.map(p => T(p).join(",")).join(" ");
  const mid = q => T([(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]);
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 300" role="img" aria-label={"Squares on the sides: " + a * a + ", " + b * b + " and " + mlbR(c * c, 1)}>
      {S.map(([q, cls, area], i) => <g key={i}><polygon points={pts(q)} className={cls}/><text x={mid(q)[0]} y={mid(q)[1] + 5} textAnchor="middle" className="mlb-dia-t is-pt">{mlbR(area, 1)}</text></g>)}
      <polygon points={pts([A, B, C])} className="mlb-dia-shape"/>
    </svg>
    <MlbSlider label="Side $a$" value={a} min={1} max={8} onChange={setA}/><MlbSlider label="Side $b$" value={b} min={1} max={8} onChange={setB}/>
    <MlbExOut><MlbMath text={"$" + a + "^2 + " + b + "^2 = " + (a * a) + " + " + (b * b) + " = " + (a * a + b * b) + "$, so the hypotenuse is $\\sqrt{" + (a * a + b * b) + "} " + (Number.isInteger(c) ? "= " + c : "\\approx " + mlbR(c)) + "$. The two small squares always add up to exactly the big one." + (Number.isInteger(c) ? " A whole-number triple!" : "")}/></MlbExOut>
  </div>;
}
function MlbExSector() {
  const [r, setR] = React.useState(5), [t, setT] = React.useState(60), th = t * Math.PI / 180, R0 = 110, C = [160, 130];
  const end = [C[0] + R0 * Math.cos(-th), C[1] + R0 * Math.sin(-th)];
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 260" role="img" aria-label={"A sector of angle " + t + " degrees"}>
      <circle cx={C[0]} cy={C[1]} r={R0} className="mlb-dia-box"/>
      <path d={"M" + C.join(" ") + " L" + (C[0] + R0) + " " + C[1] + " A" + R0 + " " + R0 + " 0 " + (t > 180 ? 1 : 0) + " 0 " + end.join(" ") + " Z"} className="mlb-dia-fill"/>
      <circle cx={C[0]} cy={C[1]} r="3" className="mlb-dia-dot"/></svg>
    <MlbSlider label="Radius $r$" value={r} min={1} max={12} onChange={setR}/><MlbSlider label="Angle" value={t} min={1} max={360} onChange={setT} fmt={v => v + "°"}/>
    <MlbExOut><MlbMath text={"$\\theta = " + t + "^\\circ = " + mlbR(th, 3) + "$ rad, $\\frac{" + t + "}{360}$ of a turn. Arc $= r\\theta = " + mlbR(r * th) + "$; area $= \\frac{1}{2}r^2\\theta = " + mlbR(r * r * th / 2) + "$. At $360^\\circ$: $2\\pi r = " + mlbR(2 * Math.PI * r) + "$ and $\\pi r^2 = " + mlbR(Math.PI * r * r) + "$."}/></MlbExOut>
  </div>;
}
function MlbExLine() {
  const [m, setM] = React.useState(2), [c, setC] = React.useState(-1), [p, setP] = React.useState(false), R = 6;
  return <div className="mlb-ex">
    <MlbPlot R={R} label={"The line y = " + m + "x + " + c}>{(X, Y) => <React.Fragment>
      <path d={mlbCurve(x => m * x + c, R, X, Y)} className="mlb-dia-line"/>
      {p && m !== 0 ? <path d={mlbCurve(x => -x / m + c, R, X, Y)} className="mlb-dia-line is-b"/> : null}
      <path d={"M" + X(0) + " " + Y(c) + " L" + X(1) + " " + Y(c) + " L" + X(1) + " " + Y(m + c)} className="mlb-dia-ang"/>
      <circle cx={X(0)} cy={Y(c)} r="5" className="mlb-dia-arrow"/>
    </React.Fragment>}</MlbPlot>
    <MlbSlider label="Gradient $m$" value={m} min={-4} max={4} step={0.5} onChange={setM}/><MlbSlider label="Intercept $c$" value={c} min={-5} max={5} onChange={setC}/>
    <button type="button" className="stt-btn" aria-pressed={p} onClick={() => setP(!p)}>Show the perpendicular</button>
    <MlbExOut><MlbMath text={"$y = " + mlbR(m) + "x " + mlbSign(c) + "$: one step right, " + (m >= 0 ? mlbR(m) + " up" : mlbR(-m) + " down") + "; crosses the $y$-axis at $" + c + "$" + (m !== 0 ? " and the $x$-axis at $" + mlbR(-c / m) + "$" : "") + "." + (p && m !== 0 ? " Perpendicular gradient: $-\\frac{1}{" + mlbR(m) + "} = " + mlbR(-1 / m) + "$, and the product is $-1$." : "")}/></MlbExOut>
  </div>;
}
function MlbExQuad() {
  const [a, setA] = React.useState(1), [b, setB] = React.useState(-2), [c, setC] = React.useState(-3), R = 8;
  const D = b * b - 4 * a * c, h = a ? -b / (2 * a) : 0, k = a ? c - b * b / (4 * a) : c, roots = a && D >= 0 ? [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)] : [];
  return <div className="mlb-ex">
    <MlbPlot R={R} label={"The curve y = " + a + "x² + " + b + "x + " + c}>{(X, Y) => <React.Fragment>
      <path d={mlbCurve(x => a * x * x + b * x + c, R, X, Y)} className="mlb-dia-line"/>
      {a ? <line x1={X(h)} y1="0" x2={X(h)} y2="300" className="mlb-dia-sym"/> : null}
      {a ? <circle cx={X(h)} cy={Y(k)} r="5" className="mlb-dia-arrow"/> : null}
      {roots.map((x, i) => <circle key={i} cx={X(x)} cy={Y(0)} r="5" className="mlb-dia-dot"/>)}
    </React.Fragment>}</MlbPlot>
    <MlbSlider label="$a$" value={a} min={-3} max={3} step={0.5} onChange={setA}/><MlbSlider label="$b$" value={b} min={-6} max={6} onChange={setB}/><MlbSlider label="$c$" value={c} min={-6} max={6} onChange={setC}/>
    <MlbExOut>{a === 0 ? <MlbMath text="With $a = 0$ it is a straight line, not a quadratic."/> : <MlbMath text={"Discriminant $b^2 - 4ac = " + mlbR(D) + "$: " + (D > 0 ? "positive, so two roots, $x = " + mlbR(roots[0]) + "$ and $" + mlbR(roots[1]) + "$" : D === 0 ? "zero, so one repeated root, $x = " + mlbR(h) + "$ — the vertex touches the axis" : "negative, so no real roots — the curve never meets the $x$-axis") + ". Vertex $(" + mlbR(h) + ", " + mlbR(k) + ")$, a " + (a > 0 ? "minimum" : "maximum") + "; axis of symmetry $x = " + mlbR(h) + "$." + (roots.length ? " Sum of roots $" + mlbR(roots[0] + roots[1]) + " = -\\frac{b}{a}$, product $" + mlbR(roots[0] * roots[1]) + " = \\frac{c}{a}$." : "")}/>}</MlbExOut>
  </div>;
}
function MlbExUnit() {
  const [t, setT] = React.useState(140), th = t * Math.PI / 180, R0 = 110, C = [150, 140], s = Math.sin(th), co = Math.cos(th);
  const P = [C[0] + R0 * co, C[1] - R0 * s], q = t % 360 === 0 || t % 90 === 0 ? 0 : Math.floor((t % 360) / 90) + 1;
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 300 280" role="img" aria-label={"The unit circle at " + t + " degrees"}>
      <circle cx={C[0]} cy={C[1]} r={R0} className="mlb-dia-box"/>
      <line x1="20" y1={C[1]} x2="280" y2={C[1]} className="mlb-dia-axis"/><line x1={C[0]} y1="15" x2={C[0]} y2="265" className="mlb-dia-axis"/>
      {["S", "A", "T", "C"].map((l, i) => <text key={l} x={C[0] + (i === 0 || i === 2 ? -1 : 1) * 70} y={C[1] + (i < 2 ? -1 : 1) * 70 + 5} textAnchor="middle" className={"mlb-dia-quad" + (q === [2, 1, 3, 4][i] ? " is-on" : "")}>{l}</text>)}
      <line x1={C[0]} y1={C[1]} x2={P[0]} y2={P[1]} className="mlb-dia-edge"/>
      <line x1={P[0]} y1={P[1]} x2={P[0]} y2={C[1]} className="mlb-dia-line is-b"/><line x1={C[0]} y1={C[1]} x2={P[0]} y2={C[1]} className="mlb-dia-line"/>
      <circle cx={P[0]} cy={P[1]} r="6" className="mlb-dia-arrow"/></svg>
    <MlbSlider label={"Angle $\\theta$"} value={t} min={0} max={360} onChange={setT} fmt={v => v + "°"}/>
    <MlbExOut><MlbMath text={"$\\cos " + t + "^\\circ = " + mlbR(co, 3) + "$ (blue, across), $\\sin " + t + "^\\circ = " + mlbR(s, 3) + "$ (orange, up)" + (Math.abs(co) > 1e-9 ? ", $\\tan = " + mlbR(s / co, 3) + "$" : ", $\\tan$ undefined") + ". " + (q ? "Quadrant " + q + ": " + ["", "all positive", "only sin positive", "only tan positive", "only cos positive"][q] + ". " : "On an axis. ") + "And always $\\sin^2 + \\cos^2 = " + mlbR(s * s + co * co, 3) + "$."}/></MlbExOut>
  </div>;
}
function MlbExChord() {
  const [x0, setX] = React.useState(1), [h, setH] = React.useState(2), R = 4, f = x => x * x, g = (f(x0 + h) - f(x0)) / h;
  return <div className="mlb-ex">
    <MlbPlot R={R} label={"A chord of y = x squared from " + x0 + " with h = " + h}>{(X, Y) => <React.Fragment>
      <path d={mlbCurve(f, R, X, Y)} className="mlb-dia-line"/>
      <path d={mlbCurve(x => 2 * x0 * (x - x0) + f(x0), R, X, Y)} className="mlb-dia-sym"/>
      <path d={mlbCurve(x => g * (x - x0) + f(x0), R, X, Y)} className="mlb-dia-line is-b"/>
      <circle cx={X(x0)} cy={Y(f(x0))} r="5" className="mlb-dia-dot"/><circle cx={X(x0 + h)} cy={Y(f(x0 + h))} r="5" className="mlb-dia-arrow"/>
    </React.Fragment>}</MlbPlot>
    <MlbSlider label="Point $x$" value={x0} min={-2} max={2} step={0.5} onChange={setX}/>
    <MlbSlider label="Gap $h$" value={h} min={0.01} max={2} step={0.01} onChange={setH}/>
    <MlbExOut><MlbMath text={"Chord gradient $= \\frac{(x + h)^2 - x^2}{h} = 2x + h = " + mlbR(g, 3) + "$. Make $h$ tiny: the orange line turns into the dashed line that just touches the curve, and its gradient gets closer and closer to $2x = " + mlbR(2 * x0) + "$. That limit IS the derivative."}/></MlbExOut>
  </div>;
}
function MlbExRiemann() {
  const [n, setN] = React.useState(4), [b, setB] = React.useState(3), f = x => x * x, w = b / n;
  let sum = 0; for (let i = 0; i < n; i++) sum += f((i + 0.5) * w) * w;
  const exact = b * b * b / 3, R = 10;
  return <div className="mlb-ex">
    <MlbPlot R={R} label={n + " strips under y = x squared from 0 to " + b}>{(X, Y) => <React.Fragment>
      {Array.from({ length: n }, (_, i) => <rect key={i} x={X(i * w)} y={Y(f((i + 0.5) * w))} width={X((i + 1) * w) - X(i * w)} height={Y(0) - Y(f((i + 0.5) * w))} className="mlb-dia-strip"/>)}
      <path d={mlbCurve(f, R, X, Y)} className="mlb-dia-line"/>
    </React.Fragment>}</MlbPlot>
    <MlbSlider label="Strips" value={n} min={1} max={60} onChange={setN}/><MlbSlider label="Up to $x = b$" value={b} min={1} max={3} step={0.5} onChange={setB}/>
    <MlbExOut><MlbMath text={"$" + n + "$ strips give $" + mlbR(sum, 4) + "$. The exact area is $\\int_0^{" + b + "} x^2\\,dx = \\frac{" + mlbR(b, 1) + "^3}{3} = " + mlbR(exact, 4) + "$. Error: $" + mlbR(Math.abs(exact - sum), 4) + "$ — more, thinner strips close the gap."}/></MlbExOut>
  </div>;
}
function MlbExChance() {
  const [counts, setCounts] = React.useState([0, 0, 0, 0, 0, 0]), total = counts.reduce((a, b) => a + b, 0);
  const roll = k => setCounts(c => { const n = c.slice(); for (let i = 0; i < k; i++) n[Math.floor(Math.random() * 6)]++; return n; });
  const max = Math.max(1, ...counts.map(x => x / Math.max(1, total)), 1 / 6 * 1.5);
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 170" role="img" aria-label={"Relative frequency of each face after " + total + " rolls"}>
      <line x1="20" y1={140 - 120 * (1 / 6) / max} x2="310" y2={140 - 120 * (1 / 6) / max} className="mlb-dia-sym"/>
      {counts.map((c, i) => { const f = total ? c / total : 0, hh = 120 * f / max; return <g key={i}><rect x={30 + i * 46} y={140 - hh} width="34" height={hh} className="mlb-dia-fill"/>
        <text x={47 + i * 46} y="158" textAnchor="middle" className="mlb-dia-t">{i + 1}</text></g>; })}</svg>
    <div className="mlb-actions">{[1, 10, 100, 1000].map(k => <button key={k} type="button" className="stt-btn" onClick={() => roll(k)}>Roll {k}</button>)}
      <button type="button" className="mlb-link" onClick={() => setCounts([0, 0, 0, 0, 0, 0])}>Start again</button></div>
    <MlbExOut><MlbMath text={total ? total + " rolls. Each face came up " + counts.map(c => mlbR(c / total * 100, 1) + "%").join(", ") + ". The dashed line is $\\frac{1}{6} \\approx 16.7\\%$. With a few rolls the bars jump about. With lots of rolls they settle on it." : "Roll the die. Will each face really come up a sixth of the time?"}/></MlbExOut>
  </div>;
}
function MlbExSeries() {
  const [a, setA] = React.useState(8), [r, setR] = React.useState(0.5), [n, setN] = React.useState(8);
  const terms = Array.from({ length: n }, (_, i) => a * Math.pow(r, i)), partial = terms.reduce((x, y) => x + y, 0), lim = Math.abs(r) < 1 ? a / (1 - r) : null;
  const top = Math.max(Math.abs(lim || 0), ...terms.map((_, i) => Math.abs(terms.slice(0, i + 1).reduce((x, y) => x + y, 0))), 1);
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 170" role="img" aria-label={"Running totals of the first " + n + " terms"}>
      <line x1="10" y1="85" x2="310" y2="85" className="mlb-dia-axis"/>
      {lim !== null ? <line x1="10" y1={85 - 75 * lim / top} x2="310" y2={85 - 75 * lim / top} className="mlb-dia-sym"/> : null}
      {terms.map((_, i) => { const S = terms.slice(0, i + 1).reduce((x, y) => x + y, 0), hh = 75 * S / top, w = 290 / n; return <rect key={i} x={14 + i * w} y={hh >= 0 ? 85 - hh : 85} width={w * 0.7} height={Math.abs(hh)} className="mlb-dia-fill"/>; })}</svg>
    <MlbSlider label="First term $a$" value={a} min={1} max={10} onChange={setA}/><MlbSlider label="Ratio $r$" value={r} min={-1.5} max={1.5} step={0.1} onChange={setR} fmt={v => mlbR(v, 1)}/><MlbSlider label="Terms $n$" value={n} min={1} max={30} onChange={setN}/>
    <MlbExOut><MlbMath text={"$S_{" + n + "} = " + mlbR(partial, 4) + "$. " + (lim !== null ? "With $|r| < 1$ the totals close in on $\\frac{a}{1 - r} = " + mlbR(lim, 4) + "$ (dashed) but never pass it." : "With $|r| \\ge 1$ the terms do not shrink, so there is no sum to infinity.")}/></MlbExOut>
  </div>;
}
function MlbExGrowth() {
  const [P, setP] = React.useState(1000), [rate, setRate] = React.useState(10), [yrs, setYrs] = React.useState(10);
  const comp = Array.from({ length: yrs + 1 }, (_, t) => P * Math.pow(1 + rate / 100, t)), simp = Array.from({ length: yrs + 1 }, (_, t) => P * (1 + rate / 100 * t)), top = comp[yrs];
  const X = t => 20 + t * 280 / Math.max(yrs, 1), Y = v => 150 - 130 * v / top;
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 170" role="img" aria-label="Compound and simple growth over time">
      <line x1="20" y1="150" x2="310" y2="150" className="mlb-dia-axis"/>
      <polyline points={simp.map((v, t) => X(t) + "," + Y(v)).join(" ")} className="mlb-dia-line is-b"/>
      <polyline points={comp.map((v, t) => X(t) + "," + Y(v)).join(" ")} className="mlb-dia-line"/></svg>
    <MlbSlider label="Start (₦)" value={P} min={100} max={10000} step={100} onChange={setP}/><MlbSlider label="Rate" value={rate} min={1} max={30} onChange={setRate} fmt={v => v + "%"}/><MlbSlider label="Years" value={yrs} min={1} max={40} onChange={setYrs}/>
    <MlbExOut><MlbMath text={"Compound (blue): $" + P + " \\times " + mlbR(1 + rate / 100, 2) + "^{" + yrs + "} \\approx ₦" + mlbComma(comp[yrs]) + "$. Simple (orange): ₦" + mlbComma(simp[yrs]) + ". Compound interest earns interest on the interest too, so it multiplies again every year. That is why it pulls away."}/></MlbExOut>
  </div>;
}

/* A logarithm undoes a power (owner, 5 Nov 2026: "there's no logarithm"): choose a base and a power,
   see the number it makes, and the same fact read backwards on the curve y = log_b x. */
function MlbExLog() {
  const [b, setB] = React.useState(2), [y, setY] = React.useState(3);
  const x = Math.pow(b, y), xmax = Math.max(8, Math.pow(b, 3.2)), ymin = -3, ymax = 3.2;
  const X = v => 24 + v * 286 / xmax, Y = v => 150 - (v - ymin) * 140 / (ymax - ymin);
  const pts = []; for (let i = 1; i <= 120; i++) { const v = xmax * i / 120; const lv = Math.log(v) / Math.log(b); if (lv >= ymin && lv <= ymax) pts.push(X(v) + "," + Y(lv)); }
  const inView = x <= xmax && y >= ymin && y <= ymax;
  return <div className="mlb-ex">
    <svg className="mlb-dia" viewBox="0 0 320 170" role="img" aria-label={"The curve y equals log base " + b + " of x, with the point x equals " + mlbR(x, 3) + ", y equals " + y}>
      <line x1="24" y1={Y(0)} x2="312" y2={Y(0)} className="mlb-dia-axis"/><line x1="24" y1="8" x2="24" y2="160" className="mlb-dia-axis"/>
      <polyline points={pts.join(" ")} className="mlb-dia-line"/>
      <circle cx={X(1)} cy={Y(0)} r="3.5" className="mlb-dia-dot"/>
      {inView ? <circle cx={X(x)} cy={Y(y)} r="5" className="mlb-dia-arrow"/> : null}</svg>
    <MlbSlider label="Base $b$" value={b} min={2} max={10} onChange={setB}/><MlbSlider label="Power $y$" value={y} min={-3} max={3} step={0.5} onChange={setY}/>
    <MlbExOut><MlbMath text={"$" + b + "^{" + y + "} = " + mlbR(x, 4) + "$, so $\\log_{" + b + "} " + mlbR(x, 4) + " = " + y + "$. The logarithm asks the question backwards: what power of " + b + " gives this number? Every curve passes through $(1, 0)$, because $" + b + "^0 = 1$, and only positive numbers have a logarithm."}/></MlbExOut>
  </div>;
}

/* ── Certificates seen on this device: the "new" marker ──
   A certificate stays "new" (a dot on the tab, a banner on Home) until it has
   been opened from the Certificates tab or the banner. */
const MLB_SEEN_KEY = "ngg.mlb.certsSeen";
function mlbSeen() { try { return JSON.parse(localStorage.getItem(MLB_SEEN_KEY) || "[]"); } catch (_) { return []; } }
function mlbMarkSeen(nos) {
  try { const s = mlbSeen(); nos.forEach(n => { if (s.indexOf(n) < 0) s.push(n); }); localStorage.setItem(MLB_SEEN_KEY, JSON.stringify(s.slice(-200))); } catch (_) {}
  try { window.dispatchEvent(new CustomEvent("mlb:certs-seen")); } catch (_) {}
}
function useMlbNewCerts() {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    const count = () => NGGApi.member.mathslab.home().then(d => { if (live) { const seen = mlbSeen(); setN((d.certificates || []).filter(c => seen.indexOf(c.no) < 0).length); } }, () => {});
    count();
    window.addEventListener("mlb:certs-seen", count); window.addEventListener("mlb:certs-new", count);
    return () => { live = false; window.removeEventListener("mlb:certs-seen", count); window.removeEventListener("mlb:certs-new", count); };
  }, []);
  return n;
}

/* ── Which Lab, and where we are inside it ──
   The Lab is the address: /study/lab is Maths (the first Lab's address, kept for every old link),
   /study/physics is Physics (NGG_LABS in tools-core.jsx, the client half of domain/labs.php). */
function mlbLab() {
  const seg = (location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  return (seg[0] === "study" && NGG_LABS.find(l => l.seg === seg[1])) || NGG_LABS[0];
}
function mlbRoute() {
  const seg = (location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  if (seg[0] !== "study" || !NGG_LABS.some(l => l.seg === seg[1])) return { v: "home" };
  if (seg[2] === "learn" && /^[A-Z]{2}-\d{3}$/.test(seg[3] || "")) return { v: "learn", comp: seg[3] };
  if (seg[2] === "guide" && /^\d{1,2}$/.test(seg[3] || "")) return { v: "guide", stage: Number(seg[3]) };   // any Lab's topic id (domain/labs.php); the server says whether it exists
  if (seg[2] === "exams" && !mlbLab().exams) return { v: "home" };   // a Lab without papers has no papers screen
  if (["map", "courses", "progress", "certificates", "daily", "exams"].indexOf(seg[2]) >= 0) return { v: seg[2] };
  return { v: "home" };
}
function mlbPath(r) { return "/study/" + mlbLab().seg + (r.v === "home" ? "" : r.v === "learn" ? "/learn/" + r.comp : r.v === "guide" ? "/guide/" + r.stage : "/" + r.v); }

/* Each Lab view's head, kept in step as the learner moves around (the server set it for the first
   load: domain/lab-seo.php, same wording). A topic's title arrives with the topic, so MlbLearn calls
   this again once it has it. Member-only screens are noindex. */
function mlbSeo(r, topicTitle) {
  try {
    const lab = mlbLab(), base = "https://next.afrovanguard.org.ng/study/" + lab.seg;
    const pick = r.v === "learn" ? [(topicTitle || "Topic") + " — " + lab.subject + " practice with worked examples · NGG " + lab.title, base + "/learn/" + r.comp]
      : r.v === "guide" ? ["Stage " + r.stage + " guide · NGG " + lab.title, base + "/guide/" + r.stage]
      : r.v === "courses" ? [lab.title + " courses · NGG", base + "/courses"]
      : [lab.id === "maths" ? "Maths Lab — free maths practice from counting to calculus, with worked examples · NGG" : lab.title + " — free " + lab.subject.toLowerCase() + " practice " + (lab.pitch || "with worked examples") + " · NGG", base];
    document.title = pick[0];
    const can = document.querySelector('link[rel="canonical"]'); if (can) can.setAttribute("href", pick[1]);
    const ogu = document.querySelector('meta[property="og:url"]'); if (ogu) ogu.setAttribute("content", pick[1]);
    const ogt = document.querySelector('meta[property="og:title"]'); if (ogt) ogt.setAttribute("content", pick[0]);
    const rob = document.querySelector('meta[name="robots"]');
    if (rob) rob.setAttribute("content", ["progress", "certificates", "daily", "exams"].indexOf(r.v) >= 0 ? "noindex, follow" : "index, follow, max-image-preview:large");
  } catch (_) {}
}
function MathsLab({ me }) {
  const lab = mlbLab();
  const [route, setRoute] = React.useState(mlbRoute);
  React.useEffect(() => { mlbSeo(route); }, [route]); // eslint-disable-line
  const [play, setPlay] = React.useState(null);           // a running session
  const [lite, setLite] = React.useState(false);          // signed in but not an NGG member
  const newCerts = useMlbNewCerts();
  const go = React.useCallback(r => { setPlay(null); setRoute(r); try { history.pushState({ page: "study" }, "", mlbPath(r)); window.scrollTo(0, 0); } catch (_) {} }, []);
  React.useEffect(() => { const on = () => { setPlay(null); setRoute(mlbRoute()); }; window.addEventListener("popstate", on); return () => window.removeEventListener("popstate", on); }, []);
  if (me.phase === "loading") return <SttState kind="loading" text={"Opening the " + mlbLab().title + "…"}/>;
  if (!me.member || lite) return <MlbLite signedIn={!!me.member} route={route} go={go}/>;
  // Inside .mlb: every colour, border and button in the player reads the Lab's tokens (outside it, none resolved).
  if (play) return <div className={"mlb is-" + lab.id}><MlbPlayer key={(play.mode || "") + (play.n || 0)} start={play} onDone={() => { setPlay(null); }} go={go} onAgain={() => setPlay(p => Object.assign({}, p, { n: (p.n || 0) + 1 }))}
    onCheck={comp => setPlay(p => ({ mode: "check", comp, n: (p && p.n || 0) + 1 }))}
    onMini={() => setPlay(p => ({ mode: "mini", n: (p.n || 0) + 1 }))}/></div>;
  const nav = [["home", "Home", "ph-house"], ["map", "Map", "ph-path"], ["courses", "Courses", "ph-graduation-cap"], ["certificates", "Certificates", "ph-certificate"], ["progress", "Progress", "ph-chart-bar"]]
    .concat(lab.exams ? [["exams", "Exams", "ph-exam"]] : []);
  return (
    <div className={"mlb is-" + lab.id}><div className="mlb-shell">
      <div className="mlb-navwrap"><nav className="mlb-nav" aria-label={lab.title}>
        {nav.map(([v, l, ic]) => <button key={v} type="button" className={"mlb-navb" + (route.v === v || (v === "map" && route.v === "learn") ? " is-on" : "")} aria-current={route.v === v ? "page" : undefined}
          aria-label={v === "certificates" && newCerts ? l + ", " + newCerts + " new" : undefined} onClick={() => go({ v })}>
          <i className={"ph-fill " + ic} aria-hidden="true"/><span>{l}</span>{v === "certificates" && newCerts ? <em className="mlb-navdot" aria-hidden="true">{newCerts}</em> : null}</button>)}
      </nav></div>
      <div className="mlb-main">
        {route.v === "map" ? <MlbMap go={go}/>
          : route.v === "learn" ? <MlbLearn comp={route.comp} go={go} startPlay={setPlay}/>
          : route.v === "courses" ? <MlbCourses go={go}/>
          : route.v === "progress" ? <MlbProgress go={go}/>
          : route.v === "certificates" ? <MlbCerts go={go}/>
          : route.v === "daily" ? <MlbDaily go={go}/>
          : route.v === "exams" ? <MlbExams go={go} startPlay={setPlay}/>
          : route.v === "guide" ? <MlbGuide stage={route.stage} go={go}/>
          : <MlbHome go={go} startPlay={setPlay} onNotMember={() => setLite(true)}/>}
      </div>
    </div></div>
  );
}

/* ── Loading/error helper ── */
function useMlb(fn, deps) {
  const [st, setSt] = React.useState({ phase: "loading" });
  const load = React.useCallback(() => { setSt({ phase: "loading" }); fn().then(d => setSt({ phase: "ok", d }), e => setSt({ phase: "error", e })); }, deps); // eslint-disable-line
  React.useEffect(() => { load(); }, [load]);
  return [st, load];
}

/* ── Home ── */
/* Home, in the order a learner needs it: where am I → what do I do next (one card, one button)
   → how am I doing → everything else. Before, the greeting, three numbers, a level bar and the
   button shared one box, and a paragraph and a long badge list sat at the same weight below it. */
function MlbHome({ go, startPlay, onNotMember }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.home(), []);
  React.useEffect(() => { if (st.phase === "error" && st.e && (st.e.code || st.e.message) === "members_only") onNotMember(); }, [st]); // eslint-disable-line
  if (st.phase === "loading") return <SttState kind="loading" text={"Getting your " + mlbLab().title + " ready…"}/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t open the " + mlbLab().title + ". " + mlbErr(st.e)} retry={load}/>;
  const d = st.d, lv = d.level, nx = d.next, f = d.focus || { stage: d.climb.stage, title: "", known: 0, total: 10 };
  const pct = lv.next ? Math.round((d.xp - lv.from) / (lv.next - lv.from) * 100) : 100;
  const begin = () => {
    if (nx.mode === "climb") startPlay({ mode: "climb" });
    else if (nx.mode === "review") startPlay({ mode: "review" });
    else if (nx.mode === "check" || nx.mode === "practice") go({ v: "learn", comp: nx.comp });
  };
  const badges = d.badges.slice().sort((a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0)), earned = badges.filter(b => b.earned).length;
  return (
    <div className="mlb-stack mlb-home">
      <header className="mlb-homehead">
        <h2 id="mlb-hi" className="mlb-h2">Hello, {d.name}.</h2>
        <p className="mlb-p">You are in <b>Stage {f.stage}{f.title ? " · " + f.title : ""}</b>{f.band ? " (" + f.band + ")" : ""}.</p>
      </header>

      {(() => {
        /* A certificate earned and not yet opened: said first, with the way to it.
           Children passed a stage and could not find what they had earned. */
        const seen = mlbSeen(), fresh = (d.certificates || []).filter(c => seen.indexOf(c.no) < 0);
        if (!fresh.length) return null;
        const c = fresh[0];
        return <section className="mlb-certban" aria-labelledby="mlb-certban-h">
          <i className="ph-fill ph-certificate" aria-hidden="true"/>
          <div><p className="mlb-eyebrow">{fresh.length > 1 ? fresh.length + " new certificates" : "New certificate"}</p>
            <h3 id="mlb-certban-h" className="mlb-h3">{c.title}</h3>
            <p className="mlb-meta">{c.no} · kept in Certificates here, and in your family’s Documents.</p></div>
          <div className="mlb-certban-acts">
            <a className="mlb-go" href={c.url} target="_blank" rel="noopener" onClick={() => mlbMarkSeen([c.no])}><i className="ph ph-arrow-square-out" aria-hidden="true"/>Open my certificate</a>
            <button type="button" className="stt-btn" onClick={() => go({ v: "certificates" })}>All certificates</button>
          </div>
        </section>;
      })()}

      <section className="mlb-hero mlb-next" aria-labelledby="mlb-next-h">
        <p className="mlb-eyebrow">Up next · {nx.kind || "Next step"}</p>
        <h3 id="mlb-next-h" className="mlb-next-t">{nx.title || nx.label}</h3>
        {nx.what ? <p className="mlb-p">{nx.what}</p> : null}
        {nx.mode !== "none" ? <button type="button" className="mlb-go" onClick={begin} aria-describedby="mlb-next-h"><i className="ph ph-play-circle" aria-hidden="true"/>{{ climb: "Start the gate", review: "Start the review", check: "Take the check" }[nx.mode] || (nx.kind === "New topic" ? "Start learning" : "Continue")}</button> : null}
      </section>

      {d.daily ? <section className={"mlb-dailycard" + (d.daily.solved ? " is-solved" : "")} aria-labelledby="mlb-daily-h">
        <span className="mlb-dailycard-i" aria-hidden="true"><i className="ph-fill ph-crown"/></span>
        <div><p className="mlb-eyebrow">{mlbLab().daily}{d.daily.dailyStreak ? " · " + d.daily.dailyStreak + " day" + (d.daily.dailyStreak === 1 ? "" : "s") + " in a row" : ""}</p>
          <h3 id="mlb-daily-h" className="mlb-h3">{d.daily.solved ? "Solved today — well done." : d.daily.done ? "Today’s problem is over: see how it goes." : "Today: " + d.daily.compTitle}</h3>
          <p className="mlb-meta">{d.daily.solved || d.daily.done ? "A new problem arrives tomorrow." : mlbLab().dailyP}</p></div>
        <button type="button" className={d.daily.done ? "stt-btn" : "mlb-go"} onClick={() => go({ v: "daily" })}>{d.daily.done ? "See the solution" : d.daily.tries ? "Keep going" : "Try it"}</button>
      </section> : null}

      {d.mini && d.mini.ready ? <section className="mlb-excard is-mini" aria-labelledby="mlb-minicard-h">
        <span className="mlb-dailycard-i is-mini" aria-hidden="true"><i className="ph-fill ph-barbell"/></span>
        <div><p className="mlb-eyebrow">Mini review · {d.mini.answered} answers today</p><h3 id="mlb-minicard-h" className="mlb-h3">Lock in what you learned earlier</h3>
          <p className="mlb-meta">{d.mini.topics} quick questions from your recent mistakes and the topics you practised longest ago.</p></div>
        <button type="button" className="mlb-go" onClick={() => startPlay({ mode: "mini" })}>Start</button>
      </section> : null}

      <section className="mlb-excard" aria-labelledby="mlb-excard-h">
        <span className="mlb-dailycard-i is-exam" aria-hidden="true"><i className="ph-fill ph-exam"/></span>
        <div><p className="mlb-eyebrow">Exam practice</p><h3 id="mlb-excard-h" className="mlb-h3">Timed practice papers</h3>
          <p className="mlb-meta">Timed like the real thing, new every time, marked by area so you know what to work on.</p></div>
        <button type="button" className="stt-btn" onClick={() => go({ v: "exams" })}>See the papers</button>
      </section>

      <section className="mlb-card mlb-progcard" aria-labelledby="mlb-prog-h">
        <div className="mlb-row"><h3 id="mlb-prog-h" className="mlb-h3">Your progress</h3><button type="button" className="mlb-link" onClick={() => go({ v: "progress" })}>See all progress</button></div>
        <div className="mlb-hero-stats">
          <div className="mlb-stat"><i className="ph ph-star-four" aria-hidden="true"/><b>{d.counts.mastered}</b><span>of {d.counts.total} topics known</span></div>
          <div className="mlb-stat"><i className="ph ph-fire" aria-hidden="true"/><b>{d.streak}</b><span>day streak{d.freezes ? " · " + d.freezes + " freeze" + (d.freezes > 1 ? "s" : "") : ""}</span></div>
          <div className="mlb-stat"><i className="ph ph-medal" aria-hidden="true"/><b>{lv.name}</b><span>{d.xp} XP{lv.next ? " · " + (lv.next - d.xp) + " to the next level" : ""}</span></div>
        </div>
        <div className="mlb-progrow"><span>Level</span><span className="mlb-xpbar" role="progressbar" aria-label="Progress to the next level" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: pct + "%" }}/></span><b>{pct}%</b></div>
        <div className="mlb-progrow"><span>Stage {f.stage}</span><span className="mlb-meter is-big" role="progressbar" aria-label={"Stage " + f.stage + " topics known"} aria-valuenow={f.known} aria-valuemin="0" aria-valuemax={f.total}><span style={{ width: Math.round(f.known / Math.max(f.total, 1) * 100) + "%" }}/></span><b>{f.known}/{f.total}</b></div>
        <button type="button" className="stt-btn" onClick={() => go({ v: "map" })}><i className="ph ph-path" aria-hidden="true"/>Open the map</button>
      </section>

      <div className="mlb-cols"><div className="mlb-col">
      {d.roots && d.roots.length ? <section className="mlb-card" aria-labelledby="mlb-hroot"><h3 id="mlb-hroot" className="mlb-h3">Fix the foundation first</h3>
        <p className="mlb-p">What you are finding hard rests on something underneath it. Start there.</p>
        <ul className="mlb-roots">{d.roots.map(x => <li key={x.comp}><div><b>{x.title}</b><small>Underneath {x.behind.slice(0, 2).join(", ")}</small></div>
          <button type="button" className="stt-btn is-go" onClick={() => go({ v: "learn", comp: x.comp })}>Start here</button></li>)}</ul></section> : null}
      <section className="mlb-card"><div className="mlb-row"><h3 className="mlb-h3">Your courses</h3><button type="button" className="mlb-link" onClick={() => go({ v: "courses" })}>All courses</button></div>
        <ul className="mlb-mini">{d.courses.filter(c => c.enrolled || c.available).slice(0, 3).map(c => <li key={c.id}><span>{c.title}</span><span className="mlb-meter"><span style={{ width: c.pct + "%" }}/></span><b>{c.pct}%</b></li>)}</ul></section>
      <details className="mlb-card mlb-fold"><summary className="mlb-h3">How placement works</summary>
        <p className="mlb-p">One short test, at most 15 questions. It starts near where learners your age usually are and moves up when you get questions right and down when you don’t, until it finds your level. Nothing is timed and nothing is marked while it runs. Everything below your level counts as known, and your reviews check it in a few days.</p>
        {d.climb.done ? <p className="mlb-meta">Placed wrong? <button type="button" className="mlb-link" onClick={async () => {
          /* The site's own dialog (safety.jsx), not the browser's: the native pop-up can be silenced by the
             browser, looks like a scam pop-up on a phone, and cannot say plainly what is kept. */
          if (!(await dialog.confirm({ title: "Redo placement?", body: "It takes at most 15 questions. Anything you have practised or mastered stays yours.", cta: "Redo placement" }))) return;
          const redo = () => NGGApi.member.mathslab.replace().then(() => load(), async e => {
            if (await dialog.confirm({ title: "Placement did not restart", body: mlbErr(e), cta: "Try again", cancel: "Close" })) redo(); });
          redo(); }}>Redo placement</button> (once a week).</p> : null}</details>
      </div><aside className="mlb-col is-side" aria-label="Badges">
      <section className="mlb-card"><div className="mlb-row"><h3 className="mlb-h3">Badges</h3><span className="mlb-meta">{earned} of {badges.length}</span></div>
        <ul className="mlb-badges">{badges.slice(0, 4).map(b => <li key={b.id} className={b.earned ? "is-on" : ""}><i className={"ph " + (b.earned ? "ph-seal-check" : "ph-seal")} aria-hidden="true"/><b>{b.name}</b><span>{b.what}</span></li>)}</ul>
        {badges.length > 4 ? <button type="button" className="mlb-link" onClick={() => go({ v: "progress" })}>All {badges.length} badges</button> : null}</section>
      </aside></div>
    </div>
  );
}

/* ── The constellation map ── */
function MlbStars({ stage, onPick, decorative }) {
  const pts = stage.comps.map((c, i) => [24 + i * 30, 44 + Math.sin(i * 1.3 + stage.n) * 22]);
  /* Decorative where the topic list beside it is the way in: one route for the keyboard, not two. */
  if (decorative) return (
    <svg className="mlb-stars" viewBox="0 0 320 90" aria-hidden="true" focusable="false">
      <polyline points={pts.map(p => p.join(",")).join(" ")} className="mlb-stars-line"/>
      {stage.comps.map((c, i) => { const on = MLB_GOOD_V.indexOf(c.state) >= 0, mid = ["learning", "practising", "ready", "review"].indexOf(c.state) >= 0;
        return <g key={c.id} className={"mlb-star is-" + c.state}><circle cx={pts[i][0]} cy={pts[i][1]} r={on ? 9 : mid ? 7 : 5}/>{c.state === "longterm" || c.state === "secure" ? <circle cx={pts[i][0]} cy={pts[i][1]} r="13" className="mlb-star-halo"/> : null}</g>; })}
    </svg>);
  return (
    <svg className="mlb-stars" viewBox="0 0 320 90" role="list" aria-label={"Stage " + stage.n + " topics"}>
      <polyline points={pts.map(p => p.join(",")).join(" ")} className="mlb-stars-line"/>
      {stage.comps.map((c, i) => {
        const on = MLB_GOOD_V.indexOf(c.state) >= 0, mid = ["learning", "practising", "ready", "review"].indexOf(c.state) >= 0;
        return <g key={c.id} role="listitem" tabIndex={c.state === "soon" ? -1 : 0} className={"mlb-star is-" + c.state} aria-label={c.title + ": " + (MLB_STATE_L[c.state] || c.state)}
          onClick={() => c.state !== "soon" && onPick(c)} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && c.state !== "soon") { e.preventDefault(); onPick(c); } }}>
          <circle cx={pts[i][0]} cy={pts[i][1]} r={on ? 9 : mid ? 7 : 5}/>{c.state === "longterm" || c.state === "secure" ? <circle cx={pts[i][0]} cy={pts[i][1]} r="13" className="mlb-star-halo"/> : null}
          <title>{c.title}</title></g>;
      })}
    </svg>
  );
}
/* The map, Duolingo's way: each stage is a unit with a coloured banner, its ten topics a
   winding path of round lesson buttons (done, the one to do now, open, locked), and the
   stage boss at the end. Pressing a lesson opens a small card with its name and a Start
   button — so a name is one press away, never hidden in a tooltip. Escape closes it. */
const MLB_PATH_X = [0, 44, 72, 44, 0, -44, -72, -44, 0, 44];
/* Topic search: every word typed must match the start of a word in the topic's title (or, failing that, its stage's title)
   ("log" finds Logarithms, "frac" finds fractions). A few everyday words map to the Lab's own. */
const MLB_SYNONYMS = { logs: "log", logarithm: "log", ln: "log", sums: "series", gradient: "gradient", differentiation: "differentiat", integration: "integrat", calculus: "differentiat",
  percent: "percentage", stats: "statistic", trig: "trigonometr", sine: "sine", graphs: "graph", powers: "power", indices: "indic", surd: "surd", prob: "probabilit" };
function mlbFindTopics(stages, q) {
  const words = q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map(w => MLB_SYNONYMS[w] || (w.length > 4 && /s$/.test(w) ? w.slice(0, -1) : w));
  if (!words.length) return [];
  const out = [];
  stages.forEach(s => s.comps.forEach(c => {
    const hay = (c.title + " " + s.title).toLowerCase().split(/[^a-z0-9]+/);
    if (words.every(w => hay.some(h => h.indexOf(w) === 0))) out.push(Object.assign({ stage: s.n, stageTitle: s.title, inTitle: words.every(w => c.title.toLowerCase().split(/[^a-z0-9]+/).some(h => h.indexOf(w) === 0)) }, c));
  }));
  // A topic's own title decides; a stage's title only when no topic title matches ("log" would
  // otherwise bring in all of "…Mathematical Logic").
  const own = out.filter(x => x.inTitle);
  return own.length ? own : out;
}
/* The chest halfway along each stage (Duolingo's treasure chest): bonus XP once five of its ten
   topics are known. Opened once; the server refuses a second opening. */
const MLB_CHEST_INDEX = 4;
function MlbChestNode({ s, lite, fx, onOpen }) {
  const [busy, setBusy] = React.useState(false), [err, setErr] = React.useState("");
  const ch = s.chest || {}, just = fx && fx.stage === s.n;
  const open = () => { if (busy) return; setBusy(true); setErr(""); NGGApi.member.mathslab.chest(s.n).then(r => { setBusy(false); onOpen(r.xp); }, e => { setBusy(false); setErr(mlbErr(e)); }); };
  return <li className="mlb-node-li is-chest" style={{ "--dx": "44px" }}>
    {ch.opened ? <span className="mlb-chest is-open" role="img" aria-label="Chest opened"><i className="ph-fill ph-package" aria-hidden="true"/></span>
      : ch.ready && !lite ? <button type="button" className="mlb-chest is-ready" onClick={open} disabled={busy} aria-label={"Open the Stage " + s.n + " chest for bonus XP"}><i className="ph-fill ph-treasure-chest" aria-hidden="true"/></button>
      : <span className="mlb-chest" role="img" aria-label="Chest: opens when five topics of this stage are known"><i className="ph-fill ph-treasure-chest" aria-hidden="true"/></span>}
    <span className="mlb-node-lab is-l" aria-hidden="true">{just ? "+" + fx.xp + " XP!" : ch.opened ? "Opened" : ch.ready ? "Open me!" : <React.Fragment>Chest<small>at 5 topics</small></React.Fragment>}</span>
    {err ? <span className="mlb-err" role="alert">{err}</span> : null}
    {just ? <span className="mlb-sr" role="status">Chest opened: {fx.xp} bonus XP.</span> : null}
  </li>;
}
function MlbMap({ go, lite }) {
  const [st, load] = useMlb(() => lite ? NGGApi.public.mathslabMap() : NGGApi.member.mathslab.map(), [lite]);
  const [startBoss, setBoss] = React.useState(null);
  const [pop, setPop] = React.useState(null);
  const [openStage, setOpenStage] = React.useState(null);   // null = the focus stage (owner: only it is open)
  const [scrollTo, setScrollTo] = React.useState(0);
  const [q, setQ] = React.useState("");
  /* Duolingo's path (owner, 5 Nov 2026, with screenshots): the open stage's own banner stays at the
     top while you scroll its path and opens its Guidebook; a button brings you back to your lesson. */
  const [nowOff, setNowOff] = React.useState(0);     // 0: your topic is on screen; 1: it is below; -1: above
  const [chestFx, setChestFx] = React.useState(null);
  /* After a stage opens (or the focus stage comes back), bring its header into view: closing the
     stage above it shifts everything up, and the learner lost their place. */
  React.useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById("mlb-unit-" + scrollTo);
    if (el) { try { el.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (_) { el.scrollIntoView(); } const b = el.querySelector(".mlb-unit-tog"); if (b) b.focus({ preventScroll: true }); }
    setScrollTo(0);
  }, [scrollTo]);
  React.useEffect(() => {
    if (!pop) return undefined;
    const k = e => { if (e.key === "Escape") { const b = document.getElementById("mlb-node-" + pop); setPop(null); if (b) b.focus(); } };
    const c = e => { if (!e.target.closest(".mlb-node-li")) setPop(null); };
    document.addEventListener("keydown", k); document.addEventListener("click", c);
    return () => { document.removeEventListener("keydown", k); document.removeEventListener("click", c); };
  }, [pop]);
  React.useEffect(() => {
    if (st.phase !== "ok" || typeof IntersectionObserver === "undefined") return undefined;
    const now = document.querySelector(".mlb-path .mlb-node.is-now");
    const io2 = now ? new IntersectionObserver(es => es.forEach(e => setNowOff(e.isIntersecting ? 0 : (e.boundingClientRect.top > 0 ? 1 : -1)))) : null;
    if (io2) io2.observe(now);
    return () => { if (io2) io2.disconnect(); };
  }, [st.phase, openStage]); // eslint-disable-line
  if (startBoss) return <MlbPlayer start={startBoss} onDone={() => { setBoss(null); load(); }} go={go}/>;
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load the map. " + mlbErr(st.e)} retry={load}/>;
  const stages = st.d.stages, known = c => MLB_GOOD_V.indexOf(c.state) >= 0;
  let current = null;
  for (const s of stages) { if (!s.available) continue; const c = s.comps.find(x => !known(x) && x.state !== "locked" && x.state !== "soon"); if (c) { current = c.id; break; } }
  let lastBand = null;
  /* The focus stage — the one holding the next lesson (else the first unfinished, else Stage 1) — is
     the only stage open. Every other stage is its header and progress; opening one closes the rest. */
  const focusStage = (current && (stages.find(s => s.comps.some(c => c.id === current)) || {}).n)
    || (stages.find(s => s.available && s.comps.some(c => !known(c))) || stages[0]).n;
  const shownStage = openStage == null ? focusStage : openStage;
  /* Owner, 5 Nov 2026: "closing the map sections is not very smart". So: opening a stage closes the
     one that was open; closing a stage you went to look at brings you back to YOUR stage (never a
     map with nothing open); closing your own stage folds it; and the stage you open scrolls into view. */
  const toggleStage = n => {
    setPop(null);
    if (n !== shownStage) { setOpenStage(n); setScrollTo(n); return; }
    if (n !== focusStage) { setOpenStage(null); setScrollTo(focusStage); return; }
    setOpenStage(-1);
  };
  /* Bands (owner, 5 Nov 2026: "Improve the map UI/UX"): twenty collapsed rows read as one grey
     list. Each band now has a banner with its own progress, and a jump bar opens a band's first
     unfinished stage — a learner in Stage 2 can see, and reach, the summit in one press. */
  const bandInfo = {}; (st.d.bands || []).forEach(b => { bandInfo[b.id] = b; });
  const bandTally = {}; stages.forEach(s => { const id = s.bandId || "foundations"; const t = bandTally[id] || (bandTally[id] = { k: 0, t: 0, first: s.n, todo: 0 });
    t.k += s.comps.filter(known).length; t.t += s.comps.length; if (!t.todo && s.comps.some(c => !known(c))) t.todo = s.n; });
  const jumpBand = id => { const t = bandTally[id]; if (!t) return; const n = t.todo || t.first; setPop(null); setOpenStage(n === focusStage ? null : n); setScrollTo(n); };
  const dotKind = c => known(c) ? "done" : c.id === current ? "now" : c.state === "locked" || c.state === "soon" ? "locked" : "open";
  const curComp = current && stages.reduce((a, s) => a.concat(s.comps.map(c => Object.assign({ stage: s.n, stageTitle: s.title }, c))), []).find(c => c.id === current);
  return (
    <div className="mlb-mapgrid">
    <aside className="mlb-rail" aria-label="Your day">
      {!lite ? <MlbStatsBar/> : null}
      {curComp ? <section className="mlb-card mlb-upnext"><p className="mlb-h4">Up next</p><b>{curComp.title}</b><span className="mlb-meta">Stage {curComp.stage} · {curComp.stageTitle}</span>
        <button type="button" className="mlb-go" onClick={() => go({ v: "learn", comp: curComp.id })}>Start</button></section> : null}
      <section className="mlb-card mlb-key-card"><p className="mlb-h4">How the path works</p>
        <ul className="mlb-keylist"><li><span className="mlb-node is-done is-mini"><i className="ph-fill ph-check-fat" aria-hidden="true"/></span>Known</li>
          <li><span className="mlb-node is-now is-mini"><i className="ph-fill ph-star" aria-hidden="true"/></span>Start here</li>
          <li><span className="mlb-node is-locked is-mini"><i className="ph-fill ph-lock-simple" aria-hidden="true"/></span>Locked until the topics before it are known</li>
          <li><span className="mlb-node is-boss is-locked is-mini"><i className="ph-fill ph-trophy" aria-hidden="true"/></span>Stage boss: beat it for the stage certificate</li></ul></section>
    </aside>
    <div className="mlb-map">
      {nowOff !== 0 && current ? <button type="button" className="mlb-jump" onClick={() => { const n = document.querySelector(".mlb-path .mlb-node.is-now"); if (n) { try { n.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (_) { n.scrollIntoView(); } n.focus({ preventScroll: true }); } }}
        aria-label="Back to my next topic"><i className={"ph-fill " + (nowOff > 0 ? "ph-arrow-down" : "ph-arrow-up")} aria-hidden="true"/></button> : null}
      {/* Owner, 5 Nov 2026: "there's no logarithm" — it was there, inside Stage 7, and nothing
          let a learner find it by name. Search every topic in every stage. */}
      <div className="mlb-mapsearch" role="search">
        <label htmlFor="mlb-mapq" className="mlb-sr">Find a topic</label>
        <i className="ph ph-magnifying-glass" aria-hidden="true"/>
        <input id="mlb-mapq" type="search" className="mlb-in" value={q} onChange={e => setQ(e.target.value)} placeholder={"Find a topic — " + (mlbLab().find || "type a word") + "…"} autoComplete="off"/>
      </div>
      {q.trim().length >= 2 ? (() => {
        const hits = mlbFindTopics(stages, q);
        return <section className="mlb-card mlb-hits" aria-label="Topics found">
          <p className="mlb-meta" role="status">{hits.length ? hits.length + " topic" + (hits.length === 1 ? "" : "s") + " found" : "No topic matches “" + q.trim() + "”. Try a shorter word."}</p>
          {hits.length ? <ul>{hits.slice(0, 15).map(h => <li key={h.id}><button type="button" className="mlb-hit" onClick={() => go({ v: "learn", comp: h.id })}>
            <span className={"mlb-hit-s is-" + dotKind(h)} aria-hidden="true"/><span className="mlb-hit-t"><b>{h.title}</b><span className="mlb-meta">Stage {h.stage} · {h.stageTitle}</span></span>
            <span className="mlb-chip">{MLB_GOOD_V.indexOf(h.state) >= 0 ? "Known" : h.state === "locked" ? "Locked" : h.state === "soon" ? "Soon" : "Open"}</span></button></li>)}</ul> : null}
        </section>;
      })() : null}
      <nav className="mlb-bandnav" aria-label="Jump to a band">{Object.keys(bandTally).map(id => { const b = bandInfo[id] || {}, t = bandTally[id];
        return <button key={id} type="button" className={"mlb-bandnav-b" + (b.summit ? " is-summit" : "") + (t.k === t.t ? " is-done" : "")} onClick={() => jumpBand(id)}
          aria-label={(b.name || id) + ": " + t.k + " of " + t.t + " topics known"}>{b.summit ? <i className="ph-fill ph-crown" aria-hidden="true"/> : null}<span>{b.name || id}</span><small>{t.k}/{t.t}</small></button>; })}</nav>
      {stages.map(s => {
        const n = s.comps.filter(known).length, band = s.bandId || "foundations", newBand = s.band && s.band !== lastBand; lastBand = s.band;
        const bi = bandInfo[band] || {}, bt = bandTally[band] || { k: 0, t: 0 };
        const shut = !n && s.comps.every(c => c.state === "locked" || c.state === "soon") && s.n !== focusStage;
        return (
          <React.Fragment key={s.n}>
            {newBand ? <div className={"mlb-bandh is-" + band + (bi.summit ? " is-summit" : "")} id={"mlb-band-" + band}>
              <span className="mlb-bandh-i" aria-hidden="true"><i className={bi.summit ? "ph-fill ph-crown" : "ph-fill ph-flag-banner"}/></span>
              <span className="mlb-bandh-t"><b>{s.band}</b><small>{s.level}{bi.stages ? " · " + bi.stages : ""}</small></span>
              <span className="mlb-bandh-n"><span><b>{bt.k}</b> of {bt.t} topics</span><span className="mlb-meter"><span style={{ width: Math.round(bt.k / Math.max(1, bt.t) * 100) + "%" }}/></span></span>
            </div> : null}
            <section id={"mlb-unit-" + s.n} className={"mlb-unit is-" + band + (s.available ? "" : " is-soon") + (s.n === shownStage ? " is-open" : " is-closed") + (s.n === focusStage ? " is-focus" : "")} aria-labelledby={"mlb-st-" + s.n}>
              <header className="mlb-unit-h">
                <button type="button" className="mlb-unit-tog" aria-expanded={s.n === shownStage} aria-controls={"mlb-path-" + s.n}
                  onClick={() => toggleStage(s.n)}>
                  <span className="mlb-unit-k">Stage {s.n} · {n} of {s.comps.length}{s.n === focusStage ? " · You are here" : ""}
                    {shut ? <span className="mlb-unit-lock"><i className="ph-fill ph-lock-simple" aria-hidden="true"/>Opens when the stages before it are known</span> : null}</span>
                  <span id={"mlb-st-" + s.n} className="mlb-unit-t">{s.title}</span>
                  {s.n !== shownStage ? <span className="mlb-dots" aria-hidden="true">{s.comps.map(c => <i key={c.id} className={"is-" + dotKind(c)}/>)}</span> : null}
                  <i className="ph ph-caret-down mlb-caret" aria-hidden="true"/>
                </button>
                {s.certificate ? <a className="mlb-unit-b" href={s.certificate.url} target="_blank" rel="noopener"><i className="ph-fill ph-seal-check" aria-hidden="true"/><span>Certificate</span></a> : null}
                {/* Duolingo's book icon on the unit banner: the stage's Guidebook. */}
                <button type="button" className="mlb-guidebtn" onClick={() => go({ v: "guide", stage: s.n })} aria-label={"Guidebook for Stage " + s.n + ": " + s.title}>
                  <i className="ph-fill ph-notebook" aria-hidden="true"/><span>Guide</span></button>
                {s.n === shownStage && s.n !== focusStage ? <button type="button" className="stt-btn mlb-backstage" onClick={() => { setPop(null); setOpenStage(null); setScrollTo(focusStage); }}>
                  <i className="ph ph-arrow-u-up-left" aria-hidden="true"/>Back to my stage (Stage {focusStage})</button> : null}
              </header>
              {s.n === shownStage ? <ol className="mlb-path" id={"mlb-path-" + s.n}>
                {s.comps.map((c, i) => {
                  const kind = known(c) ? "done" : c.id === current ? "now" : c.state === "locked" ? "locked" : c.state === "soon" ? "soon" : "open";
                  const open = pop === c.id;
                  return [
                    <li key={c.id} className={"mlb-node-li" + (open ? " is-pop" : "")} style={{ "--dx": MLB_PATH_X[i % 10] + "px" }}>
                      {kind === "now" ? <span className="mlb-node-start" aria-hidden="true">Start</span> : null}
                      <button type="button" id={"mlb-node-" + c.id} className={"mlb-node is-" + kind} aria-expanded={open} aria-controls={"mlb-pop-" + c.id}
                        aria-label={c.title + " — " + (kind === "now" ? "start here" : MLB_STATE_L[c.state] || c.state)} onClick={e => { e.stopPropagation(); setPop(open ? null : c.id); }}>
                        <i className={kind === "done" ? "ph-fill ph-check-fat" : kind === "locked" || kind === "soon" ? "ph-fill ph-lock-simple" : kind === "now" ? "ph-fill ph-star" : "ph-fill ph-star"} aria-hidden="true"/>
                      </button>
                      <span className={"mlb-node-lab " + (MLB_PATH_X[i % 10] > 0 ? "is-l" : "is-r") + " is-" + kind} aria-hidden="true">{c.title}</span>
                      {open ? <div id={"mlb-pop-" + c.id} className={"mlb-pop is-" + kind} role="group" aria-label={c.title}>
                        <b>{c.title}</b><span>{kind === "done" ? "Known — it will come back in your reviews." : kind === "locked" ? "Locked: finish the topics before it first." : kind === "soon" ? "Being prepared." : "Topic " + (i + 1) + " of " + s.comps.length}</span>
                        <button type="button" className="mlb-go" disabled={kind === "soon"} onClick={() => go({ v: "learn", comp: c.id })}>{kind === "done" ? "Review" : kind === "locked" ? "Have a look" : "Start"}</button>
                      </div> : null}
                    </li>
                  ].concat(i === MLB_CHEST_INDEX ? [<MlbChestNode key={"chest-" + s.n} s={s} lite={lite} fx={chestFx} onOpen={(xp) => { setChestFx({ stage: s.n, xp }); load(); }}/>] : []);
                })}
                <li className="mlb-node-li is-mini" style={{ "--dx": "-44px" }}>
                  {s.miniReady && !lite ? <button type="button" className="mlb-node is-practice" aria-label={"Mini review of Stage " + s.n + ": five quick questions on what you have practised here"} onClick={() => setBoss({ mode: "mini", stage: s.n })}><i className="ph-fill ph-barbell" aria-hidden="true"/></button>
                    : <span className="mlb-node is-locked" role="img" aria-label="Mini review: opens once you have practised two topics in this stage"><i className="ph-fill ph-barbell" aria-hidden="true"/></span>}
                  <span className="mlb-node-lab is-r" aria-hidden="true">Mini review{s.miniReady && !lite ? "" : <small>after 2 topics</small>}</span>
                </li>
                <li className="mlb-node-li is-boss" style={{ "--dx": "0px" }}>
                  {s.boss ? <span className="mlb-node is-done is-boss" role="img" aria-label="Stage boss defeated"><i className="ph-fill ph-trophy" aria-hidden="true"/></span>
                    : s.bossReady && !lite ? <button type="button" className="mlb-node is-now is-boss" aria-label={"Face the Stage " + s.n + " boss"} onClick={() => setBoss({ mode: "boss", stage: s.n })}><i className="ph-fill ph-trophy" aria-hidden="true"/></button>
                    : <span className="mlb-node is-locked is-boss" role="img" aria-label="Stage boss: light all ten topics first"><i className="ph-fill ph-trophy" aria-hidden="true"/></span>}
                  <span className="mlb-node-lab is-r is-boss" aria-hidden="true">{s.boss ? "Boss beaten" : "Stage boss"}</span>
                </li>
              </ol> : null}
            </section>
          </React.Fragment>
        );
      })}
      {st.d.bands ? <MlbFramework bands={st.d.bands}/> : null}
    </div>
    </div>
  );
}

/* Streak, stars and XP — the numbers that keep a learner coming back, always at the top. */
function MlbStatsBar() {
  const [st] = useMlb(() => NGGApi.member.mathslab.home(), []);
  if (st.phase !== "ok") return null;
  const d = st.d;
  return (
    <div className="mlb-statsbar" role="group" aria-label="Your stats">
      <span className="mlb-sb is-fire" title="Day streak"><i className="ph-fill ph-fire" aria-hidden="true"/><b>{d.streak}</b><span className="mlb-sr"> day streak</span></span>
      <span className="mlb-sb is-star" title="Topics known"><i className="ph-fill ph-star" aria-hidden="true"/><b>{d.counts.mastered}</b><span className="mlb-sr"> topics known</span></span>
      <span className="mlb-sb is-xp" title="XP"><i className="ph-fill ph-lightning" aria-hidden="true"/><b>{d.xp}</b><span className="mlb-sr"> XP</span></span>
      <span className="mlb-sb is-lvl" title="Level"><i className="ph-fill ph-crown" aria-hidden="true"/><b>{d.level.name}</b></span>
    </div>
  );
}

/* The 170-Point Mathematics Mastery Framework and the Gods of Maths summit above it, from MLB_BANDS (one table, server-side). */
function MlbFramework({ bands }) {
  return (
    <section className="mlb-card mlb-fw" aria-labelledby="mlb-fw-h">
      <div className="mlb-fw-top"><h3 id="mlb-fw-h" className="mlb-h3">{mlbLab().road}</h3>
        <p className="mlb-p">{mlbLab().roadP}</p></div>
      <ol className="mlb-bands">{bands.map((b, i) => <li key={b.id} className={b.summit ? "is-summit" : ""}><span className="mlb-bands-i" aria-hidden="true">{b.summit ? <i className="ph-fill ph-crown"/> : i + 1}</span>
        <span className="mlb-bands-t"><b>{b.name}</b><span>{b.level}</span><small>{b.stages} · {b.topics} topics</small></span></li>)}</ol>
    </section>
  );
}

/* ── One competency ── */
/* One topic, as a lesson in steps (Duolingo's shape, Brilliant's content): Explore → Why it
   works → Worked example → Practise, one screen at a time. Owner, 4 Nov 2026: "Everyone must
   study. No cutting corners." So there is no skipping: a step is DONE only when it has been
   worked (a slider moved, every line of the argument read, every line of the example shown),
   Continue waits for that, and a step ahead of the furthest one reached cannot be opened.
   Reaching Practise records the study on the server, which refuses practice without it.
   A topic already studied (or known) can be moved through freely. */
function MlbLearn({ comp, go, startPlay, lite }) {
  /* The topic's real name in the tab and the canonical, once it has arrived. */
  const seoTitle = React.useRef("");
  const [st, load] = useMlb(() => lite ? NGGApi.public.mathslabComp(comp) : NGGApi.member.mathslab.comp(comp), [comp, lite]);
  React.useEffect(() => { const t = st.phase === "ok" && st.d && st.d.comp ? st.d.comp.title : ""; if (t && seoTitle.current !== comp + t) { seoTitle.current = comp + t; mlbSeo({ v: "learn", comp }, t); } }, [st, comp]);
  const [shown, setShown] = React.useState(1);
  /* The worked example's last "Show the next line" is replaced by the answer: focus goes to it, not to the page. */
  const ansRef = React.useRef(null), weActed = React.useRef(false);
  React.useEffect(() => { if (weActed.current && ansRef.current) { weActed.current = false; ansRef.current.focus({ preventScroll: true }); } }, [shown]);
  const [step, setStep] = React.useState(0);
  const [reached, setReached] = React.useState(0);
  const [done, setDone] = React.useState({});
  const [studied, setStudied] = React.useState(null);   // null = not yet asked, true once the server has it
  const [studyErr, setStudyErr] = React.useState("");
  const headRef = React.useRef(null);
  React.useEffect(() => { setStep(0); setReached(0); setDone({}); setShown(1); setStudied(null); setStudyErr(""); }, [comp]);
  /* Coming back to a topic already studied (e.g. after practice) opens on Practise, with every
     step still one press away — not back at step 1 as if nothing had happened. */
  React.useEffect(() => { if (st.phase === "ok" && st.d.studied) { setStep(99); setReached(99); } }, [st.phase]); // eslint-disable-line
  const ok = st.phase === "ok", d = ok ? st.d : null;
  const remIdx = useMlbRemember();
  const rem = ok ? mlbRememberFor(remIdx, d.comp.id) : null;
  const steps = [];
  if (ok) {
    const can = ["soon", "locked"].indexOf(d.state) < 0;
    if (can && mlbExplorerFor(d.comp.id)) steps.push({ id: "explore", label: "Explore", need: "Move a slider (or press a button) and watch what changes." });
    const T = mlbLab().teach || {};   // a Lab's own words for its teaching step (NGG_LABS): Maths proves, English states a rule
    if (d.why) steps.push({ id: "why", label: T.label || "Why it works", need: T.need || "Read every line of the argument." });
    if (d.speak) steps.push({ id: "speak", label: "Hear and say", need: "Hear the difference in eight rounds and say a sentence." });
    if (d.example) steps.push({ id: "example", label: "Worked example", need: "Show every line of the worked example." });
    if (rem) steps.push({ id: "remember", label: "Remember it", need: "Step through the pictures, then cover them and say it." });
    steps.push({ id: "practise", label: "Practise", need: "" });
  }
  const free = ok && (d.studied || MLB_GOOD_V.indexOf(d.state) >= 0);
  const at = Math.min(step, Math.max(steps.length - 1, 0)), cur = steps[at], last = at === steps.length - 1;
  const mark = id => setDone(x => x[id] ? x : Object.assign({}, x, { [id]: true }));
  React.useEffect(() => { if (ok && d.example && shown >= d.example.steps.length) mark("example"); }, [shown, ok]); // eslint-disable-line
  // Reaching Practise is the study: tell the server once (members only — Lite keeps no record).
  React.useEffect(() => {
    if (!ok || lite || !cur || cur.id !== "practise" || d.studied || studied) return;
    if (["soon", "locked"].indexOf(d.state) >= 0) return;
    NGGApi.member.mathslab.studied(comp).then(() => setStudied(true), e => setStudyErr(mlbErr(e)));
  }, [ok, at]); // eslint-disable-line
  /* The lesson's steps are known only once the Remember-it index has arrived: drawing them before it
     showed "Step 1 of 5" and then, a moment later, "Step 1 of 6". One count, from the start. */
  if (st.phase === "loading" || (ok && !remIdx)) return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t open this topic. " + mlbErr(st.e)} retry={load}/>;
  const c = d.comp, ex = d.example, state = d.state, pct = Math.round((d.p || 0) * 100);
  const canLearn = ["soon", "locked"].indexOf(state) < 0;
  const stepDone = free || cur.id === "practise" || !!done[cur.id];
  const canOpen = i => free || i <= reached;
  const toStep = i => { if (!canOpen(i)) return; setStep(i); setTimeout(() => { if (headRef.current) { headRef.current.focus(); try { headRef.current.scrollIntoView({ block: "start" }); } catch (_) {} } }, 0); };
  const next = () => { if (!stepDone) return; const n = at + 1; setReached(r => Math.max(r, n)); setStep(n); setTimeout(() => { if (headRef.current) { headRef.current.focus(); try { headRef.current.scrollIntoView({ block: "start" }); } catch (_) {} } }, 0); };
  const practiseOpen = lite || free || studied === true;
  return (
    <div className="mlb-learn">
      <div className="mlb-lesson-top">
        <button type="button" className="mlb-back" onClick={() => go({ v: "map" })}><i className="ph ph-arrow-left" aria-hidden="true"/>Map</button>
        <span className="mlb-chip is-state">{MLB_STATE_L[state] || state}</span>
      </div>
      <header className="mlb-topichead">
        <p className="mlb-eyebrow">Stage {c.stage} · {c.stageTitle}{c.bandName ? " · " + c.bandName : ""}</p>
        <h2 className="mlb-h2">{c.title}</h2>
        {/* Already know it? Prove it in three questions instead of walking every step (the expertise-reversal effect). */}
        {!lite && !free && canLearn ? <p className="mlb-quick"><button type="button" className="mlb-link" onClick={() => startPlay({ mode: "quick", comp: c.id })}>Already know this? Show me — 3 questions, no hints</button></p> : null}
      </header>
      <ol className="mlb-stepbar" aria-label="Lesson steps">{steps.map((x, i) => (
        <li key={x.id} className={(i < at || (done[x.id] && i !== at) ? "is-done" : i === at ? "is-on" : "") + (canOpen(i) ? "" : " is-ahead")}>
          <button type="button" aria-current={i === at ? "step" : undefined} disabled={!canOpen(i)} onClick={() => toStep(i)}>
            <span className="mlb-stepbar-l">{x.label}</span>{!canOpen(i) ? <span className="mlb-sr"> (locked until you reach it)</span> : null}
          </button></li>))}</ol>
      <div className="mlb-lesson-body">
        <h3 className="mlb-sr" tabIndex={-1} ref={headRef}>Step {at + 1} of {steps.length}: {cur.label}</h3>
        {cur.id === "explore" ? <MlbExplore comp={c.id} onDone={() => mark("explore")}/> : null}
        {cur.id === "why" ? <MlbWhy key={c.id} why={d.why} onDone={() => mark("why")}/> : null}
        {cur.id === "remember" ? <MlbRemember key={c.id} card={rem} onDone={() => mark("remember")} light={d.experienced} onSeen={() => d.experienced && mark("remember")}/> : null}
        {cur.id === "speak" ? <EngSpeak key={c.id} comp={c.id} speak={d.speak} onDone={() => mark("speak")}/> : null}
        {cur.id === "example" ? <section className="mlb-card" aria-labelledby="mlb-we"><h3 id="mlb-we" className="mlb-h3">Worked example</h3>
          <MlbMath as="p" className="mlb-stem" text={ex.stem}/><MlbDiagram d={ex.diagram}/>
          {ex.lines ? <ol className="mlb-lines">{ex.lines.map((l, i) => <li key={i}><MlbMath text={l}/></li>)}</ol> : null}
          <ol className="mlb-steps">{ex.steps.slice(0, shown).map((x, i) => <li key={i}><MlbMath text={x}/></li>)}</ol>
          {shown < ex.steps.length ? <span className="mlb-acts-row"><button type="button" className="stt-btn" onClick={() => { if (shown + 1 >= ex.steps.length) weActed.current = true; setShown(n => n + 1); }}>Show the next line</button>
            {d.experienced ? <button type="button" className="mlb-link" onClick={() => { weActed.current = true; setShown(ex.steps.length); }}>Show the whole working</button> : null}</span>
            : <p className="mlb-ans" ref={ansRef} tabIndex={-1}>Answer: <MlbMath text={ex.answer}/></p>}
        </section> : null}
        {cur.id === "practise" ? <section className="mlb-card mlb-status" aria-label="Practise">
          <h3 className="mlb-h3">{lite ? "Try some questions" : "Now you try"}</h3>
          {!lite && state !== "soon" ? <div className="mlb-ready"><span>How sure we are you know it</span><span className="mlb-meter is-big"><span style={{ width: pct + "%" }}/></span><b>{pct}%</b></div> : null}
          {state === "locked" ? <p className="mlb-warn">Locked: light up the topics it builds on first.</p> : null}
          {state === "soon" ? <p className="mlb-warn">This topic is being prepared and will open soon.</p> : null}
          {studyErr ? <p className="mlb-warn" role="alert">{studyErr}</p> : null}
          {canLearn && !lite ? <div className="mlb-actions">
            <button type="button" className="mlb-go" disabled={!practiseOpen} onClick={() => startPlay({ mode: "practice", comp })}><i className="ph ph-pencil-line" aria-hidden="true"/>Practise</button>
            <button type="button" className="stt-btn" disabled={!practiseOpen || state !== "ready" || d.owed > 0} aria-describedby="mlb-chk-why" onClick={() => startPlay({ mode: "check", comp })}><i className="ph ph-seal-check" aria-hidden="true"/>Mastery check</button>
            <span id="mlb-chk-why" className="mlb-meta">{d.owed > 0 ? "After a check that didn’t pass: get " + d.owed + " more practice question" + (d.owed === 1 ? "" : "s") + " right without a hint, then try again."
              : state === "ready" ? "10 questions, no hints. Pass at 85%." : MLB_GOOD_V.indexOf(state) >= 0 ? "Already lit — it comes back in your reviews." : "Unlocks when practice shows you are ready."}</span>
          </div> : null}
          {c.needs.length ? <div className="mlb-needs"><h4 className="mlb-h4">Builds on</h4><ul>{c.needs.map(n => <li key={n.id}><button type="button" className="mlb-link" onClick={() => go({ v: "learn", comp: n.id })}>{n.title}</button>
            {n.state === "soon" ? <small> in preparation</small> : n.ahead ? <small> introduced here; full topic in Stage {n.ahead}</small> : MLB_GOOD_V.indexOf(n.state) >= 0 ? <small className="is-ok"> known</small> : null}</li>)}</ul></div> : null}
        </section> : null}
        {cur.id === "practise" && lite && canLearn ? <MlbLitePlay comp={comp}/> : null}
      </div>
      <div className="mlb-lesson-foot">
        {at > 0 ? <button type="button" className="stt-btn" onClick={() => toStep(at - 1)}><i className="ph ph-arrow-left" aria-hidden="true"/>Back</button> : <span/>}
        <span className="mlb-meta" aria-live="polite">{!last && !stepDone ? cur.need : "Step " + (at + 1) + " of " + steps.length}</span>
        {!last ? <button type="button" className="mlb-go" disabled={!stepDone} onClick={next}>Continue<i className="ph ph-arrow-right" aria-hidden="true"/></button>
          : <button type="button" className="stt-btn" onClick={() => go({ v: "map" })}>Back to the map</button>}
      </div>
    </div>
  );
}

/* ── Why it works: the argument one line at a time, each with its reason ── */
/* ── Remember it (tools/lab-remember/build.py; owner, 7 Nov 2026) ──────────────────────────────────────
   A short picture sequence of the idea, stepped through by the learner — then covered and recalled.
   Chosen on the evidence over looping GIFs: a picture of the idea itself (never decoration — the
   seductive-details effect), learner-paced segments (nothing runs past them; nothing to pause), one
   caption beside each frame, at most one memory hook, and retrieval at the end. The index is one small
   file fetched once; each frame is an SVG fetched only when shown. */
let mlbRememberIdx = null, mlbRememberP = null;
function mlbRememberLoad() {
  if (mlbRememberIdx) return Promise.resolve(mlbRememberIdx);
  if (!mlbRememberP) mlbRememberP = fetch("/assets/lab-media/remember/remember.json", { credentials: "same-origin" })
    .then(r => r.ok ? r.json() : { cards: {}, map: {} }).catch(() => ({ cards: {}, map: {} }))
    .then(j => (mlbRememberIdx = j && j.cards ? j : { cards: {}, map: {} }));
  return mlbRememberP;
}
function useMlbRemember() {
  const [idx, setIdx] = React.useState(mlbRememberIdx);
  React.useEffect(() => { if (!idx) { let on = true; mlbRememberLoad().then(j => { if (on) setIdx(j); }); return () => { on = false; }; } }, []); // eslint-disable-line
  return idx;
}
function mlbRememberFor(idx, comp) { const k = idx && idx.map && idx.map[comp]; return k && idx.cards[k] ? idx.cards[k] : null; }
function MlbRemember({ card, onDone, onSeen }) {
  const [i, setI] = React.useState(0), [cover, setCover] = React.useState(false), [said, setSaid] = React.useState(false);
  // An experienced learner may move on once they've seen it; the pictures and the recall stay there to use.
  React.useEffect(() => { if (onSeen) onSeen(); }, []); // eslint-disable-line
  const n = card.frames.length, f = card.frames[i], last = i === n - 1;
  React.useEffect(() => { if (said && onDone) onDone(); }, [said]); // eslint-disable-line
  return (
    <section className="mlb-card mlb-rem" aria-labelledby="mlb-rem-h">
      <h3 id="mlb-rem-h" className="mlb-h3"><i className="ph ph-lightbulb" aria-hidden="true"/> Remember it: {card.title}</h3>
      {!cover ? <figure className="mlb-rem-fig">
        <img className="mlb-rem-img" src={f.src} alt={f.alt} width="640" height="330" loading="lazy" decoding="async"/>
        <figcaption className="mlb-rem-cap" aria-live="polite"><span className="mlb-rem-n">{i + 1} of {n}</span>{f.caption}</figcaption>
      </figure> : <div className="mlb-rem-cover">
        <p className="mlb-rem-q"><i className="ph ph-eye-slash" aria-hidden="true"/> {card.recall}</p>
        <p className="mlb-meta">Say it out loud, or write it down — then look again and check.</p>
      </div>}
      {last && card.hook && !cover ? <p className="mlb-rem-hook"><b>Hook:</b> {card.hook}</p> : null}
      <div className="mlb-actions mlb-rem-nav">
        {!cover ? <>
          <button type="button" className="stt-btn" disabled={i === 0} onClick={() => setI(v => v - 1)}><i className="ph ph-arrow-left" aria-hidden="true"/>Back</button>
          {!last ? <button type="button" className="mlb-go" onClick={() => setI(v => v + 1)}>Next picture<i className="ph ph-arrow-right" aria-hidden="true"/></button>
                 : <button type="button" className="mlb-go" onClick={() => setCover(true)}><i className="ph ph-eye-slash" aria-hidden="true"/>Cover it and say it</button>}
        </> : <>
          <button type="button" className="stt-btn" onClick={() => { setCover(false); setI(0); }}><i className="ph ph-eye" aria-hidden="true"/>Look again</button>
          <button type="button" className={"mlb-go" + (said ? " is-done" : "")} aria-pressed={said} onClick={() => setSaid(true)}><i className="ph ph-check" aria-hidden="true"/>{said ? "Done — onwards" : "I said it"}</button>
        </>}
      </div>
    </section>);
}

function MlbWhy({ why, onDone }) {
  const T = mlbLab().teach || {};
  /* In a contrast lesson (the English Lab's "The rule") every marked example is a small game before it
     is an explanation: the sentence is shown WITHOUT its ✓/✗, the learner judges it, and only then
     sees the verdict and the reason (owner, 7 Nov 2026: "Add more interactive features"). Judging
     first is retrieval, not reading — the learner has to apply the rule they were just given. */
  const mark = s => T.contrast ? (/^✓/.test(s) ? "ok" : /^✗/.test(s) ? "no" : "") : "";
  const bare = s => String(s).replace(/^[✓✗]\s*/, "");
  const [shown, setShown] = React.useState(() => (why.steps.length && mark(why.steps[0].s) ? 0 : 1));
  const [marks, setMarks] = React.useState([]), [last, setLast] = React.useState(null);
  const all = shown >= why.steps.length;
  const pending = !all ? why.steps[shown] : null, judge = pending ? mark(pending.s) : "";
  React.useEffect(() => { if (all && onDone) onDone(); }, [all]); // eslint-disable-line
  /* The last Right / Wrong / Next line press removes the very button that had focus, and focus fell
     to the page: a keyboard or screen-reader learner was thrown back to "Skip to content". It goes
     to what replaced the buttons instead — the score, or the closing note — and reading continues. */
  const endRef = React.useRef(null), acted = React.useRef(false);
  React.useEffect(() => { if (all && acted.current && endRef.current) endRef.current.focus({ preventScroll: true }); }, [all]);
  const decide = said => { acted.current = true; const ok = said === judge; setMarks(m => [...m, ok]); setLast({ ok, was: judge }); setShown(n => n + 1); };
  const right = marks.filter(Boolean).length;
  return (
    <section className="mlb-card mlb-why" aria-labelledby="mlb-why-h">
      <h3 id="mlb-why-h" className="mlb-h3">{T.label || "Why it works"}</h3>
      <MlbMath as="p" className="mlb-why-idea" text={why.idea}/>
      <p className="mlb-why-claim">{T.claim || "What we will show:"} <MlbMath text={why.claim}/></p>
      <ol className={"mlb-why-steps" + (T.contrast ? " is-contrast" : "")} aria-live="polite">{why.steps.slice(0, shown).map((s, i) => (
        <li key={i} className={T.contrast ? (/^✗/.test(s.s) ? "is-no" : /^✓/.test(s.s) ? "is-ok" : "") : ""}><MlbMath className="mlb-why-s" text={s.s}/><span className="mlb-why-r"><b>{T.because || "Because"}</b><MlbMath text={s.r}/></span></li>))}</ol>
      <div aria-live="polite">{last ? <p className={"mlb-fb mlb-why-fb " + (last.ok ? "is-ok" : "is-no")}><b className="mlb-fb-h">
        <i className={"ph-fill " + (last.ok ? "ph-check-circle" : "ph-x-circle")} aria-hidden="true"/>{last.ok ? "Yes — " : "Not quite — "}{last.was === "ok" ? "that sentence is right." : "that is the slip people make."}</b></p> : null}</div>
      {!all && judge ? <div className="mlb-why-judge">
          <p className="mlb-why-q">Right or wrong?</p>
          <MlbMath as="p" className="mlb-why-s mlb-why-test" text={bare(pending.s)}/>
          <div className="mlb-actions mlb-judge" role="group" aria-label="Is this sentence right or wrong?">
            <button type="button" className="stt-btn mlb-judge-ok" onClick={() => decide("ok")}><i className="ph ph-check" aria-hidden="true"/>Right</button>
            <button type="button" className="stt-btn mlb-judge-no" onClick={() => decide("no")}><i className="ph ph-x" aria-hidden="true"/>Wrong</button>
          </div></div>
        : !all ? <div className="mlb-actions"><button type="button" className="stt-btn" onClick={() => { acted.current = true; setLast(null); setShown(n => n + 1); }}>{T.next || "Next line"}</button></div>
        : <div className="mlb-why-end" ref={endRef} tabIndex={-1}>{marks.length ? <p className="mlb-why-score" role="status"><b>You judged {right} of {marks.length} correctly.</b> {right === marks.length ? "You have the rule." : "Read the reasons on the ones you missed — practice will ask about exactly those."}</p> : null}
          <p className="mlb-meta">{T.foot || "Each line only uses things we already know from the lines above it. In practice you will be asked why a line is true, and to put the lines in order."}</p></div>}
    </section>
  );
}

/* ── Answer entry ── */
const MLB_KEYS = { expr: ["x", "y", "^", "(", ")", "/", "−", "√(", "log(", "ln("], num: ["−", "."], frac: ["/", "−"], ratio: [":"], pair: ["−"] };
/* A stage's Guidebook — Duolingo's book icon on each unit, which opens its "key phrases". Here:
   each topic's key idea (from its proof, where it has one), the tip to reach for, and a worked
   example to read before or after practising. Read-only; it never counts as studying a topic. */
function MlbGuide({ stage, go }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.guide(stage), [stage]);
  if (st.phase === "loading") return <SttState kind="loading" text="Opening the Guidebook…"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t open the Guidebook. " + mlbErr(st.e)} retry={load}/>;
  const d = st.d;
  return (
    <div className="mlb-stack mlb-guide">
      <header className="mlb-guidehead">
        <button type="button" className="mlb-back" onClick={() => go({ v: "map" })}><i className="ph ph-x" aria-hidden="true"/>Close</button>
        <span className="mlb-guidehead-i" aria-hidden="true"><i className="ph-fill ph-notebook"/></span>
        <p className="mlb-eyebrow">Stage {d.stage} · {d.band} · {d.level}</p>
        <h2 className="mlb-h2">{d.title}</h2>
        <p className="mlb-p">The key ideas of this stage, topic by topic, each with a worked example. Read it before you start, or come back when something will not stick.</p>
      </header>
      <h3 className="mlb-guide-k">Key ideas</h3>
      <ol className="mlb-guide-list">{d.topics.map((t, k) => (
        <li key={t.id} className="mlb-card mlb-guide-item">
          <div className="mlb-row"><b className="mlb-guide-t"><span className="mlb-guide-n">{k + 1}</span>{t.title}</b>
            <span className="mlb-chip">{MLB_GOOD_V.indexOf(t.state) >= 0 ? "Known" : t.state === "locked" ? "Locked" : t.state === "soon" ? "Soon" : "Open"}</span></div>
          {t.idea ? <MlbMath as="p" className="mlb-guide-idea" text={t.idea}/> : null}
          {t.claim ? <p className="mlb-guide-claim"><MlbMath text={t.claim}/></p> : null}
          {t.tip ? <p className="mlb-meta"><i className="ph-fill ph-lightbulb" aria-hidden="true"/> <MlbMath text={t.tip}/></p> : null}
          {t.example ? <details className="mlb-guide-ex"><summary>Worked example</summary>
            <MlbMath as="p" text={t.example.stem}/><MlbDiagram d={t.example.diagram}/>
            {t.example.lines ? <ol className="mlb-lines">{t.example.lines.map((l, j) => <li key={j}><MlbMath text={l}/></li>)}</ol> : null}
            <ol className="mlb-steps">{t.example.steps.map((x, j) => <li key={j}><MlbMath text={x}/></li>)}</ol>
            <p><b>Answer:</b> <MlbMath text={t.example.answer}/></p></details> : null}
          {t.state !== "soon" ? <button type="button" className="stt-btn" onClick={() => go({ v: "learn", comp: t.id })}>{MLB_GOOD_V.indexOf(t.state) >= 0 ? "Review this topic" : "Study this topic"}</button> : null}
        </li>))}</ol>
    </div>
  );
}

/* Exam practice (owner, 5 Nov 2026: "Proceed. Adapt them all over", with JAMB past papers and a
   digital SAT practice test). A JAMB-style paper and an SAT-style Math module, drawn fresh each
   time from the Lab's own exam-style questions, timed like the real thing, marked by area. */
function MlbExams({ go, startPlay }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.exams(), []);
  if (st.phase === "loading") return <SttState kind="loading" text="Fetching the papers…"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load the papers. " + mlbErr(st.e)} retry={load}/>;
  const d = st.d;
  return (
    <div className="mlb-stack mlb-exams">
      <header><h2 className="mlb-h2">Exam practice</h2>
        <p className="mlb-p">Full timed papers in the style of the exams you will sit. Every paper is new: the questions are written by the Lab in the style of past papers, never copied from them. The clock starts when you press Start; when it runs out the paper is handed in.</p></header>
      <div className="mlb-papers">{d.papers.map(p => (
        <section key={p.id} className={"mlb-card mlb-paper is-" + p.id} aria-labelledby={"mlb-paper-" + p.id}>
          <span className="mlb-paper-i" aria-hidden="true"><i className={"ph-fill " + (p.id === "sat" ? "ph-globe-hemisphere-west" : "ph-exam")}/></span>
          <h3 id={"mlb-paper-" + p.id} className="mlb-h3">{p.title}</h3>
          <p className="mlb-meta">{p.n} questions · {p.minutes} minutes{p.best != null ? " · your best: " + p.best + (p.id === "sat" ? " (estimate)" : "/100") : ""}</p>
          <p className="mlb-p">{p.what}</p>
          <button type="button" className="mlb-go" onClick={() => startPlay({ mode: "exam", paper: p.id })}><i className="ph ph-timer" aria-hidden="true"/>Start the paper</button>
        </section>))}</div>
      <section className="mlb-card" aria-labelledby="mlb-exhist-h"><h3 id="mlb-exhist-h" className="mlb-h3">Your papers</h3>
        {d.history.length ? <ul className="mlb-exhist">{d.history.map((h, k) => <li key={k}><span>{h.title}</span><span className="mlb-meta">{mlbDate(h.at)}</span><b>{h.right}/{h.total}</b><span className="mlb-chip">{h.paper === "sat" ? "≈ " + h.scaled : h.scaled + "/100"}</span></li>)}</ul>
          : <p className="mlb-p">No papers yet. Your scores will collect here, so you can see yourself improve.</p>}</section>
    </div>
  );
}

/* The Daily Olympiad Problem (owner, 5 Nov 2026: "Add more features"; "Make things tough, but
   easy"). One problem a day from the Gods of Maths stages, the same for every member. Tough: it
   is olympiad level, whatever stage you are in. Easy: the hint is free, there are three tries, a
   wrong try names what went wrong, and the full worked solution is shown when it is over. It never
   moves the map — it is a taste of the summit, not a step on the path. */
function MlbDaily({ go }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.daily(), []);
  const [val, setVal] = React.useState(null);
  const [hint, setHint] = React.useState(false);
  const [fb, setFb] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const t0 = React.useRef(Date.now());
  if (st.phase === "loading") return <SttState kind="loading" text="Fetching today’s problem…"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load today’s problem. " + mlbErr(st.e)} retry={load}/>;
  const d = st.d, it = d.item, choice = it.kind === "mcq" || it.kind === "error";
  const done = fb ? fb.done : d.done, solved = fb ? fb.solved : d.solved, tries = fb ? fb.tries : d.tries, left = d.maxTries - tries;
  const streak = fb ? fb.dailyStreak : d.dailyStreak, total = fb ? fb.dailySolved : d.dailySolved;
  const steps = (fb && fb.steps) || d.steps || [], answer = (fb && fb.answer) || d.answer;
  const empty = val == null || val === "" || (Array.isArray(val) && val.some(x => x === ""));
  const submit = () => {
    if (busy || empty || done) return;
    setBusy(true); setErr("");
    NGGApi.member.mathslab.dailyAnswer(val, { hints: hint ? 1 : 0, ms: Date.now() - t0.current }).then(r => { setFb(r); setBusy(false); if (!r.correct && !r.done && choice) setVal(null); },
      e => { setBusy(false); setErr("That answer didn’t reach us. " + mlbErr(e)); });
  };
  return (
    <div className="mlb-stack mlb-daily">
      <header className="mlb-dailyhead">
        <p className="mlb-eyebrow"><i className="ph-fill ph-crown" aria-hidden="true"/> {mlbLab().daily} · {d.day}</p>
        <h2 className="mlb-h2">{it.compTitle}</h2>
        <p className="mlb-meta">From Stage {it.stage}: {it.stageTitle}. Everyone in NGG has the same problem today. You have {d.maxTries} tries, and the hint is free.</p>
        <div className="mlb-dailystats" aria-live="polite"><span><i className="ph-fill ph-fire" aria-hidden="true"/><b>{streak}</b> day{streak === 1 ? "" : "s"} in a row</span><span><i className="ph-fill ph-crown" aria-hidden="true"/><b>{total}</b> solved in all</span></div>
      </header>
      <section className="mlb-q mlb-card" aria-live="polite">
        <p className="mlb-qn">{done ? (solved ? "Solved" : "Over for today") : "Try " + (tries + 1) + " of " + d.maxTries}<span className="mlb-chall"><i className="ph-fill ph-lightning" aria-hidden="true"/>{mlbLab().level}</span></p>
        <MlbMath as="p" className="mlb-stem" text={it.stem}/>
        <MlbDiagram d={it.diagram}/>
        {it.lines ? <ol className="mlb-lines">{it.lines.map((l, k) => <li key={k}><MlbMath text={l}/></li>)}</ol> : null}
        {choice ? <div className="mlb-opts" role="radiogroup" aria-label="Choose an answer">{it.options.map((o, k) => (
          <button key={k} type="button" role="radio" aria-checked={val === k} disabled={done || busy} className={"mlb-opt" + (val === k ? " is-on" : "") + (done && answer === o ? " is-right" : "")} onClick={() => setVal(k)}>
            <span className="mlb-opt-l" aria-hidden="true">{k + 1}</span><MlbMath text={o}/></button>))}</div>
          : <MlbInput item={it} value={val} onChange={setVal} onEnter={submit} disabled={done}/>}
        {!done ? (hint ? <p className="mlb-hint"><i className="ph ph-lightbulb" aria-hidden="true"/><MlbMath text={it.hint}/></p>
          : <button type="button" className="mlb-link" onClick={() => setHint(true)}><i className="ph ph-lightbulb" aria-hidden="true"/> Show the hint (it’s free)</button>) : null}
        {fb && !fb.correct && !fb.done ? <div className="mlb-fb is-no" role="status"><b className="mlb-fb-h"><i className="ph-fill ph-lightbulb" aria-hidden="true"/>Not yet — {left} {left === 1 ? "try" : "tries"} left.</b>
          {fb.why ? <MlbMath as="p" text={fb.why}/> : fb.formNote ? <p>{fb.formNote}</p> : <p>Check each step again{hint ? "" : ", or open the hint"}.</p>}</div> : null}
        {err ? <p className="mlb-err" role="alert">{err}</p> : null}
        {!done ? <button type="button" className="mlb-go" disabled={busy || empty} onClick={submit}>{busy ? "Checking…" : "Check my answer"}</button> : null}
        {done ? <div className={"mlb-fb " + (solved ? "is-ok is-big" : "is-no")} role="status">
          <b className="mlb-fb-h"><i className={"ph-fill " + (solved ? "ph-crown" : "ph-book-open")} aria-hidden="true"/>{solved ? (tries === 1 && !hint ? "Solved at the first try — brilliant." : "Solved! Tough problem, and you got there.") : "Out of tries — here is how it goes."}</b>
          <p>Answer: <MlbMath text={answer}/></p>
          <details open><summary>Worked solution</summary><ol className="mlb-steps">{steps.map((x, k) => <li key={k}><MlbMath text={x}/></li>)}</ol></details>
          {fb && fb.xp ? <p className="mlb-xp">+{fb.xp} XP</p> : null}
          <p className="mlb-meta">A new problem arrives tomorrow.{solved ? "" : " Studying this solution is how the next one gets solved."}</p>
        </div> : null}
      </section>
      <div className="mlb-row"><button type="button" className="stt-btn" onClick={() => go({ v: "home" })}><i className="ph ph-arrow-left" aria-hidden="true"/>Back to the Lab</button>
        <button type="button" className="stt-btn" onClick={() => go({ v: "map" })}><i className="ph ph-path" aria-hidden="true"/>See the {mlbLab().summit} stages</button></div>
    </div>
  );
}

function MlbInput({ item, value, onChange, onEnter, disabled }) {
  const ref = React.useRef(null);
  const ins = t => { const v = (value || "") + (t === "−" ? "-" : t === "√(" ? "sqrt(" : t); onChange(v); setTimeout(() => ref.current && ref.current.focus(), 0); };
  if (item.kind === "order") return <MlbOrder item={item} value={value} onChange={onChange} disabled={disabled}/>;
  if (item.kind === "pair") {
    const v = Array.isArray(value) ? value : ["", ""];
    return <div className="mlb-pair">{(item.labels || ["x", "y"]).map((l, i) => <label key={l} className="mlb-pairf"><MlbMath text={"$" + l + " =$"}/>
      <input className="mlb-in" inputMode="decimal" value={v[i]} disabled={disabled} onChange={e => { const n = v.slice(); n[i] = e.target.value; onChange(n); }} onKeyDown={e => e.key === "Enter" && onEnter()} aria-label={l}/></label>)}</div>;
  }
  return (
    <div className="mlb-entry">
      <div className="mlb-inrow">{item.unit === "₦" ? <span className="mlb-unit">₦</span> : null}
        {/* A typed word or sentence (the English Lab's `text` kind): a text keyboard, and no autocorrect or
            spell-check — on a spelling question the phone would otherwise answer for the learner. */}
        <input ref={ref} className="mlb-in" value={value || ""} disabled={disabled} inputMode={item.kind === "expr" || item.kind === "text" ? "text" : "decimal"} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false"
          placeholder={item.kind === "frac" ? "e.g. 3/4" : item.kind === "ratio" ? "e.g. 3:4" : item.kind === "expr" ? "e.g. 3x+2" : item.kind === "text" ? "Type your answer" : "Your answer"} aria-label="Your answer"
          onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onEnter()}/>{item.unit && item.unit !== "₦" ? <span className="mlb-unit">{item.unit}</span> : null}</div>
      {item.kind === "expr" && value ? <p className="mlb-preview" aria-live="polite">Reads as: <MlbMath text={"$" + String(value).replace(/sqrt\(/g, "\\sqrt(").replace(/log\(/g, "\\log(").replace(/ln\(/g, "\\ln(").replace(/\*/g, "\\times ") + "$"}/></p> : null}
      {item.dp != null ? <p className="mlb-meta mlb-rule">Give your answer correct to {item.dp === 0 ? "the nearest whole number" : item.dp + " decimal place" + (item.dp > 1 ? "s" : "")}.</p> : null}
      {/* The symbol keys type into the box; once it is marked they cannot act, so they are not drawn. */}
      {disabled ? null : <div className="mlb-keys">{(MLB_KEYS[item.kind] || []).map(k => <button key={k} type="button" className="mlb-key" disabled={disabled} onClick={() => ins(k)} aria-label={"Type " + k}>{k}</button>)}</div>}
    </div>
  );
}

/* "Put the argument in order": move buttons, never a drag (CLAUDE.md §9). The value is the
   option indexes in the learner's order; it starts as the order shown. */
function MlbOrder({ item, value, onChange, disabled }) {
  const ids = item.options.map((_, i) => i);
  const v = Array.isArray(value) && value.length === ids.length ? value : ids;
  React.useEffect(() => { if (!(Array.isArray(value) && value.length === ids.length)) onChange(ids); }, [item]); // eslint-disable-line
  const [said, setSaid] = React.useState("");
  const move = (pos, d) => { const n = v.slice(), t = pos + d; if (t < 0 || t >= n.length) return; [n[pos], n[t]] = [n[t], n[pos]]; onChange(n); setSaid("Moved to position " + (t + 1) + " of " + n.length + "."); };
  return (
    <div className="mlb-order">
      <p className="mlb-meta">Use the arrows to put the lines in order, first line at the top.</p>
      <ol className="mlb-order-list">{v.map((k, pos) => (
        <li key={k} className="mlb-order-row"><span className="mlb-order-n">{pos + 1}</span><MlbMath className="mlb-order-t" text={item.options[k]}/>
          <span className="mlb-order-btns">
            <button type="button" className="mlb-key" disabled={disabled || pos === 0} aria-label={"Move line " + (pos + 1) + " up"} onClick={() => move(pos, -1)}><span aria-hidden="true">↑</span></button>
            <button type="button" className="mlb-key" disabled={disabled || pos === v.length - 1} aria-label={"Move line " + (pos + 1) + " down"} onClick={() => move(pos, 1)}><span aria-hidden="true">↓</span></button>
          </span></li>))}</ol>
      <p className="mlb-sr" aria-live="polite">{said}</p>
    </div>
  );
}

/* ── The player: one question per screen ── */
/* ── Praise, the way Duolingo does it, aimed at the work rather than the child ──
   Varied words (the same "Correct!" fifty times stops meaning anything), a
   run counted out loud at 3, 5 and 8, a lift straight after a miss, and
   praise that names WHAT went well: careful working, coming back, answering
   without the hint. Praise for effort and method keeps a child trying when
   it gets hard; praise for being "smart" makes them avoid the hard ones. */
/* Feedback after an answer (audit, 13 Nov 2026). It used to be praise picked by the question's POSITION —
   question 1 always "Nice work!", question 2 always "Correct!" — so every session opened with the same
   words, and lines like "You've got this!" praised the child, not the work. Feedback that names what was
   right (the task and the process) helps; praise of the self does not (Hattie & Timperley 2007; Kluger &
   DeNisi 1996). So a right answer is mostly just confirmed — with the answer, quietly — and streaks and
   recoveries, which are about what the learner DID, are named. */
const MLB_NUDGE = ["Not quite. The working below shows where it turns.", "Close. Compare your answer with the first line of the working.", "Not this time. Read the steps, then try the next one the same way.", "Almost. Find the step where yours went a different way."];
function mlbPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
/* A plain right answer is confirmed WITH the answer, in words — never a bare verdict. The answer string
   may hold maths markup; only a short plain one is quoted, otherwise the line names what was done. */
function mlbRightLine(answer) {
  const a = String(answer || "").trim();
  if (a && a.length <= 24 && !/[$\\{}]/.test(a)) return "Right — " + a + ".";
  return mlbPick(["Right — the working holds.", "Right — that method works here.", "Right — checked and correct."]);
}
function mlbPraise({ run, afterMiss, hinted, conf, ms, answer }) {
  if (run === 8) return { t: "Eight right in a row.", big: true };
  if (run === 5) return { t: "Five in a row — the method is holding.", big: true };
  if (run === 3) return { t: "Three in a row.", big: true };
  if (afterMiss) return { t: "Right — and straight after a miss. You used the working." };
  if (conf === "guess") return { t: "Right, though you weren’t sure. Read why below — then it won’t be a guess." };
  if (hinted) return { t: "Right, with the hint. Try the next one before you open it." };
  if (conf === "sure" && ms && ms < 12000) return { t: "Right, and quick." };
  return { t: mlbRightLine(answer) };
}
function mlbNudge({ conf }) {
  if (conf === "sure") return "Not quite, and you were sure. That’s the most useful mistake to look at.";
  return mlbPick(MLB_NUDGE);
}

/* "Why was mine wrong?" — opened by the learner, never shown unasked (feedback helps when learners choose
   to use it). The server names the slip in code where it can, asks the AI only otherwise, and checks
   whatever the AI says (mathslab-explain.php). */
function MlbExplain({ sessionId, index }) {
  const [st, setSt] = React.useState({ phase: "idle" });
  const ask = () => { setSt({ phase: "busy" }); NGGApi.member.mathslab.explain(sessionId, index).then(r => setSt({ phase: "ok", text: r.text }), e => setSt({ phase: "err", text: mlbErr(e) })); };
  if (st.phase === "idle") return <button type="button" className="mlb-link" onClick={ask}>Why was mine wrong?</button>;
  if (st.phase === "busy") return <p className="mlb-meta" role="status">Looking at your answer…</p>;
  return <p className={"mlb-explain" + (st.phase === "err" ? " is-err" : "")} role="status"><i className="ph ph-magnifying-glass" aria-hidden="true"/> {st.text}</p>;
}
/* "Work through one with Guide" — offered only on the stuck card. A FRESH question of the same topic with
   the key held back by the server; each press climbs one rung of a ladder the server holds (the hint, then
   the working one line at a time, then the whole working). Guide never gives the answer, and the guided
   question is not marked: the one that counts is the next, unaided one (mathslab-walk.php). */
function MlbWalk({ sessionId, onAlone }) {
  const [st, setSt] = React.useState({ phase: "busy", say: [] });
  const [val, setVal] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const endRef = React.useRef(null), stemRef = React.useRef(null);
  const take = (r, mine) => setSt(s => ({ phase: r.done ? "done" : "on", item: r.item || s.item, rung: r.rung, rungs: r.rungs || s.rungs, right: r.right, answer: r.answer, steps: r.steps, safeguarding: r.safeguarding,
    say: s.say.concat(mine ? [{ who: "me", text: mine }] : [], [{ who: "guide", text: r.say }]) }));
  const fail = e => setSt(s => Object.assign({}, s, { phase: s.item ? "on" : "err", err: mlbErr(e) }));
  React.useEffect(() => { NGGApi.member.mathslab.walk(sessionId, "start").then(r => take(r), fail); }, []); // eslint-disable-line
  // The button that opened Guide is gone, so focus goes to the new question rather than falling to the page.
  React.useEffect(() => { if (st.item && stemRef.current) stemRef.current.focus({ preventScroll: false }); }, [!!st.item]); // eslint-disable-line
  React.useEffect(() => { if (endRef.current && st.say.length > 1) endRef.current.scrollIntoView({ block: "nearest" }); }, [st.say.length]);
  const it = st.item;
  if (st.phase === "err") return <p className="mlb-explain is-err" role="status">{st.err}</p>;
  if (!it) return <p className="mlb-meta" role="status">Finding a fresh one…</p>;
  const choice = it.kind === "mcq" || it.kind === "error";
  const shown = v => choice ? it.options[v] : Array.isArray(v) ? v.join(", ") : String(v);
  const empty = it.kind === "pair" ? !(Array.isArray(val) && val[0] && val[1]) : choice ? val === "" : !String(val || "").trim();
  const send = body => { setSt(s => Object.assign({}, s, { phase: "busy", err: "" })); NGGApi.member.mathslab.walk(sessionId, "turn", body).then(r => { take(r, body.answer !== undefined ? "I tried " + shown(body.answer) : body.message || "Next step, please"); setVal(""); setMsg(""); }, fail); };
  const busy = st.phase === "busy", done = st.phase === "done";
  return (
    <div className="mlb-walk">
      <p className="mlb-eyebrow">With Guide{st.rungs ? " · step " + Math.min((st.rung || 0) + 1, st.rungs) + " of " + st.rungs : ""}</p>
      <div ref={stemRef} tabIndex={-1} className="mlb-walk-q"><MlbMath as="p" className="mlb-stem" text={it.stem}/></div>
      <MlbDiagram d={it.diagram}/>
      {it.lines ? <ol className="mlb-lines">{it.lines.map((l, k) => <li key={k}><MlbMath text={l}/></li>)}</ol> : null}
      <ol className="mlb-walk-log" aria-live="polite">{st.say.map((m, k) => <li key={k} className={"mlb-walk-" + m.who}>
        {m.who === "guide" ? <i className="ph ph-compass" aria-hidden="true"/> : null}<MlbMath text={m.text}/></li>)}<li ref={endRef} aria-hidden="true"/></ol>
      {st.err ? <p className="mlb-explain is-err" role="status">{st.err}</p> : null}
      {done ? <div>
        {st.steps && !st.safeguarding ? <details open={!st.right}><summary>Worked solution</summary><p>Answer: <MlbMath text={st.answer}/></p><ol className="mlb-steps">{st.steps.map((x, k) => <li key={k}><MlbMath text={x}/></li>)}</ol></details> : null}
        {!st.safeguarding && onAlone ? <div className="mlb-stuck-acts"><button type="button" className="mlb-go" onClick={onAlone}>Now try one on your own</button></div> : null}
      </div> : <>
        {choice ? <div className="mlb-opts" role="radiogroup" aria-label="Choose an answer">{it.options.map((o, k) => (
          <button key={k} type="button" role="radio" aria-checked={val === k} className={"mlb-opt" + (val === k ? " is-on" : "")} onClick={() => setVal(k)}>
            <span className="mlb-opt-l" aria-hidden="true">{k + 1}</span><MlbMath text={o}/></button>))}</div>
          : <MlbInput item={it} value={val} onChange={setVal} onEnter={() => { if (!empty && !busy) send({ answer: val }); }} disabled={busy}/>}
        <div className="mlb-actions">
          <button type="button" className="mlb-go" disabled={empty || busy} onClick={() => send({ answer: val })}>{busy ? "Guide is thinking…" : "Check my try"}</button>
        </div>
        <form className="mlb-walk-ask" onSubmit={e => { e.preventDefault(); if (!busy) send({ message: msg.trim() }); }}>
          <label htmlFor="mlb-walk-msg">What’s confusing? (optional)</label>
          <div className="mlb-walk-row"><input id="mlb-walk-msg" className="mlb-in" value={msg} maxLength={400} onChange={e => setMsg(e.target.value)} placeholder="e.g. I don’t know where to start" disabled={busy}/>
            <button type="submit" className="stt-btn" disabled={busy}>Next step</button></div>
        </form>
      </>}
    </div>
  );
}
function MlbPlayer({ start, onDone, go, onAgain, onMini, onCheck }) {
  const [ses, setSes] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [i, setI] = React.useState(0);
  const [val, setVal] = React.useState("");
  const [conf, setConf] = React.useState("");
  const [hints, setHints] = React.useState(0);
  const [fb, setFb] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState(null);
  // The run of right answers in a row, the best run, and whether the last answer missed.
  const [run, setRun] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const [missed, setMissed] = React.useState(false);
  const [praise, setPraise] = React.useState(null);
  const [walk, setWalk] = React.useState(false);   // "Work through one with Guide", opened from the stuck card
  const tStart = React.useRef(Date.now());
  const t0 = React.useRef(Date.now());
  /* A practice paper runs against the clock, as the exam does: the time left is shown, and at
     zero the paper is handed in (the server refuses answers after the time anyway). */
  const [tick, setTick] = React.useState(Date.now());
  const handedIn = React.useRef(false);
  React.useEffect(() => { if (!ses || ses.mode !== "exam") return undefined; tStart.current = Date.now(); const h = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(h); }, [ses]);
  React.useEffect(() => { NGGApi.member.mathslab.start(start.mode, { comp: start.comp, stage: start.stage, paper: start.paper }).then(setSes, e => setErr(mlbErr(e))); }, []); // eslint-disable-line
  React.useEffect(() => { t0.current = Date.now(); }, [i]);
  /* Where focus goes. Check turns into "Checking…" (disabled) while the answer is marked, and a
     disabled button cannot hold focus, so every Check and every Next question dropped a keyboard or
     screen-reader learner back to the top of the page. Feedback in: the next action ("Next
     question"). A new question: its heading, so it is read from the start. */
  const qRef = React.useRef(null), goRef = React.useRef(null);
  React.useEffect(() => { if (ses && qRef.current) qRef.current.focus({ preventScroll: i === 0 }); }, [i, !!ses]); // eslint-disable-line
  React.useEffect(() => { if (fb && goRef.current) goRef.current.focus({ preventScroll: true }); }, [fb]);
  /* Keyboard, Duolingo's way: 1–9 pick an answer, Enter checks it or moves on. Never while typing
     in a field (digits there are the answer) or when Enter is pressed on a button (it clicks it). */
  const keys = React.useRef(null);
  React.useEffect(() => {
    const on = e => {
      const k = keys.current; if (!k || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (k.choice && !k.fb && /^[1-9]$/.test(e.key) && Number(e.key) <= k.count) { e.preventDefault(); k.pick(Number(e.key) - 1); return; }
      if (k.choice && !k.fb && k.letters && /^[a-e]$/i.test(e.key) && "abcde".indexOf(e.key.toLowerCase()) < k.count) { e.preventDefault(); k.pick("abcde".indexOf(e.key.toLowerCase())); return; }
      if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A") { e.preventDefault(); if (k.fb) k.next(); else k.submit(); }
    };
    document.addEventListener("keydown", on); return () => document.removeEventListener("keydown", on);
  }, []);
  if (err) return <SttState kind="error" text={err}><button type="button" className="stt-btn" onClick={onDone}>Back</button></SttState>;
  if (!ses) return <SttState kind="loading" text="Preparing your questions…"/>;
  if (res) return <MlbResult res={res} onDone={onDone} go={go} onMini={onMini} onAgain={onAgain && ["practice", "review", "exam"].indexOf(res.mode) >= 0 ? onAgain : null}/>;
  const place = ses.mode === "climb" && !!ses.atMost;
  const it = ses.items[i], practice = ses.mode === "practice", last = !place && i === ses.items.length - 1, exam = ses.mode === "exam";
  const left = exam ? Math.max(0, Math.round((tStart.current + ses.minutes * 60000 - tick) / 1000)) : 0;
  const lettered = exam || !!it.letters;
  const empty = it.kind === "pair" ? !(Array.isArray(val) && val[0] && val[1]) : it.kind === "mcq" || it.kind === "error" ? val === "" : !String(val || "").trim();
  const finish = () => { handedIn.current = true; setBusy(true); NGGApi.member.mathslab.finish(ses.sessionId).then(r => { setBusy(false); setRes(Object.assign({}, r, { bestRun: best, secs: Math.round((Date.now() - tStart.current) / 1000) })); }, e => { setBusy(false); setErr(mlbErr(e)); }); };
  const next = () => { setWalk(false); setFb(null); setPraise(null); setVal(""); setConf(""); setHints(0); if (last) finish(); else setI(i + 1); };
  const submit = () => {
    if (empty || busy) return;
    setBusy(true);
    const ms = Date.now() - t0.current;
    NGGApi.member.mathslab.answer(ses.sessionId, i, val, { ms, hints, conf }).then(r => {
      setBusy(false);
      if (ses.mode === "climb" && r.items) {
        /* Placement grows as it searches: the next questions arrive with each answer, and the counter is a
           ceiling that only comes down ("of at most 15"), never a total that keeps growing. */
        if (r.done || !r.items.length) { finish(); return; }
        setSes(s => Object.assign({}, s, { items: s.items.concat(r.items), atMost: Math.min(s.atMost || 15, r.atMost || 15) }));
        setFb(null); setPraise(null); setVal(""); setConf(""); setHints(0); setI(i + 1); return;
      }
      if (practice) {
        if (r.correct) {
          const n = run + 1;
          setRun(n); setBest(b => Math.max(b, n));
          setPraise(mlbPraise({ i, run: n, afterMiss: missed, hinted: hints > 0, conf, ms, answer: r.answer }));
          setMissed(false);
        } else { setRun(0); setMissed(true); setPraise({ t: r.formNote || mlbNudge({ i, conf }) }); }
        setFb(r);
      } else next();
    }, e => { setBusy(false); if (exam && (e.code || e.message) === "time_up") finish(); else setErr(mlbErr(e)); });
  };
  // A paper's question may be left: it counts as unanswered (wrong), as a blank does in the exam.
  const skip = () => { if (busy) return; setBusy(true);
    NGGApi.member.mathslab.answer(ses.sessionId, i, "", { ms: Date.now() - t0.current }).then(() => { setBusy(false); next(); },
      e => { setBusy(false); if ((e.code || e.message) === "time_up") finish(); else setErr(mlbErr(e)); }); };
  if (exam && left === 0 && !handedIn.current && !busy) setTimeout(() => { if (!handedIn.current) finish(); }, 0);
  const choice = it.kind === "mcq" || it.kind === "error";
  keys.current = { choice, count: choice ? it.options.length : 0, fb, pick: k => setVal(k), submit, next, letters: lettered };
  return (
    <div className="mlb-play" data-mode={ses.mode}>
      <div className="mlb-playtop"><p className="mlb-eyebrow">{ses.title}</p>
        {practice && run >= 2 ? <span className="mlb-run" aria-label={run + " right in a row"}><i className="ph-fill ph-fire" aria-hidden="true"/>{run}</span> : null}
        {exam ? <span className={"mlb-clock" + (left <= 300 ? " is-low" : "")} role="timer" aria-label={Math.floor(left / 60) + " minutes " + (left % 60) + " seconds left"}><i className="ph-fill ph-timer" aria-hidden="true"/>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span> : null}
        <button type="button" className="mlb-back" onClick={onDone}><i className="ph ph-x" aria-hidden="true"/>Leave</button></div>
      {place ? <div className="mlb-placebar" role="progressbar" aria-label="Placement" aria-valuemin="0" aria-valuemax={ses.atMost} aria-valuenow={i}><span style={{ width: Math.round(i / ses.atMost * 100) + "%" }}/></div>
        : <ol className="mlb-pips" aria-label={"Question " + (i + 1) + " of " + ses.items.length}>{ses.items.map((_, k) => <li key={k} className={k < i ? "is-done" : k === i ? "is-on" : ""}/>)}</ol>}
      <section className="mlb-q" aria-live="polite">
        <p className="mlb-qn" ref={qRef} tabIndex={-1}>{place ? "Question " + (i + 1) + " · at most " + ses.atMost + ", usually fewer · no timer, answer as well as you can" : "Question " + (i + 1) + " of " + ses.items.length}
          {it.dim === "challenge" ? <span className="mlb-chall"><i className="ph-fill ph-lightning" aria-hidden="true"/>Challenge{practice ? " — take your time; the hint is there if you need it" : ""}</span> : null}</p>
        <MlbMath as="p" className="mlb-stem" text={it.stem}/>
        <MlbDiagram d={it.diagram}/>
        {it.lines ? <ol className="mlb-lines">{it.lines.map((l, k) => <li key={k}><MlbMath text={l}/></li>)}</ol> : null}
        {choice ? <div className="mlb-opts" role="radiogroup" aria-label="Choose an answer">{it.options.map((o, k) => (
          <button key={k} type="button" role="radio" aria-checked={val === k} disabled={!!fb} className={"mlb-opt" + (val === k ? " is-on" : "") + (fb && fb.answer === o ? " is-right" : "") + (fb && !fb.correct && val === k ? " is-wrong" : "")} onClick={() => setVal(k)}>
            <span className="mlb-opt-l" aria-hidden="true">{lettered ? "ABCDE"[k] : k + 1}</span><MlbMath text={o}/></button>))}</div>
          : <MlbInput item={it} value={val} onChange={setVal} onEnter={submit} disabled={!!fb}/>}
        {choice && !fb ? <p className="mlb-meta mlb-keyhint">Tip: press {lettered ? "A–" + "ABCDE"[it.options.length - 1] : "1–" + it.options.length} to choose and Enter to {exam ? "move on" : "check"}.</p> : null}
        {exam && !choice ? <p className="mlb-meta mlb-keyhint">Type your answer (a whole number, a decimal or a fraction such as 7/2).</p> : null}
        {!fb && !exam ? <div className="mlb-conf" role="radiogroup" aria-label="How sure are you?"><span>How sure are you?</span>{[["sure", "Sure"], ["think", "Think so"], ["guess", "Guessing"]].map(([k, l]) =>
          <button key={k} type="button" role="radio" aria-checked={conf === k} className={"mlb-chipb" + (conf === k ? " is-on" : "")} onClick={() => setConf(k)}>{l}</button>)}</div> : null}
        {practice && !fb ? (hints ? <p className="mlb-hint"><i className="ph ph-lightbulb" aria-hidden="true"/><MlbMath text={it.hint}/></p>
          : <button type="button" className="mlb-link" onClick={() => setHints(1)}>Show a hint (earns less XP)</button>) : null}
        {fb ? <div className={"mlb-fb " + (fb.correct ? "is-ok" : "is-no") + (praise && praise.big ? " is-big" : "")} role="status">
          <b className="mlb-fb-h"><i className={"ph-fill " + (fb.correct ? (praise && praise.big ? "ph-fire" : "ph-check-circle") : "ph-lightbulb")} aria-hidden="true"/>{praise ? praise.t : fb.correct ? "Correct!" : "Not quite."}</b>
          {!fb.correct && fb.why ? <MlbMath as="p" text={fb.why}/> : null}
          {!fb.correct && !fb.why && practice && ["mcq", "error", "order"].indexOf(it.kind) < 0 ? <MlbExplain sessionId={ses.sessionId} index={i}/> : null}
          <p>Answer: <MlbMath text={fb.answer}/></p>
          <details open={!fb.correct}><summary>Worked solution</summary><ol className="mlb-steps">{fb.steps.map((s, k) => <li key={k}><MlbMath text={s}/></li>)}</ol></details>
          {fb.xp ? <p className="mlb-xp">+{fb.xp} XP</p> : null}
        </div> : null}
        {fb && fb.readyNow ? <section className="mlb-readynow" aria-labelledby="mlb-ready-h">
          <h3 id="mlb-ready-h" className="mlb-h3"><i className="ph-fill ph-seal-check" aria-hidden="true"/> Three in a row — you’ve shown it.</h3>
          <p className="mlb-meta">No need to keep going on this one. The mastery check is six fresh questions; pass it and the topic is yours.</p>
          <div className="mlb-stuck-acts">
            {onCheck ? <button type="button" className="mlb-go" onClick={() => onCheck(it.comp)}>Take the check now</button> : null}
            <button type="button" className="stt-btn" onClick={next}>Keep practising</button>
          </div>
        </section> : null}
        {fb && fb.stuck ? <section className="mlb-stuck" aria-labelledby="mlb-stuck-h">
          <h3 id="mlb-stuck-h" className="mlb-h3"><i className="ph ph-arrows-clockwise" aria-hidden="true"/> {fb.stuck.message}</h3>
          <p className="mlb-meta">{fb.stuck.right} of your last {fb.stuck.of} on this topic were right. That usually means something underneath it needs a look first — it isn’t about trying harder.</p>
          {walk ? <MlbWalk sessionId={ses.sessionId} onAlone={onAgain || null}/> : <div className="mlb-stuck-acts">
            <button type="button" className="stt-btn" onClick={() => setWalk(true)}><i className="ph ph-compass" aria-hidden="true"/> Work through one with Guide</button>
            {fb.stuck.prereq ? <button type="button" className="mlb-go" onClick={() => { onDone(); go({ v: "learn", comp: fb.stuck.prereq.comp }); }}>Go back to {fb.stuck.prereq.title}</button> : null}
            <button type="button" className={fb.stuck.prereq ? "stt-btn" : "mlb-go"} onClick={() => { onDone(); go({ v: "learn", comp: it.comp }); }}>See the lesson again</button>
            <button type="button" className="stt-btn" onClick={() => { onDone(); go({ v: "map" }); }}>Try another topic for now</button>
          </div>}
        </section> : null}
        <div className="mlb-actions">{fb ? <button type="button" className="mlb-go" ref={goRef} onClick={next}>{last ? "See how you did" : "Next question"}</button>
          : <button type="button" className="mlb-go" disabled={empty || busy} onClick={submit}>{busy ? "Checking…" : practice ? "Check" : last ? "Submit" : "Next"}</button>}
          {exam && !fb ? <button type="button" className="stt-btn" disabled={busy} onClick={skip}>{last ? "Leave it and hand in" : "Leave it, next question"}</button> : null}
          {exam && !last ? <button type="button" className="stt-btn mlb-handin" disabled={busy} onClick={finish}>Hand in now</button> : null}</div>
      </section>
    </div>
  );
}

/* ── A stage is complete: the celebration, Duolingo's way ──
   The session that completes a stage (all ten topics known and its boss
   beaten — the moment its certificate is issued) takes the whole screen: a
   medal, the stage by name, what was done to earn it, the certificate, and
   ONE big button onward to the next stage. Then a course, the same way. It
   is earned, so it is rare, so it is loud. A dialog: Escape closes it, focus
   is held inside and given back. Confetti only when motion is welcome. */
function MlbStageWin({ certs, xp, onClose, go }) {
  const [k, setK] = React.useState(0);
  const ref = React.useRef(null);
  const c = certs[k];
  React.useEffect(() => {
    const prev = document.activeElement;
    const t = setTimeout(() => { const b = ref.current && ref.current.querySelector(".mlb-win-go"); b && b.focus(); }, 60);
    const onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll("a[href],button:not([disabled])");
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); if (prev && prev.focus) try { prev.focus(); } catch (_) {} };
  }, []);
  if (!c) return null;
  const course = c.scope === "course", more = k < certs.length - 1;
  const next = () => more ? setK(k + 1) : null;
  return (
    <div className="mlb-win-wrap" role="dialog" aria-modal="true" aria-labelledby="mlb-win-h" aria-describedby="mlb-win-p">
      <div ref={ref} className={"mlb-win" + (course ? " is-course" : "")} key={k}>
        <div className="mlb-confetti is-big" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--k": i }}/>)}</div>
        <div className="mlb-win-medal" aria-hidden="true"><span className="mlb-win-rays"/><i className={"ph-fill " + (course ? "ph-trophy" : "ph-medal")}/></div>
        <p className="mlb-win-eyebrow">{course ? "Course complete" : "Stage " + c.stage + " complete"}</p>
        <h2 id="mlb-win-h" className="mlb-win-h">{course ? "You finished " + c.course + "!" : "You conquered " + (c.stageTitle || c.title) + "!"}</h2>
        <p id="mlb-win-p" className="mlb-win-p">{course
          ? "Every stage of the course, every boss beaten. That is months of steady work, and it shows."
          : "All " + (c.topics || 10) + " topics known and the boss beaten. You kept going when it was hard, and it paid off."}</p>
        <ul className="mlb-tiles mlb-win-tiles" aria-label="What you did">
          {course ? <li className="is-acc"><span>Course</span><b><i className="ph-fill ph-check-circle" aria-hidden="true"/>Complete</b></li>
            : <li className="is-acc"><span>Topics known</span><b><i className="ph-fill ph-check-circle" aria-hidden="true"/>{c.topics || 10} / {c.topics || 10}</b></li>}
          {!course ? <li className="is-run"><span>Stage boss</span><b><i className="ph-fill ph-sword" aria-hidden="true"/>Beaten</b></li> : null}
          {xp ? <li className="is-xp"><span>This session</span><b><i className="ph-fill ph-lightning" aria-hidden="true"/>+{xp} XP</b></li> : null}
        </ul>
        <a className="mlb-win-cert" href={c.url} target="_blank" rel="noopener" onClick={() => mlbMarkSeen([c.no])}><i className="ph-fill ph-certificate" aria-hidden="true"/><span><b>Certificate earned</b><em>{c.no} · open it, print it, show your family</em></span><i className="ph ph-arrow-square-out" aria-hidden="true"/></a>
        <div className="mlb-win-acts">
          {more ? <button type="button" className="mlb-go mlb-win-go" onClick={next}>Next <i className="ph ph-arrow-right" aria-hidden="true"/></button>
            : !course && c.next ? <button type="button" className="mlb-go mlb-win-go" onClick={() => { onClose(); go({ v: "map" }); }}>On to Stage {c.next.stage}: {c.next.title} <i className="ph ph-arrow-right" aria-hidden="true"/></button>
            : <button type="button" className="mlb-go mlb-win-go" onClick={() => { onClose(); go({ v: "map" }); }}>See my map <i className="ph ph-arrow-right" aria-hidden="true"/></button>}
          <button type="button" className="stt-btn" onClick={() => { onClose(); go({ v: "certificates" }); }}><i className="ph ph-certificate" aria-hidden="true"/>All my certificates</button>
          <button type="button" className="stt-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* The result: the score once, what it means, and the mistakes FIRST with their worked solutions
   open — the useful part of a session is the questions you got wrong. */
function MlbResult({ res, onDone, go, onAgain, onMini }) {
  const [all, setAll] = React.useState(false);
  // A stage or a course completed in this session: celebrate it first, over everything.
  const wins = (res.certificates || []).filter(c => c.scope === "stage").concat((res.certificates || []).filter(c => c.scope === "course"));
  const [winOpen, setWinOpen] = React.useState(wins.length > 0);
  // The result's heading takes focus (the button that led here is gone); a stage win's dialog takes it first.
  const resRef = React.useRef(null);
  React.useEffect(() => { if (!winOpen && resRef.current) resRef.current.focus({ preventScroll: true }); }, []); // eslint-disable-line
  // Tell the tab bar a certificate arrived, so its "new" dot shows at once.
  React.useEffect(() => { if (wins.length) try { window.dispatchEvent(new CustomEvent("mlb:certs-new")); } catch (_) {} }, []);
  const lit = res.changes.filter(c => MLB_GOOD_V.indexOf(c.to) >= 0).length;
  const wrong = res.review.filter(q => !q.correct), shown = all ? res.review : wrong;
  const kind = res.mode === "exam" ? (res.exam && res.exam.title || "Practice paper") : res.mode === "mini" ? "Mini review" : res.mode === "climb" ? "Placement gate" : res.mode === "check" ? "Mastery check" : res.mode === "boss" ? "Stage boss" : res.mode === "review" ? "Review" : "Practice";
  /* The end of a session is the moment that decides whether a child comes back.
     Duolingo's shape: a celebration when it went well, a headline that names it,
     and three tiles — what was earned, how accurate, the best run — each with a
     word, not just a number. Praise names the work ("you finished every
     question", "you came back after a miss"); a low score is "keep going",
     never a verdict. */
  const win = res.pct >= 85, perfect = res.pct === 100 && res.total > 0;
  /* A paper handed in with questions untouched was told "You finished it" — after 1 of 40. It says
     what happened instead; the time running out is not "early", the child did not choose it. */
  const early = !!(res.exam && res.exam.answered < res.total && !res.exam.overTime);
  const head = perfect ? "Perfect!" : win ? (kind === "Practice" || kind === "Review" ? "Session complete!" : kind + " passed!") : early ? "Handed in after " + res.exam.answered + " of " + res.total : res.pct >= 60 ? "Good effort!" : "You finished it. Keep going!";
  const accWord = perfect ? "Flawless" : res.pct >= 85 ? "Amazing" : res.pct >= 70 ? "Great" : res.pct >= 50 ? "Getting there" : "Building up";
  // Under a minute is said in seconds: two seconds read as "1 min".
  const mins = res.secs ? Math.max(1, Math.round(res.secs / 60)) : 0, timeTxt = res.secs && res.secs < 60 ? res.secs + " s" : mins + " min";
  return (
    <div className="mlb-stack">
      {winOpen ? <MlbStageWin certs={wins} xp={res.xp} go={go} onClose={() => setWinOpen(false)}/> : null}
      <section className={"mlb-card mlb-result" + (win ? " is-win" : "")} aria-labelledby="mlb-res-h">
        {win ? <div className="mlb-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, k) => <i key={k} style={{ "--k": k }}/>)}</div> : null}
        <div className="mlb-res-top">
          <div className="mlb-res-ring" style={{ "--pct": res.pct + "%" }} role="img" aria-label={res.pct + "% right"}><b>{res.pct}%</b></div>
          <div className="mlb-res-txt">
            <p className="mlb-eyebrow">{kind}</p>
            <h2 id="mlb-res-h" className="mlb-h2" ref={resRef} tabIndex={-1}>{head}</h2>
            <p className="mlb-p">{res.right} of {res.total} right. {res.message}</p>
          </div>
        </div>
        <ul className="mlb-tiles" aria-label="How it went">
          <li className="is-xp"><span>Total XP</span><b><i className="ph-fill ph-lightning" aria-hidden="true"/>{res.xp || 0}</b></li>
          <li className="is-acc"><span>{accWord}</span><b><i className="ph-fill ph-target" aria-hidden="true"/>{res.pct}%</b></li>
          {res.bestRun >= 2 ? <li className="is-run"><span>Best run</span><b><i className="ph-fill ph-fire" aria-hidden="true"/>{res.bestRun} in a row</b></li>
            : mins ? <li className="is-time"><span>Time on task</span><b><i className="ph-fill ph-timer" aria-hidden="true"/>{timeTxt}</b></li> : null}
        </ul>
        {lit ? <p className="mlb-res-chips"><span className="mlb-chip is-ok"><i className="ph-fill ph-star" aria-hidden="true"/>{lit} star{lit === 1 ? "" : "s"} lit on your map</span></p> : null}
        {res.exam ? <section className="mlb-exrep" aria-label="Your paper">
          <p className="mlb-exrep-score"><b>{res.exam.scaled}</b><span>{res.exam.scale}</span></p>
          <p className="mlb-meta">{res.exam.answered} of {res.total} answered · {Math.floor(res.exam.usedSecs / 60)} min {res.exam.usedSecs % 60} s of {res.exam.minutes} min{res.exam.overTime ? " · handed in when time ran out" : ""}.
            {res.exam.paper === "sat" ? " The 200–800 figure is an estimate from your percentage." : ""}</p>
          <ul className="mlb-exareas">{Object.keys(res.exam.areas).map(a => { const x = res.exam.areas[a], pc = Math.round(x.right / Math.max(1, x.total) * 100);
            return <li key={a} className={pc < 60 ? "is-weak" : ""}><span>{a}</span><span className="mlb-meter"><span style={{ width: pc + "%" }}/></span><b>{x.right}/{x.total}</b></li>; })}</ul>
        </section> : null}
        {res.mini && res.mini.ready && onMini ? <div className="mlb-minioffer" role="note"><i className="ph-fill ph-barbell" aria-hidden="true"/>
          <div><b>You have answered {res.mini.answered} questions today. Brilliant work.</b><span className="mlb-meta">A {res.mini.topics}-question mini review of what you learned earlier will lock it in — it takes about two minutes.</span></div>
          <button type="button" className="mlb-go" onClick={onMini}>Mini review</button></div> : null}
        {!win && wrong.length ? <p className="mlb-meta">The {wrong.length === 1 ? "one you missed is" : wrong.length + " you missed are"} below, with the working. Going over them is the fastest way up.</p> : null}
        {(res.certificates || []).map(c => (
          /* The session that completed a course: the certificate exists now — a numbered NGG document the family also sees under Documents. */
          <p key={c.no} className="mlb-p mlb-cert-new"><i className="ph-fill ph-certificate" aria-hidden="true"/> {c.scope === "stage" ? "Stage passed" : "Course complete"}: <b>{c.title}</b>. Certificate {c.no} —{" "}
            <a href={c.url} target="_blank" rel="noopener">open it</a>.</p>))}
        <div className="mlb-actions">{res.mode === "exam" ? <React.Fragment>{onAgain ? <button type="button" className="mlb-go" onClick={onAgain}><i className="ph ph-arrow-clockwise" aria-hidden="true"/>Try another paper</button> : null}
            <button type="button" className="stt-btn" onClick={() => go({ v: "exams" })}>All papers</button></React.Fragment>
          : onAgain && res.pct < 85 ? <React.Fragment><button type="button" className="mlb-go" onClick={onAgain}><i className="ph ph-arrow-clockwise" aria-hidden="true"/>Practise again</button>
          <button type="button" className="stt-btn" onClick={onDone}>Back to the topic</button></React.Fragment>
          : <React.Fragment><button type="button" className="mlb-go" onClick={onDone}>Continue</button>{onAgain ? <button type="button" className="stt-btn" onClick={onAgain}>Practise again</button> : null}</React.Fragment>}
          {res.mode === "exam" ? null : <button type="button" className="stt-btn" onClick={() => go({ v: "map" })}>See the map</button>}</div>
      </section>
      <section className="mlb-card" aria-labelledby="mlb-rev-h">
        <div className="mlb-row"><h3 id="mlb-rev-h" className="mlb-h3">{all ? "Every question" : wrong.length ? "Learn from these " + wrong.length : "Every answer was right"}</h3>
          <button type="button" className="stt-btn" aria-pressed={all} onClick={() => setAll(!all)}>{all ? "Only the ones I missed" : "Show every question"}</button></div>
        {shown.length ? <ol className="mlb-rev">{shown.map((q, k) => <li key={k} className={q.correct ? "is-ok" : "is-no"}>
          <MlbMath as="p" text={q.stem}/>{q.lines ? <ol className="mlb-lines">{q.lines.map((l, j) => <li key={j}><MlbMath text={l}/></li>)}</ol> : null}
          <p className="mlb-meta">{q.correct ? "Right" : "Answer"}: <MlbMath text={q.answer}/></p>
          {!q.correct ? <details open><summary>Worked solution</summary><ol className="mlb-steps">{q.steps.map((s, j) => <li key={j}><MlbMath text={s}/></li>)}</ol></details> : null}
        </li>)}</ol> : <p className="mlb-p">Nothing to go over.</p>}
      </section>
    </div>
  );
}

/* ── Courses (Coursera-style) ── */
/* Courses. A course you cannot take yet says so — a lock and the reason, never an Enrol button
   that does nothing visible. Enrolling shows its progress, then the card says Enrolled and
   Continue takes you to the course's next topic (not just the map). */
function MlbCourses({ go }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.home(), []);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState({});
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load the courses. " + mlbErr(st.e)} retry={load}/>;
  const enrol = c => {
    setBusy(c.id); setMsg(m => Object.assign({}, m, { [c.id]: null }));
    NGGApi.member.mathslab.enrol(c.id).then(() => { setBusy(""); setMsg(m => Object.assign({}, m, { [c.id]: { ok: true, t: "You’re in! " + c.title + " is yours. " + (c.next ? "First up: " + c.next.title + "." : "Pick up where the map shows you.") } })); load(); },
      e => { setBusy(""); setMsg(m => Object.assign({}, m, { [c.id]: { ok: false, t: (e && e.detail) || mlbErr(e) } })); });
  };
  return (
    <div className="mlb-courses">{st.d.courses.map(c => {
      const m = msg[c.id];
      return (
      <section key={c.id} className={"mlb-card mlb-course" + (c.locked ? " is-locked" : "") + (c.enrolled ? " is-enrolled" : "")} aria-labelledby={"mlb-c-" + c.id}>
        <div className="mlb-course-top">
          <p className="mlb-eyebrow">Stages {c.stages[0]}{c.stages.length > 1 ? "–" + c.stages[c.stages.length - 1] : ""} · about {c.hours} hours · {c.for}</p>
          {c.locked ? <span className="mlb-chip is-lock"><i className="ph-fill ph-lock-simple" aria-hidden="true"/>Locked</span>
            : c.complete ? <span className="mlb-chip is-ok">Complete</span> : c.enrolled ? <span className="mlb-chip is-ok">Enrolled</span> : null}
        </div>
        <h3 id={"mlb-c-" + c.id} className="mlb-h3">{c.title}</h3>
        <p className="mlb-p">{c.promise}</p>
        {c.locked ? <p className="mlb-lockwhy"><i className="ph ph-lock-simple" aria-hidden="true"/>{c.lockReason}</p>
          : <div className="mlb-ready"><span>{c.done} of {c.total} topics</span><span className="mlb-meter is-big"><span style={{ width: c.pct + "%" }}/></span><b>{c.pct}%</b></div>}
        {/* What the course holds, in order, and where you are in it: a stage is
            done (its ten topics known and its boss beaten), on now, or ahead. */}
        {(c.stageRows || []).length ? <ol className="mlb-cpath" aria-label={"Stages in " + c.title}>{c.stageRows.map((r, k) => {
          const done = r.known >= r.total && r.boss, cur = !done && !c.locked && c.stageRows.slice(0, k).every(x => x.known >= x.total && x.boss);
          return <li key={r.stage} className={done ? "is-done" : cur ? "is-cur" : ""}>
            <span className="mlb-cpath-dot" aria-hidden="true"><i className={"ph-fill " + (done ? "ph-check" : cur ? "ph-play" : c.locked ? "ph-lock-simple" : "ph-circle")}/></span>
            <span className="mlb-cpath-t"><b>Stage {r.stage} · {r.title}</b><span>{done ? "Done, certificate earned" : r.known + " of " + r.total + " topics" + (r.known >= r.total && !r.boss ? " · boss to beat" : "")}</span></span>
          </li>; })}</ol> : null}
        {(() => {
          // How close the next certificate is: the thing worth coming back for.
          if (c.locked || c.complete || !c.enrolled) return null;
          const r = (c.stageRows || []).find(x => !(x.known >= x.total && x.boss));
          if (!r) return null;
          const left = r.total - r.known;
          return <p className="mlb-cnext"><i className="ph-fill ph-certificate" aria-hidden="true"/>{left > 0 ? left + " topic" + (left === 1 ? "" : "s") + " to go for your Stage " + r.stage + " certificate." : "Beat the Stage " + r.stage + " boss for your certificate."}</p>;
        })()}
        <div className="mlb-actions">
          {!c.available ? <span className="mlb-chip">In preparation</span>
            : c.locked ? <button type="button" className="stt-btn" onClick={() => go({ v: "map" })}><i className="ph ph-path" aria-hidden="true"/>Go to my stage</button>
            : c.enrolled ? <button type="button" className="mlb-go" onClick={() => c.next ? go({ v: "learn", comp: c.next.comp }) : go({ v: "map" })}>{c.next ? "Continue: " + c.next.title : "Continue"}</button>
            : <button type="button" className="mlb-go" disabled={busy === c.id} onClick={() => enrol(c)}>{busy === c.id ? "Enrolling…" : "Enrol — free"}</button>}
          {/* The certificate is the NGG document (documents.php) in its own
              design, numbered and checkable at /verify — opened, never redrawn here. */}
          {c.certificate ? <a className="stt-btn" href={c.certificate.url} target="_blank" rel="noopener"><i className="ph ph-certificate" aria-hidden="true"/>Course certificate</a> : null}
        </div>
        {m ? <p className={m.ok ? "mlb-okmsg" : "mlb-warn"} role={m.ok ? "status" : "alert"}>{m.t}</p> : null}
        {/* A stage certificate for every ten topics; the course certificate above is the whole. */}
        {(c.stageCertificates || []).length ? <div className="mlb-actions mlb-stagecerts">
          {c.stageCertificates.map(x => <a key={x.no} className="mlb-chip is-ok" href={x.url} target="_blank" rel="noopener">Stage {x.stage} certificate</a>)}
        </div> : null}
      </section>); })}
      <p className="mlb-meta">Each stage of ten topics earns a stage certificate when all ten are known and its boss is beaten; a course certificate follows when every stage of the course is done.</p>
    </div>
  );
}
/* ── Certificates: one place, newest first ──
   Each certificate as a card: what it is for, its number, when, and Open /
   Print. What is next to earn sits underneath, so the page is useful before
   the first one too. Opening a certificate here clears its "new" marker. */
function MlbCerts({ go }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.home(), []);
  const [, tick] = React.useState(0);
  if (st.phase === "loading") return <SttState kind="loading" text="Getting your certificates…"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load your certificates. " + mlbErr(st.e)} retry={load}/>;
  const d = st.d, list = d.certificates || [], seen = mlbSeen();
  const open = c => { mlbMarkSeen([c.no]); tick(x => x + 1); };
  const printUrl = c => c.url + (c.url.indexOf("?") >= 0 ? "&" : "?") + "print=1";
  const f = d.focus || {};
  return (
    <div className="mlb-stack">
      <header className="mlb-homehead">
        <h2 className="mlb-h2">Your certificates</h2>
        <p className="mlb-p">{list.length ? "Every certificate you have earned in the " + mlbLab().title + ", newest first. Your family sees them too, under Documents." : "You have not earned a certificate yet. Know all ten topics of a stage and beat its boss to earn your first."}</p>
      </header>
      {list.length ? <ul className="mlb-certgrid">{list.map(c => {
        const isNew = seen.indexOf(c.no) < 0;
        return <li key={c.no} className={"mlb-certcard" + (c.scope === "course" ? " is-course" : "") + (isNew ? " is-new" : "")}>
          <div className="mlb-certcard-ic" aria-hidden="true"><i className={"ph-fill " + (c.scope === "course" ? "ph-trophy" : "ph-medal")}/></div>
          <div className="mlb-certcard-t">
            {isNew ? <span className="mlb-chip is-ok">New</span> : null}
            <b>{c.title}</b>
            <span className="mono">{c.no}</span>
            <span>{c.scope === "course" ? "Course certificate" : "Stage certificate"}{c.at ? " · " + mlbDate(c.at) : ""}</span>
          </div>
          <div className="mlb-certcard-acts">
            <a className="mlb-go" href={c.url} target="_blank" rel="noopener" onClick={() => open(c)}><i className="ph ph-arrow-square-out" aria-hidden="true"/>Open</a>
            <a className="stt-btn" href={printUrl(c)} target="_blank" rel="noopener" onClick={() => open(c)}><i className="ph ph-printer" aria-hidden="true"/>Print</a>
          </div>
        </li>; })}</ul> : null}
      <section className="mlb-card mlb-certnext" aria-labelledby="mlb-certnext-h">
        <h3 id="mlb-certnext-h" className="mlb-h3">Next to earn</h3>
        <p className="mlb-p">Stage {f.stage}{f.title ? " · " + f.title : ""}: {f.known || 0} of {f.total || 10} topics known{(f.known || 0) >= (f.total || 10) ? ", then beat the boss" : ""}.</p>
        <div className="mlb-progrow"><span>Stage {f.stage}</span><span className="mlb-meter is-big"><span style={{ width: Math.round((f.known || 0) / Math.max(f.total || 10, 1) * 100) + "%" }}/></span><b>{f.known || 0}/{f.total || 10}</b></div>
        <button type="button" className="stt-btn" onClick={() => go({ v: "map" })}><i className="ph ph-path" aria-hidden="true"/>Go to my stage</button>
      </section>
    </div>
  );
}
function mlbDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return "";
  return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " + d.getFullYear();
}

/* ── Progress ── */
/* ── Progress ──
   Where you stand, and what to do about it: each stage's topics, its boss and
   its certificate; every certificate earned; the mistakes that keep coming
   back, each with the reason and a way to practise it; and the last two
   weeks, including the answers you were sure of and got wrong. */
function MlbProgress({ go }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.progress(), []);
  if (st.phase === "loading") return <SttState kind="loading" text="Reading your progress…"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load your progress. " + mlbErr(st.e)} retry={load}/>;
  const d = st.d, r = d.recent, pct = r.answered ? Math.round(r.right / r.answered * 100) : null;
  return (
    <div className="mlb-stack">
      <div className="mlb-grid">
        <section className="mlb-card"><h3 className="mlb-h3">Level</h3><p className="mlb-big">{d.level.name}<small> · {d.xp} XP</small></p></section>
        <section className="mlb-card"><h3 className="mlb-h3">Last 14 days</h3>
          <p className="mlb-big">{pct === null ? "—" : pct + "%"}<small>{r.answered ? " right of " + r.answered : " nothing answered yet"}</small></p>
          {r.sureWrong ? <p className="mlb-meta">{r.sureWrong} answer{r.sureWrong === 1 ? "" : "s"} you were sure of turned out wrong — those are the ones worth a second look.</p> : null}</section>
        <section className="mlb-card"><h3 className="mlb-h3">Due for review</h3><p className="mlb-big">{d.due}</p>
          {d.due ? <button type="button" className="stt-btn" onClick={() => go({ v: "home" })}>Review them</button> : <p className="mlb-meta">Nothing is fading.</p>}</section>
      </div>

      <section className="mlb-card" aria-labelledby="mlb-roots-h"><h3 id="mlb-roots-h" className="mlb-h3">Foundations to fix first</h3>
        {d.roots && d.roots.length ? <React.Fragment><p className="mlb-p">These topics are underneath the ones you are finding hard. Fix these first and the hard ones get easier.</p>
          <ul className="mlb-roots">{d.roots.map(x => (
            <li key={x.comp}><div><b>{x.title}</b><small>Stage {x.stage} · underneath {x.behind.slice(0, 3).join(", ")}{x.behind.length > 3 ? " and " + (x.behind.length - 3) + " more" : ""}</small></div>
              <button type="button" className="stt-btn is-go" onClick={() => go({ v: "learn", comp: x.comp })}>Start here</button></li>))}</ul></React.Fragment>
          : <p className="mlb-p">No hidden gaps found. When a topic keeps going wrong, we trace it back to the foundation underneath it and show it here.</p>}
      </section>

      <section className="mlb-card"><h3 className="mlb-h3">Mistakes that keep coming back</h3>
        {d.mistakes.length ? <ul className="mlb-miss">{d.mistakes.map(x => (
          <li key={x.comp}><div><b>{x.title}</b><span className="mlb-meta">{x.wrong} wrong recently</span>
            {x.why ? <MlbMath as="p" className="mlb-p" text={x.why}/> : null}</div>
            <button type="button" className="stt-btn" onClick={() => go({ v: "learn", comp: x.comp })}>Practise it</button></li>))}</ul>
          : <p className="mlb-p">Nothing repeating. Mistakes you make in practice will gather here, with the reason, so you can go straight back to them.</p>}
      </section>

      {d.bands ? <section className="mlb-card"><h3 className="mlb-h3">{mlbLab().road}</h3>
        <ul className="mlb-bands">{d.bands.map(b => <li key={b.name}><b>{b.name}</b><span>{b.level}</span>
          <span className="mlb-meter"><span style={{ width: Math.round(b.mastered / b.total * 100) + "%" }}/></span><span>{b.mastered} of {b.total} points</span></li>)}</ul></section> : null}

      <section className="mlb-card"><h3 className="mlb-h3">Stages</h3>
        <ul className="mlb-stages">{d.stages.map(x => (
          <li key={x.n} className={x.mastered === x.total ? "is-done" : x.started ? "is-on" : ""}>
            <span className="mlb-stn">Stage {x.n}</span><b>{x.title}</b>
            <span className="mlb-meter"><span style={{ width: Math.round(x.mastered / x.total * 100) + "%" }}/></span>
            <span className="mlb-meta">{x.mastered} of {x.total}{x.boss ? " · boss beaten" : ""}</span>
            {x.certificate ? <a className="mlb-chip is-ok" href={x.certificate.url} target="_blank" rel="noopener">Certificate</a> : null}
          </li>))}</ul>
        <p className="mlb-meta">Ten topics and the stage boss earn a stage certificate; every stage of a course earns its course certificate.</p>
      </section>

      <section className="mlb-card"><h3 className="mlb-h3">Certificates</h3>
        {d.certificates.length ? <ul className="mlb-certs">{d.certificates.map(c => (
          <li key={c.no}><a href={c.url} target="_blank" rel="noopener"><i className="ph ph-certificate" aria-hidden="true"/>{c.title}</a><span className="mlb-meta">{c.no}</span></li>))}</ul>
          : <p className="mlb-p">None yet. Your first comes with your first stage: all ten topics and its boss.</p>}
        <p className="mlb-meta">Each one is kept with your family's documents and can be checked by anyone at /verify.</p>
      </section>

      <section className="mlb-card"><h3 className="mlb-h3">Badges</h3><ul className="mlb-badges">{d.badges.map(b => <li key={b.id} className={b.earned ? "is-on" : ""}><i className={"ph " + (b.earned ? "ph-seal-check" : "ph-seal")} aria-hidden="true"/><b>{b.name}</b><span>{b.what}</span></li>)}</ul></section>
    </div>
  );
}

/* ── Maths Lab Lite (everyone) ── */
function MlbLite({ signedIn, route, go }) {
  return (
    <div className={"mlb is-" + mlbLab().id}>
      <section className="mlb-hero">
        <div className="mlb-hero-sky" aria-hidden="true"/>
        <p className="mlb-eyebrow">{mlbLab().title} Lite</p>
        <h2 className="mlb-hero-h">Practise any topic, free.</h2>
        <p className="mlb-hero-p">Every answer is marked with a worked solution. Nothing is saved — NGG members get the full Lab: the climb to their level, mastery, reviews, courses and certificates.</p>
        {!signedIn ? <a className="mlb-go" href="/join" onClick={e => { e.preventDefault(); location.assign("/join"); }}>Join NGG</a> : null}
      </section>
      {route.v === "learn" ? <MlbLearn comp={route.comp} go={go} lite/> : <MlbMap go={go} lite/>}
    </div>
  );
}
function MlbLitePlay({ comp }) {
  const [it, setIt] = React.useState(null);
  const [val, setVal] = React.useState("");
  const [fb, setFb] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [score, setScore] = React.useState([0, 0]);
  const load = React.useCallback(() => { setFb(null); setVal(""); setErr(""); NGGApi.public.mathslabItem(comp).then(setIt, e => setErr(mlbErr(e))); }, [comp]);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <SttState kind="error" text={err} retry={load}/>;
  if (!it) return <SttState kind="loading"/>;
  const q = it.item, choice = q.kind === "mcq" || q.kind === "error";
  const empty = q.kind === "pair" ? !(Array.isArray(val) && val[0] && val[1]) : choice ? val === "" : !String(val || "").trim();
  const check = () => { if (empty) return; NGGApi.public.mathslabCheck(it.token, val).then(r => { setFb(r); setScore(s => [s[0] + (r.correct ? 1 : 0), s[1] + 1]); }, e => setErr(mlbErr(e))); };
  return (
    <section className="mlb-q mlb-card">
      <p className="mlb-qn">Practice · {score[0]} of {score[1]} right this visit</p>
      <MlbMath as="p" className="mlb-stem" text={q.stem}/><MlbDiagram d={q.diagram}/>
      {q.lines ? <ol className="mlb-lines">{q.lines.map((l, k) => <li key={k}><MlbMath text={l}/></li>)}</ol> : null}
      {choice ? <div className="mlb-opts" role="radiogroup" aria-label="Choose an answer">{q.options.map((o, k) => <button key={k} type="button" role="radio" aria-checked={val === k} disabled={!!fb} className={"mlb-opt" + (val === k ? " is-on" : "")} onClick={() => setVal(k)}><span className="mlb-opt-l" aria-hidden="true">{k + 1}</span><MlbMath text={o}/></button>)}</div>
        : <MlbInput item={q} value={val} onChange={setVal} onEnter={check} disabled={!!fb}/>}
      {fb ? <div className={"mlb-fb " + (fb.correct ? "is-ok" : "is-no")} role="status"><b>{fb.correct ? "Right!" : fb.formNote || "Not quite."}</b>{!fb.correct && fb.why ? <MlbMath as="p" text={fb.why}/> : null}
        <p>Answer: <MlbMath text={fb.answer}/></p><details open={!fb.correct}><summary>Worked solution</summary><ol className="mlb-steps">{fb.steps.map((s, k) => <li key={k}><MlbMath text={s}/></li>)}</ol></details></div> : null}
      <div className="mlb-actions">{fb ? <button type="button" className="mlb-go" onClick={load}>Another question</button> : <button type="button" className="mlb-go" disabled={empty} onClick={check}>Check</button>}</div>
    </section>
  );
}
