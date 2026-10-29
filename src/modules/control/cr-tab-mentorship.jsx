/* ============================================================================
   Control Room › People › Mentorship — the Anchor Pods workspace
   (design handoff v5, MENTORSHIP.md §4; domain/mentorship-pods.php).

   The portal flags; a person decides. Every rule (R1–R8) writes a nudge for a
   mentor or a lead; nothing here messages a child, and no suggestion is
   applied without somebody pressing a button. Safeguarding is its own
   capability and its tab is not drawn for anyone without it — the server
   refuses them anyway.
   ========================================================================== */

const CR_MS_TASK = { one_to_one: "One-to-one", lead_checkin: "Lead check-in", goal_check: "Goal check", parent_summary: "Summary to the parent",
  relationship_check: "Relationship check", closure: "Closure conversation" };
const CR_MS_PHASE = { match: "Match", connect: "Connect", grow: "Grow", lead: "Lead", close: "Close" };
const CR_MS_HEALTH_TONE = { Healthy: "ok", Watch: "warn", "At risk": "bad", Paused: "neutral", Closing: "neutral" };
/* Rule tones (§3): mentor rules neutral, lead rules amber, R3 and R8 red. */
function crMsRuleTone(rule) { return rule === "R3" || rule === "R8" ? "bad" : (["R5", "R6", "R7", "P1"].indexOf(rule) >= 0 ? "warn" : "neutral"); }
const CR_MS_OBLIG = [["cimc", "CIMC training · Saturday 7:00am"], ["prep", "Mentor Preparation · 7–8pm"], ["saturday", "Mentoring · Saturday 9:30am"],
  ["sts", "STS meeting · Tuesday"], ["retreat", "Quarterly day retreat"]];
const CR_MS_SCORE = [["1", "1 · Not at all"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5 · Completely"]];
const CR_MS_RELQ = ["We get on well", "Time together is useful", "I feel listened to", "I want to keep going"];

function crMsAct(action, body) { return NGGApi.admin.pods.act(action, body); }
function crMsRead(view, opts) { return NGGApi.admin.pods.read(view, opts); }

/* ── Nudges (Needs attention) ──────────────────────────────────────────── */
function crMsNudgeRows(nudges, ctx) {
  return (nudges || []).map(n => ({
    icon: n.rule === "R3" || n.rule === "R8" ? "warning-octagon" : "bell-simple",
    t: n.title, s: [n.body, n.suggestion].filter(Boolean).join(" · "), m: n.rule + " · " + (n.ruleLabel || ""),
    onClick: () => ctx.form({
      title: n.title, intro: [n.body, n.suggestion ? "Suggestion: " + n.suggestion : ""].filter(Boolean).join("\n\n") + "\n\nA suggestion from the records. Check it before acting.",
      submit: "Mark as handled", values: { how: "done" },
      fields: [{ id: "how", l: "Outcome", type: "select", opts: [["done", "Handled"], ["dismissed", "Not needed"]] }],
      onSubmit: async v => { await crMsAct("nudgeResolve", { id: n.id, status: v.how }); ctx.reload(); },
      done: "Marked as handled.",
    }),
  }));
}

/* ── Match queue: the choice of two ────────────────────────────────────── */
function crMsOffer(ctx, w) {
  const recs = w.recommended || [];
  if (recs.length < 2) {
    ctx.toast("Fewer than two cleared mentors with space at " + (w.centre || "this centre") + ". The mentee must be offered two.", null, true);
    return;
  }
  ctx.form({
    title: "Offer two mentors to " + w.fullName,
    intro: "The mentee sees both and picks one (MENTORSHIP.md §1.2). Only cleared, certified mentors with a place at " + w.centre + " are listed, ranked on track, interests, availability and pod size.",
    submit: "Approve match", busyLabel: "Creating the offer…",
    values: { mentors: recs.slice(0, 2).map(r => r.mentorId) },
    fields: [{ id: "mentors", l: "Mentors to offer", type: "multi", req: true,
      opts: recs.map(r => [r.mentorId, r.fullName + " · " + r.fit + "% · " + (r.why || []).join("; ")]),
      check: v => String(v || "").split(",").filter(Boolean).length !== 2 ? "Choose exactly two." : "" }],
    onSubmit: async v => {
      const r = await crMsAct("approve", { memberId: w.memberId, mentorIds: v.mentors });
      ctx.reload();
      ctx.toast("The portal created: " + (r.created || []).join(" · "), async () => {
        try { await crMsAct("undo", { matchId: r.matchId }); ctx.reload(); ctx.toast("Offer withdrawn."); }
        catch (e) { ctx.toast(crErr(e, "Couldn’t undo — the mentee may already have chosen."), null, true); }
      });
      return r;
    },
    done: () => null,
  });
}

/* ── Relationships: one match ──────────────────────────────────────────── */
async function crMsMatchOpen(ctx, matchId) {
  let d;
  try { d = await crMsRead("match", { matchId }); } catch (e) { ctx.toast(crErr(e, "Couldn’t open that match."), null, true); return; }
  const x = d.match || {};
  const rel = (ctx.data && ctx.data.relationships || []).find(r => r.matchId === matchId) || {};
  const byResp = r => (d.checks || []).find(c => c.respondent === r);
  const act = [];
  if (x.status === "offered") act.push({ l: "Record the mentee’s choice", primary: true, run: () => crMsChoose(ctx, x, d.offers || []) });
  if (x.status === "active" || x.status === "paused") {
    act.push({ l: "Open intervention", primary: true, run: () => crMsIntervention(ctx, { matchId }) });
    act.push({ l: "Record a relationship check", run: () => crMsRelcheck(ctx, matchId) });
    act.push({ l: x.status === "paused" ? "Resume" : "Pause", run: async () => {
      try { await crMsAct("status", { matchId, status: x.status === "paused" ? "active" : "paused" }); ctx.closeDrawer(); ctx.reload(); ctx.toast(x.status === "paused" ? "Match resumed." : "Match paused."); }
      catch (e) { ctx.toast(crErr(e, "Couldn’t change it."), null, true); } } });
    act.push({ l: "Start a planned closure", run: () => crMsClose(ctx, matchId, "closing") });
  }
  if (x.status === "closing") act.push({ l: "Finish the closure", primary: true, run: () => crMsClose(ctx, matchId, "closed") });
  ctx.drawer({
    title: rel.menteeName || x.memberId, sub: [rel.mentorName ? "Mentor · " + rel.mentorName : "", x.centre, CR_MS_PHASE[x.phaseNow] || x.phaseNow].filter(Boolean).join(" · "),
    stats: [["Week", crNum(rel.week || 0)], ["Health", rel.health || "—"], ["Last contact", rel.lastContact ? crDate(rel.lastContact) : "None yet"]],
    fields: [["Status", x.status], ["Phase", CR_MS_PHASE[x.phaseNow] || ""], ["Started", x.startedAt ? crDate(x.startedAt) : "Not yet chosen"], ["Chosen by", x.chosenBy || "—"],
      ["Next check-in", rel.nextCheckin ? crDate(rel.nextCheckin) : "—"], ["Closure reason", x.closeReason || ""]],
    sections: [
      { h: "Relationship quality, three perspectives", rows: ["mentor", "mentee", "guardian"].map(r => [r[0].toUpperCase() + r.slice(1), byResp(r) ? byResp(r).avg + " of 5 · " + byResp(r).term : "Not answered this term"]) },
      { h: "Lifecycle", list: (d.history || []).map(h => ({ icon: "link-simple", t: h.matchId === x.matchId ? "This match" : "Earlier match", s: [h.status, h.startedAt && "from " + crDate(h.startedAt), h.closedAt && "to " + crDate(h.closedAt), h.closeReason].filter(Boolean).join(" · ") })),
        empty: "Every match keeps its history, including pauses and closures." },
      { h: "Interventions", list: (d.interventions || []).map(i => ({ icon: "lifebuoy", t: (i.status === "open" ? "Open · " : "Closed · ") + i.reason, s: i.plan + (i.outcome ? " · " + i.outcome : "") })), empty: "None." },
      { h: "Offered mentors", list: (d.offers || []).map(o => ({ icon: "user", t: o.fullName || o.mentorId, s: o.why, m: o.status + " · " + o.fit + "%" })), empty: "—" },
    ],
    actions: act,
  });
}
function crMsChoose(ctx, x, offers) {
  ctx.closeDrawer();
  ctx.form({ title: "Record the mentee’s choice", intro: "Use this when the mentee or their guardian chose in person or by phone.", submit: "Start the match",
    values: { mentorId: (offers[0] || {}).mentorId, by: "mentee" },
    fields: [{ id: "mentorId", l: "They chose", type: "select", req: true, opts: offers.filter(o => o.status === "open").map(o => [o.mentorId, o.fullName || o.mentorId]) },
      { id: "by", l: "Chosen by", type: "select", opts: [["mentee", "The mentee"], ["guardian", "Their guardian"]] }],
    onSubmit: async v => { await crMsAct("choose", { matchId: x.matchId, mentorId: v.mentorId, chosenBy: v.by }); ctx.reload(); },
    done: "Match started. The cadence of check-ins is scheduled." });
}
function crMsClose(ctx, matchId, to) {
  ctx.closeDrawer();
  ctx.form({ title: to === "closing" ? "Start a planned closure" : "Finish the closure",
    intro: to === "closing" ? "Ending well matters. A closure conversation is scheduled; the mentee keeps their whole history and returns to the queue only when it is done. Never a silent stop."
      : "Look back, celebrate, renew or graduate. Say what happened in the closure conversation.",
    submit: to === "closing" ? "Start closure" : "Close the match", values: { reason: "" },
    fields: [{ id: "reason", l: to === "closing" ? "Why it is ending" : "How the closure went", type: "textarea", req: true, max: 500 }],
    onSubmit: async v => { await crMsAct("status", { matchId, status: to, reason: v.reason }); ctx.reload(); },
    done: to === "closing" ? "Planned closure started." : "Match closed." });
}
function crMsRelcheck(ctx, matchId) {
  ctx.closeDrawer();
  ctx.form({ title: "Relationship check", intro: "Four questions, answered separately by the mentor, the mentee and the guardian. Record one person’s answers.",
    submit: "Save", values: { respondent: "guardian", q1: "4", q2: "4", q3: "4", q4: "4" },
    fields: [{ id: "respondent", l: "Whose answers", type: "select", opts: [["guardian", "Guardian"], ["mentee", "Mentee"], ["mentor", "Mentor"]] }]
      .concat(CR_MS_RELQ.map((q, i) => ({ id: "q" + (i + 1), l: q, type: "select", opts: CR_MS_SCORE }))),
    onSubmit: async v => { await crMsAct("relcheck", { matchId, respondent: v.respondent, answers: { q1: +v.q1, q2: +v.q2, q3: +v.q3, q4: +v.q4 } }); ctx.reload(); },
    done: "Relationship check saved." });
}
function crMsIntervention(ctx, iv) {
  ctx.closeDrawer();
  const isNew = !iv.id;
  ctx.form({ title: isNew ? "Open an intervention" : "Intervention", intro: "Every flag becomes a plan with an owner and a review date.",
    submit: isNew ? "Open intervention" : "Save", values: { reason: iv.reason || "", plan: iv.plan || "", reviewOn: iv.reviewOn || "", close: false, outcome: "" },
    fields: [
      { id: "reason", l: "What prompted it", type: "textarea", req: isNew, when: () => isNew },
      { id: "plan", l: "The plan", type: "textarea", req: isNew },
      { id: "reviewOn", l: "Review on", type: "date" },
      { id: "close", l: "Close this intervention", type: "switch", when: () => !isNew },
      { id: "outcome", l: "Outcome", type: "textarea", when: v => !!v.close, req: true },
    ],
    onSubmit: async v => { await crMsAct("intervention", Object.assign({ plan: v.plan, reviewOn: v.reviewOn }, isNew ? { matchId: iv.matchId, reason: v.reason } : { id: iv.id, close: !!v.close, outcome: v.outcome })); ctx.reload(); },
    done: isNew ? "Intervention opened." : "Intervention saved." });
}

/* ── Mentors: pipeline, Academy, the commitment policy ─────────────────── */
function crMsClearLabel(c) {
  if (!c) return ["Unknown", "neutral"];
  if (c.cleared) return ["Cleared", "ok"];
  const words = { screening: "screening", academy: "Academy " + c.modulesDone + "/" + c.modulesRequired, policy: "policy not signed" };
  return ["Needs " + c.missing.map(m => words[m] || m).join(", "), "warn"];
}
function crMsMentorOpen(ctx, m) {
  const mark = (what, on, label) => ({ l: (on ? "Clear: " : "Record: ") + label, run: async () => {
    try { await crMsAct("mentorMark", { mentorId: m.mentorId, what, on: !on }); ctx.closeDrawer(); ctx.reload(); ctx.toast("Saved."); }
    catch (e) { ctx.toast(crErr(e, "Couldn’t save that."), null, true); } } });
  const [cl] = crMsClearLabel(m.clearance);
  ctx.drawer({
    title: m.fullName, sub: [m.centre, m.rank === "lead" ? "Lead mentor" : "Mentor", cl].filter(Boolean).join(" · "),
    stats: [["Pod", m.pod + " of " + m.cap], ["Academy", m.clearance.staff ? "Staff" : m.clearance.academyByHand ? "Recorded" : m.clearance.modulesDone + "/" + m.clearance.modulesRequired], ["Policy", m.clearance.policy ? "Signed" : "Not signed"]],
    fields: [["Screening", m.clearance.staff ? "Staff · not required" : m.clearance.screened ? "Cleared" : "Not yet"],
      ["Academy", m.clearance.staff ? "Staff · not required" : m.clearance.academyByHand ? "Completed in person · recorded " + String(m.clearance.academyClearedAt).slice(0, 10) : (m.clearance.modulesDone + " of " + m.clearance.modulesRequired + " modules online")], ["CIMC training", m.cimc ? "Completed" : "Attends Saturday 7:00am"], ["Anthem and Pledge", m.anthem ? "Known" : "Not yet checked"], ["Leaving", m.leaving ? "Yes — closures planned" : "No"]],
    sections: [{ h: "Commitments this month", rows: (m.commitments || []).map(i => [i.label, i.done + " of " + i.expected + (i.ok ? "" : " · short") + (i.note ? " · " + i.note : "")]) }],
    actions: (m.clearance.staff ? [] : [mark("screened", m.clearance.screened && !m.clearance.staff, "screening cleared"),
      mark("academy", !!m.clearance.academyByHand, "Academy completed in person")]).concat([mark("cimc", m.cimc, "CIMC training completed"), mark("anthem", m.anthem, "knows the Anthem and Pledge")])
      .concat(m.leaving ? [] : [{ l: "Mentor is leaving", run: () => {
        ctx.closeDrawer();
        ctx.form({ title: m.fullName + " is leaving", intro: "Every mentee in their pod moves to a planned closure with a closure conversation. Nobody is re-matched until it has happened (R8).",
          submit: "Start planned closures", values: { note: "" }, fields: [{ id: "note", l: "Note", type: "textarea", max: 500 }],
          onSubmit: async v => { const r = await crMsAct("leaving", { mentorId: m.mentorId, note: v.note }); ctx.reload(); return r; },
          done: (v, r) => crPlural((r && r.closing) || 0, "planned closure") + " started." });
      } }]),
  });
}
function crMsRecordAttendance(ctx, d) {
  const mentors = (d.mentors || []).filter(m => !m.leaving);
  ctx.form({ title: "Record commitment attendance", intro: "From the NGGC Mentorship Commitment & Conduct Policy. Tick who was there; the monthly record is built from this.",
    submit: "Record", values: { kind: "prep", date: new Date().toISOString().slice(0, 10), status: "present", who: [] },
    fields: [{ id: "kind", l: "What", type: "select", opts: CR_MS_OBLIG }, { id: "date", l: "Date", type: "date", req: true },
      { id: "status", l: "Mark them", type: "select", opts: [["present", "Present"], ["excused", "Excused"], ["absent", "Absent"]] },
      { id: "who", l: "Mentors", type: "multi", req: true, opts: mentors.map(m => [m.mentorId, m.fullName + " · " + m.centre]) }],
    onSubmit: async v => { const r = await crMsAct("obligations", { kind: v.kind, date: v.date, status: v.status, mentorIds: v.who }); ctx.reload(); return r; },
    done: (v, r) => { const f = (r.results || []).filter(x => !x.ok).length; return crPlural(r.applied || 0, "mentor") + " recorded" + (f ? " · " + f + " refused" : "") + "."; } });
}

/* ── Safeguarding ──────────────────────────────────────────────────────── */
async function crMsCaseOpen(ctx, caseNo, statuses) {
  let d;
  try { d = await NGGApi.admin.safeguarding.get(caseNo); } catch (e) { ctx.toast(crErr(e, "Couldn’t open that case."), null, true); return; }
  const c = d.case || {};
  ctx.drawer({
    title: "Case " + c.caseNo, sub: [c.category, c.centre, "Reported " + crDate(c.createdAt)].filter(Boolean).join(" · "),
    stats: [["Status", c.status], ["Young person", c.subjectName || "—"], ["Officer", c.officerName || "Unassigned"]],
    fields: [["Reported by", c.reporterName]],
    sections: [{ h: "What was reported", text: c.body }, { h: "Notes", list: (d.notes || []).map(n => ({ icon: "note", t: n.byName + (n.status ? " · moved to " + n.status : ""), s: n.note, m: crDate(n.createdAt) })), empty: "No notes yet." }],
    actions: [{ l: "Add a note", primary: true, run: () => {
      ctx.closeDrawer();
      ctx.form({ title: "Case " + c.caseNo, intro: "The report itself is never edited. Notes and status changes are kept beside it.", submit: "Save", values: { note: "", status: "" },
        fields: [{ id: "note", l: "Note", type: "textarea" }, { id: "status", l: "Move to", type: "select", opts: [["", "Leave as " + c.status]].concat((statuses || []).map(s => [s, s])) }],
        onSubmit: async v => { await NGGApi.admin.safeguarding.note(c.caseNo, v.note, v.status); ctx.reload(); }, done: "Saved." });
    } }],
  });
}

/* ── Projects (Mentorship › Projects; domain/projects.php) ──────────────
   The same projects the mentor portal sets, seen and run from here: every
   project at the centres in the admin's scope, set for any mentors and
   children at a centre, in named groups, with the countdown to the finish.
   The server's save is the portal's own (project_write). */
const CR_PRJ_TONE = { ok: "ok", soon: "warn", due: "warn", over: "bad", done: "ok", neutral: "neutral" };
const CR_PRJ_PART = { assigned: "Not done yet", done: "Done", excused: "Excused" };
function crPrjCount(p) { return (p.people || []).length; }
/** Share people out across groups, mentors first, one at a time, so each group gets a mentor before any gets two. */
function crPrjSplit(people, groups) {
  if (!groups.length) return people.map(x => Object.assign({}, x, { group: x.group || "" }));
  const ms = people.filter(x => x.kind === "mentor"), ks = people.filter(x => x.kind === "member");
  return ms.map((x, i) => Object.assign({}, x, { group: groups[i % groups.length] }))
    .concat(ks.map((x, i) => Object.assign({}, x, { group: groups[i % groups.length] })));
}
async function crPrjForm(ctx, d, p) {
  const editing = !!p;
  let centre = p ? p.centre : (d.centres || []).length === 1 ? d.centres[0] : "";
  if (!centre) {
    const pick = await new Promise(res => ctx.form({ title: "New project", intro: "Projects are set at one centre: its mentors and its children.", submit: "Choose people",
      values: { centre: "" }, fields: [{ id: "centre", l: "Centre", type: "select", req: true, opts: (d.centres || []).map(c => [c, c]) }],
      onSubmit: async v => { res(v.centre); }, done: () => "" }));
    if (!pick) return;
    centre = pick;
  }
  let pool;
  try { pool = await NGGApi.admin.projects.people(centre); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t read who is at " + centre + "."), null, true); return; }
  const on = p ? p.people : [];
  const groupsNow = Array.from(new Set(on.map(x => x.group).filter(Boolean)));
  const kidsOn = on.filter(x => x.kind === "member").map(x => x.id);
  const allKids = (pool.children || []).length > 0 && kidsOn.length === (pool.children || []).length;
  ctx.form({
    title: editing ? "Edit · " + p.title : "New project at " + centre,
    intro: "Everyone on it is told, and sees the same countdown. A part someone already finished stays on the record if you take them off.",
    submit: editing ? "Save the project" : "Set the project",
    values: { title: p ? p.title : "", detail: p ? p.detail || "" : "", startOn: p ? p.startOn : "", dueOn: p ? p.dueOn : "",
      mentors: on.filter(x => x.kind === "mentor").map(x => x.id), allKids, children: kidsOn, groups: groupsNow.join(", "), split: !editing },
    fields: [
      { id: "title", l: "Name", type: "text", req: true, max: 160, ph: "Clean-up day at the market" },
      { id: "detail", l: "What to do", type: "textarea", rows: 4, max: 2000 },
      { id: "startOn", l: "Starts", type: "date", help: "Today if left blank." },
      { id: "dueOn", l: "Finishes", type: "date", req: true, help: "At most " + crNum(((d.max || {}).days) || 366) + " days after it starts.",
        check: (v, all) => all.startOn && v && v < all.startOn ? "Finish on or after the start." : "" },
      { id: "mentors", l: "Mentors", type: "multi", opts: (pool.mentors || []).map(m => [m.id, m.name]), help: (pool.mentors || []).length ? "" : "No active mentors at " + centre + "." },
      { id: "allKids", l: "Every child at " + centre + " (" + crNum((pool.children || []).length) + ")", type: "switch" },
      { id: "children", l: "Children", type: "multi", opts: (pool.children || []).map(k => [k.id, k.name + (k.displayId ? " · " + k.displayId : "")]), when: v => !v.allKids },
      { id: "groups", l: "Groups", type: "text", ph: "Team A, Team B", help: "Names, separated by commas. Leave blank for one group." },
      { id: "split", l: editing ? "Share everyone out across these groups again" : "Share everyone out across these groups", type: "switch",
        help: "Mentors first, one to a group, then the children, in turn. Off keeps each person’s group as it is.", when: v => !!String(v.groups || "").trim() },
    ],
    onSubmit: async v => {
      const kids = v.allKids ? (pool.children || []).map(k => k.id) : (v.children || []);
      let people = (v.mentors || []).map(id => ({ kind: "mentor", id })).concat(kids.map(id => ({ kind: "member", id })));
      if (!people.length) return { fieldErrors: { mentors: "Choose at least one person." } };
      const max = ((d.max || {}).people) || 200;
      if (people.length > max) return { fieldErrors: { children: "At most " + crNum(max) + " people on one project; this is " + crNum(people.length) + "." } };
      const groups = Array.from(new Set(String(v.groups || "").split(",").map(x => x.trim().replace(/\s+/g, " ")).filter(Boolean)));
      const was = Object.fromEntries(on.map(x => [x.kind + ":" + x.id, x.group]));
      people = v.split && groups.length ? crPrjSplit(people, groups)
        : people.map(x => ({ kind: x.kind, id: x.id, group: groups.includes(was[x.kind + ":" + x.id]) ? was[x.kind + ":" + x.id] : (groups.length === 1 ? groups[0] : "") }));
      const r = await NGGApi.admin.projects.save({ projectId: p ? p.projectId : "", title: v.title, detail: v.detail, startOn: v.startOn, dueOn: v.dueOn,
        status: p ? p.status : "open", centre, people });
      ctx.reload();
      return r;
    },
    done: (v, r) => (editing ? "Saved" : "Project set") + (r && r.added ? " · " + crPlural(r.added, "person") + " told" : "") + (r && r.kept ? " · " + crPlural(r.kept, "person") + " who finished kept on the record" : "") + ".",
  });
}
async function crPrjStatus(ctx, p, status) {
  if (status === "cancelled" && !(await ctx.confirm({ title: "Cancel “" + p.title + "”?", body: "It disappears for everyone on it, and from the mentors’ commitments. What people already did stays in the audit log.", cta: "Cancel the project", danger: true, cancel: "Keep it" }))) return;
  try {
    await NGGApi.admin.projects.save({ projectId: p.projectId, title: p.title, detail: p.detail || "", startOn: p.startOn, dueOn: p.dueOn, status, centre: p.centre,
      people: p.people.map(x => ({ kind: x.kind, id: x.id, group: x.group })) });
    ctx.closeDrawer(); ctx.reload();
    ctx.toast(status === "closed" ? "Marked finished." : status === "open" ? "Reopened." : "Cancelled.");
  } catch (e) { ctx.toast(crErr(e, "Couldn’t change the project."), null, true); }
}
function crPrjPart(ctx, p, x) {
  ctx.form({ title: x.name + " · " + p.title, submit: "Save", values: { status: x.status, note: x.note || "" },
    fields: [{ id: "status", l: "Their part", type: "chips", req: true, opts: [["assigned", "Not done yet"], ["done", "Done"], ["excused", "Excused"]], help: "An excused part is not counted." },
             { id: "note", l: "Note", type: "textarea", rows: 3, max: 500 }],
    onSubmit: async v => { await NGGApi.admin.projects.mark({ projectId: p.projectId, kind: x.kind, personId: x.id, status: v.status, note: v.note }); ctx.closeDrawer(); ctx.reload(); },
    done: "Saved." });
}
function crPrjOpen(ctx, p, d) {
  const c = p.countdown || {};
  ctx.drawer({
    title: p.title, sub: p.centre + " · " + c.label,
    stats: [["People", crNum(crPrjCount(p))], ["Done", p.tally.done + " of " + p.tally.of], ["Finishes", crDate(p.dueOn)]],
    fields: [["Set by", p.by || "—"], ["Runs", crDate(p.startOn) + " – " + crDate(p.dueOn)], ["State", p.status === "closed" ? "Finished" : "Open"]],
    sections: [p.detail ? { h: "What to do", text: p.detail } : null].concat((p.groups || []).map(g => ({
      h: (g.name || "Not in a group") + " · " + g.tally.done + " of " + g.tally.of + " done",
      list: g.people.map(x => ({ icon: x.kind === "mentor" ? "chalkboard-teacher" : "user", t: x.name, s: (x.kind === "mentor" ? "Mentor · " : "") + (CR_PRJ_PART[x.status] || x.status) + (x.note ? " · “" + x.note + "”" : ""),
        m: x.doneAt ? crDate(x.doneAt) : "", act: ctx.can("people") ? { l: "Set part", run: () => crPrjPart(ctx, p, x) } : null })),
      empty: "Nobody in this group." }))),
    actions: ctx.can("people") ? [
      { l: "Edit", primary: true, run: () => { ctx.closeDrawer(); crPrjForm(ctx, d, p); } },
      p.status === "open" ? { l: "Mark finished", run: () => crPrjStatus(ctx, p, "closed") } : { l: "Reopen", run: () => crPrjStatus(ctx, p, "open") },
      { l: "Cancel project", run: () => crPrjStatus(ctx, p, "cancelled") },
    ] : [],
  });
}

/* ── The tabs ──────────────────────────────────────────────────────────── */
Object.assign(CR_TAB_DEFS, {
  "ms-overview": {
    skeleton: ["kpis", "cards"],
    load: async () => crMsRead("overview"),
    actions: (d, ctx) => [
      { l: "Open the match queue", icon: "users-three", primary: true, run: () => ctx.go("mentorship", "ms-queue") },
      { l: "Run the rules now", icon: "arrows-clockwise", run: async () => {
        try { const r = await crMsAct("rulesRun", {}); const n = Object.values(r.fired || {}).reduce((a, b) => a + b, 0); ctx.reload(); ctx.toast(n ? crPlural(n, "new nudge") + "." : "Nothing new."); }
        catch (e) { ctx.toast(crErr(e, "The rules didn’t run."), null, true); } } },
    ],
    facts: d => "Mentorship. Waiting " + d.counts.queue + "; relationships not healthy " + d.counts.rel + "; overdue check-ins " + d.counts.chk + "; open interventions " + d.counts.iv
      + ". Health: " + JSON.stringify(d.health) + ". Needs attention: " + (d.needsAttention || []).map(n => n.rule + " " + n.title).join("; "),
    blocks: (d, ctx) => {
      const c = d.counts || {};
      const out = [{ type: "kpis", span: 6, items: [
        { l: "Waiting for a mentor", v: crNum(c.queue) }, { l: "Not healthy", v: crNum(c.rel) },
        { l: "Overdue check-ins", v: crNum(c.chk) }, { l: "Open interventions", v: crNum(c.iv) },
      ].concat(d.canSafeguard ? [{ l: "Safeguarding open", v: crNum(c.safe) }] : []) }];
      out.push({ type: "list", span: 4, title: "Needs attention", sub: "Ordered by urgency. The portal flags; a person decides.", rows: crMsNudgeRows(d.needsAttention, ctx), empty: "Nothing needs a person right now." });
      out.push({ type: "bars", span: 2, title: "Relationship health", rows: ["Healthy", "Watch", "At risk", "Paused", "Closing"].map(h => [h, (d.health || {})[h] || 0]), empty: "No live matches yet." });
      const lc = d.lifecycle || {};
      out.push({ type: "bars", span: 3, title: "Match lifecycle", sub: "Every match keeps its history, including pauses and closures.",
        rows: [["Offered", lc.offered], ["Connect", lc.connect], ["Grow", lc.grow], ["Lead", lc.lead], ["Close", lc.close], ["Closing", lc.closing], ["Closed", lc.closed]].map(([l, v]) => [l, v || 0]) });
      out.push({ type: "list", span: 3, title: "Evidence checks", sub: "Flagged automatically so ratings stay honest. Nothing is changed without the mentor.",
        rows: (d.evidence || []).map(o => ({ icon: "binoculars", t: o.menteeName + " · " + o.indicator, s: "“" + (o.evidence || "") + "” for a rating of " + ["Not seen", "Emerging", "Demonstrated", "Exemplary"][o.level], m: crDate(o.onDate) })),
        empty: "Every recent rating carries its evidence." });
      out.push({ type: "list", span: 6, title: "Waiting for a mentor", action: "Open the queue", onAction: () => ctx.go("mentorship", "ms-queue"),
        rows: (d.waiting || []).map(w => ({ icon: "user", t: w.fullName, s: w.centre, m: w.waitingSince ? "since " + crDate(w.waitingSince) : "" })), empty: "Nobody is waiting." });
      return out;
    },
  },
  "ms-projects": {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.projects.list(),
    actions: (d, ctx) => [{ l: "New project", icon: "flag", primary: true, disabled: !ctx.can("people") || !(d.centres || []).length,
      why: !(d.centres || []).length ? "No centre in your scope." : "Setting a project needs the People permission.", run: () => crPrjForm(ctx, d, null) }],
    facts: d => "Projects: " + d.stats.open + " open, " + d.stats.soon + " finishing within a week, " + d.stats.over + " past the finish date; parts done " + d.stats.done + " of " + d.stats.of + ".",
    blocks: (d, ctx) => {
      const st = d.stats || {};
      return [
        { type: "kpis", span: 6, items: [
          { l: "Open", v: crNum(st.open) }, { l: "Finishing this week", v: crNum(st.soon) },
          { l: "Past the finish date", v: crNum(st.over) }, { l: "Parts done", v: st.of ? Math.round(st.done / st.of * 100) + "%" : "—", dn: crNum(st.done) + " of " + crNum(st.of) },
        ] },
        d.capped ? { type: "note", span: 6, icon: "info", tone: "warn", text: "Showing the first " + crNum((d.projects || []).length) + " of " + crNum(d.total) + " projects, open first and soonest to finish." } : null,
        { type: "table", span: 6, title: "Projects", sub: "Set here or by leads and mentors in the mentor portal. Open one to see its groups and set anyone’s part.", nosel: true, filters: ["Centre", "Finish"],
          cols: [{ l: "Project", wrap: true }, "Centre", "Set by", { l: "People", num: true }, { l: "Groups", wrap: true }, "Progress", "Finish"],
          rows: (d.projects || []).map(p => ({ key: p.projectId, open: () => crPrjOpen(ctx, p, d), cells: [
            { k: "strong", t: p.title, s: p.status === "closed" ? "Finished" : crDate(p.startOn) + " – " + crDate(p.dueOn) }, { k: "text", t: p.centre || "—" }, { k: "text", t: p.by || "—" },
            { k: "num", t: crNum(crPrjCount(p)), v: crPrjCount(p) },
            { k: "text", t: (p.groups || []).filter(g => g.name).map(g => g.name + " " + g.tally.done + "/" + g.tally.of).join(" · ") || "One group" },
            { k: "progress", pct: p.tally.of ? Math.round(p.tally.done / p.tally.of * 100) : 0, t: p.tally.done + " of " + p.tally.of },
            { k: "status", t: (p.countdown || {}).label, tone: CR_PRJ_TONE[(p.countdown || {}).tone] || "neutral" },
          ] })),
          emptyText: "No projects yet. Set one with New project, or a lead sets one in the mentor portal." },
      ].filter(Boolean);
    },
  },
  "ms-queue": {
    skeleton: ["table"],
    load: async () => crMsRead("queue"),
    actions: (d, ctx) => [{ l: "Find more mentors", icon: "user-plus", primary: true, run: () => ctx.go("mentorship", "ms-mentors") }],
    facts: d => "Waiting: " + (d.waiting || []).map(w => w.fullName + " (" + w.centre + ", " + (w.recommended || []).length + " recommended)").join("; "),
    blocks: (d, ctx) => [{
      type: "table", span: 6, title: "Waiting for a mentor", sub: "Longest wait first. Recommended mentors are ranked on interests, goals, availability and style; only cleared, certified mentors with capacity appear.", nosel: true,
      cols: ["Mentee", "Centre", "Waiting since", { l: "Interests · wants to", wrap: true }, "Recommended"],
      rows: (d.waiting || []).map(w => ({ key: w.memberId, open: () => crMsOffer(ctx, w), cells: [
        { k: "person", t: w.fullName, s: w.track || "" }, { k: "text", t: w.centre },
        { k: "text", t: w.waitingSince ? crDate(w.waitingSince) : "—" },
        { k: "text", t: [w.interests, w.wantsTo, w.supportArea].filter(Boolean).join(" · ") || "No profile yet" },
        w.canOffer ? { k: "status", t: w.recommended.slice(0, 2).map(r => r.fullName.split(" ")[0] + " " + r.fit + "%").join(" · "), tone: "ok" }
          : { k: "status", t: (w.recommended || []).length ? "Only one mentor available" : "No mentor available", tone: "warn" },
      ] })),
      emptyText: "Nobody is waiting for a mentor.",
    }],
  },
  "ms-rel": {
    skeleton: ["table"],
    load: async () => crMsRead("relationships"),
    facts: d => (d.relationships || []).map(r => r.menteeName + " with " + r.mentorName + ": " + r.health + ", " + r.phase + ", last contact " + (r.lastContact || "none")).join("; "),
    blocks: (d, ctx) => [{
      type: "table", span: 6, title: "Relationships", nosel: true, filters: ["Stage", "Health"],
      cols: ["Mentee · mentor", "Stage", "Health", "Last contact", "Next check-in"],
      rows: (d.relationships || []).map(r => ({ key: r.matchId, open: () => crMsMatchOpen(ctx, r.matchId), cells: [
        { k: "person", t: r.menteeName, s: r.mentorName }, { k: "text", t: (CR_MS_PHASE[r.phase] || r.phase) + " · week " + r.week },
        { k: "status", t: r.health, tone: CR_MS_HEALTH_TONE[r.health] || "neutral" },
        { k: "text", t: r.lastContact ? crDate(r.lastContact) : "None yet" }, { k: "text", t: r.nextCheckin ? crDate(r.nextCheckin) : "—" },
      ] })),
      emptyText: "No relationships yet. Approve a match from the queue.",
    }],
  },
  "ms-checkins": {
    skeleton: ["table"],
    load: async () => crMsRead("checkins"),
    blocks: (d, ctx) => [{
      type: "table", span: 6, title: "Automatic cadence", sub: "Created when a match is approved. Frequent early contact, then monthly, with every contact logged.", nosel: true, filters: ["What", "Who"],
      cols: ["Due", "What", "Who", "Mentee · mentor"],
      rows: (d.tasks || []).map(t => ({ key: "t" + t.id, open: () => ctx.form({
        title: (CR_MS_TASK[t.kind] || t.kind) + " · " + (t.menteeName || ""), submit: "Save", values: { status: "done", note: t.note || "" },
        fields: [{ id: "status", l: "Mark as", type: "select", opts: [["done", "Done"], ["skipped", "Skipped"]] }, { id: "note", l: "Note", type: "textarea" }],
        onSubmit: async v => { await crMsAct("taskDone", { id: t.id, status: v.status, note: v.note }); ctx.reload(); }, done: "Saved." }),
        cells: [{ k: "status", t: crDate(t.dueOn), tone: t.overdue ? "bad" : "neutral" }, { k: "text", t: CR_MS_TASK[t.kind] || t.kind },
          { k: "text", t: t.owner === "lead" ? "Lead" : "Mentor" }, { k: "person", t: t.menteeName || "—", s: t.mentorName || "" }] })),
      emptyText: "Nothing due in the next two weeks.",
    }],
  },
  "ms-interventions": {
    skeleton: ["table", "table"],
    load: async () => crMsRead("interventions"),
    blocks: (d, ctx) => [{
      type: "table", span: 6, title: "Interventions", sub: "Every flag becomes a plan with an owner and a review date.", nosel: true,
      cols: ["Mentee · mentor", "Why", "Plan", "Owner", "Review", "Status"],
      rows: (d.interventions || []).map(i => ({ key: "i" + i.id, open: () => crMsIntervention(ctx, i), cells: [
        { k: "person", t: i.menteeName || "—", s: i.mentorName || "" }, { k: "text", t: (i.rule ? i.rule + " · " : "") + i.reason }, { k: "text", t: i.plan },
        { k: "text", t: i.ownerName || "Unassigned" }, { k: "text", t: i.reviewOn ? crDate(i.reviewOn) : "—" },
        { k: "status", t: i.status === "open" ? "Open" : "Closed", tone: i.status === "open" ? "warn" : "neutral" }] })),
      emptyText: "No interventions.",
    }, {
      type: "table", span: 6, title: "Closures and rematches", sub: "Ending well matters. The young person keeps their whole history.", nosel: true,
      cols: ["Mentee · mentor", "Status", "Why", "Since"],
      rows: (d.closures || []).map(c => ({ key: c.matchId, open: () => crMsMatchOpen(ctx, c.matchId), cells: [
        { k: "person", t: c.menteeName || "—", s: c.mentorName || "" }, { k: "status", t: c.status === "closing" ? "Closing" : "Closed", tone: c.status === "closing" ? "warn" : "neutral" },
        { k: "text", t: c.closeReason || "" }, { k: "text", t: crDate(c.closedAt || c.closingAt) }] })),
      emptyText: "No closures.",
    }],
  },
  "ms-safeguarding": {
    skeleton: ["table"],
    load: async () => NGGApi.admin.safeguarding.list(),
    blocks: (d, ctx) => [{
      type: "note", span: 6, icon: "shield-check", tone: "warn",
      text: "Cases are visible only to people holding the safeguarding capability, within their centres. Every time a case is opened it is recorded.",
    }, {
      type: "table", span: 6, title: "Cases", nosel: true, filters: ["Status"],
      cols: ["Case", "About", "Category", "Centre", "Reported", "Status"],
      rows: (d.cases || []).map(c => ({ key: c.caseNo, open: () => crMsCaseOpen(ctx, c.caseNo, d.statuses), cells: [
        { k: "mono", t: c.caseNo }, { k: "text", t: c.subjectName || "—" }, { k: "text", t: c.category }, { k: "text", t: c.centre },
        { k: "text", t: crDate(c.createdAt) }, { k: "status", t: c.status, tone: c.status === "resolved" ? "neutral" : c.status === "escalated" ? "bad" : "warn" }] })),
      emptyText: "No cases.",
    }],
  },
  "ms-mentors": {
    skeleton: ["kpis", "table"],
    load: async () => crMsRead("pipeline"),
    actions: (d, ctx) => [
      { l: "Record commitment attendance", icon: "check-square", primary: true, run: () => crMsRecordAttendance(ctx, d) },
      { l: "Add a mentor", icon: "user-plus", run: () => ctx.go("mentors", "mentors") },
    ],
    blocks: (d, ctx) => {
      const ms = d.mentors || [];
      const under = ms.filter(m => m.pod > 0 && m.pod < 5).length;
      return [
        { type: "kpis", span: 6, items: [
          { l: "NGG mentors", v: crNum(ms.length) }, { l: "Cleared", v: crNum((d.academy || {}).cleared) },
          { l: "Places free", v: crNum(ms.filter(m => m.clearance.cleared && !m.leaving).reduce((a, m) => a + Math.max(0, m.cap - m.pod), 0)) },
          { l: "Pods under five", v: crNum(under) },
        ] },
        { type: "note", span: 6, icon: "graduation-cap", text: "From application to first match. No one reaches a young person before screening, the Mentor Academy (all " + ((d.academy || {}).required || 13) + " modules) and the signed Commitment Policy are complete." },
        { type: "table", span: 6, title: "Mentors", nosel: true, filters: ["Clearance"],
          cols: ["Mentor", "Centre", "Clearance", { l: "Academy", num: true }, "Pod", "Commitments this month"],
          rows: ms.map(m => { const [cl, tone] = crMsClearLabel(m.clearance); const short = (m.commitments || []).filter(i => !i.ok);
            return { key: m.mentorId, open: () => crMsMentorOpen(ctx, m), cells: [
              { k: "person", t: m.fullName, s: m.leaving ? "Leaving" : (m.rank === "lead" ? "Lead mentor" : "") }, { k: "text", t: m.centre },
              { k: "status", t: cl, tone }, { k: "num", t: m.clearance.modulesDone + "/" + m.clearance.modulesRequired, v: m.clearance.modulesDone },
              { k: "text", t: m.pod + " of " + m.cap + (m.pod > 0 && m.pod < 5 ? " · under five" : "") },
              short.length ? { k: "status", t: short.length + " short", tone: "warn" } : { k: "status", t: "On track", tone: "ok" }] }; }),
          emptyText: "No NGG mentors yet. Add one from Mentors & volunteers." },
        { type: "list", span: 6, title: (d.policy || {}).title || "Commitment policy", sub: (d.policy || {}).standard || "",
          rows: ((d.policy || {}).items || []).map(i => ({ icon: i.track === "conduct" ? "hand-heart" : "chart-bar", t: i.n + ". " + i.text, s: i.track === "conduct" ? "Reviewed by the lead" : "Measured on the platform" })) },
      ];
    },
  },
  "ms-impact": {
    skeleton: ["kpis", "cards"],
    load: async () => crMsRead("impact"),
    facts: d => (d.measures || []).map(m => m.label + " " + (m.value === null ? "no data" : m.value + (m.unit === "%" ? "%" : " " + m.unit)) + " (target " + m.target + ")").join("; "),
    blocks: d => [{
      type: "cards", span: 6, title: "Impact", sub: "Six measures against fixed targets. Each says what it was counted from.",
      cards: (d.measures || []).map(m => ({ icon: m.met ? "check-circle" : "target", title: m.label,
        sub: m.value === null ? "Not enough data yet" : (m.unit === "%" ? m.value + "%" : m.value + " " + m.unit),
        tag: "Target " + (m.unit === "%" ? "≥ " + m.target + "%" : "≥ " + m.target + " " + m.unit), tone: m.value === null ? "neutral" : m.met ? "ok" : "warn",
        meta: [["Counted", m.unit === "%" ? crNum(m.n) + " of " + crNum(m.d) : crPlural(m.n, "answer")]] })),
    }],
  },
});
