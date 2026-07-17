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

function StatusPage({ setPage }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [, setTick] = React.useState(0);
  const load = React.useCallback(() => {
    NGGApi.public.status().then(r => { setD(r.status || r); setErr(""); }).catch(e => setErr(e.code || e.message));
  }, []);
  React.useEffect(() => {
    load();
    const poll = setInterval(() => { if (!document.hidden) load(); }, 45000);
    const clock = setInterval(() => setTick(t => t + 1), 1000); // keep "updated Xs ago" fresh
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  const k = (d && d.kpis) || {};
  const centres = (d && d.byCentre) || [];
  const trend = (d && d.trend) || [];
  const maxTrend = Math.max(1, ...trend.map(t => t.present || 0));
  const prog = (d && d.program) || {};

  const kpiCard = (icon, n, label, tone) => (
    <div className="status-kpi" style={{ background: "var(--paper, #fff)", border: "1px solid rgba(12,20,50,0.08)", borderRadius: 16, padding: "20px 20px 18px", boxShadow: "0 1px 0 rgba(12,20,50,0.03)" }}>
      <div style={{ fontSize: 20, marginBottom: 10 }} aria-hidden="true">{icon}</div>
      <div className="display" style={{ fontSize: 38, lineHeight: 1, color: tone || "var(--navy-900)", fontWeight: 800 }}>{typeof n === "number" ? <CountUp to={n}/> : n}</div>
      <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-500)", marginTop: 8 }}>{label}</div>
    </div>
  );

  return (
    <div className="page" data-screen-label="Live status">
      {/* Hero */}
      <section style={{ background: "linear-gradient(160deg,#0c1432 0%,#16224e 60%,#1d2c63 100%)", color: "#fff", padding: "72px 0 56px" }}>
        <div className="container">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(111,220,157,0.14)", border: "1px solid rgba(111,220,157,0.4)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6fdc9d", boxShadow: "0 0 0 0 rgba(111,220,157,0.7)", animation: "statuspulse 1.8s infinite" }}/>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "#bff3d4" }}>LIVE STATUS</span>
          </div>
          <h1 className="display" style={{ fontSize: "clamp(38px,6vw,72px)", margin: "18px 0 6px", lineHeight: 0.98 }}>{prog.name || "Summer School"} {prog.year || ""}</h1>
          <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, margin: 0 }}>
            {prog.week ? "Week " + prog.week + " · " : ""}A live, public view of attendance and participation across every centre.
            {d ? <span style={{ marginLeft: 10, opacity: 0.7 }}>Updated {relAgo(d.generatedAt)}</span> : null}
          </p>
          {err && <p style={{ color: "#ffb4b4", marginTop: 16 }}>Couldn't load the board — <button onClick={load} style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer" }}>retry</button>.</p>}

          {/* Headline attendance number */}
          {d && !err && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 34, flexWrap: "wrap" }}>
              <div>
                <div className="display" style={{ fontSize: "clamp(56px,10vw,110px)", lineHeight: 0.9, color: "#d0ff3a", fontWeight: 800 }}><CountUp to={k.attendanceRate || 0} suffix="%"/></div>
                <div className="mono" style={{ fontSize: 12, letterSpacing: "0.15em", color: "rgba(255,255,255,0.6)", marginTop: 6 }}>ATTENDANCE TODAY</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 18, paddingBottom: 18 }}>
                <b><CountUp to={k.presentToday || 0}/></b> of <b><CountUp to={k.enrolled || 0}/></b> students present across <b>{k.centres || 0}</b> centre{(k.centres || 0) === 1 ? "" : "s"}.
              </div>
            </div>
          )}
        </div>
      </section>

      {!d && !err && <div className="container" style={{ padding: "60px 0", textAlign: "center" }}><div className="dash-spinner"/></div>}

      {d && (
        <React.Fragment>
          {/* KPI grid */}
          <section className="section" style={{ paddingTop: 44 }}>
            <div className="container">
              <div className="status-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16 }}>
                {kpiCard("🏫", k.centres || 0, "Centres running")}
                {kpiCard("🎓", k.enrolled || 0, "Students enrolled")}
                {kpiCard("✅", k.presentToday || 0, "Present today")}
                {kpiCard("📈", (k.attendanceRate || 0) + "%", "Attendance rate", rateTone(k.attendanceRate || 0))}
                {kpiCard("🤝", k.activeVolunteers || 0, "Active volunteers")}
                {kpiCard("⭐", k.starsThisWeek || 0, "Stars this week")}
              </div>
            </div>
          </section>

          {/* Per-centre performance */}
          <section className="section" style={{ background: "var(--cream-50)", paddingTop: 44, paddingBottom: 44 }}>
            <div className="container">
              <SectionHead eyebrow="ACROSS THE CENTRES" title="Today, centre by centre." sub="Live attendance for each active centre. Green is on track; amber and red flag where the day needs attention." />
              {!centres.length ? <p style={{ color: "var(--ink-500)" }}>No active centres reporting yet today.</p> :
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
                  {centres.map(c => (
                    <div key={c.name} className="card" style={{ padding: 20, borderTop: "4px solid " + (c.color || "#76B043") }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19 }}>{c.name}</div>
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{c.code}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "14px 0 4px" }}>
                        <span className="display" style={{ fontSize: 34, fontWeight: 800, color: rateTone(c.rate) }}>{c.rate}%</span>
                        <span style={{ fontSize: 13, color: "var(--ink-500)" }}>{c.present} present</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 99, background: "rgba(12,20,50,0.08)", overflow: "hidden", marginTop: 8 }}>
                        <div style={{ width: Math.min(100, c.rate) + "%", height: "100%", background: rateTone(c.rate), borderRadius: 99, transition: "width .6s ease" }}/>
                      </div>
                      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: rateTone(c.rate), marginTop: 10 }}>
                        {c.rate >= 85 ? "On track" : c.rate >= 60 ? "Watch" : "Needs attention"}
                      </div>
                    </div>
                  ))}
                </div>}
            </div>
          </section>

          {/* 14-day trend */}
          <section className="section" style={{ paddingTop: 44 }}>
            <div className="container">
              <SectionHead eyebrow="THE LAST TWO WEEKS" title="Attendance trend." sub="Distinct students present each day over the last 14 days." />
              {!trend.length ? <p style={{ color: "var(--ink-500)" }}>No check-ins recorded yet.</p> :
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 180, padding: "0 2px", overflowX: "auto" }}>
                  {trend.map(t => (
                    <div key={t.date} title={t.date + " · " + t.present + " present"} style={{ flex: "1 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-500)" }}>{t.present}</span>
                      <div style={{ width: "100%", maxWidth: 30, height: Math.max(3, Math.round((t.present || 0) / maxTrend * 140)), background: "linear-gradient(180deg,var(--navy-900),#3b5bdb)", borderRadius: "5px 5px 0 0" }}/>
                      <span className="mono" style={{ fontSize: 9, color: "var(--ink-400,#93939a)", whiteSpace: "nowrap" }}>{String(t.date).slice(5)}</span>
                    </div>
                  ))}
                </div>}
            </div>
          </section>

          {/* Transparency + CTA */}
          <section className="section" style={{ background: "var(--navy-900)", color: "#fff", paddingTop: 44, paddingBottom: 52 }}>
            <div className="container" style={{ maxWidth: 760 }}>
              <span className="chip chip-on-dark"><span className="dot dot-lime"/> TRANSPARENCY</span>
              <h2 className="display" style={{ fontSize: "clamp(26px,3.5vw,40px)", margin: "12px 0 10px", color: "#fff" }}>Numbers, not names.</h2>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 15.5, lineHeight: 1.7, margin: "0 0 20px" }}>
                This board updates live and shows only aggregate figures — how many students attended, at which centres, and how participation is trending. A child's name, photo, or record <b>never</b> appears here. It's how we stay accountable to parents, partners and the community without compromising a single child's privacy.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setPage && setPage("join")}>Apply for a place →</button>
                <button className="btn btn-ghost btn-on-dark" onClick={() => setPage && setPage("home")}>Back to home</button>
              </div>
              <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 22 }}>Auto-refreshes every 45s · {d ? "last updated " + relAgo(d.generatedAt) : ""}</p>
            </div>
          </section>
        </React.Fragment>
      )}
      <style>{`@keyframes statuspulse{0%{box-shadow:0 0 0 0 rgba(111,220,157,0.6)}70%{box-shadow:0 0 0 9px rgba(111,220,157,0)}100%{box-shadow:0 0 0 0 rgba(111,220,157,0)}}`}</style>
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

function VolunteerStatusPage({ setPage }) {
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
  const detail = open ? centres.find(c => c.centreId === open) : null;

  const kpiCard = (icon, n, label, tone, suffix) => (
    <div style={{ background: "var(--paper,#fff)", border: "1px solid rgba(12,20,50,0.08)", borderRadius: 16, padding: "20px 20px 18px", boxShadow: "0 1px 0 rgba(12,20,50,0.03)" }}>
      <div style={{ fontSize: 20, marginBottom: 10 }} aria-hidden="true">{icon}</div>
      <div className="display" style={{ fontSize: 36, lineHeight: 1, color: tone || "var(--navy-900)", fontWeight: 800 }}>{typeof n === "number" ? <CountUp to={n}/> : n}{suffix || ""}</div>
      <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-500)", marginTop: 8 }}>{label}</div>
    </div>
  );

  return (
    <div className="page" data-screen-label="Volunteer status">
      {/* Hero — violet identity, distinct from the green attendance board */}
      <section style={{ background: "linear-gradient(155deg,#140a2e 0%,#2c1a63 55%,#4a2da0 100%)", color: "#fff", padding: "72px 0 56px", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", right: -90, top: -90, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(245,176,38,0.30),transparent 70%)" }}/>
        <div className="container" style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(208,255,58,0.12)", border: "1px solid rgba(208,255,58,0.4)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d0ff3a", animation: "volpulse 1.8s infinite" }}/>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "#e8ffb0" }}>LIVE · VOLUNTEER STATUS</span>
          </div>
          <h1 className="display" style={{ fontSize: "clamp(38px,6vw,72px)", margin: "18px 0 6px", lineHeight: 0.98 }}>Build the team.</h1>
          <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, margin: 0 }}>
            A live, public view of volunteer needs across every centre.
            {d ? <span style={{ marginLeft: 10, opacity: 0.7 }}>Updated {relAgo(d.generatedAt)}</span> : null}
          </p>
          {err && <p style={{ color: "#ffb4b4", marginTop: 16 }}>Couldn't load the board — <button onClick={load} style={{ background: "none", border: "none", color: "#fff", textDecoration: "underline", cursor: "pointer" }}>retry</button>.</p>}
          {d && !err && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 34, flexWrap: "wrap" }}>
              <div>
                <div className="display" style={{ fontSize: "clamp(56px,10vw,110px)", lineHeight: 0.9, color: "#d0ff3a", fontWeight: 800 }}><CountUp to={k.fulfillmentRate || 0} suffix="%"/></div>
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
              <button className="btn btn-gold btn-lg" onClick={() => setPage && setPage("volunteer")}>Volunteer with us →</button>
            </div>
          )}
        </div>
      </section>

      {!d && !err && <div className="container" style={{ padding: "60px 0", textAlign: "center" }}><div className="dash-spinner"/></div>}

      {d && (
        <React.Fragment>
          {/* KPI grid */}
          <section className="section" style={{ paddingTop: 44 }}>
            <div className="container">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16 }}>
                {kpiCard("🤝", k.totalVolunteers || 0, "Total volunteers")}
                {kpiCard("✅", k.activeVolunteers || 0, "Active now")}
                {kpiCard("🏫", k.centres || 0, "Centres")}
                {kpiCard("🎯", k.totalNeed || 0, "Total need")}
                {kpiCard("🟢", k.totalFilled || 0, "Slots filled", "#2f9e44")}
                {kpiCard("🧩", k.totalGap || 0, "Open slots", (k.totalGap || 0) > 0 ? "#e8a92b" : "#2f9e44")}
              </div>
            </div>
          </section>

          {/* Per-centre cards */}
          <section className="section" style={{ background: "var(--cream-50)", paddingTop: 44, paddingBottom: 44 }}>
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
          </section>

          {/* Transparency + CTA */}
          <section className="section" style={{ background: "var(--navy-900)", color: "#fff", paddingTop: 44, paddingBottom: 52 }}>
            <div className="container" style={{ maxWidth: 760 }}>
              <span className="chip chip-on-dark"><span className="dot dot-lime"/> TRANSPARENCY</span>
              <h2 className="display" style={{ fontSize: "clamp(26px,3.5vw,40px)", margin: "12px 0 10px", color: "#fff" }}>Roles, not people.</h2>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 15.5, lineHeight: 1.7, margin: "0 0 20px" }}>
                This board shows only how many volunteers each centre needs and how many have stepped up — by role, faculty and course. A volunteer's name, photo or contact detail <b>never</b> appears here.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setPage && setPage("volunteer")}>Volunteer with us →</button>
                <button className="btn btn-ghost btn-on-dark" onClick={() => setPage && setPage("s-status")}>See the Summer School board</button>
              </div>
              <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 22 }}>Auto-refreshes every 45s · {d ? "last updated " + relAgo(d.generatedAt) : ""}</p>
            </div>
          </section>
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
