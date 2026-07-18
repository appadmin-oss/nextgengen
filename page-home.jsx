/* ================================================================
   NGG — Home + Progression (cinematic pass)
   ================================================================ */

function HomePage({ setPage }) {
  return (
    <div className="page" data-screen-label="01 Home">
      <PromoBanner setPage={setPage} />
      <Hero setPage={setPage} />
      <StatBar />
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
    NGGApi.public.siteContent().then(r => { if (alive && r && r.promo && r.promo.text) setPromo(r.promo); }).catch(() => {});
    return () => { alive = false; };
  }, []);
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
      <button aria-label="Dismiss" onClick={() => setDismissed(true)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
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
  const memberCount = stats && stats.activeMembers > 0 ? stats.activeMembers + "+" : "500+";

  return (
    <section className="hero" style={{minHeight:720, paddingBottom:80}}>
      <div className="hero-grid" />
      {/* Background hero image with deep gradient */}
      <div style={{position:"absolute", inset:0, zIndex:-1}}>
        <img src={scene("heroMain", 2000)} alt="" style={{width:"100%", height:"100%", objectFit:"cover", opacity:0.35}}/>
        <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(10,17,48,0.72) 0%, rgba(10,17,48,0.9) 55%, rgba(8,13,36,0.97) 100%)"}}/>
      </div>

      <div className="container" style={{padding:"112px 28px 96px"}}>
        <div style={{display:"grid", gridTemplateColumns:"1.45fr 1fr", gap:64, alignItems:"center", minHeight:560}}>
          <div>
            <div data-reveal className="reveal" style={{display:"inline-flex", alignItems:"center", gap:10, marginBottom:30, flexWrap:"wrap", padding:"8px 16px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:999, backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)"}}>
              <span className="live-dot"/>
              <span className="mono" style={{fontSize:11, letterSpacing:"0.16em", textTransform:"uppercase", color:"rgba(255,255,255,0.9)"}}>
                {badge}
              </span>
            </div>
            <h1 className="display" style={{fontSize:"clamp(52px, 6.4vw, 108px)", margin:0, color:"white", lineHeight:0.94}}>
              <Kinetic as="span" text={site.heroTitle1 || "Africa's next geniuses"} by="word"/><br/>
              <Kinetic as="span" text={(site.heroTitle2 || "are") + " "} by="word" delay={300}/>
              <em className="shimmer-gold" style={{fontStyle:"normal", fontFamily:"var(--font-marker)", fontWeight:700, fontSize:"1.14em", lineHeight:0.9, display:"inline-block"}}>
                <Kinetic as="span" text={site.heroEmphasis || "not waiting"} by="word" delay={420}/>
              </em>
              <Kinetic as="span" text="." by="word" delay={620}/>
            </h1>
            <p data-reveal className="reveal" style={{fontSize:19, lineHeight:1.55, color:"rgba(255,255,255,0.82)", maxWidth:560, marginTop:28, "--reveal-delay":"500ms"}}>
              {site.heroSubhead || "A twelve-week growth journey for teenagers, 10–17. From summer student to vanguard leader — by mission, mentorship and the discipline of public work."}
            </p>
            <div data-reveal className="reveal" style={{display:"flex", gap:12, marginTop:40, flexWrap:"wrap", "--reveal-delay":"650ms"}}>
              <Magnetic>
                <button className="btn btn-gold btn-lg" onClick={() => setPage("summer")}>
                  {site.heroCtaPrimary || "Join the Summer Program"} →
                </button>
              </Magnetic>
              <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("anchor")}>
                {site.heroCtaSecondary || "Explore Anchor 12"}
              </button>
            </div>
            <div style={{display:"flex", gap:24, marginTop:52, color:"rgba(255,255,255,0.7)", fontSize:13, alignItems:"center", flexWrap:"wrap"}}>
              {/* Avatar cluster + social proof */}
              <div style={{display:"flex", alignItems:"center", gap:14}}>
                <div style={{display:"flex"}}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{marginLeft: i === 1 ? 0 : -10, border:"2px solid var(--navy-900)", borderRadius:"50%"}}>
                      <Avatar seed={i+8} size={36}/>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{color:"white", fontWeight:600, fontSize:14}}>{memberCount} teen creators in motion</div>
                  <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.66)", marginTop:2}}>
                    {stats ? "UPDATED LIVE" : "TWO CENTRES"} · Alimosho, Lagos
                  </div>
                </div>
              </div>
              {/* Live KPI strip — real numbers only. A zero here reads as
                  "this movement is empty", so unstarted KPIs stay hidden. */}
              {(() => {
                const kpis = [
                  ["missionsVerified", "Missions verified", "1,200+"],
                  ["graduates", "Graduates", "60+"],
                  ["centres", "Centres", "02"],
                ].map(([key, label, evergreen]) => {
                  if (!stats) return [evergreen, label];
                  if (!(stats[key] > 0)) return null;
                  const n = key === "centres" ? String(stats[key]).padStart(2, "0") : stats[key].toLocaleString();
                  return [n, label];
                }).filter(Boolean);
                if (!kpis.length) return null;
                return (
                  <div style={{display:"flex", gap:28, paddingLeft:24, borderLeft:"1px solid rgba(255,255,255,0.16)"}}>
                    {kpis.map(([n, l], i) => (
                      <div key={i}>
                        <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize:26, color:"white", lineHeight:1}}>{n}</div>
                        <div className="mono" style={{fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)", marginTop:5}}>{l}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Right: photo composition — one anchor image with satellites in
              its corners, plus a tidy bottom row. Class-driven so the mobile
              layout is deliberate, not attribute-selector patchwork. */}
          <div className="hero-visual reveal" data-reveal>
            <Photo name="speaker" ratio="auto" style={{flex:"1 1 auto", minHeight:0}} overlay eager>
              <div style={{position:"absolute", top:16, left:16}}>
                <span className="chip chip-on-dark" style={{background:"rgba(12,20,50,0.55)", color:"white"}}>NGGC · WK 07</span>
              </div>
              <div style={{position:"absolute", bottom:16, left:16, right:"40%", color:"white"}}>
                <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", color:"var(--gold-400)"}}>FROM THE COHORT</div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:21, lineHeight:1.05, marginTop:4}}>Zara — Voice of Influence</div>
              </div>
              <div className="hero-theme-card">
                <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase", fontWeight:600}}>This week's theme</div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize:24, lineHeight:1, marginTop:2}}>Discipline.</div>
              </div>
            </Photo>
            <div className="hero-visual-row">
              <Photo name="studio" ratio="auto" style={{width:"56%"}}/>
              <div className="hero-live-card">
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                  <span className="dot dot-lime"/>
                  <span className="mono" style={{fontSize:10, letterSpacing:"0.15em", textTransform:"uppercase", color:"rgba(255,255,255,0.75)"}}>GENIUS OF THE WEEK · SAMPLE</span>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:12}}>
                  <Avatar seed="ngg-you" name="You" size={42} ring/>
                  <div>
                    <div style={{fontWeight:600, fontSize:15}}>This could be you</div>
                    <div style={{fontSize:11, color:"rgba(255,255,255,0.7)", marginTop:2}}>Earn XP every week you show up</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
function sFmt(n) { return (n == null ? 0 : n).toLocaleString("en-US"); }
function joinNames(arr) { return arr.length <= 1 ? (arr[0] || "") : arr.length === 2 ? arr[0] + " & " + arr[1] : arr.slice(0, -1).join(", ") + " & " + arr[arr.length - 1]; }

function StatusPage({ setPage, previewConfig }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [, setTick] = React.useState(0);
  const [t, setT] = React.useState(1);
  const [view, setView] = React.useState("overview");
  const [sortKey, setSortKey] = React.useState("rate");
  const [openCentre, setOpenCentre] = React.useState(null);
  const [tf, setTf] = React.useState("week");
  const [facFilter, setFacFilter] = React.useState("All");
  const [centreFilter, setCentreFilter] = React.useState("All");
  const [daySel, setDaySel] = React.useState("Fri");
  const [updatedAt, setUpdatedAt] = React.useState(Date.now());
  const animRef = React.useRef(null);

  const startCount = React.useCallback(() => {
    clearInterval(animRef.current); const t0 = Date.now();
    animRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 900); setT(1 - Math.pow(1 - p, 3));
      if (p >= 1) clearInterval(animRef.current);
    }, 40);
  }, []);
  const load = React.useCallback(() => {
    NGGApi.public.status().then(r => { setD(r.status || r); setErr(""); setUpdatedAt(Date.now()); startCount(); }).catch(e => setErr(e.code || e.message));
  }, [startCount]);
  React.useEffect(() => {
    load();
    const poll = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const clock = setInterval(() => setTick(x => x + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); clearInterval(animRef.current); };
  }, [load]);

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
    { icon: "ph-chart-line-up", tintBg: "rgba(245,176,38,0.16)", iconColor: "#a07400", value: ci(k.attendanceRate) + "%", label: "Attendance rate", valueColor: rateTone(k.attendanceRate || 0), ...dd(dl.rateDelta || 0, " pts") },
    { icon: "ph-handshake", tintBg: "rgba(59,91,219,0.14)", iconColor: "#3b5bdb", value: sFmt(ci(k.activeVolunteers)), label: "Active volunteers", valueColor: "#0a1130", ...dd(dl.volNew || 0, " today") },
    { icon: "ph-star", tintBg: "rgba(245,176,38,0.16)", iconColor: "#a07400", value: sFmt(ci(k.starsThisWeek)), label: "Stars this week", valueColor: "#0a1130", ...dd(dl.starsToday || 0, " today") },
  ];

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
  const split = { present, absent, total: enrolled, presentLabel: present + " present", absentLabel: absent + " absent", pctLabel: rate + "% present · " + (100 - rate) + "% absent" };
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
    return {
      rank, handle: "@" + m.handle, initial: (m.handle[0] || "?").toUpperCase(), color: m.color, faculty: m.faculty, centre: m.centre,
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
              <button onClick={load} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 13, padding: "8px 15px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", display: "inline-flex", alignItems: "center", gap: 7 }}><i className="ph ph-arrow-clockwise"/> Refresh</button>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 22 }}>
                <div><div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 24, color: "#6fdc9d", fontVariantNumeric: "tabular-nums" }}>{sFmt(ci(present))}</div><div style={{ fontFamily: "'JetBrains Mono'", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Present</div></div>
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
                  <span className="c-present" style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: "#2a335c", fontVariantNumeric: "tabular-nums" }}>{ci(c.present)} / {c.enrolled}</span>
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
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6" }}>{split.pctLabel}</span>
              </div>
              <div style={{ display: "flex", height: 36, borderRadius: 10, overflow: "hidden", border: "1px solid #e5e8ee" }}>
                <div style={{ flex: Math.max(1, split.present), background: "#2f9e44", display: "flex", alignItems: "center", padding: "0 14px", color: "#fff", fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", minWidth: 0 }}><i className="ph ph-check" style={{ marginRight: 6 }}/>{split.presentLabel}</div>
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
                  <span style={{ width: p.avatarSize, height: p.avatarSize, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "'Sora'", fontWeight: 800, fontSize: 22, color: "#fff", background: p.color, border: "3px solid " + p.medalColor, boxShadow: "0 0 0 4px rgba(255,255,255,0.06)" }}>{p.initial}</span>
                  <span style={{ marginTop: 10, fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#fff" }}>{p.handle}</span>
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
            <p style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "#8088a6", marginTop: 16, display: "flex", alignItems: "center", gap: 7 }}><i className="ph ph-lock-simple"/>Students appear by handle only — never a full name or photo, in line with our safeguarding policy.</p>
          </div>
        </section>
      </div>}

      <section style={{ background: "#0c1432", color: "#fff", padding: "56px 0 60px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 28px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: "rgba(255,255,255,0.08)", fontFamily: "'JetBrains Mono'", fontSize: 11, letterSpacing: "0.1em" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d0ff3a" }}/>TRANSPARENCY</span>
          <h2 style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: "clamp(28px,3.6vw,42px)", letterSpacing: "-0.02em", margin: "16px 0 12px" }}>{page.transparencyTitle || "Numbers, not names."}</h2>
          <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 15.5, lineHeight: 1.75, margin: "0 0 24px" }}>{page.transparencyBody || "This board updates live and shows only aggregate figures and student handles — how many attended, at which centres, and how participation is trending. A child's full name, photo, or record never appears here. It's how we stay accountable to parents, partners and the community without compromising a single child's privacy."}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setPage && setPage(page.ctaPage || "join")} style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#0c1432", border: "none", background: "linear-gradient(135deg,#ffc34d,#f5b026)", boxShadow: "0 12px 26px -12px rgba(176,124,18,0.7)", display: "inline-flex", alignItems: "center", gap: 8 }}>{page.ctaLabel || "Apply for a place"} <i className="ph ph-arrow-right"/></button>
            <button onClick={() => setPage && setPage("v-status")} style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 14, padding: "12px 22px", borderRadius: 999, cursor: "pointer", color: "#fff", background: "transparent", border: "1.5px solid rgba(255,255,255,0.25)" }}>Volunteer status board</button>
          </div>
          <p style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 24 }}>Auto-refreshes every 30s · last updated {updatedAgo}</p>
        </div>
      </section>

      {!d && !err && <div className="container" style={{ padding: "60px 0", textAlign: "center" }}><div className="dash-spinner"/></div>}
      {err && <div className="container" style={{ padding: "30px 0", textAlign: "center", color: "#e03131" }}>Couldn't load the board — <button onClick={load} style={{ background: "none", border: "none", color: "#1c2a5e", textDecoration: "underline", cursor: "pointer" }}>retry</button>.</div>}
      <style>{`@keyframes statuspulse{0%{box-shadow:0 0 0 0 rgba(111,220,157,0.55)}70%{box-shadow:0 0 0 8px rgba(111,220,157,0)}100%{box-shadow:0 0 0 0 rgba(111,220,157,0)}}
.hero-cols{display:grid}@media(max-width:860px){.hero-cols{grid-template-columns:1fr!important;gap:28px!important}}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:920px){.kpi-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.kpi-grid{grid-template-columns:1fr}}
.insight-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}@media(max-width:1000px){.insight-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.insight-grid{grid-template-columns:1fr}}
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
        <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "'Sora'", fontWeight: 800, fontSize: 15, color: "#fff", background: m.color }}>{m.initial}</span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <b style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, color: "#0a1130" }}>{m.handle}</b>
          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10.5, color: "#8088a6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.metaLine}</span>
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
const VOL_ROLE_META = { admin: { label: "Admin / Ops", icon: "🗂" }, mentor: { label: "Mentor", icon: "🧭" }, instructor: { label: "Instructor", icon: "🎓" } };

function VolunteerStatusPage({ setPage, previewConfig }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [open, setOpen] = React.useState(null); // centreId of the open detail
  const [, setTick] = React.useState(0);
  const load = React.useCallback(() => {
    NGGApi.public.volunteerStatus().then(r => { setD(r.status || r); setErr(""); }).catch(e => setErr(e.code || e.message));
  }, []);
  React.useEffect(() => {
    load();
    const poll = setInterval(() => { if (!document.hidden) load(); }, 45000);
    const clock = setInterval(() => setTick(t => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const k = (d && d.kpis) || {};
  const centres = (d && d.byCentre) || [];
  const prog = (d && d.program) || {};
  const page = previewConfig || (d && d.page) || {};
  const sec = page.sections || {};
  const kpiOn = page.kpis || {};
  const accent = page.accent || "#d0ff3a";
  const banner = page.banner || {};
  const detail = open ? centres.find(c => c.centreId === open) : null;
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

  const kpiCard = (icon, n, label, tone, suffix) => (
    <div style={{ background: "var(--paper,#fff)", border: "1px solid rgba(12,20,50,0.08)", borderRadius: 16, padding: "20px 20px 18px", boxShadow: "0 1px 0 rgba(12,20,50,0.03)" }}>
      <div style={{ fontSize: 20, marginBottom: 10 }} aria-hidden="true">{icon}</div>
      <div className="display" style={{ fontSize: 36, lineHeight: 1, color: tone || "var(--navy-900)", fontWeight: 800 }}>{typeof n === "number" ? <CountUp to={n}/> : n}{suffix || ""}</div>
      <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-500)", marginTop: 8 }}>{label}</div>
    </div>
  );

  return (
    <div className="page" data-screen-label="Volunteer status">
      {banner.text ? <div style={{ background: banner.tone === "warn" ? "#7a2e2e" : banner.tone === "success" ? "#1c5138" : "#2c1a63", color: "#fff", textAlign: "center", padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>{banner.text}</div> : null}
      {/* Hero — violet identity, distinct from the green attendance board */}
      <section style={{ background: "linear-gradient(155deg,#140a2e 0%,#2c1a63 55%,#4a2da0 100%)", color: "#fff", padding: "72px 0 56px", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -90, top: -90, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(245,176,38,0.30),transparent 70%)" }}/>
        <div className="container" style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(208,255,58,0.12)", border: "1px solid rgba(208,255,58,0.4)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d0ff3a", animation: "volpulse 1.8s infinite" }}/>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "#e8ffb0" }}>LIVE · VOLUNTEER STATUS</span>
          </div>
          <h1 className="display" style={{ fontSize: "clamp(38px,6vw,72px)", margin: "18px 0 6px", lineHeight: 0.98 }}>{page.title || "Build the team."}</h1>
          <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, margin: 0 }}>
            {page.tagline || "A live, public view of volunteer needs across every centre."}
            {d ? <span style={{ marginLeft: 10, opacity: 0.7 }}>Updated {relAgo(d.generatedAt)}</span> : null}
          </p>
          {err && <p style={{ color: "#ffb4b4", marginTop: 16 }}>Couldn't load the board — <button onClick={load} style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer" }}>retry</button>.</p>}
          {d && !err && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 34, flexWrap: "wrap" }}>
              <div>
                <div className="display" style={{ fontSize: "clamp(56px,10vw,110px)", lineHeight: 0.9, color: accent, fontWeight: 800 }}><CountUp to={k.fulfillmentRate || 0} suffix="%"/></div>
                <div className="mono" style={{ fontSize: 12, letterSpacing: "0.15em", color: "rgba(255,255,255,0.6)", marginTop: 6 }}>OF VOLUNTEER NEEDS FILLED</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 18, paddingBottom: 18 }}>
                <b><CountUp to={k.totalFilled || 0}/></b> of <b><CountUp to={k.totalNeed || 0}/></b> slots filled across <b>{k.centres || 0}</b> centre{(k.centres || 0) === 1 ? "" : "s"}.
                {(k.totalGap || 0) > 0 && <span style={{ display: "block", marginTop: 6, color: "#ffd18a", fontSize: 15 }}>We still need <b>{k.totalGap}</b> more volunteer{k.totalGap === 1 ? "" : "s"} — could that be you?</span>}
              </div>
            </div>
          )}
          {d && !err && (
            <div style={{ marginTop: 24 }}>
              <button className="btn btn-gold btn-lg" onClick={() => setPage && setPage(page.ctaPage || "volunteer")}>{page.ctaLabel || "Volunteer with us →"}</button>
            </div>
          )}
        </div>
      </section>

      {!d && !err && <div className="container" style={{ padding: "60px 0", textAlign: "center" }}><div className="dash-spinner"/></div>}

      {d && (
        <React.Fragment>
          {/* KPI grid */}
          {sec.kpis !== false && (() => {
            const vk = [
              ["totalVolunteers", "🤝", k.totalVolunteers || 0, "Total volunteers"],
              ["activeVolunteers", "✅", k.activeVolunteers || 0, "Active now"],
              ["centres", "🏫", k.centres || 0, "Centres"],
              ["totalNeed", "🎯", k.totalNeed || 0, "Total need"],
              ["totalFilled", "🟢", k.totalFilled || 0, "Slots filled", "#2f9e44"],
              ["totalGap", "🧩", k.totalGap || 0, "Open slots", (k.totalGap || 0) > 0 ? "#e8a92b" : "#2f9e44"],
            ].filter(x => kpiOn[x[0]] !== false);
            return vk.length ? <section className="section" style={{ paddingTop: 44 }}>
              <div className="container">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16 }}>
                  {vk.map(x => <React.Fragment key={x[0]}>{kpiCard(x[1], x[2], x[3], x[4])}</React.Fragment>)}
                </div>
              </div>
            </section> : null;
          })()}

          {/* Per-centre cards */}
          {sec.centres !== false && <section className="section" style={{ background: "var(--cream-50)", paddingTop: 44, paddingBottom: 44 }}>
            <div className="container">
              <SectionHead eyebrow="NEED BY CENTRE" title="Where the gaps are." sub="Volunteer needs vs filled at each centre. Tap a centre for the full role, faculty and course breakdown." />
              {!centres.length ? <p style={{ color: "var(--ink-500)" }}>No centres are reporting volunteer needs yet.</p> :
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
                  {centres.map(c => (
                    <button key={c.centreId} className="card" onClick={() => setOpen(c.centreId)}
                      style={{ padding: 20, borderTop: "4px solid " + (c.color || "#5a3fb0"), textAlign: "left", cursor: "pointer", border: "1px solid rgba(12,20,50,0.08)", borderTopWidth: 4, borderTopColor: c.color || "#5a3fb0", background: "var(--paper,#fff)", transition: "transform .12s, box-shadow .12s" }}
                      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 24px -12px rgba(12,20,50,0.25)"; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19 }}>{c.name}</div>
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{c.code}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "14px 0 4px" }}>
                        <span className="display" style={{ fontSize: 34, fontWeight: 800, color: volTone(c.fulfillmentRate) }}>{c.fulfillmentRate}%</span>
                        <span style={{ fontSize: 13, color: "var(--ink-500)" }}>{c.filled}/{c.need || 0} filled</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 99, background: "rgba(12,20,50,0.08)", overflow: "hidden", marginTop: 8 }}>
                        <div style={{ width: Math.min(100, c.fulfillmentRate) + "%", height: "100%", background: volTone(c.fulfillmentRate), borderRadius: 99, transition: "width .6s ease" }}/>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: volTone(c.fulfillmentRate) }}>{volLabel(c.fulfillmentRate)}</span>
                        {c.gap > 0 ? <span className="mono" style={{ fontSize: 10, color: "var(--ink-500)" }}>{c.gap} needed →</span> : <span className="mono" style={{ fontSize: 10, color: "#2f9e44" }}>full →</span>}
                      </div>
                    </button>
                  ))}
                </div>}
            </div>
          </section>}

          {/* Transparency + CTA */}
          {sec.transparency !== false && <section className="section" style={{ background: "var(--navy-900)", color: "#fff", paddingTop: 44, paddingBottom: 52 }}>
            <div className="container" style={{ maxWidth: 760 }}>
              <span className="chip chip-on-dark"><span className="dot dot-lime"/> TRANSPARENCY</span>
              <h2 className="display" style={{ fontSize: "clamp(26px,3.5vw,40px)", margin: "12px 0 10px", color: "#fff" }}>{page.transparencyTitle || "Roles, not people."}</h2>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 15.5, lineHeight: 1.7, margin: "0 0 20px" }}>
                {page.transparencyBody || "This board shows only how many volunteers each centre needs and how many have stepped up — by role, faculty and course. A volunteer's name, photo or contact detail never appears here."}
              </p>
              {sec.cta !== false && <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setPage && setPage(page.ctaPage || "volunteer")}>{page.ctaLabel || "Volunteer with us →"}</button>
                <button className="btn btn-ghost btn-on-dark" onClick={() => setPage && setPage("s-status")}>See the Summer School board</button>
              </div>}
              <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 22 }}>Auto-refreshes every 45s · {d ? "last updated " + relAgo(d.generatedAt) : ""}</p>
            </div>
          </section>}
        </React.Fragment>
      )}

      {/* Per-centre detail modal */}
      {detail && (
        <div onMouseDown={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", background: "rgba(12,20,50,0.5)", backdropFilter: "blur(3px)" }}>
          <div onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={detail.name + " volunteer breakdown"}
            style={{ background: "var(--paper,#fbf7ed)", borderRadius: 20, maxWidth: 640, width: "100%", boxShadow: "0 32px 64px -24px rgba(0,0,0,0.5)", overflow: "hidden" }}>
            <div style={{ padding: "22px 24px", background: "#fff", borderBottom: "1px solid var(--line-cool,#e5e8ee)", borderTop: "5px solid " + (detail.color || "#5a3fb0") }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 5, background: detail.color || "#5a3fb0", display: "inline-block" }}/>
                  <div>
                    <h3 className="display" style={{ margin: 0, fontSize: 24 }}>{detail.name}</h3>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{detail.code}</span>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setOpen(null)} style={{ padding: "6px 12px" }}>Close ✕</button>
              </div>
              <div style={{ display: "flex", gap: 22, marginTop: 16, flexWrap: "wrap" }}>
                <div><div className="display" style={{ fontSize: 28, fontWeight: 800, color: volTone(detail.fulfillmentRate) }}>{detail.fulfillmentRate}%</div><div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: ".1em" }}>FILLED</div></div>
                <div><div className="display" style={{ fontSize: 28, fontWeight: 800 }}>{detail.filled}</div><div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: ".1em" }}>ON BOARD</div></div>
                <div><div className="display" style={{ fontSize: 28, fontWeight: 800 }}>{detail.need || 0}</div><div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: ".1em" }}>NEEDED</div></div>
                <div><div className="display" style={{ fontSize: 28, fontWeight: 800, color: detail.gap > 0 ? "#e8a92b" : "#2f9e44" }}>{detail.gap}</div><div className="mono" style={{ fontSize: 10, color: "var(--ink-500)", letterSpacing: ".1em" }}>OPEN</div></div>
              </div>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 22 }}>
              {/* By role */}
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--ink-400)", textTransform: "uppercase", marginBottom: 10 }}>By role</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {detail.byRole.map(r => (
                    <div key={r.role} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 118, fontSize: 14, fontWeight: 600 }}>{(VOL_ROLE_META[r.role] || {}).icon} {(VOL_ROLE_META[r.role] || {}).label || r.role}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 99, background: "rgba(12,20,50,0.08)", overflow: "hidden" }}>
                        <div style={{ width: Math.min(100, r.fulfillmentRate) + "%", height: "100%", background: volTone(r.fulfillmentRate), borderRadius: 99 }}/>
                      </div>
                      <span className="mono" style={{ fontSize: 12, width: 92, textAlign: "right", color: "var(--ink-600,#444)" }}>{r.filled}/{r.need} · {r.gap > 0 ? r.gap + " gap" : "full"}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* By faculty */}
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--ink-400)", textTransform: "uppercase", marginBottom: 10 }}>By faculty (mentors + instructors)</div>
                {!detail.byFaculty.length ? <p style={{ color: "var(--ink-500)", fontSize: 13, margin: 0 }}>No mentors or instructors on board here yet.</p> :
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {detail.byFaculty.map(f => (
                      <span key={f.faculty} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 10, background: "#fff", border: "1px solid var(--line-cool,#e5e8ee)", fontSize: 13 }}>
                        <b>{f.faculty}</b>
                        <span style={{ color: "var(--ink-500)" }}>{f.filled}{f.need ? " / " + f.need : ""}</span>
                      </span>
                    ))}
                  </div>}
              </div>
              {/* By faculty → course (instructors) */}
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: "var(--ink-400)", textTransform: "uppercase", marginBottom: 10 }}>Instructors by course</div>
                {!detail.byCourse.length ? <p style={{ color: "var(--ink-500)", fontSize: 13, margin: 0 }}>No instructors have signed up for a course here yet.</p> :
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <tbody>
                      {detail.byCourse.map((c, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--line-cool-soft,#eef0f4)" }}>
                          <td style={{ padding: "8px 6px", color: "var(--ink-500)" }}>{c.faculty || "—"}</td>
                          <td style={{ padding: "8px 6px", fontWeight: 600 }}>{c.course}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }} className="mono">{c.filled} instructor{c.filled === 1 ? "" : "s"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setPage && setPage("volunteer")}>Volunteer at {detail.name} →</button>
                <button className="btn btn-ghost" onClick={() => setOpen(null)}>← Back to overview</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes volpulse{0%{box-shadow:0 0 0 0 rgba(208,255,58,0.6)}70%{box-shadow:0 0 0 9px rgba(208,255,58,0)}100%{box-shadow:0 0 0 0 rgba(208,255,58,0)}}`}</style>
    </div>
  );
}

Object.assign(window, { HomePage, EventsBand, StatusPage, VolunteerStatusPage });
