/* ================================================================
   NGG — Family account (/family).

   A parent's or guardian's own sign-in, holding the NGG members they look
   after. Its own cookie and its own API (api/family/*): a family session is
   never a member session, and nothing here reads one. The Anchor Circle
   (/circle) stays as the one-child, no-account window; this is the account.

   What a parent sees is read from the same functions as the member's own
   dashboard, server-side; what they can DO is tell the desk something
   (an absence, an appeal, a lost card). Every family email (check-ins, the weekly summary, alerts) is always on.
   ================================================================ */

const FAMILY_ERRORS = {
  bad_email: "That doesn't look like an email address.",
  invalid: "That code isn't right. Check the latest email and try again.",
  expired: "That code has expired. Ask for a new one.",
  already_used: "That link has already been used. Ask for a new one.",
  too_many_attempts: "Too many tries. Wait fifteen minutes, or ask for a new code.",
  suspended: "This family account is suspended. Contact the centre.",
  not_found: "That code and name don't match an NGG member. Check both with your child.",
  already_linked: "You're already connected to this member.",
  too_many_wards: "A family account holds up to eight members.",
  not_ngg_member: "That code belongs to someone who isn't an NGG member.",
  member_inactive: "That membership isn't active. Contact the centre.",
  bad_phone: "That phone number doesn't look right.",
  unknown_kind: "That kind of request can't be raised here.",
  unauthorized: "You've been signed out. Sign in again.",
};
function familyErr(e) {
  const c = e && (e.code || e.message);
  return FAMILY_ERRORS[c] || (e && e.detail) || humanizeError(e && e.message, c);
}

const FAMILY_RATING = {
  on_track: { label: "On track", cls: "is-good" },
  watch:    { label: "Worth watching", cls: "is-warn" },
  at_risk:  { label: "Needs support", cls: "is-bad" },
};
const FAMILY_NOTIFY_LABELS = [
  ["checkin", "Sign-in and sign-out", "An email each time they sign in or out at the centre."],
  ["weekly",  "Weekly summary",        "Every Monday: attendance, lateness, fines and lessons for the week."],
  ["alerts",  "Fines and alerts",      "An email when a fine is issued."],
];
const FAMILY_REQUEST_STATUS = { open: "Waiting", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn" };
const FAMILY_STATE_LABEL = { good: "In good standing", warning: "Warning", dormant: "Dormant", suspended: "Suspended", evicted: "Removed" };

function FamilyPage({ setPage }) {
  const [me, setMe] = React.useState(undefined);   // undefined = loading, null = signed out
  const [err, setErr] = React.useState("");
  const [linkErr, setLinkErr] = React.useState("");
  // The family PIN still owed by this sign-in (domain/mfa.php), or ''.
  const [mfaPending, setMfaPending] = React.useState("");

  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.family.me()
      .then(d => { setMfaPending((d && d.mfaPending) || ""); setMe(d && d.guardian ? d : null); })
      .catch(e => { setErr(familyErr(e)); setMe(null); });
  }, []);

  React.useEffect(() => {
    // Arrived from the sign-in email: spend the link, then strip it from the
    // address bar so a refresh or a shared screenshot cannot replay it.
    let token = "";
    try { token = new URL(window.location.href).searchParams.get("fsignin") || ""; } catch (_) {}
    if (token) {
      try { const u = new URL(window.location.href); u.searchParams.delete("fsignin"); window.history.replaceState({}, "", u.toString()); } catch (_) {}
      NGGApi.family.verify({ token, remember: true }).catch(e => setLinkErr(familyErr(e))).finally(load);
    } else load();
  }, [load]);

  /* A guardian's second step is their family PIN; the banner asks anyone without one. */
  const mfa = typeof MfaHost === "function" && (mfaPending || me) ? (
    <MfaHost family id={me ? me.guardian.guardianId : "family"} pending={mfaPending} onCleared={load}
      onSignOut={async () => { try { await NGGApi.family.logout(); } catch (_) {} setMfaPending(""); setMe(null); }}/>
  ) : null;
  if (me) return <div className="fam"><FamilyHome me={me} reload={load} setPage={setPage} onSignedOut={() => setMe(null)}/>{mfa}</div>;
  return (
    <div className="fam">
      <header className="fam-top">
        <FamilyBrand setPage={setPage}/>
      </header>
      <main className="fam-main" id="main">
        {me === undefined && <div className="fam-loading" role="status"><div className="dash-spinner"/><span className="sr-only">Loading your family account</span></div>}
        {me === null && !mfaPending && <FamilySignIn initialError={linkErr || err} onSignedIn={load} setPage={setPage}/>}
      </main>
      {mfa}
    </div>
  );
}

function FamilyBrand({ setPage }) {
  return (
    <button type="button" className="fam-brand" onClick={() => setPage("home")} aria-label="Back to the NGG site">
      <span className="fam-brand-mark" aria-hidden="true">NGG</span>
      <span className="fam-brand-name">Family account</span>
    </button>
  );
}

function FamilySignIn({ initialError, onSignedIn, setPage }) {
  const [step, setStep] = React.useState("email");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [masked, setMasked] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(initialError || "");
  const [note, setNote] = React.useState("");

  const send = async (e) => {
    if (e) e.preventDefault();
    setBusy(true); setErr(""); setNote("");
    try {
      const r = await NGGApi.family.request(email.trim());
      setMasked(r.masked || email); setStep("code");
      if (r.delivery === false) setNote("We couldn't send the email just now. Try again in a minute.");
    } catch (x) { setErr(familyErr(x)); }
    finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await NGGApi.family.verify({ email: email.trim(), otp, remember: true }); await onSignedIn(); }
    catch (x) { setErr(familyErr(x)); }
    finally { setBusy(false); }
  };

  return (
    <section className="fam-signin" aria-labelledby="fam-signin-h">
      <p className="fam-eyebrow">For parents and guardians</p>
      <h1 id="fam-signin-h" className="fam-h1">Follow your child's NGG journey</h1>
      <p className="fam-lede">See attendance, lateness, conduct, fees and lesson progress for each child in one place. Tell the centre about an absence without a phone call.</p>
      {step === "email" ? (
        <form className="fam-card fam-form" onSubmit={send}>
          <label className="fam-label" htmlFor="fam-email">Your email address</label>
          <input id="fam-email" className="fam-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
          <p className="fam-hint">We'll email you a six-digit code. There's no password to remember. If you're new, your family account is created when you sign in.</p>
          {err && <p className="fam-err" role="alert">{err}</p>}
          <button className="fam-btn is-primary" type="submit" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form className="fam-card fam-form" onSubmit={verify}>
          <p className="fam-hint" role="status">We sent a code to <b>{masked}</b>. It works for 15 minutes.</p>
          <label className="fam-label" htmlFor="fam-otp">Six-digit code</label>
          <input id="fam-otp" className="fam-input fam-otp" inputMode="numeric" autoComplete="one-time-code" value={otp}
            onChange={e => setOtp((e.target.value || "").replace(/\D/g, "").slice(0, 6))} placeholder="••••••"/>
          {note && <p className="fam-hint">{note}</p>}
          {err && <p className="fam-err" role="alert">{err}</p>}
          <button className="fam-btn is-primary" type="submit" disabled={busy || otp.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
          <div className="fam-row">
            <button type="button" className="fam-link" onClick={() => { setStep("email"); setOtp(""); setErr(""); }}>Use a different email</button>
            <button type="button" className="fam-link" onClick={send} disabled={busy}>Send a new code</button>
          </div>
        </form>
      )}
      <ul className="fam-promise">
        <li><b>You can see</b> attendance, lateness, conduct, fines, fees, lessons and the weekly check-in.</li>
        <li><b>You can't see</b> your child's journal, reflections, coach chats or messages. Those stay theirs.</li>
        <li><b>Your child is told</b> when a family account connects to them.</li>
      </ul>
      <button type="button" className="fam-link" onClick={() => setPage("parents")}>About NGG for parents →</button>
    </section>
  );
}

function FamilyAccountMenu({ me, onChanged, onSignedOut }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(me.guardian.fullName || "");
  const [phone, setPhone] = React.useState(me.guardian.phone || "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const btn = React.useRef(null);
  const close = () => { setOpen(false); if (btn.current) btn.current.focus(); };
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try { await NGGApi.family.act("profile", { fullName: name, phone }); setMsg("Saved."); onChanged(); }
    catch (x) { setMsg(familyErr(x)); }
    finally { setBusy(false); }
  };
  const signOut = async (everywhere) => {
    if (everywhere && !(await dialog.confirm({ title: "Sign out everywhere?", body: "This signs your family account out of every phone and computer, including this one.", cta: "Sign out everywhere" }))) return;
    try { await NGGApi.family.logout(everywhere); } catch (_) {}
    onSignedOut();
  };
  return (
    <div className="fam-menu">
      <button ref={btn} type="button" className="fam-btn" aria-expanded={open} aria-controls="fam-account" onClick={() => setOpen(o => !o)}>
        {me.guardian.fullName || me.guardian.email}
      </button>
      {open && (
        <div className="fam-pop" id="fam-account" role="dialog" aria-label="Your family account">
          <form className="fam-form" onSubmit={save}>
            <p className="fam-meta">Signed in as {me.guardian.email}</p>
            <label className="fam-label" htmlFor="fam-name">Your name</label>
            <input id="fam-name" className="fam-input" value={name} onChange={e => setName(e.target.value)} autoComplete="name"/>
            <label className="fam-label" htmlFor="fam-phone">Phone</label>
            <input id="fam-phone" className="fam-input" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" inputMode="tel"/>
            <p className="fam-hint">The centre sees your name on anything you send them.</p>
            {msg && <p className="fam-hint" role="status">{msg}</p>}
            <button className="fam-btn is-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </form>
          <div className="fam-div"/>
          <button type="button" className="fam-btn" onClick={() => signOut(false)}>Sign out</button>
          <button type="button" className="fam-link" onClick={() => signOut(true)}>Sign out on every device</button>
        </div>
      )}
    </div>
  );
}

/* The five screens of one child's account, in the order a parent needs them.
   One registry: the sidebar, the phone tab bar and the breadcrumb all read it. */
const FAMILY_VIEWS = [
  { id: "today",      label: "Today",                 short: "Today",    icon: "house" },
  { id: "attendance", label: "Attendance & conduct",  short: "Attend",   icon: "calendar-check" },
  { id: "fees",       label: "Fees",                  short: "Fees",     icon: "wallet" },
  { id: "lessons",    label: "Lessons & timetable",   short: "Lessons",  icon: "book-open" },
  { id: "messages",   label: "Messages to the centre", short: "Messages", icon: "chat-circle-text" },
];
const FAMILY_VIEW_IDS = FAMILY_VIEWS.map(v => v.id).concat(["emails"]);

/* The URL is the state (CLAUDE.md §2): /family?child=<link>&view=<screen>, so a
   refresh or a shared link opens the same child on the same screen. */
function familyUrlState() {
  try { const u = new URL(window.location.href); return { child: u.searchParams.get("child") || "", view: u.searchParams.get("view") || "" }; }
  catch (_) { return { child: "", view: "" }; }
}
function familyUrlSet(child, view) {
  try {
    const u = new URL(window.location.href);
    if (child) u.searchParams.set("child", child); else u.searchParams.delete("child");
    if (view && view !== "today") u.searchParams.set("view", view); else u.searchParams.delete("view");
    window.history.replaceState({}, "", u.toString());
  } catch (_) {}
}

function FamilyHome({ me, reload, setPage, onSignedOut }) {
  const active = me.wards.filter(w => w.status === "active");
  const waiting = me.wards.filter(w => w.status === "pending" || w.status === "refused");
  const fromUrl = familyUrlState();
  const [sel, setSel] = React.useState(active.find(w => w.linkId === fromUrl.child) ? fromUrl.child : (active[0] ? active[0].linkId : ""));
  const [view, setViewRaw] = React.useState(FAMILY_VIEW_IDS.includes(fromUrl.view) ? fromUrl.view : "today");
  const [askKind, setAskKind] = React.useState("");
  const [adding, setAdding] = React.useState(!active.length);
  React.useEffect(() => { if (!active.find(w => w.linkId === sel)) setSel(active[0] ? active[0].linkId : ""); }, [me]); // eslint-disable-line
  React.useEffect(() => { familyUrlSet(sel, view); }, [sel, view]);
  const go = (v, kind) => { setViewRaw(v); setAskKind(kind || ""); setAdding(false); try { window.scrollTo(0, 0); } catch (_) {} };
  const current = active.find(w => w.linkId === sel);
  const first = (me.guardian.fullName || "").split(" ")[0];
  const kidFirst = current ? (current.fullName || "").split(" ")[0] : "";
  const viewDef = FAMILY_VIEWS.find(v => v.id === view) || (view === "emails" ? { label: "Emails & connection" } : FAMILY_VIEWS[0]);

  return (
    <div className="fx-shell">
      {typeof GuideTour === "function" && <GuideTour portal="family"/>}
      <aside className="fx-side" aria-label="Your family account">
        <FamilyBrand setPage={setPage}/>
        <div>
          <p className="fx-side-h" id="fx-kids-h">Your children</p>
          <div className="fx-kids" role="tablist" aria-labelledby="fx-kids-h">
            {active.map(w => (
              <button key={w.linkId} type="button" role="tab" aria-selected={w.linkId === sel} className={"fam-tab" + (w.linkId === sel ? " is-on" : "")}
                onClick={() => { setSel(w.linkId); setAdding(false); }}>
                <span className="fam-av" aria-hidden="true">{(w.fullName || "?").charAt(0)}</span>
                <span style={{ minWidth: 0 }}>{(w.fullName || "").split(" ")[0]}<small>{w.centre || ""}</small></span>
              </button>
            ))}
            <button type="button" className={"fam-btn" + (adding ? " is-on" : "")} aria-expanded={adding} aria-controls="fam-add" onClick={() => setAdding(a => !a)}>+ Add a child</button>
          </div>
        </div>
        {current && (
          <nav className="fx-nav" aria-label={kidFirst + "'s account"}>
            {FAMILY_VIEWS.map(v => (
              <button key={v.id} type="button" className="fx-nav-item" aria-current={view === v.id && !adding ? "page" : undefined} onClick={() => go(v.id)}>
                <i className={"ph ph-" + v.icon} aria-hidden="true"/>{v.label}
              </button>
            ))}
            <button type="button" className="fx-nav-item" aria-current={view === "emails" && !adding ? "page" : undefined} onClick={() => go("emails")}>
              <i className="ph ph-envelope-simple" aria-hidden="true"/>Emails & connection
            </button>
          </nav>
        )}
      </aside>

      <div className="fx-main">
        <header className="fx-header">
          <div className="fx-crumb">Family{current && <> · {kidFirst} · <b>{adding ? "Add a child" : viewDef.label}</b></>}</div>
          <FamilyAccountMenu me={me} onChanged={reload} onSignedOut={onSignedOut}/>
        </header>
        <main className="fx-body" id="main">
          {/* The page title is the screen's own name; the welcome is for an account with no child yet. */}
          <div className="fam-head">
            <div>
              <p className="fam-eyebrow">{current && !adding ? kidFirst + " · " + (current.centre || "NGG") : "Family account"}</p>
              <h1 className="fam-h1">{current && !adding ? viewDef.label : first ? "Welcome, " + first : "Welcome"}</h1>
            </div>
          </div>

          {adding && <FamilyAddWard me={me} onDone={() => { setAdding(false); reload(); }}/>}

          {waiting.length > 0 && (view === "today" || !current) && (
            <section className="fam-card" aria-labelledby="fam-wait-h">
              <h2 id="fam-wait-h" className="fam-h2">Waiting for the centre</h2>
              <ul className="fam-list">
                {waiting.map(w => (
                  <li key={w.linkId} className="fam-list-row">
                    <span><b>{(w.fullName || "").split(" ")[0]}</b> · {w.centre}</span>
                    <span className={"fam-chip " + (w.status === "refused" ? "is-bad" : "is-warn")}>{w.status === "refused" ? "Not approved" : "Waiting for approval"}</span>
                    {w.status === "refused" && w.note && <span className="fam-meta">{w.note}</span>}
                  </li>
                ))}
              </ul>
              <p className="fam-hint">The centre checks that you're the parent or guardian on the record before connecting you. You'll get an email when they decide.</p>
            </section>
          )}

          {current ? <FamilyWard key={current.linkId} link={current} view={view} go={go} askKind={askKind} onRemoved={reload}/>
            : !adding && !waiting.length && <EmptyState title="No children connected yet" message="Add your child with the code from their NGG app." action={<button className="fam-btn is-primary" onClick={() => setAdding(true)}>Add a child</button>}/>}
        </main>
      </div>

      {current && (
        <nav className="fx-tabbar" aria-label={kidFirst + "'s account"}>
          {FAMILY_VIEWS.map(v => (
            <button key={v.id} type="button" className="fx-tab" aria-current={view === v.id ? "page" : undefined} onClick={() => go(v.id)}>
              <i className={"ph ph-" + v.icon} aria-hidden="true"/>{v.short}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function FamilyAddWard({ me, onDone }) {
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [rel, setRel] = React.useState("parent");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const rels = Object.entries(me.relationships || { parent: "Parent" });
  const add = async (e) => {
    e.preventDefault(); setBusy("code"); setErr("");
    try { await NGGApi.family.act("ward.add", { method: "code", code, name, relationship: rel }); setCode(""); setName(""); onDone(); }
    catch (x) { setErr(familyErr(x)); }
    finally { setBusy(""); }
  };
  const ask = async (s) => {
    setBusy(s.memberId); setErr("");
    try { await NGGApi.family.act("ward.add", { method: "record", memberId: s.memberId, relationship: rel }); onDone(); }
    catch (x) { setErr(familyErr(x)); }
    finally { setBusy(""); }
  };
  return (
    <section className="fam-card" id="fam-add" aria-labelledby="fam-add-h">
      <h2 id="fam-add-h" className="fam-h2">Add a child</h2>
      <div className="fam-field">
        <label className="fam-label" htmlFor="fam-rel">You are their</label>
        <select id="fam-rel" className="fam-input" value={rel} onChange={e => setRel(e.target.value)}>
          {rels.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {me.suggestions && me.suggestions.length > 0 && (
        <div className="fam-sub">
          <h3 className="fam-h3">Records with your email</h3>
          <p className="fam-hint">These NGG records list your email as the parent's. Ask to connect and the centre will confirm it.</p>
          <ul className="fam-list">
            {me.suggestions.map(s => (
              <li key={s.memberId} className="fam-list-row">
                <span><b>{s.firstName}</b>{s.centre ? " · " + s.centre : ""}</span>
                <button type="button" className="fam-btn" disabled={!!busy} onClick={() => ask(s)}>{busy === s.memberId ? "Asking…" : "Ask to connect"}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="fam-sub fam-form" onSubmit={add}>
        <h3 className="fam-h3">With your child's code</h3>
        <p className="fam-hint">Ask your child to open their NGG app → <b>You → Your Circle</b>. They'll read you a six-digit code. This connects straight away.</p>
        <div className="fam-grid2">
          <div className="fam-field">
            <label className="fam-label" htmlFor="fam-code">Six-digit code</label>
            <input id="fam-code" className="fam-input fam-otp" inputMode="numeric" value={code} onChange={e => setCode((e.target.value || "").replace(/\D/g, "").slice(0, 6))} placeholder="••••••"/>
          </div>
          <div className="fam-field">
            <label className="fam-label" htmlFor="fam-kid">Their first name or surname</label>
            <input id="fam-kid" className="fam-input" value={name} onChange={e => setName(e.target.value)} autoComplete="off"/>
          </div>
        </div>
        {err && <p className="fam-err" role="alert">{err}</p>}
        <button className="fam-btn is-primary" type="submit" disabled={!!busy || code.length !== 6 || name.trim().length < 2}>{busy === "code" ? "Connecting…" : "Connect"}</button>
      </form>
    </section>
  );
}

function FamilyWard({ link, view, go, askKind, onRemoved }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(() => {
    setErr(null);
    return NGGApi.family.ward(link.linkId).then(setD).catch(e => setErr(e));
  }, [link.linkId]);
  React.useEffect(() => { load(); }, [load]);

  if (err) return <ErrorState title="Couldn't load this dashboard" message={familyErr(err)} onRetry={load}/>;
  if (!d) return <div className="fam-loading" role="status"><div className="dash-spinner"/><span className="sr-only">Loading</span></div>;
  const m = d.member, first = (m.fullName || "").split(" ")[0];
  const t = d.today;
  const late = t.status === "late" || t.status === "tardy";

  const hero = (
    <section className="fam-card fam-hero" aria-label={m.fullName}>
      <div className="fam-av fam-av-lg" aria-hidden="true">{(m.fullName || "?").charAt(0)}</div>
      <div className="fam-hero-main">
        <h2 className="fam-h2">{m.fullName}</h2>
        <p className="fam-meta">{[m.displayId, m.centre, m.track].filter(Boolean).join(" · ")}</p>
      </div>
      <div className={"fam-today" + (t.in ? (late ? " is-warn" : " is-good") : "")} role="status">
        {t.in ? <>Signed in {t.in}{late ? " · " + t.lateMinutes + " min late" : ""}{t.out ? " · out " + t.out : ""}</> : "Not signed in today"}
      </div>
    </section>
  );

  if (view === "attendance") return <div className="fam-ward">{hero}<FamilyAttendance d={d} first={first}/></div>;
  if (view === "fees") return <div className="fam-ward">{hero}<FamilyFees d={d} link={link} first={first} go={go}/></div>;
  if (view === "lessons") return <div className="fam-ward">{hero}<FamilyLessons d={d} first={first}/></div>;
  if (view === "messages") return <div className="fam-ward">{hero}<FamilyTellCentre key={askKind || "msg"} d={d} link={link} first={first} reload={load} initialKind={askKind}/></div>;
  if (view === "emails") return <div className="fam-ward">{hero}<FamilyNotify link={link} first={first} onRemoved={onRemoved}/><TelegramConnect/></div>;
  return <div className="fam-ward">{hero}<FamilyToday d={d} link={link} first={first} go={go}/></div>;
}

/* Today: what needs the parent first, each with the one action it needs; then
   the four numbers at a glance (each opens its screen); then the week. */
function FamilyToday({ d, link, first, go }) {
  const rating = d.companion && FAMILY_RATING[d.companion.rating];
  const needs = [];
  if (d.fees.enabled && d.fees.payable > 0) needs.push({ tone: "warn", icon: "wallet", t: d.fees.payableText + " to pay", s: "Dues and fees on " + first + "'s account",
    act: d.fees.payOnline ? <PayBalanceButton amountText={d.fees.payableText} pay={() => NGGApi.family.pay(link.linkId)}/> : <button type="button" className="fam-btn" onClick={() => go("fees")}>How to pay</button> });
  if (d.conduct.enabled && d.conduct.state && d.conduct.state !== "good") needs.push({ tone: "bad", icon: "warning", t: FAMILY_STATE_LABEL[d.conduct.state] || "Conduct", s: d.conduct.reason || "See attendance & conduct",
    act: <button type="button" className="fam-btn" onClick={() => go("attendance")}>See why</button> });
  if (d.learning.overdue > 0) needs.push({ tone: "warn", icon: "book-open", t: d.learning.overdue + " lesson" + (d.learning.overdue === 1 ? "" : "s") + " overdue", s: "Encourage " + first + " to catch up",
    act: <button type="button" className="fam-btn" onClick={() => go("lessons")}>See lessons</button> });
  const replied = (d.requests || []).filter(r => r.status === "approved" || r.status === "declined").slice(0, 1);
  replied.forEach(r => needs.push({ tone: r.status === "approved" ? "ok" : "bad", icon: "chat-circle-text", t: "The centre replied: " + (FAMILY_REQUEST_STATUS[r.status] || r.status), s: r.subject + (r.decision ? " — " + r.decision : ""),
    act: <button type="button" className="fam-btn" onClick={() => go("messages")}>Open</button> }));

  return (
    <>
      <section className="fam-card" aria-labelledby="fx-needs-h">
        <div className="fam-row"><h3 id="fx-needs-h" className="fam-h2">{needs.length ? "Needs you" : "Nothing needs you"}</h3></div>
        {needs.length ? (
          <ul className="fx-needs">
            {needs.map((n, i) => (
              <li key={i} className={"fx-need is-" + n.tone}>
                <i className={"ph ph-" + n.icon} aria-hidden="true"/>
                <span className="fx-need-t"><b>{n.t}</b><span>{n.s}</span></span>
                {n.act}
              </li>
            ))}
          </ul>
        ) : <p className="fam-hint">{first} is all caught up: nothing to pay, nothing overdue, and no warnings.</p>}
        <div className="fam-div"/>
        <p className="fam-label" style={{ margin: 0 }}>Tell the centre</p>
        <div className="fx-actions" style={{ marginTop: 8 }}>
          <button type="button" className="fam-btn" onClick={() => go("messages", "leave")}><i className="ph ph-calendar-x" aria-hidden="true"/>{first} will be away</button>
          <button type="button" className="fam-btn" onClick={() => go("messages", "idcard")}><i className="ph ph-identification-card" aria-hidden="true"/>Lost ID card</button>
          <button type="button" className="fam-btn" onClick={() => go("messages", "appeal")}><i className="ph ph-scales" aria-hidden="true"/>Question a charge</button>
        </div>
      </section>

      <div className="fam-grid">
        <button type="button" className="fam-card fx-tile" onClick={() => go("attendance")}>
          <h3 className="fam-h3">Attendance this term</h3>
          <p className="fam-big">{d.attendance.rateKnown ? d.attendance.rate + "%" : "—"}</p>
          <p className="fam-meta">{d.attendance.rateKnown ? d.attendance.present + " of " + d.attendance.daysRan + " days" : "Shows once the calendar is set"}</p>
        </button>
        <button type="button" className="fam-card fx-tile" onClick={() => go("attendance")}>
          <h3 className="fam-h3">Conduct</h3>
          <p className="fam-big" style={{ fontSize: 20 }}>{d.conduct.enabled ? (FAMILY_STATE_LABEL[d.conduct.state] || "In good standing") : "Not tracked"}</p>
          <p className="fam-meta">{d.conduct.enabled ? (d.conduct.fines.length ? d.conduct.fines.length + " fine" + (d.conduct.fines.length === 1 ? "" : "s") + " outstanding" : "No outstanding fines") : "The centre hasn't switched it on"}</p>
        </button>
        <button type="button" className="fam-card fx-tile" onClick={() => go("fees")}>
          <h3 className="fam-h3">Fees due</h3>
          <p className="fam-big">{d.fees.enabled ? d.fees.payableText : "—"}</p>
          <p className="fam-meta">{d.fees.enabled ? (d.fees.payable > 0 ? "Due now" : "Nothing to pay") : "No fees recorded"}</p>
        </button>
        <button type="button" className="fam-card fx-tile" onClick={() => go("lessons")}>
          <h3 className="fam-h3">Lessons</h3>
          <p className="fam-big">{d.learning.total > 0 ? d.learning.completed + " of " + d.learning.total : "—"}</p>
          <p className="fam-meta">{d.learning.total > 0 ? (d.learning.overdue ? d.learning.overdue + " overdue" : "On schedule") : "None set yet"}</p>
        </button>
      </div>

      <div className="fx-cols">
        {d.companion ? (
          <section className="fam-card" aria-labelledby="fam-cmp-h">
            <div className="fam-row"><h3 id="fam-cmp-h" className="fam-h2">This week's check-in</h3>{rating && <span className={"fam-chip " + rating.cls}>{rating.label}</span>}</div>
            {d.companion.summary && <p className="fam-hint">{d.companion.summary}</p>}
            {(d.companion.strengths || []).length > 0 && <p className="fam-hint"><b>Going well:</b> {d.companion.strengths.join("; ")}</p>}
            {(d.companion.focus || []).length > 0 && <p className="fam-hint"><b>To work on:</b> {d.companion.focus.join("; ")}</p>}
          </section>
        ) : <section className="fam-card"><h3 className="fam-h2">This week's check-in</h3><p className="fam-hint">{first} hasn't done this week's check-in yet.</p></section>}
        {/* A Saturday at NGG, in the words families are told (the schedule the reminders follow). */}
        {typeof FormationDay === "function" && <div><FormationDay audience="parent" compact={true}/></div>}
      </div>
    </>
  );
}

function FamilyAttendance({ d, first }) {
  return (
    <div className="fx-cols">
      <section className="fam-card" aria-labelledby="fam-att-h">
        <h3 id="fam-att-h" className="fam-h2">Attendance this term</h3>
        <p className="fam-big" style={{ marginTop: 10 }}>{d.attendance.rateKnown ? d.attendance.rate + "%" : "—"}</p>
        <p className="fam-meta">{d.attendance.rateKnown ? d.attendance.present + " of " + d.attendance.daysRan + " programme days" : "The rate shows once the centre's calendar is set."}</p>
        {d.attendance.late.length > 0 && <p className="fam-hint">Late recently: {d.attendance.late.map(l => fmtDayMonth(l.date) + " (" + l.minutes + " min)").join(", ")}</p>}
        {d.attendance.recent.length > 0 ? (
          <table className="fam-table">
            <thead><tr><th scope="col">Day</th><th scope="col">In</th><th scope="col">Out</th></tr></thead>
            <tbody>{d.attendance.recent.slice(0, 10).map(r => <tr key={r.date}><td>{fmtDayMonth(r.date)}</td><td>{r.in || "—"}</td><td>{r.out || "—"}</td></tr>)}</tbody>
          </table>
        ) : <p className="fam-hint">No sign-ins yet.</p>}
      </section>
      <section className="fam-card" aria-labelledby="fam-con-h">
        <h3 id="fam-con-h" className="fam-h2">Conduct</h3>
        {d.conduct.enabled ? <>
          <p className="fam-big" style={{ fontSize: 22, marginTop: 10 }}>{FAMILY_STATE_LABEL[d.conduct.state] || "In good standing"}</p>
          {d.conduct.reason && <p className="fam-meta">{d.conduct.reason}{d.conduct.until ? " · until " + fmtDate(d.conduct.until) : ""}</p>}
          {d.conduct.fines.length > 0 ? <ul className="fam-list">{d.conduct.fines.map((f, i) => <li key={i} className="fam-list-row"><span>{f.reason || "Fine"}</span><span className="fam-meta">{fmtDate(f.issuedAt)}</span></li>)}</ul>
            : <p className="fam-hint">No outstanding fines.</p>}
        </> : <p className="fam-hint">The centre hasn't switched on conduct tracking.</p>}
      </section>
    </div>
  );
}

function FamilyFees({ d, link, first, go }) {
  if (!d.fees.enabled) return <section className="fam-card"><h3 className="fam-h2">Fees</h3><p className="fam-hint">No fees are recorded for {first}.</p></section>;
  return (
    <div className="fx-cols">
      <section className="fam-card" aria-labelledby="fam-fee-h">
        <h3 id="fam-fee-h" className="fam-h2">Fees</h3>
        <p className="fam-big" style={{ marginTop: 10 }}>{d.fees.payableText}</p>
        <p className="fam-meta">Due now{d.fees.outstanding !== d.fees.payable ? " · " + d.fees.outstandingText + " on the account in total" : ""}</p>
        {d.fees.payOnline && d.fees.payable > 0 && <PayBalanceButton amountText={d.fees.payableText} pay={() => NGGApi.family.pay(link.linkId)}/>}
        {!d.fees.payOnline && d.fees.payable > 0 && <p className="fam-hint">Pay by bank transfer and keep the slip; the centre records it and emails you a receipt.</p>}
        <button type="button" className="fam-link" onClick={() => go("messages", "appeal")}>Question a charge</button>
      </section>
      <section className="fam-card" aria-labelledby="fam-stm-h">
        <h3 id="fam-stm-h" className="fam-h2">Recent account entries</h3>
        {d.fees.recent.length > 0 ? <ul className="fam-list">{d.fees.recent.map((e, i) => (
          <li key={i} className={"fam-list-row" + (e.void ? " is-void" : "")}><span>{e.note || e.kind}</span><span className="fam-meta">{e.direction === "credit" ? "−" : ""}{fmtNum(e.amount)} · {fmtDayMonth(e.createdAt)}</span></li>
        ))}</ul> : <p className="fam-hint">Nothing recorded yet.</p>}
      </section>
    </div>
  );
}

function FamilyLessons({ d, first }) {
  return (
    <>
      <section className="fam-card" aria-labelledby="fam-lrn-h">
        <h3 id="fam-lrn-h" className="fam-h2">Lessons</h3>
        {d.learning.total > 0 ? <>
          <p className="fam-big" style={{ marginTop: 10 }}>{d.learning.completed} of {d.learning.total}</p>
          <div className="fam-bar" role="progressbar" aria-valuenow={d.learning.pct} aria-valuemin="0" aria-valuemax="100" aria-label="Lessons done"><span style={{ width: d.learning.pct + "%" }}/></div>
          {d.learning.overdue > 0 && <p className="fam-err">{d.learning.overdue} overdue</p>}
          <ul className="fam-list">{d.learning.next.map((u, i) => (
            <li key={i} className="fam-list-row"><span>{u.title}</span>
              <span className={"fam-chip" + (u.overdueDays ? " is-bad" : "")}>{u.overdueDays ? u.overdueDays + " days overdue" : u.dueDate ? "Due " + fmtDayMonth(u.dueDate) : "Week " + u.week}</span></li>
          ))}</ul>
        </> : <p className="fam-hint">No lessons are set for {first} yet.</p>}
      </section>
      {d.timetable && (
        <section className="fam-card tt-print" aria-labelledby="fam-tt-h">
          <div className="fam-row"><h3 id="fam-tt-h" className="fam-h2">{first}'s timetable{d.timetable.centre ? " · " + d.timetable.centre : ""}</h3>
            <span className="tt-noprint">
              {d.timetable.slug && d.timetable.slots.length > 0 && <a className="fam-link" href={"/timetable?centre=" + encodeURIComponent(d.timetable.slug)}>Make a personal timetable</a>}
              {d.timetable.slots.length > 0 && <button type="button" className="fam-link" onClick={() => window.print()}>Print</button>}
            </span></div>
          <TimetableView slots={d.timetable.slots} showInstructor title={first} mineLabel={first + "'s course"}
            emptyText={d.timetable.centre ? d.timetable.centre + " has not published its timetable yet." : first + " has not been placed at a centre yet."}/>
        </section>
      )}
    </>
  );
}

function FamilyTellCentre({ d, link, first, reload, initialKind }) {
  const kinds = Object.entries(d.kinds || {});
  const [kind, setKind] = React.useState(initialKind && d.kinds && d.kinds[initialKind] ? initialKind : (kinds[0] ? kinds[0][0] : "leave"));
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [ref, setRef] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    try {
      await NGGApi.family.act("request", { linkId: link.linkId, kind, fromDate: from, toDate: to, refEntryId: ref, body });
      setBody(""); setFrom(""); setTo(""); setRef(""); setMsg("Sent. The centre will reply by email."); reload();
    } catch (x) { setErr(familyErr(x)); }
    finally { setBusy(false); }
  };
  const withdraw = async (r) => {
    if (!(await dialog.confirm({ title: "Withdraw this request?", body: "“" + r.subject + "” will be taken out of the centre's queue.", cta: "Withdraw" }))) return;
    try { await NGGApi.family.act("withdraw", { requestId: r.requestId }); reload(); } catch (x) { setErr(familyErr(x)); }
  };
  return (
    <section className="fam-card" aria-labelledby="fam-tell-h">
      <h3 id="fam-tell-h" className="fam-h2">Tell the centre</h3>
      <p className="fam-hint">The centre replies by email, and you'll see the answer here.</p>
      <form className="fam-form" onSubmit={send}>
        <div className="fam-field">
          <label className="fam-label" htmlFor="fam-kind">About</label>
          <select id="fam-kind" className="fam-input" value={kind} onChange={e => setKind(e.target.value)}>
            {kinds.map(([k, v]) => <option key={k} value={k}>{k === "leave" ? first + " will be away" : v}</option>)}
          </select>
        </div>
        {kind === "leave" && (
          <div className="fam-grid2">
            <div className="fam-field"><label className="fam-label" htmlFor="fam-from">From</label><input id="fam-from" type="date" className="fam-input" value={from} onChange={e => setFrom(e.target.value)} required/></div>
            <div className="fam-field"><label className="fam-label" htmlFor="fam-to">To (optional)</label><input id="fam-to" type="date" className="fam-input" value={to} onChange={e => setTo(e.target.value)}/></div>
          </div>
        )}
        {kind === "appeal" && d.charges.length > 0 && (
          <div className="fam-field">
            <label className="fam-label" htmlFor="fam-ref">Which charge</label>
            <select id="fam-ref" className="fam-input" value={ref} onChange={e => setRef(e.target.value)}>
              <option value="">Not a specific charge</option>
              {d.charges.map(c => <option key={c.entryId} value={c.entryId}>{(c.note || "Charge") + " · " + fmtNum(c.amount) + " · " + fmtDayMonth(c.createdAt)}</option>)}
            </select>
          </div>
        )}
        <div className="fam-field">
          <label className="fam-label" htmlFor="fam-body">{kind === "idcard" ? "What happened (optional)" : "Why"}</label>
          <textarea id="fam-body" className="fam-input" rows={3} value={body} onChange={e => setBody(e.target.value)} maxLength={2000} required={kind !== "idcard"}/>
        </div>
        {err && <p className="fam-err" role="alert">{err}</p>}
        {msg && <p className="fam-hint" role="status">{msg}</p>}
        <button className="fam-btn is-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send to the centre"}</button>
      </form>
      {d.requests.length > 0 && (
        <ul className="fam-list" aria-label="What you've sent">
          {d.requests.map(r => (
            <li key={r.requestId} className="fam-list-row">
              <span>{r.subject}<span className="fam-meta"> · {fmtDate(r.createdAt)}</span>{r.decision && <span className="fam-meta"> — {r.decision}</span>}</span>
              <span className={"fam-chip" + (r.status === "approved" ? " is-good" : r.status === "declined" ? " is-bad" : "")}>{FAMILY_REQUEST_STATUS[r.status] || r.status}</span>
              {r.status === "open" && <button type="button" className="fam-link" onClick={() => withdraw(r)}>Withdraw</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FamilyNotify({ link, first, onRemoved }) {
  const [err, setErr] = React.useState("");
  const remove = async () => {
    if (!(await dialog.confirm({ title: "Disconnect from " + first + "?", body: "You'll stop seeing " + first + "'s dashboard and getting their emails. You can connect again later with their code.", cta: "Disconnect", danger: true }))) return;
    try { await NGGApi.family.act("ward.remove", { linkId: link.linkId }); onRemoved(); } catch (x) { setErr(familyErr(x)); }
  };
  return (
    <section className="fam-card" aria-labelledby="fam-ntf-h">
      <h3 id="fam-ntf-h" className="fam-h2">Emails about {first}</h3>
      {/* Always on: these emails are part of membership, so there is nothing to switch. */}
      <ul className="fam-list">
        {FAMILY_NOTIFY_LABELS.map(([k, label, hint]) => (
          <li key={k} className="fam-list-row">
            <span><b>{label}</b><span className="fam-meta"> · {hint}</span></span>
            <span className="fam-meta">On</span>
          </li>
        ))}
      </ul>
      <p className="fam-hint">These emails are part of {first}’s membership and are always on.</p>
      {err && <p className="fam-err" role="alert">{err}</p>}
      <button type="button" className="fam-link is-danger" onClick={remove}>Disconnect from {first}</button>
    </section>
  );
}
