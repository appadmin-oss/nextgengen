/* ============================================================================
   Control Room v2 — the money tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   Dues & arrears, membership payments and donations. Conduct & fines — the
   rules, the fines upload, the one-time clearance, the compliance board, the
   policy and the calendars — is its own file, cr-tab-conduct.jsx.

   Donations: v1 AdminDonations — the Paystack ledger (admin_donations_list,
   gated `settings`, the newest 500), what it raised, and a CSV export.
   ========================================================================== */

/* ── Donations ── */
const CR_MO_DON_CAP = 500;   // admin_donations_list returns the newest 500
const CR_MO_DON_STATUS = { paid: ["Paid", "ok"], pending: ["Pending", "warn"], failed: ["Failed", "bad"], abandoned: ["Abandoned", "neutral"] };
function crMoDonStatus(s) { return CR_MO_DON_STATUS[s] || [s ? s[0].toUpperCase() + s.slice(1) : "—", "neutral"]; }
function crMoDonExport(rows) {
  crDownloadCsv("donations-" + new Date().toISOString().slice(0, 10),
    ["Reference", "Name", "Email", "Amount", "Currency", "Status", "Channel", "Started", "Paid"],
    rows.map(r => [r.reference, r.name, r.email, r.amount, r.currency, r.status, r.channel, r.createdAt, r.paidAt]));
}
function crMoDonOpen(ctx, r) {
  const st = crMoDonStatus(r.status);
  ctx.drawer({
    title: r.name || r.email || r.reference, name: r.name || r.email || "?", sub: r.reference,
    stats: [["Amount", fmtMoney(r.amount)], ["Status", st[0]], ["Channel", r.channel || "—"]],
    fields: [["Email", r.email], ["Currency", r.currency], ["Started", r.createdAt ? crDate(r.createdAt, true) : ""], ["Paid", r.paidAt ? crDate(r.paidAt, true) : "Not paid"]],
    actions: [],
  });
}
Object.assign(CR_TAB_DEFS, {
  donations: {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.donations(),
    actions: (d) => [{ l: "Export CSV", icon: "download-simple", primary: true, disabled: !(d.donations || []).length, why: "No donations to export yet.", run: () => crMoDonExport(d.donations || []) }],
    blocks: (d, ctx) => {
      const rows = d.donations || [];
      const paid = rows.filter(r => r.status === "paid");
      const out = [];
      if (!d.enabled) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn",
        text: "Donations are off. Nobody can give through the site until Paystack is set up.",
        sub: "Add the Paystack secret key under Settings → API keys (or paystack.secret in api/config.php), and point the Paystack webhook at /api/hooks/paystack.php.",
        act: ctx.can("settings") ? { l: "Add the Paystack key", run: () => ctx.go("settings", "keys") } : null });
      out.push({ type: "kpis", span: 6, items: [
        { l: "Raised", v: fmtMoney(d.totalPaid || 0), tone: "flat" },
        { l: "Paid gifts", v: crNum(paid.length) + (rows.length >= CR_MO_DON_CAP ? "+" : ""), tone: "flat" },
        { l: "Pending", v: crNum(rows.filter(r => r.status === "pending").length), tone: "flat" },
        { l: "Largest gift", v: paid.length ? fmtMoney(Math.max.apply(null, paid.map(r => +r.amount || 0))) : "—", tone: "flat" },
      ] });
      out.push({ type: "table", span: 6, title: "Gifts", nosel: true,
        sub: rows.length >= CR_MO_DON_CAP ? "The newest " + crNum(CR_MO_DON_CAP) + " are shown; the total raised counts every paid gift." : "Newest first",
        cols: ["Donor", { l: "Reference" }, { l: "Amount", num: true }, "Status", "When"],
        rows: rows.map(r => { const st = crMoDonStatus(r.status); const when = r.paidAt || r.createdAt; return { key: r.reference, open: () => crMoDonOpen(ctx, r), cells: [
          { k: "strong", t: r.name || r.email || "Anonymous", s: r.name ? r.email : "" },
          { k: "mono", t: r.reference },
          { k: "num", t: fmtMoney(r.amount), v: +r.amount || 0 },
          { k: "status", t: st[0], tone: st[1] },
          { k: "text", t: when ? crDate(when) : "—", s: when ? crAgo(when) : "" },
        ] }; }),
        search: "Search by donor, email or reference", filters: ["Status"],
        emptyText: d.enabled ? "No donations yet. Gifts made on the Donate page appear here once Paystack confirms them." : "No donations yet." });
      return out;
    },
  },
});

/* ══ Dues & arrears ═══════════════════════════════════════════════════════════
   v1 AdminFees, view by view. The view is the URL tail (ctx.sub), so a view is
   deep-linkable: "" who owes · training · fines · reminders · amounts, and
   "account/<memberId>" is one member's account. The ledger is a ledger: no
   entry is edited or deleted — a mistake is voided with its reason, a mercy is
   a waiver with its reason. Every number this tab enforces or states comes from
   the server's `bounds` (admin_fees_settings_get), never from this file. */
/* "fines" was a view here until fines got one home in Conduct & fines
   (cr-tab-conduct.jsx); /control/money/fees/fines is forwarded there by
   crResolve (cr-pages.jsx), because it is in bookmarks and in the guide. */
const CR_MO_VIEWS = [["", "Who owes"], ["training", "Training fees"], ["reminders", "Reminders"], ["amounts", "Amounts"]];
const CR_MO_KIND = { membership: "Membership fee", dues: "Monthly dues", training: "Training fee", fine: "Fine", adjustment: "Adjustment", payment: "Payment received", writeoff: "Written off", waiver: "Waived" };
const CR_MO_SETTING = { membershipFee: "Membership fee", monthlyDues: "Monthly dues", trainingFee: "Training fee" };
/* Mirrors FEES_FINE_REASONS on the server, which validates; this only names them. */
const CR_MO_FINE_REASONS = [["late", "Late arrival"], ["absent", "Missed a session without notice"], ["equipment", "Equipment lost or damaged"], ["conduct", "Conduct"], ["other", "Other (say why)"]];
const CR_MO_METHODS = [["cash", "Cash"], ["transfer", "Bank transfer"], ["pos", "POS"], ["other", "Other"]];
const CR_MO_ENTRY_ERR = {
  bad_amount: "Enter an amount above ₦0.", bad_reason: "Choose why this fine is being issued.",
  note_required: "Say why — this one needs a written reason.", reason_required: "Say why. It stays on the account.",
  nothing_outstanding: "There is nothing outstanding to waive.", bad_kind: "That is not something this screen can post.",
  already_done: "The MOU is already recorded as accomplished.", already_void: "That entry is already voided.",
  fees_disabled: "Dues are switched off, so nothing is charged.", reminders_disabled: "Reminders are switched off.",
  not_due: "The amounts were already raised inside the review period.",
};
function crMoErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code || e.message); return CR_MO_ENTRY_ERR[c] || crErr(e, fb); }
const CR_MO_TRAIN_FILTERS = [["all", "Everybody"], ["training", "In training"], ["service", "Serving"], ["complete", "Complete"], ["paused", "Credit paused"], ["stopped", "Credit stopped"], ["nojoin", "No join date"]];
const CR_MO_TRAIN_SORTS = [["charged", "Most charged"], ["remaining", "Most still to cover"], ["earned", "Most earned off"], ["month", "Furthest in"], ["name", "Name"]];
const crMoCtx = { current: null };
function crMoAcctId(sub) { const m = /^account\/(.+)$/.exec(sub || ""); return m ? decodeURIComponent(m[1]) : ""; }

/* ── Loading ── */
async function crMoLoadAccount(memberId) { return (await NGGApi.admin.fees.member(memberId)).account; }
/** After any write: the open account and the arrears, refetched quietly. */
async function crMoRefresh(ctx) {
  const d = ctx.data || {};
  const id = d.acct && d.acct.memberId;
  const [acct, arr] = await Promise.all([
    id ? crMoLoadAccount(id).catch(() => d.acct) : null,
    NGGApi.admin.fees.arrears(d.B && d.B.arrearsPage).catch(() => d.arr),
  ]);
  ctx.setData(x => Object.assign({}, x, { acct: acct || x.acct, arr: arr || x.arr, found: null, rev: (x.rev || 0) + 1 }));
}
async function crMoOpen(ctx, memberId) {
  try {
    const acct = await crMoLoadAccount(memberId);
    ctx.setData(x => Object.assign({}, x, { acct }));
    ctx.setSub("account/" + encodeURIComponent(memberId));
  } catch (e) { ctx.toast(crErr(e, "Couldn’t open that account."), null, true); }
}

/* ── Money entries: one form per kind, one submit path ── */
function crMoEntry(ctx, kind, acct) {
  const owed = acct.balance.outstanding;
  const titles = { payment: "Record a payment", fine: "Issue a fine", adjustment: "Adjust the account", waiver: "Waive what is owed" };
  ctx.form({
    title: titles[kind] + " · " + acct.fullName, submit: titles[kind], busyLabel: "Saving…",
    intro: kind === "waiver" ? "A waiver keeps the charge and records that you are not asking for it. Voiding says it should never have existed — that is a different thing."
      : kind === "adjustment" ? "An adjustment adds a one-off charge with a written reason. To take money off, record a payment or a waiver." : null,
    values: { amount: "", method: "cash", reference: "", reason: kind === "fine" ? "late" : "", note: "" },
    fields: [
      { id: "amount", l: "Amount (₦)", req: true, num: true, money: true, im: "numeric", max: 12,
        help: fmtMoney(owed) + " outstanding" + (kind === "waiver" && owed > 0 ? " — more than this is capped to it." : "."),
        check: v => { const n = parseInt(v, 10); return !(n > 0) ? "Enter an amount above ₦0." : ctx.data.B.amountMax && n > ctx.data.B.amountMax ? "At most " + fmtMoney(ctx.data.B.amountMax) + "." : ""; } },
      kind === "payment" ? { id: "method", l: "How it came", type: "chips", req: true, opts: CR_MO_METHODS } : null,
      kind === "payment" ? { id: "reference", l: "Reference", ph: "TRF-… or receipt no.", max: 120 } : null,
      kind === "fine" ? { id: "reason", l: "Why", type: "select", req: true, opts: CR_MO_FINE_REASONS } : null,
      /* Two shapes of one field: "Other" is the escape hatch, so it needs the written reason (crValidate checks only req on an empty value). */
      { id: "note", l: kind === "waiver" ? "Why it is being waived" : "Note", type: "textarea", rows: 2, max: 240, when: v => !(kind === "fine" && v.reason === "other"),
        req: kind === "waiver" || kind === "adjustment", ph: kind === "waiver" ? "Hard month at home — agreed with the coordinator" : "" },
      kind === "fine" ? { id: "note", l: "Say why", type: "textarea", rows: 2, max: 240, req: true, when: v => v.reason === "other" } : null,
    ].filter(Boolean),
    onSubmit: async v => {
      const amount = parseInt(v.amount, 10) || 0;
      let r, msg;
      try {
        if (kind === "payment") { r = await NGGApi.admin.fees.payment(acct.memberId, amount, v.method, v.reference.trim(), v.note.trim()); msg = fmtMoney(amount) + " recorded · " + acct.fullName; }
        else if (kind === "waiver") { r = await NGGApi.admin.fees.waive(acct.memberId, amount, v.note.trim()); msg = fmtMoney(r.waived) + " waived" + (r.clamped ? " — that was all that was outstanding." : "."); }
        else { r = await NGGApi.admin.fees.charge(acct.memberId, kind, amount, v.reason, v.note.trim()); msg = fmtMoney(amount) + " charged."; }
      } catch (e) {
        const c = e && ((e.data && e.data.error) || e.code);
        if (c === "bad_amount") return { fieldErrors: { amount: CR_MO_ENTRY_ERR.bad_amount } };
        if (c === "note_required" || c === "reason_required") return { fieldErrors: { note: CR_MO_ENTRY_ERR[c] } };
        throw Object.assign(new Error(c || "failed"), { data: { message: crMoErr(e, "Couldn’t post that. Nothing was written.") } });
      }
      await crMoRefresh(crMoCtx.current || ctx);
      if (r && r.overCap) ctx.toast("This account is now past the ceiling. Nothing further will accrue automatically.", null, true);
      return { msg };
    },
    done: (v, r) => r.overCap ? null : r.msg,
  });
}

/** "Record payment" from the header with no account open: name the member first. */
function crMoPayAnyone(ctx) {
  const d = ctx.data || {};
  if (d.acct && crMoAcctId(ctx.sub)) return crMoEntry(ctx, "payment", d.acct);
  ctx.form({
    title: "Record payment", submit: "Find the account", busyLabel: "Looking…",
    intro: "Payments are recorded against one member’s account. Type their name, member ID or email; if more than one member matches you’ll be asked for the ID.",
    fields: [{ id: "who", l: "Member", req: true, ph: "Name, member ID or email", max: 120 }],
    onSubmit: async v => {
      const q = v.who.trim();
      if (q.length < 2) return { fieldErrors: { who: "Type at least two letters." } };
      const r = await NGGApi.admin.fees.lookup(q);
      const ms = r.members || [];
      const exact = ms.filter(m => m.memberId.toLowerCase() === q.toLowerCase());
      const pick = exact.length === 1 ? exact[0] : ms.length === 1 ? ms[0] : null;
      if (!pick) return { fieldErrors: { who: !ms.length ? "Nobody matches “" + q + "”." : crNum(ms.length) + (r.truncated ? "+" : "") + " members match: " + ms.slice(0, 4).map(m => m.fullName + " (" + m.memberId + ")").join(", ") + (ms.length > 4 ? "…" : "") + ". Type the member ID." } };
      const acct = await crMoLoadAccount(pick.memberId);
      ctx.setData(x => Object.assign({}, x, { acct }));
      ctx.setSub("account/" + encodeURIComponent(pick.memberId));
      setTimeout(() => crMoEntry(crMoCtx.current || ctx, "payment", acct), 0);
      return null;
    },
    done: null,
  });
}

function crMoVoid(ctx, e) {
  ctx.closeDrawer();
  ctx.form({
    title: "Void this entry", submit: "Void it", busyLabel: "Voiding…",
    intro: "Voiding says the entry should never have existed; it stays on the account, struck through, with your reason. If the charge was real and you are choosing not to ask for it, waive it instead.",
    fields: [{ id: "reason", l: "Why is this being voided?", req: true, ph: "Charged twice", max: 240 }],
    onSubmit: async v => {
      try { await NGGApi.admin.fees.void(e.entryId, v.reason.trim()); }
      catch (x) { throw Object.assign(new Error("failed"), { data: { message: crMoErr(x, "Couldn’t void that entry.") } }); }
      await crMoRefresh(crMoCtx.current || ctx);
      return {};
    },
    done: "Voided · " + (CR_MO_KIND[e.kind] || e.kind) + " " + fmtMoney(e.amount),
  });
}
function crMoEntryOpen(ctx, e, acct) {
  const credit = e.direction !== "charge";
  ctx.drawer({
    title: (CR_MO_KIND[e.kind] || e.kind) + " · " + (credit ? "−" : "") + fmtMoney(e.amount), name: acct.fullName, sub: acct.fullName + " · " + (e.createdAt ? crDate(e.createdAt, true) : ""),
    stats: [["Amount", fmtMoney(e.amount)], ["Direction", credit ? "Credit" : "Charge"], ["State", e.void ? "Voided" : "Standing"]],
    fields: [["Kind", CR_MO_KIND[e.kind] || e.kind], ["Period", e.periodKey], ["Method", e.method], ["Reference", e.reference], ["Entry", e.entryId]],
    sections: [e.note ? { h: "Note", text: e.note } : null, e.void ? { h: "Voided", text: e.voidReason || "No reason recorded." } : null],
    actions: e.void ? [] : [{ l: "Void this entry", run: () => crMoVoid(ctx, e) }],
  });
}

async function crMoMou(ctx, acct) {
  const ok = await ctx.confirm({ title: "Mark the MOU accomplished?", cta: "Mark accomplished",
    body: "This writes off whatever is left of " + acct.fullName + "’s training fee and records today’s date. It can’t be undone from here." });
  if (!ok) return;
  try { const r = await NGGApi.admin.fees.mou(acct.memberId); ctx.toast(r.writtenOff > 0 ? fmtMoney(r.writtenOff) + " of training fee written off." : "MOU recorded. There was no training fee left to write off."); await crMoRefresh(ctx); }
  catch (e) { ctx.toast(crMoErr(e, "Couldn’t record the MOU."), null, true); }
}
async function crMoRemindOff(ctx, acct) {
  const off = !acct.remindOff;
  try {
    await NGGApi.admin.fees.remindOff(acct.memberId, off);
    await crMoRefresh(ctx);
    ctx.toast(off ? "Reminders stopped for this family." : "Reminders allowed again for this family.", async () => { try { await NGGApi.admin.fees.remindOff(acct.memberId, !off); await crMoRefresh(crMoCtx.current || ctx); } catch (e) { ctx.toast(crErr(e), null, true); } });
  } catch (e) { ctx.toast(crMoErr(e, "Couldn’t change that."), null, true); }
}

async function crMoAccrue(ctx) {
  const B = ctx.data.B;
  const ok = await ctx.confirm({ title: "Bring charges up to date?", cta: "Run",
    body: "Adds any membership fee, monthly dues and training fees that have not been charged yet, for up to " + crPlural(B.accrueBatch, "active member") + ". Safe to run twice — it cannot charge the same month twice." });
  if (!ok) return;
  try {
    const a = (await NGGApi.admin.fees.accrue(B.accrueBatch)).accrued;
    ctx.toast([crNum(a.dues) + " dues", crNum(a.training) + " training", crNum(a.membership) + " joining"].join(" · ") + " charged across " + crPlural(a.members, "member") + "."
      + (a.atCap ? " " + crPlural(a.atCap, "account") + " at the ceiling were not charged further." : "") + (a.noJoinDate ? " " + crPlural(a.noJoinDate, "member") + " with no join date were skipped." : ""), null, !!a.atCap);
    await crMoRefresh(ctx);
  } catch (e) { ctx.toast(crMoErr(e, "Couldn’t bring charges up to date."), null, true); }
}

/* ── Reminders: who, and how many, before the send ── */
async function crMoRemindPreview(ctx) {
  try { const r = await NGGApi.admin.fees.remindPreview(); ctx.setData(x => Object.assign({}, x, { prev: r.preview })); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t work out who is due a reminder."), null, true); }
}
async function crMoRemindSend(ctx) {
  const p = ctx.data.prev, n = (p && p.count) || 0;
  if (!n) return;
  const ok = await ctx.confirm({ title: "Send " + crPlural(n, "reminder") + "?", cta: "Send " + crNum(n),
    body: "This tells " + crPlural(n, "family", "families") + " about their outstanding balance — in the family app, by email and by Telegram, as set under Amounts. It can’t be recalled. Nobody will be reminded again for at least " + crPlural(p.everyDays, "day") + "." });
  if (!ok) return;
  try {
    const res = (await NGGApi.admin.fees.remindRun(ctx.data.B.remindBatch)).result || {};
    ctx.toast(crNum(res.sent) + " sent" + (res.failed ? " · " + crNum(res.failed) + " could not be delivered" : "") + ".", null, !!res.failed);
    await crMoRemindPreview(ctx);
  } catch (e) { ctx.toast(crMoErr(e, "Couldn’t send the reminders."), null, true); }
}

/* ── Notices before dues fall due (domain/dues-notices.php) ──
   Read on demand: the list walks every active member's account, so it is
   fetched when the Reminders view is opened, not on every Money visit. */
const CR_MO_NOTICE_KIND = { upcoming: "Before it falls due", arrears: "Arrears reminder", claim_ack: "Payment note received", claim_decided: "Payment note answered" };
const CR_MO_CHANNELS = [["app", "family app"], ["email", "email"], ["telegram", "Telegram"], ["sms", "SMS"]];
async function crMoNoticesLoad(ctx) {
  ctx.setData(x => Object.assign({}, x, { nvBusy: true, nvErr: "" }));
  try { const nv = await NGGApi.admin.fees.notices(); ctx.setData(x => Object.assign({}, x, { nv, nvBusy: false })); }
  catch (e) { ctx.setData(x => Object.assign({}, x, { nvBusy: false, nvErr: crErr(e, "Couldn’t load the notices.") })); }
}
async function crMoNoticesRun(ctx) {
  const nv = ctx.data.nv, n = ((nv && nv.coming) || []).filter(x => !x.told && x.tellOn <= nv.today).length;
  const ok = await ctx.confirm({ title: "Send today’s notices now?", cta: n ? "Send " + crNum(n) : "Send",
    body: (n ? crPlural(n, "family", "families") + " are due a notice today. " : "") + "The background job sends these on its own each day; this only sends them sooner. A family is never told twice about the same due date, so pressing this again sends nothing new." });
  if (!ok) return;
  try {
    const r = ((await NGGApi.admin.fees.noticesRun()) || {}).result || {};
    ctx.toast(crNum(r.upcoming || 0) + " told" + (r.unreachable ? " · " + crNum(r.unreachable) + " had no way to be reached" : "") + ".", null, !!r.unreachable);
    await crMoNoticesLoad(ctx);
  } catch (e) { ctx.toast(crMoErr(e, "Couldn’t send the notices."), null, true); }
}
function crMoChannelText(ch) { return CR_MO_CHANNELS.filter(c => ch && ch[c[0]] > 0).map(c => c[1] + (c[0] === "email" && ch.email > 1 ? " ×" + ch.email : "")).join(" · ") || "nobody reached"; }

/* ── Uprate: what it would do, then the press ── */
async function crMoUprate(ctx) {
  const up = ctx.data.up, ch = (up && up.changes) || {}, keys = Object.keys(ch);
  if (!keys.length) return;
  const ok = await ctx.confirm({ title: "Raise the amounts by " + up.pct + "%?", cta: "Raise the amounts",
    body: keys.map(k => (CR_MO_SETTING[k] || k) + ": " + fmtMoney(ch[k].from) + " → " + fmtMoney(ch[k].to)).join(" · ")
      + ". This changes what is charged from now on. Balances already on accounts are not touched, and it can’t be applied again for " + crPlural(up.everyMonths, "month") + "." });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.fees.uprateApply();
    ctx.toast(crPlural(Object.keys(r.applied || {}).length, "amount") + " raised by " + r.pct + "%.");
    ctx.reload();
  } catch (e) { ctx.toast(crMoErr(e, "Couldn’t raise the amounts."), null, true); ctx.reload(); }
}

/* ── The training-fee watch: the server filters, sorts and caps ── */
function crMoTrainServer() {
  return {
    sortKeys: {},
    fetch: async ({ q, filters, page, pageSize }) => {
      const r = await NGGApi.admin.fees.training({ filter: filters.filter || "all", sort: filters.sort || "charged", q, limit: 1000 });
      const c = crMoCtx.current;
      if (c) c.setData(x => Object.assign({}, x, { train: { totals: r.totals, counts: r.counts, perUnit: r.perUnit, basis: r.basis, trainingMonths: r.trainingMonths, serviceMonths: r.serviceMonths, scoped: r.scoped, truncated: r.truncated, matched: r.matched, shown: (r.rows || []).length } }));
      const rows = (r.rows || []).slice(page * pageSize, page * pageSize + pageSize);
      return {
        total: (r.rows || []).length,
        rows: rows.map(m => ({
          key: m.memberId, open: () => crMoOpen(crMoCtx.current, m.memberId),
          cells: [
            { k: "person", t: m.fullName, s: [m.displayId || m.memberId, m.centre].filter(Boolean).join(" · ") },
            { k: "text", t: m.phase === "unknown" ? "No join date" : "Month " + m.months + " · " + m.phase + (m.phase === "service" ? " · " + m.servedMonths + " served" : ""),
              s: [m.mouAt ? "MOU done" : "", m.creditStopped ? "Credit stopped " + crDate(m.creditPausedAt) : m.creditPausedAt ? "Credit paused from " + crDate(m.creditPausedAt) : ""].filter(Boolean).join(" · ") },
            { k: "num", t: fmtMoney(m.charged), v: m.charged },
            { k: "progress", pct: m.coveredPct, t: fmtMoney(m.covered) + " · " + m.coveredPct + "%" },
            { k: "num", t: m.remaining > 0 ? fmtMoney(m.remaining) : "—", v: m.remaining },
          ],
        })),
      };
    },
  };
}

/* ── The views ── */
function crMoSwitcher(ctx, view) {
  /* custom: a view switcher bound to the URL tail. No block switches between
     sub-views of one tab; CrSeg is the shell's own control. */
  const pick = v => { ctx.closeDrawer(); ctx.setSub(v); if (v === "reminders" && !(ctx.data && ctx.data.nv)) crMoNoticesLoad(ctx); };
  /* Five segments do not fit a phone's width; there it is the field's own select. */
  return { type: "custom", span: 6, render: (c, phone) => phone
    ? <select className="cr-select" aria-label="Dues view" value={view} onChange={e => pick(e.target.value)}>{CR_MO_VIEWS.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
    : <CrSeg label="Dues view" value={view} options={CR_MO_VIEWS} onChange={pick}/> };
}

function crMoAccountBlocks(d, ctx) {
  const a = d.acct, b = a.balance, t = b.tenure || {};
  const out = [];
  out.push({ type: "kpis", span: 6, title: a.fullName + "’s account", sub: [a.memberId, a.centre, a.status && a.status !== "active" ? a.status : ""].filter(Boolean).join(" · "),
    action: "Back to the list", onAction: () => ctx.setSub(""), items: [
    { l: "Payable now", v: fmtMoney(b.payable), tone: "flat" }, { l: "Charged", v: fmtMoney(b.charged), tone: "flat" },
    { l: "Received", v: fmtMoney(b.credited), tone: "flat" }, { l: "Training earned off", v: fmtMoney(b.trainingEarned), tone: "flat" },
  ] });
  out.push({ type: "note", span: 6, icon: "calendar-blank",
    text: (t.phase === "unknown" ? "No join date on this record, so the three-year clock can’t be worked out."
      : "Month " + t.months + " of " + ((t.trainingMonths || 0) + (t.serviceMonths || 0)) + " — currently in " + t.phase + "." + (t.phase === "service" ? " " + t.servedMonths + " of " + t.serviceMonths + " service months served." : ""))
      + (b.mouAt ? " MOU accomplished " + crDate(b.mouAt) + "." : ""),
    sub: [a.guardian && a.guardian.name ? "Guardian " + a.guardian.name + (a.guardian.phone ? " · " + crMask(a.guardian.phone) : "") : "", a.remindOff ? "Reminders are off for this family" : "", b.atCap ? "At the ceiling — nothing further accrues" : ""].filter(Boolean).join(" · ") });
  /* custom: TrainingFeeWatch (components.jsx) is the one training-fee schedule
     renderer, shared with the member's own dashboard. */
  if (a.training) out.push({ type: "custom", span: 6, render: () => <TrainingFeeWatch w={a.training} audience="staff"/> });
  out.push({ type: "table", span: 6, title: "Ledger", sub: "Newest first · open an entry to void it", nosel: true,
    cols: ["What", { l: "When" }, { l: "Amount", num: true }, "State"],
    rows: (a.entries || []).map(e => ({ key: e.entryId, open: () => crMoEntryOpen(ctx, e, a), cells: [
      { k: "text", t: (CR_MO_KIND[e.kind] || e.kind) + (/^\d{4}-\d{2}$/.test(e.periodKey || "") ? " " + e.periodKey : ""), s: e.void ? "Voided — " + (e.voidReason || "") : e.note },
      { k: "text", t: e.createdAt ? crDate(e.createdAt) : "—" },
      { k: "num", t: (e.direction === "charge" ? "" : "−") + fmtMoney(e.amount), v: (e.direction === "charge" ? 1 : -1) * e.amount },
      { k: "status", t: e.void ? "Voided" : e.direction === "charge" ? "Charge" : "Credit", tone: e.void ? "neutral" : e.direction === "charge" ? "warn" : "ok" },
    ] })),
    search: "Search the ledger", filters: ["State"], emptyText: "Nothing on this account yet. Charges appear when dues are brought up to date." });
  return out;
}

function crMoOwesBlocks(d, ctx) {
  const arr = d.arr || {}, rows = arr.arrears || [], out = [];
  out.push({ type: "kpis", span: 6, items: [
    { l: "Payable", v: fmtMoney(arr.totalPayable || 0), tone: "flat" },
    { l: "Members owing", v: crNum(arr.matched || 0), tone: "flat" },
    { l: "At the ceiling", v: crNum(rows.filter(r => r.atCap).length), tone: "flat" },
    { l: "Reminders off", v: crNum(rows.filter(r => r.remindOff).length), tone: "flat" },
  ] });
  /* custom: a lookup for ANY account, including people who owe nothing — the
     arrears list cannot answer "has Ada paid?". admin_fees_lookup is a search,
     not a list, so it is a search box here rather than a second table filter. */
  out.push({ type: "custom", span: 6, render: () => <CrMoLookup ctx={ctx}/> });
  if (d.found) {
    const f = d.found;
    out.push({ type: "table", span: 6, title: "Accounts matching “" + f.q + "”", nosel: true,
      sub: f.truncated ? "First " + crNum(f.max) + " matches — narrow it to see the rest." : crPlural((f.members || []).length, "match", "matches"),
      action: "Clear", onAction: () => ctx.setData(x => Object.assign({}, x, { found: null })),
      cols: ["Member", "Centre", { l: "Payable", num: true }, { l: "Charged", num: true }, { l: "Received", num: true }],
      rows: (f.members || []).map(m => ({ key: "f" + m.memberId, open: () => crMoOpen(ctx, m.memberId), cells: [
        { k: "person", t: m.fullName, s: m.memberId + " · " + (m.type === "Summer" ? "Summer School" : m.type || "NGG") },
        { k: "text", t: m.centre || "—" },
        { k: "num", t: m.payable > 0 ? fmtMoney(m.payable) : "Nothing owed", v: m.payable },
        { k: "num", t: fmtMoney(m.charged), v: m.charged }, { k: "num", t: fmtMoney(m.credited), v: m.credited },
      ] })),
      emptyText: f.tooShort ? "Type at least two letters." : "Nobody matches “" + f.q + "”." });
  }
  out.push({ type: "table", span: 6, title: "Who owes", nosel: true,
    sub: "Ranked by what is payable — a training fee on course to be written off is not money owed." + (arr.truncated ? " Showing the first " + crNum(rows.length) + " of " + crNum(arr.matched) + "." : ""),
    action: rows.length ? "Download CSV" : null, onAction: () => crDownloadCsv("arrears-" + new Date().toISOString().slice(0, 10),
      ["Member ID", "Name", "Centre", "Payable", "Outstanding", "Training earned off", "Phase", "At ceiling", "Reminders off"],
      rows.map(r => [r.memberId, r.fullName, r.centre, r.payable, r.outstanding, r.trainingEarned, r.phase, r.atCap ? "yes" : "", r.remindOff ? "yes" : ""])),
    cols: ["Member", "Centre", { l: "Payable", num: true }, { l: "Training earned off", num: true }, "Phase"],
    rows: rows.map(r => ({ key: r.memberId, open: () => crMoOpen(ctx, r.memberId), cells: [
      { k: "person", t: r.fullName, s: r.memberId },
      { k: "text", t: r.centre || "—" },
      { k: "num", t: fmtMoney(r.payable) + (r.atCap ? " · at ceiling" : ""), v: r.payable },
      { k: "num", t: r.trainingEarned > 0 ? "−" + fmtMoney(r.trainingEarned) : "—", v: r.trainingEarned },
      { k: "text", t: r.phase ? r.phase[0].toUpperCase() + r.phase.slice(1) : "—", s: r.remindOff ? "Reminders off" : "" },
    ] })),
    search: "Search by name or ID", filters: ["Centre", "Phase"],
    emptyText: "Nobody is in arrears. Find any account above to see what someone has paid." });
  return out;
}
function CrMoLookup({ ctx }) {
  const [q, setQ] = React.useState((ctx.data.found && ctx.data.found.q) || "");
  const [busy, setBusy] = React.useState(false);
  const run = async e => {
    e.preventDefault();
    const t = q.trim();
    if (!t) { ctx.setData(x => Object.assign({}, x, { found: null })); return; }
    setBusy(true);
    try { const r = await NGGApi.admin.fees.lookup(t); ctx.setData(x => Object.assign({}, x, { found: r })); }
    catch (x) { ctx.toast(crErr(x, "Couldn’t search the accounts."), null, true); }
    finally { setBusy(false); }
  };
  return (
    <form role="search" className="cr-tbar" onSubmit={run}>
      <span className="cr-searchbox"><CrIcon n="magnifying-glass"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find any account by name, ID or email" aria-label="Find any account"/></span>
      <button type="submit" className="cr-btn is-sm" disabled={busy}>{busy ? "Finding…" : "Find"}</button>
    </form>
  );
}

function crMoTrainingBlocks(d, ctx) {
  const t = d.train, out = [];
  if (t) {
    const tt = t.totals || {};
    out.push({ type: "note", span: 6, icon: "graduation-cap",
      text: crPlural(tt.members || 0, "member") + " shown · " + fmtMoney(tt.charged || 0) + " charged as training · " + fmtMoney((tt.earned || 0) + (tt.writtenOff || 0)) + " covered by service (" + fmtMoney(tt.earned || 0) + " earned, " + fmtMoney(tt.writtenOff || 0) + " written off) · " + fmtMoney(tt.remaining || 0) + " still to cover.",
      sub: "Charged at " + fmtMoney(t.perUnit) + " per " + (t.basis === "day" ? "programme day" : t.basis) + " for the first " + t.trainingMonths + " months; covered over the " + t.serviceMonths + " months of service." + (t.scoped ? " Your centres only." : "") + (t.truncated ? " Showing the first " + crNum(t.shown) + " of " + crNum(t.matched) + "." : "") });
  }
  const counts = (t && t.counts) || {};
  out.push({ type: "table", span: 6, title: "Training fee by member", nosel: true, server: d.trainServer, search: "Name, ID or centre",
    cols: ["Member", "Where they are", { l: "Charged", num: true }, "Covered", { l: "Still to cover", num: true }],
    filters: [
      { id: "filter", l: "Show", opts: CR_MO_TRAIN_FILTERS.map(f => ({ v: f[0], l: f[1], n: counts[f[0]] })) },
      { id: "sort", l: "Sort", opts: CR_MO_TRAIN_SORTS.map(f => ({ v: f[0], l: f[1] })) },
    ],
    emptyText: "Nobody is carrying a training fee yet." });
  return out;
}

/* Before it falls due: who will be told, on which day, by which channels; what went; the payment notes waiting. */
function crMoNoticeBlocks(d, ctx) {
  const cfg = d.cfg, nv = d.nv, out = [];
  if (d.nvErr) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: d.nvErr, act: { l: "Try again", run: () => crMoNoticesLoad(ctx) } }];
  if (!nv) return [{ type: "note", span: 6, icon: "hourglass", text: d.nvBusy ? "Working out who will be told before their dues fall due…" : "Notices before dues fall due.",
    act: d.nvBusy ? null : { l: "Show who will be told", run: () => crMoNoticesLoad(ctx) } }];
  const S = nv.settings || {}, ch = S.channels || {}, av = S.available || {};
  const on = CR_MO_CHANNELS.filter(c => ch[c[0]]).map(c => c[1]);
  const off = CR_MO_CHANNELS.filter(c => !ch[c[0]] && av[c[0]] === false).map(c => c[1]);
  if (!cfg.enabled || !S.noticeEnabled) {
    out.push({ type: "note", span: 6, icon: "bell-slash", tone: "warn", text: "Families are not told before their dues fall due.",
      sub: !cfg.enabled ? "Dues themselves are switched off." : "Turn “Tell families before dues fall due” on under Amounts.", act: { l: "Open Amounts", run: () => ctx.setSub("amounts") } });
  } else {
    const coming = nv.coming || [], today = coming.filter(x => !x.told && x.tellOn <= nv.today).length;
    const last = nv.lastRun && nv.lastRun.doneOn ? "Last daily run " + crDate(nv.lastRun.doneOn) + (nv.lastRun.told != null ? " — " + crPlural(nv.lastRun.told, "family", "families") + " told." : ".") : "The daily run has not happened yet.";
    out.push({ type: "note", span: 6, icon: "calendar-check", tone: today ? "gold" : "ok",
      text: "Families are told " + crPlural(S.daysBefore, "day") + " before dues and renewals fall due, by " + (on.join(", ") || "no channel") + ".",
      sub: last + (off.length ? " Not available on this site: " + off.join(", ") + "." : "") + " Every linked guardian is told, once per due date; a family paid ahead, or who asked not to be chased, is not.",
      act: today ? { l: "Send today’s " + crNum(today) + " now", run: () => crMoNoticesRun(ctx) } : { l: "Refresh", run: () => crMoNoticesLoad(ctx) } });
    const claims = nv.claims || {};
    out.push({ type: "kpis", span: 6, items: [
      { l: "To be told in 14 days", v: crNum(coming.filter(x => !x.told).length) },
      { l: "Already told", v: crNum(coming.filter(x => x.told).length) },
      { l: "Coming due", v: fmtMoney(coming.reduce((a, x) => a + (x.amount || 0), 0)) },
      { l: "Payment notes waiting", v: crNum(claims.open || 0), dn: claims.oldest ? "oldest " + crDate(claims.oldest) : "" },
    ] });
    if (claims.open) out.push({ type: "note", span: 6, icon: "currency-ngn", tone: "warn",
      text: crPlural(claims.open, "payment note") + " from families " + (claims.open === 1 ? "is" : "are") + " waiting to be checked.",
      sub: "The family was told at once that it arrived and will hear the answer in the family app. The Fees desk is nudged once a day when one waits longer than " + crPlural(S.claimStaffHours, "hour") + ".",
      act: ctx.can("people") ? { l: "Open Member requests", run: () => ctx.go("inbox", "requests") } : null });
    out.push({ type: "table", span: 6, title: "Coming up", nosel: true,
      cols: ["Member", "What", { l: "Amount", num: true }, "Due", "Told", "Reaches"],
      rows: coming.map(x => ({ key: x.memberId + x.dueOn, open: () => crMoOpen(ctx, x.memberId), cells: [
        { k: "person", t: x.fullName, s: x.centre }, { k: "text", t: x.what }, { k: "num", t: fmtMoney(x.amount), v: x.amount },
        { k: "text", t: crDate(x.dueOn) },
        x.told ? { k: "status", tone: "ok", t: "Told " + crDate(x.told) } : { k: "status", tone: x.tellOn <= nv.today ? "gold" : "neutral", t: x.tellOn <= nv.today ? "Today" : "On " + crDate(x.tellOn) },
        { k: "text", t: [x.reach.app ? crPlural(x.reach.app, "app") : "", x.reach.email ? crPlural(x.reach.email, "email") : "", x.reach.phones ? crPlural(x.reach.phones, "phone") : ""].filter(Boolean).join(" · ") || "No way to reach them",
          s: !x.reach.app && !x.reach.email && !x.reach.phones ? "Add a guardian or a parent email" : "" },
      ] })), search: "Search", emptyText: "Nothing falls due for anyone in the next fortnight." });
  }
  out.push({ type: "table", span: 6, title: "Sent to families", nosel: true,
    cols: ["Member", "Notice", { l: "Amount", num: true }, "Reached", "When"],
    rows: (nv.history || []).map((h, i) => ({ key: h.memberId + h.at + i, open: () => crMoOpen(ctx, h.memberId), cells: [
      { k: "person", t: h.fullName, s: h.memberId }, { k: "text", t: h.title, s: CR_MO_NOTICE_KIND[h.kind] || h.kind },
      { k: "num", t: h.amount ? fmtMoney(h.amount) : "—", v: h.amount },
      h.status === "sent" ? { k: "text", t: crMoChannelText(h.channels) } : { k: "status", tone: "bad", t: "Nobody reached" },
      { k: "text", t: crDate(h.at) },
    ] })), search: "Search", emptyText: "Nothing has been sent to families yet." });
  return out;
}

function crMoRemindBlocks(d, ctx) {
  const cfg = d.cfg, p = d.prev, out = crMoNoticeBlocks(d, ctx);
  if (!cfg.enabled || !cfg.remindEnabled) {
    out.push({ type: "note", span: 6, icon: "bell-slash", tone: "warn", text: "Arrears reminders (money already owed) are switched off.",
      sub: !cfg.enabled ? "Dues themselves are switched off." : "Turn them on under Amounts to start.", act: { l: "Open Amounts", run: () => ctx.setSub("amounts") } });
    return out;
  }
  out.push({ type: "note", span: 6, icon: "bell",
    text: "Arrears — money already owed: reminders go out automatically, at most once every " + crPlural(cfg.remindEveryDays, "day") + " per family.",
    sub: "The background job checks far more often than that; the spacing decides, so nobody is chased faster than you set it. A family is only included when they have something payable — a training fee that service is writing off is not money owed.",
    act: { l: p ? "Refresh" : "See who would be reminded", run: () => crMoRemindPreview(ctx) } });
  if (p) {
    const s = p.skipped || {};
    const why = [[s.nothingPayable, "nothing payable"], [s.tooSoon, "reminded recently"], [s.optedOut, "asked not to be reminded"], [s.underMinimum, "under the minimum balance"], [s.noContact, "no way to reach the family (no app account, email or phone)"]]
      .filter(x => x[0] > 0).map(x => crNum(x[0]) + " " + x[1]).join(" · ");
    out.push({ type: "note", span: 6, icon: p.count ? "paper-plane-tilt" : "check-circle", tone: p.count ? "gold" : "ok",
      text: crPlural(p.count, "family", "families") + " due a reminder now.",
      sub: "Not included: " + (why || "nobody — everyone with a balance is on the list") + ".",
      act: p.count ? { l: "Send " + crNum(p.count), run: () => crMoRemindSend(ctx) } : null });
    if (p.count) out.push({ type: "table", span: 6, title: "Due a reminder", nosel: true,
      cols: ["Member", { l: "Payable", num: true }, "Last reminded"],
      rows: (p.due || []).map(x => ({ key: x.memberId, open: () => crMoOpen(ctx, x.memberId), cells: [
        { k: "person", t: x.fullName, s: x.memberId }, { k: "num", t: fmtMoney(x.payable), v: x.payable },
        { k: "text", t: x.lastRemindedAt ? crDate(x.lastRemindedAt) : "Never" },
      ] })), search: "Search", emptyText: "Nobody is due." });
  }
  return out;
}

/* The settings form block is made ONCE per settings load and kept in data:
   CrFormBlock resets its edits whenever its block object changes. */
function crMoAmountsForm(cfg, B, defaults) {
  const int = (min, max) => v => { const n = Number(v); return v === "" || !Number.isInteger(n) ? "Enter a whole number." : n < min ? "At least " + crNum(min) + "." : max != null && n > max ? "At most " + crNum(max) + "." : ""; };
  const money = int(0, B.amountMax);
  const basis = cfg.trainingBasis || "session";
  return {
    type: "form", span: 6, key: "fees-amounts",
    groups: [
      { h: "Dues and fees", help: "What is charged, and when. Charges already on accounts never change when these do.", rows: [
        { id: "enabled", l: "Charge dues and fees", c: "toggle", value: !!cfg.enabled, help: "Off: nothing is charged and nobody is reminded." },
        { id: "membershipFee", l: "Membership fee (₦)", c: "input", type: "number", im: "numeric", value: String(cfg.membershipFee), check: money,
          help: cfg.membershipEveryMonths > 0 ? "Charged on the anniversary of joining, every " + (cfg.membershipEveryMonths === 12 ? "year" : cfg.membershipEveryMonths + " months") + "." : "Charged once, when a member joins." },
        { id: "membershipEveryMonths", l: "…how often, in months", c: "input", type: "number", im: "numeric", value: String(cfg.membershipEveryMonths), check: int(0, B.phaseMax), help: "12 is yearly. 0 charges it once, on joining, and never again." },
        { id: "monthlyDues", l: "Monthly dues (₦)", c: "input", type: "number", im: "numeric", value: String(cfg.monthlyDues), check: money, help: "Charged for each month a member has been active." },
        { id: "trainingBasis", l: "Training fee is charged", c: "select", value: basis, opts: [["session", "Once per session"], ["day", "For every day the programme meets"], ["week", "For every week the programme meets"]],
          help: "By the day or week uses the weekdays, holidays and extra days set in Conduct & fines. A session already charged as a whole is never also charged by the day." },
        { id: "trainingFee", l: basis === "day" ? "Training fee, per meeting day (₦)" : basis === "week" ? "Training fee, per week (₦)" : "Training fee, per session (₦)", c: "input", type: "number", im: "numeric", value: String(cfg.trainingFee), check: money,
          help: "Charged while they are in the training half. Written off in full once the MOU is accomplished." },
        { id: "trainingMonths", l: "Training months", c: "input", type: "number", im: "numeric", value: String(cfg.trainingMonths), check: int(B.phaseMin, B.phaseMax) },
        { id: "serviceMonths", l: "Service months", c: "input", type: "number", im: "numeric", value: String(cfg.serviceMonths), check: int(B.phaseMin, B.phaseMax),
          help: "Service is what earns the training fee off, a month at a time." },
        { id: "balanceCap", l: "Stop charging at (₦)", c: "input", type: "number", im: "numeric", value: String(cfg.balanceCap), check: money,
          help: "A ceiling on one member’s balance; once reached nothing further accrues. 0 means no ceiling — an account that grows past what anyone can pay pushes a family out of the programme." },
      ] },
      { h: "Before dues fall due", help: "Families hear what is coming, how much and how to pay, before it is owed — once per due date, to every linked guardian.", rows: [
        { id: "noticeEnabled", l: "Tell families before dues fall due", c: "toggle", value: !!cfg.noticeEnabled },
        { id: "noticeDaysBefore", l: "How many days before", c: "input", type: "number", im: "numeric", value: String(cfg.noticeDaysBefore), check: int(B.noticeDaysMin, B.noticeDaysMax),
          help: "Between " + B.noticeDaysMin + " and " + B.noticeDaysMax + ". A week gives a family a pay day to plan around." },
        { id: "noticeApp", l: "In the family app", c: "toggle", value: !!cfg.noticeApp, help: "Every linked guardian’s notices, and the member’s own portal." },
        { id: "noticeEmail", l: "By email", c: "toggle", value: !!cfg.noticeEmail, help: "Each guardian’s email and the parent email on the record." },
        { id: "noticeTelegram", l: "By Telegram", c: "toggle", value: !!cfg.noticeTelegram, help: "To a guardian whose phone is linked to the NGG Telegram bot." },
        { id: "noticeSms", l: "By SMS", c: "toggle", value: !!cfg.noticeSms, help: "One text per family, only when Telegram did not reach them. Each text costs money." },
        { id: "claimStaffHours", l: "Nudge the Fees desk when a payment note waits (hours)", c: "input", type: "number", im: "numeric", value: String(cfg.claimStaffHours), check: int(B.claimHoursMin, B.claimHoursMax),
          help: "A family told “we will check it” should not wait longer than this. Once a day, staff with Fees are told how many are waiting." },
      ] },
      { h: "Paying online", help: "Paystack takes a charge on every online payment. With this on, the family pays it on top, worked out so NGG receives the whole amount; the receipt shows it as Paystack’s charge, and the account records only the dues. A bank transfer to NGG carries no charge. Match the figures to your Paystack plan.", rows: [
        { id: "payFeeOn", l: "Families pay Paystack’s charge", c: "toggle", value: !!cfg.payFeeOn, help: "Off: NGG absorbs it and receives the amount less Paystack’s charge." },
        { id: "payFeePct", l: "Paystack’s percentage (%)", c: "input", type: "text", im: "decimal", value: String((cfg.payFeeBps || 0) / 100),
          check: v => { const n = Number(v); return v === "" || !isFinite(n) || n < 0 ? "Enter a percentage, like 1.5." : n * 100 > B.payFeeBpsMax ? "At most " + B.payFeeBpsMax / 100 + "%." : Math.round(n * 100) !== n * 100 ? "Two decimal places at most." : ""; } },
        { id: "payFeeFlat", l: "Plus a flat charge of (₦)", c: "input", type: "number", im: "numeric", value: String(cfg.payFeeFlat), check: int(0, B.payFeeFlatMax) },
        { id: "payFeeFlatUnder", l: "…waived on payments under (₦)", c: "input", type: "number", im: "numeric", value: String(cfg.payFeeFlatUnder), check: int(0, B.payFeeCapMax * 100) },
        { id: "payFeeCap", l: "Paystack’s charge is capped at (₦)", c: "input", type: "number", im: "numeric", value: String(cfg.payFeeCap), check: int(0, B.payFeeCapMax), help: "0 means no cap." },
      ] },
      { h: "Arrears reminders", rows: [
        { id: "remindEnabled", l: "Remind guardians about arrears", c: "toggle", value: !!cfg.remindEnabled },
        { id: "remindEveryDays", l: "No more often than every (days)", c: "input", type: "number", im: "numeric", value: String(cfg.remindEveryDays), check: int(B.remindMinDays, B.remindMaxDays),
          help: "The minimum is " + B.remindMinDays + " — a family reminded daily stops reading anything you send, and your sender gets blocked." },
      ] },
      { h: "Keeping up with inflation", help: "Only the " + (B.uprateFields || []).map(f => (CR_MO_SETTING[f] || f).toLowerCase()).join(", ") + " move, rounded to the nearest " + fmtMoney(B.uprateRound) + ". Charges already on an account stay exactly as they were. Fines are not included — they are set in Conduct & fines.", rows: [
        { id: "upratePct", l: "Raise amounts by (%)", c: "input", type: "number", im: "numeric", value: String(cfg.upratePct), check: int(0, B.uprateMaxPct), help: "0 switches it off. At most " + B.uprateMaxPct + "% at a time." },
        { id: "uprateEveryMonths", l: "No more often than every (months)", c: "input", type: "number", im: "numeric", value: String(cfg.uprateEveryMonths), check: int(B.uprateEveryMin, B.uprateEveryMax),
          help: (defaults.uprateEveryMonths || B.uprateEveryMax) + " is a yearly review." },
      ] },
    ],
    save: async patch => {
      const send = {};
      Object.keys(patch).forEach(k => { send[k] = typeof patch[k] === "boolean" || k === "trainingBasis" ? patch[k] : parseInt(patch[k], 10); });
      /* The percentage is typed as a percentage and stored in basis points (1.5% → 150). */
      if (patch.payFeePct != null) { delete send.payFeePct; send.payFeeBps = Math.round(Number(patch.payFeePct) * 100); }
      const r = await NGGApi.admin.fees.settingsSet(send);
      const c = crMoCtx.current;
      /* Said out loud when the server floors it, rather than showing a number nobody typed. */
      if (send.remindEveryDays != null && r.fees.remindEveryDays !== send.remindEveryDays && c) setTimeout(() => c.toast("Reminder spacing raised to the " + r.fees.remindEveryDays + "-day minimum."), 4200);
      if (c) c.reload();
    },
  };
}

function crMoAmountsBlocks(d, ctx) {
  const up = d.up, out = [d.amountsForm];
  if (!up) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "Couldn’t check whether a raise is due.", act: { l: "Try again", run: () => ctx.reload() } });
  else if (!up.enabled) out.push({ type: "note", span: 6, icon: "trend-up", text: "Raising the amounts with inflation is switched off.", sub: "Set a percentage above and save to use it." });
  else {
    const keys = Object.keys(up.changes || {});
    out.push({ type: "note", span: 6, icon: "trend-up", tone: up.due && keys.length ? "gold" : undefined,
      text: (up.lastAt ? "Last raised " + crDate(up.lastAt) + (up.monthsSince != null ? " · " + crPlural(up.monthsSince, "month") + " ago." : ".") : "Never raised.") + " "
        + (up.due ? "A raise of " + up.pct + "% is due now." : "Not due for another " + crPlural(Math.max(0, up.everyMonths - (up.monthsSince || 0)), "month") + "."),
      sub: keys.length ? "Only an admin’s press applies it — never the nightly job, and never to a balance already charged." : "Nothing to raise — no amount is set.",
      act: up.due && keys.length ? { l: "Raise the amounts", run: () => crMoUprate(ctx) } : null });
    if (keys.length) out.push({ type: "table", span: 6, title: "What a raise of " + up.pct + "% would do", nosel: true,
      cols: ["Amount", { l: "Now", num: true }, { l: "Would become", num: true }],
      rows: keys.map(k => ({ key: k, cells: [{ k: "text", t: CR_MO_SETTING[k] || k }, { k: "num", t: fmtMoney(up.changes[k].from), v: up.changes[k].from }, { k: "num", t: fmtMoney(up.changes[k].to), v: up.changes[k].to }] })) });
  }
  return out;
}

Object.assign(CR_TAB_DEFS, {
  fees: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const [s, up] = await Promise.all([NGGApi.admin.fees.settings(), NGGApi.admin.fees.upratePreview().catch(() => null)]);
      const B = s.bounds || {};
      const arr = await NGGApi.admin.fees.arrears(B.arrearsPage);
      const id = crMoAcctId(ctx.sub);
      const acct = id ? await crMoLoadAccount(id).catch(() => null) : null;
      const prev = ctx.data && ctx.data.prev;
      const nv = ctx.sub === "reminders" ? await NGGApi.admin.fees.notices().catch(() => null) : (ctx.data && ctx.data.nv) || null;
      const d = { cfg: s.fees, B, defaults: s.defaults || {}, arr, acct, rev: 0,
        up: up ? Object.assign({}, up.uprate, { maxPct: up.maxPct }) : null,
        prev: prev || null, nv, nvErr: ctx.sub === "reminders" && !nv ? "Couldn’t load the notices." : "", trainServer: crMoTrainServer() };
      d.amountsForm = crMoAmountsForm(d.cfg, B, d.defaults);
      return d;
    },
    actions: (d, ctx) => {
      crMoCtx.current = ctx;
      const id = crMoAcctId(ctx.sub), a = id && d.acct && d.acct.memberId === id ? d.acct : null;
      const out = [{ l: "Record payment", icon: "currency-ngn", primary: true, run: () => crMoPayAnyone(ctx) }];
      if (a) {
        out.push({ l: "Issue a fine", icon: "gavel", run: () => crMoEntry(ctx, "fine", a) });
        out.push({ l: "Waive", icon: "hand-heart", disabled: a.balance.outstanding <= 0, why: "Nothing outstanding to waive.", run: () => crMoEntry(ctx, "waiver", a) });
        out.push({ l: "Adjust", icon: "plus-minus", run: () => crMoEntry(ctx, "adjustment", a) });
        if (!a.balance.mouAt) out.push({ l: "Mark MOU accomplished", icon: "seal-check", run: () => crMoMou(ctx, a) });
        out.push({ l: a.remindOff ? "Allow reminders" : "Stop reminders", icon: a.remindOff ? "bell" : "bell-slash", run: () => crMoRemindOff(ctx, a) });
        out.push({ l: "Back to the list", icon: "arrow-left", run: () => ctx.setSub("") });
        return out;
      }
      out.push({ l: "Bring charges up to date", icon: "arrows-clockwise", disabled: !d.cfg.enabled, why: "Dues are switched off — nothing is charged.", run: () => crMoAccrue(ctx) });
      return out;
    },
    blocks: (d, ctx) => {
      crMoCtx.current = ctx;
      const id = crMoAcctId(ctx.sub);
      if (id) {
        if (d.acct && d.acct.memberId === id) return crMoAccountBlocks(d, ctx);
        return [{ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "Couldn’t open that account. It may be outside your centres, or no longer exist.", act: { l: "Back to the list", run: () => ctx.setSub("") } }];
      }
      const view = CR_MO_VIEWS.some(v => v[0] === ctx.sub) ? ctx.sub : "";
      const out = [crMoSwitcher(ctx, view)];
      if (!d.cfg.enabled) out.push({ type: "note", span: 6, icon: "pause-circle", tone: "warn", text: "Dues are switched off — nothing is being charged.", act: view !== "amounts" ? { l: "Open Amounts", run: () => ctx.setSub("amounts") } : null });
      const up = d.up;
      if (up && up.enabled && up.due && Object.keys(up.changes || {}).length && view !== "amounts")
        out.push({ type: "note", span: 6, icon: "trend-up", tone: "gold", text: "Amounts last raised " + (up.lastAt ? crPlural(up.monthsSince, "month") + " ago" : "never") + " — a review is due.", act: { l: "Review the amounts", run: () => ctx.setSub("amounts") } });
      const body = view === "training" ? crMoTrainingBlocks(d, ctx) : view === "reminders" ? crMoRemindBlocks(d, ctx) : view === "amounts" ? crMoAmountsBlocks(d, ctx) : crMoOwesBlocks(d, ctx);
      return out.concat(body);
    },
    facts: d => "Payable " + fmtMoney((d.arr && d.arr.totalPayable) || 0) + " across " + crPlural((d.arr && d.arr.matched) || 0, "member") + ". Dues " + (d.cfg.enabled ? "on" : "off") + "; monthly dues " + fmtMoney(d.cfg.monthlyDues) + ", training fee " + fmtMoney(d.cfg.trainingFee) + ".",
  },
});

/* ── Membership payments ─────────────────────────────────────────────────────
   Joining invoices (domain/membership-pay.php): what each accepted NGG member
   was asked to pay, whether Paystack or an offline payment settled it, and the
   offline payments waiting on a SECOND member of staff to check them against
   their evidence. The server enforces every rule (exact amount, a reference
   and an evidence file used once, recorder ≠ verifier); this screen says them
   before they are hit, and shows the refusal in words when one is. */
const CR_MP_STATUS = { open: ["Awaiting payment", "warn"], paid: ["Paid", "ok"], void: ["Void", "neutral"], pending: ["Check the payment", "bad"] };
const CR_MP_ERRORS = {
  evidence_required: "Attach the slip, receipt or bank alert.", evidence_unreadable: "That file couldn’t be read. Attach it again.",
  bad_date: "Enter the date the money was paid.", bad_method: "Choose how it was paid.", not_open: "This invoice is no longer open.",
  offline_pending: "A payment for this invoice is already waiting to be verified.", not_pending: "This payment has already been dealt with.",
  fees_off: "Turn on Dues & arrears and set the membership and commitment fees first.", nothing_to_pay: "With these fees there is nothing to invoice.",
  no_email: "There is no email on this member’s record (or their guardian’s) to send it to.", payments_unavailable: "Paystack isn’t set up on this site.",
  evidence_missing: "The evidence file is missing from the server.", evidence_altered: "The evidence file on the server has been changed since it was recorded. Do not verify this payment; tell an admin.",
};
function crMpErr(e, fb) { const c = e && (e.code || (e.data && e.data.error)); const d = (e && e.data && e.data.detail) || (e && e.detail); return (typeof d === "string" && /\s/.test(d)) ? d : (CR_MP_ERRORS[c] || crErr(e, fb)); }

/** An evidence file, ready to send: a photo is shrunk to a sharp JPEG (a host refuses big bodies); a PDF goes as it is. */
async function crMpEvidence(file, max) {
  if (!file) return "";
  if (file.type === "application/pdf") {
    if (file.size > max) throw Object.assign(new Error("too_big"), { data: { detail: "That PDF is over " + Math.round(max / 1048576) + " MB. Photograph the slip instead." } });
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  }
  if (!/^image\//.test(file.type)) throw Object.assign(new Error("type"), { data: { detail: "A photo (JPG, PNG, WebP) or a PDF of the slip, receipt or bank alert." } });
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.88);
  } finally { URL.revokeObjectURL(url); }
}

function CrMembershipPayments({ ctx }) {
  const [filter, setFilter] = React.useState("");
  const [d, setD] = React.useState({ state: "loading" });
  const load = React.useCallback(() => {
    setD(x => Object.assign({}, x, { state: x.invoices ? "ready" : "loading" }));
    NGGApi.admin.membership.list(filter).then(r => setD(Object.assign({ state: "ready" }, r))).catch(e => setD({ state: "error", error: e }));
  }, [filter]);
  React.useEffect(load, [load]);
  if (d.state === "loading") return <CrSkeleton kind="table"/>;
  if (d.state === "error") return <CrError error={d.error} onRetry={load} what="the joining invoices"/>;
  const t = d.terms || {}, rows = d.invoices || [], c = d.counts || {};
  const money = n => fmtMoney(n || 0);
  const today = new Date().toISOString().slice(0, 10);

  const record = inv => ctx.form({
    title: "Record an offline payment",
    intro: "For " + inv.name + " · " + inv.invoiceId + " · " + money(inv.total) + ". It is held as a claim until a different member of staff checks it against the bank statement or the cash book; only then is the family sent the receipt.",
    submit: "Record for checking", busyLabel: "Recording…",
    values: { method: "transfer", amount: String(inv.total), paidOn: today },
    fields: [
      { id: "method", l: "How it was paid", type: "chips", req: true, opts: Object.entries(d.methods || {}) },
      { id: "amount", l: "Amount paid (₦)", req: true, num: true, money: true, im: "numeric", help: "The invoice total, exactly. A part-payment is not recorded here.",
        check: v => Number(String(v).replace(/[^\d.]/g, "")) !== inv.total ? "The invoice is " + money(inv.total) + ". Record it only when that has been paid in full." : "" },
      { id: "payerName", l: "Paid by", req: true, ph: "The name on the slip or receipt", max: 160 },
      { id: "bankName", l: "Bank", req: true, ph: "GTBank, Access, OPay…", max: 120, when: v => v.method !== "cash" },
      { id: "reference", l: "Reference", req: true, max: 120, help: "The transaction reference or session ID on the slip or alert — for cash, the number on the receipt you wrote. Each reference is accepted once.",
        check: v => String(v).replace(/[^A-Za-z0-9]/g, "").length < 4 ? "That reference is too short." : "" },
      { id: "paidOn", l: "Date paid", type: "date", req: true, check: v => v > today ? "That date is in the future." : "" },
      { id: "evidence", l: "Evidence", type: "file", req: true, accept: "image/jpeg,image/png,image/webp,application/pdf", help: "A clear photo or PDF of the slip, receipt or bank alert. A file can be used as evidence once." },
      { id: "note", l: "Note", type: "textarea", rows: 3, max: 500 },
      { id: "resubmit", l: "This reference was rejected before, and I am recording it again on purpose (say why in the note)", type: "switch" },
    ],
    onSubmit: async v => {
      let evidence;
      try { evidence = await crMpEvidence(v.evidence, d.evidenceMax || 3145728); }
      catch (e) { return { fieldErrors: { evidence: crMpErr(e, "That file couldn’t be read.") } }; }
      try {
        await NGGApi.admin.membership.record({ invoiceId: inv.invoiceId, method: v.method, amount: Number(String(v.amount).replace(/[^\d.]/g, "")),
          payerName: v.payerName, bankName: v.method === "cash" ? "" : v.bankName, reference: v.reference, paidOn: v.paidOn, evidence, note: v.note || "", resubmit: !!v.resubmit });
      } catch (e) {
        const code = e && e.code;
        const field = { amount_mismatch: "amount", reference_reused: "reference", reference_rejected: "reference", note_required: "note", reference_required: "reference", evidence_reused: "evidence", evidence_type: "evidence", evidence_too_small: "evidence", evidence_too_large: "evidence",
          date_in_future: "paidOn", date_before_invoice: "paidOn", bad_date: "paidOn", payer_required: "payerName", bank_required: "bankName" }[code];
        if (field) return { fieldErrors: { [field]: crMpErr(e) } };
        throw Object.assign(e, { data: Object.assign({}, e.data, { message: crMpErr(e) }) });
      }
      load();
    },
    done: "Recorded. Another member of staff with the Fees permission must now verify it.",
  });

  const verify = inv => {
    const op = inv.offline;
    const mine = op.recordedBy === d.me;
    if (mine) return ctx.toast("You recorded this payment, so someone else must verify it. That second check is what makes an offline payment safe.", null, true);
    ctx.form({
      title: "Verify " + inv.name + "’s payment",
      intro: <span className="cr-mp-claim">
        <span><b>{money(op.amount)}</b> by {op.methodLabel}{op.bankName ? " (" + op.bankName + ")" : ""} on {op.paidOn}, paid by {op.payerName}. Recorded by {op.recordedByName}.</span>
        <a className="cr-linkbtn" href={NGGApi.admin.membership.evidenceUrl(op.paymentId)} target="_blank" rel="noopener noreferrer"><CrIcon n="file-magnifying-glass"/> Open the evidence</a>
        <span>Open the bank statement or the cash book — not the slip — and type what it shows. Do not copy from the record above.</span>
      </span>,
      submit: "Verify and send the receipt", busyLabel: "Verifying…",
      fields: [
        { id: "ref", l: "Reference on the statement", req: true, max: 120 },
        { id: "amt", l: "Amount on the statement (₦)", req: true, num: true, money: true, im: "numeric" },
        { id: "checked", l: "I checked that this money arrived (bank statement, alert in the account, or the cash book)", type: "switch" },
      ],
      onSubmit: async v => {
        if (!v.checked) return { fieldErrors: { checked: "Confirm you checked the money arrived." } };
        try { return await NGGApi.admin.membership.verify(op.paymentId, v.ref, Number(String(v.amt).replace(/[^\d.]/g, "")), true).then(r => { load(); return r; }); }
        catch (e) {
          if (e.code === "reference_mismatch") return { fieldErrors: { ref: crMpErr(e) } };
          if (e.code === "amount_mismatch") return { fieldErrors: { amt: crMpErr(e) } };
          throw Object.assign(e, { data: Object.assign({}, e.data, { message: crMpErr(e) }) });
        }
      },
      done: (v, r) => "Verified. Receipt " + ((r && r.receiptNo) || "") + " is on its way to the family" + (r && r.receipt && r.receipt.to ? " (" + r.receipt.to + ")" : "") + ".",
    });
  };
  const reject = inv => ctx.form({
    title: "Reject this payment?",
    intro: "The invoice stays open and the family can pay again. The evidence file can never be used again.",
    submit: "Reject", fields: [{ id: "reason", l: "Why", type: "textarea", req: true, rows: 3, max: 500, check: v => v.length < 10 ? "Say why, in at least 10 characters." : "" }],
    onSubmit: async v => { try { await NGGApi.admin.membership.reject(inv.offline.paymentId, v.reason); load(); } catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data, { message: crMpErr(e) }) }); } },
    done: "Rejected. The invoice is open again.",
  });
  const voidInv = inv => ctx.form({
    title: "Void " + inv.invoiceId + "?", intro: "Nobody can pay a void invoice. Use it when a family withdrew before starting, or the invoice was wrong.",
    submit: "Void the invoice", fields: [{ id: "reason", l: "Why", type: "textarea", req: true, rows: 3, max: 250, check: v => v.length < 10 ? "Say why, in at least 10 characters." : "" }],
    onSubmit: async v => { try { await NGGApi.admin.membership.void(inv.invoiceId, v.reason); load(); } catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data, { message: crMpErr(e) }) }); } },
    done: "Voided.",
  });
  const resend = async inv => {
    const ok = await ctx.confirm({ title: "Send the payment link again?", body: "It goes to " + (inv.sentTo || "the family") + ". Only resend if they have not paid by transfer or cash — record that instead.", cta: "Send again" });
    if (!ok) return;
    try { const r = await NGGApi.admin.membership.resend(inv.invoiceId); ctx.toast("Sent to " + (r.to || "the family") + "."); load(); }
    catch (e) { ctx.toast(crMpErr(e, "Couldn’t send it."), null, true); }
  };
  const copy = inv => { try { navigator.clipboard.writeText(inv.payUrl).then(() => ctx.toast("Payment link copied."), () => {}); } catch (_) {} };
  const bank = () => ctx.form({
    title: "Bank details on invoices", intro: d.bank && d.bank.accountNumber
      ? "Printed on every invoice and payment email. A change is held until another member of staff with the Fees and Settings permissions confirms it, and everyone with Fees is emailed."
      : "Printed on every invoice and payment email for families who pay by transfer.",
    submit: d.bank && d.bank.accountNumber ? "Propose the change" : "Save", values: d.bank || {},
    fields: [{ id: "bankName", l: "Bank", req: true, max: 80 }, { id: "accountName", l: "Account name", req: true, max: 120 },
      { id: "accountNumber", l: "Account number", req: true, im: "numeric", pattern: /^\d{10}$/, patternMsg: "A Nigerian account number is 10 digits." }],
    onSubmit: async v => { try { const r = await NGGApi.admin.membership.bank(v); load(); return r; } catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data, { message: crMpErr(e) }) }); } },
    done: (v, r) => r && r.applied === false ? "Proposed. It applies when a second person confirms it." : "Saved.",
  });
  const bp = d.bankPending;
  const bankConfirm = () => ctx.form({
    title: "Confirm the new bank account", intro: bp ? bp.byName + " asked to change the account to " + bp.bank.bankName + " · " + bp.bank.accountName + ". Check it against the bank’s own letter or statement, then type the account number from THAT, not from this screen." : "",
    submit: "Confirm the change",
    fields: [{ id: "n", l: "Account number, from the bank’s document", req: true, im: "numeric", pattern: /^\d{10}$/, patternMsg: "A Nigerian account number is 10 digits." }],
    onSubmit: async v => { try { await NGGApi.admin.membership.bankConfirm(v.n); load(); } catch (e) { if (e.code === "account_mismatch") return { fieldErrors: { n: crMpErr(e) } }; throw Object.assign(e, { data: Object.assign({}, e.data, { message: crMpErr(e) }) }); } },
    done: "The new account is on every invoice from now.",
  });
  const bankCancel = async () => {
    if (!(await ctx.confirm({ title: "Cancel the proposed change?", body: "The account on invoices stays as it is.", cta: "Cancel the change" }))) return;
    try { await NGGApi.admin.membership.bankCancel(); ctx.toast("Cancelled."); load(); } catch (e) { ctx.toast(crMpErr(e, "Couldn’t cancel it."), null, true); }
  };
  const invoiceFor = () => ctx.form({
    title: "Invoice a member already on the roll", intro: "For an NGG member accepted before payments existed, or one starting later than planned. One joining invoice per member.",
    submit: "Create the invoice",
    fields: [{ id: "q", l: "Member ID or printed ID", req: true, max: 40 }, { id: "start", l: "Start date", type: "date", req: true, help: "Prices the first month: only the meeting days left from this date are charged." },
      { id: "send", l: "Email the payment link now", type: "switch" }],
    values: { start: today, send: true },
    onSubmit: async v => {
      const found = await NGGApi.admin.fees.lookup(v.q).catch(() => ({ members: [] }));
      const m = (found.members || found.results || []).find(x => [x.memberId, x.displayId].map(s => String(s || "").toUpperCase()).includes(v.q.trim().toUpperCase())) || (found.members || found.results || [])[0];
      if (!m) return { fieldErrors: { q: "Nobody with that ID." } };
      try { const r = await NGGApi.admin.membership.create(m.memberId, v.start, v.send); load(); return r; }
      catch (e) { if (e.code === "bad_start") return { fieldErrors: { start: crMpErr(e) } }; throw Object.assign(e, { data: Object.assign({}, e.data, { message: crMpErr(e) }) }); }
    },
    done: (v, r) => r && r.existed ? "That member already has a joining invoice (" + r.invoiceId + ")." : "Invoice " + ((r && r.invoiceId) || "") + " created" + (r && r.sent && r.sent.ok ? " and sent." : "."),
  });

  const statusOf = inv => inv.offline && inv.offline.status === "pending" ? "pending" : inv.status;
  return (
    <div className="cr-mp">
      {!t.enabled && <div className="cr-box cr-mp-note is-warn"><CrIcon n="warning-circle"/><span>No invoices are made yet: switch on <b>Dues &amp; arrears</b> and set the membership fee and the monthly commitment fee. Accepting an NGG applicant then sends their family one invoice.</span>
        <button type="button" className="cr-btn is-sm" onClick={() => window.__adminSection && window.__adminSection("fees")}>Open Dues &amp; arrears</button></div>}
      {t.enabled && !t.paystack && <div className="cr-box cr-mp-note is-warn"><CrIcon n="warning-circle"/><span>Paystack isn’t set up, so families can only pay offline. Set <code>paystack.secret</code> in api/config.php and point the Paystack webhook at <code>/api/hooks/paystack.php</code>.</span></div>}
      {bp && <div className="cr-box cr-mp-note is-warn"><CrIcon n="warning-circle"/><span><b>A change of bank account is waiting.</b> {bp.byName} proposed {bp.bank.bankName} · {bp.bank.accountName} · {bp.bank.accountNumber} on {crDate(bp.at)}. Invoices keep the current account until another person confirms it.</span>
        {bp.by !== d.me && <button type="button" className="cr-btn is-sm" onClick={bankConfirm}>Confirm</button>}
        <button type="button" className="cr-btn is-sm" onClick={bankCancel}>Cancel it</button></div>}
      {(d.alerts || []).length > 0 && <div className="cr-box cr-mp-note is-warn" role="status"><CrIcon n="warning-circle"/><span><b>Money that could not be applied.</b> {d.alerts.map(a => (a.kind === "mismatch" ? "A Paystack payment that does not match its invoice" : "A Paystack payment for an invoice that was no longer open") + " — " + a.invoiceId + " · " + a.reference + (a.amount ? " · " + money(a.amount) : "") + " (" + crDate(a.at) + ")").join("; ")}. Refund it or apply it to the family’s account.</span></div>}
      <div className="cr-mp-kpis">
        <div className="cr-box"><span>Awaiting payment</span><b>{crNum(c.open || 0)}</b></div>
        <div className={"cr-box" + (c.pending ? " is-bad" : "")}><span>Waiting for a second check</span><b>{crNum(c.pending || 0)}</b></div>
        <div className="cr-box"><span>Paid</span><b>{crNum(c.paid || 0)}</b></div>
        <div className="cr-box cr-mp-terms">
          <span>Joining costs</span>
          <b>{money(t.membershipFee)} membership{t.membershipEveryMonths === 12 ? " a year" : ""} + {money(t.monthlyCommitment)} a month</b>
          <span className="cr-hint">The first month is charged only for the meeting days left from the start date.</span>
        </div>
      </div>
      <div className="cr-mp-bar">
        <CrSeg label="Show" value={filter} onChange={setFilter} options={[["", "All"], ["pending", "To verify" + (c.pending ? " · " + c.pending : "")], ["open", "Unpaid"], ["paid", "Paid"], ["void", "Void"]]}/>
        <span className="cr-grow"/>
        <button type="button" className="cr-btn is-sm" onClick={bank}><CrIcon n="bank"/>{d.bank && d.bank.accountNumber ? "Bank: " + d.bank.bankName + " · " + d.bank.accountNumber : "Add bank details"}</button>
        <button type="button" className="cr-btn is-sm" disabled={!t.enabled} onClick={invoiceFor}><CrIcon n="plus"/>Invoice a member</button>
      </div>
      {!rows.length ? <p className="cr-tempty">{filter === "pending" ? "Nothing is waiting to be verified." : "No joining invoices yet. They are made when an NGG applicant is accepted."}</p> : (
        <div className="cr-box cr-tscroll">
          <table className="cr-mp-table">
            <thead><tr><th scope="col">Member</th><th scope="col">Invoice</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span className="cr-sr">Actions</span></th></tr></thead>
            <tbody>
              {rows.map(inv => {
                const st = CR_MP_STATUS[statusOf(inv)] || [inv.status, "neutral"];
                const op = inv.offline;
                return (
                  <tr key={inv.invoiceId}>
                    <td><b>{inv.name || inv.memberId}</b><span className="cr-hint">{[inv.displayId, inv.centre].filter(Boolean).join(" · ")}</span></td>
                    <td><span className="cr-mono">{inv.invoiceId}</span><span className="cr-hint">Starts {inv.startDate}{inv.sentAt ? " · sent " + crDate(inv.sentAt) : ""}</span></td>
                    <td className="cr-num">{money(inv.total)}</td>
                    <td><CrPill tone={st[1]} t={st[0]}/>
                      {op && op.status === "pending" && <span className="cr-hint">{op.methodLabel} · {op.referenceHidden ? "reference hidden until checked" : "ref " + op.reference} · recorded by {op.recordedByName}{op.priorRejections ? " · this reference was rejected " + op.priorRejections + "× before" : ""}</span>}
                      {op && op.status === "rejected" && inv.status === "open" && <span className="cr-hint">Last claim rejected: {op.rejectReason}</span>}
                      {inv.status === "paid" && <span className="cr-hint">{inv.paidVia === "paystack" ? "Paystack" : (op && op.methodLabel) || inv.paidVia} · {crDate(inv.paidAt)}{op && op.verifiedByName ? " · checked by " + op.verifiedByName : ""}</span>}
                    </td>
                    <td className="cr-mp-acts">
                      {inv.status === "paid" && <a className="cr-btn is-sm" href={inv.receiptUrl} target="_blank" rel="noopener noreferrer"><CrIcon n="receipt"/>{inv.receiptNo}</a>}
                      {op && op.status === "pending" && <>
                        <a className="cr-btn is-sm" href={NGGApi.admin.membership.evidenceUrl(op.paymentId)} target="_blank" rel="noopener noreferrer"><CrIcon n="file-magnifying-glass"/>Evidence</a>
                        <button type="button" className="cr-btn is-sm is-primary" aria-disabled={op.recordedBy === d.me || undefined} title={op.recordedBy === d.me ? "You recorded it, so someone else verifies it." : ""} onClick={() => verify(inv)}>Verify</button>
                        <button type="button" className="cr-btn is-sm is-danger" onClick={() => reject(inv)}>Reject</button>
                      </>}
                      {inv.status === "open" && !(op && op.status === "pending") && <>
                        <button type="button" className="cr-btn is-sm is-primary" onClick={() => record(inv)}><CrIcon n="hand-coins"/>Record offline payment</button>
                        <button type="button" className="cr-btn is-sm" onClick={() => resend(inv)}>Resend link</button>
                        <button type="button" className="cr-iconbtn" aria-label={"Copy " + inv.name + "’s payment link"} onClick={() => copy(inv)}><CrIcon n="link"/></button>
                        <button type="button" className="cr-iconbtn" aria-label={"Void " + inv.invoiceId} onClick={() => voidInv(inv)}><CrIcon n="prohibit"/></button>
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
Object.assign(CR_TAB_DEFS, {
  membership: crPanel(ctx => <CrMembershipPayments ctx={ctx}/>, { skeleton: ["kpis", "table"] }),
});

/* ── Volunteer pay ───────────────────────────────────────────────────────────
   What active volunteers earn for each programme day they are present and
   active (domain/volunteer-pay.php). The server decides every day, once, by
   the rules set here; this tab sets the rules, shows a pay period, opens one
   volunteer's days, and records a period's payment. Nothing here moves money. */
const CR_VP_STATE = { unpaid: ["To pay", "warn"], paid: ["Paid", "ok"], nothing: ["Nothing earned", "neutral"] };
const CR_VP_ERR = { amount_required: "Set the amount a volunteer earns each day before switching volunteer pay on.", activity_required: "Choose at least one activity that counts, or stop requiring one.",
  period_open: "This period hasn’t ended yet. It can be paid once it has.", reference_required: "Give the transfer reference.", already_paid: "That day is paid. Void the payout first.",
  reason_required: "Say why. It is kept with the day, and the volunteer sees it.", too_many: "Too many volunteers for one payment run.", own_account: "You can’t change your own pay.",
  av_unreachable: "Afrovanguard couldn’t be reached to put its fine back. Nothing was changed; try again." };
function crVpErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code); return CR_VP_ERR[c] || (e && e.data && e.data.message) || crErr(e, fb); }
function crVpBank(b) { return b && b.set ? b.bankName + " ••••" + b.last4 + " · " + b.accountName : "No bank details"; }
const crVpCtx = { current: null };

function crVpForm(d) {
  const s = d.settings, num = (lo, hi) => v => { const n = Number(v); return v === "" || !Number.isInteger(n) ? "Enter a whole number." : n < lo ? "At least " + crNum(lo) + "." : n > hi ? "At most " + crNum(hi) + "." : ""; };
  const acts = Object.keys(d.activities || {});
  return {
    type: "form", span: 6, key: "volpay-rules",
    groups: [
      { h: "What a volunteer earns", help: "Each programme day an active volunteer is present and active earns this amount. Days already decided keep the amount of their day when this changes.", rows: [
        { id: "enabled", l: "Pay volunteers", c: "toggle", value: !!s.enabled, help: "Off: no day is decided and nothing is owed." },
        { id: "amount", l: "Amount per day (₦)", c: "input", type: "number", im: "numeric", value: String(s.amount), check: num(0, d.amountMax) },
        { id: "startDate", l: "Counting from", c: "input", type: "date", value: s.startDate || "", help: "Days before this are never paid. Left empty, it is the day pay is switched on." },
        { id: "days", l: "Which days count", c: "select", value: s.days, opts: [["programme", "Programme days only (the volunteer’s Club or Summer School calendar)"], ["any", "Any day they check in"]] },
      ] },
      { h: "How often it is paid", help: "Earnings are grouped into pay periods. A period can be paid once it has ended.", rows: [
        { id: "frequency", l: "Pay period", c: "select", value: s.frequency, opts: Object.keys(d.frequencies || {}).map(k => [k, d.frequencies[k]]) },
        { id: "maxDaysPerPeriod", l: "Most days paid in one period", c: "input", type: "number", im: "numeric", value: String(s.maxDaysPerPeriod), check: num(0, 31), help: "0 means no limit. Days over it are kept, and marked excluded." },
      ] },
      { h: "Being active", help: "Being present is not enough on its own when this is on: at least one of these must be recorded that day.", rows: [
        { id: "requireActivity", l: "Require activity on the day", c: "toggle", value: !!s.requireActivity },
      ].concat(acts.map(k => ({ id: "act_" + k, l: d.activities[k], c: "toggle", value: (s.activities || []).includes(k) }))) },
      { h: "When a day is excluded", help: "An excluded day is kept, with its reason, so the volunteer can see why. You can also exclude or restore a single day on their wallet.", rows: [
        { id: "lateAfterMin", l: "Exclude when later than (minutes)", c: "input", type: "number", im: "numeric", value: String(s.lateAfterMin), check: num(0, 240), help: "0: lateness never excludes a day." },
        { id: "excludeRedline", l: "Exclude a day past the red line", c: "toggle", value: !!s.excludeRedline },
        { id: "excludeHalfDay", l: "Exclude a half day", c: "toggle", value: !!s.excludeHalfDay },
        { id: "excludeNoCheckout", l: "Exclude a day with no check-out", c: "toggle", value: !!s.excludeNoCheckout },
        { id: "excludeUncleared", l: "Exclude anyone whose safeguarding is not cleared", c: "toggle", value: !!s.excludeUncleared },
      ] },
      { h: "Fines", help: "When a period is paid, fines the volunteer owes come off first, down to ₦0: NGG’s own, then Afrovanguard’s (NGV and Vanguard Quest). What is left of a fine stays owed for the next payment. The volunteer is told what was taken.", rows: [
        { id: "deductFines", l: "Take fines off pay", c: "toggle", value: s.deductFines !== false },
      ] },
    ],
    save: async (patch, all) => {
      const send = {};
      Object.keys(patch).forEach(k => {
        if (k.indexOf("act_") === 0) return;
        send[k] = typeof patch[k] === "boolean" || ["frequency", "days", "startDate"].includes(k) ? patch[k] : parseInt(patch[k], 10);
      });
      if (Object.keys(patch).some(k => k.indexOf("act_") === 0)) send.activities = acts.filter(k => all["act_" + k]);
      try { await NGGApi.admin.volpay.settingsSet(send); }
      catch (e) { throw new Error(crVpErr(e, "Couldn’t save the rules.")); }
      if (crVpCtx.current) crVpCtx.current.reload();
    },
  };
}

function crVpWallet(ctx, v) {
  const open = async () => {
    let r;
    try { r = await NGGApi.admin.volpay.volunteer(v.volunteerId); } catch (e) { ctx.toast(crVpErr(e, "Couldn’t open their wallet."), null, true); return; }
    const w = r.wallet, who = r.volunteer;
    const dayAct = (x, op) => ctx.form({
      title: (op === "exclude" ? "Exclude " : "Restore ") + crDate(x.day), submit: op === "exclude" ? "Exclude the day" : "Restore the day",
      intro: op === "exclude" ? "Nothing is paid for this day. The reason is kept with it, and the volunteer sees it." : "The day is paid at its own rate, " + fmtMoney(x.rate) + ". The reason is kept with it.",
      values: { reason: "" }, fields: [{ id: "reason", l: "Why", type: "textarea", req: true, max: 300 }],
      onSubmit: async val => { try { return await NGGApi.admin.volpay.day(who.volunteerId, x.day, op, val.reason); } catch (e) { throw new Error(crVpErr(e, "Couldn’t change the day.")); } },
      done: () => { setTimeout(open, 50); ctx.reload(); return op === "exclude" ? "Day excluded" : "Day restored"; },
    });
    const bankForm = () => ctx.form({ title: "Bank details for " + who.name, submit: "Save",
      intro: "Where NGG pays them. The volunteer is emailed at once about any change, so they can stop one they did not make.",
      values: { bankName: (w.bank && w.bank.bankName) || "", accountNumber: (w.bank && w.bank.accountNumber) || "", accountName: (w.bank && w.bank.accountName) || "" },
      fields: [{ id: "bankName", l: "Bank", req: true, max: 80 }, { id: "accountNumber", l: "Account number", req: true, max: 10, im: "numeric", help: "10 digits." },
        { id: "accountName", l: "Name on the account", req: true, max: 120 }],
      onSubmit: async val => { try { return await NGGApi.admin.volpay.bank(who.volunteerId, val); } catch (e) { throw new Error(crVpErr(e, "Couldn’t save the bank details.")); } },
      done: () => { setTimeout(open, 50); ctx.reload(); return "Bank details saved"; } });
    const voidPo = po => ctx.form({ title: "Void payout " + po.payoutId, submit: "Void the payout", intro: "Its days are owed again, and any fines it took are owed again — NGG’s and Afrovanguard’s. Only for a payout recorded by mistake.",
      values: { reason: "" }, fields: [{ id: "reason", l: "Why", type: "textarea", req: true, max: 300 }],
      onSubmit: async val => { try { return await NGGApi.admin.volpay.voidPayout(po.payoutId, val.reason); } catch (e) { throw new Error(crVpErr(e, "Couldn’t void it.")); } },
      done: () => { setTimeout(open, 50); ctx.reload(); return "Payout voided"; } });
    ctx.drawer({
      title: who.name, sub: [who.volunteerId, who.centre, who.status !== "active" ? who.status : ""].filter(Boolean).join(" · "), icon: "wallet",
      stats: [["Owed", fmtMoney(w.owed)], ["Earned in all", fmtMoney(w.earned)], ["Paid", fmtMoney(w.paid)]],
      fields: [["Days earned", crNum(w.daysEarned)], ["Days excluded", crNum(w.daysExcluded)], ["Paid", w.frequencyText + ", at " + fmtMoney(w.rate) + " a day"],
        ["Bank", w.bank && w.bank.set ? w.bank.bankName + " · " + w.bank.accountNumber + " · " + w.bank.accountName + (w.bank.recent ? " (changed " + crDate(w.bank.updatedAt) + ")" : "") : "No bank details"],
        ["NGG fines owed", fmtMoney(w.finesOwedNgg || 0)], ["Fines taken off pay", fmtMoney(w.finesTaken || 0)]],
      actions: [{ l: w.bank && w.bank.set ? "Change bank details" : "Add bank details", icon: "bank", run: () => bankForm() }],
      sections: [
        { h: "Days", empty: "No days decided yet.", list: w.days.map(x => ({
          icon: x.status === "earned" ? (x.paid ? "check-circle" : "coins") : "minus-circle",
          t: crDate(x.day) + " · " + (x.status === "earned" ? fmtMoney(x.amount) + (x.paid ? " · paid" : "") : "excluded"),
          s: [x.status === "excluded" ? x.reasonText : "", x.override ? "By hand: " + x.override.reason : "", x.activity.length ? "Did: " + x.activity.map(a => ((d => d && d[a])(crVpCtx.acts) || a).toLowerCase()).join(", ") : "", x.centre].filter(Boolean).join(" · "),
          act: x.paid ? null : { l: x.status === "earned" ? "Exclude" : "Restore", run: () => dayAct(x, x.status === "earned" ? "exclude" : "restore") } })) },
        { h: "Payouts", empty: "Nothing paid yet.", list: w.payouts.map(po => ({ icon: po.void ? "prohibit" : "hand-coins",
          t: po.period + " · " + fmtMoney(po.amount) + " for " + crPlural(po.days, "day"),
          s: [po.fineNgg + po.fineAv > 0 ? fmtMoney(po.gross) + " earned, " + (po.fineNgg ? fmtMoney(po.fineNgg) + " NGG fines" : "") + (po.fineNgg && po.fineAv ? " + " : "") + (po.fineAv ? fmtMoney(po.fineAv) + " Afrovanguard fines" : "") + " taken off" : "",
              po.bankLine ? "to " + po.bankLine : po.methodText, po.reference ? "ref " + po.reference : "", crDate(po.paidAt), po.void ? "Voided: " + po.voidReason : ""].filter(Boolean).join(" · "),
          act: po.void ? null : { l: "Void", run: () => voidPo(po) } })) },
      ],
    });
  };
  return open();
}

/* A bank change in the last two days is said before anybody is paid into it. */
function crVpRecent(d, ids) {
  const n = (d.period.rows || []).filter(r => ids.includes(r.volunteerId) && r.bank && r.bank.recent).length;
  return n ? crPlural(n, "volunteer") + " changed their bank details in the last two days: check before paying." : "";
}

function crVpPay(ctx, d, ids) {
  const p = d.period;
  ctx.form({
    title: "Pay " + p.label, submit: "Record the payment",
    intro: "Records that " + crPlural(ids.length, "volunteer") + " " + (ids.length === 1 ? "was" : "were") + " paid their earned days of this period. It doesn’t send money: pay them first, then record it here."
      + (d.settings.deductFines !== false ? " Fines they owe come off first — NGG’s, then Afrovanguard’s — so pay each the amount on their line after fines." : "")
      + (crVpRecent(d, ids) ? " " + crVpRecent(d, ids) : ""),
    values: { method: "transfer", reference: "" },
    fields: [{ id: "method", l: "How it was paid", type: "chips", req: true, opts: Object.keys(d.methods || {}).map(k => [k, d.methods[k]]) },
      { id: "reference", l: "Reference", max: 120, help: "The transfer reference. Needed for a bank transfer." }],
    onSubmit: async v => {
      try { return await NGGApi.admin.volpay.pay(p.period, ids, v.method, v.reference); }
      catch (e) { if ((e.data && e.data.error) === "reference_required") return { fieldErrors: { reference: crVpErr(e) } }; throw new Error(crVpErr(e, "Couldn’t record the payment.")); }
    },
    done: (v, r) => { ctx.reload(); const ref = (r.results || []).filter(x => x.state === "refused"), noBank = r.noBank || 0;
      if (r.avMessage) ctx.toast(r.avMessage, null, true);
      return crPlural(r.paid || 0, "volunteer") + " paid · " + fmtMoney(r.total || 0) + (r.fines ? " · " + fmtMoney(r.fines) + " fines taken off" : "")
        + (ref.length ? " · " + ref.length + " refused" : "") + (noBank ? " · " + noBank + " had no bank details on record" : "") + ((r.ran || 0) - (r.paid || 0) - ref.length > 0 ? " · " + ((r.ran || 0) - (r.paid || 0) - ref.length) + " had nothing owed" : ""); },
  });
}

Object.assign(CR_TAB_DEFS, {
  volpay: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const s = await NGGApi.admin.volpay.settings();
      const period = await NGGApi.admin.volpay.period(ctx.sub || "");
      return Object.assign({}, s, { period });
    },
    actions: (d, ctx) => {
      crVpCtx.current = ctx; crVpCtx.acts = d.activities;
      const p = d.period, owed = (p.rows || []).filter(r => r.unpaid > 0);
      return [
        { l: "Pay this period", icon: "hand-coins", primary: true, disabled: !p.ended || !owed.length, why: !p.ended ? "This period runs until " + crDate(p.end) + "." : "Nothing is owed for this period.",
          run: () => crVpPay(ctx, d, owed.map(r => r.volunteerId)) },
        { l: "Decide finished days now", icon: "arrows-clockwise", disabled: !d.settings.enabled, why: "Volunteer pay is switched off.",
          run: async () => { try { const r = await NGGApi.admin.volpay.accrue(); ctx.toast(crPlural(r.decided || 0, "day") + " decided, " + crNum(r.earned || 0) + " earned" + (r.more ? ". More remain: press again." : ".")); ctx.reload(); } catch (e) { ctx.toast(crVpErr(e, "Couldn’t decide the days."), null, true); } } },
      ];
    },
    blocks: (d, ctx) => {
      crVpCtx.current = ctx; crVpCtx.acts = d.activities;
      const p = d.period, t = p.totals || {}, out = [];
      if (!d.settings.enabled) out.push({ type: "note", span: 6, icon: "pause-circle", tone: "warn", text: "Volunteer pay is switched off: no day is decided and nothing is owed.", sub: "Set the amount and the rules below, and switch it on." });
      out.push({ type: "custom", span: 6, render: (c, phone) => phone
        ? <select className="cr-select" aria-label="Pay period" value={p.period} onChange={e => { ctx.closeDrawer(); ctx.setSub(e.target.value); }}>{p.periods.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
        : <CrSeg label="Pay period" value={p.period} options={p.periods.slice(0, 6)} onChange={v => { ctx.closeDrawer(); ctx.setSub(v); }}/> });
      out.push({ type: "kpis", span: 6, title: p.label, sub: p.current ? "The period running now · it can be paid after " + crDate(p.end) : p.ended ? "Ended " + crDate(p.end) : "", items: [
        { l: "To pay", v: fmtMoney(t.unpaid || 0), tone: "flat" }, { l: "Earned", v: fmtMoney(t.earned || 0), tone: "flat" },
        { l: "Volunteers", v: crNum(t.people || 0), tone: "flat" }, { l: "Days earned · excluded", v: crNum(t.daysEarned || 0) + " · " + crNum(t.daysExcluded || 0), tone: "flat" },
        { l: "Fines held for Afrovanguard", v: fmtMoney(d.avFinesHeld || 0), tone: "flat", s: "Taken off pay for Afrovanguard’s fines: hand it over" } ] });
      out.push({ type: "table", span: 6, title: "Volunteers in this period", sub: "Open one for their days, to exclude or restore a day, and their payouts",
        cols: ["Volunteer", { l: "Days earned", num: true }, { l: "Excluded", num: true }, { l: "Earned", num: true }, { l: "To pay", num: true }, { l: "NGG fines", num: true }, "Bank", "State"],
        rows: (p.rows || []).map(r => { const st = CR_VP_STATE[r.state] || [r.state, "neutral"]; return { key: r.volunteerId, open: () => crVpWallet(ctx, r), cells: [
          { k: "person", t: r.name, s: [r.volunteerId, r.centre].filter(Boolean).join(" · ") }, { k: "num", t: crNum(r.earnedDays), v: r.earnedDays }, { k: "num", t: crNum(r.excludedDays), v: r.excludedDays },
          { k: "num", t: fmtMoney(r.amount), v: r.amount }, { k: "num", t: fmtMoney(r.unpaid), v: r.unpaid }, { k: "num", t: fmtMoney(r.finesNgg || 0), v: r.finesNgg || 0 },
          { k: "text", t: r.bank && r.bank.set ? r.bank.bankName + " ••••" + r.bank.last4 + (r.bank.recent ? " · changed recently" : "") : "None yet" },
          { k: "status", t: st[0], tone: st[1] } ] }; }),
        search: "Search volunteers", filters: ["State"],
        bulk: p.ended ? [{ l: "Pay the selected", max: d.payMax, run: async keys => { const owed = (p.rows || []).filter(r => keys.includes(r.volunteerId) && r.unpaid > 0).map(r => r.volunteerId); if (!owed.length) { ctx.toast("Nothing is owed to the volunteers selected."); return false; } crVpPay(ctx, d, owed); return false; } }] : [],
        emptyText: d.settings.enabled ? "No volunteer has a decided day in this period yet. A day is decided once it is over." : "Nothing yet: volunteer pay is switched off." });
      out.push(crVpForm(d));
      return out;
    },
    facts: d => "Volunteer pay " + (d.settings.enabled ? "on, " + fmtMoney(d.settings.amount) + " a day, paid " + (d.frequencies[d.settings.frequency] || "").toLowerCase() : "off") + ". " + d.period.label + ": " + fmtMoney((d.period.totals || {}).unpaid || 0) + " to pay.",
  },
});
