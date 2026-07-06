/* ================================================================
   NGG — Admin console.
   Sections: Members, Mentors, Sessions, Anchor missions, Events,
   Posts (blog/news/updates/promos), Audit log.
   ================================================================ */

// Which capability each admin section needs (null = any staff).
const SECTION_CAP = {
  home: null, members: "people", applications: "people", mentors: "people", mentorship: "people",
  sessions: "content", missions: "content", anchor: "content", assignments: "content",
  events: "content", posts: "content", broadcast: "content",
  newsletter: "inbox", messages: "inbox", audit: "rbac", settings: "settings",
};

function AdminPage({ setPage }) {
  const { member, isAdmin, adminOk, loading, openSignIn, setAdminOk, hasCap } = useAuth();
  const [section, setSection] = React.useState("home");
  const [setupView, setSetupView] = React.useState(false);
  const allowed = (s) => !SECTION_CAP[s] || hasCap(SECTION_CAP[s]);
  // Never render a section the current tier can't access (the backend also
  // enforces this — data calls 403 — but this keeps the UI honest).
  const view = allowed(section) ? section : "home";

  // Expose for the command palette (Cmd-K deep-link to admin sub-section).
  React.useEffect(() => { window.__adminSection = setSection; return () => { window.__adminSection = null; }; }, []);

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
  // Coordinator-only accounts (summer/club, no console caps) belong in their
  // own stand-alone portal, not the admin console.
  const hasConsole = ["content", "people", "inbox", "settings", "rbac"].some(c => hasCap(c));
  if (!hasConsole && (hasCap("summer") || hasCap("club"))) {
    const dest = hasCap("summer") ? "summer-admin" : "club-admin";
    const label = hasCap("summer") ? "Summer School" : "NGG Club";
    return <div className="page admin"><section style={{ padding: "140px 0", textAlign: "center" }}><div className="container">
      <div className="eyebrow">COORDINATOR</div>
      <h1 className="display" style={{ fontSize: "clamp(40px,7vw,84px)" }}>Your portal is over here.</h1>
      <p style={{ marginTop: 18, color: "var(--ink-500)", maxWidth: 480, margin: "18px auto 0" }}>This account manages {label} — use its portal, not the admin console.</p>
      <button className="btn btn-primary btn-lg mt-32" onClick={() => setPage(dest)}>Open {label} portal →</button>
    </div></section></div>;
  }
  if (!adminOk) return <AdminTotpGate onPass={() => setAdminOk(true)} member={member}/>;

  return (
    <div className="page admin" data-screen-label="08 Admin">
      <AdminTopbar section={section} setSection={setSection} setPage={setPage} member={member}/>
      <div className="admin-shell">
        <AdminNav section={view} setSection={setSection} hasCap={hasCap}/>
        <main className="admin-main">
          {view === "home" && <AdminHome setSection={setSection} hasCap={hasCap} member={member}/>}
          {view === "members" && <AdminMembers/>}
          {view === "applications" && <AdminApplications/>}
          {view === "mentors" && <AdminMentors/>}
          {view === "mentorship" && <AdminMentorship/>}
          {view === "newsletter" && <AdminNewsletter/>}
          {view === "messages" && <AdminContact/>}
          {view === "settings" && <AdminSettings/>}
          {view === "sessions" && <AdminSessions/>}
          {view === "missions" && <AdminMissions/>}
          {view === "anchor" && <AdminAnchor/>}
          {view === "assignments" && <AdminAssignments/>}
          {view === "events" && <AdminEvents/>}
          {view === "posts" && <AdminPosts/>}
          {view === "broadcast" && <AdminBroadcast/>}
          {view === "audit" && <AdminAudit/>}
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
        {Array.isArray(member.caps) && member.caps.indexOf("summer") !== -1 && (
          <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("summer-admin")}>Summer ↗</button>
        )}
        {Array.isArray(member.caps) && member.caps.indexOf("club") !== -1 && (
          <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("club-admin")}>NGG Club ↗</button>
        )}
        <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("home")}>View site →</button>
      </div>
    </div>
  );
}

function AdminNav({ section, setSection, hasCap }) {
  const groups = [
    { h: null, items: [{ id: "home", label: "Overview", icon: "◎" }] },
    { h: "People", items: [
      { id: "members",   label: "Members",    icon: "◯", cap: "people" },
      { id: "applications", label: "Applications", icon: "✉", cap: "people" },
      { id: "mentorship", label: "Mentorship", icon: "◐", cap: "people" },
    ]},
    { h: "Content", items: [
      { id: "sessions",  label: "Sessions",   icon: "▢", cap: "content" },
      { id: "missions",  label: "Missions",   icon: "✦", cap: "content" },
      { id: "anchor",    label: "Anchor app", icon: "⚓", cap: "content" },
      { id: "assignments", label: "Assignments", icon: "❏", cap: "content" },
      { id: "events",    label: "Events",     icon: "▶", cap: "content" },
      { id: "posts",     label: "Posts",      icon: "✎", cap: "content" },
      { id: "broadcast", label: "Announce",   icon: "📣", cap: "content" },
    ]},
    { h: "Inbox", items: [
      { id: "newsletter",label: "Newsletter", icon: "✦", cap: "inbox" },
      { id: "messages",  label: "Messages",   icon: "✉", cap: "inbox" },
    ]},
    { h: "System", items: [
      { id: "audit",     label: "Audit trail", icon: "⌗", cap: "rbac" },
      { id: "settings",  label: "Settings",   icon: "⚙", cap: "settings" },
    ]},
  ];
  const can = (it) => !it.cap || (hasCap ? hasCap(it.cap) : true);
  return (
    <aside className="admin-nav">
      {groups.map((grp, gi) => {
        const items = grp.items.filter(can);
        if (!items.length) return null;
        return (
          <React.Fragment key={gi}>
            {grp.h && <div className="admin-nav-group">{grp.h}</div>}
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
          </React.Fragment>
        );
      })}
    </aside>
  );
}

function titleFor(s) {
  return {
    home: "Overview", members: "Members", mentors: "Mentors", mentorship: "Mentorship", sessions: "Sessions",
    missions: "Anchor missions", anchor: "Anchor Journal app", assignments: "Assignments", events: "Events", posts: "Posts", broadcast: "Announcements", audit: "Audit log",
    applications: "Applications", newsletter: "Newsletter", messages: "Messages", settings: "Settings", summer: "Summer School",
  }[s] || "";
}

// ============================================================================
// Home
// ============================================================================

function AdminHome({ setSection, hasCap, member }) {
  const [o, setO] = React.useState(null);
  const [err, setErr] = React.useState("");
  const fmt = (n) => new Intl.NumberFormat("en").format(n || 0);
  const can = (c) => hasCap ? hasCap(c) : true;
  React.useEffect(() => { NGGApi.admin.overview().then(r => setO(r.overview || {})).catch(e => setErr(e.code || e.message)); }, []);

  if (err) return <div className="admin-empty">Couldn't load overview: {err}</div>;
  if (!o) return <div className="dash-spinner"/>;
  const m = o.members || {}, ap = o.applications || {}, asg = o.assignments || {}, an = o.anchor || {}, msg = o.messages || {};
  const maxCentre = Math.max(1, ...(o.byCentre || []).map(c => c.c));
  const maxTrack = Math.max(1, ...(o.byTrack || []).map(t => t.c));
  const roleLabels = { super_admin: "Super admin", admin: "Admin", editor: "Editor" };
  const role = (member && member.role) || "";
  const caps = (member && member.caps) || [];

  return (
    <div className="admin-home">
      {/* Who you are + what you can do */}
      <div className="admin-role-banner">
        <div>
          <span className="mono admin-role-eyebrow">SIGNED IN AS</span>
          <div className="admin-role-name">{(member && member.fullName) || "Staff"} <span className={"chip " + (role === "super_admin" ? "chip-gold" : role === "admin" ? "chip-navy" : "chip-lime")}>{roleLabels[role] || role}</span></div>
        </div>
        <div className="admin-role-caps">
          {["content", "people", "inbox", "settings", "rbac"].map(c => (
            <span key={c} className={"chip admin-cap-chip" + (caps.indexOf(c) !== -1 ? " is-on" : " is-off")}>{c}</span>
          ))}
        </div>
      </div>

      {/* Needs-attention callouts */}
      {((can("people") && ap.new > 0) || (can("content") && asg.toGrade > 0) || (can("inbox") && msg.unread > 0)) && (
        <div className="admin-attn">
          {can("people") && ap.new > 0 && <button className="admin-attn-card" onClick={() => setSection("applications")}><b>{ap.new}</b><span>application{ap.new === 1 ? "" : "s"} to review</span><i>→</i></button>}
          {can("content") && asg.toGrade > 0 && <button className="admin-attn-card" onClick={() => setSection("assignments")}><b>{asg.toGrade}</b><span>submission{asg.toGrade === 1 ? "" : "s"} to grade</span><i>→</i></button>}
          {can("inbox") && msg.unread > 0 && <button className="admin-attn-card" onClick={() => setSection("messages")}><b>{msg.unread}</b><span>message{msg.unread === 1 ? "" : "s"} unread</span><i>→</i></button>}
        </div>
      )}

      <div className="admin-tiles">
        {can("people") && <AdminTile n={fmt(m.active)} l="Active members" onClick={() => setSection("members")}/>}
        {can("people") && <AdminTile n={fmt(m.ngg)} l="NGG members" onClick={() => setSection("members")}/>}
        {can("people") && <AdminTile n={fmt(m.summer)} l="Summer students" onClick={() => setSection("members")}/>}
        {can("people") && <AdminTile n={fmt(m.graduates)} l="Graduates" onClick={() => setSection("members")}/>}
        {can("people") && <AdminTile n={"+" + fmt(m.new30)} l="New · 30 days" onClick={() => setSection("members")}/>}
        {can("people") && <AdminTile n={fmt((o.mentors || {}).active)} l="Active mentors" onClick={() => setSection("mentors")}/>}
        {can("content") && <AdminTile n={fmt(an.journals)} l="Journal entries" onClick={() => setSection("anchor")}/>}
        {can("inbox") && <AdminTile n={fmt((o.newsletter || {}).subscribers)} l="Subscribers" onClick={() => setSection("newsletter")}/>}
      </div>

      <div className="admin-home-grid">
        <div className="admin-panel">
          <h3 className="admin-h3">Members by centre</h3>
          {(o.byCentre || []).length === 0 ? <div className="admin-empty">No data yet.</div> :
            (o.byCentre || []).map(c => (
              <div className="admin-bar-row" key={c.centre}><span>{c.centre || "—"}</span><div className="admin-bar"><div className="admin-bar-fill" style={{ width: (c.c / maxCentre * 100) + "%" }}/></div><b>{c.c}</b></div>
            ))}
          <h3 className="admin-h3" style={{ marginTop: 22 }}>Members by track</h3>
          {(o.byTrack || []).slice(0, 8).map(t => (
            <div className="admin-bar-row" key={t.track}><span>{t.track}</span><div className="admin-bar"><div className="admin-bar-fill alt" style={{ width: (t.c / maxTrack * 100) + "%" }}/></div><b>{t.c}</b></div>
          ))}
        </div>
        <div className="admin-panel">
          <h3 className="admin-h3">Recent activity</h3>
          <div className="admin-activity">
            {(o.recent || []).map((r, i) => (
              <div className="admin-activity-row" key={i}><span className="mono admin-activity-when">{fmtTime(r.at)}</span><span className="mono admin-activity-ev">{r.event}</span><span className="admin-activity-sub">{r.subject || ""}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-quick">
        <h3 className="admin-h3">Quick actions</h3>
        <div className="admin-quick-grid">
          {can("content") && <button className="admin-quick-btn" onClick={() => setSection("posts")}>✎ New post</button>}
          {can("content") && <button className="admin-quick-btn" onClick={() => setSection("events")}>▶ New event</button>}
          {can("content") && <button className="admin-quick-btn" onClick={() => setSection("missions")}>✦ Add mission</button>}
          {can("content") && <button className="admin-quick-btn" onClick={() => setSection("assignments")}>❏ New assignment</button>}
          {can("content") && <button className="admin-quick-btn" onClick={() => setSection("broadcast")}>📣 Announce</button>}
          {can("content") && <button className="admin-quick-btn" onClick={() => setSection("anchor")}>⚓ Edit Anchor</button>}
          {can("people") && <button className="admin-quick-btn" onClick={() => setSection("members")}>◯ Add member</button>}
          {can("settings") && <button className="admin-quick-btn" onClick={() => setSection("settings")}>⚙ Settings</button>}
        </div>
      </div>
    </div>
  );
}

function AdminTile({ n, l, onClick, loading }) {
  return (
    <button className="admin-tile" onClick={onClick}>
      <div className="admin-tile-n">{loading ? <span className="dash-skel" style={{display:"inline-block", width:64, height:34, borderRadius:8}}/> : n}</div>
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
  const [viewing, setViewing] = React.useState(null);

  const exportCsv = () => downloadCsv("members", (list || []).map(m => ({ memberId: m.memberId, fullName: m.fullName, email: m.email, type: m.type, status: m.status, centre: m.centre, track: m.track || "" })));
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
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!list || !list.length}>Export CSV</button>
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
                <tr key={m.memberId} className="admin-row-click" onClick={() => setViewing(m.memberId)}>
                  <td>
                    <div className="admin-cell-name">{m.fullName}</div>
                    <div className="mono admin-cell-sub">{m.memberId} · {m.email}</div>
                  </td>
                  <td>{m.type}</td>
                  <td>{m.centre}</td>
                  <td><span className={"chip status-" + m.status}>{m.status}</span></td>
                  <td>{m.track || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}><button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>Edit</button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan="6" className="admin-empty">No members match.</td></tr>}
            </tbody>
          </table>
        </div>
      }
      {editing && <AdminMemberEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
      {viewing && <AdminMemberDetail memberId={viewing} onClose={() => setViewing(null)} onEdit={(m) => { setViewing(null); setEditing(m); }} onChanged={load}/>}
    </div>
  );
}

function AdminMemberEditor({ data, onClose, onSaved }) {
  const { hasCap } = useAuth();
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
          {/* Staff level — only super_admins (the 'rbac' capability) may assign roles. */}
          {hasCap && hasCap("rbac") && (
            <FieldSelect label="Staff level (access)" value={d.role||"member"} onChange={v => set("role", v)} options={["member","editor","summer_admin","club_admin","admin","super_admin"]}/>
          )}
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
          <FieldUpload label="Photo" value={d.photoUrl||""} onChange={v => set("photoUrl", v)} kind="avatar"/>
          <FieldTextarea label="Public bio" value={d.bio||""} onChange={v => set("bio", v)}/>
          <div className="admin-fields-row">
            <FieldSelect label="Source" value={d.source||"ngg"} onChange={v => set("source", v)} options={["ngg","afrovanguard"]}/>
            <Field label="STS program" value={d.program||""} onChange={v => set("program", v)} placeholder="Street-To-Stardom · Next Gen"/>
          </div>
          <Field label="Skills / expertise" value={d.skills||""} onChange={v => set("skills", v)} placeholder="Guitar, public speaking, coding…"/>
          <div className="admin-fields-row">
            <Field label="LinkedIn" value={d.linkedin||""} onChange={v => set("linkedin", v)}/>
            <Field label="Afrovanguard ref" value={d.afrovanguardRef||""} onChange={v => set("afrovanguardRef", v)} placeholder="STS volunteer ID / note"/>
          </div>
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
// Mentorship manager — overview, roster + mentee pairing, mentor applications,
// and the Afrovanguard (Street-To-Stardom) connection.
// ============================================================================

function AdminMentorship() {
  const [ov, setOv] = React.useState(null);
  const [roster, setRoster] = React.useState(null);
  const [apps, setApps] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [err, setErr] = React.useState("");

  const load = () => {
    NGGApi.admin.mentorship.overview().then(r => setOv(r.overview)).catch(e => setErr(e.code || e.message));
    NGGApi.admin.mentorship.roster().then(r => setRoster(r)).catch(e => setErr(e.code || e.message));
    NGGApi.admin.applications.list({ kind: "mentor", status: "new" }).then(r => setApps(r.applications || [])).catch(() => {});
  };
  React.useEffect(() => { load(); }, []);

  const convert = async (id) => {
    try { const r = await NGGApi.admin.mentorship.convertApp(id); toast.success("Mentor created: " + r.mentorId); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const pair = async (mentorId, memberId, sessionId) => {
    if (!memberId) return;
    try { await NGGApi.admin.mentorship.assign(memberId, mentorId, sessionId); toast.success("Mentee paired"); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const unpair = async (memberId, name, sessionId) => {
    const ok = await dialog.confirm({ title: "Unpair " + (name || "this mentee") + "?", body: "Ends the active mentor pairing for this session.", cta: "Unpair" });
    if (!ok) return;
    try { await NGGApi.admin.mentorship.unassign(memberId, sessionId); toast.success("Unpaired"); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };

  if (err) return <div className="admin-empty">Couldn't load: {err}</div>;
  if (!ov || !roster) return <div className="admin-section"><div className="dash-spinner"/></div>;
  const av = ov.afrovanguard || {};
  const unassigned = roster.unassigned || [];

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Mentorship</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New mentor</button>
      </div>

      {/* Afrovanguard connection */}
      <div className="admin-av-panel">
        <div>
          <div className="mono admin-av-eyebrow">CONNECTED · AFROVANGUARD MENTORSHIP</div>
          <div className="admin-av-prog">{av.mentorProgram || "Street-To-Stardom"}</div>
          <p className="admin-av-note">NGG mentorship runs inside Afrovanguard's Street-To-Stardom. Mentors are drawn from the shared volunteer pool.</p>
        </div>
        <div className="admin-av-links">
          <a className="btn btn-ghost btn-sm" href={av.volunteerUrl} target="_blank" rel="noopener noreferrer">Volunteer hub ↗</a>
          <a className="btn btn-ghost btn-sm" href={av.stsUrl} target="_blank" rel="noopener noreferrer">STS programs ↗</a>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="admin-tiles" style={{ marginTop: 4 }}>
        <AdminTile n={ov.active} l="Active mentors"/>
        <AdminTile n={ov.pending} l="Pending checks"/>
        <AdminTile n={ov.applications} l="Applications"/>
        <AdminTile n={ov.openSeats} l="Open seats"/>
        <AdminTile n={ov.unassignedMembers} l="Unpaired members"/>
        <AdminTile n={ov.fromAfrovanguard} l="From Afrovanguard"/>
      </div>

      {/* Pending mentor applications */}
      {apps.length > 0 && (
        <div className="admin-panel" style={{ marginTop: 18 }}>
          <h3 className="admin-h3">Mentor applications · {apps.length}</h3>
          {apps.map(a => (
            <div key={a.id} className="admin-mentor-app">
              <div>
                <b>{a.name}</b> <span className="mono admin-cell-sub">{a.email}{a.role ? " · " + a.role : ""}{a.centre ? " · " + a.centre : ""}</span>
                {a.why && <p className="admin-app-why">{a.why}</p>}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => convert(a.id)}>Approve → mentor</button>
            </div>
          ))}
        </div>
      )}

      {/* Roster with pairing */}
      <h3 className="admin-h3" style={{ marginTop: 20 }}>Mentor roster · {roster.mentors.length}</h3>
      <div className="admin-roster">
        {roster.mentors.map(m => (
          <div key={m.mentorId} className="admin-roster-card">
            <div className="admin-roster-head">
              {m.photoUrl ? <img src={m.photoUrl} alt="" className="admin-roster-avatar" onError={e => { e.target.style.display = "none"; }}/> : <div className="admin-roster-avatar admin-card-img-fallback">{(m.fullName || "?").charAt(0)}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="admin-roster-name">
                  {m.fullName}
                  <span className={"chip " + (m.status === "active" ? "chip-lime" : "chip-gold")} style={{ marginLeft: 8 }}>{m.status}</span>
                  {m.source === "afrovanguard" && <span className="chip chip-navy" style={{ marginLeft: 6 }}>AV</span>}
                </div>
                <div className="mono admin-cell-sub">{m.centre}{(m.tracks || []).length ? " · " + m.tracks.join(", ") : ""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>Edit</button>
            </div>
            <div className="admin-roster-cap">
              <span className="mono">{m.menteeCount} / {m.maxMentees || 0} mentees</span>
              <span className={"chip " + (m.openSeats > 0 ? "chip-lime" : "chip-coral")}>{m.openSeats > 0 ? m.openSeats + " open" : "full"}</span>
            </div>
            {m.mentees.length > 0 && (
              <div className="admin-roster-mentees">
                {m.mentees.map(x => (
                  <span key={x.memberId} className="chip admin-mentee-chip" title={x.centre + " · " + x.track}>
                    {x.fullName}
                    <button className="admin-mentee-x" onClick={() => unpair(x.memberId, x.fullName, roster.sessionId)} aria-label={"Unpair " + x.fullName}>✕</button>
                  </span>
                ))}
              </div>
            )}
            {m.openSeats > 0 && unassigned.length > 0 && (
              <select className="admin-select admin-roster-pair" defaultValue="" onChange={e => { pair(m.mentorId, e.target.value, roster.sessionId); e.target.value = ""; }}>
                <option value="">+ Pair a mentee…</option>
                {unassigned.map(u => <option key={u.memberId} value={u.memberId}>{u.fullName} · {u.centre}{u.track ? " · " + u.track : ""}</option>)}
              </select>
            )}
          </div>
        ))}
        {roster.mentors.length === 0 && <div className="admin-empty">No mentors yet. Approve an application or add one.</div>}
      </div>

      {unassigned.length > 0 && (
        <p className="admin-hint" style={{ marginTop: 14 }}>{unassigned.length} active member{unassigned.length === 1 ? "" : "s"} still need a mentor this session.</p>
      )}

      {editing && <AdminMentorEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

// ============================================================================
// Summer School — QR-driven attendance & enrollment (Phase 1)
// ============================================================================

function AdminSummer() {
  const [tab, setTab] = React.useState("overview");
  const [ov, setOv] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.summer.overview().then(setOv).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  if (err) return <div className="admin-empty">Couldn't load: {err}</div>;
  if (!ov) return <div className="admin-section"><div className="dash-spinner"/></div>;
  const o = ov.overview, cohort = o.cohort || {};

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Summer School <span className="chip chip-gold" style={{ fontSize: 11 }}>{cohort.name || cohort.cohortId}</span></h2>
      </div>
      <p className="admin-hint">Pre-print QR cards, enrol students against them, and track attendance. Everything mirrors to Google Sheets.</p>

      <div className="admin-tiles" style={{ marginBottom: 8 }}>
        <AdminTile n={o.students} l="Enrolled students"/>
        <AdminTile n={o.presentToday} l="Present today"/>
        <AdminTile n={o.qrBlank} l="Blank QR cards"/>
        <AdminTile n={o.qrAssigned} l="Assigned cards"/>
      </div>

      <div className="admin-anchor-tabs">
        {[["overview", "Enrol"], ["qr", "QR cards"], ["students", "Roster (" + o.students + ")"]].map(([id, lbl]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "overview" && <SummerEnroll cohort={cohort} blank={o.qrBlank} onDone={load}/>}
      {tab === "qr" && <SummerQR onChange={load}/>}
      {tab === "students" && <SummerRoster cohortId={cohort.cohortId}/>}
    </div>
  );
}

function SummerEnroll({ cohort, blank, onDone }) {
  const [d, setD] = React.useState({ fullName: "", age: 12, centre: "Egbeda", track: "", guardianName: "", guardianPhone: "", token: "", photoUrl: "" });
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await NGGApi.admin.summer.enroll(d);
      setDone(r); setD({ fullName: "", age: 12, centre: "Egbeda", track: "", guardianName: "", guardianPhone: "", token: "", photoUrl: "" });
      toast.success("Enrolled " + r.studentId); onDone();
    } catch (e) {
      const map = { no_qr_available: "No blank QR cards left — mint a batch in the QR cards tab first.", qr_already_used: "That QR card is already assigned.", qr_not_found: "QR token not found." };
      toast.error(map[e.code] || e.code || e.message);
    } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 620 }}>
      {done && (
        <div className="admin-anchor-restore" style={{ background: "rgba(208,255,58,0.16)", borderColor: "rgba(110,156,29,0.4)", color: "#2e4400" }}>
          ✓ Enrolled <b style={{ margin: "0 4px" }}>{done.studentId}</b> · card {done.token} · profile <a href={"/q/" + done.token} target="_blank" rel="noopener noreferrer">/q/{done.token}</a>
        </div>
      )}
      {blank === 0 && <div className="admin-anchor-warn">⚠ No blank QR cards. Mint a batch in the “QR cards” tab before enrolling.</div>}
      <form onSubmit={submit} className="admin-fields">
        <Field label="Full name" value={d.fullName} onChange={v => set("fullName", v)} required/>
        <div className="admin-fields-row">
          <Field label="Age" value={d.age} onChange={v => set("age", v)} type="number"/>
          <FieldSelect label="Centre" value={d.centre} onChange={v => set("centre", v)} options={["Egbeda", "Ayobo"]}/>
          <Field label="Track" value={d.track} onChange={v => set("track", v)} placeholder="Music, Tech…"/>
        </div>
        <div className="admin-fields-row">
          <Field label="Guardian name" value={d.guardianName} onChange={v => set("guardianName", v)}/>
          <Field label="Guardian phone" value={d.guardianPhone} onChange={v => set("guardianPhone", v)}/>
        </div>
        <FieldUpload label="Photo" value={d.photoUrl} onChange={v => set("photoUrl", v)} kind="avatar"/>
        <Field label="QR card token (optional — auto-picks a blank card if empty)" value={d.token} onChange={v => set("token", v)} placeholder="SUMQR-XXXXXXXX"/>
        <button className="btn btn-primary" disabled={busy || blank === 0}>{busy ? "Enrolling…" : "Enrol student →"}</button>
      </form>
    </div>
  );
}

function SummerQR({ onChange }) {
  const [codes, setCodes] = React.useState(null);
  const [count, setCount] = React.useState(30);
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.summer.qrList().then(r => setCodes(r.codes || [])).catch(() => setCodes([]));
  React.useEffect(() => { load(); }, []);
  const mint = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.summer.mint(Number(count)); toast.success("Minted " + r.count + " cards (" + r.batch + ")"); load(); onChange && onChange(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const printCards = () => {
    const blanks = (codes || []).filter(c => c.status === "blank");
    const rows = (blanks.length ? blanks : (codes || [])).map(c =>
      `<div class="card"><div class="tok">${c.token}</div><div class="url">${location.origin}/q/${c.token}</div><div class="nm">${c.assignedName || "________________"}</div></div>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Summer QR cards</title><style>
      body{font-family:monospace;margin:0;padding:16px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .card{border:1.5px dashed #333;border-radius:10px;padding:16px;text-align:center;page-break-inside:avoid}
      .tok{font-size:20px;font-weight:800;letter-spacing:2px}.url{font-size:10px;color:#555;margin-top:6px;word-break:break-all}.nm{margin-top:14px;font-size:11px;color:#888}
      @media print{@page{margin:12mm}}
    </style></head><body><h3>Summer QR cards — scan the token or the URL</h3><div class="grid">${rows}</div><script>print()</script></body></html>`);
    w.document.close();
  };
  return (
    <div>
      <div className="admin-filters" style={{ alignItems: "center" }}>
        <input className="admin-input" type="number" min="1" max="500" style={{ maxWidth: 120 }} value={count} onChange={e => setCount(e.target.value)}/>
        <button className="btn btn-primary btn-sm" onClick={mint} disabled={busy}>{busy ? "Minting…" : "Mint blank cards"}</button>
        <button className="btn btn-ghost btn-sm" disabled={!codes || !codes.length} onClick={printCards}>Print cards ↗</button>
      </div>
      <p className="admin-hint">Cards are printed <b>before</b> enrollment. A handheld scanner reads the token straight into the enrol/check-in field; scannable QR images arrive with the check-in kiosk (Phase 2).</p>
      {codes === null ? <div className="dash-spinner"/> :
        codes.length === 0 ? <div className="admin-empty">No cards minted yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Token</th><th>Batch</th><th>Status</th><th>Assigned to</th></tr></thead>
          <tbody>{codes.slice(0, 300).map(c => (
            <tr key={c.token}><td className="mono">{c.token}</td><td className="mono">{c.batch}</td><td><span className={"chip status-" + (c.status === "assigned" ? "published" : "draft")}>{c.status}</span></td><td>{c.assignedName || "—"}</td></tr>
          ))}</tbody>
        </table></div>
      }
    </div>
  );
}

function SummerRoster({ cohortId }) {
  const [list, setList] = React.useState(null);
  const [q, setQ] = React.useState("");
  const load = () => NGGApi.admin.summer.students(q, cohortId).then(r => setList(r.students || [])).catch(() => setList([]));
  React.useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q]);
  const setStatus = async (studentId, status) => { try { await NGGApi.admin.summer.studentStatus(studentId, status); load(); } catch (e) { toast.error(e.code || e.message); } };
  return (
    <div>
      <div className="admin-filters">
        <input className="admin-input" placeholder="Search name / handle / ID" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280 }}/>
        <button className="btn btn-ghost btn-sm" disabled={!list || !list.length} onClick={() => downloadCsv("summer-students", (list || []).map(s => ({ studentId: s.studentId, fullName: s.fullName, handle: s.handle, centre: s.centre, track: s.track, status: s.status, attendance: s.attendanceCount })))}>Export CSV</button>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No students enrolled yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>ID</th><th>Name</th><th>Handle</th><th>Centre</th><th>Track</th><th>Present</th><th>Status</th><th>Profile</th></tr></thead>
          <tbody>{list.map(s => (
            <tr key={s.studentId}>
              <td className="mono">{s.studentId}</td>
              <td>{s.fullName}</td>
              <td className="mono">{s.handle}</td>
              <td>{s.centre}</td><td>{s.track}</td>
              <td className="mono">{s.attendanceCount}</td>
              <td><select className="admin-select" value={s.status} onChange={e => setStatus(s.studentId, e.target.value)}><option value="active">active</option><option value="withdrawn">withdrawn</option><option value="graduated">graduated</option><option value="promoted">promoted</option></select></td>
              <td><a className="mono" href={"/s/" + s.handle} target="_blank" rel="noopener noreferrer">/s/{s.handle}</a></td>
            </tr>
          ))}</tbody>
        </table></div>
      }
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
          <FieldCheckbox label="Active — assignable to members now" value={d.missionId ? (d.isActive !== false) : (d.isActive === undefined ? true : d.isActive)} onChange={v => set("isActive", v)}/>
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
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState("");
  // Admin list = ALL events (drafts, internal, past), not the public feed.
  const load = () => NGGApi.admin.events.list()
    .then(r => { setList(r.events || []); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Events</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New event</button>
      </div>
      {err ? <div className="admin-empty">Couldn't load events: {err}</div> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No events yet.</div> :
        <div className="admin-event-list">
          {list.map(ev => (
            <button key={ev.eventId} className="admin-event-row" onClick={() => setEditing(ev)}>
              <div className="admin-event-date-block">
                <div>{ev.startAt ? new Date(ev.startAt).getDate() : "—"}</div>
                <div className="mono">{ev.startAt ? new Date(ev.startAt).toLocaleString("en", { month: "short" }) : ""}</div>
              </div>
              <div>
                <div className="admin-event-title">{ev.title}</div>
                <div className="mono admin-event-meta">{ev.kind} · CACENTRE {ev.centre} · {ev.location || ""}</div>
              </div>
              <span className={"chip status-" + (ev.status || "draft")} style={{marginLeft:"auto"}}>{ev.status || "draft"}{ev.isPublic ? "" : " · internal"}</span>
            </button>
          ))}
        </div>
      }
      {editing && <AdminEventEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

function AdminEventEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(Object.assign({ status:"draft", kind:"session", centre:"Egbeda", isPublic: false }, data));
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
          <FieldUpload label="Cover image" value={d.coverUrl||""} onChange={v => set("coverUrl", v)} kind="cover"/>
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
  const [err, setErr] = React.useState("");
  // Admin list = ALL posts (drafts/archived too), via the admin endpoint.
  // The public feed only returns published, which hid every draft.
  const load = () => NGGApi.admin.posts.list()
    .then(r => { setList(r.posts || []); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  // Open the full record (any status, incl. body) for editing.
  const open = (postId) => NGGApi.admin.posts.get(postId)
    .then(r => setEditing(r.post))
    .catch(e => toast.error(e.code || e.message));
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Posts · blog · news · updates · promos</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New post</button>
      </div>
      {err ? <div className="admin-empty">Couldn't load posts: {err}</div> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No posts yet.</div> :
        <ul className="admin-post-list">
          {list.map(p => (
            <li key={p.postId} className="admin-post-row" onClick={() => open(p.postId)}>
              <div>
                <div className="admin-post-title">{p.title}</div>
                <div className="mono admin-post-meta">{p.kind} · {p.category || ""} · {fmtDate(p.publishAt)}</div>
              </div>
              <div style={{display:"flex", gap:6, alignItems:"center"}}>
                <span className={"chip status-" + (p.status || "draft")}>{p.status || "draft"}</span>
                <span className={"chip post-kind-" + p.kind}>{p.kind}</span>
              </div>
            </li>
          ))}
        </ul>
      }
      {editing && <AdminPostEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
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
          <FieldUpload label="Cover image" value={d.coverUrl||""} onChange={v => set("coverUrl", v)} kind="cover"/>
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
  const [d, setD] = React.useState({ title:"", body:"", linkPage:"", audience:"all", email:false });
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState("");
  const audienceLabel = {
    all: "every active member", Egbeda: "members at Egbeda", Ayobo: "members at Ayobo",
    Summer: "Summer students", NGG: "NGG members",
  }[d.audience] || "every active member";
  const send = async (e) => {
    e.preventDefault();
    const ok = await dialog.confirm({
      title: "Send this announcement?",
      body: "This posts an in-app announcement to " + audienceLabel + (d.email ? " and emails them too." : ".") + " There's no undo.",
      cta: "Send announcement",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.broadcast(d);
      setSent(d.email ? ("SENT ✓ · emailed " + (r.emailed || 0)) : "SENT ✓");
      setD({ title:"", body:"", linkPage:"", audience:"all", email:false });
      setTimeout(() => setSent(""), 3200);
    }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Announcements</h2></div>
      <p className="admin-hint">Post an in-app announcement to members' notification feeds, optionally emailing them as well. Great for deadlines, showcases and program news.</p>
      <form onSubmit={send} className="admin-broadcast">
        <Field label="Title" value={d.title} onChange={v => setD(o => ({...o, title: v}))} required/>
        <FieldTextarea label="Body" value={d.body} onChange={v => setD(o => ({...o, body: v}))} rows={4}/>
        <div className="admin-fields-row">
          <FieldSelect label="Audience" value={d.audience} onChange={v => setD(o => ({...o, audience: v}))} options={["all","Egbeda","Ayobo","Summer","NGG"]}/>
          <Field label="Deep-link to page (optional)" value={d.linkPage} onChange={v => setD(o => ({...o, linkPage: v}))} placeholder="anchor, dashboard, blog…"/>
        </div>
        <FieldCheckbox label="Also send as email (quota-aware, up to 300)" value={d.email} onChange={v => setD(o => ({...o, email: v}))}/>
        <div className="admin-drawer-foot">
          <span className="mono" style={{color:sent ? "var(--lime-ink)" : "var(--ink-500)"}}>{sent || (busy ? "SENDING…" : "")}</span>
          <button className="btn btn-primary" disabled={busy || !d.title}>Send to {audienceLabel}</button>
        </div>
      </form>
    </div>
  );
}

function AdminAudit() {
  const [data, setData] = React.useState(null);
  const [f, setF] = React.useState({ actor: "", event: "", staffOnly: false });
  const [err, setErr] = React.useState("");
  const roleChip = (role) => role === "super_admin" ? "chip-gold" : role === "admin" ? "chip-navy" : role === "editor" ? "chip-lime" : "";
  const load = () => NGGApi.admin.audit({ limit: 500, actor: f.actor, event: f.event, staffOnly: f.staffOnly ? 1 : "" })
    .then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [f.actor, f.event, f.staffOnly]);
  const rows = data ? data.audit : null;
  const actors = (data && data.actors) || [];
  const exportCsv = () => downloadCsv("audit-trail", (rows || []).map(r => ({ at: r.at, actor: r.actorName || r.actorId || "system", role: r.actorRole || "", event: r.event, subject: r.subject || "", ip: r.ip || "" })));

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Audit trail <span className="chip chip-gold" style={{ fontSize: 11, verticalAlign: "middle" }}>super admin</span></h2>
        <button className="btn btn-ghost btn-sm" disabled={!rows || !rows.length} onClick={exportCsv}>Export CSV</button>
      </div>
      <p className="admin-hint">Every action taken by admins and managers, most recent first. This accountability record is visible to super admins only.</p>
      <div className="admin-filters">
        <select className="admin-select" value={f.actor} onChange={e => setF(o => ({ ...o, actor: e.target.value }))}>
          <option value="">All actors</option>
          {actors.map(a => <option key={a.actorId} value={a.actorId}>{a.fullName || a.actorId} · {a.role}</option>)}
        </select>
        <input className="admin-input" style={{ maxWidth: 220 }} placeholder="Filter by event (e.g. member, anchor)" value={f.event} onChange={e => setF(o => ({ ...o, event: e.target.value }))}/>
        <label className="admin-field admin-field-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={f.staffOnly} onChange={e => setF(o => ({ ...o, staffOnly: e.target.checked }))}/>
          <span>Staff actions only</span>
        </label>
      </div>
      {err ? <div className="admin-empty">Couldn't load: {err}</div> :
        rows === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">No matching activity.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>When</th><th>Who</th><th>Role</th><th>Event</th><th>Subject</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmtTime(r.at)}</td>
                <td>{r.actorName || r.actorId || "system"}</td>
                <td>{r.actorRole ? <span className={"chip " + roleChip(r.actorRole)} style={{ fontSize: 10 }}>{r.actorRole}</span> : <span className="mono" style={{ color: "var(--ink-400)" }}>—</span>}</td>
                <td className="mono">{r.event}</td>
                <td className="mono">{r.subject || "—"}</td>
                <td className="mono">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      }
    </div>
  );
}

// ============================================================================
// Anchor Journal app — manage the content the member PWA renders:
// the 12 weekly build-sheets, the quote library, the daily systems, and the
// 3D tilt toggle. Saved to settings; the app reads it live.
// ============================================================================

// Move item at index i by `dir` (-1 up, +1 down) within an array (immutable).
function arrMove(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
  return next;
}

function AdminAnchor() {
  const [c, setC] = React.useState(null);
  const [defaults, setDefaults] = React.useState(null);
  const [tab, setTab] = React.useState("weeks");
  const [previewIdx, setPreviewIdx] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [draft, setDraft] = React.useState(null); // recovered unsaved draft
  const DRAFT_KEY = "ngg.anchorDraft";
  const update = (fn) => { setC(o => fn(o)); setDirty(true); setSaved(false); };

  React.useEffect(() => {
    NGGApi.admin.anchor.get()
      .then(r => {
        setC(r.content || {}); setDefaults(r.defaults || null);
        try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) { const d = JSON.parse(raw); if (d && d.savedAt) setDraft(d); } } catch (_) {}
      })
      .catch(e => toast.error(e.code || e.message));
  }, []);
  // Autosave every edit to localStorage so a refresh / crash never loses work.
  React.useEffect(() => {
    if (dirty && c) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...c, savedAt: new Date().toISOString() })); } catch (_) {} }
  }, [c, dirty]);
  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} setDraft(null); };
  const restoreDraft = () => { if (draft) { const d = { ...draft }; delete d.savedAt; update(() => d); } setDraft(null); };
  const save = async () => {
    setBusy(true);
    try { await NGGApi.admin.anchor.set(c); setSaved(true); setDirty(false); clearDraft(); setTimeout(() => setSaved(false), 2400); toast.success("Published to the Anchor Journal"); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  const resetAll = async () => {
    const ok = await dialog.confirm({ title: "Reset all Anchor content?", body: "Restores the default 12 weeks, quote library and daily systems. Nothing is published until you press Save.", cta: "Reset to defaults" });
    if (!ok) return;
    const d = defaults || (await NGGApi.admin.anchor.defaults().then(r => r.content).catch(() => null));
    if (d) update(() => JSON.parse(JSON.stringify(d)));
  };
  if (!c) return <div className="admin-section"><div className="dash-spinner"/></div>;

  const weeks = c.weeks || [], quotes = c.quotes || [], systems = c.systems || [];
  const setWeek = (i, k, v) => update(o => ({ ...o, weeks: o.weeks.map((w, idx) => idx === i ? { ...w, [k]: v } : w) }));
  const moveWeek = (i, dir) => update(o => ({ ...o, weeks: arrMove(o.weeks, i, dir) }));
  const resetWeek = (i) => { if (defaults && defaults.weeks && defaults.weeks[i]) update(o => ({ ...o, weeks: o.weeks.map((w, idx) => idx === i ? { ...defaults.weeks[i] } : w) })); };
  const setQuote = (i, v) => update(o => ({ ...o, quotes: o.quotes.map((q, idx) => idx === i ? v : q) }));
  const addQuote = () => update(o => ({ ...o, quotes: [...(o.quotes || []), ""] }));
  const rmQuote = (i) => update(o => ({ ...o, quotes: o.quotes.filter((_, idx) => idx !== i) }));
  const moveQuote = (i, dir) => update(o => ({ ...o, quotes: arrMove(o.quotes, i, dir) }));
  const setSys = (i, k, v) => update(o => ({ ...o, systems: o.systems.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }));
  const addSys = () => update(o => ({ ...o, systems: [...(o.systems || []), { key: "sys" + Date.now(), label: "", icon: "ph-check-circle" }] }));
  const rmSys = (i) => update(o => ({ ...o, systems: o.systems.filter((_, idx) => idx !== i) }));
  const moveSys = (i, dir) => update(o => ({ ...o, systems: arrMove(o.systems, i, dir) }));
  const blankWeek = { title: "", system: "", focus: "", home: "", school: "", peer: "", journal: "", stop: "", start: "", automate: "" };
  const addWeek = () => update(o => ({ ...o, weeks: [...(o.weeks || []), { ...blankWeek }] }));
  const dupWeek = (i) => update(o => { const w = o.weeks.slice(); w.splice(i + 1, 0, { ...w[i] }); return { ...o, weeks: w }; });
  const rmWeek = async (i) => { const ok = await dialog.confirm({ title: "Delete week " + (i + 1) + "?", body: (weeks[i] && weeks[i].title) || "This week", cta: "Delete" }); if (ok) update(o => ({ ...o, weeks: o.weeks.filter((_, idx) => idx !== i) })); };

  // Import / export the whole content bundle as JSON (backup / migrate).
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "anchor-content-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.weeks)) { toast.error("Not a valid Anchor content file"); return; }
      const ok = await dialog.confirm({ title: "Replace all content?", body: "Import " + parsed.weeks.length + " weeks, " + (parsed.quotes || []).length + " quotes, " + (parsed.systems || []).length + " systems. Nothing publishes until you Save.", cta: "Import" });
      if (ok) update(() => ({ weeks: parsed.weeks, quotes: parsed.quotes || [], systems: parsed.systems || [], tilt: parsed.tilt !== false }));
    } catch (_) { toast.error("Couldn't read that file"); }
  };

  // Completeness — how much of each week is filled in.
  const WEEK_FIELDS = ["title", "system", "focus", "home", "school", "peer", "journal"];
  const weekFilled = (w) => WEEK_FIELDS.filter(k => String((w || {})[k] || "").trim()).length;
  const weeksComplete = weeks.filter(w => weekFilled(w) === WEEK_FIELDS.length).length;

  const emptyQuotes = quotes.filter(q => !String(q).trim()).length;
  const warnings = [];
  if (weeks.length !== 12) warnings.push(weeks.length + " weeks (the journey expects 12)");
  if (quotes.length === 0) warnings.push("no quotes in the library");
  if (systems.length === 0) warnings.push("no daily systems");
  if (emptyQuotes) warnings.push(emptyQuotes + " empty quote" + (emptyQuotes === 1 ? "" : "s") + " (dropped on save)");

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Anchor Journal manager</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="mono" style={{ color: saved ? "var(--lime-ink)" : dirty ? "var(--coral)" : "var(--ink-500)" }}>{saved ? "PUBLISHED ✓" : busy ? "SAVING…" : dirty ? "UNSAVED CHANGES" : ""}</span>
          <a className="btn btn-ghost btn-sm" href="/journal/" target="_blank" rel="noopener noreferrer">Open preview ↗</a>
          <button className="btn btn-ghost btn-sm" onClick={exportJson}>Export</button>
          <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", margin: 0 }}>Import<input type="file" accept="application/json,.json" onChange={importJson} style={{ display: "none" }}/></label>
          <button className="btn btn-ghost btn-sm" onClick={resetAll} disabled={busy}>Reset all</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dirty}>Save &amp; publish</button>
        </div>
      </div>
      <p className="admin-hint">Everything here renders live in the members' Anchor Journal PWA. Edit and reorder the weekly build-sheets, the morning-quote library and the daily systems checklist, then publish.</p>

      {draft && !dirty && (
        <div className="admin-anchor-restore">
          <span>↩ You have an unsaved draft{draft.savedAt ? " from " + fmtTime(draft.savedAt) : ""}.</span>
          <span style={{ flex: 1 }}/>
          <button className="btn btn-primary btn-sm" onClick={restoreDraft}>Restore draft</button>
          <button className="btn btn-ghost btn-sm" onClick={clearDraft}>Discard</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="admin-anchor-warn">⚠ {warnings.join(" · ")}</div>
      )}

      <div className="admin-anchor-complete">
        <span className="mono">{weeksComplete} / {weeks.length} weeks complete</span>
        <div className="admin-bar" style={{ maxWidth: 260 }}><div className="admin-bar-fill" style={{ width: (weeks.length ? weeksComplete / weeks.length * 100 : 0) + "%" }}/></div>
      </div>

      <div className="admin-anchor-tabs">
        {[["weeks", "Weeks (" + weeks.length + ")"], ["quotes", "Quotes (" + quotes.length + ")"], ["systems", "Daily systems (" + systems.length + ")"], ["preview", "Preview"], ["settings", "Settings"]].map(([id, lbl]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "weeks" && (
        <div className="admin-anchor-weeks">
          <div className="admin-anchor-weeks-bar">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { document.querySelectorAll(".admin-anchor-week").forEach(d => d.open = true); }}>Expand all</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { document.querySelectorAll(".admin-anchor-week").forEach(d => d.open = false); }}>Collapse all</button>
            <span style={{ flex: 1 }}/>
            <button type="button" className="btn btn-primary btn-sm" onClick={addWeek}>+ Add week</button>
          </div>
          {weeks.map((w, i) => (
            <details key={i} className="admin-anchor-week">
              <summary>
                <span className="mono">WK {String(i + 1).padStart(2, "0")}</span> {w.title || "Untitled"}
                <span className={"admin-anchor-wk-pct" + (weekFilled(w) === WEEK_FIELDS.length ? " is-full" : "")}>{weekFilled(w)}/{WEEK_FIELDS.length}</span>
                <span className="admin-anchor-wk-tools" onClick={e => e.preventDefault()}>
                  <button type="button" className="admin-anchor-mv" disabled={i === 0} onClick={() => moveWeek(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="admin-anchor-mv" disabled={i === weeks.length - 1} onClick={() => moveWeek(i, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="admin-anchor-mv" onClick={() => dupWeek(i)} title="Duplicate week">⎘</button>
                  {defaults && defaults.weeks && defaults.weeks[i] && <button type="button" className="admin-anchor-mv" onClick={() => resetWeek(i)} title="Reset this week to default">⟲</button>}
                  <button type="button" className="admin-anchor-mv admin-anchor-del" onClick={() => rmWeek(i)} title="Delete week">✕</button>
                </span>
              </summary>
              <div className="admin-fields">
                <Field label="Week title" value={w.title || ""} onChange={v => setWeek(i, "title", v)}/>
                <Field label="System being built" value={w.system || ""} onChange={v => setWeek(i, "system", v)}/>
                <Field label="Personal focus" value={w.focus || ""} onChange={v => setWeek(i, "focus", v)}/>
                <Field label="Home actions" value={w.home || ""} onChange={v => setWeek(i, "home", v)}/>
                <Field label="School actions" value={w.school || ""} onChange={v => setWeek(i, "school", v)}/>
                <Field label="Peer modeling" value={w.peer || ""} onChange={v => setWeek(i, "peer", v)}/>
                <FieldTextarea label="Journal prompt" value={w.journal || ""} onChange={v => setWeek(i, "journal", v)} rows={2}/>
                <div className="admin-anchor-habit-lbl mono">HABIT FOCUS · shown on the Growth &amp; Weekly Review screens</div>
                <Field label="Stop" value={w.stop || ""} onChange={v => setWeek(i, "stop", v)}/>
                <Field label="Start" value={w.start || ""} onChange={v => setWeek(i, "start", v)}/>
                <Field label="Automate" value={w.automate || ""} onChange={v => setWeek(i, "automate", v)}/>
              </div>
            </details>
          ))}
        </div>
      )}

      {tab === "quotes" && (
        <div className="admin-anchor-list">
          {quotes.map((q, i) => (
            <div className="admin-anchor-row" key={i}>
              <span className="mono admin-anchor-n">{String(i + 1).padStart(2, "0")}</span>
              <textarea className="admin-input" rows={2} value={q} onChange={e => setQuote(i, e.target.value)}/>
              <div className="admin-anchor-rowtools">
                <button className="admin-anchor-mv" disabled={i === 0} onClick={() => moveQuote(i, -1)} aria-label="Move up">↑</button>
                <button className="admin-anchor-mv" disabled={i === quotes.length - 1} onClick={() => moveQuote(i, 1)} aria-label="Move down">↓</button>
                <button className="admin-anchor-rm" onClick={() => rmQuote(i)} aria-label="Remove">✕</button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addQuote}>+ Add quote</button>
        </div>
      )}

      {tab === "systems" && (
        <div className="admin-anchor-list">
          {systems.map((s, i) => (
            <div className="admin-anchor-row" key={i}>
              <input className="admin-input" style={{ flex: 2 }} placeholder="Label (e.g. Woke up on time)" value={s.label || ""} onChange={e => setSys(i, "label", e.target.value)}/>
              <input className="admin-input" style={{ flex: 1 }} placeholder="ph-icon" value={s.icon || ""} onChange={e => setSys(i, "icon", e.target.value)}/>
              <div className="admin-anchor-rowtools">
                <button className="admin-anchor-mv" disabled={i === 0} onClick={() => moveSys(i, -1)} aria-label="Move up">↑</button>
                <button className="admin-anchor-mv" disabled={i === systems.length - 1} onClick={() => moveSys(i, 1)} aria-label="Move down">↓</button>
                <button className="admin-anchor-rm" onClick={() => rmSys(i)} aria-label="Remove">✕</button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addSys}>+ Add system</button>
          <p className="admin-hint" style={{ marginTop: 10 }}>Icons use Phosphor names (e.g. <code>ph-sun-horizon</code>, <code>ph-book-open-text</code>). See phosphoricons.com.</p>
        </div>
      )}

      {tab === "preview" && (() => {
        const i = Math.min(previewIdx, Math.max(0, weeks.length - 1));
        const w = weeks[i] || {};
        const q = quotes.length ? quotes[i % quotes.length] : "";
        return (
          <div className="admin-anchor-preview">
            <div className="admin-anchor-preview-bar">
              <label className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-500)" }}>PREVIEW WEEK</label>
              <select className="admin-select" value={i} onChange={e => setPreviewIdx(Number(e.target.value))}>
                {weeks.map((ww, idx) => <option key={idx} value={idx}>WK {String(idx + 1).padStart(2, "0")} · {ww.title || "Untitled"}</option>)}
              </select>
              <span style={{ flex: 1 }}/>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>as members see it</span>
            </div>
            {/* Journal-themed member view (violet cosmic theme, mirrors the PWA). */}
            <div className="aj-preview-shell">
              <div className="aj-preview-quote">"{q || "Add a quote in the Quotes tab."}"</div>
              <div className="aj-preview-card">
                <div className="aj-preview-wk">WEEK {String(i + 1).padStart(2, "0")}</div>
                <div className="aj-preview-title">{w.title || "Untitled week"}</div>
                {w.system && <div className="aj-preview-system">◇ {w.system}</div>}
                {w.focus && <p className="aj-preview-focus">{w.focus}</p>}
                <div className="aj-preview-rows">
                  {[["Home", w.home], ["School", w.school], ["Peer", w.peer]].map(([k, v]) => v ? (
                    <div className="aj-preview-row" key={k}><span className="aj-preview-k">{k}</span><span>{v}</span></div>
                  ) : null)}
                </div>
                {w.journal && <div className="aj-preview-journal"><span className="aj-preview-k">Journal prompt</span>{w.journal}</div>}
              </div>
              <div className="aj-preview-systems">
                {systems.map((s, si) => <span key={si} className="aj-preview-sys">{s.label || "—"}</span>)}
              </div>
            </div>
            <p className="admin-hint" style={{ marginTop: 12 }}>Live preview of your unsaved edits. For the full interactive app, use <b>Open preview ↗</b> above (shows the last <em>published</em> version).</p>
          </div>
        );
      })()}

      {tab === "settings" && (
        <div className="admin-fields" style={{ maxWidth: 420 }}>
          <FieldCheckbox label="3D tilt effect on cards" value={c.tilt !== false} onChange={v => update(o => ({ ...o, tilt: v }))}/>
          <p className="admin-hint">The tilt effect gives journal cards a subtle 3D response to the pointer. Disable it for lower-powered devices.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Assignments — publish work, collect submissions, grade with feedback.
// ============================================================================

function AdminAssignments() {
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [grading, setGrading] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.assignments.list()
    .then(r => { setList(r.assignments || []); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Assignments</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New assignment</button>
      </div>
      {err ? <div className="admin-empty">Couldn't load assignments: {err}</div> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No assignments yet. Publish one to send it to members.</div> :
        <div className="admin-assign-list">
          {list.map(a => (
            <div key={a.assignmentId} className="admin-assign-row">
              <button className="admin-assign-main" onClick={() => setEditing(a)}>
                <div className="admin-assign-title">{a.title}</div>
                <div className="mono admin-assign-meta">
                  {(a.track || "All tracks")} · {(a.centre || "All centres")}
                  {a.dueAt ? " · due " + fmtDate(a.dueAt) : ""} · {a.points} pts
                </div>
              </button>
              <div className="admin-assign-side">
                <span className={"chip status-" + (a.status || "draft")}>{a.status || "draft"}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setGrading(a)}>
                  {a.submissionCount} submitted{a.submissionCount ? " · " + a.gradedCount + " graded" : ""} →
                </button>
              </div>
            </div>
          ))}
        </div>
      }
      {editing && <AdminAssignmentEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
      {grading && <AdminSubmissions assignment={grading} onClose={() => { setGrading(null); load(); }}/>}
    </div>
  );
}

function AdminAssignmentEditor({ data, onClose, onSaved }) {
  const [d, setD] = React.useState(Object.assign({ status:"draft", proof:"text", points:10, centre:"", track:"" }, data));
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await NGGApi.admin.assignments.upsert(d); onSaved(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <form className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.assignmentId ? "Edit assignment" : "New assignment"}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Title" value={d.title||""} onChange={v => set("title", v)} required/>
          <FieldTextarea label="Instructions" value={d.instructions||""} onChange={v => set("instructions", v)} rows={6}/>
          <div className="admin-fields-row">
            <FieldSelect label="Centre" value={d.centre||""} onChange={v => set("centre", v)} options={["","Egbeda","Ayobo","Both"]}/>
            <Field label="Track (blank = all)" value={d.track||""} onChange={v => set("track", v)} placeholder="Tech, Music…"/>
            <Field label="Week" value={d.week||""} onChange={v => set("week", Number(v) || "")} type="number"/>
          </div>
          <div className="admin-fields-row">
            <Field label="Due" value={d.dueAt||""} onChange={v => set("dueAt", v)} type="datetime-local"/>
            <Field label="Points" value={d.points||"10"} onChange={v => set("points", Number(v))} type="number"/>
            <FieldSelect label="Submission type" value={d.proof||"text"} onChange={v => set("proof", v)} options={["text","link","photo","audio","video","file"]}/>
          </div>
          <FieldUpload label="Attachment / brief (optional)" value={d.attachmentUrl||""} onChange={v => set("attachmentUrl", v)} kind="cover" accept="*/*" placeholder="Paste a URL or upload a brief →"/>
          <div className="admin-fields-row">
            <FieldSelect label="Status" value={d.status} onChange={v => set("status", v)} options={["draft","published","archived"]}/>
            {d.status === "published" && !d.assignmentId && <FieldCheckbox label="Email members on publish" value={d.notify} onChange={v => set("notify", v)}/>}
          </div>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !d.title}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminSubmissions({ assignment, onClose }) {
  const [data, setData] = React.useState(null);
  const load = () => NGGApi.admin.assignments.submissions(assignment.assignmentId)
    .then(setData).catch(e => toast.error(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-drawer" onClick={onClose}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>Submissions · {assignment.title}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        {!data ? <div className="dash-spinner"/> :
          data.submissions.length === 0 ? <div className="admin-empty">No submissions yet.</div> :
          <div className="admin-sub-list">
            {data.submissions.map(s => (
              <SubmissionRow key={s.submissionId} s={s} maxPoints={data.assignment.points} onGraded={load}/>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

function SubmissionRow({ s, maxPoints, onGraded }) {
  const [grade, setGrade] = React.useState(s.grade == null ? "" : String(s.grade));
  const [feedback, setFeedback] = React.useState(s.feedback || "");
  const [email, setEmail] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await NGGApi.admin.assignments.grade({ submissionId: s.submissionId, grade: Number(grade) || 0, feedback, email });
      toast.success("Graded", s.memberName);
      onGraded();
    } catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-sub-row">
      <div className="admin-sub-head">
        <div>
          <div className="admin-sub-name">{s.memberName} <span className="mono admin-sub-id">{s.memberId}</span></div>
          <div className="mono admin-sub-meta">{s.centre || ""} · submitted {fmtDate(s.submittedAt)}</div>
        </div>
        <span className={"chip status-" + (s.status === "graded" ? "published" : "draft")}>{s.status}</span>
      </div>
      {s.text && <div className="admin-sub-text">{s.text}</div>}
      {s.fileUrl && <a className="admin-sub-file" href={s.fileUrl} target="_blank" rel="noopener noreferrer">↗ Open attachment</a>}
      <div className="admin-sub-grade">
        <label className="admin-field admin-sub-grade-num"><span>Grade{maxPoints ? " / " + maxPoints : ""}</span>
          <input type="number" className="admin-input" value={grade} onChange={e => setGrade(e.target.value)} max={maxPoints || undefined} min={0}/>
        </label>
        <label className="admin-field admin-sub-grade-fb"><span>Feedback</span>
          <input type="text" className="admin-input" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="What was strong, what to improve…"/>
        </label>
        <label className="admin-sub-email"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)}/> email</label>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy || grade === ""}>{busy ? "…" : "Grade"}</button>
      </div>
    </div>
  );
}

// ============================================================================
// Member 360° detail — profile, mentor, progress, journal, submissions, status
// ============================================================================

function AdminMemberDetail({ memberId, onClose, onEdit, onChanged }) {
  const [d, setD] = React.useState(null);
  const [mentors, setMentors] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.memberDetail(memberId).then(r => setD(r.detail)).catch(e => toast.error(e.code || e.message));
  React.useEffect(() => { load(); NGGApi.admin.mentors.list().then(r => setMentors(r.mentors || [])).catch(() => {}); /* eslint-disable-next-line */ }, [memberId]);
  const setStatus = async (status) => { setBusy(true); try { await NGGApi.admin.members.upsert({ memberId, status }); toast.success("Status → " + status); await load(); onChanged && onChanged(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };
  const assign = async (mentorId) => { setBusy(true); try { await NGGApi.admin.assignMentor({ memberId, mentorId }); toast.success(mentorId ? "Mentor assigned" : "Mentor cleared"); await load(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };

  const m = d && d.member;
  return (
    <div className="admin-drawer" onClick={onClose}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>{m ? m.fullName : "Member"}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose}>✕</button>
        </div>
        {!d ? <div className="dash-spinner"/> : (
          <div className="admin-detail">
            <div className="admin-detail-top">
              <div>
                <div className="mono admin-cell-sub">{m.memberId} · {m.email}{m.phone ? " · " + m.phone : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <span className={"chip status-" + m.status}>{m.status}</span>
                  <span className="chip">{m.type}</span>
                  <span className="chip">CACENTRE {m.centre}</span>
                  {m.track && <span className="chip">{m.track}</span>}
                  {m.role && m.role !== "member" && <span className="chip chip-gold">{m.role}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(m)}>Edit profile</button>
            </div>

            <div className="admin-detail-stats">
              <div><b>{d.stats.level}</b><span>Level</span></div>
              <div><b>{d.stats.streak}</b><span>Streak</span></div>
              <div><b>{d.stats.xp}</b><span>XP</span></div>
              <div><b>{d.progress.verified}/{d.progress.total}</b><span>Missions</span></div>
              <div><b>{d.journal.length}</b><span>Journals</span></div>
            </div>

            <div className="admin-detail-section">
              <div className="admin-detail-h">Mentor</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select className="admin-select" value={d.mentor ? d.mentor.mentorId : ""} disabled={busy} onChange={(e) => assign(e.target.value)}>
                  <option value="">— No mentor —</option>
                  {mentors.map(mt => <option key={mt.mentorId} value={mt.mentorId}>{mt.fullName}{mt.tracks && mt.tracks.length ? " · " + mt.tracks.join(", ") : ""}</option>)}
                </select>
              </div>
            </div>

            <div className="admin-detail-section">
              <div className="admin-detail-h">Status</div>
              <div className="admin-detail-actions">
                {m.status !== "active" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("active")}>Activate</button>}
                {m.status !== "suspended" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("suspended")}>Suspend</button>}
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("graduated-ngg")}>Graduate NGG</button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus("graduated-vanguard")}>Graduate Vanguard</button>
              </div>
            </div>

            {(m.parentName || m.parentEmail || m.school) && (
              <div className="admin-detail-section">
                <div className="admin-detail-h">Guardian &amp; school</div>
                <div className="admin-detail-kv">
                  {m.parentName && <div><span>Parent</span>{m.parentName}</div>}
                  {m.parentEmail && <div><span>Parent email</span>{m.parentEmail}</div>}
                  {m.parentPhone && <div><span>Parent phone</span>{m.parentPhone}</div>}
                  {m.school && <div><span>School</span>{m.school}</div>}
                </div>
              </div>
            )}

            {d.submissions.length > 0 && (
              <div className="admin-detail-section">
                <div className="admin-detail-h">Assignment submissions</div>
                {d.submissions.map((s, i) => (
                  <div className="admin-detail-row" key={i}><span>{s.title}</span><span className={"chip status-" + (s.status === "graded" ? "published" : "draft")}>{s.status === "graded" ? (s.grade + "/" + s.points) : s.status}</span></div>
                ))}
              </div>
            )}

            <div className="admin-detail-section">
              <div className="admin-detail-h">Recent journal</div>
              {d.journal.length === 0 ? <div className="admin-empty" style={{ padding: 14 }}>No entries yet.</div> :
                d.journal.slice(0, 8).map((j, i) => (
                  <div className="admin-detail-journal" key={i}><span className="mono admin-detail-jdate">WK{j.week} · {fmtDate(j.createdAt)}</span><p>{(j.body || "").split("\n")[0]}</p></div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Applications — review teen/mentor applications, convert to members
// ============================================================================

function AdminApplications() {
  const [list, setList] = React.useState(null);
  const [filter, setFilter] = React.useState({ kind: "", status: "" });
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.applications.list(filter).then(r => { setList(r.applications || []); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.kind, filter.status]);
  const setStatus = async (id, status) => { try { await NGGApi.admin.applications.status(id, status); load(); } catch (e) { toast.error(e.code || e.message); } };
  const convert = async (id) => {
    const ok = await dialog.confirm({ title: "Convert to member?", body: "This creates an active member account from this application.", cta: "Create member" });
    if (!ok) return;
    try { const r = await NGGApi.admin.applications.convert(id); toast.success("Member created: " + r.memberId); load(); } catch (e) { toast.error(e.code || e.message); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Applications</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" disabled={!list || !list.length} onClick={() => downloadCsv("applications", (list || []).map(a => ({ kind: a.kind, program: a.program || "", name: a.name, email: a.email, age: a.age || "", centre: a.centre || "", track: a.track || "", role: a.role || "", status: a.status, createdAt: a.createdAt })))}>Export CSV</button>
        </div>
      </div>
      <div className="admin-filters">
        <select className="admin-select" value={filter.kind} onChange={e => setFilter(f => ({ ...f, kind: e.target.value }))}><option value="">All kinds</option><option value="teen">Teen</option><option value="mentor">Mentor</option></select>
        <select className="admin-select" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}><option value="">All statuses</option><option value="new">New</option><option value="reviewing">Reviewing</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="waitlist">Waitlist</option></select>
      </div>
      {err ? <div className="admin-empty">Couldn't load: {err}</div> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No applications.</div> :
        <div className="admin-app-list">
          {list.map(a => (
            <div className="admin-app" key={a.id}>
              <div className="admin-app-top">
                <div style={{display:"flex", gap:12, alignItems:"center"}}>
                  {a.photoUrl && <img src={a.photoUrl} alt="" style={{width:40, height:40, borderRadius:"50%", objectFit:"cover", flex:"0 0 auto"}} onError={e => { e.target.style.display = "none"; }}/>}
                  <div>
                    <div className="admin-cell-name">{a.name} <span className="chip">{a.kind}</span>{a.program ? <span className={"chip " + (a.program === "summer" ? "chip-gold" : "chip-navy")}>{a.program}</span> : null}</div>
                    <div className="mono admin-cell-sub">{a.email}{a.age ? " · age " + a.age : ""}{a.centre ? " · " + a.centre : ""}{a.track ? " · " + a.track : ""}{a.role ? " · " + a.role : ""} · {fmtDate(a.createdAt)}</div>
                  </div>
                </div>
                <span className={"chip status-" + (a.status === "accepted" ? "published" : a.status === "rejected" ? "archived" : "draft")}>{a.status}</span>
              </div>
              {a.why && <p className="admin-app-why">{a.why}</p>}
              <div className="admin-app-actions">
                <select className="admin-select admin-app-status" value={a.status} onChange={e => setStatus(a.id, e.target.value)}>
                  <option value="new">New</option><option value="reviewing">Reviewing</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="waitlist">Waitlist</option>
                </select>
                {a.kind === "teen" && a.status !== "accepted" && <button className="btn btn-primary btn-sm" onClick={() => convert(a.id)}>Convert to member →</button>}
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ============================================================================
// Newsletter
// ============================================================================

function AdminNewsletter() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { NGGApi.admin.newsletter().then(setD).catch(e => setErr(e.code || e.message)); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Newsletter {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {d.total}</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!d || !d.subscribers.length} onClick={() => downloadCsv("newsletter", d.subscribers)}>Export CSV</button>
      </div>
      {err ? <div className="admin-empty">Couldn't load: {err}</div> :
        !d ? <div className="dash-spinner"/> :
        d.subscribers.length === 0 ? <div className="admin-empty">No subscribers yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Email</th><th>Source</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>{d.subscribers.map((s, i) => <tr key={i}><td>{s.email}</td><td>{s.source}</td><td><span className={"chip status-" + (s.status === "subscribed" ? "published" : "archived")}>{s.status}</span></td><td className="mono">{fmtDate(s.createdAt)}</td></tr>)}</tbody>
        </table></div>
      }
    </div>
  );
}

// ============================================================================
// Messages — contact-form inbox
// ============================================================================

function AdminContact() {
  const [d, setD] = React.useState(null);
  const [filter, setFilter] = React.useState({ status: "", purpose: "" });
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.contact.list(filter).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.status, filter.purpose]);
  const setStatus = async (id, status) => { try { await NGGApi.admin.contact.status(id, status); load(); } catch (e) { toast.error(e.code || e.message); } };
  const msgs = d ? d.messages : null;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Messages {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {d.unread} new</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!msgs || !msgs.length} onClick={() => downloadCsv("messages", (msgs || []).map(m => ({ ref: m.ref, purpose: m.purpose, name: m.name, email: m.email, phone: m.phone || "", subject: m.subject || "", message: m.message, status: m.status, createdAt: m.createdAt })))}>Export CSV</button>
      </div>
      <div className="admin-filters">
        <select className="admin-select" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}><option value="">All statuses</option><option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option></select>
        <select className="admin-select" value={filter.purpose} onChange={e => setFilter(f => ({ ...f, purpose: e.target.value }))}><option value="">All topics</option><option value="general">General</option><option value="apply">Admissions</option><option value="mentor">Mentoring</option><option value="partner">Partnership</option><option value="media">Media</option><option value="support">Support</option></select>
      </div>
      {err ? <div className="admin-empty">Couldn't load: {err}</div> :
        msgs === null ? <div className="dash-spinner"/> :
        msgs.length === 0 ? <div className="admin-empty">No messages.</div> :
        <div className="admin-app-list">
          {msgs.map(m => (
            <div className="admin-app" key={m.id}>
              <div className="admin-app-top">
                <div>
                  <div className="admin-cell-name">{m.name} <span className="chip chip-navy">{m.purpose}</span></div>
                  <div className="mono admin-cell-sub">{m.email}{m.phone ? " · " + m.phone : ""} · {fmtDate(m.createdAt)} · {m.ref}</div>
                </div>
                <span className={"chip status-" + (m.status === "replied" ? "published" : m.status === "archived" ? "archived" : "draft")}>{m.status}</span>
              </div>
              {m.subject && <div style={{ fontWeight: 600, marginTop: 6 }}>{m.subject}</div>}
              <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{m.message}</p>
              <div className="admin-app-actions">
                <select className="admin-select admin-app-status" value={m.status} onChange={e => setStatus(m.id, e.target.value)}>
                  <option value="new">New</option><option value="read">Read</option><option value="replied">Replied</option><option value="archived">Archived</option>
                </select>
                <a className="btn btn-ghost btn-sm" href={"mailto:" + m.email + "?subject=" + encodeURIComponent("Re: " + (m.subject || "Your message") + " (" + m.ref + ")")}>Reply by email →</a>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ============================================================================
// Settings
// ============================================================================

function AdminSettings() {
  const [s, setS] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    NGGApi.admin.settings.get().then(r => setS(r.settings)).catch(e => toast.error(e.code || e.message));
    NGGApi.admin.sessions.list(new Date().getFullYear()).then(r => setSessions(r.sessions || [])).catch(() => {});
  }, []);
  const save = async () => { setBusy(true); try { await NGGApi.admin.settings.set(s); setSaved(true); setTimeout(() => setSaved(false), 2200); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };
  if (!s) return <div className="admin-section"><div className="dash-spinner"/></div>;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Settings</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="mono" style={{ color: saved ? "var(--lime-ink)" : "var(--ink-500)" }}>{saved ? "SAVED ✓" : busy ? "SAVING…" : ""}</span><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Save</button></div>
      </div>
      <div className="admin-fields" style={{ maxWidth: 520 }}>
        <FieldCheckbox label="Teen applications open" value={s.applications_open} onChange={v => setS(o => ({ ...o, applications_open: v }))}/>
        <FieldCheckbox label="Mentor applications open" value={s.mentor_applications_open} onChange={v => setS(o => ({ ...o, mentor_applications_open: v }))}/>
        <FieldSelect label="Featured session (homepage countdown)" value={s.featured_session_id || ""} onChange={v => setS(o => ({ ...o, featured_session_id: v }))} options={[""].concat(sessions.map(x => x.sessionId))}/>
      </div>
    </div>
  );
}

function downloadCsv(name, rows) {
  if (!rows || !rows.length) { toast.error("Nothing to export"); return; }
  const cols = Object.keys(rows[0]);
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const csv = [cols.join(",")].concat(rows.map(r => cols.map(c => esc(r[c])).join(","))).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
// A URL field with an inline Cloudinary upload button + thumbnail preview.
// The Uploader renders nothing if the server has no Cloudinary configured, so
// this degrades gracefully to a plain paste-a-URL field.
function FieldUpload({ label, value, onChange, kind, accept, placeholder }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <div className="admin-upload-row">
        <input type="text" className="admin-input" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Paste a URL or upload →"}/>
        <Uploader kind={kind || "cover"} accept={accept || "image/*"} onUploaded={(url) => onChange(url)} compact/>
      </div>
      {value && /^https?:\/\//.test(value) && (
        <span className="admin-upload-preview"><img src={value} alt="" onError={(e) => { e.target.style.display = "none"; }}/></span>
      )}
    </label>
  );
}

function fmtDate(d) { if (!d) return ""; const x = new Date(d); return x.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }); }
function fmtTime(d) { if (!d) return ""; const x = new Date(d); return x.toLocaleString("en-GB"); }

// ============================================================================
// NGG Club manager (coordinator portal) — Summer→Club promotion + roster
// ============================================================================

function ClubManager() {
  const [tab, setTab] = React.useState("promote");
  const [ov, setOv] = React.useState(null);
  const load = () => NGGApi.admin.club.overview().then(setOv).catch(() => {});
  React.useEffect(() => { load(); }, []);
  const o = (ov && ov.overview) || {};
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">NGG Club</h2></div>
      <p className="admin-hint">Enrol Summer School graduates into the Club and manage the member roster.</p>
      <div className="admin-tiles" style={{ marginBottom: 8 }}>
        <AdminTile n={o.members ?? "—"} l="Club members"/>
        <AdminTile n={o.promotable ?? "—"} l="Ready to promote"/>
        <AdminTile n={o.promoted ?? "—"} l="Promoted"/>
        <AdminTile n={o.mentors ?? "—"} l="Active mentors"/>
      </div>
      <div className="admin-anchor-tabs">
        {[["promote", "Promote from Summer"], ["members", "Club roster"]].map(([id, lbl]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>
      {tab === "promote" && <ClubPromote onChange={load}/>}
      {tab === "members" && <ClubRoster/>}
    </div>
  );
}

function ClubPromote({ onChange }) {
  const [list, setList] = React.useState(null);
  const load = () => NGGApi.admin.club.promotable().then(r => setList(r.students || [])).catch(() => setList([]));
  React.useEffect(() => { load(); }, []);
  const promote = async (s) => {
    const ok = await dialog.confirm({ title: "Promote " + s.fullName + " to the Club?", body: "Creates an active NGG member from this Summer student, carrying their track, centre and photo.", cta: "Promote" });
    if (!ok) return;
    try { const r = await NGGApi.admin.club.promote(s.studentId); toast.success("Promoted → " + r.memberId); load(); onChange && onChange(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  if (list === null) return <div className="dash-spinner"/>;
  if (!list.length) return <div className="admin-empty">No Summer students awaiting promotion.</div>;
  return (
    <div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>Student</th><th>ID</th><th>Track</th><th>Centre</th><th>Present</th><th/></tr></thead>
      <tbody>{list.map(s => (
        <tr key={s.studentId}>
          <td>{s.fullName}</td>
          <td className="mono">{s.studentId}</td>
          <td>{s.track || "—"}</td><td>{s.centre || "—"}</td>
          <td className="mono">{s.attendanceCount}</td>
          <td><button className="btn btn-primary btn-sm" onClick={() => promote(s)}>Promote →</button></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function ClubRoster() {
  const [list, setList] = React.useState(null);
  const [q, setQ] = React.useState("");
  const load = () => NGGApi.admin.club.members(q).then(r => setList(r.members || [])).catch(() => setList([]));
  React.useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q]);
  return (
    <div>
      <div className="admin-filters">
        <input className="admin-input" placeholder="Search members" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280 }}/>
        <button className="btn btn-ghost btn-sm" disabled={!list || !list.length} onClick={() => downloadCsv("club-members", (list || []).map(m => ({ memberId: m.memberId, fullName: m.fullName, centre: m.centre, track: m.track || "" })))}>Export CSV</button>
      </div>
      {list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No club members yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>ID</th><th>Name</th><th>Centre</th><th>Track</th></tr></thead>
          <tbody>{list.map(m => <tr key={m.memberId}><td className="mono">{m.memberId}</td><td>{m.fullName}</td><td>{m.centre}</td><td>{m.track || "—"}</td></tr>)}</tbody>
        </table></div>
      }
    </div>
  );
}

// ============================================================================
// Stand-alone coordinator portals — the Summer School and NGG Club managers
// are two SEPARATE surfaces, each with its own URL, its own branded login
// screen and its own 2FA gate. A summer_admin can only enter the Summer
// portal; a club_admin only the Club portal; a super_admin bridges both.
// Config is shared server-side; each portal simply reads what it needs.
// ============================================================================

// A portal's own login screen (deliberately NOT the shared member modal):
// password first, with an emailed sign-in code as the fallback.
function PortalLogin({ brand, onVerified }) {
  const [stage, setStage] = React.useState("password"); // password | enter-id | enter-otp
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [masked, setMasked] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const loginPassword = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try { const r = await NGGApi.auth.login(identifier.trim(), password); onVerified(r.member); }
    catch (e) {
      const code = e.code || e.message;
      if (code === "no_password") { setErr("No password on this account yet — use a sign-in code, then set one from your profile."); setStage("enter-id"); }
      else setErr(humanizeAuthError(code));
    } finally { setBusy(false); }
  };
  const requestCode = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try { const r = await NGGApi.auth.request(identifier.trim()); setMasked(r.masked || ""); setStage("enter-otp"); }
    catch (e) { setErr(humanizeAuthError(e.code || e.message)); } finally { setBusy(false); }
  };
  const verifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try { const r = await NGGApi.auth.verify({ memberId: identifier.trim(), otp: otp.replace(/\s+/g, "") }); onVerified(r.member); }
    catch (e) { setErr(humanizeAuthError(e.code || e.message)); } finally { setBusy(false); }
  };

  return (
    <div className="page admin" data-portal={brand.key}>
      <section className="admin-gate">
        <div className="admin-gate-card portal-login-card">
          <div className="portal-login-badge" aria-hidden="true">{brand.icon}</div>
          <div className="eyebrow" style={{ color: "var(--gold-500)" }}>{brand.eyebrow}</div>
          <h2 className="display admin-gate-h">{brand.label}</h2>
          <p className="admin-gate-p">
            {stage === "password" ? "Sign in with your staff email or ID and password."
              : stage === "enter-id" ? "Enter the email or ID on your staff record — we'll email a 6-digit code."
              : masked ? <>We sent a code to <b>{masked}</b>.</> : "Enter the 6-digit code from your email."}
          </p>

          {stage === "password" && (
            <form onSubmit={loginPassword}>
              <input className="signin-input" type="text" autoComplete="username" placeholder="you@email.com  or  NGG-2025-0042"
                value={identifier} onChange={e => setIdentifier(e.target.value)} required minLength={3} autoFocus/>
              <div style={{ position: "relative" }}>
                <input className="signin-input" type={showPw ? "text" : "password"} autoComplete="current-password" placeholder="Password"
                  value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 64 }}/>
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--ink-500)", letterSpacing: "0.06em" }}>{showPw ? "HIDE" : "SHOW"}</button>
              </div>
              {err && <div className="signin-err">{err}</div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !identifier.trim() || !password}>{busy ? "Signing in…" : "Sign in →"}</button>
              <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("enter-id"); }}>Email me a sign-in code instead</button>
            </form>
          )}
          {stage === "enter-id" && (
            <form onSubmit={requestCode}>
              <input className="signin-input" type="text" autoComplete="username" placeholder="NGG-2025-0042  or  you@email.com"
                value={identifier} onChange={e => setIdentifier(e.target.value)} required minLength={3} autoFocus/>
              {err && <div className="signin-err">{err}</div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !identifier.trim()}>{busy ? "Sending…" : "Send me a code →"}</button>
              <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("password"); }}>← Back to password</button>
            </form>
          )}
          {stage === "enter-otp" && (
            <form onSubmit={verifyOtp}>
              <input className="signin-input signin-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                pattern="[0-9 ]*" placeholder="••• •••" value={otp} onChange={e => setOtp(e.target.value.replace(/[^\d ]/g, ""))} required autoFocus/>
              {err && <div className="signin-err">{err}</div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || otp.replace(/\s/g, "").length !== 6}>{busy ? "Verifying…" : "Sign in →"}</button>
              <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("enter-id"); setOtp(""); }}>← Back to send a code</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

// Wraps a single portal section with its own login → cap-lock → 2FA → chrome.
function PortalGate({ cap, brand, setPage, children }) {
  const { member, adminOk, loading, setAdminOk, hasCap, onVerified, signOut } = useAuth();

  if (loading) return <div className="page admin"><div className="container" style={{ padding: "120px 0" }}><div className="dash-spinner"/></div></div>;
  if (!member) return <PortalLogin brand={brand} onVerified={onVerified}/>;

  // Signed in, but not to THIS portal. Each coordinator is locked to their own.
  if (!hasCap(cap)) {
    return <div className="page admin" data-portal={brand.key}><section className="admin-gate"><div className="admin-gate-card portal-login-card">
      <div className="portal-login-badge" aria-hidden="true">{brand.icon}</div>
      <div className="eyebrow" style={{ color: "var(--gold-500)" }}>{brand.eyebrow}</div>
      <h2 className="display admin-gate-h">Wrong portal.</h2>
      <p className="admin-gate-p">You're signed in as <b>{member.fullName}</b>, which doesn't have access to the {brand.label} portal. Sign in with the right staff account.</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => signOut()}>Sign in as someone else</button>
        <button className="btn btn-ghost" onClick={() => setPage("home")}>Back to site</button>
      </div>
    </div></section></div>;
  }
  if (!adminOk) return <AdminTotpGate onPass={() => setAdminOk(true)} member={member}/>;

  return (
    <div className="page admin coord-portal" data-portal={brand.key} data-screen-label={brand.label}>
      <div className="admin-topbar">
        <div className="admin-topbar-l">
          <BrandLogo size={28}/>
          <div className="admin-topbar-title">
            <div className="mono" style={{ fontSize: 10, color: "var(--gold-400)" }}>{brand.eyebrow}</div>
            <div className="admin-topbar-section">{brand.label}</div>
          </div>
        </div>
        <div className="admin-topbar-r">
          <span className="mono" style={{ color: "rgba(255,255,255,0.6)" }}>{member.fullName} · {member.role}</span>
          {/* A super_admin can cross to the other portal; single-cap coordinators can't. */}
          {cap === "summer" && hasCap("club") && <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("club-admin")}>NGG Club ↗</button>}
          {cap === "club" && hasCap("summer") && <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("summer-admin")}>Summer ↗</button>}
          <button className="btn btn-on-dark-ghost btn-sm" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
      <div className="admin-shell">
        <main className="admin-main" style={{ marginLeft: 0 }}>{children}</main>
      </div>
    </div>
  );
}

function SummerAdminPortal({ setPage }) {
  return <PortalGate cap="summer" setPage={setPage}
    brand={{ key: "summer", label: "Summer School", eyebrow: "SUMMER SCHOOL · STAFF PORTAL", icon: "☀" }}>
    <AdminSummer/>
  </PortalGate>;
}

function ClubAdminPortal({ setPage }) {
  return <PortalGate cap="club" setPage={setPage}
    brand={{ key: "club", label: "NGG Club", eyebrow: "NGG CLUB · STAFF PORTAL", icon: "◈" }}>
    <ClubManager/>
  </PortalGate>;
}

Object.assign(window, { AdminPage, SummerAdminPortal, ClubAdminPortal });
