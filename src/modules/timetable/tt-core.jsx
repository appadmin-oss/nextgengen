/* ============================================================================
   Timetable Maker v5 — the model.

   Pure functions only: no React, no DOM, no state. Everything the maker shows,
   prints or exports is computed from one Doc { s, entries, ex } by these, so
   the screen, the poster, the calendar file and the tests all read the same
   arithmetic. tests/timetable-core.test.js loads this file on its own and
   holds the rules the handoff marks MUST: the quick-add table, freeSlot,
   fixing by splitting, the planner, folding, the calendar file, now/next.

   Every file is concatenated with every other (CLAUDE.md §1), so every
   top-level name here starts with `tt` / `TT_`.
   ========================================================================== */

const TT_DAYS = [[1, "Monday", "Mon"], [2, "Tuesday", "Tue"], [3, "Wednesday", "Wed"], [4, "Thursday", "Thu"], [5, "Friday", "Fri"], [6, "Saturday", "Sat"], [7, "Sunday", "Sun"]];
const TT_COLOUR_NAMES = ["Blue", "Green", "Amber", "Rose", "Violet", "Orange", "Teal", "Grey"];
const TT_STORE = "ngg.timetable.maker.v2";
const TT_STORE_V1 = "ngg.timetable.maker.v1";
const TT_SUBJECTS = ["Mathematics", "English", "Basic Science", "Social Studies", "Civic Education", "Computer Studies", "French", "Yoruba", "Igbo", "Hausa", "PE", "Break", "Homework club", "Chess", "Coding", "Piano", "Public speaking", "Media Lab", "Guitar"];

/* The poster's colours (§9.2), exact. They are the printed page — data the
   visitor chose — so they live here and reach the poster as values. */
const TT_THEMES = {
  paper: { name: "Paper", bg: "#ffffff", ink: "#0a1130", ink2: "#5a6488", line: "#ebe7dc", dayBg: "#f5f2ea", accent: "#a07400", hiBg: "#0c1432", hiInk: "#ffffff", dot: "#8fb0ff", pal: ["#cfe0ff", "#cdeed8", "#fde7b0", "#fbd3e0", "#e2d8fb", "#ffd9bd", "#c4ecef", "#e3e6ec"] },
  navy: { name: "Midnight", bg: "#0c1432", ink: "#f4f6ff", ink2: "#b9c2e6", line: "rgba(255,255,255,0.14)", dayBg: "rgba(255,255,255,0.06)", accent: "#f5b026", hiBg: "#f5b026", hiInk: "#0c1432", dot: "#f5b026", pal: ["#8fb0ff", "#6fdcab", "#ffd166", "#ff9fbd", "#bfa9ff", "#ffb27a", "#6fdee3", "#b6bfd1"] },
  kente: { name: "Kente", bg: "#fffaf0", ink: "#1f2a1a", ink2: "#56604c", line: "#efe3c8", dayBg: "#f7eed8", accent: "#14532d", hiBg: "#14532d", hiInk: "#fff7df", dot: "#d4a017", stripes: ["#d4a017", "#14532d", "#b91c1c", "#111111"], pal: ["#b7d0f5", "#b9e2b0", "#f7d774", "#f4b6a6", "#d6c3ec", "#f5bf85", "#a9dfd6", "#ddd4c0"] },
  chalk: { name: "Chalkboard", bg: "#1f3a2c", ink: "#f2f5ee", ink2: "#c8d3c2", line: "rgba(242,245,238,0.16)", dayBg: "rgba(242,245,238,0.07)", accent: "#ffe58a", hiBg: "#ffe58a", hiInk: "#1f3a2c", dot: "#ffe58a", pal: ["#a9cbff", "#b0e8bf", "#ffe58a", "#ffbfcb", "#d8c8ff", "#ffc9a1", "#a6e6e0", "#d8dcd2"] },
};
const TT_THEME_IDS = ["paper", "navy", "kente", "chalk"];

/* The poster's styles (§8.9): type, block shape, day heads, rules and ground. */
const TT_LOOKS = {
  classic:   { name: "Classic",   sample: "Rounded blocks, bold sans",   disp: "'Sora', sans-serif",          body: "'Sora', sans-serif",    tw: 800, ts: 1,   tt: "none",      tls: "-0.035em", r: 10, headR: 12, cardR: 16, dash: false, italicHead: false, families: ["Sora"] },
  bold:      { name: "Bold",      sample: "Heavy outlines, poster type", disp: "'Archivo Black', sans-serif", body: "'Archivo', sans-serif", tw: 400, ts: 1,   tt: "uppercase", tls: "-0.01em",  r: 3,  headR: 3,  cardR: 4,  dash: false, italicHead: false, families: ["Archivo Black", "Archivo"] },
  minimal:   { name: "Minimal",   sample: "Outlines and lots of air",    disp: "'Inter', sans-serif",         body: "'Inter', sans-serif",   tw: 600, ts: 1,   tt: "none",      tls: "-0.04em",  r: 8,  headR: 0,  cardR: 10, dash: true,  italicHead: false, families: ["Inter"] },
  notebook:  { name: "Notebook",  sample: "Handwritten on ruled paper",  disp: "'Caveat', cursive",           body: "'Kalam', cursive",      tw: 700, ts: 1.3, tt: "none",      tls: "0",        r: 4,  headR: 0,  cardR: 4,  dash: false, italicHead: false, families: ["Caveat", "Kalam"] },
  editorial: { name: "Editorial", sample: "Serif headings, fine rules",  disp: "'Instrument Serif', serif",   body: "'Inter', sans-serif",   tw: 400, ts: 1.2, tt: "none",      tls: "-0.02em",  r: 0,  headR: 0,  cardR: 0,  dash: false, italicHead: true,  families: ["Instrument Serif", "Inter"] },
};
const TT_LOOK_IDS = ["classic", "bold", "minimal", "notebook", "editorial"];

const TT_KINDS = { class: ["Class", "book-open"], study: ["Study", "pencil-simple-line"], activity: ["Activity", "person-simple-run"], break: ["Break", "coffee"] };
const TT_KIND_IDS = ["class", "study", "activity", "break"];
const TT_KIND_GROUPS = { class: "Classes", study: "Study", activity: "Activities", break: "Breaks" };

/* "What's your week like?" (§7.1), verbatim. */
const TT_MODES = {
  school:   { label: "School", icon: "backpack", sub: "Lessons on weekdays, maybe NGG on Saturday", len: 40, example: "Maths Mon Wed 8–8:40 Room 4", chips: ["Mathematics", "English", "Basic Science", "Social Studies", "Computer Studies", "French", "PE", "Break"], title: "My school week" },
  uni:      { label: "University", icon: "graduation-cap", sub: "Lectures, labs and tutorials", len: 60, example: "MTH 201 lecture Tue Thu 10–12 in LT2", chips: ["Lecture", "Tutorial", "Lab", "Group study", "Library"], title: "My semester" },
  revision: { label: "Exam revision", icon: "exam", sub: "Plan study around what’s fixed", len: 45, example: "Past questions Sat 9–11am", chips: ["Past questions", "Read notes", "Mock test", "Revise Mathematics"], title: "Revision plan" },
  routine:  { label: "Activities & routines", icon: "sneaker-move", sub: "Clubs, sport, chores, worship", len: 60, example: "Football Tue Thu 4–5:30pm at the field", chips: ["Football", "Piano", "Homework", "Chores", "Church", "Jumu’ah", "Gym"], title: "My routine" },
};
const TT_MODE_IDS = ["school", "uni", "revision", "routine"];

const TT_DEFAULTS = { title: "My week", subtitle: "", theme: "paper", look: "classic", layout: "timeline", orient: "auto", clock: "24", weekStart: 1,
  showPlace: true, legend: true, large: false, hideBreaks: false, fold: true, note: "", mode: null };

/* ── Time ─────────────────────────────────────────────────────────────── */

/** "HH:MM" → minutes, or null. */
function ttMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
function ttHhmm(mins) { return String(Math.floor(mins / 60) % 24).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0"); }
/** Minutes for people: "14:00", or "2pm" / "2:30pm" on the 12-hour clock. */
function ttFmt(mins, clock) {
  const h = Math.floor(mins / 60) % 24, mi = mins % 60;
  if (clock === "12") return (h % 12 || 12) + (mi ? ":" + String(mi).padStart(2, "0") : "") + (h < 12 ? "am" : "pm");
  return String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
}
function ttDur(m) { return m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + " min"; }
function ttLen(e) { return ttMin(e.end) - ttMin(e.start); }

/** One time as somebody writes it — "8", "8:30", "8.30", "4pm", "12am" — → "HH:MM", or null. */
function ttParseTime(cell) {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(String(cell || "").trim());
  if (!m) return null;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0, ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h > 23 || mi > 59 ? null : ttHhmm(h * 60 + mi);
}

/** A hex colour lightened (f > 0) or darkened (f < 0). Anything that is not #rrggbb comes back unchanged. */
function ttShade(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return "#" + [n >> 16 & 255, n >> 8 & 255, n & 255]
    .map(x => Math.max(0, Math.min(255, Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f))))
    .map(x => x.toString(16).padStart(2, "0")).join("");
}

function ttUid() { return "e" + Math.random().toString(36).slice(2, 9); }

/** An entry's type: what it says, else a guess from its title (§7.2 step 8). */
function ttKindOf(e) {
  if (e && TT_KINDS[e.kind]) return e.kind;
  const t = String((e && e.title) || "").toLowerCase();
  if (/break|lunch/.test(t)) return "break";
  if (/football|sport|gym|piano|guitar|chess|club|church|mosque|jum|chore|choir|swim|dance/.test(t)) return "activity";
  if (/study|revis|homework|past question|read|mock/.test(t)) return "study";
  return "class";
}

function ttDayOrder(weekStart) { return weekStart === 7 ? [TT_DAYS[6]].concat(TT_DAYS.slice(0, 6)) : TT_DAYS; }

/** Every pair sharing a weekday and a minute: { [id]: [{ t: otherTitle, ds: sharedDays }] }. */
function ttOverlaps(entries) {
  const out = {};
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], b = entries[j];
    const ds = a.days.filter(d => b.days.includes(d));
    if (ds.length && ttMin(a.start) < ttMin(b.end) && ttMin(b.start) < ttMin(a.end)) {
      (out[a.id] = out[a.id] || []).push({ t: b.title, ds });
      (out[b.id] = out[b.id] || []).push({ t: a.title, ds });
    }
  }
  return out;
}

/**
 * Side-by-side lanes for overlapping items {s, e} (§8.4): sorted by start then
 * end, each takes the first free lane, a cluster ends when the next start
 * reaches the cluster's end, and n is the number of lanes in its cluster.
 */
function ttLanes(items) {
  const sorted = items.slice().sort((a, b) => a.s - b.s || a.e - b.e);
  const out = [];
  let cluster = [], end = -1, laneEnds = [];
  const flush = () => { cluster.forEach(x => { x.n = laneEnds.length || 1; out.push(x); }); cluster = []; laneEnds = []; };
  sorted.forEach(it => {
    if (it.s >= end && cluster.length) flush();
    let l = laneEnds.findIndex(z => z <= it.s);
    if (l === -1) { l = laneEnds.length; laneEnds.push(it.e); } else laneEnds[l] = it.e;
    it.lane = l; cluster.push(it); end = Math.max(end, it.e);
  });
  flush();
  return out;
}

/** The days and hours the poster shows (§8.3): days in use (Mon–Fri when empty), whole hours, at least two. */
function ttFrame(entries, weekStart) {
  const used = new Set();
  entries.forEach(e => e.days.forEach(d => used.add(d)));
  if (!entries.length) [1, 2, 3, 4, 5].forEach(d => used.add(d));
  const days = ttDayOrder(weekStart).filter(d => used.has(d[0]));
  let from = 8 * 60, to = 16 * 60;
  if (entries.length) {
    from = Math.floor(Math.min(...entries.map(e => ttMin(e.start))) / 60) * 60;
    to = Math.ceil(Math.max(...entries.map(e => ttMin(e.end))) / 60) * 60;
  }
  return { days, from, to: Math.max(to, from + 120) };
}
/** Auto picks landscape for four or more days, portrait below that (§8.1). */
function ttOrientFor(orient, entries, weekStart) {
  if (orient === "landscape" || orient === "portrait") return orient;
  return ttFrame(entries, weekStart).days.length >= 4 ? "landscape" : "portrait";
}

/**
 * The earliest start for `len` minutes on day d between from and to, on a
 * 5-minute grid, around everything already there (and `extra`), ignoring one
 * entry by id. null when nothing fits.
 */
function ttFreeSlot(entries, d, len, from, to, extra, ignoreId) {
  const busy = entries.concat(extra || []).filter(e => e.id !== ignoreId && e.days.includes(d))
    .map(e => [ttMin(e.start), ttMin(e.end)]).sort((a, b) => a[0] - b[0]);
  let s = from;
  for (const [a, z] of busy) {
    if (s + len <= a) break;
    if (z > s) s = Math.ceil(z / 5) * 5;
  }
  return s + len <= to ? s : null;
}

/**
 * The one-tap fix for an overlap on day d (§7.5): the earliest free slot of the
 * same length from the entry's own start, ending by 22:00. An entry on one day
 * moves; one that repeats is split, so its other days keep their time. Official
 * entries are the centre's and never move. → { start, apply(list, newId) } or null.
 */
function ttFixFor(entries, e, d) {
  if (e.official) return null;
  const len = ttLen(e);
  const s = ttFreeSlot(entries, d, len, ttMin(e.start), 22 * 60, [], e.id);
  if (s === null) return null;
  return {
    start: s,
    apply: (list, newId) => {
      const moved = Object.assign({}, e, { start: ttHhmm(s), end: ttHhmm(s + len) });
      if (e.days.length === 1) return list.map(x => x.id === e.id ? moved : x);
      moved.id = newId || ttUid();
      moved.days = [d];
      return list.map(x => x.id === e.id ? Object.assign({}, x, { days: x.days.filter(y => y !== d) }) : x).concat([moved]);
    },
  };
}

/* ── Weeks and their changes (§7.4) ───────────────────────────────────── */

/** The local Monday `off` weeks from now, anchored at noon so a clock change cannot move the date. */
function ttMonday(off, now) {
  const d = now ? new Date(now) : new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() || 7) - 1) + 7 * (off || 0));
  return d;
}
function ttDateFor(day, off, now) { const m = ttMonday(off, now); m.setDate(m.getDate() + day - 1); return m; }
function ttYmd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function ttWeekKey(off, now) { return ttYmd(ttMonday(off, now)); }
/** "Mon 5 Oct". */
function ttDshort(dt) { return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", ""); }
/** One week's changes, never undefined. */
function ttWeekEx(ex, off, now) { const x = (ex || {})[ttWeekKey(off, now)] || {}; return { skip: x.skip || {}, once: x.once || [] }; }
/** ex with one week's changes replaced by fn(copy); an emptied week is removed. */
function ttWithWeek(ex, off, fn, now) {
  const k = ttWeekKey(off, now), cur = (ex || {})[k] || {};
  const next = fn({ skip: Object.assign({}, cur.skip || {}), once: (cur.once || []).slice() });
  const out = Object.assign({}, ex);
  if (!Object.keys(next.skip).length && !next.once.length) delete out[k]; else out[k] = next;
  return out;
}

/** What is actually on a day of a given week: weekly entries not skipped, plus that week's one-offs. */
function ttOnDay(entries, ex, d, off, now) {
  const w = ttWeekEx(ex, off, now);
  return entries.filter(e => e.days.includes(d) && !w.skip[e.id + ":" + d]).concat(w.once.filter(e => e.days.includes(d)));
}

/**
 * Now and next (§7.14), honouring skips and one-offs, looking up to 8 days
 * ahead and across into later weeks. → { now: entry|null, next: {e, k, d}|null }
 * where k is days from today.
 */
function ttNowNext(entries, ex, now) {
  const t = now ? new Date(now) : new Date();
  const day = t.getDay() || 7, mins = t.getHours() * 60 + t.getMinutes();
  const cur = ttOnDay(entries, ex, day, 0, t).find(e => ttMin(e.start) <= mins && ttMin(e.end) > mins) || null;
  let next = null;
  for (let k = 0; k < 8 && !next; k++) {
    const d = ((day - 1 + k) % 7) + 1, off = Math.floor((day - 1 + k) / 7);
    const c = ttOnDay(entries, ex, d, off, t).filter(e => k > 0 || ttMin(e.start) > mins).sort((a, b) => ttMin(a.start) - ttMin(b.start))[0];
    if (c) next = { e: c, k, d };
  }
  return { now: cur, next };
}

/* ── Quick add (§7.2) ─────────────────────────────────────────────────── */

const TT_DAY_WORDS = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7 };

/**
 * A line typed the way somebody says it → { e, guessed, hadAmPm }, or null when
 * nothing names it. ctx: { entries, mode, defDay, today } with days 1..7.
 *
 * The steps run in the specification's order and the order matters: the time
 * range is taken before the days, so "Mon 8-9" never reads 8 as a day, and a
 * bare number is never a time, so "Room 4" stays a place.
 */
function ttQuick(text, ctx) {
  let t = " " + String(text || "") + " ";
  if (!t.trim()) return null;
  const entries = ctx.entries || [], today = ctx.today || 1;
  const out = {};
  const hadAmPm = /\d\s*(am|pm)\b/i.test(t);
  // 1. One-off words.
  if (/\b(this week( only)?|just once|once|one-?off)\b/i.test(t)) { out.once = true; t = t.replace(/\b(this week( only)?|just once|once|one-?off)\b/ig, " "); }
  // 2. A time range; am/pm on the end only is copied to the start, unless that would run backwards.
  const T = "(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?)";
  const tr = new RegExp("\\b" + T + "\\s*(?:-|–|—|to|until)\\s*" + T + "(?![\\w])", "i").exec(t);
  if (tr) {
    let a = tr[1].replace(/\s+/g, ""), b = tr[2].replace(/\s+/g, "");
    const ap = /(am|pm)$/i.exec(b);
    if (ap && !/(am|pm)$/i.test(a)) {
      const ha = parseInt(a, 10), hb = parseInt(b, 10);
      a += (ap[1].toLowerCase() === "pm" && ha > hb && hb !== 12) ? "am" : ap[1];
    }
    const A = ttParseTime(a), B = ttParseTime(b);
    if (A && B && ttMin(B) > ttMin(A)) { out.start = A; out.end = B; t = t.replace(tr[0], " "); }
  }
  // 3. A single time, only with minutes or am/pm.
  if (!out.start) {
    const one = /\b(?:at\s+)?(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))(?![\w])/i.exec(t);
    if (one) { const A = ttParseTime(one[1].replace(/\s+/g, "")); if (A) { out.start = A; t = t.replace(one[0], " "); } }
  }
  // 4. A duration.
  const du = /\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?)\b/i.exec(t);
  if (du) { out.len = Math.round(+du[1] * (/^h/i.test(du[2]) ? 60 : 1)); t = t.replace(du[0], " "); }
  // 5. Days, then the filler words around them.
  const days = new Set(), add = a => a.forEach(x => days.add(x));
  t = t.replace(/\b(weekdays|mon(day)?\s*(?:-|–|to)\s*fri(day)?)\b/ig, () => { add([1, 2, 3, 4, 5]); return " "; });
  t = t.replace(/\bweekends?\b/ig, () => { add([6, 7]); return " "; });
  t = t.replace(/\b(daily|every\s?day)\b/ig, () => { add([1, 2, 3, 4, 5, 6, 7]); return " "; });
  t = t.replace(/\b(today|tomorrow)\b/ig, m => { days.add(/^today$/i.test(m) ? today : today % 7 + 1); return " "; });
  t = t.replace(/\b(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)s?\b/ig, m => {
    const k = m.toLowerCase(), v = TT_DAY_WORDS[k] || TT_DAY_WORDS[k.replace(/s$/, "")];
    if (v) days.add(v);
    return " ";
  });
  t = t.replace(/\b(every|on|and|from)\b/ig, " ");
  // 6. A place: after a final in / at / @, else a word that is always a place.
  let place = "";
  const pl = /\s(?:in|at|@)\s+(.+?)\s*$/i.exec(t);
  if (pl) { place = pl[1]; t = t.slice(0, pl.index) + " "; }
  else { const r = /\b(room\s*\w+|lt\s?\d+|lab|field|library|hall|ict room|pitch|court)\b/i.exec(t); if (r) { place = r[1]; t = t.replace(r[0], " "); } }
  // 7. The title is what is left.
  let title = t.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (!title) return null;
  title = (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 60);
  place = place.replace(/\s+/g, " ").trim();
  if (place) place = place.charAt(0).toUpperCase() + place.slice(1);
  // 8–12. Type, length, days, start and inheritance.
  const known = entries.find(x => x.title.toLowerCase() === title.toLowerCase());
  const kind = known ? ttKindOf(known) : ttKindOf({ title });
  const mode = TT_MODES[ctx.mode] || TT_MODES.school;
  const len = out.end ? ttMin(out.end) - ttMin(out.start) : (out.len || (known ? ttLen(known) : kind === "break" ? 30 : mode.len));
  const dl = days.size ? [...days].sort((a, b) => a - b) : [ctx.defDay || today];
  let start = out.start ? ttMin(out.start) : null, guessed = false;
  if (start === null) {
    const from = kind === "study" || kind === "activity" ? 16 * 60 : 8 * 60;
    start = ttFreeSlot(entries, dl[0], len, from, 22 * 60);
    if (start === null) start = from;
    guessed = true;
  }
  return {
    guessed, hadAmPm,
    e: { id: "", title, days: out.once ? [dl[0]] : dl, start: ttHhmm(start), end: ttHhmm(Math.min(start + len, 1439)), place: place || (known ? known.place : ""),
         color: known ? known.color : entries.length % 8, kind, once: !!out.once },
  };
}

/* ── Paste import (§7.7) ──────────────────────────────────────────────── */

/** "Mon, Wed", "Tue-Thu", "monday and friday" → [1..7], or null. */
function ttParseDays(cell) {
  const s = String(cell || "").toLowerCase().replace(/\./g, "").trim();
  const r = /^([a-z]+)\s*(?:-|–|to)\s*([a-z]+)$/.exec(s);
  if (r && TT_DAY_WORDS[r[1]] && TT_DAY_WORDS[r[2]]) {
    const out = [];
    let d = TT_DAY_WORDS[r[1]];
    for (let i = 0; i < 7; i++) { out.push(d); if (d === TT_DAY_WORDS[r[2]]) break; d = d % 7 + 1; }
    return out;
  }
  const parts = s.split(/[\s,/&]+|\band\b/).filter(Boolean);
  return parts.length && parts.every(x => TT_DAY_WORDS[x]) ? [...new Set(parts.map(x => TT_DAY_WORDS[x]))].sort((a, b) => a - b) : null;
}

/**
 * Lines from a spreadsheet or a message → { rows, skipped }. A line splits on
 * a tab, ";", a comma before a digit, or two spaces; its cells are read in any
 * order (days, times, then the name, then the room). A line that cannot be
 * read is named with its reason, never dropped quietly.
 */
function ttParseRows(text, startColour) {
  const rows = [], skipped = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/\t|;|,(?=\s*\d)|\s{2,}/).map(c => c.trim()).filter(Boolean);
    let days = null;
    const times = [], texts = [];
    cells.forEach(c => {
      const rg = /^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i.exec(c);
      const a = rg && ttParseTime(rg[1]), b = rg && ttParseTime(rg[2]);
      if (a && b) { times.push(a, b); return; }
      const one = ttParseTime(c);
      if (one) { times.push(one); return; }
      if (!days) { const d = ttParseDays(c); if (d) { days = d; return; } }
      const m = /^([a-z ,&/.-]+?)\s+(.+)$/i.exec(c);
      if (!days && m && ttParseDays(m[1])) {
        days = ttParseDays(m[1]);
        const rest = m[2], rg2 = /^(.+?)\s*(?:-|–|to)\s*(\S+)(.*)$/i.exec(rest);
        if (rg2 && ttParseTime(rg2[1]) && ttParseTime(rg2[2])) { times.push(ttParseTime(rg2[1]), ttParseTime(rg2[2])); if (rg2[3].trim()) texts.push(rg2[3].trim()); }
        else texts.push(rest);
        return;
      }
      texts.push(c);
    });
    const why = !days ? "no day" : times.length < 2 ? "needs a start and end time" : ttMin(times[1]) <= ttMin(times[0]) ? "ends before it starts" : !texts.length ? "no class name" : "";
    if (why) { skipped.push("line " + (i + 1) + ": " + why); return; }
    rows.push({ id: ttUid(), title: texts[0].slice(0, 60), days, start: times[0], end: times[1], place: (texts[1] || "").slice(0, 60),
      color: ((startColour || 0) + rows.length) % 8, kind: ttKindOf({ title: texts[0] }) });
  });
  return { rows, skipped };
}

/* ── Study planner (§7.6) ─────────────────────────────────────────────── */

const TT_PLAN_WINDOWS = { after: [[1, 2, 3, 4, 5], 16 * 60, 20 * 60], evening: [[1, 2, 3, 4, 5], 18 * 60, 21 * 60], weekend: [[6, 7], 9 * 60, 13 * 60] };

/** Subjects to offer: the visitor's classes ranked by minutes a week (top 8), or four defaults. */
function ttSubjectPool(entries) {
  const m = {};
  entries.filter(e => ttKindOf(e) === "class").forEach(e => { m[e.title] = (m[e.title] || 0) + ttLen(e) * e.days.length; });
  const l = Object.keys(m).sort((a, b) => m[b] - m[a]);
  return l.length ? l.slice(0, 8) : ["Mathematics", "English", "Basic Science", "Social Studies"];
}

/**
 * Sessions placed in free time. Session i starts looking on day
 * floor(i·days/per) of the window and walks forward until a slot fits; its
 * subject is subjects[i % n]. plan: { subjects, per, len, win } → entries.
 */
function ttPlanStudy(entries, plan) {
  const subs = plan.subjects || [], out = [];
  if (!subs.length) return out;
  const win = TT_PLAN_WINDOWS[plan.win] || TT_PLAN_WINDOWS.after, days = win[0];
  for (let i = 0; i < plan.per; i++) {
    const startIdx = Math.floor(i * days.length / plan.per);
    for (let j = 0; j < days.length; j++) {
      const d = days[(startIdx + j) % days.length];
      const s = ttFreeSlot(entries, d, plan.len, win[1], win[2], out);
      if (s !== null) {
        const sub = subs[i % subs.length], src = entries.find(e => e.title === sub);
        out.push({ id: ttUid(), title: "Study: " + sub, days: [d], start: ttHhmm(s), end: ttHhmm(s + plan.len), place: "Home", color: src ? src.color : 7, kind: "study" });
        break;
      }
    }
  }
  return out;
}

/** Whether to suggest planning study (§7.6), and on how many weekdays there is a free hour after 4pm. */
function ttStudyHint(entries, mode) {
  const study = entries.filter(e => ttKindOf(e) === "study").length;
  let freeDays = 0;
  for (let d = 1; d <= 5; d++) {
    if (!entries.some(e => e.days.includes(d))) continue;
    if (ttFreeSlot(entries, d, 60, 16 * 60, 20 * 60) !== null) freeDays++;
  }
  const show = (mode === "revision" && study === 0) || (entries.length > 3 && study === 0 && freeDays >= 2);
  return { show, freeDays };
}

/* ── Sharing and storage ──────────────────────────────────────────────── */

function ttSlug(title) {
  return String(title || "timetable").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "timetable";
}
function ttB64Encode(json) { return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function ttB64Decode(str) { return decodeURIComponent(escape(atob(String(str).replace(/-/g, "+").replace(/_/g, "/")))); }

/** The share link's payload (§7.8): settings and entries, ids removed, and who shared it. */
function ttEncode(doc, sharedBy) {
  const body = { s: doc.s, e: doc.entries.map(({ id, ...rest }) => rest) };
  if (sharedBy) body.sharedBy = String(sharedBy).slice(0, 60);
  return ttB64Encode(JSON.stringify(body));
}
/** A #t= payload, v5 ({s, e}) or v1 ({settings, entries}) → { doc, sharedBy }, or null. */
function ttDecode(str) {
  try {
    const raw = JSON.parse(ttB64Decode(str));
    if (raw && raw.settings) return { doc: ttFromV1(raw), sharedBy: "" };
    return { doc: ttClean({ s: raw.s, entries: raw.e, ex: {} }), sharedBy: typeof raw.sharedBy === "string" ? raw.sharedBy.slice(0, 60) : "" };
  } catch (_) { return null; }
}

/* v1's settings, read into v5's: its four templates map onto the four themes. */
const TT_V1_THEMES = { studio: "paper", midnight: "navy", kente: "kente", chalkboard: "chalk" };
function ttFromV1(raw) {
  const v = (raw && raw.settings) || {};
  return ttClean({
    s: { title: v.title, subtitle: v.subtitle, theme: TT_V1_THEMES[v.template] || "paper", clock: v.clock, weekStart: v.weekStart,
         showPlace: v.showPlace, large: v.large, note: v.note, orient: v.orient === "portrait" || v.orient === "landscape" ? v.orient : "auto", mode: "school" },
    entries: raw.entries, ex: {},
  });
}

/**
 * Anything from storage, a link or the server, made safe to use. A bad entry
 * is dropped, never repaired into a different entry; at most 120 entries and
 * 52 weeks of changes, the same limits the server holds.
 */
function ttClean(raw) {
  const r = raw || {}, v = Object.assign({}, TT_DEFAULTS, r.s || {});
  const s = {
    title: String(v.title || "My week").slice(0, 60), subtitle: String(v.subtitle || "").slice(0, 80),
    theme: TT_THEMES[v.theme] ? v.theme : "paper", look: TT_LOOKS[v.look] ? v.look : "classic",
    layout: v.layout === "list" ? "list" : "timeline", orient: ["auto", "landscape", "portrait"].includes(v.orient) ? v.orient : "auto",
    clock: String(v.clock) === "12" ? "12" : "24", weekStart: +v.weekStart === 7 ? 7 : 1,
    showPlace: v.showPlace !== false, legend: v.legend !== false, large: !!v.large, hideBreaks: !!v.hideBreaks, fold: v.fold !== false,
    note: String(v.note || "").slice(0, 120), mode: TT_MODES[v.mode] ? v.mode : null,
  };
  const entry = x => {
    if (!x || typeof x !== "object") return null;
    const e = {
      id: String(x.id || ttUid()).replace(/[^\w-]/g, "").slice(0, 16) || ttUid(), title: String(x.title || "").trim().slice(0, 60),
      days: [...new Set((Array.isArray(x.days) ? x.days : []).map(Number).filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b),
      start: String(x.start || ""), end: String(x.end || ""), place: String(x.place || "").trim().slice(0, 60),
      color: Math.max(0, Math.min(7, parseInt(x.color, 10) || 0)), kind: ttKindOf(x),
    };
    if (x.official) { e.official = true; e.source = String(x.source || "").slice(0, 40); e.mine = !!x.mine; }
    const a = ttMin(e.start), b = ttMin(e.end);
    return e.title && e.days.length && a !== null && b !== null && b > a ? e : null;
  };
  const entries = (Array.isArray(r.entries) ? r.entries : []).slice(0, 120).map(entry).filter(Boolean);
  const ex = {}, src = r.ex && typeof r.ex === "object" ? r.ex : {};
  Object.keys(src).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-52).forEach(k => {
    const w = src[k] || {}, skip = {};
    Object.keys(w.skip || {}).forEach(z => { if (w.skip[z] === true && /^[\w-]{1,16}:[1-7]$/.test(z)) skip[z] = true; });
    const once = (Array.isArray(w.once) ? w.once : []).slice(0, 40).map(entry).filter(Boolean).map(e => Object.assign(e, { once: true, days: [e.days[0]] }));
    if (Object.keys(skip).length || once.length) ex[k] = { skip, once };
  });
  return { s, entries, ex };
}

/* ── Calendar file (§7.8) ─────────────────────────────────────────────── */

/**
 * Every weekly entry as a weekly event in Lagos time, until the last day of
 * term, with an EXDATE for each skipped day; each one-off a single event with
 * no rule; a reminder on each when one is asked for.
 * opts: { from: 'YYYY-MM-DD', until: 'YYYY-MM-DD', remind: minutes, stamp }.
 */
function ttIcs(doc, opts) {
  const esc = x => String(x || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const ymd = d => ttYmd(d).replace(/-/g, "");
  const hm = m => String(Math.floor(m / 60)).padStart(2, "0") + String(m % 60).padStart(2, "0") + "00";
  const first = new Date(opts.from + "T12:00:00");
  const stamp = opts.stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const remind = +opts.remind || 0;
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Next Generation Genius//Timetable maker//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(doc.s.title), "X-WR-TIMEZONE:Africa/Lagos",
    "BEGIN:VTIMEZONE", "TZID:Africa/Lagos", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0100", "TZNAME:WAT", "END:STANDARD", "END:VTIMEZONE"];
  const alarm = title => { if (remind) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(title), "TRIGGER:-PT" + remind + "M", "END:VALARM"); };
  const weeks = Object.keys(doc.ex || {}).sort();
  doc.entries.forEach(e => e.days.forEach(d => {
    const f = new Date(first);
    f.setDate(f.getDate() + ((d % 7) - f.getDay() + 7) % 7);
    L.push("BEGIN:VEVENT", "UID:" + e.id + "-" + d + "@timetable.nextgengenius", "DTSTAMP:" + stamp,
      "DTSTART;TZID=Africa/Lagos:" + ymd(f) + "T" + hm(ttMin(e.start)), "DTEND;TZID=Africa/Lagos:" + ymd(f) + "T" + hm(ttMin(e.end)),
      "RRULE:FREQ=WEEKLY;UNTIL=" + opts.until.replace(/-/g, "") + "T225959Z", "SUMMARY:" + esc(e.title));
    weeks.forEach(k => {
      if (!(doc.ex[k].skip || {})[e.id + ":" + d]) return;
      const x = new Date(k + "T12:00:00");
      x.setDate(x.getDate() + d - 1);
      L.push("EXDATE;TZID=Africa/Lagos:" + ymd(x) + "T" + hm(ttMin(e.start)));
    });
    if (e.place) L.push("LOCATION:" + esc(e.place));
    alarm(e.title);
    L.push("END:VEVENT");
  }));
  weeks.forEach(k => (doc.ex[k].once || []).forEach(e => {
    const x = new Date(k + "T12:00:00");
    x.setDate(x.getDate() + e.days[0] - 1);
    L.push("BEGIN:VEVENT", "UID:" + e.id + "@timetable.nextgengenius", "DTSTAMP:" + stamp,
      "DTSTART;TZID=Africa/Lagos:" + ymd(x) + "T" + hm(ttMin(e.start)), "DTEND;TZID=Africa/Lagos:" + ymd(x) + "T" + hm(ttMin(e.end)), "SUMMARY:" + esc(e.title));
    if (e.place) L.push("LOCATION:" + esc(e.place));
    alarm(e.title);
    L.push("END:VEVENT");
  }));
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

/* ── Smart print options (§7.13) ──────────────────────────────────────── */

/** The longest run of empty hours on the frame, two hours or more, or null. */
function ttLongestGap(entries, fr) {
  if (!entries.length) return null;
  let best = null, run = null;
  for (let q = fr.from; q <= fr.to; q += 60) {
    const busy = q < fr.to && entries.some(e => ttMin(e.start) < q + 60 && ttMin(e.end) > q);
    if (!busy && q < fr.to) { if (!run) run = [q, q + 60]; else run[1] = q + 60; continue; }
    if (run && run[1] - run[0] >= 120 && (!best || run[1] - run[0] > best[1] - best[0])) best = run;
    run = null;
  }
  return best;
}

/**
 * Each print toggle's description, and whether it is suggested or cannot
 * apply, read from the timetable itself; the clock and week-start hint; and
 * the summary line. hadAmPm: the visitor typed am/pm in quick add.
 */
function ttPrintOptions(doc, orientNow, hadAmPm) {
  const s = doc.s, E = doc.entries, tl = s.layout === "timeline";
  const places = [...new Set(E.map(e => e.place).filter(Boolean))], noPlace = E.filter(e => !e.place && ttKindOf(e) !== "break").length;
  const slots = E.reduce((k, e) => k + e.days.length, 0);
  const shortN = E.filter(e => ttKindOf(e) !== "break" && ttLen(e) <= 30).reduce((k, e) => k + e.days.length, 0);
  const fr = ttFrame(E, s.weekStart);
  const titles = new Set(E.map(e => e.title)).size;
  const breaks = E.filter(e => ttKindOf(e) === "break").reduce((k, e) => k + e.days.length, 0);
  const gap = ttLongestGap(E, fr);
  const light = E.length > 0 && (fr.days.length <= 3 || slots <= 12);
  const rows = [
    { key: "showPlace", label: "Show rooms", disabled: !places.length,
      desc: !places.length ? "No rooms added yet" : noPlace ? places.length + " place" + (places.length === 1 ? "" : "s") + " · " + noPlace + " without one" : "Every class has a place",
      suggested: places.length > 0 && !s.showPlace },
    { key: "legend", label: "Key", disabled: !tl,
      desc: !tl ? "Only used on the Timeline layout" : shortN === 1 ? "1 short slot is too small for its details; the key lists it" : shortN > 1 ? shortN + " short slots are too small for their details; the key lists them" : titles + " things, each with days and room",
      suggested: tl && shortN >= 2 && !s.legend },
    { key: "large", label: "Larger text", disabled: false,
      desc: light ? "Your week is light, so bigger type still fits" : slots > 30 ? slots + " slots a week; larger text may crowd them" : "Easier to read from across a room",
      suggested: light && !s.large },
    { key: "fold", label: "Fold empty hours", disabled: !gap || !tl,
      desc: gap ? "Shrinks " + ttFmt(gap[0], s.clock) + "–" + ttFmt(gap[1], s.clock) + " so classes get " + Math.round((gap[1] - gap[0]) / (fr.to - fr.from) * 100) + "% more room" : "No long gaps to fold",
      suggested: !!gap && tl && !s.fold },
    { key: "hideBreaks", label: "Leave out breaks", disabled: !breaks,
      desc: breaks ? breaks + " break" + (breaks === 1 ? "" : "s") + " a week · kept here, left out of downloads" : "No breaks added",
      suggested: breaks >= 5 && !tl && !s.hideBreaks },
  ];
  rows.forEach(r => { if (r.disabled) r.suggested = false; });
  const sundayUsed = E.some(e => e.days.includes(7)), mondayUsed = E.some(e => e.days.includes(1));
  const clockSuggested = !!hadAmPm && s.clock !== "12";
  const weekSuggested = sundayUsed && !mondayUsed && s.weekStart !== 7;
  const hint = clockSuggested ? "You typed times with am/pm. 12-hour would match."
    : weekSuggested ? "Your week starts on Sunday. Starting there puts it first."
    : "Times print as " + (s.clock === "12" ? "2pm" : "14:00") + (sundayUsed ? "" : "; Sunday isn’t used, so week start only affects order");
  const suggestions = rows.filter(r => r.suggested);
  return {
    rows, suggestions, hint, hintSuggested: clockSuggested || weekSuggested, clockSuggested, weekSuggested,
    nApply: suggestions.length + (clockSuggested ? 1 : 0) + (weekSuggested ? 1 : 0),
    summary: "A4 " + orientNow + " · " + (tl ? "Timeline" : "List") + " · " + (s.clock === "12" ? "12-hour" : "24-hour"),
  };
}

/** All the suggestions at once, as the settings they produce. */
function ttApplySuggested(s, po) {
  const ns = Object.assign({}, s);
  po.suggestions.forEach(r => { ns[r.key] = true; });
  if (po.clockSuggested) ns.clock = "12";
  if (po.weekSuggested) ns.weekStart = 7;
  return ns;
}

/** Footer-note ideas built from the data (§7.13); one equal to the current note is not offered. */
function ttNoteIdeas(doc, termEnd) {
  const out = [], E = doc.entries;
  const sport = E.find(e => /^(pe|football|sport|swimming)/i.test(e.title));
  if (sport) out.push("Bring kit on " + sport.days.map(d => TT_DAYS[d - 1][1] + "s").join(" and "));
  if (termEnd) out.push("Term ends " + ttDshort(new Date(termEnd + "T12:00:00")));
  const off = E.filter(e => e.official);
  if (off.length) out.push("NGG " + off[0].source + " · " + ttFmt(Math.min(...off.map(e => ttMin(e.start))), doc.s.clock) + " on " + TT_DAYS[off[0].days[0] - 1][1] + "s");
  return out.filter(x => x !== doc.s.note);
}

/** The week's summary line: "21 classes a week · 18.5 h". */
function ttSummary(entries) {
  if (!entries.length) return "No classes yet";
  const n = entries.reduce((k, e) => k + e.days.length, 0), mins = entries.reduce((k, e) => k + ttLen(e) * e.days.length, 0);
  return n + " class" + (n === 1 ? "" : "es") + " a week · " + (Math.round(mins / 6) / 10) + " h";
}

/* ── Folding empty hours (§8.3) ───────────────────────────────────────── */

/**
 * The frame split into hour runs: busy where an entry touches the hour, and
 * every empty run of two hours or more folded to 36 minutes of drawing when
 * `fold` is on (and there is anything to make room for). pos(q) maps a minute
 * to its drawn position piece by piece, so positions keep their order and no
 * block can land inside a fold.
 */
function ttFoldMap(entries, frame, fold) {
  const runs = [];
  for (let q = frame.from; q < frame.to; q += 60) {
    const busy = entries.some(e => ttMin(e.start) < q + 60 && ttMin(e.end) > q);
    const last = runs[runs.length - 1];
    if (last && !busy && !last.busy) last.b = q + 60; else runs.push({ a: q, b: q + 60, busy });
  }
  runs.forEach(r => { r.folded = !!fold && entries.length > 0 && !r.busy && r.b - r.a >= 120; r.w = r.folded ? 36 : r.b - r.a; });
  const span = runs.reduce((k, r) => k + r.w, 0) || (frame.to - frame.from);
  const pos = q => {
    let acc = 0;
    for (const r of runs) {
      if (q <= r.a) break;
      if (q >= r.b) { acc += r.w; continue; }
      acc += r.folded ? r.w * (q - r.a) / (r.b - r.a) : q - r.a;
      break;
    }
    return acc;
  };
  const hours = new Set();
  runs.forEach(r => { if (r.folded) { hours.add(r.a); hours.add(r.b); } else for (let q = r.a; q <= r.b; q += 60) hours.add(q); });
  return { runs, span, pos, hours: [...hours].sort((x, y) => x - y) };
}
