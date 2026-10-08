/* ============================================================================
   Control Room v2 — the members tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   PROGRESS (for a resumed run): roster — written; quality, families, centres,
   idcards — not started.

   Roster: the server pages, searches, filters and sorts (admin_members_list);
   a row opens the member's record, and Edit sends ONLY the fields changed on
   screen, so a stale page cannot overwrite somebody else's edit to a field it
   did not show. Role is not edited here — staff access lives in Access & roles,
   where the last-super-admin rule is. Bulk runs through admin.members.bulk,
   whose guards (own account, staff accounts, centre scope, the 500 cap) are
   the server's; the per-row verdicts are reported, never a bare "done".

   The full record is a page of its own at /control/members/members/<memberId>
   (the palette's member search lands there): every part of v1's record drawer
   and its tabs, as blocks. The roster import is checked first and written
   second, in place of the roster, the same way the curriculum import is.
   ========================================================================== */

const CR_MEM_STATUS = [["active", "Active"], ["graduated-ngg", "Graduated NGG"], ["graduated-vanguard", "Graduated Vanguard"], ["suspended", "Suspended"], ["inactive", "Inactive"]];
const CR_MEM_TYPE = [["NGG", "NGG member"], ["Summer", "Summer School"]];
const CR_MEM_TONE = { active: "ok", suspended: "bad", inactive: "neutral", "graduated-ngg": "gold", "graduated-vanguard": "gold" };
/* Column index → the server's allow-listed sort key (admin_members_list).
   Division and level are not sortable on the server, so they are not offered. */
const CR_MEM_SORT = { 0: "fullName", 1: "centre", 3: "type", 5: "status", 6: "joined" };
const CR_MB_LEVELS = "ABCDEFG".split("");
/* What is missing from a member's ID card — the values of $missingSql. */
const CR_MB_MISSING = [["photo", "No photograph"], ["printedId", "No printed ID"], ["discipline", "No discipline"]];
/* The roster filtered to exactly what a dashboard figure counted (member_segment_sql). */
const CR_MB_SEG = {
  no_email: "members with no email address", no_phone: "members with no phone number", no_centre: "members not in any centre",
  unknown_centre: "members filed under a centre that no longer exists", no_dob: "members with no date of birth",
  minor_no_guardian: "members under 18 with no guardian contact", dormant: "active members with nothing recorded for 60 days",
  no_consent: "members with no publication consent recorded", fined: "members who have been fined", fines_owed: "members owing a fine",
  suspended: "members suspended now", evicted: "members evicted under the policy", conduct_review: "members with a sanction awaiting a decision",
  promoted_ngv: "members promoted to NGV",
};
const CR_MB_CONSENT_METHODS = ["Paper form", "Parent portal", "By phone", "In person", "Email/SMS reply"];
const CR_MB_CONSENT_TYPES = [["site_visibility", "Feature on our website", "Their first name and last initial may be shown."], ["media", "Photos and media", "Their photograph may be published — needs the one above as well."]];
const CR_MB_NGV_ROLES = [["volunteer", "Volunteer"], ["instructor", "Instructor"], ["mentor", "Mentor"]];

/* A club admin's edit is queued for a second admin, not refused (domain/approvals.php):
   the server answers approval_pending, which is an outcome to report, not an error. */
async function crMemQueued(p) {
  try { return await p; }
  catch (e) { if (e && e.code === "approval_pending") return { queued: true }; throw e; }
}
/* When they joined: the roster's date, else the day the record was made. The
   roster table used to show only the second, so an imported roster read as
   everybody having joined on the day of the import. */
function crMemJoined(m) { return m.joinDate ? crDate(m.joinDate) : m.createdAt ? crDate(m.createdAt) : ""; }
function crMemStatusLabel(s) { const f = CR_MEM_STATUS.find(x => x[0] === s); return f ? f[1] : (s || "—"); }
function crMbPhoto(u) { return nggPhotoSrc(u); }

/* The editable fields, once: the Add form and the Edit form are the same form. */
function crMemFields(centres, divisions) {
  return [
    { id: "fullName", l: "Full name", req: true, max: 120 },
    { id: "email", l: "Email", type: "email", email: true, help: "The address they sign in with." },
    { id: "phone", l: "Phone", type: "tel", im: "tel" },
    { id: "type", l: "Programme", type: "chips", req: true, opts: CR_MEM_TYPE },
    { id: "status", l: "Status", type: "select", req: true, opts: CR_MEM_STATUS },
    { id: "centre", l: "Centre", type: "select", ph: "No centre", opts: centres.map(c => [c, c]) },
    { id: "division", l: "Division", type: "select", ph: "Not placed yet", opts: divisions.map(d => [d.id, d.name]) },
    { id: "level", l: "Level", max: 1, ph: "A", help: "One letter, as on the roster workbook.", check: v => /^[A-Za-z]$/.test(v) ? "" : "Use one letter." },
    { id: "track", l: "Track", max: 64, ph: "Music" },
    { id: "disciplines", l: "Disciplines on the card", max: 60, ph: "TECH, MEDIA", help: "One or two, comma-separated. Blank shows the track." },
    { id: "displayId", l: "Printed ID", max: 24, help: "Leave blank and a new member is given the next number. A printed ID is never reissued." },
    { id: "photo", l: "Photograph", type: "file", accept: "image/*", help: "A head-and-shoulders photo for the ID card. Leave empty to keep the one on file." },
    { id: "dob", l: "Date of birth", type: "date" },
    { id: "joinDate", l: "Date joined", type: "date", help: "The day they joined NGG, as on the roster. Blank shows the day the record was made." },
    { id: "school", l: "School", max: 160 },
    { id: "parentName", l: "Parent or guardian", max: 120 },
    { id: "parentPhone", l: "Guardian phone", type: "tel", im: "tel" },
    { id: "parentEmail", l: "Guardian email", type: "email", email: true },
    { id: "notes", l: "Staff notes", type: "textarea", rows: 3, max: 2000, help: "Staff see these. The member does not." },
  ];
}
const CR_MEM_KEYS = ["fullName", "email", "phone", "type", "status", "centre", "division", "level", "track", "disciplines", "displayId", "dob", "joinDate", "school", "parentName", "parentPhone", "parentEmail", "notes"];
function crMemValues(m) { const v = {}; CR_MEM_KEYS.forEach(k => { v[k] = m && m[k] != null ? String(m[k]) : ""; }); return v; }
/** What changed on screen, and nothing else. */
function crMemPatch(before, after) {
  const out = {};
  CR_MEM_KEYS.forEach(k => { const a = String(after[k] == null ? "" : after[k]).trim(); if (a !== String(before[k] == null ? "" : before[k]).trim()) out[k] = k === "level" ? a.toUpperCase() : a; });
  return out;
}
/** A chosen photograph → the photoUrl the record stores (uploaded, or inline when uploads are off). */
async function crMbPhotoUrl(file) {
  if (!file || typeof file === "string") return "";
  const r = await NGGApi.uploadOrInline(file, "headshot");
  return (r && r.url) || "";
}

/** A bulk run's verdicts as one sentence: applied, unchanged, refused (with why). */
function crBulkSummary(r, verb) {
  const res = (r && r.results) || [];
  const bad = res.filter(x => !x.ok);
  const same = res.filter(x => x.ok && x.unchanged).length;
  const why = {};
  bad.forEach(x => { const k = crErr({ code: x.error }, String(x.error || "refused").replace(/_/g, " ")); why[k] = (why[k] || 0) + 1; });
  const parts = [crNum(r.applied || 0) + " " + verb];
  if (same) parts.push(crNum(same) + " already so");
  if (bad.length) parts.push(crNum(bad.length) + " refused — " + Object.keys(why).map(k => why[k] + " × " + k.replace(/\.$/, "")).join("; "));
  return { text: parts.join(" · "), bad: bad.length > 0 };
}

async function crMemOpen(ctx, memberId) {
  let d;
  try { d = (await NGGApi.admin.memberDetail(memberId)).detail; }
  catch (e) { ctx.toast(crErr(e, "Couldn’t open that record."), null, true); return; }
  const m = d.member || {}, data = ctx.data || {};
  const div = (data.divisions || []).find(x => x.id === m.division);
  ctx.drawer({
    title: m.fullName || memberId, name: m.fullName, photo: crMbPhoto(m.photoUrl),
    sub: [m.displayId || m.memberId, m.centre, m.type === "Summer" ? "Summer School" : "NGG"].filter(Boolean).join(" · "),
    stats: [["XP", crNum(d.stats && d.stats.xp)], ["Missions verified", crNum(d.progress && d.progress.verified)], ["Streak", crNum(d.stats && d.stats.streak)]],
    fields: [["Status", crMemStatusLabel(m.status)], ["Member ID", m.memberId], ["Printed ID", m.displayId], ["Email", m.email], ["Phone", m.phone],
      ["Centre", m.centre], ["Division", div ? div.name : (m.division || "Not placed")], ["Level", m.level], ["Track", m.track], ["School", m.school],
      ["Date of birth", m.dob ? crDate(m.dob) : ""], ["Joined", crMemJoined(m)]],
    sections: [
      { h: "Parent or guardian", rows: [["Name", m.parentName], ["Phone", m.parentPhone], ["Email", m.parentEmail]] },
      { h: "Mentor", rows: [["Mentor", d.mentor ? d.mentor.fullName : "None assigned"]] },
      m.notes ? { h: "Staff notes", text: m.notes } : null,
    ],
    actions: [
      { l: "Edit", primary: true, run: () => crMemEdit(ctx, m) },
      { l: "Open full record", run: () => { ctx.closeDrawer(); ctx.setSub(m.memberId); } },
    ],
  });
}

function crMemEdit(ctx, m, after) {
  const data = ctx.data || {};
  const before = crMemValues(m);
  ctx.closeDrawer();
  ctx.form({
    title: "Edit " + (m.fullName || "member"), submit: "Save changes", busyLabel: "Saving…",
    /* A field whose STORED value already breaks its own format rule ("N/A" for
       an email) is not checked here: the rule would refuse every save of the
       record for a field nobody touched. The server still checks it if changed. */
    values: before, fields: crMemFields(data.centres || [], data.divisions || []).map(f => {
      const v = before[f.id];
      if (!v) return f;
      const breaks = (f.email && !/^\S+@\S+\.\S+$/.test(v)) || (f.check && f.check(v, before)) || (f.max && v.length > f.max);
      return breaks ? Object.assign({}, f, { email: false, check: null, max: null, help: "The stored value isn’t in the usual format. Correct it if you can." }) : f;
    }),
    onSubmit: async v => {
      const patch = crMemPatch(before, v);
      const photoUrl = await crMbPhotoUrl(v.photo);
      if (photoUrl) patch.photoUrl = photoUrl;
      if (!Object.keys(patch).length) return { nothing: true };
      const r = await crMemQueued(NGGApi.admin.members.upsert(Object.assign({ memberId: m.memberId }, patch)));
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
      if (after) after();
      return Object.assign({ n: Object.keys(patch).length }, r);
    },
    done: (v, r) => r && r.nothing ? "Nothing changed." : crQueued(r) ? "Sent to a second admin to approve." : "Saved · " + (v.fullName || m.fullName),
  });
}

function crMemAdd(ctx) {
  const data = ctx.data || {};
  ctx.form({
    title: "Add member", submit: "Add member", busyLabel: "Adding…",
    intro: "They get a member record and, as an NGG member, the next printed ID.",
    values: Object.assign(crMemValues({}), { type: "NGG", status: "active", centre: (data.centres || []).length === 1 ? data.centres[0] : "" }),
    fields: crMemFields(data.centres || [], data.divisions || []),
    onSubmit: async v => {
      const row = {}; CR_MEM_KEYS.forEach(k => { if (String(v[k] || "").trim() !== "") row[k] = k === "level" ? String(v[k]).trim().toUpperCase() : String(v[k]).trim(); });
      const photoUrl = await crMbPhotoUrl(v.photo);
      if (photoUrl) row.photoUrl = photoUrl;
      const r = await crMemQueued(NGGApi.admin.members.upsert(row));
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
      return r;
    },
    done: (v, r) => crQueued(r) ? "Sent to a second admin to approve." : "Added · " + v.fullName + (r && r.memberId ? " · " + r.memberId : ""),
  });
}

/* A bulk action asks for its value first, naming the count it will act on —
   read now, before the question, so a refresh cannot change it. `payload`
   turns the form's values into what the bulk op reads. */
function crMemBulk(ctx, op, title, fields, verb, opts) {
  const o = opts || {};
  return async keys => {
    const n = keys.length;
    ctx.form({
      title: title + " · " + crPlural(n, "member"), submit: "Apply to " + crPlural(n, "member"),
      intro: (o.intro ? o.intro + " " : "") + "This applies to the " + crPlural(n, "member") + " selected now. Staff accounts and your own are refused, and named.",
      values: o.values || {},
      fields: Array.isArray(fields) ? fields : [fields],
      onSubmit: async v => {
        const payload = o.payload ? o.payload(v) : { [(Array.isArray(fields) ? fields[0] : fields).id]: v[(Array.isArray(fields) ? fields[0] : fields).id] };
        const r = await crMemQueued(NGGApi.admin.members.bulk(op, keys, payload));
        if (r.queued) { ctx.toast("Sent to a second admin to approve."); return r; }
        const s = crBulkSummary(r, verb);
        ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
        ctx.toast(s.text, null, s.bad);
        return r;
      },
      done: null,
    });
  };
}

/* ── Roster: what the table is showing, kept for the export and the print ──
   The table owns its search, chips and sort; the header's Export reads them
   from here so the file is the roster the operator is looking at. */
const crMemCtx = { current: null };
const crMbLast = { current: { q: "", filters: {}, sort: null } };
/* A segment handed over by another tab (Data quality) before it navigates here. */
const crMbPending = { seg: "" };
function crMbQuery(d, q, filters) {
  const f = filters || {};
  return { q: q || "", status: f.status || "", type: f.type || "", centre: f.centre || "", level: f.level || "", missing: f.missing || "", segment: d.seg || "" };
}

/* The table re-fetches whenever its `server` object changes, so it is made ONCE
   per load (and again only when the segment changes) and reads the live ctx
   through a ref — a fresh object per render is a fetch loop. */
function crMemServer(d) {
  const divName = id => { const x = (d.divisions || []).find(v => v.id === id); return x ? x.name : ""; };
  return {
    sortKeys: CR_MEM_SORT,
    fetch: async ({ q, filters, sort, page, pageSize }) => {
      crMbLast.current = { q, filters, sort };
      const r = await NGGApi.admin.members.list(Object.assign(crMbQuery(d, q, filters), { page: page + 1, pageSize, sort: sort ? CR_MEM_SORT[sort.ci] || "" : "", dir: sort ? sort.dir : "" }));
      return {
        total: r.total || 0,
        rows: (r.members || []).map(m => ({
          key: m.memberId,
          cells: [
            { k: "person", t: m.fullName || m.memberId, s: [m.displayId || m.memberId, m.email].filter(Boolean).join(" · "), photo: crMbPhoto(m.photoUrl) },
            { k: "text", t: m.centre || "—" },
            { k: "text", t: divName(m.division) || "Not placed", s: m.track || "" },
            { k: "text", t: m.type === "Summer" ? "Summer School" : "NGG" },
            { k: "mono", t: m.level || "—" },
            { k: "status", t: crMemStatusLabel(m.status), tone: CR_MEM_TONE[m.status] || "neutral" },
            { k: "text", t: crMemJoined(m) || "—" },
          ],
          open: () => crMemOpen(crMemCtx.current, m.memberId),
        })),
      };
    },
  };
}
function crMbWithSeg(x, seg) {
  const n = Object.assign({}, x, { seg: seg || "" });
  n.server = crMemServer(n);
  return n;
}
function crMbSortCol(sort) { return sort ? CR_MEM_SORT[sort.ci] || "" : ""; }

async function crMbExport(ctx, onlyKeys) {
  const d = ctx.data || {}, last = crMbLast.current;
  try {
    const r = await NGGApi.admin.members.list(Object.assign(crMbQuery(d, last.q, last.filters), { all: 1, sort: crMbSortCol(last.sort), dir: last.sort ? last.sort.dir : "" }));
    let out = r.members || [];
    if (onlyKeys) { const want = new Set(onlyKeys); out = out.filter(m => want.has(m.memberId)); }
    if (!out.length) return ctx.toast("Nothing to export — no member matches.", null, true);
    crDownloadCsv("members", ["memberId", "displayId", "fullName", "email", "type", "status", "centre", "level", "track", "division", "joinDate"],
      out.map(m => [m.memberId, m.displayId || "", m.fullName, m.email, m.type, m.status, m.centre, m.level || "", m.track || "", m.division || "", m.joinDate || ""]));
    ctx.toast("Exported " + crPlural(out.length, "member") + (r.total > out.length && !onlyKeys ? " (the first " + crNum(out.length) + " of " + crNum(r.total) + ")" : ""));
  } catch (e) { ctx.toast(crErr(e, "Couldn’t export the roster."), null, true); }
}

/* Cards for everybody who came in before cards existed. Bounded per call on
   the server; repeated until none remain. Nobody's existing card is replaced. */
async function crMbIssueCards(ctx) {
  const ok = await ctx.confirm({ title: "Give every member a gate card?", cta: "Issue cards",
    body: "Members with no card get a new secure card for the CACENTRE gate. The member number on the card they already hold is recorded too, so it keeps working until they are reprinted. Nobody’s existing card is replaced." });
  if (!ok) return;
  let issued = 0, printed = 0;
  try {
    for (let i = 0; i < 20; i++) {
      const r = await NGGApi.admin.members.cards.backfill();
      issued += r.issued || 0; printed += r.printed || 0;
      if (!r.remaining || !r.issued) break;
    }
    ctx.toast("Cards issued · " + crPlural(issued, "secure card") + " · " + crPlural(printed, "printed card") + " recorded");
  } catch (e) { ctx.toast(crErr(e, "Couldn’t issue cards."), null, true); }
}

/* New promotions reach Afrovanguard on their own; this is for the vanguards
   promoted before that, and is safe to repeat (Afrovanguard keys on the id). */
async function crMbSyncNgv(ctx) {
  const ok = await ctx.confirm({ title: "Send NGVs to Afrovanguard?", cta: "Send them",
    body: "Everybody promoted to NGV gets their NGV account on Afrovanguard. Safe to repeat: nobody is created twice." });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.members.ngvPortalSync();
    ctx.toast(crNum(r.delivered) + " of " + crNum(r.announced) + " sent now. Any others are queued and retried.");
  } catch (e) { ctx.toast(crErr(e, "Couldn’t send them."), null, true); }
}

/* ── Roster import: checked, then written ─────────────────────────────────
   The file the extractor produced (tools/ngg-import/extract.js) travels as
   ONE value (api-client rosterOneValueBody). The apply sends back the check's
   digest, so the roster somebody read is the roster that is written. */
async function crMbSha(buf) {
  if (!(window.crypto && window.crypto.subtle)) return "";
  try { return Array.from(new Uint8Array(await window.crypto.subtle.digest("SHA-256", buf))).map(b => b.toString(16).padStart(2, "0")).join(""); }
  catch (_) { return ""; }
}
async function crMbImport(ctx) {
  let formats = [];
  try { formats = (await NGGApi.admin.members.cards.formats()).formats || []; } catch (_) {}
  const prev = (ctx.data || {}).imp;
  ctx.form({
    title: "Import roster", submit: "Check what would change", busyLabel: "Checking…",
    intro: "Loads the roster file made from the members workbook by node tools/ngg-import/extract.js. Members are matched on their printed ID, so running it twice updates the same people instead of adding copies. Nothing is written until you have read the check. The file holds children’s personal data — delete your copy once this has run.",
    values: { cardFormat: prev ? prev.opts.cardFormat : (formats.some(f => f.id === "member-number") ? "member-number" : ""), idStrict: prev ? prev.opts.idStrict : true, overwrite: prev ? prev.opts.overwrite : false },
    fields: [
      { id: "file", l: "Roster file", type: "file", req: !prev, accept: "application/json,.json", help: prev ? "Leave empty to check " + prev.file.source + " again." : "The .json file the extractor wrote." },
      { id: "cardFormat", l: "Cards these members already hold", type: "select", ph: "None — they hold no card yet", opts: formats.map(f => [f.id, f.label]),
        help: "Everybody imported gets a new secure card for the gate either way. This says how the card already in their wallet reads, so it keeps opening the door until they are reprinted." },
      { id: "idStrict", l: "Refuse member IDs that fit no declared ID format", type: "switch", help: "Today’s format is 023-001. A typo filed as an ID is a card nobody can scan." },
      { id: "overwrite", l: "Replace values the record already has", type: "switch", help: "Off: existing values are kept and only blanks are filled." },
    ],
    onSubmit: async v => {
      let file = prev && prev.file;
      if (v.file) {
        try {
          const bytes = await v.file.arrayBuffer();
          const text = new TextDecoder().decode(bytes);
          const parsed = JSON.parse(text);
          const members = Array.isArray(parsed) ? parsed : parsed.members;
          if (!Array.isArray(members) || !members.length) throw new Error("no members in that file");
          file = { source: parsed.source || v.file.name, members, warnings: parsed.warnings || [], fileSha: await crMbSha(bytes), text, bytes: v.file.size };
        } catch (ex) {
          return { fieldErrors: { file: "That isn’t a roster file. Run tools/ngg-import/extract.js on the workbook first." } };
        }
      }
      const opts = { cardFormat: v.cardFormat || "", idStrict: !!v.idStrict, overwrite: !!v.overwrite };
      const res = await NGGApi.admin.members.importRoster(file, Object.assign({ apply: false }, opts));
      ctx.setData(x => Object.assign({}, x, { imp: { file, opts, res, done: null } }));
      return res;
    },
    done: (v, r) => "Checked · " + crMbImpTally(r),
  });
}
function crMbImpTally(r) { r = r || {}; return [crNum(r.created) + " new", crNum(r.updated) + " updated", crNum(r.unchanged) + " already current", crNum(r.failed) + " unusable"].join(" · "); }
function crMbImpWrites(r) { return r ? (r.created || 0) + (r.updated || 0) : 0; }
function crMbImpApplyLabel(r) {
  if (crMbImpWrites(r) > 0) return "Import " + crPlural(crMbImpWrites(r), "record");
  if (r.cards && r.cards.wouldIssue > 0) return "Issue " + crPlural(r.cards.wouldIssue, "card");
  if (r.applicants && r.applicants.filed > 0) return "File " + crPlural(r.applicants.filed, "applicant");
  return "";
}
async function crMbImpApply(ctx) {
  const imp = (ctx.data || {}).imp; if (!imp) return;
  const p = imp.res;
  const ok = await ctx.confirm({
    title: crMbImpApplyLabel(p) + "?", danger: imp.opts.overwrite, cta: "Import roster",
    body: crNum(p.created) + " new, " + crNum(p.updated) + " updated" + (imp.opts.overwrite ? ". Replace is on — values already in the Control Room will be replaced." : ". Existing values are kept; only blanks are filled.")
      + (p.previous ? " This exact roster was already applied on " + crDate(p.previous.at) + "." : "") + " This can’t be undone from here.",
  });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.members.importRoster(imp.file, Object.assign({ apply: true, expectDigest: p.digest || "" }, imp.opts));
    ctx.setData(x => Object.assign({}, x, { imp: Object.assign({}, x.imp, { done: r }), rev: (x.rev || 0) + 1 }));
    ctx.toast("Roster imported · " + crNum(r.created) + " new · " + crNum(r.updated) + " updated" + (r.cards ? " · " + crPlural(r.cards.issued || 0, "card") + " issued" : ""));
  } catch (e) {
    /* roster_changed: the file in hand is not the one that was read — check again. */
    if (e && e.code === "roster_changed") ctx.setData(x => Object.assign({}, x, { imp: null }));
    ctx.toast(crErr(e, "The import failed."), null, true);
  }
}
function crMbImpIdList(imp, applied) {
  const what = { issued: applied ? "issued" : "to be issued", normalized: "sheet spells it differently", matched: "sheet has none" };
  crDownloadCsv("member-ids-" + String(imp.file.source || "roster").replace(/\.[a-z0-9]+$/i, "") + (applied ? "" : "-preview"),
    ["Name", "In the sheet", "Member ID", "What happened", "Record"],
    (((imp.done || imp.res) || {}).idList || []).map(r => [r.name, r.sheet, r.displayId, what[r.action] || r.action, r.memberId]));
}
/* Declare an ID shape the check found in the sheet, from its first example,
   then check the file again — the check it replaces promised the old answer. */
function crMbImpDeclare(ctx, u) {
  ctx.form({
    title: "Declare IDs like " + u.examples[0], submit: "Declare this format", busyLabel: "Declaring…",
    intro: "Declaring tells the importer these are real member IDs and the gate how to read the cards that carry them. If one is a typo, correct the sheet instead.",
    fields: [{ id: "year", l: "Intake year of " + u.examples[0], type: "number", im: "numeric", ph: "2023", help: "So members with this shape of ID land in the right intake.",
      check: v => (+v >= 2000 && +v <= new Date().getFullYear() + 1) ? "" : "Enter a year from 2000." }],
    onSubmit: async v => {
      const imp = (ctx.data || {}).imp;
      await NGGApi.admin.members.cards.declareIdFormat(u.examples[0], "Member IDs like " + u.examples[0], false, v.year || 0);
      const res = await NGGApi.admin.members.importRoster(imp.file, Object.assign({ apply: false }, imp.opts));
      ctx.setData(x => Object.assign({}, x, { imp: Object.assign({}, x.imp, { res }) }));
      return res;
    },
    done: "Format declared. The file was checked again.",
  });
}
/* A kind of card members already carry, described from one scanned example. */
function crMbCardFormat(ctx) {
  ctx.form({
    title: "Describe a kind of card", submit: "Work out the format", busyLabel: "Working…",
    intro: "Scan one of the old cards and type the number it carries. The gate learns to read every card shaped like it.",
    fields: [
      { id: "example", l: "What one of the old cards scans as", req: true, ph: "https://old.example.org/member/023-001" },
      { id: "number", l: "The member’s number in it", req: true, ph: "023-001" },
      { id: "field", l: "That number is", type: "select", req: true, opts: [["displayId", "The member number printed on the card"], ["memberId", "The member ID (NGG-…)"], ["code", "Neither — a code recorded at import"]] },
      { id: "label", l: "A name for these cards", max: 60, ph: "2023 laminated cards" },
    ],
    values: { field: "code" },
    onSubmit: async v => {
      const r = await NGGApi.admin.members.cards.derive(v.example, v.number);
      if (!r.derived || !r.derived.ok) return { fieldErrors: { example: (r.derived && r.derived.error) || "That didn’t describe a card." } };
      setTimeout(() => crMbCardFormatSave(ctx, v, r.derived), 0);
      return r;
    },
    done: null,
  });
}
function crMbCardFormatSave(ctx, ex, der) {
  ctx.form({
    title: "Save this card format", submit: "Save this format", busyLabel: "Saving…",
    intro: "Reads " + der.template + " where the number looks like " + der.mask + " (9 is a digit).",
    fields: [{ id: "tryIt", l: "Try a card", ph: "Scan or paste one", help: "Optional. A card that doesn’t read under this format is refused here." }],
    onSubmit: async v => {
      if (v.tryIt) {
        const t = (await NGGApi.admin.members.cards.test(der.template, der.mask, v.tryIt)).test || {};
        if (!t.ok || !t.decodes) return { fieldErrors: { tryIt: t.error || "That card doesn’t read under this format." } };
      }
      const id = (ex.label || "printed").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "printed";
      return NGGApi.admin.members.cards.saveFormat({ id, label: ex.label || "Printed cards", template: der.template, mask: der.mask, field: ex.field, example: ex.example });
    },
    done: "Card format saved. The gate picks it up within a quarter of an hour.",
  });
}

function crMbImportBlocks(d, ctx) {
  const imp = d.imp, r = imp.done || imp.res || {}, done = !!imp.done, f = imp.file;
  const MARK = { create: ["New", "ok"], update: ["Updated", "gold"], failed: ["Unusable", "bad"], unchanged: ["Current", "neutral"] };
  const out = [];
  out.push({ type: "note", span: 6, icon: done ? "check-circle" : "file-magnifying-glass", tone: done ? "ok" : undefined,
    text: (done ? "Imported " : "Checked ") + f.source + " · " + crPlural(f.members.length, "member") + (f.warnings.length ? " · " + crPlural(f.warnings.length, "extractor warning") : ""),
    sub: (f.fileSha ? "sha256 " + f.fileSha.slice(0, 12) + "… · " : "") + (done ? "Written. The roster below is current." : "Nothing has been written yet. Read the rows, then import.") });
  if (r.previous && !done) out.push({ type: "note", span: 6, icon: "clock-counter-clockwise", tone: "warn",
    text: "This exact roster was applied on " + crDate(r.previous.at) + (r.previous.actorId ? " by " + r.previous.actorId : "") + " — " + crNum(r.previous.created) + " new, " + crNum(r.previous.updated) + " updated then.",
    sub: "Running it again is safe and usually changes nothing. The check below says what it would do this time." });
  out.push({ type: "kpis", span: 6, items: [
    { l: done ? "New" : "Would add", v: crNum(r.created) }, { l: done ? "Updated" : "Would update", v: crNum(r.updated) },
    { l: "Already current", v: crNum(r.unchanged) }, { l: "Unusable", v: crNum(r.failed), tone: r.failed ? "down" : "flat" },
  ] });
  const facts = [];
  if (r.cards) facts.push(done ? crPlural(r.cards.issued || 0, "secure card") + " issued · " + crPlural(r.cards.printed || 0, "printed card") + " recorded" + (r.cards.taken ? " · " + crNum(r.cards.taken) + " printed codes already someone else’s" : "")
    : crPlural(r.cards.wouldIssue || 0, "member") + " would get a secure card" + (r.cards.format ? "; old cards read as “" + r.cards.format + "”" : ""));
  if (r.ids) facts.push("Member IDs — " + crNum(r.ids.kept) + " kept · " + crNum(r.ids.issued) + (done ? " issued" : " to be issued") + (r.ids.normalized ? " · " + crNum(r.ids.normalized) + " read differently" : "") + (r.ids.refused ? " · " + crNum(r.ids.refused) + " refused" : ""));
  if (facts.length) out.push({ type: "note", span: 6, icon: "identification-card", text: facts[0], sub: facts[1] || "" });
  if (r.idList && r.idList.length) out.push({ type: "note", span: 3, icon: "list-numbers", text: crPlural(r.idList.length, "member ID") + (done ? " to copy" : " that will need copying") + " into the workbook",
    sub: "Written back, the next import matches these members on the ID instead of the name.", act: { l: "Download the ID list", run: () => crMbImpIdList(imp, done) } });
  if (r.applicants && (r.applicants.filed + r.applicants.already + r.applicants.onRoster) > 0) out.push({ type: "note", span: 3, icon: "user-circle-plus",
    text: "Registered, but not on the roster: " + crNum(r.applicants.filed) + (done ? " filed" : " to be filed") + " as applications · " + crNum(r.applicants.already) + " filed before · " + crNum(r.applicants.onRoster) + " already members",
    sub: "They are not members. Each waits in Applications for somebody to confirm, and confirming one creates the member and issues their ID." });
  if (r.ids && !done) Object.values(r.ids.undeclared || {}).forEach(u => out.push({ type: "note", span: 3, icon: "warning", tone: "warn",
    text: "IDs shaped like " + u.examples.join(", ") + (u.count > u.examples.length ? " and " + crNum(u.count - u.examples.length) + " more" : "") + " fit no declared format",
    sub: (u.suggest || []).map(g => g.from + " looks like a typo for " + g.id + (g.holder ? " (" + g.holder + ")" : "") + " — correct the sheet rather than declaring it.").join(" ") || "Shape " + u.shape + " · " + crPlural(u.count, "ID") + ". Only a super admin can declare a format.",
    act: ctx.can("rbac") ? { l: "Declare this format", run: () => crMbImpDeclare(ctx, u) } : undefined }));
  out.push({ type: "table", span: 6, title: done ? "What was written" : "What would change", nosel: true, search: "Search the rows",
    cols: ["Change", "Ref", "Member", { l: "What changes", wrap: true }], filters: ["Change"],
    rows: (r.rows || []).map((x, i) => ({ key: "r" + i, cells: [
      { k: "status", t: (MARK[x.action] || [x.action, "neutral"])[0], tone: (MARK[x.action] || [0, "neutral"])[1] },
      { k: "mono", t: x.ref || "—" },
      { k: "strong", t: x.name || "—", s: x.displayId && x.displayId !== x.ref ? "→ " + x.displayId : "" },
      { k: "text", t: x.detail || (x.action === "unchanged" ? "Nothing" : "—"), s: (x.warnings || []).join(" · ") },
    ] })),
    emptyText: "The file has no rows to show." });
  return out;
}

/* ── The member record, as a page ─────────────────────────────────────────
   Everything v1's record drawer and its tabs showed, from the same reads
   (member-detail, member-record, timeline, gate cards, card history). A part
   the server leaves out (money without `fees`, conduct outside policy scope)
   is one the reader may not see, and the page says so. */
const CR_MB_REC_TABS = [["overview", "Overview"], ["attendance", "Attendance"], ["conduct", "Conduct"], ["fees", "Fees"], ["curriculum", "Curriculum"],
  ["companion", "Companion"], ["family", "Family & mentor"], ["classes", "Classes"], ["card", "ID card"], ["history", "History"]];
const CR_MB_RATING = { on_track: ["On track", "ok"], watch: ["Watch", "warn"], at_risk: ["At risk", "bad"] };
const CR_MB_ATT = { present: ["Present", "ok"], late: ["Late", "warn"], absent: ["Absent", "bad"] };

async function crMbRecFetch(id) {
  const soft = p => p.catch(e => ({ _err: e }));
  const [det, rec, tl, cards, hist, row] = await Promise.all([
    NGGApi.admin.memberDetail(id), soft(NGGApi.admin.memberRecord(id)), soft(NGGApi.admin.memberTimeline(id)),
    soft(NGGApi.admin.members.cards.of(id)), soft(NGGApi.admin.registration.cardHistory(id, "member")),
    NGGApi.admin.members.list({ q: id, page: 1, pageSize: 200, sort: "memberId", dir: "asc" }).catch(() => ({ members: [] })),
  ]);
  const listRow = (row.members || []).find(x => x.memberId === id) || {};
  return { id, detail: det.detail || {}, record: rec, timeline: tl, cards, hist, consent: listRow.consent || null };
}
async function crMbRecReload(ctx, id) {
  try {
    const rec = await crMbRecFetch(id);
    ctx.setData(x => Object.assign({}, x, { rec: Object.assign(rec, { tab: x.rec && x.rec.id === id ? x.rec.tab : "overview" }) }));
  } catch (e) { ctx.toast(crErr(e, "Couldn’t refresh the record."), null, true); }
}
/* The loader is a component because blocks() is pure: it fetches once per id
   and hands the result to the tab's data, after which the record is blocks. */
function CrMbRecLoad({ ctx, id }) {
  const [err, setErr] = React.useState(null);
  const run = React.useCallback(() => {
    setErr(null);
    crMbRecFetch(id).then(rec => ctx.setData(x => Object.assign({}, x, { rec: Object.assign(rec, { tab: "overview" }) })), setErr);
    // eslint-disable-next-line
  }, [id]);
  React.useEffect(() => { run(); }, [run]);
  if (err) return <CrError error={err} onRetry={run} what="this member’s record"/>;
  return <CrSkeleton kind="table"/>;
}
/* The record's header: back to the roster, who this is, and which part of the
   record is open. A custom block because no block holds a tab strip. */
function CrMbRecHead({ ctx, phone }) {
  const rec = (ctx.data || {}).rec, m = rec.detail.member || {};
  const setTab = t => ctx.setData(x => Object.assign({}, x, { rec: Object.assign({}, x.rec, { tab: t }) }));
  return (
    <>
      <div className="cr-wrap">
        <button type="button" className="cr-btn is-sm" onClick={() => ctx.setSub("")}><CrIcon n="caret-left"/>All members</button>
        <span className="cr-person cr-grow"><CrAvatar name={m.fullName} photo={crMbPhoto(m.photoUrl)}/><span className="cr-person-t"><b>{m.fullName || rec.id}</b><span>{[m.displayId || m.memberId, m.email, m.phone].filter(Boolean).join(" · ")}</span></span></span>
        <CrPill tone={CR_MEM_TONE[m.status] || "neutral"} t={crMemStatusLabel(m.status)}/>
        <CrPill tone="neutral" t={m.type === "Summer" ? "Summer School" : "NGG"}/>
        {m.centre && <CrPill tone="neutral" t={m.centre}/>}
        {m.role && m.role !== "member" && <CrPill tone="gold" t={String(m.role).replace(/_/g, " ")}/>}
      </div>
      {phone
        ? <select className="cr-select" aria-label="Part of the record" value={rec.tab} onChange={e => setTab(e.target.value)}>{CR_MB_REC_TABS.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
        : <div className="cr-tscroll"><CrSeg label="Part of the record" value={rec.tab} options={CR_MB_REC_TABS} onChange={setTab}/></div>}
    </>
  );
}

function crMbStatusSet(ctx, m, status) {
  return async () => {
    const was = m.status;
    try {
      const r = await crMemQueued(NGGApi.admin.members.upsert({ memberId: m.memberId, status }));
      if (crQueued(r)) return ctx.toast("Sent to a second admin to approve.");
      await crMbRecReload(ctx, m.memberId);
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
      ctx.toast((m.fullName || "Member") + " · " + crMemStatusLabel(status), async () => {
        try { await crMemQueued(NGGApi.admin.members.upsert({ memberId: m.memberId, status: was })); await crMbRecReload(ctx, m.memberId); }
        catch (e) { ctx.toast(crErr(e), null, true); }
      });
    } catch (e) { ctx.toast(crErr(e, "Couldn’t change the status."), null, true); }
  };
}
async function crMbMentor(ctx, m, cur) {
  let mentors = [];
  try { mentors = (await NGGApi.admin.mentors.list()).mentors || []; }
  catch (e) { return ctx.toast(crErr(e, "Couldn’t load the mentors."), null, true); }
  ctx.form({
    title: "Mentor for " + (m.fullName || "this member"), submit: "Save", busyLabel: "Saving…",
    intro: mentors.length ? "" : "There are no mentors yet. Add them in Mentors & volunteers.",
    values: { mentorId: cur ? cur.mentorId || "" : "" },
    fields: [{ id: "mentorId", l: "Mentor", type: "select", ph: "No mentor", opts: mentors.map(x => [x.mentorId, x.fullName + (x.tracks && x.tracks.length ? " · " + x.tracks.join(", ") : "")]) }],
    onSubmit: async v => { await NGGApi.admin.assignMentor({ memberId: m.memberId, mentorId: v.mentorId || "" }); await crMbRecReload(ctx, m.memberId); return v; },
    done: v => v.mentorId ? "Mentor assigned" : "Mentor cleared",
  });
}
/* §20: progression is evidence of formation, never time served. The form asks
   for the evidence and puts the formation record in front of the question;
   the readiness read informs and never blocks. */
async function crMbPromote(ctx, m) {
  let summary = "";
  try {
    const f = ((await NGGApi.admin.members.readiness(m.memberId)) || {}).readiness;
    if (f) summary = [
      f.courage && f.courage.current !== null ? "Courage " + f.courage.current + "/5 (" + f.courage.marks + " observed)" : "Courage: nothing recorded",
      "Reviewed " + f.review.weeksReviewed + " of the last " + f.review.ofWeeks + " weeks" + (f.review.concerns ? " · " + f.review.concerns + " concerns raised" : ""),
      "Attendance " + f.attendance.total + " sessions, " + f.attendance.last90 + " in 90 days", "Stars " + f.stars,
      f.dues ? (f.dues.owes ? "Dues: owing" : "Dues: clear") : "",
      f.tenure && f.tenure.months !== null ? "In the programme " + f.tenure.months + " months — time served is not evidence of formation." : "",
    ].filter(Boolean).join(" · ");
  } catch (_) { /* informs, never blocks */ }
  ctx.form({
    title: "Promote " + (m.fullName || "this member") + " to NGV", submit: "Promote", busyLabel: "Promoting…",
    intro: (summary ? summary + ". " : "") + "This advances them into the volunteer tier, provisions their NGV record and ID card, and emails them their digital ID. It can be reversed.",
    values: { role: "volunteer" },
    fields: [
      { id: "role", l: "As", type: "chips", req: true, opts: CR_MB_NGV_ROLES },
      { id: "evidence", l: "Evidence of formation", type: "textarea", req: true, rows: 4, max: 2000, ph: "What they have carried, led or changed — not how long they have been here." },
    ],
    onSubmit: async v => { const r = await crMemQueued(NGGApi.admin.members.promoteNgv(m.memberId, v.role, { evidence: v.evidence })); if (!crQueued(r)) await crMbRecReload(ctx, m.memberId); return r; },
    done: (v, r) => crQueued(r) ? "Sent to a second admin to approve." : (r.already ? "Already an NGV · " : "Promoted to NGV · ") + (r.volunteerId || "") + (Array.isArray(r.sent) && r.sent.length ? " · ID sent by " + r.sent.join(" and ") : ""),
  });
}
async function crMbResendNgv(ctx, m) {
  try {
    const r = await NGGApi.admin.members.promoteNgv(m.memberId, undefined, { sendId: true });
    ctx.toast(Array.isArray(r.sent) && r.sent.length ? "ID re-sent by " + r.sent.join(" and ") : "No email or phone on file to send it to.", null, !(Array.isArray(r.sent) && r.sent.length));
  } catch (e) { ctx.toast(crErr(e), null, true); }
}
async function crMbDemoteNgv(ctx, m) {
  const ok = await ctx.confirm({ title: "Revoke NGV standing?", danger: true, cta: "Revoke NGV",
    body: "This deactivates " + (m.fullName || "this member") + "’s volunteer record and removes their NGV standing. Their attendance and hours are kept, and promoting them again reactivates the same record." });
  if (!ok) return;
  try { const r = await crMemQueued(NGGApi.admin.members.demoteNgv(m.memberId)); if (crQueued(r)) return ctx.toast("Sent to a second admin to approve."); await crMbRecReload(ctx, m.memberId); ctx.toast("NGV standing revoked"); }
  catch (e) { ctx.toast(crErr(e), null, true); }
}
/* A lost card stops at the door the moment a new one is issued, so this is a confirm. */
async function crMbReissue(ctx, m, voidPrinted) {
  const ok = await ctx.confirm({ title: voidPrinted ? "Replace every card?" : "Issue a new card?", danger: true, cta: "Issue new card",
    body: voidPrinted ? "The current card and any old printed card stop working at the gate now. Print the new one before they next come in."
      : "The current secure card stops working at the gate now. Their old printed card, if any, keeps working." });
  if (!ok) return;
  try { const r = await NGGApi.admin.members.cards.reissue(m.memberId, voidPrinted); await crMbRecReload(ctx, m.memberId); ctx.toast("New card issued · " + (r.code || "")); }
  catch (e) { ctx.toast(crErr(e), null, true); }
}
/* What a guardian actually said, one child at a time, with HOW it was obtained:
   a ledger row that does not say so is a checkbox, not evidence. */
function crMbConsent(ctx, m, cons) {
  const c = cons || {};
  ctx.form({
    title: "Publication consent · " + (m.fullName || ""), submit: "Record", busyLabel: "Recording…",
    intro: "What a guardian has agreed may appear on the public website. With nothing recorded this child appears on the boards as " + (c.handle || "a handle") + " — keeping their rank and score, but not their name.",
    values: { method: CR_MB_CONSENT_METHODS[0], site_visibility: (c.site_visibility && c.site_visibility.status) || "", media: (c.media && c.media.status) || "" },
    fields: [{ id: "method", l: "How was this decision obtained?", type: "select", req: true, opts: CR_MB_CONSENT_METHODS }]
      .concat(CR_MB_CONSENT_TYPES.map(t => ({ id: t[0], l: t[1], type: "chips", help: t[2], opts: [["granted", "Granted"], ["declined", "Declined"]] }))),
    onSubmit: async v => {
      let n = 0;
      for (const t of CR_MB_CONSENT_TYPES) {
        const before = (c[t[0]] && c[t[0]].status) || "";
        if (v[t[0]] && v[t[0]] !== before) { await NGGApi.admin.members.consent(m.memberId, t[0], v[t[0]], v.method); n++; }
      }
      if (n) await crMbRecReload(ctx, m.memberId);
      return { n };
    },
    done: (v, r) => r.n ? "Recorded · " + crPlural(r.n, "decision") : "Nothing changed.",
  });
}
async function crMbAccount(ctx, m, what) {
  const name = m.fullName || "this member";
  const spec = {
    reset2fa: { title: "Reset " + name + "’s 2FA?", body: "They enrol a new authenticator the next time they open the Control Room. Their backup codes stop working.", cta: "Reset 2FA", run: () => NGGApi.admin.members.reset2fa(m.memberId), done: "2FA reset. They set it up again at their next sign-in." },
    password: { title: "Clear " + name + "’s password?", body: "Their current password stops working. They sign in with an emailed code and set a new one.", cta: "Clear password", run: () => NGGApi.admin.members.resetPassword(m.memberId), done: "Password cleared. They can sign in with an email code." },
    impersonate: { title: "View the app as " + name + "?", body: "You are signed in as them, and anything you do is recorded against them, until you stop viewing as them.", cta: "View as them", run: () => NGGApi.admin.members.impersonate(m.memberId), after: () => { window.location.href = "/dashboard"; } },
    remove: { title: "Delete and anonymise " + name + "?", danger: true, cancel: "Keep the member", body: "Their name, contact details and journal entries are scrubbed and every session is revoked. The record of the deletion stays in the audit log. This can’t be undone.", cta: "Delete and anonymise", run: () => NGGApi.admin.members.remove(m.memberId), done: "Member deleted and anonymised.", after: () => { ctx.setSub(""); ctx.setData(x => Object.assign({}, x, { rec: null, rev: (x.rev || 0) + 1 })); } },
  }[what];
  if (!(await ctx.confirm({ title: spec.title, body: spec.body, cta: spec.cta, danger: !!spec.danger, cancel: spec.cancel }))) return;
  try { await spec.run(); if (spec.done) ctx.toast(spec.done); if (spec.after) spec.after(); }
  catch (e) { ctx.toast(crErr(e), null, true); }
}

function crMbHidden(what) { return { type: "note", span: 6, icon: "lock-simple", text: what + " isn’t part of your access.", sub: "Somebody holding the right permission can see it." }; }
function crMbRecBlocks(d, ctx) {
  const rec = d.rec, det = rec.detail, m = det.member || {}, r = rec.record && !rec.record._err ? rec.record : null;
  const out = [{ type: "custom", span: 6, render: (c, phone) => <CrMbRecHead ctx={c} phone={phone}/> }];
  const recErr = (what, e) => ({ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load " + what + ". " + crErr(e, ""), act: { l: "Try again", run: () => crMbRecReload(ctx, rec.id) } });
  const tab = rec.tab || "overview";
  const isNgg = m.type !== "Summer", isStaff = m.role && m.role !== "member";
  if (tab === "overview") {
    const st = det.stats || {}, pr = det.progress || {};
    const div = (d.divisions || []).find(x => x.id === m.division);
    out.push({ type: "kpis", span: 6, items: [{ l: "Level", v: String(st.level != null ? st.level : "—") }, { l: "Streak", v: crNum(st.streak) }, { l: "XP", v: crNum(st.xp) },
      { l: "Missions verified", v: crNum(pr.verified) + " / " + crNum(pr.total) }, { l: "Journal entries", v: crNum((det.journal || []).length) }] });
    const kv = (icon, l, v) => ({ icon, t: v == null || v === "" ? "—" : String(v), s: l });
    out.push({ type: "list", span: 3, title: "Details", action: "Edit", onAction: () => crMemEdit(ctx, m, () => crMbRecReload(ctx, m.memberId)), rows: [
      kv("identification-badge", "Member ID · printed ID", m.memberId + (m.displayId ? " · " + m.displayId : "")), kv("envelope-simple", "Email", m.email), kv("phone", "Phone", m.phone),
      kv("map-pin", "Centre", m.centre), kv("compass", "Division", div ? div.name : (m.division || "Not placed yet")), kv("stairs", "NGG level", m.level),
      kv("music-notes", "Track · disciplines", [m.track, m.disciplines].filter(Boolean).join(" · ")), kv("cake", "Date of birth", m.dob ? crDate(m.dob) : ""),
      kv("calendar-check", "Joined", crMemJoined(m)),
    ] });
    out.push({ type: "list", span: 3, title: "Guardian and school", rows: [kv("user", "Parent or guardian", m.parentName), kv("phone", "Guardian phone", m.parentPhone), kv("envelope-simple", "Guardian email", m.parentEmail), kv("graduation-cap", "School", m.school)] });
    const STATUS_ACT = [["active", "Activate", "play-circle"], ["suspended", "Suspend", "pause-circle"], ["graduated-ngg", "Graduate from NGG", "graduation-cap"], ["graduated-vanguard", "Graduate as Vanguard", "medal"], ["inactive", "Deactivate", "minus-circle"]];
    out.push({ type: "list", span: 3, title: "Standing", sub: crMemStatusLabel(m.status),
      rows: STATUS_ACT.filter(s => s[0] !== m.status).map(s => ({ icon: s[2], t: s[1], s: s[0] === "suspended" ? "Revokes their access until they are activated again." : "", onClick: crMbStatusSet(ctx, m, s[0]) })) });
    out.push({ type: "list", span: 3, title: "Mentor", action: "Change", onAction: () => crMbMentor(ctx, m, det.mentor),
      rows: [det.mentor ? { icon: "handshake", t: det.mentor.fullName, s: "Their mentor" } : { icon: "handshake", t: "No mentor", s: "Assign one so the weekly review happens.", onClick: () => crMbMentor(ctx, m, null) }] });
    const eligible = isNgg && m.status === "active";
    out.push({ type: "list", span: 3, title: "Chain of command", rows: m.ngvVolunteerId ? [
      { icon: "shield-check", t: "Promoted to NGV · " + m.ngvVolunteerId, s: (m.ngvAt ? crDate(m.ngvAt) + " · " : "") + "Their NGV dashboard is active." },
      { icon: "paper-plane-tilt", t: "Resend their NGV ID", onClick: () => crMbResendNgv(ctx, m) },
      { icon: "shield-slash", t: "Revoke NGV", onClick: () => crMbDemoteNgv(ctx, m) },
    ] : [eligible ? { icon: "arrow-fat-up", t: "Promote to NGV", s: "Advances an active NGG member into the volunteer tier, with evidence of formation.", onClick: () => crMbPromote(ctx, m) }
      : { icon: "arrow-fat-up", t: "Not eligible for NGV", s: "Only an active NGG member can be promoted." }] });
    const cards = rec.cards && !rec.cards._err ? (rec.cards.cards || []).filter(c => c.status === "active") : null;
    if (cards === null) out.push(Object.assign(recErr("their gate cards", rec.cards && rec.cards._err), { span: 3 }));
    else out.push({ type: "list", span: 3, title: "Cards at the gate", rows: cards.map(c => ({ icon: c.kind === "secure" ? "qr-code" : "identification-card", t: c.code, s: (c.kind === "secure" ? "Secure" : "Printed, read as “" + c.format + "”") + (c.issuedAt ? " · " + crDate(c.issuedAt) : "") }))
      .concat([{ icon: "arrows-clockwise", t: cards.some(c => c.kind === "secure") ? "Lost card — issue a new one" : "Issue a card", s: cards.length ? "" : "No card yet — the gate can only find them by name.", onClick: () => crMbReissue(ctx, m, false) }])
      .concat(cards.some(c => c.kind === "printed") ? [{ icon: "recycle", t: "Reprinted — retire the old card", onClick: () => crMbReissue(ctx, m, true) }] : []) });
    if (!isStaff) {
      const cs = rec.consent || {};
      out.push({ type: "list", span: 3, title: "Publication consent", action: "Record a decision", onAction: () => crMbConsent(ctx, m, cs),
        rows: CR_MB_CONSENT_TYPES.map(t => { const x = cs[t[0]]; return { icon: x && x.status === "granted" ? "check-circle" : x ? "x-circle" : "circle-dashed", t: t[1],
          s: x ? (x.status === "granted" ? "Granted" : "Declined") + " · " + (x.method || "no method recorded") + (x.by ? " · by " + x.by : "") + (x.at ? " · " + crDate(x.at) : "") : "Not recorded — not named publicly" }; }) });
    }
    const acct = [];
    if (ctx.can("rbac")) acct.push({ icon: "key", t: "Reset 2FA", s: "They enrol a new authenticator.", onClick: () => crMbAccount(ctx, m, "reset2fa") }, { icon: "password", t: "Reset password", s: "They sign in by email code and set a new one.", onClick: () => crMbAccount(ctx, m, "password") });
    if (ctx.me && ctx.me.role === "super_admin" && m.role !== "super_admin") acct.push({ icon: "eye", t: "View as member", s: "Signs you in as them until you stop.", onClick: () => crMbAccount(ctx, m, "impersonate") });
    if (ctx.me && ctx.me.role === "super_admin") acct.push({ icon: "trash", t: "Delete member", s: "Scrubs their personal data. Can’t be undone.", onClick: () => crMbAccount(ctx, m, "remove") });
    if (isStaff) acct.push({ icon: "user-gear", t: "Staff access and capabilities", s: "Managed in Access & roles.", onClick: () => ctx.go("settings", "access") });
    if (acct.length) out.push({ type: "list", span: 3, title: "Account", rows: acct });
    if ((det.submissions || []).length) out.push({ type: "list", span: 3, title: "Assignment submissions", rows: det.submissions.map(s => ({ icon: "clipboard-text", t: s.title, m: s.status === "graded" ? s.grade + "/" + s.points : s.status })) });
    out.push({ type: "list", span: 3, title: "Recent journal", empty: "No journal entries yet.", rows: (det.journal || []).slice(0, 8).map(j => ({ icon: "notebook", t: (j.body || "").split("\n")[0] || "—", s: "Week " + j.week + " · " + crDate(j.createdAt) })) });
    if (m.notes) out.push({ type: "note", span: 6, icon: "note", text: m.notes, sub: "Staff notes. The member does not see these." });
    return out;
  }
  if (tab === "history") {
    const tl = rec.timeline;
    if (!tl || tl._err) return out.concat([recErr("the history", tl && tl._err)]);
    return out.concat([{ type: "list", span: 6, title: "History", sub: "Everything audited against this member", empty: "Nothing has been recorded against this member yet. Not “nothing happened” — nothing that was audited.",
      rows: (tl.events || []).map(e => ({ icon: "clock", t: e.what, s: e.by, m: crDate(e.at, true) })) }]);
  }
  if (tab === "card") {
    const h = rec.hist;
    const studio = { type: "note", span: 6, icon: "printer", text: "Cards are laid out and printed in the ID Card Studio.", act: { l: "Open the ID Card Studio", run: () => ctx.studio() } };
    if (!h || h._err) return out.concat([recErr("the card history", h && h._err), studio]);
    return out.concat(crMbCardHistoryBlocks(h), [studio]);
  }
  if (!r) return out.concat([recErr("this part of the record", rec.record && rec.record._err)]);
  const days = r.days;
  if (tab === "attendance") {
    const a = r.attendance || {};
    return out.concat([
      { type: "kpis", span: 6, items: [{ l: "Attendance rate", v: a.rate == null ? "—" : a.rate + "%" }, { l: "Days in", v: crNum(a.present) }, { l: "Of them late", v: crNum(a.late) }, { l: "Absences recorded", v: crNum(a.absent) }] },
      { type: "table", span: 6, title: "The last " + days + " days", sub: "An absence is one the nightly sweep recorded against a meeting day", nosel: true, cols: ["Date", "Day", "In", "Out"],
        rows: (a.recent || []).map((x, i) => ({ key: "a" + i, cells: [{ k: "text", t: crDate(x.date) }, { k: "status", t: (CR_MB_ATT[x.kind] || [x.kind])[0] + (x.lateMinutes ? " · " + x.lateMinutes + " min" : ""), tone: (CR_MB_ATT[x.kind] || [0, "neutral"])[1] }, { k: "mono", t: x.in || "—" }, { k: "mono", t: x.out || "—" }] })),
        emptyText: "Nothing recorded in the last " + days + " days." },
    ]);
  }
  if (tab === "conduct") {
    if (!r.conduct) return out.concat([crMbHidden("Conduct")]);
    const c = r.conduct;
    return out.concat([
      { type: "kpis", span: 6, items: [{ l: "Standing", v: c.state + (c.until ? " until " + crDate(c.until) : "") }, { l: "Lates this term", v: crNum(c.lates) }, { l: "Absences", v: crNum(c.absences) + (c.absenceLimit ? " / " + c.absenceLimit : "") }, { l: "Fines owed", v: fmtMoney(c.finesOwed) }] },
      c.awaitingReview ? { type: "note", span: 6, icon: "gavel", tone: "warn", text: "A sanction is waiting for review.", act: { l: "Open Conduct & fines", run: () => ctx.go("money", "conduct") } } : null,
      { type: "list", span: 3, title: "Infractions", empty: "None recorded.", rows: (c.infractions || []).map(x => ({ icon: x.voidedAt ? "prohibit" : "warning", t: x.kind + (x.note ? " — " + x.note : ""), s: crDate(x.date) + (x.voidedAt ? " · voided" : "") })) },
      { type: "list", span: 3, title: "Sanctions", empty: "None.", rows: (c.sanctions || []).map(x => ({ icon: "gavel", t: x.kind + (x.amount ? " · " + fmtMoney(x.amount) : ""), s: crDate(x.issuedAt) + (x.reason ? " · " + x.reason : ""), m: x.status })) },
    ].filter(Boolean));
  }
  if (tab === "fees") {
    if (!r.fees) return out.concat([crMbHidden("Money")]);
    const f = r.fees;
    const items = [{ l: "Outstanding", v: fmtMoney(f.outstanding) }, { l: "Payable now", v: fmtMoney(f.payable) }, { l: "Charged", v: fmtMoney(f.charged) }, { l: "Paid or credited", v: fmtMoney(f.credited) }];
    if (f.programmeCost) items.push({ l: "Programme covered", v: fmtMoney(f.programmeCovered) + " of " + fmtMoney(f.programmeCost) });
    return out.concat([
      { type: "kpis", span: 6, items },
      { type: "list", span: 6, title: "Ledger", sub: f.phase ? "Tenure phase: " + f.phase : "", action: ctx.can("fees") ? "Open Dues & arrears" : undefined, onAction: () => ctx.go("money", "fees"), empty: "No ledger entries yet.",
        rows: (f.recent || []).map(e => ({ icon: e.direction === "credit" ? "arrow-down-left" : "arrow-up-right", t: e.kind + (e.note ? " — " + e.note : "") + (e.voided ? " (voided)" : ""), s: crDate(e.date), m: (e.direction === "credit" ? "−" : "+") + fmtMoney(e.amount) })) },
    ]);
  }
  if (tab === "curriculum") {
    const c = r.curriculum;
    if (!c || !c.total) return out.concat([{ type: "note", span: 6, icon: "book-open", text: "No curriculum is published for " + (r.course || "this member’s course") + " yet." }]);
    return out.concat([
      { type: "kpis", span: 6, items: [{ l: "Through the course", v: c.pct + "%" }, { l: "Units done", v: crNum(c.completed) + " / " + crNum(c.total) }, { l: "Overdue", v: crNum(c.overdue), tone: c.overdue ? "down" : "flat" }] },
      c.next ? { type: "note", span: 6, icon: "arrow-right", text: "Next: week " + c.next.week + " — " + c.next.title } : null,
      { type: "list", span: 6, title: "Overdue", empty: "Nothing overdue.", rows: (c.overdueUnits || []).map(u => ({ icon: "hourglass-low", t: "Week " + u.week + " — " + u.title, m: u.overdueDays + "d late" })) },
    ].filter(Boolean));
  }
  if (tab === "companion") {
    return out.concat([
      { type: "note", span: 6, icon: "info", text: "The weekly assessment the companion writes from attendance, conduct, curriculum and journal. It informs a conversation; it decides nothing." },
      { type: "cards", span: 6, empty: "No assessments yet — the first is written at the end of a week.",
        cards: (r.companion || []).map(x => ({ icon: "chat-circle-text", title: x.period, sub: x.summary + ((x.focus || []).length ? " Focus: " + x.focus.map(f => typeof f === "string" ? f : (f.text || f.title || "")).join("; ") : ""), tag: (CR_MB_RATING[x.rating] || [x.rating])[0], tone: (CR_MB_RATING[x.rating] || [0, "neutral"])[1] })) },
    ]);
  }
  if (tab === "family") {
    const g = r.guardian || {}, mt = r.mentorship || {};
    return out.concat([
      { type: "list", span: 3, title: "Guardian on the record", empty: "No guardian on the record.", rows: (g.name || g.email || g.phone) ? [{ icon: "user", t: g.name || "—", s: "Name" }, { icon: "phone", t: g.phone || "—", s: "Phone" }, { icon: "envelope-simple", t: g.email || "—", s: "Email" }] : [] },
      { type: "list", span: 3, title: "Family accounts linked", action: "Open Families", onAction: () => ctx.go("members", "families"), empty: "No family account is linked. A guardian can request a link from the family page.",
        rows: (r.family || []).map(f => ({ icon: "users", t: f.fullName + (f.relationship ? " · " + f.relationship : ""), s: f.email, m: f.status })) },
      mt.mentor ? { type: "kpis", span: 6, items: [{ l: "Mentor", v: mt.mentor }, { l: "Since", v: mt.since ? crDate(mt.since) : "—" }, { l: "Meetings in 90 days", v: crNum(mt.meetings90), tone: mt.meetings90 ? "flat" : "down" }, { l: "Last met", v: mt.lastMet ? crDate(mt.lastMet) : "—" }] }
        : { type: "note", span: 6, icon: "handshake", text: "No mentor assigned.", act: { l: "Assign a mentor", run: () => crMbMentor(ctx, m, null) } },
      mt.mentor && !mt.meetings90 ? { type: "note", span: 6, icon: "warning", tone: "warn", text: "No meeting logged in 90 days." } : null,
    ].filter(Boolean));
  }
  if (tab === "classes") {
    if (!r.centre) return out.concat([{ type: "note", span: 6, icon: "map-pin", text: "No centre on the record, so no timetable." }]);
    return out.concat([{ type: "table", span: 6, title: "Their classes at " + r.centre, nosel: true, cols: ["Day", "Time", "Class", "Room · instructor"],
      rows: (r.classes || []).map((s, i) => ({ key: "c" + i, cells: [{ k: "text", t: s.day }, { k: "mono", t: s.startTime + "–" + s.endTime }, { k: "text", t: s.course + (s.level ? " · " + s.level : "") }, { k: "text", t: [s.room, s.instructor].filter(Boolean).join(" · ") || "—" }] })),
      emptyText: "No classes for " + (r.course || "their course") + " on " + r.centre + "’s timetable." }]);
  }
  return out;
}

/* "Is the card in their hand the current design?" — the same answer on the
   member record and on the ID cards tab, from one builder. */
function crMbCardHistoryBlocks(h) {
  if (!h || !h.count) return [{ type: "note", span: 6, icon: "identification-card", text: "No card has been issued to them.", sub: "Either they have never been printed, or their card predates the print log — the record starts from when it was added." }];
  const l = h.latest || {};
  const verdict = h.designMovedOn === true ? { tone: "warn", icon: "warning", text: "The design has moved on. Their card was printed from version " + l.templateVersion + " of “" + l.templateName + "”, which has been republished since. A reprint would look different." }
    : h.designMovedOn === false ? { tone: "ok", icon: "check-circle", text: "Their card is the current design — version " + l.templateVersion + " of “" + l.templateName + "”." }
    : { icon: "info", text: "Their card came from the built-in card, which carries no version, so whether it matches today’s can’t be answered from the record." };
  return [
    Object.assign({ type: "note", span: 6, sub: crPlural(h.count, "card") + " issued" + (h.reprints ? " · " + crNum(h.reprints) + " of them replacements" : "") }, verdict),
    { type: "table", span: 6, title: "Cards issued", nosel: true, cols: ["When", "Printed ID", "Design", "Type", "Result"],
      rows: (h.issues || []).map((i, k) => ({ key: i.runId + ":" + k, cells: [
        { k: "text", t: crDate(i.at, true), s: i.runId }, { k: "mono", t: i.displayId || "—" },
        { k: "text", t: i.templateName || "Built-in card", s: i.templateVersion ? "v" + i.templateVersion : "No version" },
        { k: "status", t: i.reprint ? "Reprint" : "First", tone: i.reprint ? "gold" : "ok" },
        { k: "status", t: i.ok ? "Printed" : "Not printed", tone: i.ok ? "neutral" : "bad" },
      ] })), emptyText: "No cards." },
  ];
}

/* ── The roster's dashboard: what v1 opened the section on ── */
function crMbDashBlocks(d, ctx) {
  const o = d.overview;
  if (!o) return [];
  if (o.empty) return [{ type: "note", span: 6, icon: "lock-simple", text: "Your account is scoped to centres that no longer exist, so there is nothing to show.", sub: "Ask a super admin to set your centres." }];
  const seg = k => () => ctx.setData(x => crMbWithSeg(x, k));
  const h = o.headline || {}, q = o.quality || {}, c = o.conduct, out = [];
  if (c) {
    out.push({ type: "attention", span: 3, title: "Conduct and progression", sub: "Each opens the members it counts", empty: "No fines, suspensions or promotions recorded.", rows: [
      { n: c.fined, l: "fined", tone: "warn", onClick: seg("fined") }, { n: c.finesOwedBy, l: "owing a fine · " + fmtMoney(c.finesOwed), tone: "warn", onClick: seg("fines_owed") },
      { n: c.suspended, l: "suspended now", tone: "bad", onClick: seg("suspended") }, { n: c.evicted, l: "evicted", tone: "bad", onClick: seg("evicted") },
      { n: c.awaitingReview, l: "with a sanction to decide", tone: "warn", onClick: seg("conduct_review") }, { n: c.promoted, l: "promoted to NGV", tone: "ok", onClick: seg("promoted_ngv") },
    ] });
  }
  const QUAL = [["duplicate_groups", "possible duplicate records", null], ["minor_no_guardian", "children with no guardian contact", "minor_no_guardian"], ["no_email", "with no email", "no_email"],
    ["no_centre", "in no centre", "no_centre"], ["unknown_centre", "in a centre that no longer exists", "unknown_centre"], ["no_phone", "with no phone", "no_phone"], ["no_dob", "with no date of birth", "no_dob"]];
  out.push({ type: "attention", span: c ? 3 : 6, title: "Records needing attention", action: "Data quality", onAction: () => ctx.go("members", "quality"),
    empty: "Nothing outstanding — every record has a name, a way to reach someone, and a centre.",
    rows: QUAL.map(x => ({ n: q[x[0]] || 0, l: x[1], tone: x[0] === "minor_no_guardian" || x[0] === "duplicate_groups" ? "bad" : "warn", onClick: x[2] ? seg(x[2]) : () => ctx.go("members", "quality") }))
      .concat(o.consent && o.consent.participants > 0 ? [{ n: o.consent.unrecorded, l: "of " + crNum(o.consent.participants) + " with no publication consent", tone: "neutral", onClick: seg("no_consent") }] : []) });
  if (c) out.push({ type: "note", span: 6, icon: "scales", text: "Fines imposed to date: " + fmtMoney(c.finesImposed) + ", of which " + fmtMoney(c.finesOwed) + " is still owed.", sub: "Proposed, waived and lifted fines are not counted. " + crNum(c.promoted365) + " promoted to NGV in the last 12 months." });
  out.push({ type: "columns", span: 4, title: "Joining, month by month", big: crNum(h.new365), sub: "joined in 12 months", bars: (o.growth || []).map(g => ({ l: new Date(g.month + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" }), v: g.joined, tip: g.month + " · " + crPlural(g.joined, "member") })) });
  out.push({ type: "bars", span: 2, title: "By centre", empty: "No centres yet.", rows: (o.byCentre || []).map(x => [x.name + " · " + crNum(x.active) + " active", x.total]) });
  out.push({ type: "bars", span: 2, title: "By status", rows: Object.entries(o.byStatus || {}).map(([k, v]) => [crMemStatusLabel(k), v]) });
  out.push({ type: "bars", span: 2, title: "By programme", rows: Object.entries(o.byType || {}).map(([k, v]) => [k === "Summer" ? "Summer School" : "NGG", v]) });
  if (o.dues) out.push({ type: "kpis", span: 2, title: "Dues", items: [{ l: "People with a balance", v: crNum(o.dues.people) }, { l: "Outstanding", v: fmtMoney(o.dues.outstanding) }] });
  if (Object.keys(o.staff || {}).length) out.push({ type: "bars", span: o.dues ? 6 : 2, title: "Staff", rows: Object.entries(o.staff).map(([k, v]) => [String(k).replace(/_/g, " ").replace(/^./, s => s.toUpperCase()), v]) });
  if (o.scoped) out.push({ type: "note", span: 6, icon: "map-pin", text: "These figures cover only the centres you look after." });
  return out;
}

Object.assign(CR_TAB_DEFS, {
  members: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const [cs, dv, ov] = await Promise.all([
        NGGApi.admin.registration.centres().catch(() => ({ centres: [] })),
        NGGApi.admin.members.divisions().catch(() => ({ divisions: [] })),
        NGGApi.admin.membersOverview().catch(() => ({ overview: null })),
      ]);
      const centres = (cs.centres || []).filter(c => c.status !== "retired").map(c => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
      const seg = crMbPending.seg; crMbPending.seg = "";
      return crMbWithSeg({ centres, divisions: dv.divisions || [], overview: ov.overview || null, rev: 0, imp: null, rec: null }, seg);
    },
    actions: (d, ctx) => {
      if (ctx.sub) {
        const rec = d.rec && d.rec.id === ctx.sub ? d.rec : null, m = rec ? rec.detail.member || {} : null;
        return [
          { l: "Edit", icon: "pencil-simple", primary: true, disabled: !m, why: m ? undefined : "Loading the record", run: () => crMemEdit(ctx, m, () => crMbRecReload(ctx, m.memberId)) },
          { l: "All members", icon: "users", run: () => ctx.setSub("") },
        ];
      }
      if (d.imp) {
        const r = d.imp.done || d.imp.res || {}, label = d.imp.done ? "" : crMbImpApplyLabel(d.imp.res || {});
        return [
          d.imp.done ? { l: "Back to the roster", icon: "users", primary: true, run: () => ctx.setData(x => Object.assign({}, x, { imp: null })) }
            : label ? { l: label, icon: "upload-simple", primary: true, disabled: !ctx.can("rbac"), why: ctx.can("rbac") ? undefined : "Applying an import needs super-admin access. The check does not.", run: () => crMbImpApply(ctx) } : null,
          !d.imp.done ? { l: "Check again", icon: "arrows-clockwise", run: () => crMbImport(ctx) } : null,
          (r.idList || []).length ? { l: "Download the ID list", icon: "download-simple", run: () => crMbImpIdList(d.imp, !!d.imp.done) } : null,
          !d.imp.done && ctx.can("rbac") ? { l: "Describe a card format", icon: "identification-card", run: () => crMbCardFormat(ctx) } : null,
          !d.imp.done ? { l: "Close the check", icon: "x", run: () => ctx.setData(x => Object.assign({}, x, { imp: null })) } : null,
        ].filter(Boolean);
      }
      return [
        { l: "Add member", icon: "user-plus", primary: true, run: () => crMemAdd(ctx) },
        { l: "Import roster", icon: "upload-simple", run: () => crMbImport(ctx) },
        { l: "Export CSV", icon: "download-simple", run: () => crMbExport(ctx) },
        { l: "Print ID cards", icon: "printer", run: () => ctx.studio() },
        { l: "Issue cards", icon: "qr-code", run: () => crMbIssueCards(ctx) },
        { l: "Send NGVs to Afrovanguard", icon: "paper-plane-tilt", run: () => crMbSyncNgv(ctx) },
      ];
    },
    blocks: (d, ctx) => {
      crMemCtx.current = ctx;
      if (ctx.sub) {
        if (!d.rec || d.rec.id !== ctx.sub) return [{ type: "custom", span: 6, render: c => <CrMbRecLoad key={ctx.sub} ctx={c} id={ctx.sub}/> }];
        return crMbRecBlocks(d, ctx);
      }
      if (d.imp) return crMbImportBlocks(d, ctx);
      const h = (d.overview || {}).headline;
      const out = [];
      if (h) out.push({ type: "kpis", span: 6, items: [{ l: "Members", v: crNum(h.total) }, { l: "Active", v: crNum(h.active) }, { l: "Not active", v: crNum(h.inactive) },
        { l: "Joined · 30 days", v: "+" + crNum(h.new30) }, { l: "Joined · 12 months", v: "+" + crNum(h.new365) }, { l: "Active but dormant", v: crNum(h.dormant), tone: h.dormant ? "down" : "flat" }] });
      if (d.seg) out.push({ type: "note", span: 6, icon: "funnel", tone: "gold", text: "Showing " + (CR_MB_SEG[d.seg] || d.seg.replace(/_/g, " ")) + ".", act: { l: "Show everybody", run: () => ctx.setData(x => crMbWithSeg(x, "")) } });
      const bulk = [
        { l: "Set status", max: 500, run: crMemBulk(ctx, "status", "Set status", { id: "status", l: "Status", type: "select", req: true, opts: CR_MEM_STATUS }, "updated",
          { values: { status: "active" }, intro: "Suspended and inactive are refused for staff accounts — staff lifecycle belongs to Access & roles." }) },
        { l: "Post to centre", max: 500, run: crMemBulk(ctx, "centre", "Post to centre", { id: "centre", l: "Centre", type: "select", ph: "No centre (clears it)", opts: (d.centres || []).map(c => [c, c]) }, "moved") },
        { l: "Set level", max: 500, run: crMemBulk(ctx, "level", "Set level", { id: "level", l: "Level", type: "select", ph: "No level (clears it)", opts: CR_MB_LEVELS.map(x => [x, "Level " + x]) }, "updated") },
        { l: "Set programme", max: 500, run: crMemBulk(ctx, "type", "Set programme", { id: "type", l: "Programme", type: "chips", req: true, opts: CR_MEM_TYPE }, "updated",
          { values: { type: "NGG" }, intro: "NGG is the year-round membership; Summer School is a participant record." }) },
        { l: "Set track", max: 500, run: crMemBulk(ctx, "track", "Set track", { id: "track", l: "Track", max: 64, ph: "Music", help: "Blank clears it." }, "updated") },
        { l: "Record consent", max: 500, run: crMemBulk(ctx, "consent", "Record consent", [
          { id: "consentType", l: "What for", type: "chips", req: true, opts: CR_MB_CONSENT_TYPES.map(t => [t[0], t[1]]) },
          { id: "consentStatus", l: "Decision", type: "chips", req: true, opts: [["granted", "Granted"], ["withdrawn", "Withdrawn"]] },
        ], "recorded", { values: { consentType: "site_visibility", consentStatus: "granted" }, intro: "Only for families whose decision you actually hold — on a paper form, say. A permission nobody gave is worth nothing when it matters.",
          payload: v => ({ consentType: v.consentType, consentStatus: v.consentStatus }) }) },
        ctx.can("fees") ? { l: "Dues reminders", max: 500, run: crMemBulk(ctx, "remindersOff", "Dues reminders", { id: "off", l: "Monthly reminders", type: "chips", req: true, opts: [["1", "Off — don’t remind these families"], ["0", "On — remind them as normal"]] }, "updated",
          { values: { off: "1" }, intro: "Off is a per-family opt-out. It stops the reminder only; the obligation and the balance are unchanged.", payload: v => ({ off: v.off === "1" ? 1 : 0 }) }) } : null,
        { l: "Export selected", run: async keys => { await crMbExport(ctx, keys); return false; } },
      ].filter(Boolean);
      out.push({
        type: "table", span: 6, reloadKey: d.rev, search: "Search by name, ID or email",
        cols: ["Member", "Centre", "Division", "Programme", "Level", "Status", "Joined"],
        server: d.server,
        filters: [
          { id: "status", l: "Status", opts: CR_MEM_STATUS.map(s => ({ v: s[0], l: s[1] })) },
          { id: "type", l: "Programme", opts: CR_MEM_TYPE.map(s => ({ v: s[0], l: s[1] })) },
          { id: "centre", l: "Centre", opts: (d.centres || []).map(c => ({ v: c, l: c })) },
          { id: "level", l: "Level", opts: CR_MB_LEVELS.map(x => ({ v: x, l: "Level " + x })) },
          { id: "missing", l: "Missing from the card", opts: CR_MB_MISSING.map(x => ({ v: x[0], l: x[1] })) },
        ],
        selectAllMatching: async ({ q, filters }) => {
          const r = await NGGApi.admin.members.ids(Object.assign(crMbQuery(d, q, filters), { sort: crMbSortCol(crMbLast.current.sort), dir: crMbLast.current.sort ? crMbLast.current.sort.dir : "" }));
          if (r.capped) ctx.toast("Selected the first " + crNum((r.memberIds || []).length) + " of " + crNum(r.total) + " — one action covers " + crNum(r.max) + " members at a time.", null, true);
          return r.memberIds || [];
        },
        bulk,
        emptyText: d.seg ? "Nobody is in this list. Show everybody to see the roster." : "No members yet. Add one, or import the roster workbook.",
      });
      return out.concat(crMbDashBlocks(d, ctx));
    },
  },
});

/* ── The v1 panels these tabs mount until they are rebuilt as blocks (crPanel). */
Object.assign(CR_TAB_DEFS, {
  quality: crPanel(() => <AdminMembers/>, { tab: "quality" }),   // v1's Data quality and Duplicates, and the rest of its member desk
  families: crPanel(() => <AdminFamilies/>),
  centres: crPanel(() => <AdminCentres/>),
  idcards: crPanel(() => <AdminIdCards/>),
});
