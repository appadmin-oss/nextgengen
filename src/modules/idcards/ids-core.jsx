/* ============================================================================
   ID Card Studio (/club/id-cards) — the model. Pure functions and tables only;
   nothing here touches React, the DOM or the network, so tests/ids-core.test.js
   runs it as it is.

   The sheet maths is ID_CARD_STUDIO.md §3.4 to the letter, because what is on
   the screen has to be what comes out of the printer: a slot that is half a
   millimetre out on screen is half a millimetre out on two hundred cards.
   Every length here is in millimetres.
   ========================================================================== */

/* Card sizes: key → [label, sub, width, height]. CR80 is 53.98 × 85.6 for the maths. */
const IDS_SIZES = {
  cr80p:  ["CR80 portrait", "54 × 85.6 mm", 53.98, 85.6],
  cr80l:  ["CR80 landscape", "85.6 × 54 mm", 85.6, 53.98],
  a6p:    ["A6 portrait", "105 × 148 mm", 105, 148],
  custom: ["Custom", "Your own size", 0, 0],
};
const IDS_SIZE_IDS = ["cr80p", "cr80l", "a6p", "custom"];
const IDS_PAPERS = { a4: ["A4", 210, 297], letter: ["Letter", 215.9, 279.4], a3: ["A3", 297, 420] };
const IDS_PAPER_IDS = ["a4", "letter", "a3"];
const IDS_CUSTOM_LIMITS = { min: 20, maxW: 200, maxH: 280 };
const IDS_MARGIN = { def: 10, min: 3, max: 30 };
const IDS_GAP = { def: 4, min: 0, max: 20 };
const IDS_DPI = [[150, "150 dpi · proof"], [300, "300 dpi · print"], [600, "600 dpi · fine"]];
const IDS_KINDS = { member: "Member", summer: "Summer School", volunteer: "Volunteer" };
const IDS_KIND_IDS = ["member", "summer", "volunteer"];
/* The printed kind label on the sheet's packing list and filters. */
const IDS_KIND_PLURAL = { member: "NGG members", summer: "Summer School", volunteer: "Volunteers" };
const IDS_ORDERS = [["centre", "Centre"], ["kind", "Kind"], ["name", "Name"], ["mine", "My order"]];
const IDS_BACKS = [
  ["off", "Fronts only", "Single-sided"],
  ["long", "Double-sided · long edge", "Most printers. Backs are mirrored left to right"],
  ["short", "Double-sided · short edge", "Backs mirrored top to bottom"],
];
const IDS_REASONS = [["new", "New issues"], ["reprint", "Reprints"], ["mixed", "New issues and reprints"], ["external", "External uploads"], ["proof", "Proof"]];
const IDS_REC_PAGE = 60;      // record rows drawn at first
const IDS_REC_MORE = 100;     // and each "Show more"
const IDS_OVERVIEW_MAX = 60;  // mini sheets in the overview
const IDS_BIG_RUN = 10;       // sheets above which batching is suggested
const IDS_COPIES_MAX = 50;
const IDS_DESIGN_W = 216, IDS_DESIGN_H = 342; // the card's design units (CR80 portrait at 96 dpi, rounded)

/* What are you printing? Each scenario SETS these values (§3.2.1). */
const IDS_SCENARIOS = [
  { key: "batch",   icon: "stack",            label: "New intake",     src: "records", filter: "new",     order: "centre", breakBy: true,  packing: true,  reason: "new",      dpi: 300,
    hint: "Sorted by centre, each centre starts on a fresh sheet, with a packing list to tick off as you cut." },
  { key: "reprint", icon: "arrows-clockwise", label: "Reprints",       src: "records", filter: "reprint", order: "centre", breakBy: false, packing: true,  reason: "reprint",  dpi: 300,
    hint: "Only people whose card needs replacing. Their old card stops working at the gate once the new one prints." },
  { key: "one",     icon: "user",             label: "One person",     src: "records", filter: "all",     order: "mine",   breakBy: false, packing: false, reason: "new",      dpi: null, focusSearch: true,
    hint: "Search, tick, print. Use “skip used slots” to finish off a part-used sheet." },
  { key: "upload",  icon: "image",            label: "Made elsewhere", src: "uploads", filter: null,      order: "mine",   breakBy: false, packing: false, reason: "external", dpi: null,
    hint: "Upload finished card images, check sharpness and fit, then lay them out to cut." },
  { key: "proof",   icon: "eye",              label: "Proof",          src: "records", filter: "all",     order: "mine",   breakBy: false, packing: false, reason: "proof",    dpi: 150,
    hint: "Prints at 150 dpi with a PROOF watermark. Nobody is marked as printed." },
];

/* Tones [bg, fg, dot] (§7). Mirrored in styles as --ids-* tokens; this copy is
   for the print PDF, which reads no stylesheet. */
const IDS_TONES = {
  ok: ["#e8f5ec", "#17663a", "#22a05a"], warn: ["#fdf2d8", "#7a5600", "#e0a100"], bad: ["#fdeaea", "#a12a2a", "#d94141"],
  neutral: ["#f0f0ef", "#48484e", "#9a9aa0"], info: ["#f4f4f3", "#3a3a40", "#9a9aa0"],
};

const idsClamp = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

/** The card's size in mm for a size key, the custom pair clamped to what the inputs allow. */
function idsCardDims(size, customW, customH) {
  if (size === "custom") return [idsClamp(customW, IDS_CUSTOM_LIMITS.min, IDS_CUSTOM_LIMITS.maxW, 60), idsClamp(customH, IDS_CUSTOM_LIMITS.min, IDS_CUSTOM_LIMITS.maxH, 90)];
  const z = IDS_SIZES[size] || IDS_SIZES.cr80p;
  return [z[2], z[3]];
}

/**
 * The sheet grid (§3.4), exactly:
 *   usable = paper − 2·margin; cols/rows = floor((usable + gap) / (card + gap));
 *   the block of cards is centred in the usable area.
 * A card that does not fit gives cols or rows 0, and per 0 — "doesn't fit".
 */
function idsGrid({ paper, size, customW, customH, margin, gap }) {
  const P = IDS_PAPERS[paper] || IDS_PAPERS.a4;
  const [cw, ch] = idsCardDims(size, customW, customH);
  const m = idsClamp(margin, IDS_MARGIN.min, IDS_MARGIN.max, IDS_MARGIN.def);
  const g = idsClamp(gap, IDS_GAP.min, IDS_GAP.max, IDS_GAP.def);
  const uw = P[1] - 2 * m, uh = P[2] - 2 * m;
  const cols = Math.max(0, Math.floor((uw + g) / (cw + g)));
  const rows = Math.max(0, Math.floor((uh + g) / (ch + g)));
  const ox = m + (uw - (cols * cw + Math.max(0, cols - 1) * g)) / 2;
  const oy = m + (uh - (rows * ch + Math.max(0, rows - 1) * g)) / 2;
  return { paper: paper in IDS_PAPERS ? paper : "a4", pw: P[1], ph: P[2], cw, ch, m, g, cols, rows, per: cols * rows, ox, oy };
}

/**
 * Where slot i sits on the page, in mm. A back is mirrored so it lands behind
 * its front after the sheet is flipped: long-edge flips mirror the columns,
 * short-edge flips mirror the rows.
 */
function idsSlotPos(G, i, mirror) {
  let col = i % G.cols, row = Math.floor(i / G.cols);
  if (mirror === "long") col = G.cols - 1 - col;
  if (mirror === "short") row = G.rows - 1 - row;
  return { x: G.ox + col * (G.cw + G.g), y: G.oy + row * (G.ch + G.g), col, row };
}

/** How many sheets a run needs (§3.4): ceil((skip + cards) / per), 0 when nothing fits. */
function idsSheetCount(per, skip, n) { return per > 0 && n > 0 ? Math.ceil((skip + n) / per) : 0; }

/**
 * Cut marks: 4mm ticks outside the card block, one at every card edge.
 * Returns [{x, y, w, h}] in mm — thin rectangles, so the screen and the print
 * window draw the same marks from one list.
 */
function idsCutMarks(G, len = 4, weight = 0.2) {
  if (!G.per) return [];
  const out = [];
  const xs = [], ys = [];
  for (let c = 0; c < G.cols; c++) { const x0 = G.ox + c * (G.cw + G.g); xs.push(x0, x0 + G.cw); }
  for (let r = 0; r < G.rows; r++) { const y0 = G.oy + r * (G.ch + G.g); ys.push(y0, y0 + G.ch); }
  const top = G.oy, bottom = G.oy + G.rows * G.ch + (G.rows - 1) * G.g;
  const left = G.ox, right = G.ox + G.cols * G.cw + (G.cols - 1) * G.g;
  [...new Set(xs.map(v => +v.toFixed(3)))].forEach(x => {
    out.push({ x: x - weight / 2, y: top - len - 1, w: weight, h: len });
    out.push({ x: x - weight / 2, y: bottom + 1, w: weight, h: len });
  });
  [...new Set(ys.map(v => +v.toFixed(3)))].forEach(y => {
    out.push({ x: left - len - 1, y: y - weight / 2, w: len, h: weight });
    out.push({ x: right + 1, y: y - weight / 2, w: len, h: weight });
  });
  return out;
}

/**
 * The run's slot list: the queue in print order, with blank pads inserted at
 * every group break so each group starts on a fresh sheet (§3.4: pads until
 * (skip + placed) % per == 0). `groupOf` returns the group key, or null for
 * no grouping. Returns { slots, pads } — a slot is a card or { pad: true }.
 */
function idsLayout(cards, per, skip, groupOf) {
  const slots = [];
  let pads = 0, prev;
  cards.forEach((c, i) => {
    const g = groupOf ? groupOf(c) : null;
    if (groupOf && i > 0 && g !== prev && per > 0) {
      while ((skip + slots.length) % per !== 0) { slots.push({ pad: true }); pads++; }
    }
    prev = g;
    slots.push(c);
  });
  return { slots, pads };
}

/** Sort the queue for an order key. "mine" keeps the order it was built in. */
function idsSort(cards, order, keyOf) {
  if (order === "mine") return cards.slice();
  const val = c => { const k = keyOf(c); return order === "centre" ? k.centre : order === "kind" ? k.kind : k.name; };
  return cards.map((c, i) => [c, i]).sort((a, b) => {
    const x = String(val(a[0]) || "￿"), y = String(val(b[0]) || "￿");
    return x.localeCompare(y, "en", { sensitivity: "base" }) || String(keyOf(a[0]).name || "").localeCompare(String(keyOf(b[0]).name || ""), "en") || a[1] - b[1];
  }).map(p => p[0]);
}

/* ── Uploaded images ────────────────────────────────────────────────────── */

/** Effective dpi of an image on the card: the smaller of the two directions, sideways when rotated 90/270. */
function idsEffDpi(u, cw, ch) {
  const side = (u.rot || 0) % 180 !== 0;
  const pw = side ? u.h : u.w, ph = side ? u.w : u.h;
  return Math.round(Math.min(pw / (cw / 25.4), ph / (ch / 25.4)));
}

/** The dpi chip: ok at 90% of the target, warn from 150, else bad. */
function idsDpiChip(dpi, target) {
  if (dpi >= 0.9 * target) return { tone: "ok", label: "≈" + dpi + " dpi" };
  if (dpi >= 150) return { tone: "warn", label: "≈" + dpi + " dpi · may look soft" };
  return { tone: "bad", label: "≈" + dpi + " dpi · blurry" };
}

/**
 * The fit chip: "Sideways · rotate it" when turning it 90° fits at least 5%
 * better; else, past a 3% difference, how much "fill" crops or "fit" pads;
 * else it fits.
 */
function idsFitChip(u, cw, ch) {
  const side = (u.rot || 0) % 180 !== 0;
  const ir = side ? u.h / u.w : u.w / u.h, sr = cw / ch;
  const diff = Math.abs(ir - sr) / sr, diffRot = Math.abs(1 / ir - sr) / sr;
  if (diffRot <= diff - 0.05) return { tone: "warn", label: "Sideways · rotate it", sideways: true };
  if (diff > 0.03) {
    // Share of the image cut away (fill) or of the card left blank (fit).
    const pct = Math.round((1 - Math.min(ir, sr) / Math.max(ir, sr)) * 100);
    return u.fit === "contain" ? { tone: "warn", label: "White bars " + pct + "%" } : { tone: "warn", label: "Edges cropped " + pct + "%" };
  }
  return { tone: "ok", label: "Fits the card" };
}

const IDS_IMG_EXT = /\.(png|jpe?g|webp)$/i;
const IDS_BACK_RE = /([-_ ]back|-b)$/i;
/** A file name's stem for pairing: no extension, no front/back suffix, lower case. */
function idsStem(name) { return String(name).replace(IDS_IMG_EXT, "").replace(/([-_ ](back|front)|-[bf])$/i, "").toLowerCase(); }
function idsIsBackName(name) { return IDS_BACK_RE.test(String(name).replace(IDS_IMG_EXT, "")); }

/**
 * Pair backs with fronts by file name: "x-back", "x_back", "x back" or "x-b"
 * goes behind the front named "x" (or "x-front"), if that front has no back
 * yet. Returns new upload objects and how many were paired; never mutates.
 */
function idsPairUploads(uploads) {
  const ups = uploads.map(u => Object.assign({}, u));
  let paired = 0;
  ups.forEach(b => {
    if (b.backOf || !idsIsBackName(b.name)) return;
    const f = ups.find(x => x !== b && !x.backOf && !idsIsBackName(x.name) && !x.back && idsStem(x.name) === idsStem(b.name));
    if (f) { f.back = b.uid; b.backOf = f.uid; paired++; }
  });
  return { uploads: ups, paired };
}

/* ── The run ────────────────────────────────────────────────────────────── */

/** The log reason, pre-set (§4.1): proof wins; no records = external; all reprints; some; else new. */
function idsAutoReason(scenario, nRecords, nReprints) {
  if (scenario === "proof") return "proof";
  if (!nRecords) return "external";
  if (nReprints && nReprints === nRecords) return "reprint";
  if (nReprints) return "mixed";
  return "new";
}

/** Batches of a run: [[from, to], …], 1-based and inclusive. */
function idsBatches(nSheets, size) {
  const n = Math.max(1, Math.floor(size) || 1), out = [];
  for (let a = 1; a <= nSheets; a += n) out.push([a, Math.min(nSheets, a + n - 1)]);
  return out;
}

/** Sheets from–to, clamped and put in order. */
function idsRange(nSheets, from, to) {
  const a = idsClamp(Math.round(from), 1, Math.max(1, nSheets), 1), b = idsClamp(Math.round(to), 1, Math.max(1, nSheets), nSheets);
  return a <= b ? [a, b] : [b, a];
}

/** How many cards sheets a–b hold, given the slot list and the used slots on sheet 1. */
function idsCardsInRange(slots, per, skip, a, b) {
  let n = 0;
  for (let p = a - 1; p < b; p++) for (let i = 0; i < per; i++) { const s = slots[p * per + i - skip]; if (s && !s.pad) n++; }
  return n;
}

/** Stock: sheets, printed sides and how much of the card stock carries a card. */
function idsStock(nCards, nSlots, per, skip, backs) {
  const sheets = idsSheetCount(per, skip, nSlots);
  const used = sheets ? Math.round((nCards / (sheets * per)) * 100) : 0;
  return { sheets, sides: sheets * (backs === "off" ? 1 : 2), used };
}

/** Initials for a thumb: the first letters of the first two words. */
function idsInitials(name) { return String(name || "").trim().split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase(); }

/** Plural helper for copy: "1 card", "2 cards". */
function idsN(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
