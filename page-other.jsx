/* ================================================================
   NGG — Media + Parents + Volunteers + Join
   ================================================================ */

/* =================== MEDIA =================== */
function MediaPage({ setPage }) {
  const [filter, setFilter] = useState("All");
  const kinds = ["All", "Reel", "Documentary", "Performance", "Podcast", "Before/After", "Day in life"];
  const items = filter === "All" ? MEDIA_ITEMS : MEDIA_ITEMS.filter(i => i.kind === filter);

  return (
    <div className="page" data-screen-label="06 Media">
      <section style={{background:"var(--navy-900)", color:"white", padding:"64px 0 32px"}}>
        <div className="container">
          <span className="chip chip-on-dark">THE MOVEMENT, ON CAMERA</span>
          <h1 className="display" style={{fontSize:"clamp(64px, 9vw, 132px)", margin:"16px 0", color:"white", lineHeight:0.9}}>
            Media<span style={{color:"var(--gold-500)"}}>.room</span>
          </h1>
          <p style={{fontSize:19, color:"rgba(255,255,255,0.75)", maxWidth:660, lineHeight:1.5}}>
            Reels, docs, performances, podcasts. Every cohort produces. Every member features. This is what teenage Africa looks like when it is given a camera and a deadline.
          </p>
        </div>
      </section>

      <section style={{padding:"28px 0", background:"var(--paper)", borderBottom:"1px solid rgba(12,20,50,0.07)"}}>
        <div className="container">
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {kinds.map(k => (
              <button key={k} onClick={() => setFilter(k)} className={"chip " + (filter === k ? "chip-navy" : "")} style={{cursor:"pointer", fontSize:13, padding:"8px 14px"}}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {/* Featured */}
          <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:18, marginBottom:32}}>
            <FeatureCard
              big
              item={{ kind: "Reel", label: "Anchor 12 — The trailer", meta: "0:47 · 12.4k views" }}
            />
            <FeatureCard item={{ kind: "Documentary", label: "From Onitsha, with code.", meta: "12:04 · Mini-doc" }}/>
          </div>

          {/* Grid */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:18}}>
            {items.map((m, i) => <FeatureCard key={i} item={m}/>)}
          </div>
        </div>
      </section>

      {/* Press / mentions */}
      <section className="section" style={{background:"var(--cream-50)"}}>
        <div className="container">
          <SectionHead eyebrow="THE MOVEMENT IN THE WORLD" title="Press, partnerships, signal." />
          <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:12}}>
            {["BellaNaija","TechCabal","Pulse","Channels TV","The Continent"].map((p, i) => (
              <div key={p} className="card" style={{padding:24, textAlign:"center"}}>
                <div className="display" style={{fontSize:24, color:"var(--navy-900)"}}>{p}</div>
                <div className="mono" style={{fontSize:10, letterSpacing:"0.15em", color:"var(--ink-500)", marginTop:8}}>FEATURED · {2025 - i}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ item, big = false }) {
  const kindColor = {
    "Reel": "chip-coral",
    "Documentary": "chip-navy",
    "Performance": "chip-gold",
    "Podcast": "chip-plum",
    "Before/After": "chip-lime",
    "Day in life": "chip-cream",
  }[item.kind] || "";
  const kindImg = {
    "Reel": "teenSpeaking",
    "Documentary": "techLab",
    "Performance": "dance",
    "Podcast": "podcast",
    "Before/After": "showcase",
    "Day in life": "community",
  }[item.kind] || "heroMain";
  return (
    <div style={{display:"flex", flexDirection:"column", gap:10, cursor:"pointer"}}>
      <div style={{position:"relative", borderRadius:18, overflow:"hidden", aspectRatio: big ? "16/9" : "4/3"}}>
        <Photo name={kindImg} ratio="auto" style={{height:"100%", borderRadius:0}}/>
        <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 30%, rgba(12,20,50,0.78) 100%)"}}/>
        <div style={{position:"absolute", top:14, left:14}}>
          <span className={"chip " + kindColor}>{item.kind}</span>
        </div>
        <div style={{position:"absolute", inset:0, display:"grid", placeItems:"center"}}>
          <div style={{width: big ? 84 : 64, height: big ? 84 : 64, borderRadius:"50%", background:"rgba(255,255,255,0.92)", display:"grid", placeItems:"center", color:"var(--navy-900)"}}>
            <div style={{width:0, height:0, borderTop:`${big ? 16 : 12}px solid transparent`, borderBottom:`${big ? 16 : 12}px solid transparent`, borderLeft:`${big ? 24 : 18}px solid var(--navy-900)`, marginLeft:6}}/>
          </div>
        </div>
        <div style={{position:"absolute", bottom:14, left:14, right:14, color:"white"}}>
          <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize: big ? 28 : 18, lineHeight:1.1, letterSpacing:"-0.02em"}}>{item.label}</div>
          <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.8)", marginTop:6}}>{item.meta}</div>
        </div>
      </div>
    </div>
  );
}

/* =================== PARENTS =================== */
function ParentsPage({ setPage }) {
  return (
    <div className="page" data-screen-label="07 Parents">
      <section style={{background:"var(--cream-100)", padding:"72px 0"}}>
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:48, alignItems:"end"}}>
            <div>
              <span className="chip chip-navy"><span className="dot dot-gold"/> FOR PARENTS & GUARDIANS</span>
              <h1 className="display" style={{fontSize:"clamp(56px, 7vw, 108px)", margin:"18px 0 16px"}}>
                A safe room<br/>with <em style={{fontStyle:"normal", color:"var(--coral)"}}>high ceilings.</em>
              </h1>
              <p style={{fontSize:19, lineHeight:1.5, color:"var(--ink-700)", maxWidth:560, margin:0}}>
                You are not handing your teenager to a workshop. You are introducing them to a movement that asks more of them, and protects them while it does.
              </p>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              {[
                { num: "100%", label: "Mentors background-checked" },
                { num: "2-mentor", label: "Minimum at every session" },
                { num: "Weekly", label: "Digest sent to parents" },
                { num: "0 fee", label: "For accepted summer scholars" },
              ].map(s => (
                <div key={s.label} className="card" style={{padding:18}}>
                  <div className="display" style={{fontSize:36, color:"var(--navy-900)"}}>{s.num}</div>
                  <div className="mono" style={{fontSize:11, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--ink-500)", marginTop:6}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mentorship philosophy */}
      <section className="section">
        <div className="container">
          <SectionHead eyebrow="OUR PHILOSOPHY" title="We train character through public work." sub="A teenager learns who they are by attempting things in front of people who care. Our job is to design the attempts and curate the people." />
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:20}}>
            {[
              { h: "Safety is a system, not a slogan.",         d: "Background checks, two-mentor minimum, code-of-conduct training, anonymous reporting, parent digest, monitored channels." },
              { h: "Discipline before charisma.",                d: "We do not chase prodigies. We build habit, attention and follow-through. Talent is downstream of these." },
              { h: "African intelligence is the spine.",         d: "We do not import a foreign curriculum and translate. The lens is ours. The languages we learn serve it." },
            ].map((c, i) => (
              <div key={c.h} className="card" style={{padding:28, minHeight:240}}>
                <div className="display" style={{fontSize:48, color:"var(--gold-500)"}}>0{i+1}</div>
                <h3 style={{fontFamily:"var(--font-display)", fontSize:22, margin:"12px 0", letterSpacing:"-0.02em"}}>{c.h}</h3>
                <p style={{fontSize:14, color:"var(--ink-500)", lineHeight:1.5, margin:0}}>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" style={{background:"var(--cream-50)"}}>
        <div className="container">
          <SectionHead eyebrow="QUESTIONS YOU PROBABLY HAVE" title="Asked, answered, in writing." />
          <FAQList items={FAQ}/>
        </div>
      </section>
    </div>
  );
}

function FAQList({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="card" style={{padding:0, overflow:"hidden"}}>
      {items.map((f, i) => (
        <div key={i} style={{borderTop: i === 0 ? "none" : "1px solid rgba(12,20,50,0.07)"}}>
          <button onClick={() => setOpen(open === i ? -1 : i)} style={{
            width:"100%", background:"none", border:"none", padding:"24px 28px",
            display:"flex", justifyContent:"space-between", alignItems:"center",
            cursor:"pointer", textAlign:"left", fontFamily:"inherit",
          }}>
            <span style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:22, letterSpacing:"-0.02em"}}>{f.q}</span>
            <span style={{
              width:32, height:32, borderRadius:"50%",
              background: open === i ? "var(--navy-900)" : "var(--cream-100)",
              color: open === i ? "white" : "var(--navy-900)",
              display:"grid", placeItems:"center", fontSize:18, fontWeight:700,
              transition:"all 0.2s ease",
              transform: open === i ? "rotate(45deg)" : "rotate(0)",
            }}>+</span>
          </button>
          {open === i && (
            <div style={{padding:"0 28px 24px", fontSize:16, lineHeight:1.55, color:"var(--ink-500)", maxWidth:760}}>
              {f.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* =================== VOLUNTEERS =================== */
function VolunteersPage({ setPage }) {
  return (
    <div className="page" data-screen-label="08 Volunteers">
      <section style={{background:"var(--navy-900)", color:"white", padding:"72px 0", position:"relative", overflow:"hidden"}}>
        <div style={{position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 80% 50%, rgba(208,255,58,0.14), transparent 60%)"}}/>
        <div className="container" style={{position:"relative", display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:48, alignItems:"center"}}>
          <div>
            <span className="chip chip-on-dark"><span className="dot dot-lime"/> MENTORS · INSTRUCTORS · CREATIVES · OPS</span>
            <h1 className="display" style={{fontSize:"clamp(56px, 8vw, 124px)", margin:"18px 0 16px", color:"white", lineHeight:0.9}}>
              Join the rebuilding<br/>of <span style={{color:"var(--lime)"}}>the next generation.</span>
            </h1>
            <p style={{fontSize:19, lineHeight:1.5, color:"rgba(255,255,255,0.78)", maxWidth:560, margin:0}}>
              We do not need experts. We need adults who can listen first, model their craft on camera, and stay present for twelve weeks. If that is you, we have a role.
            </p>
            <button className="btn btn-lime btn-lg mt-32">Apply to mentor →</button>
          </div>
          <Photo name="mentor" style={{height:420}} overlay>
            <div style={{position:"absolute", bottom:20, left:20, right:20, color:"white"}}>
              <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", color:"var(--gold-400)"}}>MENTOR CIRCLE · LAGOS</div>
              <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:24, marginTop:4, lineHeight:1.05}}>The Saturday session.</div>
            </div>
          </Photo>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="FIVE WAYS TO BE USEFUL" title="Pick the shape of your time." />
          <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:14}}>
            {VOLUNTEER_ROLES.map((r, i) => (
              <div key={r.name} className="card" style={{padding:24, minHeight:240, display:"flex", flexDirection:"column", justifyContent:"space-between"}}>
                <div>
                  <div className="display" style={{fontSize:36, color:"var(--gold-500)"}}>0{i+1}</div>
                  <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:22, marginTop:8, lineHeight:1.1}}>{r.name}</div>
                  <div className="mono" style={{fontSize:11, color:"var(--coral)", marginTop:8, letterSpacing:"0.12em"}}>{r.commit.toUpperCase()}</div>
                </div>
                <div style={{fontSize:13, color:"var(--ink-500)", lineHeight:1.4}}>{r.ideal}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mentor spotlight */}
      <section className="section" style={{background:"var(--cream-50)"}}>
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:48, alignItems:"center"}}>
            <Photo src={portrait(8, 800, 1000)} ratio="4/5" style={{height:520}}/>
            <div>
              <span className="eyebrow" style={{color:"var(--gold-500)"}}>MENTOR SPOTLIGHT</span>
              <h2 className="display" style={{fontSize:"clamp(40px, 5vw, 72px)", margin:"8px 0 18px", lineHeight:0.95}}>
                "These teenagers do not need rescuing.<br/>They need a room with high ceilings."
              </h2>
              <p style={{fontSize:16, color:"var(--ink-500)", lineHeight:1.55, maxWidth:520}}>
                Dr. Ade has mentored four cohorts. Six of his students are now in Vanguard. One is running a community library. He says the trick is to listen first, twice as long as you think is reasonable, then ask one hard question.
              </p>
              <div style={{display:"flex", gap:12, marginTop:24}}>
                <span className="chip chip-gold">4 cohorts</span>
                <span className="chip chip-lime">23 mentees</span>
                <span className="chip">★ 4.9 rating</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =================== JOIN / APPLICATION =================== */
function JoinPage({ setPage }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ name: "", age: 14, city: "Egbeda", track: "Music", why: "", parentEmail: "" });
  const steps = ["Identity", "Track", "Story", "Parent"];

  function next() { setStep(Math.min(steps.length, step + 1)); }
  function back() { setStep(Math.max(0, step - 1)); }

  return (
    <div className="page" data-screen-label="09 Join">
      <section style={{background:"var(--paper)", padding:"56px 0 88px", minHeight:"calc(100vh - 71px)"}}>
        <div className="container" style={{maxWidth:980}}>
          <div style={{textAlign:"center", marginBottom:40}}>
            <span className="eyebrow" style={{color:"var(--gold-500)"}}>APPLY · SUMMER 2026</span>
            <h1 className="display" style={{fontSize:"clamp(48px, 6vw, 88px)", margin:"10px 0 0"}}>
              Start your <em style={{fontStyle:"normal", color:"var(--coral)"}}>journey.</em>
            </h1>
            <p style={{fontSize:17, color:"var(--ink-500)", maxWidth:520, margin:"16px auto 0", lineHeight:1.5}}>
              Four short steps. Should take six minutes. You can pause and come back — we save as you go.
            </p>
          </div>

          {/* Stepper */}
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:32, padding:"0 12px"}}>
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:8, flex:"0 0 auto"}}>
                  <div style={{
                    width:42, height:42, borderRadius:"50%",
                    background: i < step ? "var(--navy-900)" : i === step ? "var(--gold-500)" : "var(--cream-100)",
                    color: i <= step ? (i === step ? "var(--navy-900)" : "white") : "var(--ink-400)",
                    display:"grid", placeItems:"center", fontWeight:700, fontFamily:"var(--font-display)", fontSize:18,
                    border: i === step ? "2px solid var(--navy-900)" : "none",
                  }}>
                    {i < step ? "✓" : i + 1}
                  </div>
                  <div className="mono" style={{fontSize:10, letterSpacing:"0.15em", textTransform:"uppercase", fontWeight: i === step ? 700 : 400, color: i === step ? "var(--navy-900)" : "var(--ink-500)"}}>
                    {s}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div style={{flex:1, height:2, background: i < step ? "var(--navy-900)" : "var(--cream-200)", margin:"-22px 12px 0"}}/>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="card" style={{padding:48, minHeight:380}}>
            {step === 0 && (
              <div style={{display:"flex", flexDirection:"column", gap:18}}>
                <h2 style={{fontFamily:"var(--font-display)", fontSize:32, margin:0, letterSpacing:"-0.02em"}}>Who is applying?</h2>
                <p style={{color:"var(--ink-500)", margin:0}}>Use the name you'd want printed on a Genius ID card. You can change it later.</p>
                <div style={{display:"grid", gridTemplateColumns:"2fr 1fr 1.4fr", gap:14, marginTop:14}}>
                  <div className="field">
                    <label>Your first name</label>
                    <input value={data.name} onChange={e => setData({...data, name: e.target.value})} placeholder="e.g. Adaeze"/>
                  </div>
                  <div className="field">
                    <label>Age</label>
                    <input type="number" min="10" max="17" value={data.age} onChange={e => setData({...data, age: e.target.value})}/>
                  </div>
                  <div className="field">
                    <label>Which centre is closest to you?</label>
                    <select value={data.city} onChange={e => setData({...data, city: e.target.value})}>
                      <option value="Egbeda">CACENTRE Egbeda</option>
                      <option value="Ayobo">CACENTRE Ayobo</option>
                      <option value="Other">Neither — I'll travel</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {step === 1 && (
              <div>
                <h2 style={{fontFamily:"var(--font-display)", fontSize:32, margin:"0 0 8px", letterSpacing:"-0.02em"}}>Pick a starting track.</h2>
                <p style={{color:"var(--ink-500)", margin:"0 0 24px"}}>You can switch tracks any time in your first four weeks.</p>
                <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12}}>
                  {TRACKS.map(t => (
                    <button key={t.id} onClick={() => setData({...data, track: t.name})} style={{
                      padding:18, borderRadius:14, textAlign:"left",
                      background: data.track === t.name ? "var(--navy-900)" : "white",
                      color: data.track === t.name ? "white" : "var(--ink-900)",
                      border: data.track === t.name ? "2px solid var(--gold-500)" : "1px solid rgba(12,20,50,0.12)",
                      cursor:"pointer", fontFamily:"inherit",
                    }}>
                      <div style={{fontSize:28, marginBottom:8}}>{t.icon}</div>
                      <div style={{fontWeight:700}}>{t.name}</div>
                      <div style={{fontSize:11, opacity:0.7, marginTop:4, lineHeight:1.3}}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <div style={{display:"flex", flexDirection:"column", gap:18}}>
                <h2 style={{fontFamily:"var(--font-display)", fontSize:32, margin:0, letterSpacing:"-0.02em"}}>Tell us one thing.</h2>
                <p style={{color:"var(--ink-500)", margin:0}}>In 3 sentences: what would you build with twelve uninterrupted weeks?</p>
                <div className="field">
                  <label>Your answer</label>
                  <textarea rows={6} value={data.why} onChange={e => setData({...data, why: e.target.value})} placeholder="A short answer is fine. Be honest, not impressive."/>
                </div>
                <div className="mono" style={{fontSize:11, color:"var(--ink-500)"}}>{data.why.length} CHARACTERS · APPLICATIONS ARE READ BY HUMANS, NOT FILTERS.</div>
              </div>
            )}
            {step === 3 && (
              <div style={{display:"flex", flexDirection:"column", gap:18}}>
                <h2 style={{fontFamily:"var(--font-display)", fontSize:32, margin:0, letterSpacing:"-0.02em"}}>Parent or guardian.</h2>
                <p style={{color:"var(--ink-500)", margin:0}}>We will email them a one-pager explaining the program and asking for consent. We will not contact them again without your knowledge.</p>
                <div className="field">
                  <label>Parent / guardian email</label>
                  <input value={data.parentEmail} onChange={e => setData({...data, parentEmail: e.target.value})} placeholder="parent@example.com"/>
                </div>
                <div className="card" style={{padding:18, background:"var(--cream-50)", border:"1px solid var(--cream-200)"}}>
                  <div className="eyebrow" style={{color:"var(--ink-500)"}}>APPLICATION SUMMARY</div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginTop:12, fontSize:14}}>
                    <div><b>Name</b><br/>{data.name || "—"}</div>
                    <div><b>Age</b><br/>{data.age}</div>
                    <div><b>City</b><br/>{data.city}</div>
                    <div><b>Track</b><br/>{data.track}</div>
                  </div>
                </div>
              </div>
            )}
            {step === 4 && (
              <div style={{textAlign:"center", padding:"32px 0"}}>
                <div className="badge-pin unlocked" style={{width:96, height:96, fontSize:48, margin:"0 auto"}}>✓</div>
                <h2 className="display" style={{fontSize:56, margin:"24px 0 12px"}}>Application received.</h2>
                <p style={{fontSize:17, color:"var(--ink-500)", maxWidth:480, margin:"0 auto", lineHeight:1.5}}>
                  We will write back within 5 working days. In the meantime — follow Genius FM and start your streak.
                </p>
                <button className="btn btn-primary btn-lg mt-32" onClick={() => setPage("home")}>Back to home</button>
              </div>
            )}
          </div>

          {step < 4 && (
            <div style={{display:"flex", justifyContent:"space-between", marginTop:24}}>
              <button className="btn btn-ghost" onClick={back} disabled={step === 0} style={{visibility: step === 0 ? "hidden" : "visible"}}>← Back</button>
              <button className="btn btn-primary btn-lg" onClick={next}>
                {step === 3 ? "Submit application →" : "Continue →"}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { MediaPage, ParentsPage, VolunteersPage, JoinPage, FAQList });
