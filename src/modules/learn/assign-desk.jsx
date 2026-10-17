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
const ASD_PROOF = [["either", "Writing or a file"], ["text", "Writing"], ["file", "A file (photo, recording, document)"]];
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
                    {a.track || "Whole Club"}{a.centre ? " · " + a.centre : ""}{a.week ? " · week " + a.week : ""}{a.unitId ? " · linked to a lesson" : ""}{a.canEdit ? "" : " · read-only"}
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

function AsdEditor({ desk, meta, start, onDone }) {
  const s0 = start || {};
  const [f, setF] = React.useState({ assignmentId: s0.assignmentId || "", title: s0.title || "", instructions: s0.instructions || "", track: s0.track || ((meta.courses || []).length === 1 ? meta.courses[0] : ""),
    centre: s0.centre || "", unitId: s0.unitId || "", dueAt: (s0.dueAt || "").slice(0, 10), points: s0.points != null ? s0.points : 10, proof: s0.proof || "either", attachmentUrl: s0.attachmentUrl || "", week: s0.week || 0, status: s0.status || "draft" });
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
      setF(x => Object.assign({}, x, { title: d.title || x.title, instructions: d.instructions || x.instructions, track: d.track || x.track, week: d.week || x.week, proof: d.proof || x.proof, dueAt: x.dueAt || d.dueAt || "" }));
      toast.info(r.via === "ai" ? "Drafted with AI from the lesson. Read it before you publish." : "Drafted from the lesson's own weekly assignment.", "Assignments");
    } catch (e) { toast.error(asdErr(e), "Couldn't draft it"); }
    finally { setBusy(""); }
  };
  const save = async (publish) => {
    setBusy(publish ? "publish" : "save"); setErrs({});
    try {
      const data = Object.assign({}, f, { status: publish ? "published" : f.status === "published" ? "published" : "draft", points: Number(f.points) });
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
            <label className="asd-field"><span>Handed in as</span>
              <select className="asd-input" value={f.proof} onChange={e => set("proof", e.target.value)}>{ASD_PROOF.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
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
      {s.fileUrl ? <a className="asd-btn is-sm" href={s.fileUrl} target="_blank" rel="noopener noreferrer"><i className="ph ph-paperclip" aria-hidden="true"/> Open the file</a> : null}
      {!s.text && !s.fileUrl ? <p className="asd-meta">Nothing was written.</p> : null}
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
