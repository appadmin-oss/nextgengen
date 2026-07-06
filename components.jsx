/* ================================================================
   NGG — Shared components
   Loaded as type=text/babel after React + data.js + photos.js
   ================================================================ */
const { useState, useEffect, useRef, useMemo } = React;

/* ---- Shared public-data hooks ----
   One fetch per visit, shared by every component that asks (hero badges,
   flagship calendar, footer status, join page). Cache lives at module
   scope so route changes don't refetch. */
const _pubCache = {};
const _pubInflight = {};
function usePublicData(key, fetcher) {
  const [data, setData] = React.useState(_pubCache[key] !== undefined ? _pubCache[key] : null);
  React.useEffect(() => {
    if (_pubCache[key] !== undefined) return;
    let alive = true;
    if (!_pubInflight[key]) {
      _pubInflight[key] = fetcher()
        .then(d => { _pubCache[key] = d; return d; })
        .catch(() => { _pubCache[key] = null; return null; });
    }
    _pubInflight[key].then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [key]);
  return data;
}

/* Current (or next) session — { code, year, name, startDate, endDate,
   isActive, weekOf, totalWeeks } or null. */
function useSession() {
  return usePublicData("session", () =>
    NGGApi.public.session().then(r => r.current || r.next || null));
}

/* Public stats — { activeMembers, missionsVerified, mentors, centres … } or null. */
function useStats() {
  return usePublicData("stats", () =>
    NGGApi.public.stats().then(r => r.stats || null));
}

/* Human session label, e.g. "SUM · 2026" → falls back to given text. */
function sessionLabel(session, fallback) {
  if (!session) return fallback;
  return (session.name || session.code) + " " + session.year;
}

/* Days until the session starts (0 when live or past). */
function sessionDaysToStart(session) {
  if (!session || !session.startDate) return 0;
  const d = Math.ceil((new Date(session.startDate) - new Date()) / 86400000);
  return Math.max(0, d);
}

/* ---- Brand mark — uses actual logo PNG ---- */
function BrandLogo({ size = 36, style = {} }) {
  return (
    <img
      src="assets/logo.png"
      alt="Next Generation Genius"
      width={size}
      height={size}
      style={{ display: "block", borderRadius: "50%", ...style }}
    />
  );
}

/* ---- Avatar — DiceBear persona illustrated portrait ---- */
function Avatar({ seed = 0, name = "", size = 44, ring = false, square = false }) {
  const src = portrait(name || String(seed), Math.max(120, size * 2));
  const node = (
    <div style={{
      width: size, height: size,
      borderRadius: square ? 14 : "50%",
      overflow: "hidden",
      flexShrink: 0,
      background: "var(--navy-700)",
      position: "relative",
    }}>
      <img src={src} alt={name} loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
  return ring ? <div className="glow-ring" style={{display:"inline-block"}}>{node}</div> : node;
}

/* ---- Photo — cinematic real image with optional caption + gradient ---- */
function Photo({ src, name, label, ratio = "1/1", style = {}, overlay = false, dark = false, children, eager = false }) {
  const url = src || (name ? scene(name, 1200) : null);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // Stable accent stripe based on the source — gives broken/loading images
  // a recognizable identity instead of a flat block.
  const tint = React.useMemo(() => {
    const s = String(url || name || label || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const palette = dark
      ? ["#1c2a5e", "#2a3a7a", "#131e48", "#1a2454"]
      : ["#f3ecdb", "#e8dec6", "#fbf7ed", "#f5e9c8"];
    return palette[Math.abs(h) % palette.length];
  }, [url, name, label, dark]);

  return (
    <div
      className={"photo-frame " + (loaded ? "is-loaded " : "") + (failed ? "is-failed " : "")}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      style={{
        position: "relative",
        aspectRatio: ratio,
        overflow: "hidden",
        borderRadius: 18,
        background: tint,
        ...style,
        maxWidth: "100%",
      }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={label || name || ""}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchpriority={eager ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(true); setFailed(true); }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: dark ? "brightness(0.85)" : "none",
          }}
        />
      ) : null}
      {/* Skeleton shimmer while the photo is in flight */}
      {!loaded && url && (
        <div className="photo-skel" aria-hidden="true"/>
      )}
      {/* Graceful fallback when the host blocks the image — keeps the
          composition (chip / overlay copy) readable instead of a broken icon. */}
      {failed && (
        <div className="photo-fallback" aria-hidden="true">
          <span className="photo-fallback-mark">◈</span>
        </div>
      )}
      {overlay && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, transparent 35%, rgba(12,20,50,0.78) 100%)"
        }}/>
      )}
      {children}
    </div>
  );
}

/* Old PhotoSlot kept for legacy uses — now silently renders a Photo. */
function PhotoSlot({ label, dark, ratio = "1/1", style, children, name }) {
  return <Photo name={name} label={label} ratio={ratio} dark={dark} style={style}>{children}</Photo>;
}

/* ---- Animated count-up ---- */
function CountUp({ to, duration = 1400, suffix = "" }) {
  const [val, setVal] = useState(0);
  const ref = useRef();
  useEffect(() => {
    let started = false;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started) return;
      started = true;
      const target = parseInt(String(to).replace(/[^0-9]/g, "")) || 0;
      const start = performance.now();
      function tick(t) {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);
  const orig = String(to);
  const hasPlus = orig.endsWith("+");
  const padded = orig.startsWith("0") && val > 0 ? String(val).padStart(orig.replace("+","").length, "0") : String(val);
  return <span ref={ref} className="kpi-num">{padded}{hasPlus ? "+" : ""}{suffix}</span>;
}

/* ---- Chip ---- */
function Tag({ children, variant = "" }) { return <span className={"chip " + variant}>{children}</span>; }

/* ---- Section header ---- */
function SectionHead({ eyebrow, title, sub, align = "left" }) {
  const baseStyle = align === "center" ? { margin: "0 auto 48px", textAlign: "center", alignItems: "center" } : {};
  return (
    <div className="section-h reveal" data-reveal style={baseStyle}>
      {eyebrow && <span className="eyebrow reveal" data-reveal style={{ color: "var(--gold-500)", "--reveal-delay": "0ms" }}>{eyebrow}</span>}
      <h2 className="reveal" data-reveal style={{ "--reveal-delay": "120ms" }}>{title}</h2>
      {sub && <p className="reveal" data-reveal style={{ fontSize: 17, color: "var(--ink-500)", margin: 0, lineHeight: 1.5, maxWidth: 640, "--reveal-delay": "240ms" }}>{sub}</p>}
    </div>
  );
}

/* ---- Progress bar w/ label ---- */
function Progress({ value, label, variant = "" }) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:6, width:"100%"}}>
      {label && <div style={{display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--ink-500)"}}>
        <span>{label}</span><span className="mono">{value}%</span>
      </div>}
      <div className={"progress " + variant}>
        <i style={{ width: `${value}%`, transition: "width 0.8s cubic-bezier(0.2,0.7,0.2,1)" }} />
      </div>
    </div>
  );
}

/* ---- Mobile drawer auth block ---- */
function DrawerAuthBlock({ go, close }) {
  const { isSignedIn, member, openSignIn, signOut, isAdmin } = useAuth();
  if (!isSignedIn) {
    return (
      <button className="nav-link" onClick={() => { close(); openSignIn(); }}>
        Sign in →
      </button>
    );
  }
  return (
    <React.Fragment>
      <div className="drawer-auth">
        <div className="drawer-auth-avatar">{(member.fullName || "M").charAt(0)}</div>
        <div>
          <div className="drawer-auth-name">{member.fullName}</div>
          <div className="mono drawer-auth-id">{member.memberId}</div>
        </div>
      </div>
      <button className="nav-link" onClick={() => go("dashboard")}>Dashboard</button>
      {isAdmin && <button className="nav-link nav-link-admin" onClick={() => go("admin")}>⚙ Admin console</button>}
      <button className="nav-link nav-link-danger" onClick={async () => { close(); await signOut(); }}>Sign out</button>
    </React.Fragment>
  );
}

/* ---- Top nav auth slot: shows Sign-in button OR member chip + menu. ---- */
function NavAuthSlot({ setPage }) {
  const { isSignedIn, member, loading, openSignIn, signOut, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (loading) {
    return <div className="nav-auth-loading" aria-hidden="true"/>;
  }
  if (!isSignedIn) {
    return (
      <button className="btn btn-ghost btn-sm nav-signin" onClick={() => openSignIn()}>
        Sign in
      </button>
    );
  }
  const first = String(member.fullName || member.memberId || "M").split(" ")[0];
  const initial = first.charAt(0).toUpperCase();
  return (
    <div className="nav-auth" ref={menuRef}>
      <button className="nav-auth-trigger" onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen}>
        <span className="nav-auth-avatar">{initial}</span>
        <span className="nav-auth-name">{first}</span>
        <span className="nav-auth-chevron" aria-hidden="true">▾</span>
      </button>
      {menuOpen && (
        <div className="nav-auth-menu" role="menu">
          <div className="nav-auth-menu-head">
            <div className="nav-auth-menu-name">{member.fullName}</div>
            <div className="mono nav-auth-menu-id">{member.memberId}</div>
          </div>
          <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); setPage("dashboard"); }}>Dashboard</button>
          <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); setPage("anchor"); }}>Anchor 12</button>
          <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); setPage("book"); }}>The Anchor book</button>
          {isAdmin && (
            <button className="nav-auth-menu-item nav-auth-menu-admin" onClick={() => { setMenuOpen(false); setPage("admin"); }}>
              <span>⚙</span> Admin console
            </button>
          )}
          <div className="nav-auth-menu-divider"/>
          <button className="nav-auth-menu-item nav-auth-menu-danger" onClick={async () => { setMenuOpen(false); await signOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ---- Top nav ---- */
function TopNav({ page, setPage }) {
  // Primary nav structure — 4 top-level entries plus the right-rail.
  // `mega` items expand to a rich dropdown panel.
  const primary = [
    { id: "home", label: "Home", kind: "link" },
    { id: "programs", kind: "mega", label: "Programs", match: ["summer","club","anchor","book"], items: [
      { id: "anchor",  label: "Anchor 12",       desc: "12-week flagship",         icon: "✦", badge: "FLAGSHIP" },
      { id: "summer",  label: "Summer Students", desc: "The on-ramp · 6 weeks",    icon: "☀" },
      { id: "club",    label: "NGGC",             desc: "Identity society",         icon: "◐" },
      { id: "book",    label: "The Anchor book", desc: "Field manual",              icon: "▢" },
    ]},
    { id: "stay", kind: "mega", label: "The room", match: ["blog","media","volunteers","parents"], items: [
      { id: "blog",       label: "The Journal",     desc: "Stories + essays",        icon: "✎" },
      { id: "media",      label: "Media room",      desc: "Films · podcast · reels", icon: "▶" },
      { id: "mentors",    label: "The mentors",     desc: "Meet the mentor circle",  icon: "◐" },
      { id: "volunteers", label: "Become a mentor", desc: "Volunteer with NGG",      icon: "✚" },
      { id: "parents",    label: "For parents",     desc: "Safeguarding · FAQ",      icon: "♡" },
    ]},
  ];

  const [open, setOpen]       = React.useState(false);
  const [mega, setMega]       = React.useState(null);   // active mega panel id
  const [scrolled, setScroll] = React.useState(false);
  const navRef = React.useRef(null);
  const megaTimer = React.useRef(0);

  // Scroll-state — apply solid background when not at top.
  React.useEffect(() => {
    const onScroll = () => setScroll(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Body scroll lock when drawer open
  React.useEffect(() => {
    document.body.classList.toggle("no-scroll", open);
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  // Close drawer + mega on Escape
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); setMega(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside the mega closes it.
  React.useEffect(() => {
    if (!mega) return;
    const onDoc = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setMega(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mega]);

  const go = (id) => { setPage(id); setOpen(false); setMega(null); };

  // Hover-intent: small open delay, longer close delay so cursor can travel.
  const openMega  = (id) => { clearTimeout(megaTimer.current); megaTimer.current = setTimeout(() => setMega(id), 60); };
  const closeMega = ()   => { clearTimeout(megaTimer.current); megaTimer.current = setTimeout(() => setMega(null), 180); };

  const isItemActive = (item) =>
    page === item.id || (item.kind === "mega" && item.match && item.match.indexOf(page) !== -1);

  return (
    <React.Fragment>
      <div ref={navRef} role="banner" className={"topnav" + (scrolled ? " is-scrolled" : "") + (mega ? " has-mega" : "")}>
        <div className="topnav-inner">
          <a className="brand" onClick={() => go("home")} role="link" tabIndex={0} aria-label="Next Generation Genius — Home">
            <BrandLogo size={42}/>
            <div className="brand-word">
              <b>Next Generation Genius</b>
              <span>Afrovanguard · est. 2024</span>
            </div>
          </a>

          <nav className="nav-links" aria-label="Primary navigation">
            {primary.map(item => {
              const active = isItemActive(item);
              if (item.kind === "mega") {
                return (
                  <div
                    key={item.id}
                    className="nav-mega-wrap"
                    onMouseEnter={() => openMega(item.id)}
                    onMouseLeave={closeMega}
                  >
                    <button
                      className={"nav-link nav-link-mega" + (active ? " active" : "") + (mega === item.id ? " is-expanded" : "")}
                      onClick={() => setMega(m => m === item.id ? null : item.id)}
                      aria-haspopup="true"
                      aria-expanded={mega === item.id}
                    >
                      {item.label}
                      <span className="nav-link-chev" aria-hidden="true">▾</span>
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={item.id}
                  className={"nav-link" + (active ? " active" : "")}
                  onClick={() => { setPage(item.id); setMega(null); }}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="nav-right">
            <NavAuthSlot setPage={setPage}/>
            <Magnetic strength={6}>
              <button className="btn btn-primary btn-sm nav-apply" onClick={() => setPage("join")}>Apply →</button>
            </Magnetic>
            <button
              className={"nav-burger" + (open ? " is-open" : "")}
              onClick={() => setOpen(v => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              <span className="nav-burger-bars" aria-hidden="true">
                <span/><span/><span/>
              </span>
            </button>
          </div>
        </div>

        {/* Mega panels — rendered inside the nav so hover-bridging works. */}
        {primary.map(item => {
          if (item.kind !== "mega") return null;
          const isOpen = mega === item.id;
          return (
            <div
              key={item.id}
              className={"nav-mega" + (isOpen ? " is-open" : "")}
              onMouseEnter={() => openMega(item.id)}
              onMouseLeave={closeMega}
              aria-hidden={!isOpen}
            >
              <div className="nav-mega-inner">
                <div className="nav-mega-grid">
                  {item.items.map(sub => (
                    <button
                      key={sub.id}
                      className={"nav-mega-item" + (page === sub.id ? " is-active" : "")}
                      onClick={() => go(sub.id)}
                    >
                      <span className="nav-mega-icon" aria-hidden="true">{sub.icon}</span>
                      <span className="nav-mega-body">
                        <span className="nav-mega-label">
                          {sub.label}
                          {sub.badge && <span className="nav-mega-badge">{sub.badge}</span>}
                        </span>
                        <span className="nav-mega-desc">{sub.desc}</span>
                      </span>
                      <span className="nav-mega-arrow" aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
                <div className="nav-mega-foot">
                  <span className="mono">PRESS <kbd>⌘</kbd><kbd>K</kbd> FOR QUICK NAV</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => go("join")}>Apply for a session →</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile drawer */}
      <div className={"mobile-drawer" + (open ? " is-open" : "")} role="dialog" aria-modal="true">
        <div className="mobile-drawer-scrim" onClick={() => setOpen(false)}/>
        <div className="mobile-drawer-panel">
          <div className="mobile-drawer-head">
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <BrandLogo size={34}/>
              <div className="brand-word">
                <b style={{fontFamily:"var(--font-display)", fontSize:15, fontWeight:800, letterSpacing:"-0.02em"}}>NGG</b>
                <span style={{fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.22em", textTransform:"uppercase", color:"var(--ink-500)", marginTop:2}}>Afrovanguard</span>
              </div>
            </div>
            <button className="mobile-drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
          </div>

          <DrawerAuthBlock go={go} close={() => setOpen(false)}/>

          <button className={"nav-link" + (page === "home" ? " active" : "")} onClick={() => go("home")}>
            <span className="drawer-link-icon">◉</span> Home
          </button>

          <div className="drawer-section">
            <div className="drawer-section-h">PROGRAMS</div>
            {primary.find(p => p.id === "programs").items.map(sub => (
              <button key={sub.id} className={"nav-link" + (page === sub.id ? " active" : "")} onClick={() => go(sub.id)}>
                <span className="drawer-link-icon" aria-hidden="true">{sub.icon}</span>
                {sub.label}
                {sub.badge && <span className="nav-mega-badge" style={{marginLeft:8}}>{sub.badge}</span>}
              </button>
            ))}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-h">THE ROOM</div>
            {primary.find(p => p.id === "stay").items.map(sub => (
              <button key={sub.id} className={"nav-link" + (page === sub.id ? " active" : "")} onClick={() => go(sub.id)}>
                <span className="drawer-link-icon" aria-hidden="true">{sub.icon}</span>
                {sub.label}
              </button>
            ))}
          </div>

          <div className="mobile-drawer-cta">
            <button className="btn btn-primary" onClick={() => go("join")}>Apply for a session →</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ---- Social icons (inline SVGs) ---- */
const SOCIAL_ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.53 3H20.7l-6.93 7.93L22 21h-6.36l-4.99-6.53L4.9 21H1.74l7.41-8.48L1.5 3h6.52l4.51 5.96L17.53 3Zm-1.11 16.2h1.76L7.66 4.69H5.78L16.42 19.2Z"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.23 5 12 5 12 5s-6.23 0-7.81.42A2.51 2.51 0 0 0 2.42 7.19 26.2 26.2 0 0 0 2 12a26.2 26.2 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.77C5.77 19 12 19 12 19s6.23 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77A26.2 26.2 0 0 0 22 12a26.2 26.2 0 0 0-.42-4.81ZM10 15V9l5.2 3-5.2 3Z"/>
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 3a5.6 5.6 0 0 0 4.5 4.5v3a8.5 8.5 0 0 1-4.5-1.3v6.4a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3h3Z"/>
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0H13v1.7a4 4 0 0 1 3.5-1.9c3.6 0 4.5 2.3 4.5 5.4V21h-4v-5.5c0-1.4-.03-3.2-2-3.2s-2.3 1.5-2.3 3.1V21h-4V9.5Z"/>
    </svg>
  ),
};

function SocialLink({ name, href = "#", icon, label }) {
  return (
    <a className="footer-social" href={href} aria-label={label} target="_blank" rel="noopener noreferrer">
      {icon}
    </a>
  );
}

/* ---- Newsletter form ---- */
function NewsletterForm({ source = "footer" }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState("idle"); // idle | busy | sent | error
  const [err, setErr]     = React.useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    // Instant client-side check — saves the round-trip and gives specific
    // feedback instead of a generic network error when the API is slow.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setState("error");
      setErr("That email doesn't look right.");
      return;
    }
    setState("busy"); setErr("");
    try {
      await NGGApi.public.newsletter(v, source);
      setState("sent");
      if (typeof toast !== "undefined") toast.success("You're in. Watch your inbox.", "Newsletter");
      setTimeout(() => { setState("idle"); setEmail(""); }, 4200);
    } catch (e) {
      setState("error");
      const code = e.code || e.message;
      const map = {
        rate_limited:        "Too many tries — wait a few minutes.",
        bad_email:           "That email doesn't look right.",
        missing_field_email: "Enter your email first.",
        upstream_unreachable:"We can't reach the server right now.",
      };
      setErr(map[code] || "Couldn't subscribe. Try again.");
      if (typeof toast !== "undefined") toast.error(map[code] || "Couldn't subscribe.", "Newsletter");
    }
  };

  const sent = state === "sent";
  const busy = state === "busy";

  return (
    <div>
      <form className={"newsletter-form" + (sent ? " is-sent" : "")} onSubmit={onSubmit} noValidate>
        <input
          type="email"
          required
          placeholder={sent ? "You're in. Watch your inbox." : "your@email.com"}
          value={sent ? "" : email}
          onChange={e => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          aria-label="Email address"
          aria-invalid={state === "error"}
          disabled={sent || busy}
          autoComplete="email"
        />
        <button type="submit" disabled={busy || !email.trim()}>
          {sent ? "Sent ✓" : busy ? "Sending…" : "Subscribe →"}
        </button>
      </form>
      <div className="newsletter-meta">
        {state === "error"
          ? <span style={{color:"var(--coral)"}}>{err}</span>
          : <>
              <span>MONTHLY · NO SPAM</span>
              <span style={{opacity:0.4}}>·</span>
              <span>UNSUBSCRIBE ANYTIME</span>
            </>}
      </div>
    </div>
  );
}

/* ---- Footer ---- */
function Footer({ setPage }) {
  const go = (id) => () => setPage(id);
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false, member: null };
  const session = useSession();

  const CENTRES = [
    { id: "egbeda", name: "CACENTRE Egbeda", lga: "Alimosho · Lagos", line: "Saturdays · 09:00 – 13:00", note: "Main hub" },
    { id: "ayobo",  name: "CACENTRE Ayobo",  lga: "Alimosho · Lagos", line: "Saturdays · 09:00 – 13:00", note: "Sister centre" },
  ];

  const columns = [
    {
      h: "Programs",
      links: [
        { label: "Summer Students", page: "summer" },
        { label: "NGGC · Identity society", page: "club" },
        { label: "Anchor 12", page: "anchor", badge: "LIVE" },
        { label: "Vanguard track", page: "anchor" },
      ],
    },
    {
      h: "Stay in motion",
      links: [
        { label: "The Anchor book", page: "book" },
        { label: "The Journal", page: "blog" },
        { label: "Media room", page: "media" },
        { label: "Member dashboard", page: "dashboard", needsAuth: true },
      ],
    },
    {
      h: "Get involved",
      links: [
        { label: "Apply for a session", page: "join" },
        { label: "Become a mentor", page: "volunteers" },
        { label: "The mentors", page: "mentors" },
        { label: "Contact us", page: "contact" },
      ],
    },
  ];

  const sessionLabel = session
    ? (session.code + " · " + session.year + " — " + (session.isActive ? "live" : "upcoming"))
    : "Session info loading…";

  return (
    <React.Fragment>
      {/* Pre-footer call band — final cinematic push before the footer proper. */}
      <section className="prefooter" aria-label="Join the movement">
        <div className="container prefooter-inner">
          <div className="prefooter-copy">
            <div className="mono prefooter-eyebrow">JOIN THE MOVEMENT</div>
            <h2 className="display prefooter-h">
              The room is open.<br/>
              <span className="prefooter-h-em">Are you in?</span>
            </h2>
            <p className="prefooter-p">
              Two centres. Four sessions a year. One generation showing up.
              Apply now or send a mentor — both move the needle.
            </p>
          </div>
          <div className="prefooter-actions">
            <Magnetic strength={12}>
              <button className="btn btn-gold btn-lg" onClick={go("join")}>Apply for a session →</button>
            </Magnetic>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={go("volunteers")}>Become a mentor</button>
          </div>
        </div>
      </section>

      <footer className="footer" role="contentinfo">
        <div className="footer-accent" aria-hidden="true"><i/><i/><i/><i/></div>
        <div className="container">
          {/* ---- Live status strip ---- */}
          <div className="footer-status" aria-live="polite">
            <div className="footer-status-left">
              <span className="footer-status-dot" aria-hidden="true"/>
              <span className="mono footer-status-label">{sessionLabel}</span>
            </div>
            <div className="footer-status-right">
              {auth.isSignedIn && auth.member ? (
                <button className="footer-status-pill" onClick={go("dashboard")}>
                  <span className="footer-status-avatar">{(auth.member.fullName || "M").charAt(0)}</span>
                  <span>Open my dashboard →</span>
                </button>
              ) : (
                <button className="footer-status-pill" onClick={() => auth.openSignIn && auth.openSignIn()}>
                  <span>Members — sign in →</span>
                </button>
              )}
            </div>
          </div>

          {/* ---- Newsletter band ---- */}
          <div className="footer-newsletter">
            <div>
              <span className="eyebrow" style={{color:"var(--gold-400)"}}>STAY CLOSE · THE DIGEST</span>
              <h3>One letter a month.<br/>No noise.</h3>
              <p>
                Cohort stories, mentor essays, missions we're shipping next.
                Written by the team, sent to your inbox the first Sunday of every month.
              </p>
            </div>
            <NewsletterForm/>
          </div>

          {/* ---- Main grid ---- */}
          <div className="footer-main">
            <div className="footer-brand">
              <div className="footer-brand-head">
                <BrandLogo size={52}/>
                <div>
                  <div className="footer-brand-line">Next Generation Genius</div>
                  <div className="footer-brand-tag">An Afrovanguard movement · est. 2024</div>
                </div>
              </div>
              <p>
                Not a school. Not a club. The structured runway from teenage potential to African leadership — built mission by mission, week by week.
              </p>
              <div className="footer-socials" aria-label="Social channels">
                <SocialLink label="Instagram" href={CONTACT.socials.instagram} icon={SOCIAL_ICONS.instagram}/>
                <SocialLink label="X / Twitter" href={CONTACT.socials.x} icon={SOCIAL_ICONS.x}/>
                <SocialLink label="YouTube" href={CONTACT.socials.youtube} icon={SOCIAL_ICONS.youtube}/>
                <SocialLink label="TikTok" href={CONTACT.socials.tiktok} icon={SOCIAL_ICONS.tiktok}/>
                <SocialLink label="LinkedIn" href={CONTACT.socials.linkedin} icon={SOCIAL_ICONS.linkedin}/>
              </div>
              <div className="footer-contact" aria-label="Direct contact">
                <a className="footer-contact-line" href={"mailto:" + CONTACT.email}>
                  <span className="footer-contact-icon" aria-hidden="true">✉</span>
                  {CONTACT.email}
                </a>
                <a className="footer-contact-line" href={"tel:" + CONTACT.phone}>
                  <span className="footer-contact-icon" aria-hidden="true">☎</span>
                  {CONTACT.phoneDisplay}
                </a>
              </div>
            </div>

            {columns.map(col => (
              <div key={col.h} className="footer-col">
                <h4>{col.h}</h4>
                <ul>
                  {col.links.map(l => (
                    <li key={l.label}>
                      <button
                        className="footer-link"
                        onClick={() => {
                          if (l.needsAuth && !auth.isSignedIn) { auth.openSignIn && auth.openSignIn(); return; }
                          setPage(l.page);
                        }}
                      >
                        {l.label}
                        {l.badge && <span className="badge-new">{l.badge}</span>}
                        {l.needsAuth && !auth.isSignedIn && <span className="footer-link-lock" aria-hidden="true">·</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="footer-col footer-col-centres">
              <h4>Find us</h4>
              <ul className="footer-centres">
                {CENTRES.map(c => (
                  <li key={c.id} className="footer-centre">
                    <div className="footer-centre-head">
                      <span className="footer-centre-dot"/>
                      <span className="footer-centre-name">{c.name}</span>
                    </div>
                    <div className="footer-centre-meta">{c.lga}</div>
                    <div className="mono footer-centre-line">{c.line}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ---- Bottom row ---- */}
          <div className="footer-bottom">
            <span className="copy">© {new Date().getFullYear()} AFROVANGUARD · ALL RIGHTS RESERVED</span>
            <div className="legal-links">
              <button className="legal" onClick={go("parents")}>Privacy</button>
              <button className="legal" onClick={go("parents")}>Safeguarding</button>
              <button className="legal" onClick={go("contact")}>Contact</button>
              <button className="legal" onClick={go("parents")}>Press kit</button>
            </div>
            <span className="made">
              Made with <span className="heart" aria-hidden="true">♥</span> in Lagos
            </span>
          </div>
        </div>
      </footer>
    </React.Fragment>
  );
}

/* ---- Sparkline ---- */
function Sparkline({ data, color = "var(--gold-500)", w = 120, h = 36, fill = false }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / (max - min || 1)) * (h - 4) - 2;
    return [x, y];
  });
  const line = pts.map(p => `${p[0]},${p[1]}`).join(" ");
  const area = `${pts[0][0]},${h} ${line} ${pts[pts.length-1][0]},${h}`;
  return (
    <svg width={w} height={h} style={{display:"block"}}>
      {fill && <polygon fill={color} fillOpacity="0.15" points={area} />}
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={line} />
    </svg>
  );
}

/* ---- Uploader — direct-to-Cloudinary media upload with URL fallback ----
   Renders an "Upload" button when the server has Cloudinary configured
   (GET /api/public/config.php → uploads.enabled). On success calls
   onUploaded(secureUrl, meta). Renders nothing when uploads are disabled,
   so callers can still show a paste-a-URL field alongside. */
function Uploader({ kind = "proof", accept, onUploaded, compact }) {
  const [enabled, setEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    NGGApi.config().then(c => { if (alive) setEnabled(!!(c.uploads && c.uploads.enabled)); }).catch(() => alive && setEnabled(false));
    return () => { alive = false; };
  }, []);

  if (enabled === false) return null;

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setBusy(true); setPct(0);
    try {
      const r = await NGGApi.uploadFile(file, kind, setPct);
      onUploaded && onUploaded(r.url, r);
      if (window.toast) toast.success("Uploaded", file.name);
    } catch (err) {
      if (window.toast) toast.error("Upload failed", err.message || String(err));
    } finally { setBusy(false); }
  };

  return (
    <span className={"uploader" + (compact ? " uploader-compact" : "")}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={pick} disabled={busy || enabled === null}/>
      <button type="button" className="btn btn-ghost btn-sm uploader-btn" disabled={busy || enabled === null} onClick={() => inputRef.current && inputRef.current.click()}>
        {busy ? ("Uploading " + pct + "%") : (enabled === null ? "…" : "↑ Upload")}
      </button>
      {busy && <span className="uploader-bar" aria-hidden="true"><span className="uploader-bar-fill" style={{ width: pct + "%" }}/></span>}
    </span>
  );
}

/* ---- Accessibility widget ----------------------------------------------
   A persistent, keyboard-operable control panel that lets any visitor tune the
   site to their needs: magnify text, force high contrast, stop motion, switch
   to a high-legibility font, and underline every link. Preferences persist in
   localStorage and are applied to <html> via data attributes (see styles.css).
   An inline bootstrap in index.html applies them before first paint. */
const A11Y_KEY = "ngg.a11y";
const A11Y_DEFAULTS = { contrast: false, motion: false, readable: false, underline: false };

function applyA11y(s) {
  const root = document.documentElement;
  root.setAttribute("data-contrast", s.contrast ? "high" : "normal");
  root.setAttribute("data-motion", s.motion ? "reduce" : "auto");
  root.setAttribute("data-font", s.readable ? "readable" : "default");
  root.setAttribute("data-links", s.underline ? "underline" : "default");
}

// Read the visitor's OS accessibility preferences so we can honour them by
// default (smart: no need to toggle what the system already asked for).
function osA11y() {
  const mm = (q) => typeof window !== "undefined" && window.matchMedia && window.matchMedia(q).matches;
  return { motion: mm("(prefers-reduced-motion: reduce)"), contrast: mm("(prefers-contrast: more)") };
}

function AccessibilityWidget() {
  const [open, setOpen] = React.useState(false);
  const [autoOs, setAutoOs] = React.useState(false); // seeded from the OS, not chosen
  const [s, setS] = React.useState(() => {
    try {
      const saved = localStorage.getItem(A11Y_KEY);
      if (saved) return Object.assign({}, A11Y_DEFAULTS, JSON.parse(saved));
    } catch (_) {}
    // First visit — inherit the operating system's accessibility settings.
    return Object.assign({}, A11Y_DEFAULTS, osA11y());
  });
  React.useEffect(() => { try { if (!localStorage.getItem(A11Y_KEY)) { const o = osA11y(); setAutoOs(o.motion || o.contrast); } } catch (_) {} }, []);
  const panelRef = React.useRef(null);
  const btnRef = React.useRef(null);

  React.useEffect(() => {
    applyA11y(s);
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(s)); } catch (_) {}
    const live = document.getElementById("ngg-a11y-live");
    if (live) live.textContent = "Accessibility settings updated";
  }, [s]);

  // Focus trap + Escape + focus restore while the panel is open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const first = panelRef.current && panelRef.current.querySelector("button,input");
    if (first) first.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const a = f[0], b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (prev && prev.focus) { try { prev.focus(); } catch (_) {} } };
  }, [open]);

  const set = (k, v) => setS(o => Object.assign({}, o, { [k]: v }));
  const reset = () => setS({ ...A11Y_DEFAULTS });
  const anyOn = s.contrast || s.motion || s.readable || s.underline;

  return (
    <React.Fragment>
      <button
        ref={btnRef}
        className="a11y-fab"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Accessibility options"
        onClick={() => setOpen(v => !v)}
      >
        <span aria-hidden="true">♿</span>
        {anyOn && <span className="a11y-fab-dot" aria-hidden="true"/>}
      </button>
      {open && (
        <div className="a11y-panel" role="dialog" aria-modal="false" aria-label="Accessibility options" ref={panelRef}>
          <div className="a11y-panel-head">
            <h2 className="a11y-panel-title">Accessibility</h2>
            <button className="a11y-panel-close" onClick={() => setOpen(false)} aria-label="Close accessibility options">✕</button>
          </div>

          {autoOs && (
            <p className="a11y-auto">✓ Matched to your device's accessibility settings. Tweak anything below.</p>
          )}
          <p className="a11y-tip">Tip: press <kbd>Ctrl</kbd>/<kbd>⌘</kbd> and <kbd>+</kbd> to enlarge the page.</p>

          <A11yToggle label="High contrast" desc="Stronger colours + borders" on={s.contrast} onChange={v => set("contrast", v)}/>
          <A11yToggle label="Reduce motion" desc="Stop animations + transitions" on={s.motion} onChange={v => set("motion", v)}/>
          <A11yToggle label="Readable font" desc="High-legibility, spaced type" on={s.readable} onChange={v => set("readable", v)}/>
          <A11yToggle label="Underline links" desc="Underline every link" on={s.underline} onChange={v => set("underline", v)}/>

          <button className="a11y-reset" onClick={reset} disabled={!anyOn}>Reset to defaults</button>
        </div>
      )}
    </React.Fragment>
  );
}

function A11yToggle({ label, desc, on, onChange }) {
  return (
    <label className="a11y-toggle">
      <span>
        <span className="a11y-label">{label}</span>
        <span className="a11y-desc">{desc}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={"a11y-switch" + (on ? " is-on" : "")} onClick={() => onChange(!on)}>
        <span className="a11y-switch-knob"/>
      </button>
    </label>
  );
}

Object.assign(window, {
  BrandLogo, Avatar, Photo, PhotoSlot,
  CountUp, Tag, SectionHead, Progress, TopNav, Footer, Sparkline,
  usePublicData, useSession, useStats, sessionLabel, sessionDaysToStart,
  Uploader, AccessibilityWidget,
});
