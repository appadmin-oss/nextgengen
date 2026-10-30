/* ============================================================================
   Control Room v2 — the analytics tabs (Analytics page). Filled into CR_TAB_DEFS (see cr-pages.jsx).

   PROGRESS (for a resumed run): dashboard, status, staff — built and verified.
   Still to do: behaviour, engagement.

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

/* ── Staff activity ───────────────────────────────────────────────────────
   admin.staff.performance: mentors and instructors together, quietest first.
   Counts of work filed, not a rating. Course skills (what instructors mark
   each child against) is the second view, /control/analytics/staff/skills;
   saving it needs `summer`, as the server's admin_course_skills_save gates. */
const crAnStaffView = { days: 30 };
const CR_AN_DAYS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]];

function crAnStaffBlocks(d, ctx) {
  const p = d.perf || {}, t = p.totals || {}, rows = p.staff || [];
  const view = ctx.sub === "skills" ? "skills" : "activity";
  const out = [crAnBarBlock([
    { label: "View", value: view, options: [["activity", "Who is filing" + (t.silent ? " · " + crNum(t.silent) + " silent" : "")], ["skills", "Course skills"]], onChange: v => ctx.setSub(v === "skills" ? "skills" : "") },
    view === "activity" ? { kind: "select", label: "Window", value: String(crAnStaffView.days), options: CR_AN_DAYS, onChange: v => { crAnStaffView.days = Number(v) || 30; ctx.reload(); } } : null,
  ], view === "activity" && p.since ? "Since " + crDate(p.since) : "")];

  if (view === "activity") {
    out.push({ type: "note", span: 6, icon: "info", text: "Mentors and instructors together, quietest first. These are counts of work filed, not a rating — the point is to notice who has stopped, not to rank anyone." + (p.scope === "lead" ? " You’re seeing your own centre." : ""),
      sub: "Coverage is the share of a person’s own children they recorded anything about in the window." });
    out.push({ type: "kpis", span: 6, items: [
      { l: "Staff", v: crNum(t.staff), dn: t.silent ? crNum(t.silent) + " never filed anything" : "everyone has filed something" },
      { l: "Stars", v: crNum(t.stars), dn: crNum(t.remarks) + " notes" + (t.flags ? " · " + crNum(t.flags) + " safeguarding" : "") },
      { l: "Sessions logged", v: crNum(t.sessions) },
      { l: "Skill marks", v: crNum(t.skillMarks) },
    ] });
    out.push({ type: "table", span: 6, title: "Who is filing", sub: crPlural(rows.length, "person", "people"), nosel: true, search: "Search staff", filters: ["Kind", "Centre"], sortInit: null,
      cols: ["Person", "Kind", "Centre", "Last active", "Coverage", { l: "Stars", num: true }, { l: "Notes", num: true }, { l: "Sessions", num: true }, { l: "Skills", num: true }],
      rows: rows.map(s => ({ key: s.staffId + "|" + s.kind, cells: [
        { k: "person", t: s.fullName, s: s.focus || "" },
        s.kind === "lead mentor" ? { k: "status", t: "Lead mentor", tone: "gold" } : { k: "text", t: s.kind[0].toUpperCase() + s.kind.slice(1) },
        { k: "text", t: s.centre || "—" },
        /* Never filed is a different thing from quiet for a while; they must not read the same. */
        s.lastActive ? { k: "text", t: s.quietDays === 0 ? "Today" : crNum(s.quietDays) + "d ago", s: crDate(s.lastActive) } : { k: "status", t: "Never", tone: "bad" },
        s.coverage === null ? { k: "text", t: "No class set" } : { k: "progress", pct: s.coverage, t: s.coverage + "% · " + crNum(s.childrenStarred) + " of " + crNum(s.classSize) },
        { k: "num", t: s.stars ? crNum(s.stars) : "—", v: s.stars },
        { k: "num", t: (s.remarks ? crNum(s.remarks) : "—") + (s.flags ? " (" + crNum(s.flags) + " flagged)" : ""), v: s.remarks },
        { k: "num", t: s.sessions ? crNum(s.sessions) : "—", v: s.sessions },
        { k: "num", t: s.skillMarks ? crNum(s.skillMarks) : "—", v: s.skillMarks },
      ] })),
      emptyText: "No mentors or instructors on record yet." });
    return out;
  }

  out.push({ type: "note", span: 6, icon: "info", text: "What instructors mark each child against, per course. Four levels — not yet, getting there, can do it, can teach it — and no numbers, because a score invites a ranking between children.",
    sub: "Seeded from the catalogue; correct them to whatever the people teaching the course actually mean. One skill per line, verb-led and observable, at most 12 a course." });
  if (d.skillsErr) {
    out.push({ type: "custom", span: 6, render: () => <CrError error={d.skillsErr} onRetry={() => ctx.reload()} what="the course skills"/> });
    return out;
  }
  const skills = d.skills || {}, courses = Object.keys(skills);
  if (!courses.length) { out.push({ type: "note", span: 6, icon: "books", text: "No courses in the catalogue yet, so there is nothing to mark against." }); return out; }
  const canSave = ctx.can("summer");
  if (!canSave) out.push({ type: "note", span: 6, icon: "lock-simple", tone: "warn", text: "Changing the course skills needs the Summer School capability. You can read them." });
  const lines = v => String(v || "").split("\n").map(x => x.trim()).filter(Boolean);
  out.push({ type: "form", span: 6, key: "crAnSkills",
    groups: [{ h: "Course skills", help: "Instructors mark against these from the moment they are saved.", rows: courses.map(c => ({
      id: c, l: c, c: "textarea", rows: Math.max(3, (skills[c] || []).length + 1), value: (skills[c] || []).join("\n"), disabled: !canSave,
      help: crPlural(lines((skills[c] || []).join("\n")).length, "skill"),
      check: v => { const l = lines(v); return l.length > 12 ? "At most 12 skills a course. This has " + l.length + "." : l.some(x => x.length > 120) ? "Keep each skill under 120 characters." : ""; },
    })) }],
    save: async (patch, all) => {
      if (!canSave) throw new Error("forbidden");
      const body = {};
      courses.forEach(c => { body[c] = lines(all[c]); });
      const r = await NGGApi.admin.staff.saveSkills(body);
      ctx.setData(x => Object.assign({}, x, { skills: r.skills || body }));
    } });
  return out;
}

Object.assign(CR_TAB_DEFS, {
  staff: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const [perf, sk] = await Promise.all([
        NGGApi.admin.staff.performance(crAnStaffView.days),
        NGGApi.admin.staff.skills().then(r => ({ skills: r.skills || {} }), e => ({ skillsErr: e })),
      ]);
      return Object.assign({ perf }, sk);
    },
    actions: (d, ctx) => [{ l: "Export CSV", icon: "download-simple", primary: true, disabled: !((d.perf || {}).staff || []).length, why: "Nobody to export yet.",
      run: () => crDownloadCsv("staff-activity-" + crAnStaffView.days + "d", ["Name", "Kind", "Focus", "Centre", "Last active", "Quiet days", "Coverage %", "Children recorded", "Class size", "Stars", "Notes", "Safeguarding flags", "Sessions", "Skill marks"],
        d.perf.staff.map(s => [s.fullName, s.kind, s.focus, s.centre, s.lastActive || "never", s.quietDays == null ? "" : s.quietDays, s.coverage == null ? "" : s.coverage, s.childrenStarred, s.classSize, s.stars, s.remarks, s.flags, s.sessions, s.skillMarks])) }],
    blocks: (d, ctx) => crAnStaffBlocks(d, ctx),
  },
});

/* ── Behaviour ────────────────────────────────────────────────────────────
   admin.behaviour.*: log an observation (auto-triaged — AI when configured,
   rules otherwise; wellbeing or urgent pages the team), list with status and
   category filters, mark reviewed. The server returns at most 300 rows for a
   filter, so the filters go to the server (never applied to a drawn page) and
   a full 300 is said to be truncated. Reading needs people or summer; a write
   about one person is gated by who that person is (behaviour_subject_gate). */
const CR_AN_BEH_MAX = 300;
const CR_AN_SEV = { urgent: ["Urgent", "bad"], concern: ["Concern", "warn"], positive: ["Positive", "ok"], info: ["Info", "neutral"] };
const CR_AN_BEH_CATS = ["wellbeing", "commendation", "respect", "discipline", "peer", "participation"];
const crAnBehCtx = { current: null };
function crAnCap(s) { s = String(s || ""); return s ? s[0].toUpperCase() + s.slice(1) : ""; }

function crAnBehServer() {
  const cache = {};
  return {
    sortKeys: {},
    fetch: async ({ filters, page, pageSize }) => {
      const f = { status: filters.status || "", category: filters.category || "" };
      const k = f.status + "|" + f.category;
      if (!cache[k] || page === 0) cache[k] = (await NGGApi.admin.behaviour.list(f)).logs || [];
      const all = cache[k];
      return { total: all.length, rows: all.slice(page * pageSize, page * pageSize + pageSize).map(l => crAnBehRow(l)) };
    },
  };
}
function crAnBehRow(l) {
  const sev = CR_AN_SEV[l.severity] || [crAnCap(l.severity), "neutral"];
  const note = String(l.note || "");
  return { key: l.logId, open: () => crAnBehOpen(crAnBehCtx.current, l), cells: [
    { k: "person", t: l.subjectName || l.subjectId, s: l.subjectId },
    { k: "status", t: crAnCap(l.category) + " · " + sev[0].toLowerCase(), tone: sev[1] },
    { k: "text", t: note.length > 140 ? note.slice(0, 139) + "…" : note },
    { k: "text", t: l.observerName || l.observerId, s: l.aiSource ? (l.aiSource === "manual" ? "Filed by hand" : l.aiSource === "ai" ? "Triaged by AI" : "Triaged by rules") : "" },
    { k: "text", t: crDate(l.createdAt) },
    l.status === "reviewed" ? { k: "status", t: "Reviewed", tone: "ok" } : { k: "status", t: "Open", tone: "neutral" },
  ] };
}

function crAnBehOpen(ctx, l) {
  const sev = CR_AN_SEV[l.severity] || [crAnCap(l.severity), "neutral"];
  ctx.drawer({
    title: l.subjectName || l.subjectId, name: l.subjectName || l.subjectId,
    sub: [l.subjectId, crAnCap(l.category), sev[0]].filter(Boolean).join(" · "),
    stats: [["Status", l.status === "reviewed" ? "Reviewed" : "Open"], ["Severity", sev[0]], ["Logged", crAgo(l.createdAt)]],
    fields: [["Category", crAnCap(l.category)], ["Observer", l.observerName || l.observerId], ["Logged", crDate(l.createdAt, true)],
      ["Triage", l.aiSource === "manual" ? "Chosen by the observer" : l.aiSource === "ai" ? "AI" : l.aiSource ? "Rules" : ""],
      ["Acknowledged", l.ackAt ? crDate(l.ackAt, true) + " · " + l.ackBy + (l.ackChannel ? " (" + l.ackChannel + ")" : "") : ""],
      ["Reviewed", l.reviewedAt ? crDate(l.reviewedAt, true) + (l.reviewedBy ? " · " + l.reviewedBy : "") : ""]],
    sections: [{ h: "Observation", text: l.note || "" }],
    actions: l.status === "open" ? [{ l: "Mark reviewed", primary: true, run: async () => {
      try {
        await NGGApi.admin.behaviour.review(l.logId);
        ctx.closeDrawer();
        ctx.toast("Marked reviewed · " + (l.subjectName || l.subjectId));
        ctx.reload();
      } catch (e) { ctx.toast(crErr(e, "Couldn’t mark that reviewed."), null, true); }
    } }] : [],
  });
}

function crAnBehLog(ctx) {
  const cats = (ctx.data && ctx.data.categories) || CR_AN_BEH_CATS;
  ctx.form({
    title: "Log an observation", submit: "Log observation", busyLabel: "Saving…",
    intro: "About one member or Summer School participant. Leave category and severity blank and it is triaged for you. Wellbeing and urgent notes page the team. Members never see these.",
    values: { subjectId: "", category: "", severity: "", note: "" },
    fields: [
      { id: "subjectId", l: "Member or participant ID", req: true, max: 40, ph: "LAB-M1", help: "The ID on their record." },
      { id: "category", l: "Category", type: "select", ph: "Work it out from the note", opts: cats.map(c => [c, crAnCap(c)]) },
      { id: "severity", l: "Severity", type: "select", ph: "Work it out from the note", opts: ["info", "concern", "urgent", "positive"].map(s => [s, CR_AN_SEV[s][0]]), when: v => !!v.category, help: "Used only when you choose a category." },
      { id: "note", l: "Observation", type: "textarea", req: true, rows: 4, max: 1500, ph: "What happened, in a sentence or two.", check: v => String(v || "").trim().length < 5 ? "Write at least a few words." : "" },
    ],
    onSubmit: async v => {
      const r = await NGGApi.admin.behaviour.log(String(v.subjectId).trim(), String(v.note).trim(), v.category || "", v.category ? (v.severity || "") : "");
      ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
      ctx.reload();
      return r;
    },
    done: (v, r) => "Logged as " + r.category + " · " + r.severity + (r.aiSource === "manual" ? "" : " (" + (r.aiSource === "ai" ? "AI" : "rules") + ")"),
  });
}

Object.assign(CR_TAB_DEFS, {
  behaviour: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const r = await NGGApi.admin.behaviour.list({});
      return { trend: r.trend || {}, openFlags: r.openFlags || 0, categories: r.categories || CR_AN_BEH_CATS, total: (r.logs || []).length,
        open: (r.logs || []).filter(l => l.status === "open").length, server: crAnBehServer(), rev: 0 };
    },
    actions: (d, ctx) => [{ l: "Log observation", icon: "note-pencil", primary: true, run: () => crAnBehLog(ctx), disabled: !ctx.can(["people", "summer"]), why: "Needs the people or Summer School capability." }],
    blocks: (d, ctx) => {
      crAnBehCtx.current = ctx;
      const trend = Object.keys(d.trend).map(k => [crAnCap(k), d.trend[k]]).sort((a, z) => z[1] - a[1]);
      const last30 = trend.reduce((n, r) => n + r[1], 0);
      return [
        { type: "note", span: 6, icon: "info", text: "Patterns mentors should know about. Not a punishment list.", sub: "Each observation is triaged on arrival — by AI when it is configured, by rules otherwise. Wellbeing and urgent notes page the team through the configured integrations. They are staff-only." },
        { type: "kpis", span: 6, items: [
          { l: "Open flags", v: crNum(d.openFlags), dn: "wellbeing or urgent, not yet reviewed" },
          { l: "Waiting for review", v: crNum(d.open), dn: d.total >= CR_AN_BEH_MAX ? "in the newest " + crNum(CR_AN_BEH_MAX) : "of " + crNum(d.total) + " logged" },
          { l: "Last 30 days", v: crNum(last30), dn: "observations" },
        ] },
        { type: "bars", span: 2, title: "Last 30 days", sub: "By category", rows: trend, empty: "Nothing logged in the last 30 days." },
        { type: "table", span: 4, title: "Observations", sub: "Newest first" + (d.total >= CR_AN_BEH_MAX ? " · the server returns the newest " + crNum(CR_AN_BEH_MAX) + " for a filter" : ""),
          nosel: true, reloadKey: d.rev, server: d.server,
          cols: ["Subject", "Category", { l: "Observation", wrap: true }, "Observer", "Logged", "Status"],
          filters: [
            { id: "status", l: "Status", opts: [{ v: "open", l: "Open" }, { v: "reviewed", l: "Reviewed" }] },
            { id: "category", l: "Category", opts: (d.categories || CR_AN_BEH_CATS).map(c => ({ v: c, l: crAnCap(c) })) },
          ],
          emptyText: "No observations logged yet. Log one from the header when a mentor tells you something worth keeping." },
      ];
    },
  },
});

/* engagement: the v1 panel, mounted (crPanel) until it is rebuilt as blocks. */
Object.assign(CR_TAB_DEFS, {
  engagement: crPanel(() => <EngagementPanel/>),
});
