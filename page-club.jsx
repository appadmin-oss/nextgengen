/* ================================================================
   NGG — Summer Students + NGGC Members + Member Profile
   ================================================================ */

/* =================== SUMMER STUDENTS =================== */
function SummerPage({ setPage }) {
  const [track, setTrack] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const pool = track === "all" ? MEMBERS : MEMBERS.filter(m => m.track === track);
  const filtered = (track === "all" && !showAll) ? pool.slice(0, 8) : pool;
  const hiddenCount = pool.length - filtered.length;

  return (
    <div className="page" data-screen-label="02 Summer Students">
      {/* Header band */}
      <section className="page-hero page-hero-light" style={{background:"var(--cream-100)", padding:"72px 0 56px"}}>
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:48, alignItems:"end"}}>
            <div>
              <span className="chip chip-navy"><span className="dot dot-gold"/> STAGE 01 · DISCOVERY</span>
              <h1 className="display" style={{fontSize:"clamp(60px, 8vw, 120px)", margin:"18px 0 16px"}}>
                Summer<br/>
                <em style={{fontStyle:"normal", color:"var(--coral)"}}>Students.</em>
              </h1>
              <p style={{fontSize:19, lineHeight:1.5, color:"var(--ink-700)", maxWidth:560, margin:0}}>
                Six weeks. Eight tracks. One bold move. Our summer program is the front door — built for teenagers 10–17 who suspect they have something but have not yet been asked to show it.
              </p>
              <div style={{display:"flex", gap:12, marginTop:32, flexWrap:"wrap"}}>
                <button className="btn btn-primary btn-lg" onClick={() => { window.__nggProgram = "summer"; setPage("join"); }}>Start application →</button>
                <button className="btn btn-ghost btn-lg" onClick={() => setPage("parents")}>For parents & guardians</button>
              </div>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <Photo name="graduation" style={{height:210}}/>
              <Photo name="techLab" style={{height:210}}/>
              <Photo name="dance" style={{height:170}}/>
              <Photo name="mentor" style={{height:170}}/>
            </div>
          </div>
        </div>
      </section>

      {/* Six-week schedule */}
      <section className="section">
        <div className="container">
          <SectionHead eyebrow="SUMMER SCHEDULE · 6 WEEKS" title="A rhythm, not a timetable." sub="Mornings are craft. Afternoons are character. Saturdays are showcase. Sundays are rest." />
          <div className="card" style={{padding:0, overflow:"hidden"}}>
            <div style={{display:"grid", gridTemplateColumns:"repeat(6, 1fr)"}}>
              {[
                { w: 1, t: "Welcome & Identity",   v: "Who am I bringing into this room?" },
                { w: 2, t: "Craft Immersion",      v: "Pick your track. Build your first thing." },
                { w: 3, t: "Voice & Stage",        v: "Speak in front of the cohort." },
                { w: 4, t: "Community Field Trip", v: "Take the work outside the building." },
                { w: 5, t: "Make Week",            v: "Five days to finish your showcase piece." },
                { w: 6, t: "Graduation Showcase",  v: "Family, mentors, judges, recommendations." },
              ].map((row, i, arr) => (
                <div key={row.w} style={{padding:"28px 24px", borderRight: i < arr.length-1 ? "1px solid rgba(12,20,50,0.08)" : "none", display:"flex", flexDirection:"column", gap:12, minHeight:200}}>
                  <div className="display" style={{fontSize:48, color:"var(--gold-500)"}}>0{row.w}</div>
                  <div style={{fontWeight:700, fontSize:15}}>{row.t}</div>
                  <div style={{fontSize:13, color:"var(--ink-500)", lineHeight:1.4}}>{row.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Track filter + cohort gallery */}
      <section className="section" style={{background:"var(--cream-50)"}}>
        <div className="container">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"end", marginBottom:32, flexWrap:"wrap", gap:24}}>
            <div style={{maxWidth:560}}>
              <span className="eyebrow" style={{color:"var(--navy-900)"}}>SAMPLE COHORT</span>
              <h2 className="display" style={{fontSize:"clamp(36px, 4.5vw, 60px)", margin:"6px 0 0"}}>How the summer class looks.</h2>
              <p style={{fontSize:13.5, color:"var(--ink-500)", margin:"8px 0 0"}}>An illustrative layout — not real students. Real cohort profiles appear here once the summer class is enrolled.</p>
            </div>
            <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
              <button onClick={() => setTrack("all")} className={"chip " + (track === "all" ? "chip-navy" : "")} style={{cursor:"pointer", fontSize:13, padding:"8px 14px"}}>All tracks · {MEMBERS.length}</button>
              {TRACKS.filter(t => MEMBERS.some(m => m.track === t.name)).slice(0, 5).map(t => (
                <button key={t.id} onClick={() => setTrack(t.name)} className={"chip " + (track === t.name ? "chip-navy" : "")} style={{cursor:"pointer", fontSize:13, padding:"8px 14px"}}>
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <div style={{textAlign:"center", padding:"48px 0", color:"var(--ink-700)"}}>
              No students on this track yet this cohort.
              <div style={{marginTop:14}}>
                <button className="btn btn-ghost btn-sm" onClick={() => setTrack("all")}>Show all tracks</button>
              </div>
            </div>
          )}
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:18}}>
            {filtered.map((m, i) => (
              <div key={m.id} className="member-card reveal" data-reveal style={{"--reveal-delay": (i * 50) + "ms"}} onClick={() => setPage("profile")}>
                <Photo src={portrait(m.id+10, 600, 600)} ratio="1/1" style={{borderRadius:14}}>
                  <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(12,20,50,0) 40%, rgba(12,20,50,0.55) 100%)"}}/>
                  <div style={{position:"absolute", top:10, left:10}}>
                    <span className="chip chip-on-dark" style={{background:"rgba(12,20,50,0.55)", color:"white"}}>{m.track}</span>
                  </div>
                  <div style={{position:"absolute", bottom:10, right:10, fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:"0.15em", color:"rgba(255,255,255,0.95)", background:"rgba(12,20,50,0.6)", padding:"3px 8px", borderRadius:4}}>
                    LVL {String(m.level).padStart(2,"0")}
                  </div>
                </Photo>
                <div>
                  <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:20, letterSpacing:"-0.02em"}}>{m.first}</div>
                  <div style={{fontSize:12, color:"var(--coral)", fontWeight:600, marginTop:2}}>{m.title}</div>
                </div>
                <Progress value={Math.min(100, (m.week / 12) * 100)} label={`Week ${m.week} of 12`} variant="gold" />
                <div style={{display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--ink-500)", fontFamily:"var(--font-mono)"}}>
                  <span>{m.community.toUpperCase()}</span>
                  <span>★ {m.badges} BADGES</span>
                </div>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <div style={{textAlign:"center", marginTop:32}}>
              <button className="btn btn-ghost" onClick={() => setShowAll(true)}>
                Show {hiddenCount} more student{hiddenCount === 1 ? "" : "s"} →
              </button>
            </div>
          )}
          {showAll && track === "all" && (
            <div style={{textAlign:"center", marginTop:32}}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(false)}>Show fewer</button>
            </div>
          )}
        </div>
      </section>

      {/* Pathway forward */}
      <section className="section dark-surface">
        <div className="container">
          <SectionHead eyebrow="WHAT COMES AFTER SUMMER" title="The graduation is the beginning." />
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:24}}>
            {[
              { code: "01", h: "Showcase Day",   d: "A live, public performance of your track. Family, mentors, judges, press. Real stakes, real applause." },
              { code: "02", h: "Profile Badge",  d: "Your first NGG digital badge — minted to your member profile, visible to mentors across the network." },
              { code: "03", h: "NGGC Invite",    d: "Top performers receive a recommendation into the Next Generation Genius Club — and Anchor 12." },
            ].map(s => (
              <div key={s.code} className="card-dark">
                <div className="display" style={{fontSize:88, color:"var(--gold-500)", lineHeight:1}}>{s.code}</div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize:24, marginTop:10}}>{s.h}</div>
                <p style={{color:"rgba(255,255,255,0.7)", lineHeight:1.5, marginTop:10, fontSize:14}}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* =================== NGGC MEMBERS =================== */
function ClubPage({ setPage }) {
  const [sortBy, setSortBy] = useState("rank"); // "rank" (by XP) | "name"
  // Live cohort leaderboard (privacy-safe first name + initial); fall back to
  // the demo roster when the API is empty (fresh install / marketing preview).
  const [live, setLive] = useState(null);
  useEffect(() => {
    let alive = true;
    NGGApi.public.leaderboard(24).then(r => {
      if (!alive) return;
      const rows = (r && r.leaderboard) || [];
      if (rows.length >= 3) setLive(rows.map(m => ({
        id: m.memberId, first: m.first + (m.initial ? " " + m.initial : ""), community: m.centre || "NGG",
        title: "Level " + m.level, xp: m.xp, level: m.level, streak: m.streak || 0, week: m.week || 1,
        quote: "Showing up, leveling up.",
      })));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const roster = live || MEMBERS;
  const top = [...roster].sort((a,b) => b.xp - a.xp);
  const directory = sortBy === "rank" ? top : [...roster].sort((a,b) => a.first.localeCompare(b.first));
  const featured = top[0];

  return (
    <div className="page" data-screen-label="03 NGGC Members">
      <section className="page-hero page-hero-dark" style={{background:"var(--navy-900)", color:"white", padding:"64px 0", position:"relative", overflow:"hidden"}}>
        <div style={{position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 80% 20%, rgba(245,176,38,0.16), transparent 60%)"}}/>
        <div className="container" style={{position:"relative"}}>
          <div style={{display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:48, alignItems:"end"}}>
            <div>
              <span className="chip chip-on-dark"><span className="dot dot-lime"/> STAGE 02 · IDENTITY</span>
              <h1 className="display" style={{fontSize:"clamp(64px, 8.5vw, 132px)", margin:"18px 0", color:"white", lineHeight:0.9}}>
                The Genius<br/>
                <span style={{color:"var(--gold-500)"}}>Club.</span>
              </h1>
              <p style={{fontSize:19, lineHeight:1.5, color:"rgba(255,255,255,0.78)", maxWidth:560}}>
                A teen society with Genius IDs, weekly missions, public skill badges and a leaderboard the whole cohort watches. Hogwarts crossed with the creator economy, made for African excellence.
              </p>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:14}}>
              <div className="card-dark" style={{background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)"}}>
                <div className="eyebrow" style={{color:"var(--gold-400)"}}>GENIUS OF THE WEEK</div>
                <div style={{display:"flex", alignItems:"center", gap:14, marginTop:14}}>
                  <Avatar seed={featured.id} name={featured.first} size={64} ring/>
                  <div>
                    <div style={{fontSize:22, fontWeight:700, fontFamily:"var(--font-display)"}}>{featured.first} · {featured.community}</div>
                    <div style={{fontSize:13, color:"var(--gold-400)", marginTop:2}}>{featured.title}</div>
                    <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:4}}>LVL {featured.level} · {featured.xp.toLocaleString()} XP · {featured.streak}-day streak</div>
                  </div>
                </div>
                <p style={{fontSize:14, marginTop:14, fontStyle:"italic", color:"rgba(255,255,255,0.85)", borderLeft:"2px solid var(--gold-500)", paddingLeft:12, marginBottom:0}}>
                  "{featured.quote}"
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Club dashboard */}
      <section className="section" style={{background:"var(--cream-50)"}}>
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:24, alignItems:"start"}}>
            {/* Member directory */}
            <div>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"end", marginBottom:20}}>
                <div>
                  <span className="eyebrow" style={{color:"var(--gold-500)"}}>MEMBER DIRECTORY · 164</span>
                  <h2 className="display" style={{fontSize:48, margin:"4px 0 0"}}>The cohort, in motion.</h2>
                </div>
                <div style={{display:"flex", gap:8}}>
                  <button
                    className={"btn btn-sm " + (sortBy === "name" ? "btn-primary" : "btn-ghost")}
                    onClick={() => setSortBy("name")}
                    aria-pressed={sortBy === "name"}
                  >A–Z</button>
                  <button
                    className={"btn btn-sm " + (sortBy === "rank" ? "btn-primary" : "btn-ghost")}
                    onClick={() => setSortBy("rank")}
                    aria-pressed={sortBy === "rank"}
                  >By rank</button>
                </div>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14}}>
                {directory.slice(0, 9).map((m) => (
                  <div key={m.id} className="member-card" onClick={() => setPage("profile")} style={{padding:14}}>
                    <div style={{display:"flex", alignItems:"center", gap:12}}>
                      <div style={{position:"relative"}}>
                        <Avatar seed={m.id} name={m.first} size={52}/>
                        <div style={{position:"absolute", bottom:-4, right:-4, background:"var(--gold-500)", color:"var(--navy-900)", borderRadius:"50%", width:22, height:22, display:"grid", placeItems:"center", fontSize:10, fontWeight:800, border:"2px solid white"}}>
                          {top.findIndex(t => t.id === m.id) + 1}
                        </div>
                      </div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:700, fontSize:15}}>{m.first}</div>
                        <div style={{fontSize:11, color:"var(--ink-500)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{m.title}</div>
                      </div>
                    </div>
                    <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                      <span className="chip" style={{fontSize:11, padding:"3px 8px"}}>Lvl {m.level}</span>
                      <span className="chip chip-gold" style={{fontSize:11, padding:"3px 8px"}}>{m.xp.toLocaleString()} XP</span>
                    </div>
                    <Progress value={(m.week/12)*100} variant="lime" />
                  </div>
                ))}
              </div>
            </div>

            {/* Right column: rankings + missions */}
            <div style={{display:"flex", flexDirection:"column", gap:18, position:"sticky", top:90}}>
              {/* Leaderboard */}
              <div className="card" style={{padding:0, overflow:"hidden"}}>
                <div style={{padding:"18px 22px", borderBottom:"1px solid rgba(12,20,50,0.07)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:18}}>Top of the leaderboard</div>
                  <span className="chip chip-lime">This week</span>
                </div>
                <div>
                  {top.slice(0,5).map((m, i) => (
                    <div key={m.id} style={{display:"flex", alignItems:"center", gap:14, padding:"12px 22px", borderTop: i === 0 ? "none" : "1px solid rgba(12,20,50,0.05)", background: i === 0 ? "rgba(245,176,38,0.07)" : "transparent"}}>
                      <div style={{width:24, fontFamily:"var(--font-display)", fontWeight:800, fontSize:22, color: i === 0 ? "var(--gold-500)" : "var(--ink-400)"}}>{String(i+1).padStart(2,"0")}</div>
                      <Avatar seed={m.id} name={m.first} size={36}/>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:600, fontSize:14}}>{m.first}</div>
                        <div className="mono" style={{fontSize:10, color:"var(--ink-500)"}}>{m.community.toUpperCase()}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:700, fontSize:14, fontFamily:"var(--font-mono)"}}>{m.xp.toLocaleString()}</div>
                        <div style={{fontSize:10, color:"var(--gold-500)"}}>↑ {Math.floor(m.xp/100)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live missions */}
              <div className="card" style={{padding:22, background:"var(--navy-900)", color:"white"}}>
                <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12}}>
                  <span className="live-dot"/>
                  <div className="eyebrow" style={{color:"var(--lime)"}}>LIVE COHORT MISSION</div>
                </div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:22, lineHeight:1.1, letterSpacing:"-0.02em"}}>
                  Interview an elder. Bring back one proverb.
                </div>
                <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:14}}>
                  126 / 164 completed · ends Sun 23:59
                </div>
                <div className="progress dark mt-8"><i style={{width: "76%", background:"var(--lime)"}}/></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Badges wall */}
      <section className="section">
        <div className="container">
          <SectionHead eyebrow="THE BADGE SYSTEM" title="Public skill, in public view." sub="Badges live on member profiles. They unlock at concrete, observable milestones — not for showing up, but for doing the work in public." />
          <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:18}}>
            {BADGES.map((b, i) => (
              <div key={b.id} className="card" style={{padding:24, display:"flex", flexDirection:"column", alignItems:"center", gap:14, textAlign:"center", opacity: b.locked ? 0.55 : 1}}>
                <BadgePin badge={b}/>
                <div style={{fontWeight:700, fontSize:14}}>{b.name}</div>
                <div className="mono" style={{fontSize:10, color:"var(--ink-500)", letterSpacing:"0.12em", textTransform:"uppercase"}}>
                  {b.locked ? "LOCKED" : `Earned by ${badgeEarnRate(b.id)}%`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// Stable per-badge earn rate — previously Math.random() in render, which
// re-rolled a different number on every re-render.
function badgeEarnRate(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return 20 + (h % 61); // 20–80%
}

function BadgePin({ badge }) {
  const map = {
    "comm":    { icon: "◎",  cls: "navy" },
    "disc":    { icon: "✦",  cls: "unlocked" },
    "tech":    { icon: "</>",cls: "lime" },
    "voice":   { icon: '"',  cls: "unlocked" },
    "create":  { icon: "✷",  cls: "navy" },
    "vanguard":{ icon: "★",  cls: "navy locked" },
    "culture": { icon: "▲",  cls: "unlocked" },
    "streak":  { icon: "30", cls: "lime" },
    "mentor":  { icon: "M",  cls: "navy locked" },
  };
  const m = map[badge.id];
  return <div className={"badge-pin " + m.cls}>{m.icon}</div>;
}

/* =================== COMMUNITY =================== */
/* A public, PII-safe community hub — the movement at a glance. Wired to real
   data: KPIs from public.stats, the member directory + leaderboard from
   public.leaderboard (first name + last initial only), and centres/groups
   derived from those members. No fabricated activity feed — everything shown
   is a real record. Adapts the attached Community design. */
function CommunityPage({ setPage }) {
  const [members, setMembers] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [view, setView] = React.useState("members");   // members | centres | leaders
  const [q, setQ] = React.useState("");
  const [centre, setCentre] = React.useState("All");
  const [panel, setPanel] = React.useState(null);
  const [err, setErr] = React.useState(false);

  // Close the member detail panel on Escape (keyboard users can't reach the ✕).
  React.useEffect(() => {
    if (!panel) return;
    const onKey = (e) => { if (e.key === "Escape") setPanel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  React.useEffect(() => {
    let alive = true;
    NGGApi.public.leaderboard(60).then(r => { if (alive) setMembers(r.leaderboard || []); }).catch(() => { if (alive) setErr(true); });
    NGGApi.public.stats().then(r => { if (alive) setStats(r.stats || {}); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const PALETTE = ["#f5b026", "#b07cff", "#2f9e44", "#3b5bdb", "#ff5a3c", "#17a2b8", "#e8a92b", "#6a3fc0"];
  const colorFor = (s) => PALETTE[(String(s).charCodeAt(0) || 0) % PALETTE.length];
  const nameOf = (m) => (m.first + (m.initial ? " " + m.initial : "")).trim();

  const all = members || [];
  const centres = React.useMemo(() => {
    const map = {};
    all.forEach(m => { const c = m.centre || "Unassigned"; map[c] = (map[c] || 0) + 1; });
    return Object.keys(map).sort().map(name => ({ name, count: map[name] }));
  }, [members]);
  const centreOpts = ["All"].concat(centres.map(c => c.name));

  const ql = q.trim().toLowerCase();
  const filtered = all.filter(m =>
    (centre === "All" || m.centre === centre) &&
    (!ql || nameOf(m).toLowerCase().includes(ql) || (m.centre || "").toLowerCase().includes(ql))
  );
  const leaders = [...all].sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 8);

  const kpis = [
    { value: stats && stats.activeMembers > 0 ? stats.activeMembers.toLocaleString() : (all.length ? String(all.length) : "—"), label: "Active members", color: "#fff" },
    { value: stats && stats.missionsVerified > 0 ? stats.missionsVerified.toLocaleString() : "—", label: "Missions verified", color: "#fff" },
    { value: stats && stats.mentors > 0 ? String(stats.mentors) : "—", label: "Volunteer mentors", color: "#d0ff3a" },
    { value: stats && stats.centres > 0 ? String(stats.centres).padStart(2, "0") : (centres.length ? String(centres.length).padStart(2, "0") : "—"), label: "Centres live", color: "#f5b026" },
  ];

  const tabBtn = (k, label, icon) => (
    <button key={k} onClick={() => { setView(k); setPanel(null); }} className="mono"
      style={{ fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, padding: "12px 6px", border: "none", background: "none", cursor: "pointer", borderBottom: "2.5px solid " + (view === k ? "var(--gold-500)" : "transparent"), color: view === k ? "#fff" : "rgba(255,255,255,0.55)", display: "inline-flex", alignItems: "center", gap: 7 }}>
      <i className={"ph " + icon}/>{label}
    </button>
  );

  return (
    <div className="page" data-screen-label="Community">
      <style>{"@keyframes ngg-panel-in{from{transform:translateX(100%)}to{transform:none}}@keyframes ngg-fade{from{opacity:0}to{opacity:1}}"}</style>

      <section style={{ background: "var(--grad-hero, linear-gradient(158deg,#0c1432,#16224e 58%,#1d2c63))", color: "#fff", position: "relative", overflow: "hidden", paddingTop: 40 }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(46% 42% at 90% 4%, rgba(245,176,38,0.22), transparent 62%)" }}/>
        <div className="container" style={{ maxWidth: 1320, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.14em", padding: "6px 13px", borderRadius: 999, background: "rgba(208,255,58,0.12)", border: "1px solid rgba(208,255,58,0.4)", color: "#e8ffb0" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--lime,#d0ff3a)" }}/>{all.length ? all.length + " GENIUSES ON THE BOARD" : "THE MOVEMENT"}
            </span>
            <div style={{ position: "relative", width: 260, maxWidth: "44vw" }}>
              <i className="ph ph-magnifying-glass" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.5)", fontSize: 15 }}/>
              <input value={q} onChange={e => { setQ(e.target.value); if (e.target.value) setView("members"); }} placeholder="Search members…" style={{ width: "100%", fontFamily: "inherit", fontSize: 13, padding: "9px 12px 9px 34px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", outline: "none" }}/>
            </div>
          </div>
          <h1 className="display" style={{ fontWeight: 800, fontSize: "clamp(30px,4.6vw,48px)", letterSpacing: "-0.03em", lineHeight: 1, margin: "18px 0 10px" }}>The Genius community.</h1>
          <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 15, maxWidth: 600, margin: "0 0 22px" }}>Every centre, every track, one movement. Names are shown as first name + initial — numbers, not full names.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.12)" }} className="home-kpi-strip">
            {kpis.map((k, i) => (
              <div key={i} style={{ borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.14)", padding: "20px 0 20px " + (i === 0 ? "0" : "16px") }}>
                <div className="display" style={{ fontWeight: 800, fontSize: "clamp(24px,3.2vw,32px)", color: k.color, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginTop: 6 }}>{k.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            {tabBtn("members", "Members", "ph-users-three")}
            {tabBtn("centres", "Centres", "ph-buildings")}
            {tabBtn("leaders", "Leaderboard", "ph-trophy")}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 32 }}>
        <div className="container" style={{ maxWidth: 1320 }}>
          {err ? <div className="admin-empty" style={{ textAlign: "center", padding: 40, color: "var(--ink-500)" }}>Couldn't load the community right now — try again shortly.</div>
           : members === null ? <div className="dash-spinner" style={{ margin: "60px auto" }}/>
           : all.length === 0 ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-500)" }}>The board fills up as members earn XP. Check back soon.</div>
           : view === "centres" ? (
            <>
              <h2 className="display" style={{ fontSize: 22, margin: "0 0 18px" }}>Centres &amp; groups</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
                {centres.map(c => (
                  <button key={c.name} onClick={() => { setCentre(c.name); setView("members"); }} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: "#fff", border: "1px solid var(--line-cool,#e5e8ee)", borderTop: "4px solid " + colorFor(c.name), borderRadius: 14, padding: 18, color: "var(--ink-900)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <b className="display" style={{ fontWeight: 700, fontSize: 16 }}>{c.name}</b>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>{c.count} member{c.count === 1 ? "" : "s"}</span>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: colorFor(c.name), display: "inline-flex", alignItems: "center", gap: 5 }}>View members <i className="ph ph-arrow-right"/></div>
                  </button>
                ))}
              </div>
            </>
          ) : view === "leaders" ? (
            <>
              <h2 className="display" style={{ fontSize: 22, margin: "0 0 18px" }}>Top of the board</h2>
              <div style={{ background: "#fff", border: "1px solid var(--line-cool,#e5e8ee)", borderRadius: 16, overflow: "hidden", maxWidth: 640 }}>
                {leaders.map((m, i) => (
                  <button key={m.memberId || i} onClick={() => setPanel(m)} style={{ width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", border: "none", borderBottom: i < leaders.length - 1 ? "1px solid var(--line-cool-soft,#eef0f4)" : "none", background: "none" }}>
                    <span className="display" style={{ width: 24, fontWeight: 800, fontSize: 15, color: i < 3 ? "var(--gold-600,#a07400)" : "var(--ink-400)" }}>{i + 1}</span>
                    <span className="display" style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, color: "#fff", background: colorFor(m.first), flex: "none" }}>{(m.first[0] || "?").toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><b className="display" style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-900)" }}>{nameOf(m)}</b><span className="mono" style={{ display: "block", fontSize: 10.5, color: "var(--ink-400)", marginTop: 2 }}>{m.centre || "—"} · LVL {m.level}</span></span>
                    <span className="mono" style={{ fontSize: 12.5, color: "var(--gold-600,#a07400)", fontWeight: 600 }}>{(m.xp || 0).toLocaleString()} XP</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                <div>
                  <h2 className="display" style={{ fontSize: 22, margin: 0 }}>Members</h2>
                  <p style={{ color: "var(--ink-500)", fontSize: 13.5, margin: "6px 0 0" }}>{filtered.length} showing{ql ? ' for "' + q + '"' : ""}{centre !== "All" ? " · " + centre : ""}</p>
                </div>
                <select value={centre} onChange={e => setCentre(e.target.value)} className="admin-select" style={{ fontSize: 13, fontWeight: 600, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--cream-200,#d9d2c0)", background: "#fff", cursor: "pointer" }}>
                  {centreOpts.map(c => <option key={c} value={c}>{c === "All" ? "All centres" : c}</option>)}
                </select>
              </div>
              {filtered.length === 0 ? <div style={{ border: "1px dashed var(--cream-200,#d9d2c0)", borderRadius: 16, padding: 32, textAlign: "center", color: "var(--ink-400)" }}>No members match.</div> :
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
                {filtered.map((m, i) => (
                  <button key={m.memberId || i} onClick={() => setPanel(m)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: "#fff", border: "1px solid var(--line-cool,#e5e8ee)", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="display" style={{ width: 44, height: 44, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16, color: "#fff", background: colorFor(m.first) }}>{(m.first[0] || "?").toUpperCase()}</span>
                    <span style={{ minWidth: 0 }}>
                      <b className="display" style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink-900)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(m)}</b>
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-400)" }}>{m.centre || "—"} · LVL {m.level}</span>
                    </span>
                  </button>
                ))}
              </div>}
            </>
          )}
        </div>
      </section>

      {panel && (<>
        <div onClick={() => setPanel(null)} style={{ position: "fixed", inset: 0, background: "rgba(12,20,50,0.45)", zIndex: 50, animation: "ngg-fade .2s ease" }}/>
        <div role="dialog" aria-modal="true" aria-label={"Member profile — " + nameOf(panel)} style={{ position: "fixed", top: 0, right: 0, height: "100%", width: 360, maxWidth: "92vw", background: "#fff", zIndex: 51, boxShadow: "-16px 0 40px rgba(12,20,50,0.25)", animation: "ngg-panel-in .25s cubic-bezier(.2,.8,.2,1)", overflowY: "auto" }}>
          <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "flex-end" }}><button onClick={() => setPanel(null)} aria-label="Close profile" style={{ border: "none", background: "var(--cream-100,#f3ecdb)", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 16, color: "var(--ink-500)" }}><i className="ph ph-x"/></button></div>
          <div style={{ padding: "8px 28px 28px", textAlign: "center" }}>
            <span className="display" style={{ width: 84, height: 84, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 30, color: "#fff", background: colorFor(panel.first), margin: "0 auto" }}>{(panel.first[0] || "?").toUpperCase()}</span>
            <h3 className="display" style={{ fontWeight: 800, fontSize: 20, margin: "14px 0 3px" }}>{nameOf(panel)}</h3>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>{panel.centre || "—"} · Level {panel.level}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "16px 0" }}>
              <span className="mono" style={{ fontSize: 11.5, background: "var(--cream-50,#faf6ec)", border: "1px solid var(--cream-200,#e8dec6)", borderRadius: 999, padding: "5px 12px" }}>{(panel.xp || 0).toLocaleString()} XP</span>
              <span className="mono" style={{ fontSize: 11.5, background: "var(--cream-50,#faf6ec)", border: "1px solid var(--cream-200,#e8dec6)", borderRadius: 999, padding: "5px 12px" }}>{panel.streak || 0}d streak</span>
              <span className="mono" style={{ fontSize: 11.5, background: "var(--cream-50,#faf6ec)", border: "1px solid var(--cream-200,#e8dec6)", borderRadius: 999, padding: "5px 12px" }}>Wk {panel.week || 1}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.55, margin: "18px 0 0" }}>A Next Generation Genius member at {panel.centre || "our programme"}, currently on week {panel.week || 1} of the journey.</p>
          </div>
        </div>
      </>)}
    </div>
  );
}

Object.assign(window, { SummerPage, ClubPage, BadgePin, CommunityPage });
