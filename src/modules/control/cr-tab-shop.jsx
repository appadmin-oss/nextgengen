/* ============================================================================
   Control Room v2 — the NGG shop (domain/shop.php, domain/shop-manage.php;
   docs/SHOP-MANAGEMENT-PLAN.md). Filled into CR_TAB_DEFS (see cr-pages.jsx).
   Two trusts, as the server gates them:

     shop-today     `fees`             the four numbers that drive the day
     shop-orders    `fees`             orders: paid → ready → collected/delivered,
                                       refunds, exchanges, notes, pick lists
     shop-sell      `fees`             a sale at a table, and cash sessions
     shop-stock     `content` | `fees` the stock ledger: low stock, stock-take,
                                       adjustments (writing is `content`)
     shop-products  `content`          the catalogue
     shop-codes     `fees`             discount codes
     shop-reports   `fees`             sales, fees, refunds and net; CSV
     shop-settings  `fees`             open / close, delivery, unpaid orders

   Every price, limit and verdict is the server's. Bounds come from the
   server's `bounds` / `max`; a refusal is shown on the field it names.

   Bulk steps on orders use the table block's bulk (the Control Room v2 action
   layer, CONTRACT.md) rather than runAdminAction: that one answers through the
   v1 toast and dialog, which this shell does not draw. The rules are the same:
   the count is read before the confirm, each order gets the server's own
   verdict, and a partial run is reported as partial (adminFailSummary).
   ========================================================================== */

const CR_SHOP_STATUS = {
  pending: ["Waiting for payment", "neutral"], paid: ["Paid", "warn"], ready: ["Ready", "gold"],
  completed: ["Completed", "ok"], cancelled: ["Cancelled", "bad"],
};
const CR_SHOP_REFUND = { due: ["Refund due", "bad"], pending: ["Refund pending", "warn"], partial: ["Part refunded", "neutral"], full: ["Refunded", "neutral"] };
const CR_SHOP_PSTATUS = { draft: ["Draft", "neutral"], live: ["On sale", "ok"], retired: ["Retired", "bad"] };
const CR_SHOP_METHOD = { paystack: "Paystack", cash: "Cash", transfer: "Bank transfer", pos: "POS terminal" };
const CR_SHOP_REASON = {
  sale: "Sold online", cancel: "Order cancelled", refund: "Refund, back on the shelf", exchange: "Exchange", pos: "Sold at a table",
  received: "Received", damaged: "Damaged", giveaway: "Given away", returned: "Returned to the shelf", correction: "Correction", recount: "Stock-take",
};
const CR_SHOP_ERR = {
  bad_step: "That step isn’t possible for this order any more.", changed: "The order changed while you were looking. It has been reloaded.",
  reason_required: "Say why.", nothing_live: "Put at least one product on sale before opening the shop.",
  code_required: "Ask for the buyer’s pickup code, or say why it is handed over without one.", bad_code: "That pickup code does not match this order.",
  session_required: "Open a cash session first.", session_closed: "That session is closed.", too_soon: "The buyer was reminded less than an hour ago.",
  untracked: "This product has no stock limit.", note_required: "Add a note.",
};
const crShopCtx = { current: null };
function crShopErr(e, fb) { return CR_SHOP_ERR[e && e.code] && !(e.detail && /\s/.test(e.detail)) ? CR_SHOP_ERR[e.code] : crErr(e, fb); }
function crShopSt(s) { return CR_SHOP_STATUS[s] || [s || "—", "neutral"]; }
function crShopWhere(o) { return o.channel === "pos" ? "At a table" : o.fulfil === "deliver" ? "Delivery" : (o.centre || "—"); }
function crShopItem(l) { return l.name + (l.option ? " (" + l.option + ")" : ""); }
function crShopToday() { return new Date(Date.now() + 3600e3).toISOString().slice(0, 10); }   // Lagos
function crShopDaysAgo(n) { return new Date(Date.now() + 3600e3 - n * 86400e3).toISOString().slice(0, 10); }
function crShopEsc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

/* ── Printing: pick lists and packing slips ──────────────────────────────────
   The host has no renderer, so the browser prints: a plain document in a new
   window, black on white, with its own small stylesheet (it is a separate
   document; the Control Room's classes do not reach it). */
function crShopPrint(title, body) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write("<!doctype html><html lang=\"en-GB\"><head><meta charset=\"utf-8\"><title>" + crShopEsc(title) + "</title><style>"
    + "body{font:13px/1.45 system-ui,sans-serif;color:#000;margin:24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 6px}"
    + "p{margin:0 0 8px}table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{border-bottom:1px solid #999;padding:6px 4px;text-align:left;vertical-align:top}"
    + "th.n,td.n{text-align:right}.slip{page-break-after:always;padding-bottom:16px}.slip:last-child{page-break-after:auto}.mono{font-family:ui-monospace,monospace}"
    + ".tick{width:28px}.muted{color:#333}@media print{body{margin:12mm}}</style></head><body>" + body
    + "<script>window.onload=function(){window.print()}<\/script></body></html>");
  w.document.close();
  return true;
}
function crShopPickList(orders) {
  const tot = {};
  orders.forEach(o => o.lines.forEach(l => { const k = crShopItem(l); tot[k] = (tot[k] || 0) + l.qty; }));
  const keys = Object.keys(tot).sort();
  const body = "<h1>Pick list</h1><p class=\"muted\">" + crShopEsc(orders.length + " order" + (orders.length === 1 ? "" : "s") + " · printed " + new Date().toLocaleString("en-GB")) + "</p>"
    + "<table><thead><tr><th class=\"tick\"></th><th>Item</th><th class=\"n\">Quantity</th></tr></thead><tbody>"
    + keys.map(k => "<tr><td>☐</td><td>" + crShopEsc(k) + "</td><td class=\"n\">" + tot[k] + "</td></tr>").join("") + "</tbody></table>"
    + "<h2>By order</h2><table><thead><tr><th>Order</th><th>Buyer</th><th>Where</th><th>Items</th></tr></thead><tbody>"
    + orders.map(o => "<tr><td class=\"mono\">" + crShopEsc(o.orderId) + "</td><td>" + crShopEsc(o.buyerName) + "</td><td>" + crShopEsc(crShopWhere(o)) + "</td><td>"
      + o.lines.map(l => crShopEsc(l.qty + " × " + crShopItem(l))).join("<br>") + "</td></tr>").join("") + "</tbody></table>";
  return crShopPrint("Pick list", body);
}
/** One slip per order. Never the pickup code: the slip travels with the parcel, and the code is the buyer's proof. */
function crShopSlips(orders) {
  const body = orders.map(o => "<div class=\"slip\"><h1>NGG shop · " + crShopEsc(o.orderId) + "</h1>"
    + "<p><b>" + crShopEsc(o.buyerName) + "</b> · " + crShopEsc(o.phone || "") + "</p>"
    + "<p>" + (o.fulfil === "deliver" ? "Deliver to: " + crShopEsc(o.address) : "Collect at: " + crShopEsc(o.centre) + " (ask for the pickup code)") + "</p>"
    + "<table><thead><tr><th class=\"tick\"></th><th>Item</th><th class=\"n\">Quantity</th></tr></thead><tbody>"
    + o.lines.map(l => "<tr><td>☐</td><td>" + crShopEsc(crShopItem(l)) + "</td><td class=\"n\">" + l.qty + "</td></tr>").join("") + "</tbody></table>"
    + "<p class=\"muted\">Ordered " + crShopEsc(o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-GB") : "") + ". Thank you for supporting NGG.</p></div>").join("");
  return crShopPrint("Packing slips", body);
}

/* ── Today ── */
Object.assign(CR_TAB_DEFS, {
  "shop-today": {
    skeleton: ["kpis", "cards"],
    load: async () => {
      const [r, s] = await Promise.all([NGGApi.admin.shop.report({ from: crShopDaysAgo(29), to: crShopToday() }), NGGApi.admin.shop.settings().catch(() => null)]);
      return { r, settings: s };
    },
    actions: (d, ctx) => [
      { l: "Sell at a table", icon: "cash-register", primary: true, run: () => ctx.go("shop", "shop-sell") },
      { l: "Reports", icon: "chart-bar", run: () => ctx.go("shop", "shop-reports") },
    ],
    blocks: (d, ctx) => {
      const t = d.r.today || {}, out = [];
      const S = d.settings && d.settings.settings;
      if (S && !S.enabled) out.push({ type: "note", span: 6, icon: "pause-circle", tone: "warn", text: "The shop is closed. Nobody can order online until it is opened.", act: { l: "Open settings", run: () => ctx.go("shop", "shop-settings") } });
      if (d.settings && !d.settings.paystack) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "Online payment isn’t set up, so the shop cannot take online orders or refund through Paystack.", sub: "Add the Paystack secret key under Settings → API keys, and point the Paystack webhook at /api/hooks/paystack.php." });
      out.push({ type: "kpis", span: 6, items: [
        { l: "To prepare", v: crNum(t.toPrepare || 0), tone: "flat", s: "Paid, not yet packed" },
        { l: "Waiting to be handed over", v: crNum(t.ready || 0), tone: "flat", s: "Ready, not yet collected or delivered" },
        { l: "Low or sold out", v: crNum((t.low || 0) + (t.out || 0)), tone: "flat", s: crNum(t.low || 0) + " low · " + crNum(t.out || 0) + " sold out" },
        { l: "Sales today", v: fmtMoney((t.salesToday || {}).net || 0), tone: "flat", s: "Net of Paystack’s fees · " + fmtMoney((t.salesWeek || {}).net || 0) + " this week" },
      ] });
      out.push({ type: "attention", span: 3, title: "Needs someone", empty: "Nothing is waiting on anyone.", rows: [
        { n: t.toPrepare || 0, l: "to pack or send", s: "Paid orders", tone: "warn", onClick: () => ctx.go("shop", "shop-orders", "paid"), age: 3 },
        { n: t.refundsDue || 0, l: "refunds due", s: "Cancelled after payment, not yet refunded", tone: "bad", onClick: () => ctx.go("shop", "shop-orders", "refund_due"), age: 4 },
        { n: t.out || 0, l: "sold out", s: "On sale with nothing left", tone: "bad", onClick: () => ctx.go("shop", "shop-stock"), age: 2 },
        { n: t.low || 0, l: "low on stock", s: "At or below their line", tone: "warn", onClick: () => ctx.go("shop", "shop-stock"), age: 1 },
        { n: t.unpaid || 0, l: "waiting for payment", s: "They hold no stock and expire by themselves", tone: "neutral", onClick: () => ctx.go("shop", "shop-orders", "pending"), age: 0 },
      ] });
      const best = (d.r.byProduct || []).slice(0, 8);
      out.push({ type: "bars", span: 3, title: "Best sellers", sub: "The last 30 days, by items sold", empty: "Nothing sold in the last 30 days.",
        rows: best.map(r => [crShopItem({ name: r.name, option: r.variant }), r.qty]) });
      return out;
    },
  },
});

/* ── Orders ── */
/** One step for several orders, each answered by the server; a partial run says so. */
async function crShopStepMany(ctx, ids, to) {
  const count = ids.length;   // read once, before the confirm
  const verb = to === "ready" ? "ready" : "delivered";
  const ok = await ctx.confirm({ title: "Mark " + crPlural(count, "order") + " " + verb + "?",
    body: to === "ready" ? "Each buyer is emailed that their order is ready to collect, or on its way." : "For deliveries in the buyer’s hands. A collection needs its pickup code, so it is refused here and done one at a time. It cannot be undone.", cta: "Mark " + verb });
  if (!ok) return false;
  const results = [];
  for (const id of ids) {
    try { const r = await NGGApi.admin.shop.orderSet(id, to); results.push({ id, ok: true, unchanged: !!(r && r.unchanged) }); }
    catch (e) { results.push({ id, ok: false, error: e.code || "failed" }); }
  }
  const bad = results.filter(r => !r.ok).length, same = results.filter(r => r.ok && r.unchanged).length, done = count - bad - same;
  const why = adminFailSummary(results);
  ctx.toast(crPlural(done, "order") + " marked " + verb + (same ? " · " + crNum(same) + " already were" : "") + (bad ? " · " + crNum(bad) + " refused (" + why + ")" : "") + ".", null, bad > 0);
  ctx.reload();
}
async function crShopReopen(ctx, orderId) { try { const r = await NGGApi.admin.shop.order(orderId); crShopDrawer(ctx, r); } catch (_) { ctx.closeDrawer(); } }
function crShopReady(ctx, o) {
  ctx.closeDrawer();
  ctx.form({
    title: "Mark " + o.orderId + " ready", submit: "Mark ready", busyLabel: "Saving…",
    intro: o.fulfil === "deliver" ? o.buyerName + " is emailed that it is on its way, with the note below." : o.buyerName + " is emailed that it is ready to collect at " + o.centre + ", with their pickup code.",
    fields: o.fulfil === "deliver" ? [{ id: "tracking", l: "Delivery note", type: "textarea", rows: 2, max: 300, ph: "With GIG, waybill 12345. Arrives Thursday.", help: "Optional. Sent to the buyer." }] : [],
    onSubmit: async v => { const r = await NGGApi.admin.shop.orderSet(o.orderId, "ready", "", { tracking: String(v.tracking || "").trim() }); ctx.reload(); return r; },
    done: () => o.orderId + " is ready. The buyer has been told.",
  });
}
function crShopHandOver(ctx, o) {
  ctx.closeDrawer();
  if (o.fulfil === "deliver" || !o.hasPickupCode) {
    ctx.confirm({ title: (o.fulfil === "deliver" ? "Delivered: " : "Collected: ") + o.orderId + "?", body: "Use this when the goods are in " + o.buyerName + "’s hands. It cannot be undone.", cta: o.fulfil === "deliver" ? "Mark delivered" : "Mark collected" })
      .then(async ok => { if (!ok) return; try { await NGGApi.admin.shop.orderSet(o.orderId, "completed"); ctx.toast(o.orderId + " is completed."); } catch (e) { ctx.toast(crShopErr(e, "Couldn’t change that order."), null, true); } ctx.reload(); });
    return;
  }
  ctx.form({
    title: "Hand over " + o.orderId, submit: "Mark collected", busyLabel: "Checking…",
    intro: "Ask " + o.buyerName + " for the six-digit pickup code from their email or order page.",
    fields: [
      { id: "code", l: "Pickup code", im: "numeric", ac: "off", max: 6, ph: "000000", check: (v, all) => !String(v || "").trim() && !all.noCode ? "Enter the code, or hand it over without one." : "" },
      { id: "noCode", l: "They don’t have the code", type: "switch" },
      { id: "reason", l: "How you know it is theirs", type: "textarea", rows: 2, max: 300, when: v => !!v.noCode, req: true, help: "Kept on the order’s timeline.", check: v => String(v || "").trim().length < 5 ? "At least five characters." : "" },
    ],
    onSubmit: async v => {
      try { const r = await NGGApi.admin.shop.orderSet(o.orderId, "completed", v.noCode ? String(v.reason || "").trim() : "", v.noCode ? {} : { code: String(v.code || "").trim() }); ctx.reload(); return r; }
      catch (e) { if (e.code === "bad_code") return { fieldErrors: { code: crShopErr(e) } }; if (e.code === "code_required") return { fieldErrors: { reason: crShopErr(e) } }; throw e; }
    },
    done: () => o.orderId + " is collected.",
  });
}
function crShopCancel(ctx, o) {
  const paid = !!o.paidAt, online = o.channel !== "pos";
  ctx.closeDrawer();
  ctx.form({
    title: "Cancel " + o.orderId,
    intro: paid ? "This order is paid. Cancelling puts its stock back and tells " + o.buyerName + ". Choose how the money goes back." : "This order was never paid, so nothing is refunded.",
    submit: "Cancel the order", busyLabel: "Cancelling…",
    values: { refund: paid && online ? "paystack" : "later" },
    fields: [
      { id: "reason", l: "Why", type: "textarea", rows: 3, max: 300, req: paid, help: paid ? "At least five characters. It is kept on the order." : "", check: v => paid && String(v || "").trim().length < 5 ? "Say why, in at least five characters." : "" },
      paid ? { id: "refund", l: "The refund", type: "chips", opts: (online ? [["paystack", "Refund through Paystack now"]] : []).concat([["outside", "Paid back another way"], ["later", "Leave it due"]]),
        help: "Paystack refunds the goods and delivery (" + fmtMoney(o.total) + ") to the card or account; it takes up to 10 working days. Partial refunds are under Refund." } : null,
    ].filter(Boolean),
    onSubmit: async v => {
      try { const r = await NGGApi.admin.shop.orderSet(o.orderId, "cancelled", String(v.reason || "").trim(), paid ? { refund: v.refund } : {}); ctx.reload(); return r; }
      catch (e) { if (e.code === "reason_required") return { fieldErrors: { reason: crShopErr(e) } }; throw e; }
    },
    done: (v, r) => o.orderId + " is cancelled." + (!paid ? "" : r && r.refund ? (r.refund.ok === false ? " The refund could not be started; it is still due." : " Refund " + (r.refund.status === "processed" ? "recorded." : "sent to Paystack.")) : " The refund is due."),
  });
}
function crShopRefund(ctx, o, terms) {
  ctx.closeDrawer();
  const lines = terms.lines.filter(l => l.qty - l.returned > 0);
  ctx.form({
    title: "Refund " + o.orderId, submit: "Refund", busyLabel: "Refunding…",
    intro: "Charged " + fmtMoney(terms.charged) + (terms.committed ? ", of which " + fmtMoney(terms.committed) + " is already refunded or on its way" : "") + ". At most " + fmtMoney(terms.max) + " can go back.",
    values: { amount: String(terms.suggested), method: terms.paystack ? "paystack" : "outside" },
    fields: [
      { id: "amount", l: "Amount (₦)", im: "numeric", req: true, help: "Suggested: the goods and delivery. Paystack keeps its own charge, which the buyer paid on top.", check: v => { const n = Number(v); return !Number.isInteger(n) || n < 1 ? "Enter a whole number of naira." : n > terms.max ? "At most " + fmtMoney(terms.max) + "." : ""; } },
      { id: "method", l: "How", type: "chips", req: true, opts: (terms.paystack ? [["paystack", "Through Paystack"]] : []).concat([["outside", "Paid back another way (cash, transfer)"]]),
        help: terms.paystack ? "Through Paystack it waits as pending until Paystack confirms it; the buyer is emailed then." : "This sale was not paid through Paystack." },
      { id: "reason", l: "Why", type: "textarea", rows: 2, max: 300, req: true, check: v => String(v || "").trim().length < 3 ? "Say why." : "" },
    ].concat(lines.map(l => ({ id: "back" + l.i, l: "Back on the shelf: " + crShopItem(l), im: "numeric", help: "Up to " + (l.qty - l.returned) + ". Leave empty if it is not coming back.",
      check: v => v === "" || v == null ? "" : !/^\d+$/.test(String(v)) || Number(v) > l.qty - l.returned ? "From 0 to " + (l.qty - l.returned) + "." : "" }))),
    onSubmit: async v => {
      const restock = lines.map(l => ({ i: l.i, qty: Number(v["back" + l.i] || 0) })).filter(x => x.qty > 0);
      try { const r = await NGGApi.admin.shop.refund({ orderId: o.orderId, amount: Number(v.amount), method: v.method, reason: String(v.reason || "").trim(), restock }); ctx.reload(); return r; }
      catch (e) { if (e.code === "bad_amount") return { fieldErrors: { amount: crShopErr(e) } }; if (e.code === "bad_restock") return { fieldErrors: { ["back" + (lines[0] || {}).i]: crShopErr(e) } }; throw e; }
    },
    done: (v, r) => fmtMoney(Number(v.amount)) + (r && r.status === "processed" ? " refunded." : " sent to Paystack. It shows as refunded when Paystack confirms it."),
  });
}
function crShopExchange(ctx, o, d) {
  const choices = o.lines.map((l, i) => ({ l, i, opts: (d.lineOptions[i] || []).filter(x => x !== l.option) })).filter(c => c.opts.length);
  ctx.closeDrawer();
  ctx.form({
    title: "Exchange a size on " + o.orderId, submit: "Exchange", busyLabel: "Exchanging…",
    intro: "The item comes back to the shelf and the new size goes out, at the price charged. No money moves.",
    values: { line: String(choices[0].i), qty: "1" },
    fields: [
      { id: "line", l: "Item", type: "select", req: true, opts: choices.map(c => [String(c.i), c.l.qty + " × " + crShopItem(c.l)]) },
      { id: "to", l: "New size", type: "select", req: true, optsFor: v => (choices.find(c => String(c.i) === String(v.line)) || choices[0]).opts.map(x => [x, x]) },
      { id: "qty", l: "How many", im: "numeric", req: true, check: (v, all) => { const c = choices.find(x => String(x.i) === String(all.line)) || choices[0]; const n = Number(v); return !Number.isInteger(n) || n < 1 || n > c.l.qty ? "From 1 to " + c.l.qty + "." : ""; } },
    ],
    onSubmit: async v => { const r = await NGGApi.admin.shop.exchange(o.orderId, Number(v.line), v.to, Number(v.qty)); ctx.reload(); return r; },
    done: (v, r) => "Exchanged." + (r && r.warning ? " " + r.warning : ""),
  });
}
function crShopNote(ctx, o) {
  ctx.closeDrawer();
  ctx.form({ title: "Note on " + o.orderId, submit: "Add the note", intro: "Staff only. It goes on the order’s timeline with your name.",
    fields: [{ id: "text", l: "Note", type: "textarea", rows: 3, max: 1000, req: true }],
    onSubmit: async v => { const r = await NGGApi.admin.shop.note(o.orderId, String(v.text || "").trim()); setTimeout(() => crShopReopen(ctx, o.orderId), 50); return r; },
    done: "Note added." });
}
async function crShopRemind(ctx, o) {
  try { await NGGApi.admin.shop.remind(o.orderId); ctx.toast("The pay link was sent to " + o.email + "."); crShopReopen(ctx, o.orderId); }
  catch (e) { ctx.toast(crShopErr(e, "Couldn’t send the link."), null, true); }
}
const CR_SHOP_EV_ICON = { created: "receipt", paid: "credit-card", ready: "package", completed: "check-circle", cancelled: "x-circle", expired: "clock",
  revived: "arrow-counter-clockwise", refund: "arrow-u-up-left", note: "note-pencil", exchange: "arrows-left-right", remind: "envelope", pos: "cash-register", short: "warning", checkout: "credit-card" };
const CR_SHOP_RF_STATUS = { pending: "Waiting for Paystack", processing: "Paystack is processing it", processed: "Done", failed: "Failed" };
/** The drawer for one order, from admin.shop.order.get: its items, timeline, refunds and every step it can take. */
function crShopDrawer(ctx, d) {
  const o = d.order, st = crShopSt(o.status), rs = CR_SHOP_REFUND[o.refundState];
  const acts = [];
  if (o.status === "paid") acts.push({ l: "Mark ready", primary: true, run: () => crShopReady(ctx, o) });
  if (o.status === "paid" || o.status === "ready") acts.push({ l: o.fulfil === "deliver" ? "Mark delivered" : "Mark collected", primary: o.status === "ready", run: () => crShopHandOver(ctx, o) });
  if (d.refundTerms && d.refundTerms.max > 0) acts.push({ l: "Refund…", run: () => crShopRefund(ctx, o, d.refundTerms) });
  if (["paid", "ready", "completed"].includes(o.status) && (d.lineOptions || []).some((x, i) => x.filter(y => y !== o.lines[i].option).length)) acts.push({ l: "Exchange a size…", run: () => crShopExchange(ctx, o, d) });
  if (o.payable) acts.push({ l: "Send the pay link again", run: () => crShopRemind(ctx, o) });
  acts.push({ l: "Add a note…", run: () => crShopNote(ctx, o) });
  if (o.status === "paid" || o.status === "ready") acts.push({ l: "Print packing slip", run: () => { if (!crShopSlips([o])) ctx.toast("Allow pop-ups for this site to print.", null, true); } });
  if (["pending", "paid", "ready"].includes(o.status)) acts.push({ l: "Cancel order…", run: () => crShopCancel(ctx, o) });
  ctx.drawer({
    title: o.orderId, sub: o.buyerName + (o.channel === "pos" ? " · sold at a table" : ""), icon: o.channel === "pos" ? "cash-register" : "shopping-bag",
    stats: [["Paid", o.paidAt ? fmtMoney(o.total + (o.channel === "pos" ? 0 : (o.processingFee || 0))) : "Not paid"], ["Status", rs ? st[0] + " · " + rs[0] : st[0]], ["Items", crNum(o.lines.reduce((n, l) => n + l.qty, 0))]],
    fields: [["Buyer", o.buyerName], ["Email", o.email], ["Phone", o.phone],
      [o.channel === "pos" ? "Where" : o.fulfil === "deliver" ? "Deliver to" : "Collect at", o.channel === "pos" ? (o.centre || "A table") : o.fulfil === "deliver" ? o.address : o.centre],
      ["Paid by", o.paidAt ? CR_SHOP_METHOD[o.payMethod] || o.payMethod : ""], ["Pickup code", o.hasPickupCode && ["paid", "ready"].includes(o.status) ? "Sent to the buyer; ask them for it" : ""],
      ["Delivery note", o.tracking], ["Paystack reference", o.reference], ["Paystack’s fee", o.gatewayFee ? fmtMoney(o.gatewayFee) : ""]],
    sections: [
      { h: "Items", rows: o.lines.map(l => [crShopItem(l) + " × " + l.qty, fmtMoney(l.amount)])
          .concat(o.discount ? [["Code " + o.discountCode, "−" + fmtMoney(o.discount)]] : []).concat(o.delivery ? [["Delivery", fmtMoney(o.delivery)]] : [])
          .concat(o.processingFee && o.channel !== "pos" ? [["Payment processing fee (paid by the buyer)", fmtMoney(o.processingFee)]] : [])
          .concat([["Total to NGG", fmtMoney(o.total)]]).concat(o.refunded ? [["Refunded", "−" + fmtMoney(o.refunded)]] : []) },
      (d.refunds || []).length ? { h: "Refunds", list: d.refunds.map(r => ({ icon: "arrow-u-up-left", t: fmtMoney(r.amount) + " · " + (r.method === "paystack" ? "Paystack" : "paid back another way"),
          s: (CR_SHOP_RF_STATUS[r.status] || r.status) + " · " + r.reason + (r.by ? " · " + r.by : ""), m: crDate(r.createdAt),
          act: r.method === "paystack" && (r.status === "pending" || r.status === "processing") ? { l: "Check now", run: async () => {
            try { const x = await NGGApi.admin.shop.refundCheck(r.refundId); ctx.toast("Paystack says: " + (CR_SHOP_RF_STATUS[x.status] || x.status) + "."); crShopReopen(ctx, o.orderId); ctx.reload(); }
            catch (e) { ctx.toast(crShopErr(e, "Couldn’t reach Paystack."), null, true); } } } : null })) } : null,
      { h: "Timeline", list: (d.events || []).slice().reverse().map(e => ({ icon: CR_SHOP_EV_ICON[e.kind] || "circle", t: e.text, s: e.byName || (e.kind === "note" ? "" : "The shop"), m: crDate(e.at, true) })),
        empty: "Nothing recorded yet." },
      d.oldNote ? { h: "Earlier note", text: d.oldNote } : null,
    ].filter(Boolean),
    actions: acts,
  });
}
async function crShopOpen(ctx, o) {
  try { crShopDrawer(ctx, await NGGApi.admin.shop.order(o.orderId)); }
  catch (e) { ctx.toast(crShopErr(e, "Couldn’t open that order."), null, true); }
}
function crShopOrderRows(ctx, orders) {
  return orders.map(o => { const st = crShopSt(o.status), rs = CR_SHOP_REFUND[o.refundState]; return { key: o.orderId, o, open: () => crShopOpen(crShopCtx.current || ctx, o), cells: [
    { k: "strong", t: o.buyerName, s: o.email || o.phone },
    { k: "mono", t: o.orderId },
    { k: "text", t: crShopWhere(o), s: o.channel === "pos" ? CR_SHOP_METHOD[o.payMethod] : o.fulfil === "deliver" ? "" : "Collect" },
    { k: "num", t: fmtMoney(o.total), v: o.total },
    { k: "status", t: rs ? rs[0] : st[0], tone: rs ? rs[1] : st[1] },
    { k: "text", t: o.createdAt ? crDate(o.createdAt) : "—", s: o.createdAt ? crAgo(o.createdAt) : "" },
  ] }; });
}
const CR_SHOP_WHEN = [["", "Any time"], ["0", "Today"], ["6", "Last 7 days"], ["29", "Last 30 days"], ["89", "Last 90 days"]];
/** The server-backed list: filters, search, sort and paging all go to the server, which returns the true total. */
function crShopOrderSource(ctx) {
  return {
    sortKeys: { 5: "newest", 3: "total" },
    fetch: async ({ q, filters, sort, page, pageSize }) => {
      const w = filters.when;
      const r = await NGGApi.admin.shop.orders({ status: filters.status || "", channel: filters.channel || "", q, from: w ? crShopDaysAgo(Number(w)) : "",
        sort: sort && sort.ci === 3 ? "total" : sort && sort.ci === 5 && sort.dir === "asc" ? "oldest" : "newest", page, pageSize });
      return { rows: crShopOrderRows(ctx, r.orders || []), total: r.total || 0 };
    },
  };
}
function crShopExport(ctx) {
  ctx.form({
    title: "Download orders (CSV)", submit: "Download", busyLabel: "Preparing…",
    intro: "Every order in the range, by when it was ordered, with its items, code, fees and refunds. For the accounts.",
    values: { from: crShopDaysAgo(29), to: crShopToday(), status: "" },
    fields: [
      { id: "from", l: "From", type: "date", req: true }, { id: "to", l: "To", type: "date", req: true },
      { id: "status", l: "Which", type: "select", opts: [["", "All orders"], ["open", "To hand over"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["refunded", "Refunded"]] },
    ],
    onSubmit: async v => {
      const r = await NGGApi.admin.shop.exportRows({ from: v.from, to: v.to, status: v.status });
      const H = ["Order", "Ordered", "Paid", "Status", "Channel", "Paid by", "Buyer", "Email", "Phone", "Fulfil", "Centre", "Items", "Subtotal", "Code", "Discount", "Delivery", "Total", "Buyer’s Paystack charge", "Paystack’s fee", "Refunded", "Reference", "Session"];
      crDownloadCsv("ngg-shop-orders-" + v.from + "-to-" + v.to, H, (r.rows || []).map(o => [o.orderId, o.createdAt, o.paidAt, o.status, o.channel, o.payMethod, o.buyerName, o.email, o.phone, o.fulfil, o.centre, o.items,
        o.subtotal, o.discountCode, o.discount, o.delivery, o.total, o.buyerCharge, o.paystackFee, o.refunded, o.reference, o.sessionId]));
      return r;
    },
    done: (v, r) => crPlural((r.rows || []).length, "order") + " downloaded." + (r.truncated ? " Only the first " + crNum(r.max) + "; narrow the dates for the rest." : ""),
  });
}
Object.assign(CR_TAB_DEFS, {
  "shop-orders": {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const [r, s] = await Promise.all([NGGApi.admin.shop.orders({ status: "open", page: 0, pageSize: 1 }), NGGApi.admin.shop.settings().catch(() => null)]);
      return { counts: r.counts || {}, refundsDue: r.refundsDue || 0, settings: s, src: crShopOrderSource(ctx) };
    },
    actions: (d, ctx) => [
      { l: "Download CSV", icon: "download-simple", run: () => crShopExport(ctx) },
      { l: "Sell at a table", icon: "cash-register", run: () => ctx.go("shop", "shop-sell") },
    ],
    blocks: (d, ctx) => {
      crShopCtx.current = ctx;
      const c = d.counts, out = [];
      const S = d.settings && d.settings.settings;
      if (S && !S.enabled) out.push({ type: "note", span: 6, icon: "pause-circle", tone: "warn", text: "The shop is closed. Nobody can order online until it is opened.", act: { l: "Open settings", run: () => ctx.go("shop", "shop-settings") } });
      if (d.refundsDue) out.push({ type: "note", span: 6, icon: "arrow-u-up-left", tone: "warn", text: crPlural(d.refundsDue, "cancelled order") + " still owe" + (d.refundsDue === 1 ? "s" : "") + " the buyer a refund.", act: { l: "Show them", run: () => ctx.go("shop", "shop-orders", "refund_due") } });
      out.push({ type: "kpis", span: 6, items: [
        { l: "To hand over", v: crNum((c.paid || 0) + (c.ready || 0)), tone: "flat", s: crNum(c.paid || 0) + " to pack · " + crNum(c.ready || 0) + " ready" },
        { l: "Waiting for payment", v: crNum(c.pending || 0), tone: "flat", s: "Unpaid orders hold no stock" },
        { l: "Completed", v: crNum(c.completed || 0), tone: "flat" },
        { l: "Cancelled", v: crNum(c.cancelled || 0), tone: "flat" },
      ] });
      const opt = (v, l, n) => ({ v, l, n });
      const init = ["open", "paid", "ready", "pending", "completed", "cancelled", "refund_due", "refunded"].includes(ctx.sub) ? ctx.sub : "open";
      out.push({ type: "table", span: 6, title: "Orders", sub: "Newest first. Open one for its items, timeline, refunds and steps.",
        cols: ["Buyer", "Order", "Where", { l: "Total", num: true }, { l: "Status", sort: false }, "Ordered"],
        server: d.src, filtersInit: { status: init },
        filters: [
          { id: "status", l: "Status", opts: [opt("open", "To hand over", (c.paid || 0) + (c.ready || 0)), opt("paid", "Paid", c.paid || 0), opt("ready", "Ready", c.ready || 0),
            opt("pending", "Waiting for payment", c.pending || 0), opt("completed", "Completed", c.completed || 0), opt("cancelled", "Cancelled", c.cancelled || 0),
            opt("refund_due", "Refund due", d.refundsDue), opt("refunded", "Refunded")] },
          { id: "channel", l: "Sold", opts: [opt("online", "Online"), opt("pos", "At a table")] },
          { id: "when", l: "Ordered", opts: CR_SHOP_WHEN.filter(w => w[0]).map(w => opt(w[0], w[1])) },
        ],
        search: "Order number, name, email or phone",
        bulk: ctx.can("fees") ? [
          { l: "Mark ready", max: 100, run: keys => crShopStepMany(ctx, keys, "ready") },
          { l: "Mark delivered", max: 100, run: keys => crShopStepMany(ctx, keys, "completed") },
          { l: "Print pick list", max: 100, run: async (keys, rows) => { if (!crShopPickList(rows.map(r => r.o).filter(Boolean))) ctx.toast("Allow pop-ups for this site to print.", null, true); return false; } },
          { l: "Print packing slips", max: 100, run: async (keys, rows) => { if (!crShopSlips(rows.map(r => r.o).filter(Boolean))) ctx.toast("Allow pop-ups for this site to print.", null, true); return false; } },
        ] : [],
        emptyText: "No orders here. Paid orders appear as soon as Paystack confirms them." });
      return out;
    },
  },
});

/* ── Sell at a table (POS) and cash sessions ──
   A custom block: a till needs a cart, and no block can hold one. The server
   prices every line and decides; the till only gathers what was sold. */
function CrShopTill({ d, ctx }) {
  const prods = d.products || [];
  const [sid, setSid] = React.useState((d.sessions[0] || {}).sessionId || "");
  const [cart, setCart] = React.useState([]);
  const [method, setMethod] = React.useState("cash");
  const [buyer, setBuyer] = React.useState("");
  const [opt, setOpt] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const sess = d.sessions.find(s => s.sessionId === sid) || null;
  const total = cart.reduce((n, l) => n + l.price * l.qty, 0);
  const add = p => {
    const v = p.options.length ? (opt[p.productId] || p.options[0]) : "";
    setMsg(null);
    setCart(c => { const i = c.findIndex(l => l.productId === p.productId && l.variant === v);
      return i < 0 ? c.concat([{ productId: p.productId, name: p.name, variant: v, price: p.price, qty: 1 }]) : c.map((l, j) => j === i ? Object.assign({}, l, { qty: Math.min(d.bounds.qtyMax, l.qty + 1) }) : l); });
  };
  const bump = (i, n) => setCart(c => c.map((l, j) => j === i ? Object.assign({}, l, { qty: Math.max(0, Math.min(d.bounds.qtyMax, l.qty + n)) }) : l).filter(l => l.qty > 0));
  const left = (p, v) => p.onHand ? p.onHand[v] : null;
  const sell = async () => {
    if (!cart.length) return;
    if (method === "cash" && !sess) { setMsg({ bad: true, t: "Cash goes in a drawer: open a cash session first." }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await NGGApi.admin.shop.sale({ items: cart.map(l => ({ productId: l.productId, variant: l.variant, qty: l.qty })), method, sessionId: sess ? sess.sessionId : "", buyerName: buyer.trim() });
      setCart([]); setBuyer("");
      setMsg({ bad: false, t: "Sold: " + r.orderId + ", " + fmtMoney(r.total) + " by " + (CR_SHOP_METHOD[method] || method).toLowerCase() + "." + (r.warnings && r.warnings.length ? " More than the recorded stock was sold (" + r.warnings.join(", ") + "); recount it." : "") });
      ctx.reload();
    } catch (e) { setMsg({ bad: true, t: crShopErr(e, "Couldn’t record the sale. Nothing was taken off the stock.") }); }
    setBusy(false);
  };
  return (
    <div className="cr-till-wrap"><div className="cr-till">
      <div className="cr-till-goods">
        <div className="cr-till-bar">
          <label className="cr-till-l" htmlFor="cr-till-sess">Cash session</label>
          <select id="cr-till-sess" className="cr-select" value={sid} onChange={e => setSid(e.target.value)}>
            <option value="">No session (transfer or POS terminal only)</option>
            {d.sessions.map(s => <option key={s.sessionId} value={s.sessionId}>{s.label}{s.centre ? " · " + s.centre : ""}</option>)}
          </select>
        </div>
        {!prods.length && <p className="cr-hint">Nothing to sell yet. Add products, on sale or as drafts, in Products.</p>}
        <ul className="cr-till-grid" aria-label="Products">
          {prods.map(p => { const v = p.options.length ? (opt[p.productId] || p.options[0]) : ""; const n = left(p, v); return (
            <li key={p.productId} className="cr-till-item">
              <b>{p.name}</b>
              <span className="cr-till-price">{fmtMoney(p.price)}{p.status === "draft" ? " · draft" : ""}</span>
              {p.options.length > 0 && <div className="cr-till-opts" role="group" aria-label={"Size of " + p.name}>
                {p.options.map(o => <button key={o} type="button" className="cr-chip" aria-pressed={v === o} onClick={() => setOpt(x => Object.assign({}, x, { [p.productId]: o }))}>{o}</button>)}
              </div>}
              <span className={"cr-till-left" + (n != null && n <= 0 ? " is-out" : "")}>{n == null ? "No stock limit" : n <= 0 ? "None recorded" : crNum(n) + " left"}</span>
              <button type="button" className="cr-btn is-sm" onClick={() => add(p)} aria-label={"Add " + p.name + (v ? " (" + v + ")" : "")}><CrIcon n="plus"/>Add</button>
            </li>); })}
        </ul>
      </div>
      <div className="cr-till-cart" aria-label="This sale">
        <h3 className="cr-till-h">This sale</h3>
        {!cart.length ? <p className="cr-hint">Add what the buyer is taking.</p> : (
          <ul className="cr-till-lines">
            {cart.map((l, i) => <li key={l.productId + l.variant}>
              <span className="cr-till-ln">{l.name}{l.variant ? " (" + l.variant + ")" : ""}</span>
              <span className="cr-till-qty">
                <button type="button" className="cr-iconbtn" aria-label={"One fewer " + l.name} onClick={() => bump(i, -1)}><CrIcon n="minus"/></button>
                <span aria-live="polite">{l.qty}</span>
                <button type="button" className="cr-iconbtn" aria-label={"One more " + l.name} onClick={() => bump(i, 1)}><CrIcon n="plus"/></button>
              </span>
              <span className="cr-till-amt">{fmtMoney(l.price * l.qty)}</span>
            </li>)}
          </ul>)}
        <div className="cr-till-total"><span>Total</span><b>{fmtMoney(total)}</b></div>
        <div className="cr-seg is-full" role="radiogroup" aria-label="Paid by">
          {d.methods.map(m => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{CR_SHOP_METHOD[m]}</button>)}
        </div>
        <label className="cr-till-l" htmlFor="cr-till-buyer">Buyer’s name <span className="cr-till-opt">(optional)</span></label>
        <input id="cr-till-buyer" className="cr-input" maxLength={120} value={buyer} onChange={e => setBuyer(e.target.value)}/>
        {msg && <p className={"cr-till-msg" + (msg.bad ? " is-bad" : "")} role={msg.bad ? "alert" : "status"}>{msg.t}</p>}
        <button type="button" className="cr-btn is-primary cr-till-go" disabled={busy || !cart.length} onClick={sell}>{busy ? "Recording…" : cart.length ? "Record sale · " + fmtMoney(total) : "Record sale"}</button>
      </div>
    </div></div>
  );
}
function crShopOpenSession(ctx, d) {
  ctx.form({
    title: "Open a cash session", submit: "Open", busyLabel: "Opening…",
    intro: "One per table or day. At the end, count the drawer and close it: the difference from what should be there is kept.",
    values: { openingFloat: "0", centre: d.scoped && d.centres.length ? d.centres[0] : "" },
    fields: [
      { id: "label", l: "Name", req: true, max: 80, ph: "Open day, Egbeda" },
      { id: "centre", l: "Centre", type: "select", req: d.scoped, opts: (d.scoped ? [] : [["", "Not at a centre"]]).concat(d.centres.map(c => [c, c])) },
      { id: "openingFloat", l: "Cash in the drawer to start (₦)", im: "numeric", req: true, check: v => /^\d+$/.test(String(v)) && Number(v) <= d.bounds.floatMax ? "" : "A whole number, at most " + fmtMoney(d.bounds.floatMax) + "." },
    ],
    onSubmit: async v => { const r = await NGGApi.admin.shop.sessionOpen({ label: v.label, centre: v.centre || "", openingFloat: Number(v.openingFloat) }); ctx.reload(); return r; },
    done: v => "Session open: " + v.label + ".",
  });
}
function crShopCloseSession(ctx, s) {
  ctx.form({
    title: "Close " + s.label, submit: "Close the session", busyLabel: "Closing…",
    intro: "Should be in the drawer: " + fmtMoney(s.expected) + " (the " + fmtMoney(s.openingFloat) + " float, " + fmtMoney(s.byMethod.cash) + " cash taken" + (s.cashBack ? ", less " + fmtMoney(s.cashBack) + " paid back" : "") + "). Count it.",
    fields: [
      { id: "counted", l: "Cash counted (₦)", im: "numeric", req: true, check: v => /^\d+$/.test(String(v)) ? "" : "Enter a whole number." },
      { id: "note", l: "Note", type: "textarea", rows: 2, max: 300, help: "Needed when the count is short or over.", check: (v, all) => /^\d+$/.test(String(all.counted)) && Number(all.counted) !== s.expected && String(v || "").trim().length < 3 ? "The drawer is " + fmtMoney(Math.abs(Number(all.counted) - s.expected)) + (Number(all.counted) < s.expected ? " short" : " over") + ". Say why." : "" },
    ],
    onSubmit: async v => {
      try { const r = await NGGApi.admin.shop.sessionClose({ sessionId: s.sessionId, counted: Number(v.counted), note: String(v.note || "").trim() }); ctx.reload(); return r; }
      catch (e) { if (e.code === "note_required") return { fieldErrors: { note: crShopErr(e) } }; if (e.code === "bad_count") return { fieldErrors: { counted: crShopErr(e) } }; throw e; }
    },
    done: (v, r) => "Closed. " + (r.session.difference === 0 ? "The drawer balances." : "The drawer is " + fmtMoney(Math.abs(r.session.difference)) + (r.session.difference < 0 ? " short." : " over.")),
  });
}
async function crShopSessionOpen(ctx, s) {
  let sales = [];
  try { sales = (await NGGApi.admin.shop.sessions(s.sessionId)).sales || []; } catch (_) {}
  ctx.drawer({
    title: s.label, sub: (s.centre || "Not at a centre") + " · " + (s.status === "open" ? "open" : "closed"), icon: "cash-register",
    stats: [["Sales", crNum(s.sales)], ["Cash taken", fmtMoney(s.byMethod.cash)], [s.status === "open" ? "Should be in the drawer" : "Difference", s.status === "open" ? fmtMoney(s.expected) : fmtMoney(s.difference)]],
    fields: [["Opened", crDate(s.openedAt, true) + (s.openedBy ? " · " + s.openedBy : "")], ["Float", fmtMoney(s.openingFloat)], ["Bank transfer", fmtMoney(s.byMethod.transfer)], ["POS terminal", fmtMoney(s.byMethod.pos)],
      ["Cash paid back", s.cashBack ? fmtMoney(s.cashBack) : ""], ["Closed", s.closedAt ? crDate(s.closedAt, true) + (s.closedBy ? " · " + s.closedBy : "") : ""],
      ["Expected", s.status === "closed" ? fmtMoney(s.expected) : ""], ["Counted", s.status === "closed" ? fmtMoney(s.counted) : ""], ["Note", s.note]],
    sections: [{ h: "Sales", list: sales.map(o => ({ icon: "receipt", t: o.lines.map(l => l.qty + " × " + crShopItem(l)).join(", "), s: o.orderId + " · " + (CR_SHOP_METHOD[o.payMethod] || o.payMethod), m: fmtMoney(o.total) })), empty: "No sales in this session." }],
    actions: s.status === "open" ? [{ l: "Close the session…", primary: true, run: () => { ctx.closeDrawer(); crShopCloseSession(ctx, s); } }] : [],
  });
}
Object.assign(CR_TAB_DEFS, {
  "shop-sell": {
    skeleton: ["cards", "table"],
    load: async () => { const [pos, ss] = await Promise.all([NGGApi.admin.shop.pos(), NGGApi.admin.shop.sessions()]); return Object.assign({}, pos, { history: ss.sessions || [] }); },
    actions: (d, ctx) => [{ l: "Open a cash session", icon: "plus", primary: true, run: () => crShopOpenSession(ctx, d) }],
    blocks: (d, ctx) => {
      const out = [];
      if (d.scoped && !d.sessions.length) out.push({ type: "note", span: 6, icon: "info", text: "You sell inside a session at one of your centres. Open one to start." });
      out.push({ type: "custom", span: 6, title: "Sell", sub: "Sales here come off the same stock as the online shop, and are completed at once.", render: () => <CrShopTill key={d.sessions.map(s => s.sessionId).join()} d={d} ctx={ctx}/> });
      out.push({ type: "table", span: 6, title: "Cash sessions", nosel: true, cols: ["Session", "Centre", { l: "Sales", num: true }, { l: "Cash", num: true }, { l: "Difference", num: true }, "Status"],
        emptyText: "No sessions yet. Open one before taking cash.",
        rows: (d.history || []).map(s => ({ key: s.sessionId, open: () => crShopSessionOpen(ctx, s), cells: [
          { k: "strong", t: s.label, s: crDate(s.openedAt, true) }, { k: "text", t: s.centre || "—" }, { k: "num", t: crNum(s.sales), v: s.sales },
          { k: "num", t: fmtMoney(s.byMethod.cash), v: s.byMethod.cash }, { k: "num", t: s.status === "closed" ? fmtMoney(s.difference) : "—", v: s.difference },
          { k: "status", t: s.status === "open" ? "Open" : "Closed", tone: s.status === "open" ? "gold" : s.difference === 0 ? "ok" : "warn" } ] })) });
      return out;
    },
  },
});

/* ── Stock ── */
function crShopAdjust(ctx, d, v0) {
  const tracked = {}; (d.variants || []).forEach(v => { (tracked[v.productId] = tracked[v.productId] || { name: v.name, opts: [] }).opts.push(v.variant); });
  const pids = Object.keys(tracked);
  if (!pids.length) { ctx.toast("No product has a stock limit yet. Turn “Limited stock” on in a product.", null, true); return; }
  const R = d.reasons || [];
  ctx.form({
    title: "Adjust stock", submit: "Record it", busyLabel: "Recording…",
    intro: "Every change is kept with its reason, your name and the time.",
    values: { productId: v0 ? v0.productId : pids[0], variant: v0 ? v0.variant : tracked[pids[0]].opts[0], reason: "received", qty: "" },
    fields: [
      { id: "productId", l: "Product", type: "select", req: true, opts: pids.map(id => [id, tracked[id].name]) },
      { id: "variant", l: "Size or option", type: "select", req: true, when: v => (tracked[v.productId] || { opts: [""] }).opts.some(o => o !== ""), optsFor: v => (tracked[v.productId] || { opts: [] }).opts.map(o => [o, o]) },
      { id: "reason", l: "Why", type: "chips", req: true, opts: R.map(r => [r, CR_SHOP_REASON[r] || r]) },
      { id: "qty", l: "How many", im: "numeric", req: true, help: "For a correction, a negative number takes away.", check: (v, all) => { const n = Number(v); return !Number.isInteger(n) || n === 0 ? "A whole number other than nought." : all.reason !== "correction" && n < 0 ? "A positive number; the reason says which way." : ""; } },
      { id: "note", l: "Note", max: 300, help: "Needed for a correction. Who it went to, where it came from.", check: (v, all) => all.reason === "correction" && String(v || "").trim().length < 3 ? "Say what the correction is for." : "" },
    ],
    onSubmit: async v => {
      const n = Number(v.qty), sign = ["damaged", "giveaway"].includes(v.reason) ? -1 : 1;
      const variant = (tracked[v.productId] || { opts: [""] }).opts.some(o => o !== "") ? v.variant : "";
      try { const r = await NGGApi.admin.shop.adjust({ productId: v.productId, variant, reason: v.reason, delta: v.reason === "correction" ? n : sign * Math.abs(n), note: String(v.note || "").trim() }); ctx.reload(); return r; }
      catch (e) { if (e.code === "note_required") return { fieldErrors: { note: crShopErr(e) } }; if (e.code === "bad_delta") return { fieldErrors: { qty: crShopErr(e) } }; throw e; }
    },
    done: (v, r) => "Recorded. " + crNum(r.balance) + " left.",
  });
}
function crShopStocktake(ctx, d) {
  const vs = (d.variants || []).slice(0, (d.bounds || {}).stocktakeMax || 500);
  if (!vs.length) { ctx.toast("No product has a stock limit yet.", null, true); return; }
  const values = {}; vs.forEach((v, i) => { values["c" + i] = String(Math.max(0, v.onHand)); });
  ctx.form({
    title: "Stock-take", submit: "Save the count", busyLabel: "Saving…",
    intro: "Count what is on the shelf and type each number. Every difference is recorded as a stock-take with your name; numbers that match change nothing. Nothing is saved if one line is wrong.",
    values: Object.assign({ note: "" }, values),
    fields: vs.map((v, i) => ({ id: "c" + i, l: crShopItem({ name: v.name, option: v.variant }), im: "numeric", req: true, help: "Recorded now: " + crNum(v.onHand),
      check: x => /^\d+$/.test(String(x)) ? "" : "A whole number." })).concat([{ id: "note", l: "Note", max: 300, ph: "End of term count" }]),
    onSubmit: async v => { const r = await NGGApi.admin.shop.stocktake(vs.map((x, i) => ({ productId: x.productId, variant: x.variant, counted: Number(v["c" + i]) })), String(v.note || "").trim()); ctx.reload(); return r; },
    done: (v, r) => r.changed ? crPlural(r.changed, "count") + " changed (" + (r.net >= 0 ? "+" : "") + crNum(r.net) + " in all); " + crNum(r.unchanged) + " matched." : "Every count matched. Nothing changed.",
  });
}
async function crShopHistory(ctx, d, v) {
  try {
    const r = await NGGApi.admin.shop.history(v.productId, v.variant);
    ctx.drawer({
      title: crShopItem({ name: v.name, option: v.variant }), sub: "Stock history", icon: "stack",
      stats: [["On hand", crNum(v.onHand)], ["Low at", v.lowAt == null ? "Never warns" : crNum(v.lowAt)], ["State", v.state === "out" ? "Sold out" : v.state === "low" ? "Low" : "Fine"]],
      sections: [{ h: "Every change, newest first", list: (r.moves || []).map(m => ({ icon: m.delta > 0 ? "arrow-up" : "arrow-down",
        t: (m.delta > 0 ? "+" : "") + crNum(m.delta) + " · " + (CR_SHOP_REASON[m.reason] || m.reason) + (m.orderId ? " · " + m.orderId : ""),
        s: [m.note, m.byName || (m.by ? "" : "The shop")].filter(Boolean).join(" · "), m: crNum(m.balance) + " left · " + crDate(m.at, true) })), empty: "No changes recorded." }],
      actions: d.canAdjust ? [{ l: "Adjust…", primary: true, run: () => { ctx.closeDrawer(); crShopAdjust(ctx, d, v); } }] : [],
    });
  } catch (e) { ctx.toast(crShopErr(e, "Couldn’t load the history."), null, true); }
}
Object.assign(CR_TAB_DEFS, {
  "shop-stock": {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.shop.stock(),
    actions: (d, ctx) => d.canAdjust ? [
      { l: "Adjust stock", icon: "plus-minus", primary: true, run: () => crShopAdjust(ctx, d, null) },
      { l: "Stock-take", icon: "clipboard-text", run: () => crShopStocktake(ctx, d) },
    ] : [],
    blocks: (d, ctx) => {
      const c = d.counts || {}, out = [];
      out.push({ type: "kpis", span: 6, items: [
        { l: "Sold out", v: crNum(c.out || 0), tone: "flat" }, { l: "Low", v: crNum(c.low || 0), tone: "flat", s: "At or below the line (default " + crNum(d.lowStockDefault) + ")" },
        { l: "Options tracked", v: crNum((d.variants || []).length), tone: "flat" }, { l: "Stock value", v: fmtMoney(d.stockValue || 0), tone: "flat", s: "At today’s prices" },
      ] });
      const ST = { out: ["Sold out", "bad"], low: ["Low", "warn"], ok: ["Fine", "ok"] };
      out.push({ type: "table", span: 6, title: "Stock", sub: "Open one for its history. Products with no limit are not listed.", nosel: true, search: "Search products",
        cols: ["Product", "Option", { l: "On hand", num: true }, { l: "Low at", num: true }, "State"], filters: ["State"], sortInit: { ci: 4, dir: "desc" },
        emptyText: "No product has a stock limit. Turn “Limited stock” on in a product to track it here.",
        rows: (d.variants || []).map((v, i) => ({ key: v.productId + "|" + v.variant, open: () => crShopHistory(ctx, d, v), cells: [
          { k: "strong", t: v.name, s: v.status === "draft" ? "Draft" : v.preorder ? "Pre-order" : "" }, { k: "text", t: v.variant || "—" },
          { k: "num", t: crNum(v.onHand), v: v.onHand }, { k: "num", t: v.lowAt == null ? "—" : crNum(v.lowAt), v: v.lowAt == null ? -1 : v.lowAt },
          { k: "status", t: ST[v.state][0], tone: ST[v.state][1] } ] })) });
      out.push({ type: "list", span: 6, title: "Latest changes", empty: "No stock has moved yet.",
        rows: (d.moves || []).slice(0, 20).map(m => ({ icon: m.delta > 0 ? "arrow-up" : "arrow-down", t: crShopItem({ name: m.name, option: m.variant }) + " " + (m.delta > 0 ? "+" : "") + crNum(m.delta),
          s: (CR_SHOP_REASON[m.reason] || m.reason) + (m.orderId ? " · " + m.orderId : "") + (m.byName ? " · " + m.byName : ""), m: crAgo(m.at) })) });
      return out;
    },
  },
});

/* ── Products ── */
const CR_SHOP_FIELD = { bad_name: "name", bad_category: "category", bad_price: "price", no_price: "price", bad_image: "imageUrl", too_many_options: "options", bad_stock: "stock", bad_status: "status", bad_low_stock: "lowStock", bad_preorder: "preorderUntil" };
function crShopSplit(v) { return String(v || "").split(",").map(x => x.trim()).filter(Boolean); }
function crShopEdit(ctx, d, p) {
  const isNew = !p || !p.productId;
  const B = d.bounds || {};
  const opts0 = (p && p.options) || [];
  const left = p ? p.onHand : null;
  ctx.form({
    title: isNew ? "New product" : "Edit " + p.name, submit: isNew ? "Add product" : "Save", busyLabel: "Saving…",
    intro: "A product on sale shows on the shop page at once. Prices are whole naira; buyers pay Paystack’s charge on top." + (isNew ? "" : " Changing a count here is recorded as a correction; for deliveries and damage use Stock → Adjust."),
    values: isNew ? { category: (d.categories || [])[0] || "Other", status: "draft", limited: false, sort: "100", lowStock: "" } : {
      name: p.name, category: p.category, price: String(p.price), description: p.description || "", imageUrl: p.imageUrl || "",
      options: opts0.join(", "), limited: left != null, stock: left ? (opts0.length ? opts0.map(o => Math.max(0, left[o] || 0)) : [Math.max(0, left[""] || 0)]).join(", ") : "",
      status: p.status, sort: String(p.sort), lowStock: p.lowStock >= 0 ? String(p.lowStock) : "", preorderUntil: p.preorderSet || "" },
    fields: [
      { id: "name", l: "Name", req: true, max: 80 },
      { id: "category", l: "Category", type: "select", req: true, opts: (d.categories || []).map(c => [c, c]) },
      { id: "price", l: "Price (₦)", req: true, im: "numeric", check: v => { const n = Number(v); return !Number.isInteger(n) || n < 0 ? "Enter a whole number of naira." : B.priceMax && n > B.priceMax ? "At most " + fmtMoney(B.priceMax) + "." : ""; } },
      { id: "description", l: "Description", type: "textarea", rows: 3, max: 2000 },
      { id: "imageUrl", l: "Picture link", max: 400, ph: "https://", help: "An https:// address, or upload one below." },
      { id: "imageFile", l: "…or upload the picture", type: "file", accept: "image/*" },
      { id: "options", l: "Sizes or options", max: 260, ph: "S, M, L, XL", help: "Separated by commas. Leave empty for a product with none (a mug)." + (B.optionsMax ? " At most " + B.optionsMax + "." : ""),
        check: v => B.optionsMax && crShopSplit(v).length > B.optionsMax ? "At most " + B.optionsMax + " options." : "" },
      { id: "limited", l: "Limited stock", type: "switch", help: "Off: no limit. On: the shop refuses more than is left, and a sold-out size says so." },
      { id: "stock", l: "How many are left", when: v => !!v.limited, req: true, im: "numeric", ph: "10, 12, 8",
        help: "One number per option, in the same order. A product with no options takes one number.",
        check: (v, all) => { const n = crShopSplit(v), want = Math.max(1, crShopSplit(all.options).length);
          if (n.length !== want) return "Give " + want + " number" + (want === 1 ? "" : "s") + ", one for each option.";
          return n.some(x => !/^\d+$/.test(x) || (B.stockMax && Number(x) > B.stockMax)) ? "Whole numbers only" + (B.stockMax ? ", at most " + crNum(B.stockMax) : "") + "." : ""; } },
      { id: "lowStock", l: "Warn when this many are left", when: v => !!v.limited, im: "numeric", ph: String(d.lowStockDefault == null ? 3 : d.lowStockDefault),
        help: "Empty: the shop’s default (" + crNum(d.lowStockDefault || 0) + "). 0: never warn.", check: v => v === "" || (/^\d+$/.test(String(v)) && (!B.lowStockMax || Number(v) <= B.lowStockMax)) ? "" : "A whole number." },
      { id: "preorderUntil", l: "Pre-order until", type: "date", help: "Optional. Until the end of this day the shop sells past the stock (a print run sized from the orders); Reports gives the counts per size." },
      { id: "status", l: "Status", type: "chips", req: true, opts: (d.statuses || ["draft", "live", "retired"]).map(s => [s, (CR_SHOP_PSTATUS[s] || [s])[0]]), help: "Draft: only staff see it (it can still be sold at a table). On sale: on the shop page. Retired: off the page; past orders keep it." },
      { id: "sort", l: "Place on the page", im: "numeric", help: "Lower comes first.", check: v => v === "" || /^\d+$/.test(String(v)) ? "" : "Enter a whole number." },
    ],
    onSubmit: async v => {
      let img = String(v.imageUrl || "").trim();
      if (v.imageFile && typeof v.imageFile !== "string") {
        const u = await NGGApi.uploadOrInline(v.imageFile, "cover");
        if (!u || !u.url || u.inline) return { fieldErrors: { imageFile: "Couldn’t store the picture on this site. Paste a link to it instead." } };
        img = u.url;
      }
      const options = crShopSplit(v.options);
      let stock = null;
      if (v.limited) { const n = crShopSplit(v.stock).map(Number); stock = {}; (options.length ? options : [""]).forEach((o, i) => { stock[o] = n[i] || 0; }); }
      const data = { name: String(v.name || "").trim(), category: v.category, price: Number(v.price), description: v.description || "", imageUrl: img,
        options, stock, status: v.status, sort: v.sort === "" ? 100 : Number(v.sort), lowStock: v.limited && v.lowStock !== "" && v.lowStock != null ? Number(v.lowStock) : -1, preorderUntil: v.preorderUntil || "" };
      if (!isNew) data.productId = p.productId;
      try { const r = await NGGApi.admin.shop.productSave(data); ctx.reload(); return r; }
      catch (e) { const f = CR_SHOP_FIELD[e.code]; if (f) return { fieldErrors: { [f]: crShopErr(e) } }; throw e; }
    },
    done: v => (isNew ? "Added: " : "Saved: ") + v.name + "." + (v.status === "live" ? " It is on sale." : ""),
  });
}
function crShopStock(p) {
  if (!p.onHand) return "No limit";
  const o = p.options.length ? p.options : [""];
  return o.map(x => (x ? x + " " : "") + crNum(p.onHand[x] || 0)).join(" · ");
}
Object.assign(CR_TAB_DEFS, {
  "shop-products": {
    skeleton: ["table"],
    load: async () => NGGApi.admin.shop.products(),
    actions: (d, ctx) => [{ l: "New product", icon: "plus", primary: true, run: () => crShopEdit(ctx, d, null) }],
    blocks: (d, ctx) => [{
      type: "table", span: 6, nosel: true, search: "Search products",
      cols: ["Product", "Category", { l: "Price", num: true }, "Stock left", { l: "Sold", num: true }, "Status"], filters: ["Category", "Status"],
      emptyText: "No products yet. New product adds one; it stays a draft until you put it on sale.",
      rows: (d.products || []).map(p => { const st = CR_SHOP_PSTATUS[p.status] || [p.status, "neutral"]; return { key: p.productId, open: () => crShopEdit(ctx, d, p), cells: [
        { k: "strong", t: p.name, s: p.options.length ? p.options.join(", ") : "" },
        { k: "text", t: p.category },
        { k: "num", t: fmtMoney(p.price), v: p.price },
        { k: "text", t: crShopStock(p), s: p.preorderUntil ? "Pre-order until " + crDate(p.preorderUntil) : p.soldOut ? "Sold out" : "" },
        { k: "num", t: crNum(p.sold || 0), v: p.sold || 0 },
        { k: "status", t: st[0], tone: st[1] },
      ] }; }),
    }],
  },
});

/* ── Discount codes ── */
const CR_SHOP_CSTATUS = { active: ["Active", "ok"], paused: ["Paused", "neutral"], archived: ["Archived", "bad"] };
const CR_SHOP_CFIELD = { bad_code_name: "code", code_exists: "code", bad_amount: "amount", bad_max_uses: "maxUses", bad_min_spend: "minSpend", bad_date: "endsAt" };
function crShopCode(ctx, c) {
  const isNew = !c;
  ctx.form({
    title: isNew ? "New discount code" : "Code " + c.code, submit: isNew ? "Create" : "Save", busyLabel: "Saving…",
    intro: "A code comes off the goods, never the delivery, and always leaves at least ₦100 to pay. It is counted when the order is paid.",
    values: isNew ? { kind: "percent", status: "active", perBuyer: true, maxUses: "0", minSpend: "0" } : { code: c.code, kind: c.kind, amount: String(c.amount), maxUses: String(c.maxUses), perBuyer: c.perBuyer,
      minSpend: String(c.minSpend), startsAt: c.startsAt, endsAt: c.endsAt, status: c.status, note: c.note },
    fields: [
      isNew ? { id: "code", l: "Code", req: true, max: 24, ph: "OPENDAY10", help: "Letters, numbers and dashes. Buyers type it, in any case." } : null,
      { id: "kind", l: "Kind", type: "chips", req: true, opts: [["percent", "Percentage off"], ["fixed", "Naira off"]] },
      { id: "amount", l: "Amount", im: "numeric", req: true, check: (v, all) => { const n = Number(v); return !Number.isInteger(n) || n < 1 ? "A whole number above nought." : all.kind === "percent" && n > 100 ? "At most 100%." : ""; } },
      { id: "minSpend", l: "Only on goods of at least (₦)", im: "numeric", check: v => /^\d+$/.test(String(v || "0")) ? "" : "A whole number." },
      { id: "maxUses", l: "Uses in all", im: "numeric", help: "0: no limit.", check: v => /^\d+$/.test(String(v || "0")) ? "" : "A whole number." },
      { id: "perBuyer", l: "Once per buyer (by email)", type: "switch" },
      { id: "startsAt", l: "From", type: "date" }, { id: "endsAt", l: "Until", type: "date", help: "Both optional. Lagos days." },
      { id: "status", l: "Status", type: "chips", req: true, opts: [["active", "Active"], ["paused", "Paused"], ["archived", "Archived"]] },
      { id: "note", l: "Note", max: 300, ph: "For the open day flyer" },
    ].filter(Boolean),
    onSubmit: async v => {
      const data = { isNew, code: isNew ? String(v.code || "").trim() : c.code, kind: v.kind, amount: Number(v.amount), minSpend: Number(v.minSpend || 0), maxUses: Number(v.maxUses || 0),
        perBuyer: !!v.perBuyer, startsAt: v.startsAt || "", endsAt: v.endsAt || "", status: v.status, note: v.note || "" };
      try { const r = await NGGApi.admin.shop.codeSave(data); ctx.reload(); return r; }
      catch (e) { const f = CR_SHOP_CFIELD[e.code]; if (f && (f !== "code" || isNew)) return { fieldErrors: { [f]: crShopErr(e) } }; throw e; }
    },
    done: (v, r) => (isNew ? "Created " : "Saved ") + r.code.code + ".",
  });
}
Object.assign(CR_TAB_DEFS, {
  "shop-codes": {
    skeleton: ["table"],
    load: async () => NGGApi.admin.shop.codes(),
    actions: (d, ctx) => [{ l: "New code", icon: "plus", primary: true, run: () => crShopCode(ctx, null) }],
    blocks: (d, ctx) => [{
      type: "table", span: 6, nosel: true, search: "Search codes", cols: ["Code", "Takes off", "Limits", { l: "Used", num: true }, { l: "Given", num: true }, "Status"], filters: ["Status"],
      emptyText: "No codes yet. New code makes one for a flyer, an open day or a thank-you.",
      rows: (d.codes || []).map(c => { const st = CR_SHOP_CSTATUS[c.status] || [c.status, "neutral"]; return { key: c.code, open: () => crShopCode(ctx, c), cells: [
        { k: "mono", t: c.code }, { k: "text", t: c.kind === "percent" ? c.amount + "%" : fmtMoney(c.amount), s: c.minSpend ? "On " + fmtMoney(c.minSpend) + " or more" : "" },
        { k: "text", t: [c.maxUses ? crNum(c.maxUses) + " uses" : "No cap", c.perBuyer ? "once each" : ""].filter(Boolean).join(", "), s: [c.startsAt && "from " + c.startsAt, c.endsAt && "until " + c.endsAt].filter(Boolean).join(" ") },
        { k: "num", t: crNum(c.used), v: c.used }, { k: "num", t: fmtMoney(c.given || 0), v: c.given || 0 }, { k: "status", t: st[0], tone: st[1] } ] }; }),
    }],
  },
});

/* ── Reports ── */
const crShopRange = { from: "", to: "", productId: "" };
function crShopRangeForm(ctx, d) {
  ctx.form({
    title: "Report dates", submit: "Show", values: { from: d.from, to: d.to, productId: d.productId || "" },
    intro: "Lagos days, by when each order was paid. At most " + crNum(d.daysMax || 366) + " days.",
    fields: [{ id: "from", l: "From", type: "date", req: true }, { id: "to", l: "To", type: "date", req: true },
      { id: "productId", l: "Only one product", type: "select", opts: [["", "Every product"]].concat((d.productsList || []).map(p => [p.productId, p.name])), help: "For a pre-order: the counts per size are the print order." }],
    onSubmit: async v => { crShopRange.from = v.from; crShopRange.to = v.to; crShopRange.productId = v.productId || ""; ctx.reload(); return {}; },
    done: "Showing the new range.",
  });
}
Object.assign(CR_TAB_DEFS, {
  "shop-reports": {
    skeleton: ["kpis", "table"],
    load: async () => {
      const [r, p] = await Promise.all([NGGApi.admin.shop.report({ from: crShopRange.from, to: crShopRange.to, productId: crShopRange.productId }), NGGApi.admin.shop.pos().catch(() => ({ products: [] }))]);
      return Object.assign({}, r, { productsList: p.products || [] });
    },
    actions: (d, ctx) => [
      { l: "Change dates", icon: "calendar-blank", primary: true, run: () => crShopRangeForm(ctx, d) },
      { l: "Download by product (CSV)", icon: "download-simple", disabled: !(d.byProduct || []).length, why: "Nothing sold in this range.",
        run: () => crDownloadCsv("ngg-shop-by-product-" + d.from + "-to-" + d.to, ["Product", "Size or option", "Items sold", "Amount"], (d.byProduct || []).map(r => [r.name, r.variant, r.qty, r.amount])) },
      { l: "Download orders (CSV)", icon: "download-simple", run: () => crShopExport(ctx) },
    ],
    blocks: (d, ctx) => {
      const s = d.summary || {}, out = [];
      const pname = d.productId ? ((d.productsList || []).find(p => p.productId === d.productId) || {}).name || "one product" : "";
      out.push({ type: "note", span: 6, icon: "calendar-blank", text: "From " + crDate(d.from) + " to " + crDate(d.to) + (pname ? ", " + pname + " only" : "") + ".",
        sub: (d.truncated ? "Only the first " + crNum(d.max) + " orders are counted; narrow the dates. " : "") + (s.feesUnreported ? crPlural(s.feesUnreported, "online order") + " came without Paystack’s fee, so the net may be a little high." : "") || null });
      out.push({ type: "kpis", span: 6, items: [
        { l: "Gross", v: fmtMoney(s.gross || 0), tone: "flat", s: crPlural(s.orders || 0, "order") + " · " + crPlural(s.items || 0, "item") },
        { l: "Paystack’s fees", v: fmtMoney(s.gatewayFees || 0), tone: "flat", s: "Buyers paid " + fmtMoney(s.buyerCharges || 0) + " in charges" },
        { l: "Refunds", v: fmtMoney(s.refunds || 0), tone: "flat", s: "Processed in the range" },
        { l: "Net", v: fmtMoney(s.net || 0), tone: "flat", s: "Discounts given: " + fmtMoney(s.discounts || 0) },
      ] });
      const ch = d.byChannel || {}, me = d.byMethod || {};
      out.push({ type: "bars", span: 3, title: "How it was paid", empty: "Nothing paid in this range.",
        rows: Object.keys(me).map(k => [CR_SHOP_METHOD[k] || k, me[k]]) });
      out.push({ type: "bars", span: 3, title: "Sell-through", sub: "Sold in the range, against sold plus what is left", pct: true, empty: "No tracked product sold in this range.",
        rows: (d.sellThrough || []).sort((a, b) => b.pct - a.pct).slice(0, 10).map(r => [r.name + " (" + crNum(r.sold) + " sold, " + crNum(r.left) + " left)", r.pct]) });
      const days = Object.keys(d.byDay || {});
      if (days.length > 1) out.push({ type: "columns", span: 6, title: "By day", big: fmtMoney(s.gross || 0), sub: "Gross, by the day it was paid", bars: days.map(k => ({ l: k.slice(5), v: d.byDay[k], tip: crDate(k) + ": " + fmtMoney(d.byDay[k]) })) });
      out.push({ type: "table", span: 6, title: "By product and size", nosel: true, search: "Search", cols: ["Product", "Size or option", { l: "Items", num: true }, { l: "Amount", num: true }],
        emptyText: "Nothing sold in this range.", sortInit: { ci: 2, dir: "desc" },
        rows: (d.byProduct || []).map((r, i) => ({ key: r.productId + "|" + r.variant, cells: [{ k: "strong", t: r.name }, { k: "text", t: r.variant || "—" }, { k: "num", t: crNum(r.qty), v: r.qty }, { k: "num", t: fmtMoney(r.amount), v: r.amount }] })) });
      out.push({ type: "kpis", span: 6, items: [
        { l: "Online", v: fmtMoney(ch.online || 0), tone: "flat" }, { l: "At a table", v: fmtMoney(ch.pos || 0), tone: "flat" },
        { l: "Delivery charged", v: fmtMoney(s.delivery || 0), tone: "flat" }, { l: "Stock value now", v: fmtMoney(d.stockValue || 0), tone: "flat", s: "At today’s prices" },
      ] });
      return out;
    },
  },
});

/* ── Settings ── */
Object.assign(CR_TAB_DEFS, {
  "shop-settings": {
    skeleton: ["cards"],
    load: async () => NGGApi.admin.shop.settings(),
    blocks: (d, ctx) => {
      const S = d.settings || {}, B = d.bounds || {}, out = [];
      const E = B.expireHours || [6, 168];
      if (!d.paystack) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "Online payment isn’t set up. An open shop shows its products, but cannot take orders.",
        sub: "Add the Paystack secret key under Settings → API keys, and point the Paystack webhook at /api/hooks/paystack.php. Refunds report back through the same webhook.", act: ctx.can("settings") ? { l: "Add the Paystack key", run: () => ctx.go("settings", "keys") } : null });
      if (!(d.centres || []).length) out.push({ type: "note", span: 6, icon: "map-pin", tone: "warn", text: "No centre takes collections: there is no active NGG centre with a building. Turn delivery on, or add a centre." });
      out.push({ type: "form", span: 6, key: "shop-settings",
        groups: [
          { h: "The shop", help: "Open, the shop page lists what is on sale and takes orders. It needs at least one product on sale.", rows: [
            { id: "enabled", l: "Shop open", c: "toggle", value: !!S.enabled },
          ] },
          { h: "Delivery", help: "Collection at a centre is always offered where there is one. Delivery adds its fee to the order.", rows: [
            { id: "deliveryOn", l: "Offer delivery", c: "toggle", value: !!S.deliveryOn },
            { id: "deliveryFee", l: "Delivery fee (₦)", c: "input", type: "number", im: "numeric", value: String(S.deliveryFee || 0),
              check: v => { const n = Number(v); return v === "" || !Number.isInteger(n) || n < 0 ? "Enter a whole number." : B.deliveryFeeMax && n > B.deliveryFeeMax ? "At most " + fmtMoney(B.deliveryFeeMax) + "." : ""; } },
          ] },
          { h: "What buyers are told", help: "Shown at checkout and on the order page.", rows: [
            { id: "collectNote", l: "About collecting", c: "textarea", max: 300, value: S.collectNote || "" },
            { id: "deliveryNote", l: "About delivery", c: "textarea", max: 300, value: S.deliveryNote || "" },
          ] },
          { h: "Unpaid orders", help: "An unpaid order holds no stock. It is cancelled after this many hours; money that still arrives later revives it.", rows: [
            { id: "expireHours", l: "Cancel unpaid orders after (hours)", c: "input", type: "number", im: "numeric", value: String(S.expireHours || 24),
              check: v => { const n = Number(v); return !Number.isInteger(n) || n < E[0] || n > E[1] ? "From " + E[0] + " to " + E[1] + " hours." : ""; } },
            { id: "remindUnpaid", l: "Remind the buyer once, after two hours", c: "toggle", value: !!S.remindUnpaid },
          ] },
          { h: "Low stock", help: "A product without its own line warns at this number. The digest goes once a day, after 7 in the morning, to the staff who keep stock or money.", rows: [
            { id: "lowStockDefault", l: "Warn when this many are left", c: "input", type: "number", im: "numeric", value: String(S.lowStockDefault == null ? 3 : S.lowStockDefault),
              check: v => /^\d+$/.test(String(v)) && (!B.lowStockMax || Number(v) <= B.lowStockMax) ? "" : "A whole number." },
            { id: "lowStockDigest", l: "Email the daily low-stock digest", c: "toggle", value: !!S.lowStockDigest },
          ] },
        ],
        save: async patch => {
          const data = Object.assign({}, patch);
          ["deliveryFee", "expireHours", "lowStockDefault"].forEach(k => { if (k in data) data[k] = Number(data[k]); });
          await NGGApi.admin.shop.settingsSet(data);
        },
        onSaved: () => ctx.reload() });
      return out;
    },
  },
});
