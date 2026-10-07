/* ============================================================================
   Control Room v2 — the members tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   Roster: the server pages, searches, filters and sorts (admin_members_list);
   a row opens the member's record, and Edit sends ONLY the fields changed on
   screen, so a stale page cannot overwrite somebody else's edit to a field it
   did not show. Role is not edited here — staff access lives in Access & roles,
   where the last-super-admin rule is. Bulk runs through admin.members.bulk,
   whose guards (own account, staff accounts, centre scope, the 500 cap) are
   the server's; the per-row verdicts are reported, never a bare "done".
   ========================================================================== */

const CR_MEM_STATUS = [["active", "Active"], ["graduated-ngg", "Graduated NGG"], ["graduated-vanguard", "Graduated Vanguard"], ["suspended", "Suspended"], ["inactive", "Inactive"]];
const CR_MEM_TYPE = [["NGG", "NGG member"], ["Summer", "Summer School"]];
const CR_MEM_TONE = { active: "ok", suspended: "bad", inactive: "neutral", "graduated-ngg": "gold", "graduated-vanguard": "gold" };
const CR_MEM_SORT = { 0: "fullName", 1: "centre", 3: "type", 4: "status" };
/* A club admin's edit is queued for a second admin, not refused (domain/approvals.php):
   the server answers approval_pending, which is an outcome to report, not an error. */
async function crMemQueued(p) {
  try { return await p; }
  catch (e) { if (e && e.code === "approval_pending") return { queued: true }; throw e; }
}
function crMemStatusLabel(s) { const f = CR_MEM_STATUS.find(x => x[0] === s); return f ? f[1] : (s || "—"); }

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
    { id: "displayId", l: "Printed ID", max: 24, help: "Leave blank and a new member is given the next number. A printed ID is never reissued." },
    { id: "dob", l: "Date of birth", type: "date" },
    { id: "school", l: "School", max: 160 },
    { id: "parentName", l: "Parent or guardian", max: 120 },
    { id: "parentPhone", l: "Guardian phone", type: "tel", im: "tel" },
    { id: "parentEmail", l: "Guardian email", type: "email", email: true },
    { id: "notes", l: "Staff notes", type: "textarea", rows: 3, max: 2000, help: "Staff see these. The member does not." },
  ];
}
const CR_MEM_KEYS = ["fullName", "email", "phone", "type", "status", "centre", "division", "level", "displayId", "dob", "school", "parentName", "parentPhone", "parentEmail", "notes"];
function crMemValues(m) { const v = {}; CR_MEM_KEYS.forEach(k => { v[k] = m && m[k] != null ? String(m[k]) : ""; }); return v; }
/** What changed on screen, and nothing else. */
function crMemPatch(before, after) {
  const out = {};
  CR_MEM_KEYS.forEach(k => { const a = String(after[k] == null ? "" : after[k]).trim(); if (a !== String(before[k] == null ? "" : before[k]).trim()) out[k] = k === "level" ? a.toUpperCase() : a; });
  return out;
}

/** A bulk run's verdicts as one sentence: applied, unchanged, refused (with why). */
function crBulkSummary(r, verb) {
  const res = (r && r.results) || [];
  const bad = res.filter(x => !x.ok);
  const why = {};
  bad.forEach(x => { const k = crErr({ code: x.error }, String(x.error || "refused").replace(/_/g, " ")); why[k] = (why[k] || 0) + 1; });
  const parts = [crNum(r.applied || 0) + " " + verb];
  if (r.unchanged) parts.push(crNum(r.unchanged) + " already so");
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
    title: m.fullName || memberId, name: m.fullName, photo: /^https?:\/\//.test(m.photoUrl || "") ? m.photoUrl : "",
    sub: [m.displayId || m.memberId, m.centre, m.type === "Summer" ? "Summer School" : "NGG"].filter(Boolean).join(" · "),
    stats: [["XP", crNum(d.stats && d.stats.xp)], ["Missions verified", crNum(d.progress && d.progress.verified)], ["Streak", crNum(d.stats && d.stats.streak)]],
    fields: [["Status", crMemStatusLabel(m.status)], ["Member ID", m.memberId], ["Printed ID", m.displayId], ["Email", m.email], ["Phone", m.phone],
      ["Centre", m.centre], ["Division", div ? div.name : (m.division || "Not placed")], ["Level", m.level], ["School", m.school],
      ["Date of birth", m.dob ? crDate(m.dob) : ""], ["Joined", m.joinDate ? crDate(m.joinDate) : m.createdAt ? crDate(m.createdAt) : ""]],
    sections: [
      { h: "Parent or guardian", rows: [["Name", m.parentName], ["Phone", m.parentPhone], ["Email", m.parentEmail]] },
      { h: "Mentor", rows: [["Mentor", d.mentor ? d.mentor.fullName : "None assigned"]] },
      m.notes ? { h: "Staff notes", text: m.notes } : null,
    ],
    actions: [{ l: "Edit", primary: true, run: () => crMemEdit(ctx, m) }],
  });
}

function crMemEdit(ctx, m) {
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
      if (!Object.keys(patch).length) return { nothing: true };
      const r = await crMemQueued(NGGApi.admin.members.upsert(Object.assign({ memberId: m.memberId }, patch)));
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
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
      const r = await crMemQueued(NGGApi.admin.members.upsert(row));
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
      return r;
    },
    done: (v, r) => crQueued(r) ? "Sent to a second admin to approve." : "Added · " + v.fullName + (r && r.memberId ? " · " + r.memberId : ""),
  });
}

/* A bulk action asks for its value first, naming the count it will act on —
   read now, before the question, so a refresh cannot change it. */
function crMemBulk(ctx, op, title, field, verb) {
  return async keys => {
    const n = keys.length;
    ctx.form({
      title, submit: "Apply to " + crPlural(n, "member"), intro: "Staff accounts and your own are refused, and named.",
      fields: [field],
      onSubmit: async v => {
        const r = await crMemQueued(NGGApi.admin.members.bulk(op, keys, { [field.id]: v[field.id] }));
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

/* The table re-fetches whenever its `server` object changes, so it is made ONCE
   per load and reads the live ctx through a ref — a fresh object per render is
   a fetch loop. */
const crMemCtx = { current: null };
function crMemServer(d) {
  const divName = id => { const x = (d.divisions || []).find(v => v.id === id); return x ? x.name : ""; };
  return {
    sortKeys: CR_MEM_SORT,
    fetch: async ({ q, filters, sort, page, pageSize }) => {
      const r = await NGGApi.admin.members.list(Object.assign({ q, page: page + 1, pageSize, sort: sort ? CR_MEM_SORT[sort.ci] || "" : "", dir: sort ? sort.dir : "" },
        { status: filters.status || "", type: filters.type || "", centre: filters.centre || "" }));
      return {
        total: r.total || 0,
        rows: (r.members || []).map(m => ({
          key: m.memberId,
          cells: [
            { k: "person", t: m.fullName || m.memberId, s: [m.displayId || m.memberId, m.email].filter(Boolean).join(" · "), photo: /^https?:\/\//.test(m.photoUrl || "") ? m.photoUrl : "" },
            { k: "text", t: m.centre || "—" },
            { k: "text", t: divName(m.division) || "Not placed" },
            { k: "text", t: m.type === "Summer" ? "Summer School" : "NGG" },
            { k: "status", t: crMemStatusLabel(m.status), tone: CR_MEM_TONE[m.status] || "neutral" },
          ],
          open: () => crMemOpen(crMemCtx.current, m.memberId),
        })),
      };
    },
  };
}

Object.assign(CR_TAB_DEFS, {
  members: {
    skeleton: ["table"],
    load: async () => {
      const [cs, dv] = await Promise.all([
        NGGApi.admin.registration.centres().catch(() => ({ centres: [] })),
        NGGApi.admin.members.divisions().catch(() => ({ divisions: [] })),
      ]);
      const centres = (cs.centres || []).filter(c => c.status !== "retired").map(c => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
      const d = { centres, divisions: dv.divisions || [], rev: 0 };
      d.server = crMemServer(d);
      return d;
    },
    actions: (d, ctx) => [{ l: "Add member", icon: "user-plus", primary: true, run: () => crMemAdd(ctx) }],
    blocks: (d, ctx) => {
      crMemCtx.current = ctx;
      return [{
        type: "table", span: 6, reloadKey: d.rev, search: "Search by name, ID or email",
        cols: ["Member", "Centre", "Division", "Programme", "Status"],
        server: d.server,
        filters: [
          { id: "status", l: "Status", opts: CR_MEM_STATUS.map(s => ({ v: s[0], l: s[1] })) },
          { id: "type", l: "Programme", opts: CR_MEM_TYPE.map(s => ({ v: s[0], l: s[1] })) },
          { id: "centre", l: "Centre", opts: (d.centres || []).map(c => ({ v: c, l: c })) },
        ],
        selectAllMatching: async ({ q, filters }) => (await NGGApi.admin.members.ids({ q, status: filters.status || "", type: filters.type || "", centre: filters.centre || "" })).memberIds || [],
        bulk: [
          { l: "Set status", max: 500, run: crMemBulk(ctx, "status", "Set status", { id: "status", l: "Status", type: "select", req: true, opts: CR_MEM_STATUS }, "updated") },
          { l: "Post to centre", max: 500, run: crMemBulk(ctx, "centre", "Post to centre", { id: "centre", l: "Centre", type: "select", req: true, opts: (d.centres || []).map(c => [c, c]) }, "moved") },
        ],
        emptyText: "No members yet. Add one, or import the roster workbook.",
      }];
    },
  },
});
