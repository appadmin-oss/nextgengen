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
  /* Stored in the bucket (or this site's own store): framed through Cloudinary's
     fetch with the same steps, once per print — read from the bucket, not kept. */
  if (!m) { const f = typeof nggImgFetchParts === "function" ? nggImgFetchParts(s) : null; return f ? { prefix: f.prefix, chain: [], rest: f.rest } : null; }
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
  // f_jpg, not f_auto: one format per size (print wants JPEG anyway), so each box size is one derived copy, not two.
  segs.push("c_pad,w_" + Math.round(wPx) + ",h_" + Math.round(hPx) + ",b_auto:predominant_gradient,f_jpg,q_auto:good");
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

/* ── Framing from Gemini's measurement ────────────────────────────────────

   domain/photo-framing.php asks a vision model, once per photograph, for the
   head (crown of the hair to the chin), the face, the eyes and the shoulders,
   as fractions of the image. The frame for any box is built from that here,
   to the conventions of an ID headshot: the head fills a fixed share of the
   height, with a set margin above the hair, centred between the eyes. The
   frame never cuts through the head and never leaves the picture; when the
   photo is too tight for the ideal frame, the frame shrinks (the head gets a
   little larger) rather than padding or cropping hair. A person's adjustment
   (zoom, move) is applied on top, within the same limits. */
const CPH_AI_HEAD = 0.56;   // the head's share of the frame height
const CPH_AI_TOP = 0.11;    // the margin above the crown, as a share of the frame height

function cphFrameAi(g, W, H, aspect, adj) {
  if (!g || !g.subject || !g.head || !(W > 0) || !(H > 0) || !(aspect > 0)) return null;
  const a = adj || {};
  const zoom = Math.max(0.6, Math.min(2, Number(a.zoom) || 1));
  const hx0 = g.head.x0 * W, hx1 = g.head.x1 * W, hy0 = g.head.y0 * H, hy1 = g.head.y1 * H;
  const headW = hx1 - hx0, headH = hy1 - hy0;
  if (!(headW > 0) || !(headH > 0)) return null;
  let fh = headH / (CPH_AI_HEAD * zoom);
  let fw = fh * aspect;
  // Air either side of the head, and never narrower or shorter than the head itself.
  const minW = Math.max(headW * 1.05, headW * 1.45 / zoom), minH = headH * 1.1;
  if (fw < minW) { fw = minW; fh = fw / aspect; }
  if (fh < minH) { fh = minH; fw = fh * aspect; }
  // Inside the picture: a frame too big for it shrinks, keeping its shape.
  const s = Math.min(1, W / fw, H / fh);
  fw *= s; fh *= s;
  const cx = (g.eyes && g.eyes.length === 2 ? (g.eyes[0].x + g.eyes[1].x) / 2 * W : (hx0 + hx1) / 2) + (Number(a.dx) || 0) * fw;
  let x = cx - fw / 2;
  let y = hy0 - CPH_AI_TOP * fh + (Number(a.dy) || 0) * fh;
  // Keep the whole head in when the frame can hold it…
  if (fw >= headW) x = Math.min(hx0, Math.max(hx1 - fw, x));
  if (fh >= headH) y = Math.min(hy0, Math.max(hy1 - fh, y));
  // …and the frame inside the picture.
  x = Math.min(Math.max(0, x), W - fw);
  y = Math.min(Math.max(0, y), H - fh);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(fw), h: Math.round(fh) };
}

/* The stored measurements, fetched in batches for whatever is on screen and
   cached for the visit. A page that changes them (the studio framing a
   batch, a person adjusting one) seeds the cache and every card showing that
   photograph redraws. */
const _cphHint = new Map();
const _cphHintSubs = new Set();
let _cphHintQueue = [];
let _cphHintTimer = null;
function cphHintsNotify() { _cphHintSubs.forEach(f => { try { f(); } catch (_) {} }); }
function cphHintsPut(map) {
  Object.keys(map || {}).forEach(u => _cphHint.set(u, map[u] && (map[u].geom || map[u].adjust) ? { geom: map[u].geom || null, adjust: map[u].adjust || null } : null));
  cphHintsNotify();
}
function cphHintGet(url) {
  if (!url) return Promise.resolve(null);
  if (_cphHint.has(url)) return Promise.resolve(_cphHint.get(url));
  const key = "h|" + url;
  if (_cphWait.has(key)) return _cphWait.get(key);
  const p = new Promise(res => {
    _cphHintQueue.push({ url, res });
    if (!_cphHintTimer) _cphHintTimer = setTimeout(() => {
      const q = _cphHintQueue; _cphHintQueue = []; _cphHintTimer = null;
      const urls = Array.from(new Set(q.map(x => x.url)));
      const api = typeof NGGApi !== "undefined" && NGGApi.public && NGGApi.public.photoFraming;
      const chunks = []; for (let i = 0; i < urls.length; i += 60) chunks.push(urls.slice(i, i + 60));
      Promise.all(chunks.map(c => api ? api(c).then(r => (r && r.framing) || {}).catch(() => ({})) : Promise.resolve({})))
        .then(rs => {
          const all = Object.assign({}, ...rs);
          urls.forEach(u => { const v = all[u]; _cphHint.set(u, v && (v.geom || v.adjust) ? { geom: v.geom || null, adjust: v.adjust || null } : null); });
          q.forEach(x => x.res(_cphHint.get(x.url)));
        });
    }, 25);
  }).then(v => { _cphWait.delete(key); return v; });
  _cphWait.set(key, p);
  return p;
}
/** What a cached drawing of this photo depends on: its measurement and any adjustment. */
function cphHintSig(url) {
  const u = typeof nggPhotoSrc === "function" ? nggPhotoSrc(url) : String(url || "");
  return u && _cphHint.has(u) ? JSON.stringify(_cphHint.get(u)) : "";
}
function useCphHint(url) {
  const [v, setV] = React.useState(() => (url && _cphHint.has(url) ? { hint: _cphHint.get(url) } : null));
  React.useEffect(() => {
    if (!url) return undefined;
    let live = true;
    const read = () => { if (live && _cphHint.has(url)) setV({ hint: _cphHint.get(url) }); };
    _cphHintSubs.add(read);
    if (_cphHint.has(url)) read(); else cphHintGet(url).then(read);
    return () => { live = false; _cphHintSubs.delete(read); };
  }, [url]);
  return v;
}

/* ── Placement: the picture is never stretched ───────────────────────────

   CSS object-fit is not used to fit a photograph. html2canvas ignores it and
   draws the image at the box's size, which squashes a face; a box whose real
   shape differs a little from the shape the photo was delivered at did the
   same in subtler ways. Instead the photograph's own pixel size is known
   before it is drawn, and it is placed with an explicit width, height and
   offset that keep its aspect EXACTLY — in percentages of its box, so every
   renderer at every scale lays it out the same. */

/**
 * Where to put an image of natW × natH in a box of boxW × boxH, as
 * percentages of the box: { left, top, width, height }. `region` (in image
 * pixels) is the part that must be seen — a head-and-shoulders crop — or null
 * for the whole picture. "cover" fills the box (cropping the overflow evenly),
 * "contain" shows all of the region. The image's width/height ratio is always
 * natW/natH: nothing here can stretch it.
 */
function cphPlace(natW, natH, boxW, boxH, region, fit) {
  if (!(natW > 0) || !(natH > 0) || !(boxW > 0) || !(boxH > 0)) return { left: 0, top: 0, width: 100, height: 100 };
  const r = region || { x: 0, y: 0, w: natW, h: natH };
  const s = fit === "cover" ? Math.max(boxW / r.w, boxH / r.h) : Math.min(boxW / r.w, boxH / r.h);
  const w = natW * s, h = natH * s;
  // The region's centre at the box's centre…
  let left = boxW / 2 - (r.x + r.w / 2) * s, top = boxH / 2 - (r.y + r.h / 2) * s;
  // …but a covering picture never leaves a gap at an edge.
  if (fit === "cover") {
    left = Math.min(0, Math.max(boxW - w, left));
    top = Math.min(0, Math.max(boxH - h, top));
  }
  const pc = v => Math.round(v * 10000) / 10000;
  return { left: pc(left / boxW * 100), top: pc(top / boxH * 100), width: pc(w / boxW * 100), height: pc(h / boxH * 100) };
}

/**
 * A face from the browser's own detector (the Shape Detection API, where the
 * browser has it), in the same { cx, eyeY, e } terms as cphFace. Landmarks
 * give the eyes; a bare bounding box is read by the face's proportions (the
 * eyes sit about 40% down it and are about 42% of its width apart). The
 * largest face is the subject.
 */
function cphFaceFromDetector(faces) {
  let best = null;
  (faces || []).forEach(f => {
    const b = f && f.boundingBox; if (!b || !(b.width > 0)) return;
    const eyes = (f.landmarks || []).filter(l => l && l.type === "eye" && l.locations && l.locations.length);
    let cx = b.x + b.width / 2, eyeY = b.y + b.height * 0.4, e = b.width * 0.42;
    if (eyes.length >= 2) {
      const c = eyes.slice(0, 2).map(l => ({ x: l.locations.reduce((a, p) => a + p.x, 0) / l.locations.length, y: l.locations.reduce((a, p) => a + p.y, 0) / l.locations.length }));
      const d = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y);
      if (d > b.width * 0.2) { cx = (c[0].x + c[1].x) / 2; eyeY = (c[0].y + c[1].y) / 2; e = d; }
    }
    if (!best || e > best.e) best = { cx, eyeY, e };
  });
  return best;
}

/* The delivered picture's own size, and (for a photo no cloud framed) where
   the face is — both known before anything is drawn. Cached per URL, and
   tracked in _cphWait so a print waits for them like it waits for the face
   lookup. Never rejects. */
function cphMeasure(src, detect) {
  const key = (detect ? "d|" : "m|") + src;
  if (_cphDone.has(key)) return Promise.resolve(_cphDone.get(key));
  if (_cphWait.has(key)) return _cphWait.get(key);
  const p = new Promise(res => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  }).then(async img => {
    if (!img || !img.naturalWidth) return { failed: true };
    const out = { w: img.naturalWidth, h: img.naturalHeight, face: null };
    if (detect && typeof window !== "undefined" && typeof window.FaceDetector === "function") {
      try { out.face = cphFaceFromDetector(await new window.FaceDetector({ fastMode: false, maxDetectedFaces: 4 }).detect(img)); } catch (_) {}
    }
    return out;
  }).then(v => { _cphDone.set(key, v); _cphWait.delete(key); return v; });
  _cphWait.set(key, p);
  return p;
}
function useCphMeasure(src, detect) {
  const key = src ? (detect ? "d|" : "m|") + src : "";
  const [v, setV] = React.useState(() => (key && _cphDone.get(key)) || null);
  React.useEffect(() => {
    if (!key) return undefined;
    let live = true;
    if (_cphDone.has(key)) { setV(_cphDone.get(key)); return undefined; }
    setV(null);
    cphMeasure(src, detect).then(r => { if (live) setV(r); });
    return () => { live = false; };
    // eslint-disable-next-line
  }, [key]);
  return v;
}

/**
 * The photo to draw in a box of wPx × hPx (the resolution to deliver at):
 * { src, mode, region } where mode is "framed" (a Cloudinary URL already the
 * box's shape), "plain" (any other URL, framed here) or "wait".
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
  const hv = useCphHint(src0);
  const hint = hv && hv.hint;
  const adj = hint && hint.adjust;
  const aspect = wPx / hPx;
  /* The order of trust: a person's choice, then Gemini's measurement, then
     Cloudinary's landmarks, then the whole photo. */
  const crop = !parts || !info || info.failed || (adj && adj.whole) ? null
    : (cphFrameAi(hint && hint.geom, info.w, info.h, aspect, adj) || cphFrame(info.face, info.w, info.h, aspect));
  const src = !src0 ? "" : !parts ? src0 : info ? cphCardUrl(parts, wPx, hPx, crop) : "";
  // The delivered picture's real size; for a photo no cloud framed, the face too.
  const meas = useCphMeasure(src, !!src && !parts);
  if (!src0) return { src: "", mode: "none" };
  if (!hv) return { src: "", mode: "wait" };
  if (parts && !info) return { src: "", mode: "wait" };
  if (!meas) return { src: "", mode: "wait" };
  if (meas.failed) return { src: "", mode: "none" };
  if (parts) return { src, mode: "framed", cropped: !!crop, w: meas.w, h: meas.h, region: null };
  // Any other host: framed here, by the browser's own face detector when it has one.
  const region = adj && adj.whole ? null
    : (cphFrameAi(hint && hint.geom, meas.w, meas.h, aspect, adj) || (meas.face ? cphFrame(meas.face, meas.w, meas.h, aspect) : null));
  return { src, mode: "plain", cropped: !!region, w: meas.w, h: meas.h, region };
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
  /* The box's REAL shape, measured: the one it was asked to deliver at is a
     request, and a box laid out a little differently must still never
     stretch the picture. Layout size, so a scaled preview reads the same. */
  const ref = React.useRef(null);
  const [ar, setAr] = React.useState(wPx / hPx);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) { const a = el.offsetWidth / el.offsetHeight; if (Math.abs(a - ar) > 0.002) setAr(a); }
  });
  const BW = ar * 1000, BH = 1000;
  const box = { position: "relative", width: "100%", height: "100%", overflow: "hidden" };
  if (!p.src) return h("div", { ref, "data-card-photo": p.mode, style: box });
  /* Width and offset are set; the height is the picture's own (auto), so
     whatever any renderer makes of the rest, it cannot change the aspect. */
  const at = g => ({ position: "absolute", left: g.left + "%", top: g.top + "%", width: g.width + "%", height: "auto",
    maxWidth: "none", maxHeight: "none", display: "block" });
  if (p.mode === "framed") {
    // Already the box's shape and padded with its own colours; placed, not stretched, in case the box is not quite that shape.
    return h("div", { ref, "data-card-photo": p.cropped ? "cropped" : "whole", style: box },
      h("img", { src: p.src, alt: "", crossOrigin: "anonymous", style: Object.assign(at(cphPlace(p.w, p.h, BW, BH, null, "cover")), imgStyle) }));
  }
  // Any other host: the head and shoulders when a face was found, else the whole photo over a soft copy of itself.
  if (p.region) {
    return h("div", { ref, "data-card-photo": "cropped", style: box },
      h("img", { src: p.src, alt: "", crossOrigin: "anonymous", style: Object.assign(at(cphPlace(p.w, p.h, BW, BH, p.region, "cover")), imgStyle) }));
  }
  return h("div", { ref, "data-card-photo": "plain", style: box },
    h("img", { key: "bg", src: p.src, alt: "", crossOrigin: "anonymous", "aria-hidden": "true",
      style: Object.assign(at(cphPlace(p.w, p.h, BW, BH, null, "cover")), { filter: "blur(6px)", transform: "scale(1.15)", opacity: 0.7 }, imgStyle && imgStyle.filter ? { filter: imgStyle.filter + " blur(6px)" } : null) }),
    h("img", { key: "fg", src: p.src, alt: "", crossOrigin: "anonymous", style: Object.assign(at(cphPlace(p.w, p.h, BW, BH, null, "contain")), imgStyle) }));
}
