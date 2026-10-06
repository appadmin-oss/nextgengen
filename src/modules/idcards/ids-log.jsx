/* ============================================================================
   ID Card Studio — Print log, Look up a person, and the phone's Queue
   (ID_CARD_STUDIO.md §5, §6). Data arrives through idsApi (ids-data.jsx).
   ========================================================================== */

const IDS_RUN_TYPES = { new: ["New issues", "ok"], reprint: ["Reprints", "warn"], mixed: ["New issues and reprints", "warn"], proof: ["Proof", "neutral"], external: ["External upload", "info"] };

/** Three states, never a silent empty list: loading, an honest error with a retry, then the rows. */
function IdsLoadState({ state, onRetry, what }) {
  if (state === "loading") return <div className="ids-state" role="status"><span className="ids-skel"/><span className="ids-skel"/><span className="ids-skel"/></div>;
  if (state === "error") return (
    <div className="ids-state is-error" role="alert">
      <IdsIcon name="warning-circle"/><span>Couldn’t load {what}. Check your connection and try again.</span>
      <button type="button" className="ids-btn" onClick={onRetry}>Try again</button>
    </div>
  );
  return null;
}

function IdsLog({ runs, state, onRetry, onOpen, narrow }) {
  const [kind, setKind] = React.useState("");
  const [type, setType] = React.useState("");
  const rows = (runs || []).filter(r => (!kind || r.kind === kind) && (!type || r.type === type));
  return (
    <div className="ids-page ids-page--log">
      <h1>Print log</h1>
      <p className="ids-lede">Every run, with the design and version it used. Runs appear the moment a file is made.</p>
      <div className="ids-row">
        <select className="ids-select" aria-label="Kind" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Every kind</option>
          {IDS_KIND_IDS.map(k => <option key={k} value={k}>{IDS_KIND_PLURAL[k]}</option>)}
        </select>
        <select className="ids-select" aria-label="Run type" value={type} onChange={e => setType(e.target.value)}>
          <option value="">Every run type</option>
          {Object.keys(IDS_RUN_TYPES).map(k => <option key={k} value={k}>{IDS_RUN_TYPES[k][0]}</option>)}
        </select>
      </div>
      <IdsLoadState state={state} onRetry={onRetry} what="the print log"/>
      {state === "ready" && (rows.length ? (
        <ul className={"ids-log" + (narrow ? " is-narrow" : "")}>
          {rows.map(r => (
            <li key={r.runId}>
              <button type="button" className="ids-logrow" onClick={() => onOpen(r)} aria-label={"Open run " + r.runId}>
                <span className="ids-log-when"><span>{r.at}</span><span className="ids-mono">{r.runId}</span></span>
                <span className="ids-log-design"><b>{r.design}{r.version ? " " + r.version : ""}</b><span>by {r.by || "—"}</span></span>
                <span><IdsPill tone={(IDS_RUN_TYPES[r.type] || IDS_RUN_TYPES.new)[1]}>{(IDS_RUN_TYPES[r.type] || IDS_RUN_TYPES.new)[0]}</IdsPill></span>
                <span className="ids-log-n"><b>{r.cards}</b>{r.failed ? <span className="ids-bad-text">{r.failed} not printed</span> : null}</span>
                {!narrow && <span className="ids-log-out">{r.output}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="ids-empty">No runs match.</p>)}
    </div>
  );
}

function IdsRunDrawer({ run, onClose, onReprint, phone }) {
  const ref = React.useRef(null);
  React.useEffect(() => { const b = document.activeElement; if (ref.current) ref.current.focus(); return () => { if (b && b.focus && b.isConnected) b.focus(); }; }, []);
  return (
    <div className="ids-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={ref} tabIndex={-1} className={"ids-drawer" + (phone ? " is-full" : "")} role="dialog" aria-modal="true" aria-label={"Run " + run.runId}
             onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
        <div className="ids-drawer-head">
          <div className="ids-grow">
            <b className="ids-drawer-t">{run.design}{run.version ? " " + run.version : ""}</b>
            <span className="ids-mono ids-muted">{run.runId} · {run.at}</span>
          </div>
          <button type="button" className="ids-iconbtn" aria-label="Close" onClick={onClose}><IdsIcon name="x"/></button>
        </div>
        <div className="ids-drawer-body">
          <p>{idsN(run.cards, "card")} · {run.output} · {run.by || "—"}</p>
          {run.failed > 0 && <IdsCheck tone="bad" text={idsN(run.failed, "card") + " didn’t print properly and went back for a reprint."}/>}
          <h2 className="ids-h2">People in this run</h2>
          <ul className="ids-people">{(run.people || []).map((p, i) => <li key={i}>{p}</li>)}</ul>
          {!(run.people || []).length && <p className="ids-muted">The log keeps the count for this run, not the names.</p>}
        </div>
        <div className="ids-drawer-foot">
          <button type="button" className="ids-btn ids-btn--primary" disabled={!run.reprintable} onClick={() => onReprint(run)}>Reprint this run</button>
          {!run.reprintable && <span className="ids-help">{run.type === "external" ? "Uploaded images aren’t kept after printing, so this run can’t be reprinted from here." : "Nobody from this run is on record to reprint."}</span>}
        </div>
      </aside>
    </div>
  );
}

function IdsLookup({ lookup, design, onQueue }) {
  const [q, setQ] = React.useState("");
  const [res, setRes] = React.useState(null);           // null | { state, data, id }
  const go = () => {
    const id = q.trim().toUpperCase();
    if (!id) return;
    setRes({ state: "loading", id });
    lookup(id).then(data => setRes({ state: "ready", data, id })).catch(() => setRes({ state: "error", id }));
  };
  const d = res && res.data;
  return (
    <div className="ids-page ids-page--lookup">
      <h1>Look up a person</h1>
      <p className="ids-lede">Every card ever printed for one person, and whether a reprint would look different.</p>
      <form className="ids-lookup-form" role="search" onSubmit={e => { e.preventDefault(); go(); }}>
        <label className="ids-sr" htmlFor="ids-lq">Printed ID</label>
        <input id="ids-lq" className="ids-input ids-input--lg ids-mono" placeholder="Printed ID, e.g. EG-25-0412" value={q} onChange={e => setQ(e.target.value)} autoComplete="off"/>
        <button type="submit" className="ids-btn ids-btn--primary ids-btn--lg">Look it up</button>
      </form>
      {res && res.state !== "ready" && <IdsLoadState state={res.state} onRetry={go} what={"the history for " + res.id}/>}
      {res && res.state === "ready" && (d && d.rows.length ? (
        <div className="ids-lookup-res" role="status">
          <h2 className="ids-lookup-name">{d.name}</h2>
          <p className="ids-muted">{idsN(d.rows.length, "card")} issued · {d.rows.filter(r => r.reprint).length} of them replacements</p>
          {d.moved && (
            <div className="ids-check is-warn">
              <IdsIcon name="warning"/>
              <span className="ids-grow">Their last card used an older design. A reprint today uses {design} and will look different.</span>
              {d.queueable && <button type="button" className="ids-linkbtn" onClick={() => onQueue(d)}>Queue a reprint</button>}
            </div>
          )}
          <ul className="ids-hist">
            {d.rows.map((r, i) => (
              <li key={i}>
                <span className="ids-grow"><b>{r.at}</b><span className="ids-muted"> · <span className="ids-mono">{r.run}</span> · {r.design} · {r.type}</span></span>
                <IdsPill tone={r.ok ? "ok" : "bad"}>{r.ok ? "Printed" : "Not printed"}</IdsPill>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="ids-lookup-none" role="status">
          <b>No card has been issued to {res.id}</b>
          <span className="ids-muted">Either they’ve never been printed, or their card predates the print log.</span>
        </div>
      ))}
    </div>
  );
}

/** The phone's Make tab (§6): who is ready and who is waiting on a photo — never the sheet. */
function IdsPhoneQueue({ recs, isBlocked, onAsk }) {
  const [lim, setLim] = React.useState(40);
  const ready = recs.filter(r => !isBlocked(r) && r.reason === "new").length;
  const reprints = recs.filter(r => !isBlocked(r) && r.reason === "reprint").length;
  const blocked = recs.filter(isBlocked).length;
  return (
    <div className="ids-page ids-page--phone">
      <div className="ids-phone-note"><IdsIcon name="desktop"/><span>Laying out sheets and printing needs a computer. From here you can see who’s ready and chase missing photos.</span></div>
      <div className="ids-kpis">
        <div className="ids-kpi"><b>{ready}</b><span>Ready</span></div>
        <div className="ids-kpi"><b>{reprints}</b><span>Reprints</span></div>
        <div className="ids-kpi is-bad"><b>{blocked}</b><span>Blocked</span></div>
      </div>
      <ul className="ids-phone-list">
        {recs.slice(0, lim).map(r => (
          <li key={r.id} className="ids-phone-row">
            <span className="ids-grow"><b>{r.name}</b><span className={isBlocked(r) ? "ids-bad-text" : "ids-muted"}>{isBlocked(r) ? "No photo yet" : r.reason === "reprint" ? "Reprint · " + r.why : "Ready to print"}</span></span>
            {isBlocked(r) && <button type="button" className="ids-btn ids-btn--44" onClick={() => onAsk(r)}>Ask for photo</button>}
          </li>
        ))}
      </ul>
      {recs.length > lim && <button type="button" className="ids-btn ids-btn--more" onClick={() => setLim(l => l + 100)}>Show more · {lim} of {recs.length} shown</button>}
      {!recs.length && <p className="ids-empty">Nobody is waiting for a card.</p>}
    </div>
  );
}
