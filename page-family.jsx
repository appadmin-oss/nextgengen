/* ================================================================
   NGG — Family account (/family).

   A parent's or guardian's own sign-in, holding the NGG members they look
   after. Its own cookie and its own API (api/family/*): a family session is
   never a member session, and nothing here reads one. The Anchor Circle
   (/circle) stays as the one-child, no-account window; this is the account.

   What a parent sees is read from the same functions as the member's own
   dashboard, server-side; what they can DO is tell the desk something
   (an absence, an appeal, a lost card) and choose which mails arrive.
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

  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.family.me()
      .then(d => setMe(d && d.guardian ? d : null))
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

  return (
    <div className="fam">
      <header className="fam-top">
        <button type="button" className="fam-brand" onClick={() => setPage("home")} aria-label="Back to the NGG site">
          <span className="fam-brand-mark" aria-hidden="true">NGG</span>
          <span className="fam-brand-name">Family account</span>
        </button>
        {me && <FamilyAccountMenu me={me} onChanged={load} onSignedOut={() => setMe(null)}/>}
      </header>
      <main className="fam-main" id="main">
        {me === undefined && <div className="fam-loading" role="status"><div className="dash-spinner"/><span className="sr-only">Loading your family account</span></div>}
        {me === null && <FamilySignIn initialError={linkErr || err} onSignedIn={load} setPage={setPage}/>}
        {me && <FamilyHome me={me} reload={load}/>}
      </main>
    </div>
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

function FamilyHome({ me, reload }) {
  const active = me.wards.filter(w => w.status === "active");
  const waiting = me.wards.filter(w => w.status === "pending" || w.status === "refused");
  const [sel, setSel] = React.useState(active[0] ? active[0].linkId : "");
  const [adding, setAdding] = React.useState(!active.length);
  React.useEffect(() => { if (!active.find(w => w.linkId === sel)) setSel(active[0] ? active[0].linkId : ""); }, [me]); // eslint-disable-line
  const current = active.find(w => w.linkId === sel);
  const first = (me.guardian.fullName || "").split(" ")[0];

  return (
    <>
      <div className="fam-head">
        <div>
          <p className="fam-eyebrow">Family account</p>
          <h1 className="fam-h1">{first ? "Welcome, " + first : "Welcome"}</h1>
        </div>
        <button type="button" className={"fam-btn" + (adding ? " is-on" : "")} aria-expanded={adding} aria-controls="fam-add" onClick={() => setAdding(a => !a)}>+ Add a child</button>
      </div>

      {active.length > 0 && (
        <div className="fam-tabs" role="tablist" aria-label="Your children">
          {active.map(w => (
            <button key={w.linkId} type="button" role="tab" aria-selected={w.linkId === sel} className={"fam-tab" + (w.linkId === sel ? " is-on" : "")} onClick={() => setSel(w.linkId)}>
              <span className="fam-av" aria-hidden="true">{(w.fullName || "?").charAt(0)}</span>
              <span>{(w.fullName || "").split(" ")[0]}</span>
            </button>
          ))}
        </div>
      )}

      {adding && <FamilyAddWard me={me} onDone={() => { setAdding(false); reload(); }}/>}

      {waiting.length > 0 && (
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

      {/* What a Saturday at NGG holds, in the words families are told (the same schedule the reminders follow). */}
      {active.length > 0 && typeof FormationDay === "function" && <FormationDay audience="parent"/>}
      {current ? <FamilyWard key={current.linkId} link={current} onRemoved={reload}/>
        : !adding && !waiting.length && <EmptyState title="No children connected yet" message="Add your child with the code from their NGG app." action={<button className="fam-btn is-primary" onClick={() => setAdding(true)}>Add a child</button>}/>}
    </>
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

function FamilyWard({ link, onRemoved }) {
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
  const rating = d.companion && FAMILY_RATING[d.companion.rating];
  const t = d.today;

  return (
    <div className="fam-ward">
      <section className="fam-card fam-hero" aria-label={m.fullName}>
        <div className="fam-av fam-av-lg" aria-hidden="true">{(m.fullName || "?").charAt(0)}</div>
        <div className="fam-hero-main">
          <h2 className="fam-h2">{m.fullName}</h2>
          <p className="fam-meta">{[m.displayId, m.centre, m.track].filter(Boolean).join(" · ")}</p>
        </div>
        <div className={"fam-today" + (t.in ? (t.status === "late" || t.status === "tardy" ? " is-warn" : " is-good") : "")} role="status">
          {t.in
            ? <>Signed in {t.in}{t.status === "late" || t.status === "tardy" ? " · " + t.lateMinutes + " min late" : ""}{t.out ? " · out " + t.out : ""}</>
            : "Not signed in today"}
        </div>
      </section>

      <div className="fam-grid">
        <section className="fam-card" aria-labelledby="fam-att-h">
          <h3 id="fam-att-h" className="fam-h3">Attendance this term</h3>
          <p className="fam-big">{d.attendance.rateKnown ? d.attendance.rate + "%" : "—"}</p>
          <p className="fam-meta">{d.attendance.rateKnown ? d.attendance.present + " of " + d.attendance.daysRan + " programme days" : "The rate shows once the centre's calendar is set."}</p>
          {d.attendance.late.length > 0 && <p className="fam-hint">Late recently: {d.attendance.late.map(l => fmtDayMonth(l.date) + " (" + l.minutes + " min)").join(", ")}</p>}
          {d.attendance.recent.length > 0 ? (
            <table className="fam-table">
              <thead><tr><th scope="col">Day</th><th scope="col">In</th><th scope="col">Out</th></tr></thead>
              <tbody>{d.attendance.recent.slice(0, 7).map(r => <tr key={r.date}><td>{fmtDayMonth(r.date)}</td><td>{r.in || "—"}</td><td>{r.out || "—"}</td></tr>)}</tbody>
            </table>
          ) : <p className="fam-hint">No sign-ins yet.</p>}
        </section>

        <section className="fam-card" aria-labelledby="fam-con-h">
          <h3 id="fam-con-h" className="fam-h3">Conduct</h3>
          {d.conduct.enabled ? <>
            <p className="fam-big">{FAMILY_STATE_LABEL[d.conduct.state] || "In good standing"}</p>
            {d.conduct.reason && <p className="fam-meta">{d.conduct.reason}{d.conduct.until ? " · until " + fmtDate(d.conduct.until) : ""}</p>}
            {d.conduct.fines.length > 0 ? <ul className="fam-list">{d.conduct.fines.map((f, i) => <li key={i} className="fam-list-row"><span>{f.reason || "Fine"}</span><span className="fam-meta">{fmtDate(f.issuedAt)}</span></li>)}</ul>
              : <p className="fam-hint">No outstanding fines.</p>}
          </> : <p className="fam-hint">The centre hasn't switched on conduct tracking.</p>}
        </section>

        <section className="fam-card" aria-labelledby="fam-fee-h">
          <h3 id="fam-fee-h" className="fam-h3">Fees</h3>
          {d.fees.enabled ? <>
            <p className="fam-big">{d.fees.payableText}</p>
            <p className="fam-meta">Due now{d.fees.outstanding !== d.fees.payable ? " · " + d.fees.outstandingText + " on the account in total" : ""}</p>
            {d.fees.payOnline && d.fees.payable > 0 && <PayBalanceButton amountText={d.fees.payableText} pay={() => NGGApi.family.pay(link.linkId)}/>}
            {d.fees.recent.length > 0 && <ul className="fam-list">{d.fees.recent.map((e, i) => (
              <li key={i} className={"fam-list-row" + (e.void ? " is-void" : "")}><span>{e.note || e.kind}</span><span className="fam-meta">{e.direction === "credit" ? "−" : ""}{fmtNum(e.amount)} · {fmtDayMonth(e.createdAt)}</span></li>
            ))}</ul>}
          </> : <p className="fam-hint">No fees are recorded for {first}.</p>}
        </section>

        <section className="fam-card" aria-labelledby="fam-lrn-h">
          <h3 id="fam-lrn-h" className="fam-h3">Lessons</h3>
          {d.learning.total > 0 ? <>
            <p className="fam-big">{d.learning.completed} of {d.learning.total}</p>
            <div className="fam-bar" role="progressbar" aria-valuenow={d.learning.pct} aria-valuemin="0" aria-valuemax="100" aria-label="Lessons done"><span style={{ width: d.learning.pct + "%" }}/></div>
            {d.learning.overdue > 0 && <p className="fam-err">{d.learning.overdue} overdue</p>}
            <ul className="fam-list">{d.learning.next.map((u, i) => (
              <li key={i} className="fam-list-row"><span>{u.title}</span>
                <span className={"fam-chip" + (u.overdueDays ? " is-bad" : "")}>{u.overdueDays ? u.overdueDays + " days overdue" : u.dueDate ? "Due " + fmtDayMonth(u.dueDate) : "Week " + u.week}</span></li>
            ))}</ul>
          </> : <p className="fam-hint">No lessons are set for {first} yet.</p>}
        </section>
      </div>

      {d.companion && (
        <section className="fam-card" aria-labelledby="fam-cmp-h">
          <div className="fam-row"><h3 id="fam-cmp-h" className="fam-h3">This week's check-in</h3>{rating && <span className={"fam-chip " + rating.cls}>{rating.label}</span>}</div>
          {d.companion.summary && <p>{d.companion.summary}</p>}
          {(d.companion.strengths || []).length > 0 && <p className="fam-hint"><b>Going well:</b> {d.companion.strengths.join("; ")}</p>}
          {(d.companion.focus || []).length > 0 && <p className="fam-hint"><b>To work on:</b> {d.companion.focus.join("; ")}</p>}
        </section>
      )}

      {d.timetable && (
        <section className="fam-card tt-print" aria-labelledby="fam-tt-h">
          <div className="fam-row"><h3 id="fam-tt-h" className="fam-h3">{first}'s timetable{d.timetable.centre ? " · " + d.timetable.centre : ""}</h3>
            <span className="tt-noprint">
              {d.timetable.slug && d.timetable.slots.length > 0 && <a className="fam-link" href={"/timetable?centre=" + encodeURIComponent(d.timetable.slug)}>Make a personal timetable</a>}
              {d.timetable.slots.length > 0 && <button type="button" className="fam-link" onClick={() => window.print()}>Print</button>}
            </span></div>
          <TimetableView slots={d.timetable.slots} showInstructor title={first} mineLabel={first + "'s course"}
            emptyText={d.timetable.centre ? d.timetable.centre + " has not published its timetable yet." : first + " has not been placed at a centre yet."}/>
        </section>
      )}

      <FamilyTellCentre d={d} link={link} first={first} reload={load}/>
      <FamilyNotify link={link} first={first} onRemoved={onRemoved}/>
    </div>
  );
}

function FamilyTellCentre({ d, link, first, reload }) {
  const kinds = Object.entries(d.kinds || {});
  const [kind, setKind] = React.useState(kinds[0] ? kinds[0][0] : "leave");
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
      <h3 id="fam-tell-h" className="fam-h3">Tell the centre</h3>
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
  const [prefs, setPrefs] = React.useState(link.notify || {});
  const [err, setErr] = React.useState("");
  const toggle = async (k) => {
    const next = Object.assign({}, prefs, { [k]: !prefs[k] });
    setPrefs(next); setErr("");
    try { const r = await NGGApi.family.act("ward.notify", { linkId: link.linkId, notify: { [k]: next[k] } }); setPrefs(r.notify || next); }
    catch (x) { setPrefs(prefs); setErr(familyErr(x)); }
  };
  const remove = async () => {
    if (!(await dialog.confirm({ title: "Disconnect from " + first + "?", body: "You'll stop seeing " + first + "'s dashboard and getting their emails. You can connect again later with their code.", cta: "Disconnect", danger: true }))) return;
    try { await NGGApi.family.act("ward.remove", { linkId: link.linkId }); onRemoved(); } catch (x) { setErr(familyErr(x)); }
  };
  return (
    <section className="fam-card" aria-labelledby="fam-ntf-h">
      <h3 id="fam-ntf-h" className="fam-h3">Emails about {first}</h3>
      <ul className="fam-list">
        {FAMILY_NOTIFY_LABELS.map(([k, label, hint]) => (
          <li key={k} className="fam-list-row is-switch">
            <span><b>{label}</b><span className="fam-meta"> · {hint}</span></span>
            <button type="button" className={"fam-switch" + (prefs[k] ? " is-on" : "")} aria-pressed={!!prefs[k]} aria-label={label} onClick={() => toggle(k)}><span aria-hidden="true"/></button>
          </li>
        ))}
      </ul>
      {err && <p className="fam-err" role="alert">{err}</p>}
      <button type="button" className="fam-link is-danger" onClick={remove}>Disconnect from {first}</button>
    </section>
  );
}
