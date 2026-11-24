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

/* ── Instructors (domain/instructor-admin.php) ───────────────────────────────
   The people who teach the Club's courses: what they teach, whether they are
   cleared to be with children, whether they are filing their classes, and the
   record of every decision about them. Who needs attention sorts first. */
const CR_IN_STATES = [["", "Teaching or on leave"], ["active", "Teaching"], ["on_leave", "On leave"], ["offboarded", "Offboarded"], ["all", "Everyone"]];
const CR_IN_STATE = { active: ["Teaching", "ok"], on_leave: ["On leave", "warn"], offboarded: ["Offboarded", "neutral"] };
const CR_IN_NOTE = [["note", "Note"], ["review", "Review"], ["warning", "Warning"], ["commendation", "Commendation"]];
const CR_IN_REC = { note: "Note", review: "Review", warning: "Warning", commendation: "Commendation", change: "Changed", leave: "Leave", offboard: "Offboarded", reinstate: "Reinstated" };
const crInCtx = { current: null };
function crInDay(d) { return d ? crDate(d) : "—"; }
function crInServer(state, issue, labels) {
  return { fetch: async ({ q, page, pageSize }) => {
    const r = await NGGApi.admin.instructors.list({ state, issue, q: q || "", page, pageSize });
    return { total: r.total, rows: (r.rows || []).map(x => {
      const st = CR_IN_STATE[x.state] || [x.state, "neutral"];
      return { key: x.volunteerId, open: () => crInOpen(crInCtx.current, x.volunteerId), cells: [
        { k: "person", t: x.fullName, s: [x.centre, x.courses.join(", ")].filter(Boolean).join(" · "), photo: x.photoUrl || undefined },
        { k: "status", t: st[0] + (x.state === "on_leave" && x.leaveUntil ? " to " + crInDay(x.leaveUntil) : ""), tone: st[1] },
        { k: "status", t: x.issues.length ? crPlural(x.issues.length, "issue") : "None", tone: x.issues.some(i => /^safeguarding_(pending|expired)$/.test(i)) ? "bad" : x.issues.length ? "warn" : "ok" },
        { k: "num", t: crNum(x.classes), v: x.classes },
        { k: "text", t: crNum(x.filed30) + " filed", s: x.lastFiled ? "last " + crInDay(x.lastFiled) : "never" },
        { k: "text", t: x.issues.map(i => labels[i] || i).join(" · ") || "—" },
      ] };
    }) };
  } };
}
async function crInOpen(ctx, vid) {
  let r;
  try { r = await NGGApi.admin.instructors.get(vid); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t open that instructor."), null, true); return; }
  const i = r.instructor, L = r.issueLabels || {}, st = CR_IN_STATE[i.state] || [i.state];
  const live = i.state !== "offboarded";
  const sg = i.safeguarding === "cleared" ? "Cleared" + (i.safeguardingCheckedAt ? " " + crInDay(i.safeguardingCheckedAt) : "") + (i.safeguardingExpires ? " · expires " + crInDay(i.safeguardingExpires) : "") : i.safeguarding === "in_progress" ? "In progress" : "Not cleared";
  ctx.drawer({
    title: i.fullName, name: i.fullName, photo: i.photoUrl || undefined, sub: st[0] + " · " + (i.centre || "No centre"),
    stats: [["Classes", crNum(r.classes.length)], ["Filed (" + r.activityDays + " days)", crNum(i.filed30)], ["Issues", i.issues.length ? crNum(i.issues.length) : "None"]],
    fields: [["Teaches", i.courses.join(", ") || "Nothing yet"], ["Safeguarding", sg], ["Academy", i.academyDone || i.academyClearedAt ? "Completed" + (i.academyClearedAt && !i.academyDone ? " (waived)" : "") : "Not completed"],
      ["Member account", i.memberId || "None — cannot file classes"], ["Next review", crInDay(i.reviewDue)], ["Email", i.email], ["Phone", i.phone ? crMask(i.phone) : ""], ["With NGG since", crInDay(i.since)],
      i.state === "on_leave" ? ["On leave", crInDay(i.leaveFrom) + " to " + (i.leaveUntil ? crInDay(i.leaveUntil) : "no end date") + " · " + i.leaveReason] : null,
      i.state === "offboarded" ? ["Offboarded", crDate(i.offboardedAt) + " · " + i.offboardReason] : null].filter(Boolean),
    sections: [
      { h: "What needs attention", empty: "Nothing. They are cleared, trained, on the timetable and filing their classes.", list: i.issues.length ? i.issues.map(k => ({ icon: /safeguarding/.test(k) ? "shield-warning" : "warning", t: L[k] || k })) : null },
      { h: "Classes on the timetable", empty: "None. Give them a class in Learning → Timetable.", list: r.classes.length ? r.classes.map(c => ({ icon: "calendar-blank", t: c.course + (c.level ? " · " + c.level : ""), s: [c.centre, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c.weekday] + " " + c.startTime + "–" + c.endTime, c.room].filter(Boolean).join(" · ") })) : null },
      { h: "Classes filed", empty: "None filed yet.", list: r.sessions.length ? r.sessions.map(s => ({ icon: s.filedAt ? "check-circle" : "circle-dashed", t: s.course + " · " + crInDay(s.date), s: [s.centre, s.filedAt ? "filed" : s.rollClosedAt ? "roll taken, not filed" : "started"].join(" · ") })) : null },
      { h: "Record", empty: "Nothing recorded yet.", list: r.record.length ? r.record.map(n => ({ icon: n.kind === "warning" ? "warning" : n.kind === "commendation" ? "medal" : n.kind === "review" ? "clipboard-text" : "note", t: (CR_IN_REC[n.kind] || n.kind) + " · " + n.text, s: "by " + (n.actorName || n.actor), m: crDate(n.at, true) })) : null },
    ],
    actions: [
      { l: "Add to their record", primary: true, run: () => crInNote(ctx, i) },
      live ? { l: "Edit what they teach", run: () => crInEdit(ctx, i, r.courseOptions || []) } : null,
      live && i.state !== "on_leave" ? { l: "Put on leave", run: () => crInLeave(ctx, i) } : null,
      i.state === "on_leave" ? { l: "End leave", run: async () => { try { await NGGApi.admin.instructors.leave(i.volunteerId, { clear: true }); ctx.toast(i.fullName + " is back from leave."); ctx.reload(); crInOpen(ctx, i.volunteerId); } catch (e) { ctx.toast(crErr(e, "Couldn’t end the leave."), null, true); } } } : null,
      live ? { l: "Offboard", run: () => crInOffboard(ctx, i, r.classes.length) } : { l: "Reinstate", run: () => crInReinstate(ctx, i) },
    ].filter(Boolean),
  });
}
function crInAfter(ctx, vid, msg) { ctx.reload(); crInOpen(ctx, vid); return msg; }
function crInNote(ctx, i) {
  ctx.form({ title: "Add to " + i.fullName + "’s record", submit: "Add it", busyLabel: "Saving…",
    intro: "What happened or what was decided. It stays on their record with your name and the time, and staff with the people permission can read it.",
    values: { kind: "note", text: "", nextReview: "" },
    fields: [
      { id: "kind", l: "What it is", type: "chips", req: true, opts: CR_IN_NOTE },
      { id: "text", l: "What happened", type: "textarea", rows: 4, req: true, max: 2000 },
      { id: "nextReview", l: "Next review", type: "date", when: v => v.kind === "review", help: "Optional. Sets when they are reviewed again." },
    ],
    onSubmit: async v => { await NGGApi.admin.instructors.note(i.volunteerId, v.kind, v.text.trim(), v.kind === "review" ? v.nextReview : ""); },
    done: v => crInAfter(ctx, i.volunteerId, (CR_IN_NOTE.find(k => k[0] === v.kind) || [0, "Note"])[1] + " added.") });
}
function crInEdit(ctx, i, options) {
  ctx.form({ title: "What " + i.fullName + " teaches", submit: "Save", busyLabel: "Saving…",
    intro: "A course they still teach on the timetable can’t be taken off them here: give those classes to someone else first, in Learning → Timetable.",
    values: { courses: i.courses.slice(), safeguardingCheckedAt: i.safeguardingCheckedAt, safeguardingExpires: i.safeguardingExpires, reviewDue: i.reviewDue },
    fields: [
      { id: "courses", l: "Courses", type: "multi", opts: options.map(c => [c, c]) },
      { id: "safeguardingCheckedAt", l: "Safeguarding check done on", type: "date" },
      { id: "safeguardingExpires", l: "Safeguarding check expires", type: "date", check: (v, all) => v && all.safeguardingCheckedAt && v <= all.safeguardingCheckedAt ? "It must expire after the day it was done." : "" },
      { id: "reviewDue", l: "Next review", type: "date" },
    ],
    onSubmit: async v => {
      try { await NGGApi.admin.instructors.update(i.volunteerId, { courses: v.courses, safeguardingCheckedAt: v.safeguardingCheckedAt || "", safeguardingExpires: v.safeguardingExpires || "", reviewDue: v.reviewDue || "" }); }
      catch (e) { const c = e && ((e.data && e.data.error) || e.code); if (c === "course_has_classes" || c === "bad_course") return { fieldErrors: { courses: crErr(e, "Check the courses.") } }; throw e; }
    },
    done: () => crInAfter(ctx, i.volunteerId, "Saved. The change is on their record.") });
}
function crInLeave(ctx, i) {
  const t = new Date().toISOString().slice(0, 10);
  ctx.form({ title: "Put " + i.fullName + " on leave", submit: "Put on leave", busyLabel: "Saving…",
    intro: "Their classes stay theirs while they are away; you’ll be shown which ones need cover.",
    values: { from: t, until: "", reason: "" },
    fields: [
      { id: "from", l: "First day", type: "date", req: true },
      { id: "until", l: "Last day", type: "date", help: "Leave empty if you don’t know yet.", check: (v, all) => v && v < all.from ? "The last day can’t be before the first." : "" },
      { id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 600 },
    ],
    onSubmit: async v => NGGApi.admin.instructors.leave(i.volunteerId, { from: v.from, until: v.until || "", reason: v.reason.trim() }),
    done: (v, res) => crInAfter(ctx, i.volunteerId, res && res.needCover && res.needCover.length ? "On leave. " + crPlural(res.needCover.length, "class needs", "classes need") + " cover." : "On leave.") });
}
function crInOffboard(ctx, i, nClasses) {
  ctx.form({ title: "Offboard " + i.fullName, submit: "Offboard", busyLabel: "Offboarding…",
    intro: "They lose access to the instructor portal at once. Their record stays. " + (nClasses ? crPlural(nClasses, "class", "classes") + " will be taken off them and listed for cover." : "They have no classes on the timetable."),
    values: { reason: "" }, fields: [{ id: "reason", l: "Why they are leaving", type: "textarea", rows: 3, req: true, max: 600, check: v => v.trim().length < 8 ? "Say why, for the record." : "" }],
    onSubmit: async v => NGGApi.admin.instructors.offboard(i.volunteerId, v.reason.trim()),
    done: (v, res) => crInAfter(ctx, i.volunteerId, res && res.uncovered && res.uncovered.length ? "Offboarded. " + crPlural(res.uncovered.length, "class needs", "classes need") + " a new instructor." : "Offboarded.") });
}
function crInReinstate(ctx, i) {
  ctx.form({ title: "Reinstate " + i.fullName, submit: "Reinstate", busyLabel: "Saving…",
    intro: "They can sign in to the instructor portal again. Classes taken off them are not handed back: give them classes in Learning → Timetable.",
    values: { reason: "" }, fields: [{ id: "reason", l: "Why they are coming back", type: "textarea", rows: 3, req: true, max: 600, check: v => v.trim().length < 8 ? "Say why, for the record." : "" }],
    onSubmit: async v => NGGApi.admin.instructors.reinstate(i.volunteerId, v.reason.trim()),
    done: () => crInAfter(ctx, i.volunteerId, "Reinstated.") });
}
async function crInExport(ctx, d) {
  try {
    const r = await NGGApi.admin.instructors.list({ state: "all", page: 0, pageSize: 200 });
    const rows = r.rows || [];
    crDownloadCsv("instructors-" + new Date().toISOString().slice(0, 10),
      ["Name", "Centre", "Courses", "State", "Safeguarding", "Safeguarding expires", "Academy", "Classes", "Filed (30 days)", "Last filed", "Next review", "Issues"],
      rows.map(x => [x.fullName, x.centre, x.courses.join("; "), (CR_IN_STATE[x.state] || [x.state])[0], x.safeguarding, x.safeguardingExpires, x.academy ? "yes" : "no", x.classes, x.filed30, x.lastFiled, x.reviewDue,
        x.issues.map(k => (d.labels || {})[k] || k).join("; ")]));
    if (r.total > rows.length) ctx.toast("The first " + crNum(rows.length) + " of " + crNum(r.total) + " were exported — the most one file holds.");
  } catch (e) { ctx.toast(crErr(e, "Couldn’t export the instructors."), null, true); }
}
Object.assign(CR_TAB_DEFS, {
  instructors: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      crInCtx.current = ctx;
      const r = await NGGApi.admin.instructors.list({ state: "all", pageSize: 1 });
      return { counts: r.counts || {}, issues: r.issues || {}, labels: r.issueLabels || {}, uncovered: r.uncovered || [], days: r.activityDays || 30, rev: Date.now() };
    },
    actions: (d, ctx) => [{ l: "Export CSV", icon: "download-simple", run: () => crInExport(ctx, d) }],
    blocks: (d, ctx) => {
      crInCtx.current = ctx;
      // The URL tail carries the filters: "<state>~<issue>".
      const [stRaw, isRaw] = String(ctx.sub || "").split("~");
      const state = CR_IN_STATES.some(s => s[0] === stRaw) ? stRaw : "";
      const issue = isRaw === "any" || Object.prototype.hasOwnProperty.call(d.labels, isRaw || "") ? isRaw : "";
      const go = (s, i2) => ctx.setSub((s || "") + (i2 ? "~" + i2 : ""));
      const c = d.counts, I = d.issues;
      const sgBad = (I.safeguarding_pending || 0) + (I.safeguarding_expired || 0);
      const key = "in-" + state + "-" + issue;
      d.servers = d.servers || {};
      d.servers[key] = d.servers[key] || crInServer(state, issue, d.labels);
      return [
        { type: "kpis", span: 6, items: [
          { l: "Teaching", v: crNum(c.active || 0), s: crNum(c.on_leave || 0) + " on leave" },
          { l: "Not cleared to be with children", v: crNum(sgBad), tone: sgBad ? "down" : "flat", s: crNum(I.safeguarding_expiring || 0) + " expiring in 30 days" },
          { l: "With something to sort out", v: crNum(c.withIssues || 0), tone: c.withIssues ? "down" : "flat", s: crNum(I.not_filing || 0) + " not filing classes" },
          { l: "Classes with nobody to teach them", v: crNum(d.uncovered.length), tone: d.uncovered.length ? "down" : "flat", s: "on the timetable" },
        ] },
        { type: "attention", span: 6, title: "What needs doing", empty: "Nothing needs doing. Every instructor is cleared, trained, on the timetable and filing.", rows: [
          { n: sgBad, l: "Safeguarding not cleared or expired", s: "They may not be with children until it is.", tone: "bad", onClick: () => go(state, "safeguarding") },
          { n: I.safeguarding_expiring || 0, l: "Safeguarding checks expiring within 30 days", tone: "warn", onClick: () => go(state, "safeguarding_expiring") },
          { n: I.not_filing || 0, l: "Classes on the timetable but nothing filed in " + d.days + " days", tone: "warn", onClick: () => go(state, "not_filing") },
          { n: I.academy || 0, l: "Instructor Academy not completed", tone: "warn", onClick: () => go(state, "academy") },
          { n: I.no_account || 0, l: "No member account, so they can’t file a class", tone: "warn", onClick: () => go(state, "no_account") },
          { n: I.review_overdue || 0, l: "Reviews overdue", tone: "warn", onClick: () => go(state, "review_overdue") },
          { n: d.uncovered.length, l: "Classes with no instructor", s: d.uncovered.slice(0, 3).map(u => u.course + " at " + u.centre).join(" · "), tone: "warn", go: ["learning", "timetable"] },
        ] },
        { type: "custom", span: 6, render: (c2, phone) => (
          <div className={phone ? "cr-pchips" : "cr-wrap"} role="group" aria-label="Show instructors">
            {CR_IN_STATES.map(([k, l]) => <button key={k || "default"} type="button" className="cr-chip" aria-pressed={state === k} onClick={() => go(k, issue)}>{l}</button>)}
            {issue && <button type="button" className="cr-chip" aria-pressed="true" onClick={() => go(state, "")}>{(issue === "any" ? "Any issue" : d.labels[issue]) + " · clear"}</button>}
          </div>
        ) },
        { type: "table", span: 6, key, server: d.servers[key], reloadKey: d.rev, nosel: true,
          search: "Name, centre or course",
          cols: ["Instructor", "Status", "Issues", { l: "Classes", num: true, sort: false }, { l: "Filed in " + d.days + " days", sort: false }, { l: "What needs sorting out", wrap: true, sort: false }],
          emptyText: issue ? "Nobody here has that issue." : "No instructors yet. A volunteer approved as an instructor appears here." },
      ];
    },
    facts: d => crNum(d.counts.active || 0) + " instructors teaching, " + crNum(d.counts.on_leave || 0) + " on leave; " + crNum(d.counts.withIssues || 0) + " with something to sort out; " + crNum(d.uncovered.length) + " classes with no instructor.",
  },
});
