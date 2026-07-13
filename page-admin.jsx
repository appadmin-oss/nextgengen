/* ================================================================
   NGG — Admin console.
   Sections: Members, Mentors, Sessions, Anchor missions, Events,
   Posts (blog/news/updates/promos), Audit log.
   ================================================================ */

// Shared drawer behaviour for every admin editor: an unsaved-changes guard
// (confirms before an accidental scrim-click / Escape discards edits), a focus
// trap, and focus restore on close — giving the admin-drawer modals the same
// accessibility as the dialog/sign-in modals. Attach `panelRef`, `onMouseDown`
// (scrim) and `onInput` to the scrim; wire `close` to the ✕ and Cancel buttons.
function useAdminDrawer(onClose, guard = true) {
  const panelRef = React.useRef(null);
  const touched = React.useRef(false);
  const close = React.useCallback(() => {
    if (guard && touched.current && typeof dialog !== "undefined" && dialog.confirm) {
      dialog.confirm({ title: "Discard changes?", body: "You have edits that haven't been saved yet.", cta: "Discard", cancel: "Keep editing", danger: true })
        .then(ok => { if (ok) onClose(); });
    } else { onClose(); }
  }, [onClose, guard]);
  React.useEffect(() => {
    const prev = document.activeElement;
    const el = panelRef.current;
    if (el) { const f = el.querySelector('input,select,textarea,button:not(.admin-drawer-close)'); if (f) setTimeout(() => { try { f.focus(); } catch (_) {} }, 40); }
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "Tab" && el) {
        const f = el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const a = f[0], b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (prev && prev.focus) { try { prev.focus(); } catch (_) {} } };
  }, [close]);
  return { panelRef, close, onInput: () => { touched.current = true; } };
}

// ── Single source of truth for every Control Room section ──────────────────
// Nav grouping, sidebar label, page title, icon and required capability all
// live here so they can never drift apart again. `cap: null` = any staffer.
// Add a new module by adding ONE row.
const ADMIN_SECTIONS = [
  { id: "home",        group: null,       label: "Overview",     title: "Overview",            icon: "◎", cap: null },
  { id: "members",     group: "People",   label: "Members",      title: "Members",             icon: "◯", cap: "people" },
  { id: "applications",group: "People",   label: "Applications", title: "Applications",        icon: "✉", cap: "people" },
  { id: "volunteers",  group: "People",   label: "Volunteers",   title: "Volunteers",          icon: "◈", cap: "people" },
  { id: "mentors",     group: "People",   label: "Mentors",      title: "Mentors",             icon: "☺", cap: "people" },
  { id: "mentorship",  group: "People",   label: "Mentorship",   title: "Mentorship",          icon: "◐", cap: "people" },
  { id: "registration",group: "People",   label: "Registration", title: "Registration",        icon: "❑", cap: "summer" },
  { id: "qr",          group: "People",   label: "QR codes",     title: "QR codes",            icon: "▦", cap: "summer" },
  { id: "attendance",  group: "People",   label: "Attendance duty", title: "Attendance duty",  icon: "🗓", cap: "summer" },
  { id: "sessions",    group: "Content",  label: "Sessions",     title: "Sessions",            icon: "▢", cap: "content" },
  { id: "missions",    group: "Content",  label: "Missions",     title: "Anchor missions",     icon: "✦", cap: "content" },
  { id: "anchor",      group: "Content",  label: "Anchor app",   title: "Anchor Journal app",  icon: "⚓", cap: "content" },
  { id: "assignments", group: "Content",  label: "Assignments",  title: "Assignments",         icon: "❏", cap: "content" },
  { id: "events",      group: "Content",  label: "Events",       title: "Events",              icon: "▶", cap: "content" },
  { id: "posts",       group: "Content",  label: "Posts",        title: "Posts",               icon: "✎", cap: "content" },
  { id: "photos",      group: "Content",  label: "Photo review", title: "Photo review",        icon: "◲", cap: "content" },
  { id: "broadcast",   group: "Content",  label: "Announce",     title: "Announcements",       icon: "📣", cap: "content" },
  { id: "forms",       group: "Content",  label: "Forms",        title: "Forms",               icon: "▤", cap: "content" },
  { id: "site",        group: "Content",  label: "Site content", title: "Site content",        icon: "◧", cap: "settings" },
  { id: "newsletter",  group: "Inbox",    label: "Newsletter",   title: "Newsletter",          icon: "✧", cap: "inbox" },
  { id: "messages",    group: "Inbox",    label: "Messages",     title: "Messages",            icon: "✆", cap: "inbox" },
  { id: "access",      group: "System",   label: "Access & roles", title: "Access & roles",    icon: "⚿", cap: "rbac" },
  { id: "audit",       group: "System",   label: "Audit trail",  title: "Audit log",           icon: "⌗", cap: "rbac" },
  { id: "settings",    group: "System",   label: "Settings",     title: "Settings",            icon: "⚙", cap: "settings" },
];
// Which capability each admin section needs (null = any staff) — derived.
const SECTION_CAP = ADMIN_SECTIONS.reduce((m, s) => { m[s.id] = s.cap; return m; }, {});

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
          <div className="eyebrow">CONTROL ROOM · STAFF ONLY</div>
          <h1 className="display" style={{fontSize: "clamp(48px, 8vw, 96px)"}}>Restricted.</h1>
          <p style={{marginTop:18, color:"var(--ink-500)", maxWidth:520, margin:"18px auto 0"}}>This is the NGG staff Control Room. Sign in with a staff account, or head back to the public site.</p>
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
          {view === "volunteers" && <AdminVolunteers/>}
          {view === "registration" && <AdminRegistration/>}
          {view === "qr" && <AdminQRCodes/>}
          {view === "mentors" && <AdminMentors/>}
          {view === "mentorship" && <AdminMentorship/>}
          {view === "newsletter" && <AdminNewsletter/>}
          {view === "messages" && <AdminContact/>}
          {view === "settings" && <AdminSettings/>}
          {view === "forms" && <AdminForms/>}
          {view === "site" && <AdminSite/>}
          {view === "sessions" && <AdminSessions/>}
          {view === "missions" && <AdminMissions/>}
          {view === "anchor" && <AdminAnchor/>}
          {view === "assignments" && <AdminAssignments/>}
          {view === "events" && <AdminEvents/>}
          {view === "posts" && <AdminPosts/>}
          {view === "photos" && <AdminPhotos/>}
          {view === "broadcast" && <AdminBroadcast/>}
          {view === "attendance" && <AdminAttendanceDuty/>}
          {view === "access" && <AdminAccess/>}
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
  const [qrHtml, setQrHtml] = React.useState("");

  React.useEffect(() => {
    if (setupMode) {
      NGGApi.auth.adminTotpSetup().then(setSetupData).catch(e => setErr(e.code || e.message));
    }
  }, [setupMode]);

  // Render the otpauth:// URI as a scannable QR once the setup data lands.
  React.useEffect(() => {
    let alive = true;
    if (setupData && setupData.otpauth) {
      ensureQREncoder()
        .then(() => { if (alive) setQrHtml(qrSvg(setupData.otpauth, 5, 2)); })
        .catch(() => { if (alive) setQrHtml(""); });
    }
    return () => { alive = false; };
  }, [setupData]);

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
              <p className="admin-gate-p">Scan this with your authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.</p>
              {setupData ? (
                <>
                  {qrHtml
                    ? <div className="admin-totp-qr" style={{ background: "#fff", padding: 12, borderRadius: 12, width: "fit-content", margin: "0 auto 4px", border: "1px solid var(--line-200, #e6e8ee)" }} dangerouslySetInnerHTML={{ __html: qrHtml }}/>
                    : <div className="dash-spinner"/>}
                  <div className="admin-gate-secret">
                    <div className="mono" style={{fontSize:10, color:"var(--ink-500)"}}>CAN'T SCAN? ENTER THIS KEY MANUALLY</div>
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

// Group order for the sidebar; `null` is the ungrouped top entry (Overview).
const ADMIN_NAV_GROUPS = [null, "People", "Content", "Inbox", "System"];

function AdminNav({ section, setSection, hasCap }) {
  const can = (it) => !it.cap || (hasCap ? hasCap(it.cap) : true);
  const groups = ADMIN_NAV_GROUPS.map(h => ({ h, items: ADMIN_SECTIONS.filter(s => s.group === h) }));
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
  const sec = ADMIN_SECTIONS.find(x => x.id === s);
  return sec ? sec.title : (s === "summer" ? "Summer School" : "");
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
  const m = o.members || {}, ap = o.applications || {}, asg = o.assignments || {}, an = o.anchor || {}, msg = o.messages || {}, vol = o.volunteers || {};
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
      {((can("people") && ap.new > 0) || (can("people") && vol.pending > 0) || (can("people") && vol.unscreened > 0) || (can("content") && asg.toGrade > 0) || (can("inbox") && msg.unread > 0)) && (
        <div className="admin-attn">
          {can("people") && ap.new > 0 && <button className="admin-attn-card" onClick={() => setSection("applications")}><b>{ap.new}</b><span>application{ap.new === 1 ? "" : "s"} to review</span><i>→</i></button>}
          {can("people") && vol.pending > 0 && <button className="admin-attn-card" onClick={() => setSection("volunteers")}><b>{vol.pending}</b><span>volunteer{vol.pending === 1 ? "" : "s"} to review</span><i>→</i></button>}
          {can("people") && vol.unscreened > 0 && <button className="admin-attn-card admin-attn-warn" onClick={() => setSection("volunteers")}><b>{vol.unscreened}</b><span>volunteer{vol.unscreened === 1 ? "" : "s"} not yet screened</span><i>→</i></button>}
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

// Shared pagination control. Renders "N–M of T" plus prev/next; hides itself
// when everything fits on one page. `page` is 1-based.
function Pager({ page, pageSize, total, onPage }) {
  if (!total || total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="admin-pager" role="navigation" aria-label="Pagination">
      <span className="admin-pager-count mono">{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="admin-pager-btns">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">← Prev</button>
        <span className="admin-pager-page mono" aria-current="page">Page {page} / {pages}</span>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next →</button>
      </div>
    </div>
  );
}

// ============================================================================
// Attendance-taker rotation — the daily duty board + gamified roll-close
// ============================================================================
function AdminAttendanceDuty() {
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const load = (d) => { setErr(""); return NGGApi.admin.attendance.admin(d || date).then(setData).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { setData(null); load(date); /* eslint-disable-next-line */ }, [date]);
  const vols = (data && data.volunteers) || [];
  const setTaker = async (centre, volunteerId) => { if (!volunteerId) return; setBusy(centre); try { const r = await NGGApi.admin.attendance.set(date, centre, volunteerId); setData(r); toast.success("Duty updated"); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  const closeRoll = async (centre, volunteerId) => { setBusy(centre); try { const r = await NGGApi.admin.attendance.complete(date, centre, volunteerId); toast.success(r.message || "Roll closed"); await load(date); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Attendance duty</h2>
        <input type="date" className="admin-input" value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: 180 }} aria-label="Duty date"/>
      </div>
      <p className="admin-hint">One volunteer per centre is on the roll each day — auto-rotated across active volunteers; override any pick. Closing the roll awards points toward levels + awards (emailed and shown on the volunteer's digital ID).{data ? " " + data.pool + " volunteers in rotation." : ""}</p>
      {err ? <ErrorState code={err} onRetry={() => load(date)}/> :
        !data ? <div className="dash-spinner"/> :
        (data.duties || []).length === 0 ? <EmptyState title="No centres in rotation yet" message="Enrol summer students to a centre, and register volunteers, to start the daily rotation."/> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Centre</th><th>On duty</th><th>Source</th><th>Status</th><th>Override</th><th></th></tr></thead>
          <tbody>
            {data.duties.map(d => (
              <tr key={d.centre}>
                <td className="admin-cell-name">{d.centre}</td>
                <td>{d.volunteer ? d.volunteer.fullName : "—"}</td>
                <td><span className="chip" style={{ fontSize: 10 }}>{d.source}</span></td>
                <td>{d.completedAt ? <span className="chip chip-lime" style={{ fontSize: 10 }}>closed · {d.takenCount} present</span> : <span className="mono" style={{ color: "var(--ink-400)", fontSize: 12 }}>open</span>}</td>
                <td>
                  <select className="admin-select" value={d.volunteerId} disabled={busy === d.centre} onChange={e => setTaker(d.centre, e.target.value)} aria-label={"Attendance taker for " + d.centre}>
                    {vols.map(v => <option key={v.volunteerId} value={v.volunteerId}>{v.fullName} · {v.role}</option>)}
                  </select>
                </td>
                <td>{!d.completedAt && <button className="btn btn-ghost btn-sm" disabled={busy === d.centre} onClick={() => closeRoll(d.centre, d.volunteerId)}>Close roll</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      }
    </div>
  );
}

// ============================================================================
// Members
// ============================================================================

function AdminMembers() {
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [filters, setFilters] = React.useState({ q: "", centre: "", status: "", type: "" });
  const [page, setPage] = React.useState(1);
  const [meta, setMeta] = React.useState({ total: 0, pageSize: 50 });
  const [editing, setEditing] = React.useState(null);
  const [viewing, setViewing] = React.useState(null);

  const exportCsv = () => downloadCsv("members", (list || []).map(m => ({ memberId: m.memberId, fullName: m.fullName, email: m.email, type: m.type, status: m.status, centre: m.centre, track: m.track || "" })));
  // A failed fetch must surface an error + retry, never leave the spinner
  // hanging forever (previously there was no .catch here). Server-paged.
  const load = (p = page) => { setErr(""); return NGGApi.admin.members.list(Object.assign({}, filters, { page: p, pageSize: meta.pageSize })).then(r => { setList(r.members || []); setMeta({ total: r.total || 0, pageSize: r.pageSize || 50 }); }).catch(e => setErr(e.code || e.message || "load_failed")); };
  // Filter changes reset to page 1; the debounced search does too.
  React.useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line */ }, [filters.centre, filters.status, filters.type]);
  React.useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [filters.q]);
  const goPage = (p) => { setPage(p); setList(null); load(p); };

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Members {meta.total ? <span className="admin-count mono">{meta.total.toLocaleString()}</span> : null}</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!list || !list.length} title="Exports the current page">Export CSV</button>
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
      {list === null ? (err ? <ErrorState code={err} onRetry={load}/> : <div className="dash-spinner"/>) :
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
                  <td><span className={"chip status-" + m.status}>{memberStatusLabel(m.status)}</span></td>
                  <td>{m.track || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}><button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>Edit</button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan="6" className="admin-empty">No members match.</td></tr>}
            </tbody>
          </table>
          <Pager page={page} pageSize={meta.pageSize} total={meta.total} onPage={goPage}/>
        </div>
      }
      {editing && <AdminMemberEditor data={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}/>}
      {viewing && <AdminMemberDetail memberId={viewing} onClose={() => setViewing(null)} onEdit={(m) => { setViewing(null); setEditing(m); }} onChanged={load}/>}
    </div>
  );
}

// Human labels for machine enums shown in staff selects/chips.
const MEMBER_STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "graduated-ngg", label: "Graduated · NGG" },
  { value: "graduated-vanguard", label: "Graduated · Vanguard" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];
const ROLE_OPTS = [
  { value: "member", label: "Member (no staff access)" },
  { value: "editor", label: "Editor · content" },
  { value: "summer_admin", label: "Summer coordinator" },
  { value: "club_admin", label: "Club coordinator" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super admin (full access)" },
];
const ELEVATED_ROLES = ["admin", "super_admin"];
function memberStatusLabel(v) { const o = MEMBER_STATUS_OPTS.find(x => x.value === v); return o ? o.label : (v || "—"); }

function AdminMemberEditor({ data, onClose, onSaved }) {
  const { panelRef, close, onInput } = useAdminDrawer(onClose);
  const { hasCap, member: me } = useAuth();
  const [d, setD] = React.useState(data);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  // Role changes are the highest-consequence edit here. Confirm before granting
  // elevated access, and warn a staffer editing THEIR OWN record before they
  // drop their own access (a lock-out risk the server also guards).
  const isSelf = me && d.memberId && d.memberId === me.memberId;
  const setRole = async (v) => {
    const from = d.role || "member";
    if (v === from) return;
    if (isSelf && ELEVATED_ROLES.indexOf(from) !== -1 && ELEVATED_ROLES.indexOf(v) === -1) {
      const ok = await dialog.confirm({ title: "Change your own access?", body: "You're lowering your OWN staff level. You may immediately lose access to parts of the Control Room. The last active super admin cannot be demoted.", cta: "Change my access", cancel: "Keep as is", danger: true });
      if (!ok) return;
    } else if (ELEVATED_ROLES.indexOf(v) !== -1) {
      const ok = await dialog.confirm({ title: "Grant " + (v === "super_admin" ? "super admin" : "admin") + " access?", body: (d.fullName || "This member") + " will be able to " + (v === "super_admin" ? "manage everything, including roles and the audit trail." : "manage members, content and the inbox."), cta: "Grant access", cancel: "Cancel", danger: v === "super_admin" });
      if (!ok) return;
    }
    set("role", v);
  };
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.memberId ? "Edit member" : "New member"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
            <FieldSelect label="Status" value={d.status||"active"} onChange={v => set("status", v)} options={MEMBER_STATUS_OPTS}/>
            <Field label="Track" value={d.track||""} onChange={v => set("track", v)}/>
          </div>
          <div className="admin-field"><span>Photo</span><PhotoCapture value={d.photoUrl||""} onChange={v => set("photoUrl", v)}/></div>
          <Field label="Parent email" value={d.parentEmail||""} onChange={v => set("parentEmail", v)} type="email"/>
          <Field label="School" value={d.school||""} onChange={v => set("school", v)}/>
          {/* Staff level — only super_admins (the 'rbac' capability) may assign roles.
              setRole confirms elevation and warns on self-demotion. */}
          {hasCap && hasCap("rbac") && (
            <FieldSelect label="Staff level (access)" value={d.role||"member"} onChange={setRole} options={ROLE_OPTS}/>
          )}
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
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
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);
  const load = () => { setErr(""); return NGGApi.admin.mentors.list().then(r => setList(r.mentors || [])).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Mentors</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New mentor</button>
      </div>
      {list === null ? (err ? <ErrorState code={err} onRetry={load}/> : <div className="dash-spinner"/>) :
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
  const { panelRef, close, onInput } = useAdminDrawer(onClose);
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.mentorId ? "Edit mentor" : "New mentor"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
          <Field label="Full name" value={d.fullName||""} onChange={v => set("fullName", v)} required/>
          <Field label="Email" value={d.email||""} onChange={v => set("email", v)} required type="email"/>
          <Field label="Phone" value={d.phone||""} onChange={v => set("phone", v)}/>
          <Field label="Tracks (comma separated)" value={d.tracks||""} onChange={v => set("tracks", v)} placeholder="Music, Tech, Leadership"/>
          <FieldSelect label="Centre" value={d.centre||"Egbeda"} onChange={v => set("centre", v)} options={["Egbeda","Ayobo","Both"]}/>
          <FieldSelect label="Status" value={d.status||"pending-checks"} onChange={v => set("status", v)} options={["active","pending-checks","on-break","retired"]}/>
          <Field label="Max mentees" value={d.maxMentees||"8"} onChange={v => set("maxMentees", v)} type="number"/>
          <div className="admin-field"><span>Photo</span><PhotoCapture value={d.photoUrl||""} onChange={v => set("photoUrl", v)}/></div>
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
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
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

  if (err) return <ErrorState title="Couldn't load" code={err} onRetry={load}/>;
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
// Summer School — QR-driven attendance & enrollment (Phase 1 + 2 kiosk)
// ============================================================================

// Lazy-load a vendored script once; resolves when its global is ready. Keeps
// the ~130KB QR decoder and the encoder off every other page.
const _scriptPromises = {};
function loadVendorScript(src) {
  if (_scriptPromises[src]) return _scriptPromises[src];
  _scriptPromises[src] = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src; el.async = true;
    el.onload = () => resolve(true);
    el.onerror = () => { delete _scriptPromises[src]; reject(new Error("load_failed:" + src)); };
    document.head.appendChild(el);
  });
  return _scriptPromises[src];
}
const ensureQREncoder = () => loadVendorScript("/vendor/qrcode.min.js").then(() => window.qrcode);
const ensureQRDecoder = () => loadVendorScript("/vendor/jsQR.min.js").then(() => window.jsQR);

// Build a crisp SVG QR for a string using the vendored encoder.
function qrSvg(text, cellSize = 4, margin = 2) {
  if (!window.qrcode) return "";
  try { const q = window.qrcode(0, "M"); q.addData(String(text)); q.make(); return q.createSvgTag({ cellSize, margin, scalable: true }); }
  catch (_) { return ""; }
}

// Pull a SUMQR token out of whatever a scanner/camera yields (raw token, a
// /q/<token> URL, or a full profile URL).
function extractToken(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/SUMQR-[A-Z0-9]+/i);
  if (m) return m[0].toUpperCase();
  const parts = s.replace(/[?#].*$/, "").split("/").filter(Boolean);
  return (parts[parts.length - 1] || s).toUpperCase();
}

function AdminSummer() {
  const [tab, setTab] = React.useState("overview");
  const [ov, setOv] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => { setErr(""); NGGApi.admin.summer.overview().then(setOv).catch(e => setErr(e.code || e.message)); };
  React.useEffect(() => { load(); }, []);
  if (err) return <div className="admin-section"><ErrorState title="Couldn't load Summer School" code={err} onRetry={load}/></div>;
  if (!ov) return <div className="admin-section"><div className="dash-spinner"/></div>;
  const o = ov.overview, cohort = o.cohort || {};

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Summer School <span className="chip chip-gold" style={{ fontSize: 11 }}>{cohort.name || cohort.cohortId}</span></h2>
      </div>
      <p className="admin-hint">Build the registration form, hand out gate links, review parent-pending sign-ups, pre-print QR cards, enrol, and track attendance — all mirrored to Google Sheets.</p>

      <div className="admin-tiles" style={{ marginBottom: 8 }}>
        <AdminTile n={o.students} l="Enrolled students"/>
        <AdminTile n={o.presentToday} l="Present today"/>
        <AdminTile n={o.qrBlank} l="Blank QR cards"/>
        <AdminTile n={o.qrAssigned} l="Assigned cards"/>
      </div>

      <div className="admin-anchor-tabs">
        {[["form", "Form builder"], ["gates", "Gate links"], ["pending", "Pending sign-ups"], ["overview", "Enrol"], ["kiosk", "Check-in kiosk"], ["attendance", "Attendance"], ["qr", "QR cards"], ["cards", "ID cards"], ["students", "Roster (" + o.students + ")"]].map(([id, lbl]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "form" && <SummerFormBuilder/>}
      {tab === "gates" && <SummerGates/>}
      {tab === "pending" && <SummerPending onChange={load}/>}
      {tab === "overview" && <SummerEnroll cohort={cohort} blank={o.qrBlank} onDone={load}/>}
      {tab === "kiosk" && <SummerKiosk onCheckin={load}/>}
      {tab === "attendance" && <SummerAttendance/>}
      {tab === "qr" && <SummerQR onChange={load}/>}
      {tab === "cards" && <SummerCardsLink/>}
      {tab === "students" && <SummerRoster cohortId={cohort.cohortId}/>}
    </div>
  );
}

/* ── Form builder — visual editor for the live registration form ──────────── */
const FIELD_TYPE_LABELS = {
  text: "Short text", longtext: "Paragraph", email: "Email", phone: "Phone",
  number: "Number", date: "Date", choice: "Single choice", multi: "Multiple choice",
  yesno: "Yes / No", file: "File upload", section: "Section break", info: "Info text",
};
const HAS_OPTIONS = (t) => t === "choice" || t === "multi";
function keyFromLabel(label) {
  return (label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
}

function SummerFormBuilder({ formId = "summer-reg" }) {
  const [state, setState] = React.useState({ status: "loading", err: "" });
  const [fields, setFields] = React.useState([]);
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [version, setVersion] = React.useState(0);
  const [types, setTypes] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [preview, setPreview] = React.useState(false);

  const load = () => {
    setState({ status: "loading", err: "" });
    NGGApi.admin.registration.form(formId).then(r => {
      setFields((r.form.fields || []).map(f => ({ ...f, _id: Math.random().toString(36).slice(2) })));
      setName(r.form.name || "Form");
      setNote(r.form.note || "");
      setVersion(r.form.version || 1);
      setTypes(r.fieldTypes || Object.keys(FIELD_TYPE_LABELS));
      setDirty(false);
      setState({ status: "ready", err: "" });
    }).catch(e => setState({ status: "error", err: e.code || e.message }));
  };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [formId]);

  const mut = (fn) => { setFields(fn); setDirty(true); };
  const update = (id, patch) => mut(fs => fs.map(f => f._id === id ? { ...f, ...patch } : f));
  const move = (id, dir) => mut(fs => {
    const i = fs.findIndex(f => f._id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= fs.length) return fs;
    const c = [...fs]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const remove = (id) => mut(fs => fs.filter(f => f._id !== id));
  const addField = (type) => mut(fs => [...fs, {
    _id: Math.random().toString(36).slice(2),
    key: "", label: type === "section" ? "New section" : type === "info" ? "Helpful note" : "New question",
    type, required: false, sensitive: false, locked: false,
    options: HAS_OPTIONS(type) ? ["Option 1"] : undefined,
  }]);

  const publish = async () => {
    // Auto-key any blank keys from their labels; keep locked keys intact.
    const out = fields.map(f => {
      const clean = { key: f.locked ? f.key : (f.key || keyFromLabel(f.label)), label: f.label, type: f.type, required: !!f.required, sensitive: !!f.sensitive, locked: !!f.locked };
      if (HAS_OPTIONS(f.type)) clean.options = (f.options || []).map(o => String(o).trim()).filter(Boolean);
      if (f.help) clean.help = f.help;
      if (f.type === "number") { if (f.min != null && f.min !== "") clean.min = Number(f.min); if (f.max != null && f.max !== "") clean.max = Number(f.max); }
      return clean;
    });
    const keys = out.map(f => f.key);
    if (new Set(keys).size !== keys.length) { toast.error("Two fields share the same key — rename one."); return; }
    setBusy(true);
    try { const r = await NGGApi.admin.registration.publishForm(formId, out, name); toast.success("Published v" + (r.version || (version + 1)) + " — live now."); load(); }
    catch (e) { toast.error(e.error || e.code || "Couldn't publish — check field types and keys."); }
    finally { setBusy(false); }
  };

  if (state.status === "loading") return <div className="dash-spinner"/>;
  if (state.status === "error") return <ErrorState title="Couldn't load the form" code={state.err} onRetry={load}/>;

  return (
    <div className="fb">
      <div className="admin-section-head" style={{ alignItems: "center" }}>
        <div>
          <input className="admin-input" value={name} onChange={e => { setName(e.target.value); setDirty(true); }} style={{ fontWeight: 700, fontSize: 16, minWidth: 260 }}/>
          <div className="mono admin-cell-sub" style={{ marginTop: 4 }}>Live v{version} · {fields.length} fields{note ? " · " + note : ""}</div>
        </div>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>{preview ? "Edit" : "Preview"}</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={publish}>{busy ? "Publishing…" : dirty ? "Publish changes" : "Published ✓"}</button>
        </div>
      </div>

      {preview ? <FormPreview fields={fields} name={name}/> : <>
        <div className="fb-list">
          {fields.map((f, i) => (
            <div className="fb-field" key={f._id}>
              <div className="fb-field-rail">
                <button className="fb-move" disabled={i === 0} onClick={() => move(f._id, -1)} aria-label="Move up">↑</button>
                <button className="fb-move" disabled={i === fields.length - 1} onClick={() => move(f._id, 1)} aria-label="Move down">↓</button>
              </div>
              <div className="fb-field-body">
                <div className="fb-field-top">
                  <input className="admin-input fb-label" value={f.label} onChange={e => update(f._id, { label: e.target.value })} placeholder="Question label"/>
                  <select className="admin-select" value={f.type} disabled={f.locked} onChange={e => update(f._id, { type: e.target.value, options: HAS_OPTIONS(e.target.value) ? (f.options || ["Option 1"]) : undefined })}>
                    {types.map(t => <option key={t} value={t}>{FIELD_TYPE_LABELS[t] || t}</option>)}
                  </select>
                  {f.locked
                    ? <span className="chip" title="System field — required by the platform" style={{ alignSelf: "center" }}>🔒 system</span>
                    : <button className="fb-del" onClick={() => remove(f._id)} aria-label="Remove field">✕</button>}
                </div>
                <div className="fb-field-meta">
                  <span className="mono fb-key">key: {f.locked ? f.key : (f.key || keyFromLabel(f.label))}</span>
                  {f.type !== "section" && f.type !== "info" && <label className="fb-toggle"><input type="checkbox" checked={!!f.required} onChange={e => update(f._id, { required: e.target.checked })}/> Required</label>}
                  {f.type !== "section" && f.type !== "info" && <label className="fb-toggle"><input type="checkbox" checked={!!f.sensitive} onChange={e => update(f._id, { sensitive: e.target.checked })}/> Sensitive <span title="Staff-only; never exported or sent to integrations">ⓘ</span></label>}
                </div>
                {HAS_OPTIONS(f.type) && (
                  <div className="fb-options">
                    {(f.options || []).map((opt, oi) => (
                      <div className="fb-option" key={oi}>
                        <input className="admin-input" value={opt} onChange={e => update(f._id, { options: f.options.map((o, k) => k === oi ? e.target.value : o) })}/>
                        <button className="fb-del" onClick={() => update(f._id, { options: f.options.filter((_, k) => k !== oi) })}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-sm" onClick={() => update(f._id, { options: [...(f.options || []), "Option " + ((f.options || []).length + 1)] })}>+ Option</button>
                  </div>
                )}
                {(f.type === "number") && (
                  <div className="fb-field-meta">
                    <label className="fb-toggle">Min <input className="admin-input" style={{ width: 70 }} type="number" value={f.min ?? ""} onChange={e => update(f._id, { min: e.target.value })}/></label>
                    <label className="fb-toggle">Max <input className="admin-input" style={{ width: 70 }} type="number" value={f.max ?? ""} onChange={e => update(f._id, { max: e.target.value })}/></label>
                  </div>
                )}
                <input className="admin-input fb-help" value={f.help || ""} onChange={e => update(f._id, { help: e.target.value })} placeholder="Helper text (optional)"/>
              </div>
            </div>
          ))}
        </div>
        <div className="fb-add">
          <span className="mono admin-cell-sub">Add field:</span>
          {["text", "longtext", "choice", "multi", "number", "date", "yesno", "file", "section", "info"].map(t => (
            <button key={t} className="btn btn-ghost btn-sm" onClick={() => addField(t)}>+ {FIELD_TYPE_LABELS[t]}</button>
          ))}
        </div>
      </>}
    </div>
  );
}

function FormPreview({ fields, name }) {
  return (
    <div className="card" style={{ padding: 28, maxWidth: 640 }}>
      <h3 className="display" style={{ fontSize: 24, margin: "0 0 18px" }}>{name}</h3>
      {fields.map((f, i) => {
        if (f.type === "section") return <h4 key={i} style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "22px 0 6px", color: "var(--navy-900)" }}>{f.label}</h4>;
        if (f.type === "info") return <p key={i} style={{ color: "var(--ink-500)", fontSize: 14, margin: "0 0 12px" }}>{f.label}</p>;
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{f.label}{f.required && <span style={{ color: "var(--coral)" }}> *</span>}</label>
            {f.type === "longtext" ? <textarea className="admin-input" style={{ width: "100%" }} rows={3} disabled/>
              : HAS_OPTIONS(f.type) ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{(f.options || []).map((o, k) => <span key={k} className="chip">{o}</span>)}</div>
              : f.type === "yesno" ? <div style={{ display: "flex", gap: 8 }}><span className="chip">Yes</span><span className="chip">No</span></div>
              : <input className="admin-input" style={{ width: "100%" }} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} disabled/>}
            {f.help && <div className="mono admin-cell-sub" style={{ marginTop: 4 }}>{f.help}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Gate links — create/revoke the staff-gated public registration links ── */
function SummerGates() {
  const [gates, setGates] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [name, setName] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.registration.gates().then(r => { setGates(r.gates || []); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const create = async (e) => {
    e && e.preventDefault();
    if (pw && pw.trim().length < 4) { toast.error("Desk password must be at least 4 characters."); return; }
    setBusy(true);
    try { await NGGApi.admin.registration.gateCreate(name || "Registration desk", "", pw.trim()); setName(""); setPw(""); toast.success(pw.trim() ? "Kiosk gate created." : "Gate link created."); load(); }
    catch (e2) { toast.error(e2.code === "weak_password" ? "Desk password is too short." : (e2.code || e2.message)); } finally { setBusy(false); }
  };
  const revoke = async (id) => { if (!(await dialog.confirm({ title: "Revoke this link?", body: "Anyone using it will no longer be able to register.", cta: "Revoke" }))) return; try { await NGGApi.admin.registration.gateRevoke(id); load(); } catch (e) { toast.error(e.code || e.message); } };
  const setPassword = async (g) => {
    const next = await dialog.prompt({ title: g.hasPassword ? "Change desk password" : "Set a desk password", body: "Field staff open this desk with the password — no admin login needed. Leave blank to remove it.", cta: "Save", placeholder: "Desk password (min 4 chars)", inputType: "password", required: false });
    if (next === null) return; // cancelled
    if (next && next.trim() && next.trim().length < 4) { toast.error("Too short — use at least 4 characters."); return; }
    try { const r = await NGGApi.admin.registration.gateSetpass(g.gateId, next.trim()); toast.success(r.hasPassword ? "Desk password set." : "Desk password removed."); load(); }
    catch (e) { toast.error(e.code === "weak_password" ? "Too short." : (e.code || e.message)); }
  };
  const linkFor = (g) => location.origin + "/gate?g=" + g.gateId;
  return (
    <div>
      <p className="admin-hint">A gate link opens the public registration desk. Give it a <b>desk password</b> and field staff can run it without an admin login; otherwise a signed-in staff member must be present.</p>
      <form onSubmit={create} className="admin-filters">
        <input className="admin-input" placeholder="Label (e.g. Egbeda desk · Sat)" value={name} onChange={e => setName(e.target.value)} style={{ minWidth: 220 }}/>
        <input className="admin-input" type="text" autoComplete="off" placeholder="Desk password (optional)" value={pw} onChange={e => setPw(e.target.value)} style={{ minWidth: 180 }}/>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "…" : "+ Create gate link"}</button>
      </form>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        gates === null ? <div className="dash-spinner"/> :
        gates.length === 0 ? <div className="admin-empty">No gate links yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Label</th><th>Link</th><th>Kiosk</th><th>Used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {gates.map(g => (
              <tr key={g.gateId}>
                <td><b>{g.name}</b><div className="mono admin-cell-sub">{fmtDate(g.createdAt)}</div></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(linkFor(g)); toast.success("Link copied."); }}>Copy link</button></td>
                <td>{g.hasPassword ? <span className="chip chip-lime">🔑 password</span> : <span className="chip status-archived">admin only</span>}</td>
                <td className="mono">{g.usedCount || 0}</td>
                <td>{g.status === "active" ? <span className="chip chip-lime">active</span> : <span className="chip status-archived">{g.status}</span>}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{g.status === "active" && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPassword(g)}>{g.hasPassword ? "Password" : "Set password"}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => revoke(g.gateId)}>Revoke</button>
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}
    </div>
  );
}

/* ── Pending sign-ups — parent-verification queue with resend ─────────────── */
function SummerPending({ onChange }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const load = () => NGGApi.admin.registration.list().then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const remind = async (id) => { setBusy(id); try { const r = await NGGApi.admin.registration.remind(id); toast.success(r.channels && r.channels.length ? "Reminder sent by " + r.channels.join(" + ") : "Reminder queued."); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  if (err) return <ErrorState title="Couldn't load" code={err} onRetry={load}/>;
  if (data === null) return <div className="dash-spinner"/>;
  const rows = data.registrations || [];
  const pending = rows.filter(r => r.regStatus === "parent_pending");
  const badge = (s) => s === "verified" ? <span className="chip chip-lime">verified</span> : s === "parent_pending" ? <span className="chip status-draft">awaiting parent</span> : <span className="chip">{s}</span>;
  return (
    <div>
      <p className="admin-hint">{pending.length} awaiting parent verification · {rows.length} total this cohort. Consent + QR bind happen automatically when the parent confirms.</p>
      {rows.length === 0 ? <div className="admin-empty">No registrations yet — share a gate link to start.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Student</th><th>Course</th><th>Parent contact</th><th>Consents</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.studentId}>
                <td><b>{r.fullName}</b><div className="mono admin-cell-sub">{r.studentId}</div></td>
                <td className="mono" style={{ fontSize: 12 }}>{r.track || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{r.parentEmail || r.guardianPhone || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{(r.consents || []).length || 0}</td>
                <td>{badge(r.regStatus)}</td>
                <td style={{ textAlign: "right" }}>{r.regStatus === "parent_pending" && <button className="btn btn-ghost btn-sm" disabled={busy === r.studentId} onClick={() => remind(r.studentId)}>{busy === r.studentId ? "…" : "Resend link"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}
    </div>
  );
}

/* ── ID cards — deep link into the full-screen studio ─────────────────────── */
function SummerCardsLink() {
  return (
    <div className="card" style={{ padding: 28, textAlign: "center", maxWidth: 520 }}>
      <h3 className="display" style={{ fontSize: 24, margin: "0 0 8px" }}>ID Card Studio</h3>
      <p style={{ color: "var(--ink-500)", margin: "0 0 18px" }}>Design, manage centres, and print the 54×92mm ID cards for verified students in the full-screen studio.</p>
      <a className="btn btn-primary" href="/cards" target="_blank" rel="noreferrer">Open the Card Studio ↗</a>
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
        <div className="admin-field"><span>Photo</span><PhotoCapture value={d.photoUrl} onChange={v => set("photoUrl", v)}/></div>
        <Field label="QR card token (optional — auto-picks a blank card if empty)" value={d.token} onChange={v => set("token", v)} placeholder="SUMQR-XXXXXXXX"/>
        <button className="btn btn-primary" disabled={busy || blank === 0}>{busy ? "Enrolling…" : "Enrol student →"}</button>
      </form>
    </div>
  );
}

function SummerQR({ onChange }) {
  const [codes, setCodes] = React.useState(null);
  const [counts, setCounts] = React.useState({});
  const [count, setCount] = React.useState(30);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [q, setQ] = React.useState("");
  const load = () => NGGApi.admin.summer.qrList(filter, "").then(r => { setCodes(r.codes || []); setCounts(r.counts || {}); }).catch(() => setCodes([]));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  const mint = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.summer.mint(Number(count)); toast.success("Minted " + r.count + " cards (" + r.batch + ")"); load(); onChange && onChange(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const voidCard = async (token) => {
    if (!(await dialog.confirm({ title: "Void " + token + "?", body: "The card can no longer be scanned. If it's bound to a student they'll be detached and need a fresh card.", cta: "Void card" }))) return;
    try { await NGGApi.admin.summer.qrVoid(token); toast.success("Card voided."); load(); onChange && onChange(); } catch (e) { toast.error(e.code || e.message); }
  };
  const reassign = async (token) => {
    const sid = await dialog.prompt({ title: "Reassign " + token, body: "Enter the student ID to bind this card to (e.g. SUM-2026-0001). Their old card is freed.", placeholder: "SUM-2026-…", cta: "Reassign" });
    if (!sid) return;
    try { await NGGApi.admin.summer.qrReassign(token, sid.trim()); toast.success("Card reassigned."); load(); onChange && onChange(); }
    catch (e) { toast.error(e.code === "student_not_found" ? "No student with that ID." : e.code === "card_void" ? "That card is voided." : (e.code || e.message)); }
  };
  const shown = (codes || []).filter(c => !q.trim() || (c.token + " " + (c.assignedName || "") + " " + (c.studentId || "")).toLowerCase().includes(q.trim().toLowerCase()));
  const [printing, setPrinting] = React.useState(false);
  const printCards = async () => {
    setPrinting(true);
    try { await ensureQREncoder(); } catch (_) { toast.error("Couldn't load the QR generator."); setPrinting(false); return; }
    const blanks = (codes || []).filter(c => c.status === "blank");
    const list = blanks.length ? blanks : (codes || []);
    const rows = list.map(c => {
      const url = location.origin + "/q/" + c.token;
      return `<div class="card"><div class="qr">${qrSvg(url, 4, 1)}</div><div class="tok">${c.token}</div><div class="url">${url}</div><div class="nm">${c.assignedName || "________________"}</div></div>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) { setPrinting(false); return; }
    w.document.write(`<html><head><title>Summer QR cards</title><style>
      body{font-family:system-ui,-apple-system,monospace;margin:0;padding:16px;color:#111}
      h3{font-family:system-ui}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .card{border:1.5px dashed #333;border-radius:12px;padding:14px 12px;text-align:center;page-break-inside:avoid}
      .qr{width:118px;height:118px;margin:0 auto 8px}.qr svg{width:100%;height:100%}
      .tok{font-family:monospace;font-size:15px;font-weight:800;letter-spacing:1.5px}
      .url{font-size:9px;color:#666;margin-top:4px;word-break:break-all}
      .nm{margin-top:10px;font-size:11px;color:#888;border-top:1px dotted #ccc;padding-top:8px}
      @media print{@page{margin:12mm}}
    </style></head><body><h3>Summer QR cards — scan with the check-in kiosk or any phone camera</h3><div class="grid">${rows}</div><script>window.onload=function(){print()}</script></body></html>`);
    w.document.close();
    setPrinting(false);
  };
  return (
    <div>
      <div className="admin-tiles" style={{ marginBottom: 8 }}>
        <AdminTile n={counts.blank || 0} l="Blank (ready)"/>
        <AdminTile n={counts.assigned || 0} l="Assigned"/>
        <AdminTile n={counts.void || 0} l="Voided"/>
      </div>
      <div className="admin-filters" style={{ alignItems: "center" }}>
        <input className="admin-input" type="number" min="1" max="500" style={{ maxWidth: 100 }} value={count} onChange={e => setCount(e.target.value)}/>
        <button className="btn btn-primary btn-sm" onClick={mint} disabled={busy}>{busy ? "Minting…" : "Mint blank cards"}</button>
        <button className="btn btn-ghost btn-sm" disabled={!codes || !codes.length || printing} onClick={printCards}>{printing ? "Preparing…" : "Print cards ↗"}</button>
        <span style={{ flex: 1 }}/>
        <select className="admin-select" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option><option value="blank">Blank</option><option value="assigned">Assigned</option><option value="void">Voided</option></select>
        <input className="admin-input" placeholder="Search token / name / ID" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }}/>
      </div>
      <p className="admin-hint">Cards are printed <b>before</b> enrollment, each with a real scannable QR (encodes the student's <span className="mono">/q/&lt;token&gt;</span> profile URL). Void lost or damaged cards to retire them; reassign to move a student onto a reprinted card.</p>
      {codes === null ? <div className="dash-spinner"/> :
        shown.length === 0 ? <div className="admin-empty">No cards match.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Token</th><th>Batch</th><th>Status</th><th>Assigned to</th><th></th></tr></thead>
          <tbody>{shown.slice(0, 400).map(c => (
            <tr key={c.token} style={c.status === "void" ? { opacity: 0.55 } : undefined}>
              <td className="mono">{c.token}</td>
              <td className="mono">{c.batch}</td>
              <td><span className={"chip " + (c.status === "assigned" ? "chip-lime" : c.status === "void" ? "status-archived" : "status-draft")}>{c.status}</span></td>
              <td>{c.assignedName || "—"}{c.studentId ? <span className="mono admin-cell-sub"> · {c.studentId}</span> : null}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {c.status !== "void" && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => reassign(c.token)}>Reassign</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => voidCard(c.token)} style={{ color: "#b03535" }}>Void</button>
                </>}
              </td>
            </tr>
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
  const { panelRef, close, onInput } = useAdminDrawer(onClose);
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.sessionId} · {d.year}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
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
  const { panelRef, close, onInput } = useAdminDrawer(onClose);
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.missionId ? "Edit mission" : "New mission"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
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
  const { panelRef, close, onInput } = useAdminDrawer(onClose);
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.eventId ? "Edit event" : "New event"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
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
  const { panelRef, close, onInput } = useAdminDrawer(onClose);
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.postId ? "Edit post" : "New post"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
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

// Effective capabilities per role — mirrors util.php admin_role_caps() so the
// roster can show what each staffer can actually do (read-only display).
const ROLE_CAPS = {
  super_admin: ["content", "people", "inbox", "settings", "rbac", "summer", "club"],
  admin: ["content", "people", "inbox"],
  editor: ["content"],
  summer_admin: ["summer"],
  club_admin: ["club"],
  audit: ["audit"],
  member: [],
};

// Access & roles — the RBAC roster the audit called for: every staff account,
// its role and effective capabilities, with inline role editing (super_admin
// only). Server enforces last-super-admin / self-demotion; we surface those.
function AdminAccess() {
  const { member: me } = useAuth();
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const load = () => { setErr(""); return NGGApi.admin.members.list({ staff: 1, pageSize: 200 }).then(r => setList(r.members || [])).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const roleLabel = (r) => (ROLE_OPTS.find(o => o.value === r) || {}).label || r;
  const changeRole = async (m, v) => {
    if (v === m.role) return;
    const isSelf = me && m.memberId === me.memberId;
    if (isSelf && ELEVATED_ROLES.indexOf(m.role) !== -1 && ELEVATED_ROLES.indexOf(v) === -1) {
      const ok = await dialog.confirm({ title: "Change your own access?", body: "You're lowering your OWN staff level and may lose access. The last active super admin cannot be demoted.", cta: "Change my access", cancel: "Keep as is", danger: true });
      if (!ok) return;
    } else if (ELEVATED_ROLES.indexOf(v) !== -1) {
      const ok = await dialog.confirm({ title: "Grant " + roleLabel(v) + "?", body: m.fullName + " will gain elevated access.", cta: "Grant access", cancel: "Cancel", danger: v === "super_admin" });
      if (!ok) return;
    }
    setBusy(m.memberId);
    try { await NGGApi.admin.members.upsert({ memberId: m.memberId, role: v }); toast.success("Role updated"); await load(); }
    catch (e) {
      const map = { last_super_admin: "That's the last active super admin — promote another first.", cannot_demote_self: "Ask another super admin to change your role.", cannot_suspend_self: "You can't suspend yourself." };
      toast.error(map[e.code || e.message] || (e.code || e.message));
    } finally { setBusy(""); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Access &amp; roles <span className="chip chip-gold" style={{ fontSize: 11, verticalAlign: "middle" }}>super admin</span>{list ? <span className="admin-count mono">{list.length}</span> : null}</h2>
      </div>
      <p className="admin-hint">Everyone with staff access and what they can do. Roles map to fixed capability sets; the last active super admin can't be demoted, and you can't demote yourself.</p>
      {err ? <ErrorState code={err} onRetry={load}/> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <EmptyState title="No staff yet" message="Grant a member a staff role from the Members editor."/> :
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Person</th><th>Role</th><th>Can access</th></tr></thead>
            <tbody>
              {list.map(m => (
                <tr key={m.memberId}>
                  <td>
                    <div className="admin-cell-name">{m.fullName}{me && m.memberId === me.memberId ? <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>you</span> : null}</div>
                    <div className="mono admin-cell-sub">{m.memberId} · {m.email}</div>
                  </td>
                  <td style={{ minWidth: 190 }}>
                    <select className="admin-select" value={m.role} disabled={busy === m.memberId} onChange={(e) => changeRole(m, e.target.value)} aria-label={"Role for " + m.fullName}>
                      {ROLE_OPTS.filter(o => o.value !== "member").map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(ROLE_CAPS[m.role] || []).length
                        ? (ROLE_CAPS[m.role] || []).map(c => <span key={c} className="chip" style={{ fontSize: 10 }}>{c}</span>)
                        : <span className="mono" style={{ color: "var(--ink-400)", fontSize: 12 }}>—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}

function AdminAudit() {
  const [data, setData] = React.useState(null);
  const [f, setF] = React.useState({ actor: "", event: "", staffOnly: false });
  const [page, setPage] = React.useState(1);
  const [err, setErr] = React.useState("");
  const roleChip = (role) => role === "super_admin" ? "chip-gold" : role === "admin" ? "chip-navy" : role === "editor" ? "chip-lime" : "";
  const load = (p = page) => NGGApi.admin.audit({ page: p, pageSize: 100, actor: f.actor, event: f.event, staffOnly: f.staffOnly ? 1 : "" })
    .then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line */ }, [f.actor, f.event, f.staffOnly]);
  const goPage = (p) => { setPage(p); setData(null); load(p); };
  const rows = data ? data.audit : null;
  const actors = (data && data.actors) || [];
  const exportCsv = () => downloadCsv("audit-trail", (rows || []).map(r => ({ at: r.at, actor: r.actorName || r.actorId || "system", role: r.actorRole || "", event: r.event, subject: r.subject || "", ip: r.ip || "" })));

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Audit trail <span className="chip chip-gold" style={{ fontSize: 11, verticalAlign: "middle" }}>super admin</span></h2>
        <button className="btn btn-ghost btn-sm" disabled={!rows || !rows.length} onClick={exportCsv}>Export CSV</button>
      </div>
      <p className="admin-hint">Every action taken by admins and managers, most recent first. This accountability record is visible to super admins only.{data && data.total ? " " + data.total.toLocaleString() + " entries." : ""}</p>
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
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
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
        </table>
        <Pager page={data ? data.page : 1} pageSize={data ? data.pageSize : 100} total={data ? data.total : 0} onPage={goPage}/>
        </div>
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
  const { panelRef, close, onInput } = useAdminDrawer(onClose);
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <form className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="admin-drawer-head">
          <h3>{d.assignmentId ? "Edit assignment" : "New assignment"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !d.title}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function AdminSubmissions({ assignment, onClose }) {
  const { panelRef, close, onInput } = useAdminDrawer(onClose, false);
  const [data, setData] = React.useState(null);
  const load = () => NGGApi.admin.assignments.submissions(assignment.assignmentId)
    .then(setData).catch(e => toast.error(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>Submissions · {assignment.title}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
  const { panelRef, close, onInput } = useAdminDrawer(onClose, false);
  const [d, setD] = React.useState(null);
  const [mentors, setMentors] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.memberDetail(memberId).then(r => setD(r.detail)).catch(e => toast.error(e.code || e.message));
  React.useEffect(() => { load(); NGGApi.admin.mentors.list().then(r => setMentors(r.mentors || [])).catch(() => {}); /* eslint-disable-next-line */ }, [memberId]);
  const STATUS_LABEL = { active: "Activate", suspended: "Suspend", "graduated-ngg": "Graduate from NGG", "graduated-vanguard": "Graduate as Vanguard", inactive: "Deactivate" };
  const setStatus = async (status) => {
    // Suspend / graduate change a real member's standing and are hard to
    // reverse — confirm first (consistent with the rest of the console).
    if (status !== "active") {
      const ok = await dialog.confirm({ title: (STATUS_LABEL[status] || "Change status") + "?", body: "This changes " + ((m && m.fullName) || "this member") + "'s standing" + (status === "suspended" ? " and revokes their access" : "") + ". You can change it again later.", cta: STATUS_LABEL[status] || "Change", cancel: "Cancel", danger: status === "suspended" });
      if (!ok) return;
    }
    setBusy(true); try { await NGGApi.admin.members.upsert({ memberId, status }); toast.success("Status → " + status); await load(); onChanged && onChanged(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const assign = async (mentorId) => { setBusy(true); try { await NGGApi.admin.assignMentor({ memberId, mentorId }); toast.success(mentorId ? "Mentor assigned" : "Mentor cleared"); await load(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };

  const m = d && d.member;
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>{m ? m.fullName : "Member"}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
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
  const [sel, setSel] = React.useState(() => new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const load = () => NGGApi.admin.applications.list(filter).then(r => { setList(r.applications || []); setErr(""); setSel(new Set()); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.kind, filter.status]);
  const setStatus = async (id, status) => { try { await NGGApi.admin.applications.status(id, status); load(); } catch (e) { toast.error(e.code || e.message); } };
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = list && list.length > 0 && sel.size === list.length;
  const toggleAll = () => setSel(allSelected ? new Set() : new Set((list || []).map(a => a.id)));
  // Bulk status change — one confirm, then apply to every selected row and
  // report how many succeeded. Beats changing dozens of rows one at a time.
  const bulkStatus = async (status) => {
    if (!sel.size || bulkBusy) return;
    const ids = Array.from(sel);
    const ok = await dialog.confirm({ title: "Set " + ids.length + " to " + status + "?", body: "Applies the “" + status + "” status to every selected application.", cta: "Apply to " + ids.length, danger: status === "rejected" });
    if (!ok) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map(id => NGGApi.admin.applications.status(id, status)));
    const failed = results.filter(r => r.status === "rejected").length;
    setBulkBusy(false);
    if (failed) toast.error(failed + " of " + ids.length + " couldn't be updated."); else toast.success(ids.length + " applications updated.");
    load();
  };
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
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        list === null ? <div className="dash-spinner"/> :
        list.length === 0 ? <div className="admin-empty">No applications.</div> :
        <React.Fragment>
        <div className="admin-bulkbar">
          <label className="admin-bulk-all"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all applications"/> <span>{sel.size ? sel.size + " selected" : "Select all"}</span></label>
          {sel.size > 0 && (
            <div className="admin-bulk-actions">
              <span className="mono admin-bulk-label">Set status:</span>
              {["reviewing", "accepted", "waitlist", "rejected"].map(s => (
                <button key={s} className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => bulkStatus(s)}>{s}</button>
              ))}
              <button className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => setSel(new Set())}>Clear</button>
            </div>
          )}
        </div>
        <div className="admin-app-list">
          {list.map(a => (
            <div className={"admin-app" + (sel.has(a.id) ? " is-selected" : "")} key={a.id}>
              <div className="admin-app-top">
                <div style={{display:"flex", gap:12, alignItems:"center"}}>
                  <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} aria-label={"Select " + a.name} style={{flex:"0 0 auto", width:18, height:18}}/>
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
        </React.Fragment>
      }
    </div>
  );
}

// ============================================================================
// Volunteers — review desk + approved roster + safeguarding
// ============================================================================

function AdminVolunteers() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [tab, setTab] = React.useState("pending");
  const [q, setQ] = React.useState("");
  const load = () => NGGApi.admin.volunteers.list().then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const approve = async (a) => {
    if (a.role === "instructor" && !a.phone) { toast.error("Instructors need a phone before approval."); return; }
    const ok = await dialog.confirm({ title: "Approve " + a.name + "?", body: "This issues a volunteer ID + QR attendance profile and emails" + (a.phone ? "/SMSes" : "") + " it to them. " + (a.role !== "admin" ? "Safeguarding screening is still required before they work with young people." : ""), cta: "Approve & issue ID" });
    if (!ok) return;
    setBusy("a" + a.id);
    try { const r = await NGGApi.admin.volunteers.approve(a.id); toast.success("Approved · " + r.volunteer.volunteerId + (r.idSent && r.idSent.length ? " · ID sent by " + r.idSent.join(" + ") : "")); load(); }
    catch (e) { toast.error(e.code === "phone_required" ? "Instructors need a phone first." : (e.code || e.message)); }
    finally { setBusy(""); }
  };
  const decline = async (a) => {
    const reason = await dialog.prompt({ title: "Decline " + a.name + "?", body: "Optional reason — included in the courteous email we send.", placeholder: "e.g. Intake full this season", cta: "Decline" });
    if (reason === null) return;
    setBusy("d" + a.id);
    try { await NGGApi.admin.volunteers.decline(a.id, reason); toast.success("Declined."); load(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };
  const setSafeguard = async (v, status) => {
    setBusy("s" + v.volunteerId);
    try { await NGGApi.admin.volunteers.safeguard(v.volunteerId, status); toast.success(status === "cleared" ? "Marked screened." : "Set to pending."); load(); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };

  const roleChip = (r) => <span className={"chip " + (r === "instructor" ? "chip-gold" : r === "mentor" ? "chip-lime" : "chip-navy")}>{r}</span>;
  const pending = (data && data.pending) || [];
  const roster = ((data && data.volunteers) || []).filter(v => {
    if (!q.trim()) return true;
    const s = (v.fullName + " " + v.volunteerId + " " + v.email + " " + v.role).toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Volunteers {data ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {pending.length} pending · {(data.volunteers || []).length} active</span> : null}</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" disabled={!data || !(data.volunteers || []).length} onClick={() => downloadCsv("volunteers", (data.volunteers || []).map(v => ({ volunteerId: v.volunteerId, name: v.fullName, email: v.email, phone: v.phone || "", role: v.role, courses: (v.courses || []).join("; "), safeguarding: v.safeguarding, status: v.status, createdAt: v.createdAt })))}>Export CSV</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={"admin-tab" + (tab === "pending" ? " is-active" : "")} onClick={() => setTab("pending")}>Review queue{pending.length ? " · " + pending.length : ""}</button>
        <button className={"admin-tab" + (tab === "roster" ? " is-active" : "")} onClick={() => setTab("roster")}>Roster · {(data && (data.volunteers || []).length) || 0}</button>
      </div>

      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        data === null ? <div className="dash-spinner"/> :

        tab === "pending" ? (
          pending.length === 0 ? <div className="admin-empty">No volunteers waiting for review. 🎉</div> :
          <div className="admin-app-list">
            {pending.map(a => (
              <div className="admin-app" key={a.id}>
                <div className="admin-app-top">
                  <div>
                    <div className="admin-cell-name">{a.name} {roleChip(a.role)}</div>
                    <div className="mono admin-cell-sub">{a.email}{a.phone ? " · " + a.phone : " · no phone"}{(a.courses || []).length ? " · " + a.courses.join(", ") : ""} · {fmtDate(a.createdAt)}</div>
                  </div>
                  {a.role === "instructor" && !a.phone && <span className="chip status-archived">phone required</span>}
                </div>
                {a.why && <p className="admin-app-why">{a.why}</p>}
                <div className="admin-app-actions">
                  <button className="btn btn-primary btn-sm" disabled={busy === "a" + a.id || (a.role === "instructor" && !a.phone)} onClick={() => approve(a)}>{busy === "a" + a.id ? "Approving…" : "Approve & issue ID →"}</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === "d" + a.id} onClick={() => decline(a)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="admin-filters">
              <input className="admin-input" placeholder="Search name, ID, email, role…" value={q} onChange={e => setQ(e.target.value)}/>
            </div>
            {roster.length === 0 ? <div className="admin-empty">No volunteers yet.</div> :
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Volunteer</th><th>Role</th><th>Courses</th><th>Safeguarding</th><th>ID</th><th></th></tr></thead>
                <tbody>
                  {roster.map(v => (
                    <tr key={v.volunteerId}>
                      <td><div className="admin-cell-name">{v.fullName}</div><div className="mono admin-cell-sub">{v.volunteerId} · {v.email}</div></td>
                      <td>{roleChip(v.role)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{(v.courses || []).join(", ") || "—"}</td>
                      <td>
                        {v.safeguarding === "cleared"
                          ? <span className="chip chip-lime">✓ screened</span>
                          : <span className="chip status-archived">pending</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}><a href={"/q/" + v.token} target="_blank" rel="noreferrer">/q/{(v.token || "").slice(0, 10)}…</a></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {v.safeguarding === "cleared"
                          ? <button className="btn btn-ghost btn-sm" disabled={busy === "s" + v.volunteerId} onClick={() => setSafeguard(v, "pending")}>Un-clear</button>
                          : <button className="btn btn-primary btn-sm" disabled={busy === "s" + v.volunteerId} onClick={() => setSafeguard(v, "cleared")}>{busy === "s" + v.volunteerId ? "…" : "Mark screened"}</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </>
        )
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
  const load = () => { setErr(""); NGGApi.admin.newsletter().then(setD).catch(e => setErr(e.code || e.message)); };
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Newsletter {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {d.total}</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!d || !d.subscribers.length} onClick={() => downloadCsv("newsletter", d.subscribers)}>Export CSV</button>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
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
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
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
  const [mailTo, setMailTo] = React.useState("");
  const [mailBusy, setMailBusy] = React.useState(false);
  const [mailRes, setMailRes] = React.useState(null);
  const testMail = async () => {
    setMailBusy(true);
    try {
      const r = await NGGApi.admin.settings.testMail(mailTo.trim());
      setMailRes(r);
      if (r.delivered) toast.success("Sent to " + r.to + " via " + r.mode + ". Check the inbox (and spam).", "Email OK");
      else toast.error((r.mode === "php_mail" ? "PHP mail() failed. " : "SMTP failed. ") + (r.error || "No detail.") , "Delivery failed");
    } catch (e) { toast.error(e.code || e.message); }
    finally { setMailBusy(false); }
  };
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
        <FieldCheckbox label="Volunteer registration open" value={s.volunteer_applications_open} onChange={v => setS(o => ({ ...o, volunteer_applications_open: v }))}/>
        <FieldCheckbox label="Text volunteer IDs by SMS (when phone on file)" value={s.volunteer_sms_notify} onChange={v => setS(o => ({ ...o, volunteer_sms_notify: v }))}/>
        <FieldCheckbox label="Email a state note on check-in (award-focus when doing well, a nudge otherwise)" value={s.checkin_state_emails} onChange={v => setS(o => ({ ...o, checkin_state_emails: v }))}/>
        <Field label="Hours credited per volunteer session" type="number" value={s.volunteer_session_hours} onChange={v => setS(o => ({ ...o, volunteer_session_hours: v }))}/>
        <FieldSelect label="Featured session (homepage countdown)" value={s.featured_session_id || ""} onChange={v => setS(o => ({ ...o, featured_session_id: v }))} options={[""].concat(sessions.map(x => x.sessionId))}/>
        <FieldCheckbox label="Geo-fenced registration (auto-pick the centre by location; block off-site sign-ups)" value={s.geofence_enabled} onChange={v => setS(o => ({ ...o, geofence_enabled: v }))}/>
        {s.geofence_enabled && <p className="admin-hint" style={{ margin: "-4px 0 0" }}>Walk-ups must be on-site at a mapped centre to register. Map each centre's point under <b>Registration → Centres → Map</b>.</p>}
        <FieldCheckbox label="Hold the ID until the photo is approved (issue only after an editor approves the headshot)" value={s.photo_gate_issuance} onChange={v => setS(o => ({ ...o, photo_gate_issuance: v }))}/>
        {s.photo_gate_issuance && <p className="admin-hint" style={{ margin: "-4px 0 0" }}>The QR/ID is bound only once both parent consent is in AND the photo is approved in <b>Photo review</b>. Registrations without a photo are never held.</p>}

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Email delivery</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Send a real test email and see exactly what happened. If it fails on <span className="mono">php_mail</span>, set <span className="mono">mail.smtp.*</span> in <span className="mono">api/config.php</span> — shared hosts usually drop plain mail().</p>
        <div className="admin-fields-row" style={{ alignItems: "end" }}>
          <Field label="Send test to (blank = your email)" value={mailTo} onChange={setMailTo} type="email"/>
          <button className="btn btn-ghost btn-sm" disabled={mailBusy} onClick={testMail} style={{ height: 40 }}>{mailBusy ? "Sending…" : "Send test email"}</button>
        </div>
        {mailRes && (
          <div className="admin-hint" style={{ margin: "2px 0 0", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line-200, #e6e8ee)", background: "var(--surface-50, #f8fafc)", fontSize: 12.5, lineHeight: 1.6 }}>
            <div><b>{mailRes.delivered ? "✓ Delivered" : "✗ Not delivered"}</b> · mode <span className="mono">{mailRes.mode}</span> · to <span className="mono">{mailRes.to}</span></div>
            <div>From <span className="mono">{mailRes.from}</span>{mailRes.replyTo ? <> · reply-to <span className="mono">{mailRes.replyTo}</span></> : null}</div>
            {mailRes.smtp && <div>SMTP <span className="mono">{mailRes.smtp.host}:{mailRes.smtp.port}</span> ({mailRes.smtp.secure || "plain"}){mailRes.smtp.authUser ? <> · auth <span className="mono">{mailRes.smtp.authUser}</span></> : null}</div>}
            {mailRes.error ? <div style={{ color: "var(--danger-600, #b91c1c)" }}>Error: {mailRes.error}</div> : null}
            {(mailRes.hints || []).map((h, i) => <div key={i} style={{ color: "var(--amber-800, #9a3412)" }}>⚠ {h}</div>)}
          </div>
        )}

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>ID card branding</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Drives the printed cards + digital IDs. The card QR always encodes the student's <span className="mono">/q/&lt;token&gt;</span> profile URL, so scanning with any phone opens their page.</p>
        {(() => {
          const id = s.idcard || {};
          const setId = (k, v) => setS(o => ({ ...o, idcard: { ...(o.idcard || {}), [k]: v } }));
          return (
            <React.Fragment>
              <div className="admin-fields-row">
                <Field label="Programme name" value={id.program || ""} onChange={v => setId("program", v)}/>
                <Field label="Year" value={id.year || ""} onChange={v => setId("year", v)}/>
              </div>
              <Field label="Motto" value={id.motto || ""} onChange={v => setId("motto", v)}/>
              <div className="admin-fields-row">
                <Field label="Website (printed on card)" value={id.website || ""} onChange={v => setId("website", v)}/>
                <Field label="Phone (printed on card)" value={id.phone || ""} onChange={v => setId("phone", v)}/>
              </div>
              <Field label="Lockup logo URL" value={id.logoLockup || ""} onChange={v => setId("logoLockup", v)}/>
              <Field label="Okun/partner logo URL (card back)" value={id.logoOkun || ""} onChange={v => setId("logoOkun", v)}/>
            </React.Fragment>
          );
        })()}
      </div>
    </div>
  );
}

// ============================================================================
// Registration — first-class page: gate links, pending queue, centres
// ============================================================================
function AdminRegistration() {
  const [tab, setTab] = React.useState("gates");
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Registration</h2></div>
      <p className="admin-hint">Run the gated public sign-up: hand out desk links, review parent-pending sign-ups, and manage the centres that drive ID prefixes and card colours. The form itself lives under <b>Forms</b>.</p>
      <div className="admin-anchor-tabs">
        {[["gates", "Gate links"], ["pending", "Pending sign-ups"], ["centres", "Centres"]].map(([id, l]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === "gates" && <SummerGates/>}
      {tab === "pending" && <SummerPending/>}
      {tab === "centres" && <SummerCentres/>}
    </div>
  );
}

function AdminQRCodes() {
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">QR codes</h2></div>
      <SummerQR/>
    </div>
  );
}

/* Centres manager — name + code + card colour (drives the ID prefix) and an
 * optional geo-fence (mapped to the centre, used to auto-pick it + stop off-site
 * sign-ups when the global fence toggle is on). */
function SummerCentres() {
  const [centres, setCentres] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [d, setD] = React.useState({ name: "", code: "", color: "#76B043" });
  const [busy, setBusy] = React.useState(false);
  const [mapId, setMapId] = React.useState("");
  const load = () => NGGApi.admin.registration.centres().then(r => { setCentres(r.centres || []); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const add = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    try { await NGGApi.admin.registration.centreUpsert(d); setD({ name: "", code: "", color: "#76B043" }); toast.success("Centre saved."); load(); }
    catch (e2) { toast.error(e2.code === "code_taken" ? "That code is already used." : "Check the name (2+) and code (1–4 letters)."); }
    finally { setBusy(false); }
  };
  const remove = async (c) => { if (!(await dialog.confirm({ title: "Remove " + c.name + "?", body: "Existing students keep their IDs; the centre just stops being offered.", cta: "Remove" }))) return; try { await NGGApi.admin.registration.centreDelete(c.centreId); load(); } catch (e) { toast.error(e.code || e.message); } };
  const geoLabel = (c) => c.lat == null ? <span className="chip status-archived">— unmapped</span> : c.geofence ? <span className="chip chip-lime">🟢 fence on · {c.radiusM || 150}m</span> : <span className="chip">mapped · off</span>;
  if (err) return <ErrorState title="Couldn't load centres" code={err} onRetry={load}/>;
  return (
    <div>
      <p className="admin-hint">Each centre has a 1–4 letter code (the printed ID prefix, e.g. <span className="mono">IJ-26-001</span>) and a colour that drives its ID card accent. <b>Map</b> a centre to draw its geo-fence — with the global fence on (Settings), walk-ups are auto-assigned to the centre they're physically at.</p>
      <form onSubmit={add} className="admin-filters" style={{ alignItems: "center" }}>
        <input className="admin-input" placeholder="Centre name" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} style={{ minWidth: 200 }}/>
        <input className="admin-input" placeholder="CODE" value={d.code} maxLength={4} onChange={e => setD({ ...d, code: e.target.value.toUpperCase() })} style={{ maxWidth: 100 }}/>
        <input type="color" value={d.color} onChange={e => setD({ ...d, color: e.target.value })} style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)", cursor: "pointer" }}/>
        <button className="btn btn-primary btn-sm" disabled={busy || d.name.length < 2 || !d.code}>{busy ? "…" : "+ Add centre"}</button>
      </form>
      {centres === null ? <div className="dash-spinner"/> :
        centres.length === 0 ? <div className="admin-empty">No centres yet — add your first above.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Centre</th><th>Code</th><th>Colour</th><th>Geo-fence</th><th></th></tr></thead>
          <tbody>{centres.map(c => (
            <React.Fragment key={c.centreId}>
            <tr>
              <td><b>{c.name}</b></td>
              <td className="mono">{c.code}</td>
              <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: c.color, border: "1px solid rgba(0,0,0,0.1)" }}/><span className="mono" style={{ fontSize: 12 }}>{c.color}</span></span></td>
              <td>{geoLabel(c)}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setMapId(mapId === c.centreId ? "" : c.centreId)}>{mapId === c.centreId ? "Close" : "Map"}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} style={{ color: "#b03535" }}>Remove</button>
              </td>
            </tr>
            {mapId === c.centreId && <tr><td colSpan={5} style={{ background: "rgba(12,20,50,0.03)" }}><CentreGeoEditor c={c} onSaved={() => { setMapId(""); load(); }}/></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

/* Per-centre geo-fence editor: capture the point on-site (device GPS) or enter
 * coordinates from a dependable source, set the radius, and toggle the fence. */
function CentreGeoEditor({ c, onSaved }) {
  const [lat, setLat] = React.useState(c.lat != null ? String(c.lat) : "");
  const [lng, setLng] = React.useState(c.lng != null ? String(c.lng) : "");
  const [radiusM, setRadiusM] = React.useState(c.radiusM || 150);
  const [fence, setFence] = React.useState(!!c.geofence);
  const [src, setSrc] = React.useState(c.mapSource || "");
  const [acc, setAcc] = React.useState(c.mapAccuracyM != null ? c.mapAccuracyM : null);
  const [capBusy, setCapBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const capture = () => {
    if (!navigator.geolocation) { toast.error("This device can't capture GPS."); return; }
    setCapBusy(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setAcc(Math.round(p.coords.accuracy)); setSrc("onsite"); setCapBusy(false); toast.success("Captured this spot (±" + Math.round(p.coords.accuracy) + "m). Review and save."); },
      e => { setCapBusy(false); toast.error(e && e.code === 1 ? "Location permission was blocked." : "Couldn't get a GPS fix — try again outdoors."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };
  const save = async () => {
    const la = parseFloat(lat), ln = parseFloat(lng);
    if (fence && (isNaN(la) || isNaN(ln))) { toast.error("Map a point (capture on-site or enter coordinates) before turning the fence on."); return; }
    setBusy(true);
    try {
      const data = { centreId: c.centreId, name: c.name, code: c.code, color: c.color, geofence: fence, radiusM: Number(radiusM) || 150 };
      if (!isNaN(la) && !isNaN(ln)) { data.lat = la; data.lng = ln; data.mapSource = src || "coordinates"; if (acc != null) data.mapAccuracyM = acc; }
      await NGGApi.admin.registration.centreUpsert(data);
      toast.success("Geo-fence saved."); onSaved();
    } catch (e) { toast.error(e.code === "bad_latlng" ? "Those coordinates aren't valid." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  return (
    <div style={{ padding: "14px 4px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        <div><span style={lbl}>Latitude</span><input className="admin-input" value={lat} onChange={e => { setLat(e.target.value); setSrc("coordinates"); }} placeholder="6.601234" style={{ width: 140 }}/></div>
        <div><span style={lbl}>Longitude</span><input className="admin-input" value={lng} onChange={e => { setLng(e.target.value); setSrc("coordinates"); }} placeholder="3.301234" style={{ width: 140 }}/></div>
        <div><span style={lbl}>Radius (m)</span><input className="admin-input" type="number" min={25} max={5000} value={radiusM} onChange={e => setRadiusM(e.target.value)} style={{ width: 100 }}/></div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={capBusy} onClick={capture}>{capBusy ? "Locating…" : "📍 Capture on-site"}</button>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 600 }}>
        <input type="checkbox" checked={fence} onChange={e => setFence(e.target.checked)}/>
        Fence on — auto-assign walk-ups here and block off-site sign-ups
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save geo-fence"}</button>
        <span className="admin-cell-sub" style={{ fontSize: 12 }}>
          {src === "onsite" ? "Source: on-site GPS" + (acc != null ? " (±" + acc + "m)" : "") : (lat && lng) ? "Source: entered coordinates" : "Not mapped yet"}
          {c.mappedAt ? " · last mapped " + fmtDate(c.mappedAt) : ""}
        </span>
      </div>
      <p className="admin-hint" style={{ margin: 0 }}>Stand at the centre entrance and tap <b>Capture on-site</b> for the most accurate point, or paste coordinates from Google Maps (right-click → the lat,lng at the top). The global fence toggle lives in Settings.</p>
    </div>
  );
}

// ============================================================================
// Photo review — the editor's console. Free-AI triage flags problems; Cloudinary
// does identity-safe edits; a human approves, requests a retake, or rejects.
// ============================================================================
function AdminPhotos() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busyId, setBusyId] = React.useState("");
  const load = () => NGGApi.admin.photos.queue().then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);

  const claim = async (a) => { setBusyId(a.assetId); try { await NGGApi.admin.photos.claim(a.assetId); toast.success("Claimed — you're reviewing this one."); load(); } catch (e) { toast.error(e.code === "already_claimed" ? "Another editor already claimed it." : (e.code || e.message)); } finally { setBusyId(""); } };
  const approve = async (a) => {
    const edited = await dialog.prompt({ title: "Approve this photo", body: "Approves the edited image for the ID card. Paste a corrected Cloudinary URL to override it, or leave it as-is.", cta: "Approve", required: false, defaultValue: a.editedUrl || "", placeholder: "https://res.cloudinary.com/…" });
    if (edited === null) return;
    setBusyId(a.assetId);
    try { await NGGApi.admin.photos.approve(a.assetId, (edited || "").trim() || a.editedUrl, ""); toast.success("Photo approved."); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusyId(""); }
  };
  const retake = async (a) => {
    const reason = await dialog.prompt({ title: "Request a retake", body: "Tell the desk what to fix (lighting, framing, background). The registration keeps its place in the queue.", cta: "Request retake", placeholder: "e.g. Please retake against a plain wall." });
    if (!reason) return;
    setBusyId(a.assetId);
    try { await NGGApi.admin.photos.retake(a.assetId, reason.trim()); toast.success("Retake requested."); load(); }
    catch (e) { toast.error(e.code === "reason_required" ? "Add a short reason." : (e.code || e.message)); } finally { setBusyId(""); }
  };
  const reject = async (a) => {
    const reason = await dialog.prompt({ title: "Reject this photo", body: "Rejects the image entirely — for inappropriate or unusable uploads. Needs elevated (People) access.", cta: "Reject", danger: true, placeholder: "Reason" });
    if (!reason) return;
    setBusyId(a.assetId);
    try { await NGGApi.admin.photos.reject(a.assetId, reason.trim()); toast.success("Photo rejected."); load(); }
    catch (e) { toast.error(e.code === "forbidden" ? "Rejecting needs the People permission." : (e.code || e.message)); } finally { setBusyId(""); }
  };

  const shot = (url, label, tone) => (
    <div style={{ flex: "1 1 160px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 5 }}>{label}</div>
      <div style={{ aspectRatio: "4/5", borderRadius: 10, overflow: "hidden", background: "rgba(12,20,50,0.05)", border: "1px solid " + (tone || "rgba(12,20,50,0.12)"), display: "grid", placeItems: "center" }}>
        {url ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ color: "var(--ink-400)", fontSize: 12 }}>—</span>}
      </div>
    </div>
  );

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Photo review {data && data.pending ? <span className="chip chip-lime">{data.pending} waiting</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="admin-hint">The free AI only <b>flags</b> problems; Cloudinary <b>enhances</b> — it never alters the person. Approve the edit, request a retake, or (for unusable/inappropriate uploads) reject. You can paste a corrected image URL when approving.</p>
      {err ? <ErrorState title="Couldn't load the queue" code={err} onRetry={load}/> :
        data === null ? <div className="dash-spinner"/> :
        (data.queue || []).length === 0 ? <div className="admin-empty">Nothing waiting — clean photos auto-approve and only flagged ones land here. 🎉</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.queue.map(a => {
            const f = a.aiFindings || {};
            const flags = f.flags || [];
            const issues = f.issues || [];
            const claimed = a.status === "in_review";
            const busy = busyId === a.assetId;
            return (
              <div key={a.assetId} className="admin-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <div><b className="mono">{a.subjectType}:{a.subjectId}</b> <span className="admin-cell-sub">· v{a.version} · {a.assetId}</span></div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {a.aiScore != null && <span className="chip" style={{ background: a.aiScore >= 70 ? "rgba(118,176,67,.16)" : a.aiScore >= 45 ? "rgba(255,206,84,.18)" : "rgba(255,120,120,.16)" }}>AI score {a.aiScore}</span>}
                    <span className={"chip " + (claimed ? "chip-lime" : "status-archived")}>{claimed ? "in review" : "waiting"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  {shot(a.sourceUrl, "AS CAPTURED", null)}
                  {shot(a.editedUrl, "ENHANCED (IDENTITY-SAFE)", "rgba(118,176,67,.4)")}
                  <div style={{ flex: "2 1 220px", minWidth: 200 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 6 }}>AI FINDINGS</div>
                    {flags.length === 0 && issues.length === 0 ? <p className="admin-cell-sub" style={{ margin: 0 }}>No specific issues flagged.</p> : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        {flags.map((fl, i) => <span key={i} className="chip" style={{ background: "rgba(255,120,120,.14)" }}>{String(fl).replace(/_/g, " ")}</span>)}
                      </div>
                    )}
                    {issues.length > 0 && <ul style={{ margin: "0 0 0 16px", padding: 0, color: "var(--ink-600)", fontSize: 13, lineHeight: 1.5 }}>{issues.map((it, i) => <li key={i}>{it}</li>)}</ul>}
                    {flags.indexOf("ai_unavailable") >= 0 && <p className="admin-cell-sub" style={{ margin: "6px 0 0" }}>Analysis was unavailable — please eyeball this one carefully.</p>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {!claimed && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => claim(a)}>Claim to review</button>}
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => approve(a)}>Approve</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => retake(a)}>Request retake</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => reject(a)} style={{ color: "#b03535" }}>Reject</button>
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}

// ============================================================================
// Forms — one visual builder, every public form (registration/volunteer/contact)
// ============================================================================
function AdminForms() {
  const [forms, setForms] = React.useState(null);
  const [active, setActive] = React.useState("summer-reg");
  const [err, setErr] = React.useState("");
  React.useEffect(() => { NGGApi.admin.registration.formsList().then(r => setForms(r.forms || [])).catch(e => setErr(e.code || e.message)); }, []);
  if (err) return <div className="admin-section"><ErrorState title="Couldn't load forms" code={err} onRetry={() => location.reload()}/></div>;
  if (!forms) return <div className="admin-section"><div className="dash-spinner"/></div>;
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Forms</h2></div>
      <p className="admin-hint">Every public form, edited with the same visual builder. Locked system fields stay put; add, reorder and configure the rest, then publish a new live version.</p>
      <div className="admin-anchor-tabs">
        {forms.map(f => (
          <button key={f.formId} className={"admin-anchor-tab" + (active === f.formId ? " is-active" : "")} onClick={() => setActive(f.formId)}>
            {f.name} <span className="mono" style={{ opacity: 0.6, fontSize: 11 }}>· v{f.version} · {f.fieldCount}f</span>
          </button>
        ))}
      </div>
      <SummerFormBuilder formId={active} key={active}/>
    </div>
  );
}

// ============================================================================
// Site content — homepage hero + taglines (website management)
// ============================================================================
function AdminSite() {
  const [c, setC] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const load = () => NGGApi.admin.settings.get().then(r => setC({ ...(r.settings.site_content || {}) })).catch(e => toast.error(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const set = (k) => (v) => setC(o => ({ ...o, [k]: v }));
  const save = async () => { setBusy(true); try { await NGGApi.admin.settings.set({ site_content: c }); setSaved(true); setTimeout(() => setSaved(false), 2200); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); } };
  if (!c) return <div className="admin-section"><div className="dash-spinner"/></div>;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Site content</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="mono" style={{ color: saved ? "var(--lime-ink)" : "var(--ink-500)" }}>{saved ? "SAVED ✓ · live" : busy ? "SAVING…" : ""}</span><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Publish</button></div>
      </div>
      <p className="admin-hint">Edit the public homepage copy. Changes go live immediately — leave a field blank to restore its default.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }} className="site-editor">
        <div className="admin-fields">
          <div className="mono admin-cell-sub" style={{ marginBottom: 4 }}>HERO</div>
          <Field label="'Live now' word" value={c.heroEyebrowLive || ""} onChange={set("heroEyebrowLive")} placeholder="Live now"/>
          <Field label="Headline line 1" value={c.heroTitle1 || ""} onChange={set("heroTitle1")} placeholder="Africa's next geniuses"/>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Line 2 lead" value={c.heroTitle2 || ""} onChange={set("heroTitle2")} placeholder="are"/>
            <Field label="Line 2 emphasis (gold)" value={c.heroEmphasis || ""} onChange={set("heroEmphasis")} placeholder="not waiting"/>
          </div>
          <FieldTextarea label="Sub-headline" rows={3} value={c.heroSubhead || ""} onChange={set("heroSubhead")}/>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Primary button" value={c.heroCtaPrimary || ""} onChange={set("heroCtaPrimary")} placeholder="Join the Summer Program"/>
            <Field label="Secondary button" value={c.heroCtaSecondary || ""} onChange={set("heroCtaSecondary")} placeholder="Explore Anchor 12"/>
          </div>
          <div className="mono admin-cell-sub" style={{ margin: "10px 0 4px" }}>MOVEMENT</div>
          <FieldTextarea label="Footer tagline" rows={3} value={c.movementTagline || ""} onChange={set("movementTagline")}/>
        </div>

        {/* Live preview of the hero copy */}
        <div style={{ position: "sticky", top: 90 }}>
          <div className="mono admin-cell-sub" style={{ marginBottom: 8 }}>PREVIEW</div>
          <div style={{ background: "var(--navy-900)", borderRadius: 16, padding: "28px 24px", color: "#fff", overflow: "hidden" }}>
            <span className="chip chip-on-dark" style={{ fontSize: 10 }}><span className="dot dot-coral"/> {(c.heroEyebrowLive || "Live now").toUpperCase()} · SUMMER 2026</span>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, lineHeight: 0.98, margin: "12px 0 10px" }}>
              {c.heroTitle1 || "Africa's next geniuses"}<br/>{c.heroTitle2 || "are"} <span style={{ color: "var(--gold-500)" }}>{c.heroEmphasis || "not waiting"}</span>.
            </div>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 16px" }}>{c.heroSubhead || "A twelve-week growth journey…"}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="btn btn-gold btn-sm">{c.heroCtaPrimary || "Join the Summer Program"} →</span>
              <span className="btn btn-on-dark-ghost btn-sm">{c.heroCtaSecondary || "Explore Anchor 12"}</span>
            </div>
          </div>
        </div>
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
  // options may be plain strings OR { value, label } objects so machine enums
  // (e.g. "graduated-vanguard") can render as human labels ("Graduated · Vanguard").
  return (
    <label className="admin-field">
      <span>{label}</span>
      <select className="admin-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(o => {
          const val = (o && typeof o === "object") ? o.value : o;
          const lab = (o && typeof o === "object") ? o.label : o;
          return <option key={val} value={val}>{lab}</option>;
        })}
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

// ── Check-in kiosk (Phase 2): camera + handheld/USB scanner + offline queue ──
const KIOSK_Q = "ngg_summer_kiosk_q";
const kioskQueue = () => { try { return JSON.parse(localStorage.getItem(KIOSK_Q)) || []; } catch (_) { return []; } };
const kioskSetQueue = (q) => { try { localStorage.setItem(KIOSK_Q, JSON.stringify(q)); } catch (_) {} };

function SummerKiosk({ onCheckin }) {
  const [mode, setMode] = React.useState("scanner"); // scanner | camera
  const [result, setResult] = React.useState(null);
  const [recent, setRecent] = React.useState([]);
  const [pending, setPending] = React.useState(kioskQueue().length);
  const [camErr, setCamErr] = React.useState("");
  const [manual, setManual] = React.useState("");
  const [online, setOnline] = React.useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const last = React.useRef({ token: "", at: 0 });
  const videoRef = React.useRef(null), canvasRef = React.useRef(null), inputRef = React.useRef(null);
  const device = ((typeof navigator !== "undefined" && navigator.platform) || "kiosk").slice(0, 40);

  const buzz = (bad) => { try { navigator.vibrate && navigator.vibrate(bad ? 80 : [25, 35, 25]); } catch (_) {} };

  const doCheckin = React.useCallback(async (raw, method) => {
    const token = extractToken(raw);
    if (!token || token.length < 4) return;
    const now = Date.now();
    if (last.current.token === token && now - last.current.at < 3500) return; // debounce repeat scans
    last.current = { token, at: now };
    try {
      const r = await NGGApi.admin.summer.checkin(token, method, device);
      setResult({ student: r.student, already: r.already }); buzz(false);
      setRecent(x => [{ name: r.student.fullName, at: now, already: r.already }, ...x].slice(0, 8));
      onCheckin && onCheckin();
    } catch (e) {
      const code = e.code || e.message || "";
      if (!navigator.onLine || /network|fetch|offline|http_0/i.test(code)) {
        const q = kioskQueue(); q.push({ token, method, at: now }); kioskSetQueue(q); setPending(q.length);
        setResult({ queued: true, token }); buzz(false);
      } else {
        const map = { qr_unassigned: "That card isn't linked to a student yet.", student_not_found: "Student not found.", forbidden: "Your session expired — sign in again." };
        setResult({ error: map[code] || code }); buzz(true);
      }
    }
  }, [device, onCheckin]);

  // Flush the offline queue when back online / periodically.
  const flush = React.useCallback(async () => {
    let q = kioskQueue(); if (!q.length || !navigator.onLine) return;
    for (const it of [...q]) {
      try { await NGGApi.admin.summer.checkin(it.token, it.method, device); q = q.filter(x => x !== it); kioskSetQueue(q); }
      catch (e) { if (!navigator.onLine) break; q = q.filter(x => x !== it); kioskSetQueue(q); }
    }
    setPending(kioskQueue().length); onCheckin && onCheckin();
  }, [device, onCheckin]);
  React.useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const id = setInterval(() => { if (navigator.onLine && kioskQueue().length) flush(); }, 15000);
    flush();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(id); };
  }, [flush]);

  React.useEffect(() => { if (mode === "scanner" && inputRef.current) inputRef.current.focus(); }, [mode]);

  // Camera scanning via jsQR on video frames.
  React.useEffect(() => {
    if (mode !== "camera") return;
    let stream = null, raf = 0, stop = false;
    setCamErr("");
    (async () => {
      try {
        await ensureQRDecoder();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = videoRef.current; if (!v) return;
        v.setAttribute("playsinline", "true"); v.srcObject = stream; await v.play();
        const cvs = canvasRef.current, ctx = cvs.getContext("2d", { willReadFrequently: true });
        const tick = () => {
          if (stop) return;
          if (v.readyState >= 2 && v.videoWidth) {
            cvs.width = v.videoWidth; cvs.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, cvs.width, cvs.height);
            try { const img = ctx.getImageData(0, 0, cvs.width, cvs.height); const code = window.jsQR(img.data, cvs.width, cvs.height, { inversionAttempts: "dontInvert" }); if (code && code.data) doCheckin(code.data, "qr"); } catch (_) {}
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { setCamErr((e && e.name === "NotAllowedError") ? "Camera permission denied — use a handheld scanner or type the token." : "No camera available — use a handheld scanner or type the token."); }
    })();
    return () => { stop = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [mode, doCheckin]);

  const submitManual = (e) => { e.preventDefault(); if (manual.trim()) { doCheckin(manual, mode === "camera" ? "manual" : "scan"); setManual(""); } };

  return (
    <div className="summer-kiosk">
      <div className="admin-filters" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="summer-kiosk-modes">
          <button className={"btn btn-sm " + (mode === "scanner" ? "btn-primary" : "btn-ghost")} onClick={() => setMode("scanner")}>⌨ Scanner / manual</button>
          <button className={"btn btn-sm " + (mode === "camera" ? "btn-primary" : "btn-ghost")} onClick={() => setMode("camera")}>📷 Camera</button>
        </div>
        <div className="summer-kiosk-status">
          <span className={"summer-dot " + (online ? "on" : "off")}/>{online ? "Online" : "Offline"}
          {pending > 0 && <span className="summer-kiosk-pending">⏳ {pending} queued</span>}
        </div>
      </div>

      <div className="summer-kiosk-grid">
        <div className="summer-kiosk-scan">
          {mode === "camera" ? (
            <div className="summer-cam">
              <video ref={videoRef} muted playsInline/>
              <canvas ref={canvasRef} style={{ display: "none" }}/>
              <div className="summer-cam-reticle" aria-hidden="true"/>
              {camErr && <div className="summer-cam-err">{camErr}</div>}
            </div>
          ) : (
            <form onSubmit={submitManual} className="summer-scan-form">
              <div className="summer-scan-hint">Scan a card with a handheld/USB reader, or type the token and press Enter.</div>
              <input ref={inputRef} className="admin-input summer-scan-input" placeholder="SUMQR-XXXXXXXX" value={manual}
                onChange={e => setManual(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false}/>
              <button className="btn btn-primary" type="submit" disabled={!manual.trim()}>Check in →</button>
            </form>
          )}
        </div>

        <div className="summer-kiosk-result">
          {!result && <div className="summer-result idle"><i className="ph" aria-hidden="true">◎</i><div>Ready — scan a card.</div></div>}
          {result && result.student && (
            <div className={"summer-result " + (result.already ? "dupe" : "ok")}>
              <div className="summer-result-av">{result.student.photoUrl ? <img src={result.student.photoUrl} alt=""/> : (result.student.fullName || "?").charAt(0)}</div>
              <div className="summer-result-nm">{result.student.fullName}</div>
              <div className="summer-result-msg">{result.already ? "Already checked in today" : "Checked in ✓"}</div>
              <div className="mono summer-result-id">{result.student.studentId}{result.student.track ? " · " + result.student.track : ""}</div>
            </div>
          )}
          {result && result.queued && <div className="summer-result queued"><div className="summer-result-nm">Saved offline</div><div className="summer-result-msg">{result.token} — syncs when back online</div></div>}
          {result && result.error && <div className="summer-result err"><div className="summer-result-nm">Couldn't check in</div><div className="summer-result-msg">{result.error}</div></div>}
        </div>
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>THIS SESSION</div>
          <div className="summer-kiosk-recent">
            {recent.map((r, i) => <div key={i} className="summer-recent-row"><span>{r.name}</span><span className={"mono " + (r.already ? "summer-dupe" : "summer-fresh")}>{r.already ? "already" : "checked in"}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attendance analytics dashboard (Phase 2) ────────────────────────────────
function SummerAttendance() {
  const [a, setA] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [ins, setIns] = React.useState(null);
  const [insBusy, setInsBusy] = React.useState(false);
  const load = () => NGGApi.admin.summer.attendance().then(r => setA(r.attendance)).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const loadInsights = () => { setInsBusy(true); NGGApi.admin.summer.insights().then(setIns).catch(e => setIns({ insight: "Couldn't generate insights: " + (e.code || e.message), source: "error" })).finally(() => setInsBusy(false)); };
  React.useEffect(() => { loadInsights(); }, []);
  const archive = async (compress) => {
    const ok = await dialog.confirm({ title: compress ? "Archive & compress this cohort?" : "Archive this cohort?", body: compress ? "Rolls each student's attendance up onto their record, marks the cohort archived, then deletes the individual check-ins to save space. Summaries stay available for NGG Club promotion. This can't be undone." : "Marks the cohort archived and rolls up each student's attendance. Individual check-ins are kept.", cta: compress ? "Archive & compress" : "Archive" });
    if (!ok) return;
    try { const r = await NGGApi.admin.summer.archive("", compress); toast.success("Archived " + r.students + " students" + (r.compressed ? " · " + r.purged + " check-ins compressed" : "")); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  if (err) return <ErrorState title="Couldn't load" code={err} onRetry={load}/>;
  if (!a) return <div className="dash-spinner"/>;
  const maxDay = Math.max(1, ...a.days.map(d => d.present));
  return (
    <div>
      <div className="admin-tiles" style={{ marginBottom: 14 }}>
        <AdminTile n={a.today} l="Present today"/>
        <AdminTile n={a.absentToday} l="Absent today"/>
        <AdminTile n={a.activeStudents} l="Active students"/>
        <AdminTile n={a.sessionDays} l="Session days"/>
      </div>

      <div className="summer-insight">
        <div className="summer-insight-head">
          <span className="eyebrow"><i className="ph-fill ph-sparkle" aria-hidden="true"/> COORDINATOR INSIGHTS</span>
          <span className="summer-insight-src">{ins ? (ins.source === "ai" ? "AI · " + ins.provider : ins.source === "error" ? "error" : "rule-based") : ""}</span>
          <button className="btn btn-ghost btn-sm" onClick={loadInsights} disabled={insBusy}>{insBusy ? "Thinking…" : "Refresh"}</button>
        </div>
        {!ins ? <div className="dash-spinner"/> : <div className="summer-insight-body">{ins.insight}</div>}
        {ins && ins.aiConfigured === false && <div className="summer-insight-hint">Rule-based summary. Add a free Groq or Gemini API key in <span className="mono">config.php → ai</span> for AI-written narratives.</div>}
        {ins && ins.aiError && <div className="summer-insight-hint">AI call failed ({ins.aiError}) — showing the rule-based summary.</div>}
      </div>

      <div className="eyebrow" style={{ margin: "4px 0 10px" }}>LAST 14 DAYS</div>
      <div className="summer-attbar">
        {a.days.map((d, i) => (
          <div key={i} className="summer-attbar-col" title={d.date + " · " + d.present + " present"}>
            <div className="summer-attbar-track"><div className="summer-attbar-fill" style={{ height: (d.present / maxDay * 100) + "%" }}/></div>
            <span className="summer-attbar-lbl">{d.date.slice(8)}</span>
          </div>
        ))}
      </div>

      {a.atRisk.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: "var(--coral)" }}>AT RISK · under 50% attendance</div>
          <div className="summer-atrisk">
            {a.atRisk.slice(0, 12).map(r => <span key={r.studentId} className="summer-atrisk-chip">{r.fullName} <b>{r.rate}%</b></span>)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 10 }}>
        <div className="eyebrow">ATTENDANCE BY STUDENT</div>
        <span style={{ flex: 1 }}/>
        <button className="btn btn-ghost btn-sm" disabled={!a.roster.length} onClick={() => downloadCsv("summer-attendance", a.roster.map(r => ({ studentId: r.studentId, fullName: r.fullName, track: r.track, present: r.present, rate: r.rate + "%", lastSeen: r.lastSeen, presentToday: r.presentToday ? "yes" : "no" })))}>Export CSV</button>
      </div>
      <div className="admin-table-wrap" style={{ marginTop: 8 }}><table className="admin-table">
        <thead><tr><th>Student</th><th>Track</th><th>Present</th><th>Rate</th><th>Last seen</th><th>Today</th></tr></thead>
        <tbody>{a.roster.map(r => (
          <tr key={r.studentId}>
            <td>{r.fullName}<div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.studentId}</div></td>
            <td>{r.track || "—"}</td>
            <td className="mono">{r.present}/{a.sessionDays}</td>
            <td style={{ minWidth: 120 }}><div className="summer-rate"><div className="summer-rate-bar"><div className="summer-rate-fill" style={{ width: r.rate + "%", background: r.rate < 50 ? "var(--coral)" : r.rate < 80 ? "var(--gold-500)" : "var(--lime-ink, #6e9c1d)" }}/></div><span className="mono">{r.rate}%</span></div></td>
            <td className="mono">{r.lastSeen || "—"}</td>
            <td>{r.presentToday ? <span className="chip status-published">✓</span> : <span className="chip status-draft">—</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>

      {a.recent.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>RECENT CHECK-INS</div>
          <div className="summer-kiosk-recent">
            {a.recent.slice(0, 12).map((r, i) => <div key={i} className="summer-recent-row"><span>{r.fullName || r.studentId}</span><span className="mono" style={{ color: "var(--ink-500)" }}>{r.date} · {r.method}</span></div>)}
          </div>
        </div>
      )}

      <div className="summer-archive">
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>END OF SUMMER</div>
          <div className="admin-hint" style={{ margin: 0 }}>Archive the cohort when summer ends. Compressing rolls each student's attendance into a summary (kept for NGG Club promotion) and clears the individual check-ins.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => archive(false)}>Archive</button>
          <button className="btn btn-ghost btn-sm" onClick={() => archive(true)}>Archive &amp; compress</button>
        </div>
      </div>
    </div>
  );
}

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
