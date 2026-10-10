/* ============================================================================
   Mentor Portal v14 — This week, Mentees, and one mentee's profile with its
   seven tabs (Overview · Goals · Scorecard · Sessions · Relationship ·
   Family · Progress). Copy is the handoff's, verbatim.
   ========================================================================== */

/* ── This week ──────────────────────────────────────────────────────────── */
function MpWeek(props) {
  const { go, phone, centre, role } = props;
  const r = useMp(() => NGGApi.member.mentorWeek(centre), [centre]);
  const [all, setAll] = React.useState(false);
  const d = r.data || props.week;
  React.useEffect(() => { if (r.data) props.refreshWeek && props.refreshWeek(); }, [r.data]); // keep the badges current
  const sub = d ? (mpDate(d.saturday, { weekday: "long", day: "numeric", month: "long" }).replace(/^(\w+)/, "$1") + " · " + mpPlural(d.menteeCount || 0, "mentee") + " · " + (MP_ROLE_LABEL[role] || "").toLowerCase()) : "";
  const goTo = g => {
    if (!g) return;
    if (g.screen === "mentee") go({ screen: "mentee", id: g.id, tab: g.tab || "overview" });
    else if (g.screen === "saturday") go({ screen: "saturday", step: g.step || "" });
    else go({ screen: g.screen, filter: g.filter || "" });
  };
  const done = (row, e) => {
    e.stopPropagation();
    NGGApi.member.mentorAct("nudgeDone", { id: row.nudgeId }).then(() => { r.set(x => Object.assign({}, x, { due: x.due.filter(y => y.key !== row.key) })); props.say("Done. It’s off your list."); },
      err => props.say(mpErr(err), { bad: true }));
  };
  return <>
    <MpHead sub={sub} title="This week" phone={phone}/>
    <section className="mp-card is-clip" aria-labelledby="mp-due-h">
      <div className="mp-card-head"><h2 id="mp-due-h">Due now</h2><span>Most urgent first</span></div>
      <MpLoad r={Object.assign({}, r, { data: d })} what="what’s due" rows={4}>{x => {
        const due = x.due || [];
        if (!due.length) return <div className="mp-allclear"><i className="ph ph-check-circle" aria-hidden="true"/><span>Nothing is due. Every child has been seen in the last two weeks.</span></div>;
        const shown = all ? due : due.slice(0, 5);
        return <>
          {shown.map(row => <div key={row.key} style={{ position: "relative" }}>
            <button className="mp-row" onClick={() => goTo(row.go)} disabled={!row.go}>
              <span className={"mp-tile-ic mp-tone-" + row.tone}><i className={"ph ph-" + row.icon} aria-hidden="true"/></span>
              <span className="mp-row-t"><b>{row.title}</b><span>{row.sub}</span></span>
              {row.nudgeId ? <span className="mp-btn is-sm" role="button" tabIndex={0} aria-label={"Mark done: " + row.title} onClick={e => done(row, e)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") done(row, e); }}>Done</span> : null}
              {row.go && <i className="ph ph-caret-right" aria-hidden="true"/>}
            </button></div>)}
          {due.length > 5 && !all && <button className="mp-more" onClick={() => setAll(true)}>{"Show " + (due.length - 5) + " more"}</button>}
        </>;
      }}</MpLoad>
    </section>
    <section className="mp-card is-pad" aria-labelledby="mp-sch-h" style={{ gap: 4 }}>
      <h2 id="mp-sch-h" className="mp-h2" style={{ marginBottom: 6 }}>Your commitments this week</h2>
      {((d && d.week) || []).map((w, i) => <div key={i} className="mp-wk"><b>{w.day}</b><em>{w.time}</em><span>{w.label}</span>{w.done && <i className="ph-fill ph-check-circle" aria-label="Done"/>}</div>)}
      <button className="mp-btn is-sm is-quiet" style={{ alignSelf: "flex-start" }} onClick={() => go("role")}>See all twelve commitments</button>
    </section>
  </>;
}

/* ── Mentees ────────────────────────────────────────────────────────────── */
const MP_FILTERS = [["all", "All"], ["wellbeing", "Struggling"], ["contact", "One-to-one overdue"], ["rel", "Relationship check"], ["goal", "Goal needs work"], ["family", "Family update"]];
function MpMentees(props) {
  const { go, phone, centre, role, say, lead } = props;
  const r = useMp(() => NGGApi.member.mentorCaseload(centre), [centre]);
  const [f, setF] = React.useState(props.filter && MP_FILTERS.some(x => x[0] === props.filter) ? props.filter : "all");
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("urgent");
  const [sel, setSel] = React.useState([]);
  const [note, setNote] = React.useState(null);
  const peer = role === "peer";
  const leadView = role === "lead" || role === "coord";
  const filters = MP_FILTERS.filter(([k]) => !(peer && k === "family"));
  const all = (r.data && r.data.mentees) || [];
  const count = k => k === "all" ? all.length : all.filter(m => m.flags[k]).length;
  const n = q.trim().toLowerCase();
  let list = all.filter(m => (f === "all" || m.flags[f]) && (!n || (m.name + " " + m.school).toLowerCase().indexOf(n) >= 0));
  if (sort === "contact") list = list.slice().sort((a, b) => (b.flags.contactDays == null ? 9999 : b.flags.contactDays) - (a.flags.contactDays == null ? 9999 : a.flags.contactDays));
  if (sort === "name") list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  const ids = list.map(m => m.id);
  const allOn = ids.length > 0 && ids.every(id => sel.indexOf(id) >= 0);
  const someOn = sel.length > 0 && !allOn;
  const toggle = id => setSel(s => s.indexOf(id) >= 0 ? s.filter(x => x !== id) : s.concat(id));
  const bulk = (fn, ok) => { const c = sel.length; fn(sel).then(res => { say(ok(c, res)); setSel([]); r.reload(); props.refreshWeek(); }, e => say(mpErr(e), { bad: true })); };
  const rel = m => {
    const c = m.rel.child, me = m.rel.mentor;
    if (c == null && me == null) return { t: "Not yet", dot: "", tip: "No relationship check yet" };
    const tone = (c != null && c <= 2) ? "bad" : (c != null && me != null && me - c >= 2) ? "amber" : "ok";
    return { t: (c == null ? "–" : c) + " · " + (me == null ? "–" : me), dot: tone, tip: m.first + " rates " + (c == null ? "–" : c) + ", you rate " + (me == null ? "–" : me) };
  };
  const sub = r.data ? all.length + " in your care · sorted by who needs you most" : "";
  return <>
    <MpHead sub={sub} title="Mentees" phone={phone}/>
    <div className="mp-chips" role="group" aria-label="Filter">{filters.map(([k, l]) => <button key={k} className="mp-chip" aria-pressed={f === k} onClick={() => { setF(k); setSel([]); }}>{l}<em>{r.data ? count(k) : ""}</em></button>)}</div>
    <section className="mp-card is-clip" aria-label="Mentees">
      <div className={"mp-listbar" + (sel.length ? " is-sel" : "")}>
        <button className="mp-chk" aria-label={allOn ? "Clear selection" : "Select all shown"} onClick={() => setSel(allOn ? [] : ids)}>
          <i className={"ph " + (allOn ? "ph-check-square" : someOn ? "ph-minus-square" : "ph-square")} aria-hidden="true"/></button>
        {!sel.length ? <>
          <div className="mp-search" role="search"><i className="ph ph-magnifying-glass" aria-hidden="true"/><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or school" aria-label="Search mentees"/></div>
          <span style={{ flex: 1 }}/>
          <select className="mp-select is-sm" style={{ width: "auto" }} value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"><option value="urgent">Needs you most</option><option value="contact">Longest since one-to-one</option><option value="name">Name</option></select>
        </> : <>
          <span style={{ fontSize: 14, fontWeight: 600 }} className="mp-num" aria-live="polite">{sel.length} selected</span>
          <button className="mp-btn is-sm" onClick={() => bulk(s => NGGApi.member.mentorAct("oneToOnesAdd", { subjectIds: s }), c => c + " added to Saturday’s one-to-ones")}><i className="ph ph-calendar-plus" aria-hidden="true"/>Add to Saturday one-to-ones</button>
          <button className="mp-btn is-sm" disabled={peer} title={peer ? "Your lead mentor contacts families" : undefined} onClick={() => bulk(s => NGGApi.member.mentorAct("familyDrafts", { subjectIds: s }), c => "Drafts ready for " + mpPlural(c, "family", "families") + ". Review each before sending.")}><i className="ph ph-house-line" aria-hidden="true"/>Family update</button>
          <button className="mp-btn is-sm" onClick={() => setNote("")}><i className="ph ph-note-pencil" aria-hidden="true"/>Add a note</button>
          <span style={{ flex: 1 }}/><button className="mp-btn is-sm is-quiet" onClick={() => setSel([])}>Clear</button>
        </>}
      </div>
      {note !== null && <div className="mp-card is-pad" style={{ margin: 12 }}>
        <label className="mp-field"><span className="mp-lab">{"Note for " + mpPlural(sel.length, "record")}</span>
          <textarea className="mp-text" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What you want on each of their records"/></label>
        <div className="mp-actions"><button className="mp-btn is-ink is-sm" disabled={note.trim().length <= 3} onClick={() => { const t = note; setNote(null);
          bulk(s => NGGApi.member.mentorSession({ type: "Note", subjectIds: s, subjectId: s[0], what: t }), c => "Note added to " + mpPlural(c, "record")); }}>Add note</button>
          <button className="mp-btn is-sm" onClick={() => setNote(null)}>Cancel</button></div></div>}
      <div className="mp-grid is-mentees mp-gh" aria-hidden="true"><span/><span>Mentee</span><span className="is-wide">Last one-to-one</span><span className="is-wide">Relationship</span><span className="is-wide">Active goal</span><span style={{ textAlign: "right" }}>Needs</span></div>
      <MpLoad r={r} what="your mentees" rows={6}>{() => list.length ? list.map(m => {
        const on = sel.indexOf(m.id) >= 0; const rl = rel(m); const cd = m.flags.contactDays;
        return <div key={m.id} className={"mp-grid is-mentees mp-gr" + (on ? " is-sel" : "")}>
          <button className="mp-chk" aria-label={(on ? "Unselect " : "Select ") + m.name} aria-pressed={on} onClick={() => toggle(m.id)}><i className={"ph " + (on ? "ph-check-square" : "ph-square")} aria-hidden="true"/></button>
          <button className="mp-who" onClick={() => go({ screen: "mentee", id: m.id, tab: "overview" })}><span className="mp-av" aria-hidden="true">{m.initials}</span>
            <span><b>{m.name}</b><em>{["Age " + (m.age == null ? "–" : m.age), m.phase, leadView ? (m.mentorName || "No mentor") : (m.school || "")].filter(Boolean).join(" · ")}</em></span></button>
          <span className={"is-wide mp-num" + (m.flags.contact ? " mp-late" : "")} style={{ fontSize: 13.5 }}>{cd == null ? "Never" : cd <= 0 ? "Today" : cd + " days ago"}</span>
          <span className="is-wide mp-rel" title={rl.tip}>{rl.dot && <span className={"mp-reldot mp-c-" + rl.dot} aria-hidden="true"/>}{rl.t}</span>
          <span className="is-wide" style={{ fontSize: 13.5, color: "var(--mt-muted)" }}>{m.activeGoal ? m.activeGoal.title : "No goal yet"}</span>
          <span className="mp-flags">{m.pills.map(p => <MpPill key={p.label} p={p}/>)}</span>
        </div>;
      }) : <MpEmpty title={n ? "Nobody matches that search." : "Nobody in this group right now."} action={<button className="mp-btn" onClick={() => { setF("all"); setQ(""); }}>Show all mentees</button>}/>}</MpLoad>
    </section>
  </>;
}

/* ── One mentee ─────────────────────────────────────────────────────────── */
const MP_TABS = [["overview", "Overview"], ["goals", "Goals"], ["scorecard", "Scorecard"], ["sessions", "Sessions"], ["relationship", "Relationship"], ["family", "Family"], ["progress", "Progress"]];
function MpMentee(props) {
  const { id, tab, go, phone, centre, say, role, lead } = props;
  const r = useMp(() => NGGApi.member.mentorMentee(id, centre), [id, centre]);
  const t = MP_TABS.some(x => x[0] === tab) ? tab : "overview";
  const setTab = k => { try { history.replaceState({ page: "mentor" }, "", mpPath({ screen: "mentee", id, tab: k })); } catch (_) {} setT(k); };
  const [cur, setT] = React.useState(t);
  React.useEffect(() => setT(t), [t]);
  const tabsRef = React.useRef(null);
  const keyTabs = e => {
    const i = MP_TABS.findIndex(x => x[0] === cur); let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % MP_TABS.length; else if (e.key === "ArrowLeft") j = (i - 1 + MP_TABS.length) % MP_TABS.length;
    if (j === null) return; e.preventDefault(); setTab(MP_TABS[j][0]); const b = tabsRef.current && tabsRef.current.querySelectorAll("button")[j]; b && b.focus();
  };
  if (r.err && !r.data) return <><MpHead title="Mentee" phone={phone} onBack={() => go("mentees")} backL="Mentees"/>
    <section className="mp-card">{(r.err.code || r.err.message) === "not_in_caseload" ? <MpEmpty title="That child is not in your care." action={<button className="mp-btn" onClick={() => go("mentees")}>Back to Mentees</button>}/> : <MpError err={r.err} retry={r.reload} what="this mentee"/>}</section></>;
  if (!r.data) return <><MpHead title="Mentee" phone={phone} onBack={() => go("mentees")} backL="Mentees"/><section className="mp-card"><MpSkel rows={5}/></section></>;
  const d = r.data, m = d.mentee, f = m.flags, ag = m.activeGoal;
  const month = mpMonthName(d.today);
  const facts = [
    ["Last one-to-one", f.contactDays == null ? "Never" : f.contactDays <= 0 ? "Today" : f.contactDays + " days ago", f.contact ? "warn" : ""],
    ["This week", m.wellbeing + (m.wellbeingAt ? "" : ""), m.wellbeing === "Okay" ? "ok" : "bad"],
    ["Relationship", m.rel.child == null ? "Not checked yet" : m.rel.child + " / 5 from " + m.first, f.rel ? "warn" : ""],
    ["Active goal", ag ? (ag.progress ? ag.progress + " of 5 · " + ag.area : "Not checked yet") : "None yet", !ag || ag.stalled ? "warn" : ""],
  ];
  const shared = Object.assign({}, props, { d, m, reload: r.reload, setTab });
  let body;
  if (cur === "goals") body = <MpGoalsTab {...shared}/>;
  else if (cur === "scorecard") body = <MpScorecardTab {...shared}/>;
  else if (cur === "sessions") body = <MpSessionsTab {...shared}/>;
  else if (cur === "relationship") body = <MpRelTab {...shared}/>;
  else if (cur === "family") body = <MpFamilyTab {...shared}/>;
  else if (cur === "progress") body = <MpProgressTab {...shared}/>;
  else body = <MpOverviewTab {...shared}/>;
  return <>
    <MpHead sub={m.centre} title={m.name} phone={phone} onBack={() => go("mentees")} backL="Mentees"/>
    <section className="mp-card is-pad" style={{ gap: 14 }}>
      <div className="mp-prof-top"><span className="mp-av is-lg" aria-hidden="true">{m.initials}</span>
        <span>{["Age " + (m.age == null ? "–" : m.age), m.phase + " phase", m.school, m.guardianName].filter(Boolean).join(" · ")}{phone && <b style={{ display: "block", fontSize: 18, color: "var(--mt-ink)" }}>{m.name}</b>}</span>
        {m.pills.map(p => <MpPill key={p.label} p={p}/>)}</div>
      <div className="mp-facts">{facts.map(([k, v, tone]) => <div key={k} className="mp-fact"><span>{k}</span><b className={tone ? "is-" + tone : ""}>{v}</b></div>)}</div>
      <div className="mp-actions">
        <button className="mp-btn is-sm is-ink" onClick={() => go({ screen: "sessions", subject: m.id })}><i className="ph ph-plus" aria-hidden="true"/>Log a session</button>
        <button className="mp-btn is-sm" onClick={() => setTab("scorecard")}>{"Score " + month}</button>
        {d.familyAllowed ? <button className="mp-btn is-sm" onClick={() => setTab("family")}>Family update</button>
          : <button className="mp-btn is-sm" onClick={() => setTab("family")}>{"Note for " + lead}</button>}
        <button className="mp-btn is-sm" onClick={() => go({ screen: "concern", subject: m.id })}><i className="ph ph-shield-warning" aria-hidden="true"/>Report a concern</button>
      </div>
    </section>
    <div className="mp-ptabs" role="tablist" aria-label={m.first + "’s record"} ref={tabsRef} onKeyDown={keyTabs}>
      {MP_TABS.map(([k, l]) => <button key={k} role="tab" id={"mp-tab-" + k} aria-selected={cur === k} aria-controls="mp-tabpanel" tabIndex={cur === k ? 0 : -1} onClick={() => setTab(k)}>{l}</button>)}</div>
    <div id="mp-tabpanel" role="tabpanel" aria-labelledby={"mp-tab-" + cur} style={{ display: "flex", flexDirection: "column", gap: 16 }}>{body}</div>
  </>;
}

function MpOverviewTab({ d, m, go }) {
  const tl = d.timeline || [];
  const ag = m.activeGoal;
  return <>
    {ag && <section className="mp-card is-pad"><span className="mp-meta">Working on · {ag.area}</span><b style={{ fontSize: 15 }}>{ag.title}</b>
      <span className="mp-actions"><MpSegs n={ag.progress} state={ag.stalled ? "stalled" : ""}/><span className="mp-meta">{ag.progress ? ag.progress + " of 5" : "Not checked yet"}{ag.lastCheckAt ? " · last check-in " + mpShort(ag.lastCheckAt) : ""}{ag.stalled ? " · stalled" : ""}</span></span></section>}
    <section className="mp-card is-clip" aria-label="Timeline">
      <div className="mp-card-head"><h2>What’s happened</h2><span>One-to-ones, Saturdays, courage and family</span></div>
      {tl.length ? tl.map((e, i) => <div key={i} className="mp-tl"><i className={"ph ph-" + e.icon} aria-hidden="true"/><div><p>{e.text}</p><span>{mpShort(e.at) + " · " + e.source}</span></div></div>)
        : <MpEmpty title={"Nothing logged for " + m.first + " yet."} body="Log your first one-to-one and it starts here." action={<button className="mp-btn" onClick={() => go({ screen: "sessions", subject: m.id })}>Log a session</button>}/>}
    </section>
  </>;
}

/* Goals tab: WOOP, one active goal, check-ins. */
const MP_AREAS = ["Character", "Competence", "Wellbeing", "Leadership"];
function MpGoalsTab({ d, m, say, reload, refreshWeek }) {
  const goals = d.goals || [];
  const [selId, setSel] = React.useState(() => { const a = goals.find(g => g.status === "active"); return a ? a.id : (goals[0] && goals[0].id) || 0; });
  const [draft, setDraft] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [prog, setProg] = React.useState(null);
  const [cnote, setCnote] = React.useState("");
  const g = goals.find(x => x.id === selId);
  React.useEffect(() => { setDraft(g ? { goal: g.goal || "", outcome: g.outcome || "", obstacle: g.obstacle || "", plan: g.plan || "", area: g.area || "Character", reviewBy: g.reviewBy || g.dueOn || "", agreed: +g.agreed === 1 } : null); setProg(null); setCnote(""); }, [selId, g && g.updatedAt]);
  const first = m.first;
  const start = () => {
    if (d.goalsLocked) { say("In the Connect phase, wait until week 3. Then write one goal together, in their words.", { bad: true }); return; }
    setBusy(true);
    NGGApi.member.mentorGoal(m.id, { goal: "" }).then(res => { setSel(res.id); reload(); say("Draft goal started for " + first); }, e => say(mpErr(e), { bad: true })).finally(() => setBusy(false));
  };
  React.useEffect(() => { if (/[?&]new=1/.test(location.search) && !goals.some(x => x.status === "draft" && !x.goal)) start(); }, []);
  const save = () => {
    if (!g || !draft) return Promise.resolve();
    return NGGApi.member.mentorGoal(m.id, Object.assign({ id: g.id }, draft, { agreed: !!draft.agreed })).then(() => reload(), e => { say(mpErr(e), { bad: true }); throw e; });
  };
  const setStatus = st => {
    if (!g || g.status === st) return;
    if (st === "active" && !String(draft.goal || "").trim()) { say("Write the wish first.", { bad: true }); return; }
    if (st === "active" && !draft.agreed) { say("Agree it with " + first + " first, then make it active.", { bad: true }); return; }
    const prevActive = goals.find(x => x.status === "active" && x.id !== g.id);
    const was = g.status;
    const commit = () => save().then(() => NGGApi.member.mentorGoalStatus(m.id, g.id, st)).then(() => reload(), e => { say(mpErr(e), { bad: true }); reload(); });
    g.status = st; if (prevActive && st === "active") prevActive.status = "paused";
    const msg = st === "active" ? (prevActive ? "One active goal at a time. “" + prevActive.goal + "” is now paused." : "Goal is live. You’ll be reminded to check in every 2 weeks and before the review date.")
      : st === "achieved" ? "Marked achieved. " + first + " sees it in their growth passport." : st === "paused" ? "Goal paused." : "Back to draft.";
    say(msg, { commit, undo: () => { g.status = was; if (prevActive) prevActive.status = "active"; setSel(s => s); reload(); } });
    setSel(s => s);
  };
  const addCheck = () => {
    if (!prog) { say("Pick a number first", { bad: true }); return; }
    setBusy(true);
    NGGApi.member.mentorGoalCheckin(m.id, g.id, prog, cnote).then(res => {
      say(res && res.achieved ? "Check-in added. Goal achieved." : "Check-in added."); setProg(null); setCnote(""); reload(); refreshWeek && refreshWeek();
    }, e => say(mpErr(e), { bad: true })).finally(() => setBusy(false));
  };
  if (!goals.length) return <section className="mp-card"><MpEmpty title={first + " has no goal yet"} body="In the Connect phase, wait until week 3. Then write one goal together, in their words."
    action={<button className="mp-btn is-ink" onClick={start} disabled={busy || d.goalsLocked}>Start a goal</button>}/>{d.goalsLocked && <p className="mp-note" style={{ textAlign: "center", paddingBottom: 16 }}>Goals open in week 3 of the match.</p>}</section>;
  const field = (k, l, help, ph) => <label className="mp-field"><span className="mp-lab">{l}</span><span className="mp-help">{help}</span>
    <textarea className="mp-text" rows={2} value={draft[k]} placeholder={ph} onChange={e => setDraft(Object.assign({}, draft, { [k]: e.target.value }))} onBlur={save} disabled={g.status === "achieved"}/></label>;
  const checks = (g && g.checks) || [];
  const last = checks[checks.length - 1];
  return <div className="mp-two is-goals">
    <section className="mp-card is-clip" aria-label="Goals">
      {goals.map(x => {
        const n = ((x.checks || []).slice(-1)[0] || {}).progress || 0;
        return <button key={x.id} className="mp-goal-i" aria-current={x.id === selId} onClick={() => setSel(x.id)}>
          <b>{x.goal || "Untitled draft"}</b>
          <span><MpPill p={{ label: x.status === "active" && x.stalled ? "Stalled" : x.status[0].toUpperCase() + x.status.slice(1), tone: x.status === "achieved" ? "ok" : x.stalled ? "warn" : x.status === "active" ? "ink" : "neu" }}/>
            <MpSegs n={n} state={x.status === "achieved" ? "done" : x.stalled ? "stalled" : ""}/>{x.area}</span></button>;
      })}
      <button className="mp-more" onClick={start} disabled={busy}><i className="ph ph-plus" aria-hidden="true"/>{" New goal with " + first}</button>
    </section>
    {g && draft && <section className="mp-card is-pad" aria-label="Goal">
      <div className="mp-seg" role="radiogroup" aria-label="Status">{["draft", "active", "achieved", "paused"].map(st =>
        <button key={st} role="radio" aria-checked={g.status === st} onClick={() => setStatus(st)}>{st[0].toUpperCase() + st.slice(1)}</button>)}</div>
      <div className="mp-form-grid">
        <label className="mp-field"><span className="mp-lab">Area</span><select className="mp-select" value={draft.area} onChange={e => { const v = Object.assign({}, draft, { area: e.target.value }); setDraft(v); NGGApi.member.mentorGoal(m.id, Object.assign({ id: g.id }, v)).catch(() => {}); }}>{MP_AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
        <label className="mp-field"><span className="mp-lab">Review by</span><input className="mp-input" type="date" value={draft.reviewBy} onChange={e => setDraft(Object.assign({}, draft, { reviewBy: e.target.value }))} onBlur={save}/></label>
      </div>
      {field("goal", "Wish", "What do they want, in their words?", "I want to speak up in class without my voice shaking")}
      {field("outcome", "Best outcome", "What would it look like if it worked?", "I answer one question a week and my teacher notices")}
      {field("obstacle", "Obstacle inside them", "What in them gets in the way?", "I freeze when everyone looks at me")}
      {field("plan", "Plan: if… then I will…", "One if–then plan for that obstacle", "If I freeze, then I will breathe out slowly and look at one friendly face")}
      <MpSwitch on={draft.agreed} label={first + " agreed this goal with me · they see it in their portal"} onChange={v => { const nd = Object.assign({}, draft, { agreed: v }); setDraft(nd); NGGApi.member.mentorGoal(m.id, Object.assign({ id: g.id }, nd)).then(() => { if (v) say(first + " can see this goal in their portal now."); reload(); }, e => say(mpErr(e), { bad: true })); }}/>
      <div style={{ borderTop: "1px solid var(--mt-row)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="mp-actions"><h3 className="mp-h2">Check-ins</h3><span className="mp-meta">{checks.length + " so far" + (last ? " · last " + mpAgo(last.at, d.today).toLowerCase() : "")}</span></div>
        {checks.length > 0 && <div className="mp-bars" aria-label={"Check-ins: " + checks.map(c => c.progress).join(", ")}>{checks.slice(-12).map((c, i, a) => <i key={c.id} className={i === a.length - 1 ? "is-last" : ""} style={{ height: (c.progress * 20) + "%" }}/>)}</div>}
        {checks.slice().reverse().slice(0, 6).map(c => <div key={c.id} className="mp-chk-row"><em>{mpShort(c.at)}</em><b className="mp-num">{c.progress}/5</b><span>{c.note || (c.by === "member" ? "From " + first : "")}</span></div>)}
        {(g.status === "active" || g.status === "draft") && <>
          <span className="mp-lab">{"How close is " + first + " now?"}</span>
          <MpScale value={prog} onChange={setProg} n={5} label={"How close is " + first + " now?"}/>
          <span className="mp-help">1 = just starting · 5 = done</span>
          <textarea className="mp-text" rows={2} value={cnote} onChange={e => setCnote(e.target.value)} placeholder="What helped, or what got in the way?" aria-label="Check-in note"/>
          <div><button className="mp-btn is-ink" disabled={!prog || busy} onClick={addCheck}>Add check-in</button></div>
        </>}
      </div>
    </section>}
  </div>;
}

/* Scorecard: the NGG Leadership Index. */
function MpScorecardTab({ d, m, say, reload }) {
  const sc = d.scorecard || {};
  const skills = d.skills || [];
  const month = sc.month;
  const base = sc.cur || sc.prev || skills.map(() => 5);
  const [vals, setVals] = React.useState(base.slice());
  const [savedVals, setSavedVals] = React.useState(sc.cur ? sc.cur.slice() : null);
  const [busy, setBusy] = React.useState(false);
  const total = vals.reduce((a, b) => a + b, 0);
  const prevT = sc.prev ? sc.prev.reduce((a, b) => a + b, 0) : null;
  const delta = prevT == null ? null : total - prevT;
  const changed = savedVals && vals.some((v, i) => v !== savedVals[i]);
  const state = !savedVals ? "new" : changed ? "edited" : "saved";
  const lockOn = sc.lockOn ? mpDate(sc.lockOn) : "";
  const set = (i, v) => setVals(vs => vs.map((x, j) => j === i ? Math.max(0, Math.min(10, v)) : x));
  const save = () => {
    if (state === "saved" || sc.locked) return;
    setBusy(true);
    NGGApi.member.mentorScorecardSave(m.id, month, vals).then(() => {
      setSavedVals(vals.slice());
      const nm = new Date(month + "-01T12:00:00Z"); nm.setUTCMonth(nm.getUTCMonth() + 1);
      say(mpMonthName(month) + " scores saved for " + m.first + ". Next scoring is due 1 " + MP_MONTHS[nm.getUTCMonth()] + ".");
      reload();
    }, e => say(mpErr(e), { bad: true })).finally(() => setBusy(false));
  };
  const selfGap = sc.self ? skills.map((s, i) => ({ s: s[0], gap: Math.abs((sc.self[i] || 0) - vals[i]) })).filter(x => x.gap >= 2) : [];
  return <section className="mp-card mp-sc" aria-labelledby="mp-sc-h">
    <div className="mp-card-head" style={{ alignItems: "flex-end" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><h2 id="mp-sc-h" className="mp-h2">NGG Leadership Index</h2>
        <span className="mp-meta">{"Scored monthly · " + (sc.savedAt ? "last scored " + mpDate(sc.savedAt) : sc.prevMonth ? "last scored in " + mpMonthName(sc.prevMonth) : "not scored yet")}</span></div>
      <div style={{ textAlign: "right" }}><span className="mp-total">{total} / 100</span><br/>
        <span className={"mp-delta " + (delta == null || delta === 0 ? "is-flat" : delta > 0 ? "is-up" : "is-down")}>{delta == null ? "First scoring" : (delta > 0 ? "+" : delta < 0 ? "−" : "") + Math.abs(delta) + " since " + mpMonthName(sc.prevMonth)}</span></div>
    </div>
    {sc.self && <p className="mp-note" style={{ padding: "0 16px 8px" }}><span className="mp-reldot" style={{ background: "var(--mt-gold)", marginRight: 6 }}/>{"Gold marks " + m.first + "’s own scores from " + mpMonthName(sc.selfMonth) + "."}{selfGap.length ? " Talk about this: " + selfGap.map(x => x.s).join(", ") + "." : ""}</p>}
    {skills.map(([name, desc], i) => {
      const v = vals[i], p = sc.prev ? sc.prev[i] : null, ch = p == null ? null : v - p;
      return <div key={name} className="mp-sc-row">
        <span className="mp-sc-name"><b>{name}</b><span>{desc}</span></span>
        <span className="mp-sc-bar" aria-hidden="true">
          <span>{Array.from({ length: 10 }).map((_, k) => <i key={k} className={k < v ? "is-cur" : (p != null && k < p ? "is-prev" : "")}/>)}</span>
          {sc.self && <span className="is-self">{Array.from({ length: 10 }).map((_, k) => <i key={k} className={k < sc.self[i] ? "is-cur" : ""}/>)}</span>}
        </span>
        <span className="mp-step"><button aria-label={"Lower " + name} disabled={v <= 0 || sc.locked} onClick={() => set(i, v - 1)}><i className="ph ph-minus"/></button>
          <output aria-live="polite" aria-label={name + " score"}>{v}</output>
          <button aria-label={"Raise " + name} disabled={v >= 10 || sc.locked} onClick={() => set(i, v + 1)}><i className="ph ph-plus"/></button></span>
        <span className={"mp-delta " + (ch == null || ch === 0 ? "is-flat" : ch > 0 ? "is-up" : "is-down")}>{ch == null || ch === 0 ? "–" : (ch > 0 ? "+" : "−") + Math.abs(ch)}</span>
      </div>;
    })}
    <div className="mp-sc-foot">
      {sc.locked ? <><button className="mp-btn is-ink" disabled>Locked</button><p>{mpMonthName(month) + "’s scores are locked. The NGG admin can unlock them if something needs correcting."}</p></>
        : <><button className="mp-btn is-ink" onClick={save} disabled={busy} aria-disabled={state === "saved"} style={state === "saved" ? { opacity: .55 } : undefined}>{state === "new" ? "Save " + mpMonthName(month) + " scores" : state === "edited" ? "Save changes" : "Saved"}</button>
          <p>{state === "new" ? "Score what you’ve seen across the month, not one Saturday. Grey marks last month." : state === "edited" ? "You’ve changed scores since saving." : "Saved. You can change it until " + lockOn + ", then it locks."}</p></>}
    </div>
  </section>;
}

function MpSessionsTab({ d, m, go }) {
  const s = d.sessions || [];
  const one = s.find(x => x.kind === "one-to-one");
  const KIND = { "one-to-one": "One-to-one", pod: "Pod session", family: "Family", phone: "Phone or message", note: "Note" };
  return <section className="mp-card is-clip">
    <div className="mp-card-head" style={{ alignItems: "center" }}><h2>{s.length + " logged" + (one ? " · last one-to-one " + mpAgo(one.metOn, d.today).toLowerCase() : "")}</h2>
      <button className="mp-btn is-sm is-ink" onClick={() => go({ screen: "sessions", subject: m.id })}><i className="ph ph-plus" aria-hidden="true"/>Log a session</button></div>
    {s.length ? s.map(x => <div key={x.id} className="mp-sess" style={{ gridTemplateColumns: "84px minmax(0,1fr)" }}><span>{mpShort(x.metOn)}</span><div>
      <em>{KIND[x.kind] || x.kind}{+x.minutes ? " · " + x.minutes + " min" : ""}</em><span>{x.discussed}</span>{x.agreed && <span className="is-next">{"Next: " + x.agreed}</span>}</div></div>)
      : <MpEmpty title="No sessions logged yet."/>}
  </section>;
}

function MpRelTab({ d, m, say, reload }) {
  const rel = d.rel || {};
  const qs = d.relQuestions || [];
  const [a, setA] = React.useState(() => (rel.mentor && rel.mentor.answers) || [null, null, null, null]);
  const [busy, setBusy] = React.useState(false);
  const c = rel.child ? rel.child.score : null, me = rel.mentor ? rel.mentor.score : null;
  const save = () => {
    if (a.some(x => !x)) { say("Answer all four first", { bad: true }); return; }
    setBusy(true);
    NGGApi.member.mentorRelCheck(m.id, a).then(() => { say("Saved. " + m.first + " answers their side this week."); reload(); }, e => say(mpErr(e), { bad: true })).finally(() => setBusy(false));
  };
  const fit = () => NGGApi.member.mentorRelFit(m.id).then(() => say("Sent to the coordinator. Nothing changes until you’ve talked."), e => say(mpErr(e), { bad: true }));
  return <section className="mp-card is-pad">
    <div className="mp-facts">
      <div className="mp-fact"><span>{m.first + " rates it"}</span><b className={c != null && c <= 2 ? "is-bad" : ""}>{c == null ? "Not yet" : c + " / 5"}</b></div>
      <div className="mp-fact"><span>You rate it</span><b>{me == null ? "Not yet" : me + " / 5"}</b></div>
    </div>
    {c != null && me != null && me - c >= 2 && <div className="mp-infonote"><i className="ph ph-info" aria-hidden="true"/><span>{"You see this relationship more warmly than " + m.first + " does. Ask what would make your time together more useful. Their individual answers are seen only by the coordinator."}</span></div>}
    {qs.map((q, i) => <div key={q} className="mp-field"><span className="mp-lab">{q}</span><MpScale value={a[i]} n={5} label={q} onChange={v => setA(x => x.map((y, j) => j === i ? v : y))}/></div>)}
    <span className="mp-help">1 = not at all · 5 = very much</span>
    <div className="mp-actions"><button className="mp-btn is-ink" onClick={save} disabled={busy}>Save my check</button><button className="mp-btn" onClick={fit}>Talk to the coordinator about fit</button></div>
  </section>;
}

function mpFamilyTemplates(m, meFirst) {
  const g = m.guardianName || "there";
  return {
    saw: ["Something I saw", "Good afternoon " + g + ". On Saturday I saw " + m.first + " help a younger member without being asked. Patience is what we’re working on together. What have you noticed at home this month? – " + meFirst],
    plan: ["Their growth plan", "Good afternoon " + g + ". " + m.first + " and I agreed a plan: " + (m.activeGoal ? m.activeGoal.title.replace(/\.$/, "") : "one small step each week") + ". You can help by asking how it went after school. – " + meFirst],
    meet: ["Ask to meet", "Good afternoon " + g + ". Could we have 15 minutes after Saturday’s session to talk about how " + m.first + " is growing? Would 11:45 work? – " + meFirst],
  };
}
function MpFamilyTab({ d, m, me, say, reload, lead, go }) {
  const peer = !d.familyAllowed;
  const T = mpFamilyTemplates(m, mpFirst(me.name));
  const [tpl, setTpl] = React.useState(d.familyDraft ? "draft" : "saw");
  const [body, setBody] = React.useState(d.familyDraft ? d.familyDraft.body : T.saw[1]);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const last = m.lastFamilyUpdateAt;
  const send = () => {
    setBusy(true);
    NGGApi.member.mentorFamilySend(m.id, body, d.familyDraft ? d.familyDraft.id : 0).then(res => {
      setConfirm(false);
      say(res && res.queued ? "Saved. It goes to " + (m.guardianName || "the family") + " at 8am. Logged in Sessions." : "Sent to " + (m.guardianName || "the family") + ". Logged in Sessions.");
      reload();
    }, e => { setConfirm(false); say(mpErr(e), { bad: true }); }).finally(() => setBusy(false));
  };
  const KIND = { family: "Family conversation", phone: "Phone or message", update: "Family update sent" };
  return <>
    {peer ? <section className="mp-card is-pad"><div className="mp-infonote"><i className="ph ph-info" aria-hidden="true"/><span>Peer mentors don’t contact families. Add a note and your lead mentor will follow up.</span></div>
      <label className="mp-field"><span className="mp-lab">{"Note for " + lead}</span><textarea className="mp-text" rows={4} value={note} onChange={e => setNote(e.target.value)}/></label>
      <div><button className="mp-btn is-ink" disabled={note.trim().length <= 3} onClick={() => NGGApi.member.mentorSession({ type: "Note", subjectId: m.id, what: "For " + lead + ": " + note }).then(() => { setNote(""); say("Sent to " + lead + ". Kept on " + m.first + "’s record."); reload(); }, e => say(mpErr(e), { bad: true }))}>{"Send to " + lead}</button></div></section>
    : <section className="mp-card is-pad">
      <span className="mp-meta">{(m.guardianName || "Guardian") + (m.guardianPhoneMasked ? " (" + m.guardianPhoneMasked + ")" : "") + " · " + (last ? "last update " + mpAgo(last, d.today).toLowerCase() : "no update yet") + " · SMS and the family app"}</span>
      {d.familyDraft && <div className="mp-infonote"><i className="ph ph-note-pencil" aria-hidden="true"/><span>A draft is ready from this month’s observations. Read it, change anything, then send. Nothing goes until you press Send.</span></div>}
      <div className="mp-chips is-wrap" role="radiogroup" aria-label="Template">
        {d.familyDraft && <button className="mp-chip" role="radio" aria-checked={tpl === "draft"} onClick={() => { setTpl("draft"); setBody(d.familyDraft.body); }}>This month’s draft</button>}
        {Object.keys(T).map(k => <button key={k} className="mp-chip" role="radio" aria-checked={tpl === k} onClick={() => { setTpl(k); setBody(T[k][1]); }}>{T[k][0]}</button>)}</div>
      <textarea className="mp-text" rows={6} value={body} onChange={e => setBody(e.target.value)} aria-label="Message to the family" maxLength={1200}/>
      <span className="mp-help">Name one specific thing you saw, and ask one question the family can answer. Journal entries stay private.</span>
      {!confirm ? <div><button className="mp-btn is-ink" onClick={() => body.trim() ? setConfirm(true) : say("Write a message first", { bad: true })}><i className="ph ph-paper-plane-right" aria-hidden="true"/>Send</button></div>
        : <div className="mp-infonote" role="alertdialog" aria-label="Confirm"><span style={{ flex: 1 }}>{"Send this to " + (m.guardianName || "the family") + " by SMS and the family app? Messages go between 8am and 8pm. It can’t be unsent."}</span>
          <button className="mp-btn is-sm is-ink" onClick={send} disabled={busy} autoFocus>Send</button><button className="mp-btn is-sm" onClick={() => setConfirm(false)}>Cancel</button></div>}
    </section>}
    <section className="mp-card is-clip"><div className="mp-card-head"><h2>Family contact</h2></div>
      {(d.family || []).length ? d.family.map((x, i) => <div key={i} className="mp-sess" style={{ gridTemplateColumns: "96px minmax(0,1fr)" }}><span style={{ fontWeight: 400, color: "var(--mt-subtle)" }}>{mpShort(x.metOn)}</span>
        <div><b style={{ fontSize: 13 }}>{KIND[x.kind] || "Family contact"}{x.status === "queued" ? " · waiting for 8am" : x.status === "failed" ? " · didn’t send" : ""}</b><span>{x.discussed}</span></div></div>)
        : <MpEmpty title="No family contact logged yet."/>}
    </section>
  </>;
}

function MpProgressTab({ d, m, say }) {
  const pr = d.progress || { items: [], saturdays: [] };
  const sats = pr.saturdays || [];
  return <>
    <div className="mp-two is-wide2">{(pr.items || []).map(o => {
      const v = o.series.filter(x => x != null); const lastV = v[v.length - 1], firstV = v[0];
      const dlt = v.length > 1 ? lastV - firstV : null;
      return <section key={o.key} className="mp-card is-pad"><div className="mp-actions"><h3 className="mp-h2">{o.label}</h3>
        <span className={"mp-delta " + (dlt == null || dlt === 0 ? "is-flat" : dlt > 0 ? "is-up" : "is-down")}>{dlt == null ? "–" : (dlt > 0 ? "+" : "−") + Math.abs(dlt) + " since " + mpShort(sats[o.series.findIndex(x => x != null)])}</span></div>
        <div className="mp-bars is-40" aria-label={o.label + ": " + o.series.map(x => x == null ? "no data" : x + "%").join(", ")}>{o.series.map((x, i) => <i key={i} className={i === o.series.length - 1 ? "is-last" : ""} style={{ height: (x == null ? 0 : Math.max(4, x)) + "%" }}/>)}</div>
        <span className="mp-help">{o.source + (lastV != null ? " · " + lastV + "% now" : " · nothing recorded yet")}</span></section>;
    })}</div>
    <section className="mp-card is-pad"><div className="mp-actions"><button className="mp-btn" onClick={() => mpProgressReport(d, m)}><i className="ph ph-file-pdf" aria-hidden="true"/>Make progress report</button>
      <span className="mp-note">Two pages for the family meeting. Private journal entries are never included.</span></div></section>
  </>;
}
/** A printable two-page report, drawn from what is on screen (the browser saves it as PDF). */
function mpProgressReport(d, m) {
  const w = window.open("", "_blank"); if (!w) return;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sc = d.scorecard || {}; const sk = d.skills || [];
  const goals = (d.goals || []).filter(g => g.status === "active" || g.status === "achieved");
  w.document.write("<!doctype html><meta charset='utf-8'><title>" + esc(m.name) + " · progress</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#0b0b0c}h1{font-size:22px}h2{font-size:16px;margin-top:24px}td,th{padding:4px 8px;border-bottom:1px solid #e8e5dd;text-align:left}table{border-collapse:collapse;width:100%}.pb{page-break-before:always}</style>"
    + "<h1>" + esc(m.name) + "</h1><p>" + esc([m.centre, m.phase + " phase", "Mentor: " + (m.mentorName || "")].join(" · ")) + "</p>"
    + "<h2>Goals</h2>" + (goals.length ? goals.map(g => "<p><b>" + esc(g.goal) + "</b> (" + esc(g.status) + ")<br>" + esc(g.plan || "") + "</p>").join("") : "<p>No goal yet.</p>")
    + "<h2>NGG Leadership Index</h2>" + (sc.cur || sc.prev ? "<table><tr><th>Skill</th><th>This month</th><th>Last month</th></tr>" + sk.map((s, i) => "<tr><td>" + esc(s[0]) + "</td><td>" + (sc.cur ? sc.cur[i] : "–") + "</td><td>" + (sc.prev ? sc.prev[i] : "–") + "</td></tr>").join("") + "</table>" : "<p>Not scored yet.</p>")
    + "<div class='pb'></div><h2>Over the last 8 Saturdays</h2><table>" + ((d.progress && d.progress.items) || []).map(o => "<tr><td>" + esc(o.label) + "</td><td>" + o.series.map(x => x == null ? "–" : x + "%").join(" · ") + "</td></tr>").join("") + "</table>"
    + "<p style='margin-top:32px;color:#6b6b72'>Private journal entries are never included in this report.</p><script>print()<\/script>");
  w.document.close();
}
