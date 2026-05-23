/* ================================================================
   NGG — Shared components
   Loaded as type=text/babel after React + data.js + photos.js
   ================================================================ */
const { useState, useEffect, useRef, useMemo } = React;

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
function Photo({ src, name, label, ratio = "1/1", style = {}, overlay = false, dark = false, children }) {
  const url = src || (name ? scene(name, 1200) : null);
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: ratio,
        overflow: "hidden",
        borderRadius: 18,
        background: dark ? "var(--navy-800)" : "var(--cream-100)",
        ...style,
        maxWidth: "100%",
      }}
    >
      {url ? (
        <img
          src={url}
          alt={label || name || ""}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: dark ? "brightness(0.85)" : "none",
          }}
        />
      ) : null}
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
  return (
    <div className="section-h" style={align === "center" ? { margin: "0 auto 48px", textAlign: "center", alignItems: "center" } : {}}>
      {eyebrow && <span className="eyebrow" style={{ color: "var(--gold-500)" }}>{eyebrow}</span>}
      <h2>{title}</h2>
      {sub && <p style={{ fontSize: 17, color: "var(--ink-500)", margin: 0, lineHeight: 1.5, maxWidth: 640 }}>{sub}</p>}
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
  const links = [
    { id: "home",     label: "Home" },
    { id: "summer",   label: "Summer" },
    { id: "club",     label: "NGGC" },
    { id: "anchor",   label: "Anchor 12" },
    { id: "profile",  label: "Member" },
    { id: "blog",     label: "Journal" },
    { id: "media",    label: "Media" },
    { id: "parents",  label: "Parents" },
  ];
  const [open, setOpen] = useState(false);

  // Body scroll lock when drawer open
  useEffect(() => {
    document.body.classList.toggle("no-scroll", open);
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  // Close drawer on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close drawer when navigating
  const go = (id) => { setPage(id); setOpen(false); };

  return (
    <React.Fragment>
      <div className="topnav">
        <div className="topnav-inner">
          <a className="brand" onClick={() => go("home")}>
            <BrandLogo size={42}/>
            <div className="brand-word">
              <b>Next Generation Genius</b>
              <span>Afrovanguard · est. 2024</span>
            </div>
          </a>
          <nav className="nav-links">
            {links.map(l => (
              <button
                key={l.id}
                className={"nav-link" + (page === l.id ? " active" : "")}
                onClick={() => setPage(l.id)}
              >{l.label}</button>
            ))}
          </nav>
          <div className="nav-right">
            <NavAuthSlot setPage={setPage}/>
            <button className="btn btn-primary btn-sm nav-apply" onClick={() => setPage("join")}>Apply</button>
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
      </div>

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
          {links.map(l => (
            <button
              key={l.id}
              className={"nav-link" + (page === l.id ? " active" : "")}
              onClick={() => go(l.id)}
            >{l.label}</button>
          ))}
          <button
            className={"nav-link" + (page === "volunteers" ? " active" : "")}
            onClick={() => go("volunteers")}
          >Volunteers</button>
          <DrawerAuthBlock go={go} close={() => setOpen(false)}/>
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
function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const onSubmit = (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setSent(true);
    setTimeout(() => { setSent(false); setEmail(""); }, 3200);
  };
  return (
    <div>
      <form className={"newsletter-form" + (sent ? " is-sent" : "")} onSubmit={onSubmit}>
        <input
          type="email"
          required
          placeholder={sent ? "You're in. Watch your inbox." : "your@email.com"}
          value={sent ? "" : email}
          onChange={e => setEmail(e.target.value)}
          aria-label="Email address"
          disabled={sent}
        />
        <button type="submit">{sent ? "Sent ✓" : "Subscribe →"}</button>
      </form>
      <div className="newsletter-meta">
        <span>MONTHLY · NO SPAM</span>
        <span style={{opacity:0.4}}>·</span>
        <span>UNSUBSCRIBE ANYTIME</span>
      </div>
    </div>
  );
}

/* ---- Footer ---- */
function Footer({ setPage }) {
  const go = (id) => () => setPage(id);

  // Two physical centres in Alimosho, Lagos. The strip in the footer renders
  // them as live centres; we leave the "coming soon" slot empty for now.
  const CHAPTERS_LIVE = ["CACENTRE Egbeda", "CACENTRE Ayobo"];
  const CHAPTERS_COMING = [];

  const columns = [
    {
      h: "Programs",
      links: [
        { label: "Summer Students", page: "summer" },
        { label: "Next Generation Genius Club", page: "club" },
        { label: "Anchor 12", page: "anchor", badge: "NEW" },
        { label: "Vanguard", page: "anchor" },
      ],
    },
    {
      h: "Movement",
      links: [
        { label: "The Journal", page: "blog" },
        { label: "Media room", page: "media" },
        { label: "Become a mentor", page: "volunteers" },
        { label: "Member profile", page: "profile" },
      ],
    },
    {
      h: "Trust & contact",
      links: [
        { label: "For parents", page: "parents" },
        { label: "Safeguarding", page: "parents" },
        { label: "FAQ", page: "parents" },
        { label: "Apply now", page: "join" },
      ],
    },
  ];

  return (
    <footer className="footer">
      <div className="container">
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
            <div style={{display:"flex", alignItems:"center", gap:14, marginBottom:6}}>
              <BrandLogo size={52}/>
              <div>
                <div className="footer-brand-line">Next Generation Genius</div>
                <div className="footer-brand-tag">An Afrovanguard movement · est. 2024</div>
              </div>
            </div>
            <p>
              We are not a school. We are not a club. We are the structured runway from teenage potential to African leadership — built mission by mission, week by week.
            </p>
            <div className="footer-socials" aria-label="Social channels">
              <SocialLink label="Instagram" icon={SOCIAL_ICONS.instagram}/>
              <SocialLink label="X / Twitter" icon={SOCIAL_ICONS.x}/>
              <SocialLink label="YouTube" icon={SOCIAL_ICONS.youtube}/>
              <SocialLink label="TikTok" icon={SOCIAL_ICONS.tiktok}/>
              <SocialLink label="LinkedIn" icon={SOCIAL_ICONS.linkedin}/>
            </div>
          </div>

          {columns.map(col => (
            <div key={col.h} className="footer-col">
              <h4>{col.h}</h4>
              <ul>
                {col.links.map(l => (
                  <li key={l.label}>
                    <button className="footer-link" onClick={go(l.page)}>
                      {l.label}
                      {l.badge && <span className="badge-new">{l.badge}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ---- Chapters strip ---- */}
        <div className="footer-chapters">
          <span className="footer-chapters-label">{String(CHAPTERS_LIVE.length).padStart(2, "0")} centres · Alimosho, Lagos</span>
          <div className="footer-chapters-list">
            {CHAPTERS_LIVE.map(c => (
              <span key={c} className="chapter-pill">
                <span className="city-dot"/>{c}
              </span>
            ))}
            {CHAPTERS_COMING.map(c => (
              <span key={c} className="chapter-pill coming" title="Opening soon">
                <span className="city-dot"/>{c} · soon
              </span>
            ))}
          </div>
        </div>

        {/* ---- Bottom row ---- */}
        <div className="footer-bottom">
          <span className="copy">© 2026 AFROVANGUARD · ALL RIGHTS RESERVED</span>
          <div className="legal-links">
            <button className="legal" onClick={go("parents")}>Privacy</button>
            <button className="legal" onClick={go("parents")}>Safeguarding</button>
            <button className="legal" onClick={go("parents")}>Press kit</button>
          </div>
          <span className="made">
            Made with <span className="heart" aria-hidden="true">♥</span> in Lagos
          </span>
        </div>
      </div>
    </footer>
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

Object.assign(window, {
  BrandLogo, Avatar, Photo, PhotoSlot,
  CountUp, Tag, SectionHead, Progress, TopNav, Footer, Sparkline,
});
