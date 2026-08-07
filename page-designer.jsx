/* ============================================================================
   ID Designer — draw a card, bind it to the roster, publish it.

   Three vendored libraries do the heavy lifting, all loaded on demand (see
   loadVendor in components.jsx) because together they are about 2MB and this is
   one admin screen:

     · Fabric 7.4      the design canvas — selection, transform, layers, text
     · Filerobot 5.0   the photo editor — crop, filters, finetune, annotate
     · TUI 3.15        the second photo engine — masks, icons, shape drawing

   Two photo editors is a deliberate choice rather than indecision: they are
   genuinely good at different things (Filerobot's finetune and crop presets;
   TUI's masking, icon overlays and free drawing) and a headshot that needs one
   rarely needs the other. Both hand back a PNG data URL through the same
   callback, so the rest of this file does not know which produced it.

   What this screen deliberately is NOT: a general drawing app. Every card it
   produces is a credential that a gate scanner and a coordinator across a hall
   both have to read, so the preflight in §Preflight is not advisory — publish
   refuses on an error, and it refuses again on the server.
   ============================================================================ */

const DSN_GOLD = "#F5B026";

/* A blank card, so "New design" is a card and not an empty rectangle: the frame,
   the panel and a QR that already passes preflight. Somebody who presses New and
   gets a white void has to know the schema to make progress. */
function dsnBlank(kind) {
  const vol = kind === "volunteer";
  return {
    id: "", name: vol ? "New volunteer card" : "New student card", kind: vol ? "volunteer" : "student",
    w: 590, h: 972, safe: 30, bleedMm: 3,
    background: vol ? "{{centre.color}}" : "#ffffff",
    elements: [
      { id: "panel", type: "rect", x: 30, y: 30, w: 530, h: 830, radius: 22, fill: "#ffffff" },
      { id: "photo", type: "image", x: 93, y: 120, w: 404, h: 318, radius: 22, fit: "cover", src: "{{photo}}", fill: "#eef0f4" },
      { id: "surname", type: "text", x: 83, y: 470, w: 424, h: 56, text: "{{surname}}", size: 50, weight: 800,
        color: "#1B2B6B", align: "center", letterSpacing: -1.2, transform: "upper", fit: true },
      { id: "role", type: "text", x: 83, y: 540, w: 424, h: 30, text: vol ? "{{roleFaculty}}" : "{{track}}",
        size: 18, weight: 700, color: "#5b6478", align: "center", letterSpacing: 2, transform: "upper", fit: true },
      { id: "qr", type: "qr", x: 246, y: 600, w: 98, h: 98, token: "{{token}}" },
      { id: "idvalue", type: "text", x: 83, y: 720, w: 424, text: "{{displayId}}", size: 18, weight: 500,
        color: "#5b6478", align: "center", font: "monospace" },
    ],
  };
}

/* A stand-in child, so the canvas shows a real card from the first frame rather
   than "{{surname}}" in a box. Replaced by an actual roster row the moment one
   is picked — a template proofed only against a sample name is a template that
   was never really proofed. */
const DSN_SAMPLE = {
  firstName: "Tunde", surname: "Bakare", fullName: "Tunde Bakare",
  displayId: "VOL-LED-26-001", handle: "tunde", track: "Piano", faculty: "Music",
  role: "Lead Mentor", token: "SAMPLE1", photoUrl: "",
  centre: { name: "Egbeda", code: "EG", color: "#D64545" },
  tier: { name: "Lead Mentor", code: "LED", color: "#8A1538" },
  expiresAt: "2026-10-29",
};

/** The QR for a token, as a data URL, using the encoder the cards already use.
 *  Cached per token: a designer drags an element twenty times a minute and each
 *  drag re-renders the canvas. */
const _dsnQr = {};
function dsnQrUrl(token) {
  const t = String(token || "").trim();
  if (!t) return "";
  if (_dsnQr[t]) return _dsnQr[t];
  try {
    const origin = (typeof window !== "undefined" && window.location) ? window.location.origin : "";
    const q = window.qrcode(0, "M");
    q.addData(origin + "/q/" + t);
    q.make();
    _dsnQr[t] = q.createDataURL(8, 0);
    return _dsnQr[t];
  } catch (_) { return ""; }
}

/* A starting design for a chosen size. Not an empty rectangle: NGG's navy, its
   mark, a headline and a footer, so somebody who picks "Poster (A4)" gets
   something they can edit rather than a blank they have to know the schema to
   fill. Credential presets keep the card starter, which already carries the
   bindings and a QR that passes preflight. */
function dsnFromPreset(preset) {
  if (preset.kind !== "graphic") {
    const t = dsnBlank(preset.kind);
    return { ...t, name: preset.name, w: preset.w, h: preset.h, wMm: preset.wMm, hMm: preset.hMm,
             safe: preset.safe, bleedMm: preset.bleedMm };
  }
  const W = preset.w, H = preset.h, pad = preset.safe;
  const social = /social|story/.test(preset.id);
  return {
    id: "", name: preset.name, kind: "graphic",
    w: W, h: H, wMm: preset.wMm, hMm: preset.hMm, safe: preset.safe, bleedMm: preset.bleedMm,
    background: social ? "#0C1432" : "#FFFFFF",
    elements: [
      { id: "band", type: "rect", x: 0, y: 0, w: W, h: Math.round(H * 0.34), role: "background",
        fill: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#0C1432" }, { offset: 1, color: "#1B2B6B" }] } },
      { id: "logo", type: "image", x: pad, y: Math.round(pad * 0.7), w: Math.round(W * 0.26),
        h: Math.round(W * 0.26 * 0.32), fit: "contain", src: "/assets/idcard/logo-lockup.png" },
      { id: "eyebrow", type: "text", x: pad, y: Math.round(H * 0.20), w: W - pad * 2, h: Math.round(H * 0.03),
        text: "NEXT GENERATION GENIUS", size: Math.round(W * 0.022), weight: 700, color: "#F5B026",
        letterSpacing: Math.round(W * 0.006), transform: "upper" },
      { id: "headline", type: "text", x: pad, y: Math.round(H * 0.24), w: W - pad * 2, h: Math.round(H * 0.11),
        text: "Your headline here", size: Math.round(W * 0.085), weight: 800, color: "#FFFFFF",
        letterSpacing: -Math.round(W * 0.002), lineHeight: 1.05, fit: true },
      { id: "body", type: "text", x: pad, y: Math.round(H * 0.40), w: Math.round((W - pad * 2) * 0.78),
        h: Math.round(H * 0.14), text: "Say what this is, who it is for, and what happens next.",
        size: Math.round(W * 0.032), weight: 400, color: social ? "#DCE3F5" : "#3A4460", lineHeight: 1.4 },
      { id: "footer", type: "text", x: pad, y: H - pad - Math.round(H * 0.03), w: W - pad * 2, h: Math.round(H * 0.03),
        text: "nextgengenius.org", size: Math.round(W * 0.024), weight: 600,
        color: social ? "#8FA3C8" : "#5b6478", letterSpacing: Math.round(W * 0.002) },
    ],
  };
}

/** A filename a human can find again. */
function dsnFileName(t) {
  return String((t && t.name) || "design").replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "design";
}

/** Render a template to a raster at a real DPI, from its REAL trim size — not
 *  from the width of an ID card, which is what this assumed when an ID card was
 *  the only thing it could make. */
async function dsnRaster(tpl, row, fabric, dpi) {
  const wMm = Number(tpl.wMm) || 54;
  const scale = (wMm / 25.4 * dpi) / (Number(tpl.w) || 590);
  const c = new fabric.StaticCanvas(document.createElement("canvas"));
  await window.tplToFabric(window.tplResolve(tpl, row), fabric, c, { scale, qrUrl: dsnQrUrl });
  const url = c.toDataURL({ format: "png", multiplier: 1 });
  const out = { url, w: c.getWidth(), h: c.getHeight() };
  c.dispose();
  return out;
}

/** Trim marks in the bleed margin, so a guillotine operator knows where the cut
 *  is. Drawn outside the artwork, never over it. */
function dsnCropMarks(doc, wMm, hMm, bleed) {
  const len = Math.min(bleed, 4);
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  const marks = [
    [[0, bleed], [len, bleed]], [[bleed, 0], [bleed, len]],
    [[wMm - len, bleed], [wMm, bleed]], [[wMm - bleed, 0], [wMm - bleed, len]],
    [[0, hMm - bleed], [len, hMm - bleed]], [[bleed, hMm - len], [bleed, hMm]],
    [[wMm - len, hMm - bleed], [wMm, hMm - bleed]], [[wMm - bleed, hMm - len], [wMm - bleed, hMm]],
  ];
  marks.forEach(([a, b]) => doc.line(a[0], a[1], b[0], b[1]));
}

function dsnDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ── Data merge ───────────────────────────────────────────────────────────────
   One design, many people. The studio could always draw a certificate; until
   this it could not draw two hundred and forty of them, which is the only
   number that matters in November.

   Everything here runs in the browser, on the same Fabric canvas that drew the
   proof on screen — so a merged certificate cannot differ from the thing the
   designer approved. That is the same single-renderer rule the rest of this
   file is built on, applied to a batch. */

/* Every page is held in memory until the file is written, because a browser
   cannot stream a zip or a PDF to disk. This is the ceiling before the tab
   dies — and rather than guess at it up front, the run MEASURES the first page
   and extrapolates, so an A4 poster at 600dpi is stopped at page one with a
   real number instead of at page ninety with a crash. */
const DSN_MERGE_BUDGET = 350 * 1024 * 1024;

function dsnRowName(r) {
  return [r.firstName, r.surname].filter(Boolean).join(" ").trim() || r.displayId || r.key || "unnamed";
}

/**
 * How many of this piece gang up on one A4 sheet.
 *
 * Mirrors the grid arithmetic in CardExport's compose(), deliberately, because
 * the answer decides whether the imposed option is offered at all — and
 * compose() clamps its grid to at least 1×1, so asking it to impose an A4
 * poster on an A4 sheet does not fail, it returns a sheet with the artwork
 * hanging off three edges. Better to not offer it.
 */
function dsnPerSheet(tpl, sheetW, sheetH) {
  const w = Number(tpl.wMm) || 54, h = Number(tpl.hMm) || 89;
  const bleed = Number(tpl.bleedMm) || 0;
  const gutter = Math.max(2 * bleed, 2);
  // clearance in compose(): bleed + markGap + markLen, floored at the 10mm
  // default margin. A crop mark inside that band prints on the finished piece.
  const margin = Math.max(10, bleed + 1.5 + 4);
  const fit = (pw, ph) => Math.max(0, Math.floor((pw - 2 * margin + gutter) / (w + gutter)))
                        * Math.max(0, Math.floor((ph - 2 * margin + gutter) / (h + gutter)));
  return Math.max(fit(sheetW || 210, sheetH || 297), fit(sheetH || 297, sheetW || 210));
}

/** A filename per person that a coordinator can match to a child by eye. */
function dsnRowFile(tpl, r, i) {
  const who = String(r.displayId || r.key || "").replace(/\W+/g, "-").replace(/^-|-$/g, "");
  return dsnFileName(tpl) + "-" + (who || String(i + 1));
}

/**
 * What the DATA will do to this design — said before the run, not discovered
 * on paper.
 *
 * tplPreflight answers "is this design printable"; this answers "is this design
 * printable FOR THESE PEOPLE". They are different questions and only the second
 * one catches the thing that actually goes wrong in a merge: a design that is
 * perfect and a roster where eleven children have no photograph on file, which
 * prints eleven certificates with a grey rectangle where a face should be and
 * says nothing at all about it.
 */
function dsnMergeAudit(tpl, rows) {
  if (!tpl || !rows || !rows.length) return [];
  const fields = [];
  const seen = {};
  // Scan the whole document rather than a list of known-bindable properties —
  // a binding can live on any string property, including the background.
  (JSON.stringify(tpl).match(/\{\{\s*[\w.]+\s*\}\}/g) || []).forEach(m => {
    const k = m.replace(/[{}\s]/g, "");
    if (!seen[k]) { seen[k] = 1; fields.push(k); }
  });
  const out = [];
  fields.forEach(k => {
    const F = window.TPL_FIELDS[k];
    // A colour field always resolves (it has a default), so an empty one is not
    // a hole in the data — only text and images can genuinely be missing.
    if (!F || F.isColor) return;
    const blank = rows.filter(r => !String(F.get(r) || "").trim());
    if (blank.length) out.push({ field: k, label: F.label, count: blank.length, who: blank.slice(0, 5).map(dsnRowName) });
  });
  return out;
}

function DesignerPage() {
  /* Read through window, the way CardStudio does. `useAuth` is a top-level
     binding in the bundle, so a test fixture that stubs window.useAuth would be
     shadowed by the real one and this screen could never be driven signed-in. */
  const auth = (window.useAuth || (() => ({ isSignedIn: false })))();
  const isSignedIn = !!(auth && auth.isSignedIn);
  const [libs, setLibs] = React.useState(null);          // fabric, once loaded
  const [libErr, setLibErr] = React.useState("");
  const [list, setList] = React.useState(null);
  const [tpl, setTpl] = React.useState(null);
  const [selId, setSelId] = React.useState("");
  const [rows, setRows] = React.useState([]);            // real cards to preview against
  const [rowIdx, setRowIdx] = React.useState(-1);        // -1 = the sample
  const [problems, setProblems] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [photoTool, setPhotoTool] = React.useState("");  // "" | "filerobot" | "tui"
  const [selIds, setSelIds] = React.useState([]);        // multi-select, ids in template order
  const [zoom, setZoom] = React.useState(0);             // 0 = fit the stage
  const [assets, setAssets] = React.useState(null);      // the design asset library
  const [assetFolder, setAssetFolder] = React.useState("");
  const [drawing, setDrawing] = React.useState(false);
  /* ── Data merge ────────────────────────────────────────────────────────────
     `mergeOpen` is the panel; `merge` is what the roster read came back with.
     Two pieces of state rather than one, because the read is triggered BY the
     panel being open and writing the result into the same value would make the
     effect depend on its own output. */
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [merge, setMerge] = React.useState(null);
  const [mf, setMf] = React.useState({ audience: "students", centre: "", track: "", role: "",
                                       q: "", from: "", to: "", attendedMin: 0, photo: "", issued: "" });
  const [picked, setPicked] = React.useState([]);      // the keys actually in the run
  const [mdpi, setMdpi] = React.useState(300);
  const [run, setRun] = React.useState(null);          // { i, n, note } while a batch is rendering
  const runCancel = React.useRef(false);
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const fileRef = React.useRef(null);
  // Which redraw is current. See the shouldPaint note in tplToFabric.
  const drawTokenRef = React.useRef(0);
  /* Undo/redo, kept as whole snapshots of the template.
     A card is a few kilobytes of JSON, so fifty snapshots is nothing, and a diff
     or command stack would be a second model of the document that can disagree
     with the document — the exact failure the single-renderer rule exists to
     prevent, moved one layer up. Refs rather than state: pushing history must
     never itself trigger a render. */
  const histRef = React.useRef({ past: [], future: [], last: "" });
  const [histTick, setHistTick] = React.useState(0);

  const row = rowIdx >= 0 && rows[rowIdx] ? rows[rowIdx] : DSN_SAMPLE;

  /* Fabric is fetched when this screen opens and never before — it is 292KB for
     a page most admins never visit. */
  React.useEffect(() => {
    let dead = false;
    loadVendor("fabric").then(f => { if (!dead) setLibs({ fabric: f }); })
      .catch(e => { if (!dead) setLibErr(e.message || "could not load the design library"); });
    return () => { dead = true; };
  }, []);

  React.useEffect(() => {
    if (!isSignedIn) return;
    NGGApi.admin.registration.templates().then(r => setList(r.templates || [])).catch(() => setList([]));
    // Real children to proof against. Volunteers too — a volunteer template
    // proofed on a student row would never exercise the tier colour.
    Promise.all([
      NGGApi.admin.registration.cards().then(r => r.cards || []).catch(() => []),
      NGGApi.admin.registration.volunteerCards().then(r => r.cards || []).catch(() => []),
    ]).then(([a, b]) => setRows(a.concat(b)));
    loadAssets();
  }, [isSignedIn]);
  const loadAssets = (folder) => NGGApi.admin.registration.assets(folder === undefined ? assetFolder : folder)
    .then(r => setAssets(r.assets || [])).catch(() => setAssets([]));

  /* The merge roster. Re-read whenever a filter changes, debounced, because the
     search box changes it on every keystroke. Selecting everything that matched
     is the default: a run is almost always "these people", and an operator who
     wants fewer unticks a few rather than ticking two hundred. */
  const mkey = JSON.stringify(mf);
  React.useEffect(() => {
    if (!mergeOpen || !isSignedIn) return;
    let dead = false;
    const t = setTimeout(() => {
      NGGApi.admin.registration.mergeRows(mf).then(r => {
        if (dead) return;
        setMerge({ rows: r.rows || [], facets: r.facets || {}, total: r.total || 0,
                   matched: r.matched || 0, truncated: !!r.truncated, limit: r.limit || 0, error: "" });
        setPicked((r.rows || []).map(x => x.key));
      }).catch(e => {
        if (!dead) { setMerge({ rows: [], facets: {}, total: 0, matched: 0, error: e.code || e.message || "could not read the roster" }); setPicked([]); }
      });
    }, 220);
    return () => { dead = true; clearTimeout(t); };
  }, [mergeOpen, isSignedIn, mkey]);
  const setFilter = (k, v) => setMf(p => ({ ...p, [k]: v }));

  /* ── The canvas ───────────────────────────────────────────────────────────
     Rebuilt from the template on every change rather than mutated in place.
     Fabric can be driven incrementally, and doing so means the canvas and the
     template can disagree — which is the bug class this whole file exists to
     avoid. A card is 20 objects; redrawing is cheap and it cannot drift. */
  /* Write a dragged/resized object back to the template, in design units. Shared
     by single and multi-object edits — in a multi-selection Fabric reports each
     child's position RELATIVE to the group, so the group's own transform has to
     be composed back in or every nudge of two elements throws them to the corner. */
  const commitObject = (o, s, group) => (el) => {
    if (el.id !== o.nggId) return el;
    let left = o.left, top = o.top, sx = o.scaleX || 1, sy = o.scaleY || 1;
    if (group) {
      const c = group.getCenterPoint ? group.getCenterPoint() : { x: group.left, y: group.top };
      left = c.x + o.left * (group.scaleX || 1);
      top = c.y + o.top * (group.scaleY || 1);
      sx *= (group.scaleX || 1); sy *= (group.scaleY || 1);
    }
    return {
      ...el,
      x: Math.round(left / s), y: Math.round(top / s),
      w: Math.round((o.width * sx) / s), h: Math.round((o.height * sy) / s),
      rotation: Math.round((o.angle || 0) + (group ? (group.angle || 0) : 0)),
    };
  };

  const redraw = React.useCallback(() => {
    if (!libs || !tpl || !hostRef.current) return;
    const fabric = libs.fabric;
    if (!canvasRef.current) {
      const el = document.createElement("canvas");
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(el);
      // selection: true — rubber-band marquee and shift-click, which is what
      // "professional" means before any feature does.
      canvasRef.current = new fabric.Canvas(el, { preserveObjectStacking: true, selection: true });
      const pick = (e) => {
        const list = (e && e.selected) || [];
        const ids = list.map(o => o.nggId).filter(Boolean);
        setSelIds(ids);
        setSelId(ids.length === 1 ? ids[0] : "");
      };
      canvasRef.current.on("selection:created", pick);
      canvasRef.current.on("selection:updated", pick);
      canvasRef.current.on("selection:cleared", () => { setSelIds([]); setSelId(""); });
      /* Dragging writes back to the TEMPLATE, in design units, and the template
         redraws the canvas. The canvas is never the source of truth — that is
         what keeps the saved document and the picture identical. */
      canvasRef.current.on("object:modified", e => {
        const c = canvasRef.current;
        const s = c.__scale || 1;
        const t = e.target;
        if (!t) return;
        const kids = t.getObjects && t.type === "activeselection" ? t.getObjects() : null;
        pushHistory();
        setTpl(prev => {
          let els = prev.elements;
          if (kids) kids.forEach(o => { els = els.map(commitObject(o, s, t)); });
          else if (t.nggId) els = els.map(commitObject(t, s, null));
          return { ...prev, elements: els };
        });
      });
      /* Smart guides. Fabric gives you drag events and nothing else, so the
         snapping is ours: while an object moves, look for an edge or a centre
         within a few pixels of another object's, and pull it there. Without this
         a designer aligns by eye and the print shows it. */
      canvasRef.current.on("object:moving", e => {
        const c = canvasRef.current, t = e.target;
        if (!t || e.e && e.e.altKey) { c.__guides = []; return; }   // hold alt to place freely
        const TOL = 5;
        const others = c.getObjects().filter(o => o !== t && o.nggId);
        const mine = { l: t.left, cx: t.left + (t.width * (t.scaleX || 1)) / 2, r: t.left + t.width * (t.scaleX || 1),
                       tp: t.top, cy: t.top + (t.height * (t.scaleY || 1)) / 2, b: t.top + t.height * (t.scaleY || 1) };
        const targetsX = [0, c.getWidth() / 2, c.getWidth()];
        const targetsY = [0, c.getHeight() / 2, c.getHeight()];
        others.forEach(o => {
          const w = o.width * (o.scaleX || 1), h = o.height * (o.scaleY || 1);
          targetsX.push(o.left, o.left + w / 2, o.left + w);
          targetsY.push(o.top, o.top + h / 2, o.top + h);
        });
        const guides = [];
        const snap = (vals, edges, setter) => {
          for (const v of vals) {
            for (const [key, cur] of edges) {
              if (Math.abs(cur - v) <= TOL) { setter(key, v); guides.push(v); return; }
            }
          }
        };
        snap(targetsX, [["l", mine.l], ["cx", mine.cx], ["r", mine.r]], (k, v) => {
          const w = t.width * (t.scaleX || 1);
          t.set({ left: k === "l" ? v : k === "cx" ? v - w / 2 : v - w });
        });
        const gx = guides.slice();
        guides.length = 0;
        snap(targetsY, [["tp", mine.tp], ["cy", mine.cy], ["b", mine.b]], (k, v) => {
          const h = t.height * (t.scaleY || 1);
          t.set({ top: k === "tp" ? v : k === "cy" ? v - h / 2 : v - h });
        });
        c.__guides = { x: gx, y: guides.slice() };
      });
      canvasRef.current.on("mouse:up", () => { const c = canvasRef.current; c.__guides = null; c.requestRenderAll(); });
      // The guide lines themselves, drawn over everything, owned by nobody.
      canvasRef.current.on("after:render", () => {
        const c = canvasRef.current, g = c.__guides;
        if (!g) return;
        const ctx = c.getContext();
        ctx.save(); ctx.strokeStyle = "#E4155F"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        (g.x || []).forEach(x => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.getHeight()); ctx.stroke(); });
        (g.y || []).forEach(y => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.getWidth(), y); ctx.stroke(); });
        ctx.restore();
      });
      /* Free drawing. The stroke arrives as a Fabric Path; we take its SVG path
         data into the schema and let the normal renderer draw it from then on,
         so a pencil line is an element like any other — movable, layerable,
         and present in the exported file at full resolution rather than baked in
         at whatever zoom it was drawn at. */
      canvasRef.current.on("path:created", e => {
        const c = canvasRef.current, s = c.__scale || 1, p = e.path;
        if (!p) return;
        c.remove(p);
        const d = p.path ? p.path.map(seg => seg.join(" ")).join(" ") : "";
        pushHistory();
        setTpl(prev => ({ ...prev, elements: prev.elements.concat([{
          id: "path-" + Math.random().toString(36).slice(2, 7), type: "path", d,
          x: Math.round(p.left / s), y: Math.round(p.top / s),
          w: Math.round((p.width * (p.scaleX || 1)) / s), h: Math.round((p.height * (p.scaleY || 1)) / s),
          stroke: p.stroke || "#101010", strokeWidth: Math.max(1, Math.round((p.strokeWidth || 2) / s)), fill: "none",
        }]) }));
      });
    }
    const c = canvasRef.current;
    // Fit the stage unless the designer has chosen a zoom.
    const fit = 460 / (Number(tpl.w) || 590);
    const scale = zoom > 0 ? zoom : fit;
    c.__scale = scale;
    c.isDrawingMode = drawing;
    if (drawing) {
      c.freeDrawingBrush = new fabric.PencilBrush(c);
      c.freeDrawingBrush.color = "#1B2B6B";
      c.freeDrawingBrush.width = Math.max(1, 3 * scale);
    }
    const token = ++drawTokenRef.current;
    c.clear();
    window.tplToFabric(window.tplResolve(tpl, row), fabric, c,
      { scale, selectable: true, qrUrl: dsnQrUrl, shouldPaint: () => drawTokenRef.current === token })
      .then(() => {
        if (drawTokenRef.current !== token) return;
        const want = selIds.length ? selIds : (selId ? [selId] : []);
        if (!want.length) return;
        const hits = c.getObjects().filter(o => want.indexOf(o.nggId) !== -1);
        if (hits.length === 1) c.setActiveObject(hits[0]);
        else if (hits.length > 1) c.setActiveObject(new fabric.ActiveSelection(hits, { canvas: c }));
        c.renderAll();
      });
  }, [libs, tpl, row, selId, selIds, zoom, drawing]);

  React.useEffect(() => { redraw(); }, [redraw]);
  /* The live document, for the browser suite. A design tool's correctness is
     about what ends up in the SAVED document, and a test that read the canvas
     instead would pass on a design that saves as something else. */
  React.useEffect(() => { window.__lastTpl = tpl; }, [tpl]);
  React.useEffect(() => () => { if (canvasRef.current) { canvasRef.current.dispose(); canvasRef.current = null; } }, []);

  // Preflight runs as you drag, not only at publish — a problem you learn about
  // when you press the last button is a problem you learn about too late.
  React.useEffect(() => {
    if (!tpl) return setProblems([]);
    setProblems(window.tplPreflight(tpl, rows.slice(0, 200), window.TPL_REQUIRED[tpl.kind] || []));
  }, [tpl, rows]);

  const sel = tpl && tpl.elements.find(e => e.id === selId);
  const patch = (id, changes) => { pushHistory(); setTpl(p => ({ ...p, elements: p.elements.map(e => e.id === id ? { ...e, ...changes } : e) })); };

  /* ── Undo / redo ──────────────────────────────────────────────────────────
     Snapshots, taken BEFORE a change rather than after, so undo returns you to
     what you were looking at. Coalesced on identical states, because dragging a
     slider fires a hundred patches and an undo stack that replays each one is an
     undo button nobody can use. */
  function pushHistory() {
    const h = histRef.current;
    const snap = JSON.stringify(tpl);
    if (!tpl || snap === h.last) return;
    h.past.push(snap);
    if (h.past.length > 60) h.past.shift();
    h.future = [];
    h.last = snap;
    setHistTick(t => t + 1);
  }
  const undo = () => {
    const h = histRef.current;
    if (!h.past.length) return;
    h.future.push(JSON.stringify(tpl));
    const prev = h.past.pop();
    h.last = prev;
    setTpl(JSON.parse(prev));
    setHistTick(t => t + 1);
  };
  const redo = () => {
    const h = histRef.current;
    if (!h.future.length) return;
    h.past.push(JSON.stringify(tpl));
    const next = h.future.pop();
    h.last = next;
    setTpl(JSON.parse(next));
    setHistTick(t => t + 1);
  };

  /* ── Align and distribute ─────────────────────────────────────────────────
     Against the canvas when one thing is selected, against the selection when
     several are. That is what every design tool does and what a designer
     expects; aligning a lone element to itself would do nothing at all. */
  const alignSel = (how) => {
    if (!tpl) return;
    const ids = selIds.length ? selIds : (selId ? [selId] : []);
    if (!ids.length) return;
    const picked = tpl.elements.filter(e => ids.indexOf(e.id) !== -1);
    const box = ids.length > 1
      ? { x: Math.min(...picked.map(e => +e.x || 0)), y: Math.min(...picked.map(e => +e.y || 0)),
          r: Math.max(...picked.map(e => (+e.x || 0) + (+e.w || 0))), b: Math.max(...picked.map(e => (+e.y || 0) + (+e.h || 0))) }
      : { x: 0, y: 0, r: Number(tpl.w) || 590, b: Number(tpl.h) || 972 };
    pushHistory();
    setTpl(p => ({ ...p, elements: p.elements.map(e => {
      if (ids.indexOf(e.id) === -1) return e;
      const w = +e.w || 0, h = +e.h || 0;
      if (how === "left") return { ...e, x: Math.round(box.x) };
      if (how === "hcenter") return { ...e, x: Math.round((box.x + box.r) / 2 - w / 2) };
      if (how === "right") return { ...e, x: Math.round(box.r - w) };
      if (how === "top") return { ...e, y: Math.round(box.y) };
      if (how === "vcenter") return { ...e, y: Math.round((box.y + box.b) / 2 - h / 2) };
      if (how === "bottom") return { ...e, y: Math.round(box.b - h) };
      return e;
    }) }));
  };
  const distribute = (axis) => {
    const ids = selIds.length ? selIds : [];
    if (ids.length < 3) return;                     // two things are already distributed
    const picked = tpl.elements.filter(e => ids.indexOf(e.id) !== -1)
      .slice().sort((a, b) => (axis === "h" ? (+a.x || 0) - (+b.x || 0) : (+a.y || 0) - (+b.y || 0)));
    const first = picked[0], last = picked[picked.length - 1];
    const span = axis === "h" ? (+last.x || 0) - (+first.x || 0) : (+last.y || 0) - (+first.y || 0);
    const step = span / (picked.length - 1);
    const at = {};
    picked.forEach((e, i) => { at[e.id] = Math.round((axis === "h" ? +first.x || 0 : +first.y || 0) + step * i); });
    pushHistory();
    setTpl(p => ({ ...p, elements: p.elements.map(e => at[e.id] == null ? e
      : (axis === "h" ? { ...e, x: at[e.id] } : { ...e, y: at[e.id] })) }));
  };

  const duplicate = () => {
    const ids = selIds.length ? selIds : (selId ? [selId] : []);
    if (!ids.length) return;
    pushHistory();
    const copies = tpl.elements.filter(e => ids.indexOf(e.id) !== -1).map(e => ({
      ...e, id: e.type + "-" + Math.random().toString(36).slice(2, 7),
      x: (+e.x || 0) + 16, y: (+e.y || 0) + 16,
    }));
    setTpl(p => ({ ...p, elements: p.elements.concat(copies) }));
    setSelIds(copies.map(c => c.id));
    setSelId(copies.length === 1 ? copies[0].id : "");
  };
  const nudge = (dx, dy) => {
    const ids = selIds.length ? selIds : (selId ? [selId] : []);
    if (!ids.length) return;
    pushHistory();
    setTpl(p => ({ ...p, elements: p.elements.map(e => ids.indexOf(e.id) === -1 ? e
      : { ...e, x: (+e.x || 0) + dx, y: (+e.y || 0) + dy }) }));
  };

  /* An image from the designer's own machine.
   *
   * It goes to the ASSET LIBRARY and the design gets a URL. It used to become a
   * data: URL inside the design, which is the bug that made this feature
   * necessary: a design is capped at 512KB and a 1600px photograph is about
   * 548KB once base64-encoded, so a poster with one photo on it failed to save
   * with `too_large` and the work was lost. Bytes living once also means the
   * same logo on ten posters is one file rather than ten copies. */
  const addImageFile = async (file) => {
    if (!file) return;
    setBusy("upload");
    try {
      placeAsset(await uploadToLibrary(file));
    } catch (e) { toast.error(e.message || "could not read that image"); } finally { setBusy(""); }
  };

  /** File → library row. Prefers the cloud when there is one, because a poster
   *  background served off a shared host's disk is a slow page for everyone;
   *  falls back to the same local store every headshot uses when there is not.
   *  Either way the caller gets an asset with a URL and does not branch. */
  const uploadToLibrary = async (file, folder) => {
    const tools = await NGGApi.imageTools();
    // The shared resampler — decode → pica → encode — so an image dropped into
    // a design behaves like an image uploaded anywhere else in this app.
    const out = await tools.prepare(file, { maxPx: 2200, quality: 0.85 });
    const blob = out.blob || file;
    const name = String(file.name || "image").replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "image";
    const payload = { name, folder: folder || "general", width: out.width || 0, height: out.height || 0,
                      bytes: blob.size || 0, mime: blob.type || "" };
    let cloud = null;
    try { cloud = await NGGApi.uploadFile(new File([blob], name + ".jpg", { type: blob.type || "image/jpeg" }), "design"); }
    catch (_) { /* no cloud, or it refused — the local store is not a failure */ }
    if (cloud && cloud.url) {
      payload.url = cloud.url;
    } else {
      payload.dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(new Error("could not read that image"));
        fr.readAsDataURL(blob);
      });
    }
    const r = await NGGApi.admin.registration.assetUpload(payload);
    if (!r.asset) throw new Error("the library refused that image");
    setAssets(prev => (prev || []).some(a => a.assetId === r.asset.assetId) ? prev : [r.asset].concat(prev || []));
    if (r.deduped) toast.success("Already in the library — reusing it rather than storing a second copy");
    return r.asset;
  };

  /** Drop a library asset onto the canvas, at its own aspect ratio. */
  const placeAsset = (asset) => {
    if (!asset || !asset.url) return;
    pushHistory();
    const id = "image-" + Math.random().toString(36).slice(2, 7);
    const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
    const w = 320, h = Math.round(w / (ratio || 1));
    setTpl(p => ({ ...p, elements: p.elements.concat([{
      id, type: "image", x: 80, y: 80, w, h, fit: "cover", src: asset.url, fill: "#eef0f4",
    }]) }));
    setSelId(id); setSelIds([id]);
  };

  /* Keyboard, because a design tool without one is a toy. Deliberately inert
     while a text field has focus — otherwise typing "d" in a name box duplicates
     a layer, which is the kind of thing that makes people distrust a tool. */
  React.useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        const ids = selIds.length ? selIds : (selId ? [selId] : []);
        if (!ids.length) return;
        e.preventDefault(); pushHistory();
        setTpl(p => ({ ...p, elements: p.elements.filter(el => ids.indexOf(el.id) === -1) }));
        setSelId(""); setSelIds([]); return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
      else if (e.key === "Escape" && drawing) setDrawing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const open = async (templateId) => {
    histRef.current = { past: [], future: [], last: "" };
    if (templateId === "__new_student") return setTpl(dsnBlank("student"));
    if (templateId === "__new_volunteer") return setTpl(dsnBlank("volunteer"));
    // A size, from the preset list. The reason this tool is not only an ID card
    // designer: NGG has posters, certificates and a WhatsApp status to make.
    const preset = window.TPL_PRESETS.find(x => "__preset-" + x.id === templateId);
    if (preset) return setTpl(dsnFromPreset(preset));
    const sys = window.TPL_SYSTEM.find(t => t.id === templateId);
    if (sys) return setTpl(JSON.parse(JSON.stringify(sys)));
    try {
      const r = await NGGApi.admin.registration.template(templateId);
      setTpl(r.template && (r.template.schema || r.template.published));
    } catch (e) { toast.error(e.code || e.message); }
  };

  const save = async () => {
    if (!tpl) return;
    setBusy("save");
    try {
      const r = await NGGApi.admin.registration.templateSave(tpl.id || "", tpl);
      setTpl(p => ({ ...p, id: r.templateId }));
      toast.success(r.forked ? "Saved as a copy — the standard design is untouched" : "Saved");
      NGGApi.admin.registration.templates().then(x => setList(x.templates || []));
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };

  const publish = async () => {
    if (!tpl || !tpl.id) { toast.error("Save it first"); return; }
    setBusy("publish");
    try {
      const r = await NGGApi.admin.registration.templatePublish(tpl.id);
      toast.success("Published as version " + r.version);
      NGGApi.admin.registration.templates().then(x => setList(x.templates || []));
    } catch (e) {
      // The server ran the same preflight and refused. Show WHAT it refused on.
      if (e.data && e.data.problems) setProblems(e.data.problems);
      toast.error(e.code === "preflight" ? "Fix the errors below first" : (e.code || e.message));
    } finally { setBusy(""); }
  };

  /* ── The photo editors ────────────────────────────────────────────────────
     Both open on the selected image element and hand back a PNG data URL, which
     replaces that element's src. Editing the artwork, not the child's stored
     photograph: a template's background texture and a headshot are the same kind
     of object here, and nothing written by this screen touches photo_assets. */
  const openFilerobot = async () => {
    if (!sel || sel.type !== "image") return;
    setBusy("photo");
    try {
      const FIE = await loadVendor("filerobot");
      const host = document.getElementById("dsn-photo-host");
      const src = window.tplBindValue(sel.src, row) || "/assets/idcard/blank.png";
      const editor = new FIE(host, {
        source: src,
        onSave: (out) => { patch(sel.id, { src: out.imageBase64 || out.imageSrc }); setPhotoTool(""); editor.terminate(); },
        onClose: () => { setPhotoTool(""); editor.terminate(); },
        annotationsCommon: { fill: "#1B2B6B" },
        Text: { text: "" },
        tabsIds: [FIE.TABS.ADJUST, FIE.TABS.FINETUNE, FIE.TABS.FILTERS, FIE.TABS.ANNOTATE, FIE.TABS.RESIZE],
        defaultTabId: FIE.TABS.ADJUST,
        defaultToolId: FIE.TOOLS.CROP,
        savingPixelRatio: 2, previewPixelRatio: 2,
      });
      setPhotoTool("filerobot");
      editor.render();
    } catch (e) { toast.error(e.message || "could not open the photo editor"); } finally { setBusy(""); }
  };

  const openTui = async () => {
    if (!sel || sel.type !== "image") return;
    setBusy("photo");
    try {
      await loadVendor("tui");
      const host = document.getElementById("dsn-photo-host");
      host.innerHTML = "";
      const src = window.tplBindValue(sel.src, row) || "/assets/idcard/blank.png";
      const ed = new window.tui.ImageEditor(host, {
        includeUI: {
          loadImage: { path: src, name: "photo" },
          theme: {}, initMenu: "filter", menuBarPosition: "bottom",
          uiSize: { width: "100%", height: "560px" },
        },
        cssMaxWidth: 900, cssMaxHeight: 520,
        usageStatistics: false,      // no phone-home from an admin console
      });
      setPhotoTool("tui");
      window.__dsnTui = { ed, elId: sel.id };
    } catch (e) { toast.error(e.message || "could not open the photo editor"); } finally { setBusy(""); }
  };
  const applyTui = () => {
    const t = window.__dsnTui;
    if (!t) return;
    patch(t.elId, { src: t.ed.toDataURL() });
    t.ed.destroy(); window.__dsnTui = null; setPhotoTool("");
  };
  const closeTui = () => {
    const t = window.__dsnTui;
    if (t) { t.ed.destroy(); window.__dsnTui = null; }
    setPhotoTool("");
  };

  const addElement = (type) => {
    pushHistory();
    const id = type + "-" + Math.random().toString(36).slice(2, 7);
    const base = { id, type, x: 120, y: 120, rotation: 0 };
    const made = type === "text"
      ? { ...base, w: 300, h: 40, text: "New text", size: 28, weight: 700, color: "#101010", align: "center", fit: true }
      : type === "image" ? { ...base, w: 240, h: 240, fit: "cover", src: "", fill: "#eef0f4", radius: 8 }
      : type === "qr" ? { ...base, w: 98, h: 98, token: "{{token}}" }
      : type === "ellipse" ? { ...base, w: 160, h: 160, fill: DSN_GOLD }
      : { ...base, w: 200, h: 120, fill: DSN_GOLD, radius: 8 };
    setTpl(p => ({ ...p, elements: p.elements.concat([made]) }));
    setSelId(id);
  };
  const removeElement = (id) => { pushHistory(); setTpl(p => ({ ...p, elements: p.elements.filter(e => e.id !== id) })); setSelId(""); };
  const move = (id, dir) => { pushHistory(); setTpl(p => {
    const i = p.elements.findIndex(e => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.elements.length) return p;
    const els = p.elements.slice();
    els.splice(j, 0, els.splice(i, 1)[0]);
    return { ...p, elements: els };
  }); };

  /* Export the card the designer is looking at, at print resolution — Fabric's
     own renderer at a multiplier, not a screenshot of the screen. Same function
     that drew the canvas, so the file cannot differ from the proof. */
  /* Vector out, for a commercial printer that wants type as type rather than as
     pixels. Fabric's own SVG serialiser, on the same object graph the PNG comes
     from — so the two files are the same design, not two renderings of it. */
  const exportSvg = async () => {
    if (!tpl || !libs) return;
    setBusy("export");
    try {
      const c = new libs.fabric.StaticCanvas(document.createElement("canvas"));
      await window.tplToFabric(window.tplResolve(tpl, row), libs.fabric, c, { scale: 1, qrUrl: dsnQrUrl });
      const svg = c.toSVG();
      c.dispose();
      dsnDownload(new Blob([svg], { type: "image/svg+xml" }), dsnFileName(tpl) + ".svg");
    } catch (e) { toast.error(e.message || "export failed"); } finally { setBusy(""); }
  };

  /* A print-ready PDF at the template's REAL size, with the bleed the preset
     declares. jsPDF is already vendored for the card studio; the page is built in
     millimetres so a printer receives 210×297 rather than "some pixels". */
  const exportPdf = async (dpi) => {
    if (!tpl || !libs) return;
    setBusy("export");
    try {
      await loadVendor("jspdf");
      const px = await dsnRaster(tpl, row, libs.fabric, dpi);
      const jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF) throw new Error("the PDF library is not loaded");
      const bleed = Number(tpl.bleedMm) || 0;
      const wMm = (Number(tpl.wMm) || 54) + bleed * 2;
      const hMm = (Number(tpl.hMm) || 89) + bleed * 2;
      const doc = new jsPDF({ orientation: wMm >= hMm ? "landscape" : "portrait", unit: "mm", format: [wMm, hMm] });
      doc.addImage(px.url, "PNG", bleed, bleed, Number(tpl.wMm) || 54, Number(tpl.hMm) || 89, undefined, "FAST");
      if (bleed > 0) dsnCropMarks(doc, wMm, hMm, bleed);
      doc.save(dsnFileName(tpl) + "-" + dpi + "dpi.pdf");
    } catch (e) { toast.error(e.message || "export failed"); } finally { setBusy(""); }
  };

  const exportPng = async (dpi) => {
    if (!tpl || !libs) return;
    setBusy("export");
    try {
      const out = await dsnRaster(tpl, row, libs.fabric, dpi);
      const a = document.createElement("a");
      a.href = out.url;
      a.download = dsnFileName(tpl) + "-" + dpi + "dpi.png";
      a.click();
    } catch (e) { toast.error(e.message || "export failed"); } finally { setBusy(""); }
  };

  /* ── The batch ─────────────────────────────────────────────────────────────
     One design × N people → one file. Three shapes, because three genuinely
     different things happen to the output:

       pdf    one page per person at the real trim size, with crop marks. This
              is what goes to a print shop for certificates.
       sheet  imposed on A4 with bleed, marks and a colour bar — the card
              studio's prepress module, unchanged, because a second imposition
              engine written for posters is a second place for the bleed
              arithmetic to be wrong.
       zip    a PNG per person, named for the child. This is what gets emailed.

     Rendered one at a time on the same Fabric renderer that drew the proof,
     yielding to the event loop between people so a run of 240 does not lock the
     tab, and cancellable, because somebody WILL start a 600-page run at 600dpi.
  */
  const mergeRows = () => ((merge && merge.rows) || []).filter(r => picked.indexOf(r.key) !== -1);

  const runMerge = async (mode) => {
    const rows = mergeRows();
    if (!tpl || !libs || !rows.length || run) return;

    /* The same rule that guards publishing, re-run against THESE people: the
       QR module size depends on the longest token in the batch, so a design
       that passed against the sample can still be unscannable for this run. */
    const bad = window.tplPreflight(tpl, rows, window.TPL_REQUIRED[tpl.kind] || []).filter(p => p.level === "error");
    if (bad.length) { toast.error(bad[0].message, "Not printable for these " + rows.length); return; }

    const holes = dsnMergeAudit(tpl, rows);
    if (holes.length) {
      const body = holes.map(h => h.count + " of " + rows.length + " have no " + h.label.toLowerCase()
        + " — " + h.who.join(", ") + (h.count > h.who.length ? ", …" : "")).join("\n");
      const go = await dialog.confirm({
        title: "Some of these people are missing data",
        body: body + "\n\nThose pieces will print with the field blank.",
        cta: "Run anyway",
      });
      if (!go) return;
    }

    runCancel.current = false;
    setRun({ i: 0, n: rows.length, note: "" });
    const failed = [];
    let stopped = "";
    try {
      const bleedMm = Number(tpl.bleedMm) || 0;
      const wMm = Number(tpl.wMm) || 54, hMm = Number(tpl.hMm) || 89;
      const CE = mode === "pdf" ? null : await loadVendor("cardExport");
      let doc = null;
      const faces = [], files = [];
      let bytes = 0, pages = 0;

      for (let i = 0; i < rows.length; i++) {
        if (runCancel.current) { stopped = "cancelled"; break; }
        setRun({ i, n: rows.length, note: dsnRowName(rows[i]) });
        let px = null;
        try { px = await dsnRaster(tpl, rows[i], libs.fabric, mdpi); }
        catch (e) { failed.push(dsnRowName(rows[i])); }
        if (px) {
          /* Measure, then extrapolate. A pre-flight guess at "is this run too
             big" needs the page size, the DPI and the compressibility of the
             artwork, and gets the last one wrong every time — a flat
             certificate and a full-bleed photograph differ by 20×. One real
             page is worth more than any estimate. */
          bytes += Math.round(px.url.length * 0.75);
          if (i === 0 && bytes * rows.length > DSN_MERGE_BUDGET) {
            stopped = "too_big";
            const each = Math.round(bytes / 1024 / 1024 * 10) / 10;
            toast.error("At " + mdpi + "dpi each piece is about " + each + "MB, so " + rows.length
              + " of them will not fit in the browser's memory. Lower the resolution, or split the run.",
              "This run is too large");
            break;
          }
          if (mode === "pdf") {
            if (!doc) {
              await loadVendor("jspdf");
              const jsPDF = window.jspdf && window.jspdf.jsPDF;
              if (!jsPDF) throw new Error("the PDF library is not loaded");
              const pw = wMm + bleedMm * 2, ph = hMm + bleedMm * 2;
              doc = new jsPDF({ orientation: pw >= ph ? "landscape" : "portrait", unit: "mm", format: [pw, ph] });
            } else {
              doc.addPage([wMm + bleedMm * 2, hMm + bleedMm * 2],
                (wMm + bleedMm * 2) >= (hMm + bleedMm * 2) ? "landscape" : "portrait");
            }
            doc.addImage(px.url, "PNG", bleedMm, bleedMm, wMm, hMm, undefined, "FAST");
            if (bleedMm > 0) dsnCropMarks(doc, wMm + bleedMm * 2, hMm + bleedMm * 2, bleedMm);
            pages++;
          } else if (mode === "sheet") {
            /* Real bleed rather than art stopping at the trim: the imposition
               places against the bleed box, and a piece with none of it comes
               back from the guillotine with a white hairline down one edge. */
            const face = bleedMm > 0
              ? await CE.addBleed(px.url, bleedMm * (px.w / wMm), { mode: "clamp", type: "image/jpeg", quality: 0.95 })
              : { dataUrl: px.url, wPx: px.w, hPx: px.h, bleedPx: 0 };
            faces.push({ dataUrl: face.dataUrl, wPx: face.wPx, hPx: face.hPx,
                         bleedPx: face.bleedPx, trimWPx: px.w, trimHPx: px.h });
          } else {
            files.push({ name: dsnRowFile(tpl, rows[i], i) + ".png", bytes: CE.dataUrlToBytes(px.url) });
          }
        }
        // Yield, so the progress line actually paints and the tab stays alive.
        await new Promise(r => setTimeout(r, 0));
      }

      // Counted, not inferred: a cancelled or budget-stopped run has fewer
      // pieces than "everybody minus the failures", and reporting the second
      // number would tell an operator the file holds people it does not.
      const made = mode === "pdf" ? pages : mode === "sheet" ? faces.length : files.length;
      if (stopped !== "too_big" && made > 0) {
        setRun({ i: rows.length, n: rows.length, note: "writing the file…" });
        await new Promise(r => setTimeout(r, 0));
        const stem = dsnFileName(tpl) + "-" + made;
        if (mode === "pdf") {
          doc.save(stem + ".pdf");
        } else if (mode === "sheet") {
          const pdf = await CE.buildImpositionPDF(faces, {
            sheet: "A4", trimW_mm: wMm, trimH_mm: hMm, bleed_mm: bleedMm, safe_mm: 3,
            marks: true, layers: true, intent: "FOGRA39", jobName: tpl.name,
            date: new Date().toISOString().slice(0, 10),
          });
          CE.download(pdf, stem + "-imposed.pdf", "application/pdf");
        } else {
          const zip = await CE.zipStore(files);
          CE.download(zip, stem + ".zip", "application/zip");
        }
      }

      /* Say exactly what came out, and name what did not. A batch that is
         quietly three short is three children without a certificate, and the
         only person who could notice is the one holding the file. */
      if (stopped === "cancelled") toast.success("Stopped after " + made + " of " + rows.length + ".", "Run cancelled");
      else if (stopped !== "too_big") {
        if (failed.length) {
          toast.error(failed.length + " could not be rendered and are NOT in the file: "
            + failed.slice(0, 6).join(", ") + (failed.length > 6 ? ", …" : ""), made + " of " + rows.length + " exported");
        } else {
          toast.success(made + (made === 1 ? " piece" : " pieces") + " at " + mdpi + "dpi.", "Batch ready");
        }
      }
    } catch (e) {
      toast.error(e.message || "the batch failed");
    } finally { setRun(null); runCancel.current = false; }
  };

  /* The studio's own shell rather than a new one — the designer is the same
     surface as the card studio and a second chrome would read as a second app. */
  const shell = (ch) => (
    <div style={{ minHeight: "100vh", background: "#0b1327", color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)", padding: "26px 20px 80px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: DSN_GOLD }}>NGG DESIGN STUDIO</div>
        {/* Not "Design an ID card". This started as an ID tool because the whole
            product started as a summer-programme tool, and the organisation makes
            posters, certificates and social posts the other eleven months. */}
        <h1 style={{ fontSize: 24, margin: "4px 0 14px", fontWeight: 800 }}>
          {tpl ? tpl.name : "Make something"}
          {tpl ? <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(230,238,255,.55)", marginLeft: 10 }}>
            {tpl.kind === "graphic" ? "graphic" : tpl.kind + " card"} · {tpl.wMm} × {tpl.hMm}mm
          </span> : null}
        </h1>
        {ch}
      </div>
    </div>
  );

  /* The gate has to be a door, not a wall. Landing on /designer directly — a
     bookmark, a shared link, or a session that lapsed — used to show only the
     words "Staff sign-in required" with nothing to click, because this screen
     has no top-nav of its own to sign in from. That reads as "the designer is
     broken": the page loads and nothing works. Now it offers the same sign-in
     the rest of the app does (the modal mounts here too — DialogHost is in the
     own-chrome shell), waits quietly while the session is still resolving, and
     falls back to the console if openSignIn is somehow unavailable. */
  if (!isSignedIn) return shell(
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      {auth && auth.loading
        ? <p style={{ fontSize: 14, color: "rgba(230,238,255,.6)" }}>Checking your session…</p>
        : <>
            <h1 style={{ fontSize: 22, margin: "0 0 8px", fontWeight: 800 }}>Staff sign-in required</h1>
            <p style={{ color: "rgba(230,238,255,.6)", margin: "0 0 20px", fontSize: 14 }}>
              Sign in with your staff account to open the Design Studio.
            </p>
            {auth && typeof auth.openSignIn === "function"
              ? <button onClick={() => auth.openSignIn()}
                  style={{ background: DSN_GOLD, color: "#2b2100", border: "none", borderRadius: 10,
                           padding: "11px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Sign in</button>
              : <a href="/nextadmin"
                  style={{ display: "inline-block", background: DSN_GOLD, color: "#2b2100", borderRadius: 10,
                           padding: "11px 22px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                  Sign in at the admin console</a>}
          </>}
    </div>
  );

  const errs = problems.filter(p => p.level === "error");
  const warns = problems.filter(p => p.level === "warn");

  return shell(
    <>
      {libErr && <ErrorState title="The design library did not load" message={libErr} onRetry={() => location.reload()}/>}

      <div className="dsn-bar">
        <select className="admin-select" value={tpl && tpl.id ? tpl.id : ""} aria-label="Open a design"
          onChange={e => open(e.target.value)}>
          <option value="">Open a design…</option>
          <optgroup label="Start from">
            <option value="__new_student">New student card</option>
            <option value="__new_volunteer">New volunteer card</option>
          </optgroup>
          {/* Grouped by what it is FOR, not by pixel size. Somebody making a
              centre-opening poster is not thinking "877 × 1240". */}
          {["Credentials", "Print", "Social", "Documents"].map(g => (
            <optgroup key={g} label={g}>
              {window.TPL_PRESETS.filter(x => x.group === g).map(x => (
                <option key={x.id} value={"__preset-" + x.id}>{x.name}</option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Standard designs (duplicate to edit)">
            {window.TPL_SYSTEM.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
          {(list || []).length > 0 && <optgroup label="Your designs">
            {(list || []).map(t => <option key={t.templateId} value={t.templateId}>{t.name}{t.status === "published" ? " · v" + t.version : " · draft"}</option>)}
          </optgroup>}
        </select>
        {tpl && <>
          <input className="admin-input" value={tpl.name} aria-label="Design name" style={{ maxWidth: 240 }}
            onChange={e => setTpl(p => ({ ...p, name: e.target.value }))}/>
          {/* Proof against a REAL child, not only the sample. This is the control
              that turns "it looks right" into "it is right for this cohort". */}
          <select className="admin-select" value={rowIdx} aria-label="Preview with"
            onChange={e => setRowIdx(Number(e.target.value))} style={{ maxWidth: 240 }}>
            <option value={-1}>Sample data</option>
            {rows.slice(0, 300).map((r, i) => (
              <option key={i} value={i}>{[r.firstName, r.surname].filter(Boolean).join(" ") || r.displayId}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={save}>{busy === "save" ? "…" : "Save"}</button>
          <button className="btn btn-primary btn-sm" disabled={!!busy || errs.length > 0} onClick={publish}
            title={errs.length ? "Fix the errors first" : "Freeze this design for print runs"}>
            {busy === "publish" ? "…" : "Publish"}
          </button>
          <div className="dsn-exports">
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => exportPng(300)}>PNG</button>
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => exportPdf(300)}>PDF</button>
            {/* Vector, for a printer that wants type as type rather than pixels. */}
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={exportSvg}>SVG</button>
            {/* The one that makes this worth having in November: the same three
                exports, but once per child on a filtered roster. */}
            <button className={"btn btn-sm " + (mergeOpen ? "btn-primary" : "btn-ghost")} disabled={!!busy}
              aria-expanded={mergeOpen} onClick={() => setMergeOpen(o => !o)}
              title="One design, one per person, from the roster">Batch…</button>
          </div>
        </>}
      </div>

      {/* ── The tool row ────────────────────────────────────────────────────
          Everything that acts on the canvas rather than on the document. Kept
          separate from the file row above because they answer different
          questions — "what am I working on" and "what am I doing to it". */}
      {tpl && (
        <div className="dsn-tools">
          <div className="dsn-tool-grp">
            <button className="dsn-tool" onClick={undo} disabled={!histRef.current.past.length} title="Undo (Ctrl+Z)">↶</button>
            <button className="dsn-tool" onClick={redo} disabled={!histRef.current.future.length} title="Redo (Ctrl+Shift+Z)">↷</button>
          </div>
          <div className="dsn-tool-grp">
            {[["left", "⇤"], ["hcenter", "⇔"], ["right", "⇥"], ["top", "⇡"], ["vcenter", "⇕"], ["bottom", "⇣"]].map(([k, g]) => (
              <button key={k} className="dsn-tool" onClick={() => alignSel(k)} disabled={!selId && !selIds.length}
                title={"Align " + k + (selIds.length > 1 ? " (to the selection)" : " (to the card)")}>{g}</button>
            ))}
            <button className="dsn-tool" onClick={() => distribute("h")} disabled={selIds.length < 3} title="Space evenly across">⋯</button>
            <button className="dsn-tool" onClick={() => distribute("v")} disabled={selIds.length < 3} title="Space evenly down">⋮</button>
          </div>
          <div className="dsn-tool-grp">
            <button className={"dsn-tool" + (drawing ? " is-on" : "")} onClick={() => setDrawing(d => !d)}
              title="Draw freehand — Esc to stop">✎</button>
            <button className="dsn-tool" onClick={() => fileRef.current && fileRef.current.click()} title="Place an image">🖼</button>
            <button className="dsn-tool" onClick={duplicate} disabled={!selId && !selIds.length} title="Duplicate (Ctrl+D)">⧉</button>
          </div>
          <div className="dsn-tool-grp">
            <button className="dsn-tool" onClick={() => setZoom(z => Math.max(0.1, (z || 460 / (tpl.w || 590)) - 0.1))} title="Zoom out">−</button>
            <button className="dsn-tool" onClick={() => setZoom(0)} title="Fit">{zoom ? Math.round(zoom * 100) + "%" : "Fit"}</button>
            <button className="dsn-tool" onClick={() => setZoom(z => Math.min(3, (z || 460 / (tpl.w || 590)) + 0.1))} title="Zoom in">+</button>
          </div>
          <span className="dsn-size-note">
            {tpl.wMm} × {tpl.hMm}mm{selIds.length > 1 ? " · " + selIds.length + " selected" : ""}
          </span>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => { addImageFile(e.target.files && e.target.files[0]); e.target.value = ""; }}/>
        </div>
      )}

      {!tpl && <div className="admin-empty">Pick a design to open, or start a new one.</div>}

      {/* ── Data merge ───────────────────────────────────────────────────────
          One design, one piece per person. Above the canvas rather than in a
          modal because the point of a run is that you can still SEE what is
          being run — the proof is a few centimetres below the tick list. */}
      {tpl && mergeOpen && (
        <div className="dsn-merge">
          <div className="dsn-merge-head">
            <b>Batch — one {tpl.kind === "graphic" ? "piece" : "card"} per person</b>
            <span className="dsn-merge-note">
              {merge ? (merge.matched + " of " + merge.total + " match · " + picked.length + " in the run") : "reading the roster…"}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setMergeOpen(false)}>Close</button>
          </div>

          <div className="dsn-merge-filters">
            <label className="dsn-prop"><span>Who</span>
              <select value={mf.audience} onChange={e => setFilter("audience", e.target.value)}>
                <option value="students">Children</option>
                <option value="volunteers">Volunteers</option>
              </select></label>
            <label className="dsn-prop"><span>Centre</span>
              <select value={mf.centre} onChange={e => setFilter("centre", e.target.value)}>
                <option value="">Every centre</option>
                {((merge && merge.facets && merge.facets.centres) || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select></label>
            {mf.audience === "students"
              ? <label className="dsn-prop"><span>Course</span>
                  <select value={mf.track} onChange={e => setFilter("track", e.target.value)}>
                    <option value="">Every course</option>
                    {((merge && merge.facets && merge.facets.tracks) || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select></label>
              : <label className="dsn-prop"><span>Role</span>
                  <select value={mf.role} onChange={e => setFilter("role", e.target.value)}>
                    <option value="">Every role</option>
                    {((merge && merge.facets && merge.facets.roles) || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select></label>}
            {/* The filter a certificate run is actually made of. Counted from
                the attendance table on every read, not from the cached
                daysPresent column, which is stale the moment a scan is fixed. */}
            {mf.audience === "students" && (
              <label className="dsn-prop"><span>Attended at least</span>
                <input type="number" min={0} max={Math.max(0, (merge && merge.facets && merge.facets.maxAttended) || 0)}
                  value={mf.attendedMin} onChange={e => setFilter("attendedMin", Math.max(0, Number(e.target.value) || 0))}/></label>
            )}
            <label className="dsn-prop"><span>Photograph</span>
              <select value={mf.photo} onChange={e => setFilter("photo", e.target.value)}>
                <option value="">Either</option><option value="yes">On file</option><option value="no">Missing</option>
              </select></label>
            <label className="dsn-prop"><span>ID card</span>
              <select value={mf.issued} onChange={e => setFilter("issued", e.target.value)}>
                <option value="">Either</option><option value="yes">Issued</option><option value="no">Not issued</option>
              </select></label>
            <label className="dsn-prop"><span>Registered from</span>
              <input type="date" value={mf.from} onChange={e => setFilter("from", e.target.value)}/></label>
            <label className="dsn-prop"><span>to</span>
              <input type="date" value={mf.to} onChange={e => setFilter("to", e.target.value)}/></label>
            <label className="dsn-prop dsn-merge-q"><span>Find</span>
              <input value={mf.q} placeholder="name or ID" onChange={e => setFilter("q", e.target.value)}/></label>
          </div>

          {merge && merge.error && <p className="dsn-hint" style={{ color: "#ff9a9a" }}>{merge.error}</p>}
          {merge && merge.truncated && (
            <p className="dsn-hint" style={{ color: "#ffce54" }}>
              {merge.matched} people match but only the first {merge.limit} are listed. Narrow the filters and run it in two.
            </p>
          )}

          {merge && merge.rows.length > 0 && <>
            <div className="dsn-merge-picks">
              <button className="btn btn-ghost btn-sm" onClick={() => setPicked(merge.rows.map(r => r.key))}>All</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPicked([])}>None</button>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setPicked(merge.rows.filter(r => picked.indexOf(r.key) === -1).map(r => r.key))}>Invert</button>
              <span className="dsn-merge-note">{picked.length} of {merge.rows.length} ticked</span>
            </div>
            <div className="dsn-merge-list">
              {merge.rows.map(r => {
                const on = picked.indexOf(r.key) !== -1;
                return (
                  <label key={r.key} className={"dsn-merge-row" + (on ? " is-on" : "")}>
                    <input type="checkbox" checked={on} aria-label={"Include " + dsnRowName(r)}
                      onChange={() => setPicked(p => on ? p.filter(x => x !== r.key) : p.concat([r.key]))}/>
                    <span className="dsn-merge-who">{dsnRowName(r)}</span>
                    <span className="dsn-merge-meta">{r.displayId}</span>
                    <span className="dsn-merge-meta">{(r.centre && r.centre.name) || "—"}</span>
                    {mf.audience === "students" && <span className="dsn-merge-meta">{r.attended} day{r.attended === 1 ? "" : "s"}</span>}
                    {/* Said on the row rather than only in the summary: this is
                        the thing an operator scans the list for. A green "ready"
                        badge makes a clean row scannable at a glance across
                        hundreds; the problems keep their own colours. */}
                    {r.photoUrl && r.token && <span className="dsn-merge-flag dsn-merge-flag--ok">ready</span>}
                    {!r.photoUrl && <span className="dsn-merge-flag dsn-merge-flag--photo">no photo</span>}
                    {!r.token && <span className="dsn-merge-flag dsn-merge-flag--card">no card</span>}
                  </label>
                );
              })}
            </div>
          </>}
          {merge && merge.rows.length === 0 && !merge.error &&
            <p className="dsn-hint">Nobody matches these filters.</p>}

          <div className="dsn-merge-run">
            <label className="dsn-prop"><span>Resolution</span>
              <select value={mdpi} onChange={e => setMdpi(Number(e.target.value))} disabled={!!run}>
                <option value={150}>150dpi · proof</option>
                <option value={300}>300dpi · print</option>
                <option value={600}>600dpi · fine</option>
              </select></label>
            <button className="btn btn-primary btn-sm" disabled={!!run || !picked.length} onClick={() => runMerge("pdf")}
              title="One page per person, at the real trim size">PDF · a page each</button>
            <button className="btn btn-ghost btn-sm" onClick={() => runMerge("sheet")}
              disabled={!!run || !picked.length || dsnPerSheet(tpl) < 2}
              title={dsnPerSheet(tpl) < 2
                ? "An A4 sheet holds one of these — use “a page each”"
                : dsnPerSheet(tpl) + " to an A4 sheet, with bleed and crop marks, for a print shop"}>
              PDF · imposed sheet</button>
            <button className="btn btn-ghost btn-sm" disabled={!!run || !picked.length} onClick={() => runMerge("zip")}
              title="A PNG per person, named for them">ZIP of images</button>
            {run && <>
              <span className="dsn-merge-note" role="status">
                {run.note === "writing the file…" ? run.note : "Rendering " + (run.i + 1) + " of " + run.n + " — " + run.note}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => { runCancel.current = true; }}>Stop</button>
            </>}
          </div>
        </div>
      )}

      {tpl && (
        <div className="dsn-grid">
          {/* ── Layers ─────────────────────────────────────────────────── */}
          <div className="dsn-rail">
            <div className="dsn-rail-head">Layers</div>
            {tpl.elements.slice().reverse().map(el => (
              <div key={el.id} className={"dsn-layer" + (selIds.indexOf(el.id) !== -1 || el.id === selId ? " is-on" : "")}>
                <button className="dsn-layer-hit" onClick={e => {
                  // Shift-click adds to the selection, the way it does on the canvas.
                  if (e.shiftKey) {
                    setSelIds(prev => prev.indexOf(el.id) !== -1 ? prev.filter(x => x !== el.id) : prev.concat([el.id]));
                    setSelId("");
                  } else { setSelId(el.id); setSelIds([el.id]); }
                }}>
                  <span className="dsn-layer-type">{el.type}</span>
                  <span className="dsn-layer-name">{el.type === "text" ? String(el.text || "").slice(0, 20) : el.id}</span>
                  {el.bind || /\{\{/.test(String(el.text || el.src || el.fill || el.color || "")) ? <span className="dsn-bound">bound</span> : null}
                </button>
                {/* Lock and hide. A locked layer still prints — it just cannot be
                    dragged by accident, which is what stops somebody nudging the
                    QR while moving the headline above it. */}
                <button className="dsn-layer-ic" title={el.locked ? "Unlock" : "Lock"}
                  onClick={() => patch(el.id, { locked: !el.locked })}>{el.locked ? "🔒" : "🔓"}</button>
                <button className="dsn-layer-ic" title={el.hidden ? "Show" : "Hide"}
                  onClick={() => patch(el.id, { hidden: !el.hidden })}>{el.hidden ? "🙈" : "👁"}</button>
              </div>
            ))}
            <div className="dsn-rail-head" style={{ marginTop: 14 }}>Add</div>
            <div className="dsn-adds">
              {["text", "rect", "ellipse", "line", "image", "qr"].map(t => (
                <button key={t} className="btn btn-ghost btn-sm" onClick={() => addElement(t)}>{t}</button>
              ))}
            </div>
            {/* ── Brand kit ──────────────────────────────────────────────────
                NGG's own colours and marks, one click away, so anything made
                here is on-brand without anybody having to remember a hex. A
                swatch applies to whatever is selected; a logo drops in. */}
            <div className="dsn-rail-head" style={{ marginTop: 14 }}>NGG brand</div>
            <div className="dsn-swatches">
              {window.TPL_BRAND.colors.map(c => (
                <button key={c.hex} className="dsn-swatch" style={{ background: c.hex }} title={c.name + " · " + c.hex}
                  onClick={() => {
                    if (!sel) return;
                    patch(sel.id, sel.type === "text" ? { color: c.hex } : { fill: c.hex });
                  }}/>
              ))}
            </div>
            {/* ── The asset library ──────────────────────────────────────────
                Pictures live here once and designs point at them. Before this a
                placed image was written into the design as base64, and a design
                is capped at 512KB — so a poster with one photograph on it could
                not be saved at all. Click to place; the same file uploaded twice
                is deduplicated rather than stored again. */}
            <div className="dsn-rail-head" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1 }}>Library</span>
              <button className="dsn-tool" title="Upload an image"
                onClick={() => fileRef.current && fileRef.current.click()}>+</button>
            </div>
            <select className="admin-select" aria-label="Filter the library" value={assetFolder}
              style={{ width: "100%", marginBottom: 8, fontSize: 12, padding: "6px 8px" }}
              onChange={e => { setAssetFolder(e.target.value); loadAssets(e.target.value); }}>
              <option value="">Everything</option>
              {["logo", "photo", "texture", "icon", "general"].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            {assets === null ? <p className="dsn-hint">Loading…</p>
              : assets.length === 0 ? <p className="dsn-hint">Nothing here yet. Upload an image and it is reusable in every design.</p>
              : <div className="dsn-assets">
                  {assets.map(a => (
                    <button key={a.assetId} className="dsn-asset" title={a.name + (a.local ? " · on this server" : " · in the cloud")}
                      onClick={() => placeAsset(a)}>
                      <img src={a.url} alt="" loading="lazy"/>
                      <span className="dsn-asset-name">{a.name}</span>
                    </button>
                  ))}
                </div>}
            <div className="dsn-adds" style={{ marginTop: 8 }}>
              {window.TPL_BRAND.logos.map(l => (
                <button key={l.url} className="btn btn-ghost btn-sm" onClick={() => {
                  pushHistory();
                  const id = "logo-" + Math.random().toString(36).slice(2, 7);
                  setTpl(p => ({ ...p, elements: p.elements.concat([{
                    id, type: "image", x: 60, y: 60, w: 220, h: 80, fit: "contain", src: l.url,
                  }]) }));
                  setSelId(id); setSelIds([id]);
                }}>{l.name}</button>
              ))}
            </div>
          </div>

          {/* ── Canvas ─────────────────────────────────────────────────── */}
          <div className="dsn-stage">
            <div ref={hostRef} className="dsn-canvas-host" aria-label="Card design canvas"/>
            <div className="dsn-stage-note">
              {tpl.w} × {tpl.h} design units · {tpl.safe}-unit safe area · {tpl.bleedMm}mm bleed
            </div>
          </div>

          {/* ── Properties + bind ──────────────────────────────────────── */}
          <div className="dsn-rail">
            <div className="dsn-rail-head">{sel ? sel.type + " · " + sel.id : "Nothing selected"}</div>
            {!sel && <p className="dsn-hint">Pick a layer or click the card.</p>}
            {sel && <>
              <div className="dsn-props">
                {["x", "y", "w", "h"].map(k => (
                  <label key={k} className="dsn-prop"><span>{k.toUpperCase()}</span>
                    <input type="number" value={sel[k] == null ? "" : sel[k]}
                      onChange={e => patch(sel.id, { [k]: Number(e.target.value) })}/></label>
                ))}
              </div>
              {sel.type === "text" && <>
                <label className="dsn-prop-wide"><span>Text</span>
                  <input value={sel.text || ""} onChange={e => patch(sel.id, { text: e.target.value })}/></label>
                {/* The bind picker — the thing that makes this an ID designer
                    rather than a drawing app. Choosing a field replaces the
                    text with its token, and the canvas immediately shows the
                    previewed child's real value. */}
                <label className="dsn-prop-wide"><span>Show which field</span>
                  <select value={(String(sel.text || "").match(/^\{\{\s*([\w.]+)\s*\}\}$/) || ["", ""])[1]}
                    onChange={e => patch(sel.id, { text: e.target.value ? "{{" + e.target.value + "}}" : "Text" })}>
                    <option value="">Fixed text</option>
                    {Object.keys(window.TPL_FIELDS).filter(k => !window.TPL_FIELDS[k].isColor && !window.TPL_FIELDS[k].isImage)
                      .map(k => <option key={k} value={k}>{window.TPL_FIELDS[k].label}</option>)}
                  </select></label>
                <div className="dsn-props">
                  <label className="dsn-prop"><span>Size</span>
                    <input type="number" value={sel.size || 24} onChange={e => patch(sel.id, { size: Number(e.target.value) })}/></label>
                  <label className="dsn-prop"><span>Weight</span>
                    <input type="number" step={100} value={sel.weight || 400} onChange={e => patch(sel.id, { weight: Number(e.target.value) })}/></label>
                  <label className="dsn-prop"><span>Track</span>
                    <input type="number" step={0.1} value={sel.letterSpacing || 0} onChange={e => patch(sel.id, { letterSpacing: Number(e.target.value) })}/></label>
                  <label className="dsn-prop"><span>Colour</span>
                    <input type="color" value={/^#/.test(sel.color || "") ? sel.color : "#101010"}
                      onChange={e => patch(sel.id, { color: e.target.value })}/></label>
                </div>
                <label className="dsn-check"><input type="checkbox" checked={!!sel.fit}
                  onChange={e => patch(sel.id, { fit: e.target.checked })}/> Shrink to fit the box</label>
                <label className="dsn-check"><input type="checkbox" checked={sel.transform === "upper"}
                  onChange={e => patch(sel.id, { transform: e.target.checked ? "upper" : "" })}/> Uppercase</label>
                {/* Ink that reads its own background, exposed as a choice
                    because the colour underneath is admin-picked AFTER the
                    design is drawn. */}
                <label className="dsn-prop-wide"><span>Font</span>
                  <select value={sel.font || window.TPL_FONTS[0].stack}
                    onChange={e => patch(sel.id, { font: e.target.value })}>
                    {window.TPL_FONTS.map(f => <option key={f.name} value={f.stack}>{f.name}</option>)}
                  </select></label>
                <label className="dsn-prop-wide"><span>Or take ink from</span>
                  <select value={/^\{\{ink\./.test(sel.color || "") ? sel.color : ""}
                    onChange={e => patch(sel.id, { color: e.target.value || "#101010" })}>
                    <option value="">A fixed colour</option>
                    <option value="{{ink.centre}}">Whatever the centre colour is</option>
                    <option value="{{ink.tier}}">Whatever the tier colour is</option>
                  </select></label>
              </>}
              {(sel.type === "rect" || sel.type === "ellipse") && (
                <div className="dsn-props">
                  <label className="dsn-prop"><span>Fill</span>
                    <input type="color" value={/^#/.test(sel.fill || "") ? sel.fill : "#cccccc"}
                      onChange={e => patch(sel.id, { fill: e.target.value })}/></label>
                  <label className="dsn-prop"><span>Radius</span>
                    <input type="number" value={sel.radius || 0} onChange={e => patch(sel.id, { radius: Number(e.target.value) })}/></label>
                  <label className="dsn-prop-wide" style={{ gridColumn: "1 / -1" }}><span>Or the colour of</span>
                    <select value={/^\{\{/.test(sel.fill || "") ? sel.fill : ""}
                      onChange={e => patch(sel.id, { fill: e.target.value || "#cccccc" })}>
                      <option value="">A fixed colour</option>
                      <option value="{{centre.color}}">The centre</option>
                      <option value="{{tier.color}}">The tier</option>
                    </select></label>
                </div>
              )}
              {sel.type === "image" && <>
                <label className="dsn-prop-wide"><span>Picture</span>
                  <select value={sel.src === "{{photo}}" ? "{{photo}}" : ""}
                    onChange={e => patch(sel.id, { src: e.target.value })}>
                    <option value="">A fixed picture</option>
                    <option value="{{photo}}">This child's photograph</option>
                  </select></label>
                <div className="dsn-adds">
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={openFilerobot}>Edit photo (Filerobot)</button>
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={openTui}>Masks & icons (TUI)</button>
                </div>
              </>}
              {/* ── Fill, for anything that has one ────────────────────────
                  A flat colour or a two-stop gradient. Stored as data in the
                  schema rather than as a Fabric object, so the design stays a
                  plain JSON document the server can validate. */}
              {(sel.type === "rect" || sel.type === "ellipse") && (() => {
                const g = sel.fill && typeof sel.fill === "object" ? sel.fill : null;
                return (
                  <>
                    <label className="dsn-check">
                      <input type="checkbox" checked={!!g} onChange={e => patch(sel.id, {
                        fill: e.target.checked
                          ? { type: "linear", angle: 90, stops: [{ offset: 0, color: "#1B2B6B" }, { offset: 1, color: "#0C1432" }] }
                          : "#1B2B6B",
                      })}/> Gradient fill
                    </label>
                    {g && <div className="dsn-props">
                      <label className="dsn-prop"><span>From</span>
                        <input type="color" value={(g.stops[0] || {}).color || "#1B2B6B"}
                          onChange={e => patch(sel.id, { fill: { ...g, stops: [{ offset: 0, color: e.target.value }, g.stops[1]] } })}/></label>
                      <label className="dsn-prop"><span>To</span>
                        <input type="color" value={(g.stops[1] || {}).color || "#0C1432"}
                          onChange={e => patch(sel.id, { fill: { ...g, stops: [g.stops[0], { offset: 1, color: e.target.value }] } })}/></label>
                      <label className="dsn-prop"><span>Angle</span>
                        <input type="number" step={15} value={g.angle || 0}
                          onChange={e => patch(sel.id, { fill: { ...g, angle: Number(e.target.value) } })}/></label>
                      <label className="dsn-prop"><span>Shape</span>
                        <select value={g.type} onChange={e => patch(sel.id, { fill: { ...g, type: e.target.value } })}>
                          <option value="linear">Linear</option><option value="radial">Radial</option>
                        </select></label>
                    </div>}
                  </>
                );
              })()}
              {/* Opacity and a drop shadow, on every element type — the two
                  things every design tool has and the card layout never needed. */}
              <div className="dsn-props">
                <label className="dsn-prop"><span>Opacity</span>
                  <input type="number" min={0} max={1} step={0.05} value={sel.opacity == null ? 1 : sel.opacity}
                    onChange={e => patch(sel.id, { opacity: Number(e.target.value) })}/></label>
                <label className="dsn-prop"><span>Rotation</span>
                  <input type="number" step={1} value={sel.rotation || 0}
                    onChange={e => patch(sel.id, { rotation: Number(e.target.value) })}/></label>
              </div>
              <label className="dsn-check">
                <input type="checkbox" checked={!!sel.shadow} onChange={e => patch(sel.id, {
                  shadow: e.target.checked ? { color: "rgba(12,20,50,.35)", blur: 18, x: 0, y: 8 } : null,
                })}/> Drop shadow
              </label>
              {sel.shadow && <div className="dsn-props">
                <label className="dsn-prop"><span>Blur</span>
                  <input type="number" value={sel.shadow.blur || 0}
                    onChange={e => patch(sel.id, { shadow: { ...sel.shadow, blur: Number(e.target.value) } })}/></label>
                <label className="dsn-prop"><span>Drop</span>
                  <input type="number" value={sel.shadow.y || 0}
                    onChange={e => patch(sel.id, { shadow: { ...sel.shadow, y: Number(e.target.value) } })}/></label>
              </div>}
              <div className="dsn-adds" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => move(sel.id, 1)}>Bring forward</button>
                <button className="btn btn-ghost btn-sm" onClick={() => move(sel.id, -1)}>Send back</button>
                <button className="btn btn-ghost btn-sm" onClick={() => removeElement(sel.id)}>Delete</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* ── Preflight ──────────────────────────────────────────────────────
          Live, not a gate at the end. Errors block publish here AND on the
          server; warnings are said and allowed, because "this may be trimmed"
          is sometimes exactly what a designer meant. */}
      {tpl && (
        <div className={"dsn-flight" + (errs.length ? " is-bad" : warns.length ? " is-warn" : " is-ok")}>
          <b>{errs.length ? errs.length + " problem" + (errs.length === 1 ? "" : "s") + " to fix before this can print"
            : warns.length ? warns.length + " thing" + (warns.length === 1 ? "" : "s") + " to look at"
            : "Ready to print"}</b>
          <ul>
            {errs.concat(warns).slice(0, 10).map((p, i) => (
              <li key={i} className={p.level === "error" ? "is-bad" : ""}>
                {p.message}{p.elId ? " (" + p.elId + ")" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The photo editors mount here. Kept in the DOM at all times but hidden,
          because Filerobot's createRoot needs a real element with layout. */}
      <div className={"dsn-photo" + (photoTool ? " is-open" : "")}>
        <div className="dsn-photo-bar">
          <b>{photoTool === "tui" ? "Masks, icons & drawing" : "Photo editor"}</b>
          {photoTool === "tui" && <button className="btn btn-primary btn-sm" onClick={applyTui}>Use this image</button>}
          <button className="btn btn-ghost btn-sm" onClick={photoTool === "tui" ? closeTui : () => setPhotoTool("")}>Close</button>
        </div>
        <div id="dsn-photo-host" style={{ minHeight: photoTool ? 560 : 0 }}/>
      </div>
    </>
  );
}

Object.assign(window, { DesignerPage, dsnBlank, dsnFromPreset, dsnQrUrl, dsnRaster, dsnFileName, DSN_SAMPLE,
                        dsnMergeAudit, dsnRowName, dsnRowFile, dsnPerSheet });
