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
  const [loading, setLoading] = React.useState(true);
  const [signinOpen, setSigninOpen] = React.useState(false);
  const [signinSeed, setSigninSeed] = React.useState(null); // { token } when coming from magic link

  // Boot — fetch /me + consume ?signin= magic link if present.
  React.useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const token = url.searchParams.get("signin");
        if (token) {
          try {
            const v = await NGGApi.auth.verify({ token });
            setMember(v.member);
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
          setAdminOk(Boolean(me.adminOk));
          // Conventional /login (or /signin) entry point: open the sign-in
          // modal for guests, send signed-in members to their dashboard.
          if (BOOT_WANTS_LOGIN) {
            if (me.member) {
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

  const ctx = {
    member,
    adminOk,
    loading,
    isSignedIn: !!member,
    // Any staff tier (editor/admin/super_admin) can open the console; caps
    // decide what's visible inside.
    isAdmin: !!member && Array.isArray(member.caps) && member.caps.length > 0,
    caps: (member && member.caps) || [],
    hasCap: (cap) => !!member && Array.isArray(member.caps) && member.caps.indexOf(cap) !== -1,
    openSignIn: (seed) => { setSigninSeed(seed || null); setSigninOpen(true); },
    closeSignIn: () => setSigninOpen(false),
    refresh: async () => {
      const me = await NGGApi.auth.me();
      setMember(me.member || null);
      setAdminOk(Boolean(me.adminOk));
    },
    signOut: async () => {
      try { await NGGApi.auth.logout(); } catch (_) {}
      setMember(null);
      setAdminOk(false);
      // Leave any members-only page (dashboard/admin) for home on sign-out.
      if (window.__navigate) window.__navigate("home");
    },
    setAdminOk: setAdminOk,
    onVerified: (m) => { setMember(m); setSigninOpen(false); },
  };

  return (
    <AuthCtx.Provider value={ctx}>
      {children}
      {signinOpen && (
        <SignInModal seed={signinSeed} onClose={ctx.closeSignIn} onVerified={ctx.onVerified}/>
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
  const [stage, setStage] = React.useState(seed && seed.token ? "enter-otp" : "id");
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [masked, setMasked] = React.useState("");
  const [busy, setBusy] = React.useState(false);
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
      const r = await NGGApi.auth.gateway(identifier.trim());
      if ((r.methods || []).includes("password")) { setStage("password"); }
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
      const r = await NGGApi.auth.login(identifier.trim(), password);
      onVerified(r.member);
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
    const r = await NGGApi.auth.request(identifier.trim());
    setMasked(r.masked || "");
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

  const verifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.auth.verify({ memberId: identifier.trim(), otp: otp.replace(/\s+/g, "") });
      onVerified(r.member);
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

  return (
    <div
      className="signin-scrim"
      onMouseDown={(e) => { scrimMouseDown.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (scrimMouseDown.current && e.target === e.currentTarget) onClose(); scrimMouseDown.current = false; }}
    >
      <div ref={cardRef} className="signin-card" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="signin-h">
        <button className="signin-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="signin-brand">
          <div className="signin-eyebrow">SIGN IN · MEMBERS ONLY</div>
          <div id="signin-h" className="signin-headline">
            {stage === "enter-otp" ? "Check your email." : "Welcome back."}
          </div>
          <div className="signin-sub">
            {stage === "id"
              ? "Your Member ID or email — we'll take it from there."
              : stage === "password"
                ? "Enter your password, or get a code by email instead."
                : masked ? <>We sent a magic link and a 6-digit code to <b>{masked}</b>. Either works.</>
                         : "Paste the 6-digit code from your email."}
          </div>
        </div>

        {stage === "id" && (
          <form onSubmit={continueId} className="signin-form">
            <label className="signin-label" htmlFor="signin-idp">Email or Member ID</label>
            <input
              id="signin-idp"
              ref={inputRef}
              className="signin-input"
              type="text"
              autoComplete="username"
              placeholder="you@email.com  or  NGG-2025-0042"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              minLength={3}
            />
            {err && <div className="signin-err">{err}</div>}
            <button className="btn btn-primary btn-lg signin-submit" type="submit" disabled={busy || identifier.trim().length < 3}>
              {busy ? "One moment…" : "Continue →"}
            </button>
            <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("enter-otp"); }}>
              I already have a code
            </button>
          </form>
        )}

        {stage === "password" && (
          <form onSubmit={loginPassword} className="signin-form">
            <div className="signin-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span>Signing in as <b>{identifier.trim()}</b></span>
              <button type="button" className="signin-link" style={{ margin: 0 }} onClick={() => { setErr(""); setPassword(""); setStage("id"); }}>Change</button>
            </div>
            <label className="signin-label" htmlFor="signin-pw">Password</label>
            <div className="signin-pw-wrap" style={{ position: "relative" }}>
              <input
                id="signin-pw"
                ref={inputRef}
                className="signin-input"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: 64 }}
              />
              <button
                type="button"
                className="signin-pw-toggle"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--ink-500)", letterSpacing: "0.06em" }}
              >{showPw ? "HIDE" : "SHOW"}</button>
            </div>
            {err && <div className="signin-err">{err}</div>}
            <button className="btn btn-primary btn-lg signin-submit" type="submit" disabled={busy || !identifier.trim() || !password}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>
            <button type="button" className="signin-link" onClick={requestLink} disabled={busy}>
              Email me a sign-in code instead
            </button>
          </form>
        )}

        {stage === "enter-otp" && (
          <form onSubmit={verifyOtp} className="signin-form">
            {!seed && (
              <>
                <label className="signin-label" htmlFor="signin-id2">Member ID</label>
                <input
                  id="signin-id2"
                  className="signin-input"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="NGG-2025-0042"
                  autoComplete="username"
                />
              </>
            )}
            {masked
              ? <p className="signin-hint" style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-500)" }}>We sent a 6-digit code to <b>{masked}</b>. It expires in 15 minutes.</p>
              : <p className="signin-hint" style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-500)" }}>Enter your ID above, then send yourself a fresh code.</p>}
            <label className="signin-label" htmlFor="signin-otp">6-digit code</label>
            <input
              id="signin-otp"
              ref={inputRef}
              className="signin-input signin-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              pattern="[0-9 ]*"
              placeholder="••• •••"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^\d ]/g, ""))}
              required
            />
            {err && <div className="signin-err">{err}</div>}
            <button className="btn btn-primary btn-lg signin-submit" type="submit" disabled={busy || otp.replace(/\s/g, "").length !== 6}>
              {busy ? "Verifying…" : "Sign in →"}
            </button>
            <button type="button" className="signin-link" onClick={sendCode} disabled={busy || cooldown > 0 || identifier.trim().length < 3}>
              {cooldown > 0 ? "Resend code in " + cooldown + "s" : (masked ? "Resend code" : "Send me a code")}
            </button>
            <button type="button" className="signin-link" onClick={() => { setStage("id"); setOtp(""); setErr(""); setCooldown(0); }}>
              ← Start over
            </button>
          </form>
        )}

        <div className="signin-foot">
          New here? <a href="#" onClick={(e) => { e.preventDefault(); onClose(); window.__navigate && window.__navigate("join"); }}>Apply for a session</a>
        </div>
      </div>
    </div>
  );
}

function humanizeAuthError(code) {
  const map = {
    rate_limited: "Too many tries. Wait a minute and try again.",
    invalid: "That code or link isn't valid. Request a fresh one.",
    expired: "Link or code expired. They're only good for 15 minutes — request a new one.",
    already_used: "That code was already used. Request a fresh one.",
    too_many_attempts: "Too many wrong tries on that code. Request a new one.",
    no_credentials: "Enter your code or click your magic link.",
    no_identifier: "Tell us your Member ID or email.",
    invalid_login: "That email/ID or password isn't right.",
    missing_credentials: "Enter your email/ID and password.",
    no_password: "No password set for this account yet. Use a sign-in code instead.",
    password_too_short: "Use at least 8 characters.",
    bad_current_password: "Your current password isn't right.",
    mail_failed: "We couldn't send the email. Check your inbox in a minute or contact admin.",
    member_gone: "We can't find that account. Contact admin.",
    suspended: "This account is suspended. Contact admin.",
    account_locked: "Too many failed tries — this account is paused for 15 minutes. Try again then, or use your email link.",
    identifier_too_short: "Tell us your Member ID or email.",
    bad_identifier_format: "That doesn't look like a Member ID or email — check it and try again.",
    unauthorized: "Sign in to continue.",
    admin_2fa_required: "Admin area needs a 2FA code.",
  };
  return map[code] || "Something went wrong. Try again.";
}

window.useAuth = useAuth;
window.AuthProvider = AuthProvider;
window.SignInModal = SignInModal;
