/* ============================================================================
   Control Room v2 — the money tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   PROGRESS (for a resumed run): conduct ✓ built · donations ✓ built ·
   fees ✓ built (account actions verified; views being verified).

   Conduct & fines: v1 mounted `SummerPolicy` (page-portals.jsx) and nothing
   else, so this mounts the same component — one renderer, never two.

   Donations: v1 AdminDonations — the Paystack ledger (admin_donations_list,
   gated `settings`, the newest 500), what it raised, and a CSV export.
   ========================================================================== */

/* ── Conduct & fines ── */
Object.assign(CR_TAB_DEFS, {
  conduct: {
    skeleton: ["table"],
    load: async () => ({}),
    /* custom: the calendar + policy editor already exists as SummerPolicy and
       is still mounted by the Summer School portal. Rebuilding it as blocks
       would be a second renderer of the same screen (CLAUDE.md §11). */
    blocks: () => [{ type: "custom", span: 6, render: () => <SummerPolicy/> }],
    actions: () => [],
  },
});

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
        sub: "Set paystack.secret in api/config.php and point the Paystack webhook at /api/hooks/paystack.php." });
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
const CR_MO_VIEWS = [["", "Who owes"], ["training", "Training fees"], ["fines", "Upload fines"], ["reminders", "Reminders"], ["amounts", "Amounts"]];
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
/* Fines sheet: columns recognised by heading (v1 FINE_COLS). */
const CR_MO_FINE_COLS = {
  member: ["member", "memberid", "member id", "id", "displayid", "display id", "member no", "member number", "card", "card number"],
  name: ["name", "fullname", "full name", "member name"],
  email: ["email", "e-mail", "email address", "parent email"],
  amount: ["amount", "fine", "fines", "fine (₦)", "fine (n)", "outstanding fine", "outstanding", "naira", "amount (₦)", "amount (n)"],
  reason: ["reason", "offence", "offense", "why", "type"],
  date: ["date", "day", "on"],
  note: ["note", "notes", "comment", "comments", "details", "remark", "remarks"],
};
const CR_MO_FINE_TEMPLATE = "member,name,email,amount,reason,date,note\n026-014,,,2000,late,2026-10-04,\n,Ada Okafor,okafor.family@example.com,5000,conduct,04/10/2026,Fighting during break\n";
const CR_MO_FINE_ERR = {
  ambiguous: "more than one member matches", no_match: "no member matches", member_required: "no member given",
  not_ngg_member: "not an NGG member", out_of_scope: "outside your centres", bad_amount: "amount unreadable",
  reason_required: "no reason", note_required: "say why", bad_date: "date unreadable", duplicate_in_file: "repeated in this file",
  post_failed: "could not be posted", no_amount: "no fine on this row",
};
const CR_MO_MATCHED = { id: "ID", email: "email", "email+name": "email + name", name: "name only", name_any: "name, words reordered" };

function crMoFineRow(r) {
  const out = {}, keys = Object.keys(r);
  Object.keys(CR_MO_FINE_COLS).forEach(field => {
    const k = keys.find(x => CR_MO_FINE_COLS[field].includes(String(x).trim().toLowerCase().replace(/_/g, " ")));
    if (k !== undefined) out[field] = String(r[k] == null ? "" : r[k]).trim();
  });
  // An Excel date cell arrives as a day count from 1899-12-30.
  if (/^\d{5}(\.\d+)?$/.test(out.date || "")) out.date = new Date(Date.UTC(1899, 11, 30) + Math.floor(+out.date) * 86400000).toISOString().slice(0, 10);
  return out;
}
/* The sheet readers are the curriculum import's (cr-tab-learning.jsx): one CSV
   and one .xlsx reader in the Control Room, not two. */
async function crMoReadFines(file) {
  if (/\.(xls|numbers|pdf|docx?)$/i.test(file.name)) throw Object.assign(new Error("bad_file"), { data: { message: "That file type can’t be read here. Save it as .xlsx or CSV." } });
  const raw = /\.xlsx$/i.test(file.name) ? await crCurXlsxRows(await file.arrayBuffer()) : crCurParseCsv(await file.text());
  return raw.map(crMoFineRow).filter(r => Object.values(r).some(v => v !== ""));
}

function crMoDownload(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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

/* ── Fines import: check, then post what was checked ── */
function crMoFineCheck(ctx) {
  ctx.form({
    title: "Upload fines", submit: "Check the file", busyLabel: "Checking…",
    intro: "An Excel workbook (.xlsx) or a CSV. Columns are recognised by heading — Name, Member ID, Email, Fine or Amount, Reason, Date, Note; any other column is ignored, and a row whose fine is empty or “Null” is skipped. Name each member by printed ID or member number where you can: an email or a name only works when it points at exactly one member. Uploading the same sheet twice fines nobody twice. Nothing is posted until you have read the check and pressed Post.",
    fields: [
      { id: "file", l: "File", type: "file", req: true, accept: ".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { id: "reason", l: "Reason for rows that give none", max: 120, ph: "late, absent, conduct — or words such as “Outstanding fine, term 1”", help: "Used only on rows with an empty reason, and checked with them." },
    ],
    onSubmit: async v => {
      const rows = await crMoReadFines(v.file);
      if (!rows.length) return { fieldErrors: { file: "No fines found in that file." } };
      if (!rows.some(r => r.member || r.name || r.email)) return { fieldErrors: { file: "That sheet has no column for who is being fined. Name a column “Name”, “Member ID” or “Email”." } };
      if (!rows.some(r => r.amount)) return { fieldErrors: { file: "That sheet has no column for the amount. Name a column “Fine” or “Amount”." } };
      const rs = String(v.reason || "").trim();
      const sent = rows.map(r => r.reason || !rs ? r : Object.assign({}, r, { reason: rs }));
      let res;
      try { res = await NGGApi.admin.fees.fineImport(sent, { dryRun: true }); }
      catch (e) { if (e && (e.code === "too_many" || (e.data && e.data.error === "too_many"))) return { fieldErrors: { file: "That is more than " + crNum((e.data && e.data.max) || 500) + " fines in one file. Split it." } }; throw e; }
      ctx.setData(x => Object.assign({}, x, { finePlan: { rows: sent, res, name: v.file.name } }));
      return res;
    },
    done: (v, r) => "Checked · " + crMoFineTally(r.tally, true),
  });
}
function crMoFineTally(t, dry) {
  t = t || {};
  return crNum(t.fine) + (dry ? " to post (" : " posted (") + fmtMoney(t.total || 0) + ") · " + crNum(t.already) + " already posted · " + crNum(t.skipped || 0) + " with no fine · " + crNum(t.failed) + " refused";
}
async function crMoFinePost(ctx) {
  const p = ctx.data.finePlan; if (!p) return;
  const t = p.res.tally;   // read before the confirm: what is agreed is what runs
  const ok = await ctx.confirm({ title: "Post " + crPlural(t.fine, "fine") + " — " + fmtMoney(t.total) + "?", cta: "Post fines",
    body: crMoFineTally(t, true) + " (refused rows are not posted). Each fine lands on the member’s account and in their next reminder." });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.fees.fineImport(p.rows, { digest: p.res.digest });
    ctx.setData(x => Object.assign({}, x, { finePlan: { rows: p.rows, res: r, name: p.name } }));
    ctx.toast(crNum(r.tally.fine) + " posted · " + fmtMoney(r.tally.total) + (r.tally.failed ? " · " + crNum(r.tally.failed) + " refused" : ""), null, !!r.tally.failed);
    await crMoRefresh(ctx);
  } catch (e) {
    ctx.toast(e && (e.code === "import_changed" || (e.data && e.data.error === "import_changed")) ? "The file changed since it was checked. Check it again." : crErr(e, "Couldn’t post the fines. Nothing was written."), null, true);
  }
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
    body: "This emails " + crPlural(n, "guardian") + " about their outstanding balance. It can’t be recalled. Nobody will be reminded again for at least " + crPlural(p.everyDays, "day") + "." });
  if (!ok) return;
  try {
    const res = (await NGGApi.admin.fees.remindRun(ctx.data.B.remindBatch)).result || {};
    ctx.toast(crNum(res.sent) + " sent" + (res.failed ? " · " + crNum(res.failed) + " could not be delivered" : "") + ".", null, !!res.failed);
    await crMoRemindPreview(ctx);
  } catch (e) { ctx.toast(crMoErr(e, "Couldn’t send the reminders."), null, true); }
}

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
  const pick = v => { ctx.closeDrawer(); ctx.setSub(v); };
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

function crMoFinesBlocks(d, ctx) {
  const p = d.finePlan, out = [];
  if (!p) {
    out.push({ type: "note", span: 6, icon: "upload-simple", text: "Upload a sheet of fines — the register a coordinator kept on paper, typed up.",
      sub: "Each row is matched to one member and shown before anybody is charged. A name or email shared by two members is refused, never guessed. Reasons: late, absent, equipment, conduct, or anything else (kept as the written reason).",
      act: { l: "Upload fines", run: () => crMoFineCheck(ctx) } });
    return out;
  }
  const t = p.res.tally || {}, dry = !!p.res.dryRun;
  out.push({ type: "note", span: 6, icon: t.failed ? "warning-circle" : "check-circle", tone: t.failed ? "warn" : "ok",
    text: (dry ? "Checked “" : "Posted from “") + p.name + "”: " + crMoFineTally(t, dry) + ".",
    sub: dry ? (t.fine ? "Nothing is posted until you press Post. Refused rows are listed with the reason; fix them in the file and check it again, or post the rest." : "There is nothing to post: every row is already posted, empty or refused.") : "Each fine is on the member’s account and in their next reminder.",
    act: dry && t.fine ? { l: "Post " + crPlural(t.fine, "fine"), run: () => crMoFinePost(ctx) } : { l: "Upload another file", run: () => crMoFineCheck(ctx) } });
  const verdict = r => r.verdict === "skipped" ? ["Skipped: no fine", "neutral"] : r.verdict === "failed" ? ["Refused: " + (CR_MO_FINE_ERR[r.error] || String(r.error || "").replace(/_/g, " ")), "bad"]
    : r.verdict === "fine" ? [dry ? "To post" : "Posted", "ok"] : ["Already posted", "neutral"];
  out.push({ type: "table", span: 6, title: "The check, row by row", nosel: true,
    cols: [{ l: "Row", num: true }, { l: "Member", wrap: true }, "Matched by", { l: "Amount", num: true }, { l: "Reason", wrap: true }, "Result"],
    rows: (p.res.rows || []).map(r => ({ key: "r" + r.row, cells: [
      { k: "num", t: crNum(r.row), v: r.row },
      { k: "text", t: r.fullName || "—", s: (r.displayId || r.memberId || "") + (r.candidates && r.candidates.length ? (r.displayId || r.memberId ? " · " : "") + "Could be: " + r.candidates.slice(0, 3).map(c => c.fullName + " (" + (c.displayId || c.memberId) + ")").join(", ") + (r.candidates.length > 3 ? " and " + crNum(r.candidates.length - 3) + " more" : "") : "") },
      { k: "text", t: r.matchedBy ? (CR_MO_MATCHED[r.matchedBy] || r.matchedBy) : "", s: r.matchedBy === "name" || r.matchedBy === "name_any" ? "Weak match — check it" : "" },
      { k: "num", t: r.amount ? fmtMoney(r.amount) : "", v: r.amount || 0 },
      { k: "text", t: r.reasonLabel ? r.reasonLabel + (r.date ? " · " + r.date : "") : "", s: r.note || "" },
      { k: "status", t: verdict(r)[0], tone: verdict(r)[1] },
    ] })),
    filters: ["Result"], search: "Search the rows" });
  return out;
}

function crMoRemindBlocks(d, ctx) {
  const cfg = d.cfg, p = d.prev, out = [];
  if (!cfg.enabled || !cfg.remindEnabled) {
    out.push({ type: "note", span: 6, icon: "bell-slash", tone: "warn", text: "Reminders are switched off, so nothing is being sent.",
      sub: !cfg.enabled ? "Dues themselves are switched off." : "Turn them on under Amounts to start.", act: { l: "Open Amounts", run: () => ctx.setSub("amounts") } });
    return out;
  }
  out.push({ type: "note", span: 6, icon: "bell",
    text: "Reminders go out automatically, at most once every " + crPlural(cfg.remindEveryDays, "day") + " per family.",
    sub: "The background job checks far more often than that; the spacing decides, so nobody is chased faster than you set it. A family is only included when they have something payable — a training fee that service is writing off is not money owed.",
    act: { l: p ? "Refresh" : "See who would be reminded", run: () => crMoRemindPreview(ctx) } });
  if (p) {
    const s = p.skipped || {};
    const why = [[s.nothingPayable, "nothing payable"], [s.tooSoon, "reminded recently"], [s.optedOut, "asked not to be reminded"], [s.underMinimum, "under the minimum balance"], [s.noEmail, "no guardian email on file"]]
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
      { h: "Reminders", rows: [
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
      const d = { cfg: s.fees, B, defaults: s.defaults || {}, arr, acct, rev: 0,
        up: up ? Object.assign({}, up.uprate, { maxPct: up.maxPct }) : null,
        finePlan: (ctx.data && ctx.data.finePlan) || null, prev: prev || null, trainServer: crMoTrainServer() };
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
      if (ctx.sub === "fines") {
        out.push({ l: "Upload fines", icon: "upload-simple", run: () => crMoFineCheck(ctx) });
        if (d.finePlan) out.push({ l: "Discard the check", icon: "x", run: () => ctx.setData(x => Object.assign({}, x, { finePlan: null })) });
        out.push({ l: "Download template", icon: "download-simple", run: () => crMoDownload("ngg-fines-template.csv", CR_MO_FINE_TEMPLATE) });
      }
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
      const body = view === "training" ? crMoTrainingBlocks(d, ctx) : view === "fines" ? crMoFinesBlocks(d, ctx) : view === "reminders" ? crMoRemindBlocks(d, ctx) : view === "amounts" ? crMoAmountsBlocks(d, ctx) : crMoOwesBlocks(d, ctx);
      return out.concat(body);
    },
    facts: d => "Payable " + fmtMoney((d.arr && d.arr.totalPayable) || 0) + " across " + crPlural((d.arr && d.arr.matched) || 0, "member") + ". Dues " + (d.cfg.enabled ? "on" : "off") + "; monthly dues " + fmtMoney(d.cfg.monthlyDues) + ", training fee " + fmtMoney(d.cfg.trainingFee) + ".",
  },
});
