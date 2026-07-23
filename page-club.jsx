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
// Body → nodes: preserve line breaks, linkify URLs, highlight @mentions + #tags.
function cmBody(text) {
  const out = []; const lines = String(text || "").split("\n");
  lines.forEach((line, li) => {
    const parts = line.split(/(\s+)/);
    parts.forEach((p, i) => {
      if (/^https?:\/\/\S+$/.test(p)) out.push(<a key={li + "-" + i} href={p} target="_blank" rel="noopener noreferrer" className="cm-link">{p.replace(/^https?:\/\//, "")}</a>);
      else if (/^@[\w.]+$/.test(p)) out.push(<b key={li + "-" + i} className="cm-mention">{p}</b>);
      else if (/^#[\w]+$/.test(p)) out.push(<b key={li + "-" + i} className="cm-tag">{p}</b>);
      else out.push(p);
    });
    if (li < lines.length - 1) out.push(<br key={"br" + li}/>);
  });
  return out;
}
function cmInitial(name) { return (String(name || "•").trim()[0] || "•").toUpperCase(); }
function cmColor(seed) { const p = ["#e4032b", "#f5b026", "#2f9e44", "#b07cff", "#3b5bdb", "#ff5a3c", "#17a2b8"]; let h = 0; for (const c of String(seed || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return p[h % p.length]; }

function CommunityPage({ setPage }) {
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  if (!auth.isSignedIn) return <CommunityTeaser setPage={setPage} auth={auth}/>;
  return <CommunityApp setPage={setPage} auth={auth}/>;
}

/* ---- Signed-out teaser ---- */
function CommunityTeaser({ setPage, auth }) {
  const [channels, setChannels] = React.useState([]);
  React.useEffect(() => { let a = true; NGGApi.public.communityChannels().then(r => { if (a) setChannels(r.channels || []); }).catch(() => {}); return () => { a = false; }; }, []);
  return (
    <div className="page cm-page" data-screen-label="Community">
      <section className="cm-teaser">
        <div className="cm-teaser-glow" aria-hidden="true"/>
        <div className="container cm-teaser-inner">
          <div className="mono cm-eyebrow"><span className="cm-live-dot"/>THE COMMUNITY · MEMBERS ONLY</div>
          <h1 className="display cm-teaser-h">Where the crew<br/>shows its work.</h1>
          <p className="cm-teaser-p">Share what you're building, drop a photo or a clip, cheer each other on — organised by your course channels. A safe, mentor-watched space for NGG members.</p>
          <div className="cm-teaser-actions">
            <button className="btn btn-gold btn-lg" onClick={() => auth.openSignIn && auth.openSignIn()}>Sign in to join →</button>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("join")}>Become a member</button>
          </div>
          {channels.length > 0 && (
            <div className="cm-teaser-chips">
              {channels.slice(0, 10).map(c => <span key={c.slug} className="cm-chip" style={{ "--cm": c.color }}>{c.icon} {c.name}</span>)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ---- The feed ---- */
function CommunityApp({ setPage, auth }) {
  const [channels, setChannels] = React.useState([]);
  const [active, setActive] = React.useState("all");
  const [sort, setSort] = React.useState("latest");
  const [posts, setPosts] = React.useState(null);
  const [page, setPage2] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [digest, setDigest] = React.useState(null);
  const me = (auth.member && auth.member.fullName) || "You";

  React.useEffect(() => { let a = true; NGGApi.member.community.channels().then(r => { if (a) setChannels(r.channels || []); }).catch(() => {}); return () => { a = false; }; }, []);

  const loadFeed = React.useCallback((ch, so, pg, append) => {
    NGGApi.member.community.feed(ch, so, pg).then(r => {
      setHasMore(!!r.hasMore);
      setPosts(prev => append && prev ? prev.concat(r.posts || []) : (r.posts || []));
      setLoadingMore(false);
    }).catch(() => { setPosts(p => p || []); setLoadingMore(false); });
  }, []);
  React.useEffect(() => { setPosts(null); setPage2(0); loadFeed(active, sort, 0, false); }, [active, sort, loadFeed]);
  const more = () => { if (loadingMore) return; setLoadingMore(true); const n = page + 1; setPage2(n); loadFeed(active, sort, n, true); };

  const prependPost = (post) => setPosts(p => [post].concat(p || []));
  const patchPost = (postId, patch) => setPosts(p => (p || []).map(x => x.postId === postId ? { ...x, ...patch } : x));

  const activeChannel = channels.find(c => c.slug === active);
  const catchMeUp = () => {
    setDigest({ loading: true });
    NGGApi.member.community.digest(active).then(r => setDigest({ text: r.digest, ai: r.ai, channel: activeChannel ? activeChannel.name : "the community" }))
      .catch(() => setDigest({ text: "Couldn't summarise right now.", channel: "" }));
  };

  return (
    <div className="page cm-page" data-screen-label="Community">
      <div className="cm-shell container">
        {/* Left: channels */}
        <aside className="cm-rail cm-rail-left">
          <div className="cm-rail-title mono">CHANNELS</div>
          <button className={"cm-chan" + (active === "all" ? " is-active" : "")} onClick={() => setActive("all")}><span className="cm-chan-ic" style={{ background: "#0c1432" }}>✦</span><span className="cm-chan-name">All channels</span></button>
          <button className={"cm-chan" + (active === "bookmarks" ? " is-active" : "")} onClick={() => setActive("bookmarks")}><span className="cm-chan-ic" style={{ background: "#a07400" }}>🔖</span><span className="cm-chan-name">Saved</span></button>
          <div className="cm-rail-sep"/>
          {channels.map(c => (
            <button key={c.slug} className={"cm-chan" + (active === c.slug ? " is-active" : "")} onClick={() => setActive(c.slug)}>
              <span className="cm-chan-ic" style={{ background: c.color }}>{c.icon || "#"}</span>
              <span className="cm-chan-name">{c.name}</span>
              {c.posts > 0 && <span className="cm-chan-count">{c.posts}</span>}
            </button>
          ))}
        </aside>

        {/* Center: composer + feed */}
        <main className="cm-main">
          <div className="cm-topbar">
            <div className="cm-chan-tabs">
              {["all", "bookmarks"].concat(channels.slice(0, 8).map(c => c.slug)).map(s => {
                const c = channels.find(x => x.slug === s);
                const label = s === "all" ? "All" : s === "bookmarks" ? "Saved" : (c ? c.name : s);
                return <button key={s} className={"cm-tab" + (active === s ? " is-active" : "")} onClick={() => setActive(s)}>{label}</button>;
              })}
            </div>
            <div className="cm-sort">
              {[["latest", "Latest"], ["trending", "Trending"]].map(([v, l]) => <button key={v} className={"cm-sortbtn" + (sort === v ? " is-active" : "")} onClick={() => setSort(v)}>{l}</button>)}
            </div>
          </div>

          {active !== "bookmarks" && <CmComposer channels={channels} active={active} me={me} onPosted={prependPost}/>}

          {posts === null ? (
            <div className="cm-skeletons">{[0, 1, 2].map(i => <div key={i} className="cm-post cm-skel"/>)}</div>
          ) : posts.length === 0 ? (
            <div className="cm-empty">
              <div className="cm-empty-ic">{active === "bookmarks" ? "🔖" : "💬"}</div>
              <p>{active === "bookmarks" ? "No saved posts yet — tap the bookmark on any post to keep it here." : "Nothing here yet. Be the first to post something today."}</p>
            </div>
          ) : (
            <div className="cm-feed">
              {posts.map(p => <CmPost key={p.postId} post={p} onPatch={patchPost}/>)}
              {hasMore && <button className="cm-more" disabled={loadingMore} onClick={more}>{loadingMore ? "Loading…" : "Load more"}</button>}
            </div>
          )}
        </main>

        {/* Right: about + AI catch-me-up */}
        <aside className="cm-rail cm-rail-right">
          <div className="cm-card cm-ai">
            <div className="mono cm-card-eyebrow">✨ CATCH ME UP</div>
            <p className="cm-ai-sub">A quick AI digest of {activeChannel ? activeChannel.name : "the community"}.</p>
            <button className="btn btn-primary btn-sm" onClick={catchMeUp}>Summarise for me →</button>
          </div>
          {activeChannel && activeChannel.description && (
            <div className="cm-card">
              <div className="mono cm-card-eyebrow">ABOUT</div>
              <div className="cm-about-name" style={{ color: activeChannel.color }}>{activeChannel.icon} {activeChannel.name}</div>
              <p className="cm-about-desc">{activeChannel.description}</p>
            </div>
          )}
          <div className="cm-card">
            <div className="mono cm-card-eyebrow">HOUSE RULES</div>
            <ul className="cm-rules">
              <li>Be kind — this is a shared room.</li>
              <li>No personal contact details.</li>
              <li>Every post is mentor-watched + AI-checked.</li>
              <li>Something wrong? Tell a mentor.</li>
            </ul>
          </div>
        </aside>
      </div>

      {digest && <CmDigest digest={digest} onClose={() => setDigest(null)}/>}
    </div>
  );
}

/* ---- Composer ---- */
function CmComposer({ channels, active, me, onPosted }) {
  const [body, setBody] = React.useState("");
  const [media, setMedia] = React.useState(null); // {type,url,poster}
  const [up, setUp] = React.useState(0); // 0 idle, 1-100 progress
  const [ch, setCh] = React.useState(active !== "all" ? active : "commons");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  React.useEffect(() => { if (active !== "all" && active !== "bookmarks") setCh(active); }, [active]);

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 60 * 1024 * 1024) { toast.error("That file is over 60MB — please trim it."); return; }
    setUp(1);
    try {
      const r = await NGGApi.uploadFile(f, "post", pct => setUp(Math.max(1, pct)));
      const type = (r.resourceType === "video" || /^video\//.test(f.type)) ? "video" : "image";
      setMedia({ type, url: r.url, poster: type === "video" ? cmPoster(r.url) : "" });
    } catch (_) { toast.error("Upload failed — try again."); }
    finally { setUp(0); if (fileRef.current) fileRef.current.value = ""; }
  };

  const submit = async () => {
    if (!body.trim() && !media) return;
    setBusy(true);
    try {
      const r = await NGGApi.member.community.post({ channel: ch, body: body.trim(), mediaType: media ? media.type : "none", mediaUrl: media ? media.url : "", mediaPoster: media ? media.poster : "" });
      setBody(""); setMedia(null);
      if (r.queued) toast.success("Posted — a mentor will approve it shortly.");
      else { toast.success("Posted ✓"); onPosted && onPosted(r.post); }
      if (r.queued && r.post) onPosted && onPosted(r.post);
    } catch (e) {
      toast.error(e.detail || (e.code === "crisis" ? "Please talk to a trusted adult now." : e.code === "blocked" ? "That can't be shared here." : "Couldn't post — try again."));
    } finally { setBusy(false); }
  };

  const remaining = 2000 - body.length;
  return (
    <div className="cm-composer">
      <div className="cm-composer-top">
        <span className="cm-avatar" style={{ background: cmColor(me) }}>{cmInitial(me)}</span>
        <textarea className="cm-input" rows={media ? 2 : 1} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} placeholder="Share something with the crew…"/>
      </div>
      {media && (
        <div className="cm-media-preview">
          {media.type === "video" ? <video src={cmOpt(media.url)} poster={media.poster} controls className="cm-media"/> : <img src={cmOpt(media.url, 900)} alt="" className="cm-media"/>}
          <button className="cm-media-x" onClick={() => setMedia(null)} aria-label="Remove media">✕</button>
        </div>
      )}
      {up > 0 && <div className="cm-progress"><span style={{ width: up + "%" }}/></div>}
      <div className="cm-composer-bar">
        <div className="cm-composer-left">
          <button className="cm-icon-btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={up > 0} title="Add photo or video">📷 Media</button>
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pick} style={{ display: "none" }}/>
          <select className="cm-chan-select" value={ch} onChange={e => setCh(e.target.value)}>
            {channels.filter(c => c.slug !== "bookmarks").map(c => <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>)}
          </select>
        </div>
        <div className="cm-composer-right">
          {body.length > 1600 && <span className={"cm-count" + (remaining < 0 ? " over" : "")}>{remaining}</span>}
          <button className="btn btn-primary btn-sm" disabled={busy || up > 0 || (!body.trim() && !media)} onClick={submit}>{busy ? "Posting…" : "Post"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Post card ---- */
function CmPost({ post, onPatch }) {
  const [showComments, setShowComments] = React.useState(false);
  const [picker, setPicker] = React.useState(false);
  const reactionSet = ["👏", "❤️", "🔥", "💡", "🎉", "🙌"];
  const totalReacts = Object.values(post.reactions || {}).reduce((s, n) => s + n, 0);

  const react = async (emoji) => {
    setPicker(false);
    // optimistic
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
  const share = async () => {
    const txt = post.body || (post.channel.name + " on NGG Community");
    try { if (navigator.share) await navigator.share({ title: "NGG Community", text: txt }); else { await navigator.clipboard.writeText(txt); toast.success("Copied to clipboard"); } } catch (_) {}
  };

  return (
    <article className={"cm-post" + (post.status !== "published" ? " is-pending" : "")}>
      <div className="cm-post-head">
        <span className="cm-avatar" style={{ background: cmColor(post.author.name + post.author.centre) }}>{cmInitial(post.author.name)}</span>
        <div className="cm-post-meta">
          <div className="cm-post-author">{post.author.name}{post.author.isMe && <span className="cm-you">you</span>}</div>
          <div className="cm-post-sub">
            <span className="cm-post-chan" style={{ color: post.channel.color }}>{post.channel.icon} {post.channel.name}</span>
            <span className="cm-dot">·</span><span>{cmAgo(post.createdAt)}</span>
            {post.author.centre && <><span className="cm-dot">·</span><span>{post.author.centre}</span></>}
          </div>
        </div>
        {post.pinned && <span className="cm-pin" title="Pinned">📌</span>}
      </div>

      {post.moderationNote && <div className="cm-modnote">{post.moderationNote}</div>}
      {post.body && <div className="cm-post-body">{cmBody(post.body)}</div>}
      {post.mediaType === "image" && post.mediaUrl && <div className="cm-post-media"><img src={cmOpt(post.mediaUrl, 1000)} alt={post.altText || ""} loading="lazy"/></div>}
      {post.mediaType === "video" && post.mediaUrl && <div className="cm-post-media"><video src={cmOpt(post.mediaUrl)} poster={post.mediaPoster} controls preload="metadata"/></div>}

      {totalReacts > 0 && (
        <div className="cm-react-summary">
          {Object.entries(post.reactions).filter(([, n]) => n > 0).slice(0, 4).map(([e]) => <span key={e}>{e}</span>)}
          <span className="cm-react-count">{totalReacts}</span>
        </div>
      )}

      <div className="cm-actions">
        <div className="cm-react-wrap">
          <button className={"cm-act" + (post.myReaction ? " is-on" : "")} onClick={() => setPicker(p => !p)}>{post.myReaction || "👏"} <span>React</span></button>
          {picker && <div className="cm-picker" onMouseLeave={() => setPicker(false)}>{reactionSet.map(e => <button key={e} className={"cm-picker-e" + (post.myReaction === e ? " is-on" : "")} onClick={() => react(e)}>{e}</button>)}</div>}
        </div>
        <button className="cm-act" onClick={() => setShowComments(s => !s)}>💬 <span>{post.commentCount || 0}</span></button>
        <button className={"cm-act" + (post.bookmarked ? " is-on" : "")} onClick={bookmark}>{post.bookmarked ? "🔖" : "🏷️"} <span>Save</span></button>
        <button className="cm-act" onClick={share}>↗ <span>Share</span></button>
      </div>

      {showComments && <CmComments post={post} onCount={n => onPatch(post.postId, { commentCount: n })}/>}
    </article>
  );
}

/* ---- Comment thread ---- */
function CmComments({ post, onCount }) {
  const [comments, setComments] = React.useState(null);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { let a = true; NGGApi.member.community.comments(post.postId).then(r => { if (a) setComments(r.comments || []); }).catch(() => { if (a) setComments([]); }); return () => { a = false; }; }, [post.postId]);
  const send = async () => {
    if (!body.trim()) return; setBusy(true);
    try {
      const r = await NGGApi.member.community.comment(post.postId, body.trim());
      setBody(""); setComments(c => (c || []).concat(r.comment));
      if (r.queued) toast.success("Comment in review — a mentor will approve it.");
      else onCount && onCount((post.commentCount || 0) + 1);
    } catch (e) { toast.error(e.detail || "Couldn't comment — try again."); } finally { setBusy(false); }
  };
  return (
    <div className="cm-comments">
      {comments === null ? <div className="cm-comment-load">Loading…</div> : comments.map(c => (
        <div key={c.commentId} className={"cm-comment" + (c.status !== "published" ? " is-pending" : "")}>
          <span className="cm-avatar cm-avatar-sm" style={{ background: cmColor(c.name) }}>{cmInitial(c.name)}</span>
          <div className="cm-comment-body">
            <b>{c.name}</b> <span className="cm-comment-ago">{cmAgo(c.createdAt)}</span>
            <div>{cmBody(c.body)}</div>
            {c.note && <div className="cm-comment-note">{c.note}</div>}
          </div>
        </div>
      ))}
      <div className="cm-comment-compose">
        <input className="cm-comment-input" value={body} maxLength={1000} placeholder="Write a comment…" onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}/>
        <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()} onClick={send}>{busy ? "…" : "Reply"}</button>
      </div>
    </div>
  );
}

/* ---- AI digest modal ---- */
function CmDigest({ digest, onClose }) {
  return (
    <div className="cm-modal-back" onClick={onClose}>
      <div className="cm-modal" onClick={e => e.stopPropagation()}>
        <div className="mono cm-card-eyebrow">✨ CATCH ME UP{digest.channel ? " · " + digest.channel : ""}</div>
        {digest.loading ? <p className="cm-digest-body">Summarising…</p> : <p className="cm-digest-body">{digest.text}</p>}
        {digest.ai === false && !digest.loading && <p className="cm-digest-foot">Live AI summaries turn on when the community gets busier.</p>}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

Object.assign(window, { SummerPage, ClubPage, BadgePin, CommunityPage });
