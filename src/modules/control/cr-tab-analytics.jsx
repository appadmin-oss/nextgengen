/* ============================================================================
   Control Room v2 — the analytics tabs (Analytics page). Filled into CR_TAB_DEFS (see cr-pages.jsx).

   PROGRESS (for a resumed run): dashboard — built · status — built.
   Still to do: staff, behaviour, engagement.

   dashboard  M&E overview: v1 mounted AnalyticsWorkspace (page-analytics.jsx)
              with no props. It still exists, so it is mounted here, not
              rebuilt — one renderer (CLAUDE.md §7, §11).
   status     The status board (domain/status.php): members, centres, mentors,
              instructors, centre leads, staff. Each part appears only when
              the server sent it (it gates each by capability and scopes rows
              to the reader's centres). The part on screen is the URL tail
              (/control/analytics/status/<part>), so it is deep-linkable.

   View controls (a part, a window, a role) are not a block; they are drawn by
   one small `custom` block, CrAnBar, with the shell's own CrSeg and cr-select.
   ========================================================================== */

/** The view bar: segmented controls and selects that choose what the tab shows. */
function CrAnBar({ items, note }) {
  return (
    <div className="cr-box cr-tbar" role="group" aria-label="View">
      {items.filter(Boolean).map((it, i) => it.kind === "select"
        ? <select key={i} className="cr-select" aria-label={it.label} value={it.value} onChange={e => it.onChange(e.target.value)}>
            {it.options.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
          </select>
        : it.kind === "switch"
          ? <label key={i} className="cr-kv" style={{ alignItems: "center" }}><CrSwitch on={it.value} label={it.label} onChange={it.onChange}/><span>{it.label}</span></label>
          : <CrSeg key={i} label={it.label} value={it.value} options={it.options} onChange={it.onChange}/>)}
      {note && <><span className="cr-grow"/><span className="cr-hint">{note}</span></>}
    </div>
  );
}
function crAnBarBlock(items, note) {
  return { type: "custom", span: 6, render: () => <CrAnBar items={items} note={note}/> };
}

/* ── M&E overview ─────────────────────────────────────────────────────────
   AnalyticsWorkspace owns its own loading, error and empty states, filters,
   saved views and drill-downs; mounting it is the whole of this tab. */
Object.assign(CR_TAB_DEFS, {
  dashboard: {
    skeleton: ["kpis", "table"],
    load: async () => ({}),
    actions: () => [],
    blocks: () => [{
      type: "custom", span: 6,
      // Custom: a whole existing workspace, not something blocks can express.
      render: () => (typeof AnalyticsWorkspace === "function")
        ? <AnalyticsWorkspace/>
        : <CrError error={{ code: "unavailable" }} what="the M&E workspace"/>,
    }],
    facts: () => "The M&E overview: monitoring and evaluation against the formation goals.",
  },
});

/* ── Status board ─────────────────────────────────────────────────────── */
const CR_AN_PARTS = [["members", "Members"], ["centres", "Centres"], ["mentors", "Mentors"], ["instructors", "Instructors"], ["leads", "Centre leads"], ["staff", "Staff & admins"]];
const CR_AN_WORD = { active: ["Active", "ok"], quiet: ["Quiet", "warn"], dormant: ["Dormant", "bad"], never: ["No activity yet", "neutral"], ok: ["OK", "ok"], attention: ["Needs attention", "warn"], unled: ["No lead", "bad"] };
const crAnStatusView = { only: false };

function crAnStateCell(state, days) {
  const w = CR_AN_WORD[state] || [state || "—", "neutral"];
  return { k: "status", t: w[0] + (days != null && state !== "active" && state !== "ok" ? " · " + crNum(days) + "d" : ""), tone: w[1] };
}
function crAnDay(d) { return d ? crDate(d) : ""; }

function crAnStatusBlocks(d, ctx) {
  const parts = CR_AN_PARTS.filter(p => (d.parts || []).indexOf(p[0]) !== -1);
  if (!parts.length) return [{ type: "note", span: 6, icon: "lock-simple", text: "Nothing on the status board is open to your account.", sub: "Each part needs the capability that owns its data: people or club for members and centres, people for mentors and leads, rbac or audit for staff." }];
  const cur = parts.some(p => p[0] === ctx.sub) ? ctx.sub : parts[0][0];
  const only = crAnStatusView.only;
  const m = d.members, c = d.centres;
  const quietOf = t => t ? (t.quiet || 0) + (t.dormant || 0) + (t.never || 0) : 0;
  const k = [];
  if (m) {
    k.push({ l: "Active members", v: crNum(m.tally.active), dn: crNum(m.tally.newThisMonth) + " joined this month" });
    k.push({ l: "In today", v: crNum(m.tally.presentToday), dn: m.tally.lateToday ? crNum(m.tally.lateToday) + " late" : "on time" });
    const blocked = m.tally.atRisk + (m.conduct.suspended || 0) + (m.conduct.evicted || 0);
    k.push({ l: "At risk or blocked", v: crNum(blocked) });
    if (m.withFees) k.push({ l: "Owing", v: crNum(m.tally.owing), dn: fmtMoney(m.tally.owingTotal) });
  }
  if (c) k.push({ l: "Centres needing attention", v: crNum(c.withIssues), dn: "of " + crNum(c.total) });
  if (d.mentors) k.push({ l: "Mentors quiet or dormant", v: crNum(quietOf(d.mentors.tally)) });
  if (d.instructors) k.push({ l: "Instructors quiet or dormant", v: crNum(quietOf(d.instructors.tally)) });
  if (d.leads) k.push({ l: "Centres with no lead", v: crNum(d.leads.unled) });
  if (d.staff) k.push({ l: "Staff without 2FA", v: crNum(d.staff.tally.no2fa) });

  const out = [
    { type: "note", span: 6, icon: "info", text: "Today is " + crDate(d.today) + " (Lagos). " + (d.scoped ? "Your centres only: " + (d.scopeNames || []).join(", ") + "." : "Every centre."),
      sub: "Active means work recorded in the last 14 days, quiet within 30, dormant beyond that. Every status is worked out from records the platform already keeps." },
    { type: "kpis", span: 6, items: k.slice(0, 4) },
    k.length > 4 ? { type: "kpis", span: 6, items: k.slice(4, 9) } : null,
    crAnBarBlock([
      { label: "Status by area", value: cur, options: parts, onChange: v => ctx.setSub(v === parts[0][0] ? "" : v) },
      cur !== "members" ? { kind: "switch", label: "Only what needs attention", value: only, onChange: v => { crAnStatusView.only = v; ctx.setData(x => Object.assign({}, x)); } } : null,
    ]),
  ];

  if (cur === "members" && m) {
    const t = m.tally;
    const rows = [["On track", t.onTrack], ["Watch", t.watch], ["At risk", t.atRisk], ["Not yet rated this week", t.unrated],
      ["Conduct warning", m.conduct.warned || 0], ["Suspended or evicted", (m.conduct.suspended || 0) + (m.conduct.evicted || 0)],
      ["Joined this month", t.newThisMonth], ["Never signed in", t.neverSignedIn], ["Not signed in for 60 days", t.notSignedIn60]]
      .concat(Object.keys(m.byStatus || {}).filter(s => s !== "active").map(s => [s[0].toUpperCase() + s.slice(1).replace(/-/g, " "), m.byStatus[s]]));
    out.push({ type: "bars", span: 2, title: "Where members stand", rows, empty: "No members yet." });
    const sev = s => s >= 4 ? ["Blocked", "bad"] : s >= 3 ? ["At risk", "bad"] : s >= 2 ? ["Warned", "warn"] : ["Watch", "neutral"];
    out.push({ type: "table", span: 4, title: "Members who need attention", sub: m.attentionTotal > m.attention.length ? "The " + crNum(m.attention.length) + " most urgent of " + crNum(m.attentionTotal) : crPlural(m.attentionTotal, "member"),
      cols: ["Member", "Centre", "Level", { l: "Why", wrap: true }, "Last signed in"], nosel: true, search: "Search members", filters: ["Centre", "Level"],
      rows: m.attention.map(r => ({ key: r.memberId, open: ctx.can("people") && typeof crMemOpen === "function" ? () => crMemOpen(ctx, r.memberId) : undefined, cells: [
        { k: "person", t: r.fullName, s: r.memberId },
        { k: "text", t: r.centre || "—" },
        { k: "status", t: sev(r.severity)[0], tone: sev(r.severity)[1] },
        { k: "text", t: r.reasons.join(" · ") },
        { k: "text", t: r.lastSignIn ? crDate(r.lastSignIn) : "Never" },
      ] })),
      emptyText: "Nobody flagged. No member is at risk, blocked, warned or owing a large balance." });
  }
  if (cur === "centres" && c) {
    const rows = only ? c.rows.filter(r => r.state !== "ok") : c.rows;
    out.push({ type: "table", span: 6, title: "Centres", sub: "What each needs", nosel: true, filters: ["Status"],
      cols: ["Centre", { l: "Members", num: true }, { l: "In today", num: true }, { l: "Classes", num: true }, "Lead", "Status", { l: "Issues", wrap: true }],
      rows: rows.map(r => ({ key: r.centreId, cells: [
        { k: "strong", t: r.name, s: (r.meetDays || "Meeting days not set") + (r.meetsToday ? " · meets today" : "") },
        { k: "num", t: crNum(r.members) + (r.capacity ? " / " + crNum(r.capacity) : ""), v: r.members },
        { k: "num", t: crNum(r.presentToday) + (r.lateToday ? " (" + crNum(r.lateToday) + " late)" : ""), v: r.presentToday },
        { k: "num", t: crNum(r.classes), v: r.classes },
        { k: "text", t: [r.lead].concat(r.leadAccounts || []).filter(Boolean).join(", ") || "—" },
        r.issues.length ? { k: "status", t: "Needs attention", tone: "warn" } : crAnStateCell("ok"),
        { k: "text", t: r.issues.join(" · ") },
      ] })),
      emptyText: only ? "Every centre is in order. No centre has an open issue." : "No centres yet. Add one under Members → Centres." });
  }
  const people = (part, list, cols, cells, empty) => {
    const rows = only ? list.filter(r => r.state !== "active") : list;
    out.push({ type: "table", span: 6, title: part, sub: "Quietest first", nosel: true, search: "Search names", filters: ["Centre", "Status"],
      cols: ["Name"].concat(cols, ["Last active", "Status"]),
      rows: rows.map(r => ({ key: r.id, cells: [{ k: "strong", t: r.fullName }].concat(cells(r), [{ k: "text", t: r.lastActive ? crDate(r.lastActive) : "—" }, crAnStateCell(r.state, r.days)]) })),
      emptyText: only ? "Everybody is active. Nobody has gone quiet." : empty });
  };
  if (cur === "mentors" && d.mentors) people("Mentors", d.mentors.rows, ["Kind", "Centre", { l: "Mentees", num: true }, { l: "Stars · remarks (60d)", num: true }],
    r => [{ k: "text", t: r.kind }, { k: "text", t: r.centre || "—" }, { k: "num", t: crNum(r.mentees), v: r.mentees }, { k: "num", t: crNum(r.stars) + " · " + crNum(r.remarks), v: r.stars + r.remarks }],
    "No mentors in your centres yet.");
  if (cur === "instructors" && d.instructors) people("Instructors", d.instructors.rows, ["Centre", "Courses", { l: "Classes", num: true }, { l: "Sessions (60d)", num: true }, { l: "Materials waiting", num: true }],
    r => [{ k: "text", t: r.centre || "—" }, { k: "text", t: r.courses || "—" }, { k: "num", t: crNum(r.classes), v: r.classes }, { k: "num", t: crNum(r.sessions), v: r.sessions }, { k: "num", t: crNum(r.pendingMaterials), v: r.pendingMaterials }],
    "No instructors in your centres yet.");
  if (cur === "leads" && d.leads) {
    const rows = only ? d.leads.rows.filter(r => r.state !== "active") : d.leads.rows;
    out.push({ type: "note", span: 6, icon: "info", text: "A centre’s leads are its lead volunteer (Members → Centres), its lead mentors, and any Centre lead account scoped to it (Settings → Access & roles)." });
    out.push({ type: "table", span: 6, title: "Who leads each centre", nosel: true, filters: ["Status"],
      cols: ["Centre", { l: "Leads", wrap: true }, "Status"],
      rows: rows.map(r => ({ key: r.centreId, cells: [
        { k: "strong", t: r.centre },
        { k: "text", t: r.leads.length ? r.leads.map(p => p.name + " (" + p.kind + ", " + ((CR_AN_WORD[p.state] || [p.state])[0]).toLowerCase() + (p.days != null && p.state !== "active" ? " " + p.days + "d" : "") + ")").join(" · ") : "Nobody — name a lead volunteer or give somebody the Centre lead role." },
        crAnStateCell(r.state),
      ] })),
      emptyText: "Every centre is led. Each centre has an active lead." });
  }
  if (cur === "staff" && d.staff) {
    const s = d.staff, t = s.tally;
    const rows = only ? s.rows.filter(r => r.state !== "active" || r.flags.length) : s.rows;
    out.push({ type: "bars", span: 2, title: "Staff accounts", rows: [["Active", t.active], ["Quiet", t.quiet], ["Dormant or never", t.dormant + t.never], ["Without 2FA", t.no2fa], ["With no centre", t.noCentre]] });
    out.push({ type: "table", span: 4, title: "Staff & admins", nosel: true, search: "Search staff", filters: ["Role", "2FA", "Status"],
      cols: ["Person", "Role", "Centres", "2FA", "Signed in · acted", { l: "Awaiting approval", num: true }, "Status", { l: "Flags", wrap: true }],
      rows: rows.map(r => ({ key: r.memberId, cells: [
        { k: "strong", t: r.fullName, s: r.extraCaps.length ? "+ " + r.extraCaps.join(", ") : "" },
        { k: "text", t: r.roleLabel },
        { k: "text", t: r.centres.length ? r.centres.join(", ") : "All" },
        r.twoFactor ? { k: "status", t: "On", tone: "ok" } : { k: "status", t: "Off", tone: "bad" },
        { k: "text", t: (r.lastSignIn ? crDate(r.lastSignIn) : "Never") + " · " + (r.lastAction ? crDate(r.lastAction) : "—") },
        { k: "num", t: crNum(r.pendingApprovals), v: r.pendingApprovals },
        crAnStateCell(r.state, r.days),
        { k: "text", t: r.flags.join(" · ") },
      ] })),
      emptyText: only ? "Nothing to flag. Every staff account is active, has 2FA and has what its role needs." : "No staff accounts yet." });
  }
  return out.filter(Boolean);
}

Object.assign(CR_TAB_DEFS, {
  status: {
    skeleton: ["kpis", "table"],
    load: async () => await NGGApi.admin.status(),
    actions: (d, ctx) => [{ l: "Refresh", icon: "arrows-clockwise", primary: true, run: () => ctx.reload() }],
    blocks: (d, ctx) => crAnStatusBlocks(d, ctx),
  },
});
