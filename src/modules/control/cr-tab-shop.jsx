/* ============================================================================
   Control Room v2 — the NGG shop (domain/shop.php). Filled into CR_TAB_DEFS
   (see cr-pages.jsx). Three tabs, two trusts, as the server gates them:

     shop-orders    `fees`     orders: paid → ready → completed, or cancelled
     shop-products  `content`  the catalogue: price, options, stock, picture
     shop-settings  `fees`     open / close, delivery and its fee, the notes

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
const CR_SHOP_PSTATUS = { draft: ["Draft", "neutral"], live: ["On sale", "ok"], retired: ["Retired", "bad"] };
const CR_SHOP_ERR = {
  bad_step: "That step isn’t possible for this order any more.", changed: "The order changed while you were looking. It has been reloaded.",
  reason_required: "Say why a paid order is cancelled.", nothing_live: "Put at least one product on sale before opening the shop.",
};
const crShopCtx = { current: null };
function crShopErr(e, fb) { return CR_SHOP_ERR[e && e.code] && !(e.detail && /\s/.test(e.detail)) ? CR_SHOP_ERR[e.code] : crErr(e, fb); }
function crShopSt(s) { return CR_SHOP_STATUS[s] || [s || "—", "neutral"]; }
function crShopWhere(o) { return o.fulfil === "deliver" ? "Delivery" : (o.centre || "—"); }

/* ── Orders ── */
/** One step for several orders, each answered by the server; a partial run says so. */
async function crShopStepMany(ctx, ids, to) {
  const count = ids.length;   // read once, before the confirm
  const verb = to === "ready" ? "ready" : "completed";
  const ok = await ctx.confirm({ title: "Mark " + crPlural(count, "order") + " " + verb + "?",
    body: to === "ready" ? "Each buyer is emailed that their order is ready to collect, or on its way." : "Use this when the goods are in the buyer’s hands. It cannot be undone.", cta: "Mark " + verb });
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
async function crShopStep(ctx, o, to) {
  const ok = await ctx.confirm(to === "ready"
    ? { title: "Mark " + o.orderId + " ready?", body: o.fulfil === "deliver" ? o.buyerName + " is emailed that it is on its way." : o.buyerName + " is emailed that it is ready to collect at " + o.centre + ".", cta: "Mark ready" }
    : { title: (o.fulfil === "deliver" ? "Delivered: " : "Collected: ") + o.orderId + "?", body: "Use this when the goods are in " + o.buyerName + "’s hands. It cannot be undone.", cta: o.fulfil === "deliver" ? "Mark delivered" : "Mark collected" });
  if (!ok) return;
  try { await NGGApi.admin.shop.orderSet(o.orderId, to); ctx.closeDrawer(); ctx.toast(o.orderId + (to === "ready" ? " is ready. The buyer has been told." : " is completed.")); }
  catch (e) { ctx.toast(crShopErr(e, "Couldn’t change that order."), null, true); }
  ctx.reload();
}
function crShopCancel(ctx, o) {
  const paid = !!o.paidAt;
  ctx.closeDrawer();
  ctx.form({
    title: "Cancel " + o.orderId,
    intro: paid ? "This order is paid. Cancelling puts its stock back, tells " + o.buyerName + " a refund follows, and marks it “Refund due”. Refund it in the Paystack dashboard." : "This order was never paid, so nothing is refunded.",
    submit: "Cancel the order", busyLabel: "Cancelling…",
    fields: [{ id: "reason", l: "Why", type: "textarea", rows: 3, max: 300, req: paid, help: paid ? "At least five characters. It is kept on the order." : "" , check: v => paid && String(v || "").trim().length < 5 ? "Say why, in at least five characters." : "" }],
    onSubmit: async v => {
      try { const r = await NGGApi.admin.shop.orderSet(o.orderId, "cancelled", String(v.reason || "").trim()); ctx.reload(); return r; }
      catch (e) { if (e.code === "reason_required") return { fieldErrors: { reason: crShopErr(e) } }; throw e; }
    },
    done: () => o.orderId + " is cancelled." + (paid ? " Refund it in Paystack." : ""),
  });
}
function crShopOpen(ctx, o) {
  const st = crShopSt(o.status);
  const acts = [];
  if (o.status === "paid") acts.push({ l: "Mark ready", primary: true, run: () => crShopStep(ctx, o, "ready") });
  if (o.status === "paid" || o.status === "ready") acts.push({ l: o.fulfil === "deliver" ? "Mark delivered" : "Mark collected", primary: o.status === "ready", run: () => crShopStep(ctx, o, "completed") });
  if (["pending", "paid", "ready"].includes(o.status)) acts.push({ l: "Cancel order…", run: () => crShopCancel(ctx, o) });
  ctx.drawer({
    title: o.orderId, sub: o.buyerName, icon: "shopping-bag",
    stats: [["Paid", o.paidAt ? fmtMoney(o.total + (o.processingFee || 0)) : "Not paid"], ["Status", st[0]], ["Items", crNum(o.lines.reduce((n, l) => n + l.qty, 0))]],
    fields: [["Buyer", o.buyerName], ["Email", o.email], ["Phone", o.phone], [o.fulfil === "deliver" ? "Deliver to" : "Collect at", o.fulfil === "deliver" ? o.address : o.centre],
      ["Ordered", o.createdAt ? crDate(o.createdAt, true) : ""], ["Paid", o.paidAt ? crDate(o.paidAt, true) : ""], ["Ready", o.readyAt ? crDate(o.readyAt, true) : ""],
      ["Completed", o.completedAt ? crDate(o.completedAt, true) : ""], ["Paystack reference", o.reference]],
    sections: [
      { h: "Items", rows: o.lines.map(l => [l.name + (l.option ? " (" + l.option + ")" : "") + " × " + l.qty, fmtMoney(l.amount)])
          .concat(o.delivery ? [["Delivery", fmtMoney(o.delivery)]] : []).concat(o.processingFee ? [["Paystack’s charge (paid by the buyer)", fmtMoney(o.processingFee)]] : [])
          .concat([["Total to NGG", fmtMoney(o.total)]]) },
      o.adminNote ? { h: "Note", text: o.adminNote } : null,
    ].filter(Boolean),
    actions: acts,
  });
}
function crShopOrderRows(ctx, orders) {
  return orders.map(o => { const st = crShopSt(o.status); return { key: o.orderId, open: () => crShopOpen(crShopCtx.current || ctx, o), cells: [
    { k: "strong", t: o.buyerName, s: o.email },
    { k: "mono", t: o.orderId },
    { k: "text", t: crShopWhere(o), s: o.fulfil === "deliver" ? "" : "Collect" },
    { k: "num", t: fmtMoney(o.total), v: o.total },
    { k: "status", t: st[0], tone: st[1] },
    { k: "text", t: o.createdAt ? crDate(o.createdAt) : "—", s: o.createdAt ? crAgo(o.createdAt) : "" },
  ] }; });
}
/** The server-backed list: status and search go to the server; its rows (at most `max`) are paged here. */
function crShopOrderSource(ctx) {
  let last = { key: null, r: null };
  return { fetch: async ({ q, filters, page, pageSize }) => {
    const key = (filters.status || "") + "|" + q;
    if (last.key !== key) last = { key, r: await NGGApi.admin.shop.orders({ status: filters.status || "", q }) };
    const all = last.r.orders || [];
    return { rows: crShopOrderRows(ctx, all.slice(page * pageSize, page * pageSize + pageSize)), total: all.length, max: last.r.max };
  } };
}
Object.assign(CR_TAB_DEFS, {
  "shop-orders": {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const [r, s] = await Promise.all([NGGApi.admin.shop.orders({ status: "open" }), NGGApi.admin.shop.settings().catch(() => null)]);
      return { counts: r.counts || {}, max: r.max || 0, settings: s, src: crShopOrderSource(ctx) };
    },
    actions: (d, ctx) => ctx.can("fees") ? [{ l: "Shop settings", icon: "gear", run: () => ctx.go("shop", "shop-settings") }] : [],
    blocks: (d, ctx) => {
      crShopCtx.current = ctx;
      const c = d.counts, out = [];
      const S = d.settings && d.settings.settings;
      if (S && !S.enabled) out.push({ type: "note", span: 6, icon: "pause-circle", tone: "warn", text: "The shop is closed. Nobody can order until it is opened.", act: { l: "Open settings", run: () => ctx.go("shop", "shop-settings") } });
      if (d.settings && !d.settings.paystack) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "Online payment isn’t set up, so the shop cannot take orders.", sub: "Add the Paystack secret key under Settings → API keys, and point the Paystack webhook at /api/hooks/paystack.php." });
      out.push({ type: "kpis", span: 6, items: [
        { l: "To hand over", v: crNum((c.paid || 0) + (c.ready || 0)), tone: "flat", s: crNum(c.paid || 0) + " to pack · " + crNum(c.ready || 0) + " ready" },
        { l: "Waiting for payment", v: crNum(c.pending || 0), tone: "flat", s: "Unpaid orders hold no stock" },
        { l: "Completed", v: crNum(c.completed || 0), tone: "flat" },
        { l: "Cancelled", v: crNum(c.cancelled || 0), tone: "flat" },
      ] });
      const opt = (v, l, n) => ({ v, l, n });
      out.push({ type: "table", span: 6, title: "Orders", sub: "Newest first. Open one for its items and buyer.",
        cols: ["Buyer", "Order", "Collect at", { l: "Total", num: true }, "Status", "Ordered"],
        server: d.src, filtersInit: { status: "open" },
        filters: [{ id: "status", l: "Status", opts: [opt("open", "To hand over", (c.paid || 0) + (c.ready || 0)), opt("paid", "Paid", c.paid || 0), opt("ready", "Ready", c.ready || 0),
          opt("pending", "Waiting for payment", c.pending || 0), opt("completed", "Completed", c.completed || 0), opt("cancelled", "Cancelled", c.cancelled || 0)] }],
        search: "Order number, name or email",
        footFn: n => crPlural(n, "order") + (d.max && n >= d.max ? " — the newest " + crNum(d.max) + " only; search to find an older one" : ""),
        bulk: ctx.can("fees") ? [
          { l: "Mark ready", max: d.max || 300, run: keys => crShopStepMany(ctx, keys, "ready") },
          { l: "Mark completed", max: d.max || 300, run: keys => crShopStepMany(ctx, keys, "completed") },
        ] : [],
        emptyText: "No orders here. Paid orders appear as soon as Paystack confirms them." });
      return out;
    },
  },
});

/* ── Products ── */
const CR_SHOP_FIELD = { bad_name: "name", bad_category: "category", bad_price: "price", no_price: "price", bad_image: "imageUrl", too_many_options: "options", bad_stock: "stock", bad_status: "status" };
function crShopSplit(v) { return String(v || "").split(",").map(x => x.trim()).filter(Boolean); }
function crShopEdit(ctx, d, p) {
  const isNew = !p || !p.productId;
  const B = d.bounds || {};
  const opts0 = (p && p.options) || [];
  const left = p ? p.left : null;
  ctx.form({
    title: isNew ? "New product" : "Edit " + p.name, submit: isNew ? "Add product" : "Save", busyLabel: "Saving…",
    intro: "A product on sale shows on the shop page at once. Prices are whole naira; buyers pay Paystack’s charge on top.",
    values: isNew ? { category: (d.categories || [])[0] || "Other", status: "draft", limited: false, sort: "100" } : {
      name: p.name, category: p.category, price: String(p.price), description: p.description || "", imageUrl: p.imageUrl || "",
      options: opts0.join(", "), limited: left != null, stock: left ? (opts0.length ? opts0.map(o => left[o] || 0) : [left[""] || 0]).join(", ") : "",
      status: p.status, sort: String(p.sort) },
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
      { id: "status", l: "Status", type: "chips", req: true, opts: (d.statuses || ["draft", "live", "retired"]).map(s => [s, (CR_SHOP_PSTATUS[s] || [s])[0]]), help: "Draft: only staff see it. On sale: on the shop page. Retired: off the page; past orders keep it." },
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
        options, stock, status: v.status, sort: v.sort === "" ? 100 : Number(v.sort) };
      if (!isNew) data.productId = p.productId;
      try { const r = await NGGApi.admin.shop.productSave(data); ctx.reload(); return r; }
      catch (e) { const f = CR_SHOP_FIELD[e.code]; if (f) return { fieldErrors: { [f]: crShopErr(e) } }; throw e; }
    },
    done: v => (isNew ? "Added: " : "Saved: ") + v.name + "." + (v.status === "live" ? " It is on sale." : ""),
  });
}
function crShopStock(p) {
  if (!p.left) return "No limit";
  const o = p.options.length ? p.options : [""];
  return o.map(x => (x ? x + " " : "") + crNum(p.left[x] || 0)).join(" · ");
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
        { k: "text", t: crShopStock(p), s: p.soldOut ? "Sold out" : "" },
        { k: "num", t: crNum(p.sold || 0), v: p.sold || 0 },
        { k: "status", t: st[0], tone: st[1] },
      ] }; }),
    }],
  },
});

/* ── Settings ── */
Object.assign(CR_TAB_DEFS, {
  "shop-settings": {
    skeleton: ["cards"],
    load: async () => NGGApi.admin.shop.settings(),
    blocks: (d, ctx) => {
      const S = d.settings || {}, B = d.bounds || {}, out = [];
      if (!d.paystack) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "Online payment isn’t set up. An open shop shows its products, but cannot take orders.",
        sub: "Add the Paystack secret key under Settings → API keys, and point the Paystack webhook at /api/hooks/paystack.php.", act: ctx.can("settings") ? { l: "Add the Paystack key", run: () => ctx.go("settings", "keys") } : null });
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
        ],
        save: async patch => {
          const data = Object.assign({}, patch);
          if ("deliveryFee" in data) data.deliveryFee = Number(data.deliveryFee);
          await NGGApi.admin.shop.settingsSet(data);
        },
        onSaved: () => ctx.reload() });
      return out;
    },
  },
});
