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

const CR_RCL_FILTERS = [["open", "Still registering"], ["followup", "Needs a follow-up"], ["unassigned", "Nobody helping yet"], ["mine", "Mine to help"], ["done", "Registered"], ["all", "Everyone"]];
/* The entry steps, in the order a family does them (domain/registration-checklist.php RCL_STEPS). */
const CR_RCL_STEPS = [["online", "Online registration"], ["payment", "Payment"], ["orientation", "Orientation"], ["documents", "Submit documents"], ["idcard", "ID card"]];
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
  const fus = d.followups || [];
  ctx.drawer({
    title: m.fullName, name: m.fullName, photo: m.photoUrl || null, sub: [m.displayId || m.memberId, m.centre].filter(Boolean).join(" · "),
    stats: [["Place", c.confirmed === false ? "Accepted · waiting to sign and pay" : "Confirmed"], ["Done", c.done + " of " + c.total],
      ["Helping", c.supervisorName ? c.supervisorName + (c.supervisorWhy === "mentor" ? " · their mentor" : c.supervisorAuto ? " · chosen automatically" : "") : "Nobody yet"],
      c.resumedOn ? ["Resumed", crDate(c.resumedOn)] : ["Next follow-up", c.nextFollowUpOn ? crDate(c.nextFollowUpOn) + (c.nextFollowUpOn <= (d.today || "") ? " · due" : "") : "Not set"]],
    sections: [
      { h: "Entry steps", text: (c.steps || []).map(x => (x.complete ? "✓ " : "· ") + x.label + " — " + x.done + " of " + x.total).join("\n")
          + "\n" + (c.resumedOn ? "✓ Attend lectures — resumed " + crDate(c.resumedOn) : "· Attend lectures — the day every step is done") + (c.stalled ? "\n\nNo progress in two weeks: follow up with the family." : "") },
      { h: "Still to do", empty: "Nothing left. They are registered.", list: open.map(i => ({
          icon: i.kind === "auto" ? "database" : i.evidence === "photo" ? "camera" : i.evidence === "document" ? "file-text" : "note-pencil",
          t: (i.stepLabel ? i.stepLabel + " · " : "") + i.title + (i.status === "rejected" ? " · reopened" : ""),
          s: i.status === "rejected" ? "Rejected: " + i.rejectReason : i.kind === "auto" ? "From the record. " + i.fix : [i.help, i.presence ? "Needs the supervisor at the centre." : "", i.maxAgeDays ? "Evidence from the last " + i.maxAgeDays + " days." : ""].filter(Boolean).join(" "),
          act: mine ? { l: i.kind === "auto" ? "Check again" : "Submit", run: () => crRclSubmit(ctx, m, i) } : null })) },
      { h: "Done", empty: "Nothing yet.", list: done.map(i => ({ icon: "check-circle", t: i.title, s: i.kind === "auto" ? "The record shows it." : "Verified " + crDate(i.verifiedAt),
          act: i.kind === "admin" ? { l: "Reject", run: () => crRclReject(ctx, m, i) } : null })) },
      { h: "Evidence submitted", empty: "Nothing submitted yet.", list: (d.submissions || []).slice(0, 20).map(x => ({
          icon: x.verdict === "accepted" || x.verdict === "record_passes" ? "seal-check" : x.verdict === "family_sent" ? "whatsapp-logo" : "x-circle",
          t: x.verdict === "family_sent" ? "Sent by the family on WhatsApp" + (x.note ? " · “" + x.note + "”" : "") : title(x.itemKey), s: x.reason, m: crDate(x.at),
          act: x.url ? { l: "Open file", run: () => window.open(x.url, "_blank", "noopener") } : null })) },
      (d.whatsapp || []).length ? { h: "WhatsApp", list: d.whatsapp.map(w => ({ icon: w.dir === "in" ? "chat-circle-text" : "paper-plane-tilt",
          t: (w.dir === "in" ? "The family: " : "NGG: ") + w.body, s: w.dir === "out" ? (w.status === "failed" ? "Not delivered — sent by SMS instead" : w.status ? "Message " + w.status : "") : "", m: crDate(String(w.at).slice(0, 10)) })) } : null,
      { h: "Follow-ups", empty: "None logged yet. Call or message the family, then log what they said.", list: fus.map(f => ({
          icon: f.outcome === "reached" || f.outcome === "promised" ? "phone-call" : f.outcome === "withdrawing" ? "warning" : "phone-x",
          t: f.channelLabel + " · " + f.outcomeLabel, s: [f.note, f.nextOn ? "Next: " + crDate(f.nextOn) : ""].filter(Boolean).join(" · "), m: (f.byName || "") + " · " + crDate(String(f.at).slice(0, 10)) })) },
    ].filter(Boolean),
    actions: [
      c.status !== "done" ? { l: "Log a follow-up", primary: true, run: () => crRclFollowup(ctx, m, d, false) } : null,
      { l: c.supervisorId ? "Change who is helping" : "Assign a supervisor", primary: c.status === "done", run: () => crRclAssign(ctx, [m.memberId], m.fullName) },
      { l: "Open their record", run: () => { ctx.closeDrawer(); ctx.go("members", "members", m.memberId); } },
    ].filter(Boolean),
  });
}

/** Log a call, a message or a visit, and when to try next. `asSupervisor` posts through the supervisor's own route. */
function crRclFollowup(ctx, m, d, asSupervisor) {
  const plus = n => { const t = new Date((d.today || new Date().toISOString().slice(0, 10)) + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  ctx.form({
    title: "Follow up · " + m.fullName, submit: "Log it", busyLabel: "Saving…",
    intro: "Say what you did and what the family said. Set the next day to try: the follow-up comes back to you then.",
    values: { channel: "call", outcome: "reached", nextOn: plus(3) },
    fields: [
      { id: "channel", l: "How", type: "select", req: true, opts: Object.entries(d.channels || {}) },
      { id: "outcome", l: "What happened", type: "select", req: true, opts: Object.entries(d.outcomes || {}) },
      { id: "note", l: "Note", type: "textarea", max: 500, help: "What they said, what they will bring, and when." },
      { id: "nextOn", l: "Follow up next on", type: "date", req: true, help: "Within 60 days." },
    ],
    onSubmit: async v => {
      const body = { memberId: m.memberId, channel: v.channel, outcome: v.outcome, note: v.note || "", nextOn: v.nextOn };
      const r = asSupervisor ? await NGGApi.member.regcheck.followup(body) : await NGGApi.admin.regcheck.act("followup", body);
      ctx.closeDrawer(); ctx.reload(); return r;
    },
    done: (v, r) => "Logged. Next follow-up " + crDate(r.nextOn || v.nextOn) + ".",
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
    values: it ? { title: it.title, help: it.help, evidence: it.evidence, presence: !!it.presence, maxAgeDays: it.maxAgeDays ? String(it.maxAgeDays) : "", step: it.step || "documents" } : { evidence: "photo", step: "documents" },
    fields: [
      { id: "title", l: "Title", type: "text", req: true, max: 160, ph: "Photo with their guardian at the centre" },
      { id: "step", l: "Entry step", type: "select", req: true, opts: CR_RCL_STEPS, help: "Where it sits on the card the family is handed." },
      { id: "help", l: "What the supervisor should do", type: "textarea", max: 600 },
      { id: "evidence", l: "Evidence", type: "select", req: true, opts: CR_RCL_EVIDENCE },
      { id: "presence", l: "The supervisor must be at the member’s centre that day", type: "switch", help: "Checked against their check-in at the gate." },
      { id: "maxAgeDays", l: "Oldest evidence accepted, in days", type: "number", num: true, help: "Leave empty for no limit.", when: v => v.evidence !== "none" },
    ],
    onSubmit: async v => {
      const r = await NGGApi.admin.regcheck.act("item.save", { itemId: it ? it.itemId : "", title: v.title, help: v.help || "", evidence: v.evidence, presence: !!v.presence,
        maxAgeDays: v.evidence === "none" ? 0 : Number(v.maxAgeDays || 0), step: v.step || "documents" });
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
    title: it.title, sub: ((CR_RCL_STEPS.find(x => x[0] === it.step) || [0, ""])[1] + " · ") + it.evidenceLabel + (it.presence ? " · at the centre" : "") + (live ? "" : " · retired"), icon: "list-checks",
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
        { k: "text", t: x.supervisorName || "Nobody yet", s: x.supervisorName ? (x.supervisorWhy === "mentor" ? "Their mentor" : x.supervisorAuto ? "Chosen automatically" : "Chosen by staff") + " · since " + crDate(x.assignedAt) : "" },
        { k: "status", t: x.status === "done" ? (x.resumedOn ? "Resumed " + crDate(x.resumedOn) : "Registered") : x.confirmed === false ? "Accepted · to sign and pay" : x.stalled ? "Stalled · follow up" : x.supervisorId ? "In progress" : "Needs a supervisor",
          tone: x.status === "done" ? "ok" : x.stalled || !x.supervisorId ? "bad" : "warn", s: x.status !== "done" && x.nextFollowUpOn ? "Follow up " + crDate(x.nextFollowUpOn) : "" },
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
          { l: "Needs a follow-up", v: crNum(c.followup || 0), tone: c.followup ? "down" : "flat", s: "Due, or stalled two weeks" },
          { l: "Nobody helping yet", v: crNum(c.unassigned || 0), tone: c.unassigned ? "down" : "flat" },
          { l: "Registered", v: crNum(c.done || 0), tone: "up" },
          { l: "No checklist yet", v: crNum(d.unstarted || 0), tone: d.unstarted ? "down" : "flat" },
        ] },
        c.unassigned ? { type: "note", span: 6, icon: "hand-heart", tone: "warn", text: crPlural(c.unassigned, "member") + (c.unassigned === 1 ? " has" : " have") + " nobody helping them register.",
          sub: "Select them and choose “Assign a supervisor”. The suggestions are people actually seen at their centre, with the reasons." } : null,
        c.followup ? { type: "note", span: 6, icon: "phone-call", tone: "warn", text: crPlural(c.followup, "registration") + " need" + (c.followup === 1 ? "s" : "") + " a follow-up today.",
          sub: "Show “Needs a follow-up”, open each, call or message the family, and log what they said with the next day to try." } : null,
        { type: "table", span: 6, title: "Members registering", sub: "The entry steps: online registration, payment, orientation, documents, ID card. A member resumes lectures on the day the last one is done.", server: d.server,
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

/* ── Agreements (members/agreements) ──────────────────────────────────────
   The Membership Agreement (MoU, domain/mou.php): every NGG member in your
   centres by where their agreement stands. The family signs on their own
   phone; here staff send or resend the link (and copy it for WhatsApp),
   countersign as NGG's representative — witnessing too, when nobody did at
   home — open the printable copy, or withdraw one started in error. */
const CR_MOU_FILTERS = [["paper", "Paper copy to receive"], ["awaiting_ngg", "To countersign"], ["awaiting_family", "Waiting on the family"], ["none", "Not started"], ["signed", "Signed"], ["void", "Withdrawn"], ["all", "Everyone"]];
const CR_MOU_STATE = { awaiting_ngg: ["To countersign", "warn"], awaiting_family: ["With the family", "neutral"], signed: ["Signed", "ok"], void: ["Withdrawn", "bad"], none: ["Not started", "bad"] };
const crMouCtx = { current: null };
function crMouWhen(iso) { return iso ? crDate(String(iso).slice(0, 10)) : ""; }

async function crMouCopyLink(ctx, link) {
  try { await navigator.clipboard.writeText(link); ctx.toast("Link copied. Paste it into WhatsApp or a text to the family."); }
  catch (_) { window.prompt("Copy the family’s link:", link); }
}

async function crMouOpen(ctx, mouId) {
  let r;
  try { r = (await NGGApi.admin.mou.get(mouId)).mou; } catch (e) { ctx.toast(crErr(e, "Couldn’t open that agreement."), null, true); return; }
  const P = r.parties || {}, st = CR_MOU_STATE[r.status] || ["", "neutral"];
  const who = (x, sub) => x ? x.name + (sub ? " · " + sub : "") + " · " + crMouWhen(x.at) : "Not yet";
  const fam = r.family || {};
  ctx.drawer({
    title: r.fullName, sub: [r.displayId || r.memberId, r.centre, st[0]].filter(Boolean).join(" · "), name: r.fullName,
    sections: [
      { h: "Signatures", text: "Family: " + who(P.family, P.family && P.family.relation) + "\nWitness: " + (r.needsWitness ? "Nobody at home — you witness when you countersign" : who(P.witness)) + "\nNGG: " + who(P.ngg, P.ngg && P.ngg.role) },
      r.family ? { h: "The family", text: [fam.fatherName && "Father: " + fam.fatherName, fam.motherName && "Mother: " + fam.motherName, fam.guardianName && "Guardian: " + fam.guardianName, fam.phone, fam.email, fam.address].filter(Boolean).join("\n") } : null,
      { h: "The signed paper copy", text: r.paper ? "Received at " + (r.paper.centre || "the centre") + " " + crMouWhen(r.paper.at) + ", checked and photographed by " + r.paper.by + "." + (r.signedVia === "paper" ? " Signed on paper only." : "")
          : r.status === "void" ? "—" : "Not yet. The family prints the agreement, signs it in ink with a witness, and brings it here. Check it, photograph the signed page, then countersign." },
      { h: "Sent", text: r.sentAt ? "Emailed " + crMouWhen(r.sentAt) + " to " + (r.sentTo || "—") + (r.viewedAt ? ". Opened " + crMouWhen(r.viewedAt) + "." : ". Not opened yet.") : "Not emailed — no address on the record. Copy the link and send it." },
      r.status === "awaiting_ngg" || r.status === "signed" ? { h: "The check", text: "Answered the five questions" + (r.quizAttempts > 1 ? " (" + r.quizAttempts + " tries)" : "") + ". Off-site activities: " + (r.tripsChoice === "granted" ? "yes" : "no") + "." } : null,
      r.voidReason ? { h: "Withdrawn", text: r.voidReason } : null,
    ].filter(Boolean),
    actions: [
      r.status !== "void" && !r.paper ? { l: "Receive the signed copy", primary: true, run: () => { ctx.closeDrawer(); crMouPaper(ctx, r); } } : null,
      r.status === "awaiting_ngg" && r.paper ? { l: "Countersign", primary: true, run: () => { ctx.closeDrawer(); crMouCountersign(ctx, r); } } : null,
      r.paper && r.paper.url ? { l: "See the photograph", run: () => window.open(r.paper.url, "_blank", "noopener") } : null,
      r.status !== "void" ? { l: r.status === "awaiting_family" || !r.paper ? "Print it to sign in ink" : "Open the copy (PDF)", run: () => window.open(NGGApi.admin.mou.docUrl(r.mouId), "_blank", "noopener") } : null,
      r.status === "awaiting_family" ? { l: "Resend to the family", run: async () => {
        try { const x = await NGGApi.admin.mou.act("resend", { mouId: r.mouId }); ctx.closeDrawer(); ctx.toast((x.sentTo || []).length ? "Sent to " + x.sentTo.join(", ") + ". The old link no longer works." : "No email on the record — copy the link instead.");
          crMouCopyLink(ctx, x.link); ctx.reload(); }
        catch (e) { ctx.toast(crErr(e), null, true); } } } : null,
      r.status !== "void" && r.status !== "signed" ? { l: "Withdraw", run: () => { ctx.closeDrawer(); crMouVoid(ctx, r); } } : null,
    ].filter(Boolean),
  });
}

/** The width and height of a picture the browser can open (the server re-reads it where it can). */
function crImageSize(file) {
  return new Promise(res => { const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { res({ width: im.naturalWidth, height: im.naturalHeight }); URL.revokeObjectURL(u); };
    im.onerror = () => { res({ width: 0, height: 0 }); URL.revokeObjectURL(u); }; im.src = u; });
}

/** The inked copy is at the centre: check it, photograph the signed page. Paper-only families: copy what the paper says. */
function crMouPaper(ctx, r) {
  const paperOnly = r.status === "awaiting_family";
  const checks = r.paperChecks || {};
  ctx.form({
    title: "Receive the signed copy · " + r.fullName, submit: "Receive it", busyLabel: "Checking…",
    intro: (paperOnly ? "The family has not signed online: the paper is their signature. Copy what it says. " : "")
      + "Check every point with the paper in your hand. If one is not right, give it back to the family to put right — do not receive it.",
    // Every check starts OFF and must be turned on by the person holding the paper.
    values: Object.assign(Object.fromEntries(Object.keys(checks).map(k => ["check_" + k, false])), paperOnly ? { trips: "" } : {}),
    fields: [
      ...Object.entries(checks).map(([k, l]) => ({ id: "check_" + k, l, type: "switch", check: (v, vals) => vals["check_" + k] === true ? "" : "Not yet — give the copy back to put this right." })),
      { id: "photo", l: "Photograph of the signed page", type: "file", req: true, accept: "image/*", capture: "environment",
        help: "Use the phone’s camera, the whole page filling the picture, every word readable. At least " + (r.paperMinLong || 1600) + " pixels on the long side." },
      paperOnly ? { id: "signerName", l: "Parent or guardian who signed", req: true, max: 120, ph: "As written on the paper" } : null,
      paperOnly ? { id: "signerRel", l: "They are the", type: "select", req: true, opts: [["Father", "Father"], ["Mother", "Mother"], ["Guardian", "Guardian"]] } : null,
      paperOnly ? { id: "witnessName", l: "Witness’s name", req: true, max: 120 } : null,
      paperOnly ? { id: "trips", l: "Off-site activities (clause 8)", type: "select", req: true, opts: [["granted", "Yes — consent given"], ["declined", "No"]] } : null,
    ].filter(Boolean),
    onSubmit: async v => {
      const f = v.photo;
      const size = f ? await crImageSize(f) : { width: 0, height: 0 };
      /* The cloud when there is one; this site's own photo store when there is not — a centre must be able to
         receive the copy whatever the storage is doing. Sized as a 'proof' (2000px): every word stays readable. */
      const up = await NGGApi.uploadDocumentPhoto(f);
      if (!up || !up.url || /^data:/.test(up.url)) throw new Error("The photograph couldn’t be stored. Check the connection and try again.");
      // The type its name says (the server reads the real one from the file wherever it can).
      const ext = ((up.url.split("?")[0].match(/\.(jpe?g|png|webp)$/i) || [])[1] || "jpg").toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const body = { mouId: r.mouId, url: up.url, mime, bytes: up.bytes || f.size || 0, width: size.width, height: size.height,
        checks: Object.fromEntries(Object.keys(checks).map(k => [k, !!v["check_" + k]])) };
      if (paperOnly) Object.assign(body, { signerName: v.signerName.trim(), signerRel: v.signerRel, witnessName: v.witnessName.trim(), trips: v.trips });
      const x = await NGGApi.admin.mou.act("paper", body);
      await ctx.reload(); return x;
    },
    done: (v, x) => x.canCountersign ? "Received. Countersign it next." : "Received.",
  });
}

function crMouCountersign(ctx, r) {
  const me = (ctx.me || {}).name || "";
  ctx.form({
    title: "Countersign · " + r.fullName, submit: "Countersign", busyLabel: "Signing…",
    intro: "You sign for Okun Alimosho (NGG)" + (r.needsWitness ? ", and as the witness: nobody witnessed the family’s signature at home." : ".") + " The family is emailed the completed copy.",
    values: { role: "", signature: "" },
    fields: [
      { id: "role", l: "Your role", req: true, max: 80, ph: "Centre coordinator, Egbeda" },
      { id: "signature", l: "Your signature", type: "signature", req: true, name: me, help: "Draw it, or sign with your name." },
    ],
    onSubmit: async v => { const x = await NGGApi.admin.mou.act("countersign", { mouId: r.mouId, role: v.role.trim(), signature: v.signature }); await ctx.reload(); return x; },
    done: (v, x) => "Signed by all parties. Copy emailed to " + ((x.copyTo || []).join(", ") || "the family") + ".",
  });
}

function crMouVoid(ctx, r) {
  ctx.form({
    title: "Withdraw the agreement · " + r.fullName, submit: "Withdraw", busyLabel: "Withdrawing…",
    intro: "The record is kept. Its link stops working, and a new agreement can be started.",
    fields: [{ id: "reason", l: "Why", type: "textarea", req: true, max: 300, check: v => String(v || "").trim().length < 10 ? "Say why, in at least ten characters." : "" }],
    onSubmit: async v => { const x = await NGGApi.admin.mou.act("void", { mouId: r.mouId, reason: v.reason.trim() }); await ctx.reload(); return x; },
    done: () => "Withdrawn.",
  });
}

async function crMouStart(ctx, ids) {
  const n = ids.length;   // read before the confirm
  if (!(await ctx.confirm({ title: "Send " + crPlural(n, "agreement") + "?", body: "Each family is emailed a private link to read and sign the Membership Agreement. At most " + (ctx.data.max || 200) + " in one go.", cta: "Send " + crPlural(n, "agreement") }))) return;
  try { const r = await NGGApi.admin.mou.act("start", { memberIds: ids }); ctx.toast(crRclSummary(r, "sent").text, null, crRclSummary(r, "sent").bad); ctx.reload(); }
  catch (e) { ctx.toast(crErr(e), null, true); }
}

function crMouServer(ctx) {
  return {
    fetch: async ({ q, filters, page, pageSize }) => {
      const r = await NGGApi.admin.mou.list({ status: filters.status || "awaiting_ngg", q: q || "" });
      const rows = r.rows || [];
      return { total: rows.length, rows: rows.slice(page * pageSize, page * pageSize + pageSize).map(x => ({ key: x.memberId + (x.mouId ? ":" + x.mouId : ""), memberId: x.memberId,
        open: x.mouId ? () => crMouOpen(crMouCtx.current || ctx, x.mouId) : null, cells: [
          { k: "person", t: x.fullName, s: [x.displayId || x.memberId, x.centre].filter(Boolean).join(" · "), photo: x.photoUrl || null },
          { k: "status", t: (CR_MOU_STATE[x.status] || ["—"])[0] + (x.mouId && x.status !== "void" && !x.paper ? " · paper copy not in" : "") + (x.needsWitness ? " · needs a witness" : ""),
            tone: x.mouId && x.status !== "void" && !x.paper && x.status !== "awaiting_family" ? "warn" : (CR_MOU_STATE[x.status] || [0, "neutral"])[1] },
          { k: "text", t: x.parties && x.parties.family ? x.parties.family.name : "—", s: x.parties && x.parties.family ? crMouWhen(x.parties.family.at) : "" },
          { k: "text", t: x.sentAt ? crMouWhen(x.sentAt) : x.mouId ? "Not emailed" : "—", s: x.viewedAt ? "Opened" : "" },
        ] })) };
    },
  };
}

Object.assign(CR_TAB_DEFS, {
  "agreements": {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const r = await NGGApi.admin.mou.list({ status: "awaiting_ngg" });
      return { counts: r.counts || {}, max: r.max || 200, server: crMouServer(ctx) };
    },
    actions: (d, ctx) => [
      { l: d.counts.none ? "Send to " + crPlural(d.counts.none, "member") + " without one" : "Everyone has one", icon: "paper-plane-tilt", primary: !d.counts.awaiting_ngg, disabled: !d.counts.none,
        why: d.counts.none ? "" : "Every NGG member in your centres has an agreement.",
        run: async () => { const r = await NGGApi.admin.mou.list({ status: "none" }); crMouStart(ctx, (r.rows || []).map(x => x.memberId).slice(0, d.max)); } },
    ],
    blocks: (d, ctx) => {
      crMouCtx.current = ctx;
      const c = d.counts;
      return [
        { type: "kpis", span: 6, items: [
          { l: "Paper copy to receive", v: crNum(c.paper || 0), tone: c.paper ? "down" : "flat", s: "Signed online, ink copy not in" },
          { l: "To countersign", v: crNum(c.awaiting_ngg || 0), tone: c.awaiting_ngg ? "down" : "flat", s: "Signed by the family" },
          { l: "With the family", v: crNum(c.awaiting_family || 0), tone: "flat" },
          { l: "Signed", v: crNum(c.signed || 0), tone: "up" },
          { l: "Not started", v: crNum(c.none || 0), tone: c.none ? "down" : "flat" },
        ] },
        c.awaiting_ngg ? { type: "note", span: 6, icon: "signature", tone: "warn", text: crPlural(c.awaiting_ngg, "family has", "families have") + " signed and " + (c.awaiting_ngg === 1 ? "is" : "are") + " waiting on NGG’s countersignature.", sub: "Open one to countersign. If nobody witnessed it at home, you witness it as you sign." } : null,
        { type: "table", span: 6, title: "Membership Agreements", sub: "The family reads and signs online, then prints it, signs in ink and brings it here. Open a row to receive the paper copy, countersign, print or resend.", server: d.server,
          cols: [{ l: "Member" }, { l: "Where it stands", sort: false }, { l: "Family signed", sort: false }, { l: "Sent", sort: false }],
          search: "Name or ID",
          filtersInit: { status: c.paper ? "paper" : c.awaiting_ngg ? "awaiting_ngg" : c.none ? "none" : "all" },
          filters: [{ id: "status", l: "Show", opts: CR_MOU_FILTERS.map(f => ({ v: f[0], l: f[1], n: f[0] === "all" ? undefined : c[f[0]] })) }],
          bulk: [{ l: "Send the agreement", max: d.max, run: keys => { crMouStart(ctx, keys.map(k => String(k).split(":")[0])); return false; } }],
          emptyText: "Nobody here. Change “Show” to see the others." },
      ].filter(Boolean);
    },
  },
});
