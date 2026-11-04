/* ============================================================================
   Control Room — Support (domain/support.php; capability `support`).

   The queue of cases members and families opened from inside their portals.
   Sorted by when a reply is due (P1 first), so the next case to answer is at
   the top. A case opens in the drawer: the thread (internal notes marked),
   who opened it and from where, what that category asks for, their other
   cases, and the acts — reply (which waits for them by default), an internal
   note, take it, priority, solve or close. Bulk is the server's one op,
   capped and per-row; the count is read before any confirm.
   ========================================================================== */

const CR_SUP_TONE = { new: "info", open: "info", pending: "warn", solved: "ok", closed: "neutral" };
const CR_SUP_SORT = { 0: "number", 5: "due", 6: "recent" };

function crSupFilters(meta, counts) {
  const st = meta ? meta.statuses : {};
  return [
    { id: "status", l: "Status", opts: [{ v: "active", l: "Needs attention", n: (counts.new || 0) + (counts.open || 0) + (counts.pending || 0) }]
      .concat(Object.keys(st).map(k => ({ v: k, l: st[k], n: counts[k] || 0 }))).concat([{ v: "all", l: "Every case" }]) },
    { id: "priority", l: "Priority", opts: (meta ? meta.priorities : []).map(p => ({ v: p.id, l: p.id + " · " + p.label })) },
    { id: "category", l: "About", opts: (meta ? meta.categories : []).map(c => ({ v: c.id, l: c.label })) },
    { id: "assignee", l: "Owner", opts: [{ v: "me", l: "Mine" }, { v: "none", l: "Nobody yet" }] },
  ];
}

function crSupDue(r) {
  if (r.status === "pending") return { t: "Waiting for them", s: crAgo(r.lastActivityAt) };
  if (!r.respondBy || r.status === "solved" || r.status === "closed") return { t: "—", s: "" };
  const ms = new Date(r.respondBy) - Date.now(), h = Math.round(Math.abs(ms) / 36e5);
  const span = h < 1 ? "under an hour" : h < 48 ? h + " h" : Math.round(h / 24) + " days";
  return ms < 0 ? { t: "Overdue by " + span, s: crDate(r.respondBy, true), bad: true } : { t: "Reply in " + span, s: crDate(r.respondBy, true) };
}

/* The live tab context. load() is handed a narrower one (no reload, no
   setData), and the server object outlives a render, so the rows and the
   drawer read the current one from here — set on every render by blocks(). */
const crSupCtx = { current: null };

/* The table refetches when its server object changes: one per load. */
function crSupServer(d, ctx0) {
  const ctx = new Proxy({}, { get: (_, k) => (crSupCtx.current || ctx0)[k] });
  return {
    sortKeys: CR_SUP_SORT,
    fetch: async ({ q, filters, sort, page }) => {
      const f = filters || {};
      const r = await NGGApi.admin.support.list({ q: q || "", status: f.status || "active", priority: f.priority || "", category: f.category || "",
        assignee: f.assignee || "", sort: sort ? CR_SUP_SORT[sort.ci] || "due" : "due", page });
      return { total: r.total || 0, rows: (r.rows || []).map(c => {
        const due = crSupDue(c);
        return { key: String(c.caseNo), open: () => crSupOpen(ctx, c.caseNo), cells: [
          { k: "mono", t: String(c.caseNo) },
          { k: "strong", t: c.subject, s: c.categoryL + (c.subcategory ? " · " + c.subcategory : "") },
          { k: "text", t: c.name || "—", s: (c.kind === "guardian" ? "Family" : "Member") + (c.centre ? " · " + c.centre : "") },
          { k: "status", t: c.priority, tone: c.priority === "P1" ? "bad" : c.priority === "P2" ? "warn" : "neutral" },
          { k: "status", t: d.meta.statuses[c.status] || c.status, tone: CR_SUP_TONE[c.status] || "neutral" },
          { k: "text", t: due.t, s: due.s },
          { k: "text", t: crAgo(c.lastActivityAt), s: c.assignee ? "With " + c.assignee : "Nobody yet" },
        ] };
      }) };
    },
  };
}

async function crSupBulk(ctx, op, value, keys, label) {
  const n = keys.length;
  try {
    const r = await NGGApi.admin.support.bulk(op, keys.map(Number), value);
    const bits = [crPlural(r.applied, "case") + " " + label];
    if (r.unchanged) bits.push(crNum(r.unchanged) + " already were");
    if (r.refused) bits.push(crNum(r.refused) + " refused");
    ctx.toast(bits.join(" · ") + ".", null, r.refused > 0 && r.applied === 0);
    ctx.reload();
    return r;
  } catch (e) { ctx.toast(crErr(e, "Couldn’t update " + crPlural(n, "case") + "."), null, true); return false; }
}

async function crSupOpen(ctx, caseNo) {
  let r;
  try { r = await NGGApi.admin.support.get(caseNo); } catch (e) { ctx.toast(crErr(e, "Couldn’t open case " + caseNo + "."), null, true); return; }
  ctx.setSub(String(caseNo));
  const c = r.case, meta = (ctx.data && ctx.data.meta) || { statuses: {}, priorities: [] };
  const due = crSupDue(c);
  const after = () => { ctx.reload(); crSupOpen(ctx, caseNo); };
  const replyForm = internal => ctx.form({
    title: internal ? "Internal note on case " + caseNo : "Reply on case " + caseNo,
    intro: internal ? "Only staff see a note. It is not emailed and does not count as a reply." : "Emailed to " + (c.email || "them") + " and shown in their portal.",
    submit: internal ? "Add note" : "Send reply", busyLabel: "Sending…",
    values: { body: "", status: c.status === "closed" ? "closed" : "pending" },
    fields: [
      !internal && r.replies.length ? { id: "canned", l: "Start from", type: "select", opts: [["", "A blank reply"]].concat(r.replies.map(x => [x.id, x.l])) } : null,
      { id: "body", l: internal ? "Note" : "Reply", type: "textarea", rows: 7, help: internal ? "" : "Leave it empty to send the saved reply chosen above, as it is." },
      internal || c.status === "closed" ? null : { id: "status", l: "Then", type: "select", opts: [["pending", "Wait for their reply"], ["solved", "Mark it solved"], ["open", "Keep it with us"]] },
    ].filter(Boolean),
    onSubmit: async v => {
      const saved = v.canned ? (r.replies.find(y => y.id === v.canned) || {}).body || "" : "";
      const body = String(v.body || "").trim() || saved;
      if (!body) return { fieldErrors: { body: "Write the " + (internal ? "note" : "reply") + " first." } };
      await NGGApi.admin.support.reply(caseNo, body, { internal, status: v.status });
    },
    done: () => { setTimeout(after, 0); return internal ? "Note added." : "Reply sent."; },
  });
  ctx.drawer({
    title: c.subject, name: c.name || "?", sub: "Case " + c.caseNo + " · " + c.categoryL + (c.subcategory ? " · " + c.subcategory : ""),
    stats: [["Priority", c.priority], ["Status", meta.statuses[c.status] || c.status], ["Reply", due.t]],
    fields: [["From", (c.name || "—") + (c.kind === "guardian" ? " (family)" : " (member)")], ["Email", c.email], ["Phone", c.phone ? crMask(c.phone) : ""], ["Centre", c.centre],
      ["Opened", crDate(c.createdAt, true) + " from " + ({ portal: "My NGG", community: "the community", family: "the Family account", staff: "staff, on their behalf" }[c.source] || c.source)],
      ["With", c.assignee || "Nobody yet"], ["First reply", c.firstResponseAt ? crDate(c.firstResponseAt, true) : "Not yet"],
      c.followUpOf ? ["Follows", "Case " + c.followUpOf] : null, c.rating ? ["Rated", c.rating + " of 5" + (c.ratingNote ? " · “" + c.ratingNote + "”" : "")] : null,
      c.pageUrl ? ["Page", c.pageUrl] : null].filter(Boolean),
    sections: [
      { h: "Conversation", list: r.messages.map(m => ({ icon: m.internal ? "lock-simple" : m.by === "staff" ? "headset" : m.by === "system" ? "gear-six" : "user",
        t: (m.internal ? "Internal note · " : "") + (m.by === "requester" ? c.name || "Them" : m.by === "system" ? "NGG support" : m.name) + " · " + crDate(m.at, true),
        s: m.body + (m.files.length ? "\nAttached: " + m.files.map(f => f.name).join(", ") : ""),
        act: m.files.length ? { l: "Open file", run: () => window.open(NGGApi.admin.support.fileUrl(c.caseNo, m.files[0].id), "_blank", "noopener") } : null })), empty: "No messages." },
      (r.context || []).length ? { h: "What we already know", rows: r.context } : null,
      { h: "This category asks for", list: (c.ask || []).map(a => ({ icon: "check", t: a })) },
      { h: "Their other cases", list: (r.others || []).map(o => ({ icon: "lifebuoy", t: o.subject, s: "Case " + o.caseNo + " · " + (meta.statuses[o.status] || o.status), act: { l: "Open case", run: () => crSupOpen(ctx, o.caseNo) } })), empty: "None." },
    ],
    actions: [
      { l: "Reply", primary: true, run: () => replyForm(false) },
      { l: "Internal note", run: () => replyForm(true) },
      c.assigneeId !== (ctx.me || {}).id ? { l: "Take it", run: async () => { await crSupBulk(ctx, "assign", "me", [String(c.caseNo)], "taken"); after(); } } : null,
      { l: "Priority…", run: () => ctx.form({ title: "Priority of case " + caseNo, submit: "Save", values: { p: c.priority },
        fields: [{ id: "p", l: "Priority", type: "select", opts: meta.priorities.map(p => [p.id, p.id + " · " + p.label + " — " + p.when]) }],
        onSubmit: async v => { await NGGApi.admin.support.bulk("priority", [caseNo], v.p); }, done: () => { setTimeout(after, 0); return "Priority saved."; } }) },
      ["new", "open", "pending"].includes(c.status) ? { l: "Mark solved", run: async () => { await crSupBulk(ctx, "status", "solved", [String(c.caseNo)], "marked solved"); after(); } } : null,
      c.status === "solved" ? { l: "Close now", run: async () => { if (await ctx.confirm({ title: "Close case " + caseNo + "?", body: "A closed case stays closed. If they write again, it opens a follow-up case that points back to this one.", cta: "Close it" })) { await crSupBulk(ctx, "status", "closed", [String(c.caseNo)], "closed"); after(); } } } : null,
    ].filter(Boolean),
  });
}

Object.assign(CR_TAB_DEFS, {
  cases: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const r = await NGGApi.admin.support.list({ status: "active" });
      const d = { kpis: r.kpis, counts: r.counts, meta: r.meta };
      d.server = crSupServer(d, ctx);
      // A link to /control/support/cases/<n> (a notification, an email) opens that case.
      if (ctx.sub && /^\d+$/.test(ctx.sub)) setTimeout(() => crSupOpen(crSupCtx.current || ctx, Number(ctx.sub)), 0);
      return d;
    },
    count: async () => { const r = await NGGApi.admin.support.list({ status: "active" }); return (r.counts.new || 0) + (r.counts.open || 0); },
    actions: (d, ctx) => [
      { l: "Open a case for a member", icon: "plus", primary: true, run: () => ctx.form({
        title: "Open a case for a member", intro: "For somebody who rang or came to the desk. It appears in their portal, with you as its owner.",
        submit: "Open the case", values: { priority: "P3", category: "other" },
        fields: [
          { id: "memberId", l: "Member ID", type: "text", req: true, ph: "NGG-…", help: "The person the case is for. Their replies come to you." },
          { id: "category", l: "About", type: "select", opts: d.meta.categories.map(c => [c.id, c.label]) },
          { id: "priority", l: "Priority", type: "select", opts: d.meta.priorities.map(p => [p.id, p.id + " · " + p.label + " — " + p.when]) },
          { id: "subject", l: "In a few words", type: "text", req: true },
          { id: "body", l: "What they told you", type: "textarea", rows: 6, req: true },
        ],
        onSubmit: async v => { const r = await NGGApi.admin.support.open(v); return r; },
        done: (v, r) => { setTimeout(() => { ctx.reload(); if (r && r.caseNo) crSupOpen(ctx, r.caseNo); }, 0); return r && r.appended ? "Added to their open case " + r.caseNo + "." : "Case " + (r && r.caseNo) + " opened."; },
      }) },
    ],
    blocks: (d, ctx) => {
      crSupCtx.current = ctx;
      const k = d.kpis || {};
      const out = [{ type: "kpis", span: 6, items: [
        { l: "Need attention", v: crNum(k.active || 0), tone: "flat" },
        { l: "Overdue", v: crNum(k.overdue || 0), tone: k.overdue ? "down" : "flat" },
        { l: "Urgent or high", v: crNum(k.urgent || 0), tone: k.urgent ? "down" : "flat" },
        { l: "Nobody has it", v: crNum(k.unassigned || 0), tone: "flat" },
      ] }];
      if (k.overdue) out.push({ type: "note", span: 6, icon: "alarm", tone: "bad", text: crPlural(k.overdue, "case") + " past the reply target.", sub: "They are at the top of the list. Answer, or take one so the others know it is being looked at." });
      out.push({ type: "table", span: 6, title: "Cases", sub: "The next reply due is at the top. Cases are opened from My NGG, the community and the Family account.",
        cols: [{ l: "Case" }, { l: "Subject", wrap: true }, { l: "From", sort: false }, { l: "Priority", sort: false }, { l: "Status", sort: false }, { l: "Reply" }, { l: "Last activity" }],
        server: d.server, filters: crSupFilters(d.meta, d.counts || {}), filtersInit: { status: "active" },
        search: "Search by case number, subject, name or centre",
        bulk: [
          { l: "Take them", max: d.meta.bulkMax, run: keys => crSupBulk(ctx, "assign", "me", keys, "taken") },
          { l: "Mark solved", max: d.meta.bulkMax, run: async keys => (await ctx.confirm({ title: "Mark " + crPlural(keys.length, "case") + " solved?", body: "Each person is told their case is solved and can reply within a week to reopen it.", cta: "Mark solved" })) ? crSupBulk(ctx, "status", "solved", keys, "marked solved") : false },
        ],
        emptyText: "No cases need attention. When a member or family opens one, it appears here." });
      return out;
    },
    facts: d => "Support: " + (d.kpis.active || 0) + " cases need attention, " + (d.kpis.overdue || 0) + " overdue, " + (d.kpis.urgent || 0) + " urgent or high.",
  },
  "support-health": {
    skeleton: ["kpis", "bars"],
    load: async () => {
      const [all, solved] = await Promise.all([NGGApi.admin.support.list({ status: "all" }), NGGApi.admin.support.list({ status: "solved" })]);
      return { all, solved };
    },
    actions: () => [],
    blocks: d => {
      const k = d.all.kpis || {}, c = d.all.counts || {};
      return [
        { type: "kpis", span: 6, items: [
          { l: "Open now", v: crNum(k.active || 0), tone: "flat" },
          { l: "Overdue", v: crNum(k.overdue || 0), tone: k.overdue ? "down" : "flat" },
          { l: "Rating", v: k.rating != null ? k.rating + " / 5" : "—", d: k.rated ? "from " + crPlural(k.rated, "case") : "No ratings yet", tone: "flat" },
          { l: "Solved, not yet closed", v: crNum(c.solved || 0), tone: "flat" },
        ] },
        { type: "bars", span: 3, title: "Cases by status", rows: Object.keys(d.all.meta.statuses).map(s => [d.all.meta.statuses[s], c[s] || 0]), empty: "No cases yet." },
        { type: "note", span: 3, icon: "info", text: "Reply targets by priority",
          sub: d.all.meta.priorities.map(p => p.id + " " + p.label + ": within " + (p.hours < 24 ? p.hours + " hours" : p.hours === 24 ? "a day" : Math.round(p.hours / 24) + " days") + ". " + p.when).join(" ") },
      ];
    },
  },
});
