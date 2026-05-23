/* ================================================================
   NGG — Active Member Dashboard.
   This is the page members land on after sign-in. Live data, actionable.
   ================================================================ */

function DashboardPage({ setPage }) {
  const { member, isSignedIn, loading, openSignIn, signOut } = useAuth();
  const [data, setData] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    NGGApi.member.dashboard()
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.code || e.message); });
    return () => { alive = false; };
  }, [isSignedIn, reload]);

  // Poll every 60s to keep stats and notifications fresh.
  React.useEffect(() => {
    if (!isSignedIn) return;
    const id = setInterval(() => setReload(r => r + 1), 60000);
    return () => clearInterval(id);
  }, [isSignedIn]);

  if (loading) {
    return <DashboardShell><DashboardLoading/></DashboardShell>;
  }
  if (!isSignedIn) {
    return <DashboardShell><DashboardSignedOut openSignIn={openSignIn} setPage={setPage}/></DashboardShell>;
  }
  if (err) {
    return <DashboardShell><DashboardError code={err} onRetry={() => setReload(r => r + 1)}/></DashboardShell>;
  }
  if (!data) {
    return <DashboardShell><DashboardLoading/></DashboardShell>;
  }

  return (
    <DashboardShell>
      <DashboardLive
        data={data}
        setPage={setPage}
        onMutate={() => setReload(r => r + 1)}
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

function DashboardLoading() {
  return (
    <section style={{padding: "120px 0", textAlign:"center"}}>
      <div className="dash-spinner" aria-label="Loading"/>
      <div className="mono" style={{marginTop:18, color:"var(--ink-500)"}}>LOADING YOUR ROOM…</div>
    </section>
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

function DashboardLive({ data, setPage, onMutate, onSignOut }) {
  const m = data.member;
  const s = data.stats;
  const session = data.session;
  const today = data.today || [];
  const events = data.events || [];
  const notes = data.notifications || [];
  const mentor = data.mentor;

  const xpToNext = (Math.floor(s.xp / 250) + 1) * 250;
  const xpPct = Math.min(100, Math.round((s.xp % 250) / 250 * 100));

  return (
    <React.Fragment>
      <DashboardHero m={m} session={session} onSignOut={onSignOut}/>
      <section className="dash-section">
        <div className="container">
          <div className="dash-grid">
            {/* LEFT MAIN COLUMN */}
            <div className="dash-main">
              <DashboardToday today={today} member={m} onMutate={onMutate} session={session}/>
              <DashboardActivityFeed memberId={m.memberId} session={session}/>
              <DashboardJournal onMutate={onMutate}/>
            </div>

            {/* RIGHT RAIL */}
            <div className="dash-rail">
              <DashboardStats stats={s} xpToNext={xpToNext} xpPct={xpPct}/>
              {mentor && <DashboardMentor mentor={mentor}/>}
              <DashboardEvents events={events} onRsvp={(eventId, status) => NGGApi.member.rsvp({ eventId, status }).then(onMutate)}/>
              <DashboardNotifications notes={notes} onRead={(id) => NGGApi.member.markRead(id).then(onMutate)}/>
              <DashboardShortcuts setPage={setPage}/>
            </div>
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}

// ----------------------------------------------------------------------------

function DashboardHero({ m, session, onSignOut }) {
  const first = String(m.fullName || "").split(" ")[0] || "Member";
  const greeting = hourGreeting();
  return (
    <section className="dash-hero">
      <div className="container">
        <div className="dash-hero-row">
          <div className="dash-hero-id">
            <Avatar seed={m.memberId.charCodeAt(m.memberId.length - 1) % 20 + 1} size={64} ring/>
            <div>
              <div className="mono dash-hero-meta">{greeting.toUpperCase()} · {m.memberId}</div>
              <h1 className="dash-hero-name">{first}.</h1>
              <div className="dash-hero-sub">
                <span className="chip chip-on-dark">{m.type === "Summer" ? "Summer Student" : m.role === "super_admin" || m.role === "admin" ? "Admin · " + (m.role) : "Genius"}</span>
                <span className="chip chip-on-dark">CACENTRE {m.centre}</span>
                {m.track && <span className="chip chip-on-dark">{m.track}</span>}
              </div>
            </div>
          </div>
          <div className="dash-hero-actions">
            <DashboardSessionBadge session={session}/>
            <button className="btn btn-on-dark-ghost btn-sm" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardSessionBadge({ session }) {
  if (!session) {
    return <div className="dash-session-badge"><div className="mono">NO ACTIVE SESSION</div></div>;
  }
  const today = new Date();
  const end = new Date(session.endDate);
  const daysLeft = Math.max(0, Math.ceil((end - today) / (1000 * 60 * 60 * 24)));
  const start = new Date(session.startDate);
  const upcoming = today < start;
  const daysToStart = upcoming ? Math.ceil((start - today) / (1000 * 60 * 60 * 24)) : 0;
  return (
    <div className="dash-session-badge">
      <div className="mono" style={{color:"var(--gold-400)"}}>{session.code} · {session.year}</div>
      <div className="dash-session-num">
        {upcoming ? daysToStart : daysLeft}
        <span className="dash-session-unit">{upcoming ? " days to start" : " days left"}</span>
      </div>
      <div className="mono" style={{color:"rgba(255,255,255,0.55)"}}>WEEK {session.weekOf}/{session.totalWeeks}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------

function DashboardToday({ today, member, onMutate, session }) {
  const [busy, setBusy] = React.useState({});
  const submit = async (m) => {
    setBusy(b => Object.assign({}, b, { [m.missionId]: true }));
    try {
      // For quick-complete missions (proof=none), one tap finishes them.
      // Otherwise open a proof modal.
      if (m.proof === "none") {
        await NGGApi.member.submitMission({ missionId: m.missionId });
        toast.success("+" + m.xp + " XP locked in", m.title);
        onMutate();
      } else {
        const proof = window.prompt(`Paste a link or short note for "${m.title}":`);
        if (proof !== null) {
          await NGGApi.member.submitMission({ missionId: m.missionId, proofUrl: proof });
          toast.success("Sent to mentor for review", m.title);
          onMutate();
        }
      }
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

function DashboardStats({ stats, xpToNext, xpPct }) {
  return (
    <div className="dash-card dash-stats">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Your tally.</h3></div>
      <div className="dash-stats-grid">
        <div className="dash-stat">
          <div className="mono dash-stat-l">LEVEL</div>
          <div className="dash-stat-n">{String(stats.level).padStart(2, "0")}</div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">STREAK</div>
          <div className="dash-stat-n">{stats.streak}<span className="dash-stat-u">d</span></div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">XP</div>
          <div className="dash-stat-n">{stats.xp}</div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">BADGES</div>
          <div className="dash-stat-n">{stats.badgeCount}</div>
        </div>
      </div>
      <div className="dash-xp-bar">
        <div className="dash-xp-fill" style={{width: xpPct + "%"}}/>
      </div>
      <div className="dash-xp-meta">
        <span>{stats.xp} / {xpToNext} XP</span>
        <span>→ Lv {stats.level + 1}</span>
      </div>
    </div>
  );
}

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
  if (!notes.length) return null;
  return (
    <div className="dash-card">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Activity.</h3></div>
      <div className="dash-notes">
        {notes.slice(0, 5).map(n => (
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
      <div className="dash-shortcuts-grid">
        <button className="dash-shortcut" onClick={() => setPage("anchor")}><span>↗</span>Anchor 12</button>
        <button className="dash-shortcut" onClick={() => setPage("book")}><span>📖</span>The book</button>
        <button className="dash-shortcut" onClick={() => setPage("media")}><span>▶</span>Media</button>
        <button className="dash-shortcut" onClick={() => setPage("blog")}><span>✎</span>Journal</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Activity feed — recent mission verifications for this member.
// (Placeholder until we surface them via a dedicated endpoint; for now we
// derive from the dashboard's "today" history.)
// ----------------------------------------------------------------------------

function DashboardActivityFeed({ memberId, session }) {
  // Lightweight feed: shows last 5 verified missions from the anchor endpoint.
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
  }, [memberId]);

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
          {["🔥","🙂","😐","😔","😴"].map(em => (
            <button key={em} type="button" className={"dash-mood-btn" + (mood === em ? " is-on" : "")} onClick={() => setMood(em)} aria-label={"Mood " + em}>{em}</button>
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
