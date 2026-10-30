/* ============================================================================
   Control Room v2 — the community and announcement tabs (Community, Announcements pages). Filled into CR_TAB_DEFS (see cr-pages.jsx).
   ========================================================================== */
/* Each tab mounts the panel that served it in v1 (page-admin.jsx) through
   crPanel, until it is rebuilt as blocks — so nothing v1 did is lost. */
Object.assign(CR_TAB_DEFS, {
  community: crPanel(() => <AdminCommunity/>),
});

/* ── Announcements, native ───────────────────────────────────────────────────
   Was AdminBroadcast mounted whole, with two centres typed into its audience list
   (and into the server: admin_broadcast_audience says what went wrong with that).
   The audiences now come from the server with the number of active members each
   reaches, so the confirm says how many people it is about to tell. An
   announcement always lands in the app; email is the optional second channel.
   There is no recall, so it is confirmed — with the count — before it goes. */
function crAnnSend(ctx) {
  const d = ctx.data || {}, aud = d.audiences || [];
  const label = id => { const a = aud.find(x => x.id === id); return a ? (a.id === "all" ? "everyone" : a.l) + " (" + crNum(a.n) + ")" : id; };
  ctx.form({
    title: "Quick message", submit: "Send", busyLabel: "Sending…",
    intro: "It appears in members’ notification feed. Email is optional and limited to 300 at a time.",
    values: { title: "", body: "", audience: "all", linkPage: "", email: false },
    fields: [
      { id: "title", l: "Title", req: true, max: 140 },
      { id: "body", l: "Message", type: "textarea", rows: 5, max: 2000 },
      { id: "audience", l: "Who gets it", type: "select", req: true, opts: aud.map(a => [a.id, (a.id === "all" ? "Everyone" : a.l) + " · " + crNum(a.n)]) },
      { id: "linkPage", l: "Open a page when tapped", ph: "anchor, dashboard, blog…", max: 60 },
      { id: "email", l: "Email it as well", type: "switch" },
    ],
    onSubmit: async v => {
      const ok = await ctx.confirm({ title: "Send to " + label(v.audience) + "?", body: "“" + v.title + "” goes to their notification feed" + (v.email ? " and their inbox" : "") + ". It can’t be recalled.", cta: "Send" });
      if (!ok) return { fieldErrors: {} };
      const r = await NGGApi.admin.broadcast({ title: v.title.trim(), body: v.body, audience: v.audience, linkPage: v.linkPage.trim(), email: !!v.email });
      ctx.reload();
      return r;
    },
    done: (v, r) => "Sent to " + label(v.audience) + (v.email ? " · emailed " + crNum((r && r.emailed) || 0) : "") + ".",
  });
}
function crNlSend(ctx) {
  const d = ctx.data || {};
  ctx.form({
    title: "Write the newsletter", submit: "Send newsletter", busyLabel: "Sending…",
    intro: "Plain text; links become clickable. Every email carries a one-click unsubscribe link.",
    values: { subject: "", body: "" },
    fields: [
      { id: "subject", l: "Subject", req: true, max: 140, check: v => String(v).trim().length >= 3 ? "" : "At least 3 characters." },
      { id: "body", l: "Message", type: "textarea", rows: 10, req: true, check: v => String(v).trim().length >= 10 ? "" : "At least 10 characters." },
    ],
    onSubmit: async v => {
      const ok = await ctx.confirm({ title: "Send to " + crPlural(d.active || 0, "subscriber") + "?", body: "This emails everyone subscribed. There is no undo.", cta: "Send newsletter", danger: true });
      if (!ok) return { fieldErrors: {} };
      return NGGApi.admin.newsletterSend(v.subject.trim(), v.body);
    },
    done: (v, r) => "Sent to " + crNum((r && r.sent) || 0) + ((r && r.skipped) ? " · " + crNum(r.skipped) + " skipped" : "") + ".",
  });
}
/* ── Official notices ────────────────────────────────────────────────────────
   What management sends members and their families (domain/notices.php): the
   letterhead, a subject, the body as it is written for WhatsApp, a sign-off.
   Paste the whole notice and it is split into its parts for the desk to check;
   the preview is the server's own formatting (NoticeDoc), so it is what a
   family reads. Publishing reaches each member's feed with a push, each family
   account's inbox once, and — when asked — an email to every address from a
   queue. Who has read it and acknowledged it is on the notice; a reminder goes
   only to the rest, once a day. A published notice is corrected (readers see
   that it was, and why) or withdrawn (readers see that instead), never
   deleted. */
const CR_NT_STATUS = { draft: ["Draft", "neutral"], published: ["Published", "ok"], withdrawn: ["Withdrawn", "bad"] };
const CR_NT_ERR = { subject_required: "Give the notice its subject.", body_required: "Write the notice.", too_long: "That is longer than a notice may be.",
  bad_audience: "Choose everyone, a programme, or one of the centres.", already_published: "This notice has already gone out.", nobody: "Nobody is in that audience.",
  note_required: "Say what was corrected — readers are shown it.", too_soon: "A reminder went out less than a day ago.", reason_required: "Say why — readers are shown it.",
  not_draft: "Only a draft is deleted. Withdraw a published notice instead.", withdrawn: "A withdrawn notice is not edited. Write a new one." };
function crNtErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code); return (e && e.data && e.data.detail) || CR_NT_ERR[c] || crErr(e, fb); }
function crNtAud(d, id) { const a = (d.audiences || []).find(x => x.id === id); return id === "all" ? "Everyone" : a ? a.l : id; }
function crNtFields(d, n, published) {
  const aud = d.audiences || [], R = d.reachLabels || {};
  return [
    { id: "org", l: "Organisation (letterhead)", max: 160, ph: "STREET TO STARDOM (STS)" },
    { id: "kind", l: "Kind of notice", max: 160, ph: "MANAGEMENT OFFICIAL NOTICE" },
    { id: "subject", l: "Subject", req: true, max: 300 },
    { id: "body", l: "The notice", type: "textarea", rows: 16, req: true, max: d.max || 40000, help: "As you would write it on WhatsApp: *bold*, _italic_, a blank line between paragraphs, “1. *HEADING*” for a section, “- ” for a bullet." },
    { id: "signoff", l: "Sign-off", max: 160, ph: "STS MANAGEMENT" },
  ].concat(published ? [
    { id: "correctionNote", l: "What was corrected", req: true, max: 240, ph: "Section 3: the re-entry fee is ₦5,000", help: "Readers see that the notice was corrected, when, and this note." },
  ] : [
    { id: "audience", l: "Who it is for", type: "select", req: true, opts: aud.map(a => [a.id, (a.id === "all" ? "Everyone" : a.l) + " · " + crNum(a.n)]) },
    { id: "reach", l: "Send to", type: "chips", req: true, opts: Object.keys(R).map(k => [k, R[k]]) },
    { id: "needsAck", l: "Ask readers to confirm they have read and understood it", type: "switch" },
    { id: "emailOn", l: "Email it as well", type: "switch", help: "Every member and family address, once each, a batch a minute." },
  ]);
}
function crNtNew(ctx) {
  const d = ctx.data || {}, R = d.reachLabels || {};
  ctx.form({
    title: "New notice", submit: "Check it", busyLabel: "Reading it…",
    intro: "Paste the whole notice as it was written for WhatsApp, or write it here. It is split into its letterhead, subject, body and sign-off for you to check before anything is sent.",
    values: { text: "", audience: "all", reach: Object.keys(R)[0] || "both", needsAck: true, emailOn: false },
    fields: [
      { id: "text", l: "The notice", type: "textarea", rows: 16, req: true, max: (d.max || 40000) + 2000, check: v => v.trim().length >= 20 ? "" : "That is too short to be a notice." },
      { id: "audience", l: "Who it is for", type: "select", req: true, opts: (d.audiences || []).map(a => [a.id, (a.id === "all" ? "Everyone" : a.l) + " · " + crNum(a.n)]) },
      { id: "reach", l: "Send to", type: "chips", req: true, opts: Object.keys(R).map(k => [k, R[k]]) },
      { id: "needsAck", l: "Ask readers to confirm they have read and understood it", type: "switch" },
      { id: "emailOn", l: "Email it as well", type: "switch" },
    ],
    onSubmit: async v => {
      const P = await NGGApi.admin.notices.parse(v.text);
      try {
        return await NGGApi.admin.notices.save(Object.assign({}, P.parts, { audience: v.audience, reach: v.reach, needsAck: !!v.needsAck, emailOn: !!v.emailOn }));
      } catch (e) { const f = e && e.data && e.data.field; if (f === "subject" || f === "body") return { fieldErrors: { text: crNtErr(e) } }; throw e; }
    },
    done: (v, r) => { crNtOpen(ctx, r.notice.noticeId, true); return "Saved as a draft. Check each part below, then publish."; },
  });
}
function crNtEdit(ctx, n) {
  const d = ctx.data || {}, pub = n.status === "published";
  ctx.form({
    title: pub ? "Correct the notice" : "Edit the draft", submit: pub ? "Save the correction" : "Save", busyLabel: "Saving…",
    intro: pub ? "It has gone out: readers will see it was corrected, when, and your note. Who it is for cannot change — that would be a new notice." : "",
    values: { org: n.org, kind: n.kind, subject: n.subject, body: n.body, signoff: n.signoff, audience: n.audience, reach: n.reach, needsAck: n.needsAck, emailOn: n.emailOn, correctionNote: "" },
    fields: crNtFields(d, n, pub),
    onSubmit: async v => {
      try { return await NGGApi.admin.notices.save(Object.assign({ noticeId: n.noticeId }, v, { needsAck: !!v.needsAck, emailOn: !!v.emailOn })); }
      catch (e) { const f = e && e.data && e.data.field; if (f) return { fieldErrors: { [f]: crNtErr(e) } }; throw Object.assign(new Error("failed"), { data: { message: crNtErr(e, "Couldn’t save it.") } }); }
    },
    done: () => { ctx.reload(); return pub ? "Corrected. Readers see the change and your note." : "Saved."; },
  });
}
async function crNtPublish(ctx, n) {
  const who = crNtAud(ctx.data, n.audience), N = n.reachMembers || 0;   // read before the confirm: what is agreed is what runs
  const reach = { both: crPlural(N, "member") + " and their families", members: crPlural(N, "member"), guardians: "the families of " + crPlural(N, "member") }[n.reach] || crPlural(N, "member");
  const ok = await ctx.confirm({ title: "Publish to " + who + "?", cta: "Publish",
    body: "“" + n.subject + "” goes to " + reach + (n.emailOn ? ", by email as well" : "") + ". It can be corrected or withdrawn afterwards, but not unsent." });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.notices.publish(n.noticeId);
    ctx.toast("Published · " + crPlural(r.stats.members, "member") + " · " + crPlural(r.stats.families, "family account") + (r.stats.emailsQueued ? " · " + crNum(r.stats.emailsQueued) + " emails on their way" : ""));
    ctx.setData(x => Object.assign({}, x, { readers: {} }));
    ctx.reload();
  } catch (e) { ctx.toast(crNtErr(e, "Couldn’t publish it."), null, true); }
}
function crNtWithdraw(ctx, n) {
  ctx.form({
    title: "Withdraw this notice", submit: "Withdraw it", busyLabel: "Withdrawing…",
    intro: "Readers will see that it was withdrawn, when, and why — instead of the notice disappearing. Emails not yet sent are cancelled.",
    values: { reason: "" }, fields: [{ id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 240, check: v => v.trim().length >= 5 ? "" : "Say why, in a sentence." }],
    onSubmit: v => NGGApi.admin.notices.withdraw(n.noticeId, v.reason.trim()),
    done: () => { ctx.reload(); return "Withdrawn."; },
  });
}
async function crNtRemind(ctx, n, left) {
  const ok = await ctx.confirm({ title: "Remind " + crPlural(left, "member") + "?", cta: "Send the reminder",
    body: "A reminder goes to the feed of each member who has not " + (n.needsAck ? "acknowledged" : "read") + " it yet — and nobody else. One a day at most." });
  if (!ok) return;
  try { const r = await NGGApi.admin.notices.remind(n.noticeId); ctx.toast("Reminded " + crPlural(r.reminded, "member") + "."); crNtReaders(ctx, n.noticeId); ctx.reload(); }
  catch (e) { ctx.toast(crNtErr(e, "Couldn’t send the reminder."), null, true); }
}
async function crNtReaders(ctx, id) {
  try { const r = await NGGApi.admin.notices.readers(id); ctx.setData(x => Object.assign({}, x, { readers: Object.assign({}, x.readers, { [id]: r }) })); }
  catch (e) { ctx.setData(x => Object.assign({}, x, { readers: Object.assign({}, x.readers, { [id]: { err: e } }) })); }
}
/* The open notice is the URL's (/control/comms/broadcast/<id>): it survives a
   reload and a shared link, and a reload cannot lose it to a race. */
function crNtOpen(ctx, id, reload) { ctx.setSub(id || ""); if (reload) ctx.reload(); }
/* Who has read the open notice, fetched once per notice when it is shown (the
   load fetches it too when the page opens on a notice's address). */
const CR_NT_FETCHING = {};
function crNtWantReaders(ctx, id) {
  if (CR_NT_FETCHING[id]) return;
  CR_NT_FETCHING[id] = true;
  crNtReaders(ctx, id).finally(() => { delete CR_NT_FETCHING[id]; });
}
async function crNtCopy(ctx, n) {
  try { await navigator.clipboard.writeText(n.whatsapp); ctx.toast("Copied for WhatsApp."); } catch (_) { ctx.toast("Couldn’t copy — select the text on the notice’s page instead.", null, true); }
}
function crNtDetail(d, ctx) {
  const n = (d.notices || []).find(x => x.noticeId === ctx.sub); if (!n) return [];
  const st = CR_NT_STATUS[n.status] || [n.status, "neutral"], R = (d.readers || {})[n.noticeId];
  if (!R && n.status !== "draft") crNtWantReaders(ctx, n.noticeId);
  const out = [];
  const acts = n.status === "draft" ? [
    { l: "Publish…", run: () => crNtPublish(ctx, n) }, { l: "Edit", run: () => crNtEdit(ctx, n) },
    { l: "Delete the draft", run: async () => { if (!(await ctx.confirm({ title: "Delete this draft?", cta: "Delete", danger: true, body: "It has not gone to anybody." }))) return; try { await NGGApi.admin.notices.del(n.noticeId); crNtOpen(ctx, null, true); } catch (e) { ctx.toast(crNtErr(e), null, true); } } },
  ] : n.status === "published" ? [
    { l: "Correct…", run: () => crNtEdit(ctx, n) }, { l: "Withdraw…", run: () => crNtWithdraw(ctx, n) },
  ] : [];
  out.push({ type: "note", span: 6, icon: n.status === "draft" ? "pencil-simple" : n.status === "published" ? "megaphone" : "prohibit", tone: st[1] === "bad" ? "bad" : null,
    text: st[0] + " · " + crNtAud(d, n.audience) + " · " + ((d.reachLabels || {})[n.reach] || "") + (n.needsAck ? " · asks for acknowledgement" : "") + (n.emailOn ? " · by email too" : ""),
    sub: n.status === "draft" ? "Check the parts below — the letterhead, the subject, the body and the sign-off — then publish. Nobody has it yet."
      : n.status === "published" ? "Published " + crDate(n.publishedAt) + (n.stats ? " to " + crPlural(n.stats.members || 0, "member") + " and " + crPlural(n.stats.families || 0, "family account") + (n.stats.emailsQueued ? ", " + crNum(n.stats.emailsQueued) + " emails" : "") : "") + "." + (n.correctedAt ? " Corrected " + crDate(n.correctedAt) + "." : "")
      : "Withdrawn " + crDate(n.withdrawnAt) + ": " + n.withdrawReason,
    act: acts[0] ? { l: acts[0].l, run: acts[0].run } : null });
  out.push({ type: "list", span: 6, rows: acts.slice(1).map(a => ({ icon: /Delete|Withdraw/.test(a.l) ? "prohibit" : "pencil-simple", t: a.l, onClick: a.run }))
    .concat([{ icon: "whatsapp-logo", t: "Copy for WhatsApp", s: "The notice in WhatsApp’s own marks, ready to paste into a group.", onClick: () => crNtCopy(ctx, n) }])
    .concat(n.status !== "draft" ? [{ icon: "arrow-square-out", t: "Open it as members see it", s: "/notice/" + n.noticeId, onClick: () => window.open("/notice/" + encodeURIComponent(n.noticeId), "_blank", "noopener") }] : [])
    .concat([{ icon: "x", t: "Close", onClick: () => crNtOpen(ctx, null) }]) });
  out.push({ type: "custom", span: 6, title: n.status === "draft" ? "Preview — exactly what they will read" : "The notice", render: () => <NoticeDoc n={n} level={2}/> });
  if (n.status !== "draft") {
    if (!R) out.push({ type: "note", span: 6, icon: "hourglass", text: "Loading who has read it…" });
    else if (R.err) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load who has read it.", sub: crErr(R.err, ""), act: { l: "Try again", run: () => crNtReaders(ctx, n.noticeId) } });
    else {
      const T = R.totals || {}, left = R.needsAck ? T.members - T.acked : T.members - T.read;
      out.push({ type: "kpis", span: 6, items: [{ l: "For", v: crNum(T.members), dn: "members" }, { l: "Read", v: crNum(T.read), dn: T.members ? Math.round(T.read * 100 / T.members) + "%" : "—" }]
        .concat(R.needsAck ? [{ l: "Acknowledged", v: crNum(T.acked), dn: T.members ? Math.round(T.acked * 100 / T.members) + "%" : "—" }] : [])
        .concat([{ l: R.needsAck ? "Not yet acknowledged" : "Not yet read", v: crNum(left), dn: R.remindedAt ? "reminded " + crDate(R.remindedAt) : "" }]) });
      if (n.status === "published" && left > 0) out.push({ type: "list", span: 6, rows: [{ icon: "bell-ringing", t: "Remind the " + crPlural(left, "member") + " who " + (R.needsAck ? "have not acknowledged it" : "have not read it"), s: "Only them, and once a day at most.", onClick: () => crNtRemind(ctx, n, left) }] });
      out.push({ type: "table", span: 6, title: "Who has read it", nosel: true, search: "Search by name or centre",
        cols: ["Member", "Centre", "Read", R.needsAck ? "Acknowledged" : "—"].filter(x => x !== "—"),
        rows: (R.rows || []).map(r => ({ key: r.memberId, cells: [
          { k: "person", t: r.fullName, s: r.memberId }, { k: "text", t: r.centre || "—" },
          { k: "status", t: r.readAt ? "Read" : "Not yet", tone: r.readAt ? "ok" : "neutral", s: r.readAt ? crDate(r.readAt) : "" },
        ].concat(R.needsAck ? [{ k: "status", t: r.ackAt ? (r.ackBy === "parent" ? "By a parent" : "Yes") : "Not yet", tone: r.ackAt ? "ok" : "warn", s: r.ackAt ? crDate(r.ackAt) : "" }] : []) })),
        filters: ["Centre", "Read"].concat(R.needsAck ? ["Acknowledged"] : []), emptyText: "Nobody is in this notice’s audience." });
    }
  }
  return out;
}
Object.assign(CR_TAB_DEFS, {
  broadcast: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const open = ctx.sub || "";
      const [N, B, R] = await Promise.all([NGGApi.admin.notices.list(), NGGApi.admin.broadcastHistory(), open ? NGGApi.admin.notices.readers(open).catch(e => ({ err: e })) : null]);
      return Object.assign({}, N, { announcements: B.announcements || [], readers: open && R ? { [open]: R } : {} });
    },
    actions: (d, ctx) => ctx.can("content") ? [
      { l: "New notice", icon: "scroll", primary: true, run: () => crNtNew(ctx) },
      { l: "Quick message", icon: "megaphone", run: () => crAnnSend(ctx) },
    ] : [],
    blocks: (d, ctx) => {
      const name = id => crNtAud(d, id);
      const N = d.notices || [];
      const pub = N.filter(n => n.status === "published");
      const out = crNtDetail(d, ctx);
      out.push({ type: "kpis", span: 6, items: [
        { l: "Notices published", v: crNum(pub.length) }, { l: "Drafts", v: crNum(N.filter(n => n.status === "draft").length) },
        { l: "Waiting on acknowledgement", v: crNum(pub.filter(n => n.needsAck).reduce((a, n) => a + Math.max(0, (n.reachMembers || 0) - (n.acked || 0)), 0)), dn: "members, across notices" },
      ] });
      out.push({ type: "table", span: 6, title: "Notices", nosel: true, search: "Search notices",
        sub: "Open one to check it, publish it, see who has read it, remind the rest, correct or withdraw it.",
        cols: [{ l: "Subject", wrap: true }, "For", "Status", { l: "Read", num: true }, { l: "Acknowledged", num: true }, "When"],
        rows: N.map(n => { const st = CR_NT_STATUS[n.status] || [n.status, "neutral"]; return { key: n.noticeId, open: () => crNtOpen(ctx, n.noticeId), cells: [
          { k: "strong", t: n.subject, s: [n.org, n.kind].filter(Boolean).join(" · ") }, { k: "text", t: name(n.audience) },
          { k: "status", t: st[0], tone: st[1] },
          { k: "num", t: n.status === "draft" ? "—" : crNum(n.readers || 0) + " / " + crNum(n.reachMembers || 0), v: n.readers || 0 },
          { k: "num", t: n.needsAck && n.status !== "draft" ? crNum(n.acked || 0) : "—", v: n.acked || 0 },
          { k: "text", t: crDate(n.publishedAt || n.updatedAt) },
        ] }; }),
        filters: ["Status", "For"], emptyText: "No notices yet. “New notice” takes a whole management notice, pasted as it was written." });
      out.push({ type: "list", span: 6, title: "Quick messages", empty: "None sent. A quick message is one line in members’ notification feeds.",
        rows: (d.announcements || []).map(a => ({ icon: "megaphone", t: a.title || "(untitled)", s: [name(a.audience), a.body].filter(Boolean).join(" · "), m: crDate(a.createdAt) })) });
      return out;
    },
  },
  newsletter: {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.newsletter(),
    actions: (d, ctx) => [
      ctx.can("content") ? { l: "Write the newsletter", icon: "envelope-simple", primary: true, run: () => crNlSend(ctx), disabled: !d || !d.active, why: "Nobody is subscribed yet." } : null,
      { l: "Export CSV", icon: "download-simple", run: () => downloadCsv("newsletter", (d && d.subscribers) || []), disabled: !d || !(d.subscribers || []).length, why: "No subscribers to export." },
    ].filter(Boolean),
    blocks: d => [
      { type: "kpis", span: 6, items: [{ l: "Subscribed", v: crNum(d.active) }, { l: "Ever signed up", v: crNum(d.total) }] },
      { type: "table", span: 6, nosel: true, search: "Email", cols: ["Email", "Source", "Status", "Joined"], filters: ["Source", "Status"],
        emptyText: "No subscribers yet. People join from the sign-up box on the public site.",
        rows: (d.subscribers || []).map((x, i) => ({ key: x.email || i, cells: [
          { k: "strong", t: x.email }, { k: "text", t: x.source || "—" },
          { k: "status", t: x.status === "subscribed" ? "Subscribed" : x.status === "unsubscribed" ? "Unsubscribed" : (x.status || "—"), tone: x.status === "subscribed" ? "ok" : "neutral" },
          { k: "text", t: crDate(x.createdAt) },
        ] })) },
    ],
  },
});
