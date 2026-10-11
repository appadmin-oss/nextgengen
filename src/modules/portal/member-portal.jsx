/* ── The Member Portal ────────────────────────────────────────────────────────
 *
 * /member/{area}/{tab} — five areas (handoff v2, INFORMATION_ARCHITECTURE.md):
 *
 *   Today    one page: standing → account → To do (server order) → how are you
 *            → this week → where you stand
 *   Mentor   My mentor · Companion · Community ↗
 *   Grow     Scorecard & goals · School results · Passport · Anchor Journal ↗
 *   Learn    Lessons · Saturday · Timetable · Opportunities (14–17 only)
 *   Account  Profile · Money · Records · Help
 *
 * Every figure is read from the screen that owns it; the screens themselves are
 * the dashboard's existing components wherever one already does the job, so
 * there is one account panel, one curriculum, one requests desk — not two.
 * /dashboard and its old sub-paths forward here (app.jsx).
 */

const MBR_AREAS_BASE = [
  { id: "today", label: "Today", icon: "sun-horizon", tabs: [] },
  { id: "mentor", label: "Mentor", icon: "handshake", tabs: [
    { id: "chat", label: "My mentor" }, { id: "companion", label: "Companion" }, { id: "community", label: "Community", external: true }] },
  { id: "grow", label: "Grow", icon: "plant", tabs: [
    { id: "scorecard", label: "Scorecard & goals" }, { id: "results", label: "School results" }, { id: "passport", label: "Passport" }, { id: "journal", label: "Anchor Journal", external: true }] },
  { id: "learn", label: "Learn", icon: "book-open-text", tabs: [
    { id: "lessons", label: "Lessons" }, { id: "saturday", label: "Saturday" }, { id: "timetable", label: "Timetable" }, { id: "opps", label: "Opportunities" }] },
  { id: "account", label: "Account", icon: "user-circle", tabs: [
    { id: "profile", label: "Profile" }, { id: "money", label: "Money" }, { id: "records", label: "Records" }, { id: "help", label: "Help" }] },
];

const MBR_STANDING = {
  warned:    { tone: "warning", title: "You have a warning on your record", body: "One more and your place becomes dormant. Here is how to clear it." },
  dormant:   { tone: "warning", title: "Your place is dormant", body: "You can come back by clearing what is owed and meeting your coordinator." },
  suspended: { tone: "danger",  title: "Your place is suspended", body: "You can still read your account and records. Talk to your coordinator about coming back." },
  evicted:   { tone: "danger",  title: "Your place was withdrawn", body: "You can still see your records. Your family can appeal through the centre." },
};

function mbrQuery(k) { try { return new URLSearchParams(window.location.search).get(k) || ""; } catch (_) { return ""; } }

function MemberPortal({ setPage }) {
  const { member, isSignedIn, loading, openSignIn, signOut } = useAuth();
  const [today, setToday] = React.useState(null);
  const [todayState, setTodayState] = React.useState("loading");
  const [dash, setDash] = React.useState(null);
  const [rec, setRec] = React.useState(null);
  const [seq, setSeq] = React.useState(0);
  const bump = React.useCallback(() => setSeq(s => s + 1), []);

  const age = today && today.age;
  const areas = React.useMemo(() => MBR_AREAS_BASE.map(a => a.id !== "learn" ? a
    : Object.assign({}, a, { tabs: a.tabs.map(t => t.id === "opps" ? Object.assign({}, t, { hidden: !(age >= 14 && age <= 17) }) : t) })), [age]);
  const [place, go, goRoute] = usePortalRoute("member", areas);

  React.useEffect(() => { if (isSignedIn) NGGApi.member.record().then(setRec, () => {}); }, [isSignedIn, seq]);
  React.useEffect(() => {
    const f = () => NGGApi.member.record().then(setRec, () => {});
    window.addEventListener("ngg:record-incomplete", f);
    return () => window.removeEventListener("ngg:record-incomplete", f);
  }, []);
  React.useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    NGGApi.member.today().then(r => { if (alive) { setToday(r); setTodayState("ready"); } })
      .catch(e => { if (alive) setTodayState(s => (s === "ready" ? "ready" : (e && e.code === "not_ngg_member" ? "summer" : "error"))); });
    NGGApi.member.dashboard().then(r => { if (alive) setDash(r); }).catch(() => {});
    return () => { alive = false; };
  }, [isSignedIn, seq]);
  // Fresh when the member comes back to the tab; quiet while it is hidden.
  React.useEffect(() => {
    const v = () => { if (!document.hidden) bump(); };
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [bump]);

  if (loading) return <div className="pt-app pt-member pt-boot"><PtLoad state="loading" rows={4}/></div>;
  if (!isSignedIn) return <DashboardShell><DashboardSignedOut openSignIn={openSignIn} setPage={setPage}/></DashboardShell>;
  if (rec && rec.locked) return <DashboardShell><RecordDrive status={rec} locked onSaved={setRec} onSignOut={signOut}/></DashboardShell>;
  if (todayState === "summer") return <DashboardShell><div className="container" style={{ padding: "60px 0" }}><h1>This portal is for NGG members.</h1><p>Your Summer School card and timetable are on the Summer School pages.</p></div></DashboardShell>;

  const m = (dash && dash.member) || member || {};
  const first = (today && today.firstName) || String(m.fullName || "").split(" ")[0] || "there";
  const area = areas.find(a => a.id === place.area) || areas[0];
  const tab = (area.tabs.find(t => t.id === place.tab) || {});
  const greeting = typeof hourGreeting === "function" ? hourGreeting() : "Hello";
  const title = area.id === "today" ? greeting + ", " + first + "." : (area.tabs.length ? tab.label || area.label : area.label);
  const sub = area.id === "today" && today ? ptDate(today.today, { weekday: "long", day: "numeric", month: "long" }) + (m.centre ? " · " + m.centre : "") : "";
  const showStanding = today && today.standing && (today.standing.state === "suspended" || ["today", "learn", "account"].includes(area.id));

  return (
    <PortalShell kind="member" brand="Member portal" sub={(m.centre || "NGG") + (m.displayId ? " · " + m.displayId : "")}
      me={{ name: m.fullName || first, role: m.displayId || "Member", initials: ptInitials(m.fullName), photoUrl: m.photoUrl && typeof nggPhotoSrc === "function" ? nggPhotoSrc(m.photoUrl) : "" }}
      areas={areas} place={place} go={go} badges={today ? today.badges : {}} palette
      title={title} subtitle={sub} onSignOut={signOut}
      banner={showStanding ? <MbrStanding s={today.standing} onGo={() => go("account", "money")}/> : null}>
      {rec && rec.asked && area.id === "today" && <RecordDrive status={rec} onSaved={setRec}/>}
      <MbrArea area={area.id} tab={place.tab} today={today} todayState={todayState} dash={dash} m={m}
        go={go} goRoute={goRoute} reload={bump} seq={seq}/>
    </PortalShell>
  );
}

function MbrStanding({ s, onGo }) {
  const [open, setOpen] = React.useState(false);
  const c = MBR_STANDING[s.state] || MBR_STANDING.warned;
  const days = s.until ? Math.ceil((new Date(s.until) - Date.now()) / 86400000) : null;
  return (
    <div className={"pt-banner pt-tone-" + c.tone} role="status">
      <PIcon name="warning-octagon"/>
      <div>
        <b>{c.title}</b>
        <p>{c.body}{days !== null && days > 0 ? " · " + days + " day" + (days === 1 ? "" : "s") + " left" : ""}</p>
        {open && (
          <ol className="pt-banner-steps">
            {s.finesOwed > 0 && <li>Settle {ptMoney(s.finesOwed)} in fines, or appeal them from Records.</li>}
            <li>Come every Saturday and check in at the gate.</li>
            <li>Finish any lesson that is overdue.</li>
            {s.reason && <li>What was recorded: {s.reason}</li>}
          </ol>
        )}
      </div>
      <div className="pt-banner-a">
        <button type="button" className="pt-btn pt-btn--sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? "Hide steps" : "How to clear it"}</button>
        <button type="button" className="pt-btn pt-btn--sm pt-btn--ghost" onClick={onGo}>Money</button>
      </div>
    </div>
  );
}

function MbrArea(props) {
  const { area, tab, go } = props;
  if (area === "today") return <MbrToday {...props}/>;
  if (area === "mentor") {
    if (tab === "companion") return typeof DashCompanion === "function" ? <DashCompanion/> : null;
    if (tab === "community") return <PtExternal icon="users-three" title="Community" href="/community" cta="Open Community"
      body="Your class channel, homework posts, polls and the showcase live in the Community app."
      points={["Your mentor and instructors are there", "Be kind; everything you post is moderated", "Never share your phone number or address"]}/>;
    return <MbrMentor {...props}/>;
  }
  if (area === "grow") {
    if (tab === "results") return <MbrResults onChanged={props.reload}/>;
    if (tab === "passport") return <MbrPassport {...props}/>;
    if (tab === "journal") return <PtExternal icon="notebook" title="Anchor Journal" href="/journal/" cta="Open your journal"
      body="Write a little each week. You decide who reads each entry."
      points={["Private: only you", "Shared with your mentor: they can read and reply", "Your family never sees an entry unless you share it with them"]}/>;
    return <MbrScorecard {...props}/>;
  }
  if (area === "learn") {
    if (tab === "saturday") return <MbrSaturday {...props}/>;
    if (tab === "timetable") return typeof DashTimetable === "function" ? <DashTimetable/> : null;
    if (tab === "opps") return <MbrOpps {...props}/>;
    return <MbrLessons {...props}/>;
  }
  if (tab === "money") return <MbrMoney {...props}/>;
  if (tab === "records") return <MbrRecords {...props}/>;
  if (tab === "help") return <MbrHelp {...props}/>;
  return <MbrProfile {...props}/>;
}

/* ── Today ───────────────────────────────────────────────────────────────── */
function MbrToday({ today, todayState, dash, go, goRoute, reload }) {
  if (todayState !== "ready") return <PtLoad state={todayState} onRetry={reload} what="today" rows={5}/>;
  const t = today, a = t.account, g = t.glance;
  return (
    <div className="mbr-today">
      {a && (
        <PtCard title="Account" className="mbr-acct"
          action={<span className={"pt-pill pt-tone-" + (a.status === "owing" ? "warning" : "success")}>{a.status === "owing" ? "To pay" : "Up to date"}</span>}>
          <div className="mbr-acct-row">
            <div><small>To pay now</small><b className="mbr-big">{ptMoney(a.payable)}</b></div>
            {a.payable > 0 && <button type="button" className="pt-btn pt-btn--ink" onClick={() => go("account", "records", "", "ask=payment")}>I’ve made a payment</button>}
          </div>
          <dl className="mbr-figs">
            <div><dt>Training fee</dt><dd>{ptMoney(a.trainingFee)}<small>covered by NGG</small></dd></div>
            <div><dt>Next dues</dt><dd>{a.next ? ptMoney(a.next.amount) : "–"}<small>{a.next ? ptDate(a.next.on) : "nothing scheduled"}</small></dd></div>
            <div><dt>Paid in {String(t.today).slice(0, 4)}</dt><dd>{ptMoney(a.paidThisYear)}</dd></div>
            <div><dt>Last payment</dt><dd>{a.lastPayment ? ptMoney(a.lastPayment.amount) : "–"}<small>{a.lastPayment ? ptDate(a.lastPayment.at) : ""}</small></dd></div>
            <div><dt>Fines</dt><dd className={a.fines > 0 ? "is-bad" : ""}>{ptMoney(a.fines)}</dd></div>
          </dl>
          <button type="button" className="pt-link" onClick={() => go("account", "money")}>Full statement <PIcon name="arrow-right"/></button>
        </PtCard>
      )}
      <PtCard title="To do" meta={t.todo.length ? t.todo.length + " thing" + (t.todo.length === 1 ? "" : "s") : ""}>
        <PtTodo items={t.todo} onGo={goRoute} limit={6}/>
      </PtCard>
      <MbrMood mentor={t.week.mentor} checkin={t.checkin} onSent={reload}/>
      <div className="mbr-week">
        <button type="button" className="mbr-sat" onClick={() => go("learn", "saturday")}>
          <small>{t.week.isToday ? "Today" : "This Saturday"}</small>
          <b>{ptDate(t.week.saturday, { weekday: "long", day: "numeric", month: "long" })}</b>
          <span>{[t.week.centre, t.week.track].filter(Boolean).join(" · ")}</span>
          <span className="mbr-sat-go">See the plan <PIcon name="arrow-right"/></span>
        </button>
        <button type="button" className="mbr-mentor" onClick={() => go("mentor")}>
          <small>Your mentor</small>
          {t.week.mentor ? <React.Fragment><b>{t.week.mentor.name}</b><span className="mbr-sat-go">Message {t.week.mentor.first} <PIcon name="arrow-right"/></span></React.Fragment>
                         : <React.Fragment><b>Not paired yet</b><span>Your coordinator is matching you with a mentor.</span></React.Fragment>}
        </button>
      </div>
      <h2 className="pt-section">Where you stand</h2>
      <div className="pt-stats">
        <PtStat label="Leadership Index" value={g.index === null ? "Not yet" : g.index + "/100"} sub={g.index === null ? "Your mentor scores it monthly" : g.indexChange === null ? "This month" : (g.indexChange >= 0 ? "+" : "") + g.indexChange + " since last month"} onClick={() => go("grow", "scorecard")}/>
        {g.week > 0 && <PtStat label="Anchor 12" value={"Week " + g.week} sub="of 12" onClick={() => go("learn", "saturday")}/>}
        <PtStat label="Level" value={g.level} sub="From missions and lessons" onClick={() => go("grow", "passport")}/>
        <PtStat label="Streak" value={g.streak} sub={g.streak === 1 ? "day in a row" : "days in a row"} onClick={() => go("grow", "passport")}/>
      </div>
    </div>
  );
}

/* ── Today: how are you this week ─────────────────────────────────────────
   One tap for "okay". "It's been hard" or "I need help" asks one more thing
   before it goes, because it tells the mentor straight away (and, for help,
   the person at the centre who keeps young people safe). */
const MBR_MOODS = [["Okay", "I’m okay", "smiley"], ["Struggling", "It’s been hard", "smiley-meh"], ["Need help", "I need help", "lifebuoy"]];
function MbrMood({ mentor, checkin, onSent }) {
  const [pick, setPick] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [edit, setEdit] = React.useState(false);
  const first = mentor ? mentor.first : "";
  if (!mentor) return null;
  const send = async (w) => {
    setBusy(true);
    try {
      await NGGApi.member.pod.act("weekCheckin", { wellbeing: w, note: note.trim(), sleep: 0, stress: 0, energy: 0 });
      toast.success(w === "Okay" ? "Thanks. " + first + " can see it." : w === "Need help" ? first + " has been told and will reach you today." : "Thanks for telling us. " + first + " will check in with you.");
      setPick(""); setNote(""); setEdit(false); onSent();
    } catch (e) { toast.error("That didn’t send. Try again."); } finally { setBusy(false); }
  };
  if (checkin.done && !edit) return (
    <PtCard title="How are you this week?" action={<button type="button" className="pt-btn pt-btn--sm pt-btn--ghost" onClick={() => setEdit(true)}>Change</button>}>
      <p className="mbr-done"><PIcon name="check-circle" on/> {{ Okay: "You told " + first + " you’re okay.", Struggling: "You told " + first + " it’s been hard. They’ll check in with you.", "Need help": first + " knows you need help and will reach you." }[checkin.wellbeing] || "You checked in this week."}</p>
    </PtCard>
  );
  return (
    <PtCard title="How are you this week?" meta={"Only " + first + " sees this."}>
      <div className="mbr-moods" role="group" aria-label="How your week has been">
        {MBR_MOODS.map(([k, l, ic]) => (
          <button key={k} type="button" aria-pressed={pick === k} className={"mbr-mood" + (pick === k ? " is-on" : "")} disabled={busy}
            onClick={() => { if (k === "Okay") send("Okay"); else setPick(k); }}>
            <PIcon name={ic} on={pick === k}/><span>{l}</span>
          </button>
        ))}
      </div>
      {pick && (
        <div className="mbr-mood-more">
          <p><b>{pick === "Need help" ? first + " will be told now, and so will the safeguarding lead at your centre." : "Want " + first + " to check in with you?"}</b>
            {pick === "Need help" && " If you are in danger right now, call 112."}</p>
          <label className="pt-field"><span>Anything you want {first} to know? <em>optional</em></span>
            <textarea rows={2} maxLength={600} value={note} onChange={e => setNote(e.target.value)}/></label>
          <div className="pt-actions">
            <button type="button" className="pt-btn pt-btn--ghost" onClick={() => setPick("")}>Cancel</button>
            <button type="button" className="pt-btn pt-btn--ink" disabled={busy} onClick={() => send(pick)}>{busy ? "Sending…" : pick === "Need help" ? "Ask for help" : "Yes, tell " + first}</button>
          </div>
        </div>
      )}
    </PtCard>
  );
}

/* ── Mentor › My mentor: Chat · Next steps · How it's going ──────────── */
function MbrMentor({ go, seq, reload }) {
  const [seg, setSeg] = React.useState("chat");
  const [mine, setMine] = React.useState(null);
  const [state, setState] = React.useState("loading");
  const load = React.useCallback(() => NGGApi.member.pod.read("mine").then(r => { setMine(r); setState("ready"); }, () => setState("error")), []);
  React.useEffect(() => { load(); }, [load, seq]);
  return (
    <PtLoad state={state} onRetry={load} what="your mentor" rows={3}>
      {mine && !mine.mentor && <PtCard title="You don’t have a mentor yet" meta="Your coordinator pairs every member with a mentor. You’ll see them here, and be able to message them, as soon as you’re paired."/>}
      {mine && mine.mentor && (
        <React.Fragment>
          <div className="mbr-mhead">
            <span className="pt-av" aria-hidden="true">{ptInitials(mine.mentor.name)}</span>
            <div><b>{mine.mentor.name}</b><small>Your mentor · replies between 8am and 8pm</small></div>
          </div>
          <div className="pt-seg" role="tablist" aria-label="Your mentor">
            {[["chat", "Chat"], ["next", "Next steps"], ["going", "How it’s going"]].map(([k, l]) =>
              <button key={k} type="button" role="tab" aria-selected={seg === k} className={seg === k ? "is-on" : ""} onClick={() => setSeg(k)}>{l}{k === "going" && mine.relAsked && !mine.relDone ? <span className="pt-badge">1</span> : null}</button>)}
          </div>
          {seg === "chat" && <MbrChat first={mine.mentor.first} onRead={reload}/>}
          {seg === "next" && (mine.goal ? (
            <PtCard title="Your goal" meta={[mine.goal.area, mine.goal.reviewBy ? "review by " + ptDate(mine.goal.reviewBy) : ""].filter(Boolean).join(" · ")}>
              <dl className="mbr-woop">
                <div><dt>What you want</dt><dd>{mine.goal.goal}</dd></div>
                {mine.goal.outcome && <div><dt>How it will look</dt><dd>{mine.goal.outcome}</dd></div>}
                {mine.goal.obstacle && <div><dt>What could get in the way</dt><dd>{mine.goal.obstacle}</dd></div>}
                {mine.goal.plan && <div><dt>Your plan</dt><dd>{mine.goal.plan}</dd></div>}
              </dl>
              <div className="mbr-seg" aria-label={"How close: " + mine.goal.progress + " of 5"}>{[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= mine.goal.progress ? "is-on" : ""}/>)}</div>
              <p className="pt-hint">How close you are, as you and {mine.mentor.first} last agreed.</p>
            </PtCard>
          ) : <PtCard title="No goal yet" meta={"You and " + mine.mentor.first + " set one together on a Saturday. Think about one thing you want to get better at."}/>)}
          {seg === "going" && (
            <React.Fragment>
              {mine.relAsked && !mine.relDone ? <MbrRelCheck qs={mine.relQuestions} first={mine.mentor.first} onDone={load}/>
                : <PtCard title="Thanks for your answers" meta={mine.relDone ? "You answered this round. The coordinator reads them." : "Every few weeks we ask how mentoring is going. Nothing to answer right now."}/>}
              <PtCard title="Something not working?" meta="Ask for a change of mentor. Only the coordinator reads it, and nothing changes until you’ve talked.">
                <button type="button" className="pt-btn" onClick={() => go("account", "records", "", "ask=mentor")}>Ask for a change of mentor</button>
              </PtCard>
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </PtLoad>
  );
}

function MbrChat({ first, onRead }) {
  const [d, setD] = React.useState(null);
  const [state, setState] = React.useState("loading");
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [help, setHelp] = React.useState("");
  const end = React.useRef(null);
  const load = React.useCallback(() => NGGApi.member.chat().then(r => { setD(r); setState("ready"); }, () => setState("error")), []);
  React.useEffect(() => { load().then(() => onRead && onRead()); const t = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(t); }, [load]); // eslint-disable-line
  React.useEffect(() => { if (end.current) end.current.scrollIntoView({ block: "nearest" }); }, [d && d.messages.length]);
  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await NGGApi.member.chatSend(body);
      setText(""); setHelp(r.help || "");
      await load();
    } catch (err) { toast.error(err && err.code === "too_long" ? "That’s too long. Keep it under 1,200 characters." : "That didn’t send. Try again."); }
    finally { setBusy(false); }
  };
  return (
    <PtLoad state={state} onRetry={load} what="your messages" rows={3}>
      {d && (
        <PtCard className="mbr-chat">
          <ol className="mbr-thread" aria-live="polite" aria-label={"Messages with " + first}>
            {!d.messages.length && <li className="mbr-thread-empty">Say hello, ask a question, or tell {first} how Saturday went. Messages are kept for this session.</li>}
            {d.messages.map(m => (
              <li key={m.id} className={m.mine ? "is-mine" : ""}>
                {m.about && <small className="mbr-about">Re: {m.about}</small>}
                <p>{m.body}</p>
                <small>{m.mine ? "You" : m.from.split(" ")[0]} · {ptDate(m.at, { day: "numeric", month: "short" })} {String(m.at).slice(11, 16)}{m.mine && m.read ? " · seen" : ""}</small>
              </li>
            ))}
            <li ref={end} aria-hidden="true" className="mbr-thread-end"/>
          </ol>
          {help && <p className="mbr-crisis" role="alert"><PIcon name="lifebuoy"/> {help}</p>}
          <form className="mbr-compose" onSubmit={send}>
            <label className="sr-only" htmlFor="mbr-msg">Message to {first}</label>
            <textarea id="mbr-msg" rows={2} maxLength={d.max} value={text} placeholder={"Write to " + first + "…"} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e); }}/>
            <button type="submit" className="pt-btn pt-btn--ink" disabled={busy || !text.trim()} aria-label="Send"><PIcon name="paper-plane-tilt"/> <span>Send</span></button>
          </form>
          {d.quiet && <p className="pt-hint"><PIcon name="moon"/> It’s after 8pm. {first} will see it in the morning.</p>}
        </PtCard>
      )}
    </PtLoad>
  );
}

function MbrRelCheck({ qs, first, onDone }) {
  const [a, setA] = React.useState([0, 0, 0, 0]);
  const [busy, setBusy] = React.useState(false);
  const send = async () => {
    setBusy(true);
    try { await NGGApi.member.pod.act("relChild", { answers: a }); toast.success("Thank you. Only the coordinator sees your answers."); onDone(); }
    catch (e) { toast.error("That didn’t send. Try again."); setBusy(false); }
  };
  return (
    <PtCard title={"How is it going with " + first + "?"} meta="Four questions. Your answers go to the coordinator; your mentor sees only an average.">
      {qs.map((q, i) => (
        <fieldset key={i} className="mbr-likert">
          <legend>{q}</legend>
          {[1, 2, 3, 4, 5].map(n => (
            <label key={n}><input type="radio" name={"rel" + i} checked={a[i] === n} onChange={() => setA(x => x.map((v, j) => j === i ? n : v))}/><span>{["Not at all", "A little", "Sometimes", "Mostly", "Completely"][n - 1]}</span></label>
          ))}
        </fieldset>
      ))}
      <div className="pt-actions"><button type="button" className="pt-btn pt-btn--ink" disabled={busy || a.includes(0)} onClick={send}>{busy ? "Sending…" : "Send"}</button></div>
    </PtCard>
  );
}

/* ── Grow › Scorecard & goals ────────────────────────────────────────────── */
function MbrScorecard({ seq }) {
  const [seg, setSeg] = React.useState("scorecard");
  const [mine, setMine] = React.useState(null);
  const [state, setState] = React.useState("loading");
  const load = React.useCallback(() => { NGGApi.member.pod.read("mine").then(r => { setMine(r); setState("ready"); }).catch(() => setState("error")); }, []);
  React.useEffect(() => { load(); }, [load, seq]);
  const segs = [["scorecard", "Scorecard"], ["week", "This week"], ["wellness", "Wellness"], ["journey", "Journey"]];
  return (
    <div>
      <div className="pt-seg" role="tablist" aria-label="Scorecard and goals">
        {segs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={seg === k} className={seg === k ? "is-on" : ""} onClick={() => setSeg(k)}>{l}</button>)}
      </div>
      {seg === "scorecard" && <PtLoad state={state} onRetry={load} what="your scorecard">{mine && <MbrIndex mine={mine} onSaved={load}/>}</PtLoad>}
      {seg === "week" && (typeof DashCourage === "function" ? <DashCourage/> : null)}
      {seg === "wellness" && <PtLoad state={state} onRetry={load} what="your check-ins">{mine && <MbrWellness mine={mine}/>}</PtLoad>}
      {seg === "journey" && <MbrJourney/>}
    </div>
  );
}

function MbrIndex({ mine, onSaved }) {
  const skills = mine.skills || [];
  const ms = mine.mentorScores || [];
  const cur = ms[0] ? ms[0].scores : null;
  const self = mine.selfScore ? mine.selfScore.scores : null;
  const [view, setView] = React.useState(cur ? (self ? "both" : "mentor") : "mine");
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try { await NGGApi.member.pod.act("selfScore", { scores: edit }); toast.success("Saved. Your mentor sees it beside theirs."); setEdit(null); onSaved(); }
    catch (_) { toast.error("That didn’t save. Try again."); } finally { setBusy(false); }
  };
  if (edit) return (
    <PtCard title="Score yourself" meta="0 to 10 for each. Be honest; it is a conversation starter, not a test.">
      {skills.map(([name, desc], i) => (
        <label key={name} className="mbr-slider">
          <span><b>{name}</b><small>{desc}</small></span>
          <input type="range" min={0} max={10} value={edit[i]} onChange={e => setEdit(x => x.map((v, j) => j === i ? Number(e.target.value) : v))} aria-valuetext={edit[i] + " of 10"}/>
          <output>{edit[i]}</output>
        </label>
      ))}
      <div className="pt-actions"><button type="button" className="pt-btn" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="pt-btn pt-btn--ink" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save my scores"}</button></div>
    </PtCard>
  );
  const rows = skills.map(([name], i) => ({ name, m: cur ? cur[i] : null, s: self ? self[i] : null }));
  const scored = rows.filter(r => r.m !== null);
  const strongest = scored.slice().sort((a, b) => b.m - a.m).slice(0, 2);
  const next = scored.slice().sort((a, b) => a.m - b.m).slice(0, 2);
  return (
    <React.Fragment>
      <PtCard title="NGG Leadership Index" meta={cur ? "Scored by your mentor for " + ms[0].month + " · " + ms[0].total + "/100" : "Your mentor scores this once a month."}
        action={<button type="button" className="pt-btn pt-btn--sm" onClick={() => setEdit(self ? self.slice() : skills.map(() => 5))}>{mine.selfScoreDue ? "Score yourself" : "Update my scores"}</button>}>
        <div className="pt-seg pt-seg--sm" role="tablist" aria-label="Whose scores">
          {[["mentor", "Mentor’s"], ["mine", "Mine"], ["both", "Side by side"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "is-on" : ""} onClick={() => setView(k)}>{l}</button>)}
        </div>
        <ul className="mbr-index">
          {rows.map(r => {
            const gap = r.m !== null && r.s !== null && Math.abs(r.m - r.s) >= 2;
            return (
              <li key={r.name}>
                <span className="mbr-index-n">{r.name}</span>
                <span className="mbr-index-bars">
                  {(view === "mentor" || view === "both") && <span className="mbr-bar"><span style={{ width: ((r.m || 0) * 10) + "%" }}/><b>{r.m === null ? "–" : r.m}</b></span>}
                  {(view === "mine" || view === "both") && <span className="mbr-bar is-self"><span style={{ width: ((r.s || 0) * 10) + "%" }}/><b>{r.s === null ? "–" : r.s}</b></span>}
                </span>
                {view === "both" && gap && <span className="pt-pill pt-tone-info">Talk about this</span>}
              </li>
            );
          })}
        </ul>
        {view === "both" && <p className="pt-hint">Where you and your mentor are two or more apart, bring it up on Saturday.</p>}
      </PtCard>
      {scored.length > 0 && (
        <div className="pt-grid2">
          <PtCard title="Strongest">{strongest.map(r => <p key={r.name} className="mbr-line"><b>{r.name}</b> {r.m}/10</p>)}</PtCard>
          <PtCard title="Grow next">{next.map(r => <p key={r.name} className="mbr-line"><b>{r.name}</b> {r.m}/10</p>)}</PtCard>
        </div>
      )}
      {ms.length > 1 && (
        <PtCard title="Over time" meta="Your last three scores. Never a rank against anyone else.">
          <ol className="mbr-trend">{ms.slice().reverse().map(x => <li key={x.month}><span style={{ height: Math.max(6, x.total) + "%" }}/><b>{x.total}</b><small>{x.month}</small></li>)}</ol>
        </PtCard>
      )}
      {mine.goal && <PtCard title="Your goal" meta={mine.goal.area}><p>{mine.goal.goal}</p></PtCard>}
    </React.Fragment>
  );
}

function MbrWellness({ mine }) {
  const rows = mine.checkins || [];
  const word = (k, v) => ({ sleep: ["", "Very poor", "Poor", "Okay", "Good", "Great"], stress: ["", "None", "A little", "Some", "A lot", "Too much"], energy: ["", "Empty", "Low", "Okay", "Good", "Full"] }[k][v] || "–");
  return (
    <React.Fragment>
      <MbrMood mentor={mine.mentor} checkin={{ done: !!mine.checkin, wellbeing: mine.checkin ? mine.checkin.wellbeing : "" }} onSent={() => {}}/>
      <PtCard title="Your last weeks" meta="Teenagers need 8–10 hours of sleep. A run of poor nights is worth telling your mentor about.">
        {!rows.length ? <div className="pt-empty">No check-ins yet.</div> : (
          <table className="pt-table">
            <thead><tr><th scope="col">Week</th><th scope="col">Feeling</th><th scope="col">Sleep</th><th scope="col">Stress</th><th scope="col">Energy</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.week}><td className="mono">{r.week}</td><td>{r.wellbeing}</td><td>{word("sleep", r.sleep)}</td><td>{word("stress", r.stress)}</td><td>{word("energy", r.energy)}</td></tr>)}</tbody>
          </table>
        )}
      </PtCard>
    </React.Fragment>
  );
}

function MbrJourney() {
  const [mo, setMo] = React.useState(undefined);
  React.useEffect(() => { NGGApi.member.momentum().then(r => setMo(r.momentum || null), () => setMo(null)); }, []);
  if (mo === undefined) return <PtLoad state="loading" rows={3}/>;
  return typeof DashboardMomentum === "function" ? <DashboardMomentum momentum={mo}/> : null;
}

/* ── Grow › Passport ─────────────────────────────────────────────────────── */
function MbrPassport({ dash }) {
  if (!dash) return <PtLoad state="loading" rows={3}/>;
  return (
    <React.Fragment>
      {typeof DashboardStats === "function" && <DashboardStats stats={dash.stats} prog={typeof canonicalProgress === "function" ? canonicalProgress(dash.stats, null) : null}/>}
      {dash.ngv && typeof DashboardNgv === "function" && <DashboardNgv ngv={dash.ngv}/>}
      <p className="pt-hint"><PIcon name="globe-hemisphere-west"/> Work marked public may appear on the NGG website with your first name only — never your surname, age or school beside a photo.</p>
    </React.Fragment>
  );
}

/* ── Learn ───────────────────────────────────────────────────────────────── */
function MbrLessons({ dash, reload }) {
  return (
    <React.Fragment>
      {typeof DashCurriculum === "function" && <DashCurriculum/>}
      {dash && typeof DashboardAssignments === "function" && <DashboardAssignments assignments={dash.assignments || []} onMutate={reload}/>}
    </React.Fragment>
  );
}
function MbrSaturday({ dash, reload, today }) {
  if (!dash) return <PtLoad state="loading" rows={3}/>;
  const onRsvp = (eventId, status) => NGGApi.member.rsvp({ eventId, status }).then(reload, e => toast.error("Couldn’t update: " + (e.code || e.message)));
  return (
    <React.Fragment>
      {today && <PtCard title={"Saturday " + ptDate(today.week.saturday, { day: "numeric", month: "long" })} meta={[today.week.centre, today.week.track].filter(Boolean).join(" · ")}/>}
      {typeof DashboardToday === "function" && <DashboardToday today={dash.today || []} member={dash.member} onMutate={reload} session={dash.session}/>}
      {typeof DashboardEvents === "function" && <DashboardEvents events={dash.events || []} onRsvp={onRsvp}/>}
    </React.Fragment>
  );
}
function MbrOpps({ dash, reload }) {
  const onRsvp = (eventId, status) => NGGApi.member.rsvp({ eventId, status }).then(reload, e => toast.error("Couldn’t update: " + (e.code || e.message)));
  return (
    <React.Fragment>
      <PtExternal icon="rocket-launch" title="NGV — the volunteer academy" href={window.NGV_URL || "https://afrovanguard.org.ng/academy/ngv/"} cta="See NGV"
        body="From 14 you can train to volunteer: lead a pod, help an instructor, or run a club activity. It counts toward your NGG passport."
        points={["Training first, then a role", "Your mentor recommends you", "Hours are recorded on your passport"]}/>
      {dash && typeof DashboardEvents === "function" && <DashboardEvents events={dash.events || []} onRsvp={onRsvp}/>}
    </React.Fragment>
  );
}

/* ── Account ─────────────────────────────────────────────────────────────── */
function MbrProfile({ today, dash, go }) {
  const p = today && today.profile;
  const m = (dash && dash.member) || {};
  return (
    <React.Fragment>
      {typeof DashboardIdCard === "function" && dash && <DashboardIdCard m={dash.member}/>}
      <PtCard title="Your details" action={<span className="pt-pill">Managed by NGG</span>}
        meta="Your record is kept by NGG and checked with your family. If something is wrong, ask for a change and the desk will fix it.">
        {p ? (
          <dl className="mbr-dl">
            <div><dt>Name</dt><dd>{p.fullName}</dd></div>
            <div><dt>Member ID</dt><dd className="mono">{p.displayId || p.memberId}</dd></div>
            <div><dt>Centre</dt><dd>{p.centre || "–"}</dd></div>
            <div><dt>Course</dt><dd>{p.track || "–"}</dd></div>
            <div><dt>School</dt><dd>{p.school || "–"}</dd></div>
            <div><dt>Date of birth</dt><dd>{p.dob ? ptDate(p.dob, { day: "numeric", month: "long", year: "numeric" }) : "–"}</dd></div>
            <div><dt>Joined</dt><dd>{p.joinDate ? ptDate(p.joinDate, { day: "numeric", month: "long", year: "numeric" }) : "–"}</dd></div>
            <div><dt>Guardian</dt><dd>{p.guardianName || "–"}{p.guardianPhone ? " · " + p.guardianPhone : ""}</dd></div>
          </dl>
        ) : <PtLoad state="loading" rows={4}/>}
        <button type="button" className="pt-btn" onClick={() => go("account", "records", "", "ask=details")}><PIcon name="pencil-simple"/> Ask for a change</button>
      </PtCard>
      {dash && dash.ngv && typeof DashboardNgv === "function" && <DashboardNgv ngv={dash.ngv}/>}
      <PtExternal icon="users" title="Anchor Circle" href="/family" cta="Family account"
        body="The adults linked to you: they see attendance, conduct and fees — never your journal or chats."/>
      {typeof DashboardSecurity === "function" && <DashboardSecurity/>}
      {m.memberId && <p className="pt-hint">You are signed out after 30 minutes without activity on a shared device.</p>}
    </React.Fragment>
  );
}
function MbrMoney({ go }) {
  const [c, setC] = React.useState(null);
  React.useEffect(() => { NGGApi.member.compliance().then(setC, () => {}); }, []);
  return (
    <React.Fragment>
      {typeof DashAccount === "function" && <DashAccount onRaise={k => go("account", "records", "", "ask=" + k)}/>}
      {c && (c.finesOwed > 0 || (c.fines || []).length > 0) && typeof DashboardFines === "function" && <DashboardFines c={c}/>}
    </React.Fragment>
  );
}
function MbrRecords({ go }) {
  const [ask, setAsk] = React.useState(() => mbrQuery("ask"));
  return (
    <React.Fragment>
      {typeof DashRequests === "function" && <DashRequests openKind={ask} onKindHandled={() => { setAsk(""); try { history.replaceState(history.state, "", window.location.pathname); } catch (_) {} }} onCountChange={() => {}}/>}
      {typeof DashRecords === "function" && <DashRecords onRaise={k => setAsk(k)}/>}
    </React.Fragment>
  );
}
function MbrHelp({ today, go }) {
  return (
    <React.Fragment>
      <PtCard title="Talk to someone now" tone="info">
        <ul className="mbr-help">
          <li><PIcon name="handshake"/><span><b>Your mentor</b><small>{today && today.week.mentor ? today.week.mentor.name + " · message them from Mentor" : "Not paired yet — your coordinator can help"}</small></span>
            {today && today.week.mentor && <button type="button" className="pt-btn pt-btn--sm" onClick={() => go("mentor")}>Open</button>}</li>
          <li><PIcon name="lifebuoy"/><span><b>Someone at your centre</b><small>Every Saturday at the front desk. Say you want a private word.</small></span></li>
          <li><PIcon name="phone"/><span><b>If you are in danger</b><small>Call 112 now. Then tell an adult you trust.</small></span><a className="pt-btn pt-btn--sm pt-btn--ink" href="tel:112">Call 112</a></li>
        </ul>
      </PtCard>
      <PtCard title="Tell us about something" meta="Bullying, something that worried you, an idea. Your name goes with it so we can reply; only the welfare lead reads it.">
        <button type="button" className="pt-btn pt-btn--ink" onClick={() => go("account", "records", "", "ask=help")}>Tell us</button>
      </PtCard>
    </React.Fragment>
  );
}
