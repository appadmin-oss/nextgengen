/* ============================================================================
   Control Room v2 — the learning tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   Curriculum: every lesson, and the import that writes them in bulk
   (domain/curriculum.php). An import is always CHECKED first — a dry run that
   says, row by row, what would be created, updated, left alone or refused —
   and the import itself sends back the check's digest, so the rows somebody
   read are the rows that are written. A bundled course (api/_lib/seeds) goes
   through exactly the same check. The rows travel as one value (api-client
   importRows) because this host's firewall refuses a body of thousands.
   ========================================================================== */

function crCurParseCsv(text, asGrid) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  /* Excel saves "CSV" with semicolons where the comma is the decimal mark, and
     some sheets are pasted as tabs. The header line says which. */
  /* Read from the first ten lines, not the first: a register often opens with
     a title line ("EGBEDA FINES — TERM 1") that has no separators at all. */
  const head10 = s.split(/\r?\n/, 10);
  const cnt = (ch) => Math.max(0, ...head10.map(l => l.split(ch).length - 1));
  const sep = cnt(",") >= cnt(";") && cnt(",") >= cnt("\t") ? "," : (cnt(";") >= cnt("\t") ? ";" : "\t");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => String(c).trim() !== ""));
  // As a grid, every line keeps its place (blank ones empty), so row numbers are the sheet's own.
  if (asGrid) return rows.map(r => r.map(c => String(c).trim()));
  if (!clean.length) return [];
  const head = clean[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  return clean.slice(1).map(r => { const o = {}; head.forEach((h, k) => { o[h] = (r[k] ?? "").trim(); }); return o; });
}

/* Every sheet of a workbook as a grid of trimmed strings, in the workbook's
   own order: [{ name, grid }]. A register kept one sheet per centre or per
   term is one file, not five. */
async function crCurXlsxGrids(buf) {
  const JSZip = await loadVendor("jszip");
  const zip = await JSZip.loadAsync(buf);
  const xml = async (p) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null; };
  const shared = [];
  const ss = await xml("xl/sharedStrings.xml");
  if (ss) Array.from(ss.getElementsByTagName("si")).forEach(si => shared.push(Array.from(si.getElementsByTagName("t")).map(t => t.textContent).join("")));
  const wb = await xml("xl/workbook.xml"), rels = await xml("xl/_rels/workbook.xml.rels");
  const sheets = wb ? Array.from(wb.getElementsByTagName("sheet")) : [];
  const pathOf = sh => {
    const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = rels && Array.from(rels.getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === rid);
    if (!rel) return null;
    const t = rel.getAttribute("Target").replace(/^\//, ""); return t.startsWith("xl/") ? t : "xl/" + t;
  };
  const list = sheets.length ? sheets.map(sh => ({ name: sh.getAttribute("name") || "", path: pathOf(sh) })).filter(x => x.path) : [{ name: "Sheet1", path: "xl/worksheets/sheet1.xml" }];
  const colIdx = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const out = [];
  for (const it of list) {
    const sheet = await xml(it.path);
    if (!sheet) continue;
    /* Rows sit at their REAL row numbers (an empty row stays an empty array),
       so "row 14" on screen is row 14 in the spreadsheet the person has open. */
    const grid = [];
    Array.from(sheet.getElementsByTagName("row")).forEach((r, k) => {
      const at = Math.max(0, (parseInt(r.getAttribute("r"), 10) || (k + 1)) - 1);
      const row = [];
      Array.from(r.getElementsByTagName("c")).forEach(c => {
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
        let val = "";
        if (t === "s") val = shared[+((v && v.textContent) || 0)] || "";
        else if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map(x => x.textContent).join("");
        else val = v ? v.textContent : "";
        row[colIdx(c.getAttribute("r"))] = String(val).trim();
      });
      grid[at] = Array.from(row, x => x || "");
    });
    out.push({ name: it.name, grid: Array.from(grid, r => r || []) });
  }
  if (!out.length) throw new Error("That workbook has no sheet I can read.");
  return out;
}
/* The first sheet, its first row taken as the headings (the curriculum import's shape). */
async function crCurXlsxRows(buf) {
  const grid = (await crCurXlsxGrids(buf))[0].grid.filter(r => r.some(x => x !== ""));
  if (!grid.length) return [];
  const head = grid[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  return grid.slice(1).map(r => { const o = {}; head.forEach((h, k) => { if (h) o[h] = (r[k] ?? "").trim(); }); return o; });
}

function crCurRowFromSheet(r) {
  const pick = (...ks) => { for (const k of ks) if (r[k] !== undefined && r[k] !== "") return r[k]; return ""; };
  const checks = [];
  for (let n = 1; n <= 10; n++) {
    const prompt = pick("check" + n, "q" + n, "question" + n, "check_" + n);
    if (!prompt) continue;
    const opts = pick("check" + n + "_options", "q" + n + "_options", "question" + n + "_options");
    checks.push({ prompt, kind: opts ? "mcq" : "short", options: opts ? opts.split("|").map(x => x.trim()).filter(Boolean) : [],
      answer: pick("check" + n + "_answer", "q" + n + "_answer", "question" + n + "_answer"),
      rubric: pick("check" + n + "_rubric", "q" + n + "_rubric"), points: Number(pick("check" + n + "_points", "q" + n + "_points")) || 1 });
  }
  const mats = pick("materials", "material", "material_url", "materials_urls");
  return {
    course: pick("course", "subject"), level: pick("level", "stage"), week: Number(pick("week")) || 1,
    position: Number(pick("position", "order", "lesson_no", "lesson_number")) || 1,
    title: pick("title", "lesson", "lesson_title", "topic"), summary: pick("summary", "overview"),
    objectives: pick("objectives", "learning_objectives", "outcomes"), body: pick("body", "content", "notes", "lesson_notes"),
    durationMins: Number(pick("duration", "duration_mins", "minutes")) || 0, passMark: pick("pass_mark", "passmark") === "" ? undefined : Number(pick("pass_mark", "passmark")),
    materials: mats ? mats.split(/\s*;;\s*|\n/).filter(Boolean).map(x => { const [url, title] = x.split("|").map(y => y.trim()); return { url, title: title || "" }; }) : [],
    checks,
  };
}

const CR_CUR_TEMPLATE = "course,level,week,position,title,summary,objectives,body,duration,materials,check1,check1_options,check1_answer,check2,check2_answer,check2_rubric\n"
  + "Piano,Foundation,1,1,Finding middle C,Where the keyboard starts.,Find middle C; Play C major,\"Middle C sits in the centre of the keyboard.\n\n- Find the two black keys\n- C is just left of them\",30,https://example.org/c-major.pdf|Scale sheet,How many white keys in an octave?,5|7|8,7,Why curve your fingers?,Control and speed,Mentions control or speed\n";

const CR_CUR_STATUS = { draft: ["Draft", "neutral"], published: ["Published", "ok"], retired: ["Retired", "bad"] };
const CR_CUR_VERDICT = { create: ["New", "ok"], update: ["Updated", "gold"], unchanged: ["Unchanged", "neutral"], failed: ["Refused", "bad"] };

/** A chosen file → lesson rows in the editor's shape: JSON as written, CSV or .xlsx through the sheet mapper. */
async function crCurReadFile(file) {
  if (/\.xlsx$/i.test(file.name)) return (await crCurXlsxRows(await file.arrayBuffer())).map(crCurRowFromSheet);
  if (/\.(xls|numbers|pdf|docx?)$/i.test(file.name)) throw Object.assign(new Error("bad_file"), { data: { message: "That file type can’t be read here. In Excel or Google Sheets choose File → Download → CSV, or save as .xlsx." } });
  const text = await file.text();
  if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(text)) {
    let j;
    try { j = JSON.parse(text); } catch (_) { throw Object.assign(new Error("bad_json"), { data: { message: "That JSON file could not be read. Check it opens in a text editor." } }); }
    const rows = Array.isArray(j) ? j : (j.units || j.lessons || []);
    /* A programme file that says its courses are new (a bundled course's own
       shape: { allowNewCourse: true, lessons: [...] }) is believed, as a
       bundled course is — otherwise every row of it is refused. */
    if (!Array.isArray(j) && j && j.allowNewCourse) rows.allowNewCourse = true;
    return rows;
  }
  return crCurParseCsv(text).map(crCurRowFromSheet);
}

function crCurImport(ctx) {
  const d = ctx.data || {}, seeds = d.seeds || [];
  ctx.form({
    title: "Import lessons", submit: "Check the lessons", busyLabel: "Checking…",
    intro: "Lessons are matched on course, level, week and position, so a corrected file updates them instead of adding copies. Nothing is written until you have read the check and pressed Import.",
    values: { source: seeds.length ? "seed" : "file", seed: seeds.length === 1 ? seeds[0].key : "", publish: false, allowNewCourse: false },
    fields: [
      seeds.length ? { id: "source", l: "From", type: "chips", req: true, opts: [["seed", "A bundled course"], ["file", "A file"]] } : null,
      { id: "seed", l: "Course", type: "select", req: true, opts: seeds.map(s => [s.key, s.title + " · " + crPlural(s.lessons, "lesson")]), when: v => v.source === "seed" },
      { id: "file", l: "File", type: "file", req: true, accept: ".csv,.json,.xlsx,text/csv,application/json", help: "CSV, Excel (.xlsx) or JSON. Download the template from the header for the columns.", when: v => v.source === "file" },
      { id: "publish", l: "Publish as they import", type: "switch", help: "Off: they arrive as drafts members cannot see." },
      { id: "allowNewCourse", l: "Allow courses the catalogue doesn’t list", type: "switch", help: "Off: a row with an unknown course is refused and the nearest course is named." },
    ].filter(Boolean),
    onSubmit: async v => {
      let rows, name, allowNew = !!v.allowNewCourse;
      if (v.source === "seed") {
        const r = await NGGApi.admin.curriculum.seed(v.seed);
        rows = r.rows || []; name = r.title || v.seed;
        if (r.allowNewCourse) allowNew = true;
      } else {
        rows = await crCurReadFile(v.file); name = v.file.name;
        if (rows.allowNewCourse) allowNew = true;
      }
      if (!rows.length) return { fieldErrors: { [v.source === "seed" ? "seed" : "file"]: "No lessons found in that " + (v.source === "seed" ? "course." : "file.") } };
      const opts = { publish: !!v.publish, allowNewCourse: allowNew };
      const res = await NGGApi.admin.curriculum.importRows(rows, Object.assign({ dryRun: true }, opts));
      ctx.setData(x => Object.assign({}, x, { plan: { rows, opts, res, name } }));
      return res;
    },
    done: (v, r) => "Checked · " + crCurTally(r.tally),
  });
}
/** One course (or one year of it) as a print-ready document: the instructor edition with answers and marking
 *  guides, or the member edition with neither the answers nor the weekly assignments (admin.curriculum.document). */
function crCurExport(ctx) {
  const units = (ctx.data || {}).units || [];
  const pairs = []; const seen = {};
  units.filter(u => u.status === "published" && u.course).forEach(u => {
    const k = u.course + "|"; if (!seen[k]) { seen[k] = 1; pairs.push([k, u.course + " · every year"]); }
    const kl = u.course + "|" + (u.level || ""); if (u.level && !seen[kl]) { seen[kl] = 1; pairs.push([kl, u.course + " · " + u.level]); }
  });
  if (!pairs.length) { ctx.toast("Publish a lesson first: only published lessons are exported.", null, true); return; }
  ctx.form({
    title: "Export the curriculum", submit: "Open the PDF", busyLabel: "Opening…",
    intro: "Opens a print-ready copy in a new tab. Press Save as PDF there (or Download as Word).",
    values: { which: pairs[0][0], edition: "staff" },
    fields: [
      { id: "which", l: "Course", type: "select", req: true, opts: pairs },
      { id: "edition", l: "Edition", type: "chips", req: true, opts: [["staff", "Instructor — with answers"], ["member", "Members — no answers, no assignments"]] },
    ],
    onSubmit: v => {
      const cut = String(v.which).lastIndexOf("|");
      const course = String(v.which).slice(0, cut), level = String(v.which).slice(cut + 1);
      const q = new URLSearchParams({ course, edition: v.edition }); if (level) q.set("level", level);
      window.open("/api/admin/curriculum-doc.php?" + q.toString(), "_blank", "noopener");
      return { ok: true };
    },
    done: () => "Opened in a new tab",
  });
}
/* A term's outline for one course (admin.curriculum.plan): titles, summaries and
   objectives, checked by the ordinary import and written as DRAFTS. Each is then
   written from its title ("Write the lesson") and published. */
function crCurOutline(ctx, course) {
  const cov = ((ctx.data || {}).cov || {}).courses || [];
  const opts = cov.map(c => [c.course, c.course + (c.state === "taught" ? " · " + crPlural(c.published, "lesson") : c.members ? " · no lessons, " + crPlural(c.members, "member") : " · no lessons")]);
  ctx.form({
    title: "Build a course outline", submit: "Draft the outline", busyLabel: "Drafting…",
    intro: "A term of weekly lessons for one course: fundamentals, a mini project, a real-world brief, a capstone and a showcase. They arrive as drafts nobody sees. Write each one from its title, then publish.",
    values: { course: course || (opts[0] || [""])[0], level: "Year 1 · Foundation", weeks: "12", fromWeek: "1", ai: true },
    fields: [
      { id: "course", l: "Course", type: "select", req: true, opts },
      { id: "level", l: "Year and level", ph: "Year 1 · Foundation", help: "Say the year (Year 1, 2 or 3) so members see the lessons for their year." },
      { id: "weeks", l: "Weeks in the term", type: "number", im: "numeric", req: true, help: "4 to 24. Most terms are 12.", check: v => +v >= 4 && +v <= 24 ? "" : "Between 4 and 24." },
      { id: "fromWeek", l: "Starting at week", type: "number", im: "numeric", req: true, help: "1 for a new course; later to add a second term.", check: v => +v >= 1 && +v <= 100 ? "" : "Between 1 and 100." },
      { id: "ai", l: "Write the titles with AI, when it is set up", type: "switch", help: "Off, or with no AI configured: NGG’s standard term outline, named for the course." },
    ],
    onSubmit: async v => {
      const r = await NGGApi.admin.curriculum.plan({ course: v.course, level: v.level || "", weeks: +v.weeks, fromWeek: +v.fromWeek, ai: !!v.ai });
      const rows = r.rows || [];
      if (!rows.length) return { fieldErrors: { course: "Nothing to draft for that course." } };
      const opts2 = { publish: false, allowNewCourse: true };
      const res = await NGGApi.admin.curriculum.importRows(rows, Object.assign({ dryRun: true }, opts2));
      ctx.setData(x => Object.assign({}, x, { plan: { rows, opts: opts2, res, name: v.course + " outline (" + (r.via === "ai" ? "written by AI" : "NGG standard term") + ")" } }));
      return res;
    },
    done: (v, r) => "Outline ready · " + crCurTally(r.tally) + ". Read it, then Import.",
  });
}

function crCurTally(t) {
  t = t || {};
  return [crNum(t.create) + " new", crNum(t.update) + " updated", crNum(t.unchanged) + " unchanged", crNum(t.failed) + " refused"].join(" · ");
}

async function crCurApply(ctx) {
  const p = (ctx.data || {}).plan; if (!p) return;
  const t = p.res.tally || {}, n = (t.create || 0) + (t.update || 0);
  if (!n) { ctx.toast("Nothing to import: every lesson is unchanged or refused."); return; }
  const ok = await ctx.confirm({ title: "Import " + crPlural(n, "lesson") + "?", cta: "Import",
    body: crCurTally(t) + ". Refused rows are not imported." + (p.opts.publish ? " New and updated lessons are published straight away." : "") });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.curriculum.importRows(p.rows, Object.assign({ digest: p.res.digest }, p.opts));
    ctx.setData(x => Object.assign({}, x, { plan: null }));
    ctx.toast("Imported · " + crNum(r.tally.create) + " created · " + crNum(r.tally.update) + " updated");
    ctx.reload();
  } catch (e) {
    ctx.toast(e && e.code === "import_changed" ? "The lessons changed since they were checked. Check them again." : crErr(e, "Couldn’t import. Nothing was written."), null, true);
  }
}

function crCurBulk(ctx, status, verb) {
  return async keys => {
    if (status === "delete") {
      const ok = await ctx.confirm({ title: "Delete " + crPlural(keys.length, "lesson") + "?", danger: true, cta: "Delete",
        body: "A lesson somebody has started is retired instead of deleted, because their scores point at it. This can’t be undone." });
      if (!ok) return false;
    }
    try {
      const r = await NGGApi.admin.curriculum.status(status, keys);
      const s = crBulkSummary(r, verb);
      ctx.toast(s.text, null, s.bad);
      ctx.reload();
    } catch (e) { ctx.toast(crErr(e, "Couldn’t change those lessons."), null, true); return false; }
  };
}

/* One press fills the registry from the curriculum's own material links
   (domain/providers.php). Idempotent, so it is safe to press again after
   editing — it only ever adds what is missing. */
async function crPrvSeed(ctx) {
  try {
    const r = await NGGApi.admin.providers.seed();
    ctx.toast(r.message || "Added.");
    await ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t add them."), null, true); }
}

Object.assign(CR_TAB_DEFS, {
  /* HOW LESSONS LAND (domain/lesson-feedback.php).
     A child taps one of three words after every lesson. This is the only
     reason that tap is worth asking for: the lesson most of a class could
     not follow, at the top, with their own words on it. A board that just
     listed the taps back would cost the child the tap and buy them nothing. */
  feedback: {
    skeleton: ["kpis", "cards"],
    load: async () => NGGApi.admin.curriculum.feedback(),
    facts: d => {
      const bad = (d.lessons || []).filter(l => l.enough && l.missPct >= 50);
      return "Lesson feedback: " + crNum(d.voices || 0) + " answers; " + bad.length + " lessons most of the class could not follow"
        + (bad[0] ? ", worst: " + bad[0].title + " (" + bad[0].missPct + "% miss)" : "");
    },
    blocks: (d) => {
      const rows = d.lessons || [];
      const enough = rows.filter(l => l.enough);
      const bad = enough.filter(l => l.missPct >= 50);
      const out = [{ type: "kpis", span: 6, items: [
        { l: "Answers", v: crNum(d.voices || 0), dn: "taps from members" },
        { l: "Lessons with enough to judge", v: crNum(enough.length), dn: d.minVoices + "+ answers each" },
        { l: "Not landing", v: crNum(bad.length), dn: "half the class or more", tone: bad.length ? "down" : "flat" },
      ] }];
      if (!rows.length) {
        out.push({ type: "note", icon: "chat-circle", text: "Nothing yet.",
          sub: "Members are asked how a lesson went at the end of it. Answers appear here as they come in \u2014 nobody is made to answer, so a quiet week is not a fault." });
        return out;
      }
      out.push({ type: "cards", span: 6, title: "Worst first", sub: "A lesson under " + d.minVoices + " answers is shown last \u2014 too few to judge",
        empty: "Nothing yet.",
        cards: rows.map(l => ({
          icon: l.missPct >= 50 ? "warning" : l.missPct >= 25 ? "eye" : "check",
          title: l.title,
          sub: (l.course || "Whole Club") + " \u00b7 week " + l.week,
          tag: l.enough ? l.missPct + "% missed" : l.voices + " answer" + (l.voices === 1 ? "" : "s"),
          tone: !l.enough ? "flat" : l.missPct >= 50 ? "down" : l.missPct >= 25 ? "warn" : "up",
          meta: [["Could do it", String(l.got)], ["Needed help", String(l.mostly)], ["Could not follow", String(l.lost)]]
            .concat(l.said.length ? [["They said", l.said.map(x => "\u201c" + x.body + "\u201d").join("  \u00b7  ")]] : []),
        })) });
      return out;
    },
  },

  /* WHERE COURSES LEAD (domain/providers.php).
     The curriculum has always named its routes out, in lesson prose and
     loose links. This is the question that prose could never answer: what
     do our members actually hold? Biggest first, with the people named, so
     it is a board to act on rather than an export to read. */
  providers: {
    skeleton: ["kpis", "cards"],
    load: async () => {
      const [board, reg] = await Promise.all([
        NGGApi.admin.providers.board(),
        NGGApi.admin.providers.list().catch(() => ({ providers: [] })),
      ]);
      return { board, providers: reg.providers || [], canEdit: !!reg.canEdit };
    },
    facts: d => {
      const t = (d.board && d.board.totals) || {};
      const top = ((d.board && d.board.awards) || [])[0];
      return "Outside credentials: " + crNum(t.earned || 0) + " held by " + crNum(d.board.people || 0) + " members; "
        + crNum(t.registered || 0) + " entered, " + crNum(t.aiming || 0) + " working towards"
        + (top ? "; most held: " + top.title + " (" + top.earned + ")" : "");
    },
    blocks: (d, ctx) => {
      const b = d.board || {}, t = b.totals || {}, rows = b.awards || [];
      const out = [{ type: "kpis", span: 6, items: [
        { l: "Credentials held", v: crNum(t.earned || 0), dn: "awarded by bodies outside NGG" },
        { l: "Members holding one", v: crNum(b.people || 0), dn: "across your centres" },
        { l: "Entered for an exam", v: crNum(t.registered || 0), dn: "result not in yet", tone: (t.registered || 0) ? "warn" : "flat" },
        { l: "Working towards one", v: crNum(t.aiming || 0), dn: "members' own aims" },
      ] }];
      if (!d.providers.length) {
        /* The empty state does the work rather than describing it. Every body
           in the starter list is read from our own curriculum's links, so
           this is not a guess about what we teach — it is what we already
           told learners to go and do. */
        out.push({ type: "note", icon: "certificate", text: "No awarding bodies yet.",
          sub: "Our curriculum already points learners at freeCodeCamp, Cisco NetAcad, Elements of AI, Google, NBTE, Trinity College London and ABRSM — in the lesson links. Start from those and edit, rather than typing them in. Fees and grades are left blank on purpose: they change every year.",
          act: d.canEdit ? { l: "Add the bodies our curriculum points at", run: () => crPrvSeed(ctx) } : null });
        return out;
      }
      if (!rows.length) {
        out.push({ type: "note", icon: "certificate", text: "Nothing recorded yet.",
          sub: "Members can say what they are working towards from their course page. A result is recorded here, by their centre — a child never claims one themselves." });
      } else {
        out.push({ type: "cards", span: 6, title: "What our members hold", sub: "Most held first",
          empty: "Nothing recorded yet.",
          cards: rows.map(a => ({
            icon: a.earned ? "seal-check" : a.registered ? "hourglass" : "target",
            title: a.title + (a.level ? " \u00b7 " + a.level : ""),
            sub: a.provider + " \u00b7 " + a.kindLabel + (a.free ? " \u00b7 free" : ""),
            tag: a.earned + " held",
            tone: a.earned ? "up" : a.registered ? "warn" : "flat",
            meta: [["Entered", String(a.registered)], ["Working towards", String(a.aiming)], ["Sat, not yet passed", String(a.missed)]]
              .concat(a.holders.length ? [["Held by", a.holders.map(h => h.name + (h.grade ? " (" + h.grade + ")" : "")).join(", ")]] : []),
          })) });
      }
      /* The registry itself, so a coordinator can see what is on offer and
         which courses each route is attached to. */
      out.push({ type: "cards", span: 6, title: "The awarding bodies", sub: "What each awards, and the courses that lead to it",
        empty: "None yet.",
        cards: d.providers.map(p => ({
          icon: p.free ? "gift" : "buildings",
          title: p.name,
          sub: [p.country, p.free ? "free" : p.costNote].filter(Boolean).join(" \u00b7 "),
          tag: p.awardCount + (p.awardCount === 1 ? " award" : " awards"),
          tone: p.status === "retired" ? "flat" : "up",
          meta: (p.awards || []).slice(0, 8).map(a => [a.title + (a.level ? " \u00b7 " + a.level : ""),
            ((a.courses || []).join(", ") || "no course attached yet") + " \u00b7 " + a.earned + " held"]),
        })) });
      return out;
    },
  },
  curriculum: {
    skeleton: ["table"],
    load: async ctx => {
      const [list, seeds, cov] = await Promise.all([
        NGGApi.admin.curriculum.list({}),
        ctx.can("curriculum") ? NGGApi.admin.curriculum.seed().catch(() => ({ seeds: [] })) : { seeds: [] },
        NGGApi.admin.curriculum.coverage().catch(e => ({ err: e })),
      ]);
      return { units: list.units || [], canWrite: !!list.canWrite, seeds: seeds.seeds || [], cov, plan: (ctx.data && ctx.data.plan) || null };
    },
    actions: (d, ctx) => [(d.units || []).length ? { l: "Export PDF", icon: "file-pdf", run: () => crCurExport(ctx) } : null].concat(d.canWrite ? [
      { l: "Import lessons", icon: "upload-simple", primary: true, run: () => crCurImport(ctx) },
      { l: "Build a course outline", icon: "path", run: () => crCurOutline(ctx) },
      d.plan ? { l: "Discard the check", icon: "x", run: () => ctx.setData(x => Object.assign({}, x, { plan: null })) } : null,
      { l: "Download template", icon: "download-simple", run: () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([CR_CUR_TEMPLATE], { type: "text/csv" }));
        a.download = "ngg-curriculum-template.csv"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } },
    ] : []).filter(Boolean),
    blocks: (d, ctx) => {
      const out = [];
      const p = d.plan;
      if (p) {
        const t = p.res.tally || {}, n = (t.create || 0) + (t.update || 0);
        out.push({ type: "note", span: 6, icon: t.failed ? "warning-circle" : "check-circle", tone: t.failed ? "warn" : "ok",
          text: "Checked “" + p.name + "”: " + crCurTally(t) + ".",
          sub: n ? "Nothing is written until you press Import." + (t.failed ? " Refused rows are listed below with the reason; fix them in the file and check it again, or import the rest." : "") : "Every lesson is already up to date or refused, so there is nothing to import.",
          act: n ? { l: "Import " + crPlural(n, "lesson"), run: () => crCurApply(ctx) } : null });
        out.push({ type: "table", span: 6, title: "The check, row by row", nosel: true,
          cols: [{ l: "Row", num: true }, "Lesson", "Course", { l: "Week", num: true }, "Result", { l: "Why", wrap: true }],
          rows: (p.res.rows || []).map(r => ({ key: "p" + r.row, cells: [
            { k: "num", t: crNum(r.row), v: r.row },
            { k: "strong", t: r.title || "(no title)" },
            { k: "text", t: r.course || "—" },
            { k: "num", t: r.week ? crNum(r.week) + (r.position ? "." + r.position : "") : "—", v: (r.week || 0) * 100 + (r.position || 0) },
            { k: "status", t: (CR_CUR_VERDICT[r.verdict] || [r.verdict])[0], tone: (CR_CUR_VERDICT[r.verdict] || [0, "neutral"])[1] },
            { k: "text", t: r.verdict === "failed" ? crErr({ code: r.error }, String(r.error || "").replace(/_/g, " ")) + (r.detail ? " — " + r.detail : "") : r.verdict === "create" || r.verdict === "update" ? crPlural(r.materials || 0, "material") + " · " + crPlural(r.checks || 0, "check") : "" },
          ] })),
          filters: ["Result"], sortInit: null });
      }
      const st = s => CR_CUR_STATUS[s] || [s, "neutral"];
      /* Course coverage (admin.curriculum.coverage): which courses have lessons, for which years, and who takes them. */
      const cov = d.cov || {};
      if (cov.err) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "Course coverage couldn’t load.", sub: crErr(cov.err, "Try again."), act: { l: "Try again", run: () => ctx.reload() } });
      else if (cov.courses) {
        const gap = cov.courses.filter(c => c.state !== "taught" && c.members > 0);
        out.push({ type: "kpis", span: 6, items: [
          { l: "Courses with lessons", v: crNum(cov.courses.length - cov.emptyCourses), dn: "of " + crNum(cov.courses.length) + " in the catalogue" },
          { l: "Courses with none", v: crNum(cov.emptyCourses), dn: gap.length ? crNum(gap.length) + " have members waiting" : "none with members" },
          { l: "Members with no lessons", v: crNum(cov.membersWithoutLessons), dn: cov.membersWithoutLessons ? "their course has nothing published" : "everyone has lessons" },
        ] });
        if (gap.length && d.canWrite) out.push({ type: "note", span: 6, icon: "path", tone: "warn",
          text: gap.slice(0, 3).map(c => c.course + " (" + crPlural(c.members, "member") + ")").join(", ") + (gap.length > 3 ? " and " + crNum(gap.length - 3) + " more" : "") + " have members but no published lessons.",
          sub: "Build a term’s outline for one, then write each lesson from its title and publish.",
          act: { l: "Build a course outline", run: () => crCurOutline(ctx, gap[0].course) } });
        const CR_COV = { taught: ["Has lessons", "ok"], drafting: ["Drafts only", "warn"], empty: ["No lessons", "bad"] };
        out.push({ type: "table", span: 6, title: "Courses", sub: "Every course in the catalogue, and what is written for it",
          cols: ["Course", "Division", "State", { l: "Published", num: true }, { l: "Drafts", num: true }, "Years", { l: "Weeks", num: true }, { l: "Members", num: true }],
          rows: cov.courses.map(c => ({ key: "cov-" + c.course, cells: [
            { k: "strong", t: c.course, s: c.homework ? crPlural(c.homework, "lesson") + " set homework" : "" },
            { k: "text", t: c.division || "—" },
            { k: "status", t: (CR_COV[c.state] || [c.state])[0], tone: (CR_COV[c.state] || [0, "neutral"])[1] },
            { k: "num", t: crNum(c.published), v: c.published },
            { k: "num", t: crNum(c.drafts), v: c.drafts },
            { k: "text", t: c.years && c.years.length ? c.years.map(y => "Year " + y).join(", ") : c.published ? "Every year" : "—" },
            { k: "num", t: c.weeks ? crNum(c.weeks) : "—", v: c.weeks },
            { k: "num", t: crNum(c.members), v: c.members },
          ] })),
          search: "Search courses", filters: ["Division", "State"], nosel: true, sortInit: null });
      }
      out.push({ type: "table", span: 6, title: "Lessons", sub: crPlural(d.units.length, "lesson") + " · retired lessons are hidden",
        /* The NGG Learning Path (curriculum_path): Year → Term → Week, coded Y1·T2·W3, so every course groups and sorts the same way. */
        cols: ["Lesson", "Course", "Term", { l: "Path", num: true }, "Status", { l: "Checks", num: true }, { l: "Completed", num: true }],
        rows: d.units.map(u => { const p = u.path || { year: 0, term: 1, week: u.week, code: "W" + u.week }; return { key: u.unitId, cells: [
          { k: "strong", t: u.title || "(no title)", s: u.level || "" },
          { k: "text", t: u.course || "—" },
          { k: "text", t: (p.year ? "Year " + p.year + " · " : "") + "Term " + p.term },
          { k: "num", t: p.code + (u.position > 1 ? "·" + u.position : ""), v: (p.year || 0) * 100000 + p.term * 1000 + p.week * 10 + u.position },
          { k: "status", t: st(u.status)[0], tone: st(u.status)[1] },
          { k: "num", t: crNum(u.checks), v: u.checks },
          { k: "num", t: crNum(u.progress && u.progress.completed), v: (u.progress && u.progress.completed) || 0 },
        ] }; }),
        search: "Search lessons", filters: ["Course", "Term", "Status"],
        nosel: !d.canWrite,
        bulk: d.canWrite ? [
          { l: "Publish", max: 500, run: crCurBulk(ctx, "publish", "published") },
          { l: "Unpublish", max: 500, run: crCurBulk(ctx, "unpublish", "back to draft") },
          { l: "Retire", max: 500, run: crCurBulk(ctx, "retire", "retired") },
          { l: "Delete", max: 500, run: crCurBulk(ctx, "delete", "deleted") },
        ] : [],
        emptyText: d.canWrite ? "No lessons yet. Import a bundled course or a file to start." : "No lessons yet." });
      return out;
    },
  },
});

/* The rest of Learning mounts the v1 panels (crPanel) until each is rebuilt as
   blocks. The Timetable Maker itself is /timetable; this is v1's slot desk. */
Object.assign(CR_TAB_DEFS, {
  assignments: crPanel(() => <AssignmentDesk api={NGGApi.admin.assignments.desk()}/>),
  anchor: crPanel(() => <AdminAnchor/>),
  timetable: crPanel(() => <AdminTimetable/>),
  /* The Saturday Formation Schedule (domain/saturday-formation.php): read by
     the mentor, member, instructor and family portals and by the day's
     reminders. There is a main day, and versions of it: a centre's own day,
     one Saturday everywhere, one Saturday at one centre. The URL tail names
     the version being edited (/control/learning/formation/centre:CEN-EG), so
     a refresh or a shared link opens the same one. */
  formation: {
    skeleton: ["table"],
    load: async ctx => NGGApi.admin.formation.list(ctx.sub || ""),
    actions: (d, ctx) => {
      const can = ctx.can("content"), why = can ? "" : "Needs the content permission.";
      return [
        { l: "Add a block", icon: "plus", primary: true, disabled: !can, why, run: () => crFmAdd(ctx, d) },
        { l: "Move the day", icon: "clock", disabled: !can, why, run: () => crFmShift(ctx, d) },
        { l: "Change one Saturday", icon: "calendar-dot", disabled: !can, why, run: () => crFmVersion(ctx, d, "date") },
        { l: "A centre’s own day", icon: "map-pin", disabled: !can || !(d.centres || []).length, why: why || "No centres yet.", run: () => crFmVersion(ctx, d, "centre") },
        { l: "Mark a Saturday off", icon: "calendar-x", disabled: !can, why, run: () => crFmOff(ctx, d, null) },
        d.scope ? { l: "Remove this version", icon: "trash", disabled: !can, why, run: () => crFmDrop(ctx, d) } : null,
      ].filter(Boolean);
    },
    blocks: (d, ctx) => {
      const checks = d.checks || [], bad = checks.filter(c => c.level === "error"), gaps = checks.filter(c => c.level !== "error");
      const sent = (d.sent || []).reduce((n, x) => n + Number(x.n), 0);
      const readers = b => ["member", "mentor", "instructor", "admin"].filter(a => ((b.for || {})[a] || []).length).concat((b.for || {}).parent ? ["parent"] : []).join(" · ") || "—";
      const kinds = d.kinds || {};
      return [{
        type: "note", span: 6, icon: bad.length ? "warning" : "calendar-star", tone: bad.length ? "bad" : undefined,
        text: d.label + (d.hours ? " · " + d.hours : "") + (bad.length ? ". " + bad.map(c => c.text).join(" ") : ""),
        sub: (d.scope ? "Applies instead of the main day there. " : "Every centre and Saturday without its own version follows this day. ")
          + "Changing a block’s end moves the blocks after it with it. Families get the plan an hour before the day starts, a not-arrived notice 45 minutes in and the close at its end."
          + (gaps.length ? " " + gaps.map(c => c.text).join(" ") : "")
          + (d.lastSaturday ? " Last Saturday (" + crDate(d.lastSaturday) + "): " + crNum(sent) + " sent." : ""),
      }, (d.versions || []).length > 1 ? {
        type: "cards", span: 6, title: "Versions of the day", sub: "Choose one to see and change it",
        cards: d.versions.map(v => ({ icon: v.kind === "main" ? "calendar" : v.kind === "centre" ? "map-pin" : "calendar-dot", title: v.label,
          sub: v.kind === "main" ? "The main day" : v.kind === "centre" ? "This centre, every Saturday" : v.past ? "Has passed" : "This Saturday only",
          tag: v.scope === d.scope ? "Showing" : "", tone: "gold", meta: [], onClick: () => crFmGo(ctx, v.scope) })),
      } : null, {
        type: "table", span: 6, title: "The day", sub: "Think. Create. Lead. Serve. Open a block to change, move, copy or remove it.", nosel: true,
        cols: ["Time", "Block", { l: "What it is for", sort: false }, { l: "Readers", sort: false }],
        rows: (d.blocks || []).map((b, i) => ({ key: b.key, open: () => crFmBlock(ctx, d, b, i), cells: [
          { k: "mono", t: b.start + "–" + b.end }, { k: "person", t: b.title, s: b.purpose }, { k: "text", t: kinds[b.kind || ""] || "General", s: b.flow },
          { k: "text", t: readers(b) }] })),
        emptyText: "No blocks in this version of the day.",
      }, (d.offDays || []).length ? {
        type: "list", span: 6, title: "Saturdays off and notes", sub: "Nothing is sent on a Saturday off; every portal says so, with the note",
        rows: d.offDays.map(o => ({ icon: o.off ? "calendar-x" : "note", t: crDate(o.date) + " · " + (o.centre || "Every centre"), s: o.note, m: o.off ? "Off" : "Note",
          onClick: ctx.can("content") ? () => crFmOff(ctx, d, o) : undefined })),
        empty: "",
      } : null].filter(Boolean);
    },
  },
  /* Opportunities (domain/opportunities.php): what the Member Portal's
     Opportunities screen offers. A member sees the open ones that fit their
     age; a closed or hidden one disappears from every portal at once. */
  opps: {
    skeleton: ["table"],
    load: async () => NGGApi.admin.opps.list(),
    actions: (d, ctx) => [{ l: "Add an opportunity", icon: "plus", primary: true, run: () => crOppEdit(ctx, d, null) }],
    blocks: (d, ctx) => [{
      type: "table", span: 6, title: "Opportunities", sub: "Shown to members in Learn → Opportunities, matched to their age", nosel: true,
      cols: ["Opportunity", "Type", "Closes", "Ages", "Status"],
      rows: (d.items || []).map(o => ({ key: o.oppId, open: () => crOppEdit(ctx, d, o), cells: [
        { k: "person", t: o.title, s: o.org }, { k: "text", t: o.type }, { k: "mono", t: o.closesOn || "Open" },
        { k: "text", t: o.ageMin || o.ageMax ? (o.ageMin || "Any") + "–" + (o.ageMax || "any") : "Every age" },
        { k: "status", t: o.status === "hidden" ? "Hidden" : o.closesOn && o.closesOn < new Date().toISOString().slice(0, 10) ? "Closed" : "Showing", tone: o.status === "hidden" ? "neutral" : "ok" }] })),
      emptyText: "No opportunities yet. Add one and members see it on their next visit.",
    }],
  },
});

/* One opportunity: add, change, hide or remove. The server validates the
   whole row (type, date, link, ages) before it writes. */
function crOppEdit(ctx, d, o) {
  ctx.form({
    title: o ? o.title : "Add an opportunity", submit: o ? "Save" : "Add", busyLabel: "Saving…",
    values: o ? { title: o.title, org: o.org, type: o.type, closesOn: o.closesOn, why: o.why, url: o.url, ageMin: o.ageMin ? String(o.ageMin) : "", ageMax: o.ageMax ? String(o.ageMax) : "", status: o.status }
              : { type: "Training", status: "active", ageMin: "", ageMax: "" },
    fields: [
      { id: "title", l: "Title", req: true }, { id: "org", l: "Who runs it" },
      { id: "type", l: "Kind", type: "select", req: true, opts: (d.types || []).map(t => [t, t]) },
      { id: "closesOn", l: "Closes on (YYYY-MM-DD, blank if open)", check: v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) ? "" : "Use a date like 2026-11-01." },
      { id: "why", l: "Why a member would want it", type: "textarea" },
      { id: "url", l: "Link (optional)", check: v => !v || /^https?:\/\//i.test(v) ? "" : "Start the link with https://" },
      { id: "ageMin", l: "Youngest age (blank for any)", check: v => !v || /^\d{1,2}$/.test(v) ? "" : "A number of years." },
      { id: "ageMax", l: "Oldest age (blank for any)", check: v => !v || /^\d{1,2}$/.test(v) ? "" : "A number of years." },
      { id: "status", l: "Show it", type: "chips", req: true, opts: [["active", "Showing"], ["hidden", "Hidden"]].concat(o ? [["remove", "Remove it"]] : []) },
    ],
    onSubmit: async v => {
      if (v.status === "remove") {
        if (!(await ctx.confirm({ title: "Remove " + o.title + "?", body: "It disappears from every member's Opportunities, and members who saved it lose the bookmark.", cta: "Remove", danger: true }))) return null;
        const r = await NGGApi.admin.opps.save({ oppId: o.oppId, remove: true }); ctx.reload(); ctx.toast("Removed."); return r;
      }
      const r = await NGGApi.admin.opps.save({ oppId: o ? o.oppId : "", title: v.title, org: v.org, type: v.type, closesOn: v.closesOn || "", why: v.why || "", url: v.url || "",
        ageMin: v.ageMin ? Number(v.ageMin) : 0, ageMax: v.ageMax ? Number(v.ageMax) : 0, status: v.status });
      ctx.reload(); ctx.toast(o ? "Saved." : "Added. Members see it on their next visit.");
      return r;
    },
    done: () => null,
  });
}

/* Curriculum: the lessons, bulk status and import are rebuilt above; the lesson
   editor, the Club's course list, the progress report, the submissions queue
   and the schedule are still v1's curriculum desk — one press away at
   /control/learning/curriculum/desk, so none of it is lost. */
(function crLnCurriculumDesk() {
  const base = CR_TAB_DEFS.curriculum;
  CR_TAB_DEFS.curriculum = Object.assign({}, base, {
    actions: (d, ctx) => ctx.sub === "desk"
      ? [{ l: "Back to the lessons", icon: "arrow-left", primary: true, run: () => ctx.setSub("") }]
      : (base.actions(d, ctx) || []).concat(d && d.canWrite ? [{ l: "Lesson editor and reports", icon: "pencil-simple", run: () => ctx.setSub("desk") }] : []),
    blocks: (d, ctx) => ctx.sub === "desk"
      ? [{ type: "custom", span: 6, render: c => <CrPanelMount render={() => <AdminCurriculum/>} ctx={c || ctx}/> }]
      : base.blocks(d, ctx),
  });
})();

/* ── Divisions & courses ─────────────────────────────────────────────────────
   The NGG Club's own structure (domain/curriculum.php club_divisions): four
   divisions, each with its icon, the short label a member card prints, the
   sentence a family reads on the join form, and its courses. Summer School
   keeps its own catalogue; nothing here touches it. A course belongs to ONE
   division (the server refuses it in two), and a course with members, lessons
   or classes is marked so taking it off is a decision, not an accident. */
function CrDivisions({ ctx }) {
  const [d, setD] = React.useState({ state: "loading" });
  const [rows, setRows] = React.useState([]);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [adding, setAdding] = React.useState({});
  const load = React.useCallback(() => {
    NGGApi.admin.curriculum.courses().then(r => { setD(Object.assign({ state: "ready" }, r)); setRows((r.divisions || []).map(x => Object.assign({}, x, { courses: x.courses.slice() }))); setDirty(false); setErr(""); })
      .catch(e => setD({ state: "error", error: e }));
  }, []);
  React.useEffect(load, [load]);
  // Unsaved edits are reported to the Control Room, which offers to save or discard them before leaving.
  const saveRef = React.useRef(null);
  React.useEffect(() => {
    if (!ctx || !ctx.setDirty) return undefined;
    ctx.setDirty("divisions", dirty ? { n: 1, save: () => saveRef.current && saveRef.current(), discard: load } : null);
    return () => ctx.setDirty("divisions", null);
  }, [dirty]); // eslint-disable-line
  if (d.state === "loading") return <CrSkeleton kind="table"/>;
  if (d.state === "error") return <CrError error={d.error} onRetry={load} what="the divisions"/>;
  const can = !!d.canEdit, inUse = new Set(d.inUse || []), members = d.members || {};
  const edit = (i, p) => { setRows(rs => rs.map((r, k) => k === i ? Object.assign({}, r, p) : r)); setDirty(true); };
  const move = (i, dir) => { setRows(rs => { const n = rs.slice(); const j = i + dir; if (j < 0 || j >= n.length) return rs; [n[i], n[j]] = [n[j], n[i]]; return n; }); setDirty(true); };
  const addCourse = i => {
    const c = String(adding[i] || "").trim();
    if (!c) return;
    const owner = rows.findIndex(r => r.courses.some(x => x.toLowerCase() === c.toLowerCase()));
    if (owner >= 0) { const same = rows[owner].courses.find(x => x.toLowerCase() === c.toLowerCase()); setErr(same + " is already in " + rows[owner].name + ". A course belongs to one division."); return; }
    edit(i, { courses: rows[i].courses.concat([c]) }); setAdding(a => Object.assign({}, a, { [i]: "" })); setErr("");
  };
  const dropCourse = async (i, c) => {
    const n = members[c] || 0;
    if (n || inUse.has(c)) {
      const ok = await ctx.confirm({ title: "Take " + c + " off?", body: (n ? n + " member" + (n === 1 ? " is" : "s are") + " in it" : "It has lessons or classes on the timetable") + ". They keep it on their record and their lessons stay findable; it just stops being offered.", cta: "Take it off", danger: true });
      if (!ok) return;
    }
    edit(i, { courses: rows[i].courses.filter(x => x !== c) });
  };
  const dropDivision = async i => {
    const n = rows[i].courses.reduce((t, c) => t + (members[c] || 0), 0);
    const ok = await ctx.confirm({ title: "Remove " + (rows[i].name || "this division") + "?", body: n ? n + " member" + (n === 1 ? " is" : "s are") + " in its courses. They keep their course; the division stops being offered on the join form." : "Its courses stop being offered on the join form.", cta: "Remove", danger: true });
    if (ok) { setRows(rs => rs.filter((_, k) => k !== i)); setDirty(true); }
  };
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await NGGApi.admin.curriculum.coursesSet(rows.map(r => ({ faculty: r.name, icon: r.icon, short: r.short, blurb: r.blurb, courses: r.courses })));
      ctx.toast("Saved. The join form and new member cards use it now.");
      load();
    } catch (e) { setErr(crErr(e, "Couldn’t save. Your changes are still here.")); }
    finally { setBusy(false); }
  };
  saveRef.current = save;
  const reset = async () => {
    const ok = await ctx.confirm({ title: "Go back to the NGG divisions?", body: "Creative & Performing Arts; Media & Content Strategy; Technology & Applied Engineering; Business Strategy, Operations & Administration — with their standard courses. Your changes here are replaced.", cta: "Reset", danger: true });
    if (!ok) return;
    try { await NGGApi.admin.curriculum.coursesReset(); ctx.toast("Back to the NGG divisions."); load(); } catch (e) { setErr(crErr(e)); }
  };
  return (
    <div className="cr-dv">
      <div className="cr-box cr-dv-intro">
        <p>The <b>NGG Club</b>’s divisions and courses: what the NGG join form offers, what a member is filed under, and the label their card prints. <b>Summer School keeps its own catalogue</b> (Summer School → Structure); nothing here changes it.</p>
        <p className="cr-hint">Centres running the NGG Club: {(d.centres || []).length ? d.centres.join(", ") : "none yet"}. <button type="button" className="cr-linkbtn" onClick={() => window.__adminSection && window.__adminSection("centres")}>Manage centres</button></p>
      </div>
      {err && <div className="cr-box cr-mp-note is-bad" role="alert"><CrIcon n="warning-circle"/><span>{err}</span></div>}
      <ol className="cr-dv-list">
        {rows.map((r, i) => (
          <li key={i} className="cr-box cr-dv-card">
            <div className="cr-dv-head">
              <input className="cr-input cr-dv-icon" aria-label={"Icon for " + (r.name || "this division")} value={r.icon || ""} maxLength={4} disabled={!can} onChange={e => edit(i, { icon: e.target.value })}/>
              <input className="cr-input cr-grow cr-dv-name" aria-label="Division name" value={r.name} maxLength={80} disabled={!can} onChange={e => edit(i, { name: e.target.value })}/>
              <label className="cr-dv-short"><span className="cr-hint">On the card</span><input className="cr-input" aria-label={"Card label for " + (r.name || "this division")} value={r.short || ""} maxLength={14} disabled={!can} onChange={e => edit(i, { short: e.target.value.toUpperCase() })}/></label>
              {can && <span className="cr-dv-move">
                <button type="button" className="cr-iconbtn" aria-label={"Move " + r.name + " up"} disabled={i === 0} onClick={() => move(i, -1)}><CrIcon n="arrow-up"/></button>
                <button type="button" className="cr-iconbtn" aria-label={"Move " + r.name + " down"} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><CrIcon n="arrow-down"/></button>
                <button type="button" className="cr-iconbtn" aria-label={"Remove " + r.name} onClick={() => dropDivision(i)}><CrIcon n="trash"/></button>
              </span>}
            </div>
            <textarea className="cr-textarea cr-dv-blurb" rows={2} aria-label={"What " + (r.name || "this division") + " is for, as families read it"} value={r.blurb || ""} maxLength={300} disabled={!can} placeholder="For children interested in…" onChange={e => edit(i, { blurb: e.target.value })}/>
            <ul className="cr-dv-courses" aria-label={"Courses in " + r.name}>
              {r.courses.map(c => (
                <li key={c} className="cr-chip">
                  {c}{members[c] ? <span className="cr-hint"> · {members[c]}</span> : null}
                  {can && <button type="button" className="cr-dv-x" aria-label={"Take " + c + " off"} onClick={() => dropCourse(i, c)}><CrIcon n="x"/></button>}
                </li>
              ))}
              {can && <li className="cr-dv-add">
                <input className="cr-input" placeholder="Add a course…" aria-label={"Add a course to " + r.name} value={adding[i] || ""} maxLength={80}
                       onChange={e => setAdding(a => Object.assign({}, a, { [i]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCourse(i); } }}/>
                <button type="button" className="cr-btn is-sm" onClick={() => addCourse(i)}>Add</button>
              </li>}
            </ul>
          </li>
        ))}
      </ol>
      {can && <div className="cr-dv-foot">
        <button type="button" className="cr-btn" onClick={() => { setRows(rs => rs.concat([{ name: "New division", icon: "", short: "", blurb: "", courses: [] }])); setDirty(true); }}><CrIcon n="plus"/>Add a division</button>
        <button type="button" className="cr-linkbtn" onClick={reset}>Reset to the NGG divisions</button>
        <span className="cr-grow"/>
        <button type="button" className="cr-btn is-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : dirty ? "Save divisions" : "Saved"}</button>
      </div>}
      {!can && <p className="cr-hint">Changing the divisions needs the Curriculum permission.</p>}
    </div>
  );
}
Object.assign(CR_TAB_DEFS, {
  divisions: crPanel(ctx => <CrDivisions ctx={ctx}/>),
});

/* ── The Saturday formation editor ────────────────────────────────────────
   Every write names the version (`scope`) it changes, then the editor reads
   that version again: the server has moved the blocks after it, and the
   screen shows what the server holds, not what was typed. */
const CR_FM_TIME = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? "" : "Use 24-hour time, like 08:30.";
function crFmGo(ctx, scope) {
  return NGGApi.admin.formation.list(scope || "").then(r => { ctx.setData(r); ctx.setSub(r.scope || ""); },
    e => ctx.toast(crErr(e, "Couldn’t open that version of the day."), null, true));
}
/** Run one formation op, toast what it did, and show the day as the server now has it. */
async function crFmRun(ctx, d, action, args, said) {
  const r = await NGGApi.admin.formation.act(action, Object.assign({ scope: d.scope || "" }, args));
  await crFmGo(ctx, r && r.scope != null && action === "version.create" ? r.scope : d.scope);
  if (r && r.unchanged) ctx.toast("Nothing changed.");
  else ctx.toast(typeof said === "function" ? said(r || {}) : said);
  return r;
}
const crFmMoved = r => r && r.moved ? " " + crNum(r.moved) + (r.moved === 1 ? " block after it moved too." : " blocks after it moved too.") : "";
const crFmKinds = d => Object.keys(d.kinds || { "": "General" }).map(k => [k, d.kinds[k]]);

/* One block in a drawer: what it is, and every act on it. */
function crFmBlock(ctx, d, b, i) {
  const can = ctx.can("content"), last = (d.blocks || []).length - 1, why = can ? "" : "Needs the content permission.";
  const mins = (+b.end.slice(0, 2) * 60 + +b.end.slice(3)) - (+b.start.slice(0, 2) * 60 + +b.start.slice(3));
  const act = (action, args, said) => () => { ctx.closeDrawer(); return crFmRun(ctx, d, action, Object.assign({ key: b.key }, args), said).catch(e => ctx.toast(crErr(e, "Couldn’t change the day."), null, true)); };
  const F = b.for || {};
  ctx.drawer({
    title: b.title, sub: d.label + " · " + b.start + "–" + b.end, icon: "calendar-star",
    stats: [["Starts", b.start], ["Minutes", crNum(mins)], ["For", (d.kinds || {})[b.kind || ""] || "General"]],
    fields: [["Flow", b.flow || "—"], ["Purpose", b.purpose || "—"], ["Key line", b.quote || "—"]],
    sections: [["member", "Members"], ["mentor", "Mentors"], ["instructor", "Instructors"], ["admin", "Admin"]].map(([a, h]) => ({ h, list: (F[a] || []).map(t => ({ icon: "check", t })), empty: "Nothing for " + h.toLowerCase() + "." }))
      .concat([{ h: "Families", text: F.parent || "Families are not told about this block." }]),
    actions: [
      { l: "Change this block", primary: true, disabled: !can, why, run: () => { ctx.closeDrawer(); crFormationEdit(ctx, d, b); } },
      { l: "Move up", disabled: !can || i === 0, why: why || "It is the first block.", run: act("move", { dir: "up" }, b.title + " now comes earlier. The day still ends when it did.") },
      { l: "Move down", disabled: !can || i === last, why: why || "It is the last block.", run: act("move", { dir: "down" }, b.title + " now comes later. The day still ends when it did.") },
      { l: "Duplicate", disabled: !can, why, run: () => { ctx.closeDrawer(); return crFmRun(ctx, d, "add", { copyOf: b.key }, r => "Copied after " + b.title + "." + crFmMoved(r)).catch(e => ctx.toast(crErr(e, "Couldn’t copy the block."), null, true)); } },
      { l: "Remove this block", disabled: !can || last === 0, why: why || "A day needs at least one block.", run: act("remove", {}, r => b.title + " removed." + (r.moved ? " The blocks after it moved up to fill its time." : "")) },
    ],
  });
}

/* One block's times and words, its kind, and each reader's part (one point per
   line). With "move the blocks after it", a new end carries the rest of the
   day with it; without, a time that runs into the next block is refused. */
function crFormationEdit(ctx, d, b) {
  const F = b.for || {}; const lines = a => (F[a] || []).join("\n");
  ctx.form({
    title: b.title, intro: d.label + " · " + b.start + "–" + b.end, submit: "Save block", busyLabel: "Saving…",
    values: { start: b.start, end: b.end, ripple: true, title: b.title, kind: b.kind || "", flow: b.flow, purpose: b.purpose, quote: b.quote || "",
              member: lines("member"), mentor: lines("mentor"), instructor: lines("instructor"), admin: lines("admin"), parent: F.parent || "" },
    fields: [
      { id: "start", l: "Starts (HH:MM)", req: true, check: CR_FM_TIME },
      { id: "end", l: "Ends (HH:MM)", req: true, check: CR_FM_TIME },
      { id: "ripple", l: "Move the blocks after it too", type: "switch", help: "Keeps every later block’s length and the gaps between them." },
      { id: "title", l: "Block", req: true, max: 120 },
      { id: "kind", l: "What it is for", type: "select", opts: crFmKinds(d), help: "Reminders follow this: classes reach instructors, the mentor breakout sets the mentors’ window, members are not reminded at check-in." },
      { id: "flow", l: "Formation flow word", max: 60 }, { id: "purpose", l: "Purpose", type: "textarea", max: 400 },
      { id: "quote", l: "Key question or line", type: "textarea", max: 300 },
      { id: "member", l: "Members: what they do (one per line)", type: "textarea" },
      { id: "mentor", l: "Mentors: what they watch for (one per line)", type: "textarea" },
      { id: "instructor", l: "Instructors (one per line)", type: "textarea" },
      { id: "admin", l: "Admin: what must be ready (one per line)", type: "textarea" },
      { id: "parent", l: "What families are told", type: "textarea", max: 400 },
    ],
    onSubmit: async v => {
      const split = t => String(t || "").split("\n").map(x => x.trim()).filter(Boolean);
      const r = await NGGApi.admin.formation.save({ scope: d.scope || "", key: b.key, start: v.start, end: v.end, ripple: !!v.ripple, title: v.title, kind: v.kind || "",
        flow: v.flow, purpose: v.purpose, quote: v.quote,
        for: { member: split(v.member), mentor: split(v.mentor), instructor: split(v.instructor), admin: split(v.admin), parent: String(v.parent || "").trim() } });
      await crFmGo(ctx, d.scope);
      return r;
    },
    done: (v, r) => r && r.unchanged ? "Nothing changed." : "Saved. Every portal on this day shows the new " + v.title + "." + crFmMoved(r),
  });
}

/* A new block, after the one chosen; its length pushes the rest of the day on. */
function crFmAdd(ctx, d) {
  const bs = d.blocks || [];
  ctx.form({
    title: "Add a block", intro: d.label, submit: "Add", busyLabel: "Adding…",
    values: { title: "", after: bs.length ? bs[bs.length - 1].key : "", minutes: "30", kind: "" },
    fields: [
      { id: "title", l: "Block", req: true, max: 120, ph: "Guest talk" },
      { id: "after", l: "Comes after", type: "select", opts: bs.map(b => [b.key, b.start + " · " + b.title]) },
      { id: "minutes", l: "Minutes", type: "number", req: true, im: "numeric", check: v => +v >= 5 && +v <= 600 ? "" : "Between 5 and 600 minutes." },
      { id: "kind", l: "What it is for", type: "select", opts: crFmKinds(d) },
    ],
    onSubmit: async v => crFmRun(ctx, d, "add", { title: v.title, after: v.after, minutes: +v.minutes, kind: v.kind || "" }, r => v.title + " added." + crFmMoved(r)),
    done: () => null,
  });
}

/* The whole day earlier or later: "we start at 9 this term". */
function crFmShift(ctx, d) {
  const bs = d.blocks || [];
  if (!bs.length) return;
  ctx.form({
    title: "Move the day", intro: d.label + " · now " + d.hours, submit: "Move", busyLabel: "Moving…",
    values: { startAt: bs[0].start, from: bs[0].key },
    fields: [
      { id: "from", l: "From", type: "select", opts: bs.map((b, i) => [b.key, i === 0 ? "The whole day" : b.title + " and everything after it"]) },
      { id: "startAt", l: "Starts at (HH:MM)", req: true, check: CR_FM_TIME, help: "Every block keeps its length; the server moves them together and refuses a move past midnight." },
    ],
    onSubmit: async v => crFmRun(ctx, d, "shift", { startAt: v.startAt, from: v.from }, r => crNum(r.moved || 0) + " blocks moved " + Math.abs(r.minutes || 0) + " minutes " + ((r.minutes || 0) > 0 ? "later." : "earlier.")),
    done: () => null,
  });
}

/* A version of the day: one Saturday (everywhere or at one centre), or a centre's own day. It starts as a copy of what was in force there. */
function crFmVersion(ctx, d, kind) {
  const cs = (d.centres || []).map(c => [c.id, c.name]);
  ctx.form({
    title: kind === "date" ? "Change one Saturday" : "A centre’s own day",
    intro: kind === "date" ? "That Saturday starts as a copy of the day in force there. Change it; every other Saturday stays as it is." : "The centre’s day starts as a copy of the main day and is used there every Saturday until it is removed.",
    submit: "Create", busyLabel: "Creating…",
    values: { date: d.nextSaturday || "", centre: kind === "date" ? "" : (cs[0] || [""])[0] },
    fields: (kind === "date" ? [{ id: "date", l: "Saturday", type: "date", req: true, check: v => v && new Date(v + "T12:00:00Z").getUTCDay() === 6 ? "" : "Choose a Saturday." }] : [])
      .concat([{ id: "centre", l: "Centre", type: "select", opts: (kind === "date" ? [["", "Every centre"]] : []).concat(cs), req: kind !== "date" }]),
    onSubmit: async v => crFmRun(ctx, d, "version.create", { scope: kind === "date" ? "date:" + v.date + (v.centre ? "@" + v.centre : "") : "centre:" + v.centre },
      r => (r.label || "That version") + " is ready, copied from " + (r.from || "the main day") + "."),
    done: () => null,
  });
}

/* A Saturday off (nothing is sent; every portal says so) or a note families read, everywhere or at one centre. */
function crFmOff(ctx, d, o) {
  ctx.form({
    title: o ? crDate(o.date) + " · " + (o.centre || "Every centre") : "Mark a Saturday off", submit: "Save", busyLabel: "Saving…",
    intro: "On a Saturday off nothing is sent, and the member, mentor, instructor and family portals say there is no NGG that day. Clear the note and switch it on again to put it back.",
    values: o ? { date: o.date, centre: o.centreId, off: o.off, note: o.note } : { date: d.nextSaturday || "", centre: "", off: true, note: "" },
    fields: [
      { id: "date", l: "Saturday", type: "date", req: true, check: v => v && new Date(v + "T12:00:00Z").getUTCDay() === 6 ? "" : "Choose a Saturday." },
      { id: "centre", l: "Centre", type: "select", opts: [["", "Every centre"]].concat((d.centres || []).map(c => [c.id, c.name])) },
      { id: "off", l: "No NGG that Saturday", type: "switch" },
      { id: "note", l: "What families and members read", type: "textarea", max: 300, ph: "The hall is being painted; we are back on the 16th.", help: "Needed for a Saturday off: the server refuses one without it, on this field." },
    ],
    onSubmit: async v => crFmRun(ctx, d, "day.set", { date: v.date, centre: v.centre || "", off: !!v.off, note: v.note || "" },
      v.off ? crDate(v.date) + " is off" + (v.centre ? " at that centre." : " everywhere.") : String(v.note || "").trim() ? "Note saved for " + crDate(v.date) + "." : crDate(v.date) + " is back on."),
    done: () => null,
  });
}

/* Remove a version: that Saturday or centre goes back to what applied before. Irreversible, so it asks. */
async function crFmDrop(ctx, d) {
  const ok = await ctx.confirm({ title: "Remove " + d.label + "?", body: "Its blocks are deleted and that " + (String(d.scope).indexOf("date:") === 0 ? "Saturday" : "centre") + " follows the day that applied before it. This cannot be undone.", cta: "Remove this version", danger: true });
  if (!ok) return;
  try { await NGGApi.admin.formation.act("version.delete", { scope: d.scope }); await crFmGo(ctx, ""); ctx.toast(d.label + " removed."); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t remove that version."), null, true); }
}

/* ── Course health (learning/course-health) ────────────────────────────────
   Whether each course can actually be taught (admin.courses.health): the
   children placed in it and those only proposed, instructors, published
   lessons, class times, a channel; a course failing children first, each gap
   with what to do and where. */
const CR_CH_GO = { no_lessons: ["Write lessons", "learning", "curriculum"], no_instructor: ["Give it an instructor", "mentors", "volunteers"],
  no_class_time: ["Put it on the timetable", "learning", "timetable"], unconfirmed: ["Confirm placements", "members", "courses"],
  missing_files: ["Upload the files again", "learning", "curriculum"] };
function crChOpen(ctx, c) {
  ctx.drawer({
    title: c.course, sub: c.division,
    stats: [["Children", crNum(c.placed) + (c.proposed ? " + " + crNum(c.proposed) + " proposed" : "")], ["Instructors", crNum(c.instructors)], ["Lessons", crNum(c.lessons) + (c.lessonsFromParts ? " (+" + crNum(c.lessonsFromParts) + " under its parts)" : "")]],
    fields: [["Class times", crNum(c.classTimes)], ["Channel", c.channel ? "Yes" : "None yet"]],
    sections: [{ h: "What is missing", text: (c.gaps || []).map(g => "• " + g.say).join("\n"), empty: "Nothing: it can be taught." }]
      .concat((c.missingFiles || []).length ? [{ h: "Lesson files to upload again", text: c.missingFiles.map(x => "• " + x).join("\n") }] : []),
    actions: (c.gaps || []).map(g => CR_CH_GO[g.code]).filter(Boolean).map((a, i) => ({ l: a[0], primary: i === 0, run: () => { ctx.closeDrawer(); ctx.go(a[1], a[2]); } })),
  });
}
Object.assign(CR_TAB_DEFS, {
  "course-health": {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.courses.health({}),
    blocks: (d, ctx) => {
      const sm = d.summary || {}, rows = d.courses || [];
      const state = c => c.placed + c.proposed === 0 ? ["No children", "neutral"] : c.gaps.some(g => g.code !== "unconfirmed") ? ["Missing something", "bad"] : c.proposed ? ["Unconfirmed", "warn"] : ["Can be taught", "ok"];
      return [
        { type: "kpis", span: 6, items: [
          { l: "Courses with children", v: crNum(sm.withChildren || 0) },
          { l: "Missing something they need", v: crNum(sm.failing || 0), tone: sm.failing ? "down" : "flat" },
          { l: "Courses in all", v: crNum(sm.courses || 0) },
        ] },
        sm.failing ? { type: "note", span: 6, icon: "warning-circle", tone: "warn", text: crPlural(sm.failing, "course") + " with children cannot be fully taught yet.", sub: "Open one to see what is missing and go straight to where it is fixed.",
          /* The first failing course opens on what it is missing — the table lists the failing first, so this is the top row. */
          act: (() => { const f = rows.find(c => state(c)[1] === "bad"); return f ? { l: "Fix " + f.course, run: () => crChOpen(ctx, f) } : null; })() } : null,
        { type: "table", span: 6, title: "Every course", sub: "A course failing children is listed first.",
          cols: ["Course", "#Children", "#Instructors", "#Lessons", "#Class times", "Channel", { l: "What is missing", wrap: true }, "State"],
          rows: rows.map(c => { const st = state(c); return { key: c.course, open: () => crChOpen(ctx, c), cells: [
            { k: "strong", t: c.course, s: c.division },
            { k: "num", t: crNum(c.placed) + (c.proposed ? " +" + crNum(c.proposed) : ""), v: c.placed + c.proposed },
            { k: "num", t: crNum(c.instructors), v: c.instructors },
            { k: "num", t: crNum(c.lessons) + (c.lessonsFromParts ? " +" + crNum(c.lessonsFromParts) : ""), v: c.lessons + c.lessonsFromParts },
            { k: "num", t: crNum(c.classTimes), v: c.classTimes },
            { k: "text", t: c.channel ? "Yes" : "—" },
            { k: "text", t: c.gaps.map(g => g.say.split(".")[0]).join(" · ") || "Nothing" },
            { k: "status", t: st[0], tone: st[1] },
          ] }; }),
          search: "Search courses", filters: ["State"],
          emptyText: "No courses yet. Add them in Divisions & courses." },
      ].filter(Boolean);
    },
  },
});

/* ── Sessions, native ────────────────────────────────────────────────────────
   Was AdminSessions: a year of 12-week sessions as cards, each opening a drawer
   editor. Same op (admin.sessions list / upsert). The year is the sub-address
   (/control/learning/sessions/2027), so the year being looked at survives a
   refresh and a shared link. */
function crSesEdit(ctx, s) {
  ctx.form({
    title: (s.code || s.sessionId) + " · " + s.year, submit: "Save session", busyLabel: "Saving…",
    values: { name: s.name || "", startDate: s.startDate || "", endDate: s.endDate || "", theme: s.theme || "", coverUrl: s.coverUrl || "", notes: s.notes || "" },
    fields: [
      { id: "name", l: "Display name", max: 80 },
      { id: "startDate", l: "Starts", type: "date", req: true },
      { id: "endDate", l: "Ends", type: "date", req: true, check: (v, all) => !all.startDate || v >= all.startDate ? "" : "It ends before it starts." },
      { id: "theme", l: "Theme", max: 120, ph: "“Build the room.”" },
      { id: "coverUrl", l: "Cover image link", max: 400, ph: "https://" },
      { id: "notes", l: "Internal notes", type: "textarea", rows: 3 },
    ],
    onSubmit: async v => {
      const r = await NGGApi.admin.sessions.upsert(Object.assign({}, s, v));
      const l = await NGGApi.admin.sessions.list(s.year); ctx.setData({ year: s.year, sessions: l.sessions || [] });
      return r;
    },
    done: () => "Session saved.",
  });
}
/* ── Missions, native ───────────────────────────────────────────────────────
   Was AdminMissions: twelve weeks of Anchor missions and, above them, the proof
   review queue. Same ops. Returning a submission asks for the feedback in a
   form (it was window.prompt, which a phone renders as a system dialog with no
   room to write). */
const CR_MIS_TYPES = ["Make", "Read", "Speak", "Reflect", "Serve", "Move"];
const CR_MIS_PROOF = ["photo", "text", "audio", "video", "link", "none"];
function crMisEdit(ctx, m) {
  const isNew = !m.missionId;
  ctx.form({
    title: isNew ? "New mission" : "Edit mission", submit: isNew ? "Add mission" : "Save mission", busyLabel: "Saving…",
    values: { week: m.week ? String(m.week) : "", order: String(m.order || 1), theme: m.theme || "", title: m.title || "", prompt: m.prompt || "",
              type: m.type || "Make", proof: m.proof || "text", xp: String(m.xp || 60), estimatedMin: String(m.estimatedMin || 15), bookPage: m.bookPage ? String(m.bookPage) : "",
              isActive: isNew ? true : m.isActive !== false },
    fields: [
      { id: "week", l: "Week (1–12)", req: true, im: "numeric", check: v => /^\d+$/.test(String(v)) && +v >= 1 && +v <= 12 ? "" : "A week from 1 to 12." },
      { id: "order", l: "Order in the week", im: "numeric" },
      { id: "theme", l: "Theme", ph: "Identity, Discipline…", max: 60 },
      { id: "title", l: "Title", req: true, max: 120 },
      { id: "prompt", l: "What the member has to do", type: "textarea", rows: 4 },
      { id: "type", l: "Kind", type: "chips", req: true, opts: CR_MIS_TYPES },
      { id: "proof", l: "Proof", type: "chips", req: true, opts: CR_MIS_PROOF.map(p => [p, p === "none" ? "None" : p[0].toUpperCase() + p.slice(1)]) },
      { id: "xp", l: "XP", im: "numeric" },
      { id: "estimatedMin", l: "Time (minutes)", im: "numeric" },
      { id: "bookPage", l: "Book page", im: "numeric" },
      { id: "isActive", l: "Active — assignable to members now", type: "switch" },
    ],
    onSubmit: async v => {
      const num = x => (x === "" || x == null) ? "" : Number(x);
      const r = await NGGApi.admin.missions.upsert(Object.assign({}, m, v, { week: Number(v.week), order: Number(v.order) || 1, xp: Number(v.xp) || 0, estimatedMin: Number(v.estimatedMin) || 0, bookPage: num(v.bookPage) }));
      ctx.reload(); return r;
    },
    done: v => (isNew ? "Added: " : "Saved: ") + v.title + ".",
  });
}
async function crMisVerify(ctx, s, approve, note) {
  try {
    await NGGApi.admin.missions.verify(s.memberId, s.missionId, approve, note || "");
    ctx.toast(approve ? "Verified · +" + crNum(s.xp || 0) + " XP awarded" : "Returned for another pass");
    ctx.closeDrawer(); ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t record that."), null, true); }
}
function crMisProof(ctx, s) {
  const link = s.proofUrl && /^https?:\/\//i.test(String(s.proofUrl).trim());
  ctx.drawer({
    title: s.fullName || s.memberId, sub: [s.centre, "Week " + s.week, s.title].filter(Boolean).join(" · "),
    stats: [["XP on verify", "+" + crNum(s.xp || 0)]], fields: [],
    sections: [
      s.note ? { h: "Their note", text: "“" + s.note + "”" } : null,
      s.proofUrl ? { h: "Proof", text: link ? s.proofUrl : s.proofUrl } : { h: "Proof", text: "Nothing attached." },
    ].filter(Boolean),
    actions: [
      { l: "Verify +" + crNum(s.xp || 0), primary: true, run: () => crMisVerify(ctx, s, true) },
      link ? { l: "Open the proof", run: () => window.open(s.proofUrl, "_blank", "noopener") } : null,
      { l: "Return with feedback", run: () => { ctx.closeDrawer(); ctx.form({
          title: "Return to " + (s.fullName || "the member"), submit: "Return", busyLabel: "Returning…",
          intro: "They see this and can try again.", values: { note: "" },
          fields: [{ id: "note", l: "Feedback (optional)", type: "textarea", rows: 4, max: 500 }],
          onSubmit: async v => { await crMisVerify(ctx, s, false, v.note.trim()); }, done: () => null }); } },
    ].filter(Boolean),
  });
}
Object.assign(CR_TAB_DEFS, {
  sessions: {
    skeleton: ["cards"],
    load: async ctx => {
      const year = /^\d{4}$/.test(String(ctx.sub || "")) ? +ctx.sub : new Date().getFullYear();
      const r = await NGGApi.admin.sessions.list(year);
      return { year, sessions: r.sessions || [] };
    },
    /* Another year is fetched here and put in the tab's data: `load` keeps the ctx of
       the first render (useCrLoad memoises it), so it reads a deep-linked year but not
       one chosen afterwards. The address follows, so a refresh lands on the same year. */
    actions: (d, ctx) => {
      const go = y => NGGApi.admin.sessions.list(y).then(r => { ctx.setData({ year: y, sessions: r.sessions || [] }); ctx.setSub(String(y)); },
                                                       e => ctx.toast(crErr(e, "Couldn’t load " + y + "."), null, true));
      return d ? [
        { l: String(d.year - 1), icon: "caret-left", run: () => go(d.year - 1) },
        { l: String(d.year + 1), icon: "caret-right", run: () => go(d.year + 1) },
      ] : [];
    },
    blocks: (d, ctx) => [
      { type: "cards", span: 6, title: "Sessions · " + d.year, sub: "Each session is twelve weeks.",
        empty: "No sessions for " + d.year + ".",
        cards: d.sessions.map(s => ({ icon: "calendar-blank", title: s.name || s.code, sub: crDate(s.startDate) + " — " + crDate(s.endDate),
          tag: s.isActive ? "Live now" : "", tone: s.isActive ? "ok" : "neutral",
          meta: [["Code", s.code], s.theme ? ["Theme", "“" + s.theme + "”"] : null].filter(Boolean), onClick: () => crSesEdit(ctx, s) })) },
    ],
  },
  missions: {
    skeleton: ["queue", "list"],
    load: async () => {
      const [l, q] = await Promise.all([NGGApi.admin.missions.list(), NGGApi.admin.missions.submissions().catch(() => ({ submissions: [] }))]);
      return { missions: l.missions || [], subs: q.submissions || [] };
    },
    actions: (d, ctx) => [{ l: "New mission", icon: "plus", primary: true, run: () => crMisEdit(ctx, {}) }],
    blocks: (d, ctx) => {
      const out = [{ type: "list", span: 6, title: "Proof to review", sub: d.subs.length ? crPlural(d.subs.length, "submission") + " waiting" : "",
        empty: "Nothing waiting. Missions that need proof land here for a mentor or admin to verify.",
        rows: d.subs.map(s => ({ icon: "seal-check", t: (s.fullName || s.memberId) + " · week " + s.week, s: s.title + (s.note ? " — “" + s.note + "”" : ""), m: "+" + crNum(s.xp || 0) + " XP", onClick: () => crMisProof(ctx, s) })) }];
      for (let w = 1; w <= 12; w++) {
        const ms = d.missions.filter(m => Number(m.week) === w).sort((a, b) => (a.order || 0) - (b.order || 0));
        out.push({ type: "list", span: 6, title: "Week " + w + (ms[0] && ms[0].theme ? " · " + ms[0].theme : ""), sub: crPlural(ms.length, "mission"),
          action: "Add", onAction: () => crMisEdit(ctx, { week: w }),
          empty: "No mission this week yet.",
          rows: ms.map(m => ({ icon: m.isActive === false ? "pause-circle" : "target", t: m.title, s: [m.type, m.proof && m.proof !== "none" ? "proof: " + m.proof : "no proof", m.isActive === false ? "inactive" : ""].filter(Boolean).join(" · "), m: "+" + crNum(m.xp || 0) + " XP", onClick: () => crMisEdit(ctx, m) })) });
      }
      return out;
    },
  },
});

/* ============================================================================
   How members are doing — learning here and outside NGG (domain/achievements.php).

   Members log what they learnt on other sites and apps, with a video,
   screenshots or pictures and notes; an instructor confirms it or sends it back
   with a note the member reads. A platform's own progress report can be brought
   in for a whole class: checked first (who it matched, who it could not), then
   added, confirmed. Below, every member in the admin's centres: lessons done
   here, average best score, outside learning and its hours, days attended in
   the last 90, and when they last learnt anything.
   ========================================================================== */
const CR_LO_ST = { pending: ["Waiting", "warn"], confirmed: ["Confirmed", "ok"], returned: ["Sent back", "bad"] };
/* A report's column, by any of the names platforms give it. */
function crLoCol(r, names) { for (const n of names) { const k = Object.keys(r).find(x => x === n || x.replace(/[^a-z]/g, "") === n.replace(/[^a-z]/g, "")); if (k && String(r[k]).trim() !== "") return String(r[k]).trim(); } return ""; }
function crLoReportRows(rows) {
  return rows.map(r => ({
    id: crLoCol(r, ["printed_id", "member_id", "id", "student_id", "ngg_id"]),
    name: crLoCol(r, ["name", "full_name", "student", "learner", "student_name"]),
    title: crLoCol(r, ["title", "course", "module", "lesson", "activity", "skill"]),
    progress: crLoCol(r, ["progress", "percent", "completion", "score", "mastery"]),
    hours: crLoCol(r, ["hours", "time_spent", "time"]).replace(/[^\d.]/g, ""),
    doneOn: crLoCol(r, ["date", "completed", "done_on", "completed_on", "last_activity"]).slice(0, 10),
    notes: crLoCol(r, ["notes", "note", "comment"]),
  })).filter(r => (r.id || r.name) && r.title);
}
function crLoImport(ctx) {
  ctx.form({
    title: "Bring in a platform’s report", submit: "Check it", busyLabel: "Checking…",
    intro: "A progress export from the outside platform (CSV or Excel). Each row is matched to a member by printed ID, or by name; anybody it can’t match is listed, never guessed. Nothing is added until you look at the check.",
    values: { platform: "", file: null },
    fields: [
      { id: "platform", l: "Platform", req: true, ph: "e.g. Khan Academy, freeCodeCamp, Scratch", max: 120 },
      { id: "file", l: "File", type: "file", req: true, accept: ".csv,.xlsx,text/csv", help: "Columns it reads: name or printed ID, and the course or module. Progress, hours, date and notes if it has them." },
    ],
    onSubmit: async v => {
      const rows = crLoReportRows(await crCurReadFile(v.file));
      if (!rows.length) return { fieldErrors: { file: "No rows with a name (or printed ID) and a course were found." } };
      const r = await NGGApi.admin.learning.importRows(v.platform.trim(), rows, false);
      ctx.setData(x => Object.assign({}, x, { loPlan: { platform: v.platform.trim(), rows, check: r } }));
      return r;
    },
    done: (v, r) => crPlural(r.add, "row") + " would be added" + (r.refused ? " · " + crPlural(r.refused, "row") + " couldn’t be matched" : "") + ".",
  });
}
function crLoReview(ctx, ids, decision) {
  if (decision === "confirmed") return NGGApi.admin.learning.review(ids, "confirmed").then(r => { ctx.toast(crPlural(r.applied, "entry", "entries") + " confirmed" + (r.results.some(x => !x.ok) ? " · some refused" : "")); ctx.reload(); return r; });
  return new Promise(res => ctx.form({
    title: "Send back " + crPlural(ids.length, "entry", "entries"), submit: "Send back",
    values: { note: "" }, fields: [{ id: "note", l: "What is missing", type: "textarea", req: true, max: 500, ph: "e.g. The video doesn’t show the finished project. Add a screenshot of the last step." }],
    onSubmit: async v => { const r = await NGGApi.admin.learning.review(ids, "returned", v.note.trim()); ctx.reload(); res(r); return r; },
    done: (v, r) => crPlural(r.applied, "entry", "entries") + " sent back, with your note.",
  }));
}
Object.assign(CR_TAB_DEFS, {
  outside: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const [p, c, r, ov] = await Promise.all([NGGApi.admin.learning.list("pending"), NGGApi.admin.learning.list("confirmed"), NGGApi.admin.learning.list("returned"), NGGApi.admin.learning.overview()]);
      return { entries: [].concat(p.entries || [], c.entries || [], r.entries || []), counts: p.counts || {}, members: ov.members || [] };
    },
    facts: d => "Outside learning: " + crNum(d.counts.pending || 0) + " waiting for an instructor, " + crNum(d.counts.confirmed || 0) + " confirmed; " + crNum(d.members.length) + " members in view.",
    actions: (d, ctx) => [{ l: "Bring in a report", icon: "upload-simple", primary: true, run: () => crLoImport(ctx), disabled: !ctx.can("curriculum"), why: "Needs the Curriculum permission." }],
    blocks: (d, ctx) => {
      const P = d.loPlan, out = [];
      const quiet = d.members.filter(m => !m.lastLearnt || m.lastLearnt < crCfIsoDay(-30)).length;
      out.push({ type: "kpis", span: 6, items: [
        { l: "Waiting to be confirmed", v: crNum(d.counts.pending || 0), dn: "logged by members", tone: (d.counts.pending || 0) ? "warn" : "flat" },
        { l: "Confirmed outside learning", v: crNum(d.counts.confirmed || 0), dn: "counts towards achievements" },
        { l: "Members in view", v: crNum(d.members.length), dn: "active NGG members" },
        { l: "Nothing learnt in 30 days", v: crNum(quiet), dn: "here or outside", tone: quiet ? "down" : "flat" },
      ] });
      if (P) {
        const bad = (P.check.rows || []).filter(x => !x.ok);
        out.push({ type: "note", span: 6, icon: "file-arrow-up", tone: bad.length ? "warn" : null,
          text: P.platform + ": " + crPlural(P.check.add, "row") + " to add" + (bad.length ? ", " + crPlural(bad.length, "row") + " not matched" : "") + ".",
          sub: bad.length ? bad.slice(0, 8).map(x => "Row " + x.row + ": " + (x.detail || x.error)).join(" · ") + (bad.length > 8 ? " · …" : "") : "Every row found its member. They arrive confirmed — the platform’s report is the evidence.",
          act: P.check.add ? { l: "Add " + crPlural(P.check.add, "row"), run: async () => { const r = await NGGApi.admin.learning.importRows(P.platform, P.rows, true); ctx.setData(x => Object.assign({}, x, { loPlan: null })); ctx.toast(crPlural(r.add, "entry", "entries") + " added from " + P.platform); ctx.reload(); } }
            : { l: "Close", run: () => ctx.setData(x => Object.assign({}, x, { loPlan: null })) } });
      }
      out.push({ type: "table", span: 6, title: "Learning outside NGG", sub: "Logged by members with a video, pictures or notes, or brought in from a report",
        cols: ["Member", "What", "Where", "Evidence", "Status"], filters: ["Status"], search: true, emptyText: "Nothing logged yet. Members add it from Records → Learning outside NGG.",
        bulk: ctx.can("curriculum") ? [{ l: "Confirm", max: 300, run: keys => crLoReview(ctx, keys, "confirmed") }, { l: "Send back…", max: 300, run: keys => crLoReview(ctx, keys, "returned") }] : [],
        rows: d.entries.map(x => ({ key: x.entryId,
          cells: [{ k: "person", t: x.fullName || x.memberId, s: [x.displayId, x.centre].filter(Boolean).join(" · ") }, { k: "text", t: x.title, s: [x.progress, x.hours ? x.hours + " h" : "", x.doneOn].filter(Boolean).join(" · ") },
            { k: "text", t: x.platform, s: x.source === "report" ? "From a report" : "Logged by them" }, { k: "text", t: (x.media || []).length ? crPlural(x.media.length, "file") : x.link ? "A link" : "Notes" },
            { k: "status", t: (CR_LO_ST[x.status] || [x.status])[0], tone: (CR_LO_ST[x.status] || [0, "flat"])[1] }],
          open: () => ctx.drawer({ title: x.title, sub: (x.fullName || x.memberId) + " · " + x.platform, icon: "globe",
            stats: [["Status", (CR_LO_ST[x.status] || [x.status])[0]], ["Hours", x.hours ? String(x.hours) : "—"], ["Done", x.doneOn ? crDate(x.doneOn) : "—"]],
            fields: [["How far", x.progress || "—"], ["Link", x.link || "—"], ["Their notes", x.notes || "—"]].concat(x.reviewNote ? [["Instructor’s note", x.reviewNote]] : []),
            sections: [{ h: "Video, screenshots and pictures", list: (x.media || []).map((m, i) => ({ icon: m.kind === "video" ? "video" : m.kind === "pdf" ? "file-pdf" : "image", t: (m.kind === "video" ? "Video " : m.kind === "pdf" ? "Document " : "Picture ") + (i + 1), s: m.url, onClick: () => window.open(m.url, "_blank", "noopener") })), empty: "None — notes or a link only." }],
            actions: ctx.can("curriculum") && x.status !== "confirmed" ? [{ l: "Confirm", primary: true, run: () => crLoReview(ctx, [x.entryId], "confirmed").then(() => ctx.closeDrawer()) }].concat(x.status === "pending" ? [{ l: "Send back…", run: () => { ctx.closeDrawer(); crLoReview(ctx, [x.entryId], "returned"); } }] : []) : [] }) })) });
      out.push({ type: "table", span: 6, title: "How each member is doing", sub: "Lessons here, outside learning, attendance in the last 90 days, and when they last learnt anything",
        cols: ["Member", "#Lessons done", "#Average score", "#Outside", "#Days in 90", "Last learnt"], search: true, nosel: true,
        emptyText: "No active NGG members in your centres.",
        rows: d.members.map(m => ({ key: m.memberId,
          cells: [{ k: "person", t: m.fullName, s: [m.displayId, m.centre, m.track].filter(Boolean).join(" · ") }, { k: "num", t: crNum(m.lessons), v: m.lessons },
            { k: "num", t: m.avgPct === null ? "—" : m.avgPct + "%", v: m.avgPct === null ? -1 : m.avgPct },
            { k: "num", t: crNum(m.outside) + (m.outsideHours ? " · " + m.outsideHours + " h" : "") + (m.waiting ? " · " + m.waiting + " waiting" : ""), v: m.outside },
            { k: "num", t: crNum(m.days90), v: m.days90 }, { k: "text", t: m.lastLearnt ? crDate(m.lastLearnt) : "Never", s: !m.lastLearnt || m.lastLearnt < crCfIsoDay(-30) ? "Over a month ago" : "" }],
          open: () => crLoMember(ctx, m) })) });
      return out;
    },
  },
});
/* One member: their achievements, and a recognition given by staff. */
async function crLoMember(ctx, m) {
  let A; try { A = await NGGApi.admin.learning.achievements(m.memberId); } catch (e) { return ctx.toast(crErr(e, "Couldn’t open their achievements."), null, true); }
  ctx.drawer({ title: m.fullName, sub: [m.displayId, m.centre].filter(Boolean).join(" · "), name: m.fullName,
    stats: [["Days attended", crNum(A.stats.days)], ["Best streak", crNum(A.stats.bestStreak)], ["Lessons done", crNum(A.stats.lessons)]],
    sections: [{ h: "Achievements", list: A.items.map(x => ({ icon: x.icon || "medal", t: x.t, s: x.s, m: x.kind === "award" && ctx.can("people") ? "Remove" : "",
        onClick: x.kind === "award" && ctx.can("people") ? async () => { if (!(await ctx.confirm({ title: "Remove “" + x.t + "”?", body: "It comes off their record and their family’s view.", cta: "Remove", danger: true }))) return; await NGGApi.admin.learning.awardRemove(x.awardId); ctx.closeDrawer(); ctx.toast("Removed"); } : undefined })),
      empty: "Nothing yet." }, { h: "Next", list: A.next.map(x => ({ icon: x.icon, t: x.t })), empty: "—" }],
    actions: ctx.can("people") ? [{ l: "Give a recognition…", primary: true, run: () => { ctx.closeDrawer(); ctx.form({ title: "Recognise " + m.fullName, submit: "Give it",
      intro: "It appears on their Records and their family’s Growth page.",
      values: { name: "", category: "academic", period: "", note: "" },
      fields: [{ id: "name", l: "For", req: true, max: 120, ph: "e.g. Best in Coding, Most consistent" }, { id: "category", l: "Kind", type: "select", req: true,
        opts: [["academic", "Academic"], ["consistency", "Consistency"], ["conduct", "Conduct"], ["leadership", "Leadership"], ["creativity", "Creativity"], ["service", "Service"], ["sport", "Sport"], ["other", "Other"]] },
        { id: "period", l: "When (optional)", max: 60, ph: "e.g. Term 1 2026, October" }, { id: "note", l: "Note (optional)", type: "textarea", max: 240 }],
      onSubmit: v => NGGApi.admin.learning.award(m.memberId, { name: v.name.trim(), category: v.category, period: v.period.trim(), note: v.note.trim() }),
      done: "Recognition given" }); } }] : [] });
}
