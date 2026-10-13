/* ============================================================================
   ID Card Studio — print from a prompt.

   "New cards for Egbeda members, front and back" → the server reads it into a
   PLAN (admin.ids.plan: an AI provider when a key is set, the studio's rules
   always), and the studio applies the plan to what it already shows: the
   records it selects, the sheet settings it changes. Nothing is printed and
   nothing is written until the operator presses Print on the result, which
   names what was understood, the count and the sheet, so the count is read
   before the press (CLAUDE.md §6). Undo puts the sheet back as it was.

   idsPlanSelect is pure: the plan and the studio's lists in, the selection
   and everything left out (no photo, not found, already carded) out.
   ========================================================================== */

const IDS_ASK_EXAMPLES = [
  "New cards for every member at Egbeda, front and back",
  "Reprint 026-003 and 026-014",
  "Summer School participants who registered this week, proof on A4",
  "Volunteers, fronts only, by name",
];
const IDS_ASK_PICK_MAX = 600;   // one run's ceiling (IDS_BATCH_MAX on the server)
const IDS_ASK_NAME_AMBIGUOUS = 3;
const IDS_ASK_PROVIDER = { openai: "OpenAI", anthropic: "Claude", gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter" };

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
  const ids = p.ids || [], names = p.names || [];
  const hits = [], missing = [], carded = [], ambiguous = [];
  if (ids.length || names.length) {
    /* Named people are wanted whatever the "new / reprint" filter says; the
       kind (and, for names, the centre) still narrows who a name can mean. */
    const findId = (list, w) => list.filter(c => norm(c.displayId) === w || norm(c.id) === w || (/^\d+$/.test(w) && c.seq === parseInt(w, 10)));
    ids.forEach(raw => {
      const w = norm(raw);
      const inPool = findId(pool.filter(okKind), w);
      if (inPool.length) return hits.push(...inPool);
      const had = findId(all.filter(okKind), w).filter(r => r.printedBefore);
      if (had.length) carded.push(...had); else missing.push(raw);
    });
    names.forEach(raw => {
      const toks = String(raw).toLowerCase().split(/\s+/).filter(Boolean);
      const match = r => { const words = String(r.name || "").toLowerCase().split(/\s+/); return toks.every(t => words.some(x => x.startsWith(t))); };
      const inPool = pool.filter(r => okKind(r) && okCentre(r) && match(r));
      if (inPool.length > IDS_ASK_NAME_AMBIGUOUS) return ambiguous.push({ name: raw, n: inPool.length });
      if (inPool.length) return hits.push(...inPool);
      const had = all.filter(r => okKind(r) && okCentre(r) && r.printedBefore && match(r));
      if (had.length && had.length <= IDS_ASK_NAME_AMBIGUOUS) carded.push(...had); else if (had.length) ambiguous.push({ name: raw, n: had.length }); else missing.push(raw);
    });
  } else {
    pool.forEach(r => { if (okKind(r) && okCentre(r) && okWhich(r) && okDate(r) && okNum(r)) hits.push(r); });
  }
  const uniq = list => { const seen = new Set(); return list.filter(r => !seen.has(r.key) && seen.add(r.key)); };
  const found = uniq(hits);
  const blocked = found.filter(blockedOf);
  let pick = found.filter(r => !blockedOf(r));
  const max = Math.min(p.limit || IDS_ASK_PICK_MAX, IDS_ASK_PICK_MAX);
  const cut = Math.max(0, pick.length - max);
  if (cut) pick = pick.slice(0, max);
  return { pick, blocked, missing, carded: uniq(carded), ambiguous, cut };
}

/** "6–12 Oct", "since 6 Oct", "until 12 Oct". */
function idsAskDays(a, b) {
  const f = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return a && b ? (a === b ? f(a) : f(a) + "–" + f(b)) : a ? "since " + f(a) : "until " + f(b);
}

/** What the plan selects, in the operator's words. Built here from the plan, never from the model's prose. */
function idsPlanWhat(p) {
  const out = [];
  out.push(p.which === "reprint" ? "Reprints" : p.which === "all" ? "Every waiting card" : (p.ids || []).length || (p.names || []).length ? "Named cards" : "New cards");
  if (p.kind) out.push(IDS_KIND_PLURAL[p.kind] || p.kind);
  if (p.centre) out.push(p.centre === "none" ? "no centre on the record" : p.centre);
  if (p.dateFrom || p.dateTo) out.push((p.kind === "member" ? "joined " : "registered ") + idsAskDays(p.dateFrom, p.dateTo));
  if (p.numFrom != null || p.numTo != null) out.push("numbers " + (p.numFrom != null ? p.numFrom : "…") + "–" + (p.numTo != null ? p.numTo : "…"));
  const named = (p.ids || []).concat(p.names || []);
  if (named.length) out.push(named.slice(0, 6).join(", ") + (named.length > 6 ? " +" + (named.length - 6) : ""));
  if (p.limit) out.push("at most " + p.limit);
  return out;
}

/** The prompt bar and, once read, what it will print. */
function IdsAsk({ A }) {
  const [text, setText] = React.useState("");
  const inputRef = React.useRef(null);
  const submit = e => { e.preventDefault(); if (text.trim() && !A.busy) A.ask(text.trim()); };
  const r = A.result;
  return (
    <section className="ids-ask" aria-label="Print from a prompt">
      <form className="ids-ask-bar" role="search" onSubmit={submit}>
        <IdsIcon name="sparkle" className="ids-ask-ic"/>
        <label htmlFor="ids-ask-in" className="ids-sr">Say what to print</label>
        <input id="ids-ask-in" ref={inputRef} className="ids-ask-in" value={text} maxLength={400} autoComplete="off"
          placeholder="Say what to print — “new cards for Egbeda members, front and back”"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Escape" && r) A.close(); }}/>
        <button type="submit" className="ids-btn ids-btn--outline ids-btn--34" disabled={!text.trim() || A.busy}>
          {A.busy ? "Reading…" : "Plan the print"}
        </button>
      </form>
      {!r && !A.err && !A.busy && (
        <div className="ids-ask-ex" aria-label="Examples">
          {IDS_ASK_EXAMPLES.map(x => (
            <button key={x} type="button" className="ids-ask-chip" onClick={() => { setText(x); inputRef.current && inputRef.current.focus(); }}>{x}</button>
          ))}
        </div>
      )}
      {A.err && (
        <div className="ids-ask-card is-bad" role="alert">
          <IdsIcon name="warning-octagon"/>
          <span className="ids-grow">{A.err}</span>
          <button type="button" className="ids-btn ids-btn--sm" onClick={() => text.trim() && A.ask(text.trim())}>Try again</button>
        </div>
      )}
      {r && <IdsAskResult r={r} A={A}/>}
    </section>
  );
}

function IdsAskResult({ r, A }) {
  const by = r.by === "ai" ? "Read by " + (IDS_ASK_PROVIDER[r.provider] || "AI") : "Read by the studio’s rules" + (r.aiError ? " (the AI didn’t answer)" : "");
  const live = A.live;   // { n, sheets, settings[], block }
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
            </p>
            <ul className="ids-ask-what">{r.what.map((w, i) => <li key={i}>{w}</li>)}</ul>
            {r.n > 0 && live && <ul className="ids-ask-how" aria-label="Sheet settings">{live.settings.map((s, i) => <li key={i} className={s.changed ? "is-changed" : ""}>{s.label}</li>)}</ul>}
            {r.issues.map((x, i) => (
              <p key={i} className={"ids-ask-issue is-" + x.tone}>
                <IdsIcon name={x.tone === "bad" ? "warning-octagon" : x.tone === "warn" ? "warning" : "info"}/>
                <span className="ids-grow">{x.text}</span>
                {x.action && <button type="button" className="ids-linkbtn" onClick={x.onAction}>{x.action}</button>}
              </p>
            ))}
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
        {r.applied && <button type="button" className="ids-btn ids-btn--34" onClick={A.undo}>Undo</button>}
        <button type="button" className="ids-btn ids-btn--34 ids-btn--outline-soft" onClick={A.close} aria-label="Close the plan">Close</button>
      </div>
    </div>
  );
}
