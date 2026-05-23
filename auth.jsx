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
  // Stage: 'enter-id' → 'enter-otp' → 'verifying'
  const [stage, setStage] = React.useState(seed && seed.token ? "enter-otp" : "enter-id");
  const [identifier, setIdentifier] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [masked, setMasked] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(seed && seed.error ? humanizeAuthError(seed.error) : "");
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, [stage]);

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

  return (
    <div className="signin-scrim" onClick={onClose}>
      <div className="signin-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="signin-h">
        <button className="signin-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="signin-brand">
          <div className="signin-eyebrow">SIGN IN · MEMBERS ONLY</div>
          <div id="signin-h" className="signin-headline">
            {stage === "enter-id" ? "Welcome back." : "Check your email."}
          </div>
          <div className="signin-sub">
            {stage === "enter-id"
              ? "Enter your Member ID or the email on your record. We send a link + a 6-digit code."
              : masked ? <>We sent a magic link and a 6-digit code to <b>{masked}</b>. Either works.</>
                       : "Paste the 6-digit code from your email."}
          </div>
        </div>

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
