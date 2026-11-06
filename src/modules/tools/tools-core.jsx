/* ── Study tools (/study) — the shared parts ──────────────────────────────
 *
 * A member's own learning kit, in its own app (like the Anchor Journal):
 * flashcards with spaced repetition, a focus timer, typing practice, a
 * scientific calculator, a graph plotter and a dictionary. The server keeps
 * the flashcards and the logs (api/_lib/domain/study-tools.php); the
 * calculator, plotter and dictionary keep nothing.
 *
 * This file: the maths parser both the calculator and the plotter use, the
 * tool registry, the small shared pieces, and the app shell.
 */

/* ── A maths expression parser. Never eval(): a typed expression is tokenised,
 * turned into reverse Polish by the shunting-yard algorithm, and evaluated
 * over a fixed table of operators and functions. Anything else is an error
 * with a sentence the member can act on. */
const STT_FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sqrt: 1, cbrt: 1, abs: 1, ln: 1, log: 1, exp: 1,
  round: 1, floor: 1, ceil: 1, fact: 1, min: 2, max: 2, nroot: 2,
};
const STT_CONSTS = { pi: Math.PI, "π": Math.PI, e: Math.E };
function sttFact(n) {
  if (n < 0 || n !== Math.floor(n)) throw new Error("A factorial needs a whole number that is not negative.");
  if (n > 170) return Infinity;
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}
function sttTokens(src) {
  const s = String(src || "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      if (!m) throw new Error("“" + c + "” is not a number here.");
      out.push({ t: "n", v: parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if (/[a-zπ]/i.test(c)) {
      const m = s.slice(i).match(/^(π|[a-z]+)/i); const w = m[0].toLowerCase();
      if (STT_FUNCS[w] != null) out.push({ t: "f", v: w });
      else if (STT_CONSTS[w] != null) out.push({ t: "n", v: STT_CONSTS[w] });
      else if (w === "x" || w === "ans") out.push({ t: "v", v: w });
      else throw new Error("“" + m[0] + "” isn’t a function this calculator knows.");
      i += m[0].length; continue;
    }
    if ("+-*/^(),!%".includes(c)) { out.push({ t: "o", v: c }); i++; continue; }
    throw new Error("“" + c + "” can’t be used here.");
  }
  // Implicit multiplication: 2x, 2(3), (1)(2), 3pi, x sin(x).
  const res = [];
  for (let k = 0; k < out.length; k++) {
    const a = res[res.length - 1], b = out[k];
    const aEnds = a && (a.t === "n" || a.t === "v" || (a.t === "o" && (a.v === ")" || a.v === "!" || a.v === "%")));
    const bStarts = b.t === "n" || b.t === "v" || b.t === "f" || (b.t === "o" && b.v === "(");
    if (aEnds && bStarts) res.push({ t: "o", v: "*" });
    res.push(b);
  }
  return res;
}
const STT_PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "u": 3, "^": 4 };
function sttCompile(src) {
  const toks = sttTokens(src);
  if (!toks.length) throw new Error("Type something to work out.");
  const out = [], ops = []; let prev = null;
  for (const tk of toks) {
    if (tk.t === "n" || tk.t === "v") out.push(tk);
    else if (tk.t === "f") ops.push(tk);
    else if (tk.v === ",") { while (ops.length && ops[ops.length - 1].v !== "(") out.push(ops.pop()); }
    else if (tk.v === "(") ops.push(tk);
    else if (tk.v === ")") {
      while (ops.length && ops[ops.length - 1].v !== "(") out.push(ops.pop());
      if (!ops.length) throw new Error("There is a “)” with no “(” to match it.");
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === "f") out.push(ops.pop());
    } else if (tk.v === "!" || tk.v === "%") out.push({ t: "p", v: tk.v });
    else {
      let o = tk.v;
      const unary = (o === "-" || o === "+") && (!prev || (prev.t === "o" && prev.v !== ")" && prev.v !== "!" && prev.v !== "%") || prev.t === "f");
      if (unary) { if (o === "+") { prev = tk; continue; } o = "u"; }
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "f") { out.push(ops.pop()); continue; }
        const tp = STT_PREC[top.v];
        if (tp == null) break;
        const right = o === "^" || o === "u";
        if (tp > STT_PREC[o] || (tp === STT_PREC[o] && !right)) out.push(ops.pop()); else break;
      }
      ops.push({ t: "o", v: o });
    }
    prev = tk;
  }
  while (ops.length) { const o = ops.pop(); if (o.v === "(") throw new Error("A “(” is never closed."); out.push(o); }
  return out;
}
function sttRun(rpn, vars, deg) {
  const st = []; const ang = v => deg ? v * Math.PI / 180 : v; const inv = v => deg ? v * 180 / Math.PI : v;
  for (const tk of rpn) {
    if (tk.t === "n") st.push(tk.v);
    else if (tk.t === "v") { const v = vars && vars[tk.v]; if (v == null) throw new Error(tk.v === "x" ? "Use x in the graph plotter." : "There is no previous answer yet."); st.push(v); }
    else if (tk.t === "p") { if (!st.length) throw new Error("Put a number before “" + tk.v + "”."); const a = st.pop(); st.push(tk.v === "!" ? sttFact(a) : a / 100); }
    else if (tk.t === "f") {
      const n = STT_FUNCS[tk.v]; if (st.length < n) throw new Error(tk.v + "( ) needs " + (n === 2 ? "two numbers, like " + tk.v + "(2, 3)." : "a number inside the brackets."));
      const b = n === 2 ? st.pop() : 0, a = st.pop();
      const F = { sin: () => Math.sin(ang(a)), cos: () => Math.cos(ang(a)), tan: () => Math.tan(ang(a)), asin: () => inv(Math.asin(a)), acos: () => inv(Math.acos(a)), atan: () => inv(Math.atan(a)),
        sqrt: () => Math.sqrt(a), cbrt: () => Math.cbrt(a), abs: () => Math.abs(a), ln: () => Math.log(a), log: () => Math.log10(a), exp: () => Math.exp(a),
        round: () => Math.round(a), floor: () => Math.floor(a), ceil: () => Math.ceil(a), fact: () => sttFact(a), min: () => Math.min(a, b), max: () => Math.max(a, b), nroot: () => Math.pow(a, 1 / b) };
      st.push(F[tk.v]());
    } else {
      if (tk.v === "u") { if (!st.length) throw new Error("A minus sign needs a number after it."); st.push(-st.pop()); continue; }
      if (st.length < 2) throw new Error("“" + tk.v + "” needs a number on each side.");
      const b = st.pop(), a = st.pop();
      st.push(tk.v === "+" ? a + b : tk.v === "-" ? a - b : tk.v === "*" ? a * b : tk.v === "/" ? a / b : Math.pow(a, b));
    }
  }
  if (st.length !== 1) throw new Error("That isn’t a complete sum. Check for a missing sign between two numbers.");
  return st[0];
}
/** Evaluate an expression. Returns {ok, value} or {ok:false, error}. */
function sttEval(src, vars, deg) {
  try { return { ok: true, value: sttRun(sttCompile(src), vars, deg) }; }
  catch (e) { return { ok: false, error: e.message || "That can’t be worked out." }; }
}
/** A number as people write it: up to 10 significant figures, no float dust. */
function sttFormat(v) {
  if (v === Infinity || v === -Infinity) return v > 0 ? "∞" : "−∞";
  if (typeof v !== "number" || isNaN(v)) return "Not a number";
  if (v !== 0 && (Math.abs(v) >= 1e12 || Math.abs(v) < 1e-9)) return v.toExponential(8).replace(/\.?0+e/, "e");
  return String(parseFloat(v.toPrecision(10)));
}

/* ── The registry: one list, everything derived (tabs, sub-tools, paths,
 * titles). Similar tools live under one tab and hand work to each other: a
 * word looked up becomes a flashcard, a missed quiz question becomes a
 * flashcard, a sum with x in it is one press from its graph. */
/* The Labs, as the browser needs them: the client half of LABS in api/_lib/domain/labs.php (one
 * row per Lab, same ids and paths; tests/labs-client.test.js fails if the two disagree). Each is a
 * tab of the study page at /study/<seg> with its own deep addresses (/study/physics/learn/PH-023).
 * `exams`: it offers timed papers; `daily`: the name of its daily problem; `summit`: its top band. */
const NGG_LABS = [
  { id: "maths",   seg: "lab",     title: "Maths Lab",   subject: "Maths",   icon: "ph-function", exams: true,  daily: "Daily Olympiad Problem", summit: "Gods of Maths",
    sub: "Climb to your level, master every topic, keep it for good", level: "Olympiad level",
    road: "The 170-Point Mathematics Mastery Framework", roadP: "From why 1 + 1 = 2 to senior school, Further Mathematics and beyond — then the Gods of Maths summit, where olympiad problems are won by ideas. Learn why things are true, one foundation at a time.",
    dailyP: "One olympiad problem a day, the same for everyone in NGG. Tough — but the hint is free and you get three tries." },
  { id: "physics", seg: "physics", title: "Physics Lab", subject: "Physics", icon: "ph-atom",     exams: true,  daily: "Daily Physics Puzzle",   summit: "Electricity and the atom",
    sub: "See it move, then work it out: forces, motion, energy, waves, light and electricity", level: "Top of the road",
    road: "The Physics road", roadP: "From measuring and forces in JSS Basic Science to senior secondary Physics: motion, energy, heat, waves, light, electricity and the atom. Every topic has something to play with before you calculate anything.",
    dailyP: "One puzzle a day from the top of the Physics road, the same for everyone in NGG. The hint is free and you get three tries." },
  { id: "english", seg: "english", title: "English Lab", subject: "English", icon: "ph-book-open-text", exams: true, daily: "Daily Word Challenge", summit: "Writing well",
    sub: "Words, grammar, speech work, reading and writing — one short step at a time", level: "Top of the road",
    road: "The English road", roadP: "From nouns, tenses and full stops in JSS English Studies to senior secondary English Language: the sounds of English, grammar in use, comprehension, summary and writing well. Every wrong option tells you which slip it is.",
    dailyP: "One challenge a day from the top of the English road, the same for everyone in NGG. The hint is free and you get three tries." },
];
/* The study app's own navigation (owner, 6 Nov 2026: "the in-app navigation is a bit illogical").
   It used to be seven tabs in one row: Today, Revise, Maths, Words, Maths Lab, Physics Lab, Course
   labs. "Maths" (a calculator) sat beside "Maths Lab" (a course), and "Course labs" beside the Labs.
   Now there are four tabs, each named for what you came to do:
     Today   the focus timer and your week
     Labs    every subject Lab (Maths, Physics, the next one), plus the course tools
     Revise  flashcards, quizzes, notes
     Tools   calculator, graphs, number bases, dictionary, typing
   A subject Lab keeps its own deep addresses (/study/lab/learn/MC-049) and is `hidden` from the row:
   while you are in one, the Labs tab is lit (`parent`). */
const STT_TOOLS = [
  { id: "home",   label: "Today",       icon: "ph-sun-horizon",  account: false, sub: "Focus timer, your week and what’s due",
    subs: [] },
  { id: "labs",   label: "Labs",        icon: "ph-flask",        account: false, sub: "Climb a subject to your level, one topic at a time",
    subs: [["subjects", "Subject Labs"], ["course", "Course tools"]] },
  { id: "revise", label: "Revise",      icon: "ph-cards",        account: true,  sub: "Flashcards, quizzes and notes — remember more",
    subs: [["cards", "Flashcards"], ["quiz", "Quiz me"], ["notes", "Summarise notes"]] },
  { id: "tools",  label: "Tools",       icon: "ph-toolbox",      account: false, sub: "Calculator, graphs, number bases, dictionary and typing",
    subs: [["calc", "Calculator"], ["graph", "Graphs"], ["bases", "Number bases"], ["dict", "Dictionary"], ["typing", "Typing"]] },
  /* The Labs (docs/LABS.md): each has its own screens, so it keeps its deeper addresses
     (/study/lab/learn/MC-049, /study/physics/map) — `deep` stops the shell rewriting them. */
  ...NGG_LABS.map(l => ({ id: l.seg, label: l.title, icon: l.icon, account: false, deep: true, hidden: true, parent: "labs", sub: l.sub, subs: [], lab: l.id })),
];
const STT_IDS = STT_TOOLS.map(t => t.id);
const STT_TABS = STT_TOOLS.filter(t => !t.hidden);
/* Addresses the tools had before they moved: still in bookmarks and links. [tool, sub] — a sub of
   "" means "the second segment of the old address, if it names one, else the first sub". */
const STT_ALIASES = { cards: ["revise", "cards"], ai: ["revise", "quiz"], focus: ["home", ""], typing: ["tools", "typing"], calc: ["tools", "calc"], graph: ["tools", "graph"], dict: ["tools", "dict"],
  maths: ["tools", "calc", ["calc", "graph", "bases"]], words: ["tools", "dict", ["dict", "typing"]] };
function sttRoute() {
  const seg = (typeof location !== "undefined" ? location.pathname : "").replace(/^\/+|\/+$/g, "").split("/");
  if (seg[0] !== "study") return { tool: "home", sub: "" };
  const al = STT_ALIASES[seg[1]];
  if (al) return { tool: al[0], sub: al[2] && al[2].includes(seg[2]) ? seg[2] : al[1] };
  const tool = STT_IDS.includes(seg[1]) ? seg[1] : "home";
  const def = STT_TOOLS.find(t => t.id === tool);
  const sub = def.subs.some(x => x[0] === seg[2]) ? seg[2] : (def.subs[0] ? def.subs[0][0] : "");
  return { tool, sub };
}
function sttPath(tool, sub) {
  const def = STT_TOOLS.find(t => t.id === tool);
  return "/study" + (tool === "home" ? "" : "/" + tool + (sub && def.subs[0] && sub !== def.subs[0][0] ? "/" + sub : ""));
}
/** Move to a tool from anywhere inside the app (a dictionary word → flashcards, a sum → its graph). */
function sttGo(tool, sub, data) {
  try { window.__sttHandoff = data || null; window.dispatchEvent(new CustomEvent("stt:go", { detail: { tool, sub } })); } catch (_) {}
}
function sttTakeHandoff() { const d = window.__sttHandoff; window.__sttHandoff = null; return d || null; }
function sttErr(e) {
  const c = e && (e.code || e.message);
  const T = { network: "You’re offline. Try again when you’re connected.", daily_limit: "You’ve used today’s study-helper allowance. It resets tomorrow.",
    ai_disabled: "The study helper isn’t switched on here yet.", ai_no_cards: "The study helper couldn’t make cards from that lesson. Try another, or write your own.",
    too_many_decks: "You have the most decks you can keep. Delete one you’ve finished with.", too_many_cards: "A deck holds at most 500 cards.",
    not_ngg_member: "Making cards from a lesson is for NGG members.", unauthorized: "Sign in again to save your work.", daily_limit_log: "That’s a lot for one day!" };
  return T[c] || (e && e.detail) || "That didn’t work. Try again.";
}
/** Loading, empty and error-with-retry: the three states every panel has. */
function SttState({ kind, text, retry, children }) {
  if (kind === "loading") return <div className="stt-state" aria-busy="true" role="status"><span className="stt-spin" aria-hidden="true"/>{text || "Loading…"}</div>;
  if (kind === "error") return <div className="stt-state is-error" role="alert"><p>{text}</p>{retry && <button type="button" className="stt-btn" onClick={retry}>Try again</button>}</div>;
  return <div className="stt-state is-empty">{text ? <p>{text}</p> : null}{children}</div>;
}

/* ── The app shell ─────────────────────────────────────────────────────── */
function ToolsApp({ setPage }) {
  const [route, setRoute] = React.useState(sttRoute);
  const tool = route.tool, sub = route.sub;
  const auth = useAuth();
  const [me, setMe] = React.useState({ phase: "loading" });
  // Asked again when the sign-in modal changes who is signed in.
  React.useEffect(() => {
    NGGApi.auth.me().then(r => setMe({ phase: "ok", member: (r && r.member) || null }), () => setMe({ phase: "ok", member: null }));
  }, [auth && auth.isSignedIn]);
  const go = React.useCallback((id, s2) => {
    const def0 = STT_TOOLS.find(t => t.id === id) || STT_TOOLS[0];
    const nsub = s2 && def0.subs.some(x => x[0] === s2) ? s2 : (def0.subs[0] ? def0.subs[0][0] : "");
    setRoute({ tool: def0.id, sub: nsub });
    try { history.pushState({ page: "study" }, "", sttPath(def0.id, nsub)); } catch (_) {}
    try { window.scrollTo(0, 0); } catch (_) {}
  }, []);
  React.useEffect(() => {
    const on = () => setRoute(sttRoute());
    const jump = e => go(e.detail.tool, e.detail.sub);
    window.addEventListener("popstate", on); window.addEventListener("stt:go", jump);
    // An old address is rewritten to the one it now lives at.
    try { const want = sttPath(route.tool, route.sub); const deep = (STT_TOOLS.find(t => t.id === route.tool) || {}).deep && location.pathname.indexOf(want) === 0; if (location.pathname !== want && !deep && !/^\/study\/?$/.test(location.pathname)) history.replaceState({ page: "study" }, "", want); } catch (_) {}
    return () => { window.removeEventListener("popstate", on); window.removeEventListener("stt:go", jump); };
  }, [go]); // eslint-disable-line
  const def = STT_TOOLS.find(t => t.id === tool) || STT_TOOLS[0];
  const subDef = def.subs.find(x => x[0] === sub);
  const tabOn = def.parent || def.id;   // a subject Lab lights the Labs tab
  React.useEffect(() => { try { document.title = (subDef ? subDef[1] : def.label) + " · Study tools · NGG"; } catch (_) {} }, [def, subDef]);
  const signedIn = me.phase === "ok" && !!me.member;
  // Arrow keys move along a tab row and focus goes with them (roving tabindex), Home and End to either end.
  const rowKey = (ids, cur, pick, prefix) => e => {
    const i = ids.indexOf(cur), n = ids.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault(); pick(ids[to]);
    setTimeout(() => { const btn = document.getElementById(prefix + ids[to]); if (btn) btn.focus(); }, 0);
  };
  const needsAccount = def.account && me.phase === "ok" && !signedIn;
  const subIds = def.subs.map(x => x[0]);
  return (
    <div className="stt-app" data-screen-label="Study tools">
      <header className="stt-top">
        <a className="stt-brand" href="/dashboard" onClick={e => { e.preventDefault(); setPage("dashboard"); }}>
          <i className="ph ph-arrow-left" aria-hidden="true"/><span>My NGG</span>
        </a>
        <h1 className="stt-h1">Study tools</h1>
        <span className="stt-who">{signedIn ? (me.member.fullName || "").split(" ")[0] : ""}</span>
      </header>
      <nav className="stt-tabs" role="tablist" aria-label="Study tools" onKeyDown={rowKey(STT_TABS.map(t => t.id), tabOn, id => go(id), "stt-tab-")}>
        {STT_TABS.map(t => (
          <button key={t.id} type="button" role="tab" id={"stt-tab-" + t.id} aria-selected={t.id === tabOn} aria-controls="stt-panel" tabIndex={t.id === tabOn ? 0 : -1}
            className={"stt-tab" + (t.id === tabOn ? " is-on" : "")} onClick={() => go(t.id)}>
            <i className={"ph " + t.icon} aria-hidden="true"/><span>{t.label}</span>
          </button>
        ))}
      </nav>
      <main id="stt-panel" className="stt-panel" role="tabpanel" aria-labelledby={"stt-tab-" + tool}>
        {def.parent ? <button type="button" className="stt-back" onClick={() => go(def.parent)}><i className="ph ph-arrow-left" aria-hidden="true"/>All Labs</button> : null}
        <div className="stt-panel-h"><h2 className="stt-h2">{def.label}</h2><p className="stt-sub">{def.sub}</p></div>
        {def.subs.length > 1 && !needsAccount ? (
          <div className="stt-subtabs" role="tablist" aria-label={def.label} onKeyDown={rowKey(subIds, sub, s2 => go(tool, s2), "stt-sub-")}>
            {def.subs.map(([id, l]) => <button key={id} type="button" role="tab" id={"stt-sub-" + id} aria-selected={id === sub} tabIndex={id === sub ? 0 : -1}
              className={"stt-chip" + (id === sub ? " is-on" : "")} onClick={() => go(tool, id)}>{l}</button>)}
          </div>
        ) : null}
        {me.phase === "loading" && def.account ? <SttState kind="loading"/>
          : needsAccount ? <SttState kind="empty" text="Sign in to keep flashcards, take quizzes and see your week. The focus timer, the Labs and the tools work without an account.">
              <button type="button" className="stt-btn is-go" onClick={() => auth && auth.openSignIn && auth.openSignIn()}>Sign in</button></SttState>
          : tool === "home" ? <SttToday go={go} signedIn={signedIn}/>
          : tool === "revise" ? (sub === "quiz" ? <SttQuiz/> : sub === "notes" ? <SttNotes/> : <SttFlashcards/>)
          : tool === "tools" ? (sub === "graph" ? <SttGraph/> : sub === "bases" ? <SttBases/> : sub === "typing" ? <SttTyping signedIn={signedIn}/> : sub === "dict" ? <SttDict signedIn={signedIn}/> : <SttCalc/>)
          : def.lab ? <MathsLab key={def.lab} me={me}/>
          : tool === "labs" && sub === "course" ? <SttLabs/>
          : <SttLabHub go={go}/>}
      </main>
    </div>
  );
}

/* ── Labs: one door to every subject Lab ─────────────────────────────────
   Generated from NGG_LABS, so a new Lab (English is next) appears here, in the portal's
   "Labs" link and in the Lab registry test at once — never typed into a second list. */
function SttLabHub({ go }) {
  return <div className="stt-hub">
    <ul className="stt-hub-list">{NGG_LABS.map(l => <li key={l.id}>
      <button type="button" className="stt-hub-card" onClick={() => go(l.seg)}>
        <i className={"ph " + l.icon + " stt-hub-i"} aria-hidden="true"/>
        <span className="stt-hub-tx"><b>{l.title}</b><span>{l.sub}</span><span className="stt-hub-meta">{l.daily}{l.exams ? " · timed exam practice" : ""}</span></span>
        <i className="ph ph-arrow-right" aria-hidden="true"/>
      </button></li>)}</ul>
    <p className="stt-hub-more">Learning a course at NGG — Tech, Creative, Media or Business? Its practical tools are under <button type="button" className="stt-link" onClick={() => go("labs", "course")}>Course tools</button>.</p>
  </div>;
}

/* ── Today: the focus timer, with the week beside it ─────────────────── */
function SttToday({ go, signedIn }) {
  const [bump, setBump] = React.useState(0);           // a finished block refreshes the week
  return (
    <div className="stt-today">
      <SttFocus signedIn={signedIn} onLogged={() => setBump(n => n + 1)}/>
      {signedIn ? <SttOverview key={bump} go={go}/> : <SttState kind="empty" text="Sign in to see your week of study, your streak and the flashcards that are due."/>}
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────── */
function SttOverview({ go }) {
  const [st, setSt] = React.useState({ phase: "loading" });
  const load = React.useCallback(() => {
    setSt({ phase: "loading" });
    Promise.all([NGGApi.member.tools.stats(), NGGApi.member.tools.decks()]).then(([s, d]) => setSt({ phase: "ok", s, d }), e => setSt({ phase: "error", e }));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load your week. " + sttErr(st.e)} retry={load}/>;
  const s = st.s, due = (st.d.decks || []).reduce((a, x) => a + x.due, 0), max = Math.max(25, ...s.week.map(w => w.minutes));
  const dayName = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short" });
  return (
    <div className="stt-grid">
      <section className="stt-card" aria-labelledby="stt-wk-h">
        <h3 id="stt-wk-h" className="stt-h3">Focus this week</h3>
        <p className="stt-big">{s.focusWeek} <small>minutes</small></p>
        <div className="stt-bars" role="img" aria-label={"Focus minutes by day: " + s.week.map(w => dayName(w.day) + " " + w.minutes).join(", ")}>
          {s.week.map(w => <div key={w.day} className="stt-bar"><span className="stt-bar-fill" style={{ height: Math.round(w.minutes / max * 100) + "%" }}/><small>{dayName(w.day)}</small></div>)}
        </div>
      </section>
      <section className="stt-card" aria-labelledby="stt-st-h">
        <h3 id="stt-st-h" className="stt-h3">Study streak</h3>
        <p className="stt-big">{s.streak} <small>{s.streak === 1 ? "day" : "days"}</small></p>
        <p className="stt-p">{s.streak ? "Any focus block, typing run or flashcard review keeps it going." : "Study today to start a streak."}</p>
      </section>
      <section className="stt-card" aria-labelledby="stt-fc-h">
        <h3 id="stt-fc-h" className="stt-h3">Flashcards</h3>
        <p className="stt-big">{due} <small>due now</small></p>
        <p className="stt-p">{s.cardsWeek} reviewed this week · {(st.d.decks || []).length} {(st.d.decks || []).length === 1 ? "deck" : "decks"}</p>
        <button type="button" className="stt-btn" onClick={() => go("revise", "cards")}>{due ? "Review now" : "Open flashcards"}</button>
      </section>
      <section className="stt-card" aria-labelledby="stt-ty-h">
        <h3 id="stt-ty-h" className="stt-h3">Typing</h3>
        <p className="stt-big">{s.typing.best} <small>words a minute, best</small></p>
        <p className="stt-p">{s.typing.runs ? s.typing.runs + " runs" : "No runs yet"}</p>
        <button type="button" className="stt-btn" onClick={() => go("tools", "typing")}>Practise</button>
      </section>
    </div>
  );
}

/* ── Flashcards ───────────────────────────────────────────────────────── */
function SttFlashcards() {
  const [view, setView] = React.useState({ k: "list" });           // list | edit {deckId?, draft?} | study {deckId}
  const [st, setSt] = React.useState({ phase: "loading" });
  const load = React.useCallback(() => {
    setSt({ phase: "loading" });
    NGGApi.member.tools.decks().then(r => setSt({ phase: "ok", decks: r.decks || [] }), e => setSt({ phase: "error", e }));
  }, []);
  React.useEffect(() => { if (view.k === "list") load(); }, [view.k, load]);
  if (view.k === "edit") return <SttDeckEditor deckId={view.deckId} draft={view.draft} onDone={() => setView({ k: "list" })}/>;
  if (view.k === "study") return <SttStudy deckId={view.deckId} onDone={() => setView({ k: "list" })}/>;
  if (view.k === "lesson") return <SttFromLesson onDraft={d => setView({ k: "edit", draft: d })} onCancel={() => setView({ k: "list" })}/>;
  return (
    <div className="stt-stack">
      <div className="stt-row">
        <button type="button" className="stt-btn is-go" onClick={() => setView({ k: "edit" })}><i className="ph ph-plus" aria-hidden="true"/>New deck</button>
        <button type="button" className="stt-btn" onClick={() => setView({ k: "lesson" })}><i className="ph ph-sparkle" aria-hidden="true"/>Make from a lesson</button>
      </div>
      {st.phase === "loading" ? <SttState kind="loading"/>
        : st.phase === "error" ? <SttState kind="error" text={"Couldn’t load your decks. " + sttErr(st.e)} retry={load}/>
        : !st.decks.length ? <SttState kind="empty" text="No decks yet. Make one for a test that’s coming up — new words, formulas, dates — and review a few cards every day."/>
        : <ul className="stt-decks" aria-label="Your decks">
            {st.decks.map(d => (
              <li key={d.deckId} className="stt-deck">
                <div className="stt-deck-main">
                  <b className="stt-deck-name">{d.name}</b>
                  <span className="stt-meta">{d.cards} {d.cards === 1 ? "card" : "cards"}{d.source ? " · " + d.source : ""}</span>
                </div>
                <span className={"stt-due" + (d.due ? " is-due" : "")} aria-label={d.due + " due now"}>{d.due} due</span>
                <button type="button" className="stt-btn is-go" disabled={!d.due} onClick={() => setView({ k: "study", deckId: d.deckId })}
                  title={d.due ? "" : "Nothing is due. Come back later — that is how it works."}>Review</button>
                <button type="button" className="stt-btn" onClick={() => setView({ k: "edit", deckId: d.deckId })} aria-label={"Edit " + d.name}>Edit</button>
              </li>
            ))}
          </ul>}
      <p className="stt-fine">Cards you know come back after days, then weeks. Cards you miss come back today. A few minutes every day beats an hour the night before.</p>
    </div>
  );
}

function SttDeckEditor({ deckId, draft, onDone }) {
  const blank = () => ({ cardId: "", front: "", back: "" });
  const [st, setSt] = React.useState(deckId ? { phase: "loading" } : { phase: "ok" });
  const [name, setName] = React.useState(draft ? draft.name : "");
  const [cards, setCards] = React.useState(draft ? draft.cards.map(c => Object.assign(blank(), c)) : [blank(), blank(), blank()]);
  const [paste, setPaste] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => {
    if (!deckId) return;
    setSt({ phase: "loading" });
    NGGApi.member.tools.deck(deckId).then(r => { setName(r.deck.name); setCards(r.cards.length ? r.cards : [blank()]); setSt({ phase: "ok" }); }, e => setSt({ phase: "error", e }));
  }, [deckId]);
  React.useEffect(() => { load(); }, [load]);
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t open the deck. " + sttErr(st.e)} retry={load}/>;
  const set = (i, k, v) => setCards(cs => cs.map((c, j) => j === i ? Object.assign({}, c, { [k]: v }) : c));
  const addPasted = () => {
    const rows = paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(/\t|\s+[—–=]\s+|\s+-\s+|\s*::\s*|:\s+/)).filter(p => p.length >= 2 && p[0].trim() && p.slice(1).join(" ").trim());
    if (!rows.length) { setErr("Nothing to add. Write one card a line, like:  Photosynthesis — how plants make food from light"); return; }
    setCards(cs => cs.filter(c => c.front || c.back).concat(rows.map(p => ({ cardId: "", front: p[0].trim(), back: p.slice(1).join(" ").trim() }))));
    setPaste(""); setErr("");
  };
  const save = async () => {
    setErr(""); setBusy(true);
    try { await NGGApi.member.tools.save({ deckId: deckId || "", name, source: draft ? draft.source : "", cards }); onDone(); }
    catch (e) { setErr(sttErr(e)); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!deckId || !(await dialog.confirm({ title: "Delete “" + name + "”?", body: "Its cards and their progress go too. This cannot be undone.", cta: "Delete deck", danger: true }))) return;
    setBusy(true);
    try { await NGGApi.member.tools.remove(deckId); onDone(); } catch (e) { setErr(sttErr(e)); setBusy(false); }
  };
  const filled = cards.filter(c => c.front.trim() || c.back.trim()).length;
  return (
    <div className="stt-stack">
      <button type="button" className="stt-link" onClick={onDone}><i className="ph ph-arrow-left" aria-hidden="true"/>All decks</button>
      <label className="stt-label" htmlFor="stt-deck-name">Deck name</label>
      <input id="stt-deck-name" className="stt-input" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="e.g. Biology: cells"/>
      <div className="stt-cards-edit" role="group" aria-label="Cards">
        {cards.map((c, i) => (
          <div key={i} className="stt-card-row">
            <span className="stt-num" aria-hidden="true">{i + 1}</span>
            <label className="stt-sr" htmlFor={"stt-f-" + i}>Card {i + 1} front</label>
            <textarea id={"stt-f-" + i} className="stt-input" rows={2} maxLength={600} value={c.front} onChange={e => set(i, "front", e.target.value)} placeholder="Front: a question or a word"/>
            <label className="stt-sr" htmlFor={"stt-b-" + i}>Card {i + 1} back</label>
            <textarea id={"stt-b-" + i} className="stt-input" rows={2} maxLength={600} value={c.back} onChange={e => set(i, "back", e.target.value)} placeholder="Back: the answer"/>
            <button type="button" className="stt-icon" aria-label={"Remove card " + (i + 1)} onClick={() => setCards(cs => cs.filter((_, j) => j !== i))}><i className="ph ph-trash" aria-hidden="true"/></button>
          </div>
        ))}
        <button type="button" className="stt-btn" onClick={() => setCards(cs => cs.concat([blank()]))}><i className="ph ph-plus" aria-hidden="true"/>Add a card</button>
      </div>
      <details className="stt-details">
        <summary>Paste many cards at once</summary>
        <label className="stt-label" htmlFor="stt-paste">One card a line: front — back</label>
        <textarea id="stt-paste" className="stt-input" rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={"Mitochondria — where the cell makes energy\nNucleus — holds the cell’s DNA"}/>
        <button type="button" className="stt-btn" onClick={addPasted} disabled={!paste.trim()}>Add these cards</button>
      </details>
      {err && <p className="stt-err" role="alert">{err}</p>}
      <div className="stt-row">
        <button type="button" className="stt-btn is-go" onClick={save} disabled={busy || !name.trim() || !filled}>{busy ? "Saving…" : "Save " + filled + " " + (filled === 1 ? "card" : "cards")}</button>
        {deckId && <button type="button" className="stt-btn is-danger" onClick={del} disabled={busy}>Delete deck</button>}
      </div>
    </div>
  );
}

function SttFromLesson({ onDraft, onCancel }) {
  const [st, setSt] = React.useState({ phase: "loading" });
  const [pick, setPick] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => {
    setSt({ phase: "loading" });
    NGGApi.member.tools.lessons().then(r => { setSt({ phase: "ok", r }); if (r.lessons[0]) setPick(r.lessons[0].unitId); }, e => setSt({ phase: "error", e }));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load your lessons. " + sttErr(st.e)} retry={load}/>;
  if (!st.r.lessons.length) return <SttState kind="empty" text="No lessons yet. When your course has lessons, you can turn any of them into a deck here."><button type="button" className="stt-btn" onClick={onCancel}>Back</button></SttState>;
  if (!st.r.ai) return <SttState kind="empty" text="The study helper isn’t switched on here yet, so it can’t write cards. You can still make a deck by hand."><button type="button" className="stt-btn" onClick={onCancel}>Back</button></SttState>;
  const make = async () => {
    setErr(""); setBusy(true);
    try { const r = await NGGApi.member.tools.aiCards(pick); onDraft({ name: r.name, source: r.source, cards: r.cards }); }
    catch (e) { setErr(sttErr(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="stt-stack">
      <button type="button" className="stt-link" onClick={onCancel}><i className="ph ph-arrow-left" aria-hidden="true"/>All decks</button>
      <p className="stt-p">Pick one of your lessons. The study helper writes about twelve cards on its key ideas; you check them, change any you like, then save.</p>
      <label className="stt-label" htmlFor="stt-lesson">Lesson</label>
      <select id="stt-lesson" className="stt-input stt-select" value={pick} onChange={e => setPick(e.target.value)}>
        {st.r.lessons.map(l => <option key={l.unitId} value={l.unitId}>{l.course} · {l.title}</option>)}
      </select>
      {err && <p className="stt-err" role="alert">{err}</p>}
      <button type="button" className="stt-btn is-go" onClick={make} disabled={busy || !pick} aria-busy={busy}>{busy ? "Writing the cards…" : "Make the cards"}</button>
      <p className="stt-fine">This uses one of today’s study-helper questions.</p>
    </div>
  );
}

function SttStudy({ deckId, onDone }) {
  const [st, setSt] = React.useState({ phase: "loading" });
  const [i, setI] = React.useState(0);
  const [shown, setShown] = React.useState(false);
  const [tally, setTally] = React.useState({ again: 0, done: 0 });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const queue = React.useRef([]);
  const logged = React.useRef(false);
  const load = React.useCallback(() => {
    setSt({ phase: "loading" });
    NGGApi.member.tools.due(deckId).then(r => { queue.current = r.cards.slice(); setI(0); setShown(false); setSt({ phase: "ok", r }); }, e => setSt({ phase: "error", e }));
  }, [deckId]);
  React.useEffect(() => { load(); }, [load]);
  const card = st.phase === "ok" ? queue.current[i] : null;
  const finished = st.phase === "ok" && !card;
  React.useEffect(() => {
    if (finished && tally.done && !logged.current) { logged.current = true; NGGApi.member.tools.log({ tool: "cards", cards: tally.done, label: st.r.deck.name }).catch(() => {}); }
  }, [finished]); // eslint-disable-line
  const grade = async g => {
    if (!card || busy) return;
    setBusy(true); setErr("");
    try {
      await NGGApi.member.tools.review(card.cardId, g);
      // "Again" comes back at the end of this session, too.
      if (g === 0) { queue.current.push(card); setTally(t => ({ again: t.again + 1, done: t.done })); }
      else setTally(t => ({ again: t.again, done: t.done + 1 }));
      setI(n => n + 1); setShown(false);
    } catch (e) { setErr(sttErr(e)); }
    finally { setBusy(false); }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (!card) return;
      if (!shown && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setShown(true); }
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); grade(Number(e.key) - 1); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  if (st.phase === "loading") return <SttState kind="loading"/>;
  if (st.phase === "error") return <SttState kind="error" text={"Couldn’t load the cards. " + sttErr(st.e)} retry={load}/>;
  if (finished) return (
    <div className="stt-stack">
      <SttState kind="empty" text={tally.done ? "Done: " + tally.done + " " + (tally.done === 1 ? "card" : "cards") + " reviewed" + (tally.again ? ", " + tally.again + " to look at again" : "") + ". " + (st.r.next ? "The next ones are due " + new Date(st.r.next).toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" }) + "." : "")
        : "Nothing is due in this deck right now. Come back later."}>
        <button type="button" className="stt-btn is-go" onClick={onDone}>Back to decks</button>
      </SttState>
    </div>
  );
  const left = queue.current.length - i;
  return (
    <div className="stt-stack">
      <div className="stt-row stt-row-split">
        <button type="button" className="stt-link" onClick={onDone}><i className="ph ph-arrow-left" aria-hidden="true"/>{st.r.deck.name}</button>
        <span className="stt-meta" aria-live="polite">{left} to go{card.isNew ? " · new card" : ""}</span>
      </div>
      <div className={"stt-flash" + (shown ? " is-shown" : "")}>
        <p className="stt-flash-front">{card.front}</p>
        {shown ? <p className="stt-flash-back" aria-live="polite">{card.back}</p> : null}
      </div>
      {err && <p className="stt-err" role="alert">{err}</p>}
      {!shown ? <button type="button" className="stt-btn is-go stt-wide" onClick={() => setShown(true)}>Show the answer <kbd>Space</kbd></button>
        : <div className="stt-grades" role="group" aria-label="How well did you know it?">
            {[["Again", "I didn’t know it"], ["Hard", "I struggled"], ["Good", "I knew it"], ["Easy", "Too easy"]].map(([l, d], g) => (
              <button key={l} type="button" className={"stt-grade is-g" + g} onClick={() => grade(g)} disabled={busy} aria-label={l + ": " + d}>
                <b>{l}</b><small>{d}</small><kbd>{g + 1}</kbd>
              </button>
            ))}
          </div>}
    </div>
  );
}

Object.assign(window, { ToolsApp, sttEval, sttFormat, sttCompile, sttRun, STT_TOOLS });
