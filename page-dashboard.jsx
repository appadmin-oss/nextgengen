/* ================================================================
   NGG — Active Member Dashboard.
   This is the page members land on after sign-in. Live data, actionable.
   ================================================================ */

function DashboardPage({ setPage }) {
  const { member, isSignedIn, loading, openSignIn, signOut } = useAuth();
  const [data, setData] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [mutateSeq, setMutateSeq] = React.useState(0);
  const [err, setErr] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  // A real user mutation (mission submit, journal, RSVP) bumps both the
  // dashboard reload and a mutation sequence the activity feed listens to —
  // separating it from the silent 60s poll so the feed isn't double-fetched.
  const onMutate = React.useCallback(() => {
    setReload(r => r + 1);
    setMutateSeq(s => s + 1);
  }, []);

  React.useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    if (reload > 0) setRefreshing(true);
    NGGApi.member.dashboard()
      .then(d => { if (alive) { setData(d); setErr(""); } })
      // Only surface the full error screen on the FIRST load. A transient
      // poll failure must not wipe an already-loaded dashboard to "off-line"
      // — keep showing the last good data (stale-while-revalidate).
      .catch(e => { if (alive) setErr(prev => data ? prev : (e.code || e.message)); })
      .finally(() => { if (alive) setRefreshing(false); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [isSignedIn, reload]);

  // Poll every 60s to keep stats and notifications fresh — but only when
  // the tab is visible. Background tabs drained battery + burned API
  // calls (members reported the dashboard chewing data on phones left
  // in their pocket). We also refresh immediately on becoming-visible
  // so the dashboard is current the moment they look at it.
  React.useEffect(() => {
    if (!isSignedIn) return;
    let id = null;
    const start = () => { if (!id) id = setInterval(() => setReload(r => r + 1), 60000); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => {
      if (document.hidden) stop();
      else { setReload(r => r + 1); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [isSignedIn]);

  if (loading) {
    return <DashboardShell><DashboardSkeleton/></DashboardShell>;
  }
  if (!isSignedIn) {
    return <DashboardShell><DashboardSignedOut openSignIn={openSignIn} setPage={setPage}/></DashboardShell>;
  }
  // Full error screen only when we have nothing to show.
  if (err && !data) {
    return <DashboardShell><DashboardError code={err} onRetry={() => setReload(r => r + 1)}/></DashboardShell>;
  }
  if (!data) {
    return <DashboardShell><DashboardSkeleton/></DashboardShell>;
  }

  return (
    <DashboardShell>
      <DashboardLive
        data={data}
        setPage={setPage}
        refreshing={refreshing}
        mutateSeq={mutateSeq}
        onMutate={onMutate}
        onSignOut={signOut}
      />
    </DashboardShell>
  );
}

function DashboardShell({ children }) {
  return (
    <div className="page dashboard" data-screen-label="05 Dashboard">
      {children}
    </div>
  );
}

// ============================================================================
// Signed-out screen — a sales pitch for what's behind the wall.
// ============================================================================

function DashboardSignedOut({ openSignIn, setPage }) {
  return (
    <section className="signed-out-hero" style={{padding: "112px 0 96px"}}>
      <div className="container">
        <div className="signed-out-grid">
          <div>
            <div className="eyebrow" style={{color:"var(--gold-500)"}}>MEMBERS · DASHBOARD</div>
            <h1 className="display signed-out-h1">Your room is waiting.</h1>
            <p className="signed-out-p">
              The Anchor 12 dashboard, your streak, today's missions, your mentor,
              your journal, the next session countdown — all of it lives inside.
              Sign in to step in.
            </p>
            <div className="signed-out-cta">
              <button className="btn btn-primary btn-lg" onClick={() => openSignIn()}>
                Sign in →
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => setPage("join")}>
                Apply for a session
              </button>
            </div>
            <ul className="signed-out-list">
              <li><span/>Daily missions tied to the Anchor book</li>
              <li><span/>Mentor reviews and XP tracking</li>
              <li><span/>Session events, RSVPs and reminders for Egbeda and Ayobo</li>
              <li><span/>Private reflection journal — only you and your mentor</li>
            </ul>
          </div>
          <div className="signed-out-preview" aria-hidden="true">
            <div className="signed-out-card">
              <div className="signed-out-card-bar"/>
              <div className="signed-out-card-bar w70"/>
              <div className="signed-out-card-bar w50"/>
              <div className="signed-out-card-grid">
                <div/><div/><div/><div/><div/><div/>
              </div>
            </div>
            <div className="signed-out-card-blur"/>
          </div>
        </div>
      </div>
    </section>
  );
}

// Skeleton that mirrors the real dashboard layout, so the page doesn't
// jump from a centered spinner to a full grid — it fills in place.
function DashboardSkeleton() {
  return (
    <React.Fragment>
      <section className="dash-hero" aria-hidden="true">
        <div className="container">
          <div className="dash-hero-row">
            <div className="dash-hero-id">
              <div className="dash-skel dash-skel-avatar"/>
              <div>
                <div className="dash-skel dash-skel-line" style={{width:120, height:11, marginBottom:10}}/>
                <div className="dash-skel dash-skel-line" style={{width:180, height:34, marginBottom:12}}/>
                <div style={{display:"flex", gap:6}}>
                  <div className="dash-skel dash-skel-chip"/>
                  <div className="dash-skel dash-skel-chip"/>
                </div>
              </div>
            </div>
            <div className="dash-skel dash-skel-line" style={{width:140, height:64}}/>
          </div>
        </div>
      </section>
      <section className="dash-section">
        <div className="container">
          <div className="dash-grid">
            <div className="dash-main">
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"40%", height:24}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:60, marginTop:16}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:60, marginTop:10}}/></div>
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"30%", height:20}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:48, marginTop:14}}/></div>
            </div>
            <div className="dash-rail">
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"50%", height:18}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:72, marginTop:14}}/></div>
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"60%", height:18}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:40, marginTop:14}}/></div>
            </div>
          </div>
        </div>
      </section>
      <span className="sr-only" role="status">Loading your dashboard…</span>
    </React.Fragment>
  );
}

function DashboardError({ code, onRetry }) {
  return (
    <section style={{padding:"120px 0", textAlign:"center"}}>
      <div className="display" style={{fontSize:48, color:"var(--coral)"}}>off-line</div>
      <p style={{marginTop:18, color:"var(--ink-500)"}}>{code === "upstream_unreachable" ? "We couldn't reach the data server. Try again in a moment." : "Something went wrong loading your dashboard."}</p>
      <button className="btn btn-primary" onClick={onRetry} style={{marginTop:24}}>Try again</button>
    </section>
  );
}

// ============================================================================
// LIVE dashboard
// ============================================================================

function DashboardLive({ data, setPage, refreshing, mutateSeq, onMutate, onSignOut }) {
  const m = data.member;
  const s = data.stats;
  const session = data.session;
  const today = data.today || [];
  const mentor = data.mentor;
  const ngv = data.ngv;   // set once promoted up the chain into the NGV/volunteer tier

  // Events + notifications are held locally so RSVP and mark-as-read feel
  // instant (optimistic), then reconcile with the next server payload.
  const [events, setEvents] = React.useState(data.events || []);
  const [notes, setNotes] = React.useState(data.notifications || []);
  React.useEffect(() => { setEvents(data.events || []); }, [data.events]);
  React.useEffect(() => { setNotes(data.notifications || []); }, [data.notifications]);

  // Canonical reflection-economy progression — fetched once here and shared by
  // the Stats and Momentum cards so the dashboard never shows two different
  // levels for the same member (and matches the Anchor Journal exactly).
  const [momentum, setMomentum] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.momentum().then(r => { if (alive) setMomentum(r.momentum); }).catch(() => {});
    return () => { alive = false; };
  }, [mutateSeq]);

  /* The member's own account. We charge members and email their guardian a figure
     every fortnight, and until now the member could see none of it — including the
     training fee being written off as they serve, which is the most encouraging
     number in the whole subsystem. Fetched separately and failing silently: an
     account that will not load must not take the dashboard with it. */
  const [account, setAccount] = React.useState(null);
  // Distinct states so the account panel is never a silent void. A member who
  // sees nothing should learn whether fees simply aren't switched on for them,
  // or a read failed and can be retried — not be left guessing it's broken.
  const [acctState, setAcctState] = React.useState("loading"); // loading|ok|disabled|hidden|error
  const [acctRetry, setAcctRetry] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.fees()
      .then(r => {
        if (!alive) return;
        if (r && r.enabled) { setAccount(r.account); setAcctState("ok"); }
        else { setAccount(null); setAcctState(r && r.reason === "disabled" ? "disabled" : "hidden"); }
      })
      .catch(() => { if (alive) { setAccount(null); setAcctState("error"); } });
    return () => { alive = false; };
  }, [mutateSeq, acctRetry]);

  // Policy fines + compliance standing — a SEPARATE ledger from dues/fees
  // (these are disciplinary sanctions), fetched independently and never gated
  // by the fees feature toggle.
  const [compliance, setCompliance] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.compliance()
      .then(r => { if (alive) setCompliance(r || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mutateSeq]);

  const prog = canonicalProgress(s, momentum);
  const showFines = !!(compliance && (compliance.finesOwed > 0 || (compliance.fines || []).length > 0
    || ["warned", "suspended", "evicted", "dormant"].includes(compliance.state) || compliance.awaitingReview));

  // Optimistic RSVP: flip local state now (authoritative once the request
  // succeeds), roll back + toast on failure. We deliberately do NOT trigger
  // a full dashboard refetch — RSVP doesn't change stats/missions, and a
  // refetch would clobber the optimistic flip with a momentarily-stale
  // payload. The 60s poll reconciles in the background.
  const onRsvp = (eventId, status) => {
    const prev = events;
    setEvents(evs => evs.map(e => e.eventId === eventId ? { ...e, myRsvp: status === "going" ? "going" : null } : e));
    NGGApi.member.rsvp({ eventId, status })
      .catch(e => { setEvents(prev); toast.error("Couldn't update RSVP: " + humanError(e)); });
  };

  // Mark-as-read is fire-and-forget and doesn't affect stats either.
  const onRead = (id) => {
    setNotes(ns => ns.map(n => n.notifId === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n));
    NGGApi.member.markRead(id).catch(() => {/* non-critical */});
  };

  const [editProfile, setEditProfile] = React.useState(false);

  // Portal-style chrome: a sticky sidebar rail + top-bar strip + KPI row wrap
  // the member's existing cards, so the NGG dashboard shares the Afrovanguard
  // member portal's LAYOUT system while keeping NGG's own navy/gold/cream skin
  // and typefaces. The cards themselves are unchanged — each is wrapped in a
  // <section id> so the rail can navigate to it.
  const first = String(m.fullName || "").split(" ")[0] || "Member";
  const greeting = hourGreeting();
  const unread = notes.filter(n => !n.readAt).length;
  const owed = account ? account.payable : 0;

  return (
    <React.Fragment>
      {editProfile && <DashboardProfileModal m={m} onClose={() => setEditProfile(false)} onSaved={() => { setEditProfile(false); onMutate(); }}/>}
      <section className="dash-section ngg-dash" data-screen-label="05 Dashboard">
        <div className="container ngg-dash-wrap">

          <DashboardSidebar
            m={m} first={first} account={account} ngv={!!ngv}
            fines={showFines ? (compliance.finesOwed || 0) : null}
            counts={{ today: today.length, events: events.length, notes: unread }}
            onSignOut={onSignOut} onEditProfile={() => setEditProfile(true)}/>

          <div className="ngg-main">
            <div className="ngg-top">
              <div className="ngg-crumb">
                <span>Next Generation Genius</span>
                <span className="ngg-crumb-sep">/</span>
                <span className="ngg-crumb-here">My dashboard</span>
                {refreshing && <span className="dash-refreshing" title="Refreshing…" aria-hidden="true"/>}
              </div>
              <div className="ngg-top-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setEditProfile(true)}>Edit profile</button>
                <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
              </div>
            </div>

            <div className="ngg-scroll">
              <header className="ngg-head">
                <div className="mono ngg-head-eyebrow">{greeting.toUpperCase()} · {m.memberId}</div>
                <h1 className="ngg-head-name">{greeting}, {first}.</h1>
                <p className="ngg-head-sub">Your Anchor 12 room — today's missions, your tally, your mentor and your account, all in one place.</p>
              </header>

              <DashboardKpis session={session} prog={prog} stats={s} account={account} acctState={acctState}/>

              <div className="dash-grid">
                {/* LEFT MAIN COLUMN */}
                <div className="dash-main">
                  <section id="sec-today" className="ngg-anchor"><DashboardToday today={today} member={m} onMutate={onMutate} session={session}/></section>
                  <section id="sec-assignments" className="ngg-anchor"><DashboardAssignments assignments={data.assignments || []} onMutate={onMutate}/></section>
                  <section id="sec-activity" className="ngg-anchor"><DashboardActivityFeed memberId={m.memberId} session={session} reloadKey={mutateSeq}/></section>
                  <section id="sec-journal" className="ngg-anchor"><DashboardJournal onMutate={onMutate}/></section>
                </div>

                {/* RIGHT RAIL */}
                <div className="dash-rail">
                  <section id="sec-id" className="ngg-anchor"><DashboardIdCard m={m}/></section>
                  {ngv && <section id="sec-ngv" className="ngg-anchor"><DashboardNgv ngv={ngv}/></section>}
                  <section id="sec-stats" className="ngg-anchor"><DashboardStats stats={s} prog={prog}/></section>
                  <section id="sec-momentum" className="ngg-anchor"><DashboardMomentum momentum={momentum}/></section>
                  {mentor && <section id="sec-mentor" className="ngg-anchor"><DashboardMentor mentor={mentor}/></section>}
                  {(account || acctState === "disabled" || acctState === "error") && (
                    <section id="sec-account" className="ngg-anchor">
                      {account
                        ? <DashboardObligations account={account}/>
                        : <div className="dash-card dash-account">
                            <div className="dash-card-head"><h3 className="dash-card-h-sm">Your account.</h3></div>
                            {acctState === "error"
                              ? <React.Fragment>
                                  <p className="dash-account-sub" style={{ margin: "8px 0 12px" }}>Couldn't load your account just now.</p>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setAcctRetry(n => n + 1)}>Try again</button>
                                </React.Fragment>
                              : <p className="dash-account-sub" style={{ margin: "8px 0 0" }}>Dues &amp; fees aren't switched on yet.</p>}
                          </div>}
                    </section>
                  )}
                  {showFines && (
                    <section id="sec-fines" className="ngg-anchor"><DashboardFines c={compliance}/></section>
                  )}
                  <section id="sec-events" className="ngg-anchor"><DashboardEvents events={events} onRsvp={onRsvp}/></section>
                  <section id="sec-notifs" className="ngg-anchor"><DashboardNotifications notes={notes} onRead={onRead}/></section>
                  <section id="sec-shortcuts" className="ngg-anchor"><DashboardShortcuts setPage={setPage}/></section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}

// The portal-style sidebar rail: member identity, in-page section nav (with a
// scrollspy + a mobile collapse), and the sign-out/edit actions.
function DashboardSidebar({ m, first, account, ngv, fines, counts, onSignOut, onEditProfile }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState("sec-today");
  const owed = account ? account.payable : 0;
  const hasPhoto = m.photoUrl && /^https?:\/\//.test(m.photoUrl);

  const groups = [
    { g: "Today", items: [
      { id: "sec-today", label: "Today's missions", badge: counts.today || null },
      { id: "sec-assignments", label: "Assignments" },
      { id: "sec-activity", label: "Activity" },
      { id: "sec-journal", label: "Journal" },
    ] },
    { g: "You", items: [
      { id: "sec-id", label: "Member ID" },
      ...(ngv ? [{ id: "sec-ngv", label: "Your NGV role" }] : []),
      { id: "sec-stats", label: "Your tally" },
      { id: "sec-momentum", label: "Momentum" },
      ...(account ? [{ id: "sec-account", label: "Your account", badge: owed > 0 ? naira(owed) : null }] : []),
      ...(fines != null ? [{ id: "sec-fines", label: "Policy fines", badge: fines > 0 ? naira(fines) : null }] : []),
      { id: "sec-events", label: "Events", badge: counts.events || null },
      { id: "sec-notifs", label: "Notifications", badge: counts.notes || null },
    ] },
  ];

  // Scrollspy — highlight the section currently in view. Runs once; observes
  // whatever section ids are present in the DOM.
  React.useEffect(() => {
    const ids = groups.reduce((a, grp) => a.concat(grp.items.map(i => i.id)), []);
    const els = ids.map(id => document.getElementById(id)).filter(Boolean);
    if (!("IntersectionObserver" in window) || !els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-40% 0px -55% 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []); // eslint-disable-line

  const go = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };

  return (
    <aside className={"ngg-side" + (open ? " is-open" : "")}>
      <button className="ngg-side-toggle btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>☰ Sections</button>
      <div className="ngg-side-inner">
        <button className="ngg-side-brand" onClick={onEditProfile} title="Edit your profile">
          {hasPhoto
            ? <img src={m.photoUrl} alt="" className="ngg-side-avatar-img" onError={(e) => { e.target.style.display = "none"; }}/>
            : <Avatar seed={m.memberId.charCodeAt(m.memberId.length - 1) % 20 + 1} size={40} ring/>}
          <span className="ngg-side-brand-text"><b>{first}</b><span className="mono">{m.memberId}</span></span>
        </button>
        <nav className="ngg-nav">
          {groups.map(grp => (
            <div className="ngg-nav-group" key={grp.g}>
              <div className="ngg-nav-title">{grp.g}</div>
              {grp.items.map(it => (
                <a key={it.id} href={"#" + it.id} onClick={go(it.id)}
                   className={"ngg-nav-link" + (active === it.id ? " is-active" : "")}>
                  <span className="ngg-nav-dot"/>
                  <span className="ngg-nav-label">{it.label}</span>
                  {it.badge && <span className="ngg-nav-badge">{it.badge}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="ngg-side-user">
          <button className="btn btn-ghost btn-sm" onClick={onEditProfile}>Edit profile</button>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}

// The KPI row — the four headline numbers, read from the same data the cards
// below use, so nothing can disagree.
function DashboardKpis({ session, prog, stats, account, acctState }) {
  const now = new Date();
  let sessN = "—", sessSub = "no active session";
  if (session) {
    const start = new Date(session.startDate), end = new Date(session.endDate);
    const wk = " · week " + session.weekOf + "/" + session.totalWeeks;
    if (now < start) { sessN = Math.ceil((start - now) / 86400000) + "d"; sessSub = "to start" + wk; }
    else { sessN = Math.max(0, Math.ceil((end - now) / 86400000)) + "d"; sessSub = "left" + wk; }
  }
  const owed = account ? account.payable : null;
  return (
    <div className="ngg-kpis">
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Session</span>{session && <span className="chip chip-gold">{session.code}</span>}</div>
        <div className="ngg-kpi-n">{sessN}</div>
        <div className="ngg-kpi-s">{sessSub}</div>
      </div>
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Level</span><span className="chip chip-gold">{prog.rank.name}</span></div>
        <div className="ngg-kpi-n">{String(prog.level).padStart(2, "0")}</div>
        <div className="ngg-kpi-s">{prog.total.toLocaleString()} XP{prog.next ? " · next at " + prog.next.at.toLocaleString() : " · top rank"}</div>
      </div>
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Streak</span></div>
        <div className="ngg-kpi-n">{stats.streak}<span className="ngg-kpi-u">d</span></div>
        <div className="ngg-kpi-s">{stats.badgeCount} badge{stats.badgeCount === 1 ? "" : "s"} earned</div>
      </div>
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Account</span>{owed != null && <span className={"chip " + (owed > 0 ? "chip-coral" : "chip-lime")}>{owed > 0 ? "Due" : "Clear"}</span>}</div>
        <div className={"ngg-kpi-n" + (owed === 0 ? " is-clear" : "")}>{account ? (owed > 0 ? naira(owed) : "Clear") : "—"}</div>
        <div className="ngg-kpi-s">{account ? (owed > 0 ? "outstanding" : "nothing outstanding")
          : acctState === "disabled" ? "not enabled yet"
          : acctState === "error" ? "unavailable"
          : acctState === "hidden" ? "—"
          : "loading…"}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

// Compact member profile editor with a Cloudinary avatar upload.
function DashboardProfileModal({ m, onClose, onSaved }) {
  const socials = (m.socials && typeof m.socials === "object") ? m.socials : {};
  const [d, setD] = React.useState({
    photoUrl: m.photoUrl || "",
    bio: m.bio || "",
    phone: m.phone || "",
    instagram: socials.instagram || "",
    school: m.school || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await NGGApi.member.updateProfile({
        photoUrl: d.photoUrl, bio: d.bio, phone: d.phone, school: d.school,
        socials: { instagram: d.instagram },
      });
      toast.success("Profile updated");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save: " + humanError(e));
    } finally { setBusy(false); }
  };
  const hasPhoto = d.photoUrl && /^https?:\/\//.test(d.photoUrl);

  // Password — opt-in. Members sign in with a code; setting a password here
  // lets them use the standard email + password login next time.
  const hasPw = !!m.hasPassword;
  const [pw, setPw] = React.useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwDone, setPwDone] = React.useState(false);
  const setP = (k, v) => setPw(o => Object.assign({}, o, { [k]: v }));
  const savePassword = async () => {
    if (pw.next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw.next !== pw.confirm) { toast.error("Passwords don't match"); return; }
    setPwBusy(true);
    try {
      await NGGApi.auth.setPassword(pw.next, pw.current);
      setPwDone(true);
      setPw({ current: "", next: "", confirm: "" });
      toast.success(hasPw ? "Password changed" : "Password set — you can use it to sign in");
    } catch (e) {
      toast.error("Couldn't save password: " + humanError(e));
    } finally { setPwBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>Edit profile</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="admin-fields">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {hasPhoto
              ? <img src={d.photoUrl} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }}/>
              : <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--cream-100)", display: "grid", placeItems: "center", fontSize: 28 }}>🙂</div>}
            <div className="admin-upload-row">
              <input type="text" className="admin-input" value={d.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="Upload → or paste a photo URL"/>
              <Uploader kind="avatar" accept="image/*" onUploaded={(url) => set("photoUrl", url)} compact/>
            </div>
          </div>
          <label className="admin-field"><span>Short bio</span><textarea className="admin-input" rows={3} value={d.bio} onChange={(e) => set("bio", e.target.value)} placeholder="One or two lines about you."/></label>
          <div className="admin-fields-row">
            <label className="admin-field"><span>Phone</span><input className="admin-input" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234…"/></label>
            <label className="admin-field"><span>School</span><input className="admin-input" value={d.school} onChange={(e) => set("school", e.target.value)} placeholder="Your school"/></label>
          </div>
          <label className="admin-field"><span>Instagram</span><input className="admin-input" value={d.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle or link"/></label>

          <div style={{ borderTop: "1px solid rgba(12,20,50,0.08)", margin: "6px 0 2px", paddingTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{hasPw ? "Change password" : "Set a password"}</div>
            <div style={{ fontSize: 13, color: "var(--ink-500)", margin: "4px 0 12px" }}>
              {hasPw ? "Update the password you use to sign in." : "Optional — set one to sign in with email + password instead of a code each time."}
            </div>
            {hasPw && (
              <label className="admin-field"><span>Current password</span><input className="admin-input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setP("current", e.target.value)}/></label>
            )}
            <div className="admin-fields-row">
              <label className="admin-field"><span>New password</span><input className="admin-input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setP("next", e.target.value)} placeholder="At least 8 characters"/></label>
              <label className="admin-field"><span>Confirm</span><input className="admin-input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setP("confirm", e.target.value)}/></label>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pwBusy || !pw.next} onClick={savePassword}>
              {pwBusy ? "Saving…" : pwDone ? "Saved ✓" : (hasPw ? "Change password" : "Set password")}
            </button>
          </div>

          <DashboardSecurity/>
          <DashboardAccount m={m}/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save profile"}</button>
        </div>
      </div>
    </div>
  );
}

// Active-device list with per-device + "sign out everywhere else" revoke.
function DashboardSecurity() {
  const [d, setD] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const load = () => NGGApi.member.security().then(setD).catch(() => setD({ sessions: [] }));
  React.useEffect(() => { load(); }, []);
  const shortUA = (ua) => {
    if (!ua) return "Unknown device";
    const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Mac/i.test(ua) ? "macOS" : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "Device";
    const br = /Chrome/i.test(ua) ? "Chrome" : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "browser";
    return os + " · " + br;
  };
  const revoke = async (sid) => { setBusy(sid); try { await NGGApi.member.securityRevoke(sid); load(); } catch (e) { toast.error(humanError(e)); } finally { setBusy(""); } };
  const revokeOthers = async () => {
    if (!confirm("Sign out of every other device?")) return;
    setBusy("others"); try { const r = await NGGApi.member.securityRevokeOthers(); toast.success("Signed out " + (r.revoked || 0) + " other device(s)."); load(); } catch (e) { toast.error(humanError(e)); } finally { setBusy(""); }
  };
  const sessions = d ? (d.sessions || []) : null;
  return (
    <div style={{ borderTop: "1px solid rgba(12,20,50,0.08)", margin: "6px 0 2px", paddingTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Devices &amp; security</div>
      <div style={{ fontSize: 13, color: "var(--ink-500)", margin: "4px 0 12px" }}>Where you're signed in. Revoke any you don't recognise.</div>
      {sessions === null ? <div className="dash-spinner"/> :
        sessions.length === 0 ? <div style={{ fontSize: 13, color: "var(--ink-500)" }}>No active devices.</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map(s => (
            <div key={s.sid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13, padding: "8px 10px", border: "1px solid rgba(12,20,50,0.08)", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{shortUA(s.device)} {s.current ? <span className="chip chip-lime" style={{ fontSize: 10 }}>this device</span> : null}</div>
                <div className="mono" style={{ color: "var(--ink-500)", fontSize: 11 }}>{s.ip || "—"}{s.lastSeenAt ? " · last seen " + fmtDate(s.lastSeenAt) : ""}</div>
              </div>
              {!s.current && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === s.sid} onClick={() => revoke(s.sid)}>{busy === s.sid ? "…" : "Sign out"}</button>}
            </div>
          ))}
          {sessions.filter(s => !s.current).length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === "others"} onClick={revokeOthers} style={{ alignSelf: "flex-start", marginTop: 4 }}>{busy === "others" ? "Signing out…" : "Sign out everywhere else"}</button>
          )}
        </div>}
    </div>
  );
}

// Account: verified email change, data export, and account deletion.
function DashboardAccount({ m }) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const changeEmail = async () => {
    if (!email.trim()) return;
    setBusy("email");
    try { const r = await NGGApi.member.changeEmail(email.trim()); toast.success("Confirmation sent to " + (r.pending || email.trim()) + ". Click the link there to finish.", "Check your new inbox"); setEmail(""); }
    catch (e) { toast.error(humanError(e)); } finally { setBusy(""); }
  };
  const exportData = async () => {
    setBusy("export");
    try {
      const r = await NGGApi.member.exportData();
      const blob = new Blob([JSON.stringify(r.export || r, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ngg-my-data.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast.error(humanError(e)); } finally { setBusy(""); }
  };
  const del = async () => {
    if (!confirm("Delete your account? This removes your profile and journal and signs you out. This cannot be undone.")) return;
    if (!confirm("Are you absolutely sure? There is no undo.")) return;
    setBusy("delete");
    try { await NGGApi.member.deleteAccount(); toast.success("Your account has been deleted."); setTimeout(() => { window.location.href = "/"; }, 800); }
    catch (e) { toast.error(humanError(e)); setBusy(""); }
  };
  return (
    <div style={{ borderTop: "1px solid rgba(12,20,50,0.08)", margin: "6px 0 2px", paddingTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Account</div>
      <div style={{ fontSize: 13, color: "var(--ink-500)", margin: "4px 0 12px" }}>Current email: <b>{m.email}</b></div>
      <label className="admin-field"><span>Change email (needs confirmation)</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="admin-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="new@email.com"/>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === "email" || !email.trim()} onClick={changeEmail}>{busy === "email" ? "…" : "Send link"}</button>
        </div>
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === "export"} onClick={exportData}>{busy === "export" ? "Preparing…" : "Download my data"}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === "delete"} onClick={del} style={{ color: "#b03535" }}>Delete my account</button>
      </div>
    </div>
  );
}

function DashboardToday({ today, member, onMutate, session }) {
  const [busy, setBusy] = React.useState({});
  const [proofFor, setProofFor] = React.useState(null); // mission awaiting a proof modal
  const submit = async (m) => {
    // Quick-complete missions (proof=none) finish in one tap. Everything else
    // opens the proof modal — which offers a real media upload for
    // photo/audio/video/file proof, and a link/note field otherwise.
    if (m.proof === "none") {
      setBusy(b => Object.assign({}, b, { [m.missionId]: true }));
      try {
        await NGGApi.member.submitMission({ missionId: m.missionId });
        toast.success("+" + m.xp + " XP locked in", m.title);
        onMutate();
      } catch (e) {
        toast.error("Couldn't submit: " + humanError(e), "Try again");
      } finally {
        setBusy(b => Object.assign({}, b, { [m.missionId]: false }));
      }
      return;
    }
    setProofFor(m);
  };

  const sendProof = async (m, proofUrl) => {
    setBusy(b => Object.assign({}, b, { [m.missionId]: true }));
    try {
      await NGGApi.member.submitMission({ missionId: m.missionId, proofUrl });
      toast.success("Sent to mentor for review", m.title);
      setProofFor(null);
      onMutate();
    } catch (e) {
      toast.error("Couldn't submit: " + humanError(e), "Try again");
    } finally {
      setBusy(b => Object.assign({}, b, { [m.missionId]: false }));
    }
  };

  const ready = today.filter(t => t.status === "todo" || t.status === "rejected");
  const pending = today.filter(t => t.status === "submitted");
  const done = today.filter(t => t.status === "verified");

  return (
    <div className="dash-card dash-today">
      <div className="dash-card-head">
        <div>
          <div className="eyebrow" style={{color:"var(--gold-500)"}}>TODAY · WEEK {session ? session.weekOf : 1}</div>
          <h2 className="dash-card-h">Your missions.</h2>
        </div>
        <div className="dash-today-tally">
          <span className="dash-today-tally-n">{done.length}</span>
          <span className="dash-today-tally-d">/ {today.length} done</span>
        </div>
      </div>
      {today.length === 0 && (
        <div className="dash-empty">
          <div className="dash-empty-num">00</div>
          <div className="dash-empty-text">No missions yet for this week.<br/>Your mentor will publish them soon.</div>
        </div>
      )}
      {ready.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h">READY · {ready.length}</div>
          {ready.map(m => (
            <DashboardMissionRow key={m.missionId} m={m} busy={busy[m.missionId]} onSubmit={() => submit(m)}/>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h" style={{color:"var(--gold-500)"}}>WAITING ON MENTOR · {pending.length}</div>
          {pending.map(m => (
            <DashboardMissionRow key={m.missionId} m={m} disabled/>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h" style={{color:"var(--lime-ink)", opacity:0.7}}>DONE · {done.length}</div>
          {done.map(m => (
            <DashboardMissionRow key={m.missionId} m={m} done/>
          ))}
        </div>
      )}
      {proofFor && (
        <MissionProofModal
          m={proofFor}
          busy={!!busy[proofFor.missionId]}
          onClose={() => setProofFor(null)}
          onSubmit={(url) => sendProof(proofFor, url)}
        />
      )}
    </div>
  );
}

// Proof capture modal. For photo/audio/video/file proof it shows a real
// Cloudinary upload (with a URL/note fallback); for link/text it's a field.
function MissionProofModal({ m, busy, onClose, onSubmit }) {
  const isMedia = ["photo", "audio", "video", "file"].includes(m.proof);
  const accept = m.proof === "photo" ? "image/*" : m.proof === "audio" ? "audio/*" : m.proof === "video" ? "video/*" : "*/*";
  const [note, setNote] = React.useState("");
  const [fileUrl, setFileUrl] = React.useState("");
  const value = isMedia ? (fileUrl || note) : note;
  const canSubmit = !!String(value).trim() && !busy;
  const label = m.proof === "photo" ? "Upload a photo" : m.proof === "audio" ? "Upload an audio clip"
    : m.proof === "video" ? "Upload a video" : m.proof === "file" ? "Upload a file"
    : m.proof === "link" ? "Paste a link" : "Describe what you did";
  return (
    <div className="admin-drawer" onClick={onClose}>
      <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>{m.title}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="admin-fields">
          <p style={{ color: "var(--ink-500)", margin: "0 0 4px", fontSize: 14 }}>{m.prompt}</p>
          {isMedia ? (
            <React.Fragment>
              <label className="admin-field">
                <span>{label}</span>
                <div className="admin-upload-row">
                  <input type="text" className="admin-input" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Upload → or paste a link"/>
                  <Uploader kind="proof" accept={accept} onUploaded={(url) => setFileUrl(url)} compact/>
                </div>
              </label>
              {fileUrl && /^https?:\/\//.test(fileUrl) && (m.proof === "photo") && (
                <span className="admin-upload-preview"><img src={fileUrl} alt="" onError={(e) => { e.target.style.display = "none"; }}/></span>
              )}
              <label className="admin-field">
                <span>Add a note (optional)</span>
                <textarea className="admin-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything your mentor should know…"/>
              </label>
            </React.Fragment>
          ) : (
            <label className="admin-field">
              <span>{label}</span>
              {m.proof === "link"
                ? <input type="text" className="admin-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="https://… or a short note"/>
                : <textarea className="admin-input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="I shipped…"/>}
            </label>
          )}
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => onSubmit(isMedia && fileUrl ? fileUrl + (note.trim() ? " — " + note.trim() : "") : value)}>
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardMissionRow({ m, onSubmit, busy, done, disabled }) {
  return (
    <div className={"dash-mission" + (done ? " is-done" : "") + (disabled ? " is-disabled" : "")}>
      <div className="dash-mission-icon" aria-hidden="true">
        {done ? "✓" : disabled ? "⏳" : m.type === "Make" ? "✦" : m.type === "Read" ? "✺" : m.type === "Speak" ? "▶" : m.type === "Move" ? "→" : "◎"}
      </div>
      <div className="dash-mission-body">
        <div className="dash-mission-title">{m.title}</div>
        <div className="dash-mission-prompt">{m.prompt}</div>
        <div className="dash-mission-meta">
          <span>{m.type}</span>
          <span>·</span>
          <span>+{m.xp} XP</span>
          {m.estimatedMin > 0 && <><span>·</span><span>{m.estimatedMin} min</span></>}
          {m.bookPage > 0 && <><span>·</span><span>Anchor p.{m.bookPage}</span></>}
        </div>
      </div>
      {!done && !disabled && (
        <button className="btn btn-primary btn-sm dash-mission-cta" onClick={onSubmit} disabled={busy}>
          {busy ? "…" : (m.proof === "none" ? "Done" : "Submit")}
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function DashboardAssignments({ assignments, onMutate }) {
  if (!assignments || assignments.length === 0) return null;
  const open = assignments.filter(a => !a.submission || a.submission.status === "submitted");
  const graded = assignments.filter(a => a.submission && a.submission.status === "graded");
  return (
    <div className="dash-card dash-assign">
      <div className="dash-card-head">
        <div>
          <div className="eyebrow" style={{color:"var(--gold-500)"}}>ASSIGNMENTS</div>
          <h2 className="dash-card-h">Set work.</h2>
        </div>
        <div className="dash-today-tally"><span className="dash-today-tally-n">{graded.length}</span><span className="dash-today-tally-d">/ {assignments.length} graded</span></div>
      </div>
      {open.map(a => <AssignmentCard key={a.assignmentId} a={a} onMutate={onMutate}/>)}
      {graded.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h" style={{color:"var(--lime-ink)", opacity:0.7}}>GRADED · {graded.length}</div>
          {graded.map(a => <AssignmentCard key={a.assignmentId} a={a} onMutate={onMutate}/>)}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ a, onMutate }) {
  const sub = a.submission;
  const graded = sub && sub.status === "graded";
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(sub ? sub.text : "");
  const [fileUrl, setFileUrl] = React.useState(sub ? sub.fileUrl : "");
  const [busy, setBusy] = React.useState(false);
  const overdue = a.dueAt && !graded && new Date(a.dueAt) < new Date();

  const submit = async () => {
    if (!text.trim() && !fileUrl) { toast.error("Add a response or upload a file first"); return; }
    setBusy(true);
    try {
      await NGGApi.member.submitAssignment({ assignmentId: a.assignmentId, text: text.trim(), fileUrl });
      toast.success(sub ? "Submission updated" : "Submitted", a.title);
      setOpen(false); onMutate && onMutate();
    } catch (e) { toast.error("Couldn't submit: " + humanError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className={"dash-assign-card" + (graded ? " is-graded" : "")}>
      <div className="dash-assign-top" onClick={() => !graded && setOpen(o => !o)}>
        <div>
          <div className="dash-assign-title">{a.title}</div>
          <div className="dash-assign-meta">
            {a.points} pts
            {a.dueAt && <> · <span className={overdue ? "is-overdue" : ""}>due {fmtShortDate(a.dueAt)}</span></>}
            {a.track && <> · {a.track}</>}
          </div>
        </div>
        {graded
          ? <div className="dash-assign-grade">{sub.grade}<span>/{a.points}</span></div>
          : <span className={"chip status-" + (sub ? "published" : "draft")}>{sub ? "submitted" : "to do"}</span>}
      </div>
      {a.instructions && <div className="dash-assign-instructions">{a.instructions}</div>}
      {graded && sub.feedback && <div className="dash-assign-feedback"><span className="mono">MENTOR FEEDBACK</span>{sub.feedback}</div>}
      {!graded && (open || sub) && (
        <div className="dash-assign-form">
          <textarea className="dash-assign-input" rows={3} placeholder="Your response…" value={text} onChange={e => setText(e.target.value)}/>
          <div className="dash-assign-actions">
            <Uploader kind="submission" accept="*/*" onUploaded={(url) => setFileUrl(url)} compact/>
            {fileUrl && <a className="dash-assign-filelink" href={fileUrl} target="_blank" rel="noopener noreferrer">✓ file attached</a>}
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? "…" : (sub ? "Update" : "Submit")}</button>
          </div>
        </div>
      )}
      {!graded && !open && !sub && (
        <button className="dash-assign-start btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Start →</button>
      )}
    </div>
  );
}

function fmtShortDate(d) { if (!d) return ""; const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("en-GB", { day:"numeric", month:"short" }); }

// ----------------------------------------------------------------------------

// Character ranks — the ONE canonical progression, identical to the Anchor
// Journal (journal/app.jsx RANKS) and the server momentum engine
// (momentum.php): 60 XP per distinct reflection day, a flat 250 XP per level,
// 5 levels. Thresholds are the cumulative floors of that flat model. Do not
// fork these numbers again — a member who is "Rooted" here must be "Rooted"
// in the journal at the same XP.
const DASH_XP_PER_LEVEL = 250;
// Mood taxonomy — the SAME keys the Anchor Journal stores (journal/app.jsx
// MOODS/MOOD_ICON) so an entry created here renders correctly there. The emoji
// is display-only; the stored value is the key.
const DASH_MOODS = [
  { key: "great", emoji: "🔥", label: "Great" },
  { key: "good",  emoji: "🙂", label: "Good" },
  { key: "okay",  emoji: "😐", label: "Okay" },
  { key: "low",   emoji: "😔", label: "Low" },
  { key: "rough", emoji: "😴", label: "Rough" },
];
const DASH_RANKS = [
  { name: "Seedling", at: 0 }, { name: "Sprout", at: 250 }, { name: "Sapling", at: 500 },
  { name: "Rooted", at: 750 }, { name: "Vanguard", at: 1000 },
];
function dashRank(xp) {
  let cur = DASH_RANKS[0], next = null;
  for (let i = 0; i < DASH_RANKS.length; i++) {
    if (xp >= DASH_RANKS[i].at) cur = DASH_RANKS[i];
    else { next = DASH_RANKS[i]; break; }
  }
  const pct = next ? Math.min(100, Math.round((xp - cur.at) / (next.at - cur.at) * 100)) : 100;
  return { cur, next, pct };
}
// Reconcile the dashboard headline progression onto the canonical reflection
// economy. The server momentum payload (when present) is authoritative and is
// what the journal shows; `member_stats.xpTotal` is a separate mission-driven
// tally and must NOT drive the rank/level (that was the cross-surface bug).
// Falls back to the flat model over the momentum total, then to stored stats.
function canonicalProgress(stats, momentum) {
  if (momentum && typeof momentum.level === "number") {
    const level = momentum.level;
    const xpInLevel = momentum.xp || 0;               // 0..250 within the level
    // Prefer the true cumulative from reflection days (matches the journal's
    // reflectionDays*60 exactly); the level-math reconstruction under-counts at
    // the capped max level, where xpInLevel is pinned to 250.
    const total = typeof momentum.totalReflections === "number"
      ? momentum.totalReflections * 60
      : (level - 1) * DASH_XP_PER_LEVEL + xpInLevel;
    const r = dashRank(total);
    return { total, level, rank: r.cur, next: r.next, pct: r.next ? r.pct : 100 };
  }
  const total = (stats && stats.xp) || 0;
  const r = dashRank(total);
  const level = (stats && stats.level) || (DASH_RANKS.indexOf(r.cur) + 1);
  return { total, level, rank: r.cur, next: r.next, pct: r.next ? r.pct : 100 };
}

function DashboardStats({ stats, prog }) {
  // `prog` is the canonical reflection-economy progression (see
  // canonicalProgress) — the same model the journal and server momentum use.
  return (
    <div className="dash-card dash-stats">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Your tally.</h3>
        <span className="chip chip-gold" title="Character rank">{prog.rank.name}</span>
      </div>
      <div className="dash-stats-grid">
        <div className="dash-stat">
          <div className="mono dash-stat-l">LEVEL</div>
          <div className="dash-stat-n">{String(prog.level).padStart(2, "0")}</div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">STREAK</div>
          <div className="dash-stat-n">{stats.streak}<span className="dash-stat-u">d</span></div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">XP</div>
          <div className="dash-stat-n">{prog.total}</div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">BADGES</div>
          <div className="dash-stat-n">{stats.badgeCount}</div>
        </div>
      </div>
      <div className="dash-xp-bar">
        <div className="dash-xp-fill" style={{width: prog.pct + "%"}}/>
      </div>
      <div className="dash-xp-meta">
        <span>{prog.total.toLocaleString()} XP</span>
        <span>{prog.next ? "→ " + prog.next.name + " at " + prog.next.at.toLocaleString() : "Top rank reached ★"}</span>
      </div>
      {/* The badges themselves, not just how many. The ids were already in the
          payload and only the COUNT was rendered — a member could see they had
          three and not which three. Labels come from the server, so there is no
          second copy of the catalogue here. */}
      {(stats.badges || []).length > 0 && (
        <div className="dash-badges">
          {stats.badges.map(b => {
            const id = typeof b === "string" ? b : (b && (b.id || b.name)) || "";
            const label = (stats.badgeLabels && stats.badgeLabels[id]) || id.replace(/-/g, " ");
            return <span key={id} className="chip chip-sm dash-badge" title={label}>{label}</span>;
          })}
        </div>
      )}
    </div>
  );
}

// Behavioral momentum — surfaces the psychological engine (member.momentum):
// the single most-relevant nudge + the signals behind it. Non-critical: hides
// itself on error so it never blocks the dashboard.
const MOMENTUM_TONE = {
  urgent: { bg: "rgba(208,102,60,0.12)", bd: "rgba(208,102,60,0.3)", fg: "#a23d1a" },
  motivating: { bg: "rgba(110,156,29,0.12)", bd: "rgba(110,156,29,0.3)", fg: "#3f5a0f" },
  affirming: { bg: "rgba(46,125,70,0.12)", bd: "rgba(46,125,70,0.3)", fg: "#1f6b3a" },
  inviting: { bg: "rgba(139,92,246,0.12)", bd: "rgba(139,92,246,0.3)", fg: "#5b3aa8" },
  practical: { bg: "rgba(47,111,208,0.12)", bd: "rgba(47,111,208,0.3)", fg: "#1f4f9c" },
  gentle: { bg: "rgba(12,20,50,0.06)", bd: "rgba(12,20,50,0.14)", fg: "var(--ink-600,#4a536b)" },
};
function DashboardMomentum({ momentum }) {
  // Momentum is fetched once by DashboardLive and shared, so this card and the
  // Stats card can never disagree about the member's level.
  const m = momentum;
  if (!m) return null;
  const nudge = (m.nudges || [])[0];
  const tone = (nudge && MOMENTUM_TONE[nudge.tone]) || MOMENTUM_TONE.gentle;
  return (
    <div className="dash-card dash-momentum">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Momentum.</h3>
        <span className="chip chip-gold" title="Character level">L{m.level} · {m.levelName}</span>
      </div>
      {nudge && (
        <div className="dash-nudge" style={{ background: tone.bg, border: "1px solid " + tone.bd, borderRadius: 14, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: tone.fg }}>
          {nudge.text}
        </div>
      )}
      <div className="dash-momentum-row">
        <div className="dash-momentum-cell"><b>{m.streak}</b><small>day streak</small></div>
        <div className="dash-momentum-cell"><b>{m.consistency}%</b><small>30-day</small></div>
        <div className="dash-momentum-cell"><b>{m.longestStreak}</b><small>best ever</small></div>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 12 }} onClick={() => { window.location.href = "/journal/"; }}>Open the Anchor Journal →</button>
    </div>
  );
}

/**
 * Your account — what a member owes, and what their service has earned off.
 *
 * THE TONE IS THE DESIGN. This is a young person reading a debt on their own
 * screen, so it says the figure plainly, never in red, with no deadline and no
 * consequence — and it leads with the training fee being written off as they
 * serve, because that is the true story of the number and the part they earn.
 * A threatening panel produces a member who stops opening the dashboard, not a
 * payment; and the money conversation belongs with their guardian, who is the
 * one the reminders go to.
 *
 * Read-only, structurally: there is no member-side op that posts, pays or voids
 * anything, so there is nothing here to press.
 */
// The member's own NGG ID card — rendered + downloadable straight from the rail.
function DashboardIdCard({ m }) {
  const Card = window.MemberIDCard;
  if (!Card || !m) return null;
  return (
    <div className="dash-card">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Your ID card.</h3></div>
      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 4px" }}>
        <Card member={m} downloadable/>
      </div>
    </div>
  );
}

/* NGV standing — shown once a member has been promoted up the chain of command
   into the volunteer tier. It confirms the new role and surfaces the volunteer
   ID that now backs their check-in and volunteer surfaces. */
const NGV_ROLE_LABEL = { volunteer: "Volunteer", instructor: "Instructor", mentor: "Mentor" };
function ngvWhen(iso) {
  try {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
      + " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return String(iso || "").slice(0, 16).replace("T", " "); }
}
function DashboardNgv({ ngv }) {
  const active = (ngv.status || "active") === "active";
  const upcoming = Array.isArray(ngv.upcoming) ? ngv.upcoming : [];
  const sessions = typeof ngv.sessions === "number" ? ngv.sessions : null;
  return (
    <div className="dash-card dash-account">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Your NGV role.</h3>
        <span className="chip chip-gold" style={active ? undefined : { opacity: 0.55 }}>{active ? "NGV" : "NGV · paused"}</span>
      </div>
      <div className="dash-account-figure is-clear" style={{ fontSize: 22 }}>{NGV_ROLE_LABEL[ngv.role] || "Volunteer"}</div>
      <div className="dash-account-sub">
        Volunteer ID <b className="mono">{ngv.volunteerId}</b>
        {ngv.since ? " · since " + String(ngv.since).slice(0, 10) : ""}
        {sessions !== null ? " · " + sessions + " session" + (sessions === 1 ? "" : "s") + " served" : ""}
      </div>
      {ngv.profileUrl && (
        <a href={ngv.profileUrl} target="_blank" rel="noopener noreferrer"
          style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
            borderRadius: 10, background: "var(--gold, #e8961f)", color: "#1a1205", fontWeight: 700,
            fontSize: 13, textDecoration: "none" }}>
          Open my volunteer ID &amp; check-in QR →
        </a>
      )}
      {upcoming.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="dash-card-h-sm" style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Sessions to shadow</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {upcoming.map((e, i) => (
              <li key={e.eventId || i} style={{ display: "flex", justifyContent: "space-between", gap: 8,
                padding: "5px 0", borderTop: i ? "1px solid rgba(128,128,128,.18)" : "none", fontSize: 13 }}>
                <span>{e.title}</span>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>
                  {ngvWhen(e.startAt)}{e.spotsLeft != null ? " · " + e.spotsLeft + " left" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!active && (
        <div className="dash-account-earned" style={{ marginTop: 10 }}>
          Your NGV standing is currently paused — an admin can reinstate it.
        </div>
      )}
    </div>
  );
}

function DashboardObligations({ account }) {
  const [open, setOpen] = React.useState(false);
  const a = account;
  const t = a.tenure || {};
  const owed = a.payable;
  const entries = a.entries || [];
  return (
    <div className="dash-card dash-account">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Your account.</h3>
        {a.mouAt && <span className="chip chip-lime" title={"MOU accomplished " + String(a.mouAt).slice(0, 10)}>MOU DONE</span>}
      </div>

      {owed > 0 ? (
        <React.Fragment>
          <div className="dash-account-figure">{naira(owed)}</div>
          <div className="dash-account-sub">outstanding</div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="dash-account-figure is-clear">All clear</div>
          <div className="dash-account-sub">nothing outstanding</div>
        </React.Fragment>
      )}

      {/* The write-down, said as what it is: something service earns, not a
          discount granted. This is the line worth putting above the ledger. */}
      {a.trainingCharged > 0 && (
        <div className="dash-account-earned">
          <b>{naira(a.trainingEarned + a.trainingWrittenOff)}</b> of your {naira(a.trainingCharged)} training fee
          {a.mouAt ? " has been written off — your MOU is complete." : " has been earned off by your service so far."}
        </div>
      )}

      {t.phase && t.phase !== "unknown" && (
        <div className="dash-account-phase mono">
          MONTH {t.months} OF {(t.trainingMonths || 0) + (t.serviceMonths || 0)} · {String(t.phase).toUpperCase()}
          {t.phase === "service" && typeof t.servedMonths === "number"
            && <> · {t.servedMonths}/{t.serviceMonths} SERVED</>}
        </div>
      )}

      <button className="btn btn-ghost btn-sm dash-account-toggle" onClick={() => setOpen(o => !o)}>
        {open ? "Hide the detail" : "See every entry"}
      </button>

      {open && (
        <div className="dash-account-list">
          {entries.length === 0 && <div className="dash-account-empty">Nothing on the account yet.</div>}
          {entries.map((e, i) => (
            <div key={i} className={"dash-account-row" + (e.void ? " is-void" : "")}>
              <div>
                <div className="dash-account-row-what">{ACCOUNT_KIND_LABEL[e.kind] || e.kind}</div>
                {e.note && <div className="dash-account-row-note">{e.note}</div>}
                <div className="mono dash-account-row-when">{String(e.createdAt).slice(0, 10)}{e.void && " · cancelled"}</div>
              </div>
              <div className={"mono dash-account-row-amt" + (e.direction === "charge" ? "" : " is-credit")}>
                {e.direction === "charge" ? "" : "−"}{naira(e.amount)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dash-account-foot">
        {/* Where to go with a question, because the screen cannot answer one and
            a family in difficulty needs a person, not a figure. */}
        Something look wrong, or is this a difficult month? Speak to your centre
        coordinator — they would rather hear from you.
      </div>
    </div>
  );
}

/* Policy FINES — a separate ledger from dues/fees. These are disciplinary
   sanctions under the institutional policy (lateness, absence, ID-card), shown
   with the reason and status so a member sees exactly what they owe and why,
   plus a compliance banner when they are warned/suspended/evicted. Rendered
   only when there is something to show (see `showFines`). */
const FINE_STATE_LABEL = { warned: "Warning on record", dormant: "Dormant", suspended: "Suspended", evicted: "Evicted" };
function DashboardFines({ c }) {
  const owed = c.finesOwed || 0;
  const fines = c.fines || [];
  const state = c.state || "clear";
  return (
    <div className="dash-card dash-account">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Policy fines.</h3>
        {state !== "clear" && <span className="chip chip-coral">{FINE_STATE_LABEL[state] || state}</span>}
      </div>

      {owed > 0 ? (
        <React.Fragment>
          <div className="dash-account-figure">{naira(owed)}</div>
          <div className="dash-account-sub">in fines outstanding</div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="dash-account-figure is-clear">All clear</div>
          <div className="dash-account-sub">no fines outstanding</div>
        </React.Fragment>
      )}

      {state !== "clear" && c.reason && (
        <div className="dash-account-earned">
          {c.reason}{c.until ? " Until " + String(c.until).slice(0, 10) + "." : ""}
        </div>
      )}

      {fines.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
          {fines.map((f, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", padding: "8px 0", borderTop: "1px solid var(--hair, rgba(20,24,48,.08))" }}>
              <span style={{ fontSize: 13, color: "var(--ink-500, #5a6178)", lineHeight: 1.35 }}>
                {f.reason || "Fine"}
                {f.issuedAt ? <span style={{ opacity: 0.6 }}> · {String(f.issuedAt).slice(0, 10)}</span> : null}
              </span>
              <span style={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                {naira(f.amount)} <span className={"chip " + (f.status === "pending" ? "chip-gold" : "chip-coral")}>{f.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="dash-account-foot">
        Fines are issued under the institutional policy. To query or clear one,
        speak to your centre coordinator.
      </div>
    </div>
  );
}

/* A member's words for the ledger kinds. Plainer than the admin labels: nobody
   outside an office calls a payment "payment received". */
const ACCOUNT_KIND_LABEL = {
  membership: "Membership fee", dues: "Monthly dues", training: "Training fee",
  fine: "Fine", adjustment: "Adjustment",
  payment: "You paid", writeoff: "Written off", waiver: "Waived",
};

function DashboardMentor({ mentor }) {
  return (
    <div className="dash-card dash-mentor">
      <div className="eyebrow" style={{color:"var(--ink-500)"}}>YOUR MENTOR</div>
      <div className="dash-mentor-row">
        {mentor.photoUrl
          ? <img className="dash-mentor-avatar" src={mentor.photoUrl} alt={mentor.fullName}/>
          : <div className="dash-mentor-avatar dash-mentor-avatar-fallback">{(mentor.fullName || "?").charAt(0)}</div>}
        <div>
          <div className="dash-mentor-name">{mentor.fullName}</div>
          <div className="dash-mentor-meta">
            {(mentor.tracks || []).join(" · ") || "Mentor"} · CACENTRE {mentor.centre}
          </div>
        </div>
      </div>
      {mentor.bio && <p className="dash-mentor-bio">{mentor.bio}</p>}
    </div>
  );
}

function DashboardEvents({ events, onRsvp }) {
  if (!events.length) return null;
  return (
    <div className="dash-card">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Coming up.</h3></div>
      <div className="dash-events">
        {events.slice(0, 3).map(e => (
          <DashboardEventRow key={e.eventId} e={e} onRsvp={onRsvp}/>
        ))}
      </div>
    </div>
  );
}

function DashboardEventRow({ e, onRsvp }) {
  const d = new Date(e.startAt);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = d.toLocaleString("en-US", { month: "short" });
  return (
    <div className="dash-event">
      <div className="dash-event-date">
        <div className="dash-event-dd">{dd}</div>
        <div className="mono dash-event-mm">{mm}</div>
      </div>
      <div className="dash-event-body">
        <div className="dash-event-title">{e.title}</div>
        <div className="dash-event-meta">CACENTRE {e.centre} · {d.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}</div>
      </div>
      <button
        className={"btn btn-sm " + (e.myRsvp === "going" ? "btn-gold" : "btn-ghost")}
        onClick={() => onRsvp(e.eventId, e.myRsvp === "going" ? "cancelled" : "going")}
      >
        {e.myRsvp === "going" ? "Going ✓" : "RSVP"}
      </button>
    </div>
  );
}

function DashboardNotifications({ notes, onRead }) {
  /* The dashboard payload carries UNREAD only, capped at eight, and there was no
     way to see anything already read — so a member who tapped a notice to clear
     it could never find it again. `member.notifications` has always returned the
     last fifty including read ones; nothing asked for them. */
  const [all, setAll] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const showing = all || notes;
  const loadAll = () => {
    setLoading(true);
    NGGApi.member.notifications()
      .then(r => setAll(r.notifications || []))
      .catch(() => toast.error("Couldn't load the earlier ones."))
      .finally(() => setLoading(false));
  };
  if (!notes.length && !all) return null;
  return (
    <div className="dash-card">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 className="dash-card-h-sm">Activity.</h3>
        {all
          ? <button className="btn btn-ghost btn-sm" onClick={() => setAll(null)}>Unread only</button>
          : <button className="btn btn-ghost btn-sm" disabled={loading} onClick={loadAll}>{loading ? "…" : "Everything"}</button>}
      </div>
      <div className="dash-notes">
        {showing.slice(0, all ? 50 : 5).map(n => (
          <button key={n.notifId} className={"dash-note" + (n.readAt ? "" : " is-unread")} onClick={() => onRead(n.notifId)}>
            <div className="dash-note-kind" data-kind={n.kind}/>
            <div className="dash-note-body">
              <div className="dash-note-title">{n.title}</div>
              {n.body && <div className="dash-note-text">{n.body}</div>}
              <div className="mono dash-note-time">{timeAgo(n.createdAt)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardShortcuts({ setPage }) {
  return (
    <div className="dash-card dash-shortcuts">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Jump to…</h3></div>
      <a className="dash-journal-cta" href="/journal/">
        <span className="dash-journal-cta-ico" aria-hidden="true">✦</span>
        <span className="dash-journal-cta-txt"><b>Open the Anchor Journal</b><small>Daily reflection · install it as an app</small></span>
        <span aria-hidden="true">→</span>
      </a>
      <div className="dash-shortcuts-grid">
        <button className="dash-shortcut" onClick={() => setPage("anchor")}><span>↗</span>Anchor 12</button>
        <button className="dash-shortcut" onClick={() => setPage("book")}><span>📖</span>The book</button>
        <button className="dash-shortcut" onClick={() => setPage("media")}><span>▶</span>Media</button>
        <button className="dash-shortcut" onClick={() => setPage("blog")}><span>✎</span>Blog</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Activity feed — recent mission verifications for this member.
// (Placeholder until we surface them via a dedicated endpoint; for now we
// derive from the dashboard's "today" history.)
// ----------------------------------------------------------------------------

function DashboardActivityFeed({ memberId, session, reloadKey }) {
  // Lightweight feed: shows last 6 verified/submitted missions from the
  // anchor endpoint. Refetches on mount and on real mutations (reloadKey),
  // but NOT on the 60s poll — that would double the anchor() traffic.
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.anchor().then(r => {
      if (!alive) return;
      const flat = [];
      (r.weeks || []).forEach(w => (w.missions || []).forEach(m => {
        if (m.status === "verified" || m.status === "submitted") {
          flat.push({ ...m, week: w.week, theme: w.theme });
        }
      }));
      setItems(flat.slice(-6).reverse());
    }).catch(() => setItems([]));
    return () => { alive = false; };
  }, [memberId, reloadKey]);

  if (!items || items.length === 0) return null;

  return (
    <div className="dash-card dash-feed">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Your trail.</h3></div>
      <ol className="dash-feed-list">
        {items.map((it, i) => (
          <li key={it.missionId + i} className={"dash-feed-item dash-feed-" + it.status}>
            <span className="dash-feed-dot"/>
            <div>
              <div className="dash-feed-title">{it.title}</div>
              <div className="dash-feed-meta">WK {String(it.week).padStart(2, "0")} · {it.theme} · {it.status === "verified" ? "+" + it.xp + " XP" : "awaiting review"}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Quick journal — single textarea + mood. Drops into Journal sheet.
// ----------------------------------------------------------------------------

function DashboardJournal({ onMutate }) {
  const [mood, setMood] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await NGGApi.member.journalCreate({ mood, body: body.trim(), private: true });
      setBody(""); setMood(""); setSaved(true);
      setTimeout(() => setSaved(false), 2400);
      onMutate();
    } catch (e) {
      toast.error("Couldn't save: " + humanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dash-card dash-journal">
      <div className="dash-card-head">
        <div>
          <div className="eyebrow" style={{color:"var(--ink-500)"}}>JOURNAL · PRIVATE TO YOU</div>
          <h2 className="dash-card-h">A line for the record.</h2>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="dash-mood">
          {DASH_MOODS.map(mo => (
            <button key={mo.key} type="button" className={"dash-mood-btn" + (mood === mo.key ? " is-on" : "")} onClick={() => setMood(mo.key)} aria-label={"Mood: " + mo.label} aria-pressed={mood === mo.key}>{mo.emoji}</button>
          ))}
        </div>
        <textarea
          className="dash-journal-input"
          placeholder="What did you build, learn or notice today?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        <div className="dash-journal-foot">
          <span className="mono" style={{color:"var(--ink-500)"}}>{saved ? "SAVED ✓" : (busy ? "SAVING…" : "")}</span>
          <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>Save entry</button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function humanError(e) {
  if (!e) return "Unknown error.";
  const code = e.code || e.message || "";
  const map = {
    rate_limited: "Too many tries — wait a minute.",
    unauthorized: "Please sign in again.",
    upstream_unreachable: "Backend is offline.",
    upstream_empty: "Backend returned nothing.",
    upstream_bad_json: "Backend response was unreadable.",
  };
  return map[code] || code || "Something went wrong.";
}

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Late one";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Late one";
}

function timeAgo(iso) {
  if (!iso) return "";
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s/60) + "m ago";
  if (s < 86400) return Math.floor(s/3600) + "h ago";
  return Math.floor(s/86400) + "d ago";
}

Object.assign(window, { DashboardPage });
