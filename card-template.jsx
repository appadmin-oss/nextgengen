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
  "disciplines":  { label: "Disciplines (1–2)", get: r => (Array.isArray(r.disciplines) ? r.disciplines.join(" / ") : (r.disciplines || r.track || "")) },
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

  /* ── The NGG member card ──────────────────────────────────────────────────
     The credential every year-round member carries, and the one card this
     system could not express — so it stayed hand-coded and moving a line on it
     meant a deploy. These are the member roster's OWN field names, so a design
     cannot bind to something the member payload does not hold.

     `given` / `family` exist because the member roster stores ONE `fullName`
     (the summer intake asks for the parts separately) and the card sets the two
     at different weights. Splitting on the last space is a guess and is
     documented as one: it is right for "Amina Bello" and wrong for a
     double-barrelled surname, which is why `fullName` is also bindable for a
     design that would rather set the whole thing on one line. */
  "member.id":     { label: "Member ID",        get: r => String(r.memberId || "") },
  "member.level":  { label: "Level",            get: r => String(r.level || "").toUpperCase() },
  "member.given":  { label: "Given name",       get: r => tplNameParts(r).given },
  "member.family": { label: "Family name",      get: r => tplNameParts(r).family },
  "member.joined": { label: "Member since",     get: r => String(r.joinDate || r.createdAt || "").slice(0, 7) },
  "member.type":   { label: "Membership type",  get: r => String(r.type || "") },
  "member.status": { label: "Status",           get: r => String(r.status || "") },
};

/** A member's name split for a two-weight lockup. Documented as a guess: the
 *  roster holds one `fullName`, so the last space is the only seam available. */
function tplNameParts(r) {
  const full = String((r && (r.fullName || [r.firstName, r.surname].filter(Boolean).join(" "))) || "").trim().replace(/\s+/g, " ");
  if (!full) return { given: "", family: "" };
  const parts = full.split(" ");
  if (parts.length === 1) return { given: parts[0], family: "" };
  return { given: parts[0], family: parts.slice(1).join(" ") };
}

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

/* ── Can you read it? ────────────────────────────────────────────────────────
   The check every other preflight rule assumed somebody else was doing.

   Preflight knew whether the QR would scan, whether a field was missing, and
   whether type sat too near the trim. It did not know whether the type was
   legible, so a volunteer card with the role line printed in the tier colour
   ON a pill filled with the tier colour passed with zero errors and would
   publish. That is not a hypothetical: it is one wrong pick in a colour
   picker, and it is 240 unreadable cards before anyone notices.

   Two questions, and they have different answers:

   · Is the ink the SAME STRING as the paint under it? Decidable from the
     template alone, with no data — "{{tier.color}}" on "{{tier.color}}" is
     1:1 whatever the tier turns out to be. Always an error, and checked
     identically on the server.
   · Is the measured contrast too low? Needs literal colours. Where a binding
     is involved the client resolves it against the real rows it is proofing
     with; the server, which has no rows, checks only the literal pairs. The
     asymmetry is deliberate and stated rather than hidden: the deterministic
     case is what publish refuses on, and the data-resolved case is a warning
     to the person who can still fix it.

   Thresholds are 3:1 to refuse and 4.5:1 to warn, applied at every size. WCAG's
   large-text allowance is defined in CSS pixels and this is a document measured
   in millimetres for a printer, so borrowing the number would be borrowing a
   precision we do not have. */

const TPL_INK_ERROR_RATIO = 3;
const TPL_INK_WARN_RATIO = 4.5;

/* The sentinel for "nothing is between this text and the card itself". A
   unique object rather than a string, so it can never collide with a real
   fill value, and declared above its readers rather than below them. */
const TPL_PAINT_IS_CARD = { card: true };

/** Does this element's box contain the point? Bounding boxes, including for an
 *  ellipse — a rounder answer would be more correct and no more useful, since
 *  what we want to know is what the middle of the line is sitting on. */
function tplCovers(el, x, y) {
  const ex = Number(el.x) || 0, ey = Number(el.y) || 0;
  return x >= ex && y >= ey && x <= ex + (Number(el.w) || 0) && y <= ey + (Number(el.h) || 0);
}

/** The paint under element `i`: the topmost opaque shape below it that covers
 *  the middle of it, or the sentinel for "the card itself". Null means we
 *  cannot say — a photograph, or something part-transparent — and a caller
 *  that cannot say should stay quiet rather than measure the wrong thing. */
function tplPaintUnder(els, i) {
  const el = els[i];
  const cx = (Number(el.x) || 0) + (Number(el.w) || 0) / 2;
  const cy = (Number(el.y) || 0) + (Number(el.h) || 0) / 2;
  for (let j = i - 1; j >= 0; j--) {
    const u = els[j];
    if (u.hidden || !tplCovers(u, cx, cy)) continue;
    // A picture under the words. WCAG cannot measure that either, and warning
    // about every name laid over a photograph would train people to ignore
    // this check — which is the one outcome worse than not having it.
    if (u.type === "image") return null;
    if (u.type !== "rect" && u.type !== "shape" && u.type !== "ellipse") continue;
    if (u.opacity != null && Number(u.opacity) < 1) return null;   // composited
    return u.fill == null ? "" : u.fill;
  }
  return TPL_PAINT_IS_CARD;
}

/** Every literal colour a paint value can resolve to. A gradient is measured
 *  against every stop, because text only has to be illegible over part of one. */
function tplPaintColours(paint, row) {
  if (paint && typeof paint === "object" && paint.stops) {
    return (paint.stops || []).map(s => tplBindValue(s.color, row)).filter(Boolean);
  }
  const v = tplBindValue(paint, row);
  return typeof v === "string" && v ? [v] : [];
}

function tplInkProblems(t, rows, add) {
  const els = (t || {}).elements || [];
  const proofRows = (rows && rows.length) ? rows : [];
  els.forEach((el, i) => {
    if (el.type !== "text" || el.hidden) return;
    if (!String(el.text == null ? "" : el.text).trim()) return;   // an empty line cannot be unreadable
    const under = tplPaintUnder(els, i);
    if (under === null) return;
    const isCard = under === TPL_PAINT_IS_CARD;
    const paint = isCard ? (t.background || "#ffffff") : under;
    const where = isCard ? "the card" : "what it sits on";

    /* 1 · The same string, so 1:1 whatever it resolves to. No data needed. */
    if (typeof el.color === "string" && typeof paint === "string"
        && el.color.trim() && el.color.trim().toLowerCase() === paint.trim().toLowerCase()) {
      add("error", "“" + String(el.text).slice(0, 24) + "” is the same colour as "
        + where + " — it will print invisible", el.id);
      return;
    }

    /* 2 · Measured. Bindings need a row to resolve against; without rows we
           can still measure the pairs that are literal on both sides. */
    const inkFor = (row) => tplBindValue(el.color, row);
    const trials = proofRows.length ? proofRows : [null];
    let worst = null, worstFor = "";
    trials.forEach(row => {
      const ink = inkFor(row);
      if (typeof ink !== "string" || !/^#/.test(ink)) return;
      tplPaintColours(paint, row).forEach(bg => {
        if (!/^#/.test(bg)) return;
        const r = (typeof inkContrast === "function") ? inkContrast(ink, bg) : null;
        if (r == null) return;
        if (worst == null || r < worst) { worst = r; worstFor = ink + " on " + bg; }
      });
    });
    if (worst == null) return;
    const said = "“" + String(el.text).slice(0, 24) + "” measures "
      + worst.toFixed(2) + ":1 against " + where + " (" + worstFor + ")";
    if (worst < TPL_INK_ERROR_RATIO) add("error", said + " — that cannot be read", el.id);
    else if (worst < TPL_INK_WARN_RATIO) add("warn", said + " — " + TPL_INK_WARN_RATIO
      + ":1 is the floor for text somebody has to read across a hall", el.id);
  });
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

  /* The BACK of a card is exempt from the credential rules. A back carries
     terms, an emergency number, a signature strip — not the identity — and
     running the front's rules over it would refuse every back for want of a
     QR, which is how a tool teaches people to bypass its own checks. The FRONT
     still has to satisfy them, so a two-sided card cannot lose its name and
     its code by moving everything to the back. */
  const isBack = String(t.face || "single") === "back";
  (isBack ? [] : (requiredFields || [])).forEach(f => {
    // `role` is satisfied by either field that prints it — a card showing
    // "INSTRUCTOR · MUSIC" is not missing the role.
    if (f === "role" && (bound.role || bound.roleFaculty)) return;
    // "name" is satisfied by whichever name binding the design uses: the member
    // roster holds one fullName, the summer intake holds the parts separately.
    if (f === "name" && TPL_NAME_FIELDS.some(k => bound[k])) return;
    if (!bound[f]) add("error", "Nothing on this card shows " + (TPL_FIELDS[f] ? TPL_FIELDS[f].label : f));
  });

  const qr = els.filter(e => e.type === "qr");
  // Only a credential needs one, and only on its front. A poster with a QR is
  // welcome to have one and it is still checked for size; a poster without one
  // is simply a poster, and a card back without one is simply a card back.
  if (!qr.length && t.kind !== "graphic" && !isBack) add("error", "No QR — the card cannot be scanned at a gate");
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

  /* Legibility, last, because it is the check most likely to be argued with
     and the messages read better after the structural ones. */
  tplInkProblems(t, rows, add);

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
      { id: "idlabel", type: "text", x: 270, y: 706, w: 200, text: "VOLUNTEER ID", size: 11, weight: 600, color: "#687083", letterSpacing: 2.4 },
      { id: "idvalue", type: "text", x: 270, y: 722, w: 200, text: "{{displayId}}", size: 21, weight: 500, color: "#1B2B6B", font: "monospace" },
      { id: "vlabel", type: "text", x: 270, y: 757, w: 200, text: "VALID TO", size: 11, weight: 600, color: "#687083", letterSpacing: 2.4 },
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
  /* ── The NGG member card, as a template at last ───────────────────────────
   *
   * This is the credential every year-round member carries, and it was the one
   * card the design system could not express: it lived in hand-coded JSX
   * (NggcMemberCard), so moving the QR two millimetres on the card the
   * organisation issues MOST meant a deploy. The hand-coded renderer stays as
   * the fallback — it is what a member downloads from their own dashboard
   * without an admin having designed anything — and this is the same document
   * with the layout moved into the row.
   *
   * Deliberately paired with a BACK. Every other design in this system is one
   * face, because a summer QR card is printed one-up on a lanyard insert. A
   * member card is a wallet credential: it has a reverse, and the reverse is
   * where the terms, the emergency number and the "if found" line go. A front
   * NAMES its back (`pairId`), so a duplex run cannot come out mismatched.
   *
   * 54 × 85mm — the ISO/IEC 7810 ID-1 size, i.e. the size of every bank card
   * and therefore of every wallet slot. The summer card is 54 × 75 because it
   * hangs from a lanyard and never goes in a wallet; a member card that does
   * not fit a wallet is a member card that gets left at home.
   */
  {
    id: "sys-member-front", name: "NGG member ID — front", kind: "member", face: "front",
    pairId: "sys-member-back", system: true,
    w: 590, h: 929, wMm: 54, hMm: 85, safe: 30, bleedMm: 3,
    background: "#ffffff",
    elements: [
      { id: "topband", type: "rect", x: 0, y: 0, w: 590, h: 92, fill: "#0B1F51", role: "background" },
      { id: "wordmark", type: "text", x: 34, y: 26, w: 420, h: 40, text: "NEXT GENERATION GENIUS",
        size: 21, weight: 800, color: "#ffffff", letterSpacing: 3.4, vAlign: "middle" },
      { id: "levelpill", type: "rect", x: 470, y: 28, w: 88, h: 36, radius: 18, fill: "#FCB316" },
      { id: "level", type: "text", x: 470, y: 28, w: 88, h: 36, text: "{{member.level}}", size: 18, weight: 800,
        color: "#0B1F51", align: "center", letterSpacing: 2, transform: "upper", vAlign: "middle", fit: true },
      { id: "photo", type: "image", x: 60, y: 128, w: 470, h: 370, radius: 18, fit: "cover",
        src: "{{photo}}", fill: "#eef0f4" },
      /* Two weights, one lockup. The given name is light and the family name
         carries the card, which is how a name reads at arm's length across a
         room — and why `member.given` / `member.family` exist as separate
         bindings rather than one full-name line. */
      { id: "given", type: "text", x: 60, y: 528, w: 470, h: 40, text: "{{member.given}}", size: 30, weight: 300,
        color: "#5C6474", letterSpacing: 0.6, transform: "upper", fit: true },
      { id: "family", type: "text", x: 58, y: 566, w: 474, h: 58, text: "{{member.family}}", size: 52, weight: 800,
        color: "#0B1F51", letterSpacing: -1.4, transform: "upper", fit: true },
      { id: "rule", type: "rect", x: 60, y: 640, w: 470, h: 2, fill: "#E6E8EC" },
      { id: "disciplines", type: "text", x: 60, y: 656, w: 470, h: 30, text: "{{disciplines}}", size: 19, weight: 600,
        color: "#5C6474", letterSpacing: 2.4, transform: "upper", fit: true },
      { id: "qr", type: "qr", x: 60, y: 712, w: 118, h: 118, token: "{{token}}" },
      { id: "idlabel", type: "text", x: 200, y: 716, w: 260, text: "MEMBER ID", size: 12, weight: 600,
        color: "#6B7280", letterSpacing: 2.6 },
      { id: "idvalue", type: "text", x: 200, y: 734, w: 330, text: "{{displayId}}", size: 24, weight: 500,
        color: "#0B1F51", font: "monospace" },
      { id: "sincelabel", type: "text", x: 200, y: 776, w: 260, text: "MEMBER SINCE", size: 12, weight: 600,
        color: "#6B7280", letterSpacing: 2.6 },
      { id: "sincevalue", type: "text", x: 200, y: 794, w: 330, text: "{{member.joined}}", size: 17, weight: 500,
        color: "#5C6474", font: "monospace" },
      { id: "centreband", type: "rect", x: 0, y: 872, w: 590, h: 57, fill: "{{centre.color}}", role: "background" },
      { id: "centrename", type: "text", x: 30, y: 872, w: 530, h: 57, text: "{{centre.code}}  ·  {{centre.name}}",
        size: 24, weight: 700, color: "{{ink.centre}}", align: "center", letterSpacing: 4.4,
        transform: "upper", vAlign: "middle", fit: true, minSize: 20, role: "background" },
    ],
  },
  {
    id: "sys-member-back", name: "NGG member ID — back", kind: "member", face: "back",
    pairId: "sys-member-front", system: true,
    w: 590, h: 929, wMm: 54, hMm: 85, safe: 30, bleedMm: 3,
    background: "#0B1F51",
    elements: [
      { id: "panel", type: "rect", x: 30, y: 30, w: 530, h: 869, radius: 18, fill: "#ffffff" },
      { id: "h", type: "text", x: 66, y: 74, w: 460, h: 34, text: "THIS CARD", size: 20, weight: 800,
        color: "#0B1F51", letterSpacing: 3 },
      { id: "terms", type: "text", x: 66, y: 122, w: 460, h: 300,
        text: "Identifies the holder as a member of Next Generation Genius. It is not transferable and remains the property of the programme. Present it at your centre and at NGG events.",
        size: 17, weight: 400, color: "#5C6474", lineHeight: 1.5 },
      { id: "rule1", type: "rect", x: 66, y: 452, w: 460, h: 2, fill: "#E6E8EC" },
      { id: "foundh", type: "text", x: 66, y: 476, w: 460, h: 26, text: "IF FOUND", size: 13, weight: 700,
        color: "#6B7280", letterSpacing: 2.6 },
      { id: "found", type: "text", x: 66, y: 502, w: 460, h: 90,
        text: "Please return it to any NGG centre, or contact next@afrovanguard.org.ng",
        size: 16, weight: 400, color: "#5C6474", lineHeight: 1.5 },
      { id: "rule2", type: "rect", x: 66, y: 612, w: 460, h: 2, fill: "#E6E8EC" },
      /* A signature strip, because a credential a desk checks by eye needs
         something a desk can check. Drawn, not bound — nothing in the roster
         holds a signature. */
      { id: "sigh", type: "text", x: 66, y: 636, w: 460, h: 26, text: "HOLDER'S SIGNATURE", size: 13, weight: 700,
        color: "#6B7280", letterSpacing: 2.6 },
      { id: "sigstrip", type: "rect", x: 66, y: 666, w: 460, h: 72, radius: 6, fill: "#F4F5F7" },
      { id: "validlabel", type: "text", x: 66, y: 764, w: 220, text: "VALID TO", size: 13, weight: 700,
        color: "#6B7280", letterSpacing: 2.6 },
      { id: "validvalue", type: "text", x: 66, y: 786, w: 220, text: "{{expiresAt}}", size: 18, weight: 500,
        color: "#0B1F51", font: "monospace" },
      { id: "idlabel", type: "text", x: 320, y: 764, w: 206, text: "MEMBER ID", size: 13, weight: 700,
        color: "#6B7280", letterSpacing: 2.6 },
      { id: "idvalue", type: "text", x: 320, y: 786, w: 206, text: "{{displayId}}", size: 18, weight: 500,
        color: "#0B1F51", font: "monospace" },
      { id: "mark", type: "image", x: 66, y: 832, w: 120, h: 40, fit: "contain", src: "/assets/logo.png" },
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
  /* 54 × 85mm is ISO/IEC 7810 ID-1 — the size of every bank card, and
     therefore of every wallet slot. It leads the list because the member card
     is the credential this organisation issues most, and a member card that
     does not fit a wallet is one that gets left at home. The summer sizes are
     54 × 75 / 54 × 89 because those hang from a lanyard. */
  { id: "member-card", group: "Credentials", name: "Member card (54 × 85mm · wallet)", kind: "member", face: "front", w: 590, h: 929, wMm: 54, hMm: 85, safe: 30, bleedMm: 3 },
  { id: "member-back", group: "Credentials", name: "Member card — back (54 × 85mm)",   kind: "member", face: "back",  w: 590, h: 929, wMm: 54, hMm: 85, safe: 30, bleedMm: 3 },
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
  /* The NGG member card. The roster holds ONE `fullName` for a member — unlike
     the summer intake, which asks for the given name and the surname separately
     — so "name" here is satisfied by whichever of the three name bindings the
     design uses, and no token is demanded: a member's QR resolves their profile
     rather than a gate check-in. */
  member: ["name", "displayId"],
  /* A poster has no child to identify, so none of the credential rules apply to
     it. Running them anyway would mean every poster refused to publish for want
     of a QR — which is how a tool teaches people to bypass its own checks. */
  graphic: [],
};

/** Which name bindings satisfy TPL_REQUIRED's "name".
 *
 *  The two-weight member lockup (`member.given` + `member.family`) counts: a
 *  card setting the given name light and the family name heavy IS showing a
 *  name, and the first draft of this list left them out — so the standard
 *  member card failed its own rule at publish time. The preflight test caught
 *  it, which is what that test is for. */
const TPL_NAME_FIELDS = ["fullName", "surname", "firstName", "member.given", "member.family"];
/** A card has two sides. The BACK is exempt from the credential rules: it
 *  carries terms, an emergency number, a signature strip — not the identity.
 *  The FRONT still has to satisfy them, so a two-sided card cannot lose its
 *  name and its code by moving everything to the back. */
const TPL_FACES = ["single", "front", "back"];

/* ============================================================================
   MemberIDCard — the member-facing NGG ID card.

   A self-contained, hand-coded credential (like CardFront / VolunteerCardFront)
   that every NGG member can see and download from their dashboard, without an
   admin having to design a template first. Renders name, member id, centre,
   track, photo and a QR (to the member's profile), and exports itself to PNG or
   a print-size PDF via the on-demand CardExport / jsPDF vendors. 54 × 85 mm.
   ============================================================================ */
function _ngEnsureQrcode() {
  return new Promise(function (res) {
    if (window.qrcode) return res(window.qrcode);
    var s = document.createElement("script");
    s.src = "/vendor/qrcode.min.js";
    s.onload = function () { res(window.qrcode || null); };
    s.onerror = function () { res(null); };
    document.head.appendChild(s);
  });
}
function _ngQrDataUrl(payload) {
  return _ngEnsureQrcode().then(function (qr) {
    if (!qr) return "";
    try { var q = qr(0, "M"); q.addData(String(payload || "")); q.make(); return q.createDataURL(6, 8); }
    catch (e) { return ""; }
  });
}
/* The one place that decides what a member card's QR points at, so a card the
   member downloads and a card an admin batch-prints resolve to the same page:
   the circle-invite short link when we have one, else the member deep link. */
function _ngMemberQrPayload(m) {
  m = m || {};
  var origin = (typeof location !== "undefined") ? location.origin : "";
  if (m.anchorCode) return origin + "/q/" + m.anchorCode;
  if (m.memberId) return origin + "/?m=" + encodeURIComponent(m.memberId);
  return origin;
}
/* A print-shop-safe file stem for one member: "surname-first-MEMBERID", ASCII
   only, so a ZIP of two hundred lands on any filesystem intact. Indexed so two
   members who share a name never collide in the archive. */
function _ngMemberFileStem(m, i) {
  m = m || {};
  var raw = String(m.fullName || "member");
  var base = (raw.normalize ? raw.normalize("NFKD") : raw)
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "member";
  var id = String(m.memberId || "").replace(/[^A-Za-z0-9]+/g, "");
  return (id ? base + "-" + id : base) + "-" + String(i + 1);
}
/* Resolve when every <img> under `node` has settled (loaded or errored), or
   after `ms`. html2canvas inlines images itself, but a card rasterised before
   its photograph has painted comes back with the fallback monogram — so we
   wait for the paint, with a deadline so one dead photo host cannot stall a run. */
function _ngWaitImages(node, ms) {
  var imgs = node ? Array.prototype.slice.call(node.querySelectorAll("img")) : [];
  var pending = imgs.filter(function (im) { return !im.complete; });
  if (!pending.length) return Promise.resolve();
  return new Promise(function (res) {
    var done = 0, settled = false;
    function tick() { if (!settled && ++done >= pending.length) { settled = true; res(); } }
    pending.forEach(function (im) {
      im.addEventListener("load", tick, { once: true });
      im.addEventListener("error", tick, { once: true });
    });
    setTimeout(function () { if (!settled) { settled = true; res(); } }, ms || 8000);
  });
}

/* ============================================================================
   MemberIDCardBatch — one design, every member, one file.

   The member card is hand-coded, not a Fabric template, so the studio's merge
   engine (which drives a template over a roster) cannot print it. This is the
   member equivalent: it mounts each card off-screen, rasterises it on the same
   CardExport path the single download uses, and assembles the run three ways —

     "pdf"    one page per member at the 54×85 trim size (a print shop's cut file)
     "sheet"  imposed on A4 with bleed + crop marks (the prepress module)
     "zip"    a PNG per member, named for them (what gets emailed)

   Rendered one at a time and yielding between members, so a run of the whole
   cohort neither locks the tab nor holds two hundred canvases in memory at once,
   and cancellable via opts.cancel(). Returns { made, failed, mode }.
   ============================================================================ */
function MemberIDCardBatch(members, opts) {
  members = members || []; opts = opts || {};
  var React = window.React, h = React.createElement, RD = window.ReactDOM;
  var mode = opts.mode || "zip";
  var dpi = Math.max(96, Math.min(600, Number(opts.dpi) || 300));

  return (async function () {
    if (!RD || !RD.createRoot) throw new Error("the renderer is not available");
    var CE = await loadVendor("cardExport");

    // One off-screen host for the whole run. Kept in the layout tree (not
    // display:none) because html2canvas needs real geometry to measure.
    var host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(host);

    var doc = null, faces = [], files = [], pages = 0;
    var failed = [];
    try {
      for (var i = 0; i < members.length; i++) {
        if (opts.cancel && opts.cancel()) break;
        var m = members[i] || {};
        if (opts.onProgress) opts.onProgress(i, members.length, m);

        var qr = "";
        try { qr = await _ngQrDataUrl(_ngMemberQrPayload(m)); } catch (e) { qr = ""; }

        var mount = document.createElement("div");
        mount.style.cssText = "display:inline-block;";
        host.appendChild(mount);
        var root = RD.createRoot(mount);
        root.render(h(MemberIDCard, { member: m, qrUrl: qr }));
        // Let React commit and the browser lay the card out, then wait on the
        // photograph before we freeze the pixels.
        await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
        await _ngWaitImages(mount, 8000);

        var node = mount.firstElementChild;
        var px = null;
        try {
          if (!node) throw new Error("no card node");
          if (mode === "sheet") {
            px = await CE.renderFace(node, { trimW_mm: 54, trimH_mm: 85, bleed_mm: 3, dpi: dpi, bg: "#ffffff" });
          } else {
            var scale = CE.scaleForDpi(node.offsetWidth || 300, 54, dpi);
            px = await CE.nodeToImage(node, { scale: scale, bg: "#ffffff" });
          }
        } catch (e) {
          failed.push(String(m.fullName || m.memberId || ("#" + (i + 1))));
        }
        try { root.unmount(); } catch (e) {}
        try { host.removeChild(mount); } catch (e) {}

        if (px) {
          if (mode === "pdf") {
            if (!doc) {
              var jl = await loadVendor("jspdf");
              var JsPDF = jl.jsPDF; if (!JsPDF) throw new Error("the PDF library is not loaded");
              doc = new JsPDF({ unit: "mm", format: [54, 85], orientation: "portrait" });
            } else {
              doc.addPage([54, 85], "portrait");
            }
            doc.addImage(px.dataUrl, "PNG", 0, 0, 54, 85, undefined, "FAST");
            pages++;
          } else if (mode === "sheet") {
            faces.push({ dataUrl: px.dataUrl, wPx: px.wPx, hPx: px.hPx,
                         bleedPx: px.bleedPx, trimWPx: px.trimWPx, trimHPx: px.trimHPx });
          } else {
            files.push({ name: _ngMemberFileStem(m, i) + ".png", bytes: CE.dataUrlToBytes(px.dataUrl) });
          }
        }
        // Yield so the progress line paints and the tab stays responsive.
        await new Promise(function (r) { setTimeout(r, 0); });
      }

      var made = mode === "pdf" ? pages : mode === "sheet" ? faces.length : files.length;
      if (made > 0) {
        if (opts.onProgress) opts.onProgress(members.length, members.length, { fullName: "writing the file…" });
        var stem = "ngg-member-ids-" + made;
        if (mode === "pdf") {
          doc.save(stem + ".pdf");
        } else if (mode === "sheet") {
          var pdf = await CE.buildImpositionPDF(faces, {
            sheet: "A4", trimW_mm: 54, trimH_mm: 85, bleed_mm: 3, safe_mm: 3,
            marks: true, layers: true, intent: "FOGRA39", jobName: "NGG Member IDs",
            date: new Date().toISOString().slice(0, 10),
          });
          CE.download(pdf, stem + "-imposed.pdf", "application/pdf");
        } else {
          var zip = await CE.zipStore(files);
          CE.download(zip, stem + ".zip", "application/zip");
        }
      }
      return { made: made, failed: failed, mode: mode };
    } finally {
      try { document.body.removeChild(host); } catch (e) {}
    }
  })();
}

function MemberIDCard(props) {
  var React = window.React, h = React.createElement;
  var m = props.member || {};
  var cardRef = React.useRef(null);
  var qs = React.useState(props.qrUrl || ""); var qrUrl = qs[0], setQr = qs[1];

  var name = String(m.fullName || "").trim() || "NGG Member";
  var initials = name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
  var hasPhoto = m.photoUrl && /^https?:\/\//.test(String(m.photoUrl));
  var payload = _ngMemberQrPayload(m);
  var validYear = String(new Date().getFullYear());

  React.useEffect(function () {
    // A caller (the batch printer) may hand us the QR already rendered, so the
    // card can be rasterised the instant it mounts rather than one paint later.
    if (props.qrUrl != null) { setQr(props.qrUrl); return; }
    var alive = true;
    _ngQrDataUrl(payload).then(function (u) { if (alive) setQr(u); });
    return function () { alive = false; };
  }, [payload, props.qrUrl]);

  var NAVY = "#0a2a4d", NAVY2 = "#0e3f68", GOLD = "#f5b301", INK = "#12233a", MUT = "#5f6874", LINE = "#e7e9ee";
  var chip = function (txt, key) { return h("span", { key: key, style: { display: "inline-block", background: "#eef2f7", color: INK, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, marginRight: 6, marginTop: 6 } }, txt); };

  var card = h("div", {
    ref: cardRef,
    style: { width: 300, background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid " + LINE, color: INK, fontFamily: "inherit", boxShadow: "0 10px 30px -18px rgba(0,0,0,.5)" }
  }, [
    h("div", { key: "hd", style: { background: "linear-gradient(120deg," + NAVY + "," + NAVY2 + ")", color: "#fff", padding: "16px 18px" } }, [
      h("div", { key: "t", style: { fontWeight: 800, letterSpacing: ".12em", fontSize: 12, color: GOLD } }, "NEXT GENERATION GENIUS"),
      h("div", { key: "s", style: { fontSize: 11, opacity: .85, marginTop: 3, letterSpacing: ".04em" } }, "Afrovanguard · Member ID"),
    ]),
    h("div", { key: "bd", style: { display: "flex", gap: 14, alignItems: "center", padding: "16px 18px" } }, [
      hasPhoto
        ? h("img", { key: "ph", src: m.photoUrl, alt: "", crossOrigin: "anonymous", style: { width: 74, height: 74, borderRadius: 12, objectFit: "cover", border: "2px solid " + GOLD } })
        : h("div", { key: "ph", style: { width: 74, height: 74, borderRadius: 12, background: NAVY, color: GOLD, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24 } }, initials || "★"),
      h("div", { key: "info", style: { minWidth: 0 } }, [
        h("div", { key: "n", style: { fontWeight: 800, fontSize: 17, lineHeight: 1.15 } }, name),
        h("div", { key: "id", style: { fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, color: MUT, marginTop: 2 } }, m.memberId || ""),
        h("div", { key: "chips" }, [
          m.centre ? chip("CACENTRE " + m.centre, "c") : null,
          m.track ? chip(m.track, "t") : null,
        ]),
      ]),
    ]),
    h("div", { key: "ft", style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "14px 18px", borderTop: "1px dashed " + LINE } }, [
      qrUrl
        ? h("img", { key: "qr", src: qrUrl, alt: "QR", style: { width: 76, height: 76, imageRendering: "pixelated" } })
        : h("div", { key: "qr", style: { width: 76, height: 76, background: "#f1f3f6", borderRadius: 8 } }),
      h("div", { key: "meta", style: { textAlign: "right" } }, [
        h("div", { key: "r", style: { fontWeight: 800, color: NAVY, letterSpacing: ".08em" } }, "MEMBER"),
        h("div", { key: "v", style: { fontSize: 11, color: MUT, marginTop: 2 } }, "Valid " + validYear),
      ]),
    ]),
  ]);

  /* No download. A member ID is the credential the gate scans, and a PNG of it
     travels to places a lanyard does not — so the card is SHOWN here and issued
     by the desk. The Control Room still exports and prints the real run
     (MemberIDCardBatch / NggcMemberCardExport), and a member who needs a new
     one asks for it from Records. */
  return card;
}

/* ============================================================================
   NGGC Member ID — the A5 redesign (docs consultation "NGGC Member ID Card",
   REV 1 · Aug 2026 · "3A recommended"). PRINT/EXPORT ONLY — the on-screen
   MemberIDCard above is untouched. One layout renders at two physical sizes:
   'a5' (148×210mm, the spec) and 'wallet' (54×85mm, the current print size in
   the new look). Photo is auto-approximated (navy duotone + amber mark behind);
   a proper cut-out portrait shows the mark through the transparency, a plain
   headshot simply carries the navy wash. Six values vary per card: printed id,
   given + family name, one or two disciplines, role, photo and QR.
   ============================================================================ */

var NGGC_FONTS_HREF = "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";

/** Ensure Poppins + IBM Plex Mono are loaded before a card is rasterised (the
 *  app itself ships Sora/JetBrains, so this design brings its own type). */
function nggcEnsureFonts() {
  try {
    if (!document.getElementById("nggc-fonts")) {
      var l = document.createElement("link");
      l.id = "nggc-fonts"; l.rel = "stylesheet"; l.href = NGGC_FONTS_HREF;
      document.head.appendChild(l);
    }
  } catch (e) {}
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load("300 23pt Poppins"), document.fonts.load("600 23pt Poppins"),
    document.fonts.load("700 23pt Poppins"), document.fonts.load("500 9pt 'IBM Plex Mono'"),
    document.fonts.load("400 7pt 'IBM Plex Mono'"),
  ]).then(function () { return document.fonts.ready; }).catch(function () {});
}

/** Printed id — year-chapter-serial, e.g. 26-AM-135. Uses the member's own
 *  displayId when set, else falls back to the raw member id. */
function nggcDisplayId(m) { m = m || {}; return String(m.displayId || m.memberId || "").toUpperCase(); }

/** One or two disciplines, uppercase. Reads the new `disciplines` field
 *  (array or comma/slash/pipe string); falls back to the single `track`. */
function nggcDisciplines(m) {
  m = m || {};
  var raw = m.disciplines != null ? m.disciplines : "";
  var list = Array.isArray(raw) ? raw.slice() : String(raw).split(/[,/|]/);
  list = list.map(function (s) { return String(s).trim().toUpperCase(); }).filter(Boolean);
  if (!list.length && m.track) list = [String(m.track).trim().toUpperCase()];
  return list.slice(0, 2);
}

/** Given name (rendered 700) + family name (rendered 300), both uppercase. */
function nggcName(m) {
  var full = String((m && m.fullName) || "").trim().replace(/\s+/g, " ");
  if (!full) return { given: "NGG", family: "MEMBER" };
  var parts = full.split(" ");
  return { given: parts[0].toUpperCase(), family: parts.slice(1).join(" ").toUpperCase() };
}

function NggcMemberCard(props) {
  var React = window.React, h = React.createElement;
  var m = props.member || {};
  var size = props.size === "wallet" ? "wallet" : "a5";
  var qrUrl = props.qrUrl || "";
  var nm = nggcName(m), disc = nggcDisciplines(m), did = nggcDisplayId(m);
  var role = String(m.role || (m.tier && m.tier.name) || "MEMBER").toUpperCase();
  var photo = (m.photoUrl && /^https?:\/\//.test(String(m.photoUrl))) ? m.photoUrl : "";

  /* CAP was #9AA0AC, which measures 2.63:1 on white — the same failure the
     template preflight refuses, shipped on the card a member downloads from
     their own dashboard. The caption labels ("MEMBER ID", "MEMBER SINCE") were
     the least readable thing on a credential a desk reads at arm's length.
     #6B7280 is 4.83:1 and keeps the tonal step down from SEC. */
  var NAVY = "#0B1F51", AMBER = "#FCB316", SEC = "#5C6474", CAP = "#6B7280", HAIR = "#E6E8EC", DIV = "#C9CCD4";
  var wallet = size === "wallet";
  var S = wallet
    ? { W: 54, H: 85, padX: 5, padB: 5, photoW: 48, photoH: 37.8, pillPt: 5.4, namePt: 11, discPt: 5.6, gap: 2.4, hair: 0.3, footTop: 3, qr: 13, logoW: 12, rolePt: 4.8, capPt: 4.2, divH: 2.6, mark: 34, gapD: 2, pillPad: "1.3mm 3.4mm", pillTrk: ".2em" }
    : { W: 148, H: 210, padX: 14, padB: 12, photoW: 130, photoH: 102.3, pillPt: 8.5, namePt: 23, discPt: 10.5, gap: 4.5, hair: 0.5, footTop: 7, qr: 20, logoW: 22, rolePt: 7, capPt: 7, divH: 4.5, mark: 95, gapD: 3.5, pillPad: "2.4mm 6.5mm", pillTrk: ".3em" };
  var mm = function (v) { return v + "mm"; }, pt = function (v) { return v + "pt"; };

  // Name fit (§4): one line by default; ≥22 chars steps to 20pt; ≥28 breaks
  // after the given name, both lines at line-height 1.02.
  var full = (nm.given + " " + nm.family).trim(), namePt = S.namePt, twoLine = false;
  if (!wallet) { if (full.length > 28) twoLine = true; else if (full.length > 22) namePt = 20; }
  var nameChildren = twoLine
    ? [h("span", { key: "g", style: { display: "block", fontWeight: 700 } }, nm.given),
       h("span", { key: "f", style: { display: "block", fontWeight: 300 } }, nm.family)]
    : [h("span", { key: "g", style: { fontWeight: 700 } }, nm.given), nm.family ? " " : "",
       nm.family ? h("span", { key: "f", style: { fontWeight: 300 } }, nm.family) : null];

  /* height comes from the viewBox ratio (200×150). `height="auto"` is not a
     valid SVG length: Chrome logs it and falls back, and a rasteriser that
     does not fall back the same way puts the mark somewhere else on the
     printed card than it sits on screen. */
  var amber = h("svg", { key: "mark", viewBox: "0 0 200 150", width: mm(S.mark), height: mm(S.mark * 0.75), "aria-hidden": "true",
      style: { position: "absolute", top: mm(wallet ? -5 : -13), right: mm(wallet ? -3 : -8), zIndex: 0 } },
    h("path", { d: "M18 118 C18 44 66 22 106 40 C150 60 150 108 108 118 C82 124 62 100 92 82",
      fill: "none", stroke: AMBER, strokeWidth: 32, strokeLinecap: "round", strokeLinejoin: "round" }));

  /* ── The photo area is a FIXED box ────────────────────────────────────────
   *
   * It used to be sized by the image: a photograph rendered at its own aspect,
   * and an empty slot at 1.12 × its own width. So the card composed differently
   * for every member, and for a member with no headshot it did not compose at
   * all — content measured 223.2mm inside a 210mm A5 and 96.1mm inside an 85mm
   * wallet card, and since the card clips, the wallet size lost its whole
   * footer: no QR, no role line, no mark. Nobody imported from the members
   * workbook has a photograph, so that was every one of them.
   *
   * A fixed box with object-fit means the layout is identical with a portrait,
   * a square crop, a landscape snap or nothing at all — which is the property
   * a printed card needs, because the trim is the same for everybody.
   *
   * The crop sits high (22%) rather than centred: passport-style photographs
   * put the face in the upper half, and a centred crop takes the top off it. */
  /* Centred by hand, not by `margin: 0 auto`. The photo is deliberately WIDER
     than the padded column so it bleeds to the card edge — and auto margins do
     not centre a child wider than its container, they pin it left. So the bleed
     was landing entirely on the right: 10mm on the A5, 4mm on the wallet. */
  var bleed = (S.photoW - (S.W - 2 * S.padX)) / 2;
  var photoWrap = h("div", { key: "pw", style: { width: mm(S.photoW), height: mm(S.photoH),
      marginLeft: mm(-bleed), flex: "none", position: "relative" } }, [
    amber,
    h("div", { key: "pi", style: { position: "absolute", inset: 0, zIndex: 1, overflow: "hidden",
        background: photo ? "transparent" : "#eef0f4",
        WebkitMaskImage: "linear-gradient(#000 84%,transparent)", maskImage: "linear-gradient(#000 84%,transparent)" } },
      photo ? [
        h("img", { key: "im", src: photo, crossOrigin: "anonymous", alt: "",
          style: { width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 22%",
                   display: "block", filter: "grayscale(1) contrast(1.03)" } }),
        h("div", { key: "tint", style: { position: "absolute", inset: 0, background: NAVY, opacity: 0.34, mixBlendMode: "multiply" } }),
      ] : null),
  ]);

  var pill = h("span", { key: "pill", style: { fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500, fontSize: pt(S.pillPt), letterSpacing: S.pillTrk, color: "#fff", background: NAVY, borderRadius: "999px", padding: S.pillPad, whiteSpace: "nowrap" } }, did || "—");
  var nameEl = h("span", { key: "nm", style: { textAlign: "center", lineHeight: 1.02, fontFamily: "'Poppins',sans-serif", fontWeight: 300, fontSize: pt(namePt), letterSpacing: "-.01em", color: NAVY } }, nameChildren);
  var discEl = disc.length ? h("span", { key: "dc", style: { display: "flex", alignItems: "center", gap: mm(S.gapD), fontFamily: "'Poppins',sans-serif", fontSize: pt(S.discPt), color: SEC } }, [
    h("span", { key: "d0", style: { fontWeight: 600, letterSpacing: ".08em", color: NAVY } }, disc[0]),
    disc[1] ? h("span", { key: "dv", style: { width: ".4mm", height: mm(S.divH), background: DIV, display: "block" } }) : null,
    disc[1] ? h("span", { key: "d1", style: { fontWeight: 300, letterSpacing: ".08em" } }, disc[1]) : null,
  ]) : null;
  var identity = h("div", { key: "id", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: mm(S.gap), flex: "none", marginTop: wallet ? mm(1.6) : 0 } }, [pill, nameEl, discEl]);

  var footer = h("div", { key: "ft", style: { marginTop: mm(S.footTop), display: "flex", alignItems: "center", justifyContent: "space-between", gap: mm(wallet ? 3 : 8), flex: "none" } }, [
    h("div", { key: "l", style: { display: "flex", alignItems: "center", gap: mm(wallet ? 2.4 : 4.5) } }, [
      qrUrl ? h("img", { key: "qr", src: qrUrl, alt: "Verification QR", style: { width: mm(S.qr), height: mm(S.qr), display: "block" } })
            : h("div", { key: "qr", style: { width: mm(S.qr), height: mm(S.qr), background: "#eef0f4" } }),
      h("span", { key: "rc", style: { display: "flex", flexDirection: "column", gap: mm(1.5), fontFamily: "'IBM Plex Mono',monospace", fontWeight: 400 } }, [
        h("span", { key: "r", style: { fontSize: pt(S.rolePt), letterSpacing: ".24em", color: NAVY } }, role),
        h("span", { key: "c", style: { fontSize: pt(S.capPt), letterSpacing: ".16em", color: CAP } }, "SCAN TO VERIFY"),
      ]),
    ]),
    h("img", { key: "logo", src: "/assets/logo.png", alt: "Next Generation Genius", crossOrigin: "anonymous", style: { width: mm(S.logoW), display: "block" } }),
  ]);

  return h("div", { style: { width: mm(S.W), height: mm(S.H), background: "#fff", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", padding: "0 " + mm(S.padX) + " " + mm(S.padB), boxSizing: "border-box", fontFamily: "'Poppins',sans-serif", WebkitFontSmoothing: "antialiased" } }, [
    photoWrap, identity,
    h("div", { key: "sp", style: { flex: "1", minHeight: mm(wallet ? 3 : 6) } }),
    h("div", { key: "hr", style: { height: mm(S.hair), background: HAIR, flex: "none" } }),
    footer,
  ]);
}

/* Batch export of the A5 redesign, mirroring MemberIDCardBatch but at the new
 * design and a chosen physical size ('a5' 148×210mm or 'wallet' 54×85mm). Fonts
 * are ensured first. A5 is already a full page, so a 'sheet' (imposed) request
 * for A5 becomes one A5 page per card. */
function NggcMemberCardExport(members, opts) {
  members = members || []; opts = opts || {};
  var React = window.React, h = React.createElement, RD = window.ReactDOM;
  var mode = opts.mode || "zip";
  var size = opts.size === "wallet" ? "wallet" : "a5";
  var W = size === "wallet" ? 54 : 148, H = size === "wallet" ? 85 : 210;
  var dpi = Math.max(96, Math.min(600, Number(opts.dpi) || 300));
  if (size === "a5" && mode === "sheet") mode = "pdf";

  return (async function () {
    if (!RD || !RD.createRoot) throw new Error("the renderer is not available");
    var CE = await loadVendor("cardExport");
    if (window.nggcEnsureFonts) { try { await window.nggcEnsureFonts(); } catch (e) {} }

    var host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(host);

    var doc = null, faces = [], files = [], pages = 0, failed = [];
    try {
      for (var i = 0; i < members.length; i++) {
        if (opts.cancel && opts.cancel()) break;
        var m = members[i] || {};
        if (opts.onProgress) opts.onProgress(i, members.length, m);
        var qr = "";
        try { qr = await _ngQrDataUrl(_ngMemberQrPayload(m)); } catch (e) { qr = ""; }
        var mount = document.createElement("div"); mount.style.cssText = "display:inline-block;";
        host.appendChild(mount);
        var root = RD.createRoot(mount);
        root.render(h(NggcMemberCard, { member: m, size: size, qrUrl: qr }));
        await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
        await _ngWaitImages(mount, 8000);
        var node = mount.firstElementChild, px = null;
        try {
          if (!node) throw new Error("no card node");
          if (mode === "sheet") { px = await CE.renderFace(node, { trimW_mm: W, trimH_mm: H, bleed_mm: 3, dpi: dpi, bg: "#ffffff" }); }
          else { var scale = CE.scaleForDpi(node.offsetWidth || 300, W, dpi); px = await CE.nodeToImage(node, { scale: scale, bg: "#ffffff" }); }
        } catch (e) { failed.push(String(m.fullName || m.memberId || ("#" + (i + 1)))); }
        try { root.unmount(); } catch (e) {}
        try { host.removeChild(mount); } catch (e) {}
        if (px) {
          if (mode === "pdf") {
            if (!doc) { var jl = await loadVendor("jspdf"); var JsPDF = jl.jsPDF; if (!JsPDF) throw new Error("the PDF library is not loaded"); doc = new JsPDF({ unit: "mm", format: [W, H], orientation: "portrait" }); }
            else { doc.addPage([W, H], "portrait"); }
            doc.addImage(px.dataUrl, "PNG", 0, 0, W, H, undefined, "FAST"); pages++;
          } else if (mode === "sheet") {
            faces.push({ dataUrl: px.dataUrl, wPx: px.wPx, hPx: px.hPx, bleedPx: px.bleedPx, trimWPx: px.trimWPx, trimHPx: px.trimHPx });
          } else { files.push({ name: _ngMemberFileStem(m, i) + ".png", bytes: CE.dataUrlToBytes(px.dataUrl) }); }
        }
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      var made = mode === "pdf" ? pages : mode === "sheet" ? faces.length : files.length;
      if (made > 0) {
        if (opts.onProgress) opts.onProgress(members.length, members.length, { fullName: "writing the file…" });
        var stem = "nggc-member-ids-" + size + "-" + made;
        if (mode === "pdf") { doc.save(stem + ".pdf"); }
        else if (mode === "sheet") {
          var pdf = await CE.buildImpositionPDF(faces, { sheet: "A4", trimW_mm: W, trimH_mm: H, bleed_mm: 3, safe_mm: 3, marks: true, layers: true, intent: "FOGRA39", jobName: "NGGC Member IDs", date: new Date().toISOString().slice(0, 10) });
          CE.download(pdf, stem + "-imposed.pdf", "application/pdf");
        } else { var zip = await CE.zipStore(files); CE.download(zip, stem + ".zip", "application/zip"); }
      }
      return { made: made, failed: failed, mode: mode };
    } finally { try { document.body.removeChild(host); } catch (e) {} }
  })();
}

Object.assign(window, {
  TPL_FIELDS, TPL_SYSTEM, TPL_REQUIRED, TPL_PRESETS, TPL_BRAND, TPL_FONTS,
  TPL_FACES, TPL_NAME_FIELDS, tplNameParts,
  tplMmPerUnit, tplQrModules,
  TPL_QR_GOOD_MODULE_MM, TPL_QR_MIN_MODULE_MM,
  tplBindValue, tplResolve, tplFitSize, tplToFabric, tplPreflight,
  tplPaintUnder, tplInkProblems, TPL_INK_ERROR_RATIO, TPL_INK_WARN_RATIO,
  MemberIDCard, MemberIDCardBatch,
  NggcMemberCard, NggcMemberCardExport, nggcEnsureFonts, nggcDisplayId, nggcDisciplines, nggcName,
});
