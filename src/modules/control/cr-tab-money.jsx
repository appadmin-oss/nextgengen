/* ============================================================================
   Control Room v2 — the money tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   PROGRESS (for a resumed run): conduct ✓ built · donations ✓ built ·
   fees — in progress. (Verified flags are updated as each is checked in the lab.)

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
