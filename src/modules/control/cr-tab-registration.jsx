/* ── Registration (members/reg-checklist) ──────────────────────────────────
   Every new NGG member's registration checklist (domain/registration-checklist.php):
   who still has items open, how far along they are, who is helping them, and
   the items staff add for the programme. The automatic items are answered by
   the member's record; the admin items by evidence the assigned supervisor
   submits, which the server verifies (type, age, the supervisor, and their
   presence at the member's centre that day). Supervisors are suggested by the
   server from real presence at the member's centre — this screen never ranks
   or filters them itself, and the assignment op re-checks every row.

   The tab id is not "registration": that old section id is an alias for the
   Summer School check-in desks (CR_ALIASES) and must keep resolving. */

const CR_RCL_FILTERS = [["open", "Still registering"], ["unassigned", "Nobody helping yet"], ["mine", "Mine to help"], ["done", "Registered"], ["all", "Everyone"]];
const CR_RCL_EVIDENCE = [["photo", "A photo"], ["document", "A document"], ["none", "A note, no file"]];
const CR_RCL_ERR = {
  out_of_scope: "not in a centre you administer", not_found: "not found", own_account: "your own account", not_a_member: "not an NGG member",
  no_centre: "no centre on their record", not_eligible: "cannot supervise there", not_present: "not seen at the centre — give a reason",
  supervisor_full: "the supervisor is at the cap", not_started: "the checklist could not start",
};
const crRclCtx = { current: null };

/** Per-row verdicts, never a bare "done": partial is reported as partial. */
function crRclSummary(r, verb) {
  const res = (r && r.results) || [];
  const bad = res.filter(x => !x.ok), same = res.filter(x => x.ok && x.unchanged).length;
  const why = {};
  bad.forEach(x => { const k = CR_RCL_ERR[x.error] || String(x.error || "refused").replace(/_/g, " "); why[k] = (why[k] || 0) + 1; });
  const parts = [crNum(r.applied || 0) + " " + verb];
  if (same) parts.push(crNum(same) + " already so");
  if (bad.length) parts.push(crNum(bad.length) + " refused — " + Object.keys(why).map(k => why[k] + " × " + k).join("; "));
  const one = bad.length === 1 && bad[0].message ? " " + bad[0].message : "";
  return { text: parts.join(" · ") + one, bad: bad.length > 0 };
}
function crRclFail(msg) { const e = new Error(msg); e.data = { message: msg }; return e; }

/* ── Supervisors: the server's suggestions, with its reasons ── */
async function crRclAssign(ctx, keys, name) {
  const n = keys.length;   // read before anything is asked, so a refresh underneath cannot change it
  let s;
  try { s = await NGGApi.admin.regcheck.suggest(keys); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t find who can help."), null, true); return; }
  const who = n === 1 ? (name || "this member") : crPlural(n, "member");
  const run = async (c, reason) => {
    if (n > 1 && !(await ctx.confirm({ title: "Ask " + c.first + " to help " + who + "?", body: c.name + " will see them in My registrations and be reminded weekly while items are open.", cta: "Assign " + c.first })))
      return false;
    const r = await NGGApi.admin.regcheck.act("assign", { memberIds: keys, supervisorId: c.id, reason: reason || "" });
    const sum = crRclSummary(r, "assigned to " + c.first);
    ctx.closeDrawer(); ctx.toast(sum.text, null, sum.bad); ctx.reload();
    return r;
  };
  const withReason = c => ctx.form({
    title: "Assign " + c.first + " anyway", submit: "Assign", busyLabel: "Assigning…",
    intro: c.name + " has not been at " + s.centre + " in the last " + s.weeks + " weeks. Say why they should help " + who + "; the reason is kept in the audit log.",
    fields: [{ id: "reason", l: "Why", type: "textarea", req: true, max: 300, check: v => String(v || "").trim().length < s.reasonMin ? "Give a reason of at least " + s.reasonMin + " characters." : "" }],
    onSubmit: async v => { const r = await NGGApi.admin.regcheck.act("assign", { memberIds: keys, supervisorId: c.id, reason: v.reason }); const sum = crRclSummary(r, "assigned to " + c.first); ctx.closeDrawer(); ctx.reload(); return sum; },
    done: (v, sum) => sum ? sum.text : null,
  });
  const row = (c, act) => ({ icon: c.kinds.indexOf("staff") >= 0 ? "identification-badge" : "hand-heart", t: c.name + " · " + c.kindLabel, s: c.why, m: c.load + " of " + c.cap, act });
  ctx.drawer({
    title: "Who can help " + who, sub: s.centre + " · suggested from check-ins, the desk rota and the timetable there", icon: "users-three",
    stats: [["Suggested", crNum(s.suggested.length)], ["Not seen there", crNum(s.others.length)], ["At the cap", crNum(s.full.length)]],
    sections: [
      { h: "Suggested", list: s.suggested.map(c => row(c, { l: "Assign", run: () => run(c).catch(e => ctx.toast(crErr(e), null, true)) })),
        empty: "Nobody cleared has been at " + s.centre + " lately. Pick someone below with a reason, or clear a volunteer there first." },
      s.others.length ? { h: "Not seen at " + s.centre + " in " + s.weeks + " weeks", list: s.others.map(c => row(c, { l: "Assign with a reason", run: () => withReason(c) })) } : null,
      s.full.length ? { h: "At the cap of " + s.cap, list: s.full.map(c => row(c, null)) } : null,
    ],
  });
}

/* ── One member's checklist ── */
async function crRclOpen(ctx, memberId) {
  let d;
  try { d = await NGGApi.admin.regcheck.member(memberId); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t open that checklist."), null, true); return; }
  const m = d.member || {};
  if (!d.started) {
    ctx.drawer({ title: m.fullName || memberId, sub: m.centre || "No centre", name: m.fullName,
      sections: [{ h: "Registration", text: m.ngg === false ? "Summer School accounts have no NGG registration checklist." : "Their checklist has not started yet." }],
      actions: [m.ngg !== false ? { l: "Start their checklist", primary: true, run: async () => { const r = await NGGApi.admin.regcheck.act("start", { memberIds: [memberId] }); ctx.closeDrawer(); ctx.toast(crRclSummary(r, "started").text); ctx.reload(); } } : null] });
    return;
  }
  const c = d.checklist || {}, items = c.items || [];
  const mine = c.supervisorId && c.supervisorId === d.me;
  const title = k => ((items.find(i => i.key === k) || {}).title) || "An item no longer on the checklist";
  const open = items.filter(i => !i.done), done = items.filter(i => i.done);
  ctx.drawer({
    title: m.fullName, name: m.fullName, photo: m.photoUrl || null, sub: [m.displayId || m.memberId, m.centre].filter(Boolean).join(" · "),
    stats: [["Done", c.done + " of " + c.total], ["Helping", c.supervisorName || "Nobody yet"], ["At the centre today", c.supervisorId ? (d.supervisorPresentToday ? "Yes" : "No") : "—"]],
    sections: [
      { h: "Still to do", empty: "Nothing left. They are registered.", list: open.map(i => ({
          icon: i.kind === "auto" ? "database" : i.evidence === "photo" ? "camera" : i.evidence === "document" ? "file-text" : "note-pencil",
          t: i.title + (i.status === "rejected" ? " · reopened" : ""),
          s: i.status === "rejected" ? "Rejected: " + i.rejectReason : i.kind === "auto" ? "From the record. " + i.fix : [i.help, i.presence ? "Needs the supervisor at the centre." : "", i.maxAgeDays ? "Evidence from the last " + i.maxAgeDays + " days." : ""].filter(Boolean).join(" "),
          act: mine ? { l: i.kind === "auto" ? "Check again" : "Submit", run: () => crRclSubmit(ctx, m, i) } : null })) },
      { h: "Done", empty: "Nothing yet.", list: done.map(i => ({ icon: "check-circle", t: i.title, s: i.kind === "auto" ? "The record shows it." : "Verified " + crDate(i.verifiedAt),
          act: i.kind === "admin" ? { l: "Reject", run: () => crRclReject(ctx, m, i) } : null })) },
      { h: "Evidence submitted", empty: "Nothing submitted yet.", list: (d.submissions || []).slice(0, 20).map(x => ({
          icon: x.verdict === "accepted" || x.verdict === "record_passes" ? "seal-check" : "x-circle", t: title(x.itemKey), s: x.reason, m: crDate(x.at),
          act: x.url ? { l: "Open file", run: () => window.open(x.url, "_blank", "noopener") } : null })) },
    ],
    actions: [
      { l: c.supervisorId ? "Change who is helping" : "Assign a supervisor", primary: true, run: () => crRclAssign(ctx, [m.memberId], m.fullName) },
      { l: "Open their record", run: () => { ctx.closeDrawer(); ctx.go("members", "members", m.memberId); } },
    ],
  });
}

/** Staff who are the supervisor submit from here; the server verifies. */
function crRclSubmit(ctx, m, i) {
  const after = r => { ctx.closeDrawer(); ctx.reload(); setTimeout(() => crRclOpen(ctx, m.memberId), 0); return r; };
  if (i.kind === "auto") {
    return NGGApi.member.regcheck.submit({ memberId: m.memberId, itemKey: i.key })
      .then(r => { ctx.toast(r.reason, null, !r.accepted); after(r); }, e => ctx.toast(crErr(e), null, true));
  }
  const file = i.evidence !== "none";
  ctx.form({
    title: i.title, submit: "Submit", busyLabel: "Checking…",
    intro: [i.help, i.presence ? "You must have checked in at " + m.centre + " today." : "", i.maxAgeDays ? "Evidence from the last " + i.maxAgeDays + " days." : ""].filter(Boolean).join(" "),
    fields: [
      file ? { id: "file", l: i.evidence === "photo" ? "Photo" : "Document", type: "file", req: true, accept: i.evidence === "photo" ? "image/*" : "image/*,.pdf,.doc,.docx,.odt,.rtf,.txt" } : null,
      i.maxAgeDays ? { id: "capturedOn", l: i.evidence === "photo" ? "Taken on" : "Dated", type: "date", req: true } : null,
      { id: "note", l: "Note", type: "textarea", req: !file, max: 500, help: file ? "Optional." : "What you checked." },
    ].filter(Boolean),
    onSubmit: async v => {
      const body = { memberId: m.memberId, itemKey: i.key, note: v.note || "", capturedOn: v.capturedOn || "" };
      if (file && v.file) {
        const up = await NGGApi.uploadFile(v.file, "evidence");
        Object.assign(body, { url: up.url, mime: v.file.type || "", bytes: up.bytes || v.file.size || 0 });
      }
      const r = await NGGApi.member.regcheck.submit(body);
      if (!r.accepted) throw crRclFail(r.reason);
      after(r);
      return r;
    },
    done: (v, r) => r && r.reason,
  });
}

function crRclReject(ctx, m, i) {
  ctx.form({
    title: "Reject “" + i.title + "”", submit: "Reject", busyLabel: "Rejecting…",
    intro: "It reopens for " + m.fullName + ", and the supervisor is told why.",
    fields: [{ id: "reason", l: "Why", type: "textarea", req: true, max: 400, check: v => String(v || "").trim().length < 5 ? "Say what was wrong with it." : "" }],
    onSubmit: async v => { const r = await NGGApi.admin.regcheck.act("reject", { memberId: m.memberId, itemKey: i.key, reason: v.reason }); ctx.closeDrawer(); ctx.reload(); return r; },
    done: "Reopened. The supervisor has been told.",
  });
}

/* ── The admin items ── */
function crRclItemForm(ctx, it) {
  ctx.form({
    title: it ? "Change “" + it.title + "”" : "Add an item", submit: it ? "Save" : "Add", busyLabel: "Saving…",
    intro: "Every NGG member’s checklist gets it. The supervisor submits the evidence; the server checks it.",
    values: it ? { title: it.title, help: it.help, evidence: it.evidence, presence: !!it.presence, maxAgeDays: it.maxAgeDays ? String(it.maxAgeDays) : "" } : { evidence: "photo" },
    fields: [
      { id: "title", l: "Title", type: "text", req: true, max: 160, ph: "Photo with their guardian at the centre" },
      { id: "help", l: "What the supervisor should do", type: "textarea", max: 600 },
      { id: "evidence", l: "Evidence", type: "select", req: true, opts: CR_RCL_EVIDENCE },
      { id: "presence", l: "The supervisor must be at the member’s centre that day", type: "switch", help: "Checked against their check-in at the gate." },
      { id: "maxAgeDays", l: "Oldest evidence accepted, in days", type: "number", num: true, help: "Leave empty for no limit.", when: v => v.evidence !== "none" },
    ],
    onSubmit: async v => {
      const r = await NGGApi.admin.regcheck.act("item.save", { itemId: it ? it.itemId : "", title: v.title, help: v.help || "", evidence: v.evidence, presence: !!v.presence,
        maxAgeDays: v.evidence === "none" ? 0 : Number(v.maxAgeDays || 0) });
      ctx.reload(); return r;
    },
    done: it ? "Saved." : "Added to every checklist.",
  });
}
function crRclItemOpen(ctx, it) {
  const act = (a, body, msg) => async () => { try { await NGGApi.admin.regcheck.act(a, Object.assign({ itemId: it.itemId }, body)); ctx.closeDrawer(); ctx.reload();
    ctx.toast(msg, a === "item.retire" && body.retire ? () => NGGApi.admin.regcheck.act("item.retire", { itemId: it.itemId, retire: false }).then(() => ctx.reload()) : null); }
    catch (e) { ctx.toast(crErr(e), null, true); } };
  const live = it.status === "active";
  ctx.drawer({
    title: it.title, sub: it.evidenceLabel + (it.presence ? " · at the centre" : "") + (live ? "" : " · retired"), icon: "list-checks",
    stats: [["Evidence", it.evidenceLabel], ["Age limit", it.maxAgeDays ? it.maxAgeDays + " days" : "None"], ["Verified for", crPlural(it.verified || 0, "member")]],
    sections: [{ h: "What the supervisor does", text: it.help || "No help written yet." }],
    actions: live ? [
      { l: "Change", primary: true, run: () => { ctx.closeDrawer(); crRclItemForm(ctx, it); } },
      { l: "Move up", run: act("item.move", { dir: "up" }, "Moved up.") },
      { l: "Move down", run: act("item.move", { dir: "down" }, "Moved down.") },
      { l: "Retire", run: act("item.retire", { retire: true }, "Retired. Its history is kept.") },
    ] : [{ l: "Bring it back", primary: true, run: act("item.retire", { retire: false }, "Back on every checklist.") }],
  });
}

function crRclServer() {
  return {
    sortKeys: { 0: "name", 1: "progress" },
    fetch: async ({ q, filters, sort, page, pageSize }) => {
      const r = await NGGApi.admin.regcheck.list({ filter: filters.status || "open", q: q || "", sort: sort ? ({ 0: "name", 1: "progress" })[sort.ci] || "" : "", page, pageSize });
      return { total: r.total || 0, rows: (r.rows || []).map(x => ({ key: x.memberId, open: () => crRclOpen(crRclCtx.current, x.memberId), cells: [
        { k: "person", t: x.fullName, s: [x.displayId || x.memberId, x.centre].filter(Boolean).join(" · "), photo: x.photoUrl || null },
        { k: "progress", pct: x.total ? Math.round(x.done / x.total * 100) : 0, t: x.done + " of " + x.total },
        { k: "text", t: (x.left || []).slice(0, 3).join(", ") + ((x.left || []).length > 3 ? " and " + ((x.left || []).length - 3) + " more" : "") || "Nothing left" },
        { k: "text", t: x.supervisorName || "Nobody yet", s: x.supervisorName ? "Since " + crDate(x.assignedAt) : "" },
        { k: "status", t: x.status === "done" ? "Registered" : x.supervisorId ? "In progress" : "Needs a supervisor", tone: x.status === "done" ? "ok" : x.supervisorId ? "warn" : "bad" },
      ] })) };
    },
  };
}

Object.assign(CR_TAB_DEFS, {
  "reg-checklist": {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const [r, it] = await Promise.all([NGGApi.admin.regcheck.list({ filter: "open", pageSize: 1 }), NGGApi.admin.regcheck.items()]);
      return { counts: r.counts || {}, unstarted: r.unstarted || 0, max: r.max || 500, cap: r.cap || 12, items: it.items || [], auto: it.auto || [], server: crRclServer() };
    },
    actions: (d, ctx) => [
      { l: "Add an item", icon: "plus", primary: true, run: () => crRclItemForm(ctx, null) },
      { l: d.unstarted ? "Start " + crPlural(d.unstarted, "checklist") : "Every checklist started", icon: "play", disabled: !d.unstarted,
        why: d.unstarted ? "" : "Every active NGG member already has one.",
        run: async () => {
          const n = d.unstarted;   // the count agreed to is the one on screen
          if (!(await ctx.confirm({ title: "Start " + crPlural(n, "checklist") + "?", body: "Each of these NGG members gets a registration checklist. Nobody is told until a supervisor is assigned. At most " + d.max + " in one go.", cta: "Start " + crPlural(n, "checklist") }))) return;
          try { const r = await NGGApi.admin.regcheck.act("start", { missing: true }); ctx.toast(crRclSummary(r, "started").text + (r.left ? " · " + crNum(r.left) + " still to start" : "")); ctx.reload(); }
          catch (e) { ctx.toast(crErr(e), null, true); }
        } },
    ],
    blocks: (d, ctx) => {
      crRclCtx.current = ctx;
      const c = d.counts, live = d.items.filter(i => i.status === "active"), old = d.items.filter(i => i.status !== "active");
      return [
        { type: "kpis", span: 6, items: [
          { l: "Still registering", v: crNum(c.open || 0), tone: c.open ? "down" : "flat" },
          { l: "Nobody helping yet", v: crNum(c.unassigned || 0), tone: c.unassigned ? "down" : "flat" },
          { l: "Registered", v: crNum(c.done || 0), tone: "up" },
          { l: "No checklist yet", v: crNum(d.unstarted || 0), tone: d.unstarted ? "down" : "flat" },
        ] },
        c.unassigned ? { type: "note", span: 6, icon: "hand-heart", tone: "warn", text: crPlural(c.unassigned, "member") + (c.unassigned === 1 ? " has" : " have") + " nobody helping them register.",
          sub: "Select them and choose “Assign a supervisor”. The suggestions are people actually seen at their centre, with the reasons." } : null,
        { type: "table", span: 6, title: "Members registering", sub: "Progress counts the record’s own items and the items below. Open a member to see what is left and the evidence.", server: d.server,
          search: "Name, ID or supervisor", cols: [{ l: "Member" }, { l: "Progress" }, { l: "What is left", wrap: true, sort: false }, { l: "Helping", sort: false }, { l: "Status", sort: false }],
          filtersInit: { status: c.unassigned ? "unassigned" : "open" },
          filters: [{ id: "status", l: "Show", opts: CR_RCL_FILTERS.map(f => ({ v: f[0], l: f[1], n: c[f[0]] })) }],
          bulk: [{ l: "Assign a supervisor", max: d.max, run: keys => { crRclAssign(ctx, keys); return false; } }],
          selectAllMatching: async ({ q, filters }) => (await NGGApi.admin.regcheck.ids({ filter: filters.status || "open", q: q || "" })).ids || [],
          emptyText: "Nobody here. “Still registering” lists members with items open; change “Show” to see the others." },
        { type: "list", span: 3, title: "Items staff added", sub: "Evidence the supervisor brings. Open one to change, move or retire it.",
          rows: live.map((it, n) => ({ icon: it.evidence === "photo" ? "camera" : it.evidence === "document" ? "file-text" : "note-pencil",
            t: (n + 1) + ". " + it.title, s: [it.evidenceLabel, it.presence ? "at the centre" : "", it.maxAgeDays ? "last " + it.maxAgeDays + " days" : ""].filter(Boolean).join(" · "),
            m: crNum(it.verified || 0) + " verified", onClick: () => crRclItemOpen(ctx, it) }))
            .concat(old.map(it => ({ icon: "archive", t: it.title + " · retired", s: "Kept for history", onClick: () => crRclItemOpen(ctx, it) }))),
          empty: "No items yet. The record’s own items still apply; add one for anything else a member must bring." },
        { type: "list", span: 3, title: "From the record", sub: "Done when the member’s record shows it. Evidence never ticks these.",
          rows: d.auto.filter(a => a.applies).map(a => ({ icon: "database", t: a.title, s: a.help })), empty: "None." },
      ].filter(Boolean);
    },
  },
});
