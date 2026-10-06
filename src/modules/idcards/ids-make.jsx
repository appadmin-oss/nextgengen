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
  return (
    <div className="ids-face-up">
      <img src={u.src} alt="" draggable="false" style={{ width: (side ? ch : cw) + "mm", height: (side ? cw : ch) + "mm", objectFit: u.fit, transform: "translate(-50%, -50%) rotate(" + rot + "deg)" }}/>
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
  return (
    <div className="ids-col ids-col--12">
      <form role="search" className="ids-search" onSubmit={e => e.preventDefault()}>
        <IdsIcon name="magnifying-glass"/>
        <input ref={M.searchRef} className="ids-input" type="search" placeholder="Name or ID" aria-label="Search records" value={R.q} onChange={e => R.setQ(e.target.value)}/>
      </form>
      <div className="ids-chips" role="radiogroup" aria-label="Show">
        {R.filters.map(f => (
          <button key={f.k} type="button" role="radio" aria-checked={f.on} className={"ids-fchip" + (f.on ? " is-on" : "")} onClick={() => R.setFilter(f.k)}>
            {f.dot && <span className={"ids-dot is-" + f.dot}/>}{f.label}<span className="ids-fchip-n">{f.n}</span>
          </button>
        ))}
      </div>
      <span className="ids-sr" role="status">{R.shown.length} records shown</span>
      <div className="ids-row">
        <select className="ids-select ids-select--30" aria-label="Kind" value={R.kind} onChange={e => R.setKind(e.target.value)}>
          <option value="">Every kind</option>{IDS_KIND_IDS.map(k => <option key={k} value={k}>{IDS_KIND_PLURAL[k]}</option>)}
        </select>
        <select className="ids-select ids-select--30" aria-label="Centre" value={R.centre} onChange={e => R.setCentre(e.target.value)}>
          <option value="">Every centre</option>{M.centres.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {R.canAddAll && <button type="button" className="ids-btn ids-btn--outline" onClick={R.addAll}><IdsIcon name="plus"/>Add {R.addable} to the sheet</button>}
      {M.dataState !== "ready" ? <IdsLoadState state={M.dataState} onRetry={M.reload} what="the records"/> : (
        <ul className="ids-recs">
          {R.rows.map(r => (
            <li key={r.id} className={"ids-rec" + (r.on ? " is-on" : "") + (r.blocked ? " is-blocked" : "")}>
              <button type="button" role="checkbox" aria-checked={r.on} aria-disabled={r.blocked || !M.recOK || undefined} className="ids-cb" aria-label={r.aria} onClick={r.toggle}>
                <IdsIcon name={r.on ? "check" : r.blocked ? "minus" : "check"}/>
              </button>
              <span className="ids-thumb" style={{ "--ids-accent": M.accent(r.centre) }}>
                {r.photoUrl && !r.blocked ? <img src={r.photoUrl} alt="" loading="lazy"/> : idsInitials(r.name)}
              </span>
              <span className="ids-grow ids-rec-text" onClick={r.toggle}>
                <span className="ids-rec-name">{r.name}</span>
                <span className="ids-rec-meta"><span className="ids-mono">{r.displayId || "ID assigned on print"}</span> · {r.centre || "No centre"} · {IDS_KINDS[r.kind]}</span>
                <span className={"ids-rec-tag is-" + r.tagTone}>{r.tag}</span>
              </span>
              {r.blocked && <button type="button" className="ids-btn ids-btn--28" onClick={r.ask}>Ask for photo</button>}
            </li>
          ))}
        </ul>
      )}
      {M.dataState === "ready" && R.more > 0 && <button type="button" className="ids-btn ids-btn--more" onClick={R.showMore}>Show {Math.min(IDS_REC_MORE, R.more)} more · {R.rows.length} of {R.shown.length} shown</button>}
      {M.dataState === "ready" && !R.shown.length && <p className="ids-empty">{R.filter === "blocked" ? "Nobody is blocked. Every record has a photo." : "Nobody matches."}</p>}
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
  const G = M.G;
  const scale = G.pw ? Math.max(0.4, Math.min((area.w - 48) / G.pw, (area.h - 72) / G.ph, 3.2)) : 1;
  return (
    <main className="ids-sheetcol" aria-label="Sheet preview">
      <div className="ids-scen">
        <div className="ids-scen-btns" role="radiogroup" aria-label="What are you printing?">
          {IDS_SCENARIOS.map(sc => (
            <button key={sc.key} type="button" role="radio" aria-checked={M.scen === sc.key} className={"ids-scen-btn" + (M.scen === sc.key ? " is-on" : "")} onClick={() => M.applyScenario(sc.key)}>
              <IdsIcon name={sc.icon}/>{sc.label}
            </button>
          ))}
        </div>
        <p className="ids-scen-hint">{(IDS_SCENARIOS.find(s => s.key === M.scen) || IDS_SCENARIOS[0]).hint}</p>
      </div>

      {M.job && (
        <div className="ids-job" role="status">
          <IdsIcon name="printer"/>
          <span className="ids-grow">Batch printing · {M.job.done} sheets out, {M.job.total - M.job.done} to go<span className="ids-job-bar"><span style={{ width: (M.job.done / M.job.total * 100) + "%" }}/></span></span>
          <button type="button" className="ids-btn ids-btn--invert" onClick={M.printNextBatch}>Print next {M.job.next[1] - M.job.next[0] + 1} sheets</button>
          <button type="button" className="ids-btn ids-btn--ghost-dark" onClick={M.stopJob}>Stop here</button>
        </div>
      )}

      <div className="ids-toolbar">
        <div className="ids-pager">
          <button type="button" className="ids-iconbtn" aria-label="Previous sheet" disabled={S.idx <= 0} onClick={() => S.go(S.idx - 1)}><IdsIcon name="caret-left"/></button>
          <span aria-live="polite">Sheet {S.count ? S.idx + 1 : 0} of {S.count}</span>
          <button type="button" className="ids-iconbtn" aria-label="Next sheet" disabled={S.idx >= S.count - 1} onClick={() => S.go(S.idx + 1)}><IdsIcon name="caret-right"/></button>
        </div>
        {M.backs !== "off" && <IdsSeg label="Side" size="sm" value={S.face} onChange={S.setFace} options={[["front", "Fronts"], ["back", "Backs"]]}/>}
        <span className="ids-stat">{idsN(M.nCards, "card")} · {idsN(S.count, "sheet")}{M.backs !== "off" ? " · double-sided" : ""}</span>
        <IdsSeg label="View" size="sm" value={S.overview ? "all" : "one"} onChange={v => S.setOverview(v === "all")} options={[["all", "All sheets", "squares-four"], ["one", "One sheet", "square"]]}/>
        {M.selCard && (
          <div className="ids-seltools" role="toolbar" aria-label={"Selected: " + M.selCard.label}>
            <span className="ids-seltools-name" title={M.selCard.label}>{M.selCard.label}</span>
            <button type="button" className="ids-iconbtn" aria-label="Move earlier" onClick={() => M.moveSel(-1)}><IdsIcon name="arrow-left"/></button>
            <button type="button" className="ids-iconbtn" aria-label="Move later" onClick={() => M.moveSel(1)}><IdsIcon name="arrow-right"/></button>
            {M.selCard.upload && <>
              <button type="button" className="ids-btn ids-btn--sm" onClick={M.rotateSel}><IdsIcon name="arrow-clockwise"/>Rotate 90°</button>
              <button type="button" className="ids-btn ids-btn--sm" onClick={M.toggleFitSel}>{M.selCard.upload.fit === "contain" ? "Fill the card" : "Fit whole image"}</button>
            </>}
            <button type="button" className="ids-btn ids-btn--sm ids-btn--danger" onClick={M.removeSel}><IdsIcon name="x"/>Take off the sheet</button>
          </div>
        )}
      </div>

      {M.gap > 0 && !M.breakActive && (
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
              {IDS_PAPERS[G.paper][0]} · {G.cols} × {G.rows} cards at {G.cw} × {G.ch} mm{M.backs !== "off" ? " · mirrored for " + M.backs + "-edge flip" : ""} · drag to reorder
            </figcaption>
          </figure>
        )}
      </div>
    </main>
  );
}

function IdsSlot({ M, i, scale }) {
  const G = M.G, S = M.sheet;
  const face = S.face;
  const p = idsSlotPos(G, i, face === "back" ? M.backs : null);
  const gi = S.idx * G.per + i - M.skip;
  const s = gi >= 0 ? M.slots[gi] : null;
  const box = { left: p.x * scale, top: p.y * scale, width: G.cw * scale, height: G.ch * scale, borderRadius: G.cw * scale * 0.06 };
  if (S.idx === 0 && i < M.skip) return <div className="ids-slot is-used" style={box}><span>Used</span></div>;
  if (!s || s.pad) return <div className="ids-slot is-empty" style={box} onClick={() => M.select(null)} onDragOver={e => e.preventDefault()} onDrop={e => M.dropAt(e, gi)}/>;
  const k = (G.cw * scale) / (G.cw * 3.7795);   // css px per real px at true mm size
  const sel = M.sel === s.key;
  const warn = s.warn;
  return (
    <div className={"ids-slot is-card" + (sel ? " is-sel" : "")} style={box} role="button" tabIndex={0} aria-pressed={sel}
         aria-label={"Slot " + (i + 1) + ": " + s.label + (sel ? ", selected" : "")}
         draggable onDragStart={e => { e.dataTransfer.setData("text/plain", s.key); e.dataTransfer.effectAllowed = "move"; }}
         onDragOver={e => e.preventDefault()} onDrop={e => M.dropAt(e, gi)}
         onClick={() => M.select(sel ? null : s.key)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); M.select(sel ? null : s.key); } }}>
      <div className="ids-slot-face" style={{ width: G.cw + "mm", height: G.ch + "mm", transform: "scale(" + k + ")" }}>{M.renderFace(s, face)}</div>
      <span className="ids-slot-n">{i + 1}</span>
      {warn && <span className={"ids-slot-warn is-" + warn.tone} title={warn.text}><IdsIcon name="warning"/></span>}
      {M.proof && <span className="ids-slot-proof">PROOF</span>}
    </div>
  );
}

function IdsOverview({ M }) {
  const G = M.G, S = M.sheet;
  const n = Math.min(S.count, IDS_OVERVIEW_MAX);
  return (
    <div className="ids-overview">
      <div className="ids-ov-grid">
        {Array.from({ length: n }, (_, p) => {
          const cells = [], centres = new Set();
          let filled = 0;
          for (let i = 0; i < G.per; i++) {
            const gi = p * G.per + i - M.skip;
            const s = gi >= 0 ? M.slots[gi] : null;
            const used = p === 0 && i < M.skip;
            if (s && !s.pad) { filled++; if (s.centre) centres.add(s.centre); }
            cells.push(<span key={i} className={"ids-ov-cell" + (used ? " is-used" : !s || s.pad ? " is-empty" : s.upload ? " is-up" : "")}
                             style={s && !s.pad && !s.upload ? { "--ids-accent": M.accent(s.centre) } : undefined}/>);
          }
          return (
            <button key={p} type="button" className={"ids-ov" + (p === S.idx ? " is-on" : "")} onClick={() => { S.go(p); S.setOverview(false); }}>
              <span className="ids-ov-sheet" style={{ gridTemplateColumns: "repeat(" + G.cols + ", 1fr)", aspectRatio: G.pw + " / " + G.ph }}>{cells}</span>
              <b>Sheet {p + 1}</b>
              <span className="ids-muted">{filled}/{G.per}{centres.size ? " · " + [...centres].join(", ") : ""}</span>
            </button>
          );
        })}
      </div>
      {S.count > IDS_OVERVIEW_MAX && <p className="ids-note">Showing the first {IDS_OVERVIEW_MAX} of {S.count} sheets. Use the arrows for the rest.</p>}
    </div>
  );
}

/* ── Settings column ────────────────────────────────────────────────────── */

function IdsSettings({ M }) {
  const set = M.set, st = M.settings, G = M.G;
  return (
    <aside className="ids-set" aria-label="Layout and print">
      <div className="ids-set-scroll">
        <section className="ids-sec">
          <h2 className="ids-h2">Card size</h2>
          <div className="ids-sizes" role="radiogroup" aria-label="Card size">
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
        </section>

        <section className="ids-sec">
          <h2 className="ids-h2">Paper</h2>
          <IdsSeg label="Paper" value={st.paper} onChange={v => set({ paper: v })} options={IDS_PAPER_IDS.map(k => [k, IDS_PAPERS[k][0]])}/>
          <div className="ids-row">
            <IdsNum id="ids-margin" label="Margin (mm)" value={st.margin} min={IDS_MARGIN.min} max={IDS_MARGIN.max} onChange={v => set({ margin: v })}/>
            <IdsNum id="ids-gap" label="Gap (mm)" value={st.gap} min={IDS_GAP.min} max={IDS_GAP.max} onChange={v => set({ gap: v })}/>
          </div>
          <p className="ids-perline" aria-live="polite"><b>{idsN(G.per, "card")}</b> per sheet · {G.cols} across, {G.rows} down</p>
          <IdsNum id="ids-skip" inline label="Skip used slots on sheet 1" help="For a part-used sheet of card stock" value={st.skip} min={0} max={Math.max(0, G.per - 1)} onChange={v => set({ skip: v })}/>
        </section>

        <section className="ids-sec">
          <h2 className="ids-h2">Order on the sheet</h2>
          <IdsSeg label="Order" value={st.order} onChange={M.setOrder} options={IDS_ORDERS}/>
          {(st.order === "centre" || st.order === "kind") && <>
            <IdsSwitch id="ids-break" on={st.breakBy} onChange={v => set({ breakBy: v })} label={"New sheet for each " + st.order} help="Cut piles stay separate"/>
            {st.breakBy && M.pads > 0 && <p className="ids-note">{idsN(M.pads, "slot")} left blank so the piles never mix</p>}
          </>}
          <p className="ids-stock"><IdsIcon name="stack"/>{idsN(M.stock.sheets, "sheet")} of card stock · {M.stock.sides} printed sides · {M.stock.used}% used</p>
        </section>

        <section className="ids-sec">
          <h2 className="ids-h2">Backs</h2>
          <div className="ids-radios" role="radiogroup" aria-label="Backs">
            {IDS_BACKS.map(([k, l, sub]) => (
              <button key={k} type="button" role="radio" aria-checked={st.backs === k} className={"ids-radio" + (st.backs === k ? " is-on" : "")} onClick={() => set({ backs: k })}>
                <span className="ids-radio-dot"/><span className="ids-grow"><b>{l}</b><span>{sub}</span></span>
              </button>
            ))}
          </div>
        </section>

        <section className="ids-sec">
          <h2 className="ids-h2">Finish</h2>
          <IdsSwitch id="ids-marks" on={st.marks} onChange={v => set({ marks: v })} label="Cut marks"/>
          <label className="ids-field">
            <span className="ids-field-l">Image quality</span>
            <select className="ids-select" value={st.dpi} onChange={e => set({ dpi: +e.target.value })}>{IDS_DPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
        </section>

        <section className="ids-sec" aria-live="polite">
          <h2 className="ids-h2">Checks</h2>
          {M.checks.map((c, i) => <IdsCheck key={i} tone={c.tone} text={c.text} action={c.action} onAction={c.onAction}/>)}
        </section>
      </div>
      <div className="ids-set-foot">
        <button type="button" className={"ids-btn ids-btn--print" + (M.printBlock ? " is-off" : "")} aria-disabled={!!M.printBlock || undefined} onClick={M.startPrint}>
          <IdsIcon name="printer"/>Print {idsN(M.nCards, "card")} · {idsN(M.sheet.count, "sheet")}
        </button>
        <button type="button" className="ids-btn ids-btn--34" onClick={M.printTest} disabled={!G.per}>Print an alignment test</button>
      </div>
    </aside>
  );
}
