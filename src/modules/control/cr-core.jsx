/* ============================================================================
   Control Room v2 — the rules, with no React in them (CONTROL_ROOM.md §1, §3,
   §4). Everything here is a pure function so tests/cr-core.test.js can hold it
   without a browser: the breakpoints and block spans, the table's sort, filter
   and selection, the palette's ranking and scopes, the queue's movement, form
   validation, and density.
   ========================================================================== */

/* Container widths, never the window's (README §4.1). */
const CR_BP = { phone: 600, rail: 900, wide: 1180 };
const CR_SIDE_W = 248, CR_RAIL_W = 64, CR_ASK_W = 360;
const CR_MAIN_MAX = 1240, CR_MAIN_PAD = 32, CR_GAP = 16;
const CR_ASK_MIN_MAIN = 760;     // below this the Ask panel overlays instead of pushing

/** Which tree, how wide the sidebar is, and where Ask sits, for a root width. */
function crLayout(W, opts) {
  const o = opts || {};
  if (W < CR_BP.phone) return { tree: "phone", sideW: 0, railForced: false, collapsed: false, mainW: W, ask: o.ask ? "sheet" : null };
  const railForced = W < CR_BP.rail;
  const collapsed = railForced || !!o.collapsed;
  const sideW = collapsed ? CR_RAIL_W : CR_SIDE_W;
  let mainW = W - sideW, ask = null;
  if (o.ask) {
    // §4.4 MUST: pushing the main area under 760 would wrap blocks word by
    // word (screenshot 02-cr.png). Overlay it instead and leave main alone.
    if (mainW - CR_ASK_W < CR_ASK_MIN_MAIN) ask = "overlay";
    else { ask = "side"; mainW -= CR_ASK_W; }
  }
  return { tree: "desktop", sideW, railForced, collapsed, mainW, ask };
}

/** The width a block of `span` columns gets inside a main area `mainW` wide. */
function crBlockWidth(span, mainW) {
  const inner = Math.min(mainW, CR_MAIN_MAX + 2 * CR_MAIN_PAD) - 2 * CR_MAIN_PAD;
  const col = (inner - 5 * CR_GAP) / 6;
  return col * span + (span - 1) * CR_GAP;
}

/**
 * The grid span a block takes (§3), from the MAIN area's width: 4 → 6 and
 * 2 → 3 below 1180, everything 6 below 900. The 480px floor of §4.4 is kept by
 * crLayout — Ask overlays rather than squeezing main under 760 — not here: the
 * design's own span-2 blocks (System health) are narrower than 480 by intent.
 */
function crSpan(span, mainW) {
  const s = span || 6;
  if (mainW < CR_BP.rail) return 6;
  if (mainW < CR_BP.wide) return s === 4 ? 6 : s === 2 ? 3 : s;
  return s;
}

/** The breadcrumb's group shows only with room for it; "View site" likewise (§2.2). */
function crTopbar(mainW) { return { showGroup: mainW >= 760, showViewSite: mainW >= 860 }; }

/* ── Density changes vertical padding only (§3) ─────────────────────────── */
const CR_DENSITY = { compact: { pad: 6, font: 13 }, balanced: { pad: 10, font: 13.5 }, comfortable: { pad: 14, font: 13.5 } };
const CR_DENSITY_IDS = ["compact", "balanced", "comfortable"];
function crDensity(k) { return CR_DENSITY[k] || CR_DENSITY.balanced; }

/* ── Tones (§6) as names; the colours live in the stylesheet ─────────────── */
const CR_TONES = ["ok", "warn", "bad", "neutral", "gold"];
function crTone(t) { return CR_TONES.indexOf(t) >= 0 ? t : "neutral"; }

/* ── Small formatters ────────────────────────────────────────────────────── */
function crInitials(name) {
  return String(name || "?").replace(/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}
function crNum(n) { return Number(n || 0).toLocaleString("en-GB"); }
function crPlural(n, one, many) { return crNum(n) + " " + (n === 1 ? one : (many || one + "s")); }
/** "40m", "3h", "4d", "2w" — how long something has waited (§3 queue). */
function crAgo(iso, now) {
  const t = Date.parse(iso || "");
  if (!t) return "";
  const s = Math.max(0, ((now || Date.now()) - t) / 1000);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m";
  if (s < 86400) return Math.round(s / 3600) + "h";
  if (s < 86400 * 14) return Math.round(s / 86400) + "d";
  return Math.round(s / (86400 * 7)) + "w";
}
/** A date as people read it here: "Sat 10 Oct", with the year only when it is not this year. */
function crDate(iso, withTime) {
  const t = Date.parse(iso || "");
  if (!t) return "—";
  const d = new Date(t), now = new Date();
  const o = { weekday: "short", day: "numeric", month: "short" };
  if (d.getFullYear() !== now.getFullYear()) o.year = "numeric";
  let s = d.toLocaleDateString("en-GB", o).replace(",", "");
  if (withTime) s += " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return s;
}

/* ── Table: cells, sorting, filtering, selection (§3 table) ──────────────── */

/* A cell is { k, t, s?, tone?, pct? }: person · status · progress · mono · num · strong · text. */
function crCellText(c) { return c == null ? "" : typeof c === "object" ? String(c.t == null ? "" : c.t) : String(c); }
function crCellValue(c) {
  if (c && typeof c === "object" && c.k === "progress") return Number(c.pct) || 0;
  const t = crCellText(c);
  if (c && typeof c === "object" && (c.k === "num" || c.v != null)) {
    if (c.v != null) return Number(c.v);
    const n = Number(t.replace(/[^\d.-]/g, ""));
    if (/\d/.test(t) && !isNaN(n)) return n;
  }
  return t.toLowerCase();
}

/** The next sort state when a column header is pressed: off → (number ? desc : asc) → the other way → off. */
function crNextSort(cur, ci, numeric) {
  const on = cur && cur.ci === ci;
  if (!on) return { ci, dir: numeric ? "desc" : "asc" };
  const first = numeric ? "desc" : "asc";
  return cur.dir === first ? { ci, dir: first === "asc" ? "desc" : "asc" } : null;
}

/**
 * What a client-side table shows: rows matching the search (any cell's text or
 * sub-line) and every chosen filter (a filter is an exact cell value), sorted.
 * Rows keep their original index as `ri` so selection survives a re-sort.
 */
function crTableView(rows, opts) {
  const o = opts || {};
  const q = String(o.q || "").trim().toLowerCase();
  const fv = o.filters || {};
  let out = rows.map((r, ri) => ({ r, ri })).filter(x => {
    if (q && !x.r.cells.map(c => crCellText(c) + " " + ((c && c.s) || "")).join(" ").toLowerCase().includes(q)) return false;
    return Object.keys(fv).every(ci => fv[ci] == null || fv[ci] === "" || crCellText(x.r.cells[ci]) === fv[ci]);
  });
  const srt = o.sort;
  if (srt) {
    const dir = srt.dir === "asc" ? 1 : -1;
    out = out.slice().sort((a, z) => {
      const x = crCellValue(a.r.cells[srt.ci]), y = crCellValue(z.r.cells[srt.ci]);
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir || a.ri - z.ri;
      return String(x).localeCompare(String(y)) * dir || a.ri - z.ri;
    });
  }
  return out;
}

/** The options a filter chip opens: every distinct value in that column, with how many rows have it. */
function crFilterOptions(rows, ci) {
  const n = new Map();
  rows.forEach(r => { const t = crCellText(r.cells[ci]); if (t && t !== "—") n.set(t, (n.get(t) || 0) + 1); });
  return [...n.entries()].map(([l, c]) => ({ l, n: c })).sort((a, b) => a.l.localeCompare(b.l));
}

/** Select-all is over what is SHOWN: everything visible on, or everything visible off. */
function crToggleAll(sel, visibleKeys) {
  const all = visibleKeys.length > 0 && visibleKeys.every(k => sel[k]);
  const next = Object.assign({}, sel);
  visibleKeys.forEach(k => { if (all) delete next[k]; else next[k] = true; });
  return next;
}
function crSelState(sel, visibleKeys) {
  const n = visibleKeys.filter(k => sel[k]).length;
  return { all: n > 0 && n === visibleKeys.length, some: n > 0 && n < visibleKeys.length, n };
}

/* ── Queue (§3 queue) ────────────────────────────────────────────────────── */

/** j / k: the next or previous id, stopping at the ends. */
function crQueueMove(ids, cur, dir) {
  if (!ids.length) return null;
  const i = Math.max(0, ids.indexOf(cur));
  return ids[Math.max(0, Math.min(ids.length - 1, i + (dir > 0 ? 1 : -1)))];
}
/** Which item is selected after `id` is resolved: the one after it, else the one before, else none. */
function crQueueAfterResolve(ids, id) {
  const i = ids.indexOf(id);
  if (i < 0) return ids[0] || null;
  return ids[i + 1] || ids[i - 1] || null;
}
/* ── Inbox triage (the inbox workspace, cr-tab-inbox.jsx) ─────────────────
   Pure, so the rules that decide what a person sees first are held by tests
   rather than by the look of the screen. An item is { id, cat, who, at,
   unread, urgent, title, body, kind, search?, sla? }. */

/** Hours a kind of item may wait before it is overdue. Messages are promised
 *  an answer within 2 working days in the acknowledgement email. */
const CR_INBOX_SLA = { messages: 48, requests: 48, applications: 72, approvals: 24, comments: 48, photos: 72 };

/** How long an item has waited, and whether that is now too long. */
function crInboxSla(it, now) {
  const t = Date.parse(it.at || "");
  const hours = isFinite(t) ? Math.max(0, ((now == null ? Date.now() : now) - t) / 3600000) : 0;
  const limit = (it.sla != null ? it.sla : CR_INBOX_SLA[it.cat]) || 72;
  const overdue = hours >= limit;
  const tone = overdue ? "bad" : hours >= limit * 0.66 ? "warn" : "neutral";
  return { hours, limit, overdue, tone, left: Math.max(0, limit - hours) };
}

/** Does an item match a search: who, title, body, kind and any extra words it carries (email, reference). */
function crInboxMatch(it, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  const hay = [it.who, it.title, it.body, it.kind, it.search].filter(Boolean).join(" ").toLowerCase();
  return s.split(/\s+/).every(w => hay.includes(w));
}

/**
 * Order the inbox. "triage" (the default) puts first what is costing somebody
 * most: urgent, then overdue, then unread, then the longest waiting. "newest"
 * is plain reverse time; "oldest" plain time.
 */
function crInboxSort(items, mode, now) {
  const at = it => { const t = Date.parse(it.at || ""); return isFinite(t) ? t : 0; };
  const out = items.slice();
  if (mode === "newest") return out.sort((a, b) => at(b) - at(a));
  if (mode === "oldest") return out.sort((a, b) => at(a) - at(b));
  return out.sort((a, b) => (!!b.urgent - !!a.urgent)
    || (crInboxSla(b, now).overdue - crInboxSla(a, now).overdue)
    || (!!b.unread - !!a.unread)
    || (at(a) - at(b)));
}

/** The filter chips inside a view: everything, unread, overdue, or the ones that need a written reply. */
function crInboxFilter(items, f, now) {
  f = f || {};
  return items.filter(it =>
    (!f.view || f.view === "all" || it.cat === f.view)
    && (!f.chip || f.chip === "all"
        || (f.chip === "unread" && it.unread)
        || (f.chip === "overdue" && crInboxSla(it, now).overdue)
        || (f.chip === "reply" && !!it.reply))
    && crInboxMatch(it, f.q));
}

/** Counts per view (and "all"), for the rail. */
function crInboxCounts(items) {
  const c = { all: items.length };
  items.forEach(it => { c[it.cat] = (c[it.cat] || 0) + 1; });
  return c;
}

/** Sorted items cut into labelled runs for the list: Overdue, New, Waiting. Empty runs are dropped. */
function crInboxGroups(sorted, mode, now) {
  if (mode && mode !== "triage") return [{ key: "all", label: "", items: sorted }];
  const g = { overdue: [], fresh: [], waiting: [] };
  sorted.forEach(it => { (crInboxSla(it, now).overdue ? g.overdue : it.unread ? g.fresh : g.waiting).push(it); });
  return [["overdue", "Overdue"], ["fresh", "New"], ["waiting", "Waiting"]].map(([k, l]) => ({ key: k, label: l, items: g[k] })).filter(x => x.items.length);
}

/** A saved reply with its blanks filled: {first}, {name}, {ref}, {me}. Unknown blanks are left as written. */
function crFillReply(tpl, vars) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null && vars[k] !== "") ? String(vars[k]) : m);
}

/**
 * What can be done to several selected items at once: the actions every one
 * of them offers by the same label that need nothing typed (no note, no form).
 * Anything that asks a question per item stays one at a time.
 */
function crInboxBulkActions(items) {
  if (!items.length) return [];
  const simple = it => (it.actions || []).filter(a => !a.note && !a.form).map(a => a.l);
  return simple(items[0]).filter(l => items.every(it => simple(it).indexOf(l) >= 0));
}

/** Which verb a resolving action is, for the toast: Declined, Done or Approved. */
function crResolveVerb(label) {
  if (/^(Reject|Decline|Delete)/.test(label)) return "Declined";
  if (/^(Waitlist|Ask|Keep|Forward|Reply|Send|Mark)/.test(label)) return "Done";
  return "Approved";
}
/** Danger labels take the danger ink (§2.4). */
function crIsDanger(label) { return /^(Reject|Decline|Delete|Remove|Revoke|Suspend|Deactivate|Sign out)/.test(String(label || "")); }

/* ── Form validation (§4.3): on submit, then live ────────────────────────── */

/**
 * Field: { id, l, req?, num?, email?, min?, max?, pattern?, patternMsg?, check?(v, values) }.
 * Messages are the prototype's, verbatim.
 */
function crValidate(fields, values) {
  const fe = {};
  fields.forEach(x => {
    if (x.hidden) return;
    const raw = values[x.id];
    const val = Array.isArray(raw) ? raw.join(",") : String(raw == null ? "" : raw).trim();
    if (x.req && !val) { fe[x.id] = "Enter " + String(x.l).toLowerCase().replace(/ \(.*\)/, "") + "."; return; }
    if (!val) return;
    if (x.num && !(Number(val.replace(/[^\d.]/g, "")) > 0)) { fe[x.id] = x.money ? "Enter an amount above ₦0." : "Enter a number above 0."; return; }
    if (x.email && !/^\S+@\S+\.\S+$/.test(val)) { fe[x.id] = "That email looks incomplete."; return; }
    if (x.max && val.length > x.max) { fe[x.id] = "Keep it to " + x.max + " characters."; return; }
    if (x.pattern && !x.pattern.test(val)) { fe[x.id] = x.patternMsg || "That doesn’t look right."; return; }
    if (x.check) { const m = x.check(val, values); if (m) fe[x.id] = m; }
  });
  return fe;
}

/* ── Command palette ranking and scopes (§4.1) ───────────────────────────── */
const CR_SCOPES = [["all", "All"], ["pages", "Pages"], ["actions", "Actions"], ["people", "Members"]];

/** How well `label` matches `q`: 3 starts with it, 2 a word starts with it, 1 contains it, 0 no. */
function crMatchScore(label, q) {
  const s = String(label || "").toLowerCase(), t = String(q || "").trim().toLowerCase();
  if (!t) return 1;
  if (s.startsWith(t)) return 3;
  if (s.split(/[\s›·/&,-]+/).some(w => w.startsWith(t))) return 2;
  return s.includes(t) ? 1 : 0;
}
/** Tab cycles the scope; Shift+Tab goes back. */
function crNextScope(cur, back) {
  const ids = CR_SCOPES.map(s => s[0]);
  return ids[(ids.indexOf(cur) + (back ? ids.length - 1 : 1)) % ids.length];
}
/**
 * Groups of results for the palette. `pages` are { l, path, keywords, sub }
 * (sub = a tab other than the first, hidden until the person types),
 * `actions` { l }, `people` { l, path } (already searched on the server).
 */
function crPaletteResults(q, scope, pages, actions, people) {
  const query = String(q || "").trim();
  const rank = list => list.map((x, i) => ({ x, i, s: crMatchScore(x.l + " " + (x.keywords || ""), query) }))
    .filter(r => r.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map(r => r.x);
  const out = [];
  if (scope === "all" || scope === "pages") {
    const p = rank(pages.filter(x => query || !x.sub));
    if (p.length) out.push({ h: "Go to", items: p.slice(0, scope === "pages" ? 40 : query ? 8 : 5) });
  }
  if (scope === "all" || scope === "actions") {
    const a = rank(actions);
    if (a.length) out.push({ h: "Actions", items: a.slice(0, scope === "actions" ? 20 : 5) });
  }
  if ((scope === "all" && query) || scope === "people") {
    if (people.length) out.push({ h: "Members", items: people.slice(0, 6) });
  }
  return out;
}

/* ── Columns block maths (§3 columns): a round top, half-way guide, % capped at 100 ── */
function crColumnsScale(values, pct) {
  const mx = Math.max(1, ...values.map(v => Number(v) || 0));
  const p = Math.pow(10, Math.floor(Math.log10(mx)));
  let top = Math.ceil(mx / p * 2) / 2 * p;
  if (pct) top = Math.min(100, Math.max(top, 1));
  const fmt = v => crNum(Math.round(v * 10) / 10) + (pct ? "%" : "");
  return { top, yTop: fmt(top), yMid: fmt(top / 2), yZero: pct ? "0%" : "0", h: v => Math.max(2, (Number(v) || 0) / top * 100) };
}

/* ── SMS maths for the compose block ─────────────────────────────────────── */
const CR_SMS_PREFIX = "NGG: ";
function crSmsParts(body) { return Math.max(1, Math.ceil((String(body || "").length + CR_SMS_PREFIX.length) / 160)); }
