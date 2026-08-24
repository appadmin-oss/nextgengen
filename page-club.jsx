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
                        LVL {featured.level} · {fmtNum(featured.xp)} XP · ★ {featured.stars} · {featured.streak}-day streak
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
                      <span className="chip chip-gold" style={{fontSize:11, padding:"3px 8px"}}>{fmtNum(m.xp)} XP</span>
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
                        <div style={{fontWeight:700, fontSize:14, fontFamily:"var(--font-mono)"}}>{fmtNum(m.xp)}</div>
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
/* A feed post described as the Files screen describes a file, so one photo
   viewer can serve both. The two shapes were never going to converge on their
   own — one comes from community_feed(), the other from
   community_channel_files() — and duplicating the viewer to bridge them is how
   a product ends up with two answers to "what does tapping a photo do". */
function cmPhotoOf(post) {
  const a = post.author || {};
  return {
    postId: post.postId, kind: "image", url: post.mediaUrl,
    name: post.altText || "Photo",
    note: post.altText || "",
    bytes: post.mediaBytes || 0,
    createdAt: post.createdAt || "",
    author: { name: a.name || "", centre: a.centre || "", isMe: !!a.isMe, photo: a.photo || "" },
  };
}
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
/* Smooth scrolling is animation, and the bundle is explicit that every duration
   collapses under prefers-reduced-motion. A CSS rule cannot reach these — the
   behaviour is an argument to scrollTo — so the check lives here, using the
   same media query the rest of the app already asks. */
function cmScrollBehavior() {
  return reducedMotion() ? "auto" : "smooth";
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
  /* `author.staff` — NOT `canStar`, which is what the VIEWER may do. Reading
     the viewer's capability as the author's role turned every avatar in the
     feed mentor-green the moment a mentor was the one looking. */
  return post.author.staff ? "mentor" : "";
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
      {err && <div role="alert" className="cm-stu-err">{err}</div>}
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
    { value: stats && stats.communityMembers > 0 ? fmtNum(stats.communityMembers)
        : (stats && stats.activeMembers > 0 ? fmtNum(stats.activeMembers) : (all.length ? String(all.length) : "—")),
      label: "In the community", color: "#fff",
      note: stats && (stats.communityStudents || stats.communityInstructors)
        ? [stats.communityStudents ? stats.communityStudents + " students" : "", stats.communityInstructors ? stats.communityInstructors + " instructors" : ""].filter(Boolean).join(" · ")
        : "" },
    { value: stats && stats.missionsVerified > 0 ? fmtNum(stats.missionsVerified) : "—", label: "Missions verified", color: "#fff" },
    { value: stats && stats.mentors > 0 ? String(stats.mentors) : "—", label: "Volunteer mentors", color: "#d0ff3a" },
    { value: stats && stats.centres > 0 ? String(stats.centres).padStart(2, "0") : (centres.length ? String(centres.length).padStart(2, "0") : "—"), label: "Centres live", color: "#f5b026" },
  ];
  const tabBtn = (k, label, icon) => (
    // aria-pressed, because which tab is current was signalled by colour and a
    // gold underline alone — neither of which reaches a screen reader.
    <button key={k} onClick={() => { setView(k); setPanel(null); }} aria-pressed={view === k}
      style={{ fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, padding: "12px 6px", border: "none", background: "none", cursor: "pointer", borderBottom: "2.5px solid " + (view === k ? "var(--gold-500)" : "transparent"), color: view === k ? "#fff" : "rgba(255,255,255,0.72)", display: "inline-flex", alignItems: "center", gap: 7 }}>
      <i className={"ph " + icon} aria-hidden="true"/>{label}
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
              {/* A placeholder is not a label: it disappears the moment anyone
                  types, and a screen reader announced this as an unnamed edit
                  field. Every input in the signed-in app already does this. */}
              <label className="sr-only" htmlFor="cm-pub-search">Search members by name or centre</label>
              <i className="ph ph-magnifying-glass" aria-hidden="true" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.72)", fontSize: 15 }}/>
              <input id="cm-pub-search" type="search" value={q} onChange={e => { setQ(e.target.value); if (e.target.value) setView("members"); }} placeholder="Search members…" style={{ width: "100%", fontFamily: "inherit", fontSize: 13, padding: "9px 12px 9px 34px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.08)", color: "#fff", outline: "none" }}/>
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
                {/* Was rgba(255,255,255,0.42): 4.09:1 over the hero's darkest
                    stop at 10px, under the 4.5:1 floor, and worse over the
                    lighter stops. 0.62 clears it across the whole gradient. */}
                {k.note && <div className="mono" style={{ fontSize: 10.5, color: "rgba(255,255,255,0.62)", marginTop: 3 }}>{k.note}</div>}
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
                    <span className="mono" style={{ fontSize: 12.5, color: "var(--gold-600,#a07400)", fontWeight: 600 }}>{fmtNum(m.xp || 0)} XP</span>
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
              <span className="mono" style={{ fontSize: 11.5, background: "var(--cream-50,#faf6ec)", border: "1px solid var(--cream-200,#e8dec6)", borderRadius: 999, padding: "5px 12px" }}>{fmtNum(panel.xp || 0)} XP</span>
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
  if (name === "files")  return wrap(<path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...P}/>);
  if (name === "bookmark") return wrap(<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" {...P}/>);
  if (name === "info")   return wrap(<><circle cx="12" cy="12" r="9" {...P}/><path d="M12 11v5" {...P}/><path d="M12 7.6v.6" {...P}/></>);
  /* Two glyphs, not one rotated: "make this bigger" and "put it back" are
     different promises, and a child should not have to remember which state
     the same arrow means. */
  if (name === "expand") return wrap(<><path d="M14 4h6v6" {...P}/><path d="M20 4l-7 7" {...P}/><path d="M10 20H4v-6" {...P}/><path d="M4 20l7-7" {...P}/></>);
  if (name === "shrink") return wrap(<><path d="M20 4l-7 7" {...P}/><path d="M13 11h6M13 11V5" {...P}/><path d="M4 20l7-7" {...P}/><path d="M11 13H5m6 0v6" {...P}/></>);
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

/* ── The crisis reply ─────────────────────────────────────────────────────
   When the screen catches a child writing about harming themselves, the server
   answers with a helpline. That answer used to arrive as toast.error() — a red
   strip headed "Heads up", six and a half seconds, two phone numbers as plain
   text, no way to get it back. It is the most important sentence this product
   ever says to anybody and it was being delivered by the component that also
   says "Upload failed".

   So: a dialog that stays until it is dismissed, numbers that dial, and no
   auto-close of any kind. The message is the server's, not ours — it names the
   numbers, and we turn them into something a thumb can reach.               */

const CM_CRISIS_TEL = [
  { label: "Emergency services", num: "112" },
  { label: "NGG safeguarding", num: "+2349037776318", show: "+234 903 777 6318" },
];

function CmCrisisDialog({ message, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    /* Deliberately NO Escape handler and no scrim click-through. Every other
       sheet in here closes on a stray tap; this one asks for the button. */
    const t = setTimeout(() => { const el = ref.current; if (el) el.focus(); }, 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="cm-crisis-scrim">
      <div className="cm-crisis" role="alertdialog" aria-modal="true"
           aria-labelledby="cm-crisis-h" aria-describedby="cm-crisis-b"
           tabIndex={-1} ref={ref}>
        <h2 className="cm-crisis-h" id="cm-crisis-h">Please talk to someone now</h2>
        <p className="cm-crisis-b" id="cm-crisis-b">{message}</p>
        <div className="cm-crisis-calls">
          {CM_CRISIS_TEL.map(t => (
            <a key={t.num} className="cm-crisis-call" href={"tel:" + t.num}>
              <span className="cm-crisis-call-l">{t.label}</span>
              <span className="cm-crisis-call-n">{t.show || t.num}</span>
            </a>
          ))}
        </div>
        <p className="cm-crisis-note">Your message wasn't posted, and it's still in the box if you want it. You're not in trouble.</p>
        <button className="cm-crisis-x" onClick={onClose}>I've read this</button>
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
function CmToday({ auth, counts, onCounts, onOpenAccount, onOpenThread, onCompose, onOpenChannel, offline, filter, setFilter }) {
  const [sheetFor, setSheetFor] = React.useState(null);
  const [posts, setPosts] = React.useState(null);
  const [err, setErr] = React.useState("");
  const mem = auth.member || {};

  const load = React.useCallback((f) => {
    setPosts(null); setErr("");
    const channel = f === "saved" ? "bookmarks" : f;
    NGGApi.member.community.feed(channel, "latest", 0)
      .then(r => setPosts(r.posts || []))
      .catch(() => { setPosts([]); setErr("Couldn't load the feed. Pull down or try again."); });
  }, []);
  React.useEffect(() => { load(filter); }, [filter, load]);

  const patch = (postId, p) => {
    setPosts(ps => (ps || []).map(x => x.postId === postId ? { ...x, ...p } : x));
    /* Saving something changes the Saved chip. The chips were fetched once at
       start-up, so the count sat still while the list under it moved — and a
       counter that disagrees with the list is the reason people stop reading
       counters at all. Only bookmarks move a count, so only bookmarks refetch. */
    if (p && Object.prototype.hasOwnProperty.call(p, "bookmarked")) onCounts();
  };
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
    { id: "saved", label: "Saved", count: counts.saved },
    { id: "mine", label: "Yours" },
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
              : filter === "mine"
                ? <CmEmpty icon="✎" title="You haven't posted yet"
                           body="Anything you write — and anything still waiting on a mentor — shows up here."
                           action={<button className="cmm-cta" onClick={onCompose.open}>Write your first post</button>}/>
                : <CmEmpty icon="✦" title="Nothing here yet"
                           body="Be the first to post something to your centre."
                           action={<button className="cmm-cta" onClick={onCompose.open}>Write a post</button>}/>
        )}
        {posts && posts.map(p => (
          <CmMobileMessage key={p.postId} post={p} me={mem.fullName} card showChannel
                           onPatch={patch} onRemove={remove} onOpenThread={onOpenThread}
                           onOpenChannel={onOpenChannel}
                           onLongPress={() => setSheetFor(p)}/>
        ))}
      </div>

      {sheetFor && (
        <CmActionsSheetHost post={sheetFor} staff={!!counts.staff}
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
        <span className="cmm-ch-prev">{c.lastMessage || c.description || "No messages yet"}</span>
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
        <Row label="Play a friend" sub="Arcade" onClick={() => onGo("matches")}/>
        <Row label="Mentors & members" onClick={() => onGo("people")}/>
      </div>
      <div className="cmm-acc-group">
        <Row label="Notifications" onClick={() => onGo("notifications")}/>
        <Row label="Your profile" sub={mem.centre || ""} onClick={() => setPage("profile")}/>
        <Row label="Accessibility & text size" onClick={() => onGo("a11y")}/>
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
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast.success("Link copied.")).catch(() => {});
      }}/>
      <Row label="Report to a mentor" danger top onClick={() => act.report()}/>
    </CmSheet>
  );
}

/* ── Jump-to sheet ────────────────────────────────────────────────────────
   The mobile equivalent of the desktop command bar. Opened from the search
   field, because that is where somebody already goes to look for something —
   a second entry point for "find" would split the habit. */
function CmJumpSheet({ channels, scope, setScope, staff, onClose, onOpenChannel, onOpenThread, onOpenJournal, onCompose }) {
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState(null);        // messages
  const [people, setPeople] = React.useState(null);
  const [entries, setEntries] = React.useState(null);  // programme journal
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);
  React.useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(t); }, []);

  /* The scope chips are REAL.
   *
   * They used to set a state nobody read: whatever you narrowed to, the same
   * message search ran. Three scopes, three different sources — messages,
   * people, and the programme journal — so narrowing now changes both what is
   * fetched and what is shown, and a scope with nothing behind it is never
   * offered. */
  const wants = (kind) => scope === "all" || scope === kind;

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); setPeople(null); setEntries(null); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      const jobs = [];
      if (wants("messages")) jobs.push(NGGApi.member.community.search(term, "all")
        .then(r => setHits(r.posts || [])).catch(() => setHits([])));
      else setHits(null);
      if (wants("people")) jobs.push(NGGApi.member.community.mentions(term)
        .then(r => setPeople((r.people || []).filter(x => x.kind !== "all"))).catch(() => setPeople([])));
      else setPeople(null);
      if (wants("journal")) jobs.push(NGGApi.member.programJournal.feed({ q: term, per: 6 })
        .then(r => setEntries(r.entries || [])).catch(() => setEntries([])));
      else setEntries(null);
      Promise.all(jobs).then(() => setBusy(false), () => setBusy(false));
    }, 280);
    return () => clearTimeout(t);
  }, [q, scope]); // eslint-disable-line

  const chanHits = wants("messages") && q.trim().length >= 1
    ? channels.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4) : [];

  /* Slash commands come from the SAME list the composer runs, so the sheet
     cannot advertise a command the composer has never heard of — it offered
     "/homework", which did nothing at all when you picked it. */
  const actions = q.startsWith("/")
    ? CM_SLASH.filter(a => ("/" + a.cmd).startsWith(q.trim().toLowerCase())) : [];

  /* Highlight the matched substring. Finding your search term in a wall of
     grey text is the difference between a result list and a wall of text. */
  const mark = (text) => {
    const s = q.trim(); if (!s) return text;
    const i = String(text).toLowerCase().indexOf(s.toLowerCase());
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark className="cmm-mark">{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>;
  };

  const nothing = q.trim().length >= 2 && !busy && actions.length === 0 && chanHits.length === 0
    && (hits || []).length === 0 && (people || []).length === 0 && (entries || []).length === 0;

  return (
    <CmSheet title="Jump to" onClose={onClose}>
      <div className="cmm-jump-field">
        {cmUiIcon("search", 18)}
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
               placeholder="Messages, people, entries — or / for a command"
               aria-label="Search the community"/>
        {q && <button className="cmm-jump-clear" onClick={() => setQ("")} aria-label="Clear the search">×</button>}
      </div>
      <CmChips label="Narrow the search" value={scope} onPick={setScope}
               items={[{ id: "all", label: "All" }, { id: "messages", label: "Messages" },
                       { id: "people", label: "People" }, { id: "journal", label: "Journal" }]}/>
      <div className="cmm-jump-results">
        {q.trim().length < 2 && !q.startsWith("/") && (
          <div className="cmm-jump-note">Type at least two letters. Start with <b>/</b> for a command.</div>
        )}
        {actions.length > 0 && <div className="cmm-list-h">ACTIONS</div>}
        {actions.map(a => (
          <button key={a.cmd} className="cmm-jump-row" onClick={() => onCompose(a.cmd, "")}>
            <span className="cmm-jump-mono">/{a.cmd}</span>
            <span className="cmm-jump-sub">{a.hint}</span>
          </button>
        ))}
        {chanHits.length > 0 && <div className="cmm-list-h">CHANNELS</div>}
        {chanHits.map(c => (
          <button key={c.slug} className="cmm-jump-row" onClick={() => { onClose(); onOpenChannel(c.slug); }}>
            <span className="cmm-jump-name">{mark(c.name)}</span>
            <span className="cmm-jump-sub">{c.unread > 0 ? c.unread + " unread" : "Channel"}</span>
          </button>
        ))}
        {people && people.length > 0 && <div className="cmm-list-h">PEOPLE</div>}
        {people && people.map(pp => (
          /* Tapping a person starts a message TO them. There is no member
             profile to open, and a row that only highlights itself is a row
             that wasted the tap. */
          <button key={pp.handle} className="cmm-jump-row" onClick={() => onCompose("", "@" + pp.handle + " ")}>
            <span className="cmm-jump-name">{mark(pp.name || pp.handle)} <span className="cmm-jump-mono">@{pp.handle}</span></span>
            <span className="cmm-jump-sub">{pp.centre || "Member"} · Write to them</span>
          </button>
        ))}
        {hits && hits.length > 0 && <div className="cmm-list-h">MESSAGES</div>}
        {hits && hits.map(p => (
          <button key={p.postId} className="cmm-jump-row" onClick={() => { onClose(); onOpenThread(p); }}>
            <span className="cmm-jump-name">{mark(String(p.body || "").slice(0, 90))}</span>
            <span className="cmm-jump-sub">{p.author.name} · {p.channel.name} · {cmAgo(p.createdAt)}</span>
          </button>
        ))}
        {entries && entries.length > 0 && <div className="cmm-list-h">JOURNAL</div>}
        {entries && entries.map(e => (
          <button key={e.entryId} className="cmm-jump-row" onClick={() => { onClose(); onOpenJournal(e); }}>
            <span className="cmm-jump-name">{mark(String(e.title || e.body || "").slice(0, 90))}</span>
            <span className="cmm-jump-sub">{(e.kind || "entry")}{e.createdAt ? " · " + cmAgo(e.createdAt) : ""}</span>
          </button>
        ))}
        {busy && <div className="cmm-jump-note">Searching…</div>}
        {nothing && <div className="cmm-jump-note">Nothing matched “{q.trim()}”.</div>}
      </div>
    </CmSheet>
  );
}

/* ── Files ────────────────────────────────────────────────────────────────
   Turn 4A. Every file shared in a channel, on one screen, built around the
   constraint the design keeps returning to: members are on metered data, and
   nothing may cost them megabytes they did not agree to spend.

   Three pieces make that true rather than decorative — a real offline store
   (Cache Storage, so a saved file opens with the radio off), a real byte
   figure on every row, and a real threshold above which nothing transfers
   until somebody taps. */

const CM_ASK_MB = 5;                       // ask first above this
const CM_FILE_CACHE = "ngg-files-v1";
const CM_DATA_KEY = "ngg.cm.datapref";     // { saver: bool, ask: bool }

function cmDataPref() {
  try { return Object.assign({ saver: true, ask: true }, JSON.parse(localStorage.getItem(CM_DATA_KEY) || "{}")); }
  catch (_) { return { saver: true, ask: true }; }
}
function cmSetDataPref(patch) {
  const next = Object.assign(cmDataPref(), patch);
  try { localStorage.setItem(CM_DATA_KEY, JSON.stringify(next)); } catch (_) {}
  return next;
}

/* The offline store.
 *
 * Cache Storage, not IndexedDB: the thing being kept IS an HTTP response, and
 * keeping it as one means the viewer fetches the same URL whether the file is
 * on the device or not — there is no second code path to keep in step, and no
 * blob URL to leak. Absent Cache Storage (older Android WebView, a page served
 * without TLS in development) every call resolves to "nothing saved", which is
 * the truth rather than an error. */
const cmOffline = {
  ok() { return typeof caches !== "undefined" && !!caches; },
  /* Cache Storage keys on the ABSOLUTE url it fetched. A file url may reach us
     relative, so every lookup resolves first — otherwise a file is saved and
     then reported as not saved, which is the worst of both. */
  key(url) { try { return new URL(url, location.href).href; } catch (_) { return String(url); } },
  async open() { return this.ok() ? caches.open(CM_FILE_CACHE) : null; },
  async list() {
    const c = await this.open(); if (!c) return {};
    const out = {};
    for (const req of await c.keys()) {
      const res = await c.match(req);
      const len = res ? Number(res.headers.get("content-length") || 0) : 0;
      out[req.url] = { bytes: len };
    }
    return out;
  },
  async has(url) { const c = await this.open(); return !!(c && await c.match(this.key(url))); },
  async save(url) {
    const c = await this.open(); if (!c) throw new Error("no-cache");
    await c.add(new Request(this.key(url), { mode: "cors" }));
    return true;
  },
  async remove(url) { const c = await this.open(); return c ? c.delete(this.key(url)) : false; },
};

function cmBytes(n) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  const mb = n / 1024 / 1024;
  return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + " MB";
}
function cmClock(secs) {
  const t = Math.max(0, Math.round(secs || 0));
  return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
}
/** The badge on a document row — the format, in three letters. */
function cmFileTag(f) {
  if (f.kind === "image") return "IMG";
  if (f.kind === "video") return "VID";
  return (f.format || "doc").slice(0, 4).toUpperCase();
}
/** Which files this app can actually open in place. Everything else gets a
    row that says so and offers the honest alternatives, rather than a preview
    that opens a blank rectangle. */
function cmCanPreview(f) {
  if (f.kind === "image" || f.kind === "video") return true;
  return String(f.format || "").toLowerCase() === "pdf";
}

const CM_FILE_GROUPS = [
  { id: "pinned", label: "Pinned by mentors" },
  { id: "week",   label: "This week" },
  { id: "older",  label: "Older" },
];

function CmFiles({ slug, channelName, onBack, onOpenThread }) {
  const [kind, setKind] = React.useState("all");
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [saved, setSaved] = React.useState({});      // url -> {bytes}
  const [sheetFor, setSheetFor] = React.useState(null);
  const [reading, setReading] = React.useState(null); // the open document
  const [gallery, setGallery] = React.useState(-1);   // index into photos
  const [playing, setPlaying] = React.useState(null);

  const load = React.useCallback(() => {
    setData(null); setErr("");
    NGGApi.member.community.files(slug, "all")
      .then(r => setData(r))
      .catch(() => { setData({ files: [], counts: {} }); setErr("Couldn't load the files in this channel."); });
  }, [slug]);
  React.useEffect(() => { load(); }, [load]);

  const refreshSaved = React.useCallback(() => { cmOffline.list().then(setSaved).catch(() => {}); }, []);
  React.useEffect(() => { refreshSaved(); }, [refreshSaved]);

  const files = (data && data.files) || [];
  const counts = (data && data.counts) || {};
  const shown = kind === "all" ? files : files.filter(f => f.kind === kind);
  const photos = files.filter(f => f.kind === "image");
  const savedList = Object.keys(saved);
  const savedBytes = savedList.reduce((n, u) => n + (saved[u].bytes || 0), 0);

  const chips = [
    { id: "all", label: "All", count: counts.all },
    { id: "doc", label: "Docs", count: counts.doc },
    { id: "image", label: "Photos", count: counts.image },
    { id: "video", label: "Video", count: counts.video },
  ];

  /* Opening a file is the only place bytes leave the network, so it is the
     only place that asks. Anything already saved opens immediately — it costs
     nothing — and so does anything under the threshold. */
  const open = (f) => {
    const isSaved = !!saved[cmOffline.key(f.url)];
    const big = (f.bytes || 0) > CM_ASK_MB * 1024 * 1024;
    if (!isSaved && big && cmDataPref().ask) { setSheetFor({ file: f, reason: "cost" }); return; }
    reallyOpen(f);
  };
  const reallyOpen = (f) => {
    if (f.kind === "image") { setGallery(photos.findIndex(x => x.postId === f.postId)); return; }
    if (f.kind === "video") { setPlaying(f); return; }
    if (cmCanPreview(f)) { setReading(f); return; }
    setSheetFor({ file: f, reason: "nopreview" });
  };

  const Row = (f) => {
    const isSaved = !!saved[cmOffline.key(f.url)];
    const meta = [
      isSaved ? "✓ offline" : "",
      f.kind === "video" && f.duration ? cmClock(f.duration) : "",
      f.pages ? f.pages + (f.pages === 1 ? " page" : " pages") : "",
      cmBytes(f.bytes),
    ].filter(Boolean).join(" · ");
    const big = (f.bytes || 0) > CM_ASK_MB * 1024 * 1024;
    return (
      <div className="cmm-file" key={f.postId}>
        <button className="cmm-file-main" onClick={() => open(f)}
                onContextMenu={(e) => { e.preventDefault(); setSheetFor({ file: f, reason: "actions" }); }}>
          {f.kind === "image" || (f.kind === "video" && f.poster)
            ? <span className="cmm-file-thumb"><img src={cmOpt(f.poster || f.url, 128)} alt="" loading="lazy"/>
                {f.kind === "video" && <span className="cmm-file-play" aria-hidden="true">▶</span>}</span>
            : <span className={"cmm-file-tag is-" + f.kind}>{cmFileTag(f)}</span>}
          <span className="cmm-file-body">
            <span className="cmm-file-name">{f.name}</span>
            <span className="cmm-file-meta">
              {isSaved && <span className="cmm-file-off">✓ offline</span>}
              {meta.replace(/^✓ offline · ?/, "")}
            </span>
            <span className="cmm-file-who">{f.author.name}{f.createdAt ? " · " + cmAgo(f.createdAt) : ""}</span>
          </span>
          {/* The one badge that changes a decision: this will cost you. */}
          {big && !isSaved && <span className="cmm-file-wifi">Wi-Fi</span>}
        </button>
        <button className="cmm-file-more" aria-label={"Actions for " + f.name}
                onClick={() => setSheetFor({ file: f, reason: "actions" })}>⋯</button>
      </div>
    );
  };

  return (
    <div className="cmm-screen" role="region" aria-label={"Files in " + (channelName || "this channel")}>
      <header className="cmm-head cmm-head-back">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back to the channel">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-h1">Files</h1>
          <p className="cmm-sub">{channelName}{counts.all ? " · " + counts.all + " files" : ""}</p>
        </div>
      </header>

      <CmChips items={chips} value={kind} onPick={setKind} label="Filter by kind"/>

      {savedList.length > 0 && (
        <div className="cmm-off-bar">
          <span>
            <b>{savedList.length} {savedList.length === 1 ? "file" : "files"} saved offline</b>
            {savedBytes ? " · " + cmBytes(savedBytes) : ""}. Available with no data.
          </span>
          <button onClick={() => setSheetFor({ reason: "manage" })}>Manage</button>
        </div>
      )}

      {data === null && <CmSkeleton rows={4}/>}
      {err && data && shown.length === 0 && (
        <CmEmpty icon="⚠" title="That didn't load" body={err}
                 action={<button className="cmm-cta" onClick={load}>Try again</button>}/>
      )}
      {data && shown.length === 0 && !err && (
        <CmEmpty icon="🗂" title={kind === "all" ? "No files yet" : "Nothing of that kind yet"}
                 body="Anything shared in this channel — a handout, a photo, a recording — collects here."/>
      )}

      {data && shown.length > 0 && CM_FILE_GROUPS.map(g => {
        const rows = shown.filter(f => f.group === g.id);
        if (!rows.length) return null;
        return (
          <div className="cmm-file-group" key={g.id}>
            <div className="cmm-list-h">{g.label.toUpperCase()}</div>
            {rows.map(Row)}
          </div>
        );
      })}

      {data && shown.length > 0 && (
        <p className="cmm-file-hint">Hold any file for share, save offline, or send to your journal.</p>
      )}

      {sheetFor && (
        <CmFileSheet entry={sheetFor} saved={saved} files={files}
                     onClose={() => setSheetFor(null)}
                     onOpen={(f) => { setSheetFor(null); reallyOpen(f); }}
                     onSavedChange={refreshSaved}
                     onOpenThread={onOpenThread}/>
      )}
      {reading && (
        <NggPdf src={reading.url} name={reading.name} pages={reading.pages} bytes={reading.bytes}
                open onClose={() => setReading(null)}/>
      )}
      {gallery >= 0 && photos[gallery] && (
        <CmPhotoViewer photos={photos} index={gallery} onIndex={setGallery} onClose={() => setGallery(-1)}/>
      )}
      {playing && <CmVideoSheet file={playing} onClose={() => setPlaying(null)}/>}
    </div>
  );
}

/* ── The file actions sheet ───────────────────────────────────────────────
   One sheet, four jobs, because they are the same conversation: what this
   costs, how to avoid paying it twice, where else it could go, and how to
   report it. The cost is stated in megabytes — the unit the member is billed
   in — before anything is transferred. */
function CmFileSheet({ entry, saved, files, onClose, onOpen, onSavedChange, onOpenThread }) {
  const f = entry.file;
  const [pref, setPref] = React.useState(cmDataPref);
  const [busy, setBusy] = React.useState("");

  const isSaved = f && !!saved[cmOffline.key(f.url)];
  const mb = f ? (f.bytes || 0) / 1024 / 1024 : 0;

  const save = async () => {
    if (!f) return;
    setBusy("save");
    try {
      if (isSaved) { await cmOffline.remove(f.url); toast.success("Removed from this device."); }
      else { await cmOffline.save(f.url); toast.success("Saved. It opens with no data now."); }
      onSavedChange();
      // The sheet has done its job; leaving it up hides the list it just
      // changed, which is the one thing the member wants to look at now.
      onClose();
      return;
    } catch (_) {
      toast.error("Couldn't save it offline. Your browser may not allow it here.");
    }
    setBusy("");
  };

  const Row = ({ label, sub, onClick, danger, icon }) => (
    <button className={"cmm-act-row" + (danger ? " is-danger" : "")} onClick={onClick} disabled={!!busy}>
      {icon && <span className="cmm-act-ic" aria-hidden="true">{icon}</span>}
      <span className="cmm-act-label">{label}</span>
      {sub && <span className="cmm-act-sub">{sub}</span>}
    </button>
  );

  if (entry.reason === "manage") {
    const savedFiles = files.filter(x => saved[cmOffline.key(x.url)]);
    return (
      <CmSheet title="Saved on this device" onClose={onClose}>
        {savedFiles.length === 0 && <p className="cmm-jump-note">Nothing from this channel is saved here.</p>}
        {savedFiles.map(x => (
          <div className="cmm-act-row" key={x.postId}>
            <span className="cmm-act-label">{x.name}</span>
            <span className="cmm-act-sub">{cmBytes(saved[cmOffline.key(x.url)].bytes || x.bytes)}</span>
            <button className="cmm-act-x" onClick={() => cmOffline.remove(x.url).then(onSavedChange)}
                    aria-label={"Remove " + x.name + " from this device"}>Remove</button>
          </div>
        ))}
      </CmSheet>
    );
  }

  return (
    <CmSheet title={f ? f.name : "File"} onClose={onClose}>
      {entry.reason === "cost" && (
        <div className="cmm-cost">
          <p><b>This is {cmBytes(f.bytes)} on mobile data.</b>{f.kind === "video" ? " Watching in data saver uses about " + cmBytes((f.bytes || 0) * 0.35) + " instead." : ""}</p>
          <div className="cmm-cost-opts">
            <button className={"cmm-cost-opt" + (pref.saver ? " is-on" : "")}
                    onClick={() => setPref(cmSetDataPref({ saver: true }))}>Data saver</button>
            <button className={"cmm-cost-opt" + (!pref.saver ? " is-on" : "")}
                    onClick={() => setPref(cmSetDataPref({ saver: false }))}>Full quality</button>
          </div>
          <label className="cmm-check">
            <input type="checkbox" checked={pref.ask}
                   onChange={e => setPref(cmSetDataPref({ ask: e.target.checked }))}/>
            <span>Always ask before files over {CM_ASK_MB} MB</span>
          </label>
          <button className="cmm-cta" onClick={() => onOpen(f)}>
            {f.kind === "video" ? "Play" : "Open"} · {cmBytes(pref.saver && f.kind === "video" ? (f.bytes || 0) * 0.35 : f.bytes)}
          </button>
        </div>
      )}

      {entry.reason === "nopreview" && (
        <div className="cmm-cost">
          {/* No dead ends. This app cannot render a spreadsheet and will not
              pretend to — it says so, and offers the two things that do work. */}
          <p><b>No preview for {(f.format || "this kind of file").toUpperCase()}.</b> {cmBytes(f.bytes)} · shared by {f.author.name}.</p>
          <a className="cmm-cta" href={f.url} target="_blank" rel="noopener noreferrer">Open in another app</a>
        </div>
      )}

      {f && (
        <>
          <Row icon="⤓" label={isSaved ? "Remove from this device" : "Save offline"}
               sub={isSaved ? cmBytes(saved[cmOffline.key(f.url)].bytes || f.bytes) : (mb > CM_ASK_MB ? "Wi-Fi recommended · " + cmBytes(f.bytes) : cmBytes(f.bytes))}
               onClick={save}/>
          {onOpenThread && <Row icon="💬" label="Open the message it came with"
                                onClick={() => { onClose(); NGGApi.member.community.post_get(f.postId).then(r => r.post && onOpenThread(r.post)).catch(() => {}); }}/>}
          <Row icon="🔗" label="Copy link" onClick={() => {
            const url = location.origin + "/community?post=" + f.postId;
            if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast.success("Link copied.")).catch(() => {});
            onClose();
          }}/>
          <Row icon="↗" label="Open in another app" onClick={() => { window.open(f.url, "_blank", "noopener"); onClose(); }}/>
          <Row icon="⚑" label="Report this file" danger onClick={() => {
            NGGApi.member.community.report("post", f.postId, "").then(() => toast.success("Sent to the mentors.")).catch(() => toast.error("Couldn't send that."));
            onClose();
          }}/>
        </>
      )}
    </CmSheet>
  );
}

/* ── Photo viewer ─────────────────────────────────────────────────────────
   Full screen, portalled for the same reason the document reader is: a
   transformed ancestor anywhere above would otherwise capture `position:
   fixed` and wedge it into the feed. Swipe moves between siblings, and the
   neighbour each way is prefetched so the swipe lands on an image rather than
   on a wait. */
function CmPhotoViewer({ photos, index, onIndex, onClose }) {
  const f = photos[index];
  const touch = React.useRef(null);
  const [state, setState] = React.useState("loading");   // loading | ready | failed
  const [tries, setTry] = React.useState(0);
  // Each photo is its own load. Swiping to the next one starts over.
  React.useEffect(() => { setState("loading"); setTry(0); }, [index]);
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIndex(Math.min(photos.length - 1, index + 1));
      else if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    document.addEventListener("keydown", onKey);
    history.pushState({ cmPhoto: 1 }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [index, photos.length, onIndex, onClose]);

  // Prefetch one neighbour each way — no further, because each one is real data.
  React.useEffect(() => {
    [index - 1, index + 1].forEach(i => {
      const n = photos[i]; if (!n) return;
      const img = new Image(); img.src = cmOpt(n.url, 1200);
    });
  }, [index, photos]);

  if (!f) return null;
  const down = (e) => { const t = e.touches && e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; };
  const up = (e) => {
    const s = touch.current, t = e.changedTouches && e.changedTouches[0];
    touch.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) onIndex(Math.min(photos.length - 1, index + 1));
    else onIndex(Math.max(0, index - 1));
  };

  return ReactDOM.createPortal(
    <div className="cmm-photo" role="dialog" aria-modal="true" aria-label={f.name}
         onTouchStart={down} onTouchEnd={up}>
      <header className="cmm-photo-bar">
        <button className="cmm-photo-x" onClick={onClose} aria-label="Close">✕</button>
        <span className="cmm-photo-n" aria-live="polite">{index + 1} / {photos.length}</span>
        <a className="cmm-photo-dl" href={f.url} target="_blank" rel="noopener noreferrer" aria-label="Open the original">↗</a>
      </header>
      <div className="cmm-photo-stage">
        {/* A photo that does not arrive used to leave a black rectangle with a
            caption under it and nothing else — no spinner, no reason, no way
            to try again. On the one screen in this app built entirely around
            metered data, "the network dropped" is the likeliest outcome of a
            tap, and it was the one outcome the viewer could not say. */}
        {state === "loading" && (
          <div className="cmm-photo-wait" role="status">
            <span className="cmm-photo-spin" aria-hidden="true"/>
            <span>Loading{f.bytes ? " · " + cmBytes(f.bytes) : ""}</span>
          </div>
        )}
        {state === "failed" && (
          <div className="cmm-photo-fail" role="alert">
            <p><b>That photo didn't load.</b></p>
            <p>It may be the connection rather than the photo. Nothing was used up.</p>
            <div className="cmm-photo-fail-acts">
              <button className="cmm-cta" onClick={() => { setTry(n => n + 1); setState("loading"); }}>Try again</button>
              <a className="cmm-photo-fail-alt" href={f.url} target="_blank" rel="noopener noreferrer">Open it in the browser</a>
            </div>
          </div>
        )}
        <img key={f.url + "#" + tries} src={cmOpt(f.url, 1400)} alt={f.name}
             style={state === "ready" ? null : { width: 1, height: 1, opacity: 0 }}
             onLoad={() => setState("ready")} onError={() => setState("failed")}/>
      </div>
      <footer className="cmm-photo-foot">
        <div className="cmm-photo-cap">{f.note || f.name}</div>
        <div className="cmm-photo-sub">
          {f.author.name}{f.createdAt ? " · " + cmAgo(f.createdAt) : ""}{f.bytes ? " · " + cmBytes(f.bytes) : ""}
        </div>
        {photos.length > 1 && <div className="cmm-photo-hint">Swipe for the next photo</div>}
      </footer>
    </div>,
    document.body
  );
}

/** A video opened from the Files list — full screen, over everything. */
function CmVideoSheet({ file, onClose }) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    history.pushState({ cmVideo: 1 }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [onClose]);
  return ReactDOM.createPortal(
    <div className="cmm-photo is-video" role="dialog" aria-modal="true" aria-label={file.name}>
      <header className="cmm-photo-bar">
        <button className="cmm-photo-x" onClick={onClose} aria-label="Close">✕</button>
        <span className="cmm-photo-n">{file.name}</span>
        <span className="cmm-photo-dl" aria-hidden="true"/>
      </header>
      <div className="cmm-photo-stage">
        <NggVideo src={cmOpt(file.url, cmDataPref().saver ? 640 : 1280)}
                  poster={file.poster || cmPoster(file.url)}/>
      </div>
      <footer className="cmm-photo-foot">
        <div className="cmm-photo-cap">{file.note || file.name}</div>
        <div className="cmm-photo-sub">
          {file.author.name}{file.duration ? " · " + cmClock(file.duration) : ""}
          {file.bytes ? " · " + cmBytes(file.bytes) : ""}
          {cmDataPref().saver ? " · data saver" : ""}
        </div>
      </footer>
    </div>,
    document.body
  );
}

/* ── Notifications ────────────────────────────────────────────────────────
   The Account row used to leave the Community for the dashboard, which is the
   one place a member is NOT when they tap "Notifications" from inside a
   conversation. Mentions land here, so tapping one has to arrive at the
   message it is about — a notification you can read but not follow is a
   notification that has told you about a problem and then hidden it. */
function CmNotifications({ onClose, onOpenThread, onCounts }) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(() => {
    setRows(null); setErr("");
    NGGApi.member.notifications()
      .then(r => setRows(r.notifications || r.items || []))
      .catch(() => { setRows([]); setErr("Couldn't load your notifications."); });
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const [opening, setOpening] = React.useState("");
  const open = (n) => {
    if (n.notifId && !n.readAt) {
      setRows(rs => (rs || []).map(x => x.notifId === n.notifId ? { ...x, readAt: "now" } : x));
      NGGApi.member.markRead(n.notifId).then(onCounts).catch(() => {});
    }
    const ref = n.linkRef || "";
    if (!ref) return;                     // nothing to follow: reading it was the point
    setOpening(n.notifId);
    NGGApi.member.community.post_get(ref)
      .then(r => { setOpening(""); if (r.post) onOpenThread(r.post); else toast.error("That message is no longer there."); })
      .catch(() => { setOpening(""); toast.error("Couldn't open that message."); });
  };

  const markAll = () => {
    const unread = (rows || []).filter(n => !n.readAt);
    if (!unread.length) return;
    setRows(rs => (rs || []).map(x => ({ ...x, readAt: x.readAt || "now" })));
    Promise.all(unread.map(n => NGGApi.member.markRead(n.notifId).catch(() => {}))).then(onCounts);
  };

  return (
    <div className="cmm-screen" role="region" aria-label="Notifications">
      <header className="cmm-head cmm-head-back">
        <button className="cmm-icon-btn" onClick={onClose} aria-label="Back">{cmUiIcon("back", 22)}</button>
        <h1 className="cmm-h1">Notifications</h1>
        {rows && rows.some(n => !n.readAt) && (
          <button className="cmm-head-act" onClick={markAll}>Mark all read</button>
        )}
      </header>
      <div className="cmm-feed">
        {rows === null && <CmSkeleton rows={4}/>}
        {err && rows && rows.length === 0 && (
          <CmEmpty icon="⚠" title="That didn't load" body={err}
                   action={<button className="cmm-cta" onClick={load}>Try again</button>}/>
        )}
        {rows && rows.length === 0 && !err && (
          <CmEmpty icon="🔔" title="Nothing yet"
                   body="Mentions, replies and Genius Stars land here."/>
        )}
        {rows && rows.map(n => (
          <button key={n.notifId} className={"cmm-notif" + (n.readAt ? "" : " is-new")} onClick={() => open(n)}
                  aria-busy={opening === n.notifId}>
            <span className="cmm-notif-t">{n.title || "Update"}</span>
            {n.body && <span className="cmm-notif-b">{n.body}</span>}
            <span className="cmm-notif-w">
              {n.createdAt ? cmAgo(n.createdAt) : ""}{n.linkRef ? " · Open" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Text size ────────────────────────────────────────────────────────────
   A real control, stored on the device and applied to the Community's own
   root so it scales the type without touching the 44px tap targets — bigger
   text must not mean a smaller button. */
const CM_TEXT_SIZES = [
  { id: "s",  label: "Small",   scale: 0.92 },
  { id: "m",  label: "Default", scale: 1 },
  { id: "l",  label: "Large",   scale: 1.12 },
  { id: "xl", label: "Largest", scale: 1.25 },
];
const CM_TEXT_KEY = "ngg.cm.textsize";
function cmApplyTextSize(id) {
  const opt = CM_TEXT_SIZES.find(o => o.id === id) || CM_TEXT_SIZES[1];
  try { document.documentElement.style.setProperty("--cm-text-scale", String(opt.scale)); } catch (_) {}
  return opt.id;
}
function cmStoredTextSize() {
  try { return localStorage.getItem(CM_TEXT_KEY) || "m"; } catch (_) { return "m"; }
}
function CmTextSize({ onClose }) {
  const [size, setSize] = React.useState(cmStoredTextSize);
  const pick = (id) => {
    setSize(cmApplyTextSize(id));
    try { localStorage.setItem(CM_TEXT_KEY, id); } catch (_) {}
  };
  return (
    <div className="cmm-screen" role="region" aria-label="Accessibility and text size">
      <header className="cmm-head cmm-head-back">
        <button className="cmm-icon-btn" onClick={onClose} aria-label="Back">{cmUiIcon("back", 22)}</button>
        <h1 className="cmm-h1">Text size</h1>
      </header>
      <div className="cmm-pad">
        <p className="cmm-sub">Changes apply straight away, on this device only.</p>
        <div className="cmm-size-list" role="radiogroup" aria-label="Text size">
          {CM_TEXT_SIZES.map(o => (
            <button key={o.id} role="radio" aria-checked={size === o.id}
                    className={"cmm-size-row" + (size === o.id ? " is-on" : "")}
                    onClick={() => pick(o.id)}>
              <span className="cmm-size-l" style={{ fontSize: (15 * o.scale).toFixed(1) + "px" }}>{o.label}</span>
              <span className="cmm-size-eg" style={{ fontSize: (15 * o.scale).toFixed(1) + "px" }}>
                Practice makes progress.
              </span>
            </button>
          ))}
        </div>
        <p className="cmm-sub" style={{ marginTop: 16 }}>
          Buttons stay the same size on purpose — larger text should never mean a smaller target.
        </p>
      </div>
    </div>
  );
}

/* ── Channel ──────────────────────────────────────────────────────────────
   The full channel screen. Everything the desktop channel could do, in one
   column, with the two rules that matter on a phone held to: nothing
   auto-scrolls, and every action clears a thumb. */
/* The segmented control the bundle uses in four places: All/Unread/Mine in the
 * channel pane, Newest/Hot in a channel header, Week/All-time on the arcade
 * board, Mine/Programme in the journal. One implementation, one track colour,
 * one set of keyboard semantics — a tablist, because that is what it is. */
function CmSeg({ label, value, onChange, options, className }) {
  return (
    <div className={"cmd-seg" + (className ? " " + className : "")} role="tablist" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id}
                className={"cmd-seg-b" + (value === id ? " is-on" : "")}
                onClick={() => onChange(id)}>{text}</button>
      ))}
    </div>
  );
}

/* ── The journal · "Mine" (handoff §8a) ────────────────────────────────────
 *
 * The most private surface in the product. Everything here defaults to private
 * and says so; the one line the design insists on — "Private unless you choose
 * to share it." — sits on the card that invites the writing, not in a settings
 * screen nobody opens.
 *
 * The numbers all come from the server in one request. Five round trips on a
 * Nigerian mobile connection is the difference between a screen that opens and
 * a screen somebody stops opening.
 * ────────────────────────────────────────────────────────────────────────── */

const CM_MOODS = [
  { n: 1, emoji: "😔", label: "Rough" },
  { n: 2, emoji: "😕", label: "Low" },
  { n: 3, emoji: "😐", label: "Fine" },
  { n: 4, emoji: "🙂", label: "Good" },
  { n: 5, emoji: "😄", label: "Great" },
];
const CM_MOOD_EMOJI = (n) => (CM_MOODS.find(m => m.n === n) || {}).emoji || "";

function CmJournalMine({ auth, onWrite }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [skip, setSkip] = React.useState(0);
  const [filter, setFilter] = React.useState("all");
  const [moodBusy, setMoodBusy] = React.useState(false);
  const [moodNote, setMoodNote] = React.useState("");

  const load = React.useCallback((sk) => {
    setErr("");
    NGGApi.member.journalMine(sk === undefined ? skip : sk)
      .then(setD)
      .catch(() => { setD(null); setErr("Couldn't open your journal."); });
  }, [skip]);
  React.useEffect(() => { load(); }, []);   // eslint-disable-line

  const pickMood = (n) => {
    setMoodBusy(true);
    NGGApi.member.journalMood(n)
      .then(r => { setMoodNote(r.note || ""); load(); })
      .catch(() => setMoodNote("That didn't save. Try again in a moment."))
      .finally(() => setMoodBusy(false));
  };

  if (err) {
    return <CmEmpty icon="⚠" title="That didn't load" body={err}
                    action={<button className="cmm-cta" onClick={() => load()}>Try again</button>}/>;
  }
  if (!d) return <CmSkeleton rows={3}/>;

  const todayMood = d.todayEntry && d.todayEntry.mood;
  const entries = (d.entries || []).filter(e => {
    if (filter === "all") return true;
    if (filter === "private") return e.visibility === "private";
    if (filter === "voice") return (e.media || []).some(m => m.kind === "audio");
    return (e.tags || []).indexOf(filter) >= 0;
  });

  /* Grouped by day, with the design's relative headings. */
  const groups = [];
  entries.forEach(e => {
    const head = cmDayHeading(e.occurredOn, d.today);
    const last = groups[groups.length - 1];
    if (last && last.head === head) last.rows.push(e); else groups.push({ head, rows: [e] });
  });

  return (
    <div className="cm-jm">
      {/* The week strip. A written day shows the mood that was logged; an
          unwritten one is a dashed tile, which is a gap rather than a failure. */}
      <div className="cm-jm-week">
        {d.week.map(w => (
          <div className="cm-jm-day" key={w.day}>
            <span className={"cm-jm-dl" + (w.isToday ? " is-today" : "")}>{w.initial}</span>
            <span className={"cm-jm-tile" + (w.isToday ? " is-today" : "") + (w.written ? "" : " is-empty")}
                  title={w.written ? "Written" : "Nothing written"}>
              {w.isToday && !w.written ? w.date : (w.written ? CM_MOOD_EMOJI(w.mood) || "✓" : "")}
            </span>
          </div>
        ))}
      </div>

      <section className="cm-jm-prompt">
        <span className="cm-jm-eyebrow">Today's prompt</span>
        <p className="cm-jm-q">{d.prompt}</p>
        <button className="cm-jm-write" onClick={() => onWrite({ prompt: d.prompt, entry: d.todayEntry })}>
          {d.todayEntry && (d.todayEntry.body || d.todayEntry.title)
            ? "Carry on today's entry" : "Write today's entry"}
        </button>
        <div className="cm-jm-alts">
          <button className="cm-jm-alt" onClick={() => onWrite({ prompt: d.prompt, entry: d.todayEntry, attach: "audio" })}>🎙 Voice note</button>
          <button className="cm-jm-alt" onClick={() => onWrite({ prompt: d.prompt, entry: d.todayEntry, attach: "image" })}>📷 Photo</button>
          <button className="cm-jm-alt cm-jm-reroll" onClick={() => { const n = skip + 1; setSkip(n); load(n); }}
                  aria-label="A different prompt">↻</button>
        </div>
        <p className="cm-jm-safe">Private unless you choose to share it.</p>
      </section>

      <section className="cm-jm-mood">
        <h2 className="cm-jm-h">How is today going?</h2>
        <div className="cm-jm-moods" role="radiogroup" aria-label="How is today going?">
          {CM_MOODS.map(m => (
            <button key={m.n} role="radio" aria-checked={todayMood === m.n}
                    aria-label={m.label} title={m.label}
                    className={"cm-jm-m" + (todayMood === m.n ? " is-on" : "")}
                    disabled={moodBusy} onClick={() => pickMood(m.n)}>{m.emoji}</button>
          ))}
        </div>
        <p className="cm-jm-note" role="status">
          {moodNote || (todayMood ? cmMoodNote(todayMood) : "Tap one. It stays private.")}
        </p>
      </section>

      <div className="cm-jm-stats">
        <div><span>Streak</span><b>{d.stats.streak}</b></div>
        <div><span>Entries</span><b>{d.stats.entries}</b></div>
        <div><span>Words</span><b>{cmShortNum(d.stats.words)}</b></div>
      </div>

      <CmChips label="Filter your entries" value={filter} onPick={setFilter}
               items={[{ id: "all", label: "All", count: d.filters.all },
                       { id: "private", label: "🔒 Private", count: d.filters.private }]
                 .concat((d.filters.tags || []).map(t => ({ id: t.tag, label: "#" + t.tag, count: t.count })))
                 .concat(d.filters.voice ? [{ id: "voice", label: "🎙 Voice", count: d.filters.voice }] : [])}/>

      {entries.length === 0 && (
        <CmEmpty icon="✎"
                 title={d.stats.entries === 0 ? "Nothing written yet" : "Nothing under that filter"}
                 body={d.stats.entries === 0
                   ? "Your journal is yours. Nobody sees an entry unless you choose to share it."
                   : "Try another filter, or All."}
                 action={d.stats.entries === 0
                   ? <button className="cmm-cta" onClick={() => onWrite({ prompt: d.prompt, entry: null })}>Write the first one</button>
                   : <button className="cmm-cta" onClick={() => setFilter("all")}>Show everything</button>}/>
      )}

      {groups.map(g => (
        <React.Fragment key={g.head}>
          <div className="cmm-list-h">{g.head.toUpperCase()}</div>
          {g.rows.map(e => <CmJmEntry key={e.entryId} e={e} onOpen={() => onWrite({ prompt: e.prompt, entry: e })}/>)}
        </React.Fragment>
      ))}

      {d.yearAgo && (
        <div className="cm-jm-recall">
          <span className="cm-jm-recall-ic" aria-hidden="true">🕰</span>
          <div>
            <span className="cm-jm-eyebrow dark">A year ago today</span>
            <p>“{d.yearAgo.quote}”</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** One entry: the 42px date rail beside the card, as the artboard draws it. */
function CmJmEntry({ e, onOpen }) {
  const t = new Date(e.occurredOn + "T00:00:00Z");
  const vis = e.visibility === "private"
    ? { cls: "is-private", text: "🔒" }
    : e.visibility === "mentor" ? { cls: "is-mentor", text: "Mentor" } : { cls: "is-shared", text: "Shared" };
  const meta = (e.tags || []).map(x => "#" + x).join(" ");
  return (
    <article className="cm-jm-e">
      <div className="cm-jm-rail" aria-hidden="true">
        <div className="cm-jm-rail-d">{t.getUTCDate()}</div>
        <div className="cm-jm-rail-w">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][t.getUTCDay()]}</div>
      </div>
      <button className="cm-jm-card" onClick={onOpen}>
        <span className="cm-jm-card-top">
          {e.mood ? <span className="cm-jm-card-mood" aria-hidden="true">{CM_MOOD_EMOJI(e.mood)}</span> : null}
          <span className="cm-jm-card-t">{e.title || "Untitled"}</span>
          {/* The visibility marker is a WORD wherever it is not the padlock —
              a coloured pill on its own does not say who can read this. */}
          <span className={"cm-jm-vis " + vis.cls}>{vis.text}</span>
        </span>
        {e.excerpt && <span className="cm-jm-card-x">{e.excerpt}</span>}
        <span className="cm-jm-card-meta">
          {meta && <span className="cm-jm-tag">{meta}</span>}
          <span className="cm-jm-words">
            {meta ? " · " : ""}{e.words} {e.words === 1 ? "word" : "words"}
            {(e.media || []).length ? " · " + (e.media || []).length + " attached" : ""}
          </span>
        </span>
      </button>
    </article>
  );
}

/** "Today", "Yesterday", then the date. */
function cmDayHeading(day, today) {
  if (day === today) return "Today";
  const t = new Date(today + "T00:00:00Z"), d = new Date(day + "T00:00:00Z");
  const diff = Math.round((t - d) / 86400000);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
  return d.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
}
/** The design's five captions, verbatim — the server says the same five. */
function cmMoodNote(n) {
  return ["Rough day logged — nobody sees this but you.",
          "Logged. Want to write a line about it?",
          "Steady. Logged for today.",
          "Logged — 12 good days this month.",
          "Great day logged. Worth a few words?"][Math.max(1, Math.min(5, n)) - 1];
}
/** "Tuesday 18 August" — the journal header's subtitle. */
function cmTodayWords() {
  const d = new Date();
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()]
    + " " + d.getDate() + " "
    + ["January", "February", "March", "April", "May", "June", "July",
       "August", "September", "October", "November", "December"][d.getMonth()];
}
/** 3.1k, not 3100 — the design's own figure, and it has to fit a 1/3 tile. */
function cmShortNum(n) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)) + "k";
}

/* ── The journal writer (handoff §8b) ──────────────────────────────────────
 *
 * A full-screen overlay, because writing is the whole task and a keyboard on a
 * 390px phone leaves room for nothing else.
 *
 * Two things here are not decoration:
 *   · Autosave. "Returns to the journal (autosave implied — never lose a
 *     draft)". A child writing about a bad day and losing it to a dropped
 *     connection is the worst failure this screen has, so the draft is kept
 *     locally the moment it is typed and only then sent.
 *   · "Who can read this", with private preselected and the consequence
 *     spelled out beside each choice. Three radios, not a toggle: "who can
 *     read this" has three answers and a switch can only hold two.
 * ────────────────────────────────────────────────────────────────────────── */

/* The design fills these in for its fixture — "Me and Coach Bisi", "Visible to
   Egbeda members." — so the strings are patterns, not literals, and the centre
   is interpolated from the member rather than shipped as somebody else's.
   Two deliberate deviations, both stated:
     · "my mentor" rather than a name. The app does not know which mentor a
       member is assigned to, and inventing one on a screen about who can read
       your private writing is the wrong place to guess.
     · "They can reply privately", not "He". A mentor's pronouns are not
       something this app is told. */
const cmJwVis = (centre) => [
  { id: "private",   name: "Only me",              why: "Default. Nobody is notified.", glyph: "🔒" },
  { id: "mentor",    name: "Me and my mentor",     why: "They can reply privately." },
  { id: "programme", name: "The programme record",
    why: "Visible to " + (centre ? centre + " members." : "everyone at your centre.") },
];

function CmJournalWriter({ seed, auth, onClose, onSaved }) {
  const entry = (seed && seed.entry) || null;
  const [title, setTitle] = React.useState(entry ? entry.title || "" : "");
  const [body, setBody] = React.useState(entry ? entry.body || "" : "");
  const [tags, setTags] = React.useState(entry ? (entry.tags || []).slice() : []);
  const [vis, setVis] = React.useState(entry ? entry.visibility || "private" : "private");
  const [prompt, setPrompt] = React.useState((seed && seed.prompt) || "");
  /* "Saved" is a claim about the reader's words. An entry that exists only
     because a mood was tapped has no words in it, and telling somebody their
     blank page is saved is the kind of small lie that makes the whole autosave
     indicator untrustworthy. */
  const [saved, setSaved] = React.useState(
    entry && ((entry.body || "").trim() || (entry.title || "").trim()) ? "Saved" : "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [addTag, setAddTag] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");
  const bodyRef = React.useRef(null);
  const draftKey = "ngg.jw." + (entry ? entry.entryId : "today");

  const words = React.useMemo(() => {
    const t = body.replace(/\s+/g, " ").trim();
    return t ? t.split(" ").length : 0;
  }, [body]);

  /* The local draft is written FIRST and cleared only once the server has the
     entry. A dropped connection then costs nothing at all. */
  React.useEffect(() => {
    if (entry) return;                                  // an existing entry is already stored
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.title) setTitle(d.title);
        if (d.body) setBody(d.body);
        if (d.tags) setTags(d.tags);
        if (d.vis) setVis(d.vis);
        setSaved("Restored from this device");
      }
    } catch (_) {}
  }, []);   // eslint-disable-line
  React.useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify({ title, body, tags, vis })); } catch (_) {}
  }, [title, body, tags, vis, draftKey]);

  const save = React.useCallback((quiet) => {
    if (!title.trim() && !body.trim()) return Promise.resolve();
    setBusy(true); setErr("");
    return NGGApi.member.journalSave({
      entryId: entry ? entry.entryId : "",
      title: title.trim(), body, tags, visibility: vis, prompt,
      occurredOn: entry ? entry.occurredOn : "",
    }).then(() => {
      setSaved("Autosaved just now");
      try { localStorage.removeItem(draftKey); } catch (_) {}
      if (!quiet) onSaved && onSaved();
    }).catch(() => {
      /* The draft stays exactly where it is. This is the one failure where
         clearing the box would be unforgivable. */
      setErr("Not saved yet — it is still on this device. Try again when you have signal.");
    }).finally(() => setBusy(false));
  }, [title, body, tags, vis, prompt, entry, draftKey, onSaved]);

  // Autosave on a pause in typing, the way the design's "Autosaved just now" implies.
  React.useEffect(() => {
    if (!title.trim() && !body.trim()) return;
    const t = setTimeout(() => save(true), 2500);
    return () => clearTimeout(t);
  }, [title, body, tags, vis]);   // eslint-disable-line

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => { if (bodyRef.current) try { bodyRef.current.focus(); } catch (_) {} }, 60);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [onClose]);

  const done = () => { save(false).then(onClose); };
  const addTheTag = () => {
    const t = tagDraft.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (t && tags.indexOf(t) < 0 && tags.length < 8) setTags(tags.concat(t));
    setTagDraft(""); setAddTag(false);
  };

  const dayLabel = (() => {
    const d = entry && entry.occurredOn ? new Date(entry.occurredOn + "T00:00:00Z") : new Date();
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] + " " + d.getUTCDate() + " "
      + ["January", "February", "March", "April", "May", "June", "July",
         "August", "September", "October", "November", "December"][d.getUTCMonth()];
  })();

  return ReactDOM.createPortal(
    <div className="cm-jw" role="dialog" aria-modal="true" aria-label="Write a journal entry">
      <header className="cm-jw-bar">
        <button className="cm-jw-close" onClick={onClose}>Close</button>
        <div className="cm-jw-when">
          <div className="cm-jw-date">{dayLabel}</div>
          <div className="cm-jw-saved" role="status">{err ? "" : (busy ? "Saving…" : saved)}</div>
        </div>
        <button className="cm-jw-done" onClick={done} disabled={busy}>Done</button>
      </header>

      <div className="cm-jw-body">
        {err && <p className="cm-jw-err" role="alert">{err}</p>}

        {prompt && (
          <div className="cm-jw-prompt">
            <span aria-hidden="true">✦</span>
            <span className="cm-jw-prompt-t">{prompt}</span>
            <button className="cm-jw-skip" onClick={() => setPrompt("")}>Skip</button>
          </div>
        )}

        <input className="cm-jw-title" value={title} maxLength={140}
               onChange={e => setTitle(e.target.value)}
               placeholder="Give it a title…" aria-label="Title"/>

        <textarea className="cm-jw-text" ref={bodyRef} value={body} maxLength={20000}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Write whatever today was." aria-label="Your entry"/>

        <div className="cm-jw-tags">
          {tags.map(t => (
            <button key={t} className="cm-jw-tag" onClick={() => setTags(tags.filter(x => x !== t))}
                    aria-label={"Remove the tag " + t}>#{t} <span aria-hidden="true">×</span></button>
          ))}
          {addTag ? (
            <input className="cm-jw-tagin" autoFocus value={tagDraft} maxLength={24}
                   onChange={e => setTagDraft(e.target.value)}
                   onBlur={addTheTag}
                   onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTheTag(); }
                                     if (e.key === "Escape") { setTagDraft(""); setAddTag(false); } }}
                   placeholder="tag" aria-label="New tag"/>
          ) : (
            tags.length < 8 && <button className="cm-jw-addtag" onClick={() => setAddTag(true)}>+ tag</button>
          )}
        </div>

        {/* Three answers, so three radios. The consequence is next to the
            choice rather than in a help link, because the choice is the whole
            point of the card. */}
        <fieldset className="cm-jw-vis">
          <legend className="cm-jm-eyebrow">Who can read this</legend>
          {cmJwVis(((auth || {}).member || {}).centre).map(o => (
            <label key={o.id} className={"cm-jw-vis-row" + (vis === o.id ? " is-on" : "")}>
              <input type="radio" name="cm-jw-visibility" className="sr-only"
                     checked={vis === o.id} onChange={() => setVis(o.id)}/>
              <span className="cm-jw-radio" aria-hidden="true"/>
              <span className="cm-jw-vis-txt">
                <span className="cm-jw-vis-n">{o.name}</span>
                <span className="cm-jw-vis-w">{o.why}</span>
              </span>
              {o.glyph && <span className="cm-jw-vis-g" aria-hidden="true">{o.glyph}</span>}
            </label>
          ))}
        </fieldset>
      </div>

      <footer className="cm-jw-foot">
        <button className="cm-jw-tool" aria-label="Add a voice note" title="Add a voice note">🎙</button>
        <button className="cm-jw-tool" aria-label="Add a photo" title="Add a photo">📷</button>
        <button className="cm-jw-tool" aria-label="Attach a file" title="Attach a file">📎</button>
        <span className="cm-jw-spacer"/>
        <span className="cm-jw-words">{words} {words === 1 ? "word" : "words"}</span>
      </footer>
    </div>,
    document.body
  );
}

/* ── Homework ──────────────────────────────────────────────────────────────
 *
 * Handoff §11 (the 250px desktop widget) and §12 (the phone tracker). One
 * source of numbers, two shapes, because "14 of 24" appearing twice on one
 * screen and disagreeing is the failure this feature is most likely to have.
 *
 * The rule the design prints under the buttons is enforced on the server —
 * mentor-only, one private notification, once per child per day — and rendered
 * here as a disabled button with a reason rather than a press that fails.
 * ────────────────────────────────────────────────────────────────────────── */

/** The numbers and the bar, shared by the widget and the screen. */
function CmHwBar({ counts }) {
  return (
    <>
      <div className="cm-hw-count">
        <span className="cm-hw-n">{counts.submitted}</span>
        <span className="cm-hw-of">of {counts.asked} submitted</span>
      </div>
      {/* The bar is decorative — the sentence above it carries the number — so
          it is hidden from a screen reader rather than read out twice. */}
      <div className="cm-hw-track" aria-hidden="true">
        <span style={{ width: counts.percent + "%" }}/>
      </div>
    </>
  );
}

/** The 250px card beside the digest on a desktop. */
function CmHwWidget({ hw, onOpen, onNudgeAll, busy }) {
  if (!hw) return null;
  const c = hw.counts;
  const out = hw.outstanding || [];
  const canNudge = hw.canNudge && hw.nudgeableNow > 0;
  return (
    <aside className="cm-hw-widget" aria-label={"Homework: " + hw.title}>
      <div className="cm-hw-eyebrow">
        Homework{hw.dueAt ? " · due " + cmHwDue(hw.dueAt) : ""}
      </div>
      <button className="cm-hw-title" onClick={onOpen}>{hw.title}</button>
      <CmHwBar counts={c}/>
      {hw.canNudge && out.length > 0 && (
        <div className="cm-hw-faces">
          {out.slice(0, 2).map(p => (
            <span key={p.memberId} className="cm-hw-face"
                  style={{ background: cmColor(p.name), color: inkOn(cmColor(p.name)).ink }}
                  aria-hidden="true">{cmInitial(p.name)}</span>
          ))}
          {out.length > 2 && <span className="cm-hw-face more" aria-hidden="true">+{out.length - 2}</span>}
          <span className="cm-hw-still">still to post</span>
        </div>
      )}
      {hw.canNudge ? (
        <button className="cm-hw-go" onClick={onNudgeAll} disabled={!canNudge || busy}
                title={canNudge ? "" : "Everyone outstanding has already been nudged today."}>
          {busy ? "Sending…"
                : canNudge ? "Nudge the " + hw.nudgeableNow
                : "All nudged today"}
        </button>
      ) : (
        <button className="cm-hw-go" onClick={onOpen}>
          {hw.mine && hw.mine.submittedAt ? "You have handed this in" : "Open the task"}
        </button>
      )}
    </aside>
  );
}

/** "Thu 4pm" — the widget's eyebrow, from an ISO date. */
function cmHwDue(iso) {
  const t = new Date(String(iso).replace(" ", "T"));
  if (isNaN(t)) return "";
  const hour = t.getUTCHours();
  const time = ((hour % 12) || 12) + (hour < 12 ? "am" : "pm");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  const dayMs = 86400000;
  const dstamp = (d) => Math.floor(d.getTime() / dayMs);
  if (dstamp(t) === dstamp(now)) return "today " + time;
  if (dstamp(t) === dstamp(now) + 1) return "tomorrow " + time;
  if (t < now) return "was " + days[t.getUTCDay()];
  return days[t.getUTCDay()] + " " + time;
}

/** The §12 tracker screen: counts, the outstanding list, single or bulk nudge. */
function CmHomework({ homeworkId, channel, auth, onBack, onCounts }) {
  const [hw, setHw] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [tab, setTab] = React.useState("outstanding");
  const [busy, setBusy] = React.useState("");
  const [say, setSay] = React.useState("");

  const load = React.useCallback(() => {
    setErr("");
    NGGApi.member.community.homework(channel, homeworkId)
      .then(r => { setHw(r.homework || null); if (r.homework) NGGApi.member.community.homeworkSeen(r.homework.homeworkId).catch(() => {}); })
      .catch(() => { setHw(null); setErr("Couldn't load this task."); });
  }, [channel, homeworkId]);
  React.useEffect(() => { load(); }, [load]);

  const nudge = (who) => {
    setBusy(who || "all"); setSay("");
    NGGApi.member.community.homeworkNudge(hw.homeworkId, who, !who)
      .then(r => {
        /* Say what happened, not "done". With a daily limit, "sent 9, 1 was
           already nudged today" is the true answer and the one a mentor needs
           in order to not go looking for a bug. */
        setSay(r.sent === 0
          ? (r.why || "Nobody to nudge right now.")
          : r.sent + (r.sent === 1 ? " nudge sent" : " nudges sent")
            + (r.skipped ? " · " + r.skipped + " already nudged today" : ""));
        load();
      })
      .catch(() => setSay("That didn't send. Try again in a moment."))
      .finally(() => setBusy(""));
  };

  const review = (who) => {
    setBusy(who);
    NGGApi.member.community.homeworkReview(hw.homeworkId, who)
      .then(() => { setSay("Marked as looked at."); load(); })
      .catch(() => setSay("That didn't save."))
      .finally(() => setBusy(""));
  };

  const submit = () => {
    setBusy("me");
    NGGApi.member.community.homeworkSubmit(hw.homeworkId, "")
      .then(() => { setSay("Handed in."); load(); onCounts && onCounts(); })
      .catch(() => setSay("That didn't save. Your work is still here — try again."))
      .finally(() => setBusy(""));
  };

  if (err) {
    return (
      <div className="cmm-screen">
        <CmHwHead onBack={onBack} title="Homework" sub=""/>
        <CmEmpty icon="⚠" title="That didn't load" body={err}
                 action={<button className="cmm-cta" onClick={load}>Try again</button>}/>
      </div>
    );
  }
  if (hw === null) {
    return (
      <div className="cmm-screen">
        <CmHwHead onBack={onBack} title="Homework" sub=""/>
        <div className="cmm-pad"><CmSkeleton rows={3}/></div>
      </div>
    );
  }

  const c = hw.counts;
  const list = tab === "outstanding" ? (hw.outstanding || []) : (hw.submitted || []);

  return (
    <div className="cmm-screen cm-hw-screen">
      <CmHwHead onBack={onBack} title={hw.title}
                sub={(hw.dueAt ? "Due " + cmHwDue(hw.dueAt) + " · " : "") + hw.channel.name}/>

      <div className="cm-hw-body">
        <CmHwBar counts={c}/>

        <div className="cm-hw-tiles">
          <div className="cm-hw-tile"><b>{c.reviewed}</b><span>Reviewed</span></div>
          <div className="cm-hw-tile"><b>{c.waiting}</b><span>Waiting</span></div>
          <div className="cm-hw-tile is-missing"><b>{c.missing}</b><span>Missing</span></div>
        </div>

        {hw.detail && <p className="cm-hw-detail">{hw.detail}</p>}

        {/* A child's own state. This is the whole screen for them — the class
            roster below is a mentor's view and they never see it. */}
        {!hw.canNudge && hw.mine && hw.mine.asked && (
          <div className={"cm-hw-mine" + (hw.mine.submittedAt ? " is-in" : "")}>
            {hw.mine.submittedAt ? (
              <>
                <b>You handed this in {cmAgo(hw.mine.submittedAt)} ago.</b>
                <span>{hw.mine.reviewedAt ? "A mentor has looked at it." : "Waiting for a mentor to look at it."}</span>
              </>
            ) : (
              <>
                <b>You have not handed this in yet.</b>
                <span>Post your work in {hw.channel.name}, then mark it done here.</span>
                <button className="cmm-cta" onClick={submit} disabled={busy === "me"}>
                  {busy === "me" ? "Saving…" : "I have handed it in"}
                </button>
              </>
            )}
          </div>
        )}
        {!hw.canNudge && hw.mine && !hw.mine.asked && (
          <p className="cm-hw-detail">This task was set before you joined, so it is not yours to hand in.</p>
        )}

        {/* Mentor only, and served mentor-only: who has not handed in their
            homework is not a fact the rest of the class is entitled to. */}
        {hw.canNudge && (
          <>
            <CmSeg label="Which list" value={tab} onChange={setTab}
                   options={[["outstanding", "Outstanding"], ["submitted", "Submitted"]]}/>

            {say && <p className="cm-hw-say" role="status">{say}</p>}

            {list.length === 0 && (
              <CmEmpty icon={tab === "outstanding" ? "✓" : "—"}
                       title={tab === "outstanding" ? "Everybody has handed in" : "Nothing handed in yet"}
                       body={tab === "outstanding"
                         ? "All " + c.asked + " of them. Nothing to chase."
                         : "The first hand-in will appear here."}/>
            )}

            {list.map(p => (
              <div className="cm-hw-row" key={p.memberId}>
                {cmAvatar(p.name, p.memberId, p.photo, "cm-hw-av")}
                <div className="cm-hw-who">
                  <span className="cm-hw-name">{p.name}</span>
                  <span className="cm-hw-ctx">{p.context}</span>
                </div>
                {tab === "outstanding" ? (
                  <button className="cm-hw-nudge" onClick={() => nudge(p.memberId)}
                          disabled={!p.nudgeable || !!busy}
                          title={p.nudgeable ? "" : "Already nudged today."}>
                    {p.nudgeable ? "Nudge" : "Nudged"}
                  </button>
                ) : (
                  <button className="cm-hw-nudge" onClick={() => review(p.memberId)}
                          disabled={!!p.reviewedAt || !!busy}>
                    {p.reviewedAt ? "Reviewed" : "Mark reviewed"}
                  </button>
                )}
              </div>
            ))}

            {tab === "outstanding" && (hw.outstanding || []).length > 0 && (
              <div className="cm-hw-all">
                <button className="cm-hw-allbtn" onClick={() => nudge("")}
                        disabled={hw.nudgeableNow === 0 || !!busy}>
                  {busy === "all" ? "Sending…"
                    : hw.nudgeableNow === 0 ? "Everyone has been nudged today"
                    : "Nudge all " + hw.nudgeableNow + " outstanding"}
                </button>
                {/* The design prints this sentence on the screen. It is the
                    promise the whole feature rests on, so it is rendered where
                    the mentor is standing when they make it. */}
                <p className="cm-hw-rule">Nudges arrive as one notification, never a public message.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CmHwHead({ onBack, title, sub }) {
  return (
    <header className="cmm-head cmm-head-back">
      <button className="cmm-icon-btn" onClick={onBack} aria-label="Back">{cmUiIcon("back", 22)}</button>
      <div className="cmm-head-txt">
        <h1 className="cmm-h1">{title}</h1>
        {sub && <p className="cmm-sub">{sub}</p>}
      </div>
    </header>
  );
}

/* ⓘ — everything the header had to truncate, in full.
 *
 * A disclosure, not a modal: it hangs under the button that opened it and the
 * channel stays live behind it, because "what is this room for" is a question
 * you ask WHILE reading, not instead of reading. Escape closes it, and so does
 * a click anywhere outside — a panel you can only dismiss with its own ✕ is a
 * panel people leave open. */
function CmChannelInfo({ ch, members, centres, onFiles, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onDown = (e) => {
      const el = ref.current;
      if (!el || el.contains(e.target)) return;
      // The ⓘ button toggles itself; closing here too would re-open it.
      if (e.target.closest && e.target.closest(".cmd-ch-btn")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [onClose]);
  const mentors = (members || []).filter(m => m.staff);
  return (
    <div className="cmd-chinfo" ref={ref} role="group" aria-label={"About " + ch.name}>
      <div className="cmd-chinfo-top">
        <h2 className="cmd-chinfo-h">{ch.name}</h2>
        <button className="cmd-chinfo-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {ch.description
        ? <p className="cmd-chinfo-p">{ch.description}</p>
        : <p className="cmd-chinfo-p cmd-chinfo-none">No one has written what this channel is for yet.</p>}
      <dl className="cmd-chinfo-facts">
        {centres && <><dt>Centres</dt><dd>{centres}</dd></>}
        <dt>People</dt>
        <dd>{members === null ? "…" : members.length + (members.length === 1 ? " has" : " have") + " posted here"}</dd>
      </dl>
      {/* The roster itself. Handoff §11: it moved out of a permanent rail and
          in here, so this panel has to actually carry it — a count is not a
          roster, and "who is in this room" is the question the rail answered. */}
      {/* Loading is a skeleton at the roster's own geometry, not a spinner and
          not nothing: this panel IS the roster now, so an empty gap while it
          arrives reads as "nobody is in this channel". */}
      {members === null && (
        <ul className="cmd-chinfo-roster" aria-live="polite" aria-label="Loading the members">
          {[0, 1, 2].map(i => (
            <li key={i} className="is-skel" aria-hidden="true">
              <span className="cmd-chinfo-av cmm-skel-av"/>
              <span className="cmm-skel-line" style={{ width: i === 1 ? "38%" : "52%" }}/>
            </li>
          ))}
        </ul>
      )}
      {members && members.length === 0 && (
        <p className="cmd-chinfo-p cmd-chinfo-none">Nobody has posted here yet.</p>
      )}
      {members && members.length > 0 && (
        <ul className="cmd-chinfo-roster">
          {members.map(m => (
            <li key={m.name + m.centre}>
              {cmAvatar(m.name, m.name + m.centre, m.photo, "cmd-chinfo-av", m.staff ? "mentor" : "")}
              <span className="cmd-chinfo-name">{m.name}</span>
              {m.staff && <span className="cmm-tag is-mentor">mentor</span>}
              <span className="cmd-chinfo-centre">{m.centre}</span>
            </li>
          ))}
        </ul>
      )}
      {ch.rules && (
        <div className="cmd-chinfo-rules">
          <span className="cmd-chinfo-rules-h">House rules</span>
          <p>{ch.rules}</p>
        </div>
      )}
      <button className="cmd-chinfo-files" onClick={onFiles}>
        {cmUiIcon("files", 17)} Everything shared here
      </button>
    </div>
  );
}

function CmChannel({ slug, channels, auth, onBack, onOpenThread, onCompose, counts, onCounts, onOpenFiles, onOpenHomework, dockComposer, wide }) {
  const [posts, setPosts] = React.useState(null);
  const [members, setMembers] = React.useState(null);
  const [fresh, setFresh] = React.useState(null);
  const [unreadMark, setUnreadMark] = React.useState(0);
  const [digest, setDigest] = React.useState(null);
  const [dismissedCatchup, setDismissed] = React.useState(false);
  const [sheetFor, setSheetFor] = React.useState(null);
  /* The three header controls the artboard puts to the right of the channel
     name. Each one changes what is on screen — none of them is decoration.
       sort      Newest | Most replied. The feed already ranks both ways
                 server-side; this is the same `sort` the API has always taken.
       savedOnly Narrows to what THIS member bookmarked, over the messages
                 loaded here. The empty state says so, and points at Saved,
                 which holds every one of them.
       info      Purpose, centres, mentors, files. Everything the header
                 truncates, in full, in one place. */
  const [sort, setSort] = React.useState("latest");
  /* The channel's newest open task. Null means there is none, which is the
     common case and renders nothing — a homework strip on a channel with no
     homework is furniture. */
  const [hw, setHw] = React.useState(null);
  const [hwBusy, setHwBusy] = React.useState(false);
  /* §12: who is typing, which replaces the member count in the subtitle for as
     long as it is true and never for longer. */
  const [typing, setTyping] = React.useState("");
  const [savedOnly, setSavedOnly] = React.useState(false);
  const [info, setInfo] = React.useState(false);
  const streamRef = React.useRef(null);
  const atBottom = React.useRef(true);
  const postsRef = React.useRef([]);
  const ch = channels.find(c => c.slug === slug) || { name: slug, slug };
  const mem = auth.member || {};
  // The viewer's own capability, served once with the counts. Derived from
  // the first post it vanished on an empty channel — exactly where a mentor
  // most needs their tools.
  const staff = !!counts.staff;

  React.useEffect(() => { postsRef.current = posts || []; }, [posts]);

  /* Three states, not two.
     A dropped connection used to `setPosts([])`, which renders the empty-channel
     copy — "be the first to post something" — in a channel holding two hundred
     messages. Failure and emptiness are different facts and must not share a
     screen. */
  const [loadErr, setLoadErr] = React.useState(false);
  const [reloadTick, setReload] = React.useState(0);

  React.useEffect(() => {
    setPosts(null); setFresh(null); setDismissed(false); setLoadErr(false);
    setSavedOnly(false); setInfo(false);
    setUnreadMark(ch.unread || 0);
    NGGApi.member.community.feed(slug, sort, 0)
      .then(r => { setPosts(r.posts || []); setLoadErr(false); })
      .catch(() => { setPosts([]); setLoadErr(true); });
    NGGApi.member.community.members(slug)
      .then(r => setMembers(r.members || [])).catch(() => setMembers([]));
    setHw(null);
    NGGApi.member.community.homework(slug, "")
      .then(r => setHw(r.homework || null)).catch(() => setHw(null));
    const t = setTimeout(() => {
      NGGApi.member.community.markRead(slug).then(() => onCounts()).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
    /* `sort` is deliberately NOT reset when the channel changes: a member who
       asked for "Most replied" meant it about the community, not about one
       room. savedOnly is, because a filter that survives a navigation is a
       filter people forget is on. */
  }, [slug, sort, reloadTick]); // eslint-disable-line

  /* Polling, and the rule the bundle is emphatic about: NEVER auto-scroll.
     A message arriving while somebody is reading three screens up should not
     move the page under their thumb. It offers a pill instead. */
  React.useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      NGGApi.member.community.feed(slug, sort, 0).then(r => {
        setLoadErr(false);
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
  }, [slug, sort]);

  /* Typing is read on its own, faster, timer. A 20-second poll cannot show a
     five-second fact — by the time it arrived it would be a lie. It is a
     separate request because it is a tiny one, it stops the moment the tab is
     hidden, and it is the only thing on this screen that needs this cadence.
     Nothing is written here: a reader who never types costs nothing but this
     read. */
  React.useEffect(() => {
    let dead = false;
    const tick = () => {
      if (document.hidden) return;
      NGGApi.member.community.typingWho(slug)
        .then(r => { if (!dead) setTyping(r.says || ""); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { dead = true; clearInterval(id); setTyping(""); };
  }, [slug]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    atBottom.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 120;
    if (atBottom.current && fresh) { setPosts(fresh); setFresh(null); }
  };
  const jumpToNew = () => {
    if (fresh) { setPosts(fresh); setFresh(null); }
    const el = streamRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: cmScrollBehavior() });
  };

  const patch = (postId, p) => setPosts(ps => (ps || []).map(x => x.postId === postId ? { ...x, ...p } : x));
  const remove = (postId) => setPosts(ps => (ps || []).filter(x => x.postId !== postId));

  /* Chronological for "Newest" — oldest at the top, the way a conversation
     reads. "Most replied" is a RANKING, so it is not reversed: turning a
     ranking upside down puts the quietest post first and calls it sorted. */
  const ordered = React.useMemo(() => {
    if (!posts) return posts;
    const base = sort === "latest" ? [...posts].reverse() : posts;
    return savedOnly ? base.filter(p => p.bookmarked) : base;
  }, [posts, sort, savedOnly]);
  const chrono = ordered;
  const savedCount = React.useMemo(() => (posts || []).filter(p => p.bookmarked).length, [posts]);
  /* The NEW line counts back from the end of the chronological list. It means
     nothing over a ranking or a filtered subset, so it is not drawn there. */
  const dividerAt = (chrono && unreadMark > 0 && sort === "latest" && !savedOnly)
    ? Math.max(0, chrono.length - unreadMark) : -1;
  const newCount = fresh ? fresh.filter(x => !(posts || []).some(p => p.postId === x.postId)).length : 0;

  /* Which centres are in the room, most-represented first. Derived from who
     has actually posted, so it cannot go stale the way a hand-set field does.
     Two names fit the chip; beyond that it counts. */
  const centres = React.useMemo(() => {
    if (!members || !members.length) return "";
    const tally = new Map();
    for (const m of members) {
      const c = (m.centre || "").trim();
      if (c) tally.set(c, (tally.get(c) || 0) + 1);
    }
    const names = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]);
    if (!names.length) return "";
    if (names.length <= 2) return names.join(" + ");
    return names.slice(0, 2).join(" + ") + " +" + (names.length - 2);
  }, [members]);

  const mentors = members ? members.filter(m => m.staff) : [];
  const memberLine = members === null
    ? "…"
    : members.length + (members.length === 1 ? " member" : " members")
      + (mentors.length ? " · " + mentors.length + " mentor" + (mentors.length === 1 ? "" : "s") : "");
  /* The stack shows three faces. What it MEANS — who, and how many more — has
     to be readable too, so the same sentence is the tooltip and the
     screen-reader text. "+21" alone is a number nobody can act on. */
  const presenceTitle = members && members.length
    ? members.slice(0, 3).map(m => m.name).join(", ")
      + (members.length > 3 ? " and " + (members.length - 3) + " more" : "")
      + " have posted here"
    : "";

  /* The digest's two named actions (handoff §11). Both are instant and free —
     no model call — which is why they are the ones on the card by default and
     "Catch me up", which does cost something, is the third. */
  const jumpToUnread = () => {
    const el = streamRef.current;
    const line = el && el.querySelector(".cmm-newline");
    if (line) line.scrollIntoView({ block: "center", behavior: cmScrollBehavior() });
    else if (el) el.scrollTo({ top: el.scrollHeight, behavior: cmScrollBehavior() });
  };
  const markAllRead = () => {
    setUnreadMark(0); setDismissed(true);
    NGGApi.member.community.markRead(slug).then(() => onCounts && onCounts()).catch(() => {});
  };

  const catchUp = () => {
    setDigest({ loading: true });
    NGGApi.member.community.digest(slug)
      .then(r => setDigest({ text: r.digest, ai: r.ai }))
      .catch(() => setDigest({ text: "Couldn't summarise right now." }));
  };

  return (
    <div className="cmm-screen cmm-channel">
      <header className="cmm-ch-head">
        {/* No back chevron on a desktop: the channel list is a permanent pane
            eighteen pixels to the left, so "back" would go nowhere you are not
            already looking. */}
        {!wide && (
          <button className="cmm-icon-btn" onClick={onBack} aria-label="Back to channels">{cmUiIcon("back", 22)}</button>
        )}
        <span className="cmm-ch-av sm" aria-hidden="true">{ch.icon || "#"}</span>
        <div className="cmm-head-txt">
          <div className="cmm-ch-titlerow">
            <h1 className="cmm-ch-title">{ch.name}</h1>
            {/* Which centres are actually in the room, from who has posted —
                not from a field somebody set once and never revisited. */}
            {wide && centres && <span className="cmm-ch-centres">{centres}</span>}
          </div>
          {/* "…replacing the static member count only while someone types."
              Green, and it says the name — a bare "someone is typing" in a room
              of twenty-four is not information. It is a live region so a
              screen-reader user is told once rather than on every poll. */}
          <p className={"cmm-sub" + (typing ? " is-typing" : "")} aria-live="polite">
            {typing || (wide && ch.description ? ch.description : memberLine)}
          </p>
        </div>

        {wide ? (
          <div className="cmd-ch-tools">
            {/* Presence: who has actually posted here. No invented "online"
                dots — a green light that does not mean anything is worse than
                none. The overlap is the artboard's -8px. */}
            {members && members.length > 0 && (
              <span className="cmd-ch-stack" title={presenceTitle}>
                {members.slice(0, 3).map(m => (
                  <span key={m.name + m.centre} className="cmd-ch-face"
                        style={{ background: cmColor(m.name, m.staff ? "mentor" : ""),
                                 color: inkOn(cmColor(m.name, m.staff ? "mentor" : "")).ink }}
                        aria-hidden="true">{cmInitial(m.name)}</span>
                ))}
                {members.length > 3 && <span className="cmd-ch-face more" aria-hidden="true">+{members.length - 3}</span>}
                <span className="sr-only">{presenceTitle}</span>
              </span>
            )}
            <CmSeg label="Sort messages" value={sort} onChange={setSort}
                   options={[["latest", "Newest"], ["trending", "Hot"]]}/>
            <button className={"cmd-ch-btn" + (savedOnly ? " is-on" : "")}
                    onClick={() => setSavedOnly(v => !v)} aria-pressed={savedOnly}
                    aria-label={"Only saved messages" + (savedCount ? " (" + savedCount + ")" : "")}
                    title={"Only saved messages" + (savedCount ? " (" + savedCount + ")" : "")}>
              {cmUiIcon("bookmark", 16)}
            </button>
            <button className={"cmd-ch-btn" + (info ? " is-on" : "")}
                    onClick={() => setInfo(v => !v)} aria-expanded={info}
                    aria-label="About this channel" title="About this channel">
              {cmUiIcon("info", 17)}
            </button>
          </div>
        ) : (
          /* Files live one tap from the conversation they were shared in — the
             only place anybody looks for them. On a desktop they moved into
             the ⓘ panel, where the rest of the channel's facts already are. */
          <button className="cmm-icon-btn" onClick={() => onOpenFiles(slug)} aria-label="Files in this channel">
            {cmUiIcon("files", 21)}
          </button>
        )}
      </header>

      {/* §12: the homework strip, on the amber surface, leading to the tracker.
          Phone only — on a desktop the same task is the widget beside the
          digest, and showing both would be the same number twice. */}
      {!wide && hw && (
        <button className="cm-hw-strip" onClick={() => onOpenHomework(hw.homeworkId)}>
          <span className="cm-hw-strip-eye">
            Homework{hw.dueAt ? " · due " + cmHwDue(hw.dueAt) : ""}
          </span>
          <span className="cm-hw-strip-t">{hw.title}</span>
          <span className="cm-hw-strip-n">
            <b>{hw.counts.submitted}</b> of {hw.counts.asked} submitted
          </span>
          <span className="cm-hw-strip-go" aria-hidden="true">{cmUiIcon("chev", 18)}</span>
        </button>
      )}

      {wide && info && (
        <CmChannelInfo ch={ch} members={members} centres={centres}
                       onFiles={() => { setInfo(false); onOpenFiles(slug); }}
                       onClose={() => setInfo(false)}/>
      )}

      {/* On a phone the header has no room for a presence stack, so it keeps
          its own band underneath. */}
      {!wide && members && members.length > 0 && (
        <div className="cmm-presence">
          {/* Three faces and a count, as in the header on a desktop — not five.
              §3 puts avatars, the purpose AND the control on one row, and at
              390px five avatars left the purpose as "Prompting, too…", which
              is a line of text doing no work at all. Three says the same thing
              in 54px less, and the count is the honest total. */}
          <span className="cmm-stack">
            {members.slice(0, 3).map(m => (
              <span key={m.name + m.centre} className="cmm-stack-av" aria-hidden="true"
                    style={{ background: cmColor(m.name, m.staff ? "mentor" : "") }}>{cmInitial(m.name)}</span>
            ))}
            {members.length > 3 && (
              <span className="cmm-stack-av is-more" aria-hidden="true">+{members.length - 3}</span>
            )}
            <span className="sr-only">{presenceTitle}</span>
          </span>
          {ch.description && <span className="cmm-purpose">{ch.description}</span>}
          <CmSeg label="Sort messages" value={sort} onChange={setSort} className="cmm-presence-seg"
                 options={[["latest", "Newest"], ["trending", "Hot"]]}/>
        </div>
      )}

      {/* Catch me up — only when there IS something to catch up on, and
          dismissible. A permanent banner is furniture nobody reads. */}
      {/* §11 puts the digest and the tracker side by side in one row above the
          conversation. As two absolutely-placed blocks the widget sat on top
          of the channel header; as a flex row they simply share the width, and
          either one can be absent without the other moving. */}
      {wide && (unreadMark > 0 && !dismissedCatchup || hw) && (
        <div className="cmd-toprow">
      {wide && unreadMark > 0 && !dismissedCatchup && (
        <div className="cmd-digest">
          <div className="cmd-digest-eyebrow">
            <span className="cmd-spark" aria-hidden="true">✦</span>
            While you were away · {unreadMark} {unreadMark === 1 ? "message" : "messages"}
          </div>
          {digest && (
            <p className="cmd-digest-body" role="status">
              {digest.loading ? "Summarising…" : digest.text}
            </p>
          )}
          <div className="cmd-digest-acts">
            <button className="cmd-digest-go" onClick={jumpToUnread}>Jump to first unread</button>
            <button className="cmd-digest-alt" onClick={markAllRead}>Mark all read</button>
            {!digest && <button className="cmd-digest-alt" onClick={catchUp}>Catch me up</button>}
          </div>
          <button className="cmd-digest-x" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {wide && hw && (
        <div className="cmd-hw-slot">
          <CmHwWidget hw={hw} busy={hwBusy}
                      onOpen={() => onOpenHomework(hw.homeworkId)}
                      onNudgeAll={() => {
                        setHwBusy(true);
                        NGGApi.member.community.homeworkNudge(hw.homeworkId, "", true)
                          .then(() => NGGApi.member.community.homework(slug, "").then(r => setHw(r.homework || null)))
                          .catch(() => {})
                          .finally(() => setHwBusy(false));
                      }}/>
        </div>
      )}
        </div>
      )}

      {/* §12: the catch-me-up card — dismissible, unreads only, with Jump to
          unread / Mark read. Those are the bundle's phone strings; the desktop
          digest says "Jump to first unread" / "Mark all read" and the
          difference is deliberate in the design, so both are kept as written.
          The actions moved onto their own row: at 390px, one title, a count
          and three controls on a single line wrapped "While you were away"
          across two lines and left the card looking broken. */}
      {!wide && unreadMark > 0 && !dismissedCatchup && (
        <div className="cmm-catchup">
          <div className="cmm-catchup-txt">
            <b>While you were away</b>
            <span>{unreadMark} {unreadMark === 1 ? "message" : "messages"}</span>
          </div>
          {digest && (
            <p className="cmm-catchup-sum" role="status">
              {digest.loading ? "Summarising…" : digest.text}
            </p>
          )}
          <div className="cmm-catchup-acts">
            <button className="cmm-catchup-go" onClick={jumpToUnread}>Jump to unread</button>
            <button className="cmm-catchup-alt" onClick={markAllRead}>Mark read</button>
            {!digest && <button className="cmm-catchup-alt" onClick={catchUp}>Catch me up</button>}
          </div>
          <button className="cmm-catchup-x" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {!wide && digest && (
        <div className="cmm-digest" role="status">
          {digest.loading ? "Summarising…" : digest.text}
          {!digest.loading && <button className="cmm-catchup-x" onClick={() => setDigest(null)} aria-label="Dismiss">✕</button>}
        </div>
      )}

      <div className="cmm-stream" ref={streamRef} onScroll={onScroll}>
        {chrono === null && <CmSkeleton rows={4}/>}
        {chrono && chrono.length === 0 && loadErr && (
          <CmEmpty icon="!" title="Couldn't load this channel"
                   body="The messages are still there — the connection dropped on the way. Try again."
                   action={<button className="cmm-cta" onClick={() => setReload(n => n + 1)}>Try again</button>}/>
        )}
        {/* A filter that finds nothing must say it is a filter. This used to
            fall through to "Be the first to say something" in a channel with
            two hundred messages in it. */}
        {chrono && chrono.length === 0 && !loadErr && savedOnly && (
          <CmEmpty icon="🔖" title="Nothing saved here yet"
                   body={"None of the messages loaded in " + ch.name + " are saved. Saved, in the left rail, has every one you have kept."}
                   action={<button className="cmm-cta" onClick={() => setSavedOnly(false)}>Show every message</button>}/>
        )}
        {chrono && chrono.length === 0 && !loadErr && !savedOnly && (
          <CmEmpty icon="#" title="Nothing here yet"
                   body={"Be the first to say something in " + ch.name + "."}
                   action={<button className="cmm-cta" onClick={onCompose.open}>Write a message</button>}/>
        )}
        {/* A failure that arrives while messages are already on screen is a
            quiet banner, not an empty state — the ones you have are still good. */}
        {chrono && chrono.length > 0 && loadErr && (
          <div className="cmm-staleban" role="status">
            Can't reach the community right now — showing what you already had.
            <button onClick={() => setReload(n => n + 1)}>Retry</button>
          </div>
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

      {/* Docked composer — the artboard pins one to the bottom of the channel
          pane. On a phone the FAB opens it as a sheet, because a permanent
          composer on a 390px screen eats a fifth of the messages. Here there
          is room, and a channel you cannot type into is a channel you are
          reading rather than one you are in. */}
      {dockComposer && (
        <div className="cmd-composer">
          <CmComposer channels={channels} active={slug} me={(auth.member || {}).fullName}
                      enterToSend
                      onPosted={() => { setReload(t => t + 1); onCounts && onCounts(); }}/>
        </div>
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
function CmMobileMessage({ post, prev, me, onPatch, onRemove, onOpenThread, onLongPress, card, showChannel, onOpenChannel }) {
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
              {post.author.staff && <span className="cmm-tag is-mentor">mentor</span>}
              {post.author.isMe && <span className="cmm-tag is-you">you</span>}
            </span>
            <span className="cmm-msg-time">
              {cmAgo(post.createdAt)}{post.author.centre ? " · " + post.author.centre : ""}
            </span>
          </div>
          {showChannel && post.channel && (
            onOpenChannel
              ? <button className="cm-card-chan is-link" onClick={(e) => { e.stopPropagation(); onOpenChannel(post.channel.slug); }}
                        aria-label={"Open " + post.channel.name}>{post.channel.icon || "#"} {post.channel.name}</button>
              : <span className="cm-card-chan">{post.channel.icon || "#"} {post.channel.name}</span>
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
/* Wide enough for the bundle's desktop panes (handoff §11, artboard 3A).
   matchMedia rather than a CSS-only rearrangement, for the reason the chess
   board already gives: two of the panes do not exist on a phone at all, and
   building them to hide them costs a member on a handset requests they never
   needed. 1024 is where the stylesheet already switches. */
function useCmWide(px) {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    if (!window.matchMedia) return;
    const q = window.matchMedia("(min-width: " + (px || 1024) + "px)");
    const on = () => setWide(q.matches);
    on();
    if (q.addEventListener) { q.addEventListener("change", on); return () => q.removeEventListener("change", on); }
    q.addListener(on); return () => q.removeListener(on);
  }, [px]);
  return wide;
}

/* ══════════════════════════════════════════════════════════════════════════
   The desktop chrome — handoff §11, artboard 3A.

   Everything here renders ONLY at ≥1024px and has no phone equivalent, which
   is why it is its own set of components rather than a stylesheet trick: a
   global command bar, a five-destination rail and a channel list with its own
   filter tabs do not exist on a 390px screen at all, and building them to hide
   them costs a member on a handset markup they never see.

   Geometry is taken from the artboard rather than approximated: 54px bar,
   68px rail with 46px items, 268px channel pane at radius 18, 34px channel
   avatars at radius 11, 38px channel-header avatar at radius 12.
   ══════════════════════════════════════════════════════════════════════════ */

function cmRailIcon(name) {
  const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const wrap = (d) => <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;
  if (name === "today")    return wrap(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...P}/>);
  if (name === "channels") return wrap(<path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" {...P}/>);
  if (name === "arcade")   return wrap(<><circle cx="12" cy="12" r="9" {...P}/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none"/></>);
  if (name === "journal")  return wrap(<><rect x="5" y="4" width="14" height="16" rx="2" {...P}/><path d="M9 9h6M9 13h6" {...P}/></>);
  if (name === "saved")    return wrap(<path d="M7 4h10v16l-5-3.5L7 20V4Z" {...P}/>);
  return null;
}

/* The 54px global bar. The community had the marketing site's nav above it —
   Home, Programs, My dashboard — which is a website with an app bolted
   underneath, not the workspace the artboard draws. */
function CmDeskBar({ auth, counts, onCommand, onCatchUp, onNotifs, onAccount }) {
  const mem = (auth && auth.member) || {};
  return (
    <div className="cmd-bar">
      <div className="cmd-brand">
        <span className="cmd-mark" aria-hidden="true">N</span>
        <span className="cmd-brand-n">The Community</span>
        <span className="cmd-brand-tag">NGG</span>
      </div>
      {/* A real button, not a decorative box: it opens the jump sheet, which is
          the same surface the phone reaches from its search field. */}
      <button className="cmd-jump" onClick={onCommand}>
        {cmUiIcon("search", 15)}
        <span className="cmd-jump-t">Jump to a channel, person, entry — or type <b>/</b> for a command</span>
        <span className="cmd-kbd" aria-hidden="true">⌘K</span>
      </button>
      <div className="cmd-right">
        <button className="cmd-catch" onClick={onCatchUp}>
          <span className="cmd-spark" aria-hidden="true">✦</span>Catch me up
        </button>
        <button className="cmd-icon" onClick={onNotifs}
                aria-label={"Notifications" + (counts.mentions ? ", " + counts.mentions + " unread" : "")}>
          {cmUiIcon("bell", 17)}
          {counts.mentions > 0 && <span className="cmd-badge" aria-hidden="true">{counts.mentions}</span>}
        </button>
        <button className="cmd-me" onClick={onAccount} aria-label="Your account">
          {cmAvatar(mem.fullName || "You", mem.memberId || "you", mem.photoUrl, "cmd-me-av", "you")}
        </button>
      </div>
    </div>
  );
}

/* The 268px channel pane. Not CmChannels with different padding: the artboard
   gives it filter tabs, a compose button, a DIRECT section and a keyboard
   hint, none of which the phone's channel TAB has. */
function CmDeskChannels({ channels, current, onOpen, onCompose }) {
  const [tab, setTab] = React.useState("all");
  const joined = channels.filter(c => !c.discover);
  const unread = joined.filter(c => c.unread > 0);
  const shown = tab === "unread" ? unread : joined;
  const unreadTotal = unread.length;

  const Row = (c) => (
    <button key={c.slug} className={"cmd-row" + (current === c.slug ? " is-on" : "")}
            onClick={() => onOpen(c.slug)} aria-current={current === c.slug ? "page" : undefined}>
      <span className="cmd-row-av" aria-hidden="true">{c.icon || (c.name || "#").slice(0, 1)}</span>
      <span className="cmd-row-txt">
        <span className="cmd-row-n">{c.name}</span>
        <span className="cmd-row-p">{c.lastMessage || c.description || "No messages yet"}</span>
      </span>
      {c.unread > 0
        ? <span className="cmd-row-badge">{c.unread > 99 ? "99+" : c.unread}</span>
        : <span className="cmd-row-t">{c.lastAt ? cmAgo(c.lastAt) : ""}</span>}
    </button>
  );

  return (
    <div className="cmd-chans">
      <div className="cmd-chans-hd">
        <h2 className="cmd-chans-h">Channels</h2>
        <button className="cmd-plus" onClick={onCompose} aria-label="Write a post">
          {cmUiIcon("plus", 16)}
        </button>
      </div>
      <CmSeg label="Filter channels" value={tab} onChange={setTab}
             options={[["all", "All"], ["unread", "Unread" + (unreadTotal ? " " + unreadTotal : "")], ["mine", "Mine"]]}/>
      <div className="cmd-rows">
        {!channels.length && <CmSkeleton rows={4}/>}
        {shown.map(Row)}
        {tab === "unread" && !unread.length && (
          <p className="cmd-none">Nothing unread. You are all caught up.</p>
        )}
        {tab === "mine" && (
          <p className="cmd-none">Channels you post in will collect here.</p>
        )}
      </div>
      {/* The artboard's footer. Stated as a hint rather than implemented as a
          shortcut, because a hint for a key combination that does nothing is
          worse than no hint — see the keydown handler in CmMobileApp. */}
      <div className="cmd-foot">
        <span className="cmd-kbd">⌥↑</span><span className="cmd-kbd">⌥↓</span> next unread
      </div>
    </div>
  );
}

function CmMobileApp({ auth, setPage, channels, reloadChannels }) {
  const [tab, setTab] = React.useState("today");
  const [channel, setChannel] = React.useState(null);   // open channel slug
  const [thread, setThread] = React.useState(null);     // open post
  /* Widened once, stays widened. Somebody who asked for a bigger thread asked
     about how they read threads, not about this one post. */
  const [threadWide, setThreadWide] = React.useState(false);
  const [homework, setHomework] = React.useState(null);   // open tracker, by id
  /* §8: which journal, and the writer overlay over it. Scroll is preserved per
     tab by keeping both mounted decisions here rather than remounting. */
  const [jTab, setJTab] = React.useState("mine");
  const [writing, setWriting] = React.useState(null);     // {prompt, entry, attach}
  const [account, setAccount] = React.useState(false);
  const [composer, setComposer] = React.useState(false);
  const [jump, setJump] = React.useState(false);
  const [files, setFiles] = React.useState(null);      // slug whose Files are open
  const [composeSeed, setComposeSeed] = React.useState(null);  // {cmd, body} from the jump sheet
  const [counts, setCounts] = React.useState({ unread: 0, mentions: 0, saved: 0, staff: false });
  const [todayFilter, setTodayFilter] = React.useState("all");
  const [notifs, setNotifs] = React.useState(false);
  const [a11y, setA11y] = React.useState(false);
  const [jumpScope, setJumpScope] = React.useState("all");
  const [offline, setOffline] = React.useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const wide = useCmWide(1024);
  const mem = auth.member || {};

  /* Two things that have to happen once, before anything else is drawn.
     The stored text size, so a member who needs larger type never sees a frame
     of the default; and a ?post= deep link, which is what "Copy link" produces
     and what a notification email points at — it opened the community and then
     did nothing at all with the id it was handed. */
  React.useEffect(() => { cmApplyTextSize(cmStoredTextSize()); }, []);
  React.useEffect(() => {
    let pid = "";
    try { pid = new URLSearchParams(location.search).get("post") || ""; } catch (_) {}
    if (!pid) return;
    let live = true;
    NGGApi.member.community.post_get(pid)
      .then(r => { if (live && r.post) setThread(r.post); })
      .catch(() => { if (live) toast.error("That link didn't resolve to a message."); });
    return () => { live = false; };
  }, []);

  React.useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const refreshCounts = React.useCallback(() => {
    NGGApi.member.community.today()
      .then(r => setCounts({ unread: r.unread || 0, mentions: r.mentions || 0, saved: r.saved || 0, staff: !!r.staff }))
      .catch(() => {});
  }, []);
  React.useEffect(() => { refreshCounts(); }, [refreshCounts]);

  /* Back has one meaning: close the top-most thing. Wired to the hardware and
     gesture Back too, because on Android that is the button people actually
     press, and a sheet that ignores it navigates the whole app away instead. */
  const closeTop = React.useCallback(() => {
    if (files) { setFiles(null); return true; }
    if (a11y) { setA11y(false); return true; }
    if (notifs) { setNotifs(false); return true; }
    if (jump) { setJump(false); return true; }
    if (composer) { setComposer(false); return true; }
    if (account) { setAccount(false); return true; }
    if (thread) { setThread(null); return true; }
    if (channel) { setChannel(null); return true; }
    return false;
  }, [files, a11y, notifs, jump, composer, account, thread, channel]);

  /* One history entry per open layer — kept in step, both ways.
   *
   * This pushed an entry every time the layer COUNT changed and never removed
   * one, so closing a sheet with its own X left a phantom entry behind: the
   * next Back press appeared to do nothing, and after a few opens and closes
   * leaving the Community took five presses. The rule is symmetric now — going
   * deeper pushes, coming back up in-app pops, and the pops we ask for
   * ourselves are counted so the listener doesn't close a second layer on the
   * way out. */
  const owned = React.useRef(0);
  const selfPops = React.useRef(0);
  const depth = (files ? 1 : 0) + (a11y ? 1 : 0) + (notifs ? 1 : 0) + (jump ? 1 : 0) + (composer ? 1 : 0)
              + (account ? 1 : 0) + (thread ? 1 : 0) + (channel ? 1 : 0);

  React.useEffect(() => {
    const onPop = () => {
      if (selfPops.current > 0) { selfPops.current -= 1; return; }
      if (owned.current > 0) owned.current -= 1;
      closeTop();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [closeTop]);

  React.useEffect(() => {
    if (depth > owned.current) {
      for (let i = owned.current; i < depth; i++) history.pushState({ cmm: i + 1 }, "");
      owned.current = depth;
    } else if (depth < owned.current) {
      const back = owned.current - depth;
      owned.current = depth;
      selfPops.current += back;
      history.go(-back);
    }
  }, [depth]);

  // Leaving the Community entirely should not strand our entries in the stack.
  React.useEffect(() => () => {
    if (owned.current > 0) { selfPops.current += owned.current; history.go(-owned.current); owned.current = 0; }
  }, []);

  /* The tab bar hides wherever the bundle says it does: in a thread, and over
     any full-screen surface. A nav bar under a modal is a nav bar that lies.

     A thread is only full-screen on a PHONE. On a desktop it is a pane beside
     the channel (handoff §11), so the rail beside it must stay — hiding it
     there left the whole left edge of a 1280px screen empty and took away
     every destination in the product to show four replies. */
  const barHidden = (!!thread && !wide) || account || notifs || a11y || !!files || !!homework || !!writing;

  const compose = {
    open: () => { setComposeSeed(null); setComposer(true); },
    openJump: () => { setJumpScope("all"); setJump(true); },
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

  /* ⌥↑ / ⌥↓ walks the unread channels — the artboard prints that hint in the
     channel pane's footer, and a hint for a shortcut that does nothing is
     worse than no hint at all. Desktop only: there is no Alt key on a phone
     and no pane for it to move a selection in. */
  React.useEffect(() => {
    if (!wide) return;
    const onKey = (e) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const list = channels.filter(c => !c.discover && c.unread > 0);
      if (!list.length) return;
      e.preventDefault();
      const at = list.findIndex(c => c.slug === channel);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = at < 0
        ? (step > 0 ? 0 : list.length - 1)
        : (at + step + list.length) % list.length;
      openChannel(list[next].slug);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, channels, channel]);
  const openToday = (f) => { setChannel(null); setThread(null); setTab("today"); setTodayFilter(f); };

  return (
    <div className={"cmm" + (wide && thread ? " has-thread" : "") + (wide && thread && threadWide ? " thread-wide" : "")} data-screen-label="Community">
      {/* The workspace's own 54px bar. The community used to sit under the
          marketing site's nav — Home, Programs, My dashboard — which is a
          website with an app bolted underneath, not the workspace the artboard
          draws. Everything the site nav offered is still reachable: the avatar
          opens the account surface, the bell opens notifications, and the
          command bar covers search. */}
      {wide && (
        <CmDeskBar auth={auth} counts={counts}
                   onCommand={() => { setJumpScope("all"); setJump(true); }}
                   onCatchUp={() => openToday("unread")}
                   onNotifs={() => setNotifs(true)}
                   onAccount={() => setAccount(true)}/>
      )}
      {/* The channel list is its OWN pane on a desktop, and stays put.
          Handoff §11: "destinations and conversations are separate concerns,
          so switching one never hides the other." On a phone it is a tab, as
          it has always been. */}
      {wide && (
        <aside className="cmm-side" aria-label="Channels">
          <CmDeskChannels channels={channels} current={channel}
                          onOpen={openChannel} onCompose={compose}/>
        </aside>
      )}
      <div className={"cmm-body" + (barHidden ? " no-bar" : "")} onScroll={onBodyScroll}>
        {/* Base layer: whichever tab is selected. */}
        {!channel && tab === "today" && (
          <CmToday auth={auth} counts={counts} onCounts={refreshCounts}
                   filter={todayFilter} setFilter={setTodayFilter}
                   onOpenAccount={() => setAccount(true)}
                   onOpenThread={setThread} onCompose={compose}
                   onOpenChannel={openChannel} offline={offline}/>
        )}
        {/* Not on a desktop: the pane on the left is already the channel list,
            and showing it twice is how a layout tells somebody it does not
            know what it is. The rail's Chans button focuses that pane. */}
        {!channel && tab === "channels" && !wide && (
          <CmChannels channels={channels} onOpen={openChannel} onCompose={compose}/>
        )}
        {tab === "arcade" && !channel && <div className="cmm-pad"><CmArcade auth={auth}/></div>}
        {/* §8: one Journal, two tabs. "Mine" is the personal journal and the
            default, because it is the one a member has a reason to open daily;
            "Programme" is the shared record. The header carries the segmented
            control the design puts there. */}
        {tab === "journal" && !channel && (
          <div className="cmm-pad">
            <div className="cmm-head cm-j-head">
              <div className="cmm-head-txt">
                <h1 className="cmm-h1">Journal</h1>
                <p className="cmm-sub">{cmTodayWords()}</p>
              </div>
            </div>
            <CmSeg label="Which journal" value={jTab} onChange={setJTab} className="cm-j-seg"
                   options={[["mine", "Mine"], ["programme", "Programme"]]}/>
            {jTab === "mine"
              ? <CmJournalMine auth={auth} onWrite={setWriting}/>
              : <CmProgramJournal auth={auth}/>}
          </div>
        )}

        {/* A channel covers the tab it was opened from. */}
        {channel && (
          <CmChannel slug={channel} channels={channels} auth={auth}
                     onBack={() => setChannel(null)} onOpenThread={setThread}
                     onCompose={compose} counts={counts} onCounts={refreshCounts}
                     onOpenFiles={setFiles} onOpenHomework={setHomework}
                     dockComposer={wide} wide={wide}/>
        )}
      </div>

      {/* The FAB. Today and Channels only — there is nothing to compose into
          from the Arcade or the Journal, and a button that does nothing where
          it sits teaches people not to trust it. */}
      {/* No FAB where a composer is already docked. Two "write a post" controls
          eighty pixels apart, one of them sitting over the send hint, is a
          screen asking the same question twice — and the second one is not
          just noise, it is a tab stop that goes somewhere the first already
          goes. */}
      {!barHidden && !thread && !(wide && channel) && (tab === "today" || tab === "channels") && (
        <button className={"cmm-fab" + (fabHidden ? " is-away" : "")}
                onClick={() => { setComposeSeed(null); setComposer(true); }} aria-label="Write a post"
                tabIndex={fabHidden ? -1 : 0}>
          {cmUiIcon("plus", 26)}
        </button>
      )}

      {!barHidden && (
        <nav className="cmm-tabs" aria-label="Community">
          {/* Five destinations on a desktop, four on a phone. Saved is the
              artboard's fifth; on a phone it is a filter chip on Today, and a
              tab bar of five 56px items does not fit a 360px screen. */}
          {[["today", "Today", "Today"], ["channels", "Channels", "Chans"],
            ["arcade", "Arcade", "Play"], ["journal", "Journal", "Journal"]]
            .concat(wide ? [["saved", "Saved", "Saved"]] : [])
            .map(([id, label, railLabel]) => (
            <button key={id} className={"cmm-tab" + ((id === "saved" ? (tab === "today" && todayFilter === "saved") : (tab === id && !channel)) ? " is-on" : "")}
                    aria-current={tab === id && !channel ? "page" : undefined}
                    onClick={() => { if (id === "saved") { openToday("saved"); return; }
                                     setChannel(null); setTab(id); }}>
              {wide ? cmRailIcon(id === "arcade" ? "arcade" : id) : cmTabIcon(id)}
              <span className="cmm-tab-l">{wide ? railLabel : label}</span>
              {id === "today" && counts.unread > 0 && <span className="cmm-tab-dot" aria-hidden="true"/>}
              {id === "channels" && wide && counts.unread > 0 && <span className="cmm-tab-dot" aria-hidden="true"/>}
            </button>
          ))}
        </nav>
      )}

      {/* Over-layers, outermost last.
          A thread is a PANE on a desktop and an overlay on a phone. Handoff
          §11: "replying no longer costs you the channel" — taking the whole
          1280px screen away to show four replies is the phone pattern wearing
          a desktop's clothes. */}
      {thread && (
        wide
          ? <aside className={"cmm-thread" + (threadWide ? " is-wide" : "")}>
              <CmThread post={thread} me={mem.fullName} channels={channels}
                        onClose={() => setThread(null)}
                        expanded={threadWide} onExpand={() => setThreadWide(v => !v)}
                        onPatch={() => {}} onRemove={() => setThread(null)}/>
            </aside>
          : <div className="cmm-over">
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
                       /* Every row lands somewhere real. Four of them used to
                          fall through this switch and simply close the screen,
                          which reads as a tap the app ignored. */
                       if (where === "notifications") { setNotifs(true); return; }
                       if (where === "a11y") { setA11y(true); return; }
                       setAccount(false);
                       if (where === "saved") openToday("saved");
                       else if (where === "mine") openToday("mine");
                       else if (where === "people") { setJumpScope("people"); setJump(true); }
                       else if (where === "matches") { setChannel(null); setTab("arcade"); }
                     }}/>
        </div>
      )}
      {composer && (
        <CmSheet title="New post" onClose={() => { setComposer(false); setComposeSeed(null); }}>
          <CmComposer channels={channels} active={channel || "commons"} me={mem.fullName}
                      seed={composeSeed}
                      onPosted={() => { setComposer(false); setComposeSeed(null); refreshCounts(); reloadChannels(); }}/>
        </CmSheet>
      )}
      {jump && (
        <CmJumpSheet channels={channels} scope={jumpScope} setScope={setJumpScope}
                     staff={!!counts.staff}
                     onClose={() => { setJump(false); setJumpScope("all"); }}
                     onOpenChannel={openChannel}
                     onOpenThread={setThread}
                     onOpenJournal={() => { setChannel(null); setTab("journal"); }}
                     onCompose={(cmd, seed) => { setJump(false); setComposeSeed({ cmd: cmd || "", body: seed || "" }); setComposer(true); }}/>
      )}
      {notifs && (
        <div className="cmm-over">
          <CmNotifications onClose={() => setNotifs(false)}
                           onOpenThread={(p) => { setNotifs(false); setAccount(false); setThread(p); }}
                           onCounts={refreshCounts}/>
        </div>
      )}
      {a11y && (
        <div className="cmm-over"><CmTextSize onClose={() => setA11y(false)}/></div>
      )}
      {files && (
        <div className="cmm-over">
          <CmFiles slug={files} channelName={(channels.find(c => c.slug === files) || {}).name || files}
                   onBack={() => setFiles(null)}
                   onOpenThread={(p) => { setFiles(null); setThread(p); }}/>
        </div>
      )}
      {/* The writer is an overlay over everything, and the tab bar goes under
          it — the design is explicit that it is hidden in the writer. */}
      {writing && (
        <CmJournalWriter seed={writing} auth={auth}
                         onClose={() => setWriting(null)}
                         onSaved={() => { /* the list reloads when it remounts */ }}/>
      )}
      {homework && (
        <div className="cmm-over">
          <CmHomework homeworkId={homework} channel={channel || ""} auth={auth}
                      onBack={() => setHomework(null)} onCounts={refreshCounts}/>
        </div>
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
  const [chess, setChess] = React.useState(false);  // in the chess section
  const [matchId, setMatchId] = React.useState("");

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
  if (matchId) return <MatchGame matchId={matchId} onBack={() => setMatchId("")}/>;
  if (chess) return <CmChess auth={auth} onOpenMatch={setMatchId} onBack={() => setChess(false)}/>;
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
          {/* Chess is a club fixture, not a novelty — it leads, above the
              solo rounds, because a game waiting on your move is the thing
              most likely to be why somebody opened this tab. */}
          <button className="arc-chess" onClick={() => setChess(true)}>
            <span className="arc-chess-ic" aria-hidden="true">♟</span>
            <span className="arc-chess-b">
              <span className="arc-chess-h">Chess</span>
              <span className="arc-chess-s">Play a club member, take an open challenge, or play the computer offline</span>
            </span>
            <span className="arc-chess-go" aria-hidden="true">{cmUiIcon("chev", 18)}</span>
          </button>
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
   Twenty-one levels across six strands — Number, Algebra, Shape & space,
   Data, Reasoning, Calculus — from JSS number work to A-level calculus.

   It used to be one chain of twelve: level n opened when level n−1 was
   cleared. That is the wrong shape for a curriculum. An SSS 3 student who
   wanted to work on differentiation had first to clear JSS 1–2 fractions and
   eight more levels of ground they covered years ago, and statistics and
   probability were missing entirely, which is indefensible for a WAEC ladder.

   So prerequisites are now a graph: three strands open on day one, and a level
   opens when the levels it actually builds on are cleared. Trigonometry does
   not wait on Sets. The screen is grouped by strand for the same reason — a
   flat list of twenty-one cards is a scroll, six labelled strands of three or
   four is a map, and a student can see which one is theirs.

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
          Twenty-one levels across six strands — number, algebra, shape, data,
          reasoning and calculus. Start wherever your year does.
          {next ? <> Next up: <b>{next.name}</b>.</> : null}
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
  const [strand, setStrand] = React.useState("");     // "" = every strand

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

  /* The strand list is derived from the levels themselves rather than read
     from the board's own strand array. The two would have to agree, and when
     they did not — a strand with no levels in it, a level whose strand was not
     in the list — the screen would render an empty heading or silently drop a
     level. One source, in first-appearance order, which is the order the
     server uses too. */
  const strands = board ? board.levels.reduce(
    (acc, l) => (l.strand && acc.indexOf(l.strand) < 0 ? acc.concat([l.strand]) : acc), []) : [];
  const shown = board ? board.levels.filter(l => !strand || l.strand === strand) : [];

  if (paper) return <MathPaper paper={paper} onQuit={() => setPaper(null)}
                              onMarked={(r) => { setPaper(null); setMarked({ ...r, level: paper.level, name: paper.name,
                                                                             questions: paper.questions }); load(); }}/>;
  if (marked) return <MathMarked result={marked} onRetry={() => play(marked.level)}
                                onNext={() => play(marked.unlocked ? marked.unlocked.level
                                                                   : marked.level + 1)}
                                onDone={() => setMarked(null)}/>;

  return (
    <div className="ml" data-screen-label="Math Lab">
      <header className="ml-hd">
        <button className="arc-quit" onClick={onDone}>← Arcade</button>
        <div className="ml-hd-txt">
          <h1 className="ml-h">🧮 Math Lab</h1>
          <p className="ml-sub">
            Six strands. A level opens when the work it builds on is cleared —
            so you can start where your year does.
          </p>
        </div>
        {board && (
          <div className="ml-prog" role="img"
               aria-label={board.cleared + " of " + board.total + " levels cleared, "
                           + board.open + " open now"}>
            <b>{board.cleared}</b><span>/{board.total}</span>
          </div>
        )}
      </header>

      {err && <div className="arc-err" role="alert">{err}</div>}

      {!board ? (
        <div className="arc-skels">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="arc-skel"/>)}</div>
      ) : (
        <>
          {/* Twenty-one cards is a scroll. The strand filter turns it into
              three or four, and the counts on the chips mean choosing one is
              an informed choice rather than a guess at what is behind it. */}
          <div className="ml-strands" role="group" aria-label="Filter levels by strand">
            <button className={"ml-strand" + (strand === "" ? " is-on" : "")}
                    aria-pressed={strand === ""} onClick={() => setStrand("")}>
              All <span className="ml-strand-n">{board.total}</span>
            </button>
            {strands.map(sName => {
              const inIt = board.levels.filter(l => l.strand === sName);
              const done = inIt.filter(l => l.cleared).length;
              return (
                <button key={sName}
                        className={"ml-strand" + (strand === sName ? " is-on" : "")}
                        aria-pressed={strand === sName} onClick={() => setStrand(sName)}>
                  {sName} <span className="ml-strand-n">{done}/{inIt.length}</span>
                </button>
              );
            })}
          </div>

          {/* Announced, because filtering is a change the sighted user sees
              instantly and a screen-reader user otherwise never hears. */}
          <p className="ml-count" role="status">
            {shown.length === board.total
              ? board.open + (board.open === 1 ? " level is" : " levels are") + " open to you now"
              : "Showing " + shown.length + " " + strand.toLowerCase() + " "
                + (shown.length === 1 ? "level" : "levels")}
          </p>

          {strands.filter(sName => !strand || sName === strand).map(sName => {
            const inIt = shown.filter(l => l.strand === sName);
            if (!inIt.length) return null;
            return (
              <section className="ml-group" key={sName}>
                <h2 className="ml-group-h">
                  {sName}
                  <span className="ml-group-band">{inIt[0].band}{inIt.length > 1
                    && inIt[inIt.length - 1].band !== inIt[0].band
                    ? " – " + inIt[inIt.length - 1].band : ""}</span>
                </h2>
                <ol className="ml-ladder">
                  {inIt.map(l => (
                    <MathLevelCard key={l.level} level={l} passPct={board.passPct}
                                   busy={busy === l.level} onPlay={() => play(l.level)}/>
                  ))}
                </ol>
              </section>
            );
          })}

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

/* The three difficulty tiers, named once. The paper, the ladder and the
   marking all speak about them, and three names that drifted apart would be
   three different ideas as far as a student is concerned. */
const ML_TIERS = {
  1: { name: "Foundation", short: "Foundation" },
  2: { name: "Standard",   short: "Standard" },
  3: { name: "Stretch",    short: "Stretch" },
};

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
        {/* Clearing a level does not finish it — it promotes the paper, and a
            student deciding what to do next reads the ladder rather than the
            paper. Only shown once a level HAS been promoted: "Foundation
            paper — gentler forms first" on every untouched level is the same
            sentence eleven times, and a student learns it from the top of the
            first paper they open. */}
        {state === "cleared" && level.stage > 1 && (
          <p className={"ml-lv-stage is-s" + level.stage}>
            <span className="ml-lv-stage-t">{level.stageName} paper next</span>
            {level.stage === 2
              ? " — cleared, so it has moved up."
              : " — cleared above 90%, so it is the hard set now."}
          </p>
        )}
      </div>
      <div className="ml-lv-act">
        {state === "locked" ? (
          /* Named, not numbered. "Clear level 12 to open this" makes a student
             count rungs; "needs Coordinate Geometry" is a thing they can go
             and do, and it is what the server actually checked. */
          <span className="ml-lv-lock">
            Needs {level.waitingOn && level.waitingOn.length
              ? level.waitingOn.join(" and ")
              : "earlier work"}
          </span>
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
          <b>{paper.name}</b>
          <span>{paper.stageName ? paper.stageName + " · " + paper.band : paper.band}</span>
        </div>
        <div className={"arc-clock" + (urgent ? " is-urgent" : "")} role="timer" aria-live="off">
          {mm}:{ss}
        </div>
      </header>
      {/* The clock is decorative for assistive tech — a per-second live region
          is unusable. How much is answered is the signal worth announcing. */}
      <div className="sr-only" aria-live="polite">{answered} of {total} answered.</div>

      {err && <div className="arc-err" role="alert">{err}</div>}

      {paper.stageBlurb && (
        <p className="ml-paper-stage">
          <b>{paper.stageName} paper.</b> {paper.stageBlurb}{" "}
          The questions get harder as you go down.
        </p>
      )}

      <ol className="ml-qs">
        {paper.questions.map((q, idx) => {
          /* The paper arrives in tier order, so the step up happens exactly
             where the tier changes. Marking it is the difference between "the
             end of this paper is hard" and a student quietly concluding they
             have gone backwards. */
          const stepUp = idx > 0 && q.tier > paper.questions[idx - 1].tier;
          return (
          <React.Fragment key={idx}>
          {stepUp && (
            <li className="ml-q-step" aria-hidden="true">
              <span>{(ML_TIERS[q.tier] || {}).name || "Harder"} from here</span>
            </li>
          )}
          <li className={"ml-q" + (String(answers[idx]).trim() !== "" ? " is-done" : "")}>
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
          </React.Fragment>
          );
        })}
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

  /* Where the marks actually went. "You scored 60%" tells a student nothing
     they can act on; "you have the foundation and standard work, the stretch
     questions are where the marks went" tells them what to practise. The
     question tiers came down with the paper and the marks come back in the
     same order, so this is a zip — nothing extra is asked of the server, and
     no answer had to travel early to make it possible. */
  const qs = result.questions || [];
  const byTier = [1, 2, 3].map(t => {
    const idx = result.marks.map((m, i) => i).filter(i => qs[i] && qs[i].tier === t);
    return { tier: t, total: idx.length, right: idx.filter(i => result.marks[i].ok).length };
  }).filter(b => b.total > 0);
  /* Only worth drawing when the paper genuinely spanned more than one tier —
     otherwise it is a one-bar chart restating the score. */
  const showBreakdown = byTier.length > 1;
  const weakest = showBreakdown
    ? byTier.slice().sort((a, b) => (a.right / a.total) - (b.right / b.total))[0]
    : null;

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

      {/* One clear can open more than one door now — Sets opens both Logic and
          (once Statistics is done) Probability — so this lists them rather
          than naming the next number up. */}
      {result.opened && result.opened.length > 0 && (
        <div className="ml-unlock" role="status">
          🔓 {result.opened.length === 1 ? "New level open"
                                          : result.opened.length + " new levels open"}
          {" — "}
          {result.opened.map((o, i) => (
            <React.Fragment key={o.level}>
              {i > 0 && (i === result.opened.length - 1 ? " and " : ", ")}
              <b>{o.name}</b>
            </React.Fragment>
          ))}
        </div>
      )}

      {showBreakdown && (
        <section className="ml-tiers" aria-label="How the paper went by difficulty">
          <ol className="ml-tier-bars">
            {byTier.map(b => {
              const pct = Math.round((b.right / b.total) * 100);
              const label = (ML_TIERS[b.tier] || {}).name || ("Tier " + b.tier);
              return (
                <li key={b.tier} className={"ml-tier is-s" + b.tier}>
                  <div className="ml-tier-top">
                    <span className="ml-tier-n">{label}</span>
                    <span className="ml-tier-v">{b.right}/{b.total}</span>
                  </div>
                  {/* The bar is decoration; the fraction beside it is the
                      answer. A bar alone is unreadable to a screen reader and
                      unreadable at a glance on a phone. */}
                  <div className="ml-tier-bar" aria-hidden="true">
                    <div style={{ width: pct + "%" }}/>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="ml-tier-say">
            {/* "1 of 1" on its own reads as one RIGHT out of one. The count
                that helps is how many were right, said as such. */}
            {weakest && weakest.right === weakest.total
              ? "Every question on this paper, at every level of it."
              : weakest
                ? <>The <b>{((ML_TIERS[weakest.tier] || {}).name || "").toLowerCase()}</b> questions
                    are where the marks went: {weakest.right} of {weakest.total} right.</>
                : null}
          </p>
        </section>
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
        <button className="arc-sec" onClick={onDone}>Back to the strands</button>
        {result.unlocked
          ? <button className="arc-next" onClick={onNext}>Start {result.unlocked.name} →</button>
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

/**
 * Say a move out loud.
 *
 * "Nf3" read character by character is "en eff three", which is not a move.
 * Screen readers do exactly that with SAN, so the notation is expanded into
 * the words a person would actually use at a board. Everything a child is
 * taught to write stays written; only the spoken form changes.
 */
function cmSpeakSan(san) {
  let t = String(san || "");
  if (!t) return "a move";
  if (t === "O-O" || t === "0-0") return "castles kingside";
  if (t === "O-O-O" || t === "0-0-0") return "castles queenside";
  let suffix = "";
  if (/#$/.test(t)) { suffix = ", checkmate"; t = t.slice(0, -1); }
  else if (/\+$/.test(t)) { suffix = ", check"; t = t.slice(0, -1); }
  const names = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };
  // Promotion first, so "=Q" does not get read as part of the square.
  let promoted = "";
  const pm = /=([QRBN])$/.exec(t);
  if (pm) { promoted = ", promoting to " + names[pm[1]]; t = t.slice(0, -2); }
  const piece = names[t[0]] ? names[t[0]] : "pawn";
  if (names[t[0]]) t = t.slice(1);
  const takes = t.indexOf("x") >= 0;
  t = t.replace("x", "");
  // Anything left before the destination square is a disambiguating file or rank.
  const dest = t.slice(-2);
  const disamb = t.slice(0, -2);
  let out = piece;
  if (disamb) out += " on " + disamb;
  out += takes ? " takes on " : " to ";
  out += dest;
  return out + promoted + suffix;
}

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

/* ── Chess · finding a game (design turn 6A) ──────────────────────────────
   Three routes to a game, not one: search a name, take an open challenge, or
   play the computer. The third costs nothing and works with the radio off,
   which on these devices is the difference between chess being available and
   chess being available when the centre's signal happens to be up.

   The safeguarding model is the match layer's and is not weakened here: no
   free text anywhere, every game publicly watchable, reportable by anyone.
   A challenge carries a time control, a colour and a rated flag — each a fixed
   vocabulary, none of them a message. */

const CM_TIME_CONTROLS = [
  { id: "3+2",  name: "3+2",   kind: "Blitz" },
  { id: "5+3",  name: "5+3",   kind: "Blitz" },
  { id: "10+0", name: "10+0",  kind: "Rapid" },
  { id: "1day", name: "1 day", kind: "Daily" },
];

/* The variants, in the words a twelve-year-old reads once and understands.
   `rated` mirrors chess_variant_rateable() on the server: Chess960 is the same
   game with the opening book removed, so it moves a rating honestly; the two
   that change what WINNING is do not, because one number cannot measure two
   different games. The server corrects a request that disagrees — this list is
   what lets the screen say so before anybody is surprised by it. */
const CM_VARIANTS = [
  { id: "standard", name: "Standard", short: "Ordinary chess", rated: true,
    rule: "The game as it is played everywhere." },
  { id: "chess960", name: "Chess960", short: "Shuffled back row", rated: true,
    rule: "The back row is shuffled — the same for both of you. Nothing to memorise, so nobody can arrive prepared." },
  { id: "kingofthehill", name: "King of the Hill", short: "King to the middle", rated: false,
    rule: "Walk your king onto d4, d5, e4 or e5 and you win. Checkmate still wins too." },
  { id: "threecheck", name: "Three-check", short: "Check three times", rated: false,
    rule: "Check your opponent three times and you win. Checkmate still wins too." },
];
function cmVariant(id) { return CM_VARIANTS.filter(v => v.id === (id || "standard"))[0] || CM_VARIANTS[0]; }

/** The four squares that win King of the Hill. */
const CM_HILL = ["d4", "d5", "e4", "e5"];

function cmSeenAgo(iso, online) {
  if (online) return "online";
  if (!iso) return "not played yet";
  return "last seen " + cmAgo(iso);
}

/* ── House promotions ─────────────────────────────────────────────────────
   NGG telling its own members about its own programmes, inside the surfaces
   they already use. One per placement, never a stack — a chess screen with an
   ad column on it is a chess screen people stop opening.

   Three properties this component has to hold, and they are the reason it is
   worth its own component rather than being inlined:

     · it is DISMISSIBLE, and a dismissal is permanent;
     · it is visibly a promotion rather than a message from a mentor — it
       carries an eyebrow saying which programme it is from, because a child
       should always be able to tell who is talking to them;
     · the impression is counted once, when it actually renders, and not by
       whoever happened to fetch it.                                        */

function CmPromo({ placement, shape, onGo }) {
  const [promo, setPromo] = React.useState(null);
  const [gone, setGone] = React.useState(false);
  const counted = React.useRef("");
  const popup = shape === "popup";

  React.useEffect(() => {
    let alive = true;
    /* A rejected promise was already caught; a call that throws before
       returning one was not, and this component is mounted INSIDE the chess
       screen and the game screen. An announcement is the least important thing
       on either of them and must never be able to take one down — which is
       exactly what an older cached api-client against a newer bundle would
       do, and a service worker makes that a real Tuesday rather than a
       hypothetical. */
    try {
      NGGApi.member.promo(placement, shape || "card")
        .then(r => { if (alive) setPromo(r.promo || null); })
        .catch(() => {});
    } catch (_) {}
    return () => { alive = false; };
  }, [placement, shape]);

  /* Counted on RENDER, not on fetch. A prefetch that never reaches the screen
     is not an impression, and counting it makes a promotion that nobody saw
     look like one that worked. */
  React.useEffect(() => {
    if (!promo || gone || counted.current === promo.promoId) return;
    counted.current = promo.promoId;
    try { NGGApi.member.promoTrack(promo.promoId, "seen").catch(() => {}); } catch (_) {}
  }, [promo, gone]);

  if (!promo || gone) return null;

  const track = (what) => {
    try { NGGApi.member.promoTrack(promo.promoId, what).catch(() => {}); } catch (_) {}
  };
  const go = () => {
    track("click");
    if (promo.ctaPage && onGo) onGo(promo.ctaPage, promo.ctaRef);
  };
  const dismiss = () => { setGone(true); track("dismiss"); };

  const KIND = { programme: "From the programme", event: "Coming up",
                 tournament: "Tournament", notice: "Notice" };

  return (
    /* A popup is the same card, moved and announced.
     *
     * NOT a modal, deliberately. It does not trap focus, it does not darken
     * the screen, and it does not sit over the board — the game is what the
     * member came for and an announcement that blocks it is an announcement
     * they learn to dismiss without reading. It is a region a screen reader is
     * told about politely, and it goes away for good the moment it is seen
     * (see PROMO_SHAPES on the server).
     *
     * `role="status"` rather than `alert`: this is news, not an alarm, and
     * interrupting a child mid-sentence to mention the summer intake is worse
     * than waiting for them to finish. */
    <aside className={"cm-promo" + (popup ? " is-popup" : "")}
           style={promo.accent ? { "--promo-accent": promo.accent } : null}
           role={popup ? "status" : undefined} aria-live={popup ? "polite" : undefined}
           aria-label="Programme announcement">
      {promo.imageUrl && <span className="cm-promo-img" aria-hidden="true">
        <img src={cmOpt(promo.imageUrl, 320)} alt="" loading="lazy"/>
      </span>}
      <span className="cm-promo-body">
        <span className="cm-promo-eyebrow">{KIND[promo.kind] || KIND.programme}</span>
        <span className="cm-promo-h">{promo.title}</span>
        {promo.body && <span className="cm-promo-b">{promo.body}</span>}
        {promo.ctaLabel && promo.ctaPage && (
          <button className="cm-promo-cta" onClick={go}>{promo.ctaLabel} →</button>
        )}
      </span>
      {/* 44px, and it says what it does. A dismiss you cannot find is a promo
          that becomes furniture. */}
      <button className="cm-promo-x" onClick={dismiss} aria-label={"Hide this announcement: " + promo.title}>
        <span aria-hidden="true">✕</span>
      </button>
    </aside>
  );
}

/* ── Tournaments ──────────────────────────────────────────────────────────
   Everything a tournament needs on a phone, in the design system's own
   tokens. Three screens and a wizard:

     CmTrnList      the tournaments you can see — the thing that did not exist
     CmTrnDetail    standings, pairings, and your own next board
     CmTrnCreate    the director's wizard, reachable from the chess screen

   The old admin interface was a table and a three-field inline form: name, a
   programme dropdown, Create. It could not ask for a format, a time control,
   who may enter, or how many rounds — so every tournament was a centre cup at
   correspondence pace whether or not that was what anybody wanted.          */

const TRN_TC = [
  { id: "3+2",   name: "3+2",   sub: "Blitz" },
  { id: "5+3",   name: "5+3",   sub: "Blitz" },
  { id: "10+0",  name: "10+0",  sub: "Rapid" },
  { id: "15+10", name: "15+10", sub: "Rapid" },
  { id: "1day",  name: "1 day", sub: "Daily" },
];

const TRN_KINDS = [
  { id: "member",    label: "NGG members" },
  { id: "student",   label: "Summer students" },
  { id: "volunteer", label: "Volunteers" },
  { id: "staff",     label: "Staff & admins" },
];

function trnStatusChip(t) {
  /* A tournament with a start date that has passed is not taking entries any
     more, whatever its status column says. The chip has to agree with the
     join button, and both read the same computed window. */
  const w = t.window || {};
  if (t.status === "open") {
    return w.entriesClosed ? ["Entries closed", "is-live"] : ["Entries open", "is-open"];
  }
  if (t.status === "running") return ["Round " + t.round + (t.totalRounds ? " of " + t.totalRounds : ""), "is-live"];
  if (t.status === "complete") return ["Finished", "is-done"];
  return [t.status, ""];
}

/* The window as a line a player can read. Rough units on purpose: "in 3 days"
   is what somebody needs, and a second-accurate countdown to something four
   days away is a spinning number that says nothing. */
function trnWhenLine(t) {
  const w = t && t.window;
  if (!w || !w.hasWindow) return "";
  const rough = (secs) => {
    const s = Math.max(0, secs);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min";
    if (s < 86400) return Math.round(s / 3600) + (Math.round(s / 3600) === 1 ? " hour" : " hours");
    const d = Math.round(s / 86400);
    return d + (d === 1 ? " day" : " days");
  };
  if (w.overdue) return "Past its end date — " + fmtDate(w.endsAt);
  if (!w.started && w.secondsToStart != null) return "Starts in " + rough(w.secondsToStart) + " · " + fmtDateTime(w.startsAt);
  if (w.started && w.secondsLeft != null && w.secondsLeft > 0) return rough(w.secondsLeft) + " left";
  if (w.startsAt) return "Started " + fmtDateTime(w.startsAt);
  return "Ends " + fmtDateTime(w.endsAt);
}

/** mm:ss for a clock the server sent, ticked forward locally between polls. */
function trnClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  if (t < 10) return s + "." + Math.floor((Math.max(0, ms) % 1000) / 100);
  return m + ":" + String(s).padStart(2, "0");
}

/* ── The ladder ───────────────────────────────────────────────────────────
   The tournaments list answers "what is on". This answers the question a
   member actually opens the app with: what is happening right now, and where
   am I in it.

   Hot is measured in moves, not in size — see tournament_ladder() on the
   server. An arena at a Saturday session outranks a term-long Swiss with sixty
   entrants and one game a week, which is the right answer for a child deciding
   where to look.

   The movement arrow is the reason this screen exists. A table of positions is
   a fact; a table with "up two since this morning" beside it is a reason to
   come back. It compares against the standing recorded when the round was
   paired, so it is a real change rather than an arrow drawn on a guess. */

function CmLadderRow({ e, top }) {
  const move = e.move || 0;
  return (
    <li className={"lad-row" + (e.isMe ? " is-me" : "") + (e.status === "eliminated" ? " is-out" : "")}>
      <span className="lad-rank">{e.rank}</span>
      {/* An arrow AND a number AND a word for a screen reader: colour and
          shape are never the only way this is said. */}
      <span className={"lad-move" + (move > 0 ? " is-up" : move < 0 ? " is-down" : "")}>
        {move !== 0 && <>
          <span aria-hidden="true">{move > 0 ? "▲" : "▼"}{Math.abs(move)}</span>
          <span className="sr-only">{(move > 0 ? "up " : "down ") + Math.abs(move) + " places"}</span>
        </>}
      </span>
      <span className="lad-av" style={{ background: cmColor(e.name, "") }} aria-hidden="true">
        {e.photo ? <img src={cmOpt(e.photo, 64)} alt="" loading="lazy"/> : cmInitial(e.name)}
      </span>
      <span className="lad-who">
        {/* A marker rather than a suffix on the name. The highlighted row says
            "this is you" to somebody who can see it and to nobody else, so the
            word has to be there — but appended to the name it read "Adaeze N.
            · you", and on the fixture where the name IS "You", "You · you". */}
        <span className="lad-name">
          {e.name}
          {e.isMe && <span className="lad-you">you</span>}
        </span>
        <span className="lad-sub">
          {e.centre || "—"}
          {e.streak >= 2 ? <span className="lad-streak"> · {e.streak} in a row</span> : null}
        </span>
      </span>
      <span className="lad-score">{e.score % 1 === 0 ? e.score : e.score.toFixed(1)}</span>
    </li>
  );
}

function CmTrnLadder({ onOpen, onBack }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    NGGApi.member.tournaments.ladder()
      .then(r => { setData(r); setErr(false); })
      .catch(() => { setData({ ladders: [] }); setErr(true); });
  }, []);
  React.useEffect(() => { load(); }, [load]);

  /* A ladder with live boards on it changes while you are looking at it, so it
     refreshes — slowly, because this is a standings table and not a board, and
     because the data is somebody's. Stopped while the tab is hidden. */
  React.useEffect(() => {
    let timer = null, alive = true;
    const tick = () => {
      if (!alive) return;
      if (document.visibilityState !== "hidden") load();
      timer = setTimeout(tick, 20000);
    };
    timer = setTimeout(tick, 20000);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [load]);

  const ladders = (data && data.ladders) || [];

  return (
    <div className="cmm-screen">
      <header className="cmm-ch-head">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back to chess">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-ch-title">Live ladder</h1>
          <p className="cmm-sub">
            {data === null ? "…"
              : data.hotCount ? data.hotCount + (data.hotCount === 1 ? " event has" : " events have") + " games going"
              : "Nothing running just now"}
          </p>
        </div>
      </header>

      <div className="cmm-stream">
        {err && <div className="cmm-offline" role="alert">Couldn't load the ladder. It will try again.</div>}
        {data === null && <div className="cmm-skels"><div className="cmm-skel"/><div className="cmm-skel"/></div>}

        {data !== null && ladders.length === 0 && (
          <div className="cmm-empty">
            <p>No tournaments are running. When one starts, this is where you watch it move.</p>
          </div>
        )}

        {ladders.map(l => (
          <section className="lad" key={l.tournament.tournamentId}>
            <button className="lad-head" onClick={() => onOpen(l.tournament.tournamentId)}>
              <span className="lad-head-t">
                <span className="lad-name-t">{l.tournament.name}</span>
                <span className="lad-meta">
                  {l.tournament.formatName} · {cmTcName(l.tournament.timeControl)} · {l.entrants} players
                </span>
              </span>
              {/* The pulse. A count of boards actually being played beats any
                  adjective, so that is what it says. */}
              {l.heat.live > 0
                ? <span className="lad-live"><span className="lad-dot" aria-hidden="true"/>
                    {l.heat.live} board{l.heat.live === 1 ? "" : "s"} live</span>
                : l.heat.moves > 0
                  ? <span className="lad-warm">{l.heat.moves} move{l.heat.moves === 1 ? "" : "s"} today</span>
                  : l.tournament.status === "open"
                    ? <span className="lad-open">Entries open</span>
                    : <span className="lad-quiet">Quiet</span>}
            </button>

            <ol className="lad-list">
              {l.top.map(e => <CmLadderRow key={e.playerId} e={e}/>)}
            </ol>

            {/* Where you are, if you are not in the five above it. Somebody in
                fourteenth should not have to open a second screen to find
                that out. */}
            {l.me && l.me.rank > 5 && (
              <ol className="lad-list is-mine">
                <li className="lad-gap" aria-hidden="true">⋯</li>
                <CmLadderRow e={l.me}/>
              </ol>
            )}

            <button className="lad-more" onClick={() => onOpen(l.tournament.tournamentId)}>
              Full table →
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ── The list ─────────────────────────────────────────────────────────── */

function CmTrnList({ auth, staff, onOpen, onCreate, onBack }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(() => {
    NGGApi.member.tournaments.browse()
      .then(r => { setData(r.tournaments || []); setErr(false); })
      .catch(() => { setData([]); setErr(true); });
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const join = async (t) => {
    setBusy(t.tournamentId);
    try { await NGGApi.member.tournaments.join(t.tournamentId); toast.success("You're in."); load(); }
    catch (e) { toast.error(e.detail || e.message || "Couldn't enter."); }
    finally { setBusy(""); }
  };

  return (
    <div className="cmm-screen">
      <header className="cmm-ch-head">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back to chess">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-ch-title">Tournaments</h1>
          <p className="cmm-sub">{data === null ? "…" : data.length + (data.length === 1 ? " event" : " events")}</p>
        </div>
        {staff && (
          <button className="cmm-icon-btn" onClick={onCreate} aria-label="Host a tournament">
            <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>＋</span>
          </button>
        )}
      </header>

      <div className="cmm-stream">
        {data === null ? <CmSkeleton rows={3}/>
         : err ? <CmEmpty icon="!" title="Couldn't load tournaments"
                          body="The connection dropped on the way. Try again."
                          action={<button className="cmm-cta" onClick={load}>Try again</button>}/>
         : data.length === 0 ? <CmEmpty icon="♟" title="No tournaments yet"
                          body={staff ? "Host one and the club will see it here."
                                      : "When a mentor sets one up, it appears here."}
                          action={staff ? <button className="cmm-cta" onClick={onCreate}>Host a tournament</button> : null}/>
         : data.map(t => {
            const [chip, cls] = trnStatusChip(t);
            return (
              <article key={t.tournamentId} className={"trn-card " + cls}>
                <button className="trn-card-main" onClick={() => onOpen(t.tournamentId)}>
                  <span className={"trn-chip " + cls}>{chip}</span>
                  <span className="trn-card-h">{t.name}</span>
                  <span className="trn-card-meta">
                    {t.formatName} · {cmTcName(t.timeControl)} · {t.rated ? "rated" : "casual"}
                  </span>
                  <span className="trn-card-sub">{t.entrants} {t.entrants === 1 ? "player" : "players"}
                    {t.winnerName ? " · won by " + t.winnerName : ""}
                    {t.you && t.you.entered && t.status === "running"
                      ? " · you're on " + (Math.round(t.you.score * 10) / 10) : ""}</span>
                </button>
                <div className="trn-card-foot">
                  {t.you && t.you.entered
                    ? (t.nextMatchId
                        ? <button className="cmm-cta is-sm" onClick={() => onOpen(t.tournamentId)}>Your board is live</button>
                        : <span className="trn-in">✓ You're entered</span>)
                    : t.canJoin
                      ? <button className="cmm-cta is-sm" disabled={busy === t.tournamentId}
                                onClick={() => join(t)}>{busy === t.tournamentId ? "…" : "Enter"}</button>
                      : <span className="trn-why">{t.status === "open" ? "Not open to you" : "Entries closed"}</span>}
                  <button className="trn-more" onClick={() => onOpen(t.tournamentId)}>Details →</button>
                </div>
              </article>
            );
          })}
      </div>
    </div>
  );
}

/* ── One tournament ───────────────────────────────────────────────────── */

function CmTrnDetail({ tournamentId, staff, onBack, onOpenMatch }) {
  const [tab, setTab] = React.useState("standings");
  const [st, setSt] = React.useState(null);
  const [rounds, setRounds] = React.useState(null);
  const [err, setErr] = React.useState(false);
  const [busy, setBusy] = React.useState("");

  const load = React.useCallback(() => {
    NGGApi.member.tournaments.standings(tournamentId)
      .then(r => { setSt(r); setErr(false); }).catch(() => setErr(true));
    NGGApi.member.tournaments.rounds(tournamentId)
      .then(r => setRounds(r.rounds || [])).catch(() => setRounds([]));
  }, [tournamentId]);
  React.useEffect(() => { load(); }, [load]);

  /* A live round is the one thing on this screen that changes by itself, so it
     polls — but only while something is actually being played, and never in a
     hidden tab. A finished tournament is a static page and costs nothing. */
  const live = st && st.tournament && st.tournament.status === "running";
  React.useEffect(() => {
    if (!live) return;
    let alive = true;
    const id = setInterval(() => { if (alive && !document.hidden) load(); }, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [live, load]);

  const t = st && st.tournament;
  const draw = async () => {
    setBusy("draw");
    try {
      const r = await NGGApi.member.tournaments.draw(tournamentId);
      toast.success(r.complete ? "That's the event finished."
        : "Round " + r.round + " drawn — " + r.boards + (r.boards === 1 ? " board" : " boards")
          + (r.byes ? " and " + r.byes + " bye" + (r.byes === 1 ? "" : "s") : "") + ".");
      load();
    } catch (e) { toast.error(e.detail || e.message || "Couldn't draw the round."); }
    finally { setBusy(""); }
  };
  const join = async () => {
    setBusy("join");
    try { await NGGApi.member.tournaments.join(tournamentId); toast.success("You're in."); load(); }
    catch (e) { toast.error(e.detail || e.message || "Couldn't enter."); }
    finally { setBusy(""); }
  };

  /* Inviting is outward-facing: it puts a notification on other people's
     phones, and there is no unsending it. So the count comes back from a dry
     run FIRST and goes into the dialog — "invite 38 people?" is a decision,
     "invite everyone?" is a leap. */
  const inviteAll = async () => {
    setBusy("invite");
    try {
      const pre = await NGGApi.member.tournaments.inviteAll(tournamentId, true);
      if (!pre.wouldInvite) {
        toast.info(pre.eligible
          ? "Everyone eligible has already been asked."
          : "Nobody is eligible for this one yet — check the centres and groups it is open to.",
          "Nothing to send");
        return;
      }
      const ok = await dialog.confirm({
        title: "Invite " + pre.wouldInvite + (pre.wouldInvite === 1 ? " person?" : " people?"),
        body: "They each get a notification about " + t.name + ". It does not enter them — "
            + "they still choose whether to join."
            + (pre.alreadyInvited ? " " + pre.alreadyInvited + " already asked, and will not be asked twice." : ""),
        cta: "Send " + pre.wouldInvite + (pre.wouldInvite === 1 ? " invitation" : " invitations"),
        cancel: "Not now",
      });
      if (!ok) return;
      const r = await NGGApi.member.tournaments.inviteAll(tournamentId, false);
      toast.success(r.invited + (r.invited === 1 ? " person has" : " people have") + " been asked.");
      load();
    } catch (e) { toast.error(e.detail || e.message || "Couldn't send the invitations."); }
    finally { setBusy(""); }
  };

  if (err && !st) return (
    <div className="cmm-screen">
      <header className="cmm-ch-head">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt"><h1 className="cmm-ch-title">Tournament</h1></div>
      </header>
      <CmEmpty icon="!" title="Couldn't load this tournament" body="Try again in a moment."
               action={<button className="cmm-cta" onClick={load}>Try again</button>}/>
    </div>
  );
  if (!t) return <div className="cmm-screen"><CmSkeleton rows={4}/></div>;

  const [chip, cls] = trnStatusChip(t);
  const mine = (rounds && rounds.length ? rounds[0].boards : []).filter(b => b.isMine && b.status === "active");

  return (
    <div className="cmm-screen">
      <header className="cmm-ch-head">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back to tournaments">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-ch-title">{t.name}</h1>
          <p className="cmm-sub">
            {t.formatName} · {cmTcName(t.timeControl)} · {t.entrants} players
            {trnWhenLine(t) ? <> · <span className={(t.window || {}).overdue ? "trn-overdue" : ""}>{trnWhenLine(t)}</span></> : null}
          </p>
        </div>
        <span className={"trn-chip " + cls}>{chip}</span>
      </header>

      {/* Your own board, above everything. Somebody opening a tournament
          during a round is looking for one thing. */}
      {mine.length > 0 && (
        <div className="trn-yours">
          {mine.map(b => (
            <button key={b.matchId} className="trn-yours-btn" onClick={() => onOpenMatch(b.matchId)}>
              <span className="trn-yours-l">Your board · {b.board}</span>
              <span className="trn-yours-n">vs {b.white.id === (st.standings.find(x => x.isMe) || {}).playerId ? b.black.name : b.white.name}</span>
              <span className="trn-yours-go">Play →</span>
            </button>
          ))}
        </div>
      )}

      {t.description && <p className="trn-desc">{t.description}</p>}

      {t.you && !t.you.entered && t.canJoin && (
        <div className="trn-join-bar">
          <button className="cmm-cta" disabled={busy === "join"} onClick={join}>
            {busy === "join" ? "Entering…" : "Enter this tournament"}
          </button>
        </div>
      )}

      {staff && t.status !== "complete" && t.status !== "cancelled" && (
        <div className="trn-director">
          <span className="trn-director-l">Director</span>
          {/* Filling the field came before drawing it, and the buttons are in
              that order. Inviting is only possible while entries are open. */}
          {t.status === "open" && !(t.window || {}).entriesClosed && (
            <button className="cmm-cta is-sm is-ghost" disabled={busy === "invite"} onClick={inviteAll}>
              {busy === "invite" ? "Checking…" : "Invite everyone eligible"}
            </button>
          )}
          <button className="cmm-cta is-sm" disabled={busy === "draw"} onClick={draw}>
            {busy === "draw" ? "Drawing…" : (t.round === 0 ? "Draw round one" : "Draw round " + (t.round + 1))}
          </button>
        </div>
      )}

      {/* Asked, and said yes. Without the first number the second is not a
          rate, and a director filling a field is working blind. */}
      {staff && (st.invites || {}).invited > 0 && (
        <p className="trn-invited">
          <b>{st.invites.joined} of {st.invites.invited}</b> invited{" "}
          {st.invites.joined === 1 ? "person has" : "people have"} joined
          {" "}({st.invites.acceptRate}%).
        </p>
      )}

      <div className="trn-tabs" role="tablist" aria-label="Tournament views">
        {[["standings", "Standings"], ["rounds", "Pairings"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id}
                  className={"trn-tab" + (tab === id ? " is-on" : "")}
                  onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="cmm-stream">
        {tab === "standings" ? <CmTrnStandings st={st}/> : <CmTrnRounds rounds={rounds} onOpenMatch={onOpenMatch}/>}
      </div>
    </div>
  );
}

/** The cross-table. Tiebreaks are shown, not applied invisibly — a child who
    finished third needs to see what separated them. */
function CmTrnStandings({ st }) {
  const arena = st.tournament.format === "arena";
  if (!st.standings.length) {
    return <CmEmpty icon="♟" title="Nobody has entered yet" body="The table fills up as players join."/>;
  }
  return (
    <div className="trn-tbl-wrap">
      <table className="trn-tbl">
        <caption className="sr-only">Standings for {st.tournament.name}</caption>
        <thead>
          <tr>
            <th scope="col" className="trn-num">#</th>
            <th scope="col">Player</th>
            <th scope="col" className="trn-num">{arena ? "Pts" : "Score"}</th>
            <th scope="col" className="trn-num trn-hide-sm">W/D/L</th>
            <th scope="col" className="trn-num trn-hide-sm" title="Buchholz — the sum of your opponents' scores">
              {arena ? "Streak" : "Buch"}
            </th>
            <th scope="col" className="trn-num" title="The rating you played at over this event">Perf</th>
          </tr>
        </thead>
        <tbody>
          {st.standings.map(r => (
            <tr key={r.playerId} className={(r.isMe ? "is-me " : "") + (r.withdrawn ? "is-out" : "")}>
              <td className="trn-num">{r.rank}</td>
              <td>
                <span className="trn-who">
                  {cmAvatar(r.name, r.name + r.centre, r.photo, "cm-avatar-sm")}
                  <span className="trn-who-t">
                    <b>{r.name}{r.isMe ? <span className="cm-you">you</span> : null}</b>
                    <span className="trn-who-s">
                      {r.rating}{r.centre ? " · " + r.centre : ""}
                      {r.kind === "volunteer" || r.kind === "staff" ? <span className="cm-ment-badge">mentor</span> : null}
                      {r.withdrawn ? " · withdrew" : (r.status === "eliminated" ? " · out" : "")}
                    </span>
                    {/* On a narrow phone the W/D/L and tiebreak columns are
                        dropped for width. Saying the tiebreak is shown and then
                        hiding it on the screen most members use would be the
                        promise broken exactly where it matters, so it moves
                        into this line rather than disappearing. */}
                    <span className="trn-who-x">
                      {r.wins}/{r.draws}/{r.losses}
                      {" · "}{arena ? "streak " + r.arenaStreak : "buch " + (Math.round(r.buchholz * 10) / 10)}
                    </span>
                  </span>
                </span>
              </td>
              <td className="trn-num trn-score">{arena ? r.arenaPoints : (Math.round(r.score * 10) / 10)}</td>
              <td className="trn-num trn-hide-sm">{r.wins}/{r.draws}/{r.losses}</td>
              <td className="trn-num trn-hide-sm">{arena ? r.arenaStreak : (Math.round(r.buchholz * 10) / 10)}</td>
              <td className="trn-num">{r.performance || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="trn-tbl-note">
        {arena ? "Two points a win, one a draw. A third win in a row is worth double."
               : "Ties are split by Buchholz — the total score of everybody you played."}
      </p>
    </div>
  );
}

/** The pairing sheet, newest round first, with live clocks on the open boards. */
function CmTrnRounds({ rounds, onOpenMatch }) {
  if (rounds === null) return <CmSkeleton rows={3}/>;
  if (!rounds.length) return <CmEmpty icon="♟" title="No rounds yet" body="Pairings appear when the first round is drawn."/>;
  return (
    <>
      {rounds.map(r => (
        <section key={r.round} className="trn-round">
          <div className="cmm-list-h">ROUND {r.round}</div>
          {r.boards.map(b => (
            <div key={b.board + "-" + (b.matchId || b.white.id)}
                 className={"trn-board" + (b.isMine ? " is-mine" : "") + (b.isBye ? " is-bye" : "")}>
              <span className="trn-board-n">{b.isBye ? "—" : b.board}</span>
              {b.isBye ? (
                <span className="trn-board-body"><b>{b.white.name}</b><span className="trn-board-s">Bye · a full point</span></span>
              ) : (
                <span className="trn-board-body">
                  <span className="trn-side">
                    <span className="trn-disc trn-disc-w" aria-hidden="true"/>
                    <b>{b.white.name}</b>
                  </span>
                  <span className="trn-side">
                    <span className="trn-disc trn-disc-b" aria-hidden="true"/>
                    <b>{b.black.name}</b>
                  </span>
                </span>
              )}
              <span className="trn-board-r">
                {b.result ? <span className="trn-res">{b.result === "0.5-0.5" ? "½–½" : b.result}</span>
                 : b.status === "active" ? <TrnLiveClock clock={b.clock}/> : null}
                {b.matchId && <button className="trn-watch" onClick={() => onOpenMatch(b.matchId)}>
                  {b.isMine && b.status === "active" ? "Play" : "Watch"}
                </button>}
              </span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

/**
 * A clock that ticks between polls.
 *
 * The server sends the authoritative remaining time; this counts it down
 * locally so the number moves, and every poll snaps it back. It never decides
 * anything — a clock that reaches zero here just shows 0:00 and waits for the
 * server to say the game is over, which is the only place that can be decided.
 */
function TrnLiveClock({ clock }) {
  const [, tick] = React.useState(0);
  // When this reading arrived. Everything the countdown subtracts is measured
  // from here, so a slow response shortens the tick rather than the clock.
  const gotAt = React.useRef(Date.now());
  const key = clock ? clock.whiteMs + ":" + clock.blackMs + ":" + clock.turn : "";
  React.useEffect(() => { gotAt.current = Date.now(); }, [key]);
  React.useEffect(() => {
    if (!clock || !clock.running) return;
    const id = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(id);
  }, [clock && clock.running, clock && clock.turn]);
  if (!clock || !clock.live) return null;

  const base = clock.turn === "w" ? clock.whiteMs : clock.blackMs;
  const drift = clock.running ? Math.max(0, Date.now() - gotAt.current) : 0;
  const shown = Math.max(0, base - drift);
  const low = shown < 30000;
  return (
    <span className={"trn-clock" + (low ? " is-low" : "")} aria-label={"Clock: " + trnClock(shown)}>
      {trnClock(shown)}
    </span>
  );
}

/* ── The director's wizard ────────────────────────────────────────────────
   Four steps, because there are four decisions and they are not equally
   important: what kind of event it is, how fast, who may play, and what it is
   called. The old form asked for a name and a programme and then made every
   other choice silently on the director's behalf.

   Each step says what the choice MEANS rather than only naming it. "Swiss" is
   a word; "Everyone plays every round. Nobody is knocked out." is the decision
   somebody is actually making about a Saturday with thirty children in it.   */

const TRN_STEPS = ["Format", "Clock", "Who plays", "When", "Name it"];

/* Durations a club event actually runs for. A director thinks "a Saturday
   afternoon" or "over the next week", not "endsAt = 2026-09-02T17:00:00Z", so
   the form asks for a start and a length and computes the end. Two raw
   datetime pickers would also let somebody set an end before a start, which
   the server refuses — a form that can only express valid windows is better
   than a form that explains why yours is invalid. */
const TRN_DURATIONS = [
  { id: 3,   label: "An afternoon", sub: "3 hours" },
  { id: 6,   label: "A session",    sub: "6 hours" },
  { id: 24,  label: "A day",        sub: "24 hours" },
  { id: 168, label: "A week",       sub: "7 days" },
  { id: 336, label: "A fortnight",  sub: "14 days" },
  { id: 720, label: "A month",      sub: "30 days" },
];

/* <input type="datetime-local"> hands back wall-clock time with no zone. The
   server stores UTC, so the offset has to come off here — appending "Z" to a
   local string, which is what the promo form does, silently shifts every
   tournament by the viewer's offset. */
function trnLocalToUtc(local) {
  if (!local) return "";
  const d = new Date(local);
  return isNaN(d.getTime()) ? "" : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
/* The soonest a start may be, as a datetime-local `min`: now, in local time. */
function trnNowLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function CmTrnCreate({ onBack, onCreated }) {
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState({
    format: "swiss", timeControl: "10+0", variant: "standard", rated: true, totalRounds: 0,
    kinds: ["member", "student", "volunteer", "staff"],
    centres: [], minRating: 0, maxRating: 0,
    programme: "", name: "", description: "",
    /* "open" is the default and the old behaviour: entries stay open until the
       director draws the first round. A start date is a real gate, so it is
       opted into rather than the shape everybody falls into by accident. */
    when: "open", startsAt: "", durationHours: 24,
  });
  const set = (patch) => setF(v => Object.assign({}, v, patch));
  const [formats, setFormats] = React.useState(null);

  React.useEffect(() => {
    NGGApi.member.tournaments.browse().then(r => setFormats(r.formats || null)).catch(() => {});
  }, []);

  const meta = formats || {
    swiss: { name: "Swiss", blurb: "Everyone plays every round. Nobody is knocked out.", best: "8–60 players" },
    knockout: { name: "Knockout", blurb: "Lose once and you are out. Seeded by rating.", best: "8–64 players" },
    roundrobin: { name: "Round robin", blurb: "Everybody plays everybody, once.", best: "4–12 players" },
    centre: { name: "Centre cup", blurb: "Each centre runs its own knockout; the champions meet.", best: "Several centres" },
    arena: { name: "Arena", blurb: "A timed window. Finish a game, get another straight away.", best: "Drop-in sessions" },
  };

  const liveOnly = f.format === "arena";
  const tcs = liveOnly ? TRN_TC.filter(t => t.id !== "1day") : TRN_TC;

  const canNext = step === 0 ? !!f.format
                : step === 1 ? !!f.timeControl
                : step === 2 ? f.kinds.length > 0
                : step === 3 ? (f.when === "open" || !!f.startsAt)
                : f.name.trim().length >= 3;

  /* The window, resolved once so the review sentence, the submit and the hint
     under the picker all describe the same event. */
  const startUtc = f.when === "scheduled" ? trnLocalToUtc(f.startsAt) : "";
  const endUtc = startUtc
    ? new Date(new Date(startUtc).getTime() + f.durationHours * 3600000)
        .toISOString().replace(/\.\d{3}Z$/, "Z")
    : "";

  const submit = async () => {
    setBusy(true);
    try {
      const r = await NGGApi.member.tournaments.create({
        name: f.name.trim(), description: f.description.trim(),
        format: f.format, timeControl: f.timeControl, variant: f.variant,
        rated: f.rated && cmVariant(f.variant).rated,
        totalRounds: f.totalRounds || 0, programme: f.programme,
        kinds: f.kinds, centres: f.centres,
        minRating: f.minRating || 0, maxRating: f.maxRating || 0,
        startsAt: startUtc, endsAt: endUtc,
      });
      toast.success("Created. The club can see it now.");
      onCreated && onCreated(r.tournamentId);
    } catch (e) { toast.error(e.detail || e.message || "Couldn't create it."); }
    finally { setBusy(false); }
  };

  const toggleKind = (id) => set({
    kinds: f.kinds.indexOf(id) >= 0 ? f.kinds.filter(k => k !== id) : f.kinds.concat(id),
  });

  return (
    <div className="cmm-screen trn-wiz">
      <header className="cmm-ch-head">
        <button className="cmm-icon-btn" onClick={step === 0 ? onBack : () => setStep(step - 1)}
                aria-label={step === 0 ? "Cancel" : "Back a step"}>{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-ch-title">Host a tournament</h1>
          <p className="cmm-sub">Step {step + 1} of {TRN_STEPS.length} · {TRN_STEPS[step]}</p>
        </div>
      </header>

      <ol className="trn-steps" aria-label="Progress">
        {TRN_STEPS.map((s, i) => (
          <li key={s} className={"trn-step" + (i === step ? " is-on" : "") + (i < step ? " is-done" : "")}>
            <span className="sr-only">{i < step ? "Done: " : i === step ? "Current: " : ""}{s}</span>
            <span aria-hidden="true">{s}</span>
          </li>
        ))}
      </ol>

      <div className="cmm-stream">
        {step === 0 && (
          <fieldset className="trn-fs">
            <legend className="trn-legend">What kind of event?</legend>
            {Object.keys(meta).map(id => (
              <label key={id} className={"trn-opt" + (f.format === id ? " is-on" : "")}>
                <input type="radio" name="trn-format" className="sr-only" checked={f.format === id}
                       onChange={() => set({ format: id, timeControl: id === "arena" && f.timeControl === "1day" ? "5+3" : f.timeControl })}/>
                <span className="trn-opt-h">{meta[id].name}</span>
                <span className="trn-opt-b">{meta[id].blurb}</span>
                <span className="trn-opt-m">Best for {meta[id].best}</span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 1 && (
          <>
            <fieldset className="trn-fs">
              <legend className="trn-legend">How long does each player get?</legend>
              <div className="trn-tcs">
                {tcs.map(t => (
                  <label key={t.id} className={"trn-tc" + (f.timeControl === t.id ? " is-on" : "")}>
                    <input type="radio" name="trn-tc" className="sr-only" checked={f.timeControl === t.id}
                           onChange={() => set({ timeControl: t.id })}/>
                    <span className="trn-tc-n">{t.name}</span>
                    <span className="trn-tc-s">{t.sub}</span>
                  </label>
                ))}
              </div>
              {liveOnly && <p className="trn-hint">An arena needs a running clock — the window would close before a daily game finished.</p>}
              {f.timeControl === "1day" && <p className="trn-hint">Daily games use almost no data. A move is smaller than a text message.</p>}
            </fieldset>

            <fieldset className="trn-fs">
              <legend className="trn-legend">Which game?</legend>
              {/* Its own class rather than the time-control tile's, so the two
                  groups of tiles are never mistaken for one another — by a
                  stylesheet, by a test, or by somebody reading this later. */}
              <div className="trn-vts">
                {CM_VARIANTS.map(x => (
                  <label key={x.id} className={"trn-vt" + (f.variant === x.id ? " is-on" : "")}>
                    <input type="radio" name="trn-variant" className="sr-only" checked={f.variant === x.id}
                           onChange={() => set({ variant: x.id })}/>
                    <span className="trn-vt-n">{x.name}</span>
                    <span className="trn-vt-s">{x.short}</span>
                  </label>
                ))}
              </div>
              <p className="trn-hint">{cmVariant(f.variant).rule}</p>
            </fieldset>

            {/* A variant that changes what winning IS cannot move a rating
                built on standard chess, so the switch is locked rather than
                left to be silently overruled by the server. */}
            <label className={"trn-switch" + (cmVariant(f.variant).rated ? "" : " is-locked")}>
              <input type="checkbox" checked={f.rated && cmVariant(f.variant).rated}
                     disabled={!cmVariant(f.variant).rated}
                     onChange={e => set({ rated: e.target.checked })}/>
              <span>
                <b>Rated</b>
                <span className="trn-hint">
                  {cmVariant(f.variant).rated
                    ? "Results move everybody's club rating. Turn it off for a fun event."
                    : cmVariant(f.variant).name + " is always casual — one rating cannot measure two different games."}
                </span>
              </span>
            </label>

            {(f.format === "swiss") && (
              <label className="trn-field">
                <span className="trn-field-l">Rounds <span>leave at 0 and we work it out from the entry list</span></span>
                <input className="trn-in" type="number" min="0" max="11" value={f.totalRounds}
                       onChange={e => set({ totalRounds: Math.max(0, Math.min(11, +e.target.value || 0)) })}/>
              </label>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <fieldset className="trn-fs">
              <legend className="trn-legend">Who can enter?</legend>
              {TRN_KINDS.map(k => (
                <label key={k.id} className={"trn-check" + (f.kinds.indexOf(k.id) >= 0 ? " is-on" : "")}>
                  <input type="checkbox" checked={f.kinds.indexOf(k.id) >= 0} onChange={() => toggleKind(k.id)}/>
                  <span>{k.label}</span>
                </label>
              ))}
              {f.kinds.length === 0 && <p className="trn-hint is-warn">Pick at least one group, or nobody can enter.</p>}
            </fieldset>

            <fieldset className="trn-fs">
              <legend className="trn-legend">Programme</legend>
              <div className="trn-seg">
                {[["", "Everyone"], ["ngg", "NGG Club"], ["summer", "Summer School"]].map(([v, l]) => (
                  <button key={v || "all"} type="button" aria-pressed={f.programme === v}
                          className={"trn-seg-b" + (f.programme === v ? " is-on" : "")}
                          onClick={() => set({ programme: v })}>{l}</button>
                ))}
              </div>
            </fieldset>

            <div className="trn-band">
              <label className="trn-field">
                <span className="trn-field-l">Lowest rating <span>0 for no floor</span></span>
                <input className="trn-in" type="number" min="0" max="3000" value={f.minRating}
                       onChange={e => set({ minRating: Math.max(0, +e.target.value || 0) })}/>
              </label>
              <label className="trn-field">
                <span className="trn-field-l">Highest rating <span>0 for no ceiling</span></span>
                <input className="trn-in" type="number" min="0" max="3000" value={f.maxRating}
                       onChange={e => set({ maxRating: Math.max(0, +e.target.value || 0) })}/>
              </label>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <fieldset className="trn-fs">
              <legend className="trn-legend">When does it run?</legend>
              <div className="trn-seg">
                {[["open", "Open until I draw"], ["scheduled", "Set a start and a length"]].map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={f.when === v}
                          className={"trn-seg-b" + (f.when === v ? " is-on" : "")}
                          onClick={() => set({ when: v })}>{l}</button>
                ))}
              </div>
              {f.when === "open"
                ? <p className="trn-hint">
                    Entries stay open until you draw the first round. Right for a
                    club night where you do not know yet who is coming.
                  </p>
                : <p className="trn-hint">
                    Entries close the moment it starts, so nobody joins a round
                    that has already been paired.
                  </p>}
            </fieldset>

            {f.when === "scheduled" && (
              <>
                <label className="trn-field">
                  <span className="trn-field-l">Starts <span>your local time</span></span>
                  <input className="trn-in" type="datetime-local" value={f.startsAt}
                         min={trnNowLocal()}
                         onChange={e => set({ startsAt: e.target.value })}/>
                </label>
                <fieldset className="trn-fs">
                  <legend className="trn-legend">And runs for</legend>
                  {/* A length rather than an end date: a director thinks "a
                      Saturday afternoon", and a form that can only express a
                      valid window beats one that explains why yours is not. */}
                  <div className="trn-tcs">
                    {TRN_DURATIONS.map(d => (
                      <label key={d.id} className={"trn-tc" + (f.durationHours === d.id ? " is-on" : "")}>
                        <input type="radio" name="trn-dur" className="sr-only"
                               checked={f.durationHours === d.id}
                               onChange={() => set({ durationHours: d.id })}/>
                        <span className="trn-tc-n">{d.label}</span>
                        <span className="trn-tc-s">{d.sub}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {!f.startsAt && <p className="trn-hint is-warn">Pick a start, or choose "open until I draw".</p>}
                {endUtc && (
                  <p className="trn-hint">
                    Ends {fmtDateTime(endUtc)}. Nothing is cut off at that
                    moment — games in progress finish — but the event is
                    flagged as overdue until you close it.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <label className="trn-field">
              <span className="trn-field-l">Name it</span>
              <input className="trn-in" value={f.name} maxLength={160} autoComplete="off"
                     placeholder="e.g. Egbeda Saturday Blitz" onChange={e => set({ name: e.target.value })}/>
            </label>
            <label className="trn-field">
              <span className="trn-field-l">A line about it <span>optional</span></span>
              <textarea className="trn-in trn-ta" value={f.description} maxLength={600} rows={3}
                        placeholder="Who it is for, what to bring, anything players should know."
                        onChange={e => set({ description: e.target.value })}/>
            </label>

            {/* Say the whole thing back before it is real. A director is about
                to publish this to the club; they should read it as a sentence,
                not re-derive it from four screens of controls. */}
            <div className="trn-review">
              <div className="trn-review-h">You are about to host</div>
              <p className="trn-review-b">
                {/* Not toLowerCase: "a swiss at 10+0" reads as a typo. Swiss is
                    named after Switzerland, and Round robin and Centre cup are
                    already sentence case, so the name is used as written. */}
                <b>{f.name.trim() || "an unnamed tournament"}</b> — a {meta[f.format].name} at{" "}
                {cmTcName(f.timeControl)}
                {f.variant !== "standard" ? ", played as " + cmVariant(f.variant).name : ""},{" "}
                {f.rated && cmVariant(f.variant).rated ? "rated" : "casual"}, open to{" "}
                {f.kinds.length === TRN_KINDS.length ? "everybody" : f.kinds.map(k => (TRN_KINDS.find(x => x.id === k) || {}).label).join(", ").toLowerCase()}
                {f.programme ? " in the " + (f.programme === "ngg" ? "NGG Club" : "Summer School") : ""}
                {f.minRating || f.maxRating ? ", rated " + (f.minRating || "any") + "–" + (f.maxRating || "any") : ""}.
              </p>
              <p className="trn-review-s">
                {startUtc
                  ? <>Starts {fmtDateTime(startUtc)} and runs for{" "}
                      {(TRN_DURATIONS.find(d => d.id === f.durationHours) || {}).sub}. Entries
                      close when it starts.</>
                  : "Entries open straight away. You draw the first round when everybody is here."}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="trn-wiz-foot">
        {step > 0 && <button className="trn-back" onClick={() => setStep(step - 1)}>Back</button>}
        {step < TRN_STEPS.length - 1
          ? <button className="cmm-cta" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
          : <button className="cmm-cta" disabled={!canNext || busy} onClick={submit}>
              {busy ? "Creating…" : "Create and open entries"}
            </button>}
      </div>
    </div>
  );
}

/** The chess hub: your standing, the games waiting on you, and the three ways in. */
function CmChess({ auth, onOpenMatch, onBack }) {
  const [profile, setProfile] = React.useState(null);
  const [matches, setMatches] = React.useState(null);
  const [challenges, setChallenges] = React.useState(null);
  const [screen, setScreen] = React.useState("");        // "" | search | computer | trn | trnNew
  const [openTrn, setOpenTrn] = React.useState("");
  const [challengeFor, setChallengeFor] = React.useState(null);
  /* The pace chosen on the lobby, carried into the challenge sheet so the
     tile a member tapped is the one the sheet opens on. A picker that forgets
     what you picked one screen ago is a picker that was decoration. */
  const [newTc, setNewTc] = React.useState("10+0");
  const [err, setErr] = React.useState("");
  const [lobby, setLobby] = React.useState(null);
  const sigRef = React.useRef("");
  const toldRef = React.useRef({});

  const load = React.useCallback(() => {
    NGGApi.member.match.chess().then(setProfile).catch(() => {});
    NGGApi.member.match.list().then(r => setMatches(r.matches || [])).catch(() => setMatches([]));
    NGGApi.member.match.challenges().then(setChallenges).catch(() => setChallenges({ toYou: [], open: [], fromYou: [] }));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  /* The lobby tick.
     This screen used to load once on mount and never again, so a challenge
     somebody accepted sat unseen until the member navigated away and came
     back — the most time-sensitive event in the whole feature was the one
     thing the screen could not notice.

     The poll is cheap on purpose: four counts and a signature. Nothing is
     re-fetched unless the signature moved, so a quiet lobby costs a few dozen
     bytes every few seconds and a busy one refreshes within one tick. It
     stops entirely in a hidden tab — a chess screen left open in a background
     tab is somebody's data, and they did not agree to spend it. */
  React.useEffect(() => {
    if (screen) return;                       // not on the hub: nothing to refresh
    let alive = true, timer = null;
    const tick = () => {
      if (!alive) return;
      if (document.visibilityState === "hidden") { timer = setTimeout(tick, 8000); return; }
      NGGApi.member.match.lobby()
        .then(r => {
          if (!alive) return;
          setLobby(r);
          if (r.sig && r.sig !== sigRef.current) { sigRef.current = r.sig; load(); }
          /* Somebody taking your challenge is worth saying out loud, once.
             It is the event a member is actually waiting for, and finding it
             by noticing a list got longer is not the same as being told. */
          (r.accepted || []).forEach(a => {
            if (toldRef.current[a.challengeId]) return;
            toldRef.current[a.challengeId] = 1;
            toast.success(a.name + " took your challenge — the game is on.", "Your move");
          });
        })
        .catch(() => {})
        .then(() => { if (alive) timer = setTimeout(tick, 5000); });
    };
    timer = setTimeout(tick, 1200);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [screen, load]);

  const answer = (id, ans) => {
    NGGApi.member.match.answer(id, ans)
      .then(r => { load(); if (ans === "accept" && r.matchId) onOpenMatch(r.matchId); })
      .catch(e => setErr(cmChessError(e)));
  };

  /* Who sees the director's controls.
     `counts.staff` is the viewer's own capability, served by the community
     endpoint that already computes it — the same signal the message actions
     use. It is a HINT for what to draw: every tournament write still goes
     through admin_cap_gate on the server, so showing the button to somebody
     who should not have it would get them a refusal, not a tournament.

     Declared ABOVE the routing returns, and that is not a style preference:
     it sat below them and the tournaments route read it on the way past, so
     every tap on Tournaments threw "Cannot access 'isDirector' before
     initialization" and rendered nothing at all. A `const` is in its temporal
     dead zone until the line that declares it runs, and an early return above
     that line still executes. */
  const isDirector = !!(auth && auth.member && auth.member.role
                        && String(auth.member.role).toLowerCase() !== "member");

  if (screen === "search") {
    return <CmChessSearch onBack={() => { setScreen(""); load(); }}
                          onChallenge={(pl) => setChallengeFor(pl)}
                          challengeFor={challengeFor} timeControl={newTc}
                          onSent={() => { setChallengeFor(null); setScreen(""); load(); }}
                          onCancel={() => setChallengeFor(null)}
                          onOpenMatch={onOpenMatch}/>;
  }
  if (screen === "computer") {
    return <CmChessComputer profile={profile} onBack={() => setScreen("")}/>;
  }
  if (screen === "trnNew") {
    return <CmTrnCreate onBack={() => setScreen("trn")}
                        onCreated={(id) => { setOpenTrn(id); setScreen("trn"); }}/>;
  }
  if (screen === "ladder") {
    return <CmTrnLadder onBack={() => setScreen("")}
                        onOpen={(id) => { setOpenTrn(id); setScreen("trn"); }}/>;
  }
  if (screen === "trn") {
    return openTrn
      ? <CmTrnDetail tournamentId={openTrn} staff={isDirector}
                     onBack={() => setOpenTrn("")} onOpenMatch={onOpenMatch}/>
      : <CmTrnList auth={auth} staff={isDirector}
                   onOpen={setOpenTrn} onCreate={() => setScreen("trnNew")}
                   onBack={() => { setScreen(""); load(); }}/>;
  }

  const yourMove = (matches || []).filter(m => m.status === "active" && m.yourTurn);
  const theirMove = (matches || []).filter(m => m.status === "active" && !m.yourTurn);
  const toYou = (challenges && challenges.toYou) || [];
  const open = (challenges && challenges.open) || [];

  /* The arena worth a card: one running tournament, named. The design gives
     this the gold treatment at the bottom of the screen, and it earns it —
     during an event it is the reason somebody opened chess at all. */
  const arena = (lobby && lobby.arena) || null;

  return (
    <div className="cmc">
      {err && <div className="cmm-offline" role="alert">{err}</div>}

      {/* Identity and standing, in one line rather than a heading plus a
          subtitle plus a floating number saying the same thing twice. */}
      <header className="cmc-head">
        {onBack && (
          <button className="cmc-back" onClick={onBack} aria-label="Back to the Arcade">
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <div className="cmc-head-t">
          <h2 className="cmc-h">Chess</h2>
          <p className="cmc-sub">
            {profile
              ? <>Your rating {profile.rating}
                  {profile.weekDelta ? " · " + (profile.weekDelta > 0 ? "+" : "") + profile.weekDelta + " this week"
                    : profile.games ? " · " + profile.games + (profile.games === 1 ? " game" : " games") : ""}</>
              : "Loading your standing…"}
          </p>
        </div>
        {profile && (
          <button className="cmc-stats" onClick={() => setScreen("ladder")}>Stats</button>
        )}
      </header>

      {/* One house promotion, dismissible. Placed below the header and above
          the queue, so it can never sit between a member and their own game. */}
      <CmPromo placement="chess" onGo={(page) => { if (window.__navigate) window.__navigate(page); }}/>

      {/* Two columns on a desktop, one on a phone — and the DOM order is the
          phone's, so the wrappers can simply dissolve (`display: contents`)
          below the breakpoint rather than the screen having two orderings to
          keep in step. What goes in the rail is what you read; what stays in
          the main column is what you act on. */}
      <div className="cmc-col is-main">

      {/* Waiting on YOU, first and always. A queue that hides whose move it is
          is a queue where games quietly die.

          There is no separate hero card above this any more. There used to be:
          the first game was lifted out into a dark banner and the rest listed
          below it under "ALSO YOUR TURN", which meant the screen had two ways
          of drawing the same thing and a heading that counted wrong. The
          design's answer is better and is what this does — one list, and the
          game at the top of it wears the accent. */}
      {yourMove.length > 0 && (
        <section className="cmc-sec">
          <div className="cmm-list-h">YOUR TURN · {yourMove.length}</div>
          {yourMove.map((m, i) => (
            <CmChessGameCard key={m.matchId} m={m} lead={i === 0} onOpen={onOpenMatch}/>
          ))}
        </section>
      )}

      {toYou.length > 0 && (
        <section className="cmc-sec">
          <div className="cmm-list-h">CHALLENGES FOR YOU · {toYou.length}</div>
          {toYou.map(c => (
            <div className="cmc-ch" key={c.challengeId}>
              <span className="cmc-av" style={{ background: cmColor(c.from.name, "") }}>{cmInitial(c.from.name)}</span>
              <span className="cmc-ch-body">
                <span className="cmc-game-who">{c.from.name}<span className="cmc-game-r">{c.from.rating}</span></span>
                <span className="cmc-game-sub">{cmTermsLine(c)}</span>
              </span>
              <span className="cmc-ch-acts">
                <button className="cmm-cta is-sm" onClick={() => answer(c.challengeId, "accept")}>Accept</button>
                <button className="cmc-decline" onClick={() => answer(c.challengeId, "decline")}>No</button>
              </span>
            </div>
          ))}
        </section>
      )}

      {/* NEW GAME, as the design lays it out: pick the pace first, then who
          against. Picking the clock before the opponent is the right order —
          "have I got ten minutes" is the question a child can answer, and
          "who" is the one they browse. The choice is carried into the search
          screen so the challenge sheet opens already set. */}
      <section className="cmc-sec">
        <div className="cmm-list-h">NEW GAME</div>
        <div className="cmc-tcs">
          {CMC_LOBBY_TCS.map(id => {
            const t = CM_TIME_CONTROLS.filter(x => x.id === id)[0];
            return (
              <button key={id} className={"cmc-tc-tile" + (newTc === id ? " is-on" : "")}
                      aria-pressed={newTc === id} onClick={() => setNewTc(id)}>
                <span className="cmc-tc-n">{t.name}</span>
                <span className="cmc-tc-k">{t.kind}</span>
              </button>
            );
          })}
        </div>
        <div className="cmc-newrow">
          <button className="cmm-cta" onClick={() => setScreen("search")}>Play a club member</button>
          <button className="cmc-post" aria-label="Post an open challenge anyone can take"
                  onClick={() => { setChallengeFor({ id: "", name: "anyone in the club", open: true }); setScreen("search"); }}>
            <span aria-hidden="true">＋</span>
          </button>
        </div>
        {/* The cost line is the reason daily games lead. A move is a few
            hundred bytes; that is the fact that makes chess affordable here. */}
        <p className="cmc-note">Daily games use almost no data — a move is smaller than a text message.</p>
      </section>

      {open.length > 0 && (
        <section className="cmc-sec">
          <div className="cmm-list-h">OPEN CHALLENGES · ANYONE CAN TAKE</div>
          {open.map(c => (
            <div className="cmc-ch" key={c.challengeId}>
              <span className="cmc-tc">{cmTcName(c.timeControl)}</span>
              <span className="cmc-ch-body">
                <span className="cmc-game-who">{c.from.name}<span className="cmc-game-r">{c.from.rating}</span></span>
                <span className="cmc-game-sub">{c.rated ? "Rated" : "Casual"} · posted {cmAgo(c.createdAt)}</span>
              </span>
              <button className="cmm-cta is-sm" onClick={() => answer(c.challengeId, "accept")}>Accept</button>
            </div>
          ))}
        </section>
      )}

      </div>
      <div className="cmc-col is-rail">

      {/* TRAIN, in the design's order and its shapes: the dark card for the
          thing you do alone, the gold one for the thing the club is doing
          together. The design also draws a daily puzzle and a coach's ladder
          here; neither exists on the server, and a card that opens nothing is
          worse than a card that is missing, so they are not drawn. */}
      <section className="cmc-sec">
        <div className="cmm-list-h">TRAIN</div>
        <button className="cmc-train is-dark" onClick={() => setScreen("computer")}>
          <span className="cmc-train-ic" aria-hidden="true">♞</span>
          <span className="cmc-train-b">
            <span className="cmc-train-h">Play the computer</span>
            <span className="cmc-train-s">Works with no signal · nothing to download</span>
          </span>
          <span className="cmc-train-go">Play</span>
        </button>
        {arena && (
          <button className="cmc-train is-arena" onClick={() => { setOpenTrn(arena.tournamentId); setScreen("trn"); }}>
            <span className="cmc-train-ic" aria-hidden="true">🏆</span>
            <span className="cmc-train-b">
              <span className="cmc-train-h">{arena.name}</span>
              <span className="cmc-train-s">{cmArenaLine(arena)}</span>
            </span>
            <span className="cmc-train-go">{arena.joined ? "Open" : "Join"}</span>
          </button>
        )}
        <button className="cmc-tile trn-entry" onClick={() => { setOpenTrn(""); setScreen("trn"); }}>
          <span className="cmc-tile-h">
            {lobby && lobby.tournaments ? lobby.tournaments + " tournaments running" : "Club tournaments"}
          </span>
          <span className="cmc-tile-s">Swiss, knockout, round robin and arena · live standings</span>
        </button>
        {/* The ladder, beside the list rather than inside it: "what is on" and
            "what is happening right now" are two different questions and a
            member with ten minutes is asking the second one. */}
        <button className="cmc-tile is-ghost" onClick={() => setScreen("ladder")}>
          <span className="cmc-tile-h">Live ladder</span>
          <span className="cmc-tile-s">Who is climbing, and which boards are going right now</span>
        </button>
        {isDirector && (
          <button className="cmc-tile is-ghost" onClick={() => { setOpenTrn(""); setScreen("trnNew"); }}>
            <span className="cmc-tile-h">Host a tournament</span>
            <span className="cmc-tile-s">Set the format and clock, then draw round one</span>
          </button>
        )}
      </section>

      {theirMove.length > 0 && (
        <section className="cmc-sec">
          <div className="cmm-list-h">WAITING ON THEM · {theirMove.length}</div>
          {theirMove.map(m => (
            <CmChessGameCard key={m.matchId} m={m} quiet onOpen={onOpenMatch}/>
          ))}
        </section>
      )}
      </div>

      {matches !== null && !yourMove.length && !theirMove.length && !toYou.length && !open.length && (
        <CmEmpty icon="♟" title="No games yet"
                 body="Challenge somebody at your centre, or play the computer while you wait."/>
      )}
    </div>
  );
}

/* The three paces the lobby offers, in the design's order: the club's default
   first. The fourth (3+2) still exists and is reachable from the challenge
   sheet — three tiles is what fits a phone without shrinking the figures to
   the point where a child squints at them. */
const CMC_LOBBY_TCS = ["10+0", "5+3", "1day"];

/** One game in the lobby, in the design's shape: who you are playing, how the
 *  game stands, and how long you have. Those are the three things that decide
 *  whether somebody taps it, and the clock is the one the old row left out —
 *  a rapid game with forty seconds on it looked exactly like a daily game with
 *  a day left on it. */
function CmChessGameCard({ m, lead, quiet, onOpen }) {
  const them = cmOtherName(m);
  const theirRating = m.you === "A" ? (m.players.B.rating || 0) : (m.players.A.rating || 0);
  const clock = cmLobbyClock(m);
  return (
    <button className={"cmc-game" + (lead ? " is-lead" : "") + (quiet ? " is-quiet" : "")}
            onClick={() => onOpen(m.matchId)}>
      <span className="cmc-av" style={{ background: cmColor(them, "") }}>{cmInitial(them)}</span>
      <span className="cmc-game-body">
        <span className="cmc-game-who">
          {them}{theirRating ? <span className="cmc-game-r">{theirRating}</span> : null}
        </span>
        <span className={"cmc-game-sub" + (m.yourTurn ? " is-yours" : "")}>
          {m.yourTurn
            ? "Move " + (m.ply + 1) + " · you are " + (m.yourColour === "w" ? "White" : "Black")
            : "Their move · " + (m.lastMoveAt ? cmAgo(m.lastMoveAt) : "not started")}
        </span>
      </span>
      <span className="cmc-game-when">
        {/* A daily deadline is "1d 4h" and a rapid clock is "4:12". Set at one
            size, the long one shouts louder than the urgent one, which is
            exactly backwards. */}
        {clock ? <span className={"cmc-game-clock" + (clock.length > 5 ? " is-long" : "")}>{clock}</span> : null}
        <span className="cmc-game-tc">{cmTcName(m.timeControl)}</span>
      </span>
    </button>
  );
}

/** YOUR time on a lobby row: a figure for a live game, a deadline for a
 *  correspondence one — and nothing at all when the move is theirs and the
 *  game is daily, because the day belongs to the player who has to use it and
 *  putting it on both seats says the person waiting is also on a clock.
 *
 *  Static on purpose. This is a glance, not a clock: five rows each ticking
 *  twice a second is a list nobody can read and a battery nobody agreed to
 *  spend. The board is where a running clock belongs. */
function cmLobbyClock(m) {
  const c = m && m.clock;
  if (!c) return "";
  if (!c.live) return (m.yourTurn && c.deadlineMs) ? mtgDeadline(c.deadlineMs) : "";
  const mine = m.yourColour === "b" ? c.blackMs : c.whiteMs;
  return trnClock(Math.max(0, mine || 0));
}

/** "Playing now · 10+0 · 14 joined", or "Saturday 4pm · 14 joined" — the
 *  featured event in one line. Only facts the server actually sent: an event
 *  with no start time says nothing about when it starts rather than guessing. */
function cmArenaLine(a) {
  const bits = [];
  if (a.status === "running") bits.push("Playing now");
  else if (a.startsAt) bits.push(cmArenaWhen(a.startsAt));
  else bits.push("Entries open");
  if (a.timeControl) bits.push(cmTcName(a.timeControl));
  bits.push((a.players || 0) + " joined");
  return bits.join(" · ");
}

/** "Saturday 4pm", "Today 6pm", "12 Sep 4pm" — near dates by their day name,
 *  because "Saturday" is a thing a child can plan around and "2026-09-12" is
 *  not. Anything past a week gets the date. */
function cmArenaWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
                .replace(":00", "").replace(/\s/g, "").toLowerCase();
  const days = Math.floor((d - new Date()) / 86400000);
  if (days < 0) return "Started";
  if (days < 7) {
    const today = new Date().getDay();
    const label = d.getDay() === today ? "Today" : d.toLocaleDateString("en-GB", { weekday: "long" });
    return label + " " + time;
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " + time;
}

function cmOtherName(m) {
  return m.you === "A" ? m.players.B.name : m.players.A.name;
}
function cmTcName(id) {
  const t = CM_TIME_CONTROLS.filter(x => x.id === id)[0];
  return t ? t.name : id;
}
/** "Rapid", "Blitz", "Daily" — the WORD for a time control, which is how the
 *  design titles a game and how players describe one to each other. */
function cmTcKind(id) {
  const t = CM_TIME_CONTROLS.filter(x => x.id === id)[0];
  return t ? t.kind : "Game";
}
function cmTermsLine(c) {
  const t = CM_TIME_CONTROLS.filter(x => x.id === c.timeControl)[0];
  const colour = c.colourPref === "random" ? "colours drawn" : "they play " + c.colourPref;
  return (t ? t.kind + " " + t.name : c.timeControl) + " · " + colour + " · " + (c.rated ? "rated" : "casual");
}
function cmChessError(e) {
  const map = {
    already_playing: "You already have a game running with them.",
    already_challenged: "You've already challenged them — it's still waiting.",
    already_open: "You already have an open challenge posted.",
    cannot_play_yourself: "You can't play yourself.",
    not_open: "That challenge has expired or been taken.",
    not_yours: "That challenge isn't yours to answer.",
  };
  return map[e && e.code] || (e && e.message) || "That didn't work.";
}

/* ── Search a player (6A · 1) ─────────────────────────────────────────────
   Filters that answer the question actually being asked — "who can I play
   right now, near my strength" — and a head-to-head record on every row, so
   a child knows what they are walking into before they tap Challenge. */
function CmChessSearch({ onBack, onChallenge, challengeFor, onSent, onCancel, onOpenMatch, timeControl }) {
  const [q, setQ] = React.useState("");
  const [club, setClub] = React.useState(false);
  const [online, setOnline] = React.useState(false);
  const [band, setBand] = React.useState("");
  const [mentors, setMentors] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [challenges, setChallenges] = React.useState(null);
  const [err, setErr] = React.useState("");
  const inputRef = React.useRef(null);

  React.useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(t); }, []);
  React.useEffect(() => {
    const t = setTimeout(() => {
      setData(null);
      NGGApi.member.match.players({ q: q.trim(), club: club ? 1 : "", online: online ? 1 : "", band: band, mentors: mentors ? 1 : "" })
        .then(setData).catch(() => setData({ players: [] }));
    }, 260);
    return () => clearTimeout(t);
  }, [q, club, online, band, mentors]);
  React.useEffect(() => {
    NGGApi.member.match.challenges().then(setChallenges).catch(() => {});
  }, []);

  const band1100 = band === "1100-1400";
  const players = (data && data.players) || [];
  const open = (challenges && challenges.open) || [];

  const accept = (id) => {
    NGGApi.member.match.answer(id, "accept")
      .then(r => { if (r.matchId) onOpenMatch(r.matchId); })
      .catch(e => setErr(cmChessError(e)));
  };

  return (
    <div className="cmm-screen" role="region" aria-label="Find a chess opponent">
      <header className="cmm-head cmm-head-back">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back">{cmUiIcon("back", 22)}</button>
        <h1 className="cmm-h1">Find a game</h1>
      </header>

      <div className="cmm-pad">
        <div className="cmm-jump-field">
          {cmUiIcon("search", 18)}
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                 placeholder="Search a player" aria-label="Search players by name"/>
          {q && <button className="cmm-jump-clear" onClick={() => setQ("")} aria-label="Clear">×</button>}
        </div>
      </div>

      {/* Toggles, not one-of-four: "my club AND online" is the common question,
          and a radio group would make it unaskable. */}
      <div className="cmm-chips" role="group" aria-label="Narrow the search">
        <button className={"cmm-chip" + (club ? " is-on" : "")} aria-pressed={club} onClick={() => setClub(v => !v)}>My club</button>
        <button className={"cmm-chip" + (online ? " is-on" : "")} aria-pressed={online} onClick={() => setOnline(v => !v)}>Online now</button>
        <button className={"cmm-chip" + (band1100 ? " is-on" : "")} aria-pressed={band1100}
                onClick={() => setBand(band1100 ? "" : "1100-1400")}>1100–1400</button>
        <button className={"cmm-chip" + (mentors ? " is-on" : "")} aria-pressed={mentors} onClick={() => setMentors(v => !v)}>Mentors</button>
      </div>

      {err && <div className="cmm-offline" role="alert">{err}</div>}

      <div className="cmc-results">
        {data === null && <CmSkeleton rows={3}/>}
        {data && players.length === 0 && (
          <CmEmpty icon="🔍" title="Nobody matched"
                   body={q.trim() ? "Try a different name, or drop a filter." : "Drop a filter — or post an open challenge anyone can take."}/>
        )}
        {data && players.length > 0 && <div className="cmm-list-h">{players.length} RESULT{players.length === 1 ? "" : "S"}</div>}
        {players.map(pl => (
          <div className="cmc-player" key={pl.id}>
            <span className="cmc-av" style={{ background: cmColor(pl.name, pl.mentor ? "mentor" : "") }}>{cmInitial(pl.name)}</span>
            <span className="cmc-player-body">
              <span className="cmc-game-who">
                {pl.name}
                {pl.mentor && <span className="cmm-tag is-mentor">mentor</span>}
              </span>
              <span className="cmc-game-sub">
                {pl.centre} · {cmSeenAgo(pl.lastSeen, pl.online)}
                {pl.headToHead ? " · " + pl.headToHead : ""}
              </span>
            </span>
            <span className="cmc-player-rating">{pl.rating}</span>
            <button className="cmm-cta is-sm" onClick={() => onChallenge(pl)}>Challenge</button>
          </div>
        ))}

        <div className="cmm-list-h">OPEN CHALLENGES · ANYONE CAN TAKE</div>
        {open.length === 0 && <p className="cmc-note">Nothing posted right now.</p>}
        {open.map(c => (
          <div className="cmc-ch" key={c.challengeId}>
            <span className="cmc-tc">{cmTcName(c.timeControl)}</span>
            <span className="cmc-ch-body">
              <span className="cmc-game-who">{c.from.name} wants a game</span>
              <span className="cmc-game-sub">{c.from.rating} · posted {cmAgo(c.createdAt)} · {c.rated ? "rated" : "casual"}</span>
            </span>
            <button className="cmm-cta is-sm" onClick={() => accept(c.challengeId)}>Accept</button>
          </div>
        ))}
        <button className="cmc-tile" onClick={() => onChallenge({ id: "", name: "anyone in the club", open: true })}>
          <span className="cmc-tile-h">Post your own open challenge</span>
          <span className="cmc-tile-s">Anyone in the club can take it</span>
        </button>
      </div>

      {challengeFor && (
        <CmChessChallengeSheet player={challengeFor} timeControl={timeControl}
                               onClose={onCancel} onSent={onSent}/>
      )}
    </div>
  );
}

/* ── Send a challenge (6A · 2) ────────────────────────────────────────────
   Every term stated BEFORE it is sent — time control, colour, rated or not,
   and whether the club may watch. A game whose terms are discovered on the
   board is a game one player agreed to and the other did not. */
function CmChessChallengeSheet({ player, timeControl, onClose, onSent }) {
  // The pace the member picked on the lobby, if they picked one there.
  const [tc, setTc] = React.useState(timeControl || "1day");
  const [colour, setColour] = React.useState("random");
  const [variant, setVariant] = React.useState("standard");
  const [rated, setRated] = React.useState(true);
  const [channel, setChannel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const v = cmVariant(variant);
  // Whether this game CAN be rated is a property of the variant, not a
  // preference. The server enforces it; the sheet says so first.
  const canRate = v.rated;

  const send = () => {
    setBusy(true); setErr("");
    NGGApi.member.match.challenge({
      opponentId: player.open ? "" : player.id,
      timeControl: tc, colourPref: colour, variant: variant,
      rated: rated && canRate, channelSlug: channel,
    })
      .then(() => { toast.success(player.open ? "Posted. Anyone can take it." : "Challenge sent."); onSent(); })
      .catch(e => { setErr(cmChessError(e)); setBusy(false); });
  };

  return (
    <CmSheet title={player.open ? "Post an open challenge" : "Challenge " + player.name} onClose={onClose}>
      {!player.open && (
        <p className="cmc-note">
          {player.rating}{player.headToHead ? " · " + player.headToHead : ""}
          {player.online ? " · online" : ""}
        </p>
      )}

      <div className="cmm-list-h">TIME CONTROL</div>
      <div className="cmc-opts">
        {CM_TIME_CONTROLS.map(t => (
          <button key={t.id} className={"cmc-opt" + (tc === t.id ? " is-on" : "")}
                  aria-pressed={tc === t.id} onClick={() => setTc(t.id)}>
            <span className="cmc-opt-n">{t.name}</span>
            <span className="cmc-opt-k">{t.kind}</span>
          </button>
        ))}
      </div>

      <div className="cmm-list-h">YOU PLAY</div>
      <div className="cmc-opts is-three">
        {[["white", "White"], ["black", "Black"], ["random", "Random"]].map(([id, label]) => (
          <button key={id} className={"cmc-opt" + (colour === id ? " is-on" : "")}
                  aria-pressed={colour === id} onClick={() => setColour(id)}>
            <span className="cmc-opt-n">{label}</span>
          </button>
        ))}
      </div>

      <div className="cmm-list-h">WHICH GAME</div>
      <div className="cmc-opts">
        {CM_VARIANTS.map(x => (
          <button key={x.id} className={"cmc-opt" + (variant === x.id ? " is-on" : "")}
                  aria-pressed={variant === x.id} onClick={() => setVariant(x.id)}>
            <span className="cmc-opt-n">{x.name}</span>
            <span className="cmc-opt-k">{x.short}</span>
          </button>
        ))}
      </div>
      {/* The rule of whichever one is selected, in the sheet where it is
          chosen. Learning what King of the Hill is after losing to it is the
          worst place to learn it. */}
      <p className="cmc-note cmc-vrule">{v.rule}</p>

      <label className={"cmm-check" + (canRate ? "" : " is-locked")}>
        <input type="checkbox" checked={rated && canRate} disabled={!canRate}
               onChange={e => setRated(e.target.checked)}/>
        <span>Rated game <span className="cmc-note-inline">
          {canRate ? "— it moves both ratings"
                   : "— " + v.name + " is always casual: one rating cannot measure two different games"}
        </span></span>
      </label>
      <label className="cmm-check">
        <input type="checkbox" checked={channel !== ""} onChange={e => setChannel(e.target.checked ? "commons" : "")}/>
        <span>Post to the channel <span className="cmc-note-inline">— the club can watch</span></span>
      </label>

      {err && <div className="cmm-offline" role="alert">{err}</div>}

      <button className="cmm-cta" onClick={send} disabled={busy}>
        {busy ? "Sending…" : (player.open ? "Post the challenge" : "Send challenge")}
      </button>
      <p className="cmc-note">
        {player.open ? "It stays up for 24 hours." : "Expires in 24 hours if they don't answer."}
      </p>
    </CmSheet>
  );
}

/* ── Play the computer (6A · 3) ───────────────────────────────────────────
   The one screen in the community that needs no network at all. The rules and
   the opponent both ship with the app (chess-engine.jsx), so a member at a
   centre whose signal has gone can still play — which is most of why chess is
   worth having here.

   The practice aids are the point of the level, not decoration: take-backs,
   a hint, and a warning before a blunder are how a child gets better between
   real games. None of it touches the club rating, and the screen says so. */

const CM_CHESS_AID_KEY = "ngg.cm.chessaids";
function cmChessAids() {
  try { return Object.assign({ takeback: true, hint: true, warn: true }, JSON.parse(localStorage.getItem(CM_CHESS_AID_KEY) || "{}")); }
  catch (_) { return { takeback: true, hint: true, warn: true }; }
}
function cmSetChessAids(patch) {
  const next = Object.assign(cmChessAids(), patch);
  try { localStorage.setItem(CM_CHESS_AID_KEY, JSON.stringify(next)); } catch (_) {}
  return next;
}

function CmChessComputer({ profile, onBack }) {
  const suggested = React.useMemo(() => {
    const levels = (profile && profile.levels) || [];
    const s = levels.filter(l => l.suggested)[0];
    return s ? s.level : 4;
  }, [profile]);
  const [level, setLevel] = React.useState(suggested);
  React.useEffect(() => { setLevel(suggested); }, [suggested]);
  const [aids, setAids] = React.useState(cmChessAids);
  const [playing, setPlaying] = React.useState(false);

  const levels = (profile && profile.levels) || (window.NggChess ? NggChess.LEVELS.map(l => ({ level: l.level, rating: l.rating, blurb: l.blurb })) : []);
  const info = levels.filter(l => l.level === level)[0] || levels[3] || { rating: 1250, blurb: "" };
  const myRating = profile ? profile.rating : 0;

  if (playing) {
    return <CmComputerGame level={level} aids={aids} onBack={() => setPlaying(false)}/>;
  }

  return (
    <div className="cmm-screen" role="region" aria-label="Play the computer">
      <header className="cmm-head cmm-head-back">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-h1">Play the computer</h1>
          <p className="cmm-sub">Works with no signal · nothing to download</p>
        </div>
      </header>

      <div className="cmm-pad">
        <div className="cmm-list-h">STRENGTH · LEVEL {level} OF 8</div>
        <div className="cmc-level">
          <div className="cmc-level-n">Level {level}</div>
          <div className="cmc-level-r">
            ≈ {info.rating}
            {myRating ? (Math.abs(info.rating - myRating) <= 120 ? " · about your rating"
              : (info.rating > myRating ? " · above your rating" : " · below your rating")) : ""}
          </div>
        </div>
        <input className="cmc-slider" type="range" min="1" max="8" step="1" value={level}
               onChange={e => setLevel(+e.target.value)} aria-label="Computer strength, 1 to 8"/>
        <div className="cmc-level-ends"><span>Level 1 · learning</span><span>Level 8 · brutal</span></div>
        <p className="cmc-blurb">{info.blurb}</p>

        <div className="cmm-list-h">PRACTICE HELP</div>
        <div className="cmc-aids">
          {[["takeback", "Take back moves", "Unrated practice only"],
            ["hint", "Show a hint", "Highlights one good square"],
            ["warn", "Warn me before a blunder", "Only when it is really bad"]].map(([id, label, sub]) => (
            <label key={id} className={"cmc-aid" + (aids[id] ? " is-on" : "")}>
              <input type="checkbox" checked={aids[id]} onChange={e => setAids(cmSetChessAids({ [id]: e.target.checked }))}/>
              <span className="cmc-aid-body">
                <span className="cmc-aid-l">{label}</span>
                <span className="cmc-aid-s">{sub}</span>
              </span>
            </label>
          ))}
        </div>

        <button className="cmm-cta" onClick={() => setPlaying(true)}>Play level {level}</button>
        <p className="cmc-note">Computer games don't change your club rating.</p>
      </div>
    </div>
  );
}

/* The offline game itself.
 *
 * Every rule here is the device engine's, and the device engine is a mirror of
 * the server's — checked move-for-move by perft in tests/chess-engine.test.js.
 * A position reached here is the same position it would be online. */
function CmComputerGame({ level, aids, onBack }) {
  const C = window.NggChess;
  const [fen, setFen] = React.useState(C.START_FEN);
  const [history, setHistory] = React.useState([]);      // [{fen, san, uci}]
  const [from, setFrom] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [hint, setHint] = React.useState("");
  const [warn, setWarn] = React.useState(null);          // {uci, loss, best}
  const [over, setOver] = React.useState(null);
  const [flip, setFlip] = React.useState(false);

  const pos = React.useMemo(() => C.parseFen(fen), [fen, C]);
  const legal = React.useMemo(() => (pos ? C.legalMoves(pos).map(C.uciOf) : []), [pos, C]);
  const myTurn = pos && pos.turn === "w" && !thinking && !over;
  const targets = from ? legal.filter(u => u.slice(0, 2) === from).map(u => u.slice(2, 4)) : [];
  const last = history.length ? history[history.length - 1] : null;

  const squares = React.useMemo(() => {
    // The board component reads a flat 64 in a1..h8-from-the-top order, which
    // is the same order the 0x88 board walks with the off-board files skipped.
    const out = [];
    if (!pos) return out;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) out.push(pos.board[r * 16 + f]);
    return out;
  }, [pos]);

  const counts = React.useMemo(() => {
    const c = {};
    [C.START_FEN].concat(history.map(h => h.fen)).forEach(f => {
      const p = C.parseFen(f); if (!p) return;
      const k = C.repetitionKey(p); c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [history, C]);

  const finish = (st) => {
    if (st.state === "checkmate") setOver({ win: st.winner === "w", reason: "checkmate" });
    else if (st.state === "stalemate") setOver({ draw: true, reason: "stalemate" });
    else if (st.state === "draw") setOver({ draw: true, reason: st.reason });
  };

  const commit = (uci) => {
    const r = C.move(fen, uci, counts);
    if (!r.ok) return;
    setFen(r.fen);
    setHistory(h => h.concat([{ fen: r.fen, san: r.san, uci: uci }]));
    setFrom(""); setHint(""); setWarn(null);
    if (r.status.state === "checkmate" || r.status.state === "stalemate" || r.status.state === "draw") {
      finish(r.status);
      return;
    }
    /* Hand the paint a frame before the search starts. Level 8 thinks for up
       to a second or so on a low-end device, and a board that freezes mid-move
       reads as a crash rather than as thinking. */
    setThinking(true);
    setTimeout(() => {
      const reply = C.bestMove(r.fen, level);
      if (!reply) { setThinking(false); return; }
      const after = C.move(r.fen, reply.uci, counts);
      setThinking(false);
      if (!after.ok) return;
      setFen(after.fen);
      setHistory(h => h.concat([{ fen: after.fen, san: after.san, uci: reply.uci }]));
      if (after.status.state === "checkmate" || after.status.state === "stalemate" || after.status.state === "draw") finish(after.status);
    }, 30);
  };

  const play = (uci) => {
    // The warning is asked BEFORE the move is made, which is the only moment
    // it is worth anything. Confirming plays it anyway — this is a nudge, not
    // a veto, and a practice aid that overrules a child is a worse teacher.
    if (aids.warn && !warn) {
      const check = C.blunderCheck(fen, uci, 2);
      if (check && check.blunder) { setWarn({ uci: uci, loss: check.loss, best: check.best }); return; }
    }
    commit(uci);
  };

  const tap = (sq, piece) => {
    if (!myTurn) return;
    if (from && targets.indexOf(sq) !== -1) {
      const opts = legal.filter(u => u.slice(0, 2) === from && u.slice(2, 4) === sq);
      // Promotion: four moves share the pair of squares. Queen unless asked.
      play(opts.length > 1 ? from + sq + "q" : opts[0]);
      return;
    }
    if (from === sq) { setFrom(""); return; }
    if (piece && legal.some(u => u.slice(0, 2) === sq)) { setFrom(sq); return; }
    setFrom("");
  };

  /* Take back BOTH plies — mine and its reply. Undoing only my own move would
     leave the computer on move in a position it never chose, which is not
     what "take back" means to anybody who has played chess. */
  const takeBack = () => {
    if (history.length < 2) { setFen(C.START_FEN); setHistory([]); setFrom(""); setOver(null); return; }
    const next = history.slice(0, -2);
    setFen(next.length ? next[next.length - 1].fen : C.START_FEN);
    setHistory(next); setFrom(""); setOver(null); setHint(""); setWarn(null);
  };

  const showHint = () => {
    const a = C.analyse(fen, 2);
    if (a) { setHint(a.best.uci); toast.success("Look at " + a.best.uci.slice(2, 4) + "."); }
  };

  const checkSq = pos && C.inCheck(pos) ? C.idxToSq(C.kingSquare(pos, pos.turn)) : "";

  return (
    <div className="cmm-screen cmc-game-screen" role="region" aria-label={"Chess against level " + level}>
      <header className="cmm-head cmm-head-back">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Leave the game">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-h1">Level {level}</h1>
          <p className="cmm-sub">Unrated practice · no signal needed</p>
        </div>
      </header>

      <div className="cmc-players">
        <div className="cmc-side">
          <span className="cmc-av" style={{ background: "#3b3f51" }}>C</span>
          <span className="cmc-side-b">
            <span className="cmc-game-who">Computer · level {level}</span>
            <span className="cmc-game-sub">{thinking ? "Thinking…" : (pos && pos.turn === "b" ? "Its move" : "Waiting")}</span>
          </span>
        </div>
      </div>

      <ChessBoard squares={squares} flip={flip} from={from} targets={targets}
                  lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null}
                  checkSquare={checkSq} interactive={!!myTurn} onTap={tap}
                  onFlip={() => setFlip(f => !f)}/>

      <div className="cmc-players">
        <div className="cmc-side">
          <span className="cmc-av" style={{ background: "#b07cff" }}>Y</span>
          <span className="cmc-side-b">
            <span className="cmc-game-who">You · White</span>
            <span className="cmc-game-sub">{over ? "Game over" : (myTurn ? "Your move" : "…")}</span>
          </span>
        </div>
      </div>

      {/* The move list, scrolling sideways — a phone has no room for a column
          of it, and the last few plies are the ones anybody looks at. */}
      {history.length > 0 && (
        <div className="cmc-moves" aria-label="Moves played">
          {history.map((h, i) => (
            <span key={i} className="cmc-move">
              {i % 2 === 0 && <b>{Math.floor(i / 2) + 1}.</b>} {h.san}
            </span>
          ))}
        </div>
      )}

      <div className="cmc-acts">
        <button onClick={() => setFlip(f => !f)}>Flip</button>
        {aids.takeback && <button onClick={takeBack} disabled={!history.length}>Take back</button>}
        {aids.hint && <button onClick={showHint} disabled={!myTurn}>Hint</button>}
        <button onClick={() => setOver({ win: false, reason: "resigned" })} disabled={!!over}>Resign</button>
      </div>
      {hint && <p className="cmc-note">Hint: try {hint.slice(0, 2)} → {hint.slice(2, 4)}.</p>}

      {warn && (
        <CmSheet title="Are you sure?" onClose={() => setWarn(null)}>
          <p className="cmc-blurb">
            That gives away about {Math.round(warn.loss / 100)} points of material.
            {warn.best ? " " + warn.best.san + " keeps everything." : ""}
          </p>
          <button className="cmm-cta" onClick={() => setWarn(null)}>Let me think again</button>
          <button className="cmc-decline is-wide" onClick={() => { const u = warn.uci; setWarn({ uci: u, forced: true }); commit(u); }}>
            Play it anyway
          </button>
        </CmSheet>
      )}

      {over && (
        <CmSheet title={over.draw ? "Drawn" : (over.win ? "You won" : "You lost")} onClose={onBack}>
          <p className="cmc-blurb">
            {over.draw ? "Nobody can force a win from here — " + String(over.reason).replace(/_/g, " ") + "."
              : (over.win ? "Checkmate against level " + level + ". Try level " + Math.min(8, level + 1) + " next."
                : (over.reason === "resigned" ? "You resigned." : "Checkmate. Level " + Math.max(1, level - 1) + " is a fairer fight."))}
          </p>
          <p className="cmc-note">This was practice — your club rating is untouched.</p>
          <button className="cmm-cta" onClick={() => { setFen(C.START_FEN); setHistory([]); setOver(null); setFrom(""); }}>Play again</button>
          <button className="cmc-decline is-wide" onClick={onBack}>Back to chess</button>
        </CmSheet>
      )}
    </div>
  );
}

/* CmMatches and MatchList lived here: a second chess lobby, ~140 lines, that
 * nothing in the app rendered. The router goes CmChess → MatchGame and never
 * touched it; the only caller left was a screenshot fixture, which is how a
 * dead screen came to be photographed on every build and reviewed as though
 * it were the product. Deleted rather than kept 'in case': two lobbies is how
 * a design stops being followed, because half the changes land on the wrong
 * one. Its shot now points at the lobby members actually open. */

/* A player's side of the board: name, whether they are on move, and the pieces
   they have captured. Standard in every chess client, and the material count is
   the fastest way for a beginner to see they are behind. */
/* ── The clock ────────────────────────────────────────────────────────────
   A three-minute game whose clock you cannot see is not a three-minute game.
   The server is the authority: chess_clock_state() winds the mover's number
   down by however long they have actually been thinking, and every poll snaps
   this back to it. What happens in between is a local countdown from the
   moment the reading ARRIVED — not from the reading's own timestamp — so a
   slow response shortens the tick rather than the clock. A display that ran
   ahead of the server would show a child flagging with four seconds left.

   It does not announce itself. A live region firing twice a second is unusable
   with a screen reader, so the ticking figure is hidden from the accessibility
   tree and the announcements happen at the three moments that change what you
   would do: a minute, thirty seconds, ten. */

const MTG_CALLOUTS = [[60000, "One minute left."], [30000, "Thirty seconds left."], [10000, "Ten seconds left."]];

/** "1d 4h", "3h 20m", "18m" — a correspondence deadline, not a countdown. */
function mtgDeadline(ms) {
  const left = ms - Date.now();
  if (left <= 0) return "overdue";
  const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000);
  if (d > 0) return d + "d " + h + "h";
  const m = Math.floor((left % 3600000) / 60000);
  return h > 0 ? h + "h " + m + "m" : Math.max(1, m) + "m";
}

/** The same number, said rather than shown: "2 minutes 45 seconds". */
function mtgSpeakClock(ms) {
  const t = Math.max(0, Math.round(ms / 5000) * 5);   // to the nearest 5s, so it
  const m = Math.floor(t / 60), s = t % 60;           // does not churn every tick
  if (m === 0) return s + " second" + (s === 1 ? "" : "s");
  return m + " minute" + (m === 1 ? "" : "s") + (s ? " " + s + " second" + (s === 1 ? "" : "s") : "");
}

function MtgClock({ clock, side, yours, onMove }) {
  const [, tick] = React.useState(0);
  const gotAt = React.useRef(Date.now());
  const said = React.useRef(0);
  const [say, setSay] = React.useState("");
  const key = clock ? clock.whiteMs + ":" + clock.blackMs + ":" + clock.turn + ":" + clock.running : "";
  const running = !!(clock && clock.running && clock.turn === side);

  React.useEffect(() => { gotAt.current = Date.now(); tick(n => n + 1); }, [key]);
  React.useEffect(() => {
    if (!running) return;
    /* 200ms rather than 1000: at ten seconds the display shows tenths, and a
       tenths readout that only moves once a second is worse than none. */
    const id = setInterval(() => tick(n => n + 1), 200);
    return () => clearInterval(id);
  }, [running, key]);

  const base = clock ? (side === "w" ? clock.whiteMs : clock.blackMs) : 0;
  const shown = Math.max(0, base - (running ? Math.max(0, Date.now() - gotAt.current) : 0));

  React.useEffect(() => {
    if (!yours || !running) { return; }
    if (shown > 60000) { said.current = 0; return; }
    for (let i = 0; i < MTG_CALLOUTS.length; i++) {
      const [at, line] = MTG_CALLOUTS[i];
      if (shown <= at && (said.current === 0 || at < said.current)) { said.current = at; setSay(line); return; }
    }
  }, [shown, yours, running]);

  if (!clock) return null;
  if (!clock.live) {
    /* Correspondence: there is no countdown, there is a day to reply in — and
       it belongs to ONE player. Showing it on both seats says the person
       waiting is also on a clock, which is not true and is the sort of thing
       that makes somebody move a game they had a day to think about. */
    if (!clock.deadlineMs || !onMove) return null;
    return <span className="mtg-clock is-daily"
                 aria-label={(yours ? "You must reply within " : "They must reply within ") + mtgDeadline(clock.deadlineMs)}>
      {mtgDeadline(clock.deadlineMs)}
    </span>;
  }

  const out = clock.flagged === side || shown <= 0;
  return (
    <span className={"mtg-clock" + (running ? " is-running" : "")
                   + (shown < 30000 ? " is-low" : "") + (shown < 10000 ? " is-crit" : "")
                   + (out ? " is-out" : "")}>
      <span aria-hidden="true">{out ? "0:00" : trnClock(shown)}</span>
      {/* Readable on demand, never announced — aria-live is off, so a screen
          reader speaks it when the player moves to it and not otherwise. */}
      <span className="sr-only" aria-live="off">{out ? "Out of time." : mtgSpeakClock(shown) + " left"}</span>
      {yours && <span className="sr-only" role="status" aria-live="assertive">{say}</span>}
    </span>
  );
}

/* Three-check keeps a score that decides the game, so it belongs beside the
   player it belongs to rather than in a strip above the board. Three pips,
   filled as they are delivered — a number would need a label to be read. */
function MtgChecks({ n }) {
  return (
    <span className="mtg-checks" aria-label={n + " of 3 checks given"}>
      {[0, 1, 2].map(i => <span key={i} className={"mtg-check-pip" + (i < n ? " is-on" : "")} aria-hidden="true"/>)}
    </span>
  );
}

function ChessSeat({ player, colour, gone, score, onMove, clock, yours, checks }) {
  return (
    <div className={"mtg-seat" + (onMove ? " is-on" : "")}>
      <span className={"mtg-seat-dot is-" + colour} aria-hidden="true">{cmInitial(player.name)}</span>
      <span className="mtg-seat-n">
        {player.name}
        {player.rating ? <span className="mtg-seat-r">{player.rating}</span> : null}
      </span>
      {checks !== undefined && checks !== null && <MtgChecks n={checks}/>}
      <span className="mtg-seat-mat">
        {gone.map((t, i) => <span key={t + i} className="mtg-seat-pc" aria-hidden="true">{CHESS_GLYPH[t]}</span>)}
        {score > 0 && <b>+{score}</b>}
      </span>
      <MtgClock clock={clock} side={colour} yours={yours} onMove={onMove}/>
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
function ChessBoard({ squares, flip, from, targets, lastMove, checkSquare, interactive, premove, premoving, goals, onTap, onFlip }) {
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
      <div className={"mtg-board" + (premoving ? " is-premoving" : "")} role="grid"
           aria-label={premoving ? "Chess board — setting a premove" : "Chess board"}
           onKeyDown={onKey}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(row => (
          <div className="mtg-row" role="row" key={row}>
            {order.slice(row * 8, row * 8 + 8).map(i => {
              const sq = chessSqName(i);
              const piece = squares[i];
              const dark = ((Math.floor(i / 8) + (i % 8)) % 2) === 1;
              const isTarget = targets.indexOf(sq) !== -1;
              const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
              const isPre = !!premove && (premove.slice(0, 2) === sq || premove.slice(2, 4) === sq);
              /* King of the Hill: these four squares WIN the game, so they are
                 part of the position and not decoration. Marked with a ring
                 rather than a fill, because a fill reads as "a piece can move
                 here" — which is what the move dots already mean. */
              const isGoal = !!goals && goals.indexOf(sq) !== -1;
              const file = sq[0], rank = sq[1];
              // Coordinates on the edges only — on every square they are noise.
              const showFile = flip ? rank === "8" : rank === "1";
              const showRank = flip ? file === "h" : file === "a";
              return (
                <button key={sq} role="gridcell" data-sq={sq}
                  tabIndex={sq === cursor ? 0 : -1}
                  className={"mtg-sq" + (dark ? " is-dark" : "") + (from === sq ? " is-from" : "")
                    + (isTarget ? (piece ? " is-capture" : " is-target") : "")
                    + (isLast ? " is-last" : "") + (checkSquare === sq ? " is-check" : "")
                    + (isPre ? " is-premove" : "") + (isGoal ? " is-goal" : "")}
                  aria-disabled={!interactive}
                  onFocus={() => setCursor(sq)}
                  onClick={() => interactive && onTap(sq, piece)}
                  aria-label={sq
                    + (piece ? ", " + (piece === piece.toUpperCase() ? "white" : "black") + " " + CHESS_NAME[piece.toLowerCase()] : ", empty")
                    + (isTarget ? (piece ? ", can capture here" : ", can move here") : "")
                    + (isLast ? ", last move" : "")
                    + (isPre ? ", premove" : "")
                    + (isGoal ? ", hill square — a king here wins" : "")
                    + (checkSquare === sq ? ", in check" : "")
                    /* Say WHAT a tap will do while a premove is being set,
                       rather than leaving the square sounding identical to
                       one that would move a piece now. */
                    + (premoving && interactive ? ", tap to premove" : "")}>
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
    </div>
  );
}

/** One game: the board, the move list, and the six things you can say. */
/* ── After-game review ────────────────────────────────────────────────────
   What a child actually learns from. The game is over, nothing is at stake,
   and this is the one moment they will look at their own moves properly.

   WHERE IT RUNS. In the browser, on the engine that already ships for offline
   play. There is no engine on the server and there is not going to be one — a
   request that thinks for fifteen seconds does not survive shared hosting, and
   every game reviewed by every player would be the most expensive thing the
   club does. The idle CPU is on the phone in the child's hand.

   WHAT THAT COSTS, and what is done about it. A sixty-move game is a hundred
   and twenty positions and about half a minute of solid computation on a
   mid-range Android. So:

     · the loop yields between positions, so the tab stays alive and scrollable
       rather than freezing — the failure that makes people force-quit an app;
     · results render AS THEY ARRIVE, so the graph draws itself and the wait is
       visible progress rather than a spinner;
     · it can be stopped, and stopping keeps what it has;
     · one search per POSITION, not two per move. What a move was worth is the
       next position's score with the sign flipped, so a game needs n+1
       searches rather than 2n. That halves the wait for free.

   And it is stored, so the second person to open the game reads the first
   one's work instead of spending their own battery on the same arithmetic. */

/* Mate scores are ±99000-ish and would flatten every real number on the graph
   and turn one missed mate into a loss of two hundred pawns. Mapped to a large
   but finite advantage, which is what "you were winning" means to a reader. */
function cmCp(score) {
  if (!(typeof score === "number")) return 0;
  if (score > 90000) return 1000;
  if (score < -90000) return -1000;
  return Math.max(-1000, Math.min(1000, score));
}

/* How long the engine gets per position. A review nobody waits for is a review
   nobody reads, so the default is the one that keeps an ordinary club game
   under about half a minute; "careful" is there for a coach going through a
   game with a child, where the wait is the lesson. */
const CM_REVIEW_SPEEDS = [
  { id: "quick",   label: "Quick",   ms: 120 },
  { id: "normal",  label: "Normal",  ms: 300 },
  { id: "careful", label: "Careful", ms: 800 },
];

/* The wait, worked out from THIS game rather than written down.
   A fixed "about 40 seconds" printed beside a seven-move game is a promise the
   screen breaks by four seconds in the member's favour — which still teaches
   them the estimates are decoration. */
function cmReviewWait(positions, ms) {
  const secs = Math.round(positions * ms / 1000);
  if (secs < 10) return "a few seconds";
  if (secs < 90) return "about " + (Math.round(secs / 5) * 5) + " seconds";
  const mins = secs / 60;
  return "about " + (mins < 1.75 ? "a minute and a half" : Math.round(mins) + " minutes");
}

function CmReviewGraph({ evals, at, onPick, plies }) {
  /* An area chart, white's advantage above the line and black's below. Drawn
     as one path rather than as bars: a bar per ply is unreadable at sixty
     plies on a phone, and the shape of the game is the thing being shown. */
  const W = 100, H = 40;
  const n = Math.max(1, plies);
  const pt = (i) => {
    const v = Math.max(-1000, Math.min(1000, evals[i] === undefined ? 0 : evals[i]));
    // A square root, so the difference between +50 and +250 is visible at all.
    // Linear centipawns make every ordinary game a flat line with one spike.
    const t = Math.sign(v) * Math.sqrt(Math.abs(v) / 1000);
    return [(i / n) * W, H / 2 - t * (H / 2)];
  };
  let d = "M 0 " + (H / 2);
  for (let i = 0; i <= plies; i++) { const [x, y] = pt(i); d += " L " + x.toFixed(2) + " " + y.toFixed(2); }
  /* Filled from the line to the TOP, over a dark ground: the pale area is
     White's share of the position and the dark remainder is Black's, which is
     how every chess site draws this and the only version that can be read
     without a legend. An earlier draft shaded from the line DOWN over a
     two-tone background, which made the bottom half permanently dark — so a
     dead-level game looked like Black was winning it from move one. */
  const area = d + " L " + W + " 0 L 0 0 Z";
  const cursor = (at / n) * W;
  return (
    <div className="rev-graph">
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" role="img"
           aria-label={"How the game stood after each of " + plies + " moves. The pale area is White's advantage; where it drops below halfway, Black was better."}>
        <rect x="0" y="0" width={W} height={H} className="rev-g-b"/>
        <path d={area} className="rev-g-w"/>
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="rev-g-mid" vectorEffect="non-scaling-stroke"/>
        <path d={d} className="rev-g-line" vectorEffect="non-scaling-stroke"/>
        <line x1={cursor} y1="0" x2={cursor} y2={H} className="rev-g-cursor" vectorEffect="non-scaling-stroke"/>
      </svg>
      {/* The graph is a picture. This is the same information as something a
          screen reader can move through, and a thumb can drag. */}
      <input className="rev-scrub" type="range" min="0" max={plies} value={at}
             onChange={e => onPick(+e.target.value)}
             aria-label="Move number" aria-valuetext={"Move " + Math.ceil(at / 2) + " of " + Math.ceil(plies / 2)}/>
    </div>
  );
}

/* ── The result ───────────────────────────────────────────────────────────
   The design opens the review with the outcome and what it cost or earned,
   then the two things a child wants to do next. Not a heading and a back
   button: "you won, +8, play again" is the sentence. */
function CmReviewResult({ m, isPlayer, onRematch, onShare, busy }) {
  const you = isPlayer ? m.players[m.you] : null;
  const them = isPlayer ? m.players[m.you === "A" ? "B" : "A"] : m.players.B;
  const won = isPlayer && m.winnerId === (you || {}).id;
  const drawn = m.result === "draw";
  const reason = (m.reason || "").replace(/_/g, " ");
  const moves = Math.ceil(((m.moves || []).length) / 2);
  const delta = m.ratingDelta || 0;

  return (
    <section className={"rev-res" + (won ? " is-won" : drawn ? " is-drawn" : " is-lost")}>
      <span className="rev-res-eyebrow">
        {!isPlayer ? (m.winnerId ? (m.winnerId === m.players.A.id ? m.players.A.name : m.players.B.name) + " won" : "Drawn")
          : drawn ? "Drawn" : won ? "You won" : "You lost"}
        {reason ? " · " + reason : ""}{moves ? " on move " + moves : ""}
      </span>
      <div className="rev-res-line">
        {isPlayer && (you || {}).rating ? (
          <div className="rev-res-rating">
            {you.rating}
            {m.rated && delta !== 0 && (
              <span className={"rev-res-delta" + (delta > 0 ? " is-up" : " is-down")}>
                {delta > 0 ? "+" + delta : delta}
              </span>
            )}
          </div>
        ) : (
          <div className="rev-res-rating">
            {Math.ceil(((m.moves || []).length) / 2)}<span className="rev-res-unit"> moves</span>
          </div>
        )}
        <div className="rev-res-vs">
          {isPlayer ? "vs " + them.name + " · " : ""}{cmTcKind(m.timeControl).toLowerCase()}
          {m.rated ? "" : " · casual"}
        </div>
      </div>
      {isPlayer && (
        <div className="rev-res-acts">
          <button className="rev-res-a is-primary" disabled={busy === "rematch"} onClick={onRematch}>
            {busy === "rematch" ? "Sending…" : "Rematch"}
          </button>
          <button className="rev-res-a" disabled={busy === "share"} onClick={onShare}>
            {busy === "share" ? "Sharing…" : "Share to the club"}
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Accuracy ─────────────────────────────────────────────────────────────
   Two figures and a bar per move, which is the design's shape and a better one
   than the evaluation line I had: a child cannot read an evaluation curve, and
   they can read "that one is red". Each bar is a button that jumps the replay
   to the move, so the picture is also the navigation. */
const REV_BAR = { best: "#2f9e44", good: "#1f4bc4", inaccuracy: "#f5b026",
                  mistake: "#e08a00", blunder: "#e4032b" };

function CmReviewAccuracy({ white, black, names, verdicts, onPick }) {
  const bars = verdicts;
  const counts = {
    best: bars.filter(v => v.tag.tag === "best").length,
    inaccuracy: bars.filter(v => v.tag.tag === "inaccuracy" || v.tag.tag === "mistake").length,
    blunder: bars.filter(v => v.tag.tag === "blunder").length,
  };
  return (
    <section className="rev-card">
      <div className="rev-card-head">
        <h3 className="rev-card-h">Accuracy</h3>
        <span className="rev-card-n">{Math.ceil(verdicts.length / 2)} moves</span>
      </div>
      <div className="rev-tiles">
        <div className="rev-tile">
          <div className="rev-tile-n is-good">{white.accuracy}%</div>
          <div className="rev-tile-l">{names.w}</div>
        </div>
        <div className="rev-tile">
          <div className="rev-tile-n">{black.accuracy}%</div>
          <div className="rev-tile-l">{names.b}</div>
        </div>
      </div>
      {bars.length > 0 && (
        <>
          <div className="rev-bars">
            {bars.map(v => {
              /* Tall is good. The height is what the move kept rather than what
                 it lost, so a row of tall bars reads as a game played well
                 without anybody having to be told which way round it is.

                 The curve is a square root, not a straight line. Linear, a
                 blunder came out as a two-pixel stub at the baseline — the one
                 bar on the chart worth looking at was the one you could not
                 see — while every ordinary move sat pinned at the ceiling and
                 the whole picture read as a barcode. Rooted, a quarter-pawn
                 slip is visibly shorter and a queen drop still has a bar. */
              const kept = Math.max(24, 100 - Math.min(76, Math.sqrt(Math.max(0, v.loss)) * 3.2));
              return (
                <button key={v.ply} className="rev-bar" style={{ height: kept + "%",
                          background: REV_BAR[v.tag.tag] || "#cfd6e8" }}
                        onClick={() => onPick(v.ply)}
                        aria-label={"Move " + Math.ceil(v.ply / 2) + " " + v.san + " — " + v.tag.label}/>
              );
            })}
          </div>
          <div className="rev-legend">
            <span><i style={{ background: REV_BAR.best }}/>{counts.best} best</span>
            <span><i style={{ background: REV_BAR.inaccuracy }}/>{counts.inaccuracy} loose</span>
            <span><i style={{ background: REV_BAR.blunder }}/>{counts.blunder} blunder{counts.blunder === 1 ? "" : "s"}</span>
          </div>
        </>
      )}
    </section>
  );
}

/* ── The moment it turned ─────────────────────────────────────────────────
   A four-by-four crop of the board around the square the move landed on, so
   the card SHOWS the moment rather than only naming it. Cropped rather than
   shrunk: a whole board at 76px is a grey smudge. */
function CmReviewMini({ fen, square }) {
  const engine = window.NggChess;
  if (!engine || !fen) return null;
  const pos = engine.parseFen(fen);
  if (!pos) return null;
  const idx = engine.sqToIdx(square);
  if (idx < 0) return null;
  const r0 = Math.max(0, Math.min(4, (idx >> 4) - 1));
  const f0 = Math.max(0, Math.min(4, (idx & 15) - 1));
  const cells = [];
  for (let r = r0; r < r0 + 4; r++) {
    for (let f = f0; f < f0 + 4; f++) {
      const i = r * 16 + f;
      const p = pos.board[i];
      const dark = ((r + f) % 2) === 1;
      cells.push(
        <span key={i} className={"rev-mini-sq" + (dark ? " is-dark" : "") + (i === idx ? " is-at" : "")}>
          {p && <img src={CHESS_PIECE_SRC(p)} alt="" draggable={false}/>}
        </span>
      );
    }
  }
  return <span className="rev-mini" aria-hidden="true">{cells}</span>;
}

function CmReviewSide({ name, colour, s, engine }) {
  return (
    <div className={"rev-side is-" + colour}>
      <div className="rev-side-h">
        <span className={"mtg-seat-dot is-" + colour} aria-hidden="true"/>
        <span className="rev-side-n">{name}</span>
      </div>
      <div className="rev-acc" aria-label={name + " played at " + s.accuracy + " percent accuracy"}>
        <span className="rev-acc-n">{s.accuracy}</span><span className="rev-acc-p">%</span>
      </div>
      <div className="rev-acc-l">accuracy</div>
      <ul className="rev-counts">
        <li><b>{s.inaccuracies}</b> inaccurac{s.inaccuracies === 1 ? "y" : "ies"}</li>
        <li><b>{s.mistakes}</b> mistake{s.mistakes === 1 ? "" : "s"}</li>
        <li className={s.blunders ? "is-bad" : ""}><b>{s.blunders}</b> blunder{s.blunders === 1 ? "" : "s"}</li>
      </ul>
    </div>
  );
}

function CmGameReview({ m, onBack }) {
  const engine = window.NggChess;
  /* Every position of the game, replayed from the move list. Done once and
     memoised — a Chess960 game starts somewhere other than the usual square,
     which is what startFen is for. */
  const line = React.useMemo(() => {
    if (!engine) return null;
    const start = m.startFen || engine.START_FEN;
    const fens = [start], plies = [];
    let fen = start;
    for (const mv of (m.moves || [])) {
      const res = engine.move(fen, mv.move);
      if (!res || !res.ok) break;          // a move we cannot replay ends the line
      fen = res.fen;
      fens.push(fen);
      plies.push({ uci: mv.move, san: mv.san, playerId: mv.playerId });
    }
    return { fens, plies };
  }, [m.matchId]);

  const [scores, setScores] = React.useState([]);
  const [phase, setPhase] = React.useState("idle");   // idle | running | done | stored
  const [speed, setSpeed] = React.useState("normal");
  const [at, setAt] = React.useState(0);
  const [stored, setStored] = React.useState(undefined);   // undefined = not asked yet
  const [flip, setFlip] = React.useState(false);
  /* The board is a SECOND view, behind "Replay move by move". The design does
     it that way and it is the right call: the summary answers "how did I
     play", the replay answers "show me", and stacking both on one scroll meant
     neither was the screen. */
  const [replay, setReplay] = React.useState(false);
  const [act, setAct] = React.useState("");
  const stop = React.useRef(false);

  // Somebody may already have reviewed this game. Their numbers, not ours.
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.match.review(m.matchId)
      .then(r => { if (alive) setStored(r.review || null); })
      .catch(() => { if (alive) setStored(null); });
    return () => { alive = false; };
  }, [m.matchId]);

  const budget = (CM_REVIEW_SPEEDS.find(s => s.id === speed) || CM_REVIEW_SPEEDS[1]).ms;
  const total = line ? line.fens.length : 0;

  const run = () => {
    if (!line || !engine) return;
    stop.current = false;
    setPhase("running");
    setScores([]);
    let i = 0;
    const acc = [];
    const step = () => {
      if (stop.current) { setPhase("done"); return; }
      if (i >= line.fens.length) { setPhase("done"); return; }
      /* One position, then hand the thread back. Without the yield the whole
         review is a single task and the tab is frozen for its duration —
         nothing paints, nothing scrolls, and the phone offers to close it. */
      acc[i] = engine.positionScore(line.fens[i], { ms: budget, depth: 30, pv: 4 });
      i++;
      setScores(acc.slice());
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  };
  React.useEffect(() => () => { stop.current = true; }, []);

  /* The per-move verdicts, derived from the scores as they arrive so the list
     fills in behind the graph. */
  const verdicts = React.useMemo(() => {
    if (!line) return [];
    const out = [];
    for (let i = 0; i < line.plies.length; i++) {
      const a = scores[i], b = scores[i + 1];
      if (!a || !b) break;
      const before = cmCp(a.score);
      // b.score is from the OTHER side's view, so flipping it gives what the
      // position is worth to the player who just moved.
      const after = -cmCp(b.score);
      const wasBest = a.best === line.plies[i].uci;
      const loss = wasBest ? 0 : Math.max(0, before - after);
      out.push({
        ply: i + 1, uci: line.plies[i].uci, san: line.plies[i].san,
        white: i % 2 === 0, loss: loss, best: a.san, bestUci: a.best,
        pv: a.pv || [], tag: engine.classifyLoss(loss, wasBest),
        evalAfter: (i % 2 === 0) ? -cmCp(b.score) : cmCp(b.score),
      });
    }
    return out;
  }, [scores, line]);

  /* White's advantage after every ply, which is what the graph draws. Index 0
     is the starting position. */
  const evals = React.useMemo(() => {
    const out = [];
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i];
      if (!s) break;
      // scores[i] is from the side to move at position i: White on even plies.
      out.push(i % 2 === 0 ? cmCp(s.score) : -cmCp(s.score));
    }
    return out;
  }, [scores]);

  const summary = React.useMemo(() => {
    const side = (isWhite) => {
      const mine = verdicts.filter(v => v.white === isWhite);
      if (!mine.length) return { accuracy: 0, avgLoss: 0, blunders: 0, mistakes: 0, inaccuracies: 0, moves: 0 };
      const avg = mine.reduce((t, v) => t + v.loss, 0) / mine.length;
      return {
        accuracy: engine.accuracyFrom(avg), avgLoss: Math.round(avg), moves: mine.length,
        blunders: mine.filter(v => v.tag.tag === "blunder").length,
        mistakes: mine.filter(v => v.tag.tag === "mistake").length,
        inaccuracies: mine.filter(v => v.tag.tag === "inaccuracy").length,
      };
    };
    /* The turning point. A sign change matters more than a big number: losing
       300 centipawns while already lost changed nothing, and losing 250 while
       level is the moment the game went. */
    let turning = null;
    for (const v of verdicts) {
      const beforeIdx = v.ply - 1;
      const flipped = beforeIdx > 0 && Math.sign(evals[beforeIdx]) !== 0
        && Math.sign(evals[beforeIdx]) !== Math.sign(evals[v.ply] || 0);
      const weight = v.loss + (flipped ? 200 : 0);
      if (v.loss >= 120 && (!turning || weight > turning.weight)) turning = { v: v, weight: weight };
    }
    return { white: side(true), black: side(false), turning: turning ? turning.v : null };
  }, [verdicts, evals]);

  /* Keep it, once, when the whole game has been analysed. A partial review
     would be a number that looks like the game's and is about half of it. */
  const savedRef = React.useRef(false);
  React.useEffect(() => {
    if (phase !== "done" || savedRef.current) return;
    if (!line || verdicts.length !== line.plies.length || !line.plies.length) return;
    if (stored) return;                       // somebody got here first
    if (m.spectator || m.staffView) return;   // a review is the players' own
    savedRef.current = true;
    const depths = scores.filter(Boolean).map(s => s.depth || 0);
    NGGApi.member.match.reviewSave(m.matchId, {
      white: summary.white, black: summary.black,
      turning: summary.turning
        ? { ply: summary.turning.ply, san: summary.turning.san,
            best: summary.turning.best, loss: summary.turning.loss }
        : null,
      evals: evals,
      engineDepth: depths.length ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length) : 0,
      engineMs: budget,
    }).then(r => { if (r && r.review) setStored(r.review); }).catch(() => {});
  }, [phase, verdicts.length, line, stored]);

  const isPlayer = m.you === "A" || m.you === "B";
  const them = isPlayer ? m.players[m.you === "A" ? "B" : "A"] : m.players.B;

  /* Rematch is a fresh challenge on the same terms, which is what a rematch
     is — not a copy of the finished game. The other player still has to
     accept, because a rematch nobody agreed to is a game one person started. */
  const rematch = () => {
    setAct("rematch");
    NGGApi.member.match.challenge({
      opponentId: them.id, timeControl: m.timeControl || "10+0",
      colourPref: m.yourColour === "w" ? "black" : "white",   // colours swap, as they do over a board
      variant: m.variant || "standard", rated: !!m.rated,
    })
      .then(() => toast.success("Rematch sent to " + them.name + "."))
      .catch(e => toast.error(cmChessError(e)))
      .then(() => setAct(""));
  };

  const share = () => {
    setAct("share");
    const w = summary.white, b = summary.black;
    const line1 = (m.winnerId
        ? (m.winnerId === m.players.A.id ? m.players.A.name : m.players.B.name) + " beat "
          + (m.winnerId === m.players.A.id ? m.players.B.name : m.players.A.name)
        : m.players.A.name + " drew with " + m.players.B.name)
      + " in " + Math.ceil((m.moves || []).length / 2) + " moves · " + cmTcName(m.timeControl)
      + (w.accuracy || b.accuracy ? " · accuracy " + w.accuracy + "% / " + b.accuracy + "%" : "");
    NGGApi.member.community.post({ channelSlug: m.channelSlug || "commons", body: line1 })
      .then(() => toast.success("Posted to the club."))
      .catch(e => toast.error((e && (e.detail || e.message)) || "Couldn't post that."))
      .then(() => setAct(""));
  };

  if (!engine || !line) {
    return <div className="cmm-screen"><div className="cmm-offline" role="alert">
      The review needs the chess engine, which has not loaded.
    </div></div>;
  }

  const shown = Math.min(at, line.fens.length - 1);
  const squares = chessSquares(line.fens[shown]);
  const lastPly = shown > 0 ? line.plies[shown - 1] : null;
  const here = shown > 0 ? verdicts[shown - 1] : null;
  const progress = total ? Math.round((scores.length / total) * 100) : 0;
  const names = { w: m.players.A.name, b: m.players.B.name };

  return (
    <div className="cmm-screen rev">
      <header className="cmm-ch-head">
        <button className="cmm-icon-btn" onClick={onBack} aria-label="Back to the game">{cmUiIcon("back", 22)}</button>
        <div className="cmm-head-txt">
          <h1 className="cmm-ch-title">Game review</h1>
          <p className="cmm-sub">{names.w} vs {names.b}</p>
        </div>
      </header>

      <div className="cmm-stream">
        {/* Before it starts, or while it runs. */}
        {phase === "idle" && !stored && (
          <div className="rev-start">
            <h2 className="rev-h">Go through the game</h2>
            <p className="rev-p">
              Your phone does the thinking — nothing is sent anywhere. Longer means a better answer.
            </p>
            <div className="cmc-opts is-three">
              {CM_REVIEW_SPEEDS.map(sp => (
                <button key={sp.id} className={"cmc-opt" + (speed === sp.id ? " is-on" : "")}
                        aria-pressed={speed === sp.id} onClick={() => setSpeed(sp.id)}>
                  <span className="cmc-opt-n">{sp.label}</span>
                  <span className="cmc-opt-k">{cmReviewWait(total, sp.ms)}</span>
                </button>
              ))}
            </div>
            {/* MOVES, not plies. Chess counts in pairs and so does everybody
                who plays it: a seven-move game is not a thirteen-move game,
                whatever the array length says. */}
            <button className="cmm-cta" onClick={run}>
              Review {Math.ceil(line.plies.length / 2)} move{line.plies.length > 2 ? "s" : ""}
            </button>
          </div>
        )}

        {phase === "idle" && stored && (
          <div className="rev-start">
            <h2 className="rev-h">Already reviewed</h2>
            <p className="rev-p">
              This game was gone through {cmAgo(stored.createdAt)} ago, to depth {stored.engine.depth || "?"}.
              Those are the numbers below, so both of you are looking at the same ones.
            </p>
            <button className="cmm-cta is-ghost" onClick={run}>Go through it again on this phone</button>
          </div>
        )}

        {phase === "running" && (
          <div className="rev-run" role="status" aria-live="polite">
            <div className="rev-bar"><span style={{ width: progress + "%" }}/></div>
            <p className="rev-p">
              Thinking about move {Math.max(1, Math.ceil(scores.length / 2))} of {Math.ceil(line.plies.length / 2)}…
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => { stop.current = true; }}>
              Stop and keep what we have
            </button>
          </div>
        )}

        {/* The summary. The design's shape: what happened, how well you played,
            where it turned, and who could look at it with you. */}
        {(verdicts.length > 0 || stored) && !replay && (() => {
          const w = verdicts.length ? summary.white : stored.white;
          const b = verdicts.length ? summary.black : stored.black;
          const t = verdicts.length ? summary.turning : stored.turning;
          return (
            <>
              <CmReviewResult m={m} isPlayer={isPlayer} busy={act}
                              onRematch={rematch} onShare={share}/>

              <CmReviewAccuracy white={w} black={b} names={names} verdicts={verdicts}
                                onPick={(ply) => { setAt(ply); setReplay(true); }}/>

              {t && (
                <section className="rev-card">
                  <h3 className="rev-card-h">The moment it turned</h3>
                  <div className="rev-turn-row">
                    {verdicts.length > 0 && line.fens[t.ply] && verdicts[t.ply - 1]
                      && <CmReviewMini fen={line.fens[t.ply]} square={verdicts[t.ply - 1].uci.slice(2, 4)}/>}
                    <div className="rev-turn-txt">
                      {/* "Move 24 · Qd5?? blunder", the way the design writes it and
                          the way a coach says it. It used to read "Move 5… · Bxd1",
                          where the ellipsis was correct chess notation for a black
                          move and looked exactly like a truncated string. */}
                      <div className="rev-turn-m">
                        Move {Math.ceil(t.ply / 2)} · {t.san}{t.loss >= 300 ? "??" : "?!"} · {t.loss >= 300 ? "blunder" : "mistake"}
                      </div>
                      <p className="rev-turn-p">
                        {t.best && t.best !== t.san
                          ? <><b>{t.best}</b> was the move — it cost about {(t.loss / 100).toFixed(1)} pawns.</>
                          : <>It cost about {(t.loss / 100).toFixed(1)} pawns.</>}
                      </p>
                    </div>
                  </div>
                  {verdicts.length > 0 && (
                    <button className="rev-replay" onClick={() => { setAt(t.ply); setReplay(true); }}>
                      Replay move by move
                    </button>
                  )}
                </section>
              )}

              {!t && verdicts.length > 0 && (
                <section className="rev-card">
                  <h3 className="rev-card-h">Nothing went badly wrong</h3>
                  <p className="rev-turn-p">No single move lost the game. Walk through it and see where it drifted.</p>
                  <button className="rev-replay" onClick={() => setReplay(true)}>Replay move by move</button>
                </section>
              )}

              {/* The mentor hand-off from the design. A review that ends in
                  "you blundered on move 24" and nothing else leaves a child
                  holding a number; this leaves them with a person. */}
              {isPlayer && t && (
                <section className="rev-ask">
                  <span className="rev-ask-av" aria-hidden="true">?</span>
                  <span className="rev-ask-t">
                    Ask a mentor to look at move {Math.ceil(t.ply / 2)} with you
                  </span>
                  <button className="rev-ask-b" disabled={act === "ask"} onClick={() => {
                    setAct("ask");
                    NGGApi.member.match.report(m.matchId)
                      .then(() => toast.success("A mentor will look at this game with you."))
                      .catch(() => toast.error("Couldn't ask just now."))
                      .then(() => setAct(""));
                  }}>Ask</button>
                </section>
              )}

              <p className="rev-note">
                Accuracy here is our own measure, worked out on this phone. It is for comparing
                your games with each other — not with a number from another app.
              </p>
            </>
          );
        })()}

        {/* The replay, behind the summary rather than under it. */}
        {verdicts.length > 0 && replay && (
          <>
            <button className="rev-back" onClick={() => setReplay(false)}>← Back to the summary</button>

            <CmReviewGraph evals={evals} at={shown} plies={line.plies.length} onPick={setAt}/>

            <div className="rev-board">
              <ChessBoard squares={squares} flip={flip} from="" targets={[]}
                lastMove={lastPly ? { from: lastPly.uci.slice(0, 2), to: lastPly.uci.slice(2, 4) } : null}
                checkSquare="" interactive={false} premove={null} premoving={false}
                goals={m.variant === "kingofthehill" ? CM_HILL : null} onTap={() => {}}/>
            </div>

            <div className="rev-nav">
              <button className="rev-nav-b" onClick={() => setAt(0)} aria-label="First move">⏮</button>
              <button className="rev-nav-b" onClick={() => setAt(Math.max(0, shown - 1))} aria-label="Previous move">◀</button>
              <span className="rev-nav-at" aria-live="polite">
                {shown === 0 ? "Start" : ("Move " + Math.ceil(shown / 2) + (shown % 2 ? "." : "…") + " " + line.plies[shown - 1].san)}
              </span>
              <button className="rev-nav-b" onClick={() => setAt(Math.min(line.plies.length, shown + 1))} aria-label="Next move">▶</button>
              <button className="rev-nav-b" onClick={() => setAt(line.plies.length)} aria-label="Last move">⏭</button>
              <button className="rev-nav-b" onClick={() => setFlip(v => !v)} aria-label="Flip the board">⇅</button>
            </div>

            {here && (
              <div className={"rev-verdict is-" + here.tag.tag}>
                <div className="rev-verdict-h">{here.tag.label}</div>
                {here.tag.tag !== "best" && here.tag.tag !== "good" && (
                  <p className="rev-verdict-b">
                    <b>{here.best}</b> was the move
                    {here.pv && here.pv.length > 1
                      ? <> — the line runs {here.pv.slice(0, 4).map(x => x.san).join(" ")}.</>
                      : "."}
                  </p>
                )}
                {here.tag.tag !== "good" && here.tag.tag !== "best" && here.loss > 0 && (
                  <p className="rev-verdict-c">It cost about {(here.loss / 100).toFixed(1)} pawns.</p>
                )}
                {here.tag.tag === "good" && <p className="rev-verdict-c">Nothing wrong with it.</p>}
              </div>
            )}

            <h3 className="mtl-h">Every move</h3>
            <ol className="rev-list">
              {verdicts.map(v => (
                <li key={v.ply}>
                  <button className={"rev-move is-" + v.tag.tag + (v.ply === shown ? " is-at" : "")}
                          onClick={() => setAt(v.ply)}
                          aria-current={v.ply === shown ? "true" : undefined}>
                    <span className="rev-move-n">{v.white ? Math.ceil(v.ply / 2) + "." : ""}</span>
                    <span className="rev-move-s">{v.san}</span>
                    <span className="rev-move-t">{v.tag.tag === "good" || v.tag.tag === "best" ? "" : v.tag.label}</span>
                    {v.tag.tag !== "good" && v.tag.tag !== "best" && v.loss > 0
                      && <span className="rev-move-l">−{(v.loss / 100).toFixed(1)}</span>}
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Material, as a bar ───────────────────────────────────────────────────
   The design puts an EVALUATION bar beside the board. This is material, and
   the difference is not cosmetic: an evaluation bar during a live game is the
   engine telling a child whether they are winning, which in a rated club game
   is assistance. Material is already on the board and both players can count
   it, so a bar showing it reveals nothing. The real evaluation is in the
   review, after the game, where knowing it is the whole point. */
function MtgMaterialBar({ score, flip }) {
  /* score is from White's side. Nine pawns of material is a rout, so that is
     the end of the scale rather than infinity. */
  const clamped = Math.max(-9, Math.min(9, (score || 0) / 100));
  const whiteShare = 50 + (clamped / 9) * 50;
  const top = flip ? whiteShare : 100 - whiteShare;
  const label = Math.abs(clamped) < 0.5 ? "Material is level"
    : (clamped > 0 ? "White" : "Black") + " is ahead by " + Math.abs(Math.round(clamped)) + " points of material";
  return (
    <div className="mtg-matbar" role="img" aria-label={label}>
      <span className="mtg-matbar-fill" style={{ height: (100 - top) + "%" }}/>
    </div>
  );
}

/* The reactions, as a panel. Lifted out of the game screen so the same block
   serves the tab beside the board and the section under it. */
function MtgSay({ m, busy, onSay }) {
  return (
    <div className="mtg-reacts">
      <p className="mtl-hint">These are the only messages here — there is no typing.</p>
      <div className="mtg-react-row">
        {Object.keys(MATCH_REACTION_LABEL).map(k => (
          <button key={k} className="mtg-react" disabled={busy} onClick={() => onSay(k)}>
            <span aria-hidden="true">{MATCH_REACTION_LABEL[k][0]}</span> {MATCH_REACTION_LABEL[k][1]}
          </button>
        ))}
      </div>
      {(m.reactions || []).length > 0 && <>
        <h4 className="mtl-h is-sub">Said so far</h4>
        <div className="mtg-react-log">
          {(m.reactions || []).slice(-6).map((r, i) => {
            const mine = r.playerId === (m.players[m.you === "A" ? "A" : "B"] || {}).id;
            const who = mine ? "You" : (r.playerId === m.players.A.id ? m.players.A.name : m.players.B.name);
            return (
              <span key={i} className="mtg-react-chip">
                <span aria-hidden="true">{(MATCH_REACTION_LABEL[r.reaction] || ["💬", r.reaction])[0]}</span>
                <b>{who}</b>
                {(MATCH_REACTION_LABEL[r.reaction] || ["", r.reaction])[1]}
              </span>
            );
          })}
        </div>
      </>}
    </div>
  );
}

/* ── The rail beside the board ────────────────────────────────────────────
   Desktop only, and it is the reason the desktop layout exists at all: on a
   wide screen the board leaves two columns of empty space, and what belongs in
   them is the rest of your chess — the other games waiting on you and the
   challenges you could take — so switching between them does not mean leaving
   the board and coming back.

   Fetched once, on mount, and not polled. The board's own tick already tells
   this screen when something changed; a second poll for a sidebar would double
   the request count on somebody's data bundle for a list that changes a few
   times an hour. */
function MtgRail({ matchId, onOpen }) {
  const [games, setGames] = React.useState(null);
  const [chal, setChal] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    try {
      NGGApi.member.match.list()
        .then(r => { if (alive) setGames((r.matches || []).filter(g => g.matchId !== matchId)); })
        .catch(() => { if (alive) setGames([]); });
      NGGApi.member.match.challenges()
        .then(r => { if (alive) setChal(r); })
        .catch(() => { if (alive) setChal({ toYou: [], open: [] }); });
    } catch (_) { setGames([]); setChal({ toYou: [], open: [] }); }
    return () => { alive = false; };
  }, [matchId]);

  const yours = (games || []).filter(g => g.status === "active" || g.status === "invited");
  const open = ((chal && chal.open) || []).concat((chal && chal.toYou) || []);

  return (
    <aside className="mtg-rail" aria-label="Your other games">
      <section className="mtg-rail-card">
        <h3 className="mtg-rail-h">Your games{yours.length ? " · " + yours.length : ""}</h3>
        {games === null ? <div className="mtg-rail-skel"/>
          : yours.length === 0 ? <p className="mtg-rail-none">Nothing else on.</p>
          : yours.slice(0, 6).map(g => (
            <button key={g.matchId} className="mtg-rail-row" onClick={() => onOpen(g.matchId)}>
              <span className="mtg-rail-av" style={{ background: cmColor(cmOtherName(g), "") }}>
                {cmInitial(cmOtherName(g))}
              </span>
              <span className="mtg-rail-who">{cmOtherName(g)}</span>
              <span className={"mtg-rail-tag" + (g.yourTurn ? " is-turn" : "")}>
                {g.yourTurn ? "Your move" : "Waiting"}
              </span>
            </button>
          ))}
      </section>

      <section className="mtg-rail-card">
        <h3 className="mtg-rail-h">Open challenges</h3>
        {chal === null ? <div className="mtg-rail-skel"/>
          : open.length === 0 ? <p className="mtg-rail-none">None posted.</p>
          : open.slice(0, 5).map(c => (
            <div key={c.challengeId} className="mtg-rail-row is-static">
              <span className="mtg-rail-tc">{cmTcName(c.timeControl)}</span>
              <span className="mtg-rail-who">{c.from.name}</span>
              <span className="mtg-rail-tag">{c.rated ? "rated" : "casual"}</span>
            </div>
          ))}
      </section>
    </aside>
  );
}

function MatchGame({ matchId, onBack }) {
  const [m, setM] = React.useState(null);
  const [reviewing, setReviewing] = React.useState(false);
  /* Board mode. On a wide screen the design turns this into a dark
     three-column room: the board is the subject and everything else is chrome
     around it. Driven by matchMedia rather than by a CSS-only rearrangement
     because two of the three columns do not exist on a phone at all — building
     them and hiding them would cost two requests a member on a handset never
     needed. */
  const [wide, setWide] = React.useState(false);
  const [tab, setTab] = React.useState("moves");
  React.useEffect(() => {
    if (!window.matchMedia) return;
    const q = window.matchMedia("(min-width: 1100px)");
    const on = () => setWide(q.matches);
    on();
    if (q.addEventListener) { q.addEventListener("change", on); return () => q.removeEventListener("change", on); }
    q.addListener(on); return () => q.removeListener(on);
  }, []);
  const [err, setErr] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [promo, setPromo] = React.useState(null);   // { from, to } awaiting a piece
  const [manualFlip, setManualFlip] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  /* A premove: the move you want to play the instant the opponent replies.
     Blitz is unplayable without it — three minutes each means a round trip is
     a meaningful fraction of your clock, and every chess app people have used
     has this. Held as UCI, played by the effect below, cancelled by any tap on
     the board or by the position turning out not to allow it. */
  const [premove, setPremove] = React.useState(null);
  const [preFrom, setPreFrom] = React.useState("");
  const [say, setSay] = React.useState("");        // the live-region announcement
  const lastAnnounced = React.useRef(-1);

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

  /* One id per move attempt, so a retry after a dropped response replays the
     original outcome instead of failing on a move that already landed. Kept in
     a ref rather than state: it must survive a re-render without becoming one. */
  const moveIds = React.useRef({});
  const newMoveId = () => {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (_) {}
    return "mv-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  };

  const send = React.useCallback((uci, opts) => {
    const quiet = opts && opts.quiet;
    if (!quiet) { setBusy(true); setErr(""); }
    setFrom(""); setPromo(null);
    // Same uci from the same position reuses its id, so a double-tap or a
    // manual retry is the same attempt rather than a second move.
    const key = uci + "@" + matchId;
    if (!moveIds.current[key]) moveIds.current[key] = newMoveId();
    const id = moveIds.current[key];
    return NGGApi.member.match.move(matchId, uci, id)
      .then(r => { delete moveIds.current[key]; load(); return r; })
      .catch(e => {
        /* An illegal premove is not an error the player made — the position
           changed under it. Drop it quietly and let them move again. */
        if (quiet) { setPremove(null); return null; }
        setErr(e.code === "illegal_move" ? "That move isn't legal." : ((e && e.message) || "Could not play that move."));
        return null;
      })
      .then(r => { if (!quiet) setBusy(false); return r; });
  }, [matchId, load]);

  /* ← and → step through the moves, which is what every chess interface does
     and what the hint line beside the board promises. Bound on the document
     rather than on the board, because after a move the focus is wherever the
     player last tapped. Ignored while a text field has focus — there is none
     on this screen today, and there will be one the day somebody adds a
     search box. */
  const [reviewAt, setReviewAt] = React.useState(-1);   // -1 = live position
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const total = ((m && m.moves) || []).length;
      if (!total) return;
      e.preventDefault();
      setReviewAt(v => {
        const cur = v < 0 ? total : v;
        const next = e.key === "ArrowLeft" ? Math.max(0, cur - 1) : Math.min(total, cur + 1);
        return next >= total ? -1 : next;      // back to live at the end
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [m && m.moves && m.moves.length]);

  /* Play the premove the moment the turn comes back. Cleared first, so a
     rejected one cannot loop. */
  React.useEffect(() => {
    if (!premove || !m || m.status !== "active" || !m.yourTurn || busy) return;
    const uci = premove;
    setPremove(null);
    send(uci, { quiet: true });
  }, [premove, m && m.yourTurn, m && m.status, m && m.ply, busy, send]);

  /* Say what happened, once per ply.
     A board that changes silently is a board a screen-reader user cannot
     follow: they hear nothing when the opponent moves and have to re-read
     sixty-four squares to find out what did. */
  React.useEffect(() => {
    if (!m || !m.moves || !m.moves.length) return;
    if (m.ply === lastAnnounced.current) return;
    lastAnnounced.current = m.ply;
    const last = m.moves[m.moves.length - 1];
    const mine = last.playerId === (m.players[m.you === "A" ? "A" : "B"] || {}).id;
    const who = mine ? "You play" : (cmOtherName(m) + " plays");
    let line = who + " " + cmSpeakSan(last.san) + ".";
    if (m.status === "complete") {
      line += " " + (m.result === "draw" ? "The game is drawn."
                   : (m.winnerId === (m.players[m.you === "A" ? "A" : "B"] || {}).id ? "You win." : "You lose."))
            + (m.reason ? " By " + String(m.reason).replace(/_/g, " ") + "." : "");
    } else if (m.check) {
      line += " Check.";
    } else if (m.yourTurn) {
      line += " Your move.";
    }
    setSay(line);
  }, [m && m.ply, m && m.status, m]);

  if (m && reviewing) return <CmGameReview m={m} onBack={() => setReviewing(false)}/>;

  if (err && !m) return <div className="arc mtg"><div className="arc-err" role="alert">{err}</div>
    <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button></div>;
  if (!m) return <div className="arc mtg"><div className="arc-skels"><div className="arc-skel"/></div></div>;

  /* The position on screen. Live unless the player has stepped back with the
     arrow keys, in which case it is replayed from the move list — which also
     means stepping back cannot accidentally move a piece, because the board is
     not interactive when it is not showing the live position.
     
     Deliberately NOT a useMemo: everything from here down is below this
     component's early returns, and a hook below a conditional return is a
     hook that sometimes does not run. Replaying at most a couple of hundred
     moves costs less than the bug that would buy. */
  const stepped = reviewAt >= 0 && reviewAt < ((m.moves || []).length);
  let shownFen = m.state;
  if (stepped && window.NggChess) {
    let fen = m.startFen || window.NggChess.START_FEN;
    let good = true;
    for (let i = 0; i < reviewAt && good; i++) {
      const r = window.NggChess.move(fen, m.moves[i].move);
      if (!r || !r.ok) good = false; else fen = r.fen;
    }
    if (good) shownFen = fen;
  }

  const squares = chessSquares(shownFen);
  /* You look at your own pieces from your own side. Staff have no side, so they
     get white's view — and either can flip, because looking at a position from
     the other side is a normal thing to want. */
  const baseFlip = m.yourColour === "b";
  const flip = manualFlip ? !baseFlip : baseFlip;
  const legal = m.legal || [];
  const canMove = m.status === "active" && m.yourTurn && !busy;
  /* Premoves are for games with a running clock. On a daily game there is
     nothing to save — you have twenty-four hours — and a move queued a day in
     advance against a position you have not seen is a way to lose a game. */
  const clockIsLive = !!(m.clock && m.clock.live);
  const targets = from ? legal.filter(u => u.slice(0, 2) === from).map(u => u.slice(2, 4)) : [];
  const material = chessMaterial(squares);
  /* The variant, and the state a player has to be able to see to play it: the
     Chess960 position number (so a coach can set the same one up again), the
     four squares that win King of the Hill, and each side's check count. None
     of this is decoration — a three-check game where you cannot see the score
     is a game you can lose without noticing it was close. */
  const vr = cmVariant(m.variant);
  const vd = m.variantData || {};
  const vChecks = m.variant === "threecheck" ? (vd.checks || { w: 0, b: 0 }) : null;
  const goals = m.variant === "kingofthehill" ? CM_HILL : null;
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
    /* Not your turn, but the game is live and you are in it: this is a
       PREMOVE. Blitz is close to unplayable without one — at three minutes
       each a round trip is a real fraction of your clock — and it is a
       convention every chess app people have used already has.

       Deliberately unvalidated against the current position: the whole point
       is that the position has not happened yet. The server rejects an
       illegal one and send() drops it quietly, which is the same outcome as
       every other implementation of this. */
    if (!canMove) {
      if (!isPlayer || m.status !== "active" || !clockIsLive) return;
      if (preFrom && preFrom !== sq) { setPremove(preFrom + sq); setPreFrom(""); return; }
      if (piece && ((m.yourColour === "w") === (piece === piece.toUpperCase()))) { setPreFrom(sq); setPremove(null); return; }
      setPreFrom(""); setPremove(null);
      return;
    }
    // Any tap on your own turn cancels a waiting premove — you have changed
    // your mind, and a premove firing after that is the worst kind of surprise.
    if (premove || preFrom) { setPremove(null); setPreFrom(""); }
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

      {/* What just happened, for anybody not looking at the board.
          A game that changes silently is a game a screen-reader user cannot
          follow — they hear nothing when the opponent moves and have to
          re-read sixty-four squares to work out what did. `polite` rather
          than `assertive`: a move is news, not an alarm, and interrupting
          somebody mid-sentence to say "knight f3" is worse than waiting. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{say}</p>

      {/* The header the design specifies: the TERMS in the middle, because on a
          board screen "what game is this" is the question, and the players are
          named on their own seats a few pixels below. */}
      <div className="mtg-head">
        <div className="mtg-head-mid">
          <div className="mtg-h">
            {vr.name !== "Standard" ? vr.name : cmTcKind(m.timeControl)} {cmTcName(m.timeControl)}
            {" · "}{m.rated ? "rated" : "casual"}
          </div>
          <div className="mtg-sub">
            {m.variant === "chess960" && vd.positionId !== undefined
              ? "position " + vd.positionId + " · " : ""}
            {m.centre ? m.centre + " club · " : ""}
            {m.status === "complete" ? statusLine
              : (m.moves || []).length ? "move " + Math.ceil((m.moves.length + 1) / 2) : "no moves yet"}
          </div>
        </div>
        <div className={"mtg-status" + (m.yourTurn && m.status === "active" ? " is-turn" : "")}>{statusLine}</div>
      </div>

      {/* The game is over and nothing is at stake — the one moment a child
          will look at their own moves properly. Offered here rather than
          buried in a menu, and only once there is a whole game to look at. */}
      {/* The one moment an announcement is welcome: the game is over, nothing
          is at stake and the member is deciding what to do next. Placed after
          the result and before the board, never over it. Shown once per
          person, ever — the server spends it on being seen. */}
      {(m.status === "complete" || m.status === "invited") && (
        <CmPromo placement="game" shape="popup"
                 onGo={(page) => { if (window.__navigate) window.__navigate(page); }}/>
      )}

      {m.status === "complete" && (m.moves || []).length >= 4 && (
        <button className="mtg-review" onClick={() => setReviewing(true)}>
          <span className="mtg-review-h">Go through the game</span>
          <span className="mtg-review-s">See where it turned, and what was better</span>
          <span className="mtg-review-go" aria-hidden="true">→</span>
        </button>
      )}

      {/* The terms, on the board rather than only in the challenge that
          created it. A player who opened this from a notification never saw
          the sheet where the clock and the variant were agreed, and "why did
          my king walking to e4 end the game" is not a question a screen should
          leave anybody holding. */}
      {m.variant && m.variant !== "standard" && <p className="mtg-vrule">{vr.rule}</p>}

      {/* A queued premove is a promise the board has made on your behalf. It
          has to be visible and it has to be cancellable, or it is a trap. */}
      {(premove || preFrom) && (
        <div className="mtg-pre" role="status">
          <span className="mtg-pre-l">Premove</span>
          <span className="mtg-pre-b">
            {premove ? premove.slice(0, 2) + " → " + premove.slice(2, 4)
                     : "from " + preFrom + " — tap where it goes"}
          </span>
          <button className="mtg-pre-x" onClick={() => { setPremove(null); setPreFrom(""); }}>
            Cancel<span className="sr-only"> premove</span>
          </button>
        </div>
      )}

      <div className="mtg-wrap">
        {wide && <MtgRail matchId={matchId} onOpen={(id) => { window.location.hash = "#match-" + id; }}/>}
        <div className="mtg-boardcol">
          {/* The bar beside the board.
           *
           * The design shows an EVALUATION bar here. This is material instead,
           * and the difference matters: an evaluation bar during a live game is
           * the engine telling a child whether they are winning, which in a
           * rated club game is assistance. Material is already on the board —
           * both players can count it — so showing it reveals nothing either of
           * them could not see. The real evaluation appears in the review,
           * after the game, where knowing it is the point.
           */}
          <div className="mtg-boardstack">
          <ChessSeat player={topSeat} colour={flip ? "w" : "b"} gone={flip ? material.gone.w : material.gone.b}
            score={flip ? -material.score : material.score} onMove={m.turnColour === (flip ? "w" : "b") && m.status === "active"}
            clock={m.clock} yours={isPlayer && m.yourColour === (flip ? "w" : "b")}
            checks={vChecks ? vChecks[flip ? "w" : "b"] : null}/>
          <div className="mtg-boardrow">
          <MtgMaterialBar score={material.score} flip={flip}/>
          <ChessBoard squares={squares} flip={flip} from={stepped ? "" : (from || preFrom)}
            targets={stepped ? [] : targets}
            lastMove={stepped
              ? (reviewAt > 0 ? { from: m.moves[reviewAt - 1].move.slice(0, 2), to: m.moves[reviewAt - 1].move.slice(2, 4) } : null)
              : m.lastMove}
            checkSquare={stepped ? "" : m.checkSquare}
            interactive={!stepped && (canMove || (isPlayer && m.status === "active" && clockIsLive))}
            premove={stepped ? null : premove} premoving={!canMove} goals={goals}
            onTap={tap}/>
          </div>
          <ChessSeat player={bottomSeat} colour={flip ? "b" : "w"} gone={flip ? material.gone.b : material.gone.w}
            score={flip ? material.score : -material.score} onMove={m.turnColour === (flip ? "b" : "w") && m.status === "active"}
            clock={m.clock} yours={isPlayer && m.yourColour === (flip ? "b" : "w")}
            checks={vChecks ? vChecks[flip ? "b" : "w"] : null}/>
          {/* The move strip. One line, the last few moves, the current one in a
              chip — which is what fits under a board on a phone. The full list
              lives in the panel; this is the glance. */}
          {(m.moves || []).length > 0 && (
            <div className="mtg-strip" aria-hidden="true">
              {(() => {
                const mv = m.moves || [];
                const cut = Math.max(0, mv.length - 5);
                const out = [];
                for (let i = cut; i < mv.length; i++) {
                  if (i % 2 === 0) out.push(<span key={"n" + i} className="mtg-strip-n">{(i / 2 + 1) + "."}</span>);
                  out.push(
                    <span key={i} className={"mtg-strip-s" + (i === mv.length - 1 ? " is-last" : "")}>
                      {mv[i].san}
                    </span>
                  );
                }
                return out;
              })()}
            </div>
          )}

          {stepped && (
            <div className="mtg-stepped" role="status">
              <span>Looking at move {Math.ceil(reviewAt / 2) || 1} of {Math.ceil((m.moves || []).length / 2)}</span>
              <button className="mtg-stepped-x" onClick={() => setReviewAt(-1)}>Back to the game</button>
            </div>
          )}
          </div>
        </div>

        <aside className="mtg-side">
          {/* Tabs, so the panel beside the board holds everything that belongs
              beside a board rather than just the notation. On a phone the same
              panel sits under it and the tabs still earn their place: the move
              list and the reactions were two stacked sections you had to
              scroll past each other to reach. */}
          <div className="mtg-tabs" role="tablist" aria-label="Beside the board">
            {[["moves", "Moves"],
              ["chat", m.spectator ? "Said" : "Say"],
              ["watch", "Watching"]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id}
                      className={"mtg-tab" + (tab === id ? " is-on" : "")}
                      onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <h3 className="mtl-h sr-only">Moves</h3>
          {/* Numbered PAIRS — "1. e4 e5" — which is how chess notation is
              written everywhere and how a child will be asked to write it at
              school. A flat list of plies is the same information in a form
              nobody reads. */}
          {tab === "moves" && <ol className="mtg-moves">
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
          </ol>}

          {tab === "chat" && (
            m.spectator
              ? <p className="mtl-hint">Only the two players can say anything here.</p>
              : <MtgSay m={m} busy={busy} onSay={(k) =>
                  NGGApi.member.match.react(matchId, k).then(load).catch(() => {})}/>
          )}

          {tab === "watch" && (
            <div className="mtg-watchers">
              <p className="mtl-hint">
                Games here are public to the club — anybody signed in can watch this one, and a
                mentor can be asked to look at it.
              </p>
              <button className="mtg-report" onClick={() => NGGApi.member.match.report(matchId).then(load).catch(() => {})}>
                Report this game to a mentor
              </button>
            </div>
          )}

          {/* The two controls that end a game, and the line that says how to
              play one with a keyboard. Outside the tabs: resigning is not a
              thing you should have to find a tab for. */}
          {/* The row the design puts at the bottom of a board screen. Flip
              lives here rather than under the board: it is a control, and
              controls belong together, not between a player and their game. */}
          <div className="mtg-acts">
            <button type="button" className="mtg-act mtg-flip" onClick={() => setManualFlip(v => !v)}>
              <span aria-hidden="true">⇅</span> Flip
            </button>
            {m.status === "active" && !m.spectator && (
              <button className="mtg-act is-danger" disabled={busy}
                onClick={() => NGGApi.member.match.resign(matchId).then(load)}>
                <span aria-hidden="true">⚑</span> Resign
              </button>
            )}
          </div>
          <p className="mtg-hint">Tap a piece, then where it goes · ← → step through the moves</p>
        </aside>
      </div>

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

function CmComposer({ channels, active, me, onPosted, enterToSend, seed }) {
  const [body, setBody] = React.useState("");
  const [media, setMedia] = React.useState(null); // {type,url,poster,bytes,duration}
  const [preview, setPreview] = React.useState(false);
  const [up, setUp] = React.useState(0);
  const [ch, setCh] = React.useState(active !== "all" ? active : "commons");
  const [busy, setBusy] = React.useState(false);

  /* §12's typing indicator, from this end.
     Written only while somebody is REALLY typing, and at most once every three
     seconds — the server keeps a row alive for eight, so one ping per three
     covers a continuous typist with two thirds of the writes a naive
     keystroke handler would make. A reader who never types never writes at
     all, which is the whole cost argument for doing this by polling on shared
     hosting rather than pretending a socket is available. */
  const lastPing = React.useRef(0);
  const typingFor = React.useRef("");
  const stopTyping = React.useCallback(() => {
    const where = typingFor.current;
    typingFor.current = ""; lastPing.current = 0;
    if (where) NGGApi.member.community.typingStop(where).catch(() => {});
  }, []);
  const pingTyping = React.useCallback((where) => {
    if (!where || where === "all") return;
    const now = Date.now();
    if (typingFor.current && typingFor.current !== where) stopTyping();
    if (now - lastPing.current < 3000) return;
    lastPing.current = now; typingFor.current = where;
    NGGApi.member.community.typingPing(where).catch(() => {});
  }, [stopTyping]);
  /* Leaving the composer — sending, blurring, unmounting, closing the tab —
     ends it at once rather than leaving the room told a lie for eight seconds. */
  React.useEffect(() => {
    const bye = () => stopTyping();
    window.addEventListener("pagehide", bye);
    return () => { window.removeEventListener("pagehide", bye); stopTyping(); };
  }, [stopTyping]);
  const [poll, setPoll] = React.useState(null); // null | [opt, opt, ...]
  const [ment, setMent] = React.useState(null); // {q, start, items}
  const [mentIdx, setMentIdx] = React.useState(0);
  const [slashIdx, setSlashIdx] = React.useState(0);
  const [emoji, setEmoji] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const [showFmt, setShowFmt] = React.useState(false); // format tools revealed on demand
  const [alt, setAlt] = React.useState("");           // what's in the picture
  const [crisis, setCrisis] = React.useState("");     // the helpline reply, held on screen
  const fileRef = React.useRef(null);
  /* Every keystroke after an @ used to fire its own request with no debounce
     and no ordering, so a slow answer for "@a" could land after — and
     overwrite — the answer for "@ada". One timer, one sequence number. */
  const mentSeq = React.useRef(0);
  const mentTimer = React.useRef(null);
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
    setPoll(null); setUp(1); setAlt("");
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
    /* Typing, not merely focused. An empty box is somebody who has changed
       their mind, and telling the room they are typing would be false. */
    if (val.trim()) pingTyping(ch); else stopTyping();
    const caret = e.target.selectionStart || val.length;
    const m = val.slice(0, caret).match(/@([a-z0-9._-]{0,20})$/i);
    if (mentTimer.current) clearTimeout(mentTimer.current);
    if (m) {
      const start = caret - m[0].length;
      const q = m[1] || "";
      const seq = ++mentSeq.current;
      mentTimer.current = setTimeout(() => {
        NGGApi.member.community.mentions(q)
          .then(r => {
            if (seq !== mentSeq.current) return;   // a newer keystroke won
            setMent({ q, start, items: r.people || [] }); setMentIdx(0);
          })
          .catch(() => {});
      }, 150);
    } else { mentSeq.current++; setMent(null); }
  };
  React.useEffect(() => () => { if (mentTimer.current) clearTimeout(mentTimer.current); }, []);
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
  const mentOpen = !!(ment && ment.items.length > 0);
  // What the combobox on the textarea reports: is a popup open, and which
  // option is current. Slash wins when both could be, which matches the render.
  const menuOpen = slashOpen || mentOpen;
  const activeOptId = slashOpen ? ("cm-slash-opt-" + Math.min(slashIdx, slashItems.length - 1))
                    : mentOpen ? ("cm-mention-opt-" + mentIdx) : undefined;
  React.useEffect(() => { setSlashIdx(0); }, [slashQ && slashQ[1]]);
  const runSlash = (cmd) => {
    setBody("");
    if (cmd === "poll") setPoll(["", ""]);
    else if (cmd === "media") openFile();
    else if (cmd === "shrug") setBody("¯\\_(ツ)_/¯ ");
    requestAnimationFrame(() => taRef.current && taRef.current.focus());
  };

  /* Opened FROM the jump sheet: run the command, or start the message it
     handed us. Runs once, after the draft restore above, so it wins — the
     member asked for this in the last half second and a stale draft did not. */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (!seed || seeded.current) return;
    seeded.current = true;
    if (seed.cmd) runSlash(seed.cmd);
    else if (seed.body) {
      setBody(b => (b && !b.startsWith(seed.body) ? seed.body + b : seed.body));
      requestAnimationFrame(() => {
        const ta = taRef.current; if (!ta) return;
        ta.focus(); try { ta.selectionStart = ta.selectionEnd = ta.value.length; } catch (_) {}
      });
    }
  }, [seed]); // eslint-disable-line

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
        : { channel: ch, body: body.trim(), altText: alt.trim(), mediaType: media ? media.type : "none", mediaUrl: media ? media.url : "", mediaPoster: media ? media.poster : "", mediaName: media && media.type === "doc" ? media.name : "", mediaFormat: media ? (media.format || "") : "", mediaPages: media ? (media.pages || 0) : 0, mediaBytes: media ? media.bytes : 0, mediaDuration: media ? media.duration : 0 };
      const r = await NGGApi.member.community.post(payload);
      setBody(""); setMedia(null); setPoll(null); setEmoji(false); setAlt("");
      stopTyping();     // the message has arrived; nobody is typing it any more
      try { localStorage.removeItem(draftKey); } catch (_) {}
      if (r.queued) toast.success("Posted — a mentor will approve it shortly.");
      else toast.success("Posted ✓");
      if (r.post) onPosted && onPosted(r.post);
    } catch (e) {
      /* A crisis reply is not an error message. It gets a dialog that stays,
         with numbers that dial — never the toast host, which auto-dismisses
         after 6.5 seconds and headlines it "Heads up". The draft is left
         exactly where it is: this is the one failure where clearing the box
         would take away the thing the child was trying to say. */
      if (e.code === "crisis") setCrisis(e.detail || "Please talk to a trusted adult right now. If you're in danger, call 112, or NGG safeguarding on +234 903 777 6318. You're not in trouble, and you're not alone.");
      else toast.error(e.detail || "Couldn't post — try again.");
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
      // Arrow keys used to do nothing here and Enter always took the first
      // item, so a highlighted second option could not actually be chosen.
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx(i => (i + 1) % slashItems.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx(i => (i - 1 + slashItems.length) % slashItems.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); runSlash((slashItems[slashIdx] || slashItems[0]).cmd); return; }
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
  /* A textarea placeholder WRAPS — it does not ellipsise — so "Message #AI
     Tools Application & Digital Problem Solving…" broke across two lines and
     had its second line clipped by the box. The label and aria-label keep the
     channel's full name; only the placeholder is trimmed. */
  const chShort = chName.length > 26 ? chName.slice(0, 25).trimEnd() : chName;
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

      {crisis && <CmCrisisDialog message={crisis} onClose={() => setCrisis("")}/>}

      {media && (
        <div className="cm-media-preview">
          {media.type === "video" ? <video src={cmOpt(media.url, 1280)} poster={media.poster} controls className="cm-media"/>
            : media.type === "doc" ? <div className="cm-doc-chip"><span className="cm-doc-ic" aria-hidden="true">📄</span><span className="cm-doc-name">{media.name}</span></div>
            : <img src={cmOpt(media.url, 900)} alt="" className="cm-media"/>}
          <button className="cm-media-x" onClick={() => { setMedia(null); setAlt(""); }} aria-label="Remove attachment">✕</button>
        </div>
      )}
      {/* Ask what's in the picture.
          The server used to derive alt text from the caption, so a screen
          reader read the caption and then read it again as the description —
          and when there was no caption it fell back to "Photo shared by Ada",
          which describes provenance, not content. Optional on purpose: left
          empty the image is marked decorative, which is at least honest. */}
      {media && media.type === "image" && (
        <div className="cm-alt-row">
          <label className="cm-alt-lab" htmlFor="cm-alt-box">Describe this photo <span>for people using a screen reader</span></label>
          <input id="cm-alt-box" className="cm-alt-input" value={alt} maxLength={160}
                 onChange={e => setAlt(e.target.value)}
                 placeholder="e.g. three students holding up a finished robot"/>
        </div>
      )}
      {up > 0 && (
        <div className="cm-progress" role="progressbar" aria-label="Uploading"
             aria-valuenow={up} aria-valuemin={0} aria-valuemax={100} aria-valuetext={up + "% uploaded"}>
          <span style={{ width: up + "%" }}/>
        </div>
      )}

      {/* Single-row dock */}
      <div className="cm-dockrow">
        <div className="cm-dock-field">
          <label className="sr-only" htmlFor="cm-input-box">Message {active !== "all" ? "#" + chName : "the community"}</label>
          {/* A real combobox. Both menus were role="listbox" holding buttons —
              an invalid child for that role — with nothing on the input saying
              a menu had opened and no aria-activedescendant, so the highlight
              arrow keys move was never announced to anyone who couldn't see
              it. Now the input owns the popup and names the active option. */}
          <textarea id="cm-input-box" ref={taRef} className="cm-input" rows={1} maxLength={2000} value={body} onChange={onBody} onKeyDown={onKey} onPaste={onPaste}
            role="combobox" aria-expanded={menuOpen} aria-autocomplete="list"
            aria-controls={menuOpen ? (slashOpen ? "cm-slash-list" : "cm-mention-list") : undefined}
            aria-activedescendant={activeOptId}
            aria-describedby="cm-input-hint"
            aria-label={"Message " + (active !== "all" ? "#" + chName : "the community")}
            onBlur={stopTyping}
            placeholder={poll ? "Ask the crew a question…" : ("Message " + (active !== "all" ? "#" + chShort : "the crew") + "…")}/>
          {slashOpen && (
            <div className="cm-mention-menu cm-slash-menu" id="cm-slash-list" role="listbox" aria-label="Commands">
              {slashItems.map((s, i) => (
                <div key={s.cmd} id={"cm-slash-opt-" + i} role="option" aria-selected={i === slashIdx}
                     className={"cm-mention-item" + (i === slashIdx ? " is-active" : "")}
                     onMouseDown={e => e.preventDefault()} onMouseEnter={() => setSlashIdx(i)} onClick={() => runSlash(s.cmd)}>
                  <span className="cm-slash-ic" aria-hidden="true">{s.icon}</span>
                  <span><b>/{s.cmd}</b> <span className="cm-slash-hint">{s.hint}</span></span>
                </div>
              ))}
            </div>
          )}
          {mentOpen && (
            <div className="cm-mention-menu" id="cm-mention-list" role="listbox" aria-label="People to mention">
              {ment.items.map((pp, i) => (
                <div key={pp.handle} id={"cm-mention-opt-" + i} role="option" aria-selected={i === mentIdx}
                     className={"cm-mention-item" + (i === mentIdx ? " is-active" : "")}
                     onMouseDown={e => e.preventDefault()} onMouseEnter={() => setMentIdx(i)} onClick={() => pickMention(pp.handle)}>
                  <span className={"cm-avatar cm-avatar-sm" + (pp.kind === "all" ? " cm-avatar-all" : "")} style={pp.kind === "all" ? {} : { background: cmColor(pp.handle), color: inkOn(cmColor(pp.handle)).ink }} aria-hidden="true">{pp.kind === "all" ? "📣" : cmInitial(pp.name || pp.handle)}</span>
                  <span><b>@{pp.handle}</b>{pp.name ? " · " + pp.name : ""}{pp.centre ? " · " + pp.centre : ""}{pp.kind === "mentor" ? <span className="cm-ment-badge">mentor</span> : null}</span>
                </div>
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
              /* Escape closes it and hands focus back. It closed on mouse-leave
                 alone, so a keyboard user could tab in and not get out. */
              <div className="cm-emoji-pop" role="menu" aria-label="Emoji"
                   onMouseLeave={() => setEmoji(false)}
                   onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setEmoji(false); if (taRef.current) taRef.current.focus(); } }}>
                {CM_EMOJI.map(em => <button key={em} type="button" role="menuitem" className="cm-emoji-e" aria-label={"Insert " + em} onMouseDown={e => e.preventDefault()} onClick={() => cmInsertAt(taRef.current, em, setBody)}>{em}</button>)}
              </div>
            )}
          </div>
          {iconBtn("Aa", "Formatting", () => setShowFmt(v => !v), showFmt ? " is-on" : "")}
          {/* The counter lives here, not in the channel picker below — that block
              only renders on the aggregate views, so inside an actual channel
              there was no counter at all and maxLength silently stopped
              accepting keystrokes at 2,000. */}
          {body.length > 1600 && (
            <span className={"cm-count" + (remaining <= 0 ? " over" : "")} aria-live="polite">
              <span className="sr-only">{remaining <= 0 ? "Character limit reached. " : ""}{remaining} characters left</span>
              <span aria-hidden="true">{remaining}</span>
            </span>
          )}
          <span className="cm-send-wrap">
            <button className="cm-send-btn" disabled={busy || up > 0 || !canPost} onClick={submit} aria-label={poll ? "Post poll" : "Send message"}>{busy ? "…" : poll ? "Ask" : "Send"}</button>
            {/* aria-describedby on the textarea points here; it was an orphan
                role="tooltip" that nothing referenced. */}
            <span className="cm-send-tip" id="cm-input-hint" role="tooltip">{enterToSend ? <><b>Enter</b> to send · <b>Shift + Enter</b> for a new line</> : <>Press <b>Send</b> to share · <b>Shift + Enter</b> for a new line</>}</span>
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
  /* Tapping a photo opens it whole. The feed shows a capped crop — see
     .cm-msg-media in the stylesheet for why — so there has to be a way back to
     the picture somebody actually posted, or the cap quietly destroys it. */
  const [zoom, setZoom] = React.useState(null);
  /* Whether the cap actually bit. A landscape photo fits inside it untouched,
     and telling somebody there is more to see when there is not is a worse
     lie than showing them a crop — so this is measured on load rather than
     assumed, and the badge only appears when something really is hidden. */
  const [cropped, setCropped] = React.useState(false);
  const measureCrop = (e) => {
    const i = e.target;
    if (!i.naturalWidth || !i.clientWidth) return;
    const full = i.naturalHeight / i.naturalWidth * i.clientWidth;
    setCropped(full > i.clientHeight + 2);
  };
  return (
    <>
      {/* The SAME viewer the Files screen opens. Tapping a photo used to give
          two different products depending on where you tapped it: from Files
          you got the caption, who posted it, its size, a counter and a swipe;
          from the feed you got a dimmed rectangle capped at 620px with none of
          that — and on a desktop, a photo smaller than the post it came from. */}
      {zoom && (
        <CmPhotoViewer photos={[zoom]} index={0} onIndex={() => {}} onClose={() => setZoom(null)}/>
      )}
      {post.moderationNote && <div className="cm-modnote">{post.moderationNote}</div>}
      {post.body && <div className={"cm-msg-text" + (post.kind === "poll" ? " cm-poll-q" : "")}><NggMarkdown text={post.body}/></div>}
      {post.kind === "poll" && post.poll && (
        <div className="cm-poll">
          {/* Not disabled once you've voted. community_poll_vote() updates an
              existing ballot on purpose — "changing your vote is allowed" — and
              disabling the buttons made that unreachable, while dropping them
              out of the tab order with nothing saying why. */}
          {post.poll.options.map((o, i) => {
            const voted = post.poll.myVote >= 0;
            const mine = post.poll.myVote === i;
            return (
              <button key={i} className={"cm-poll-row" + (voted ? " voted" : "") + (mine ? " mine" : "")}
                      aria-pressed={mine}
                      aria-label={o.text + (voted ? ", " + o.pct + "%, " + o.votes + " vote" + (o.votes === 1 ? "" : "s") + (mine ? ", your vote" : "") : "")}
                      onClick={() => onVote(i)}>
                {voted && <span className="cm-poll-bar" style={{ width: o.pct + "%" }} aria-hidden="true"/>}
                <span className="cm-poll-text">{mine ? "✓ " : ""}{o.text}</span>
                {voted && <span className="cm-poll-pct" aria-hidden="true">{o.pct}%</span>}
              </button>
            );
          })}
          <div className="cm-poll-total">{post.poll.totalVotes} vote{post.poll.totalVotes === 1 ? "" : "s"}{post.poll.myVote < 0 ? " · tap to vote" : " · tap again to change your vote"}</div>
        </div>
      )}
      {post.mediaType === "image" && post.mediaUrl && (
        /* A button, not a bare img with a click handler: it is a real control
           that opens something, so it has to be reachable by keyboard and say
           what it does. stopPropagation because the card underneath opens the
           actions sheet on a long press. */
        <div className="cm-msg-media">
          <button type="button" className="cm-msg-media-btn"
                  aria-label={(cropped ? "See the whole picture" : "Open the picture")
                              + (post.altText ? ": " + post.altText : "")}
                  onClick={(e) => { e.stopPropagation(); setZoom(cmPhotoOf(post)); }}>
            <img src={cmOpt(post.mediaUrl, 1000)} alt={post.altText || ""} loading="lazy"
                 onLoad={measureCrop}/>
            {cropped && <span className="cm-msg-media-more" aria-hidden="true">Tap to see it all</span>}
          </button>
        </div>
      )}
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
          {/* An <img>, not an interpolated url() — a background-image built by
              string concatenation puts remote text inside a CSS declaration. */}
          {post.linkPreview.image && <span className="cm-link-thumb" aria-hidden="true"><img src={post.linkPreview.image} alt="" loading="lazy"/></span>}
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
function CmThread({ post, me, channels, onClose, onPatch, onRemove, expanded, onExpand }) {
  const [comments, setComments] = React.useState(null);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [crisis, setCrisis] = React.useState("");
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
    /* On a desktop the thread is a PANE beside the channel, not a modal over
       it. A modal owns Escape; a pane owns only its own. Without this, Escape
       pressed anywhere — closing the ⓘ popover, clearing a search — also threw
       away the thread somebody was midway through reading. On a phone it IS
       the whole screen, so there Escape still closes it from anywhere. */
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const pane = paneRef.current;
      if (pane && pane.closest(".cmm-thread") && !pane.contains(document.activeElement)) return;
      onClose();
    };
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
    } catch (e) {
      // Same rule as the composer: a helpline is not a toast. The reply stays
      // in the box.
      if (e.code === "crisis") setCrisis(e.detail || "Please talk to a trusted adult right now. If you're in danger, call 112, or NGG safeguarding on +234 903 777 6318. You're not in trouble, and you're not alone.");
      else toast.error(e.detail || "Couldn't reply — try again.");
    } finally { setBusy(false); }
  };
  return (
    <aside className="cm-thread" ref={paneRef} role="dialog" aria-label={"Thread in " + post.channel.name}>
      {crisis && <CmCrisisDialog message={crisis} onClose={() => setCrisis("")}/>}
      <div className="cm-thread-head">
        {/* Stacked, and the channel truncates. As one inline pair these two ran
            together — "Thread🔬 AI Tools Application & Digital Problem
            Solving" — and in the desktop thread PANE the whole thing wrapped
            over the close button. */}
        <div className="cm-thread-head-txt">
          <span className="cm-thread-title" role="heading" aria-level={2}>Thread</span>
          <span className="cm-thread-chan" style={{ color: post.channel.color }}>{post.channel.icon} {post.channel.name}</span>
        </div>
        {/* ⤢ — handoff §11: "replying no longer costs you the channel; ⤢
            expands it to full width." Desktop only; on a phone the thread is
            already the whole screen, so the control would promise nothing. */}
        {onExpand && (
          <button className="cm-thread-wide" onClick={onExpand} aria-pressed={!!expanded}
                  aria-label={expanded ? "Narrow the thread" : "Widen the thread"}
                  title={expanded ? "Narrow the thread" : "Widen the thread"}>
            {cmUiIcon(expanded ? "shrink" : "expand", 15)}
          </button>
        )}
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
        {err && <p role="alert" style={{ color: "#c0341a", fontSize: 13, margin: "0 0 8px" }}>{err}</p>}
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

      {err && <div role="alert" className="cm-pj-empty" style={{ color: "#c0341a" }}>{err}</div>}

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

Object.assign(window, { SummerPage, ClubPage, BadgePin, CommunityPage, CmStudentSignIn, CmProgramJournal, JournalEntryPage, CmTrnList, CmTrnDetail, CmTrnCreate, CmTrnStandings, CmTrnRounds, CmPromo, CmGameReview, CmTrnLadder });
