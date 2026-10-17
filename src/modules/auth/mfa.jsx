/* Two-step sign-in, client side (api/_lib/domain/mfa.php).

   One dialog, three jobs:
     step    — the session still owes its second step: answer it, or sign out
     setup   — choose and set the second step (forced when the policy requires
               it and none is set; otherwise the person's own choice)
     manage  — see it, change it, or turn it off where that is allowed
   and one banner, MfaNudge, for anybody who has none. MfaHost wires both to a
   session: AuthProvider mounts it for members and the team, the family page
   mounts it with `family` for guardians.

   The step a person gets depends on who they are — a child gets a private
   question, the team an authenticator app or an emailed code, a guardian a
   family PIN — and the server decides it; this file only draws what it says. */

const MFA_ICON = { question: "chat-circle-dots", app: "device-mobile", email: "envelope-simple", pin: "password" };

function mfaErr(e, fallback) {
  const c = e && (e.code || e.message);
  const map = {
    wrong_answer: "That isn’t right. Try again — capitals and spaces don’t matter.",
    too_many_attempts: "Too many wrong tries. Sign-in is paused for 15 minutes. A coordinator or instructor can let you in sooner.",
    code_wrong: "That code didn’t match. Use the newest one.",
    current_wrong: "Your current answer or code isn’t right.",
    answer_too_short: "Make the answer at least 3 letters.",
    answer_is_name: "Pick an answer that isn’t your own name — anybody could guess that.",
    bad_question: "Write a question of at least 8 letters.",
    bad_pin: "The PIN is exactly 6 digits.",
    pin_too_easy: "That PIN is too easy to guess. Avoid 111111, 123456 and the like.",
    setup_expired: "Setup took too long. Start again.",
    no_email_on_file: "There is no email on your record. Ask your coordinator to add one, or pick another way.",
    mfa_required_by_policy: "NGG requires this for your account, so it can’t be turned off.",
    nothing_to_verify: "Nothing to confirm — you’re in.",
    not_available: "Two-step sign-in isn’t available for this account.",
    network: "No connection. Check your internet and try again.",
    timeout: "That took too long. Try again.",
  };
  return map[c] || fallback || "Something went wrong. Try again.";
}

/* The one input every step uses: six digits for codes and PINs, text for an answer. */
function MfaField({ id, kind, value, onChange, onComplete, bad, label, inputRef }) {
  if (kind === "question") {
    return (
      <>
        <label className="signin-label" htmlFor={id}>{label || "Your answer"}</label>
        <input id={id} ref={inputRef} className={"signin-input" + (bad ? " is-bad" : "")} type="text" autoComplete="off" spellCheck="false"
          value={value} onChange={e => onChange(e.target.value)} aria-invalid={bad || undefined}/>
      </>
    );
  }
  if (kind === "pin") {
    return (
      <>
        <label className="signin-label" htmlFor={id}>{label || "PIN"}</label>
        <input id={id} ref={inputRef} className={"signin-input signin-otp" + (bad ? " is-bad" : "")} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off"
          value={value} onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); onChange(v); if (v.length === 6 && onComplete) onComplete(v); }} aria-invalid={bad || undefined}/>
      </>
    );
  }
  return (
    <>
      <span className="signin-label" id={id + "-l"}>{label || "6-digit code"}</span>
      <SignInCode id={id} labelledBy={id + "-l"} value={value} bad={bad} autoFocus inputRef={inputRef} onChange={onChange} onComplete={onComplete}/>
    </>
  );
}

function MfaDialog({ mode: initialMode, family, forced, onDone, onSignOut, onClose }) {
  const [mode, setMode] = React.useState(initialMode);
  const [status, setStatus] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState("");
  const [chal, setChal] = React.useState(null);        // step: {type, question, masked}
  const [type, setType] = React.useState("");          // setup: chosen method
  const [setupData, setSetupData] = React.useState(null); // app: {secret, otpauth}; email: {masked}
  const [qr, setQr] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [ownQ, setOwnQ] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [current, setCurrent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [note, setNote] = React.useState("");
  // Backup codes just issued (shown once), and what to do after they are saved.
  const [codes, setCodes] = React.useState(null);
  const [codesNext, setCodesNext] = React.useState("saved");
  const [useBackup, setUseBackup] = React.useState(false);
  const cardRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const closable = !!onClose && !forced;

  const load = React.useCallback(async () => {
    setLoadErr(""); setStatus(null);
    try {
      const s = await NGGApi.auth.mfa.status(family);
      setStatus(s);
      // The desk let them in while this was open: nothing is owed any more.
      if (mode === "step" && !s.pending) { onDone && onDone("cleared"); return; }
      if (mode === "step") {
        const c = await NGGApi.auth.mfa.challenge(family);
        if (c.type === "enroll") { setMode("setup"); return; }
        setChal(c);
      }
      if (mode === "setup" && s.methods && s.methods.length === 1) setType(s.methods[0].id);
      if (mode === "setup" && s.questions && s.questions.length) setQuestion(s.questions[0]);
    } catch (e) { setLoadErr(mfaErr(e, "We couldn’t load your sign-in settings.")); }
  }, [mode, family]);
  React.useEffect(() => { load(); }, [load]);

  // Focus trap, Escape (only when it may close), focus restored on close.
  React.useEffect(() => {
    document.body.classList.add("no-scroll");
    const prev = document.activeElement;
    const onKey = e => {
      if (e.key === "Escape" && closable) { onClose(); return; }
      if (e.key === "Tab" && cardRef.current) {
        const f = cardRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("no-scroll"); window.removeEventListener("keydown", onKey); if (prev && prev.focus) try { prev.focus(); } catch (_) {} };
  }, [closable]);
  React.useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(t); }, [mode, type, chal, setupData, status]);

  // Begin a method that needs the server first: a secret to scan, or a code to email.
  React.useEffect(() => {
    if (mode !== "setup" || (type !== "app" && type !== "email")) { setSetupData(null); setQr(""); return; }
    let live = true;
    setSetupData(null); setErr("");
    NGGApi.auth.mfa.start(type, family).then(r => {
      if (!live) return;
      setSetupData(r);
      if (type === "app" && r.otpauth && typeof loadVendor === "function") {
        loadVendor("qrcode").then(q => { const g = q(0, "M"); g.addData(r.otpauth); g.make(); if (live) setQr(g.createSvgTag({ cellSize: 5, margin: 2, scalable: true })); }).catch(() => {});
      }
    }).catch(e => { if (live) setErr(mfaErr(e)); });
    return () => { live = false; };
  }, [mode, type]);

  const verify = async (e, v) => {
    if (e) e.preventDefault();
    const a = String(v != null ? v : answer).trim();
    if (!a || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.auth.mfa.verify(a, family);
      if (r && r.backupUsed && typeof toast !== "undefined") toast.info("Backup code used — " + r.backupLeft + " left. Make new ones under Two-step sign-in when you can.", "Signed in");
      onDone && onDone("passed");
    }
    catch (x) { setErr(mfaErr(x)); setAnswer(""); setBusy(false); }
  };
  const recheck = async () => {
    setBusy(true); setErr("");
    try {
      const s = await NGGApi.auth.mfa.status(family);
      if (!s.pending) { onDone && onDone("cleared"); return; }
      setErr("Not yet. Ask your coordinator or instructor to let you in, then press this again.");
    } catch (x) { setErr(mfaErr(x)); }
    setBusy(false);
  };
  const resend = async () => {
    setBusy(true); setErr("");
    try { const c = await NGGApi.auth.mfa.challenge(family); setChal(c); setNote("A new code is on its way" + (c.masked ? " to " + c.masked : "") + "."); }
    catch (x) { setErr(mfaErr(x)); }
    setBusy(false);
  };

  const enrolled = status && status.enrolled;
  const finish = async e => {
    if (e) e.preventDefault();
    if (busy) return;
    const data = { type };
    if (type === "question") {
      // Compared as words, the way the server will: case, spacing and punctuation never decide.
      const words = v => String(v || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (words(answer) !== words(confirm)) { setErr("The two answers don’t match."); return; }
      Object.assign(data, { question: question.trim(), answer });
    } else if (type === "pin") {
      if (answer !== confirm) { setErr("The two PINs don’t match."); return; }
      data.pin = answer;
    } else data.code = answer;
    if (enrolled && mode === "setup" && !forced) data.current = current;
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.auth.mfa.enroll(data, family);
      if (r && r.backupCodes && r.backupCodes.length) { setCodes(r.backupCodes); setCodesNext(forced ? "passed" : "saved"); setBusy(false); return; }
      onDone && onDone(forced ? "passed" : "saved");
    }
    catch (x) { setErr(mfaErr(x)); setBusy(false); }
  };
  const turnOff = async e => {
    if (e) e.preventDefault();
    setBusy(true); setErr("");
    try { await NGGApi.auth.mfa.off(current, family); onDone && onDone("off"); }
    catch (x) { setErr(mfaErr(x)); setBusy(false); }
  };
  const newCodes = async e => {
    if (e) e.preventDefault();
    setBusy(true); setErr("");
    try { const r = await NGGApi.auth.mfa.backup(current, family); setCodes(r.backupCodes || []); setCodesNext("codes"); }
    catch (x) { setErr(mfaErr(x)); }
    setBusy(false);
  };
  const codesText = () => "NGG backup codes — each works once\n\n" + (codes || []).join("\n") + "\n";
  const copyCodes = async () => {
    try { await navigator.clipboard.writeText(codesText()); setNote("Copied."); } catch (_) { setNote("Copy didn’t work here — write them down instead."); }
  };
  const downloadCodes = () => {
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([codesText()], { type: "text/plain" }));
      a.download = "ngg-backup-codes.txt"; document.body.appendChild(a); a.click(); a.remove();
    } catch (_) {}
  };
  const sendCurrentCode = async () => {
    try { const c = await NGGApi.auth.mfa.challenge(family); setNote("We emailed a code" + (c.masked ? " to " + c.masked : "") + "."); } catch (x) { setErr(mfaErr(x)); }
  };

  const fieldErr = err ? <p role="alert" className="signin-ferr"><i className="ph ph-warning-circle" aria-hidden="true"/>{err}</p> : null;
  const submit = (label, off) => (
    <button className="signin-submit" type="submit" disabled={busy || off} aria-busy={busy || undefined}>
      {busy ? <span className="signin-spin" role="status" aria-label="Working"/> : label}
    </button>
  );
  // "Your current answer" — asked before anything replaces or removes it.
  const currentField = enrolled ? (
    <div className="mfa-current">
      <MfaField id="mfa-cur" kind={status.type === "question" || status.type === "pin" ? status.type : "code"} value={current} onChange={v => { setErr(""); setCurrent(v); }}
        label={status.type === "question" ? "First, your current answer — " + (status.question || "") : status.type === "pin" ? "First, your current PIN" : "First, a code from your current " + (status.type === "app" ? "app" : "email")}/>
      {status.type === "email" && <button type="button" className="signin-link signin-link--sm" onClick={sendCurrentCode}>Email me a code</button>}
    </div>
  ) : null;

  let title = "Two-step sign-in", sub = null, body = null;
  const pinName = status && status.kind === "guardian" ? "family PIN" : "PIN";
  if (codes) {
    title = "Save your backup codes";
    sub = "Each one works once, in place of your second step — if you lose your phone or forget your answer. Keep them somewhere safe, not on this device only.";
    body = (
      <div className="signin-form">
        <ol className="mfa-codes" aria-label="Backup codes">{codes.map(c => <li key={c} className="mono">{c}</li>)}</ol>
        <div className="mfa-codes-act">
          <button type="button" className="signin-link" onClick={copyCodes}><i className="ph ph-copy" aria-hidden="true"/> Copy</button>
          <button type="button" className="signin-link" onClick={downloadCodes}><i className="ph ph-download-simple" aria-hidden="true"/> Download</button>
          <button type="button" className="signin-link" onClick={() => window.print()}><i className="ph ph-printer" aria-hidden="true"/> Print</button>
        </div>
        {note && <p className="signin-help" role="status">{note}</p>}
        <button type="button" className="signin-submit" onClick={() => { const next = codesNext; setCodes(null); setNote(""); if (next === "codes") { setCurrent(""); setMode("manage"); load(); } else onDone && onDone(next); }}>I’ve saved them</button>
      </div>
    );
  } else if (loadErr) {
    body = (
      <div className="mfa-state" role="alert">
        <p className="signin-help">{loadErr}</p>
        <button type="button" className="signin-submit" onClick={load}>Try again</button>
      </div>
    );
  } else if (!status || (mode === "step" && !chal)) {
    body = <div className="mfa-state" role="status" aria-live="polite"><span className="signin-spin" aria-hidden="true"/> Loading…</div>;
  } else if (mode === "step") {
    const t = useBackup ? "backup" : chal.type;
    title = t === "backup" ? "Use a backup code" : t === "question" ? "One more question" : t === "pin" ? "Your " + pinName : t === "app" ? "Code from your app" : "Check your email";
    sub = t === "backup" ? "One of the eight codes you saved when you set this up. Each works once." : t === "question" ? "So we know it’s really you." : t === "pin" ? "The six digits you chose for this account." : t === "app" ? "Open your authenticator app and type the code it shows for NGG." : <>We sent a code{chal.masked ? <> to <b>{chal.masked}</b></> : null}. It’s good for 10 minutes.</>;
    body = (
      <form onSubmit={verify} className="signin-form" noValidate>
        {t === "question" && <p className="mfa-q">{chal.question}</p>}
        {note && <p className="signin-note" role="status"><i className="ph ph-info" aria-hidden="true"/>{note}</p>}
        {t === "backup" ? (
          <>
            <label className="signin-label" htmlFor="mfa-bk">Backup code</label>
            <input id="mfa-bk" ref={inputRef} className={"signin-input signin-otp" + (err ? " is-bad" : "")} type="text" autoComplete="off" spellCheck="false" autoCapitalize="characters"
              placeholder="XXXX-XXXX" maxLength={9} value={answer} onChange={e => { setErr(""); setAnswer(e.target.value); }}/>
          </>
        ) : (
          <MfaField id="mfa-ans" kind={t === "question" || t === "pin" ? t : "code"} value={answer} bad={!!err} inputRef={inputRef}
            label={t === "pin" ? "Your " + pinName : undefined} onChange={v => { setErr(""); setAnswer(v); }} onComplete={v => verify(null, v)}/>
        )}
        {fieldErr}
        {submit("Continue", !answer.trim())}
        <div className="signin-alts mfa-alts">
          {t === "email" && <button type="button" className="signin-link" onClick={resend} disabled={busy}>Send a new code</button>}
          {(t === "question" || t === "pin") && <button type="button" className="signin-link" onClick={recheck} disabled={busy}>I’ve been let in by staff</button>}
          <button type="button" className="signin-link" onClick={() => { setUseBackup(b => !b); setAnswer(""); setErr(""); }}>{useBackup ? "Back to my usual step" : "Use a backup code"}</button>
          {onSignOut && <button type="button" className="signin-link" onClick={onSignOut}>Sign out</button>}
        </div>
        {(t === "question" || t === "pin") && <p className="signin-help mfa-help">Forgot it? A coordinator or instructor can let you in for 10 minutes from the Control Room, or reset it so you choose a new one.</p>}
      </form>
    );
  } else if (mode === "manage") {
    const m = (status.methods || []).find(x => x.id === status.type);
    title = "Two-step sign-in";
    sub = status.enrolled ? "Turned on. You’re asked for it each time you sign in." : "Not set up yet.";
    body = status.kind === "staff" ? (
      <div className="signin-form"><p className="signin-help">Staff accounts use the Control Room’s authenticator app. It is managed in Access &amp; roles.</p></div>
    ) : (
      <div className="signin-form">
        {status.enrolled ? (
          <div className="mfa-now">
            <i className={"ph ph-" + (MFA_ICON[status.type] || "shield-check")} aria-hidden="true"/>
            <div><b>{m ? m.label : status.type}</b>{status.question ? <span>{status.question}</span> : null}</div>
          </div>
        ) : <p className="signin-help">{status.required ? "NGG requires a second step for your account." : "Add one — it takes a minute."}</p>}
        {status.enrolled && (
          <div className="mfa-backup-line">
            <span><b>{status.backupLeft || 0}</b> backup code{status.backupLeft === 1 ? "" : "s"} left</span>
            <button type="button" className="signin-link signin-link--sm" onClick={() => { setErr(""); setCurrent(""); setMode("backup"); }}>Make new ones</button>
          </div>
        )}
        {fieldErr}
        <button type="button" className="signin-submit" onClick={() => { setErr(""); setAnswer(""); setConfirm(""); setType((status.methods || []).length === 1 ? status.methods[0].id : ""); setMode("setup"); }}>
          {status.enrolled ? "Change it" : "Set it up"}
        </button>
        {status.enrolled && !status.required && (
          <div className="signin-alts"><button type="button" className="signin-link" onClick={() => { setErr(""); setCurrent(""); setMode("off"); }}>Turn it off</button></div>
        )}
      </div>
    );
  } else if (mode === "backup") {
    title = "New backup codes";
    sub = "Your old codes stop working. You’ll see eight new ones once.";
    body = (
      <form onSubmit={newCodes} className="signin-form" noValidate>
        {currentField}
        {note && <p className="signin-help" role="status">{note}</p>}
        {fieldErr}
        {submit("Make new codes", !current.trim())}
        <div className="signin-alts"><button type="button" className="signin-link" onClick={() => setMode("manage")}>Back</button></div>
      </form>
    );
  } else if (mode === "off") {
    title = "Turn off two-step sign-in?";
    sub = "Your account will be protected by your sign-in alone.";
    body = (
      <form onSubmit={turnOff} className="signin-form" noValidate>
        {currentField}
        {note && <p className="signin-help" role="status">{note}</p>}
        {fieldErr}
        {submit("Turn it off", !current.trim())}
        <div className="signin-alts"><button type="button" className="signin-link" onClick={() => setMode("manage")}>Keep it on</button></div>
      </form>
    );
  } else {
    // setup
    const methods = status.methods || [];
    title = forced ? "Add a second sign-in step" : enrolled ? "Change your second step" : "Add a second sign-in step";
    sub = forced ? "NGG asks this of your account before you go on. It takes a minute." : "Something only you have, asked each time you sign in.";
    if (!type) {
      body = (
        <div className="signin-form">
          <fieldset className="mfa-pick">
            <legend className="signin-label">Choose one</legend>
            {methods.map(m => (
              <button key={m.id} type="button" className="mfa-opt" onClick={() => { setErr(""); setAnswer(""); setConfirm(""); setType(m.id); }}>
                <i className={"ph ph-" + (MFA_ICON[m.id] || "shield-check")} aria-hidden="true"/>
                <span><b>{m.label}</b><span>{m.blurb}</span></span>
              </button>
            ))}
          </fieldset>
          {forced && onSignOut && <div className="signin-alts"><button type="button" className="signin-link" onClick={onSignOut}>Sign out</button></div>}
        </div>
      );
    } else {
      const back = methods.length > 1 ? <button type="button" className="signin-link" onClick={() => { setType(""); setErr(""); }}>Choose another way</button> : null;
      let fields = null, ready = false;
      if (type === "question") {
        const qs = status.questions || [];
        fields = (
          <>
            <label className="signin-label" htmlFor="mfa-qsel">Your question</label>
            {!ownQ ? (
              <select id="mfa-qsel" className="signin-input mfa-select" value={question} onChange={e => { if (e.target.value === "__own") { setOwnQ(true); setQuestion(""); } else setQuestion(e.target.value); }}>
                {qs.map(q => <option key={q} value={q}>{q}</option>)}
                <option value="__own">Write my own question…</option>
              </select>
            ) : (
              <input id="mfa-qsel" className="signin-input" type="text" value={question} maxLength={140} placeholder="A question only you can answer" onChange={e => setQuestion(e.target.value)}/>
            )}
            <MfaField id="mfa-new" kind="question" value={answer} inputRef={inputRef} onChange={v => { setErr(""); setAnswer(v); }}/>
            <MfaField id="mfa-new2" kind="question" label="Type the answer again" value={confirm} onChange={v => { setErr(""); setConfirm(v); }}/>
            <p className="signin-help">Pick something you will remember in a year, that a friend could not guess. Capitals and spaces never matter.</p>
          </>
        );
        ready = question.trim().length >= 8 && answer.trim().length >= 3 && confirm.trim().length >= 3;
      } else if (type === "pin") {
        fields = (
          <>
            <MfaField id="mfa-pin" kind="pin" label={"Choose a 6-digit " + pinName} value={answer} inputRef={inputRef} onChange={v => { setErr(""); setAnswer(v); }}/>
            <MfaField id="mfa-pin2" kind="pin" label="Type it again" value={confirm} onChange={v => { setErr(""); setConfirm(v); }}/>
            <p className="signin-help">Not a birthday or 123456. You’ll be asked for it each time you sign in.</p>
          </>
        );
        ready = answer.length === 6 && confirm.length === 6;
      } else if (type === "app") {
        fields = !setupData ? <div className="mfa-state" role="status"><span className="signin-spin" aria-hidden="true"/> Preparing…</div> : (
          <>
            <ol className="mfa-steps">
              <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</li>
              <li>Scan this code, or type the key below.</li>
              <li>Enter the 6-digit code it shows.</li>
            </ol>
            {qr ? <div className="mfa-qr" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: qr }}/> : null}
            <p className="mfa-key"><span className="cr-sr">Setup key: </span>{(setupData.secret || "").replace(/(.{4})/g, "$1 ").trim()}</p>
            <a className="signin-link mfa-open" href={setupData.otpauth}>Open in my authenticator app</a>
            <MfaField id="mfa-app" kind="code" value={answer} onChange={v => { setErr(""); setAnswer(v); }} label="Code from your app"/>
          </>
        );
        ready = answer.replace(/\D/g, "").length === 6;
      } else if (type === "email") {
        fields = !setupData ? <div className="mfa-state" role="status"><span className="signin-spin" aria-hidden="true"/> Sending a code…</div> : (
          <>
            <p className="signin-help">We sent a code to <b>{setupData.masked}</b>. Type it here to confirm the address — you’ll get a fresh one each time you sign in with your card.</p>
            <MfaField id="mfa-em" kind="code" value={answer} inputRef={inputRef} onChange={v => { setErr(""); setAnswer(v); }}/>
          </>
        );
        ready = answer.replace(/\D/g, "").length === 6;
      }
      body = (
        <form onSubmit={finish} className="signin-form" noValidate>
          {!forced && currentField}
          {note && <p className="signin-help" role="status">{note}</p>}
          {fields}
          {fieldErr}
          {submit(enrolled && !forced ? "Save the change" : "Turn it on", !ready || (enrolled && !forced && !current.trim()))}
          <div className="signin-alts mfa-alts">{back}{forced && onSignOut ? <button type="button" className="signin-link" onClick={onSignOut}>Sign out</button> : null}</div>
        </form>
      );
    }
  }

  return (
    <div className="signin-scrim mfa-scrim" onMouseDown={e => { if (closable && e.target === e.currentTarget) onClose(); }}>
      <div ref={cardRef} className="signin-card" role="dialog" aria-modal="true" aria-labelledby="mfa-h" aria-describedby={sub ? "mfa-sub" : undefined} onMouseDown={e => e.stopPropagation()}>
        {closable && <button type="button" className="signin-close" onClick={onClose} aria-label="Close"><i className="ph ph-x" aria-hidden="true"/></button>}
        <header className="signin-head">
          <span className="mfa-badge" aria-hidden="true"><i className="ph ph-shield-check"/></span>
          <h2 id="mfa-h" className="signin-headline">{title}</h2>
          {sub && <p id="mfa-sub" className="signin-sub">{sub}</p>}
        </header>
        {body}
      </div>
    </div>
  );
}

/* Shown under webdriver only when a test forces it — the same rule the tours use. */
function mfaNudgeAuto() {
  try { if (localStorage.getItem("ngg.mfa.force") === "1") return true; } catch (_) {}
  return !(typeof navigator !== "undefined" && navigator.webdriver);
}
function mfaLaterKey(id) { return "ngg.mfa.later." + id; }

/* The alert for anybody without a second step. Required: it says so and does
   not go away for long. Optional: "Not now" hides it for three days. */
function MfaNudge({ id, family, onSetUp }) {
  const [st, setSt] = React.useState(null);
  const [hidden, setHidden] = React.useState(() => {
    try { return Number(localStorage.getItem(mfaLaterKey(id)) || 0) > Date.now(); } catch (_) { return false; }
  });
  React.useEffect(() => {
    if (!id || hidden || !mfaNudgeAuto()) return;
    let live = true;
    NGGApi.auth.mfa.status(family).then(s => { if (live) setSt(s); }).catch(() => {});
    const again = () => NGGApi.auth.mfa.status(family).then(s => { if (live) setSt(s); }).catch(() => {});
    window.addEventListener("ngg:mfa-changed", again);
    return () => { live = false; window.removeEventListener("ngg:mfa-changed", again); };
  }, [id, hidden, family]);
  if (!st || hidden || st.enrolled || st.policy === "off" || st.kind === "staff" || !st.methods || !st.methods.length) return null;
  const copy = st.kind === "team"
    ? "You work with children’s records. Add a second sign-in step — an authenticator app or an emailed code."
    : st.kind === "guardian" ? "Add a family PIN so only you can open your children’s records."
    : "Keep your account yours: add a private question to your sign-in.";
  const later = () => {
    try { localStorage.setItem(mfaLaterKey(id), String(Date.now() + (st.required ? 1 : 3) * 86400000)); } catch (_) {}
    setHidden(true);
  };
  return (
    <aside className={"mfa-nudge" + (st.required ? " is-required" : "")} role="region" aria-label="Account security" aria-live="polite">
      <i className="ph ph-shield-warning mfa-nudge-ic" aria-hidden="true"/>
      <div className="mfa-nudge-txt">
        <b>{st.required ? "Two-step sign-in is required for your account" : "Your account has no second sign-in step"}</b>
        <span>{copy}{st.required ? " You’ll be asked to set it up at your next sign-in." : ""}</span>
      </div>
      <div className="mfa-nudge-act">
        <button type="button" className="mfa-nudge-go" onClick={onSetUp}>Set it up</button>
        <button type="button" className="mfa-nudge-later" onClick={later}>Not now</button>
      </div>
    </aside>
  );
}

/* Wires the dialog and the banner to one session.
   pending: the step the session owes ('' none · 'enroll' · a type · 'ask'
   when a route said mfa_required and we have not asked which yet). */
function MfaHost({ id, pending, family, onCleared, onSignOut }) {
  const [open, setOpen] = React.useState(null); // null | 'setup' | 'manage'
  const [toast, setToast] = React.useState("");
  React.useEffect(() => {
    if (!id) return;
    window.nggMfa = (m) => setOpen(m || "manage");
    // From the reminder email: /?mfa=setup
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("mfa") === "setup" && !pending) {
        setOpen("setup");
        u.searchParams.delete("mfa"); window.history.replaceState({}, "", u.toString());
      }
    } catch (_) {}
    return () => { if (window.nggMfa) delete window.nggMfa; };
  }, [id, pending]);
  React.useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); }, [toast]);

  if (!id) return null;
  if (pending) {
    return <MfaDialog key={"p-" + pending} mode={pending === "enroll" ? "setup" : "step"} forced family={family}
      onDone={() => { try { window.dispatchEvent(new CustomEvent("ngg:mfa-changed")); } catch (_) {} onCleared && onCleared(); }} onSignOut={onSignOut}/>;
  }
  return (
    <>
      <MfaNudge id={id} family={family} onSetUp={() => setOpen("setup")}/>
      {open && <MfaDialog key={open} mode={open} family={family} onClose={() => setOpen(null)}
        onDone={(how) => {
          setOpen(null);
          setToast(how === "off" ? "Two-step sign-in is off." : "Two-step sign-in is on.");
          try { window.dispatchEvent(new CustomEvent("ngg:mfa-changed")); } catch (_) {}
        }}/>}
      {toast && <div className="mfa-toast" role="status" aria-live="polite">{toast}</div>}
    </>
  );
}

window.MfaHost = MfaHost;
window.MfaDialog = MfaDialog;
