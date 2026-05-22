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
            <span className="chip" style={{background:"rgba(208,255,58,0.3)", color:"#2e4400"}}>
              <span className="live-dot" style={{background:"#3fa01a"}}/> 12 live now
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setPage("join")}>Apply</button>
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
          <div className="mobile-drawer-cta">
            <span className="chip" style={{background:"rgba(208,255,58,0.3)", color:"#2e4400", alignSelf:"flex-start"}}>
              <span className="live-dot" style={{background:"#3fa01a"}}/> 12 live now
            </span>
            <button className="btn btn-primary" onClick={() => go("join")}>Apply for Summer 2026 →</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ---- Footer ---- */
function Footer({ setPage }) {
  return (
    <footer className="footer">
      <div className="container">
        <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr 1fr", gap:48}}>
          <div>
            <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16}}>
              <BrandLogo size={48}/>
              <div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize:18}}>Next Generation Genius</div>
                <div className="mono" style={{fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", color:"rgba(255,255,255,0.55)", marginTop:3}}>An Afrovanguard movement</div>
              </div>
            </div>
            <p style={{color:"rgba(255,255,255,0.62)", fontSize:14, lineHeight:1.55, maxWidth:380}}>
              We are not a school. We are not a club. We are the structured runway from teenage potential to African leadership — built mission by mission, week by week.
            </p>
            <div style={{display:"flex", gap:10, marginTop:18}}>
              {["IG","X","YT","TT"].map(s => (
                <a key={s} style={{width:38, height:38, borderRadius:"50%", background:"rgba(255,255,255,0.08)", display:"grid", placeItems:"center", fontSize:11, fontWeight:600, fontFamily:"var(--font-mono)", color:"white", cursor:"pointer", textDecoration:"none"}}>{s}</a>
              ))}
            </div>
          </div>
          {[
            { h: "Programs", links: ["Summer Students", "NGGC", "Anchor 12", "Vanguard"] },
            { h: "Movement", links: ["Journal", "Media", "Mentors", "Communities"] },
            { h: "Trust",    links: ["Parents", "Safeguarding", "FAQ", "Contact"] },
          ].map(col => (
            <div key={col.h}>
              <div className="eyebrow" style={{color:"var(--gold-400)", marginBottom:14}}>{col.h}</div>
              <div className="col" style={{gap:10}}>
                {col.links.map(l => <a key={l} style={{color:"white", textDecoration:"none", fontSize:14, opacity:0.8, cursor:"pointer"}}>{l}</a>)}
              </div>
            </div>
          ))}
        </div>
        <hr style={{border:"none", borderTop:"1px solid rgba(255,255,255,0.08)", margin:"40px 0 20px"}}/>
        <div className="footer-meta" style={{display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, color:"rgba(255,255,255,0.5)", flexWrap:"wrap", gap:8}}>
          <span className="mono">© 2026 AFROVANGUARD · NEXT GENERATION GENIUS</span>
          <span className="mono">BUILD TALENT · BUILD CHARACTER · BUILD AFRICA</span>
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
