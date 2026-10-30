/* ================================================================
   NGG — the staff portals: Summer School (/summer-admin) and the NGG
   Club (/club-admin), with the panels and helpers they render.

   These lived inside page-admin.jsx beside the HQ Control Room and are
   moved here unchanged, so the Control Room can be rebuilt on its own
   (docs/HANDOFF.md, 2026-10-06) without taking the two portals with it.
   ================================================================ */
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
  /* Every drawer is role="dialog" aria-modal="true" and, until now, none of
     them had a NAME — a screen reader announced "dialog" and stopped, with the
     heading sitting right there in the head. Minted here so a drawer cannot
     forget it: spread `titleProps` onto the dialog and `headingProps` onto the
     <h3>. */
  const titleId = React.useId();
  const close = React.useCallback(() => {
    if (guard && touched.current && typeof dialog !== "undefined" && dialog.confirm) {
      dialog.confirm({ title: "Discard changes?", body: "You have edits that haven't been saved yet.", cta: "Discard", cancel: "Keep editing", danger: true })
        .then(ok => { if (ok) onClose(); });
    } else { onClose(); }
  }, [onClose, guard]);
  /* The latest close, read by the key handler. The effect below runs ONCE: it
     used to depend on `close`, which changes whenever the parent re-renders
     with a fresh onClose — and each re-run focused the first field again, so
     someone editing the Email of a mentor was thrown back to Full name. */
  const closeRef = React.useRef(close);
  closeRef.current = close;
  React.useEffect(() => {
    const prev = document.activeElement;
    const el = panelRef.current;
    if (el) { const f = el.querySelector('input,select,textarea,button:not(.admin-drawer-close)'); if (f) setTimeout(() => { try { if (!el.contains(document.activeElement)) f.focus(); } catch (_) {} }, 40); }
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
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
  }, []);
  return {
    panelRef, close, onInput: () => { touched.current = true; },
    titleProps: { "aria-labelledby": titleId },
    headingProps: { id: titleId },
  };
}

// Cross-section deep-link: jump the console to another section (and optionally a
// specific sub-tab). window.__adminSection is exposed by the Control Room shell (cr-app.jsx); a section
// that supports tabs reads the pending tab on mount. Lets one screen point an
// admin straight at where a piece of data is actually edited.
/* ── The pending sub-tab, for a cross-section deep link ────────────────────
 *
 * It was a bare module global read once, inside a useState initialiser. Two
 * bugs live in that shape, and both bit:
 *
 *   1. A jump to a section that is ALREADY open never applies. The section
 *      does not remount, so nothing re-reads the global — the Control Room
 *      simply ignores you. (Opening "QR cards" from the palette while Summer
 *      School was already on screen did nothing at all.)
 *   2. The unread value then LEAKS. It sits in the global until the next time
 *      any section mounts, so leaving Summer School and coming back later
 *      landed on somebody else's stale deep link rather than the default panel.
 *
 * So it is a tiny store with subscribers. `useAdminTab` seeds from it AND
 * re-reads on every publish, which is what makes a jump work whether or not
 * the section happens to remount; and reading always clears, so nothing leaks.
 */
let _pendingAdminTab = "";
const _pendingTabSubs = new Set();
function takePendingAdminTab(fallback) {
  const t = _pendingAdminTab || fallback;
  _pendingAdminTab = "";
  return t;
}

/** A section's active sub-tab, honouring cross-section deep links.
 *
 *  `valid` rejects a tab this section does not have, so a jump aimed at
 *  another section cannot leave this one rendering nothing. */
function useAdminTab(fallback, valid) {
  // `valid` is required in practice: without it an open section accepts any
  // jump's tab (see below). Every caller declares its own tab ids.
  const okTab = React.useCallback((t) => !!t && (!valid || valid(t)), [valid]);
  const [tab, setTab] = React.useState(() => {
    const t = takePendingAdminTab("");
    return okTab(t) ? t : fallback;
  });
  React.useEffect(() => {
    /* A section ALREADY on screen takes a pending tab only when it is one of
       its own. Subscribers fire before the target section mounts, so taking
       every tab let whichever section was open consume a jump aimed at the
       next one — the Status board swallowed `members/roster`, and Members
       opened on its Dashboard. Mounting (the initialiser above) still always
       consumes, so a pending tab cannot leak past the section it was for. */
    const fn = () => { if (okTab(_pendingAdminTab)) setTab(takePendingAdminTab("")); };
    _pendingTabSubs.add(fn);
    fn();   // a jump that arrived while this section was already on screen
    return () => { _pendingTabSubs.delete(fn); };
    // eslint-disable-next-line
  }, []);
  return [tab, setTab];
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
                      <div className="mono" style={{ display: "grid", gridTemplateColumns: "var(--rs-gcolumns-16, 1fr 1fr)", gap: "2px 16px", marginTop: 6, fontSize: 13 }}>
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
            {err && <div role="alert" className="signin-err">{err}</div>}
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

/* General dashboard — the Summer School 2026 board: live attendance + per-centre
   analytics. Read-only; any console admin (incl. the M&E audit role) sees it. */
/* `AdminDashboard` used to live here — an at-a-glance attendance and
 * per-centre board reading `admin.dashboard.overview`. Nothing rendered it:
 * the `dashboard` section mounts the M&E AnalyticsWorkspace, and the Overview
 * covers the membership counts, so it had been unreachable code for as long as
 * both of those have existed.
 *
 * THE OP IS DELIBERATELY KEPT. `admin.dashboard.overview` is read-only,
 * admin-gated, centre-scope aware and covered by four tests including the
 * scoping one — deleting tested behaviour to tidy away an orphan trades a real
 * guarantee for a cosmetic one. It currently has no UI consumer, which is
 * recorded here and in CLAUDE.md so the next reader does not "fix" it by
 * rebuilding a third overview screen beside the two that already exist.
 */
function AdminTile({ n, l, onClick, loading }) {
  return (
    <button className="admin-tile" onClick={onClick}>
      <div className="admin-tile-n">{loading ? <span className="dash-skel" style={{display:"inline-block", width:64, height:34, borderRadius:8}}/> : n}</div>
      <div className="mono admin-tile-l">{l}</div>
    </button>
  );
}

/* A column header you can order by.
 *
 * There are 51 tables and 316 header cells in this file and, until this, not
 * one sortable column: a coordinator holding four hundred children could not
 * put the roster in name order, and `aria-sort` did not appear anywhere in the
 * codebase. Newest-first is a fine default and a poor only-option.
 *
 * A real <button> inside the <th>, not a click handler on the cell — a header
 * that reorders the table is a control, and a control has to be reachable by
 * keyboard and announce what it does. `aria-sort` on the th is what tells a
 * screen-reader user which column the table is currently ordered by; the arrow
 * is the same information for everyone else.
 *
 * Clicking the active column flips direction. Clicking a new one starts at the
 * direction that column is USEFULLY read in: names ascend (A first), dates and
 * numbers descend (newest, largest first), because that is what somebody means
 * when they say "sort by joined".
 */
function SortTh({ label, col, sort, onSort, numeric, defaultDir }) {
  const active = sort && sort.col === col;
  const dir = active ? sort.dir : null;
  const next = active ? (dir === "asc" ? "desc" : "asc") : (defaultDir || (numeric ? "desc" : "asc"));
  return (
    <th className={"admin-sort-th" + (numeric ? " admin-num" : "") + (active ? " is-on" : "")}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="admin-sort-btn" onClick={() => onSort(col, next)}>
        <span>{label}</span>
        {/* Hidden from the accessibility tree: aria-sort on the th already
            says this, and a screen reader announcing "sorted ascending ▲"
            reads the same fact twice. */}
        <span className="admin-sort-ind" aria-hidden="true">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
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
      <span className="admin-pager-count mono">{fmtNum(from)}–{fmtNum(to)} of {fmtNum(total)}</span>
      <div className="admin-pager-btns">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">← Prev</button>
        <span className="admin-pager-page mono" aria-current="page">Page {page} / {pages}</span>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next →</button>
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
function memberStatusLabel(v) { const o = MEMBER_STATUS_OPTS.find(x => x.value === v); return o ? o.label : (v || "—"); }

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

// Pull a card code out of whatever a scanner/camera yields (raw token, a
// /q/<token> URL, a full profile URL, or an older member card's ?m=<id>).
// Summer, volunteer AND member codes — the server tells them apart.
function extractToken(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/(?:SUMQR|VOLQR|MEMQR)-[A-Z0-9]+/i);
  if (m) return m[0].toUpperCase();
  const qm = s.match(/[?&]m=([^&#\s]+)/i);
  if (qm) { try { return decodeURIComponent(qm[1]).toUpperCase(); } catch (_) { return qm[1].toUpperCase(); } }
  const parts = s.replace(/[?#].*$/, "").split("/").filter(Boolean);
  return (parts[parts.length - 1] || s).toUpperCase();
}

/* ============================================================================
   THE SUMMER SCHOOL WORKSPACE — one surface, used by both doors.

   There were TWO, and they disagreed. `AdminSummer` (the coordinator portal at
   /summer-admin) offered form / gates / pending / enrol / kiosk / attendance /
   policy / QR / cards / roster. `AdminRegistration` (Control Room → People →
   Registration) offered gates / pending / centres / catalogue / import / certs.
   Two of those panels were mounted in BOTH places from the same component, and
   the rest existed in exactly one — so a coordinator could not reach the
   academy catalogue, bulk import or certificates at all, and a Control Room
   admin could not reach the roster, the kiosk or enrolment. Each door was
   missing about half the job, and which half depended on which door you came
   through.

   So there is one workspace and both doors mount it. The panel list is data,
   grouped by what a coordinator is actually doing, and a deep link names a
   panel (adminJump("summer", "roster")) rather than a tab index.

   The centre DIRECTORY is deliberately not in this list. A centre is an
   NGG-wide place whose code is the printed ID prefix on every member's card;
   it lives under People → Centres and is written with the `people` capability.
   ============================================================================ */
const SUMMER_PANELS = [
  // What the season IS.
  { id: "editions",   group: "Structure", label: "Editions & groups", render: () => <SummerEditions/> },
  { id: "catalogue",  group: "Structure", label: "Academy catalogue", render: () => <AcademyCatalogue/> },
  { id: "policy",     group: "Structure", label: "Programme & policy", render: () => <SummerPolicyMoved/> },
  // Getting children in.
  { id: "form",       group: "Intake",    label: "Intake form",       render: () => <SummerFormBuilder/> },
  { id: "gates",      group: "Intake",    label: "Sign-up links",     render: () => <SummerGates/> },
  { id: "pending",    group: "Intake",    label: "Pending sign-ups",  render: (ctx) => <SummerPending onChange={ctx.reload}/> },
  { id: "enrol",      group: "Intake",    label: "Enrol at the desk", render: (ctx) => <SummerEnroll cohort={ctx.edition} blank={ctx.qrBlank} onDone={ctx.reload}/> },
  { id: "import",     group: "Intake",    label: "Bulk import",       render: () => <SummerImport/> },
  // Running it day to day.
  { id: "roster",     group: "Running",   label: "Roster",            render: (ctx) => <SummerRoster cohortId={ctx.editionId}/> },
  { id: "kiosk",      group: "Running",   label: "Check-in kiosk",    render: (ctx) => <SummerKiosk onCheckin={ctx.reload}/> },
  { id: "attendance", group: "Running",   label: "Attendance",        render: () => <SummerAttendance/> },
  // What comes out of it.
  { id: "groupreport",group: "Records",   label: "Group report",      render: () => <SummerGroupReport/> },
  { id: "qr",         group: "Records",   label: "QR cards",          render: (ctx) => <SummerQR onChange={ctx.reload}/> },
  { id: "cards",      group: "Records",   label: "ID cards",          render: () => <SummerCardsLink/> },
  { id: "certs",      group: "Records",   label: "Certificates",      render: () => <SummerCertificates/> },
];
const SUMMER_PANEL_GROUPS = ["Structure", "Intake", "Running", "Records"];

function AdminSummer() {
  /* A deep link names a PANEL. `adminJump("summer", "roster")` has to keep
     working when a panel is added or reordered, which a tab index does not —
     and has to work when Summer School is already the open section. */
  const [tab, setTab] = useAdminTab("editions", React.useCallback(id => SUMMER_PANELS.some(p => p.id === id), []));
  const [ov, setOv] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.admin.summer.overview().then(setOv).catch(e => setErr(e.code || e.message));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <div className="admin-section"><ErrorState title="Couldn't load Summer School" code={err} onRetry={load}/></div>;
  if (!ov) return <div className="admin-section"><div className="dash-spinner"/></div>;
  const o = ov.overview, edition = o.cohort || {};
  const panel = SUMMER_PANELS.filter(p => p.id === tab)[0] || SUMMER_PANELS[0];
  const ctx = { edition, editionId: edition.cohortId, qrBlank: o.qrBlank, reload: load };

  return (
    <div className="admin-section">
      <div className="admin-section-head">
        <h2 className="admin-h2">
          Summer School
          {(edition.name || edition.cohortId) &&
            <span className="chip chip-gold" style={{ fontSize: 11, marginLeft: 10 }}>{edition.name || edition.cohortId}</span>}
        </h2>
      </div>
      <p className="admin-hint">
        One season is an <b>edition</b>; a class inside it is a <b>group</b>. Set those up first — everything else on
        this screen hangs off the live edition. Centres are managed under <b>People → Centres</b>, because an NGG
        centre is a place the whole organisation uses.
      </p>

      <div className="admin-tiles" style={{ marginBottom: 8 }}>
        <AdminTile n={o.students} l="Participants enrolled"/>
        <AdminTile n={o.presentToday} l="Present today"/>
        <AdminTile n={o.qrBlank} l="Blank QR cards"/>
        <AdminTile n={o.qrAssigned} l="Assigned cards"/>
      </div>

      {/* Grouped tabs. Fifteen panels in one flat strip is a wall; four named
          groups is a map of the job. A real tablist, so arrow keys work. */}
      <nav className="admin-panelnav" aria-label="Summer School sections">
        {SUMMER_PANEL_GROUPS.map(gname => (
          <div key={gname} className="admin-panelnav-group">
            <span className="admin-panelnav-label">{gname}</span>
            <div className="admin-anchor-tabs" role="tablist" aria-label={gname}>
              {SUMMER_PANELS.filter(p => p.group === gname).map(p => (
                <button key={p.id} role="tab" id={"sumtab-" + p.id}
                  aria-selected={tab === p.id} aria-controls="sumpanel"
                  tabIndex={tab === p.id ? 0 : -1}
                  className={"admin-anchor-tab" + (tab === p.id ? " is-active" : "")}
                  onClick={() => setTab(p.id)}>
                  {p.label}{p.id === "roster" ? " (" + fmtNum(o.students) + ")" : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div id="sumpanel" role="tabpanel" aria-labelledby={"sumtab-" + panel.id} tabIndex={-1}>
        {panel.render(ctx)}
      </div>
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
        if (f.type === "info") return <p key={i} style={{ color: "var(--ink-700)", fontSize: 14, margin: "0 0 12px" }}>{f.label}</p>;
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
/* Who owns each kind follows what it is for (GATE_KINDS in registration.php):
   the door is everybody's (`checkin`), sign-up and enrolment are Summer
   School's. Each section shows the kinds of its own scope. */
const GATE_KINDS = {
  desk: { label: "Check-in desk", chip: "chip-navy", fallback: "Check-in desk", scope: "checkin",
          blurb: "The door. Volunteers scan cards to check in participants, volunteers and NGG members. A desk password lets them run it without an admin login. It takes no sign-ups — Summer School's Registration desk and Public sign-up links do that." },
  register: { label: "Registration desk", chip: "chip-navy", fallback: "Summer registration desk", scope: "summer",
          blurb: "Staff enrol a Summer School child who is standing in front of them: details, photo, consent. Needs a desk password, so field staff run it without an admin login." },
  self: { label: "Public sign-up", chip: "chip-lime", fallback: "Public registration link", scope: "summer",
          blurb: "The link you send to families. No password — anyone with the link can fill it in, and nothing they submit becomes a registration until somebody checks it." },
  review: { label: "Review desk", chip: "chip-gold", fallback: "Review desk", scope: "summer",
            blurb: "Where public submissions get checked and approved. Its own password, deliberately different from the check-in one — approving is what emails a family." },
};

function SummerGates() { return <GateLinks scope="summer"/>; }

/* One manager for both: Control Room → Check-in desks (the door) and Summer
   School → Gate links (sign-up, review, registration desk). */
function GateLinks({ scope }) {
  const kinds = Object.keys(GATE_KINDS).filter(k => GATE_KINDS[k].scope === scope);
  const [gates, setGates] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [kind, setKind] = React.useState(kinds[0]);
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
  const revealId = React.useId();
  const load = () => NGGApi.admin.registration.gates(scope).then(r => { setGates(r.gates || []); setErr(""); }).catch(e => setErr(e.code || e.message));
  React.useEffect(() => { load(); }, []);
  const create = async (e) => {
    e && e.preventDefault();
    if (!autoPw && pw && pw.trim().length < 4) { toast.error("Desk password must be at least 4 characters."); return; }
    /* A public link with a password is a staff desk somebody shared, and a
       review desk without one lets anybody wave strangers into the programme.
       The server enforces both; saying so here saves a round trip and a
       confusing error. */
    if ((kind === "review" || kind === "register") && !autoPw && pw.trim().length < 4) {
      toast.error("This desk needs its own password — generate one or type at least 4 characters."); return;
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
      {kinds.length > 1 && <div className="admin-pick-row" role="radiogroup" aria-label="What kind of link">
        {kinds.map(k => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={"btn btn-sm " + (kind === k ? "btn-primary" : "btn-ghost")}>{GATE_KINDS[k].label}</button>
        ))}
      </div>}
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
        <div role="dialog" aria-modal="true" aria-labelledby={revealId} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,10,24,.6)", display: "grid", placeItems: "center", padding: 18 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 460, width: "100%" }}>
            <h3 id={revealId} style={{ margin: "0 0 6px", fontSize: 18 }}>Desk password for {reveal.name}</h3>
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
  const consentId = React.useId();

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={consentId} onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,10,24,.6)", display: "grid",
               placeItems: "center", padding: 18, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 560, width: "100%",
                    maxHeight: "92vh", overflowY: "auto" }}>
        <h3 id={consentId} style={{ margin: "0 0 4px", fontSize: 19 }}>
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

/* ── ID cards — deep links into the full-screen studios ───────────────────── */
function SummerCardsLink() {
  return (
    <div className="card" style={{ padding: 28, textAlign: "center", maxWidth: 560 }}>
      <h3 className="display" style={{ fontSize: 24, margin: "0 0 8px" }}>Card &amp; Design Studios</h3>
      <p style={{ color: "var(--ink-700)", margin: "0 0 18px" }}>
        Print and manage the 54×92mm ID cards in the Card Studio, or design new card
        templates, posters and batch runs in the full-screen Design Studio.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <a className="btn btn-primary" href="/cards" target="_blank" rel="noreferrer">Open the Card Studio ↗</a>
        {/* The Design Studio (/designer) renders its own full-screen chrome and
            had no nav of its own — reachable only by typing the URL. Surface it
            here, beside the print tool, so staff can actually find it. */}
        <a className="btn btn-ghost" href="/designer" target="_blank" rel="noreferrer">Open the Design Studio ↗</a>
      </div>
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
  @media print { .noprint { display: none; } }
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
  const { panelRef, close, titleProps, headingProps } = useAdminDrawer(onClose, false);
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
    <div className="admin-drawer" ref={panelRef} role="dialog" aria-modal="true" {...titleProps} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="admin-drawer-panel admin-drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3 {...headingProps}>Consent record · {name}</h3>
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
  /* Only the latest search may draw (answers can land out of order), and a
     failed read is said, with a retry: it used to become an empty roster,
     which reads as "nobody is enrolled" during an outage. */
  const [loadErr, setLoadErr] = React.useState("");
  const loadSeq = React.useRef(0);
  const load = () => {
    const n = ++loadSeq.current;
    return NGGApi.admin.summer.students(q, cohortId, facets)
      .then(r => {
        if (n !== loadSeq.current) return;
        setLoadErr("");
        setList(r.students || []);
        setMeta({ total: r.total || (r.students || []).length, matched: r.matched || 0,
                  truncated: !!r.truncated, facets: r.facets || null, applied: r.applied || {} });
      })
      .catch(e => { if (n === loadSeq.current) setLoadErr((e && (e.code || e.message)) || "load_failed"); });
  };
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
          <b>{meta.matched}</b> of {meta.total} {meta.total === 1 ? "child" : "children"} in this edition match
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
      {loadErr ? <ErrorState title="Couldn’t load the roster" message="The participants could not be read just now." code={loadErr} onRetry={load}/> :
        list === null ? <div className="dash-spinner"/> :
        rows.length === 0 ? <div className="admin-empty">{activeCount ? "No participant matches that search or filter." : "No participants enrolled yet."}</div> :
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
    if (!(await dialog.confirm({ title: "Remove this project?",
      body: "It comes off the member's profile for good.", cta: "Remove project", danger: true }))) return;
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
    if (!(await dialog.confirm({ title: "Delete this mentor note?",
      body: "The note is removed for good.", cta: "Delete note", danger: true }))) return;
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
    age: s.age != null ? String(s.age) : "", dob: s.dob || "", handle: s.handle || "", sex: s.sex || "",
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
    } catch (e) { toast.error(e.code === "bad_age" ? "Age must be 5–19." : e.code === "bad_dob" ? "That date of birth isn't a real date in the past." : e.code === "bad_email" ? "That parent email isn't valid." : e.code === "handle_taken" ? "That handle is already used." : (e.code || e.message)); }
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
          {/* Recorded by an admin. When set, the server works the age out from
              it, so the age box below follows the date rather than the other way. */}
          {fld("dob", "Date of birth", { type: "date", min: 160 })}
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
// Registration — first-class page: gate links, pending queue, centres
// ============================================================================
/* Academy catalogue editor — the faculty→courses map that drives the volunteer
 * form (instructors pick courses UNDER their chosen faculty), the student course
 * list, and the /v-status faculty/course breakdowns. Fully editable; "Reset"
 * reverts to the seeded default. */
/* The same editor serves two lists that are deliberately separate: Summer
 * School's academy catalogue (Summer School → Structure, `summer`) and the NGG
 * Club's own course list (Curriculum → Courses, `curriculum`). `source` says
 * which; nothing else differs, so the two cannot drift into editing
 * differently. */
const CATALOGUE_SOURCES = {
  summer: {
    load: () => NGGApi.admin.registration.catalogue(), save: (c) => NGGApi.admin.registration.catalogueSet(c), reset: () => NGGApi.admin.registration.catalogueReset(),
    hint: <>Summer School's academies (faculties) and the courses in each — what this season's Summer form, groups and course log offer, and the courses a volunteer can pick. The NGG Club keeps its own list under <b>Curriculum → Courses</b>; changing this one does not change the Club's.</>,
    resetTitle: "Reset to the seeded catalogue?", resetBody: "Your custom faculties and courses will be replaced by the built-in default.",
  },
  club: {
    load: () => NGGApi.admin.curriculum.courses(), save: (c) => NGGApi.admin.curriculum.coursesSet(c), reset: () => NGGApi.admin.curriculum.coursesReset(),
    hint: <>The courses the <b>NGG Club</b> teaches, by faculty — what the NGG join form offers, what lessons are filed under and what the timetable schedules. Summer School keeps its own catalogue under <b>Summer School → Structure</b>; changing this list does not change Summer's. A course with lessons or classes on the timetable stays usable even if you take it off here.</>,
    resetTitle: "Copy Summer School's catalogue over this list?", resetBody: "The Club's list will be replaced by Summer School's current catalogue. Lessons and timetable classes are not touched.",
  },
};
function AcademyCatalogue({ source = "summer" }) {
  const src = CATALOGUE_SOURCES[source] || CATALOGUE_SOURCES.summer;
  const [canEdit, setCanEdit] = React.useState(true);
  const [inUse, setInUse] = React.useState([]);
  const [rows, setRows] = React.useState(null);   // [{faculty, courses:[]}]
  const [customised, setCustomised] = React.useState(false);
  const [orig, setOrig] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [draftCourse, setDraftCourse] = React.useState({});   // facultyIndex -> input text

  const norm = (cat) => (cat || []).map(r => ({ faculty: String(r.faculty || ""), courses: (r.courses || []).map(String) }));
  const load = () => src.load()
    .then(r => { const n = norm(r.catalogue); setRows(n); setCustomised(!!r.customised); setOrig(JSON.stringify(n)); setErr(""); setCanEdit(r.canEdit !== false); setInUse(r.inUse || []); })
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
    try { const r = await src.save(clean); toast.success((source === "club" ? "Club courses saved — " : "Catalogue saved — ") + (r.faculties || clean.length) + " faculties live now."); load(); }
    catch (e) { toast.error(e.code === "catalogue_empty" ? "Add at least one faculty with one course." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!(await dialog.confirm({ title: src.resetTitle, body: src.resetBody, cta: "Reset" }))) return;
    setBusy(true);
    try { await src.reset(); toast.success(source === "club" ? "The Club's list now matches Summer School's catalogue." : "Reverted to the seeded catalogue."); load(); }
    catch (e) { toast.error(e.code || e.message); } finally { setBusy(false); }
  };

  if (err) return <ErrorState title="Couldn't load the catalogue" code={err} onRetry={load}/>;
  if (rows === null) return <div className="dash-spinner"/>;
  return (
    <div>
      <p className="admin-hint">{src.hint} {source === "summer" && (customised ? <span className="chip chip-lime">customised</span> : <span className="chip">seeded default</span>)}</p>
      {!canEdit && <p className="admin-hint" role="note">You can read this list; changing it needs the <b>Curriculum</b> permission.</p>}
      {inUse.length > 0 && (() => { const listed = new Set(rows.flatMap(r => r.courses)); const off = inUse.filter(c => !listed.has(c)); return off.length ? <p className="admin-hint" role="note">Still in use but not on this list: {off.join(", ")} — their lessons and classes keep working.</p> : null; })()}
      <div style={{ display: "grid", gap: 16 }}>
        {rows.map((r, i) => (
          <div key={i} className="admin-card" style={{ padding: 16, border: "var(--rs-border-109, 1px solid rgba(12, 20, 50, 0.12))", borderRadius: 12 }}>
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
        {customised && canEdit && <button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>{source === "club" ? "Copy Summer's catalogue" : "Reset to default"}</button>}
        {canEdit && <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : dirty ? (source === "club" ? "Save Club courses" : "Save catalogue") : "Saved"}</button>}
      </div>
    </div>
  );
}

/* `AdminRegistration` and `AdminQRCodes` used to live here.
 *
 * Both were partial duplicates of the Summer School workspace. Registration
 * mounted SummerGates and SummerPending — the same components the coordinator
 * portal mounts — beside four panels the portal could not reach, while the
 * portal had six the Control Room could not. QR codes was a section wrapper
 * around SummerQR, which the portal also had as a tab.
 *
 * There is now one workspace (see AdminSummer above) and both doors mount it,
 * so a panel exists once and is reachable from either. Deep links that named
 * the old sections resolve through ADMIN_SECTION_ALIASES.
 */

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

/* ============================================================================
   SUMMER SCHOOL — EDITIONS AND GROUPS

   Three names, one meaning each, and the screen says them out loud because the
   confusion this replaces was a vocabulary problem before it was a UI problem:

     EDITION  one season. "Summer School 2026." Exactly one is live at a time.
     GROUP    a class inside an edition. "Egbeda · Music · Morning." A place, a
              course, a lead, a capacity, its own dates. The thing a
              coordinator has always meant by "cohort".
     CENTRE   a place, owned by NGG and used by every programme. Managed under
              People → Centres, NOT here — a coordinator picks one, and cannot
              rename or delete the thing every member's ID card prefix comes
              from.

   Participants were previously one flat list per edition, filtered by centre
   and track. So there was no way to run two Music classes at one centre, no way
   to hand a named lead their register, and no per-class number to report — an
   edition's attendance was a centre-wide average and nothing smaller existed.
   ============================================================================ */

const SUMMER_STATE_META = {
  planning: { label: "Planning",  chip: "",              hint: "Being set up. Not taking anyone yet." },
  active:   { label: "Live",      chip: "chip-lime",     hint: "The season being run. Only one edition can be live." },
  closed:   { label: "Closed",    chip: "chip-gold",     hint: "Finished. Still reportable; nothing new goes in." },
  archived: { label: "Archived",  chip: "status-archived", hint: "Attendance rolled up. Set by the archive tool, not here." },
};
function SummerStateChip({ state }) {
  const m = SUMMER_STATE_META[state] || { label: state || "—", chip: "" };
  return <span className={"chip " + m.chip} title={m.hint || undefined}>{m.label}</span>;
}

/** ISO weekday numbers → the short names a human reads. Groups store
 *  "1,3,6"; nobody should have to. */
const SUMMER_DOW = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["7", "Sun"]];
function summerDaysLabel(v) {
  const set = String(v || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!set.length) return "";
  return SUMMER_DOW.filter(([n]) => set.indexOf(n) !== -1).map(([, l]) => l).join(" · ");
}

function SummerEditions() {
  const [d, setD] = React.useState(null);         // { editions, currentId, states }
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);   // {} = new
  const [openId, setOpenId] = React.useState("");       // which edition's groups are open
  const [busy, setBusy] = React.useState("");
  const { hasCap } = (typeof useAuth === "function") ? useAuth() : { hasCap: () => true };

  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.admin.summer.editions()
      .then(r => setD(r))
      .catch(e => setErr(e.code || e.message || "load_failed"));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const setState = async (ed, status) => {
    const meta = SUMMER_STATE_META[status] || {};
    const ok = await dialog.confirm({
      title: status === "active" ? ("Make " + ed.name + " the live edition?") : ("Mark " + ed.name + " " + (meta.label || status).toLowerCase() + "?"),
      body: status === "active"
        ? "Only one edition can be live. Whichever is live now becomes Closed — its records stay, and nothing is rolled up or deleted."
        : (meta.hint || ""),
      cta: status === "active" ? "Make it live" : (meta.label || "Apply"),
    });
    if (!ok) return;
    setBusy(ed.editionId);
    try {
      const r = await NGGApi.admin.summer.editionStatus(ed.editionId, status);
      toast.success(r.demoted ? (meta.label || status) + " — the previous live edition is now Closed." : (meta.label || status) + ".", ed.name);
      await load();
    } catch (e) {
      toast.error(e.code === "use_archive_op"
        ? "Archiving rolls attendance up onto each participant — do it from Records → Archive, not from here."
        : e.code === "dates_required" ? "Set this edition's start and end dates (Edit) before making it live."
        : e.code === "season_too_long" ? "This edition's season runs longer than six months — fix the end date first."
        : humanizeError(e.message, e.code), "Couldn't change the state");
    } finally { setBusy(""); }
  };

  if (err) return <ErrorState title="Couldn't load the editions" code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner"/>;
  const eds = d.editions || [];
  const canWrite = hasCap ? hasCap("summer") : true;

  return (
    <div>
      <p className="admin-hint">
        An <b>edition</b> is one season of Summer School; exactly one is live at a time. A <b>group</b> is a class
        inside an edition — a centre, a course, a lead and a capacity — and it is what a register belongs to.
        Centres themselves live under <b>People → Centres</b>, because an NGG centre is a place the whole
        organisation uses, not a Summer School record.
      </p>

      <div className="admin-section-actions" style={{ marginBottom: 14 }}>
        {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New edition</button>}
      </div>

      {eds.length === 0 ? (
        <EmptyState icon="☀" title="No editions yet"
          message="Create one for this season. Everything else — groups, participants, attendance, cards — hangs off it."
          action={canWrite ? <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New edition</button> : null}/>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Summer School editions, newest first</caption>
            <thead><tr>
              <th scope="col">Edition</th>
              <th scope="col">State</th>
              <th scope="col">Dates</th>
              <th scope="col">Applications</th>
              <th scope="col" className="admin-num">Groups</th>
              <th scope="col" className="admin-num">Participants</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {eds.map(ed => (
                <React.Fragment key={ed.editionId}>
                  <tr>
                    <td>
                      <b>{ed.name}</b>
                      <div className="mono admin-cell-sub">{ed.editionId}{ed.code ? " · " + ed.code : ""}</div>
                    </td>
                    <td><SummerStateChip state={ed.status}/></td>
                    <td className="admin-cell-sub">{ed.startDate || "—"}{ed.endDate ? " → " + ed.endDate : ""}</td>
                    <td className="admin-cell-sub">
                      {ed.applyOpensAt || ed.applyClosesAt
                        ? (ed.applyOpensAt || "—") + " → " + (ed.applyClosesAt || "—")
                        : <span title="No window set — the gate links decide">not set</span>}
                    </td>
                    <td className="admin-num">{fmtNum(ed.groups)}</td>
                    <td className="admin-num">
                      {fmtNum(ed.participants)}
                      {/* The number that says whether the grouping work has
                          been done. 300 participants and 300 ungrouped means
                          no register exists and no per-class report can mean
                          anything — so it is on the row, not buried. */}
                      {ed.ungrouped > 0 && (
                        <div className="admin-cell-sub" style={{ color: "#8a6d00" }}>
                          {fmtNum(ed.ungrouped)} not in a group
                        </div>
                      )}
                      {ed.waitlisted > 0 && <div className="admin-cell-sub">{fmtNum(ed.waitlisted)} waitlisted</div>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost btn-sm"
                        aria-expanded={openId === ed.editionId}
                        onClick={() => setOpenId(openId === ed.editionId ? "" : ed.editionId)}>
                        {openId === ed.editionId ? "Hide groups" : "Groups"}
                      </button>
                      {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(ed)}>Edit</button>}
                      {canWrite && ed.status !== "active" && ed.status !== "archived" && (
                        <button className="btn btn-ghost btn-sm" disabled={busy === ed.editionId}
                          onClick={() => setState(ed, "active")}>Make live</button>
                      )}
                      {canWrite && ed.status === "active" && (
                        <button className="btn btn-ghost btn-sm" disabled={busy === ed.editionId}
                          onClick={() => setState(ed, "closed")}>Close</button>
                      )}
                    </td>
                  </tr>
                  {openId === ed.editionId && (
                    <tr><td colSpan={7} style={{ background: "rgba(12,20,50,0.03)" }}>
                      <SummerGroups edition={ed} canWrite={canWrite} onChanged={load}/>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <SummerEditionEditor data={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}/>}
    </div>
  );
}

/* One edition's record. A drawer rather than an inline row, because six dated
   fields inside a table row is where a date lands in the wrong column. */
function SummerEditionEditor({ data, onClose, onSaved }) {
  const isNew = !data.editionId;
  const [f, setF] = React.useState({
    editionId: data.editionId || "",
    name: data.name || "", code: data.code || "",
    year: data.year ? String(data.year) : String(new Date().getFullYear()),
    status: data.status || "planning",
    startDate: data.startDate || "", endDate: data.endDate || "",
    applyOpensAt: data.applyOpensAt || "", applyClosesAt: data.applyClosesAt || "",
    notes: data.notes || "",
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const drawer = useAdminDrawer(onClose);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  /* The same rules the server enforces, said before the round trip. The server
     is still the authority — this only stops the operator finding out about an
     inverted date after a save. */
  const local = (() => {
    const y = parseInt(f.year, 10);
    if (!y || y < 2000 || y > 2200) return "Enter a four-digit year.";
    if (f.startDate && f.endDate && f.endDate < f.startDate) return "The end date is before the start date.";
    if (f.applyOpensAt && f.applyClosesAt && f.applyClosesAt < f.applyOpensAt) return "Applications close before they open.";
    return "";
  })();

  const ERRS = {
    bad_year: "Enter a four-digit year.",
    bad_date: "One of the dates isn't a real date — use the picker.",
    end_before_start: "The end date is before the start date.",
    apply_window_inverted: "Applications close before they open.",
    dates_required: "A live edition needs its season: set the start and end dates first.",
    season_too_long: "That season runs longer than six months — check the end date.",
    bad_status: "Pick a state from the list.",
    name_too_long: "That name is too long — keep it under 120 characters.",
  };

  const save = async () => {
    if (local) { setErr(local); return; }
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.admin.summer.editionSave({ ...f, year: parseInt(f.year, 10) });
      toast.success(isNew ? "Edition created." : "Edition saved.", f.name || r.editionId);
      onSaved();
    } catch (e) {
      const code = e.code || e.message;
      setErr(ERRS[code] || humanizeError(e.message, code));
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-drawer" onMouseDown={drawer.close}>
      <div className="admin-drawer-panel" role="dialog" aria-modal="true" {...drawer.titleProps}
        ref={drawer.panelRef} onMouseDown={e => e.stopPropagation()} onInput={drawer.onInput}>
        <div className="admin-drawer-head">
          <h3 {...drawer.headingProps}>{isNew ? "New edition" : f.name || "Edition"}</h3>
          <button className="admin-drawer-close" onClick={drawer.close} aria-label="Close">✕</button>
        </div>
        <div className="admin-drawer-scroll">
          <div className="admin-fields">
            <Field label="Name" value={f.name} onChange={v => set("name", v)} placeholder={"Summer School " + f.year}
              hint="What coordinators and reports call this season."/>
            <Field label="Year" type="number" value={f.year} onChange={v => set("year", v)} required
              hint={isNew ? "Sets the edition id — SUM-" + (f.year || "YYYY") + "." : "The id is fixed once created."}/>
            <Field label="Short code" value={f.code} onChange={v => set("code", v.toUpperCase())}
              placeholder={"SS" + String(f.year).slice(-2)} hint="Used as the prefix when a group has no code of its own."/>
            <FieldSelect label="State" value={f.status} onChange={v => set("status", v)}
              options={[
                { value: "planning", label: "Planning — being set up" },
                { value: "active", label: "Live — the season being run" },
                { value: "closed", label: "Closed — finished, still reportable" },
              ]}/>
            <p className="admin-hint" style={{ margin: "-4px 0 4px" }}>
              Setting this to <b>Live</b> closes whichever edition is live now. <b>Archived</b> isn't offered here:
              archiving rolls each participant's attendance onto their record and is done from the archive tool, so a
              dropdown must not be able to claim it happened.
            </p>
            <div className="admin-fields-row">
              <Field label="Starts" type="date" value={f.startDate} onChange={v => set("startDate", v)}/>
              <Field label="Ends" type="date" value={f.endDate} onChange={v => set("endDate", v)}/>
            </div>
            <div className="admin-fields-row">
              <Field label="Applications open" type="date" value={f.applyOpensAt} onChange={v => set("applyOpensAt", v)}/>
              <Field label="Applications close" type="date" value={f.applyClosesAt} onChange={v => set("applyClosesAt", v)}/>
            </div>
            <FieldTextarea label="Notes" value={f.notes} onChange={v => set("notes", v)} rows={3}/>
          </div>
          {(err || local) && <p className="admin-form-err" role="alert">{err || local}</p>}
        </div>
        <div className="admin-drawer-foot">
          <button className="btn btn-ghost btn-sm" onClick={drawer.close}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !!local}>
            {busy ? "Saving…" : isNew ? "Create edition" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Groups within one edition ─────────────────────────────────────────────
   The register-shaped unit: a place, a course, a lead, a capacity, its own
   dates. Assignment is here too, because "make a group" and "put the children
   in it" are one job and splitting them across two screens is how an edition
   ends up with twelve groups and nobody in them. */
function SummerGroups({ edition, canWrite, onChanged }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [editing, setEditing] = React.useState(null);
  const [assigning, setAssigning] = React.useState(null);   // the group being filled
  const editionId = edition.editionId;

  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.admin.summer.groups(editionId)
      .then(setD)
      .catch(e => setErr(e.code || e.message || "load_failed"));
  }, [editionId]);
  React.useEffect(() => { load(); }, [load]);

  const refresh = async () => { await load(); if (onChanged) await onChanged(); };

  const remove = async (g) => {
    /* A group with children in it cannot simply be deleted, so the question is
       asked properly the first time: where do they go? The server refuses a
       bare delete, and answering "nowhere" has to be a deliberate choice
       rather than the default the button happens to take. */
    if (g.enrolled > 0) {
      const others = (d.groups || []).filter(x => x.groupId !== g.groupId);
      const choice = await dialog.confirm({
        title: "Delete " + g.name + "?",
        body: g.enrolled + " participant" + (g.enrolled === 1 ? " is" : "s are") + " in this group. "
          + (others.length
            ? "Deleting it returns them to the edition's ungrouped list — you can then place them in another group."
            : "Deleting it returns them to the edition's ungrouped list."),
        cta: "Delete and ungroup " + g.enrolled,
        danger: true,
      });
      if (!choice) return;
      try {
        const r = await NGGApi.admin.summer.groupDelete(g.groupId, { unassign: true });
        toast.success("Group deleted · " + r.moved + " returned to the ungrouped list.", g.name);
        await refresh();
      } catch (e) { toast.error(humanizeError(e.message, e.code), "Couldn't delete the group"); }
      return;
    }
    if (!(await dialog.confirm({ title: "Delete " + g.name + "?", body: "The group is empty; nothing else changes.", cta: "Delete", danger: true }))) return;
    try { await NGGApi.admin.summer.groupDelete(g.groupId); toast.success("Group deleted.", g.name); await refresh(); }
    catch (e) { toast.error(humanizeError(e.message, e.code), "Couldn't delete the group"); }
  };

  if (err) return <ErrorState title="Couldn't load the groups" code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner"/>;
  const groups = d.groups || [];

  return (
    <div style={{ padding: "4px 0 10px" }}>
      <div className="admin-section-head" style={{ marginBottom: 10 }}>
        <h3 className="admin-h3" style={{ margin: 0 }}>
          Groups in {edition.name}
          {groups.length ? <span className="admin-count mono">{groups.length}</span> : null}
        </h3>
        <div className="admin-section-actions">
          {d.ungrouped > 0 && (
            <span className="chip chip-gold" title="Participants in this edition who are not in any group">
              {fmtNum(d.ungrouped)} ungrouped
            </span>
          )}
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New group</button>}
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon="◫" title="No groups in this edition yet"
          message={"A group is one class: a centre, a course, a lead and a capacity. "
            + (d.ungrouped ? fmtNum(d.ungrouped) + " participants are waiting to be placed in one." : "")}
          action={canWrite ? <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New group</button> : null}/>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Groups in {edition.name}</caption>
            <thead><tr>
              <th scope="col">Group</th>
              <th scope="col">Centre</th>
              <th scope="col">Course</th>
              <th scope="col">Lead</th>
              <th scope="col">Meets</th>
              <th scope="col" className="admin-num">Filled</th>
              <th scope="col">State</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.groupId}>
                  <td>
                    <b>{g.name}</b>
                    <div className="mono admin-cell-sub">{g.code}</div>
                  </td>
                  <td>
                    {g.centreName
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                          {g.centreColor && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: g.centreColor, flex: "0 0 auto" }}/>}
                          {g.centreName}
                        </span>
                      : <span className="admin-cell-sub">—</span>}
                  </td>
                  <td>{g.track || <span className="admin-cell-sub">—</span>}{g.faculty && g.faculty !== g.track ? <div className="admin-cell-sub">{g.faculty}</div> : null}</td>
                  <td>{g.leadName ? <span className="chip chip-lime">{g.leadName}</span> : <span className="admin-cell-sub">unassigned</span>}</td>
                  <td className="admin-cell-sub">{summerDaysLabel(g.meetDays) || "—"}{g.meetTime ? " · " + g.meetTime : ""}</td>
                  <td className="admin-num">
                    {g.capacity > 0
                      ? <span className={g.full ? "chip chip-crimson" : ""}>{g.enrolled}/{g.capacity}</span>
                      : <span title="No cap set">{g.enrolled} <span className="admin-cell-sub">/ ∞</span></span>}
                  </td>
                  <td><SummerStateChip state={g.status}/></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setAssigning(g)}>Participants</button>}
                    {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(g)}>Edit</button>}
                    {canWrite && <button className="btn btn-ghost btn-sm" style={{ color: "#b03535" }} onClick={() => remove(g)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <SummerGroupEditor data={editing} editionId={editionId} ctx={d}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }}/>}
      {assigning && <SummerGroupAssign group={assigning} editionId={editionId}
        onClose={() => setAssigning(null)} onDone={refresh}/>}
    </div>
  );
}

function SummerGroupEditor({ data, editionId, ctx, onClose, onSaved }) {
  const isNew = !data.groupId;
  const [f, setF] = React.useState({
    groupId: data.groupId || "", editionId,
    name: data.name || "", code: data.code || "",
    centreId: data.centreId || "", faculty: data.faculty || "", track: data.track || "",
    leadId: data.leadId || "", capacity: data.capacity ? String(data.capacity) : "",
    meetDays: String(data.meetDays || ""), meetTime: data.meetTime || "",
    startDate: data.startDate || "", endDate: data.endDate || "",
    status: data.status || "active", notes: data.notes || "",
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const drawer = useAdminDrawer(onClose);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const catalogue = ctx.catalogue || {};
  const faculties = Object.keys(catalogue);
  const courses = f.faculty && catalogue[f.faculty] ? catalogue[f.faculty] : [];
  const days = String(f.meetDays || "").split(",").map(x => x.trim()).filter(Boolean);
  const toggleDay = (n) => set("meetDays", (days.indexOf(n) !== -1 ? days.filter(x => x !== n) : days.concat([n])).sort().join(","));

  /* A suggested name, offered rather than imposed. The name is what a lead
     reads on a register, so it has to be theirs to write — but "Grouptown ·
     Music · " is the shape everyone ends up typing. */
  const suggest = () => {
    const c = (ctx.centres || []).filter(x => x.centreId === f.centreId)[0];
    const parts = [c && c.name, f.track || f.faculty].filter(Boolean);
    if (parts.length) set("name", parts.join(" · "));
  };

  const ERRS = {
    bad_name: "Give the group a name of at least two characters.",
    name_too_long: "That name is too long — keep it under 160 characters.",
    centre_not_found: "That centre no longer exists — pick another.",
    edition_not_found: "That edition no longer exists.",
    edition_immutable: "A group can't be moved to another edition — its participants, attendance and cards are keyed to this one.",
    lead_not_found: "That lead is no longer an active volunteer.",
    bad_capacity: "Capacity must be a whole number (0 means no cap).",
    bad_status: "Pick a state from the list.",
    bad_date: "One of the dates isn't a real date — use the picker.",
    end_before_start: "The end date is before the start date.",
    capacity_below_enrolled: "There are already more participants in this group than that.",
  };

  const local = (f.name || "").trim().length < 2 ? "Give the group a name of at least two characters."
    : (f.startDate && f.endDate && f.endDate < f.startDate) ? "The end date is before the start date." : "";

  const save = async () => {
    if (local) { setErr(local); return; }
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.admin.summer.groupSave({ ...f, capacity: f.capacity === "" ? 0 : parseInt(f.capacity, 10) || 0 });
      toast.success(isNew ? "Group created · " + r.code : "Group saved.", f.name);
      onSaved();
    } catch (e) {
      const code = e.code || e.message;
      setErr((ERRS[code] || humanizeError(e.message, code))
        + (code === "capacity_below_enrolled" && e.data && e.data.enrolled ? " (" + e.data.enrolled + " in the room)" : ""));
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-drawer" onMouseDown={drawer.close}>
      <div className="admin-drawer-panel" role="dialog" aria-modal="true" {...drawer.titleProps}
        ref={drawer.panelRef} onMouseDown={e => e.stopPropagation()} onInput={drawer.onInput}>
        <div className="admin-drawer-head">
          <h3 {...drawer.headingProps}>{isNew ? "New group" : f.name || "Group"}</h3>
          <button className="admin-drawer-close" onClick={drawer.close} aria-label="Close">✕</button>
        </div>
        <div className="admin-drawer-scroll">
          <div className="admin-fields">
            <FieldSelect label="Centre" value={f.centreId} onChange={v => set("centreId", v)}
              options={[{ value: "", label: "— no centre —" }].concat((ctx.centres || []).map(c => ({ value: c.centreId, label: c.name + " (" + c.code + ")" })))}/>
            <FieldSelect label="Academy" value={f.faculty} onChange={v => { set("faculty", v); set("track", ""); }}
              options={[{ value: "", label: "— any —" }].concat(faculties.map(x => ({ value: x, label: x })))}/>
            <FieldSelect label="Course" value={f.track} onChange={v => set("track", v)}
              options={[{ value: "", label: f.faculty ? "— any course in " + f.faculty + " —" : "— pick an academy first —" }]
                .concat(courses.map(x => ({ value: x, label: x })))}/>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Field label="Group name" value={f.name} onChange={v => set("name", v)} required
                  placeholder="Egbeda · Music · Morning" hint="What the lead sees on their register."/>
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={suggest}
                disabled={!f.centreId && !f.track}>Suggest</button>
            </div>
            <Field label="Code" value={f.code} onChange={v => set("code", v.toUpperCase())}
              placeholder="auto" hint="Unique inside this edition. Left blank, it's built from the centre and course."/>
            <FieldSelect label="Lead" value={f.leadId} onChange={v => set("leadId", v)}
              options={[{ value: "", label: "— unassigned —" }].concat((ctx.leadOptions || []).map(v => ({ value: v.volunteerId, label: v.name + (v.role ? " · " + v.role : "") })))}/>
            <Field label="Capacity" type="number" value={f.capacity} onChange={v => set("capacity", v)}
              placeholder="0" hint="0 means no cap. A full group refuses further assignment rather than warning about it."/>

            <fieldset className="admin-fieldset">
              <legend className="admin-legend">Meets on</legend>
              <div className="admin-daypick">
                {SUMMER_DOW.map(([n, lbl]) => (
                  <label key={n} className={"admin-daypick-day" + (days.indexOf(n) !== -1 ? " is-on" : "")}>
                    <input type="checkbox" checked={days.indexOf(n) !== -1} onChange={() => toggleDay(n)}/>
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
              <p className="admin-hint" style={{ margin: "6px 0 0" }}>
                Operational only — the public centre pages deliberately never publish when children are in a building.
              </p>
            </fieldset>
            <Field label="Time" value={f.meetTime} onChange={v => set("meetTime", v)} placeholder="09:00 – 12:00"/>
            <div className="admin-fields-row">
              <Field label="Starts" type="date" value={f.startDate} onChange={v => set("startDate", v)}
                hint="Blank = the edition's dates."/>
              <Field label="Ends" type="date" value={f.endDate} onChange={v => set("endDate", v)}/>
            </div>
            <FieldSelect label="State" value={f.status} onChange={v => set("status", v)}
              options={[
                { value: "planning", label: "Planning — not taking anyone yet" },
                { value: "active", label: "Active — running" },
                { value: "closed", label: "Closed — finished" },
                { value: "archived", label: "Archived" },
              ]}/>
            <FieldTextarea label="Notes" value={f.notes} onChange={v => set("notes", v)} rows={3}/>
          </div>
          {(err || local) && <p className="admin-form-err" role="alert">{err || local}</p>}
        </div>
        <div className="admin-drawer-foot">
          <button className="btn btn-ghost btn-sm" onClick={drawer.close}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !!local}>
            {busy ? "Saving…" : isNew ? "Create group" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Filling a group.
 *
 * Two lists, one action: who is in it, and who in this edition is not in any
 * group. Assignment is bulk and PARTIAL — a coordinator selecting forty
 * children for a group with twelve seats gets twelve placed and the
 * twenty-eight named, because the alternative is either a refusal that wastes
 * the work or a group crammed past a cap somebody set for a reason. */
function SummerGroupAssign({ group, editionId, onClose, onDone }) {
  const [pool, setPool] = React.useState(null);      // ungrouped participants
  const [mine, setMine] = React.useState(null);      // participants in this group
  const [q, setQ] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const drawer = useAdminDrawer(onClose, false);

  const load = React.useCallback(() => {
    setErr("");
    /* The roster op is the one place that knows how to filter participants, so
       both lists come from it rather than from a second query that would drift.
       `group` is a client-side split of the same edition read. */
    return NGGApi.admin.summer.students("", editionId, { limit: 1000 })
      .then(r => {
        const rows = r.students || [];
        setMine(rows.filter(s => String(s.groupId || "") === group.groupId));
        setPool(rows.filter(s => !String(s.groupId || "") && String(s.status || "active") === "active"));
      })
      .catch(e => setErr(e.code || e.message || "load_failed"));
  }, [editionId, group.groupId]);
  React.useEffect(() => { load(); }, [load]);

  const poolRows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = pool || [];
    if (!needle) return rows;
    return rows.filter(s => (s.fullName || "").toLowerCase().indexOf(needle) !== -1
      || (s.displayId || "").toLowerCase().indexOf(needle) !== -1
      || (s.centre || "").toLowerCase().indexOf(needle) !== -1);
  }, [pool, q]);

  const sel = useAdminSelection(poolRows, s => s.studentId);
  const selMine = useAdminSelection(mine || [], s => s.studentId);

  const seatsLeft = group.capacity > 0 ? Math.max(0, group.capacity - ((mine || []).length)) : null;

  const assign = async () => {
    const ids = sel.ids;
    if (!ids.length) return;
    const over = seatsLeft !== null && ids.length > seatsLeft;
    const ok = await dialog.confirm({
      title: "Add " + ids.length + " to " + group.name + "?",
      body: over
        ? "This group has " + seatsLeft + " seat" + (seatsLeft === 1 ? "" : "s") + " left. "
          + seatsLeft + " will be placed and the rest left in the ungrouped list — they aren't lost, and you'll be told who."
        : "They're placed in this group. Nothing else about their record changes.",
      cta: "Add " + ids.length,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.summer.groupAssign(group.groupId, ids);
      const failed = (r.results || []).filter(x => x && x.ok === false);
      if (failed.length && r.assigned) {
        toast.warn(r.assigned + " placed · " + failed.length + " not (" + adminFailSummary(failed.map(x => ({ ok: false, error: x.error }))) + ").", group.name);
      } else if (failed.length) {
        toast.error("Nobody was placed — " + adminFailSummary(failed.map(x => ({ ok: false, error: x.error }))) + ".", group.name);
      } else {
        toast.success(r.assigned + " placed in " + group.name + ".");
      }
      sel.clear();
      await load();
      if (onDone) await onDone();
    } catch (e) { toast.error(humanizeError(e.message, e.code), "Couldn't assign"); }
    finally { setBusy(false); }
  };

  const removeFromGroup = async () => {
    const ids = selMine.ids;
    if (!ids.length) return;
    if (!(await dialog.confirm({
      title: "Take " + ids.length + " out of " + group.name + "?",
      body: "They return to this edition's ungrouped list. Their records, attendance and cards are untouched.",
      cta: "Remove " + ids.length,
    }))) return;
    setBusy(true);
    try {
      const r = await NGGApi.admin.summer.groupAssign("", ids);
      toast.success(r.assigned + " returned to the ungrouped list.", group.name);
      selMine.clear();
      await load();
      if (onDone) await onDone();
    } catch (e) { toast.error(humanizeError(e.message, e.code), "Couldn't remove"); }
    finally { setBusy(false); }
  };

  const row = (s, selection) => (
    <tr key={s.studentId}>
      <td style={{ width: 34 }}><AdminRowCheck selection={selection} id={s.studentId} label={"Select " + (s.fullName || s.studentId)}/></td>
      <td><b>{s.fullName}</b><div className="mono admin-cell-sub">{s.displayId || s.studentId}</div></td>
      <td className="admin-cell-sub">{s.centre || "—"}</td>
      <td className="admin-cell-sub">{s.track || "—"}</td>
    </tr>
  );

  return (
    <div className="admin-drawer" onMouseDown={drawer.close}>
      <div className="admin-drawer-panel admin-drawer-wide" role="dialog" aria-modal="true" {...drawer.titleProps}
        ref={drawer.panelRef} onMouseDown={e => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3 {...drawer.headingProps}>Participants · {group.name}</h3>
          <button className="admin-drawer-close" onClick={drawer.close} aria-label="Close">✕</button>
        </div>
        <div className="admin-drawer-scroll">
          {err ? <ErrorState title="Couldn't load the participants" code={err} onRetry={load}/> :
           (pool === null || mine === null) ? <div className="dash-spinner"/> : (
            <>
              <p className="admin-hint">
                {group.capacity > 0
                  ? <>This group holds <b>{group.capacity}</b> — {(mine || []).length} in, <b>{seatsLeft}</b> seat{seatsLeft === 1 ? "" : "s"} left.</>
                  : <>No cap set on this group.</>}
                {" "}A full group refuses further assignment; nobody is quietly squeezed in.
              </p>

              <h4 className="admin-h4">In this group <span className="admin-count mono">{(mine || []).length}</span></h4>
              {(mine || []).length === 0
                ? <div className="admin-empty">Nobody yet — add them from the list below.</div>
                : <>
                    <AdminBulkBar selection={selMine} noun="participant"
                      actions={[{ id: "ungroup", label: "Remove from group", danger: true, confirm: false,
                        run: () => removeFromGroup() }]}/>
                    <div className="admin-table-wrap"><table className="admin-table">
                      <caption className="sr-only">Participants currently in {group.name}</caption>
                      <thead><tr>
                        <th scope="col" style={{ width: 34 }}><AdminSelectAll selection={selMine} label="Select all in this group"/></th>
                        <th scope="col">Participant</th><th scope="col">Centre</th><th scope="col">Course</th>
                      </tr></thead>
                      <tbody>{(mine || []).map(s => row(s, selMine))}</tbody>
                    </table></div>
                  </>}

              <h4 className="admin-h4" style={{ marginTop: 22 }}>
                Not in any group <span className="admin-count mono">{(pool || []).length}</span>
              </h4>
              <div className="admin-filters" style={{ marginBottom: 10 }}>
                <input className="admin-input" value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Search name, ID or centre…" aria-label="Search the ungrouped participants"/>
              </div>
              {(pool || []).length === 0
                ? <div className="admin-empty">Everybody in this edition is in a group.</div>
                : poolRows.length === 0
                ? <div className="admin-empty">Nobody matches “{q}”.</div>
                : <>
                    <div className="admin-bulkbar" role="region" aria-label="Add the selected participants">
                      <AdminSelectAll selection={sel} label="Select all shown"/>
                      <div className="admin-bulk-actions">
                        <button className="btn btn-primary btn-sm" disabled={!sel.size || busy} onClick={assign}>
                          {busy ? "Adding…" : sel.size ? "Add " + sel.size + " to this group" : "Add to this group"}
                        </button>
                        {sel.size > 0 && <button className="btn btn-ghost btn-sm" onClick={sel.clear}>Clear</button>}
                      </div>
                    </div>
                    <div className="admin-table-wrap"><table className="admin-table">
                      <caption className="sr-only">Participants in this edition who are not in any group</caption>
                      <thead><tr>
                        <th scope="col" style={{ width: 34 }}><span className="sr-only">Select</span></th>
                        <th scope="col">Participant</th><th scope="col">Centre</th><th scope="col">Course</th>
                      </tr></thead>
                      <tbody>{poolRows.map(s => row(s, sel))}</tbody>
                    </table></div>
                  </>}
            </>
          )}
        </div>
        <div className="admin-drawer-foot">
          <button className="btn btn-ghost btn-sm" onClick={drawer.close}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* Per-group reporting for one edition — the number a lead is accountable for.
   Attendance is measured over the group's own dates when it has them, so a
   group that ran for two of six weeks is not scored against six. A group that
   has not met reports a dash, never 0%. */
function SummerGroupReport() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [editions, setEditions] = React.useState([]);
  const [editionId, setEditionId] = React.useState("");

  React.useEffect(() => {
    NGGApi.admin.summer.editions()
      .then(r => { setEditions(r.editions || []); setEditionId(prev => prev || r.currentId || ""); })
      .catch(e => setErr(e.code || e.message));
  }, []);
  const load = React.useCallback(() => {
    if (!editionId) return Promise.resolve();
    setErr(""); setD(null);
    return NGGApi.admin.summer.groupReport(editionId).then(setD).catch(e => setErr(e.code || e.message));
  }, [editionId]);
  React.useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    if (!d) return;
    downloadCsv("summer-groups-" + editionId, (d.groups || []).map(g => ({
      code: g.code, group: g.name, centre: g.centreName, academy: g.faculty, course: g.track,
      lead: g.leadName, capacity: g.capacity, enrolled: g.enrolled,
      sessions: g.sessions, present: g.present, expected: g.expected,
      attendanceRate: g.attendanceRate === null ? "" : g.attendanceRate,
      from: g.from, to: g.to, status: g.status,
    })));
  };

  if (err) return <ErrorState title="Couldn't load the report" code={err} onRetry={load}/>;
  return (
    <div>
      <p className="admin-hint">
        One row per group: how full it is, how many sessions it has actually held, and the attendance rate over
        <b> its own</b> dates. A group that has not met yet shows a dash rather than 0% — a class that has not
        started is not a class that is failing.
      </p>
      <div className="admin-filters" style={{ alignItems: "center" }}>
        <label className="sr-only" htmlFor="sgr-edition">Edition</label>
        <select id="sgr-edition" className="admin-select" value={editionId} onChange={e => setEditionId(e.target.value)}>
          {editions.map(e => <option key={e.editionId} value={e.editionId}>{e.name} · {SUMMER_STATE_META[e.status] ? SUMMER_STATE_META[e.status].label : e.status}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!d || !(d.groups || []).length}>Export CSV</button>
      </div>
      {!d ? <div className="dash-spinner"/> :
        (d.groups || []).length === 0
          ? <EmptyState icon="◫" title="No groups in this edition" message="Create groups under Structure → Editions & groups first."/>
          : <div className="admin-table-wrap"><table className="admin-table">
              <caption className="sr-only">Per-group report for {d.edition && d.edition.name}</caption>
              <thead><tr>
                <th scope="col">Group</th><th scope="col">Centre</th><th scope="col">Lead</th>
                <th scope="col" className="admin-num">Filled</th>
                <th scope="col" className="admin-num">Sessions</th>
                <th scope="col" className="admin-num">Attendance</th>
                <th scope="col">Window</th>
              </tr></thead>
              <tbody>
                {(d.groups || []).map(g => (
                  <tr key={g.groupId}>
                    <td><b>{g.name}</b><div className="mono admin-cell-sub">{g.code}{g.track ? " · " + g.track : ""}</div></td>
                    <td>{g.centreName || <span className="admin-cell-sub">—</span>}</td>
                    <td>{g.leadName || <span className="admin-cell-sub">unassigned</span>}</td>
                    <td className="admin-num">{g.capacity > 0 ? g.enrolled + "/" + g.capacity : g.enrolled}</td>
                    <td className="admin-num">{g.sessions}</td>
                    <td className="admin-num">
                      {g.attendanceRate === null
                        ? <span className="admin-cell-sub" title="This group has not met yet">—</span>
                        : <span className={g.attendanceRate < 60 ? "chip chip-crimson" : ""}>{g.attendanceRate}%</span>}
                    </td>
                    <td className="admin-cell-sub">{g.from || "—"}{g.to ? " → " + g.to : ""}</td>
                  </tr>
                ))}
                {d.ungrouped > 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: "#8a6d00" }}>
                      {fmtNum(d.ungrouped)} participant{d.ungrouped === 1 ? "" : "s"} in this edition are not in any group,
                      so they appear in no row above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table></div>}
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
/* Centre names for a picker. With a programme ("ngg" | "summer"), only the open
   centres that programme runs: a member is never posted to a Summer School
   venue, and a retired centre is never offered. Without one, every name (for
   filters over records that may name an old centre). */
function useCentreOptions(programme) {
  const pick = rows => (rows || []).filter(c => !programme || ((c.status || "active") === "active"
    && (!c.programmes || String(c.programmes).split(",").map(x => x.trim()).includes(programme)))).map(c => c.name).filter(Boolean);
  const [names, setNames] = React.useState(_centreOptCache ? pick(_centreOptCache) : []);
  React.useEffect(() => {
    let live = true;
    if (_centreOptCache) { setNames(pick(_centreOptCache)); return; }
    NGGApi.admin.registration.centres().then(r => { _centreOptCache = r.centres || []; if (live) setNames(pick(_centreOptCache)); }).catch(() => {});
    return () => { live = false; };
  }, [programme]);
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

/* fmtDate and fmtTime used to be declared here, formatting to en-GB by hand.
   They are in components.jsx now, with the rest of them, because the bundle is
   a plain concatenation into ONE scope: two files declaring `function fmtDate`
   is not two functions, it is the later file silently replacing the earlier
   one for the whole app. The build test fails on a duplicate top-level name
   now, which is how this was found.

   The old local fmtTime returned a DATE AND a time ("22/08/2026, 14:30"), so
   its three callers say fmtDateTime rather than fmtTime, which is time alone. */

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
  /* Arrivals or sign-outs. A mode, not a second scan, so a card presented
     twice by accident never signs anybody out. Read through a ref so the
     camera loop does not restart when it flips. */
  const [dir, setDir] = React.useState("in");
  const dirRef = React.useRef("in");
  React.useEffect(() => { dirRef.current = dir; setResult(null); }, [dir]);

  const doCheckout = React.useCallback(async (token, earlyReason) => {
    const now = Date.now();
    try {
      const r = await NGGApi.admin.summer.checkout(token, earlyReason ? { earlyReason } : undefined);
      setResult({ student: r.student, out: true, already: r.already, early: !!earlyReason });
      buzz(false);
      setRecent(x => [{ name: (r.student && r.student.fullName) || token, at: now, already: r.already, out: true }, ...x].slice(0, 8));
      onCheckin && onCheckin();
    } catch (e) {
      const code = e.code || e.message || "";
      const d = e.data || {};
      if (code === "too_early") {
        setResult({ tooEarly: true, token, closesAt: d.closesAt, student: d.student }); buzz(true);
      } else {
        const map = { not_checked_in: "They were never checked in today — nothing to sign out.", qr_unassigned: "That card isn't linked to anyone yet.",
          student_not_found: "Nobody found for that code.", forbidden: "Not permitted — your session expired." };
        setResult({ error: map[code] || code }); buzz(true);
      }
    }
  }, [onCheckin]);
  const letGoEarly = async (token) => {
    const reason = await dialog.prompt({ title: "Let them go before closing time?", label: "Why (recorded in the audit trail)",
      placeholder: "e.g. Unwell — collected by mother", cta: "Sign out early", multiline: false });
    if (reason && reason.trim()) doCheckout(token, reason.trim());
  };

  const doCheckin = React.useCallback(async (raw, method) => {
    const token = extractToken(raw);
    if (!token || token.length < 4) return;
    const now = Date.now();
    if (last.current.token === token && now - last.current.at < 3500) return; // debounce repeat scans
    last.current = { token, at: now };
    if (dirRef.current === "out") return doCheckout(token);
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
        const map = { qr_unassigned: "That card isn't linked to anyone yet.", student_not_found: "Nobody found for that code.",
          edition_ended: "Their season has ended" + (e.data && e.data.endDate ? " (" + e.data.endDate + ")" : "") + " — not checked in.",
          edition_not_started: "Their season hasn't started" + (e.data && e.data.startDate ? " (starts " + e.data.startDate + ")" : "") + " — not checked in.",
          card_void: "That member card was replaced — ask for the new one, or type the member ID.",
          member_inactive: (e.data && e.data.message) || "That membership is not active.",
          forbidden: "Not permitted — your session expired, or a member's check-in needs the Club permission." };
        setResult({ error: map[code] || code }); buzz(true);
      }
    }
  }, [device, onCheckin, doCheckout]);

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
        <div className="summer-kiosk-modes" role="group" aria-label="Arrivals or sign-outs">
          <button className={"btn btn-sm " + (dir === "in" ? "btn-primary" : "btn-ghost")} aria-pressed={dir === "in"} onClick={() => setDir("in")}>Arrivals</button>
          <button className={"btn btn-sm " + (dir === "out" ? "btn-primary" : "btn-ghost")} aria-pressed={dir === "out"} onClick={() => setDir("out")}>Sign-outs</button>
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
              {camErr && <div role="alert" className="summer-cam-err">{camErr}</div>}
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
          {result && result.student && !result.refused && !result.tooEarly && (
            <div className={"summer-result " + (result.already ? "dupe" : result.status === "late" ? "late" : "ok")}>
              <div className="summer-result-av">{result.student.photoUrl ? <img src={result.student.photoUrl} alt=""/> : (result.student.fullName || "?").charAt(0)}</div>
              <div className="summer-result-nm">{result.student.fullName}</div>
              <div className="summer-result-msg">{result.out ? (result.already ? "Already signed out today" : result.early ? "Signed out early — reason recorded" : "Signed out →") : result.already ? "Already checked in today" : "Checked in ✓"}</div>
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
          {result && result.tooEarly && (
            <div className="summer-result err">
              <div className="summer-result-nm">{(result.student && result.student.fullName) || "Too early to sign out"}</div>
              <div className="summer-result-msg">Sign-out opens at {result.closesAt || "closing time"}. Not signed out.</div>
              <button className="btn btn-ghost btn-sm" onClick={() => letGoEarly(result.token)}>Let them go early…</button>
            </div>
          )}
          {result && result.error && <div className="summer-result err"><div className="summer-result-nm">{dir === "out" ? "Couldn't sign out" : "Couldn't check in"}</div><div className="summer-result-msg">{result.error}</div></div>}
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

/* ── A person's compliance state, as a chip (the kiosk and attendance use it) ── */
const STATE_CHIP = {
  clear:     { label: "Clear",     cls: "status-published" },
  warned:    { label: "Warned",    cls: "status-draft" },
  dormant:   { label: "Dormant",   cls: "status-draft" },
  suspended: { label: "Suspended", cls: "status-archived" },
  evicted:   { label: "Evicted",   cls: "status-archived" },
};
/* A shared global: page-admin.jsx's v1 fees screen formats naira with it too. */
const naira = (n) => fmtMoney(n);

function PolicyStateChip({ state }) {
  const s = STATE_CHIP[state] || STATE_CHIP.clear;
  return <span className={"chip " + s.cls} style={state === "evicted" ? { background: "var(--coral)", color: "#fff" } : undefined}>{s.label}</span>;
}

/* The programme calendars, the policy thresholds and the compliance board
   used to be drawn here as one long v1 screen (SummerPolicy), mounted into
   both this workspace and Money › Conduct & fines. They now have one home,
   rebuilt in the Control Room's own blocks (cr-tab-conduct.jsx), with the
   fine rules and the fines upload beside them. This panel stays — it is in
   bookmarks and in adminJump("summer", "policy") links — and sends the
   coordinator to the place each part now lives. */
function SummerPolicyMoved() {
  const go = sub => adminJump("conduct", sub);
  return (
    <div className="card" style={{ padding: 28, maxWidth: 620 }}>
      <h3 className="display" style={{ fontSize: 22, margin: "0 0 8px" }}>Programme days and policy have moved</h3>
      <p style={{ color: "var(--ink-700)", margin: "0 0 18px" }}>
        They are now in Money › Conduct &amp; fines, beside the fine rules: the calendars that decide which days count,
        the thresholds that decide what a missed one costs, and the compliance board.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={() => go("calendar")}>Open the calendars</button>
        <button type="button" className="btn btn-ghost" onClick={() => go("policy")}>Open the policy</button>
        <button type="button" className="btn btn-ghost" onClick={() => go("compliance")}>Open the compliance board</button>
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
              <th className="admin-num">Days in<span className="att-th-sub">of their own open days</span></th>
              <th className="admin-num">Rate<span className="att-th-sub">{win.ranged ? "in this range" : "since they joined"}</span></th>
              <th className="admin-num">On time</th><th className="admin-num">Streak</th>
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
                <td className="mono admin-num">{r.present}/{r.expected}{r.joined ? <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>from {r.joined}</div> : null}</td>
                <td style={{ minWidth: 120 }}>{r.rate == null ? <span className="mono" style={{ color: "var(--ink-500)" }}>no days yet</span>
                  : <div className="summer-rate"><div className="summer-rate-bar"><div className="summer-rate-fill" style={{ width: Math.min(100, r.rate) + "%", background: r.rate < 50 ? "var(--coral)" : r.rate < 80 ? "var(--gold-500)" : "var(--lime-ink, #6e9c1d)" }}/></div><span className="mono admin-num">{r.rate}%</span></div>}</td>
                <td className="mono admin-num" style={{ color: (r.onTimePct != null && r.onTimePct < 80) ? "var(--gold-700,#7a5600)" : undefined }}>{r.onTimePct == null ? "—" : r.onTimePct + "%"}</td>
                <td className="mono admin-num">{r.streak ? r.streak : "—"}</td>
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
        <div className="admin-empty">{(a.rosterTotal || 0) > 0 ? "No child matches that filter." : "Nobody is enrolled in this edition yet."}</div>
      ) : (
      <div className="admin-table-wrap" style={{ marginTop: 8 }}><table className="admin-table att-table">
        {/* The headers carry their own units. "Present" and "Rate" against an
            unstated span is what made this table hard to read: the reader had to
            hold the window in their head to know what 62% was 62% of. */}
        <thead><tr>
          <th>Child</th><th>Track</th>
          <th className="admin-num">Days in<span className="att-th-sub">of {a.sessionDays} open</span></th>
          <th className="admin-num">Rate<span className="att-th-sub">{win.ranged ? "in this range" : "this term"}</span></th>
          <th className="admin-num">Late</th><th>Standing</th>
          <th>Pattern<span className="att-th-sub">oldest → newest</span></th>
          <th>Last seen</th><th>Today</th>
        </tr></thead>
        <tbody>{roster.map(r => (
          <tr key={r.studentId} data-risk={r.rate < 50 ? "1" : ""}>
            <td>{r.fullName}<div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.studentId}{r.centre ? " · " + r.centre : ""}</div></td>
            <td>{r.track || "—"}</td>
            {/* A child who has never once appeared is a different problem from
                one attending badly, and 0/10 read the same as 3/10 at a glance. */}
            <td className="mono admin-num">{(r.present || 0) === 0
              ? <b style={{ color: "var(--coral)" }}>never</b>
              : <>{r.present}<span style={{ color: "var(--ink-500)" }}>/{a.sessionDays}</span></>}
              {r.halfDays ? <span title={r.halfDays + " half-day(s) — missed the Musing Period"} style={{ color: "var(--ink-500)" }}> ·{r.halfDays}½</span> : null}</td>
            <td style={{ minWidth: 120 }}><div className="summer-rate"><div className="summer-rate-bar"><div className="summer-rate-fill" style={{ width: Math.min(100, r.rate) + "%", background: r.rate < 50 ? "var(--coral)" : r.rate < 80 ? "var(--gold-500)" : "var(--lime-ink, #6e9c1d)" }}/></div><span className="mono admin-num">{r.rate}%</span></div></td>
            <td className="mono admin-num">{r.lates ? r.lates : "—"}</td>
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
          <div className="admin-hint" style={{ margin: 0 }}>Archive the edition when summer ends. Compressing rolls each participant's attendance into a summary (kept for NGG Club promotion) and clears the individual check-ins.</div>
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
              {err && <div role="alert" className="signin-err">{err}</div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !identifier.trim() || !password}>{busy ? "Signing in…" : "Sign in →"}</button>
              <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("enter-id"); }}>Email me a sign-in code instead</button>
            </form>
          )}
          {stage === "enter-id" && (
            <form onSubmit={requestCode}>
              <input className="signin-input" type="text" autoComplete="username" placeholder="NGG-2025-0042  or  you@email.com"
                value={identifier} onChange={e => setIdentifier(e.target.value)} required minLength={3} autoFocus/>
              {err && <div role="alert" className="signin-err">{err}</div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !identifier.trim()}>{busy ? "Sending…" : "Send me a code →"}</button>
              <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("password"); }}>← Back to password</button>
            </form>
          )}
          {stage === "enter-otp" && (
            <form onSubmit={verifyOtp}>
              <input className="signin-input signin-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                pattern="[0-9 ]*" placeholder="••• •••" value={otp} onChange={e => setOtp(e.target.value.replace(/[^\d ]/g, ""))} required autoFocus/>
              {err && <div role="alert" className="signin-err">{err}</div>}
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
function PortalGate({ cap, brand, setPage, children, bare }) {
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
  /* A portal that draws its own shell (the Club portal v3) gets the gate and
     nothing else: a second header above its own would be two of everything. */
  if (bare) return typeof children === "function" ? children({ member, signOut }) : children;

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
          <span className="mono" style={{ color: "rgba(255,255,255,0.72)" }}>{member.fullName} · {member.role}</span>
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
  /* The Summer School portal v3 (src/modules/summer3/). The older AdminSummer
     panels stay in the Control Room, which is where the season's settings,
     gates and imports are administered. */
  return <PortalGate cap="summer" setPage={setPage} bare
    brand={{ key: "summer", label: "Summer School", eyebrow: "SUMMER SCHOOL · STAFF PORTAL", icon: "☀" }}>
    {({ signOut }) => <Ss3Portal setPage={setPage} signOut={signOut}/>}
  </PortalGate>;
}

/* /club-admin is the Club portal v3 (src/modules/club3/). It replaced the
   two-tab ClubManager / ClubPromote / ClubRoster screen, removed since. */
function ClubAdminPortal({ setPage }) {
  return <PortalGate cap="club" setPage={setPage} bare
    brand={{ key: "club", label: "NGG Club", eyebrow: "NGG CLUB · STAFF PORTAL", icon: "◈" }}>
    {({ signOut }) => <Cp3Portal setPage={setPage} signOut={signOut}/>}
  </PortalGate>;
}

Object.assign(window, { SummerAdminPortal, ClubAdminPortal, SummerGates,
  // Exported for tests/admin-table.test.js: a sortable header is a control
  // with keyboard, focus, target-size and aria-sort obligations, and none of
  // those can be asserted by rendering the whole admin shell.
  SortTh, Pager });
