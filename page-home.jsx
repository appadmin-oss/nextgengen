/* ================================================================
   NGG — Home + Progression (cinematic pass)
   ================================================================ */

function HomePage({ setPage }) {
  return (
    <div className="page" data-screen-label="01 Home">
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
              <em className="shimmer-gold" style={{fontStyle:"normal"}}>
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
                  <span className="mono" style={{fontSize:10, letterSpacing:"0.15em", textTransform:"uppercase", color:"rgba(255,255,255,0.75)"}}>GENIUS OF THE WEEK</span>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:12}}>
                  <Avatar seed="tunde" name="Tunde" size={42} ring/>
                  <div>
                    <div style={{fontWeight:600, fontSize:15}}>Tunde · 16</div>
                    <div style={{fontSize:11, color:"rgba(255,255,255,0.7)", marginTop:2}}>+2,980 XP · Week 10 / 12</div>
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
          eyebrow="STORIES FROM THE COHORT"
          title="The work shows in the people."
          sub="Four voices from inside the program. A teenager who shipped a beat. A parent who saw the change. A mentor who has watched it happen four times now."
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

Object.assign(window, { HomePage, EventsBand });
