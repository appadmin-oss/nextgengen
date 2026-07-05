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
    isAdmin: !!member && (member.role === "admin" || member.role === "super_admin"),
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
  // Stage: 'password' (default) | 'enter-id' (request a code) | 'enter-otp'
  const [stage, setStage] = React.useState(seed && seed.token ? "enter-otp" : "password");
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [masked, setMasked] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(seed && seed.error ? humanizeAuthError(seed.error) : "");
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    document.body.classList.add("no-scroll");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [stage]);

  const loginPassword = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.auth.login(identifier.trim(), password);
      onVerified(r.member);
    } catch (e) {
      const code = e.code || e.message;
      // No password on this account yet → guide them to the code flow.
      if (code === "no_password") {
        setErr("No password set for this account yet. Use a sign-in code instead — you can set a password later from your dashboard.");
        setStage("enter-id");
      } else {
        setErr(humanizeAuthError(code));
      }
    } finally {
      setBusy(false);
    }
  };

  const requestLink = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.auth.request(identifier.trim());
      setMasked(r.masked || "");
      setStage("enter-otp");
    } catch (e) {
      setErr(humanizeAuthError(e.code || e.message));
    } finally {
      setBusy(false);
    }
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
      <div className="signin-card" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="signin-h">
        <button className="signin-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="signin-brand">
          <div className="signin-eyebrow">SIGN IN · MEMBERS ONLY</div>
          <div id="signin-h" className="signin-headline">
            {stage === "enter-otp" ? "Check your email." : "Welcome back."}
          </div>
          <div className="signin-sub">
            {stage === "password"
              ? "Sign in with your email or Member ID and password."
              : stage === "enter-id"
                ? "Enter your Member ID or the email on your record. We send a link + a 6-digit code."
                : masked ? <>We sent a magic link and a 6-digit code to <b>{masked}</b>. Either works.</>
                         : "Paste the 6-digit code from your email."}
          </div>
        </div>

        {stage === "password" && (
          <form onSubmit={loginPassword} className="signin-form">
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
            <label className="signin-label" htmlFor="signin-pw">Password</label>
            <div className="signin-pw-wrap" style={{ position: "relative" }}>
              <input
                id="signin-pw"
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
            <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("enter-id"); }}>
              Email me a sign-in code instead
            </button>
          </form>
        )}

        {stage === "enter-id" && (
          <form onSubmit={requestLink} className="signin-form">
            <label className="signin-label" htmlFor="signin-id">Member ID or email</label>
            <input
              id="signin-id"
              ref={inputRef}
              className="signin-input"
              type="text"
              autoComplete="username"
              placeholder="NGG-2025-0042  or  you@email.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              minLength={3}
            />
            {err && <div className="signin-err">{err}</div>}
            <button className="btn btn-primary btn-lg signin-submit" type="submit" disabled={busy || !identifier.trim()}>
              {busy ? "Sending…" : "Send me a code →"}
            </button>
            <button type="button" className="signin-link" onClick={() => setStage("enter-otp")}>
              I already have a code
            </button>
            <button type="button" className="signin-link" onClick={() => { setErr(""); setStage("password"); }}>
              ← Sign in with a password
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
            <button type="button" className="signin-link" onClick={() => { setStage("enter-id"); setOtp(""); }}>
              ← Back to send a code
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
    unauthorized: "Sign in to continue.",
    admin_2fa_required: "Admin area needs a 2FA code.",
  };
  return map[code] || "Something went wrong. Try again.";
}

window.useAuth = useAuth;
window.AuthProvider = AuthProvider;
window.SignInModal = SignInModal;
