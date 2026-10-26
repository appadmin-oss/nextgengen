/* ============================================================================
   Control Room v2 — the mentors and volunteers tabs (Mentors & volunteers page). Filled into CR_TAB_DEFS (see cr-pages.jsx).
   ========================================================================== */
/* Each tab mounts the panel that served it in v1 (page-admin.jsx) through
   crPanel, until it is rebuilt as blocks — so nothing v1 did is lost. */
Object.assign(CR_TAB_DEFS, {
  mentors: crPanel(() => <AdminMentors/>),
  mentorship: crPanel(() => <AdminMentorship/>),
  volunteers: crPanel(ctx => <AdminVolunteers crCtx={ctx}/>),
});

/* ── Companion check-ins, native ─────────────────────────────────────────────
   Was AdminCompanion mounted whole. Same op (admin.companion board / assess),
   same rule: re-assessing works this week's check-in out again from today's
   record and does NOT email it again — said in the confirm, with the count read
   before it. Those who need support sort first, as the server returns them. */
const CR_COMP_RATINGS = [["", "Everyone"], ["at_risk", "Needs support"], ["watch", "Watch"], ["on_track", "On track"]];
const CR_COMP_TONE = { at_risk: "bad", watch: "warn", on_track: "ok" };
function crCompServer(rating) {
  return { fetch: async ({ q, page, pageSize }) => {
    const r = await NGGApi.admin.companion.board(rating);
    const needle = String(q || "").toLowerCase();
    const all = (r.rows || []).filter(x => !needle || [x.fullName, x.displayId, x.memberId, x.centre, x.track].join(" ").toLowerCase().indexOf(needle) !== -1);
    return { total: all.length, rows: all.slice(page * pageSize, page * pageSize + pageSize).map(x => ({
      key: x.memberId,
      cells: [
        { k: "person", t: x.fullName, s: [x.displayId || x.memberId, x.centre, x.track].filter(Boolean).join(" · ") },
        { k: "status", t: (typeof COMPANION_RATING_LABEL !== "undefined" && COMPANION_RATING_LABEL[x.rating]) || x.rating, tone: CR_COMP_TONE[x.rating] || "neutral" },
        { k: "text", t: (x.reasons || []).join(" · ") || "—" },
        { k: "text", t: (x.focus || []).join(" ") + (x.source === "ai" ? " (AI)" : "") },
      ],
    })) };
  } };
}
Object.assign(CR_TAB_DEFS, {
  companion: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const r = await NGGApi.admin.companion.board("");
      const servers = {};
      CR_COMP_RATINGS.forEach(([k]) => { servers[k || "all"] = crCompServer(k); });
      return { period: r.period, counts: r.counts || {}, members: r.members || 0, scoped: !!r.scoped, servers, rev: Date.now() };
    },
    blocks: (d, ctx) => {
      const rating = CR_COMP_RATINGS.some(x => x[0] === ctx.sub) ? ctx.sub : "";
      const c = d.counts, assessed = (c.at_risk || 0) + (c.watch || 0) + (c.on_track || 0);
      return [
        { type: "kpis", span: 6, items: [
          { l: "Need support", v: crNum(c.at_risk), dn: "week of " + (d.period || "—") },
          { l: "To watch", v: crNum(c.watch) },
          { l: "On track", v: crNum(c.on_track) },
          { l: "Not assessed yet", v: crNum(Math.max(0, d.members - assessed)) },
        ] },
        { type: "note", span: 6, icon: "heart", text: "Each week the companion reads every NGG member’s last four weeks — attendance, sign-outs, curriculum and conduct — rates them by fixed rules and writes them a short note.",
          sub: "Members and their parents get it by email. Those who need support are listed first, with the reasons." + (d.scoped ? " You see your centres only." : "") },
        { type: "custom", span: 6, render: (c2, phone) => (
          <div className={phone ? "cr-pchips" : "cr-wrap"} role="group" aria-label="Show members rated">
            {CR_COMP_RATINGS.map(([k, l]) => <button key={k || "all"} type="button" className="cr-chip" aria-pressed={rating === k} onClick={() => ctx.setSub(k)}>{l}</button>)}
          </div>
        ) },
        { type: "table", span: 6, key: "comp-" + (rating || "all"), server: d.servers[rating || "all"], reloadKey: d.rev,
          search: "Member, ID, centre or course",
          cols: ["Member", "Rating", { l: "Why", wrap: true }, { l: "Next steps", wrap: true }],
          // No cap typed here: the server holds it (COMPANION_BATCH_RULES) and names it in its refusal.
          bulk: [{ l: "Re-assess now", run: async keys => {
            if (!(await ctx.confirm({ title: "Re-assess " + crPlural(keys.length, "member") + "?", body: "Their check-in for this week is worked out again from today’s record. It is not emailed again.", cta: "Re-assess" }))) return false;
            try { const r = await NGGApi.admin.companion.assess(keys); const sum = crBulkSummary(r, "re-assessed"); ctx.toast(sum.text, null, sum.bad); ctx.reload(); }
            catch (e) { ctx.toast(crErr(e, "Couldn’t re-assess."), null, true); return false; }
          } }],
          emptyText: "No check-ins " + (rating ? "with that rating " : "") + "yet this week. They are worked out through the week, a few at a time." },
      ];
    },
  },
});
