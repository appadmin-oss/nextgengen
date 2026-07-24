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
function cmColor(seed) { const p = ["#e4032b", "#f5b026", "#2f9e44", "#b07cff", "#3b5bdb", "#ff5a3c", "#17a2b8"]; let h = 0; for (const c of String(seed || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return p[h % p.length]; }

function CommunityPage({ setPage }) {
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  if (!auth.isSignedIn) return <CommunityPublic setPage={setPage} auth={auth}/>;
  return <CommunityApp setPage={setPage} auth={auth}/>;
}

/* ---- Student ID sign-in panel (ID + guardian phone, or QR scan) ---- */
function CmStudentSignIn({ compact }) {
  const [sid, setSid] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [scan, setScan] = React.useState(false);
  const doLogin = async (creds, failMsg) => {
    setBusy(true); setErr("");
    try {
      await NGGApi.auth.studentLogin({ ...creds, remember });
      window.location.href = "/community"; // reboot auth → community unlocks
    } catch (e) {
      setErr(e.code === "rate_limited" ? "Too many tries — wait a few minutes." : failMsg);
      setBusy(false);
    }
  };
  const studentLogin = () => {
    if (!sid.trim() || phone.replace(/\D/g, "").length < 7) { setErr("Enter your student ID and your parent/guardian's phone number."); return; }
    doLogin({ displayId: sid.trim(), guardianPhone: phone.trim() }, "We couldn't match that ID and phone number. Check your ID card.");
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
      <p className="cm-stu-hint">Scan your card's QR with the camera — or enter the ID on your card and your parent/guardian's phone number.</p>
      {scan ? (
        <>
          <div className="cm-scan-box">
            {typeof QRScanner === "function" ? <QRScanner onToken={onScanToken} gold="#ffce54"/> : <div style={{ padding: 24, color: "rgba(255,255,255,.7)", fontSize: 13, textAlign: "center" }}>Loading scanner…</div>}
            <div className="cm-scan-frame" aria-hidden="true"/>
          </div>
          <div className="cm-scan-hint">Hold your Genius ID up to the camera. {busy && "Signing you in…"}</div>
          <button className="cm-scan-btn" onClick={() => setScan(false)}>⌨ Type my ID instead</button>
        </>
      ) : (
        <>
          <button className="cm-scan-btn" onClick={openScan}>📷 Scan my card</button>
          <div className="cm-stu-row" style={{ marginTop: 12 }}>
            <input className="cm-stu-input" value={sid} onChange={e => setSid(e.target.value)} placeholder="Student ID (e.g. AY-26-001)" autoCapitalize="characters"/>
            <input className="cm-stu-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Guardian phone" inputMode="tel"/>
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
    { value: stats && stats.activeMembers > 0 ? stats.activeMembers.toLocaleString() : (all.length ? String(all.length) : "—"), label: "Active members", color: "#fff" },
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
          <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 15, maxWidth: 560, margin: "0 0 20px" }}>Every centre, every track, one movement. The live chat, channels and showcase are a private, members-only space — sign in to join.</p>

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
                <select value={centre} onChange={e => setCentre(e.target.value)} style={{ fontSize: 13, fontWeight: 600, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--cream-200,#d9d2c0)", background: "#fff", cursor: "pointer" }}>
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
            <span className="display" style={{ width: 84, height: 84, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 30, color: "#fff", background: colorFor(panel.first), margin: "0 auto" }}>{(panel.first[0] || "?").toUpperCase()}</span>
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
function CommunityApp({ setPage, auth }) {
  const [channels, setChannels] = React.useState([]);
  const [active, setActive] = React.useState("all");
  const [sort, setSort] = React.useState("latest");
  const [posts, setPosts] = React.useState(null);
  const [page, setPage2] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [digest, setDigest] = React.useState(null);
  const [fresh, setFresh] = React.useState(null);   // newest-first array found by polling
  const [thread, setThread] = React.useState(null); // open post (thread pane)
  const [unreadMark, setUnreadMark] = React.useState(0); // #unread frozen at channel entry
  const [sbOpen, setSbOpen] = React.useState(false);      // mobile sidebar drawer
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState(null);     // search results (null = not searching)
  const [searching, setSearching] = React.useState(false);
  const [info, setInfo] = React.useState(false);          // channel-details pane
  const [chMembers, setChMembers] = React.useState(null); // members rail (chat view)
  const me = (auth.member && auth.member.fullName) || "You";
  // A specific channel = chat layout (compact rows, members rail, oldest→newest);
  // All activity / Saved / search = a media-forward card feed (newest first).
  const isChat = active !== "all" && active !== "bookmarks" && results === null;
  const postsRef = React.useRef([]);
  const streamRef = React.useRef(null);
  const atBottomRef = React.useRef(true);
  React.useEffect(() => { postsRef.current = posts || []; }, [posts]);

  const reloadChannels = React.useCallback(() => {
    NGGApi.member.community.channels().then(r => setChannels(r.channels || [])).catch(() => {});
  }, []);
  React.useEffect(() => { reloadChannels(); }, [reloadChannels]);

  // Mark the body while the full-height community app is mounted — the global
  // floats (quick-nav hint, a11y FAB, back-to-top) reposition/hide so they
  // never overlap the workspace chrome.
  React.useEffect(() => {
    document.body.classList.add("cm-app");
    return () => document.body.classList.remove("cm-app");
  }, []);

  // The full-height app pane sits below the sticky site nav, whose height varies
  // (the brand wraps on narrow screens). Measure it so the composer docks at the
  // real viewport bottom instead of guessing.
  React.useEffect(() => {
    const sync = () => {
      const nav = document.querySelector(".topnav");
      const h = nav ? Math.round(nav.getBoundingClientRect().height) : 64;
      document.documentElement.style.setProperty("--cm-nav", h + "px");
    };
    sync();
    window.addEventListener("resize", sync);
    const t = setTimeout(sync, 300); // after fonts/logo settle
    return () => { window.removeEventListener("resize", sync); clearTimeout(t); document.documentElement.style.removeProperty("--cm-nav"); };
  }, []);

  const scrollBottom = (smooth) => {
    const el = streamRef.current; if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); });
  };

  const loadFeed = React.useCallback((ch, so, pg, append) => {
    const chat = ch !== "all" && ch !== "bookmarks";
    NGGApi.member.community.feed(ch, so, pg).then(r => {
      setHasMore(!!r.hasMore);
      setPosts(prev => append && prev ? prev.concat(r.posts || []) : (r.posts || []));
      setLoadingMore(false);
      if (!append && chat) scrollBottom(false); // chat pins to the newest; feed stays at top
    }).catch(() => { setPosts(p => p || []); setLoadingMore(false); });
  }, []);

  // Channel members rail (chat view only).
  React.useEffect(() => {
    if (active === "all" || active === "bookmarks") { setChMembers(null); return; }
    let a = true; setChMembers(null);
    NGGApi.member.community.members(active).then(r => { if (a) setChMembers(r.members || []); }).catch(() => { if (a) setChMembers([]); });
    return () => { a = false; };
  }, [active]);

  // Entering a channel: freeze its unread count (for the "New" divider), load
  // the feed, then mark it read so the sidebar badge clears.
  React.useEffect(() => {
    setPosts(null); setPage2(0); setFresh(null); setThread(null);
    const chObj = channels.find(c => c.slug === active);
    setUnreadMark(chObj ? (chObj.unread || 0) : 0);
    loadFeed(active, sort, 0, false);
    if (active !== "all" && active !== "bookmarks") {
      const t = setTimeout(() => {
        NGGApi.member.community.markRead(active).then(() => {
          setChannels(cs => cs.map(c => c.slug === active ? { ...c, unread: 0 } : c));
        }).catch(() => {});
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [active, sort, loadFeed]); // eslint-disable-line

  const more = () => {
    if (loadingMore) return; setLoadingMore(true);
    const el = streamRef.current; const prevH = el ? el.scrollHeight : 0;
    const n = page + 1; setPage2(n);
    NGGApi.member.community.feed(active, sort, n).then(r => {
      setHasMore(!!r.hasMore);
      setPosts(prev => (prev || []).concat(r.posts || []));
      setLoadingMore(false);
      // keep the reader's position when older messages prepend at the top
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH + el.scrollTop; });
    }).catch(() => setLoadingMore(false));
  };

  // Near-real-time polling. If the reader is at the bottom, splice new messages
  // straight in (Slack-style); otherwise surface an unobtrusive pill.
  React.useEffect(() => {
    if (active === "bookmarks" || results !== null) return;
    const tick = () => {
      if (document.hidden) return;
      NGGApi.member.community.feed(active, sort, 0).then(r => {
        const cur = postsRef.current; const have = new Set(cur.map(x => x.postId));
        const incoming = (r.posts || []);
        const news = incoming.filter(x => !have.has(x.postId));
        if (!news.length || !cur.length) return;
        const chat = active !== "all" && active !== "bookmarks";
        if (!chat) { setPosts(incoming); } // feed: newest slides in at the top, no scroll
        else if (atBottomRef.current) { setPosts(incoming); scrollBottom(true); }
        else setFresh(incoming);
      }).catch(() => {});
    };
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
  }, [active, sort, results]);
  const showFresh = () => { if (fresh) { setPosts(fresh); setFresh(null); scrollBottom(true); } };

  const onStreamScroll = (e) => {
    const el = e.currentTarget;
    atBottomRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 120;
    if (atBottomRef.current && fresh) { setPosts(fresh); setFresh(null); }
  };

  const onPosted = (post) => {
    if (isChat) { setPosts(p => (p || []).concat(post)); scrollBottom(true); }   // chat: newest at bottom
    else setPosts(p => [post].concat(p || []));                                   // feed: newest at top
  };
  const patchPost = (postId, patch) => {
    setPosts(p => (p || []).map(x => x.postId === postId ? { ...x, ...patch } : x));
    setThread(t => t && t.postId === postId ? { ...t, ...patch } : t);
  };
  const removePost = (postId) => { setPosts(p => (p || []).filter(x => x.postId !== postId)); setThread(t => t && t.postId === postId ? null : t); };

  const activeChannel = channels.find(c => c.slug === active);
  const catchMeUp = () => {
    setDigest({ loading: true });
    NGGApi.member.community.digest(active).then(r => setDigest({ text: r.digest, ai: r.ai, channel: activeChannel ? activeChannel.name : "the community" }))
      .catch(() => setDigest({ text: "Couldn't summarise right now.", channel: "" }));
  };

  // Search (debounced) — shows results in place of the stream.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      NGGApi.member.community.search(q, active === "bookmarks" ? "all" : active)
        .then(r => { setResults(r.posts || []); setSearching(false); })
        .catch(() => { setResults([]); setSearching(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query, active]);

  const totalUnread = channels.reduce((s, c) => s + (c.unread || 0), 0);
  const go = (slug) => { setActive(slug); setSbOpen(false); setQuery(""); setResults(null); };

  // Chronological (oldest→newest) render order with author grouping.
  const chrono = React.useMemo(() => (posts ? [...posts].reverse() : posts), [posts]);
  const dividerIdx = (!results && chrono && unreadMark > 0) ? Math.max(0, chrono.length - unreadMark) : -1;
  const headTitle = active === "all" ? "All activity" : active === "bookmarks" ? "Saved items" : (activeChannel ? activeChannel.name : active);
  const headIcon = active === "all" ? "✦" : active === "bookmarks" ? "🔖" : (activeChannel ? activeChannel.icon : "#");

  return (
    <div className="page cm-slack-page" data-screen-label="Community">
      <div className={"cm-slack" + (sbOpen ? " sb-open" : "") + (thread ? " thread-open" : "")}>
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="cm-sb">
          <div className="cm-sb-head">
            <div className="cm-sb-ws">
              <div><div className="cm-sb-ws-name">The Community</div><div className="cm-sb-ws-sub">{me}</div></div>
            </div>
            <button className="cm-sb-x" onClick={() => setSbOpen(false)} aria-label="Close">✕</button>
          </div>
          <div className="cm-sb-search">
            <span className="cm-sb-search-ic">🔍</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search messages" aria-label="Search messages"/>
            {query && <button className="cm-sb-search-x" onClick={() => setQuery("")} aria-label="Clear">✕</button>}
          </div>
          <nav className="cm-sb-nav" aria-label="Community channels">
            <button className={"cm-sb-item" + (active === "all" ? " is-active" : "")} aria-current={active === "all" ? "page" : undefined} onClick={() => go("all")}
              aria-label={"All activity" + (totalUnread > 0 ? ", " + totalUnread + " unread" : "")}>
              <span className="cm-sb-ic" aria-hidden="true">✦</span><span className="cm-sb-name">All activity</span>
              {totalUnread > 0 && <span className="cm-sb-badge" aria-hidden="true">{totalUnread}</span>}
            </button>
            <button className={"cm-sb-item" + (active === "bookmarks" ? " is-active" : "")} aria-current={active === "bookmarks" ? "page" : undefined} onClick={() => go("bookmarks")}>
              <span className="cm-sb-ic" aria-hidden="true">🔖</span><span className="cm-sb-name">Saved items</span>
            </button>
            <div className="cm-sb-section" role="heading" aria-level={2}>Channels</div>
            {channels.map(c => (
              <button key={c.slug} className={"cm-sb-item cm-sb-chan" + (active === c.slug ? " is-active" : "") + (c.unread > 0 ? " has-unread" : "")} onClick={() => go(c.slug)}
                aria-current={active === c.slug ? "page" : undefined}
                aria-label={c.name + (c.unread > 0 ? ", " + c.unread + " unread" : "")}>
                <span className="cm-sb-ic" style={{ color: c.color }} aria-hidden="true">{c.icon || "#"}</span>
                <span className="cm-sb-name">{c.name}</span>
                {c.unread > 0 && <span className="cm-sb-badge" aria-hidden="true">{c.unread}</span>}
              </button>
            ))}
          </nav>
          <div className="cm-sb-foot">
            <button className="cm-sb-foot-btn" onClick={catchMeUp}>✨ Catch me up</button>
          </div>
        </aside>
        <div className="cm-sb-scrim" onClick={() => setSbOpen(false)}/>

        {/* ── Main column ─────────────────────────────────────────── */}
        <main className="cm-col">
          <header className={"cm-hd" + (isChat ? " cm-hd-chat" : "")}>
            <button className="cm-hd-burger" onClick={() => setSbOpen(true)} aria-label="Open channels" aria-expanded={sbOpen}>☰</button>
            {isChat && activeChannel && <span className="cm-hd-badge" style={{ background: activeChannel.color }} aria-hidden="true">{activeChannel.icon}</span>}
            <div className="cm-hd-title">
              <div className="cm-hd-line">
                {!isChat && <span className="cm-hd-ic" aria-hidden="true">{headIcon}</span>}
                <span className="cm-hd-name" role="heading" aria-level={1}>{headTitle}</span>
                {isChat && chMembers && <span className="cm-hd-count">· {chMembers.length} {chMembers.length === 1 ? "member" : "members"}</span>}
              </div>
              {activeChannel && <span className="cm-hd-topic">{activeChannel.description}</span>}
            </div>
            <div className="cm-hd-actions">
              {active !== "bookmarks" && !results && (
                <div className="cm-hd-sort" role="group" aria-label="Sort messages">
                  {[["latest", isChat ? "Newest" : "New"], ["trending", "Hot"]].map(([v, l]) => <button key={v} className={"cm-hd-sortbtn" + (sort === v ? " is-active" : "")} aria-pressed={sort === v} onClick={() => setSort(v)}>{l}</button>)}
                </div>
              )}
              <button className="cm-hd-btn" onClick={catchMeUp} aria-label="AI catch-up summary" title="AI catch-up">✨</button>
              <button className={"cm-hd-btn" + (info ? " is-on" : "")} onClick={() => setInfo(v => !v)} aria-label="Channel details" aria-expanded={info} title="Details">ⓘ</button>
            </div>
          </header>

          <div className={"cm-stream" + (isChat ? " is-chat" : " is-feed")} ref={streamRef} onScroll={onStreamScroll}
            role={isChat ? "log" : "feed"} aria-label={headTitle + " messages"} aria-busy={posts === null} {...(isChat ? { "aria-live": "polite", "aria-relevant": "additions" } : {})}>
            {/* Pinned brief for a channel (its description) */}
            {isChat && activeChannel && activeChannel.description && (
              <div className="cm-brief"><span className="cm-brief-ic">📌</span><div className="cm-brief-txt"><b>{activeChannel.name}</b> — {activeChannel.description}</div></div>
            )}
            {results !== null ? (
              <div className="cm-cardfeed">
                <div className="cm-search-head">{searching ? "Searching…" : (results.length + " result" + (results.length === 1 ? "" : "s") + " for “" + query.trim() + "”")}</div>
                {results.map(p => <CmCard key={p.postId} post={p} me={me} onPatch={patchPost} onRemove={removePost} onOpenThread={setThread} showChannel/>)}
                {!searching && results.length === 0 && <div className="cm-empty"><div className="cm-empty-ic">🔍</div><p>No messages match that search.</p></div>}
              </div>
            ) : posts === null ? (
              <div className="cm-skeletons">{[0, 1, 2, 3].map(i => <div key={i} className={isChat ? "cm-msg-skel" : "cm-card-skel"}/>)}</div>
            ) : (isChat ? chrono : posts).length === 0 ? (
              <div className="cm-empty">
                <div className="cm-empty-ic">{active === "bookmarks" ? "🔖" : (headIcon || "💬")}</div>
                <h3>{active === "bookmarks" ? "Nothing saved yet" : ("Welcome to " + headTitle)}</h3>
                <p>{active === "bookmarks" ? "Hover a card and tap Save to keep it here." : isChat ? "This is the very beginning of the channel. Say hello 👋" : "Nothing here yet. Be the first to share something today."}</p>
              </div>
            ) : isChat ? (
              <div className="cm-msgs">
                {hasMore && <button className="cm-load-older" disabled={loadingMore} onClick={more}>{loadingMore ? "Loading…" : "↑ Load earlier messages"}</button>}
                {chrono.map((p, i) => (
                  <React.Fragment key={p.postId}>
                    {i === dividerIdx && <div className="cm-new-divider"><span>New</span></div>}
                    <CmMessage post={p} prev={i > 0 ? chrono[i - 1] : null} me={me} onPatch={patchPost} onRemove={removePost} onOpenThread={setThread}/>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="cm-cardfeed">
                {posts.map(p => <CmCard key={p.postId} post={p} me={me} onPatch={patchPost} onRemove={removePost} onOpenThread={setThread} showChannel/>)}
                {hasMore && <button className="cm-more" disabled={loadingMore} onClick={more}>{loadingMore ? "Loading…" : "Load more"}</button>}
              </div>
            )}
            {fresh && <button className="cm-fresh" onClick={showFresh}>↓ New messages — jump to latest</button>}
          </div>

          {active !== "bookmarks" && !results && (
            <div className="cm-dock">
              <CmComposer channels={channels} active={active} me={me} onPosted={onPosted} enterToSend={isChat}/>
            </div>
          )}
        </main>

        {/* ── Right column: thread > details > channel members ─────── */}
        {thread ? (
          <CmThread post={thread} me={me} channels={channels} onClose={() => setThread(null)} onPatch={patchPost} onRemove={removePost}/>
        ) : info ? (
          <aside className="cm-info">
            <div className="cm-info-head"><span>Details</span><button onClick={() => setInfo(false)} aria-label="Close">✕</button></div>
            {activeChannel ? (
              <>
                <div className="cm-info-name" style={{ color: activeChannel.color }}>{activeChannel.icon} {activeChannel.name}</div>
                {activeChannel.faculty && <div className="cm-info-faculty">{activeChannel.faculty}</div>}
                <p className="cm-info-desc">{activeChannel.description}</p>
                <div className="cm-info-stat">{activeChannel.posts} message{activeChannel.posts === 1 ? "" : "s"}</div>
              </>
            ) : <p className="cm-info-desc">{active === "all" ? "Everything from every channel, newest first." : "Messages you've saved for later."}</p>}
            <div className="cm-info-rules">
              <div className="cm-info-rules-h">{activeChannel && activeChannel.rules ? "Channel rules" : "House rules"}</div>
              <ul>
                {activeChannel && activeChannel.rules
                  ? activeChannel.rules.split("\n").map(r => r.trim()).filter(Boolean).map((r, i) => <li key={i}>{r}</li>)
                  : <>
                      <li>Be kind — this is a shared room.</li>
                      <li>No personal contact details.</li>
                      <li>Every message is mentor-watched + AI-checked.</li>
                      <li>Something wrong? Report it to a mentor.</li>
                    </>}
              </ul>
            </div>
          </aside>
        ) : isChat ? (
          <CmMembersRail members={chMembers}/>
        ) : null}
      </div>

      {digest && <CmDigest digest={digest} onClose={() => setDigest(null)}/>}
    </div>
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
      setMedia({ type, url: r.url, poster: type === "video" ? cmPoster(r.url) : "", bytes: f.size, duration, name: f.name || "document" });
    } catch (_) { toast.error("Upload failed — try again."); }
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
        : { channel: ch, body: body.trim(), mediaType: media ? media.type : "none", mediaUrl: media ? media.url : "", mediaPoster: media ? media.poster : "", mediaName: media && media.type === "doc" ? media.name : "", mediaBytes: media ? media.bytes : 0, mediaDuration: media ? media.duration : 0 };
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
        <span className="cm-avatar cm-dock-avatar" style={{ background: cmColor(me) }} aria-hidden="true">{cmInitial(me)}</span>
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
                  <span className={"cm-avatar cm-avatar-sm" + (pp.kind === "all" ? " cm-avatar-all" : "")} style={pp.kind === "all" ? {} : { background: cmColor(pp.handle) }} aria-hidden="true">{pp.kind === "all" ? "📣" : cmInitial(pp.name || pp.handle)}</span>
                  <span><b>@{pp.handle}</b>{pp.name ? " · " + pp.name : ""}{pp.centre ? " · " + pp.centre : ""}{pp.kind === "mentor" ? <span className="cm-ment-badge">mentor</span> : null}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="cm-dock-actions">
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true"/>
          <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,application/pdf" onChange={pickDoc} className="sr-only" tabIndex={-1} aria-hidden="true"/>
          {iconBtn("🖼️", "Add a photo or video", openFile)}
          {iconBtn("📎", "Attach a document", openDoc)}
          {iconBtn("📊", "Create a poll", () => setPoll(p => p ? null : ["", ""]), poll ? " is-on" : "")}
          <div className="cm-emoji-wrap">
            {iconBtn("😊", "Emoji", () => setEmoji(v => !v), emoji ? " is-on" : "")}
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
      {post.body && <div className={"cm-msg-text" + (post.kind === "poll" ? " cm-poll-q" : "")}>{cmBody(post.body)}</div>}
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
      {post.mediaType === "video" && post.mediaUrl && <div className="cm-msg-media"><video src={cmOpt(post.mediaUrl, 1280)} poster={post.mediaPoster} controls preload="metadata"/></div>}
      {post.mediaType === "doc" && post.mediaUrl && (
        <a className="cm-doc-card" href={post.mediaUrl} target="_blank" rel="noopener noreferrer">
          <span className="cm-doc-card-ic" aria-hidden="true">📄</span>
          <span className="cm-doc-card-body"><span className="cm-doc-card-name">{post.altText || "Document"}</span><span className="cm-doc-card-sub">{cmDocExt(post.mediaUrl)} · opens in a new tab</span></span>
          <span className="cm-doc-card-dl" aria-hidden="true">↗</span>
        </a>
      )}
      {post.linkPreview && post.linkPreview.title && (
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
// File extension label for a doc card.
function cmDocExt(url) {
  const m = /\.([a-z0-9]{1,5})(?:\?|#|$)/i.exec(String(url || ""));
  return m ? m[1].toUpperCase() : "FILE";
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
function CmMessage({ post, prev, me, onPatch, onRemove, onOpenThread, standalone }) {
  const [picker, setPicker] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const act = useCmActions(post, onPatch, onRemove);
  const grouped = !standalone && prev && prev.author && post.author && prev.author.name === post.author.name
    && prev.kind !== "poll" && post.kind !== "poll"
    && (new Date((post.createdAt || "").replace(" ", "T")) - new Date((prev.createdAt || "").replace(" ", "T"))) < 5 * 60 * 1000;
  const react = (e) => { setPicker(false); act.react(e); };

  return (
    <div className={"cm-msg" + (grouped ? " grouped" : "") + (post.status !== "published" ? " is-pending" : "")}
      role="article" aria-label={post.author.name + (post.author.isMe ? " (you)" : "") + " · " + cmAgo(post.createdAt)}>
      <div className="cm-msg-gutter">
        {grouped
          ? <span className="cm-msg-tinytime" aria-hidden="true">{cmAgo(post.createdAt)}</span>
          : <span className="cm-avatar" style={{ background: cmColor(post.author.name + post.author.centre) }} aria-hidden="true">{cmInitial(post.author.name)}</span>}
      </div>
      <div className="cm-msg-main">
        {!grouped && (
          <div className="cm-msg-head">
            <span className="cm-msg-author">{post.author.name}</span>
            {post.author.isMe && <span className="cm-you">you</span>}
            {standalone && <span className="cm-msg-in" style={{ color: post.channel.color }}>in {post.channel.icon} {post.channel.name}</span>}
            <span className="cm-msg-time">{cmAgo(post.createdAt)}</span>
            {post.author.centre && <span className="cm-msg-centre">{post.author.centre}</span>}
            {post.featured && <span className="cm-featured" title="On the public Showcase">✨</span>}
            {post.pinned && <span className="cm-pin" title="Pinned">📌</span>}
          </div>
        )}
        <CmBodyBlock post={post} onVote={act.vote}/>
        <div className="cm-msg-chiprow"><CmStar post={post} onStar={act.star}/><CmReactChips post={post} onReact={react}/></div>
        {post.commentCount > 0 && (
          <button className="cm-thread-link" onClick={() => onOpenThread && onOpenThread(post)}>
            💬 {post.commentCount} repl{post.commentCount === 1 ? "y" : "ies"}
            {post.lastCommentAt && <span className="cm-thread-ago">Last reply {cmAgo(post.lastCommentAt)}</span>}
          </button>
        )}
      </div>

      {/* Hover toolbar */}
      <div className="cm-msg-tools" role="group" aria-label="Message actions">
        <div className="cm-tool-wrap">
          <button className="cm-tool" onClick={() => setPicker(p => !p)} aria-label="Add a reaction" aria-expanded={picker} title="React">😊</button>
          {picker && <div className="cm-picker" role="menu" aria-label="Pick a reaction" onMouseLeave={() => setPicker(false)}>{CM_REACTIONS.map(e => <button key={e} className={"cm-picker-e" + (post.myReaction === e ? " is-on" : "")} aria-label={"React " + e} onClick={() => react(e)}>{e}</button>)}</div>}
        </div>
        <button className="cm-tool" onClick={() => onOpenThread && onOpenThread(post)} aria-label={"Reply in thread" + (post.commentCount ? " (" + post.commentCount + " replies)" : "")} title="Reply in thread">💬</button>
        {post.canStar && <button className={"cm-tool" + (post.starred ? " is-star" : "")} onClick={act.star} aria-pressed={post.starred} aria-label={post.starred ? "Remove Genius Star" : "Give a Genius Star"} title={post.starred ? "Remove Genius Star" : "Give a Genius Star"}>⭐</button>}
        <button className={"cm-tool" + (post.bookmarked ? " is-on" : "")} onClick={act.bookmark} aria-pressed={post.bookmarked} aria-label={post.bookmarked ? "Remove from saved" : "Save message"} title={post.bookmarked ? "Saved" : "Save"}>{post.bookmarked ? "🔖" : "🏷️"}</button>
        <button className="cm-tool" onClick={act.share} aria-label="Share message" title="Share">↗</button>
        <div className="cm-tool-wrap">
          <button className="cm-tool" onClick={() => setMenu(m => !m)} aria-label="More actions" aria-expanded={menu} title="More">⋯</button>
          {menu && (
            <div className="cm-menu" onMouseLeave={() => setMenu(false)}>
              <button className="cm-menu-item" onClick={() => { setMenu(false); onOpenThread && onOpenThread(post); }}>💬 Reply in thread</button>
              <button className="cm-menu-item" onClick={() => { setMenu(false); act.bookmark(); }}>{post.bookmarked ? "Remove from saved" : "🔖 Save message"}</button>
              {post.author.isMe
                ? <button className="cm-menu-item cm-menu-danger" onClick={() => { setMenu(false); act.del(); }}>Delete message</button>
                : <button className="cm-menu-item" onClick={() => { setMenu(false); act.report(); }}>🚩 Report to a mentor</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Card post (All activity / Saved / search — media-forward feed) ---- */
function CmCard({ post, me, onPatch, onRemove, onOpenThread, showChannel }) {
  const [picker, setPicker] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const act = useCmActions(post, onPatch, onRemove);
  const react = (e) => { setPicker(false); act.react(e); };
  const replies = post.commentCount || 0;
  return (
    <article className={"cm-card" + (post.status !== "published" ? " is-pending" : "")} aria-label={post.author.name + (post.author.isMe ? " (you)" : "") + " in " + post.channel.name + " · " + cmAgo(post.createdAt)}>
      <div className="cm-card-head">
        <span className="cm-avatar" style={{ background: cmColor(post.author.name + post.author.centre) }} aria-hidden="true">{cmInitial(post.author.name)}</span>
        <div className="cm-card-meta">
          <span className="cm-card-author">{post.author.name}{post.author.isMe && <span className="cm-you">you</span>}</span>
          <span className="cm-card-sub">{cmAgo(post.createdAt)}{post.author.centre ? " · " + post.author.centre : ""}</span>
        </div>
        {showChannel && <span className="cm-card-chan" style={{ color: post.channel.color }}>{post.channel.icon} {post.channel.name}</span>}
        {post.featured && <span className="cm-featured" title="On the public Showcase" aria-label="Featured on the public Showcase">✨</span>}
      </div>
      <CmBodyBlock post={post} onVote={act.vote}/>
      <div className="cm-card-bar">
        <div className="cm-card-reacts">
          <CmStar post={post} onStar={act.star}/>
          <CmReactChips post={post} onReact={react}/>
          <div className="cm-tool-wrap">
            <button className={"cm-react-add" + (post.myReaction ? " is-on" : "")} onClick={() => setPicker(p => !p)} aria-label="Add a reaction" aria-expanded={picker}>{post.myReaction || "😊"} <span>React</span></button>
            {picker && <div className="cm-picker" role="menu" aria-label="Pick a reaction" onMouseLeave={() => setPicker(false)}>{CM_REACTIONS.map(e => <button key={e} className={"cm-picker-e" + (post.myReaction === e ? " is-on" : "")} aria-label={"React " + e} onClick={() => react(e)}>{e}</button>)}</div>}
          </div>
        </div>
        <button className="cm-card-reply" onClick={() => onOpenThread && onOpenThread(post)} aria-label={replies ? "Open thread, " + replies + (replies === 1 ? " reply" : " replies") : "Reply in a thread"}>💬 {replies ? (replies + (replies === 1 ? " reply" : " replies")) : "Reply"}</button>
        <button className={"cm-pill-ic" + (post.bookmarked ? " is-on" : "")} onClick={act.bookmark} aria-pressed={post.bookmarked} aria-label={post.bookmarked ? "Remove from saved" : "Save post"} title={post.bookmarked ? "Saved" : "Save"}>{post.bookmarked ? "🔖" : "🏷️"}</button>
        <button className="cm-pill-ic" onClick={act.share} aria-label="Share post" title="Share">↗</button>
        <div className="cm-tool-wrap">
          <button className="cm-pill-ic" onClick={() => setMenu(m => !m)} aria-label="More actions" aria-expanded={menu} title="More">⋯</button>
          {menu && (
            <div className="cm-menu" onMouseLeave={() => setMenu(false)}>
              {post.author.isMe
                ? <button className="cm-menu-item cm-menu-danger" onClick={() => { setMenu(false); act.del(); }}>Delete post</button>
                : <button className="cm-menu-item" onClick={() => { setMenu(false); act.report(); }}>🚩 Report to a mentor</button>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---- Channel members rail (chat view) ---- */
function CmMembersRail({ members }) {
  if (members === null) return <aside className="cm-rail2"><div className="cm-rail2-load">Loading…</div></aside>;
  const staff = members.filter(m => m.staff);
  const rest = members.filter(m => !m.staff);
  const row = (m, i) => (
    <div key={i} className="cm-rail2-row">
      <span className="cm-avatar cm-avatar-sm" style={{ background: cmColor(m.name) }}>{cmInitial(m.name)}</span>
      <div className="cm-rail2-info"><div className="cm-rail2-name">{m.name}</div><div className="cm-rail2-sub">{m.centre || "—"}{m.posts ? " · " + m.posts + " post" + (m.posts === 1 ? "" : "s") : ""}</div></div>
    </div>
  );
  return (
    <aside className="cm-rail2">
      {members.length === 0 ? (
        <div className="cm-rail2-empty">No one has posted here yet — be the first.</div>
      ) : (
        <>
          {staff.length > 0 && <><div className="cm-rail2-h">Mentors · {staff.length}</div>{staff.map(row)}</>}
          <div className="cm-rail2-h">In this channel · {rest.length}</div>
          {rest.map(row)}
        </>
      )}
    </aside>
  );
}

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
          <div className="cm-msg-gutter"><span className="cm-avatar" style={{ background: cmColor(post.author.name + post.author.centre) }}>{cmInitial(post.author.name)}</span></div>
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
              <span className="cm-avatar cm-avatar-sm" style={{ background: cmColor(c.name) }}>{cmInitial(c.name)}</span>
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
