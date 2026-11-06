/* The assignments desk — one screen for the Control Room (Learning → Assignments)
 * and the instructor portal (Progress → Assignments). `api` is either door's
 * client (NGGApi.admin.assignments.desk() / NGGApi.member.assignDesk()); the
 * server decides what each person may see and change (domain/assignments.php).
 *
 *   list   — every assignment in reach, filtered by status, with bulk actions
 *   edit   — the editor, with a live audience count and a draft from a lesson
 *   marks  — what came in, who has not handed anything in, marking and return
 */
const ASD_STATUS = { published: "Open", draft: "Draft", closed: "Closed" };
/* How work is handed in — the server's list (staff list `proofs`) wins; this is the fallback. */
const ASD_PROOF = [["any", "Anything that shows it"], ["text", "Writing"], ["file", "A document or file"], ["photo", "A photo"], ["recording", "A recording"], ["link", "A link"], ["checklist", "A checklist"]];
const ASD_ERR = {
  has_submissions: "work has been handed in — close it instead",
  no_instructions: "it has no instructions yet",
  out_of_scope: "outside your courses or centre",
  quiet_period: "they were reminded in the last 24 hours",
  not_open: "it is not open",
  grade_out_of_range: "the mark is outside the points",
  feedback_required: "say what to change",
  ai_unavailable: "no AI model is set up for marking",
  nothing_to_read: "this one is a file — open it and mark it yourself",
};
function asdErr(e) { const c = (e && (e.code || e.error || e.message)) || "error"; return (e && e.detail) || ASD_ERR[c] || (typeof humanizeError === "function" ? humanizeError(c, c) : c); }
function asdDate(s) { if (!s) return "No due date"; const d = new Date(String(s).length <= 10 ? s + "T23:59:00" : s); return isNaN(d) ? s : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function asdWhen(s) { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

function AssignmentDesk({ api, title }) {
  // The door is fixed for the life of the screen; a caller passing a fresh client each render must not reload it.
  const desk = React.useRef(api).current;
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [tab, setTab] = React.useState("");
  const [view, setView] = React.useState({ kind: "list" });
  const load = React.useCallback(() => {
    setErr(null);
    return desk.list().then(r => setData(r)).catch(e => setErr(e));
  }, [desk]);
  React.useEffect(() => { load(); }, [load]);
  const rows = ((data && data.assignments) || []).filter(a => !tab || a.status === tab);
  const sel = useAdminSelection(rows, r => r.assignmentId);
  const counts = ((data && data.assignments) || []).reduce((m, a) => { m[a.status] = (m[a.status] || 0) + 1; return m; }, {});

  if (view.kind === "edit") return <div className="asd"><AsdEditor desk={desk} meta={data || {}} start={view.row} onDone={(saved) => { setView(saved && saved.open ? { kind: "marks", id: saved.assignmentId } : { kind: "list" }); load(); }}/></div>;
  if (view.kind === "marks") return <div className="asd"><AsdMarks desk={desk} id={view.id} onBack={() => { setView({ kind: "list" }); load(); }} onEdit={(row) => setView({ kind: "edit", row })}/></div>;

  const statusAct = (to, label, past, extra) => Object.assign({ id: to, label, pastTense: past, reload: load,
    run: (ids) => desk.status(to, ids), confirm: { title: label + " · {n}", body: "" } }, extra || {});
  const actions = [
    { id: "marks", label: "Open hand-ins", bulkHidden: true, open: (ids) => setView({ kind: "marks", id: ids[0] }) },
    { id: "edit", label: "Edit", bulkHidden: true, open: (ids) => setView({ kind: "edit", row: rows.find(r => r.assignmentId === ids[0]) }) },
    statusAct("publish", "Publish", "published", { confirm: ({ count }) => ({ title: "Publish " + count + " assignment" + (count === 1 ? "" : "s") + "?", body: "Each one is sent to the members it is for, and opens for hand-in.", cta: "Publish" }) }),
    statusAct("draft", "Move to draft", "moved to draft", { confirm: ({ count }) => ({ title: "Move " + count + " to draft?", body: "Members stop seeing them until they are published again.", cta: "Move to draft" }) }),
    statusAct("close", "Close", "closed", { confirm: ({ count }) => ({ title: "Close " + count + "?", body: "No more hand-ins. What was handed in stays, and can still be marked.", cta: "Close" }) }),
    { id: "remind", label: "Remind who hasn't handed in", bulkHidden: true, pastTense: "reminded", run: async (ids) => { const r = await desk.remind(ids[0]); toast.success((r.reminded || 0) + " reminded.", "Assignments"); return { results: [{ id: ids[0], ok: true }] }; }, confirm: { title: "Send a reminder?", body: "Everyone it is for who has not handed anything in gets a notification. Once a day at most.", cta: "Remind" } },
    statusAct("delete", "Delete", "deleted", { danger: true, confirm: ({ count }) => ({ title: "Delete " + count + "?", body: "Only an assignment nobody has handed in can be deleted. Close the others instead.", cta: "Delete", danger: true }) }),
  ];
  const editable = (id) => { const r = rows.find(x => x.assignmentId === id); return r && r.canEdit; };
  return (
    <div className="asd">
      <div className="asd-head">
        {/* A host with its own page title (the instructor portal) passes title={false}. */}
        {title === false ? <span/> : <div className="asd-title"><h2>{title || "Assignments"}</h2>
          <p>Set work for a course, link it to a lesson, see who handed in and who hasn't, and mark it.</p></div>}
        <button type="button" className="asd-btn is-primary" onClick={() => setView({ kind: "edit", row: null })}><i className="ph ph-plus" aria-hidden="true"/> New assignment</button>
      </div>
      {data && data.auto ? <AsdAutoBar desk={desk} auto={data.auto} onChanged={load}/> : null}
      <div className="asd-tabs" role="tablist" aria-label="Show">
        {[["", "All"], ["published", "Open"], ["draft", "Drafts"], ["closed", "Closed"]].map(([k, l]) => (
          <button key={k || "all"} type="button" role="tab" aria-selected={tab === k} className={"asd-tab" + (tab === k ? " is-on" : "")} onClick={() => setTab(k)}>
            {l}{data ? <span className="asd-n">{k ? counts[k] || 0 : (data.assignments || []).length}</span> : null}
          </button>))}
      </div>
      {err ? <div className="asd-state is-err" role="alert"><b>Assignments couldn't load.</b><span>{asdErr(err)}</span><button type="button" className="asd-btn" onClick={load}>Try again</button></div>
       : !data ? <div className="asd-state" role="status" aria-live="polite"><span className="asd-spin" aria-hidden="true"/>Loading assignments…</div>
       : !rows.length ? <div className="asd-state"><b>{tab ? "Nothing " + (ASD_STATUS[tab] || "").toLowerCase() + " here." : "No assignments yet."}</b><span>Start one from a lesson — the desk drafts it from the lesson's own weekly assignment.</span><button type="button" className="asd-btn is-primary" onClick={() => setView({ kind: "edit", row: null })}>New assignment</button></div>
       : <>
          <AdminBulkBar selection={sel} actions={actions.filter(a => !a.bulkHidden)} noun="assignment"/>
          <div className="asd-list" role="table" aria-label="Assignments">
            <div className="asd-row is-head" role="row">
              <span role="columnheader"><AdminSelectAll selection={sel} label="Select all"/></span>
              <span role="columnheader">Assignment</span><span role="columnheader">Due</span><span role="columnheader">Handed in</span><span role="columnheader"><span className="asd-sr">Actions</span></span>
            </div>
            {rows.map(a => (
              <div key={a.assignmentId} className="asd-row" role="row">
                <span role="cell">{a.canEdit ? <AdminRowCheck selection={sel} id={a.assignmentId} label={"Select " + a.title}/> : null}</span>
                <span role="cell" className="asd-main">
                  <button type="button" className="asd-link" onClick={() => setView({ kind: "marks", id: a.assignmentId })}>{a.title}</button>
                  <span className="asd-meta">
                    <span className={"asd-chip is-" + a.status}>{ASD_STATUS[a.status] || a.status}</span>
                    {a.fromLesson ? <span className="asd-chip is-lesson" title="Set by the lesson itself when its week began">Set by the lesson</span> : null}
                    {a.track || "Whole Club"}{a.centre ? " · " + a.centre : ""}{a.proofLabel ? " · " + a.proofLabel : ""}{a.fromLesson ? "" : a.unitId ? " · from a lesson" : ""}{a.canEdit ? "" : " · read-only"}
                  </span>
                </span>
                <span role="cell" className={a.overdue && a.status === "published" ? "asd-due is-late" : "asd-due"}>{asdDate(a.dueAt)}</span>
                <span role="cell" className="asd-counts">{a.submissionCount} in{a.toMark ? <b> · {a.toMark} to mark</b> : null}</span>
                <span role="cell">{a.canEdit ? <AdminRowActions id={a.assignmentId} actions={actions} noun="assignment" reload={load}/> : <button type="button" className="asd-btn is-sm" onClick={() => setView({ kind: "marks", id: a.assignmentId })}>Open</button>}</span>
              </div>))}
          </div>
        </>}
    </div>
  );
}

/* "Lessons set their own homework": what it does, the week of the term it is on,
   and — for an admin in the Control Room — the switch. */
function AsdAutoBar({ desk, auto, onChanged }) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const flip = async () => {
    setBusy(true); setNote("");
    try {
      const r = await desk.auto(!auto.on);
      setNote(r.on ? (r.issued ? r.issued + " assignment" + (r.issued === 1 ? "" : "s") + " set from this week’s lessons." : r.skipped === "no_term" ? "On. Set the term’s start date in Curriculum so lessons know their week." : "On. Nothing new to set this week.") : "Off. Lessons no longer set homework by themselves.");
      onChanged && onChanged();
    } catch (e) { setNote(asdErr(e)); }
    setBusy(false);
  };
  return (
    <div className={"asd-auto" + (auto.on ? " is-on" : "")}>
      <i className={"ph " + (auto.on ? "ph-magic-wand" : "ph-pause-circle")} aria-hidden="true"/>
      <div className="asd-auto-t">
        <b>{auto.on ? "Lessons set their own homework" : "Lessons do not set homework by themselves"}</b>
        <span>{auto.on ? "When a lesson’s week begins, its “This week’s assignment” goes to that course and year, due when the lesson is due." + (auto.week ? " This is week " + auto.week + " of the term." : " The term has no start date yet.")
          : "Homework reaches members only when it is set here."}</span>
        {note ? <span className="asd-auto-note" role="status">{note}</span> : null}
      </div>
      {auto.canSet ? <button type="button" className="asd-btn is-sm" role="switch" aria-checked={auto.on ? "true" : "false"} disabled={busy} aria-busy={busy ? "true" : undefined} onClick={flip}>{busy ? "Saving…" : auto.on ? "Turn off" : "Turn on"}</button> : null}
    </div>
  );
}

function AsdEditor({ desk, meta, start, onDone }) {
  const s0 = start || {};
  const [f, setF] = React.useState({ assignmentId: s0.assignmentId || "", title: s0.title || "", instructions: s0.instructions || "", track: s0.track || ((meta.courses || []).length === 1 ? meta.courses[0] : ""),
    centre: s0.centre || "", unitId: s0.unitId || "", dueAt: (s0.dueAt || "").slice(0, 10), points: s0.points != null ? s0.points : 10, proof: s0.proof || "any", attachmentUrl: s0.attachmentUrl || "", week: s0.week || 0, status: s0.status || "draft",
    steps: (s0.steps || []).join("\n") });
  const proofs = (meta.proofs || []).length ? meta.proofs.map(p => [p.id, p.label, p.hint]) : ASD_PROOF;
  const proofHint = (proofs.find(p => p[0] === f.proof) || [])[2] || "";
  const [errs, setErrs] = React.useState({});
  const [busy, setBusy] = React.useState("");
  const [aud, setAud] = React.useState(null);
  const [notify, setNotify] = React.useState(false);
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const courses = meta.courses || [];
  const units = (meta.units || []).filter(u => !f.track || String(u.course).toLowerCase() === String(f.track).toLowerCase());
  React.useEffect(() => {
    let live = true; setAud(null);
    const t = setTimeout(() => desk.audience({ track: f.track, centre: f.centre }).then(r => live && setAud(r)).catch(e => live && setAud({ error: asdErr(e) })), 350);
    return () => { live = false; clearTimeout(t); };
  }, [f.track, f.centre]);
  const draft = async (ai) => {
    if (!f.unitId) { setErrs({ unitId: "Choose the lesson first." }); return; }
    setBusy(ai ? "ai" : "lesson");
    try {
      const r = await desk.draft(f.unitId, ai);
      const d = r.draft || {};
      setF(x => Object.assign({}, x, { title: d.title || x.title, instructions: d.instructions || x.instructions, track: d.track || x.track, week: d.week || x.week, proof: d.proof || x.proof, dueAt: x.dueAt || d.dueAt || "",
        steps: (d.steps || []).length ? d.steps.join("\n") : x.steps }));
      toast.info(r.via === "ai" ? "Drafted with AI from the lesson. Read it before you publish." : "Drafted from the lesson's own weekly assignment.", "Assignments");
    } catch (e) { toast.error(asdErr(e), "Couldn't draft it"); }
    finally { setBusy(""); }
  };
  const save = async (publish) => {
    setBusy(publish ? "publish" : "save"); setErrs({});
    try {
      const data = Object.assign({}, f, { status: publish ? "published" : f.status === "published" ? "published" : "draft", points: Number(f.points),
        steps: String(f.steps || "").split("\n").map(x => x.trim()).filter(Boolean) });
      const r = await desk.save(data, publish && notify);
      toast.success(publish ? "Published" + (typeof r.notified === "number" ? " — sent to " + r.notified + " member" + (r.notified === 1 ? "" : "s") : "") + "." : "Saved.", f.title);
      onDone({ assignmentId: r.assignmentId });
    } catch (e) {
      if (e && e.data && e.data.fieldErrors) setErrs(e.data.fieldErrors); else toast.error(asdErr(e), "Couldn't save it");
    } finally { setBusy(""); }
  };
  const fe = (k) => errs[k] ? <span className="asd-ferr" id={"asd-e-" + k} role="alert">{errs[k]}</span> : null;
  const live = f.status === "published";
  return (
    <form className="asd-edit" onSubmit={(e) => { e.preventDefault(); save(!live ? false : true); }} noValidate>
      <div className="asd-head">
        <button type="button" className="asd-btn is-sm" onClick={() => onDone(null)}><i className="ph ph-arrow-left" aria-hidden="true"/> Assignments</button>
        <div className="asd-title"><h2>{f.assignmentId ? "Edit assignment" : "New assignment"}</h2></div>
      </div>
      <div className="asd-grid">
        <div className="asd-col">
          <label className="asd-field"><span>Course</span>
            <select className="asd-input" value={f.track} onChange={e => set("track", e.target.value)} aria-invalid={!!errs.track} aria-describedby={errs.track ? "asd-e-track" : undefined}>
              {meta.canWhole ? <option value="">Whole Club (every member)</option> : <option value="" disabled>Choose a course</option>}
              {courses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>{fe("track")}</label>
          {(meta.centres || []).length > 1 || !meta.scopedCentres ? (
            <label className="asd-field"><span>Centre</span>
              <select className="asd-input" value={f.centre} onChange={e => set("centre", e.target.value)} aria-invalid={!!errs.centre}>
                {!meta.scopedCentres ? <option value="">Every centre</option> : <option value="" disabled>Choose a centre</option>}
                {(meta.centres || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>{fe("centre")}</label>) : null}
          <div className="asd-field"><span>From a lesson <em>(optional)</em></span>
            <select className="asd-input" value={f.unitId} onChange={e => set("unitId", e.target.value)} aria-label="Lesson" aria-invalid={!!errs.unitId}>
              <option value="">Not linked to a lesson</option>
              {units.map(u => <option key={u.unitId} value={u.unitId}>{(f.track ? "" : u.course + " · ") + u.label}</option>)}
            </select>{fe("unitId")}
            <div className="asd-inline">
              <button type="button" className="asd-btn is-sm" disabled={!f.unitId || !!busy} aria-busy={busy === "lesson" ? "true" : undefined} onClick={() => draft(false)}>{busy === "lesson" ? "Drafting…" : "Draft from the lesson"}</button>
              {meta.aiMarking ? <button type="button" className="asd-btn is-sm" disabled={!f.unitId || !!busy} aria-busy={busy === "ai" ? "true" : undefined} onClick={() => draft(true)}><i className="ph ph-sparkle" aria-hidden="true"/> {busy === "ai" ? "Writing…" : "Write it with AI"}</button> : null}
            </div>
          </div>
          <div className="asd-aud" role="status" aria-live="polite">
            {aud === null ? "Counting who it reaches…" : aud.error ? "Couldn't count who it reaches: " + aud.error
              : <><b>Reaches {aud.count} member{aud.count === 1 ? "" : "s"}</b>{aud.sample && aud.sample.length ? <span> — {aud.sample.join(", ")}{aud.count > aud.sample.length ? " and " + (aud.count - aud.sample.length) + " more" : ""}</span> : null}</>}
          </div>
        </div>
        <div className="asd-col is-wide">
          <label className="asd-field"><span>Title</span>
            <input className="asd-input" value={f.title} maxLength={160} onChange={e => set("title", e.target.value)} aria-invalid={!!errs.title} aria-describedby={errs.title ? "asd-e-title" : undefined}/>{fe("title")}</label>
          <label className="asd-field"><span>What to do</span>
            <textarea className="asd-input is-area" rows={9} value={f.instructions} maxLength={8000} onChange={e => set("instructions", e.target.value)} aria-invalid={!!errs.instructions} aria-describedby={errs.instructions ? "asd-e-instructions" : undefined}/>{fe("instructions")}</label>
          <div className="asd-row3">
            <label className="asd-field"><span>Due</span><input type="date" className="asd-input" value={f.dueAt} onChange={e => set("dueAt", e.target.value)} aria-invalid={!!errs.dueAt}/>{fe("dueAt")}<em className="asd-hint">Blank: next Saturday</em></label>
            <label className="asd-field"><span>Points</span><input type="number" min="0" max="1000" className="asd-input" value={f.points} onChange={e => set("points", e.target.value)} aria-invalid={!!errs.points}/>{fe("points")}</label>
          </div>
          <div className="asd-field" role="radiogroup" aria-label="How it is handed in"><span>How it is handed in</span>
            <div className="asd-kinds">{proofs.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.proof === k} className={"asd-kind" + (f.proof === k ? " is-on" : "")} onClick={() => set("proof", k)}>
              <i className={"ph " + ({ any: "ph-squares-four", text: "ph-text-aa", file: "ph-file-text", photo: "ph-camera", recording: "ph-microphone", link: "ph-link", checklist: "ph-list-checks", either: "ph-files" }[k] || "ph-file")} aria-hidden="true"/>{l}</button>)}</div>
            {proofHint ? <em className="asd-hint">{proofHint}</em> : null}{fe("proof")}</div>
          <label className="asd-field"><span>Success criteria <em>(one per line — members tick each before they hand in{f.proof === "checklist" ? "; required for a checklist" : ""})</em></span>
            <textarea className="asd-input is-area" rows={4} value={f.steps} onChange={e => set("steps", e.target.value)} placeholder={"Totals worked out by formula\nHeader row frozen\nShared as Viewer"} aria-invalid={!!errs.steps}/>{fe("steps")}</label>
          <label className="asd-field"><span>Worksheet or link <em>(optional)</em></span>
            <input className="asd-input" type="url" placeholder="https://" value={f.attachmentUrl} onChange={e => set("attachmentUrl", e.target.value)} aria-invalid={!!errs.attachmentUrl}/>{fe("attachmentUrl")}</label>
          {!live ? <label className="asd-check"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)}/> Also email them when it is published</label> : null}
          <div className="asd-foot">
            {live ? <button type="submit" className="asd-btn is-primary" disabled={!!busy}>{busy ? "Saving…" : "Save changes"}</button>
              : <>
                <button type="button" className="asd-btn" disabled={!!busy} onClick={() => save(false)}>{busy === "save" ? "Saving…" : "Save as draft"}</button>
                <button type="button" className="asd-btn is-primary" disabled={!!busy} onClick={() => save(true)}>{busy === "publish" ? "Publishing…" : "Publish"}</button>
              </>}
          </div>
        </div>
      </div>
    </form>
  );
}

function AsdMarks({ desk, id, onBack, onEdit }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [open, setOpen] = React.useState("");
  const load = React.useCallback(() => { setErr(null); return desk.submissions(id).then(setD).catch(setErr); }, [desk, id]);
  React.useEffect(() => { load(); }, [load]);
  const a = (d && d.assignment) || {};
  const subs = (d && d.submissions) || [];
  const toMark = subs.filter(s => s.status === "submitted");
  const remind = async () => {
    try { const r = await desk.remind(id); toast.success((r.reminded || 0) + " reminded.", a.title); load(); }
    catch (e) { toast.error(asdErr(e), "No reminder sent"); }
  };
  return (
    <div className="asd-marks">
      <div className="asd-head">
        <button type="button" className="asd-btn is-sm" onClick={onBack}><i className="ph ph-arrow-left" aria-hidden="true"/> Assignments</button>
        <div className="asd-title"><h2>{a.title || "Hand-ins"}</h2>
          {d ? <p>{a.track || "Whole Club"}{a.centre ? " · " + a.centre : ""} · due {asdDate(a.dueAt)} · {a.points} points · <span className={"asd-chip is-" + a.status}>{ASD_STATUS[a.status] || a.status}</span></p> : null}</div>
        {d && a.canEdit ? <div className="asd-inline">
          {a.status === "published" && (d.missing || []).length ? <button type="button" className="asd-btn is-sm" onClick={remind}>Remind {d.missing.length}</button> : null}
          <button type="button" className="asd-btn is-sm" onClick={() => onEdit(a)}>Edit</button></div> : null}
      </div>
      {err ? <div className="asd-state is-err" role="alert"><b>Hand-ins couldn't load.</b><span>{asdErr(err)}</span><button type="button" className="asd-btn" onClick={load}>Try again</button></div>
       : !d ? <div className="asd-state" role="status" aria-live="polite"><span className="asd-spin" aria-hidden="true"/>Loading hand-ins…</div>
       : <>
          <p className="asd-sum" role="status" aria-live="polite"><b>{subs.length}</b> handed in · <b>{toMark.length}</b> to mark · <b>{(d.missing || []).length}</b> not yet</p>
          {a.instructions ? <details className="asd-brief"><summary>What they were asked to do</summary><p>{a.instructions}</p></details> : null}
          {!subs.length ? <div className="asd-state"><b>Nothing handed in yet.</b><span>{a.status === "draft" ? "It is still a draft — publish it so members can see it." : "Hand-ins appear here as they arrive."}</span></div>
           : <ul className="asd-subs">{subs.map(s => (
              <li key={s.submissionId} className={"asd-sub" + (open === s.submissionId ? " is-open" : "")}>
                <button type="button" className="asd-subhead" aria-expanded={open === s.submissionId} onClick={() => setOpen(open === s.submissionId ? "" : s.submissionId)}>
                  <span className="asd-main"><b>{s.memberName}</b><span className="asd-meta">{s.centre}{s.submittedAt ? " · " + asdWhen(s.submittedAt) : ""}</span></span>
                  {s.late ? <span className="asd-chip is-late">Late</span> : null}
                  <span className={"asd-chip is-" + s.status}>{s.status === "graded" ? s.grade + " / " + a.points : s.status === "returned" ? "Returned" : "To mark"}</span>
                </button>
                {open === s.submissionId ? <AsdMark desk={desk} s={s} a={a} canMark={d.canMark} ai={d.aiMarking} onDone={() => { setOpen(""); load(); }}/> : null}
              </li>))}</ul>}
          {(d.missing || []).length ? <section className="asd-missing" aria-label="Not handed in yet">
            <h3>Not handed in yet <span className="asd-n">{d.missing.length}</span></h3>
            <ul>{d.missing.map(m => <li key={m.memberId}>{m.memberName}<span className="asd-meta"> · {m.centre}</span></li>)}</ul>
          </section> : null}
        </>}
    </div>
  );
}

function AsdMark({ desk, s, a, canMark, ai, onDone }) {
  const [grade, setGrade] = React.useState(s.grade != null ? String(s.grade) : "");
  const [fb, setFb] = React.useState(s.feedback || "");
  const [busy, setBusy] = React.useState("");
  const [why, setWhy] = React.useState("");
  const suggest = async () => {
    setBusy("ai");
    try { const r = await desk.suggest(s.submissionId); setGrade(String(r.grade)); setFb(r.feedback || ""); setWhy(r.confidence === "high" ? "AI suggestion — check it, then save." : "AI suggestion, low confidence — read the work closely."); }
    catch (e) { toast.error(asdErr(e), "No suggestion"); }
    finally { setBusy(""); }
  };
  const mark = async () => {
    const g = Number(grade);
    if (grade === "" || isNaN(g) || g < 0 || g > a.points) { setWhy("A mark from 0 to " + a.points + "."); return; }
    setBusy("mark");
    try { await desk.grade(s.submissionId, g, fb, false); toast.success("Marked " + g + " / " + a.points + ".", s.memberName); onDone(); }
    catch (e) { toast.error(asdErr(e), "Not saved"); } finally { setBusy(""); }
  };
  const giveBack = async () => {
    if (!fb.trim()) { setWhy("Say what to change before you return it."); return; }
    setBusy("ret");
    try { await desk.giveBack(s.submissionId, fb); toast.success("Returned for changes.", s.memberName); onDone(); }
    catch (e) { toast.error(asdErr(e), "Not returned"); } finally { setBusy(""); }
  };
  return (
    <div className="asd-markbox">
      {s.text ? <div className="asd-work">{s.text}</div> : null}
      {s.linkUrl ? <a className="asd-btn is-sm asd-golink" href={s.linkUrl} target="_blank" rel="noopener noreferrer"><i className="ph ph-link" aria-hidden="true"/> Open the {s.linkKind || "link"}</a> : null}
      {(s.files || []).length ? <div className="asd-media">{s.files.map((f, i) => f.kind === "photo"
          ? <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="asd-thumb"><img src={f.url} alt={f.name || ("Photo " + (i + 1))} loading="lazy"/></a>
          : f.kind === "recording" ? (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(f.url) && !/audio|recording-/i.test(f.name || "") ? <video key={i} src={f.url} controls className="asd-player" aria-label={f.name}/> : <audio key={i} src={f.url} controls className="asd-player" aria-label={f.name}/>)
          : <a key={i} className="asd-btn is-sm" href={f.url} target="_blank" rel="noopener noreferrer"><i className="ph ph-file-text" aria-hidden="true"/> {f.name || "Open the file"}</a>)}</div>
       : s.fileUrl ? <a className="asd-btn is-sm" href={s.fileUrl} target="_blank" rel="noopener noreferrer"><i className="ph ph-paperclip" aria-hidden="true"/> Open the file</a> : null}
      {(a.steps || []).length ? <ul className="asd-ticks" aria-label="Success criteria the member ticked">{a.steps.map((st, i) => { const on = (s.steps || []).includes(i);
          return <li key={i} className={on ? "is-on" : ""}><i className={"ph " + (on ? "ph-check-square" : "ph-square")} aria-hidden="true"/> {st}<span className="asd-sr">{on ? " — ticked" : " — not ticked"}</span></li>; })}</ul> : null}
      {!s.text && !s.fileUrl && !s.linkUrl && !(s.files || []).length ? <p className="asd-meta">Nothing was written.</p> : null}
      {canMark ? <>
        <div className="asd-row3">
          <label className="asd-field"><span>Mark (out of {a.points})</span><input className="asd-input" type="number" min="0" max={a.points} value={grade} onChange={e => setGrade(e.target.value)}/></label>
          <label className="asd-field is-span2"><span>Feedback to {String(s.memberName || "").split(" ")[0] || "them"}</span><textarea className="asd-input is-area" rows={3} value={fb} maxLength={2000} onChange={e => setFb(e.target.value)}/></label>
        </div>
        {why ? <p className="asd-hint" role="status">{why}</p> : null}
        <div className="asd-inline">
          <button type="button" className="asd-btn is-primary" disabled={!!busy} onClick={mark}>{busy === "mark" ? "Saving…" : "Save mark"}</button>
          <button type="button" className="asd-btn" disabled={!!busy} onClick={giveBack}>{busy === "ret" ? "Returning…" : "Return for changes"}</button>
          {ai && s.text ? <button type="button" className="asd-btn" disabled={!!busy} aria-busy={busy === "ai" ? "true" : undefined} onClick={suggest}><i className="ph ph-sparkle" aria-hidden="true"/> {busy === "ai" ? "Reading…" : "Suggest a mark"}</button> : null}
        </div>
      </> : <p className="asd-meta">You can read this one; its course's instructors mark it.</p>}
    </div>
  );
}

/* ── The member's hand-in ────────────────────────────────────────────────────
 * One panel for every kind of assignment (domain/assignments.php ASG_PROOFS):
 * writing, a document, a photo (straight from the camera), a recording (made
 * here, in the browser, or uploaded), a link it recognises, or a checklist —
 * and the success-criteria steps the member ticks before it goes in. The
 * server checks all of it again; this screen only says early what is missing.
 */
const AHI_ACCEPT = {
  photo: "image/*",
  recording: "audio/*,video/*",
  file: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,image/*",
  any: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,image/*,audio/*,video/*",
};
const AHI_ERR = {
  link_required: "Paste the link to your work.", bad_link: "That link does not look right — it should start with https://",
  photo_required: "Add a photo of your work.", recording_required: "Add a recording — record one here or choose a file.",
  file_required: "Attach your file.", text_required: "Write your answer.", text_or_file_required: "Write your answer or attach a file.",
  steps_incomplete: "Tick every step first — they are how you check your own work.", empty_submission: "Add your work before you hand it in.",
  too_many_files: "Five files at most.", bad_file: "One of the files did not upload properly. Remove it and add it again.",
  not_open: "This assignment is closed.", already_graded: "This one has been marked already.", not_for_you: "This assignment is not for your course.",
  uploads_disabled: "File uploads are not set up yet. Paste a link instead (Google Drive works).",
};
/** The client's reading of a link — the same names the server gives (assignment_link_kind). */
function ahiLinkKind(url) {
  let u; try { u = new URL(url); } catch (_) { return ""; }
  const h = u.hostname.toLowerCase(), p = u.pathname;
  if (h === "docs.google.com") return /\/document\//.test(p) ? "Google Doc" : /\/spreadsheets\//.test(p) ? "Google Sheet" : /\/presentation\//.test(p) ? "Google Slides" : /\/forms\//.test(p) ? "Google Form" : "Google Docs";
  const m = [["drive.google.com", "Google Drive"], ["forms.gle", "Google Form"], ["lookerstudio.google.com", "Looker Studio"], ["canva.com", "Canva design"], ["github.com", "GitHub"],
    ["youtube.com", "YouTube video"], ["youtu.be", "YouTube video"], ["trello.com", "Trello board"], ["figma.com", "Figma"], ["airtable.com", "Airtable"], ["replit.com", "Replit"],
    ["codepen.io", "CodePen"], ["scratch.mit.edu", "Scratch project"], ["app.diagrams.net", "draw.io diagram"], ["soundcloud.com", "SoundCloud"], ["bandlab.com", "BandLab"], ["musescore.com", "MuseScore"]];
  for (const [d, l] of m) if (h === d || h.endsWith("." + d)) return l;
  return "";
}
function ahiFileKind(f) {
  const n = (f.name || "").toLowerCase(), t = f.type || "";
  if (/^image\//.test(t) || /\.(jpe?g|png|webp|heic|heif|gif)$/.test(n)) return "photo";
  if (/^(audio|video)\//.test(t) || /\.(mp3|m4a|wav|ogg|oga|aac|weba|webm|mp4|mov|m4v|3gp)$/.test(n)) return "recording";
  return "file";
}

function AsdHandIn({ a, filesMax, onClose, onDone }) {
  const sub = a.submission || {};
  const proof = a.proof || "text";
  const steps = a.steps || [];
  const [text, setText] = React.useState(a.state === "returned" || a.state === "submitted" ? sub.text || "" : "");
  const [link, setLink] = React.useState(a.state === "returned" || a.state === "submitted" ? sub.linkUrl || "" : "");
  const [files, setFiles] = React.useState(a.state === "returned" || a.state === "submitted" ? (sub.files || []) : []);
  const [ticks, setTicks] = React.useState(() => new Set(a.state === "submitted" ? sub.steps || [] : []));
  const [up, setUp] = React.useState(null);        // {name, pct}
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [rec, setRec] = React.useState(null);      // {state:'on'|'done', secs, url, blob, video}
  const recRef = React.useRef(null);
  const boxRef = React.useRef(null);
  const from = React.useRef(document.activeElement);
  const max = filesMax || 5;
  const wants = { text: ["text", "either", "any", "checklist"].includes(proof), link: ["link", "any"].includes(proof),
                  files: ["file", "photo", "recording", "either", "any"].includes(proof), record: ["recording", "any"].includes(proof) };
  const canSubmit = a.canSubmit;
  React.useEffect(() => {
    const el = boxRef.current; if (el) el.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); stopTracks(); };
    // eslint-disable-next-line
  }, []);
  const close = () => { stopTracks(); onClose(); try { from.current && from.current.focus(); } catch (_) {} };
  const stopTracks = () => { const r = recRef.current; if (r && r.stream) r.stream.getTracks().forEach(t => t.stop()); if (r && r.timer) clearInterval(r.timer); };

  const addFiles = async (list) => {
    setErr("");
    for (const f of Array.from(list || [])) {
      if (files.length >= max) { setErr(AHI_ERR.too_many_files); break; }
      if (f.size > 100 * 1024 * 1024) { setErr(f.name + " is over 100 MB. Share it as a Google Drive link instead."); continue; }
      setUp({ name: f.name, pct: 0 });
      try {
        const r = await NGGApi.uploadFile(f, "assignment", pct => setUp({ name: f.name, pct }));
        setFiles(x => x.concat([{ url: r.url, name: r.originalName || f.name, kind: ahiFileKind(f) }]));
      } catch (e) { setErr(AHI_ERR[e && e.code] || ("Couldn't upload " + f.name + ". Try again, or paste a Google Drive link.")); }
      finally { setUp(null); }
    }
  };
  const startRec = async (video) => {
    setErr("");
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") { setErr("This browser cannot record here. Record on your phone and choose the file instead."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { facingMode: "user" } } : { audio: true });
      const mr = new MediaRecorder(stream); const chunks = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const type = mr.mimeType || (video ? "video/webm" : "audio/webm");
        const blob = new Blob(chunks, { type });
        setRec(r => Object.assign({}, r, { state: "done", blob, url: URL.createObjectURL(blob), type }));
        stream.getTracks().forEach(t => t.stop());
        if (recRef.current && recRef.current.timer) clearInterval(recRef.current.timer);
      };
      const timer = setInterval(() => setRec(r => r && r.state === "on" ? Object.assign({}, r, { secs: r.secs + 1 }) : r), 1000);
      recRef.current = { mr, stream, timer };
      mr.start();
      setRec({ state: "on", secs: 0, video: !!video });
    } catch (_) { setErr("The microphone (or camera) was not allowed. Allow it in the browser, or choose a file you recorded."); }
  };
  const stopRec = () => { const r = recRef.current; if (r && r.mr && r.mr.state !== "inactive") r.mr.stop(); };
  const useRec = async () => {
    if (!rec || !rec.blob) return;
    const ext = /mp4/.test(rec.type) ? "mp4" : /ogg/.test(rec.type) ? "ogg" : "webm";
    const f = new File([rec.blob], (rec.video ? "video-" : "recording-") + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + "." + ext, { type: rec.type });
    setRec(null); await addFiles([f]);
  };
  const lk = ahiLinkKind(link.trim());
  const isGoogle = /^Google/.test(lk);
  const need = (() => {
    if (steps.length && ticks.size < steps.length) return "steps";
    const has = { text: text.trim() !== "", file: files.length > 0, link: /^https:\/\/\S+\.\S+/.test(link.trim()) };
    if (proof === "text") return has.text ? "" : "text";
    if (proof === "link") return has.link ? "" : "link";
    if (proof === "file") return has.file ? "" : "file";
    if (proof === "photo") return files.some(f => f.kind === "photo") ? "" : "photo";
    if (proof === "recording") return files.some(f => f.kind === "recording") ? "" : "recording";
    if (proof === "either") return has.text || has.file ? "" : "either";
    if (proof === "checklist") return ticks.size || has.text ? "" : "steps";
    return has.text || has.file || has.link ? "" : "any";
  })();
  const needWords = { steps: "Tick every step", text: "Write your answer", link: "Paste your link", file: "Attach your file", photo: "Add a photo", recording: "Add a recording", either: "Write or attach your work", any: "Add your work" };
  const send = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.member.submitAssignment({ assignmentId: a.assignmentId, text: text.trim(), linkUrl: link.trim(), files, steps: Array.from(ticks) });
      onDone(r && r.late ? "Handed in — after the due date, so it is marked as late." : "Handed in. Your instructor will mark it this week.");
    } catch (e) { setErr(AHI_ERR[e && e.code] || asdErr(e)); } finally { setBusy(false); }
  };
  const due = a.dueAt ? asdDate(a.dueAt) : "";
  const stateWord = typeof mp9AsgState === "function" ? mp9AsgState(a) : a.state;
  return (
    <div className="ahi-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="ahi" role="dialog" aria-modal="true" aria-labelledby="ahi-title" tabIndex={-1} ref={boxRef}>
        <header className="ahi-head">
          <div className="ahi-kicker">{(a.track || "Club")}{a.points ? " · " + a.points + " points" : ""}{due ? " · due " + due : ""}</div>
          <h2 id="ahi-title">{a.title}</h2>
          <span className={"ahi-state is-" + a.state}>{stateWord}</span>
          <button type="button" className="ahi-x" aria-label="Close" onClick={close}><i className="ph ph-x" aria-hidden="true"/></button>
        </header>
        <div className="ahi-body">
          {sub.feedback && (a.state === "returned" || a.state === "marked") ? <div className={"ahi-fb" + (a.state === "returned" ? " is-ret" : "")}>
            <b>{a.state === "marked" ? "Marked " + sub.grade + (a.points ? " / " + a.points : "") : "Returned for changes"}</b><p>{sub.feedback}</p></div> : null}
          {a.instructions ? <section className="ahi-sec"><h3>What to do</h3><p className="ahi-brief">{a.instructions}</p>
            {a.attachmentUrl ? <a className="ahi-link" href={a.attachmentUrl} target="_blank" rel="noopener noreferrer"><i className="ph ph-file-arrow-down" aria-hidden="true"/> Open the worksheet</a> : null}</section> : null}
          {!canSubmit ? <p className="ahi-note">{a.state === "marked" ? "This one is marked — well done for handing it in." : a.state === "closed" ? "This assignment is closed." : "It can't be handed in now."}</p> : <>
          <section className="ahi-sec"><h3>Hand in: {a.proofLabel || "your work"}</h3><p className="ahi-hint">{a.proofHint}</p></section>
          {steps.length ? <fieldset className="ahi-steps"><legend>Check your work — tick each one</legend>
            {steps.map((st, i) => <label key={i} className={"ahi-step" + (ticks.has(i) ? " is-on" : "")}>
              <input type="checkbox" checked={ticks.has(i)} onChange={() => setTicks(t => { const n = new Set(t); n.has(i) ? n.delete(i) : n.add(i); return n; })}/><span>{st}</span></label>)}
            <p className="ahi-count" aria-live="polite">{ticks.size} of {steps.length} done</p></fieldset> : null}
          {wants.link ? <label className="ahi-field"><span>Link to your work</span>
            <input className="ahi-input" type="url" inputMode="url" placeholder="https://docs.google.com/…" value={link} onChange={e => setLink(e.target.value)}/>
            {link.trim() ? <span className={"ahi-lk" + (lk ? " is-ok" : "")}>{lk ? <><i className="ph ph-check-circle" aria-hidden="true"/> {lk}</> : /^https:\/\//.test(link.trim()) ? "A website link" : "Links start with https://"}</span> : null}
            {isGoogle ? <span className="ahi-hint">Set sharing to <b>Anyone with the link · Viewer</b>, or your instructor will not be able to open it.</span> : null}</label> : null}
          {wants.files ? <div className="ahi-field"><span>{proof === "photo" ? "Photos" : proof === "recording" ? "Recordings" : "Files"} <em>({files.length} of {max})</em></span>
            {files.length ? <ul className="ahi-files">{files.map((f, i) => <li key={f.url + i}>
              <i className={"ph " + (f.kind === "photo" ? "ph-image" : f.kind === "recording" ? "ph-waveform" : "ph-file")} aria-hidden="true"/><a href={f.url} target="_blank" rel="noopener noreferrer">{f.name || "File " + (i + 1)}</a>
              <button type="button" className="ahi-rm" aria-label={"Remove " + (f.name || "file")} onClick={() => setFiles(x => x.filter((_, j) => j !== i))}><i className="ph ph-trash" aria-hidden="true"/></button></li>)}</ul> : null}
            {up ? <div className="ahi-up" role="status" aria-live="polite"><span>Uploading {up.name}…</span><span className="ahi-bar"><span style={{ width: (up.pct || 3) + "%" }}/></span></div> : null}
            <div className="ahi-pick">
              {proof === "photo" || proof === "any" || proof === "either" ? <label className="ahi-btn"><i className="ph ph-camera" aria-hidden="true"/> Take a photo<input type="file" accept="image/*" capture="environment" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} hidden/></label> : null}
              <label className="ahi-btn"><i className="ph ph-paperclip" aria-hidden="true"/> {proof === "photo" ? "Choose photos" : proof === "recording" ? "Choose a recording" : "Choose files"}
                <input type="file" multiple accept={AHI_ACCEPT[proof] || AHI_ACCEPT.any} onChange={e => { addFiles(e.target.files); e.target.value = ""; }} hidden/></label>
              {wants.record && !rec ? <><button type="button" className="ahi-btn" onClick={() => startRec(false)}><i className="ph ph-microphone" aria-hidden="true"/> Record audio</button>
                <button type="button" className="ahi-btn" onClick={() => startRec(true)}><i className="ph ph-video-camera" aria-hidden="true"/> Record video</button></> : null}
            </div>
            {rec ? <div className="ahi-rec" role="status" aria-live="polite">
              {rec.state === "on" ? <><span className="ahi-dot" aria-hidden="true"/><b>Recording {Math.floor(rec.secs / 60)}:{String(rec.secs % 60).padStart(2, "0")}</b>
                <button type="button" className="ahi-btn is-dark" onClick={stopRec}><i className="ph ph-stop" aria-hidden="true"/> Stop</button></>
               : <>{rec.video ? <video src={rec.url} controls className="ahi-media"/> : <audio src={rec.url} controls className="ahi-media"/>}
                <div className="ahi-inline"><button type="button" className="ahi-btn is-dark" onClick={useRec}>Use this recording</button>
                  <button type="button" className="ahi-btn" onClick={() => setRec(null)}>Record again</button></div></>}
            </div> : null}
          </div> : null}
          {wants.text ? <label className="ahi-field"><span>{proof === "text" || proof === "either" ? "Your answer" : "A note for your instructor"} {proof === "text" ? null : <em>(optional)</em>}</span>
            <textarea className="ahi-input is-area" rows={proof === "text" ? 7 : 3} maxLength={20000} value={text} onChange={e => setText(e.target.value)}
              placeholder={proof === "text" ? "Write your answer here." : "What you did, and one thing that is still hard."}/></label> : null}
          {err ? <p className="ahi-err" role="alert">{err}</p> : null}
          </>}
        </div>
        {canSubmit ? <footer className="ahi-foot">
          <span className="ahi-need" aria-live="polite">{need ? needWords[need] : a.state === "late" ? "It's late — hand it in now." : "Ready to hand in"}</span>
          <button type="button" className="ahi-btn is-dark is-go" disabled={!!need || busy || !!up || (rec && rec.state === "on")} onClick={send}>
            {busy ? "Handing in…" : a.state === "returned" || a.state === "submitted" ? "Hand in again" : "Hand in"}</button>
        </footer> : null}
      </div>
    </div>
  );
}

/* ── The study helper (member_curriculum_ask) ────────────────────────────────
 *
 * It was a form: pick a lesson, type a question, get one paragraph, and the
 * previous answer was wiped on the next press. The server only ever saw the
 * latest question, so a child who read an explanation and said "I still don't
 * get it" was starting from nothing — which is the one thing being stuck is
 * never like. That is why it was useless, and it is a thread now.
 *
 * The openers exist because "ask a question" is itself hard when you do not
 * know what you do not understand. They are the three things a stuck child
 * actually needs, in their own words.
 */
const STH_OPENERS = [
  "Explain this lesson to me like I am ten.",
  "I read it but I still don\u2019t understand the main idea.",
  "Give me an example I can try myself.",
];

function CurStudyHelper({ units }) {
  const open = (units || []).filter(u => !u.progress || u.progress.status !== "completed");
  const list = open.length ? open : (units || []);
  const [unitId, setUnitId] = React.useState(list[0] ? list[0].unitId : "");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [thread, setThread] = React.useState([]);     // [{role:'me'|'ai', text}]
  const [err, setErr] = React.useState("");
  const [left, setLeft] = React.useState(null);
  const endRef = React.useRef(null);
  React.useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "nearest" }); }, [thread, busy]);
  if (!list.length) return null;

  const send = async (text) => {
    const question = String(text || "").trim();
    if (question.length < 4 || busy) return;
    setBusy(true); setErr(""); setQ("");
    /* The thread as it was BEFORE this question — what the server needs to
       understand the follow-up. */
    const history = thread.map(t => ({ role: t.role, text: t.text }));
    setThread(t => t.concat([{ role: "me", text: question }]));
    try {
      const r = await NGGApi.member.curriculumAsk(unitId, question, history);
      setThread(t => t.concat([{ role: "ai", text: r.answer, care: !!r.safeguarding }]));
      if (typeof r.left === "number") setLeft(r.left);
    } catch (e) {
      const c = e && e.code;
      setErr(c === "daily_limit" ? "You\u2019ve used today\u2019s questions. Ask your instructor, or come back tomorrow."
        : c === "ai_disabled" ? "The study helper isn\u2019t switched on yet. Ask your instructor or mentor."
        : c === "question_too_short" ? "Ask a little more \u2014 a full question gets a better answer."
        : "The study helper couldn\u2019t answer just now. Try again in a minute.");
      // Put the question back so nobody has to retype it.
      setThread(t => t.slice(0, -1)); setQ(question);
    } finally { setBusy(false); }
  };
  const label = u => (u.path ? u.path.code + " \u00b7 " : "") + u.title;
  const pickLesson = (v) => { setUnitId(v); setThread([]); setErr(""); };

  return (
    <section className="sth" aria-labelledby="sth-h">
      <div className="sth-head"><i className="ph ph-sparkle" aria-hidden="true"/><div><h3 id="sth-h">Study helper</h3>
        <p>Stuck on a lesson? Ask, then keep asking until it makes sense — it remembers what you have already been told. It won’t do your assignment for you.</p></div></div>

      <label className="sth-field"><span>Lesson</span>
        <select className="sth-input" value={unitId} onChange={e => pickLesson(e.target.value)}>
          {list.map(u => <option key={u.unitId} value={u.unitId}>{label(u)}</option>)}</select></label>

      {thread.length > 0 && (
        <ol className="sth-thread" aria-label="Your conversation" aria-live="polite">
          {thread.map((t, i) => (
            <li key={i} className={"sth-turn is-" + t.role + (t.care ? " is-care" : "")}>
              <span className="sth-who">{t.role === "me" ? "You" : "Study helper"}</span>
              <p className="sth-bubble">{t.text}</p>
            </li>
          ))}
          {busy && <li className="sth-turn is-ai"><span className="sth-who">Study helper</span><p className="sth-bubble is-wait">Thinking…</p></li>}
          <li ref={endRef} aria-hidden="true"/>
        </ol>
      )}

      {thread.length === 0 && !busy && (
        <div className="sth-openers" role="group" aria-label="Ways to start">
          {STH_OPENERS.map((o, i) => <button key={i} type="button" className="sth-opener" onClick={() => send(o)}>{o}</button>)}
        </div>
      )}

      <form className="sth-form" onSubmit={e => { e.preventDefault(); send(q); }}>
        <label className="sth-field"><span className="sr-only">Your question</span>
          <textarea className="sth-input is-area" rows={2} maxLength={600} value={q} disabled={busy}
                    onChange={e => setQ(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(q); } }}
                    placeholder={thread.length ? "Ask a follow-up\u2026" : "e.g. Why does F major have a B flat?"}/></label>
        <div className="sth-row">
          <span className="sth-left" aria-live="polite">{left !== null ? left + " questions left today" : ""}</span>
          {thread.length > 0 && <button type="button" className="sth-restart" onClick={() => { setThread([]); setErr(""); }}>Start again</button>}
          <button type="submit" className="sth-btn" disabled={busy || q.trim().length < 4}>{busy ? "Thinking\u2026" : thread.length ? "Send" : "Ask"}</button>
        </div>
      </form>
      {err ? <div className="sth-ans is-err" role="alert">{err}</div> : null}
    </section>
  );
}
