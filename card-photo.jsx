/* ============================================================================
   Card photos: the whole photograph, unless it holds more than a head and
   shoulders.

   Every card that carries a photograph frames it here — the member card
   (NggcMemberCard), the Summer School and volunteer fronts (CardFront,
   VolunteerCardFront) — so one rule decides what a printed face looks like:

   - A head-and-shoulders photograph is shown WHOLE. It was cropped to fill the
     card's photo box, which on the member card's wide band took the top of the
     head and the chin off a passport photo, and Cloudinary's c_thumb took
     everything but the face.
   - A photograph with more in it (half or full length, a group, a wide scene)
     is cropped to the head and shoulders. "More" is measured, not guessed:
     Cloudinary's face detection returns the eyes, nose and mouth (fl_getinfo),
     and the head-and-shoulders frame is built from the distance between the
     eyes — the one measurement that scales with the person, not the picture.
   - Whatever is left of the box after showing a whole photo is filled with a
     gradient of the photo's own edge colours (b_auto:predominant_gradient), so
     there are no white bars on a printed card.

   The framing is baked into the delivered Cloudinary URL at the box's own
   aspect, so every rasteriser draws the same pixels (snapDOM, html2canvas,
   which ignores object-fit, and a browser). A photo held anywhere else (the
   local store behind /api/public/photo.php) has no face detector to ask, so it
   is shown whole, with a soft copy of itself behind it.

   The pure functions take no DOM and no React; tests/card-photo.test.js runs
   them as they are. The hook is the only part that touches the network, and
   every lookup in flight is tracked so a print can wait for the last one
   (cardPhotosSettled) instead of rasterising a card before its photo is framed.
   ========================================================================== */

/* The head-and-shoulders frame, in multiples of the distance between the
   eyes (e). An adult head is about 3.6e from crown to chin with the eyes near
   its middle, and the shoulders are about 6.3e across: the frame runs from a
   little above the crown to the upper chest, and wide enough for both
   shoulders. A photo no bigger than this, give or take CPH_SLACK, IS a
   head-and-shoulders photo and is shown whole. */
const CPH_ABOVE = 2.3;     // eye line to the top of the frame
const CPH_BELOW = 3.6;     // eye line to the bottom of the frame (upper chest)
const CPH_WIDE = 7;        // the frame's width
const CPH_SLACK_H = 1.35;  // a photo up to 35% taller than the frame is still head and shoulders
const CPH_SLACK_W = 1.6;   // …and up to 60% wider (a little background either side is normal)
const CPH_DETECT = "c_thumb,g_face,w_200,h_200";   // any face-gravity crop makes Cloudinary report the landmarks

/** A Cloudinary delivery URL split into its parts, or null for any other URL. */
function cphCloudinary(url) {
  const s = String(url || "");
  const m = s.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
  if (!m) return null;
  const segs = m[2].split("/");
  const chain = [];
  // Transformation segments come first; the version (v123) or the public id ends them.
  while (segs.length > 1 && !/^v\d+$/.test(segs[0]) && /^[a-z]{1,3}_/.test(segs[0])) chain.push(segs.shift());
  return { prefix: m[1], chain, rest: segs.join("/") };
}

/**
 * The stored transformation, with the automatic framing taken out. What a
 * person chose stays: colour and light fixes, sharpening, a background removed
 * and its replacement colour, and a zoom made in the photo editor (a crop by a
 * fraction, c_crop,w_0.6). What a machine chose goes: c_thumb / c_fill face
 * crops and their sizes, which is what cut photos down to a face.
 */
function cphKeepChain(chain) {
  const out = [];
  (chain || []).forEach(seg => {
    const ps = seg.split(",");
    if (ps.indexOf("c_crop") !== -1 && ps.some(p => /^w_0?\.\d+$/.test(p))) { out.push(seg); return; }
    const kept = ps.filter(p => p && !/^(c|g|w|h|ar|dpr|z|x|y|fl)_/.test(p));
    if (kept.length) out.push(kept.join(","));
  });
  return out;
}
/** Only the segments that move pixels around: the editor's zoom. Detection needs nothing else. */
function cphGeoChain(kept) { return kept.filter(seg => seg.split(",").indexOf("c_crop") !== -1); }

/** A point through Cloudinary's reported resize steps: a crop moves it, a scale multiplies it. */
function cphMapPoint(p, steps) {
  let x = p.x, y = p.y;
  (steps || []).forEach(s => {
    if (s && s.x_factor != null) { x *= s.x_factor; y *= s.y_factor != null ? s.y_factor : s.x_factor; }
    else if (s && s.width != null) { x -= s.x || 0; y -= s.y || 0; }
  });
  return { x, y };
}

/**
 * The largest face in an fl_getinfo answer, in the coordinates of the image
 * after the first `nSteps` resize steps (the stored chain's own). Returns
 * { cx, eyeY, e } or null when no face was found.
 */
function cphFace(info, nSteps) {
  const faces = [].concat(...((info && info.landmarks) || []).map(f => Array.isArray(f) ? f : [f]));
  const steps = ((info && info.resize) || []).slice(0, nSteps || 0);
  let best = null;
  faces.forEach(f => {
    if (!f || !f.l_eye || !f.r_eye) return;
    const l = cphMapPoint(f.l_eye, steps), r = cphMapPoint(f.r_eye, steps);
    const ml = f.mouth_l ? cphMapPoint(f.mouth_l, steps) : null, mr = f.mouth_r ? cphMapPoint(f.mouth_r, steps) : null;
    const eyeY = (l.y + r.y) / 2, cx = (l.x + r.x) / 2;
    const eyes = Math.hypot(l.x - r.x, l.y - r.y);
    // A face turned away narrows the eyes but not the eye-to-mouth drop.
    const drop = ml && mr ? ((ml.y + mr.y) / 2 - eyeY) * 0.9 : 0;   // eye-to-mouth is about 1.1 eye-widths
    const e = Math.max(eyes, drop);
    if (e > 0 && (!best || e > best.e)) best = { cx, eyeY, e };
  });
  return best;
}

/**
 * Where to crop, or null to show the photo whole. imgW × imgH is the stored
 * image; `aspect` is the box's width / height. The crop is the head-and-
 * shoulders frame grown to the box's aspect and kept inside the picture.
 */
function cphFrame(face, imgW, imgH, aspect) {
  if (!face || !(imgW > 0) || !(imgH > 0) || !(aspect > 0)) return null;
  const fh = (CPH_ABOVE + CPH_BELOW) * face.e, fw = CPH_WIDE * face.e;
  if (imgH <= fh * CPH_SLACK_H && imgW <= fw * CPH_SLACK_W) return null;   // already head and shoulders
  let w = fw, h = fh;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  w = Math.min(w, imgW); h = Math.min(h, imgH);
  const x = Math.min(Math.max(0, face.cx - w / 2), imgW - w);
  // Anchored at the top of the frame, so a taller box reaches further down the body, never above the head.
  const y = Math.min(Math.max(0, face.eyeY - CPH_ABOVE * face.e), imgH - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** The delivered URL: the stored edits, the crop if there is one, then the whole of it fitted to the box. */
function cphCardUrl(parts, wPx, hPx, crop) {
  const segs = cphKeepChain(parts.chain);
  if (crop) segs.push("c_crop,x_" + crop.x + ",y_" + crop.y + ",w_" + crop.w + ",h_" + crop.h);
  segs.push("c_pad,w_" + Math.round(wPx) + ",h_" + Math.round(hPx) + ",b_auto:predominant_gradient,f_auto,q_auto:good");
  return parts.prefix + segs.join("/") + "/" + parts.rest;
}
/** The two lookups: the stored image's size and steps, and its landmarks. */
function cphInfoUrls(parts) {
  const geo = cphGeoChain(cphKeepChain(parts.chain));
  const base = parts.prefix + (geo.length ? geo.join("/") + "/" : "");
  return { size: geo.length ? base + "fl_getinfo/" + parts.rest : "", faces: base + CPH_DETECT + ",fl_getinfo/" + parts.rest, nSteps: geo.length };
}

/* ── The lookup, cached for the visit and tracked while in flight ───────── */

const _cphDone = new Map();
const _cphWait = new Map();
function cphJson(url) {
  return fetch(url, { credentials: "omit" }).then(r => r.ok ? r.json() : Promise.reject(new Error("http_" + r.status)));
}
/** { w, h, face } for a Cloudinary photo, or { failed: true } when it can't be asked. Never rejects. */
function cphLookup(parts) {
  const u = cphInfoUrls(parts), key = u.faces;
  if (_cphDone.has(key)) return Promise.resolve(_cphDone.get(key));
  if (_cphWait.has(key)) return _cphWait.get(key);
  try { const s = sessionStorage.getItem("cph:" + key); if (s) { const v = JSON.parse(s); _cphDone.set(key, v); return Promise.resolve(v); } } catch (_) {}
  const p = Promise.all([cphJson(u.faces), u.size ? cphJson(u.size) : null]).then(([fi, si]) => {
    // With no zoom in the chain the stored image is the input; with one, its own lookup says how big it came out.
    const out = si ? si.output : fi.input;
    // The landmarks answer runs the zoom first and then the detector, so only the zoom's steps apply.
    const nSteps = si ? ((si.resize || []).length) : 0;
    return { w: out.width, h: out.height, face: cphFace(fi, nSteps) };
  }).catch(() => ({ failed: true })).then(v => {
    _cphDone.set(key, v); _cphWait.delete(key);
    if (!v.failed) { try { sessionStorage.setItem("cph:" + key, JSON.stringify(v)); } catch (_) {} }
    return v;
  });
  _cphWait.set(key, p);
  return p;
}
/** Resolves once no photo is being framed — including any a later card started. */
async function cardPhotosSettled() {
  while (_cphWait.size) await Promise.all(Array.from(_cphWait.values()));
}

/**
 * The photo to draw in a box of wPx × hPx (the resolution to deliver at):
 * { src, mode } where mode is "framed" (a Cloudinary URL already the box's
 * shape), "plain" (any other URL, shown whole by CSS) or "wait".
 */
function useCardPhoto(url, wPx, hPx) {
  const src0 = typeof nggPhotoSrc === "function" ? nggPhotoSrc(url) : String(url || "");
  const parts = cphCloudinary(src0);
  const key = parts ? cphInfoUrls(parts).faces : "";
  const [info, setInfo] = React.useState(() => (key && _cphDone.get(key)) || null);
  React.useEffect(() => {
    if (!key) return undefined;
    let live = true;
    if (_cphDone.has(key)) { setInfo(_cphDone.get(key)); return undefined; }
    setInfo(null);
    cphLookup(parts).then(v => { if (live) setInfo(v); });
    return () => { live = false; };
    // eslint-disable-next-line
  }, [key]);
  if (!src0) return { src: "", mode: "none" };
  if (!parts) return { src: src0, mode: "plain" };
  if (!info) return { src: "", mode: "wait" };
  const crop = info.failed ? null : cphFrame(info.face, info.w, info.h, wPx / hPx);
  return { src: cphCardUrl(parts, wPx, hPx, crop), mode: "framed", cropped: !!crop };
}

/**
 * The photo, filling its parent (which sets the size and any rounding).
 * `imgStyle` is applied to the photograph itself (a filter, say). wPx × hPx is
 * the resolution to deliver at — the box's shape, at print size.
 */
function CardPhoto({ url, wPx, hPx, imgStyle, onState }) {
  const h = React.createElement;
  const p = useCardPhoto(url, wPx, hPx);
  React.useEffect(() => { if (onState) onState(p.mode); }, [p.mode]); // eslint-disable-line
  const fill = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };
  if (!p.src) return h("div", { "data-card-photo": p.mode, style: { position: "relative", width: "100%", height: "100%" } });
  if (p.mode === "framed") {
    return h("img", { src: p.src, alt: "", crossOrigin: "anonymous", "data-card-photo": p.cropped ? "cropped" : "whole",
      style: Object.assign({ width: "100%", height: "100%", objectFit: "cover", display: "block" }, imgStyle) });
  }
  // Any other host: the whole photo, over a soft, enlarged copy of itself so the box has no bars.
  return h("div", { "data-card-photo": "plain", style: { position: "relative", width: "100%", height: "100%", overflow: "hidden" } },
    h("img", { key: "bg", src: p.src, alt: "", crossOrigin: "anonymous", "aria-hidden": "true",
      style: Object.assign({}, fill, { objectFit: "cover", filter: "blur(6px)", transform: "scale(1.15)", opacity: 0.7 }, imgStyle && imgStyle.filter ? { filter: imgStyle.filter + " blur(6px)" } : null) }),
    h("img", { key: "fg", src: p.src, alt: "", crossOrigin: "anonymous", style: Object.assign({}, fill, { objectFit: "contain" }, imgStyle) }));
}
