/* ================================================================
   NGG — Media + Parents + Volunteers + Join
   ================================================================ */

/* =================== MEDIA =================== */
function MediaPage({ setPage }) {
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState(null);
  const kinds = ["All", ...Array.from(new Set(MEDIA_ITEMS.map(m => m.kind)))];
  const items = filter === "All" ? MEDIA_ITEMS : MEDIA_ITEMS.filter(i => i.kind === filter);
  const [featuredA, featuredB, ...rest] = items.length ? items : MEDIA_ITEMS;

  const handlePlay = (item) => {
    if (item && item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    setOpen(item);
  };

  return (
    <div className="page" data-screen-label="06 Media">
      <section className="page-hero page-hero-dark" style={{background:"var(--navy-900)", color:"white", padding:"64px 0 32px"}}>
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

      <section style={{padding:"28px 0", background:"var(--paper)", borderBottom:"1px solid rgba(12,20,50,0.07)", position:"sticky", top:"60px", zIndex:5, backdropFilter:"saturate(1.2) blur(8px)"}}>
        <div className="container">
          <div role="tablist" aria-label="Media filter" style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {kinds.map(k => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={"chip " + (filter === k ? "chip-navy" : "")} style={{cursor:"pointer", fontSize:13, padding:"8px 14px"}}>
                {k}
              </button>
            ))}
            <span className="mono" style={{marginLeft:"auto", alignSelf:"center", fontSize:11, color:"var(--ink-700)", letterSpacing:"0.14em"}}>{items.length} ITEMS</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {items.length === 0 ? (
            <div style={{textAlign:"center", padding:"48px 0", color:"var(--ink-700)"}}>
              No media in this category yet.
              <div style={{marginTop:14}}>
                <button className="btn btn-ghost btn-sm" onClick={() => setFilter("All")}>Show everything</button>
              </div>
            </div>
          ) : (
            <React.Fragment>
              {/* Featured pair */}
              {featuredA && (
                <div style={{display:"grid", gridTemplateColumns: featuredB ? "2fr 1fr" : "1fr", gap:18, marginBottom:32}}>
                  <FeatureCard big item={featuredA} onPlay={() => handlePlay(featuredA)}/>
                  {featuredB && <FeatureCard item={featuredB} onPlay={() => handlePlay(featuredB)}/>}
                </div>
              )}
              {/* Grid */}
              <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:18}}>
                {rest.map((m, i) => <FeatureCard key={m.label + i} item={m} onPlay={() => handlePlay(m)}/>)}
              </div>
            </React.Fragment>
          )}
        </div>
      </section>

      {open && <MediaModal item={open} onClose={() => setOpen(null)}/>}

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

function FeatureCard({ item, big = false, onPlay }) {
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
    <button
      type="button"
      onClick={onPlay}
      className="media-card"
      aria-label={"Play " + item.label}
      style={{display:"flex", flexDirection:"column", gap:10, background:"none", border:"none", padding:0, textAlign:"left", cursor:"pointer", fontFamily:"inherit", width:"100%"}}
    >
      <div style={{position:"relative", borderRadius:18, overflow:"hidden", aspectRatio: big ? "16/9" : "4/3"}}>
        <Photo name={kindImg} ratio="auto" style={{height:"100%", borderRadius:0}}/>
        <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 30%, rgba(12,20,50,0.78) 100%)"}}/>
        <div style={{position:"absolute", top:14, left:14}}>
          <span className={"chip " + kindColor}>{item.kind}</span>
        </div>
        <div className="media-card-play" style={{position:"absolute", inset:0, display:"grid", placeItems:"center"}}>
          <div style={{width: big ? 84 : 64, height: big ? 84 : 64, borderRadius:"50%", background:"rgba(255,255,255,0.92)", display:"grid", placeItems:"center", color:"var(--navy-900)"}}>
            <div style={{width:0, height:0, borderTop:`${big ? 16 : 12}px solid transparent`, borderBottom:`${big ? 16 : 12}px solid transparent`, borderLeft:`${big ? 24 : 18}px solid var(--navy-900)`, marginLeft:6}}/>
          </div>
        </div>
        <div style={{position:"absolute", bottom:14, left:14, right:14, color:"white"}}>
          <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize: big ? 28 : 18, lineHeight:1.1, letterSpacing:"-0.02em"}}>{item.label}</div>
          <div className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.85)", marginTop:6}}>{item.meta}</div>
        </div>
      </div>
    </button>
  );
}

function MediaModal({ item, onClose }) {
  React.useEffect(() => {
    document.body.classList.add("no-scroll");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("no-scroll"); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className="media-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={item.label}>
      <div className="media-modal-card">
        <button className="media-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="media-modal-stage">
          <div className="media-modal-stage-inner">
            <div className="media-modal-mark" aria-hidden="true">▶</div>
            <div className="mono" style={{fontSize:11, letterSpacing:"0.18em", color:"rgba(255,255,255,0.75)", marginTop:14}}>
              {item.kind.toUpperCase()} · {item.meta}
            </div>
            <div style={{fontFamily:"var(--font-display)", fontSize:28, fontWeight:700, lineHeight:1.15, marginTop:10, maxWidth:520}}>{item.label}</div>
            <p style={{color:"rgba(255,255,255,0.7)", marginTop:14, fontSize:14, maxWidth:480, lineHeight:1.5}}>
              The full media player is coming soon — for now, this piece is screened live at our Saturday sessions. Drop your email below and we'll send you the link when it goes online.
            </p>
            <div style={{maxWidth:480, marginTop:18}}>
              <NewsletterForm source={"media:" + item.kind}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== PARENTS =================== */
function ParentsPage({ setPage }) {
  return (
    <div className="page" data-screen-label="07 Parents">
      <section className="page-hero page-hero-light" style={{background:"var(--cream-100)", padding:"72px 0"}}>
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
    <div className="card faq-list" style={{padding:0, overflow:"hidden"}}>
      {items.map((f, i) => {
        const isOpen = open === i;
        const panelId = "faq-panel-" + i;
        const btnId = "faq-btn-" + i;
        return (
          <div key={i} style={{borderTop: i === 0 ? "none" : "1px solid rgba(12,20,50,0.07)"}}>
            <button
              id={btnId}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={{
                width:"100%", background:"none", border:"none", padding:"24px 28px",
                display:"flex", justifyContent:"space-between", alignItems:"center", gap:18,
                cursor:"pointer", textAlign:"left", fontFamily:"inherit",
              }}
            >
              <span style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:22, letterSpacing:"-0.02em", color:"var(--ink-900)"}}>{f.q}</span>
              <span aria-hidden="true" style={{
                width:32, height:32, borderRadius:"50%", flexShrink:0,
                background: isOpen ? "var(--navy-900)" : "var(--cream-100)",
                color: isOpen ? "white" : "var(--navy-900)",
                display:"grid", placeItems:"center", fontSize:18, fontWeight:700,
                transition:"transform 0.25s cubic-bezier(0.2,0.7,0.2,1), background 0.2s ease, color 0.2s ease",
                transform: isOpen ? "rotate(45deg)" : "rotate(0)",
              }}>+</span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!isOpen}
              style={{padding: isOpen ? "0 28px 24px" : "0 28px", fontSize:16, lineHeight:1.55, color:"var(--ink-700)", maxWidth:760}}
            >
              {f.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =================== VOLUNTEERS =================== */
// Connects NGG mentorship to Afrovanguard's Street-To-Stardom volunteer pool.
function AfrovanguardMentorStrip() {
  const [av, setAv] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.config().then(c => { if (alive) setAv((c && c.afrovanguard) || null); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!av) return null;
  return (
    <section className="section-tight" style={{ background: "var(--cream-100)" }}>
      <div className="container">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 620 }}>
            <span className="eyebrow" style={{ color: "var(--gold-500)" }}>PART OF AFROVANGUARD · STREET-TO-STARDOM</span>
            <h3 className="display" style={{ fontSize: "clamp(26px, 3vw, 40px)", margin: "6px 0 8px", lineHeight: 1.05 }}>
              NGG mentoring runs inside the <em style={{ fontStyle: "normal", color: "var(--coral)" }}>{av.mentorProgram}</em> network.
            </h3>
            <p style={{ color: "var(--ink-700)", margin: 0, lineHeight: 1.5, fontSize: 15 }}>
              Apply below to mentor with NGG directly, or join the wider Afrovanguard volunteer pool — the same people, the same mission across every STS program.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn btn-primary" href={av.volunteerUrl} target="_blank" rel="noopener noreferrer">Afrovanguard volunteer hub ↗</a>
            <a className="btn btn-ghost" href={av.stsUrl} target="_blank" rel="noopener noreferrer">Explore STS programs ↗</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function VolunteersPage({ setPage }) {
  return (
    <div className="page" data-screen-label="08 Volunteers">
      <section className="page-hero page-hero-dark" style={{background:"var(--navy-900)", color:"white", padding:"72px 0", position:"relative", overflow:"hidden"}}>
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
            <button
              className="btn btn-lime btn-lg mt-32"
              onClick={() => {
                const el = document.getElementById("mentor-apply");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >Apply to mentor →</button>
          </div>
          <Photo name="mentor" style={{height:420}} overlay>
            <div style={{position:"absolute", bottom:20, left:20, right:20, color:"white"}}>
              <div className="mono" style={{fontSize:10, letterSpacing:"0.18em", color:"var(--gold-400)"}}>MENTOR CIRCLE · LAGOS</div>
              <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:24, marginTop:4, lineHeight:1.05}}>The Saturday session.</div>
            </div>
          </Photo>
        </div>
      </section>

      <AfrovanguardMentorStrip/>

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

      {/* Mentor application */}
      <MentorApplySection/>
    </div>
  );
}

function MentorApplySection() {
  const [d, setD] = useState({ name: "", email: "", role: VOLUNTEER_ROLES[0] ? VOLUNTEER_ROLES[0].name : "Mentor", why: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (d.name.trim().length < 2) { setErr("Enter your name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) { setErr("Enter a valid email."); return; }
    setBusy(true);
    try {
      await NGGApi.public.apply({
        kind: "mentor",
        name: d.name.trim(),
        email: d.email.trim(),
        role: d.role,
        why: d.why.trim(),
      });
      setSent(true);
      if (typeof toast !== "undefined") toast.success("We'll write back within a week.", "Application received");
    } catch (e2) {
      const code = e2.code || e2.message;
      setErr(code === "rate_limited"
        ? "Too many submissions — wait a few minutes."
        : "Couldn't submit right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="mentor-apply" className="section" style={{background:"var(--navy-900)", color:"white"}}>
      <div className="container" style={{maxWidth:760}}>
        <div style={{textAlign:"center", marginBottom:36}}>
          <span className="eyebrow" style={{color:"var(--lime)"}}>APPLY · VOLUNTEER TEAM</span>
          <h2 className="display" style={{fontSize:"clamp(40px, 5vw, 64px)", margin:"10px 0 0", color:"white"}}>Put your hand up.</h2>
          <p style={{fontSize:16, color:"rgba(255,255,255,0.78)", maxWidth:480, margin:"14px auto 0", lineHeight:1.5}}>
            Two minutes. We read every application and reply within a week — yes or no, in writing.
          </p>
        </div>
        {sent ? (
          <div className="card" style={{padding:40, textAlign:"center", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(208,255,58,0.35)", color:"white"}}>
            <div className="badge-pin lime" style={{width:72, height:72, fontSize:32, margin:"0 auto 18px"}}>✓</div>
            <h3 style={{fontFamily:"var(--font-display)", fontSize:28, margin:"0 0 10px"}}>Application received.</h3>
            <p style={{color:"rgba(255,255,255,0.78)", margin:0, lineHeight:1.5}}>
              Watch your inbox — we reply within a week. Thank you for offering your Saturdays.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="card" style={{padding:32, display:"flex", flexDirection:"column", gap:16, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)"}}>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Your name</label>
                <input value={d.name} onChange={e => setD({...d, name: e.target.value})} placeholder="Full name" autoComplete="name"/>
              </div>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Email</label>
                <input type="email" value={d.email} onChange={e => setD({...d, email: e.target.value})} placeholder="you@email.com" autoComplete="email"/>
              </div>
            </div>
            <div className="field">
              <label style={{color:"rgba(255,255,255,0.8)"}}>Which role fits your time?</label>
              <select value={d.role} onChange={e => setD({...d, role: e.target.value})}>
                {VOLUNTEER_ROLES.map(r => <option key={r.name} value={r.name}>{r.name} — {r.commit}</option>)}
              </select>
            </div>
            <div className="field">
              <label style={{color:"rgba(255,255,255,0.8)"}}>One line on why (optional)</label>
              <textarea rows={3} value={d.why} onChange={e => setD({...d, why: e.target.value})} placeholder="What craft would you model? What pulls you to this?"/>
            </div>
            {err && <div role="alert" style={{color:"var(--coral)", fontSize:14, fontWeight:500}}>{err}</div>}
            <button className="btn btn-lime btn-lg" type="submit" disabled={busy} style={{justifyContent:"center"}}>
              {busy ? "Submitting…" : "Submit application →"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

/* =================== JOIN / APPLICATION =================== */
const JOIN_DRAFT_KEY = "ngg.join.draft";

function JoinPage({ setPage }) {
  // Restore a saved draft so "we save as you go" is true.
  const [step, setStep] = useState(0);
  // Which program the applicant chose (set by the Summer page before it routes
  // here). 'summer' = 6-week on-ramp, 'anchor' = flagship 12-week NGG. Captured
  // once on mount so navigating away and back via the generic Apply link resets.
  const [program] = useState(() => {
    const p = (typeof window !== "undefined" && window.__nggProgram === "summer") ? "summer" : "anchor";
    if (typeof window !== "undefined") window.__nggProgram = null;
    return p;
  });
  const isSummer = program === "summer";
  const [data, setData] = useState(() => {
    const base = { name: "", age: 14, city: "Egbeda", track: "Music", why: "", parentEmail: "", photoUrl: "" };
    try {
      const saved = JSON.parse(localStorage.getItem(JOIN_DRAFT_KEY) || "null");
      if (saved && typeof saved === "object") return Object.assign(base, saved);
    } catch (_) {}
    return base;
  });
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const steps = ["Identity", "Track", "Story", "Parent"];
  const session = useSession();
  const applyEyebrow = isSummer
    ? "APPLY · SUMMER STUDENTS"
    : (session ? "APPLY · " + sessionLabel(session, "NEXT SESSION").toUpperCase() : "APPLY · NEXT SESSION");

  async function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) { setFieldErr("Please choose an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setFieldErr("Photo must be under 8 MB."); return; }
    setPhotoBusy(true); setFieldErr("");
    try {
      const r = await NGGApi.uploadPublic(file);
      setData(d => ({ ...d, photoUrl: r.url }));
    } catch (err) {
      const msg = err.message === "public_upload_disabled"
        ? "Photo upload isn't available right now — you can apply without one."
        : "Couldn't upload that photo. You can apply without one.";
      setFieldErr(msg);
    } finally { setPhotoBusy(false); }
  }

  // Persist draft on every change (cleared on successful submit).
  React.useEffect(() => {
    try { localStorage.setItem(JOIN_DRAFT_KEY, JSON.stringify(data)); } catch (_) {}
  }, [data]);

  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

  function validate(s) {
    if (s === 0) {
      if (data.name.trim().length < 2) return "Enter the applicant's first name.";
      const age = parseInt(data.age, 10);
      if (!age || age < 10 || age > 17) return "Age must be between 10 and 17.";
    }
    if (s === 2 && data.why.trim().length < 20) {
      return "Give us at least a sentence or two — 20 characters minimum.";
    }
    if (s === 3 && !emailOk(data.parentEmail)) {
      return "Enter a valid parent or guardian email.";
    }
    return "";
  }

  async function next() {
    const msg = validate(step);
    if (msg) { setFieldErr(msg); return; }
    setFieldErr("");

    if (step < 3) { setStep(step + 1); return; }

    // Final step — actually submit the application.
    setBusy(true);
    try {
      await NGGApi.public.apply({
        kind: "teen",
        program: program,
        name: data.name.trim(),
        age: parseInt(data.age, 10),
        centre: data.city,
        track: data.track,
        why: data.why.trim(),
        email: data.parentEmail.trim(),
        photoUrl: data.photoUrl || "",
      });
      try { localStorage.removeItem(JOIN_DRAFT_KEY); } catch (_) {}
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const code = e.code || e.message;
      const map = {
        rate_limited: "Too many submissions from this connection — wait a few minutes and try again.",
        bad_email: "That parent email doesn't look right.",
        bad_age: "Age must be between 10 and 17.",
        upstream_unreachable: "We couldn't reach the server. Your draft is saved — try again in a moment.",
      };
      const text = map[code] || "Couldn't submit your application. Your draft is saved — try again.";
      setFieldErr(text);
      if (typeof toast !== "undefined") toast.error(text, "Application");
    } finally {
      setBusy(false);
    }
  }
  function back() { setFieldErr(""); setStep(Math.max(0, step - 1)); }

  return (
    <div className="page" data-screen-label="09 Join">
      <section className="page-hero page-hero-light" style={{background:"var(--paper)", padding:"56px 0 88px", minHeight:"calc(100vh - 71px)"}}>
        <div className="container" style={{maxWidth:980}}>
          <div style={{textAlign:"center", marginBottom:40}}>
            <span className="eyebrow" style={{color:"var(--gold-500)"}}>{applyEyebrow}</span>
            <h1 className="display" style={{fontSize:"clamp(48px, 6vw, 88px)", margin:"10px 0 0"}}>
              {isSummer ? <>Summer <em style={{fontStyle:"normal", color:"var(--coral)"}}>starts here.</em></> : <>Start your <em style={{fontStyle:"normal", color:"var(--coral)"}}>journey.</em></>}
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
                {/* Optional headshot — unsigned Cloudinary upload, before the
                    applicant has an account. Silently skipped if not configured. */}
                <div style={{display:"flex", alignItems:"center", gap:16, marginTop:6}}>
                  <div style={{
                    width:64, height:64, borderRadius:"50%", overflow:"hidden", flex:"0 0 auto",
                    background:"var(--cream-100)", border:"1px solid rgba(12,20,50,0.12)",
                    display:"grid", placeItems:"center", fontSize:24, color:"var(--ink-400)",
                  }}>
                    {data.photoUrl ? <img src={data.photoUrl} alt="" style={{width:"100%", height:"100%", objectFit:"cover"}}/> : "📷"}
                  </div>
                  <div>
                    <label className="btn btn-ghost btn-sm" style={{cursor:"pointer", margin:0}}>
                      {photoBusy ? "Uploading…" : data.photoUrl ? "Change photo" : "Add a photo (optional)"}
                      <input type="file" accept="image/*" onChange={pickPhoto} disabled={photoBusy} style={{display:"none"}}/>
                    </label>
                    <div className="mono" style={{fontSize:11, color:"var(--ink-500)", marginTop:6}}>A friendly headshot helps us know you. Optional.</div>
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
                    <div><b>Centre</b><br/>{data.city}</div>
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
            <React.Fragment>
              {fieldErr && (
                <div role="alert" style={{
                  marginTop:18, padding:"12px 16px", borderRadius:12,
                  background:"rgba(255,90,60,0.1)", border:"1px solid rgba(255,90,60,0.3)",
                  color:"#a3331c", fontSize:14, fontWeight:500,
                }}>
                  {fieldErr}
                </div>
              )}
              <div style={{display:"flex", justifyContent:"space-between", marginTop:24}}>
                <button className="btn btn-ghost" onClick={back} disabled={step === 0 || busy} style={{visibility: step === 0 ? "hidden" : "visible"}}>← Back</button>
                <button className="btn btn-primary btn-lg" onClick={next} disabled={busy}>
                  {busy ? "Submitting…" : step === 3 ? "Submit application →" : "Continue →"}
                </button>
              </div>
            </React.Fragment>
          )}
        </div>
      </section>
    </div>
  );
}

/* =================== CONTACT =================== */
const CONTACT_PURPOSES = [
  { id: "general", label: "General enquiry" },
  { id: "apply",   label: "Applying / admissions" },
  { id: "mentor",  label: "Mentoring / volunteering" },
  { id: "partner", label: "Partnership / sponsorship" },
  { id: "media",   label: "Press / media" },
  { id: "support", label: "Support a member / donate" },
];

function ContactPage({ setPage }) {
  const [d, setD] = useState({ name: "", email: "", phone: "", purpose: "general", subject: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null); // null | ref string
  const [err, setErr] = useState("");
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

  async function submit(e) {
    e.preventDefault();
    if (d.name.trim().length < 2) { setErr("Please enter your name."); return; }
    if (!emailOk(d.email)) { setErr("Please enter a valid email address."); return; }
    if (d.message.trim().length < 10) { setErr("Please write at least a sentence so we can help."); return; }
    setErr(""); setBusy(true);
    try {
      const r = await NGGApi.public.contact({
        name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(),
        purpose: d.purpose, subject: d.subject.trim(), message: d.message.trim(), website: d.website,
      });
      setSent(r.ref || "received");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (ex) {
      const map = {
        rate_limited: "Too many messages from this connection — please wait a few minutes.",
        bad_email: "That email doesn't look right.",
        message_too_short: "Please write a little more.",
      };
      const text = map[ex.code || ex.message] || "Couldn't send your message. Please try again.";
      setErr(text);
      if (typeof toast !== "undefined") toast.error(text, "Contact");
    } finally { setBusy(false); }
  }

  return (
    <div className="page" data-screen-label="Contact">
      <section className="page-hero page-hero-light" style={{background:"var(--cream-100)", padding:"64px 0 40px"}}>
        <div className="container" style={{maxWidth:980}}>
          <span className="chip chip-navy"><span className="dot dot-gold"/> WE READ EVERY MESSAGE</span>
          <h1 className="display" style={{fontSize:"clamp(48px, 6.5vw, 96px)", margin:"18px 0 10px"}}>
            Say <em style={{fontStyle:"normal", color:"var(--coral)"}}>hello.</em>
          </h1>
          <p style={{fontSize:18, lineHeight:1.5, color:"var(--ink-700)", maxWidth:600, margin:0}}>
            Questions about a session, mentoring, partnerships or press — send a note and a human replies within two working days.
          </p>
        </div>
      </section>

      <section className="section" style={{paddingTop:32}}>
        <div className="container" style={{maxWidth:980}}>
          <div style={{display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:32, alignItems:"start"}}>
            {/* Form */}
            <div>
              {sent ? (
                <div className="card" style={{padding:40, textAlign:"center"}}>
                  <div className="badge-pin unlocked" style={{width:80, height:80, fontSize:38, margin:"0 auto 18px"}}>✓</div>
                  <h2 style={{fontFamily:"var(--font-display)", fontSize:30, margin:"0 0 10px"}}>Message sent.</h2>
                  <p style={{color:"var(--ink-700)", margin:"0 0 8px", lineHeight:1.5}}>
                    Thank you — we'll reply within two working days.
                  </p>
                  {sent !== "received" && (
                    <div className="mono" style={{fontSize:12, color:"var(--ink-500)"}}>REFERENCE · {sent}</div>
                  )}
                  <button className="btn btn-primary mt-24" onClick={() => setPage("home")}>Back to home →</button>
                </div>
              ) : (
                <form onSubmit={submit} className="card" style={{padding:32, display:"flex", flexDirection:"column", gap:16}}>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
                    <div className="field">
                      <label>Your name</label>
                      <input value={d.name} onChange={e => setD({...d, name: e.target.value})} placeholder="Full name" autoComplete="name"/>
                    </div>
                    <div className="field">
                      <label>Email</label>
                      <input type="email" value={d.email} onChange={e => setD({...d, email: e.target.value})} placeholder="you@email.com" autoComplete="email"/>
                    </div>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
                    <div className="field">
                      <label>Phone (optional)</label>
                      <input value={d.phone} onChange={e => setD({...d, phone: e.target.value})} placeholder="+234…" autoComplete="tel"/>
                    </div>
                    <div className="field">
                      <label>What's this about?</label>
                      <select value={d.purpose} onChange={e => setD({...d, purpose: e.target.value})}>
                        {CONTACT_PURPOSES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>Subject (optional)</label>
                    <input value={d.subject} onChange={e => setD({...d, subject: e.target.value})} placeholder="A short summary"/>
                  </div>
                  <div className="field">
                    <label>Message</label>
                    <textarea rows={6} value={d.message} onChange={e => setD({...d, message: e.target.value})} placeholder="Tell us what you need."/>
                  </div>
                  {/* Honeypot — hidden from humans, catches bots. */}
                  <input type="text" value={d.website} onChange={e => setD({...d, website: e.target.value})} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{position:"absolute", left:"-9999px", width:1, height:1, opacity:0}}/>
                  {err && <div role="alert" style={{color:"var(--coral)", fontSize:14, fontWeight:500}}>{err}</div>}
                  <button className="btn btn-primary btn-lg" type="submit" disabled={busy} style={{justifyContent:"center"}}>
                    {busy ? "Sending…" : "Send message →"}
                  </button>
                </form>
              )}
            </div>

            {/* Direct channels */}
            <div style={{display:"flex", flexDirection:"column", gap:16}}>
              <div className="card" style={{padding:24}}>
                <div className="eyebrow" style={{color:"var(--gold-500)"}}>DIRECT</div>
                <a href={"mailto:" + CONTACT.email} style={{display:"block", marginTop:12, fontWeight:600, color:"var(--ink-900)", textDecoration:"none"}}>✉ {CONTACT.email}</a>
                <a href={"tel:" + CONTACT.phone} style={{display:"block", marginTop:8, fontWeight:600, color:"var(--ink-900)", textDecoration:"none"}}>☎ {CONTACT.phoneDisplay}</a>
              </div>
              <div className="card" style={{padding:24}}>
                <div className="eyebrow" style={{color:"var(--gold-500)"}}>FIND US</div>
                <div style={{marginTop:12, fontSize:14, color:"var(--ink-700)", lineHeight:1.5}}>
                  <b>CACENTRE Egbeda</b><br/>Alimosho · Lagos<br/>Saturdays · 09:00 – 13:00
                </div>
                <div style={{marginTop:14, fontSize:14, color:"var(--ink-700)", lineHeight:1.5}}>
                  <b>CACENTRE Ayobo</b><br/>Alimosho · Lagos<br/>Saturdays · 09:00 – 13:00
                </div>
              </div>
              <div className="card" style={{padding:24, background:"var(--navy-900)", color:"white"}}>
                <div className="eyebrow" style={{color:"var(--gold-400)"}}>LOOKING TO APPLY?</div>
                <p style={{fontSize:14, color:"rgba(255,255,255,0.8)", margin:"12px 0 16px", lineHeight:1.5}}>
                  You don't need to email — start your application in about six minutes.
                </p>
                <button className="btn btn-gold" onClick={() => setPage("join")}>Start application →</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =================== MENTORS DIRECTORY =================== */
function MentorsPage({ setPage }) {
  const [mentors, setMentors] = React.useState(null);
  const [av, setAv] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.public.mentors()
      .then(r => { if (alive) { setMentors(r.mentors || []); setAv(r.afrovanguard || null); } })
      .catch(() => { if (alive) setMentors([]); });
  }, []);

  return (
    <div className="page" data-screen-label="Mentors">
      <section className="page-hero page-hero-dark" style={{ background: "var(--navy-900)", color: "white", padding: "72px 0 56px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 82% 25%, rgba(245,176,38,0.16), transparent 60%)" }}/>
        <div className="container" style={{ position: "relative" }}>
          <span className="chip chip-on-dark"><span className="dot dot-gold"/> {av ? av.mentorProgram : "STREET-TO-STARDOM · NEXT GEN"}</span>
          <h1 className="display" style={{ fontSize: "clamp(52px, 8vw, 116px)", margin: "18px 0 14px", color: "white", lineHeight: 0.92 }}>
            The <span style={{ color: "var(--gold-500)" }}>mentors.</span>
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.5, color: "rgba(255,255,255,0.78)", maxWidth: 620, margin: 0 }}>
            The adults who show up every Saturday — drawn from Afrovanguard's Street-To-Stardom volunteer network. Craft, character, and the discipline of staying present for twelve weeks.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
            <button className="btn btn-gold btn-lg" onClick={() => setPage("volunteers")}>Become a mentor →</button>
            {av && <a className="btn btn-on-dark-ghost btn-lg" href={av.volunteerUrl} target="_blank" rel="noopener noreferrer">Afrovanguard volunteer hub ↗</a>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {mentors === null ? <div className="dash-spinner" style={{ margin: "40px auto" }}/> :
            mentors.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <SectionHead align="center" eyebrow="MENTOR CIRCLE" title="Our mentors are being confirmed." sub="Safeguarding checks are underway. In the meantime, step forward — the circle is always growing." />
                <button className="btn btn-primary btn-lg" onClick={() => setPage("volunteers")}>Apply to mentor →</button>
              </div>
            ) : (
              <>
                <SectionHead eyebrow={"MENTOR CIRCLE · " + mentors.length} title="Meet the people in the room." />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
                  {mentors.map((m, i) => (
                    <div key={m.mentorId} className="card reveal" data-reveal style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, "--reveal-delay": (i * 40) + "ms" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {m.photoUrl
                          ? <img src={m.photoUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }}/>
                          : <Avatar name={m.fullName} seed={m.mentorId} size={56}/>}
                        <div>
                          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{m.fullName}</div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{m.centre}{m.source === "afrovanguard" ? " · AFROVANGUARD" : ""}</div>
                        </div>
                      </div>
                      {m.bio && <p style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.5, margin: 0 }}>{m.bio}</p>}
                      {(m.tracks || []).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {m.tracks.map(t => <span key={t} className="chip chip-gold" style={{ fontSize: 11 }}>{t}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
        </div>
      </section>
    </div>
  );
}

/* =================== SUMMER STUDENT PROFILE (by QR token or handle) =========== */
function SummerProfilePage({ setPage }) {
  const [state, setState] = React.useState({ loading: true, profile: null });
  React.useEffect(() => {
    const parts = (window.location.pathname || "").split("/").filter(Boolean);
    const kind = parts[0], id = decodeURIComponent(parts[1] || "");
    const req = kind === "s" ? NGGApi.public.summerProfile({ handle: id }) : NGGApi.public.summerProfile({ token: id });
    req.then(r => setState({ loading: false, profile: r.profile }))
       .catch(() => setState({ loading: false, profile: null }));
  }, []);

  if (state.loading) return <div className="page"><div className="container" style={{ padding: "120px 0", textAlign: "center" }}><div className="dash-spinner" style={{ margin: "0 auto" }}/></div></div>;
  if (!state.profile) return (
    <div className="page"><section className="section"><div className="container" style={{ textAlign: "center", padding: "80px 0" }}>
      <div className="mono" style={{ color: "var(--coral)", letterSpacing: "0.14em" }}>PROFILE NOT FOUND</div>
      <h1 className="display" style={{ fontSize: "clamp(40px,6vw,80px)", margin: "12px 0" }}>No student here.</h1>
      <p style={{ color: "var(--ink-500)" }}>That QR card isn't assigned yet, or the link is wrong.</p>
      <button className="btn btn-primary mt-24" onClick={() => setPage("home")}>Back to home →</button>
    </div></section></div>
  );

  const m = state.profile;
  const att = m.attendance || [];
  return (
    <div className="page" data-screen-label="Summer profile">
      <section className="page-hero page-hero-dark" style={{ background: "var(--navy-900)", color: "white", padding: "64px 0 48px" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          {m.photoUrl
            ? <img src={m.photoUrl} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--gold-500)" }} onError={e => { e.target.style.display = "none"; }}/>
            : <Avatar name={m.fullName} seed={m.studentId} size={96} ring/>}
          <div>
            <span className="chip chip-on-dark"><span className="dot dot-gold"/> SUMMER SCHOOL · {m.cohortId}</span>
            <h1 className="display" style={{ fontSize: "clamp(40px,6vw,76px)", margin: "12px 0 6px", color: "white", lineHeight: 0.95 }}>{m.fullName}</h1>
            <div className="mono" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: "0.1em" }}>
              {m.studentId}{m.track ? " · " + m.track : ""}{m.centre ? " · CACENTRE " + m.centre : ""} · @{m.handle}
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container" style={{ maxWidth: 720 }}>
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 className="display" style={{ fontSize: 28, margin: 0 }}>Attendance</h2>
              <div><span className="display" style={{ fontSize: 40, color: "var(--gold-500)" }}>{m.attendanceCount || 0}</span> <span className="mono" style={{ color: "var(--ink-500)", fontSize: 12 }}>DAYS PRESENT</span></div>
            </div>
            {att.length === 0
              ? <p style={{ color: "var(--ink-500)", marginTop: 12 }}>No check-ins recorded yet.</p>
              : <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                  {att.map((a, i) => <span key={i} className="chip chip-lime" title={a.checkInAt}>{a.date}</span>)}
                </div>}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================================
   Anchor Circle — the consent-based, READ-ONLY guardian / teacher / mentor
   portal. Role → code → verify → consent → dashboard. Own chrome (blue/teal),
   no member session; a signed portal token is kept in localStorage.
   ============================================================================ */
const CIRCLE_TOKEN_KEY = "ngg_circle_token";
const CIRCLE_ROLES = [
  { key: "parent", label: "Parent / Guardian", desc: "Confirm home discipline & encourage", icon: "🏠" },
  { key: "teacher", label: "Teacher", desc: "Verify school conduct & effort", icon: "🎓" },
  { key: "mentor", label: "Afrovanguard Mentor", desc: "Guide your mentee's journey", icon: "🧭" },
];
const CIRCLE_CAN = ["See streaks, systems held & progress", "Confirm daily / school conduct", "Leave weekly remarks & encouragement"];
const CIRCLE_CANNOT = ["Read private journal reflections", "Open personal notes or goals", "See AI coach conversations"];

function CirclePortal({ setPage }) {
  const [step, setStep] = React.useState("role");
  const [role, setRole] = React.useState(null);
  const [code, setCode] = React.useState("");
  const [guardianName, setGuardianName] = React.useState("");
  const [student, setStudent] = React.useState(null);
  const [consent, setConsent] = React.useState(false);
  const [token, setToken] = React.useState(() => { try { return localStorage.getItem(CIRCLE_TOKEN_KEY) || ""; } catch (_) { return ""; } });
  const [dash, setDash] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [remark, setRemark] = React.useState("");
  const [toast, setToastMsg] = React.useState("");
  const flash = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(""), 2400); };

  const loadDash = React.useCallback((tok) => {
    setBusy(true); setErr("");
    return NGGApi.public.circle.dashboard(tok)
      .then(d => { setDash(d); setStep("dashboard"); })
      .catch(e => { if ((e.code || e.message) === "link_invalid") { try { localStorage.removeItem(CIRCLE_TOKEN_KEY); } catch (_) {} setToken(""); setStep("role"); } else setErr(e.code || e.message); })
      .finally(() => setBusy(false));
  }, []);
  React.useEffect(() => { if (token) loadDash(token); /* eslint-disable-next-line */ }, []);

  const roleWord = role === "teacher" ? "student" : (role === "mentor" ? "mentee" : "child");
  const submitCode = async () => {
    setBusy(true); setErr("");
    try { const r = await NGGApi.public.circle.lookup(code); setStudent(r.student); setStep("verify"); }
    catch (e) { setErr((e.code === "not_found") ? "No student found for that code. Check the digits and try again." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.public.circle.connect({ code, role, guardianName, consent: true });
      try { localStorage.setItem(CIRCLE_TOKEN_KEY, r.token); } catch (_) {}
      setToken(r.token); await loadDash(r.token); flash("Connected securely ✓");
    } catch (e) { setErr(e.code || e.message); } finally { setBusy(false); }
  };
  const unlink = () => { try { localStorage.removeItem(CIRCLE_TOKEN_KEY); } catch (_) {} setToken(""); setDash(null); setRole(null); setCode(""); setConsent(false); setStep("role"); flash("Signed out of this device"); };
  const weekDates = () => { const out = []; const base = dash && dash.weekStart ? new Date(dash.weekStart + "T00:00:00Z") : new Date(); for (let i = 0; i < 7; i++) { const d = new Date(base); d.setUTCDate(d.getUTCDate() + i); out.push(d.toISOString().slice(0, 10)); } return out; };
  const toggleDay = async (date) => {
    const on = !(dash.confirmed || []).includes(date);
    setDash(d => ({ ...d, confirmed: on ? [...(d.confirmed || []), date] : (d.confirmed || []).filter(x => x !== date) }));
    try { await NGGApi.public.circle.confirm(token, date, on); } catch (e) { flash("Couldn't save — try again"); loadDash(token); }
  };
  const sendRemark = async () => {
    if (!remark.trim()) return;
    try { await NGGApi.public.circle.remark(token, remark.trim()); setRemark(""); flash("Remark sent to " + (dash.student.name.split(" ")[0])); }
    catch (e) { flash(humanizeError(e.message, e.code)); }
  };
  const downloadReport = async () => {
    try {
      const r = await NGGApi.public.circle.report(token); const rep = r.report; const s = rep.stats;
      const w = window.open("", "_blank"); if (!w) return;
      const remarks = (rep.remarks || []).map(x => `<li><b>${x.role}</b>: ${x.text}</li>`).join("") || "<li>None yet.</li>";
      w.document.write(`<html><head><title>Anchor weekly report — ${rep.student}</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:32px;color:#111;max-width:640px}h1{font-size:22px}.k{display:flex;gap:16px;margin:18px 0}.k div{flex:1;border:1px solid #ddd;border-radius:12px;padding:14px;text-align:center}.k b{display:block;font-size:26px}small{color:#666}</style></head><body><h1>Anchor weekly report</h1><p><b>${rep.student}</b> · week of ${rep.weekStart} · ${rep.role} view</p><div class="k"><div><b>${s.avgSystems}</b><small>avg systems</small></div><div><b>${s.reflections}</b><small>reflections</small></div><div><b>${s.conduct}%</b><small>conduct</small></div></div><p><b>Trend:</b> ${s.trend} · <b>Consistency:</b> ${s.consistency}% · <b>Streak:</b> ${s.streak} (best ${s.longestStreak})</p><p><b>Suggested focus:</b> ${rep.suggestion}</p><h3>Recent remarks</h3><ul>${remarks}</ul><script>window.onload=function(){print()}</script></body></html>`);
      w.document.close();
    } catch (e) { flash("Couldn't prepare the report"); }
  };

  const bg = { position: "absolute", inset: 0, background: "radial-gradient(92% 60% at 15% 4%,rgba(56,120,220,.5) 0%,transparent 60%),radial-gradient(80% 55% at 92% 8%,rgba(94,224,192,.32) 0%,transparent 55%),linear-gradient(175deg,#173056 0%,#122240 55%,#0d1830 100%)" };
  const card = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 18 };
  const teal = "#5ee0c0";
  const wrap = (children) => (
    <div className="circle-portal" style={{ minHeight: "100vh", background: "#0d1830", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={bg} aria-hidden="true"/>
      <div style={{ position: "relative", maxWidth: 460, margin: "0 auto", padding: "32px 22px 60px" }}>{children}</div>
      {toast && <div className="circle-toast" role="status">{toast}</div>}
    </div>
  );

  if (step === "role") return wrap(<>
    <div style={{ width: 66, height: 66, borderRadius: 20, background: "radial-gradient(circle at 35% 28%,#7fb0ff,#2f6fd0)", display: "grid", placeItems: "center", fontSize: 30 }}>🛡️</div>
    <h1 style={{ font: "800 30px/1.05 var(--font-display,sans-serif)", margin: "20px 0 0" }}>Anchor <span style={{ color: teal }}>Circle</span></h1>
    <div className="mono" style={{ letterSpacing: ".28em", color: "rgba(255,255,255,.6)", fontSize: 11, marginTop: 6 }}>GUARDIAN &amp; MENTOR PORTAL</div>
    <p style={{ color: "rgba(255,255,255,.78)", lineHeight: 1.55, marginTop: 16 }}>Support their twelve-week journey — confirm conduct, leave encouragement, and track growth <b>without ever reading their private words.</b></p>
    <div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", color: "rgba(255,255,255,.6)", margin: "26px 0 12px" }}>I AM CONNECTING AS A…</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {CIRCLE_ROLES.map(r => (
        <button key={r.key} onClick={() => { setRole(r.key); setErr(""); setStep("code"); }} style={{ ...card, display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "15px 16px", cursor: "pointer", color: "#fff" }}>
          <span style={{ fontSize: 24 }}>{r.icon}</span>
          <span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 700, fontSize: 16 }}>{r.label}</span><span style={{ fontSize: 12, color: "rgba(255,255,255,.66)" }}>{r.desc}</span></span>
          <span aria-hidden="true" style={{ color: "rgba(255,255,255,.5)" }}>›</span>
        </button>
      ))}
    </div>
    <div style={{ ...card, display: "flex", gap: 11, padding: "14px 16px", marginTop: 20, alignItems: "flex-start" }}>
      <span aria-hidden="true">🔒</span><span style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,.72)" }}>Anchor Link is a consent-based, read-only connection. It can be revoked by the student at any time.</span>
    </div>
    <button className="btn btn-ghost btn-sm" style={{ marginTop: 22, color: "rgba(255,255,255,.7)" }} onClick={() => setPage("home")}>← Back to site</button>
  </>);

  if (step === "code") return wrap(<>
    <button className="circle-back" onClick={() => setStep("role")} aria-label="Back">←</button>
    <div className="mono" style={{ letterSpacing: ".2em", color: teal, fontSize: 11, marginTop: 20 }}>STEP 1 OF 3 · PAIR</div>
    <h1 style={{ font: "800 28px/1.05 var(--font-display,sans-serif)", margin: "12px 0 0" }}>Enter the Anchor Link code</h1>
    <p style={{ color: "rgba(255,255,255,.76)", lineHeight: 1.55, marginTop: 12 }}>Ask your {roleWord} to open Anchor → <b>You → Your Circle</b>. They'll read you a 6-digit code.</p>
    <input value={code} onChange={e => setCode((e.target.value || "").replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="••••••"
      style={{ width: "100%", marginTop: 24, textAlign: "center", letterSpacing: ".5em", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 18, color: "#fff", font: "700 34px var(--font-mono,monospace)", padding: "20px 0 20px .5em", outline: "none" }}/>
    <input value={guardianName} onChange={e => setGuardianName(e.target.value)} placeholder="Your name (optional)"
      style={{ width: "100%", marginTop: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, color: "#fff", font: "600 15px var(--font-body,sans-serif)", padding: "13px 15px", outline: "none" }}/>
    {err && <div className="circle-err">{err}</div>}
    <button className="btn btn-lg" disabled={code.length !== 6 || busy} onClick={submitCode} style={{ width: "100%", marginTop: 18, background: code.length === 6 ? teal : "rgba(255,255,255,.12)", color: code.length === 6 ? "#06231d" : "rgba(255,255,255,.4)", border: "none", fontWeight: 800 }}>{busy ? "Checking…" : "Find student →"}</button>
  </>);

  if (step === "verify") return wrap(<>
    <button className="circle-back" onClick={() => setStep("code")} aria-label="Back">←</button>
    <div className="mono" style={{ letterSpacing: ".2em", color: teal, fontSize: 11, marginTop: 20 }}>STEP 2 OF 3 · VERIFY</div>
    <h1 style={{ font: "800 28px/1.05 var(--font-display,sans-serif)", margin: "12px 0 18px" }}>Is this your {roleWord}?</h1>
    <div style={{ ...card, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ width: 74, height: 74, borderRadius: "50%", background: "radial-gradient(circle at 35% 28%,#7fb0ff,#2f6fd0)", display: "grid", placeItems: "center", font: "800 30px var(--font-display,sans-serif)" }}>{((student && student.name) || "?").charAt(0)}</div>
      <div style={{ font: "800 22px var(--font-display,sans-serif)", marginTop: 14 }}>{student && student.name}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "6px 13px", borderRadius: 99, background: "rgba(94,224,192,.14)", border: "1px solid rgba(94,224,192,.3)" }}><span style={{ color: teal, fontSize: 11, fontWeight: 700 }} className="mono">✓ CODE MATCHED</span></div>
    </div>
    <button className="btn btn-lg" onClick={() => setStep("consent")} style={{ width: "100%", marginTop: 20, background: teal, color: "#06231d", border: "none", fontWeight: 800 }}>Yes, continue →</button>
    <button className="btn btn-ghost" style={{ width: "100%", marginTop: 10, color: "rgba(255,255,255,.7)" }} onClick={() => { setStep("code"); setStudent(null); }}>No, re-enter code</button>
  </>);

  if (step === "consent") return wrap(<>
    <button className="circle-back" onClick={() => setStep("verify")} aria-label="Back">←</button>
    <div className="mono" style={{ letterSpacing: ".2em", color: teal, fontSize: 11, marginTop: 20 }}>STEP 3 OF 3 · PERMISSIONS</div>
    <h1 style={{ font: "800 26px/1.05 var(--font-display,sans-serif)", margin: "12px 0 6px" }}>A transparent connection</h1>
    <p style={{ fontSize: 13, color: "rgba(255,255,255,.74)" }}>Anchor Link is deliberately limited. Here's exactly what you can and can't do.</p>
    <div className="mono" style={{ fontSize: 10, letterSpacing: ".16em", color: teal, margin: "20px 0 10px" }}>✓ YOU CAN</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{CIRCLE_CAN.map((c, i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 15px", borderRadius: 14, background: "rgba(94,224,192,.08)", border: "1px solid rgba(94,224,192,.2)" }}><span style={{ color: teal }}>✓</span><span style={{ fontSize: 13, fontWeight: 600 }}>{c}</span></div>)}</div>
    <div className="mono" style={{ fontSize: 10, letterSpacing: ".16em", color: "#ff8a8a", margin: "20px 0 10px" }}>✕ YOU CAN NOT</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{CIRCLE_CANNOT.map((c, i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 15px", borderRadius: 14, background: "rgba(255,90,90,.08)", border: "1px solid rgba(255,120,120,.2)" }}><span style={{ color: "#ff8a8a" }}>⃠</span><span style={{ fontSize: 13, fontWeight: 600 }}>{c}</span></div>)}</div>
    <button onClick={() => setConsent(v => !v)} style={{ display: "flex", gap: 12, width: "100%", textAlign: "left", marginTop: 20, padding: 15, borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", cursor: "pointer", color: "#fff", alignItems: "center" }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, border: "2px solid " + (consent ? teal : "rgba(255,255,255,.3)"), background: consent ? teal : "transparent", display: "grid", placeItems: "center", color: "#06231d", fontWeight: 800 }}>{consent ? "✓" : ""}</span>
      <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>I agree to Anchor's guardian terms &amp; the student's privacy.</span>
    </button>
    {err && <div className="circle-err">{err}</div>}
    <button className="btn btn-lg" disabled={!consent || busy} onClick={connect} style={{ width: "100%", marginTop: 14, background: consent ? teal : "rgba(255,255,255,.12)", color: consent ? "#06231d" : "rgba(255,255,255,.4)", border: "none", fontWeight: 800 }}>{busy ? "Connecting…" : "Connect securely 🔗"}</button>
  </>);

  // Dashboard
  if (err) return wrap(<ErrorState title="Couldn't load the dashboard" code={err} onRetry={() => loadDash(token)}/>);
  if (!dash) return wrap(<div style={{ textAlign: "center", padding: "80px 0" }}><div className="dash-spinner"/></div>);
  const s = dash.stats || {}; const confirmed = dash.confirmed || []; const dates = weekDates();
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const roleLabel = (dash.role || role || "guardian").toUpperCase();
  const first = (dash.student.name || "").split(" ")[0];
  const confirmTitle = dash.role === "teacher" ? "Verify school conduct" : (dash.role === "mentor" ? "Confirm weekly discipline" : "Confirm home discipline");
  return wrap(<>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div><div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", color: teal }}>{roleLabel} PORTAL</div><h2 style={{ font: "800 22px var(--font-display,sans-serif)", margin: "3px 0 0" }}>Anchor Circle</h2></div>
      <button className="circle-back" onClick={unlink} aria-label="Sign out">⎋</button>
    </div>
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, padding: 18, marginTop: 20 }}>
      <div style={{ width: 54, height: 54, borderRadius: 16, background: "radial-gradient(circle at 35% 28%,#7fb0ff,#2f6fd0)", display: "grid", placeItems: "center", font: "800 24px var(--font-display,sans-serif)" }}>{(dash.student.name || "?").charAt(0)}</div>
      <div style={{ flex: 1 }}><div style={{ font: "800 19px var(--font-display,sans-serif)" }}>{dash.student.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,.68)" }}>Streak {s.streak} · best {s.longestStreak}</div></div>
      <div style={{ textAlign: "right" }}><div style={{ font: "700 16px var(--font-mono,monospace)", color: "#ffce54" }}>🔥 {s.streak}</div><div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>DAY STREAK</div></div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
      {[[s.avgSystems, "avg systems", teal], [s.reflections, "reflections", "#7fb0ff"], [(s.conduct || 0) + "%", "conduct", "#ffce54"]].map((t, i) => (
        <div key={i} style={{ ...card, padding: "15px 12px", textAlign: "center" }}><div style={{ font: "800 22px var(--font-display,sans-serif)", color: t[2] }}>{t[0]}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,.66)", marginTop: 2 }}>{t[1]}</div></div>
      ))}
    </div>
    <div style={{ borderRadius: 18, padding: 16, marginTop: 16, background: s.atRisk ? "rgba(255,120,120,.1)" : "rgba(94,224,192,.1)", border: "1px solid " + (s.atRisk ? "rgba(255,120,120,.3)" : "rgba(94,224,192,.3)") }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".14em", color: s.atRisk ? "#ff8a8a" : teal }}>{s.atRisk ? "⚠ NEEDS SUPPORT" : "✓ ON TRACK"} · {String(s.trend || "").toUpperCase()}</div>
      <p style={{ fontSize: 14, lineHeight: 1.5, margin: "8px 0 0", color: "rgba(255,255,255,.85)" }}>{dash.suggestion}</p>
    </div>
    <div style={{ marginTop: 20 }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".16em", color: "rgba(255,255,255,.6)", marginBottom: 10 }}>SYSTEMS HELD THIS WEEK</div>
      <div style={{ display: "flex", gap: 8 }}>{(s.weekBars || []).map((b, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ width: "100%", height: 60, borderRadius: 9, background: "rgba(255,255,255,.07)", display: "flex", alignItems: "flex-end", overflow: "hidden" }}><div style={{ width: "100%", height: b.pct + "%", background: "linear-gradient(180deg,#5ee0c0,#2f6fd0)", borderRadius: 9 }}/></div>
          <span className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>{dayLabels[i]}</span>
        </div>
      ))}</div>
    </div>
    <div style={{ ...card, padding: 18, marginTop: 20, background: "linear-gradient(140deg,rgba(94,224,192,.14),rgba(47,111,208,.16))" }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{confirmTitle}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)", marginTop: 3 }}>Mark the days conduct met expectations.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>{dates.map((date, i) => { const on = confirmed.includes(date); return (
        <button key={date} onClick={() => toggleDay(date)} className="mono" style={{ flex: 1, aspectRatio: "1", borderRadius: 11, background: on ? teal : "rgba(255,255,255,.06)", border: "1px solid " + (on ? teal : "rgba(255,255,255,.12)"), color: on ? "#06231d" : "rgba(255,255,255,.6)", cursor: "pointer", fontWeight: 700 }}>{dayLabels[i]}</button>
      ); })}</div>
    </div>
    <div style={{ marginTop: 20 }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".16em", color: "rgba(255,255,255,.6)", marginBottom: 10 }}>LEAVE A WEEKLY REMARK</div>
      <textarea value={remark} onChange={e => setRemark(e.target.value)} placeholder="A word of encouragement or an honest observation…" style={{ width: "100%", minHeight: 84, resize: "none", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, color: "#fff", font: "500 14px/1.5 var(--font-body,sans-serif)", padding: "14px 15px", outline: "none" }}/>
      <button className="btn btn-lg" onClick={sendRemark} disabled={!remark.trim()} style={{ width: "100%", marginTop: 10, background: teal, color: "#06231d", border: "none", fontWeight: 800 }}>Send to {first} →</button>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
      <button onClick={downloadReport} style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", cursor: "pointer", color: "#fff" }}><span>📄</span><span style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 14 }}>Download weekly report</span><span aria-hidden="true">↓</span></button>
      <button onClick={unlink} style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", borderRadius: 15, background: "rgba(255,90,90,.08)", border: "1px solid rgba(255,120,120,.22)", cursor: "pointer", color: "#ff8a8a" }}><span>⛓️‍💥</span><span style={{ flex: 1, textAlign: "left", fontWeight: 700, fontSize: 14 }}>Sign out of this device</span></button>
    </div>
    <p style={{ textAlign: "center", fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,.55)", margin: "20px 0 0" }}>Read-only connection · private reflections, notes &amp; coach chats are never shared.</p>
  </>);
}

Object.assign(window, { MediaPage, ParentsPage, VolunteersPage, JoinPage, ContactPage, MentorsPage, SummerProfilePage, FAQList, MentorApplySection, MediaModal, CirclePortal });
