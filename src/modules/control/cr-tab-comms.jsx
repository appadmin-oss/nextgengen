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
    title: "New announcement", submit: "Send", busyLabel: "Sending…",
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
Object.assign(CR_TAB_DEFS, {
  broadcast: {
    skeleton: ["list"],
    load: async () => NGGApi.admin.broadcastHistory(),
    actions: (d, ctx) => ctx.can("content") ? [{ l: "New announcement", icon: "megaphone", primary: true, run: () => crAnnSend(ctx) }] : [],
    blocks: (d, ctx) => {
      const name = id => { const a = (d.audiences || []).find(x => x.id === id); return id === "all" ? "Everyone" : a ? a.l : id; };
      return [
        { type: "list", span: 6, title: "Recent announcements", empty: "Nothing sent yet. New announcement sends one to members’ notification feeds.",
          rows: (d.announcements || []).map(a => ({ icon: "megaphone", t: a.title || "(untitled)", s: [name(a.audience), a.body].filter(Boolean).join(" · "), m: crDate(a.createdAt) })) },
      ];
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
