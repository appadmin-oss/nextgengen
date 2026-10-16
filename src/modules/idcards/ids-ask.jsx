/* ============================================================================
   ID Card Studio — the assistant (v4): a chat pane beside the sheet.

   "New cards for Egbeda members, front and back" → the server reads it into a
   PLAN (admin.ids.plan: an AI provider when a key is set, the studio's rules
   always), and the studio applies the plan to what it already shows: the
   records it selects, the sheet settings it changes. Nothing is printed and
   nothing is written until the operator presses Print on the result, which
   names what was understood, the count and the sheet, so the count is read
   before the press (CLAUDE.md §6). Undo puts the sheet back as it was before
   the first plan.

   A plan on screen is a conversation, and the pane keeps the transcript: the
   next request ("fronts only", "only Ijaiye", "add 026-010", "not Ada") is sent
   with the plan and adjusts it; the earlier replies stay, marked superseded,
   and only the newest is live. Each thing the studio understood is a chip
   whose × takes it out on the spot. In Ask mode a reply suggests and waits for
   Apply; in Act mode it applies straight away. It can never print, and never
   mark anybody printed: Print stays a press, with the count on it.

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

/* Questions about the sheet ("why can't I print yet?") are answered here,
   from the checks the studio already runs, not by a model: the answer has to
   be true of THIS sheet. Returns null when the text is not such a question. */
function idsAskAnswer(text, c) {
  const t = String(text || "").toLowerCase();
  const q = /\?$/.test(t.trim()) || /^(why|what|how|can|is|are|do|does|which|who)\b/.test(t.trim());
  if (!q) return null;
  const n = c.n, sheets = c.sheets;
  if (/print|ready|blocked|stop/.test(t)) {
    if (!n) return "Nothing is on the sheet yet, so there is nothing to print. Tick people on the left, or ask me: “new cards for every member at Egbeda”.";
    if (c.block) return "Not yet. " + c.bad.map(x => x.replace(/\s+$/, "")).join(" ") + (c.bad.length ? "" : c.block + ".") + " Fix the red item" + (c.bad.length > 1 ? "s" : "") + " in Settings → Checks, then press **Print " + n + "**.";
    return "You **can** print. The sheet has **" + n + " " + (n === 1 ? "card" : "cards") + "** on " + sheets + " " + (sheets === 1 ? "sheet" : "sheets") + " and every check passes. Press **Print " + n + "** when you’re ready."
      + (c.blocked ? "\n\nNote: " + c.blocked + " " + (c.blocked === 1 ? "person is" : "people are") + " left out because they have no photo yet. Ask for their photos from the Blocked list." : "")
      + (c.warn.length ? "\n\nWorth a look first: " + c.warn.join(" ") : "");
  }
  if (/how many|count|left|waiting/.test(t)) {
    return "**" + n + "** on the sheet (" + sheets + " " + (sheets === 1 ? "sheet" : "sheets") + "). " + c.ready + " more " + (c.ready === 1 ? "is" : "are") + " ready to add, and " + c.blocked + " " + (c.blocked === 1 ? "is" : "are") + " waiting for a photo.";
  }
  return null;
}

/** **bold** in a sentence. Nothing else is interpreted. */
function IdsAskMini({ text }) {
  return String(text).split("\n\n").map((para, i) => (
    <p key={i} className="ids-ai-p">{para.split(/(\*\*[^*]+\*\*)/).map((bit, j) => /^\*\*[^*]+\*\*$/.test(bit) ? <b key={j}>{bit.slice(2, -2)}</b> : bit)}</p>
  ));
}

const IDS_ASK_MODE_KEY = "ngg.ids.ask.mode";
function idsAskModeGet() { try { return localStorage.getItem(IDS_ASK_MODE_KEY) === "act" ? "act" : "ask"; } catch (_) { return "ask"; } }

/** The pane: transcript, composer, and the one live plan. */
function IdsAssistant({ A, onClose }) {
  const [text, setText] = React.useState("");
  const [recent, setRecent] = React.useState(idsAskRecent);
  const [hist, setHist] = React.useState(-1);
  const [pop, setPop] = React.useState(null);     // { kind: "people" | "keys", q, at }
  const [pick, setPick] = React.useState(0);
  const inputRef = React.useRef(null);
  const logRef = React.useRef(null);
  React.useEffect(() => { A.bindInput(inputRef); }, []); // eslint-disable-line
  React.useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [A.chat.length, A.busy, A.liveId]);
  const send = t => {
    const v = (t == null ? text : t).trim();
    if (!v || A.busy) return;
    setRecent(idsAskRemember(v)); setHist(-1); setPop(null);
    A.ask(v);
    setText("");
  };
  const people = pop && pop.kind === "people" ? A.people(pop.q) : [];
  const keysList = IDS_ASK_EXAMPLES.concat(recent.filter(x => !IDS_ASK_EXAMPLES.includes(x))).slice(0, 6);
  const choose = i => {
    if (pop.kind === "people") {
      const r = people[i];
      if (!r) return;
      const tag = r.displayId || r.name;
      setText(x => x.slice(0, pop.at) + tag + " " + x.slice(pop.at + 1 + pop.q.length));
    } else setText(keysList[i] || "");
    setPop(null);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };
  const onChange = e => {
    const v = e.target.value, caret = e.target.selectionStart || v.length;
    setText(v); setHist(-1);
    const m = /(^|\s)@([^\s@]{0,24})$/.exec(v.slice(0, caret));
    if (m) { setPop({ kind: "people", q: m[2], at: caret - m[2].length - 1 }); setPick(0); }
    else if (v === "?") { setPop({ kind: "keys" }); setPick(0); }
    else setPop(null);
  };
  const onKey = e => {
    const list = pop ? (pop.kind === "people" ? people : keysList) : null;
    if (list && list.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); return setPick(i => (i + 1) % list.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); return setPick(i => (i - 1 + list.length) % list.length); }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return choose(pick); }
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      if (pop) return setPop(null);
      if (text) return setText("");
      return onClose && onClose();
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); return send(); }
    // ↑ recalls the last request while the composer is empty, as a shell does.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && recent.length && (!text || hist >= 0)) {
      e.preventDefault();
      const i = e.key === "ArrowUp" ? Math.min(recent.length - 1, hist + 1) : hist - 1;
      setHist(i); setText(i >= 0 ? recent[i] : "");
    }
  };
  const starters = recent.slice(0, 2).map(x => ({ x, recent: true })).concat(IDS_ASK_EXAMPLES.filter(x => !recent.includes(x)).map(x => ({ x }))).slice(0, 4);
  return (
    <section className="ids-ai" aria-label="Assistant">
      <div className="ids-ai-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        {!A.chat.length && (
          <div className="ids-ai-hello">
            <p className="ids-ai-hello-h"><IdsIcon name="sparkle"/>Say what to print</p>
            <p className="ids-ai-p">I read a request into a plan and set up the sheet: who goes on it, and how it prints. I can’t print, and I can’t mark anyone as printed. That stays your press.</p>
            <ul className="ids-ai-starters" aria-label={recent.length ? "Recent and examples" : "Examples"}>
              {starters.map(({ x, recent: rc }) => (
                <li key={x}><button type="button" className={"ids-ai-starter" + (rc ? " is-recent" : "")} onClick={() => { setText(x); inputRef.current && inputRef.current.focus(); }}>
                  {rc ? <IdsIcon name="clock-counter-clockwise"/> : <IdsIcon name="arrow-up-right"/>}<span>{x}</span>
                </button></li>
              ))}
              <li><button type="button" className="ids-ai-starter" onClick={() => { setText("Why can’t I print yet?"); inputRef.current && inputRef.current.focus(); }}><IdsIcon name="question"/><span>Why can’t I print yet?</span></button></li>
            </ul>
          </div>
        )}
        {A.chat.map(m => m.who === "me"
          ? <div key={m.id} className="ids-ai-me"><span>{m.text}</span></div>
          : <IdsAskReply key={m.id} m={m} A={A}/>)}
        {A.busy && <div className="ids-ai-reading" role="status"><span className="ids-ai-dots" aria-hidden="true"><i/><i/><i/></span>Reading…</div>}
      </div>
      <form className="ids-ai-compose" onSubmit={e => { e.preventDefault(); send(); }}>
        {pop && (pop.kind === "people" ? people.length > 0 : true) && (
          <ul className="ids-ai-pop" role="listbox" aria-label={pop.kind === "people" ? "People" : "Shortcuts"}>
            {pop.kind === "people" ? people.map((r, i) => (
              <li key={r.key} role="option" aria-selected={i === pick} className={i === pick ? "is-on" : ""} onMouseDown={e => { e.preventDefault(); choose(i); }}>
                <b>{r.name}</b><span className="ids-mono">{r.displayId || "no ID yet"}</span><span>{r.centre || "No centre"}</span>
              </li>
            )) : <>
              {keysList.map((x, i) => <li key={x} role="option" aria-selected={i === pick} className={i === pick ? "is-on" : ""} onMouseDown={e => { e.preventDefault(); choose(i); }}>{x}</li>)}
              <li className="ids-ai-keys" aria-hidden="true"><kbd>/</kbd> focus · <kbd>↑</kbd> last request · <kbd>@</kbd> a person · <kbd>Esc</kbd> clear, then close</li>
            </>}
          </ul>
        )}
        <label htmlFor="ids-ai-in" className="ids-sr">Message the assistant</label>
        <textarea id="ids-ai-in" ref={inputRef} className="ids-ai-in" rows={2} value={text} maxLength={400}
          placeholder={A.live ? IDS_ASK_REFINE_HINT : "Type @ to tag a person or ? for shortcuts"}
          aria-autocomplete="list" aria-expanded={!!pop} onChange={onChange} onKeyDown={onKey} onBlur={() => setTimeout(() => setPop(null), 120)}/>
        <div className="ids-ai-bar">
          <span className="ids-ai-mode" role="group" aria-label="Mode">
            <button type="button" aria-pressed={A.mode === "ask"} className={A.mode === "ask" ? "is-on" : ""} onClick={() => A.setMode("ask")} title="Suggests a plan; you press Apply"><IdsIcon name="chat-circle"/>Ask</button>
            <button type="button" aria-pressed={A.mode === "act"} className={A.mode === "act" ? "is-on" : ""} onClick={() => A.setMode("act")} title="Sets up the sheet straight away"><IdsIcon name="lightning"/>Act</button>
          </span>
          <span className="ids-grow"/>
          {A.chat.length > 0 && <button type="button" className="ids-iconbtn" aria-label="New conversation" title="New conversation" onClick={A.reset}><IdsIcon name="note-pencil"/></button>}
          <button type="submit" className="ids-ai-send" aria-label="Send" disabled={!text.trim() || A.busy}><IdsIcon name="arrow-up"/></button>
        </div>
      </form>
      <p className="ids-ai-foot">Can’t print or mark anyone as printed · Enter to send</p>
    </section>
  );
}

function IdsAskReply({ m, A }) {
  const by = m.by === "ai" ? "Read by " + (IDS_ASK_PROVIDER[m.provider] || "AI") : m.by === "rules" ? "Read by the studio’s rules" + (m.aiError ? " (the AI didn’t answer)" : "") : "";
  const live = m.id === A.liveId;
  if (m.kind === "error") return (
    <div className="ids-ai-card is-bad" role="alert">
      <p className="ids-ai-p"><IdsIcon name="warning-octagon"/> {m.text}</p>
      {m.retry && <div className="ids-ai-acts"><button type="button" className="ids-btn ids-btn--sm" onClick={A.retry}>Try again</button></div>}
    </div>
  );
  if (m.kind === "answer") return <div className="ids-ai-card"><span className="ids-ai-who">Assistant</span><IdsAskMini text={m.text}/></div>;
  if (m.kind === "empty") return (
    <div className="ids-ai-card is-warn">
      <span className="ids-ai-who">Assistant</span>
      <p className="ids-ai-p">I couldn’t tell what to print from that. Name who (members, Summer School, volunteers), where, or the ID numbers. Or ask me a question about the sheet.</p>
      {by && <p className="ids-ai-by">{by}</p>}
    </div>
  );
  // A plan. The live one shows the sheet as it is now; an earlier one, what it said then.
  const r = live ? A.result : m.snap;
  if (!live) return (
    <div className={"ids-ai-card is-past"}>
      <span className="ids-ai-who">Assistant{m.undone ? " · undone" : m.pending ? "" : " · superseded"}</span>
      <p className="ids-ai-p"><b className="ids-mono">{r.n}</b> {r.n === 1 ? "card" : "cards"}{r.what.length ? " · " + r.what.map(w => w.label).join(" · ") : ""}</p>
      {m.pending && !m.undone && (
        <div className="ids-ai-acts"><button type="button" className="ids-btn ids-btn--sm ids-btn--outline" onClick={() => A.apply(m)}>Apply</button></div>
      )}
      {by && <p className="ids-ai-by">{by}</p>}
    </div>
  );
  const L = A.live;
  return (
    <div className="ids-ai-card is-live">
      <span className="ids-ai-who">Assistant{r.refined ? " · updated" : ""}</span>
      {m.ran && m.ran.length > 0 && <ul className="ids-ai-ran" aria-label="What it did">{m.ran.map((x, i) => <li key={i}><IdsIcon name="check"/>Ran {x}</li>)}</ul>}
      <p className="ids-ai-h">
        {r.n ? <><b className="ids-mono">{r.n}</b> {r.n === 1 ? "card" : "cards"} on the sheet</> : "Nothing to put on the sheet"}
        {r.n > 0 && L && <span className="ids-muted"> · {L.sheets} {L.sheets === 1 ? "sheet" : "sheets"}</span>}
      </p>
      <ul className="ids-ask-what" aria-label="What it understood">
        {r.what.map((w, i) => (
          <li key={i} className={w.tone ? "is-" + w.tone : ""}>
            {w.label}
            {w.drop && <button type="button" className="ids-ask-x" aria-label={"Take out " + w.label} onClick={() => A.drop(w.drop)}><IdsIcon name="x"/></button>}
          </li>
        ))}
      </ul>
      {r.n > 0 && L && <ul className="ids-ask-how" aria-label="Sheet settings">{L.settings.map((s, i) => <li key={i} className={s.changed ? "is-changed" : ""}>{s.changed ? "Changed: " : ""}{s.label}</li>)}</ul>}
      {r.issues.map((x, i) => (
        <p key={i} className={"ids-ask-issue is-" + x.tone}>
          <IdsIcon name={x.tone === "bad" ? "warning-octagon" : x.tone === "warn" ? "warning" : "info"}/>
          <span className="ids-grow">{x.text}</span>
          {x.action && <button type="button" className="ids-linkbtn" onClick={x.onAction}>{x.action}</button>}
        </p>
      ))}
      {L && L.fill > 0 && (
        <p className="ids-ask-issue is-info">
          <IdsIcon name="squares-four"/>
          <span className="ids-grow">The last sheet has {L.gap} empty {L.gap === 1 ? "slot" : "slots"}.</span>
          <button type="button" className="ids-linkbtn" onClick={A.fill}>Fill {L.fill === 1 ? "it" : "them"} with {L.fill} more waiting {L.fill === 1 ? "card" : "cards"}</button>
        </p>
      )}
      <div className="ids-ai-acts">
        {r.n > 0 && (
          <button type="button" className="ids-btn ids-btn--sm ids-btn--outline" onClick={A.print} aria-disabled={!!(L && L.block) || undefined} title={L && L.block ? L.block : undefined}>
            <IdsIcon name="printer"/>Print {r.n} {r.n === 1 ? "card" : "cards"}
          </button>
        )}
        {A.canUndo && <button type="button" className="ids-btn ids-btn--sm" onClick={A.undo}>Undo</button>}
      </div>
      {L && L.block && <p className="ids-help">{L.block}</p>}
      {by && <p className="ids-ai-by">{by}</p>}
    </div>
  );
}
