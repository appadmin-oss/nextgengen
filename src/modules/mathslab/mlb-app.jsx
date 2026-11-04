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
const MLB_ERR = { members_only: "The full Maths Lab is for NGG members.", locked: "Finish the topics this builds on first.", not_available: "This topic is still in preparation.",
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
  return null;
}

/* ── Where we are inside /study/lab ── */
function mlbRoute() {
  const seg = (location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  if (seg[0] !== "study" || seg[1] !== "lab") return { v: "home" };
  if (seg[2] === "learn" && /^MC-\d{3}$/.test(seg[3] || "")) return { v: "learn", comp: seg[3] };
  if (["map", "courses", "progress"].indexOf(seg[2]) >= 0) return { v: seg[2] };
  return { v: "home" };
}
function mlbPath(r) { return "/study/lab" + (r.v === "home" ? "" : r.v === "learn" ? "/learn/" + r.comp : "/" + r.v); }

function MathsLab({ me }) {
  const [route, setRoute] = React.useState(mlbRoute);
  const [play, setPlay] = React.useState(null);           // a running session
  const [lite, setLite] = React.useState(false);          // signed in but not an NGG member
  const go = React.useCallback(r => { setPlay(null); setRoute(r); try { history.pushState({ page: "study" }, "", mlbPath(r)); window.scrollTo(0, 0); } catch (_) {} }, []);
  React.useEffect(() => { const on = () => { setPlay(null); setRoute(mlbRoute()); }; window.addEventListener("popstate", on); return () => window.removeEventListener("popstate", on); }, []);
  if (me.phase === "loading") return <SttState kind="loading" text="Opening the Maths Lab…"/>;
  if (!me.member || lite) return <MlbLite signedIn={!!me.member} route={route} go={go}/>;
  if (play) return <MlbPlayer start={play} onDone={() => { setPlay(null); }} go={go}/>;
  const nav = [["home", "Home", "ph-house-line"], ["map", "Map", "ph-star-four"], ["courses", "Courses", "ph-graduation-cap"], ["progress", "Progress", "ph-chart-line-up"]];
  return (
    <div className="mlb">
      <nav className="mlb-nav" aria-label="Maths Lab">
        {nav.map(([v, l, ic]) => <button key={v} type="button" className={"mlb-navb" + (route.v === v ? " is-on" : "")} aria-current={route.v === v ? "page" : undefined} onClick={() => go({ v })}><i className={"ph " + ic} aria-hidden="true"/><span>{l}</span></button>)}
      </nav>
      {route.v === "map" ? <MlbMap go={go}/>
        : route.v === "learn" ? <MlbLearn comp={route.comp} go={go} startPlay={setPlay}/>
        : route.v === "courses" ? <MlbCourses go={go}/>
        : route.v === "progress" ? <MlbProgress/>
        : <MlbHome go={go} startPlay={setPlay} onNotMember={() => setLite(true)}/>}
    </div>
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
function MlbHome({ go, startPlay, onNotMember }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.home(), []);
  React.useEffect(() => { if (st.phase === "error" && st.e && (st.e.code || st.e.message) === "members_only") onNotMember(); }, [st]); // eslint-disable-line
  if (st.phase === "loading") return <SttState kind="loading" text="Lighting up your sky…"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t open the Maths Lab. " + mlbErr(st.e)} retry={load}/>;
  const d = st.d, lv = d.level, nx = d.next;
  const pct = lv.next ? Math.round((d.xp - lv.from) / (lv.next - lv.from) * 100) : 100;
  const begin = () => {
    if (nx.mode === "climb") startPlay({ mode: "climb" });
    else if (nx.mode === "review") startPlay({ mode: "review" });
    else if (nx.mode === "check" || nx.mode === "practice") go({ v: "learn", comp: nx.comp });
  };
  return (
    <div className="mlb-stack">
      <section className="mlb-hero" aria-labelledby="mlb-hi">
        <div className="mlb-hero-sky" aria-hidden="true"/>
        <p className="mlb-eyebrow">Maths Lab</p>
        <h2 id="mlb-hi" className="mlb-hero-h">Hello, {d.name}.</h2>
        <p className="mlb-hero-p">{d.climb.done ? "You’re at your level. Keep the stars burning." : "Your climb starts at the very beginning and moves fast when you know it."}</p>
        <div className="mlb-hero-stats">
          <div><b>{d.counts.mastered}</b><span>stars lit</span></div>
          <div><b>{d.streak}</b><span>day streak{d.freezes ? " · " + d.freezes + " freeze" + (d.freezes > 1 ? "s" : "") : ""}</span></div>
          <div><b>{lv.name}</b><span>{d.xp} XP</span></div>
        </div>
        <div className="mlb-xpbar" role="progressbar" aria-label="Progress to the next level" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: pct + "%" }}/></div>
        {nx.mode !== "none" ? <button type="button" className="mlb-go" onClick={begin}><i className="ph ph-play-circle" aria-hidden="true"/>{nx.label}</button> : <p className="mlb-hero-p">{nx.label}</p>}
      </section>
      {!d.climb.done ? <section className="mlb-card"><h3 className="mlb-h3">How the climb works</h3>
        <p className="mlb-p">Each stage opens with a short gate of typed questions. Get them all right, quickly, and the whole stage lights up and you jump to the next. Miss a few, and your learning starts exactly where the gaps are. Anything you skip is checked again in a few days, so rushing never counts.</p>
        <p className="mlb-meta">Now at Stage {d.climb.stage}{d.climb.momentum >= 3 ? " · on a roll: shorter gates" : ""}.</p></section> : null}
      <section className="mlb-card"><h3 className="mlb-h3">Badges</h3>
        <ul className="mlb-badges">{d.badges.map(b => <li key={b.id} className={b.earned ? "is-on" : ""}><i className={"ph " + (b.earned ? "ph-seal-check" : "ph-seal")} aria-hidden="true"/><b>{b.name}</b><span>{b.what}</span></li>)}</ul></section>
      <section className="mlb-card"><div className="mlb-row"><h3 className="mlb-h3">Your courses</h3><button type="button" className="stt-btn" onClick={() => go({ v: "courses" })}>All courses</button></div>
        <ul className="mlb-mini">{d.courses.filter(c => c.enrolled || c.available).slice(0, 3).map(c => <li key={c.id}><span>{c.title}</span><span className="mlb-meter"><span style={{ width: c.pct + "%" }}/></span><b>{c.pct}%</b></li>)}</ul></section>
      <p className="mlb-meta">{d.counts.available} of {d.counts.total} topics are open in this preview; the rest are being prepared.</p>
    </div>
  );
}

/* ── The constellation map ── */
function MlbStars({ stage, onPick }) {
  const pts = stage.comps.map((c, i) => [24 + i * 30, 44 + Math.sin(i * 1.3 + stage.n) * 22]);
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
function MlbMap({ go, lite }) {
  const [st, load] = useMlb(() => lite ? NGGApi.public.mathslabMap() : NGGApi.member.mathslab.map(), [lite]);
  const [startBoss, setBoss] = React.useState(null);
  if (startBoss) return <MlbPlayer start={startBoss} onDone={() => { setBoss(null); load(); }} go={go}/>;
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load the map. " + mlbErr(st.e)} retry={load}/>;
  return (
    <div className="mlb-map">
      <p className="mlb-p">Every star is a topic. Lit stars are known; the brighter halo means it has stayed with you through a review. Tap a star to learn it.</p>
      <ul className="mlb-legend"><li className="is-known">Known</li><li className="is-learning">Learning</li><li className="is-open">Ready to learn</li><li className="is-locked">Locked</li><li className="is-soon">In preparation</li></ul>
      {st.d.stages.map(s => (
        <section key={s.n} className={"mlb-stage" + (s.available ? "" : " is-soon")} aria-labelledby={"mlb-st-" + s.n}>
          <div className="mlb-row"><h3 id={"mlb-st-" + s.n} className="mlb-h3"><span className="mlb-stn">Stage {s.n}</span> {s.title}</h3>
            {!s.available ? <span className="mlb-chip">In preparation</span> : s.boss ? <span className="mlb-chip is-ok">Boss defeated</span>
              : s.bossReady && !lite ? <button type="button" className="stt-btn is-go" onClick={() => setBoss({ mode: "boss", stage: s.n })}>Face the boss</button> : null}</div>
          <MlbStars stage={s} onPick={c => go({ v: "learn", comp: c.id })}/>
        </section>
      ))}
    </div>
  );
}

/* ── One competency ── */
function MlbLearn({ comp, go, startPlay, lite }) {
  const [st, load] = useMlb(() => lite ? NGGApi.public.mathslabComp(comp) : NGGApi.member.mathslab.comp(comp), [comp, lite]);
  const [shown, setShown] = React.useState(1);
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t open this topic. " + mlbErr(st.e)} retry={load}/>;
  const c = st.d.comp, ex = st.d.example, state = st.d.state, pct = Math.round((st.d.p || 0) * 100);
  const canLearn = ["soon", "locked"].indexOf(state) < 0;
  return (
    <div className="mlb-stack">
      <button type="button" className="mlb-back" onClick={() => go({ v: "map" })}><i className="ph ph-arrow-left" aria-hidden="true"/>Map</button>
      <section className="mlb-card mlb-topic">
        <p className="mlb-eyebrow">Stage {c.stage} · {c.stageTitle} · {c.id}</p>
        <h2 className="mlb-h2">{c.title}</h2>
        <p className="mlb-chip is-state">{MLB_STATE_L[state] || state}</p>
        {!lite && state !== "soon" ? <div className="mlb-ready"><span>How sure we are you know it</span><span className="mlb-meter is-big"><span style={{ width: pct + "%" }}/></span><b>{pct}%</b></div> : null}
        {c.needs.length ? <p className="mlb-meta">Builds on: {c.needs.map((n, i) => <React.Fragment key={n.id}>{i ? ", " : ""}<button type="button" className="mlb-link" onClick={() => go({ v: "learn", comp: n.id })}>{n.title}</button>{n.state === "soon" ? " (in preparation)" : ""}</React.Fragment>)}</p> : null}
        {state === "locked" ? <p className="mlb-warn">Locked: light up the topics it builds on first.</p> : null}
        {state === "soon" ? <p className="mlb-warn">This topic is being prepared and will open soon.</p> : null}
      </section>
      {ex ? <section className="mlb-card" aria-labelledby="mlb-we"><h3 id="mlb-we" className="mlb-h3">Worked example</h3>
        <MlbMath as="p" className="mlb-stem" text={ex.stem}/><MlbDiagram d={ex.diagram}/>
        {ex.lines ? <ol className="mlb-lines">{ex.lines.map((l, i) => <li key={i}><MlbMath text={l}/></li>)}</ol> : null}
        <ol className="mlb-steps">{ex.steps.slice(0, shown).map((s, i) => <li key={i}><MlbMath text={s}/></li>)}</ol>
        {shown < ex.steps.length ? <button type="button" className="stt-btn" onClick={() => setShown(n => n + 1)}>Next step</button> : <p className="mlb-ans">Answer: <MlbMath text={ex.answer}/></p>}
      </section> : null}
      {canLearn && !lite ? <div className="mlb-actions">
        <button type="button" className="mlb-go" onClick={() => startPlay({ mode: "practice", comp })}><i className="ph ph-pencil-line" aria-hidden="true"/>Practise</button>
        <button type="button" className="stt-btn" disabled={state !== "ready"} aria-describedby="mlb-chk-why" onClick={() => startPlay({ mode: "check", comp })}><i className="ph ph-seal-check" aria-hidden="true"/>Mastery check</button>
        <span id="mlb-chk-why" className="mlb-meta">{state === "ready" ? "10 questions, no hints. Pass at 85%." : MLB_GOOD_V.indexOf(state) >= 0 ? "Already lit — it comes back in your reviews." : "Unlocks when practice shows you are ready."}</span>
      </div> : null}
      {lite && canLearn ? <MlbLitePlay comp={comp}/> : null}
    </div>
  );
}

/* ── Answer entry ── */
const MLB_KEYS = { expr: ["x", "y", "^", "(", ")", "/", "−", "√("], num: ["−", ".", "/"], frac: ["/", "−"], ratio: [":"], pair: ["−"] };
function MlbInput({ item, value, onChange, onEnter, disabled }) {
  const ref = React.useRef(null);
  const ins = t => { const v = (value || "") + (t === "−" ? "-" : t === "√(" ? "sqrt(" : t); onChange(v); setTimeout(() => ref.current && ref.current.focus(), 0); };
  if (item.kind === "pair") {
    const v = Array.isArray(value) ? value : ["", ""];
    return <div className="mlb-pair">{(item.labels || ["x", "y"]).map((l, i) => <label key={l} className="mlb-pairf"><MlbMath text={"$" + l + " =$"}/>
      <input className="mlb-in" inputMode="decimal" value={v[i]} disabled={disabled} onChange={e => { const n = v.slice(); n[i] = e.target.value; onChange(n); }} onKeyDown={e => e.key === "Enter" && onEnter()} aria-label={l}/></label>)}</div>;
  }
  return (
    <div className="mlb-entry">
      <div className="mlb-inrow">{item.unit === "₦" ? <span className="mlb-unit">₦</span> : null}
        <input ref={ref} className="mlb-in" value={value || ""} disabled={disabled} inputMode={item.kind === "expr" ? "text" : "decimal"} autoComplete="off" autoCapitalize="off" spellCheck="false"
          placeholder={item.kind === "frac" ? "e.g. 3/4" : item.kind === "ratio" ? "e.g. 3:4" : item.kind === "expr" ? "e.g. 3x+2" : "Your answer"} aria-label="Your answer"
          onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === "Enter" && onEnter()}/>{item.unit && item.unit !== "₦" ? <span className="mlb-unit">{item.unit}</span> : null}</div>
      {item.kind === "expr" && value ? <p className="mlb-preview" aria-live="polite">Reads as: <MlbMath text={"$" + String(value).replace(/sqrt\(/g, "\\sqrt(").replace(/\*/g, "\\times ") + "$"}/></p> : null}
      <div className="mlb-keys">{(MLB_KEYS[item.kind] || []).map(k => <button key={k} type="button" className="mlb-key" disabled={disabled} onClick={() => ins(k)} aria-label={"Type " + k}>{k}</button>)}</div>
    </div>
  );
}

/* ── The player: one question per screen ── */
function MlbPlayer({ start, onDone, go }) {
  const [ses, setSes] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [i, setI] = React.useState(0);
  const [val, setVal] = React.useState("");
  const [conf, setConf] = React.useState("");
  const [hints, setHints] = React.useState(0);
  const [fb, setFb] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState(null);
  const t0 = React.useRef(Date.now());
  React.useEffect(() => { NGGApi.member.mathslab.start(start.mode, { comp: start.comp, stage: start.stage }).then(setSes, e => setErr(mlbErr(e))); }, []); // eslint-disable-line
  React.useEffect(() => { t0.current = Date.now(); }, [i]);
  if (err) return <SttState kind="error" text={err}><button type="button" className="stt-btn" onClick={onDone}>Back</button></SttState>;
  if (!ses) return <SttState kind="loading" text="Preparing your questions…"/>;
  if (res) return <MlbResult res={res} onDone={onDone} go={go}/>;
  const it = ses.items[i], practice = ses.mode === "practice", last = i === ses.items.length - 1;
  const empty = it.kind === "pair" ? !(Array.isArray(val) && val[0] && val[1]) : it.kind === "mcq" || it.kind === "error" ? val === "" : !String(val || "").trim();
  const finish = () => { setBusy(true); NGGApi.member.mathslab.finish(ses.sessionId).then(r => { setBusy(false); setRes(r); }, e => { setBusy(false); setErr(mlbErr(e)); }); };
  const next = () => { setFb(null); setVal(""); setConf(""); setHints(0); if (last) finish(); else setI(i + 1); };
  const submit = () => {
    if (empty || busy) return;
    setBusy(true);
    NGGApi.member.mathslab.answer(ses.sessionId, i, val, { ms: Date.now() - t0.current, hints, conf }).then(r => {
      setBusy(false);
      if (practice) setFb(r); else next();
    }, e => { setBusy(false); setErr(mlbErr(e)); });
  };
  const choice = it.kind === "mcq" || it.kind === "error";
  return (
    <div className="mlb-play" data-mode={ses.mode}>
      <div className="mlb-row"><p className="mlb-eyebrow">{ses.title}</p><button type="button" className="mlb-back" onClick={onDone}>Leave</button></div>
      <ol className="mlb-pips" aria-label={"Question " + (i + 1) + " of " + ses.items.length}>{ses.items.map((_, k) => <li key={k} className={k < i ? "is-done" : k === i ? "is-on" : ""}/>)}</ol>
      <section className="mlb-q" aria-live="polite">
        <p className="mlb-qn">Question {i + 1} of {ses.items.length}{ses.mode === "climb" ? " · fast and right clears the stage" : ""}</p>
        <MlbMath as="p" className="mlb-stem" text={it.stem}/>
        <MlbDiagram d={it.diagram}/>
        {it.lines ? <ol className="mlb-lines">{it.lines.map((l, k) => <li key={k}><MlbMath text={l}/></li>)}</ol> : null}
        {choice ? <div className="mlb-opts" role="radiogroup" aria-label="Choose an answer">{it.options.map((o, k) => (
          <button key={k} type="button" role="radio" aria-checked={val === k} disabled={!!fb} className={"mlb-opt" + (val === k ? " is-on" : "") + (fb && fb.answer === o ? " is-right" : "")} onClick={() => setVal(k)}>
            <span className="mlb-opt-l">{String.fromCharCode(65 + k)}</span><MlbMath text={o}/></button>))}</div>
          : <MlbInput item={it} value={val} onChange={setVal} onEnter={submit} disabled={!!fb}/>}
        {!fb ? <div className="mlb-conf" role="radiogroup" aria-label="How sure are you?"><span>How sure are you?</span>{[["sure", "Sure"], ["think", "Think so"], ["guess", "Guessing"]].map(([k, l]) =>
          <button key={k} type="button" role="radio" aria-checked={conf === k} className={"mlb-chipb" + (conf === k ? " is-on" : "")} onClick={() => setConf(k)}>{l}</button>)}</div> : null}
        {practice && !fb ? (hints ? <p className="mlb-hint"><i className="ph ph-lightbulb" aria-hidden="true"/><MlbMath text={it.hint}/></p>
          : <button type="button" className="mlb-link" onClick={() => setHints(1)}>Show a hint (earns less XP)</button>) : null}
        {fb ? <div className={"mlb-fb " + (fb.correct ? "is-ok" : "is-no")} role="status">
          <b>{fb.correct ? (conf === "guess" ? "Right — and you weren’t sure. Worth remembering why." : "Right!") : fb.formNote ? fb.formNote : (conf === "sure" ? "Not quite — and you were sure. That’s the most useful mistake to look at." : "Not quite.")}</b>
          {!fb.correct && fb.why ? <MlbMath as="p" text={fb.why}/> : null}
          <p>Answer: <MlbMath text={fb.answer}/></p>
          <details open={!fb.correct}><summary>Worked solution</summary><ol className="mlb-steps">{fb.steps.map((s, k) => <li key={k}><MlbMath text={s}/></li>)}</ol></details>
          {fb.xp ? <p className="mlb-xp">+{fb.xp} XP</p> : null}
        </div> : null}
        <div className="mlb-actions">{fb ? <button type="button" className="mlb-go" onClick={next}>{last ? "See how you did" : "Next question"}</button>
          : <button type="button" className="mlb-go" disabled={empty || busy} onClick={submit}>{busy ? "Checking…" : practice ? "Check" : last ? "Submit" : "Next"}</button>}</div>
      </section>
    </div>
  );
}

function MlbResult({ res, onDone, go }) {
  return (
    <div className="mlb-stack">
      <section className={"mlb-hero mlb-result" + (res.pct >= 85 ? " is-win" : "")}>
        <div className="mlb-hero-sky" aria-hidden="true"/>
        <p className="mlb-eyebrow">{res.mode === "climb" ? "Gate" : res.mode === "check" ? "Mastery check" : res.mode === "boss" ? "Stage boss" : res.mode === "review" ? "Review" : "Practice"}</p>
        <h2 className="mlb-hero-h">{res.right} of {res.total}</h2>
        <p className="mlb-hero-p">{res.message}</p>
        {res.xp ? <p className="mlb-xp">+{res.xp} XP</p> : null}
        {res.changes.length ? <p className="mlb-hero-p">{res.changes.filter(c => MLB_GOOD_V.indexOf(c.to) >= 0).length} star{res.changes.filter(c => MLB_GOOD_V.indexOf(c.to) >= 0).length === 1 ? "" : "s"} lit.</p> : null}
        <div className="mlb-actions"><button type="button" className="mlb-go" onClick={onDone}>Continue</button><button type="button" className="stt-btn" onClick={() => go({ v: "map" })}>See the map</button></div>
      </section>
      <section className="mlb-card"><h3 className="mlb-h3">Every question, with its solution</h3>
        <ol className="mlb-rev">{res.review.map((q, k) => <li key={k} className={q.correct ? "is-ok" : "is-no"}>
          <MlbMath as="p" text={q.stem}/>{q.lines ? <ol className="mlb-lines">{q.lines.map((l, j) => <li key={j}><MlbMath text={l}/></li>)}</ol> : null}
          <p className="mlb-meta">{q.correct ? "Right" : "Answer"}: <MlbMath text={q.answer}/></p>
          {!q.correct ? <details><summary>Worked solution</summary><ol className="mlb-steps">{q.steps.map((s, j) => <li key={j}><MlbMath text={s}/></li>)}</ol></details> : null}
        </li>)}</ol></section>
    </div>
  );
}

/* ── Courses (Coursera-style) ── */
function MlbCourses({ go }) {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.home(), []);
  const [cert, setCert] = React.useState(null);
  if (cert) return <MlbCert cert={cert} onDone={() => setCert(null)}/>;
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load the courses. " + mlbErr(st.e)} retry={load}/>;
  const enrol = id => NGGApi.member.mathslab.enrol(id).then(load, () => {});
  return (
    <div className="mlb-courses">{st.d.courses.map(c => (
      <section key={c.id} className="mlb-card mlb-course">
        <p className="mlb-eyebrow">{c.for} · about {c.hours} hours · Stages {c.stages[0]}–{c.stages[c.stages.length - 1]}</p>
        <h3 className="mlb-h3">{c.title}</h3>
        <p className="mlb-p">{c.promise}</p>
        <div className="mlb-ready"><span>{c.done} of {c.total} topics</span><span className="mlb-meter is-big"><span style={{ width: c.pct + "%" }}/></span><b>{c.pct}%</b></div>
        <div className="mlb-actions">
          {!c.available ? <span className="mlb-chip">In preparation</span>
            : c.enrolled ? <button type="button" className="mlb-go" onClick={() => go({ v: "map" })}>Continue</button>
            : <button type="button" className="mlb-go" onClick={() => enrol(c.id)}>Enrol — free</button>}
          {c.complete ? <button type="button" className="stt-btn" onClick={() => NGGApi.member.mathslab.cert(c.id).then(setCert, () => {})}><i className="ph ph-certificate" aria-hidden="true"/>Certificate</button> : null}
        </div>
        {c.available ? <p className="mlb-meta">The certificate is earned when every topic is lit and every stage boss is defeated.</p> : null}
      </section>))}</div>
  );
}
function MlbCert({ cert, onDone }) {
  return (
    <div className="mlb-stack">
      <div className="mlb-cert" role="document">
        <p className="mlb-cert-k">Next Generation Genius · Maths Lab</p>
        <h2>Certificate of completion</h2>
        <p>This certifies that</p><p className="mlb-cert-n">{cert.name}</p>
        <p>has completed the course</p><p className="mlb-cert-c">{cert.course}</p>
        <p className="mlb-meta">{new Date(cert.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · Verification code {cert.code}</p>
      </div>
      <div className="mlb-actions"><button type="button" className="mlb-go" onClick={() => window.print()}>Print or save as PDF</button><button type="button" className="stt-btn" onClick={onDone}>Back</button></div>
    </div>
  );
}

/* ── Progress ── */
function MlbProgress() {
  const [st, load] = useMlb(() => NGGApi.member.mathslab.home(), []);
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load your progress. " + mlbErr(st.e)} retry={load}/>;
  const d = st.d;
  return (
    <div className="mlb-grid">
      <section className="mlb-card"><h3 className="mlb-h3">Stars lit</h3><p className="mlb-big">{d.counts.mastered}<small> of {d.counts.available} open</small></p></section>
      <section className="mlb-card"><h3 className="mlb-h3">Learning now</h3><p className="mlb-big">{d.counts.learning}</p></section>
      <section className="mlb-card"><h3 className="mlb-h3">Due for review</h3><p className="mlb-big">{d.counts.due}</p></section>
      <section className="mlb-card"><h3 className="mlb-h3">Level</h3><p className="mlb-big">{d.level.name}<small> · {d.xp} XP</small></p></section>
      <section className="mlb-card mlb-span"><h3 className="mlb-h3">Badges</h3><ul className="mlb-badges">{d.badges.map(b => <li key={b.id} className={b.earned ? "is-on" : ""}><i className={"ph " + (b.earned ? "ph-seal-check" : "ph-seal")} aria-hidden="true"/><b>{b.name}</b><span>{b.what}</span></li>)}</ul></section>
    </div>
  );
}

/* ── Maths Lab Lite (everyone) ── */
function MlbLite({ signedIn, route, go }) {
  return (
    <div className="mlb">
      <section className="mlb-hero">
        <div className="mlb-hero-sky" aria-hidden="true"/>
        <p className="mlb-eyebrow">Maths Lab Lite</p>
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
      {choice ? <div className="mlb-opts" role="radiogroup" aria-label="Choose an answer">{q.options.map((o, k) => <button key={k} type="button" role="radio" aria-checked={val === k} disabled={!!fb} className={"mlb-opt" + (val === k ? " is-on" : "")} onClick={() => setVal(k)}><span className="mlb-opt-l">{String.fromCharCode(65 + k)}</span><MlbMath text={o}/></button>)}</div>
        : <MlbInput item={q} value={val} onChange={setVal} onEnter={check} disabled={!!fb}/>}
      {fb ? <div className={"mlb-fb " + (fb.correct ? "is-ok" : "is-no")} role="status"><b>{fb.correct ? "Right!" : fb.formNote || "Not quite."}</b>{!fb.correct && fb.why ? <MlbMath as="p" text={fb.why}/> : null}
        <p>Answer: <MlbMath text={fb.answer}/></p><details open={!fb.correct}><summary>Worked solution</summary><ol className="mlb-steps">{fb.steps.map((s, k) => <li key={k}><MlbMath text={s}/></li>)}</ol></details></div> : null}
      <div className="mlb-actions">{fb ? <button type="button" className="mlb-go" onClick={load}>Another question</button> : <button type="button" className="mlb-go" disabled={empty} onClick={check}>Check</button>}</div>
    </section>
  );
}
