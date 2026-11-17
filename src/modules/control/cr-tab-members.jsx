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
const CR_MB_MISSING = [["photo", "No photograph"], ["printedId", "No printed ID"], ["discipline", "No discipline"], ["courses", "No courses chosen"]];
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
/* The record answers a member row has no column for (domain/profile-drive.php),
   edited here as data.profile. Class options are the Club application's. */
const CR_MEM_PROFILE = [
  { id: "p_sex", key: "sex", l: "Sex", type: "select", ph: "Not recorded", opts: ["Female", "Male"] },
  { id: "p_class", key: "class", l: "Class", type: "select", ph: "Not recorded", opts: null },   // filled when the form opens (page-apply.jsx loads later)
  { id: "p_address", key: "address", l: "Home address", type: "textarea", rows: 2, max: 300 },
  { id: "p_resState", key: "resState", l: "State they live in", max: 60 },
  { id: "p_resLga", key: "resLga", l: "Local government they live in", max: 60 },
];
function crMemProfileValues(m) {
  let j = {}; try { j = JSON.parse((m && m.profileJson) || "{}") || {}; } catch (_) {}
  const v = {}; CR_MEM_PROFILE.forEach(f => { v[f.id] = j[f.key] != null ? String(j[f.key]) : ""; }); return v;
}
/* A member's courses, as stored (a JSON list) — or [] when none were chosen. */
function crMemCourses(m) {
  const v = m && m.courses;
  if (Array.isArray(v)) return v.filter(Boolean);
  try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.filter(Boolean) : []; } catch (_) { return []; }
}
/* The course chips: the chosen division's courses as admins have them, every
   course when no division is chosen, and always whatever is already ticked —
   so changing the division never hides a course the member is on. */
function crMemCourseOpts(divisions, allCourses) {
  return v => {
    const d = (divisions || []).find(x => x.id === v.division);
    const base = d && (d.courseList || []).length ? d.courseList : (allCourses || []);
    return base.concat((v.courses || []).filter(c => !base.includes(c)));
  };
}
function crMemFields(centres, divisions, editing, allCourses) {
  const f = crMemFieldsAll(centres, divisions, allCourses);
  /* The join date is set when the member is made and corrected only with a
     reason ("Correct the join date"), so the edit form does not carry it. */
  const base = editing ? f.filter(x => x.id !== "joinDate") : f;
  const at = base.findIndex(x => x.id === "school") + 1;
  const classes = typeof APF_CLASSES !== "undefined" ? APF_CLASSES.flatMap(g => g[1]) : [];
  return base.slice(0, at).concat(CR_MEM_PROFILE.map(x => { const y = Object.assign({}, x, x.key === "class" ? { opts: classes } : {}); delete y.key; return y; }), base.slice(at));
}
function crMemFieldsAll(centres, divisions, allCourses) {
  return [
    { id: "fullName", l: "Full name", req: true, max: 120 },
    { id: "email", l: "Email", type: "email", email: true, help: "The address they sign in with." },
    { id: "phone", l: "Phone", type: "tel", im: "tel" },
    { id: "type", l: "Programme", type: "chips", req: true, opts: CR_MEM_TYPE },
    { id: "status", l: "Status", type: "select", req: true, opts: CR_MEM_STATUS },
    { id: "centre", l: "Centre", type: "select", ph: "No centre", opts: centres.map(c => [c, c]) },
    { id: "division", l: "Division", type: "select", ph: "Not placed yet", opts: divisions.map(d => [d.id, d.name]) },
    { id: "level", l: "Level", max: 1, ph: "A", help: "One letter, as on the roster workbook.", check: v => /^[A-Za-z]$/.test(v) ? "" : "Use one letter." },
    { id: "courses", l: "Courses", type: "multi", optsFor: crMemCourseOpts(divisions, allCourses),
      help: "What they study. Their lessons, Community channels and assignments follow exactly these. Choose a division to see its courses." },
    { id: "disciplines", l: "Disciplines on the card", max: 60, ph: "TECH, MEDIA", help: "One or two, comma-separated. Blank shows their first course." },
    { id: "displayId", l: "Printed ID", max: 24, help: "Leave blank and a new member is given the next number. A printed ID is never reissued." },
    { id: "photo", l: "Photograph", type: "file", accept: "image/*", help: "A head-and-shoulders photo for the ID card. Leave empty to keep the one on file." },
    { id: "dob", l: "Date of birth", type: "date" },
    { id: "joinDate", l: "Date joined", type: "date", help: "The day they joined NGG. Blank means today. Once set, it is changed only with “Correct the join date”." },
    { id: "school", l: "School", max: 160 },
    { id: "parentName", l: "Parent or guardian", max: 120 },
    { id: "parentPhone", l: "Guardian phone", type: "tel", im: "tel" },
    { id: "parentEmail", l: "Guardian email", type: "email", email: true },
    { id: "notes", l: "Staff notes", type: "textarea", rows: 3, max: 2000, help: "Staff see these. The member does not." },
  ];
}
const CR_MEM_KEYS = ["fullName", "email", "phone", "type", "status", "centre", "division", "level", "track", "disciplines", "displayId", "dob", "joinDate", "school", "parentName", "parentPhone", "parentEmail", "notes"];
function crMemValues(m) {
  const v = {}; CR_MEM_KEYS.forEach(k => { v[k] = m && m[k] != null ? String(m[k]) : ""; });
  v.courses = crMemCourses(m);
  return v;
}
/** What changed on screen, and nothing else. */
function crMemPatch(before, after) {
  const out = {};
  CR_MEM_KEYS.forEach(k => { const a = String(after[k] == null ? "" : after[k]).trim(); if (a !== String(before[k] == null ? "" : before[k]).trim()) out[k] = k === "level" ? a.toUpperCase() : a; });
  const ca = after.courses || [], cb = before.courses || [];
  if (ca.join("\u0001") !== cb.join("\u0001")) out.courses = ca;
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
  let d, coll = null;
  try {
    const [r, c] = await Promise.all([NGGApi.admin.memberDetail(memberId), NGGApi.admin.families.collectors(memberId).catch(() => null)]);
    d = r.detail; coll = c ? c.collectors || [] : null;
  }
  catch (e) { ctx.toast(crErr(e, "Couldn’t open that record."), null, true); return; }
  const m = d.member || {}, data = ctx.data || {};
  const div = (data.divisions || []).find(x => x.id === m.division);
  ctx.drawer({
    title: m.fullName || memberId, name: m.fullName, photo: crMbPhoto(m.photoUrl),
    sub: [m.displayId || m.memberId, m.centre, m.type === "Summer" ? "Summer School" : "NGG"].filter(Boolean).join(" · "),
    stats: [["XP", crNum(d.stats && d.stats.xp)], ["Missions verified", crNum(d.progress && d.progress.verified)], ["Streak", crNum(d.stats && d.stats.streak)]],
    fields: [["Status", crMemStatusLabel(m.status)], ["Member ID", m.memberId], ["Printed ID", m.displayId], ["Email", m.email], ["Phone", m.phone],
      ["Centre", m.centre], ["Division", div ? div.name : (m.division || "Not placed")], ["Level", m.level], ["Courses", crMemCourses(m).join(", ") || (m.track ? m.track + " (not chosen from the list yet)" : "")], ["School", m.school],
      ["Date of birth", m.dob ? crDate(m.dob) : ""], ["Joined", crMemJoined(m)]],
    sections: [
      { h: "Parent or guardian", rows: [["Name", m.parentName], ["Phone", m.parentPhone], ["Email", m.parentEmail]] },
      { h: "Mentor", rows: [["Mentor", d.mentor ? d.mentor.fullName : "None assigned"]] },
      /* Read by the family app and changed only here: a parent asks (a "Change
         who can collect" request) and the desk checks it before saving. */
      coll && m.type !== "Summer" ? { h: "Who can collect", rows: coll.length ? coll.map(c => [c.name, [c.relation, c.phone].filter(Boolean).join(" · ")]) : [["", "Nobody listed yet."]] } : null,
      m.notes ? { h: "Staff notes", text: m.notes } : null,
    ],
    actions: [
      { l: "Edit", primary: true, run: () => crMemEdit(ctx, m) },
      { l: "Correct the join date", run: () => crMemJoinDate(ctx, m) },
      coll && m.type !== "Summer" ? { l: "Who can collect…", run: () => crMemCollectors(ctx, m, coll) } : null,
      { l: "Open full record", run: () => { ctx.closeDrawer(); ctx.setSub(m.memberId); } },
    ].filter(Boolean),
  });
}

/** Who may collect a member, one per line as "Name, relation, phone". Up to eight; the desk checks ID at collection. */
function crMemCollectors(ctx, m, list) {
  ctx.closeDrawer();
  ctx.form({
    title: "Who can collect " + (m.fullName || "this member"), submit: "Save the list", busyLabel: "Saving…",
    intro: "One person per line: name, how they are related, phone. Their family sees this list and cannot change it.",
    values: { lines: (list || []).map(c => [c.name, c.relation, c.phone].filter(Boolean).join(", ")).join("\n") },
    fields: [{ id: "lines", l: "People", type: "textarea", rows: 6, ph: "Kemi Bello, aunt, 0813 000 0000",
      check: v => String(v).split("\n").filter(x => x.trim()).length > 8 ? "Eight people at most." : "" }],
    onSubmit: async v => {
      const rows = String(v.lines || "").split("\n").map(x => x.trim()).filter(Boolean).map(x => { const p = x.split(",").map(y => y.trim()); return { name: p[0] || "", relation: p[1] || "", phone: p.slice(2).join(", ") }; });
      return NGGApi.admin.families.collectorsSet(m.memberId, rows);
    },
    done: (v, r) => "Saved · " + crPlural(((r && r.collectors) || []).length, "person") + " can collect " + (m.fullName || "them") + ".",
  });
}

function crMemEdit(ctx, m, after) {
  const data = ctx.data || {};
  const before = Object.assign(crMemValues(m), crMemProfileValues(m));
  ctx.closeDrawer();
  ctx.form({
    title: "Edit " + (m.fullName || "member"), submit: "Save changes", busyLabel: "Saving…",
    /* A field whose STORED value already breaks its own format rule ("N/A" for
       an email) is not checked here: the rule would refuse every save of the
       record for a field nobody touched. The server still checks it if changed. */
    /* No courses chosen yet: an old free-text track that names a real course
       is ticked on the form (not in `before`), so saving turns it into a choice. */
    values: Object.assign({}, before, { courses: before.courses.length ? before.courses
      : (data.allCourses || []).filter(c => c.toLowerCase() === String(m.track || "").trim().toLowerCase()) }),
    fields: crMemFields(data.centres || [], data.divisions || [], true, data.allCourses || []).map(f => {
      const v = before[f.id];
      if (!v) return f;
      const breaks = (f.email && !/^\S+@\S+\.\S+$/.test(v)) || (f.check && f.check(v, before)) || (f.max && v.length > f.max);
      return breaks ? Object.assign({}, f, { email: false, check: null, max: null, help: "The stored value isn’t in the usual format. Correct it if you can." }) : f;
    }),
    onSubmit: async v => {
      const patch = crMemPatch(before, v);
      delete patch.joinDate;
      const prof = {}; CR_MEM_PROFILE.forEach(f => { if (String(v[f.id] || "").trim() !== String(before[f.id] || "").trim()) prof[f.key] = String(v[f.id] || "").trim(); });
      if (Object.keys(prof).length) patch.profile = prof;
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

/** The one way to change a join date once set: a date and a reason, kept on record with the old date. */
function crMemJoinDate(ctx, m, after) {
  ctx.closeDrawer && ctx.closeDrawer();
  ctx.form({
    title: "Correct the join date", submit: "Correct it", busyLabel: "Saving…",
    intro: (m.fullName || "This member") + (m.joinDate ? " joined on " + crDate(m.joinDate) + " by the record." : " has no join date yet.")
      + " Correct it only when the record is wrong; the old date and your reason are kept.",
    values: { date: m.joinDate || "", reason: "" },
    fields: [
      { id: "date", l: "Date joined", type: "date", req: true, help: m.displayId ? "Their printed ID " + m.displayId + " sets the year they joined." : "Between 2018 and today." },
      { id: "reason", l: "Why it is being corrected", type: "textarea", rows: 2, req: true, max: 300, check: v => String(v || "").trim().length >= 8 ? "" : "Say why, in a few words." },
    ],
    onSubmit: async v => {
      const r = await NGGApi.admin.memberRecords.joinDate(m.memberId, v.date, v.reason);
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
      if (after) after();
      return r;
    },
    done: (v, r) => r && r.unchanged ? "That is already the join date." : "Join date corrected · " + crDate(r.joinDate),
  });
}

function crMemAdd(ctx) {
  const data = ctx.data || {};
  ctx.form({
    title: "Add member", submit: "Add member", busyLabel: "Adding…",
    intro: "They get a member record and, as an NGG member, the next printed ID.",
    values: Object.assign(crMemValues({}), crMemProfileValues({}), { type: "NGG", status: "active", centre: (data.centres || []).length === 1 ? data.centres[0] : "" }),
    fields: crMemFields(data.centres || [], data.divisions || [], false, data.allCourses || []),
    onSubmit: async v => {
      const row = {}; CR_MEM_KEYS.forEach(k => { if (String(v[k] || "").trim() !== "") row[k] = k === "level" ? String(v[k]).trim().toUpperCase() : String(v[k]).trim(); });
      if ((v.courses || []).length) row.courses = v.courses;
      const prof = {}; CR_MEM_PROFILE.forEach(f => { if (String(v[f.id] || "").trim() !== "") prof[f.key] = String(v[f.id]).trim(); });
      if (Object.keys(prof).length) row.profile = prof;
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
        if (o.extra) s.text += o.extra(r);
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
      crMbSuggest(q);
      const r = await NGGApi.admin.members.list(Object.assign(crMbQuery(d, q, filters), { page: page + 1, pageSize, sort: sort ? CR_MEM_SORT[sort.ci] || "" : "", dir: sort ? sort.dir : "" }));
      return {
        total: r.total || 0,
        rows: (r.members || []).map(m => ({
          key: m.memberId,
          cells: [
            { k: "person", t: m.fullName || m.memberId, s: [m.displayId || m.memberId, m.email].filter(Boolean).join(" · "), photo: crMbPhoto(m.photoUrl) },
            { k: "text", t: m.centre || "—" },
            { k: "text", t: divName(m.division) || "Not placed", s: crMemCourses(m).join(", ") || m.track || "" },
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
/* "Did you mean…": who else the search may be looking for (admin_members_suggest)
   — a Summer School participant on an accurate match, with Promote, and NGG
   members whose names are a letter or two away. An aid beside the roster, so
   a failed lookup shows nothing rather than an error over the list. */
const crMbSuggestQ = { current: "" };
function crMbSuggest(q) {
  const t = String(q || "").trim();
  if (t === crMbSuggestQ.current) return;
  crMbSuggestQ.current = t;
  const put = v => { const c = crMemCtx.current; if (c) c.setData(x => Object.assign({}, x, { suggest: v })); };
  if (t.length < 3) return put(null);
  NGGApi.admin.members.suggest(t).then(r => { if (crMbSuggestQ.current === t) put(r && ((r.summer || []).length || (r.near || []).length) ? r : null); }, () => put(null));
}
/* Promotion asks WHICH NGG centre, nearest first: from their home address
   when they gave one, else from where their Summer School met — measured on
   the map, by driving time when Google can say it (domain/centres-ngg.php). */
async function crMbPromoteParticipant(ctx, p) {
  let o;
  try { ctx.toast("Finding the nearest NGG centres…"); o = await NGGApi.admin.club.promoteOptions(p.studentId); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t load the centres."), null, true); return; }
  if (!(o.centres || []).length) { ctx.toast("No NGG centre is open. Add one in Members → Centres first.", null, true); return; }
  const near = c => c.minutes != null ? "~" + c.minutes + " min drive" + (c.roadKm != null ? " · " + c.roadKm + " km by road" : "") + (c.approx ? " (approx.)" : "") : c.km != null ? c.km + " km in a straight line" + (c.approx ? " (approx.)" : "") : "";
  ctx.form({
    title: "Make " + p.fullName + " an NGG member",
    intro: "They get a member ID of their own and join the NGG centre you choose. Their Summer School record stays as it is. " + o.why,
    submit: "Promote",
    values: { centre: o.suggested || "" },
    fields: [{ id: "centre", l: "NGG centre", type: "chips", req: true,
      opts: o.centres.map((c, i) => [c.name, c.name + (near(c) ? " · " + near(c) : "") + (i === 0 && near(c) ? " · nearest" : "")]),
      help: o.homeAddress ? "Home address on their registration: " + o.homeAddress : "No home address on their registration." }],
    onSubmit: async v => {
      try { return await NGGApi.admin.club.promote(p.studentId, v.centre); }
      catch (e) {
        const c = e && (e.code || e.message);
        if (c === "invalid_centre" || c === "centre_required") return { fieldErrors: { centre: crErr(e, "Choose an open NGG centre.") } };
        throw Object.assign(e, { data: Object.assign({}, e.data, { message: c === "already_promoted" ? p.fullName + " is already a member." : c === "forbidden" ? "Promoting needs the Club permission." : crErr(e, "Couldn’t promote " + p.fullName + ".") }) });
      }
    },
    done: (v, r) => {
      crMbSuggestQ.current = ""; crMbSuggest(crMbLast.current.q);
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
      return "Promoted · " + p.fullName + " is now a member" + (r && r.memberId ? " (" + r.memberId + ")" : "") + " at " + v.centre;
    },
  });
}
function CrMbSuggest({ s, ctx }) {
  return (
    <section className="cr-sugg" aria-label="Other people this search may mean">
      {s.summer.length > 0 && <div className="cr-sugg-group">
        <h3>Summer School {s.summer.length === 1 ? "participant" : "participants"} matching “{s.q}”</h3>
        <ul>{s.summer.map(p => (
          <li key={p.studentId}>
            <CrAvatar name={p.fullName} photo={nggPhotoSrc(p.photoUrl)}/>
            <span className="cr-sugg-t"><b>{p.fullName}</b><span>{[p.displayId || p.studentId, p.centre, p.edition, p.age != null ? "age " + p.age : ""].filter(Boolean).join(" · ")}</span></span>
            {p.promoted ? <CrPill tone="ok" t="Already a member"/>
              : s.canPromote ? <button type="button" className="cr-btn is-sm" onClick={() => crMbPromoteParticipant(ctx, p)}>Promote to member</button>
              : <span className="cr-sugg-why">Promoting needs the Club permission</span>}
          </li>))}</ul>
      </div>}
      {s.near.length > 0 && <div className="cr-sugg-group">
        <h3>Members with a very similar name</h3>
        <ul>{s.near.map(m => (
          <li key={m.memberId}>
            <CrAvatar name={m.fullName} photo={nggPhotoSrc(m.photoUrl)}/>
            <span className="cr-sugg-t"><b>{m.fullName}</b><span>{[m.displayId || m.memberId, m.centre, crMemStatusLabel(m.status)].filter(Boolean).join(" · ")}</span></span>
            <button type="button" className="cr-btn is-sm" aria-label={"Open the record of " + (m.fullName || m.memberId)} onClick={() => crMemOpen(ctx, m.memberId)}>Open record</button>
          </li>))}</ul>
      </div>}
    </section>
  );
}
/* Imported members signed the paper form, which grants every permission: record
   it for the ones still missing an answer (admin.members.paperConsents). The
   count comes first; a decision already on file is never overwritten. */
async function crMbPaperConsents(ctx) {
  let pre;
  try { pre = await NGGApi.admin.members.paperConsents(false); }
  catch (e) { return ctx.toast(crErr(e, "Couldn’t count the imported members."), null, true); }
  if (!pre.wouldGrant) return ctx.toast("Every imported member already has every permission on file" + (pre.declinedKept ? " (" + crPlural(pre.declinedKept, "explicit decline") + " kept as recorded)." : "."));
  const ok = await ctx.confirm({ title: "Grant every permission to " + crPlural(pre.members, "imported member") + "?", cta: "Record " + crNum(pre.wouldGrant),
    body: crPlural(pre.wouldGrant, "permission") + " with no answer on file will be recorded as granted on the paper form — participation, emergency medical care, data, photos, the website, trips and updates — with your name as the person who recorded it."
      + (pre.declinedKept ? " " + crPlural(pre.declinedKept, "explicit decline") + " already on file stay as they are." : "") });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.members.paperConsents(true);
    ctx.toast("Recorded · " + crPlural(r.granted, "permission") + " for " + crPlural(r.members, "member") + (r.capped ? " — run it again for the rest" : "") + ".");
  } catch (e) { ctx.toast(crErr(e, "Couldn’t record the permissions."), null, true); }
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
    crDownloadCsv("members", ["memberId", "displayId", "fullName", "email", "type", "status", "centre", "level", "courses", "division", "joinDate"],
      out.map(m => [m.memberId, m.displayId || "", m.fullName, m.email, m.type, m.status, m.centre, m.level || "", crMemCourses(m).join("; ") || m.track || "", m.division || "", m.joinDate || ""]));
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
const CR_MB_REC_TABS = [["overview", "Overview"], ["attendance", "Attendance"], ["conduct", "Conduct"], ["fees", "Fees"], ["requests", "Requests"], ["curriculum", "Curriculum"],
  ["companion", "Companion"], ["family", "Family & mentor"], ["classes", "Classes"], ["card", "ID card"], ["history", "History"]];
const CR_MB_RATING = { on_track: ["On track", "ok"], watch: ["Watch", "warn"], at_risk: ["At risk", "bad"] };
const CR_MB_ATT = { present: ["Present", "ok"], late: ["Late", "warn"], absent: ["Absent", "bad"], incomplete: ["No sign-out · half-day", "warn"] };

async function crMbRecFetch(id) {
  const soft = p => p.catch(e => ({ _err: e }));
  const [det, rec, tl, cards, hist, row, reqs] = await Promise.all([
    NGGApi.admin.memberDetail(id), soft(NGGApi.admin.memberRecord(id)), soft(NGGApi.admin.memberTimeline(id)),
    soft(NGGApi.admin.members.cards.of(id)), soft(NGGApi.admin.registration.cardHistory(id, "member")),
    NGGApi.admin.members.list({ q: id, page: 1, pageSize: 200, sort: "memberId", dir: "asc" }).catch(() => ({ members: [] })),
    soft(NGGApi.admin.requests.list({ memberId: id, status: "all", pageSize: 50 })),
  ]);
  const listRow = (row.members || []).find(x => x.memberId === id) || {};
  return { id, detail: det.detail || {}, record: rec, timeline: tl, cards, hist, requests: reqs, consent: listRow.consent || null };
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
/* A supporting mentor: up to two beside the main one, each with what they help
   with and, if it is for a while, an end date. They join the child's one
   conversation, which the main mentor sees; nothing else of the child's. */
async function crMbSupport(ctx, m, det) {
  let mentors = [];
  try { mentors = (await NGGApi.admin.mentors.list()).mentors || []; }
  catch (e) { return ctx.toast(crErr(e, "Couldn’t load the mentors."), null, true); }
  const taken = [(det.mentor || {}).mentorId].concat((det.supporting || []).map(x => x.mentorId));
  const opts = mentors.filter(x => !taken.includes(x.mentorId) && x.rank !== "peer").map(x => [x.mentorId, x.fullName + (x.tracks && x.tracks.length ? " · " + x.tracks.join(", ") : "")]);
  ctx.form({
    title: "Add a supporting mentor for " + (m.fullName || "this member"), submit: "Add", busyLabel: "Adding…",
    intro: "They help with one thing, beside " + ((det.mentor || {}).fullName || "the main mentor") + ". They write in the child’s conversation, which the main mentor sees; wellbeing, scores and family details stay with the main mentor. Peer mentors are not listed.",
    values: { mentorId: "", focus: "", endsOn: "" },
    fields: [{ id: "mentorId", l: "Mentor", type: "select", req: true, ph: "Choose a mentor", opts },
      { id: "focus", l: "What they help with", req: true, max: 60, ph: "e.g. Coding, Exams", help: "The child sees this." },
      { id: "endsOn", l: "Until (optional)", type: "date", help: "Leave empty to keep it until you end it. At most a year ahead." }],
    onSubmit: async v => { await NGGApi.admin.mentorSupport({ memberId: m.memberId, mentorId: v.mentorId, focus: v.focus, endsOn: v.endsOn || "" }); await crMbRecReload(ctx, m.memberId); return v; },
    done: () => "Supporting mentor added",
  });
}
async function crMbSupportEnd(ctx, m, x) {
  const ok = await ctx.confirm({ title: "End " + (x.fullName || "this") + "’s support?", danger: true, cta: "End support",
    body: "They stop being part of " + (m.fullName || "the member") + "’s conversation from now. What they wrote stays on record." });
  if (!ok) return;
  try { await NGGApi.admin.mentorSupport({ memberId: m.memberId, mentorId: x.mentorId, end: true }); await crMbRecReload(ctx, m.memberId); ctx.toast("Support ended"); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t end it."), null, true); }
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
      kv("music-notes", "Courses · disciplines", [crMemCourses(m).join(", ") || m.track, m.disciplines].filter(Boolean).join(" · ")), kv("cake", "Date of birth", m.dob ? crDate(m.dob) : ""),
      kv("calendar-check", "Joined", crMemJoined(m)),
    ] });
    out.push({ type: "list", span: 3, title: "Guardian and school", rows: [kv("user", "Parent or guardian", m.parentName), kv("phone", "Guardian phone", m.parentPhone), kv("envelope-simple", "Guardian email", m.parentEmail), kv("graduation-cap", "School", m.school)] });
    const STATUS_ACT = [["active", "Activate", "play-circle"], ["suspended", "Suspend", "pause-circle"], ["graduated-ngg", "Graduate from NGG", "graduation-cap"], ["graduated-vanguard", "Graduate as Vanguard", "medal"], ["inactive", "Deactivate", "minus-circle"]];
    out.push({ type: "list", span: 3, title: "Standing", sub: crMemStatusLabel(m.status),
      rows: STATUS_ACT.filter(s => s[0] !== m.status).map(s => ({ icon: s[2], t: s[1], s: s[0] === "suspended" ? "Revokes their access until they are activated again." : "", onClick: crMbStatusSet(ctx, m, s[0]) })) });
    out.push({ type: "list", span: 3, title: "Mentor", action: "Change", onAction: () => crMbMentor(ctx, m, det.mentor),
      rows: [det.mentor ? { icon: "handshake", t: det.mentor.fullName, s: "Their mentor" } : { icon: "handshake", t: "No mentor", s: "Assign one so the weekly review happens.", onClick: () => crMbMentor(ctx, m, null) }]
        .concat((det.supporting || []).map(x => ({ icon: "users", t: x.fullName || x.mentorId, s: "Supporting · " + x.focus + (x.endsOn ? " · until " + crDate(x.endsOn) : "") + " · tap to end", onClick: () => crMbSupportEnd(ctx, m, x) })))
        .concat(det.mentor && (det.supporting || []).length < 2 ? [{ icon: "plus-circle", t: "Add a supporting mentor", s: "Up to two, each for one thing", onClick: () => crMbSupport(ctx, m, det) }] : []) });
    const eligible = isNgg && m.status === "active";
    out.push({ type: "list", span: 3, title: "Chain of command", rows: m.ngvVolunteerId ? [
      { icon: "shield-check", t: "Promoted to NGV · " + m.ngvVolunteerId, s: (m.ngvAt ? crDate(m.ngvAt) + " · " : "") + "Their NGV dashboard is active." },
      { icon: "paper-plane-tilt", t: "Resend their NGV ID", onClick: () => crMbResendNgv(ctx, m) },
      { icon: "printer", t: "Print their Afrovanguard card", s: "In the ID Card Studio, under Afrovanguard.", onClick: () => ctx.studio() },
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
    const ap = r && r.application;
    if (ap) out.push({ type: "list", span: 3, title: "In their own words", sub: "From their application, " + crDate(ap.appliedAt), rows: [
      { icon: "star", t: ap.vision || "—", s: "Their vision" },
      kv("heart", "What they enjoy", (ap.hobbies || []).join(", ")),
      kv("flag", "Where they want to lead", (ap.influenceAreas || []).join(", ")),
      kv("megaphone", "Heard about NGG from", ap.heardFrom),
    ] });
    if (m.notes) out.push({ type: "note", span: 6, icon: "note", text: m.notes, sub: "Staff notes. The member does not see these." });
    return out;
  }
  if (tab === "history") {
    const tl = rec.timeline;
    if (!tl || tl._err) return out.concat([recErr("the history", tl && tl._err)]);
    return out.concat([{ type: "list", span: 6, title: "History", sub: "Everything audited against this member", empty: "Nothing has been recorded against this member yet. Not “nothing happened” — nothing that was audited.",
      rows: (tl.events || []).map(e => ({ icon: "clock", t: e.what, s: e.by, m: crDate(e.at, true) })) }]);
  }
  if (tab === "requests") {
    const q = rec.requests;
    if (!q || q._err) return out.concat([recErr("this member’s requests", q && q._err)]);
    const more = q.total > (q.requests || []).length;
    return out.concat([{ type: "list", span: 6, title: "Requests", sub: more ? "The newest " + crNum(q.requests.length) + " of " + crNum(q.total) : crPlural(q.total || 0, "request"),
      action: "Open request history", onAction: () => ctx.go("members", "request-log", rec.id),
      empty: "This member has not raised a request. Members raise them from Records in their app; parents from the family account.",
      rows: (q.requests || []).map(x => ({ icon: x.kind === "payment" ? "currency-ngn" : "hand", t: (x.subject || x.kindLabel) + " · " + x.requestId,
        s: crDate(x.createdAt) + (x.decidedAt ? " · " + crReqStatus(x)[0].toLowerCase() + " by " + (x.decidedByName || "staff") + " " + crDate(x.decidedAt) : "") + (x.decision ? " · “" + x.decision.slice(0, 120) + "”" : ""),
        m: crReqStatus(x)[0], onClick: () => crReqOpen(ctx, x) })) }]);
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
      { type: "list", span: 3, title: "Infractions", empty: "None recorded.", rows: (c.infractions || []).map(x => ({ icon: x.voidedAt ? "prohibit" : "warning", t: x.kind + (x.note ? " — " + x.note : "") + (x.guardianReason ? " · " + guardianReasonText(x.guardianReason) : ""), s: crDate(x.date) + (x.voidedAt ? " · voided" : "") })) },
      { type: "list", span: 3, title: "Sanctions", empty: "None.", rows: (c.sanctions || []).map(x => ({ icon: "gavel", t: x.kind + (x.amount ? " · " + fmtMoney(x.amount) : ""), s: crDate(x.issuedAt) + (x.reason ? " · " + x.reason : ""), m: x.status })) },
    ].filter(Boolean));
  }
  if (tab === "fees") {
    if (!r.fees) return out.concat([crMbHidden("Money")]);
    const f = r.fees;
    /* The account statement's figures (Money › the member's account): Charged − Received = Payable now.
       "Outstanding" held the training place, which nobody is asked to pay, beside the payable it disagreed with. */
    const items = [{ l: "Payable now", v: fmtMoney(f.payable) }, { l: "Charged", v: fmtMoney(f.realCharged !== undefined ? f.realCharged : f.charged) },
      { l: "Received", v: fmtMoney(f.realCredited !== undefined ? f.realCredited : f.credited) }];
    if (f.programmeCost) items.push({ l: "Programme covered", v: fmtMoney(f.programmeCovered) + " of " + fmtMoney(f.programmeCost) });
    const mm = (rec.detail || {}).member || {}, settled = String(mm.feesSettledThrough || "");
    return out.concat([
      { type: "kpis", span: 6, items },
      /* "Clear dues they don't owe" lived here and was retired (fraud path; fees.php,
         admin_fees_settle). A date settled before then is still honoured and shown. */
      settled ? { type: "note", span: 6, icon: "check-circle", tone: "ok", text: "Membership and dues settled up to " + crDate(settled) + ".",
        sub: "Recorded before clearing dues was withdrawn. Nothing on or before that day is charged again." } : null,
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
    const g = r.guardian || {}, mt = r.mentorship || {}, ap = r.application || null, g2 = ap && ap.guardian2;
    return out.concat([
      { type: "list", span: 3, title: "Guardian on the record", empty: "No guardian on the record.", rows: (g.name || g.email || g.phone) ? [{ icon: "user", t: g.name || "—", s: ap && ap.guardian1Rel ? "Name · " + ap.guardian1Rel : "Name" }, { icon: "phone", t: g.phone || "—", s: "Phone" }, { icon: "envelope-simple", t: g.email || "—", s: "Email" }] : [] },
      g2 ? { type: "list", span: 3, title: "Second parent or guardian", sub: "From their application, " + crDate(ap.appliedAt), rows: [{ icon: "user", t: g2.name, s: "Name" + (g2.rel ? " · " + g2.rel : "") }, { icon: "phone", t: g2.phone || "Same number as above", s: "Phone" }] } : null,
      { type: "list", span: 3, title: "Family accounts linked", action: "Open Families", onAction: () => ctx.go("members", "families"), empty: "No family account is linked. A guardian can request a link from the family page.",
        rows: (r.family || []).map(f => ({ icon: "users", t: f.fullName + (f.relationship ? " · " + f.relationship : ""), s: f.email, m: f.status })) },
      mt.mentor ? { type: "kpis", span: 6, items: [{ l: "Mentor", v: mt.mentor }, { l: "Since", v: mt.since ? crDate(mt.since) : "—" }, { l: "Meetings in 90 days", v: crNum(mt.meetings90), tone: mt.meetings90 ? "flat" : "down" }, { l: "Last met", v: mt.lastMet ? crDate(mt.lastMet) : "—" }] }
        : { type: "note", span: 6, icon: "handshake", text: "No mentor assigned.", act: { l: "Assign a mentor", run: () => crMbMentor(ctx, m, null) } },
      mt.mentor && !mt.meetings90 ? { type: "note", span: 6, icon: "warning", tone: "warn", text: "No meeting logged in 90 days.",
        sub: "The weekly review is not happening. Mentorship check-ins shows what is overdue for every match.", act: { l: "See overdue check-ins", run: () => ctx.go("mentorship", "ms-checkins") } } : null,
    ].filter(Boolean));
  }
  if (tab === "classes") {
    if (!r.centre) return out.concat([{ type: "note", span: 6, icon: "map-pin", text: "No centre on the record, so no timetable.",
      act: { l: "Set their centre", run: () => crMemEdit(ctx, m, () => crMbRecReload(ctx, m.memberId)) } }]);
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
    /* Each row goes where the thing is DONE, and says what that is. A row
       that only filtered the roster ("Review" on all four) left the operator
       holding a list and no way to act on it. "Fined" is gone from here: it is
       the all-time count, the same people as "owing" plus the paid, and the
       totals note below carries it. */
    const can = k => !ctx.can || ctx.can(k);
    out.push({ type: "attention", span: 3, title: "Conduct and progression", sub: "What needs deciding, collecting or lifting", empty: "No sanctions to decide, fines owed or suspensions.", rows: [
      { n: c.awaitingReview, l: (c.awaitingReview === 1 ? "sanction" : "sanctions") + " to decide", s: "Proposed by the conduct policy. Confirm or waive each one.", tone: "warn", age: 3, act: "Decide",
        onClick: () => ctx.go("money", "conduct") },
      { n: c.finesOwedBy, l: "owing a fine", s: fmtMoney(c.finesOwed) + " outstanding. Record payments or waive.", tone: "warn", age: 2, act: can("fees") ? "Collect" : "See who",
        onClick: can("fees") ? () => ctx.go("money", "fees") : seg("fines_owed") },
      { n: c.suspended, l: "suspended now", s: "Lift early or extend on the compliance board.", tone: "bad", age: 1, act: "Lift or extend",
        onClick: () => ctx.go("money", "conduct") },
      { n: c.evicted, l: "evicted", s: "No longer attending.", tone: "bad", act: "See who", onClick: seg("evicted") },
      { n: c.promoted, l: "promoted to NGV", s: "Moved on to NextGen Vanguard.", tone: "ok", act: "See who", onClick: seg("promoted_ngv") },
    ] });
  }
  /* Records needing attention, the same way: each row is the fix, not a
     filtered list with "Review" on it. A gap a family can fill is ASKED for
     in one press (admin.profile.remind: the same email the record drive
     sends, listing what is missing); a gap only staff can fill opens the
     roster on exactly those records. Children with no guardian contact come
     first and are staff work — there is nobody to email. */
  const askFamilies = (key, what) => async () => {
    let r;
    try { r = await NGGApi.admin.members.ids({ segment: key }); }
    catch (e) { ctx.toast(crErr(e, "Couldn’t find who that is."), null, true); return; }
    const ids = r.memberIds || [];
    if (!ids.length) { ctx.toast("Nobody to ask — the figure has changed since this page loaded."); return; }
    const ok = await ctx.confirm({ title: "Ask " + crPlural(ids.length, "family", "families") + " for " + what + "?",
      body: "Each gets an email listing what is missing from the record, with a link to fill it in on the dashboard." + (r.capped ? " This sends to the first " + crNum(ids.length) + " of " + crNum(r.total) + "." : ""),
      cta: "Email " + crNum(ids.length) });
    if (!ok) return;
    try {
      const s = await NGGApi.admin.memberRecords.remind(ids);
      const res = s.results || [], noMail = res.filter(x => x.error === "no_email").length, done = res.filter(x => x.unchanged).length, other = res.filter(x => !x.ok && x.error !== "no_email").length;
      ctx.toast("Emailed " + crPlural(s.sent || 0, "family", "families") + [noMail ? crNum(noMail) + " have no email to send to" : "", done ? crNum(done) + " already complete" : "", other ? crNum(other) + " not sent" : ""].filter(Boolean).map(x => " · " + x).join(""), null, !!other);
    } catch (e) { ctx.toast(crErr(e, "Couldn’t send those emails."), null, true); }
  };
  const QUAL = [
    { k: "minor_no_guardian", l: "children with no guardian contact", s: "Nobody to call in an emergency. Add a parent or guardian to each.", tone: "bad", age: 9, act: "Add guardians", onClick: seg("minor_no_guardian") },
    { k: "duplicate_groups", l: "possible duplicate records", s: "One person, two records: their card and fees land twice. Merge them.", tone: "bad", age: 8, act: "Merge", onClick: () => ctx.go("members", "quality") },
    { k: "unknown_centre", l: "in a centre that no longer exists", s: "Select them all and move them to a current centre.", tone: "warn", age: 7, act: "Move", onClick: seg("unknown_centre") },
    { k: "no_centre", l: "in no centre", s: "No card prefix, no centre reports. Select them all and set a centre.", tone: "warn", age: 6, act: "Assign", onClick: seg("no_centre") },
    { k: "no_dob", l: "with no date of birth", s: "Ask their families: one email each, listing what is missing.", tone: "warn", age: 5, act: "Ask families", onClick: askFamilies("no_dob", "a date of birth") },
    { k: "no_email", l: "with no email", s: "No sign-in by email and no reminders reach them. Add one from the record.", tone: "warn", age: 4, act: "Add emails", onClick: seg("no_email") },
    { k: "no_phone", l: "with no phone", s: "Add a number from the record, or ask at the desk.", tone: "warn", age: 3, act: "Add phones", onClick: seg("no_phone") },
  ];
  out.push({ type: "attention", span: c ? 3 : 6, title: "Records needing attention", sub: "Most serious first", action: "Data quality", onAction: () => ctx.go("members", "quality"),
    empty: "Nothing outstanding — every record has a name, a way to reach someone, and a centre.",
    rows: QUAL.map(x => Object.assign({}, x, { n: q[x.k] || 0 }))
      .concat(o.consent && o.consent.participants > 0 ? [{ n: o.consent.unrecorded, l: "with no publication consent", s: "Of " + crNum(o.consent.participants) + " members. They stay off the public site until consent is recorded.", tone: "neutral", age: 0, act: "See who", onClick: seg("no_consent") }] : []) });
  if (c) out.push({ type: "note", span: 6, icon: "scales", text: "Fines imposed to date: " + fmtMoney(c.finesImposed) + ", of which " + fmtMoney(c.finesOwed) + " is still owed.", sub: "Proposed, waived and lifted fines are not counted. " + crNum(c.promoted365) + " promoted to NGV in the last 12 months." });
  out.push({ type: "columns", span: 4, title: "Joining, month by month", big: crNum(h.new365), sub: "joined in 12 months", bars: (o.growth || []).map(g => ({ l: new Date(g.month + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" }), v: g.joined, tip: g.month + " · " + crPlural(g.joined, "member") })) });
  out.push({ type: "bars", span: 2, title: "By centre", empty: "No centres yet.", rows: (o.byCentre || []).map(x => [x.name + " · " + crNum(x.active) + " active", x.total]) });
  out.push({ type: "bars", span: 2, title: "By status", rows: Object.entries(o.byStatus || {}).map(([k, v]) => [crMemStatusLabel(k), v]) });
  out.push({ type: "bars", span: 2, title: "By programme", rows: Object.entries(o.byType || {}).map(([k, v]) => [k === "Summer" ? "Summer School" : "NGG", v]) });
  if (o.dues) out.push({ type: "kpis", span: 2, title: "Dues", items: [{ l: "Families owing", v: crNum(o.dues.people) }, { l: "Payable", v: fmtMoney(o.dues.outstanding) }] });
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
      return crMbWithSeg({ centres, divisions: dv.divisions || [], allCourses: dv.allCourses || [], overview: ov.overview || null, rev: 0, imp: null, rec: null }, seg);
    },
    actions: (d, ctx) => {
      if (ctx.sub) {
        const rec = d.rec && d.rec.id === ctx.sub ? d.rec : null, m = rec ? rec.detail.member || {} : null;
        return [
          { l: "Edit", icon: "pencil-simple", primary: true, disabled: !m, why: m ? undefined : "Loading the record", run: () => crMemEdit(ctx, m, () => crMbRecReload(ctx, m.memberId)) },
          { l: "Correct the join date", icon: "calendar-check", disabled: !m, why: m ? undefined : "Loading the record", run: () => crMemJoinDate(ctx, m, () => crMbRecReload(ctx, m.memberId)) },
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
        { l: "Grant paper permissions", icon: "signature", run: () => crMbPaperConsents(ctx) },
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
        { l: "Set courses", max: 500, run: crMemBulk(ctx, "courses", "Set courses", [
          { id: "mode", l: "How", type: "chips", req: true, opts: [["add", "Add these"], ["replace", "Replace theirs with these"], ["remove", "Take these off"]] },
          { id: "courses", l: "Courses", type: "multi", optsFor: () => d.allCourses || [], help: "From the catalogue. Their lessons, channels and assignments follow these." },
        ], "updated", { values: { mode: "add" }, intro: "Courses come from the catalogue under Divisions & courses.",
          payload: v => ({ mode: v.mode, courses: v.courses || [] }) }) },
        { l: "Record consent", max: 500, run: crMemBulk(ctx, "consent", "Record consent", [
          { id: "consentType", l: "What for", type: "chips", req: true, opts: CR_MB_CONSENT_TYPES.map(t => [t[0], t[1]]) },
          { id: "consentStatus", l: "Decision", type: "chips", req: true, opts: [["granted", "Granted"], ["withdrawn", "Withdrawn"]] },
        ], "recorded", { values: { consentType: "site_visibility", consentStatus: "granted" }, intro: "Only for families whose decision you actually hold — on a paper form, say. A permission nobody gave is worth nothing when it matters.",
          payload: v => ({ consentType: v.consentType, consentStatus: v.consentStatus }) }) },
        ctx.can("fees") ? { l: "Dues reminders", max: 500, run: crMemBulk(ctx, "remindersOff", "Dues reminders", { id: "off", l: "Monthly reminders", type: "chips", req: true, opts: [["1", "Off — don’t remind these families"], ["0", "On — remind them as normal"]] }, "updated",
          { values: { off: "1" }, intro: "Off is a per-family opt-out. It stops the reminder only; the obligation and the balance are unchanged.", payload: v => ({ off: v.off === "1" ? 1 : 0 }) }) } : null,
        ctx.can("people") ? { l: "Broke a rule…", max: 100, run: keys => { crRuleBreach(ctx, keys, "", () => ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }))); return false; } } : null,
        { l: "Export selected", run: async keys => { await crMbExport(ctx, keys); return false; } },
      ].filter(Boolean);
      if (d.suggest) out.push({ key: "suggest", type: "custom", span: 6, render: c => <CrMbSuggest s={d.suggest} ctx={c}/> });
      out.push({
        key: "roster", type: "table", span: 6, reloadKey: d.rev, search: "Search by name, ID, email or phone",
        cols: ["Member", "Centre", "Division", "Programme", "Level", "Status", "Joined"],
        server: d.server,
        filters: [
          { id: "status", l: "Status", opts: CR_MEM_STATUS.map(s => ({ v: s[0], l: s[1] })) },
          { id: "type", l: "Programme", opts: CR_MEM_TYPE.map(s => ({ v: s[0], l: s[1] })) },
          { id: "centre", l: "Centre", opts: (d.centres || []).map(c => ({ v: c, l: c })) },
          { id: "level", l: "Level", opts: CR_MB_LEVELS.map(x => ({ v: x, l: "Level " + x })) },
          { id: "missing", l: "Missing", opts: CR_MB_MISSING.map(x => ({ v: x[0], l: x[1] })) },
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
/* Add a centre: name, the printed ID's code, the card colour, and which
   programme runs there. Address, lead, contacts and meeting times are set
   from Edit on its row afterwards. Gated on the server (people). */
function crMbCentreAdd() {
  const ctx = crMbCentreCtx.current;
  if (!ctx) return;
  ctx.form({
    title: "Add a centre",
    intro: "A centre is a place where NGG meets. Its code is the prefix on printed IDs (EG-26-001) and its colour is the card’s accent band, so both are effectively permanent once cards are printed. Add the address, lead and meeting times afterwards with Edit.",
    submit: "Add the centre",
    values: { name: "", code: "", color: "#76B043", programmes: "ngg", capacity: "" },
    fields: [
      { id: "name", l: "Name", req: true, max: 80, ph: "e.g. Egbeda" },
      { id: "code", l: "Code (1–4 letters)", req: true, max: 4, ph: "EG", check: v => /^[A-Za-z]{1,4}$/.test(String(v).trim()) ? "" : "One to four letters." },
      { id: "color", l: "Card colour", type: "color" },
      { id: "programmes", l: "Runs", type: "chips", req: true, opts: [["ngg", "The NGG Club"], ["summer", "Summer School"], ["ngg,summer", "Both"]] },
      { id: "capacity", l: "Summer School capacity", im: "numeric", ph: "0 for no limit", when: v => v.programmes !== "ngg", check: v => v === "" || /^\d+$/.test(String(v)) ? "" : "A whole number." },
    ],
    onSubmit: async v => {
      try {
        await NGGApi.admin.registration.centreUpsert({ name: v.name.trim(), code: v.code.trim().toUpperCase(), color: v.color, programmes: v.programmes.split(","), capacity: v.capacity === "" ? 0 : parseInt(v.capacity, 10) || 0 });
      } catch (e) {
        if (e.code === "code_taken" || e.code === "bad_code" || e.code === "code_reserved") return { fieldErrors: { code: crErr(e, "That code is already used by another centre.") } };
        if (e.code === "name_taken" || e.code === "bad_name") return { fieldErrors: { name: crErr(e, "That name is already used.") } };
        throw e;
      }
      /* Like Edit, Remove and Retire: the directory reloads, so the centre is on it at once. Add alone
         announced the change to everyone else and left this list saying "0 centres" until a refresh. */
      crCeDone(); ctx.reload();
    },
    done: v => v.name.trim() + " added. Open Edit on its row to add the address, lead and meeting times.",
  });
}
const crMbCentreCtx = { current: null };

/* ── Request history (members/request-log) ──────────────────────────────────
   The Inbox shows what is waiting; this is everything ever raised, so a
   request that was decided or withdrawn can still be found — by the REQ- id
   an alert carried, the member, or the reference on a bank statement. The
   server searches, filters, scopes and pages (admin_requests_list); the
   URL tail is a search, so /control/members/request-log/REQ-9EE53F1611 opens
   on that one request. */
const CR_REQ_STATUS = { open: ["Waiting", "warn"], approved: ["Approved", "ok"], declined: ["Declined", "bad"], withdrawn: ["Withdrawn", "neutral"] };
const CR_REQ_SORTS = [["newest", "Newest first"], ["oldest", "Oldest first"], ["decided", "Recently decided"], ["amount", "Largest amount"]];
function crReqStatus(x) { return CR_REQ_STATUS[x.status] || [String(x.status || "—"), "neutral"]; }
/* ── A payment claim, one line per way it was paid ──────────────────────────
   Claims carry `parts` (member-self.php): a transfer with its reference, cash
   with who took it. An older claim has only a Reference box, and families
   wrote the whole story in it ("2MPTg39mv. 2108827059… I paid 10000 naira as
   transfer and 2000 naira cash to Mrs Basirat Awolaja") — so that text is
   read for its references and its "N by transfer / N cash to …" pieces, and
   offered as the starting lines of the approval for the desk to check. Nothing
   posts on a guess: the desk confirms each line against the statement. */
const CR_PAY_METHODS = [["transfer", "Transfer"], ["cash", "Cash"], ["pos", "POS"]];
const CR_PAY_LINES = 3;
/** A reference that is really a sentence — more words than a reference has. */
function crPayIsNote(ref) { return String(ref || "").trim().split(/\s+/).length >= 4; }
/** The reference-like tokens in a sentence: a run of 8+ letters and digits with at least one digit. */
function crPayRefs(text) { return (String(text || "").match(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}\b/g) || []).filter((v, i, a) => a.indexOf(v) === i); }
/** "10000 naira as transfer and 2000 naira cash to Mrs Awolaja" → lines. */
function crPayGuess(x) {
  if (x.parts && x.parts.length) return x.parts.map(p => ({ method: p.method, amount: p.amount, ref: p.method === "cash" ? p.receivedBy : p.reference }));
  const t = String(x.reference || "") + " " + String(x.body || ""), out = [];
  const re = /(?:₦|#|n)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?\s*(?:naira|ngn)?\s*(?:as|by|in|via|through|paid)?\s*(?:a\s+|bank\s+)?(transfer|cash|pos)\b/gi;
  let m;
  while ((m = re.exec(t)) && out.length < CR_PAY_LINES) {
    const amount = Math.round(Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1)), method = m[3].toLowerCase();
    if (!(amount > 0)) continue;
    const after = t.slice(re.lastIndex, re.lastIndex + 80), who = method === "cash" ? (/^\s*(?:to|with|given to|handed to)\s+([A-Z][^.,;\d]{2,60})/i.exec(after) || [])[1] : "";
    out.push({ method, amount, ref: method === "cash" ? String(who || "").trim() : "" });
  }
  const refs = crPayRefs(x.reference);
  const tr = out.find(p => p.method !== "cash");
  if (tr && refs.length) tr.ref = refs.join(" · ");
  if (!out.length) out.push({ method: "transfer", amount: x.amount || "", ref: crPayIsNote(x.reference) ? refs.join(" · ") : (x.reference || "") });
  return out;
}
/** The approval form for a payment claim: up to three lines, each a way it arrived. */
function crPayApproveForm(x) {
  const g = crPayGuess(x), values = { why: "" }, fields = [];
  const money = v => v === "" || /^\d[\d,]*(\.\d+)?$/.test(String(v).trim()) ? "" : "A number of naira.";
  for (let i = 1; i <= CR_PAY_LINES; i++) {
    const p = g[i - 1] || {};
    values["m" + i] = p.method || (i === 1 ? "transfer" : ""); values["a" + i] = p.amount ? String(p.amount) : ""; values["r" + i] = p.ref || "";
    fields.push({ id: "m" + i, l: i === 1 ? "How it arrived" : "…and " + (i === 2 ? "a second" : "a third") + " way", type: "chips", req: i === 1, opts: CR_PAY_METHODS },
      { id: "a" + i, l: "Amount (₦)", req: i === 1, im: "decimal", max: 12, check: money },
      { id: "r" + i, l: "Reference on the statement — or, for cash, who took it", max: 80 });
  }
  fields.push({ id: "why", l: "Your reply", type: "textarea", max: 2000, help: "The family reads this." });
  return { values, fields };
}
function crPayParts(v) {
  const out = [];
  for (let i = 1; i <= CR_PAY_LINES; i++) {
    const amount = Math.round(Number(String(v["a" + i] || "").replace(/[^\d.]/g, ""))), method = v["m" + i] || "transfer", r = String(v["r" + i] || "").trim();
    if (amount > 0) out.push({ method, amount, reference: method === "cash" ? "" : r, receivedBy: method === "cash" ? r : "" });
  }
  return out;
}
const crPayTotal = parts => parts.reduce((n, p) => n + p.amount, 0);
function crPayLabel(p) { return (p.methodLabel || (CR_PAY_METHODS.find(m => m[0] === p.method) || [0, p.method])[1]) + " " + fmtMoney(p.amount)
  + (p.reference ? " · ref " + p.reference : "") + (p.receivedBy ? " · to " + p.receivedBy : ""); }

/* ── Replies that read as replies ───────────────────────────────────────────
   A decision used to reach the family as "Your request was declined." with
   whatever one line the desk typed. Every outcome now starts from a drafted
   message in full sentences, by name, saying what happens next — the desk
   edits it, or sends it as it is. A decline picks its reason from the ones
   that actually occur for that kind, so the family is told what to do. */
function crReqFirst(x) { return String(x.fullName || "").trim().split(/\s+/)[0] || "your child"; }
function crReqDraftApprove(x, parts) {
  const f = crReqFirst(x), on = d => d ? crDate(d + "T12:00:00") : "";
  switch (x.kind) {
    case "payment": return "Thank you. We have received " + (parts && parts.length ? parts.map(p => fmtMoney(p.amount) + (p.method === "cash" ? " in cash" : p.method === "pos" ? " by POS" : " by transfer")).join(" and ") : fmtMoney(x.amount))
      + " and it is now on " + f + "’s account. The receipt is on its way to you by email.";
    case "leave": return "Approved. " + f + " is excused " + (x.toDate && x.toDate !== x.fromDate ? "from " + on(x.fromDate) + " to " + on(x.toDate) : "on " + on(x.fromDate)) + ", so " + (x.toDate && x.toDate !== x.fromDate ? "those days do" : "that day does") + " not count as an absence. We look forward to seeing " + f + " back.";
    case "academic": return "Approved, and good luck with the exams. The Saturdays from " + on(x.fromDate) + " to " + on(x.toDate) + " are not absences: nothing is fined and nothing counts against " + f + "’s allowance.";
    case "idcard": return "Approved. " + f + "’s replacement ID card will be printed and left at the " + (x.centre || "centre") + " desk. We will tell you when it is ready to collect.";
    case "appeal": return "We have looked at this again and your appeal is upheld. " + (/^fine\b/i.test(x.subject || "") ? "The fine has been taken off " + f + "’s account." : "The decision has been lifted.") + " We are sorry for the trouble, and thank you for raising it with us.";
    case "mentor": return "Approved. We will arrange the change and introduce " + f + "’s new mentor shortly.";
    case "collect": return "Done. The list of people who may collect " + f + " has been updated, and the desk will check it at pick-up.";
    default: return "Thank you — this has been done.";
  }
}
const CR_REQ_DECLINE = {
  payment: [["notfound", "Not on the statement yet", x => "We could not find this payment on our bank statement yet. Transfers can take a day to show — please send a photo of the transfer receipt, or the reference from your bank app, and we will check again."],
    ["amount", "A different amount arrived", x => "The amount that reached us is different from the " + fmtMoney(x.amount) + " in this claim. Please check your bank app and send the receipt, so we can record exactly what was paid."],
    ["duplicate", "Already recorded", x => "This payment is already on " + crReqFirst(x) + "’s account, so it has not been added a second time."]],
  leave: [["limit", "No absences left", x => "We can’t excuse this one: " + crReqFirst(x) + " has used the absences the programme allows. If it is an emergency, please call the centre and we will talk it through."],
    ["late", "Asked after the day", x => "Leave has to be asked for before the day. This absence stays on the record; if something unexpected happened, please tell us what, and we will look at it again."]],
  academic: [["proof", "Needs the school’s letter", x => "Please send the school’s letter or timetable for the exams, and we will approve it straight away."],
    ["long", "Too long in one go", x => "Academic leave covers up to ten weeks at a time. Please ask for the first part now and the rest later."]],
  appeal: [["stands", "The charge stands", x => "We have looked at the charge again and it stands: it was recorded correctly. If there is something we have not seen, please tell us and we will look again."]],
  idcard: [["photo", "Needs a new photo first", x => "Before we print a new card we need a recent photo of " + crReqFirst(x) + ". Please send one through the portal, and we will print the card as soon as it arrives."]],
};
const CR_REQ_DECLINE_ANY = [["info", "Need more information", x => "We need a little more information before we can do this. Please reply with the details, and we will take it from there."],
  ["rules", "Not possible under the rules", x => "We are sorry — this is not something the programme’s rules allow, so we cannot do it."]];
function crReqDecline(ctx, x, done) {
  const opts = (CR_REQ_DECLINE[x.kind] || []).concat(CR_REQ_DECLINE_ANY);
  const lab = x.kind === "payment" ? "Decline" : crReqActs(x)[1];
  ctx.form({ title: lab + " · " + (x.subject || x.kindLabel), submit: (lab === "Decline" ? "Decline" : lab) + " and send", busyLabel: "Sending…",
    intro: "Pick the reason; they are sent a message in full sentences saying what to do next. Add anything specific below.",
    values: { why: opts[0][0], note: "" },
    fields: [{ id: "why", l: "Why", type: "chips", req: true, opts: opts.map(o => [o[0], o[1]]).concat([["other", "Something else"]]) },
      { id: "note", l: "Add to the message", type: "textarea", max: 1500, help: "Required for “Something else”. The family reads it." }],
    onSubmit: async v => {
      const o = opts.find(z => z[0] === v.why), note = String(v.note || "").trim();
      if (!o && note.length < 10) return { fieldErrors: { note: "Say why, in a sentence or two." } };
      await NGGApi.admin.requests.decide(x.requestId, false, [o ? o[2](x) : "", note].filter(Boolean).join("\n\n"));
    },
    done: () => { setTimeout(() => done("Declined — they have been told why"), 0); return null; } });
}
function crReqMessage(ctx, x, again) {
  ctx.form({ title: "Message · " + (x.fullName || x.requestId), submit: "Send the message", busyLabel: "Sending…",
    intro: "Ask a question or say what is happening, without deciding the request. It is sent to " + (x.byFamily ? "the family" : crReqFirst(x)) + " and kept on the request, so everyone sees the same conversation.",
    values: { text: "" },
    fields: [{ id: "text", l: "Message", type: "textarea", req: true, rows: 5, max: 2000,
      ph: x.kind === "payment" ? "We can see the transfer of ₦10,000 but not the ₦2,000 cash. Who at the centre took it, and on which day?" : "What do you need to know, or what is happening next?" }],
    onSubmit: v => NGGApi.admin.requests.comment(x.requestId, v.text.trim()),
    done: (v, r) => { setTimeout(() => again(r && r.request ? Object.assign({}, x, r.request) : x), 0); return "Sent. It is on the request too."; } });
}
const CR_DETAIL_FIELDS = [["fullName", "Name"], ["dob", "Date of birth"], ["phone", "Phone"], ["email", "Email"], ["parentName", "Parent’s name"], ["parentPhone", "Parent’s phone"], ["parentEmail", "Parent’s email"], ["school", "School"]];
/** The details form, as a spec both the drawer and the Inbox open: lines read from what they wrote. */
function crReqDetailsForm(x) {
  const rd = x.reading || { changes: [] }, n = Math.max(2, Math.min(4, rd.changes.length)), values = { reply: "" }, fields = [];
  for (let i = 1; i <= n; i++) {
    const c = rd.changes[i - 1] || {};
    values["f" + i] = c.field || ""; values["v" + i] = c.field === "dob" && c.proposed ? c.proposed.split("-").reverse().join("/") : (c.proposed || "");
    fields.push({ id: "f" + i, l: i === 1 ? "Change" : "…and", type: "select", req: i === 1, ph: "Nothing", opts: CR_DETAIL_FIELDS,
        help: c.field ? "On the record now: " + (c.current || "nothing") + (c.warn ? " · " + c.warn : "") : "" },
      { id: "v" + i, l: "To", max: 120, ph: "The new value (a date as 08/06/2013)" });
  }
  fields.push({ id: "reply", l: "Add to the reply", type: "textarea", max: 1500, help: "They are told exactly what changed; add anything else here." });
  return { title: "Change " + (x.fullName || "their") + "’s details", submit: "Change and approve",
    intro: rd.changes.length ? "Read from what they wrote — check each line, then change it. Their record and the request are updated together." : "Nothing could be read as a change. Choose the field and type the new value.",
    values, fields };
}
/** Send the details form: {changes} applied and the request approved, or field errors. */
async function crReqDetailsSend(x, v) {
  const changes = {};
  for (let i = 1; i <= 4; i++) if (v["f" + i] && String(v["v" + i] || "").trim()) changes[v["f" + i]] = String(v["v" + i]).trim();
  if (!Object.keys(changes).length) return { fieldErrors: { v1: "Give the new value." } };
  try { await NGGApi.admin.requests.applyDetails(x.requestId, changes, v.reply || ""); }
  catch (e) { const c = e && e.data; if (c && c.field) { const k = Object.keys(changes).indexOf(c.field) + 1; return { fieldErrors: { ["v" + (k || 1)]: c.detail || "Not a valid value." } }; } throw e; }
  return { changed: Object.keys(changes) };
}
function crReqApplyDetails(ctx, x, done) {
  ctx.form(Object.assign(crReqDetailsForm(x), { busyLabel: "Saving…",
    onSubmit: async v => { const r = await crReqDetailsSend(x, v); if (r.fieldErrors) return r; },
    done: () => { setTimeout(() => done("Changed on the record and approved"), 0); return null; } }));
}

/* WHAT EACH BUTTON DOES, in the words of what it does. "Approve" on a fine
   appeal reads as agreeing with the fine, and it does the opposite: it
   upholds the appeal and lifts the fine. So each kind names its two outcomes,
   and a kind whose "approval" is really an answer (a question, a report) says
   so. [approve label, decline label, reply required?] */
const CR_REQ_ACTS = {
  appeal: x => /^fine\b/i.test(x.subject || "") ? ["Uphold — lift the fine", "Keep the fine", true] : ["Uphold — lift the sanction", "Keep the sanction", true],
  leave: () => ["Excuse the absence", "Refuse the leave", false],
  academic: () => ["Approve the exam leave", "Refuse the exam leave", false],
  idcard: () => ["Print a new card", "Not yet", false],
  mentor: () => ["Change the mentor", "Keep the mentor", false],
  collect: () => ["Update who can collect", "Keep the list as it is", false],
  askmentor: () => ["Answer and close", "Close without answering", true],
  help: () => ["Reply and close", "Close — nothing to do", true],
};
function crReqActs(x) { const f = CR_REQ_ACTS[x.kind]; return f ? f(x) : ["Approve", "Decline", false]; }
/* The member's OTHER open requests, read before the drawer draws. A family
   appealing a fine often says "my leave request has been pending since…" —
   and the desk could not see it from here, so it decided the appeal blind.
   Bounded: a slow list never holds the drawer for more than a moment. */
async function crReqOpen(ctx, x) {
  if (x._related === undefined && x.memberId) {
    let rel = [];
    try {
      const r = await Promise.race([NGGApi.admin.requests.list({ memberId: x.memberId, status: "open" }), new Promise(res => setTimeout(() => res(null), 1500))]);
      rel = r && r.requests ? r.requests.filter(y => y.requestId !== x.requestId) : [];
    } catch (e) { rel = []; }
    x = Object.assign({}, x, { _related: rel });
  }
  return crReqDraw(ctx, x);
}
function crReqDraw(ctx, x) {
  const st = crReqStatus(x), pay = x.kind === "payment", open = x.status === "open", det = x.kind === "details" || x.kind === "familydetails";
  const again = y => crReqDraw(ctx, Object.assign({ _related: x._related }, y || x));
  const fields = [["Request", x.requestId], ["Kind", x.kindLabel || x.kind], ["Member", (x.fullName || x.memberId) + (x.displayId ? " · " + x.displayId : "")], ["Centre", x.centre || "—"],
    ["Raised", crDate(x.createdAt, true)]];
  const note = pay && !(x.parts && x.parts.length) && crPayIsNote(x.reference);
  if (pay) {
    fields.push(["Claimed", fmtMoney(x.amount)]);
    if (x.parts && x.parts.length) x.parts.forEach((p, i) => fields.push([x.parts.length > 1 ? "Paid, part " + (i + 1) : "Paid", crPayLabel(p)]));
    else fields.push(["Reference", note ? (crPayRefs(x.reference).join(" · ") || "None given — see their note") : (x.reference || "—")]);
    fields.push(["Paid on", x.paidAt ? crDate(x.paidAt) : "—"], ["Receipt", x.proofUrl ? "Attached — open it below" : "None attached"]);
  }
  if (x.kind === "leave" || x.kind === "academic") fields.push(["From", x.fromDate ? crDate(x.fromDate) : "—"], ["To", x.toDate ? crDate(x.toDate) : "Open-ended"]);
  if (x.byFamily) fields.push(["Raised by", (x.raisedByName || "Their family") + " · from the family account"]);
  if (x.ledgerEntryId) fields.push([x.ledgerEntryId.indexOf(",") >= 0 ? "Ledger entries" : "Ledger entry", x.ledgerEntryId.split(",").join(" · ")]);
  if (x.decidedAt) fields.push(["Decided", crDate(x.decidedAt, true) + (x.decidedByName ? " · " + x.decidedByName : "")]);
  const done = msg => { ctx.closeDrawer(); ctx.toast(msg); if (ctx.reload) ctx.reload(); if (ctx.refreshCounts) ctx.refreshCounts(); };
  const rd = det ? (x.reading || { changes: [], asked: [] }) : null;

  const approvePay = () => {
    const f = crPayApproveForm(x);
    f.values.why = crReqDraftApprove(x, crPayGuess(x).map(p => ({ method: p.method, amount: +p.amount || 0 })).filter(p => p.amount));
    ctx.form({ title: "Approve · " + (x.fullName || x.requestId), submit: "Post and send", busyLabel: "Posting…",
      intro: "Post what arrived, one line per way it came — each becomes its own ledger entry with its own reference. "
        + (note || (x.parts && x.parts.length) ? "The lines are filled in from what they wrote; check each one against the statement." : "Claimed: " + fmtMoney(x.amount) + "."),
      values: f.values, fields: f.fields,
      onSubmit: async v => {
        const parts = crPayParts(v);
        if (!parts.length) return { fieldErrors: { a1: "Enter the amount that arrived." } };
        await NGGApi.admin.requests.decide(x.requestId, true, v.why || "", crPayTotal(parts), parts);
      },
      done: v => { const parts = crPayParts(v); setTimeout(() => done(fmtMoney(crPayTotal(parts)) + " posted in " + crPlural(parts.length, "entry", "entries") + " · they have been told"), 0); return null; } });
  };
  const acts = crReqActs(x);
  const approvePlain = () => ctx.form({ title: acts[0] + " · " + (x.subject || x.kindLabel), submit: acts[0].replace(/ —.*/, "") + " and send", busyLabel: "Saving…",
    intro: x.kind === "appeal" ? "Upholding the appeal overturns the decision: " + (/^fine\b/i.test(x.subject || "") ? "the fine comes off the account" : "the sanction is lifted, with any fine or re-entry fee it carried")
        + ". Say why — the family reads it. You cannot review an appeal against a decision you made yourself."
      : acts[2] ? "Write the answer; it is sent and the request is closed." : "A drafted reply — edit it, or send it as it is.",
    values: { why: crReqDraftApprove(x) },
    fields: [{ id: "why", l: x.kind === "appeal" ? "Why it is upheld" : "The reply", type: "textarea", rows: 5, max: 2000, req: acts[2], help: x.byFamily ? "The family reads this." : "The member reads this." }],
    onSubmit: v => { const t = String(v.why || "").trim(); if (acts[2] && t.length < 5) return { fieldErrors: { why: "Write a sentence or two — they read it." } }; return NGGApi.admin.requests.decide(x.requestId, true, t); },
    done: () => { setTimeout(() => done(x.kind === "appeal" ? "Appeal upheld — they have been told" : "Done — they have been told"), 0); return null; } });
  const askMissing = rd && rd.asked && rd.asked.length ? () => ctx.form({ title: "Ask for the new " + rd.asked.map(a => a.label.toLowerCase()).join(" and "), submit: "Send", busyLabel: "Sending…",
    intro: "They named what to change but not what to change it to. This asks for it on the request, without deciding it.",
    values: { text: "Thank you. To change " + rd.asked.map(a => "the " + a.label.toLowerCase() + (a.current ? " (it is " + a.current + " on the record now)" : "")).join(" and ") + ", please reply with the new " + (rd.asked.length > 1 ? "details" : rd.asked[0].label.toLowerCase()) + " and we will update it straight away." },
    fields: [{ id: "text", l: "Message", type: "textarea", rows: 4, req: true, max: 2000 }],
    onSubmit: v => NGGApi.admin.requests.comment(x.requestId, v.text.trim()),
    done: (v, r) => { setTimeout(() => again(r && r.request ? Object.assign({}, x, r.request) : x), 0); return "Asked. It is on the request too."; } }) : null;

  const actions = [];
  if (open) {
    if (det) actions.push({ l: rd.changes.length ? "Change it (" + crPlural(rd.changes.length, "field") + ")" : "Change their details", primary: true, run: () => crReqApplyDetails(ctx, x, done) });
    if (askMissing) actions.push({ l: "Ask for the new value", primary: !rd.changes.length && !det, run: askMissing });
    if (pay) actions.push(ctx.can("fees") ? { l: "Approve and post", primary: true, run: approvePay } : { l: "Approving needs the Fees permission", disabled: true });
    else if (!det) actions.push({ l: acts[0], primary: true, run: approvePlain });
    actions.push({ l: pay || det ? "Decline" : acts[1], run: () => crReqDecline(ctx, x, done) });
  }
  if (x.status !== "withdrawn" && x.memberId) actions.push({ l: "Send a message", run: () => crReqMessage(ctx, x, again) });
  if (x.proofUrl) actions.push({ l: "Open the receipt", run: () => window.open(x.proofUrl, "_blank", "noopener") });
  if (x.memberId) actions.push({ l: "Open the member’s record", primary: !open, run: () => { ctx.closeDrawer(); ctx.go("members", "members", x.memberId); } });

  ctx.drawer({
    title: x.subject || x.kindLabel, sub: x.requestId + " · " + (x.kindLabel || x.kind),
    stats: [["Status", st[0]], ["Raised", crDate(x.createdAt)], [x.status === "withdrawn" ? "Withdrawn" : "Decided", x.decidedAt ? crDate(x.decidedAt) : x.status === "withdrawn" ? crDate(x.updatedAt) : "Not yet"]],
    fields,
    sections: [
      det && (rd.changes.length || rd.asked.length) ? { h: "What they asked to change", list:
        rd.changes.map(c => ({ icon: c.warn ? "warning" : "pencil-simple", t: c.label + ": " + (c.field === "dob" ? crDate(c.proposed + "T12:00:00") : c.proposed),
          s: "On the record now: " + (c.current ? (c.field === "dob" ? crDate(c.current + "T12:00:00") : c.current) : "nothing") + (c.warn ? " · " + c.warn : "") }))
        .concat(rd.asked.map(a => ({ icon: "question", t: a.label + " — no new value given", s: "On the record now: " + (a.current || "nothing") + ". Ask them for it." }))) } : null,
      note ? { h: "What they wrote about the payment", text: x.reference } : null,
      { h: "What they wrote", text: x.body || "", empty: "Nothing beyond the subject." },
      (x._related || []).length ? { h: "Their other open requests", list: x._related.map(y => ({ icon: y.kind === "leave" || y.kind === "academic" ? "calendar-x" : "tray",
          t: (y.subject || y.kindLabel || y.kind), s: (y.kindLabel || y.kind) + " · " + y.requestId + " · raised " + crDate(y.createdAt),
          act: { l: "Open", run: () => crReqDraw(ctx, Object.assign({ _related: [x].concat(x._related.filter(z => z.requestId !== y.requestId)) }, y)) } })),
        tip: x.kind === "appeal" && open && x._related.some(y => y.kind === "leave") ? "There is leave waiting. Excusing it does not lift this fine on its own — decide both." : "" } : null,
      (x.comments || []).length ? { h: "Messages", list: x.comments.map(m => ({ icon: "chat-circle-text", t: m.text, s: m.byName + " · " + crDate(m.at, true) })) } : null,
      { h: "The reply", text: x.decision || "", empty: open ? "Not decided yet." : x.status === "withdrawn" ? "Withdrawn before anyone decided it." : "Decided without a written reply." },
    ].filter(Boolean),
    actions,
  });
}
function crReqServer(ctx) {
  return {
    sortKeys: {},
    fetch: async ({ q, filters, page, pageSize }) => {
      const r = await NGGApi.admin.requests.list({ status: filters.status || "all", kind: filters.kind || "", sort: filters.sort || "newest", q: q || "", offset: page * pageSize, pageSize });
      return { total: r.total || 0, rows: (r.requests || []).map(x => {
        const st = crReqStatus(x);
        return { key: x.requestId, open: () => crReqOpen(ctx, x), cells: [
          { k: "mono", t: x.requestId },
          { k: "person", t: x.fullName || x.memberId, s: [x.displayId || x.memberId, x.centre].filter(Boolean).join(" · ") },
          { k: "strong", t: x.subject || x.kindLabel, s: (x.kindLabel || x.kind) + (x.byFamily ? " · from their family account" : "") + (x.reference ? " · ref " + x.reference : "") },
          { k: "status", t: st[0], tone: st[1] },
          { k: "text", t: crDate(x.createdAt) },
          { k: "text", t: x.decidedAt ? crDate(x.decidedAt) : x.status === "withdrawn" ? crDate(x.updatedAt) : "—", s: x.decidedByName || "" },
        ] };
      }) };
    },
  };
}

Object.assign(CR_TAB_DEFS, {
  "request-log": {
    skeleton: ["table"],
    load: async ctx => {
      const r = await NGGApi.admin.requests.list({ status: "all", pageSize: 1 });
      return { kinds: r.kinds || {}, statuses: r.statuses || Object.keys(CR_REQ_STATUS), open: r.openByKind || {}, total: r.total || 0, server: crReqServer(ctx) };
    },
    blocks: (d, ctx) => {
      const waiting = Object.keys(d.open).reduce((n, k) => n + d.open[k], 0);
      return [
        waiting ? { type: "note", span: 6, icon: "tray", text: crPlural(waiting, "request") + " still waiting for a decision.", sub: "Open one to decide it here — the reply is drafted for you — or work through them in the Inbox.", act: { l: "Open the Inbox", run: () => ctx.go("inbox", "requests") } } : null,
        { type: "table", span: 6, title: "Every request", sub: crPlural(d.total, "request") + " raised", nosel: true, server: d.server, q: ctx.sub || "",
          search: "Request ID, member, reference or subject",
          cols: ["Request", "Member", { l: "What", wrap: true }, "Status", "Raised", "Decided"],
          filters: [
            { id: "status", l: "Status", opts: d.statuses.map(s => ({ v: s, l: crReqStatus({ status: s })[0] })) },
            { id: "kind", l: "Kind", opts: Object.keys(d.kinds).map(k => ({ v: k, l: d.kinds[k] })) },
            { id: "sort", l: "Sort", opts: CR_REQ_SORTS.map(o => ({ v: o[0], l: o[1] })) },
          ],
          emptyText: "No request matches. A request ID looks like REQ-9EE53F1611; a search also matches the member, their ID, the subject and a payment reference." },
      ].filter(Boolean);
    },
  },
  quality: crPanel(() => <AdminMembers/>, { tab: "quality" }),   // v1's Data quality and Duplicates, and the rest of its member desk
  idcards: crPanel(() => <AdminIdCards/>),
});
/* ── Centres, native ──────────────────────────────────────────────────────────
   Was AdminCentres (page-admin.jsx) mounted whole: a seven-column table whose
   Edit, Map and Summer venue each opened a wide editor INSIDE a table row —
   unusable on a phone, and the old UI beside the new one. Now the Control Room's
   own pieces, so the phone version is the table block's list, the drawer is a
   sheet, and Edit is a form sheet:

     list   → one row per centre (search, filter by programme / map / page)
     open   → the centre's record, with Edit · Map · Summer venue · Remove
     Edit   → every field the old editor had, grouped the same way
     Map    → /control/members/centres/<id>/map — the GPS and geo-fence widget,
              which is a real map editor no block can express (CONTRACT: custom)

   Behaviour kept exactly: the same API calls, the same refusals and their words,
   and the remove flow — the server refuses a centre in use and says what points
   at it, and RETIRE is offered first because it keeps every record resolving.
   Gated on `people` (CLAUDE.md §4: a centre's code is a printed ID prefix). */

function crCeProgs(c) { return typeof centreProgrammes === "function" ? centreProgrammes(c) : String(c.programmes || "ngg").split(","); }
function crCeProgLabel(c) { const p = crCeProgs(c); return p.length === 2 ? "NGG + Summer" : p[0] === "ngg" ? "NGG Club" : "Summer School"; }
function crCeMapLabel(c) { return c.lat == null ? "Not mapped" : c.geofence ? "Fence on · " + (c.radiusM || 150) + " m" : "Mapped · fence off"; }
function crCeSummer(c) {
  const n = c.summerEnrolled || 0;
  return (c.capacity || 0) > 0 ? n + " / " + c.capacity + (c.full ? " · full" : "") : n + " / no limit";
}
function crCeDone() {
  if (typeof invalidateCentreOptCache === "function") invalidateCentreOptCache();
  window.dispatchEvent(new Event("ngg:centres-changed"));
}

function crCeOpen(ctx, c) {
  const d = ctx.data || {}, can = d.canWrite;
  const progs = crCeProgs(c);
  ctx.drawer({
    title: c.name, sub: [c.code, c.area, crCeProgLabel(c)].filter(Boolean).join(" · "),
    stats: [["NGG members", crNum(c.members || 0)], ["Summer School", crCeSummer(c)], ["Groups", crNum(c.groups || 0)]],
    fields: [
      ["Status", c.status === "retired" ? "Retired — kept so records resolve, not offered" : c.status === "archived" ? "Archived" : "Active"],
      ["Code", c.code], ["Card colour", c.color],
      ["Area", c.area], ["Address", c.address],
      progs.indexOf("ngg") !== -1 ? ["NGG lead", c.leadName || "None"] : null,
      progs.indexOf("summer") !== -1 ? ["Summer School lead", c.summerLeadName || "None"] : null,
      ["Phone", c.phone], ["Email", c.email],
      ["Meets", [c.meetDays, c.meetTime].filter(Boolean).join(", ")],
      ["Map", crCeMapLabel(c)],
      ["Public page", c.pageStatus === "published" ? "Live at /centres/" + (c.slug || "") : "Draft — hidden"],
    ].filter(Boolean),
    sections: [
      c.summerWaitlisted ? { h: "Summer School", text: c.summerWaitlisted + " waitlisted." } : null,
      c.notes ? { h: "Notes", text: c.notes } : null,
    ].filter(Boolean),
    actions: can ? [
      { l: "Edit", primary: true, run: () => crCeEdit(ctx, c) },
      { l: "Map and geo-fence", run: () => { ctx.closeDrawer(); ctx.setSub(c.centreId + "/map"); } },
      progs.indexOf("summer") !== -1 ? { l: c.summerLat != null || c.summerAddress ? "Summer venue (set)" : "Summer venue", run: () => { ctx.closeDrawer(); ctx.setSub(c.centreId + "/summer"); } } : null,
      c.pageStatus === "published" ? { l: "Open the public page", run: () => window.open("/centres/" + (c.slug || ""), "_blank", "noopener") } : null,
      { l: "Remove", run: () => crCeRemove(ctx, c) },
    ].filter(Boolean) : [],
  });
}

function crCeEdit(ctx, c) {
  const d = ctx.data || {};
  const here = (d.leadOptions || []).filter(o => o.centre === c.name), rest = (d.leadOptions || []).filter(o => o.centre !== c.name);
  const leads = here.concat(rest).map(o => [o.volunteerId, o.name + (o.role ? " · " + o.role : "") + (o.centre && o.centre !== c.name ? " (" + o.centre + ")" : "")]);
  const has = (v, k) => (v.programmes || []).indexOf(k) !== -1;
  ctx.closeDrawer();
  ctx.form({
    title: "Edit " + c.name, submit: "Save centre", busyLabel: "Saving…",
    intro: "The code is the printed ID prefix and the colour is the card’s accent band, so change them only before cards are printed.",
    values: {
      name: c.name || "", code: c.code || "", color: c.color || "#76B043", status: c.status === "archived" ? "archived" : "active",
      programmes: crCeProgs(c), capacity: c.capacity ? String(c.capacity) : "",
      area: c.area || "", address: c.address || "", leadVolunteerId: c.leadVolunteerId || "", summerLeadVolunteerId: c.summerLeadVolunteerId || "",
      phone: c.phone || "", email: c.email || "", meetDays: c.meetDays || "", meetTime: c.meetTime || "", whatsappUrl: c.whatsappUrl || "", notes: c.notes || "",
      pageStatus: c.pageStatus || "draft", slug: c.slug || "", tagline: c.tagline || "", headline: c.headline || "",
      heroImageUrl: c.heroImageUrl || "", heroImageMobileUrl: c.heroImageMobileUrl || "", heroPosition: c.heroPosition || "center bottom",
      story: c.story || "", gallery: (Array.isArray(c.gallery) ? c.gallery : []).join("\n"),
    },
    fields: [
      { id: "name", l: "Centre name", req: true, max: 80, check: v => String(v).trim().length >= 2 ? "" : "At least 2 characters." },
      { id: "code", l: "Code (1–4 letters)", req: true, max: 4, check: v => /^[A-Za-z]{1,4}$/.test(String(v).trim()) ? "" : "One to four letters." },
      { id: "color", l: "Card colour", type: "color" },
      { id: "status", l: "Status", type: "chips", req: true, opts: [["active", "Active"], ["archived", "Archived"]] },
      { id: "programmes", l: "Programmes at this centre", type: "multi", req: true, opts: [["ngg", "The NGG Club"], ["summer", "Summer School"]],
        check: v => (v || []).length ? "" : "Tick the NGG Club, Summer School, or both." },
      { id: "capacity", l: "Summer School capacity", im: "numeric", ph: "0 for no limit", when: v => has(v, "summer"), check: v => v === "" || /^\d+$/.test(String(v)) ? "" : "A whole number." },
      { id: "area", l: "Area or city", max: 120, ph: "e.g. Alimosho · Lagos" },
      { id: "address", l: "Street address", max: 240, ph: "Building, street, landmark" },
      { id: "leadVolunteerId", l: "NGG centre lead", type: "select", opts: leads, ph: "None", when: v => has(v, "ngg") },
      { id: "summerLeadVolunteerId", l: "Summer School lead", type: "select", opts: leads, ph: "None", when: v => has(v, "summer") },
      { id: "phone", l: "Phone", type: "tel", max: 40, ph: "+234 …" },
      { id: "email", l: "Email", type: "email", email: true, max: 160 },
      { id: "meetDays", l: "Meeting days", max: 120, ph: "e.g. Saturdays" },
      { id: "meetTime", l: "Meeting time", max: 60, ph: "e.g. 09:00 – 13:00" },
      { id: "whatsappUrl", l: "Group or join link", max: 240, ph: "chat.whatsapp.com/… · wa.me/… · forms.gle/…",
        help: "Shown to an applicant right after they apply, matched to the centre they picked." },
      { id: "notes", l: "Staff notes", type: "textarea", rows: 3 },
      { id: "pageStatus", l: "Public page", type: "chips", req: true, opts: [["draft", "Draft — hidden"], ["published", "Published — live"]],
        help: "The centre’s page at /centres/<slug>: a hero image, a tagline and a story." },
      { id: "slug", l: "Page address (slug)", max: 64, ph: "made from the name if left empty", when: v => v.pageStatus === "published" || !!v.slug },
      { id: "tagline", l: "Tagline", max: 200, when: v => v.pageStatus === "published" },
      { id: "headline", l: "Headline", max: 200, when: v => v.pageStatus === "published" },
      { id: "heroImageUrl", l: "Hero image link", max: 400, ph: "https://", when: v => v.pageStatus === "published" },
      { id: "heroFile", l: "…or upload the hero image", type: "file", accept: "image/*", when: v => v.pageStatus === "published" },
      { id: "heroImageMobileUrl", l: "Hero image for phones (optional)", max: 400, ph: "https://", when: v => v.pageStatus === "published" },
      { id: "heroPosition", l: "Hero focal point", type: "select", req: true, when: v => v.pageStatus === "published",
        opts: [["center bottom", "Bottom · centre"], ["center center", "Centre"], ["center top", "Top · centre"], ["left bottom", "Bottom · left"], ["right bottom", "Bottom · right"]] },
      { id: "story", l: "Story", type: "textarea", rows: 6, when: v => v.pageStatus === "published" },
      { id: "gallery", l: "Gallery image links (one per line)", type: "textarea", rows: 3, when: v => v.pageStatus === "published" },
    ],
    onSubmit: async v => {
      let hero = String(v.heroImageUrl || "").trim();
      if (v.heroFile && typeof v.heroFile !== "string") { const r = await NGGApi.uploadOrInline(v.heroFile, "cover"); if (r && r.url) hero = r.url; }
      try {
        await NGGApi.admin.registration.centreUpsert({
          centreId: c.centreId, name: v.name.trim(), code: v.code.trim().toUpperCase(), color: v.color, status: v.status,
          capacity: v.capacity === "" ? 0 : parseInt(v.capacity, 10) || 0,
          address: v.address, area: v.area, leadVolunteerId: v.leadVolunteerId || "", summerLeadVolunteerId: v.summerLeadVolunteerId || "",
          phone: v.phone, email: v.email, meetDays: v.meetDays, meetTime: v.meetTime, notes: v.notes, whatsappUrl: String(v.whatsappUrl || "").trim(),
          slug: String(v.slug || "").trim(), pageStatus: v.pageStatus, tagline: v.tagline, headline: v.headline,
          heroImageUrl: hero, heroImageMobileUrl: String(v.heroImageMobileUrl || "").trim(), heroPosition: v.heroPosition,
          story: v.story, gallery: String(v.gallery || "").split("\n").map(s => s.trim()).filter(Boolean), programmes: v.programmes,
        });
      } catch (e) {
        const F = { code_taken: ["code", "That code is already used."], code_reserved: ["code", e.detail || "That code is reserved."],
          programme_required: ["programmes", "Tick the NGG Club, Summer School, or both."], bad_email: ["email", "That email address isn’t valid."],
          bad_whatsapp: ["whatsappUrl", "The link must start with https://"], bad_lead: ["leadVolunteerId", "Pick a current volunteer as lead."],
          bad_color: ["color", "Pick a valid colour."], bad_image: ["heroImageUrl", "Image links must start with https://"] }[e.code];
        if (F) return { fieldErrors: { [F[0]]: F[1] } };
        throw e;
      }
      crCeDone(); ctx.reload();
    },
    done: v => v.name.trim() + " saved.",
  });
}

async function crCeRemove(ctx, c) {
  ctx.closeDrawer();
  if (!(await ctx.confirm({ title: "Remove " + c.name + "?", body: "Members already posted here keep the centre on their record, and cards already printed keep this code and colour.", cta: "Remove", danger: true }))) return;
  try {
    await NGGApi.admin.registration.centreDelete(c.centreId);
    crCeDone(); ctx.toast(c.name + " removed."); ctx.reload();
  } catch (e) {
    if ((e.code || e.message) !== "centre_in_use") { ctx.toast(crErr(e, "Couldn’t remove the centre."), null, true); return; }
    const u = (e.data && e.data.uses) || {}, parts = [];
    if (u.members) parts.push(crPlural(u.members, "NGG member"));
    if (u.participants) parts.push(crPlural(u.participants, "Summer School participant"));
    if (u.summerGroups) parts.push(crPlural(u.summerGroups, "group"));
    if (u.volunteers) parts.push(crPlural(u.volunteers, "volunteer"));
    const retire = await ctx.confirm({
      title: "Still in use by " + (parts.join(", ") || "other records"),
      body: "Retiring is almost certainly what you want: the centre stops being offered anywhere, and every record that names it still resolves. Deleting it outright leaves those records pointing at a centre that doesn’t exist.",
      cta: "Retire it", cancel: "Delete anyway", danger: false,
    });
    try {
      await NGGApi.admin.registration.centreDelete(c.centreId, retire ? { retire: true } : { force: true });
      crCeDone(); ctx.toast(retire ? c.name + " retired — no longer offered, records intact." : c.name + " deleted."); ctx.reload();
    } catch (e2) { ctx.toast(crErr(e2, "Couldn’t remove the centre."), null, true); }
  }
}

/* The map and the Summer venue are real editors (GPS capture, a radius, an address
   search), kept as they are and given the page to themselves — not squeezed into a
   table row. `.cr-panel` draws them in the Control Room's design system. */
function CrCeSubEditor({ ctx, c, which }) {
  const back = () => ctx.setSub("");
  const saved = () => { crCeDone(); ctx.setSub(""); ctx.reload(); };
  return (
    <div className="cr-ce-sub">
      <button type="button" className="cr-btn is-sm" onClick={back}><CrIcon n="arrow-left"/>All centres</button>
      <h2 className="cr-ce-h">{c.name} · {which === "map" ? "Map and geo-fence" : "Summer School venue"}</h2>
      <div className="cr-panel admin-main">
        {which === "map" ? <CentreGeoEditor c={c} onSaved={saved}/> : <SummerVenueEditor c={c} onSaved={saved}/>}
      </div>
    </div>
  );
}

Object.assign(CR_TAB_DEFS, {
  centres: {
    skeleton: ["table"],
    load: async () => {
      const r = await NGGApi.admin.registration.centres();
      return { centres: r.centres || [], leadOptions: r.leadOptions || [], canWrite: r.canWrite !== false, cacentre: !!r.cacentre, cac: r.cacentre || null };
    },
    /* Once CACENTRE's locations list has arrived, centres are added there, not
       here (domain/cac-locations.php): no button the server would refuse. */
    actions: (d, ctx) => { crMbCentreCtx.current = ctx; return d && d.canWrite && !d.cacentre && ctx.can("people") ? [{ l: "Add a centre", icon: "plus", primary: true, run: crMbCentreAdd }] : []; },
    blocks: (d, ctx) => {
      const [id, sub] = String(ctx.sub || "").split("/");
      const c = id && d.centres.find(x => x.centreId === id);
      if (c && (sub === "map" || sub === "summer") && d.canWrite) return [{ type: "custom", span: 6, render: c2 => <CrCeSubEditor ctx={c2 || ctx} c={c} which={sub}/> }];
      const out = [];
      if (!d.canWrite) out.push({ type: "note", span: 6, icon: "lock-simple", text: "You can see the directory but not change it.", sub: "A centre’s code and colour are printed on member ID cards, so changing one needs the member-desk (people) permission." });
      /* The old directory said where centres are added once CACENTRE runs the list; moving to this screen
         dropped the sentence and kept only the missing button, so an admin was left looking for "Add a
         centre" with nothing to say it lives in CACENTRE now. */
      if (d.cacentre) out.push({ type: "note", span: 6, icon: "info", cls: "centres-cac-note", text: "Centres come from CACENTRE.",
        sub: "Its locations list is the only list of places: a location added, renamed or taken off in CACENTRE → Attendance → Desks and settings → Locations is added, renamed (with every record that names it) or retired here within minutes. The code, colour, address, lead and page are still set here."
          + (d.cac && d.cac.at ? " Last update from CACENTRE: " + fmtDateTime(d.cac.at) + "." : "") });
      const unmappedList = d.centres.filter(x => x.lat == null && x.status !== "retired"), unmapped = unmappedList.length;
      if (unmapped && d.canWrite) out.push({ type: "note", span: 6, icon: "map-pin", tone: "warn", text: crPlural(unmapped, "centre") + " not mapped yet.",
        act: { l: "Map " + unmappedList[0].name, run: () => ctx.setSub(unmappedList[0].centreId + "/map") }, sub: "Without a map the check-in desk cannot confirm someone is at the centre. Open one and choose Map and geo-fence." });
      out.push({
        type: "table", span: 6, nosel: true, title: "Centres", sub: crPlural(d.centres.length, "centre"),
        search: "Name, code, area or address",
        cols: ["Centre", "Area", "Runs", "Lead", "#NGG members", "Summer School", "Map", "Page", "Status"],
        filters: ["Runs", "Map", "Page", "Status"],
        sortInit: null,
        emptyText: "No centres yet. A centre is a place NGG meets; its code becomes the prefix on every member card printed there, so pick it carefully.",
        rows: d.centres.map(c2 => ({
          key: c2.centreId,
          cells: [
            { k: "strong", t: c2.name, s: c2.code + (d.cacentre ? (c2.cacLocationId ? " · From CACENTRE" : " · Not a CACENTRE location") : "") },
            { k: "text", t: c2.area || "—", s: c2.address || "" },
            { k: "text", t: crCeProgLabel(c2) },
            { k: "text", t: [crCeProgs(c2).indexOf("ngg") !== -1 ? (c2.leadName || "No NGG lead") : null, crCeProgs(c2).indexOf("summer") !== -1 ? (c2.summerLeadName ? "Summer · " + c2.summerLeadName : "No Summer lead") : null].filter(Boolean).join(" · ") },
            { k: "num", t: crNum(c2.members || 0), v: c2.members || 0 },
            { k: "text", t: crCeSummer(c2), s: c2.summerWaitlisted ? c2.summerWaitlisted + " waitlisted" : "" },
            { k: "text", t: crCeMapLabel(c2) },
            { k: "text", t: c2.pageStatus === "published" ? "Live" : "Draft" },
            { k: "status", t: c2.status === "retired" ? "Retired" : c2.status === "archived" ? "Archived" : "Active", tone: c2.status === "retired" || c2.status === "archived" ? "neutral" : "ok" },
          ],
          open: () => crCeOpen(ctx, c2),
        })),
      });
      return out;
    },
  },
});

/* ── Family accounts, native ─────────────────────────────────────────────────
   Was AdminFamilies mounted whole. Same op (admin.families list / decide), same
   rules: approving connects a parent to a child's attendance, conduct, fees and
   lessons, so it is confirmed with the count read first; refusing and
   disconnecting need a reason, because the parent is emailed it. Per-row verdicts
   are reported (FAMILY_REFUSALS), never a bare "done". The status is a filter on
   the server's own list, so the counts come from the server. */
const CR_FAM_STATUS = [["pending", "Waiting"], ["active", "Connected"], ["refused", "Refused"], ["revoked", "Disconnected"], ["removed", "Left by the parent"]];

async function crFamDecide(ctx, action, ids, note) {
  const r = await NGGApi.admin.families.decide(action, ids, note || "");
  const refused = (r.results || []).filter(x => !x.ok);
  const why = refused.map(x => (typeof FAMILY_REFUSALS !== "undefined" && FAMILY_REFUSALS[x.error]) || x.error).join(", ");
  if (refused.length && r.done) ctx.toast(r.done + " of " + ids.length + " done · " + refused.length + " refused (" + why + ").", null, true);
  else if (refused.length) ctx.toast("Nothing changed — " + why + ".", null, true);
  else ctx.toast(crPlural(r.done || 0, "connection") + " " + (action === "approve" ? "approved" : action === "refuse" ? "refused" : "disconnected") + "." + (action === "approve" ? "" : " The parent" + (r.done === 1 ? " has" : "s have") + " been emailed."));
  ctx.reload();   // the counts and the list both move: load() stamps a new rev, which refetches the table
  return r;
}
function crFamReason(ctx, action, ids) {
  return new Promise(res => ctx.form({
    title: (action === "refuse" ? "Refuse " : "Disconnect ") + crPlural(ids.length, "connection"),
    intro: action === "refuse" ? "The parent is emailed this reason, and can try again with the child’s own code." : "This takes effect at once: the parent stops seeing the child. They are emailed this reason.",
    submit: action === "refuse" ? "Refuse" : "Disconnect", busyLabel: "Sending…",
    values: { note: "" },
    fields: [{ id: "note", l: "Your reason — the parent reads this", type: "textarea", rows: 4, req: true, max: 500 }],
    onSubmit: async v => { const r = await crFamDecide(ctx, action, ids, v.note.trim()); res(r); return r; },
    done: () => null,
  }));
}

function crFamServer(status) {
  return { fetch: async ({ q, page, pageSize }) => {
    const r = await NGGApi.admin.families.list({ status: status, q });
    const all = r.rows || [];
    return { total: all.length, rows: all.slice(page * pageSize, page * pageSize + pageSize).map(x => ({
      key: x.linkId,
      cells: [
        { k: "person", t: x.fullName, s: [x.displayId || x.memberId, x.centre].filter(Boolean).join(" · ") },
        { k: "text", t: (x.guardianName || "—") + (x.relationshipLabel ? " (" + x.relationshipLabel + ")" : ""), s: [x.guardianEmail, x.guardianPhone].filter(Boolean).join(" · ") },
        { k: "text", t: x.recordParentName || "—", s: x.recordParentEmail || "" },
        { k: "text", t: x.via === "code" ? "Child’s code" : "Record email", s: x.note || "" },
        { k: "text", t: crDate(x.decidedAt || x.createdAt) },
      ],
    })) };
  } };
}
Object.assign(CR_TAB_DEFS, {
  families: {
    skeleton: ["table"],
    load: async () => {
      const r = await NGGApi.admin.families.list({ status: "pending", q: "" });
      /* One server object per status, made once here: a table re-fetches whenever its
         `server` changes identity, so one built inside blocks() — which runs on every
         render — fetched for ever and never left its skeleton. */
      const servers = {};
      CR_FAM_STATUS.forEach(([st]) => { servers[st] = crFamServer(st); });
      return { counts: r.counts || {}, scoped: !!r.scoped, rev: Date.now(), servers };
    },
    blocks: (d, ctx) => {
      const status = (ctx.sub || "pending");
      const known = CR_FAM_STATUS.some(s => s[0] === status) ? status : "pending";
      const bulk = known === "pending" ? [
        { l: "Approve", max: 200, run: async keys => {
            if (!(await ctx.confirm({ title: "Connect " + crPlural(keys.length, "family", "families") + "?", body: "Each parent will see their child’s attendance, conduct, fees and lessons, and the child is told. Only approve when you know this is the parent or guardian.", cta: "Approve" }))) return false;
            return crFamDecide(ctx, "approve", keys);
          } },
        { l: "Refuse", max: 200, run: keys => crFamReason(ctx, "refuse", keys) },
      ] : known === "active" ? [
        { l: "Disconnect", max: 200, run: keys => crFamReason(ctx, "revoke", keys) },
      ] : [];
      return [
        { type: "note", span: 6, icon: "users-three", text: "Parents follow their children from their own family account at /family.",
          sub: "A child’s code connects at once. A match on the parent email in the record waits here until someone confirms it." + (d.scoped ? " You see your centres only." : "") },
        { type: "custom", span: 6, render: (c, phone) => (
          <div className={phone ? "cr-pchips" : "cr-wrap"} role="group" aria-label="Show connections that are">
            {CR_FAM_STATUS.map(([k, l]) => (
              <button key={k} type="button" className="cr-chip" aria-pressed={known === k} onClick={() => ctx.setSub(k === "pending" ? "" : k)}>
                {l}{d.counts[k] ? " · " + crNum(d.counts[k]) : ""}
              </button>
            ))}
          </div>
        ) },
        { type: "table", span: 6, key: "fam-" + known, nosel: !bulk.length, bulk, reloadKey: d.rev,
          search: "Member, parent name or email",
          cols: ["Member", { l: "Parent or guardian", wrap: true }, { l: "On the record", wrap: true }, "How", "When"],
          server: d.servers[known],
          emptyText: known === "pending" ? "Nobody is waiting to connect." : "No connections here." },
      ];
    },
  },
});

/* ── Member accounts, native ─────────────────────────────────────────────────
   Was AdminAccounts mounted whole. Same op (admin.accounts overview / unlock) and
   the same position, stated where the operator reads it: ending a membership is
   not done here. Each signal the server raises is one attention row; opening it
   lists the people in a drawer, where a lock can be lifted one person at a time
   (deliberately not in bulk: lifting a lock is a judgement about one account). */
/* What each signal's row does, by signal id (member_accounts_overview in
   domain/member-self.php). A row goes where the gap is closed: a lock is lifted
   from the list of who is locked; a missing email is added on the roster,
   opened on exactly those members; a staff account's second factor is the
   sign-in security desk. Never-signed-in and suspended have no fix on this
   screen — there is no welcome resend op, and suspension is a decision made on
   the roster or the compliance board — so they say "See who" and open the list. */
const CR_ACCT_ACT = {
  locked: () => ({ act: "Lift locks", age: 4 }),
  staffNo2fa: ctx => ({ act: "Require 2FA", age: 3, onClick: () => ctx.go("members", "security") }),
  noWayIn: ctx => ({ act: "Add emails", age: 2, onClick: () => { crMbPending.seg = "no_email"; ctx.go("members", "members"); } }),
  neverSignedIn: () => ({ act: "See who", age: 1 }),
  suspended: () => ({ act: "See who", age: 0 }),
};
function crAcctOpen(ctx, sig) {
  ctx.drawer({
    title: sig.label, sub: crPlural(sig.count, "account"),
    fields: [], stats: [],
    sections: [
      { h: "Why it matters", text: sig.why },
      { h: "Who", list: sig.members.map(m => ({
          t: m.fullName || "—",
          s: [m.displayId, m.centre].filter(Boolean).join(" · ") || m.memberId,
          m: sig.id === "locked" ? "" : (m.email || "no email"),
          act: sig.id === "locked" ? { l: "Lift the lock", run: async () => {
            try { await NGGApi.admin.accounts.unlock(m.memberId); ctx.toast((m.fullName || "They") + " can sign in again."); ctx.closeDrawer(); ctx.reload(); }
            catch (e) { ctx.toast(crErr(e, "The lock was not lifted."), null, true); }
          } } : null,
        })), empty: "Nobody." },
      sig.count > sig.members.length ? { h: "", text: "…and " + crNum(sig.count - sig.members.length) + " more. The roster holds them all." } : null,
    ].filter(Boolean),
    actions: [],
  });
}

Object.assign(CR_TAB_DEFS, {
  accounts: {
    skeleton: ["kpis", "queue"],
    load: async () => NGGApi.admin.accounts.overview(),
    actions: (d, ctx) => [{ l: "Refresh", icon: "arrow-clockwise", run: () => ctx.reload() }],
    blocks: (d, ctx) => {
      const sig = (d.signals || []).filter(s => s.count > 0);
      return [
        { type: "kpis", span: 6, items: [
          { l: "Active accounts", v: crNum(d.totals && d.totals.active) },
          { l: "Erased", v: crNum(d.totals && d.totals.closed) },
          { l: "Need a look", v: crNum(sig.reduce((n, s) => n + s.count, 0)) },
        ] },
        { type: "note", span: 6, icon: "info", text: "Whether somebody can get in, which the roster assumes and never checks.",
          sub: "Ending a membership is not done here: it is settled by the agreement between NGG and the family, and no button on this screen or a member’s own dashboard closes an account." },
        { type: "attention", span: 6, title: "What needs a look",
          empty: "Nobody is locked out, everybody has an email to sign in with, and every staff account has a second factor. Nothing to do.",
          rows: sig.map(s => Object.assign({ n: s.count, l: s.label, s: s.why, tone: s.id === "locked" || s.id === "staffNo2fa" ? "bad" : "warn", onClick: () => crAcctOpen(ctx, s) }, CR_ACCT_ACT[s.id] ? CR_ACCT_ACT[s.id](ctx, s) : { act: "See who" })) },
      ];
    },
  },
});

/* ── Courses (members/courses) ─────────────────────────────────────────────
   A child's courses are a stored fact (domain/course-placement.php). The
   record PROPOSES them; staff confirm or choose here; lessons, channels, the
   timetable and every class list read the result. Unconfirmed, the child
   sees the proposal marked "not confirmed yet". */
const CR_CP_STATUS = [["flagged", "Needs a look"], ["unplaced", "Proposed"], ["none", "No courses"], ["placed", "Placed"], ["all", "Everyone"]];
const CR_CP_TONE = { placed: ["Placed", "ok"], unplaced: ["Proposed", "warn"], none: ["No courses", "bad"] };
function crCpWhy(r) {
  if (r.flag === "other_division") return "Their card also names " + (r.dropped || []).slice(0, 3).join(", ") + ((r.dropped || []).length > 3 ? "…" : "") + ", another division. Add it only if they really take both."
    + ((r.courses || []).length > 3 ? " The proposal is a whole division: keep only the courses they take." : "");
  if (r.flag === "division_only") return "Only their division is known (“" + (r.track || "their record") + "”), so they take its shared foundation course. Choose the course they take.";
  if (r.flag === "several") return "Their card names more than one course; they take " + ((r.courses || [])[0] || "the first") + " for now. Also named: " + (r.alternatives || []).slice(0, 3).join(", ") + ". Confirm the one they take.";
  if (r.flag === "whole_division") return "A whole division was proposed from “" + (r.track || "their record") + "”. Keep only the courses they take.";
  if (r.flag === "no_match") return "Nothing on their record names a course. Choose theirs.";
  if (r.status === "unplaced" && r.from === "division_major") return "Only their division is known (“" + (r.track || "their record") + "”), so they start on its major, " + ((r.courses || [])[0] || "its main course") + ". Confirm it, or choose the course they take.";
  if (r.status === "unplaced") return "From their " + (r.from === "interests" ? "interests" : r.from === "division" ? "division" : "track") + ".";
  return r.confirmedAt ? "Placed " + crDate(r.confirmedAt) + "." : "Chosen on their record.";
}
const crCpAll = d => (d.catalogue || []).reduce((a, x) => a.concat(x.courses.filter(c => a.indexOf(c) < 0)), []);
function crCpOpts(d) { return (d.catalogue || []).reduce((a, x) => a.concat(x.courses.filter(c => !a.some(o => o[0] === c)).map(c => [c, c + " · " + x.division])), []); }
async function crCpRun(ctx, action, keys, extra, verb) {
  const r = await NGGApi.admin.courses.set(action, keys, extra);
  const s = crBulkSummary(r, verb);
  ctx.toast(s.text, null, s.bad);
  ctx.reload();   // the counts above the table move too
  return r;
}
function crCpConfirm(ctx, keys) {
  return ctx.confirm({ title: "Confirm " + crPlural(keys.length, "placement") + "?", body: "Their proposed courses become their courses. Lessons, channels, the timetable and class lists follow at once.", cta: "Confirm " + crPlural(keys.length, "placement") })
    .then(ok => ok ? crCpRun(ctx, "confirm", keys, {}, "placed") : false);
}
function crCpForm(ctx, mode, keys, initial) {
  const d = ctx.data || {}, n = keys.length;
  const multi = mode === "set";
  ctx.form({
    title: (mode === "add" ? "Add a course" : mode === "remove" ? "Remove a course" : "Set courses") + " · " + crPlural(n, "child", "children"),
    submit: multi ? "Save courses" : mode === "add" ? "Add" : "Remove", busyLabel: "Saving…",
    intro: multi ? "Exactly these courses. A child in two divisions is placed in both on purpose here." : "Applies to the " + crPlural(n, "child", "children") + " selected now; the rest of their courses stay.",
    values: multi ? { courses: initial || [] } : { course: "" },
    fields: [multi ? { id: "courses", l: "Courses", type: "multi", req: true, opts: crCpOpts(d) } : { id: "course", l: "Course", type: "select", req: true, opts: crCpOpts(d) }],
    onSubmit: v => crCpRun(ctx, mode, keys, multi ? { courses: v.courses } : { course: v.course }, mode === "remove" ? "updated" : "placed"),
    done: null,
  });
}
function crCpOpen(ctx, r) {
  const st = CR_CP_TONE[r.status] || ["—", "neutral"];
  ctx.drawer({
    title: r.fullName, sub: (r.displayId || r.memberId) + " · " + (r.centre || "No centre"),
    stats: [["Placement", st[0]], ["Courses", String((r.courses || []).length)]],
    fields: [["Track", r.track || "—"], ["Interests on their card", r.interests || "—"], ["Courses", (r.courses || []).join(", ") || "None"]],
    sections: [{ h: "Why", text: crCpWhy(r) }],
    actions: [
      r.status !== "placed" && (r.courses || []).length ? { l: "Confirm these courses", primary: true, run: () => { ctx.closeDrawer(); crCpConfirm(ctx, [r.memberId]); } } : null,
      { l: "Change courses", primary: r.status === "placed" || !(r.courses || []).length, run: () => { ctx.closeDrawer(); crCpForm(ctx, "set", [r.memberId], r.courses || []); } },
      { l: "Open their record", run: () => { ctx.closeDrawer(); ctx.go("members", "members", r.memberId); } },
    ].filter(Boolean),
  });
}
/* The table's server is made once per load; it reads the LIVE tab context
   (reload, drawer, form) through this ref, as the roster does. */
const crCpCtx = { current: null };
function crCpServer() {
  return {
    sortKeys: {},
    fetch: async ({ q, filters, page, pageSize }) => {
      const r = await NGGApi.admin.courses.placement({ status: filters.status || "all", q: q || "", page, pageSize });
      return { total: r.total || 0, rows: (r.rows || []).map(x => {
        const st = CR_CP_TONE[x.status] || ["—", "neutral"];
        return { key: x.memberId, open: () => crCpOpen(crCpCtx.current, x), cells: [
          { k: "person", t: x.fullName, s: [x.displayId || x.memberId, x.centre].filter(Boolean).join(" · ") },
          { k: "text", t: x.track || "—", s: x.interests ? "Interests: " + x.interests : "" },
          { k: "text", t: (x.courses || []).join(", ") || "None" },
          { k: "text", t: crCpWhy(x) },
          { k: "status", t: st[0], tone: x.flag && x.status !== "placed" ? "bad" : st[1] },
        ] };
      }) };
    },
  };
}
Object.assign(CR_TAB_DEFS, {
  courses: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const r = await NGGApi.admin.courses.placement({ status: "flagged", pageSize: 1 });
      return { counts: r.counts || {}, catalogue: r.catalogue || [], max: r.max || 500, server: crCpServer() };
    },
    blocks: (d, ctx) => {
      crCpCtx.current = ctx;
      const c = d.counts;
      return [
        { type: "kpis", span: 6, items: [
          { l: "Needs a look", v: crNum(c.flagged || 0), tone: c.flagged ? "down" : "flat" },
          { l: "Proposed, not confirmed", v: crNum(c.unplaced || 0), tone: c.unplaced ? "down" : "flat" },
          { l: "No courses", v: crNum(c.none || 0), tone: c.none ? "down" : "flat" },
          { l: "Placed", v: crNum(c.placed || 0) },
        ] },
        c.flagged ? { type: "note", span: 6, icon: "warning-circle", tone: "warn", text: crPlural(c.flagged, "child", "children") + (c.flagged === 1 ? " needs" : " need") + " a person to decide.", sub: "Their record names another division, a whole division, or no course at all. Open one to see why, then confirm or choose." }
          : c.unplaced ? { type: "note", span: 6, icon: "check-circle", text: "Every proposal is clear.", sub: "Select the proposed children and confirm them: their courses then stop saying “not confirmed yet”." } : null,
        { type: "table", span: 6, title: "Children and their courses", sub: "Lessons, channels, the timetable and class lists all read what is placed here.", server: d.server,
          search: "Name or ID", cols: ["Child", { l: "On their record", wrap: true }, { l: "Courses", wrap: true }, { l: "Why", wrap: true }, "Placement"],
          filtersInit: { status: c.flagged ? "flagged" : c.unplaced ? "unplaced" : "all" },
          filters: [{ id: "status", l: "Show", opts: CR_CP_STATUS.map(s => ({ v: s[0], l: s[1], n: s[0] === "all" ? undefined : c[s[0]] })) }],
          bulk: [
            { l: "Confirm proposed", max: d.max, run: keys => crCpConfirm(ctx, keys) },
            { l: "Add a course", max: d.max, run: keys => { crCpForm(ctx, "add", keys); return false; } },
            { l: "Remove a course", max: d.max, run: keys => { crCpForm(ctx, "remove", keys); return false; } },
            { l: "Set courses", max: d.max, run: keys => { crCpForm(ctx, "set", keys, []); return false; } },
          ],
          selectAllMatching: async ({ q, filters }) => (await NGGApi.admin.courses.ids({ status: filters.status || "all", q: q || "" })).ids || [],
          emptyText: "Nobody here. Change “Show” to see the others." },
      ].filter(Boolean);
    },
  },
});
