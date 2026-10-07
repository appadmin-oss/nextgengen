/* ============================================================================
   ID Card Studio — printing (ID_CARD_STUDIO.md §4).

   The pages are drawn by React into a hidden host in THIS document, from the
   same card faces the sheet preview draws, then copied into a print window
   whose @page is the paper. Every slot is placed in millimetres, so the
   printer receives the geometry the screen showed — there is no second
   drawing of a card to drift away from the first.
   ========================================================================== */

/** The packing list page: every card in the range, by sheet and slot, to tick off at the cutter. */
function IdsPackingList({ pages, nSheets, from, to, proof }) {
  return (
    <section className="ids-pg ids-pg--list">
      <h1>Packing list{proof ? " · PROOF" : ""}</h1>
      <p>Sheets {from}–{to} of {nSheets} · tick each card as you cut and bag it · printed {new Date().toLocaleString("en-GB")}</p>
      <table>
        <thead><tr><th>Sheet</th><th>Slot</th><th>Name</th><th>ID</th><th>Centre</th><th>✓</th></tr></thead>
        <tbody>
          {pages.map(p => p.cards.map(c => (
            <tr key={p.n + "-" + c.slot}><td>{p.n}</td><td>{c.slot}</td><td>{c.name}</td><td>{c.id}</td><td>{c.centre}</td><td/></tr>
          )))}
        </tbody>
      </table>
    </section>
  );
}

/** One printed side of one sheet, every slot absolutely placed in mm. */
function IdsPrintSide({ G, slots, sheetIdx, skip, face, backs, marks, proof, test, renderFace }) {
  const out = [];
  for (let i = 0; i < G.per; i++) {
    const p = idsSlotPos(G, i, face === "back" ? backs : null);
    const box = { left: p.x + "mm", top: p.y + "mm", width: G.cw + "mm", height: G.ch + "mm" };
    if (test) { out.push(<div key={i} className="ids-ps ids-ps--test" style={box}>{i + 1}</div>); continue; }
    const s = slots[sheetIdx * G.per + i - skip];
    if (!s || s.pad) continue;
    out.push(
      <div key={i} className="ids-ps" style={box}>
        {renderFace(s, face)}
        {proof && <div className="ids-ps-proof">PROOF</div>}
      </div>
    );
  }
  return (
    <section className="ids-pg">
      {marks && idsCutMarks(G).map((m, k) => <i key={"m" + k} className="ids-pg-mark" style={{ left: m.x + "mm", top: m.y + "mm", width: m.w + "mm", height: m.h + "mm" }}/>)}
      {out}
    </section>
  );
}

/* The print window's own stylesheet: it is a separate document and reads none of ours. */
function idsPrintCss(G) {
  return "@page{size:" + G.pw + "mm " + G.ph + "mm;margin:0}*{box-sizing:border-box}"
    + "html,body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}"
    + ".ids-pg{position:relative;width:" + G.pw + "mm;height:" + G.ph + "mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}"
    + ".ids-pg-mark{position:absolute;background:#000}"
    + ".ids-ps{position:absolute;overflow:hidden}"
    + ".ids-ps--test{border:0.2mm solid #0b0b0c;display:flex;align-items:center;justify-content:center;font:10pt sans-serif}"
    + ".ids-ps-proof{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(-30deg);font:700 14pt sans-serif;color:rgba(200,0,0,.45);letter-spacing:.2em}"
    + ".ids-pg--list{padding:14mm;font:9pt Geist,Helvetica,Arial,sans-serif;height:auto;min-height:" + G.ph + "mm}"
    + ".ids-pg--list h1{font-size:15pt;margin:0 0 2mm}.ids-pg--list p{margin:0 0 5mm;color:#555}"
    + ".ids-pg--list table{width:100%;border-collapse:collapse}.ids-pg--list th{text-align:left;border-bottom:0.3mm solid #000;padding:1mm}"
    + ".ids-pg--list td{padding:1mm;border-bottom:0.2mm solid #ddd}";
}

/**
 * Open the print window from a rendered host node. Returns false when the
 * browser blocked the window, so the caller can say so and log nothing.
 */
function idsOpenPrintWindow(host, G, title) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => '<link rel="stylesheet" href="' + l.href + '">').join("");
  w.document.open();
  w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>" + String(title).replace(/[<&]/g, "") + "</title><base href='" + location.origin + "/'>"
    + sheets + "<style>" + idsPrintCss(G) + "</style></head><body></body></html>");
  w.document.close();
  w.document.body.appendChild(w.document.importNode(host, true));
  const go = () => { try { w.focus(); w.print(); } catch (_) {} };
  // Fonts and photos must be in before the dialog snapshots the page.
  Promise.race([
    Promise.all([w.document.fonts ? w.document.fonts.ready : null].concat(Array.from(w.document.images).map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; })))),
    new Promise(r => setTimeout(r, 4000)),
  ]).then(go);
  return true;
}

/* ── Before printing: the confirmation dialog, §4.1 ─────────────────────────────────────────────────── */

function IdsConfirm({ run, onCancel, onPrint }) {
  const { nCards, nRecords, nUploads, nSheets, G, backs, skip, designLabel, defaultReason } = run;
  const [mode, setMode] = React.useState("all");          // all | batch | range
  const [batch, setBatch] = React.useState(IDS_BIG_RUN);
  const [from, setFrom] = React.useState(1);
  const [to, setTo] = React.useState(nSheets);
  const [packing, setPacking] = React.useState(run.packing);
  const [reason, setReason] = React.useState(defaultReason);
  const batches = idsBatches(nSheets, batch);
  const [ra, rb] = idsRange(nSheets, from, to);
  const inRange = idsCardsInRange(run.slots, G.per, skip, ra, rb);
  const double = backs !== "off";
  const cta = mode === "batch" ? "Print sheets " + batches[0][0] + "–" + batches[0][1] : mode === "range" ? "Print sheets " + ra + "–" + rb : "Print " + nCards;
  const go = () => onPrint({ mode, batches, range: [ra, rb], packing, reason });
  return (
    <IdsDialog alert width={520} title={"Print " + idsN(nCards, "card") + "?"} onClose={onCancel}
      footer={<>
        <button type="button" className="ids-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="ids-btn ids-btn--primary" onClick={go} data-autofocus>{cta}</button>
      </>}>
      <dl className="ids-sum">
        <dt>Cards</dt><dd>{[nRecords ? nRecords + " from records" : "", nUploads ? nUploads + " uploaded" : ""].filter(Boolean).join(", ")}</dd>
        <dt>Sheets</dt><dd>{nSheets} × {IDS_PAPERS[G.paper][0]}{double ? ", double-sided (" + nSheets * 2 + " pages)" : ""}</dd>
        <dt>Card size</dt><dd>{G.cw} × {G.ch} mm, {G.per} per sheet{skip ? ", skipping " + skip + " used" : ""}</dd>
        <dt>Design</dt><dd>{nRecords ? designLabel : "Uploaded images as they are"}</dd>
      </dl>
      {nSheets > IDS_BIG_RUN && <IdsCheck tone="warn" text={nSheets + " sheets is a big run. Printing in batches stops one paper jam from spoiling the lot."}/>}
      <IdsSeg label="Which sheets" value={mode} onChange={setMode} options={[["all", "All " + nSheets + " sheets"], ["batch", "In batches"], ["range", "Some sheets"]]}/>
      {mode === "batch" && <>
        <IdsNum id="ids-batch" label="Sheets per batch" value={batch} min={1} max={Math.max(1, nSheets)} onChange={setBatch}/>
        <p className="ids-note">{idsN(batches.length, "batch", "batches")} of up to {batch} sheets. You print the next one when the last is out, so a jam only costs one batch.</p>
      </>}
      {mode === "range" && <>
        <div className="ids-row">
          <IdsNum id="ids-from" label="From sheet" value={from} min={1} max={nSheets} onChange={setFrom}/>
          <IdsNum id="ids-to" label="To sheet" value={to} min={1} max={nSheets} onChange={setTo}/>
        </div>
        <p className="ids-note">Sheets {ra}–{rb}: {idsN(inRange, "card")}. Use this to redo sheets that jammed.</p>
      </>}
      <IdsSwitch id="ids-packing" on={packing} onChange={setPacking} label="Add a packing list" help="A first page listing every sheet and slot, to tick off as you cut"/>
      {double && <p className="ids-note"><IdsIcon name="arrows-left-right"/> Set the printer to double-sided, flip on {backs === "long" ? "long" : "short"} edge. Backs are already mirrored to line up.</p>}
      <label className="ids-field">
        <span className="ids-field-l">Reason for the log</span>
        <select className="ids-select" value={reason} onChange={e => setReason(e.target.value)}>
          {IDS_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <p className="ids-foot-note">Opens your printer’s dialog. Print at 100% (actual size), not “fit to page”.</p>
    </IdsDialog>
  );
}

/* ── After the print (§4.3) ─────────────────────────────────────────────── */

function IdsAfterPrint({ items, renderFace, onLater, onDone }) {
  const [bad, setBad] = React.useState({});
  const n = Object.keys(bad).filter(k => bad[k]).length;
  return (
    <IdsDialog width={720} title={"Did all " + items.length + " print properly?"} sub="Tap any card that jammed, smudged or cut badly. It goes back on the sheet as a reprint." onClose={onLater}
      footer={<>
        <button type="button" className="ids-btn" onClick={onLater}>Check later</button>
        <button type="button" className="ids-btn ids-btn--primary" onClick={() => onDone(items.filter(it => bad[it.key]))} data-autofocus>{n ? "Reprint " + n : "All printed fine"}</button>
      </>}>
      <div className="ids-after">
        {items.map(it => (
          <button key={it.key} type="button" className={"ids-after-card" + (bad[it.key] ? " is-bad" : "")} aria-pressed={!!bad[it.key]}
                  onClick={() => setBad(b => Object.assign({}, b, { [it.key]: !b[it.key] }))}>
            <span className="ids-after-face" style={{ aspectRatio: it.cw + " / " + it.ch }}>{renderFace(it.slot, "front", true)}</span>
            <span className="ids-after-meta"><b>{it.name}</b><span>Sheet {it.sheet} · slot {it.slotN}</span></span>
            {bad[it.key] && <IdsIcon name="x-circle" className="ids-after-x"/>}
          </button>
        ))}
      </div>
    </IdsDialog>
  );
}

/* ── Files for a print shop (restored from the old Card Studio) ─────────── */

const IDS_EXPORT_DPI = [[300, "300 dpi · digital press"], [350, "350 dpi · offset standard"], [600, "600 dpi · line art (slow)"]];
const IDS_QR_WHY = { unreadable: "no code could be read", wrong_token: "it reads, but not this person’s code", decode_failed: "the image couldn’t be read", canvas_tainted: "a picture blocked the check" };

function IdsExportDialog({ run, onCancel, onStart }) {
  const { nCards, nRecords, backs, G, designLabel } = run;
  const [format, setFormat] = React.useState("pdf");
  const [dpi, setDpi] = React.useState(run.dpi || 350);
  const [verify, setVerify] = React.useState(true);
  const [reason, setReason] = React.useState(run.defaultReason);
  const double = backs !== "off";
  return (
    <IdsDialog alert width={540} title={"Export " + idsN(nCards, "card") + "?"} sub="A file to hand to a print shop or a card printer. It is made in this browser; nothing is uploaded." onClose={onCancel}
      footer={<>
        <button type="button" className="ids-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="ids-btn ids-btn--primary" data-autofocus onClick={() => onStart({ format, dpi, verify, reason })}>{format === "pdf" ? "Make the PDF" : "Make the ZIP"}</button>
      </>}>
      <IdsSeg label="What to make" value={format} onChange={setFormat} options={[["pdf", "Print-ready PDF", "file-pdf"], ["png", "PNG images (.zip)", "file-zip"]]}/>
      <p className="ids-note"><span>{format === "pdf"
        ? "Cards imposed on " + IDS_PAPERS[G.paper][0] + " at an exact " + G.cw + " × " + G.ch + " mm trim with 3 mm bleed, crop and registration marks, a colour bar and a CMYK (FOGRA39) output intent" + (double ? ", each back sheet after its front, mirrored for a " + backs + "-edge flip." : ", fronts only.")
        : "One PNG per face at the same resolution and 3 mm bleed, named by printed ID, for a print merge or a card printer’s own software."}</span></p>
      <label className="ids-field">
        <span className="ids-field-l">Resolution</span>
        <select className="ids-select" value={dpi} onChange={e => setDpi(+e.target.value)}>{IDS_EXPORT_DPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <IdsSwitch id="ids-xverify" on={verify} onChange={setVerify} label="Check every QR code" help="Reads each code back out of the exported image with the gate’s own reader. Slower; catches codes that look right and won’t scan."/>
      <dl className="ids-sum">
        <dt>Cards</dt><dd>{nCards}{nRecords !== nCards ? " (" + nRecords + " from records)" : ""}</dd>
        <dt>Design</dt><dd>{nRecords ? designLabel : "Uploaded images as they are"}</dd>
      </dl>
      <label className="ids-field">
        <span className="ids-field-l">Reason for the log</span>
        <select className="ids-select" value={reason} onChange={e => setReason(e.target.value)}>{IDS_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <span className="ids-help">Logged like a print: the cards leave the queue (except a proof), and a card spoiled at the shop can be marked from the print log.</span>
      </label>
    </IdsDialog>
  );
}

/** What the export made, and — kept on screen, not in a toast — what it could not. */
function IdsExportResult({ res, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const names = res.failed.concat(res.qrBad.map(q => q.name));
  const copy = () => { try { navigator.clipboard.writeText(names.join("\n")).then(() => setCopied(true), () => {}); } catch (_) {} };
  const title = !res.made ? (res.cancelled ? "Stopped before anything was made" : "Nothing could be exported")
    : res.failed.length || res.qrBad.length ? "Exported, with gaps" : "Exported";
  return (
    <IdsDialog width={520} title={title} onClose={onClose}
      footer={<>
        {names.length > 0 && <button type="button" className="ids-btn" onClick={copy}>{copied ? "Copied" : "Copy names"}</button>}
        <button type="button" className="ids-btn ids-btn--primary" data-autofocus onClick={onClose}>Done</button>
      </>}>
      {res.made > 0 && <IdsCheck tone="ok" text={idsN(res.made, "card") + (res.total && res.total !== res.made ? " of " + res.total : "") + " in " + res.fileName + (res.runIds ? ". Logged as " + res.runIds + "." : ".")}/>}
      {res.cancelled && res.made > 0 && <IdsCheck tone="warn" text="Stopped early: the file holds only the cards made before you pressed Stop."/>}
      {res.failed.length > 0 && <IdsCheck tone="bad" text={idsN(res.failed.length, "card") + " couldn’t be drawn and are NOT in the file. Export again for them."}/>}
      {res.qrBad.length > 0 && <IdsCheck tone="bad" text={idsN(res.qrBad.length, "card") + " ARE in the file but their QR didn’t read back from the exported image, so they may not scan at the gate. Try a higher resolution."}/>}
      {res.verify && !res.qrBad.length && res.made > 0 && !res.qrSkipped && <IdsCheck tone="ok" text="Every QR code read back from the exported image."/>}
      {res.qrSkipped > 0 && <IdsCheck tone="info" text="The QR check was skipped: the reader couldn’t be loaded. The cards were made; they just weren’t checked."/>}
      {names.length > 0 && (
        <ul className="ids-people" tabIndex={0} aria-label={idsN(names.length, "card") + " to look at"}>
          {res.failed.map((n, i) => <li key={"f" + i}>{n} · not in the file</li>)}
          {res.qrBad.map((q, i) => <li key={"q" + i}>{q.name} · {IDS_QR_WHY[q.reason] || q.reason}</li>)}
        </ul>
      )}
    </IdsDialog>
  );
}
