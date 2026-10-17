/* ================================================================
   NGG — Auth context + sign-in modal + URL token consumption.
   ================================================================ */

const AuthCtx = React.createContext({
  member: null,
  loading: true,
  signIn: async () => {},
  verify: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

function useAuth() {
  return React.useContext(AuthCtx);
}

// Capture the landing path at module load — before the router's mount effect
// rewrites it — so a visit to /login (or /signin) is still detectable in the
// async auth boot below.
const BOOT_PATH = (typeof window !== "undefined" ? (window.location.pathname || "/") : "/");
const BOOT_WANTS_LOGIN = BOOT_PATH === "/login" || BOOT_PATH === "/signin";

function AuthProvider({ children }) {
  const [member, setMember] = React.useState(null);
  const [adminOk, setAdminOk] = React.useState(false);
  const [sessionExp, setSessionExp] = React.useState(0);
  // When the IDLE clock runs out — the one that actually signs staff out.
  const [idleExp, setIdleExp] = React.useState(0);
  const [idleWarn, setIdleWarn] = React.useState(false);
  const [impersonating, setImpersonating] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [signinOpen, setSigninOpen] = React.useState(false);
  const [signinSeed, setSigninSeed] = React.useState(null); // { token } when coming from magic link
  /* The second sign-in step this session still owes (domain/mfa.php): '' none,
     'enroll', a step type, or 'ask' when a route said mfa_required first. While
     it is owed the app treats the person as not yet signed in — no screen
     loads their data only to be refused — and MfaHost asks for it. */
  const [mfaPending, setMfaPending] = React.useState("");

  // Boot — fetch /me + consume ?signin= magic link if present.
  React.useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const token = url.searchParams.get("signin");
        const resetToken = url.searchParams.get("reset");
        if (resetToken) {
          // Arrived from a "set your password" email — open the modal straight
          // on the new-password step; the token stands in for the code.
          setSigninOpen(true);
          setSigninSeed({ resetToken });
          url.searchParams.delete("reset");
          window.history.replaceState({}, "", url.toString());
          try {
            const me = await NGGApi.auth.me();
            setMember(me.member || null);
            setAdminOk(Boolean(me.adminOk));
            setImpersonating(me.impersonating || null);
          } catch (_) {}
        } else if (token) {
          try {
            const v = await NGGApi.auth.verify({ token });
            setMember(v.member);
            setMfaPending(v.mfa || "");
            setSigninOpen(false);
          } catch (e) {
            // Show the modal pre-filled, so they can retry with OTP
            setSigninOpen(true);
            setSigninSeed({ token, error: e.code || e.message });
          }
          url.searchParams.delete("signin");
          window.history.replaceState({}, "", url.toString());
        } else {
          const me = await NGGApi.auth.me();
          setMember(me.member || null);
          setMfaPending(me.mfaPending || "");
          setAdminOk(Boolean(me.adminOk));
          setSessionExp(me.sessionExp || 0);
          setIdleExp(me.idleExpiresAt || 0);
          setImpersonating(me.impersonating || null);
          // Conventional /login (or /signin) entry point: open the sign-in
          // modal for guests, send signed-in members to their dashboard.
          if (BOOT_WANTS_LOGIN) {
            if (me.member && !me.mfaPending) {
              // Coordinator-only accounts land in their own portal, not the
              // dashboard. summer_admin → Summer portal, club_admin → Club.
              const caps = me.member.caps || [];
              const hasConsole = ["content", "people", "inbox", "settings", "rbac"].some(c => caps.indexOf(c) !== -1);
              let dest = "dashboard";
              if (!hasConsole && caps.indexOf("summer") !== -1) dest = "summer-admin";
              else if (!hasConsole && caps.indexOf("club") !== -1) dest = "club-admin";
              setTimeout(() => window.__navigate && window.__navigate(dest), 0);
            } else { setSigninOpen(true); }
          }
        }
      } catch (_) {
        setMember(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Not signed in until the second step is passed (see mfaPending).
  const signedIn = mfaPending ? null : member;
  const ctx = {
    member: signedIn,
    adminOk,
    loading,
    isSignedIn: !!signedIn,
    // Any staff tier (editor/admin/super_admin) can open the console; caps
    // decide what's visible inside.
    isAdmin: !!signedIn && Array.isArray(signedIn.caps) && signedIn.caps.length > 0,
    caps: (signedIn && signedIn.caps) || [],
    hasCap: (cap) => !!signedIn && Array.isArray(signedIn.caps) && signedIn.caps.indexOf(cap) !== -1,
    openSignIn: (seed) => { setSigninSeed(seed || null); setSigninOpen(true); },
    closeSignIn: () => setSigninOpen(false),
    impersonating,
    stopImpersonating: async () => { try { await NGGApi.admin.members.stopImpersonate(); } catch (_) {} window.location.href = "/admin"; },
    sessionExp,
    refresh: async () => {
      const me = await NGGApi.auth.me();
      setMember(me.member || null);
      setMfaPending(me.mfaPending || "");
      setAdminOk(Boolean(me.adminOk));
      setSessionExp(me.sessionExp || 0);
      setIdleExp(me.idleExpiresAt || 0);
      setIdleWarn(false);
      setImpersonating(me.impersonating || null);
    },
    signOut: async () => {
      try { await NGGApi.auth.logout(); } catch (_) {}
      /* Unsent community drafts are per-person, and these are shared machines:
         children sign in with an ID card at a centre computer, so whatever was
         left in the composer was waiting in the box for whoever sat down next.
         Cleared here rather than in the composer, because the composer is not
         mounted at the moment that matters. */
      try {
        const stale = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf("ngg.cm.draft.") === 0) stale.push(k);
        }
        stale.forEach(k => localStorage.removeItem(k));
      } catch (_) {}
      setMember(null);
      setMfaPending("");
      setAdminOk(false);
      // Leave any members-only page (dashboard/admin) for home on sign-out.
      if (window.__navigate) window.__navigate("home");
    },
    setAdminOk: setAdminOk,
    // Lock the Control Room without signing out — re-entry needs only a fresh
    // 2FA code, not a full sign-in.
    lockAdmin: () => setAdminOk(false),
    onVerified: (m, mfa) => { setMember(m); setMfaPending(mfa || ""); setSigninOpen(false); },
  };

  /* Keep an ACTIVE session alive.
   *
   * Staff sessions expire after 30 minutes idle, and the server only counted
   * a request that changed something. An admin reading a roster, working
   * through a printed list or filling in a long form makes no such request,
   * so the clock ran out while they were sitting at the keyboard and the next
   * click dropped them at the sign-in screen.
   *
   * The heartbeat is gated on REAL interaction, which is the part that
   * matters: a laptop left open in a centre still locks on schedule, because
   * nobody has touched it. Only a person actually working keeps their session.
   *
   * Six minutes, against the server's five-minute write throttle and a
   * thirty-minute window — the write lands, and five heartbeats can be missed
   * before anyone is logged out. Nothing happens on a hidden tab or for a
   * signed-out visitor. */
  const lastActive = React.useRef(Date.now());
  React.useEffect(() => {
    if (!member) return;
    const mark = () => { lastActive.current = Date.now(); };
    const events = ["pointerdown", "keydown", "focus"];
    events.forEach(e => window.addEventListener(e, mark, { passive: true }));
    const beat = setInterval(() => {
      /* Interaction is the test, not tab visibility. An admin who tabs away to
         a spreadsheet or WhatsApp for half an hour and comes back to a sign-in
         screen has not been idle — they were working, with this console behind
         another window, which is how anybody actually uses two apps at once.
         A machine genuinely left alone still fails the interaction check and
         still locks on schedule, which is the property that matters.

         The window is generous (18 min against a 30-min timeout) so a person
         who is reading rather than clicking is not treated as absent. */
      if (Date.now() - lastActive.current > 18 * 60 * 1000) return;
      NGGApi.auth.me()
        .then(me => { setIdleExp(me.idleExpiresAt || 0); setIdleWarn(false); })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => {
      events.forEach(e => window.removeEventListener(e, mark));
      clearInterval(beat);
    };
  }, [member]);

  /* Warn before the clock runs out rather than after.
   *
   * Being signed out mid-sentence with a raw error code is the whole of the
   * complaint; the timeout itself is a policy the programme has chosen. A
   * countdown two minutes out turns an ambush into a question. */
  React.useEffect(() => {
    if (!member || !idleExp) { setIdleWarn(false); return; }
    const tick = () => {
      const left = idleExp * 1000 - Date.now();
      if (left <= 0) { setIdleWarn(false); return; }
      setIdleWarn(left <= 2 * 60 * 1000);
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [member, idleExp]);

  /* One place that knows what an expired session looks like.
   *
   * Every screen used to discover this on its own, from whichever call
   * happened to be in flight, and show the raw code — "session_expired" in a
   * red toast next to a half-filled form. Now the client is told once,
   * centrally, and can say what happened and offer the way back. */
  const memberRef = React.useRef(null);
  React.useEffect(() => { memberRef.current = member; }, [member]);
  React.useEffect(() => {
    const onExpired = () => {
      /* Only meaningful if we believed we WERE signed in. A 401 on a surface
         that never had a member session is routine — the gate desk fires its
         context request before auth has booted and gets one every single time,
         and a kiosk unlocked with a desk password has no member at all. Without
         this guard the sign-in modal opens over every field desk at startup,
         which is worse than the problem it was added to solve. */
      if (!memberRef.current) return;
      setMember(null); setAdminOk(false); setIdleExp(0); setIdleWarn(false);
      setSigninSeed({ error: "session_expired" });
      setSigninOpen(true);
    };
    window.addEventListener("ngg:session-expired", onExpired);
    // A route refused because the second step is owed: ask for it, wherever we are.
    const onMfa = () => { if (memberRef.current) setMfaPending(p => p || "ask"); };
    window.addEventListener("ngg:mfa-required", onMfa);
    return () => { window.removeEventListener("ngg:session-expired", onExpired); window.removeEventListener("ngg:mfa-required", onMfa); };
  }, []);

  const staySignedIn = async () => {
    try { const me = await NGGApi.auth.me(); setIdleExp(me.idleExpiresAt || 0); setIdleWarn(false); }
    catch (_) { setIdleWarn(false); }
  };

  return (
    <AuthCtx.Provider value={ctx}>
      {idleWarn && (
        <div role="alertdialog" aria-label="Session about to expire"
          style={{ position: "fixed", right: 16, bottom: 16, zIndex: 9998, maxWidth: 340,
            background: "#fff", color: "var(--ink-900,#0a1130)", border: "2px solid #f5b026",
            borderRadius: 14, padding: "14px 16px", boxShadow: "0 18px 44px -18px rgba(12,20,50,.5)" }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Still there?</div>
          <p style={{ fontSize: 13.5, margin: "0 0 10px", color: "var(--ink-700,#2a335c)" }}>
            You'll be signed out shortly for security. Anything unsaved stays on this device.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={staySignedIn} className="btn btn-primary btn-sm">Stay signed in</button>
            <button onClick={() => setIdleWarn(false)} className="btn btn-ghost btn-sm">Dismiss</button>
          </div>
        </div>
      )}
      {impersonating && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "#E4155F", color: "#fff", padding: "8px 16px", textAlign: "center", fontSize: 14, fontFamily: "Arial, sans-serif" }}>
          Viewing as <b>{member ? member.fullName : "member"}</b> — actions are performed as them.
          <button onClick={ctx.stopImpersonating} style={{ marginLeft: 12, background: "#fff", color: "#E4155F", border: "none", borderRadius: 6, padding: "3px 12px", fontWeight: 700, cursor: "pointer" }}>Stop</button>
        </div>
      )}
      {children}
      {signinOpen && (
        <SignInModal seed={signinSeed} onClose={ctx.closeSignIn} onVerified={ctx.onVerified}/>
      )}
      {/* Staff answer the console's own authenticator (cr-gate.jsx), and a
          participant's card session has no second step. */}
      {member && member.role !== "student" && !impersonating && typeof MfaHost === "function" && (
        <MfaHost id={member.memberId} pending={mfaPending}
          onCleared={() => { ctx.refresh().catch(() => setMfaPending("")); }}
          onSignOut={ctx.signOut}/>
      )}
    </AuthCtx.Provider>
  );
}

// ============================================================================
// Sign-in modal — magic link request OR OTP entry.
// ============================================================================

function SignInModal({ seed, onClose, onVerified }) {
  // One door (W1): 'id' → gateway decides → 'password' | 'enter-otp'.
  // The gateway never reveals account types — staff look like any member.
  const [stage, setStage] = React.useState(seed && seed.resetToken ? "reset-new" : (seed && seed.token ? "enter-otp" : "id"));
  const [identifier, setIdentifier] = React.useState(seed && seed.identifier ? seed.identifier : "");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  // Which sign-in methods the gateway offered for this identifier. Admins come
  // back password-only (no 'code'), so we hide the emailed-code fallback.
  const [methods, setMethods] = React.useState([]);
  const [otp, setOtp] = React.useState("");
  // Self-service password reset: a magic-link token (from ?reset=) skips the
  // code entry; otherwise the member types the emailed code + a new password.
  const [resetToken, setResetToken] = React.useState(seed && seed.resetToken ? seed.resetToken : "");
  const [newPw, setNewPw] = React.useState("");
  const [masked, setMasked] = React.useState("");
  const [deliveryOk, setDeliveryOk] = React.useState(true); // false ⇒ mail relay hiccup
  // A code was asked for this identifier. The server answers a real and an
  // unknown account alike (auth_find_member()), so this means "asked", never
  // "an account exists" — the copy below says "if there's an account".
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [remember, setRemember] = React.useState(true); // "stay signed in for 30 days"
  const [cooldown, setCooldown] = React.useState(0); // seconds until a code can be resent
  // Tick the resend cooldown down to zero.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const [err, setErr] = React.useState(seed && seed.error ? humanizeAuthError(seed.error) : "");
  const inputRef = React.useRef(null);
  const cardRef = React.useRef(null);
  // Honeypot: a field no person sees or can tab to. A script that fills every
  // input fills this one too, and the server turns it away.
  const [hp, setHp] = React.useState("");

  // Mount-only: lock scroll, remember prior focus, trap Tab, restore on close.
  React.useEffect(() => {
    document.body.classList.add("no-scroll");
    const prevFocus = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab" && cardRef.current) {
        const f = cardRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (_) {} }
    };
  }, []);
  // Autofocus the primary field whenever the stage changes.
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    return () => clearTimeout(t);
  }, [stage]);

  // Step 1: ask the server which methods apply to this identifier, then show
  // exactly one right next step — password if they have one, else send a code.
  const continueId = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.auth.gateway(authTidyId(identifier), hp);
      const m = r.methods || [];
      setMethods(m);
      if (m.includes("password")) { setStage("password"); }
      else { await requestLinkInner(); }
    } catch (e) {
      setErr(humanizeAuthError(e.code || e.message));
    } finally {
      setBusy(false);
    }
  };

  const loginPassword = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.auth.login(authTidyId(identifier), password, remember, hp);
      onVerified(r.member, r.mfa);
    } catch (e) {
      const code = e.code || e.message;
      if (code === "no_password") {
        // Race: password removed since the gateway answered. Fall back to code.
        try { await requestLinkInner(); } catch (e2) { setErr(humanizeAuthError(e2.code || e2.message)); }
      } else {
        setErr(humanizeAuthError(code));
      }
    } finally {
      setBusy(false);
    }
  };

  const requestLinkInner = async () => {
    const r = await NGGApi.auth.request(authTidyId(identifier), hp);
    setMasked(r.masked || "");
    setDeliveryOk(r.delivery !== false);
    setSent(true);
    setStage("enter-otp");
    setCooldown(30); // let the user resend after 30s
  };
  // Send / resend a code from the OTP screen (also rescues the "I already have
  // a code" path when no code was ever sent). Needs a valid identifier.
  const sendCode = async () => {
    if (busy || cooldown > 0 || identifier.trim().length < 3) return;
    setErr(""); setBusy(true);
    try { await requestLinkInner(); }
    catch (e) { setErr(humanizeAuthError(e.code || e.message)); }
    finally { setBusy(false); }
  };
  const requestLink = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try { await requestLinkInner(); }
    catch (e) { setErr(humanizeAuthError(e.code || e.message)); }
    finally { setBusy(false); }
  };

  // Password reset — step 1: email a set-password link + code, then show the
  // code + new-password screen. Reuses the identifier the member already typed.
  const sendReset = async (e) => {
    if (e) e.preventDefault();
    if (identifier.trim().length < 3) { setErr("Enter your email or member ID first."); return; }
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.auth.resetRequest(authTidyId(identifier), hp);
      setMasked(r.masked || "");
      setSent(true);
      setDeliveryOk(r.delivery !== false);
      setResetToken("");
      setStage("reset-new");
      setCooldown(30);
    } catch (e) { setErr(humanizeAuthError(e.code || e.message)); }
    finally { setBusy(false); }
  };
  // Password reset — step 2: set the new password (from the ?reset= token, or
  // the emailed code + member ID). On success the server signs the user in.
  const confirmReset = async (e) => {
    if (e) e.preventDefault();
    if (newPw.length < 8) { setErr("Use at least 8 characters."); return; }
    setErr(""); setBusy(true);
    try {
      const creds = resetToken
        ? { token: resetToken, password: newPw }
        : { memberId: authTidyId(identifier), otp: otp.replace(/\s+/g, ""), password: newPw };
      const r = await NGGApi.auth.resetConfirm(creds);
      onVerified(r.member, r.mfa);
    } catch (e) { setErr(humanizeAuthError(e.code || e.message)); }
    finally { setBusy(false); }
  };

  // `code` is passed when the sixth digit arrives, before the state has caught up.
  const verifyOtp = async (e, code) => {
    if (e) e.preventDefault();
    if (busy) return;
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.auth.verify({ memberId: authTidyId(identifier), otp: String(code || otp).replace(/\s+/g, ""), remember });
      onVerified(r.member, r.mfa);
    } catch (e) {
      setErr(humanizeAuthError(e.code || e.message));
    } finally {
      setBusy(false);
    }
  };

  // Only dismiss when the click *starts* on the scrim — protects against a
  // drag-select that began on the card and ended on the scrim accidentally
  // closing the modal mid-input.
  const scrimMouseDown = React.useRef(false);

  /* One job per screen: one field (or the code), one button, and at most one
     quiet way out. On the Control Room v2 design system (the --cr-* tokens,
     declared for .signin-scrim in styles-app.css). Errors sit under the field
     they are about. */
  const fieldErr = err ? <p role="alert" className="signin-ferr"><i className="ph ph-warning-circle" aria-hidden="true"/>{err}</p> : null;
  const submit = (label, off) => (
    <button className="signin-submit" type="submit" disabled={busy || off} aria-busy={busy || undefined}>
      {busy ? <span className="signin-spin" role="status" aria-label="Working"/> : label}
    </button>
  );
  const pwField = (id, value, onChange, autoComplete, ref, minLength) => (
    <div className="signin-pw">
      <input id={id} ref={ref} className={"signin-input" + (err ? " is-bad" : "")} type={showPw ? "text" : "password"} autoComplete={autoComplete}
        value={value} onChange={(e) => { setErr(""); onChange(e); }} required minLength={minLength} aria-invalid={!!err || undefined}/>
      <button type="button" className="signin-eye" onClick={() => setShowPw(v => !v)}
        aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}>
        <i className={"ph ph-" + (showPw ? "eye-slash" : "eye")} aria-hidden="true"/>
      </button>
    </div>
  );
  // Who is signing in, once they have said, with the way back to change it.
  const who = (
    <div className="signin-who">
      <span className="signin-who-av" aria-hidden="true">{(identifier.trim().charAt(0) || "?").toUpperCase()}</span>
      <span className="signin-who-id"><span className="cr-sr">Signing in as </span>{identifier.trim()}</span>
      <button type="button" className="signin-change" onClick={() => { setStage("id"); setOtp(""); setNewPw(""); setPassword(""); setResetToken(""); setErr(""); setCooldown(0); }}>Change</button>
    </div>
  );
  const resend = (onClick) => (
    <button type="button" className="signin-link" onClick={onClick} disabled={busy || cooldown > 0 || identifier.trim().length < 3}>
      {cooldown > 0 ? "Resend code in " + cooldown + "s" : "Resend code"}
    </button>
  );
  const knownId = identifier.trim().length >= 3 && (sent || masked || stage === "password");
  // Honest without being an oracle: true for a real account and an unknown one.
  // An unknown EMAIL is told by email that it has no account; a browser that
  // has signed in here before is told on screen (no_account) instead.
  const ifAccount = identifier.includes("@")
    ? "If there’s an NGG account for this email, we’ve emailed it a 6-digit code."
    : "If this is your Member ID, we’ve emailed a 6-digit code to the email on file.";
  const nothingYet = (
    <p className="signin-help signin-help--wait">
      {identifier.includes("@")
        ? "Nothing after a couple of minutes? Check spam and the spelling. If no account uses that email, we’ve emailed it to say so."
        : "Nothing after a couple of minutes? Check spam, or try the email you joined with."}
    </p>
  );

  const title = stage === "enter-otp" ? "Check your email"
    : stage === "password" ? "Welcome back"
    : (stage === "reset-request" || stage === "reset-new") ? "Set a new password" : "Sign in";
  const sub = stage === "id" ? "Use your email, Member ID or the ID on your card."
    : stage === "password" ? null
    : stage === "reset-request" ? "We’ll email you a code to set a new password."
    : stage === "reset-new" ? (resetToken ? "Choose a password. You’ll be signed in straight after." : sent ? <>{ifAccount} Enter it, then choose a password.</> : "Enter the code from your email, then choose a password.")
    : (sent && knownId) ? ifAccount : "Enter your Member ID and the 6-digit code from your email.";

  return (
    <div
      className="signin-scrim"
      onMouseDown={(e) => { scrimMouseDown.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (scrimMouseDown.current && e.target === e.currentTarget) onClose(); scrimMouseDown.current = false; }}
    >
      <div ref={cardRef} className="signin-card" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="signin-h" aria-describedby={sub ? "signin-sub" : undefined}>
        <button type="button" className="signin-close" onClick={onClose} aria-label="Close"><i className="ph ph-x" aria-hidden="true"/></button>
        <header className="signin-head">
          <img className="signin-logo" src="/assets/logo.png" alt="Next Generation Genius" width="40" height="40"/>
          <h2 id="signin-h" className="signin-headline">{title}</h2>
          {sub && <p id="signin-sub" className="signin-sub">{sub}</p>}
        </header>

        {stage === "id" && (
          <form onSubmit={continueId} className="signin-form" noValidate>
            <div className="signin-trap" aria-hidden="true">
              <label htmlFor="signin-hp">Leave this empty</label>
              <input id="signin-hp" name="ngg_hp" type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)}/>
            </div>
            <label className="signin-label" htmlFor="signin-idp">Email, Member ID or card ID</label>
            <input id="signin-idp" ref={inputRef} className={"signin-input" + (err ? " is-bad" : "")} type="text" autoComplete="username" spellCheck="false" autoCapitalize="none"
              placeholder="NGG-2025-0042" value={identifier} onChange={(e) => { setErr(""); setIdentifier(e.target.value); }} aria-invalid={!!err || undefined}
              onBlur={() => { const t = authTidyId(identifier); if (t && t !== identifier.trim().toLowerCase()) setIdentifier(t); }} aria-describedby="signin-idp-hint"/>
            <AuthIdHint value={identifier} onUse={(v) => { setErr(""); setIdentifier(v); }}/>
            {fieldErr}
            {submit("Continue", identifier.trim().length < 3)}
            <div className="signin-alts">
              <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("enter-otp"); }}>I have a code</button>
            </div>
          </form>
        )}

        {stage === "password" && (
          <form onSubmit={loginPassword} className="signin-form" noValidate>
            {who}
            <div className="signin-label-row">
              <label className="signin-label" htmlFor="signin-pw">Password</label>
              <button type="button" className="signin-link signin-link--sm" onClick={() => { setErr(""); setPassword(""); setStage("reset-request"); }}>Forgot?</button>
            </div>
            {pwField("signin-pw", password, (e) => setPassword(e.target.value), "current-password", inputRef)}
            {fieldErr}
            <label className="signin-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}/>
              <span>Keep me signed in on this device</span>
            </label>
            {submit("Sign in", !password)}
            {methods.includes("code") && (
              <div className="signin-alts">
                <button type="button" className="signin-link" onClick={requestLink} disabled={busy}>Email me a code instead</button>
              </div>
            )}
          </form>
        )}

        {stage === "enter-otp" && (
          <form onSubmit={verifyOtp} className="signin-form" noValidate>
            {seed ? null : knownId ? who : (
              <>
                <label className="signin-label" htmlFor="signin-id2">Member ID or email</label>
                <input id="signin-id2" ref={inputRef} className="signin-input" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="NGG-2025-0042" autoComplete="username" spellCheck="false" autoCapitalize="none"/>
              </>
            )}
            {!deliveryOk && <p className="signin-note"><i className="ph ph-envelope-simple" aria-hidden="true"/>The email may be slow to arrive. Check spam, or resend in a moment.</p>}
            <span className="signin-label" id="signin-otp-l">6-digit code</span>
            <SignInCode id="signin-otp" labelledBy="signin-otp-l" value={otp} bad={!!err} autoFocus={!!(seed || knownId)} inputRef={seed || knownId ? inputRef : null}
              onChange={(v) => { setErr(""); setOtp(v); }} onComplete={(v) => { if (identifier.trim().length >= 3 || seed) verifyOtp(null, v); }}/>
            {fieldErr || (sent && knownId && !seed ? nothingYet : null)}
            {submit("Sign in", otp.replace(/\s/g, "").length !== 6)}
            <div className="signin-alts">{resend(sendCode)}</div>
          </form>
        )}

        {stage === "reset-request" && (
          <form onSubmit={sendReset} className="signin-form" noValidate>
            <label className="signin-label" htmlFor="signin-rid">Member ID or email</label>
            <input id="signin-rid" ref={inputRef} className={"signin-input" + (err ? " is-bad" : "")} type="text" autoComplete="username" spellCheck="false" autoCapitalize="none"
              placeholder="NGG-2025-0042" value={identifier} onChange={(e) => { setErr(""); setIdentifier(e.target.value); }}/>
            {fieldErr}
            {submit("Email me a code", identifier.trim().length < 3)}
            <div className="signin-alts">
              <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("id"); }}>Back to sign in</button>
            </div>
          </form>
        )}

        {stage === "reset-new" && (
          <form onSubmit={confirmReset} className="signin-form" noValidate>
            {!deliveryOk && <p className="signin-note"><i className="ph ph-envelope-simple" aria-hidden="true"/>The email may be slow to arrive. Check spam, or resend in a moment.</p>}
            {!resetToken && (
              <>
                <span className="signin-label" id="signin-rotp-l">6-digit code</span>
                <SignInCode id="signin-rotp" labelledBy="signin-rotp-l" value={otp} bad={false} autoFocus inputRef={null}
                  onChange={(v) => { setErr(""); setOtp(v); }} onComplete={() => { const el = document.getElementById("signin-newpw"); if (el) el.focus(); }}/>
              </>
            )}
            <label className="signin-label" htmlFor="signin-newpw">New password</label>
            {pwField("signin-newpw", newPw, (e) => setNewPw(e.target.value), "new-password", resetToken ? inputRef : null, 8)}
            {fieldErr || <p className="signin-help">At least 8 characters.</p>}
            {!resetToken && sent && !fieldErr && nothingYet}
            {submit("Set password and sign in", newPw.length < 8 || (!resetToken && otp.replace(/\s/g, "").length !== 6))}
            {!resetToken && <div className="signin-alts">{resend(sendReset)}</div>}
          </form>
        )}

        <p className="signin-foot">
          New to NGG? <a href="/join" onClick={(e) => { e.preventDefault(); onClose(); window.__navigate && window.__navigate("join"); }}>Apply for a session</a>
        </p>
      </div>
    </div>
  );
}

/* The six-digit code as six boxes. Typing moves on, Backspace moves back,
   a paste or the phone's one-time-code autofill fills them all, and the
   sixth digit hands the code to onComplete — no extra press. */
function SignInCode({ id, labelledBy, value, onChange, onComplete, bad, autoFocus, inputRef }) {
  const refs = React.useRef([]);
  const digits = String(value || "").replace(/\D/g, "").slice(0, 6).split("");
  React.useEffect(() => { if (autoFocus && refs.current[0] && !inputRef) refs.current[0].focus(); }, []);
  const put = (from, text) => {
    const add = String(text || "").replace(/\D/g, "");
    if (!add) return;
    const next = digits.slice(0, from).concat(add.split("")).slice(0, 6);
    onChange(next.join(""));
    const at = Math.min(next.length, 5);
    if (refs.current[at]) refs.current[at].focus();
    if (next.length === 6) onComplete && onComplete(next.join(""));
  };
  return (
    <div className={"signin-code" + (bad ? " is-bad" : "")} role="group" aria-labelledby={labelledBy}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <input key={i} id={i === 0 ? id : undefined}
          ref={el => { refs.current[i] = el; if (i === 0 && inputRef) inputRef.current = el; }}
          className="signin-digit" type="text" inputMode="numeric" pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={i === 0 ? 6 : 1}
          aria-label={"Digit " + (i + 1) + " of 6"} value={digits[i] || ""}
          onFocus={e => e.target.select()}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) { onChange(digits.slice(0, i).concat(digits.slice(i + 1)).join("")); return; }
            put(i, v);
          }}
          onKeyDown={e => {
            if (e.key === "Backspace" && !digits[i] && i > 0) { e.preventDefault(); onChange(digits.slice(0, i - 1).join("")); refs.current[i - 1].focus(); }
            else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); refs.current[i - 1].focus(); }
            else if (e.key === "ArrowRight" && i < 5) { e.preventDefault(); refs.current[i + 1].focus(); }
          }}
          onPaste={e => { e.preventDefault(); put(i, (e.clipboardData || window.clipboardData).getData("text")); }}/>
      ))}
    </div>
  );
}

/* What the person typed, the way the server will read it (auth_clean_identifier):
   no invisible characters, dashes for the en dashes and spaces a printed card
   or a phone keyboard brings, no trailing full stop on an email. */
function authTidyId(raw) {
  let s = String(raw || "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[\u00A0\u2007\u202F]/g, " ").replace(/[\u2010-\u2015\u2212]/g, "-").trim().toLowerCase().replace(/^mailto:/, "");
  if (s.indexOf("@") !== -1) return s.replace(/\s+/g, "").replace(/[.,;]+$/, "");
  return s.replace(/[\s_.]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
}
/* Common slips in email domains, offered as one tap — never applied silently. */
const AUTH_DOMAIN_FIX = { "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com",
  "gmaill.com": "gmail.com", "gnail.com": "gmail.com", "yahoo.con": "yahoo.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "hotmial.com": "hotmail.com", "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "icloud.con": "icloud.com", "yahoo.co": "yahoo.com" };
function authIdIssue(raw) {
  const v = authTidyId(raw);
  if (v.length < 3) return null;
  if (v.indexOf("@") !== -1) {
    const [user, dom] = [v.slice(0, v.lastIndexOf("@")), v.slice(v.lastIndexOf("@") + 1)];
    if (!user || !dom || dom.indexOf(".") === -1) return { msg: "An email needs a name, an @ and a domain, like ada@gmail.com." };
    if (AUTH_DOMAIN_FIX[dom]) return { msg: "Did you mean", fix: user + "@" + AUTH_DOMAIN_FIX[dom] };
    return null;
  }
  if (!/^[a-z0-9]{2,8}(-[a-z0-9]{1,8}){1,3}$/.test(v)) return { msg: "IDs look like NGG-2025-0042, 026-014 or VOL-INS-26-001 — letters and numbers with dashes." };
  return null;
}
function AuthIdHint({ value, onUse }) {
  const issue = authIdIssue(value);
  if (!issue) return <span id="signin-idp-hint" className="signin-hint" aria-live="polite"></span>;
  return <span id="signin-idp-hint" className="signin-hint is-warn" aria-live="polite">{issue.msg}{issue.fix ? <> <button type="button" className="signin-link" onClick={() => onUse(issue.fix)}>{issue.fix}</button>?</> : null}</span>;
}

function humanizeAuthError(code) {
  const map = {
    rate_limited: "Too many tries. Wait a minute and try again.",
    // Only ever sent to a browser that has signed in here before (see
    // auth_find_member()); a stranger's browser gets the neutral screen.
    no_account: "We couldn’t find an account with that Member ID or email. Check it for typos, or apply below.",
    too_many_misses: "Too many sign-in attempts from this network. Try again in 30 minutes.",
    request_failed: "Something went wrong. Try again.",
    invalid: "That code isn’t right. Check it, or resend a new one.",
    bad_otp_format: "Enter the 6 digits from your email.",
    bad_member_id: "Check your Member ID (like NGG-2025-0042), or use your email.",
    expired: "Link or code expired. They're only good for 15 minutes — request a new one.",
    already_used: "That code was already used. Request a fresh one.",
    too_many_attempts: "Too many wrong tries on that code. Request a new one.",
    no_credentials: "Enter your code or click your magic link.",
    no_identifier: "Tell us your Member ID or email.",
    invalid_login: "That email/ID or password isn't right.",
    missing_credentials: "Enter your email/ID and password.",
    no_password: "No password set yet. Use “Set or reset a password”, or sign in with an email code.",
    use_password: "Admin accounts sign in with a password — email codes aren't available. Use your password, or “Forgot your password?” to set one.",
    password_too_short: "Use at least 8 characters.",
    password_too_long: "That password is too long (200 characters max).",
    account_suspended: "This account is suspended. Contact admin.",
    bad_current_password: "Your current password isn't right.",
    mail_failed: "We couldn't send the email. Check your inbox in a minute or contact admin.",
    member_gone: "We can't find that account. Contact admin.",
    suspended: "This account is suspended. Contact admin.",
    account_locked: "Too many failed tries — this account is paused for 15 minutes. Try again then, or use your email link.",
    identifier_too_short: "Tell us your Member ID or email.",
    bad_identifier_format: "That doesn't look like an email, a Member ID or a card ID — check it and try again.",
    unauthorized: "Sign in to continue.",
    no_email_use_card: "There’s no email on this card’s record. Sign in with your card and phone number, or ask your coordinator to add your email.",
    mfa_required: "Finish your second sign-in step to continue.",
    admin_2fa_required: "Admin area needs a 2FA code.",
  };
  return map[code] || "Something went wrong. Try again.";
}

window.useAuth = useAuth;
window.AuthProvider = AuthProvider;
window.SignInModal = SignInModal;
