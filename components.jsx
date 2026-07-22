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

/* Editable site copy (homepage hero + taglines), admin-managed via Site
   settings. Falls back to {} so callers use their own hardcoded defaults. */
function useSiteContent() {
  return usePublicData("siteContent", () =>
    NGGApi.public.siteContent().then(r => r.site || {}).catch(() => ({}))) || {};
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
      {eyebrow && <span className="eyebrow reveal" data-reveal style={{ color: "var(--eyebrow-fg, var(--gold-700))", "--reveal-delay": "0ms" }}>{eyebrow}</span>}
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
              <span>⚙</span> Control Room
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
    { id: "stay", kind: "mega", label: "The room", match: ["community","blog","media","volunteers","parents","contact"], items: [
      { id: "community",  label: "Community",        desc: "The movement, live",      icon: "◈" },
      { id: "blog",       label: "The Journal",     desc: "Stories + essays",        icon: "✎" },
      { id: "media",      label: "Media room",      desc: "Films · podcast · reels", icon: "▶" },
      { id: "mentors",    label: "The mentors",     desc: "Meet the mentor circle",  icon: "◐" },
      { id: "volunteers", label: "Become a mentor", desc: "Volunteer with NGG",      icon: "✚" },
      { id: "parents",    label: "For parents",     desc: "Safeguarding · FAQ",      icon: "♡" },
      { id: "contact",    label: "Contact",         desc: "Talk to a human",         icon: "✆" },
    ]},
  ];

  const [open, setOpen]       = React.useState(false);
  const [mega, setMega]       = React.useState(null);   // active mega panel id
  const [scrolled, setScroll] = React.useState(false);
  const navRef = React.useRef(null);
  const drawerRef = React.useRef(null);
  const burgerRef = React.useRef(null);
  const megaTimer = React.useRef(0);

  // Mobile drawer focus management — trap Tab inside the open drawer and
  // restore focus to the burger on close (parity with the other modals).
  React.useEffect(() => {
    if (!open) return;
    const panel = drawerRef.current;
    if (!panel) return;
    const first = panel.querySelector('button,a[href],input,[tabindex]:not([tabindex="-1"])');
    if (first) setTimeout(() => { try { first.focus(); } catch (_) {} }, 40);
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const f = panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const a = f[0], b = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (burgerRef.current) { try { burgerRef.current.focus(); } catch (_) {} } };
  }, [open]);

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
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("home"); }} aria-label="Next Generation Genius — Home">
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
              ref={burgerRef}
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
        <div className="mobile-drawer-panel" ref={drawerRef}>
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
  // Don't render a channel that points at a bare platform homepage (a
  // placeholder handle) — an icon that lands on instagram.com/ reads as broken
  // or fake. It appears only once a real profile URL (with a path) is set.
  let real = false;
  try { const u = new URL(href); real = u.pathname.replace(/\/+$/, "").length > 0; } catch (_) { real = false; }
  if (!real) return null;
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
  // Deep-link into a centre's public page (/centres/<slug>). Pushes the clean
  // URL, then hands off to the centres page (which reads the slug from the
  // path); the synthetic popstate re-parses it even if we're already there.
  const goCentre = (slug) => (e) => {
    if (e) e.preventDefault();
    const path = "/centres/" + slug;
    if (window.location.pathname !== path) history.pushState({ page: "centres" }, "", path);
    setPage("centres");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false, member: null };
  const session = useSession();
  const site = useSiteContent();

  const CENTRES = [
    { id: "egbeda", name: "CACENTRE Egbeda", lga: "Alimosho · Lagos", line: "Saturdays · 09:00 – 13:00", note: "Main hub" },
    { id: "ayobo",  name: "CACENTRE Ayobo",  lga: "Alimosho · Lagos", line: "Saturdays · 09:00 – 13:00", note: "Sister centre" },
  ];

  const columns = [
    {
      h: "Programs",
      links: [
        { label: "Summer Students", page: "summer" },
        { label: "Find your centre", page: "centres" },
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
        { label: "Volunteer with us", page: "volunteer" },
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
                {site.movementTagline || "Not a school. Not a club. The structured runway from teenage potential to African leadership — built mission by mission, week by week."}
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
                    <a href={"/centres/" + c.id} className="footer-centre-link" onClick={goCentre(c.id)}>
                      <div className="footer-centre-head">
                        <span className="footer-centre-dot"/>
                        <span className="footer-centre-name">{c.name}</span>
                        <span className="footer-centre-go" aria-hidden="true">→</span>
                      </div>
                      <div className="footer-centre-meta">{c.lga}</div>
                      <div className="mono footer-centre-line">{c.line}</div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ---- Editorial signature ---- */}
          <div className="footer-wordmark" aria-hidden="true">Next Gen Genius</div>

          {/* ---- Bottom row ---- */}
          <div className="footer-bottom">
            <span className="copy">© {new Date().getFullYear()} AFROVANGUARD · ALL RIGHTS RESERVED</span>
            <div className="legal-links">
              <button className="legal" onClick={() => { history.replaceState({}, "", "/legal?doc=privacy"); setPage("legal"); }}>Privacy</button>
              <button className="legal" onClick={() => { history.replaceState({}, "", "/legal?doc=safeguarding"); setPage("legal"); }}>Safeguarding</button>
              <button className="legal" onClick={() => { history.replaceState({}, "", "/legal?doc=rights"); setPage("legal"); }}>Data rights</button>
              <button className="legal" onClick={go("contact")}>Contact</button>
              <button className="legal" onClick={go("s-status")}>Live status</button>
              <button className="legal" onClick={go("v-status")}>Volunteer status</button>
              <button className="legal" onClick={go("admin")}>Staff</button>
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

/* ---- Shared state UI: offline / error / empty ---- */
function humanizeError(message, code) {
  const c = String(code || message || "");
  const map = {
    forbidden: "You don't have permission to view this.",
    unauthorized: "Please sign in to continue.",
    admin_2fa_required: "This area needs a 2FA code.",
    not_found: "We couldn't find that.",
    rate_limited: "Too many requests — wait a moment and try again.",
    link_invalid: "This link isn't valid or has expired. Ask for a fresh invite code.",
    already_connected: "You're already connected to this student on this device.",
    consent_required: "Please tick the required consent boxes to continue.",
    member_gone: "That account no longer exists.",
    http_0: "Network trouble — check your connection.",
    http_500: "The server hit an error. Please try again shortly.",
    http_503: "The service is busy. Please try again shortly.",
  };
  if (map[c]) return map[c];
  if (/network|fetch|Failed to fetch|offline/i.test(c)) return "Network trouble — check your connection and try again.";
  return "Something went wrong. Please try again — if it persists, contact support.";
}

function OfflineBanner() {
  const [off, setOff] = React.useState(typeof navigator !== "undefined" && navigator.onLine === false);
  React.useEffect(() => {
    const up = () => setOff(false), down = () => setOff(true);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  if (!off) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span className="offline-dot" aria-hidden="true"/> You're offline — showing the latest saved view. Changes sync when you reconnect.
    </div>
  );
}

function ErrorState({ title, message, code, onRetry }) {
  return (
    <div className="state-block state-error" role="alert">
      <div className="state-ic state-ic-error" aria-hidden="true">!</div>
      <h3 className="state-h">{title || "Something went wrong"}</h3>
      <p className="state-p">{humanizeError(message, code)}</p>
      {onRetry && <button className="btn btn-ghost btn-sm state-retry" onClick={onRetry}>Try again</button>}
    </div>
  );
}

function EmptyState({ icon, title, message, action }) {
  return (
    <div className="state-block state-empty">
      <div className="state-ic state-ic-empty" aria-hidden="true">{icon || "◍"}</div>
      <h3 className="state-h">{title || "Nothing here yet"}</h3>
      {message && <p className="state-p">{message}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
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
/* ---- PhotoCapture — camera-first headshot, with upload + link fallbacks ----
   Used wherever a person's photo is set (admin enrol, member editor, gate
   registration). The site TAKES the picture; uploading a file or pasting a
   link are secondary options. Editors can re-take/re-upload any time. */
/* Cloudinary delivery-URL enhancement used across every photo taker. Kept in
   one place so the capture preview, the compare toggle and the fallbacks all
   agree on the exact transform. e_improve auto-fixes colour/lighting and the
   face-centred crop tidies the framing — both are FREE (no add-on). The
   background swap (e_background_removal) is deliberately NOT here: it is a paid
   add-on and runs server-side behind the credit guard, never on a client URL. */
const CLD_ENHANCE = "c_thumb,g_face,w_600,h_750,e_improve,q_auto";
const CLD_PLAIN   = "c_thumb,g_face,w_600,h_750,q_auto"; // same framing, no e_improve → the "before"

function cldEnhance(url) {
  return url && url.indexOf("/upload/") !== -1 ? url.replace("/upload/", "/upload/" + CLD_ENHANCE + "/") : url;
}

/* Client-side headshot validator — a fast, forgiving pre-check before we upload.
   Rejects only clearly-unusable captures (too dark/blurry, no face, more than
   one face, off-centre or tiny) with specific guidance; the server AI review
   (ai_photo_review) is still the authoritative gate. `el` is a loaded <img> or
   a <canvas>; w/h are its natural pixel dimensions. Returns {ok, reason}. */
async function validateHeadshot(el, w, h) {
  try {
    if (Math.min(w, h) < 360) return { ok: false, reason: "That image is too small — use a larger, clearer photo (at least 400px)." };
    const MAX = 480, s = Math.min(1, MAX / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.max(2, Math.round(w * s)); c.height = Math.max(2, Math.round(h * s));
    const ctx = c.getContext("2d"); ctx.drawImage(el, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const N = c.width * c.height, gray = new Float32Array(N);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) { const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; gray[p] = g; sum += g; }
    const mean = sum / N;
    if (mean < 32) return { ok: false, reason: "Too dark — face a window or add light, then retake." };
    if (mean > 236) return { ok: false, reason: "Too bright/washed out — move out of direct glare and retake." };
    // Blur: variance of the Laplacian. Low variance = soft/out-of-focus.
    let ls = 0, lsq = 0, n = 0; const W = c.width;
    for (let y = 1; y < c.height - 1; y++) for (let x = 1; x < W - 1; x++) { const idx = y * W + x; const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - W] - gray[idx + W]; ls += lap; lsq += lap * lap; n++; }
    const lv = lsq / n - (ls / n) * (ls / n);
    if (lv < 22) return { ok: false, reason: "Too blurry — hold steady, let the camera focus, then retake." };
    // Face check where the browser supports it (Chrome/Android — our audience).
    if (typeof window.FaceDetector === "function") {
      try {
        const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 }).detect(el);
        if (!faces || faces.length === 0) return { ok: false, reason: "No face detected — make sure the face is clearly visible and lit." };
        if (faces.length > 1) return { ok: false, reason: "More than one face — a headshot should show just the one person." };
        const b = faces[0].boundingBox, cx = (b.x + b.width / 2) / w, fh = b.height / h;
        if (fh < 0.16) return { ok: false, reason: "Move closer — the face should fill more of the frame." };
        if (cx < 0.18 || cx > 0.82) return { ok: false, reason: "Centre the face in the frame and retake." };
      } catch (e) { /* detector hiccup — fall through, server AI still validates */ }
    }
    return { ok: true };
  } catch (e) { return { ok: true }; } // never hard-block on a validator error
}

// Load a URL into an <img> (CORS-enabled) for validation / re-upload.
function loadImageEl(src) {
  return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("load_failed")); im.src = src; });
}
function canvasToBlob(c, type, q) { return new Promise((res) => c.toBlob(res, type || "image/jpeg", q == null ? 0.9 : q)); }
// Swap (or insert) the transform segment right after /upload/. Leaves non-
// Cloudinary URLs (pasted links) untouched so the compare simply hides itself.
function cldWith(url, tf) {
  if (!url) return url;
  const i = url.indexOf("/upload/");
  if (i === -1) return url;
  let tail = url.slice(i + 8);
  const slash = tail.indexOf("/");
  const seg = slash === -1 ? tail : tail.slice(0, slash);
  if (slash !== -1 && !/^v\d+$/.test(seg) && /[,_]/.test(seg)) tail = tail.slice(slash + 1); // drop existing transform
  return url.slice(0, i + 8) + (tf ? tf + "/" : "") + tail;
}

/* Before/after preview with a reverse button, like Canva's edit toggle. Shows
   the enhanced image by default; press ⤺ to peek at the original, press again
   to restore. Only appears for Cloudinary uploads (there's nothing to compare
   for a pasted link). Purely a view — the stored value stays the enhanced URL. */
function PhotoCompare({ url, radius = "0", onError }) {
  const [orig, setOrig] = React.useState(false);
  const canCompare = !!(url && url.indexOf("/upload/") !== -1);
  React.useEffect(() => { setOrig(false); }, [url]); // a fresh capture resets to "enhanced"
  const shown = orig && canCompare ? cldWith(url, CLD_PLAIN) : url;
  const pill = { position: "absolute", top: 8, left: 8, fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: orig ? "rgba(0,0,0,.6)" : "rgba(245,176,38,.92)", color: orig ? "#fff" : "#2b2100", pointerEvents: "none" };
  const btn = { position: "absolute", bottom: 8, right: 8, width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 17, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1, boxShadow: "0 2px 8px rgba(0,0,0,.35)" };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: radius, overflow: "hidden" }}>
      <img src={shown} alt={orig ? "Original photo" : "Enhanced photo"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={onError}/>
      {canCompare && (<>
        <span style={pill}>{orig ? "Original" : "Enhanced"}</span>
        <button type="button" onClick={() => setOrig(o => !o)} style={btn} title={orig ? "Show enhanced" : "Show original"} aria-label={orig ? "Show enhanced photo" : "Show original photo"}>⤺</button>
      </>)}
    </div>
  );
}

/* Full-screen image viewer — a headshot is impossible to judge inside a 64px
   circle. Tap the thumbnail (or the ⤢ control) to see it big; click the
   backdrop, press Esc, or hit ✕ to close. Reused wherever a photo is shown. */
function ImageLightbox({ url, alt, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  if (!url) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={alt || "Photo"} style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(6,9,20,0.86)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 24 }}>
      <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 18, right: 18, width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
      <img src={url} alt={alt || "Photo"} onClick={e => e.stopPropagation()} style={{ maxWidth: "min(92vw, 620px)", maxHeight: "88vh", width: "auto", height: "auto", objectFit: "contain", borderRadius: 14, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)" }}/>
    </div>
  );
}

function PhotoCapture({ value, onChange, size = 96, label = "Photo" }) {
  const [mode, setMode] = React.useState("idle"); // idle | camera | link
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [linkVal, setLinkVal] = React.useState("");
  const [zoom, setZoom] = React.useState(false);  // full-screen photo viewer
  const [shot, setShot] = React.useState(null);   // captured still awaiting confirm: {url, blob}
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const fileRef = React.useRef(null);

  const stop = () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } };
  React.useEffect(() => stop, []);
  // Lock body scroll while the full-screen camera overlay is open.
  React.useEffect(() => {
    if (mode !== "camera") return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mode]);

  const startCamera = async () => {
    setErr(""); setMode("camera");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setErr("No camera on this device — upload a photo or paste a link instead."); setMode("idle"); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: false });
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
    } catch (_) { setErr("Camera permission denied — upload a photo or paste a link instead."); setMode("idle"); }
  };

  const uploadBlob = async (blob, name) => {
    setBusy(true); setErr("");
    try {
      const file = blob instanceof File ? blob : new File([blob], name || "headshot.jpg", { type: "image/jpeg" });
      const up = await NGGApi.uploadFile(file, "headshot");
      // Face-centred crop + auto colour/lighting (Cloudinary URL transform).
      onChange(cldEnhance(up.url));
      stop(); setMode("idle");
    } catch (e) {
      const code = e.code || "";
      setErr(
        code === "uploads_disabled" ? "Photo uploads aren't switched on for this site yet — paste an image link instead."
        : code === "csrf_failed" ? "Your session expired — refresh the page, then try the photo again."
        : code === "rate_limited" ? "Too many tries in a row — wait a moment and try again."
        : /network/.test(e.message || "") ? "Network hiccup uploading the photo — check the connection and try again."
        : "Couldn't upload that photo — try again, or paste an image link instead."
      );
    } finally { setBusy(false); }
  };

  // Grab a still from the live video and FREEZE it for review — no upload yet.
  // The user then presses "Use photo" (accept) or "Retake". The camera keeps
  // running behind the frozen still so retake is instant.
  const capture = async () => {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas");
    c.width = 720; c.height = 900;
    const ctx = c.getContext("2d");
    // Cover-crop the video frame to a 4:5 portrait.
    const vw = v.videoWidth || 720, vh = v.videoHeight || 900;
    const scale = Math.max(c.width / vw, c.height / vh);
    const dw = vw * scale, dh = vh * scale;
    ctx.drawImage(v, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    setBusy(true); setErr("");
    const check = await validateHeadshot(c, c.width, c.height);
    setBusy(false);
    if (!check.ok) { setErr(check.reason); return; }   // stay live so they can reframe
    const blob = await canvasToBlob(c, "image/jpeg", 0.9);
    if (!blob) { setErr("Couldn't capture that frame — try again."); return; }
    setShot({ url: c.toDataURL("image/jpeg", 0.9), blob });
  };
  // Accept the reviewed still → upload it. On success uploadBlob stops the
  // camera and returns to idle; on failure the review stays put with the error.
  const acceptShot = async () => { if (shot) { await uploadBlob(shot.blob, "headshot.jpg"); setShot(null); } };
  const closeCamera = () => { stop(); setShot(null); setMode("idle"); setErr(""); };

  // Upload a chosen file — validate it first, then send.
  const uploadPicked = async (file) => {
    setBusy(true); setErr("");
    try {
      const im = await loadImageEl(URL.createObjectURL(file));
      const check = await validateHeadshot(im, im.naturalWidth, im.naturalHeight);
      if (!check.ok) { setErr(check.reason); setBusy(false); return; }
      uploadBlob(file, file.name);
    } catch (e) { setErr("Couldn't read that image — try a different photo."); setBusy(false); }
  };

  // Paste-a-link — load it, validate it, and RE-UPLOAD to Cloudinary so it's a
  // real, enhanced, same-origin-safe headshot (never a raw foreign URL).
  const useLink = async () => {
    const url = linkVal.trim(); if (!url) return;
    setBusy(true); setErr("");
    try {
      const im = await loadImageEl(url);
      const check = await validateHeadshot(im, im.naturalWidth, im.naturalHeight);
      if (!check.ok) { setErr(check.reason); setBusy(false); return; }
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext("2d").drawImage(im, 0, 0);
      const blob = await canvasToBlob(c, "image/jpeg", 0.92);
      if (!blob) throw new Error("encode");
      await uploadBlob(blob, "headshot.jpg");
      setLinkVal("");
    } catch (e) {
      setErr("That link isn't a directly-viewable image (a Drive/Photos share link won't work). Paste a direct image URL, or upload the file.");
      setBusy(false);
    }
  };

  // CAMERA MODE — a full-screen overlay (not a cramped inline frame). Capture
  // freezes the shot for review; nothing is saved until "Use photo" is pressed,
  // so it never jumps straight to the little circle.
  if (mode === "camera") {
    return (
      <div role="dialog" aria-modal="true" aria-label="Take a photo" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(6,9,20,0.94)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 16 }}>
        <button type="button" onClick={closeCamera} aria-label="Close" style={{ position: "absolute", top: 16, right: 16, width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer" }}>✕</button>
        <div style={{ color: "#fff", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 18 }}>{shot ? "Use this photo?" : "Take your photo"}</div>
        <div style={{ position: "relative", width: "100%", maxWidth: 360, aspectRatio: "4 / 5", borderRadius: 18, overflow: "hidden", background: "#0b1020", boxShadow: "0 24px 70px -24px rgba(0,0,0,0.75)" }}>
          <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: shot ? "none" : "block" }}/>
          {shot && <img src={shot.url} alt="Captured photo" style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}/>}
          {!shot && <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "43%", transform: "translate(-50%,-50%)", width: "62%", height: "72%", border: "2px dashed rgba(255,255,255,0.65)", borderRadius: "50%" }}/>}
          {!shot && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, fontSize: 12.5, color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,0.65))", textAlign: "center" }}>Line your face up with the oval, then press Capture.</div>}
        </div>
        {err && <div style={{ fontSize: 13, color: "#ffb0b0", maxWidth: 360, textAlign: "center", lineHeight: 1.4 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {shot ? (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={acceptShot}>{busy ? "Saving…" : "✓ Use photo"}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => { setShot(null); setErr(""); }} style={{ color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)" }}>↺ Retake</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={capture}>{busy ? "Checking…" : "📸 Capture"}</button>
              <button type="button" className="btn" onClick={closeCamera} style={{ color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)" }}>Cancel</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <button type="button" onClick={() => value ? setZoom(true) : startCamera()} title={value ? "View photo" : "Take a photo"}
        style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flex: "0 0 auto", background: "var(--bg-sunken, #f4f4f0)", border: "1px solid rgba(12,20,50,0.14)", display: "grid", placeItems: "center", fontSize: size / 3, color: "var(--ink-400, #93939a)", padding: 0, cursor: "pointer", position: "relative" }}>
        {value ? <PhotoCompare url={value} onError={e => { e.target.style.display = "none"; }}/> : "📷"}
        {value && <span aria-hidden="true" style={{ position: "absolute", right: 2, bottom: 2, width: 22, height: 22, borderRadius: "50%", background: "rgba(10,17,48,0.82)", color: "#fff", fontSize: 11, display: "grid", placeItems: "center" }}>⤢</span>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {mode === "link" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="admin-input" style={{ flex: "1 1 180px" }} aria-label="Direct image link" placeholder="https://…/photo.jpg (direct image link)" value={linkVal} onChange={e => setLinkVal(e.target.value)}/>
            <button type="button" className="btn btn-primary btn-sm" disabled={!linkVal.trim() || busy} onClick={useLink}>{busy ? "Checking…" : "Use"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={startCamera}>{value ? "Re-take" : "Take photo"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>{busy ? "Uploading…" : "Upload"}</button>
            {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoom(true)}>View</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("link")}>Paste link</button>
            {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")}>Remove</button>}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) uploadPicked(f); e.target.value = ""; }}/>
          </div>
        )}
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8 }}>
          {err ? <span style={{ color: "var(--coral)" }}>{err}</span> : (label + " — the site takes the picture; upload or link are optional. Tap the photo to view it larger.")}
        </div>
      </div>
      {zoom && value && <ImageLightbox url={value} alt={label} onClose={() => setZoom(false)}/>}
    </div>
  );
}

/* Build a Cloudinary delivery transform from an explicit edit spec — mirrors
   the server's cloudinary_edit_manual so the live preview matches the save. */
function buildEditTransform(spec) {
  const parts = ["c_fill", "g_" + (spec.gravity || "face"), "w_600", "h_750", "f_auto", "q_auto:good", "e_improve:30"];
  if (spec.zoom && Math.abs(spec.zoom - 1) > 0.001) parts.push("z_" + String(Math.round(spec.zoom * 100) / 100));
  if (spec.brighten) parts.push("e_brightness:18");
  if (spec.sharpen) parts.push("e_sharpen:80");
  let chain = parts.join(",");
  if (spec.removeBg) chain += "/e_background_removal/b_rgb:ffffff";
  return chain;
}

/* Admin photo editor — re-edit ANY image (card headshot, review-queue asset).
   Live client-side preview via cldWith; Save persists through the server which
   re-derives from the clean source and re-applies to the subject. Replace
   uploads a fresh, validated headshot. `target` = {assetId} or
   {subjectType, subjectId}; the latter also enables Replace. */
function PhotoEditor({ target, currentUrl, title, onSaved, onClose }) {
  const [spec, setSpec] = React.useState({ gravity: "face", zoom: 1, brighten: false, sharpen: false, removeBg: false });
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const fileRef = React.useRef(null);
  const set = (k, v) => setSpec(s => Object.assign({}, s, { [k]: v }));
  const preview = currentUrl ? cldWith(currentUrl, buildEditTransform(spec)) : "";

  const save = async () => {
    setBusy("save"); setErr("");
    try { const r = await NGGApi.admin.photos.edit(target, spec); onSaved && onSaved(r.url); onClose && onClose(); }
    catch (e) { setErr(e.code === "not_editable" ? "This photo isn't a Cloudinary image — use Replace to edit it." : e.code === "no_photo" ? "No photo on file yet — use Replace to add one." : (e.code || e.message)); setBusy(""); }
  };
  const replace = async (file) => {
    if (!target.subjectId) { setErr("Can't replace here."); return; }
    setBusy("replace"); setErr("");
    try {
      const im = await loadImageEl(URL.createObjectURL(file));
      const check = await validateHeadshot(im, im.naturalWidth, im.naturalHeight);
      if (!check.ok) { setErr(check.reason); setBusy(""); return; }
      const up = await NGGApi.uploadFile(file, "headshot");
      const r = await NGGApi.admin.photos.replace(target.subjectType, target.subjectId, up.url);
      onSaved && onSaved(r.editedUrl || up.url); onClose && onClose();
    } catch (e) { setErr("Couldn't replace — " + (e.code || e.message)); setBusy(""); }
  };

  const chip = (k, v, label) => (
    <button type="button" onClick={() => set(k, v)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + (spec[k] === v ? "#16223e" : "rgba(12,20,50,.18)"), background: spec[k] === v ? "#16223e" : "transparent", color: spec[k] === v ? "#fff" : "#16223e", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>{label}</button>
  );
  const toggle = (k, label) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={!!spec[k]} onChange={e => set(k, e.target.checked)}/> {label}
    </label>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit photo" onClick={e => { if (e.target === e.currentTarget && !busy) onClose && onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,10,24,.6)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ maxWidth: 560, width: "100%", background: "#fff", borderRadius: 16, padding: 20, maxHeight: "92vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Edit photo{title ? " — " + title : ""}</h3>
          <button onClick={() => !busy && onClose && onClose()} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 168, height: 210, borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg,#dff0fb 55%,#8fbb3f 90%)", border: "1px solid rgba(12,20,50,.14)", flex: "0 0 auto" }}>
            {preview ? <img src={preview} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#889" }}>No photo</div>}
          </div>
          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#889", marginBottom: 6 }}>CROP FOCUS</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{chip("gravity", "face", "Face")}{chip("gravity", "center", "Centre")}{chip("gravity", "north", "Top")}{chip("gravity", "south", "Bottom")}</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#889", marginBottom: 6 }}>ZOOM · {spec.zoom.toFixed(2)}×</div>
              <input type="range" min="0.6" max="1.8" step="0.05" value={spec.zoom} onChange={e => set("zoom", parseFloat(e.target.value))} style={{ width: "100%" }}/>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {toggle("brighten", "Brighten")}
              {toggle("sharpen", "Sharpen (unsharp — no generative)")}
              {toggle("removeBg", "Clean studio backdrop")}
            </div>
          </div>
        </div>
        {err && <p style={{ color: "var(--coral, #ff5a3c)", fontSize: 13, margin: "12px 0 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={!!busy || !preview} onClick={save}>{busy === "save" ? "Saving…" : "Save edit"}</button>
          {target.subjectId && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => fileRef.current && fileRef.current.click()}>{busy === "replace" ? "Uploading…" : "Replace photo"}</button>}
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => onClose && onClose()}>Cancel</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) replace(f); e.target.value = ""; }}/>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "#99a", marginTop: 10 }}>Edits reframe/adjust the existing photo only — never generative. The change applies to the card and profile immediately.</p>
      </div>
    </div>
  );
}

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
  Uploader, AccessibilityWidget, PhotoEditor, PhotoCapture, ImageLightbox,
});
