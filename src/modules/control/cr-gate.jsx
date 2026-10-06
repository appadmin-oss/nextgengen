/* ============================================================================
   Control Room v2 — the door. Signed in, staff, and 2FA-cleared, in that
   order; each refusal says what is missing and offers the one way forward.
   Sign-in itself is the site's own modal (auth.jsx); this is the part only
   staff see: first-time 2FA enrolment and the code.

   A backup code is a code too: the server has always accepted one, and a
   field that only let six digits through meant the recovery codes printed at
   enrolment could never be typed in.
   ========================================================================== */

/** Codes as typed: six digits, or a backup code like 3F9A-1C7B (case and dash forgiven). */
function crCodeShape(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{6}$/.test(s)) return { ok: true, code: s, backup: false };
  const h = s.replace(/-/g, "");
  if (/^[0-9A-F]{8}$/.test(h)) return { ok: true, code: h.slice(0, 4) + "-" + h.slice(4), backup: true };
  return { ok: false, code: s };
}

function CrGateCard({ children, title, lead }) {
  return (
    <div className="cr-gate">
      <div className="cr-gate-card">
        <img src="/assets/logo.png" alt=""/>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
        {children}
      </div>
    </div>
  );
}

function CrTotp({ auth, onDone }) {
  const member = auth.member || {};
  const [setup, setSetup] = React.useState(null);       // { secret, otpauth, backupCodes } on first enrolment
  const [mode, setMode] = React.useState(member.needsTotp ? "setup" : "verify");
  const [qr, setQr] = React.useState("");
  const [code, setCode] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (mode !== "setup" || setup) return;
    NGGApi.auth.adminTotpSetup().then(r => {
      setSetup(r);
      loadVendor("qrcode").then(q => {
        const g = q(0, "M"); g.addData(r.otpauth || ""); g.make();
        setQr(g.createSvgTag({ cellSize: 5, margin: 2, scalable: true }));
      }).catch(() => setQr(""));
    }).catch(e => {
      // Enrolled already: the code is all that is needed.
      if (e && (e.code === "already_enrolled" || e.status === 409)) setMode("verify");
      else setErr(crErr(e, "Couldn’t start 2FA setup."));
    });
  }, [mode]);
  const shape = crCodeShape(code);
  const submit = async e => {
    e.preventDefault();
    if (!shape.ok) { setErr("Enter the 6-digit code from your app, or a backup code like 3F9A-1C7B."); return; }
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.auth.adminTotpVerify(shape.code);
      auth.setAdminOk(true);
      onDone(r && r.backupUsed ? "Backup code used — " + (r.backupRemaining != null ? r.backupRemaining + " left" : "fewer left") + ". Set up your authenticator again soon." : "");
    } catch (x) {
      setBusy(false);
      const c = x && (x.code || x.message);
      setErr(c === "invalid_code" ? "That code didn’t match. Try the newest one in your app." : c === "too_many_attempts" ? "Too many wrong codes. Wait 15 minutes, then try again." : crErr(x, "Couldn’t check that code."));
    }
  };
  const form = (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
      <div className="cr-ff">
        <label htmlFor="cr-code">{mode === "setup" ? "The code your app shows" : "Code from your authenticator app"}</label>
        <input id="cr-code" className="cr-gate-code" inputMode={/[a-f-]/i.test(code) ? "text" : "numeric"} autoComplete="one-time-code" maxLength={11} value={code}
               onChange={e => { setCode(e.target.value); setErr(""); }} aria-invalid={err ? true : undefined} aria-describedby={err ? "cr-code-err" : "cr-code-help"} autoFocus/>
        {!err && <span className="cr-ff-help" id="cr-code-help">Lost your phone? Type one of your backup codes instead.</span>}
        {err && <span className="cr-ff-err" id="cr-code-err" role="alert"><CrIcon n="warning-circle"/>{err}</span>}
      </div>
      <button type="submit" className="cr-btn is-primary" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Unlock Control Room"}</button>
    </form>
  );
  if (mode === "setup") return (
    <CrGateCard title="Set up two-step sign-in" lead="Scan this with your authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.">
      {setup ? (
        <>
          {qr ? <div style={{ width: 180, height: 180, alignSelf: "center" }} aria-label="QR code for your authenticator app" role="img" dangerouslySetInnerHTML={{ __html: qr }}/> : null}
          <div className="cr-ff"><span className="cr-ff-l">Can’t scan? Enter this key</span><code className="cr-mono" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{setup.secret}</code></div>
          {(setup.backupCodes || []).length > 0 && (
            <div className="cr-ff">
              <span className="cr-ff-l">Backup codes — save these now</span>
              <span className="cr-ff-help">Shown once. Each works one time if you lose your authenticator.</span>
              <div className="cr-mono" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>{setup.backupCodes.map(c => <span key={c}>{c}</span>)}</div>
            </div>
          )}
          {form}
        </>
      ) : err ? <div className="cr-err" role="alert"><CrIcon n="warning-circle"/><span>{err}</span></div> : <div className="cr-skel" style={{ height: 260 }}/>}
    </CrGateCard>
  );
  return (
    <CrGateCard title="Enter your 2FA code" lead={"You’re signed in as " + (member.fullName || "staff") + ". Enter the current code from your authenticator app to open the Control Room."}>
      {form}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <a href="/" className="cr-linkbtn" onClick={e => { e.preventDefault(); window.__navigate && window.__navigate("home"); }}>Back to the site</a>
        <button type="button" className="cr-linkbtn" onClick={() => auth.signOut()}>Not you? Sign out</button>
      </div>
    </CrGateCard>
  );
}

/** Which door the person is at. Returns null when they may come in. */
function CrGate({ auth, onUnlocked }) {
  if (auth.loading) return <div className="cr-gate"><div className="cr-gate-card"><div className="cr-skel" style={{ height: 220 }}/></div></div>;
  if (!auth.member || !auth.isAdmin) return (
    <CrGateCard title="Control Room" lead="This is where NGG staff run the programme. Sign in with your staff account to continue.">
      <button type="button" className="cr-btn is-primary" onClick={() => auth.openSignIn()}>Sign in</button>
      <a href="/" className="cr-linkbtn" onClick={e => { e.preventDefault(); window.__navigate && window.__navigate("home"); }}>Back to the site</a>
    </CrGateCard>
  );
  if (!auth.adminOk) return <CrTotp auth={auth} onDone={onUnlocked}/>;
  return null;
}
