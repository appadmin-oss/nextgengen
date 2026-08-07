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
  { id: "dashboard",   group: null,       label: "Analytics",    title: "Summer School Analytics", icon: "◫", cap: null },
  { id: "members",     group: "People",   label: "Members",      title: "Members",             icon: "◯", cap: "people" },
  { id: "applications",group: "People",   label: "Applications", title: "Applications",        icon: "✉", cap: "people" },
  { id: "volunteers",  group: "People",   label: "Volunteers",   title: "Volunteers",          icon: "◈", cap: "people" },
  { id: "mentors",     group: "People",   label: "Mentors",      title: "Mentors",             icon: "☺", cap: "people" },
  { id: "mentorship",  group: "People",   label: "Mentorship",   title: "Mentorship",          icon: "◐", cap: "people" },
  { id: "behaviour",   group: "People",   label: "Behaviour",    title: "Behaviour monitor",   icon: "◔", cap: "people" },
  { id: "fees",        group: "People",   label: "Dues & fees",  title: "Dues & fees",         icon: "₦", cap: "people" },
  { id: "staff",       group: "People",   label: "Staff activity", title: "Staff activity",    icon: "◑", cap: "people" },
  { id: "engagement",  group: "People",   label: "Engagement",   title: "Team engagement",     icon: "📈", cap: "audit" },
  { id: "registration",group: "People",   label: "Registration", title: "Registration",        icon: "❑", cap: "summer" },
  { id: "qr",          group: "People",   label: "QR codes",     title: "QR codes",            icon: "▦", cap: "summer" },
  { id: "attendance",  group: "People",   label: "Attendance duty", title: "Attendance duty",  icon: "🗓", cap: "summer" },
  { id: "assessment",  group: "People",   label: "Assessments",  title: "Baseline & endline",  icon: "◑", cap: "summer" },
  { id: "sessions",    group: "Content",  label: "Sessions",     title: "Sessions",            icon: "▢", cap: "content" },
  { id: "missions",    group: "Content",  label: "Missions",     title: "Anchor missions",     icon: "✦", cap: "content" },
  { id: "anchor",      group: "Content",  label: "Anchor app",   title: "Anchor Journal app",  icon: "⚓", cap: "content" },
  { id: "assignments", group: "Content",  label: "Assignments",  title: "Assignments",         icon: "❏", cap: "content" },
  { id: "events",      group: "Content",  label: "Events",       title: "Events",              icon: "▶", cap: "content" },
  { id: "posts",       group: "Content",  label: "Posts",        title: "Posts",               icon: "✎", cap: "content" },
  { id: "photos",      group: "Content",  label: "Photo review", title: "Photo review",        icon: "◲", cap: "content" },
  { id: "comments",    group: "Content",  label: "Comments",     title: "Comment moderation",  icon: "💬", cap: "content" },
  { id: "community",   group: "Content",  label: "Community",    title: "Community",           icon: "❖", cap: "content" },
  { id: "broadcast",   group: "Content",  label: "Announce",     title: "Announcements",       icon: "📣", cap: "content" },
  { id: "forms",       group: "Content",  label: "Forms",        title: "Forms",               icon: "▤", cap: "content" },
  { id: "site",        group: "Content",  label: "Site content", title: "Site content",        icon: "◧", cap: "settings" },
  { id: "status-pages",group: "Content",  label: "Status pages", title: "Public status pages",  icon: "◉", cap: "content" },
  { id: "newsletter",  group: "Inbox",    label: "Newsletter",   title: "Newsletter",          icon: "✧", cap: "inbox" },
  { id: "messages",    group: "Inbox",    label: "Messages",     title: "Messages",            icon: "✆", cap: "inbox" },
  { id: "access",      group: "System",   label: "Access & roles", title: "Access & roles",    icon: "⚿", cap: "rbac" },
  { id: "audit",       group: "System",   label: "Audit trail",  title: "Audit log",           icon: "⌗", cap: "audit" },
  { id: "ops",         group: "System",   label: "Diagnostics",  title: "Diagnostics",         icon: "◉", cap: "settings" },
  { id: "integrations",group: "System",   label: "Integrations", title: "Integrations & delivery", icon: "⇄", cap: "settings" },
  { id: "donations",   group: "System",   label: "Donations",    title: "Donations",           icon: "❤", cap: "settings" },
  { id: "settings",    group: "System",   label: "Settings",     title: "Settings",            icon: "⚙", cap: "settings" },
];
// Which capability each admin section needs (null = any staff) — derived.
const SECTION_CAP = ADMIN_SECTIONS.reduce((m, s) => { m[s.id] = s.cap; return m; }, {});

// Cross-section deep-link: jump the console to another section (and optionally a
// specific sub-tab). window.__adminSection is exposed by AdminPage; a section
// that supports tabs reads the pending tab on mount. Lets one screen point an
// admin straight at where a piece of data is actually edited.
let _pendingAdminTab = "";
function adminJump(sectionId, tab) {
  if (tab) _pendingAdminTab = tab;
  if (window.__adminSection) window.__adminSection(sectionId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function takePendingAdminTab(fallback) {
  const t = _pendingAdminTab || fallback;
  _pendingAdminTab = "";
  return t;
}

// Read the ops health payload and distil the two storage faults an admin can
// actually act on: a DEGRADED/failed local photo store, and a Cloudinary that
// is refusing, exhausted or unreachable. Returns a list + a signature so a
// dismissal sticks only until the situation itself changes.
function computeHealthIssues(health) {
  const c = (health && health.checks) || {};
  const list = [];

  const ph = c.photos || {};
  if (ph.where === "cache_fallback") {
    list.push({
      key: "photos:cache_fallback",
      label: "Photo storage is DEGRADED",
      detail: "New headshots are being written to the disposable cache directory because the storage folder isn’t writable"
        + (ph.dir ? " (" + ph.dir + ")" : "") + ". They can be lost when the cache is cleared.",
      action: "In your host’s File Manager, make that folder writable (0755). Stored photos then self-heal to durable storage the next time each is viewed.",
    });
  } else if (ph.where === "unwritable") {
    list.push({
      key: "photos:unwritable",
      label: "Photo storage is FAILING",
      detail: "There is no writable directory for headshots" + (ph.dir ? " (" + ph.dir + ")" : "")
        + " — without Cloudinary, uploaded photos are being dropped.",
      action: "In your host’s File Manager, make that folder writable (0755) now.",
    });
  }

  const cl = c.cloudinary || {};
  if (cl.configured && cl.state && cl.state !== "ok" && cl.state !== "not_configured") {
    const label = {
      bad_credentials: "Cloudinary is refusing these keys",
      exhausted: "Cloudinary plan is exhausted / rate-limited",
      unreachable: "Cloudinary is unreachable",
    }[cl.state] || ("Cloudinary: " + cl.state);
    const action = {
      bad_credentials: "Check the Cloudinary API key and secret in api/config.php — they look rotated or wrong. Until fixed, uploads silently fall back to local storage.",
      exhausted: "Upgrade the plan or wait for the quota to reset. Uploads fall back to local storage meanwhile.",
      unreachable: "Check outbound network/proxy access to api.cloudinary.com. Uploads fall back to local storage meanwhile.",
    }[cl.state] || "";
    list.push({ key: "cloud:" + cl.state, label, detail: cl.detail || "", action });
  }

  return { list, sig: list.map(i => i.key).join("|") };
}

// A control-room banner for storage faults that otherwise only surface as a
// blank photo frame. Fetches ops health once (settings-gated, so it no-ops for
// staff without that cap) and shows only when something is actually wrong.
function AdminHealthBanner({ hasCap, setSection }) {
  const [issues, setIssues] = React.useState(null);
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem("ngg.health.dismiss") || ""; } catch (_) { return ""; }
  });

  React.useEffect(() => {
    if (!hasCap || !hasCap("settings")) return; // /admin/ops.php is settings-gated
    let alive = true;
    NGGApi.admin.ops.status()
      .then(r => { if (alive) setIssues(computeHealthIssues(r && r.health)); })
      .catch(() => {/* a diagnostics call must never break the console */});
    return () => { alive = false; };
  }, []); // eslint-disable-line

  if (!issues || !issues.list.length || dismissed === issues.sig) return null;
  const dismiss = () => { try { localStorage.setItem("ngg.health.dismiss", issues.sig); } catch (_) {} setDismissed(issues.sig); };

  return (
    <div className="admin-health-banner" role="alert">
      <span className="ahb-ico" aria-hidden="true">⚠</span>
      <div className="ahb-text">
        <b className="ahb-title">{issues.list.length === 1 ? "A storage issue needs your attention" : "Storage issues need your attention"}</b>
        <ul className="ahb-list">
          {issues.list.map((it) => (
            <li key={it.key}><b>{it.label}.</b> {it.detail}{it.action ? <span className="ahb-action"> {it.action}</span> : null}</li>
          ))}
        </ul>
      </div>
      <div className="ahb-actions">
        <button className="btn btn-sm btn-on-dark-ghost" onClick={() => setSection && setSection("settings")}>Open Diagnostics</button>
        <button className="btn btn-sm btn-on-dark-ghost" onClick={dismiss} title="Hide until this changes">Dismiss</button>
      </div>
    </div>
  );
}

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

  /* ── The Analyst pane ─────────────────────────────────────────────────────
     A third grid TRACK, not an overlay: the page reflows beside it rather than
     being covered, which is the difference between an assistant you consult
     while reading and one you consult instead of reading. Its open/closed state
     is remembered, because a pane that shuts itself on every navigation is one
     nobody leaves open. ⌘J / Ctrl-J toggles — the shortcut is on the button so
     it is discoverable rather than folklore. */
  /* The Analyst spends money on an AI provider on every use and is an M&E
     instrument, so it is gated to the 'audit' and 'summer' capabilities (the
     backend enforces the same on every insight op). A staffer without either
     never sees the button, the shortcut is inert for them, and the pane cannot
     be opened even if a stale localStorage flag says it was. */
  const canAnalyst = hasCap("audit") || hasCap("summer");
  const [analyst, setAnalyst] = React.useState(() => {
    try { return localStorage.getItem("ngg.analyst.open") === "1"; } catch { return false; }
  });
  React.useEffect(() => { try { localStorage.setItem("ngg.analyst.open", analyst ? "1" : "0"); } catch (_) {} }, [analyst]);
  React.useEffect(() => {
    if (!canAnalyst) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setAnalyst(a => !a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAnalyst]);

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
  const hasConsole = ["content", "people", "inbox", "settings", "rbac", "audit"].some(c => hasCap(c));
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
      <AdminTopbar section={section} setSection={setSection} setPage={setPage} member={member}
        analyst={analyst} toggleAnalyst={() => setAnalyst(a => !a)} canAnalyst={canAnalyst}/>
      <AdminHealthBanner hasCap={hasCap} setSection={setSection}/>
      <div className={"admin-shell" + (analyst && canAnalyst ? " has-analyst" : "")}>
        <AdminNav section={view} setSection={setSection} hasCap={hasCap}/>
        <main className="admin-main">
          {view === "home" && <AdminHome setSection={setSection} hasCap={hasCap} member={member}/>}
          {view === "dashboard" && <AnalyticsWorkspace/>}
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
          {view === "fees" && <AdminFees/>}
          {view === "status-pages" && <AdminStatusPages/>}
          {view === "sessions" && <AdminSessions/>}
          {view === "missions" && <AdminMissions/>}
          {view === "anchor" && <AdminAnchor/>}
          {view === "assignments" && <AdminAssignments/>}
          {view === "events" && <AdminEvents/>}
          {view === "posts" && <AdminPosts/>}
          {view === "photos" && <AdminPhotos/>}
          {view === "broadcast" && <AdminBroadcast/>}
          {view === "attendance" && <AdminAttendanceDuty/>}
          {view === "engagement" && <EngagementPanel/>}
          {view === "access" && <AdminAccess/>}
          {view === "audit" && <AdminAudit/>}
          {view === "ops" && <AdminOps/>}
          {view === "behaviour" && <AdminBehaviour/>}
          {view === "staff" && <AdminStaff/>}
          {view === "integrations" && <AdminIntegrations/>}
          {view === "comments" && <AdminComments/>}
          {view === "community" && <AdminCommunity/>}
          {view === "assessment" && <AdminAssessment/>}
          {view === "donations" && <AdminDonations/>}
        </main>
        {/* The third track. Mounted only when open, so a closed pane costs
            nothing — it holds an open conversation, a poll of the thread list
            and a live scope subscription. */}
        {analyst && canAnalyst && <AnalystPane onClose={() => setAnalyst(false)}/>}
      </div>
    </div>
  );
}

// ============================================================================
// TOTP gate — admins must enter a fresh code before /admin opens.
// ============================================================================

function AdminTotpGate({ onPass, member }) {
  const gateAuth = (typeof useAuth === "function") ? useAuth() : null;
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
      const r = await NGGApi.auth.adminTotpVerify(code.replace(/\s/g, ""));
      if (r && r.backupUsed) toast.warn("Backup code used — " + (r.backupRemaining ?? 0) + " left. Re-enrol your authenticator soon.", "2FA");
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
                  {Array.isArray(setupData.backupCodes) && setupData.backupCodes.length > 0 && (
                    <div className="admin-gate-secret" style={{ marginTop: 10 }}>
                      <div className="mono" style={{ fontSize: 10, color: "var(--crimson-500, #E4155F)" }}>BACKUP CODES — SAVE THESE NOW (shown once). Each works once if you lose your authenticator.</div>
                      <div className="mono" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px", marginTop: 6, fontSize: 13 }}>
                        {setupData.backupCodes.map((c, i) => <code key={i}>{c}</code>)}
                      </div>
                    </div>
                  )}
                </>
              ) : <div className="dash-spinner"/>}
            </>
          ) : (
            <p className="admin-gate-p">You're still signed in as <b>{member ? member.fullName : "staff"}</b> — just re-enter the current 6-digit code from your authenticator to re-open the Control Room. No need to sign out.</p>
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
          {!setupMode && gateAuth && (
            <div className="admin-gate-foot">
              <button type="button" className="signin-link" onClick={() => { if (window.__navigate) window.__navigate("home"); }}>← Back to the site</button>
              <button type="button" className="signin-link" onClick={async () => { try { await gateAuth.signOut(); } catch (_) {} }}>Not you? Sign out</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// Topbar + side nav
// ============================================================================

// "in 6 days" / "in 5 hours" / "in 40 minutes" from a unix-seconds expiry.
function adminExpiryLabel(exp) {
  if (!exp) return null;
  const s = exp - Math.floor(Date.now() / 1000);
  if (s <= 0) return { text: "expiring now", warn: true };
  if (s < 3600) return { text: Math.max(1, Math.round(s / 60)) + "m left", warn: true };
  if (s < 86400) return { text: Math.round(s / 3600) + "h left", warn: s < 2 * 3600 };
  return { text: Math.round(s / 86400) + "d left", warn: false };
}

function AdminTopbar({ section, setSection, setPage, member, analyst, toggleAnalyst, canAnalyst }) {
  const { sessionExp, lockAdmin } = (typeof useAuth === "function") ? useAuth() : {};
  const exp = adminExpiryLabel(sessionExp);
  return (
    <div className="admin-topbar">
      <div className="admin-topbar-l">
        <BrandLogo size={28}/>
        <div className="admin-topbar-title">
          <div className="mono admin-topbar-eyebrow">NGG · CONTROL ROOM</div>
          <div className="admin-topbar-section">{titleFor(section)}</div>
        </div>
      </div>
      <div className="admin-topbar-r">
        <span className="mono" style={{color:"rgba(255,255,255,0.6)"}}>{member.fullName} · {member.role}</span>
        {/* The Analyst, reachable from every section rather than from the bottom
            of one. The shortcut is printed on the button because a keystroke
            nobody can see is a keystroke nobody uses. Shown only to staff with
            the M&E capability ('audit' or 'summer') — it is what the backend
            gates every insight op on. */}
        {canAnalyst && (
          <button className={"admin-analyst-btn" + (analyst ? " is-on" : "")} onClick={toggleAnalyst}
            aria-pressed={!!analyst} title="Ask the analyst about what you are looking at (⌘J)">
            ✦ Analyst<kbd>⌘J</kbd>
          </button>
        )}
        {exp && <span className={"admin-session-chip" + (exp.warn ? " warn" : "")} title={sessionExp ? "Your sign-in ends " + new Date(sessionExp * 1000).toLocaleString() : ""}>🔑 {exp.text}</span>}
        {Array.isArray(member.caps) && member.caps.indexOf("summer") !== -1 && (
          <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("summer-admin")}>Summer ↗</button>
        )}
        {Array.isArray(member.caps) && member.caps.indexOf("club") !== -1 && (
          <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("club-admin")}>NGG Club ↗</button>
        )}
        {lockAdmin && <button className="btn btn-on-dark-ghost btn-sm" title="Lock the Control Room — re-enter with just your 2FA code, no full sign-out" onClick={lockAdmin}>🔒 Lock</button>}
        <button className="btn btn-on-dark-ghost btn-sm" onClick={() => setPage("home")}>View site →</button>
      </div>
    </div>
  );
}

// Group order for the sidebar; `null` is the ungrouped top entry (Overview).
const ADMIN_NAV_GROUPS = [null, "People", "Content", "Inbox", "System"];

function AdminNav({ section, setSection, hasCap }) {
  const can = (it) => !it.cap || (hasCap ? hasCap(it.cap) : true);
  const groups = ADMIN_NAV_GROUPS
    .map(h => ({ h, items: ADMIN_SECTIONS.filter(s => s.group === h).filter(can) }))
    .filter(g => g.items.length);
  const known = groups.some(g => g.items.some(it => it.id === section));
  return (
    <React.Fragment>
      {/* Phone nav. The sidebar carries ~30 sections; stacked on a 390px screen
          that is a screen and a half of buttons before any content appears, and
          laid out as a swipe strip it is a very long swipe to reach "Audit
          trail". A native picker is two taps to anywhere, keeps the group
          headings as optgroups, and costs one row of height. CSS swaps between
          this and the sidebar at 820px — both are always in the DOM so there is
          no resize listener to get wrong. */}
      <div className="admin-nav-m">
        <label className="admin-nav-m-lab" htmlFor="admin-nav-m-sel">Section</label>
        <select
          id="admin-nav-m-sel"
          className="admin-nav-m-sel"
          value={section}
          onChange={e => setSection(e.target.value)}
        >
          {/* A section the account cannot normally reach (deep link, cap change
              mid-session) still needs to show as the current value rather than
              silently reading as whatever sits first in the list. */}
          {!known && <option value={section}>{titleFor(section) || section}</option>}
          {groups.map((grp, gi) => grp.h
            ? <optgroup key={gi} label={grp.h}>
                {grp.items.map(it => <option key={it.id} value={it.id}>{it.label}</option>)}
              </optgroup>
            : grp.items.map(it => <option key={it.id} value={it.id}>{it.label}</option>))}
        </select>
      </div>
      <aside className="admin-nav">
        {groups.map((grp, gi) => (
          <React.Fragment key={gi}>
            {grp.h && <div className="admin-nav-group">{grp.h}</div>}
            {grp.items.map(it => (
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
        ))}
      </aside>
    </React.Fragment>
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
        {can("content") && <AdminTile n={fmt(an.verified)} l="Missions verified" onClick={() => setSection("missions")}/>}
        {can("content") && <AdminTile n={fmt(asg.published)} l="Assignments live" onClick={() => setSection("assignments")}/>}
        {can("content") && <AdminTile n={fmt((o.events || {}).upcoming)} l="Upcoming events" onClick={() => setSection("events")}/>}
        {can("people") && <AdminTile n={fmt(vol.active)} l="Active volunteers" onClick={() => setSection("volunteers")}/>}
        {can("people") && m.suspended != null && <AdminTile n={fmt(m.suspended)} l="Suspended" onClick={() => setSection("members")}/>}
        {can("inbox") && <AdminTile n={fmt((o.messages || {}).total)} l="Messages (all)" onClick={() => setSection("messages")}/>}
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

/* General dashboard — the Summer School 2026 board: live attendance + per-centre
   analytics. Read-only; any console admin (incl. the M&E audit role) sees it. */
function AdminDashboard() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.dashboard().then(r => { setD(r.dashboard); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); const id = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(id); }, []);
  if (err) return <div className="admin-section"><ErrorState title="Couldn't load the dashboard" code={err} onRetry={load}/></div>;
  if (!d) return <div className="admin-section"><div className="dash-spinner"/></div>;
  const k = d.kpis || {};
  const maxTrend = Math.max(1, ...(d.trend || []).map(t => (t.present || 0)));
  const kpi = (n, l, sub) => (
    <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
      <div className="admin-tile-n">{n}</div>
      <div className="mono admin-tile-l">{l}</div>
      {sub ? <div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
  const rateColor = (r) => r >= 85 ? "#2f9e44" : r >= 60 ? "#f08c00" : "#e03131";
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Summer School Dashboard</h2>
        <span className="mono" style={{ color: "var(--ink-500)", fontSize: 12 }}>Live · {d.today} · updates every 30s</span>
      </div>
      <div className="admin-grid-cards" style={{ marginBottom: 22 }}>
        {kpi(k.centres || 0, "Centres")}
        {kpi(k.enrolled || 0, "Enrolled students")}
        {kpi(k.presentToday || 0, "Present today")}
        {kpi((k.attendanceRate || 0) + "%", "Attendance rate")}
        {kpi(k.lateToday || 0, "Late today")}
        {kpi(k.activeVolunteers || 0, "Active volunteers", (k.presentVolToday || 0) + " in today")}
      </div>

      <h3 className="admin-h3" style={{ margin: "0 0 10px" }}>Centre performance</h3>
      {!(d.byCentre || []).length ? <div className="admin-empty">No active centres yet — add them under Registration → Centres.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Centre</th><th>Enrolled</th><th>Present today</th><th>Late</th><th>Attendance</th></tr></thead>
          <tbody>
            {(d.byCentre || []).map(c => (
              <tr key={c.centreId || c.name}>
                <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: c.color || "#76B043", marginRight: 8 }}/><b>{c.name}</b> <span className="mono admin-cell-sub">{c.code}</span></td>
                <td className="mono">{c.enrolled}</td>
                <td className="mono">{c.present}</td>
                <td className="mono">{c.late ? <span style={{ color: "#e03131" }}>{c.late}</span> : "—"}</td>
                <td><span style={{ fontWeight: 700, color: rateColor(c.rate) }}>{c.rate}%</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>}

      <h3 className="admin-h3" style={{ margin: "24px 0 10px" }}>Attendance — last 14 days</h3>
      {!(d.trend || []).length ? <div className="admin-empty">No check-ins recorded yet.</div> :
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, padding: "0 2px", overflowX: "auto" }}>
          {(d.trend || []).map(t => (
            <div key={t.date} title={t.date + " · " + t.present + " present" + (t.late ? " · " + t.late + " late" : "")} style={{ flex: "1 0 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", maxWidth: 26, height: Math.max(2, Math.round((t.present || 0) / maxTrend * 96)), background: "linear-gradient(180deg,#4c6ef5,#3b5bdb)", borderRadius: "4px 4px 0 0" }}/>
              <span className="mono" style={{ fontSize: 9, color: "var(--ink-500)", whiteSpace: "nowrap" }}>{String(t.date).slice(5)}</span>
            </div>
          ))}
        </div>}
      <p className="admin-hint" style={{ marginTop: 16 }}>Per-centre scoping, stars/behaviour, recognition and academic analytics land in the next phases (see the implementation plan). Late is measured against the resumption times in Settings → Attendance.</p>
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
  const closeRoll = async (centre, volunteerId) => {
    if (!(await dialog.confirm({ title: "Close the roll for " + centre + "?", body: "This finalises today's attendance for " + centre + " and awards the duty volunteer their service points. It can't be reopened here.", cta: "Close roll" }))) return;
    setBusy(centre); try { const r = await NGGApi.admin.attendance.complete(date, centre, volunteerId); toast.success(r.message || "Roll closed"); await load(date); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const [board, setBoard] = React.useState(null);
  const loadBoard = () => NGGApi.admin.attendance.leaderboard().then(r => setBoard(r.leaderboard || [])).catch(() => setBoard([]));
  React.useEffect(() => { loadBoard(); }, []);
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
      <div className="admin-fields-h" style={{ marginTop: 22, fontWeight: 700 }}>Service leaderboard</div>
      <p className="admin-hint">Volunteers ranked by attendance-duty service points — recognise your most reliable stewards.</p>
      {board === null ? <div className="dash-spinner"/> :
        board.length === 0 ? <div className="admin-empty">No points logged yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>#</th><th>Volunteer</th><th>Level</th><th>Streak</th><th>Points</th></tr></thead>
          <tbody>{board.map(v => (
            <tr key={v.volunteerId}><td className="mono">{v.rank}</td><td>{v.fullName} <span className="chip" style={{ fontSize: 10 }}>{v.role}</span></td><td>L{v.level} · {v.levelName}</td><td>{v.streak}d</td><td><b>{v.points}</b></td></tr>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

// ============================================================================
// Team engagement — volunteers / instructors / mentors (M&E · audit cap)
// ============================================================================

const ENG_BAND_STYLE = {
  engaged:  { background: "#e6f7ec", color: "#137a3a" },
  slipping: { background: "#fff4e0", color: "#9a5b00" },
  at_risk:  { background: "#fdecec", color: "#c0322b" },
};
const ENG_ROLE_LABEL = { volunteer: "Volunteer", instructor: "Instructor", mentor: "Mentor" };

function engActivity(r) {
  const s = r.stats || {};
  if (r.role === "volunteer")  return (s.dutyCompleted || 0) + "/" + (s.dutyAssigned || 0) + " rolls · " + (s.points || 0) + " pts";
  if (r.role === "instructor") return (s.sessions || 0) + "/" + (s.target || 0) + " classes · " + (s.learnersMarked || 0) + " marked";
  if (r.role === "mentor")     return (s.activeMentees || 0) + "/" + (s.menteeTarget || 0) + " mentees · " + (s.stars || 0) + " stars" + (s.linked ? "" : " (unlinked)");
  return "";
}

const ENG_LINE = { all: "#111827", volunteer: "#2b8a3e", instructor: "#1971c2", mentor: "#9c36b5" };

// Compact inline-SVG line chart of weekly average engagement (overall + per role).
function EngTrendChart({ series }) {
  if (!series || !series.length) return <div className="admin-empty">No snapshots yet — the weekly job hasn't run.</div>;
  const W = 720, H = 180, padL = 30, padR = 12, padT = 12, padB = 24, n = series.length;
  const x = i => padL + (n === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (n - 1));
  const y = v => padT + (100 - v) * (H - padT - padB) / 100;
  const keys = ["all", "volunteer", "instructor", "mentor"];
  const path = k => { let d = "", on = false; series.forEach((s, i) => { const v = s[k]; if (v == null) { on = false; return; } d += (on ? " L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); on = true; }); return d; };
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", minWidth: 520, height: "auto" }} role="img" aria-label="Weekly engagement trend">
        {[0, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke={g === 75 ? "#137a3a55" : g === 50 ? "#9a5b0055" : "#e7e9ee"} strokeDasharray={(g === 50 || g === 75) ? "4 4" : ""}/>
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize="10" fill="var(--ink-400,#5f6874)">{g}</text>
          </g>
        ))}
        {keys.map(k => <path key={k} d={path(k)} fill="none" stroke={ENG_LINE[k]} strokeWidth={k === "all" ? 2.5 : 1.5} opacity={k === "all" ? 1 : 0.85}/>)}
        {series.map((s, i) => <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize="9" fill="var(--ink-400,#5f6874)">{String(s.weekStart).slice(5)}</text>)}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: ".8rem", marginTop: 2 }}>
        {keys.map(k => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 3, background: ENG_LINE[k], display: "inline-block", borderRadius: 2 }}/>{k === "all" ? "Overall" : ENG_ROLE_LABEL[k]}</span>)}
      </div>
    </div>
  );
}

function EngagementPanel() {
  const DT = (typeof window !== "undefined") ? window.DataTable : null;
  const [tab, setTab] = React.useState("now");
  const [role, setRole] = React.useState("");
  // Now tab
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  // Trends tab
  const [weeks, setWeeks] = React.useState(12);
  const [centre, setCentre] = React.useState("");
  const [trends, setTrends] = React.useState(null);
  const [tErr, setTErr] = React.useState("");

  const load = () => { setErr(""); setData(null); return NGGApi.admin.engagement({ days, role }).then(setData).catch(e => setErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { if (tab === "now") load(); /* eslint-disable-next-line */ }, [tab, days, role]);
  const loadTrends = () => { setTErr(""); setTrends(null); return NGGApi.admin.engagementTrends({ weeks, centre, role }).then(setTrends).catch(e => setTErr(e.code || e.message || "load_failed")); };
  React.useEffect(() => { if (tab === "trends") loadTrends(); /* eslint-disable-next-line */ }, [tab, weeks, centre, role]);

  const rows = (data && data.rows) || [];
  const summary = (data && data.summary) || {};
  const detail = (trends && trends.detail) || [];
  const centres = (trends && trends.centres) || [];

  const roleSelect = (
    <select className="admin-select" value={role} onChange={e => setRole(e.target.value)} aria-label="Role" style={{ maxWidth: 150 }}>
      <option value="">All roles</option><option value="volunteer">Volunteers</option>
      <option value="instructor">Instructors</option><option value="mentor">Mentors</option>
    </select>
  );

  const columns = React.useMemo(() => [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "role", header: "Role", cell: c => ENG_ROLE_LABEL[c.getValue()] || c.getValue() },
    { accessorKey: "engagement", header: "Engagement", cell: c => <span className="chip" style={Object.assign({ fontWeight: 800 }, ENG_BAND_STYLE[c.row.original.band] || {})}>{c.getValue()}%</span> },
    { id: "activity", header: "Activity", enableSorting: false, cell: c => <span className="mono" style={{ fontSize: 12 }}>{engActivity(c.row.original)}</span> },
    { accessorKey: "lastActive", header: "Last active", cell: c => c.getValue() || "—" },
  ], [data]);

  const tColumns = React.useMemo(() => [
    { accessorKey: "weekStart", header: "Week" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "role", header: "Role", cell: c => ENG_ROLE_LABEL[c.getValue()] || c.getValue() },
    { accessorKey: "centre", header: "Centre", cell: c => c.getValue() || "—" },
    { accessorKey: "engagement", header: "Engagement", cell: c => <span className="chip" style={Object.assign({ fontWeight: 800 }, ENG_BAND_STYLE[c.row.original.band] || {})}>{c.getValue()}%</span> },
  ], [trends]);

  const dl = (name, headArr, bodyArr) => {
    const csv = [headArr].concat(bodyArr).map(row => row.map(v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const exportNow = () => dl("engagement-" + days + "d" + (role ? "-" + role : "") + ".csv",
    ["Name", "Role", "Engagement", "Band", "LastActive", "Activity"],
    rows.map(r => [r.name, ENG_ROLE_LABEL[r.role] || r.role, r.engagement, r.band, r.lastActive, engActivity(r).replace(/·/g, "-")]));
  const exportTrends = () => dl("engagement-trends" + (centre ? "-" + centre : "") + (role ? "-" + role : "") + ".csv",
    ["Week", "Name", "Role", "Centre", "Engagement", "Band"],
    detail.map(r => [r.weekStart, r.name, ENG_ROLE_LABEL[r.role] || r.role, r.centre, r.engagement, r.band]));

  const tabBtn = (id, label) => <button className={"btn btn-sm" + (tab === id ? "" : " btn-ghost")} onClick={() => setTab(id)}>{label}</button>;

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Team engagement</h2>
        <div style={{ display: "flex", gap: 6 }}>{tabBtn("now", "Now")}{tabBtn("trends", "Trends")}</div>
      </div>

      {tab === "now" ?
        <React.Fragment>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 6px" }}>
            {roleSelect}
            <select className="admin-select" value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Window" style={{ maxWidth: 150 }}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={exportNow} disabled={!rows.length}>Export CSV</button>
          </div>
          <p className="admin-hint">Rolling {days}-day engagement — duty completion, class delivery, mentee coverage and recency, most-at-risk first. 🟢 ≥75 · 🟡 50–74 · 🔴 &lt;50.</p>
          {err ? <ErrorState code={err} onRetry={load}/> :
            !data ? <div className="dash-spinner"/> :
            <React.Fragment>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "6px 0 18px" }}>
                {["volunteer", "instructor", "mentor"].map(r => {
                  const st = summary[r] || { count: 0, avg: 0, atRisk: 0 };
                  return (
                    <div key={r} style={{ border: "1px solid var(--line,#e7e9ee)", borderRadius: 12, padding: "12px 14px" }}>
                      <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-400,#5f6874)" }}>{ENG_ROLE_LABEL[r]}s</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{st.avg}%<span style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--ink-400,#5f6874)" }}> avg</span></div>
                      <div style={{ fontSize: ".82rem", color: "var(--ink-400,#5f6874)" }}>{st.count} tracked · {st.atRisk} at-risk</div>
                    </div>
                  );
                })}
              </div>
              {!DT ? <div className="admin-empty">Table component unavailable — reload the page.</div> :
                rows.length === 0 ? <EmptyState title="No engagement data yet" message="Once volunteers take attendance duty, instructors log classes and mentors award stars, their engagement appears here."/> :
                <DT columns={columns} data={rows} searchable dense pageSize={25} searchPlaceholder="Search people…"/>}
            </React.Fragment>}
        </React.Fragment>
      :
        <React.Fragment>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 6px" }}>
            {roleSelect}
            <select className="admin-select" value={centre} onChange={e => setCentre(e.target.value)} aria-label="Centre" style={{ maxWidth: 170 }}>
              <option value="">All centres</option>
              {centres.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="admin-select" value={weeks} onChange={e => setWeeks(Number(e.target.value))} aria-label="Weeks" style={{ maxWidth: 150 }}>
              <option value={6}>Last 6 weeks</option><option value={12}>Last 12 weeks</option><option value={26}>Last 26 weeks</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={exportTrends} disabled={!detail.length}>Export CSV</button>
          </div>
          <p className="admin-hint">Weekly engagement snapshots — one row per member per centre, captured every week. Trend lines are headcount-weighted averages; the table below is the detail per member per centre.</p>
          {tErr ? <ErrorState code={tErr} onRetry={loadTrends}/> :
            !trends ? <div className="dash-spinner"/> :
            <React.Fragment>
              <div style={{ border: "1px solid var(--line,#e7e9ee)", borderRadius: 12, padding: "12px 14px", margin: "6px 0 16px" }}>
                <EngTrendChart series={trends.series || []}/>
              </div>
              {!DT ? <div className="admin-empty">Table component unavailable — reload the page.</div> :
                detail.length === 0 ? <EmptyState title="No snapshots yet" message="The weekly job captures a row per member each week. Once it has run (or you run api/tools/engagement-snapshot.php), the per-member, per-centre history appears here."/> :
                <DT columns={tColumns} data={detail} searchable dense pageSize={25} searchPlaceholder="Search snapshots…"/>}
            </React.Fragment>}
        </React.Fragment>
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
  const centreOpts = useCentreOptions();
  const [filters, setFilters] = React.useState({ q: "", centre: "", status: "", type: "" });
  const [page, setPage] = React.useState(1);
  const [meta, setMeta] = React.useState({ total: 0, pageSize: 50 });
  const [editing, setEditing] = React.useState(null);
  const [viewing, setViewing] = React.useState(null);
  const [printing, setPrinting] = React.useState(false);

  const [exporting, setExporting] = React.useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await NGGApi.admin.members.list(Object.assign({}, filters, { all: 1 }));
      downloadCsv("members", (r.members || []).map(m => ({ memberId: m.memberId, fullName: m.fullName, email: m.email, type: m.type, status: m.status, centre: m.centre, track: m.track || "" })));
    } catch (e) { toast.error(e.code || e.message, "Export failed"); } finally { setExporting(false); }
  };
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
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={exporting || !meta.total} title="Exports all members matching the current filters">{exporting ? "Exporting…" : "Export CSV"}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPrinting(true)} disabled={!meta.total} title="Print ID cards for every member matching the current filters">Print IDs</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New member</button>
        </div>
      </div>
      <div className="admin-filters">
        <input className="admin-input" placeholder="Search name, ID, email…" value={filters.q} onChange={(e) => setFilters(f => ({...f, q: e.target.value}))}/>
        <select className="admin-select" value={filters.centre} onChange={(e) => setFilters(f => ({...f, centre: e.target.value}))}>
          <option value="">All centres</option>{centreOpts.map(c => <option key={c} value={c}>{c}</option>)}
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
      {printing && <AdminMemberIdBatch filters={filters} total={meta.total} onClose={() => setPrinting(false)}/>}
    </div>
  );
}

// ============================================================================
// Batch ID cards — one file, every member the filters match.
//
// The member ID card is hand-coded (window.MemberIDCard), not a Fabric template,
// so the ID Card Studio's merge engine — which drives a designed template over a
// roster — cannot print it. This is the member equivalent: it reads the same
// filtered roster the table and the CSV export use, renders each card on the
// on-demand CardExport path, and hands back one of three files. Rendering runs
// entirely in the browser (the host has no headless renderer), one card at a
// time, cancellable, so the whole cohort neither locks the tab nor blows memory.
// ============================================================================
function AdminMemberIdBatch({ filters, total, onClose }) {
  const { panelRef, close } = useAdminDrawer(onClose, false);
  const [mode, setMode] = React.useState("zip");
  const [dpi, setDpi] = React.useState(300);
  const [run, setRun] = React.useState(null);        // { i, n, note } while rendering
  const cancelRef = React.useRef(false);
  const doneRef = React.useRef(false);

  const MODES = [
    { value: "zip", label: "ZIP of images", hint: "A PNG per member, named for them — for emailing or a print merge." },
    { value: "pdf", label: "PDF · a page each", hint: "One page per member at the 54×85mm trim size — a print shop's cut file." },
    { value: "sheet", label: "PDF · imposed sheet", hint: "As many as fit an A4 sheet, with bleed and crop marks, for a print run." },
  ];

  const start = async () => {
    if (run) return;
    if (!window.MemberIDCardBatch) { toast.error("The card renderer isn't loaded — reload and try again."); return; }
    cancelRef.current = false;
    setRun({ i: 0, n: total || 0, note: "reading the roster…" });
    let members = [];
    try {
      const r = await NGGApi.admin.members.list(Object.assign({}, filters, { all: 1 }));
      members = r.members || [];
    } catch (e) { toast.error(e.code || e.message || "Couldn't read the roster", "Print failed"); setRun(null); return; }
    if (!members.length) { toast.error("Nobody matches these filters."); setRun(null); return; }
    setRun({ i: 0, n: members.length, note: "" });
    try {
      const out = await window.MemberIDCardBatch(members, {
        mode, dpi,
        cancel: () => cancelRef.current,
        onProgress: (i, n, m) => setRun({ i, n, note: (m && m.fullName) || "" }),
      });
      doneRef.current = true;
      if (out.made > 0) {
        const msg = out.made + " card" + (out.made === 1 ? "" : "s")
          + (out.failed.length ? " · " + out.failed.length + " could not be rendered (" + out.failed.slice(0, 3).join(", ") + (out.failed.length > 3 ? ", …" : "") + ")" : "");
        out.failed.length ? toast.error(msg, "Printed with gaps") : toast.success(msg, "Printed");
        if (!cancelRef.current) { close(); return; }
      } else {
        toast.error(cancelRef.current ? "Cancelled before anything was written." : "Nothing could be rendered.");
      }
    } catch (e) {
      toast.error(e.message || "The run failed", "Print failed");
    }
    setRun(null);
  };

  const hintFor = (MODES.find(x => x.value === mode) || {}).hint || "";
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !run) close(); }}>
      <div className="admin-drawer-panel">
        <div className="admin-drawer-head">
          <h3>Print member ID cards</h3>
          <button type="button" className="admin-drawer-close" onClick={() => { if (!run) close(); }}>✕</button>
        </div>
        <div className="admin-fields">
          <p className="admin-hint">
            One card for every member the current filters match — <b>{(total || 0).toLocaleString()}</b> in all.
            Narrow the list first (centre, type, status) to print a subset.
          </p>
          <label className="admin-field"><span className="admin-label">What to make</span>
            <select className="admin-select" value={mode} onChange={e => setMode(e.target.value)} disabled={!!run}>
              {MODES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <p className="admin-hint" style={{ marginTop: -6 }}>{hintFor}</p>
          <label className="admin-field"><span className="admin-label">Resolution</span>
            <select className="admin-select" value={dpi} onChange={e => setDpi(Number(e.target.value))} disabled={!!run}>
              <option value={150}>150dpi · proof</option>
              <option value={300}>300dpi · print</option>
              <option value={600}>600dpi · fine</option>
            </select>
          </label>
          {run && (
            <p className="admin-hint" role="status" style={{ marginTop: 4 }}>
              {run.note === "reading the roster…" || run.note === "writing the file…"
                ? run.note
                : "Rendering " + Math.min(run.i + 1, run.n) + " of " + run.n + (run.note ? " — " + run.note : "")}
            </p>
          )}
        </div>
        <div className="admin-drawer-foot">
          {run
            ? <button type="button" className="btn btn-ghost" onClick={() => { cancelRef.current = true; }}>Stop</button>
            : <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>}
          <button type="button" className="btn btn-primary" onClick={start} disabled={!!run || !total}>
            {run ? "Working…" : "Print " + (total || 0).toLocaleString()}
          </button>
        </div>
      </div>
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
            <FieldCentre value={d.centre} onChange={v => set("centre", v)}/>
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
          {hasCap && hasCap("rbac") && d.memberId && (
            <div className="admin-field">
              <span className="admin-label">Account recovery</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!confirm("Reset this member's 2FA? They'll re-enrol an authenticator at next admin sign-in.")) return;
                  try { await NGGApi.admin.members.reset2fa(d.memberId); toast.success("2FA reset — they'll set it up again next sign-in.", "Done"); } catch (e) { toast.error(e.code || e.message); }
                }}>Reset 2FA</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!confirm("Clear this member's password? They'll sign in via an emailed code and can set a new one.")) return;
                  try { await NGGApi.admin.members.resetPassword(d.memberId); toast.success("Password cleared — they can sign in by email code.", "Done"); } catch (e) { toast.error(e.code || e.message); }
                }}>Reset password</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!confirm("View the app as this member? You'll be signed in as them until you stop impersonating.")) return;
                  try { await NGGApi.admin.members.impersonate(d.memberId); window.location.href = "/dashboard"; } catch (e) { toast.error(e.code || e.message); }
                }}>View as member</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={async () => {
                  if (!confirm("Delete & anonymise this member? Their PII and journal are scrubbed and sessions revoked. This cannot be undone.")) return;
                  try { await NGGApi.admin.members.remove(d.memberId); toast.success("Member deleted & anonymised.", "Done"); (onSaved || onClose)(); } catch (e) { toast.error(e.code || e.message); }
                }}>Delete member</button>
              </div>
            </div>
          )}
          {hasCap && hasCap("rbac") && d.memberId && d.role && d.role !== "member" && (
            <MemberCapsEditor member={d}/>
          )}
          {d.memberId && (!d.role || d.role === "member") && (
            <MemberConsentEditor member={d}/>
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

/* ---- Publication consent for one child ------------------------------------
 * Club members are minors — their record carries a date of birth, a guardian
 * and a school — so their name and face are published only if a guardian said
 * so. Staff record here what a guardian actually told them, on the paper form
 * or over the phone, which is how the programme already works.
 *
 * `method` is mandatory. A ledger row that does not say how the decision was
 * obtained is a checkbox, not evidence, and this is the record the programme
 * would have to stand behind.
 *
 * One child at a time, on purpose. A "mark this whole centre consented" button
 * is the obvious next request and the wrong feature: it manufactures a
 * permission for people nobody spoke to, and the ledger would then be worth
 * nothing exactly when it mattered.
 */
const CONSENT_METHODS = ["Paper form", "Parent portal", "By phone", "In person", "Email/SMS reply"];

function MemberConsentEditor({ member }) {
  const [state, setState] = React.useState(member.consent || {});
  const [method, setMethod] = React.useState(CONSENT_METHODS[0]);
  const [busy, setBusy] = React.useState("");

  const record = async (type, status) => {
    setBusy(type + status);
    try {
      const r = await NGGApi.admin.members.consent(member.memberId, type, status, method);
      setState(Object.assign({}, state, r.consent, { mayName: r.mayName }));
      toast.success(status === "granted" ? "Consent recorded." : "Refusal recorded.", "Saved");
    } catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };

  const row = (type, label, note) => {
    const cur = state[type];
    const st = cur && cur.status;
    return (
      <div key={type} data-consent-row={type} style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
        padding: "10px 0", borderTop: "1px solid var(--line,#e4ddcc)" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)" }}>{note}</div>
          {cur
            ? <div style={{ fontSize: 12, marginTop: 3, color: st === "granted" ? "#2f7a3f" : "#b03535" }}>
                {st === "granted" ? "Granted" : "Declined"} · {cur.method || "no method recorded"}
                {cur.by ? " · by " + cur.by : ""}{cur.at ? " · " + String(cur.at).slice(0, 10) : ""}
              </div>
            /* Not "declined" — nobody has been asked. Saying so is the point:
               it is a task outstanding, not a decision that was made. */
            : <div style={{ fontSize: 12, marginTop: 3, color: "var(--ink-500)", fontStyle: "italic" }}>
                Not recorded — this child is not named publicly
              </div>}
        </div>
        <div style={{ display: "flex", gap: 6, flex: "none" }}>
          <button type="button" className={"btn btn-sm" + (st === "granted" ? " btn-primary" : " btn-ghost")}
            disabled={!!busy} onClick={() => record(type, "granted")}>{busy === type + "granted" ? "…" : "Granted"}</button>
          <button type="button" className={"btn btn-sm" + (st === "declined" ? " btn-primary" : " btn-ghost")}
            disabled={!!busy} onClick={() => record(type, "declined")}>{busy === type + "declined" ? "…" : "Declined"}</button>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-field">
      <span className="admin-label">Publication consent</span>
      <p className="admin-hint" style={{ margin: "2px 0 8px" }}>
        What a guardian has agreed may appear on the public website. With nothing recorded this child
        appears on the boards as <b>{state.handle || "a handle"}</b> — keeping their rank and score, but not their name.
      </p>
      <label className="admin-field">
        <span>How was this decision obtained?</span>
        <select className="admin-select" value={method} onChange={e => setMethod(e.target.value)}>
          {CONSENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      {row("site_visibility", "Feature on our website", "Their first name and last initial may be shown.")}
      {row("media", "Photos & media", "Their photograph may be published — needs the one above as well.")}
    </div>
  );
}

// ============================================================================
// Mentors
// ============================================================================

/* Which centre somebody belongs to, readable without reading.
   On a list of forty volunteers the centre was a word in small grey type, in
   the same place on every row — so nobody could tell at a glance who worked
   where. Centres already carried their own colour; this puts it on the photo
   and keeps the CODE next to it, because colour alone is not a label. */
function CentreRing({ centre, centres, url, name, size }) {
  const c = (centres || {})[centre];
  const px = size || 56;
  const tint = c ? c.color : "rgba(12,20,50,0.18)";
  /* The code chip and the initial both sit ON the centre colour, and both used
     to be white with a drop shadow regardless of what that colour was. A shadow
     does not rescue white on the pale yellow an admin can pick in one click — it
     smudges it. The ink comes from the colour now, and a pale chip gets a
     hairline so it still reads as a chip against the white ring and the white
     row behind it. */
  const ink = inkOn(c ? c.color : "");
  return (
    <span className="centre-ring" style={{ width: px, height: px, borderColor: tint }}
      title={centre || "No centre set"}>
      {url
        ? <img src={url} alt="" className="centre-ring-img"/>
        : <span className="centre-ring-img centre-ring-fallback" style={{ background: tint, color: ink.ink }}>{(name || "?").charAt(0)}</span>}
      {c && <span className="centre-ring-code mono" style={{ background: c.color, color: ink.ink, textShadow: ink.shadow,
                                                            outline: ink.light ? "1px solid " + ink.hairline : "none", outlineOffset: -3 }}>{c.code}</span>}
    </span>
  );
}

function RankChip({ rank }) {
  if (rank !== "lead") return null;
  return <span className="chip chip-gold" title="Runs this centre — sees every child there, and the mentors working with them">LEAD</span>;
}

/* Promote somebody already in the programme onto the mentor roster.
   A picker, because "make X a mentor" over a list of hundreds is mostly the
   problem of finding X — members and volunteers together, since a coordinator
   thinks in people, not in which table they live in. */
function MentorPromote({ centres, onClose, onDone }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [pick, setPick] = React.useState(null);
  const [rank, setRank] = React.useState("mentor");
  const [programme, setProgramme] = React.useState("summer");
  const [centre, setCentre] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      NGGApi.admin.mentor.candidates(q).then(r => { if (live) setRows(r.candidates || []); }).catch(() => { if (live) setRows([]); });
    }, q ? 220 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const choose = (c) => { setPick(c); setCentre(c.centre || ""); setDept(c.faculty || ""); };
  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.mentor.promote(pick.personId, { rank, programme, centre, department: dept });
      toast.success(pick.fullName + " is now a " + (rank === "lead" ? "lead mentor" : "mentor") + (r.created ? "" : " (record updated)"), "Added to the roster");
      onDone();
    } catch (e) { toast.error(e.code || e.message); setBusy(false); }
  };
  const { panelRef, close } = useAdminDrawer(onClose, false);
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel">
        <div className="admin-drawer-head">
          <h3>Make someone a mentor</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div className="admin-fields">
      <p className="admin-hint">Anyone already in the programme — a member, or a summer volunteer. Their mentor record remembers which account or card they sign in with, so an instructor holding an ID card is matched too.</p>
      <label className="admin-field"><span className="admin-label">Search</span>
        <input className="admin-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email or ID" autoFocus/>
      </label>
      <div style={{ maxHeight: 210, overflowY: "auto", border: "1px solid rgba(12,20,50,0.1)", borderRadius: 10, margin: "8px 0 14px" }}>
        {rows === null && <p className="admin-hint" style={{ padding: 12 }}>Searching…</p>}
        {rows && !rows.length && <p className="admin-hint" style={{ padding: 12 }}>Nobody matches — or everyone who does is already a mentor.</p>}
        {(rows || []).map(c => (
          <button key={c.kind + c.personId} onClick={() => choose(c)}
            className={"admin-pick-row" + (pick && pick.personId === c.personId ? " is-on" : "")}>
            <CentreRing centre={c.centre} centres={centres} name={c.fullName} size={36}/>
            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <span style={{ fontWeight: 600, display: "block" }}>{c.fullName}</span>
              <span className="mono admin-cell-sub">{c.kind} · {c.centre || "no centre"}{c.email ? " · " + c.email : ""}</span>
            </span>
          </button>
        ))}
      </div>
      {pick && <>
        <div className="admin-fields-row">
          <FieldSelect label="Rank" value={rank} onChange={setRank}
            options={[{ value: "mentor", label: "Mentor — their class" }, { value: "lead", label: "Lead mentor — the whole centre" }]}/>
          <FieldSelect label="Cohort" value={programme} onChange={setProgramme}
            options={[{ value: "summer", label: "Summer School" }, { value: "ngg", label: "NGG Club" }, { value: "both", label: "Both" }]}/>
        </div>
        <div className="admin-fields-row">
          <FieldSelect label="Centre" value={centre} onChange={setCentre}
            options={[{ value: "", label: "— every centre —" }].concat(Object.keys(centres || {}).map(n => ({ value: n, label: n })))}/>
          <Field label={rank === "lead" ? "Faculty (ignored for a lead)" : "Faculty (blank = the whole centre)"}
            value={dept} onChange={setDept}/>
        </div>
        <p className="admin-hint">
          {rank === "lead"
            ? "A lead sees every child at their centre and how active the mentors there are."
            : "A mentor sees their centre, narrowed to their department if one is set."}
        </p>
      </>}
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!pick || busy} onClick={submit}>
            {busy ? "Saving…" : pick ? "Make " + pick.fullName.split(" ")[0] + " a " + (rank === "lead" ? "lead mentor" : "mentor") : "Pick someone"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminMentors() {
  const [list, setList] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);
  const [promoting, setPromoting] = React.useState(false);
  const [centres, setCentres] = React.useState({});
  const load = () => {
    setErr("");
    NGGApi.admin.mentorship.roster().then(r => setCentres(r.centres || {})).catch(() => {});
    return NGGApi.admin.mentors.list().then(r => setList(r.mentors || [])).catch(e => setErr(e.code || e.message || "load_failed"));
  };
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Mentors</h2>
        <div className="admin-section-actions">
          {/* The gap the field reported: records only appeared by converting a
              mentor APPLICATION, so somebody already in the programme had to
              have one invented for them. */}
          <button className="btn btn-primary btn-sm" onClick={() => setPromoting(true)}>+ Make someone a mentor</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing({})}>Add from scratch</button>
        </div>
      </div>
      {promoting && <MentorPromote centres={centres} onClose={() => setPromoting(false)} onDone={() => { setPromoting(false); load(); }}/>}
      {list === null ? (err ? <ErrorState code={err} onRetry={load}/> : <div className="dash-spinner"/>) :
        <div className="admin-grid-cards">
          {list.map(m => (
            <button key={m.mentorId} className="admin-card" onClick={() => setEditing(m)}>
              <CentreRing centre={m.centre} centres={centres} url={m.photoUrl} name={m.fullName} size={72}/>
              <div className="admin-card-name">{m.fullName} <RankChip rank={m.rank}/></div>
              {/* Which cohort they supervise, on the card rather than only in
                  the drawer: it decides whose children they can see, and that
                  is not something anyone should have to open twenty drawers
                  to audit. */}
              <div className="mono admin-card-meta">
                {{ ngg: "NGG Club", both: "Both cohorts" }[m.programme] || "Summer School"}
                {m.centre ? " · " + m.centre : ""}
              </div>
              <div className="mono admin-card-meta">{(m.tracks || []).join(", ")}</div>
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
          <FieldCentre value={d.centre} onChange={v => set("centre", v)} extra={["Both"]}/>
          {/* Which cohort this mentor supervises. It decides whose names appear
              on their roster and whom they can award stars to, so it is a
              safeguarding control, not a label — an NGG mentor set to 'both'
              can see and rate every summer child. Defaults to Summer School,
              which is exactly what every mentor could see before the field
              existed. */}
          <FieldSelect label="Supervises" value={d.programme||"summer"} onChange={v => set("programme", v)}
            options={[{ value: "summer", label: "Summer School" }, { value: "ngg", label: "NGG Club" }, { value: "both", label: "Both cohorts" }]}/>
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
  const [promoting, setPromoting] = React.useState(false);
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
        <div className="admin-section-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setPromoting(true)}>+ Make someone a mentor</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing({})}>Add from scratch</button>
        </div>
      </div>
      {promoting && <MentorPromote centres={roster.centres || {}} onClose={() => setPromoting(false)} onDone={() => { setPromoting(false); load(); }}/>}

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
              <CentreRing centre={m.centre} centres={roster.centres} url={m.photoUrl} name={m.fullName} size={38}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="admin-roster-name">
                  {m.fullName}
                  {m.rank === "lead" && <span className="chip chip-gold" style={{ marginLeft: 8 }} title="Runs this centre — sees every child there, and how active its mentors are">LEAD</span>}
                  <span className={"chip " + (m.status === "active" ? "chip-lime" : "chip-gold")} style={{ marginLeft: 8 }}>{m.status}</span>
                  {m.source === "afrovanguard" && <span className="chip chip-navy" style={{ marginLeft: 6 }}>AV</span>}
                </div>
                <div className="mono admin-cell-sub">{m.centre}{m.department ? " · " + m.department : ""}{(m.tracks || []).length ? " · " + m.tracks.join(", ") : ""}</div>
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
// NOTE: emit an SVG WITH explicit width/height (scalable:false). A scalable
// (viewBox-only) SVG has no intrinsic size, so inside a shrink-to-fit /
// fit-content container it collapses to nothing — the QR renders blank.
function qrSvg(text, cellSize = 4, margin = 2) {
  if (!window.qrcode) return "";
  try { const q = window.qrcode(0, "M"); q.addData(String(text)); q.make(); return q.createSvgTag({ cellSize, margin, scalable: false }); }
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
        {[["form", "Form builder"], ["gates", "Gate links"], ["pending", "Pending sign-ups"], ["overview", "Enrol"], ["kiosk", "Check-in kiosk"], ["attendance", "Attendance"], ["policy", "Programme & policy"], ["qr", "QR cards"], ["cards", "ID cards"], ["students", "Roster (" + o.students + ")"]].map(([id, lbl]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === "form" && <SummerFormBuilder/>}
      {tab === "gates" && <SummerGates/>}
      {tab === "pending" && <SummerPending onChange={load}/>}
      {tab === "overview" && <SummerEnroll cohort={cohort} blank={o.qrBlank} onDone={load}/>}
      {tab === "kiosk" && <SummerKiosk onCheckin={load}/>}
      {tab === "attendance" && <SummerAttendance/>}
      {tab === "policy" && <SummerPolicy/>}
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

/* Per-field conditional logic. The condition may only reference a field ABOVE
   this one: the form resolves top-down in a single pass, so a forward
   reference would read an answer nobody has given yet and a cycle would never
   settle. The server rejects both — this just never offers them. */
const LOGIC_OPS = [
  ["is", "is"], ["isNot", "is not"], ["in", "is any of"],
  ["answered", "is answered"], ["empty", "is empty"],
];
const LOGIC_NEEDS_VALUE = (op) => op !== "answered" && op !== "empty";

function FieldLogic({ field, above, onChange }) {
  const c = field.showIf;
  const candidates = above.filter(a => a.type !== "section" && a.type !== "info" && a.key);
  if (!c) {
    return (
      <div className="fb-logic">
        {candidates.length
          ? <button className="btn btn-ghost btn-sm" onClick={() => onChange({ showIf: { key: candidates[candidates.length - 1].key, op: "is", value: "" } })}>+ Add logic</button>
          : <span className="admin-cell-sub">Add a field above this one to make it conditional.</span>}
      </div>
    );
  }
  const src = candidates.find(a => a.key === c.key);
  const set = (patch) => onChange({ showIf: { ...c, ...patch } });
  return (
    <div className="fb-logic is-on">
      <span className="mono fb-logic-lead">SHOW ONLY WHEN</span>
      <select className="admin-select" value={c.key} onChange={e => set({ key: e.target.value })} aria-label="Condition field">
        {candidates.map(a => <option key={a.key} value={a.key}>{a.label || a.key}</option>)}
        {!src && <option value={c.key}>{c.key} (missing)</option>}
      </select>
      <select className="admin-select" value={c.op || "is"} onChange={e => set({ op: e.target.value, value: LOGIC_NEEDS_VALUE(e.target.value) ? (c.value || "") : "" })} aria-label="Condition operator">
        {LOGIC_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {LOGIC_NEEDS_VALUE(c.op || "is") && (
        // A choice source gets a picker for `is`/`is not`; `is any of` and a
        // free-text source get a text box, because the answer is not a fixed set.
        src && (src.type === "choice" || src.type === "multi") && (c.op || "is") !== "in"
          ? <select className="admin-select" value={c.value || ""} onChange={e => set({ value: e.target.value })} aria-label="Condition value">
              <option value="">Choose…</option>
              {(src.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          : <input className="admin-input" style={{ maxWidth: 220 }} value={c.value || ""} onChange={e => set({ value: e.target.value })}
              placeholder={(c.op || "is") === "in" ? "Music, Media" : "value"} aria-label="Condition value"/>
      )}
      <button className="fb-del" onClick={() => onChange({ showIf: null })} aria-label="Remove logic">✕</button>
      {!src && <span className="fb-logic-warn">That field is no longer above this one — fix or remove the rule before publishing.</span>}
    </div>
  );
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
      /* Carry the properties this editor does not own. Building the payload
         from a fixed list silently DROPPED them: a conditional rule could
         never be saved, and the first publish would strip optionsFrom off the
         Course field and break the faculty cascade for good. Placeholder and
         requiredMessage were being lost the same way. */
      if (f.showIf && f.showIf.key) clean.showIf = { key: f.showIf.key, op: f.showIf.op || "is", value: f.showIf.value || "" };
      if (f.optionsFrom) clean.optionsFrom = f.optionsFrom;
      if (f.placeholder) clean.placeholder = f.placeholder;
      if (f.requiredMessage) clean.requiredMessage = f.requiredMessage;
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
                <input className="admin-input fb-help" value={f.help || ""} onChange={e => update(f._id, { help: e.target.value })} placeholder="Helper text — shown to whoever fills the form in"/>
                {/* Not editable, and never leaves this screen. What a locked
                    field is wired to is a fact about the system, not copy for
                    a parent — these notes used to sit in `help`, which put
                    "edit these options in Admin → Settings" on the public
                    registration form for families to read. */}
                {f.adminHelp && <div className="admin-hint fb-adminhelp">🔒 {f.adminHelp}</div>}
                {f.type !== "section" && <FieldLogic field={f} above={fields.slice(0, i)} onChange={(v) => update(f._id, v)}/>}
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
const ROTATE_CHOICES = [[0, "Never"], [7, "Every week"], [30, "Every 30 days"], [90, "Every 90 days"]];
const VALID_CHOICES = [[0, "No expiry"], [1, "Today only"], [7, "1 week"], [30, "30 days"], [90, "90 days"]];
const PWEXP_CHOICES = [[0, "Never"], [7, "After 7 days"], [30, "After 30 days"], [90, "After 90 days"]];

/* Three doors, not one.
 *
 * The backend has supported all three since self-registration shipped; this
 * panel only ever created the first, which is why nobody could find the
 * online registration form — there was no way to make one. */
const GATE_KINDS = {
  desk: { label: "Staff desk", chip: "chip-navy", fallback: "Registration desk",
          blurb: "Staff register a child who is standing in front of them. A desk password lets field staff run it without an admin login." },
  self: { label: "Public sign-up", chip: "chip-lime", fallback: "Public registration link",
          blurb: "The link you send to families. No password — anyone with the link can fill it in, and nothing they submit becomes a registration until somebody checks it." },
  review: { label: "Review desk", chip: "chip-gold", fallback: "Review desk",
            blurb: "Where public submissions get checked and approved. Its own password, deliberately different from the check-in one — approving is what emails a family." },
};

function SummerGates() {
  const [gates, setGates] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [kind, setKind] = React.useState("desk");
  const [name, setName] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [autoPw, setAutoPw] = React.useState(true);
  const [rotateDays, setRotateDays] = React.useState(30);
  const [validDays, setValidDays] = React.useState(0);
  const [expiryDays, setExpiryDays] = React.useState(0);
  const [notify, setNotify] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // A generated password exists in the clear exactly once — in this response.
  // Only its hash is stored, so it is shown until dismissed and never again.
  const [reveal, setReveal] = React.useState(null);   // {gateId, name, password}
  const load = () => NGGApi.admin.registration.gates().then(r => { setGates(r.gates || []); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const create = async (e) => {
    e && e.preventDefault();
    if (!autoPw && pw && pw.trim().length < 4) { toast.error("Desk password must be at least 4 characters."); return; }
    /* A public link with a password is a staff desk somebody shared, and a
       review desk without one lets anybody wave strangers into the programme.
       The server enforces both; saying so here saves a round trip and a
       confusing error. */
    if (kind === "review" && !autoPw && pw.trim().length < 4) {
      toast.error("A review desk needs its own password — generate one or type at least 4 characters."); return;
    }
    setBusy(true);
    try {
      const label = name || GATE_KINDS[kind].fallback;
      const wantsPw = kind !== "self";
      const r = await NGGApi.admin.registration.gateCreate(label, "", wantsPw && !autoPw ? pw.trim() : "", "",
        { kind, generate: wantsPw && autoPw, rotateDays, notifyEmail: notify.trim(), validDays, expiryDays });
      setName(""); setPw(""); setNotify("");
      if (r.password) setReveal({ gateId: r.gateId, name: label, password: r.password, url: r.url });
      else toast.success(kind === "self" ? "Public registration link created — copy it from the table." : "Gate link created.");
      load();
    }
    catch (e2) { toast.error(e2.code === "weak_password" ? "Desk password is too short." : e2.code === "bad_email" ? "That notification email isn't valid." : (e2.code || e2.message)); }
    finally { setBusy(false); }
  };
  const rotateNow = async (g) => {
    if (!(await dialog.confirm({ title: "Roll this desk password?", body: "A new password is generated now and the current one stops working immediately. Anyone at the desk will need the new one.", cta: "Rotate" }))) return;
    try { const r = await NGGApi.admin.registration.gateRotate(g.gateId); setReveal({ gateId: g.gateId, name: g.name, password: r.password }); load(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const editRotation = async (g) => {
    const days = await dialog.prompt({ title: "Rotate how often?", body: "Days between automatic rotations — 0 turns it off. The new password is emailed when it rolls, so a gate with no email is only ever flagged as due, never rolled behind your back.", cta: "Save", placeholder: "30", inputType: "number", value: String(g.rotateDays || 0), required: false });
    if (days === null) return;
    const n = Math.max(0, Math.min(365, parseInt(days, 10) || 0));
    let email = g.notifyEmail || "";
    if (n > 0) {
      const got = await dialog.prompt({ title: "Where should the new password go?", body: "Emailed each time it rolls. Without an address this gate is flagged due instead of rotating, so the desk never gets locked out.", cta: "Save", placeholder: "ops@example.org", value: email, required: false });
      if (got === null) return;
      email = got.trim();
    }
    const exp = await dialog.prompt({ title: "Expire the password after how long?", body: "Days before the current desk password stops working — 0 never expires. Unlike rotation this fails CLOSED: the desk is locked until an admin issues a new one, which is the point. Setting it counts from when the password was last set, so switching it on retires an old password rather than giving it a fresh term.", cta: "Save", placeholder: "0", inputType: "number", value: String(g.expiryDays || 0), required: false });
    if (exp === null) return;
    const x = Math.max(0, Math.min(365, parseInt(exp, 10) || 0));
    try { await NGGApi.admin.registration.gateRotation(g.gateId, n, email, x); toast.success("Password policy saved."); load(); }
    catch (e) { toast.error(e.code === "bad_email" ? "That email isn't valid." : (e.code || e.message)); }
  };
  const setValidity = async (g) => {
    const v = await dialog.prompt({
      title: g.kind === "self" ? "When should sign-ups close?" : "How long should this link work?",
      body: (g.kind === "self"
        /* For a PUBLIC link this control is the close switch, so say so here
           rather than leaving an admin to discover it. Past the date the family
           does not get "invalid link" — they get a closed-intake page listing
           the centres they can walk into, which is the point. */
        ? "Days from now, or a date (YYYY-MM-DD) — a date means the end of that day. Blank or 0 means it never closes.\n\nAfter this, the link still works: families see \u201cOnline sign-up is closed\u201d and are told to register in person at their nearest centre. Nobody is told their link is broken."
        : "Days from now, or a date (YYYY-MM-DD) — a date means the end of that day. Blank or 0 means it never expires. Expiry is enforced on the desk itself, not just hidden here."),
      cta: "Save", placeholder: "e.g. 7  or  2026-08-31",
      value: g.expiresAt ? String(g.expiresAt).slice(0, 10) : "", required: false,
    });
    if (v === null) return;
    const t = v.trim();
    const opts = /^\d{1,4}$/.test(t) ? { validDays: parseInt(t, 10) } : { expiresAt: t };
    try {
      const r = await NGGApi.admin.registration.gateValidity(g.gateId, opts);
      toast.success(r.expiresAt ? ("Valid until " + fmtDate(r.expiresAt) + ".") : "Expiry removed.");
      load();
    } catch (e) { toast.error(e.code === "bad_expiry" ? "Couldn't read that as a number of days or a date." : (e.code || e.message)); }
  };
  const validityLabel = (g) => {
    if (!g.expiresAt) return "no expiry";
    if (g.expired) return "expired";
    const d = g.expiresInDays;
    return d <= 1 ? "expires today" : "in " + d + "d";
  };
  const pwExpiryLabel = (g) => {
    if (!g.hasPassword || !g.expiryDays) return "—";
    if (g.passExpired) return "EXPIRED — desk locked";
    return "dies in " + g.passExpiresInDays + "d";
  };
  const rotationLabel = (g) => {
    if (!g.hasPassword) return "—";
    if (!g.rotateDays) return "manual";
    if (g.rotationDue) return g.notifyEmail ? "due — rolls tonight" : "DUE — rotate by hand";
    return "every " + g.rotateDays + "d · in " + g.rotatesInDays + "d";
  };
  const revoke = async (id) => { if (!(await dialog.confirm({ title: "Revoke this link?", body: "Anyone using it will no longer be able to register.", cta: "Revoke" }))) return; try { await NGGApi.admin.registration.gateRevoke(id); load(); } catch (e) { toast.error(e.code || e.message); } };
  /* Delete is only offered on links that are already revoked — a revoked link
     is dead, so removing it is just clearing clutter, never cutting off anyone
     mid-use. */
  const del = async (id) => { if (!(await dialog.confirm({ title: "Delete this revoked link?", body: "It is removed for good, along with its row here. This can't be undone.", cta: "Delete" }))) return; try { await NGGApi.admin.registration.gateDelete(id); toast.success("Link deleted."); load(); } catch (e) { toast.error(e.code === "not_revoked" ? "Revoke the link before deleting it." : (e.code || e.message)); } };
  const setPassword = async (g) => {
    const next = await dialog.prompt({ title: g.hasPassword ? "Change desk password" : "Set a desk password", body: "Field staff open this desk with the password — no admin login needed. Leave blank to remove it.", cta: "Save", placeholder: "Desk password (min 4 chars)", inputType: "password", required: false });
    if (next === null) return; // cancelled
    if (next && next.trim() && next.trim().length < 4) { toast.error("Too short — use at least 4 characters."); return; }
    try { const r = await NGGApi.admin.registration.gateSetpass(g.gateId, next.trim()); toast.success(r.hasPassword ? "Desk password set." : "Desk password removed."); load(); }
    catch (e) { toast.error(e.code === "weak_password" ? "Too short." : (e.code || e.message)); }
  };
  /* The server says which door this is; the panel used to assume /gate for
     all of them, so copying a public sign-up link handed somebody the staff
     desk instead. */
  const linkFor = (g) => location.origin + (g.path || "/gate?g=") + g.gateId;
  return (
    <div>
      {/* Which door you are making, first — everything below it depends on
          the answer, and the panel used to have no way to ask. */}
      <div className="admin-pick-row" role="radiogroup" aria-label="What kind of link">
        {Object.keys(GATE_KINDS).map(k => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={"btn btn-sm " + (kind === k ? "btn-primary" : "btn-ghost")}>{GATE_KINDS[k].label}</button>
        ))}
      </div>
      <p className="admin-hint">{GATE_KINDS[kind].blurb}</p>
      {kind !== "self" && <p className="admin-hint" style={{ marginTop: -4 }}>Generated passwords are shown once and stored only as a hash. A gate set to rotate emails its new password on the day it rolls {"\u2014"} one with no email is flagged due instead, so a desk is never locked out mid-session. <b>Password expiry</b> is the opposite policy and fails closed: past its date the desk stops opening until someone issues a new password. Set both and expiry is the backstop for rotation silently not running.</p>}
      <form onSubmit={create} className="admin-filters" style={{ flexWrap: "wrap" }}>
        <input className="admin-input" placeholder={kind === "self" ? "Label (e.g. Alimosho public sign-up)" : "Label (e.g. Egbeda desk \u00b7 Sat)"} value={name} onChange={e => setName(e.target.value)} style={{ minWidth: 220 }}/>
        {/* A public link takes no password at all. Offering the control and
            then ignoring it is how somebody ends up believing a link is
            protected when it is not. */}
        {kind !== "self" && <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={autoPw} onChange={e => setAutoPw(e.target.checked)}/> Generate password
        </label>}
        {kind !== "self" && !autoPw && <input className="admin-input" type="text" autoComplete="off" placeholder={kind === "review" ? "Review desk password" : "Desk password"} value={pw} onChange={e => setPw(e.target.value)} style={{ minWidth: 170 }}/>}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>Valid for
          <select className="admin-input" value={validDays} onChange={e => setValidDays(Number(e.target.value))} style={{ minWidth: 120 }}>
            {VALID_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {kind !== "self" && <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>Password dies
          <select className="admin-input" value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))} style={{ minWidth: 130 }}>
            {PWEXP_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>}
        {kind !== "self" && <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>Rotate
          <select className="admin-input" value={rotateDays} onChange={e => setRotateDays(Number(e.target.value))} style={{ minWidth: 130 }}>
            {ROTATE_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>}
        {kind !== "self" && rotateDays > 0 && <input className="admin-input" type="email" placeholder="Email for the new password" value={notify} onChange={e => setNotify(e.target.value)} style={{ minWidth: 210 }}/>}
        {kind !== "self" && rotateDays > 0 && !notify.trim() && <span style={{ fontSize: 12, color: "#8a6d00" }}>No email → flagged due for you to rotate by hand, never rolled unattended.</span>}
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "…" : "+ Create " + GATE_KINDS[kind].label.toLowerCase()}</button>
      </form>
      {reveal && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,10,24,.6)", display: "grid", placeItems: "center", padding: 18 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 460, width: "100%" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Desk password for {reveal.name}</h3>
            <p style={{ color: "#555", fontSize: 13, lineHeight: 1.55, margin: "0 0 14px" }}>
              Copy it now {"\u2014"} only its hash is stored, so this is the one and only time it can be shown.
            </p>
            <div style={{ font: "700 26px ui-monospace, monospace", letterSpacing: 3, textAlign: "center", padding: "14px 10px", borderRadius: 12, background: "#f3f5fa", userSelect: "all" }}>{reveal.password}</div>
            {/* The address as well as the password. A password on its own is
                half of what somebody needs, and the other half was only ever
                findable by hunting the row back down in the table. */}
            {reveal.url && (
              <div className="mono" style={{ marginTop: 12, fontSize: 12.5, wordBreak: "break-all", color: "#333", padding: "10px 12px", borderRadius: 10, background: "#f3f5fa" }}>{reveal.url}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              {reveal.url && <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(reveal.url); toast.success("Link copied."); }}>Copy link</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(reveal.password); toast.success("Password copied."); }}>Copy</button>
              <button className="btn btn-primary btn-sm" onClick={() => setReveal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        gates === null ? <div className="dash-spinner"/> :
        gates.length === 0 ? <div className="admin-empty">No links yet. A <b>public sign-up</b> link is the one you send to families; a <b>review desk</b> is where what they send comes in to be checked.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Label</th><th>Kind</th><th>Link</th><th>Kiosk</th><th>Valid</th><th>Password</th><th>Rotation</th><th>Used</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {gates.map(g => (
              <tr key={g.gateId}>
                <td><b>{g.name}</b><div className="mono admin-cell-sub">{fmtDate(g.createdAt)}</div></td>
                {/* Which door. Three links that look identical in a table is
                    how a public sign-up URL gets sent to a WhatsApp group
                    believing it is the staff desk, or the other way round. */}
                <td><span className={"chip " + (GATE_KINDS[g.kind] || GATE_KINDS.desk).chip}>{(GATE_KINDS[g.kind] || GATE_KINDS.desk).label}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(linkFor(g)); toast.success("Link copied."); }}>Copy link</button>
                  <a className="btn btn-ghost btn-sm" href={linkFor(g)} target="_blank" rel="noreferrer">Open</a>
                  <div className="mono admin-cell-sub" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{(g.path || "/gate?g=") + g.gateId}</div>
                </td>
                <td>{g.hasPassword ? <span className="chip chip-lime">🔑 password</span> : <span className="chip status-archived">admin only</span>}</td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {g.expired
                    ? <span className="chip" style={{ background: "#ffe4e4", color: "#a11" }}>expired</span>
                    : validityLabel(g)}
                </td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {g.passExpired
                    ? <span className="chip" style={{ background: "#ffe4e4", color: "#a11" }}>{pwExpiryLabel(g)}</span>
                    : pwExpiryLabel(g)}
                </td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {g.rotationDue && !g.notifyEmail
                    ? <span className="chip" style={{ background: "#ffe4e4", color: "#a11" }}>{rotationLabel(g)}</span>
                    : rotationLabel(g)}
                  {g.notifyEmail && <div className="admin-cell-sub">→ {g.notifyEmail}</div>}
                </td>
                <td className="mono">{g.usedCount || 0}</td>
                <td>{g.status !== "active" ? <span className="chip status-archived">{g.status}</span>
                  : g.expired ? <span className="chip status-archived">expired</span>
                  : <span className="chip chip-lime">active</span>}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{g.status === "active" && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPassword(g)}>{g.hasPassword ? "Password" : "Set password"}</button>
                  {g.hasPassword && <button className="btn btn-ghost btn-sm" onClick={() => rotateNow(g)}>Rotate</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setValidity(g)}>Validity</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => editRotation(g)}>Schedule</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => revoke(g.gateId)}>Revoke</button>
                </>}{g.status === "revoked" &&
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--coral, #c0341a)" }} onClick={() => del(g.gateId)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}
    </div>
  );
}

/* ── Pending sign-ups — parent-verification queue with resend ─────────────── */
/* Registrations — the screen for chasing parents who have not consented yet.
 *
 * It used to render every registration in the cohort, newest first, with no
 * search: finding one child meant scrolling, and anyone outside the newest 500
 * could not be found at all, so their link could never be resent. Search,
 * filter and paging are all server-side now, because across a hundred centres
 * the cohort is far too large to ship to a browser and filter there. */
/* One family whose ID was issued and never delivered, with the field that fixes
 * it and a send in the same press.
 *
 * Two calls rather than one new endpoint: the student writer already validates an
 * email and a phone, and a second path that wrote contacts would be a second
 * place for that validation to drift. The send is the existing resend, so the
 * message, the QR and the audit line are identical to every other ID that goes
 * out — a family reached late should not receive a different email.
 */
function LostContactRow({ u, onDone }) {
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ready = /.+@.+\..+/.test(email.trim()) || phone.trim().length >= 7;

  const saveAndSend = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const data = {};
      if (email.trim()) data.parentEmail = email.trim();
      if (phone.trim()) data.guardianPhone = phone.trim();
      await NGGApi.admin.summer.studentUpdate(u.studentId, data);
      const res = await NGGApi.admin.registration.resendId("student", u.studentId, "");
      const ch = res.channels || [];
      /* If the contact saved but nothing went out, say exactly that. "Saved" on
         its own would read as delivered, and this is the one row on the screen
         where delivery is the whole point. */
      if (ch.length) toast.success(u.fullName + " — sent by " + ch.join(" + "));
      else toast.error("Contact saved, but nothing could be sent. Check the address.");
      if (onDone) onDone();
    } catch (e) {
      toast.error(e.code === "bad_email" ? "That email address is not valid."
        : e.code === "no_id" ? "No ID issued for this child yet."
        : (e.code || e.message));
    } finally { setBusy(false); }
  };

  return (
    <tr>
      <td><b>{u.fullName}</b>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{u.studentId}{u.centre ? " · " + u.centre : ""}</div></td>
      <td style={{ fontSize: 12.5 }}>{u.guardianName || <span style={{ color: "var(--ink-400)" }}>not recorded</span>}</td>
      <td><input className="admin-input" style={{ width: "100%", minWidth: 170 }} value={email} type="email"
        placeholder="guardian@example.com" onChange={e => setEmail(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") saveAndSend(); }} aria-label={"Email for " + u.fullName}/></td>
      <td><input className="admin-input" style={{ width: "100%", minWidth: 130 }} value={phone}
        placeholder="0803…" onChange={e => setPhone(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") saveAndSend(); }} aria-label={"Phone for " + u.fullName}/></td>
      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
        <button className="btn btn-primary btn-sm" disabled={!ready || busy} onClick={saveAndSend}>
          {busy ? "Sending…" : "Save & send"}
        </button>
      </td>
    </tr>
  );
}

/* Render the check-in QR to a PNG so a resent email can embed it — the same
 * encoder the ID cards use. Returns "" if the encoder cannot load, and the email
 * then carries the link alone rather than failing.
 *
 * Module scope, because the pending queue and the roster both need it. It lived
 * inside the pending panel, so the roster — where staff actually look a child up
 * when a parent phones to say the ID never arrived — had no way to resend at all. */
async function adminQrPngData(token) {
  try {
    const lib = await ensureQREncoder(); if (!lib) return "";
    const qr = lib(0, "M"); qr.addData((location.origin || "") + "/q/" + String(token)); qr.make();
    const n = qr.getModuleCount(), cell = 8, margin = 16, size = n * cell + margin * 2;
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
    ctx.save(); ctx.translate(margin, margin); qr.renderTo2dContext(ctx, cell); ctx.restore();
    return cv.toDataURL("image/png");
  } catch (_) { return ""; }
}

/** Resend one student's ID + QR. `setBusy` is the caller's row-level spinner. */
async function adminResendStudentId(r, setBusy) {
  if (!(await dialog.confirm({
    title: "Resend " + (r.fullName || "this student") + "'s ID?",
    body: "Emails the digital ID and the scannable QR to the parent, and texts a link by SMS if a number is on file.",
    cta: "Send",
  }))) return;
  if (setBusy) setBusy(r.studentId);
  try {
    const qrPng = r.token ? await adminQrPngData(r.token) : "";
    const res = await NGGApi.admin.registration.resendId("student", r.studentId, qrPng);
    const ch = res.channels || [];
    toast.success(ch.length ? "Sent by " + ch.join(" + ") + (res.qr ? " (with QR)" : "") : "No email or phone on file — nothing sent.");
  } catch (e) {
    toast.error(e.code === "no_id" ? "No ID issued yet — that needs consent first." : (e.code || e.message));
  } finally { if (setBusy) setBusy(""); }
}

function SummerPending({ onChange }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  // Opens on the queue that this screen exists for, not on everything.
  const [status, setStatus] = React.useState("parent_pending");
  const [q, setQ] = React.useState("");
  const [centre, setCentre] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [centres, setCentres] = React.useState([]);
  const [bulk, setBulk] = React.useState(false);
  /* Recording a consent a family gave off-line. `sheet` holds either one child
     or a ticked selection — the same form either way, because it is the same act
     and a second dialog for the plural case would drift from the singular one. */
  const [ticked, setTicked] = React.useState(() => new Set());
  const [sheet, setSheet] = React.useState(null);   // { rows: [] }
  const [gaps, setGaps] = React.useState(null);     // verified families with no hosted QR
  const [showLost, setShowLost] = React.useState(false);

  const load = React.useCallback(() => NGGApi.admin.registration
    .list({ q: q.trim(), status, centre, page })
    .then(r => { setData(r); setErr(""); })
    .catch(e => setErr(e.code || e.message)), [q, status, centre, page]);

  // Debounced: a search box that fires per keystroke is a query per keystroke
  // against the whole cohort.
  React.useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  React.useEffect(() => { NGGApi.admin.registration.centres().then(r => setCentres(r.centres || [])).catch(() => {}); }, []);
  /* Only read when the verified tab is open. It walks the cohort's QR cache on
     disk, which is cheap but not free, and nobody on the pending tab is asking. */
  const loadGaps = React.useCallback(() => {
    NGGApi.admin.registration.qrGaps().then(setGaps).catch(() => setGaps(null));
  }, []);
  React.useEffect(() => { if (status === "verified") loadGaps(); }, [status, loadGaps]);
  React.useEffect(() => { setPage(1); }, [q, status, centre]);
  /* A tick means "this child, whose form I am holding". Carrying ticks across a
     filter change would let a selection made on one page be recorded against
     children the admin never looked at. */
  React.useEffect(() => { setTicked(new Set()); }, [q, status, centre, page]);

  const remind = async (id) => {
    setBusy(id);
    try { const r = await NGGApi.admin.registration.remind(id); toast.success(r.channels && r.channels.length ? "Reminder sent by " + r.channels.join(" + ") : "Reminder queued."); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };

  const remindAll = async () => {
    const where = centre ? " at " + centre : " across every centre";
    if (!(await dialog.confirm({
      title: "Resend to everyone still waiting?",
      body: "Sends the consent link to every parent" + where + " who is still awaiting verification and has not been reminded in the last 24 hours. Up to 100 at a time.",
      cta: "Send reminders",
    }))) return;
    setBulk(true);
    try {
      const r = await NGGApi.admin.registration.remindBulk({ centre, quietDays: 1, limit: 100 });
      toast.success(r.queued ? r.queued + " reminder" + (r.queued === 1 ? "" : "s") + " on the way." : (r.note || "Nobody to remind."));
      setTimeout(load, 800);
    } catch (e) { toast.error(e.code || e.message); } finally { setBulk(false); }
  };

  const resendId = (r) => adminResendStudentId(r, setBusy);

  /* Resend in bulk. `missing_qr` is the repair pass — only the families whose
     token has no hosted QR image — and `all` is every verified student, which is
     wasteful by design and occasionally what you want after changing the email. */
  const resendBulk = async (scope) => {
    const n = scope === "missing_qr" ? (gaps && gaps.missingQr) || 0 : (counts.verified || 0);
    if (!(await dialog.confirm({
      title: scope === "missing_qr" ? "Send the QR to " + n + " families?" : "Resend the ID to all " + n + " verified?",
      body: scope === "missing_qr"
        ? "These families received their ID email before it carried a scannable code. This sends it again, with the QR."
        : "Emails every verified student's ID and QR again, including families who already have it.",
      cta: "Send",
    }))) return;
    setBulk(true);
    try {
      const r = await NGGApi.admin.registration.resendIdBulk(scope, centre);
      toast.success(r.queued
        ? r.queued + " on the way" + (r.remaining ? " · " + r.remaining + " left, run it again" : "")
        : (r.note || "Nothing to send."));
      setTimeout(() => { loadGaps(); load(); }, 900);
    } catch (e) { toast.error(e.code || e.message); } finally { setBulk(false); }
  };

  if (err) return <ErrorState title="Couldn't load" code={err} onRetry={load}/>;
  const rows = (data && data.registrations) || [];
  const pendingRows = rows.filter(r => r.regStatus === "parent_pending");
  const tickedRows = pendingRows.filter(r => ticked.has(r.studentId));
  const counts = (data && data.counts) || {};
  const total = (data && data.total) || 0;
  const pageSize = (data && data.pageSize) || 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const badge = (st) => st === "verified" ? <span className="chip chip-lime">verified</span> : st === "parent_pending" ? <span className="chip status-draft">awaiting parent</span> : <span className="chip">{st}</span>;
  const TABS = [
    ["parent_pending", "Awaiting parent", counts.parent_pending || 0],
    ["verified", "Verified", counts.verified || 0],
    ["all", "All", (data && data.cohortTotal) || 0],
  ];

  return (
    <div>
      <div className="admin-tabs" style={{ marginBottom: 10 }}>
        {TABS.map(([v, label, n]) => (
          <button key={v} className={"admin-tab" + (status === v ? " is-active" : "")} onClick={() => setStatus(v)}>
            {label}{n ? " · " + n : ""}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {/* The caller is the PARENT, so their number and email are searchable
            too — matching only the child's name is what made this painful. */}
        <input className="admin-input" style={{ flex: "1 1 260px", minWidth: 0 }} value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search name, ID, parent phone or email…" aria-label="Search registrations"/>
        <select className="admin-select" style={{ flex: "0 1 180px" }} value={centre} onChange={e => setCentre(e.target.value)} aria-label="Centre">
          <option value="">Every centre</option>
          {centres.map(c => <option key={c.centreId || c.name} value={c.name}>{c.name}</option>)}
        </select>
        {status === "parent_pending" && (
          <button className="btn btn-primary btn-sm" onClick={remindAll} disabled={bulk || !(counts.parent_pending)}>
            {bulk ? "Sending…" : "Resend to all waiting"}
          </button>
        )}
        {/* The whole queue at once — for a programme that collected consent on
            paper at intake and has four hundred waiting that a stack-at-a-time
            interface will never clear. The sheet still asks how it was given and
            which permissions, and each child still keeps their own guardian. */}
        {status === "parent_pending" && (counts.parent_pending || 0) > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSheet({ scope: "all_pending", count: counts.parent_pending, centre, rows: pendingRows.slice(0, 1) })}>
            Record consent for all {counts.parent_pending}{centre ? " at " + centre : ""}
          </button>
        )}
      </div>

      {/* The families holding an ID email with no scannable code.
          Nothing on any screen said who they were, so nobody could fix it: the
          roster showed a token and the email had gone out, which looks finished.
          The count is read before anything is sent — a bulk action whose size you
          cannot see before pressing it is one people press once and never again. */}
      {status === "verified" && gaps && gaps.missingQr > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10,
                      background: "rgba(76,111,255,.08)", border: "1px solid rgba(76,111,255,.35)",
                      borderRadius: 12, padding: "10px 14px" }}>
          <b style={{ fontSize: 13.5 }}>{gaps.missingQr} verified {gaps.missingQr === 1 ? "family has" : "families have"} an ID email with no scannable QR</b>
          <button className="btn btn-primary btn-sm" disabled={bulk}
            onClick={() => resendBulk("missing_qr")}>
            {bulk ? "Sending…" : "Send the QR to those " + gaps.missingQr}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={bulk} onClick={() => resendBulk("all")}>
            Resend to all verified
          </button>
        </div>
      )}

      {/* THE FAMILIES THE ID NEVER REACHED, and a place to fix it.
          No email and no phone on the record — usually a row that predates the
          form asking for either, or a desk that skipped it. Sending harder does
          nothing for them; the only fix is a contact. Counting them told an admin
          a number without telling them whose, which is not a task anybody can
          finish, so they are listed here with the field that fixes them. */}
      {status === "verified" && gaps && gaps.unreachable > 0 && (
        <div style={{ marginBottom: 10, background: "rgba(245,176,38,.12)",
                      border: "1px solid rgba(245,176,38,.45)", borderRadius: 12, padding: "10px 14px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13.5 }}>
              {gaps.unreachable} verified {gaps.unreachable === 1 ? "family has" : "families have"} no email or phone on file
            </b>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLost(v => !v)}>
              {showLost ? "Hide" : "Show and fix"}
            </button>
            <span className="admin-hint" style={{ margin: 0 }}>
              Their ID was issued but never delivered. Add a contact and it sends immediately.
            </span>
          </div>
          {showLost && (
            <div className="admin-table-wrap" style={{ marginTop: 10 }}>
              <table className="admin-table">
                <thead><tr><th>Student</th><th>Guardian</th><th>Email</th><th>Phone</th><th></th></tr></thead>
                <tbody>
                  {(gaps.unreachableList || []).map(u => <LostContactRow key={u.studentId} u={u}
                    onDone={() => { loadGaps(); load(); }}/>)}
                </tbody>
              </table>
              {gaps.unreachable > (gaps.unreachableList || []).length && (
                <p className="admin-hint" style={{ margin: "8px 0 0" }}>
                  Showing the first {(gaps.unreachableList || []).length}. Fix these and the rest appear.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* The bulk bar, and it only appears once rows are TICKED.
          There is no "record consent for all 40 pending" button, and the absence
          is the design: a stack of twenty signed forms on the desk is a real
          thing, and forty children nobody has looked at is not. */}
      {tickedRows.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10,
                      background: "rgba(255,206,84,.14)", border: "1px solid rgba(245,176,38,.45)",
                      borderRadius: 12, padding: "10px 14px" }}>
          <b style={{ fontSize: 13.5 }}>{tickedRows.length} selected</b>
          <button className="btn btn-primary btn-sm" onClick={() => setSheet({ rows: tickedRows })}>
            Record consent for {tickedRows.length}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setTicked(new Set())}>Clear</button>
          <span className="admin-hint" style={{ margin: 0 }}>
            One method and one set of permissions across the selection — each child keeps their own guardian's name.
          </span>
        </div>
      )}

      {data === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? (
          <div className="admin-empty">
            {q ? "Nothing matches “" + q + "”." : status === "parent_pending" ? "Nobody is waiting on a parent. 🎉" : "No registrations yet — share a gate link to start."}
          </div>
        ) : (
        <>
        <p className="admin-hint" style={{ margin: "0 0 8px" }}>
          Showing {rows.length} of {total}{centre ? " at " + centre : ""}. Consent + QR bind happen automatically when the parent confirms.
        </p>
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr>
            {status === "parent_pending" && <th style={{ width: 30 }}>
              <input type="checkbox" aria-label="Select every row on this page"
                checked={pendingRows.length > 0 && ticked.size === pendingRows.length}
                onChange={() => setTicked(t => t.size === pendingRows.length ? new Set() : new Set(pendingRows.map(x => x.studentId)))}/>
            </th>}
            <th>Student</th><th>Centre</th><th>Parent contact</th><th>Waiting</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.studentId} style={ticked.has(r.studentId) ? { background: "rgba(255,206,84,.12)" } : undefined}>
                {status === "parent_pending" && <td>
                  {r.regStatus === "parent_pending" && (
                    <input type="checkbox" checked={ticked.has(r.studentId)}
                      aria-label={"Select " + r.fullName}
                      onChange={() => setTicked(t => { const n = new Set(t); if (n.has(r.studentId)) n.delete(r.studentId); else n.add(r.studentId); return n; })}/>
                  )}
                </td>}
                <td><b>{r.fullName}</b><div className="mono admin-cell-sub">{r.studentId}{r.track ? " · " + r.track : ""}</div>
                  {/* The birthday, and whether there is one. A row with only an
                      age is a row whose age is wrong next season, and this is
                      where you can see which rows those are. */}
                  <div className="mono admin-cell-sub">
                    {r.dob ? r.dob + " · " + adminDobAge(r.dob) + "y"
                      : r.age ? r.age + "y · no date of birth"
                      : "no age on file"}
                  </div></td>
                <td className="mono" style={{ fontSize: 12 }}>{r.centre || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{r.parentEmail || r.guardianPhone || "—"}</td>
                {/* How long they have waited and when they were last chased —
                    without it, staff either re-send to the same family twice or
                    miss the one who has been waiting a fortnight. */}
                <td style={{ fontSize: 12 }}>
                  {r.regStatus === "parent_pending" ? (
                    <>
                      <span style={{ fontWeight: 700, color: r.waitingDays >= 7 ? "#b3001b" : r.waitingDays >= 3 ? "#8a5a00" : "inherit" }}>
                        {r.waitingDays === 0 ? "today" : r.waitingDays + "d"}
                      </span>
                      <div className="mono admin-cell-sub">
                        {r.remindedDaysAgo == null ? "never reminded"
                          : r.remindedDaysAgo === 0 ? "reminded today" : "reminded " + r.remindedDaysAgo + "d ago"}
                      </div>
                    </>
                  ) : "—"}
                </td>
                <td>{badge(r.regStatus)}</td>
                <td style={{ textAlign: "right" }}>
                  {r.regStatus === "parent_pending" && <button className="btn btn-ghost btn-sm" disabled={busy === r.studentId} onClick={() => remind(r.studentId)}>{busy === r.studentId ? "…" : "Resend link"}</button>}
                  {/* The way out for a family the link will never reach: no email
                      address, a phone that cannot open it, or a paper form filled
                      in at the centre while the child stood there. Those children
                      used to stay pending forever and never got an ID. */}
                  {r.regStatus === "parent_pending" && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }}
                    onClick={() => setSheet({ rows: [r] })}>Record consent</button>}
                  {r.regStatus === "verified" && r.token && <button className="btn btn-ghost btn-sm" disabled={busy === r.studentId} onClick={() => resendId(r)}>{busy === r.studentId ? "…" : "Resend ID + QR"}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {pages > 1 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Back</button>
            <span className="mono" style={{ fontSize: 12 }}>Page {page} of {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
        </>
      )}

      {sheet && <ConsentRecorder rows={sheet.rows} scope={sheet.scope} scopeCount={sheet.count} scopeCentre={sheet.centre}
        onClose={() => setSheet(null)}
        onDone={() => { setSheet(null); setTicked(new Set()); load(); if (onChange) onChange(); }}/>}
    </div>
  );
}

/* ── Recording a consent a family gave off-line ────────────────────────────────
 *
 * A desk registration waits for a parent to click a link, and most do. The ones
 * who do not are not edge cases — a guardian with no email address, a phone that
 * cannot open the link, a paper form filled in at the centre — and until now
 * those children stayed pending forever and never got an ID.
 *
 * This is deliberately NOT a "mark verified" button. A consent has content: which
 * permissions were granted, who gave them, and how. A switch that skipped all
 * three would turn the consent ledger into a field that says "yes" and destroy
 * the only record the programme has that anybody agreed to anything. So the form
 * asks the same questions the parent link asks, in the same order, and the
 * server enforces the same rules.
 */
function ConsentRecorder({ rows, scope, scopeCount, scopeCentre, onClose, onDone }) {
  const sweep = scope === "all_pending";
  const list = rows || [];
  const many = sweep || list.length > 1;
  const count = sweep ? (scopeCount || 0) : list.length;
  const [meta, setMeta] = React.useState(null);      // types + methods, from the server
  const [method, setMethod] = React.useState("paper");
  const [guardian, setGuardian] = React.useState(list[0] ? (list[0].guardianName || "") : "");
  const [answers, setAnswers] = React.useState({});
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);

  /* The permission list comes from the server, not from a copy in here. The
     parent-facing form, this form and the ledger have to agree about what a
     consent consists of, and three hard-coded lists would drift. */
  React.useEffect(() => {
    /* The permission list is the same whichever child it is fetched for — the
       sweep has no single child, so it borrows the first pending row's. */
    const probe = list[0] && list[0].studentId;
    (probe ? NGGApi.admin.registration.consents(probe) : Promise.resolve({ types: [], methods: [] }))
      .then(r => {
        setMeta(r);
        // Required permissions default to granted; the free choices start UNSET
        // so somebody has to record what the family actually said.
        const seed = {};
        (r.types || []).forEach(t => { if (t.required) seed[t.type] = true; });
        setAnswers(seed);
        if (!many && r.student && r.student.guardianName) setGuardian(r.student.guardianName);
      })
      .catch(() => setMeta({ types: [], methods: [] }));
  }, []);

  const types = (meta && meta.types) || [];
  const methods = (meta && meta.methods) || [];
  // Every free choice has to be answered either way — the same rule the parent
  // link enforces, because a family who says no to photographs has said no.
  const unanswered = types.filter(t => t.mustAnswer && answers[t.type] === undefined);
  const missingRequired = types.filter(t => t.required && !answers[t.type]);
  const ready = types.length > 0 && !unanswered.length && !missingRequired.length
    && (many || guardian.trim().length >= 3);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const consents = {};
      types.forEach(t => { consents[t.type] = !!answers[t.type]; });
      if (many) {
        const r = await NGGApi.admin.registration.consentBulk(sweep
          ? { scope: "all_pending", centre: scopeCentre || "", method, consents, note }
          : { studentIds: list.map(x => x.studentId), method, consents, note });
        setResult(r);
        /* Not a toast-and-close: a partial result has to be READ. Some children
           will have no guardian on file and those were skipped, and a sweep of a
           queue longer than one batch leaves a remainder — closing over either
           would leave somebody believing the queue was cleared. */
        if (!(r.skipped || []).length && !r.remaining) { toast.success(r.recorded.length + " recorded."); onDone(); }
      } else {
        const r = await NGGApi.admin.registration.consentRecord({
          studentId: list[0].studentId, method, guardianName: guardian.trim(), consents, note,
        });
        toast.success(r.idIssued ? "Consent recorded — ID issued." : "Consent recorded.");
        onDone();
      }
    } catch (e) {
      const map = {
        method_required: "Choose how the consent was given.",
        guardian_name_required: "Whose consent is this? Give the guardian's name as it appears on the form.",
        consents_incomplete: "Some permissions are unanswered — every one has to be recorded either way.",
        use_review_desk: "That is a public sign-up awaiting review. Open the review desk instead, where the photo and the submitted answers are side by side.",
        not_pending: "That registration is not awaiting a parent any more — reload the list.",
        too_many: "Too many at once. Select a smaller batch.",
      };
      toast.error(map[e.code] || e.code || e.message);
    } finally { setBusy(false); }
  };

  const Row = ({ children }) => <div style={{ marginBottom: 14 }}>{children}</div>;

  return (
    <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,10,24,.6)", display: "grid",
               placeItems: "center", padding: 18, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 560, width: "100%",
                    maxHeight: "92vh", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 19 }}>
          {sweep ? "Record consent for everyone waiting"
            : many ? "Record consent for " + count + " children" : "Record consent"}
        </h3>
        <p className="admin-hint" style={{ marginTop: 0 }}>
          {sweep
            ? <>All <b>{count}</b> registration{count === 1 ? "" : "s"} still awaiting a parent{scopeCentre ? <> at <b>{scopeCentre}</b></> : null}. One method and one set of permissions across all of them; each child keeps their own guardian's name from their record, and a child with no guardian on file is skipped and listed rather than recorded against somebody else.</>
            : many
            ? "One method and one set of permissions across the selection. Each child keeps their own guardian's name from their record — a child with no guardian on file is skipped rather than recorded against somebody else."
            : <>For <b>{list[0].fullName}</b> · {list[0].studentId}. Use this when the family gave consent off-line and the emailed link will never reach them.</>}
        </p>

        {result ? (
          /* The partial result. A bulk that half-worked is the case worth
             designing for; a toast saying "done" over eleven of twenty is how
             nine children silently stay pending. */
          <div>
            <p style={{ fontSize: 14, margin: "0 0 8px" }}>
              <b>{(result.recorded || []).length} recorded.</b>
              {(result.skipped || []).length ? <> {(result.skipped || []).length} skipped.</> : null}
              {result.remaining ? <> <b>{result.remaining} still waiting</b> — run it again to take the next batch.</> : null}
            </p>
            {(result.skipped || []).length > 0 && (
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--line-cool-soft,#e6e9f0)", borderRadius: 10, padding: 10, marginBottom: 12 }}>
                {result.skipped.map((x, i) => (
                  <div key={i} style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    <b>{x.name || x.studentId}</b> — {{
                      no_guardian_on_file: "no guardian on the record, so there is nobody to record as having consented. Add the guardian first.",
                      already_verified: "already verified.",
                      use_review_desk: "a public sign-up — use the review desk.",
                      not_pending: "not awaiting a parent.",
                      not_found: "no such record.",
                    }[x.reason] || x.reason}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-primary btn-sm" onClick={onDone}>Done</button>
            </div>
          </div>
        ) : !meta ? <div className="dash-spinner"/> : (
        <>
          <Row>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#333" }}>How was it given?</label>
            <select className="admin-select" style={{ width: "100%" }} value={method} onChange={e => setMethod(e.target.value)}>
              {methods.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            {/* Why the method is a field and not an assumption: a safeguarding
                review has to be able to tell a signed form from a click, and a
                ledger that flattens the two is worse than one with gaps in it. */}
            <p className="admin-hint" style={{ margin: "4px 0 0" }}>
              Stored on the consent record, and kept distinct from a parent clicking the emailed link. Your name is recorded as the staff member who took it.
            </p>
          </Row>

          {!many && (
            <Row>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#333" }}>Guardian's name, as given</label>
              <input className="admin-input" style={{ width: "100%" }} value={guardian}
                onChange={e => setGuardian(e.target.value)} placeholder="e.g. Mrs Folake Eze"/>
              <p className="admin-hint" style={{ margin: "4px 0 0" }}>
                The person who consented — not your name. You are the witness, they are the guardian.
              </p>
            </Row>
          )}

          <Row>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: "#333" }}>What they agreed to</label>
              {/* One click for the common case, which is a paper form with
                  everything ticked. It is an affirmative act by the person who is
                  holding that form — which is exactly the standard the free
                  choices have to meet — so it is a shortcut through the clicking,
                  not through the rule. What it is NOT is a default: an unopened
                  form still submits nothing. */}
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}
                onClick={() => { const a = {}; types.forEach(t => { a[t.type] = true; }); setAnswers(a); }}>
                Grant everything
              </button>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => { const a = {}; types.forEach(t => { a[t.type] = !!t.required; }); setAnswers(a); }}>
                Required only
              </button>
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              {types.map(t => (
                <div key={t.type} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                       padding: "8px 10px", borderRadius: 9,
                       border: "1px solid " + ((t.mustAnswer && answers[t.type] === undefined) ? "rgba(245,176,38,.6)" : "var(--line-cool-soft,#e6e9f0)") }}>
                  <span style={{ flex: "1 1 170px", fontSize: 13.5 }}>
                    {t.label}
                    {t.required && <span className="admin-hint" style={{ marginLeft: 6 }}>required</span>}
                  </span>
                  {t.required ? (
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" checked={!!answers[t.type]}
                        onChange={e => setAnswers(a => Object.assign({}, a, { [t.type]: e.target.checked }))}/>
                      Granted
                    </label>
                  ) : (
                    /* Yes AND no, both explicit. A single tickbox left unticked
                       cannot tell "they said no" from "nobody asked", and those
                       are different records. */
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      {[["Yes", true], ["No", false]].map(([label, val]) => (
                        <button key={label} type="button"
                          onClick={() => setAnswers(a => Object.assign({}, a, { [t.type]: val }))}
                          className={"btn btn-sm " + (answers[t.type] === val ? "btn-primary" : "btn-ghost")}>{label}</button>
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {unanswered.length > 0 && (
              <p className="admin-hint" style={{ margin: "6px 0 0", color: "#8a5a00" }}>
                {unanswered.length} still unanswered. These are free choices — refusing must never cost a child their place, so they are recorded either way rather than defaulted.
                {" "}If the form in your hand has them all ticked, use <b>Grant everything</b>.
              </p>
            )}
          </Row>

          <Row>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#333" }}>Note (optional)</label>
            <input className="admin-input" style={{ width: "100%" }} value={note} maxLength={300}
              onChange={e => setNote(e.target.value)} placeholder="e.g. Form collected at the Saturday desk, filed in the Egbeda folder"/>
          </Row>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={!ready || busy}>
              {busy ? "Recording…" : many ? "Record for " + count : "Record consent"}
            </button>
          </div>
        </>
        )}
      </div>
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
  const BLANK_ENROL = { fullName: "", dob: "", age: 12, centre: "Egbeda", track: "", guardianName: "", guardianPhone: "", token: "", photoUrl: "" };
  const [d, setD] = React.useState(BLANK_ENROL);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await NGGApi.admin.summer.enroll(d);
      setDone(r); setD(BLANK_ENROL);
      toast.success("Enrolled " + r.studentId); onDone();
    } catch (e) {
      const map = { no_qr_available: "No blank QR cards left — mint a batch in the QR cards tab first.", qr_already_used: "That QR card is already assigned.", qr_not_found: "QR token not found.",
        bad_dob: "That date of birth puts the child outside the programme's 5–19 range — check the year.",
        bad_age: "Age must be between 5 and 19 — or give a date of birth and we'll work it out." };
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
        {/* Date of birth first, and the age it implies shown live beside it.
            This form only ever took a typed age and never stored a birthday, so
            a child enrolled here had no date while a child who registered
            themselves did — and an age is right for exactly one season.
            The age box stays because a desk sometimes genuinely only has an age
            (a parent on the phone, a paper list from a school), but the date
            wins whenever it is given. */}
        <div className="admin-fields-row">
          <Field label="Date of birth" value={d.dob} onChange={v => set("dob", v)} type="date"/>
          <Field label={d.dob ? "Age (from the date)" : "Age"} value={d.dob ? String(adminDobAge(d.dob)) : d.age}
            onChange={v => set("age", v)} type="number" disabled={!!d.dob}/>
          <FieldCentre value={d.centre} onChange={v => set("centre", v)}/>
        </div>
        <div className="admin-fields-row">
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
        </table>
        {shown.length > 400 && <p className="admin-hint" style={{ marginTop: 10 }}>Showing the first 400 of {shown.length} matching cards — refine the search to narrow the list.</p>}
        </div>
      }
    </div>
  );
}

/* ── Parental consent record ─────────────────────────────────────────────────
   The signed record, on screen and as a document for the physical file.

   Printing goes through a hidden iframe rather than a new window: a popup
   blocker silently eats window.open, and the operator gets nothing and no
   error. The iframe always works, and the browser's own print dialog offers
   "Save as PDF", which is what "download for professional print" means here
   without shipping a PDF engine for one page. The stylesheet is A4 with real
   margins, so it comes out as a filed document rather than a screenshot. */
const CONSENT_STATUS_LABEL = { granted: "Granted", declined: "Declined", not_recorded: "Not recorded" };

function consentDocumentHtml(c) {
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const day = (v) => (v ? String(v).slice(0, 10) : "—");
  const s = c.student || {}, gd = c.guardian || {}, reg = c.registration || {}, prog = c.programme || {};
  const rows = (c.items || []).map(i => `
    <tr class="${i.status === "granted" ? "ok" : i.status === "declined" ? "no" : "na"}">
      <td>${esc(i.label)}${i.required ? ' <span class="req">required</span>' : ""}</td>
      <td class="st">${esc(CONSENT_STATUS_LABEL[i.status] || i.status)}</td>
      <td>${esc(i.actorName) || "—"}</td>
      <td class="mono">${day(i.recordedAt)}</td>
    </tr>`).join("");
  // Custom form answers, minus the ones already shown above.
  const skip = { fullName: 1, age: 1, centre: 1, course: 1, faculty: 1, parentName: 1, parentPhone: 1, parentEmail: 1 };
  const extra = Object.keys(reg.answers || {}).filter(k => !skip[k] && reg.answers[k] !== "" && reg.answers[k] != null);
  const extraRows = extra.map(k => `<tr><th>${esc(k)}</th><td>${esc(Array.isArray(reg.answers[k]) ? reg.answers[k].join(", ") : reg.answers[k])}</td></tr>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Consent — ${esc(s.fullName)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 12pt/1.5 Georgia, "Times New Roman", serif; color: #14181f; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5pt solid #0c1432; padding-bottom: 9pt; }
  .org { font: 700 16pt/1.15 "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.4pt; color: #0c1432; }
  .sub { font: 8.5pt/1.3 "Helvetica Neue", Arial, sans-serif; letter-spacing: 1.6pt; text-transform: uppercase; color: #5a6488; margin-top: 3pt; }
  h1 { font: 700 13pt/1.2 "Helvetica Neue", Arial, sans-serif; margin: 16pt 0 3pt; }
  .lede { font-size: 10pt; color: #47506e; margin: 0 0 14pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14pt; }
  th, td { text-align: left; padding: 5pt 7pt; border-bottom: 0.5pt solid #d7dbe6; vertical-align: top; font-size: 10.5pt; }
  .kv th { width: 32%; font: 600 9.5pt/1.4 "Helvetica Neue", Arial, sans-serif; color: #5a6488; text-transform: uppercase; letter-spacing: 0.6pt; }
  thead th { border-bottom: 1pt solid #0c1432; font: 700 9pt/1.4 "Helvetica Neue", Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.8pt; }
  .st { font-weight: 700; white-space: nowrap; }
  tr.ok .st { color: #1f7a3d; } tr.no .st { color: #b3261e; } tr.na .st { color: #8a90a2; }
  .req { font: 700 7.5pt/1 "Helvetica Neue", Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.7pt; color: #b3261e; }
  .mono { font-family: "SFMono-Regular", Consolas, monospace; font-size: 9.5pt; }
  .banner { padding: 8pt 11pt; border-radius: 3pt; font: 600 10pt "Helvetica Neue", Arial, sans-serif; margin-bottom: 14pt; }
  .banner.ok { background: #e8f5ec; border: 0.5pt solid #1f7a3d; color: #14532d; }
  .banner.no { background: #fdecea; border: 0.5pt solid #b3261e; color: #7f1d1d; }
  .sign { margin-top: 26pt; display: flex; gap: 26pt; }
  .sign div { flex: 1; border-top: 0.5pt solid #14181f; padding-top: 4pt; font: 8.5pt "Helvetica Neue", Arial, sans-serif; color: #5a6488; }
  footer { margin-top: 20pt; border-top: 0.5pt solid #d7dbe6; padding-top: 6pt; font-size: 8pt; color: #6b7280; }
  @media print { .noprint { display: none !important; } }
</style></head><body>
  <div class="head">
    <div><div class="org">${esc(prog.name) || "Next Generation Genius"}</div>
      <div class="sub">Parental consent record</div></div>
    <div style="text-align:right;font:9pt/1.4 'Helvetica Neue',Arial,sans-serif;color:#5a6488">
      ${esc(s.displayId || s.studentId)}<br>${esc(day(c.generatedAt))}
    </div>
  </div>

  <div class="banner ${c.complete ? "ok" : "no"}">
    ${c.complete
      ? "All required consents are on file. This child is cleared to participate."
      : "REQUIRED CONSENTS ARE MISSING. This child is not cleared to participate until they are recorded."}
  </div>

  <h1>Child</h1>
  <table class="kv">
    <tr><th>Full name</th><td>${esc(s.fullName)}</td></tr>
    <tr><th>Student ID</th><td class="mono">${esc(s.displayId || s.studentId)}</td></tr>
    <tr><th>Age</th><td>${s.age == null ? "—" : esc(s.age)}</td></tr>
    <tr><th>Centre</th><td>${esc(s.centre) || "—"}</td></tr>
    <tr><th>Course</th><td>${esc(s.track) || "—"}</td></tr>
    <tr><th>Registered</th><td>${esc(day(s.enrolledAt))}</td></tr>
  </table>

  <h1>Parent / guardian</h1>
  <table class="kv">
    <tr><th>Name</th><td>${esc(gd.name) || "—"}</td></tr>
    <tr><th>Phone</th><td>${esc(gd.phone) || "—"}</td></tr>
    <tr><th>Email</th><td>${esc(gd.email) || "—"}</td></tr>
    <tr><th>Verification</th><td>${esc(reg.status)}${reg.verifiedAt ? " · " + esc(day(reg.verifiedAt)) : ""}</td></tr>
  </table>

  <h1>Consents</h1>
  <p class="lede">Recorded by the parent or guardian named above. Required consents must all be granted before a child may take part.</p>
  <table>
    <thead><tr><th>Consent</th><th>Standing</th><th>Given by</th><th>Recorded</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  ${extraRows ? '<h1>Registration answers</h1><table class="kv">' + extraRows + "</table>" : ""}

  <div class="sign">
    <div>Parent / guardian signature &amp; date</div>
    <div>For ${esc(prog.name) || "the programme"} — name, signature &amp; date</div>
  </div>

  <footer>
    Generated ${esc(c.generatedAt)}${c.generatedBy ? " by " + esc(c.generatedBy) : ""}.
    This document reflects the consent ledger at the time of printing; the ledger is append-only and holds the full history.
    ${esc(prog.website) ? esc(prog.website) + " · " : ""}${esc(prog.phone)}
  </footer>
</body></html>`;
}

/* ── Parental consent FORM ───────────────────────────────────────────────────
   A different instrument from the record above, and the distinction matters.
   `consentDocumentHtml` reports what is already on file — an audit artefact.
   This is the form itself: the numbered clauses a parent reads, initials and
   signs, which is what a school, a centre inspection or a safeguarding review
   asks to see.

   Prefilled where the child is known, blank where they are not, so the same
   template serves a specific family and a stack of 200 for a registration day.

   Grounded in the law the programme actually operates under: the Nigeria Data
   Protection Act 2023 for the data-processing clause and the Child's Rights
   Act 2003 (and its Lagos State counterpart) for the safeguarding framing.
   It is a template, not legal advice — the drawer says so where the admin
   downloads it, because a form like this ought to be read by the
   organisation's own adviser before it is put in front of a parent. */
const CONSENT_CLAUSES = [
  { type: "participation", n: 1, required: true, title: "Participation in the programme",
    body: "I confirm that I am the parent or legal guardian of the child named in Part A, and I consent to their enrolment and participation in the programme's classes, workshops, mentoring and related activities. I understand that participation is voluntary and that I may withdraw my child at any time by notifying the programme in writing." },
  { type: "medical", n: 2, required: true, title: "Emergency medical treatment",
    body: "In the event of an accident, injury or sudden illness, and where I cannot be reached in time, I authorise the programme's staff to obtain such emergency medical treatment for my child as a qualified medical practitioner considers necessary, including transport to hospital. I undertake to disclose in Part C any medical condition, allergy, medication or dietary requirement relevant to my child's safety, and to inform the programme promptly if it changes." },
  { type: "data", n: 3, required: true, title: "Processing of personal data",
    body: "I consent to the programme collecting and processing my child's personal data — and my own contact details — for the purposes of enrolment, attendance, safeguarding, communication with me, and reporting to funders in aggregate form. This is processed in accordance with the Nigeria Data Protection Act 2023. Part G sets out what is held, why, for how long, and the rights available to me." },
  { type: "media", n: 4, required: false, mustAnswer: true, title: "Photography, film and recording",
    body: "I consent to photographs, video or audio of my child being taken during programme activities, and to their use in the programme's internal records, reports to funders and partners, and printed materials. Declining this does not affect my child's place on the programme in any way." },
  { type: "site_visibility", n: 5, required: false, mustAnswer: true, title: "Being named or pictured publicly",
    body: "I consent to my child's name and photograph appearing on the programme's public website and social media — for example on the public participation board. I understand this is separate from clause 4: permission to take a photograph is not permission to publish it. I understand a photograph is published only where I have agreed to BOTH clause 4 and this clause, that I may withdraw this consent at any time, and that my child will be removed from public display promptly once I do." },
  { type: "trips", n: 6, required: false, title: "Off-site activities and transport",
    body: "I consent to my child taking part in supervised activities away from their usual centre, including excursions, competitions and showcases, and to being transported by the programme or a transport provider engaged by it. I understand I will be told in advance of any off-site activity, including where it is and when my child will return." },
  { type: "comms", n: 7, required: false, title: "Programme updates",
    body: "I consent to receiving messages from the programme by SMS, email or messaging app about my child's attendance, sessions, events and results. I may opt out of these at any time without affecting my child's participation." },
];

function consentFormHtml(c, opts) {
  opts = opts || {};
  const blank = !!opts.blank;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const s = (!blank && c && c.student) || {}, gd = (!blank && c && c.guardian) || {}, prog = (c && c.programme) || {};
  // Admin-editable document settings — legal name, address, retention period,
  // an extra clause their adviser asked for, and the logo. Falls back to the
  // ID card branding so a logo is set in one place, not two.
  const doc = (c && c.doc) || {};
  const sig = (!blank && c && c.signature) || {};
  const org = esc(prog.name) || "Next Generation Genius";
  const today = new Date().toISOString().slice(0, 10);
  // A filled value prints as text; an empty one prints as a rule to write on,
  // so one template covers a named child and a blank pad for a sign-up day.
  const fill = (v) => (v == null || v === "" ? '<span class="w"></span>' : esc(v));

  const clauses = CONSENT_CLAUSES.map(cl => `
    <div class="cl">
      <div class="cl-h"><span class="cl-n">${cl.n}</span><span class="cl-t">${esc(cl.title)}</span>
        ${cl.required ? '<span class="tag req">Required</span>'
          : cl.mustAnswer ? '<span class="tag ans">Answer required</span>'
          : '<span class="tag opt">Optional</span>'}</div>
      <p class="cl-b">${esc(cl.body)}</p>
      <div class="cl-c">
        <span class="box">I <b>CONSENT</b> <i></i></span>
        <span class="box">I <b>DO NOT</b> consent <i></i></span>
        <span class="init">Initials <i></i></span>
      </div>
    </div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Parental consent form${blank ? "" : " — " + esc(s.fullName)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 Georgia,"Times New Roman",serif; color: #14181f; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5pt solid #0c1432; padding-bottom: 8pt; }
  .org { font: 700 15pt/1.15 "Helvetica Neue",Arial,sans-serif; letter-spacing: -0.3pt; color: #0c1432; }
  .logo { height: 38pt; width: auto; object-fit: contain; }
  .addr { font: 8pt/1.4 "Helvetica Neue",Arial,sans-serif; color: #5a6488; margin-top: 2pt; }
  .sigimg { max-height: 26pt; max-width: 150pt; display: block; margin-bottom: 1pt; }
  .doc { font: 8pt/1.3 "Helvetica Neue",Arial,sans-serif; letter-spacing: 1.5pt; text-transform: uppercase; color: #5a6488; margin-top: 3pt; }
  .ref { text-align: right; font: 8.5pt/1.5 "Helvetica Neue",Arial,sans-serif; color: #5a6488; }
  h1 { font: 700 15pt/1.2 "Helvetica Neue",Arial,sans-serif; margin: 14pt 0 2pt; letter-spacing: -0.2pt; }
  h2 { font: 700 9.5pt/1.3 "Helvetica Neue",Arial,sans-serif; text-transform: uppercase; letter-spacing: 1.1pt;
       color: #0c1432; margin: 15pt 0 7pt; padding-bottom: 3pt; border-bottom: 0.75pt solid #0c1432; page-break-after: avoid; }
  .lede { font-size: 9.5pt; color: #47506e; margin: 0 0 4pt; }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv th, table.kv td { text-align: left; padding: 4.5pt 7pt 4.5pt 0; border-bottom: 0.5pt solid #d7dbe6; vertical-align: bottom; font-size: 10pt; }
  table.kv th { width: 31%; font: 600 8.5pt/1.4 "Helvetica Neue",Arial,sans-serif; color: #5a6488; text-transform: uppercase; letter-spacing: 0.5pt; }
  .w { display: inline-block; min-width: 58%; border-bottom: 0.5pt dotted #6b7280; }
  .cl { margin: 0 0 9pt; page-break-inside: avoid; }
  .cl-h { display: flex; align-items: baseline; gap: 7pt; }
  .cl-n { font: 700 10pt "Helvetica Neue",Arial,sans-serif; color: #fff; background: #0c1432; width: 15pt; height: 15pt;
          border-radius: 50%; display: inline-block; text-align: center; line-height: 15pt; flex: 0 0 auto; }
  .cl-t { font: 700 10.5pt "Helvetica Neue",Arial,sans-serif; }
  .tag { font: 700 7pt/1 "Helvetica Neue",Arial,sans-serif; text-transform: uppercase; letter-spacing: 0.7pt;
         padding: 2pt 4pt; border-radius: 2pt; margin-left: auto; flex: 0 0 auto; }
  .tag.req { background: #fdecea; color: #b3261e; border: 0.5pt solid #b3261e; }
  .tag.opt { background: #eef1f7; color: #47506e; border: 0.5pt solid #9aa3b8; }
  .tag.ans { background: #fff4e0; color: #8a5a00; border: 0.5pt solid #c98a1a; }
  .cl-b { margin: 3pt 0 5pt 22pt; font-size: 9.5pt; text-align: justify; }
  .cl-c { margin-left: 22pt; display: flex; gap: 16pt; align-items: center; font: 9pt "Helvetica Neue",Arial,sans-serif; }
  .box i { display: inline-block; width: 12pt; height: 12pt; border: 0.75pt solid #14181f; margin-left: 5pt; vertical-align: -2pt; }
  .init i { display: inline-block; width: 62pt; border-bottom: 0.5pt solid #14181f; margin-left: 5pt; }
  .decl { font-size: 9.5pt; text-align: justify; }
  .decl li { margin-bottom: 3pt; }
  .sig { display: flex; gap: 20pt; margin-top: 14pt; page-break-inside: avoid; }
  .sig div { flex: 1; }
  .sig .line { border-bottom: 0.75pt solid #14181f; height: 26pt; }
  .sig .lbl { font: 8pt/1.4 "Helvetica Neue",Arial,sans-serif; color: #5a6488; padding-top: 3pt; }
  .notice { font-size: 8.5pt; line-height: 1.55; color: #2b3244; }
  .notice p { margin: 0 0 5pt; }
  .office { border: 0.75pt solid #0c1432; padding: 8pt 10pt; margin-top: 12pt; page-break-inside: avoid; }
  footer { margin-top: 14pt; border-top: 0.5pt solid #d7dbe6; padding-top: 5pt; font: 7.5pt/1.5 "Helvetica Neue",Arial,sans-serif; color: #6b7280; }
</style></head><body>
  <div class="head">
    <div style="display:flex;gap:10pt;align-items:flex-start">
      ${doc.logoUrl ? '<img class="logo" src="' + esc(doc.logoUrl) + '" alt="">' : ""}
      <div><div class="org">${esc(doc.orgName) || org}</div>
        <div class="doc">Parental / guardian consent form</div>
        ${doc.orgAddress ? '<div class="addr">' + esc(doc.orgAddress) + "</div>" : ""}
        ${doc.rcNumber ? '<div class="addr">RC ' + esc(doc.rcNumber) + "</div>" : ""}
      </div>
    </div>
    <div class="ref">Ref: ${blank ? '<span class="w" style="min-width:70pt"></span>' : esc(s.displayId || s.studentId || "—")}<br>
      Issued: ${esc(today)}<br>Form ${esc(doc.formRef) || "CF-1"} &middot; rev. ${esc(doc.formRev) || "2026.1"}</div>
  </div>

  <h1>Consent to participate</h1>
  <p class="lede">Please read every clause and tick <b>one</b> box for each, then add your initials.
  Clauses 1 to 3 must be <b>granted</b> before a child can take part. Clauses 4 and 5 must be <b>answered</b> —
  either answer is fine. The rest are optional. Declining any clause other than 1 to 3 will not affect your
  child's place, their treatment on the programme, or anything else about their participation.</p>

  <h2>Part A &middot; The child</h2>
  <table class="kv">
    <tr><th>Full name</th><td>${fill(s.fullName)}</td></tr>
    <tr><th>Date of birth / age</th><td>${fill(s.age == null || s.age === "" ? "" : s.age + " years")}</td></tr>
    <tr><th>Sex</th><td>${fill(s.sex)}</td></tr>
    <tr><th>Centre</th><td>${fill(s.centre)}</td></tr>
    <tr><th>Faculty / course</th><td>${fill(s.track)}</td></tr>
    <tr><th>School attended</th><td><span class="w"></span></td></tr>
    <tr><th>Home address</th><td><span class="w"></span></td></tr>
  </table>

  <h2>Part B &middot; Parent or legal guardian</h2>
  <table class="kv">
    <tr><th>Full name</th><td>${fill(gd.name)}</td></tr>
    <tr><th>Relationship to child</th><td><span class="w"></span></td></tr>
    <tr><th>Mobile telephone</th><td>${fill(gd.phone)}</td></tr>
    <tr><th>Email</th><td>${fill(gd.email)}</td></tr>
    <tr><th>Means of identification</th><td><span class="w"></span></td></tr>
  </table>

  <h2>Part C &middot; Emergency contact, health and safeguarding</h2>
  <table class="kv">
    <tr><th>Alternative contact &amp; number</th><td><span class="w"></span></td></tr>
    <tr><th>Medical conditions / allergies</th><td><span class="w"></span></td></tr>
    <tr><th>Regular medication</th><td><span class="w"></span></td></tr>
    <tr><th>Blood group (if known)</th><td><span class="w"></span></td></tr>
    <tr><th>Persons NOT permitted to collect the child</th><td><span class="w"></span></td></tr>
    <tr><th>Person(s) authorised to collect the child</th><td><span class="w"></span></td></tr>
  </table>

  <h2>Part D &middot; The consents</h2>
  ${clauses}

  ${doc.extraClause ? `
    <div class="cl">
      <div class="cl-h"><span class="cl-n">8</span><span class="cl-t">${esc(doc.extraClauseTitle) || "Additional terms"}</span>
        <span class="tag opt">Optional</span></div>
      <p class="cl-b">${esc(doc.extraClause)}</p>
      <div class="cl-c"><span class="box">I <b>CONSENT</b> <i></i></span>
        <span class="box">I <b>DO NOT</b> consent <i></i></span>
        <span class="init">Initials <i></i></span></div>
    </div>` : ""}

  <h2>Part E &middot; Declaration</h2>
  <ol class="decl">
    <li>I am the parent or person with legal parental responsibility for the child named in Part A, and I am entitled to give the consents in Part D.</li>
    <li>The information I have given in Parts A to C is true and complete to the best of my knowledge, and I will tell the programme promptly if any of it changes.</li>
    <li>I have read and understood each clause in Part D and the data protection notice in Part G, and I have had the opportunity to ask questions about them.</li>
    <li>I understand that I may withdraw any consent at any time, in writing or by contacting the programme, without giving a reason and without any detriment to my child; and that withdrawal takes effect from the date it is received and does not undo anything lawfully done before then.</li>
    <li>I understand the programme operates a safeguarding policy and that its staff and volunteers are required to report a concern about a child's welfare to the appropriate authority, and that they will do so whether or not I have consented to anything on this form.</li>
  </ol>

  <div class="sig">
    <div>
      ${sig.image ? '<img class="sigimg" src="' + esc(sig.image) + '" alt="Signature on file">' : ""}
      <div class="line"></div><div class="lbl">Signature &mdash; parent / guardian${sig.image ? " (captured electronically)" : ""}</div></div>
    <div>${sig.name ? '<div style="padding-bottom:2pt">' + esc(sig.name).toUpperCase() + "</div>" : ""}<div class="line"></div><div class="lbl">Name in block capitals</div></div>
    <div>${sig.at ? '<div style="padding-bottom:2pt">' + esc(String(sig.at).slice(0, 10)) + "</div>" : ""}<div class="line"></div><div class="lbl">Date</div></div>
  </div>
  <div class="sig">
    <div><div class="line"></div><div class="lbl">Signature &mdash; witness / programme officer</div></div>
    <div><div class="line"></div><div class="lbl">Name &amp; role in block capitals</div></div>
    <div><div class="line"></div><div class="lbl">Date</div></div>
  </div>

  <h2>Part F &middot; Where the child cannot sign for themselves</h2>
  <p class="lede">A child aged 13 or over should be given the chance to say whether they agree to clauses 4 and 5,
  which concern their own image and name. Their view is recorded here and is respected even where a parent has consented.</p>
  <div class="sig">
    <div><div class="line"></div><div class="lbl">Signature &mdash; child (13+, optional)</div></div>
    <div><div class="line"></div><div class="lbl">Date</div></div>
  </div>

  <h2>Part G &middot; Data protection notice</h2>
  <div class="notice">
    <p><b>Who holds the data.</b> ${org} is the data controller for the personal data collected on this form.
      Contact: ${esc(doc.dpoContact) || esc(doc.phone) || esc(prog.phone) || "the programme office"}${esc(doc.website || prog.website) ? " &middot; " + esc(doc.website || prog.website) : ""}.</p>
    <p><b>What we hold.</b> Your child's name, age, sex, centre, course, photograph, attendance record and any
      health information you give in Part C; and your name, relationship, telephone number, email and identification reference.</p>
    <p><b>Why we hold it.</b> To enrol and register your child; to take attendance and account for their safety while
      in our care; to contact you, including in an emergency; to meet our safeguarding obligations; and to report
      participation figures to funders and partners &mdash; in aggregate, without identifying any child, unless you
      have consented under clauses 4 and 5.</p>
    <p><b>Lawful basis.</b> Your consent, given on this form, under the Nigeria Data Protection Act 2023; and, for
      safeguarding and emergency care, the protection of your child's vital interests and our legal obligations
      under the Child's Rights Act 2003 and the corresponding State law.</p>
    <p><b>Who sees it.</b> Programme staff and volunteers who need it for their role. We do not sell personal data
      and we do not share it with third parties except where required by law, where necessary to protect a child,
      or with a medical practitioner treating your child in an emergency.</p>
    <p><b>How long we keep it.</b> For the duration of your child's involvement and for ${esc(String(doc.retentionYears || 6))} year(s) afterwards, after
      which it is securely destroyed &mdash; except records we are required to retain longer for safeguarding purposes.</p>
    <p><b>Your rights.</b> You may ask to see the personal data we hold about your child, ask us to correct it,
      ask us to delete it, object to how we use it, or withdraw a consent &mdash; at any time, free of charge, by
      contacting the programme office. You may also complain to the Nigeria Data Protection Commission.</p>
  </div>

  <div class="office">
    <div style="font:700 8.5pt/1.3 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:1pt;color:#0c1432;margin-bottom:6pt">For office use only</div>
    <table class="kv">
      <tr><th>Received by</th><td><span class="w"></span></td></tr>
      <tr><th>Date received</th><td><span class="w"></span></td></tr>
      <tr><th>ID verified (Y/N) &amp; method</th><td><span class="w"></span></td></tr>
      <tr><th>Entered on system by / date</th><td><span class="w"></span></td></tr>
      <tr><th>Student ID issued</th><td>${blank ? '<span class="w"></span>' : esc(s.displayId || s.studentId || "")}</td></tr>
    </table>
  </div>

  <footer>
    ${org} &mdash; Parental / guardian consent form CF-1 rev. 2026.1.
    This form must be completed and signed before a child takes part. Retain the original at the centre and record the
    consents on the programme system the same day.
    ${esc(prog.website) ? esc(prog.website) + " &middot; " : ""}${esc(prog.phone)}
  </footer>
</body></html>`;
}

/** Render `html` and open the browser's print dialog, via a hidden iframe. */
function printDocument(html, onFail) {
  try {
    const fr = document.createElement("iframe");
    fr.setAttribute("aria-hidden", "true");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(fr);
    const d = fr.contentDocument || (fr.contentWindow && fr.contentWindow.document);
    if (!d) throw new Error("no_frame");
    d.open(); d.write(html); d.close();
    // Give the frame a tick to lay out before printing, then clean up well
    // after the (modal) dialog has been dismissed.
    setTimeout(() => {
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { onFail && onFail(); }
      setTimeout(() => { try { document.body.removeChild(fr); } catch (_) {} }, 60000);
    }, 250);
    return true;
  } catch (_) { onFail && onFail(); return false; }
}

/* The parts of the consent document an organisation owns.
   Their registered name, address and RC number, who a parent writes to about
   their data, how long records are kept, and a clause their adviser asked for.
   None of that should need a deploy — it is their document, not ours. The
   logo defaults to the ID card branding so it is set in one place. */
function ConsentDocEditor({ doc, onSaved }) {
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState(doc || {});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setF(doc || {}); }, [doc]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { await NGGApi.admin.summer.consentDocSave(f); toast.success("Consent document saved."); onSaved && onSaved(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600,#47506e)", marginBottom: 3 };
  const fld = (k, label, opts = {}) => (
    <div style={{ flex: opts.grow ? "1 1 100%" : "1 1 180px", minWidth: opts.min || 160 }}>
      <span style={lbl}>{label}</span>
      <input className="admin-input" style={{ width: "100%" }} type={opts.type || "text"}
        value={f[k] == null ? "" : f[k]} onChange={e => set(k, e.target.value)} placeholder={opts.ph || ""}/>
    </div>
  );
  return (
    <div style={{ marginBottom: 18 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>
        {open ? "▾" : "▸"} Edit the consent document
      </button>
      {open && (
        <div style={{ border: "1px solid var(--line-cool-soft,#eef0f4)", borderRadius: 12, padding: 14, marginTop: 10, display: "grid", gap: 12 }}>
          <span className="admin-hint" style={{ margin: 0 }}>
            These apply to every consent form and record you print, not just this child.
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {fld("orgName", "Registered legal name", { min: 220, ph: "if different from the programme name" })}
            {fld("rcNumber", "RC number")}
            {fld("orgAddress", "Registered address", { grow: true })}
            {fld("dpoContact", "Data protection contact", { min: 220, ph: "email or phone a parent can use" })}
            {fld("retentionYears", "Keep records for (years)", { type: "number", min: 120 })}
            {fld("logoUrl", "Logo URL", { min: 220, ph: "defaults to the ID card lockup" })}
            {/* The public sign-up form takes consent in ONE tick, which is only
                honest if the full wording is one tap away — so this is the link
                beside it. Blank falls back to the site's own Parental Consent
                document; point it at a hosted PDF if your adviser signed off a
                specific version. */}
            {fld("consentUrl", "Consent document link", { grow: true, ph: "blank = /legal?doc=consent" })}
            {fld("formRef", "Form reference", { min: 120 })}
            {fld("formRev", "Revision", { min: 120 })}
            {fld("extraClauseTitle", "Extra clause — title", { grow: true, ph: "leave blank for none" })}
          </div>
          <div>
            <span style={lbl}>Extra clause — wording</span>
            <textarea className="admin-input" rows={3} value={f.extraClause || ""} onChange={e => set("extraClause", e.target.value)}
              style={{ width: "100%", resize: "vertical" }} placeholder="Appears as clause 8 with its own consent boxes."/>
          </div>
          <div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save document settings"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsentRecord({ studentId, name, onClose }) {
  const { panelRef, close } = useAdminDrawer(onClose, false);
  const [c, setC] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.summer.consent(studentId).then(r => { setC(r.consent); setErr(""); })
    .catch(e => setErr(e.code || e.message || "load_failed"));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [studentId]);

  const blocked = () => toast.error("Your browser blocked the print dialog — allow popups for this site.");
  const doPrint = () => printDocument(consentDocumentHtml(c), blocked);
  // A standalone .html file: opens and prints identically anywhere, and
  // survives being filed or emailed. No engine, no server round trip.
  const save = (html, filename) => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const ref = () => (c.student.displayId || c.student.studentId);
  const doDownload = () => save(consentDocumentHtml(c), "consent-record-" + ref() + ".html");
  // The signable form, as opposed to the record of what is already on file.
  const doFormPrint = () => printDocument(consentFormHtml(c), blocked);
  const doFormDownload = () => save(consentFormHtml(c), "consent-form-" + ref() + ".html");
  const doBlankForm = () => save(consentFormHtml(c, { blank: true }), "consent-form-blank.html");

  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>Consent record · {name}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        {err ? <ErrorState title="Couldn't load the consent record" code={err} onRetry={load}/> : !c ? <div className="dash-spinner"/> : (
          <>
            <div className={"policy-callout"} data-tone={c.complete ? "ok" : "warn"}>
              {c.complete
                ? <><b>All required consents are on file.</b> This child is cleared to participate.</>
                : <><b>Required consents are missing.</b> This child is not cleared to participate until they are recorded.</>}
            </div>
            {/* Two documents, and they are not interchangeable. The FORM is the
                legal instrument a parent signs; the RECORD states what is on
                file for this child. A centre inspection asks for the first,
                an audit for the second. */}
            <div className="eyebrow" style={{ margin: "16px 0 6px" }}>CONSENT FORM · FOR SIGNING</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={doFormPrint}>⎙ Print / Save as PDF</button>
              <button className="btn btn-ghost btn-sm" onClick={doFormDownload}>↓ Download (prefilled)</button>
              <button className="btn btn-ghost btn-sm" onClick={doBlankForm}>↓ Blank form for printing</button>
            </div>
            <span className="admin-hint" style={{ display: "block", margin: "0 0 4px" }}>
              A4, clause by clause, with tick boxes, initials, declaration, signature and witness blocks, a data
              protection notice under the Nigeria Data Protection Act 2023, and an office-use panel.
            </span>
            <span className="admin-hint" style={{ display: "block", margin: "0 0 18px", color: "var(--coral)" }}>
              This is a template, not legal advice — have your legal adviser review the wording before you put it in
              front of a parent, and amend it for anything specific to your State or your funders.
            </span>

            <ConsentDocEditor doc={c.doc || {}} onSaved={load}/>

            <div className="eyebrow" style={{ margin: "0 0 6px" }}>CONSENT RECORD · WHAT IS ON FILE</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 18px" }}>
              <button className="btn btn-ghost btn-sm" onClick={doPrint}>⎙ Print / Save as PDF</button>
              <button className="btn btn-ghost btn-sm" onClick={doDownload}>↓ Download record</button>
              <span className="admin-hint" style={{ margin: 0, alignSelf: "center" }}>A4 — the ledger as it stands now.</span>
            </div>

            <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>Consent</th><th>Standing</th><th>Given by</th><th>Recorded</th></tr></thead>
              <tbody>{c.items.map(i => (
                <tr key={i.type}>
                  <td>{i.label}{i.required && <span className="chip" style={{ marginLeft: 6, background: "var(--coral)", color: "#fff" }}>required</span>}</td>
                  <td><span className={"chip " + (i.status === "granted" ? "status-published" : i.status === "declined" ? "status-archived" : "status-draft")}>{CONSENT_STATUS_LABEL[i.status] || i.status}</span></td>
                  <td>{i.actorName || "—"}</td>
                  <td className="mono">{i.recordedAt ? i.recordedAt.slice(0, 10) : "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>

            <div className="eyebrow" style={{ margin: "18px 0 6px" }}>GUARDIAN ON FILE</div>
            <div className="admin-hint" style={{ marginTop: 0 }}>
              {c.guardian.name || "—"} · {c.guardian.phone || "no phone"} · {c.guardian.email || "no email"}
            </div>

            {c.history.length > c.items.length && (
              <>
                <div className="eyebrow" style={{ margin: "18px 0 6px" }}>HISTORY · {c.history.length} ENTRIES</div>
                <p className="admin-hint" style={{ marginTop: 0 }}>The ledger is append-only — a changed answer adds an entry rather than replacing one. The table above shows the latest decision per consent.</p>
                <div className="admin-table-wrap"><table className="admin-table">
                  <thead><tr><th>When</th><th>Consent</th><th>Decision</th><th>Method</th><th>By</th></tr></thead>
                  <tbody>{c.history.slice().reverse().map((h, i) => (
                    <tr key={i}>
                      <td className="mono">{String(h.createdAt || "").slice(0, 16).replace("T", " ")}</td>
                      <td>{h.type}</td><td>{h.status}</td><td>{h.method || "—"}</td><td>{h.actorName || "—"}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummerRoster({ cohortId }) {
  const [list, setList] = React.useState(null);
  const [sending, setSending] = React.useState("");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState("");
  const [consentFor, setConsentFor] = React.useState(null);
  /* Every filter is a FACET now, all of them server-side, and they compose with
     AND. Before this the search and the school type went to the server while
     the situation filter ran on the drawn page — so combining them narrowed two
     different populations at two different moments, and the second one only ever
     saw whichever rows had come back first. */
  const [facets, setFacets] = React.useState({ centre: "", track: "", schoolType: "", status: "", consent: "", id: "", sex: "" });
  const [meta, setMeta] = React.useState({ total: 0, matched: 0, truncated: false, facets: null, applied: {} });
  const [gaps, setGaps] = React.useState(null);
  const [bulk, setBulk] = React.useState(false);
  const load = () => NGGApi.admin.summer.students(q, cohortId, facets)
    .then(r => {
      setList(r.students || []);
      setMeta({ total: r.total || (r.students || []).length, matched: r.matched || 0,
                truncated: !!r.truncated, facets: r.facets || null, applied: r.applied || {} });
    })
    .catch(() => setList([]));
  const loadGaps = () => NGGApi.admin.registration.qrGaps().then(setGaps).catch(() => setGaps(null));
  /* One effect for all of them: any facet change is the same round trip, and
     debounced together so typing in the search box while a centre is selected
     does not fire two overlapping requests whose answers can arrive out of
     order. */
  React.useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); /* eslint-disable-next-line */ },
    [q, facets.centre, facets.track, facets.schoolType, facets.status, facets.consent, facets.id, facets.sex]);
  const setFacet = (k, v) => setFacets(f => ({ ...f, [k]: v }));
  const activeCount = Object.values(facets).filter(Boolean).length + (q ? 1 : 0);
  const clearAll = () => { setFacets({ centre: "", track: "", schoolType: "", status: "", consent: "", id: "", sex: "" }); setQ(""); };
  /* " (12)" on an option — and the count is computed with the OTHER facets
     applied, so it means twelve GIVEN what else is selected. A count over the
     whole cohort is the faceted-search trap: the option reads (42), you pick it,
     and the table is empty because your other filters had already excluded them. */
  const fc = (facet, key) => {
    const c = meta.facets && meta.facets[facet];
    return c ? " (" + (c[key] || 0) + ")" : "";
  };
  /* Options come from what the roster actually HOLDS, so a centre with no
     children in this cohort is not offered — an option whose only outcome is an
     empty table is worse than no option. */
  const fkeys = (facet) => {
    const c = (meta.facets && meta.facets[facet]) || {};
    return Object.keys(c).filter(k => k !== "unknown" && k !== "" && c[k] > 0);
  };
  React.useEffect(() => { loadGaps(); /* eslint-disable-next-line */ }, []);
  /* Send every ID this cohort is owed, from the screen where somebody notices
     they are missing.
     One press covers both halves of the problem, because from the roster they
     look the same: a child with no ID at all is ISSUED one (which sends it), and
     a child who has one gets it again. The action reports the two separately, and
     names the children it could not help, because "sent 312" over a run that
     issued nine and skipped four held children reads as finished when it is not. */
  const sendAll = async () => {
    const ready = gaps ? (gaps.noIdReady || 0) : 0;
    const have = gaps ? (gaps.verified || 0) : 0;
    if (!(await dialog.confirm({
      title: "Send IDs to " + (ready + have) + " " + (ready + have === 1 ? "child" : "children") + "?",
      body: (ready ? ready + " " + (ready === 1 ? "child has" : "children have") + " no ID yet — they will be issued one and sent it. " : "")
        + (have ? have + " already " + (have === 1 ? "has one and will be sent it again" : "have one and will be sent it again") + ". " : "")
        + "Families with no email and no phone on file cannot be reached and are not counted.",
      cta: "Send",
    }))) return;
    setBulk(true);
    try {
      const r = await NGGApi.admin.registration.resendIdBulk("all", "");
      const held = (r.held || []).length;
      const parts = [];
      if (r.issued) parts.push(r.issued + " newly issued");
      if (r.queued) parts.push(r.queued + " resent");
      if (r.remaining) parts.push(r.remaining + " left — run it again");
      toast.success(parts.length ? parts.join(" · ") : (r.note || "Nothing to send."));
      // Said separately and not as a success: nothing was sent to these.
      if (held) toast.error(held + " still held — " + [...new Set((r.held || []).map(h => h.reason))].join(", ").replace(/_/g, " "));
      setTimeout(() => { loadGaps(); load(); }, 900);
    } catch (e) { toast.error(e.code || e.message); } finally { setBulk(false); }
  };
  const setStatus = async (studentId, status) => {
    // Destructive / credential-issuing transitions need a confirm — a stray
    // pick shouldn't withdraw a student or mint a real graduation certificate.
    if (["withdrawn", "graduated", "promoted"].includes(status)) {
      const body = status === "graduated" ? "Graduating issues the student's verifiable completion certificate." : "This changes the student's standing. You can set it back later.";
      if (!(await dialog.confirm({ title: "Set status to " + status + "?", body, cta: "Set " + status, danger: status !== "graduated" }))) { load(); return; }
    }
    try { await NGGApi.admin.summer.studentStatus(studentId, status); load(); } catch (e) { toast.error(e.code || e.message); }
  };
  const remove = async (s) => {
    if (!(await dialog.confirm({ title: "Delete " + s.fullName + "?", body: "This permanently removes the student record and their attendance, and frees their QR card for reuse. This can't be undone.", cta: "Delete", danger: true }))) return;
    try { await NGGApi.admin.summer.studentDelete(s.studentId); toast.success("Student deleted."); setOpenId(""); load(); } catch (e) { toast.error(e.code || e.message); }
  };
  /* No client-side filtering left. Every row the server returned is a row that
     matched, so the table draws what it was given — which is what makes the
     count under the filters trustworthy and what lets the filters combine. */
  const rows = list || [];
  return (
    <div>
      <div className="admin-filters">
        <input className="admin-input" placeholder="Search name / handle / ID" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280 }}/>
        {/* Seven pickers, any combination. Each carries counts computed against
            the others, so choosing one narrows the numbers on the rest instead
            of leaving them describing a population that is no longer on screen. */}
        <select className="admin-select" value={facets.centre} onChange={e => setFacet("centre", e.target.value)} aria-label="Filter by centre">
          <option value="">Any centre</option>
          {fkeys("centre").map(k => <option key={k} value={k}>{k}{fc("centre", k)}</option>)}
          {(meta.facets?.centre?.unknown || 0) > 0 && <option value="unknown">No centre recorded{fc("centre", "unknown")}</option>}
        </select>
        <select className="admin-select" value={facets.track} onChange={e => setFacet("track", e.target.value)} aria-label="Filter by faculty">
          <option value="">Any faculty</option>
          {fkeys("track").map(k => <option key={k} value={k}>{k}{fc("track", k)}</option>)}
          {(meta.facets?.track?.unknown || 0) > 0 && <option value="unknown">No faculty recorded{fc("track", "unknown")}</option>}
        </select>
        {/* School type. The public/private split is the first line of most
            funding applications, and "not recorded" is filterable rather than a
            hidden remainder because a split without its denominator is the one
            that ends up wrong in the application. */}
        <select className="admin-select" value={facets.schoolType} onChange={e => setFacet("schoolType", e.target.value)} aria-label="Filter by school type">
          <option value="">Any school type</option>
          <option value="public">Public school{fc("schoolType", "public")}</option>
          <option value="private">Private school{fc("schoolType", "private")}</option>
          {(meta.facets?.schoolType?.other || 0) > 0 && <option value="other">Recorded as something else{fc("schoolType", "other")}</option>}
          <option value="unknown">No school type recorded{fc("schoolType", "unknown")}</option>
        </select>
        <select className="admin-select" value={facets.status} onChange={e => setFacet("status", e.target.value)} aria-label="Filter by standing">
          <option value="">Any standing</option>
          <option value="active">Active{fc("status", "active")}</option>
          <option value="inactive">Not active{fc("status", "inactive")}</option>
        </select>
        <select className="admin-select" value={facets.consent} onChange={e => setFacet("consent", e.target.value)} aria-label="Filter by consent">
          <option value="">Any consent state</option>
          <option value="complete">Consent complete{fc("consent", "complete")}</option>
          <option value="incomplete">Missing a required consent{fc("consent", "incomplete")}</option>
        </select>
        {/* The complaint the roster could not answer at all: WHICH children have
            no ID. Combine it with a centre and it answers the version somebody
            actually asks — "who at Egbeda still has no card". */}
        <select className="admin-select" value={facets.id} onChange={e => setFacet("id", e.target.value)} aria-label="Filter by ID issued">
          <option value="">ID: any</option>
          <option value="no">No ID issued{fc("id", "no")}</option>
          <option value="yes">ID issued{fc("id", "yes")}</option>
        </select>
        <select className="admin-select" value={facets.sex} onChange={e => setFacet("sex", e.target.value)} aria-label="Filter by sex">
          <option value="">Any sex</option>
          {(meta.facets?.sex?.f || 0) > 0 && <option value="f">Girls{fc("sex", "f")}</option>}
          {(meta.facets?.sex?.m || 0) > 0 && <option value="m">Boys{fc("sex", "m")}</option>}
          {(meta.facets?.sex?.unknown || 0) > 0 && <option value="unknown">Sex not recorded{fc("sex", "unknown")}</option>}
        </select>
        {activeCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={clearAll} title="Remove every filter">
            Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" disabled={!rows.length} onClick={() => downloadCsv("summer-students", rows.map(s => ({ studentId: s.studentId, displayId: s.displayId, fullName: s.fullName, handle: s.handle, age: s.age, centre: s.centre, faculty: s.faculty, track: s.track, school: s.school || "",
          /* Both: what the family answered, and the normalised form. The raw
             column is the record, but pivoting on it reproduces the exact
             problem the dropdown was introduced to end — "public", "govt",
             "LGEA" and "State" are four spellings of one number, and a
             spreadsheet counts them as four. */
          schoolType: s.schoolType || "", schoolTypeGroup: s.schoolTypeKey || "not recorded", guardianName: s.guardianName, guardianPhone: s.guardianPhone, parentEmail: s.parentEmail, regStatus: s.regStatus, consent: s.consentComplete ? "complete" : "incomplete", status: s.status, attendance: s.attendanceCount })))}>Export CSV{rows.length !== (list || []).length ? " (" + rows.length + ")" : ""}</button>
        <button className="btn btn-primary btn-sm" disabled={bulk} onClick={sendAll} style={{ marginLeft: "auto" }}
          title="Issues an ID to every verified child who has none, and re-sends it to every child who already has one">
          {bulk ? "Sending…" : "Send IDs to everyone"}
        </button>
      </div>
      {/* What the filter actually matched, out of what. A filtered roster that
          only shows its rows leaves the reader to count them, and a count read
          off a screen is the one that goes into a report.
          The truncation line matters more than it looks: without it a capped
          roster reads as a complete answer, which is how "we have 1,000 public
          school children" gets quoted from a page that stopped at 1,000. */}
      {/* What the filters matched, out of what. A filtered roster that only shows
          its rows leaves the reader to count them, and a count read off a screen
          is the one that goes into a report. Named per facet so the sentence says
          which question was asked, not just how many answered it. */}
      {activeCount > 0 && (
        <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.55, color: "var(--ink-600,#3c4460)" }}>
          <b>{meta.matched}</b> of {meta.total} {meta.total === 1 ? "child" : "children"} in this cohort match
          {" "}{[
            facets.centre && (facets.centre === "unknown" ? "no centre recorded" : "centre " + facets.centre),
            facets.track && (facets.track === "unknown" ? "no faculty recorded" : facets.track),
            facets.schoolType && (facets.schoolType === "unknown" ? "no school type recorded"
              : facets.schoolType === "other" ? "a school type that is neither public nor private"
              : facets.schoolType + " school"),
            facets.status && (facets.status === "active" ? "still active" : "no longer active"),
            facets.consent && (facets.consent === "complete" ? "consent complete" : "a missing consent"),
            facets.id && (facets.id === "no" ? "no ID issued" : "an ID issued"),
            facets.sex && (facets.sex === "unknown" ? "sex not recorded" : facets.sex === "f" ? "girls" : "boys"),
            q && ("\u201c" + q + "\u201d"),
          ].filter(Boolean).join(" · ")}.
          {meta.truncated && <> Showing the first {rows.length} — narrow it further to see the rest.</>}
        </div>
      )}
      {/* What the button is for, before it is pressed. A bulk action whose size
          you cannot see is one people press once and never again — and the three
          numbers are three different problems, so they are never added up:
          `ready` is this button, `heldPhoto` is a photo decision, and
          `awaitingConsent` is the family or a desk recording a paper form. */}
      {gaps && (gaps.noId > 0 || gaps.awaitingConsent > 0) && (
        <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.55,
                      background: gaps.noIdReady > 0 ? "rgba(176,53,53,.07)" : "rgba(76,111,255,.08)",
                      border: "1px solid " + (gaps.noIdReady > 0 ? "rgba(176,53,53,.35)" : "rgba(76,111,255,.35)"),
                      borderRadius: 12, padding: "10px 14px" }}>
          {gaps.noId > 0 && <>
            <b>{gaps.noId} verified {gaps.noId === 1 ? "child has" : "children have"} no ID.</b>{" "}
            {gaps.noIdReady > 0 && <>{gaps.noIdReady} can be issued right now — that is what this button does. </>}
            {gaps.heldPhoto > 0 && <>{gaps.heldPhoto} {gaps.heldPhoto === 1 ? "is" : "are"} held waiting on a photo decision, which sending cannot fix. </>}
          </>}
          {gaps.awaitingConsent > 0 && <>{gaps.awaitingConsent} {gaps.awaitingConsent === 1 ? "child is" : "children are"} still awaiting consent — an ID cannot be issued until that is recorded.</>}
        </div>
      )}
      {list === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">{(list || []).length ? "No child matches that filter." : "No students enrolled yet."}</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>ID</th><th>Name</th><th>Guardian</th><th>Centre</th><th>Course</th><th>Present</th><th>Consent</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map(s => (
            <React.Fragment key={s.studentId}>
            <tr>
              <td className="mono">{s.displayId || s.studentId}
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}><a href={"/s/" + s.handle} target="_blank" rel="noopener noreferrer">/s/{s.handle}</a></div>
                {/* Said on the row, not only in a filter. A missing ID was a
                    silent state: the roster looked identical whether a child had
                    one or not, so it was only ever discovered when a parent rang
                    up or a gate turned the child away. */}
                {s.status === "active" && !s.token && (
                  <div className="mono" style={{ fontSize: 11, color: "#b03535", fontWeight: 700 }}>
                    {s.regStatus === "verified" ? "no ID issued" : "no ID — consent pending"}
                  </div>
                )}</td>
              <td>{s.fullName}<div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{s.age != null ? s.age + " yrs" : "age not set"}</div></td>
              {/* The guardian is the single most-needed piece of information on
                  this screen and it was not on it — every follow-up call meant
                  opening the editor first. */}
              <td style={{ fontSize: 12.5 }}>{s.guardianName || "—"}
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{s.guardianPhone || s.parentEmail || "no contact"}</div></td>
              <td>{s.centre}
                {/* The card's expiry, where it can still be acted on. A child
                    turned away at a gate is the expensive way to discover
                    this; the roster is the cheap one. */}
                {(() => {
                  const e = (s.idExpiresAt || "").slice(0, 10);
                  if (!e) return null;
                  const today = new Date().toISOString().slice(0, 10);
                  const soon = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
                  const tone = e < today ? { c: "#b03535", t: "ID expired " + e }
                    : e <= soon ? { c: "#a07400", t: "ID expires " + e }
                    : null;
                  return tone ? <div className="mono" style={{ fontSize: 11, color: tone.c, fontWeight: 700 }}>{tone.t}</div> : null;
                })()}
              </td>
              <td>{s.track}{s.faculty && <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{s.faculty}</div>}</td>
              <td className="mono">{s.attendanceCount}</td>
              <td>
                {s.regStatus === "parent_pending"
                  ? <span className="chip status-draft" title="The parent has not completed the consent link yet">Awaiting parent</span>
                  : s.consentComplete
                    ? <span className="chip status-published">Complete</span>
                    : <span className="chip" style={{ background: "var(--coral)", color: "#fff" }}>Incomplete</span>}
              </td>
              <td><select className="admin-select" value={s.status} onChange={e => setStatus(s.studentId, e.target.value)}><option value="active">active</option><option value="withdrawn">withdrawn</option><option value="graduated">graduated</option><option value="promoted">promoted</option><option value="waitlisted">waitlisted</option></select></td>
              <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                {/* Where staff actually stand when a parent phones to say the ID
                    never arrived. The action existed only in the pending queue —
                    a screen you leave the moment a child is verified, which is
                    exactly when the ID is the thing being asked about. */}
                {s.token
                  ? <><button className="btn btn-ghost btn-sm" disabled={sending === s.studentId}
                      onClick={() => adminResendStudentId(s, setSending)}>
                      {sending === s.studentId ? "…" : "Resend ID"}
                    </button>{" "}</>
                  : null}
                <button className="btn btn-ghost btn-sm" onClick={() => setConsentFor(s)}>Consent</button>{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(openId === s.studentId ? "" : s.studentId)}>{openId === s.studentId ? "Close" : "Edit"}</button>
              </td>
            </tr>
            {openId === s.studentId && <tr><td colSpan={9} style={{ background: "rgba(12,20,50,0.03)" }}><StudentEditor s={s} onSaved={() => { setOpenId(""); load(); }} onDelete={() => remove(s)}/></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div>
      }
      {consentFor && <ConsentRecord studentId={consentFor.studentId} name={consentFor.fullName} onClose={() => setConsentFor(null)}/>}
    </div>
  );
}

/* Edit an enrolled student's actual data — name, age, handle, centre, track,
   guardian contact, photo, status. Mirrors admin.summer.student.update. */
/* One editable project row — seeded from props, saves on demand. */
function ProjRow({ p, subjectType, subjectId, onChanged }) {
  const [f, setF] = React.useState({ title: p.title || "", kind: p.kind || "", url: p.url || "", imageUrl: p.imageUrl || "", sortOrder: p.sortOrder || 0 });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    if (f.title.trim() === "") { toast.error("Give the project a title."); return; }
    setBusy(true);
    try { await NGGApi.admin.profiles.projectUpsert({ subjectType, subjectId, id: p.id, ...f, sortOrder: Number(f.sortOrder) || 0 }); onChanged(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm("Remove this project from the member's profile? This can't be undone.")) return;
    setBusy(true);
    try { await NGGApi.admin.profiles.projectDelete(subjectType, subjectId, p.id); onChanged(); }
    catch (e) { toast.error(e.code || e.message); setBusy(false); }
  };
  return (
    <div style={{ border: "1px solid var(--line-cool-soft,#eef0f4)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input className="admin-input" aria-label="Project title" placeholder="Title" value={f.title} onChange={e => set("title", e.target.value)} style={{ flex: "2 1 160px" }}/>
        <input className="admin-input" aria-label="Project label" placeholder="Label (e.g. CODE · CIVIC)" value={f.kind} onChange={e => set("kind", e.target.value)} style={{ flex: "1 1 120px" }}/>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input className="admin-input" aria-label="Project link URL" placeholder="Link (https://…)" value={f.url} onChange={e => set("url", e.target.value)} style={{ flex: "1 1 150px" }}/>
        <input className="admin-input" aria-label="Project image URL" placeholder="Image URL (https://…)" value={f.imageUrl} onChange={e => set("imageUrl", e.target.value)} style={{ flex: "1 1 150px" }}/>
        <input className="admin-input" type="number" aria-label="Sort order (lower shows first)" title="Sort order — lower shows first" placeholder="Sort" value={f.sortOrder} onChange={e => set("sortOrder", e.target.value)} style={{ flex: "0 0 68px" }}/>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>
        <button className="btn btn-ghost btn-sm" onClick={del} disabled={busy} title="Remove" aria-label="Remove project" style={{ color: "#b03535" }}>✕</button>
      </div>
    </div>
  );
}
/* One editable mentor-note row. */
function NoteRow({ n, subjectType, subjectId, onChanged }) {
  const [f, setF] = React.useState({ author: n.author || "", note: n.note || "", isPublic: !!n.isPublic });
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    if (f.note.trim() === "") { toast.error("Write the note first."); return; }
    setBusy(true);
    try { await NGGApi.admin.profiles.noteUpsert({ subjectType, subjectId, id: n.id, author: f.author, note: f.note, isPublic: f.isPublic }); onChanged(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm("Delete this mentor note? This can't be undone.")) return;
    setBusy(true);
    try { await NGGApi.admin.profiles.noteDelete(subjectType, subjectId, n.id); onChanged(); }
    catch (e) { toast.error(e.code || e.message); setBusy(false); }
  };
  return (
    <div style={{ border: "1px solid var(--line-cool-soft,#eef0f4)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
      <input className="admin-input" aria-label="Note author" placeholder="Author (mentor name)" value={f.author} onChange={e => setF(s => ({ ...s, author: e.target.value }))}/>
      <textarea className="admin-input" rows={2} aria-label="Mentor note" placeholder="Note…" value={f.note} onChange={e => setF(s => ({ ...s, note: e.target.value }))} style={{ resize: "vertical" }}/>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: f.isPublic ? "#2f9e44" : "var(--ink-500)" }}>
          <input type="checkbox" checked={f.isPublic} onChange={e => setF(s => ({ ...s, isPublic: e.target.checked }))} style={{ width: 16, height: 16 }}/>
          {f.isPublic ? "Shown on public profile" : "Private (staff only)"}
        </label>
        <span style={{ flex: 1 }}/>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>
        <button className="btn btn-ghost btn-sm" onClick={del} disabled={busy} title="Remove" aria-label="Delete note" style={{ color: "#b03535" }}>✕</button>
      </div>
    </div>
  );
}
/* Shared: manage a member's public projects + mentor notes. */
function ProfileExtrasEditor({ subjectType, subjectId }) {
  const [d, setD] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [np, setNp] = React.useState({ title: "", kind: "", url: "", imageUrl: "" });
  const [nn, setNn] = React.useState({ author: "", note: "", isPublic: true });
  const [addingP, setAddingP] = React.useState(false);
  const [addingN, setAddingN] = React.useState(false);
  // Distinguish a real load failure from a genuinely empty profile so the panel
  // never shows a fake "No projects yet." when the data simply didn't load.
  const load = () => NGGApi.admin.profiles.extras(subjectType, subjectId).then(setD).catch(() => setD({ error: true }));
  React.useEffect(() => { if (open && !d) load(); }, [open]);
  const addProj = async () => {
    if (np.title.trim() === "") { toast.error("Give the project a title."); return; }
    setAddingP(true);
    try { await NGGApi.admin.profiles.projectUpsert({ subjectType, subjectId, ...np }); setNp({ title: "", kind: "", url: "", imageUrl: "" }); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setAddingP(false); }
  };
  const addNote = async () => {
    if (nn.note.trim() === "") { toast.error("Write the note first."); return; }
    setAddingN(true);
    try { await NGGApi.admin.profiles.noteUpsert({ subjectType, subjectId, ...nn }); setNn({ author: "", note: "", isPublic: true }); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setAddingN(false); }
  };
  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--line-cool-soft,#eef0f4)", paddingTop: 12 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? "Hide profile projects & notes ▴" : "Profile projects & mentor notes ▾"}
      </button>
      {open && (d === null ? <div className="dash-spinner" style={{ margin: "16px auto" }}/> : d.error ? (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--ink-500)", display: "flex", alignItems: "center", gap: 10 }}>
          Couldn't load projects &amp; notes.
          <button className="btn btn-ghost btn-sm" onClick={() => { setD(null); load(); }}>Retry</button>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gap: 18 }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>Public projects · shown on the member's profile</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(d.projects || []).map(p => <ProjRow key={p.id} p={p} subjectType={subjectType} subjectId={subjectId} onChanged={load}/>)}
              {!(d.projects || []).length && <div className="admin-cell-sub" style={{ fontSize: 12 }}>No projects yet.</div>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <input className="admin-input" aria-label="New project title" placeholder="New project title" value={np.title} onChange={e => setNp(s => ({ ...s, title: e.target.value }))} style={{ flex: "2 1 150px" }}/>
              <input className="admin-input" aria-label="New project label" placeholder="Label" value={np.kind} onChange={e => setNp(s => ({ ...s, kind: e.target.value }))} style={{ flex: "1 1 100px" }}/>
              <input className="admin-input" aria-label="New project link" placeholder="Link (optional)" value={np.url} onChange={e => setNp(s => ({ ...s, url: e.target.value }))} style={{ flex: "1 1 120px" }}/>
              <button className="btn btn-primary btn-sm" onClick={addProj} disabled={addingP}>{addingP ? "…" : "+ Add"}</button>
            </div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>Mentor notes · only public ones appear on the profile</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(d.notes || []).map(n => <NoteRow key={n.id} n={n} subjectType={subjectType} subjectId={subjectId} onChanged={load}/>)}
              {!(d.notes || []).length && <div className="admin-cell-sub" style={{ fontSize: 12 }}>No notes yet.</div>}
            </div>
            <div style={{ border: "1px dashed var(--cream-200,#d9d2c0)", borderRadius: 10, padding: 10, marginTop: 8, display: "grid", gap: 6 }}>
              <input className="admin-input" aria-label="New note author" placeholder="Author (defaults to you)" value={nn.author} onChange={e => setNn(s => ({ ...s, author: e.target.value }))}/>
              <textarea className="admin-input" rows={2} aria-label="New mentor note" placeholder="Add a mentor note…" value={nn.note} onChange={e => setNn(s => ({ ...s, note: e.target.value }))} style={{ resize: "vertical" }}/>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600 }}><input type="checkbox" checked={nn.isPublic} onChange={e => setNn(s => ({ ...s, isPublic: e.target.checked }))} style={{ width: 16, height: 16 }}/>Public on profile</label>
                <span style={{ flex: 1 }}/>
                <button className="btn btn-primary btn-sm" onClick={addNote} disabled={addingN}>{addingN ? "…" : "+ Add note"}</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Everything the family actually submitted.
 *
 * The editor exposes the columns the roster needs — name, age, centre, track,
 * guardian — and stopped there. School, allergies and every question an admin
 * added in the form builder live in `formData` and appeared NOWHERE in the
 * console: collected on the form, written to the database, never shown to
 * the people who need them. A medical note nobody can see is worse than one
 * that was never asked for.
 *
 * Read-only and labelled from the live form, so a custom question shows the
 * wording the parent answered rather than its storage key. Fields already
 * edited above are skipped so the panel is not a confusing second copy. */
const ANSWERS_SHOWN_ABOVE = { firstName: 1, lastName: 1, fullName: 1, age: 1, centre: 1, course: 1,
                              parentName: 1, parentPhone: 1, parentEmail: 1 };

function SubmissionAnswers({ s }) {
  const [labels, setLabels] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.admin.registration.form("summer-reg")
      .then(r => { if (!alive) return; const m = {}; (r.form?.fields || []).forEach(x => { m[x.key] = x.label; }); setLabels(m); })
      .catch(() => { if (alive) setLabels({}); });
    return () => { alive = false; };
  }, []);

  const answers = s.answers || {};
  const keys = Object.keys(answers).filter(k => !ANSWERS_SHOWN_ABOVE[k]
    && answers[k] !== "" && answers[k] != null
    && !(Array.isArray(answers[k]) && !answers[k].length));
  const show = (v) => Array.isArray(v) ? v.join(", ") : String(v);

  return (
    <div>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>
        Everything they submitted{s.formVersion ? " · form v" + s.formVersion : ""}
      </div>
      {!keys.length ? (
        <div className="admin-cell-sub" style={{ fontSize: 12 }}>
          Nothing beyond the fields above{labels === null ? "" : " — this child answered no other questions"}.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {keys.map(k => (
            <div key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "7px 10px", borderRadius: 8, background: "rgba(12,20,50,0.03)" }}>
              <span style={{ flex: "0 0 34%", fontSize: 12, fontWeight: 700, color: "var(--ink-600,#47506e)" }}>
                {(labels && labels[k]) || k}
              </span>
              <span style={{ flex: 1, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{show(answers[k])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentEditor({ s, onSaved, onDelete }) {
  const centreOpts = useCentreOptions();
  /* Name is edited as two fields, matching what registration now collects.
     `fullName` is not editable here: the server recomposes it from the parts,
     so an admin fixing a surname cannot leave the composed value — and the
     printed card — showing the old one. Rows that predate the split arrive
     with the parts already backfilled by the migration. */
  // A row that predates the split (or one the migration could not backfill)
  // arrives with fullName only. Seed the two boxes by splitting it rather than
  // opening blank — a blank required field blocks the save, and the admin has
  // no way to know why the record they can plainly see will not update.
  const seedName = (() => {
    if (s.firstName || s.lastName) return { firstName: s.firstName || "", lastName: s.lastName || "" };
    const parts = String(s.fullName || "").trim().split(/\s+/).filter(Boolean);
    return { firstName: parts.shift() || "", lastName: parts.pop() || "" };
  })();
  const [f, setF] = React.useState({
    firstName: seedName.firstName, lastName: seedName.lastName,
    age: s.age != null ? String(s.age) : "", handle: s.handle || "", sex: s.sex || "",
    grade: (s.grade && s.grade.label) || "",
    centre: s.centre || "", track: s.track || "", guardianName: s.guardianName || "",
    guardianPhone: s.guardianPhone || "", parentEmail: s.parentEmail || "", photoUrl: s.photoUrl || "", notes: s.notes || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    if ((f.firstName.trim() + f.lastName.trim()).length < 2) { toast.error("Enter a first and last name."); return; }
    setBusy(true);
    try {
      await NGGApi.admin.summer.studentUpdate(s.studentId, { ...f, age: f.age === "" ? s.age : parseInt(f.age, 10) || 0 });
      toast.success("Student saved."); onSaved();
    } catch (e) { toast.error(e.code === "bad_age" ? "Age must be 5–19." : e.code === "bad_email" ? "That parent email isn't valid." : e.code === "handle_taken" ? "That handle is already used." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  const fld = (key, label, opts = {}) => (
    <div style={{ flex: opts.grow ? "1 1 100%" : "1 1 180px", minWidth: opts.min || 150 }}>
      <span style={lbl}>{label}</span>
      <input className="admin-input" style={{ width: "100%" }} type={opts.type || "text"} value={f[key]} onChange={e => set(key, e.target.value)} placeholder={opts.ph || ""}/>
    </div>
  );
  return (
    <div style={{ padding: "16px 4px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div><span style={lbl}>Photo</span><PhotoCapture value={f.photoUrl} onChange={v => set("photoUrl", v)} size={80} label="Student photo"/></div>
        <div style={{ flex: 1, minWidth: 260, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          {fld("firstName", "First name", { min: 150 })}
          {fld("lastName", "Last name", { min: 150 })}
          {fld("age", "Age", { type: "number" })}
          {/* Editable here because a whole cohort was registered before the form
              asked, and filling it in one child at a time from the roster is the
              only way back — the answer cannot be recovered from a name, and
              re-asking two hundred families in November is not a plan. */}
          <div style={{ flex: "1 1 140px", minWidth: 130 }}><span style={lbl}>Sex</span>
            <select className="admin-input" style={{ width: "100%" }} value={f.sex || ""} onChange={e => set("sex", e.target.value)}>
              <option value="">Not recorded</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          {/* The class. Editable for the same reason sex is — a whole cohort
              was registered before the form asked — and because a class AGES:
              a coordinator correcting it in October is telling us what is true
              in October, which the server re-stamps. */}
          <div style={{ flex: "1 1 160px", minWidth: 140 }}><span style={lbl}>Class</span>
            <select className="admin-input" style={{ width: "100%" }} value={f.grade || ""} onChange={e => set("grade", e.target.value)}>
              <option value="">Not recorded</option>
              {["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
                "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {s.grade && s.grade.level > 0 && s.grade.yearsStale > 0 &&
              <div style={{ fontSize: 10.5, color: "var(--gold-700, #7a5600)", marginTop: 3 }}>
                recorded {s.grade.yearsStale} school year{s.grade.yearsStale === 1 ? "" : "s"} ago
              </div>}
          </div>
          {fld("handle", "Public handle", { ph: "auto-slug" })}
          <div style={{ flex: "1 1 180px", minWidth: 150 }}><span style={lbl}>Centre</span>
          <select className="admin-input" style={{ width: "100%" }} value={f.centre || ""} onChange={e => set("centre", e.target.value)}>
            <option value="">— select —</option>
            {((f.centre && !centreOpts.includes(f.centre)) ? [f.centre, ...centreOpts] : centreOpts).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
          {fld("track", "Track / faculty")}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        {fld("guardianName", "Guardian name", { min: 180 })}
        {fld("guardianPhone", "Guardian phone")}
        {fld("parentEmail", "Parent email", { type: "email", min: 200 })}
      </div>
      <div><span style={lbl}>Notes</span><textarea className="admin-input" rows={2} value={f.notes} onChange={e => set("notes", e.target.value)} style={{ width: "100%", resize: "vertical" }}/></div>
      <SubmissionAnswers s={s}/>
      <ProfileExtrasEditor subjectType="student" subjectId={s.studentId}/>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save student"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSaved}>Cancel</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete} style={{ color: "#b03535", marginLeft: "auto" }}>Delete student</button>
      </div>
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
  const load = () => NGGApi.admin.sessions.list(year).then(r => setList(r.sessions || [])).catch(e => { toast.error(e.code || e.message); setList([]); });
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

/* Proof-review queue — verify/reject the mission submissions that require it.
   Without this, proof-requiring submissions sat 'submitted' forever (no XP,
   no learner feedback). Approve awards XP + recomputes stats; reject returns
   it for another pass with optional feedback. */
function AdminMissionQueue() {
  const [subs, setSubs] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const load = () => NGGApi.admin.missions.submissions().then(r => setSubs(r.submissions || [])).catch(e => { toast.error(e.code || e.message); setSubs([]); });
  React.useEffect(() => { load(); }, []);
  const act = async (s, approve) => {
    const key = s.memberId + "/" + s.missionId;
    if (busy) return;
    let note = "";
    if (!approve) { note = window.prompt("Feedback for " + (s.fullName || "the member") + " (optional):", "") || ""; }
    setBusy(key);
    try {
      await NGGApi.admin.missions.verify(s.memberId, s.missionId, approve, note);
      toast.success(approve ? "Verified · +" + (s.xp || 0) + " XP awarded" : "Returned for another pass");
      setSubs(list => (list || []).filter(x => !(x.memberId === s.memberId && x.missionId === s.missionId)));
    } catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(""); }
  };
  if (subs === null) return <div className="admin-card" style={{ padding: 16 }}><div className="dash-spinner"/></div>;
  return (
    <div className="admin-card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: subs.length ? 12 : 0 }}>
        <h3 className="admin-h3" style={{ margin: 0 }}>Proof review queue {subs.length ? <span className="chip chip-gold" style={{ marginLeft: 8 }}>{subs.length}</span> : null}</h3>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>
      {!subs.length && <p className="admin-hint" style={{ margin: "8px 0 0" }}>Nothing waiting — proof-requiring submissions land here for a mentor or admin to verify.</p>}
      {subs.map(s => (
        <div key={s.memberId + "/" + s.missionId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-200, #e6e8ee)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700 }}>{s.fullName || s.memberId} <span className="mono" style={{ color: "var(--ink-500)", fontWeight: 400 }}>· {s.centre || ""}</span></div>
            <div style={{ fontSize: 13, color: "var(--ink-700)" }}>Wk {s.week} · {s.title} <span className="mono">+{s.xp} XP</span></div>
            {s.note ? <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>“{s.note}”</div> : null}
            {s.proofUrl ? <a href={s.proofUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>View proof ↗</a> : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(s, false)}>Return</button>
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act(s, true)}>{busy === (s.memberId + "/" + s.missionId) ? "…" : "Verify +" + s.xp}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminMissions() {
  const [list, setList] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const load = () => NGGApi.admin.missions.list().then(r => setList(r.missions || [])).catch(e => { toast.error(e.code || e.message); setList([]); });
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Anchor missions</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New mission</button>
      </div>
      <AdminMissionQueue/>
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
                <div className="mono admin-event-meta">{ev.kind} · {ev.centre} · {ev.location || ""}</div>
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
            <FieldCentre value={d.centre} onChange={v => set("centre", v)} extra={["Both","Online"]}/>
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
  const [history, setHistory] = React.useState(null);
  const loadHistory = () => NGGApi.admin.broadcastHistory().then(r => setHistory(r.announcements || [])).catch(() => setHistory([]));
  React.useEffect(() => { loadHistory(); }, []);
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
      loadHistory();
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
      <div className="admin-fields-h" style={{ marginTop: 22, fontWeight: 700 }}>Recent announcements</div>
      {history === null ? <div className="dash-spinner"/> :
        history.length === 0 ? <div className="admin-empty">Nothing sent yet.</div> :
        <div className="admin-app-list">
          {history.map(a => (
            <div className="admin-app" key={a.notifId}>
              <div className="admin-app-top">
                <div className="admin-cell-name">{a.title || "(untitled)"} <span className="chip chip-navy">{a.audience}</span></div>
                <span className="mono admin-cell-sub">{fmtDate(a.createdAt)}</span>
              </div>
              {a.body && <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>}
            </div>
          ))}
        </div>}
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

// Per-member capability editor (super only): grant caps beyond the role.
const ALL_CAPS = ["content", "people", "inbox", "settings", "rbac", "summer", "club", "audit"];
function MemberCapsEditor({ member }) {
  const roleCaps = ROLE_CAPS[member.role] || [];
  const [extra, setExtra] = React.useState(() => new Set(member.capsExtra || []));
  const [scope, setScope] = React.useState(() => new Set(member.centreScope || []));
  const [centres, setCentres] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { NGGApi.admin.registration.centres().then(r => setCentres(r.centres || [])).catch(() => {}); }, []);
  /* Only read when the verified tab is open. It walks the cohort's QR cache on
     disk, which is cheap but not free, and nobody on the pending tab is asking. */
  const loadGaps = React.useCallback(() => {
    NGGApi.admin.registration.qrGaps().then(setGaps).catch(() => setGaps(null));
  }, []);
  React.useEffect(() => { if (status === "verified") loadGaps(); }, [status, loadGaps]);
  const toggle = (c) => setExtra(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleScope = (id) => setScope(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => {
    setBusy(true);
    try { await NGGApi.admin.members.setCaps(member.memberId, Array.from(extra), Array.from(scope)); toast.success("Access updated.", "Access"); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  return (
    <div className="admin-field">
      <span className="admin-label">Extra capabilities (beyond the {member.role} role)</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 8px" }}>
        {ALL_CAPS.map(c => {
          const inRole = roleCaps.includes(c);
          return <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, opacity: inRole ? 0.5 : 1 }}>
            <input type="checkbox" checked={inRole || extra.has(c)} disabled={inRole} onChange={() => toggle(c)}/> {c}
          </label>;
        })}
      </div>
      <span className="admin-label">Centre scope {scope.size === 0 ? "(all centres)" : "(" + scope.size + " selected)"}</span>
      <p className="admin-hint" style={{ margin: "2px 0 6px" }}>Leave empty for full access. Selecting centres limits this admin's members, roster and dashboard to those centres only.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 8px" }}>
        {centres.map(c => (
          <label key={c.centreId} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13 }}>
            <input type="checkbox" checked={scope.has(c.centreId)} onChange={() => toggleScope(c.centreId)}/> {c.name}
          </label>
        ))}
        {!centres.length && <span className="mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>No centres configured yet.</span>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save access"}</button>
    </div>
  );
}

// ============================================================================
// Donations ledger (Paystack)
// ============================================================================

/* ── Baseline & endline ──────────────────────────────────────────────────────
 *
 * The screen that makes the measurement real. An instrument nobody can enter
 * scores into is not an instrument, and the entry has to be a REGISTER — forty
 * children off a paper sheet in one save — or it will not be used and the
 * evidence will not exist.
 *
 * Three tabs because there are three jobs, done by different people at
 * different times: define the test, run a sitting, read the result.
 */
function AdminAssessment() {
  const [tab, setTab] = React.useState("gains");
  const [inst, setInst] = React.useState(null);
  const [wins, setWins] = React.useState(null);
  const [gains, setGains] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [edit, setEdit] = React.useState(null);      // instrument being edited
  const [sheet, setSheet] = React.useState(null);    // { window, instrument, students }
  const [marks, setMarks] = React.useState({});      // studentId → { score, absent }
  const [cat, setCat] = React.useState(null);        // published-instrument shortlist
  const [catNote, setCatNote] = React.useState("");
  const [catFam, setCatFam] = React.useState("All");
  const [picked, setPicked] = React.useState({});    // catalogue key → selected

  const load = React.useCallback(() => {
    NGGApi.admin.assessInstruments().then(r => setInst(r.instruments || [])).catch(() => setInst([]));
    NGGApi.admin.assessWindows().then(r => setWins(r.windows || [])).catch(() => setWins([]));
    NGGApi.admin.assessGains().then(r => setGains(r.gains || [])).catch(() => setGains([]));
    NGGApi.admin.assessCatalogue().then(r => { setCat(r.catalogue || []); setCatNote(r.note || ""); }).catch(() => setCat([]));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const instById = {};
  (inst || []).forEach(i => { instById[i.instrumentId] = i; });

  const saveInstrument = async () => {
    setBusy("inst");
    try {
      await NGGApi.admin.assessInstrumentSave(edit.instrumentId || "", edit);
      toast.success("Instrument saved."); setEdit(null); load();
    } catch (e) {
      toast.error(e.code === "locked" ? (e.data && e.data.note) || "This instrument is locked."
        : e.code === "bad_max" ? "The maximum score must be between 1 and 1000."
        : e.code === "bad_grade_range" ? "The last class cannot come before the first."
        : (e.code || e.message), e.code === "locked" ? "Locked" : "Could not save");
    } finally { setBusy(""); }
  };

  const openSheet = async (w) => {
    setBusy("sheet");
    try {
      const r = await NGGApi.admin.assessSheet(w.windowId, "");
      setSheet(r);
      const m = {};
      (r.students || []).forEach(st => {
        if (st.result) m[st.studentId] = { score: st.result.absent ? "" : String(st.result.score), absent: st.result.absent };
      });
      setMarks(m);
      setTab("record");
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };

  const saveSheet = async () => {
    if (!sheet) return;
    setBusy("record");
    try {
      const results = (sheet.students || []).map(st => ({
        studentId: st.studentId,
        score: (marks[st.studentId] || {}).score ?? "",
        absent: !!(marks[st.studentId] || {}).absent,
      }));
      const r = await NGGApi.admin.assessRecord(sheet.window.windowId, results);
      /* Rejections are named, not counted. A silent "38 of 40 saved" leaves a
         coordinator to find the two by eye against a paper register. */
      if ((r.rejected || []).length) {
        toast.error(r.rejected.length + " score(s) were outside 0–" + sheet.instrument.maxScore
          + " and were NOT saved: " + r.rejected.slice(0, 6).join(", "), "Check these");
      } else {
        toast.success(r.saved + " recorded" + (r.cleared ? ", " + r.cleared + " cleared" : "") + ".");
      }
      load(); openSheet(sheet.window);
    } catch (e) {
      toast.error(e.code === "window_closed" ? "This sitting is closed — reopen it to change scores." : (e.code || e.message));
    } finally { setBusy(""); }
  };

  const newWindow = async (instrumentId, phase) => {
    try {
      await NGGApi.admin.assessWindowSave("", { instrumentId, phase, label: phase === "baseline" ? "Baseline" : "Endline" });
      load();
    } catch (e) {
      toast.error(e.code === "phase_exists"
        ? "There is already a " + phase + " sitting for this instrument. One per phase — two would leave it ambiguous which score pairs with the endline."
        : (e.code || e.message));
    }
  };

  const tone = (lvl) => ({ error: "#b91c1c", warn: "#b45309", method: "var(--ink-500,#5a6488)" }[lvl] || "var(--ink-500)");

  const adopt = async (keys) => {
    if (!keys.length) return;
    setBusy("adopt");
    try {
      const r = await NGGApi.admin.assessAdopt(keys);
      const made = (r.created || []).length, had = (r.existing || []).length;
      toast.success(made + " instrument" + (made === 1 ? "" : "s") + " adopted"
        + (had ? ", " + had + " already in use" : "") + ". Open a baseline sitting when you are ready.");
      setPicked({}); load();
    } catch (e) { toast.error(e.code || e.message, "Could not adopt"); } finally { setBusy(""); }
  };
  const pickedKeys = Object.keys(picked).filter(k => picked[k]);
  /* A rate has no maximum to be a percentage of and a ladder's rungs are not
     equally spaced, so the screen prints the unit in place of "out of N". */
  const outOf = (i) => i.scale === "rate" ? (i.unit || "per minute")
    : i.scale === "level" ? (i.unit || "levels")
    : "out of " + i.maxScore;

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2 className="admin-h2">Baseline &amp; endline</h2>
          <p className="admin-hint" style={{ maxWidth: 720 }}>
            The same test, twice, to the same children — which is what a funder means by measuring learning.
            Coursework grades are different tasks marked by different people, so a trend across them is not a
            learning gain and cannot be defended as one.
          </p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        {[["gains", "Results"], ["catalogue", "Catalogue"], ["instruments", "Instruments"], ["record", "Record scores"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={"admin-tab" + (tab === k ? " is-active" : "")}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {tab === "gains" && (
        gains === null ? <div className="admin-empty">Loading…</div>
        : gains.length === 0 ? <div className="admin-empty">
            No instrument yet has both a baseline and an endline with scores in them. Define an instrument, open
            a baseline sitting at the start of the programme and an endline at the end, and the paired result
            appears here.
          </div>
        : gains.map(g => (
          <div key={g.instrument.instrumentId} className="admin-section">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h3 className="admin-h3" style={{ margin: 0 }}>{g.instrument.name}</h3>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>
                {g.instrument.domainLabel} · {outOf(g.instrument)} · v{g.instrument.version}
              </span>
            </div>
            {/* Where it came from, next to what it found. A gain with no
                instrument behind it is the first thing a reviewer discounts. */}
            {g.instrument.source && <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
              {g.instrument.source}{g.instrument.citation ? " · " + g.instrument.citation : ""}
            </div>}

            {/* The headline is the PAIRED difference. The two cohort means sit
                beside it deliberately: quoting the endline mean against the
                baseline mean is the mistake this whole feature exists to
                prevent, so both numbers are on screen and labelled. */}
            <div className="admin-tiles" style={{ marginTop: 14 }}>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                {/* Coloured by whether the movement is GOOD, not by whether it
                    is upward — on a difficulties score the fall is the win. */}
                <div className="admin-tile-n" style={{ color: g.improved === true ? "#15803d" : g.improved === false ? "#b91c1c" : undefined }}>
                  {g.gain.mean === null ? "—" : (g.gain.mean > 0 ? "+" : "") + g.gain.mean}
                </div>
                <div className="mono admin-tile-l">Mean change, per child{g.unit ? " (" + g.unit + ")" : ""}</div>
                {g.gain.lo !== null && <div className="admin-hint" style={{ margin: 0 }}>
                  95% CI {g.gain.lo} to {g.gain.hi}{g.gain.d !== null ? " · d = " + g.gain.d : ""}
                </div>}
              </div>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="admin-tile-n">{g.paired}</div>
                <div className="mono admin-tile-l">Sat both papers</div>
                <div className="admin-hint" style={{ margin: 0 }}>{g.satBaseline} baseline · {g.satEndline} endline</div>
              </div>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="admin-tile-n">{g.pctMeaningful
                  ? (g.pairedBaselinePct === null ? "—" : g.pairedBaselinePct + "%")
                  : (g.pairedBaselineMean === null ? "—" : g.pairedBaselineMean)}</div>
                <div className="mono admin-tile-l">Their baseline</div>
                <div className="admin-hint" style={{ margin: 0 }}>whole cohort {g.pctMeaningful
                  ? (g.baselineMeanPct === null ? "—" : g.baselineMeanPct + "%")
                  : (g.baselineMean === null ? "—" : g.baselineMean)}</div>
              </div>
              <div className="admin-tile" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div className="admin-tile-n" style={{ color: g.attrition.baselineOnly ? "#b45309" : undefined }}>{g.attrition.baselineOnly}</div>
                <div className="mono admin-tile-l">Did not return</div>
                {g.attrition.bias && <div className="admin-hint" style={{ margin: 0 }}>
                  they scored {g.pctMeaningful ? g.attrition.bias.leftMean + "%" : g.attrition.bias.leftMeanRaw}
                  {" vs "}{g.pctMeaningful ? g.attrition.bias.stayedMean + "%" : g.attrition.bias.stayedMeanRaw}
                </div>}
              </div>
            </div>

            {/* Caveats above the breakdown, not below it. A reader who has
                already absorbed the split by sex will not go back and re-read
                the number with the caveat applied. */}
            {(g.caveats || []).length > 0 && (
              <ul style={{ margin: "16px 0 0", paddingLeft: 18 }}>
                {g.caveats.map((c, i) => (
                  <li key={i} style={{ color: tone(c.level), fontSize: 13, lineHeight: 1.55, marginBottom: 4 }}>{c.text}</li>
                ))}
              </ul>
            )}

            {[["bySex", "By sex"], ["byBand", "By class band"], ["byCentre", "By centre"]].map(([k, label]) =>
              (g[k] || []).length ? (
                <div key={k} style={{ marginTop: 18 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13.5 }}>{label}</h4>
                  <table className="admin-table">
                    <thead><tr><th>{label.replace("By ", "")}</th><th>Pairs</th><th>Mean gain</th><th>95% CI</th><th/></tr></thead>
                    <tbody>{g[k].map(r => (
                      <tr key={r.group}>
                        <td><b>{r.group}</b></td>
                        <td className="mono">{r.n}</td>
                        <td className="mono">{r.meanGain === null ? "—" : (r.meanGain > 0 ? "+" : "") + r.meanGain}</td>
                        <td className="mono">{r.lo === null ? "—" : r.lo + " to " + r.hi}</td>
                        <td>{r.tooThin
                          ? <span className="mono" style={{ fontSize: 11, color: "#b45309" }}>too few to say</span>
                          : r.significant ? <span className="mono" style={{ fontSize: 11, color: "#15803d" }}>clear of zero</span>
                          : <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>within noise</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : null)}
          </div>
        ))
      )}

      {/* ── Catalogue ───────────────────────────────────────────────────────
          Published instruments with their provenance. "A test we wrote" is the
          weakest answer to "measured with what?", and every fund this
          programme applies to asks the question. Adopting is deliberate and
          audited, because the choice of measure decides what can be claimed. */}
      {tab === "catalogue" && (
        <div className="admin-section">
          <div className="admin-section-head">
            <div>
              <h3 className="admin-h3" style={{ margin: 0 }}>Published instruments</h3>
              <p className="admin-hint" style={{ margin: "6px 0 0", maxWidth: 760 }}>{catNote}</p>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!pickedKeys.length || busy === "adopt"}
              onClick={() => adopt(pickedKeys)}>
              {busy === "adopt" ? "Adopting…" : "Adopt " + (pickedKeys.length || "") + " selected"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 14px" }}>
            {["All"].concat(Array.from(new Set((cat || []).map(c => c.family)))).map(f => (
              <button key={f} className={"chip" + (catFam === f ? " is-active" : "")} onClick={() => setCatFam(f)}
                style={{ cursor: "pointer", border: "1px solid var(--line,#e5e8ee)", background: catFam === f ? "var(--ink-900,#0a1130)" : "#fff", color: catFam === f ? "#fff" : "inherit" }}>{f}</button>
            ))}
          </div>
          {cat === null ? <div className="admin-empty">Loading…</div>
            : cat.length === 0 ? <div className="admin-empty">The catalogue is empty.</div>
            : <div style={{ display: "grid", gap: 12 }}>
              {cat.filter(c => catFam === "All" || c.family === catFam).map(c => (
                <div key={c.key} className="admin-card" style={{ padding: 16, border: "1px solid var(--line,#e5e8ee)", borderRadius: 12, background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {!c.adopted && <input type="checkbox" checked={!!picked[c.key]} aria-label={"Adopt " + c.name}
                      style={{ marginTop: 4 }}
                      onChange={e => setPicked(x => ({ ...x, [c.key]: e.target.checked }))}/>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 15 }}>{c.name}</b>
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                          {c.domainLabel} · {outOf(c)} · {c.gradeFromLabel}–{c.gradeToLabel}
                        </span>
                        {c.adopted
                          ? <span className="mono" style={{ fontSize: 10.5, color: "#15803d" }}>✓ adopted</span>
                          : null}
                        {c.higherIsBetter === false && <span className="mono" style={{ fontSize: 10.5, color: "#b45309" }}>lower is better</span>}
                      </div>
                      <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55 }}>{c.notes}</p>
                      {/* The adaptation note is not fine print: importing another
                          country's word list measures the wrong thing while
                          looking rigorous, so it sits at full size. */}
                      <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "#b45309" }}>
                        <b>Before you use it:</b> {c.adapt}
                      </p>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 10, lineHeight: 1.6 }}>
                        <div>{c.source}</div>
                        <div>{c.licence}</div>
                        <div>{c.citation}</div>
                        {c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.sourceUrl}</a>}
                      </div>
                    </div>
                    {!c.adopted && <button className="btn btn-ghost btn-sm" disabled={busy === "adopt"}
                      onClick={() => adopt([c.key])}>Adopt</button>}
                  </div>
                </div>
              ))}
            </div>}
        </div>
      )}

      {/* ── Instruments ─────────────────────────────────────────────────── */}
      {tab === "instruments" && (
        <div className="admin-section">
          <div className="admin-section-head">
            <h3 className="admin-h3" style={{ margin: 0 }}>Instruments</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setTab("catalogue")}>Browse the catalogue</button>
              <button className="btn btn-primary btn-sm" onClick={() => setEdit({ name: "", domain: "literacy", maxScore: 50, items: 0, gradeFrom: "", gradeTo: "", notes: "", unit: "", scale: "points", higherIsBetter: true, source: "", sourceUrl: "", licence: "", citation: "" })}>＋ New instrument</button>
            </div>
          </div>
          {inst === null ? <div className="admin-empty">Loading…</div>
            : inst.length === 0 ? <div className="admin-empty">No instrument defined yet.</div>
            : <table className="admin-table">
                <thead><tr><th>Instrument</th><th>Domain</th><th>Scored in</th><th>Classes</th><th>Results</th><th>Sittings</th><th/></tr></thead>
                <tbody>{inst.map(i => (
                  <tr key={i.instrumentId}>
                    <td><b>{i.name}</b>{i.version > 1 ? <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}> v{i.version}</span> : null}
                      {i.locked && <div className="mono" style={{ fontSize: 10.5, color: "var(--gold-700,#7a5600)" }}>locked — has results</div>}
                      {i.source && <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-500)" }}>{i.source}</div>}</td>
                    <td>{i.domainLabel}</td>
                    <td className="mono">{outOf(i)}{i.higherIsBetter === false ? " · lower is better" : ""}</td>
                    <td className="mono">{i.gradeFrom || i.gradeTo ? (i.gradeFrom || "?") + "–" + (i.gradeTo || "?") : "any"}</td>
                    <td className="mono">{i.results}</td>
                    <td className="mono">{i.windows}</td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...i, gradeFrom: i.gradeFrom || "", gradeTo: i.gradeTo || "" })}>Edit</button>
                      {["baseline", "endline"].map(ph =>
                        (wins || []).some(w => w.instrumentId === i.instrumentId && w.phase === ph)
                          ? null
                          : <button key={ph} className="btn btn-ghost btn-sm" onClick={() => newWindow(i.instrumentId, ph)}>＋ {ph}</button>)}
                      {i.locked && <button className="btn btn-ghost btn-sm" title="A new version, so old pairs stay comparable"
                        onClick={async () => { await NGGApi.admin.assessInstrumentRevise(i.instrumentId); load(); }}>New version</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>}

          <h3 className="admin-h3" style={{ marginTop: 24 }}>Sittings</h3>
          {(wins || []).length === 0 ? <div className="admin-empty">No sitting opened yet.</div>
            : <table className="admin-table">
                <thead><tr><th>Instrument</th><th>Phase</th><th>Dates</th><th>Sat</th><th>Absent</th><th/></tr></thead>
                <tbody>{(wins || []).map(w => (
                  <tr key={w.windowId}>
                    <td><b>{(instById[w.instrumentId] || {}).name || w.instrumentId}</b></td>
                    <td>{w.phase}</td>
                    <td className="mono">{w.opensAt || "—"} → {w.closesAt || "—"}</td>
                    <td className="mono">{w.sat}</td>
                    <td className="mono">{w.absent}</td>
                    <td><button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => openSheet(w)}>Record scores →</button></td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>
      )}

      {/* ── The register ────────────────────────────────────────────────── */}
      {tab === "record" && (
        !sheet ? <div className="admin-empty">Pick a sitting on the Instruments tab.</div>
        : <div className="admin-section">
            <div className="admin-section-head">
              <div>
                <h3 className="admin-h3" style={{ margin: 0 }}>{sheet.instrument.name} · {sheet.window.phase}</h3>
                <p className="admin-hint" style={{ margin: "4px 0 0" }}>
                  {sheet.instrument.unit ? "Scored in " + sheet.instrument.unit + ", 0–" + sheet.instrument.maxScore + "."
                    : "Out of " + sheet.instrument.maxScore + "."} Leave blank for a child who has not been marked yet;
                  tick <b>absent</b> for one who did not sit — that is not a zero, and recording it as one would
                  turn an attendance problem into a learning finding.
                </p>
              </div>
              <button className="btn btn-primary" disabled={busy === "record"} onClick={saveSheet}>
                {busy === "record" ? "Saving…" : "Save register"}
              </button>
            </div>
            <table className="admin-table">
              <thead><tr><th>Child</th><th>Centre</th><th>Class</th><th>Score</th><th>Absent</th></tr></thead>
              <tbody>{(sheet.students || []).map(st => {
                const m = marks[st.studentId] || {};
                return (
                  <tr key={st.studentId} style={st.outOfRange ? { background: "rgba(245,176,38,.07)" } : undefined}>
                    <td><b>{st.name}</b>
                      {st.outOfRange && <div className="mono" style={{ fontSize: 10.5, color: "#b45309" }}>outside this instrument's classes</div>}
                      {st.noGrade && <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-500)" }}>no class on file</div>}</td>
                    <td>{st.centre}</td>
                    <td className="mono">{st.grade || "—"}</td>
                    <td>
                      <input className="admin-input" type="number" min={0} max={sheet.instrument.maxScore}
                        style={{ width: 90 }} value={m.score || ""} disabled={!!m.absent}
                        aria-label={"Score for " + st.name}
                        onChange={e => setMarks(x => ({ ...x, [st.studentId]: { ...(x[st.studentId] || {}), score: e.target.value } }))}/>
                    </td>
                    <td>
                      <input type="checkbox" checked={!!m.absent} aria-label={"Absent: " + st.name}
                        onChange={e => setMarks(x => ({ ...x, [st.studentId]: { ...(x[st.studentId] || {}), absent: e.target.checked } }))}/>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
      )}

      {/* ── The instrument editor ───────────────────────────────────────── */}
      {edit && (
        <div className="admin-drawer" role="dialog" aria-modal="true" aria-label="Instrument"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="admin-drawer-head">
            <b>{edit.instrumentId ? "Edit instrument" : "New instrument"}</b>
            <button type="button" className="admin-drawer-close" onClick={() => setEdit(null)}>✕</button>
          </div>
          {edit.locked && <p className="admin-hint" style={{ color: "var(--gold-700,#7a5600)" }}>
            This instrument has results against it. Its name and notes can still be corrected, but what it
            measures and what it is out of are fixed — changing those would make every existing baseline/endline
            pair incomparable with nothing in the numbers to show it. Use <b>New version</b> instead.
          </p>}
          <Field label="Name" value={edit.name} onChange={v => setEdit(x => ({ ...x, name: v }))}/>
          <FieldSelect label="Domain" value={edit.domain} onChange={v => setEdit(x => ({ ...x, domain: v }))}
            options={["literacy", "numeracy", "sel", "gender_attitudes", "other"]}/>
          <Field label="Maximum score" type="number" value={String(edit.maxScore)} onChange={v => setEdit(x => ({ ...x, maxScore: parseInt(v, 10) || 0 }))}/>
          <Field label="Number of items (optional)" type="number" value={String(edit.items || "")} onChange={v => setEdit(x => ({ ...x, items: parseInt(v, 10) || 0 }))}/>
          {/* Scale decides whether a percentage may be printed at all. A rate
              has no maximum to be a fraction of; a ladder's rungs are not
              equally spaced. Both report in their own unit instead. */}
          <FieldSelect label="Kind of score" value={edit.scale || "points"} onChange={v => setEdit(x => ({ ...x, scale: v }))}
            options={["points", "rate", "level"]}/>
          <Field label="Unit — how the score is written (e.g. correct words per minute)" value={edit.unit || ""}
            onChange={v => setEdit(x => ({ ...x, unit: v }))}/>
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", fontSize: 13.5 }}>
            <input type="checkbox" checked={edit.higherIsBetter !== false}
              onChange={e => setEdit(x => ({ ...x, higherIsBetter: e.target.checked }))}/>
            A higher score is the better result
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <FieldSelect label="From class" value={edit.gradeFrom || ""} onChange={v => setEdit(x => ({ ...x, gradeFrom: v }))}
              options={["", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6", "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"]}/>
            <FieldSelect label="To class" value={edit.gradeTo || ""} onChange={v => setEdit(x => ({ ...x, gradeTo: v }))}
              options={["", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6", "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"]}/>
          </div>
          <FieldTextarea label="Notes — how it is administered" rows={3} value={edit.notes || ""}
            onChange={v => setEdit(x => ({ ...x, notes: v }))}/>
          {/* Provenance is editable even on a home-grown instrument, because
              "measured with what?" gets asked about those too. */}
          <Field label="Source — who published it" value={edit.source || ""} onChange={v => setEdit(x => ({ ...x, source: v }))}/>
          <Field label="Source link" value={edit.sourceUrl || ""} onChange={v => setEdit(x => ({ ...x, sourceUrl: v }))}/>
          <Field label="Licence" value={edit.licence || ""} onChange={v => setEdit(x => ({ ...x, licence: v }))}/>
          <FieldTextarea label="Citation" rows={2} value={edit.citation || ""} onChange={v => setEdit(x => ({ ...x, citation: v }))}/>
          <FieldTextarea label="Local adaptation needed before use" rows={2} value={edit.adaptNote || ""}
            onChange={v => setEdit(x => ({ ...x, adaptNote: v }))}/>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy === "inst"} onClick={saveInstrument}>Save</button>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDonations() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.donations().then(setD).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  /* Uses the module's shared `naira` — this had a local copy of the same
     formatter, which is one more place the currency would have to be changed. */
  const rows = d ? d.donations : null;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Donations {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {naira(d.totalPaid)} raised</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!rows || !rows.length} onClick={() => downloadCsv("donations", rows)}>Export CSV</button>
      </div>
      {d && !d.enabled && <p className="admin-hint" style={{ color: "var(--amber-800, #9a3412)" }}>⚠ Donations are off — set <span className="mono">paystack.secret</span> in api/config.php and point the Paystack webhook at <span className="mono">/api/hooks/paystack.php</span>.</p>}
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        rows === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">No donations yet.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Reference</th><th>Donor</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.reference}><td className="mono">{r.reference}</td><td>{r.name || r.email}</td><td>{naira(r.amount)}</td><td><span className={"chip status-" + (r.status === "paid" ? "published" : "draft")}>{r.status}</span></td><td className="mono">{fmtDate(r.paidAt || r.createdAt)}</td></tr>)}</tbody>
        </table></div>}
    </div>
  );
}

// ============================================================================
// Comment moderation — approve/reject member comments before they go public
// ============================================================================

/* ── Community 2.0 — moderation queue + channel management ─────────────── */
function AdminCommunity() {
  const [tab, setTab] = React.useState("moderation");
  const [pending, setPending] = React.useState(null);
  const loadPending = () => NGGApi.admin.community.overview().then(r => setPending(r.pending)).catch(() => {});
  React.useEffect(() => { loadPending(); }, []);
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Community {pending && (pending.posts + pending.comments + (pending.reported || 0)) > 0 ? <span className="chip chip-crimson" style={{ fontSize: 11, verticalAlign: "middle" }}>{pending.posts + pending.comments + (pending.reported || 0)} to review</span> : null}</h2>
      </div>
      <p className="admin-hint">The members' social feed. Posts &amp; comments are AI-screened on submit; video and anything flagged waits here for your approval. Channels mirror the summer courses — add or archive them below.</p>
      <div className="admin-filters">
        <button className={"btn btn-sm " + (tab === "moderation" ? "btn-primary" : "btn-ghost")} onClick={() => setTab("moderation")}>Moderation</button>
        <button className={"btn btn-sm " + (tab === "channels" ? "btn-primary" : "btn-ghost")} onClick={() => setTab("channels")}>Channels</button>
      </div>
      {tab === "moderation" ? <AdminCommunityQueue onChange={loadPending}/> : <AdminCommunityChannels/>}
    </div>
  );
}

function AdminCommunityQueue({ onChange }) {
  const [status, setStatus] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.community.queue(status).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  const act = async (kind, id, a) => { try { await NGGApi.admin.community.moderate(kind, id, a); load(); onChange && onChange(); } catch (e) { toast.error(e.code || e.message); } };
  return (
    <div>
      <div className="admin-filters">
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pending review</option><option value="reported">Reported</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="removed">Removed</option><option value="all">All (live)</option>
        </select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        d === null ? <div className="dash-spinner"/> :
        (d.posts.length === 0 && d.comments.length === 0) ? <div className="admin-empty">Nothing to review.</div> :
        <div>
          {d.posts.length > 0 && <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "var(--ink-500)", margin: "6px 0 10px" }}>POSTS</div>}
          <div className="admin-app-list">
            {d.posts.map(p => (
              <div className="admin-app" key={p.postId}>
                <div className="admin-app-top">
                  <div><div className="admin-cell-name">{p.author} <span className="chip" style={{ background: p.color, color: inkOn(p.color).ink }}>{p.channel}</span> {p.pinned && <span className="chip chip-lime">📌 pinned</span>} {p.featured && <span className="chip chip-lime">✨ showcase</span>} {p.reportCount > 0 && <span className="chip chip-crimson">🚩 {p.reportCount}</span>}</div>
                    <div className="mono admin-cell-sub">{fmtDate(p.createdAt)}{p.centre ? " · " + p.centre : ""}{p.mediaType !== "none" ? " · " + p.mediaType : ""}</div></div>
                  <span className={"chip status-" + (p.status === "published" ? "published" : p.status === "removed" ? "archived" : "draft")}>{p.status}</span>
                </div>
                {p.body && <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{p.body}</p>}
                {p.mediaType === "image" && p.mediaUrl && <img src={p.mediaUrl} alt="" style={{ maxWidth: 220, borderRadius: 10, marginBottom: 8 }}/>}
                {p.mediaType === "video" && p.mediaUrl && <video src={p.mediaUrl} poster={p.mediaPoster} controls style={{ maxWidth: 260, borderRadius: 10, marginBottom: 8 }}/>}
                {p.moderation && p.moderation.reason && <div className="mono admin-cell-sub" style={{ marginBottom: 8 }}>AI: {p.moderation.verdict} · {p.moderation.reason}</div>}
                <div className="admin-app-actions">
                  {p.status !== "published" && <button className="btn btn-primary btn-sm" onClick={() => act("post", p.postId, "approve")}>Approve</button>}
                  {p.status !== "hidden" && <button className="btn btn-ghost btn-sm" onClick={() => act("post", p.postId, "hide")}>Hide</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => act("post", p.postId, p.pinned ? "unpin" : "pin")}>{p.pinned ? "Unpin" : "Pin"}</button>
                  {p.status === "published" && <button className="btn btn-ghost btn-sm" onClick={() => act("post", p.postId, p.featured ? "unfeature" : "feature")}>{p.featured ? "Unfeature" : "✨ Feature"}</button>}
                  <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={() => act("post", p.postId, "remove")}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          {d.comments.length > 0 && <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "var(--ink-500)", margin: "18px 0 10px" }}>COMMENTS</div>}
          <div className="admin-app-list">
            {d.comments.map(c => (
              <div className="admin-app" key={c.commentId}>
                <div className="admin-app-top">
                  <div className="admin-cell-name">{c.name}</div>
                  <span className={"chip status-" + (c.status === "published" ? "published" : c.status === "removed" ? "archived" : "draft")}>{c.status}</span>
                </div>
                <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
                <div className="admin-app-actions">
                  {c.status !== "published" && <button className="btn btn-primary btn-sm" onClick={() => act("comment", c.commentId, "approve")}>Approve</button>}
                  {c.status !== "hidden" && <button className="btn btn-ghost btn-sm" onClick={() => act("comment", c.commentId, "hide")}>Hide</button>}
                  <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={() => act("comment", c.commentId, "remove")}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>}
    </div>
  );
}

function AdminCommunityChannels() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const blank = { channelId: "", name: "", icon: "", color: "#3b5bdb", kind: "topic", faculty: "", description: "", rules: "", pinned: false, status: "active", sortOrder: 0 };
  const [f, setF] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.community.overview().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const edit = (c) => setF({ channelId: c.channelId, name: c.name, icon: c.icon, color: c.color, kind: c.kind, faculty: c.faculty || "", description: c.description || "", rules: c.rules || "", pinned: !!c.pinned, status: c.status, sortOrder: c.sortOrder || 0 });
  const save = async () => {
    if (f.name.trim().length < 2) { toast.error("Give the channel a name."); return; }
    setBusy(true);
    try { await NGGApi.admin.community.channelUpsert(f); toast.success("Channel saved."); setF(blank); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600,#47506e)", marginBottom: 3 };
  return (
    <div>
      <div style={{ background: "rgba(12,20,50,0.03)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div className="mono" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 10 }}>{f.channelId ? "EDIT CHANNEL" : "ADD A CHANNEL"}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}><span style={lbl}>Name</span><input className="admin-input" style={{ width: "100%" }} value={f.name} maxLength={120} onChange={e => set("name", e.target.value)}/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Icon</span><input className="admin-input" value={f.icon} maxLength={4} onChange={e => set("icon", e.target.value)} style={{ width: 64 }} placeholder="💻"/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Colour</span><input type="color" value={f.color} onChange={e => set("color", e.target.value)} style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)", cursor: "pointer" }}/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Kind</span><select className="admin-select" value={f.kind} onChange={e => set("kind", e.target.value)}><option value="course">Course</option><option value="topic">Topic</option><option value="centre">Centre</option><option value="commons">Commons</option></select></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Status</span><select className="admin-select" value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="archived">Archived</option></select></div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}><input type="checkbox" checked={f.pinned} onChange={e => set("pinned", e.target.checked)}/> Pinned</label>
        </div>
        <div style={{ marginTop: 10 }}><span style={lbl}>Description</span><input className="admin-input" style={{ width: "100%" }} value={f.description} maxLength={400} onChange={e => set("description", e.target.value)}/></div>
        <div style={{ marginTop: 10 }}><span style={lbl}>Channel rules <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>— shown to members in this channel. One rule per line.</span></span><textarea className="admin-input" style={{ width: "100%", minHeight: 84, resize: "vertical" }} value={f.rules} maxLength={1200} onChange={e => set("rules", e.target.value)} placeholder={"Be kind and specific with feedback.\nShip something every week.\nNo personal contact details."}/></div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : (f.channelId ? "Save channel" : "Add channel")}</button>
          {f.channelId && <button className="btn btn-ghost btn-sm" onClick={() => setF(blank)}>Cancel edit</button>}
        </div>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        d === null ? <div className="dash-spinner"/> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Channel</th><th>Kind</th><th>Posts</th><th>Status</th><th></th></tr></thead>
          <tbody>{d.channels.map(c => (
            <tr key={c.channelId}>
              <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", background: c.color, color: inkOn(c.color).ink, fontSize: 12 }}>{c.icon || "#"}</span><b>{c.name}</b>{c.pinned && <span className="chip chip-lime">pinned</span>}</span></td>
              <td className="mono admin-cell-sub">{c.kind}</td>
              <td>{c.total || 0}</td>
              <td>{c.status === "active" ? <span className="chip chip-lime">active</span> : <span className="chip status-archived">archived</span>}</td>
              <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => edit(c)}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

function AdminComments() {
  const [status, setStatus] = React.useState("pending");
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = () => NGGApi.admin.comments(status).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  const act = async (commentId, a) => { try { await NGGApi.admin.commentModerate(commentId, a); load(); } catch (e) { toast.error(e.code || e.message); } };
  const rows = d ? d.comments : null;
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Comment moderation {d && d.pending ? <span className="chip chip-crimson" style={{ fontSize: 11, verticalAlign: "middle" }}>{d.pending} pending</span> : null}</h2>
      </div>
      <p className="admin-hint">Member comments on posts stay hidden until you approve them. Nothing is public until it's cleared here.</p>
      <div className="admin-filters">
        <select className="admin-select" value={status} onChange={e => setStatus(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        rows === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">Nothing here.</div> :
        <div className="admin-app-list">
          {rows.map(c => (
            <div className="admin-app" key={c.commentId}>
              <div className="admin-app-top">
                <div><div className="admin-cell-name">{c.memberName} <span className="chip chip-navy">{c.postTitle || c.postSlug || c.postId}</span></div>
                  <div className="mono admin-cell-sub">{fmtDate(c.createdAt)}</div></div>
                <span className={"chip status-" + (c.status === "approved" ? "published" : c.status === "rejected" ? "archived" : "draft")}>{c.status}</span>
              </div>
              <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
              <div className="admin-app-actions">
                {c.status !== "approved" && <button className="btn btn-ghost btn-sm" onClick={() => act(c.commentId, "approve")}>Approve</button>}
                {c.status !== "rejected" && <button className="btn btn-ghost btn-sm" onClick={() => act(c.commentId, "reject")}>Reject</button>}
                <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={async () => { if (await dialog.confirm({ title: "Delete this comment?", body: "Permanently removes the comment. This can't be undone.", cta: "Delete", danger: true })) act(c.commentId, "delete"); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}

// ============================================================================
// Behaviour monitor — log observations, AI/rule triage, wellbeing flags
// ============================================================================

/* ── Staff activity ──────────────────────────────────────────────────────────
   What the programme knows about the adults, not the children.

   Deliberately activity, not judgement: counts of what each person filed over
   a window, next to how many children they are responsible for. No score and
   no ranking — a coordinator reading this should be able to see who has gone
   quiet and go and ask them why, which is the only use of it that helps
   anybody. Quietest first, because sorting by the busiest buries exactly the
   people the screen exists to find. */
/* ── Diagnostics ─────────────────────────────────────────────────────────────
   Everything here already existed and none of it was visible. Handler
   exceptions went to api/logs/php-error.log — correct, and unreadable by
   anyone actually running the programme — so the first report of a broken
   endpoint came from a centre phoning to say the desk was down. The web-cron
   runs in a shutdown hook that swallows throwables so a background job can
   never break a page, which also meant that when reminders and integration
   deliveries stopped, they stopped in silence. */
function AdminOps() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.ops.status().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  const clear = async (id) => {
    setBusy(true);
    try { const r = await NGGApi.admin.ops.clear(id); toast.success(r.cleared + " marked as dealt with", "Acknowledged"); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  // Background jobs are normally driven by ordinary traffic; on a quiet host
  // this runs one (or all) on demand rather than waiting for the next visitor.
  const runCron = async (job) => {
    setBusy(true);
    try {
      const r = await NGGApi.admin.ops.run(job);
      const ran = r.ran || {};
      const busyJobs = Object.keys(ran).filter(k => ran[k] === "busy");
      const failed = Object.keys(ran).filter(k => ran[k] === "error");
      if (failed.length) toast.error("Failed: " + failed.join(", "));
      else if (busyJobs.length) toast.info("Already running — try again in a moment.");
      else toast.success((job === "all" ? "All jobs" : job) + " ran.", "Done");
      load();
    }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const h = (d && d.health) || {};
  const c = h.checks || {};
  const ago = (s) => s === null || s === undefined ? "never" : s < 90 ? s + "s ago" : s < 5400 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago";
  const light = (ok, label, detail) => (
    <div className="admin-tile" style={{ cursor: "default" }}>
      {/* Never colour alone: a red dot and a green dot are the same dot to
          about one man in twelve, and this is the screen you read in a hurry. */}
      <div className="admin-tile-n" style={{ fontSize: 22, color: ok ? "var(--lime-ink)" : "var(--coral, #c0341a)" }}>{ok ? "✓" : "✕"}</div>
      <div className="admin-tile-l">{label}</div>
      <div className="mono admin-cell-sub">{ok ? "ok" : detail || "failing"}</div>
    </div>
  );

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Diagnostics</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
          {d && d.events && d.events.length > 0 &&
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => clear(0)}>Mark all dealt with</button>}
        </div>
      </div>
      <p className="admin-hint">
        Faults are grouped, so one broken endpoint is one row with a count rather than ten thousand rows.
        Acknowledging a fault does not silence it — if it happens again it comes straight back.
        For an uptime monitor, watch <code>/api/public/health.php</code>: it answers 503 when the site cannot serve.
      </p>
      {err && <p className="admin-error">{err}</p>}
      {!d && !err && <p className="admin-hint">Loading…</p>}

      {d && <>
        <div className="admin-tiles" style={{ marginBottom: 18 }}>
          {light(!!(c.db && c.db.ok), "Database", "read-only — the disk may be full")}
          {light(!!(c.schema && c.schema.ok), "Schema", c.schema ? "at " + c.schema.at + ", code wants " + d.schemaTarget : "unreadable")}
          {light(!!(c.cron && c.cron.ok), "Background jobs", c.cron && c.cron.stale ? "stalled: " + c.cron.stale.join(", ") : "")}
          {light((d.errors24h || 0) === 0, "Errors (24h)", d.errors24h + " in the last day")}
        </div>

        {/* Photo storage. On a deployment without Cloudinary every headshot is
            written to disk, and "the web user cannot write to a directory you
            uploaded" is the commonest way a PHP deploy is broken. The symptom is
            a blank frame on the review desk, which looks exactly like a family
            sending no photo — so it gets reported as "photos don't display" with
            nothing to go on. This is the answer, in one place, in words. */}
        {c.photos && (
          <div style={{ marginBottom: 18 }}>
            <h3 className="admin-h3">Photo storage</h3>
            <div className="admin-tiles">
              {light(!!c.photos.ok, "Saving photos",
                c.photos.where === "unwritable" ? "the image directory is NOT writable — no photo can be saved"
                : c.photos.where === "cache_fallback" ? "writing to the cache directory as a fallback — fix permissions on api/storage"
                : c.photos.error ? c.photos.stage + ": " + c.photos.error
                : "")}
              {c.photosOnRecord && light(!!c.photosOnRecord.ok, "Recent sign-ups",
                c.photosOnRecord.missing + " of the last " + c.photosOnRecord.checked + " arrived with no photo")}
            </div>
            <p className="admin-cell-sub" style={{ marginTop: 6 }}>
              {c.photos.dir ? <>Directory <code>{c.photos.dir}</code> · </> : null}
              {c.photos.files} image{c.photos.files === 1 ? "" : "s"} held
              {c.photos.bytes ? " · " + (c.photos.bytes / 1048576).toFixed(1) + " MB" : ""}
              {c.photos.where === "storage" ? " · checked by writing and reading back a test image just now" : ""}
            </p>
            {!c.photos.ok && (
              <p className="admin-hint" style={{ marginTop: 4 }}>
                Make <code>api/storage</code> writable by the web user (<code>chmod 775</code>, or 755 if PHP runs as
                the owner) and press Refresh. Photos already accepted are not lost by fixing this — but any
                submission that arrived while it was broken has no image, and those families need a retake link.
              </p>
            )}
          </div>
        )}

        {/* The media cloud. Nothing checked this, and the client is built to
            survive it being gone — uploadOrInline() stores the image locally
            whenever Cloudinary cannot be used. That is right, and it meant a
            disconnected cloud looked identical to a working one everywhere in
            the product. This says which of the four states it is in, because
            they have four different fixes. */}
        {c.cloudinary && (
          <div style={{ marginBottom: 18 }}>
            <h3 className="admin-h3">Media cloud</h3>
            <div className="admin-tiles">
              {light(!!c.cloudinary.ok, "Cloudinary", c.cloudinary.detail || "")}
              {c.photoStorage && light(!!c.photoStorage.ok, "Where photos landed",
                c.photoStorage.note || (c.photoStorage.local + " of the last " + c.photoStorage.checked + " kept locally"))}
            </div>
            {c.cloudinary.state === "bad_credentials" && (
              <p className="admin-hint" style={{ marginTop: 6 }}>
                Cloudinary is refusing these keys. Check <code>cloudinary</code> in <code>api/config.php</code> against
                the Cloud name, API key and API secret on the Cloudinary dashboard — a rotated secret is the usual
                cause. Uploads are still being accepted and stored on this server in the meantime, so nothing has been
                lost; they simply are not in the cloud.
              </p>
            )}
            {c.cloudinary.state === "exhausted" && (
              <p className="admin-hint" style={{ marginTop: 6 }}>
                The plan is rate-limited or out of credit. Uploads are landing on this server until it resets.
              </p>
            )}
            {c.cloudinary.state === "unreachable" && (
              <p className="admin-hint" style={{ marginTop: 6 }}>
                This host could not reach Cloudinary at all — usually outbound HTTPS being blocked rather than
                anything wrong with the account.
              </p>
            )}
            {c.cloudinary.state === "not_configured" && (
              <p className="admin-cell-sub" style={{ marginTop: 6 }}>
                Running without a media cloud is supported: every photograph is kept on this server instead.
              </p>
            )}
          </div>
        )}

        <div className="admin-section-head" style={{ marginTop: 4 }}>
          <h3 className="admin-h3">Background jobs</h3>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runCron("all")}>Run all now</button>
        </div>
        <div className="admin-chips" style={{ marginBottom: 8 }}>
          {Object.keys(h.cron || {}).map(job => {
            const j = h.cron[job];
            const stale = j.ageSeconds !== null && j.ageSeconds > j.interval * 10;
            return <span key={job} className="chip-run" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 6 }}>
              <span className={"chip " + (j.ageSeconds === null ? "chip-navy" : stale ? "chip-crimson" : "chip-lime")}>{job}: {ago(j.ageSeconds)}</span>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runCron(job)} title={"Run " + job + " now"}>Run now</button>
            </span>;
          })}
        </div>
        <p className="admin-cell-sub" style={{ marginBottom: 18 }}>Driven by ordinary traffic — a quiet site runs them less often, which is not a fault. Use <b>Run now</b> to kick one by hand instead of waiting for the next visitor.</p>

        <h3 className="admin-h3">Open faults{d.clearedCount ? <span className="admin-count">{d.clearedCount} dealt with</span> : null}</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Where</th><th>What</th><th>Seen</th><th>Last</th><th></th></tr></thead>
            <tbody>
              {!d.events.length && <tr><td colSpan={5} className="admin-empty">Nothing has failed. That is the expected state — this table being empty is the good news.</td></tr>}
              {d.events.map(e => (
                <tr key={e.id}>
                  <td>
                    <div className="admin-cell-name">{e.source}</div>
                    <div className="mono admin-cell-sub">{e.kind}{e.detail ? " · " + e.detail : ""}</div>
                  </td>
                  <td>{e.message || "—"}</td>
                  <td><span className={"chip " + (e.hits > 20 ? "chip-crimson" : e.hits > 1 ? "chip-gold" : "chip-navy")}>{e.hits}×</span></td>
                  <td className="mono">{(e.lastAt || "").replace("T", " ").slice(0, 16)}
                    <div className="mono admin-cell-sub">first {(e.firstAt || "").slice(0, 10)}</div></td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => clear(e.id)}>Dealt with</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.build && <p className="admin-hint" style={{ marginTop: 12 }}>Server build <code>{d.build}</code> · schema {h.schema} of {d.schemaTarget}</p>}
      </>}
    </div>
  );
}

function AdminStaff() {
  const [d, setD] = React.useState(null);
  const [days, setDays] = React.useState(30);
  const [err, setErr] = React.useState("");
  const [skills, setSkills] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState("activity");
  React.useEffect(() => {
    NGGApi.admin.staff.performance(days).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  }, [days]);
  React.useEffect(() => {
    if (tab === "skills" && skills === null) NGGApi.admin.staff.skills().then(r => setSkills(r.skills || {})).catch(e => toast.error(e.code || e.message));
  }, [tab]);

  const saveSkills = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.staff.saveSkills(skills); setSkills(r.skills || {}); setDirty(false); toast.success("Instructors mark against these from now on", "Skills saved"); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };

  const rows = (d && d.staff) || [];
  const t = (d && d.totals) || {};
  const centres = (d && d.centres) || {};
  /* A count with no denominator says nothing. 12 stars is diligent for a
     mentor with 8 children and thin for one with 40, so coverage is the
     column that carries the meaning. */
  const covChip = (c) => c === null ? "chip-navy" : c >= 70 ? "chip-lime" : c >= 30 ? "chip-gold" : "chip-crimson";

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Staff activity</h2>
        <div className="admin-section-actions">
          <FieldSelect label="" value={String(days)} onChange={v => setDays(parseInt(v, 10) || 30)}
            options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]}/>
        </div>
      </div>
      <div className="admin-tabs">
        <button className={"admin-tab" + (tab === "activity" ? " is-active" : "")} onClick={() => setTab("activity")}>Who is filing{t.silent ? " · " + t.silent + " silent" : ""}</button>
        <button className={"admin-tab" + (tab === "skills" ? " is-active" : "")} onClick={() => setTab("skills")}>Course skills</button>
      </div>

      {tab === "activity" && <>
        <p className="admin-hint">
          Mentors and instructors together, quietest first. These are counts of work filed, not a rating — the point is to notice who has stopped, not to rank anyone.
          {d && d.scope === "lead" && " You're seeing your own centre."}
        </p>
        {err && <p className="admin-error">{err}</p>}
        {!d && !err && <p className="admin-hint">Loading…</p>}
        {d && (
          <div className="admin-chips" style={{ marginBottom: 12 }}>
            <span className="chip chip-navy">{t.staff} staff</span>
            {t.silent > 0 && <span className="chip chip-crimson">{t.silent} never filed anything</span>}
            <span className="chip chip-navy">{t.stars} stars</span>
            <span className="chip chip-navy">{t.remarks} notes</span>
            {t.flags > 0 && <span className="chip chip-gold">{t.flags} safeguarding</span>}
            <span className="chip chip-navy">{t.sessions} sessions</span>
            <span className="chip chip-navy">{t.skillMarks} skill marks</span>
          </div>
        )}
        {d && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Person</th><th>Centre</th><th>Last active</th><th>Coverage</th><th>Stars</th><th>Notes</th><th>Sessions</th><th>Skills</th></tr></thead>
              <tbody>
                {!rows.length && <tr><td colSpan={8} className="admin-empty">No mentors or instructors on record yet.</td></tr>}
                {rows.map(s => (
                  <tr key={s.staffId + s.kind}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <CentreRing centre={s.centre} centres={centres} name={s.fullName} size={34}/>
                        <span style={{ minWidth: 0 }}>
                          <span className="admin-cell-name">{s.fullName}</span>
                          {s.kind === "lead mentor" && <RankChip rank="lead"/>}
                          <div className="mono admin-cell-sub">{s.kind}{s.focus ? " · " + s.focus : ""}</div>
                        </span>
                      </div>
                    </td>
                    <td className="mono">{s.centre || "—"}</td>
                    <td>
                      {/* Never-filed is a different thing from "quiet for a
                          while", and the two must not read the same. */}
                      {s.lastActive
                        ? <>{s.quietDays === 0 ? "today" : s.quietDays + "d ago"}<div className="mono admin-cell-sub">{s.lastActive}</div></>
                        : <span className="chip chip-crimson">never</span>}
                    </td>
                    <td>
                      {s.coverage === null
                        ? <span className="admin-cell-sub">no class set</span>
                        : <><span className={"chip " + covChip(s.coverage)}>{s.coverage}%</span>
                            <div className="mono admin-cell-sub">{s.childrenStarred} of {s.classSize}</div></>}
                    </td>
                    <td>{s.stars || "—"}</td>
                    <td>{s.remarks || "—"}{s.flags > 0 && <div className="mono admin-cell-sub">{s.flags} flagged</div>}</td>
                    <td>{s.sessions || "—"}</td>
                    <td>{s.skillMarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {tab === "skills" && <>
        <p className="admin-hint">What instructors mark each child against, per course. Four levels — not yet · getting there · can do it · can teach it — and no numbers, because a score invites a ranking between children and this is meant to say what one child can now do. Seeded from the catalogue; correct them to whatever the people teaching the course actually mean.</p>
        {skills === null && <p className="admin-hint">Loading…</p>}
        {skills && Object.keys(skills).map(course => (
          <div key={course} className="admin-field" style={{ marginBottom: 14 }}>
            <span className="admin-label">{course}</span>
            <textarea className="admin-input" rows={Math.max(3, (skills[course] || []).length + 1)}
              value={(skills[course] || []).join("\n")}
              placeholder="One skill per line — verb-led and observable, e.g. “Plays hands together”."
              onChange={e => { setSkills(s => ({ ...s, [course]: e.target.value.split("\n") })); setDirty(true); }}/>
            <span className="admin-cell-sub">{(skills[course] || []).filter(x => x.trim()).length} skills</span>
          </div>
        ))}
        {skills && <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={saveSkills}>{busy ? "Saving…" : "Save skills"}</button>}
      </>}
    </div>
  );
}

function AdminBehaviour() {
  const [d, setD] = React.useState(null);
  const [f, setF] = React.useState({ status: "", category: "" });
  const [err, setErr] = React.useState("");
  const [form, setForm] = React.useState({ subjectId: "", note: "", category: "", severity: "" });
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.behaviour.list(f).then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [f.status, f.category]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await NGGApi.admin.behaviour.log(form.subjectId.trim(), form.note.trim(), form.category, form.severity);
      toast.success("Logged as " + r.category + " · " + r.severity + (r.aiSource === "manual" ? "" : " (" + r.aiSource + ")"), "Observation saved");
      setForm({ subjectId: "", note: "", category: "", severity: "" }); load();
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const review = async (logId) => { try { await NGGApi.admin.behaviour.review(logId); load(); } catch (e) { toast.error(e.code || e.message); } };
  const sevChip = (s) => s === "urgent" ? "chip-crimson" : s === "concern" ? "chip-gold" : s === "positive" ? "chip-lime" : "chip-navy";
  const logs = d ? d.logs : null;
  const cats = (d && d.categories) || ["wellbeing", "commendation", "respect", "discipline", "peer", "participation"];
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Behaviour monitor {d && d.openFlags ? <span className="chip chip-crimson" style={{ fontSize: 11, verticalAlign: "middle" }}>{d.openFlags} open flag{d.openFlags === 1 ? "" : "s"}</span> : null}</h2>
      </div>
      <p className="admin-hint">Log an observation about a student or member; it's auto-triaged (AI when configured, rules otherwise). Wellbeing/urgent notes page the team through configured integrations.</p>
      <form onSubmit={submit} className="admin-fields" style={{ maxWidth: 640, marginBottom: 18 }}>
        <div className="admin-fields-row">
          <Field label="Subject ID (student or member)" value={form.subjectId} onChange={v => setForm(o => ({ ...o, subjectId: v }))}/>
          <FieldSelect label="Category (blank = auto)" value={form.category} onChange={v => setForm(o => ({ ...o, category: v }))} options={[""].concat(cats)}/>
          <FieldSelect label="Severity (blank = auto)" value={form.severity} onChange={v => setForm(o => ({ ...o, severity: v }))} options={["", "info", "concern", "urgent", "positive"]}/>
        </div>
        <label className="admin-field"><span className="admin-label">Observation</span>
          <textarea className="admin-input" rows={3} value={form.note} onChange={e => setForm(o => ({ ...o, note: e.target.value }))} placeholder="What happened, in a sentence or two."/>
        </label>
        <div><button className="btn btn-primary btn-sm" disabled={busy || form.subjectId.trim() === "" || form.note.trim().length < 5}>{busy ? "Saving…" : "Log observation"}</button></div>
      </form>
      {d && d.trend && Object.keys(d.trend).length > 0 && (
        <div className="admin-chips" style={{ marginBottom: 12 }}>
          <span className="admin-hint" style={{ marginRight: 6 }}>Last 30 days:</span>
          {Object.entries(d.trend).map(([k, v]) => <span key={k} className="chip chip-navy" style={{ marginRight: 6 }}>{k}: {v}</span>)}
        </div>
      )}
      <div className="admin-filters">
        <select className="admin-select" value={f.status} onChange={e => setF(o => ({ ...o, status: e.target.value }))}><option value="">All statuses</option><option value="open">Open</option><option value="reviewed">Reviewed</option></select>
        <select className="admin-select" value={f.category} onChange={e => setF(o => ({ ...o, category: e.target.value }))}><option value="">All categories</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        logs === null ? <div className="dash-spinner"/> :
        logs.length === 0 ? <div className="admin-empty">No observations logged.</div> :
        <div className="admin-app-list">
          {logs.map(l => (
            <div className="admin-app" key={l.logId}>
              <div className="admin-app-top">
                <div>
                  <div className="admin-cell-name">{l.subjectName || l.subjectId} <span className={"chip " + sevChip(l.severity)}>{l.category} · {l.severity}</span></div>
                  <div className="mono admin-cell-sub">{l.observerName || l.observerId} · {fmtDate(l.createdAt)}{l.aiSource ? " · " + l.aiSource : ""}</div>
                </div>
                <span className={"chip status-" + (l.status === "reviewed" ? "published" : "draft")}>{l.status}</span>
              </div>
              <p className="admin-app-why" style={{ whiteSpace: "pre-wrap" }}>{l.note}</p>
              {l.status === "open" && <div className="admin-app-actions"><button className="btn btn-ghost btn-sm" onClick={() => review(l.logId)}>Mark reviewed</button></div>}
            </div>
          ))}
        </div>}
    </div>
  );
}

// ============================================================================
// Integrations & delivery — bus destinations, delivery log, manual dispatch
// ============================================================================

// Step-by-step setup for each integration type — the piece that was missing
// (the Sheets mirror "didn't post" because the Apps Script wasn't deployed for
// "Anyone" access, or the doPost didn't match our payload).
const APPS_SCRIPT_SHEETS = `function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  // Optional shared-secret check (matches the "Signing secret" you saved):
  // if (body.secret !== 'PASTE_SECRET') return ok('bad secret');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(body.event) || ss.insertSheet(body.event);
  var rows = [].concat(body.data.members || [body.data]);
  rows.forEach(function (r) { sheet.appendRow([new Date(), JSON.stringify(r)]); });
  return ok('ok');
}
function ok(msg){ return ContentService.createTextOutput(msg); }`;
const APPS_SCRIPT_DRIVE = `function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var d = body.data;                       // { name, url, channel, author }
  var file = UrlFetchApp.fetch(d.url).getBlob().setName(d.name || 'document');
  var folder = DriveApp.getFoldersByName('NGG Community Docs').hasNext()
    ? DriveApp.getFoldersByName('NGG Community Docs').next()
    : DriveApp.createFolder('NGG Community Docs');
  folder.createFile(file);
  return ContentService.createTextOutput('ok');
}`;
function AdminIntegrationGuide({ kind }) {
  const [open, setOpen] = React.useState(false);
  const isScript = kind === "sheets" || kind === "drive";
  const code = kind === "drive" ? APPS_SCRIPT_DRIVE : APPS_SCRIPT_SHEETS;
  return (
    <div className="admin-guide">
      <button type="button" className="admin-guide-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? "▾" : "▸"} Setup guide — {kind === "gchat" ? "Google Chat" : kind === "webhook" ? "signed webhook" : kind === "drive" ? "Drive (any provider)" : "Google Sheets"}
      </button>
      {open && (
        <div className="admin-guide-body">
          {kind === "gchat" && (
            <ol><li>In your Google Chat space → <b>Apps & integrations → Manage webhooks</b>.</li>
              <li>Create a webhook, copy its URL (starts with <code>https://chat.googleapis.com/</code>).</li>
              <li>Paste it above, choose the events, save. Use <b>Send test</b> to confirm.</li></ol>
          )}
          {kind === "webhook" && (
            <ol><li>Point the URL at your HTTPS endpoint.</li>
              <li>We sign every POST: header <code>X-NGG-Signature: sha256=HMAC(timestamp + "." + body, secret)</code>. Verify it with the signing secret shown once on save.</li>
              <li>Respond <code>2xx</code> within 15s. Non-2xx retries with backoff (8 tries → dead).</li></ol>
          )}
          {isScript && (
            <>
              <ol>
                <li>Open <a href="https://sheets.new" target="_blank" rel="noopener noreferrer">a Google Sheet</a>{kind === "drive" ? " (any Google account with Drive)" : ""} → <b>Extensions → Apps Script</b>.</li>
                <li>Delete the sample and paste the code below. Save.</li>
                <li><b>Deploy → New deployment → Web app.</b> Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>. <em>(This is the step that's usually missed — without “Anyone”, Google shows a sign-in page and nothing is written.)</em></li>
                <li>Copy the <b>/exec</b> Web app URL, paste it above, save, then <b>Send test</b>.</li>
                {kind === "drive" && <li>Set events to <code>community.document</code> so shared docs are filed to your Drive automatically.</li>}
              </ol>
              <div className="admin-guide-code">
                <div className="admin-guide-code-h"><span>Apps Script — paste into the editor</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { try { navigator.clipboard.writeText(code); toast.success("Copied"); } catch (_) {} }}>Copy</button></div>
                <pre>{code}</pre>
              </div>
              <p className="admin-guide-note">Cross-compatible: for Dropbox / OneDrive / S3, point the URL at a Zapier / Make webhook (or your own endpoint) instead — it receives the same signed JSON, so any drive works.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AdminIntegrations() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const blank = { integrationId: "", kind: "gchat", name: "", url: "", events: "*", secret: "", status: "active" };
  const [form, setForm] = React.useState(blank);
  const load = () => NGGApi.admin.integrations.list().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const edit = (i) => setForm({ integrationId: i.integrationId, kind: i.kind, name: i.name, url: i.url, events: (i.events || ["*"]).join(", "), secret: "", status: i.status });
  const save = async (e) => {
    e.preventDefault(); setBusy("save");
    try {
      const events = form.events.split(",").map(s => s.trim()).filter(Boolean);
      const r = await NGGApi.admin.integrations.upsert({ integrationId: form.integrationId || undefined, kind: form.kind, name: form.name, url: form.url, events: events.length ? events : ["*"], secret: form.secret || undefined, status: form.status });
      if (r.secret) toast.show({ kind: "success", title: "Saved — copy the secret now", body: "Signing secret (shown once): " + r.secret, ttl: 20000 });
      else toast.success("Saved.", "Integration");
      setForm(blank); load();
    } catch (e) { toast.error(e.code || e.message, "Couldn't save"); } finally { setBusy(""); }
  };
  const test = async (id) => { setBusy("t" + id); try { const r = await NGGApi.admin.integrations.test(id); r.delivered ? toast.success("Test delivered.", "OK") : toast.error(r.error || "No detail", "Test failed"); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  const remove = async (id) => { if (!confirm("Delete this integration?")) return; try { await NGGApi.admin.integrations.remove(id); load(); } catch (e) { toast.error(e.code || e.message); } };
  const dispatch = async () => { setBusy("disp"); try { const r = await NGGApi.admin.integrations.dispatch(); toast.success("Attempted " + (r.attempted || 0) + ", delivered " + (r.delivered || 0) + ", failed " + (r.failed || 0) + ".", "Queue drained"); load(); } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); } };
  const retry = async (id = "") => { setBusy("r" + id); try { const r = await NGGApi.admin.integrations.retry(id); const dsp = r.dispatch || {}; toast.success("Requeued " + (r.requeued || 0) + " · delivered " + (dsp.delivered || 0) + ", failed " + (dsp.failed || 0) + ".", "Retry"); load(); } catch (e) { toast.error(e.code || e.message, "Retry failed"); } finally { setBusy(""); } };
  const syncMembers = async () => { setBusy("sync"); try { const r = await NGGApi.admin.integrations.syncMembers(); toast.success("Sent " + (r.chunksSent || 0) + " chunk(s), " + (r.total || 0) + " members.", "Sheets sync"); } catch (e) { toast.error(e.code || e.message, "Sync failed"); } finally { setBusy(""); } };
  const items = d ? d.integrations : null;
  const health = (d && d.health) || {};
  const log = (d && d.log) || [];
  const pending = log.filter(x => x.status === "pending" || x.status === "failed").length;
  const kindHint = { gchat: "https://chat.googleapis.com/…", sheets: "https://script.google.com/macros/s/…/exec", webhook: "https://your-endpoint.example/…", drive: "https://script.google.com/macros/s/…/exec  (or any drive webhook)" }[form.kind];
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Integrations & delivery {pending ? <span className="chip chip-gold" style={{ fontSize: 11, verticalAlign: "middle" }}>{pending} queued</span> : null}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={busy === "disp"} onClick={dispatch}>{busy === "disp" ? "Draining…" : "Run delivery queue now"}</button>
          <button className="btn btn-ghost btn-sm" disabled={busy === "sync"} onClick={syncMembers}>{busy === "sync" ? "Syncing…" : "Sync members → Sheets"}</button>
        </div>
      </div>
      <p className="admin-hint">Send events (registrations, attendance, awards, wellbeing flags, shared documents) to Google Chat, a signed webhook, the Sheets mirror, or a Drive sink. Pick a type below for a step-by-step setup guide. Delivery runs automatically via web-cron; use "Run delivery queue now" to flush immediately.</p>
      <form onSubmit={save} className="admin-fields" style={{ maxWidth: 640, marginBottom: 18 }}>
        <div className="admin-fields-row">
          <FieldSelect label="Type" value={form.kind} onChange={v => setForm(o => ({ ...o, kind: v }))} options={["gchat", "webhook", "sheets", "drive"]}/>
          <Field label="Name" value={form.name} onChange={v => setForm(o => ({ ...o, name: v }))}/>
          <FieldSelect label="Status" value={form.status} onChange={v => setForm(o => ({ ...o, status: v }))} options={["active", "paused"]}/>
        </div>
        <Field label={"Destination URL"} value={form.url} onChange={v => setForm(o => ({ ...o, url: v }))} placeholder={kindHint}/>
        <Field label="Events (comma-separated; * = all, prefix.* matches)" value={form.events} onChange={v => setForm(o => ({ ...o, events: v }))} placeholder={form.kind === "drive" ? "community.document" : "* or attendance.*, registration.created"}/>
        {form.kind !== "gchat" && <Field label={"Signing secret " + (form.integrationId ? "(blank = keep current)" : "(blank = auto-generate)")} value={form.secret} onChange={v => setForm(o => ({ ...o, secret: v }))}/>}
        <AdminIntegrationGuide kind={form.kind}/>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={busy === "save" || !form.url}>{form.integrationId ? "Update" : "Add integration"}</button>
          {form.integrationId ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(blank)}>Cancel</button> : null}
        </div>
      </form>
      {err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        items === null ? <div className="dash-spinner"/> :
        <>
          {items.length === 0 ? <div className="admin-empty">No integrations yet.</div> :
            <div className="admin-app-list">
              {items.map(i => { const h = health[i.integrationId] || {}; const stuck = (h.pending || 0) + (h.dead || 0); return (
                <div className="admin-app" key={i.integrationId}>
                  <div className="admin-app-top">
                    <div>
                      <div className="admin-cell-name">{i.name} <span className="chip chip-navy">{i.kind}</span> {i.status === "paused" ? <span className="chip status-draft">paused</span> : null}</div>
                      <div className="mono admin-cell-sub">{i.url}{i.hasSecret ? " · secret " + i.secretHint : ""} · {(i.events || []).join(", ")}</div>
                      {/* Delivery health — the at-a-glance answer to "is the mirror actually receiving events?" */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                        <span className="chip chip-lime" style={{ fontSize: 11 }}>{h.ok || 0} delivered</span>
                        {h.pending ? <span className="chip status-draft" style={{ fontSize: 11 }}>{h.pending} pending</span> : null}
                        {h.dead ? <span className="chip status-archived" style={{ fontSize: 11 }}>{h.dead} dead</span> : null}
                        {h.lastOkAt ? <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>last OK {fmtDate(h.lastOkAt)}</span> : null}
                      </div>
                      {h.lastError ? <div className="mono" style={{ fontSize: 11.5, color: "#b03535", marginTop: 4, maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis" }}>Last error: {h.lastError}</div> : null}
                    </div>
                  </div>
                  <div className="admin-app-actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy === "t" + i.integrationId} onClick={() => test(i.integrationId)}>{busy === "t" + i.integrationId ? "Testing…" : "Send test"}</button>
                    {stuck ? <button className="btn btn-ghost btn-sm" disabled={busy === "r" + i.integrationId} onClick={() => retry(i.integrationId)} style={{ color: "var(--gold-600,#a07400)" }}>{busy === "r" + i.integrationId ? "Retrying…" : "Retry " + stuck + " stuck"}</button> : null}
                    <button className="btn btn-ghost btn-sm" onClick={() => edit(i)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(i.integrationId)}>Delete</button>
                  </div>
                </div>
              ); })}
            </div>}
          <div className="admin-fields-h" style={{ marginTop: 18, fontWeight: 700 }}>Recent deliveries</div>
          {log.length === 0 ? <div className="admin-empty">No deliveries yet.</div> :
            <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>Event</th><th>Status</th><th>Tries</th><th>Last error</th><th>When</th></tr></thead>
              <tbody>{log.map((x, i) => (
                <tr key={i}><td>{x.kind || x.eventId}</td><td><span className={"chip status-" + (x.status === "ok" ? "published" : x.status === "dead" ? "archived" : "draft")}>{x.status}</span></td><td>{x.attempts}</td><td className="mono" style={{ fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{x.lastError || ""}</td><td className="mono" style={{ fontSize: 12 }}>{fmtDate(x.deliveredAt || x.nextAttemptAt)}</td></tr>
              ))}</tbody>
            </table></div>}
        </>}
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
  const exportCsv = async () => {
    try {
      const r = await NGGApi.admin.audit({ all: 1, actor: f.actor, event: f.event, staffOnly: f.staffOnly ? 1 : "" });
      downloadCsv("audit-trail", (r.audit || []).map(x => ({ at: x.at, actor: x.actorName || x.actorId || "system", role: x.actorRole || "", event: x.event, subject: x.subject || "", ip: x.ip || "" })));
    } catch (e) { toast.error(e.code || e.message, "Export failed"); }
  };

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
      .catch(e => { toast.error(e.code || e.message); setC({}); });
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
            <FieldCentre value={d.centre} onChange={v => set("centre", v)} extra={["Both"]} blank="Any centre"/>
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
  const [err, setErr] = React.useState("");
  const load = () => { setErr(""); return NGGApi.admin.assignments.submissions(assignment.assignmentId)
    .then(setData).catch(e => { setErr(e.code || e.message || "load_failed"); }); };
  React.useEffect(() => { load(); }, []);
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onInput={onInput}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>Submissions · {assignment.title}</h3>
          <button type="button" className="admin-drawer-close" onClick={close} aria-label="Close">✕</button>
        </div>
        {err ? <div className="admin-empty">Couldn't load submissions. <button className="btn btn-ghost btn-sm" onClick={() => { setData(null); load(); }}>Retry</button></div> :
          !data ? <div className="dash-spinner"/> :
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
  const returnForRevision = async () => {
    setBusy(true);
    try {
      await NGGApi.admin.assignments.returnForRevision(s.submissionId, feedback);
      toast.success("Returned for revision — they can resubmit.", s.memberName);
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
        <button className="btn btn-ghost btn-sm" onClick={returnForRevision} disabled={busy} title="Send back for a revision (unlocks resubmission)">Return</button>
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
  const [err, setErr] = React.useState("");
  const [mentors, setMentors] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const load = () => { setErr(""); return NGGApi.admin.memberDetail(memberId).then(r => setD(r.detail)).catch(e => { setErr(e.code || e.message || "load_failed"); }); };
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
          <button type="button" className="admin-drawer-close" onClick={close} aria-label="Close">✕</button>
        </div>
        {err ? <div className="admin-empty">Couldn't load this member. <button className="btn btn-ghost btn-sm" onClick={() => { setD(null); load(); }}>Retry</button></div> :
         !d ? <div className="dash-spinner"/> : (
          <div className="admin-detail">
            <div className="admin-detail-top">
              <div>
                <div className="mono admin-cell-sub">{m.memberId} · {m.email}{m.phone ? " · " + m.phone : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <span className={"chip status-" + m.status}>{m.status}</span>
                  <span className="chip">{m.type}</span>
                  <span className="chip">{m.centre}</span>
                  {m.track && <span className="chip">{m.track}</span>}
                  {m.role && m.role !== "member" && <span className="chip chip-gold">{m.role}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(m)}>Edit profile</button>
            </div>

            <div className="admin-detail-stats">
              <div><b>{(d.stats || {}).level ?? "—"}</b><span>Level</span></div>
              <div><b>{(d.stats || {}).streak ?? "—"}</b><span>Streak</span></div>
              <div><b>{(d.stats || {}).xp ?? "—"}</b><span>XP</span></div>
              <div><b>{(d.progress || {}).verified ?? 0}/{(d.progress || {}).total ?? 0}</b><span>Missions</span></div>
              <div><b>{(d.journal || []).length}</b><span>Journals</span></div>
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

// One labelled row in the applicant/volunteer detail grid. Renders "—" for any
// empty value so the layout stays structured even with sparse data.
function DetailRow({ label, children }) {
  const empty = children === null || children === undefined || children === "" || (Array.isArray(children) && children.length === 0);
  return (
    <div className="admin-detail-row">
      <div className="admin-detail-key mono">{label}</div>
      <div className="admin-detail-val">{empty ? "—" : children}</div>
    </div>
  );
}

// Full, readable breakdown of everything an application/volunteer submitted —
// the structured intake data that the one-line summary can't surface.
function ApplicantDetail({ a }) {
  const fullName = [a.firstName, a.otherName, a.lastName].filter(Boolean).join(" ") || a.name || "";
  const age = (a.dobAge != null && a.dobAge >= 0) ? a.dobAge : (a.age || null);
  const dobLine = a.dob ? (a.dob + (age != null ? " · age " + age : "")) : (age != null ? "age " + age : "");
  return (
    <div className="admin-detail">
      {a.photoUrl ? <img className="admin-detail-photo" src={a.photoUrl} alt="" onError={e => { e.target.style.display = "none"; }}/> : null}
      <DetailRow label="Reference">{a.ref ? <span className="mono">{a.ref}</span> : null}</DetailRow>
      <DetailRow label="Full name">{fullName}</DetailRow>
      {(a.firstName || a.lastName) ? <DetailRow label="Name parts">{"First: " + (a.firstName || "—") + "  ·  Other: " + (a.otherName || "—") + "  ·  Last: " + (a.lastName || "—")}</DetailRow> : null}
      <DetailRow label="Email">{a.email ? <a href={"mailto:" + a.email}>{a.email}</a> : null}</DetailRow>
      <DetailRow label="Phone">{a.phone ? <a href={"tel:" + a.phone}>{a.phone}</a> : null}</DetailRow>
      <DetailRow label="Date of birth">{dobLine}</DetailRow>
      {a.sex ? <DetailRow label="Sex">{a.sex}</DetailRow> : null}
      {a.program ? <DetailRow label="Programme">{a.program}</DetailRow> : null}
      {a.centre ? <DetailRow label="Centre">{a.centre}</DetailRow> : null}
      {a.track ? <DetailRow label="Track">{a.track}</DetailRow> : null}
      {a.role ? <DetailRow label="Role">{a.role}</DetailRow> : null}
      {(a.courses && a.courses.length) ? <DetailRow label="Courses">{a.courses.join(", ")}</DetailRow> : null}
      <DetailRow label="Submitted">{fmtDate(a.createdAt)}</DetailRow>
      <DetailRow label="Reason">{a.why ? <span style={{ whiteSpace: "pre-wrap" }}>{a.why}</span> : null}</DetailRow>
    </div>
  );
}

/* Correct a pending application's data before converting/approving it.
   Mirrors admin.application.update. */
function ApplicationEditor({ a, onSaved, onDelete }) {
  const centreOpts = useCentreOptions();
  const [f, setF] = React.useState({
    name: a.name || "", email: a.email || "", phone: a.phone || "", age: a.age != null ? String(a.age) : "",
    centre: a.centre || "", track: a.track || "", role: a.role || "", faculty: a.faculty || "",
    program: a.program || "", courses: (a.courses || []).join(", "), why: a.why || "", photoUrl: a.photoUrl || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    if (f.name.trim().length < 2) { toast.error("Name needs at least 2 characters."); return; }
    setBusy(true);
    try {
      await NGGApi.admin.applications.update(a.id, { ...f, age: f.age === "" ? 0 : parseInt(f.age, 10) || 0, courses: f.courses.split(",").map(c => c.trim()).filter(Boolean) });
      toast.success("Application saved."); onSaved();
    } catch (e) { toast.error(e.code === "bad_email" ? "That email isn't valid." : e.code === "bad_age" ? "Age looks off." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  const fld = (key, label, opts = {}) => (
    <div style={{ flex: "1 1 170px", minWidth: opts.min || 140 }}>
      <span style={lbl}>{label}</span>
      <input className="admin-input" style={{ width: "100%" }} type={opts.type || "text"} value={f[key]} onChange={e => set(key, e.target.value)} placeholder={opts.ph || ""}/>
    </div>
  );
  return (
    <div style={{ padding: "14px 2px", display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid #eef0f4", marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        {fld("name", "Full name", { min: 200 })}
        {fld("email", "Email", { type: "email", min: 200 })}
        {fld("phone", "Phone")}
        {fld("age", "Age", { type: "number" })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 180px", minWidth: 150 }}><span style={lbl}>Centre</span>
          <select className="admin-input" style={{ width: "100%" }} value={f.centre || ""} onChange={e => set("centre", e.target.value)}>
            <option value="">— select —</option>
            {((f.centre && !centreOpts.includes(f.centre)) ? [f.centre, ...centreOpts] : centreOpts).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {fld("track", "Track")}
        {fld("role", "Role")}
        {fld("faculty", "Faculty")}
        {fld("courses", "Courses (comma-separated)", { min: 200 })}
      </div>
      <div><span style={lbl}>Why / message</span><textarea className="admin-input" rows={2} value={f.why} onChange={e => set("why", e.target.value)} style={{ width: "100%", resize: "vertical" }}/></div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save application"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSaved}>Cancel</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete} style={{ color: "#b03535", marginLeft: "auto" }}>Delete application</button>
      </div>
    </div>
  );
}

function AdminApplications() {
  const [list, setList] = React.useState(null);
  const [filter, setFilter] = React.useState({ kind: "", status: "" });
  const [err, setErr] = React.useState("");
  const [sel, setSel] = React.useState(() => new Set());
  const [expanded, setExpanded] = React.useState(() => new Set());
  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
  const [editId, setEditId] = React.useState(0);
  const [zoomUrl, setZoomUrl] = React.useState("");
  const removeApp = async (a) => {
    if (!(await dialog.confirm({ title: "Delete this application?", body: "Permanently removes " + a.name + "'s application. Use this for spam, duplicates or test entries. This can't be undone.", cta: "Delete", danger: true }))) return;
    try { await NGGApi.admin.applications.remove(a.id); toast.success("Application deleted."); setEditId(0); load(); } catch (e) { toast.error(e.code || e.message); }
  };
  return (
    <div className="admin-section">
      {zoomUrl && <ImageLightbox url={zoomUrl} alt="Applicant photo" onClose={() => setZoomUrl("")}/>}
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
                  {a.photoUrl && <img src={a.photoUrl} alt="" title="View photo" onClick={() => setZoomUrl(a.photoUrl)} style={{width:40, height:40, borderRadius:"50%", objectFit:"cover", flex:"0 0 auto", cursor:"zoom-in"}} onError={e => { e.target.style.display = "none"; }}/>}
                  <div>
                    <div className="admin-cell-name">{a.name} <span className="chip">{a.kind}</span>{a.program ? <span className={"chip " + (a.program === "summer" ? "chip-gold" : "chip-navy")}>{a.program}</span> : null}</div>
                    <div className="mono admin-cell-sub">{a.email}{a.age ? " · age " + a.age : ""}{a.centre ? " · " + a.centre : ""}{a.track ? " · " + a.track : ""}{a.role ? " · " + a.role : ""} · {fmtDate(a.createdAt)}</div>
                  </div>
                </div>
                <span className={"chip status-" + (a.status === "accepted" ? "published" : a.status === "rejected" ? "archived" : "draft")}>{a.status}</span>
              </div>
              {!expanded.has(a.id) && a.why && <p className="admin-app-why">{a.why}</p>}
              {expanded.has(a.id) && <ApplicantDetail a={a}/>}
              {editId === a.id && <ApplicationEditor a={a} onSaved={() => { setEditId(0); load(); }} onDelete={() => removeApp(a)}/>}
              <div className="admin-app-actions">
                <button className="btn btn-ghost btn-sm" aria-expanded={expanded.has(a.id)} onClick={() => toggleExpand(a.id)}>{expanded.has(a.id) ? "Hide details ▴" : "View details ▾"}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(editId === a.id ? 0 : a.id)}>{editId === a.id ? "Close editor" : "Edit"}</button>
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

/* Public status pages manager — publish/unpublish each board (/s-status,
   /v-status) and edit its editorial copy. Backed by the `status_pages` setting;
   the public boards read this live. */
const STATUS_BOARDS = [
  { key: "attendance", name: "Summer School attendance", route: "/s-status", accent: "#16a34a", desc: "Live per-centre attendance & participation — PII-free aggregates." },
  { key: "volunteer", name: "Volunteer status", route: "/v-status", accent: "#5a3fb0", desc: "Live volunteer needs vs filled, by centre / role / faculty / course." },
];
const STATUS_FIELDS = [
  ["title", "Headline title", "input", "The big hero heading."],
  ["tagline", "Sub-line", "input", "The line under the heading."],
  ["transparencyTitle", "Transparency heading", "input", ""],
  ["transparencyBody", "Transparency body", "textarea", "The privacy/safeguarding explainer."],
  ["ctaLabel", "Button label", "input", ""],
  ["ctaPage", "Button target page", "input", "A page id, e.g. join, volunteer, home."],
];
const STATUS_SECTION_LABELS = { kpis: "KPI tiles", centres: "Per-centre cards", trend: "Trend chart", transparency: "Transparency section", cta: "Call-to-action buttons" };
const STATUS_KPI_LABELS = { centres: "Centres", enrolled: "Students enrolled", registered: "Registered (all-time)", consentVerified: "Consent complete", consentPending: "Awaiting parent", capacity: "Capacity", capacityFill: "Capacity filled", presentToday: "Present today", attendanceRate: "Attendance rate", activeVolunteers: "Active volunteers", starsThisWeek: "Stars this week", totalVolunteers: "Total volunteers", totalNeed: "Total need", totalFilled: "Slots filled", totalGap: "Open slots" };
function StatusGroup({ label, children }) {
  return <div style={{ marginTop: 16 }}>
    <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>{label}</div>
    {children}
  </div>;
}
/* ── Dues & fees ──────────────────────────────────────────────────────────────
 * Three admin-defined amounts and one ledger. A member's account is the sum of
 * its entries, never a stored total, so "how did it get to that?" always has an
 * answer on the screen.
 *
 * Two things this screen is deliberately careful about:
 *
 * The TRAINING FEE microcopy. One quiet line under the figure, no emphasis, no
 * exclamation. It has to be true for the family who leaves early as well as the
 * one who finishes — they will owe the balance — so it states the condition
 * rather than promising the outcome. A page that shouted about a full refund
 * would have promised something the terms do not.
 *
 * The ARREARS list is sorted by what is PAYABLE, not by what is charged. A
 * member mid-service carries a large training charge that is on course to be
 * written off; ranking by the charge would put them at the top of a call list
 * they do not belong on.
 */
const FEE_KIND_LABEL = {
  membership: "Membership fee", dues: "Monthly dues", training: "Training fee",
  fine: "Fine", adjustment: "Adjustment",
  payment: "Payment received", writeoff: "Written off", waiver: "Waived",
};
/* The settings an uprate can move, by the name they carry on the form — so the
   confirm dialog names the field an admin just read rather than its key. */
const FEE_SETTING_LABEL = {
  membershipFee: "Membership fee", monthlyDues: "Monthly dues", trainingFee: "Training fee",
};
/* Why a fine was issued. Mirrors FEES_FINE_REASONS on the server; the server
   validates, this only names them. A dropdown rather than free text because a
   fine is the charge a family disputes, and "late three times in August" is
   answerable where "misconduct" is not. */
const FEE_FINE_REASONS = [
  ["late", "Late arrival"],
  ["absent", "Missed a session without notice"],
  ["equipment", "Equipment lost or damaged"],
  ["conduct", "Conduct"],
  ["other", "Other (say why)"],
];
/* The server's refusals, in words. A money screen that prints `note_required`
   at somebody has told them nothing. */
const ENTRY_ERROR = {
  bad_amount: "Enter an amount above zero.",
  bad_reason: "Choose why this fine is being issued.",
  note_required: "Say why — this one needs a written reason.",
  reason_required: "Say why this is being waived. It stays on the account.",
  nothing_outstanding: "There is nothing outstanding to waive.",
  bad_kind: "That is not something this screen can post.",
};
const ENTRY_TITLE = {
  payment: "Record a payment", fine: "Issue a fine",
  adjustment: "Adjust the account", waiver: "Waive what is owed",
};
/* `naira` is defined once further down this module and shared — these files
   concatenate into one scope, so a second copy is a build error, not a local. */

/**
 * The panel both fee dialogs sit in.
 *
 * WHY THIS EXISTS. Both of them were written against `<Modal>`, and there is no
 * `Modal` in this bundle — never has been. So opening an account from the fees
 * screen threw `Modal is not defined` and blanked the whole pane, and nothing
 * caught it because no test had ever clicked "Open →". It is the drawer idiom
 * every other admin panel uses, with the escape key, the focus trap and the
 * click-outside that come with `useAdminDrawer`.
 */
function FeeModal({ title, onClose, children }) {
  const { panelRef, close } = useAdminDrawer(onClose, false);
  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel admin-drawer-wide">
        <div className="admin-drawer-head">
          <h3>{title}</h3>
          <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
        </div>
        <div style={{ padding: "16px 20px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * One form for every money entry.
 *
 * Payment, fine, adjustment and waiver differ only in which fields they need, so
 * they share a component: an amount, and then whatever makes the entry
 * answerable six months later. The alternative — a prompt per action — is what
 * was here, and it could not carry a bank reference or a reason at all.
 */
function FeeEntryForm({ kind, account, busy, onCancel, onSubmit }) {
  const [f, setF] = React.useState({
    kind, amount: "", method: "cash", reference: "", note: "",
    reason: kind === "fine" ? FEE_FINE_REASONS[0][0] : "",
  });
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const isPay = kind === "payment", isFine = kind === "fine", isWaive = kind === "waiver";
  const owed = account.balance.outstanding;
  return (
    <FeeModal onClose={onCancel} title={ENTRY_TITLE[kind] + " — " + account.fullName}>
      <div data-fee-entry={kind}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>
            Amount
          </span>
          <input className="admin-input" type="number" min="1" autoFocus value={f.amount}
            onChange={e => set("amount", e.target.value)} style={{ maxWidth: 200, display: "block", marginTop: 6 }}/>
          {/* What is actually owed, next to the box, so a waiver is typed against
              a figure rather than from memory. */}
          <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 5 }}>
            {naira(owed)} outstanding{isWaive && owed > 0 ? " — more than this is capped to it" : ""}.
          </div>
        </label>
        {isPay && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>How it came</span>
              <select className="admin-input" value={f.method} onChange={e => set("method", e.target.value)} style={{ marginTop: 6 }}>
                <option value="cash">Cash</option>
                <option value="transfer">Bank transfer</option>
                <option value="pos">POS</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Reference</span>
              <input className="admin-input" value={f.reference} placeholder="TRF-… or receipt no."
                onChange={e => set("reference", e.target.value)} style={{ marginTop: 6 }}/>
            </label>
          </div>
        )}
        {isFine && (
          <label style={{ display: "block", marginBottom: 12 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Why</span>
            <select className="admin-input" value={f.reason} onChange={e => set("reason", e.target.value)} style={{ marginTop: 6 }}>
              {FEE_FINE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: "block", marginBottom: 14 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>
            {isWaive ? "Why it is being waived" : "Note"}
            {(isWaive || kind === "adjustment" || (isFine && f.reason === "other")) && " · required"}
          </span>
          <textarea className="admin-input" rows={2} value={f.note} onChange={e => set("note", e.target.value)}
            placeholder={isWaive ? "Hard month at home — agreed with the coordinator" : ""}
            style={{ display: "block", marginTop: 6, width: "100%", resize: "vertical" }}/>
          {isWaive && (
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 5, lineHeight: 1.5 }}>
              {/* The distinction that keeps the ledger honest, said where the
                  choice is made rather than in a document nobody opens. */}
              A waiver keeps the charge and records that you are not asking for it.
              Voiding says it should never have existed — that is a different thing.
            </div>
          )}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSubmit(f)}>
            {busy ? "Saving…" : ENTRY_TITLE[kind]}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </FeeModal>
  );
}

function AdminFees() {
  const [tab, setTab] = React.useState("arrears");   // arrears | settings
  const [cfg, setCfg] = React.useState(null);
  const [orig, setOrig] = React.useState("");
  /* `bounds` comes from the server with the settings — every maximum this form
     enforces and every number it states. Nothing here keeps its own copy: a
     floor written twice is a floor that disagrees with itself the day one of the
     two changes, and the admin is the one who finds out. */
  const [meta, setMeta] = React.useState({ defaults: {}, bounds: null });
  const [arr, setArr] = React.useState(null);
  const [acct, setAcct] = React.useState(null);
  /* The preview is loaded and shown BEFORE the send, always. Sixty messages to
     sixty guardians cannot be recalled, so "who, and how many" is a question
     that gets answered first rather than discovered afterwards. */
  const [prev, setPrev] = React.useState(null);
  /* Same rule for the uprate: what it WOULD do, field by field, before anybody
     presses anything. A price rise applied sight-unseen is the version of this
     feature that gets switched off again a week later. */
  const [up, setUp] = React.useState(null);
  /* Finding somebody who does NOT owe. The arrears list was the only door into
     an account, so a paid-up member was unreachable and "has Ada paid?" could
     not be answered on the screen that exists to answer it. */
  const [q, setQ] = React.useState("");
  const [found, setFound] = React.useState(null);
  /* One form for every money entry — payment, fine, adjustment, waiver. A
     `window.prompt` for the amount could not carry a method, a reference or a
     reason, which is most of what makes an entry answerable later. */
  const [entry, setEntry] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  /* The server's bounds, under a short name because every number on this screen
     comes through here. Empty until the settings land; the render waits for it
     rather than guessing, since a form that guesses its own maximum is the
     hardcoded copy this is meant to remove. */
  const B = meta.bounds || {};

  const loadCfg = () => NGGApi.admin.fees.settings()
    .then(r => { setCfg(r.fees); setOrig(JSON.stringify(r.fees)); setMeta({ defaults: r.defaults || {}, bounds: r.bounds || null }); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  const loadArr = () => NGGApi.admin.fees.arrears()
    .then(setArr).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { loadCfg(); loadArr(); loadUprate(); }, []);

  const dirty = cfg && orig && JSON.stringify(cfg) !== orig;
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.fees.settingsSet(cfg); setCfg(r.fees); setOrig(JSON.stringify(r.fees));
          /* Said out loud when the server floors it, rather than silently
             showing a different number than was typed. */
          if (r.fees.remindEveryDays !== cfg.remindEveryDays) toast.success("Saved — reminder spacing raised to the " + r.fees.remindEveryDays + "-day minimum.");
          else toast.success("Saved."); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const openAcct = (memberId) => NGGApi.admin.fees.member(memberId)
    .then(r => setAcct(r.account)).catch(e => toast.error(e.code || e.message));
  const refreshAcct = () => acct && openAcct(acct.memberId);

  const doLookup = async (term) => {
    const t = (term === undefined ? q : term).trim();
    if (t.length < 2) { setFound(null); return; }
    try { const r = await NGGApi.admin.fees.lookup(t); setFound(r); }
    catch (e) { toast.error(e.code || e.message); }
  };
  /* Submits whatever kind of entry the form was opened for. One path, because
     every one of them is "an amount, a reason, and who did it" — and a second
     code path is where the audit line goes missing. */
  const submitEntry = async (f) => {
    const amount = parseInt(f.amount, 10) || 0;
    if (amount <= 0) { toast.error("Enter an amount."); return; }
    setBusy(true);
    try {
      if (f.kind === "payment") {
        await NGGApi.admin.fees.payment(acct.memberId, amount, f.method, f.reference, f.note);
        toast.success(naira(amount) + " recorded.");
      } else if (f.kind === "waiver") {
        const r = await NGGApi.admin.fees.waive(acct.memberId, amount, f.note);
        /* Said out loud when less was waived than was typed — otherwise somebody
           wonders why the balance did not reach zero. */
        toast.success(naira(r.waived) + " waived." + (r.clamped ? " That was all that was outstanding." : ""));
      } else {
        const r = await NGGApi.admin.fees.charge(acct.memberId, f.kind, amount, f.reason, f.note);
        toast.success(naira(amount) + " charged.");
        if (r.overCap) toast.error("This account is now past the ceiling. Nothing further will accrue automatically.");
      }
      setEntry(null); refreshAcct(); loadArr(); if (found) doLookup();
    } catch (e) {
      toast.error(ENTRY_ERROR[e.code] || e.code || e.message);
    } finally { setBusy(false); }
  };
  const voidEntry = async (e) => {
    const reason = await dialog.prompt({
      title: "Void this entry?",
      body: "Voiding says the entry should never have existed. If the charge was real and you are choosing not to ask for it, waive it instead — that keeps the reason on the account.",
      label: "Why is this being voided?", placeholder: "Charged twice", cta: "Void it",
    });
    if (!reason) return;
    try { await NGGApi.admin.fees.void(e.entryId, reason); toast.success("Voided."); refreshAcct(); loadArr(); }
    catch (x) { toast.error(x.code || x.message); }
  };
  const completeMou = async () => {
    if (!(await dialog.confirm({ title: "Mark the MOU accomplished?",
      body: "This writes off whatever is left of the training fee and records the date. It cannot be undone from here.",
      cta: "Mark accomplished" }))) return;
    try { const r = await NGGApi.admin.fees.mou(acct.memberId);
          toast.success(r.writtenOff > 0 ? naira(r.writtenOff) + " of training fee written off." : "Recorded.");
          refreshAcct(); loadArr(); }
    catch (e) { toast.error(e.code || e.message); }
  };
  const loadPreview = () => NGGApi.admin.fees.remindPreview()
    .then(r => setPrev(r.preview)).catch(e => toast.error(e.code || e.message));
  const loadUprate = () => NGGApi.admin.fees.upratePreview()
    .then(r => setUp({ ...r.uprate, maxPct: r.maxPct, fields: r.fields || [] }))
    .catch(e => toast.error(e.code || e.message));
  const applyUprate = async () => {
    const ch = (up && up.changes) || {};
    const keys = Object.keys(ch);
    if (!keys.length) return;
    /* The confirm lists every figure, old → new, and says the one thing an admin
       most needs to hear: balances already on accounts do not move. Somebody who
       believes this reprices August will never press it; somebody who believes it
       silently forgives arrears will press it for the wrong reason. */
    if (!(await dialog.confirm({
      title: "Raise the amounts by " + up.pct + "%?",
      body: keys.map(k => (FEE_SETTING_LABEL[k] || k) + ": " + naira(ch[k].from) + " → " + naira(ch[k].to)).join(" · ")
          + ". This changes what is charged from now on. Balances already on accounts are not touched, "
          + "and it cannot be applied again for " + up.everyMonths + " months.",
      cta: "Raise the amounts" }))) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.fees.uprateApply();
      setCfg(r.fees); setOrig(JSON.stringify(r.fees));
      toast.success(Object.keys(r.applied || {}).length + " amount(s) raised by " + r.pct + "%.");
      loadUprate(); loadArr();
    } catch (e) {
      toast.error(e.code === "not_due" ? "Already raised inside the last " + ((up && up.everyMonths) || 12) + " months."
                : (e.code || e.message));
      loadUprate();
    } finally { setBusy(false); }
  };
  const sendReminders = async () => {
    const n = (prev && prev.count) || 0;
    if (!n) return;
    /* The confirm names the NUMBER and the fact that it goes to guardians. A
       bulk send whose size you cannot see is one people press once and regret,
       and these land in the inboxes of families, not colleagues. */
    if (!(await dialog.confirm({
      title: "Send " + n + " reminder" + (n === 1 ? "" : "s") + "?",
      body: "This emails " + n + " guardian" + (n === 1 ? "" : "s") + " about their outstanding balance. "
          + "It cannot be recalled. Nobody will be reminded again for at least "
          + prev.everyDays + " days.",
      cta: "Send " + n }))) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.fees.remindRun(B.remindBatch);
      const res = r.result || {};
      toast.success(res.sent + " sent" + (res.failed ? " · " + res.failed + " could not be delivered" : "") + ".");
      loadPreview(); loadArr();
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  const runAccrual = async () => {
    if (!(await dialog.confirm({ title: "Bring charges up to date?",
      body: "Adds any membership fee, monthly dues and session training fees that have not been charged yet. Safe to run twice — it cannot charge the same month twice.",
      cta: "Run" }))) return;
    setBusy(true);
    try { const r = await NGGApi.admin.fees.accrue(B.accrueBatch);
          const a = r.accrued;
          toast.success([a.dues + " dues", a.training + " training", a.membership + " joining"].join(" · ") + " charged across " + a.members + " members.");
          if (a.atCap) toast.error(a.atCap + " account(s) are at the ceiling and were not charged further.");
          loadArr(); refreshAcct(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };

  if (err) return <div className="admin-empty" style={{ color: "var(--coral)" }}>{err}</div>;
  if (!cfg || !meta.bounds) return <div className="admin-empty">Loading…</div>;

  /* Due AND with something to change: a percentage set against amounts that are
     all zero is not a review anybody needs to be nudged about. */
  const upDue = !!(up && up.enabled && up.due && Object.keys(up.changes || {}).length);

  /* `attrs` defaults to the money bounds because most of these fields ARE money.
     Every one of them comes from the server: the input's own max is the same
     number the save clamps to, so the form cannot offer what the backend will
     silently reduce. */
  const num = (k, label, hint, extra, attrs) => (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>{label}</span>
      <input className="admin-input" type="number" value={cfg[k]} style={{ maxWidth: 220, display: "block", marginTop: 6 }}
        min={(attrs && attrs.min !== undefined) ? attrs.min : 0}
        max={(attrs && attrs.max !== undefined) ? attrs.max : B.amountMax}
        onChange={e => set(k, e.target.value === "" ? 0 : parseInt(e.target.value, 10))}/>
      {hint && <div data-fee-hint="1" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
      {extra}
    </label>
  );

  return (
    <div>
      <div className="admin-filters">
        {[["arrears", "Who owes"], ["reminders", "Reminders"], ["settings", "Amounts"]].map(([k, l]) => (
          <button key={k} className={"btn btn-sm " + (tab === k ? "btn-primary" : "btn-ghost")} onClick={() => setTab(k)}>
            {l}
            {/* A dot on the tab, because an overdue review that is only visible
                once you open the tab is a review nobody performs — nothing tells
                you to look. The ops journal carries the same nudge monthly. */}
            {/* aria-hidden: the dot is decoration beside a label that already
                names the tab, and a `title` on it would otherwise be read out as
                part of the button's name. The nudge beside the tabs says it in
                words for anybody who cannot see a 7px circle. */}
            {k === "settings" && upDue && <span data-uprate-due="1" aria-hidden="true" title="A review of the amounts is due"
              style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginLeft: 6,
                       background: "var(--gold-700,#a07400)", verticalAlign: "middle" }}/>}
          </button>
        ))}
        {upDue && tab !== "settings" && (
          <button className="btn btn-ghost btn-sm" onClick={() => setTab("settings")}
            style={{ color: "var(--gold-700,#a07400)", fontSize: 12 }}>
            Amounts last raised {up.lastAt ? up.monthsSince + " months ago" : "never"} — review due →
          </button>
        )}
        {!cfg.enabled && <span className="mono" style={{ fontSize: 11, color: "var(--gold-700,#a07400)", marginLeft: 8 }}>
          Dues are switched off — nothing is being charged.
        </span>}
        <button className="btn btn-ghost btn-sm" disabled={busy || !cfg.enabled} onClick={runAccrual} style={{ marginLeft: "auto" }}>
          {busy ? "Working…" : "Bring charges up to date"}
        </button>
      </div>

      {tab === "reminders" && (
        <div className="admin-card" style={{ maxWidth: 720 }}>
          {!cfg.remindEnabled || !cfg.enabled ? (
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-600,#3c4460)" }}>
              Reminders are switched off, so nothing is being sent.
              {" "}Turn them on under <b>Amounts</b> to start.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-600,#3c4460)", marginBottom: 14 }}>
                {/* Says what the schedule actually does, because the cron ticking
                    every fifteen minutes is the thing people reasonably fear when
                    they read the word "reminder". */}
                These go out automatically, at most once every <b>{cfg.remindEveryDays} days</b> per family.
                The background job checks far more often than that; the spacing above is what decides,
                so nobody is chased faster than you set it.
                <div style={{ marginTop: 8, color: "var(--ink-500)" }}>
                  A family is only included when they have something <b>payable</b> — a training fee
                  that service is writing off is not money owed, and nobody is chased for it.
                </div>
              </div>
              {!prev
                ? <button className="btn btn-ghost btn-sm" onClick={loadPreview}>See who would be reminded</button>
                : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    <b style={{ fontSize: 15 }}>{prev.count} due a reminder now</b>
                    <button className="btn btn-ghost btn-sm" onClick={loadPreview}>Refresh</button>
                    <button className="btn btn-primary btn-sm" disabled={busy || !prev.count} onClick={sendReminders}>
                      {busy ? "Sending…" : "Send " + prev.count}
                    </button>
                  </div>
                  {/* WHY NOT, for everyone else. "It will send 4 of 60" is not a
                      number anybody can check, and "why was I never told" is the
                      question a coordinator actually gets asked. */}
                  <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.7, marginBottom: 14 }}>
                    Not included:{" "}
                    {[[prev.skipped.nothingPayable, "nothing payable"],
                      [prev.skipped.tooSoon, "reminded recently"],
                      [prev.skipped.optedOut, "asked not to be reminded"],
                      [prev.skipped.underMinimum, "under the minimum balance"],
                      [prev.skipped.noEmail, "no guardian email on file"]]
                      .filter(([n]) => n > 0).map(([n, why]) => n + " " + why).join(" · ") || "nobody — everyone with a balance is on the list"}.
                  </div>
                  {prev.count > 0 && (
                    <table className="admin-table">
                      <thead><tr><th>Member</th><th>Payable</th><th>Last reminded</th></tr></thead>
                      <tbody>{prev.due.map(d => (
                        <tr key={d.memberId}>
                          <td><b>{d.fullName}</b><div className="mono an-sub-xs">{d.memberId}</div></td>
                          <td className="mono">{naira(d.payable)}</td>
                          <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                            {d.lastRemindedAt ? String(d.lastRemindedAt).slice(0, 10) : "never"}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="admin-card" style={{ maxWidth: 620 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
            <input type="checkbox" checked={!!cfg.enabled} onChange={e => set("enabled", e.target.checked)}/>
            <b>Charge dues and fees</b>
          </label>
          {num("membershipFee", "Membership fee", "Charged once, when a member joins.")}
          {num("monthlyDues", "Monthly dues", "Charged for each month a member has been active.")}
          {num("trainingFee", "Training fee, per session",
            "Charged for each programme session that has started since they joined.",
            /* THE MICROCOPY. Quiet, one line, no emphasis — and stating the
               condition rather than promising the outcome, because a member who
               leaves before the MOU is complete still owes it. */
            /* The quietest text in the group, and measurably so: smaller than
               the explanatory line above it, normal weight, muted, italic. The
               browser test asserts the rendered size rather than the source, so
               a later edit that promotes this into a selling point fails. */
            <div data-fee-microcopy="1" style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4, fontStyle: "italic" }}>
              Written off in full once the MOU is accomplished.
            </div>)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {num("trainingMonths", "Training months", "", null, { min: B.phaseMin, max: B.phaseMax })}
            {num("serviceMonths", "Service months", "", null, { min: B.phaseMin, max: B.phaseMax })}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-500)", margin: "-4px 0 16px", lineHeight: 1.5 }}>
            Three years by default: {cfg.trainingMonths} months of training, then {cfg.serviceMonths} of service.
            Service is what earns the training fee off, a month at a time.
          </div>
          {num("balanceCap", "Stop charging at",
            "A ceiling on one member's balance. Once reached, nothing further is charged. 0 means no ceiling — available, but an account that grows past what anyone can pay pushes a family out of the programme.")}
          <label style={{ display: "flex", alignItems: "center", gap: 9, margin: "18px 0 10px" }}>
            <input type="checkbox" checked={!!cfg.remindEnabled} onChange={e => set("remindEnabled", e.target.checked)}/>
            <b>Remind guardians about arrears</b>
          </label>
          {num("remindEveryDays", "No more often than every",
            "Days between reminders to the same family. The minimum is " + B.remindMinDays + " — a family reminded daily stops reading anything you send, and your sender gets blocked.",
            null, { min: B.remindMinDays, max: B.remindMaxDays })}
          <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save amounts"}</button>
        </div>
      )}

      {/* ── Keeping the amounts worth what they were ───────────────────────────
          A fixed naira figure loses value every year it is left alone, so a
          programme that never revisits its amounts is quietly taking a pay cut.
          This raises them on a schedule — but only ever as a proposal an admin
          presses, never from the cron, and never over a balance already charged. */}
      {tab === "settings" && (
        <div className="admin-card" style={{ maxWidth: 620, marginTop: 16 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 10 }}>
            Keeping up with inflation
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {num("upratePct", "Raise amounts by", "Per cent. 0 switches it off. At most " + B.uprateMaxPct + "% at a time.",
              null, { min: 0, max: B.uprateMaxPct })}
            {num("uprateEveryMonths", "No more often than every",
              "Months. " + (meta.defaults.uprateEveryMonths || B.uprateEveryMax) + " is a yearly review.",
              null, { min: B.uprateEveryMin, max: B.uprateEveryMax })}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.6, margin: "-4px 0 14px" }}>
            {/* Both halves matter. The first is what people fear; the second is
                what they'd otherwise assume moved with it and be wrong about. */}
            {/* The list of what moves is the server's list, not a sentence somebody
                has to remember to edit when the fields change. */}
            Only the {(B.uprateFields || []).map(f => (FEE_SETTING_LABEL[f] || f).toLowerCase()).join(", ")} move,
            rounded to the nearest {naira(B.uprateRound)}.
            {" "}<b>Charges already on an account stay exactly as they were</b> — a family quoted
            {" " + naira(cfg.monthlyDues)} for a month owes that for that month, whatever the figure becomes later.
            <div style={{ marginTop: 6, color: "var(--ink-400)" }}>
              Fines are not included — those live under <b>Policy</b> and are set there.
            </div>
          </div>
          {!up ? <div className="admin-empty" style={{ padding: "8px 0" }}>Checking…</div>
            : !up.enabled ? (
            <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
              Switched off. Set a percentage above and save to use it.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, marginBottom: 10 }}>
                {up.lastAt
                  ? <>Last raised {String(up.lastAt).slice(0, 10)}{up.monthsSince !== null && <> · {up.monthsSince} month{up.monthsSince === 1 ? "" : "s"} ago</>}.</>
                  : <>Never raised.</>}
                {" "}
                {up.due ? <b style={{ color: "var(--gold-700,#a07400)" }}>Due now.</b>
                        : <span style={{ color: "var(--ink-500)" }}>Not due for another {Math.max(0, up.everyMonths - (up.monthsSince || 0))} month(s).</span>}
              </div>
              {Object.keys(up.changes || {}).length === 0
                ? <div style={{ fontSize: 13, color: "var(--ink-500)" }}>Nothing to raise — no amount is set.</div>
                : (
                <>
                  <table className="admin-table" style={{ marginBottom: 12 }}>
                    <thead><tr><th>Amount</th><th>Now</th><th>Would become</th></tr></thead>
                    <tbody>{Object.keys(up.changes).map(k => (
                      <tr key={k}>
                        <td>{FEE_SETTING_LABEL[k] || k}</td>
                        <td className="mono" style={{ color: "var(--ink-500)" }}>{naira(up.changes[k].from)}</td>
                        <td className="mono"><b>{naira(up.changes[k].to)}</b></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <button className="btn btn-primary btn-sm" disabled={busy || !up.due} onClick={applyUprate}>
                    {busy ? "Working…" : "Raise the amounts"}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={loadUprate}>Recheck</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === "arrears" && (
        <div>
          {/* Above the list, because the list is only the people who owe. Anybody
              paid up, square or in credit was previously unreachable from here. */}
          <div className="admin-card" style={{ marginBottom: 14, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="admin-input" value={q} placeholder="Find any account by name or ID…"
                onChange={e => { setQ(e.target.value); if (!e.target.value.trim()) setFound(null); }}
                onKeyDown={e => { if (e.key === "Enter") doLookup(); }}
                style={{ maxWidth: 320 }} aria-label="Find an account"/>
              <button className="btn btn-ghost btn-sm" onClick={() => doLookup()}>Find</button>
              {found && <button className="btn btn-ghost btn-sm" onClick={() => { setFound(null); setQ(""); }}>Clear</button>}
            </div>
            {found && (found.tooShort
              ? <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 8 }}>Two letters at least.</div>
              : (found.members || []).length === 0
                ? <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 8 }}>Nobody matches “{found.q}”.</div>
                : (
                <table className="admin-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>Member</th><th>Centre</th><th>Payable</th><th>Charged</th><th>Received</th><th/></tr></thead>
                  <tbody>{found.members.map(mm => (
                    <tr key={mm.memberId}>
                      <td><b>{mm.fullName}</b><div className="mono an-sub-xs">{mm.memberId} · {mm.type}</div></td>
                      <td>{mm.centre}</td>
                      {/* Zero shown as "nothing owed" rather than ₦0 — the answer
                          to "has Ada paid?" is a sentence, not a figure. */}
                      <td className="mono">{mm.payable > 0 ? <b>{naira(mm.payable)}</b>
                        : <span style={{ color: "var(--green,#2f9e44)" }}>nothing owed</span>}</td>
                      <td className="mono" style={{ color: "var(--ink-500)" }}>{naira(mm.charged)}</td>
                      <td className="mono" style={{ color: "var(--ink-500)" }}>{naira(mm.credited)}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => openAcct(mm.memberId)}>Open →</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              ))}
            {found && found.truncated && (
              <div style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 6 }}>
                First {found.max} matches — narrow it to see the rest.
              </div>
            )}
          </div>
          {!arr ? <div className="admin-empty">Loading…</div>
            : (arr.arrears || []).length === 0 ? <div className="admin-empty">Nobody is in arrears.</div> : (
            <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", fontSize: 13, color: "var(--ink-600)" }}>
                <b>{naira(arr.totalPayable)}</b> payable across {arr.matched} member{arr.matched === 1 ? "" : "s"}.
                {" "}Ranked by what is actually payable — a training fee on course to be written off is not money owed.
                {arr.truncated && <> Showing the first {(arr.arrears || []).length}.</>}
              </div>
              <table className="admin-table">
                <thead><tr><th>Member</th><th>Centre</th><th>Payable</th><th>Of which training</th><th>Phase</th><th/></tr></thead>
                <tbody>{arr.arrears.map(a => (
                  <tr key={a.memberId}>
                    <td><b>{a.fullName}</b><div className="mono an-sub-xs">{a.memberId}</div></td>
                    <td>{a.centre}</td>
                    <td className="mono"><b>{naira(a.payable)}</b>{a.atCap && <div style={{ fontSize: 11, color: "var(--coral)" }}>at the ceiling</div>}</td>
                    <td className="mono" style={{ color: "var(--ink-500)" }}>{a.trainingEarned > 0 ? "−" + naira(a.trainingEarned) + " earned off" : "—"}</td>
                    <td style={{ textTransform: "capitalize" }}>{a.phase}{a.remindOff && <div style={{ fontSize: 11, color: "var(--ink-400)" }}>reminders off</div>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => openAcct(a.memberId)}>Open →</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {acct && (
        <FeeModal onClose={() => setAcct(null)} title={acct.fullName + " — account"}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 16 }}>
            {[["Payable now", naira(acct.balance.payable)],
              ["Charged", naira(acct.balance.charged)],
              ["Received", naira(acct.balance.credited)],
              ["Training earned off", naira(acct.balance.trainingEarned)]].map(([l, v]) => (
              <div key={l} style={{ background: "var(--surface-2,#faf6ec)", borderRadius: 10, padding: "10px 12px" }}>
                <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)" }}>{l}</div>
                <div style={{ fontWeight: 700, fontSize: 17, marginTop: 3 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}>
            {acct.balance.tenure.phase === "unknown"
              ? "No join date on this record, so the three-year clock cannot be worked out."
              : <>Month {acct.balance.tenure.months} of {acct.balance.tenure.trainingMonths + acct.balance.tenure.serviceMonths} — currently in <b>{acct.balance.tenure.phase}</b>.
                 {acct.balance.tenure.phase === "service" && <> {acct.balance.tenure.servedMonths} of {acct.balance.tenure.serviceMonths} service months served.</>}</>}
            {acct.mouAt && <> MOU accomplished {String(acct.mouAt).slice(0, 10)}.</>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEntry("payment")}>Record a payment</button>
            {/* Both of these existed as valid ledger kinds and neither could be
                posted — the reminder email even rendered a Fines line that could
                never appear. A waiver is the one that matters most: without it,
                forgiving a hard month meant voiding a real charge. */}
            <button className="btn btn-ghost btn-sm" onClick={() => setEntry("fine")}>Issue a fine</button>
            <button className="btn btn-ghost btn-sm" disabled={acct.balance.outstanding <= 0}
              title={acct.balance.outstanding <= 0 ? "Nothing outstanding to waive" : ""}
              onClick={() => setEntry("waiver")}>Waive</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEntry("adjustment")}>Adjust</button>
            {!acct.mouAt && <button className="btn btn-ghost btn-sm" onClick={completeMou}>Mark MOU accomplished</button>}
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              try { await NGGApi.admin.fees.remindOff(acct.memberId, !acct.remindOff); refreshAcct(); loadArr(); }
              catch (e) { toast.error(e.code || e.message); }
            }}>{acct.remindOff ? "Allow reminders" : "Stop reminders for this family"}</button>
          </div>
          <table className="admin-table">
            <thead><tr><th>What</th><th>When</th><th>Amount</th><th/></tr></thead>
            <tbody>{acct.entries.map(e => (
              <tr key={e.entryId} style={e.void ? { opacity: .5 } : undefined}>
                <td>
                  {FEE_KIND_LABEL[e.kind] || e.kind}
                  {e.periodKey && e.periodKey.match(/^\d{4}-\d{2}$/) && <span className="mono" style={{ color: "var(--ink-400)" }}> {e.periodKey}</span>}
                  {e.note && <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{e.note}</div>}
                  {/* A corrected mistake stays visible with its reason — that is
                      the point of voiding rather than deleting. */}
                  {e.void && <div style={{ fontSize: 11.5, color: "var(--coral)" }}>Voided — {e.voidReason}</div>}
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>{String(e.createdAt).slice(0, 10)}</td>
                <td className="mono" style={{ color: e.direction === "charge" ? "var(--ink-800,#0a1130)" : "var(--green,#2f9e44)" }}>
                  {e.direction === "charge" ? "" : "−"}{naira(e.amount)}
                </td>
                <td>{!e.void && <button className="btn btn-ghost btn-sm" onClick={() => voidEntry(e)}>Void</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </FeeModal>
      )}

      {acct && entry && (
        <FeeEntryForm kind={entry} account={acct} busy={busy}
          onCancel={() => setEntry(null)} onSubmit={submitEntry}/>
      )}
    </div>
  );
}
function AdminStatusPages() {
  const [cfg, setCfg] = React.useState(null);
  const [orig, setOrig] = React.useState(null);
  const [meta, setMeta] = React.useState({ defaults: {}, centres: [] });
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const load = () => NGGApi.admin.statusPages().then(r => { setCfg(r.statusPages); setOrig(JSON.stringify(r.statusPages)); setMeta({ defaults: r.defaults || {}, centres: r.centreOptions || [] }); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const dirty = cfg && orig && JSON.stringify(cfg) !== orig;
  const set = (board, key, val) => setCfg(c => ({ ...c, [board]: { ...c[board], [key]: val } }));
  const setSub = (board, key, sub, val) => setCfg(c => ({ ...c, [board]: { ...c[board], [key]: { ...c[board][key], [sub]: val } } }));
  const toggleCentre = (board, name) => setCfg(c => {
    const all = meta.centres.map(x => x.name);
    let cur = (c[board].centres && c[board].centres.length) ? [...c[board].centres] : all.slice();
    cur = cur.includes(name) ? cur.filter(x => x !== name) : [...cur, name];
    return { ...c, [board]: { ...c[board], centres: cur.length === all.length ? [] : cur } };
  });
  const reset = async (board) => {
    const ok = await dialog.confirm({ title: "Reset to defaults?", body: "This restores the built-in copy, sections and settings for this board. You can still Save or discard afterwards.", cta: "Reset" });
    if (ok && meta.defaults[board]) setCfg(c => ({ ...c, [board]: JSON.parse(JSON.stringify(meta.defaults[board])) }));
  };
  const save = async () => {
    setBusy(true);
    try { const r = await NGGApi.admin.statusPagesSet(cfg); setCfg(r.statusPages); setOrig(JSON.stringify(r.statusPages)); toast.success("Status pages updated."); }
    catch (e) { toast.error(e.code || e.message); }
    finally { setBusy(false); }
  };

  if (err) return <ErrorState title="Couldn't load status pages" code={err} onRetry={load}/>;
  if (!cfg) return <div className="dash-spinner"/>;

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Public status pages</h2>
        <div className="admin-section-actions">
          {dirty && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setCfg(JSON.parse(orig)); }}>Discard</button>}
          <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
        </div>
      </div>
      <p className="admin-hint" style={{ marginTop: 0 }}>Full control of each live board — publish, copy, which sections and KPI tiles show, accent colour, trend window, which centres appear, and an announcement banner. Numbers stay aggregate-only and PII-free; you control the wrapper here, and edit the underlying data in the places below.</p>
      <div className="card" style={{ padding: 16, margin: "0 0 18px", background: "var(--bg-sunken, #f7f7f4)" }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-500)", marginBottom: 8 }}>Where the board's data is edited</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("registration", "centres")}>🏫 Centres — name, address, lead, meeting times →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("registration", "catalogue")}>🎓 Academy catalogue — faculties &amp; their courses →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("volunteers", "needs")}>◈ Volunteer needs (the /v-status targets) →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("registration", "gates")}>❑ Students (enrolment & records) →</button>
          <button className="btn btn-ghost btn-sm" onClick={() => adminJump("volunteers", "roster")}>◈ Volunteers (roster) →</button>
        </div>
        <p className="admin-hint" style={{ margin: "10px 0 0" }}>The live KPIs (attendance %, present today, leaderboard) are computed from real attendance, stars and activity records — they update automatically as those are logged; there's nothing to type here.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(400px,1fr))", gap: 18 }}>
        {STATUS_BOARDS.map(b => {
          const c = cfg[b.key] || {};
          const on = !!c.published;
          const shownAll = !c.centres || c.centres.length === 0;
          return (
            <div key={b.key} className="card" style={{ padding: 20, borderTop: "4px solid " + b.accent }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{b.name}</div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{b.route}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreview(preview === b.key ? null : b.key)}>{preview === b.key ? "Hide preview" : "Preview"}</button>
                  <a className="btn btn-ghost btn-sm" href={b.route} target="_blank" rel="noreferrer">Live ↗</a>
                </div>
              </div>

              <button type="button" onClick={() => set(b.key, "published", !on)}
                style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0", padding: "10px 12px", borderRadius: 12, width: "100%", cursor: "pointer",
                  border: "1px solid " + (on ? "rgba(22,163,74,.4)" : "var(--line-cool,#e5e8ee)"), background: on ? "rgba(22,163,74,.08)" : "var(--cream-50,#faf7ef)" }}>
                <span style={{ width: 40, height: 22, borderRadius: 99, background: on ? "#16a34a" : "#c4cad8", position: "relative", flex: "none", transition: "background .15s" }}>
                  <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }}/>
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: on ? "#15803d" : "var(--ink-500)" }}>{on ? "Published — live to the public" : "Unpublished — hidden with an “offline” notice"}</span>
              </button>

              <div style={{ opacity: on ? 1 : 0.55, pointerEvents: on ? "auto" : "none" }}>
                <StatusGroup label="Copy">
                  <div style={{ display: "grid", gap: 10 }}>
                    {STATUS_FIELDS.map(([key, label, type, hint]) => (
                      <div key={key} className="field">
                        <label style={{ fontSize: 12, fontWeight: 600 }}>{label}</label>
                        {type === "textarea"
                          ? <textarea className="admin-input" rows={3} value={c[key] || ""} onChange={e => set(b.key, key, e.target.value)} style={{ resize: "vertical" }}/>
                          : <input className="admin-input" value={c[key] || ""} onChange={e => set(b.key, key, e.target.value)}/>}
                        {hint && <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 3 }}>{hint}</div>}
                      </div>
                    ))}
                  </div>
                </StatusGroup>

                <StatusGroup label="Sections shown">
                  <div style={{ display: "grid", gap: 6 }}>
                    {Object.keys(c.sections || {}).map(sk => (
                      <label key={sk} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={c.sections[sk] !== false} onChange={e => setSub(b.key, "sections", sk, e.target.checked)}/> {STATUS_SECTION_LABELS[sk] || sk}
                      </label>
                    ))}
                  </div>
                </StatusGroup>

                <StatusGroup label="KPI tiles">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {Object.keys(c.kpis || {}).map(kk => (
                      <label key={kk} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={c.kpis[kk] !== false} onChange={e => setSub(b.key, "kpis", kk, e.target.checked)}/> {STATUS_KPI_LABELS[kk] || kk}
                      </label>
                    ))}
                  </div>
                </StatusGroup>

                <StatusGroup label="Appearance">
                  <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      Accent <input type="color" value={c.accent || "#d0ff3a"} onChange={e => set(b.key, "accent", e.target.value)} style={{ width: 40, height: 30, border: "1px solid var(--line-cool)", borderRadius: 8, background: "none", cursor: "pointer" }}/>
                    </label>
                    {"trendDays" in c && (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        Trend window
                        <select className="admin-input" style={{ width: "auto" }} value={c.trendDays} onChange={e => set(b.key, "trendDays", parseInt(e.target.value, 10))}>
                          <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
                        </select>
                      </label>
                    )}
                  </div>
                </StatusGroup>

                <StatusGroup label={"Centres shown" + (shownAll ? " · all" : " · " + c.centres.length + " selected")}>
                  {meta.centres.length === 0 ? <div style={{ fontSize: 12, color: "var(--ink-400)" }}>No active centres yet.</div>
                    : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {meta.centres.map(ct => (
                        <label key={ct.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                          <input type="checkbox" checked={shownAll || c.centres.includes(ct.name)} onChange={() => toggleCentre(b.key, ct.name)}/>
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: ct.color || "#999", display: "inline-block" }}/> {ct.name}
                        </label>
                      ))}
                    </div>}
                  <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4 }}>Uncheck to hide a centre from the public board. All checked = show every centre.</div>
                </StatusGroup>

                <StatusGroup label="Announcement banner">
                  <input className="admin-input" placeholder="Optional banner text (leave blank for none)" value={(c.banner && c.banner.text) || ""} onChange={e => setSub(b.key, "banner", "text", e.target.value)}/>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {["info", "success", "warn"].map(t => (
                      <button key={t} type="button" onClick={() => setSub(b.key, "banner", "tone", t)}
                        className={"chip" + ((c.banner && c.banner.tone) === t ? " chip-navy" : "")}
                        style={{ textTransform: "capitalize", cursor: "pointer" }}>{t}</button>
                    ))}
                  </div>
                </StatusGroup>

                <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => reset(b.key)}>↺ Reset to defaults</button>
              </div>
            </div>
          );
        })}
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 18, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line-cool,#e5e8ee)", flexWrap: "wrap" }}>
            <b>Live preview — {(STATUS_BOARDS.find(x => x.key === preview) || {}).name}</b>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>Copy, sections, KPIs, accent &amp; banner update as you edit · centre &amp; trend filters apply after saving</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
          <div style={{ maxHeight: 680, overflow: "auto", background: "var(--paper,#fbf7ed)" }}>
            {preview === "attendance" ? <StatusPage previewConfig={cfg.attendance}/> : <VolunteerStatusPage previewConfig={cfg.volunteer}/>}
          </div>
        </div>
      )}
    </div>
  );
}

/* Volunteer needs editor — the admin sets target headcount per centre × role
   (and optionally per faculty), with live filled counts so they never edit
   blind. Feeds the public /v-status fulfilment board. */
/* One editable material-need row: item name (fixed), received count, and an
 * OPTIONAL needed target (blank = open-ended request, no specific amount).
 * Saves on blur; local state seeded from props so a reload refreshes it. */
function ItemNeedRow({ it, busy, onSave, onRemove }) {
  const [need, setNeed] = React.useState((it.needCount ?? 0) ? String(it.needCount) : "");
  const [filled, setFilled] = React.useState(String(it.filledCount ?? 0));
  const needN = parseInt(need || "0", 10) || 0;
  const filledN = parseInt(filled || "0", 10) || 0;
  const open = needN === 0;
  const gap = Math.max(0, needN - filledN);
  const save = () => { if (needN !== (it.needCount ?? 0) || filledN !== (it.filledCount ?? 0)) onSave(it.item, need, filled, it.unit, it.note); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 600, flex: "1 1 120px", minWidth: 100 }}>{it.item}{it.unit ? <span className="mono" style={{ fontSize: 10, color: "var(--ink-400)", marginLeft: 4 }}>{it.unit}</span> : null}</span>
      <input className="admin-input" type="number" min="0" style={{ width: 62 }} value={filled} onChange={e => setFilled(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} aria-label={"received " + it.item}/>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>/</span>
      <input className="admin-input" type="number" min="0" style={{ width: 62 }} value={need} placeholder="any" onChange={e => setNeed(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} aria-label={"needed " + it.item + " (blank = no set amount)"}/>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)", minWidth: 54 }}>
        {busy ? "saving…" : (open ? <b style={{ color: "#7a6cff" }}>open</b> : (gap > 0 ? <b style={{ color: "#c0851a" }}>{gap} gap</b> : <b style={{ color: "#2f9e44" }}>met ✓</b>))}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={() => onRemove(it.item)} title="Remove item" style={{ padding: "2px 8px" }}>✕</button>
    </div>
  );
}

function VolunteerNeedsEditor() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [draft, setDraft] = React.useState({});
  const [saving, setSaving] = React.useState("");
  const [facOpen, setFacOpen] = React.useState(() => new Set());
  const [itemOpen, setItemOpen] = React.useState(() => new Set());
  const [newItem, setNewItem] = React.useState({});   // centreId -> {item, needCount, filledCount, unit}
  const [itemBusy, setItemBusy] = React.useState("");
  const load = () => NGGApi.admin.volunteers.needsList().then(r => { setD(r); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);

  const itemsByCentre = {};
  (d ? (d.items || []) : []).forEach(it => { (itemsByCentre[it.centreId] = itemsByCentre[it.centreId] || []).push(it); });
  const toggleItems = (cid) => setItemOpen(s => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const saveItem = async (centreId, item, needCount, filledCount, unit, note) => {
    const nm = String(item || "").trim();
    if (!nm) { toast.error("Give the item a name."); return; }
    setItemBusy(centreId + "|" + nm);
    try { await NGGApi.admin.volunteers.itemUpsert(centreId, nm, Math.max(0, parseInt(needCount || "0", 10) || 0), Math.max(0, parseInt(filledCount || "0", 10) || 0), unit || "", note || ""); }
    catch (e) { toast.error(e.code || e.message); }
    setItemBusy(""); load();
  };
  const addItem = async (centreId) => {
    const n = newItem[centreId] || {};
    if (!String(n.item || "").trim()) { toast.error("Give the item a name."); return; }
    await saveItem(centreId, n.item, n.needCount, n.filledCount, n.unit, "");
    setNewItem(s => ({ ...s, [centreId]: {} }));
  };
  const removeItem = async (centreId, item) => {
    if (!(await dialog.confirm({ title: "Remove \"" + item + "\"?", body: "This item need stops showing on the board.", cta: "Remove" }))) return;
    try { await NGGApi.admin.volunteers.itemDelete(centreId, item); load(); } catch (e) { toast.error(e.code || e.message); }
  };

  const needMap = {};
  (d ? d.needs : []).forEach(n => { needMap[n.centreId + "|" + n.role + "|" + (n.faculty || "")] = n.needCount; });
  const filled = (d && d.filled) || { centre: {}, role: {}, faculty: {} };
  const roleMeta = { admin: "Admin / Ops", mentor: "Mentor", instructor: "Instructor" };

  const cellVal = (key, fallback) => (key in draft ? draft[key] : (fallback === undefined ? "" : fallback));
  const commit = async (centreId, role, faculty) => {
    const key = centreId + "|" + role + "|" + faculty;
    if (!(key in draft)) return;
    const v = Math.max(0, parseInt(draft[key] || "0", 10) || 0);
    setSaving(key);
    try { await NGGApi.admin.volunteers.needUpsert(centreId, role, faculty, v); }
    catch (e) { toast.error(e.code || e.message); }
    setSaving(""); setDraft(s => { const n = { ...s }; delete n[key]; return n; }); load();
  };
  const toggleFac = (cid) => setFacOpen(s => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

  if (err) return <ErrorState title="Couldn't load needs" code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner"/>;
  if (!d.centres.length) return <div className="admin-empty">No active centres yet — add centres under Registration → Centres first.</div>;

  const numInput = (centreId, role, faculty, filledCount) => {
    const key = centreId + "|" + role + "|" + faculty;
    const need = cellVal(key, needMap[key] ?? "");
    const needN = parseInt(need || "0", 10) || 0;
    const gap = Math.max(0, needN - filledCount);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input className="admin-input" type="number" min="0" style={{ width: 74 }} value={need}
          onChange={e => setDraft(s => ({ ...s, [key]: e.target.value }))}
          onBlur={() => commit(centreId, role, faculty)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          placeholder="0" aria-label={"need for " + role}/>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>
          {saving === key ? "saving…" : <>{filledCount} on board{needN > 0 ? (gap > 0 ? " · " : " · ") : ""}{needN > 0 && (gap > 0 ? <b style={{ color: "#c0851a" }}>{gap} gap</b> : <b style={{ color: "#2f9e44" }}>full ✓</b>)}</>}
        </span>
      </div>
    );
  };

  return (
    <div>
      <p className="admin-hint" style={{ marginTop: 0 }}>Set how many volunteers each centre needs per role (live counts show who's already signed up), and the <b>items</b> a centre needs — laptops, keyboards, chairs, data — with how many have come in. Both drive the public <b>/v-status</b> board. Optionally set finer per-faculty targets.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
        {d.centres.map(c => (
          <div key={c.centreId} className="card" style={{ padding: 18, borderTop: "4px solid " + (c.color || "#5a3fb0") }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{c.name} <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{c.code}</span></div>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{filled.centre[c.centreId] || 0} on board</span>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {d.roles.map(role => (
                <div key={role} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 96 }}>{roleMeta[role] || role}</span>
                  {numInput(c.centreId, role, "", filled.role[c.centreId + "|" + role] || 0)}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => toggleFac(c.centreId)} aria-expanded={facOpen.has(c.centreId)}>
              {facOpen.has(c.centreId) ? "Hide faculty targets ▴" : "Faculty targets (optional) ▾"}
            </button>
            {facOpen.has(c.centreId) && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line-cool-soft,#eef0f4)", paddingTop: 12, display: "grid", gap: 12 }}>
                {["mentor", "instructor"].map(role => (
                  <div key={role}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 6 }}>{roleMeta[role]} · by faculty</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {d.faculties.map(f => (
                        <div key={f} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, minWidth: 120 }}>{f}</span>
                          {numInput(c.centreId, role, f, filled.faculty[c.centreId + "|" + f] || 0)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => toggleItems(c.centreId)} aria-expanded={itemOpen.has(c.centreId)}>
              {itemOpen.has(c.centreId) ? "Hide items needed ▴" : "Items needed" + ((itemsByCentre[c.centreId] || []).length ? " · " + itemsByCentre[c.centreId].length : "") + " ▾"}
            </button>
            {itemOpen.has(c.centreId) && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line-cool-soft,#eef0f4)", paddingTop: 12 }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 8 }}>Materials · received / needed <span style={{ textTransform: "none", letterSpacing: 0 }}>(leave needed blank for an open request)</span></div>
                <div style={{ display: "grid", gap: 8 }}>
                  {(itemsByCentre[c.centreId] || []).map(it => (
                    <ItemNeedRow key={it.item} it={it} busy={itemBusy === c.centreId + "|" + it.item}
                      onSave={(item, need, filled, unit, note) => saveItem(c.centreId, item, need, filled, unit, note)}
                      onRemove={(item) => removeItem(c.centreId, item)}/>
                  ))}
                  {!(itemsByCentre[c.centreId] || []).length && <div className="admin-cell-sub" style={{ fontSize: 12 }}>No items yet — add one below (e.g. Laptops, Keyboards, Chairs, Data).</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                  <input className="admin-input" placeholder="Item (e.g. Laptops)" value={(newItem[c.centreId] || {}).item || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], item: e.target.value } }))} style={{ flex: "1 1 130px", minWidth: 110 }}/>
                  <input className="admin-input" type="number" min="0" placeholder="have" value={(newItem[c.centreId] || {}).filledCount || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], filledCount: e.target.value } }))} style={{ width: 58 }} aria-label="received"/>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>/</span>
                  <input className="admin-input" type="number" min="0" placeholder="any" value={(newItem[c.centreId] || {}).needCount || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], needCount: e.target.value } }))} style={{ width: 58 }} aria-label="needed (blank = no set amount)"/>
                  <input className="admin-input" placeholder="unit" value={(newItem[c.centreId] || {}).unit || ""} onChange={e => setNewItem(s => ({ ...s, [c.centreId]: { ...s[c.centreId], unit: e.target.value } }))} style={{ width: 66 }} aria-label="unit"/>
                  <button className="btn btn-primary btn-sm" onClick={() => addItem(c.centreId)}>+ Add</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Edit an active volunteer's data — name, contact, role, centre, faculty,
   courses, visibility consent, status, photo. Mirrors admin.volunteers.update. */
function VolunteerEditor({ v, onSaved, onDelete }) {
  const centreOpts = useCentreOptions();
  const [f, setF] = React.useState({
    fullName: v.fullName || "", firstName: v.firstName || "", lastName: v.lastName || "",
    email: v.email || "", phone: v.phone || "", role: v.role || "mentor",
    centre: v.centre || "", faculty: v.faculty || "", courses: (v.courses || []).join(", "),
    visibilityConsent: !!v.visibilityConsent, status: v.status || "active", photoUrl: v.photoUrl || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, val) => setF(x => ({ ...x, [k]: val }));
  const save = async () => {
    if ((f.firstName.trim() + f.lastName.trim()).length < 2) { toast.error("Enter a first and last name."); return; }
    setBusy(true);
    try {
      await NGGApi.admin.volunteers.update(v.volunteerId, {
        ...f, courses: f.courses.split(",").map(c => c.trim()).filter(Boolean), visibilityConsent: f.visibilityConsent ? 1 : 0,
      });
      toast.success("Volunteer saved."); onSaved();
    } catch (e) { toast.error(e.code === "bad_email" ? "That email isn't valid." : e.code === "bad_role" ? "Pick a valid role." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  const fld = (key, label, opts = {}) => (
    <div style={{ flex: "1 1 180px", minWidth: opts.min || 150 }}>
      <span style={lbl}>{label}</span>
      <input className="admin-input" style={{ width: "100%" }} type={opts.type || "text"} value={f[key]} onChange={e => set(key, e.target.value)} placeholder={opts.ph || ""}/>
    </div>
  );
  return (
    <div style={{ padding: "16px 4px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div><span style={lbl}>Photo</span><PhotoCapture value={f.photoUrl} onChange={val => set("photoUrl", val)} size={80} label="Volunteer photo"/></div>
        <div style={{ flex: 1, minWidth: 260, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          {fld("fullName", "Full name", { min: 200 })}
          {fld("email", "Email", { type: "email", min: 200 })}
          {fld("phone", "Phone")}
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Role</span><select className="admin-select" value={f.role} onChange={e => set("role", e.target.value)}><option value="admin">Admin / Ops</option><option value="mentor">Mentor</option><option value="instructor">Instructor</option></select></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Status</span><select className="admin-select" value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        {fld("firstName", "First name")}
        {fld("lastName", "Last name")}
        <div style={{ flex: "1 1 180px", minWidth: 150 }}><span style={lbl}>Centre</span>
          <select className="admin-input" style={{ width: "100%" }} value={f.centre || ""} onChange={e => set("centre", e.target.value)}>
            <option value="">— select —</option>
            {((f.centre && !centreOpts.includes(f.centre)) ? [f.centre, ...centreOpts] : centreOpts).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {fld("faculty", "Faculty")}
        {fld("courses", "Courses (comma-separated)", { min: 220 })}
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 600 }}>
        <input type="checkbox" checked={f.visibilityConsent} onChange={e => set("visibilityConsent", e.target.checked)}/>
        Consented to be featured (photo + first name) on the public site &amp; boards
      </label>
      <ProfileExtrasEditor subjectType="volunteer" subjectId={v.volunteerId}/>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save volunteer"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSaved}>Cancel</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete} style={{ color: "#b03535", marginLeft: "auto" }}>Delete volunteer</button>
      </div>
    </div>
  );
}

/* Sentinel for "no centre on file". A real centre name is trimmed non-empty,
   so it can never collide, and the filter stays one value instead of a value
   plus a boolean that can contradict it. */
const VOL_NO_CENTRE = " none";

function AdminVolunteers() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [tab, setTab] = React.useState(() => takePendingAdminTab("pending"));
  const [q, setQ] = React.useState("");
  const [vCentre, setVCentre] = React.useState("");
  const [expanded, setExpanded] = React.useState(() => new Set());
  const toggleExpand = (id) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
  const [editId, setEditId] = React.useState("");
  const removeVol = async (v) => {
    if (!(await dialog.confirm({ title: "Delete " + v.fullName + "?", body: "This permanently removes the volunteer record and their check-in QR. This can't be undone.", cta: "Delete", danger: true }))) return;
    try { await NGGApi.admin.volunteers.remove(v.volunteerId); toast.success("Volunteer deleted."); setEditId(""); load(); } catch (e) { toast.error(e.code || e.message); }
  };

  const roleChip = (r) => <span className={"chip " + (r === "instructor" ? "chip-gold" : r === "mentor" ? "chip-lime" : "chip-navy")}>{r}</span>;
  const pending = (data && data.pending) || [];
  const all = (data && data.volunteers) || [];
  /* A volunteer with no centre is invisible in every per-site count and prints
     an ID card with nothing on it saying where they belong. The list of
     centres cannot surface them — "none" is not a centre — so it gets its own
     option, and a count next to it so nobody has to go looking. */
  const noCentre = all.filter(v => !(v.centre || "").trim()).length;
  const centreOpts = Array.from(new Set(all.map(v => (v.centre || "").trim()).filter(Boolean))).sort();
  const inCentre = (v) => {
    const c = (v.centre || "").trim();
    if (vCentre === VOL_NO_CENTRE) return !c;
    if (vCentre) return c === vCentre;
    return true;
  };
  const roster = all.filter(v => {
    if (!inCentre(v)) return false;
    if (!q.trim()) return true;
    const s = (v.fullName + " " + v.volunteerId + " " + v.email + " " + v.role).toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Volunteers {data ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {pending.length} pending · {(data.volunteers || []).length} active</span> : null}</h2>
        <div className="admin-section-actions">
          <button className="btn btn-ghost btn-sm" disabled={!data || !(data.volunteers || []).length} onClick={() => downloadCsv("volunteers", (data.volunteers || []).map(v => ({ volunteerId: v.volunteerId, name: v.fullName, email: v.email, phone: v.phone || "", role: v.role, centre: v.centre || "", faculty: v.faculty || "", courses: (v.courses || []).join("; "), safeguarding: v.safeguarding, status: v.status, createdAt: v.createdAt })))}>Export CSV</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={"admin-tab" + (tab === "pending" ? " is-active" : "")} onClick={() => setTab("pending")}>Review queue{pending.length ? " · " + pending.length : ""}</button>
        <button className={"admin-tab" + (tab === "roster" ? " is-active" : "")} onClick={() => setTab("roster")}>Roster · {(data && (data.volunteers || []).length) || 0}</button>
        <button className={"admin-tab" + (tab === "needs" ? " is-active" : "")} onClick={() => setTab("needs")}>Needs &amp; /v-status</button>
      </div>

      {tab === "needs" ? <VolunteerNeedsEditor/> :
        err ? <ErrorState title="Couldn't load" code={err} onRetry={load}/> :
        data === null ? <div className="dash-spinner"/> :

        tab === "pending" ? (
          pending.length === 0 ? <div className="admin-empty">No volunteers waiting for review. 🎉</div> :
          <div className="admin-app-list">
            {pending.map(a => (
              <div className="admin-app" key={a.id}>
                <div className="admin-app-top">
                  <div>
                    <div className="admin-cell-name">{a.name} {roleChip(a.role)}</div>
                    <div className="mono admin-cell-sub">{a.email}{a.phone ? " · " + a.phone : " · no phone"}{a.centre ? " · 🏫 " + a.centre : ""}{a.faculty ? " · " + a.faculty : ""}{(a.courses || []).length ? " · " + a.courses.join(", ") : ""} · {fmtDate(a.createdAt)}</div>
                  </div>
                  {a.role === "instructor" && !a.phone && <span className="chip status-archived">phone required</span>}
                </div>
                {!expanded.has(a.id) && a.why && <p className="admin-app-why">{a.why}</p>}
                {expanded.has(a.id) && <ApplicantDetail a={a}/>}
                <div className="admin-app-actions">
                  <button className="btn btn-ghost btn-sm" aria-expanded={expanded.has(a.id)} onClick={() => toggleExpand(a.id)}>{expanded.has(a.id) ? "Hide details ▴" : "View details ▾"}</button>
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
              <select className="admin-select" value={vCentre} onChange={e => setVCentre(e.target.value)} aria-label="Filter volunteers by centre">
                <option value="">All centres · {all.length}</option>
                {centreOpts.map(c => <option key={c} value={c}>{c} · {all.filter(v => (v.centre || "").trim() === c).length}</option>)}
                {noCentre > 0 && <option value={VOL_NO_CENTRE}>⚠ No centre on file · {noCentre}</option>}
              </select>
              {noCentre > 0 && vCentre !== VOL_NO_CENTRE &&
                <button className="btn btn-ghost btn-sm" onClick={() => setVCentre(VOL_NO_CENTRE)}>⚠ {noCentre} with no centre</button>}
            </div>
            {vCentre === VOL_NO_CENTRE && roster.length > 0 &&
              <p className="admin-hint" style={{ margin: "-2px 0 10px" }}>
                These volunteers are missing from every per-centre count, and their ID card prints with no centre colour, code or band. Edit each one to set it.
              </p>}
            {roster.length === 0 ? <div className="admin-empty">{all.length ? "No volunteer matches that filter." : "No volunteers yet."}</div> :
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Volunteer</th><th>Role</th><th>Centre</th><th>Faculty / Courses</th><th>Safeguarding</th><th>ID</th><th></th></tr></thead>
                <tbody>
                  {roster.map(v => (
                    <React.Fragment key={v.volunteerId}>
                    <tr>
                      <td><div className="admin-cell-name">{v.fullName}</div><div className="mono admin-cell-sub">{v.volunteerId} · {v.email}</div></td>
                      <td>{roleChip(v.role)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{v.centre || "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{[v.faculty, (v.courses || []).join(", ")].filter(Boolean).join(" · ") || "—"}</td>
                      <td>
                        {v.safeguarding === "cleared"
                          ? <span className="chip chip-lime">✓ screened</span>
                          : <span className="chip status-archived">pending</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}><a href={"/q/" + v.token} target="_blank" rel="noreferrer">/q/{(v.token || "").slice(0, 10)}…</a></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(editId === v.volunteerId ? "" : v.volunteerId)}>{editId === v.volunteerId ? "Close" : "Edit"}</button>
                        {v.safeguarding === "cleared"
                          ? <button className="btn btn-ghost btn-sm" disabled={busy === "s" + v.volunteerId} onClick={() => setSafeguard(v, "pending")}>Un-clear</button>
                          : <button className="btn btn-primary btn-sm" disabled={busy === "s" + v.volunteerId} onClick={() => setSafeguard(v, "cleared")}>{busy === "s" + v.volunteerId ? "…" : "Mark screened"}</button>}
                      </td>
                    </tr>
                    {editId === v.volunteerId && <tr><td colSpan={7} style={{ background: "rgba(12,20,50,0.03)" }}><VolunteerEditor v={v} onSaved={() => { setEditId(""); load(); }} onDelete={() => removeVol(v)}/></td></tr>}
                    </React.Fragment>
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

/* Homepage promo banner editor — text + optional CTA + expiry. */
function AdminPromo() {
  const [p, setP] = React.useState({ text: "", ctaLabel: "", ctaUrl: "", expires: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { NGGApi.admin.promotions.get().then(r => { if (r.promo) setP({ text: r.promo.text || "", ctaLabel: r.promo.ctaLabel || "", ctaUrl: r.promo.ctaUrl || "", expires: (r.promo.expires || "").slice(0, 10) }); }).catch(() => {}); }, []);
  const save = async (clear) => {
    setBusy(true);
    try {
      const promo = clear ? null : { text: p.text.trim(), ctaLabel: p.ctaLabel.trim(), ctaUrl: p.ctaUrl.trim(), expires: p.expires ? p.expires + "T23:59:59Z" : "" };
      await NGGApi.admin.promotions.set(promo);
      if (clear) setP({ text: "", ctaLabel: "", ctaUrl: "", expires: "" });
      toast.success(clear ? "Promo cleared." : "Promo saved — live on the homepage.", "Homepage promo");
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Homepage promo banner</div>
      <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>A dismissible banner across the top of the public homepage. Leave the text blank (or Clear) to hide it; set an expiry to auto-retire it.</p>
      <Field label="Banner text" value={p.text} onChange={v => setP(o => ({ ...o, text: v }))} placeholder="e.g. Summer School registration closes Friday!"/>
      <div className="admin-fields-row">
        <Field label="Button label (optional)" value={p.ctaLabel} onChange={v => setP(o => ({ ...o, ctaLabel: v }))} placeholder="Register now"/>
        <Field label="Button link (optional)" value={p.ctaUrl} onChange={v => setP(o => ({ ...o, ctaUrl: v }))} placeholder="/join"/>
        <Field label="Expires (optional)" type="date" value={p.expires} onChange={v => setP(o => ({ ...o, expires: v }))}/>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !p.text.trim()} onClick={() => save(false)}>Save promo</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save(true)}>Clear</button>
      </div>
    </>
  );
}

function AdminNewsletter() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [msg, setMsg] = React.useState({ subject: "", body: "" });
  const [busy, setBusy] = React.useState(false);
  const load = () => { setErr(""); NGGApi.admin.newsletter().then(setD).catch(e => setErr(e.code || e.message)); };
  React.useEffect(() => { load(); }, []);
  const send = async () => {
    const active = (d && d.active) || 0;
    if (!(await dialog.confirm({ title: "Send to " + active + " subscriber(s)?", body: "Emails the current newsletter to everyone subscribed. There's no undo.", cta: "Send newsletter", danger: true }))) return;
    setBusy(true);
    try { const r = await NGGApi.admin.newsletterSend(msg.subject, msg.body); toast.success("Sent to " + (r.sent || 0) + (r.skipped ? " (" + r.skipped + " skipped)" : "") + ".", "Newsletter"); setMsg({ subject: "", body: "" }); }
    catch (e) { toast.error(e.code || e.message, "Couldn't send"); } finally { setBusy(false); }
  };
  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">Newsletter {d ? <span className="mono" style={{ color: "var(--ink-500)", fontSize: 13 }}>· {d.active}/{d.total} active</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" disabled={!d || !d.subscribers.length} onClick={() => downloadCsv("newsletter", d.subscribers)}>Export CSV</button>
      </div>
      <div className="admin-fields" style={{ maxWidth: 640, marginBottom: 18 }}>
        <div className="admin-fields-h" style={{ fontWeight: 700 }}>Compose &amp; send</div>
        <Field label="Subject" value={msg.subject} onChange={v => setMsg(o => ({ ...o, subject: v }))}/>
        <label className="admin-field"><span className="admin-label">Body</span><textarea className="admin-input" rows={6} value={msg.body} onChange={e => setMsg(o => ({ ...o, body: e.target.value }))} placeholder="Write your update — plain text; links become clickable."/></label>
        <div><button className="btn btn-primary btn-sm" disabled={busy || msg.subject.trim().length < 3 || msg.body.trim().length < 10} onClick={send}>{busy ? "Sending…" : "Send newsletter"}</button> <span className="admin-hint">Each email includes a one-click unsubscribe link.</span></div>
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

/* ── AI status ───────────────────────────────────────────────────────────────
   Every AI feature here falls back to deterministic rules when no key is
   configured. That is correct and completely silent: the behaviour monitor
   keeps classifying and nothing says the intelligent half is switched off, so
   an operator can run for months believing observations are being read by a
   model when they are being matched against a word list.

   The probe matters as much as the status. A key that is SET but rejected —
   revoked, out of credit, wrong project — looks identical to a working one
   from configuration alone, and that is exactly the failure worth catching
   before somebody relies on it. */
function AiStatusPanel() {
  const [rows, setRows] = React.useState(null);
  const [any, setAny] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = (probe) => {
    setBusy(true); setErr("");
    NGGApi.admin.summer.aiStatus(probe)
      .then(r => { setRows(r.ai || []); setAny(!!r.anyEnabled); })
      .catch(e => setErr(e.code || e.message))
      .then(() => setBusy(false));
  };
  React.useEffect(() => { load(false); /* eslint-disable-next-line */ }, []);

  if (err) return <ErrorState title="Couldn't read AI status" code={err} onRetry={() => load(false)}/>;
  if (!rows) return <div className="dash-spinner"/>;

  return (
    <div style={{ marginTop: 28 }}>
      <div className="admin-section-head" style={{ marginBottom: 10 }}>
        <h3 className="admin-h2" style={{ fontSize: 18 }}>AI</h3>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => load(true)}>
          {busy ? "Testing…" : "Test the keys"}
        </button>
      </div>
      <div className="policy-callout" data-tone={any ? "ok" : "warn"}>
        {any
          ? <><b>AI is on.</b> Profiles below show which provider answers each feature. Press <b>Test the keys</b> to send one real request per profile — a key that is set but rejected looks identical to a working one until you do.</>
          : <><b>AI is off — everything still works.</b> No provider key is configured, so every feature below runs on its built-in rules instead. Nothing is broken; it is just not intelligent. Add a Groq or Gemini key in <code>api/config.php</code> to switch it on.</>}
      </div>
      <div className="admin-table-wrap" style={{ marginTop: 12 }}><table className="admin-table">
        <thead><tr><th>Feature</th><th>Status</th><th>Provider</th><th>Test</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.profile}>
            <td><b>{r.profile}</b><div className="admin-cell-sub" style={{ fontSize: 12 }}>{r.what}</div></td>
            <td>
              {r.enabled
                ? <span className="chip status-published">On</span>
                : <span className="chip status-draft">Rules only</span>}
              {!r.enabled && <div className="admin-cell-sub" style={{ fontSize: 11.5 }}>{r.behaviourWhenOff}</div>}
            </td>
            <td className="mono" style={{ fontSize: 12 }}>
              {r.enabled ? (r.provider + (r.model ? " · " + r.model : "")) : "—"}
              {r.fallbacks > 0 && <div className="admin-cell-sub" style={{ fontSize: 11 }}>+{r.fallbacks} fallback{r.fallbacks === 1 ? "" : "s"}</div>}
            </td>
            <td>
              {!r.probe ? <span className="admin-cell-sub" style={{ fontSize: 12 }}>not tested</span>
                : r.probe.ok ? <span className="chip status-published">OK · {r.probe.ms}ms</span>
                : <span className="chip" style={{ background: "var(--coral)", color: "#fff" }}>{r.probe.error}</span>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function AdminSettings() {
  const [s, setS] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    NGGApi.admin.settings.get().then(r => setS(r.settings)).catch(e => { toast.error(e.code || e.message); setS({}); });
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
        <FieldCheckbox label="Require a headshot on the public intake forms (teen, volunteer, kiosk)" value={s.intake_photo_required} onChange={v => setS(o => ({ ...o, intake_photo_required: v }))}/>
        {!s.intake_photo_required && <p className="admin-hint" style={{ margin: "-4px 0 0" }}>Photo is optional on sign-up. It can still be added later via Photo review or the ID studio.</p>}
        <FieldCheckbox label="Hold the ID until the photo is approved (issue only after an editor approves the headshot)" value={s.photo_gate_issuance} onChange={v => setS(o => ({ ...o, photo_gate_issuance: v }))}/>
        {s.photo_gate_issuance && <p className="admin-hint" style={{ margin: "-4px 0 0" }}>The QR/ID is bound only once both parent consent is in AND the photo is approved in <b>Photo review</b>. Registrations without a photo are never held.</p>}

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Attendance &amp; punctuality</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Set when each member type is due. Every card scan is stamped <span className="mono">present</span> or <span className="mono">late</span> against these times, and the check-in desk shows it live.</p>
        {(() => {
          const a = s.attendance || {};
          const setA = (k, v) => setS(o => ({ ...o, attendance: { ...(o.attendance || {}), [k]: v } }));
          const rbt = a.resumptionByType || {};
          const setR = (type, v) => setS(o => ({ ...o, attendance: { ...(o.attendance || {}), resumptionByType: { ...((o.attendance || {}).resumptionByType || {}), [type]: v } } }));
          const TYPES = [["student", "Summer students"], ["volunteer", "Volunteers"], ["default", "Everyone else (default)"]];
          return (
            <React.Fragment>
              <FieldCheckbox label="Flag lateness at check-in" value={a.enabled !== false} onChange={v => setA("enabled", v)}/>
              {a.enabled !== false && <React.Fragment>
                {TYPES.map(([type, label]) => (
                  <Field key={type} label={"Resumption time — " + label} type="time" value={rbt[type] || (type === "volunteer" ? "08:30" : "09:00")} onChange={v => setR(type, v)}/>
                ))}
                <div className="admin-fields-row">
                  <Field label="Grace period (minutes) before 'late'" type="number" value={a.graceMinutes ?? 10} onChange={v => setA("graceMinutes", parseInt(v, 10) || 0)}/>
                  <Field label="Timezone offset from UTC (minutes; WAT = 60)" type="number" value={a.tzOffset ?? 60} onChange={v => setA("tzOffset", parseInt(v, 10) || 0)}/>
                </div>
              </React.Fragment>}
            </React.Fragment>
          );
        })()}

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

        <AdminPromo/>

        <AiStatusPanel/>

        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Staff sign-in</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>How long a Control Room session may sit with nobody touching it before it locks. A warning appears two minutes before, and reading or clicking anywhere keeps it alive — the clock only runs when nobody is there.</p>
        <FieldSelect label="Sign out staff after" value={String(s.session_idle_admin ?? 1800)}
          onChange={v => setS(o => ({ ...o, session_idle_admin: Number(v) }))}
          options={[
            { value: "900", label: "15 minutes" },
            { value: "1800", label: "30 minutes (default)" },
            { value: "3600", label: "1 hour" },
            { value: "14400", label: "4 hours" },
            { value: "43200", label: "12 hours — a full working day" },
            { value: "0", label: "Never — only for a locked, private office" },
          ]}/>

        {/* The Control Room has no site nav, so this is where the accessibility
            controls live for staff. Device-local, like everywhere else: they
            describe how THIS screen needs to behave, and a coordinator on a
            shared desk machine should not have to change an account setting to
            turn contrast up for an afternoon. */}
        <div className="admin-fields-h" style={{ marginTop: 8, fontWeight: 700 }}>Accessibility (this device)</div>
        <p className="admin-hint" style={{ margin: "-6px 0 2px" }}>Applies to the Control Room and the public site in this browser. Nothing here is saved to your account or shared with anyone else.</p>
        <A11ySettingsPanel/>

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
              {/* How long a newly issued card stays valid. Existing cards keep
                  the expiry they were issued with — changing this must not
                  silently revoke a card already in a child's pocket. */}
              <div className="admin-fields-row">
                <Field label="ID valid for (days · 0 = never expires)" type="number"
                  value={id.validityDays == null ? 90 : id.validityDays}
                  onChange={v => setId("validityDays", v === "" ? 0 : parseInt(v, 10) || 0)}/>
                <div style={{ alignSelf: "end", paddingBottom: 8 }}>
                  <span className="admin-hint" style={{ margin: 0 }}>
                    {Number(id.validityDays) === 0
                      ? "Cards never expire. Anyone issued one keeps gate access indefinitely."
                      : "New cards expire " + (id.validityDays == null ? 90 : id.validityDays) + " days after they are issued. Expired cards are refused at every gate."}
                  </span>
                </div>
              </div>
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
/* Academy catalogue editor — the faculty→courses map that drives the volunteer
 * form (instructors pick courses UNDER their chosen faculty), the student course
 * list, and the /v-status faculty/course breakdowns. Fully editable; "Reset"
 * reverts to the seeded default. */
function AcademyCatalogue() {
  const [rows, setRows] = React.useState(null);   // [{faculty, courses:[]}]
  const [customised, setCustomised] = React.useState(false);
  const [orig, setOrig] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [draftCourse, setDraftCourse] = React.useState({});   // facultyIndex -> input text

  const norm = (cat) => (cat || []).map(r => ({ faculty: String(r.faculty || ""), courses: (r.courses || []).map(String) }));
  const load = () => NGGApi.admin.registration.catalogue()
    .then(r => { const n = norm(r.catalogue); setRows(n); setCustomised(!!r.customised); setOrig(JSON.stringify(n)); setErr(""); })
    .catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);

  const dirty = rows !== null && JSON.stringify(rows) !== orig;
  const setFacultyName = (i, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, faculty: v } : r));
  const removeFaculty = (i) => setRows(rs => rs.filter((_, j) => j !== i));
  const addFaculty = () => setRows(rs => [...rs, { faculty: "", courses: [] }]);
  const removeCourse = (i, c) => setRows(rs => rs.map((r, j) => j === i ? { ...r, courses: r.courses.filter(x => x !== c) } : r));
  const addCourse = (i) => {
    const v = String(draftCourse[i] || "").trim();
    if (!v) return;
    setRows(rs => rs.map((r, j) => j === i ? (r.courses.includes(v) ? r : { ...r, courses: [...r.courses, v] }) : r));
    setDraftCourse(d => ({ ...d, [i]: "" }));
  };

  const save = async () => {
    // Mirror the server's cleaning so the admin sees the same result they'll get.
    const clean = rows
      .map(r => ({ faculty: r.faculty.trim(), courses: r.courses.map(c => c.trim()).filter(Boolean) }))
      .filter(r => r.faculty !== "" && r.courses.length > 0);
    if (!clean.length) { toast.error("Add at least one faculty with one course."); return; }
    setBusy(true);
    try { const r = await NGGApi.admin.registration.catalogueSet(clean); toast.success("Catalogue saved — " + (r.faculties || clean.length) + " faculties live now."); load(); }
    catch (e) { toast.error(e.code === "catalogue_empty" ? "Add at least one faculty with one course." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!(await dialog.confirm({ title: "Reset to the seeded catalogue?", body: "Your custom faculties and courses will be replaced by the built-in default.", cta: "Reset" }))) return;
    setBusy(true);
    try { await NGGApi.admin.registration.catalogueReset(); toast.success("Reverted to the seeded catalogue."); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };

  if (err) return <ErrorState title="Couldn't load the catalogue" code={err} onRetry={load}/>;
  if (rows === null) return <div className="dash-spinner"/>;
  return (
    <div>
      <p className="admin-hint">The academies (faculties) and the courses within each. This is the single source that drives the <b>volunteer form</b> — instructors pick courses <b>under</b> the faculty they choose — plus the student course list and the /v-status breakdowns. {customised ? <span className="chip chip-lime">customised</span> : <span className="chip">seeded default</span>}</p>
      <div style={{ display: "grid", gap: 16 }}>
        {rows.map((r, i) => (
          <div key={i} className="admin-card" style={{ padding: 16, border: "1px solid rgba(12,20,50,0.12)", borderRadius: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <input className="admin-input" value={r.faculty} placeholder="Faculty name (e.g. Music)" onChange={e => setFacultyName(i, e.target.value)} style={{ fontWeight: 700, flex: 1, minWidth: 180 }}/>
              <button className="btn btn-ghost btn-sm" onClick={() => removeFaculty(i)} title="Remove this faculty">✕ Faculty</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {r.courses.length === 0 ? <span className="admin-cell-sub" style={{ fontSize: 12.5 }}>No courses yet — add the first below.</span> :
                r.courses.map(c => (
                  <span key={c} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {c}<button onClick={() => removeCourse(i, c)} title="Remove" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-500)", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                  </span>
                ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="admin-input" placeholder="Add a course…" value={draftCourse[i] || ""}
                onChange={e => setDraftCourse(d => ({ ...d, [i]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCourse(i); } }} style={{ flex: 1, minWidth: 160 }}/>
              <button className="btn btn-ghost btn-sm" onClick={() => addCourse(i)}>+ Course</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={addFaculty}>+ Add faculty</button>
        <div style={{ flex: 1 }}/>
        {customised && <button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>Reset to default</button>}
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : dirty ? "Save catalogue" : "Saved"}</button>
      </div>
    </div>
  );
}

function AdminRegistration() {
  const [tab, setTab] = React.useState(() => takePendingAdminTab("gates"));
  return (
    <div className="admin-section">
      <div className="admin-section-head"><h2 className="admin-h2">Registration</h2></div>
      <p className="admin-hint">Run the gated public sign-up: hand out desk links, review parent-pending sign-ups, and manage the centres that drive ID prefixes and card colours. The form itself lives under <b>Forms</b>.</p>
      <div className="admin-anchor-tabs">
        {[["gates", "Gate links"], ["pending", "Pending sign-ups"], ["centres", "Centres"], ["catalogue", "Academy catalogue"], ["import", "Bulk import"], ["certs", "Certificates"]].map(([id, l]) => (
          <button key={id} className={"admin-anchor-tab" + (tab === id ? " is-active" : "")} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === "gates" && <SummerGates/>}
      {tab === "pending" && <SummerPending/>}
      {tab === "centres" && <SummerCentres/>}
      {tab === "catalogue" && <AcademyCatalogue/>}
      {tab === "certs" && <SummerCertificates/>}
      {tab === "import" && <SummerImport/>}
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

/* Bulk student import — paste CSV (fullName,age,centre,track,guardianName,
 * guardianPhone,parentEmail); each row is enrolled + QR-bound (capacity-aware). */
function SummerImport() {
  const [csv, setCsv] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState(null);
  const parse = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase().split(",").map(s => s.trim());
    const known = ["fullname", "age", "centre", "track", "guardianname", "guardianphone", "parentemail"];
    const hasHeader = header.some(h => known.includes(h));
    const cols = hasHeader ? header : ["fullname", "age", "centre", "track", "guardianname", "guardianphone", "parentemail"];
    const map = { fullname: "fullName", age: "age", centre: "centre", track: "track", guardianname: "guardianName", guardianphone: "guardianPhone", parentemail: "parentEmail" };
    return (hasHeader ? lines.slice(1) : lines).map(line => {
      const cells = line.split(",").map(s => s.trim());
      const row = {}; cols.forEach((c, i) => { if (map[c]) row[map[c]] = cells[i] || ""; }); return row;
    });
  };
  const run = async () => {
    const rows = parse(csv);
    if (!rows.length) { toast.error("Nothing to import — paste CSV rows first."); return; }
    if (!(await dialog.confirm({ title: "Import " + rows.length + " student(s)?", body: "Each gets a QR + student ID. Full centres go to the waitlist.", cta: "Import" }))) return;
    setBusy(true);
    try { const r = await NGGApi.admin.summer.importStudents(rows); setRes(r); toast.success("Enrolled " + r.enrolled + (r.waitlisted ? " (" + r.waitlisted + " waitlisted)" : "") + (r.failed ? ", " + r.failed + " failed" : "") + ".", "Import done"); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <p className="admin-hint">Paste CSV with a header row: <span className="mono">fullName,age,centre,track,guardianName,guardianPhone,parentEmail</span>. Each row is enrolled and bound to the next blank QR; a full centre routes to the waitlist. Up to 500 rows.</p>
      <textarea className="admin-input" rows={8} value={csv} onChange={e => setCsv(e.target.value)} placeholder={"fullName,age,centre,track,guardianName,guardianPhone,parentEmail\nAda Obi,12,Egbeda,Tech,Mrs Obi,08030000000,obi@example.com"} style={{ fontFamily: "monospace", fontSize: 13 }}/>
      <div style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={busy || !csv.trim()} onClick={run}>{busy ? "Importing…" : "Import students"}</button></div>
      {res && (
        <div style={{ marginTop: 14 }}>
          <div className="mono" style={{ marginBottom: 6 }}>Enrolled {res.enrolled} · Waitlisted {res.waitlisted} · Failed {res.failed}</div>
          {res.results.filter(r => !r.ok).length > 0 && (
            <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>Row</th><th>Name</th><th>Error</th></tr></thead>
              <tbody>{res.results.filter(r => !r.ok).map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.name || ""}</td><td className="mono">{r.error}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}

/* Completion certificates — bulk-issue for graduates and revoke/restore by ID. */
function SummerCertificates() {
  const [busy, setBusy] = React.useState("");
  const [certId, setCertId] = React.useState("");
  const issue = async (status) => {
    setBusy("issue");
    try { const r = await NGGApi.admin.summer.issueCerts(status); toast.success("Issued " + (r.issued || 0) + " new certificate(s) of " + (r.considered || 0) + " " + status + " student(s).", "Certificates"); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const revoke = async (restore) => {
    if (!certId.trim()) return;
    setBusy(restore ? "restore" : "revoke");
    try { await NGGApi.admin.summer.revokeCert(certId.trim().toUpperCase(), restore); toast.success((restore ? "Restored " : "Revoked ") + certId.trim().toUpperCase(), "Certificate"); setCertId(""); }
    catch (e) { toast.error(e.code || e.message, "Not found"); } finally { setBusy(""); }
  };
  return (
    <div>
      <p className="admin-hint">Graduating a student auto-issues their verifiable certificate of completion. You can also bulk-issue for everyone already marked graduated, or revoke a specific certificate (student <span className="mono">NGGS-…</span> or volunteer <span className="mono">NGGV-…</span>).</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <button className="btn btn-primary btn-sm" disabled={busy === "issue"} onClick={() => issue("graduated")}>{busy === "issue" ? "Issuing…" : "Issue for all graduated students"}</button>
      </div>
      <div className="admin-fields" style={{ maxWidth: 480 }}>
        <Field label="Certificate ID" value={certId} onChange={setCertId} placeholder="NGGS-XXXXX or NGGV-XXXXX"/>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={busy === "revoke" || !certId.trim()} onClick={() => revoke(false)}>Revoke</button>
          <button className="btn btn-ghost btn-sm" disabled={busy === "restore" || !certId.trim()} onClick={() => revoke(true)}>Restore</button>
        </div>
      </div>
    </div>
  );
}

/* Centres manager — name + code + card colour (drives the ID prefix) and an
 * optional geo-fence (mapped to the centre, used to auto-pick it + stop off-site
 * sign-ups when the global fence toggle is on). */
function SummerCentres() {
  const [centres, setCentres] = React.useState(null);
  const [leadOptions, setLeadOptions] = React.useState([]);
  const [err, setErr] = React.useState("");
  const [d, setD] = React.useState({ name: "", code: "", color: "#76B043", capacity: "" });
  const [busy, setBusy] = React.useState(false);
  const [openId, setOpenId] = React.useState("");   // "" | "<id>:edit" | "<id>:map"
  const load = () => NGGApi.admin.registration.centres().then(r => { setCentres(r.centres || []); setLeadOptions(r.leadOptions || []); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const add = async (e) => {
    e && e.preventDefault();
    setBusy(true);
    try { await NGGApi.admin.registration.centreUpsert({ ...d, capacity: d.capacity === "" ? 0 : parseInt(d.capacity, 10) || 0 }); invalidateCentreOptCache(); setD({ name: "", code: "", color: "#76B043", capacity: "" }); toast.success("Centre added — open Edit to add its address, lead and contacts."); load(); }
    catch (e2) { toast.error(e2.code === "code_taken" ? "That code is already used." : "Check the name (2+) and code (1–4 letters)."); }
    finally { setBusy(false); }
  };
  const remove = async (c) => { if (!(await dialog.confirm({ title: "Remove " + c.name + "?", body: "Existing students keep their IDs; the centre just stops being offered.", cta: "Remove" }))) return; try { await NGGApi.admin.registration.centreDelete(c.centreId); invalidateCentreOptCache(); load(); } catch (e) { toast.error(e.code || e.message); } };
  const geoLabel = (c) => c.lat == null ? <span className="chip status-archived">— unmapped</span> : c.geofence ? <span className="chip chip-lime">🟢 fence on · {c.radiusM || 150}m</span> : <span className="chip">mapped · off</span>;
  const toggle = (c, mode) => setOpenId(openId === c.centreId + ":" + mode ? "" : c.centreId + ":" + mode);
  if (err) return <ErrorState title="Couldn't load centres" code={err} onRetry={load}/>;
  return (
    <div>
      <p className="admin-hint">Each centre has a 1–4 letter code (the printed ID prefix, e.g. <span className="mono">IJ-26-001</span>) and a colour that drives its ID card accent. Quick-add below, then <b>Edit</b> to set its address, centre lead, contacts and meeting times — these appear on the public status boards — plus the <b>public page</b> (hero image, tagline, story) shown at <span className="mono">/centres/&lt;slug&gt;</span>. <b>Map</b> draws its geo-fence.</p>
      <form onSubmit={add} className="admin-filters" style={{ alignItems: "center" }}>
        <input className="admin-input" placeholder="Centre name" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} style={{ minWidth: 200 }}/>
        <input className="admin-input" placeholder="CODE" value={d.code} maxLength={4} onChange={e => setD({ ...d, code: e.target.value.toUpperCase() })} style={{ maxWidth: 100 }}/>
        <input type="color" value={d.color} onChange={e => setD({ ...d, color: e.target.value })} style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)", cursor: "pointer" }}/>
        <input className="admin-input" type="number" min="0" placeholder="Capacity (0=∞)" value={d.capacity} onChange={e => setD({ ...d, capacity: e.target.value })} style={{ maxWidth: 140 }}/>
        <button className="btn btn-primary btn-sm" disabled={busy || d.name.length < 2 || !d.code}>{busy ? "…" : "+ Add centre"}</button>
      </form>
      {centres === null ? <div className="dash-spinner"/> :
        centres.length === 0 ? <div className="admin-empty">No centres yet — add your first above.</div> :
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Centre</th><th>Location</th><th>Lead</th><th>Capacity</th><th>Geo-fence</th><th></th></tr></thead>
          <tbody>{centres.map(c => (
            <React.Fragment key={c.centreId}>
            <tr>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c.color, border: "1px solid rgba(0,0,0,0.1)", flex: "0 0 auto" }}/><b>{c.name}</b> <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{c.code}</span></span>
                {c.status === "archived" && <span className="chip status-archived" style={{ marginLeft: 8 }}>archived</span>}
                {c.pageStatus === "published"
                  ? <a className="chip chip-lime" href={"/centres/" + (c.slug || "")} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, textDecoration: "none" }}>page live ↗</a>
                  : <span className="chip" style={{ marginLeft: 8, opacity: 0.7 }}>page draft</span>}
              </td>
              <td>{c.area || c.address ? <span style={{ lineHeight: 1.3 }}><b style={{ fontWeight: 600 }}>{c.area || "—"}</b>{c.address ? <><br/><span className="admin-cell-sub" style={{ fontSize: 12 }}>{c.address}</span></> : null}</span> : <span className="admin-cell-sub">—</span>}</td>
              <td>{c.leadName ? <span className="chip chip-lime">{c.leadName}</span> : <span className="admin-cell-sub">—</span>}</td>
              <td>{(c.capacity || 0) > 0 ? <span className={c.full ? "chip chip-crimson" : ""}>{c.enrolled || 0}/{c.capacity}{c.full ? " full" : ""}{c.waitlisted ? " · " + c.waitlisted + " waitlisted" : ""}</span> : <span className="mono" style={{ color: "var(--ink-500)" }}>∞ {c.enrolled ? "· " + c.enrolled : ""}</span>}</td>
              <td>{geoLabel(c)}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(c, "edit")}>{openId === c.centreId + ":edit" ? "Close" : "Edit"}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(c, "map")}>{openId === c.centreId + ":map" ? "Close" : "Map"}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} style={{ color: "#b03535" }}>Remove</button>
              </td>
            </tr>
            {openId === c.centreId + ":edit" && <tr><td colSpan={6} style={{ background: "rgba(12,20,50,0.03)" }}><CentreDetailsEditor c={c} leadOptions={leadOptions} onSaved={() => { setOpenId(""); load(); }}/></td></tr>}
            {openId === c.centreId + ":map" && <tr><td colSpan={6} style={{ background: "rgba(12,20,50,0.03)" }}><CentreGeoEditor c={c} onSaved={() => { setOpenId(""); load(); }}/></td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div>}
    </div>
  );
}

/* Full centre editor — the operational record: identity (name/code/colour/
 * status/capacity), where it is (address/area), who leads it (a volunteer),
 * how to reach it (phone/email), and when it meets. Address, area, schedule
 * and the lead surface on the public status boards' "find us" cards. */
// Mirror of the server's centre_slugify() for the live URL preview.
function centreSlugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
} // (NFD + combining-mark strip mirrors iconv//TRANSLIT on the server)

function CentreDetailsEditor({ c, leadOptions, onSaved }) {
  const [f, setF] = React.useState({
    name: c.name || "", code: c.code || "", color: c.color || "#76B043",
    status: c.status || "active", capacity: c.capacity != null ? String(c.capacity) : "",
    address: c.address || "", area: c.area || "", leadVolunteerId: c.leadVolunteerId || "",
    phone: c.phone || "", email: c.email || "", meetDays: c.meetDays || "", meetTime: c.meetTime || "", notes: c.notes || "",
    whatsappUrl: c.whatsappUrl || "",
    slug: c.slug || "", pageStatus: c.pageStatus || "draft",
    tagline: c.tagline || "", headline: c.headline || "",
    heroImageUrl: c.heroImageUrl || "", heroImageMobileUrl: c.heroImageMobileUrl || "",
    heroPosition: c.heroPosition || "center bottom",
    story: c.story || "", gallery: Array.isArray(c.gallery) ? c.gallery : [],
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const galleryAdd = () => set("gallery", [...(f.gallery || []), ""]);
  const gallerySet = (i, v) => set("gallery", (f.gallery || []).map((x, j) => (j === i ? v : x)));
  const galleryRemove = (i) => set("gallery", (f.gallery || []).filter((_, j) => j !== i));
  const effectiveSlug = (f.slug && f.slug.trim()) ? centreSlugify(f.slug) : centreSlugify(f.name);
  // Volunteers based at this centre float to the top of the lead picker.
  const leads = React.useMemo(() => {
    const opts = leadOptions || [];
    const here = opts.filter(o => o.centre === c.name);
    const rest = opts.filter(o => o.centre !== c.name);
    return here.concat(rest);
  }, [leadOptions, c.name]);
  const save = async () => {
    if (f.name.trim().length < 2) { toast.error("Centre name needs at least 2 characters."); return; }
    if (!f.code.trim()) { toast.error("Add a 1–4 letter code."); return; }
    setBusy(true);
    try {
      await NGGApi.admin.registration.centreUpsert({
        centreId: c.centreId, name: f.name.trim(), code: f.code.trim().toUpperCase(), color: f.color,
        status: f.status, capacity: f.capacity === "" ? 0 : parseInt(f.capacity, 10) || 0,
        address: f.address, area: f.area, leadVolunteerId: f.leadVolunteerId,
        phone: f.phone, email: f.email, meetDays: f.meetDays, meetTime: f.meetTime, notes: f.notes,
        whatsappUrl: f.whatsappUrl.trim(),
        slug: f.slug.trim(), pageStatus: f.pageStatus,
        tagline: f.tagline, headline: f.headline,
        heroImageUrl: f.heroImageUrl.trim(), heroImageMobileUrl: f.heroImageMobileUrl.trim(),
        heroPosition: f.heroPosition,
        story: f.story, gallery: (f.gallery || []).map(s => (s || "").trim()).filter(Boolean),
      });
      invalidateCentreOptCache();
      toast.success("Centre saved."); onSaved();
    } catch (e) {
      toast.error(e.code === "code_taken" ? "That code is already used." : e.code === "bad_email" ? "That email address isn't valid." : e.code === "bad_whatsapp" ? "The WhatsApp link must start with https://" : e.code === "bad_lead" ? "Pick a current volunteer as lead." : e.code === "bad_color" ? "Pick a valid colour." : e.code === "bad_image" ? "Image links must start with https://" : (e.code || e.message));
    } finally { setBusy(false); }
  };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--ink-600, #47506e)", marginBottom: 3 };
  const field = (key, label, opts = {}) => (
    <div style={{ flex: opts.grow ? "1 1 100%" : "1 1 200px", minWidth: opts.min || 160 }}>
      <span style={lbl}>{label}</span>
      <input className="admin-input" style={{ width: "100%" }} value={f[key]} maxLength={opts.max} placeholder={opts.ph || ""} type={opts.type || "text"} min={opts.type === "number" ? 0 : undefined} onChange={e => set(key, opts.upper ? e.target.value.toUpperCase() : e.target.value)}/>
    </div>
  );
  return (
    <div style={{ padding: "16px 4px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 8 }}>IDENTITY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field("name", "Centre name", { max: 80, min: 200 })}
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Code</span><input className="admin-input" value={f.code} maxLength={4} onChange={e => set("code", e.target.value.toUpperCase())} style={{ width: 90 }}/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Colour</span><input type="color" value={f.color} onChange={e => set("color", e.target.value)} style={{ width: 44, height: 38, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)", cursor: "pointer" }}/></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Status</span><select className="admin-select" value={f.status} onChange={e => set("status", e.target.value)}><option value="active">Active</option><option value="archived">Archived</option></select></div>
          <div style={{ flex: "0 0 auto" }}><span style={lbl}>Capacity</span><input className="admin-input" type="number" min="0" placeholder="0 = ∞" value={f.capacity} onChange={e => set("capacity", e.target.value)} style={{ width: 120 }}/></div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 8 }}>LOCATION &amp; LEAD</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field("area", "Area / city", { max: 120, ph: "e.g. Alimosho · Lagos" })}
          {field("address", "Street address", { max: 240, grow: true, min: 260, ph: "Building, street, landmark" })}
          <div style={{ flex: "1 1 240px", minWidth: 200 }}>
            <span style={lbl}>Centre lead (volunteer)</span>
            <select className="admin-select" style={{ width: "100%" }} value={f.leadVolunteerId} onChange={e => set("leadVolunteerId", e.target.value)}>
              <option value="">— none —</option>
              {leads.map(o => <option key={o.volunteerId} value={o.volunteerId}>{o.name}{o.role ? " · " + o.role : ""}{o.centre && o.centre !== c.name ? " (" + o.centre + ")" : ""}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)", marginBottom: 8 }}>CONTACT &amp; SCHEDULE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field("phone", "Phone", { max: 40, ph: "+234 …" })}
          {field("email", "Email", { max: 160, type: "email", ph: "centre@afrovanguard.org.ng" })}
          {field("meetDays", "Meeting days", { max: 120, ph: "e.g. Saturdays" })}
          {field("meetTime", "Meeting time", { max: 60, ph: "e.g. 09:00 – 13:00" })}
          {field("whatsappUrl", "Group / join link", { max: 240, grow: true, min: 260, ph: "chat.whatsapp.com/… · wa.me/… · forms.gle/…" })}
        </div>
        <p className="admin-hint" style={{ margin: "6px 0 0" }}>Shown to an applicant right after they submit — matched to the centre they picked. Works with a WhatsApp <b>Invite via Link</b>, a <b>wa.me</b> number link, or a <b>form</b> link. You can paste it without <span className="mono">https://</span>.</p>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: "var(--ink-500)" }}>PUBLIC PAGE</span>
          <select className="admin-select" value={f.pageStatus} onChange={e => set("pageStatus", e.target.value)} style={{ padding: "3px 8px" }}>
            <option value="draft">Draft — hidden</option>
            <option value="published">Published — live</option>
          </select>
          {effectiveSlug ? (
            <a className="mono" href={"/centres/" + effectiveSlug} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: "var(--ink-500)", textDecoration: "none" }}>
              next.afrovanguard.org.ng/centres/<b style={{ color: "var(--ink-800, #0a1130)" }}>{effectiveSlug}</b> ↗
            </a>
          ) : null}
        </div>
        <p className="admin-hint" style={{ marginTop: 0 }}>The immersive centre landing page at <span className="mono">/centres/&lt;slug&gt;</span> — a giant hero image, a tagline and a story. Publish to make it live; the directory at <span className="mono">/centres</span> lists every published centre.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {field("slug", "URL slug", { max: 64, ph: effectiveSlug || "auto from name" })}
          {field("tagline", "Tagline (hero eyebrow)", { max: 200, grow: true, min: 260, ph: "e.g. LCASP 2026 · ÌLÚ Ẹ̀KÒ · EMPOWERED 360°" })}
          {field("headline", "Headline (big display)", { max: 200, grow: true, min: 260, ph: "e.g. No dey settle for less." })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <FieldUpload label="Hero image (giant model — portrait works best)" value={f.heroImageUrl} onChange={v => set("heroImageUrl", v)} kind="cover" placeholder="Paste an https:// image URL or upload →"/>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <FieldUpload label="Hero image — mobile (optional)" value={f.heroImageMobileUrl} onChange={v => set("heroImageMobileUrl", v)} kind="cover" placeholder="Optional alternate for small screens"/>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginTop: 10 }}>
          <div style={{ flex: "0 0 auto" }}>
            <span style={lbl}>Hero focal position</span>
            <select className="admin-select" value={f.heroPosition} onChange={e => set("heroPosition", e.target.value)}>
              <option value="center bottom">Bottom · centre</option>
              <option value="center center">Centre</option>
              <option value="center top">Top · centre</option>
              <option value="left bottom">Bottom · left</option>
              <option value="right bottom">Bottom · right</option>
              <option value="left center">Centre · left</option>
              <option value="right center">Centre · right</option>
            </select>
          </div>
          <p className="admin-hint" style={{ margin: 0, flex: "1 1 240px" }}>Where the giant hero image sits. Admins can also <b>drag to position</b> it directly on the live centre page.</p>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={lbl}>Story</span>
          <textarea className="admin-input" value={f.story} maxLength={6000} onChange={e => set("story", e.target.value)} rows={5} style={{ width: "100%", resize: "vertical" }} placeholder="What happens at this centre, who it's for, what a Saturday feels like. One blank line starts a new paragraph."/>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={lbl}>Gallery ({(f.gallery || []).length})</span>
          {(f.gallery || []).map((url, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldUpload label={""} value={url} onChange={v => gallerySet(i, v)} kind="cover" placeholder="Paste an https:// image URL or upload →"/>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => galleryRemove(i)} style={{ color: "#b03535", marginTop: 2 }}>Remove</button>
            </div>
          ))}
          {(f.gallery || []).length < 12 && <button type="button" className="btn btn-ghost btn-sm" onClick={galleryAdd}>+ Add gallery image</button>}
        </div>
      </div>
      <div>
        <span style={lbl}>Notes (internal)</span>
        <textarea className="admin-input" value={f.notes} maxLength={400} onChange={e => set("notes", e.target.value)} rows={2} style={{ width: "100%", resize: "vertical" }} placeholder="Anything the ops team should know about this centre."/>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save centre"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSaved}>Cancel</button>
        <span className="admin-hint" style={{ margin: 0 }}>Area, address, meeting times and the lead show on the public status boards.</span>
      </div>
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
  const [zoom, setZoom] = React.useState("");
  /* Children with NO photograph, which the queue above structurally cannot show
     — it lists photo ASSETS, and these have none. Every registration that
     arrived before the image store existed lost its headshot at submit time and
     cannot be recovered, so the only fix is to ask those families again. */
  const [missing, setMissing] = React.useState(null);
  const [asking, setAsking] = React.useState(false);
  const loadMissing = () => NGGApi.admin.photos.missing(200).then(setMissing).catch(() => setMissing(null));
  const load = () => { loadMissing(); return NGGApi.admin.photos.queue().then(r => { setData(r); setErr(""); }).catch(e => setErr(e.code || e.message)); };
  React.useEffect(() => { load(); }, []);

  const askMissing = async () => {
    const n = (missing && missing.students || []).filter(s => s.reachable && !s.askedAt).length;
    const go = await dialog.confirm({
      title: "Send retake links",
      body: "Emails each guardian a one-tap link to take a new photo. " + n + " famil" + (n === 1 ? "y is" : "ies are") +
            " due — anyone asked in the last 3 days is skipped, so pressing this again continues rather than asking twice." +
            " Sent in batches of 50; press again for the next batch.",
      cta: "Send " + Math.min(50, n),
    });
    if (!go) return;
    setAsking(true);
    try {
      const r = await NGGApi.admin.photos.requestMissing(50, 3);
      toast.success(r.asked ? "Asked " + r.asked + " famil" + (r.asked === 1 ? "y" : "ies") + (r.remaining ? " · " + r.remaining + " still due" : " · that's everyone") : (r.message || "Nobody was due."));
      loadMissing();
    } catch (e) { toast.error(e.code || e.message); } finally { setAsking(false); }
  };

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
      <button type="button" onClick={() => url && setZoom(url)} title={url ? "View full size" : ""} style={{ display: "grid", placeItems: "center", width: "100%", aspectRatio: "4/5", borderRadius: 10, overflow: "hidden", background: "rgba(12,20,50,0.05)", border: "1px solid " + (tone || "rgba(12,20,50,0.12)"), padding: 0, cursor: url ? "zoom-in" : "default" }}>
        {url ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <span style={{ color: "var(--ink-400)", fontSize: 12 }}>—</span>}
      </button>
    </div>
  );

  return (
    <div className="admin-section">
      {zoom && <ImageLightbox url={zoom} alt="Headshot" onClose={() => setZoom("")}/>}
      <div className="admin-section-head">
        <h2 className="admin-h2">Photo review {data && data.pending ? <span className="chip chip-lime">{data.pending} waiting</span> : null}</h2>
        <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="admin-hint">The free AI only <b>flags</b> problems; Cloudinary <b>enhances</b> — it never alters the person. Approve the edit, request a retake, or (for unusable/inappropriate uploads) reject. You can paste a corrected image URL when approving.</p>

      {/* The children this queue cannot show. A card with no face on it is not a
          smaller problem than a badly-lit one, and it is invisible here because
          there is no asset to list — so it needs its own block, above the
          queue, with the one action that fixes it. */}
      {missing && missing.total > 0 && (
        <div className="admin-card" style={{ padding: 16, marginBottom: 16, borderColor: "rgba(245,176,38,.45)", background: "rgba(245,176,38,.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h3 className="admin-h3" style={{ margin: 0 }}>
              {missing.total} child{missing.total === 1 ? "" : "ren"} with no photo on file
            </h3>
            <button className="btn btn-primary btn-sm" disabled={asking} onClick={askMissing}>
              {asking ? "Sending…" : "Send retake links"}
            </button>
          </div>
          <p className="admin-hint" style={{ marginTop: 6 }}>
            {(() => {
              const rows = missing.students || [];
              const self = rows.filter(s => s.selfRegistered).length;
              const unreachable = rows.filter(s => !s.reachable).length;
              const asked = rows.filter(s => s.askedAt).length;
              return <>
                {self > 0 && <><b>{self}</b> registered themselves — that form cannot be submitted without a photo, so those images
                were lost before reaching the record and cannot be recovered. </>}
                Each link lets a guardian take a new one on their phone in under a minute.
                {asked > 0 && <> {asked} already asked.</>}
                {unreachable > 0 && <> <b>{unreachable} have no email on file</b> and cannot be reached this way — a coordinator
                has to photograph them at the centre.</>}
              </>;
            })()}
          </p>
          <div className="admin-table-wrap" style={{ maxHeight: 260, overflow: "auto" }}>
            <table className="admin-table">
              <thead><tr><th>Child</th><th>Centre</th><th>Registered</th><th>Guardian</th><th>Asked</th></tr></thead>
              <tbody>
                {(missing.students || []).map(sx => (
                  <tr key={sx.studentId}>
                    <td><b>{sx.fullName}</b><div className="mono admin-cell-sub">{sx.displayId || sx.studentId}{sx.selfRegistered ? " · self-registered" : ""}</div></td>
                    <td className="mono" style={{ fontSize: 12 }}>{sx.centre || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{(sx.registeredAt || "").slice(0, 10) || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{sx.reachable ? sx.parentEmail : <span style={{ color: "#b3001b" }}>no email</span>}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{sx.askedAt ? sx.askedAt.slice(0, 10) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.shown < missing.total && <p className="admin-cell-sub" style={{ marginTop: 6 }}>Showing the {missing.shown} most recent of {missing.total}.</p>}
        </div>
      )}
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
  const load = () => NGGApi.admin.settings.get().then(r => setC({ ...(r.settings.site_content || {}) })).catch(e => { toast.error(e.code || e.message); setC({}); });
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

function Field({ label, value, onChange, type, placeholder, required, disabled, hint }) {
  return (
    <label className="admin-field">
      <span>{label}{required && <em>*</em>}</span>
      <input type={type || "text"} className="admin-input" value={value == null ? "" : value} disabled={!!disabled}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required}
        style={disabled ? { opacity: .7, cursor: "not-allowed" } : undefined}/>
      {hint && <span className="admin-hint" style={{ margin: 0 }}>{hint}</span>}
    </label>
  );
}
/* Age from an ISO date, matching dob_age() on the server so the number an admin
   sees while typing is the number that gets stored. Returns "" for a date that
   is not one yet, rather than a nonsense age for a half-typed year. */
function adminDobAge(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  const b = new Date(iso + "T00:00:00Z"), now = new Date();
  if (isNaN(b.getTime()) || b.getTime() > now.getTime()) return "";
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
function FieldTextarea({ label, value, onChange, rows }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <textarea className="admin-input" rows={rows || 4} value={value || ""} onChange={(e) => onChange(e.target.value)}/>
    </label>
  );
}
// Live centre options, cached across the whole admin so every form reflects the
// centres an admin actually configured — not a hard-coded pair. A newly added
// centre becomes selectable everywhere immediately.
let _centreOptCache = null;
// Called after any centre is added/edited/removed so every cached <select>
// refetches the live list on next mount (otherwise new centres stay invisible
// until a full reload). Hoisted, so the editor handlers above can call it.
function invalidateCentreOptCache() { _centreOptCache = null; }
function useCentreOptions() {
  const [names, setNames] = React.useState(_centreOptCache || []);
  React.useEffect(() => {
    let live = true;
    if (_centreOptCache) { setNames(_centreOptCache); return; }
    NGGApi.admin.registration.centres().then(r => { _centreOptCache = (r.centres || []).map(c => c.name).filter(Boolean); if (live) setNames(_centreOptCache); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return names;
}
// Labeled centre <select> populated from the live centres list. Keeps the
// current value selectable even if the centre was renamed/removed, supports
// extra fixed options (e.g. "Both", "Online") and an optional blank label.
function FieldCentre({ label = "Centre", value, onChange, extra = [], blank }) {
  const names = useCentreOptions();
  const opts = names.slice();
  extra.forEach(x => { if (x && !opts.includes(x)) opts.push(x); });
  if (value && !opts.includes(value)) opts.unshift(value);
  const all = (blank !== undefined ? [{ value: "", label: blank }] : (value ? [] : [{ value: "", label: "— select centre —" }])).concat(opts);
  return <FieldSelect label={label} value={value || ""} onChange={onChange} options={all}/>;
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
  const id = React.useId ? React.useId() : "fu";
  /* A <div>, not a <label>. Wrapping the whole row in one put the Uploader's
     hidden <input type=file> inside a label whose labeled control is the URL
     text box — so the label owns the click and hands activation to the text
     box. Chrome tolerates it; Safari and iOS re-dispatch and can swallow the
     file picker outright, which is an upload button that does nothing. */
  return (
    <div className="admin-field">
      <label htmlFor={id}><span>{label}</span></label>
      <div className="admin-upload-row">
        <input id={id} type="text" className="admin-input" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Paste a URL or upload →"}/>
        <Uploader kind={kind || "cover"} accept={accept || "image/*"} onUploaded={(url) => onChange(url)} compact/>
      </div>
      {value && /^https?:\/\//.test(value) && (
        <span className="admin-upload-preview"><img src={value} alt="" onError={(e) => { e.target.style.display = "none"; }}/></span>
      )}
    </div>
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
  // Handheld desks point the rear lens at the card; an all-in-one kiosk has
  // only a front one.
  const [camFacing, setCamFacing] = React.useState("environment");
  const [multiCam, setMultiCam] = React.useState(false);
  const [flushErr, setFlushErr] = React.useState(null);   // queued scans the server refused
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
      setResult({ student: r.student, already: r.already, status: r.status, lateMinutes: r.lateMinutes, halfDay: r.halfDay, programmeDay: r.programmeDay, compliance: r.compliance });
      buzz(r.status === "late");
      setRecent(x => [{ name: r.student.fullName, at: now, already: r.already, status: r.status }, ...x].slice(0, 8));
      onCheckin && onCheckin();
    } catch (e) {
      const code = e.code || e.message || "";
      if (!navigator.onLine || /network|fetch|offline|http_0/i.test(code)) {
        // Stamp the moment the card was actually presented. Without it the
        // server grades punctuality at flush time, so a 07:55 arrival becomes
        // a lateness infraction because the network came back at 09:30.
        const q = kioskQueue(); q.push({ token, method, at: now, scannedAt: new Date(now).toISOString() });
        kioskSetQueue(q); setPending(q.length);
        setResult({ queued: true, token }); buzz(false);
      } else if (code === "policy_evicted" || code === "policy_suspended") {
        // A refusal is not an error the operator can fix by rescanning — say
        // who it is and why, so the desk can act rather than scan again.
        const d = e.data || {};
        setResult({ refused: code, student: d.student, message: d.message, compliance: d.state }); buzz(true);
      } else {
        const map = { qr_unassigned: "That card isn't linked to a student yet.", student_not_found: "Student not found.", forbidden: "Your session expired — sign in again." };
        setResult({ error: map[code] || code }); buzz(true);
      }
    }
  }, [device, onCheckin]);

  // Flush the offline queue when back online / periodically.
  const flush = React.useCallback(async () => {
    let q = kioskQueue(); if (!q.length || !navigator.onLine) return;
    const rejected = [];
    for (const it of [...q]) {
      try { await NGGApi.admin.summer.checkin(it.token, it.method, device, it.scannedAt); q = q.filter(x => x !== it); kioskSetQueue(q); }
      catch (e) {
        if (!navigator.onLine) break;
        // A queued scan the server refuses is dropped — but silently dropping
        // it left the desk believing someone was checked in who is not.
        rejected.push({ token: it.token, code: e.code || e.message || "rejected" });
        q = q.filter(x => x !== it); kioskSetQueue(q);
      }
    }
    setPending(kioskQueue().length);
    if (rejected.length) setFlushErr(rejected);
    onCheckin && onCheckin();
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
    // Re-runs when the operator flips; the cleanup stops the old stream first.
    (async () => {
      try {
        await ensureQRDecoder();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing } });
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
        if (navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices()
            .then(ds => setMultiCam(ds.filter(d => d.kind === "videoinput").length > 1))
            .catch(() => {});
        }
      } catch (e) { setCamErr((e && e.name === "NotAllowedError") ? "Camera permission denied — use a handheld scanner or type the token." : "No camera available — use a handheld scanner or type the token."); }
    })();
    return () => { stop = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [mode, camFacing, doCheckin]);

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
              {multiCam && (
                <button type="button" className="summer-cam-flip" title="Flip camera"
                  aria-label={"Switch to the " + (camFacing === "environment" ? "front" : "back") + " camera"}
                  onClick={() => setCamFacing(f => (f === "environment" ? "user" : "environment"))}>🔄</button>
              )}
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
          {result && result.student && !result.refused && (
            <div className={"summer-result " + (result.already ? "dupe" : result.status === "late" ? "late" : "ok")}>
              <div className="summer-result-av">{result.student.photoUrl ? <img src={result.student.photoUrl} alt=""/> : (result.student.fullName || "?").charAt(0)}</div>
              <div className="summer-result-nm">{result.student.fullName}</div>
              <div className="summer-result-msg">{result.already ? "Already checked in today" : "Checked in ✓"}</div>
              <div className="mono summer-result-id">{result.student.studentId}{result.student.track ? " · " + result.student.track : ""}</div>
              {/* Punctuality was recorded but never shown, so the desk had no
                  idea a scan had just cost someone a lateness log. */}
              <div className="summer-result-tags">
                {result.status === "late" && <span className="chip" style={{ background: "var(--coral)", color: "#fff" }}>LATE{result.lateMinutes ? " · " + result.lateMinutes + " min" : ""}</span>}
                {result.status === "tardy" && <span className="chip status-draft">Tardy{result.lateMinutes ? " · " + result.lateMinutes + " min" : ""}</span>}
                {!!result.halfDay && <span className="chip status-draft">Half-day — missed Musing</span>}
                {result.programmeDay === false && <span className="chip status-draft">Not a programme day</span>}
                {result.compliance && result.compliance.state && result.compliance.state !== "clear" && <PolicyStateChip state={result.compliance.state}/>}
              </div>
            </div>
          )}
          {result && result.refused && (
            <div className="summer-result err">
              <div className="summer-result-nm">{(result.student && result.student.fullName) || "Refused"}</div>
              <div className="summer-result-msg">{result.message || (result.refused === "policy_evicted" ? "Evicted from the programme." : "Currently suspended.")}</div>
              <div className="summer-result-tags"><PolicyStateChip state={result.refused === "policy_evicted" ? "evicted" : "suspended"}/></div>
              <div className="mono summer-result-id">Not checked in. Refer to the coordinator.</div>
            </div>
          )}
          {result && result.queued && <div className="summer-result queued"><div className="summer-result-nm">Saved offline</div><div className="summer-result-msg">{result.token} — syncs when back online</div></div>}
          {result && result.error && <div className="summer-result err"><div className="summer-result-nm">Couldn't check in</div><div className="summer-result-msg">{result.error}</div></div>}
        </div>
      </div>

      {flushErr && (
        <div className="policy-callout" data-tone="warn" style={{ marginTop: 14 }}>
          <b>{flushErr.length} queued scan(s) were refused when they synced</b> and are <b>not</b> checked in:{" "}
          {flushErr.map(r => r.token).join(", ")}.{" "}
          {flushErr.some(r => /policy_/.test(r.code)) ? "At least one is suspended or evicted." : ""}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setFlushErr(null)}>Dismiss</button>
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>THIS SESSION</div>
          <div className="summer-kiosk-recent">
            {recent.map((r, i) => (
              <div key={i} className="summer-recent-row">
                <span>{r.name}</span>
                <span className={"mono " + (r.already ? "summer-dupe" : "summer-fresh")}>
                  {r.already ? "already" : r.status === "late" ? "checked in · LATE" : r.status === "tardy" ? "checked in · tardy" : "checked in"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Programme calendar + Institutional Policy ───────────────────────────────
   Two panels that answer two different questions: WHICH DAYS COUNT (the
   calendar) and WHAT A MISSED ONE COSTS (the policy). They are one screen
   because setting the second without the first is how you email every guardian
   on a Sunday. */
const DOW = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["7", "Sun"]];
const STATE_CHIP = {
  clear:     { label: "Clear",     cls: "status-published" },
  warned:    { label: "Warned",    cls: "status-draft" },
  dormant:   { label: "Dormant",   cls: "status-draft" },
  suspended: { label: "Suspended", cls: "status-archived" },
  evicted:   { label: "Evicted",   cls: "status-archived" },
};
const naira = (n) => "₦" + Number(n || 0).toLocaleString();

function PolicyStateChip({ state }) {
  const s = STATE_CHIP[state] || STATE_CHIP.clear;
  return <span className={"chip " + s.cls} style={state === "evicted" ? { background: "var(--coral)", color: "#fff" } : undefined}>{s.label}</span>;
}

function SummerPolicy() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [prog, setProg] = React.useState(null);
  const [pol, setPol] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [board, setBoard] = React.useState(null);
  const [person, setPerson] = React.useState(null);
  const [newDate, setNewDate] = React.useState("");

  // Fall back to the server's own defaults rather than leaving prog/pol null:
  // a partial response would otherwise spin forever with nothing to retry from.
  const load = () => NGGApi.admin.policy.settings().then(r => {
    setD(r || {});
    setProg((r && r.programme) || { enabled: false, startDate: "", endDate: "", weekdays: [1, 2, 3, 4, 5], holidays: [], extraDays: [] });
    setPol((r && r.policy) || { enabled: false, student: {}, volunteer: {}, musing: {}, idCard: {}, reinstatement: {} });
    setErr("");
  }).catch(e => setErr(e.code || e.message || "load_failed"));
  const loadBoard = () => NGGApi.admin.policy.board().then(setBoard).catch(() => setBoard({ board: [], tally: {} }));
  React.useEffect(() => { load(); loadBoard(); }, []);

  const save = async () => {
    setBusy("save");
    try { const r = await NGGApi.admin.policy.save(prog, pol); setD(o => ({ ...o, calendar: r.calendar || o.calendar })); toast.success("Saved"); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const setP = (k, v) => setProg(o => ({ ...o, [k]: v }));
  const setPol2 = (grp, k, v) => setPol(o => ({ ...o, [grp]: { ...(o[grp] || {}), [k]: v } }));
  const toggleDow = (n) => setProg(o => {
    const has = (o.weekdays || []).includes(n);
    return { ...o, weekdays: has ? o.weekdays.filter(x => x !== n) : [...o.weekdays, n].sort() };
  });
  const addException = (list) => {
    if (!newDate) return;
    setProg(o => ({ ...o, [list]: Array.from(new Set([...(o[list] || []), newDate])).sort() }));
    setNewDate("");
  };
  const dropException = (list, date) => setProg(o => ({ ...o, [list]: (o[list] || []).filter(x => x !== date) }));

  const sweep = async () => {
    setBusy("sweep");
    try {
      const r = await NGGApi.admin.policy.sweep();
      toast.success(r.skipped ? ("Nothing to sweep — " + (r.skipped === "policy_disabled" ? "enforcement is off" : "no programme calendar"))
        : (r.days + " day(s) swept · " + r.absences + " absence(s) logged"), "Absence sweep");
      load(); loadBoard();
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const openPerson = (row) => NGGApi.admin.policy.person(row.personId, row.personType).then(setPerson).catch(e => toast.error(e.code || e.message));

  if (err) return <ErrorState title="Couldn't load" code={err} onRetry={load}/>;
  if (!d || !prog || !pol) return <div className="dash-spinner"/>;
  const cal = d.calendar || {};

  return (
    <div>
      {/* ── Programme days ── */}
      <div className="admin-panel" style={{ marginBottom: 18 }}>
        <div className="admin-section-head" style={{ marginBottom: 6 }}>
          <h3 className="admin-h3">Programme days</h3>
          <label className="fb-toggle">
            <input type="checkbox" checked={!!prog.enabled} onChange={e => setP("enabled", e.target.checked)}/>
            <span>Use a programme calendar</span>
          </label>
        </div>
        <p className="admin-hint">
          Which days the summer students are expected. Absence, attendance rates and guardian
          alerts all read this — with no calendar set, every calendar day counts, so a Sunday
          marks the whole cohort absent. Set the term window and the weekdays that run, then
          cancel or add individual dates below.
        </p>

        {/* Say so when the window was inferred rather than set. An admin who
            does not know where these dates came from cannot tell a sensible
            default from a mistake, and would have no reason to check them
            before the policy engine starts marking children absent. */}
        {prog.derivedFromSession && (
          <div className="policy-callout" data-tone="warn">
            <b>Taken from the active session.</b> Nobody has set a term window here, so the calendar is using the
            session's own dates ({prog.startDate || "—"} → {prog.endDate || "—"}) and the weekdays below. Check they
            are right and press Save to make them yours — attendance and absence both count off this.
          </div>
        )}
        {!prog.enabled && (
          <div className="policy-callout" data-tone="warn">
            <b>No programme calendar.</b> Every date — Sundays, public holidays, dates long after the term ends —
            counts as a school day, and the absence sweep does nothing. Set the term window and the days that run.
          </div>
        )}

        {prog.enabled && (
          <div className="policy-callout" data-tone={cal.isProgrammeDay ? "ok" : "muted"}>
            {cal.isProgrammeDay
              ? <><b>Today ({cal.today}) is a programme day.</b> {cal.elapsed} of {cal.total} programme days have run.</>
              : <><b>Today ({cal.today}) is not a programme day.</b> Nobody is counted absent{cal.nextDay ? <> — next session is <b>{cal.nextDay}</b>.</> : " — the term window has ended."}</>}
          </div>
        )}

        <div className="admin-fields">
          <Field label="Term starts" type="date" value={prog.startDate} onChange={v => setP("startDate", v)}/>
          <Field label="Term ends" type="date" value={prog.endDate} onChange={v => setP("endDate", v)}/>
        </div>

        <div className="admin-fields-h" style={{ marginTop: 10, fontWeight: 700 }}>Days of the week</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {DOW.map(([n, lbl]) => {
            const on = (prog.weekdays || []).includes(Number(n));
            return (
              <button key={n} type="button" onClick={() => toggleDow(Number(n))}
                className={"chip " + (on ? "chip-gold" : "")}
                style={{ cursor: "pointer", border: "1px solid var(--line, rgba(0,0,0,.14))", opacity: on ? 1 : .55 }}
                aria-pressed={on}>{lbl}</button>
            );
          })}
        </div>

        <div className="admin-fields-h" style={{ marginTop: 16, fontWeight: 700 }}>Exceptions</div>
        <p className="admin-hint" style={{ marginTop: 2 }}>A holiday cancels a day that would otherwise run. An extra day adds one that wouldn't.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <input type="date" className="admin-input" style={{ width: 175 }} value={newDate} onChange={e => setNewDate(e.target.value)} aria-label="Exception date"/>
          <button className="btn btn-ghost btn-sm" disabled={!newDate} onClick={() => addException("holidays")}>Cancel this day</button>
          <button className="btn btn-ghost btn-sm" disabled={!newDate} onClick={() => addException("extraDays")}>Add this day</button>
        </div>
        {[["holidays", "Cancelled", "var(--coral)"], ["extraDays", "Added", "var(--lime-ink, #6e9c1d)"]].map(([key, lbl, col]) => (
          (prog[key] || []).length > 0 && (
            <div key={key} style={{ marginTop: 10 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: col }}>{lbl.toUpperCase()} · {(prog[key] || []).length}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(prog[key] || []).map(dt => (
                  <span key={dt} className="chip mono" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    {dt}
                    <button onClick={() => dropException(key, dt)} aria-label={"Remove " + dt}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )
        ))}

        {prog.enabled && (cal.upcoming || []).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>NEXT SESSIONS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(cal.upcoming || []).map(dt => <span key={dt} className="chip mono">{dt}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* ── Policy thresholds ── */}
      <div className="admin-panel" style={{ marginBottom: 18 }}>
        <div className="admin-section-head" style={{ marginBottom: 6 }}>
          <h3 className="admin-h3">Policy enforcement</h3>
          <label className="fb-toggle">
            <input type="checkbox" checked={!!pol.enabled} onChange={e => setPol(o => ({ ...o, enabled: e.target.checked }))}/>
            <span>Enforce the blueprint</span>
          </label>
        </div>
        <p className="admin-hint">
          The Institutional Policy &amp; Operational Blueprint, applied automatically. Absences are
          logged for closed programme days, lateness is measured against the Part VI redline, and
          the thresholds below issue warnings, dormancy, suspension, fines and eviction.
          A suspended or evicted person is refused at the scanner.
        </p>
        {!prog.enabled && pol.enabled && (
          <div className="policy-callout" data-tone="warn">
            Enforcement is on but no programme calendar is set, so <b>every calendar day</b> counts
            as a session — weekends included. Set the term window above before letting the sweep run.
          </div>
        )}

        {[["student", "Students", "Redline 08:30 · 3 lates suspend"], ["volunteer", "Volunteers, mentors & instructors", "Redline 09:00 · 4 lates suspend"]].map(([type, title, sub]) => (
          <div key={type} style={{ marginTop: 14 }}>
            <div className="admin-fields-h" style={{ fontWeight: 700 }}>{title}</div>
            <div className="admin-hint" style={{ margin: "2px 0 8px" }}>{sub}</div>
            <div className="admin-fields">
              <label className="admin-field"><span>Lateness redline</span>
                <input type="time" className="admin-input" value={(pol[type] || {}).lateRedline || ""} onChange={e => setPol2(type, "lateRedline", e.target.value)}/>
              </label>
              <label className="admin-field"><span>Absences allowed</span>
                <input type="number" min={1} max={60} className="admin-input" value={(pol[type] || {}).absenceLimit} onChange={e => setPol2(type, "absenceLimit", Number(e.target.value))}/>
              </label>
              <label className="admin-field"><span>Lateness cap → suspension</span>
                <input type="number" min={1} max={60} className="admin-input" value={(pol[type] || {}).latenessCap} onChange={e => setPol2(type, "latenessCap", Number(e.target.value))}/>
              </label>
              <label className="admin-field"><span>Suspension length (days)</span>
                <input type="number" min={1} max={365} className="admin-input" value={(pol[type] || {}).suspensionDays} onChange={e => setPol2(type, "suspensionDays", Number(e.target.value))}/>
              </label>
              <label className="admin-field"><span>Post-suspension lates → fine</span>
                <input type="number" min={1} max={60} className="admin-input" value={(pol[type] || {}).postSuspensionLateness} onChange={e => setPol2(type, "postSuspensionLateness", Number(e.target.value))}/>
              </label>
              <label className="admin-field"><span>Fine (₦)</span>
                <input type="number" min={0} step={500} className="admin-input" value={(pol[type] || {}).fine} onChange={e => setPol2(type, "fine", Number(e.target.value))}/>
              </label>
            </div>
          </div>
        ))}

        <div className="admin-fields-h" style={{ marginTop: 16, fontWeight: 700 }}>Musing Period, ID cards &amp; reinstatement</div>
        <div className="admin-fields">
          <label className="admin-field"><span>Musing Period ends</span>
            <input type="time" className="admin-input" value={(pol.musing || {}).endsAt || ""} onChange={e => setPol2("musing", "endsAt", e.target.value)}/>
          </label>
          <label className="admin-field"><span>ID card not worn — 2nd offence (₦)</span>
            <input type="number" min={0} step={500} className="admin-input" value={(pol.idCard || {}).secondOffenceFine} onChange={e => setPol2("idCard", "secondOffenceFine", Number(e.target.value))}/>
          </label>
          <label className="admin-field"><span>Lost ID card (₦)</span>
            <input type="number" min={0} step={500} className="admin-input" value={(pol.idCard || {}).lostFine} onChange={e => setPol2("idCard", "lostFine", Number(e.target.value))}/>
          </label>
          <label className="admin-field"><span>Eviction cool-off (days)</span>
            <input type="number" min={0} max={3650} className="admin-input" value={(pol.reinstatement || {}).coolOffDays} onChange={e => setPol2("reinstatement", "coolOffDays", Number(e.target.value))}/>
          </label>
          <label className="admin-field"><span>Reinstatement fine (₦)</span>
            <input type="number" min={0} step={1000} className="admin-input" value={(pol.reinstatement || {}).fine} onChange={e => setPol2("reinstatement", "fine", Number(e.target.value))}/>
          </label>
          <Field label="Reinstatement training" value={(pol.reinstatement || {}).training} onChange={v => setPol2("reinstatement", "training", v)}/>
        </div>
        <label className="fb-toggle" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={!!pol.checkoutRequired} onChange={e => setPol(o => ({ ...o, checkoutRequired: e.target.checked }))}/>
          <span>Require a check-OUT scan — a day with no scan out counts as an absence (§1.3)</span>
        </label>
        <label className="fb-toggle" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={!!(pol.musing || {}).enabled} onChange={e => setPol2("musing", "enabled", e.target.checked)}/>
          <span>Missing the Musing Period downgrades the day to a half-day</span>
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={busy === "save"} onClick={save}>{busy === "save" ? "Saving…" : "Save programme & policy"}</button>
          <button className="btn btn-ghost btn-sm" disabled={busy === "sweep"} onClick={sweep}>{busy === "sweep" ? "Sweeping…" : "Run the absence sweep now"}</button>
          <span className="admin-hint" style={{ margin: 0 }}>
            The sweep runs automatically with the daily jobs. Swept through <span className="mono">{cal.sweptThrough || "—"}</span>.
          </span>
        </div>
      </div>

      {/* ── Compliance board ── */}
      <div className="admin-section-head" style={{ marginBottom: 4 }}>
        <h3 className="admin-h3">Compliance</h3>
        <button className="btn btn-ghost btn-sm" onClick={loadBoard}>Refresh</button>
      </div>
      {!board ? <div className="dash-spinner"/> : (
        <>
          <div className="admin-tiles" style={{ marginBottom: 12 }}>
            <AdminTile n={board.tally.warned || 0} l="Warned"/>
            <AdminTile n={board.tally.dormant || 0} l="Dormant"/>
            <AdminTile n={board.tally.suspended || 0} l="Suspended"/>
            <AdminTile n={board.tally.evicted || 0} l="Evicted"/>
            <AdminTile n={naira(board.tally.finesOwed || 0)} l="Fines outstanding"/>
          </div>
          {!board.board.length
            ? <div className="admin-empty">Nobody has an infraction on record. {board.policyEnabled ? "" : "Enforcement is currently off."}</div>
            : (
              <div className="admin-table-wrap"><table className="admin-table">
                <thead><tr><th>Person</th><th>State</th><th>Absences</th><th>Lates</th><th>Fines</th><th>Awards</th><th/></tr></thead>
                <tbody>{board.board.map(r => (
                  <tr key={r.personId}>
                    <td>{r.fullName}<div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.personId} · {r.personType}</div></td>
                    <td><PolicyStateChip state={r.state}/>{r.until && <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>until {String(r.until).slice(0, 10)}</div>}</td>
                    <td className="mono">{r.absences}/{r.absenceLimit}</td>
                    <td className="mono">{r.lates}/{r.latenessCap}</td>
                    <td className="mono">{r.finesOwed ? naira(r.finesOwed) : "—"}</td>
                    <td>{r.awardsEligible ? <span className="chip status-published">Eligible</span> : <span className="chip status-draft">Frozen</span>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => openPerson(r)}>Record</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
        </>
      )}

      {person && <PolicyPersonModal data={person} onClose={() => setPerson(null)} onChange={(next) => { setPerson(next); loadBoard(); }}/>}
    </div>
  );
}

/* One person's ledger — the facts, the consequences, and the two corrections
   an admin actually needs: void a wrong fact, and close out a sanction. */
function PolicyPersonModal({ data, onClose, onChange }) {
  // No unsaved-edit guard: every action here commits immediately.
  const { panelRef, close } = useAdminDrawer(onClose, false);
  const [busy, setBusy] = React.useState("");
  const st = data.state || {};
  const reload = () => NGGApi.admin.policy.person(data.personId, data.personType).then(onChange).catch(() => {});

  const voidOne = async (inf) => {
    const reason = prompt("Why is this being voided? (recorded against your name)");
    if (!reason || !reason.trim()) return;
    setBusy(String(inf.id));
    try { await NGGApi.admin.policy.void(inf.id, reason.trim()); toast.success("Voided — any sanction it caused has been lifted."); reload(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const closeOut = async (s, status) => {
    setBusy("s" + s.id);
    try { await NGGApi.admin.policy.update(s.id, status); toast.success("Updated"); reload(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const logManual = async (kind, label) => {
    if (!(await dialog.confirm({ title: label + "?", body: "Logged against " + data.personId + " for today, and the thresholds re-evaluated.", cta: "Log it" }))) return;
    setBusy(kind);
    try {
      const r = await NGGApi.admin.policy.infraction(data.personId, data.personType, kind, "", "");
      toast.success(r.alreadyLogged ? "Already logged for today." : r.temporaryCard ? "Logged — issue a temporary Volunteer Emergency Card for today only." : "Logged.");
      reload();
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };
  const reinstate = async () => {
    setBusy("reinstate");
    try {
      const r = await NGGApi.admin.policy.reinstate(data.personId, data.personType, {});
      toast.success(r.reinstated ? "Reinstated." : "Done."); reload();
    } catch (e) {
      const unmet = (e.data && e.data.unmet) || [];
      if (unmet.length) {
        const ok = await dialog.confirm({
          title: "Reinstatement conditions are not met",
          body: unmet.map(u => "· " + u.detail).join("\n") + "\n\nOnly the Governing Council may override this.",
          cta: "Council override", danger: true,
        });
        if (!ok) { setBusy(""); return; }
        const why = prompt("Council resolution / reason for the override:");
        if (!why || !why.trim()) { setBusy(""); return; }
        try { await NGGApi.admin.policy.reinstate(data.personId, data.personType, { councilOverride: true, overrideReason: why.trim() }); toast.success("Reinstated by council override."); reload(); }
        catch (e2) { toast.error(e2.code || e2.message); }
      } else toast.error(e.code || e.message);
    } finally { setBusy(""); }
  };

  return (
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
      <div className="admin-drawer-head">
        <h3>Compliance record · {data.personId}</h3>
        <button type="button" className="admin-drawer-close" onClick={close}>✕</button>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <PolicyStateChip state={st.state}/>
        <span className="mono" style={{ fontSize: 12 }}>{st.absences}/{st.absenceLimit} absences · {st.lates}/{st.latenessCap} lates{st.halfDays ? " · " + st.halfDays + " half-days" : ""}</span>
        {st.finesOwed > 0 && <span className="chip" style={{ background: "var(--coral)", color: "#fff" }}>{naira(st.finesOwed)} outstanding</span>}
        {!st.awardsEligible && <span className="chip status-draft">Awards frozen</span>}
      </div>
      {st.reason && <p className="admin-hint" style={{ marginTop: 0 }}>{st.reason}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => logManual("idcard_missing", "Log: arrived without their ID card")}>No ID card today</button>
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => logManual("idcard_lost", "Log: lost ID card")}>Lost ID card</button>
        {data.personType === "volunteer" && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => logManual("review_missed", "Log: missed Review Time")}>Missed Review Time</button>}
        {st.state === "evicted" && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={reinstate}>Reinstate (Part IV)…</button>}
      </div>

      <div className="eyebrow" style={{ marginBottom: 6 }}>SANCTIONS</div>
      {!data.sanctions.length ? <div className="admin-empty">None.</div> : (
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Kind</th><th>Reason</th><th>Status</th><th/></tr></thead>
          <tbody>{data.sanctions.map(s => (
            <tr key={s.id}>
              <td style={{ textTransform: "capitalize" }}>{s.kind}{Number(s.amount) > 0 ? " · " + naira(s.amount) : ""}</td>
              <td style={{ fontSize: 12 }}>{s.reason}<div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{String(s.issuedAt || "").slice(0, 10)}{s.endsAt ? " → " + String(s.endsAt).slice(0, 10) : ""}</div></td>
              <td><span className="chip">{s.status}</span></td>
              <td style={{ whiteSpace: "nowrap" }}>
                {s.status === "pending" && s.kind === "fine" && <button className="btn btn-ghost btn-sm" disabled={busy === "s" + s.id} onClick={() => closeOut(s, "paid")}>Mark paid</button>}
                {s.status === "active" && s.kind === "suspension" && <button className="btn btn-ghost btn-sm" disabled={busy === "s" + s.id} onClick={() => closeOut(s, "served")}>Mark served</button>}
                {s.status === "active" && s.kind === "dormant" && <button className="btn btn-ghost btn-sm" disabled={busy === "s" + s.id} onClick={() => closeOut(s, "cleared")}>Clear</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      <div className="eyebrow" style={{ margin: "18px 0 6px" }}>LEDGER</div>
      <p className="admin-hint" style={{ marginTop: 0 }}>The facts the sanctions above are derived from. Void a wrong one and everything it caused is lifted immediately.</p>
      {!data.infractions.length ? <div className="admin-empty">Nothing logged.</div> : (
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Date</th><th>Kind</th><th>Note</th><th/></tr></thead>
          <tbody>{data.infractions.map(i => (
            <tr key={i.id} style={i.voidedAt ? { opacity: .5 } : undefined}>
              <td className="mono">{i.date}</td>
              <td>{String(i.kind).replace(/_/g, " ")}</td>
              <td style={{ fontSize: 12 }}>{i.voidedAt ? <em>Voided — {i.voidReason}</em> : i.note}</td>
              <td>{!i.voidedAt && <button className="btn btn-ghost btn-sm" disabled={busy === String(i.id)} onClick={() => voidOne(i)}>Void</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      </div>
    </div>
  );
}

// ── Attendance analytics dashboard (Phase 2) ────────────────────────────────
/* The scenarios a coordinator actually walks in with, in the order they matter.
   They were an unlabelled dropdown of five, so the only way to find out whether
   one had anybody in it was to pick it — and "never attended" did not exist at
   all: a child who had not appeared once was hidden inside "under 50%" with
   everybody who was merely struggling. */
/* The last few open days as a shape.
   A rate cannot tell a child who comes three days a week, every week, from one
   who came every day for a fortnight and then stopped — both land on 60%, and
   they need opposite responses. The strip shows which is which without the
   reader reconstructing it from a "last seen" date. */
function AttPattern({ pattern, missedRun }) {
  const cells = pattern || [];
  if (!cells.length) return <span className="mono" style={{ color: "var(--ink-500)", fontSize: 11 }}>—</span>;
  const title = cells.length + " most recent open days, oldest first"
    + (missedRun ? " · missed the last " + missedRun : "");
  return (
    <span className="att-pat" title={title} aria-label={title}>
      {cells.map((c, i) => <i key={i} data-d={c}/>)}
    </span>
  );
}

/** "Missed the last 6 days" needs no arithmetic; a date does. */
function attMissedLabel(r) {
  const n = r.missedRun || 0;
  if (!n) return "";
  if ((r.present || 0) === 0) return "never came";
  return "missed the last " + n + (n === 1 ? " day" : " days");
}

const ATT_SCENARIOS = [
  { key: "all", label: "Everyone", hint: "the whole register" },
  { key: "absent", label: "Absent today", hint: "no check-in yet today" },
  { key: "present", label: "In today", hint: "checked in today" },
  /* "Came then stopped" and "never came" and "attends badly" are three
     different problems that all used to be one number. Ordered so the two that
     need a phone call today sit before the one that needs a timetable talk. */
  { key: "stopped", label: "Stopped coming", hint: "was attending, has missed the last few open days", tone: "bad" },
  { key: "never", label: "Never attended", hint: "had open days and came to none of them", tone: "bad" },
  /* Split out of "never attended", which used to hold both. Somebody approved
     this week has had no chance to attend yet, and putting them on the
     phone-call list is how that list stops being read. */
  { key: "new", label: "Too new to say", hint: "not enough open days yet to judge", volunteerOnly: true },
  { key: "atrisk", label: "Under 50%", hint: "at risk on attendance", tone: "bad" },
  { key: "late", label: "Late arrivals", hint: "has arrived late", tone: "warn" },
  { key: "half", label: "Half days", hint: "missed the Musing Period", tone: "warn" },
  { key: "flagged", label: "Warned or worse", hint: "has a standing flag", tone: "bad" },
  { key: "perfect", label: "Every day", hint: "100% of the window", tone: "good" },
];

/* One day of the register, opened from its bar.
   Two lists, because "the centre was half empty on Tuesday" and "two
   instructors did not come on Tuesday" are the same morning and usually the
   same story — and the second was invisible on this screen entirely. */
function AttendanceDayPanel({ day, onClose }) {
  const [side, setSide] = React.useState("out");   // out | in
  const c = day.studentCounts || {}, vc = day.volunteerCounts || {};
  const pick = (rows) => (rows || []).filter(r => (side === "in" ? r.in : !r.in));
  const kids = pick(day.students), vols = pick(day.volunteers);
  const list = (rows, empty) => rows.length === 0
    ? <div className="admin-hint" style={{ margin: "6px 0 0" }}>{empty}</div>
    : <div className="att-day-names">
        {rows.map(r => (
          <span key={r.id} className="att-day-name" data-late={r.status === "late" ? "1" : ""}>
            {r.name || r.id}
            {r.meta ? <i className="att-day-meta">{r.meta}</i> : null}
            {side === "in" && r.at ? <i className="att-day-meta">{r.at}{r.status === "late" ? " · late" + (r.lateMinutes ? " " + r.lateMinutes + "m" : "") : ""}{r.halfDay ? " · ½" : ""}</i> : null}
          </span>
        ))}
      </div>;
  return (
    <div className="att-day">
      <div className="att-day-head">
        <div>
          <b>{day.date}</b>
          {day.programmeDay === false
            /* Nobody is absent from a day the programme did not run — the whole
               point of the calendar. Any scans on it are still shown, because a
               check-in on a closed day is worth seeing. */
            ? <span className="att-day-tag" data-tone="muted">no session — nobody is absent</span>
            : <span className="att-day-tag">{c.in || 0} of {c.total || 0} children · {vc.in || 0} of {vc.total || 0} volunteers</span>}
        </div>
        <span style={{ flex: 1 }}/>
        <div className="att-seg" role="group" aria-label="In or out">
          {[["out", "Not in", (c.out || 0) + (vc.out || 0)], ["in", "Checked in", (c.in || 0) + (vc.in || 0)]].map(([k, l, n]) => (
            <button key={k} className={"att-seg-btn" + (side === k ? " is-on" : "")} onClick={() => setSide(k)} aria-pressed={side === k}>
              {l}<span className="att-seg-n">{n}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close the day">✕</button>
      </div>
      {side === "in" && (c.late || vc.late) ? (
        <div className="admin-hint" style={{ margin: "0 0 8px" }}>{(c.late || 0) + (vc.late || 0)} arrived late{(c.halfDays || vc.halfDays) ? " · " + ((c.halfDays || 0) + (vc.halfDays || 0)) + " half day(s)" : ""}.</div>
      ) : null}
      <div className="att-day-cols">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>CHILDREN · {kids.length}</div>
          {list(kids, side === "in" ? "No child checked in on this day." : "Every child was in.")}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>VOLUNTEERS · {vols.length}</div>
          {/* A volunteer who joined after this date is not on either list — they
              were not absent from a day they had not started. */}
          {list(vols, side === "in" ? "No volunteer checked in on this day." : "Every volunteer was in.")}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" disabled={!kids.length && !vols.length}
          onClick={() => downloadCsv("attendance-" + day.date + "-" + side, kids.map(r => ({ kind: "child", id: r.id, name: r.name, detail: r.meta, centre: r.centre, status: r.status, at: r.at, lateMinutes: r.lateMinutes, halfDay: r.halfDay ? "yes" : "no" }))
            .concat(vols.map(r => ({ kind: "volunteer", id: r.id, name: r.name, detail: r.meta, centre: r.centre, status: r.status, at: r.at, lateMinutes: r.lateMinutes, halfDay: r.halfDay ? "yes" : "no" }))))}>
          Export this list
        </button>
      </div>
    </div>
  );
}

function SummerAttendance() {
  const [a, setA] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [ins, setIns] = React.useState(null);
  const [insBusy, setInsBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [only, setOnly] = React.useState("all");
  /* Who the register is about. The volunteers' own check-ins have been in the
     same table all along — every query on this screen joins summer_students so
     that they cannot skew the children's rate, and the side effect was that the
     people running the centre appeared nowhere on the one screen about who
     turned up. */
  const [who, setWho] = React.useState("students");   // students | volunteers
  const [vols, setVols] = React.useState(null);
  const [range, setRange] = React.useState({ from: "", to: "" });   // "" = the whole term
  const [centre, setCentre] = React.useState("");
  /* One day, opened. The bar chart could say Tuesday was thin and nothing
     else, and the follow-up question is always WHICH children — which meant
     exporting the register and reading dates by eye. */
  const [day, setDay] = React.useState(null);       // { date, ...payload }
  const [dayBusy, setDayBusy] = React.useState("");
  const openDay = async (date) => {
    if (!date) return;
    setDayBusy(date); setDay(null);
    try {
      const r = await NGGApi.admin.summer.attendanceDay(date, centre ? { centre } : {});
      setDay(r.day);
    } catch (e) { toast.error(e.code === "bad_date" ? "That isn't a date." : (e.code || e.message)); }
    finally { setDayBusy(""); }
  };
  const [sort, setSort] = React.useState("rate");
  /* The search is DEBOUNCED and then SENT.
     It used to filter in the browser, over rows the server had already sorted
     lowest-rate-first and cut to 300 — so a chip read "47 attending every day"
     beside an empty table, and typing a name found nothing whenever that child
     was not among the worst three hundred. */
  const [qLive, setQLive] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setQ(qLive.trim()), 250);
    return () => clearTimeout(t);
  }, [qLive]);
  const opts = React.useMemo(() => {
    const o = {};
    if (range.from) o.from = range.from;
    if (range.to) o.to = range.to;
    if (centre) o.centre = centre;
    if (q) o.q = q;
    if (only && only !== "all") o.scenario = only;
    if (sort && sort !== "rate") o.sort = sort;
    return o;
  }, [range.from, range.to, centre, q, only, sort]);
  const load = React.useCallback(() => {
    NGGApi.admin.summer.attendance("", opts).then(r => setA(r.attendance)).catch(e => setErr(e.code || e.message));
    /* The volunteer half is additive: a server that does not serve it yet, or a
       refusal, leaves that tab empty rather than taking the children's register
       down with it. */
    try {
      const call = NGGApi.admin.summer.volunteerAttendance;
      if (typeof call === "function") call(opts).then(r => setVols(r.volunteers)).catch(() => setVols(null));
      else setVols(null);
    } catch (_) { setVols(null); }
  }, [opts]);
  React.useEffect(() => { load(); }, [load]);
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
  const prog = a.programme || {};
  const closed = prog.enabled && !prog.isProgrammeDay;
  /* The rows ARE the answer now: the search and the situation were applied to
     the whole register on the server, before the cap, so what arrives is what
     matched rather than what happened to survive the slice. */
  const roster = a.roster;
  const volRoster = (vols && vols.roster) || [];
  const volSum = (vols && vols.summary) || null;
  // What the cap dropped, said out loud — a truncated register that does not
  // admit it reads as "this is everyone".
  const matched = who === "volunteers" ? ((vols && vols.matched) != null ? vols.matched : volRoster.length)
    : (a.rosterMatched != null ? a.rosterMatched : roster.length);
  const shownCount = who === "volunteers" ? volRoster.length : roster.length;
  const truncated = matched > shownCount;
  const win = a.window || {};
  /* Name the window wherever a rate is shown. A bare "Rate" column against an
     unstated span was the main reason this screen was hard to read: 62% of the
     term and 62% of last week are different findings. */
  const winLabel = win.scope === "range" ? (win.from || "?") + " → " + (win.to || "?")
    : win.scope === "term" ? "term to date · " + (win.from || "?") + " → " + (win.to || "?")
    : "days scanned";
  /* Counted over the WHOLE register by the server, never over the drawn page.
     A chip that counts what is on screen tells you how big the page is, which
     is the one thing nobody wants to know. */
  const scenarioCounts = (who === "volunteers" ? (vols && vols.scenarios) : a.scenarios) || {};
  const scenarioCount = (k) => scenarioCounts[k] != null ? scenarioCounts[k] : null;
  const rangePreset = (days) => {
    const end = win.to || prog.today || "";
    if (!end) return;
    const t = Date.parse(end + "T00:00:00Z");
    if (!t) return;
    setRange({ from: new Date(t - (days - 1) * 86400000).toISOString().slice(0, 10), to: end });
  };
  /* From the catalogue the server sends, not from the rows. Derived from the
     roster it collapsed to a single option the moment a centre was picked —
     because the roster had already been narrowed to that centre — so there was
     no way to move from one centre to another. */
  const centreOptions = a.centres || [];
  return (
    <div>
      {prog.enabled && (
        <div className="policy-callout" data-tone={closed ? "muted" : "ok"} style={{ marginTop: 0 }}>
          {closed
            ? <><b>No session today ({prog.today}).</b> Nobody is counted absent{prog.nextDay ? <> — next session is <b>{prog.nextDay}</b>.</> : " — the term has ended."}</>
            : <><b>Session day {a.sessionDays}</b>{prog.remaining ? <> of {a.sessionDays + prog.remaining}</> : null} · term {prog.termStart} → {prog.termEnd}.</>}
        </div>
      )}
      {!prog.enabled && (
        <div className="policy-callout" data-tone="warn" style={{ marginTop: 0 }}>
          No programme calendar is set, so <b>every calendar day counts as a session</b> — weekends
          included, and rates are measured against days somebody happened to scan.
          Set the days in <b>Programme &amp; policy</b>.
        </div>
      )}

      <div className="admin-tiles" style={{ marginBottom: 14 }}>
        <AdminTile n={a.today} l="Present today"/>
        <AdminTile n={closed ? "—" : a.absentToday} l={closed ? "Absent (closed)" : "Absent today"}/>
        <AdminTile n={a.activeStudents} l="Active students"/>
        {/* Says WHICH days, because the rate column below is out of this
            number and a bare count leaves the reader to guess the span. */}
        <AdminTile n={a.sessionDays} l={win.ranged ? "Days in range" : (prog.enabled ? "Programme days run" : "Days scanned")}/>
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

      <div className="eyebrow" style={{ margin: "4px 0 10px" }}>
        {win.ranged ? "SELECTED DATES · " + a.days.length + " DAY" + (a.days.length === 1 ? "" : "S") : "LAST 14 DAYS"}
      </div>
      <div className="summer-attbar">
        {/* A closed day is drawn as closed, not as a collapse in attendance —
            a flat Sunday next to a full Friday used to read as a crisis. */}
        {a.days.map((d, i) => (
          /* A button, not a div: "which children" is the question every thin
             bar raises, and it was previously only answerable by exporting the
             register and reading dates by eye. */
          <button key={i} type="button"
            className={"summer-attbar-col" + (d.programmeDay === false ? " is-closed" : "") + (day && day.date === d.date ? " is-open" : "")}
            onClick={() => openDay(d.date)} disabled={dayBusy === d.date}
            aria-label={"Open " + d.date + (d.programmeDay === false ? " (no session)" : " — " + d.present + " present")}
            title={d.date + (d.programmeDay === false ? " · no session" : " · " + d.present + " present") + " — click for the names"}>
            <div className="summer-attbar-track"><div className="summer-attbar-fill" style={{ height: (d.present / maxDay * 100) + "%" }}/></div>
            <span className="summer-attbar-lbl">{d.date.slice(8)}</span>
          </button>
        ))}
      </div>
      {dayBusy && <div className="admin-hint" style={{ marginTop: 8 }}>Opening {dayBusy}…</div>}
      {day && <AttendanceDayPanel day={day} onClose={() => setDay(null)}/>}

      {a.atRisk.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: "var(--coral)" }}>AT RISK · under 50% attendance</div>
          <div className="summer-atrisk">
            {a.atRisk.slice(0, 12).map(r => <span key={r.studentId} className="summer-atrisk-chip">{r.fullName} <b>{r.rate}%</b></span>)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button className="btn btn-ghost btn-sm" disabled={closed} onClick={async () => {
          if (!(await dialog.confirm({ title: "Email the guardians of every student absent today?", body: a.absentToday + " student(s) have no check-in today. Each guardian with an email on file gets one \u201cwe missed them\u201d note.", cta: "Send " + a.absentToday + " email(s)" }))) return;
          try { const r = await NGGApi.admin.summer.absenceAlert(); toast.success("Emailed " + (r.sent || 0) + " guardian(s)" + (r.skipped ? " (" + r.skipped + " had no email)" : "") + ".", "Absence follow-up"); }
          catch (e) {
            if (e.code === "not_a_programme_day") toast.error("Today isn't a programme day — nobody is absent." + ((e.data && e.data.nextDay) ? " Next session: " + e.data.nextDay + "." : ""));
            else toast.error(e.code || e.message);
          }
        }}>Email today's absentees' guardians</button>
        <span className="admin-hint" style={{ marginLeft: 10 }}>
          {closed ? "Disabled — there is no session today, so nobody is absent." : "Sends a warm \u201cwe missed them\u201d nudge to guardians with an email on file."}
        </span>
      </div>

      {/* ── The register controls ────────────────────────────────────────────
          Who it is about, over which dates, in which situation. All three were
          missing: the screen showed students only, term-to-date only, and hid
          the scenarios behind an unlabelled dropdown. */}
      <div className="att-controls">
        <div className="att-controls-row">
          <div className="att-seg" role="group" aria-label="Whose attendance">
            {/* The whole register, not the filtered page — a tab that renumbers
                itself as you filter cannot tell you which register is bigger. */}
            {[["students", "Children", a.rosterTotal != null ? a.rosterTotal : roster.length],
              ["volunteers", "Volunteers", (vols && vols.total != null) ? vols.total : volRoster.length]].map(([k, l, n]) => (
              <button key={k} className={"att-seg-btn" + (who === k ? " is-on" : "")} onClick={() => setWho(k)} aria-pressed={who === k}>
                {l}<span className="att-seg-n">{n}</span>
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }}/>
          <input className="admin-input" style={{ width: 230 }} placeholder={who === "volunteers" ? "Search name, ID, role, centre" : "Search name, ID, track, centre"}
            value={qLive} onChange={e => setQLive(e.target.value)} aria-label="Search the register"/>
        </div>

        <div className="att-controls-row">
          <span className="eyebrow" style={{ margin: 0 }}>DATES</span>
          <input className="admin-input" type="date" value={range.from} max={range.to || undefined}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))} aria-label="From date"/>
          <span className="mono" style={{ color: "var(--ink-500)" }}>→</span>
          <input className="admin-input" type="date" value={range.to} min={range.from || undefined}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))} aria-label="To date"/>
          {[["Today", 1], ["7 days", 7], ["30 days", 30]].map(([l, n]) => (
            <button key={l} className="btn btn-ghost btn-sm" onClick={() => rangePreset(n)}>{l}</button>
          ))}
          <button className="btn btn-ghost btn-sm" disabled={!win.ranged} onClick={() => setRange({ from: "", to: "" })}>
            Whole term
          </button>
          {centreOptions.length > 1 && (
            <select className="admin-select" value={centre} onChange={e => setCentre(e.target.value)} aria-label="Filter by centre">
              <option value="">All centres</option>
              {centreOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select className="admin-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort the register">
            <option value="rate">Lowest attendance first</option>
            <option value="best">Highest attendance first</option>
            <option value="name">By name</option>
            <option value="seen">Most recently seen</option>
          </select>
        </div>

        {/* Every scenario carries its own count, so choosing one is no longer
            the only way to discover whether it has anybody in it. */}
        <div className="att-chips" role="group" aria-label="Situation">
          {/* "Too new to say" only exists on the volunteer side: children enrol
              at the start of a term together, volunteers arrive all through it,
              which is why only one of the two registers needs the distinction. */}
          {ATT_SCENARIOS.filter(s => !s.volunteerOnly || who === "volunteers").map(s => {
            const n = scenarioCount(s.key);
            return (
              /* Nothing in it? Say so and disable it, rather than offering a
                 filter whose only outcome is an empty table. */
              <button key={s.key} className={"att-chip" + (only === s.key ? " is-on" : "") + (n === 0 ? " is-empty" : "")}
                data-tone={s.tone || ""} disabled={n === 0 && only !== s.key}
                title={s.hint} aria-pressed={only === s.key} onClick={() => setOnly(s.key)}>
                {s.label}<span className="att-chip-n">{n == null ? "…" : n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div className="eyebrow" style={{ margin: 0 }}>{who === "volunteers" ? "ATTENDANCE BY VOLUNTEER" : "ATTENDANCE BY CHILD"}</div>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>
          {win.days || 0} day{(win.days || 0) === 1 ? "" : "s"} · {winLabel}
          {" · "}{matched} match{matched === 1 ? "" : "es"}
          {/* Said, not implied. A register cut to the cap that does not admit it
              reads as "this is everyone", which is the wrong thing to believe
              about a list of children who did not turn up. */}
          {truncated ? " · showing the first " + shownCount : ""}
        </span>
        <span style={{ flex: 1 }}/>
        <button className="btn btn-ghost btn-sm"
          disabled={who === "volunteers" ? !volRoster.length : !roster.length}
          onClick={() => who === "volunteers"
            ? downloadCsv("volunteer-attendance", volRoster.map(r => ({ volunteerId: r.volunteerId, fullName: r.fullName, role: r.role, centre: r.centre, faculty: r.faculty, joined: r.joined, present: r.present, expected: r.expected, rate: (r.rate == null ? "" : r.rate + "%"), onTimePct: (r.onTimePct == null ? "" : r.onTimePct + "%"), lates: r.lates, streak: r.streak, lastSeen: r.lastSeen, presentToday: r.presentToday ? "yes" : "no", windowFrom: win.from, windowTo: win.to })))
            : downloadCsv("summer-attendance", roster.map(r => ({ studentId: r.studentId, fullName: r.fullName, track: r.track, centre: r.centre, present: r.present, sessionDays: a.sessionDays, rate: r.rate + "%", halfDays: r.halfDays || 0, lates: r.lates || 0, absences: r.absences || 0, state: r.state || "clear", lastSeen: r.lastSeen, presentToday: r.presentToday ? "yes" : "no", windowFrom: win.from, windowTo: win.to })))}>
          Export CSV{who === "volunteers"
            ? (volRoster.length !== ((vols && vols.roster) || []).length ? " (" + volRoster.length + ")" : "")
            : (roster.length !== a.roster.length ? " (" + roster.length + ")" : "")}
        </button>
      </div>

      {who === "volunteers" ? (
        !vols ? <div className="admin-empty">Couldn't load volunteer attendance.</div>
        : !volRoster.length ? (
          /* Told apart by the WHOLE register, not by the drawn rows. Now that
             the filter runs on the server, an empty result means nothing
             matched — reading it as "there are none" tells a coordinator the
             roster is empty when it is merely filtered. */
          <div className="admin-empty">{(vols.total || 0) > 0 ? "No volunteer matches that filter." : "No active volunteers on the roster yet."}</div>
        ) : (
        <>
          {volSum && volSum.measurable && (
            <div className="admin-tiles" style={{ margin: "8px 0 12px" }}>
              <AdminTile n={(volSum.kpis.rate == null ? "—" : volSum.kpis.rate + "%")} l="Volunteer attendance"/>
              <AdminTile n={(volSum.kpis.onTimePct == null ? "—" : volSum.kpis.onTimePct + "%")} l="On time"/>
              <AdminTile n={volSum.kpis.absences} l="Absences"/>
              <AdminTile n={volSum.kpis.reliable} l="Reliable (75%+)"/>
            </div>
          )}
          <div className="admin-table-wrap"><table className="admin-table att-table">
            <thead><tr>
              <th>Volunteer</th><th>Role</th>
              <th>Days in<span className="att-th-sub">of their own open days</span></th>
              <th>Rate<span className="att-th-sub">{win.ranged ? "in this range" : "since they joined"}</span></th>
              <th>On time</th><th>Streak</th>
              <th>Pattern<span className="att-th-sub">oldest → newest</span></th>
              <th>Last seen</th><th>Today</th>
            </tr></thead>
            <tbody>{volRoster.map(r => (
              <tr key={r.volunteerId}>
                <td>{r.fullName}<div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.volunteerId}{r.centre ? " · " + r.centre : ""}</div></td>
                <td>{r.role || "—"}{r.faculty ? <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.faculty}</div> : null}</td>
                {/* Their own denominator: programme days since THEY joined, not
                    the whole window — a volunteer who started in week four did
                    not miss weeks one to three. */}
                <td className="mono">{r.present}/{r.expected}{r.joined ? <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>from {r.joined}</div> : null}</td>
                <td style={{ minWidth: 120 }}>{r.rate == null ? <span className="mono" style={{ color: "var(--ink-500)" }}>no days yet</span>
                  : <div className="summer-rate"><div className="summer-rate-bar"><div className="summer-rate-fill" style={{ width: Math.min(100, r.rate) + "%", background: r.rate < 50 ? "var(--coral)" : r.rate < 80 ? "var(--gold-500)" : "var(--lime-ink, #6e9c1d)" }}/></div><span className="mono">{r.rate}%</span></div>}</td>
                <td className="mono" style={{ color: (r.onTimePct != null && r.onTimePct < 80) ? "var(--gold-700,#7a5600)" : undefined }}>{r.onTimePct == null ? "—" : r.onTimePct + "%"}</td>
                <td className="mono">{r.streak ? r.streak : "—"}</td>
                <td><AttPattern pattern={r.pattern} missedRun={r.missedRun}/>
                  {r.stopped ? <div className="mono att-stopped">{attMissedLabel(r)}</div> : null}</td>
                <td className="mono">{r.lastSeen || "—"}</td>
                <td>{r.presentToday ? <span className="chip status-published">✓</span> : <span className="chip status-draft">—</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {/* The same caveats the public board carries. A volunteer rate has a
              denominator that assumes every programme day, and there is no rota
              in the system to net a part-time arrangement out of it. */}
          {volSum && (volSum.caveats || []).length > 0 && (
            <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {volSum.caveats.map((c, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-500)", marginBottom: 4 }}>{c}</li>)}
            </ul>
          )}
        </>
        )
      ) : !roster.length ? (
        <div className="admin-empty">{(a.rosterTotal || 0) > 0 ? "No child matches that filter." : "Nobody is enrolled in this cohort yet."}</div>
      ) : (
      <div className="admin-table-wrap" style={{ marginTop: 8 }}><table className="admin-table att-table">
        {/* The headers carry their own units. "Present" and "Rate" against an
            unstated span is what made this table hard to read: the reader had to
            hold the window in their head to know what 62% was 62% of. */}
        <thead><tr>
          <th>Child</th><th>Track</th>
          <th>Days in<span className="att-th-sub">of {a.sessionDays} open</span></th>
          <th>Rate<span className="att-th-sub">{win.ranged ? "in this range" : "this term"}</span></th>
          <th>Late</th><th>Standing</th>
          <th>Pattern<span className="att-th-sub">oldest → newest</span></th>
          <th>Last seen</th><th>Today</th>
        </tr></thead>
        <tbody>{roster.map(r => (
          <tr key={r.studentId} data-risk={r.rate < 50 ? "1" : ""}>
            <td>{r.fullName}<div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.studentId}{r.centre ? " · " + r.centre : ""}</div></td>
            <td>{r.track || "—"}</td>
            {/* A child who has never once appeared is a different problem from
                one attending badly, and 0/10 read the same as 3/10 at a glance. */}
            <td className="mono">{(r.present || 0) === 0
              ? <b style={{ color: "var(--coral)" }}>never</b>
              : <>{r.present}<span style={{ color: "var(--ink-500)" }}>/{a.sessionDays}</span></>}
              {r.halfDays ? <span title={r.halfDays + " half-day(s) — missed the Musing Period"} style={{ color: "var(--ink-500)" }}> ·{r.halfDays}½</span> : null}</td>
            <td style={{ minWidth: 120 }}><div className="summer-rate"><div className="summer-rate-bar"><div className="summer-rate-fill" style={{ width: Math.min(100, r.rate) + "%", background: r.rate < 50 ? "var(--coral)" : r.rate < 80 ? "var(--gold-500)" : "var(--lime-ink, #6e9c1d)" }}/></div><span className="mono">{r.rate}%</span></div></td>
            <td className="mono">{r.lates ? r.lates : "—"}</td>
            <td>{r.state && r.state !== "clear" ? <PolicyStateChip state={r.state}/> : <span className="mono" style={{ color: "var(--ink-500)" }}>—</span>}</td>
            <td><AttPattern pattern={r.pattern} missedRun={r.missedRun}/>
              {r.stopped ? <div className="mono att-stopped">{attMissedLabel(r)}</div>
                : r.missedRun ? <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-500)" }}>{attMissedLabel(r)}</div> : null}</td>
            <td className="mono">{r.lastSeen || <span style={{ color: "var(--coral)" }}>never</span>}</td>
            <td>{r.presentToday ? <span className="chip status-published">✓</span> : <span className="chip status-draft">—</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      )}
      {truncated && who !== "volunteers" && (
        <p className="admin-hint" style={{ marginTop: 8 }}>
          {matched} children match; the first {shownCount} are shown. Narrow by centre or situation, or export the CSV for the whole list.
        </p>
      )}

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
            <div className="mono admin-topbar-eyebrow">{brand.eyebrow}</div>
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

/* AdminVolunteers is exported so the roster can be mounted on its own. It
   needs nothing but its one data call — no auth, no shell — and the console
   around it is what makes the rest of the admin tree expensive to test. */
Object.assign(window, { AdminPage, SummerAdminPortal, ClubAdminPortal, AdminVolunteers, SummerGates });
