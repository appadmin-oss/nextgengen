/* ============================================================================
   Mentor Portal v14 — Goals, Sessions (and Log a session), Messages, Pod growth.
   ========================================================================== */

/* ── Goals ──────────────────────────────────────────────────────────────── */
function MpGoals(props) {
  const { go, phone, centre, say } = props;
  const r = useMp(() => NGGApi.member.mentorView("goals", { centre }), [centre]);
  const [f, setF] = React.useState(["active", "stalled", "none", "achieved", "draft"].indexOf(props.filter) >= 0 ? props.filter : "active");
  const [area, setArea] = React.useState("");
  const [pick, setPick] = React.useState("");
  const d = r.data || { goals: [], noGoal: [], mentees: [] };
  const term = (() => { const t = mpDay(d.today || new Date().toISOString()); const m = t.getUTCMonth(); return t.getUTCFullYear() + "-" + String(m < 4 ? 1 : m < 8 ? 5 : 9).padStart(2, "0"); })();
  const groups = {
    active: d.goals.filter(g => g.status === "active"),
    stalled: d.goals.filter(g => g.stalled),
    none: d.noGoal,
    achieved: d.goals.filter(g => g.status === "achieved" && String(g.closedOn || "") >= term),
    draft: d.goals.filter(g => g.status === "draft" || g.status === "paused"),
  };
  const stats = [["active", "Active", "One per mentee"], ["stalled", "Stalled", "Needs a check-in"], ["none", "No goal yet", "Set one after week 3"], ["achieved", "Achieved", "This term"], ["draft", "Draft or paused", "Not live yet"]];
  let rows = f === "none" ? groups.none : groups[f].filter(g => !area || g.area === area);
  if (f !== "none") rows = rows.slice().sort((a, b) => (b.stalled - a.stalled) || String(a.lastCheckAt || "").localeCompare(String(b.lastCheckAt || "")));
  const startFor = id => { setPick(""); const m = d.mentees.find(x => x.id === id);
    NGGApi.member.mentorGoal(id, { goal: "" }).then(() => { say("Draft goal started for " + mpFirst(m && m.name)); go({ screen: "mentee", id, tab: "goals" }); }, e => say(mpErr(e), { bad: true })); };
  const empty = f === "stalled" ? "No goals have stalled. Every active goal has moved recently." : f === "none" ? "Every mentee has an active goal." : "No goals here yet.";
  return <>
    <MpHead sub="Every mentee’s goal, how close they are, and when it was last checked" title="Goals" phone={phone}/>
    <div className="mp-field" style={{ maxWidth: 420 }}><label className="mp-lab" htmlFor="mp-goal-for">Start a goal for</label>
      <MpPicker id="mp-goal-for" mentees={d.mentees} value={pick} onChange={id => id && startFor(id)} label="Start a goal for"/></div>
    <div className="mp-stats">{stats.map(([k, l, s]) => <button key={k} className="mp-stat" aria-pressed={f === k} onClick={() => setF(k)}>
      <b className={k === "stalled" && groups.stalled.length ? "is-warn" : ""}>{r.data ? groups[k].length : "–"}</b><span>{l}</span><em>{s}</em></button>)}</div>
    <section className="mp-card is-clip">
      <div className="mp-listbar">{f !== "none" && <select className="mp-select is-sm" style={{ width: "auto" }} value={area} onChange={e => setArea(e.target.value)} aria-label="Area"><option value="">All areas</option>{MP_AREAS.map(a => <option key={a}>{a}</option>)}</select>}
        <span style={{ flex: 1 }}/><span className="mp-meta" aria-live="polite">{f === "none" ? mpPlural(rows.length, "mentee") : mpPlural(rows.length, "goal")}</span></div>
      <MpLoad r={r} what="goals" rows={5}>{() => !rows.length ? <MpEmpty title={empty}/> : <div className="mp-scroll"><table className="mp-table">
        <thead><tr><th scope="col">Mentee</th><th scope="col">Goal</th><th scope="col">How close</th><th scope="col" className="mp-hide-narrow">Last check-in</th><th scope="col" className="mp-hide-narrow">Review by</th><th scope="col">Status</th></tr></thead>
        <tbody>{f === "none" ? rows.map(m => <tr key={m.subjectId}><td><button className="mp-who" onClick={() => go({ screen: "mentee", id: m.subjectId, tab: "goals" })}><span className="mp-av">{m.initials}</span><span><b>{m.name}</b><em>{m.phase + (m.week ? " · week " + m.week : "")}</em></span></button></td>
            <td colSpan={4} className="mp-meta">{m.phase === "Connect" && m.week < 3 ? "Wait until week 3" : "No active goal"}</td>
            <td><button className="mp-pill is-ink" style={{ border: 0, cursor: "pointer", height: 32 }} onClick={() => startFor(m.subjectId)}>Set a goal</button></td></tr>)
          : rows.map(g => { const late = g.lastCheckAt && mpDaysAgo(g.lastCheckAt, d.today) > 21; return <tr key={g.id}>
            <td><button className="mp-who" onClick={() => go({ screen: "mentee", id: g.subjectId, tab: "goals" })}><span className="mp-av">{g.initials}</span><span><b>{g.name}</b><em>{g.area}</em></span></button></td>
            <td>{g.title || "Untitled draft"}</td>
            <td style={{ whiteSpace: "nowrap" }}><MpSegs n={g.progress} state={g.status === "achieved" ? "done" : g.stalled ? "stalled" : ""}/> <span className="mp-meta">{g.progress + " of 5"}</span></td>
            <td className={"mp-hide-narrow" + (late || (!g.lastCheckAt && g.status === "active") ? " mp-late" : "")}>{g.lastCheckAt ? mpAgo(g.lastCheckAt, d.today) : "Not yet"}</td>
            <td className="mp-hide-narrow">{g.reviewBy ? mpShort(g.reviewBy) : "–"}</td>
            <td><MpPill p={{ label: g.stalled ? "Stalled" : g.status[0].toUpperCase() + g.status.slice(1), tone: g.status === "achieved" ? "ok" : g.stalled ? "warn" : g.status === "active" ? "ink" : "neu" }}/></td></tr>; })}</tbody></table></div>}</MpLoad>
    </section>
    <p className="mp-note">One active goal per mentee. A goal is stalled when there’s no check-in for 3 weeks, or no movement across the last three check-ins.</p>
  </>;
}

/* ── Sessions ───────────────────────────────────────────────────────────── */
const MP_KIND_LABEL = { "one-to-one": "One-to-one", pod: "Pod session", family: "Family", phone: "Phone or message", note: "Note" };
function MpSessions(props) {
  const { phone, centre, say, today, role } = props;
  const r = useMp(() => NGGApi.member.mentorSessions(centre), [centre]);
  const gr = useMp(() => NGGApi.member.mentorView("goals", { centre }), [centre]);
  const [chip, setChip] = React.useState("all");
  const [open, setOpen] = React.useState(!!props.subject);
  const [hidden, setHidden] = React.useState([]);
  const d = r.data;
  const del = s => {
    setHidden(h => h.concat(s.id));
    say("Session deleted", { undo: () => setHidden(h => h.filter(x => x !== s.id)), commit: () => NGGApi.member.mentorSessionDelete(s.id).then(() => r.reload(), e => { setHidden(h => h.filter(x => x !== s.id)); say(mpErr(e), { bad: true }); }) });
  };
  const list = ((d && d.sessions) || []).filter(s => hidden.indexOf(s.id) < 0 && (chip === "all" || (chip === "family" ? (s.kind === "family" || s.kind === "phone") : s.kind === chip)));
  const weeks = [];
  list.forEach(s => { const t = mpDay(s.metOn); const mon = new Date(t); mon.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); const k = mon.toISOString().slice(0, 10);
    let w = weeks.find(x => x.k === k); if (!w) { w = { k, rows: [] }; weeks.push(w); } w.rows.push(s); });
  const st = (d && d.stats) || {};
  return <>
    <MpHead sub="Every one-to-one, pod session and family contact you’ve logged" title="Sessions" phone={phone}/>
    <div className="mp-stats">
      <div className="mp-stat"><b className={st.seenPct < 80 ? "is-warn" : ""}>{d ? st.seenPct + "%" : "–"}</b><span>Seen in the last 2 weeks</span><em>{d ? st.seen + " of " + mpPlural(st.of, "mentee") : ""}</em></div>
      <div className="mp-stat"><b>{d ? st.oneToOnes : "–"}</b><span>One-to-ones</span></div>
      <div className="mp-stat"><b>{d ? st.pod : "–"}</b><span>Pod sessions</span></div>
      {role !== "peer" && <div className="mp-stat"><b>{d ? st.family : "–"}</b><span>Family contacts</span></div>}
    </div>
    <div className="mp-actions"><div className="mp-chips" role="group" aria-label="Type" style={{ flex: 1 }}>{[["all", "All"], ["one-to-one", "One-to-one"], ["pod", "Pod session"], ["family", "Family"]].filter(([k]) => !(role === "peer" && k === "family"))
      .map(([k, l]) => <button key={k} className="mp-chip" aria-pressed={chip === k} onClick={() => setChip(k)}>{l}</button>)}</div>
      {!open && <button className="mp-btn is-ink" onClick={() => setOpen(true)}><i className="ph ph-plus" aria-hidden="true"/>Log a session</button>}</div>
    {open && <MpLogSession {...props} goalsData={gr.data} onDone={() => { setOpen(false); r.reload(); gr.reload(); props.refreshWeek(); }} onCancel={() => setOpen(false)}/>}
    <section className="mp-card is-clip"><MpLoad r={r} what="sessions" rows={5}>{() => !weeks.length ? <MpEmpty title="No sessions logged yet." body="Log a one-to-one, a pod session or a family contact and it appears here, grouped by week."/>
      : weeks.map(w => <React.Fragment key={w.k}>
        <div className="mp-wkhead"><b>{"Week of " + mpDate(w.k)}</b><span className="mp-meta">{mpPlural(w.rows.length, "session") + " · " + w.rows.reduce((a, s) => a + (+s.minutes || 0), 0) + " min"}</span></div>
        {w.rows.map(s => <div key={s.id} className="mp-sess"><span>{mpShort(s.metOn)}</span><div>
          <em>{(MP_KIND_LABEL[s.kind] || s.kind) + (+s.minutes ? " · " + s.minutes + " min" : "") + " · " + (s.fullName || "")}</em>
          <span>{s.discussed}</span>{s.goalTitle && <span className="is-goal">{"Goal: " + s.goalTitle}</span>}{s.agreed && <span className="is-next">{"Next: " + s.agreed}</span>}</div>
          <button className="mp-icon" aria-label="Delete this session" onClick={() => del(s)}><i className="ph ph-trash"/></button></div>)}
      </React.Fragment>)}</MpLoad></section>
  </>;
}

/** Log a session — the panel on Sessions; a mentee's "Log a session" opens it prefilled. */
function MpLogSession(props) {
  const { say, today, role, goalsData, onDone, onCancel, subject } = props;
  const ms = (goalsData && goalsData.mentees) || [];
  const goals = (goalsData && goalsData.goals) || [];
  const peer = role === "peer";
  const [type, setType] = React.useState("One-to-one");
  const [who, setWho] = React.useState(subject || "");
  const [date, setDate] = React.useState(today || new Date().toISOString().slice(0, 10));
  const [mins, setMins] = React.useState(20);
  const [goalId, setGoalId] = React.useState(0);
  const [prog, setProg] = React.useState(null);
  const [what, setWhat] = React.useState("");
  const [next, setNext] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [hint, setHint] = React.useState("");
  const theirGoals = goals.filter(g => g.subjectId === who && (g.status === "active" || g.status === "draft"));
  React.useEffect(() => { const a = theirGoals.find(g => g.status === "active"); setGoalId(a ? a.id : 0); setProg(null); }, [who, goalsData]);
  React.useEffect(() => { if (type === "Pod session") setMins(90); }, [type]);
  const types = ["One-to-one", "Pod session", "Family", "Phone or message"].filter(t => !(peer && t === "Family"));
  const save = () => {
    if (type !== "Pod session" && !who) { setHint("Choose a mentee first."); return; }
    if (what.trim().length <= 3) { setHint("Say what you did and what they said."); return; }
    setHint(""); setBusy(true);
    const body = { type, subjectId: who, date, minutes: mins, what, next, goalId: goalId || 0, progress: goalId ? (prog || 0) : 0 };
    const name = mpFirst((ms.find(m => m.id === who) || {}).name);
    mpSend("session", body, "Session note").then(() => {
      say(type === "One-to-one" ? "Session saved. " + name + " is no longer overdue." : "Session saved."); onDone();
    }, e => {
      if (e && e.queued) { say("Saved on this device. It sends itself when you’re back online."); onDone(); }
      else say(mpErr(e), { bad: true });
    }).finally(() => setBusy(false));
  };
  return <section className="mp-card is-pad mp-log" aria-labelledby="mp-log-h">
    <h2 id="mp-log-h" className="mp-h2">Log a session</h2>
    <div className="mp-chips is-wrap" role="radiogroup" aria-label="Type">{types.map(t => <button key={t} className="mp-chip" role="radio" aria-checked={type === t} onClick={() => setType(t)}>{t}</button>)}</div>
    <div className="mp-form-grid">
      {type === "Pod session" ? <div className="mp-field"><span className="mp-lab">Mentees</span><span className="mp-meta" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{"Whole pod · " + mpPlural(ms.length, "mentee")}</span></div>
        : <div className="mp-field"><label className="mp-lab" htmlFor="mp-log-who">Mentee</label><MpPicker id="mp-log-who" mentees={ms} value={who} onChange={setWho} label="Mentee"/></div>}
      <label className="mp-field"><span className="mp-lab">Date</span><input className="mp-input" type="date" value={date} max={today} onChange={e => setDate(e.target.value)}/></label>
      <label className="mp-field"><span className="mp-lab">Length</span><select className="mp-select" value={mins} onChange={e => setMins(+e.target.value)}>{[10, 15, 20, 30, 45, 60, 90].map(n => <option key={n} value={n}>{n + " minutes"}</option>)}</select></label>
      {type !== "Pod session" && who && <label className="mp-field is-span"><span className="mp-lab">Goal discussed</span>
        <select className="mp-select" value={goalId} onChange={e => { setGoalId(+e.target.value); setProg(null); }}><option value={0}>Not this time</option>{theirGoals.map(g => <option key={g.id} value={g.id}>{(g.title || "Untitled draft") + (g.status === "draft" ? " (draft)" : "")}</option>)}</select></label>}
      {goalId > 0 && <div className="mp-field is-span"><span className="mp-lab">How close are they to the goal now?</span><MpScale value={prog} onChange={setProg} n={5} label="How close are they to the goal now?"/>
        <span className="mp-help">1 = just starting · 5 = done. Adds a check-in to the goal.</span></div>}
      <label className="mp-field is-span"><span className="mp-lab">What you did and what they said</span><textarea className="mp-text" rows={4} value={what} onChange={e => setWhat(e.target.value)}/></label>
      <label className="mp-field is-span"><span className="mp-lab">Next step</span><input className="mp-input" value={next} onChange={e => setNext(e.target.value)} placeholder="What you agreed for next time"/></label>
    </div>
    <div className="mp-actions"><button className="mp-btn is-ink" onClick={save} disabled={busy}>Save session</button><button className="mp-btn" onClick={onCancel}>Cancel</button>
      {hint && <span className="mp-warnline" role="alert">{hint}</span>}</div>
    {peer && <span className="mp-help">Your session notes are shared with your lead mentor.</span>}
    <span className="mp-help">Worried about safety? Use Report a concern, not a session note.</span>
  </section>;
}

/* ── Messages ───────────────────────────────────────────────────────────── */
function MpMessages(props) {
  const { phone, width, say, role, refreshWeek } = props;
  const r = useMp(() => NGGApi.member.mentorMessages(), []);
  const [f, setF] = React.useState("all");
  const [openId, setOpen] = React.useState("");
  const [reply, setReply] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const two = width >= 1000;
  const all = (r.data && r.data.messages) || [];
  const list = all.filter(m => f === "all" || m.filter === f);
  const cur = all.find(m => m.id === openId) || (two ? list[0] : null);
  const markRead = m => { if (!m || m.read) return; m.read = true; NGGApi.member.mentorAct("messageRead", { threadId: m.id.indexOf("m:") === 0 ? m.id : m.threadId }).then(() => refreshWeek(), () => {}); };
  React.useEffect(() => { if (cur) markRead(cur); setReply(""); }, [cur && cur.id]);
  const send = () => {
    if (!reply.trim()) { say("Write a reply first", { bad: true }); return; }
    setBusy(true);
    NGGApi.member.mentorAct("messageReply", { threadId: cur.threadId, subjectId: cur.subjectId, body: reply }).then(res => {
      say(res && res.queued ? "Saved. It sends at 8am." : "Reply sent."); setReply(""); r.reload();
    }, e => say(mpErr(e), { bad: true })).finally(() => setBusy(false));
  };
  const filters = [["all", "All"], ["journal", "Journal"], ["checkin", "Check-ins"], ["family", "Families"], ["lead", "Your lead"]].filter(([k]) => !(role === "peer" && k === "family"));
  const inbox = <section className="mp-card is-clip" aria-label="Inbox">
    <MpLoad r={r} what="messages" rows={5}>{() => !list.length ? <MpEmpty title="Nothing here. You’re up to date."/> : list.map(m => <button key={m.id} className="mp-msg" aria-current={cur && cur.id === m.id} onClick={() => setOpen(m.id)}>
      <span className={"mp-unread" + (m.read ? " is-read" : "")} aria-label={m.read ? undefined : "Unread"}/>
      <span><b>{m.from}<em>{mpAgo(m.at)}</em></b><span>{m.kind}</span><p>{m.body}</p></span></button>)}</MpLoad></section>;
  const detail = cur && <section className="mp-card is-pad" aria-label="Message">
    {!two && <button className="mp-back" onClick={() => setOpen("")} style={{ alignSelf: "flex-start" }}><i className="ph ph-caret-left" aria-hidden="true"/>All messages</button>}
    <span className="mp-meta">{cur.kind + " · " + mpDate(cur.at, { weekday: "short", day: "numeric", month: "short" })}</span>
    <b style={{ fontSize: 17 }}>{cur.from}</b>
    <p className="mp-msg-body">{cur.body}</p>
    {(cur.replies || []).map((x, i) => <div key={i} className="mp-reply"><span className="mp-meta">{"You · " + mpShort(x.createdAt) + (x.status === "queued" ? " · sends at 8am" : "")}</span><div>{x.body}</div></div>)}
    <>
      <textarea className="mp-text" rows={3} value={reply} onChange={e => setReply(e.target.value)} aria-label="Reply" placeholder={cur.filter === "journal" ? "Name what you noticed. One line is enough." : "Write a reply"}/>
      <div className="mp-actions"><button className="mp-btn is-ink" onClick={send} disabled={busy}>Reply</button><span className="mp-help">Messages send between 8am and 8pm and are kept on record.</span></div></>
  </section>;
  return <>
    <MpHead sub="Journal entries shared with you, check-ins and family replies" title="Messages" phone={phone}/>
    <div className="mp-chips" role="group" aria-label="Filter">{filters.map(([k, l]) => <button key={k} className="mp-chip" aria-pressed={f === k} onClick={() => { setF(k); setOpen(""); }}>{l}</button>)}</div>
    {two ? <div className="mp-two is-msgs">{inbox}{detail || <section className="mp-card"><MpEmpty title="Choose a message to read it."/></section>}</div> : (openId && cur ? detail : inbox)}
  </>;
}

/* ── Pod growth ─────────────────────────────────────────────────────────── */
function MpGrowth(props) {
  const { phone, centre, go } = props;
  const r = useMp(() => NGGApi.member.mentorIndex(centre, ""), [centre]);
  const [allBy, setAllBy] = React.useState(false);
  return <>
    <MpHead sub="How your mentees are growing, month by month" title="Pod growth" phone={phone}/>
    <MpLoad r={r} what="pod growth" rows={6}>{d => {
      const by = d.byMentee || []; const shown = allBy ? by : by.slice(0, 8);
      return <>
        <section className="mp-card is-clip" aria-labelledby="mp-ix-h">
          <div className="mp-card-head"><h2 id="mp-ix-h">Leadership Index · average across your mentees</h2><span>{"out of 10 · change since " + mpMonthName(d.prevMonth) + " · " + d.scored + " of " + d.of + " scored for " + mpMonthName(d.month)}</span></div>
          {d.scored === 0 ? <MpEmpty title={"Nobody is scored for " + mpMonthName(d.month) + " yet."} body="Open a mentee’s Scorecard tab to score them for the month."/> :
            d.skills.map(s => <div key={s.skill} className="mp-sc-row" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(80px,200px) 44px 56px" }}>
              <span className="mp-sc-name"><b>{s.skill}</b></span>
              <span className="mp-prog" style={{ height: 8 }}><i style={{ width: ((s.avg || 0) * 10) + "%", background: s.avg != null && s.avg < 5 ? "var(--mt-amber)" : "var(--mt-ink)" }}/></span>
              <b className="mp-num">{s.avg == null ? "–" : s.avg.toFixed(1)}</b>
              <span className={"mp-delta " + (s.change == null || s.change === 0 ? "is-flat" : s.change > 0 ? "is-up" : "is-down")}>{s.change == null ? "–" : (s.change > 0 ? "+" : s.change < 0 ? "−" : "") + Math.abs(s.change).toFixed(1)}</span></div>)}
        </section>
        {by.length > 0 && <section className="mp-card is-clip" aria-label="By mentee"><div className="mp-card-head"><h2>By mentee</h2><span>Lowest total first</span></div>
          {shown.map(b => <button key={b.subjectId} className="mp-row" style={{ minHeight: 56 }} onClick={() => go({ screen: "mentee", id: b.subjectId, tab: "scorecard" })}>
            <span className="mp-av">{b.initials}</span><span className="mp-row-t"><b>{b.name}</b></span>
            <span className="mp-meta mp-hide-narrow">{"Lowest: " + b.lowSkill}</span><b className="mp-num">{b.total + " / 100"}</b>
            <span className={"mp-delta " + (b.prevTotal == null || b.total === b.prevTotal ? "is-flat" : b.total > b.prevTotal ? "is-up" : "is-down")} style={{ minWidth: 40 }}>{b.prevTotal == null ? "–" : (b.total >= b.prevTotal ? "+" : "−") + Math.abs(b.total - b.prevTotal)}</span></button>)}
          {by.length > 8 && !allBy && <button className="mp-more" onClick={() => setAllBy(true)}>{"Show all " + by.length}</button>}</section>}
        <div className="mp-two is-wide2">{((d.outcomes && d.outcomes.items) || []).map(o => { const v = o.series.filter(x => x != null);
          return <section key={o.key} className="mp-card is-pad"><h3 className="mp-h2">{o.label}</h3>
            <div className="mp-bars is-56" aria-label={o.label + ": " + o.series.map(x => x == null ? "no data" : x + "%").join(", ")}>{o.series.map((x, i) => <i key={i} className={i === o.series.length - 1 ? "is-last" : ""} style={{ height: (x == null ? 0 : Math.max(4, x)) + "%" }}/>)}</div>
            <span className="mp-help">{o.source + (v.length ? " · " + v[v.length - 1] + "% now" : " · nothing recorded yet")}</span></section>; })}</div>
        <section className="mp-card is-pad"><p className="mp-note">Averages across your mentees over the last 8 Saturdays, from observations, weekly reviews, check-ins and relationship checks.</p>
          <div><button className="mp-btn" onClick={() => window.print()}><i className="ph ph-file-pdf" aria-hidden="true"/>Make a report</button></div></section>
      </>;
    }}</MpLoad>
  </>;
}
