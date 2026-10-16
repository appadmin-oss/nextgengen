/* ============================================================================
   ID Card Studio — print from a prompt.

   "New cards for Egbeda members, front and back" → the server reads it into a
   PLAN (admin.ids.plan: an AI provider when a key is set, the studio's rules
   always), and the studio applies the plan to what it already shows: the
   records it selects, the sheet settings it changes. Nothing is printed and
   nothing is written until the operator presses Print on the result, which
   names what was understood, the count and the sheet, so the count is read
   before the press (CLAUDE.md §6). Undo puts the sheet back as it was before
   the first plan.

   A plan on screen is a conversation: the next request ("fronts only", "only
   Ijaiye", "add 026-010", "not Ada") is sent with it and adjusts it, and each
   thing the studio understood is a chip whose × takes it out on the spot.

   idsPlanSelect is pure: the plan and the studio's lists in, the selection
   and everything left out (no photo, not found, already carded, left out as
   asked) out.
   ========================================================================== */

const IDS_ASK_EXAMPLES = [
  "New cards for every member at Egbeda, front and back",
  "Reprint 026-003 and 026-014",
  "Summer School participants who registered this week, proof on A4",
  "Volunteers, fronts only, by name",
];
const IDS_ASK_REFINE_HINT = "Change it — “fronts only”, “only Ijaiye”, “add 026-010”, “not Ada”…";
const IDS_ASK_PICK_MAX = 600;   // one run's ceiling (IDS_BATCH_MAX on the server)
const IDS_ASK_NAME_AMBIGUOUS = 3;
const IDS_ASK_RECENT_KEY = "ngg.ids.ask.recent";
const IDS_ASK_RECENT_MAX = 6;
const IDS_ASK_PROVIDER = { openai: "OpenAI", anthropic: "Claude", gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter" };

/* Recent requests, this browser only: a convenience, so a storage that is
   blocked or full simply means none are kept. */
function idsAskRecent() { try { const v = JSON.parse(localStorage.getItem(IDS_ASK_RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, IDS_ASK_RECENT_MAX) : []; } catch (_) { return []; } }
function idsAskRemember(text) {
  const list = [text].concat(idsAskRecent().filter(x => x.toLowerCase() !== text.toLowerCase())).slice(0, IDS_ASK_RECENT_MAX);
  try { localStorage.setItem(IDS_ASK_RECENT_KEY, JSON.stringify(list)); } catch (_) {}
  return list;
}

/** Edit distance, for a misspelt name. Short strings only. */
function idsLev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** Does a typed name mean this person? Every typed word starts one of theirs, or is a near spelling of it. */
function idsNameMatch(typed, name) {
  const toks = String(typed || "").toLowerCase().split(/\s+/).filter(Boolean);
  const words = String(name || "").toLowerCase().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(t => words.some(w => w.startsWith(t) || (t.length >= 4 && idsLev(t, w) <= (t.length >= 7 ? 2 : 1))));
}

/** The plan applied to the studio's lists. Pure. */
function idsPlanSelect(plan, ctx) {
  const p = plan || {};
  const pool = ctx.pool || [], all = ctx.all || [], blockedOf = ctx.isBlocked || (() => false);
  const norm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const okKind = r => !p.kind || r.kind === p.kind;
  const okCentre = r => !p.centre || (p.centre === "none" ? !r.centre : r.centre === p.centre);
  const okWhich = r => !p.which || p.which === "all" || r.reason === p.which;
  const okDate = r => (!p.dateFrom && !p.dateTo) || (!!r.day && (!p.dateFrom || r.day >= p.dateFrom) && (!p.dateTo || r.day <= p.dateTo));
  const okNum = r => (p.numFrom == null && p.numTo == null) || (r.seq != null && (p.numFrom == null || r.seq >= p.numFrom) && (p.numTo == null || r.seq <= p.numTo));
  const findId = (list, w) => list.filter(c => norm(c.displayId) === w || norm(c.id) === w || (/^\d+$/.test(w) && c.seq === parseInt(w, 10)));
  const hits = [], missing = [], carded = [], ambiguous = [];
  /* Named people are wanted whatever the "new / reprint" filter says; the
     kind (and, for names, the centre) still narrows who a name can mean. */
  const named = (ids, names, narrow) => {
    (ids || []).forEach(raw => {
      const w = norm(raw);
      const inPool = findId(pool.filter(okKind), w);
      if (inPool.length) return hits.push(...inPool);
      const had = findId(all.filter(okKind), w).filter(r => r.printedBefore);
      if (had.length) carded.push(...had); else missing.push(raw);
    });
    (names || []).forEach(raw => {
      const near = r => okKind(r) && (!narrow || okCentre(r)) && idsNameMatch(raw, r.name);
      const inPool = pool.filter(near);
      if (inPool.length > IDS_ASK_NAME_AMBIGUOUS) return ambiguous.push({ name: raw, n: inPool.length });
      if (inPool.length) return hits.push(...inPool);
      const had = all.filter(r => near(r) && r.printedBefore);
      if (had.length && had.length <= IDS_ASK_NAME_AMBIGUOUS) carded.push(...had); else if (had.length) ambiguous.push({ name: raw, n: had.length }); else missing.push(raw);
    });
  };
  if ((p.ids || []).length || (p.names || []).length) named(p.ids, p.names, true);
  else pool.forEach(r => { if (okKind(r) && okCentre(r) && okWhich(r) && okDate(r) && okNum(r)) hits.push(r); });
  if (p.also) named(p.also.ids, p.also.names, false);
  // Left out as asked: matched across everyone, so "not Ada" works however Ada got in.
  const out = new Set();
  const ex = p.exclude || {};
  (ex.ids || []).forEach(raw => findId(all, norm(raw)).forEach(r => out.add(r.key)));
  (ex.names || []).forEach(raw => all.filter(r => idsNameMatch(raw, r.name)).forEach(r => out.add(r.key)));
  const uniq = list => { const seen = new Set(); return list.filter(r => !seen.has(r.key) && seen.add(r.key)); };
  const found = uniq(hits);
  const excluded = found.filter(r => out.has(r.key));
  const kept = found.filter(r => !out.has(r.key));
  const blocked = kept.filter(blockedOf);
  let pick = kept.filter(r => !blockedOf(r));
  const max = Math.min(p.limit || IDS_ASK_PICK_MAX, IDS_ASK_PICK_MAX);
  const cut = Math.max(0, pick.length - max);
  if (cut) pick = pick.slice(0, max);
  return { pick, blocked, missing, carded: uniq(carded).filter(r => !out.has(r.key)), ambiguous, cut, excluded };
}

/** "6–12 Oct", "since 6 Oct", "until 12 Oct". */
function idsAskDays(a, b) {
  const f = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return a && b ? (a === b ? f(a) : f(a) + "–" + f(b)) : a ? "since " + f(a) : "until " + f(b);
}

/* What the plan selects, in the operator's words — built here from the
   plan, never from the model's prose — each with how to take it out. */
const idsPlanWithout = (p, keys) => { const n = Object.assign({}, p); keys.forEach(k => { delete n[k]; }); return n; };
const idsPlanDropFrom = (p, field, sub, value) => {
  const n = Object.assign({}, p);
  if (sub) {
    const g = Object.assign({}, n[field] || {});
    g[sub] = (g[sub] || []).filter(x => x !== value);
    if (!g[sub].length) delete g[sub];
    if (Object.keys(g).length) n[field] = g; else delete n[field];
  } else {
    n[field] = (n[field] || []).filter(x => x !== value);
    if (!n[field].length) delete n[field];
  }
  return n;
};
function idsPlanWhat(p) {
  const out = [];
  const targeted = (p.ids || []).length || (p.names || []).length;
  out.push({ label: p.which === "reprint" ? "Reprints" : p.which === "all" ? "Every waiting card" : targeted ? "Named cards" : "New cards",
    drop: p.which && p.which !== "new" ? q => idsPlanWithout(q, ["which"]) : null });
  if (p.kind) out.push({ label: IDS_KIND_PLURAL[p.kind] || p.kind, drop: q => idsPlanWithout(q, ["kind"]) });
  if (p.centre) out.push({ label: p.centre === "none" ? "no centre on the record" : p.centre, drop: q => idsPlanWithout(q, ["centre"]) });
  if (p.dateFrom || p.dateTo) out.push({ label: (p.kind === "member" ? "joined " : "registered ") + idsAskDays(p.dateFrom, p.dateTo), drop: q => idsPlanWithout(q, ["dateFrom", "dateTo"]) });
  if (p.numFrom != null || p.numTo != null) out.push({ label: "numbers " + (p.numFrom != null ? p.numFrom : "…") + "–" + (p.numTo != null ? p.numTo : "…"), drop: q => idsPlanWithout(q, ["numFrom", "numTo"]) });
  (p.ids || []).forEach(v => out.push({ label: v, drop: q => idsPlanDropFrom(q, "ids", null, v) }));
  (p.names || []).forEach(v => out.push({ label: v, drop: q => idsPlanDropFrom(q, "names", null, v) }));
  ["ids", "names"].forEach(k => ((p.also || {})[k] || []).forEach(v => out.push({ label: "+ " + v, tone: "add", drop: q => idsPlanDropFrom(q, "also", k, v) })));
  ["ids", "names"].forEach(k => ((p.exclude || {})[k] || []).forEach(v => out.push({ label: "not " + v, tone: "out", drop: q => idsPlanDropFrom(q, "exclude", k, v) })));
  if (p.limit) out.push({ label: "at most " + p.limit, drop: q => idsPlanWithout(q, ["limit"]) });
  return out;
}

/** The prompt bar and, once read, what it will print. */
function IdsAsk({ A }) {
  const [text, setText] = React.useState("");
  const [recent, setRecent] = React.useState(idsAskRecent);
  const [hist, setHist] = React.useState(-1);
  const inputRef = React.useRef(null);
  const r = A.result;
  const refining = !!(r && r.plan && !r.empty);
  // "/" anywhere in the studio goes to the bar, as it does in most tools.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable) || document.querySelector(".ids-dialog")) return;
      e.preventDefault();
      inputRef.current && inputRef.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const submit = e => {
    e.preventDefault();
    const t = text.trim();
    if (!t || A.busy) return;
    setRecent(idsAskRemember(t)); setHist(-1);
    A.ask(t);
    setText("");
  };
  const onKey = e => {
    if (e.key === "Escape") { if (text) setText(""); else if (r || A.err) A.close(); return; }
    // ↑ / ↓ walk back through recent requests while the bar is empty or showing one.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && recent.length && (!text || hist >= 0)) {
      e.preventDefault();
      const i = e.key === "ArrowUp" ? Math.min(recent.length - 1, hist + 1) : hist - 1;
      setHist(i); setText(i >= 0 ? recent[i] : "");
    }
  };
  const chips = recent.slice(0, 3).map(x => ({ x, recent: true })).concat(IDS_ASK_EXAMPLES.filter(x => !recent.includes(x)).map(x => ({ x }))).slice(0, 4);
  return (
    <section className="ids-ask" aria-label="Print from a prompt">
      <form className="ids-ask-bar" role="search" onSubmit={submit}>
        <IdsIcon name="sparkle" className="ids-ask-ic"/>
        <label htmlFor="ids-ask-in" className="ids-sr">{refining ? "Change the plan" : "Say what to print"}</label>
        <input id="ids-ask-in" ref={inputRef} className="ids-ask-in" value={text} maxLength={400} autoComplete="off"
          placeholder={refining ? IDS_ASK_REFINE_HINT : "Say what to print — “new cards for Egbeda members, front and back”"}
          onChange={e => { setText(e.target.value); setHist(-1); }} onKeyDown={onKey}/>
        {!text && !refining && <kbd className="ids-ask-kbd" aria-hidden="true">/</kbd>}
        <button type="submit" className="ids-btn ids-btn--outline ids-btn--34" disabled={!text.trim() || A.busy}>
          {A.busy ? "Reading…" : refining ? "Update" : "Plan the print"}
        </button>
      </form>
      {!r && !A.err && !A.busy && (
        <div className="ids-ask-ex" aria-label={recent.length ? "Recent and examples" : "Examples"}>
          {chips.map(({ x, recent: rc }) => (
            <button key={x} type="button" className={"ids-ask-chip" + (rc ? " is-recent" : "")} title={rc ? "Recent" : "Example"}
              onClick={() => { setText(x); inputRef.current && inputRef.current.focus(); }}>
              {rc && <IdsIcon name="clock-counter-clockwise"/>}{x}
            </button>
          ))}
        </div>
      )}
      {A.err && (
        <div className="ids-ask-card is-bad" role="alert">
          <IdsIcon name="warning-octagon"/>
          <span className="ids-grow">{A.err}</span>
          <button type="button" className="ids-btn ids-btn--sm" onClick={A.retry}>Try again</button>
        </div>
      )}
      {r && <IdsAskResult r={r} A={A}/>}
    </section>
  );
}

function IdsAskResult({ r, A }) {
  const by = r.by === "ai" ? "Read by " + (IDS_ASK_PROVIDER[r.provider] || "AI") : "Read by the studio’s rules" + (r.aiError ? " (the AI didn’t answer)" : "");
  const live = A.live;   // { sheets, settings[], block, fill }
  return (
    <div className={"ids-ask-card" + (r.empty ? " is-warn" : "")} role="status" aria-live="polite">
      <div className="ids-ask-main">
        {r.empty ? (
          <p className="ids-ask-h">I couldn’t tell what to print from that. Name who (members, Summer School, volunteers), where, or the ID numbers.</p>
        ) : (
          <>
            <p className="ids-ask-h">
              {r.n ? <><b className="ids-mono">{r.n}</b> {r.n === 1 ? "card" : "cards"} on the sheet</> : "Nothing to put on the sheet"}
              {r.n > 0 && live && <span className="ids-muted"> · {live.sheets} {live.sheets === 1 ? "sheet" : "sheets"}</span>}
              {r.refined && <span className="ids-ask-tag">Updated</span>}
            </p>
            <ul className="ids-ask-what" aria-label="What it understood">
              {r.what.map((w, i) => (
                <li key={i} className={w.tone ? "is-" + w.tone : ""}>
                  {w.label}
                  {w.drop && <button type="button" className="ids-ask-x" aria-label={"Take out " + w.label} onClick={() => A.drop(w.drop)}><IdsIcon name="x"/></button>}
                </li>
              ))}
            </ul>
            {r.n > 0 && live && <ul className="ids-ask-how" aria-label="Sheet settings">{live.settings.map((s, i) => <li key={i} className={s.changed ? "is-changed" : ""}>{s.label}</li>)}</ul>}
            {r.issues.map((x, i) => (
              <p key={i} className={"ids-ask-issue is-" + x.tone}>
                <IdsIcon name={x.tone === "bad" ? "warning-octagon" : x.tone === "warn" ? "warning" : "info"}/>
                <span className="ids-grow">{x.text}</span>
                {x.action && <button type="button" className="ids-linkbtn" onClick={x.onAction}>{x.action}</button>}
              </p>
            ))}
            {live && live.fill > 0 && (
              <p className="ids-ask-issue is-info">
                <IdsIcon name="squares-four"/>
                <span className="ids-grow">The last sheet has {live.gap} empty {live.gap === 1 ? "slot" : "slots"}.</span>
                <button type="button" className="ids-linkbtn" onClick={A.fill}>Fill {live.fill === 1 ? "it" : "them"} with {live.fill} more waiting {live.fill === 1 ? "card" : "cards"}</button>
              </p>
            )}
          </>
        )}
        <p className="ids-ask-by">{by}</p>
      </div>
      <div className="ids-ask-acts">
        {!r.empty && r.n > 0 && (
          <button type="button" className="ids-btn ids-btn--primary ids-btn--lg" onClick={A.print} disabled={!!(live && live.block)} title={live && live.block ? live.block : undefined}>
            <IdsIcon name="printer"/>Print {r.n} {r.n === 1 ? "card" : "cards"}
          </button>
        )}
        {live && live.block && <span className="ids-help">{live.block}</span>}
        {A.canUndo && <button type="button" className="ids-btn ids-btn--34" onClick={A.undo}>Undo</button>}
        <button type="button" className="ids-btn ids-btn--34 ids-btn--outline-soft" onClick={A.close} aria-label="Close the plan">Close</button>
      </div>
    </div>
  );
}
