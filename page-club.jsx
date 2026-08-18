/* ================================================================
   NGG — Summer Students + NGGC Members + Member Profile
   ================================================================ */

/* =================== SUMMER STUDENTS =================== */
function SummerPage({ setPage }) {
  const [track, setTrack] = useState("all");
  const [showAll, setShowAll] = useState(false);
  /* The real cohort.
   *
   * This gallery was twelve invented teenagers from data.js, captioned "not
   * real students". On a live programme's own site that is the wrong thing to
   * publish: it fills the page a parent reads with children who do not exist,
   * and it hides the fact that the real ones are one API call away.
   *
   * Comes from the public status board, which is already consent-gated — a
   * name and photograph appear only where a guardian agreed to it, and
   * everyone else is here under their handle exactly as on /s-status. */
  const [cohort, setCohort] = useState(null);   // null = still loading
  useEffect(() => {
    let alive = true;
    NGGApi.public.status()
      .then(r => { if (alive) setCohort(((r && r.status && r.status.members) || [])); })
      .catch(() => { if (alive) setCohort([]); });
    return () => { alive = false; };
  }, []);

  const roster = cohort || [];
  const faculties = Array.from(new Set(roster.map(m => m.faculty).filter(Boolean)));
  const pool = track === "all" ? roster : roster.filter(m => m.faculty === track);
  const filtered = (track === "all" && !showAll) ? pool.slice(0, 8) : pool;
  const hiddenCount = pool.length - filtered.length;
  const maxStars = Math.max(1, ...roster.map(m => m.stars || 0));

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
              <span className="eyebrow" style={{color:"var(--navy-900)"}}>THIS COHORT</span>
              <h2 className="display" style={{fontSize:"clamp(36px, 4.5vw, 60px)", margin:"6px 0 0"}}>The summer class.</h2>
              <p style={{fontSize:13.5, color:"var(--ink-500)", margin:"8px 0 0"}}>
                Live from the register. A student is named and pictured only where their parent or guardian has consented; everyone else appears under their handle.
              </p>
            </div>
            <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
              <button onClick={() => setTrack("all")} className={"chip " + (track === "all" ? "chip-navy" : "")} style={{cursor:"pointer", fontSize:13, padding:"8px 14px"}}>All faculties · {roster.length}</button>
              {faculties.slice(0, 6).map(f => (
                <button key={f} onClick={() => setTrack(f)} className={"chip " + (track === f ? "chip-navy" : "")} style={{cursor:"pointer", fontSize:13, padding:"8px 14px"}}>
                  {f} · {roster.filter(m => m.faculty === f).length}
                </button>
              ))}
            </div>
          </div>

          {cohort === null && (
            <div style={{textAlign:"center", padding:"48px 0"}}><div className="dash-spinner" style={{margin:"0 auto"}}/></div>
          )}
          {cohort !== null && roster.length === 0 && (
            <div style={{textAlign:"center", padding:"48px 0", color:"var(--ink-700)"}}>
              The summer class has not been enrolled yet. Real students appear here as they register — we do not fill this space with examples.
            </div>
          )}
          {cohort !== null && roster.length > 0 && filtered.length === 0 && (
            <div style={{textAlign:"center", padding:"48px 0", color:"var(--ink-700)"}}>
              Nobody in this faculty yet this cohort.
              <div style={{marginTop:14}}>
                <button className="btn btn-ghost btn-sm" onClick={() => setTrack("all")}>Show all faculties</button>
              </div>
            </div>
          )}
          <div className="roster-grid">
            {filtered.map((m, i) => {
              // Named and pictured only where the backend said so; everyone
              // else keeps the handle and the initial tile they already have
              // on /s-status. The card must not invent a face.
              const shown = m.name || ("@" + m.handle);
              return (
              <div key={m.handle} className="member-card reveal" data-reveal style={{"--reveal-delay": (i * 50) + "ms"}} onClick={() => setPage("profile")}>
                <div style={{position:"relative", borderRadius:14, overflow:"hidden", aspectRatio:"1/1", background: m.color || "var(--navy-900)", display:"grid", placeItems:"center"}}>
                  {m.photo
                    ? <img src={m.photo} alt="" loading="lazy" style={{position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover"}} onError={e => { e.target.style.display = "none"; }}/>
                    : <span style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize:52, color:"rgba(255,255,255,0.9)"}}>{(shown.replace("@","")[0] || "?").toUpperCase()}</span>}
                  <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(12,20,50,0) 40%, rgba(12,20,50,0.55) 100%)"}}/>
                  {m.faculty && <div style={{position:"absolute", top:10, left:10}}>
                    <span className="chip chip-on-dark" style={{background:"rgba(12,20,50,0.55)", color:"white"}}>{m.faculty}</span>
                  </div>}
                  <div style={{position:"absolute", bottom:10, right:10, fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:"0.15em", color:"rgba(255,255,255,0.95)", background:"rgba(12,20,50,0.6)", padding:"3px 8px", borderRadius:4}}>
                    ★ {m.stars || 0}
                  </div>
                </div>
                <div style={{minWidth:0}}>
                  {/* A generated handle can be forty characters long. It gets
                      ONE line and an ellipsis, with the whole thing on hover —
                      a name is an identifier here, not the content, and
                      letting it set the card's width is what made four
                      identical cards come out four different sizes. */}
                  <div title={shown} style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:20, letterSpacing:"-0.02em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{shown}</div>
                  <div style={{fontSize:12, color:"var(--coral)", fontWeight:600, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{m.faculty || "Summer student"}</div>
                </div>
                {/* Stars, relative to the busiest star-earner in the cohort —
                    a bar against a fixed target would read as failure for
                    everyone in a programme that has only just started. */}
                <Progress value={Math.min(100, ((m.stars || 0) / maxStars) * 100)} label={(m.stars || 0) + " star" + ((m.stars || 0) === 1 ? "" : "s") + " earned"} variant="gold" />
                <div className="member-card-foot" style={{display:"flex", justifyContent:"space-between", gap:8, fontSize:11, color:"var(--ink-500)", fontFamily:"var(--font-mono)"}}>
                  <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{(m.centre || "NO CENTRE").toUpperCase()}</span>
                  <span style={{flex:"none"}}>{m.attendance || 0}% ATTENDANCE</span>
                </div>
              </div>
            );})}
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
  /* The live cohort leaderboard.
   *
   * There used to be a fallback to the twelve invented members in data.js
   * whenever the API returned fewer than three rows — so a real programme
   * with two members showed twelve strangers, and nothing said which was
   * which. An empty board is information; a fabricated one is not.
   *
   * Stars come through alongside XP rather than folded into it. They measure
   * different things — XP accrues from journal activity, stars are what a
   * mentor recorded in the room — and a single blended number would hide
   * which of the two a child is actually moving. */
  const [live, setLive] = useState(null);   // null = still loading
  useEffect(() => {
    let alive = true;
    NGGApi.public.leaderboard(24).then(r => {
      if (!alive) return;
      setLive(((r && r.leaderboard) || []).map(m => ({
        id: m.memberId, first: m.first + (m.initial ? " " + m.initial : ""), community: m.centre || "NGG",
        title: "Level " + m.level, xp: m.xp, level: m.level, streak: m.streak || 0, week: m.week || 1,
        stars: m.stars || 0, starsThisWeek: m.starsThisWeek || 0,
        quote: "Showing up, leveling up.",
      })));
    }).catch(() => { if (alive) setLive([]); });
    return () => { alive = false; };
  }, []);
  const roster = live || [];
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
              {/* Guarded: with the demo fallback gone the roster can genuinely
                  be empty, and this used to dereference top[0] unconditionally
                  — an empty cohort would have taken the whole page down. */}
              <div className="card-dark" style={{background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)"}}>
                <div className="eyebrow" style={{color:"var(--gold-400)"}}>GENIUS OF THE WEEK</div>
                {featured ? (<>
                  <div style={{display:"flex", alignItems:"center", gap:14, marginTop:14}}>
                    <Avatar seed={featured.id} name={featured.first} size={64} ring/>
                    <div>
                      <div style={{fontSize:22, fontWeight:700, fontFamily:"var(--font-display)"}}>{featured.first} · {featured.community}</div>
                      <div style={{fontSize:13, color:"var(--gold-400)", marginTop:2}}>{featured.title}</div>
                      <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:4}}>
                        LVL {featured.level} · {featured.xp.toLocaleString()} XP · ★ {featured.stars} · {featured.streak}-day streak
                      </div>
                    </div>
                  </div>
                  <p style={{fontSize:14, marginTop:14, fontStyle:"italic", color:"rgba(255,255,255,0.85)", borderLeft:"2px solid var(--gold-500)", paddingLeft:12, marginBottom:0}}>
                    "{featured.quote}"
                  </p>
                </>) : (
                  <p style={{fontSize:14, marginTop:14, color:"rgba(255,255,255,0.7)", marginBottom:0}}>
                    {live === null ? "Loading the cohort…" : "No Club members yet. This fills in as the first cohort is enrolled."}
                  </p>
                )}
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
                  <span className="eyebrow" style={{color:"var(--gold-500)"}}>MEMBER DIRECTORY · {roster.length}</span>
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
                {/* "126 / 164 completed", under a live dot, on a block headed
                    LIVE COHORT MISSION — both numbers were hardcoded. Claiming
                    live progress that nobody is counting is worse than showing
                    none, so the mission stands on its own until there is a real
                    completion figure behind it. */}
                <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:14}}>
                  This week's mission · ends Sunday
                </div>
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
                {/* This said "Earned by 58%". That number was a hash of the
                    badge's id — a made-up statistic, stable but invented,
                    printed on a public page as fact. There is no real earn
                    rate to show yet, so it shows none. */}
                <div className="mono" style={{fontSize:10, color:"var(--ink-500)", letterSpacing:"0.12em", textTransform:"uppercase"}}>
                  {b.locked ? "LOCKED" : "UNLOCKED"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// REMOVED: badgeEarnRate() hashed a badge id into a 20–80% "earn rate" and
// the badge wall printed it as a statistic. Stable is not the same as true.
// Kept here only as a marker so nobody reintroduces it.
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

/* ================================================================
   Community 2.0 — a social feed organised into channels (summer
   academy courses + the Commons). Members-only + AI-moderated for
   safeguarding; signed-out visitors get a teaser.
   ================================================================ */

// Cloudinary optimized delivery: auto format/quality + width cap.
function cmOpt(url, w) {
  if (!url || !/res\.cloudinary\.com/.test(url) || url.indexOf("/upload/") < 0) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto" + (w ? ",w_" + w + ",c_limit" : "") + "/");
}
function cmPoster(url) {
  if (!url || !/res\.cloudinary\.com/.test(url) || url.indexOf("/upload/") < 0) return "";
  return url.replace("/upload/", "/upload/so_0,f_jpg,q_auto,w_900,c_limit/").replace(/\.(mp4|mov|webm|m4v|avi)(\?.*)?$/i, ".jpg");
}
function cmAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? "" : "Z")).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return Math.floor(s / 604800) + "w";
}
// Whitespace-split tokens → linkify URLs, highlight @mentions + #tags.
function cmEntities(text, kp) {
  const out = [];
  String(text).split(/(\s+)/).forEach((p, i) => {
    if (/^https?:\/\/\S+$/.test(p)) out.push(<a key={kp + "u" + i} href={p} target="_blank" rel="noopener noreferrer" className="cm-link">{p.replace(/^https?:\/\//, "")}</a>);
    else if (/^@[\w.-]+$/.test(p)) out.push(<a key={kp + "m" + i} href={"/s/" + p.slice(1).toLowerCase()} className="cm-mention">{p}</a>);
    else if (/^#[\w]+$/.test(p)) out.push(<b key={kp + "t" + i} className="cm-tag">{p}</b>);
    else if (p) out.push(<React.Fragment key={kp + "x" + i}>{p}</React.Fragment>);
  });
  return out;
}
// One line → Slack-style inline formatting (`code`, *bold*, _italic_, ~strike~)
// wrapped around the entity pass. Code spans win first so their contents stay literal.
function cmInline(line, kp) {
  const out = []; let last = 0, idx = 0, m;
  const re = /`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(...cmEntities(line.slice(last, m.index), kp + "e" + (idx++)));
    if (m[1] != null) out.push(<code key={kp + "c" + (idx++)} className="cm-code">{m[1]}</code>);
    else if (m[2] != null) out.push(<b key={kp + "b" + (idx++)}>{cmEntities(m[2], kp + "bb" + idx)}</b>);
    else if (m[3] != null) out.push(<em key={kp + "i" + (idx++)}>{cmEntities(m[3], kp + "ii" + idx)}</em>);
    else out.push(<s key={kp + "s" + (idx++)}>{cmEntities(m[4], kp + "ss" + idx)}</s>);
    last = re.lastIndex;
  }
  if (last < line.length) out.push(...cmEntities(line.slice(last), kp + "e" + (idx++)));
  return out;
}
// Body → nodes: preserve line breaks + inline formatting + entities.
function cmBody(text) {
  const out = []; const lines = String(text || "").split("\n");
  lines.forEach((line, li) => {
    out.push(...cmInline(line, "l" + li + "-"));
    if (li < lines.length - 1) out.push(<br key={"br" + li}/>);
  });
  return out;
}
function cmInitial(name) { return (String(name || "•").trim()[0] || "•").toUpperCase(); }
/* Avatar colour is STABLE and, for two roles, MEANINGFUL.
 *
 * A mentor is green and you are purple, everywhere, every time; everybody else
 * cycles through the remaining four. That is the design bundle's rule and it is
 * doing real work in a space read by children: "is a mentor in this thread" is
 * a question the colour answers before any label is read, and a hue that
 * changes between the feed and the channel answers it wrongly. The hash keeps
 * the other four stable per person for the same reason — a face you recognise
 * is worth more than an even spread of colours. */
const CM_AVATAR_CYCLE = ["#17a2b8", "#f5b026", "#b07cff", "#3b5bdb"];
function cmColor(seed, role) {
  if (role === "mentor") return "#2f9e44";
  if (role === "you") return "#b07cff";
  let h = 0;
  for (const c of String(seed || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CM_AVATAR_CYCLE[h % CM_AVATAR_CYCLE.length];
}
/** The role an author's colour should carry, from a shaped post's author. */
function cmRoleOf(post) {
  if (!post || !post.author) return "";
  if (post.author.isMe) return "you";
  return post.canStar ? "mentor" : "";
}
// A member's avatar — their profile photo when we have one, else a colour + initial.
function cmAvatar(name, seed, photo, extraClass, role) {
  const cls = "cm-avatar" + (extraClass ? " " + extraClass : "");
  if (photo) return <span className={cls + " cm-avatar-photo"} aria-hidden="true"><img src={cmOpt(photo, 96)} alt="" loading="lazy"/></span>;
  const bg = cmColor(seed, role);
  return <span className={cls} style={{ background: bg, color: inkOn(bg).ink }} aria-hidden="true">{cmInitial(name)}</span>;
}

function CommunityPage({ setPage }) {
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  if (!auth.isSignedIn) return <CommunityPublic setPage={setPage} auth={auth}/>;
  return <CommunityApp setPage={setPage} auth={auth}/>;
}

/* ---- Student ID sign-in panel (ID + guardian phone, or QR scan) ---- */
function CmStudentSignIn({ compact, dest, roles }) {
  const [sid, setSid] = React.useState("");
  const [phone, setPhone] = React.useState("");
  // Instructors, mentors and coordinators hold a card too, and theirs carries
  // their own number rather than a guardian's — which is exactly why the
  // guardian-phone check could never match one of them.
  /* `roles` lets a host page narrow the door. The Mentor Portal has no
     students behind it, and offering "I'm a student" there is an invitation to
     fail. */
  const doors = (roles && roles.length ? roles : ["student", "instructor"]);
  const [who, setWho] = React.useState(doors[0]);   // student | instructor
  const [remember, setRemember] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [scan, setScan] = React.useState(false);
  const doLogin = async (creds, failMsg) => {
    setBusy(true); setErr("");
    try {
      await NGGApi.auth.studentLogin({ ...creds, remember });
      /* A full reload rather than a state update: the session cookie is what
         changed, and every provider on the page reads it at boot. `dest` is
         why a mentor signing in at /mentor now lands back on /mentor — the
         door always sent everyone to /community, which is where a mentor who
         did find it ended up instead of the portal they were trying to open. */
      window.location.href = dest || "/community";
    } catch (e) {
      // A suspension is a ban from the premises *and* the digital channels, so
      // the door is genuinely shut — say which, rather than "check your card".
      if (e.code === "policy_suspended" || e.code === "policy_evicted") {
        setErr((e.data && e.data.message) || (e.code === "policy_evicted"
          ? "This ID has been evicted from the programme. Speak to the coordinator."
          : "This ID is suspended — access to the digital channels is paused."));
      } else {
        setErr(e.code === "rate_limited" ? "Too many tries — wait a few minutes." : failMsg);
      }
      setBusy(false);
    }
  };
  const isVol = who === "instructor";
  const studentLogin = () => {
    if (!sid.trim() || phone.replace(/\D/g, "").length < 7) {
      setErr(isVol ? "Enter the ID on your card and your own phone number." : "Enter your student ID and your parent/guardian's phone number.");
      return;
    }
    doLogin({ displayId: sid.trim(), guardianPhone: phone.trim() },
      isVol ? "We couldn't match that ID and phone number. Use the ID printed on your card (e.g. VOL-INS-26-001) and the number we have on file."
            : "We couldn't match that ID and phone number. Check your ID card.");
  };
  const openScan = () => {
    setErr("");
    if (typeof window.jsQR === "function") { setScan(true); return; }
    let sc = document.getElementById("ngg-jsqr");
    if (!sc) { sc = document.createElement("script"); sc.id = "ngg-jsqr"; sc.src = "/vendor/jsQR.min.js"; document.head.appendChild(sc); }
    sc.addEventListener("load", () => setScan(true), { once: true });
    setScan(true);
  };
  const onScanToken = (token) => { if (busy) return; doLogin({ token }, "That card didn't match. Try again or type your ID below."); };
  return (
    <div className="cm-stu-signin">
      <div className="mono cm-stu-title">SIGN IN WITH YOUR ID CARD</div>
      {/* One door needs no chooser. `hidden` alone loses to the class's own
          display rule, so the style has to say it too. */}
      <div className="cm-stu-who" role="tablist" aria-label="Who is signing in"
        hidden={doors.length < 2} style={doors.length < 2 ? { display: "none" } : undefined}>
        {/* "I'm an instructor" is who the card door was labelled for, and it
            reads as excluding the mentors and coordinators who hold exactly
            the same Vanguard card — part of why summer volunteers thought
            this door was not for them. */}
        {doors.map(k => [k, k === "student" ? "I'm a student" : "I'm a volunteer"]).map(([k, lbl]) => (
          <button key={k} role="tab" aria-selected={who === k} className={"cm-stu-who-btn" + (who === k ? " is-on" : "")}
            onClick={() => { setWho(k); setErr(""); }}>{lbl}</button>
        ))}
      </div>
      <p className="cm-stu-hint">
        Scan your card's QR with the camera — or enter the ID on your card and {isVol ? "your own phone number" : "your parent/guardian's phone number"}.
      </p>
      {scan ? (
        <>
          <div className="cm-scan-box">
            {typeof QRScanner === "function" ? <QRScanner onToken={onScanToken} gold="#ffce54"/> : <div style={{ padding: 24, color: "rgba(255,255,255,.7)", fontSize: 13, textAlign: "center" }}>Loading scanner…</div>}
            <div className="cm-scan-frame" aria-hidden="true"/>
          </div>
          <div className="cm-scan-hint">Hold your {isVol ? "Vanguard" : "Genius"} ID up to the camera. {busy && "Signing you in…"}</div>
          <button className="cm-scan-btn" onClick={() => setScan(false)}>⌨ Type my ID instead</button>
        </>
      ) : (
        <>
          <button className="cm-scan-btn" onClick={openScan}>📷 Scan my card</button>
          <div className="cm-stu-row" style={{ marginTop: 12 }}>
            <input className="cm-stu-input" value={sid} onChange={e => setSid(e.target.value)} placeholder={isVol ? "Card ID (e.g. VOL-INS-26-001)" : "Student ID (e.g. AY-26-001)"} autoCapitalize="characters" aria-label={isVol ? "Card ID" : "Student ID"}/>
            <input className="cm-stu-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder={isVol ? "Your phone" : "Guardian phone"} inputMode="tel" aria-label={isVol ? "Your phone number" : "Guardian phone number"}/>
            <button className="btn btn-gold" disabled={busy} onClick={studentLogin}>{busy ? "…" : "Enter →"}</button>
          </div>
        </>
      )}
      <label className="cm-stu-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/><span>Stay signed in for 30 days</span></label>
      {err && <div className="cm-stu-err">{err}</div>}
    </div>
  );
}

/* ---- Signed-out / public community: the movement at a glance (real, PII-safe
   data) + a sign-in door. The interactive channels live behind ID sign-in. ---- */
function CommunityPublic({ setPage, auth }) {
  const [members, setMembers] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [showcase, setShowcase] = React.useState([]);
  const [view, setView] = React.useState("members");   // members | centres | leaders
  const [q, setQ] = React.useState("");
  const [centre, setCentre] = React.useState("All");
  const [panel, setPanel] = React.useState(null);
  const [stu, setStu] = React.useState(false);
  const [err, setErr] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    NGGApi.public.leaderboard(60).then(r => { if (alive) setMembers(r.leaderboard || []); }).catch(() => { if (alive) setErr(true); });
    NGGApi.public.stats().then(r => { if (alive) setStats(r.stats || {}); }).catch(() => {});
    NGGApi.public.communityShowcase().then(r => { if (alive) setShowcase(r.showcase || []); }).catch(() => {});
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
    (!ql || nameOf(m).toLowerCase().includes(ql) || (m.centre || "").toLowerCase().includes(ql)));
  const leaders = [...all].sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 8);

  const kpis = [
    // Members + the card-holders (students, instructors) who have signed in.
    // The old count read the members table alone, so every summer student and
    // every instructor in the community was invisible to it.
    { value: stats && stats.communityMembers > 0 ? stats.communityMembers.toLocaleString()
        : (stats && stats.activeMembers > 0 ? stats.activeMembers.toLocaleString() : (all.length ? String(all.length) : "—")),
      label: "In the community", color: "#fff",
      note: stats && (stats.communityStudents || stats.communityInstructors)
        ? [stats.communityStudents ? stats.communityStudents + " students" : "", stats.communityInstructors ? stats.communityInstructors + " instructors" : ""].filter(Boolean).join(" · ")
        : "" },
    { value: stats && stats.missionsVerified > 0 ? stats.missionsVerified.toLocaleString() : "—", label: "Missions verified", color: "#fff" },
    { value: stats && stats.mentors > 0 ? String(stats.mentors) : "—", label: "Volunteer mentors", color: "#d0ff3a" },
    { value: stats && stats.centres > 0 ? String(stats.centres).padStart(2, "0") : (centres.length ? String(centres.length).padStart(2, "0") : "—"), label: "Centres live", color: "#f5b026" },
  ];
  const tabBtn = (k, label, icon) => (
    <button key={k} onClick={() => { setView(k); setPanel(null); }}
      style={{ fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, padding: "12px 6px", border: "none", background: "none", cursor: "pointer", borderBottom: "2.5px solid " + (view === k ? "var(--gold-500)" : "transparent"), color: view === k ? "#fff" : "rgba(255,255,255,0.55)", display: "inline-flex", alignItems: "center", gap: 7 }}>
      <i className={"ph " + icon}/>{label}
    </button>
  );

  return (
    <div className="page cm-page" data-screen-label="Community">
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
          {/* The Arcade is named here on purpose. It lives behind the sign-in,
              which means nobody discovers it by browsing — the same way the
              mentor platform went unfound until it was pointed at. */}
          <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 15, maxWidth: 560, margin: "0 0 20px" }}>Every centre, every track, one movement. The live chat, channels, showcase and the <b style={{ color: "#fff" }}>🎮 Arcade</b> — daily brain games with their own leaderboard — are a private, members-only space. Sign in to join.</p>

          <div className="cm-pub-doors">
            <button className="btn btn-gold btn-lg" onClick={() => auth.openSignIn && auth.openSignIn()}>Sign in to join →</button>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setStu(s => !s)}>I'm a summer student</button>
          </div>
          {stu && <CmStudentSignIn/>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginTop: 22, borderTop: "1px solid rgba(255,255,255,0.12)" }} className="home-kpi-strip">
            {kpis.map((k, i) => (
              <div key={i} style={{ borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.14)", padding: "20px 0 20px " + (i === 0 ? "0" : "16px") }}>
                <div className="display" style={{ fontWeight: 800, fontSize: "clamp(24px,3.2vw,32px)", color: k.color, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginTop: 6 }}>{k.label}</div>
                {k.note && <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", marginTop: 3 }}>{k.note}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            {tabBtn("members", "Members", "ph-users-three")}
            {tabBtn("centres", "Centres", "ph-buildings")}
            {tabBtn("leaders", "Leaderboard", "ph-trophy")}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 32 }}>
        <div className="container" style={{ maxWidth: 1320 }}>
          {err ? <div style={{ textAlign: "center", padding: 40, color: "var(--ink-500)" }}>Couldn't load the community right now — try again shortly.</div>
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
                    <span className="display" style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15, color: inkOn(colorFor(m.first)).ink, background: colorFor(m.first), flex: "none" }}>{(m.first[0] || "?").toUpperCase()}</span>
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
                <select value={centre} onChange={e => setCentre(e.target.value)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--cream-200,#d9d2c0)", background: "#fff", cursor: "pointer" }}>
                  {centreOpts.map(c => <option key={c} value={c}>{c === "All" ? "All centres" : c}</option>)}
                </select>
              </div>
              {filtered.length === 0 ? <div style={{ border: "1px dashed var(--cream-200,#d9d2c0)", borderRadius: 16, padding: 32, textAlign: "center", color: "var(--ink-400)" }}>No members match.</div> :
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
                {filtered.map((m, i) => (
                  <button key={m.memberId || i} onClick={() => setPanel(m)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: "#fff", border: "1px solid var(--line-cool,#e5e8ee)", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="display" style={{ width: 44, height: 44, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16, color: inkOn(colorFor(m.first)).ink, background: colorFor(m.first) }}>{(m.first[0] || "?").toUpperCase()}</span>
                    <span style={{ minWidth: 0 }}>
                      <b className="display" style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink-900)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(m)}</b>
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-400)" }}>{m.centre || "—"} · LVL {m.level}</span>
                    </span>
                  </button>
                ))}
              </div>}
            </>
          )}

          {showcase.length > 0 && (
            <div style={{ marginTop: 44 }}>
              <div className="mono cm-showcase-eyebrow">✨ FROM THE SHOWCASE</div>
              <h2 className="display cm-showcase-h">What the crew is making</h2>
              <p className="cm-showcase-sub">A handful of mentor-picked highlights from inside the members-only community.</p>
              <div className="cm-showcase-grid">
                {showcase.map(s => (
                  <figure key={s.postId} className="cm-show-card">
                    {s.mediaType === "image" && s.mediaUrl && <img src={cmOpt(s.mediaUrl, 700)} alt={s.altText || ""} loading="lazy"/>}
                    {s.mediaType === "video" && (s.mediaPoster || s.mediaUrl) && <div className="cm-show-video"><img src={s.mediaPoster || cmPoster(s.mediaUrl)} alt=""/><span className="cm-show-play">▶</span></div>}
                    <figcaption>
                      <span className="cm-show-chan" style={{ color: s.channel.color }}>{s.channel.icon} {s.channel.name}</span>
                      {s.body && <p className="cm-show-body">{s.body.length > 140 ? s.body.slice(0, 140) + "…" : s.body}</p>}
                      <span className="cm-show-author">— {s.author}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {panel && (<>
        <div onClick={() => setPanel(null)} style={{ position: "fixed", inset: 0, background: "rgba(12,20,50,0.45)", zIndex: 50, animation: "ngg-fade .2s ease" }}/>
        <div style={{ position: "fixed", top: 0, right: 0, height: "100%", width: 360, maxWidth: "92vw", background: "#fff", zIndex: 51, boxShadow: "-16px 0 40px rgba(12,20,50,0.25)", animation: "ngg-panel-in .25s cubic-bezier(.2,.8,.2,1)", overflowY: "auto" }}>
          <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "flex-end" }}><button onClick={() => setPanel(null)} style={{ border: "none", background: "var(--cream-100,#f3ecdb)", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 16, color: "var(--ink-500)" }}><i className="ph ph-x"/></button></div>
          <div style={{ padding: "8px 28px 28px", textAlign: "center" }}>
            <span className="display" style={{ width: 84, height: 84, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 30, color: inkOn(colorFor(panel.first)).ink, background: colorFor(panel.first), margin: "0 auto" }}>{(panel.first[0] || "?").toUpperCase()}</span>
            <h3 className="display" style={{ fontWeight: 800, fontSize: 20, margin: "14px 0 3px" }}>{nameOf(panel)}</h3>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>{panel.centre || "—"} · Level {panel.level}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "16px 0" }}>
              <span className="mono" style={{ fontSize: 11.5, background: "var(--cream-50,#faf6ec)", border: "1px solid var(--cream-200,#e8dec6)", borderRadius: 999, padding: "5px 12px" }}>{(panel.xp || 0).toLocaleString()} XP</span>
              <span className="mono" style={{ fontSize: 11.5, background: "var(--cream-50,#faf6ec)", border: "1px solid var(--cream-200,#e8dec6)", borderRadius: 999, padding: "5px 12px" }}>{panel.streak || 0}d streak</span>
              <span className="mono" style={{ fontSize: 11.5, background: "var(--cream-50,#faf6ec)", border: "1px solid var(--cream-200,#e8dec6)", borderRadius: 999, padding: "5px 12px" }}>Wk {panel.week || 1}</span>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 6 }} onClick={() => auth.openSignIn && auth.openSignIn()}>Sign in to connect →</button>
          </div>
        </div>
      </>)}
    </div>
  );
}

/* ---- The workspace (Slack-style) ----
   Sidebar of channels with unread badges + search · a channel header with the
   topic · a chronological message stream (oldest→newest) grouped by author
   with a hover toolbar · a composer docked at the bottom (Enter to send) ·
   threads in a right-hand pane · mark-as-read on view. */
/* ══════════════════════════════════════════════════════════════════════════
   THE COMMUNITY, MOBILE-FIRST
   ══════════════════════════════════════════════════════════════════════════

   The community was a desktop workspace — sidebar, stream, members rail — and
   it is read on a phone. Not "also on a phone": the members are teenagers at
   two Nigerian centres, and the phone IS the product. A three-column layout
   folded into one column is not a mobile design, it is a desktop design that
   has run out of room, and it shows in every place where the phone version has
   a scrollbar the desktop version does not.

   So this is the phone build, to the design bundle's spec, and the workspace
   above stays as the DESKTOP build — which the bundle also specifies (3A) and
   which the mentors and admins who run the programme from a laptop still need.
   One breakpoint decides which mounts, at the bundle's own 1024px.

   Four destinations in the tab bar — Today, Channels, Arcade, Journal — and
   nothing else. Everything not in the bar is reachable from the avatar (the
   account surfaces), the bell (notifications) or search. Nothing is
   browse-only; that rule is what keeps a four-item bar honest instead of
   hiding a fifth destination nobody can find.

   Two rules run through all of it, and both are testable:
     · Every tappable row clears 44px, primary CTAs 52px, tab items 56px.
     · Nothing auto-scrolls. New messages offer a pill; the reader decides.
   ═════════════════════════════════════════════════════════════════════════ */

/* ── Icons ────────────────────────────────────────────────────────────────
   Stroked, 24px grid, 1.8–2.4px weight, per the bundle. Inline SVG rather
   than the emoji the old build used in navigation: an emoji renders as a
   different picture on every phone in the centre, and it cannot take the
   active colour that tells you which tab you are on. */
function cmTabIcon(name) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const wrap = (d) => <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;
  if (name === "today")    return wrap(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...P}/>);
  if (name === "channels") return wrap(<><path d="M4 6h16M4 12h16M4 18h10" {...P}/></>);
  if (name === "arcade")   return wrap(<><rect x="2.5" y="7" width="19" height="11" rx="4" {...P}/><path d="M7 12.5h3M8.5 11v3M15.5 11.5h.01M17.5 13.5h.01" {...P}/></>);
  if (name === "journal")  return wrap(<><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" {...P}/><path d="M5 17a3 3 0 0 1 3-3h11" {...P}/></>);
  return null;
}
function cmUiIcon(name, size) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  const s = size || 20;
  const wrap = (d) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;
  if (name === "search") return wrap(<><circle cx="11" cy="11" r="7" {...P}/><path d="m20 20-3.5-3.5" {...P}/></>);
  if (name === "bell")   return wrap(<path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3z" {...P}/>);
  if (name === "plus")   return wrap(<path d="M12 5v14M5 12h14" {...P}/>);
  if (name === "back")   return wrap(<path d="m14 6-6 6 6 6" {...P}/>);
  if (name === "down")   return wrap(<path d="M12 5v14M6 13l6 6 6-6" {...P}/>);
  if (name === "chev")   return wrap(<path d="m9 6 6 6-6 6" {...P}/>);
  return null;
}

/* ── Small shared pieces ───────────────────────────────────────────────── */

/** A bottom sheet. Scrim closes it; Escape closes it; focus goes inside. */
function CmSheet({ title, onClose, children, labelledBy }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Move focus into the sheet so a keyboard or screen-reader user is not
    // left behind on the page underneath, still able to tab through it.
    const t = setTimeout(() => { const el = ref.current; if (el) el.focus(); }, 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="cmm-scrim" onClick={onClose}>
      <div className="cmm-sheet" role="dialog" aria-modal="true"
           aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy}
           tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <span className="cmm-grab" aria-hidden="true"/>
        {title && <h2 className="cmm-sheet-h">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** A horizontal chip row. Bleeds to the screen edge and never wraps. */
function CmChips({ items, value, onPick, label }) {
  return (
    <div className="cmm-chips" role="tablist" aria-label={label}>
      {items.map(it => (
        <button key={it.id} role="tab" aria-selected={value === it.id}
                className={"cmm-chip" + (value === it.id ? " is-on" : "")}
                onClick={() => onPick(it.id)}>
          {it.label}
          {it.count > 0 && <span className="cmm-chip-n">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The empty state. Never an empty list — a list with nothing in it looks
 *  broken, and the difference matters most on the filter a member chose. */
function CmEmpty({ icon, title, body, action }) {
  return (
    <div className="cmm-empty">
      <span className="cmm-empty-ic" aria-hidden="true">{icon}</span>
      <h3 className="cmm-empty-h">{title}</h3>
      {body && <p className="cmm-empty-p">{body}</p>}
      {action}
    </div>
  );
}

/** Loading. Card-shaped, because a spinner tells you nothing about what is
 *  coming and this feed is cards. */
function CmSkeleton({ rows }) {
  return (
    <div className="cmm-skel" aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows || 3 }).map((_, i) => (
        <div className="cmm-skel-card" key={i}>
          <div className="cmm-skel-head">
            <span className="cmm-skel-av"/>
            <span className="cmm-skel-lines">
              <span className="cmm-skel-line" style={{ width: "42%" }}/>
              <span className="cmm-skel-line" style={{ width: "28%" }}/>
            </span>
          </div>
          <span className="cmm-skel-line" style={{ width: "94%" }}/>
          <span className="cmm-skel-line" style={{ width: "78%" }}/>
        </div>
      ))}
    </div>
  );
}

/* ── Today ────────────────────────────────────────────────────────────────
   The daily landing screen: catch up, then act. Header, search, filter chips,
   feed. The filters are REAL — unread and mentions are server-side queries and
   the chip counts come from one endpoint that agrees with them, because a chip
   reading "Unread 4" over a filter that then shows six is the part of the
   screen a member uses to decide whether to look at all. */
function CmToday({ auth, counts, onCounts, onOpenAccount, onOpenThread, onCompose, onOpenChannel, offline }) {
  const [filter, setFilter] = React.useState("all");
  const [sheetFor, setSheetFor] = React.useState(null);
  const [posts, setPosts] = React.useState(null);
  const [err, setErr] = React.useState("");
  const mem = auth.member || {};

  const load = React.useCallback((f) => {
    setPosts(null); setErr("");
    const channel = f === "saved" ? "bookmarks" : f === "all" ? "all" : f;
    NGGApi.member.community.feed(channel, "latest", 0)
      .then(r => setPosts(r.posts || []))
      .catch(() => { setPosts([]); setErr("Couldn't load the feed. Pull down or try again."); });
  }, []);
  React.useEffect(() => { load(filter); }, [filter, load]);

  const patch = (postId, p) => setPosts(ps => (ps || []).map(x => x.postId === postId ? { ...x, ...p } : x));
  const remove = (postId) => setPosts(ps => (ps || []).filter(x => x.postId !== postId));

  const greeting = (() => {
    const h = new Date().getHours();
    const first = String(mem.fullName || "there").trim().split(/\s+/)[0];
    return (h < 12 ? "Good morning, " : h < 17 ? "Good afternoon, " : "Good evening, ") + first;
  })();

  const chips = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread", count: counts.unread },
    { id: "mentions", label: "Mentions", count: counts.mentions },
    { id: "saved", label: "Saved", count: 0 },
  ];

  return (
    <>
      <header className="cmm-head">
        <button className="cmm-av-btn" onClick={onOpenAccount} aria-label="Your account">
          {cmAvatar(mem.fullName || "You", mem.memberId || "you", mem.photoUrl, "cmm-av", "you")}
        </button>
        <div className="cmm-head-txt">
          <h1 className="cmm-greet">{greeting}</h1>
          <p className="cmm-sub">{[mem.centre, mem.track].filter(Boolean).join(" · ") || "Member"}</p>
        </div>
        <button className="cmm-icon-btn" onClick={() => setFilter("mentions")}
                aria-label={counts.mentions > 0 ? counts.mentions + " unread mentions" : "Mentions"}>
          {cmUiIcon("bell", 21)}
          {counts.mentions > 0 && <span className="cmm-badge">{counts.mentions > 99 ? "99+" : counts.mentions}</span>}
        </button>
      </header>

      <button className="cmm-search" onClick={onCompose.openJump}>
        {cmUiIcon("search", 18)}
        <span>Search messages, people, entries</span>
      </button>

      <CmChips items={chips} value={filter} onPick={setFilter} label="Filter the feed"/>

      {/* Offline is a real state, and it is hidden on Saved — saved items are
          already on this device, so an offline warning there is a lie. */}
      {offline && filter !== "saved" && (
        <div className="cmm-offline" role="status">
          You're offline. This is what was here when you last had signal.
        </div>
      )}

      <div className="cmm-feed">
        {posts === null && <CmSkeleton rows={3}/>}
        {err && posts && posts.length === 0 && (
          <CmEmpty icon="⚠" title="That didn't load" body={err}
                   action={<button className="cmm-cta" onClick={() => load(filter)}>Try again</button>}/>
        )}
        {posts && posts.length === 0 && !err && (
          filter === "saved"
            ? <CmEmpty icon="🔖" title="Nothing saved yet"
                       body="Long-press any message and choose Save to your list. It'll wait here for you."/>
            : filter === "unread"
              ? <CmEmpty icon="✓" title="You're all caught up" body="Nothing new since you last looked."/>
              : filter === "mentions"
                ? <CmEmpty icon="@" title="No mentions" body="When somebody tags you by name, it lands here."/>
                : <CmEmpty icon="✦" title="Nothing here yet"
                           body="Be the first to post something to your centre."
                           action={<button className="cmm-cta" onClick={onCompose.open}>Write a post</button>}/>
        )}
        {posts && posts.map(p => (
          <CmMobileMessage key={p.postId} post={p} me={mem.fullName} card showChannel
                           onPatch={patch} onRemove={remove} onOpenThread={onOpenThread}
                           onLongPress={() => setSheetFor(p)}/>
        ))}
      </div>

      {sheetFor && (
        <CmActionsSheetHost post={sheetFor} staff={!!sheetFor.canStar}
                            onClose={() => setSheetFor(null)}
                            onPatch={patch} onRemove={remove} onOpenThread={onOpenThread}/>
      )}
    </>
  );
}

/* ── Channels ─────────────────────────────────────────────────────────────
   Rows of at least 62px carrying an avatar, the name, a one-line preview and
   either an unread count or a relative time. Joined channels are separated
   from discoverable ones, because "which of these am I in" is the question
   this screen is actually asked. */
function CmChannels({ channels, onOpen, onCompose }) {
  const joined = channels.filter(c => !c.discover);
  const discover = channels.filter(c => c.discover);
  const Row = (c) => (
    <button key={c.slug} className="cmm-ch-row" onClick={() => onOpen(c.slug)}>
      <span className="cmm-ch-av" style={{ background: "var(--c-purple-tint)", color: "var(--c-purple)" }} aria-hidden="true">
        {c.icon || "#"}
      </span>
      <span className="cmm-ch-body">
        <span className="cmm-ch-name">{c.name}</span>
        <span className="cmm-ch-prev">{c.lastMessage || c.purpose || "No messages yet"}</span>
      </span>
      {c.unread > 0
        ? <span className="cmm-ch-badge">{c.unread > 99 ? "99+" : c.unread}</span>
        : <span className="cmm-ch-time">{c.lastAt ? cmAgo(c.lastAt) : ""}</span>}
    </button>
  );
  return (
    <>
      <header className="cmm-head cmm-head-plain">
        <div className="cmm-head-txt">
          <h1 className="cmm-h1">Channels</h1>
          <p className="cmm-sub">{joined.length} joined · {discover.length} to discover</p>
        </div>
      </header>
      <div className="cmm-list">
        {!channels.length && <CmSkeleton rows={4}/>}
        {joined.length > 0 && <div className="cmm-list-h">YOUR CHANNELS</div>}
        {joined.map(Row)}
        {discover.length > 0 && <div className="cmm-list-h">DISCOVER</div>}
        {discover.map(Row)}
      </div>
    </>
  );
}

/* ── Account ──────────────────────────────────────────────────────────────
   Reached by tapping the avatar on Today, NOT a fifth tab. Settings are a
   monthly task and the tab bar is for daily ones; giving this a permanent
   quarter of the bar would cost the community a destination that is used
   every day. */
function CmAccount({ auth, counts, onClose, onGo, setPage }) {
  const mem = auth.member || {};
  const stats = [
    { n: mem.stars != null ? mem.stars : "—", l: "Stars" },
    { n: mem.postCount != null ? mem.postCount : "—", l: "Posts" },
    { n: mem.streak != null ? mem.streak : "—", l: "Streak" },
  ];
  const Row = ({ label, sub, badge, onClick, danger }) => (
    <button className={"cmm-acc-row" + (danger ? " is-danger" : "")} onClick={onClick}>
      <span className="cmm-acc-label">{label}{sub && <span className="cmm-acc-sub">{sub}</span>}</span>
      {badge > 0 && <span className="cmm-ch-badge">{badge}</span>}
      <span className="cmm-acc-chev" aria-hidden="true">{cmUiIcon("chev", 16)}</span>
    </button>
  );
  return (
    <div className="cmm-screen cmm-account" role="region" aria-label="Your account">
      <header className="cmm-head cmm-head-back">
        <button className="cmm-icon-btn" onClick={onClose} aria-label="Back">{cmUiIcon("back", 22)}</button>
        <h1 className="cmm-h1">You</h1>
      </header>
      <div className="cmm-acc-id">
        {cmAvatar(mem.fullName || "You", mem.memberId || "you", mem.photoUrl, "cmm-av-lg", "you")}
        <div className="cmm-acc-name">{mem.fullName || "Member"}</div>
        <div className="cmm-sub">
          {[mem.centre, mem.track].filter(Boolean).join(" · ") || "Member"}
          {mem.joinedAt ? " · joined " + pjDate(mem.joinedAt) : ""}
        </div>
      </div>
      <div className="cmm-acc-stats">
        {stats.map(s => (
          <div className="cmm-acc-stat" key={s.l}>
            <div className="cmm-acc-n">{s.n}</div>
            <div className="cmm-acc-l">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="cmm-acc-group">
        <Row label="Saved items" badge={counts.saved} onClick={() => onGo("saved")}/>
        <Row label="Your posts & replies" onClick={() => onGo("mine")}/>
        <Row label="Play a friend" onClick={() => onGo("matches")}/>
        <Row label="Mentors & members" onClick={() => onGo("people")}/>
      </div>
      <div className="cmm-acc-group">
        <Row label="Notifications" onClick={() => setPage("dashboard")}/>
        <Row label="Switch centre" sub={mem.centre || ""} onClick={() => setPage("dashboard")}/>
        <Row label="Accessibility & text size" onClick={() => setPage("dashboard")}/>
        <Row label="Help" onClick={() => setPage("contact")}/>
      </div>
      <button className="cmm-signout" onClick={() => auth.signOut && auth.signOut()}>Sign out</button>
    </div>
  );
}

/* ── Message actions sheet ────────────────────────────────────────────────
   THE core information-hierarchy decision of the redesign. Two actions stay on
   the card — React, and N replies — and the other seven live here, behind a
   long-press. A message card carrying nine controls is a card nobody reads;
   these seven are each used occasionally by someone who already knows they
   want them, which is exactly what a long-press is for.

   Long-press, not a "…" button: the button would be a tenth control on the
   card, which is the problem it was meant to solve. */
function CmActionsSheet({ post, act, staff, onClose, onOpenThread, onJournal }) {
  const REACTIONS = ["👏", "🔥", "💡", "❤️", "😂"];
  const Row = ({ label, sub, chip, onClick, danger, top }) => (
    <button className={"cmm-act-row" + (danger ? " is-danger" : "") + (top ? " has-rule" : "")}
            onClick={() => { onClick(); onClose(); }}>
      <span className="cmm-act-label">{label}</span>
      {sub && <span className="cmm-act-sub">{sub}</span>}
      {chip && <span className="cmm-act-chip">{chip}</span>}
    </button>
  );
  return (
    <CmSheet title={null} onClose={onClose} labelledBy="cmm-act-h">
      <h2 className="sr-only" id="cmm-act-h">Actions for this message</h2>
      <div className="cmm-act-emoji" role="group" aria-label="React">
        {REACTIONS.map(e => (
          <button key={e} className="cmm-act-em" onClick={() => { act.react(e); onClose(); }}
                  aria-label={"React with " + e}>{e}</button>
        ))}
      </div>
      <Row label="Reply in thread" onClick={() => onOpenThread(post)}/>
      {staff && <Row label="Give a Genius Star" sub={post.starred ? "Given" : ""} onClick={act.star}/>}
      <Row label={post.bookmarked ? "Remove from your list" : "Save to your list"} onClick={act.bookmark}/>
      {staff && onJournal && <Row label="Record in the journal" chip="mentors" onClick={() => onJournal(post)}/>}
      <Row label="Copy link" onClick={() => {
        const url = location.origin + "/community?post=" + post.postId;
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast.ok("Link copied.")).catch(() => {});
      }}/>
      <Row label="Report to a mentor" danger top onClick={() => act.report()}/>
    </CmSheet>
  );
}

/* ── Jump-to sheet ────────────────────────────────────────────────────────
   The mobile equivalent of the desktop command bar. Opened from the search
   field, because that is where somebody already goes to look for something —
   a second entry point for "find" would split the habit. */
function CmJumpSheet({ channels, onClose, onOpenChannel, onCompose }) {
  const [q, setQ] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [hits, setHits] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);
  React.useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(t); }, []);
  React.useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setHits(null); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      NGGApi.member.community.search(s, "all")
        .then(r => { setHits(r.posts || []); setBusy(false); })
        .catch(() => { setHits([]); setBusy(false); });
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const chanHits = q.trim().length >= 1
    ? channels.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4) : [];
  // A slash command is an ACTION, not a search term — surfaced as one.
  const actions = q.startsWith("/")
    ? [{ id: "homework", label: "/homework", sub: "Set homework for a channel" },
       { id: "poll", label: "/poll", sub: "Ask the channel a question" }]
        .filter(a => a.label.startsWith(q.trim()))
    : [];

  /* Highlight the matched substring. Finding your search term in a wall of
     grey text is the difference between a result list and a wall of text. */
  const mark = (text) => {
    const s = q.trim(); if (!s) return text;
    const i = String(text).toLowerCase().indexOf(s.toLowerCase());
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark className="cmm-mark">{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>;
  };

  return (
    <CmSheet title="Jump to" onClose={onClose}>
      <div className="cmm-jump-field">
        {cmUiIcon("search", 18)}
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
               placeholder="Messages, people, entries — or / for a command"
               aria-label="Search the community"/>
      </div>
      <CmChips label="Narrow the search" value={scope} onPick={setScope}
               items={[{ id: "all", label: "All" }, { id: "messages", label: "Messages" },
                       { id: "people", label: "People" }, { id: "journal", label: "Journal" }]}/>
      <div className="cmm-jump-results">
        {actions.length > 0 && <div className="cmm-list-h">ACTIONS</div>}
        {actions.map(a => (
          <button key={a.id} className="cmm-jump-row" onClick={() => { onClose(); onCompose(a.id); }}>
            <span className="cmm-jump-mono">{a.label}</span>
            <span className="cmm-jump-sub">{a.sub}</span>
          </button>
        ))}
        {chanHits.length > 0 && <div className="cmm-list-h">CHANNELS</div>}
        {chanHits.map(c => (
          <button key={c.slug} className="cmm-jump-row" onClick={() => { onClose(); onOpenChannel(c.slug); }}>
            <span className="cmm-jump-name">{mark(c.name)}</span>
            <span className="cmm-jump-sub">{c.unread > 0 ? c.unread + " unread" : "Channel"}</span>
          </button>
        ))}
        {busy && <div className="cmm-jump-note">Searching…</div>}
        {hits && hits.length > 0 && <div className="cmm-list-h">MESSAGES</div>}
        {hits && hits.map(p => (
          <button key={p.postId} className="cmm-jump-row" onClick={() => { onClose(); onOpenChannel(p.channel.slug); }}>
            <span className="cmm-jump-name">{mark(String(p.body || "").slice(0, 90))}</span>
            <span className="cmm-jump-sub">{p.author.name} · {p.channel.name} · {cmAgo(p.createdAt)}</span>
          </button>
        ))}
        {hits && hits.length === 0 && !busy && q.trim().length >= 2 && (
          <div className="cmm-jump-note">Nothing matched “{q.trim()}”.</div>
        )}
      </div>
    </CmSheet>
  );
}

/* ── Channel ──────────────────────────────────────────────────────────────
   The full channel screen. Everything the desktop channel could do, in one
   column, with the two rules that matter on a phone held to: nothing
   auto-scrolls, and every action clears a thumb. */
function CmChannel({ slug, channels, auth, onBack, onOpenThread, onCompose, counts, onCounts }) {
  const [posts, setPosts] = React.useState(null);
  const [members, setMembers] = React.useState(null);
  const [fresh, setFresh] = React.useState(null);
  const [unreadMark, setUnreadMark] = React.useState(0);
  const [digest, setDigest] = React.useState(null);
  const [dismissedCatchup, setDismissed] = React.useState(false);
  const [sheetFor, setSheetFor] = React.useState(null);
  const streamRef = React.useRef(null);
  const atBottom = React.useRef(true);
  const postsRef = React.useRef([]);
  const ch = channels.find(c => c.slug === slug) || { name: slug, slug };
  const mem = auth.member || {};
  const staff = !!(posts || []).length && (posts || [])[0] && (posts || [])[0].canStar;

  React.useEffect(() => { postsRef.current = posts || []; }, [posts]);

  React.useEffect(() => {
    setPosts(null); setFresh(null); setDismissed(false);
    setUnreadMark(ch.unread || 0);
    NGGApi.member.community.feed(slug, "latest", 0)
      .then(r => setPosts(r.posts || [])).catch(() => setPosts([]));
    NGGApi.member.community.members(slug)
      .then(r => setMembers(r.members || [])).catch(() => setMembers([]));
    const t = setTimeout(() => {
      NGGApi.member.community.markRead(slug)
        .then(() => NGGApi.member.community.today().then(onCounts).catch(() => {}))
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [slug]); // eslint-disable-line

  /* Polling, and the rule the bundle is emphatic about: NEVER auto-scroll.
     A message arriving while somebody is reading three screens up should not
     move the page under their thumb. It offers a pill instead. */
  React.useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      NGGApi.member.community.feed(slug, "latest", 0).then(r => {
        const cur = postsRef.current;
        const have = new Set(cur.map(x => x.postId));
        const incoming = r.posts || [];
        if (!cur.length) { setPosts(incoming); return; }
        const news = incoming.filter(x => !have.has(x.postId));
        if (!news.length) return;
        if (atBottom.current) setPosts(incoming); else setFresh(incoming);
      }).catch(() => {});
    };
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
  }, [slug]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    atBottom.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 120;
    if (atBottom.current && fresh) { setPosts(fresh); setFresh(null); }
  };
  const jumpToNew = () => {
    if (fresh) { setPosts(fresh); setFresh(null); }
    const el = streamRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const patch = (postId, p) => setPosts(ps => (ps || []).map(x => x.postId === postId ? { ...x, ...p } : x));
  const remove = (postId) => setPosts(ps => (ps || []).filter(x => x.postId !== postId));

  const chrono = React.useMemo(() => (posts ? [...posts].reverse() : posts), [posts]);
  const dividerAt = (chrono && unreadMark > 0) ? Math.max(0, chrono.length - unreadMark) : -1;
  const newCount = fresh ? fresh.filter(x => !(posts || []).some(p => p.postId === x.postId)).length : 0;

  const catchUp = () => {
    setDigest({ loading: true });
    NGGApi.member.community.digest(slug)
      .then(r => setDigest({ text: r.digest, ai: r.ai }))
      .catch(() => setDigest({ text: "Couldn't summarise right now." }));
  };

  return (
    <div className="cmm-screen cmm-channel">
      <header className="cmm-ch-head">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back to channels">{cmUiIcon("back", 22)}</button>
        <span className="cmm-ch-av sm" aria-hidden="true">{ch.icon || "#"}</span>
        <div className="cmm-head-txt">
          <h1 className="cmm-ch-title">{ch.name}</h1>
          <p className="cmm-sub">
            {members === null ? "…" : members.length + (members.length === 1 ? " member" : " members")}
            {members && members.some(m => m.staff) ? " · " + members.filter(m => m.staff).length + " mentor" : ""}
          </p>
        </div>
      </header>

      {/* Presence: who has actually posted here. No invented "online" dots —
          a green light that does not mean anything is worse than none. */}
      {members && members.length > 0 && (
        <div className="cmm-presence">
          <span className="cmm-stack" aria-hidden="true">
            {members.slice(0, 5).map(m => (
              <span key={m.memberId || m.name} className="cmm-stack-av"
                    style={{ background: cmColor(m.name, m.staff ? "mentor" : "") }}>{cmInitial(m.name)}</span>
            ))}
          </span>
          {ch.purpose && <span className="cmm-purpose">{ch.purpose}</span>}
        </div>
      )}

      {/* Catch me up — only when there IS something to catch up on, and
          dismissible. A permanent banner is furniture nobody reads. */}
      {unreadMark > 0 && !dismissedCatchup && !digest && (
        <div className="cmm-catchup">
          <div className="cmm-catchup-txt">
            <b>While you were away</b>
            <span>{unreadMark} {unreadMark === 1 ? "message" : "messages"}</span>
          </div>
          <button className="cmm-catchup-go" onClick={catchUp}>Catch me up</button>
          <button className="cmm-catchup-x" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {digest && (
        <div className="cmm-digest" role="status">
          {digest.loading ? "Summarising…" : digest.text}
          {!digest.loading && <button className="cmm-catchup-x" onClick={() => setDigest(null)} aria-label="Dismiss">✕</button>}
        </div>
      )}

      <div className="cmm-stream" ref={streamRef} onScroll={onScroll}>
        {chrono === null && <CmSkeleton rows={4}/>}
        {chrono && chrono.length === 0 && (
          <CmEmpty icon="#" title="Nothing here yet"
                   body={"Be the first to say something in " + ch.name + "."}
                   action={<button className="cmm-cta" onClick={onCompose.open}>Write a message</button>}/>
        )}
        {chrono && chrono.map((p, i) => (
          <React.Fragment key={p.postId}>
            {i === dividerAt && (
              <div className="cmm-newline" role="separator">
                <span>NEW</span>
              </div>
            )}
            <CmMobileMessage post={p} prev={chrono[i - 1]} me={mem.fullName}
                             onPatch={patch} onRemove={remove}
                             onOpenThread={onOpenThread}
                             onLongPress={() => setSheetFor(p)}/>
          </React.Fragment>
        ))}
      </div>

      {newCount > 0 && (
        <button className="cmm-newpill" onClick={jumpToNew}>
          {cmUiIcon("down", 15)} {newCount} new {newCount === 1 ? "message" : "messages"}
        </button>
      )}

      {sheetFor && (
        <CmActionsSheetHost post={sheetFor} staff={staff} onClose={() => setSheetFor(null)}
                            onPatch={patch} onRemove={remove} onOpenThread={onOpenThread}/>
      )}
    </div>
  );
}

/** The actions sheet needs a post's action helpers, and useCmActions is a hook
 *  — so it is called here rather than conditionally inside the channel. */
function CmActionsSheetHost({ post, staff, onClose, onPatch, onRemove, onOpenThread }) {
  const act = useCmActions(post, onPatch, onRemove);
  return <CmActionsSheet post={post} act={act} staff={staff} onClose={onClose} onOpenThread={onOpenThread}/>;
}

/* ── A message on a phone ─────────────────────────────────────────────────
   Two actions on the card and seven in the sheet. 40px avatar, name, the
   mentor/you chips, time and centre, the body, a reaction summary, then React
   and N replies — both 44px, side by side. */
function CmMobileMessage({ post, prev, me, onPatch, onRemove, onOpenThread, onLongPress, card, showChannel }) {
  const act = useCmActions(post, onPatch, onRemove);
  const [picker, setPicker] = React.useState(false);
  const timer = React.useRef(null);
  const moved = React.useRef(false);

  /* Long-press: 480ms, cancelled by movement so a scroll is never mistaken for
     a press. contextmenu is suppressed on the card because on Android a long
     press otherwise opens the browser's own menu over ours. */
  const down = () => { moved.current = false; timer.current = setTimeout(() => { if (!moved.current) onLongPress(); }, 480); };
  const up = () => { if (timer.current) clearTimeout(timer.current); };
  const move = () => { moved.current = true; if (timer.current) clearTimeout(timer.current); };
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const grouped = prev && prev.author && post.author && prev.author.name === post.author.name
    && prev.kind !== "poll" && post.kind !== "poll"
    && (new Date((post.createdAt || "").replace(" ", "T")) - new Date((prev.createdAt || "").replace(" ", "T"))) < 5 * 60 * 1000;
  const replies = post.commentCount || 0;

  /* `card` is the Today feed: the same message with a border around it and the
     channel it came from. NOT a second component — the two-actions-and-a-sheet
     rule is the redesign's central decision, and a feed with its own message
     component is how that rule quietly stops applying on one screen. */
  const head = card || !grouped;

  return (
    <article className={(card ? "cm-card cmm-msg is-card" : "cmm-msg") + (!card && grouped ? " is-grouped" : "")}
             onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerMove={move}
             onContextMenu={(e) => { e.preventDefault(); onLongPress(); }}>
      {head && (
        <div className="cmm-msg-head">
          {cmAvatar(post.author.name, post.author.name + post.author.centre, post.author.photo, "cmm-msg-av", cmRoleOf(post))}
          <div className="cmm-msg-meta">
            <span className="cmm-msg-name">
              {post.author.name}
              {post.canStar && <span className="cmm-tag is-mentor">mentor</span>}
              {post.author.isMe && <span className="cmm-tag is-you">you</span>}
            </span>
            <span className="cmm-msg-time">
              {cmAgo(post.createdAt)}{post.author.centre ? " · " + post.author.centre : ""}
            </span>
          </div>
          {showChannel && post.channel && (
            <span className="cm-card-chan">{post.channel.icon || "#"} {post.channel.name}</span>
          )}
        </div>
      )}
      <div className="cmm-msg-body">
        <CmBodyBlock post={post} onVote={(i) => act.vote(i)}/>
      </div>
      {/* Reactions and actions share ONE line. They were two, each with its own
          vertical air, which on a feed of fifteen messages is fifteen rows of
          furniture between people and what they came to read. They wrap on a
          narrow screen rather than being cut off. */}
      <div className="cmm-msg-foot">
        <CmReactChips post={post} onReact={act.react}/>
        <div className="cmm-msg-acts">
          <button className="cmm-msg-act" onClick={() => setPicker(p => !p)} aria-expanded={picker}>React</button>
          <button className="cmm-msg-act" onClick={() => onOpenThread(post)}>
            {replies > 0 ? replies + (replies === 1 ? " reply" : " replies") : "Reply"}
            {post.lastCommentAt && <span className="cmm-msg-act-sub">{cmAgo(post.lastCommentAt)}</span>}
          </button>
        </div>
      </div>
      {picker && (
        <div className="cmm-picker" role="group" aria-label="Pick a reaction">
          {["👏", "🔥", "💡", "❤️", "😂"].map(e => (
            <button key={e} onClick={() => { act.react(e); setPicker(false); }} aria-label={"React with " + e}>{e}</button>
          ))}
        </div>
      )}
    </article>
  );
}

/* ── The shell ────────────────────────────────────────────────────────────
   Tab bar, FAB, and the stack of things that sit over a screen: a channel, a
   thread, the account surface, the composer, the jump sheet. Held here rather
   than inside each screen so Back has one meaning and the tab bar has one
   place that decides whether it is visible. */
function CmMobileApp({ auth, setPage, channels, reloadChannels }) {
  const [tab, setTab] = React.useState("today");
  const [channel, setChannel] = React.useState(null);   // open channel slug
  const [thread, setThread] = React.useState(null);     // open post
  const [account, setAccount] = React.useState(false);
  const [composer, setComposer] = React.useState(false);
  const [jump, setJump] = React.useState(false);
  const [counts, setCounts] = React.useState({ unread: 0, mentions: 0, saved: 0 });
  const [offline, setOffline] = React.useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const mem = auth.member || {};

  React.useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const refreshCounts = React.useCallback(() => {
    NGGApi.member.community.today()
      .then(r => setCounts({ unread: r.unread || 0, mentions: r.mentions || 0, saved: r.saved || 0 }))
      .catch(() => {});
  }, []);
  React.useEffect(() => { refreshCounts(); }, [refreshCounts]);

  /* Back has one meaning: close the top-most thing. Wired to the hardware and
     gesture Back too, because on Android that is the button people actually
     press, and a sheet that ignores it navigates the whole app away instead. */
  const closeTop = React.useCallback(() => {
    if (jump) { setJump(false); return true; }
    if (composer) { setComposer(false); return true; }
    if (account) { setAccount(false); return true; }
    if (thread) { setThread(null); return true; }
    if (channel) { setChannel(null); return true; }
    return false;
  }, [jump, composer, account, thread, channel]);

  React.useEffect(() => {
    const depth = (jump ? 1 : 0) + (composer ? 1 : 0) + (account ? 1 : 0) + (thread ? 1 : 0) + (channel ? 1 : 0);
    if (!depth) return;
    history.pushState({ cmm: depth }, "");
    const onPop = () => { closeTop(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [jump, composer, account, thread, channel]); // eslint-disable-line

  // The tab bar hides wherever the bundle says it does: in a thread, and over
  // any full-screen surface. A nav bar under a modal is a nav bar that lies.
  const barHidden = !!thread || account;

  const compose = {
    open: () => setComposer(true),
    openJump: () => setJump(true),
  };

  /* The FAB steps aside while you read downward.
   *
   * A floating button is by definition on top of the content, and the corner
   * it floats in is where a card's own action lands — the document card's
   * Preview button sits exactly under it. Hiding it on the way down and
   * bringing it back on the way up is the standard answer and the honest one:
   * somebody scrolling INTO the feed is reading, and somebody scrolling back
   * up is done reading and may want to write. The threshold keeps a small
   * jitter from flickering it. */
  const [fabHidden, setFabHidden] = React.useState(false);
  const lastY = React.useRef(0);
  const onBodyScroll = React.useCallback((e) => {
    const y = e.currentTarget.scrollTop;
    const dy = y - lastY.current;
    if (Math.abs(dy) < 12) return;
    setFabHidden(dy > 0 && y > 80);
    lastY.current = y;
  }, []);

  const openChannel = (slug) => { setChannel(slug); setTab("channels"); };

  return (
    <div className="cmm" data-screen-label="Community">
      <div className={"cmm-body" + (barHidden ? " no-bar" : "")} onScroll={onBodyScroll}>
        {/* Base layer: whichever tab is selected. */}
        {!channel && tab === "today" && (
          <CmToday auth={auth} counts={counts} onCounts={refreshCounts}
                   onOpenAccount={() => setAccount(true)}
                   onOpenThread={setThread} onCompose={compose}
                   onOpenChannel={openChannel} offline={offline}/>
        )}
        {!channel && tab === "channels" && (
          <CmChannels channels={channels} onOpen={openChannel} onCompose={compose}/>
        )}
        {tab === "arcade" && !channel && <div className="cmm-pad"><CmArcade auth={auth}/></div>}
        {tab === "journal" && !channel && <div className="cmm-pad"><CmProgramJournal auth={auth}/></div>}

        {/* A channel covers the tab it was opened from. */}
        {channel && (
          <CmChannel slug={channel} channels={channels} auth={auth}
                     onBack={() => setChannel(null)} onOpenThread={setThread}
                     onCompose={compose} counts={counts} onCounts={refreshCounts}/>
        )}
      </div>

      {/* The FAB. Today and Channels only — there is nothing to compose into
          from the Arcade or the Journal, and a button that does nothing where
          it sits teaches people not to trust it. */}
      {!barHidden && !thread && (tab === "today" || tab === "channels") && (
        <button className={"cmm-fab" + (fabHidden ? " is-away" : "")}
                onClick={() => setComposer(true)} aria-label="Write a post"
                tabIndex={fabHidden ? -1 : 0}>
          {cmUiIcon("plus", 26)}
        </button>
      )}

      {!barHidden && (
        <nav className="cmm-tabs" aria-label="Community">
          {[["today", "Today"], ["channels", "Channels"], ["arcade", "Arcade"], ["journal", "Journal"]].map(([id, label]) => (
            <button key={id} className={"cmm-tab" + (tab === id && !channel ? " is-on" : "")}
                    aria-current={tab === id && !channel ? "page" : undefined}
                    onClick={() => { setChannel(null); setTab(id); }}>
              {cmTabIcon(id)}
              <span className="cmm-tab-l">{label}</span>
              {id === "today" && counts.unread > 0 && <span className="cmm-tab-dot" aria-hidden="true"/>}
            </button>
          ))}
        </nav>
      )}

      {/* Over-layers, outermost last. */}
      {thread && (
        <div className="cmm-over">
          <CmThread post={thread} me={mem.fullName} channels={channels}
                    onClose={() => setThread(null)}
                    onPatch={() => {}} onRemove={() => setThread(null)}/>
        </div>
      )}
      {account && (
        <div className="cmm-over">
          <CmAccount auth={auth} counts={counts} setPage={setPage}
                     onClose={() => setAccount(false)}
                     onGo={(where) => {
                       setAccount(false);
                       if (where === "saved") setTab("today");
                       if (where === "matches") setTab("arcade");
                     }}/>
        </div>
      )}
      {composer && (
        <CmSheet title="New post" onClose={() => setComposer(false)}>
          <CmComposer channels={channels} active={channel || "commons"} me={mem.fullName}
                      onPosted={() => { setComposer(false); refreshCounts(); reloadChannels(); }}/>
        </CmSheet>
      )}
      {jump && (
        <CmJumpSheet channels={channels} onClose={() => setJump(false)}
                     onOpenChannel={openChannel}
                     onCompose={() => { setJump(false); setComposer(true); }}/>
      )}
    </div>
  );
}

function CommunityApp({ setPage, auth }) {
  /* The community, at every width.
   *
   * This used to fork: a three-pane workspace for a laptop and, below a
   * breakpoint, the same markup with its columns stacked. That is not a
   * responsive design, it is a desktop design running out of room, and the
   * phone — which is what the members actually hold — got whatever was left
   * over. The redesign inverts it. One set of screens, authored for a 390px
   * phone, which the stylesheet then lays out as the bundle's floating panes
   * once there is a desktop's worth of room.
   *
   * All this component still owns is the channel list, because every screen
   * below needs it and none of them should each fetch their own copy. */
  const [channels, setChannels] = React.useState([]);

  const reloadChannels = React.useCallback(() => {
    NGGApi.member.community.channels()
      .then(r => setChannels(r.channels || []))
      .catch(() => {});
  }, []);
  React.useEffect(() => { reloadChannels(); }, [reloadChannels]);

  /* Marks the body while the community is mounted: the site's own floating
     furniture (quick-nav hint, back-to-top) hides so it never lands on top of
     the tab bar. */
  React.useEffect(() => {
    document.body.classList.add("cm-app");
    return () => document.body.classList.remove("cm-app");
  }, []);

  /* The app sits below the sticky site nav, whose height changes when the
     brand wraps. Measured rather than guessed, so the tab bar docks at the
     real viewport bottom on every phone. */
  React.useEffect(() => {
    const sync = () => {
      const nav = document.querySelector(".topnav");
      const h = nav ? Math.round(nav.getBoundingClientRect().height) : 64;
      document.documentElement.style.setProperty("--cm-nav", h + "px");
    };
    sync();
    window.addEventListener("resize", sync);
    const t = setTimeout(sync, 300);      // after fonts and the logo settle
    return () => {
      window.removeEventListener("resize", sync);
      clearTimeout(t);
      document.documentElement.style.removeProperty("--cm-nav");
    };
  }, []);

  return (
    <div className="page cm-page" data-screen-label="Community">
      <CmMobileApp auth={auth} setPage={setPage} channels={channels}
                   reloadChannels={reloadChannels}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   The Arcade — short, replayable mini games inside the Community.

   Everything that decides a score happens on the server: it mints a round,
   keeps the answer key, and grades the submission. This file therefore holds
   no answers and no scoring, only the surface — which is exactly the point.
   A player can read every line of it and learn nothing useful.

   The clock shown here is a display of the server's clock, not the authority
   for it. Running out on screen submits what the player has; the server
   decides whether that was in time.
   ═══════════════════════════════════════════════════════════════════════ */

function CmArcade({ auth }) {
  const [home, setHome] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [round, setRound] = React.useState(null);    // active round (playing)
  const [result, setResult] = React.useState(null);  // graded round
  const [starting, setStarting] = React.useState("");
  const [lab, setLab] = React.useState(false);      // in the Math Lab

  const load = React.useCallback(() => {
    NGGApi.member.arcade.home()
      .then(r => { setHome(r); setErr(""); })
      .catch(e => setErr((e && e.message) || "Could not open the Arcade."));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const play = (game) => {
    if (starting) return;
    setStarting(game); setErr("");
    NGGApi.member.arcade.start(game)
      .then(r => { setResult(null); setRound(r); })
      .catch(e => setErr((e && e.message) || "Could not start that game."))
      .then(() => setStarting(""));
  };

  const onGraded = (r, game) => { setRound(null); setResult({ ...r, game }); load(); };
  const backToHome = () => { setRound(null); setResult(null); };

  if (lab) return <MathLab onDone={() => setLab(false)}/>;
  if (round) return <ArcadeRound round={round} onGraded={onGraded} onQuit={backToHome}/>;
  if (result) return <ArcadeResult result={result} games={(home && home.games) || []}
                                  onAgain={() => play(result.game)} onDone={backToHome}/>;

  return (
    <div className="arc" data-screen-label="Arcade">
      {err && <div className="arc-err" role="alert">{err}</div>}
      {!home ? (
        <div className="arc-skels">{[0, 1, 2, 3].map(i => <div key={i} className="arc-skel"/>)}</div>
      ) : (
        <>
          <ArcadeHero home={home} onPlay={play} busy={starting}/>
          <div className="arc-grid">
            {home.games.map(g => (
              <ArcadeCard key={g.key} game={g} busy={starting === g.key} onPlay={() => play(g.key)}/>
            ))}
          </div>
          <MathLabTeaser onOpen={() => setLab(true)}/>
          <ArcadeBoard games={home.games} programme={home.programme}/>
          <p className="arc-fineprint">
            Rounds are marked on the server, so nobody can type their way to the top of the board.
            The Club and the Summer School have separate boards.
          </p>
        </>
      )}
    </div>
  );
}

/* ── The Math Lab ─────────────────────────────────────────────────────────
   Twelve levels that unlock in order, from JSS number work to the Further
   Maths papers.

   It is a LADDER, not a leaderboard, and it looks different from the Arcade on
   purpose. An arcade round is sixty seconds of reflex against a clock and a
   board of other people's names. A maths paper is not that: you skip a hard
   one, come back to it, change your mind. So the whole paper is on the page at
   once the way a real paper is, the clock is generous, and there is no ranking
   anywhere — the only thing you are measured against is the pass mark.

   Nothing here knows an answer. The paper arrives as questions, the marking
   comes back from the server, and a locked level is refused there too — this
   file merely declines to draw a button for it.
   ═══════════════════════════════════════════════════════════════════════ */

/* The way into the Lab from the Arcade. It loads the board so the band can
   name the level you are actually on — "Start level 4: Surds" is an invitation,
   "Math Lab" is a filing cabinet. */
function MathLabTeaser({ onOpen }) {
  const [board, setBoard] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.mathlab.board().then(r => { if (alive) setBoard(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const next = board && (board.levels.find(l => l.unlocked && !l.cleared) || board.levels[board.levels.length - 1]);
  const pct = board ? Math.round((board.cleared / board.total) * 100) : 0;

  return (
    <section className="ml-teaser">
      <div className="ml-teaser-txt">
        <div className="arc-eyebrow">Not a race</div>
        <h2 className="ml-teaser-h">🧮 Math Lab</h2>
        <p className="ml-teaser-p">
          Twelve levels that unlock one at a time — number and numeration up to Further Maths.
          {next ? <> You are on <b>{next.name}</b>.</> : null}
        </p>
        <button className="arc-cta" onClick={onOpen}>
          {board ? (board.cleared > 0 ? "Continue the ladder" : "Open the Math Lab") : "Open the Math Lab"}
        </button>
      </div>
      {board && (
        <div className="ml-teaser-prog">
          <div className="ml-teaser-bar" aria-hidden="true"><div style={{ width: pct + "%" }}/></div>
          <div className="ml-teaser-n">{board.cleared} of {board.total} levels cleared</div>
        </div>
      )}
    </section>
  );
}

function MathLab({ onDone }) {
  const [board, setBoard] = React.useState(null);
  const [paper, setPaper] = React.useState(null);
  const [marked, setMarked] = React.useState(null);
  const [busy, setBusy] = React.useState(0);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(() => {
    NGGApi.member.mathlab.board()
      .then(r => { setBoard(r); setErr(""); })
      .catch(e => setErr((e && e.message) || "Could not open the Math Lab."));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const play = (level) => {
    if (busy) return;
    setBusy(level); setErr("");
    NGGApi.member.mathlab.start(level)
      .then(r => { setMarked(null); setPaper(r); })
      .catch(e => setErr(e && e.message === "locked"
        ? "Clear the level below this one first."
        : ((e && e.message) || "Could not start that level.")))
      .then(() => setBusy(0));
  };

  if (paper) return <MathPaper paper={paper} onQuit={() => setPaper(null)}
                              onMarked={(r) => { setPaper(null); setMarked({ ...r, level: paper.level, name: paper.name,
                                                                             questions: paper.questions }); load(); }}/>;
  if (marked) return <MathMarked result={marked} onRetry={() => play(marked.level)}
                                onNext={() => play(marked.level + 1)} onDone={() => setMarked(null)}/>;

  return (
    <div className="ml" data-screen-label="Math Lab">
      <header className="ml-hd">
        <button className="arc-quit" onClick={onDone}>← Arcade</button>
        <div className="ml-hd-txt">
          <h1 className="ml-h">🧮 Math Lab</h1>
          <p className="ml-sub">Twelve levels. Clear one to open the next.</p>
        </div>
        {board && (
          <div className="ml-prog" role="img"
               aria-label={board.cleared + " of " + board.total + " levels cleared"}>
            <b>{board.cleared}</b><span>/{board.total}</span>
          </div>
        )}
      </header>

      {err && <div className="arc-err" role="alert">{err}</div>}

      {!board ? (
        <div className="arc-skels">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="arc-skel"/>)}</div>
      ) : (
        <>
          <ol className="ml-ladder">
            {board.levels.map(l => (
              <MathLevelCard key={l.level} level={l} passPct={board.passPct}
                             busy={busy === l.level} onPlay={() => play(l.level)}/>
            ))}
          </ol>
          <p className="arc-fineprint">
            Questions are generated fresh every time, so there is no paper to memorise —
            and they are marked on the server, so the answers are never in the page.
            {" "}{board.passPct}% clears a level.
          </p>
        </>
      )}
    </div>
  );
}

function MathLevelCard({ level, passPct, onPlay, busy }) {
  const state = level.cleared ? "cleared" : (level.unlocked ? "open" : "locked");
  /* A locked level is a real <li> with real text, not a greyed-out button:
     a disabled control is skipped by the keyboard and says nothing about WHY
     it cannot be used. The reason is the whole message here. */
  return (
    <li className={"ml-lv is-" + state}>
      <div className="ml-lv-ic" aria-hidden="true">{state === "locked" ? "🔒" : level.icon}</div>
      <div className="ml-lv-body">
        <div className="ml-lv-top">
          <h3 className="ml-lv-h">{level.name}</h3>
          <span className="ml-lv-band">{level.band}</span>
        </div>
        <p className="ml-lv-p">{level.blurb}</p>
        <div className="ml-lv-meta">
          <span>{level.questions} questions</span>
          <span aria-hidden="true">·</span>
          <span>{Math.round(level.seconds / 60)} minutes</span>
          {level.attempts > 0 && <><span aria-hidden="true">·</span>
            <span>best {level.bestScore}%</span></>}
        </div>
      </div>
      <div className="ml-lv-act">
        {state === "locked" ? (
          <span className="ml-lv-lock">Clear level {level.level - 1} to open this</span>
        ) : (
          <>
            {state === "cleared" && <span className="ml-lv-tick" aria-label="Cleared">✓ Cleared</span>}
            <button className={"ml-go" + (state === "cleared" ? " is-again" : "")}
                    onClick={onPlay} disabled={busy}>
              {busy ? "…" : (state === "cleared" ? "Play again" : (level.attempts > 0 ? "Try again" : "Start"))}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/* ---- The paper ------------------------------------------------------- */

function MathPaper({ paper, onMarked, onQuit }) {
  const total = paper.questions.length;
  const [answers, setAnswers] = React.useState(() => paper.questions.map(() => ""));
  const [left, setLeft] = React.useState(paper.seconds);
  const [sending, setSending] = React.useState(false);
  const [err, setErr] = React.useState("");
  const sentRef = React.useRef(false);
  const answersRef = React.useRef(answers);
  React.useEffect(() => { answersRef.current = answers; }, [answers]);

  const submit = React.useCallback(() => {
    // Guarded with a ref for the same reason the Arcade is: the clock running
    // out and a tap on Hand in can land in the same frame, and the second send
    // comes back "already_submitted" over the top of a real mark.
    if (sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    NGGApi.member.mathlab.submit(paper.roundId, answersRef.current)
      .then(r => onMarked(r))
      .catch(e => {
        setErr((e && e.message) || "Could not hand that paper in.");
        setSending(false);
        sentRef.current = false;    // recoverable — the paper is only spent once marked
      });
  }, [paper, onMarked]);

  /* Wall-clock deadline, not a decrementing counter: setInterval drifts and a
     backgrounded tab stops firing it, so a student who took a call would come
     back to a clock that had barely moved while the server's had run out. */
  React.useEffect(() => {
    const deadline = Date.now() + paper.seconds * 1000;
    const tick = () => {
      const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) submit();
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [paper, submit]);

  const setAnswer = (idx, v) => setAnswers(a => { const n = a.slice(); n[idx] = v; return n; });
  const answered = answers.filter(a => String(a).trim() !== "").length;
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");
  const urgent = left <= 60;

  return (
    <div className="ml ml-paper" data-screen-label="Math Lab paper">
      <header className="ml-paper-hd">
        <button className="arc-quit" onClick={onQuit} disabled={sending}>← Leave</button>
        <div className="ml-paper-ttl">
          <b>{paper.name}</b><span>{paper.band}</span>
        </div>
        <div className={"arc-clock" + (urgent ? " is-urgent" : "")} role="timer" aria-live="off">
          {mm}:{ss}
        </div>
      </header>
      {/* The clock is decorative for assistive tech — a per-second live region
          is unusable. How much is answered is the signal worth announcing. */}
      <div className="sr-only" aria-live="polite">{answered} of {total} answered.</div>

      {err && <div className="arc-err" role="alert">{err}</div>}

      <ol className="ml-qs">
        {paper.questions.map((q, idx) => (
          <li key={idx} className={"ml-q" + (String(answers[idx]).trim() !== "" ? " is-done" : "")}>
            <div className="ml-q-n" aria-hidden="true">{idx + 1}</div>
            <div className="ml-q-body">
              <p className="ml-q-t" id={"mlq" + idx}>{q.q}</p>
              <input className="ml-q-in" value={answers[idx]}
                     onChange={e => setAnswer(idx, e.target.value)}
                     // The number pad on a phone, with autocorrect out of the
                     // way — it "helpfully" rewrites a minus sign.
                     inputMode="text" autoComplete="off" autoCorrect="off"
                     autoCapitalize="off" spellCheck={false}
                     aria-labelledby={"mlq" + idx} placeholder="Your answer"/>
            </div>
          </li>
        ))}
      </ol>

      <footer className="ml-paper-ft">
        <span className="arc-count">{answered}/{total} answered</span>
        <button className="arc-next is-finish" onClick={submit} disabled={sending}>
          {sending ? "Marking…" : "Hand it in"}
        </button>
      </footer>
    </div>
  );
}

/* ---- The marked paper ------------------------------------------------ */

function MathMarked({ result, onRetry, onNext, onDone }) {
  const wrong = result.marks.filter(m => !m.ok).length;
  return (
    <div className="ml ml-marked" data-screen-label="Math Lab result">
      <div className={"ml-score" + (result.cleared ? " is-pass" : "")}>
        <div className="ml-score-pct">{result.score}<span>%</span></div>
        <div className="ml-score-txt">
          <b>{result.correct} of {result.total} right</b>
          <span>{result.cleared
            ? "Cleared — that is above the " + result.passPct + "% pass mark."
            : "You need " + result.passPct + "% to clear this level. Have another go."}</span>
        </div>
      </div>

      {result.unlocked && (
        <div className="ml-unlock" role="status">
          🔓 Level {result.unlocked.level} is open — <b>{result.unlocked.name}</b>
        </div>
      )}

      {/* The worked answers come back only with the marking, never with the
          paper. Showing them here is the point of the exercise: a mark with no
          right answer beside it teaches nothing. */}
      <h2 className="ml-marks-h">
        {wrong === 0 ? "Every one right" : wrong + (wrong === 1 ? " to look at" : " to look at")}
      </h2>
      {/* The QUESTION is on the row, not just its number. "Q3: you wrote 5, the
          answer is 3" is useless on its own — a child cannot learn from a mark
          against a question they can no longer see. The paper is still in
          hand here, so it is carried across from it. */}
      <ol className="ml-marks">
        {result.marks.map((m, i) => {
          const q = (result.questions && result.questions[i]) ? result.questions[i].q : "";
          return (
            <li key={i} className={"ml-mark" + (m.ok ? " is-ok" : " is-no")}>
              <div className="ml-mark-q">
                <span className="ml-mark-ic" aria-hidden="true">{m.ok ? "✓" : "✗"}</span>
                <span className="ml-mark-n">Q{i + 1}</span>
                <span className="ml-mark-t">{q}</span>
              </div>
              <div className="ml-mark-a">
                <span className="ml-mark-yours">
                  <span className="ml-mark-lab">{m.ok ? "You wrote" : "You wrote"}</span>
                  <span className="sr-only">{m.ok ? "Correct. " : "Wrong. "}</span>
                  {String(m.your).trim() === "" ? <i>nothing</i> : m.your}
                </span>
                {!m.ok && (
                  <span className="ml-mark-right">
                    <span className="ml-mark-lab">Answer</span>
                    <span className="sr-only">The answer is </span>{m.answer}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="ml-marked-ft">
        <button className="arc-sec" onClick={onDone}>Back to the ladder</button>
        {result.unlocked
          ? <button className="arc-next" onClick={onNext}>Start level {result.unlocked.level} →</button>
          : <button className="arc-next" onClick={onRetry}>{result.cleared ? "Play it again" : "Try again"}</button>}
      </footer>
    </div>
  );
}

/* ── Two-player matches ───────────────────────────────────────────────────
   The Arcade's solo games are graded the instant you finish. A match is the
   opposite shape: it runs for days, and the screen a child opens most often is
   not a board but the question "whose turn is it?". So the lobby leads with
   the games waiting on YOU, and everything else sorts below it. */

/* The cburnett set — the pieces on lichess.org, by Colin M.L. Burnett, used
   under the BSD option of his triple licence (see
   assets/chess/cburnett/ATTRIBUTION.txt).

   These replace the Unicode glyphs. A font glyph is at the mercy of whatever
   the device has installed: on a cheap Android handset the chess block is
   often missing entirely, so a board rendered in ♔♕♖ shows tofu boxes, and
   where it IS present the outline forms are drawn with much thinner strokes
   than the solid ones, so the two sides read as different piece sets. An SVG
   is the same drawing on every device, and these are the drawings the players
   will recognise from everywhere else.

   Twelve files, about 7KB in total, cached like any other asset. */
const CHESS_PIECE_SRC = (piece) =>
  "/assets/chess/cburnett/" + (piece === piece.toUpperCase() ? "w" : "b") + piece.toUpperCase() + ".svg";
/* Kept for the captured-material strip and the promotion picker, where a piece
   is drawn at text size beside a number and an SVG would be heavier than the
   job needs. */
const CHESS_GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const CHESS_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
/* Standard relative values, for the material count every chess interface
   shows. Kings are not counted — they are never off the board. */
const CHESS_VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const CHESS_FULL = { p: 8, n: 2, b: 2, r: 2, q: 1 };
/* The reaction vocabulary is the entire messaging surface — there is no text
   input anywhere in this feature, by design. The server holds the same list
   and refuses anything else. */
const MATCH_REACTION_LABEL = {
  "good-game": ["🤝", "Good game"], "nice-move": ["👏", "Nice move"],
  "thinking": ["🤔", "Thinking…"],  "oops": ["😅", "Oops"],
  "well-played": ["🌟", "Well played"], "your-turn": ["👉", "Your turn"],
};

/** FEN placement → 64 squares, a8 first, so the array reads like the board. */
function chessSquares(fen) {
  const rows = String(fen || "").split(" ")[0].split("/");
  const out = [];
  for (let r = 0; r < 8; r++) {
    const row = rows[r] || "8";
    for (const ch of row) {
      if (/\d/.test(ch)) { for (let i = 0; i < +ch; i++) out.push(""); }
      else out.push(ch);
    }
  }
  return out;
}
function chessSqName(i) { return "abcdefgh"[i % 8] + (8 - Math.floor(i / 8)); }

/* Material captured, per side, from the position alone.
   Counting what is MISSING rather than replaying the move list means a game
   joined halfway, or one staff open at ply 40, shows the right thing without
   fetching every move. */
function chessMaterial(squares) {
  const have = {};
  squares.forEach(p => { if (p) have[p] = (have[p] || 0) + 1; });
  const gone = { w: [], b: [] };
  let score = 0;
  Object.keys(CHESS_FULL).forEach(t => {
    const wMissing = CHESS_FULL[t] - (have[t.toUpperCase()] || 0);
    const bMissing = CHESS_FULL[t] - (have[t] || 0);
    // Promotion can leave MORE of a piece than started; clamp so a second
    // queen never reads as a captured one.
    for (let i = 0; i < Math.max(0, wMissing); i++) gone.w.push(t);
    for (let i = 0; i < Math.max(0, bMissing); i++) gone.b.push(t);
    score += Math.max(0, bMissing) * CHESS_VALUE[t] - Math.max(0, wMissing) * CHESS_VALUE[t];
  });
  return { gone, score };
}

function CmMatches({ auth }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [openId, setOpenId] = React.useState("");
  const [busy, setBusy] = React.useState("");

  const [watch, setWatch] = React.useState(null);
  const load = React.useCallback(() => {
    NGGApi.member.match.list()
      .then(r => { setData(r); setErr(""); })
      .catch(e => setErr((e && e.message) || "Could not open your games."));
    NGGApi.member.match.watch().then(setWatch).catch(() => setWatch(null));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const invite = (opponentId) => {
    if (busy) return;
    setBusy(opponentId); setErr("");
    NGGApi.member.match.invite("chess", opponentId)
      .then(r => { load(); setOpenId(r.matchId); })
      .catch(e => setErr(e.code === "already_playing" ? "You already have a game running with them." : ((e && e.message) || "Could not start that game.")))
      .then(() => setBusy(""));
  };
  const respond = (matchId, accept) => {
    setBusy(matchId);
    NGGApi.member.match.respond(matchId, accept)
      .then(() => { load(); if (accept) setOpenId(matchId); })
      .catch(e => setErr((e && e.message) || "Could not answer that invitation."))
      .then(() => setBusy(""));
  };

  if (openId) return <MatchGame matchId={openId} onBack={() => { setOpenId(""); load(); }}/>;

  const matches = (data && data.matches) || [];
  const me = (data && data.me) || {};
  const yourMove = matches.filter(m => m.status === "active" && m.yourTurn);
  const waiting  = matches.filter(m => m.status === "active" && !m.yourTurn);
  const invites  = matches.filter(m => m.status === "invited" && m.you === "B");
  const sent     = matches.filter(m => m.status === "invited" && m.you === "A");
  const done     = matches.filter(m => m.status === "complete" || m.status === "declined");

  return (
    <div className="arc mtl" data-screen-label="Matches">
      {err && <div className="arc-err" role="alert">{err}</div>}
      <div className="mtl-hero">
        <div>
          <div className="arc-eyebrow">Play a friend</div>
          <h2 className="arc-hero-h">Chess</h2>
          <p className="arc-hero-p">
            One move at a time — your opponent has days, not seconds. Play someone at your
            own centre, and pick up the game whenever you like.
          </p>
        </div>
        <div className="mtl-count">
          <dl><dt>Your move</dt><dd>{yourMove.length}</dd></dl>
        </div>
      </div>

      {!data ? <div className="arc-skels">{[0, 1, 2].map(i => <div key={i} className="arc-skel"/>)}</div> : <>
        {invites.length > 0 && <section className="mtl-sec">
          <h3 className="mtl-h">Invitations</h3>
          {invites.map(m => (
            <div key={m.matchId} className="mtl-row is-invite">
              <span className="mtl-who">{m.players.A.name} invited you</span>
              <span className="mtl-act">
                <button className="btn btn-primary btn-sm" disabled={busy === m.matchId} onClick={() => respond(m.matchId, true)}>Accept</button>
                <button className="btn btn-ghost btn-sm" disabled={busy === m.matchId} onClick={() => respond(m.matchId, false)}>Decline</button>
              </span>
            </div>
          ))}
        </section>}

        <MatchList title="Your move" rows={yourMove} me={me} onOpen={setOpenId} emphasise/>
        <MatchList title="Waiting on them" rows={waiting} me={me} onOpen={setOpenId}/>
        <MatchList title="Invitations you sent" rows={sent} me={me} onOpen={setOpenId}/>
        <MatchList title="Finished" rows={done} me={me} onOpen={setOpenId}/>

        {/* Games anyone can watch. Live first and most-recently-moved at the top,
            because a game that moved ten seconds ago is worth opening and one
            that moved on Tuesday is not. */}
        {watch && (watch.live || []).filter(g => !g.mine).length > 0 && (
          <section className="mtl-sec">
            <h3 className="mtl-h">Watch a game</h3>
            <p className="mtl-hint">Anyone can watch. You can’t move or react in a game you’re watching.</p>
            {(watch.live || []).filter(g => !g.mine).slice(0, 8).map(g => (
              <button key={g.matchId} className="mtl-row" onClick={() => setOpenId(g.matchId)}>
                <span className="mtl-who">{g.a.name} v {g.b.name}</span>
                <span className="mtl-meta">
                  {g.a.centre ? g.a.centre + " · " : ""}move {Math.max(1, Math.ceil(g.ply / 2))}
                </span>
                <span className="mtl-go" aria-hidden="true">→</span>
              </button>
            ))}
          </section>
        )}

        <section className="mtl-sec">
          <h3 className="mtl-h">Start a game</h3>
          <p className="mtl-hint">Anyone, at any centre.</p>
          <div className="mtl-opps">
            {((data && data.opponents) || []).map(o => (
              <button key={o.id} className="mtl-opp" disabled={!!busy} onClick={() => invite(o.id)}>
                <span className="mtl-opp-av" aria-hidden="true">{cmInitial(o.fullName)}</span>
                <span className="mtl-opp-n">{o.fullName}{o.centre ? <em className="mtl-opp-c"> · {o.centre}</em> : null}</span>
                <span className="mtl-opp-go" aria-hidden="true">♟</span>
              </button>
            ))}
            {!((data && data.opponents) || []).length &&
              <p className="mtl-hint">Nobody else at your centre is signed up yet.</p>}
          </div>
        </section>

        <p className="arc-fineprint">
          Every move is checked on the server, so an illegal move simply will not play.
          Your mentors can see these games.
        </p>
      </>}
    </div>
  );
}

function MatchList({ title, rows, me, onOpen, emphasise }) {
  if (!rows.length) return null;
  return (
    <section className="mtl-sec">
      <h3 className="mtl-h">{title}</h3>
      {rows.map(m => {
        const them = m.you === "A" ? m.players.B : m.players.A;
        const outcome = m.status !== "complete" ? ""
          : m.result === "draw" ? "Drawn · " + (m.reason || "").replace(/_/g, " ")
          : (m.winnerId === (me && me.id) ? "You won" : "You lost") + " · " + (m.reason || "").replace(/_/g, " ");
        return (
          <button key={m.matchId} className={"mtl-row" + (emphasise ? " is-turn" : "")} onClick={() => onOpen(m.matchId)}>
            <span className="mtl-who">{them.name}</span>
            <span className="mtl-meta">{outcome || (m.ply ? "move " + Math.ceil(m.ply / 2) : "not started")}</span>
            <span className="mtl-go" aria-hidden="true">→</span>
          </button>
        );
      })}
    </section>
  );
}

/* A player's side of the board: name, whether they are on move, and the pieces
   they have captured. Standard in every chess client, and the material count is
   the fastest way for a beginner to see they are behind. */
function ChessSeat({ player, colour, gone, score, onMove }) {
  return (
    <div className={"mtg-seat" + (onMove ? " is-on" : "")}>
      <span className={"mtg-seat-dot is-" + colour} aria-hidden="true"/>
      <span className="mtg-seat-n">{player.name}</span>
      <span className="mtg-seat-mat">
        {gone.map((t, i) => <span key={t + i} className="mtg-seat-pc" aria-hidden="true">{CHESS_GLYPH[t]}</span>)}
        {score > 0 && <b>+{score}</b>}
      </span>
      {gone.length > 0 && <span className="sr-only">
        {"Captured: " + gone.map(t => CHESS_NAME[t]).join(", ") + (score > 0 ? ". Ahead by " + score + " points of material." : "")}
      </span>}
      {onMove && <span className="sr-only">On move.</span>}
    </div>
  );
}

/**
 * The board.
 *
 * Conventions taken from the clients people have actually used (Lichess's
 * Chessground is the reference implementation), because a chess player arrives
 * with fixed expectations and spending their attention on a novel board is
 * spending it in the wrong place:
 *
 *   • file/rank coordinates on the edge squares
 *   • the last move highlighted, so you can see what your opponent played
 *   • a king in check marked in red
 *   • the selected square marked, legal destinations dotted, and a capture
 *     drawn as a ring around the piece rather than a dot behind it
 *   • a flip control, because looking at a game from the other side is a thing
 *     people want to do
 *
 * Accessibility notes, both of which were real failures in the first version:
 *
 *   The squares are NEVER disabled. Disabling all 64 while waiting for the
 *   opponent removed them from the tab order, which meant a keyboard or
 *   screen-reader user could not read the position at all unless it was their
 *   turn — and could never read it in staff view. They are always focusable and
 *   always announced; only the click handler is conditional.
 *
 *   One roving tabindex plus arrow keys, per the ARIA grid pattern, instead of
 *   64 tab stops. Tab reaches the board, arrows move within it. `role="row"`
 *   wrappers are required — gridcells directly inside a grid is invalid ARIA
 *   and screen readers announce the geometry wrongly.
 */
function ChessBoard({ squares, flip, from, targets, lastMove, checkSquare, interactive, onTap, onFlip }) {
  const [cursor, setCursor] = React.useState("e4");
  const order = [];
  for (let i = 0; i < 64; i++) order.push(flip ? 63 - i : i);

  const onKey = (e) => {
    const f = "abcdefgh".indexOf(cursor[0]), r = +cursor[1];
    const step = (df, dr) => {
      // Arrows follow what the player SEES, so they invert with the board.
      const nf = f + (flip ? -df : df), nr = r + (flip ? -dr : dr);
      if (nf < 0 || nf > 7 || nr < 1 || nr > 8) return;
      e.preventDefault();
      const next = "abcdefgh"[nf] + nr;
      setCursor(next);
      const el = e.currentTarget.querySelector('[data-sq="' + next + '"]');
      if (el) el.focus();
    };
    if (e.key === "ArrowRight") step(1, 0);
    else if (e.key === "ArrowLeft") step(-1, 0);
    else if (e.key === "ArrowUp") step(0, 1);
    else if (e.key === "ArrowDown") step(0, -1);
  };

  return (
    <div className="mtg-boardwrap">
      <div className="mtg-board" role="grid" aria-label="Chess board" onKeyDown={onKey}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(row => (
          <div className="mtg-row" role="row" key={row}>
            {order.slice(row * 8, row * 8 + 8).map(i => {
              const sq = chessSqName(i);
              const piece = squares[i];
              const dark = ((Math.floor(i / 8) + (i % 8)) % 2) === 1;
              const isTarget = targets.indexOf(sq) !== -1;
              const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
              const file = sq[0], rank = sq[1];
              // Coordinates on the edges only — on every square they are noise.
              const showFile = flip ? rank === "8" : rank === "1";
              const showRank = flip ? file === "h" : file === "a";
              return (
                <button key={sq} role="gridcell" data-sq={sq}
                  tabIndex={sq === cursor ? 0 : -1}
                  className={"mtg-sq" + (dark ? " is-dark" : "") + (from === sq ? " is-from" : "")
                    + (isTarget ? (piece ? " is-capture" : " is-target") : "")
                    + (isLast ? " is-last" : "") + (checkSquare === sq ? " is-check" : "")}
                  aria-disabled={!interactive}
                  onFocus={() => setCursor(sq)}
                  onClick={() => interactive && onTap(sq, piece)}
                  aria-label={sq
                    + (piece ? ", " + (piece === piece.toUpperCase() ? "white" : "black") + " " + CHESS_NAME[piece.toLowerCase()] : ", empty")
                    + (isTarget ? (piece ? ", can capture here" : ", can move here") : "")
                    + (isLast ? ", last move" : "")
                    + (checkSquare === sq ? ", in check" : "")}>
                  {piece && <img className="mtg-pc" src={CHESS_PIECE_SRC(piece)} alt="" draggable={false}/>}
                  {isTarget && !piece && <span className="mtg-dot" aria-hidden="true"/>}
                  {showFile && <span className="mtg-coord is-file" aria-hidden="true">{file}</span>}
                  {showRank && <span className="mtg-coord is-rank" aria-hidden="true">{rank}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <button type="button" className="mtg-flip" onClick={onFlip}>⇅ Flip the board</button>
    </div>
  );
}

/** One game: the board, the move list, and the six things you can say. */
function MatchGame({ matchId, onBack }) {
  const [m, setM] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [promo, setPromo] = React.useState(null);   // { from, to } awaiting a piece
  const [manualFlip, setManualFlip] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    NGGApi.member.match.get(matchId)
      .then(r => { setM(r.match); setErr(""); })
      .catch(e => setErr((e && e.message) || "Could not open that game."));
  }, [matchId]);
  React.useEffect(() => { load(); }, [load]);

  /* LIVE.
   *
   * The same game is played both ways: two children at the same screen-time
   * move seconds apart, and two children in different weeks move a day apart.
   * Nothing switches modes — the board simply updates faster when the other
   * player is actually there.
   *
   * There are no WebSockets on shared hosting, so this polls. What makes that
   * affordable on a Nigerian mobile connection is that the tick is tiny: it
   * asks for the ply and nothing else, and only fetches the real thing —
   * moves, reactions — when the answer moves. Nineteen ticks in twenty carry a
   * couple of hundred bytes.
   *
   * It also STOPS when the tab is hidden. A board left open in a background tab
   * polling every two seconds for an afternoon is somebody's data, and they did
   * not agree to spend it on a game they are not looking at. */
  React.useEffect(() => {
    if (!m || m.status !== "active") return;
    let alive = true, timer = null;
    const tick = () => {
      if (!alive) return;
      if (document.visibilityState === "hidden") { timer = setTimeout(tick, 4000); return; }
      NGGApi.member.match.poll(matchId, m.ply)
        .then(r => {
          if (!alive) return;
          if (r.changed) load();                    // something happened — get the detail
          else if (r.status !== "active") load();   // resigned or ended between ticks
        })
        .catch(() => {})
        .then(() => { if (alive) timer = setTimeout(tick, m.yourTurn ? 6000 : 2500); });
    };
    /* Slower while it is YOUR move: nothing can change until you move, except
       your opponent resigning, and that can wait six seconds. */
    timer = setTimeout(tick, m.yourTurn ? 6000 : 2500);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [m && m.status, m && m.yourTurn, m && m.ply, matchId, load]);

  const send = (uci) => {
    setBusy(true); setErr(""); setFrom(""); setPromo(null);
    NGGApi.member.match.move(matchId, uci)
      .then(load)
      .catch(e => setErr(e.code === "illegal_move" ? "That move isn't legal." : ((e && e.message) || "Could not play that move.")))
      .then(() => setBusy(false));
  };

  if (err && !m) return <div className="arc mtg"><div className="arc-err" role="alert">{err}</div>
    <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button></div>;
  if (!m) return <div className="arc mtg"><div className="arc-skels"><div className="arc-skel"/></div></div>;

  const squares = chessSquares(m.state);
  /* You look at your own pieces from your own side. Staff have no side, so they
     get white's view — and either can flip, because looking at a position from
     the other side is a normal thing to want. */
  const baseFlip = m.yourColour === "b";
  const flip = manualFlip ? !baseFlip : baseFlip;
  const legal = m.legal || [];
  const canMove = m.status === "active" && m.yourTurn && !busy;
  const targets = from ? legal.filter(u => u.slice(0, 2) === from).map(u => u.slice(2, 4)) : [];
  const material = chessMaterial(squares);
  // Whoever is at the bottom of the board as drawn.
  const whiteSeat = m.players.A, blackSeat = m.players.B;
  const bottomSeat = flip ? blackSeat : whiteSeat;
  const topSeat = flip ? whiteSeat : blackSeat;
  /* A mentor opening a match is not one of the players, so `you` is empty.
     Everything below reads from the two NAMED players in that case — otherwise
     staff get a board captioned "You vs …" for a game they are not in, and a
     finished one dereferences players[""] and blanks the screen. */
  const isPlayer = m.you === "A" || m.you === "B";
  const them = m.you === "A" ? m.players.B : m.players.A;
  const title = isPlayer ? "You vs " + them.name : m.players.A.name + " vs " + m.players.B.name;

  const tap = (sq, piece) => {
    if (!canMove) return;
    if (from && targets.indexOf(sq) !== -1) {
      // A pawn reaching the last rank has four possible moves, not one.
      const opts = legal.filter(u => u.slice(0, 2) === from && u.slice(2, 4) === sq);
      if (opts.length > 1 && opts[0].length === 5) { setPromo({ from, to: sq }); return; }
      send(from + sq);
      return;
    }
    // Tapping your own piece re-aims rather than deselecting, which is what
    // people expect when they change their mind mid-move.
    if (piece && legal.some(u => u.slice(0, 2) === sq)) { setFrom(sq); return; }
    setFrom("");
  };

  const reason = (m.reason || "").replace(/_/g, " ");
  const winnerName = m.winnerId === m.players.A.id ? m.players.A.name
    : m.winnerId === m.players.B.id ? m.players.B.name : "";
  const statusLine = m.status === "complete"
    ? (m.result === "draw" ? "Drawn — " + reason
       : (isPlayer
            ? (m.winnerId === m.players[m.you].id ? "You won" : them.name + " won")
            : winnerName + " won") + " — " + reason)
    : m.status === "invited" ? "Waiting for " + them.name + " to accept"
    : !isPlayer ? "Waiting for " + (m.turnPlayer === m.players.A.id ? m.players.A.name : m.players.B.name)
    : m.yourTurn ? "Your move" : "Waiting for " + them.name;

  return (
    <div className="arc mtg" data-screen-label="Chess match">
      <button className="btn btn-ghost btn-sm mtg-back" onClick={onBack}>← All games</button>
      {err && <div className="arc-err" role="alert">{err}</div>}

      <div className="mtg-head">
        <div>
          <div className="arc-eyebrow">{m.staffView ? "Staff view" : m.spectator ? "Watching" : "Chess"}</div>
          <h2 className="mtg-h">{title}</h2>
        </div>
        <div className={"mtg-status" + (m.yourTurn && m.status === "active" ? " is-turn" : "")}>{statusLine}</div>
      </div>

      <div className="mtg-wrap">
        <div>
          <ChessSeat player={topSeat} colour={flip ? "w" : "b"} gone={flip ? material.gone.w : material.gone.b}
            score={flip ? -material.score : material.score} onMove={m.turnColour === (flip ? "w" : "b") && m.status === "active"}/>
          <ChessBoard squares={squares} flip={flip} from={from} targets={targets}
            lastMove={m.lastMove} checkSquare={m.checkSquare} interactive={canMove}
            onTap={tap} onFlip={() => setManualFlip(v => !v)}/>
          <ChessSeat player={bottomSeat} colour={flip ? "b" : "w"} gone={flip ? material.gone.b : material.gone.w}
            score={flip ? material.score : -material.score} onMove={m.turnColour === (flip ? "b" : "w") && m.status === "active"}/>
        </div>

        <aside className="mtg-side">
          <h3 className="mtl-h">Moves</h3>
          {/* Numbered PAIRS — "1. e4 e5" — which is how chess notation is
              written everywhere and how a child will be asked to write it at
              school. A flat list of plies is the same information in a form
              nobody reads. */}
          <ol className="mtg-moves">
            {(() => {
              const mv = m.moves || [];
              const rows = [];
              for (let i = 0; i < mv.length; i += 2) {
                rows.push(
                  <li key={i}>
                    {/* Written out rather than left to the <ol> marker: the row
                        is a grid, which suppresses list markers entirely. */}
                    <span className="mtg-mv-n">{(i / 2 + 1) + "."}</span>
                    <span className="mtg-mv-w">{mv[i] ? mv[i].san : ""}</span>
                    <span className="mtg-mv-b">{mv[i + 1] ? mv[i + 1].san : ""}</span>
                  </li>
                );
              }
              return rows;
            })()}
            {!(m.moves || []).length && <li className="mtg-empty">No moves yet.</li>}
          </ol>
          {m.status === "active" && !m.spectator &&
            <button className="btn btn-ghost btn-sm mtg-resign" disabled={busy}
              onClick={() => NGGApi.member.match.resign(matchId).then(load)}>Resign</button>}
        </aside>
      </div>

      {!m.spectator && <div className="mtg-reacts">
        <h3 className="mtl-h">Say something</h3>
        <p className="mtl-hint">These are the only messages here — there is no typing.</p>
        <div className="mtg-react-row">
          {Object.keys(MATCH_REACTION_LABEL).map(k => (
            <button key={k} className="mtg-react" disabled={busy}
              onClick={() => NGGApi.member.match.react(matchId, k).then(load).catch(() => {})}>
              <span aria-hidden="true">{MATCH_REACTION_LABEL[k][0]}</span> {MATCH_REACTION_LABEL[k][1]}
            </button>
          ))}
        </div>
        {(m.reactions || []).length > 0 && <div className="mtg-react-log">
          {(m.reactions || []).slice(-6).map((r, i) => (
            <span key={i} className="mtg-react-chip">
              {(MATCH_REACTION_LABEL[r.reaction] || ["💬", r.reaction])[0]}{" "}
              {(MATCH_REACTION_LABEL[r.reaction] || ["", r.reaction])[1]}
            </span>
          ))}
        </div>}
        <button className="mtg-report" onClick={() => NGGApi.member.match.report(matchId).then(load).catch(() => {})}>
          Report this game to a mentor
        </button>
      </div>}

      {/* A watcher can do exactly one thing, and it is the useful one. Games are
          public here, so more people can see one going wrong than can act on
          it — that is only worth something if any of them can raise a hand. */}
      {m.spectator && (
        <div className="mtg-watching">
          <p>You’re watching this game. {m.players.A.name} and {m.players.B.name} are playing.</p>
          <button className="mtg-report" onClick={() => NGGApi.member.match.report(matchId).then(load).catch(() => {})}>
            Report this game to a mentor
          </button>
        </div>
      )}

      {promo && <div className="mtg-promo" role="dialog" aria-label="Choose a piece">
        <div className="mtg-promo-box">
          <h3 className="mtl-h">Promote to</h3>
          <div className="mtg-promo-row">
            {["q", "r", "b", "n"].map(p => (
              <button key={p} className="mtg-promo-btn" onClick={() => send(promo.from + promo.to + p)}>
                <img className="mtg-pc" alt=""
                  src={CHESS_PIECE_SRC(m.yourColour === "w" ? p.toUpperCase() : p)}/>
                <em>{{ q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[p]}</em>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setPromo(null)}>Cancel</button>
        </div>
      </div>}
    </div>
  );
}

function ArcadeHero({ home, onPlay, busy }) {
  const daily = home.games.find(g => g.isDaily);
  return (
    <header className="arc-hero">
      <div className="arc-hero-txt">
        <div className="arc-eyebrow">Today’s challenge</div>
        <h1 className="arc-hero-h">{daily ? daily.icon + " " + daily.name : "The Arcade"}</h1>
        <p className="arc-hero-p">{daily ? daily.blurb : "Short games. Real skills."}</p>
        <button className="arc-cta" onClick={() => daily && onPlay(daily.key)} disabled={!daily || !!busy}>
          {home.dailyDone ? "Play it again" : "Play today’s challenge"}
        </button>
        {home.dailyDone && <span className="arc-done" role="status">✓ Done today — your streak is safe</span>}
      </div>
      <dl className="arc-stats">
        <div><dt>Day streak</dt><dd>{home.streak}<span aria-hidden="true">🔥</span></dd></div>
        <div><dt>Rounds played</dt><dd>{home.totalPlays}</dd></div>
        {/* Mentor stars, shown for context. The Arcade never awards one — they
            mean something a game has no business changing. */}
        <div><dt>Mentor stars</dt><dd>{home.stars}<span aria-hidden="true">⭐</span></dd></div>
      </dl>
    </header>
  );
}

function ArcadeCard({ game, onPlay, busy }) {
  return (
    <article className={"arc-card" + (game.isDaily ? " is-daily" : "")}>
      <div className="arc-card-top">
        <span className="arc-card-ic" aria-hidden="true">{game.icon}</span>
        {game.isDaily && <span className="arc-tag">Daily</span>}
      </div>
      <h3 className="arc-card-h">{game.name}</h3>
      <p className="arc-card-p">{game.blurb}</p>
      <div className="arc-card-meta">
        <span>{game.skill}</span>
        <span aria-hidden="true">·</span>
        <span>{game.questions} in {game.seconds}s</span>
      </div>
      <div className="arc-card-foot">
        <div className="arc-best">
          {game.plays > 0
            ? <><b>{game.best}</b> best · {game.plays} play{game.plays === 1 ? "" : "s"} · level {game.tier}</>
            : <span className="arc-new">Not played yet</span>}
        </div>
        <button className="arc-play" onClick={onPlay} disabled={busy}>{busy ? "…" : "Play"}</button>
      </div>
    </article>
  );
}

/* ---- One round ------------------------------------------------------- */

function ArcadeRound({ round, onGraded, onQuit }) {
  const total = round.questions.length;
  const [i, setI] = React.useState(0);
  const [answers, setAnswers] = React.useState(() => round.questions.map(() => ""));
  const [left, setLeft] = React.useState(round.seconds);
  const [sending, setSending] = React.useState(false);
  const [err, setErr] = React.useState("");
  const inputRef = React.useRef(null);
  const sentRef = React.useRef(false);
  const answersRef = React.useRef(answers);
  React.useEffect(() => { answersRef.current = answers; }, [answers]);

  const submit = React.useCallback(() => {
    // Guarded with a ref, not with `sending`: the timer's expiry and a tap on
    // Finish can land in the same frame, and two submissions means the second
    // comes back "already_played" over the top of a real score.
    if (sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    NGGApi.member.arcade.submit(round.roundId, answersRef.current)
      .then(r => onGraded(r, round.game))
      .catch(e => {
        setErr((e && e.message) || "Could not send that round.");
        setSending(false);
        // A failed send is recoverable — the round is only spent once the
        // server actually grades it, so let them try again.
        sentRef.current = false;
      });
  }, [round, onGraded]);

  /* The countdown runs off a wall-clock deadline, not off a decrementing
     counter. setInterval drifts, and a backgrounded tab stops firing it
     altogether — a player who switched apps would come back to a clock that
     had barely moved while the server's had run out. */
  React.useEffect(() => {
    const deadline = Date.now() + round.seconds * 1000;
    const tick = () => {
      const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) submit();
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [round, submit]);

  React.useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, [i]);

  const q = round.questions[i];
  const setAnswer = (v) => setAnswers(a => { const n = a.slice(); n[i] = v; return n; });
  const next = () => (i + 1 < total ? setI(i + 1) : submit());
  const prev = () => setI(x => Math.max(0, x - 1));
  const answered = answers.filter(a => String(a) !== "").length;
  const urgent = left <= 10;

  return (
    <div className="arc arc-play-wrap" data-screen-label="Arcade round">
      <header className="arc-run-hd">
        <button className="arc-quit" onClick={onQuit} disabled={sending}>← Leave</button>
        <div className="arc-run-prog" aria-hidden="true">
          <div className="arc-run-bar" style={{ width: (total ? ((i + 1) / total) * 100 : 0) + "%" }}/>
        </div>
        <div className={"arc-clock" + (urgent ? " is-urgent" : "")} role="timer" aria-live="off">
          {left}s
        </div>
      </header>
      {/* The clock is decorative for assistive tech (a per-second live region
          is unusable); the count of answered questions is the useful signal. */}
      <div className="sr-only" aria-live="polite">
        Question {i + 1} of {total}. {answered} answered.
      </div>

      {err && <div className="arc-err" role="alert">{err}</div>}

      <div className="arc-stage">
        <div className="arc-qnum">Question {i + 1} <span>of {total}</span></div>
        {round.kind === "choice" ? (
          <>
            <h2 className="arc-q">{q.q}</h2>
            <div className="arc-opts" role="radiogroup" aria-label={q.q}>
              {(q.options || []).map((opt, oi) => (
                <button key={oi} type="button" role="radio" aria-checked={String(answers[i]) === String(oi)}
                  className={"arc-opt" + (String(answers[i]) === String(oi) ? " is-picked" : "")}
                  onClick={() => { setAnswer(String(oi)); }}>
                  <span className="arc-opt-k" aria-hidden="true">{"ABCD"[oi] || oi + 1}</span>
                  <span className="arc-opt-t">{opt}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Which games want the number pad is a SET, not one game key.
                Hardcoding "maths" here meant every numeric game added later
                silently got a text keyboard and a "Type the word" prompt. The
                server grades these three the same way, so the input matches. */}
            {(() => {
              const numeric = ["maths", "sequence", "naira"].indexOf(round.game) !== -1;
              const isWord = round.game === "word";
              return <>
                <h2 className={"arc-q" + (isWord ? " arc-q-scramble" : numeric ? " arc-q-sum" : " arc-q-text")}>{q.q}</h2>
                {q.letters ? <div className="arc-hint">{q.letters} letters</div> : null}
                <form onSubmit={(e) => { e.preventDefault(); next(); }}>
                  <input ref={inputRef} className="arc-in" value={answers[i]}
                    onChange={e => setAnswer(e.target.value)}
                    // Arithmetic wants the number pad on a phone; a word wants
                    // letters, with the browser's autocorrect out of the way — it
                    // "fixes" a deliberately scrambled word into something else.
                    inputMode={numeric ? "numeric" : "text"}
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    aria-label={isWord ? "Unscramble " + q.q : q.q}
                    placeholder={isWord ? "Type the word" : "Answer"}/>
                </form>
              </>;
            })()}
          </>
        )}
      </div>

      <footer className="arc-run-ft">
        <button className="arc-sec" onClick={prev} disabled={i === 0 || sending}>Back</button>
        <span className="arc-count">{answered}/{total} answered</span>
        {i + 1 < total
          ? <button className="arc-next" onClick={next} disabled={sending}>Next</button>
          : <button className="arc-next is-finish" onClick={submit} disabled={sending}>{sending ? "Marking…" : "Finish"}</button>}
      </footer>
    </div>
  );
}

/* ---- Result ---------------------------------------------------------- */

function ArcadeResult({ result, games, onAgain, onDone }) {
  const g = games.find(x => x.key === result.game);
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  return (
    <div className="arc arc-result" data-screen-label="Arcade result">
      <div className={"arc-score" + (result.newBest ? " is-best" : "")}>
        {result.newBest && <div className="arc-best-flag">New personal best</div>}
        <div className="arc-score-n">{result.score}</div>
        <div className="arc-score-l">points</div>
        <div className="arc-score-sub">
          {result.correct}/{result.total} correct ({pct}%) in {result.seconds}s
        </div>
      </div>

      <ul className="arc-break">
        <li><span>Correct answers</span><b>+{result.breakdown.base}</b></li>
        {result.breakdown.sweep > 0 && <li className="is-bonus"><span>Every single one right</span><b>+{result.breakdown.sweep}</b></li>}
        <li><span>Speed bonus</span><b>+{result.breakdown.speed}</b></li>
      </ul>

      {result.daily && (
        <div className="arc-streak-note">
          🔥 Daily challenge done — <b>{result.streak} day{result.streak === 1 ? "" : "s"}</b> in a row.
        </div>
      )}

      {/* The answers are only shown once the round is closed, which is why the
          server can afford to send them: a quiz that will not tell a child what
          they got wrong has taught them nothing. */}
      <details className="arc-marks" open={result.correct < result.total}>
        <summary>See what you missed</summary>
        <ol>
          {(result.marks || []).map(m => (
            <li key={m.i} className={m.ok ? "is-ok" : "is-no"}>
              <span className="arc-mark-ic" aria-hidden="true">{m.ok ? "✓" : "✕"}</span>
              <span className="arc-mark-a">{m.answer}</span>
              {!m.ok && <span className="arc-mark-g">{m.given ? "you put “" + m.given + "”" : "left blank"}</span>}
            </li>
          ))}
        </ol>
      </details>

      <div className="arc-result-ft">
        <button className="arc-sec" onClick={onDone}>Back to the Arcade</button>
        <button className="arc-cta" onClick={onAgain}>Play {g ? g.name : "again"} again</button>
      </div>
    </div>
  );
}

/* ---- Leaderboard ----------------------------------------------------- */

function ArcadeBoard({ games, programme }) {
  const [game, setGame] = React.useState(games.length ? games[0].key : "");
  const [scope, setScope] = React.useState("week");
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let live = true; setData(null);
    NGGApi.member.arcade.board(game, scope)
      .then(r => { if (live) setData(r); })
      .catch(() => { if (live) setData({ board: [], me: null }); });
    return () => { live = false; };
  }, [game, scope]);

  const rows = (data && data.board) || [];
  // A board that stops at fifteen tells the fortieth-placed child nothing.
  // Their own row rides along underneath when it is off the end of the list.
  const meOff = data && data.me && !rows.some(r => r.isMe) ? data.me : null;

  return (
    <section className="arc-board">
      <div className="arc-board-hd">
        <h2>Leaderboard</h2>
        <div className="arc-board-scope" role="group" aria-label="Time range">
          {[["week", "This week"], ["all", "All time"]].map(([v, l]) => (
            <button key={v} className={scope === v ? "is-active" : ""} aria-pressed={scope === v} onClick={() => setScope(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="arc-board-tabs" role="tablist" aria-label="Game">
        {games.map(g => (
          <button key={g.key} role="tab" aria-selected={game === g.key}
            className={"arc-board-tab" + (game === g.key ? " is-active" : "")}
            onClick={() => setGame(g.key)}>
            <span aria-hidden="true">{g.icon}</span> {g.name}
          </button>
        ))}
      </div>
      {data === null ? (
        <div className="arc-skels">{[0, 1, 2].map(i => <div key={i} className="arc-skel arc-skel-row"/>)}</div>
      ) : rows.length === 0 ? (
        <p className="arc-board-empty">Nobody has played this one {scope === "week" ? "this week" : "yet"}. Be the first.</p>
      ) : (
        <ol className="arc-board-list">
          {rows.map(r => <ArcadeBoardRow key={r.rank} row={r}/>)}
          {meOff && <><li className="arc-board-gap" aria-hidden="true">⋯</li><ArcadeBoardRow row={meOff}/></>}
        </ol>
      )}
      <p className="arc-board-note">
        {programme === "ngg" ? "NGG Club board." : "Summer School board."} Ranked on your best single round.
      </p>
    </section>
  );
}

function ArcadeBoardRow({ row }) {
  return (
    <li className={"arc-board-row" + (row.isMe ? " is-me" : "")}>
      <span className={"arc-rank r" + (row.rank <= 3 ? row.rank : "")}>{row.rank}</span>
      <span className="arc-who">{row.first} {row.initial}{row.isMe && <em> — you</em>}</span>
      {row.centre && <span className="arc-centre">{row.centre}</span>}
      <span className="arc-pts"><b>{row.best}</b> pts</span>
    </li>
  );
}

/* ---- Composer ---- */
// Read a video file's duration (seconds) from its metadata, client-side.
function cmVideoMeta(file) {
  return new Promise(res => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { URL.revokeObjectURL(url); res({ duration: v.duration || 0 }); };
      v.onerror = () => { URL.revokeObjectURL(url); res({ duration: 0 }); };
      v.src = url;
    } catch (_) { res({ duration: 0 }); }
  });
}
const CM_VIDEO_MAX_MB = 80, CM_VIDEO_MAX_SECS = 180, CM_IMAGE_MAX_MB = 15, CM_DOC_MAX_MB = 25;
const CM_EMOJI = ["😀", "😂", "🥹", "😍", "😎", "🤔", "😅", "🙌", "👏", "🔥", "❤️", "💡", "🎉", "🚀", "💪", "🙏", "👀", "✅", "✨", "⭐", "🎬", "🎵", "🎨", "💻", "📷", "📊", "🏆", "🥳", "😴", "🤝", "👋", "💯"];
const CM_SLASH = [
  { cmd: "poll", icon: "📊", label: "Create a poll", hint: "Ask the crew a question" },
  { cmd: "media", icon: "📷", label: "Add photo or video", hint: "Upload from your device" },
  { cmd: "shrug", icon: "🤷", label: "Shrug", hint: "¯\\_(ツ)_/¯" },
];

// Monochrome nav icons (sidebar) — currentColor line art, no emoji.
function cmNavIcon(name) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const wrap = (kids) => <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">{kids}</svg>;
  if (name === "all") return wrap(<path d="M4 13h4l2 5 4-12 2 6h4" {...P}/>);      // activity pulse
  if (name === "saved") return wrap(<path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" {...P}/>); // bookmark
  if (name === "search") return wrap(<><circle cx="11" cy="11" r="7" {...P}/><path d="m20 20-3.5-3.5" {...P}/></>);
  if (name === "switch") return wrap(<path d="M7 10 12 5l5 5M7 14l5 5 5-5" {...P} strokeWidth={1.7}/>);
  if (name === "plus") return wrap(<path d="M12 5v14M5 12h14" {...P} strokeWidth={2}/>);
  if (name === "gear") return wrap(<><circle cx="12" cy="12" r="3" {...P}/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H1a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" {...P} strokeWidth={1.5}/></>);
  return null;
}

// Line-SVG icons for the dock (no emoji).
function cmIcon(name) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const wrap = (kids) => <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">{kids}</svg>;
  if (name === "image") return wrap(<><rect x="3" y="5" width="18" height="14" rx="2.4" {...P}/><circle cx="8.5" cy="10" r="1.7" {...P}/><path d="m4 17 5-4 4 3 3-2 4 3" {...P}/></>);
  if (name === "doc") return wrap(<path d="M8 4h11a1 1 0 0 1 1 1v9M4 8v11a1 1 0 0 0 1 1h11M9 9h3M9 13h6" {...P}/>);
  if (name === "poll") return wrap(<path d="M5 20V11M12 20V4M19 20v-6" {...P} strokeWidth={2.2}/>);
  if (name === "emoji") return wrap(<><circle cx="12" cy="12" r="9" {...P}/><path d="M8.5 14c.8 1 2 1.6 3.5 1.6S14.7 15 15.5 14" {...P}/><path d="M9 9.5h.01M15 9.5h.01" {...P}/></>);
  return null;
}

// Insert text at the caret / wrap the current selection, keeping focus + caret sane.
function cmTa(ta) { return ta; }
function cmInsertAt(ta, text, setBody) {
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  const nv = v.slice(0, s) + text + v.slice(e);
  setBody(nv);
  requestAnimationFrame(() => { try { ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length; } catch (_) {} });
}
function cmWrapSel(ta, mark, setBody) {
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  const sel = v.slice(s, e) || "text";
  const nv = v.slice(0, s) + mark + sel + mark + v.slice(e);
  setBody(nv);
  requestAnimationFrame(() => { try { ta.focus(); ta.selectionStart = s + mark.length; ta.selectionEnd = s + mark.length + sel.length; } catch (_) {} });
}

function CmComposer({ channels, active, me, onPosted, enterToSend }) {
  const [body, setBody] = React.useState("");
  const [media, setMedia] = React.useState(null); // {type,url,poster,bytes,duration}
  const [preview, setPreview] = React.useState(false);
  const [up, setUp] = React.useState(0);
  const [ch, setCh] = React.useState(active !== "all" ? active : "commons");
  const [busy, setBusy] = React.useState(false);
  const [poll, setPoll] = React.useState(null); // null | [opt, opt, ...]
  const [ment, setMent] = React.useState(null); // {q, start, items}
  const [mentIdx, setMentIdx] = React.useState(0);
  const [emoji, setEmoji] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const [showFmt, setShowFmt] = React.useState(false); // format tools revealed on demand
  const fileRef = React.useRef(null);
  const docRef = React.useRef(null);
  const taRef = React.useRef(null);
  const draftKey = "ngg.cm.draft." + ch;

  React.useEffect(() => { if (active !== "all" && active !== "bookmarks") setCh(active); }, [active]);

  // Draft autosave per channel — switching channels swaps drafts; a sent/blank
  // message clears its draft. Survives reloads.
  React.useEffect(() => {
    try { setBody(localStorage.getItem("ngg.cm.draft." + ch) || ""); } catch (_) {}
    setMent(null); setEmoji(false);
  }, [ch]);
  React.useEffect(() => {
    try { if (body) localStorage.setItem(draftKey, body); else localStorage.removeItem(draftKey); } catch (_) {}
  }, [body, draftKey]);

  // Auto-grow the textarea with its content (1 line → ~8).
  const grow = React.useCallback(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 168) + "px";
  }, []);
  React.useEffect(() => { grow(); }, [body, media, poll, grow]);

  const uploadFile = async (f) => {
    if (!f) return;
    const isVid = /^video\//.test(f.type);
    const isImg = /^image\//.test(f.type);
    const isDoc = !isVid && !isImg;
    const mb = f.size / 1024 / 1024;
    if (isVid && mb > CM_VIDEO_MAX_MB) { toast.error("That video is " + mb.toFixed(0) + "MB — keep clips under " + CM_VIDEO_MAX_MB + "MB."); return; }
    if (isImg && mb > CM_IMAGE_MAX_MB) { toast.error("That image is too large — keep it under " + CM_IMAGE_MAX_MB + "MB."); return; }
    if (isDoc && mb > CM_DOC_MAX_MB) { toast.error("That file is too large — keep documents under " + CM_DOC_MAX_MB + "MB."); return; }
    let duration = 0;
    if (isVid) {
      const meta = await cmVideoMeta(f); duration = Math.round(meta.duration || 0);
      if (duration > CM_VIDEO_MAX_SECS) { toast.error("That clip is " + Math.round(duration / 60) + " min — keep it under 3 minutes."); return; }
    }
    setPoll(null); setUp(1);
    try {
      const r = await NGGApi.uploadFile(f, "post", pct => setUp(Math.max(1, pct)));
      const type = isDoc ? "doc" : ((r.resourceType === "video" || isVid) ? "video" : "image");
      /* Carry the STORED format, not a guess from the URL.
       *
       * The viewer used to ask "does this url end in .pdf?", which is a
       * question about a filename rather than about the file, and it answered
       * wrongly for every document the upload path had re-encoded. Cloudinary
       * tells us what it actually kept; record that and let the reader trust
       * it. `cmDocFormat` falls back to the filename for the local-storage
       * path, where there is no cloud to ask. */
      const format = (r.format || "").toLowerCase() || cmDocFormat(f.name || "");
      setMedia({ type, url: r.url, poster: type === "video" ? cmPoster(r.url) : "",
                 bytes: f.size, duration, name: f.name || "document",
                 format, pages: r.pages || 0 });
      if (isDoc && format && format !== cmDocFormat(f.name || "")) {
        // The upload path changed the file out from under the member. Never
        // silent: this is exactly the failure that shipped PDFs as pictures.
        toast.error("That file was converted to ." + format + " on upload — the original could not be stored.");
      }
    } catch (e) {
      toast.error(isDoc && /uploads_disabled|503/.test(String(e && e.message))
        ? "Document sharing needs file storage configured — ask an admin."
        : "Upload failed — try again.");
    }
    finally { setUp(0); }
  };
  const pick = async (e) => { const f = e.target.files && e.target.files[0]; await uploadFile(f); if (fileRef.current) fileRef.current.value = ""; };
  const pickDoc = async (e) => { const f = e.target.files && e.target.files[0]; await uploadFile(f); if (docRef.current) docRef.current.value = ""; };
  const openFile = () => fileRef.current && fileRef.current.click();
  const openDoc = () => docRef.current && docRef.current.click();

  // Paste an image straight from the clipboard → upload.
  const onPaste = (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.kind === "file") { const f = it.getAsFile(); if (f && (/^image\//.test(f.type) || /^video\//.test(f.type))) { e.preventDefault(); uploadFile(f); return; } }
    }
  };
  // Drag & drop a file onto the composer.
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) uploadFile(f);
  };

  // @mention autocomplete: watch the token before the caret.
  const onBody = (e) => {
    const val = e.target.value; setBody(val);
    const caret = e.target.selectionStart || val.length;
    const m = val.slice(0, caret).match(/@([a-z0-9._-]{0,20})$/i);
    if (m) {
      const start = caret - m[0].length;
      NGGApi.member.community.mentions(m[1] || "").then(r => { setMent({ q: m[1] || "", start, items: r.people || [] }); setMentIdx(0); }).catch(() => {});
    } else setMent(null);
  };
  const pickMention = (handle) => {
    const ta = taRef.current;
    if (!ment || !ta) return;
    const before = body.slice(0, ment.start), after = body.slice(ta.selectionStart || (ment.start + ment.q.length + 1));
    const nv = before + "@" + handle + " " + after;
    setBody(nv); setMent(null);
    requestAnimationFrame(() => { try { ta.focus(); const pos = before.length + handle.length + 2; ta.selectionStart = ta.selectionEnd = pos; } catch (_) {} });
  };

  // Slash menu — appears when the box holds just "/word".
  const slashQ = /^\/(\w*)$/.exec(body.trim());
  const slashItems = slashQ ? CM_SLASH.filter(s => s.cmd.startsWith(slashQ[1].toLowerCase())) : [];
  const slashOpen = !!slashQ && slashItems.length > 0 && !media;
  const runSlash = (cmd) => {
    setBody("");
    if (cmd === "poll") setPoll(["", ""]);
    else if (cmd === "media") openFile();
    else if (cmd === "shrug") setBody("¯\\_(ツ)_/¯ ");
    requestAnimationFrame(() => taRef.current && taRef.current.focus());
  };

  const pollAdd = () => setPoll(p => (p && p.length < 4 ? p.concat("") : p));
  const pollSet = (i, v) => setPoll(p => p.map((x, j) => j === i ? v : x));
  const pollDel = (i) => setPoll(p => { const n = p.filter((_, j) => j !== i); return n.length < 2 ? n.concat(Array(2 - n.length).fill("")) : n; });

  const submit = async () => {
    const isPoll = !!poll;
    if (isPoll ? (!body.trim() || poll.filter(o => o.trim()).length < 2) : (!body.trim() && !media)) return;
    setBusy(true);
    try {
      const payload = isPoll
        ? { channel: ch, body: body.trim(), kind: "poll", pollOptions: poll.map(o => o.trim()).filter(Boolean) }
        : { channel: ch, body: body.trim(), mediaType: media ? media.type : "none", mediaUrl: media ? media.url : "", mediaPoster: media ? media.poster : "", mediaName: media && media.type === "doc" ? media.name : "", mediaFormat: media ? (media.format || "") : "", mediaPages: media ? (media.pages || 0) : 0, mediaBytes: media ? media.bytes : 0, mediaDuration: media ? media.duration : 0 };
      const r = await NGGApi.member.community.post(payload);
      setBody(""); setMedia(null); setPoll(null); setEmoji(false);
      try { localStorage.removeItem(draftKey); } catch (_) {}
      if (r.queued) toast.success("Posted — a mentor will approve it shortly.");
      else toast.success("Posted ✓");
      if (r.post) onPosted && onPosted(r.post);
    } catch (e) {
      toast.error(e.detail || (e.code === "crisis" ? "Please talk to a trusted adult now." : "Couldn't post — try again."));
    } finally { setBusy(false); }
  };

  const remaining = 2000 - body.length;
  const canPost = poll ? (body.trim() && poll.filter(o => o.trim()).length >= 2) : (body.trim() || media);
  const onKey = (e) => {
    // Mention menu keyboard navigation.
    if (ment && ment.items.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentIdx(i => (i + 1) % ment.items.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentIdx(i => (i - 1 + ment.items.length) % ment.items.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(ment.items[mentIdx].handle); return; }
      if (e.key === "Escape") { e.preventDefault(); setMent(null); return; }
    }
    if (slashOpen) {
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); runSlash(slashItems[0].cmd); return; }
      if (e.key === "Escape") { e.preventDefault(); setBody(""); return; }
    }
    // Formatting shortcuts.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); cmWrapSel(taRef.current, "*", setBody); return; }
      if (k === "i") { e.preventDefault(); cmWrapSel(taRef.current, "_", setBody); return; }
      if (k === "e") { e.preventDefault(); cmWrapSel(taRef.current, "`", setBody); return; }
    }
    if (enterToSend && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy && up === 0 && canPost) submit(); }
  };
  const chName = (channels.find(c => c.slug === ch) || {}).name || "the channel";
  const iconBtn = (icon, label, onClick, extra) => (
    <button type="button" className={"cm-dock-ic" + (extra || "")} onClick={onClick} disabled={up > 0} aria-label={label} title={label} onMouseDown={e => e.preventDefault()}>{icon}</button>
  );
  return (
    <div className={"cm-composer" + (drag ? " is-drag" : "")}
      onDragOver={e => { e.preventDefault(); if (!drag) setDrag(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={onDrop}
      role="group" aria-label={"Write a message to " + (active !== "all" ? "#" + chName : "the community")}>
      {drag && <div className="cm-drop" aria-hidden="true">Drop a photo, video or document to share</div>}

      {/* Format tools — revealed on demand, never permanent. */}
      {showFmt && (
        <div className="cm-fmt" role="toolbar" aria-label="Text formatting">
          <button type="button" className="cm-fmt-btn" aria-label="Bold (Ctrl or Cmd + B)" title="Bold (Ctrl/⌘+B)" onMouseDown={e => e.preventDefault()} onClick={() => cmWrapSel(taRef.current, "*", setBody)}><b>B</b></button>
          <button type="button" className="cm-fmt-btn" aria-label="Italic (Ctrl or Cmd + I)" title="Italic (Ctrl/⌘+I)" onMouseDown={e => e.preventDefault()} onClick={() => cmWrapSel(taRef.current, "_", setBody)}><i>i</i></button>
          <button type="button" className="cm-fmt-btn" aria-label="Strikethrough" title="Strikethrough" onMouseDown={e => e.preventDefault()} onClick={() => cmWrapSel(taRef.current, "~", setBody)}><s>S</s></button>
          <button type="button" className="cm-fmt-btn cm-fmt-code" aria-label="Code (Ctrl or Cmd + E)" title="Code (Ctrl/⌘+E)" onMouseDown={e => e.preventDefault()} onClick={() => cmWrapSel(taRef.current, "`", setBody)}>{"</>"}</button>
          {/* A preview, because the formatting is only worth offering if you can
              see what it did before a hundred people read it. */}
          <button type="button" className={"cm-fmt-btn cm-fmt-prev" + (preview ? " is-on" : "")}
            aria-pressed={preview} aria-label="Preview the formatting" title="Preview"
            onMouseDown={e => e.preventDefault()} onClick={() => setPreview(v => !v)}>👁</button>
        </div>
      )}

      {preview && (
        <div className="cm-preview">
          <div className="cm-preview-lab">Preview</div>
          {body.trim()
            ? <NggMarkdown text={body} className="cm-preview-body"/>
            : <p className="cm-preview-empty">Nothing to preview yet.</p>}
        </div>
      )}

      {poll && (
        <div className="cm-poll-edit">
          {poll.map((o, i) => (
            <div key={i} className="cm-poll-opt">
              <input className="cm-poll-input" value={o} maxLength={80} placeholder={"Option " + (i + 1)} aria-label={"Poll option " + (i + 1)} onChange={e => pollSet(i, e.target.value)}/>
              {poll.length > 2 && <button className="cm-poll-x" onClick={() => pollDel(i)} aria-label="Remove option">✕</button>}
            </div>
          ))}
          {poll.length < 4 && <button className="cm-poll-add" onClick={pollAdd}>+ Add option</button>}
        </div>
      )}

      {media && (
        <div className="cm-media-preview">
          {media.type === "video" ? <video src={cmOpt(media.url, 1280)} poster={media.poster} controls className="cm-media"/>
            : media.type === "doc" ? <div className="cm-doc-chip"><span className="cm-doc-ic" aria-hidden="true">📄</span><span className="cm-doc-name">{media.name}</span></div>
            : <img src={cmOpt(media.url, 900)} alt="" className="cm-media"/>}
          <button className="cm-media-x" onClick={() => setMedia(null)} aria-label="Remove attachment">✕</button>
        </div>
      )}
      {up > 0 && <div className="cm-progress" role="progressbar" aria-label="Uploading"><span style={{ width: up + "%" }}/></div>}

      {/* Single-row dock */}
      <div className="cm-dockrow">
        <div className="cm-dock-field">
          <label className="sr-only" htmlFor="cm-input-box">Message {active !== "all" ? "#" + chName : "the community"}</label>
          <textarea id="cm-input-box" ref={taRef} className="cm-input" rows={1} maxLength={2000} value={body} onChange={onBody} onKeyDown={onKey} onPaste={onPaste}
            aria-label={"Message " + (active !== "all" ? "#" + chName : "the community")}
            placeholder={poll ? "Ask the crew a question…" : ("Message " + (active !== "all" ? "#" + chName : "the crew") + "…")}/>
          {slashOpen && (
            <div className="cm-mention-menu cm-slash-menu" role="listbox" aria-label="Commands">
              {slashItems.map((s, i) => (
                <button key={s.cmd} role="option" aria-selected={i === 0} className={"cm-mention-item" + (i === 0 ? " is-active" : "")} onMouseDown={e => e.preventDefault()} onClick={() => runSlash(s.cmd)}>
                  <span className="cm-slash-ic" aria-hidden="true">{s.icon}</span>
                  <span><b>/{s.cmd}</b> <span className="cm-slash-hint">{s.hint}</span></span>
                </button>
              ))}
            </div>
          )}
          {ment && ment.items.length > 0 && (
            <div className="cm-mention-menu" role="listbox" aria-label="People to mention">
              {ment.items.map((pp, i) => (
                <button key={pp.handle} role="option" aria-selected={i === mentIdx} className={"cm-mention-item" + (i === mentIdx ? " is-active" : "")} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setMentIdx(i)} onClick={() => pickMention(pp.handle)}>
                  <span className={"cm-avatar cm-avatar-sm" + (pp.kind === "all" ? " cm-avatar-all" : "")} style={pp.kind === "all" ? {} : { background: cmColor(pp.handle), color: inkOn(cmColor(pp.handle)).ink }} aria-hidden="true">{pp.kind === "all" ? "📣" : cmInitial(pp.name || pp.handle)}</span>
                  <span><b>@{pp.handle}</b>{pp.name ? " · " + pp.name : ""}{pp.centre ? " · " + pp.centre : ""}{pp.kind === "mentor" ? <span className="cm-ment-badge">mentor</span> : null}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="cm-dock-actions">
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true"/>
          <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,application/pdf" onChange={pickDoc} className="sr-only" tabIndex={-1} aria-hidden="true"/>
          {iconBtn(cmIcon("image"), "Add a photo or video", openFile)}
          {iconBtn(cmIcon("doc"), "Attach a document", openDoc)}
          {iconBtn(cmIcon("poll"), "Create a poll", () => setPoll(p => p ? null : ["", ""]), poll ? " is-on" : "")}
          <div className="cm-emoji-wrap">
            {iconBtn(cmIcon("emoji"), "Emoji", () => setEmoji(v => !v), emoji ? " is-on" : "")}
            {emoji && (
              <div className="cm-emoji-pop" role="menu" aria-label="Emoji" onMouseLeave={() => setEmoji(false)}>
                {CM_EMOJI.map(em => <button key={em} type="button" className="cm-emoji-e" aria-label={"Insert " + em} onMouseDown={e => e.preventDefault()} onClick={() => cmInsertAt(taRef.current, em, setBody)}>{em}</button>)}
              </div>
            )}
          </div>
          {iconBtn("Aa", "Formatting", () => setShowFmt(v => !v), showFmt ? " is-on" : "")}
          <span className="cm-send-wrap">
            <button className="cm-send-btn" disabled={busy || up > 0 || !canPost} onClick={submit} aria-label={poll ? "Post poll" : "Send message"}>{busy ? "…" : poll ? "Ask" : "Send"}</button>
            <span className="cm-send-tip" role="tooltip">{enterToSend ? <><b>Enter</b> to send · <b>Shift + Enter</b> for a new line</> : <>Press <b>Send</b> to share · <b>Shift + Enter</b> for a new line</>}</span>
          </span>
        </div>
      </div>

      {/* Channel target — only when posting from an aggregate view. */}
      {(active === "all" || active === "bookmarks") && (
        <div className="cm-dock-target">
          <label className="sr-only" htmlFor="cm-chan-select">Post to channel</label>
          <span aria-hidden="true">Posting to</span>
          <select id="cm-chan-select" className="cm-chan-select" value={ch} onChange={e => setCh(e.target.value)}>
            {channels.filter(c => c.slug !== "bookmarks").map(c => <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>)}
          </select>
          {body.length > 1600 && <span className={"cm-count" + (remaining < 0 ? " over" : "")}>{remaining}</span>}
        </div>
      )}
    </div>
  );
}

/* ---- Shared message actions (react / bookmark / vote / share / report / delete) ---- */
function useCmActions(post, onPatch, onRemove) {
  const react = async (emoji) => {
    const prev = { reactions: post.reactions, myReaction: post.myReaction };
    const next = { ...(post.reactions || {}) };
    if (post.myReaction) next[post.myReaction] = Math.max(0, (next[post.myReaction] || 1) - 1);
    let mine = emoji;
    if (post.myReaction === emoji) { mine = ""; } else { next[emoji] = (next[emoji] || 0) + 1; }
    Object.keys(next).forEach(k => { if (!next[k]) delete next[k]; });
    onPatch(post.postId, { reactions: next, myReaction: mine });
    try { const r = await NGGApi.member.community.react(post.postId, emoji); onPatch(post.postId, { reactions: r.reactions, myReaction: r.myReaction }); }
    catch (_) { onPatch(post.postId, prev); }
  };
  const bookmark = async () => {
    const nv = !post.bookmarked; onPatch(post.postId, { bookmarked: nv });
    try { const r = await NGGApi.member.community.bookmark(post.postId); onPatch(post.postId, { bookmarked: r.bookmarked }); } catch (_) { onPatch(post.postId, { bookmarked: !nv }); }
  };
  const star = async () => {
    const nv = !post.starred; onPatch(post.postId, { starred: nv, stars: Math.max(0, (post.stars || 0) + (nv ? 1 : -1)) });
    try { const r = await NGGApi.member.community.star(post.postId); onPatch(post.postId, { starred: r.starred, stars: r.stars }); if (r.starred) toast.success("Genius Star awarded ⭐"); }
    catch (e) { onPatch(post.postId, { starred: !nv, stars: post.stars || 0 }); toast.error(e.message === "forbidden" ? "Only mentors can give a Genius Star." : "Couldn't award the star."); }
  };
  const vote = async (i) => {
    try { const r = await NGGApi.member.community.vote(post.postId, i); onPatch(post.postId, { poll: r.poll }); } catch (_) { toast.error("Couldn't record your vote."); }
  };
  const share = async () => {
    const txt = post.body || (post.channel.name + " on NGG Community");
    try { if (navigator.share) await navigator.share({ title: "NGG Community", text: txt }); else { await navigator.clipboard.writeText(txt); toast.success("Copied to clipboard"); } } catch (_) {}
  };
  const report = async () => {
    try { await NGGApi.member.community.report("post", post.postId); toast.success("Reported to mentors. Thank you for keeping this space safe."); }
    catch (_) { toast.error("Couldn't report — try again."); }
  };
  const del = async () => {
    if (!(await dialog.confirm({ title: "Delete this message?", body: "This removes it for everyone. This can't be undone.", cta: "Delete" }))) return;
    try { await NGGApi.member.community.remove("post", post.postId); onRemove && onRemove(post.postId); toast.success("Deleted."); }
    catch (_) { toast.error("Couldn't delete — try again."); }
  };
  return { react, bookmark, vote, star, share, report, del };
}

/* ---- Genius Star badge/affordance (NGG-native mentor kudos) ---- */
function CmStar({ post, onStar }) {
  if (!post.stars && !post.canStar) return null;
  const cls = "cm-star" + (post.stars ? " has" : "") + (post.starred ? " mine" : "");
  const label = post.stars ? ("⭐ " + post.stars + (post.canStar ? "" : (post.stars === 1 ? " Genius Star" : " Genius Stars"))) : "⭐ Genius Star";
  if (post.canStar) return <button className={cls} onClick={onStar} title={post.starred ? "Remove your Genius Star" : "Give a Genius Star"}>{label}</button>;
  return <span className={cls} title="Recognised by a mentor">{label}</span>;
}

const CM_REACTIONS = ["👏", "❤️", "🔥", "💡", "🎉", "🙌"];

/* ---- Message body (poll + media, shared by row + thread root) ---- */
function CmBodyBlock({ post, onVote }) {
  return (
    <>
      {post.moderationNote && <div className="cm-modnote">{post.moderationNote}</div>}
      {post.body && <div className={"cm-msg-text" + (post.kind === "poll" ? " cm-poll-q" : "")}><NggMarkdown text={post.body}/></div>}
      {post.kind === "poll" && post.poll && (
        <div className="cm-poll">
          {post.poll.options.map((o, i) => {
            const voted = post.poll.myVote >= 0;
            const mine = post.poll.myVote === i;
            return (
              <button key={i} className={"cm-poll-row" + (voted ? " voted" : "") + (mine ? " mine" : "")} onClick={() => !voted && onVote(i)} disabled={voted}>
                {voted && <span className="cm-poll-bar" style={{ width: o.pct + "%" }}/>}
                <span className="cm-poll-text">{mine ? "✓ " : ""}{o.text}</span>
                {voted && <span className="cm-poll-pct">{o.pct}%</span>}
              </button>
            );
          })}
          <div className="cm-poll-total">{post.poll.totalVotes} vote{post.poll.totalVotes === 1 ? "" : "s"}{post.poll.myVote < 0 ? " · tap to vote" : ""}</div>
        </div>
      )}
      {post.mediaType === "image" && post.mediaUrl && <div className="cm-msg-media"><img src={cmOpt(post.mediaUrl, 1000)} alt={post.altText || ""} loading="lazy"/></div>}
      {post.mediaType === "video" && post.mediaUrl && <div className="cm-msg-media"><NggVideo src={cmOpt(post.mediaUrl, 1280)} poster={post.mediaPoster || cmPoster(post.mediaUrl)}/></div>}
      {/* A document either previews in place or is offered as a card — never
          both, and never neither. Which one is decided by the format the server
          RECORDED, not by pattern-matching the url: that test asked whether a
          filename ended `.pdf`, and it answered "no" for every PDF the upload
          path had quietly turned into a PNG, so the viewer never appeared. */}
      {post.mediaType === "doc" && post.mediaUrl && (
        cmIsPdf(post) ? (
          <div className="cm-msg-media">
            <NggPdf src={post.mediaUrl} name={post.altText || "Document"}
                    pages={post.mediaPages || 0} bytes={post.mediaBytes || 0}/>
          </div>
        ) : (
          <a className="cm-doc-card" href={post.mediaUrl} target="_blank" rel="noopener noreferrer">
            <span className="cm-doc-card-ic" aria-hidden="true">📄</span>
            <span className="cm-doc-card-body">
              <span className="cm-doc-card-name">{post.altText || "Document"}</span>
              <span className="cm-doc-card-sub">
                {cmDocExt(post)}{post.mediaBytes ? " · " + nggFmtBytes(post.mediaBytes) : ""} · opens in a new tab
              </span>
            </span>
            <span className="cm-doc-card-dl" aria-hidden="true">↗</span>
          </a>
        )
      )}
      {/* A shared YouTube link plays in place. Everything else stays a card. */}
      {post.linkPreview && post.linkPreview.kind === "youtube" && post.linkPreview.youtubeId && (
        <div className="cm-msg-media">
          <NggYouTube id={post.linkPreview.youtubeId} thumb={post.linkPreview.image} title={post.linkPreview.title}/>
        </div>
      )}
      {post.linkPreview && post.linkPreview.kind !== "youtube" && post.linkPreview.title && (
        <a className="cm-link-card" href={post.linkPreview.url} target="_blank" rel="noopener noreferrer">
          {post.linkPreview.image && <span className="cm-link-thumb" style={{ backgroundImage: "url(" + post.linkPreview.image + ")" }} aria-hidden="true"/>}
          <span className="cm-link-body">
            {post.linkPreview.site && <span className="cm-link-site">{post.linkPreview.site}</span>}
            <span className="cm-link-title">{post.linkPreview.title}</span>
            {post.linkPreview.description && <span className="cm-link-desc">{post.linkPreview.description}</span>}
          </span>
        </a>
      )}
    </>
  );
}
/* What format is this attachment, really?
 *
 * `mediaFormat` is what the server recorded from the upload result; the url is
 * consulted only for posts written before that column existed. Deriving it from
 * the url alone is what made a converted document look like a legitimate one. */
function cmDocFormat(urlOrName) {
  const path = String(urlOrName || "").split(/[?#]/)[0];
  const m = /\.([a-z0-9]{1,5})$/i.exec(path);
  return m ? m[1].toLowerCase() : "";
}
function cmPostFormat(post) {
  return String((post && post.mediaFormat) || "").toLowerCase() || cmDocFormat(post && post.mediaUrl);
}
function cmIsPdf(post) { return cmPostFormat(post) === "pdf"; }
// File extension label for a doc card.
function cmDocExt(post) {
  return (cmPostFormat(post) || "file").toUpperCase();
}

/* ---- Reaction chips (click to toggle) ---- */
function CmReactChips({ post, onReact }) {
  const entries = Object.entries(post.reactions || {}).filter(([, n]) => n > 0);
  if (!entries.length) return null;
  return (
    <div className="cm-chips" role="group" aria-label="Reactions">
      {entries.map(([e, n]) => (
        <button key={e} className={"cm-chip-react" + (post.myReaction === e ? " mine" : "")} aria-pressed={post.myReaction === e} aria-label={n + " " + e + " reaction" + (n === 1 ? "" : "s") + (post.myReaction === e ? ", including yours" : "")} onClick={() => onReact(e)}>
          <span aria-hidden="true">{e}</span><b aria-hidden="true">{n}</b>
        </button>
      ))}
    </div>
  );
}

/* ---- One message row in the stream (Slack-style, grouped by author) ---- */

/* ---- Card post (All activity / Saved / search — media-forward feed) ---- */

/* ---- Channel members rail (chat view) ---- */

/* ---- Thread pane (root message + replies + reply composer) ---- */
function CmThread({ post, me, channels, onClose, onPatch, onRemove }) {
  const [comments, setComments] = React.useState(null);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const act = useCmActions(post, onPatch, onRemove);
  const endRef = React.useRef(null);
  React.useEffect(() => {
    let a = true; setComments(null);
    NGGApi.member.community.comments(post.postId).then(r => { if (a) setComments(r.comments || []); }).catch(() => { if (a) setComments([]); });
    return () => { a = false; };
  }, [post.postId]);
  React.useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [comments]);
  // Focus the pane on open + close on Escape (dialog semantics).
  const paneRef = React.useRef(null);
  React.useEffect(() => {
    const el = paneRef.current; if (el) { const c = el.querySelector(".cm-thread-x"); if (c) try { c.focus(); } catch (_) {} }
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const send = async () => {
    if (!body.trim()) return; setBusy(true);
    try {
      const r = await NGGApi.member.community.comment(post.postId, body.trim());
      setBody(""); setComments(c => (c || []).concat(r.comment));
      if (r.queued) toast.success("Reply in review — a mentor will approve it.");
      else onPatch(post.postId, { commentCount: (post.commentCount || 0) + 1 });
    } catch (e) { toast.error(e.detail || "Couldn't reply — try again."); } finally { setBusy(false); }
  };
  return (
    <aside className="cm-thread" ref={paneRef} role="dialog" aria-label={"Thread in " + post.channel.name}>
      <div className="cm-thread-head">
        <div><span className="cm-thread-title" role="heading" aria-level={2}>Thread</span><span className="cm-thread-chan" style={{ color: post.channel.color }}>{post.channel.icon} {post.channel.name}</span></div>
        <button className="cm-thread-x" onClick={onClose} aria-label="Close thread">✕</button>
      </div>
      <div className="cm-thread-body">
        <div className="cm-thread-root">
          <div className="cm-msg-gutter">{cmAvatar(post.author.name, post.author.name + post.author.centre, post.author.photo, "", cmRoleOf(post))}</div>
          <div className="cm-msg-main">
            <div className="cm-msg-head">
              <span className="cm-msg-author">{post.author.name}</span>
              {post.author.isMe && <span className="cm-you">you</span>}
              <span className="cm-msg-time">{cmAgo(post.createdAt)}</span>
            </div>
            <CmBodyBlock post={post} onVote={act.vote}/>
            <CmReactChips post={post} onReact={act.react}/>
          </div>
        </div>
        <div className="cm-thread-count">{comments === null ? "…" : (comments.length + " repl" + (comments.length === 1 ? "y" : "ies"))}</div>
        <div className="cm-thread-replies">
          {comments === null ? <div className="cm-comment-load">Loading…</div> : comments.map(c => (
            <div key={c.commentId} className={"cm-reply" + (c.status !== "published" ? " is-pending" : "")}>
              {cmAvatar(c.name, c.name, c.photo, "cm-avatar-sm")}
              <div className="cm-reply-body">
                <div className="cm-reply-head"><b>{c.name}</b> <span className="cm-reply-ago">{cmAgo(c.createdAt)}</span></div>
                <div>{cmBody(c.body)}</div>
                {c.note && <div className="cm-comment-note">{c.note}</div>}
              </div>
            </div>
          ))}
          <div ref={endRef}/>
        </div>
      </div>
      <div className="cm-thread-compose">
        <textarea className="cm-comment-input" value={body} maxLength={1000} rows={1} placeholder="Reply…" onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}/>
        <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()} onClick={send}>{busy ? "…" : "Reply"}</button>
      </div>
    </aside>
  );
}

/* ---- AI digest modal ---- */

/* ── The Programme Journal ───────────────────────────────────────────────────
 *
 * The community holds conversation — fast, and gone. This holds the record:
 * the advice that was given, the contribution somebody made, the issue that was
 * raised and how it resolved. Before this, that history lived in WhatsApp
 * threads and in people's heads, which means it left when they did.
 *
 * Memories comes first on purpose. A journal nobody re-reads is an archive; the
 * point of resurfacing is to put last term's decision in front of the person
 * about to make the same one again.
 *
 * Everything here is filtered server-side by the viewer's visibility level, so
 * a member simply never receives a staff-only entry — the UI is not what is
 * keeping it back.
 */
const PJ_KINDS = {
  advice:       { label: "Advice",       icon: "💡", chip: "chip-gold" },
  contribution: { label: "Contribution", icon: "🎁", chip: "chip-lime" },
  issue:        { label: "Issue",        icon: "⚠️", chip: "chip-crimson" },
  milestone:    { label: "Milestone",    icon: "🏅", chip: "chip-navy" },
  decision:     { label: "Decision",     icon: "⚖️", chip: "chip-navy" },
  note:         { label: "Note",         icon: "📝", chip: "" },
};
const PJ_STATUS = { open: "Open", in_progress: "In progress", resolved: "Resolved", archived: "Archived" };
const PJ_VIS = {
  staff:     { label: "Staff only", icon: "🔒", hint: "Only staff can read this. The safe default." },
  community: { label: "Community",  icon: "👥", hint: "Every signed-in member can read this." },
  public:    { label: "Public",     icon: "🌍", hint: "Anyone with the link can read this." },
};

function pjDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function CmJournalCard({ e, canAuthor, onEdit, onVisibility, onShare, compact }) {
  const k = PJ_KINDS[e.kind] || PJ_KINDS.note;
  const vis = PJ_VIS[e.visibility] || PJ_VIS.staff;
  return (
    <article className="cm-pj-card" style={compact ? { minWidth: 232, maxWidth: 232 } : undefined}>
      <header className="cm-pj-head">
        <span className={"chip " + k.chip}>{k.icon} {k.label}</span>
        {e.kind === "issue" && <span className={"chip " + (e.status === "resolved" ? "chip-lime" : "status-draft")}>{PJ_STATUS[e.status] || e.status}</span>}
        {/* Who can see it, always on the card. A visibility you have to open a
            menu to discover is a visibility people get wrong. */}
        <span className="chip status-archived" title={vis.hint}>{vis.icon} {vis.label}</span>
      </header>
      <h4 className="cm-pj-title">{e.title}</h4>
      {/* Photographs sit above the prose: on a card in a feed, the picture is
          what makes somebody stop and read the paragraph. The first is shown
          large and the rest as a strip, so a twelve-photo entry does not push
          everything else off the screen. */}
      {(e.media || []).length > 0 && (
        <div className={"cm-pj-shots" + (compact ? " is-compact" : "")}>
          {(e.media || []).slice(0, compact ? 1 : 5).map((m, i) => (
            <figure key={m.url + i} className={"cm-pj-shot" + (i === 0 ? " is-lead" : "")}>
              {m.type === "video"
                ? <video src={cmOpt(m.url, 900)} poster={m.poster || cmPoster(m.url)} controls preload="metadata"/>
                : <img src={cmOpt(m.url, i === 0 ? 900 : 320)} alt={m.alt || ""} loading="lazy"/>}
              {!compact && m.caption && <figcaption>{m.caption}</figcaption>}
            </figure>
          ))}
          {(e.media || []).length > (compact ? 1 : 5) &&
            <span className="cm-pj-more">+{(e.media || []).length - (compact ? 1 : 5)} more</span>}
        </div>
      )}
      {!compact && e.body && <p className="cm-pj-body">{e.body}</p>}
      <div className="cm-pj-meta">
        {pjDate(e.occurredAt)}{e.authorName ? " · " + e.authorName : ""}
        {/* An institutional record that presents a late write-up as
            contemporaneous is quietly misleading, and this is the record a
            funder or a safeguarding review reads. Say it on the card. */}
        {e.recordedAfterDays > 0 && <span className="cm-pj-late" title={"Written up on " + pjDate(e.createdAt)}>
          {" · recorded " + (e.recordedAfterDays === 1 ? "a day" : e.recordedAfterDays + " days") + " later"}
        </span>}
      </div>
      {(e.people || []).length > 0 && (
        <div className="cm-pj-people">
          {e.people.map(p => (
            <span key={p.personId} className="cm-pj-person" title={p.role}>
              {p.name || p.personId}<i>{p.role}</i>
            </span>
          ))}
        </div>
      )}
      {canAuthor && !compact && (
        <div className="cm-pj-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(e)}>Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onVisibility(e)}>Who can see it</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onShare(e)}>Share link</button>
        </div>
      )}
    </article>
  );
}

function CmJournalEditor({ entry, onClose, onSaved }) {
  const [f, setF] = React.useState(() => ({
    entryId: (entry && entry.entryId) || "",
    title: (entry && entry.title) || "",
    body: (entry && entry.body) || "",
    kind: (entry && entry.kind) || "note",
    status: (entry && entry.status) || "open",
    occurredAt: (entry && entry.occurredAt) || new Date().toISOString(),
    people: (entry && entry.people) || [],
    /* Always sent, even when empty. The server only touches attachments when
       the payload mentions them, and an editor that omitted the key was how
       "edit the title" used to mean "delete the photographs". */
    media: (entry && entry.media) || [],
  }));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [who, setWho] = React.useState("");
  const [up, setUp] = React.useState(0);
  const fileRef = React.useRef(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  /* Today, as the date input wants it. Used as `max`: the journal records what
     happened, and nothing has happened tomorrow yet. */
  const todayStr = new Date().toISOString().slice(0, 10);
  const occurredStr = String(f.occurredAt || "").slice(0, 10);
  const daysLate = (() => {
    if (!occurredStr) return 0;
    const d = Math.floor((Date.parse(todayStr) - Date.parse(occurredStr)) / 86400000);
    return d > 0 ? d : 0;
  })();

  const addFiles = async (list) => {
    const files = Array.from(list || []).filter(x => /^image\/|^video\//.test(x.type));
    if (!files.length) return;
    if (f.media.length + files.length > 12) { toast.error("Twelve attachments is the limit for one entry."); return; }
    setUp(1);
    for (const file of files) {
      const mb = file.size / 1024 / 1024;
      const isVid = /^video\//.test(file.type);
      if (isVid && mb > CM_VIDEO_MAX_MB) { toast.error(file.name + " is too large for a clip."); continue; }
      if (!isVid && mb > CM_IMAGE_MAX_MB) { toast.error(file.name + " is too large."); continue; }
      try {
        const r = await NGGApi.uploadFile(file, "journal", pct => setUp(Math.max(1, pct)));
        setF(x => ({ ...x, media: x.media.concat([{
          type: (r.resourceType === "video" || isVid) ? "video" : "image",
          url: r.url, poster: isVid ? cmPoster(r.url) : "", alt: "", caption: "",
        }]) }));
      } catch (_) { toast.error("Couldn't upload " + (file.name || "that file") + "."); }
    }
    setUp(0);
  };
  const setMediaField = (i, k, v) => setF(x => ({ ...x, media: x.media.map((m, j) => j === i ? { ...m, [k]: v } : m) }));

  const addPerson = () => {
    const name = who.trim();
    if (!name) return;
    // Free text with a generated key: tagging somebody who has no member record
    // (a visiting sponsor, a parent) has to be possible or the field goes unused.
    set("people", [...f.people, { personId: "free:" + name.toLowerCase().replace(/\s+/g, "-"), name, role: "involved" }]);
    setWho("");
  };

  const save = async () => {
    if (!f.title.trim()) { setErr("Give it a title — that is what makes it findable later."); return; }
    setBusy(true); setErr("");
    try { const r = await NGGApi.member.programJournal.save(f); onSaved(r.entry); }
    catch (e) {
      const d = e.data || {};
      const code = d.error || e.code;
      setErr(code === "title_required" ? "A title is required."
        : code === "bad_kind" ? "Pick one of the listed kinds."
        : code === "forbidden" ? "Your account isn't set up to write journal entries."
        : code === "date_in_future" ? "That date hasn't happened yet — the journal records what did."
        : code === "date_too_old" ? "That date is before the programme existed — check the year."
        : code === "bad_date" ? "That date didn't make sense."
        : (e.code || e.message || "Couldn't save."));
      setBusy(false);
    }
  };

  return (
    <div className="cm-pj-modal" role="dialog" aria-modal="true" aria-label={f.entryId ? "Edit entry" : "New entry"}>
      <div className="cm-pj-sheet">
        <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>{f.entryId ? "Edit entry" : "New journal entry"}</h3>
        <p className="cm-pj-hint">
          New entries are <b>staff only</b> until you widen them. Nothing here reaches families or the public by default.
        </p>
        <label className="cm-pj-lab">What happened
          <input className="cm-pj-in" value={f.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Board advised moving intake a week earlier"/>
        </label>
        <div className="cm-pj-row">
          <label className="cm-pj-lab">Kind
            <select className="cm-pj-in" value={f.kind} onChange={e => set("kind", e.target.value)}>
              {Object.keys(PJ_KINDS).map(k => <option key={k} value={k}>{PJ_KINDS[k].icon + " " + PJ_KINDS[k].label}</option>)}
            </select>
          </label>
          {/* Status only matters for an issue — an "advice" with a status is
              noise, and a form full of irrelevant fields does not get filled. */}
          {f.kind === "issue" && <label className="cm-pj-lab">Status
            <select className="cm-pj-in" value={f.status} onChange={e => set("status", e.target.value)}>
              {Object.keys(PJ_STATUS).map(k => <option key={k} value={k}>{PJ_STATUS[k]}</option>)}
            </select>
          </label>}
          {/* Backdating is the normal case, not an edge case: the meeting was on
              Tuesday and the write-up happens on Friday. `max` stops the future,
              which is the one direction that makes no sense for a record of what
              happened. */}
          <label className="cm-pj-lab">When it happened
            <input className="cm-pj-in" type="date" value={occurredStr} max={todayStr} min="2015-01-01"
              onChange={e => set("occurredAt", e.target.value ? e.target.value : todayStr)}/>
          </label>
        </div>
        {daysLate > 0 && <p className="cm-pj-hint" style={{ marginTop: -4 }}>
          Recorded {daysLate === 1 ? "a day" : daysLate + " days"} after the event — the entry will say so,
          so the record stays honest about when it was written.
        </p>}
        <label className="cm-pj-lab">Detail
          <textarea className="cm-pj-in" rows={5} value={f.body} onChange={e => set("body", e.target.value)}
            placeholder="What was said, what was decided, what changed as a result."/>
        </label>
        {/* Photographs. The thing people most want to attach to "what happened"
            is a picture of it, and an entry with none is the reason this feature
            went unused. Alt text is asked for per image because these entries
            are read with screen readers too. */}
        <div className="cm-pj-lab">Photos and clips
          <div className="cm-pj-media">
            {f.media.map((m, i) => (
              <div key={m.url + i} className="cm-pj-mitem">
                {m.type === "video"
                  ? <video src={cmOpt(m.url, 640)} poster={m.poster} controls preload="metadata"/>
                  : <img src={cmOpt(m.url, 640)} alt={m.alt || ""}/>}
                <input className="cm-pj-in" value={m.caption} placeholder="Caption (optional)"
                  onChange={e => setMediaField(i, "caption", e.target.value)} aria-label={"Caption for attachment " + (i + 1)}/>
                <input className="cm-pj-in" value={m.alt} placeholder="Describe it for a screen reader"
                  onChange={e => setMediaField(i, "alt", e.target.value)} aria-label={"Alt text for attachment " + (i + 1)}/>
                <button type="button" className="cm-pj-mx" aria-label={"Remove attachment " + (i + 1)}
                  onClick={() => set("media", f.media.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
            onChange={e => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}/>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!up}
            onClick={() => fileRef.current && fileRef.current.click()}>
            {up ? "Uploading… " + up + "%" : (f.media.length ? "Add another" : "Add a photo or clip")}
          </button>
        </div>
        <label className="cm-pj-lab">Who was involved
          <div style={{ display: "flex", gap: 6 }}>
            <input className="cm-pj-in" value={who} onChange={e => setWho(e.target.value)} placeholder="Name"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }}/>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addPerson}>Add</button>
          </div>
        </label>
        {f.people.length > 0 && <div className="cm-pj-people" style={{ marginBottom: 10 }}>
          {f.people.map((p, i) => (
            <span key={p.personId + i} className="cm-pj-person">
              {p.name}
              <input value={p.role} onChange={e => set("people", f.people.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                aria-label={"Role for " + p.name}
                style={{ width: 74, marginLeft: 5, font: "inherit", fontSize: 11, border: "1px solid rgba(0,0,0,.14)", borderRadius: 6, padding: "1px 4px" }}/>
              <button type="button" onClick={() => set("people", f.people.filter((_, j) => j !== i))} aria-label={"Remove " + p.name}
                style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer", color: "#a11" }}>×</button>
            </span>
          ))}
        </div>}
        {err && <p style={{ color: "#c0341a", fontSize: 13, margin: "0 0 8px" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save entry"}</button>
        </div>
      </div>
    </div>
  );
}

function CmProgramJournal({ auth }) {
  const [feed, setFeed] = React.useState(null);
  const [mem, setMem] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState(null);

  const load = React.useCallback(() => {
    NGGApi.member.programJournal.feed({ kind, q })
      .then(r => { setFeed(r); setErr(""); })
      .catch(e => setErr(e.code || e.message || "Couldn't load the journal."));
    NGGApi.member.programJournal.memories().then(r => setMem(r.collections || [])).catch(() => setMem([]));
  }, [kind, q]);
  React.useEffect(() => { load(); }, [load]);

  const canAuthor = !!(feed && feed.canAuthor);

  const onVisibility = async (e) => {
    const order = ["staff", "community", "public"];
    const next = await dialog.prompt({
      title: "Who can see this entry?",
      body: "staff — only staff.\ncommunity — every signed-in member.\npublic — anyone with the share link.\n\n"
          + "It is " + (PJ_VIS[e.visibility] || {}).label + " now. Narrowing it immediately stops every share link that has already been sent from working.",
      cta: "Save", value: e.visibility, placeholder: "staff | community | public", required: true,
    });
    if (next === null) return;
    const v = String(next).trim().toLowerCase();
    if (order.indexOf(v) === -1) { toast.error("Use staff, community or public."); return; }
    try {
      const r = await NGGApi.member.programJournal.visibility(e.entryId, v);
      toast.success("Now visible to: " + v + (r.shareLive ? " — share links are live." : " — share links will not open."));
      load();
    } catch (x) { toast.error(x.code || x.message); }
  };

  const onShare = async (e) => {
    try {
      const r = await NGGApi.member.programJournal.share(e.entryId);
      if (navigator.clipboard && r.url) navigator.clipboard.writeText(r.url);
      // Say plainly when the link will not open yet, rather than handing over a URL that 404s.
      toast[r.live ? "success" : "info"](r.live ? "Link copied." : (r.note || "Link created, but the entry is not public yet."));
      load();
    } catch (x) { toast.error(x.code || x.message); }
  };

  return (
    <div className="cm-pj">
      <header className="cm-pj-intro">
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Programme journal</h2>
        <p className="cm-pj-hint" style={{ margin: 0 }}>
          The record of what this programme actually did — advice given, contributions made, issues raised and how they
          resolved, and who was involved. Channels are for talking; this is what remains.
        </p>
        {canAuthor && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }}
          onClick={() => setEditing({})}>＋ New entry</button>}
      </header>

      {err && <div className="cm-pj-empty" style={{ color: "#c0341a" }}>{err}</div>}

      {/* Memories first: a journal nobody re-reads is an archive. */}
      {mem && mem.length > 0 && (
        <section className="cm-pj-mem">
          {mem.map(c => (
            <div key={c.key} className="cm-pj-memrow">
              <div className="cm-pj-memhead">
                <b>{c.title}</b><span>{c.subtitle}</span>
              </div>
              <div className="cm-pj-memscroll">
                {c.entries.map(e => <CmJournalCard key={e.entryId} e={e} compact canAuthor={false}
                  onEdit={() => {}} onVisibility={() => {}} onShare={() => {}}/>)}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="cm-pj-filters">
        <input className="cm-pj-in" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the record…" style={{ maxWidth: 240 }}/>
        <button className={"btn btn-sm " + (kind === "" ? "btn-primary" : "btn-ghost")} onClick={() => setKind("")}>Everything</button>
        {Object.keys(PJ_KINDS).map(k => (
          <button key={k} className={"btn btn-sm " + (kind === k ? "btn-primary" : "btn-ghost")}
            onClick={() => setKind(kind === k ? "" : k)}>{PJ_KINDS[k].icon} {PJ_KINDS[k].label}</button>
        ))}
      </div>

      {!feed ? <div className="cm-pj-empty">Loading the record…</div>
        : feed.entries.length === 0
          ? <div className="cm-pj-empty">
              {q || kind ? "Nothing in the record matches that." :
                canAuthor ? "Nothing written yet. The first entry is usually the decision somebody will ask about in three months."
                          : "Nothing in the journal you can see yet."}
            </div>
          : <div className="cm-pj-list">
              {feed.entries.map(e => (
                <CmJournalCard key={e.entryId} e={e} canAuthor={canAuthor}
                  onEdit={setEditing} onVisibility={onVisibility} onShare={onShare}/>
              ))}
            </div>}

      {editing && <CmJournalEditor entry={editing.entryId ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); toast.success("Saved to the record."); load(); }}/>}
    </div>
  );
}

/* A single shared journal entry, opened from a link — /journal-entry?t=…
 *
 * Resolves only while the entry is public. Narrowing it back to staff or
 * community makes this page stop working for every link already sent, which is
 * the point: a share link is a credential, and one you cannot withdraw is not
 * one. A refused token and a missing token are answered identically, because
 * "this exists but you may not see it" confirms the entry exists. */
function JournalEntryPage() {
  const t = new URLSearchParams(window.location.search).get("t") || "";
  const [entry, setEntry] = React.useState(null);
  const [state, setState] = React.useState("loading");
  React.useEffect(() => {
    if (!t) { setState("gone"); return; }
    NGGApi.public.journalEntry(t)
      .then(r => { setEntry(r.entry); setState("ok"); })
      .catch(() => setState("gone"));
  }, [t]);

  const wrap = (ch) => (
    <div style={{ minHeight: "100vh", background: "#101a33", color: "#eef2fb", padding: "34px 18px 70px",
                  fontFamily: "var(--font-body, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>{ch}</div>
    </div>
  );
  if (state === "loading") return wrap(<div style={{ textAlign: "center", padding: "80px 0" }}><div className="dash-spinner"/></div>);
  if (state === "gone") return wrap(
    <div style={{ textAlign: "center", padding: "70px 0" }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: "#ffce54" }}>NEXT GENERATION GENIUS</div>
      <h1 style={{ fontSize: 23, margin: "10px 0 0", fontWeight: 800 }}>This link isn't open</h1>
      <p style={{ color: "rgba(230,238,255,.62)", marginTop: 10, fontSize: 14.5, lineHeight: 1.6 }}>
        Shared journal entries can be closed again by the programme at any time, and this one is closed.
        Ask whoever sent it to you for an up-to-date link.
      </p>
    </div>
  );

  const k = PJ_KINDS[entry.kind] || PJ_KINDS.note;
  return wrap(
    <article>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: "#ffce54" }}>
        FROM THE PROGRAMME JOURNAL
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: "rgba(230,238,255,.7)" }}>
        {k.icon} {k.label}{entry.occurredAt ? " · " + pjDate(entry.occurredAt) : ""}
      </div>
      <h1 style={{ fontSize: "clamp(24px,4.4vw,34px)", lineHeight: 1.12, margin: "8px 0 14px", fontWeight: 800 }}>{entry.title}</h1>
      {entry.body && <p style={{ fontSize: 15.5, lineHeight: 1.72, color: "rgba(230,238,255,.86)", whiteSpace: "pre-wrap" }}>{entry.body}</p>}
      {(entry.people || []).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(230,238,255,.5)", fontWeight: 700 }}>Who was involved</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {entry.people.map(p => (
              <span key={p.personId} style={{ fontSize: 12.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
                background: "rgba(255,255,255,.09)" }}>{p.name || p.personId} <i style={{ fontStyle: "normal", opacity: .6, fontSize: 11 }}>{p.role}</i></span>
            ))}
          </div>
        </div>
      )}
      <p style={{ marginTop: 28, fontSize: 12, color: "rgba(230,238,255,.45)", lineHeight: 1.6 }}>
        Shared from the Next Generation Genius programme journal{entry.authorName ? " · recorded by " + entry.authorName : ""}.
      </p>
    </article>
  );
}

Object.assign(window, { SummerPage, ClubPage, BadgePin, CommunityPage, CmStudentSignIn, CmProgramJournal, JournalEntryPage });
