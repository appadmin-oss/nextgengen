/* ============================================================================
   ID Card Studio — printing (ID_CARD_STUDIO.md §4).

   Print makes a PDF; it never hands the page to the browser's print dialog.
   The dialog brought the site's print stylesheet along (one rule blanked every
   sheet), re-laid the page out, and printed at whatever scale it defaulted to.

   Every face is drawn ONCE, at print resolution with 3 mm of generated bleed,
   by the same component the sheet preview shows (rendered in a hidden farm at
   its true millimetre size and rasterised by snapDOM — the browser's own
   layout engine, so what prints is what the screen drew). Faces are cached by
   what they show, and drawn in the background while the operator is still
   arranging the sheet, so pressing Print usually only assembles the PDF.

   The PDF is the studio's own sheet: each slot at its millimetre position,
   backs where the flip puts them (long edge mirrors columns; short edge
   mirrors rows AND turns the art 180°, because tumbling the sheet puts the
   card's head at its foot), the cut marks, the packing list. The print shop
   export imposes the same cached faces its own way (card-export.js).
   ========================================================================== */

const IDS_FACE_BLEED = 3;          // mm drawn round every cached face
const IDS_FARM_CHUNK = 12;         // faces mounted in the hidden farm at once
const IDS_WARM_MAX = 400;          // faces drawn ahead in the background
const IDS_FACE_CACHE_BYTES = 160 * 1024 * 1024;

/** A short, stable hash for a cache key (FNV-1a). */
function idsHash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/* Faces drawn this session: key → { bytes, bleedMm, alias, … }. Bounded by
   bytes, oldest first out (a Map keeps insertion order). */
const _idsFaces = new Map();
let _idsFaceBytes = 0;
function idsFaceGet(key) {
  const f = _idsFaces.get(key);
  if (f) { _idsFaces.delete(key); _idsFaces.set(key, f); }
  return f || null;
}
function idsFacePut(key, face) {
  if (_idsFaces.has(key)) _idsFaceBytes -= _idsFaces.get(key).bytes.length;
  _idsFaces.set(key, face); _idsFaceBytes += face.bytes.length;
  for (const [k, f] of _idsFaces) {
    if (_idsFaceBytes <= IDS_FACE_CACHE_BYTES) break;
    _idsFaces.delete(k); _idsFaceBytes -= f.bytes.length;
  }
}
function idsFaceForget() { _idsFaces.clear(); _idsFaceBytes = 0; }

/** Resolves once `node` has stopped changing for `quiet` ms (photos and the
 *  member QR arrive after the first paint), or after `max` ms regardless. */
function idsDomQuiet(node, quiet, max) {
  return new Promise(resolve => {
    if (!node || typeof MutationObserver === "undefined") return resolve();
    let t = null;
    const fin = () => { clearTimeout(t); clearTimeout(end); mo.disconnect(); resolve(); };
    const end = setTimeout(fin, max);
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, quiet); });
    mo.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
    t = setTimeout(fin, quiet);
  });
}

/**
 * The sheet PDF's pages for sheets a…b (1-based): each side's slots at their
 * millimetre positions, with the face each slot carries. `faceOf(slot, side)`
 * returns the cached face. Bleed shows only as far as the gap allows (half the
 * gap, at most 1.5 mm), so a neighbour's art never reaches another card.
 */
function idsSheetPages({ G, slots, skip, a, b, backs, marks, proof, nSheets, faceOf }) {
  const pages = [];
  const bleed = Math.max(0, Math.min(1.5, G.g / 2));
  const markList = marks ? idsCutMarks(G) : [];
  const gridBottom = G.oy + G.rows * G.ch + Math.max(0, G.rows - 1) * G.g + (marks ? 5 : 0);
  const roomForLabel = G.ph - gridBottom >= 7;
  const flip = backs === "long" ? "double-sided, flip on the LONG edge" : backs === "short" ? "double-sided, flip on the SHORT edge" : "";
  for (let p = a - 1; p < b; p++) {
    (backs !== "off" ? ["front", "back"] : ["front"]).forEach(side => {
      const items = [];
      for (let i = 0; i < G.per; i++) {
        const s = slots[p * G.per + i - skip];
        if (!s || s.pad) continue;
        const pos = idsSlotPos(G, i, side === "back" ? backs : null);
        items.push({ face: faceOf(s, side), x: pos.x, y: pos.y, w: G.cw, h: G.ch, rot: side === "back" && backs === "short",
          clip: { x: pos.x - bleed, y: pos.y - bleed, w: G.cw + 2 * bleed, h: G.ch + 2 * bleed } });
      }
      pages.push({ items, marks: markList, proof,
        label: roomForLabel ? ["NGG ID cards" + (proof ? " · PROOF" : ""), "sheet " + (p + 1) + " of " + nSheets, side.toUpperCase(), idsMmLabel([G.cw, G.ch]), flip, "print at Actual size (100%)"].filter(Boolean).join(" · ") : "" });
    });
  }
  return pages;
}

/** The alignment test: every slot outlined and numbered, nothing else. */
function idsTestPage(G) {
  const test = [];
  for (let i = 0; i < G.per; i++) { const p = idsSlotPos(G, i, null); test.push({ x: p.x, y: p.y, w: G.cw, h: G.ch, n: i + 1 }); }
  return { items: [], marks: idsCutMarks(G), test, label: "Alignment test · " + idsMmLabel([G.cw, G.ch]) + " · print at Actual size (100%), then measure with a ruler" };
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
      {res.failed.length > 0 && <IdsCheck tone="bad" text={idsN(res.failed.length, "card") + " couldn’t be drawn and " + (res.failed.length === 1 ? "is" : "are") + " NOT in the file: " + res.failed.slice(0, 4).join(", ") + (res.failed.length > 4 ? "…" : "") + ". Export again for " + (res.failed.length === 1 ? "it." : "them.")}/>}
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
