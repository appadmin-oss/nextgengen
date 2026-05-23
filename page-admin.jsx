/* ================================================================
   NGG — Admin console.
   Sections: Members, Mentors, Sessions, Anchor missions, Events,
   Posts (blog/news/updates/promos), Audit log.
   ================================================================ */

function AdminPage({ setPage }) {
  const { member, isAdmin, adminOk, loading, openSignIn, setAdminOk } = useAuth();
  const [section, setSection] = React.useState("home");
  const [setupView, setSetupView] = React.useState(false);

  if (loading) return <div className="page admin"><div className="container" style={{padding:"120px 0"}}><div className="dash-spinner"/></div></div>;
  if (!isAdmin) {
    return <div className="page admin">
      <section style={{padding: "140px 0", textAlign: "center"}}>
        <div className="container">
          <div className="eyebrow">ADMIN · STAFF ONLY</div>
          <h1 className="display" style={{fontSize: "clamp(48px, 8vw, 96px)"}}>Restricted.</h1>
          <p style={{marginTop:18, color:"var(--ink-500)", maxWidth:520, margin:"18px auto 0"}}>This area is for NGG staff. Sign in with an admin account, or go back to the public site.</p>
          <div style={{marginTop:32, display:"flex", gap:12, justifyContent:"center"}}>
            <button className="btn btn-primary" onClick={() => openSignIn()}>Sign in</button>
            <button className="btn btn-ghost" onClick={() => setPage("home")}>Back to site</button>
          </div>
        </div>
      </section>
    </div>;
  }
  if (!adminOk) return <AdminTotpGate onPass={() => setAdminOk(true)} member={member}/>;

  return (
    <div className="page admin" data-screen-label="08 Admin">
      <AdminTopbar section={section} setSection={setSection} setPage={setPage} member={member}/>
      <div className="admin-shell">
        <AdminNav section={section} setSection={setSection}/>
        <main className="admin-main">
          {section === "home" && <AdminHome setSection={setSection}/>}
          {section === "members" && <AdminMembers/>}
          {section === "mentors" && <AdminMentors/>}
          {section === "sessions" && <AdminSessions/>}
          {section === "missions" && <AdminMissions/>}
          {section === "events" && <AdminEvents/>}
          {section === "posts" && <AdminPosts/>}
          {section === "broadcast" && <AdminBroadcast/>}
          {section === "audit" && <AdminAudit/>}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// TOTP gate — admins must enter a fresh code before /admin opens.
// ============================================================================

function AdminTotpGate({ onPass, member }) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [setupMode, setSetupMode] = React.useState(member && member.needsTotp);
  const [setupData, setSetupData] = React.useState(null);

  React.useEffect(() => {
    if (setupMode) {
      NGGApi.auth.adminTotpSetup().then(setSetupData).catch(e => setErr(e.code || e.message));
    }
  }, [setupMode]);

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await NGGApi.auth.adminTotpVerify(code.replace(/\s/g, ""));
      onPass();
    } catch (e) {
      setErr(e.code === "invalid_code" ? "Code didn't match. Try the latest one." : (e.code || e.message));
    } finally { setBusy(false); }
  };

  return (
    <div className="page admin">
      <section className="admin-gate">
        <div className="admin-gate-card">
          <div className="eyebrow" style={{color:"var(--gold-500)"}}>ADMIN · 2FA</div>
          <h2 className="display admin-gate-h">{setupMode ? "First-time setup" : "Verify it's you."}</h2>
          {setupMode ? (
            <>
              <p className="admin-gate-p">Add NGG Admin to your authenticator app, then enter the code it shows.</p>
              {setupData ? (
                <>
                  <div className="admin-gate-secret">
                    <div className="mono" style={{fontSize:10, color:"var(--ink-500)"}}>OR ENTER MANUALLY</div>
                    <code>{setupData.secret}</code>
                  </div>
                </>
              ) : <div className="dash-spinner"/>}
            </>
          ) : (
            <p className="admin-gate-p">Open your authenticator app and enter the current 6-digit code for "NGG Admin".</p>
          )}
          <form onSubmit={verify}>
            <input
              className="signin-input signin-otp"
              type="text"
              inputMode="numeric"
              maxLength={7}
              placeholder="••• •••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
              autoFocus
            />
            {err && <div className="signin-err">{err}</div>}
            <button className="btn btn-primary btn-lg" disabled={busy || code.replace(/\s/g, "").length !== 6}>
              {busy ? "Verifying…" : "Unlock admin →"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Topbar + side nav
// ============================================================================

function AdminTopbar({ section, setSection, setPage, member }) {
  return (
    <div className="admin-topbar">
      <div className="admin-topbar-l">
        <BrandLogo size={28}/>
        <div className="admin-topbar-title">
          <div className="mono" style={{fontSize:10, color:"var(--gold-400)"}}>NGG · CONTROL ROOM</div>
          <div className="admin-topbar-section">{titleFor(section)}</div>
        </div>
      </div>
      <div className="admin-topbar-r">
        <span className="mono" style={{color:"rgba(255,255,255,0.6)"}}>{member.fullName} · {member.role}</span>
        <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("home")}>View site →</button>
      </div>
    </div>
  );
}

function AdminNav({ section, setSection }) {
  const items = [
    { id: "home",      label: "Home",       icon: "◎" },
    { id: "members",   label: "Members",    icon: "◯" },
    { id: "mentors",   label: "Mentors",    icon: "◐" },
    { id: "sessions",  label: "Sessions",   icon: "▢" },
    { id: "missions",  label: "Missions",   icon: "✦" },
    { id: "events",    label: "Events",     icon: "▶" },
    { id: "posts",     label: "Posts",      icon: "✎" },
    { id: "broadcast", label: "Broadcast",  icon: "✉" },
    { id: "audit",     label: "Audit log",  icon: "⌗" },
  ];
  return (
    <aside className="admin-nav">
      {items.map(it => (
        <button
          key={it.id}
          className={"admin-nav-item" + (section === it.id ? " is-active" : "")}
          onClick={() => setSection(it.id)}
        >
          <span className="admin-nav-icon" aria-hidden="true">{it.icon}</span>
          <span className="admin-nav-label">{it.label}</span>
        </button>
      ))}
    </aside>
  );
}

function titleFor(s) {
  return {
    home: "Overview", members: "Members", mentors: "Mentors", sessions: "Sessions",
    missions: "Anchor missions", events: "Events", posts: "Posts", broadcast: "Broadcast", audit: "Audit log",
  }[s] || "";
}

// ============================================================================
// Home
// ============================================================================

function AdminHome({ setSection }) {
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => {
    NGGApi.public.stats().then(r => setStats(r.stats)).catch(() => setStats({}));
  }, []);

  return (
    <div className="admin-home">
      <div className="admin-tiles">
        <AdminTile n={stats ? stats.activeMembers : "·"} l="Active members"   onClick={() => setSection("members")}/>
        <AdminTile n={stats ? stats.ngg            : "·"} l="NGG members"      onClick={() => setSection("members")}/>
        <AdminTile n={stats ? stats.summer         : "·"} l="Summer students"  onClick={() => setSection("members")}/>
        <AdminTile n={stats ? stats.graduates      : "·"} l="Graduates"        onClick={() => setSection("members")}/>
      </div>
      <div className="admin-quick">
        <h3 className="admin-h3">Quick actions</h3>
        <div className="admin-quick-grid">
          <button className="admin-quick-btn" onClick={() => setSection("posts")}>✎ New post</button>
          <button className="admin-quick-btn" onClick={() => setSection("events")}>▶ New event</button>
          <button className="admin-quick-btn" onClick={() => setSection("missions")}>✦ Add mission</button>
          <button className="admin-quick-btn" onClick={() => setSection("broadcast")}>✉ Broadcast</button>
          <button className="admin-quick-btn" onClick={() => setSection("members")}>◯ Add member</button>
          <button className="admin-quick-btn" onClick={() => setSection("mentors")}>◐ Add mentor</button>
        </div>
      </div>
    </div>
  );
}

function AdminTile({ n, l, onClick }) {
  return (
    <button className="admin-tile" onClick={onClick}>
      <div className="admin-tile-n">{n}</div>
      <div className="mono admin-tile-l">{l}</div>
    </button>
  );
}

// ============================================================================
// Members
// ============================================================================

function AdminMembers() {
  const [list, setList] = React.useState(null);
  const [filters, setFilters] = React.useState({ q: "", centre: "", status: "", type: "" });
  const [editing, setEditing] = React.useState(null);

  const load = () => NGGApi.admin.members.list(filters).then(r => setList(r.members || []));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.centre, filters.status, filters.type]);
  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [filters.q]);

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Members</h2>
        <div className="admin-section-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New member</button>
        </div>
      </div>
      <div className="admin-filters">
        <input className="admin-input" placeholder="Search name, ID, email…" value={filters.q} onChange={(e) => setFilters(f => ({...f, q: e.target.value}))}/>
        <select className="admin-select" value={filters.centre} onChange={(e) => setFilters(f => ({...f, centre: e.target.value}))}>
          <option value="">All centres</option><option value="Egbeda">Egbeda</option><option value="Ayobo">Ayobo</option>
        </select>
        <select className="admin-select" value={filters.type} onChange={(e) => setFilters(f => ({...f, type: e.target.value}))}>
          <option value="">All types</option><option value="NGG">NGG</option><option value="Summer">Summer</option>
        </select>
        <select className="admin-select" value={filters.status} onChange={(e) => setFilters(f => ({...f, status: e.target.value}))}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="graduated-ngg">Graduated NGG</option>
          <option value="graduated-vanguard">Graduated Vanguard</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr>
              <th>Member</th><th>Type</th><th>Centre</th><th>Status</th><th>Track</th><th></th>
            </tr></thead>
            <tbody>
              {list.map(m => (
                <tr key={m.memberId}>
                  <td>
                    <div className="admin-cell-name">{m.fullName}</div>
                    <div className="mono admin-cell-sub">{m.memberId} · {m.email}</div>
                  </td>
                  <td>{m.type}</td>
                  <td>{m.centre}</td>
                  <td><span className={"chip status-" + m.status}>{m.status}</span></td>
                  <td>{m.track || "—"}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>Edit</button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan="6" className="admin-empty">No members match.</td></tr>}
            </tbody>
          </table>
        </div>
      }
      {editing && <AdminMemberEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminMemberEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(data);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await NGGApi.admin.members.upsert(d);
      onSaved();
    } catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.memberId ? "Edit member" : "New member"}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Full name" value={d.fullName||""} onChange={v => set("fullName", v)} required/>
          <Field label="Email"     value={d.email||""}    onChange={v => set("email", v)}    required type="email"/>
          <Field label="Phone"     value={d.phone||""}    onChange={v => set("phone", v)}/>
          <div className="admin-fields-row">
            <FieldSelect label="Type" value={d.type||"NGG"} onChange={v => set("type", v)} options={["NGG","Summer"]}/>
            <FieldSelect label="Centre" value={d.centre||"Egbeda"} onChange={v => set("centre", v)} options={["Egbeda","Ayobo"]}/>
          </div>
          <div className="admin-fields-row">
            <FieldSelect label="Status" value={d.status||"active"} onChange={v => set("status", v)} options={["active","graduated-ngg","graduated-vanguard","suspended","inactive"]}/>
            <Field label="Track" value={d.track||""} onChange={v => set("track", v)}/>
          </div>
          <Field label="Photo URL" value={d.photoUrl||""} onChange={v => set("photoUrl", v)}/>
          <Field label="Parent email" value={d.parentEmail||""} onChange={v => set("parentEmail", v)} type="email"/>
          <Field label="School" value={d.school||""} onChange={v => set("school", v)}/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : (d.memberId ? "Save changes" : "Create member")}</button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Mentors
// ============================================================================

function AdminMentors() {
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const load = () => NGGApi.admin.mentors.list().then(r => setList(r.mentors || []));
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Mentors</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New mentor</button>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        <div className="admin-grid-cards">
          {list.map(m => (
            <button key={m.mentorId} className="admin-card" onClick={() => setEditing(m)}>
              {m.photoUrl
                ? <img src={m.photoUrl} alt={m.fullName} className="admin-card-img"/>
                : <div className="admin-card-img admin-card-img-fallback">{(m.fullName || "?").charAt(0)}</div>}
              <div className="admin-card-name">{m.fullName}</div>
              <div className="mono admin-card-meta">{m.centre} · {(m.tracks || []).join(", ")}</div>
            </button>
          ))}
          {list.length === 0 && <div className="admin-empty">No mentors yet.</div>}
        </div>
      }
      {editing && <AdminMentorEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminMentorEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(Object.assign({}, data, { tracks: Array.isArray(data.tracks) ? data.tracks.join(", ") : (data.tracks || "") }));
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.mentors.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.mentorId ? "Edit mentor" : "New mentor"}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Full name" value={d.fullName||""} onChange={v => set("fullName", v)} required/>
          <Field label="Email" value={d.email||""} onChange={v => set("email", v)} required type="email"/>
          <Field label="Phone" value={d.phone||""} onChange={v => set("phone", v)}/>
          <Field label="Tracks (comma separated)" value={d.tracks||""} onChange={v => set("tracks", v)} placeholder="Music, Tech, Leadership"/>
          <FieldSelect label="Centre" value={d.centre||"Egbeda"} onChange={v => set("centre", v)} options={["Egbeda","Ayobo","Both"]}/>
          <FieldSelect label="Status" value={d.status||"pending-checks"} onChange={v => set("status", v)} options={["active","pending-checks","on-break","retired"]}/>
          <Field label="Max mentees" value={d.maxMentees||"8"} onChange={v => set("maxMentees", v)} type="number"/>
          <Field label="Photo URL" value={d.photoUrl||""} onChange={v => set("photoUrl", v)}/>
          <FieldTextarea label="Public bio" value={d.bio||""} onChange={v => set("bio", v)}/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : (d.mentorId ? "Save changes" : "Create mentor")}</button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Sessions (TONI/MEDI/SUMMER/DOMI)
// ============================================================================

function AdminSessions() {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const load = () => NGGApi.admin.sessions.list(year).then(r => setList(r.sessions || []));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [year]);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Sessions · {year}</h2>
        <div style={{display:"flex", gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)}>◀ {year - 1}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y + 1)}>{year + 1} ▶</button>
        </div>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        <div className="admin-sessions-grid">
          {list.map(s => (
            <button key={s.sessionId} className={"admin-session-card" + (s.isActive ? " is-active" : "")} onClick={() => setEditing(s)}>
              <div className="mono">{s.code}</div>
              <div className="admin-session-name">{s.name}</div>
              <div className="admin-session-dates">{fmtDate(s.startDate)} — {fmtDate(s.endDate)}</div>
              {s.theme && <div className="admin-session-theme">"{s.theme}"</div>}
              {s.isActive && <div className="mono admin-session-live">LIVE NOW</div>}
            </button>
          ))}
        </div>
      }
      {editing && <AdminSessionEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminSessionEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(data);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.sessions.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.sessionId} · {d.year}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Display name" value={d.name||""} onChange={v => set("name", v)}/>
          <Field label="Start date" value={d.startDate||""} onChange={v => set("startDate", v)} type="date" required/>
          <Field label="End date"   value={d.endDate||""}   onChange={v => set("endDate", v)}   type="date" required/>
          <Field label="Theme" value={d.theme||""} onChange={v => set("theme", v)} placeholder='"Build the room." etc.'/>
          <Field label="Cover image URL" value={d.coverUrl||""} onChange={v => set("coverUrl", v)}/>
          <FieldTextarea label="Internal notes" value={d.notes||""} onChange={v => set("notes", v)}/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Missions, Events, Posts (compact CRUD)
// ============================================================================

function AdminMissions() {
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const load = () => NGGApi.admin.missions.list().then(r => setList(r.missions || []));
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Anchor missions</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New mission</button>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        <div className="admin-mission-list">
          {Array.from({length: 12}).map((_, idx) => {
            const w = idx + 1;
            const ms = list.filter(m => Number(m.week) === w);
            return (
              <div key={w} className="admin-mission-week">
                <div className="admin-mission-week-h">
                  <span className="mono">WK {String(w).padStart(2, "0")}</span>
                  <span>{ms[0]?.theme || ""}</span>
                  <span className="admin-mission-week-c">{ms.length} missions</span>
                </div>
                <div className="admin-mission-rows">
                  {ms.map(m => (
                    <button key={m.missionId} className="admin-mission-row" onClick={() => setEditing(m)}>
                      <span className="mono">{m.missionId}</span>
                      <span className="admin-mission-row-t">{m.title}</span>
                      <span className="mono admin-mission-row-x">+{m.xp} XP</span>
                    </button>
                  ))}
                  {ms.length === 0 && <button className="admin-mission-row admin-mission-row-empty" onClick={() => setEditing({ week: w })}>+ Add mission to week {w}</button>}
                </div>
              </div>
            );
          })}
        </div>
      }
      {editing && <AdminMissionEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminMissionEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(data);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.missions.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.missionId ? "Edit mission" : "New mission"}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-fields">
          <div className="admin-fields-row">
            <Field label="Week (1-12)" value={d.week||""} onChange={v => set("week", Number(v))} type="number" required/>
            <Field label="Order" value={d.order||"1"} onChange={v => set("order", Number(v))} type="number"/>
          </div>
          <Field label="Theme" value={d.theme||""} onChange={v => set("theme", v)} placeholder="Identity, Discipline…"/>
          <Field label="Title" value={d.title||""} onChange={v => set("title", v)} required/>
          <FieldTextarea label="Prompt — what the teen has to do" value={d.prompt||""} onChange={v => set("prompt", v)}/>
          <div className="admin-fields-row">
            <FieldSelect label="Type" value={d.type||"Make"} onChange={v => set("type", v)} options={["Make","Read","Speak","Reflect","Serve","Move"]}/>
            <FieldSelect label="Proof" value={d.proof||"text"} onChange={v => set("proof", v)} options={["photo","text","audio","video","link","none"]}/>
          </div>
          <div className="admin-fields-row">
            <Field label="XP" value={d.xp||"60"} onChange={v => set("xp", Number(v))} type="number"/>
            <Field label="Time (min)" value={d.estimatedMin||"15"} onChange={v => set("estimatedMin", Number(v))} type="number"/>
            <Field label="Book page" value={d.bookPage||""} onChange={v => set("bookPage", Number(v) || "")} type="number"/>
          </div>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminEvents() {
  const [editing, setEditing] = React.useState(null);
  const [refresh, setRefresh] = React.useState(0);
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    NGGApi.public.events().then(r => setList(r.events || []));
  }, [refresh]);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Events</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New event</button>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No events yet.</div> :
        <div className="admin-event-list">
          {list.map(ev => (
            <button key={ev.eventId} className="admin-event-row" onClick={() => setEditing(ev)}>
              <div className="admin-event-date-block">
                <div>{new Date(ev.startAt).getDate()}</div>
                <div className="mono">{new Date(ev.startAt).toLocaleString("en", { month: "short" })}</div>
              </div>
              <div>
                <div className="admin-event-title">{ev.title}</div>
                <div className="mono admin-event-meta">{ev.kind} · CACENTRE {ev.centre} · {ev.location || ""}</div>
              </div>
            </button>
          ))}
        </div>
      }
      {editing && <AdminEventEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefresh(r => r + 1); }}/>}
    </div>
  );
}

function AdminEventEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(Object.assign({ status:"published", kind:"session", centre:"Egbeda", isPublic: false }, data));
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.events.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.eventId ? "Edit event" : "New event"}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Title" value={d.title||""} onChange={v => set("title", v)} required/>
          <div className="admin-fields-row">
            <FieldSelect label="Kind"   value={d.kind} onChange={v => set("kind", v)} options={["session","showcase","parent-meet","community","online"]}/>
            <FieldSelect label="Centre" value={d.centre} onChange={v => set("centre", v)} options={["Egbeda","Ayobo","Both","Online"]}/>
          </div>
          <div className="admin-fields-row">
            <Field label="Start" value={d.startAt||""} onChange={v => set("startAt", v)} type="datetime-local"/>
            <Field label="End"   value={d.endAt||""}   onChange={v => set("endAt", v)}   type="datetime-local"/>
          </div>
          <Field label="Location" value={d.location||""} onChange={v => set("location", v)} placeholder="Room 3, Egbeda Annex"/>
          <Field label="Cover URL" value={d.coverUrl||""} onChange={v => set("coverUrl", v)}/>
          <FieldTextarea label="Description (markdown ok)" value={d.body||""} onChange={v => set("body", v)} rows={6}/>
          <div className="admin-fields-row">
            <Field label="Capacity (0 = open)" value={d.capacity||"0"} onChange={v => set("capacity", Number(v))} type="number"/>
            <FieldSelect label="Status" value={d.status} onChange={v => set("status", v)} options={["draft","published","cancelled"]}/>
            <FieldCheckbox label="Show on public events page" value={d.isPublic} onChange={v => set("isPublic", v)}/>
          </div>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminPosts() {
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [refresh, setRefresh] = React.useState(0);
  React.useEffect(() => { NGGApi.public.posts().then(r => setList(r.posts || [])); }, [refresh]);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Posts · blog · news · updates · promos</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New post</button>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No posts yet.</div> :
        <ul className="admin-post-list">
          {list.map(p => (
            <li key={p.postId} className="admin-post-row" onClick={() => NGGApi.public.post(p.slug).then(r => setEditing(r.post))}>
              <div>
                <div className="admin-post-title">{p.title}</div>
                <div className="mono admin-post-meta">{p.kind} · {p.category || ""} · {fmtDate(p.publishAt)}</div>
              </div>
              <span className={"chip post-kind-" + p.kind}>{p.kind}</span>
            </li>
          ))}
        </ul>
      }
      {editing && <AdminPostEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefresh(r => r + 1); }}/>}
    </div>
  );
}

function AdminPostEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(Object.assign({ kind:"blog", status:"draft" }, data));
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.posts.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <form className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.postId ? "Edit post" : "New post"}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-fields">
          <div className="admin-fields-row">
            <FieldSelect label="Kind"   value={d.kind}   onChange={v => set("kind", v)}   options={["blog","news","update","promo"]}/>
            <FieldSelect label="Status" value={d.status} onChange={v => set("status", v)} options={["draft","published","archived"]}/>
            <FieldCheckbox label="Featured" value={d.featured} onChange={v => set("featured", v)}/>
          </div>
          <Field label="Title" value={d.title||""} onChange={v => set("title", v)} required/>
          <Field label="Slug (auto from title if blank)" value={d.slug||""} onChange={v => set("slug", v)}/>
          <Field label="Category" value={d.category||""} onChange={v => set("category", v)}/>
          <Field label="Tags (comma)" value={d.tags||""} onChange={v => set("tags", v)}/>
          <Field label="Cover URL" value={d.coverUrl||""} onChange={v => set("coverUrl", v)}/>
          <FieldTextarea label="Excerpt" value={d.excerpt||""} onChange={v => set("excerpt", v)} rows={2}/>
          <FieldTextarea label="Body (markdown)" value={d.body||""} onChange={v => set("body", v)} rows={12}/>
          {d.kind === "promo" && (
            <>
              <div className="admin-fields-row">
                <Field label="CTA label" value={d.promoCta||""} onChange={v => set("promoCta", v)}/>
                <Field label="CTA URL"   value={d.promoUrl||""} onChange={v => set("promoUrl", v)}/>
                <Field label="Expires"   value={d.promoExpires||""} onChange={v => set("promoExpires", v)} type="datetime-local"/>
              </div>
            </>
          )}
          <Field label="Publish at (leave blank for now)" value={d.publishAt||""} onChange={v => set("publishAt", v)} type="datetime-local"/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminBroadcast() {
  const [d, setD] = React.useState({ title:"", body:"", linkPage:"" });
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!window.confirm("Send this to every active member?")) return;
    setBusy(true);
    try { await NGGApi.admin.broadcast(d); setSent(true); setD({ title:"", body:"", linkPage:"" }); setTimeout(() => setSent(false), 2400); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Broadcast a notification</h2></div>
      <form onSubmit={send} className="admin-broadcast">
        <Field label="Title" value={d.title} onChange={v => setD(o => ({...o, title: v}))} required/>
        <FieldTextarea label="Body" value={d.body} onChange={v => setD(o => ({...o, body: v}))} rows={4}/>
        <Field label="Deep-link to page (optional)" value={d.linkPage} onChange={v => setD(o => ({...o, linkPage: v}))} placeholder="anchor, profile, blog…"/>
        <div className="admin-drawer-foot">
          <span className="mono" style={{color:sent ? "var(--lime-ink)" : "var(--ink-500)"}}>{sent ? "SENT ✓" : busy ? "SENDING…" : ""}</span>
          <button className="btn btn-primary" disabled={busy || !d.title}>Broadcast</button>
        </div>
      </form>
    </div>
  );
}

function AdminAudit() {
  const [list, setList] = React.useState(null);
  React.useEffect(() => { NGGApi.admin.audit(200).then(r => setList(r.audit || [])); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Audit log</h2></div>
      {list === null ? <div className="dash-spinner"/> :
        <table className="admin-table">
          <thead><tr><th>When</th><th>Who</th><th>Event</th><th>Subject</th><th>IP</th></tr></thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmtTime(r.at)}</td>
                <td>{r.actorId || "system"}</td>
                <td className="mono">{r.event}</td>
                <td className="mono">{r.subject || "—"}</td>
                <td className="mono">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    </div>
  );
}

// ============================================================================
// Tiny field components
// ============================================================================

function Field({ label, value, onChange, type, placeholder, required }) {
  return (
    <label className="admin-field">
      <span>{label}{required && <em>*</em>}</span>
      <input type={type || "text"} className="admin-input" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required}/>
    </label>
  );
}
function FieldTextarea({ label, value, onChange, rows }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <textarea className="admin-input" rows={rows || 4} value={value || ""} onChange={(e) => onChange(e.target.value)}/>
    </label>
  );
}
function FieldSelect({ label, value, onChange, options }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <select className="admin-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function FieldCheckbox({ label, value, onChange }) {
  return (
    <label className="admin-field admin-field-check">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)}/>
      <span>{label}</span>
    </label>
  );
}

function fmtDate(d) { if (!d) return ""; const x = new Date(d); return x.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }); }
function fmtTime(d) { if (!d) return ""; const x = new Date(d); return x.toLocaleString("en-GB"); }

Object.assign(window, { AdminPage });
