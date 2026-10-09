/* ============================================================================
   ID Card Studio — Afrovanguard member cards.

   Afrovanguard's member cards are printed here (owner, 2026-10-09), but they
   are Afrovanguard's card: its design, its number, its QR. So the studio never
   draws one. Afrovanguard hands over its own card (domain/ngv-portal.php →
   integrations/ngg-cards.php there): a stylesheet with every font and image
   inlined, and each person's front and back markup from the very partial
   Afrovanguard's screens use. CLAUDE.md §7: one renderer per card, never two.

   Each face is laid out ALONE in a hidden same-origin iframe — Afrovanguard's
   CSS only, nothing of this app's — at the design's own 10px per mm, and
   rasterised by snapDOM loaded inside that iframe. (A shadow root does not do:
   snapDOM drops styles scoped to one. An iframe whose own window runs snapDOM
   captures exactly.) The result is an image, so a face takes the same road as
   a Design Studio template: on screen as an <img>, into a sheet through
   CardExport.imageFace with the studio's own bleed.

   Cached by card version (Afrovanguard changes it when anything printed on the
   card changes), side and dpi; everything in flight is tracked so a print
   waits for the last face rather than snapshotting a blank.
   ========================================================================== */

const IDS_AV_PX_PER_MM = 10;
const IDS_AV_MM = [54, 85.6];
const IDS_AV_PREVIEW_DPI = 150;

const _idsAv = { style: null, styleP: null, faces: new Map(), pending: [], timer: null, frame: null, chain: Promise.resolve() };
const _idsAvDone = new Map();
const _idsAvWait = new Map();

/** The card's stylesheet and seal, fetched once a visit (the server keeps it a week per design). */
function idsAvStyle(design) {
  if (_idsAv.style && (!design || _idsAv.style.version === design)) return Promise.resolve(_idsAv.style);
  if (!_idsAv.styleP) {
    _idsAv.styleP = NGGApi.admin.idStudio.avStyle(design)
      .then(r => { _idsAv.style = r; _idsAv.styleP = null; return r; })
      .catch(e => { _idsAv.styleP = null; throw e; });
  }
  return _idsAv.styleP;
}

/** One card's markup, batched with whatever else asks in the same moment (24 a request). */
function idsAvMarkup(rec) {
  const key = rec.id + "|" + (rec.raw.version || "");
  if (_idsAv.faces.has(key)) return Promise.resolve(_idsAv.faces.get(key));
  return new Promise((res, rej) => {
    _idsAv.pending.push({ key, id: rec.id, res, rej });
    if (_idsAv.timer) return;
    _idsAv.timer = setTimeout(async () => {
      const q = _idsAv.pending; _idsAv.pending = []; _idsAv.timer = null;
      for (let i = 0; i < q.length; i += 24) {
        const part = q.slice(i, i + 24);
        try {
          const r = await NGGApi.admin.idStudio.avFaces([...new Set(part.map(x => x.id))]);
          const faces = (r && r.faces) || {};
          part.forEach(x => {
            const f = faces[x.id];
            if (f && f.front) { _idsAv.faces.set(x.key, f); x.res(f); } else x.rej(new Error("av_card_missing"));
          });
        } catch (e) { part.forEach(x => x.rej(e)); }
      }
    }, 20);
  });
}

/** The hidden iframe: Afrovanguard's stylesheet, snapDOM, and a holder. Made once. */
function idsAvFrame(style) {
  if (_idsAv.frame && _idsAv.frame.version === style.version) return _idsAv.frame.ready;
  if (_idsAv.frame) _idsAv.frame.el.remove();
  const el = document.createElement("iframe");
  el.setAttribute("aria-hidden", "true");
  el.tabIndex = -1;
  el.style.cssText = "position:fixed;left:-10000px;top:0;width:" + Math.ceil(IDS_AV_MM[0] * IDS_AV_PX_PER_MM + 40) + "px;height:"
    + Math.ceil(IDS_AV_MM[1] * IDS_AV_PX_PER_MM + 40) + "px;border:0;visibility:hidden;pointer-events:none";
  const snap = (typeof nggVendorUrl === "function" ? nggVendorUrl("/vendor/snapdom.js") : "/vendor/snapdom.js");
  const ready = new Promise((res, rej) => {
    el.onload = () => (el.contentWindow && el.contentWindow.snapdom ? res(el) : rej(new Error("snapdom_unavailable")));
    el.onerror = () => rej(new Error("frame_failed"));
  });
  el.srcdoc = "<!doctype html><html><head><meta charset='utf-8'><style>" + String(style.css).replace(/<\/style/gi, "<\\/style")
    + "</style><script src='" + snap + "'><\/script></head><body><div id='h'></div></body></html>";
  document.body.appendChild(el);
  _idsAv.frame = { el, version: style.version, ready };
  return ready;
}

/** One face, now: laid out alone in the iframe, rasterised at `dpi` across the card's 54 mm. */
async function idsAvRasterNow(rec, side, dpi) {
  const style = await idsAvStyle(rec.raw.design);
  const [markup, frame] = await Promise.all([idsAvMarkup(rec), idsAvFrame(style)]);
  const doc = frame.contentDocument, win = frame.contentWindow;
  const holder = doc.getElementById("h");
  holder.innerHTML = String(markup[side] || "").split("__AV_SEAL__").join(style.seal || "");
  const node = holder.firstElementChild;
  if (!node) throw new Error("av_face_empty");
  if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
  await Promise.all(Array.from(holder.querySelectorAll("img")).map(im => (im.decode ? im.decode().catch(() => {}) : null)));
  const W = Math.round(IDS_AV_MM[0] / 25.4 * dpi), H = Math.round(W * IDS_AV_MM[1] / IDS_AV_MM[0]);
  const cv = await win.snapdom.toCanvas(node, { width: W, height: H, dpr: 1, embedFonts: true });
  cv.getContext("2d").getImageData(0, 0, 1, 1);          // throws now on a tainted canvas
  return cv.toDataURL("image/png");
}

/** A face as a PNG data URL — cached, tracked, one at a time through the iframe. */
function idsAvRaster(rec, side, dpi) {
  const key = [rec.id, rec.raw.version || "", side, dpi].join("|");
  if (_idsAvDone.has(key)) return Promise.resolve(_idsAvDone.get(key));
  if (_idsAvWait.has(key)) return _idsAvWait.get(key);
  const p = (_idsAv.chain = _idsAv.chain.catch(() => {}).then(() => idsAvRasterNow(rec, side, dpi)))
    .then(url => ({ url }), e => ({ url: "", failed: true, why: String((e && e.message) || e) }))
    .then(v => { if (!v.failed) _idsAvDone.set(key, v); _idsAvWait.delete(key); return v; });
  _idsAvWait.set(key, p);
  return p;
}
/** Resolves once no Afrovanguard face is drawing. */
async function idsAvSettled() {
  while (_idsAvWait.size) await Promise.all(Array.from(_idsAvWait.values()));
}

/** On screen: the card as Afrovanguard draws it, at preview resolution. */
function IdsAvFace({ rec, side, boxW, boxH }) {
  const key = [rec.id, rec.raw.version || "", side, IDS_AV_PREVIEW_DPI].join("|");
  const [px, setPx] = React.useState(() => _idsAvDone.get(key) || null);
  React.useEffect(() => {
    let live = true;
    if (_idsAvDone.has(key)) { setPx(_idsAvDone.get(key)); return undefined; }
    setPx(null);
    idsAvRaster(rec, side, IDS_AV_PREVIEW_DPI).then(v => { if (live) setPx(v); });
    return () => { live = false; };
    // eslint-disable-next-line
  }, [key]);
  if (!px) return <div className="ids-face-blank" style={{ width: boxW, height: boxH }}>Drawing the Afrovanguard card…</div>;
  if (px.failed) return <div className="ids-face-blank is-bad" data-ids-failed={rec.displayId || rec.name || rec.id} style={{ width: boxW, height: boxH }}>Couldn’t draw this Afrovanguard card<br/><span className="ids-mono">{rec.displayId || rec.id}</span></div>;
  return <img className="ids-face-tpl" src={px.url} alt="" style={{ width: boxW, height: boxH }}/>;
}

Object.assign(window, { IdsAvFace, idsAvRaster, idsAvSettled });
