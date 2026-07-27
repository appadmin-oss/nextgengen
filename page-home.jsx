/* ================================================================
   NGG — Home + Progression (cinematic pass)
   ================================================================ */

function HomePage({ setPage }) {
  return (
    <div className="page" data-screen-label="01 Home">
      <PromoBanner setPage={setPage} />
      <Hero setPage={setPage} />
      {/* The hero now carries the KPI strip (per the 2026 design), so the
          standalone StatBar is retired to avoid showing the same numbers twice. */}
      <ProgressionSystem setPage={setPage} />
      <FlagshipCallout setPage={setPage} />
      <ManifestoMarquee />
      <TracksRibbon setPage={setPage} />
      <CommunityCollage />
      <Testimonials />
      <EventsBand setPage={setPage}/>
      <BlogPreview setPage={setPage}/>
      <ClosingCTA setPage={setPage} />
    </div>
  );
}

/* =========== Homepage promo banner (admin-managed, dismissible) =========== */
function PromoBanner({ setPage }) {
  const [promo, setPromo] = React.useState(null);
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    NGGApi.public.siteContent().then(r => {
      if (!alive || !(r && r.promo && r.promo.text)) return;
      setPromo(r.promo);
      // Stay dismissed across visits — until the promo text actually changes.
      try { if (localStorage.getItem("ngg_promo_dismissed") === r.promo.text) setDismissed(true); } catch (_) {}
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const dismiss = () => { setDismissed(true); try { if (promo) localStorage.setItem("ngg_promo_dismissed", promo.text); } catch (_) {} };
  if (!promo || dismissed) return null;
  const go = (e) => {
    if (!promo.ctaUrl) return;
    if (/^https?:\/\//.test(promo.ctaUrl)) return; // let the anchor navigate externally
    e.preventDefault();
    const p = promo.ctaUrl.replace(/^\//, "");
    window.__navigate ? window.__navigate(p) : (setPage && setPage(p));
  };
  return (
    <div style={{ background: "var(--navy-900, #00225F)", color: "#fff", padding: "10px 16px", textAlign: "center", position: "relative", fontSize: 14 }}>
      <span>{promo.text}</span>
      {promo.ctaLabel && promo.ctaUrl ? <a href={/^https?:\/\//.test(promo.ctaUrl) ? promo.ctaUrl : "#"} onClick={go} style={{ color: "var(--gold-400, #F5B026)", fontWeight: 700, marginLeft: 12, textDecoration: "underline" }}>{promo.ctaLabel} →</a> : null}
      <button aria-label="Dismiss" onClick={dismiss} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
    </div>
  );
}

/* =========== Hero — full-bleed cinematic =========== */
function Hero({ setPage }) {
  const session = useSession();
  const stats = useStats();
  const site = useSiteContent();
  // Live badge copy: when we know the session, name it; when it hasn't
  // started yet, show the countdown. Falls back to evergreen copy.
  const daysToStart = sessionDaysToStart(session);
  const liveWord = site.heroEyebrowLive || "Live now";
  const badge = !session
    ? "Applications open · current session"
    : session.isActive
      ? liveWord + " · " + sessionLabel(session, "current session")
      : daysToStart > 0
        ? sessionLabel(session, "Next cohort") + " · starts in " + daysToStart + (daysToStart === 1 ? " day" : " days")
        : "Applications open · " + sessionLabel(session, "next cohort");
  // Hero KPI strip — 4 tiles, real numbers when we have them, evergreen copy
  // as the fallback so the strip never reads as an empty movement.
  const kpiN = (key, evergreen, pad) => {
    if (!stats || !(stats[key] > 0)) return evergreen;
    return pad ? String(stats[key]).padStart(2, "0") : stats[key].toLocaleString() + "+";
  };
  const heroKpis = [
    { value: kpiN("activeMembers", "500+"), label: "Teen creators in motion", gold: false },
    { value: kpiN("missionsVerified", "1,200+"), label: "Anchor missions verified", gold: false },
    { value: kpiN("mentors", "60+"), label: "Volunteer mentors", gold: false },
    { value: kpiN("centres", "02", true), label: "Centres · Alimosho, Lagos", gold: true },
  ];
  const gotwName = site.heroGotwName || "Zara · Voice of Influence";

  return (
    <section style={{ background: "var(--grad-hero)", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "var(--grad-hero-glow)" }}/>
      <div className="container" style={{ maxWidth: 1320, padding: "56px 28px 0", position: "relative" }}>
        <div className="home-hero-cols">
          <div>
            <div data-reveal className="reveal" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: "rgba(111,220,157,0.14)", border: "1px solid rgba(111,220,157,0.4)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint)", animation: "ngg-live-pulse 1.8s infinite" }}/>
              <span className="mono" style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#bff3d4" }}>{badge}</span>
            </div>
            <h1 className="display" style={{ fontWeight: 800, fontSize: "clamp(38px, 5.6vw, 68px)", letterSpacing: "-0.035em", lineHeight: 0.98, margin: "20px 0 14px", color: "#fff" }}>
              {(site.heroTitle1 || "Africa's next geniuses") + " " + (site.heroTitle2 || "are") + " "}
              <span style={{ color: "var(--gold-500)" }}>{site.heroEmphasis || "not waiting"}</span>.
            </h1>
            <p data-reveal className="reveal" style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, maxWidth: 520, margin: "0 0 28px", lineHeight: 1.6 }}>
              {site.heroSubhead || "A twelve-week growth journey for teenagers, 10–17. From summer student to vanguard leader — by mission, mentorship and the discipline of public work."}
            </p>
            <div data-reveal className="reveal" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn-gold btn-lg" onClick={() => setPage("summer")} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {site.heroCtaPrimary || "Join the Summer Programme"} <i className="ph ph-arrow-right"/>
              </button>
              <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("anchor")}>
                {site.heroCtaSecondary || "Explore Anchor 12"}
              </button>
            </div>
          </div>

          {/* Right: a glass card framing the cohort photo + Genius of the Week. */}
          <div className="reveal" data-reveal style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 22, padding: 24, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
            <div style={{ aspectRatio: "4 / 3", borderRadius: 16, overflow: "hidden", position: "relative", background: "var(--navy-hero-end)" }}>
              <img src={scene("heroMain", 1400)} alt="Current cohort" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
              <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(255,255,255,0.6)" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--lime)" }}/>GENIUS OF THE WEEK</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#fff" }}>{gotwName}</span>
            </div>
          </div>
        </div>

        <div className="home-kpi-strip" style={{ marginTop: 52, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {heroKpis.map((k, i) => (
            <div key={i} style={{ padding: "24px 8px 24px 0", borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.1)", paddingLeft: i === 0 ? 0 : 20 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px, 4vw, 44px)", lineHeight: 1, color: k.gold ? "var(--gold-500)" : "#fff" }}>{k.value}</div>
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.62)", marginTop: 10 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========== Stat bar — driven by /api/public/stats.php =========== */
function StatBar() {
  const [stats, setStats] = React.useState(null);
  const [err, setErr]     = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    NGGApi.public.stats()
      .then(r => { if (alive) setStats(r.stats || {}); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  // Hide the whole strip when the endpoint is gone or returned no usable
  // data — better than showing four "0+" tiles, which reads as "this
  // movement has zero people in it" to a first-time visitor.
  if (err) return null;
  if (stats && !stats.activeMembers && !stats.missionsVerified && !stats.mentors && !stats.centres) {
    return null;
  }

  const cells = [
    { num: stats ? stats.activeMembers    : null, suffix: "+", label: "Teen creators in motion" },
    { num: stats ? stats.missionsVerified : null, suffix: "+", label: "Anchor missions verified" },
    { num: stats ? stats.mentors          : null, suffix: "+", label: "Volunteer mentors" },
    { num: stats ? stats.centres          : null, suffix: "",  label: "Centres · Alimosho, Lagos", goldNum: true },
  ];

  return (
    <section style={{background:"var(--navy-900)", color:"white"}}>
      <div className="container" style={{padding:"64px 28px"}}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:0}} aria-busy={!stats}>
          {cells.map((c, i) => {
            const hasNum = typeof c.num === "number" && c.num > 0;
            return (
            <div key={c.label} className="reveal" data-reveal style={{padding:"8px 28px", borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)", "--reveal-delay": (i * 120) + "ms"}}>
              <div className="display" style={{fontSize:96, lineHeight:1, color: c.goldNum ? "var(--gold-500)" : "white"}}>
                {hasNum ? <CountUp to={String(c.num)}/> : <span style={{opacity:0.3}}>—</span>}
                {c.suffix && hasNum && <span style={{color:"var(--gold-500)"}}>{c.suffix}</span>}
              </div>
              <div className="mono" style={{fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase", color:"rgba(255,255,255,0.72)", marginTop:14}}>
                {c.label}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* =========== Progression System =========== */
function ProgressionSystem({ setPage }) {
  const [active, setActive] = useState("club");
  const stage = STAGES.find(s => s.id === active);
  const stageScenes = { summer: "graduation", club: "showcase", vanguard: "speaker", full: "community" };

  const colorMap = {
    gold: { fill: "var(--gold-500)", text: "var(--navy-900)" },
    lime: { fill: "var(--lime)",     text: "var(--navy-900)" },
    coral:{ fill: "var(--coral)",    text: "white" },
    navy: { fill: "var(--navy-900)", text: "var(--gold-500)" },
  };
  const c = colorMap[stage.color];

  return (
    <section className="section" style={{background:"var(--paper)"}}>
      <div className="container">
        <SectionHead
          eyebrow="THE PROGRESSION SYSTEM"
          title={<>From summer student<br/>to <em style={{fontStyle:"normal", color:"var(--coral)"}}>vanguard leader.</em></>}
          sub="Four stages. One trajectory. We do not run drop-in workshops — we operate a structured runway built for visible, public growth."
        />

        {/* Stage selector strip */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14, marginBottom:36}}>
          {STAGES.map((s, i) => {
            const sc = colorMap[s.color];
            const isActive = s.id === active;
            return (
              <button key={s.id} onClick={() => setActive(s.id)}
                style={{
                  position:"relative", textAlign:"left",
                  padding:"22px 24px", borderRadius:20,
                  background: isActive ? sc.fill : "white",
                  color: isActive ? sc.text : "var(--ink-900)",
                  border: isActive ? "2px solid var(--navy-900)" : "1px solid rgba(12,20,50,0.1)",
                  cursor:"pointer", fontFamily:"inherit",
                  transition:"all 0.2s ease",
                }}>
                <div className="mono" style={{fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase", opacity:0.7}}>
                  Stage {s.code}
                </div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize:23, marginTop:8, letterSpacing:"-0.02em", lineHeight:1.05}}>
                  {s.title}
                </div>
                <div style={{display:"flex", alignItems:"center", gap:8, marginTop:16, fontSize:12}}>
                  <span className="mono">AGE {s.age}</span>
                  <span style={{opacity:0.4}}>·</span>
                  <span>{s.tag}</span>
                </div>
                {i < STAGES.length - 1 && (
                  <div style={{position:"absolute", top:"50%", right:-11, width:8, height:8, borderTop:"2px solid rgba(12,20,50,0.2)", borderRight:"2px solid rgba(12,20,50,0.2)", transform:"translateY(-50%) rotate(45deg)"}}/>
                )}
              </button>
            );
          })}
        </div>

        {/* Active stage detail */}
        <div style={{display:"grid", gridTemplateColumns:"1.1fr 1fr", gap:24, alignItems:"stretch"}}>
          <div style={{background:"var(--navy-900)", color:"white", padding:"44px 48px", borderRadius:24, position:"relative", overflow:"hidden"}}>
            <div style={{position:"absolute", top:-30, right:-20, fontFamily:"var(--font-display)", fontSize:280, fontWeight:800, color:"rgba(255,255,255,0.05)", lineHeight:1, letterSpacing:"-0.06em"}}>
              {stage.code}
            </div>
            <div className="eyebrow" style={{color:"var(--gold-500)"}}>STAGE {stage.code} · {stage.tag.toUpperCase()}</div>
            <h3 style={{fontFamily:"var(--font-display)", fontSize:52, lineHeight:1, margin:"16px 0 18px", letterSpacing:"-0.03em"}}>{stage.title}</h3>
            <p style={{fontSize:17, lineHeight:1.55, color:"rgba(255,255,255,0.78)", maxWidth:480}}>{stage.desc}</p>
            <div style={{marginTop:36}}>
              <div className="eyebrow" style={{color:"rgba(255,255,255,0.4)", marginBottom:16}}>What you walk away with</div>
              <div style={{display:"flex", flexDirection:"column", gap:12}}>
                {stage.deliverables.map(d => (
                  <div key={d} style={{display:"flex", alignItems:"center", gap:12, fontSize:15}}>
                    <div style={{width:24, height:24, borderRadius:"50%", background:"var(--gold-500)", display:"grid", placeItems:"center", color:"var(--navy-900)", fontSize:12, fontWeight:700}}>✓</div>
                    {d}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-gold mt-32" onClick={() => setPage(stage.id === "summer" ? "summer" : stage.id === "club" ? "club" : "anchor")}>
              Explore {stage.title} →
            </button>
          </div>

          <div style={{display:"flex", flexDirection:"column", gap:18}}>
            <Photo name={stageScenes[stage.id]} ratio="16/10" overlay style={{height:280}}>
              <div style={{position:"absolute", top:18, left:18, display:"flex", alignItems:"center", gap:8}}>
                <span style={{width:42, height:42, borderRadius:12, background:c.fill, color:c.text, display:"grid", placeItems:"center", fontFamily:"var(--font-display)", fontWeight:800, fontSize:18}}>{stage.code}</span>
                <span className="chip chip-on-dark" style={{background:"rgba(12,20,50,0.55)", color:"white"}}>{stage.tag}</span>
              </div>
              <div style={{position:"absolute", bottom:18, left:18, right:18, color:"white"}}>
                <div className="mono" style={{fontSize:10, letterSpacing:"0.18em"}}>FROM STAGE 0{stage.code}</div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:24, marginTop:4, lineHeight:1.1}}>The shape of the work.</div>
              </div>
            </Photo>
            <div className="card" style={{padding:24}}>
              <div className="eyebrow" style={{color:"var(--ink-500)"}}>Active in this stage</div>
              <div className="display" style={{fontSize:84, color:"var(--navy-900)", marginTop:8, lineHeight:0.95}}>
                {stage.id === "summer" ? "318" : stage.id === "club" ? "164" : stage.id === "vanguard" ? "29" : "06"}
                <span style={{color:"var(--gold-500)"}}>.</span>
              </div>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8}}>
                <div className="mono" style={{fontSize:11, color:"var(--ink-500)"}}>TEEN MEMBERS · LIVE</div>
                <div style={{display:"flex"}}>
                  {[20,21,22,23,24].map((s, i) => (
                    <div key={i} style={{marginLeft: i === 0 ? 0 : -8, border:"2px solid white", borderRadius:"50%"}}>
                      <Avatar seed={s} size={28}/>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========== Flagship Anchor callout =========== */
function FlagshipCallout({ setPage }) {
  const session = useSession();
  // When a session is live, paint the calendar against its real week.
  // No live data? Fall back to a sensible mid-cohort default.
  const totalWeeks = Math.max(1, Math.min(12, (session && session.totalWeeks) || 12));
  const weekOf = Math.max(1, Math.min(totalWeeks, (session && session.weekOf) || 7));
  const pct = Math.round((weekOf / totalWeeks) * 100);

  return (
    <section style={{background:"var(--navy-900)", color:"white", padding:"104px 0", position:"relative", overflow:"hidden"}}>
      {/* Atmospheric background */}
      <div style={{position:"absolute", top:0, right:0, width:"50%", height:"100%", opacity:0.35}}>
        <img src={scene("classroom", 1400)} alt="" style={{width:"100%", height:"100%", objectFit:"cover"}}/>
        <div style={{position:"absolute", inset:0, background:"linear-gradient(90deg, var(--navy-900) 0%, rgba(12,20,50,0.6) 70%, transparent 100%)"}}/>
      </div>
      <div style={{position:"absolute", top:-100, right:-100, width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle, rgba(208,255,58,0.18), transparent 70%)"}}/>
      <div className="container" style={{position:"relative", zIndex:1}}>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:80, alignItems:"center"}}>
          <div>
            <span className="chip chip-on-dark"><span className="deco-star"/> THE FLAGSHIP</span>
            <h2 className="display" style={{fontSize:"clamp(64px, 8vw, 132px)", margin:"22px 0 26px", color:"white", lineHeight:0.86}}>
              Anchor<br/>
              <span style={{color:"var(--lime)"}}>Twelve.</span>
            </h2>
            <p style={{fontSize:21, lineHeight:1.5, color:"rgba(255,255,255,0.82)", maxWidth:540}}>
              Twelve weeks. Fifty missions. One identity, rebuilt in public. Anchor 12 is where summer students become club members and club members become leaders.
            </p>
            <div style={{display:"flex", gap:12, marginTop:36}}>
              <button className="btn btn-lime btn-lg" onClick={() => setPage("anchor")}>Open the dashboard →</button>
              <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("profile")}>See a member's progress</button>
            </div>
          </div>
          <div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8}}>
              {WEEKS.map((w, i) => {
                const idx = i + 1;
                const status = idx < weekOf ? "done" : idx === weekOf ? "current" : "locked";
                return (
                  <div key={w.n} style={{
                    padding:"16px 14px",
                    borderRadius:12,
                    background: status === "done" ? "var(--navy-700)" : status === "current" ? "var(--lime)" : "rgba(255,255,255,0.05)",
                    color: status === "current" ? "var(--navy-900)" : "white",
                    border: status === "current" ? "2px solid var(--lime)" : "1px solid rgba(255,255,255,0.08)",
                    minHeight: 100,
                    display:"flex", flexDirection:"column", justifyContent:"space-between",
                  }}>
                    <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", opacity:0.7}}>WK {String(w.n).padStart(2,"0")}</div>
                    <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, lineHeight:1.05, letterSpacing:"-0.01em"}}>{w.theme}</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:20}}>
              <span className="mono" style={{fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase", color:"rgba(255,255,255,0.65)"}}>
                {session ? `Week ${weekOf} of ${totalWeeks}` : "Cohort progress"}
              </span>
              <span className="display" style={{fontSize:28, color:"var(--lime)"}}>{pct}%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========== Manifesto Marquee =========== */
function ManifestoMarquee() {
  const words = ["Build Talent.", "Build Character.", "Build Africa.", "Not Everybody Is Ready.", "We Are."];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {[0,1].map(loop => (
          <span key={loop} style={{paddingRight:48}}>
            {words.map((w, i) => (
              <React.Fragment key={i}>
                {w}
                <span className="sep">✦</span>
              </React.Fragment>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/* =========== Tracks =========== */
function TracksRibbon({ setPage }) {
  const trackColors = {
    music:  {bg:"var(--gold-500)", fg:"var(--navy-900)"},
    tech:   {bg:"var(--lime)",     fg:"var(--navy-900)"},
    media:  {bg:"var(--coral)",    fg:"white"},
    lead:   {bg:"var(--navy-900)", fg:"var(--gold-500)"},
    arts:   {bg:"var(--plum)",     fg:"white"},
    speak:  {bg:"var(--cream-100)",fg:"var(--navy-900)"},
    comm:   {bg:"var(--navy-700)", fg:"var(--lime)"},
    biz:    {bg:"var(--gold-300)", fg:"var(--navy-900)"},
  };
  return (
    <section className="section">
      <div className="container">
        <SectionHead
          eyebrow="EIGHT TRACKS · ONE GENERATION"
          title="Pick a craft. Build a self around it."
          sub="Each track gets its own mentor team, curriculum and showcase format. Switch any time — we measure character, not commitment to a category."
        />
        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14}}>
          {TRACKS.map((t, i) => {
            const c = trackColors[t.id];
            return (
              <div key={t.id} className="reveal" data-reveal style={{"--reveal-delay": (i * 80) + "ms"}}>
                <Tilt strength={6}>
                  <div
                    className="track-card"
                    style={{background:c.bg, color:c.fg}}
                    role="button"
                    tabIndex={0}
                    aria-label={"Explore the " + t.name + " track"}
                    onClick={() => setPage("summer")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPage("summer"); } }}
                  >
                    <div className="icon" style={{background:"rgba(255,255,255,0.2)", color:"inherit"}}>{t.icon}</div>
                    <div style={{fontFamily:"var(--font-display)", fontSize:28, fontWeight:800, letterSpacing:"-0.02em", lineHeight:1}}>{t.name}</div>
                    <p style={{fontSize:13, lineHeight:1.4, opacity:0.85, margin:0}}>{t.desc}</p>
                    <div className="num-bg">0{i+1}</div>
                    <div style={{display:"flex", alignItems:"center", gap:6, marginTop:"auto", fontSize:11, fontFamily:"var(--font-mono)", textTransform:"uppercase", letterSpacing:"0.12em", opacity:0.85}}>
                      Explore →
                    </div>
                  </div>
                </Tilt>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* =========== Cinematic community collage =========== */
function CommunityCollage() {
  return (
    <section style={{background:"var(--navy-900)", color:"white", padding:"96px 0"}}>
      <div className="container">
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:48, alignItems:"end", marginBottom:48}}>
          <div>
            <span className="eyebrow" style={{color:"var(--gold-500)"}}>THE MOVEMENT, IN MOTION</span>
            <h2 className="display" style={{fontSize:"clamp(40px, 4.8vw, 68px)", margin:"8px 0 0", color:"white", lineHeight:0.98}}>
              Two centres.<br/>One generation showing up.
            </h2>
          </div>
          <p style={{color:"rgba(255,255,255,0.7)", fontSize:17, lineHeight:1.55, maxWidth:520, margin:0}}>
            CACENTRE Egbeda and CACENTRE Ayobo — both in Alimosho, Lagos. Every Saturday, teenagers from across the LGA convene in person. Here is what the room looks like.
          </p>
        </div>

        {/* Asymmetric photo grid */}
        <div style={{display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gridTemplateRows:"260px 260px", gap:12}}>
          <Photo name="dance" ratio="auto" style={{gridRow:"1 / 3", height:"100%"}} overlay>
            <div style={{position:"absolute", bottom:20, left:20, color:"white"}}>
              <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", color:"var(--gold-400)"}}>SHOWCASE · LAGOS</div>
              <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:28, marginTop:4, lineHeight:1}}>Saturday night.</div>
            </div>
          </Photo>
          <Photo name="techLab" ratio="auto" style={{height:"100%"}}/>
          <Photo name="art" ratio="auto" style={{height:"100%"}}/>
          <Photo name="speaker" ratio="auto" style={{height:"100%"}}/>
          <Photo name="mentor" ratio="auto" style={{height:"100%"}}/>
        </div>
      </div>
    </section>
  );
}

/* =========== Testimonials =========== */
function Testimonials() {
  const sceneFor = ["studio", "graduation", "techLab", "speaker"];
  return (
    <section className="section" style={{background:"var(--cream-50)"}}>
      <div className="container">
        <SectionHead
          eyebrow="THE KIND OF STORY WE BUILD"
          title="The work shows in the people."
          sub="Illustrative of the journey a member goes through — a teenager who ships, a parent who sees the change, a mentor who keeps showing up. Real, named stories replace these as our first cohorts graduate."
        />
        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:18}}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="card" style={{padding:0, display:"flex", flexDirection:"column", overflow:"hidden", border:"1px solid rgba(12,20,50,0.07)"}}>
              <div className="zoom-on-hover" style={{position:"relative", height:200}}>
                <Photo name={sceneFor[i]} ratio="auto" style={{height:"100%", borderRadius:0}}/>
                <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 40%, rgba(12,20,50,0.55) 100%)"}}/>
                <div style={{position:"absolute", bottom:14, left:14, display:"flex", alignItems:"center", gap:10}}>
                  <div style={{border:"2px solid white", borderRadius:"50%"}}>
                    <Avatar seed={t.from} name={t.from} size={36}/>
                  </div>
                  <div style={{color:"white"}}>
                    <div style={{fontSize:13, fontWeight:700}}>{t.from}</div>
                    <div className="mono" style={{fontSize:10, color:"rgba(255,255,255,0.8)", letterSpacing:"0.1em"}}>{t.role.toUpperCase()}</div>
                  </div>
                </div>
              </div>
              <div style={{padding:24, display:"flex", flexDirection:"column", gap:12, flex:1}}>
                <div style={{fontFamily:"var(--font-display)", fontSize:48, lineHeight:0.5, color:"var(--gold-500)", marginTop:-4}}>"</div>
                <p style={{fontSize:14, lineHeight:1.55, margin:0, flex:1}}>{t.q}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========== Blog preview =========== */
function BlogPreview({ setPage }) {
  const [feat, ...rest] = BLOG_POSTS;
  const previews = rest.slice(0, 3);
  return (
    <section className="section">
      <div className="container">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"end", marginBottom:36, flexWrap:"wrap", gap:24}}>
          <div style={{maxWidth:600}}>
            <span className="eyebrow" style={{color:"var(--gold-500)"}}>THE JOURNAL</span>
            <h2 className="display" style={{fontSize:"clamp(40px, 5vw, 68px)", margin:"6px 0 0", lineHeight:0.95}}>Notes from the field.</h2>
            <p style={{fontSize:16, color:"var(--ink-500)", marginTop:14, maxWidth:520, lineHeight:1.5}}>
              Long-form writing from mentors, members and the editorial team. Why we work the way we work.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => setPage("blog")}>All articles →</button>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:24}}>
          <article style={{cursor:"pointer"}} onClick={() => setPage("blog")}>
            <div className="zoom-on-hover" style={{borderRadius:18, overflow:"hidden"}}>
              <Photo src={blogCover(feat.cover, 1400, 800)} ratio="16/10" style={{height:420, borderRadius:0}}/>
            </div>
            <div style={{marginTop:20}}>
              <div style={{display:"flex", alignItems:"center", gap:10, fontSize:12}}>
                <span className="chip chip-gold">{feat.category}</span>
                <span className="mono" style={{color:"var(--ink-500)"}}>{feat.date} · {feat.read}</span>
              </div>
              <h3 style={{fontFamily:"var(--font-display)", fontSize:38, fontWeight:700, lineHeight:1.05, letterSpacing:"-0.025em", margin:"12px 0 10px"}}>{feat.title}</h3>
              <p style={{fontSize:15, lineHeight:1.55, color:"var(--ink-500)", margin:0}}>{feat.excerpt}</p>
              <div style={{display:"flex", alignItems:"center", gap:10, marginTop:16}}>
                <Avatar seed={feat.author.portrait} size={32}/>
                <div style={{fontSize:13}}>
                  <b>{feat.author.name}</b>
                  <span style={{color:"var(--ink-500)"}}> · {feat.author.role}</span>
                </div>
              </div>
            </div>
          </article>
          <div style={{display:"flex", flexDirection:"column", gap:18}}>
            {previews.map(p => (
              <article key={p.id} style={{display:"grid", gridTemplateColumns:"140px 1fr", gap:16, cursor:"pointer"}} onClick={() => setPage("blog")}>
                <Photo src={blogCover(p.cover, 400, 400)} ratio="1/1" style={{height:140}}/>
                <div>
                  <div style={{display:"flex", gap:8, alignItems:"center"}}>
                    <span className="chip" style={{fontSize:10, padding:"3px 8px"}}>{p.category}</span>
                    <span className="mono" style={{fontSize:10, color:"var(--ink-500)"}}>{p.read}</span>
                  </div>
                  <h4 style={{fontFamily:"var(--font-display)", fontSize:20, lineHeight:1.1, letterSpacing:"-0.015em", margin:"8px 0 8px", fontWeight:700}}>{p.title}</h4>
                  <p style={{fontSize:13, color:"var(--ink-500)", margin:0, lineHeight:1.45, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{p.excerpt}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========== Closing CTA =========== */
function ClosingCTA({ setPage }) {
  const session = useSession();
  const cohortLine = session
    ? (session.isActive ? "CURRENT SESSION · " : "NEXT COHORT · ") + sessionLabel(session, "").toUpperCase()
    : "NEXT COHORT · COMING SOON";
  const applyLabel = session && !session.isActive
    ? "Apply for " + sessionLabel(session, "the next session") + " →"
    : "Apply for the next session →";
  return (
    <section style={{background:"var(--gold-500)", color:"var(--navy-900)", padding:"112px 0", position:"relative", overflow:"hidden"}}>
      {/* Decorative photo strip */}
      <div style={{position:"absolute", inset:0, opacity:0.18}}>
        <img src={scene("showcase", 2000)} alt="" style={{width:"100%", height:"100%", objectFit:"cover"}}/>
      </div>
      <div className="container" style={{textAlign:"center", position:"relative"}}>
        <span className="mono" style={{fontSize:11, letterSpacing:"0.22em", textTransform:"uppercase"}}>{cohortLine}</span>
        <h2 className="display" style={{fontSize:"clamp(60px, 9vw, 152px)", margin:"24px auto", maxWidth:1100, lineHeight:0.88}}>
          Not everybody is<br/>
          ready to lead the future.
        </h2>
        <p style={{fontSize:20, maxWidth:600, margin:"0 auto", lineHeight:1.5}}>
          But somebody is. Maybe it is the teenager in your house. Maybe it is you.
        </p>
        <div style={{display:"flex", gap:12, justifyContent:"center", marginTop:40, flexWrap:"wrap"}}>
          <button className="btn btn-primary btn-lg" onClick={() => setPage("join")}>{applyLabel}</button>
          <button className="btn btn-ghost btn-lg" style={{borderColor:"var(--navy-900)"}} onClick={() => setPage("parents")}>For parents</button>
        </div>
      </div>
    </section>
  );
}

/* =========== Upcoming events — driven by /api/public/events.php ===========
   Renders nothing until at least one published, public, upcoming event exists,
   so the marketing page never shows an empty shell. */
function EventsBand({ setPage }) {
  const [events, setEvents] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.public.events()
      .then(r => { if (alive) setEvents((r.events || []).slice(0, 3)); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, []);

  if (!events || events.length === 0) return null;

  const fmt = (iso) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    catch (_) { return iso; }
  };

  return (
    <section className="section" style={{ background: "var(--cream-50)" }}>
      <div className="container">
        <SectionHead eyebrow="WHAT'S COMING UP" title="Events & open days." sub="Showcases, open days and community sessions. Everyone's welcome — come see the work in the room." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {events.map((e, i) => (
            <div key={e.eventId} className="card reveal" data-reveal style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", "--reveal-delay": (i * 60) + "ms" }}>
              {e.coverUrl
                ? <Photo src={e.coverUrl} ratio="16/9" style={{ borderRadius: 0 }}/>
                : <div style={{ aspectRatio: "16/9", background: "linear-gradient(135deg, var(--navy-900), #1b2a63)" }}/>}
              <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <div className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--coral)", textTransform: "uppercase" }}>{fmt(e.startAt)}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>{e.title}</div>
                {e.location && <div style={{ fontSize: 13, color: "var(--ink-500)" }}>📍 {e.location}{e.centre && e.centre !== "Both" ? " · " + e.centre : ""}</div>}
                {e.body && <p style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.5, margin: 0 }}>{String(e.body).slice(0, 140)}{String(e.body).length > 140 ? "…" : ""}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   PUBLIC STATUS PAGE (/s-status) — a live, PII-free transparency board.
   Aggregate numbers only: no child name or photo ever appears here.
   (Legacy /status transparently resolves here — see pageFromPath in app.jsx.)
   ============================================================================ */
function relAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}
function rateTone(r) { return r >= 85 ? "#2f9e44" : r >= 60 ? "#e8a92b" : "#e03131"; }

function statusBg(r) { return r >= 85 ? "rgba(47,158,68,0.12)" : r >= 60 ? "rgba(232,169,43,0.16)" : "rgba(224,49,49,0.12)"; }
function statusLabel(r) { return r >= 85 ? "On track" : r >= 60 ? "Watch" : "Needs attention"; }

// Shared "find us" card for a centre-detail view — location, meeting schedule
// and the centre lead. The lead is PII-safe (first name only with consent, else
// an anonymous handle + role initial), exactly as the backend supplies it.
const CENTRE_LEAD_ROLE = { admin: "Admin / Ops lead", mentor: "Lead mentor", instructor: "Lead instructor" };
function CentreFindUs({ meta, accent }) {
  if (!meta) return null;
  const area = meta.area || "", address = meta.address || "", meetDays = meta.meetDays || "", meetTime = meta.meetTime || "", lead = meta.lead || null;
  if (!area && !address && !meetDays && !meetTime && !lead) return null;
  const a = accent || "#3b5bdb";
  const eyebrow = { fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8088a6", marginBottom: 8 };
  const sub = { fontSize: 12.5, color: "#5a6488", marginTop: 3, lineHeight: 1.4 };
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: 22, marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 22 }}>
      {(area || address) && <div>
        <div style={eyebrow}>Find us</div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <i className="ph ph-map-pin" style={{ color: a, fontSize: 18, marginTop: 1 }}/>
          <div><b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#0a1130" }}>{area || address}</b>{area && address ? <div style={sub}>{address}</div> : null}</div>
        </div>
      </div>}
      {(meetDays || meetTime) && <div>
        <div style={eyebrow}>When we meet</div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <i className="ph ph-calendar-check" style={{ color: a, fontSize: 18 }}/>
          <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#0a1130" }}>{[meetDays, meetTime].filter(Boolean).join(" · ")}</b>
        </div>
      </div>}
      {lead && <div>
        <div style={eyebrow}>Centre lead</div>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: a, position: "relative", overflow: "hidden", flex: "0 0 auto", display: "grid", placeItems: "center" }}>
            <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16, color: "rgba(255,255,255,0.92)" }}>{lead.initial}</span>
            {lead.face ? <img src={lead.face} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/> : null}
          </div>
          <div><b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#0a1130" }}>{lead.name || lead.handle}</b><div style={sub}>{CENTRE_LEAD_ROLE[lead.role] || "Centre lead"}</div></div>
        </div>
      </div>}
    </div>
  );
}
function sFmt(n) { return (n == null ? 0 : n).toLocaleString("en-US"); }
function joinNames(arr) { return arr.length <= 1 ? (arr[0] || "") : arr.length === 2 ? arr[0] + " & " + arr[1] : arr.slice(0, -1).join(", ") + " & " + arr[arr.length - 1]; }

/* Poll a public live board.
 *
 * One request in flight at a time, and the interval backs off while the origin
 * is unreachable. A fixed poll against a dead server stacks up calls that each
 * take the best part of a minute to fail, so the tab ends up nursing a queue of
 * doomed requests instead of showing one honest error.
 *
 * Also owns the count-up animation, which both boards drive identically off a
 * fresh payload. Returns { d, err, t, updatedAt, retry }. */
function usePolledBoard(fetcher, baseMs) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [t, setT] = React.useState(1);
  const [updatedAt, setUpdatedAt] = React.useState(Date.now());
  const animRef = React.useRef(null);
  const inFlight = React.useRef(false), fails = React.useRef(0), lastTry = React.useRef(0);
  const fetchRef = React.useRef(fetcher);
  fetchRef.current = fetcher;

  const load = React.useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true; lastTry.current = Date.now();
    fetchRef.current()
      .then(r => {
        fails.current = 0; setD(r.status || r); setErr(""); setUpdatedAt(Date.now());
        clearInterval(animRef.current); const t0 = Date.now();
        animRef.current = setInterval(() => {
          const p = Math.min(1, (Date.now() - t0) / 900); setT(1 - Math.pow(1 - p, 3));
          if (p >= 1) clearInterval(animRef.current);
        }, 40);
      })
      .catch(e => { fails.current++; setErr(e.code || e.message); })
      .then(() => { inFlight.current = false; });
  }, []);
  // A manual retry starts over at the fast cadence.
  const retry = React.useCallback(() => { fails.current = 0; load(); }, [load]);
  React.useEffect(() => {
    load();
    const poll = setInterval(() => {
      if (document.hidden) return;
      // Base cadence while healthy, doubling per consecutive failure, capped
      // at 16× (~8 min for the 30s board, ~12 min for the 45s one).
      const wait = baseMs * Math.pow(2, Math.min(4, fails.current));
      if (Date.now() - lastTry.current >= wait - 500) load();
    }, baseMs);
    return () => { clearInterval(poll); clearInterval(animRef.current); };
  }, [load, baseMs]);
  return { d, err, t, updatedAt, retry };
}
// A board is unreachable rather than broken when the request never got a reply.
function boardOffline(err) { return err === "timeout" || err === "network"; }

function StatusPage({ setPage, previewConfig }) {
  const [, setTick] = React.useState(0);
  const [view, setView] = React.useState("overview");
  const [sortKey, setSortKey] = React.useState("rate");
  const [openCentre, setOpenCentre] = React.useState(null);
  const [tf, setTf] = React.useState("week");
  const [facFilter, setFacFilter] = React.useState("All");
  const [centreFilter, setCentreFilter] = React.useState("All");
  const [daySel, setDaySel] = React.useState("Fri");
  const { d, err, t, updatedAt, retry } = usePolledBoard(NGGApi.public.status, 30000);

  React.useEffect(() => {
    const clock = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(clock);
  }, []);

  const page = previewConfig || (d && d.page) || {};
  if (!previewConfig && d && d.page && d.page.published === false) return (
    <div className="page" data-screen-label="Live status">
      <section className="section" style={{ padding: "120px 0", textAlign: "center" }}>
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="eyebrow">LIVE STATUS</div>
          <h1 className="display" style={{ fontSize: "clamp(32px,5vw,56px)", margin: "12px 0 10px" }}>This board is offline.</h1>
          <p style={{ color: "var(--ink-500)", fontSize: 16, lineHeight: 1.6 }}>The live attendance board isn't published right now. Check back soon.</p>
          <button className="btn btn-primary mt-24" onClick={() => setPage && setPage("home")}>Back to home →</button>
        </div>
      </section>
    </div>
  );
  // Don't render a zero-filled board on a fetch error — that reads as a dead
  // program. Show a clear retry instead until data arrives.
  if (!previewConfig && err && !d) return (
    <div className="page" data-screen-label="Live status">
      <section className="section" style={{ padding: "110px 0", textAlign: "center" }}>
        <div className="container" style={{ maxWidth: 520 }}>
          <div className="eyebrow">LIVE STATUS</div>
          <h1 className="display" style={{ fontSize: "clamp(28px,4vw,46px)", margin: "12px 0 10px" }}>{boardOffline(err) ? "We can't reach the server." : "We couldn't load the board."}</h1>
          <p style={{ color: "var(--ink-500)", fontSize: 16, lineHeight: 1.6 }}>{boardOffline(err)
            ? "This isn't your device or connection — the site's server isn't answering. The board comes back on its own once it does."
            : "A quick hiccup reaching the live numbers — give it another try."}</p>
          <button className="btn btn-primary mt-24" onClick={retry}>Retry</button>
        </div>
      </section>
    </div>
  );

  const accent = page.accent || "#d0ff3a";
  const banner = page.banner || {};
  const ci = (n) => Math.round((n || 0) * t);
  const k = (d && d.kpis) || {}, dl = (d && d.deltas) || {};
  const centresRaw = (d && d.byCentre) || [];
  const members = (d && d.members) || [];
  const week = (d && d.program && d.program.week) || 0;
  const yearName = (page.title || (d && d.program && d.program.name) || "Summer School") + " " + ((d && d.program && d.program.year) || new Date().getFullYear());

  const enrolled = centresRaw.reduce((s, c) => s + (c.enrolled || 0), 0);
  const present = centresRaw.reduce((s, c) => s + (c.present || 0), 0);
  const late = centresRaw.reduce((s, c) => s + (c.late || 0), 0);
  const onTime = Math.max(0, present - late);
  const rate = enrolled ? Math.round(present / enrolled * 100) : 0;
  const metric = tf === "week" ? "weekPoints" : "points";
  const tfLabel = tf === "week" ? "this week" : "all time";

  const secAgo = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  const updatedAgo = secAgo < 60 ? secAgo + "s ago" : Math.floor(secAgo / 60) + "m ago";

  const tabBase = { fontFamily: "'Inter',sans-serif", fontSize: 14.5, fontWeight: 600, padding: "14px 6px", border: "none", background: "none", cursor: "pointer", borderBottom: "2.5px solid transparent", marginBottom: -1, display: "inline-flex", alignItems: "center", marginRight: 6 };
  const tabStyle = (kk) => ({ ...tabBase, color: view === kk ? "#fff" : "rgba(255,255,255,0.55)", borderBottomColor: view === kk ? "#f5b026" : "transparent" });
  const tabs = [["overview", "Overview", "ph-chart-bar"], ["centres", "Centres", "ph-buildings"], ["leaderboard", "Leaderboard", "ph-trophy"]];
  const heroSub = view === "overview"
    ? ("Week " + week + " · " + (page.tagline || "A public, PII-free view of attendance and participation across every centre."))
    : view === "centres"
    ? "Six centres, one mission. Explore each centre's activities, faculties and member leaderboard."
    : "The students showing up and leading the way — ranked by points earned across every centre.";

  // KPI deltas
  const dUp = (txt) => ({ deltaBg: "rgba(47,158,68,0.12)", deltaColor: "#2f9e44", deltaIcon: "ph-arrow-up", deltaText: txt });
  const dDown = (txt) => ({ deltaBg: "rgba(224,49,49,0.10)", deltaColor: "#e03131", deltaIcon: "ph-arrow-down", deltaText: txt });
  const dFlat = (txt) => ({ deltaBg: "rgba(28,42,94,0.06)", deltaColor: "#5a6488", deltaIcon: "ph-minus", deltaText: txt });
  const dd = (v, unit) => v > 0 ? dUp("+" + v + unit) : v < 0 ? dDown(v + unit) : dFlat("no change");
  const kpis = [
    { icon: "ph-buildings", tintBg: "rgba(28,42,94,0.08)", iconColor: "#1c2a5e", value: sFmt(ci(k.centres)), label: "Centres running", valueColor: "#0a1130", ...dFlat("no change") },
    { icon: "ph-graduation-cap", tintBg: "rgba(176,124,255,0.15)", iconColor: "#6a3fc0", value: sFmt(ci(k.enrolled)), label: "Students enrolled", valueColor: "#0a1130", ...dd(dl.enrolledNew || 0, " today") },
    { icon: "ph-check-circle", tintBg: "rgba(47,158,68,0.14)", iconColor: "#2f9e44", value: sFmt(ci(k.presentToday)), label: "Present today", valueColor: "#0a1130", ...dd(dl.presentDelta || 0, " today") },
    { icon: "ph-alarm", tintBg: "rgba(245,176,38,0.16)", iconColor: "#a07400", value: sFmt(ci(onTime)), label: "On time today", valueColor: "#0a1130", deltaBg: late > 0 ? "rgba(224,49,49,0.10)" : "rgba(47,158,68,0.12)", deltaColor: late > 0 ? "#e03131" : "#2f9e44", deltaIcon: late > 0 ? "ph-timer" : "ph-check", deltaText: late > 0 ? ci(late) + " late" : "all on time" },
    { icon: "ph-chart-line-up", tintBg: "rgba(245,176,38,0.16)", iconColor: "#a07400", value: ci(k.attendanceRate) + "%", label: "Attendance rate", valueColor: rateTone(k.attendanceRate || 0), ...dd(dl.rateDelta || 0, " pts") },
    { icon: "ph-handshake", tintBg: "rgba(59,91,219,0.14)", iconColor: "#3b5bdb", value: sFmt(ci(k.activeVolunteers)), label: "Active volunteers", valueColor: "#0a1130", ...dd(dl.volNew || 0, " today") },
    { icon: "ph-star", tintBg: "rgba(245,176,38,0.16)", iconColor: "#a07400", value: sFmt(ci(k.starsThisWeek)), label: "Stars this week", valueColor: "#0a1130", ...dd(dl.starsToday || 0, " today") },
  ];
  // Intake belongs in the at-a-glance row too, not only in its own section
  // further down — "how many signed up" is the first question anyone asks.
  if (k.registered != null) kpis.push(
    { icon: "ph-user-plus", tintBg: "rgba(176,124,255,0.15)", iconColor: "#6a3fc0", value: sFmt(ci(k.registered)), label: "Registered", valueColor: "#0a1130", ...dd((d && d.registration && d.registration.today) || 0, " today") },
    { icon: "ph-shield-check", tintBg: "rgba(47,158,68,0.14)", iconColor: "#2f9e44", value: sFmt(ci(k.consentVerified)), label: "Consent verified", valueColor: "#0a1130",
      deltaBg: (k.consentPending || 0) > 0 ? "rgba(232,169,43,0.16)" : "rgba(47,158,68,0.12)",
      deltaColor: (k.consentPending || 0) > 0 ? "#a07400" : "#2f9e44",
      deltaIcon: (k.consentPending || 0) > 0 ? "ph-hourglass-medium" : "ph-check",
      deltaText: (k.consentPending || 0) > 0 ? k.consentPending + " pending" : "all in" },
  );

  /* Registration (intake). Separate from attendance on purpose: attendance
     says how the programme is RUNNING, registration says how it is FILLING,
     and a board that only shows the first can look healthy while nobody is
     signing up. `enrolled` counts active students; `reg.total` counts every
     sign-up ever, because a withdrawal is still a registration that happened.

     Guarded with `|| {}` so a frontend deployed ahead of the API renders the
     attendance board as before rather than throwing on the whole page. */
  const reg = (d && d.registration) || null;
  const regTrend = ((reg && reg.trend) || []).slice(-14);
  const regMax = Math.max(1, ...regTrend.map(x => x.signups || 0));
  // Capacity is optional per centre. With none set, a "0 places" fill bar
  // would read as "the programme is full" — say nothing instead of lying.
  const hasCapacity = !!(reg && reg.capacity > 0);
  const regCentres = hasCapacity
    ? [...centresRaw].filter(c => (c.capacity || 0) > 0).sort((a, b) => (b.fill || 0) - (a.fill || 0))
    : [];
  const fillTone = (f) => f >= 100 ? "#e03131" : f >= 85 ? "#e8a92b" : "#2f9e44";

  // Centre table (sorted)
  const sorted = [...centresRaw].sort((a, b) => sortKey === "name" ? a.name.localeCompare(b.name) : sortKey === "present" ? (b.present - a.present) : (b.rate - a.rate));
  const segBase = { fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, padding: "7px 15px", border: "none", cursor: "pointer", borderRadius: 999, transition: "all .15s ease" };
  const segStyle = (on) => ({ ...segBase, background: on ? "#0c1432" : "transparent", color: on ? "#fff" : "#2a335c" });

  // Trend
  const trendArr = ((d && d.trend) || []).slice(-14);
  const maxTrend = Math.max(1, ...trendArr.map(x => x.present || 0));
  const avg = trendArr.length ? Math.round(trendArr.reduce((s, x) => s + (x.present || 0), 0) / trendArr.length) : 0;
  const avgBottom = Math.round(avg / maxTrend * 150);
  const momentumDiff = trendArr.length >= 4 ? (trendArr[trendArr.length - 1].present - trendArr[trendArr.length - 4].present) : 0;

  // Insights
  const absent = enrolled - present;
  const split = { present, onTime, late, absent, total: enrolled, presentLabel: present + " present", absentLabel: absent + " absent", pctLabel: rate + "% present · " + (100 - rate) + "% absent" };
  const atRisk = centresRaw.filter(c => c.rate < 75);
  const atRiskAbsent = atRisk.reduce((s, c) => s + ((c.enrolled || 0) - (c.present || 0)), 0);
  const rates = centresRaw.map(c => c.rate);
  const spread = rates.length ? Math.max(...rates) - Math.min(...rates) : 0;
  const best = [...centresRaw].sort((a, b) => b.rate - a.rate)[0] || { name: "—", rate: 0 };
  const insightsSummary = "Attendance is holding at " + rate + "% " + (momentumDiff >= 0 ? "and trending up week-on-week — " : "— ") + (atRisk.length ? atRisk.length + (atRisk.length === 1 ? " centre needs" : " centres need") + " a closer look before Friday." : "and every centre is on track.");
  const insights = [
    { col: "#2f9e44", edge: "#2f9e44", tintBg: "rgba(47,158,68,0.12)", icon: "ph-trend-up", title: "Momentum", stat: (momentumDiff >= 0 ? "+" : "") + momentumDiff, note: "more students present than three sessions ago — the strongest run this fortnight." },
    { col: "#a07400", edge: "#f5b026", tintBg: "rgba(245,176,38,0.16)", icon: "ph-trophy", title: "Top centre", stat: best.rate + "%", note: best.name + " leads every centre today. A good model for the others." },
    atRisk.length
      ? { col: "#b26f00", edge: "#e8a92b", tintBg: "rgba(232,169,43,0.16)", icon: "ph-warning-circle", title: "Needs attention", stat: String(atRisk.length), note: atRiskAbsent + " students absent across " + joinNames(atRisk.map(c => c.name)) + ". Worth a follow-up call." }
      : { col: "#2f9e44", edge: "#2f9e44", tintBg: "rgba(47,158,68,0.12)", icon: "ph-check-circle", title: "All clear", stat: "0", note: "every centre is above 75% today." },
    { col: "#1c2a5e", edge: "#1c2a5e", tintBg: "rgba(28,42,94,0.08)", icon: "ph-arrows-horizontal", title: "Spread", stat: spread + " pts", note: "between the strongest and weakest centre — tighten this to lift the average." },
  ];

  // Leaderboard helpers
  const decorate = (m, rank) => {
    const dir = m.move > 0 ? "up" : m.move < 0 ? "down" : "same";
    const medal = rank === 1 ? "#f5b026" : rank === 2 ? "#c3ccdb" : rank === 3 ? "#cd8a4e" : null;
    /* Named and pictured ONLY where the backend said so. It sends `name` and
       `photo` as null unless the guardian granted "Feature on our website"
       (and, for the picture, "Photos & media" as well), so the decision lives
       in one place and this side cannot invent one. Everyone else keeps the
       handle they always had — declining changes nothing else about the row. */
    const named = !!m.name;
    return {
      rank,
      handle: named ? m.name : "@" + m.handle,
      subHandle: named ? "@" + m.handle : "",
      photo: m.photo || "",
      initial: ((named ? m.name : m.handle)[0] || "?").toUpperCase(),
      color: m.color, faculty: m.faculty, centre: m.centre,
      stars: m.stars, streak: m.streak, scoreLabel: sFmt(metric === "weekPoints" ? m.weekPoints : m.points),
      metaLine: m.faculty + " · " + m.centre + " · " + m.streak + "d streak",
      moveIcon: dir === "up" ? "ph-caret-up" : dir === "down" ? "ph-caret-down" : "ph-minus",
      moveColor: dir === "up" ? "#2f9e44" : dir === "down" ? "#e03131" : "#8088a6",
      moveText: m.move === 0 ? "–" : String(Math.abs(m.move)),
      rankBg: medal || "rgba(28,42,94,0.07)", rankColor: medal ? "#0c1432" : "#2a335c",
    };
  };
  const facultyOpts = ["All", ...((d && d.faculties) || [])];
  const centreOpts = ["All", ...centresRaw.map(c => c.name)];
  let lbPool = [...members];
  if (centreFilter !== "All") lbPool = lbPool.filter(m => m.centre === centreFilter);
  if (facFilter !== "All") lbPool = lbPool.filter(m => m.faculty === facFilter);
  lbPool.sort((a, b) => b[metric] - a[metric]);
  const lbCount = lbPool.length;
  const leaderboard = lbPool.slice(0, 25).map((m, i) => decorate(m, i + 1));
  const podium = [leaderboard[1], leaderboard[0], leaderboard[2]].filter(Boolean).map(p => ({
    ...p, avatarSize: p.rank === 1 ? 74 : 58, podiumHeight: p.rank === 1 ? 132 : p.rank === 2 ? 104 : 88,
    medalColor: p.rank === 1 ? "#f5b026" : p.rank === 2 ? "#c3ccdb" : "#cd8a4e",
  }));

  // Centre detail
  const dc = openCentre ? centresRaw.find(c => c.code === openCentre) : null;
  let detail = null;
  if (dc) {
    const allMem = members.filter(m => m.centre === dc.name);
    const facSet = [...new Set(allMem.map(m => m.faculty))];
    const avgStars = allMem.length ? Math.round(allMem.reduce((s, m) => s + m.stars, 0) / allMem.length) : 0;
    const chipBase = { display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'Inter',sans-serif", fontSize: 13.5, fontWeight: 600, padding: "8px 15px", borderRadius: 999, cursor: "pointer", border: "1.5px solid", transition: "all .15s ease" };
    const mkChip = (label, count) => {
      const sel = facFilter === label;
      return { label, count, style: { ...chipBase, background: sel ? "rgba(28,42,94,0.10)" : "#fff", borderColor: sel ? "#0c1432" : "#e5e8ee", color: sel ? "#0c1432" : "#2a335c" },
        badgeStyle: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 700, minWidth: 18, textAlign: "center", padding: "1px 6px", borderRadius: 999, background: sel ? "#0c1432" : "rgba(28,42,94,0.08)", color: sel ? "#fff" : "#5a6488", marginLeft: 8 } };
    };
    const facultyChips = [mkChip("All", allMem.length), ...facSet.map(f => mkChip(f, allMem.filter(m => m.faculty === f).length))];
    const days = ((d.daysByCentre && d.daysByCentre[dc.code]) || []).map(x => x);
    let activities = ((d.activitiesByCentre && d.activitiesByCentre[dc.code]) || []);
    if (facFilter !== "All") activities = activities.filter(a => a.faculty === facFilter);
    let mem = [...allMem]; if (facFilter !== "All") mem = mem.filter(m => m.faculty === facFilter);
    mem.sort((a, b) => b[metric] - a[metric]);
    const detLeaderboard = mem.slice(0, 10).map((m, i) => decorate(m, i + 1));
    detail = {
      name: dc.name, code: dc.code, color: dc.color, rate: dc.rate, tone: rateTone(dc.rate), statusBg: statusBg(dc.rate), statusLabel: statusLabel(dc.rate),
      presentLabel: dc.present + " / " + dc.enrolled, memberCount: allMem.length, facCount: facSet.length, avgStars, weekLabel: "Week " + week,
      facHint: facFilter === "All" ? "Showing all " + allMem.length + " members" : "Filtered to " + facFilter,
      days, facultyChips, activities, activitiesLabel: (facFilter === "All" ? "All activities" : facFilter + " activities") + " · " + activities.length + (activities.length === 1 ? " session" : " sessions"),
      leaderboard: detLeaderboard, hasMembers: detLeaderboard.length > 0, lbCount: detLeaderboard.length,
    };
  }
  const showCentreGrid = view === "centres" && !dc;
  const isOverview = view === "overview" && !dc;
  const isLeaderboard = view === "leaderboard" && !dc;

  return (
    <div className="page" data-screen-label="Live status">
      {banner.text ? <div style={{ background: banner.tone === "warn" ? "#7a2e2e" : banner.tone === "success" ? "#1c5138" : "#1c2a5e", color: "#fff", textAlign: "center", padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>{banner.text}</div> : null}

      <section style={{ background: "linear-gradient(158deg,#0c1432 0%,#16224e 58%,#1d2c63 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(52% 42% at 90% 4%,rgba(245,176,38,0.22),transparent 62%),radial-gradient(44% 48% at 12% 96%,rgba(208,255,58,0.10),transparent 60%)" }}/>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 28px 0", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8ea0d8", display: "flex", alignItems: "center", gap: 8 }}><i className="ph ph-shield-check"/> Transparency board</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: "rgba(255,255,255,0.55)", display: "inline-flex", alignItems: "center", gap: 6 }}><i className="ph ph-clock-countdown"/> Updated {updatedAgo}</span>
              <button onClick={retry} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 13, padding: "8px 15px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", display: "inline-flex", alignItems: "center", gap: 7 }}><i className="ph ph-arrow-clockwise"/> Refresh</button>
            </div>
          </div>

          <div className="hero-cols" style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 44, alignItems: "center", marginTop: 26 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: "rgba(111,220,157,0.14)", border: "1px solid rgba(111,220,157,0.4)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6fdc9d", animation: "statuspulse 1.8s infinite" }}/>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", color: "#bff3d4" }}>LIVE{week ? " · WEEK " + week : ""}</span>
              </div>
              <h1 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(34px,5vw,58px)", letterSpacing: "-0.035em", lineHeight: 0.98, margin: "18px 0 10px" }}>{yearName}</h1>
              <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 15.5, maxWidth: 520, margin: "0 0 24px", lineHeight: 1.55 }}>{heroSub}</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button onClick={() => setPage && setPage(page.ctaPage || "join")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#0c1432", border: "none", background: "linear-gradient(135deg,#ffc34d,#f5b026)", boxShadow: "0 12px 26px -12px rgba(176,124,18,0.7)", display: "inline-flex", alignItems: "center", gap: 8 }}>{page.ctaLabel || "Apply for a place"} <i className="ph ph-arrow-right"/></button>
                <button onClick={() => setPage && setPage("v-status")} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", display: "inline-flex", alignItems: "center", gap: 8 }}>Volunteer status board</button>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 22, padding: "26px 28px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Attendance today</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: accent }}>{k.centres || 0} centres</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, margin: "10px 0 4px" }}>
                <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(56px,8vw,86px)", lineHeight: 0.82, letterSpacing: "-0.04em", color: accent, fontVariantNumeric: "tabular-nums" }}>{ci(rate)}%</span>
                <span style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "rgba(255,255,255,0.8)", paddingBottom: 10 }}>{sFmt(ci(present))} / {sFmt(enrolled)} present</span>
              </div>
              <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,0.12)", marginTop: 14 }}>
                <div style={{ width: rate + "%", background: "linear-gradient(90deg,#6fdc9d,#3fb873)", transition: "width .8s cubic-bezier(.2,.7,.2,1)" }}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 22 }}>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#6fdc9d", fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(onTime))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>On time</div></div>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#f5b026", fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(late))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Late</div></div>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#ffd18a", fontVariantNumeric: "tabular-nums" }}>{sFmt(enrolled - ci(present))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Absent</div></div>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{sFmt(enrolled)}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Enrolled</div></div>
              </div>
              <div style={{ marginTop: 20, padding: "12px 14px", borderRadius: 12, background: "rgba(111,220,157,0.12)", border: "1px solid rgba(111,220,157,0.3)", fontSize: 13.5, color: "#bff3d4", lineHeight: 1.4 }}><i className="ph ph-trend-up" style={{ marginRight: 6 }}/>{momentumDiff >= 0 ? "Up " + momentumDiff + " students vs. three sessions ago" : momentumDiff + " students vs. three sessions ago"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 30, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            {tabs.map(([kk, label, icon]) => (
              <button key={kk} onClick={() => { setView(kk); setOpenCentre(null); }} style={tabStyle(kk)}><i className={"ph " + icon} style={{ marginRight: 7 }}/>{label}</button>
            ))}
          </div>
        </div>
      </section>

      {isOverview && <div className="view">
        <section style={{ padding: "44px 0 8px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", margin: 0 }}>Today at a glance</h2>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8088a6" }}>▲ deltas vs. yesterday</span>
            </div>
            <div className="kpi-grid">
              {kpis.map((kp, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: "20px 20px 18px", boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 22, background: kp.tintBg, color: kp.iconColor }}><i className={"ph " + kp.icon}/></span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 999, background: kp.deltaBg, color: kp.deltaColor }}><i className={"ph " + kp.deltaIcon}/>{kp.deltaText}</span>
                  </div>
                  <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: "-0.03em", marginTop: 16, fontVariantNumeric: "tabular-nums", color: kp.valueColor }}>{kp.value}</div>
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a6488", marginTop: 8 }}>{kp.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {reg && <section data-board-section="registration" style={{ padding: "40px 0 4px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a07400" }}>Places and consent</div>
                <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "8px 0 0" }}>Registration</h2>
              </div>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8088a6" }}>Every sign-up, including withdrawn</span>
            </div>

            <div className="reg-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 16, alignItems: "stretch" }}>
              {/* Headline: total signed up, against capacity when it is set. */}
              <div style={{ background: "linear-gradient(158deg,#0c1432 0%,#1d2c63 100%)", color: "#fff", borderRadius: 18, padding: "26px 26px 24px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Registered</span>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12, margin: "10px 0 0" }}>
                  <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(46px,6vw,68px)", lineHeight: 0.84, letterSpacing: "-0.04em", color: accent, fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(reg.total))}</span>
                  {hasCapacity && <span style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "rgba(255,255,255,0.8)", paddingBottom: 7 }}>of {sFmt(reg.capacity)} places</span>}
                </div>
                {hasCapacity ? <>
                  <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,0.12)", marginTop: 18 }}>
                    <div style={{ width: Math.min(100, reg.fill) + "%", background: "linear-gradient(90deg,#ffcf6b,#f5b026)", transition: "width .8s cubic-bezier(.2,.7,.2,1)" }}/>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: "rgba(255,255,255,0.62)", marginTop: 10 }}>{reg.fill}% of places taken{reg.fill >= 100 ? " · full" : " · " + sFmt(Math.max(0, reg.capacity - reg.total)) + " left"}</div>
                </> : (
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: "rgba(255,255,255,0.5)", marginTop: 18, lineHeight: 1.5 }}>No centre capacities set, so there is no fill rate to show.</div>
                )}
                <div style={{ flex: "1 1 auto", minHeight: 14 }}/>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: 16 }}>
                  <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(reg.today))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Signed up today</div></div>
                  <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(reg.thisWeek))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>This week</div></div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 16 }}>
                {/* Consent is the safeguarding number, so it gets its own card
                    rather than being one figure among several. */}
                <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 18, padding: "22px 24px", boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8088a6" }}>Parent consent</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: statusBg(reg.consentRate), color: rateTone(reg.consentRate) }}><i className={"ph " + (reg.pending > 0 ? "ph-hourglass-medium" : "ph-shield-check")}/>{reg.consentRate}% verified</span>
                  </div>
                  <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "rgba(12,20,50,0.07)", marginTop: 16 }}>
                    <div style={{ width: (reg.consentRate * t) + "%", background: rateTone(reg.consentRate), transition: "width .8s cubic-bezier(.2,.7,.2,1)" }}/>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
                    <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 28, color: "#2f9e44", fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(reg.verified))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a6488", marginTop: 5 }}>Consent verified</div></div>
                    <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 28, color: reg.pending > 0 ? "#a07400" : "#5a6488", fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(reg.pending))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a6488", marginTop: 5 }}>Awaiting a parent</div></div>
                  </div>
                </div>

                {/* Sign-ups per day — the same 14-day window as the attendance
                    trend so the two charts can be read against each other. */}
                <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 18, padding: "20px 24px 16px", boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8088a6" }}>Sign-ups · last {regTrend.length || 14} days</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#5a6488" }}>{sFmt(regTrend.reduce((s, x) => s + (x.signups || 0), 0))} total</span>
                  </div>
                  {regTrend.length ? (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 92, marginTop: 16 }}>
                      {regTrend.map((b, i) => (
                        <div key={i} title={b.date + " · " + b.signups + " sign-up" + (b.signups === 1 ? "" : "s")} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
                          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: "#8088a6", marginBottom: 4 }}>{b.signups}</span>
                          <div style={{ width: "100%", maxWidth: 22, borderRadius: "5px 5px 0 0", background: "linear-gradient(180deg,#6a3fc0,#b07cff)", height: Math.round((b.signups || 0) / regMax * 66 * t) + "px", transition: "height .8s cubic-bezier(.2,.7,.2,1)" }}/>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: "#8088a6", padding: "26px 0 18px", textAlign: "center" }}>No sign-ups in this window.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Per-centre fill. Only where a capacity exists — a centre with
                none has nothing to be a percentage of. */}
            {regCentres.length > 0 && <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 18, padding: "22px 24px", marginTop: 16, boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8088a6", marginBottom: 16 }}>How each centre is filling</div>
              <div style={{ display: "grid", gap: 14 }}>
                {regCentres.map(c => (
                  <div key={c.code} className="reg-centre-row" style={{ display: "grid", gridTemplateColumns: "1.2fr 2.6fr 96px 118px", alignItems: "center", gap: 16 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flex: "0 0 auto" }}/>
                      <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 14.5, color: "#0a1130", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</b>
                    </span>
                    <span style={{ display: "block", height: 9, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 99, width: Math.min(100, c.fill) + "%", transformOrigin: "left", transition: "transform .8s cubic-bezier(.2,.7,.2,1)", transform: "scaleX(" + t.toFixed(3) + ")", background: fillTone(c.fill) }}/>
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: "#2a335c", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{ci(c.registered)} / {c.capacity}</span>
                    <span style={{ justifySelf: "end", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 17, color: fillTone(c.fill), fontVariantNumeric: "tabular-nums" }}>{ci(c.fill)}%</span>
                      {(c.pending || 0) > 0 ? <span style={{ color: "#a07400" }}>· {c.pending} pending</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>}
          </div>
        </section>}

        <section style={{ padding: "48px 0 44px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a07400" }}>Across the centres</div>
                <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "8px 0 0" }}>Centre by centre</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8088a6" }}>Sort</span>
                <div style={{ display: "flex", gap: 4, background: "#f3ecdb", padding: 4, borderRadius: 999 }}>
                  {[["rate", "Rate"], ["present", "Present"], ["name", "Name"]].map(([kk, label]) => (
                    <button key={kk} onClick={() => setSortKey(kk)} style={segStyle(sortKey === kk)}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ border: "1px solid #e5e8ee", borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
              <div className="centre-head">
                {["#", "Centre", "Present", "Attendance", "Rate", "Status"].map((h, i) => <span key={i} style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8088a6", textAlign: i >= 4 ? "right" : "left" }}>{h}</span>)}
              </div>
              {sorted.map((c, i) => (
                <div key={c.code} className="centre-row">
                  <span className="c-rank" style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", fontFamily: "'Sora'", fontWeight: 800, fontSize: 13, color: "#fff", background: c.color }}>{i + 1}</span>
                  <span className="c-name" style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                    <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 16, color: "#0a1130" }}>{c.name}</b>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.06em", color: "#8088a6", marginTop: 3 }}>{c.code}</span>
                  </span>
                  <span className="c-present" style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#2a335c", fontVariantNumeric: "tabular-nums" }}>
                    <span>{ci(c.present)} / {c.enrolled}</span>
                    <span style={{ fontSize: 10, marginTop: 3, color: (c.late || 0) > 0 ? "#a07400" : "#2f9e44" }}>{(c.late || 0) > 0 ? (c.onTime || 0) + " on time · " + c.late + " late" : "all on time"}</span>
                  </span>
                  <span className="c-bar" style={{ display: "block", height: 9, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: "100%", borderRadius: 99, transformOrigin: "left", transition: "transform .8s cubic-bezier(.2,.7,.2,1)", transform: "scaleX(" + (c.rate * t / 100).toFixed(3) + ")", background: rateTone(c.rate) }}/>
                  </span>
                  <span className="c-rate" style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, textAlign: "right", fontVariantNumeric: "tabular-nums", color: rateTone(c.rate) }}>{ci(c.rate)}%</span>
                  <span className="c-status" style={{ justifySelf: "end", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", padding: "5px 11px", borderRadius: 999, background: statusBg(c.rate), color: rateTone(c.rate) }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: rateTone(c.rate) }}/>{statusLabel(c.rate)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background: "#faf6ec", borderTop: "1px solid #e8dec6", borderBottom: "1px solid #e8dec6", padding: "48px 0" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 22, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a07400" }}>The last two weeks</div>
                <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "8px 0 0" }}>Attendance trend</h2>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#5a6488" }}><span style={{ width: 18, borderTop: "1.5px dashed #f5b026", display: "inline-block" }}/>avg {avg} present</span>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 18, padding: "24px 24px 18px", overflowX: "auto" }}>
              <div style={{ minWidth: 520 }}>
                <div style={{ position: "relative", height: 176 }}>
                  {[0, 50, 100, 150].map(b => <div key={b} style={{ position: "absolute", left: 0, right: 0, bottom: b, borderTop: "1px solid #eef0f4" }}/>)}
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: avgBottom, borderTop: "1.5px dashed #f5b026", zIndex: 2 }}/>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 3 }}>
                    {trendArr.map((b, i) => {
                      const isToday = i === trendArr.length - 1;
                      return <div key={i} title={b.date + " · " + b.present + " present"} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 9, color: "#8088a6", marginBottom: 4 }}>{b.present}</span>
                        <div style={{ width: "100%", maxWidth: 24, borderRadius: "5px 5px 0 0", background: isToday ? "linear-gradient(180deg,#f5b026,#ffcf6b)" : "linear-gradient(180deg,#16224e,#3b5bdb)", height: Math.round((b.present || 0) / maxTrend * 150 * t) + "px", transition: "height .8s cubic-bezier(.2,.7,.2,1)" }}/>
                      </div>;
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
                  {trendArr.map((b, i) => { const isToday = i === trendArr.length - 1; return <div key={i} style={{ flex: 1, textAlign: "center", fontFamily: "'JetBrains Mono'", fontSize: 9.5, color: isToday ? "#a07400" : "#8088a6", fontWeight: isToday ? 700 : 400 }}>{String(b.date).slice(5)}</div>; })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "52px 0" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a07400", display: "flex", alignItems: "center", gap: 8 }}><i className="ph ph-sparkle"/> Smart insights</div>
              <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "8px 0 0" }}>What the numbers are saying</h2>
            </div>
            <p style={{ fontFamily: "'Sora'", fontWeight: 600, fontSize: 19, lineHeight: 1.45, letterSpacing: "-0.01em", color: "#2a335c", maxWidth: 720, margin: "14px 0 26px" }}>{insightsSummary}</p>
            <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: "20px 22px", marginBottom: 20, boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a6488" }}>Today's split · {split.total} enrolled</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6" }}>{split.onTime} on time · {split.late} late · {split.absent} absent</span>
              </div>
              <div style={{ display: "flex", height: 36, borderRadius: 10, overflow: "hidden", border: "1px solid #e5e8ee" }}>
                <div style={{ flex: Math.max(0.0001, split.onTime), background: "#2f9e44", display: split.onTime ? "flex" : "none", alignItems: "center", padding: "0 14px", color: "#fff", fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", minWidth: 0 }}><i className="ph ph-check" style={{ marginRight: 6 }}/>{split.onTime} on time</div>
                <div style={{ flex: Math.max(0.0001, split.late), background: "#f5b026", display: split.late ? "flex" : "none", alignItems: "center", padding: "0 14px", color: "#5a3d00", fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", minWidth: 0 }}><i className="ph ph-timer" style={{ marginRight: 6 }}/>{split.late} late</div>
                <div style={{ flex: Math.max(1, split.absent), background: "#f3ecdb", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 14px", color: "#7a5300", fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", minWidth: 0 }}>{split.absentLabel}</div>
              </div>
            </div>
            <div className="insight-grid">
              {insights.map((ins, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderLeft: "4px solid " + ins.edge, borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 18, background: ins.tintBg, color: ins.col }}><i className={"ph " + ins.icon}/></span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a6488" }}>{ins.title}</span>
                  </div>
                  <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: "-0.03em", margin: "16px 0 8px", fontVariantNumeric: "tabular-nums", color: ins.col }}>{ins.stat}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#2a335c" }}>{ins.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>}

      {showCentreGrid && <div className="view">
        <section style={{ padding: "44px 0 56px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Every centre</h2>
            <p style={{ color: "#5a6488", fontSize: 14.5, margin: "0 0 26px" }}>Tap a centre for its activities, faculties and member leaderboard.</p>
            <div className="centre-cards">
              {centresRaw.map(c => {
                const mem = members.filter(m => m.centre === c.name);
                return <button key={c.code} onClick={() => setOpenCentre(c.code)} style={{ textAlign: "left", cursor: "pointer", background: "#fff", border: "1px solid #e5e8ee", borderTop: "4px solid " + c.color, borderRadius: 16, padding: 22, boxShadow: "0 1px 2px rgba(12,20,50,0.05)", fontFamily: "inherit" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 20, color: "#0a1130" }}>{c.name}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6" }}>{c.code}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 6px" }}>
                    <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 38, lineHeight: 1, color: rateTone(c.rate), fontVariantNumeric: "tabular-nums" }}>{c.rate}%</span>
                    <span style={{ fontSize: 13, color: "#5a6488" }}>{c.present} / {c.enrolled} present</span>
                  </div>
                  <span style={{ display: "block", height: 9, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden", marginTop: 6 }}>
                    <span style={{ display: "block", height: "100%", width: "100%", borderRadius: 99, transformOrigin: "left", transform: "scaleX(" + (c.rate / 100).toFixed(3) + ")", background: rateTone(c.rate) }}/>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: "1px solid #eef0f4" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: "#5a6488" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i className="ph ph-users-three"/>{mem.length}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i className="ph ph-stack"/>{new Set(mem.map(m => m.faculty)).size} faculties</span>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Inter'", fontSize: 13, fontWeight: 600, color: "#1c2a5e" }}>View <i className="ph ph-arrow-right"/></span>
                  </div>
                </button>;
              })}
            </div>
          </div>
        </section>
      </div>}

      {detail && <div className="view">
        <section style={{ padding: "32px 0 56px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
            <button onClick={() => setOpenCentre(null)} style={{ fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "#1c2a5e", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, padding: 0, marginBottom: 22 }}><i className="ph ph-arrow-left"/> All centres</button>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ width: 20, height: 56, borderRadius: 8, background: detail.color, display: "block" }}/>
                <div>
                  <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>{detail.name}</h2>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#8088a6" }}>{detail.code} · {detail.weekLabel}</span>
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "7px 13px", borderRadius: 999, background: detail.statusBg, color: detail.tone }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: detail.tone }}/>{detail.statusLabel}</span>
            </div>
            <div className="detail-stats" style={{ marginTop: 24 }}>
              {[[detail.rate + "%", "Attendance", detail.tone], [detail.presentLabel, "Present today", "#0a1130"], [detail.memberCount, "Members", "#0a1130"], [detail.avgStars + "★", "Avg stars", "#a07400"]].map((s, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 14, padding: 18 }}><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 30, color: s[2], fontVariantNumeric: "tabular-nums" }}>{s[0]}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a6488", marginTop: 6 }}>{s[1]}</div></div>
              ))}
            </div>
            <CentreFindUs meta={dc} accent={dc.color}/>
            <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: 22, marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a6488" }}><i className="ph ph-funnel" style={{ marginRight: 6 }}/>Filter by faculty</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6" }}>{detail.facHint}</span>
              </div>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                {detail.facultyChips.map((f, i) => <button key={i} onClick={() => setFacFilter(f.label)} style={f.style}>{f.label}<span style={f.badgeStyle}>{f.count}</span></button>)}
              </div>
              <div style={{ height: 1, background: "#eef0f4", margin: "20px 0" }}/>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a6488" }}><i className="ph ph-calendar-blank" style={{ marginRight: 6 }}/>Attendance by day</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                {detail.days.map((dy, i) => { const sel = daySel === dy.key; return <button key={i} onClick={() => setDaySel(dy.key)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 16px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", minWidth: 64, border: "1.5px solid " + (sel ? "#0c1432" : "#e5e8ee"), background: sel ? "#0c1432" : "#fff", color: sel ? "#fff" : "#2a335c" }}>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.08em" }}>{dy.key}</span>
                  <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 18, lineHeight: 1, marginTop: 4, color: sel ? "#fff" : "#0a1130" }}>{dy.present}</span>
                  <span style={{ fontSize: 9.5, color: sel ? "rgba(255,255,255,0.6)" : "#8088a6" }}>present</span>
                </button>; })}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "36px 0 16px", flexWrap: "wrap" }}>
              <h3 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: 0 }}>{detail.activitiesLabel}</h3>
            </div>
            {detail.activities.length === 0
              ? <div style={{ border: "1px dashed #d9d2c0", borderRadius: 16, padding: 28, textAlign: "center", color: "#8088a6", fontSize: 14 }}>No activities logged for {detail.name} yet.</div>
              : <div className="activity-grid">
                {detail.activities.map((a, i) => (
                  <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ height: 4, background: "#3b5bdb" }}/>
                    <div style={{ aspectRatio: "16/10", position: "relative", background: "#f3ecdb", display: "grid", placeItems: "center" }}>
                      {a.photoUrl ? <img src={a.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : <i className="ph ph-image-square" style={{ fontSize: 30, color: "#c9bfa4" }}/>}
                    </div>
                    <div style={{ padding: "15px 16px 16px", display: "flex", flexDirection: "column", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", fontFamily: "'JetBrains Mono'", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 6, background: "rgba(59,91,219,0.12)", color: "#3b5bdb" }}>{a.faculty}</span>
                        {a.day && <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, color: "#8088a6", display: "inline-flex", alignItems: "center", gap: 5 }}><i className="ph ph-calendar-dot"/>{a.day}</span>}
                      </div>
                      <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 16.5, margin: "11px 0 5px", color: "#0a1130" }}>{a.title}</div>
                      {a.cap && <div style={{ fontSize: 13, color: "#5a6488", lineHeight: 1.45 }}>{a.cap}</div>}
                    </div>
                  </div>
                ))}
              </div>}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "36px 0 14px", flexWrap: "wrap" }}>
              <h3 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: 0 }}><i className="ph-fill ph-trophy" style={{ color: "#f5b026", marginRight: 8 }}/>{detail.name} leaderboard</h3>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6" }}>{detail.lbCount} students · {tfLabel}</span>
            </div>
            {!detail.hasMembers
              ? <div style={{ border: "1px dashed #d9d2c0", borderRadius: 16, padding: 28, textAlign: "center", color: "#8088a6", fontSize: 14 }}>No students in this faculty at {detail.name} yet.</div>
              : <div style={{ border: "1px solid #e5e8ee", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
                {detail.leaderboard.map((m, i) => <LbRow key={i} m={m}/>)}
              </div>}
          </div>
        </section>
      </div>}

      {isLeaderboard && <div className="view">
        <section style={{ padding: "40px 0 24px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
            <div className="filter-bar" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <div>
                <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: 0 }}>Student leaderboard</h2>
                <p style={{ color: "#5a6488", fontSize: 14, margin: "6px 0 0" }}>{lbCount} students ranked by points · {tfLabel}</p>
              </div>
              <div className="filter-bar">
                <div style={{ display: "flex", gap: 4, background: "#f3ecdb", padding: 4, borderRadius: 999 }}>
                  {[["week", "This week"], ["all", "All time"]].map(([kk, label]) => <button key={kk} onClick={() => setTf(kk)} style={segStyle(tf === kk)}>{label}</button>)}
                </div>
                <select value={centreFilter} onChange={e => setCentreFilter(e.target.value)} style={{ fontSize: 13, fontWeight: 500, padding: "8px 12px", borderRadius: 10, border: "1px solid #d9d2c0", background: "#fff", color: "#2a335c", cursor: "pointer" }}>{centreOpts.map(c => <option key={c} value={c}>{c}</option>)}</select>
                <select value={facFilter} onChange={e => setFacFilter(e.target.value)} style={{ fontSize: 13, fontWeight: 500, padding: "8px 12px", borderRadius: 10, border: "1px solid #d9d2c0", background: "#fff", color: "#2a335c", cursor: "pointer" }}>{facultyOpts.map(f => <option key={f} value={f}>{f}</option>)}</select>
              </div>
            </div>
          </div>
        </section>
        <section style={{ background: "linear-gradient(180deg,#0c1432,#16224e)", padding: "40px 0 48px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
            <div className="podium">
              {podium.map((p, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 160, maxWidth: "40vw" }}>
                  <span style={{ width: p.avatarSize, height: p.avatarSize, borderRadius: "50%", display: "grid", placeItems: "center", position: "relative", overflow: "hidden", fontFamily: "'Sora'", fontWeight: 800, fontSize: 22, color: "#fff", background: p.color, border: "3px solid " + p.medalColor, boxShadow: "0 0 0 4px rgba(255,255,255,0.06)" }}>
                    {p.initial}
                    {p.photo ? <img src={p.photo} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }}/> : null}
                  </span>
                  <span style={{ marginTop: 10, fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#fff", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.handle}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{p.faculty} · {p.centre}</span>
                  <div style={{ marginTop: 12, width: "100%", height: p.podiumHeight, borderRadius: "12px 12px 0 0", background: "linear-gradient(180deg," + p.medalColor + ",rgba(255,255,255,0.04))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 12 }}>
                    <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, color: "#0c1432" }}>{p.rank}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, color: "rgba(12,20,50,0.7)", marginTop: 4 }}>{p.scoreLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section style={{ padding: "28px 0 56px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ border: "1px solid #e5e8ee", borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
              <div className="lb-head">
                {["Rank", "Student", "Faculty", "Streak", "Stars", "Points", "±"].map((h, i) => <span key={i} style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8088a6", textAlign: i >= 5 ? "right" : "left" }}>{h}</span>)}
              </div>
              {leaderboard.map((m, i) => <LbRow key={i} m={m}/>)}
            </div>
            {/* This line has to track what the board actually does. It used to
                promise handle-only unconditionally; a student is now named and
                pictured where a guardian asked for it, so saying otherwise
                would be a false assurance to the very parents it is for. */}
            <p style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6", marginTop: 16, display: "flex", alignItems: "flex-start", gap: 7, lineHeight: 1.6 }}><i className="ph ph-lock-simple" style={{ marginTop: 2 }}/><span>Students appear by handle only. A name and photograph are shown for a student whose parent or guardian has given written consent to be featured — and are withdrawn as soon as that consent is.</span></p>
          </div>
        </section>
      </div>}

      <section style={{ background: "#0c1432", color: "#fff", padding: "56px 0 60px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 28px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: "rgba(255,255,255,0.08)", fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d0ff3a" }}/>TRANSPARENCY</span>
          <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(28px,3.6vw,42px)", letterSpacing: "-0.02em", margin: "16px 0 12px" }}>{page.transparencyTitle || "Numbers, not names."}</h2>
          <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 15.5, lineHeight: 1.75, margin: "0 0 24px" }}>{page.transparencyBody || "This board updates live and shows aggregate figures and student handles — how many attended, at which centres, and how participation is trending. A child's record never appears here. A name or photograph appears only where a parent or guardian has consented to it, and disappears the moment that consent is withdrawn. It's how we stay accountable to parents, partners and the community without compromising a single child's privacy."}</p>
          {/* Not editable, and deliberately so. The paragraph above it is
              admin copy, and an older saved version of it still promises that
              a name or photo "never appears here" — which stopped being true
              when consent-based display shipped. This states the actual rule
              underneath whatever copy is in the CMS, so the page cannot make
              a promise about someone's child that the software does not keep. */}
          <p data-board-note="consent-rule" style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "13px 15px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.72)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 24px" }}>
            <i className="ph ph-shield-check" style={{ color: "#d0ff3a", fontSize: 18, marginTop: 1, flex: "0 0 auto" }}/>
            <span>A student is named or pictured on this page only where a parent or guardian has given consent for it. Consent can be withdrawn at any time, and the board stops showing them on its next refresh. To withdraw it, contact us and we will action it the same day.</span>
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setPage && setPage(page.ctaPage || "join")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#0c1432", border: "none", background: "linear-gradient(135deg,#ffc34d,#f5b026)", boxShadow: "0 12px 26px -12px rgba(176,124,18,0.7)", display: "inline-flex", alignItems: "center", gap: 8 }}>{page.ctaLabel || "Apply for a place"} <i className="ph ph-arrow-right"/></button>
            <button onClick={() => setPage && setPage("v-status")} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "transparent", border: "1.5px solid rgba(255,255,255,0.25)" }}>Volunteer status board</button>
          </div>
          <p style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 24 }}>Auto-refreshes every 30s · last updated {updatedAgo}</p>
        </div>
      </section>

      {!d && !err && <div className="container" style={{ padding: "60px 0", textAlign: "center" }}><div className="dash-spinner"/></div>}
      {err && <div className="container" style={{ padding: "30px 0", textAlign: "center", color: "#e03131" }}>Couldn't load the board — <button onClick={retry} style={{ background: "none", border: "none", color: "#1c2a5e", textDecoration: "underline", cursor: "pointer" }}>retry</button>.</div>}
      <style>{`@keyframes statuspulse{0%{box-shadow:0 0 0 0 rgba(111,220,157,0.55)}70%{box-shadow:0 0 0 8px rgba(111,220,157,0)}100%{box-shadow:0 0 0 0 rgba(111,220,157,0)}}
.hero-cols{display:grid}@media(max-width:860px){.hero-cols{grid-template-columns:1fr!important;gap:28px!important}}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:920px){.kpi-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.kpi-grid{grid-template-columns:1fr}}
.insight-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}@media(max-width:1000px){.insight-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.insight-grid{grid-template-columns:1fr}}
@media(max-width:920px){.reg-cols{grid-template-columns:1fr!important}}
@media(max-width:700px){.reg-centre-row{grid-template-columns:1fr auto!important;grid-template-areas:"name pct" "bar bar" "count count";row-gap:7px}.reg-centre-row>*:nth-child(1){grid-area:name}.reg-centre-row>*:nth-child(2){grid-area:bar}.reg-centre-row>*:nth-child(3){grid-area:count;text-align:left!important}.reg-centre-row>*:nth-child(4){grid-area:pct}}
.centre-head,.centre-row{display:grid;grid-template-columns:46px 1.5fr 96px 2.3fr 66px 140px;align-items:center;gap:16px;padding:0 20px}
.centre-head{height:46px;background:#faf6ec;border-bottom:1px solid #e5e8ee}.centre-row{min-height:66px;border-bottom:1px solid #eef0f4}.centre-row:last-child{border-bottom:none}
@media(max-width:820px){.centre-head{display:none}.centre-row{grid-template-columns:38px 1fr auto;grid-template-areas:"rank name rate" "rank present status" "bar bar bar";row-gap:10px;padding:16px 18px;min-height:0}.c-rank{grid-area:rank}.c-name{grid-area:name}.c-present{grid-area:present;justify-self:start}.c-bar{grid-area:bar}.c-rate{grid-area:rate;justify-self:end}.c-status{grid-area:status;justify-self:end}}
.centre-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:900px){.centre-cards{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.centre-cards{grid-template-columns:1fr}}
.activity-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:820px){.activity-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.activity-grid{grid-template-columns:1fr}}
.detail-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}@media(max-width:640px){.detail-stats{grid-template-columns:repeat(2,1fr)}}
.lb-head,.lb-row{display:grid;grid-template-columns:54px 1fr 118px 64px 66px 98px 52px;align-items:center;gap:14px;padding:0 18px}
.lb-head{height:42px;background:#faf6ec;border-bottom:1px solid #e5e8ee}.lb-row{min-height:60px;border-bottom:1px solid #eef0f4}.lb-row:last-child{border-bottom:none}
@media(max-width:820px){.lb-head{display:none}.lb-row{grid-template-columns:46px 1fr auto;grid-template-areas:"rank id score";padding:13px 16px;min-height:0}.lb-rank{grid-area:rank}.lb-id{grid-area:id}.lb-score{grid-area:score;justify-self:end}.lb-fac,.lb-streak,.lb-stars,.lb-move{display:none}}
.podium{display:flex;align-items:flex-end;justify-content:center;gap:16px;flex-wrap:wrap}.filter-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center}`}</style>
    </div>
  );
}

function LbRow({ m }) {
  return (
    <div className="lb-row">
      <span className="lb-rank" style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", fontFamily: "'Sora'", fontWeight: 800, fontSize: 14, background: m.rankBg, color: m.rankColor }}>{m.rank}</span>
      <span className="lb-id" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", position: "relative", overflow: "hidden", fontFamily: "'Sora'", fontWeight: 800, fontSize: 15, color: "#fff", background: m.color }}>
          {m.initial}
          {/* The initial stays underneath: if the photo 404s the avatar
              degrades to the same monogram everyone else has, rather than a
              broken-image icon on a child's row. */}
          {m.photo ? <img src={m.photo} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }}/> : null}
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#0a1130", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.handle}</b>
          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, color: "#8088a6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.subHandle ? m.subHandle + " · " : ""}{m.metaLine}</span>
        </span>
      </span>
      <span className="lb-fac"><span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "rgba(28,42,94,0.06)", color: "#2a335c" }}>{m.faculty}</span></span>
      <span className="lb-streak" style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: "#e8654a", display: "inline-flex", alignItems: "center", gap: 4 }}><i className="ph-fill ph-flame"/>{m.streak}</span>
      <span className="lb-stars" style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: "#a07400", display: "inline-flex", alignItems: "center", gap: 4 }}><i className="ph-fill ph-star"/>{m.stars}</span>
      <span className="lb-score" style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 16, textAlign: "right", color: "#0a1130", fontVariantNumeric: "tabular-nums" }}>{m.scoreLabel}</span>
      <span className="lb-move" style={{ justifySelf: "end", fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: m.moveColor, display: "inline-flex", alignItems: "center", gap: 2 }}><i className={"ph " + m.moveIcon}/>{m.moveText}</span>
    </div>
  );
}

/* ============================================================================
   PUBLIC VOLUNTEER STATUS (/v-status) — a live, PII-free fulfilment board.
   Need vs filled per centre × role × faculty × course. Aggregate counts only;
   no volunteer name, photo or contact ever appears. Click a centre for the
   structured breakdown. Mirrors StatusPage's polling + design language.
   ============================================================================ */
function volTone(r) { return r >= 100 ? "#2f9e44" : r >= 60 ? "#e8a92b" : "#e03131"; }
function volLabel(r) { return r >= 100 ? "Fully staffed" : r >= 60 ? "Needs volunteers" : "Urgent need"; }
const VS_ROLES = ["admin", "mentor", "instructor"];
const VS_ROLE_META = {
  admin: { label: "Admin / Ops", icon: "ph-clipboard-text", color: "#3b5bdb", tintBg: "rgba(59,91,219,0.12)", blurb: "Front desk, logistics" },
  mentor: { label: "Mentor", icon: "ph-compass", color: "#7c4dff", tintBg: "rgba(124,77,255,0.13)", blurb: "Guides & role models" },
  instructor: { label: "Instructor", icon: "ph-chalkboard-teacher", color: "#a07400", tintBg: "rgba(160,116,0,0.13)", blurb: "Teach a course" },
};
const VS_FAC_PALETTE = ["#2f9e44", "#6a3fc0", "#3b5bdb", "#0e7c8c", "#a07400", "#e8654a", "#17a2b8"];
function vsFacColor(f) { let h = 0; for (let i = 0; i < (f || "").length; i++) h = (h * 31 + f.charCodeAt(i)) >>> 0; return VS_FAC_PALETTE[h % VS_FAC_PALETTE.length]; }
function vsJoin(arr) { return arr.length <= 1 ? (arr[0] || "") : arr.length === 2 ? arr[0] + " & " + arr[1] : arr.slice(0, -1).join(", ") + " & " + arr[arr.length - 1]; }

function VolunteerStatusPage({ setPage, previewConfig }) {
  const [, setTick] = React.useState(0);
  const [view, setView] = React.useState("overview");
  const [openCentre, setOpenCentre] = React.useState(null);
  const [sortKey, setSortKey] = React.useState("gap");
  const [roleFilter, setRoleFilter] = React.useState("All");
  const [volRole, setVolRole] = React.useState("All");
  const [volCentre, setVolCentre] = React.useState("All");
  const { d, err, t, updatedAt, retry } = usePolledBoard(NGGApi.public.volunteerStatus, 45000);

  React.useEffect(() => {
    const clock = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(clock);
  }, []);

  const page = previewConfig || (d && d.page) || {};
  if (!previewConfig && d && d.page && d.page.published === false) return (
    <div className="page" data-screen-label="Volunteer status">
      <section className="section" style={{ padding: "120px 0", textAlign: "center" }}>
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="eyebrow">VOLUNTEER STATUS</div>
          <h1 className="display" style={{ fontSize: "clamp(32px,5vw,56px)", margin: "12px 0 10px" }}>This board is offline.</h1>
          <p style={{ color: "var(--ink-500)", fontSize: 16, lineHeight: 1.6 }}>The live volunteer board isn't published right now. Want to help? You can still register.</p>
          <button className="btn btn-primary mt-24" onClick={() => setPage && setPage("volunteer")}>Volunteer with us →</button>
        </div>
      </section>
    </div>
  );
  // Don't render a zero-filled board on a fetch error.
  if (!previewConfig && err && !d) return (
    <div className="page" data-screen-label="Volunteer status">
      <section className="section" style={{ padding: "110px 0", textAlign: "center" }}>
        <div className="container" style={{ maxWidth: 520 }}>
          <div className="eyebrow">VOLUNTEER STATUS</div>
          <h1 className="display" style={{ fontSize: "clamp(28px,4vw,46px)", margin: "12px 0 10px" }}>{boardOffline(err) ? "We can't reach the server." : "We couldn't load the board."}</h1>
          <p style={{ color: "var(--ink-500)", fontSize: 16, lineHeight: 1.6 }}>{boardOffline(err)
            ? "This isn't your device or connection — the site's server isn't answering. The board comes back on its own once it does."
            : "A quick hiccup reaching the live numbers — give it another try."}</p>
          <button className="btn btn-primary mt-24" onClick={retry}>Retry</button>
        </div>
      </section>
    </div>
  );

  const accent = page.accent || "#d0ff3a";
  const banner = page.banner || {};
  const ci = (n) => Math.round((n || 0) * t);
  const k = (d && d.kpis) || {};
  const byCentre = (d && d.byCentre) || [];
  const directory = (d && d.directory) || [];
  const rate = k.fulfillmentRate || 0;
  const totNeed = k.totalNeed || 0, totFilled = k.totalFilled || 0, totGap = k.totalGap || 0;
  // Attendance today (volunteers share the same roll as students).
  const vPresent = k.presentToday || 0, vLate = k.lateToday || 0;
  const vOnTime = k.onTimeToday != null ? k.onTimeToday : Math.max(0, vPresent - vLate);

  const secAgo = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  const updatedAgo = secAgo < 60 ? secAgo + "s ago" : Math.floor(secAgo / 60) + "m ago";

  const perRoleTot = { admin: [0, 0], mentor: [0, 0], instructor: [0, 0] };
  byCentre.forEach(c => (c.byRole || []).forEach(r => { if (perRoleTot[r.role]) { perRoleTot[r.role][0] += r.need; perRoleTot[r.role][1] += r.filled; } }));

  // Material (item) needs, rolled up across centres for the overview. Group by
  // item name; sum received + target; an item is "open" if any centre asks with
  // no set amount, "wanted" if any centre still needs it.
  const itemAggMap = {};
  byCentre.forEach(c => (c.items || []).forEach(it => {
    const a = itemAggMap[it.item] || (itemAggMap[it.item] = { item: it.item, unit: it.unit || "", need: 0, filled: 0, open: false, wantedCentres: 0, centres: 0 });
    a.need += it.need || 0; a.filled += it.filled || 0; a.centres += 1;
    if (it.open) a.open = true;
    if (it.wanted) a.wantedCentres += 1;
  }));
  const itemsAgg = Object.values(itemAggMap).sort((a, b) => (b.wantedCentres - a.wantedCentres) || a.item.localeCompare(b.item));
  const itemStillNeeded = k.itemStillNeeded || 0;

  const tabBase = { fontFamily: "'Inter',sans-serif", fontSize: 14.5, fontWeight: 600, padding: "14px 6px", border: "none", background: "none", cursor: "pointer", borderBottom: "2.5px solid transparent", marginBottom: -1, display: "inline-flex", alignItems: "center", marginRight: 6 };
  const tabStyle = (kk) => ({ ...tabBase, color: view === kk ? "#fff" : "rgba(255,255,255,0.55)", borderBottomColor: view === kk ? "#d0ff3a" : "transparent" });
  const tabs = [["overview", "Overview", "ph-chart-bar"], ["centres", "Centres", "ph-buildings"], ["volunteers", "Volunteers", "ph-identification-card"], ["roles", "Roles", "ph-users-three"]];
  const heroSub = view === "overview" ? (page.tagline || "A live, public view of volunteer needs across every centre — by role, faculty and course.")
    : view === "centres" ? "Six centres, one team. Explore each centre's roles, faculties and courses."
    : view === "volunteers" ? "The people giving their time across the programme — shown by handle to protect their privacy."
    : "Every role we run across the programme — and exactly where we still need hands.";

  const kpis = [
    { icon: "ph-users-three", tintBg: "rgba(124,77,255,0.13)", iconColor: "#6a3fc0", value: ci(k.totalVolunteers), label: "Total volunteers", valueColor: "#0a1130" },
    { icon: "ph-check-circle", tintBg: "rgba(47,158,68,0.14)", iconColor: "#2f9e44", value: ci(k.activeVolunteers), label: "Active now", valueColor: "#0a1130" },
    { icon: "ph-alarm", tintBg: "rgba(245,176,38,0.16)", iconColor: "#a07400", value: ci(vPresent), label: "Present today", valueColor: "#0a1130", foot: vPresent ? (ci(vOnTime) + " on time · " + ci(vLate) + " late") : "roll not taken yet", footColor: vLate > 0 ? "#a07400" : "#2f9e44" },
    { icon: "ph-buildings", tintBg: "rgba(28,42,94,0.08)", iconColor: "#1c2a5e", value: ci(k.centres), label: "Centres", valueColor: "#0a1130" },
    { icon: "ph-target", tintBg: "rgba(59,91,219,0.13)", iconColor: "#3b5bdb", value: ci(totNeed), label: "Total need", valueColor: "#0a1130" },
    { icon: "ph-user-check", tintBg: "rgba(47,158,68,0.12)", iconColor: "#2f9e44", value: ci(totFilled), label: "Slots filled", valueColor: "#2f9e44" },
    { icon: "ph-puzzle-piece", tintBg: "rgba(232,169,43,0.16)", iconColor: "#a07400", value: ci(totGap), label: "Open slots", valueColor: totGap > 0 ? "#a07400" : "#2f9e44" },
  ];
  if ((k.itemTypes || 0) > 0) kpis.push(
    { icon: "ph-package", tintBg: "rgba(124,77,255,0.13)", iconColor: "#6a3fc0", value: ci(itemStillNeeded), label: "Items needed", valueColor: itemStillNeeded > 0 ? "#6a3fc0" : "#2f9e44" }
  );

  const sorted = [...byCentre].sort((a, b) => sortKey === "name" ? a.name.localeCompare(b.name) : sortKey === "rate" ? (b.fulfillmentRate - a.fulfillmentRate) : (b.gap - a.gap));
  const segBase = { fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, padding: "7px 15px", border: "none", cursor: "pointer", borderRadius: 999 };
  const segStyle = (on) => ({ ...segBase, background: on ? "#4a2da0" : "transparent", color: on ? "#fff" : "#2a335c" });

  const urgent = byCentre.filter(c => c.fulfillmentRate < 60);
  const full = byCentre.filter(c => c.fulfillmentRate >= 100);
  const gapByRole = VS_ROLES.map(r => ({ r, gap: perRoleTot[r][0] - perRoleTot[r][1] })).sort((a, b) => b.gap - a.gap);
  const topGapRole = gapByRole[0] || { r: "mentor", gap: 0 };
  const insightsSummary = "We've filled " + rate + "% of volunteer slots — but " + totGap + " roles are still open" + (urgent.length ? ", and " + vsJoin(urgent.map(c => c.name)) + (urgent.length === 1 ? " needs" : " need") + " urgent help." : ".");
  const insights = [
    { col: totGap > 0 ? "#a07400" : "#2f9e44", edge: "#e8a92b", tintBg: "rgba(232,169,43,0.16)", icon: "ph-puzzle-piece", title: "Open slots", stat: String(totGap), note: "volunteer roles still unfilled across the programme — every one is a child better served." },
    { col: "#6a3fc0", edge: "#7c4dff", tintBg: "rgba(124,77,255,0.13)", icon: VS_ROLE_META[topGapRole.r].icon, title: "Biggest need", stat: VS_ROLE_META[topGapRole.r].label, note: topGapRole.gap + " open " + VS_ROLE_META[topGapRole.r].label.toLowerCase() + " slots — our most-wanted role right now." },
    urgent.length
      ? { col: "#c0361c", edge: "#e03131", tintBg: "rgba(224,49,49,0.10)", icon: "ph-warning-circle", title: "Urgent centres", stat: String(urgent.length), note: vsJoin(urgent.map(c => c.name)) + " are below 60% staffed. A single sign-up moves the needle." }
      : { col: "#2f9e44", edge: "#2f9e44", tintBg: "rgba(47,158,68,0.12)", icon: "ph-check-circle", title: "All steady", stat: "0", note: "no centre is in urgent need today. Thank you, volunteers." },
    { col: "#2f9e44", edge: "#2f9e44", tintBg: "rgba(47,158,68,0.12)", icon: "ph-seal-check", title: "Fully staffed", stat: full.length + " / " + byCentre.length, note: (full.length ? vsJoin(full.map(c => c.name)) + " reached 100%." : "no centre is fully staffed yet — be the one who tips a centre over.") },
  ];

  const roleCards = VS_ROLES.map(r => {
    const meta = VS_ROLE_META[r], need = perRoleTot[r][0], filled = perRoleTot[r][1], gap = need - filled;
    const rr = need ? Math.round(filled / need * 100) : 100;
    const centresList = byCentre.map(c => { const cr = (c.byRole || []).find(x => x.role === r) || { need: 0, filled: 0 }; const pct = cr.need ? Math.round(cr.filled / cr.need * 100) : 100; return { name: c.name, frac: (Math.min(100, pct) / 100).toFixed(3), tone: volTone(pct), label: cr.filled + "/" + cr.need }; });
    return { role: r, label: meta.label, icon: meta.icon, color: meta.color, tintBg: meta.tintBg, blurb: meta.blurb, rate: rr, filled, need, frac: (Math.min(100, rr) / 100).toFixed(3), tone: volTone(rr), gapText: gap > 0 ? gap + " open across " + byCentre.length + " centres" : "Fully staffed everywhere", gapColor: gap > 0 ? "#a07400" : "#2f9e44", centres: centresList };
  });

  // Directory filtered
  const dirByRole = (r) => directory.filter(v => (volCentre === "All" || v.centre === volCentre) && (r === "All" || v.role === r));
  const volRoleChips = [{ label: "All", roleKey: "All", color: "#4a2da0", tint: "rgba(74,45,160,0.12)", icon: "ph-stack" }].concat(VS_ROLES.map(r => ({ label: VS_ROLE_META[r].label, roleKey: r, color: VS_ROLE_META[r].color, tint: VS_ROLE_META[r].tintBg, icon: VS_ROLE_META[r].icon })));
  const dirList = directory.filter(v => (volCentre === "All" || v.centre === volCentre) && (volRole === "All" || v.role === volRole));
  const centreOpts = ["All", ...byCentre.map(c => c.name)];

  // Centre detail
  const dc = openCentre ? byCentre.find(c => c.centreId === openCentre) : null;
  let detail = null;
  if (dc) {
    const chipBase = { display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'Inter',sans-serif", fontSize: 13.5, fontWeight: 600, padding: "8px 15px", borderRadius: 999, cursor: "pointer", border: "1.5px solid" };
    const mkChip = (label, roleKey, count, color, tint, icon) => { const sel = roleFilter === roleKey; return { label, icon, count, roleKey, style: { ...chipBase, background: sel ? tint : "#fff", borderColor: sel ? color : "#e5e8ee", color: sel ? color : "#2a335c" }, badgeStyle: { fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 700, minWidth: 18, textAlign: "center", padding: "1px 6px", borderRadius: 999, background: sel ? color : "rgba(28,42,94,0.08)", color: sel ? "#fff" : "#5a6488", marginLeft: 2 } }; };
    const roleChips = [mkChip("All roles", "All", dc.filled, "#4a2da0", "rgba(74,45,160,0.12)", "ph-stack")].concat(VS_ROLES.map(r => { const rr = (dc.byRole || []).find(x => x.role === r) || { filled: 0 }; return mkChip(VS_ROLE_META[r].label, r, rr.filled, VS_ROLE_META[r].color, VS_ROLE_META[r].tintBg, VS_ROLE_META[r].icon); }));
    const rolesToShow = roleFilter === "All" ? VS_ROLES : [roleFilter];
    const byRole = rolesToShow.map(r => { const meta = VS_ROLE_META[r], rr = (dc.byRole || []).find(x => x.role === r) || { need: 0, filled: 0, gap: 0, fulfillmentRate: 100 }; return { label: meta.label, icon: meta.icon, color: meta.color, tintBg: meta.tintBg, countLabel: rr.filled + " / " + rr.need + " filled", gapLabel: rr.gap > 0 ? rr.gap + " open" : "full", frac: (Math.min(100, rr.fulfillmentRate) * t / 100).toFixed(3), tone: volTone(rr.fulfillmentRate) }; });
    const showFaculty = roleFilter !== "admin";
    const byFaculty = (dc.byFaculty || []).map(f => ({ faculty: f.faculty, count: f.filled, color: vsFacColor(f.faculty) }));
    const showCourses = roleFilter === "All" || roleFilter === "instructor";
    const byCourse = (dc.byCourse || []).map(c => ({ faculty: c.faculty, course: c.course, color: vsFacColor(c.faculty), filledLabel: c.filled + (c.filled === 1 ? " instructor" : " instructors") })).sort((a, b) => (a.faculty || "").localeCompare(b.faculty || ""));
    detail = {
      name: dc.name, code: dc.code, color: dc.color, rate: dc.fulfillmentRate, filled: dc.filled, need: dc.need, gap: dc.gap,
      tone: volTone(dc.fulfillmentRate), statusBg: (dc.fulfillmentRate >= 100 ? "rgba(47,158,68,0.12)" : dc.fulfillmentRate >= 60 ? "rgba(232,169,43,0.16)" : "rgba(224,49,49,0.12)"), statusLabel: volLabel(dc.fulfillmentRate), gapColor: dc.gap > 0 ? "#a07400" : "#2f9e44",
      roleHint: roleFilter === "All" ? "Showing all roles" : "Filtered to " + VS_ROLE_META[roleFilter].label,
      roleChips, byRole, showFaculty, hasFaculty: byFaculty.length > 0, facEmpty: showFaculty && byFaculty.length === 0, byFaculty,
      showCourses, hasCourses: byCourse.length > 0, courseEmpty: showCourses && byCourse.length === 0, byCourse,
      items: (dc.items || []),
    };
  }
  const showCentreGrid = view === "centres" && !dc;
  const isOverview = view === "overview" && !dc, isRoles = view === "roles" && !dc, isVolunteers = view === "volunteers" && !dc;

  return (
    <div className="page" data-screen-label="Volunteer status">
      {banner.text ? <div style={{ background: banner.tone === "warn" ? "#7a2e2e" : banner.tone === "success" ? "#1c5138" : "#2c1a63", color: "#fff", textAlign: "center", padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>{banner.text}</div> : null}

      <section style={{ background: "linear-gradient(155deg,#140a2e 0%,#2c1a63 55%,#4a2da0 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(46% 44% at 92% 2%,rgba(245,176,38,0.22),transparent 62%),radial-gradient(44% 48% at 8% 98%,rgba(208,255,58,0.12),transparent 60%)" }}/>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 28px 0", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#c8b6f0", display: "flex", alignItems: "center", gap: 8 }}><i className="ph ph-hand-heart"/> Volunteer transparency</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: "rgba(255,255,255,0.55)", display: "inline-flex", alignItems: "center", gap: 6 }}><i className="ph ph-clock-countdown"/> Updated {updatedAgo}</span>
              <button onClick={retry} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 13, padding: "8px 15px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", display: "inline-flex", alignItems: "center", gap: 7 }}><i className="ph ph-arrow-clockwise"/> Refresh</button>
            </div>
          </div>

          <div className="hero-cols" style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 44, alignItems: "center", marginTop: 26 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: "rgba(208,255,58,0.12)", border: "1px solid rgba(208,255,58,0.4)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d0ff3a", animation: "volpulse 1.8s infinite" }}/>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", color: "#e8ffb0" }}>LIVE · VOLUNTEER STATUS</span>
              </div>
              <h1 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(34px,5vw,58px)", letterSpacing: "-0.035em", lineHeight: 0.98, margin: "18px 0 10px" }}>{page.title || "Build the team."}</h1>
              <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 15.5, maxWidth: 520, margin: "0 0 24px", lineHeight: 1.55 }}>{heroSub}</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button onClick={() => setPage && setPage(page.ctaPage || "volunteer")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#0c1432", border: "none", background: "linear-gradient(135deg,#ffc34d,#f5b026)", boxShadow: "0 12px 26px -12px rgba(176,124,18,0.7)", display: "inline-flex", alignItems: "center", gap: 8 }}>{page.ctaLabel || "Volunteer with us"} <i className="ph ph-arrow-right"/></button>
                <button onClick={() => setPage && setPage("s-status")} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", display: "inline-flex", alignItems: "center", gap: 8 }}>Summer School board</button>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 22, padding: "26px 28px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Needs filled</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: accent }}>{k.centres || 0} centres</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, margin: "10px 0 4px" }}>
                <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(56px,8vw,86px)", lineHeight: 0.82, letterSpacing: "-0.04em", color: accent, fontVariantNumeric: "tabular-nums" }}>{ci(rate)}%</span>
                <span style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "rgba(255,255,255,0.8)", paddingBottom: 10 }}>{ci(totFilled)} / {totNeed} slots</span>
              </div>
              <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,0.12)", marginTop: 14 }}>
                <div style={{ width: Math.min(100, rate) + "%", background: "linear-gradient(90deg,#d0ff3a,#a6e814)", transition: "width .8s cubic-bezier(.2,.7,.2,1)" }}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 22 }}>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{ci(totFilled)}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>On board</div></div>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#ffd18a", fontVariantNumeric: "tabular-nums" }}>{totGap}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Open</div></div>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{totNeed}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Total need</div></div>
              </div>
              {totGap > 0 && <div style={{ marginTop: 20, padding: "12px 14px", borderRadius: 12, background: "rgba(245,176,38,0.14)", border: "1px solid rgba(245,176,38,0.32)", fontSize: 13.5, color: "#ffe0ad", lineHeight: 1.4 }}><i className="ph ph-hand-waving" style={{ marginRight: 6 }}/>We still need <b>{totGap}</b> more volunteers — could that be you?</div>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 30, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            {tabs.map(([kk, label, icon]) => <button key={kk} onClick={() => { setView(kk); setOpenCentre(null); }} style={tabStyle(kk)}><i className={"ph " + icon} style={{ marginRight: 7 }}/>{label}</button>)}
          </div>
        </div>
      </section>

      {isOverview && <div className="view">
        <section style={{ padding: "44px 0 8px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", margin: "0 0 20px" }}>Volunteering at a glance</h2>
            <div className="kpi-grid">
              {kpis.map((kp, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: "20px 20px 18px", boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
                  <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 22, background: kp.tintBg, color: kp.iconColor }}><i className={"ph " + kp.icon}/></span>
                  <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: "-0.03em", marginTop: 16, fontVariantNumeric: "tabular-nums", color: kp.valueColor }}>{kp.value}</div>
                  <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a6488", marginTop: 8 }}>{kp.label}</div>
                  {kp.foot && <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, color: kp.footColor || "#8088a6", marginTop: 6 }}>{kp.foot}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "48px 0 44px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7c4dff" }}>Need by centre</div>
                <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "8px 0 0" }}>Where the gaps are</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8088a6" }}>Sort</span>
                <div style={{ display: "flex", gap: 4, background: "#efe8f7", padding: 4, borderRadius: 999 }}>
                  {[["gap", "Open"], ["rate", "Filled %"], ["name", "Name"]].map(([kk, label]) => <button key={kk} onClick={() => setSortKey(kk)} style={segStyle(sortKey === kk)}>{label}</button>)}
                </div>
              </div>
            </div>
            <div style={{ border: "1px solid #e5e8ee", borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
              <div className="centre-head">
                {["#", "Centre", "Filled", "Fulfillment", "Rate", "Status"].map((h, i) => <span key={i} style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8088a6", textAlign: i >= 4 ? "right" : "left" }}>{h}</span>)}
              </div>
              {sorted.map((c, i) => (
                <div key={c.centreId} className="centre-row">
                  <span className="c-rank" style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", fontFamily: "'Sora'", fontWeight: 800, fontSize: 13, color: "#fff", background: c.color }}>{i + 1}</span>
                  <span className="c-name" style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                    <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 16, color: "#0a1130" }}>{c.name}</b>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.06em", color: "#8088a6", marginTop: 3 }}>{c.code}</span>
                  </span>
                  <span className="c-present" style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#2a335c", fontVariantNumeric: "tabular-nums" }}>
                    <span>{ci(c.filled)} / {c.need}</span>
                    {c.attendance && <span style={{ fontSize: 10, marginTop: 3, color: (c.attendance.late || 0) > 0 ? "#a07400" : (c.attendance.present || 0) > 0 ? "#2f9e44" : "#8088a6" }}>{(c.attendance.present || 0) > 0 ? c.attendance.present + " in" + ((c.attendance.late || 0) > 0 ? " · " + c.attendance.late + " late" : " · on time") : "—"}</span>}
                  </span>
                  <span className="c-bar" style={{ display: "block", height: 9, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: "100%", borderRadius: 99, transformOrigin: "left", transition: "transform .8s cubic-bezier(.2,.7,.2,1)", transform: "scaleX(" + (Math.min(100, c.fulfillmentRate) * t / 100).toFixed(3) + ")", background: volTone(c.fulfillmentRate) }}/>
                  </span>
                  <span className="c-rate" style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, textAlign: "right", fontVariantNumeric: "tabular-nums", color: volTone(c.fulfillmentRate) }}>{ci(c.fulfillmentRate)}%</span>
                  <span className="c-status" style={{ justifySelf: "end", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", padding: "5px 11px", borderRadius: 999, background: detailStatusBg(c.fulfillmentRate), color: volTone(c.fulfillmentRate) }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: volTone(c.fulfillmentRate) }}/>{volLabel(c.fulfillmentRate)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {itemsAgg.length > 0 && <section style={{ padding: "0 0 8px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7c4dff", display: "flex", alignItems: "center", gap: 8 }}><i className="ph ph-package"/> Materials needed</div>
              <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "8px 0 0" }}>Items that keep the centres running</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
              {itemsAgg.map((it, i) => {
                const pct = it.need > 0 ? Math.min(100, Math.round(it.filled / it.need * 100)) : 0;
                const done = !it.open && it.need > 0 && it.filled >= it.need;
                const barColor = done ? "#2f9e44" : pct >= 60 ? "#e8a92b" : "#e03131";
                return (
                  <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 14, padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 16, color: "#0a1130" }}>{it.item}</b>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#5a6488" }}>{it.open ? (it.filled > 0 ? it.filled + (it.unit ? " " + it.unit : "") + " in" : "") : it.filled + "/" + it.need + (it.unit ? " " + it.unit : "")}</span>
                    </div>
                    {it.open
                      ? <div style={{ margin: "10px 0 8px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", padding: "4px 10px", borderRadius: 999, background: "rgba(124,108,255,0.12)", color: "#5a3fb0" }}><i className="ph ph-hand-heart"/> Any amount welcome</span></div>
                      : <div style={{ height: 7, borderRadius: 999, background: "#eef0f4", margin: "10px 0 8px", overflow: "hidden" }}><div style={{ height: "100%", width: pct + "%", background: barColor, borderRadius: 999 }}/></div>}
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.04em", color: "#8088a6" }}>{it.wantedCentres > 0 ? it.wantedCentres + " centre" + (it.wantedCentres === 1 ? "" : "s") + " asking" : "fully met ✓"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>}

        <section style={{ padding: "0 0 52px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ marginBottom: 8, marginTop: itemsAgg.length > 0 ? 40 : 0 }}>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7c4dff", display: "flex", alignItems: "center", gap: 8 }}><i className="ph ph-sparkle"/> Smart insights</div>
              <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "8px 0 0" }}>What the board is telling us</h2>
            </div>
            <p style={{ fontFamily: "'Sora'", fontWeight: 600, fontSize: 19, lineHeight: 1.45, letterSpacing: "-0.01em", color: "#2a335c", maxWidth: 740, margin: "14px 0 26px" }}>{insightsSummary}</p>
            <div className="insight-grid">
              {insights.map((ins, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderLeft: "4px solid " + ins.edge, borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 18, background: ins.tintBg, color: ins.col }}><i className={"ph " + ins.icon}/></span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a6488" }}>{ins.title}</span>
                  </div>
                  <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: "-0.03em", margin: "16px 0 8px", fontVariantNumeric: "tabular-nums", color: ins.col }}>{ins.stat}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#2a335c" }}>{ins.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>}

      {showCentreGrid && <div className="view">
        <section style={{ padding: "44px 0 56px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Every centre</h2>
            <p style={{ color: "#5a6488", fontSize: 14.5, margin: "0 0 26px" }}>Tap a centre for its full role, faculty and course breakdown.</p>
            <div className="centre-cards">
              {byCentre.map(c => (
                <button key={c.centreId} onClick={() => { setOpenCentre(c.centreId); setRoleFilter("All"); }} style={{ textAlign: "left", cursor: "pointer", background: "#fff", border: "1px solid #e5e8ee", borderTop: "4px solid " + c.color, borderRadius: 16, padding: 22, boxShadow: "0 1px 2px rgba(12,20,50,0.05)", fontFamily: "inherit" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 20, color: "#0a1130" }}>{c.name}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6" }}>{c.code}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "16px 0 6px" }}>
                    <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 38, lineHeight: 1, color: volTone(c.fulfillmentRate), fontVariantNumeric: "tabular-nums" }}>{c.fulfillmentRate}%</span>
                    <span style={{ fontSize: 13, color: "#5a6488" }}>{c.filled} / {c.need} filled</span>
                  </div>
                  <span style={{ display: "block", height: 9, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden", marginTop: 6 }}>
                    <span style={{ display: "block", height: "100%", width: "100%", borderRadius: 99, transformOrigin: "left", transform: "scaleX(" + (Math.min(100, c.fulfillmentRate) / 100).toFixed(3) + ")", background: volTone(c.fulfillmentRate) }}/>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: "1px solid #eef0f4" }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: volTone(c.fulfillmentRate) }}>{volLabel(c.fulfillmentRate)}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Inter'", fontSize: 13, fontWeight: 600, color: c.gap > 0 ? "#a07400" : "#2f9e44" }}>{c.gap > 0 ? c.gap + " needed" : "Fully staffed"} <i className="ph ph-arrow-right"/></span>
                  </div>
                  {(c.items || []).length > 0 && (() => { const openItems = (c.items || []).filter(x => x.wanted).length; return (
                    <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.04em", color: openItems ? "#a07400" : "#2f9e44" }}>
                      <i className="ph ph-package"/>{openItems ? openItems + " item" + (openItems === 1 ? "" : "s") + " needed" : "items met ✓"}
                    </div>
                  ); })()}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>}

      {detail && <div className="view">
        <section style={{ padding: "32px 0 56px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
            <button onClick={() => setOpenCentre(null)} style={{ fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "#5a3fb0", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, padding: 0, marginBottom: 22 }}><i className="ph ph-arrow-left"/> All centres</button>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ width: 20, height: 56, borderRadius: 8, background: detail.color, display: "block" }}/>
                <div>
                  <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>{detail.name}</h2>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#8088a6" }}>{detail.code} · volunteer needs</span>
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "7px 13px", borderRadius: 999, background: detail.statusBg, color: detail.tone }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: detail.tone }}/>{detail.statusLabel}</span>
            </div>
            <div className="detail-stats" style={{ marginTop: 24 }}>
              {[[detail.rate + "%", "Filled", detail.tone], [detail.filled, "On board", "#0a1130"], [detail.need, "Needed", "#0a1130"], [detail.gap, "Open slots", detail.gapColor]].map((s, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 14, padding: 18 }}><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 30, color: s[2], fontVariantNumeric: "tabular-nums" }}>{s[0]}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a6488", marginTop: 6 }}>{s[1]}</div></div>
              ))}
            </div>
            <CentreFindUs meta={dc} accent={dc.color}/>
            <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: 22, marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a6488" }}><i className="ph ph-funnel" style={{ marginRight: 6 }}/>Filter by role</span>
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6" }}>{detail.roleHint}</span>
              </div>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                {detail.roleChips.map((r, i) => <button key={i} onClick={() => setRoleFilter(r.roleKey)} style={r.style}><i className={"ph " + r.icon} style={{ marginRight: 2 }}/>{r.label}<span style={r.badgeStyle}>{r.count}</span></button>)}
              </div>
            </div>
            <h3 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: "34px 0 14px" }}>Needs by role</h3>
            <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: 22, display: "grid", gap: 18 }}>
              {detail.byRole.map((r, i) => (
                <div key={i}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#0a1130" }}><span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", fontSize: 16, background: r.tintBg, color: r.color }}><i className={"ph " + r.icon}/></span>{r.label}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: "#5a6488" }}>{r.countLabel} · {r.gapLabel}</span>
                  </div>
                  <span style={{ display: "block", height: 10, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: "100%", borderRadius: 99, transformOrigin: "left", transition: "transform .7s cubic-bezier(.2,.7,.2,1)", transform: "scaleX(" + r.frac + ")", background: r.tone }}/></span>
                </div>
              ))}
            </div>
            {detail.showFaculty && <>
              <h3 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: "34px 0 14px" }}>By faculty <span style={{ fontFamily: "'Inter'", fontWeight: 500, fontSize: 14, color: "#8088a6" }}>— mentors &amp; instructors</span></h3>
              {detail.hasFaculty
                ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{detail.byFaculty.map((f, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 15px", borderRadius: 12, background: "#fff", border: "1px solid #e5e8ee" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: f.color }}/><b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 14, color: "#0a1130" }}>{f.faculty}</b><span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#5a6488" }}>{f.count}</span></span>)}</div>
                : <div style={{ border: "1px dashed #d9d2c0", borderRadius: 14, padding: 20, textAlign: "center", color: "#8088a6", fontSize: 13.5 }}>No mentors or instructors on board for this filter yet.</div>}
            </>}
            {detail.showCourses && <>
              <h3 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: "34px 0 14px" }}>Instructors by course</h3>
              {detail.hasCourses
                ? <div style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: "6px 22px" }}>{detail.byCourse.map((c, i) => <div key={i} className="course-row"><span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.04em", color: c.color, textTransform: "uppercase" }}>{c.faculty}</span><span style={{ fontFamily: "'Sora'", fontWeight: 600, fontSize: 15, color: "#0a1130" }}>{c.course}</span><span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12.5, color: "#5a6488", textAlign: "right" }}>{c.filledLabel}</span></div>)}</div>
                : <div style={{ border: "1px dashed #d9d2c0", borderRadius: 14, padding: 20, textAlign: "center", color: "#8088a6", fontSize: 13.5 }}>No instructors have signed up for a course here yet.</div>}
            </>}
            {detail.items.length > 0 && <>
              <h3 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: "34px 0 14px" }}>Items needed <span style={{ fontFamily: "'Inter'", fontWeight: 500, fontSize: 14, color: "#8088a6" }}>— materials this centre is asking for</span></h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
                {detail.items.map((it, i) => {
                  const pct = Math.min(100, it.fulfillmentRate || 0);
                  const barColor = it.tone === "met" ? "#2f9e44" : it.tone === "watch" ? "#e8a92b" : "#e03131";
                  return (
                    <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#0a1130" }}>{it.item}</b>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, color: "#5a6488" }}>{it.open ? (it.filled > 0 ? it.filled + (it.unit ? " " + it.unit : "") + " in" : "") : it.filled + "/" + it.need + (it.unit ? " " + it.unit : "")}</span>
                      </div>
                      {it.open ? (
                        <div style={{ margin: "10px 0 6px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "4px 10px", borderRadius: 999, background: "rgba(124,108,255,0.12)", color: "#5a3fb0" }}><i className="ph ph-hand-heart"/> Any amount welcome</span></div>
                      ) : (
                        <>
                          <div style={{ height: 7, borderRadius: 999, background: "#eef0f4", margin: "10px 0 6px", overflow: "hidden" }}><div style={{ height: "100%", width: pct + "%", background: barColor, borderRadius: 999 }}/></div>
                          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: it.gap > 0 ? "#a07400" : "#2f9e44" }}>{it.gap > 0 ? it.gap + " still needed" : "fully met ✓"}</span>
                        </>
                      )}
                      {it.note ? <p style={{ fontSize: 12.5, color: "#8088a6", margin: "6px 0 0", lineHeight: 1.4 }}>{it.note}</p> : null}
                    </div>
                  );
                })}
              </div>
            </>}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
              <button onClick={() => setPage && setPage("volunteer")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#0c1432", border: "none", background: "linear-gradient(135deg,#ffc34d,#f5b026)", boxShadow: "0 12px 26px -12px rgba(176,124,18,0.7)", display: "inline-flex", alignItems: "center", gap: 8 }}>Volunteer at {detail.name} <i className="ph ph-arrow-right"/></button>
            </div>
          </div>
        </section>
      </div>}

      {isRoles && <div className="view">
        <section style={{ padding: "44px 0 24px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
            <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 6px" }}>Roles across the programme</h2>
            <p style={{ color: "#5a6488", fontSize: 14.5, margin: "0 0 26px" }}>Every role we run, how many have stepped up, and where the open slots are.</p>
            <div className="role-grid">
              {roleCards.map((r, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderTop: "4px solid " + r.color, borderRadius: 18, padding: 24, boxShadow: "0 1px 2px rgba(12,20,50,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 13, display: "grid", placeItems: "center", fontSize: 24, background: r.tintBg, color: r.color }}><i className={"ph " + r.icon}/></span>
                    <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 19, color: "#0a1130" }}>{r.label}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6", marginTop: 2 }}>{r.blurb}</div></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "20px 0 8px" }}>
                    <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 40, lineHeight: 1, color: r.tone, fontVariantNumeric: "tabular-nums" }}>{r.rate}%</span>
                    <span style={{ fontSize: 13, color: "#5a6488" }}>{r.filled}/{r.need} filled</span>
                  </div>
                  <span style={{ display: "block", height: 10, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: "100%", borderRadius: 99, transformOrigin: "left", transform: "scaleX(" + r.frac + ")", background: r.tone }}/></span>
                  <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: r.gapColor }}>{r.gapText}</div>
                  <div style={{ height: 1, background: "#eef0f4", margin: "18px 0 14px" }}/>
                  <div style={{ display: "grid", gap: 10 }}>
                    {r.centres.map((c, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 70, fontSize: 13, fontWeight: 600, color: "#2a335c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                        <span style={{ flex: 1, height: 7, borderRadius: 99, background: "rgba(12,20,50,0.07)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: "100%", borderRadius: 99, transformOrigin: "left", transform: "scaleX(" + c.frac + ")", background: c.tone }}/></span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#5a6488", width: 52, textAlign: "right" }}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>}

      {isVolunteers && <div className="view">
        <section style={{ padding: "40px 0 56px" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 6, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", margin: 0 }}>All volunteers</h2>
                <p style={{ color: "#5a6488", fontSize: 14.5, margin: "6px 0 0" }}>{dirList.length} people giving their time · shown by handle only</p>
              </div>
              <select value={volCentre} onChange={e => setVolCentre(e.target.value)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 13px", borderRadius: 10, border: "1px solid #d9d2c0", background: "#fff", color: "#2a335c", cursor: "pointer" }}>{centreOpts.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", margin: "18px 0 24px" }}>
              {volRoleChips.map((r, i) => { const sel = volRole === r.roleKey; return <button key={i} onClick={() => setVolRole(r.roleKey)} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'Inter',sans-serif", fontSize: 13.5, fontWeight: 600, padding: "8px 15px", borderRadius: 999, cursor: "pointer", border: "1.5px solid " + (sel ? r.color : "#e5e8ee"), background: sel ? r.tint : "#fff", color: sel ? r.color : "#2a335c" }}><i className={"ph " + r.icon} style={{ marginRight: 2 }}/>{r.label}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 700, minWidth: 18, textAlign: "center", padding: "1px 6px", borderRadius: 999, background: sel ? r.color : "rgba(28,42,94,0.08)", color: sel ? "#fff" : "#5a6488", marginLeft: 2 }}>{dirByRole(r.roleKey).length}</span></button>; })}
            </div>
            {dirList.length === 0
              ? <div style={{ border: "1px dashed #d9d2c0", borderRadius: 16, padding: 32, textAlign: "center", color: "#8088a6", fontSize: 14 }}>No volunteers match this filter.</div>
              : <div className="vol-grid">
                {dirList.map((v, i) => { const meta = VS_ROLE_META[v.role] || VS_ROLE_META.admin; const focus = v.role === "instructor" ? (v.faculty + (v.course ? " · " + v.course : "")) : v.role === "mentor" ? (v.faculty + " mentor") : "Admin & operations"; return (
                  <div key={i} style={{ background: "#fff", border: "1px solid #e5e8ee", borderRadius: 16, padding: "22px 18px 18px", boxShadow: "0 1px 2px rgba(12,20,50,0.05)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6 }}>
                    <div style={{ width: 104, height: 104, borderRadius: "50%", padding: 4, background: v.color, boxShadow: "0 8px 20px -10px rgba(12,20,50,0.4)" }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: v.color, position: "relative" }}>
                        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "'Sora'", fontWeight: 800, fontSize: 36, color: "rgba(255,255,255,0.9)" }}>{v.initial}</span>
                        {v.face && <img src={v.face} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
                      </div>
                    </div>
                    <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 16, color: "#0a1130", marginTop: 12, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.handle}</b>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", padding: "4px 11px", borderRadius: 999, background: meta.tintBg, color: meta.color }}><i className={"ph " + meta.icon}/>{meta.label}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12.5, color: "#5a6488", borderTop: "1px solid #eef0f4", paddingTop: 14, marginTop: 12, width: "100%", textAlign: "left" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><i className="ph ph-map-pin" style={{ color: v.color }}/>{v.centre}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><i className="ph ph-stack"/>{focus}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><i className="ph ph-calendar-check"/>{v.sessions} sessions · joined Wk {v.sinceWk}</span>
                    </div>
                  </div>
                ); })}
              </div>}
            <p style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6", marginTop: 20, display: "flex", alignItems: "center", gap: 7 }}><i className="ph ph-camera"/>Volunteer faces and handles are shown with consent — student names and photos never appear.</p>
          </div>
        </section>
      </div>}

      <section style={{ background: "#140a2e", color: "#fff", padding: "56px 0 60px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 28px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: "rgba(255,255,255,0.08)", fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d0ff3a" }}/>TRANSPARENCY</span>
          <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(28px,3.6vw,42px)", letterSpacing: "-0.02em", margin: "16px 0 12px" }}>{page.transparencyTitle || "Roles, not people."}</h2>
          <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 15.5, lineHeight: 1.75, margin: "0 0 24px" }}>{page.transparencyBody || "This board shows only how many volunteers each centre needs and how many have stepped up — by role, faculty and course. A volunteer's name, photo or contact detail never appears here unless they've given consent. It's how we stay accountable while protecting everyone who gives their time."}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setPage && setPage(page.ctaPage || "volunteer")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#0c1432", border: "none", background: "linear-gradient(135deg,#ffc34d,#f5b026)", boxShadow: "0 12px 26px -12px rgba(176,124,18,0.7)", display: "inline-flex", alignItems: "center", gap: 8 }}>{page.ctaLabel || "Volunteer with us"} <i className="ph ph-arrow-right"/></button>
            <button onClick={() => setPage && setPage("s-status")} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "transparent", border: "1.5px solid rgba(255,255,255,0.25)" }}>See the Summer School board</button>
          </div>
          <p style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 24 }}>Auto-refreshes every 45s · last updated {updatedAgo}</p>
        </div>
      </section>

      {!d && !err && <div className="container" style={{ padding: "60px 0", textAlign: "center" }}><div className="dash-spinner"/></div>}
      {err && <div className="container" style={{ padding: "30px 0", textAlign: "center", color: "#e03131" }}>Couldn't load the board — <button onClick={retry} style={{ background: "none", border: "none", color: "#5a3fb0", textDecoration: "underline", cursor: "pointer" }}>retry</button>.</div>}
      <style>{`@keyframes volpulse{0%{box-shadow:0 0 0 0 rgba(208,255,58,0.6)}70%{box-shadow:0 0 0 8px rgba(208,255,58,0)}100%{box-shadow:0 0 0 0 rgba(208,255,58,0)}}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:920px){.kpi-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.kpi-grid{grid-template-columns:1fr}}
.insight-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}@media(max-width:1000px){.insight-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.insight-grid{grid-template-columns:1fr}}
.centre-head,.centre-row{display:grid;grid-template-columns:46px 1.5fr 96px 2.3fr 66px 140px;align-items:center;gap:16px;padding:0 20px}
.centre-head{height:46px;background:#faf6ec;border-bottom:1px solid #e5e8ee}.centre-row{min-height:66px;border-bottom:1px solid #eef0f4}.centre-row:last-child{border-bottom:none}
@media(max-width:820px){.centre-head{display:none}.centre-row{grid-template-columns:38px 1fr auto;grid-template-areas:"rank name rate" "rank present status" "bar bar bar";row-gap:10px;padding:16px 18px;min-height:0}.c-rank{grid-area:rank}.c-name{grid-area:name}.c-present{grid-area:present;justify-self:start}.c-bar{grid-area:bar}.c-rate{grid-area:rate;justify-self:end}.c-status{grid-area:status;justify-self:end}}
.centre-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:900px){.centre-cards{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.centre-cards{grid-template-columns:1fr}}
.detail-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}@media(max-width:640px){.detail-stats{grid-template-columns:repeat(2,1fr)}}
.role-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}@media(max-width:900px){.role-grid{grid-template-columns:1fr}}
.vol-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.course-row{display:grid;grid-template-columns:120px 1fr auto;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid #eef0f4}.course-row:last-child{border-bottom:none}
@media(max-width:560px){.course-row{grid-template-columns:1fr auto}.course-row>span:first-child{grid-column:1/-1}}`}</style>
    </div>
  );
}
function detailStatusBg(r) { return r >= 100 ? "rgba(47,158,68,0.12)" : r >= 60 ? "rgba(232,169,43,0.16)" : "rgba(224,49,49,0.12)"; }

Object.assign(window, { HomePage, EventsBand, StatusPage, VolunteerStatusPage });

