/* ============================================================================
   ID Card Studio — the Make tab on a computer (ID_CARD_STUDIO.md §3).
   Three columns: what to print, the sheet as it will print, and how.
   Everything here reads and acts through `M`, built by IdCardStudioPage.
   ========================================================================== */

/* ── An uploaded image on a card: a picture, not a second card renderer ── */
function IdsUploadFace({ u, cw, ch, back }) {
  if (!u) return <div className="ids-face-blank">Blank back</div>;
  const side = (u.rot || 0) % 180 !== 0;
  const rot = back ? -(u.rot || 0) : (u.rot || 0);
  /* The picture is placed at its own aspect inside the (unrotated) frame, not
     fitted by object-fit, which some rasterisers ignore and stretch. */
  const fw = side ? ch : cw, fh = side ? cw : ch;
  const g = cphPlace(u.w, u.h, fw, fh, null, u.fit === "cover" ? "cover" : "contain");
  return (
    <div className="ids-face-up">
      <div className="ids-face-up-frame" style={{ width: fw + "mm", height: fh + "mm", transform: "translate(-50%, -50%) rotate(" + rot + "deg)" }}>
        <img src={u.src} alt="" draggable="false" style={{ left: g.left + "%", top: g.top + "%", width: g.width + "%" }}/>
      </div>
    </div>
  );
}

/* ── Source column ──────────────────────────────────────────────────────── */

function IdsSource({ M }) {
  return (
    <aside className="ids-src" aria-label="Cards to print">
      <IdsSeg label="Source" className="ids-seg--2up" value={M.src} onChange={M.setSrc}
              options={[["records", "From records " + M.recCount, "users"], ["uploads", "Uploaded " + M.upFronts, "image"]]}/>
      {M.src === "records" ? <IdsRecords M={M}/> : <IdsUploads M={M}/>}
    </aside>
  );
}

function IdsRecords({ M }) {
  const R = M.records;
  /* Kind, centre and the range sit behind the funnel (v4); it opens itself
     when something narrows the list, so a narrowed list is never a mystery. */
  const [more, setMore] = React.useState(R.narrowed);
  React.useEffect(() => { if (R.narrowed) setMore(true); }, [R.narrowed]);
  const total = R.filters.reduce((n, f) => n + f.n, 0);
  return (
    <div className="ids-col ids-col--10">
      <div className="ids-searchrow">
        <form role="search" className="ids-search" onSubmit={e => e.preventDefault()}>
          <IdsIcon name="magnifying-glass"/>
          <input ref={M.searchRef} className="ids-input" type="search" placeholder="Name or ID" aria-label="Search records" value={R.q} onChange={e => R.setQ(e.target.value)}/>
        </form>
        <button type="button" className={"ids-funnel" + (more ? " is-on" : "")} aria-pressed={more} aria-expanded={more} aria-controls="ids-filters"
                aria-label={"More filters" + (R.narrowed ? " (some are set)" : "")} title="More filters" onClick={() => setMore(m => !m)}>
          <IdsIcon name="funnel-simple"/>{R.narrowed && <span className="ids-funnel-dot" aria-hidden="true"/>}
        </button>
      </div>
      <div className="ids-status">
        <div className="ids-status-bar" aria-hidden="true">
          {/* Inline on purpose: each segment's share IS the count — data, not chrome. */}
          {total > 0 && R.filters.map(f => f.n > 0 && <span key={f.k} className={"is-" + f.dot + (R.filter === "all" || f.on ? "" : " is-dim")} style={{ flexGrow: f.n }}/>)}
        </div>
        <div className="ids-status-grid" role="group" aria-label="Show">
          {R.filters.map(f => (
            <button key={f.k} type="button" aria-pressed={f.on} title={f.help + (f.on ? ". Press again to show everyone" : "")}
                    className={"ids-statbtn" + (f.on ? " is-on" : "")} onClick={() => M.setFilterToggle(f.k)}>
              <span className={"ids-dot is-" + f.dot}/><span className="ids-statbtn-l">{f.label}</span><span className="ids-statbtn-n">{f.n}</span>
            </button>
          ))}
        </div>
      </div>
      <span className="ids-sr" role="status">{R.shown.length} records shown{R.filter === "all" ? ", everyone" : ""}</span>
      {more && (
        <div id="ids-filters" className="ids-col ids-col--8">
          <div className="ids-row ids-row--8">
            <select className="ids-select ids-select--30" aria-label="Kind" value={R.kind} onChange={e => R.setKind(e.target.value)}>
              <option value="">Every kind</option>{IDS_KIND_IDS.map(k => <option key={k} value={k}>{IDS_KIND_PLURAL[k]}</option>)}
            </select>
            <select className="ids-select ids-select--30" aria-label="Centre" value={R.centre} onChange={e => R.setCentre(e.target.value)}>
              <option value="">Every centre</option>{M.centres.map(c => <option key={c} value={c}>{c}</option>)}
              {R.noCentreCount > 0 && <option value={IDS_NO_CENTRE}>No centre on file · {R.noCentreCount}</option>}
            </select>
          </div>
          <IdsRange R={R}/>
        </div>
      )}
      {/* Shown whatever the filter is: a warning you only see once you went looking is not a warning. */}
      {R.noCentreCount > 0 && R.centre !== IDS_NO_CENTRE && (
        <IdsCheck tone="warn" text={idsN(R.noCentreCount, "card") + " would print with no centre: no colour, no code, nothing saying which site."} action="Show them" onAction={() => { setMore(true); R.setCentre(IDS_NO_CENTRE); }}/>
      )}
      {R.centre === IDS_NO_CENTRE && <p className="ids-note"><span>No centre on the record means no coloured band and no code on the card. Set the centre on their record (Control Room, or the Summer School portal for a participant), then print. Printing them as they are is fine if you mean to.</span></p>}
      {(R.canAddAll || R.canAskAll) && (
        <div className="ids-row ids-row--8">
          {R.canAddAll && <button type="button" className="ids-btn ids-btn--28 ids-btn--ink" onClick={R.addAll}><IdsIcon name="plus"/>Add all {R.addable}</button>}
          {R.canAskAll && <button type="button" className="ids-btn ids-btn--28" onClick={R.askAll}><IdsIcon name="envelope-simple"/>Ask all {R.askable} for a photo</button>}
        </div>
      )}
      {M.dataState !== "ready" ? <IdsLoadState state={M.dataState} onRetry={M.reload} what="the records"/> : (
        <ul className="ids-recs">
          {R.rows.map(r => (
            <li key={r.id} className={"ids-rec" + (r.on ? " is-on" : "") + (r.blocked ? " is-blocked" : "")}>
              <button type="button" role="checkbox" aria-checked={r.on} aria-disabled={r.blocked || undefined} className="ids-cb" aria-label={r.aria} onClick={r.toggle}>
                <IdsIcon name={r.on ? "check" : r.blocked ? "minus" : "check"}/>
              </button>
              <span className="ids-thumb" style={{ "--ids-accent": M.accent(r.centre) }}>
                {r.photoUrl && !r.blocked ? <img src={imgUrl(r.photoUrl, "avatar")} alt="" loading="lazy"/> : idsInitials(r.name)}
              </span>
              <span className="ids-grow ids-rec-text" onClick={r.toggle}>
                <span className="ids-rec-name">{r.name}</span>
                <span className="ids-rec-meta"><span className="ids-mono">{r.displayId || "ID assigned on print"}</span> · {r.centre || "No centre"} · {IDS_KINDS[r.kind]}</span>
                <span className={"ids-rec-tag is-" + r.tagTone}>{r.tag}</span>
              </span>
              {r.blocked && r.canEditPhoto && <button type="button" className="ids-iconbtn" onClick={r.editPhoto} aria-label={"Add a photo for " + r.name} title="Add a photo"><IdsIcon name="camera"/></button>}
              {r.blocked && (r.asked
                ? <button type="button" className="ids-asked" onClick={r.ask} title={"Asked " + r.askedOn + ". Press to ask again"} aria-label={"Asked " + r.askedOn + ". Ask " + r.name + " again"}><IdsIcon name="check"/>Asked</button>
                : <button type="button" className="ids-btn ids-btn--28" onClick={r.ask} aria-label={"Ask for a photo: " + r.name}>Ask for photo</button>)}
            </li>
          ))}
        </ul>
      )}
      {M.dataState === "ready" && R.more > 0 && <button type="button" className="ids-btn ids-btn--more" onClick={R.showMore}>Show {Math.min(IDS_REC_MORE, R.more)} more · {R.rows.length} of {R.shown.length} shown</button>}
      {M.dataState === "ready" && !R.shown.length && <p className="ids-empty">{R.filter === "blocked" ? "Nobody is blocked. Every record has a photo." : R.carded.length ? "Nobody in the queue matches." : R.q.trim() ? "Nobody matches \u201c" + R.q.trim() + "\u201d. Try part of the name or the ID number." : "Nobody matches."}</p>}
      {M.dataState === "ready" && R.carded.length > 0 && <IdsCarded M={M} R={R}/>}
    </div>
  );
}

/* People the search found who already hold a card. Not in the queue, so not
   on the list above; each carries the reasons a card is reprinted. */
function IdsCarded({ M, R }) {
  return (
    <section className="ids-carded" aria-label="Already have a card">
      <h3 className="ids-carded-h"><IdsIcon name="identification-card"/>Already have a card<span className="ids-fchip-n">{R.carded.length + R.cardedMore}</span></h3>
      <ul className="ids-recs">
        {R.carded.map(r => (
          <li key={r.key} className={"ids-rec ids-rec--carded" + (r.open ? " is-open" : "")}>
            <span className="ids-thumb" style={{ "--ids-accent": M.accent(r.centre) }}>
              {r.photoUrl ? <img src={imgUrl(r.photoUrl, "avatar")} alt="" loading="lazy"/> : idsInitials(r.name)}
            </span>
            <span className="ids-grow ids-rec-text">
              <span className="ids-rec-name">{r.name}</span>
              <span className="ids-rec-meta"><span className="ids-mono">{r.displayId || r.id}</span> · {r.centre || "No centre"} · {IDS_KINDS[r.kind]}</span>
              <span className="ids-rec-tag is-ok">{"Has a card" + (r.printedOn ? " · printed " + r.printedOn : "")}</span>
            </span>
            <button type="button" className={"ids-btn ids-btn--28" + (r.open ? " is-on" : "")} aria-expanded={r.open} onClick={r.toggleOpen} aria-label={"Reprint " + r.name + "’s card"}>
              <IdsIcon name="arrow-counter-clockwise"/>Reprint
            </button>
            {r.open && (
              <div className="ids-reasons ids-rec-why" role="group" aria-label={"Why is " + r.name + "’s card being reprinted?"}>
                <span className="ids-muted">Why?</span>
                {IDS_REPRINT_REASONS.map(([k, l, help]) => <button key={k} type="button" className="ids-btn ids-btn--sm ids-btn--outline" title={help} disabled={r.busy} onClick={() => r.reprint(k)}>{l}</button>)}
                <span className="ids-help">Lost and never received get a new QR; the old card stops opening.</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {R.cardedMore > 0 && <p className="ids-empty">{R.cardedMore} more with a card. Type more of the name to narrow it.</p>}
    </section>
  );
}

/* Range: by date registered, by ID number, or a pasted list (the old Card
   Studio's three ways of saying "not everybody"). What it came out as is said
   in words, because a range that matches nothing looks like an empty roster. */
function IdsRange({ R }) {
  const [paste, setPaste] = React.useState("");
  const [pasteMsg, setPasteMsg] = React.useState(null);
  const [reprintBusy, setReprintBusy] = React.useState(false);
  const [reprintWhy, setReprintWhy] = React.useState("damaged");
  const lastDays = n => { const t = new Date(), f = new Date(t.getTime() - (n - 1) * 864e5); R.setRng({ dFrom: f.toISOString().slice(0, 10), dTo: t.toISOString().slice(0, 10) }); };
  const doPaste = () => {
    const res = R.pasteIds(paste);
    if (res.nothing) return setPasteMsg({ tone: "warn", text: "Nothing to match." });
    const bits = [res.matched + " added"];
    if (res.otherSize) bits.push(res.otherSize + " another card size, for their own run");
    if (res.blocked.length) bits.push(res.blocked.length + " need a photo first");
    const few = l => l.slice(0, 6).join(", ") + (l.length > 6 ? " +" + (l.length - 6) : "");
    if (res.hidden.length) bits.push("hidden by the Kind or Centre filter: " + few(res.hidden));
    if (res.carded.length) bits.push("already have a card: " + few(res.carded.map(r => r.displayId || r.id)));
    if (res.miss.length) bits.push("not found: " + few(res.miss));
    const short = res.miss.length || res.hidden.length || res.carded.length || res.blocked.length || res.otherSize;
    setPasteMsg({ tone: short ? "warn" : "ok", text: bits.join(" · "), carded: res.carded });
    if (!short) setPaste("");
  };
  const m = R.rmode || "name";
  const alpha = m === "name" || m === "id";
  const ph = m === "name" ? ["Adaeze", "Funke"] : ["026-001", "026-050"];
  const order = m === "name" ? "name" : R.rangeDigits ? "number" : "ID";
  return (
    <div className="ids-rangebox" role="group" aria-labelledby="ids-range-l">
      <div className="ids-rangebox-top">
        <span className="ids-rangebox-l" id="ids-range-l">Range</span>
        <IdsSeg label="Range by" size="xs" value={m} onChange={v => { R.setRmode(v); setPasteMsg(null); }}
                options={[["name", "Name"], ["id", "ID"], ["date", "Joined"], ["paste", "List"]]}/>
      </div>
      {alpha && (
        <div className="ids-rangebox-row">
          <input className="ids-input ids-input--30" aria-label={m === "name" ? "Names from" : "IDs from"} placeholder={ph[0]} value={R.rng.nFrom} onChange={e => R.setRng({ nFrom: e.target.value })}/>
          <span className="ids-muted">to</span>
          <input className="ids-input ids-input--30" aria-label={m === "name" ? "Names to" : "IDs to"} placeholder={ph[1]} value={R.rng.nTo} onChange={e => R.setRng({ nTo: e.target.value })}/>
        </div>
      )}
      {m === "id" && !R.rangeSet && <span className="ids-help">Printed IDs, or just the numbers at the end (40 to 80).</span>}
      {m === "date" && <>
        <div className="ids-rangebox-row">
          <input type="date" className="ids-input ids-input--30" aria-label="Joined from" value={R.rng.dFrom} onChange={e => R.setRng({ dFrom: e.target.value })}/>
          <span className="ids-muted">to</span>
          <input type="date" className="ids-input ids-input--30" aria-label="Joined to" value={R.rng.dTo} onChange={e => R.setRng({ dTo: e.target.value })}/>
        </div>
        <div className="ids-row ids-row--8">
          <button type="button" className="ids-btn ids-btn--28" onClick={() => lastDays(7)}>Last 7 days</button>
          <button type="button" className="ids-btn ids-btn--28" onClick={() => lastDays(30)}>Last 30 days</button>
        </div>
      </>}
      {m === "paste" && <>
        <label className="ids-sr" htmlFor="ids-paste">IDs to put on the sheet</label>
        <textarea id="ids-paste" className="ids-input ids-input--area" rows={3} placeholder="026-041, EG-26-043 or just 41, 43" value={paste} onChange={e => setPaste(e.target.value)}/>
        <button type="button" className="ids-btn ids-btn--28 ids-btn--outline" disabled={!paste.trim()} onClick={doPaste}><IdsIcon name="plus"/>Put these on the sheet</button>
        {pasteMsg && <span className={"ids-rec-tag is-" + pasteMsg.tone} role="status">{pasteMsg.text}</span>}
        {pasteMsg && pasteMsg.carded && pasteMsg.carded.length > 0 && (
          <label className="ids-field"><span className="ids-muted">Why they need a new card</span>
            <select className="ids-input" value={reprintWhy} onChange={e => setReprintWhy(e.target.value)}>
              {IDS_REPRINT_REASONS.map(([k, l, help]) => <option key={k} value={k}>{l + " — " + help.split(" — ").pop()}</option>)}</select></label>
        )}
        {pasteMsg && pasteMsg.carded && pasteMsg.carded.length > 0 && (
          <button type="button" className="ids-btn ids-btn--sm" disabled={reprintBusy}
            onClick={async () => { setReprintBusy(true); const done = await R.queueReprints(pasteMsg.carded, reprintWhy); setReprintBusy(false); if (done) setPasteMsg({ tone: "ok", text: idsN(pasteMsg.carded.length, "card") + " queued as reprints — paste again to put them on the sheet" }); }}>
            {reprintBusy ? "Queuing…" : "Queue " + idsN(pasteMsg.carded.length, "reprint")}
          </button>
        )}
      </>}
      {R.rangeSet && (
        <p className="ids-rangebox-note" role="status">
          <span className="ids-grow">
            {m === "date"
              ? (R.inRangeN ? R.inRangeN + " of " + R.preRangeN + " joined in this range." : "Nobody joined in this range.") + (R.undated ? " " + idsN(R.undated, "record") + " with no date " + (R.undated === 1 ? "is" : "are") + " left out." : "")
              : (R.inRangeN ? idsN(R.inRangeN, "person", "people") : "Nobody") + " from “" + (R.rangeLo || "the start") + "” to “" + (R.rangeHi || "the end") + "”" + (R.inRangeN ? ", listed in " + order + " order" : "") + "."}
          </span>
          <button type="button" className="ids-linkbtn" onClick={R.clearRange}>Clear</button>
        </p>
      )}
    </div>
  );
}

function IdsUploads({ M }) {
  const U = M.uploadsUI;
  const [over, setOver] = React.useState(false);
  return (
    <div className="ids-col ids-col--12">
      <label className={"ids-drop" + (over ? " is-over" : "")}
             onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
             onDrop={e => { e.preventDefault(); setOver(false); U.read(e.dataTransfer && e.dataTransfer.files); }}>
        <IdsIcon name="upload-simple" className="ids-drop-ico"/>
        <b>Drop finished card images here</b>
        <span className="ids-help">Cards made elsewhere (a printer’s proof, a partner’s badge). PNG, JPG or WebP. Name them “…-front” and “…-back” and they pair up on their own.</span>
        <span className="ids-btn ids-btn--fake">Choose files</span>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="ids-sr" onChange={e => { U.read(e.target.files); e.target.value = ""; }}/>
      </label>
      {U.rows.length ? (
        <ul className="ids-ups">
          {U.rows.map(u => (
            <li key={u.uid} className={"ids-up" + (u.on ? " is-on" : "")}>
              <button type="button" role="checkbox" aria-checked={u.on} aria-disabled={u.isBack || undefined} className="ids-cb" aria-label={(u.on ? "Take " : "Put ") + u.name + (u.on ? " off the sheet" : " on the sheet")} onClick={u.toggle}>
                <IdsIcon name="check"/>
              </button>
              <img className="ids-up-thumb" src={u.src} alt=""/>
              <span className="ids-grow ids-up-text">
                <span className="ids-up-name" title={u.name}>{u.name}</span>
                <span className="ids-muted ids-mono">{u.w} × {u.h} px</span>
                {u.isBack ? <span className="ids-up-backof"><IdsIcon name="arrows-left-right"/>Back of {u.frontName}</span> : (
                  <span className="ids-up-chips"><span className={"ids-chip22 is-" + u.dpi.tone}>{u.dpi.label}</span><span className={"ids-chip22 is-" + u.fit.tone}>{u.fit.label}</span></span>
                )}
                {!u.isBack && (
                  <span className="ids-row ids-row--8">
                    <label className="ids-mini">
                      <span>Back:</span>
                      <select className="ids-select ids-select--28" value={u.back || ""} onChange={e => U.setBack(u.uid, e.target.value)}>
                        <option value="">No back image</option>
                        {U.backChoices(u).map(b => <option key={b.uid} value={b.uid}>{b.name}</option>)}
                      </select>
                    </label>
                    <span className="ids-stepper" role="group" aria-label={"Copies of " + u.name}>
                      <button type="button" aria-label="One fewer" disabled={u.copies <= 1} onClick={() => U.setCopies(u.uid, u.copies - 1)}><IdsIcon name="minus"/></button>
                      <span aria-live="polite">× {u.copies}</span>
                      <button type="button" aria-label="One more" disabled={u.copies >= IDS_COPIES_MAX} onClick={() => U.setCopies(u.uid, u.copies + 1)}><IdsIcon name="plus"/></button>
                    </span>
                  </span>
                )}
              </span>
              <button type="button" className="ids-iconbtn" aria-label={"Remove " + u.name} onClick={() => U.remove(u.uid)}><IdsIcon name="trash"/></button>
            </li>
          ))}
        </ul>
      ) : <p className="ids-empty">Nothing uploaded yet.</p>}
    </div>
  );
}

/* ── Sheet column ───────────────────────────────────────────────────────── */

function IdsSheetCol({ M }) {
  const S = M.sheet;
  const areaRef = React.useRef(null);
  const [area, setArea] = React.useState({ w: 600, h: 600 });
  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || !window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setArea({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const G = M.sheetG;   // the grid of the sheet on screen: each card size has its own
  const scale = G.pw ? Math.max(0.4, Math.min((area.w - 48) / G.pw, (area.h - 72) / G.ph, 3.2)) : 1;
  const [askRemove, setAskRemove] = React.useState(false);
  const onSheet = S.sec ? idsCardsOnSheets(M.sections, S.idx + 1, S.idx + 1).length : 0;
  return (
    <main className="ids-sheetcol" aria-label="Sheet preview">
      {M.job && (
        <div className="ids-job" role="status">
          <IdsIcon name="printer"/>
          <span className="ids-grow">Batch printing · {M.job.done} sheets out, {M.job.total - M.job.done} to go<span className="ids-job-bar"><span style={{ width: (M.job.done / M.job.total * 100) + "%" }}/></span></span>
          <button type="button" className="ids-btn ids-btn--invert" onClick={M.printNextBatch}>Print next {M.job.next[1] - M.job.next[0] + 1} sheets</button>
          <button type="button" className="ids-btn ids-btn--ghost-dark" onClick={M.stopJob}>Stop here</button>
        </div>
      )}

      {M.xjob && (
        <div className="ids-job" role="status">
          <IdsIcon name="file-arrow-down"/>
          <span className="ids-grow">{M.xjob.note || (M.xjob.print ? "Preparing" : "Exporting")} · {Math.min(M.xjob.i, M.xjob.n)} of {M.xjob.n}<span className="ids-job-bar"><span style={{ width: (M.xjob.i / Math.max(1, M.xjob.n) * 100) + "%" }}/></span></span>
          <button type="button" className="ids-btn ids-btn--ghost-dark" onClick={M.stopExport}>Stop</button>
        </div>
      )}

      <div className="ids-toolbar">
        {/* The job sets several things at once; the toast says which, with Undo. */}
        <label className="ids-jobsel" title={(IDS_SCENARIOS.find(x => x.key === M.scen) || IDS_SCENARIOS[0]).hint}>
          <span className="ids-jobsel-l">Job</span>
          <select className="ids-select ids-select--30 ids-select--bare" value={M.scen} onChange={e => M.pickJob(e.target.value)}
                  aria-describedby="ids-job-hint">
            {IDS_SCENARIOS.map(sc => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
          </select>
          <span id="ids-job-hint" className="ids-sr">{(IDS_SCENARIOS.find(x => x.key === M.scen) || IDS_SCENARIOS[0]).hint}</span>
        </label>
        <div className="ids-pager">
          <button type="button" className="ids-iconbtn" aria-label="Previous sheet" disabled={S.idx <= 0} onClick={() => S.go(S.idx - 1)}><IdsIcon name="caret-left"/></button>
          <span aria-live="polite">Sheet {S.count ? S.idx + 1 : 0} of {S.count}{S.sec && M.sections.length > 1 ? <span className="ids-pager-size"> · {idsMmLabel(S.sec.mm)}</span> : null}</span>
          <button type="button" className="ids-iconbtn" aria-label="Next sheet" disabled={S.idx >= S.count - 1} onClick={() => S.go(S.idx + 1)}><IdsIcon name="caret-right"/></button>
          {onSheet > 0 && !S.overview && (
            <button type="button" className="ids-iconbtn ids-iconbtn--danger" aria-label={"Remove sheet " + (S.idx + 1) + " and its " + idsN(onSheet, "card")} title="Remove this sheet"
                    disabled={!!M.xjob} onClick={() => setAskRemove(true)}><IdsIcon name="trash"/></button>
          )}
        </div>
        {M.backs !== "off" && <IdsSeg label="Side" size="sm" value={S.face} onChange={S.setFace} options={[["front", "Fronts"], ["back", "Backs"]]}/>}
        <span className="ids-stat">{idsN(M.nCards, "card")} · {idsN(S.count, "sheet")}{M.backs !== "off" ? " · double-sided" : ""}</span>
        <IdsSeg label="View" size="sm" value={S.overview ? "all" : "one"} onChange={v => S.setOverview(v === "all")} options={[["all", "All sheets", "squares-four"], ["one", "One sheet", "square"]]}/>
        {M.improve.n > 0 && <button type="button" className="ids-btn ids-btn--sm" disabled={!!M.xjob} onClick={M.improve.open}><IdsIcon name="magic-wand"/>Improve photos</button>}
        {M.selCard && (
          <div className="ids-seltools" role="toolbar" aria-label={"Selected: " + M.selCard.label}>
            <span className="ids-seltools-name" title={M.selCard.label}>{M.selCard.label}</span>
            <button type="button" className="ids-iconbtn" aria-label="Move earlier" onClick={() => M.moveSel(-1)}><IdsIcon name="arrow-left"/></button>
            <button type="button" className="ids-iconbtn" aria-label="Move later" onClick={() => M.moveSel(1)}><IdsIcon name="arrow-right"/></button>
            {M.canEditPhotoSel && <button type="button" className="ids-btn ids-btn--sm" onClick={M.editPhotoSel}><IdsIcon name="camera"/>Edit photo</button>}
            {M.canFrameSel && <button type="button" className="ids-btn ids-btn--sm" onClick={M.frameSel}><IdsIcon name="crop"/>Frame photo</button>}
            {M.canResendSel && <button type="button" className="ids-btn ids-btn--sm" disabled={!!M.resending} onClick={M.resendSel}><IdsIcon name="paper-plane-tilt"/>{M.resending === M.selCard.key ? "Sending…" : "Resend ID"}</button>}
            {M.selCard.upload && <>
              <button type="button" className="ids-btn ids-btn--sm" onClick={M.rotateSel}><IdsIcon name="arrow-clockwise"/>Rotate 90°</button>
              <button type="button" className="ids-btn ids-btn--sm" onClick={M.toggleFitSel}>{M.selCard.upload.fit === "contain" ? "Fill the card" : "Fit whole image"}</button>
            </>}
            <button type="button" className="ids-btn ids-btn--sm" disabled={!!M.xjob} onClick={M.pngSel}><IdsIcon name="download-simple"/>PNG</button>
            <button type="button" className="ids-btn ids-btn--sm ids-btn--danger" onClick={M.removeSel}><IdsIcon name="x"/>Take off the sheet</button>
          </div>
        )}
      </div>

      {askRemove && (
        <IdsDialog alert width={460} title={"Remove sheet " + (S.idx + 1) + "?"} onClose={() => setAskRemove(false)}
          footer={<>
            <button type="button" className="ids-btn" onClick={() => setAskRemove(false)}>Cancel</button>
            <button type="button" className="ids-btn ids-btn--primary" data-autofocus onClick={() => { setAskRemove(false); S.remove(S.idx); }}>Remove {idsN(onSheet, "card")}</button>
          </>}>
          <p className="ids-note"><span>The {idsN(onSheet, "card")} on it come off this run; the sheets after it move up. Nothing is deleted from anyone’s record, and you can undo it.</span></p>
        </IdsDialog>
      )}

      {M.gap > 0 && !(M.breakActive && M.pads) && (
        <div className="ids-gapbar">
          <span className="ids-grow">{idsN(M.gap, "empty slot")} on the last sheet. Card stock is wasted unless you fill them.</span>
          {M.fillable > 0 && <button type="button" className="ids-linkbtn" onClick={M.fillGap}>Fill with {Math.min(M.gap, M.fillable)} more ready cards</button>}
        </div>
      )}

      <div className="ids-canvas" ref={areaRef}>
        {!M.nCards ? (
          <div className="ids-canvas-empty">
            <IdsIcon name="identification-card" className="ids-canvas-empty-ico"/>
            <b>Nothing on the sheet yet</b>
            <p>Tick people on the left, or upload cards made elsewhere. The sheet fills as you go and shows exactly what comes out of the printer.</p>
            {M.records.canAddAll && <button type="button" className="ids-btn ids-btn--primary" onClick={M.records.addAll}>Add {M.records.addable} to the sheet</button>}
          </div>
        ) : !G.per ? (
          <div className="ids-canvas-empty"><IdsIcon name="warning" className="ids-canvas-empty-ico"/><b>Cards this size don’t fit on {IDS_PAPERS[G.paper][0]} with these margins.</b></div>
        ) : S.overview ? <IdsOverview M={M}/> : (
          <figure className="ids-sheetfig">
            <div className="ids-sheet" style={{ width: G.pw * scale + "px", height: G.ph * scale + "px" }}
                 onClick={e => { if (e.target === e.currentTarget) M.select(null); }}>
              <div className="ids-sheet-margin" style={{ left: G.m * scale, top: G.m * scale, right: G.m * scale, bottom: G.m * scale }}/>
              {M.marks && idsCutMarks(G).map((m, k) => <i key={"m" + k} className="ids-sheet-mark" style={{ left: m.x * scale, top: m.y * scale, width: Math.max(1, m.w * scale), height: Math.max(1, m.h * scale) }}/>)}
              {Array.from({ length: G.per }, (_, i) => <IdsSlot key={i} M={M} i={i} scale={scale}/>)}
            </div>
            <figcaption className="ids-sheet-cap">
              {IDS_PAPERS[G.paper][0]} · {G.cols} × {G.rows} cards at {idsMmLabel([G.cw, G.ch])}{M.backs !== "off" ? " · mirrored for " + M.backs + "-edge flip" : ""} · drag, or select and use the arrow keys, to reorder
            </figcaption>
          </figure>
        )}
      </div>
    </main>
  );
}

function IdsSlot({ M, i, scale }) {
  const G = M.sheetG, S = M.sheet;
  const face = S.face;
  const p = idsSlotPos(G, i, face === "back" ? M.backs : null);
  const { s, used } = idsSlotAt(M.sections, S.idx, i);
  const secKey = S.sec ? S.sec.key : "";
  const box = { left: p.x * scale, top: p.y * scale, width: G.cw * scale, height: G.ch * scale, borderRadius: G.cw * scale * 0.06 };
  if (used) return <div className="ids-slot is-used" style={box}><span>Used</span></div>;
  if (!s || s.pad) return <div className="ids-slot is-empty" style={box} onClick={() => M.select(null)} onDragOver={e => e.preventDefault()} onDrop={e => M.dropAt(e, null, secKey)}/>;
  const k = (G.cw * scale) / (G.cw * 3.7795);   // css px per real px at true mm size
  const sel = M.sel === s.key;
  const warn = s.warn;
  return (
    <div className={"ids-slot is-card" + (sel ? " is-sel" : "")} style={box} role="button" tabIndex={0} aria-pressed={sel}
         aria-label={"Slot " + (i + 1) + ": " + s.label + (warn ? " — " + warn.text : "") + (sel ? ", selected" : "")}
         draggable onDragStart={e => { e.dataTransfer.setData("text/plain", s.key); e.dataTransfer.effectAllowed = "move"; }}
         onDragOver={e => e.preventDefault()} onDrop={e => M.dropAt(e, s.key, secKey)}
         onClick={() => M.select(sel ? null : s.key)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); M.select(sel ? null : s.key); } }}>
      {/* A short-edge back is drawn turned 180°, exactly as it prints. */}
      <div className="ids-slot-face" style={{ width: G.cw + "mm", height: G.ch + "mm", transform: "scale(" + k + ")" + (p.rot ? " translate(100%, 100%) rotate(180deg)" : "") }}>{M.renderFace(s, face)}</div>
      <span className="ids-slot-n">{i + 1}</span>
      {warn && <span className={"ids-slot-warn is-" + warn.tone} title={warn.text}><IdsIcon name="warning"/></span>}
      {M.proof && <span className="ids-slot-proof">PROOF</span>}
    </div>
  );
}

function IdsOverview({ M }) {
  const S = M.sheet;
  const n = Math.min(S.count, IDS_OVERVIEW_MAX);
  return (
    <div className="ids-overview">
      <div className="ids-ov-grid">
        {Array.from({ length: n }, (_, p) => {
          const cells = [], centres = new Set();
          const at = idsSheetAt(M.sections, p), G = at ? at.sec.G : M.sheetG;
          let filled = 0;
          for (let i = 0; i < G.per; i++) {
            const { s, used } = idsSlotAt(M.sections, p, i);
            if (s && !s.pad) { filled++; if (s.centre) centres.add(s.centre); }
            cells.push(<span key={i} className={"ids-ov-cell" + (used ? " is-used" : !s || s.pad ? " is-empty" : s.upload ? " is-up" : "")}
                             style={s && !s.pad && !s.upload ? { "--ids-accent": M.accent(s.centre) } : undefined}/>);
          }
          return (
            <button key={p} type="button" className={"ids-ov" + (p === S.idx ? " is-on" : "")} onClick={() => { S.go(p); S.setOverview(false); }}>
              <span className="ids-ov-sheet" style={{ gridTemplateColumns: "repeat(" + G.cols + ", 1fr)", aspectRatio: G.pw + " / " + G.ph }}>{cells}</span>
              <b>Sheet {p + 1}</b>
              <span className="ids-muted">{filled}/{G.per}{M.sections.length > 1 ? " · " + idsMmLabel([G.cw, G.ch]) : ""}{centres.size ? " · " + [...centres].join(", ") : ""}</span>
            </button>
          );
        })}
      </div>
      {S.count > IDS_OVERVIEW_MAX && <p className="ids-note">Showing the first {IDS_OVERVIEW_MAX} of {S.count} sheets. Use the arrows for the rest.</p>}
    </div>
  );
}

/* ── Settings column ────────────────────────────────────────────────────── */

/* Volunteer tiers: the code and the band colour a volunteer card is printed
   in. The old Card Studio was the only screen that managed them, so the
   rebuild left no way to add or remove one. Restored here, beside the cards
   they colour; gated on `people` by the server, like the volunteer cards.
   (Centres colour the other cards, but a centre is owned by People and is
   edited in the Control Room's centre directory, not here — CLAUDE.md §4.) */
function IdsTiers({ onChanged }) {
  const [st, setSt] = React.useState({ state: "loading", tiers: [] });
  const [f, setF] = React.useState({ name: "", code: "", color: "#00225F" });
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [del, setDel] = React.useState(null);
  const load = React.useCallback(() => {
    setSt(s => Object.assign({}, s, { state: "loading" }));
    NGGApi.admin.registration.hierarchy().then(r => setSt({ state: "ready", tiers: r.tiers || [] })).catch(() => setSt({ state: "error", tiers: [] }));
  }, []);
  React.useEffect(load, [load]);
  const add = () => {
    setMsg(""); setBusy(true);
    NGGApi.admin.registration.hierarchyUpsert({ name: f.name.trim(), code: f.code.trim(), color: f.color })
      .then(() => { setF({ name: "", code: "", color: "#00225F" }); load(); onChanged && onChanged(); })
      .catch(e => setMsg((e && e.code) === "code_taken" ? "That code is already used by another tier." : (e && e.code) === "bad_code" ? "The code is 1 to 4 letters or digits." : (e && e.code) === "bad_name" ? "The name needs at least 2 characters." : "Couldn’t add the tier. Try again."))
      .then(() => setBusy(false));
  };
  const remove = t => {
    setDel(null);
    NGGApi.admin.registration.hierarchyDelete(t.tierId).then(() => { load(); onChanged && onChanged(); }).catch(() => setMsg("Couldn’t remove " + t.name + ". Try again."));
  };
  const near = typeof colourNeighbours === "function" ? colourNeighbours(f.color, st.tiers) : [];
  const unreadable = /^#[0-9a-fA-F]{6}$/.test(f.color) && typeof inkIsLegible === "function" && !inkIsLegible(f.color, 4.5);
  return (
    <section className="ids-sec" aria-labelledby="ids-tiers-h">
      <h2 className="ids-h2" id="ids-tiers-h">Volunteer tiers</h2>
      <p className="ids-note"><span>A volunteer card is banded in its tier’s colour and its ID starts with the tier’s code.</span></p>
      {st.state !== "ready" ? <IdsLoadState state={st.state} onRetry={load} what="the tiers"/> : (
        st.tiers.length ? (
          <ul className="ids-tiers">
            {st.tiers.map(t => (
              <li key={t.tierId} className="ids-row ids-row--8">
                {/* Inline on purpose: the swatch's background IS the tier's colour — data, not chrome. */}
                <span className="ids-swatch" style={{ background: t.color }}/>
                <span className="ids-grow">{t.name} · <span className="ids-mono">{t.code}</span></span>
                <button type="button" className="ids-iconbtn" aria-label={"Remove the " + t.name + " tier"} onClick={() => setDel(t)}><IdsIcon name="trash"/></button>
              </li>
            ))}
          </ul>
        ) : <p className="ids-empty">No tiers yet. Add the first below; volunteer cards are coloured by tier.</p>
      )}
      <div className="ids-row">
        <label className="ids-num"><span className="ids-num-l">Tier name</span><span className="ids-num-box"><input value={f.name} placeholder="Team lead" onChange={e => setF(x => Object.assign({}, x, { name: e.target.value }))}/></span></label>
        <label className="ids-num"><span className="ids-num-l">Code</span><span className="ids-num-box"><input value={f.code} maxLength={4} placeholder="LED" onChange={e => setF(x => Object.assign({}, x, { code: e.target.value.toUpperCase() }))}/></span></label>
      </div>
      <div className="ids-row ids-row--8">
        <label className="ids-mini"><span>Card colour</span><input type="color" aria-label="Card colour" value={f.color} onChange={e => setF(x => Object.assign({}, x, { color: e.target.value }))}/></label>
        <button type="button" className="ids-btn ids-btn--sm" disabled={busy || f.name.trim().length < 2 || !f.code.trim()} onClick={add}><IdsIcon name="plus"/>Add tier</button>
      </div>
      {near.length > 0 && <IdsCheck tone="warn" text={"That colour is close to " + near.map(n => n.name).join(", ") + ". Cards that look alike can’t be told apart across a room."}/>}
      {unreadable && <IdsCheck tone="warn" text="Neither black nor white text reads well on that colour (under 4.5:1). Nudge it darker or lighter."/>}
      {msg && <IdsCheck tone="bad" text={msg}/>}
      {del && (
        <IdsDialog alert width={440} title={"Remove the " + del.name + " tier?"} onClose={() => setDel(null)}
          footer={<><button type="button" className="ids-btn" onClick={() => setDel(null)}>Cancel</button><button type="button" className="ids-btn ids-btn--primary" data-autofocus onClick={() => remove(del)}>Remove</button></>}>
          <p className="ids-note"><span>Cards already printed keep the colour they were printed with. Volunteers in this tier print in the default colour until they are given another.</span></p>
        </IdsDialog>
      )}
    </section>
  );
}

/** The standard lanyard card's size (Summer School and volunteers). The member card is fixed at ID-1 and says so. */
function IdsLanyardSize({ L }) {
  const [w, setW] = React.useState(L.w), [h, setH] = React.useState(L.h);
  React.useEffect(() => { setW(L.w); setH(L.h); }, [L.w, L.h]);
  const dirty = w !== L.w || h !== L.h;
  return (
    <div className="ids-field">
      <span className="ids-field-l">Standard Summer School and volunteer card</span>
      <div className="ids-row">
        <IdsNum id="ids-lw" label="Width (mm)" value={w} min={50} max={60} onChange={setW}/>
        <IdsNum id="ids-lh" label="Height (mm)" value={h} min={64} max={100} onChange={setH}/>
      </div>
      <button type="button" className="ids-btn ids-btn--sm" disabled={!dirty || L.busy} onClick={() => L.save(w, h)}>{L.busy ? "Saving…" : "Save size"}</button>
      <span className="ids-help">Default 54 × 75 mm, width 50–60, height 64–100. The card reflows to it; the preview, the sheet and the export follow.{L.hasMembers ? " Member cards are fixed at 54 × 85 mm (ID-1)." : ""}</span>
    </div>
  );
}

/* A section that is set up once and rarely changed: closed by default, with
   what it holds summed up on its own line, and remembered open or closed in
   this browser. The settings every print touches stay above it, open. */
function IdsMore({ id, title, summary, icon, open: dflt, children }) {
  const key = "ngg.ids.more." + id;
  const [open, setOpen] = React.useState(() => { try { const v = localStorage.getItem(key); return v == null ? !!dflt : v === "1"; } catch (_) { return !!dflt; } });
  return (
    <details className="ids-more" open={open} onToggle={e => { const o = e.currentTarget.open; setOpen(o); try { localStorage.setItem(key, o ? "1" : "0"); } catch (_) {} }}>
      <summary className="ids-more-sum">
        {icon && <IdsIcon name={icon} className="ids-more-ico"/>}
        <span className="ids-more-t">{title}</span><span className="ids-more-s">{summary}</span><IdsIcon name="caret-down" className="ids-more-caret"/>
      </summary>
      <div className="ids-more-body">{children}</div>
    </details>
  );
}

/* Settings (v4): the checks first, because they say whether you can print;
   then Layout, open; then Printing and Designs, which are set once and rarely
   touched, closed with a summary line. Print itself is in the header. */
function IdsSettings({ M }) {
  const set = M.set, st = M.settings, G = M.G;
  const assigned = M.designsUI.filter(d => d.value);
  const designSum = assigned.length ? assigned.map(d => d.label + ": " + ((d.options.find(o => o.templateId === d.value) || {}).name || "a design")).join(" · ") : "Standard cards";
  const sec0 = (M.sections[0] || {}).G || G;
  const layoutSum = [IDS_PAPERS[st.paper][0], idsN(sec0.per, "card") + " per sheet", "by " + ((IDS_ORDERS.find(o => o[0] === st.order) || IDS_ORDERS[0])[1]).toLowerCase()].join(" · ");
  const printSum = [(IDS_BACKS.find(b => b[0] === st.backs) || IDS_BACKS[0])[1], st.marks ? "cut marks" : "no cut marks", st.dpi + " dpi"].join(" · ");
  return (
    <aside className="ids-set" aria-label="Settings">
      <div className="ids-set-scroll">
        <section className="ids-sec ids-checks" aria-label="Checks" aria-live="polite">
          {M.checks.length ? M.checks.map((c, i) => <IdsCheck key={i} tone={c.tone} text={c.text} action={c.action} onAction={c.onAction}/>)
            : <IdsCheck tone="info" text="Put cards on the sheet and the checks appear here."/>}
        </section>

        <IdsMore id="layout" title="Layout" icon="layout" summary={layoutSum} open>
          <section className="ids-sec">
            <h2 className="ids-h2">Card size for uploads</h2>
            <div className="ids-sizes" role="radiogroup" aria-label="Card size for uploads">
              {IDS_SIZE_IDS.map(k => (
                <button key={k} type="button" role="radio" aria-checked={st.size === k} className={"ids-size" + (st.size === k ? " is-on" : "")} onClick={() => set({ size: k })}>
                  <b>{IDS_SIZES[k][0]}</b><span>{IDS_SIZES[k][1]}</span>
                </button>
              ))}
            </div>
            {st.size === "custom" && (
              <div className="ids-row">
                <IdsNum id="ids-cw" label="Width (mm)" value={st.cw} min={IDS_CUSTOM_LIMITS.min} max={IDS_CUSTOM_LIMITS.maxW} step={0.1} onChange={v => set({ cw: v })}/>
                <IdsNum id="ids-ch" label="Height (mm)" value={st.ch} min={IDS_CUSTOM_LIMITS.min} max={IDS_CUSTOM_LIMITS.maxH} step={0.1} onChange={v => set({ ch: v })}/>
              </div>
            )}
            <span className="ids-help">Cards from records print at their own card’s size. When a run holds more than one size, each size gets its own sheets.</span>
          </section>
          <section className="ids-sec">
            <h2 className="ids-h2">Paper</h2>
            <IdsSeg label="Paper" value={st.paper} onChange={v => set({ paper: v })} options={IDS_PAPER_IDS.map(k => [k, IDS_PAPERS[k][0]])}/>
            <div className="ids-row">
              <IdsNum id="ids-margin" label="Margin (mm)" value={st.margin} min={IDS_MARGIN.min} max={IDS_MARGIN.max} onChange={v => set({ margin: v })}/>
              <IdsNum id="ids-gap" label="Gap (mm)" value={st.gap} min={IDS_GAP.min} max={IDS_GAP.max} onChange={v => set({ gap: v })}/>
            </div>
            {(M.sections.length ? M.sections : [{ key: "up", mm: [G.cw, G.ch], G }]).map(sec => (
              <p key={sec.key} className="ids-perline" aria-live="polite"><b>{idsN(sec.G.per, "card")}</b> per sheet · {sec.G.cols} across, {sec.G.rows} down{M.sections.length > 1 ? " · " + idsMmLabel(sec.mm) : ""}</p>
            ))}
            {!G.per && <IdsCheck tone="bad" text={"Cards this size don’t fit on " + IDS_PAPERS[G.paper][0] + " with these margins."}/>}
            <IdsNum id="ids-skip" inline label="Skip used slots on sheet 1" help="For a part-used sheet of card stock" value={st.skip} min={0} max={Math.max(0, sec0.per - 1)} onChange={v => set({ skip: v })}/>
          </section>
          <section className="ids-sec">
            <h2 className="ids-h2">Order on the sheet</h2>
            <IdsSeg label="Order" value={st.order} onChange={M.setOrder} options={IDS_ORDERS}/>
            {(st.order === "centre" || st.order === "kind") && <>
              <IdsSwitch id="ids-break" on={st.breakBy} onChange={v => set({ breakBy: v })} label={"New sheet for each " + st.order}
                         help="Only for groups that fill a sheet. Smaller groups share one, so no stock is wasted."/>
              {st.breakBy && M.pads > 0 && <p className="ids-note">{idsN(M.pads, "slot")} left blank so the piles never mix</p>}
            </>}
            <p className="ids-stock"><IdsIcon name="stack"/>{idsN(M.stock.sheets, "sheet")} of card stock · {M.stock.sides} printed sides · {M.stock.used}% used</p>
          </section>
        </IdsMore>

        <IdsMore id="printing" title="Printing" icon="printer" summary={printSum}>
          <section className="ids-sec">
            <h2 className="ids-h2">Backs</h2>
            <div className="ids-radios" role="radiogroup" aria-label="Backs">
              {IDS_BACKS.map(([k, l, sub]) => (
                <button key={k} type="button" role="radio" aria-checked={st.backs === k} className={"ids-radio" + (st.backs === k ? " is-on" : "")} onClick={() => set({ backs: k })}>
                  <span className="ids-radio-dot"/><span className="ids-grow"><b>{l}</b>{st.backs === k && <span>{sub}</span>}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="ids-sec">
            <IdsSwitch id="ids-marks" on={st.marks} onChange={v => set({ marks: v })} label="Cut marks"/>
            <label className="ids-field">
              <span className="ids-field-l">Image quality</span>
              <select className="ids-select" value={st.dpi} onChange={e => set({ dpi: +e.target.value })}>{IDS_DPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            {M.nCards > 0 && !M.printBlock && (
              <p className="ids-ready" role="status" aria-live="polite">
                {M.warm.busy ? "Preparing in the background · " + M.warm.ready + " of " + M.warm.total + " faces"
                  : M.warm.total && M.warm.ready >= M.warm.total ? "Print-ready · makes a PDF at " + M.dpi + " dpi" : "Makes a PDF at " + M.dpi + " dpi"}
              </p>
            )}
            <button type="button" className="ids-btn ids-btn--34" onClick={M.printTest} disabled={!M.sheetG.per || !!M.xjob}><IdsIcon name="crosshair"/>Print an alignment test</button>
            <button type="button" className="ids-btn ids-btn--34" onClick={M.startExport} disabled={!!M.xjob}><IdsIcon name="file-pdf"/>Export files for a print shop</button>
          </section>
        </IdsMore>

        <IdsMore id="designs" title="Designs" icon="paint-brush" summary={designSum}>
          <section className="ids-sec" aria-labelledby="ids-designs-h">
            <h2 className="ids-h2 ids-sr" id="ids-designs-h">Designs</h2>
            {M.designsUI.map(d => (
              <label key={d.kind} className="ids-field">
                <span className="ids-field-l">{d.label}</span>
                <select className="ids-select" value={d.value} disabled={d.busy} onChange={e => M.setDesign(d.kind, e.target.value)}>
                  <option value="">Standard card</option>
                  {d.options.map(o => <option key={o.templateId} value={o.templateId}>{o.name} · v{o.version}{o.paired ? " · with back" : ""}</option>)}
                </select>
                <span className="ids-help">{d.help}</span>
              </label>
            ))}
            {!M.designsUI.length && <p className="ids-note">No card type you can print.</p>}
            {M.lanyardUI && <IdsLanyardSize L={M.lanyardUI}/>}
            <p className="ids-note"><span>Only published designs are offered. Draw and publish them in the <a className="ids-linkbtn" href="/designer" onClick={M.openDesigner}>Design Studio</a>; every run logs the version it used.</span></p>
          </section>
          {M.hasVolunteers && <IdsTiers onChanged={M.reload}/>}
        </IdsMore>
      </div>
    </aside>
  );
}

/* ── Improve photos: one Cloudinary edit for everybody on the sheet ─────────
   The single-photo editor's controls, applied to every photographed person on
   the sheet. The count is shown before anything runs, and the result says who
   was changed, who already looked like this, and who could not be. */
const IDS_FOCUS = [["face", "Face"], ["center", "Centre"], ["north", "Top"], ["south", "Bottom"]];
function IdsImproveDialog({ run, preset, onCancel, onStart }) {
  // The assistant opens it with what was asked ("remove their backgrounds") already set; the operator still presses Improve.
  const [spec, setSpec] = React.useState(Object.assign({ gravity: "face", zoom: 1, brighten: false, sharpen: false, removeBg: false }, preset || {}));
  const set = (k, v) => setSpec(x => Object.assign({}, x, { [k]: v }));
  return (
    <IdsDialog alert width={500} title={"Improve " + idsN(run.n, "photo") + "?"}
      sub="Cloudinary reframes and cleans each photo, then the cards on the sheet redraw. A photo stored on this site is uploaded to Cloudinary first."
      onClose={onCancel}
      footer={<>
        <button type="button" className="ids-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="ids-btn ids-btn--primary" data-autofocus onClick={() => onStart(spec)}>Improve {idsN(run.n, "photo")}</button>
      </>}>
      <IdsSeg label="Focus on" value={spec.gravity} onChange={v => set("gravity", v)} options={IDS_FOCUS}/>
      <IdsNum id="ids-imp-zoom" inline label="Zoom" help="1 keeps the whole photo; higher crops in on the focus" value={spec.zoom} min={1} max={2.5} step={0.05} onChange={v => set("zoom", v)}/>
      <IdsSwitch id="ids-imp-bright" on={spec.brighten} onChange={v => set("brighten", v)} label="Brighten" help="Lifts dark, under-exposed photos"/>
      <IdsSwitch id="ids-imp-sharp" on={spec.sharpen} onChange={v => set("sharpen", v)} label="Sharpen" help="For soft or slightly blurred photos"/>
      <IdsSwitch id="ids-imp-bg" on={spec.removeBg} onChange={v => set("removeBg", v)} label="Plain grey background" help="Removes the background (uses Cloudinary credits)"/>
      <p className="ids-note"><span>Every photo also gets Cloudinary’s automatic clean-up and a passport-shaped crop. Nothing is generated: faces are reframed and adjusted, never redrawn.</span></p>
    </IdsDialog>
  );
}

const IDS_IMPROVE_WHY = { no_photo: "no photo on file", photo_missing: "the stored photo file is missing", upload_failed: "Cloudinary didn’t accept the upload",
  not_found: "no longer on the lists", out_of_scope: "outside your centres", cloudinary_not_configured: "Cloudinary isn’t set up" };
function IdsImproveResult({ res, onClose }) {
  return (
    <IdsDialog width={500} title={res.applied ? "Photos improved" : "No photo was changed"} onClose={onClose}
      footer={<button type="button" className="ids-btn ids-btn--primary" data-autofocus onClick={onClose}>Done</button>}>
      {res.applied > 0 && <IdsCheck tone="ok" text={idsN(res.applied, "photo") + " improved. The cards on the sheet are redrawing."}/>}
      {res.unchanged > 0 && <IdsCheck tone="info" text={idsN(res.unchanged, "photo") + " already looked like this, so " + (res.unchanged === 1 ? "it was" : "they were") + " left as " + (res.unchanged === 1 ? "it was." : "they were.")}/>}
      {res.failed.length > 0 && <IdsCheck tone="bad" text={idsN(res.failed.length, "photo") + " couldn’t be improved:"}/>}
      {res.failed.length > 0 && <ul className="ids-people" tabIndex={0} aria-label="Photos not improved">{res.failed.map((f, i) => <li key={i}>{f.name} · {IDS_IMPROVE_WHY[f.error] || f.error}</li>)}</ul>}
    </IdsDialog>
  );
}

/* ── Frame one photo by hand ──────────────────────────────────────────────
   Gemini's measurement frames every card; this is where a person corrects it
   for one photograph — zoom, move, or show the whole photo — and the choice
   applies on every card that photo is on (photo_framing.adjustJson). Three
   previews at three card shapes, so a framing that works on one is seen on
   the others. Every control is a button, and the arrow and +/− keys work
   too: nothing needs a drag. */
const IDS_FRAME_STEP = { zoom: 0.08, move: 0.03 };
/* The photograph box each card type prints, read from its renderer — never a
   list of its own. This list once said "Member card" for a portrait box no card
   has, "Summer School" for the volunteer card's landscape box, and "Round" for
   what is in fact the Summer School card, so a photo was framed against the
   wrong card. A type with an assigned design prints that design's photo box. */
function idsPhotoShape(kind, design) {
  const box = design && design.published && typeof tplPhotoBox === "function" ? tplPhotoBox(design.published) : null;
  if (box) return { ar: box.round ? 1 : box.w / box.h, round: box.round, design: true };
  if (kind === "member") return { ar: NGGC_PHOTO_MM.w / NGGC_PHOTO_MM.h, round: false };
  if (kind === "summer") return { ar: 1, round: !!CARD_FRONT_PHOTO.round };
  if (kind === "volunteer") return { ar: VOL_CARD_PHOTO.w / VOL_CARD_PHOTO.h, round: false };
  return null;
}
/* The person's own card first, as it prints; then the other standard cards a
   shared photograph can also be on, each under its own name. */
function idsFrameShapes(rec, designOfKind) {
  const own = idsPhotoShape(rec.kind, designOfKind ? designOfKind(rec.kind) : null);
  const out = own ? [{ key: rec.kind, label: (IDS_KINDS[rec.kind] || "This") + " card" + (own.design ? " · its design" : ""), own: true, ar: own.ar, round: own.round }] : [];
  ["member", "summer", "volunteer"].filter(k => k !== rec.kind).forEach(k => {
    const s = idsPhotoShape(k, designOfKind ? designOfKind(k) : null);
    if (s) out.push({ key: k, label: IDS_KINDS[k] + " card" + (s.design ? " · its design" : ""), own: false, ar: s.ar, round: s.round });
  });
  return out;
}
function IdsPhotoFrame({ rec, say, onClose, onSaved, designOfKind }) {
  const url = nggPhotoSrc(rec.photoUrl);
  const start = React.useRef(undefined);
  const [adj, setAdj] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [note, setNote] = React.useState("");
  const base = { zoom: 1, dx: 0, dy: 0, whole: false };
  React.useEffect(() => {
    let live = true;
    cphHintGet(url).then(h => { if (!live) return; start.current = h || null; setAdj(Object.assign({}, base, h && h.adjust)); });
    return () => { live = false; };
  }, [url]); // eslint-disable-line
  // Live preview: the working choice goes into the shared cache, and back out on cancel.
  React.useEffect(() => { if (adj && start.current !== undefined) cphHintsPut({ [url]: { geom: start.current && start.current.geom, adjust: adj } }); }, [adj]); // eslint-disable-line
  const cancel = () => { if (start.current !== undefined) cphHintsPut({ [url]: start.current }); onClose(); };
  const geom = start.current && start.current.geom;
  const measured = !!(geom && geom.subject);
  const step = (k, d) => setAdj(a => {
    const n = Object.assign({}, a, { whole: false });
    if (k === "zoom") n.zoom = Math.round(Math.max(0.6, Math.min(2, n.zoom + d)) * 100) / 100;
    else n[k] = Math.round(Math.max(-0.5, Math.min(0.5, n[k] + d)) * 100) / 100;
    return n;
  });
  const keys = e => {
    const m = { ArrowLeft: ["dx", -IDS_FRAME_STEP.move], ArrowRight: ["dx", IDS_FRAME_STEP.move], ArrowUp: ["dy", -IDS_FRAME_STEP.move], ArrowDown: ["dy", IDS_FRAME_STEP.move],
      "+": ["zoom", IDS_FRAME_STEP.zoom], "=": ["zoom", IDS_FRAME_STEP.zoom], "-": ["zoom", -IDS_FRAME_STEP.zoom] }[e.key];
    if (m && !(e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) { e.preventDefault(); step(m[0], m[1]); }
  };
  const save = async (reset) => {
    setBusy(reset ? "reset" : "save");
    try {
      const r = await NGGApi.admin.photoFrame.adjust(url, reset ? null : adj, !!reset);
      start.current = { geom: r.geom || null, adjust: r.adjust || null };
      cphHintsPut({ [url]: start.current });
      onSaved && onSaved();
      say(reset ? rec.name + "’s photo is framed automatically again" : rec.name + "’s photo framing is saved, on every card it’s on");
      onClose();
    } catch (e) { setNote(idsErrText(e, "Couldn’t save the framing.")); setBusy(""); }
  };
  const remeasure = async () => {
    setBusy("ai"); setNote("");
    try {
      const r = await NGGApi.admin.photoFrame.frame([url], true);
      const v = (r.framing || {})[url] || {};
      start.current = { geom: v.geom || null, adjust: (start.current && start.current.adjust) || null };
      setAdj(a => Object.assign({}, a));
      setNote(v.geom && v.geom.subject ? "Measured again: " + (v.geom.kind === "headshot" ? "a headshot" : v.geom.kind === "half" ? "a half-length photo" : v.geom.kind === "full" ? "a full-length photo" : v.geom.kind) + (v.geom.people > 1 ? ", " + v.geom.people + " people in it — framed on the main one" : "") + "."
        : v.status === "failed" ? "Gemini couldn’t read this photo. Frame it by hand, or replace the photo." : "No single clear face was found. Frame it by hand, or replace the photo.");
    } catch (e) { setNote(e && e.code === "ai_disabled" ? "Add a Gemini key in Control Room → Settings → Photo framing first." : idsErrText(e, "Couldn’t measure it.")); }
    setBusy("");
  };
  const footer = (
    <>
      <button type="button" className="ids-btn" onClick={() => save(true)} disabled={!!busy}>Automatic again</button>
      <span className="ids-grow"/>
      <button type="button" className="ids-btn" onClick={cancel} disabled={busy === "save"}>Cancel</button>
      <button type="button" className="ids-btn ids-btn--primary" onClick={() => save(false)} disabled={!!busy || !adj}>{busy === "save" ? "Saving…" : "Save framing"}</button>
    </>
  );
  return (
    <IdsDialog title={"Frame " + rec.name + "’s photo"} onClose={cancel} width={640} footer={footer} className="ids-frame"
      sub={measured ? "Framed from Gemini’s measurement of the head and face. Adjust it here; it applies on every card this photo is on." : "This photo hasn’t been measured by Gemini yet, so it is framed by its face landmarks. Measure it, or adjust it by hand."}>
      <div className="ids-frame-body" onKeyDown={keys}>
        <div className="ids-frame-previews">
          {idsFrameShapes(rec, designOfKind).map(f => (
            <figure key={f.key} className={"ids-frame-fig" + (f.own ? " is-own" : "")}>
              <div className={"ids-frame-box" + (f.round ? " is-round" : "")} style={{ aspectRatio: String(f.ar) }}>
                {adj && <CardPhoto url={rec.photoUrl} wPx={Math.round(600 * Math.min(1, f.ar))} hPx={Math.round(600 * Math.min(1, f.ar) / f.ar)}/>}
              </div>
              <figcaption>{f.label}{f.own ? <span className="ids-frame-own"> · prints on this</span> : null}</figcaption>
            </figure>
          ))}
        </div>
        <div className="ids-frame-ctl" role="group" aria-label="Framing">
          <div className="ids-frame-row">
            <span className="ids-frame-l">Size</span>
            <button type="button" className="ids-btn ids-btn--sm" aria-label="Zoom out" onClick={() => step("zoom", -IDS_FRAME_STEP.zoom)} disabled={!adj || adj.zoom <= 0.6}><IdsIcon name="minus"/></button>
            <span className="ids-frame-v" aria-live="polite">{adj ? Math.round(adj.zoom * 100) + "%" : "—"}</span>
            <button type="button" className="ids-btn ids-btn--sm" aria-label="Zoom in" onClick={() => step("zoom", IDS_FRAME_STEP.zoom)} disabled={!adj || adj.zoom >= 2}><IdsIcon name="plus"/></button>
          </div>
          <div className="ids-frame-row">
            <span className="ids-frame-l">Move</span>
            <button type="button" className="ids-btn ids-btn--sm" aria-label="Move left" onClick={() => step("dx", -IDS_FRAME_STEP.move)} disabled={!adj}><IdsIcon name="arrow-left"/></button>
            <button type="button" className="ids-btn ids-btn--sm" aria-label="Move right" onClick={() => step("dx", IDS_FRAME_STEP.move)} disabled={!adj}><IdsIcon name="arrow-right"/></button>
            <button type="button" className="ids-btn ids-btn--sm" aria-label="Move up" onClick={() => step("dy", -IDS_FRAME_STEP.move)} disabled={!adj}><IdsIcon name="arrow-up"/></button>
            <button type="button" className="ids-btn ids-btn--sm" aria-label="Move down" onClick={() => step("dy", IDS_FRAME_STEP.move)} disabled={!adj}><IdsIcon name="arrow-down"/></button>
          </div>
          <div className="ids-frame-row">
            <button type="button" className={"ids-btn ids-btn--sm" + (adj && adj.whole ? " is-on" : "")} aria-pressed={!!(adj && adj.whole)} onClick={() => setAdj(a => Object.assign({}, a, { whole: !a.whole }))} disabled={!adj}>Show the whole photo</button>
            <button type="button" className="ids-btn ids-btn--sm" onClick={remeasure} disabled={!!busy}>{busy === "ai" ? "Measuring…" : measured ? "Measure again with Gemini" : "Measure with Gemini"}</button>
          </div>
          <p className="ids-frame-hint">Arrow keys move it, + and − change the size. The head is never cut and the photo is never stretched.</p>
          {note && <p className="ids-frame-note" role="status">{note}</p>}
        </div>
      </div>
    </IdsDialog>
  );
}
