/* ================================================================
   NGG — Anchor 12 dashboard + Member Profile
   ================================================================ */

/* =================== ANCHOR 12 =================== */
function AnchorPage({ setPage }) {
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  const [live, setLive] = useState(null);

  // Pull the member's live week + session if signed in.
  useEffect(() => {
    if (!auth.isSignedIn) return;
    NGGApi.member.dashboard()
      .then(d => setLive({ week: (d.session && d.session.weekOf) || 1, session: d.session, name: d.member.fullName, totalWeeks: (d.session && d.session.totalWeeks) || 12, xp: d.stats.xp, completed: d.stats.completedThisSession }))
      .catch(() => {});
  }, [auth.isSignedIn]);

  const currentWeek = live ? Math.min(12, live.week) : 7;
  const [activeWeek, setActiveWeek] = useState(currentWeek);
  React.useEffect(() => { setActiveWeek(currentWeek); }, [currentWeek]);
  const w = WEEKS[Math.max(0, Math.min(11, activeWeek - 1))];

  return (
    <div className="page" data-screen-label="04 Anchor 12">
      <AnchorMemberBanner auth={auth} live={live} setPage={setPage}/>
      {/* Header */}
      <section style={{background:"var(--navy-900)", color:"white", padding:"56px 0 32px", position:"relative", overflow:"hidden"}}>
        <div style={{position:"absolute", inset:0, backgroundImage:"radial-gradient(60% 50% at 70% 30%, rgba(208,255,58,0.14), transparent 70%)"}}/>
        <div className="container" style={{position:"relative"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"end", gap:32, flexWrap:"wrap"}}>
            <div>
              <span className="chip chip-on-dark"><span className="deco-star"/> THE FLAGSHIP EXPERIENCE</span>
              <h1 className="display" style={{fontSize:"clamp(72px, 11vw, 184px)", margin:"14px 0 0", color:"white", lineHeight:0.86}}>
                Anchor<span style={{color:"var(--lime)"}}>.12</span>
              </h1>
              <p style={{fontSize:19, lineHeight:1.5, color:"rgba(255,255,255,0.78)", maxWidth:600, marginTop:18}}>
                12 weeks to build identity, discipline and influence. The dashboard below is what every NGGC member sees on Monday morning — your week, your missions, your mentor, your streak.
              </p>
            </div>
            <div style={{display:"flex", gap:14, alignItems:"center"}}>
              <div style={{textAlign:"right"}}>
                <div className="mono" style={{fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"rgba(255,255,255,0.5)"}}>YOUR PROGRESS</div>
                <div className="display" style={{fontSize:56, color:"var(--lime)", lineHeight:1}}>
                  {Math.floor((currentWeek-1)/12*100)}<span style={{color:"rgba(255,255,255,0.4)", fontSize:32}}>%</span>
                </div>
              </div>
              <Avatar seed={2} name="Tunde" size={72} ring/>
            </div>
          </div>
        </div>
      </section>

      {/* Week strip */}
      <section style={{background:"var(--paper)", padding:"32px 0", borderBottom:"1px solid rgba(12,20,50,0.07)", position:"sticky", top:71, zIndex:10, backdropFilter:"blur(12px)"}}>
        <div className="container">
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18}}>
            <div style={{display:"flex", alignItems:"center", gap:14}}>
              <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:22}}>The 12-week map</div>
              <span className="chip chip-gold">Week {currentWeek} of 12</span>
            </div>
            <div style={{display:"flex", alignItems:"center", gap:14, fontSize:12, color:"var(--ink-500)"}}>
              <span><span className="pip" style={{background:"var(--navy-900)"}}/> Done</span>
              <span><span className="pip" style={{background:"var(--lime)"}}/> Current</span>
              <span><span className="pip" style={{background:"var(--cream-200)"}}/> Locked</span>
            </div>
          </div>
          <div className="scroll-x">
            {WEEKS.map(week => {
              const cls = week.n < currentWeek ? "done" : week.n === currentWeek ? "current" : "locked";
              const isActive = week.n === activeWeek;
              return (
                <button key={week.n} className={"week-pill " + cls} onClick={() => setActiveWeek(week.n)} style={{flexShrink:0, outline: isActive ? "2px solid var(--navy-900)" : "none", outlineOffset:2}}>
                  <div className="mono" style={{fontSize:10, letterSpacing:"0.15em", opacity:0.7}}>WK {String(week.n).padStart(2,"0")}</div>
                  <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:16, marginTop:6, letterSpacing:"-0.01em", lineHeight:1.05}}>{week.theme}</div>
                  <div style={{fontSize:11, marginTop:8, opacity:0.7}}>{week.missions} missions</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Active week dashboard */}
      <section className="section">
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:32}}>
            {/* Left main */}
            <div style={{display:"flex", flexDirection:"column", gap:24}}>
              {/* Theme card */}
              <div style={{background:"var(--lime)", color:"var(--navy-900)", padding:"36px 40px", borderRadius:22, position:"relative", overflow:"hidden"}}>
                <div style={{position:"absolute", bottom:-50, right:-30, fontFamily:"var(--font-display)", fontSize:280, fontWeight:800, color:"rgba(12,20,50,0.06)", lineHeight:1, letterSpacing:"-0.06em"}}>
                  {String(w.n).padStart(2,"0")}
                </div>
                <div className="mono" style={{fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase"}}>WEEK {String(w.n).padStart(2,"0")} · THEME</div>
                <h2 className="display" style={{fontSize:80, margin:"10px 0 14px", lineHeight:0.9}}>{w.theme}.</h2>
                <p style={{fontSize:18, lineHeight:1.4, maxWidth:540, margin:0, fontStyle:"italic"}}>
                  "{w.verb}"
                </p>
                <div style={{display:"flex", gap:24, marginTop:28}}>
                  <Stat label="MISSIONS" value={`${w.missions}`}/>
                  <Stat label="XP UP FOR GRABS" value="510"/>
                  <Stat label="DUE BY" value="SUN"/>
                </div>
              </div>

              {/* Missions list */}
              <div className="card" style={{padding:28}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
                  <div>
                    <div className="eyebrow" style={{color:"var(--gold-500)"}}>THIS WEEK · MISSIONS</div>
                    <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:22, marginTop:4}}>{MISSIONS_THIS_WEEK.length} missions · {MISSIONS_THIS_WEEK.filter(m => m.done).length} done</div>
                  </div>
                  <span className="chip chip-gold">+510 XP available</span>
                </div>
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  {MISSIONS_THIS_WEEK.map(m => <MissionRow key={m.id} m={m}/>)}
                </div>
              </div>

              {/* Habits / streaks */}
              <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:18}}>
                <div className="card" style={{padding:24}}>
                  <div className="eyebrow" style={{color:"var(--ink-500)"}}>DAILY HABITS · STREAK</div>
                  <div style={{display:"flex", alignItems:"end", gap:12, marginTop:14}}>
                    <div className="display" style={{fontSize:88, lineHeight:1, color:"var(--coral)"}}>21</div>
                    <div style={{paddingBottom:14}}>
                      <div style={{fontWeight:600}}>days in a row</div>
                      <div className="mono" style={{fontSize:11, color:"var(--ink-500)", marginTop:4}}>Read · Reflect · Move · Mentor-check</div>
                    </div>
                  </div>
                  <HabitGrid />
                </div>
                <div className="card" style={{padding:24, background:"var(--navy-900)", color:"white"}}>
                  <div className="eyebrow" style={{color:"var(--gold-400)"}}>MENTOR CHECK-IN</div>
                  <div style={{display:"flex", alignItems:"center", gap:12, marginTop:14}}>
                    <Avatar seed={11} name="Dr. Ade" size={48}/>
                    <div>
                      <div style={{fontWeight:700}}>Dr. Ade</div>
                      <div className="mono" style={{fontSize:10, color:"rgba(255,255,255,0.55)", marginTop:2}}>YOUR ANCHOR MENTOR · 4 YRS</div>
                    </div>
                  </div>
                  <p style={{fontSize:14, lineHeight:1.5, marginTop:14, color:"rgba(255,255,255,0.85)"}}>
                    "Tunde — your Week 6 reflection was sharp. This week I want you to lead, not just contribute. Pick one moment to step in front. We'll talk Friday."
                  </p>
                  <button className="btn btn-gold btn-sm mt-16">Reply →</button>
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div style={{display:"flex", flexDirection:"column", gap:18}}>
              <div className="card" style={{padding:22, background:"var(--gold-500)", color:"var(--navy-900)"}}>
                <div className="eyebrow">WEEKLY XP</div>
                <div className="display" style={{fontSize:72, lineHeight:1, marginTop:6}}>+340</div>
                <div className="mono" style={{fontSize:11, marginTop:6}}>OF 510 POSSIBLE</div>
                <Sparkline data={[120, 80, 240, 180, 340, 410, 340]} color="var(--navy-900)" w={240} h={48}/>
              </div>

              <div className="card" style={{padding:22}}>
                <div className="eyebrow" style={{color:"var(--ink-500)"}}>CHALLENGE OF THE WEEK</div>
                <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:20, marginTop:8, lineHeight:1.1}}>
                  Lead a session you would normally just attend.
                </div>
                <p style={{fontSize:13, color:"var(--ink-500)", lineHeight:1.5, marginTop:10}}>
                  Stand up. Run the warm-up. Frame the question. Get out of the way. Upload a 60-second reflection by Sunday.
                </p>
                <button className="btn btn-primary btn-sm mt-16">Submit challenge →</button>
              </div>

              <div className="card" style={{padding:22}}>
                <div className="eyebrow" style={{color:"var(--ink-500)"}}>WEEK 07 · UNLOCKS</div>
                <div style={{display:"flex", gap:10, marginTop:14, alignItems:"center"}}>
                  <div className="badge-pin unlocked" style={{width:48, height:48, fontSize:14}}>★</div>
                  <div>
                    <div style={{fontWeight:700, fontSize:14}}>Team Builder badge</div>
                    <div style={{fontSize:11, color:"var(--ink-500)"}}>Complete 4 of 4 missions</div>
                  </div>
                </div>
                <div style={{display:"flex", gap:10, marginTop:12, alignItems:"center"}}>
                  <div className="badge-pin lime" style={{width:48, height:48, fontSize:14}}>+</div>
                  <div>
                    <div style={{fontWeight:700, fontSize:14}}>Level-up to LVL 09</div>
                    <div style={{fontSize:11, color:"var(--ink-500)"}}>Reach 3,200 XP</div>
                  </div>
                </div>
              </div>

              <div className="card" style={{padding:22}}>
                <div className="eyebrow" style={{color:"var(--ink-500)"}}>COHORT FEED</div>
                <div style={{display:"flex", flexDirection:"column", gap:10, marginTop:12}}>
                  {[
                    { who: "Adaeze", what: "completed 'Field interview'", time: "12m" },
                    { who: "Zara",   what: "started a new mission",         time: "1h" },
                    { who: "Kwame",  what: "earned 'Discipline' badge",     time: "3h" },
                    { who: "Ife",    what: "uploaded a showcase piece",     time: "5h" },
                  ].map((x, i) => (
                    <div key={i} style={{display:"flex", alignItems:"center", gap:10, fontSize:13}}>
                      <Avatar seed={i*2+5} name={x.who} size={28}/>
                      <div style={{flex:1, lineHeight:1.3}}>
                        <b>{x.who}</b> <span style={{color:"var(--ink-500)"}}>{x.what}</span>
                      </div>
                      <span className="mono" style={{fontSize:10, color:"var(--ink-400)"}}>{x.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="mono" style={{fontSize:10, letterSpacing:"0.15em", opacity:0.6}}>{label}</div>
      <div style={{fontFamily:"var(--font-display)", fontWeight:800, fontSize:32, lineHeight:1, marginTop:4}}>{value}</div>
    </div>
  );
}

function MissionRow({ m }) {
  const [done, setDone] = useState(m.done);
  const typeColor = { Reflect: "chip-plum", Field: "chip-lime", Lead: "chip-coral", Make: "chip-gold" }[m.type] || "";
  return (
    <div style={{display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12, background: done ? "rgba(208,255,58,0.12)" : "var(--cream-50)", border: done ? "1px solid rgba(208,255,58,0.5)" : "1px solid rgba(12,20,50,0.06)"}}>
      <button onClick={() => setDone(!done)} style={{
        width:28, height:28, flexShrink:0,
        borderRadius:"50%",
        border: done ? "none" : "2px solid var(--ink-400)",
        background: done ? "var(--navy-900)" : "white",
        color:"white", cursor:"pointer", fontWeight:700, fontSize:14,
        display:"grid", placeItems:"center",
      }}>{done ? "✓" : ""}</button>
      <div style={{flex:1}}>
        <div style={{fontSize:15, fontWeight: done ? 500 : 600, textDecoration: done ? "line-through" : "none", color: done ? "var(--ink-500)" : "var(--ink-900)"}}>{m.name}</div>
        <div style={{display:"flex", alignItems:"center", gap:8, marginTop:4}}>
          <span className={"chip " + typeColor} style={{fontSize:10, padding:"2px 8px"}}>{m.type}</span>
          <span className="mono" style={{fontSize:11, color:"var(--ink-500)"}}>Due {m.due}</span>
        </div>
      </div>
      <div className="mono" style={{fontWeight:700, fontSize:14, color: done ? "var(--ink-400)" : "var(--coral)"}}>+{m.xp} XP</div>
    </div>
  );
}

function HabitGrid() {
  // 7x4 grid (4 weeks), most filled
  const days = Array.from({length: 28}, (_, i) => i);
  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(14, 1fr)", gap:4, marginTop:16}}>
      {Array.from({length: 56}, (_, i) => {
        const filled = i > 14 && (i % 7 !== 0 || Math.random() > 0.3);
        const intensity = filled ? (i > 35 ? 1 : 0.55) : 0;
        return (
          <div key={i} style={{
            aspectRatio:"1/1",
            borderRadius:3,
            background: intensity > 0.7 ? "var(--coral)" : intensity > 0 ? "rgba(255,90,60,0.4)" : "rgba(12,20,50,0.06)"
          }}/>
        );
      })}
    </div>
  );
}

/* =================== MEMBER PROFILE =================== */
function ProfilePage({ setPage }) {
  const m = MEMBERS.find(x => x.id === 2); // Tunde
  return (
    <div className="page" data-screen-label="05 Member Profile">
      {/* Profile header */}
      <section style={{background:"var(--navy-900)", color:"white", padding:"56px 0 88px", position:"relative", overflow:"hidden"}}>
        <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(135deg, rgba(245,176,38,0.18), transparent 50%), radial-gradient(circle at 20% 80%, rgba(208,255,58,0.12), transparent 60%)"}}/>
        <div className="container" style={{position:"relative"}}>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:24, fontSize:13, color:"rgba(255,255,255,0.6)"}}>
            <button onClick={() => setPage("club")} style={{background:"none", border:"none", color:"inherit", cursor:"pointer", fontSize:13}}>← NGGC Members</button>
            <span>/</span>
            <span style={{color:"white"}}>{m.first}</span>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"auto 1fr auto", gap:32, alignItems:"center"}}>
            <Avatar seed={m.id} name={m.first} size={140} ring/>
            <div>
              <div className="mono" style={{fontSize:11, letterSpacing:"0.2em", textTransform:"uppercase", color:"var(--gold-400)"}}>
                @{m.first.toLowerCase()}.ngg · NGGC MEMBER · {m.community.toUpperCase()}
              </div>
              <h1 className="display" style={{fontSize:"clamp(56px, 7vw, 104px)", margin:"10px 0 6px", color:"white", lineHeight:0.9}}>
                {m.first}.
              </h1>
              <div style={{fontSize:22, color:"var(--gold-500)", fontWeight:600}}>{m.title}</div>
              <p style={{fontSize:16, color:"rgba(255,255,255,0.7)", marginTop:14, maxWidth:540, fontStyle:"italic"}}>
                "{m.quote}"
              </p>
              <div style={{display:"flex", gap:6, marginTop:14, flexWrap:"wrap"}}>
                <span className="chip chip-on-dark">Tech</span>
                <span className="chip chip-on-dark">Robotics</span>
                <span className="chip chip-on-dark">Open-source</span>
                <span className="chip chip-on-dark">Mentor circle: Dr. Ade</span>
              </div>
            </div>
            <div style={{display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", padding:"24px 32px", borderLeft:"1px solid rgba(255,255,255,0.12)"}}>
              <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase", color:"rgba(255,255,255,0.5)"}}>GENIUS LEVEL</div>
              <div className="display" style={{fontSize:108, color:"var(--lime)", lineHeight:1, margin:"6px 0"}}>{String(m.level).padStart(2,"0")}</div>
              <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.6)"}}>{m.xp.toLocaleString()} XP</div>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="section-tight">
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginTop:-50, marginBottom:32}}>
            {[
              { label: "WEEK", value: `${m.week}/12`, hint: "Anchor 12" },
              { label: "BADGES", value: m.badges, hint: "Earned" },
              { label: "STREAK", value: `${m.streak}d`, hint: "Daily habits" },
              { label: "PROJECTS", value: "07", hint: "Public output" },
            ].map(s => (
              <div key={s.label} className="card" style={{padding:22}}>
                <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", color:"var(--ink-500)"}}>{s.label}</div>
                <div className="display" style={{fontSize:48, lineHeight:1, marginTop:6}}>{s.value}</div>
                <div style={{fontSize:11, color:"var(--ink-500)", marginTop:6}}>{s.hint}</div>
              </div>
            ))}
          </div>

          <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:24}}>
            {/* Track progress */}
            <div style={{display:"flex", flexDirection:"column", gap:18}}>
              <div className="card" style={{padding:28}}>
                <div className="eyebrow" style={{color:"var(--ink-500)"}}>TRACK PROGRESS · TECH</div>
                <h3 style={{fontFamily:"var(--font-display)", fontSize:32, margin:"6px 0 22px", letterSpacing:"-0.02em"}}>The road to vanguard.</h3>
                <div style={{display:"flex", flexDirection:"column", gap:14}}>
                  {[
                    { t: "Anchor 12", v: 83 },
                    { t: "Public projects", v: 70 },
                    { t: "Mentor sessions", v: 92 },
                    { t: "Cohort missions", v: 65 },
                    { t: "Community impact", v: 48 },
                  ].map(r => <Progress key={r.t} value={r.v} label={r.t} variant="lime"/>)}
                </div>
              </div>

              {/* Projects */}
              <div className="card" style={{padding:28}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
                  <div>
                    <div className="eyebrow" style={{color:"var(--ink-500)"}}>PUBLIC PROJECTS · 07</div>
                    <h3 style={{fontFamily:"var(--font-display)", fontSize:24, margin:"4px 0 0"}}>What I've put into the world.</h3>
                  </div>
                  <button className="btn btn-ghost btn-sm">View all →</button>
                </div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14}}>
                  {[
                    { t: "Lagos Bus Tracker", k: "Code · Civic",     img: "techLab" },
                    { t: "OCR for elders",    k: "Code · A11y",      img: "workshop" },
                    { t: "Genius FM ep. 4",   k: "Podcast · Co-host",img: "podcast" },
                  ].map((p, i) => (
                    <div key={i} style={{display:"flex", flexDirection:"column", gap:8}}>
                      <Photo name={p.img}/>
                      <div style={{fontWeight:600, fontSize:14}}>{p.t}</div>
                      <div className="mono" style={{fontSize:10, color:"var(--ink-500)", letterSpacing:"0.1em"}}>{p.k}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mentor notes */}
              <div className="card-dark" style={{padding:28}}>
                <div className="eyebrow" style={{color:"var(--gold-400)"}}>MENTOR NOTES</div>
                <div style={{display:"flex", flexDirection:"column", gap:18, marginTop:18}}>
                  {[
                    { who: "Dr. Ade", when: "Wk 06", note: "Reflection was sharp. Asked the right uncomfortable question of himself. Watching." },
                    { who: "Aunty Funke", when: "Wk 04", note: "Showed up early. Stayed late. Helped Sefa debug instead of leaving. Quietly the leader of the room." },
                  ].map((n, i) => (
                    <div key={i} style={{paddingLeft:14, borderLeft:"2px solid var(--gold-500)"}}>
                      <div style={{display:"flex", alignItems:"baseline", gap:10}}>
                        <span style={{fontWeight:700}}>{n.who}</span>
                        <span className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.5)"}}>{n.when}</span>
                      </div>
                      <p style={{fontSize:14, color:"rgba(255,255,255,0.78)", margin:"6px 0 0", lineHeight:1.5}}>{n.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div style={{display:"flex", flexDirection:"column", gap:18}}>
              <div className="card" style={{padding:24}}>
                <div className="eyebrow" style={{color:"var(--ink-500)"}}>BADGES · {m.badges}</div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, marginTop:16, justifyItems:"center"}}>
                  {BADGES.map(b => <BadgePin key={b.id} badge={b}/>)}
                </div>
              </div>

              <div className="card" style={{padding:24, background:"var(--gold-500)", color:"var(--navy-900)"}}>
                <div className="eyebrow">GRADUATION PATHWAY</div>
                <div style={{fontFamily:"var(--font-display)", fontSize:22, fontWeight:700, marginTop:8, lineHeight:1.1}}>
                  Two weeks from Vanguard invite.
                </div>
                <div className="progress mt-16" style={{background:"rgba(12,20,50,0.18)"}}><i style={{width:"83%", background:"var(--navy-900)"}}/></div>
                <div className="mono" style={{fontSize:11, marginTop:8}}>WK 10/12 · 1 PROJECT + 1 SHOWCASE LEFT</div>
              </div>

              <div className="card" style={{padding:24}}>
                <div className="eyebrow" style={{color:"var(--ink-500)"}}>FAVOURITE QUOTE</div>
                <p style={{fontFamily:"var(--font-display)", fontSize:24, fontWeight:600, margin:"12px 0", lineHeight:1.2, letterSpacing:"-0.01em"}}>
                  "If I can break it, I can build it."
                </p>
                <div style={{fontSize:12, color:"var(--ink-500)"}}>— {m.first}, on his own bio page</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Member-aware banner: shows live progress for signed-in members,
// invites sign-in for everyone else.
// ----------------------------------------------------------------------------
function AnchorMemberBanner({ auth, live, setPage }) {
  if (auth.loading) return null;
  if (!auth.isSignedIn) {
    return (
      <div className="anchor-banner anchor-banner-cta">
        <div className="container anchor-banner-row">
          <div>
            <span className="mono anchor-banner-eyebrow">PREVIEW · NOT YOUR DATA</span>
            <span className="anchor-banner-text">You're viewing a demo. Sign in to track your real Anchor 12 progress.</span>
          </div>
          <div className="anchor-banner-actions">
            <button className="btn btn-primary btn-sm" onClick={() => auth.openSignIn && auth.openSignIn()}>Sign in →</button>
          </div>
        </div>
      </div>
    );
  }
  if (!live) {
    return (
      <div className="anchor-banner">
        <div className="container anchor-banner-row">
          <span className="mono">LOADING YOUR PROGRESS…</span>
        </div>
      </div>
    );
  }
  const sessionLabel = live.session ? (live.session.code + " · " + live.session.year) : "OFF-SESSION";
  return (
    <div className="anchor-banner anchor-banner-live">
      <div className="container anchor-banner-row">
        <div>
          <span className="mono anchor-banner-eyebrow">LIVE · {sessionLabel}</span>
          <span className="anchor-banner-text">
            {(live.name || "Member").split(" ")[0]} — you're on Week {live.week} of {live.totalWeeks || 12}. {live.completed} missions verified this session · {live.xp} XP.
          </span>
        </div>
        <div className="anchor-banner-actions">
          <button className="btn btn-gold btn-sm" onClick={() => setPage("dashboard")}>Open dashboard →</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AnchorPage, ProfilePage, MissionRow, HabitGrid });
