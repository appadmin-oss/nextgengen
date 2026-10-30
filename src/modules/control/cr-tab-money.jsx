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
/* ── Reading a fines sheet the way a person would ──────────────────────────
   Registers arrive as they were kept: a title line or two above the headings,
   "S/N" and "Names" for columns, one column per kind of fine ("Late",
   "Absent", "Total"), a TOTAL line at the bottom, a sheet per centre. The old
   reader took row one as the headings and looked for exact words, so a
   register with a title above it read as "no column for who is being fined".
   This finds the heading row, recognises a heading by what it means, splits a
   row with a column per kind into one fine per kind, and skips totals — and
   then SAYS how it read the file, so nobody has to trust it blind. Every
   matching decision is still the server's (fees.php, admin_fees_fine_import). */
const CR_MO_FINE_REASON_COLS = [["late", /\blate|lateness|tard/], ["absent", /absen|missed|truan/], ["equipment", /equip|damage|lost|broke/], ["conduct", /conduct|behaviou?r|indisciplin|misconduct/]];
function crMoFineHeadKey(h) { return String(h || "").toLowerCase().replace(/[₦#]/g, " naira ").replace(/\((n|ngn|naira)\)|\[(n|ngn)\]/g, " naira ").replace(/[^a-z0-9@/ ]+/g, " ").replace(/\s+/g, " ").trim(); }
/** What a heading means: a field, ["byReason", code], or null. */
function crMoFineField(h) {
  const k = crMoFineHeadKey(h);
  if (!k) return null;
  if (/^(s ?\/? ?n|sn|no|serial|s no|sno|#)$/.test(k)) return "serial";
  if (/e ?mail/.test(k)) return "email";
  if (/^(id|member|card|member no|member number|member id|memberid|display id|displayid|reg no|registration no|registration number|ngg id|ngg no|card no|card number|id no|id number)$/.test(k) || /\b(member|reg|registration|card|ngg) ?(id|no|number)\b/.test(k)) return "member";
  if (/centre|center|branch|location|venue/.test(k)) return "centre";
  if (/\b(date|day|when)\b/.test(k) || k === "on") return "date";
  if (/reason|offen[cs]e|violation|category|why|^type$|^kind$/.test(k)) return "reason";
  if (/note|comment|remark|detail|description/.test(k)) return "note";
  if (/name|pupil|student|child|learner|member name/.test(k)) return "name";
  if (/total|grand|^sum$/.test(k)) return "total";
  const byR = CR_MO_FINE_REASON_COLS.find(x => x[1].test(k));
  if (byR) return ["byReason", byR[0]];
  if (/amount|fine|naira|ngn|owed|owing|balance|outstanding|charge|due|^n$/.test(k)) return "amount";
  return null;
}
const CR_MO_FINE_WHO = ["member", "name", "email"];
/** One sheet (a grid of strings) → fines rows, and a plain account of how it was read. */
function crMoFineSheet(grid, sheetName) {
  let best = null;
  for (let i = 0; i < Math.min(20, grid.length); i++) {
    const map = (grid[i] || []).map(crMoFineField);
    const fields = new Set(map.filter(Boolean).map(f => Array.isArray(f) ? "byReason" : f));
    const who = CR_MO_FINE_WHO.some(f => fields.has(f)), money = ["amount", "total", "byReason"].some(f => fields.has(f));
    const score = fields.size + (who ? 3 : 0) + (money ? 3 : 0);
    if (!best || score > best.score) best = { i, map, score, who, money };
  }
  if (!best || !best.who || !best.money) return { rows: [], how: { sheet: sheetName, unreadable: true, who: !!(best && best.who), money: !!(best && best.money) } };
  const head = grid[best.i], map = best.map;
  const col = f => map.findIndex(x => x === f);
  const reasonCols = map.map((x, k) => Array.isArray(x) ? [k, x[1]] : null).filter(Boolean);
  const amountCol = col("amount") >= 0 ? col("amount") : col("total");
  const headKey = head.map(crMoFineHeadKey).join("|");
  const rows = []; let totals = 0, repeats = 0;
  const cell = (r, f) => { const k = col(f); return k >= 0 ? String(r[k] == null ? "" : r[k]).trim() : ""; };
  for (let i = best.i + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    if (!r.some(c => String(c || "").trim() !== "")) continue;
    if (r.map(crMoFineHeadKey).join("|") === headKey) { repeats++; continue; }   // the heading repeated at a page break
    if (r.slice(0, 4).some(c => /^(grand\s*)?(sub-?)?total\b|^sum\b/i.test(String(c || "").trim()))) { totals++; continue; }
    const base = { member: cell(r, "member"), name: cell(r, "name"), email: cell(r, "email"), reason: cell(r, "reason"), date: cell(r, "date"), note: cell(r, "note"),
      centre: cell(r, "centre") || (col("centre") < 0 && sheetName && !/^sheet\s*\d+$/i.test(sheetName) ? sheetName : ""), src: (sheetName ? sheetName + " · " : "") + "row " + (i + 1) };
    if (/^\d{5}(\.\d+)?$/.test(base.date)) base.date = new Date(Date.UTC(1899, 11, 30) + Math.floor(+base.date) * 86400000).toISOString().slice(0, 10);
    // One column per kind of fine: one fine per filled column, its kind the reason. The total is then only a sum, and ignored.
    const split = reasonCols.map(([k, code]) => [String(r[k] == null ? "" : r[k]).trim(), code]).filter(([v]) => v !== "" && !/^(0+(\.0+)?|-|—|nil|null|none|n\/a)$/i.test(v));
    if (split.length) split.forEach(([v, code]) => rows.push(Object.assign({}, base, { amount: v, reason: base.reason || code, src: base.src + " · " + code })));
    else rows.push(Object.assign({}, base, { amount: amountCol >= 0 ? String(r[amountCol] == null ? "" : r[amountCol]).trim() : "" }));
  }
  const used = map.map((f, k) => f && f !== "serial" ? [head[k], Array.isArray(f) ? f[1] + " fines" : f] : null).filter(Boolean);
  const ignored = head.filter((h, k) => String(h || "").trim() && (!map[k] || map[k] === "serial" || (map[k] === "total" && reasonCols.length)));
  return { rows, how: { sheet: sheetName, headerRow: best.i + 1, used, ignored, totals, repeats, split: reasonCols.length > 0 } };
}
const CR_MO_FINE_TEMPLATE = "member,name,email,amount,reason,date,note\n026-014,,,2000,late,2026-10-04,\n,Ada Okafor,okafor.family@example.com,5000,conduct,04/10/2026,Fighting during break\n";
const CR_MO_FINE_ERR = {
  ambiguous: "more than one member matches", no_match: "no member matches", member_required: "no member given",
  not_ngg_member: "not an NGG member", out_of_scope: "outside your centres", bad_amount: "amount unreadable",
  reason_required: "no reason", note_required: "say why", bad_date: "date unreadable", duplicate_in_file: "repeated in this file",
  post_failed: "could not be posted", no_amount: "no fine on this row", date_in_future: "dated in the future — day and month swapped?",
  rule_off: "that rule is switched off in Conduct & fines", cap_reached: "that rule's cap for this term is already reached",
};
const CR_MO_MATCHED = { id: "ID", email: "email", "email+centre": "email + centre", "email+name": "email + name", name: "name only", "name+centre": "name + centre",
  name_any: "name, words reordered", "name_any+centre": "name reordered + centre", name_part: "name, part of it", "name_part+centre": "part of the name + centre" };

/* The sheet readers are the curriculum import's (cr-tab-learning.jsx): one CSV
   and one .xlsx reader in the Control Room, not two. Every sheet of a
   workbook is read; a sheet with nothing like a register on it is reported,
   not guessed at. */
async function crMoReadFines(file) {
  if (/\.(xls|numbers|pdf|docx?)$/i.test(file.name)) throw Object.assign(new Error("bad_file"), { data: { message: "That file type can’t be read here. Save it as .xlsx or CSV." } });
  const sheets = /\.xlsx$/i.test(file.name) ? await crCurXlsxGrids(await file.arrayBuffer()) : [{ name: "", grid: crCurParseCsv(await file.text(), true) }];
  const read = sheets.map(sh => crMoFineSheet(sh.grid, sheets.length > 1 ? sh.name : ""));
  return { rows: [].concat(...read.map(x => x.rows)), how: read.map(x => x.how) };
}
/** How the file was read, in a sentence a coordinator can check against the sheet. */
function crMoFineHow(how) {
  return (how || []).map(h => {
    const where = h.sheet ? "Sheet “" + h.sheet + "”: " : "";
    if (h.unreadable) return where + "not read — no " + (!h.who ? "column for who" : "column for the amount") + " was found.";
    return where + "headings on row " + h.headerRow + " — " + h.used.map(u => "“" + u[0] + "” as " + u[1]).join(", ")
      + (h.ignored.length ? "; ignored " + h.ignored.map(x => "“" + x + "”").join(", ") : "")
      + (h.split ? "; a column per kind of fine, so each filled one is its own fine" : "")
      + (h.totals ? "; " + crPlural(h.totals, "total line") + " skipped" : "") + (h.repeats ? "; " + crPlural(h.repeats, "repeated heading") + " skipped" : "") + ".";
  }).join(" ");
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
    intro: "An Excel workbook (.xlsx) or a CSV, as the register was kept: a title above the headings, “S/N” and “Names”, a column per kind of fine and a TOTAL line are all fine, and every sheet of a workbook is read. A member is found by printed ID or member number first (also written inside the name, like “Ada Okafor (026-014)”), then email, then name — a name shared by two members is settled by the centre column or the sheet’s name, never guessed. Uploading the same sheet twice fines nobody twice. Nothing is posted until you have read the check and pressed Post.",
    fields: [
      { id: "file", l: "File", type: "file", req: true, accept: ".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { id: "reason", l: "Reason for rows that give none", max: 120, ph: "late, absent, conduct — or words such as “Outstanding fine, term 1”", help: "Used only on rows with no reason (and no note that names one), and checked with them." },
    ],
    onSubmit: async v => {
      const read = await crMoReadFines(v.file);
      const rows = read.rows, how = read.how;
      if (!rows.length) {
        const why = how.find(h => h.unreadable);
        return { fieldErrors: { file: why ? (why.who ? "That sheet has no column for the amount. Name a column “Fine” or “Amount” (or one per kind: “Late”, “Absent”…)." : "That sheet has no column for who is being fined. Name a column “Name”, “Member ID” or “Email”.") : "No fines found in that file." } };
      }
      const rs = String(v.reason || "").trim();
      const sent = rows.map(r => r.reason || !rs ? r : Object.assign({}, r, { reason: rs }));
      let res;
      try { res = await NGGApi.admin.fees.fineImport(sent.map(r => { const o = Object.assign({}, r); delete o.src; return o; }), { dryRun: true }); }
      catch (e) { if (e && (e.code === "too_many" || (e.data && e.data.error === "too_many"))) return { fieldErrors: { file: "That is more than " + crNum((e.data && e.data.max) || 500) + " fines in one file. Split it." } }; throw e; }
      ctx.setData(x => Object.assign({}, x, { finePlan: { rows: sent, res, name: v.file.name, how } }));
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
    const r = await NGGApi.admin.fees.fineImport(p.rows.map(x => { const o = Object.assign({}, x); delete o.src; return o; }), { digest: p.res.digest });
    ctx.setData(x => Object.assign({}, x, { finePlan: { rows: p.rows, res: r, name: p.name, how: p.how } }));
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

/* ── Every active member's fines, cleared ONCE (fees.php, admin_fees_fines_clear_once) ──
   Super admin only, a current authenticator code, the typed phrase and a
   reason, applied exactly as previewed; afterwards the server refuses it for
   ever and this screen shows the record of the one run instead. */
const CR_MO_CLEAR_ERR = { already_used: "Fines have already been cleared once. It cannot be done again.", bad_code: "That is not the current code from your authenticator app.",
  totp_required: "Set up an authenticator app on your own account first (Account → Security).", phrase_mismatch: "Type the phrase exactly as shown.",
  reason_required: "Say why, in a sentence.", too_many_attempts: "Too many wrong codes. Wait fifteen minutes, then try again.", import_changed: "The fines changed since the preview. Preview again.", forbidden: "Only a super admin can do this." };
function crMoClearErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code); return CR_MO_CLEAR_ERR[c] || crErr(e, fb); }
async function crMoClearPreview(ctx) {
  try { const r = await NGGApi.admin.fees.finesClearOnce("preview"); ctx.setData(x => Object.assign({}, x, { clearPlan: r })); }
  catch (e) { ctx.toast(crMoClearErr(e, "Couldn’t work out whose fines would be cleared."), null, true); }
}
function crMoClearRun(ctx) {
  const plan = ctx.data.clearPlan; if (!plan) return;
  const phrase = plan.phrase || "CLEAR ALL FINES";
  ctx.form({
    title: "Clear the fines of " + crPlural(plan.members, "active member") + " — " + fmtMoney(plan.total), submit: "Clear them, once", busyLabel: "Clearing…",
    intro: "This waives every unpaid fine on the accounts listed, records why, and then locks itself for good: nobody, you included, can run it again. Dues, membership and the training fee are not touched. Fines issued after today are owed as normal.",
    values: { reason: "", phrase: "", code: "" },
    fields: [
      { id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 240, ph: "Fines carried over from the paper register before this system, cleared by decision of the board" },
      { id: "phrase", l: "Type " + phrase + " to confirm", req: true, max: 40, ph: phrase, check: v => v.trim() === phrase ? "" : "Type " + phrase + " exactly." },
      { id: "code", l: "Code from your authenticator app", req: true, im: "numeric", max: 6, ph: "6 digits", check: v => /^\d{6}$/.test(v.trim()) ? "" : "Six digits." },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.fees.finesClearOnce("run", { digest: plan.digest, reason: v.reason.trim(), phrase: v.phrase.trim(), code: v.code.trim() }); }
      catch (e) {
        const c = e && ((e.data && e.data.error) || e.code);
        if (c === "bad_code") return { fieldErrors: { code: CR_MO_CLEAR_ERR.bad_code } };
        if (c === "phrase_mismatch") return { fieldErrors: { phrase: CR_MO_CLEAR_ERR.phrase_mismatch } };
        if (c === "reason_required") return { fieldErrors: { reason: CR_MO_CLEAR_ERR.reason_required } };
        throw Object.assign(new Error(c || "failed"), { data: { message: crMoClearErr(e, "Couldn’t clear the fines. Nothing was written.") } });
      }
    },
    done: (v, r) => { ctx.setData(x => Object.assign({}, x, { once: { used: true, lock: r.lock, canRun: false }, clearPlan: null })); crMoRefresh(crMoCtx.current || ctx); return fmtMoney(r.total) + " of fines cleared across " + crPlural(r.members, "member") + ". This is now locked."; },
  });
}
function crMoClearBlocks(d, ctx) {
  const o = d.once; if (!o) return [];
  if (o.used && o.lock) {
    const l = o.lock;
    return [{ type: "note", span: 6, icon: "lock-simple", text: "Fines were cleared once for every active member — " + crDate(l.usedAt) + ", by " + (l.usedByName || l.usedBy) + ": " + crPlural(l.members, "member") + ", " + fmtMoney(l.total) + ".",
      sub: "Why: " + (l.reason || "—") + " This can never be run again. Every cleared fine stays on its account with the waiver beside it." }];
  }
  if (!o.canRun) return [];
  const p = d.clearPlan;
  if (!p) return [{ type: "note", span: 6, icon: "broom", tone: "gold", text: "Clear the fines of every active member — once.",
    sub: "For fines carried over from before this system. You will see every account and amount first. Running it needs a reason, a typed phrase and a code from your authenticator app, and afterwards it is locked away for good.",
    act: { l: "See whose fines would be cleared", run: () => crMoClearPreview(ctx) } }];
  return [
    { type: "note", span: 6, icon: p.members ? "warning" : "check-circle", tone: p.members ? "warn" : "ok",
      text: p.members ? crPlural(p.members, "active member") + " with unpaid fines — " + fmtMoney(p.total) + " in all." : "No active member has an unpaid fine. There is nothing to clear.",
      sub: p.members ? "Read the list. Only unpaid fines are cleared; a fine already paid stays paid. The run applies exactly this list." : "Nothing is locked: it stays available until it is used.",
      act: p.members ? { l: "Clear these fines, once…", run: () => crMoClearRun(ctx) } : { l: "Close", run: () => ctx.setData(x => Object.assign({}, x, { clearPlan: null })) } },
    p.members ? { type: "table", span: 6, title: "Fines that would be cleared", nosel: true, search: "Search the list",
      cols: ["Member", "Centre", { l: "Unpaid fines", num: true }],
      rows: (p.rows || []).map(r => ({ key: r.memberId, open: () => crMoOpen(ctx, r.memberId), cells: [
        { k: "person", t: r.fullName, s: r.displayId || r.memberId }, { k: "text", t: r.centre || "—" }, { k: "num", t: fmtMoney(r.amount), v: r.amount }] })) } : null,
  ].filter(Boolean);
}

function crMoFinesBlocks(d, ctx) {
  const p = d.finePlan, out = crMoClearBlocks(d, ctx);
  if (!p) {
    out.push({ type: "note", span: 6, icon: "upload-simple", text: "Upload a sheet of fines — the register a coordinator kept on paper, typed up.",
      sub: "Each row is matched to one member and shown before anybody is charged. A name or email shared by two members is refused unless the centre settles it, never guessed. Reasons: late, absent, equipment, conduct, or anything else (kept as the written reason) — read from a reason column, a column per kind, or the note. The check shows what the Club's conduct rules will really let post.",
      act: { l: "Upload fines", run: () => crMoFineCheck(ctx) } });
    return out;
  }
  const t = p.res.tally || {}, dry = !!p.res.dryRun;
  out.push({ type: "note", span: 6, icon: t.failed ? "warning-circle" : "check-circle", tone: t.failed ? "warn" : "ok",
    text: (dry ? "Checked “" : "Posted from “") + p.name + "”: " + crMoFineTally(t, dry) + ".",
    sub: dry ? (t.fine ? "Nothing is posted until you press Post. Refused rows are listed with the reason; fix them in the file and check it again, or post the rest." : "There is nothing to post: every row is already posted, empty or refused.") : "Each fine is on the member’s account and in their next reminder.",
    act: dry && t.fine ? { l: "Post " + crPlural(t.fine, "fine"), run: () => crMoFinePost(ctx) } : { l: "Upload another file", run: () => crMoFineCheck(ctx) } });
  if (p.how && p.how.length) out.push({ type: "note", span: 6, icon: "table", text: "How the file was read", sub: crMoFineHow(p.how) });
  const capped = (p.res.rows || []).filter(r => r.capped && r.verdict === "fine");
  if (capped.length) out.push({ type: "note", span: 6, icon: "scales", tone: "warn", text: crPlural(capped.length, "fine") + " will post less than the sheet says.",
    sub: "A conduct rule caps that kind of fine per term (Conduct & fines). The amount shown is what will really post; the sheet’s figure is beside it." });
  const src = r => ((p.rows || [])[r.row - 1] || {}).src || "Row " + r.row;
  const verdict = r => r.verdict === "skipped" ? ["Skipped: no fine", "neutral"] : r.verdict === "failed" ? ["Refused: " + (CR_MO_FINE_ERR[r.error] || String(r.error || "").replace(/_/g, " ")), "bad"]
    : r.verdict === "fine" ? [(dry ? "To post" : "Posted") + (r.capped ? " (capped)" : ""), r.capped ? "warn" : "ok"] : ["Already posted", "neutral"];
  out.push({ type: "table", span: 6, title: "The check, row by row", nosel: true,
    cols: [{ l: "In the sheet", wrap: true }, { l: "Member", wrap: true }, "Matched by", { l: "Amount", num: true }, { l: "Reason", wrap: true }, "Result"],
    rows: (p.res.rows || []).map(r => ({ key: "r" + r.row, cells: [
      { k: "text", t: src(r), v: r.row },
      { k: "text", t: r.fullName || "—", s: (r.displayId || r.memberId || "") + (r.candidates && r.candidates.length ? (r.displayId || r.memberId ? " · " : "") + "Could be: " + r.candidates.slice(0, 3).map(c => c.fullName + " (" + (c.displayId || c.memberId) + ")").join(", ") + (r.candidates.length > 3 ? " and " + crNum(r.candidates.length - 3) + " more" : "") : "") },
      { k: "text", t: r.matchedBy ? (CR_MO_MATCHED[r.matchedBy] || r.matchedBy) : "", s: /^name/.test(r.matchedBy || "") ? "Weak match — check it" : "" },
      { k: "num", t: r.amount ? fmtMoney(r.amount) : "", v: r.amount || 0 },
      { k: "text", t: r.reasonLabel ? r.reasonLabel + (r.date ? " · " + r.date : "") : "", s: (r.capped ? "The sheet said " + fmtMoney(r.asked) + "; the rule’s cap allows this. " : "") + (r.note || "") },
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
      const [s, up, once] = await Promise.all([NGGApi.admin.fees.settings(), NGGApi.admin.fees.upratePreview().catch(() => null),
        NGGApi.admin.fees.finesClearOnce("status").catch(() => null)]);
      const B = s.bounds || {};
      const arr = await NGGApi.admin.fees.arrears(B.arrearsPage);
      const id = crMoAcctId(ctx.sub);
      const acct = id ? await crMoLoadAccount(id).catch(() => null) : null;
      const prev = ctx.data && ctx.data.prev;
      const d = { cfg: s.fees, B, defaults: s.defaults || {}, arr, acct, rev: 0,
        up: up ? Object.assign({}, up.uprate, { maxPct: up.maxPct }) : null,
        finePlan: (ctx.data && ctx.data.finePlan) || null, prev: prev || null, trainServer: crMoTrainServer(),
        once: once || null, clearPlan: (ctx.data && ctx.data.clearPlan) || null };
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
