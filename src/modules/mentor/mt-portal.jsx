/* ============================================================================
   Mentor Portal — Anchor Pods (design handoff v5, MENTOR_PORTAL.md; prefix mt-)

   /mentor opens here for a mentor with an NGG mentor record. Everyone else —
   admins, instructors, Summer School mentors — gets the class roster
   (MentorPortal in page-other.jsx), and so does /mentor?view=class. The URL
   is the state; nothing is set before navigation and read after it.

   What the server holds, not this page:
     • an uncleared mentor (screening, the 13 Academy modules, the signed
       Commitment Policy) receives no mentee data at all;
     • a mentee outside the mentor's pod is a 403;
     • goal tools are refused in the first six weeks (R5);
     • a rating above "Not seen" without evidence is refused;
     • a safeguarding report cannot be edited after it is sent.
   The page mirrors those rules so nobody is invited to press a button the
   server will refuse.
   ========================================================================== */

const MT_LEVELS = ["Not seen", "Emerging", "Demonstrated", "Exemplary"];
const MT_PHASE = { match: "Match", connect: "Connect", grow: "Grow", lead: "Lead", close: "Close" };
const MT_TASK = { one_to_one: "One-to-one", goal_check: "Goal check", parent_summary: "Summary to the parent", relationship_check: "Relationship check", closure: "Closure conversation" };
const MT_NAV = [
  ["today", "Today", "sun-horizon"], ["pod", "My pod", "users-three"], ["observe", "Saturday", "binoculars"], ["reviews", "Reviews", "clipboard-text"],
  ["checkin", "Check-ins", "chats-circle"], ["academy", "Academy", "graduation-cap"], ["commit", "Commitments", "handshake"], ["support", "Support", "lifebuoy"],
];
const MT_PHONE_TABS = ["today", "pod", "observe", "reviews", "checkin"];
const MT_CONCERN_CATS = ["Something a young person told me", "Signs of harm or neglect", "Bullying", "Emotional wellbeing", "Online safety", "Conduct of an adult", "Relationship concern", "Something else"];
const MT_RELQ = ["We get on well", "Our time together is useful", "They listen to me / I listen to them", "I want to keep going"];

function mtPod(view, id) { return NGGApi.member.pod.read(view, id); }
function mtAct(action, body) { return NGGApi.member.pod.act(action, body); }
function mtErr(e, fb) { const c = (e && (e.code || e.message)) || ""; return ({ evidence_required: "Add evidence for each rating above Not seen.", not_in_pod: "That mentee is not in your pod.", goals_locked_connect: "Goals start after the first six weeks.", too_short: "Say a little more about what happened.", sign_with_your_name: "Sign with your full name." })[c] || fb || "Something went wrong. Try again."; }
function mtDate(d) { if (!d) return ""; const t = new Date(String(d).slice(0, 10) + "T12:00:00Z"); return isNaN(t) ? String(d) : t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function mtFirst(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
function mtUsePhone() {
  const q = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 759px)").matches;
  const [p, setP] = React.useState(q);
  React.useEffect(() => { if (!window.matchMedia) return; const m = window.matchMedia("(max-width: 759px)"); const f = () => setP(m.matches); m.addEventListener ? m.addEventListener("change", f) : m.addListener(f); return () => m.removeEventListener ? m.removeEventListener("change", f) : m.removeListener(f); }, []);
  return p;
}

/** /mentor: the pod portal for a pod mentor; the class roster for everyone else. */
function MentorHome() {
  const auth = (window.useAuth || (() => null))();
  const classView = typeof location !== "undefined" && new URLSearchParams(location.search).get("view") === "class";
  const [probe, setProbe] = React.useState(classView ? "class" : "loading");
  const [today, setToday] = React.useState(null);
  const load = React.useCallback(() => {
    if (classView) return;
    /* Anything but a real pod reply — signed out, not a mentor, a Summer
       School mentor, an older API — opens the class roster, which says why. */
    let p;
    try { p = mtPod("today"); } catch (e) { setProbe("class"); return; }
    /* Staff who also hold a mentor record keep the class roster until they are
       cleared: their reach comes from their role, and locking them on the
       Academy checklist took their class away overnight. */
    Promise.resolve(p).then(r => {
      if (r && r.mentor && r.clearance && (r.cleared || r.role !== "admin")) { setToday(r); setProbe("pod"); }
      else setProbe("class");
    })
      .catch(() => setProbe("class"));
  }, [classView]);
  React.useEffect(() => { load(); }, [load, auth && auth.isSignedIn]);
  if (probe === "loading") return <div className="mt-app"><div className="mt-boot"><div className="dash-spinner"/></div></div>;
  if (probe === "class") return <MentorPortal/>;
  return <MtPortal initial={today} reloadToday={() => mtPod("today").then(setToday)}/>;
}

function MtPortal({ initial, reloadToday }) {
  const phone = mtUsePhone();
  const [d, setD] = React.useState(initial);
  const [screen, setScreen] = React.useState(() => { const u = new URLSearchParams(location.search), s = u.get("s"); return MT_NAV.some(n => n[0] === s) || s === "concern" || (s === "case" && u.get("m")) ? s : "today"; });
  const [caseId, setCaseId] = React.useState(() => new URLSearchParams(location.search).get("m") || "");
  const [toast, setToast] = React.useState(null);
  const [help, setHelp] = React.useState(false);
  const searchRef = React.useRef(null);
  const refresh = React.useCallback(() => mtPod("today").then(setD).catch(() => {}), []);
  const say = (t, bad) => { setToast({ t, bad }); clearTimeout(say._t); say._t = setTimeout(() => setToast(null), 4000); };
  /* The URL carries the screen and the open mentee, so a refresh or a shared
     link lands on the same place. */
  const go = (s, m) => {
    setScreen(s); setCaseId(m || "");
    const q = new URLSearchParams(); if (s !== "today") q.set("s", s); if (m) q.set("m", m);
    history.replaceState(null, "", "/mentor" + (q.toString() ? "?" + q : ""));
    window.scrollTo && window.scrollTo(0, 0);
  };
  const cleared = !!(d && d.cleared);
  const pod = (d && d.pod) || [];
  React.useEffect(() => {
    const onKey = e => {
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "/") { e.preventDefault(); if (screen !== "pod") go("pod"); setTimeout(() => searchRef.current && searchRef.current.focus(), 30); }
      else if (e.key === "?") setHelp(h => !h);
      else if (e.key === "Escape") { if (help) setHelp(false); else if (caseId) go("pod"); }
      else if (caseId && (e.key === "j" || e.key === "k")) {
        const i = pod.findIndex(p => p.memberId === caseId); const n = pod[(i + (e.key === "j" ? 1 : -1) + pod.length) % pod.length];
        if (n) go("case", n.memberId);
      }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [screen, caseId, pod, help]);

  const me = (d && d.mentor) || {};
  const cl = (d && d.clearance) || {};
  const allowed = cleared ? MT_NAV : MT_NAV.filter(n => ["academy", "commit", "support"].indexOf(n[0]) >= 0);
  let body;
  if (screen === "concern") body = <MtConcern pod={pod} say={say}/>;
  else if (!cleared && ["academy", "commit", "support"].indexOf(screen) < 0) body = <MtGate d={d} go={go}/>;
  else if (screen === "case" && caseId) body = <MtCase id={caseId} go={go} say={say} refresh={refresh} pod={pod}/>;
  else if (screen === "pod") body = <MtPodList pod={pod} go={go} searchRef={searchRef} say={say}/>;
  else if (screen === "observe") body = <MtObserve pod={pod} d={d} say={say} refresh={refresh}/>;
  else if (screen === "reviews") body = <MtReviews pod={pod} say={say} refresh={refresh}/>;
  else if (screen === "checkin") body = <MtCheckin say={say}/>;
  else if (screen === "academy") body = <MtAcademy say={say} onCleared={refresh}/>;
  else if (screen === "commit") body = <MtCommit say={say} onSigned={refresh}/>;
  else if (screen === "support") body = <MtSupport go={go}/>;
  else body = <MtToday d={d} go={go} say={say} refresh={refresh}/>;

  const title = screen === "case" ? "Mentee" : screen === "concern" ? "Report a concern" : ((MT_NAV.find(n => n[0] === screen) || MT_NAV[0])[1]);
  return (
    <div className="mt-app">
      {!phone && <aside className="mt-side" aria-label="Mentor portal">
        <div className="mt-brand"><b>Mentor portal</b><span>Mentor · {me.centre || "NGG"}</span></div>
        <nav className="mt-nav">
          {allowed.map(([id, l, ic]) => <button key={id} className={"mt-nav-i" + (screen === id || (id === "pod" && screen === "case") ? " is-on" : "")} aria-current={screen === id ? "page" : undefined} onClick={() => go(id)}>
            <i className={"ph ph-" + ic} aria-hidden="true"/><span>{l}</span>
            {id === "academy" && cl.modulesRequired > cl.modulesDone ? <em className="mt-badge">{cl.modulesRequired - cl.modulesDone}</em> : null}
          </button>)}
        </nav>
        <button className="mt-concern" onClick={() => go("concern")}><i className="ph ph-warning-octagon" aria-hidden="true"/>Report a concern</button>
        <div className="mt-me"><span className="mt-av">{(me.fullName || "?").split(/\s+/).slice(0, 2).map(w => w[0]).join("")}</span>
          <span><b>{me.fullName}</b><em className={cleared ? "is-ok" : ""}>Academy {cl.modulesDone || 0}/{cl.modulesRequired || 13}{cleared ? " · cleared" : ""}</em></span></div>
        <a className="mt-switch" href="/mentor?view=class">Open the class roster</a>
      </aside>}
      <main className="mt-main">
        {phone && <header className="mt-ph-head">
          {(screen === "case" || screen === "concern" || screen === "support") ? <button className="mt-icon" aria-label="Back" onClick={() => go(screen === "case" ? "pod" : "today")}><i className="ph ph-caret-left"/></button> : <span className="mt-icon-sp"/>}
          <b>{title}</b>
          <button className="mt-icon" aria-label="Support" onClick={() => go("support")}><i className="ph ph-lifebuoy"/></button>
          <button className="mt-icon is-red" aria-label="Report a concern" onClick={() => go("concern")}><i className="ph ph-warning-octagon"/></button>
        </header>}
        <div className="mt-body">{body}</div>
        {phone && cleared && <nav className="mt-tabbar" aria-label="Sections">
          {MT_PHONE_TABS.map(id => { const n = MT_NAV.find(x => x[0] === id); return <button key={id} className={screen === id || (id === "pod" && screen === "case") ? "is-on" : ""} onClick={() => go(id)}><i className={"ph ph-" + n[2]} aria-hidden="true"/><span>{n[1] === "My pod" ? "Pod" : n[1]}</span></button>; })}
        </nav>}
      </main>
      {toast && <div className={"mt-toast" + (toast.bad ? " is-bad" : "")} role="status" aria-live="polite">{toast.t}</div>}
      {help && <div className="mt-sheet" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setHelp(false)}><div className="mt-card" onClick={e => e.stopPropagation()}>
        <h2>Keyboard</h2><p className="mt-mono">/ search your pod · ? this sheet · J / K next or previous mentee · Esc back</p>
        <button className="mt-btn" onClick={() => setHelp(false)}>Close</button></div></div>}
    </div>
  );
}

/* ── Clearance gate ─────────────────────────────────────────────────────── */
function MtGate({ d, go }) {
  const c = (d && d.clearance) || {};
  const step = (ok, t, s, act) => <li className={"mt-step" + (ok ? " is-done" : "")}><i className={ok ? "ph-fill ph-check-circle" : "ph ph-circle"} aria-hidden="true"/><span><b>{t}</b><em>{s}</em></span>{!ok && act}</li>;
  return <section>
    <h1 className="mt-h1">Before you meet your pod</h1>
    <p className="mt-lead">No one reaches a young person before screening, the Mentor Academy and the Commitment Policy are complete. You can still report a concern at any time.</p>
    <ul className="mt-steps">
      {step(c.screened, "Screening", c.screened ? "Cleared" : "Your coordinator records this once your checks are back.")}
      {step((c.modulesDone || 0) >= (c.modulesRequired || 13), "Mentor Academy", (c.modulesDone || 0) + " of " + (c.modulesRequired || 13) + " modules", <button className="mt-btn is-primary" onClick={() => go("academy")}>Open the Academy</button>)}
      {step(c.policy, "Commitment Policy", c.policy ? "Signed" : "Read and sign the NGGC Mentorship Commitment & Conduct Policy.", <button className="mt-btn" onClick={() => go("commit")}>Read and sign</button>)}
    </ul>
    <div className="mt-card"><h2>Your class in the meantime</h2><p>Until you are cleared for a pod, your class works as it did before.</p>
      <a className="mt-btn is-primary mt-btn-link" href="/mentor?view=class">Open my class</a></div>
  </section>;
}

/* ── Today ──────────────────────────────────────────────────────────────── */
function MtToday({ d, go, say, refresh }) {
  const c = d.counters || {};
  const me = d.mentor || {};
  const hour = new Date().getHours();
  const done = async (fn, msg) => { try { await fn(); say(msg); refresh(); } catch (e) { say(mtErr(e), true); } };
  return <section>
    <p className="mt-sub">{mtDate(new Date().toISOString())} · pod of {d.podSize}{d.podSize < d.podMin ? " (the policy asks for at least " + d.podMin + ")" : ""}</p>
    <h1 className="mt-h1">{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {mtFirst(me.fullName)}</h1>
    <div className="mt-counters" role="status" aria-live="polite">
      <div><b>{c.here || 0}</b><span>Here today</span></div><div><b>{c.observed || 0}</b><span>Observed</span></div><div><b>{c.reviewed || 0} of {c.of || 0}</b><span>Reviewed</span></div>
    </div>
    <div className="mt-card">
      <h2>Needs you</h2>
      {(d.needsYou || []).length ? <ul className="mt-list">{d.needsYou.map(n => <li key={n.id} className={"mt-nudge is-" + n.rule}>
        <span><b>{n.title}</b><em>{n.body}</em>{n.suggestion && <blockquote>{n.suggestion}</blockquote>}</span>
        <span className="mt-row-acts">{n.memberId && <button className="mt-btn" onClick={() => go("case", n.memberId)}>Open</button>}
          <button className="mt-btn" onClick={() => done(() => mtAct("nudgeDone", { id: n.id }), "Done.")}>Done</button></span>
      </li>)}</ul> : <p className="mt-empty">Nothing needs you right now.</p>}
    </div>
    <div className="mt-card">
      <h2>One-to-ones, longest wait first</h2>
      {(d.oneToOnes || []).length ? <ul className="mt-list">{d.oneToOnes.map(o => <li key={o.memberId}>
        <span><b>{o.menteeName}</b><em>{o.lastContact ? "Last one-to-one " + mtDate(o.lastContact) + " · " + o.days + " days" : "No one-to-one yet · " + o.days + " days"}</em></span>
        {o.overdue && <span className="mt-pill is-red">21 days+</span>}
        <button className="mt-btn" onClick={() => go("case", o.memberId)}>Plan</button>
      </li>)}</ul> : <p className="mt-empty">No one in your pod yet.</p>}
    </div>
    <div className="mt-card">
      <h2>To do</h2>
      {(d.todo || []).length ? <ul className="mt-list">{d.todo.map(t => <li key={t.id}>
        <span><b>{MT_TASK[t.kind] || t.kind}{t.menteeName ? " · " + t.menteeName : ""}</b><em>Due {mtDate(t.dueOn)}</em></span>
        <button className="mt-btn" onClick={() => done(() => mtAct("taskDone", { id: t.id }), "Marked done.")}>Done</button>
      </li>)}</ul> : <p className="mt-empty">Nothing due this week.</p>}
    </div>
  </section>;
}

/* ── My pod ─────────────────────────────────────────────────────────────── */
function MtPodList({ pod, go, searchRef, say }) {
  const [q, setQ] = React.useState("");
  const list = pod.filter(p => !q || String(p.menteeName).toLowerCase().indexOf(q.toLowerCase()) >= 0);
  const star = async p => { try { await NGGApi.member.starGive(p.memberId, 1, "effort", "Pod star"); say("Star given to " + mtFirst(p.menteeName) + "."); } catch (e) { say(mtErr(e, "Couldn’t give the star."), true); } };
  return <section>
    <form role="search" onSubmit={e => e.preventDefault()}>
      <label className="mt-sr" htmlFor="mt-q">Search your pod</label>
      <input id="mt-q" ref={searchRef} className="mt-search" placeholder="Search your pod" value={q} onChange={e => setQ(e.target.value)}/>
      <span className="mt-sr" role="status">{list.length} shown</span>
    </form>
    {list.length ? <ul className="mt-pod">{list.map(p => <li key={p.memberId} className={p.here ? "is-here" : ""}>
      <button className="mt-pod-open" onClick={() => go("case", p.memberId)}>
        <b>{p.menteeName}</b><em>{MT_PHASE[p.phase]} · week {p.week} · {p.health}</em>
      </button>
      <span className="mt-pod-tags">{p.here && <span className="mt-pill is-green">Here</span>}{p.observed && <span className="mt-pill">Observed</span>}{p.reviewed && <span className="mt-pill">Reviewed</span>}</span>
      <button className="mt-icon" aria-label={"Give " + p.menteeName + " a star"} onClick={() => star(p)}><i className="ph ph-star"/></button>
    </li>)}</ul> : <p className="mt-empty">No one matches. <button className="mt-link" onClick={() => setQ("")}>Show everyone</button></p>}
  </section>;
}

/* ── Mentee case file ───────────────────────────────────────────────────── */
function MtCase({ id, go, say, refresh, pod }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [tab, setTab] = React.useState("overview");
  const [form, setForm] = React.useState(null);
  const load = React.useCallback(() => { setErr(""); mtPod("case", id).then(setD).catch(e => setErr(mtErr(e, "Couldn’t open this record."))); }, [id]);
  React.useEffect(() => { setD(null); setTab("overview"); load(); }, [load]);
  if (err) return <div className="mt-card"><p>{err}</p><button className="mt-btn" onClick={load}>Try again</button></div>;
  if (!d) return <div className="mt-boot"><div className="dash-spinner"/></div>;
  const k = d.mentee || {}, x = d.match || {};
  const age = k.dob ? Math.floor((Date.now() - new Date(k.dob)) / 31557600000) : null;
  const i = pod.findIndex(p => p.memberId === id);
  const latest = {}; (d.observations || []).forEach(o => { if (!latest[o.indicator]) latest[o.indicator] = o; });
  const tabs = [["overview", "Overview"], ["timeline", "Timeline"], ["goals", "Goals"], ["notes", "Session notes"]];
  const save1to1 = async v => {
    try { await mtAct("onetoone", Object.assign({ memberId: id }, v)); setForm(null); say("One-to-one logged."); load(); refresh(); }
    catch (e) { say(mtErr(e, "Couldn’t save."), true); }
  };
  return <section>
    <div className="mt-case-head">
      <div><h1 className="mt-h1">{k.fullName}</h1>
        <p className="mt-sub">{age !== null ? "Age " + age + " · " : ""}{MT_PHASE[x.phaseNow]} phase · week {x.week}{i >= 0 ? " · " + (i + 1) + " of " + pod.length : ""}</p></div>
      <div className="mt-row-acts"><button className="mt-btn" onClick={() => go("observe", id)}>Observe</button><button className="mt-btn is-primary" onClick={() => setForm("1to1")}>Log a one-to-one</button></div>
    </div>
    <div className="mt-tabs" role="tablist">{tabs.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "is-on" : ""} onClick={() => setTab(t)}>{l}</button>)}</div>
    {form === "1to1" && <MtOneToOne onCancel={() => setForm(null)} onSave={save1to1}/>}
    {form === "rel" && <MtRelcheck onCancel={() => setForm(null)} onSave={async a => { try { await mtAct("relcheck", { memberId: id, answers: a }); setForm(null); say("Relationship check saved."); } catch (e) { say(mtErr(e), true); } }}/>}
    {tab === "overview" && <>
      <div className="mt-card"><h2>Last 8 Saturdays</h2><div className="mt-sats">{(d.saturdays || []).slice().reverse().map(s => <span key={s.date} className={s.present ? "is-here" : ""} title={mtDate(s.date)}>{s.present ? "Present" : "Absent"}</span>)}</div></div>
      <div className="mt-card"><h2>Development indicators</h2><p className="mt-sub">Last observed · trends, not grades</p>
        <ul className="mt-ind">{(d.indicators || []).map(n => { const o = latest[n]; return <li key={n}><b>{n}</b><span className={"mt-lvl is-" + (o ? o.level : 0)}>{o ? MT_LEVELS[o.level] : "Not seen"}</span>{o && o.evidence && <em>“{o.evidence}”</em>}</li>; })}</ul></div>
      <div className="mt-card"><h2>Interested in · wants to</h2><p>{d.profile ? [d.profile.interests, d.profile.wantsTo, d.profile.supportArea].filter(Boolean).join(" · ") || "Not recorded yet." : "Not recorded yet."}</p></div>
      <div className="mt-card"><h2>Last time we talked</h2><p>{(d.meetings || [])[0] ? mtDate(d.meetings[0].metOn) + " · " + d.meetings[0].discussed + (d.meetings[0].agreed ? " · Agreed: " + d.meetings[0].agreed : "") : "No one-to-one yet."}</p>
        <button className="mt-btn" onClick={() => setForm("rel")}>Termly relationship check</button></div>
    </>}
    {tab === "timeline" && <div className="mt-card"><ul className="mt-list">
      {[].concat((d.meetings || []).map(m => ({ d: m.metOn, t: m.concern ? "Concern" : "One-to-one", s: m.discussed })), (d.observations || []).map(o => ({ d: o.onDate, t: "Observation", s: o.indicator + " · " + MT_LEVELS[o.level] + (o.evidence ? " · " + o.evidence : "") })))
        .sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 40).map((e, j) => <li key={j} className={e.t === "Concern" ? "is-concern" : ""}><span><b>{e.t}</b><em>{mtDate(e.d)} · {e.s}</em></span></li>)}
    </ul></div>}
    {tab === "goals" && (d.goalsLocked
      ? <div className="mt-card"><h2>Goals start in week 7</h2><p>The first six weeks of a match are for getting to know each other. Let them lead; goals come after.</p></div>
      : <div className="mt-card">{(d.goals || []).length ? <ul className="mt-list">{d.goals.map(g => <li key={g.id}><i className={g.status === "done" ? "ph-fill ph-check-circle is-green" : "ph ph-circle-half is-amber"} aria-hidden="true"/><span><b>{g.goal}</b><em>{g.status === "done" ? "Done " + mtDate(g.closedOn) : g.dueOn ? "By " + mtDate(g.dueOn) : "Open"}</em></span></li>)}</ul>
          : <p className="mt-empty">No goals yet. One goal at a time, with a date.</p>}</div>)}
    {tab === "notes" && <div className="mt-card">{(d.meetings || []).length ? <ul className="mt-list">{d.meetings.map(m => <li key={m.id}><span><b>{mtDate(m.metOn)}</b><em>{m.discussed}{m.agreed ? " · Agreed: " + m.agreed : ""}</em></span></li>)}</ul> : <p className="mt-empty">No session notes yet.</p>}</div>}
    <p className="mt-hint">Keyboard: J / K next or previous, ? all shortcuts</p>
  </section>;
}
function MtOneToOne({ onCancel, onSave }) {
  const [v, setV] = React.useState({ minutes: "15", where: "", discussed: "", seemed: "", agreed: "" });
  const set = k => e => setV(Object.assign({}, v, { [k]: e.target.value }));
  return <form className="mt-card mt-form" onSubmit={e => { e.preventDefault(); onSave(v); }}>
    <h2>Log a one-to-one</h2>
    <label>How long (minutes)<input type="number" min="1" max="120" value={v.minutes} onChange={set("minutes")}/></label>
    <label>Where<input value={v.where} onChange={set("where")}/></label>
    <label>What you talked about<textarea required value={v.discussed} onChange={set("discussed")}/></label>
    <label>How they seemed<input value={v.seemed} onChange={set("seemed")}/></label>
    <label>What you agreed (optional)<textarea value={v.agreed} onChange={set("agreed")}/></label>
    <div className="mt-row-acts"><button type="button" className="mt-btn" onClick={onCancel}>Cancel</button><button className="mt-btn is-primary" disabled={!v.discussed.trim()}>Save</button></div>
  </form>;
}
function MtRelcheck({ onCancel, onSave }) {
  const [a, setA] = React.useState({ q1: 0, q2: 0, q3: 0, q4: 0 });
  const ready = Object.values(a).every(x => x > 0);
  return <form className="mt-card mt-form" onSubmit={e => { e.preventDefault(); onSave(a); }}>
    <h2>Relationship check · your side</h2><p className="mt-sub">Answered separately by you, your mentee and their guardian. 1 is not at all, 5 is completely.</p>
    {MT_RELQ.map((q, i) => <fieldset key={i} className="mt-seg"><legend>{q}</legend>{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-pressed={a["q" + (i + 1)] === n} className={a["q" + (i + 1)] === n ? "is-on" : ""} onClick={() => setA(Object.assign({}, a, { ["q" + (i + 1)]: n }))}>{n}</button>)}</fieldset>)}
    <div className="mt-row-acts"><button type="button" className="mt-btn" onClick={onCancel}>Cancel</button><button className="mt-btn is-primary" disabled={!ready}>Save</button></div>
  </form>;
}

/* ── Saturday observation ───────────────────────────────────────────────── */
function MtObserve({ pod, d, say, refresh }) {
  const pre = new URLSearchParams(location.search).get("m");
  const [all, setAll] = React.useState(!!pre);
  /* Who is left is the pod minus who this screen has saved or skipped — not
     an index, because the list refreshes underneath as people are observed. */
  const [passed, setPassed] = React.useState([]);
  const pass = id => setPassed(x => x.concat(id));
  const base = (all ? pod : pod.filter(p => p.here)).filter(p => !p.observed || p.memberId === pre);
  const queue = base.filter(p => passed.indexOf(p.memberId) < 0);
  const blank = () => ({ lv: {}, ev: {}, strength: "", growth: "", nextChallenge: "" });
  const [v, setV] = React.useState(blank);
  const cur = queue[0];
  const idx = base.length - queue.length;
  if (!queue.length) return <section><h1 className="mt-h1">Saturday</h1>
    <div className="mt-card"><p>{pod.some(p => p.here) || all ? "Everyone here today has been observed." : "Nobody is marked here yet. Away mentees are skipped."}</p>
      {!all && <button className="mt-btn" onClick={() => setAll(true)}>Observe the whole pod</button>}</div></section>;
  const inds = d.indicators || [];
  const missing = inds.filter(n => (v.lv[n] || 0) > 0 && !String(v.ev[n] || "").trim());
  const rated = inds.filter(n => v.lv[n] !== undefined);
  const save = async () => {
    try {
      await mtAct("observe", { memberId: cur.memberId, ratings: rated.map(n => ({ indicator: n, level: v.lv[n], evidence: v.ev[n] || "" })), strength: v.strength, growth: v.growth, nextChallenge: v.nextChallenge });
      say(mtFirst(cur.menteeName) + " observed."); setV(blank()); pass(cur.memberId); refresh();
    } catch (e) { say(mtErr(e, "Couldn’t save."), true); }
  };
  return <section>
    <p className="mt-sub">{idx + 1} of {base.length}</p>
    <h1 className="mt-h1">{cur.menteeName}</h1>
    <div className="mt-card mt-form">
      <p className="mt-hint">Say what they did, not how good it was. For example: “Volunteered to present first.”</p>
      {inds.map(n => <div key={n} className="mt-obs">
        <fieldset className="mt-seg"><legend>{n}</legend>{MT_LEVELS.map((l, i) => <button type="button" key={l} aria-pressed={v.lv[n] === i} className={v.lv[n] === i ? "is-on" : ""} onClick={() => setV(Object.assign({}, v, { lv: Object.assign({}, v.lv, { [n]: i }) }))}>{l}</button>)}</fieldset>
        {(v.lv[n] || 0) > 0 && <label>Evidence for this rating<input value={v.ev[n] || ""} onChange={e => setV(Object.assign({}, v, { ev: Object.assign({}, v.ev, { [n]: e.target.value }) }))} aria-invalid={!String(v.ev[n] || "").trim()}/></label>}
      </div>)}
      <label>Strength I noticed<input value={v.strength} onChange={e => setV(Object.assign({}, v, { strength: e.target.value }))}/></label>
      <label>Growth area<input value={v.growth} onChange={e => setV(Object.assign({}, v, { growth: e.target.value }))}/></label>
      <label>Next challenge for them<input value={v.nextChallenge} onChange={e => setV(Object.assign({}, v, { nextChallenge: e.target.value }))}/></label>
      {missing.length > 0 && <p className="mt-warn" role="status">Evidence needed for this rating: {missing.join(", ")}.</p>}
      <div className="mt-row-acts"><button className="mt-btn" onClick={() => { setV(blank()); pass(cur.memberId); }}>Skip</button>
        <button className="mt-btn is-primary" disabled={!rated.length || missing.length > 0} onClick={save}>Save and go to next</button></div>
    </div>
  </section>;
}

/* ── Weekly reviews ─────────────────────────────────────────────────────── */
function MtReviews({ pod, say, refresh }) {
  const [passed, setPassed] = React.useState([]);
  const pass = id => setPassed(x => x.concat(id));
  const due = pod.filter(p => !p.reviewed || passed.indexOf(p.memberId) >= 0);
  const left = due.filter(p => passed.indexOf(p.memberId) < 0);
  const blank = { trend: "", learned: "", struggled: "", challenge: "", concern: false };
  const [v, setV] = React.useState(blank);
  const cur = left[0];
  const idx = due.length - left.length;
  if (!cur) return <section><h1 className="mt-h1">Reviews</h1><div className="mt-card"><h2>All clear</h2><p>Every mentee in your pod has been reviewed this week.</p></div></section>;
  const save = async () => {
    try { await NGGApi.member.mentorReview(cur.memberId, { answers: { learned: v.learned, struggled: v.struggled, challenge: v.challenge }, trend: v.trend, concern: v.concern });
      say("Review saved."); setV(blank); pass(cur.memberId); refresh(); }
    catch (e) { say(mtErr(e, "Couldn’t save the review."), true); }
  };
  return <section>
    <p className="mt-sub">{idx + 1} of {due.length} to review this week</p>
    <h1 className="mt-h1">{cur.menteeName}</h1>
    <div className="mt-card mt-form">
      <fieldset className="mt-seg"><legend>Compared with last week</legend>{[["better", "Better"], ["same", "About the same"], ["worse", "Worse"]].map(([k, l]) => <button type="button" key={k} aria-pressed={v.trend === k} className={v.trend === k ? "is-on" : ""} onClick={() => setV(Object.assign({}, v, { trend: k }))}>{l}</button>)}</fieldset>
      <label>What did they learn this week?<textarea value={v.learned} onChange={e => setV(Object.assign({}, v, { learned: e.target.value }))}/></label>
      <label>What did they struggle with?<textarea value={v.struggled} onChange={e => setV(Object.assign({}, v, { struggled: e.target.value }))}/></label>
      <label>What should I challenge them about next week?<textarea value={v.challenge} onChange={e => setV(Object.assign({}, v, { challenge: e.target.value }))}/></label>
      <label className="mt-check"><input type="checkbox" checked={v.concern} onChange={e => setV(Object.assign({}, v, { concern: e.target.checked }))}/>Raise a concern with the lead</label>
      <div className="mt-row-acts"><button className="mt-btn" onClick={() => { setV(blank); pass(cur.memberId); }}>Skip</button>
        <button className="mt-btn is-primary" disabled={!(v.learned || v.struggled || v.challenge).trim()} onClick={save}>Save and next</button></div>
    </div>
  </section>;
}

/* ── Check-in with the coordinator ──────────────────────────────────────── */
function MtCheckin({ say }) {
  const [v, setV] = React.useState({ feeling: "", wins: "", hard: "", needSupport: false });
  const [done, setDone] = React.useState("");
  if (done) return <section><h1 className="mt-h1">Check-ins</h1><div className="mt-card"><p>{done}</p><button className="mt-btn" onClick={() => setDone("")}>Log another</button></div></section>;
  return <section><h1 className="mt-h1">Check-in with your coordinator</h1>
    <form className="mt-card mt-form" onSubmit={async e => { e.preventDefault(); try { const r = await mtAct("checkin", v); setDone(r.message); } catch (er) { say(mtErr(er), true); } }}>
      <fieldset className="mt-seg"><legend>How are you finding it?</legend>{["Good", "Okay", "Stretched", "Struggling"].map(f => <button type="button" key={f} aria-pressed={v.feeling === f} className={v.feeling === f ? "is-on" : ""} onClick={() => setV(Object.assign({}, v, { feeling: f }))}>{f}</button>)}</fieldset>
      <label>What went well<textarea value={v.wins} onChange={e => setV(Object.assign({}, v, { wins: e.target.value }))}/></label>
      <label>What is hard<textarea value={v.hard} onChange={e => setV(Object.assign({}, v, { hard: e.target.value }))}/></label>
      <label className="mt-check"><input type="checkbox" checked={v.needSupport} onChange={e => setV(Object.assign({}, v, { needSupport: e.target.checked }))}/>I would like support</label>
      <div className="mt-row-acts"><button className="mt-btn is-primary" disabled={!v.feeling}>Log check-in</button></div>
    </form></section>;
}

/* ── Academy ────────────────────────────────────────────────────────────── */
function MtAcademy({ say, onCleared }) {
  const [d, setD] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  const load = () => mtPod("academy").then(setD).catch(() => setD({ error: true }));
  React.useEffect(() => { load(); }, []);
  if (!d) return <div className="mt-boot"><div className="dash-spinner"/></div>;
  if (d.error) return <div className="mt-card"><p>Couldn’t load the Academy.</p><button className="mt-btn" onClick={load}>Try again</button></div>;
  if (open) return <MtModule mod={open} pass={d.pass} say={say} onDone={() => { setOpen(null); load(); onCleared(); }}/>;
  const req = d.modules.filter(m => m.required), done = req.filter(m => m.passedAt).length;
  return <section>
    <h1 className="mt-h1">NGG mentor certification</h1>
    <p className="mt-lead">{done === req.length ? "You’re fully certified. Next refresher is due next year." : done + " of " + req.length + " required modules done. All are needed before you meet your pod."}</p>
    {(d.groups || []).map((g, gi) => <div key={g} className="mt-card"><h2>{g}</h2><ul className="mt-list">
      {d.modules.filter(m => m.group === gi).map(m => <li key={m.id}><i className={m.passedAt ? "ph-fill ph-check-circle is-green" : "ph ph-circle"} aria-hidden="true"/>
        <span><b>{m.title}</b><em>{m.mins} min{m.note ? " · " + m.note : ""}{m.passedAt ? " · passed " + mtDate(m.passedAt) : ""}{!m.required ? " · optional" : ""}</em></span>
        <button className="mt-btn" onClick={() => setOpen(m)}>{m.passedAt ? "Review" : "Start"}</button></li>)}
    </ul></div>)}
  </section>;
}
function MtModule({ mod, pass, say, onDone }) {
  const [step, setStep] = React.useState("learn");
  const [pick, setPick] = React.useState(null);
  const [ans, setAns] = React.useState(mod.quiz.map(() => null));
  const [res, setRes] = React.useState(null);
  const check = async () => { try { setRes(await mtAct("academyCheck", { moduleId: mod.id, answers: ans })); setStep("result"); } catch (e) { say(mtErr(e, "Couldn’t check your answers."), true); } };
  return <section>
    <p className="mt-sub">Academy · {mod.mins} min</p><h1 className="mt-h1">{mod.title}</h1>
    {step === "learn" && <div className="mt-card">{mod.lessons.map((l, i) => <div key={i} className="mt-lesson"><h2>{l.h}</h2><p>{l.body}</p></div>)}
      <div className="mt-row-acts"><button className="mt-btn" onClick={onDone}>Back</button><button className="mt-btn is-primary" onClick={() => setStep(mod.scenario ? "practice" : "check")}>Continue</button></div></div>}
    {step === "practice" && <div className="mt-card"><h2>Practice · what would you do?</h2><p>{mod.scenario.situation}</p>
      <div className="mt-opts">{mod.scenario.options.map((o, i) => <button key={i} aria-pressed={pick === i} className={"mt-opt" + (pick === i ? " is-on" : "")} onClick={() => setPick(i)}>{o.text}</button>)}</div>
      <p className="mt-hint">Talk your choice through with your lead at the next mentor circle.</p>
      <div className="mt-row-acts"><button className="mt-btn is-primary" disabled={pick === null} onClick={() => setStep("check")}>Continue to check</button></div></div>}
    {step === "check" && <div className="mt-card mt-form">{mod.quiz.map((q, i) => <fieldset key={i} className="mt-quiz"><legend>{q.q}</legend>
      {q.options.map((o, j) => <label key={j} className="mt-check"><input type="radio" name={"q" + i} checked={ans[i] === j} onChange={() => setAns(ans.map((a, k) => k === i ? j : a))}/>{o}</label>)}</fieldset>)}
      <div className="mt-row-acts"><button className="mt-btn is-primary" disabled={ans.some(a => a === null)} onClick={check}>Check answers</button></div></div>}
    {step === "result" && res && <div className="mt-card"><h2>{res.passed ? "Passed. This is added to your mentor record." : "Not yet — " + res.score + "%. You need " + pass + "%."}</h2>
      <ul className="mt-list">{res.feedback.map((f, i) => <li key={i}><i className={f.ok ? "ph-fill ph-check-circle is-green" : "ph ph-x-circle is-red"} aria-hidden="true"/><span><em>{f.why}</em></span></li>)}</ul>
      <div className="mt-row-acts">{res.passed ? <button className="mt-btn is-primary" onClick={onDone}>Finish module</button> : <button className="mt-btn is-primary" onClick={() => { setRes(null); setAns(mod.quiz.map(() => null)); setStep("learn"); }}>Try again</button>}</div></div>}
  </section>;
}

/* ── The Commitment Policy ──────────────────────────────────────────────── */
function MtCommit({ say, onSigned }) {
  const [d, setD] = React.useState(null);
  const [name, setName] = React.useState("");
  const load = () => mtPod("policy").then(setD).catch(() => setD({ error: true }));
  React.useEffect(() => { load(); }, []);
  if (!d) return <div className="mt-boot"><div className="dash-spinner"/></div>;
  if (d.error) return <div className="mt-card"><p>Couldn’t load the policy.</p><button className="mt-btn" onClick={load}>Try again</button></div>;
  const p = d.policy;
  const sign = async e => { e.preventDefault(); try { await mtAct("policyAccept", { signedName: name, version: p.version }); say("Signed. Thank you."); load(); onSigned(); } catch (er) { say(mtErr(er), true); } };
  return <section>
    <h1 className="mt-h1">{p.title}</h1>
    <div className="mt-card"><ol className="mt-policy">{p.items.map(i => <li key={i.n}>{i.text}</li>)}</ol><p className="mt-standard">{p.standard}</p></div>
    {d.accepted ? <div className="mt-card"><p>Signed by {d.accepted.signedName} on {mtDate(d.accepted.acceptedAt)} · version {p.version}</p></div>
      : <form className="mt-card mt-form" onSubmit={sign}><h2>Sign the policy</h2><label>Type your full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name"/></label>
        <div className="mt-row-acts"><button className="mt-btn is-primary" disabled={name.trim().length < 3}>I commit to this policy</button></div></form>}
    {d.commitments && <div className="mt-card"><h2>This month</h2><ul className="mt-list">{d.commitments.items.map(i => <li key={i.key}>
      <i className={i.ok ? "ph-fill ph-check-circle is-green" : "ph ph-circle-half is-amber"} aria-hidden="true"/><span><b>{i.label}</b><em>{i.done} of {i.expected}{i.note ? " · " + i.note : ""}</em></span></li>)}</ul></div>}
  </section>;
}

/* ── Support and Report a concern ───────────────────────────────────────── */
function MtSupport({ go }) {
  return <section><h1 className="mt-h1">Support</h1>
    <div className="mt-card"><h2>I need help with…</h2><ul className="mt-list">
      <li><span><b>A mentee I’m worried about</b><em>Report it the same day. You don’t need proof.</em></span><button className="mt-btn is-red" onClick={() => go("concern")}>Report a concern about a young person</button></li>
      <li><span><b>Feeling stretched</b><em>Your coordinator will call you this week.</em></span><button className="mt-btn" onClick={() => go("checkin")}>Check in</button></li>
      <li><span><b>Mentor Academy</b><em>Modules, refreshers and practice.</em></span><button className="mt-btn" onClick={() => go("academy")}>Open</button></li>
      <li><span><b>The class roster</b><em>The whole centre’s class, as before the pods.</em></span><a className="mt-btn mt-btn-link" href="/mentor?view=class">Open</a></li>
    </ul></div></section>;
}
function MtConcern({ pod, say }) {
  const [v, setV] = React.useState({ category: "", subjectId: "", body: "" });
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  if (res) return <section><h1 className="mt-h1">Report a concern</h1><div className="mt-card" role="status">
    <h2>Received by {res.officerName}, safeguarding officer. Case {res.caseNo}.</h2>
    <p>The report goes only to the safeguarding officer and cannot be edited after sending.</p>
    <button className="mt-btn" onClick={() => { setRes(null); setV({ category: "", subjectId: "", body: "" }); }}>Report something else</button></div></section>;
  return <section><h1 className="mt-h1">Report a concern</h1>
    <p className="mt-banner" role="note">If a child is in immediate danger, call 112 first, then the safeguarding officer.</p>
    <form className="mt-card mt-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { setRes(await mtAct("concern", v)); } catch (er) { say(mtErr(er, "Couldn’t send. Try again, or call the safeguarding officer."), true); } setBusy(false); }}>
      <label>What is it about?<select className="mt-select" value={v.category} onChange={e => setV(Object.assign({}, v, { category: e.target.value }))} required><option value="">Choose…</option>{MT_CONCERN_CATS.map(c => <option key={c}>{c}</option>)}</select></label>
      {pod.length > 0 && <label>Young person (optional)<select className="mt-select" value={v.subjectId} onChange={e => setV(Object.assign({}, v, { subjectId: e.target.value }))}><option value="">Not in my pod / not named</option>{pod.map(p => <option key={p.memberId} value={p.memberId}>{p.menteeName}</option>)}</select></label>}
      <label>What happened, in the young person’s words where you can. Facts, not opinions.<textarea required minLength={10} rows={6} value={v.body} onChange={e => setV(Object.assign({}, v, { body: e.target.value }))}/></label>
      <div className="mt-row-acts"><button className="mt-btn is-red" disabled={busy || !v.category || v.body.trim().length < 10}>{busy ? "Sending…" : "Send to safeguarding"}</button></div>
    </form></section>;
}
