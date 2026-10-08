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

function crCurParseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  /* Excel saves "CSV" with semicolons where the comma is the decimal mark, and
     some sheets are pasted as tabs. The header line says which. */
  const first = s.split(/\r?\n/, 1)[0] || "";
  const cnt = (ch) => first.split(ch).length - 1;
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
  if (!clean.length) return [];
  const head = clean[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  return clean.slice(1).map(r => { const o = {}; head.forEach((h, k) => { o[h] = (r[k] ?? "").trim(); }); return o; });
}

async function crCurXlsxRows(buf) {
  const JSZip = await loadVendor("jszip");
  const zip = await JSZip.loadAsync(buf);
  const xml = async (p) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null; };
  const shared = [];
  const ss = await xml("xl/sharedStrings.xml");
  if (ss) Array.from(ss.getElementsByTagName("si")).forEach(si => shared.push(Array.from(si.getElementsByTagName("t")).map(t => t.textContent).join("")));
  // The first sheet in the workbook's own order, not whichever file is sheet1.
  let path = "xl/worksheets/sheet1.xml";
  const wb = await xml("xl/workbook.xml"), rels = await xml("xl/_rels/workbook.xml.rels");
  const firstSheet = wb && wb.getElementsByTagName("sheet")[0];
  if (firstSheet && rels) {
    const rid = firstSheet.getAttribute("r:id") || firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === rid);
    if (rel) { const t = rel.getAttribute("Target").replace(/^\//, ""); path = t.startsWith("xl/") ? t : "xl/" + t; }
  }
  const sheet = await xml(path);
  if (!sheet) throw new Error("That workbook has no sheet I can read.");
  const colIdx = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const grid = Array.from(sheet.getElementsByTagName("row")).map(r => {
    const out = [];
    Array.from(r.getElementsByTagName("c")).forEach(c => {
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
      let val = "";
      if (t === "s") val = shared[+((v && v.textContent) || 0)] || "";
      else if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map(x => x.textContent).join("");
      else val = v ? v.textContent : "";
      out[colIdx(c.getAttribute("r"))] = String(val).trim();
    });
    return Array.from(out, x => x || "");
  }).filter(r => r.some(x => x !== ""));
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
    return Array.isArray(j) ? j : (j.units || j.lessons || []);
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

Object.assign(CR_TAB_DEFS, {
  curriculum: {
    skeleton: ["table"],
    load: async ctx => {
      const [list, seeds] = await Promise.all([
        NGGApi.admin.curriculum.list({}),
        ctx.can("curriculum") ? NGGApi.admin.curriculum.seed().catch(() => ({ seeds: [] })) : { seeds: [] },
      ]);
      return { units: list.units || [], canWrite: !!list.canWrite, seeds: seeds.seeds || [], plan: (ctx.data && ctx.data.plan) || null };
    },
    actions: (d, ctx) => d.canWrite ? [
      { l: "Import lessons", icon: "upload-simple", primary: true, run: () => crCurImport(ctx) },
      d.plan ? { l: "Discard the check", icon: "x", run: () => ctx.setData(x => Object.assign({}, x, { plan: null })) } : null,
      { l: "Download template", icon: "download-simple", run: () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([CR_CUR_TEMPLATE], { type: "text/csv" }));
        a.download = "ngg-curriculum-template.csv"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } },
    ] : [],
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
      out.push({ type: "table", span: 6, title: "Lessons", sub: crPlural(d.units.length, "lesson") + " · retired lessons are hidden",
        cols: ["Lesson", "Course", { l: "Week", num: true }, "Status", { l: "Checks", num: true }, { l: "Completed", num: true }],
        rows: d.units.map(u => ({ key: u.unitId, cells: [
          { k: "strong", t: u.title || "(no title)", s: u.level || "" },
          { k: "text", t: u.course || "—" },
          { k: "num", t: crNum(u.week) + "." + u.position, v: u.week * 100 + u.position },
          { k: "status", t: st(u.status)[0], tone: st(u.status)[1] },
          { k: "num", t: crNum(u.checks), v: u.checks },
          { k: "num", t: crNum(u.progress && u.progress.completed), v: (u.progress && u.progress.completed) || 0 },
        ] })),
        search: "Search lessons", filters: ["Course", "Status"],
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
  sessions: crPanel(() => <AdminSessions/>),
  missions: crPanel(() => <AdminMissions/>),
  assignments: crPanel(() => <AdminAssignments/>),
  anchor: crPanel(() => <AdminAnchor/>),
  timetable: crPanel(() => <AdminTimetable/>),
});

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
