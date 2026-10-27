/* ============================================================================
   Control Room — Mentorship › Projects (domain/projects.php; capability
   `people`, centre-scoped on the server).

   Every project in scope with its countdown and progress; open one for its
   groups and each person's part. Staff set a project at a centre, edit it,
   mark it finished or cancel it, and set anyone's part (done, not done yet,
   excused). Who may be put on one is the centre's active mentors and
   children; the server refuses an unscreened mentor on a project with
   children, and names who. Groups are set in the mentor portal and kept as
   they are when a project is edited here.
   ========================================================================== */

const CR_PJ_TONE = { over: "bad", due: "warn", soon: "warn", ok: "ok", done: "neutral", neutral: "neutral" };
const CR_PJ_PART = { assigned: ["Not done yet", "neutral"], done: ["Done", "ok"], excused: ["Excused", "neutral"] };

/* The form for a new or edited project. `people` is who may be put on it at
   the project's centre; anyone already on it stays listed even if they have
   since left that list, so they can be kept or taken off. */
function crPjForm(ctx, pr, centre, people) {
  const on = (pr ? pr.people : []);
  const keep = k => on.find(x => x.kind + ":" + x.id === k);
  const opts = (kind, list) => {
    const have = new Set(list.map(x => x.id));
    return list.map(x => [x.id, x.name]).concat(on.filter(x => x.kind === kind && !have.has(x.id)).map(x => [x.id, x.name + " (no longer active here)"]));
  };
  ctx.form({
    title: pr ? "Edit “" + pr.title + "”" : "New project at " + centre,
    intro: pr ? "People already on it keep their group. New people are told it has been set." : "Everyone you put on it is told, and sees the same countdown to the finish date.",
    submit: pr ? "Save" : "Set the project", busyLabel: "Saving…",
    values: pr ? { title: pr.title, detail: pr.detail, startOn: pr.startOn, dueOn: pr.dueOn,
      mentors: on.filter(x => x.kind === "mentor").map(x => x.id), children: on.filter(x => x.kind === "member").map(x => x.id) }
      : { startOn: new Date().toISOString().slice(0, 10), mentors: [], children: [] },
    fields: [
      { id: "title", l: "What it is", type: "text", req: true, max: 160, ph: "e.g. Clean-up day at the centre" },
      { id: "detail", l: "What to do", type: "textarea", rows: 3, max: 2000, ph: "What each person does, and what done looks like" },
      { id: "startOn", l: "Starts", type: "date" },
      { id: "dueOn", l: "Finishes", type: "date", req: true, check: (v, all) => !all.startOn || v >= all.startOn ? "" : "It finishes before it starts." },
      { id: "mentors", l: "Mentors", type: "multi", opts: opts("mentor", people.mentors || []) },
      { id: "children", l: "Children", type: "multi", opts: opts("member", people.children || []) },
    ],
    onSubmit: async v => {
      const list = (v.mentors || []).map(id => ({ kind: "mentor", id })).concat((v.children || []).map(id => ({ kind: "member", id })));
      if (!list.length) return { fieldErrors: { children: "Put at least one person on it." } };
      const withGroup = list.map(x => { const k = keep(x.kind + ":" + x.id); return Object.assign(x, { group: k ? k.group : "" }); });
      return NGGApi.admin.projects.save({ projectId: pr ? pr.projectId : undefined, centre: pr ? undefined : centre, title: v.title, detail: v.detail || "",
        startOn: v.startOn || "", dueOn: v.dueOn, people: withGroup });
    },
    done: (v, r) => { setTimeout(() => ctx.reload(), 0); return pr ? "Project saved" + (r && r.added ? " · " + crPlural(r.added, "person", "people") + " added and told" : "") + "." : "Project set · " + crPlural((r && r.added) || 0, "person", "people") + " told."; },
  });
}

async function crPjNew(ctx, d) {
  const go = async centre => {
    let people;
    try { people = await NGGApi.admin.projects.people(centre); } catch (e) { ctx.toast(crErr(e, "Couldn’t read who is at " + centre + "."), null, true); return; }
    crPjForm(ctx, null, centre, people);
  };
  if ((d.centres || []).length === 1) return go(d.centres[0]);
  ctx.form({ title: "New project", intro: "A project belongs to one centre. Its mentors and children are who you can put on it.", submit: "Next",
    values: { centre: (d.centres || [])[0] || "" }, fields: [{ id: "centre", l: "Centre", type: "select", req: true, opts: d.centres || [] }],
    onSubmit: async v => { setTimeout(() => go(v.centre), 0); }, done: () => "" });
}

function crPjOpen(ctx, pr) {
  const st = (status, l) => async () => {
    try {
      await NGGApi.admin.projects.save({ projectId: pr.projectId, title: pr.title, detail: pr.detail, startOn: pr.startOn, dueOn: pr.dueOn, status,
        people: pr.people.map(x => ({ kind: x.kind, id: x.id, group: x.group })) });
      ctx.toast(l); ctx.reload(); ctx.drawer(null);
    } catch (e) { ctx.toast(crErr(e, "Couldn’t update the project."), null, true); }
  };
  const mark = (x, status) => async () => {
    try { await NGGApi.admin.projects.mark(pr.projectId, x.kind, x.id, status); ctx.toast(x.name + ": " + CR_PJ_PART[status][0].toLowerCase() + "."); ctx.reload(); }
    catch (e) { ctx.toast(crErr(e, "Couldn’t mark that part."), null, true); }
  };
  const open = pr.status === "open";
  ctx.drawer({
    title: pr.title, name: pr.title, sub: pr.centre + " · set by " + (pr.by || "staff"),
    stats: [["Finish", pr.countdown.label], ["Done", pr.tally.done + " of " + pr.tally.of], ["Status", pr.status === "open" ? "Open" : "Finished"]],
    fields: [["Starts", crDate(pr.startOn)], ["Finishes", crDate(pr.dueOn)], ["What to do", pr.detail || "—"]],
    sections: pr.groups.map(g => ({ h: (g.name || "Not in a group") + " · " + g.tally.done + " of " + g.tally.of + " done",
      list: g.people.map(x => ({ icon: x.kind === "mentor" ? "handshake" : "user", t: x.name + " · " + (x.kind === "mentor" ? "mentor" : "child"),
        s: CR_PJ_PART[x.status][0] + (x.note ? " · “" + x.note + "”" : "") + (x.doneAt ? " · " + crDate(x.doneAt) : ""),
        act: !open ? null : x.status === "done" ? { l: "Not done yet", run: mark(x, "assigned") } : { l: "Mark done", run: mark(x, "done") } })),
      empty: "Nobody." })),
    actions: [
      open ? { l: "Edit", primary: true, run: async () => {
        let people = { mentors: [], children: [] };
        try { people = await NGGApi.admin.projects.people(pr.centre); } catch (e) { /* the form still lists who is on it */ }
        crPjForm(ctx, pr, pr.centre, people);
      } } : null,
      open ? { l: "Mark finished", run: st("closed", "Project marked finished.") } : { l: "Reopen", run: st("open", "Project reopened.") },
      open ? { l: "Cancel project", run: async () => { if (await ctx.confirm({ title: "Cancel “" + pr.title + "”?", body: "It disappears for everyone on it. Parts already done stay on their records.", cta: "Cancel project", danger: true })) st("cancelled", "Project cancelled.")(); } } : null,
    ].filter(Boolean),
  });
}

Object.assign(CR_TAB_DEFS, {
  "ms-projects": {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.projects.list(""),
    actions: (d, ctx) => (d.centres || []).length ? [{ l: "New project", icon: "plus", primary: true, run: () => crPjNew(ctx, d) }] : [],
    blocks: (d, ctx) => {
      const s = d.stats || {};
      const out = [{ type: "kpis", span: 6, items: [
        { l: "Open", v: crNum(s.open || 0), tone: "flat" },
        { l: "Finishing within a week", v: crNum(s.soon || 0), tone: "flat" },
        { l: "Past the finish date", v: crNum(s.over || 0), tone: s.over ? "down" : "flat" },
        { l: "Parts done", v: crNum(s.done || 0) + " of " + crNum(s.of || 0), tone: "flat" },
      ] }];
      if (d.capped) out.push({ type: "note", span: 6, icon: "info", text: "Showing the first " + crNum((d.projects || []).length) + " of " + crNum(d.total) + " projects.", sub: "Open ones first, soonest finish first." });
      out.push({ type: "table", span: 6, title: "Projects", sub: "Set here or by leads in the mentor portal. Open one for its groups and each person’s part.", nosel: true,
        cols: [{ l: "Project", wrap: true }, "Centre", "Finish", "Done", "Status"],
        rows: (d.projects || []).map(pr => ({ key: pr.projectId, open: () => crPjOpen(ctx, pr), cells: [
          { k: "strong", t: pr.title, s: "Set by " + (pr.by || "staff") + (pr.groups.length > 1 ? " · " + crPlural(pr.groups.filter(g => g.name).length, "group") : "") },
          { k: "text", t: pr.centre || "—" },
          { k: "status", t: pr.countdown.label, tone: CR_PJ_TONE[pr.countdown.tone] || "neutral" },
          { k: "text", t: pr.tally.done + " of " + pr.tally.of },
          { k: "status", t: pr.status === "open" ? "Open" : "Finished", tone: pr.status === "open" ? "info" : "neutral" },
        ] })),
        emptyText: "No projects yet. Set one with New project, or a lead can set one in the mentor portal." });
      return out;
    },
    facts: d => "Projects: " + ((d.stats || {}).open || 0) + " open, " + ((d.stats || {}).over || 0) + " past the finish date.",
  },
});
