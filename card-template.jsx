/* ============================================================================
   ID card templates — the schema, the binder, the renderer, the preflight.

   The card artwork this app prints today is JSX: the layout is code and only
   the DATA varies per child. This file generalises that one step — the layout
   becomes data too, so an admin can draw a new card without a deploy.

   THE ONE RULE THAT SHAPES EVERYTHING HERE: there is exactly one renderer.

   The obvious build is a Fabric canvas for editing and the existing DOM/
   html2canvas path for printing. That is two renderers for one document, and
   they drift — a shadow that lands 2px off, a font that falls back, a rounded
   corner that is square on paper. You find out at the guillotine, on three
   hundred cards. So a template is drawn by tplToFabric() and NOTHING else:
   the designer canvas, the roster preview and the 300-DPI export are the same
   function at three different scales. What the admin sees is what prints,
   because it is the same code producing both.

   The hand-coded cards (CardFront, VolunteerCardFront) are untouched and keep
   their own path. They are the fallback that must always work.

   Geometry is in DESIGN UNITS on a 590-wide grid, exactly like the JSX cards,
   so the two systems describe a card the same way and a template can be checked
   against the printed spec in docs/PRINT-SPEC.md without conversion.
   ============================================================================ */

/* The fields a template element can bind to. Each knows how to read itself off
   a card row, so the binder never guesses at shapes, and the designer's field
   picker is generated from this list rather than hand-maintained beside it. */
const TPL_FIELDS = {
  "firstName":    { label: "First name",   get: r => r.firstName || "" },
  "surname":      { label: "Surname",      get: r => r.surname || "" },
  "fullName":     { label: "Full name",    get: r => r.fullName || [r.firstName, r.surname].filter(Boolean).join(" ") },
  "displayId":    { label: "Printed ID",   get: r => r.displayId || r.studentId || r.volunteerId || "" },
  "handle":       { label: "Handle",       get: r => r.handle ? "@" + r.handle : "" },
  "track":        { label: "Course",       get: r => r.track || "" },
  "faculty":      { label: "Faculty",      get: r => r.faculty || "" },
  "role":         { label: "Role",         get: r => r.role || (r.tier && r.tier.name) || "" },
  "roleFaculty":  { label: "Role · faculty", get: r => [r.role || (r.tier && r.tier.name) || "", r.faculty || ""].filter(Boolean).join(" · ") },
  "centre.name":  { label: "Centre name",  get: r => (r.centre && r.centre.name) || "" },
  "centre.code":  { label: "Centre code",  get: r => (r.centre && r.centre.code) || "" },
  "centre.color": { label: "Centre colour", get: r => (r.centre && r.centre.color) || "#76B043", isColor: true },
  "tier.name":    { label: "Tier name",    get: r => (r.tier && r.tier.name) || "" },
  "tier.code":    { label: "Tier code",    get: r => (r.tier && r.tier.code) || "" },
  "tier.color":   { label: "Tier colour",  get: r => (r.tier && r.tier.color) || "#00225F", isColor: true },
  "expiresAt":    { label: "Valid to",     get: r => String(r.expiresAt || "").slice(0, 10) },
  "photo":        { label: "Photograph",   get: r => r.photoUrl || "", isImage: true },
  "token":        { label: "QR token",     get: r => r.token || "" },
  /* Ink chosen from whatever colour the element sits on. It is a FIELD rather
     than a designer choice because the colour it depends on is picked by an
     admin in a colour picker after the template is drawn — a template that
     hard-codes white text is a template that prints white on pale yellow the
     first time somebody adds a centre. Same rule as the rest of the app. */
  "ink.centre":   { label: "Ink on centre colour", get: r => inkOn((r.centre && r.centre.color) || "#76B043").ink, isColor: true },
  "ink.tier":     { label: "Ink on tier colour",   get: r => inkOn((r.tier && r.tier.color) || "#00225F").ink, isColor: true },
};

/** Substitute {{field}} tokens in a string against a card row.
 *  A value that is ENTIRELY one token returns that field's value with its own
 *  type intact; a value with text around it is stringified and joined. */
function tplBindValue(value, row) {
  if (typeof value !== "string" || value.indexOf("{{") === -1) return value;
  const whole = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
  if (whole) {
    const f = TPL_FIELDS[whole[1]];
    return f ? f.get(row || {}) : "";
  }
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const f = TPL_FIELDS[k];
    return f ? String(f.get(row || {})) : "";
  });
}

/** A template with every binding resolved against one card row — the input to
 *  the renderer, and a plain object a test can assert on without a canvas. */
function tplResolve(template, row) {
  const t = template || {};
  const out = {
    id: t.id || "", name: t.name || "", kind: t.kind || "student",
    w: Number(t.w) || 590, h: Number(t.h) || 972,
    /* How big it is in the real world. This used to be assumed — every mm
       calculation divided by 54/590, the width of an ID card — which is fine
       while the only thing this renders is an ID card and wrong the moment it
       renders an A4 poster, where the same 98 units is 15mm rather than 9. */
    wMm: Number(t.wMm) || 54, hMm: Number(t.hMm) || 0,
    bleedMm: Number(t.bleedMm) || 0, safe: Number(t.safe) || 30,
    background: tplBindValue(t.background || "#ffffff", row),
    elements: [],
  };
  if (!out.hMm) out.hMm = Math.round(out.wMm * out.h / out.w * 10) / 10;
  (t.elements || []).forEach((el, i) => {
    const e = {};
    Object.keys(el).forEach(k => { e[k] = tplBindValue(el[k], row); });
    e.id = e.id || ("el" + i);
    /* Text is uppercased AFTER binding, never before: the rule belongs to the
       element ("this line shouts"), not to the data, and a template that stored
       upper-cased data would lose the real name for any other use. */
    if (e.type === "text") {
      let s = String(e.text == null ? "" : e.text);
      if (e.transform === "upper") s = s.toUpperCase();
      else if (e.transform === "lower") s = s.toLowerCase();
      e.text = s;
    }
    out.elements.push(e);
  });
  return out;
}

/* The same one-line fit the JSX cards use, so a bound name behaves identically
   whether it is drawn by a template or by VolunteerCardFront. Inter advances
   about 0.62em per glyph at these weights. */
function tplFitSize(el) {
  const base = Number(el.size) || 24;
  const avail = Number(el.w) || 0;
  if (!el.fit || !avail) return base;
  const n = (String(el.text || "").trim().length) || 1;
  const track = Number(el.letterSpacing) || 0;
  const floor = el.minSize != null ? Number(el.minSize) : base * 0.5;
  return Math.max(floor, Math.min(base, (avail - n * track) / (n * 0.62)));
}

/* ── The renderer ─────────────────────────────────────────────────────────────
 * One function, three callers: the designer canvas, the preview, and the export.
 * `scale` is units → pixels; everything else is geometry straight from the
 * schema. Images and the QR resolve asynchronously, so this returns a promise
 * that settles when the canvas is genuinely complete — an export that fires
 * before the photograph has decoded produces a card with a grey box where a
 * child's face should be, and it does it silently.
 */
function tplToFabric(resolved, fabric, canvas, opts) {
  const o = opts || {};
  const scale = o.scale == null ? 1 : o.scale;
  const px = (n) => (Number(n) || 0) * scale;
  const selectable = !!o.selectable;

  canvas.setDimensions({ width: px(resolved.w), height: px(resolved.h) });
  canvas.backgroundColor = resolved.background || "#ffffff";

  /* ── Paint ────────────────────────────────────────────────────────────────
     A fill is a colour string, or a gradient object. Kept as data in the schema
     rather than as a Fabric instance, so a design is still a plain JSON document
     that a PHP validator can read and a future renderer can honour. */
  const paint = (v, el) => {
    if (!v || typeof v === "string") return v || null;
    if (v.type === "linear" || v.type === "radial") {
      const stops = (v.stops || []).map(st => ({ offset: Number(st.offset) || 0, color: st.color || "#000" }));
      const w = px(el.w) || 1, h = px(el.h) || 1;
      // Angle in degrees, 0 = left→right, measured clockwise like every design tool.
      const a = ((Number(v.angle) || 0) % 360) * Math.PI / 180;
      const co = v.type === "radial"
        ? { r1: 0, r2: Math.max(w, h) / 2, x1: w / 2, y1: h / 2, x2: w / 2, y2: h / 2 }
        : { x1: w / 2 - Math.cos(a) * w / 2, y1: h / 2 - Math.sin(a) * h / 2,
            x2: w / 2 + Math.cos(a) * w / 2, y2: h / 2 + Math.sin(a) * h / 2 };
      return new fabric.Gradient({ type: v.type === "radial" ? "radial" : "linear", coords: co, colorStops: stops });
    }
    return null;
  };
  const shade = (el) => {
    const sh = el.shadow;
    if (!sh) return null;
    return new fabric.Shadow({
      color: sh.color || "rgba(0,0,0,.28)",
      blur: px(Number(sh.blur) || 0), offsetX: px(Number(sh.x) || 0), offsetY: px(Number(sh.y) || 0),
    });
  };

  const jobs = resolved.elements.filter(el => !el.hidden).map(el => {
    const common = {
      /* Fabric 7 defaults originX/originY to "center", where 5 and 6 defaulted to
         "left"/"top". Left implicit, every element renders offset by half its own
         size — a card that looks plausibly wrong rather than obviously broken,
         with the panel hanging off the left edge and the name clipped. The schema
         means top-left, so say so. */
      originX: "left", originY: "top",
      left: px(el.x), top: px(el.y), angle: Number(el.rotation) || 0,
      opacity: el.opacity == null ? 1 : Number(el.opacity),
      shadow: shade(el),
      // A locked layer still draws and still exports; it just cannot be nudged
      // by a stray drag, which is what "lock" means to anyone who has used a
      // design tool.
      selectable: selectable && !el.locked, evented: selectable && !el.locked,
      hasControls: selectable && !el.locked,
      // Carried through so the designer can map a canvas object back to the
      // element it came from without keeping a parallel index.
      nggId: el.id, nggType: el.type, nggBind: el.bind || "",
    };
    if (el.type === "rect" || el.type === "shape") {
      return new fabric.Rect(Object.assign({}, common, {
        width: px(el.w), height: px(el.h), fill: paint(el.fill, el) || "#000000",
        rx: px(el.radius || 0), ry: px(el.radius || 0),
        stroke: el.stroke || null, strokeWidth: px(el.strokeWidth || 0),
      }));
    }
    if (el.type === "ellipse") {
      return new fabric.Ellipse(Object.assign({}, common, {
        // rx/ry are radii, so a bounding box of w×h in the schema is w/2, h/2 here.
        rx: px((Number(el.w) || 0) / 2), ry: px((Number(el.h) || 0) / 2),
        fill: paint(el.fill, el) || "#000000", stroke: el.stroke || null, strokeWidth: px(el.strokeWidth || 0),
      }));
    }
    if (el.type === "line") {
      return new fabric.Line([px(el.x), px(el.y), px(el.x) + px(el.w), px(el.y) + px(el.h || 0)],
        Object.assign({}, common, { left: px(el.x), top: px(el.y), stroke: el.stroke || el.fill || "#000000", strokeWidth: px(el.strokeWidth || 1) }));
    }
    if (el.type === "text") {
      const size = tplFitSize(el);
      const t = new fabric.Textbox(String(el.text == null ? "" : el.text), Object.assign({}, common, {
        width: px(el.w) || px(200),
        fontFamily: el.font || "Inter",
        fontSize: px(size),
        fontWeight: el.weight || 400,
        fill: paint(el.color, el) || "#101010",
        textAlign: el.align || "left",
        charSpacing: (Number(el.letterSpacing) || 0) / (size || 1) * 1000, // fabric uses 1/1000 em
        lineHeight: Number(el.lineHeight) || 1.1,
        splitByGrapheme: false,
        editable: false,
      }));
      /* Vertical centring is the designer's mental model ("this line sits in
         this box"), but Fabric grows a Textbox downward from `top`. Without
         this a fitted line that shrank would drift up the card. */
      if (el.vAlign === "middle" && el.h) t.set({ top: px(el.y) + (px(el.h) - t.height) / 2 });
      return t;
    }
    if (el.type === "path") {
      /* What the pencil leaves behind. Stored as SVG path data in the element's
         own coordinate space, so it scales with the card like everything else
         instead of being baked into a bitmap at whatever zoom it was drawn at. */
      const p = new fabric.Path(String(el.d || ""), Object.assign({}, common, {
        fill: el.fill && el.fill !== "none" ? paint(el.fill, el) : null,
        stroke: el.stroke || "#101010", strokeWidth: px(el.strokeWidth || 2),
        strokeLineCap: "round", strokeLineJoin: "round",
      }));
      // The path's own bounds are wherever it was drawn; x/y in the schema say
      // where it belongs.
      p.set({ left: px(el.x), top: px(el.y) });
      if (el.w && p.width) p.set({ scaleX: px(el.w) / p.width });
      if (el.h && p.height) p.set({ scaleY: px(el.h) / p.height });
      return p;
    }
    if (el.type === "image" || el.type === "qr") {
      const url = el.type === "qr"
        ? (o.qrUrl ? o.qrUrl(el.token || el.src || "") : String(el.src || ""))
        : String(el.src || "");
      if (!url) {
        // A placeholder rather than nothing: a missing photograph has to be
        // visible on the proof, not an invisible gap that prints as white.
        return new fabric.Rect(Object.assign({}, common, {
          width: px(el.w), height: px(el.h), fill: el.fill || "#eef0f4",
          rx: px(el.radius || 0), ry: px(el.radius || 0),
        }));
      }
      return fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" }).then(img => {
        const bw = px(el.w) || img.width, bh = px(el.h) || img.height;
        /* cover crops to fill, contain fits inside. Scaling the image itself
           rather than stretching it is the same rule the JSX cards follow: a
           face is never distorted to fit a frame. */
        const s = el.fit === "contain"
          ? Math.min(bw / img.width, bh / img.height)
          : Math.max(bw / img.width, bh / img.height);
        img.set(Object.assign({}, common, {
          scaleX: s, scaleY: s,
          left: px(el.x) + (bw - img.width * s) / 2,
          top: px(el.y) + (bh - img.height * s) / 2,
        }));
        if (el.fit !== "contain") {
          // Crop to the frame, in the image's own coordinate space.
          img.set({ clipPath: new fabric.Rect({
            width: bw / s, height: bh / s,
            rx: (px(el.radius || 0)) / s, ry: (px(el.radius || 0)) / s,
            originX: "center", originY: "center",
          }) });
        }
        img.nggId = el.id; img.nggType = el.type; img.nggBind = el.bind || "";
        return img;
      }).catch(() => new fabric.Rect(Object.assign({}, common, {
        width: px(el.w), height: px(el.h), fill: "#eef0f4",
      })));
    }
    return null;
  });

  return Promise.all(jobs).then(objs => {
    /* Only paint if this render is still the current one.
     *
     * Images resolve asynchronously, so two redraws started a frame apart can
     * finish out of order: the second one clears the canvas, then the FIRST
     * one's objects arrive and are added to a canvas that is about to be cleared
     * again — or worse, the second clears after the first has painted and the
     * card is simply blank. It only shows up on designs that load an image,
     * which is why the ID card looked fine and a poster with a logo on it came
     * out white. The caller owns the token; without one, always paint. */
    if (o.shouldPaint && !o.shouldPaint()) return canvas;
    objs.filter(Boolean).forEach(ob => canvas.add(ob));
    canvas.renderAll();
    return canvas;
  });
}

/* ── Preflight ────────────────────────────────────────────────────────────────
 * Canva has no equivalent of this, and it is the reason a generic design tool
 * is the wrong thing to embed for a credential. These are the checks that stop
 * three hundred unusable cards, and every one of them is a mistake that is
 * invisible on screen and expensive on card stock.
 */
/* ── How small a QR may be ────────────────────────────────────────────────────
 *
 * The first version of this check used the code's OVERALL size, with an 18mm
 * floor. That number was invented, and it was wrong in the way invented numbers
 * usually are: it failed the volunteer card this programme already prints and
 * already scans, whose QR is 98 units — about 9mm.
 *
 * What actually decides whether a camera can read a code is the MODULE size:
 * one dark square, in millimetres. The same 9mm code carrying a short token is
 * comfortable and carrying a long URL is unreadable, because a longer payload
 * needs a higher version and therefore more, smaller modules in the same space.
 * So the check asks the encoder how many modules this payload needs and divides.
 *
 * The thresholds are the ones the printing industry uses for close-range camera
 * scanning: 0.4mm is the comfortable floor, 0.3mm is where phones start to
 * struggle. Between them it warns; below 0.3 it refuses. That puts the current
 * card at 0.31mm — passing, with a warning that is worth acting on, which is a
 * more honest answer than either "fine" or "refuse to print the card we print".
 */
const TPL_QR_GOOD_MODULE_MM = 0.40;
const TPL_QR_MIN_MODULE_MM = 0.30;
/** Millimetres per design unit, from the template's own trim size. */
function tplMmPerUnit(t) {
  const w = Number((t && t.w) || 590) || 590;
  return (Number((t && t.wMm) || 54) || 54) / w;
}

/** How many modules across a QR of this payload needs. Asks the real encoder
 *  when it is on the page; falls back to version 3 (29 modules), which is what
 *  an origin + /q/ + an 8-character token comes to. */
function tplQrModules(payload) {
  try {
    if (window.qrcode) {
      const q = window.qrcode(0, "M");
      q.addData(String(payload || "https://example.org/q/SUMQR-0000"));
      q.make();
      return q.getModuleCount();
    }
  } catch (_) {}
  return 29;
}

function tplPreflight(template, rows, requiredFields) {
  const t = template || {};
  const els = t.elements || [];
  const problems = [];
  const add = (level, message, elId) => problems.push({ level, message, elId: elId || "" });

  const bound = {};
  els.forEach(el => {
    Object.keys(el).forEach(k => {
      const v = el[k];
      if (typeof v === "string") {
        (v.match(/\{\{\s*([\w.]+)\s*\}\}/g) || []).forEach(m => {
          const key = m.replace(/[{}\s]/g, "");
          bound[key] = (bound[key] || 0) + 1;
          if (!TPL_FIELDS[key]) add("error", "Unknown field {{" + key + "}}", el.id);
        });
      }
    });
  });

  (requiredFields || []).forEach(f => {
    // `role` is satisfied by either field that prints it — a card showing
    // "INSTRUCTOR · MUSIC" is not missing the role.
    if (f === "role" && (bound.role || bound.roleFaculty)) return;
    if (!bound[f]) add("error", "Nothing on this card shows " + (TPL_FIELDS[f] ? TPL_FIELDS[f].label : f));
  });

  const qr = els.filter(e => e.type === "qr");
  // Only a credential needs one. A poster with a QR is welcome to have one and
  // it is still checked for size; a poster without one is simply a poster.
  if (!qr.length && t.kind !== "graphic") add("error", "No QR — the card cannot be scanned at a gate");
  if (qr.length > 1) add("error", "Two QR codes — a scanner reads whichever it sees first");
  const origin = (typeof window !== "undefined" && window.location) ? window.location.origin : "";
  qr.forEach(q => {
    const mm = Math.min(Number(q.w) || 0, Number(q.h) || 0) * tplMmPerUnit(t);
    // The longest token in the batch, because that is the one that decides the
    // version — proofing on the shortest would pass a code the longest cannot use.
    const longest = (rows || []).reduce((a, r) => {
      const t = String((r && r.token) || "");
      return t.length > a.length ? t : a;
    }, "SUMQR-0000");
    const modules = tplQrModules(origin + "/q/" + longest);
    const perModule = modules ? mm / modules : 0;
    if (perModule < TPL_QR_MIN_MODULE_MM) {
      add("error", "The QR is " + mm.toFixed(1) + "mm, which is " + perModule.toFixed(2)
        + "mm per square — under " + TPL_QR_MIN_MODULE_MM.toFixed(2) + "mm a phone camera cannot read it", q.id);
    } else if (perModule < TPL_QR_GOOD_MODULE_MM) {
      add("warn", "The QR is " + mm.toFixed(1) + "mm, which is " + perModule.toFixed(2)
        + "mm per square — it will scan, but " + TPL_QR_GOOD_MODULE_MM.toFixed(2)
        + "mm is the comfortable floor for print", q.id);
    }
    if (Math.abs((Number(q.w) || 0) - (Number(q.h) || 0)) > 1) add("error", "The QR must stay square", q.id);
  });

  // Nothing may cross the safe area — a guillotine is accurate to about a
  // millimetre, and type that close to the trim comes back cut.
  const safe = Number(t.safe) || 0;
  if (safe > 0) {
    els.forEach(el => {
      if (el.type === "rect" && el.role === "background") return;   // deliberate full-bleed
      const x = Number(el.x) || 0, y = Number(el.y) || 0;
      const w = Number(el.w) || 0, h = Number(el.h) || 0;
      if (x < safe || y < safe || x + w > (Number(t.w) || 590) - safe || y + h > (Number(t.h) || 972) - safe) {
        add("warn", "Inside the " + safe + "-unit safe area — this may be trimmed off", el.id);
      }
    });
  }

  /* The check that only real data can answer: does the longest name in THIS
     cohort still fit? A template proofed against "Tunde Bakare" and printed for
     "Oyelaran-Oyeyinka" is a template that was never really tested. */
  (rows || []).forEach(row => {
    const r = tplResolve(t, row);
    r.elements.forEach((el, i) => {
      if (el.type !== "text" || !el.fit) return;
      const src = els[i] || {};
      const size = tplFitSize(el);
      const floor = src.minSize != null ? Number(src.minSize) : (Number(src.size) || 24) * 0.5;
      if (size <= floor + 0.01 && String(el.text || "").length > 0) {
        add("warn", "“" + el.text + "” only fits at the minimum size", el.id);
      }
    });
  });

  return problems;
}

/* ── The cards we already print, as templates ─────────────────────────────────
 * These are the acceptance test for the schema: if it cannot express the cards
 * this programme already prints, it is the wrong schema and no amount of editor
 * makes up for that. They ship as read-only "system" designs — duplicable, so
 * there is always a known-good starting point, and never editable, so there is
 * always a known-good card to fall back to.
 */
const TPL_SYSTEM = [
  {
    id: "sys-volunteer-front", name: "Volunteer ID — front", kind: "volunteer", system: true,
    w: 590, h: 972, safe: 30, bleedMm: 3,
    // The centre colour IS the frame, on all four edges. See the build spec.
    background: "{{centre.color}}",
    elements: [
      { id: "panel", type: "rect", x: 30, y: 30, w: 530, h: 830, radius: 22, fill: "#ffffff" },
      { id: "photo", type: "image", x: 93, y: 156, w: 404, h: 318, radius: 22, fit: "cover", src: "{{photo}}", fill: "#eef0f4" },
      { id: "first", type: "text", x: 85, y: 500, w: 420, h: 40, text: "{{firstName}}", size: 33, weight: 400,
        color: "#5b6478", align: "center", letterSpacing: 0.4, fit: true },
      { id: "surname", type: "text", x: 83, y: 540, w: 424, h: 56, text: "{{surname}}", size: 50, weight: 800,
        color: "#1B2B6B", align: "center", letterSpacing: -1.2, transform: "upper", fit: true },
      { id: "pill", type: "rect", x: 115, y: 616, w: 360, h: 46, radius: 23, fill: "{{tier.color}}" },
      { id: "role", type: "text", x: 115, y: 616, w: 360, h: 46, text: "{{roleFaculty}}", size: 18, weight: 700,
        color: "{{ink.tier}}", align: "center", letterSpacing: 3.2, transform: "upper", vAlign: "middle", fit: true },
      { id: "qr", type: "qr", x: 128, y: 700, w: 98, h: 98, token: "{{token}}" },
      { id: "rule", type: "rect", x: 248, y: 712, w: 1, h: 74, fill: "#e6e8ee" },
      { id: "idlabel", type: "text", x: 270, y: 706, w: 200, text: "VOLUNTEER ID", size: 11, weight: 600, color: "#aeb4c0", letterSpacing: 2.4 },
      { id: "idvalue", type: "text", x: 270, y: 722, w: 200, text: "{{displayId}}", size: 21, weight: 500, color: "#1B2B6B", font: "monospace" },
      { id: "vlabel", type: "text", x: 270, y: 757, w: 200, text: "VALID TO", size: 11, weight: 600, color: "#aeb4c0", letterSpacing: 2.4 },
      { id: "vvalue", type: "text", x: 270, y: 773, w: 200, text: "{{expiresAt}}", size: 15, weight: 500, color: "#5b6478", font: "monospace" },
      { id: "band", type: "text", x: 35, y: 890, w: 520, h: 52, text: "{{centre.code}}  ·  {{centre.name}}", size: 25, weight: 600,
        color: "{{ink.centre}}", align: "center", letterSpacing: 5, transform: "upper", vAlign: "middle", fit: true, minSize: 22 },
    ],
  },
  {
    id: "sys-student-front", name: "Student ID — front", kind: "student", system: true,
    w: 590, h: 972, safe: 24, bleedMm: 3,
    background: "#ffffff",
    elements: [
      { id: "photo", type: "image", x: 135, y: 150, w: 320, h: 320, radius: 160, fit: "cover", src: "{{photo}}", fill: "#eef0f4" },
      { id: "first", type: "text", x: 85, y: 520, w: 420, h: 48, text: "{{firstName}}", size: 42, weight: 800,
        color: "#E4155F", align: "center", letterSpacing: -1, transform: "upper", fit: true },
      { id: "surname", type: "text", x: 83, y: 572, w: 424, h: 52, text: "{{surname}}", size: 46, weight: 800,
        color: "#1B2B6B", align: "center", letterSpacing: -1, transform: "upper", fit: true },
      { id: "track", type: "text", x: 85, y: 634, w: 420, h: 30, text: "{{track}}", size: 22, weight: 800,
        color: "#1B2B6B", align: "center", letterSpacing: 1.4, transform: "upper", fit: true },
      { id: "qr", type: "qr", x: 243, y: 700, w: 104, h: 104, token: "{{token}}" },
      { id: "idvalue", type: "text", x: 85, y: 820, w: 420, text: "{{displayId}}", size: 18, weight: 500,
        color: "#5b6478", align: "center", font: "monospace" },
      { id: "band", type: "rect", x: 0, y: 944, w: 590, h: 28, fill: "{{centre.color}}", role: "background" },
      { id: "bandtext", type: "text", x: 25, y: 944, w: 540, h: 28, text: "{{centre.name}}", size: 15, weight: 800,
        color: "{{ink.centre}}", align: "center", letterSpacing: 2.2, transform: "upper", vAlign: "middle", fit: true, role: "background" },
    ],
  },
];

/* ── What NGG actually needs to make ─────────────────────────────────────────
 *
 * This tool started as an ID card designer, which is the same mistake the rest
 * of the product has been making: everything built so far serves the SUMMER
 * PROGRAMME, and Next Generation Genius is an organisation that exists the other
 * eleven months of the year. It has a launch to announce, a centre opening, a
 * donor report, volunteers to recruit, certificates to award and a WhatsApp
 * status to post — none of which is a 54mm card with a QR on it.
 *
 * So the designer takes a size, and an ID card is one of the sizes. Every preset
 * carries its REAL dimensions in millimetres, because that is what decides
 * export resolution, what "0.4mm per QR square" means, and whether 12pt type is
 * readable — all of which were previously hard-coded to the width of an ID card.
 */
const TPL_PRESETS = [
  { id: "id-card",     group: "Credentials", name: "ID card (54 × 75mm)", kind: "student",   w: 590, h: 819,  wMm: 54,  hMm: 75,  safe: 30, bleedMm: 3 },
  { id: "id-card-tall",group: "Credentials", name: "ID card (54 × 89mm)", kind: "student",   w: 590, h: 972,  wMm: 54,  hMm: 89,  safe: 30, bleedMm: 3 },
  { id: "certificate", group: "Print",       name: "Certificate (A4 landscape)", kind: "graphic", w: 1240, h: 877, wMm: 297, hMm: 210, safe: 60, bleedMm: 3 },
  { id: "poster-a4",   group: "Print",       name: "Poster (A4 portrait)", kind: "graphic",  w: 877, h: 1240, wMm: 210, hMm: 297, safe: 50, bleedMm: 3 },
  { id: "poster-a3",   group: "Print",       name: "Poster (A3 portrait)", kind: "graphic",  w: 877, h: 1240, wMm: 297, hMm: 420, safe: 60, bleedMm: 3 },
  { id: "flyer-a5",    group: "Print",       name: "Flyer (A5 portrait)", kind: "graphic",   w: 620, h: 877,  wMm: 148, hMm: 210, safe: 40, bleedMm: 3 },
  { id: "banner",      group: "Print",       name: "Roll-up banner (850 × 2000mm)", kind: "graphic", w: 850, h: 2000, wMm: 850, hMm: 2000, safe: 60, bleedMm: 10 },
  { id: "social-sq",   group: "Social",      name: "Social square (1080 × 1080)", kind: "graphic", w: 1080, h: 1080, wMm: 274, hMm: 274, safe: 60, bleedMm: 0 },
  { id: "social-story",group: "Social",      name: "Story / status (1080 × 1920)", kind: "graphic", w: 1080, h: 1920, wMm: 274, hMm: 488, safe: 90, bleedMm: 0 },
  { id: "social-wide", group: "Social",      name: "Wide post (1200 × 630)", kind: "graphic", w: 1200, h: 630, wMm: 305, hMm: 160, safe: 50, bleedMm: 0 },
  { id: "letterhead",  group: "Documents",   name: "Letterhead (A4)", kind: "graphic",       w: 877, h: 1240, wMm: 210, hMm: 297, safe: 60, bleedMm: 0 },
];

/* NGG's own colours and marks, so anything made here is on-brand without
   anybody having to remember a hex. Taken from the values the product already
   ships — the same navy and crimson the cards and the site use. */
const TPL_BRAND = {
  colors: [
    { name: "NGG navy", hex: "#1B2B6B" },
    { name: "Deep navy", hex: "#0C1432" },
    { name: "NGG crimson", hex: "#E4155F" },
    { name: "Gold", hex: "#F5B026" },
    { name: "Leaf", hex: "#76B043" },
    { name: "Sky", hex: "#3B5BDB" },
    { name: "Ink", hex: "#101010" },
    { name: "Paper", hex: "#FFFFFF" },
  ],
  logos: [
    { name: "NGG lockup", url: "/assets/idcard/logo-lockup.png" },
    { name: "Street-To-Stardom", url: "/assets/idcard/logo-sts.svg" },
    { name: "NGG mark", url: "/assets/logo.png" },
  ],
};

/* One curated, self-hosted list. Not a 3,000-font picker: a print run in a font
   nobody has licensed is a legal problem, not a feature, and these are the faces
   the rest of the product already loads. */
const TPL_FONTS = [
  { name: "Inter", stack: '"Inter", system-ui, sans-serif' },
  { name: "Sora", stack: '"Sora", "Inter", sans-serif' },
  { name: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { name: "Monospace", stack: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
];

/** Required fields per card kind — what preflight refuses to publish without.
 *  A card with no name or no QR is not a card, it is a coloured rectangle. */
const TPL_REQUIRED = {
  student: ["surname", "token", "displayId"],
  volunteer: ["surname", "token", "displayId", "role"],
  /* A poster has no child to identify, so none of the credential rules apply to
     it. Running them anyway would mean every poster refused to publish for want
     of a QR — which is how a tool teaches people to bypass its own checks. */
  graphic: [],
};

Object.assign(window, {
  TPL_FIELDS, TPL_SYSTEM, TPL_REQUIRED, TPL_PRESETS, TPL_BRAND, TPL_FONTS,
  tplMmPerUnit, tplQrModules,
  TPL_QR_GOOD_MODULE_MM, TPL_QR_MIN_MODULE_MM,
  tplBindValue, tplResolve, tplFitSize, tplToFabric, tplPreflight,
});
