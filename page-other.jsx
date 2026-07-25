/* ================================================================
   NGG — Media + Parents + Volunteers + Join
   ================================================================ */

/* Whole years from an ISO date-of-birth (YYYY-MM-DD) to today. Returns -1 for
   an empty/invalid/future date. Shared by the volunteer + apply intake forms so
   date-of-birth is validated the same way the backend validates it. */
function dobToAge(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return -1;
  const b = new Date(iso + "T00:00:00Z");
  if (isNaN(b.getTime())) return -1;
  const now = new Date();
  if (b.getTime() > now.getTime()) return -1;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

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

      {/* Press & partnerships — honest CTA, not invented coverage. */}
      <section className="section" style={{background:"var(--cream-50)"}}>
        <div className="container">
          <SectionHead eyebrow="PRESS & PARTNERSHIPS" title="Telling this story with us." />
          <div className="card" style={{padding:"28px 26px", maxWidth:640}}>
            <p style={{color:"var(--ink-700)", fontSize:16, lineHeight:1.7, margin:"0 0 14px"}}>
              We're a young movement building in public. If you're a journalist, a partner, or an organisation that wants to amplify what African teenagers can do, we'd love to talk — and we'll only ever point to coverage that's real.
            </p>
            <a className="btn btn-primary" href={"mailto:" + (typeof CONTACT !== "undefined" ? CONTACT.email : "next@afrovanguard.org.ng") + "?subject=Press%20%26%20partnerships"}>Reach the team →</a>
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
      aria-label={item.label + " — preview coming soon, screened at Saturday sessions"}
      style={{display:"flex", flexDirection:"column", gap:10, background:"none", border:"none", padding:0, textAlign:"left", cursor:"pointer", fontFamily:"inherit", width:"100%"}}
    >
      <div style={{position:"relative", borderRadius:18, overflow:"hidden", aspectRatio: big ? "16/9" : "4/3"}}>
        <Photo name={kindImg} ratio="auto" style={{height:"100%", borderRadius:0}}/>
        <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, transparent 30%, rgba(12,20,50,0.78) 100%)"}}/>
        <div style={{position:"absolute", top:14, left:14, display:"flex", gap:8, alignItems:"center"}}>
          <span className={"chip " + kindColor}>{item.kind}</span>
          {!item.url && <span className="chip" style={{background:"rgba(12,20,50,0.72)", color:"#fff", fontSize:10, letterSpacing:"0.12em"}}>SOON</span>}
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
        {item.url ? (
          <div className="media-modal-stage" style={{ padding: 0 }}>
            {/\.(mp4|webm|ogg)(\?|$)/i.test(item.url)
              ? <video src={item.url} controls autoPlay playsInline style={{ width: "100%", height: "100%", background: "#000" }}/>
              : <iframe src={item.url} title={item.label} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width: "100%", height: "100%", border: 0, background: "#000" }}/>}
          </div>
        ) : (
        <div className="media-modal-stage">
          <div className="media-modal-stage-inner">
            <div className="media-modal-mark" aria-hidden="true">▶</div>
            <div className="mono" style={{fontSize:11, letterSpacing:"0.18em", color:"rgba(255,255,255,0.75)", marginTop:14}}>
              {item.kind.toUpperCase()} · {item.meta}
            </div>
            <div style={{fontFamily:"var(--font-display)", fontSize:28, fontWeight:700, lineHeight:1.15, marginTop:10, maxWidth:520}}>{item.label}</div>
            <p style={{color:"rgba(255,255,255,0.7)", marginTop:14, fontSize:14, maxWidth:480, lineHeight:1.5}}>
              This piece is screened live at our Saturday sessions — the recording isn't online yet. Drop your email and we'll send you the link when it goes live.
            </p>
            <div style={{maxWidth:480, marginTop:18}}>
              <NewsletterForm source={"media:" + item.kind}/>
            </div>
          </div>
        </div>
        )}
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
              Register to mentor with NGG here — it's the same mission and the same volunteer pool, run on this site. NGG is part of Afrovanguard's Street-To-Stardom network.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn btn-primary" href="/volunteer" onClick={(e) => { e.preventDefault(); if (window.__navigate) window.__navigate("volunteer"); }}>Register to volunteer →</a>
            {av.orgUrl && <a className="btn btn-ghost" href={av.orgUrl} target="_blank" rel="noopener noreferrer">About Afrovanguard ↗</a>}
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
            <span className="chip chip-on-dark"><span className="dot dot-lime"/> ADMINS · MENTORS · INSTRUCTORS</span>
            <h1 className="display" style={{fontSize:"clamp(56px, 8vw, 124px)", margin:"18px 0 16px", color:"white", lineHeight:0.9}}>
              Join the rebuilding<br/>of <span style={{color:"var(--lime)"}}>the next generation.</span>
            </h1>
            <p style={{fontSize:19, lineHeight:1.5, color:"rgba(255,255,255,0.78)", maxWidth:560, margin:0}}>
              We do not need experts. We need adults who can listen first, model their craft on camera, and stay present for twelve weeks. If that is you, we have a role.
            </p>
            <button
              className="btn btn-lime btn-lg mt-32"
              onClick={() => setPage("volunteer")}
            >Register as a volunteer →</button>
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
          <SectionHead eyebrow="THREE WAYS TO BE USEFUL" title="Pick the shape of your time." />
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14}} className="vol-role-grid">
            {VOLUNTEER_ROLES.map((r, i) => (
              <button key={r.key} className="card vol-role-card" style={{padding:24, minHeight:240, display:"flex", flexDirection:"column", justifyContent:"space-between", textAlign:"left", cursor:"pointer"}}
                onClick={() => { history.replaceState({}, "", "/volunteer?role=" + r.key); setPage("volunteer"); }}>
                <div>
                  <div className="display" style={{fontSize:36, color:"var(--gold-500)"}}>0{i+1}</div>
                  <div style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:22, marginTop:8, lineHeight:1.1}}>{r.name}</div>
                  <div className="mono" style={{fontSize:11, color:"var(--coral)", marginTop:8, letterSpacing:"0.12em"}}>{r.commit.toUpperCase()}</div>
                </div>
                <div style={{fontSize:13, color:"var(--ink-500)", lineHeight:1.4}}>{r.ideal}<span style={{display:"block", marginTop:10, fontWeight:600, color:"var(--navy-900)"}}>Register →</span></div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Programme philosophy — editorial voice, not a fabricated named mentor. */}
      <section className="section" style={{background:"var(--cream-50)"}}>
        <div className="container">
          <div style={{maxWidth:820, margin:"0 auto", textAlign:"center"}}>
            <span className="eyebrow" style={{color:"var(--navy-900)"}}>OUR MENTORING PHILOSOPHY</span>
            <h2 className="display" style={{fontSize:"clamp(32px, 5vw, 64px)", margin:"10px 0 18px", lineHeight:0.98}}>
              "These teenagers do not need rescuing.<br/>They need a room with high ceilings."
            </h2>
            <p style={{fontSize:16, color:"var(--ink-700)", lineHeight:1.6, maxWidth:560, margin:"0 auto"}}>
              The way we mentor: listen first — twice as long as feels reasonable — then ask one hard question. Every volunteer who works with a young person is safeguarding-screened before their first session.
            </p>
          </div>
        </div>
      </section>

      {/* Registration hand-off */}
      <section className="section" style={{paddingTop:0}}>
        <div className="container" style={{maxWidth:760, textAlign:"center"}}>
          <div className="card" style={{padding:"44px 36px"}}>
            <h2 className="display" style={{fontSize:"clamp(28px,4vw,44px)", margin:"0 0 10px"}}>Ready? It takes two minutes.</h2>
            <p style={{color:"var(--ink-500)", fontSize:15, margin:"0 0 22px"}}>One form — pick Admin, Mentor or Instructor, and instructors choose their courses.</p>
            <button className="btn btn-gold btn-lg" onClick={() => setPage("volunteer")}>Register as a volunteer →</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MentorApplySection() {
  const [d, setD] = useState({ firstName: "", lastName: "", otherName: "", sex: "", email: "", phone: "", dob: "", role: VOLUNTEER_ROLES[0] ? VOLUNTEER_ROLES[0].name : "Mentor", why: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (d.firstName.trim() === "" || d.lastName.trim() === "") { setErr("Enter your first and last name."); return; }
    if (!d.sex) { setErr("Select your sex."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) { setErr("Enter a valid email."); return; }
    if (d.phone.trim().length < 7) { setErr("Enter a phone number."); return; }
    const age = dobToAge(d.dob);
    if (d.dob === "" || age < 16 || age > 100) { setErr("Enter a valid date of birth — volunteers must be 16 or older."); return; }
    setBusy(true);
    try {
      await NGGApi.public.apply({
        kind: "mentor",
        firstName: d.firstName.trim(), lastName: d.lastName.trim(), otherName: d.otherName.trim(),
        sex: d.sex,
        email: d.email.trim(), phone: d.phone.trim(), dob: d.dob,
        role: d.role,
        why: d.why.trim(),
      });
      setSent(true);
      if (typeof toast !== "undefined") toast.success("We'll write back within a week.", "Application received");
    } catch (e2) {
      const code = e2.code || e2.message;
      setErr({
        rate_limited: "Too many submissions — wait a few minutes.",
        bad_dob: "Enter a valid date of birth.",
        dob_too_young: "Volunteers must be at least 16 years old.",
        phone_required: "A phone number is required.",
      }[code] || "Couldn't submit right now. Try again in a moment.");
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
                <label style={{color:"rgba(255,255,255,0.8)"}}>First name</label>
                <input value={d.firstName} onChange={e => setD({...d, firstName: e.target.value})} placeholder="e.g. Adaeze" autoComplete="given-name"/>
              </div>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Last name</label>
                <input value={d.lastName} onChange={e => setD({...d, lastName: e.target.value})} placeholder="e.g. Okafor" autoComplete="family-name"/>
              </div>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Other name · optional</label>
                <input value={d.otherName} onChange={e => setD({...d, otherName: e.target.value})} placeholder="Middle name(s)" autoComplete="additional-name"/>
              </div>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Date of birth</label>
                <input type="date" value={d.dob} max={new Date().toISOString().slice(0, 10)} onChange={e => setD({...d, dob: e.target.value})} autoComplete="bday"/>
              </div>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Sex</label>
                <select value={d.sex} onChange={e => setD({...d, sex: e.target.value})}>
                  <option value="" disabled>Select…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Email</label>
                <input type="email" value={d.email} onChange={e => setD({...d, email: e.target.value})} placeholder="you@email.com" autoComplete="email"/>
              </div>
              <div className="field">
                <label style={{color:"rgba(255,255,255,0.8)"}}>Phone</label>
                <input type="tel" value={d.phone} onChange={e => setD({...d, phone: e.target.value})} placeholder="0803 000 0000" autoComplete="tel"/>
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

/* Shared post-submission success card (students + volunteers). Adapts the
   attached "Success" design: accent bar, pulsing check badge, kicker pill,
   reference row, an optional centre WhatsApp/join block, a "what happens next"
   step grid and two CTAs. `actions` is [{label, onClick|href, primary, external}]. */
function ApplySuccessCard({ variant = "application", refCode, whatsapp, centreName, actions = [], footNote }) {
  const cfg = variant === "volunteer" ? {
    kicker: "VOLUNTEER SIGN-UP RECEIVED", title: "Thank you for stepping up.",
    subtitle: "Your registration is in. We'll match you to a centre and role based on the current need, and reply within a week.",
    accent: "#7c4dff", kickerColor: "#5a3fb0", kickerBg: "rgba(124,77,255,0.13)",
    steps: [
      { n: 1, title: "Screening", desc: "A quick safeguarding check, as with every volunteer.", color: "#7c4dff" },
      { n: 2, title: "Placement", desc: "We match you to a centre with the most open need.", color: "#3b5bdb" },
      { n: 3, title: "Welcome call", desc: "A short call to walk through your first session.", color: "#2f9e44" },
    ],
  } : {
    kicker: "APPLICATION RECEIVED", title: "You're in the queue!",
    subtitle: "Thanks for applying. We've received your form and will review it within 5 working days.",
    accent: "#f5b026", kickerColor: "#a07400", kickerBg: "rgba(245,176,38,0.14)",
    steps: [
      { n: 1, title: "Review", desc: "Our team checks eligibility and centre capacity.", color: "#3b5bdb" },
      { n: 2, title: "Confirmation", desc: "You'll get an email with your centre and start date.", color: "#2f9e44" },
      { n: 3, title: "Orientation", desc: "A short welcome session before it all begins.", color: "#a07400" },
    ],
  };
  const sora = "'Sora','Inter',sans-serif", mono = "'JetBrains Mono',ui-monospace,monospace";
  const btnStyle = (primary) => ({ flex: "1 1 auto", whiteSpace: "nowrap", textAlign: "center", fontFamily: "inherit", fontWeight: primary ? 700 : 600, fontSize: 14, padding: "13px 22px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", textDecoration: "none", border: primary ? "none" : "1.5px solid rgba(12,20,50,0.16)", color: primary ? "#0c1432" : "#0a1130", background: primary ? "linear-gradient(135deg,#ffc34d,#f5b026)" : "#fff", boxShadow: primary ? "0 12px 26px -12px rgba(176,124,18,0.7)" : "none" });
  return (
    <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", background: "#fff", border: "1px solid #e5e8ee", borderRadius: 24, padding: "44px 40px 40px", boxShadow: "0 24px 60px -30px rgba(12,20,50,0.28)", position: "relative", textAlign: "left" }}>
      <style>{"@keyframes ascPop{0%{opacity:0;transform:scale(.7)}70%{transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}@keyframes ascPulse{0%{box-shadow:0 0 0 0 rgba(111,220,157,.5)}70%{box-shadow:0 0 0 14px rgba(111,220,157,0)}100%{box-shadow:0 0 0 0 rgba(111,220,157,0)}}.asc-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:620px){.asc-steps{grid-template-columns:1fr}}"}</style>
      <div style={{ height: 5, width: 64, borderRadius: 3, background: cfg.accent, margin: "0 auto 28px" }}/>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#e9f7ee", display: "grid", placeItems: "center", animation: "ascPop .5s cubic-bezier(.2,.8,.2,1), ascPulse 2.4s ease-in-out .5s infinite" }}>
          <i className="ph-fill ph-check-circle" style={{ fontSize: 46, color: "#2f9e44" }}/>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: mono, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: cfg.kickerColor, background: cfg.kickerBg, padding: "5px 12px", borderRadius: 999 }}>{cfg.kicker}</span>
        <h1 style={{ fontFamily: sora, fontWeight: 800, fontSize: "clamp(24px,4vw,32px)", letterSpacing: "-0.02em", lineHeight: 1.15, margin: "16px 0 10px", color: "#0a1130" }}>{cfg.title}</h1>
        <p style={{ color: "#5a6488", fontSize: 15, lineHeight: 1.6, margin: "0 auto", maxWidth: 420 }}>{cfg.subtitle}</p>
      </div>
      {refCode ? (
        <div style={{ background: "#faf6ec", border: "1px solid #e8dec6", borderRadius: 14, padding: "16px 18px", marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.06em", color: "#8088a6" }}>REFERENCE</span>
          <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: "#0a1130" }}>{refCode}</span>
        </div>
      ) : null}
      {whatsapp ? (
        <div style={{ marginTop: 14, background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.4)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <i className="ph-fill ph-whatsapp-logo" style={{ fontSize: 30, color: "#128C3E", flex: "none" }}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: sora, fontWeight: 700, fontSize: 14.5, color: "#0a1130" }}>Join {centreName ? centreName + "'s" : "your centre's"} group</div>
              <div style={{ fontSize: 12.5, color: "#5a6488", marginTop: 1 }}>Timetables, reminders and updates.</div>
            </div>
          </div>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 8, background: "#25D366", color: "#04331b", fontWeight: 800, fontSize: 13.5, padding: "10px 18px", borderRadius: 999, textDecoration: "none" }}><i className="ph-fill ph-whatsapp-logo" style={{ fontSize: 17 }}/> Join</a>
        </div>
      ) : null}
      <h2 style={{ fontFamily: sora, fontWeight: 700, letterSpacing: "0.06em", margin: "30px 0 14px", textTransform: "uppercase", fontSize: 11.5, color: "#5a6488" }}>What happens next</h2>
      <div className="asc-steps">
        {cfg.steps.map(s => (
          <div key={s.n} style={{ border: "1px solid #eef0f4", borderRadius: 14, padding: "16px 14px", textAlign: "left" }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, display: "inline-grid", placeItems: "center", fontFamily: sora, fontWeight: 800, fontSize: 13, color: "#fff", background: s.color }}>{s.n}</span>
            <div style={{ fontFamily: sora, fontWeight: 700, fontSize: 14, color: "#0a1130", marginTop: 12 }}>{s.title}</div>
            <div style={{ fontSize: 12.5, color: "#5a6488", lineHeight: 1.45, marginTop: 5 }}>{s.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 30 }}>
        {actions.map((a, i) => a.href
          ? <a key={i} href={a.href} target={a.external ? "_blank" : undefined} rel={a.external ? "noopener noreferrer" : undefined} style={btnStyle(a.primary)}>{a.label}{a.primary ? <i className="ph ph-arrow-right"/> : null}</a>
          : <button key={i} type="button" onClick={a.onClick} style={btnStyle(a.primary)}>{a.label}{a.primary ? <i className="ph ph-arrow-right"/> : null}</button>
        )}
      </div>
      {footNote ? <p style={{ textAlign: "center", fontFamily: mono, fontSize: 11, color: "#8088a6", margin: "22px 0 0" }}>{footNote}</p> : null}
    </div>
  );
}

function JoinPage({ setPage }) {
  // Restore a saved draft so "we save as you go" is true.
  const [step, setStep] = useState(0);
  const [appRef, setAppRef] = useState("");
  const [appWa, setAppWa] = useState("");
  // Which program the applicant chose (set by the Summer page before it routes
  // here). 'summer' = 6-week on-ramp, 'anchor' = flagship 12-week NGG. Captured
  // once on mount so navigating away and back via the generic Apply link resets.
  const [program] = useState(() => {
    const p = (typeof window !== "undefined" && window.__nggProgram === "summer") ? "summer" : "anchor";
    if (typeof window !== "undefined") window.__nggProgram = null;
    return p;
  });
  const isSummer = program === "summer";
  const [restored, setRestored] = useState(false);
  const [data, setData] = useState(() => {
    const base = { firstName: "", lastName: "", otherName: "", sex: "", dob: "", city: "Egbeda", track: "Music", why: "", parentEmail: "", parentPhone: "", photoUrl: "" };
    try {
      const saved = JSON.parse(localStorage.getItem(JOIN_DRAFT_KEY) || "null");
      if (saved && typeof saved === "object") return Object.assign(base, saved);
    } catch (_) {}
    return base;
  });
  // Announce (once, on mount) that we restored a non-empty saved draft, so the
  // "save as you go" promise is visible rather than silent.
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(JOIN_DRAFT_KEY) || "null");
      if (saved && (saved.firstName || saved.name || saved.why || saved.parentEmail || saved.photoUrl)) setRestored(true);
    } catch (_) {}
  }, []);
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState("");
  const steps = ["Identity", "Track", "Story", "Parent"];
  const session = useSession();
  const applyEyebrow = isSummer
    ? "APPLY · SUMMER STUDENTS"
    : (session ? "APPLY · " + sessionLabel(session, "NEXT SESSION").toUpperCase() : "APPLY · NEXT SESSION");

  // Jump back to an already-completed step (photo capture is handled by the
  // shared <PhotoCapture> in step 0 — there is no separate upload path here).
  const goToStep = (i) => { if (i < step) { setFieldErr(""); setStep(i); } };

  // Persist draft on every change (cleared on successful submit).
  React.useEffect(() => {
    try { localStorage.setItem(JOIN_DRAFT_KEY, JSON.stringify(data)); } catch (_) {}
  }, [data]);

  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

  function validate(s) {
    if (s === 0) {
      if (data.firstName.trim() === "") return "Enter the applicant's first name.";
      if (data.lastName.trim() === "") return "Enter the applicant's last name.";
      if (data.dob === "") return "Select the applicant's date of birth.";
      const age = dobToAge(data.dob);
      if (age < 10 || age > 17) return "Applicants must be between 10 and 17 years old.";
      if (!data.sex) return "Select the applicant's sex.";
      if (!data.photoUrl) return "Add a headshot — take or upload a photo to continue.";
    }
    if (s === 2 && data.why.trim().length < 20) {
      return "Give us at least a sentence or two — 20 characters minimum.";
    }
    if (s === 3) {
      if (!emailOk(data.parentEmail)) return "Enter a valid parent or guardian email.";
      if (data.parentPhone.trim().length < 7) return "Enter a parent or guardian phone number.";
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
      const r = await NGGApi.public.apply({
        kind: "teen",
        program: program,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        otherName: data.otherName.trim(),
        sex: data.sex,
        dob: data.dob,
        centre: data.city,
        track: data.track,
        why: data.why.trim(),
        email: data.parentEmail.trim(),
        phone: data.parentPhone.trim(),
        photoUrl: data.photoUrl || "",
      });
      setAppRef((r && r.ref) || "");
      setAppWa((r && r.whatsapp) || "");
      try { localStorage.removeItem(JOIN_DRAFT_KEY); } catch (_) {}
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const code = e.code || e.message;
      const map = {
        rate_limited: "Too many submissions from this connection — wait a few minutes and try again.",
        applications_closed: "Applications are closed right now. Check back soon.",
        bad_email: "That parent email doesn't look right.",
        bad_age: "Applicants must be between 10 and 17 years old.",
        bad_dob: "Select a valid date of birth.",
        bad_sex: "Select the applicant's sex.",
        photo_required: "A headshot is required — add a photo and try again.",
        phone_required: "A parent or guardian phone number is required.",
        bad_firstName: "Enter the applicant's first name.",
        bad_lastName: "Enter the applicant's last name.",
        bad_name: "Enter the applicant's full name.",
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

          {restored && (
            <div role="status" style={{display:"flex", alignItems:"center", gap:12, justifyContent:"space-between", marginBottom:20, padding:"12px 16px", borderRadius:12, background:"rgba(245,176,38,0.14)", border:"1px solid rgba(245,176,38,0.4)", fontSize:14, color:"var(--ink-900)"}}>
              <span>↩︎ We saved your progress — pick up where you left off.</span>
              <button type="button" onClick={() => { try { localStorage.removeItem(JOIN_DRAFT_KEY); } catch (_) {} setData({ firstName: "", lastName: "", otherName: "", sex: "", dob: "", city: "Egbeda", track: "Music", why: "", parentEmail: "", parentPhone: "", photoUrl: "" }); setStep(0); setRestored(false); }} className="mono" style={{background:"none", border:"none", cursor:"pointer", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-500)", fontWeight:600}}>Start fresh</button>
            </div>
          )}

          {/* Stepper */}
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:32, padding:"0 12px"}}>
            {steps.map((s, i) => {
              const done = i < step;
              return (
              <React.Fragment key={s}>
                <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:8, flex:"0 0 auto"}}>
                  <button
                    type="button"
                    onClick={() => goToStep(i)}
                    disabled={!done}
                    aria-label={done ? ("Go back to step " + (i + 1) + ": " + s) : ("Step " + (i + 1) + ": " + s + (i === step ? " (current)" : ""))}
                    aria-current={i === step ? "step" : undefined}
                    style={{
                    width:42, height:42, borderRadius:"50%", padding:0,
                    background: done ? "var(--navy-900)" : i === step ? "var(--gold-500)" : "var(--cream-100)",
                    color: i <= step ? (i === step ? "var(--navy-900)" : "white") : "var(--ink-400)",
                    display:"grid", placeItems:"center", fontWeight:700, fontFamily:"var(--font-display)", fontSize:18,
                    border: i === step ? "2px solid var(--navy-900)" : "none",
                    cursor: done ? "pointer" : "default",
                  }}>
                    {done ? "✓" : i + 1}
                  </button>
                  <div className="mono" style={{fontSize:10, letterSpacing:"0.15em", textTransform:"uppercase", fontWeight: i === step ? 700 : 400, color: i === step ? "var(--navy-900)" : "var(--ink-500)"}}>
                    {s}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div style={{flex:1, height:2, background: i < step ? "var(--navy-900)" : "var(--cream-200)", margin:"-22px 12px 0"}}/>
                )}
              </React.Fragment>
            );})}
          </div>

          <div className="card" style={{padding:48, minHeight:380}}>
            {step === 0 && (
              <div style={{display:"flex", flexDirection:"column", gap:18}}>
                <h2 style={{fontFamily:"var(--font-display)", fontSize:32, margin:0, letterSpacing:"-0.02em"}}>Who is applying?</h2>
                <p style={{color:"var(--ink-500)", margin:0}}>Use the applicant's legal names as they'd appear on a Genius ID card. You can change them later.</p>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:14}}>
                  <div className="field">
                    <label>First name</label>
                    <input value={data.firstName} onChange={e => setData({...data, firstName: e.target.value})} autoComplete="given-name" placeholder="e.g. Adaeze"/>
                  </div>
                  <div className="field">
                    <label>Last name</label>
                    <input value={data.lastName} onChange={e => setData({...data, lastName: e.target.value})} autoComplete="family-name" placeholder="e.g. Okafor"/>
                  </div>
                  <div className="field">
                    <label>Other name · optional</label>
                    <input value={data.otherName} onChange={e => setData({...data, otherName: e.target.value})} autoComplete="additional-name" placeholder="Middle name(s)"/>
                  </div>
                  <div className="field">
                    <label>Date of birth</label>
                    <input type="date" value={data.dob} max={new Date().toISOString().slice(0, 10)} onChange={e => setData({...data, dob: e.target.value})} autoComplete="bday"/>
                  </div>
                  <div className="field">
                    <label>Sex</label>
                    <select value={data.sex} onChange={e => setData({...data, sex: e.target.value})}>
                      <option value="" disabled>Select…</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="field" style={{gridColumn:"1 / -1"}}>
                    <label>Which centre is closest to you?</label>
                    <select value={data.city} onChange={e => setData({...data, city: e.target.value})}>
                      <option value="Egbeda">CACENTRE Egbeda</option>
                      <option value="Ayobo">CACENTRE Ayobo</option>
                      <option value="Other">Neither — I'll travel</option>
                    </select>
                  </div>
                </div>
                {/* Headshot — the site takes the picture (camera-first), with
                    upload + paste-link as fallbacks. Optional at application. */}
                <div style={{marginTop:6}}>
                  <PhotoCapture value={data.photoUrl} onChange={(url) => setData(d => ({ ...d, photoUrl: url }))} size={64} label="A friendly headshot (required)"/>
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
                <p style={{color:"var(--ink-500)", margin:0}}>In 3 sentences: what would you build with {isSummer ? "six" : "twelve"} uninterrupted weeks?</p>
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
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
                  <div className="field">
                    <label>Parent / guardian email</label>
                    <input type="email" value={data.parentEmail} onChange={e => setData({...data, parentEmail: e.target.value})} autoComplete="email" placeholder="parent@example.com"/>
                  </div>
                  <div className="field">
                    <label>Parent / guardian phone</label>
                    <input type="tel" value={data.parentPhone} onChange={e => setData({...data, parentPhone: e.target.value})} autoComplete="tel" placeholder="0803 000 0000"/>
                  </div>
                </div>
                <div className="card" style={{padding:18, background:"var(--cream-50)", border:"1px solid var(--cream-200)"}}>
                  <div className="eyebrow" style={{color:"var(--ink-500)"}}>APPLICATION SUMMARY</div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14, marginTop:12, fontSize:14}}>
                    <div><b>Name</b><br/>{[data.firstName, data.otherName, data.lastName].filter(Boolean).join(" ") || "—"}</div>
                    <div><b>Age</b><br/>{data.dob ? dobToAge(data.dob) : "—"}</div>
                    <div><b>Centre</b><br/>{data.city}</div>
                    <div><b>Track</b><br/>{data.track}</div>
                  </div>
                </div>
              </div>
            )}
            {step === 4 && (
              <div style={{ padding: "20px 0 8px" }}>
                <ApplySuccessCard
                  variant="application"
                  refCode={appRef}
                  whatsapp={appWa}
                  centreName={data.city}
                  footNote="A confirmation has been sent to your parent/guardian's email."
                  actions={[
                    ...(appRef ? [{ label: "Check application status", onClick: () => setPage("contact"), primary: true }] : []),
                    { label: "Back to home", onClick: () => setPage("home") },
                  ]}
                />
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
              <ApplicationStatusLookup/>
              <DonateWidget/>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* Donate — Paystack checkout (hides itself when donations aren't configured). */
function DonateWidget() {
  const [d, setD] = useState({ amount: "5000", name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
  const give = async (e) => {
    e && e.preventDefault();
    if (!emailOk(d.email) || (parseInt(d.amount, 10) || 0) < 100) return;
    setBusy(true);
    try {
      const r = await NGGApi.public.donate({ email: d.email.trim(), name: d.name.trim(), amount: parseInt(d.amount, 10) });
      if (r.authorizationUrl) window.location.href = r.authorizationUrl;
    } catch (ex) {
      if ((ex.code || ex.message) === "donations_unavailable") { setHidden(true); return; }
      if (typeof toast !== "undefined") toast.error("Couldn't start the donation. Please try again.", "Donate");
    } finally { setBusy(false); }
  };
  if (hidden) return null;
  return (
    <div className="card" style={{ padding: 24, background: "var(--navy-900)", color: "#fff" }}>
      <div className="eyebrow" style={{ color: "var(--gold-400)" }}>SUPPORT THE MISSION</div>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", margin: "12px 0 14px", lineHeight: 1.5 }}>Back the next generation — every naira funds a Saturday.</p>
      <form onSubmit={give} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["2000", "5000", "10000"].map(a => <button type="button" key={a} onClick={() => setD(o => ({ ...o, amount: a }))} className={"btn btn-sm " + (d.amount === a ? "btn-gold" : "btn-on-dark-ghost")}>₦{Number(a).toLocaleString()}</button>)}
        </div>
        <input className="admin-input" type="number" min="100" value={d.amount} onChange={e => setD(o => ({ ...o, amount: e.target.value }))} placeholder="Amount (₦)" style={{ padding: 10, borderRadius: 8, border: "none" }}/>
        <input className="admin-input" value={d.name} onChange={e => setD(o => ({ ...o, name: e.target.value }))} placeholder="Your name (optional)" style={{ padding: 10, borderRadius: 8, border: "none" }}/>
        <input className="admin-input" type="email" value={d.email} onChange={e => setD(o => ({ ...o, email: e.target.value }))} placeholder="Email for your receipt" style={{ padding: 10, borderRadius: 8, border: "none" }}/>
        <button className="btn btn-gold" disabled={busy || !emailOk(d.email)}>{busy ? "Starting…" : "Donate securely →"}</button>
      </form>
    </div>
  );
}

/* Applicant self-service: check the status of an application/message by ref. */
function ApplicationStatusLookup() {
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const check = async (e) => {
    e && e.preventDefault();
    setErr(""); setRes(null); setBusy(true);
    try { const r = await NGGApi.public.applicationStatus(ref.trim().toUpperCase(), email.trim()); setRes(r); }
    catch (ex) {
      const map = { bad_ref: "That reference doesn't look right (e.g. NGG-A-00042).", bad_email: "Enter the email you applied with.", not_found: "No match — check the reference and email." };
      setErr(map[ex.code || ex.message] || "Couldn't look that up.");
    } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ color: "var(--gold-500)" }}>CHECK YOUR STATUS</div>
      <p style={{ fontSize: 14, color: "var(--ink-700)", margin: "12px 0 14px", lineHeight: 1.5 }}>
        Quote your reference (e.g. <span className="mono">NGG-A-00042</span>) and the email you used.
      </p>
      <form onSubmit={check} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input className="admin-input" value={ref} onChange={e => setRef(e.target.value)} placeholder="Reference (NGG-A-…)" style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)" }}/>
        <input className="admin-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email you applied with" style={{ padding: 10, borderRadius: 8, border: "1px solid rgba(12,20,50,0.15)" }}/>
        <button className="btn btn-primary btn-sm" disabled={busy || !ref.trim() || !email.trim()}>{busy ? "Checking…" : "Check status"}</button>
      </form>
      {err && <p style={{ color: "var(--coral)", fontSize: 13, marginTop: 10 }}>{err}</p>}
      {res && <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--cream-50)", borderRadius: 10 }}>
        <div style={{ fontWeight: 700 }}>{res.label}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>Submitted {new Date(res.submittedAt).toLocaleDateString()}</div>
      </div>}
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
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("volunteer")}>Register to volunteer →</button>
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
// Staff-only "mark present" on a person's page. This is what makes the QR aid
// attendance even when a normal phone camera (an unconfigured device) opens the
// profile URL instead of the kiosk scanner: a signed-in staffer taps once here.
/* Scanned your own ID card? Jump straight into the Community with the QR
   token as the credential (no password needed). */
function ProfileCommunityCTA({ token, name }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const enter = async () => {
    setBusy(true); setErr("");
    try { await NGGApi.auth.studentLogin({ token }); window.location.href = "/community"; }
    catch (e) { setErr("Couldn't sign you in from this card."); setBusy(false); }
  };
  return (
    <div className="card" style={{ padding: 20, marginBottom: 20, background: "var(--navy-900,#0c1432)", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18 }}>Enter the Community</div>
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>Signed in as {name} · from your ID card. {err && <span style={{ color: "#ffb3b3" }}>{err}</span>}</div>
      </div>
      <button className="btn btn-gold" disabled={busy} onClick={enter}>{busy ? "…" : "Enter →"}</button>
    </div>
  );
}

function ProfileCheckin({ token, name }) {
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState(null);
  const go = async () => {
    if (busy) return; setBusy(true);
    try { const r = await NGGApi.admin.summer.checkin(token, "profile", "profile-scan"); setRes({ ok: true, already: !!r.already }); }
    catch (e) { setRes({ err: (e.code === "student_not_found" ? "Not assigned to anyone yet." : e.code === "qr_unassigned" ? "This card isn't assigned yet." : "Couldn't mark present — try again.") }); }
    finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ padding: 18, marginBottom: 20, border: "1px solid var(--gold-500)", background: "rgba(245,176,38,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: ".12em", color: "var(--ink-500)" }}>STAFF · ATTENDANCE</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>Mark {(name || "this person").trim().split(/\s+/)[0]} present today</div>
        </div>
        {res && res.ok
          ? <span className="chip chip-lime">{res.already ? "↻ Already marked today" : "✓ Marked present"}</span>
          : <button className="btn btn-gold" disabled={busy} onClick={go}>{busy ? "Marking…" : "Mark present"}</button>}
      </div>
      {res && res.err && <div style={{ marginTop: 10, color: "var(--coral)", fontSize: 13 }}>{res.err}</div>}
    </div>
  );
}

function SummerProfilePage({ setPage }) {
  const [state, setState] = React.useState({ loading: true, profile: null, token: "" });
  // Called unconditionally (hooks rule) — lets a signed-in staffer mark this
  // person present straight from the page they land on after a phone-camera scan.
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  React.useEffect(() => {
    const parts = (window.location.pathname || "").split("/").filter(Boolean);
    const kind = parts[0], id = decodeURIComponent(parts[1] || "");
    const req = kind === "s" ? NGGApi.public.summerProfile({ handle: id }) : NGGApi.public.summerProfile({ token: id });
    req.then(r => setState({ loading: false, profile: r.profile, token: kind === "q" ? id : ((r.profile && r.profile.token) || "") }))
       .catch(() => setState({ loading: false, profile: null, token: "" }));
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
  const isVol = m.kind === "volunteer";
  const initials = (m.fullName || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const title = isVol ? (m.role ? m.role.charAt(0).toUpperCase() + m.role.slice(1) : "Volunteer") : (m.track ? m.track : "Summer student");
  const chips = [];
  if (!isVol && m.track) chips.push(m.track);
  if (isVol && m.faculty) chips.push(m.faculty);
  (m.courses || []).forEach(c => chips.push(c));
  if (m.cohortId && !isVol) chips.push(m.cohortId);
  const tiles = isVol
    ? [
        { label: "Sessions", value: m.attendanceCount || 0, hint: "Checked in" },
        { label: "Hours", value: typeof m.hours === "number" ? m.hours : "—", hint: "Service" },
        { label: "Level", value: m.game ? m.game.level : "—", hint: m.game ? m.game.levelName : "Standing" },
        { label: "Streak", value: m.game ? m.game.streak + "d" : "—", hint: "Daily" },
      ]
    : [
        { label: "Days present", value: m.attendanceCount || 0, hint: "This cohort" },
        { label: "Track", value: m.track || "—", hint: "Craft" },
        { label: "Centre", value: m.centre || "—", hint: "Home base" },
        { label: "Cohort", value: m.cohortId || "—", hint: "Class" },
      ];
  // Milestones — REAL, earned achievements derived from attendance + (for
  // volunteers) the service game. Only earned badges are shown, so the grid is
  // always factual; nothing is fabricated.
  const ac = m.attendanceCount || 0;
  const milestones = [];
  if (ac >= 1) milestones.push({ icon: "ph-flag-checkered", color: "#2f9e44", bg: "rgba(47,158,68,0.13)", label: "First check-in" });
  if (ac >= 5) milestones.push({ icon: "ph-calendar-check", color: "#3b5bdb", bg: "rgba(59,91,219,0.13)", label: "5 " + (isVol ? "sessions" : "days") });
  if (ac >= 10) milestones.push({ icon: "ph-medal", color: "#a07400", bg: "rgba(245,176,38,0.16)", label: "10 " + (isVol ? "sessions" : "days") });
  if (ac >= 20) milestones.push({ icon: "ph-trophy", color: "#c0361c", bg: "rgba(224,49,49,0.11)", label: "20 " + (isVol ? "sessions" : "days") });
  if (isVol && m.game) {
    if ((m.game.streak || 0) >= 5) milestones.push({ icon: "ph-fire", color: "#c0361c", bg: "rgba(224,49,49,0.11)", label: m.game.streak + "-day streak" });
    if ((m.game.level || 0) >= 3) milestones.push({ icon: "ph-star", color: "#6a3fc0", bg: "rgba(106,63,192,0.13)", label: "Level " + m.game.level });
    (m.game.awards || []).forEach(a => milestones.push({ icon: "ph-seal-check", color: "#7c4dff", bg: "rgba(124,77,255,0.13)", label: a.name }));
  }
  return (
    <div className="page" data-screen-label="Summer profile">
      <section className="section" style={{ paddingTop: 24, paddingBottom: 8 }}>
        <div className="container" style={{ maxWidth: 900 }}>
          {/* Cover banner */}
          <div style={{ height: 150, borderRadius: 18, background: "var(--grad-hero, linear-gradient(158deg,#0c1432,#16224e 58%,#1d2c63))", position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "var(--grad-hero-glow, radial-gradient(46% 60% at 88% 6%, rgba(245,176,38,0.22), transparent 62%))" }}/>
          </div>
          {/* Avatar + identity, overlapping the cover */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: -46, padding: "0 8px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
              <div style={{ width: 104, height: 104, borderRadius: "50%", overflow: "hidden", border: "4px solid #fff", boxShadow: "0 6px 16px -8px rgba(12,20,50,0.35)", flexShrink: 0, background: "var(--navy-700)", display: "grid", placeItems: "center" }}>
                {m.photoUrl
                  ? <img src={m.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }}/>
                  : <span aria-hidden="true" className="display" style={{ fontWeight: 800, fontSize: 34, color: "var(--gold-500)" }}>{initials}</span>}
              </div>
              <div style={{ paddingBottom: 8 }}>
                <h1 className="display" style={{ fontSize: "clamp(24px,4vw,32px)", letterSpacing: "-0.02em", margin: 0, color: "var(--ink-900)" }}>{m.fullName}</h1>
                <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4 }}>{m.handle ? "@" + m.handle + " · " : ""}{m.centre || (isVol ? "Volunteer" : "Summer School")}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 8 }}>
              <span className="chip"><span className="dot dot-gold"/> {isVol ? "VOLUNTEER" + (m.role ? " · " + m.role.toUpperCase() : "") : "SUMMER SCHOOL"}</span>
              {isVol && (m.safeguardingCleared
                ? <span className="chip chip-lime">✓ SAFEGUARDING CLEARED</span>
                : <span className="chip">SCREENING PENDING</span>)}
            </div>
          </div>
          {/* Title + chips */}
          <div style={{ padding: "0 8px" }}>
            <div style={{ fontSize: 15, color: "var(--crimson, #c0361c)", fontWeight: 600, marginTop: 16 }}>{title}</div>
            {chips.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {chips.map((c, i) => <span key={i} className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", padding: "5px 11px", borderRadius: 999, background: "rgba(28,42,94,0.06)", color: "var(--ink-700)" }}>{c}</span>)}
              </div>
            )}
          </div>
          {/* Real stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginTop: 24 }}>
            {tiles.map((t, i) => (
              <div key={i} className="card" style={{ padding: 20 }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-400)" }}>{t.label}</div>
                <div className="display" style={{ fontWeight: 800, fontSize: 34, lineHeight: 1, marginTop: 8, color: "var(--ink-900)" }}>{t.value}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 6 }}>{t.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container" style={{ maxWidth: 900 }}>
          {auth && auth.isSignedIn && (auth.isAdmin || (auth.hasCap && (auth.hasCap("summer") || auth.hasCap("people")))) && state.token
            ? <ProfileCheckin token={state.token} name={m.fullName}/> : null}
          {!isVol && state.token && !(auth && auth.isSignedIn)
            ? <ProfileCommunityCTA token={state.token} name={m.fullName}/> : null}
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
              <h2 className="display" style={{ fontSize: 28, margin: 0 }}>Attendance</h2>
              <div style={{ display: "flex", gap: 26, alignItems: "baseline" }}>
                <div><span className="display" style={{ fontSize: 40, color: "var(--gold-500)" }}>{m.attendanceCount || 0}</span> <span className="mono" style={{ color: "var(--ink-500)", fontSize: 12 }}>{m.kind === "volunteer" ? "SESSIONS" : "DAYS PRESENT"}</span></div>
                {m.kind === "volunteer" && typeof m.hours === "number" && <div><span className="display" style={{ fontSize: 40, color: "var(--navy-900)" }}>{m.hours}</span> <span className="mono" style={{ color: "var(--ink-500)", fontSize: 12 }}>HOURS</span></div>}
              </div>
            </div>
            {att.length === 0
              ? <p style={{ color: "var(--ink-500)", marginTop: 12 }}>No check-ins recorded yet.</p>
              : <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                  {att.map((a, i) => <span key={i} className="chip chip-lime" title={a.checkInAt}>{a.date}</span>)}
                </div>}
          </div>

          {/* Milestones — real, earned achievements (attendance + service game). */}
          {milestones.length > 0 && (
            <div className="card" style={{ padding: 28, marginTop: 20 }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-500)" }}>Milestones · {milestones.length}</div>
              <h2 className="display" style={{ fontSize: 22, margin: "8px 0 20px" }}>Earned along the way.</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 14 }}>
                {milestones.map((b, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
                    <span style={{ width: 52, height: 52, borderRadius: 14, display: "grid", placeItems: "center", fontSize: 24, background: b.bg, color: b.color }}><i className={"ph-fill " + b.icon}/></span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-500)", lineHeight: 1.3 }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Public projects — curated, real work (admin-managed). */}
          {(m.projects || []).length > 0 && (
            <div className="card" style={{ padding: 28, marginTop: 20 }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-500)" }}>Public projects · {m.projects.length}</div>
              <h2 className="display" style={{ fontSize: 22, margin: "8px 0 20px" }}>What I've put into the world.</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
                {m.projects.map(pr => {
                  const inner = (<>
                    {pr.imageUrl ? <div style={{ aspectRatio: "4 / 3", borderRadius: 12, overflow: "hidden", background: "var(--cream-100, #f3ecdb)" }}><img src={pr.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }}/></div> : null}
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, color: "var(--ink-900)", marginTop: pr.imageUrl ? 10 : 0, display: "flex", alignItems: "center", gap: 6 }}>{pr.title}{pr.url ? <i className="ph ph-arrow-up-right" style={{ fontSize: 12, color: "var(--ink-400)" }}/> : null}</div>
                    {pr.kind ? <div className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-400)", marginTop: 3 }}>{pr.kind}</div> : null}
                  </>);
                  return pr.url
                    ? <a key={pr.id} href={pr.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit", display: "block" }}>{inner}</a>
                    : <div key={pr.id}>{inner}</div>;
                })}
              </div>
            </div>
          )}

          {/* Mentor notes — only notes an admin marked public reach this page. */}
          {(m.notes || []).length > 0 && (
            <div className="card" style={{ padding: 28, marginTop: 20, background: "var(--navy-900)", color: "#fff", border: "none" }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold-400)" }}>Mentor notes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 18 }}>
                {m.notes.map((n, i) => (
                  <div key={i} style={{ paddingLeft: 14, borderLeft: "2px solid var(--gold-500)" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><b style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5 }}>{n.author || "Mentor"}</b>{n.when ? <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{n.when}</span> : null}</div>
                    <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.78)", margin: "6px 0 0", lineHeight: 1.55 }}>{n.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gamified attendance standing — the in-app award surface (levels,
              points, streak, awards). Mirrors the emailed awards. */}
          {m.kind === "volunteer" && m.game && (
            <div className="card" style={{ padding: 28, marginTop: 20, background: "var(--navy-900)", color: "#fff", border: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div className="eyebrow" style={{ color: "var(--gold-400)" }}>ATTENDANCE STANDING</div>
                  <h2 className="display" style={{ fontSize: 26, margin: "6px 0 0" }}>Level {m.game.level} · {m.game.levelName}</h2>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="display" style={{ fontSize: 40, color: "var(--gold-400)" }}>{m.game.points}</span>
                  <span className="mono" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginLeft: 6 }}>POINTS</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                <div><b style={{ fontSize: 20 }}>{m.game.streak}</b> <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>DAY STREAK</span></div>
                {m.game.next && (
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{m.game.next.remaining} pts to {m.game.next.name}</div>
                    <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.14)" }}><div style={{ height: "100%", borderRadius: 999, background: "var(--gold-400)", width: Math.min(100, Math.round((m.game.points / m.game.next.at) * 100)) + "%" }}/></div>
                  </div>
                )}
              </div>
              {(m.game.awards || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                  {m.game.awards.map((a, i) => <span key={i} className="chip" style={{ background: "var(--gold-500)", color: "var(--navy-900)", fontWeight: 700 }}>🏅 {a.name}</span>)}
                </div>
              )}
            </div>
          )}

          {/* Volunteer service certificates — verifiable, shareable */}
          {m.kind === "volunteer" && (m.certificates || []).length > 0 && (
            <div className="card" style={{ padding: 28, marginTop: 20 }}>
              <h2 className="display" style={{ fontSize: 24, margin: "0 0 4px" }}>Service certificates</h2>
              <p style={{ color: "var(--ink-500)", fontSize: 14, margin: "0 0 16px" }}>Verifiable proof of your hours — open, print or share the link.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {m.certificates.map(c => (
                  <a key={c.certId} href={"/cert/" + c.certId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderRadius: 14, background: "var(--cream-50, #faf6ec)", border: "1px solid rgba(12,20,50,0.08)", textDecoration: "none", color: "var(--ink-900)" }}>
                    <span><b style={{ fontFamily: "var(--font-display)" }}>{c.milestone} sessions</b> <span style={{ color: "var(--ink-500)" }}>· ≈{c.hours} hours</span></span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--gold-600, #b07c12)" }}>{c.certId} →</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Instructor's own class roster — token + registered email gate */}
          {m.kind === "volunteer" && m.role === "instructor" && (m.courses || []).length > 0 && (
            /* Use the resolved check-in token, not the URL segment — on /s/<handle>
               routes the segment is the handle, which the roster gate rejects. */
            <InstructorRoster token={state.token}/>
          )}
        </div>
      </section>
    </div>
  );
}

/* Instructor's course roster — a private view on the digital ID. Gated by the
   QR token PLUS the instructor's registered email (typed here, never stored),
   so a lost/forwarded card can't expose a class list. First names only. */
function InstructorRoster({ token }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState({ status: "locked", data: null, err: "" });
  const open = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim() || state.status === "loading") return;
    setState({ status: "loading", data: null, err: "" });
    try {
      const r = await NGGApi.public.instructorRoster(token, email.trim());
      setState({ status: "open", data: r, err: "" });
    } catch (e2) {
      const c = e2.code || e2.message;
      setState({ status: "locked", data: null, err: c === "not_authorised" ? "That email doesn't match this card." : "Couldn't open your roster." });
    }
  };
  if (state.status === "open") {
    const d = state.data;
    return (
      <div className="card" style={{ padding: 28, marginTop: 20 }}>
        <h2 className="display" style={{ fontSize: 24, margin: "0 0 4px" }}>Your class{d.courses.length > 1 ? "es" : ""}</h2>
        <p style={{ color: "var(--ink-500)", fontSize: 14, margin: "0 0 16px" }}>{d.courses.join(" · ")} · {d.students.length} student{d.students.length === 1 ? "" : "s"}</p>
        {d.students.length === 0
          ? <p style={{ color: "var(--ink-500)" }}>No verified students in your course{d.courses.length > 1 ? "s" : ""} yet.</p>
          : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.students.map((st, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: st.todayPresent ? "rgba(118,176,67,0.12)" : "var(--cream-50, #faf6ec)" }}>
                  <span><b>{st.firstName}</b> <span className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>· {st.course}</span></span>
                  <span className="mono" style={{ fontSize: 12, color: st.todayPresent ? "var(--lime-700, #4d7a12)" : "var(--ink-500)" }}>{st.todayPresent ? "● in today" : st.days + "d"}</span>
                </div>
              ))}
            </div>}
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 28, marginTop: 20 }}>
      <h2 className="display" style={{ fontSize: 24, margin: "0 0 4px" }}>Instructor view</h2>
      <p style={{ color: "var(--ink-500)", fontSize: 14, margin: "0 0 16px" }}>Confirm your registered email to see today's class roster.</p>
      <form onSubmit={open} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
          style={{ flex: "1 1 220px", padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(12,20,50,0.15)", fontSize: 15, fontFamily: "inherit" }}/>
        <button className="btn btn-primary" disabled={!email.trim() || state.status === "loading"}>{state.status === "loading" ? "Opening…" : "Open roster →"}</button>
      </form>
      {state.err && <p style={{ color: "var(--coral)", fontSize: 14, marginTop: 12, marginBottom: 0 }}>{state.err}</p>}
    </div>
  );
}

/* =================== VOLUNTEER SERVICE CERTIFICATE (public, /cert/<id>) ===== */
function CertificatePage() {
  const [state, setState] = React.useState({ loading: true, cert: null });
  React.useEffect(() => {
    const id = (window.location.pathname || "").split("/").filter(Boolean)[1] || "";
    NGGApi.public.cert(id).then(r => setState({ loading: false, cert: r.cert })).catch(() => setState({ loading: false, cert: null }));
  }, []);
  if (state.loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a1130" }}><div className="dash-spinner"/></div>;
  if (!state.cert) return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a1130", color: "#fff", textAlign: "center", padding: 24 }}>
      <div>
        <div className="mono" style={{ color: "#ff8a8a", letterSpacing: "0.14em" }}>CERTIFICATE NOT FOUND</div>
        <h1 className="display" style={{ fontSize: "clamp(32px,5vw,56px)", margin: "12px 0" }}>We can't verify that link.</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>The certificate ID is wrong, or it was revoked.</p>
        <a className="btn btn-gold mt-24" href="/">Back to home →</a>
      </div>
    </div>
  );
  const c = state.cert;
  const isCompletion = c.type === "completion";
  const issued = new Date(c.issuedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="cert-page" style={{ minHeight: "100vh", background: "#0a1130", padding: "48px 20px", display: "grid", placeItems: "center" }}>
      <style>{`@media print { .cert-page { background: #fff !important; padding: 0 !important; } .cert-noprint { display: none !important; } .cert-card { box-shadow: none !important; border: 1px solid #ddd !important; } }`}</style>
      <div className="cert-card" style={{ width: "min(760px, 100%)", background: "#fff", borderRadius: 20, padding: "clamp(32px, 6vw, 64px)", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.5)", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 50% at 100% 0%, rgba(245,176,38,0.12), transparent 60%)" }}/>
        {c.revoked && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}><span style={{ transform: "rotate(-18deg)", border: "4px solid rgba(228,21,95,0.5)", color: "rgba(228,21,95,0.5)", fontWeight: 800, fontSize: "clamp(40px,9vw,90px)", letterSpacing: 6, padding: "6px 28px", borderRadius: 12 }}>REVOKED</span></div>}
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36, flexWrap: "wrap", gap: 12 }}>
            <img src="assets/logo.png" alt="Next Generation Genius" width={46} height={46} style={{ borderRadius: "50%" }}/>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "#8a93a6" }}>{isCompletion ? "CERTIFICATE OF COMPLETION" : "CERTIFICATE OF SERVICE"}</span>
          </div>
          <p style={{ margin: 0, color: "#6b7385", fontSize: 15 }}>This certifies that</p>
          <h1 className="display" style={{ fontSize: "clamp(34px,5vw,56px)", margin: "6px 0 4px", color: "#0a1130", lineHeight: 1 }}>{c.fullName}</h1>
          {isCompletion ? (
            <p style={{ margin: "0 0 28px", color: "#6b7385", fontSize: 15 }}>
              completed <b style={{ color: "#0a1130" }}>NGG Summer School{c.cohort ? " · " + c.cohort : ""}</b>{c.track ? <> on the <b style={{ color: "#0a1130" }}>{c.track}</b> track</> : null},
              attending <b style={{ color: "#0a1130" }}>{c.daysPresent} days</b>{c.attendanceRate ? <> (<b style={{ color: "#0a1130" }}>{c.attendanceRate}%</b> attendance)</> : null}.
            </p>
          ) : (
            <p style={{ margin: "0 0 28px", color: "#6b7385", fontSize: 15 }}>
              served as a <b style={{ color: "#0a1130", textTransform: "capitalize" }}>{c.role}</b> volunteer with Next Generation Genius,
              completing <b style={{ color: "#0a1130" }}>{c.milestone} sessions</b> — approximately <b style={{ color: "#0a1130" }}>{c.hours} hours</b> of service.
            </p>
          )}
          <div style={{ display: "flex", gap: 40, flexWrap: "wrap", borderTop: "1px solid #ececf0", paddingTop: 24 }}>
            <div><div className="mono" style={{ fontSize: 10, color: "#8a93a6", letterSpacing: "0.12em" }}>ISSUED</div><div style={{ fontWeight: 600, color: "#0a1130" }}>{issued}</div></div>
            <div><div className="mono" style={{ fontSize: 10, color: "#8a93a6", letterSpacing: "0.12em" }}>{isCompletion ? "STUDENT ID" : "VOLUNTEER ID"}</div><div style={{ fontWeight: 600, color: "#0a1130" }}>{isCompletion ? c.studentId : c.volunteerId}</div></div>
            <div><div className="mono" style={{ fontSize: 10, color: "#8a93a6", letterSpacing: "0.12em" }}>CERTIFICATE</div><div style={{ fontWeight: 600, color: "#0a1130" }}>{c.certId}</div></div>
          </div>
          {c.revoked && <p style={{ margin: "20px 0 0", color: "#E4155F", fontWeight: 600, fontSize: 14 }}>This certificate has been revoked and is no longer valid.</p>}
        </div>
      </div>
      <div className="cert-noprint" style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button className="btn btn-gold" onClick={() => window.print()}>Print / Save PDF</button>
        <a className="btn btn-on-dark-ghost" href="/">Home</a>
      </div>
      <p className="cert-noprint mono" style={{ marginTop: 16, color: "rgba(255,255,255,0.45)", fontSize: 12, textAlign: "center" }}>
        Verified live at next.afrovanguard.org.ng/cert/{c.certId}
      </p>
    </div>
  );
}

/* =================== VOLUNTEER REGISTRATION (public, /volunteer) ============
   Volunteer is the category; the lanes below are its sub-roles. Instructors
   additionally pick the course(s) they can teach — the catalogue is served
   by the API from the live registration form, so admins manage it in one
   place. Minimalist single-column flow: lane → (courses) → details. */
const VOL_LANES = [
  { key: "admin",      icon: "🗂", name: "Admin / Ops", line: "Logistics, records, parent comms — the engine room of every Saturday." },
  { key: "mentor",     icon: "🧭", name: "Mentor",      line: "Guide a small circle of teenagers through the season. Listen first." },
  { key: "instructor", icon: "🎓", name: "Instructor",  line: "Teach one of the season's courses, from first class to showcase." },
];

// The volunteer Operations Manual (LCASP Summer Impact School 2026) — bundled in
// /assets/docs and emailed to every volunteer on registration. Keep this path in
// sync with volunteer_handbook_url() in api/_lib/domain/events.php.
const NGG_HANDBOOK_URL = "/assets/docs/lcasp-operations-manual-2026.pdf";

// A faithful, scannable summary of the manual shown on /volunteer so people know
// the standard they're signing up to before they register. Source: LCASP Summer
// Impact School 2026 Integrated Operations Manual & KPI Framework.
function HandbookSummary() {
  const [open, setOpen] = React.useState(false);
  const pillars = [
    ["Character", "Values, mentorship and foundational ethics."],
    ["Leadership", "Institutional capacity and anti-corruption habits."],
    ["Skill Acquisition", "Hands-on, project-based technical & creative learning."],
    ["Community Impact", "Civic responsibility and local service."],
    ["Purpose Development", "Life vision aligned with Afrocentric impact."],
  ];
  return (
    <div className="card handbook-summary" style={{ padding: "28px 30px", marginTop: 36, background: "var(--navy-900)", color: "#fff", border: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="eyebrow" style={{ color: "var(--gold-400)" }}>BEFORE YOU REGISTER · THE OPERATIONS MANUAL</span>
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: "10px 0 6px", letterSpacing: "-0.02em" }}>
        One movement, one standard.
      </h2>
      <p style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.6, margin: "0 0 18px", maxWidth: 620 }}>
        The <b>LCASP Summer Impact School 2026</b> — a Street&nbsp;to&nbsp;Stardom initiative under the
        Afrovanguard Governing Council — runs <b>900 learners across 6 Lagos centres</b> under the theme
        <b> “Ìlú Èkó · Empowered 360°.”</b> Volunteers don't follow the schedule of the public; they set
        the standard. Here's what you're signing up to.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
        {pillars.map(([t, d], i) => (
          <div key={t} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px" }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--gold-400)", letterSpacing: "0.12em" }}>PILLAR {i + 1}</div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: "4px 0 3px" }}>{t}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.45 }}>{d}</div>
          </div>
        ))}
      </div>

      {open && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: 16, marginBottom: 6, display: "grid", gap: 16 }}>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--gold-400)", letterSpacing: "0.12em", marginBottom: 6 }}>THE DAILY RHYTHM</div>
            <p style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.6, margin: 0, fontSize: 14 }}>
              Every centre runs one fixed frame: arrival &amp; environmental sanitation → morning energizer
              &amp; musing → <b>Anchor Journal</b> (Values·Vision·Virtues) → leadership masterclass → the main
              project-based skill class → chess &amp; strategic thinking → reflection, appraisal &amp; clean-up.
              Nine programs run inside it, from AI &amp; Tech to Music, Media, Creative Arts and the Authors Program.
            </p>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--gold-400)", letterSpacing: "0.12em", marginBottom: 6 }}>THE VOLUNTEER VANGUARD CODE</div>
            <ul style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.6, margin: 0, paddingLeft: 18, fontSize: 14 }}>
              <li><b>Turn up early.</b> The check-in window closes a clear hour before briefings begin.</li>
              <li><b>Punctuality is enforced.</b> Repeated lateness leads to review, suspension, then eviction.</li>
              <li><b>Review Times are compulsory.</b> The daily/weekly post-programme review isn't optional.</li>
              <li><b>Carry your ID.</b> Your digital volunteer credential is checked at the gate.</li>
              <li><b>Safeguarding first.</b> Anyone working with young people is screened before their first session.</li>
            </ul>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <a className="btn btn-gold btn-sm" href={NGG_HANDBOOK_URL} target="_blank" rel="noopener noreferrer">Read the full manual (PDF) ↗</a>
        <button type="button" className="btn btn-on-dark-ghost btn-sm" onClick={() => setOpen(v => !v)} aria-expanded={open}>
          {open ? "Show less" : "The daily rhythm & volunteer code"}
        </button>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>We'll email you this handbook when you register.</span>
      </div>
    </div>
  );
}

function VolunteerRegisterPage({ setPage }) {
  const [ctx, setCtx] = React.useState(null);
  const [ctxErr, setCtxErr] = React.useState(false);
  const [role, setRole] = React.useState(() => {
    const r = new URLSearchParams(window.location.search).get("role") || "";
    return VOL_LANES.some(l => l.key === r) ? r : "";
  });
  const [courses, setCourses] = React.useState([]);
  const [centre, setCentre] = React.useState("");
  const [faculty, setFaculty] = React.useState("");
  const [visibilityConsent, setVisibilityConsent] = React.useState(false);
  const [d, setD] = React.useState({ firstName: "", lastName: "", otherName: "", sex: "", email: "", phone: "", dob: "", why: "", photoUrl: "" });
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [doneWa, setDoneWa] = React.useState("");
  const [err, setErr] = React.useState("");

  const loadCtx = React.useCallback(() => {
    setCtxErr(false);
    NGGApi.public.volunteer.context()
      .then(r => { setCtx(r); if (!(r && r.centres && r.centres.length)) setCtxErr(true); })
      // Centres are validated server-side against the live catalogue, so we can't
      // safely fake them on failure — mark an error and let the applicant retry
      // rather than stranding them at an empty, unsubmittable centre dropdown.
      .catch(() => { setCtx({ open: true, courses: [], faculties: [], centres: [] }); setCtxErr(true); });
  }, []);
  React.useEffect(() => { loadCtx(); }, [loadCtx]);

  const set = (k) => (e) => { setD({ ...d, [k]: e.target.value }); if (err) setErr(""); };
  const toggleCourse = (c) => setCourses(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim());
  const todayISO = new Date().toISOString().slice(0, 10);
  const dobAge = dobToAge(d.dob);
  const dobOk = d.dob !== "" && dobAge >= 16 && dobAge <= 100;
  const phoneOk = d.phone.trim().length >= 7;
  const needsFaculty = role === "mentor" || role === "instructor";
  // The courses an instructor can teach are the ones under the faculty they
  // picked. Fall back to the full flat list only if the catalogue has no
  // mapping for that faculty (or none is chosen yet).
  const byFaculty = (ctx && ctx.coursesByFaculty) || null;
  const courseOptions = (needsFaculty && faculty && byFaculty && byFaculty[faculty])
    ? byFaculty[faculty]
    : ((ctx && ctx.courses) || []);
  // Changing faculty re-scopes the picker; drop any picked course that isn't in
  // the new faculty so we never submit a course from the wrong academy.
  const chooseFaculty = (f) => {
    setFaculty(f);
    if (byFaculty && byFaculty[f]) setCourses(cs => cs.filter(c => byFaculty[f].includes(c)));
    if (err) setErr("");
  };
  // Every field on the volunteer form is required (new fields added later may
  // opt out individually). Consent checkboxes stay optional by nature.
  const ready = role !== "" && centre !== "" && d.firstName.trim() !== "" && d.lastName.trim() !== ""
    && d.sex !== "" && emailOk
    && phoneOk && dobOk && d.photoUrl !== "" && d.why.trim() !== ""
    && (!needsFaculty || faculty !== "")
    && (role !== "instructor" || courses.length > 0);
  // Tell the applicant WHY the button is disabled instead of greying silently.
  const missing = [];
  if (role === "") missing.push("pick a role");
  if (centre === "") missing.push("your centre");
  if (needsFaculty && faculty === "") missing.push("your faculty");
  if (d.firstName.trim() === "") missing.push("first name");
  if (d.lastName.trim() === "") missing.push("last name");
  if (!emailOk) missing.push("a valid email");
  if (!phoneOk) missing.push("a phone number");
  if (d.dob === "") missing.push("date of birth");
  else if (!dobOk) missing.push("volunteers must be 16 or older");
  if (d.sex === "") missing.push("sex");
  if (d.photoUrl === "") missing.push("a headshot");
  if (d.why.trim() === "") missing.push("why you");
  if (role === "instructor" && courses.length === 0) missing.push("at least one course");

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.public.apply({
        kind: "volunteer", role,
        firstName: d.firstName.trim(), lastName: d.lastName.trim(), otherName: d.otherName.trim(),
        sex: d.sex,
        email: d.email.trim(), phone: d.phone.trim(), dob: d.dob,
        why: d.why.trim(), photoUrl: d.photoUrl || "", courses: role === "instructor" ? courses : [],
        centre, faculty: needsFaculty ? faculty : "", visibilityConsent,
      });
      setDone(r && r.ref ? r.ref : true);
      setDoneWa((r && r.whatsapp) || "");
      if (typeof toast !== "undefined") toast.success("We'll write back within a week.", "Registration received");
    } catch (e2) {
      const code = e2.code || e2.message;
      setErr({
        rate_limited: "Too many submissions — wait a few minutes and try again.",
        applications_closed: "Volunteer registration is closed right now. Check back soon.",
        course_required: "Pick at least one course you can teach.",
        centre_required: "Choose the centre closest to you.",
        invalid_centre: "That centre isn't active — pick one from the list.",
        faculty_required: "Choose your faculty.",
        invalid_faculty: "That faculty isn't available — pick one from the list.",
        phone_required: "A phone number is required — add your number.",
        photo_required: "A headshot is required — add a photo and try again.",
        bad_email: "That email doesn't look right.",
        bad_dob: "Enter a valid date of birth.",
        dob_too_young: "Volunteers must be at least 16 years old.",
        bad_firstName: "Please enter your first name.",
        bad_lastName: "Please enter your last name.",
      }[code] || "Couldn't submit. Please try again.");
    } finally { setBusy(false); }
  };

  const stepNo = (n, label) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 18 }}>
      <span className="mono" style={{ fontSize: 12, color: "var(--gold-500)", letterSpacing: "0.14em" }}>{n}</span>
      <h2 className="display" style={{ fontSize: "clamp(24px,3vw,34px)", margin: 0 }}>{label}</h2>
    </div>
  );

  if (done) return (
    <div className="page" data-screen-label="Volunteer · done">
      <section className="section" style={{ padding: "56px 24px" }}><div className="container" style={{ maxWidth: 620 }}>
        <ApplySuccessCard
          variant="volunteer"
          refCode={typeof done === "string" ? done : ""}
          whatsapp={doneWa}
          centreName={centre}
          footNote={"We've emailed a copy to " + (d.email.trim() || "you") + ", with the Operations Manual."}
          actions={[
            { label: "Read the Operations Manual (PDF)", href: NGG_HANDBOOK_URL, external: true, primary: true },
            { label: "Back to home", onClick: () => setPage("home") },
          ]}
        />
      </div></section>
    </div>
  );

  return (
    <div className="page" data-screen-label="Volunteer · register">
      <section className="section" style={{ paddingTop: 72 }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <span className="eyebrow" style={{ color: "var(--gold-500)" }}>VOLUNTEER · NEXT GENERATION GENIUS</span>
          <h1 className="display" style={{ fontSize: "clamp(44px,6vw,84px)", margin: "10px 0 14px", lineHeight: 0.95 }}>
            Give a season.<br/>Shape a genius.
          </h1>
          <p style={{ fontSize: 17, color: "var(--ink-500)", lineHeight: 1.6, maxWidth: 560, margin: 0 }}>
            One form, three ways in. Tell us the shape of your time and we'll take it from there.
          </p>

          <HandbookSummary/>

          {ctx && ctx.open === false ? (
            <div className="card mt-40" style={{ padding: 32 }}>
              <h2 className="display" style={{ fontSize: 26, margin: "0 0 8px" }}>Registration is paused.</h2>
              <p style={{ color: "var(--ink-500)", margin: 0 }}>We're between intakes. Leave your email via the newsletter below and we'll announce the next window.</p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              {/* 01 · Lane */}
              <div className="mt-48">
                {stepNo("01", "Pick your lane")}
                <div className="vol-lanes" role="radiogroup" aria-label="Volunteer role">
                  {VOL_LANES.map(l => (
                    <button type="button" key={l.key} role="radio" aria-checked={role === l.key}
                      className={"vol-lane" + (role === l.key ? " is-active" : "")}
                      onClick={() => { setRole(l.key); if (err) setErr(""); }}>
                      <span className="vol-lane-icon" aria-hidden="true">{l.icon}</span>
                      <span className="vol-lane-name">{l.name}</span>
                      <span className="vol-lane-line">{l.line}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 02 · Placement — centre (all roles) + faculty (mentor/instructor) + courses (instructor) */}
              {role !== "" && (
                <div className="mt-48">
                  {stepNo("02", "Where you'll serve")}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="vol-fields">
                    <div className="field"><label htmlFor="vol-centre">Centre</label>
                      {ctxErr ? (
                        <div style={{ fontSize: 13.5, color: "var(--ink-500)", display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
                          Couldn't load centres.
                          <button type="button" className="btn btn-ghost btn-sm" onClick={loadCtx}>Retry</button>
                        </div>
                      ) : (
                        <select id="vol-centre" value={centre} onChange={(e) => { setCentre(e.target.value); if (err) setErr(""); }}>
                          <option value="" disabled>Select a centre…</option>
                          {(ctx && ctx.centres ? ctx.centres : []).map(c => (
                            <option key={c.name} value={c.name}>{c.name}{c.code ? " · " + c.code : ""}</option>
                          ))}
                        </select>
                      )}</div>
                    {needsFaculty && (
                      <div className="field"><label htmlFor="vol-faculty">Faculty</label>
                        <select id="vol-faculty" value={faculty} onChange={(e) => chooseFaculty(e.target.value)}>
                          <option value="" disabled>Select a faculty…</option>
                          {(ctx && ctx.faculties ? ctx.faculties : []).map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select></div>
                    )}
                  </div>
                  {role === "instructor" && (
                    <div className="mt-24">
                      <p className="mono" style={{ fontSize: 11, color: "var(--ink-500)", letterSpacing: "0.08em", margin: "0 0 10px" }}>
                        {faculty
                          ? "COURSES IN " + faculty.toUpperCase() + " — PICK EVERY ONE YOU CAN TEACH."
                          : "WHICH COURSES CAN YOU TEACH? PICK YOUR FACULTY FIRST."}
                      </p>
                      {faculty ? (
                        courseOptions.length ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {courseOptions.map(c => (
                              <button type="button" key={c}
                                className={"vol-chip" + (courses.includes(c) ? " is-active" : "")}
                                aria-pressed={courses.includes(c)}
                                onClick={() => toggleCourse(c)}>{c}</button>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>No courses are listed under this faculty yet.</p>
                        )
                      ) : (
                        <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>Choose your faculty above to see the courses it offers.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 03 · Details */}
              <div className="mt-48">
                {stepNo(role === "" ? "02" : "03", "Your details")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="vol-fields">
                  <div className="field"><label htmlFor="vol-first">First name</label>
                    <input id="vol-first" value={d.firstName} onChange={set("firstName")} autoComplete="given-name" placeholder="e.g. Adaeze"/></div>
                  <div className="field"><label htmlFor="vol-last">Last name</label>
                    <input id="vol-last" value={d.lastName} onChange={set("lastName")} autoComplete="family-name" placeholder="e.g. Okafor"/></div>
                  <div className="field"><label htmlFor="vol-other">Other name · optional</label>
                    <input id="vol-other" value={d.otherName} onChange={set("otherName")} autoComplete="additional-name" placeholder="Middle name(s)"/></div>
                  <div className="field"><label htmlFor="vol-dob">Date of birth</label>
                    <input id="vol-dob" type="date" value={d.dob} onChange={set("dob")} max={todayISO} autoComplete="bday"/></div>
                  <div className="field"><label htmlFor="vol-sex">Sex</label>
                    <select id="vol-sex" value={d.sex} onChange={set("sex")}>
                      <option value="" disabled>Select…</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select></div>
                  <div className="field"><label htmlFor="vol-email">Email</label>
                    <input id="vol-email" type="email" value={d.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com"/></div>
                  <div className="field"><label htmlFor="vol-phone">Phone</label>
                    <input id="vol-phone" type="tel" value={d.phone} onChange={set("phone")} autoComplete="tel" placeholder="0803 000 0000"/></div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="vol-why">Why you</label>
                    <textarea id="vol-why" rows={3} value={d.why} onChange={set("why")} placeholder="A line or two — craft, experience, or simply why this matters to you."/></div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}><label>Photo</label>
                    <PhotoCapture value={d.photoUrl} onChange={(url) => { setD({ ...d, photoUrl: url }); if (err) setErr(""); }} size={72} label="Used on your volunteer ID once approved (required)"/></div>
                  <label className="field" style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", background: visibilityConsent ? "rgba(159,188,59,0.10)" : "var(--paper-100,#f4f1e8)", border: "1px solid " + (visibilityConsent ? "#9fbc3b" : "rgba(12,20,50,0.10)"), borderRadius: 12, padding: "14px 16px" }}>
                    <input type="checkbox" checked={visibilityConsent} onChange={e => { setVisibilityConsent(e.target.checked); if (err) setErr(""); }} style={{ width: 19, height: 19, marginTop: 1, accentColor: "#7a9c1e", flex: "none" }}/>
                    <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-700)" }}><b>Feature me on the website</b> — I agree that Next Generation Genius may show my photo and first name publicly on its website and status boards to celebrate the team. Optional, and you can withdraw it any time by contacting us.</span>
                  </label>
                </div>
              </div>

              {err && <p role="alert" style={{ color: "var(--coral)", fontSize: 14, marginTop: 20, marginBottom: 0 }}>{err}</p>}

              <div className="mt-32" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <button type="submit" className="btn btn-gold btn-lg" disabled={!ready || busy}>
                  {busy ? "Sending…" : "Register as a volunteer →"}
                </button>
                <span style={{ fontSize: 12.5, color: "var(--ink-500)", maxWidth: 340, lineHeight: 1.5 }}>
                  {!ready && missing.length
                    ? "Still needed: " + missing.join(", ") + "."
                    : "Roles that work with teenagers pass safeguarding screening before the first session."}
                </span>
              </div>
            </form>
          )}
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
// Every portal token this device has paired (mentors/teachers hold several —
// one per student). The active token stays in CIRCLE_TOKEN_KEY.
const CIRCLE_TOKENS_KEY = "ngg_circle_tokens";
const circleTokens = {
  all() { try { return JSON.parse(localStorage.getItem(CIRCLE_TOKENS_KEY)) || []; } catch (_) { return []; } },
  save(list) { try { localStorage.setItem(CIRCLE_TOKENS_KEY, JSON.stringify(list.slice(0, 30))); } catch (_) {} },
  add(t) { const l = circleTokens.all(); if (t && l.indexOf(t) === -1) { l.push(t); circleTokens.save(l); } },
  remove(t) { circleTokens.save(circleTokens.all().filter(x => x !== t)); },
};
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

  const [cohort, setCohort] = React.useState(null);

  const loadDash = React.useCallback((tok) => {
    setBusy(true); setErr("");
    return NGGApi.public.circle.dashboard(tok)
      .then(d => { setDash(d); setStep("dashboard"); })
      .catch(e => {
        if ((e.code || e.message) === "link_invalid") {
          // This student revoked (or the token expired) — fall over to the
          // next paired student on this device, or back to the start.
          circleTokens.remove(tok);
          const rest = circleTokens.all();
          if (rest.length) { try { localStorage.setItem(CIRCLE_TOKEN_KEY, rest[0]); } catch (_) {} setToken(rest[0]); return loadDash(rest[0]); }
          try { localStorage.removeItem(CIRCLE_TOKEN_KEY); } catch (_) {}
          setToken(""); setDash(null); setStep("role");
        } else setErr(humanizeError(e.message, e.code));
      })
      .finally(() => setBusy(false));
  }, []);
  React.useEffect(() => { if (token) loadDash(token); /* eslint-disable-next-line */ }, []);

  // Cohort strip — one summary chip per student this device holds a valid
  // token for. The server silently skips revoked tokens; we prune to match.
  const refreshCohort = React.useCallback((activeTok) => {
    const list = circleTokens.all();
    if (activeTok && list.indexOf(activeTok) === -1) { list.push(activeTok); circleTokens.save(list); }
    if (!list.length) { setCohort([]); return; }
    NGGApi.public.circle.cohort(list)
      .then(r => { const students = r.students || []; circleTokens.save(students.map(s => s.token)); setCohort(students); })
      .catch(() => {});
  }, []);
  React.useEffect(() => { if (step === "dashboard" && token) refreshCohort(token); }, [step, token, refreshCohort]);

  const switchStudent = (tok) => {
    if (tok === token) return;
    try { localStorage.setItem(CIRCLE_TOKEN_KEY, tok); } catch (_) {}
    setToken(tok); loadDash(tok);
  };
  const addStudent = () => { setRole((dash && dash.role) || role || "mentor"); setStudent(null); setCode(""); setErr(""); setStep("code"); };

  const roleWord = role === "teacher" ? "student" : (role === "mentor" ? "mentee" : "child");
  const submitCode = async () => {
    setBusy(true); setErr("");
    try { const r = await NGGApi.public.circle.lookup(code); setStudent(r.student); setStep("verify"); }
    catch (e) { setErr((e.code === "not_found") ? "No student found for that code. Check the digits and try again." : humanizeError(e.message, e.code)); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.public.circle.connect({ code, role, guardianName, consent: true });
      try { localStorage.setItem(CIRCLE_TOKEN_KEY, r.token); } catch (_) {}
      circleTokens.add(r.token);
      setToken(r.token); await loadDash(r.token); flash("Connected securely ✓");
    } catch (e) { setErr(humanizeError(e.message, e.code)); } finally { setBusy(false); }
  };
  const unlink = () => { try { localStorage.removeItem(CIRCLE_TOKEN_KEY); } catch (_) {} circleTokens.save([]); setCohort(null); setToken(""); setDash(null); setRole(null); setCode(""); setConsent(false); setStep("role"); flash("Signed out of this device"); };
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
    <button type="button" role="checkbox" aria-checked={consent} aria-label="I agree to Anchor's guardian terms and the student's privacy" onClick={() => setConsent(v => !v)} style={{ display: "flex", gap: 12, width: "100%", textAlign: "left", marginTop: 20, padding: 15, borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", cursor: "pointer", color: "#fff", alignItems: "center" }}>
      <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, border: "2px solid " + (consent ? teal : "rgba(255,255,255,.3)"), background: consent ? teal : "transparent", display: "grid", placeItems: "center", color: "#06231d", fontWeight: 800 }}>{consent ? "✓" : ""}</span>
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
    {cohort && (cohort.length > 1 || dash.role === "mentor") && (
      <div style={{ marginTop: 18 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: ".16em", color: "rgba(255,255,255,.6)", marginBottom: 8 }}>{dash.role === "mentor" ? "YOUR MENTEES" : "YOUR STUDENTS"}</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }} role="tablist" aria-label="Linked students">
          {cohort.map(s => {
            const active = s.token === token;
            return (
              <button key={s.token} role="tab" aria-selected={active} onClick={() => switchStudent(s.token)}
                title={s.atRisk ? "Needs support — " + (s.trend || "") : "On track — " + (s.trend || "")}
                style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 99, cursor: "pointer",
                  background: active ? "rgba(94,224,192,.16)" : "rgba(255,255,255,.06)",
                  border: "1px solid " + (active ? teal : "rgba(255,255,255,.14)"), color: "#fff" }}>
                {s.atRisk && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff8a8a", boxShadow: "0 0 8px rgba(255,120,120,.8)" }}/>}
                <span style={{ fontWeight: 700, fontSize: 13 }}>{(s.name || "?").split(" ")[0]}</span>
                <span className="mono" style={{ fontSize: 11, color: "#ffce54" }}>🔥{s.streak}</span>
              </button>
            );
          })}
          <button onClick={addStudent} style={{ flex: "none", padding: "9px 13px", borderRadius: 99, background: "transparent", border: "1px dashed rgba(255,255,255,.3)", color: "rgba(255,255,255,.75)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>+ Add</button>
        </div>
      </div>
    )}
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

/* ============================================================================
   Parent verification — the no-account page a parent reaches from the
   SMS/email link (?t=…). Calm paper, plain language, one lime button.
   ============================================================================ */
function ParentVerifyPage() {
  const t = new URLSearchParams(window.location.search).get("t") || "";
  const [state, setState] = React.useState("loading"); // loading|form|done|success|error
  const [ctx, setCtx] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [consents, setConsents] = React.useState({});
  const [actorName, setActorName] = React.useState("");
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!t) { setState("error"); setErr("This link is incomplete — open it exactly as it was sent to you."); return; }
    NGGApi.public.verify.context(t)
      .then(r => { setCtx(r); setActorName(r.guardianName || ""); setState(r.done ? "done" : "form"); })
      .catch(e => { setState("error"); setErr((e.code === "link_expired") ? "This link has expired. Ask the program team to send a new one." : "This link isn't valid. Check you opened it exactly as sent — or ask the program team for a new one."); });
  }, []);

  const types = (ctx && ctx.consentTypes) || {};
  const p0 = Object.keys(types).filter(k => types[k].p === 0);
  const optional = Object.keys(types).filter(k => types[k].p > 0);
  const p0Done = p0.every(k => consents[k]);
  const CONSENT_COPY = {
    participation: "may attend all program sessions and activities.",
    medical: "staff may seek medical help for them in an emergency.",
    data: "we may store the registration details you provided, protected under the NDPR, and use them only to run the program.",
    media: "may appear in program photos and media (optional).",
    site_visibility: "may be featured — with their photo and first name — on our website and public status boards (optional).",
    trips: "may join supervised off-site activities (optional).",
    comms: "send me program updates by SMS or email (optional).",
  };

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await NGGApi.public.verify.submit(t, consents, actorName.trim(), feedback.trim());
      setState("success");
    } catch (e) {
      setErr(e.code === "consent_required" ? ("Please tick all " + p0.length + " required boxes — the registration can't complete without them.") : "Couldn't save just now — check your connection and try again. Nothing you entered was lost.");
    } finally { setBusy(false); }
  };

  const shell = (children) => (
    <div style={{ minHeight: "100vh", background: "#f7f7f4", color: "#171a1f", display: "flex", justifyContent: "center", padding: "34px 18px 70px", fontFamily: "var(--font-body, system-ui, sans-serif)" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
    </div>
  );
  const card = { background: "#fff", border: "1px solid #e6e6e0", borderRadius: 18, padding: 20 };
  const first = ctx && ctx.student ? (ctx.student.name || "").split(" ")[0] : "";

  if (state === "loading") return shell(<div style={{ ...card, textAlign: "center", padding: 48 }}><div className="dash-spinner"/><p style={{ color: "#777" }}>One moment…</p></div>);
  if (state === "error") return shell(<div style={card}><h1 style={{ fontSize: 22, margin: "0 0 8px" }}>We couldn't open this link</h1><p style={{ color: "#555", lineHeight: 1.55 }}>{err}</p></div>);
  if (state === "done") return shell(<div style={{ ...card, textAlign: "center" }}><div style={{ fontSize: 44 }}>✅</div><h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>Already confirmed</h1><p style={{ color: "#555" }}>You've already given consent for <b>{ctx.student.name}</b>. Nothing more is needed — thank you.</p></div>);
  if (state === "success") return shell(<div style={{ ...card, textAlign: "center" }}><div style={{ fontSize: 44 }}>🎉</div><h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>{first} is fully registered</h1><p style={{ color: "#555", lineHeight: 1.55 }}>Thank you. Their ID card is being prepared, and the program team has been notified. We'll only contact you about the program.</p></div>);

  return shell(<>
    <div style={{ fontSize: 11, letterSpacing: ".18em", fontWeight: 700, color: "#8a8a80", textTransform: "uppercase" }}>NGG Summer School</div>
    <h1 style={{ fontSize: 24, lineHeight: 1.2, margin: "10px 0 14px" }}>Hello{actorName ? " " + actorName.split(" ")[0] : ""} — {first} was registered today.</h1>
    <div style={{ ...card, background: "#f0f4e4", border: "1px solid #dbe5bd", marginBottom: 14 }}>
      <b style={{ fontSize: 14 }}>Why you got this link:</b>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: "#4a4f42", lineHeight: 1.55 }}>We need your consent before {first}'s registration is complete. It takes about a minute — and you can tell us anything we should know.</p>
    </div>
    <div style={{ ...card, display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
      {ctx.student.photoUrl
        ? <img src={ctx.student.photoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }}/>
        : <div style={{ width: 56, height: 56, borderRadius: 14, background: "#eef0e6", display: "grid", placeItems: "center", fontSize: 24, fontWeight: 800 }}>{(ctx.student.name || "?").charAt(0)}</div>}
      <div><div style={{ fontWeight: 800, fontSize: 17 }}>{ctx.student.name}</div><div style={{ fontSize: 13, color: "#777" }}>{ctx.student.course || "Summer program"}</div></div>
    </div>

    <div style={{ fontSize: 11, letterSpacing: ".14em", fontWeight: 700, color: "#8a8a80", margin: "18px 0 8px", textTransform: "uppercase" }}>Required — please tick all {p0.length}</div>
    {p0.map(k => (
      <label key={k} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", padding: 14, marginBottom: 8, cursor: "pointer", borderColor: consents[k] ? "#9fbc3b" : "#e6e6e0" }}>
        <input type="checkbox" checked={!!consents[k]} onChange={e => setConsents(c => ({ ...c, [k]: e.target.checked }))} style={{ width: 19, height: 19, marginTop: 1, accentColor: "#7a9c1e" }}/>
        <span style={{ fontSize: 14, lineHeight: 1.5 }}><b>{types[k].label}</b> — {first} {CONSENT_COPY[k] || ""}</span>
      </label>
    ))}
    <div style={{ fontSize: 11, letterSpacing: ".14em", fontWeight: 700, color: "#8a8a80", margin: "18px 0 8px", textTransform: "uppercase" }}>Optional — your choice either way</div>
    {optional.map(k => (
      <label key={k} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", padding: 14, marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={!!consents[k]} onChange={e => setConsents(c => ({ ...c, [k]: e.target.checked }))} style={{ width: 19, height: 19, marginTop: 1, accentColor: "#7a9c1e" }}/>
        <span style={{ fontSize: 14, lineHeight: 1.5 }}><b>{types[k].label}</b> — {k === "comms" ? "" : first + " "}{CONSENT_COPY[k] || ""}</span>
      </label>
    ))}

    <div style={{ margin: "18px 0 8px", fontSize: 11, letterSpacing: ".14em", fontWeight: 700, color: "#8a8a80", textTransform: "uppercase" }}>You <span style={{ color: "#b03535" }}>*</span></div>
    <input value={actorName} onChange={e => setActorName(e.target.value)} placeholder="Your full name (required)" maxLength={120} aria-required="true"
      style={{ width: "100%", padding: "13px 15px", borderRadius: 12, border: "1px solid #dcdcd4", fontSize: 16, background: "#fff" }}/>
    <textarea value={feedback} onChange={e => setFeedback(e.target.value)} placeholder={"Anything we should know about " + first + "? (allergies, pickup, concerns — optional)"} maxLength={1000}
      style={{ width: "100%", marginTop: 8, minHeight: 84, padding: "13px 15px", borderRadius: 12, border: "1px solid #dcdcd4", fontSize: 15, background: "#fff", resize: "vertical", fontFamily: "inherit" }}/>
    {err && <p style={{ color: "#b03535", fontSize: 13.5, margin: "10px 0 0" }}>{err}</p>}
    {!busy && !err && (!p0Done || actorName.trim().length < 2) && (
      <p style={{ color: "#8a7a2e", fontSize: 13, margin: "10px 0 0" }}>{!p0Done ? "Tick all the required boxes above to confirm." : "Add your name above to confirm."}</p>
    )}
    <button onClick={submit} disabled={!p0Done || busy || actorName.trim().length < 2}
      style={{ width: "100%", marginTop: 14, padding: 16, borderRadius: 14, border: "none", cursor: p0Done ? "pointer" : "default", fontWeight: 800, fontSize: 16, background: p0Done ? "#c9f24e" : "#e8e8e0", color: p0Done ? "#243300" : "#9a9a90" }}>
      {busy ? "Saving…" : "Confirm & consent"}
    </button>
    <p style={{ textAlign: "center", fontSize: 12, color: "#9a9a90", lineHeight: 1.5, marginTop: 14 }}>Read-only for us, revocable by you — contact the program team any time to change a choice.</p>
  </>);
}

/* ============================================================================
   The Gate — registration desk + attendance behind a gated link (?g=…).
   Dark blue + gold. Requires a signed-in staff member; the token scopes
   the link. Register wizard: Details → Photo → Confirm. Check-in by code.
   ============================================================================ */
function GatePage() {
  const g = new URLSearchParams(window.location.search).get("g") || "";
  const auth = (window.useAuth || (() => null))();   // stable: set before mount
  const [ctx, setCtx] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading|need-auth|error|ready
  const [err, setErr] = React.useState("");
  const [tab, setTab] = React.useState("register");
  const [pw, setPw] = React.useState("");
  const [unlockBusy, setUnlockBusy] = React.useState(false);
  const [unlockErr, setUnlockErr] = React.useState("");
  const draftKey = "ngg_gate_draft_" + g;

  const load = React.useCallback(() => {
    setState("loading");
    NGGApi.public.gate.context(g)
      .then(r => { setCtx(r); setState("ready"); })
      .catch(e => {
        const c = e.code || e.message;
        if (c === "unauthorized") setState("need-auth");
        else { setErr(c === "gate_invalid" ? "This gate link has been closed or revoked. Ask an admin for a fresh one." : c === "forbidden" ? "Your account doesn't have staff access." : "Couldn't load the gate — check your connection.") ; setState("error"); }
      });
  }, [g]);
  React.useEffect(() => { load(); }, [load]);
  // After the operator signs in through the modal, retry automatically.
  React.useEffect(() => { if (state === "need-auth" && auth && auth.isSignedIn) load(); }, [auth && auth.isSignedIn]);

  // Kiosk unlock — field staff without an admin login open the desk with the
  // gate's password. On success a gate-scoped session is set; reload the gate.
  const doUnlock = async (e) => {
    if (e) e.preventDefault();
    if (!pw.trim() || unlockBusy) return;
    setUnlockBusy(true); setUnlockErr("");
    try { await NGGApi.public.gate.unlock(g, pw.trim()); setPw(""); load(); }
    catch (err) {
      const c = err.code || err.message;
      setUnlockErr(c === "bad_password" ? "That desk password didn't match. Try again."
        : c === "no_password" ? "This gate has no desk password — an admin must sign in, or set one first."
        : c === "gate_invalid" ? "This gate link has been closed or revoked."
        : "Couldn't unlock — check the connection and try again.");
    } finally { setUnlockBusy(false); }
  };

  const navy = "#16223e", gold = "#ffce54", goldInk = "#2b2100";
  const card = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14 };
  const inputS = { width: "100%", padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 16, fontFamily: "inherit" };
  const shell = (children) => (
    <div style={{ minHeight: "100vh", background: navy, color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "26px 18px 70px" }}>{children}</div>
    </div>
  );

  if (state === "loading") return shell(<div style={{ textAlign: "center", padding: "90px 0" }}><div className="dash-spinner"/></div>);
  if (state === "need-auth") return shell(<div style={{ ...card, padding: 24, marginTop: 48 }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 38 }}>🛡️</div>
      <h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>Open the desk</h1>
      <p style={{ color: "rgba(230,238,255,.66)", fontSize: 14, lineHeight: 1.55 }}>This gate link is real — the person operating it just needs to unlock it.</p>
      <button onClick={() => auth && auth.openSignIn()} style={{ marginTop: 14, padding: "13px 26px", borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Staff sign-in →</button>
    </div>
    {/* Desk password — no admin account needed. */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 14px", color: "rgba(230,238,255,.4)", fontSize: 11, fontWeight: 700, letterSpacing: ".14em" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }}/>OR DESK PASSWORD<div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }}/>
    </div>
    <form onSubmit={doUnlock} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <input type="password" value={pw} onChange={e => { setPw(e.target.value); if (unlockErr) setUnlockErr(""); }} placeholder="Desk password" autoComplete="off"
        style={{ width: "100%", padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 16, fontFamily: "inherit" }}/>
      {unlockErr && <div style={{ fontSize: 12.5, color: "#ff9a9a" }}>{unlockErr}</div>}
      <button type="submit" disabled={unlockBusy || !pw.trim()} style={{ padding: "12px 26px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: pw.trim() ? 1 : .55 }}>{unlockBusy ? "Unlocking…" : "Unlock the desk"}</button>
      <p style={{ color: "rgba(230,238,255,.5)", fontSize: 11.5, textAlign: "center", margin: "2px 0 0", lineHeight: 1.5 }}>Ask your coordinator for the desk password. It works only for this gate and expires automatically.</p>
    </form>
  </div>);
  if (state === "error") return shell(<div style={{ ...card, padding: 24, marginTop: 60 }}><h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Gate unavailable</h1><p style={{ color: "rgba(230,238,255,.66)", fontSize: 14 }}>{err}</p><button onClick={load} style={{ marginTop: 12, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Retry</button></div>);

  return shell(<>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>THE GATE · {String((ctx.gate && ctx.gate.name) || "").toUpperCase()}</div>
        <h1 style={{ fontSize: 22, margin: "4px 0 0", fontWeight: 800 }}>{(ctx.cohort && ctx.cohort.name) || "Summer School"}</h1>
      </div>
      <span style={{ fontSize: 24 }}>⛩️</span>
    </div>
    <div style={{ display: "flex", gap: 0, margin: "18px 0" }}>
      {[["register", "Register"], ["checkin", "Check-in"]].map(([id, label], i) => (
        <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", color: tab === id ? goldInk : "rgba(230,238,255,.6)", background: tab === id ? gold : "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: i === 0 ? "11px 0 0 11px" : "0 11px 11px 0" }}>{label}</button>
      ))}
    </div>
    {tab === "register"
      ? <GateRegister g={g} ctx={ctx} card={card} inputS={inputS} gold={gold} goldInk={goldInk} draftKey={draftKey}/>
      : <GateCheckin g={g} ctx={ctx} card={card} inputS={inputS} gold={gold} goldInk={goldInk}/>}
  </>);
}

// Great-circle distance in metres — client preview of the fence match; the
// server re-checks authoritatively on submit.
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function GateRegister({ g, ctx, card, inputS, gold, goldInk, draftKey }) {
  const geoOn = !!(ctx.geo && ctx.geo.enabled);
  const fields = ((ctx.form && ctx.form.fields) || []).filter(f => !(geoOn && f.key === "centre"));
  const [step, setStep] = React.useState(0);           // 0 details · 1 photo · 2 confirm
  const [form, setForm] = React.useState(() => { try { return JSON.parse(localStorage.getItem(draftKey)) || {}; } catch (_) { return {}; } });
  const [errors, setErrors] = React.useState({});
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dupe, setDupe] = React.useState(null);
  const [done, setDone] = React.useState(null);
  const [geo, setGeo] = React.useState({ st: geoOn ? "idle" : "off", lat: null, lng: null, centre: null, dist: null, err: "" });
  const set = (k, v) => setForm(f => { const n = { ...f, [k]: v }; try { localStorage.setItem(draftKey, JSON.stringify(n)); } catch (_) {} return n; });
  const visible = (f) => !f.showIf || String(form[f.showIf.key] || "") === String(f.showIf.value);
  const mut = { color: "rgba(230,238,255,.62)" };

  // Geo-fence: capture the device location and match it to a fenced centre.
  const captureGeo = React.useCallback(() => {
    if (!geoOn) return;
    if (!navigator.geolocation) { setGeo(x => ({ ...x, st: "denied", err: "This device can't share its location." })); return; }
    setGeo(x => ({ ...x, st: "locating", err: "" }));
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        let best = null;
        (ctx.geo.centres || []).forEach(c => {
          const d = haversineM(lat, lng, c.lat, c.lng);
          if (!best || d < best.dist) best = { centre: c, dist: Math.round(d), inFence: d <= (c.radiusM || 150) };
        });
        const st = best ? (best.inFence ? "in" : "out") : "nofence";
        if (best && best.inFence) set("centre", best.centre.name);
        setGeo({ st, lat, lng, centre: best && best.centre, dist: best && best.dist, err: "" });
      },
      err => setGeo(x => ({ ...x, st: "denied", err: err && err.code === 1 ? "Location permission was blocked. Enable it in the browser to register at this desk." : "Couldn't get a location fix — move into the open and retry." })),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }, [geoOn]);
  React.useEffect(() => { captureGeo(); }, [captureGeo]);
  const geoReady = !geoOn || geo.st === "in" || geo.st === "nofence";

  const submit = async (force) => {
    setBusy(true); setErrors({}); setDupe(null);
    try {
      const r = await NGGApi.public.gate.register(g, form, photoUrl, !!force, { lat: geo.lat, lng: geo.lng });
      try { localStorage.removeItem(draftKey); } catch (_) {}
      setDone(r);
    } catch (e) {
      const c = e.code || (e.detail && e.detail.error);
      if (c === "duplicate_suspect" || (e.detail && e.detail.existing)) { setDupe((e.detail && e.detail.existing) || {}); }
      else if (c === "photo_required") { setErrors({ _: "A headshot is required — take or upload a photo to register." }); setStep(1); }
      else if (c === "geo_unavailable") { setErrors({ _: "This desk needs your location to register. Allow location access and try again." }); setStep(0); }
      else if (c === "geo_out_of_fence") { const n = (e.detail && e.detail.nearest) || {}; setErrors({ _: "You're outside every registration centre's area" + (n.name ? " — nearest is " + n.name + ", about " + n.distanceM + "m away" : "") + ". Registration is only allowed on-site." }); setStep(0); }
      else if (e.errors || (e.detail && e.detail.errors)) { setErrors(e.errors || e.detail.errors); setStep(0); }
      else setErrors({ _: "Couldn't save — check the connection and try again. The draft is safe on this device." });
    } finally { setBusy(false); }
  };

  if (done) return (
    <div style={{ ...card, padding: 22, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>📨</div>
      <h2 style={{ fontSize: 20, margin: "10px 0 6px" }}>Registered — parent notified</h2>
      <p style={{ ...mut, fontSize: 14, lineHeight: 1.55 }}>{form.fullName} is in as <b style={{ color: "#fff" }}>{done.studentId}</b>. The registration completes when the parent confirms{done.verificationSent && done.verificationSent.length ? " (sent by " + done.verificationSent.join(" + ") + ")" : ""}. Their ID is issued at that moment.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={() => { setDone(null); setForm({}); setPhotoUrl(""); setStep(0); }} style={{ flex: 1, padding: 13, borderRadius: 11, border: "none", background: gold, color: goldInk, fontWeight: 800, cursor: "pointer" }}>New registration</button>
        <button onClick={() => { const keep = {}; ["parentName", "parentPhone", "parentEmail"].forEach(k => { if (form[k]) keep[k] = form[k]; }); setDone(null); setForm(keep); setPhotoUrl(""); setStep(0); }} style={{ flex: 1, padding: 13, borderRadius: 11, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Register sibling</button>
      </div>
    </div>
  );

  if (dupe) return (
    <div style={{ ...card, padding: 20 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Possibly already registered</h2>
      <p style={{ ...mut, fontSize: 14, lineHeight: 1.5 }}>A student with the same name and parent contact already exists{dupe.studentId ? <> — <b style={{ color: "#fff" }}>{dupe.studentId}</b> ({dupe.regStatus})</> : ""}. Registering again creates a second record.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={() => setDupe(null)} style={{ flex: 1, padding: 12, borderRadius: 11, border: "none", background: gold, color: goldInk, fontWeight: 800, cursor: "pointer" }}>It's them — stop</button>
        <button onClick={() => submit(true)} style={{ flex: 1, padding: 12, borderRadius: 11, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Different child — continue</button>
      </div>
    </div>
  );

  const steps = ["Details", "Photo", "Confirm"];
  return (<>
    <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
      {steps.map((s, i) => <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= step ? gold : "rgba(255,255,255,.14)" }}/>)}
    </div>
    <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: gold, marginBottom: 10 }}>STEP {step + 1} OF 3 · {steps[step].toUpperCase()}</div>

    {step === 0 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {errors._ && <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,120,120,.12)", border: "1px solid rgba(255,120,120,.35)", fontSize: 13 }}>{errors._}</div>}
        {geoOn && (() => {
          const tone = geo.st === "in" ? ["rgba(118,176,67,.14)", "rgba(118,176,67,.4)", "#bfe6a0"]
            : geo.st === "out" || geo.st === "denied" ? ["rgba(255,120,120,.12)", "rgba(255,120,120,.35)", "#ff9a9a"]
            : ["rgba(255,206,84,.12)", "rgba(255,206,84,.4)", "#ffdd8a"];
          return (
            <div style={{ padding: "11px 13px", borderRadius: 10, background: tone[0], border: "1px solid " + tone[1], fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: tone[2] }}>
                <span>📍</span>
                <span>{geo.st === "locating" || geo.st === "idle" ? "Finding this centre…"
                  : geo.st === "in" ? "On-site at " + (geo.centre ? geo.centre.name : "a centre")
                  : geo.st === "out" ? "Not at a registration centre"
                  : geo.st === "nofence" ? "Location captured" : "Location needed"}</span>
              </div>
              <div style={{ ...mut, marginTop: 4 }}>
                {geo.st === "in" ? "The centre is set automatically from where you are — no cheating possible." + (geo.dist != null ? " (~" + geo.dist + "m from the marker)" : "")
                  : geo.st === "out" ? (geo.centre ? "Nearest is " + geo.centre.name + ", ~" + geo.dist + "m away. You must be on-site to register." : "You're outside every centre's area.")
                  : geo.st === "denied" ? geo.err
                  : geo.st === "nofence" ? "No centre has a mapped area yet — an admin can set that under Centres."
                  : "Sharing your location lets the desk pick the right centre and prevents off-site sign-ups."}
              </div>
              {(geo.st === "out" || geo.st === "denied") && <button type="button" onClick={captureGeo} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Retry location</button>}
            </div>
          );
        })()}
        {fields.filter(visible).map(f => {
          if (f.type === "section") return <div key={f.key} style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.55)", marginTop: 6 }}>{f.label.toUpperCase()}</div>;
          if (f.type === "info") return <p key={f.key} style={{ ...mut, fontSize: 13, margin: 0 }}>{f.label}</p>;
          const errMsg = errors[f.key];
          return (
            <label key={f.key} style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: gold }}> *</span>}{f.sensitive && " 🔒"}</span>
              {f.type === "longtext" ? (
                <textarea style={{ ...inputS, minHeight: 70, resize: "vertical" }} value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder || ""}/>
              ) : f.type === "choice" ? (
                <select style={inputS} value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)}>
                  <option value="">Choose…</option>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "yesno" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {["Yes", "No"].map(v => <button type="button" key={v} onClick={() => set(f.key, v)} style={{ flex: 1, padding: 11, borderRadius: 10, cursor: "pointer", fontWeight: 700, border: "1px solid " + (form[f.key] === v ? gold : "rgba(255,255,255,.18)"), background: form[f.key] === v ? "rgba(255,206,84,.16)" : "rgba(255,255,255,.06)", color: "#fff" }}>{v}</button>)}
                </div>
              ) : (
                <input style={inputS} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                  value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder || ""} inputMode={f.type === "phone" ? "tel" : undefined}/>
              )}
              {f.help && !errMsg && <span style={{ ...mut, display: "block", fontSize: 11.5, marginTop: 4 }}>{f.help}</span>}
              {errMsg && <span style={{ display: "block", fontSize: 12, marginTop: 4, color: "#ff9a9a" }}>{errMsg}</span>}
            </label>
          );
        })}
        {(() => { const ready = (form.fullName || "").trim() && geoReady;
          return <button onClick={() => setStep(1)} disabled={!ready} style={{ padding: 14, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: ready ? 1 : .5 }}>Continue → Photo</button>; })()}
        {geoOn && !geoReady && <p style={{ fontSize: 11.5, textAlign: "center", margin: 0, color: "#ffb0b0" }}>You must be on-site at a registration centre to continue.</p>}
        <p style={{ ...mut, fontSize: 11.5, textAlign: "center", margin: 0 }}>Every field autosaves on this device — nothing is lost if you're interrupted.</p>
      </div>
    )}

    {step === 1 && <GatePhoto photoUrl={photoUrl} setPhotoUrl={setPhotoUrl} onBack={() => setStep(0)} onNext={() => setStep(2)} card={card} gold={gold} goldInk={goldInk} mut={mut}/>}

    {step === 2 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...card, padding: 16, display: "flex", gap: 13, alignItems: "center" }}>
          {photoUrl ? <img src={photoUrl} alt="" style={{ width: 54, height: 54, borderRadius: 12, objectFit: "cover" }}/> : <div style={{ width: 54, height: 54, borderRadius: 12, background: "rgba(255,255,255,.1)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800 }}>{(form.fullName || "?").charAt(0)}</div>}
          <div><div style={{ fontWeight: 800, fontSize: 16 }}>{form.fullName}</div><div style={{ ...mut, fontSize: 13 }}>{form.course || ""}{form.age ? " · " + form.age : ""}</div></div>
        </div>
        <div style={{ ...card, padding: 14, fontSize: 13.5, lineHeight: 1.6 }}>
          <b>Parent:</b> {form.parentName || "—"}<br/>
          <span style={mut}>{[form.parentPhone, form.parentEmail].filter(Boolean).join(" · ") || "no contact — go back and add one"}</span>
        </div>
        <p style={{ ...mut, fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>On submit the parent gets the consent link by {[form.parentPhone && "SMS", form.parentEmail && "email"].filter(Boolean).join(" + ") || "—"}. The ID is issued after they confirm.</p>
        {errors._ && <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,120,120,.12)", border: "1px solid rgba(255,120,120,.35)", fontSize: 13 }}>{errors._}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(1)} style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>← Back</button>
          <button onClick={() => submit(false)} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{busy ? "Registering…" : "Register & notify parent"}</button>
        </div>
      </div>
    )}
  </>);
}

function GatePhoto({ photoUrl, setPhotoUrl, onBack, onNext, card, gold, goldInk, mut }) {
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const [camOpen, setCamOpen] = React.useState(false);
  const [camState, setCamState] = React.useState("idle"); // idle|starting|live|denied
  const [busy, setBusy] = React.useState(false);
  const [uErr, setUErr] = React.useState("");

  const stopStream = React.useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  // The camera only runs while the full-screen overlay is open. Opening it asks
  // for the front camera; closing it (or unmounting the step) releases the
  // hardware so the light doesn't stay on behind the rest of the form.
  React.useEffect(() => {
    if (!camOpen) { stopStream(); return; }
    let cancelled = false;
    setCamState("starting"); setUErr("");
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setCamState("denied"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1350 } }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
        setCamState("live");
      })
      .catch(() => setCamState("denied"));
    return () => { cancelled = true; };
  }, [camOpen, stopStream]);

  // Release the camera when the step unmounts.
  React.useEffect(() => stopStream, [stopStream]);

  const openCam = () => { setUErr(""); setCamOpen(true); };
  const closeCam = () => { setCamOpen(false); setCamState("idle"); };

  const uploadBlob = async (blob) => {
    setBusy(true); setUErr("");
    try {
      const file = new File([blob], "headshot.jpg", { type: "image/jpeg" });
      // Gate registration is a public flow with no session, so the unsigned
      // (public) upload is the primary path. When it isn't set up — or a staff
      // member is signed in at a kiosk — fall back to the signed member path.
      let up;
      try {
        up = await NGGApi.uploadPublic(file);
      } catch (pe) {
        up = await NGGApi.uploadFile(file, "headshot");
      }
      // Face-centred crop + auto colour/lighting via Cloudinary URL transforms —
      // a fast, free client preview; the server pipeline does the professional
      // edit (including a clean studio backdrop) and an editor can re-upload.
      setPhotoUrl(cldEnhance(up.url));
      closeCam();
    } catch (e) {
      // Surface the real reason — a vague message can't be diagnosed or fixed.
      const msg = String((e && (e.message || e.code)) || "");
      if (/disabled|not.?configured|no_cloud|no_secret|missing/i.test(msg) || /_(400|401|403)\b/.test(msg))
        setUErr("Photo uploads aren't set up on this server yet — Cloudinary keys/preset are missing. Skip for now; an editor can add the photo later.");
      else if (/network|failed to fetch|timeout/i.test(msg))
        setUErr("Couldn't reach the photo service — check the connection and try again.");
      else
        setUErr("Upload failed (" + (msg || "unknown error") + "). You can skip and add the photo later.");
    } finally { setBusy(false); }
  };
  const capture = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = 720; c.height = 900;
    const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
    const dx = (c.width - v.videoWidth * scale) / 2, dy = (c.height - v.videoHeight * scale) / 2;
    c.getContext("2d").drawImage(v, dx, dy, v.videoWidth * scale, v.videoHeight * scale);
    c.toBlob(b => b && uploadBlob(b), "image/jpeg", 0.9);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card, overflow: "hidden", position: "relative", height: 300, display: "grid", placeItems: "center" }}>
        {photoUrl ? (
          <PhotoCompare url={photoUrl}/>
        ) : (
          <button onClick={openCam} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", textAlign: "center", padding: 20 }}>
            <div style={{ width: 88, height: 88, margin: "0 auto", borderRadius: "50%", border: "2px dashed rgba(255,206,84,.6)", display: "grid", placeItems: "center", fontSize: 34 }}>📷</div>
            <p style={{ fontWeight: 800, margin: "12px 0 2px", fontSize: 15 }}>Open camera</p>
            <p style={{ ...mut, fontSize: 12.5, margin: 0 }}>Full-screen guide helps you line up the face</p>
          </button>
        )}
      </div>
      <p style={{ ...mut, fontSize: 12.5, textAlign: "center", margin: 0 }}>Center the face — we crop, brighten and set a clean backdrop automatically. Used only for the student ID.</p>
      {uErr && <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,206,84,.12)", border: "1px solid rgba(255,206,84,.4)", fontSize: 13 }}>{uErr}</div>}
      <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) uploadBlob(f); }}/>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>←</button>
        {photoUrl
          ? <button onClick={() => setPhotoUrl("")} style={{ flex: 1, padding: 13, borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Retake</button>
          : <button onClick={openCam} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, cursor: "pointer" }}>{busy ? "Uploading…" : "Open camera"}</button>}
        <button onClick={onNext} disabled={!photoUrl} title={photoUrl ? "" : "A headshot is required"} style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: photoUrl ? gold : "rgba(255,255,255,.14)", color: photoUrl ? goldInk : "rgba(255,255,255,.5)", fontWeight: 800, cursor: photoUrl ? "pointer" : "not-allowed" }}>Use photo →</button>
      </div>
      {camOpen && (
        <CameraOverlay
          videoRef={videoRef} camState={camState} busy={busy}
          onCapture={capture} onClose={closeCam} gold={gold} goldInk={goldInk}
          onPickFile={() => fileRef.current && fileRef.current.click()}
        />
      )}
    </div>
  );
}

/* Full-screen guided camera. A fixed overlay above the whole app: the live
 * front-camera fills the screen, a dimming scrim with a transparent face oval
 * shows exactly where to line up, and a shutter sits at the bottom. Falls back
 * to a device-photo picker when the camera is blocked or unavailable. */
function CameraOverlay({ videoRef, camState, busy, onCapture, onClose, onPickFile, gold, goldInk }) {
  // Lock body scroll while the overlay is up.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const shell = { position: "fixed", inset: 0, zIndex: 4000, background: "#000", display: "flex", flexDirection: "column", overscrollBehavior: "contain" };
  const iconBtn = { width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.35)", background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 20, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1 };

  return (
    <div style={shell} role="dialog" aria-modal="true" aria-label="Take ID photo">
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {camState === "live" ? (
          <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}/>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: "#fff" }}>
            <div>
              <div style={{ fontSize: 40 }}>📷</div>
              <p style={{ margin: "12px 0 0", fontSize: 15, maxWidth: 320 }}>
                {camState === "starting"
                  ? "Starting the camera…"
                  : "Camera unavailable or blocked. Allow camera access, or use a photo from this device instead."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Guide: a dashed face oval with everything outside it dimmed. */}
      {camState === "live" && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div style={{ width: "min(72vw, 320px)", height: "min(92vw, 410px)", borderRadius: "50% 50% 47% 47%", border: "3px dashed rgba(255,206,84,.9)", boxShadow: "0 0 0 100vmax rgba(0,0,0,.55)" }}/>
        </div>
      )}

      {/* Top bar: close + instruction. */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 0" }}>
        <button onClick={onClose} style={iconBtn} aria-label="Close camera">✕</button>
        <div style={{ color: "#fff", fontSize: 13.5, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
          Line the face up inside the oval
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      {/* Bottom controls: file fallback · shutter · retake-of-space. */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px calc(env(safe-area-inset-bottom, 0px) + 28px)" }}>
        <button onClick={onPickFile} disabled={busy} style={{ ...iconBtn, fontSize: 18 }} aria-label="Use a photo from this device">🖼️</button>
        <button onClick={onCapture} disabled={busy || camState !== "live"} aria-label="Take photo"
          style={{ width: 78, height: 78, borderRadius: "50%", border: "5px solid rgba(255,255,255,.85)", background: busy ? "rgba(255,255,255,.4)" : gold, cursor: busy || camState !== "live" ? "default" : "pointer", boxShadow: "0 6px 22px rgba(0,0,0,.4)" }}>
          {busy ? <span style={{ color: goldInk, fontSize: 12, fontWeight: 800 }}>…</span> : null}
        </button>
        <div style={{ width: 44 }}/>
      </div>
    </div>
  );
}

/* Guardian re-shoot page (/reshoot?t=…) — a no-account, phone-first uploader
 * the guardian reaches from the emailed retake link. */
function ReshootPage() {
  const t = new URLSearchParams(window.location.search).get("t") || "";
  const fileRef = React.useRef(null);
  const [ctx, setCtx] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading|ready|error|done
  const [err, setErr] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [uErr, setUErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const navy = "#16223e", gold = "#ffce54", goldInk = "#2b2100";
  const card = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14 };
  const mut = { color: "rgba(230,238,255,.62)" };
  const shell = (children) => (
    <div style={{ minHeight: "100vh", background: navy, color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "26px 18px 70px" }}>{children}</div>
    </div>
  );

  React.useEffect(() => {
    if (!t) { setErr("This link is missing its code."); setState("error"); return; }
    NGGApi.public.reshoot.context(t)
      .then(r => { setCtx(r); setState("ready"); })
      .catch(e => { const c = e.code || e.message; setErr(c === "link_invalid" ? "This photo link isn't valid or has already been used." : "Couldn't load — check your connection and reopen the link."); setState("error"); });
  }, [t]);

  const upload = async (file) => {
    setUploading(true); setUErr("");
    try {
      let up;
      try { up = await NGGApi.uploadPublic(file); }
      catch (pe) { up = await NGGApi.uploadFile(file, "headshot"); }
      setPhotoUrl(cldEnhance(up.url));
    } catch (e) {
      const m = String((e && (e.message || e.code)) || "");
      setUErr(/network|failed to fetch/i.test(m) ? "Couldn't reach the photo service — check the connection." : "Upload failed — please try another photo.");
    } finally { setUploading(false); }
  };
  const submit = async () => {
    if (!photoUrl || busy) return;
    setBusy(true); setUErr("");
    try { await NGGApi.public.reshoot.submit(t, photoUrl); setState("done"); }
    catch (e) { setUErr(e.code === "bad_photo" ? "That photo didn't come through — try again." : "Couldn't send the photo — try again."); }
    finally { setBusy(false); }
  };
  const first = ctx && ctx.student ? String(ctx.student.name || "").split(" ")[0] : "";

  if (state === "loading") return shell(<div style={{ textAlign: "center", padding: "90px 0" }}><div className="dash-spinner"/></div>);
  if (state === "error") return shell(<div style={{ ...card, padding: 24, marginTop: 60 }}><h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Photo link</h1><p style={mut}>{err}</p></div>);
  if (state === "done") return shell(<div style={{ ...card, padding: 24, textAlign: "center", marginTop: 50 }}>
    <div style={{ fontSize: 40 }}>✅</div>
    <h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>Thank you!</h1>
    <p style={mut}>The new photo is in. Our team will check it and finish {first || "your child"}'s ID — no need to do anything else.</p>
  </div>);

  return shell(<>
    <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>NEW PHOTO</div>
    <h1 style={{ fontSize: 22, margin: "4px 0 12px", fontWeight: 800 }}>A quick new photo{first ? " for " + first : ""}</h1>
    {ctx && ctx.reason
      ? <div style={{ ...card, padding: 14, marginBottom: 12, fontSize: 13.5, lineHeight: 1.5 }}><b style={{ color: gold }}>What to fix:</b> {ctx.reason}</div>
      : <p style={{ ...mut, fontSize: 13.5, marginBottom: 12 }}>Please use a clear, front-facing photo in good light, with a plain background.</p>}

    <div style={{ ...card, overflow: "hidden", height: 300, display: "grid", placeItems: "center", marginBottom: 12 }}>
      {photoUrl
        ? <PhotoCompare url={photoUrl}/>
        : ctx && ctx.student && ctx.student.photoUrl
          ? <img src={ctx.student.photoUrl} alt="Current" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .45 }}/>
          : <div style={{ textAlign: "center" }}><div style={{ fontSize: 34 }}>📷</div><p style={{ ...mut, fontSize: 13, margin: "8px 0 0" }}>Tap below to take or choose a photo</p></div>}
    </div>
    {uErr && <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,206,84,.12)", border: "1px solid rgba(255,206,84,.4)", fontSize: 13, marginBottom: 10 }}>{uErr}</div>}
    <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) upload(f); }}/>

    {!photoUrl
      ? <button onClick={() => fileRef.current && fileRef.current.click()} disabled={uploading} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{uploading ? "Uploading…" : "Take / choose photo"}</button>
      : <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setPhotoUrl(""); }} disabled={busy} style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Retake</button>
          <button onClick={submit} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{busy ? "Sending…" : "Send this photo →"}</button>
        </div>}
    <p style={{ ...mut, fontSize: 11.5, textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>Used only for {first || "your child"}'s program ID. We enhance lighting and framing but never change the face.</p>
  </>);
}

// Pull a check-in token out of whatever the QR encodes: a full digital-ID URL
// (…/q/<token> or …/s/<handle>) or a bare printed code.
function extractCheckinToken(s) {
  s = String(s || "").trim();
  const m = s.match(/\/(?:q|s)\/([^/?#\s]+)/i);
  if (m) { try { return decodeURIComponent(m[1]).toUpperCase(); } catch (_) { return m[1].toUpperCase(); } }
  return s.replace(/^https?:\/\/[^/]+\/?/i, "").toUpperCase();
}

// Camera-first QR reader (window.jsQR). Scans continuously, debounces repeat
// reads, and calls onToken with the extracted code. Falls back gracefully when
// the camera is denied or the decoder isn't loaded.
function QRScanner({ onToken, gold }) {
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const last = React.useRef({ tok: "", at: 0 });
  const [state, setState] = React.useState("starting"); // starting|live|denied|nolib
  const [hit, setHit] = React.useState(0); // brief flash on a successful read

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.jsQR !== "function") { setState("nolib"); return; }
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tick = () => {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        let img = null; try { img = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (_) {}
        if (img) {
          const res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (res && res.data) {
            const tok = extractCheckinToken(res.data);
            const now = Date.now();
            if (tok && (tok !== last.current.tok || now - last.current.at > 2500)) {
              last.current = { tok, at: now };
              setHit(now);
              if (navigator.vibrate) { try { navigator.vibrate(40); } catch (_) {} }
              onToken(tok);
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false })
          .then(stream => {
            if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.setAttribute("playsinline", ""); videoRef.current.muted = true; videoRef.current.play().catch(() => {}); }
            setState("live"); rafRef.current = requestAnimationFrame(tick);
          })
          .catch(() => setState("denied"))
      : setState("denied");
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  const flashing = hit && (Date.now() - hit < 700);
  const box = { position: "relative", width: "100%", aspectRatio: "1/1", maxHeight: 340, borderRadius: 16, overflow: "hidden", background: "#05070f", display: "grid", placeItems: "center" };
  if (state === "nolib" || state === "denied") {
    return (
      <div style={{ ...box, aspectRatio: "auto", minHeight: 120, padding: 20, textAlign: "center", color: "rgba(230,238,255,.7)", fontSize: 13 }}>
        <div><div style={{ fontSize: 26, marginBottom: 8 }} aria-hidden="true">{state === "denied" ? "📷" : "⌨"}</div>
        {state === "denied" ? "Camera unavailable — type the code below to check in." : "Scanner still loading — type the code below."}</div>
      </div>
    );
  }
  return (
    <div style={box} aria-label="QR scanner">
      <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted/>
      {state === "starting" && <div style={{ position: "absolute", color: "rgba(230,238,255,.7)", fontSize: 13 }}>Starting camera…</div>}
      {/* Reticle */}
      <div aria-hidden="true" style={{ position: "absolute", inset: "18%", border: "3px solid " + (flashing ? "#6fdc9d" : (gold || "#ffce54")), borderRadius: 14, boxShadow: "0 0 0 100vmax rgba(0,0,0,.28)", transition: "border-color .2s" }}/>
      <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12, textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>{flashing ? "✓ Scanned" : "Point the QR at the camera"}</div>
    </div>
  );
}

function GateCheckin({ g, ctx, card, inputS, gold, goldInk }) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // The camera effect captures `mark` once (deps []), so its `busy` closure is
  // frozen false — guard the in-flight state through a ref the closure can read live.
  const busyRef = React.useRef(false);
  const [recent, setRecent] = React.useState([]);
  const [err, setErr] = React.useState("");
  const [typed, setTyped] = React.useState(false); // reveal the manual fallback
  // Attendance-taker duty for this gate's centre today (rotation banner).
  const [duty, setDuty] = React.useState((ctx && ctx.duty) || null);
  const [dutyMsg, setDutyMsg] = React.useState("");
  const [dutyBusy, setDutyBusy] = React.useState(false);
  const centre = (ctx && ctx.centre) || "";
  // Offline scan queue — field kiosks lose signal; a scan must never be lost.
  const [pending, setPending] = React.useState(0);
  const flushing = React.useRef(false);
  const QKEY = "ngg.gate.q." + g;
  const loadQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (_) { return []; } };
  const saveQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (_) {} setPending(q.length); };
  // A network/offline failure has no server error code/status; a real rejection
  // (qr_unassigned, student_not_found) does — only the former should queue.
  const isNetErr = (e) => (typeof navigator !== "undefined" && !navigator.onLine) || (e && !e.code && !e.status);
  // Remove one token by re-reading storage first, so a scan enqueued during an
  // in-flight sync is never clobbered by a stale in-memory copy of the queue.
  const dequeue = (token) => { saveQ(loadQ().filter(x => x.token !== token)); };
  const flushQueue = async () => {
    if (flushing.current || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    const snapshot = loadQ(); if (!snapshot.length) return;
    flushing.current = true;
    try {
      for (const item of snapshot) {
        try {
          const r = await NGGApi.public.gate.checkin(g, item.token);
          dequeue(item.token);
          const st = r.student || {};
          setRecent(list => [{ name: st.fullName || item.token, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), already: !!r.already, synced: true }, ...list].slice(0, 12));
        } catch (e) {
          if (isNetErr(e)) break;                       // still offline — stop, keep the rest
          // The server rejected a banked scan (e.g. unassigned card). Drop it, but
          // never silently: tell the operator and flag it so it can be re-scanned.
          dequeue(item.token);
          setErr("A saved scan couldn't be synced (" + (e.code === "qr_unassigned" ? "code not assigned" : e.code === "student_not_found" ? "no member for that code" : (e.code || "rejected")) + "). Please re-scan that card.");
          setRecent(list => [{ name: item.token, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), failed: true }, ...list].slice(0, 12));
        }
      }
    } finally { flushing.current = false; }
  };
  React.useEffect(() => {
    setPending(loadQ().length);
    flushQueue();
    const onOnline = () => flushQueue();
    window.addEventListener("online", onOnline);
    const id = setInterval(() => { if (loadQ().length) flushQueue(); }, 20000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(id); };
    // eslint-disable-next-line
  }, []);

  const closeRoll = async () => {
    if (dutyBusy) return;
    setDutyBusy(true); setDutyMsg("");
    try {
      const r = await NGGApi.public.gate.dutyClose(g);
      setDutyMsg(r.message || "Roll closed.");
      setDuty(d => d ? { ...d, completedAt: new Date().toISOString(), takenCount: r.taken } : d);
    } catch (e) {
      setDutyMsg(e.code === "no_duty" ? "No one is on duty for this centre yet." : "Couldn't close the roll — try again.");
    } finally { setDutyBusy(false); }
  };

  const mark = async (raw) => {
    const token = String(raw || "").trim(); if (!token || busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr("");
    try {
      const r = await NGGApi.public.gate.checkin(g, token);
      const st = r.student || {};
      const isVol = st.kind === "volunteer";
      setRecent(list => [{
        name: st.fullName,
        at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        already: !!r.already,
        volunteer: isVol,
        role: st.role || "",
        // Warn if a volunteer who works with youth hasn't cleared screening.
        warn: isVol && st.role !== "admin" && st.safeguardingCleared === false,
        cert: r.certIssued ? r.certIssued.milestone : 0,
        late: r.status === "late" ? (r.lateMinutes || 0) : 0,
      }, ...list].slice(0, 12));
      setCode("");
    } catch (e2) {
      if (isNetErr(e2)) {
        // Offline / unreachable — bank it and sync later so the scan isn't lost.
        const q = loadQ(); if (!q.some(x => x.token === token)) { q.push({ token, at: Date.now() }); saveQ(q); }
        setRecent(list => [{ name: token, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), queued: true }, ...list].slice(0, 12));
        setCode("");
      } else {
        const c = e2.code || e2.message;
        setErr(c === "qr_unassigned" ? "That code isn't assigned to anyone yet." : c === "student_not_found" ? "No student or volunteer found for that code." : "Couldn't check in — try again.");
      }
    } finally { busyRef.current = false; setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Attendance-taker rotation: who's on the roll today + one-tap close. */}
      {duty && (
        <div style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderLeft: "3px solid " + gold }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(230,238,255,.55)", fontFamily: "var(--font-mono, monospace)" }}>On attendance duty{centre ? " · " + centre : ""}</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{duty.volunteer ? duty.volunteer.fullName : "Unassigned"}</div>
          </div>
          {duty.completedAt
            ? <span className="chip chip-lime" style={{ fontSize: 11 }}>Roll closed{duty.takenCount ? " · " + duty.takenCount + " present" : ""}</span>
            : <button type="button" onClick={closeRoll} disabled={dutyBusy || !duty.volunteer} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid " + gold, background: "transparent", color: gold, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{dutyBusy ? "Closing…" : "Close the roll"}</button>}
        </div>
      )}
      {dutyMsg && <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(111,220,157,.12)", border: "1px solid rgba(111,220,157,.35)", fontSize: 13 }}>{dutyMsg}</div>}
      {/* QR-first: the camera scans continuously; typing is the fallback. */}
      <QRScanner onToken={mark} gold={gold}/>
      <p style={{ color: "rgba(230,238,255,.62)", fontSize: 12, margin: 0, textAlign: "center" }}>Hold a Genius ID or volunteer card up to the camera. Students and volunteers both scan here — a duplicate scan is safe, a day counts once.</p>
      {pending > 0 && (
        <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(245,176,38,.14)", border: "1px solid rgba(245,176,38,.4)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true">☁︎</span>
          <span style={{ flex: 1 }}>{pending} scan{pending === 1 ? "" : "s"} saved offline — they'll sync automatically when you're back online.</span>
          <button type="button" onClick={flushQueue} style={{ background: "none", border: "1px solid rgba(245,176,38,.5)", color: gold, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Sync now</button>
        </div>
      )}
      {!typed
        ? <button type="button" onClick={() => setTyped(true)} style={{ background: "none", border: "none", color: "rgba(230,238,255,.8)", textDecoration: "underline", cursor: "pointer", fontSize: 13, alignSelf: "center" }}>Camera not working? Enter the code</button>
        : (
          <form onSubmit={e => { e.preventDefault(); mark(code); setCode(""); }} style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inputS, flex: 1, fontFamily: "var(--font-mono, monospace)", letterSpacing: ".08em" }} placeholder="Code from the ID card (SUMQR / VOLQR)" value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoFocus/>
            <button disabled={busy || !code.trim()} style={{ padding: "0 20px", borderRadius: 11, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{busy ? "…" : "✓"}</button>
          </form>
        )}
      {err && <div role="alert" style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,120,120,.12)", border: "1px solid rgba(255,120,120,.35)", fontSize: 13 }}>{err}</div>}
      <div role="status" aria-live="polite" aria-label="Recent check-ins" style={{ display: "contents" }}>
      {recent.map((r, i) => (
        <div key={r.at + "|" + (r.name || "") + "|" + (r.failed ? "f" : r.synced ? "s" : r.queued ? "q" : r.already ? "a" : "n") + "|" + i} style={{ ...card, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, border: (r.warn || r.failed) ? "1px solid rgba(255,120,120,.5)" : (card.border || undefined) }}>
          <span style={{ color: r.failed ? "#ff9a9a" : r.queued ? "#ffce54" : r.already ? "#ffce54" : "#6fdc9d", fontWeight: 800 }}>{r.failed ? "✕" : r.queued ? "☁︎" : r.already ? "↻" : "✓"}</span>
          <b style={{ flex: 1, fontSize: 14, fontFamily: (r.queued || r.failed) ? "var(--font-mono, monospace)" : undefined }}>{r.name}{r.volunteer && <span style={{ marginLeft: 8, fontSize: 10, letterSpacing: ".1em", padding: "2px 7px", borderRadius: 6, background: "rgba(245,176,38,.18)", color: "#ffce54", fontWeight: 700 }}>{(r.role || "VOL").toUpperCase()}</span>}</b>
          {r.cert > 0 && <span title={r.cert + "-session certificate issued"} style={{ fontSize: 11, color: "#6fdc9d", fontWeight: 700 }}>🏅 {r.cert}</span>}
          {r.late > 0 && <span title={"Arrived " + r.late + " min after resumption"} style={{ fontSize: 10, letterSpacing: ".08em", padding: "2px 7px", borderRadius: 6, background: "rgba(255,120,120,.16)", color: "#ff9a9a", fontWeight: 700 }}>LATE · {r.late}m</span>}
          <span style={{ color: "rgba(230,238,255,.6)", fontSize: 12 }}>{r.failed ? "failed — re-scan · " : r.queued ? "saved offline · " : r.synced ? "synced · " : r.already ? "already in · " : ""}{r.at}</span>
        </div>
      ))}
      </div>
      {recent.some(r => r.warn) && <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,120,120,.12)", border: "1px solid rgba(255,120,120,.35)", fontSize: 12.5 }}>⚠ A volunteer above has not cleared safeguarding screening. They should not be unsupervised with young people.</div>}
      {!recent.length && <p style={{ color: "rgba(230,238,255,.45)", fontSize: 13, textAlign: "center", marginTop: 20 }}>Check-ins appear here as they happen.</p>}
    </div>
  );
}

/* ============================================================================
   ID Card Studio (/cards) — renders the 2026 Summer ID design exactly:
   590×1004 front (logo lockup · circular photo with soft shadow · crimson
   first name / navy surname in TT Firs Neue · track · QR of the check-in
   token · centre-coloured bar) + back (Ìlú Èkó Pagkaki watermark · LCASP
   year · program contacts · printed ID). Admin-managed centres drive the
   bar colour and the CODE-YY-serial ID. Print = true 54×92mm per card.
   ============================================================================ */
const CARD_CRIMSON = "#E4155F", CARD_NAVY = "#1B2B6B";
// The card artwork is laid out in a 590-wide design grid. Its height is the
// default 54×89 mm card at that width (590·89/54 ≈ 972), so the default prints
// with NO scaling at all (vf = 1). A non-default admin proportion scales the
// whole card vertically from this base — bounded and only when they deviate.
const CARD_DESIGN_H = 972;

function CardQR({ token, size }) {
  const [src, setSrc] = React.useState("");
  React.useEffect(() => {
    // Encode the FULL profile URL (not the bare token) so a normal phone camera
    // / any QR app opens the student's page on the site. The kiosk decoder
    // (extractCheckinToken) still pulls the token back out for check-in.
    const origin = (typeof window !== "undefined" && window.location && window.location.origin) ? window.location.origin : "https://next.afrovanguard.org.ng";
    const payload = origin + "/q/" + String(token);
    const draw = () => {
      try {
        const q = window.qrcode(0, "M");
        q.addData(payload); q.make();
        setSrc(q.createDataURL(8, 0));
      } catch (_) {}
    };
    if (window.qrcode) { draw(); return; }
    let sc = document.getElementById("ngg-qrlib");
    if (!sc) { sc = document.createElement("script"); sc.id = "ngg-qrlib"; sc.src = "/vendor/qrcode.min.js"; document.head.appendChild(sc); }
    sc.addEventListener("load", draw, { once: true });
  }, [token]);
  return src ? <img className="card-qr" src={src} alt={"QR " + token} style={{ width: size, height: size, imageRendering: "pixelated" }}/> : <div style={{ width: size, height: size, background: "#f2f2f2" }}/>;
}

// Adaptive name sizing: a long name shrinks to stay on one line inside the
// card, so the layout is context-aware instead of clipping. `base` is the
// comfortable size; past `maxChars` it scales down proportionally (floored so
// it never gets illegibly small).
function nameFontPx(text, base, maxChars) {
  const n = ((text || "").trim().length) || 1;
  return n > maxChars ? Math.max(base * 0.62, base * maxChars / n) : base;
}
// Bake a face-aware fill crop into the Cloudinary URL at the frame's aspect
// ratio, so the delivered image already IS the frame shape — it can't sit
// off-frame even in a rasteriser that ignores CSS object-fit. Non-Cloudinary
// URLs pass through unchanged (CSS object-fit still covers them).
function cardFacePhoto(url, w, h) {
  if (!url || url.indexOf("/upload/") === -1) return url;
  const i = url.indexOf("/upload/");
  let tail = url.slice(i + 8);                       // "<transform>/v123/id" or "v123/id"
  const slash = tail.indexOf("/");
  const seg = slash === -1 ? "" : tail.slice(0, slash);
  const hasTransform = seg && !/^v\d+$/.test(seg) && /[,_]/.test(seg);
  const rest = hasTransform ? tail.slice(slash + 1) : tail;
  let params;
  if (hasTransform) {
    // Preserve the admin's edit (gravity, zoom, brighten, sharpen, background) —
    // only retarget the crop to this frame's aspect so the delivered pixels ARE
    // the box shape (html2canvas ignores object-fit, so a mismatched aspect
    // would distort). Drop the stored sizing/crop/aspect; keep everything else.
    params = seg.split(",").filter(p => p && !/^(w_|h_|c_|ar_|dpr_)/.test(p));
    if (!params.some(p => /^g_/.test(p))) params.unshift("g_face");
    params.unshift("c_fill");
    params.push("w_" + w, "h_" + h);
    if (!params.some(p => /^f_/.test(p))) params.push("f_auto");
    if (!params.some(p => /^q_/.test(p))) params.push("q_auto:good");
  } else {
    // Raw upload with no transform yet — face-crop to the frame with a light enhance.
    params = ["c_fill", "g_face", "w_" + w, "h_" + h, "f_auto", "q_auto:good", "e_improve:30"];
  }
  return url.slice(0, i + 8) + params.join(",") + "/" + rest;
}

function CardFront({ card, program, S, H = CARD_DESIGN_H }) {
  const px = (n) => n * S;
  const lockup = (program && program.logoLockup) || "/assets/idcard/logo-lockup.png";
  // A record with no centre used to throw here, and because nothing scoped the
  // failure React tore down the tree and the whole studio rendered blank — not
  // one bad card, an empty page. Missing data must never cost more than a
  // default colour.
  const centre = card.centre || {};
  // Reflow: every element scales UNIFORMLY (never stretched) and flexible
  // spacers absorb the height difference, so any proportion renders without
  // distortion. Photo caps at its design diameter, shrinks on short cards.
  const photoD = Math.min(320, Math.max(150, Math.round(H * 0.34)));
  return (
    <div className="idcard" style={{ width: px(590), height: px(H), background: "#fff", position: "relative", overflow: "hidden", fontFamily: '"Inter", system-ui, sans-serif', flex: "none", display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box", padding: px(34) + "px " + px(24) + "px " + px(44) + "px" }}>
      <img src={lockup} alt="Programme lockup" style={{ width: px(290), flex: "none" }}/>
      <div style={{ flex: "1 1 0", minHeight: px(6) }}/>
      <div style={{ width: px(photoD), height: px(photoD), borderRadius: "50%", overflow: "hidden", background: "linear-gradient(180deg,#dff0fb 55%,#8fbb3f 90%)", boxShadow: `0 ${px(14)}px ${px(34)}px rgba(27,43,107,.16)`, flex: "none" }}>
        {card.photoUrl && <img src={cardFacePhoto(card.photoUrl, 900, 900)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>}
      </div>
      <div style={{ width: px(30), height: px(6), borderRadius: px(3), background: "#8FA3C8", margin: px(15) + "px 0 " + px(9) + "px", flex: "none" }}/>
      <div style={{ textAlign: "center", fontFamily: '"TT Firs Neue","Inter",sans-serif', fontWeight: 800, fontSize: px(nameFontPx(card.firstName, 42, 12)), lineHeight: 1.04, color: CARD_CRIMSON, textTransform: "uppercase", letterSpacing: px(-1), whiteSpace: "nowrap", flex: "none", maxWidth: "100%" }}>{card.firstName}</div>
      <div style={{ textAlign: "center", fontFamily: '"TT Firs Neue","Inter",sans-serif', fontWeight: 800, fontSize: px(nameFontPx(card.surname, 46, 12)), lineHeight: 1.02, color: CARD_NAVY, textTransform: "uppercase", letterSpacing: px(-1), padding:`0 ${px(16)}px`, whiteSpace: "nowrap" }}>{card.surname || " "}</div>
      <div style={{ textAlign: "center", fontWeight: 500, fontSize: px(22), color: "#111", textTransform: "uppercase", letterSpacing: px(1.4), marginTop: px(9), flex: "none" }}>
        {(() => {
          // "Arts • Tye & Dye" → bold category, dot, regular course (v3 design).
          const parts = String(card.track || "").split(/\s*[•·]\s*/);
          return parts.length > 1
            ? <><span style={{ fontWeight: 800 }}>{parts[0]}</span> • {parts.slice(1).join(" • ")}</>
            : <span style={{ fontWeight: 800, color: CARD_NAVY }}>{card.track}</span>;
        })()}
      </div>
      <div style={{ flex: "1 1 0", minHeight: px(6) }}/>
      <div style={{ width: px(400), maxWidth: "86%", height: 1, background: "#E4E4E4", flex: "none" }}/>
      <div style={{ border: `${Math.max(1, px(3))}px solid #101010`, borderRadius: px(16), padding: px(8), background: "#fff", marginTop: px(13), flex: "none" }}>
        <CardQR token={card.token} size={px(104)}/>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: px(28), background: centre.color || "#76B043" }}/>
    </div>
  );
}

/* Volunteer front — the whole card is the hierarchy-tier colour, with a white
   inner panel. STS badge top, headshot/illustration, name, QR, VOLUNTEER|ROLE.
   Same 590×1004 canvas as the student card so both print at 54×92mm. */
function VolunteerCardFront({ card, S, H = CARD_DESIGN_H }) {
  const px = (n) => n * S;
  const tier = card.tier || {};                 // same hazard as centre, above
  const tint = tier.color || "#00225F";
  // Headshot keeps its 450:354 aspect (never stretched) and scales with the card.
  const hsH = Math.min(354, Math.max(150, Math.round(H * 0.34)));
  const hsW = Math.round(hsH * 450 / 354);
  return (
    <div className="idcard" style={{ width: px(590), height: px(H), background: tint, position: "relative", overflow: "hidden", fontFamily: '"Inter", system-ui, sans-serif', flex: "none" }}>
      {/* White inner panel — the tier colour reads as a full-bleed border. */}
      <div style={{ position: "absolute", top: px(22), left: px(22), right: px(22), bottom: px(22), background: "#fff", borderRadius: px(30) }}/>
      {/* STS badge, straddling the top edge of the panel. */}
      <div style={{ position: "absolute", top: px(2), left: "50%", transform: "translateX(-50%)", width: px(116), height: px(116), zIndex: 2 }}>
        <div style={{ position: "absolute", inset: px(8), borderRadius: "50%", background: tint, boxShadow: `0 ${px(6)}px ${px(16)}px rgba(0,0,0,.18)`, display: "grid", placeItems: "center" }}>
          <span style={{ fontFamily: '"TT Firs Neue","Inter",sans-serif', fontWeight: 800, fontSize: px(34), letterSpacing: px(1), color: "#fff" }}>STS</span>
        </div>
        <img src="/assets/idcard/logo-sts.svg" alt="Street-To-Stardom" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
          onError={e => { e.target.style.display = "none"; }}/>
      </div>
      {/* Content column inside the panel — reflows to any card height. */}
      <div style={{ position: "absolute", top: px(22), left: px(22), right: px(22), bottom: px(22), display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box", padding: px(94) + "px " + px(40) + "px " + px(28) + "px" }}>
        <div style={{ width: px(hsW), height: px(hsH), borderRadius: px(22), overflow: "hidden", background: "linear-gradient(180deg,#dff0fb 52%,#8fbb3f 92%)", boxShadow: `0 ${px(10)}px ${px(26)}px rgba(27,43,107,.14)`, flex: "none" }}>
          {card.photoUrl && <img src={cardFacePhoto(card.photoUrl, 900, 708)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>}
        </div>
        <div style={{ flex: "1 1 0", minHeight: px(6) }}/>
        <div style={{ textAlign: "center", fontFamily: '"TT Firs Neue","Inter",sans-serif', fontWeight: 800, fontSize: px(nameFontPx(card.firstName, 42, 12)), lineHeight: 1.04, color: CARD_CRIMSON, textTransform: "uppercase", letterSpacing: px(-1), whiteSpace: "nowrap", flex: "none", maxWidth: "100%" }}>{card.firstName}</div>
        <div style={{ textAlign: "center", fontFamily: '"TT Firs Neue","Inter",sans-serif', fontWeight: 800, fontSize: px(nameFontPx(card.surname, 46, 12)), lineHeight: 1.02, color: CARD_NAVY, textTransform: "uppercase", letterSpacing: px(-1), whiteSpace: "nowrap", flex: "none", maxWidth: "100%" }}>{card.surname || " "}</div>
        <div style={{ width: px(360), maxWidth: "92%", height: 1, background: "#E4E4E4", marginTop: px(12), flex: "none" }}/>
        <div style={{ border: `${Math.max(1, px(3))}px solid #101010`, borderRadius: px(16), padding: px(8), background: "#fff", marginTop: px(14), flex: "none" }}>
          <CardQR token={card.token} size={px(112)}/>
        </div>
        <div style={{ flex: "1 1 0", minHeight: px(6) }}/>
        <div style={{ textAlign: "center", fontSize: px(24), letterSpacing: px(1.2), color: "#101010", textTransform: "uppercase", flex: "none" }}>
          <span style={{ fontWeight: 800 }}>Volunteer</span>
          <span style={{ margin: `0 ${px(8)}px`, color: "#B9BFCB" }}>|</span>
          <span style={{ fontWeight: 500 }}>{card.role || tier.name || ""}</span>
        </div>
      </div>
    </div>
  );
}

function CardBack({ card, program, S, H = CARD_DESIGN_H }) {
  const px = (n) => n * S;
  // Vertical-position scaler: element SIZES stay fixed (px) so nothing is
  // stretched; only the top offsets scale, so the back reflows to any height
  // without distortion (the icon dots stay perfectly round).
  const pt = (n) => n * S * (H / CARD_DESIGN_H);
  // The back is shared by students and volunteers; the 3rd row is a CENTRE
  // for students and the ROLE for volunteers (who have no centre).
  const isVol = !!card.tier;
  const key = card.studentId || card.volunteerId || card.displayId;
  const midRow = isVol
    ? ["ROLE", String(card.role || (card.tier && card.tier.name) || "").toUpperCase(), "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-9 9a9 9 0 0 1 18 0"]
    : ["CENTRE", ((card.centre && card.centre.name) || "").toUpperCase(), "M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"];
  const rows = [
    ["WEBSITE", program.website, "M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0Zm2 0h16M12 2c3 3.5 3 16.5 0 20-3-3.5-3-16.5 0-20Z"],
    ["PHONE", program.phone, "M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"],
    midRow,
    ["ID", card.displayId, "M4 5h16v14H4zM8 9.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM7 15c.7-1.8 2.2-2.5 3-2.5s2.3.7 3 2.5M15 10h3M15 13h3"],
  ];
  const wm = [];
  for (let i = 0; i < 9; i++) wm.push(<div key={i} style={{ fontFamily: '"Pagkaki", Georgia, serif', fontWeight: 800, fontSize: px(86), lineHeight: 1.28, color: "rgba(27,43,107,.045)", whiteSpace: "nowrap", textTransform: "uppercase", marginLeft: (i % 2 ? px(-70) : 0) }}>ÈKÓ ÌLÚ ÈKÓ ÌLÚ</div>);
  return (
    <div className="idcard" style={{ width: px(590), height: px(H), background: "#fff", position: "relative", overflow: "hidden", fontFamily: '"Inter", system-ui, sans-serif', flex: "none" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>{wm}</div>
      {/* Woven aso-oke trim across the top — stepped two-tone chevrons in
          muted blue-gray, matching the textile band on the printed design. */}
      <svg aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: px(26) }} viewBox="0 0 590 26" preserveAspectRatio="none">
        <pattern id={"wv" + key} width="73.75" height="26" patternUnits="userSpaceOnUse">
          <path d="M0 -6 L36.9 10 L73.75 -6" fill="none" stroke="#CDD3E1" strokeWidth="5"/>
          <path d="M0 4 L36.9 20 L73.75 4" fill="none" stroke="#A9B2C9" strokeWidth="5"/>
          <path d="M0 20 L36.9 4 L73.75 20" fill="none" stroke="#C2C9DA" strokeWidth="3.4"/>
        </pattern>
        <rect width="590" height="26" fill={"url(#wv" + key + ")"}/>
        <rect y="24.4" width="590" height="1.6" fill="#9AA3BE" opacity="0.55"/>
      </svg>
      <div style={{ position: "absolute", top: pt(170), left: 0, right: 0, textAlign: "center", fontFamily: '"TT Firs Neue","Inter",sans-serif', fontWeight: 800, fontSize: px(62), letterSpacing: px(-1) }}>
        <span style={{ color: CARD_CRIMSON }}>{program.program}</span> <span style={{ color: CARD_NAVY }}>{program.year}</span>
      </div>
      <div style={{ position: "absolute", top: pt(244), left: 0, right: 0, textAlign: "center", fontWeight: 800, fontSize: px(23), color: CARD_NAVY, letterSpacing: px(2) }}>{program.motto}</div>
      <div style={{ position: "absolute", top: pt(296), left: "50%", transform: "translateX(-50%)", width: px(400), height: 1, background: "#D9D9D9" }}/>
      <div style={{ position: "absolute", top: pt(342), left: px(155), display: "flex", flexDirection: "column", gap: px(28) }}>
        {rows.map(([label, value, path]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: px(22) }}>
            <span style={{ width: px(46), height: px(46), borderRadius: "50%", background: "#101010", display: "grid", placeItems: "center", flex: "none" }}>
              <svg width={px(24)} height={px(24)} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d={path}/></svg>
            </span>
            <span>
              <span style={{ display: "block", fontWeight: 800, fontSize: px(19), color: "#101010", letterSpacing: px(1) }}>{label}</span>
              <span style={{ display: "block", fontWeight: 500, fontSize: px(19), color: "#101010", marginTop: px(2) }}>{value}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: pt(714), left: "50%", transform: "translateX(-50%)", width: px(400), height: 1, background: "#D9D9D9" }}/>
      <div style={{ position: "absolute", top: pt(748), left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: px(14) }}>
        <img src={(program && program.logoOkun) || "/assets/idcard/logo-okun.png"} alt="Okun Alimọsho" style={{ height: px(64) }}
          onError={e => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "none"; }}/>
        <span aria-hidden="true" style={{ width: 1.5, height: px(44), background: "#C9CDD8" }}/>
        <img src={(program && program.logoLockup) || "/assets/idcard/logo-lockup.png"} alt="Programme lockup" style={{ width: px(230) }}/>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: px(28), background: "#00225F" }}/>
    </div>
  );
}

/* Stands in for one card the renderer choked on, naming the record, so a bad
   row costs its own slot instead of the entire roster. */
function CardDrawFailed({ id }) {
  return (
    <div style={{ width: 295, height: 240, borderRadius: 6, border: "1px dashed rgba(255,154,154,.6)", background: "rgba(255,154,154,.08)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, textAlign: "center", boxSizing: "border-box" }}>
      <span style={{ fontSize: 22 }} aria-hidden="true">⚠</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#ffb4b4" }}>Couldn{"\u2019"}t draw this card</span>
      <span className="mono" style={{ fontSize: 11, color: "rgba(230,238,255,.6)", wordBreak: "break-all" }}>{id}</span>
      <span style={{ fontSize: 11, color: "rgba(230,238,255,.5)" }}>The other cards are unaffected.</span>
    </div>
  );
}

function CardStudio() {
  const auth = (window.useAuth || (() => null))();
  const [mode, setMode] = React.useState("students"); // students | volunteers
  const [data, setData] = React.useState(null);       // student cards + program
  const [vdata, setVdata] = React.useState(null);      // volunteer cards + program
  const [centres, setCentres] = React.useState([]);
  const [tiers, setTiers] = React.useState([]);
  const [state, setState] = React.useState("loading");
  // Shared manager inputs (reused across centres + tiers).
  const [mName, setMName] = React.useState(""); const [mCode, setMCode] = React.useState(""); const [mColor, setMColor] = React.useState("#76B043");
  const [msg, setMsg] = React.useState("");
  // Card proportion (mm) — admin-set, applies to preview, PNG/PDF export + print.
  const [sizeW, setSizeW] = React.useState(54); const [sizeH, setSizeH] = React.useState(75);
  const [sizeMsg, setSizeMsg] = React.useState("");
  const navy = "#16223e", gold = "#ffce54";

  const load = React.useCallback(() => {
    setState("loading");
    Promise.all([
      NGGApi.admin.registration.cards(), NGGApi.admin.registration.centres(),
      NGGApi.admin.registration.volunteerCards(), NGGApi.admin.registration.hierarchy(),
    ])
      .then(([c, ct, vc, h]) => { setData(c); setCentres(ct.centres || []); setVdata(vc); setTiers(h.tiers || []); setState("ready"); })
      .catch(e => setState((e.code || e.message) === "unauthorized" ? "need-auth" : "error"));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (state === "need-auth" && auth && auth.isSignedIn) load(); }, [auth && auth.isSignedIn]);
  // Seed the size inputs from whichever dataset has loaded.
  React.useEffect(() => {
    const pr = (data && data.program) || (vdata && vdata.program);
    if (pr) { setSizeW(Number(pr.widthMm) || 54); setSizeH(Number(pr.heightMm) || 75); }
  }, [data, vdata]);
  const saveSize = async () => {
    setSizeMsg("");
    const w = Math.max(50, Math.min(60, Number(sizeW) || 54));
    const h = Math.max(64, Math.min(100, Number(sizeH) || 75));
    try { await NGGApi.admin.settings.set({ idcard: { widthMm: w, heightMm: h } }); setSizeMsg("Saved · " + w + "×" + h + "mm"); load(); }
    catch (e) { setSizeMsg("Couldn't save — need staff permission."); }
  };

  const isVol = mode === "volunteers";
  const resetInputs = () => { setMName(""); setMCode(""); setMColor(isVol ? "#00225F" : "#76B043"); };
  const switchMode = (m) => { setMode(m); setMsg(""); setMName(""); setMCode(""); setMColor(m === "volunteers" ? "#00225F" : "#76B043"); };

  const addUnit = async () => {
    setMsg("");
    try {
      if (isVol) await NGGApi.admin.registration.hierarchyUpsert({ name: mName, code: mCode, color: mColor });
      else       await NGGApi.admin.registration.centreUpsert({ name: mName, code: mCode, color: mColor });
      resetInputs(); load();
    } catch (e) {
      setMsg(e.code === "code_taken" ? "That code is already used." : "Couldn't save — check name (2+ chars) and code (1–4 letters).");
    }
  };
  const delUnit = async (unit) => {
    if (!confirm("Remove " + unit.name + "?")) return;
    try { if (isVol) await NGGApi.admin.registration.hierarchyDelete(unit.tierId); else await NGGApi.admin.registration.centreDelete(unit.centreId); load(); }
    catch (e) {}
  };

  // ── Export toolkit (PNG · bulk ZIP · print-ready CMYK PDF) ──────────────
  const zoneRef = React.useRef(null);
  const [exp, setExp] = React.useState("");   // progress/status text
  const [notice, setNotice] = React.useState("");  // transient success note
  const [resending, setResending] = React.useState("");  // id currently resending
  const [editPhoto, setEditPhoto] = React.useState(null);  // card whose photo is being edited

  // Render a crisp QR PNG for a token's /q profile URL, so the emailed ID can
  // embed the scannable code (via the hosted qr.php image). Reuses the same
  // vendored encoder the cards use. Returns "" if the lib can't load.
  const ensureQrLib = () => new Promise((res) => {
    if (window.qrcode) return res(window.qrcode);
    let sc = document.getElementById("ngg-qrlib");
    if (!sc) { sc = document.createElement("script"); sc.id = "ngg-qrlib"; sc.src = "/vendor/qrcode.min.js"; document.head.appendChild(sc); }
    sc.addEventListener("load", () => res(window.qrcode), { once: true });
    sc.addEventListener("error", () => res(null), { once: true });
  });
  const qrPngFor = async (token) => {
    try {
      const lib = await ensureQrLib(); if (!lib) return "";
      const origin = window.location.origin || "https://next.afrovanguard.org.ng";
      const q = lib(0, "M"); q.addData(origin + "/q/" + String(token)); q.make();
      const n = q.getModuleCount(), cell = 8, margin = 16, size = n * cell + margin * 2;
      const cv = document.createElement("canvas"); cv.width = cv.height = size;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      ctx.save(); ctx.translate(margin, margin); q.renderTo2dContext(ctx, cell); ctx.restore();
      return cv.toDataURL("image/png");
    } catch (_) { return ""; }
  };

  const resendId = async (card) => {
    const kind = isVol ? "volunteer" : "student";
    const id = isVol ? card.volunteerId : card.studentId;
    if (!id || resending) return;
    const who = card.firstName || "this person";
    if (!confirm("Resend " + who + "'s ID?\n\nEmails the digital ID and the scannable QR to the " + (isVol ? "volunteer" : "parent") + ", and texts a link by SMS if a number is on file.")) return;
    setResending(id); setNotice(""); setMsg("");
    try {
      const qrPng = card.token ? await qrPngFor(card.token) : "";
      const r = await NGGApi.admin.registration.resendId(kind, id, qrPng);
      const ch = (r.channels || []);
      const qrNote = r.qr ? " (with QR)" : "";
      setNotice(ch.length ? (who + "'s ID sent by " + ch.join(" + ") + qrNote + ".") : ("No email or phone on file for " + who + " — nothing was sent."));
    } catch (e) {
      const c = e.code || e.message;
      setMsg(c === "no_id" ? "No ID has been issued for " + who + " yet." : c === "forbidden" ? "You don't have permission to resend IDs." : "Couldn't resend " + who + "'s ID — try again.");
    } finally { setResending(""); }
  };
  const ensureLib = () => new Promise((res, rej) => {
    if (window.CardExport) return res(window.CardExport);
    let sc = document.getElementById("ngg-cardexport");
    if (!sc) { sc = document.createElement("script"); sc.id = "ngg-cardexport"; sc.src = "/vendor/card-export.js"; document.head.appendChild(sc); }
    sc.addEventListener("load", () => res(window.CardExport), { once: true });
    sc.addEventListener("error", () => rej(new Error("load_failed")), { once: true });
  });
  // The print-zone renders each card as front then back, so DOM order is
  // [c0-front, c0-back, c1-front, c1-back, …].
  /* ── Where the export reads its pixels from ──────────────────────────────
   * The preview is unchanged: every card is on the page, exactly as before.
   * But the export can no longer rasterise OUT of that grid, because
   * html2canvas clones the whole document on every capture — so the price of
   * each face is set by how much is mounted, not by the card being captured.
   * Measured on this design: 168ms per face with one card on the page, 4.2s
   * with 200 also mounted, 12s with 600. Reading from the grid is O(n²) and a
   * roster of any size never finishes, which is what "exporting fails" was.
   *
   * So a run stages one card at a time into an off-screen host and takes the
   * grid down for the duration. Nothing about the preview changes; the cost
   * per face just stops depending on how many cards you have. */
  const [hostCard, setHostCard] = React.useState(null);
  const hostRef = React.useRef(null);
  const hostResolve = React.useRef(null);
  const warmed = React.useRef(false);
  const hostAssetsReady = async () => {
    const t0 = Date.now();
    for (;;) {
      const el = hostRef.current;
      if (el) {
        const imgs = Array.from(el.querySelectorAll("img"));
        // One QR per pair — it is on the front, the back has none. `complete`
        // rather than naturalWidth, because a 404 leaves naturalWidth at 0
        // forever and the card back links a logo that may not be deployed.
        const haveQr = el.querySelectorAll("img.card-qr").length >= 1;
        const settled = imgs.length > 0 && imgs.every(im => im.complete);
        // Only the first card pays a real grace. By the second the shared
        // logos are either cached or known-dead, so re-waiting a second per
        // card just multiplies an asset outage across the whole roster.
        const grace = warmed.current ? 250 : 1500;
        if (haveQr && (settled || Date.now() - t0 > grace)) { warmed.current = true; return true; }
      }
      if (Date.now() - t0 > 6000) return false;
      await new Promise(r => setTimeout(r, 50));
    }
  };
  React.useEffect(() => {
    if (!hostCard || !hostResolve.current) return;
    const done = hostResolve.current; hostResolve.current = null;
    (async () => { await nextFrame(); await nextFrame(); await hostAssetsReady(); done(); })();
  }, [hostCard]);
  const stageCard = (card) => new Promise((resolve) => { hostResolve.current = resolve; setHostCard(card); });
  // The two faces of the staged card: [front, back].
  const hostFaces = () => Array.from(hostRef.current ? hostRef.current.querySelectorAll(".idcard") : []);
  // One slow card must not strand the run.
  const withBudget = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("face_timeout")), ms))]);
  const cardName = (card) => (card.displayId || card.studentId || card.volunteerId || "card").replace(/[^\w.-]+/g, "-");
  const setName = () => (isVol ? "volunteer" : "student") + "-id-cards";

  const exportPairPng = async (i) => {
    if (exp) return;
    const card = cards[i];
    try {
      setExp("Rendering…");
      const CE = await ensureLib();
      await stageCard(card);
      const n = hostFaces();
      const f = await CE.nodeToImage(n[0], { type: "image/png", scale: 6, bg: "#fff" });
      CE.download(f.bytes, cardName(card) + "-front.png", "image/png");
      const b = await CE.nodeToImage(n[1], { type: "image/png", scale: 6, bg: "#fff" });
      CE.download(b.bytes, cardName(card) + "-back.png", "image/png");
      setExp(""); setHostCard(null);
    } catch (e) { setExp(""); setHostCard(null); setMsg("Couldn't render that card — try again."); }
  };

  const exportZip = async () => {
    if (exp || !cards.length) return;
    try {
      setExp("Preparing…");
      const CE = await ensureLib(); const files = []; const failed = [];
      for (let i = 0; i < cards.length; i++) {
        setExp("Rendering " + (i + 1) + " / " + cards.length + "…");
        try {
          await stageCard(cards[i]);
          const n = hostFaces();
          const f = await withBudget(CE.nodeToImage(n[0], { type: "image/png", scale: 5, bg: "#fff" }), 30000);
          files.push({ name: cardName(cards[i]) + "-front.png", bytes: f.bytes });
          const b = await withBudget(CE.nodeToImage(n[1], { type: "image/png", scale: 5, bg: "#fff" }), 30000);
          files.push({ name: cardName(cards[i]) + "-back.png", bytes: b.bytes });
        } catch (e) { failed.push(cardName(cards[i])); }
        await nextFrame();
      }
      setHostCard(null);
      if (!files.length) { setExp(""); setMsg("Export failed — no cards could be rendered."); return; }
      setExp("Packaging…"); await nextFrame();
      CE.download(await CE.zipStore(files), setName() + "-png.zip", "application/zip");
      setExp("");
      setMsg(failed.length ? (failed.length + " card(s) couldn't render — retry: " + failed.slice(0, 5).join(", ") + (failed.length > 5 ? "…" : "")) : "");
    } catch (e) { setExp(""); setMsg("Export failed — try again."); }
  };

  // Render a face at ~330 DPI for the actual trim size — enough for offset/press
  // print, but far lighter than a fixed 4× (which is ~470 DPI and 2–3× slower).
  // One retry + a frame yield so a single hiccup never kills a mass run and the
  // tab stays responsive across hundreds of cards.
  const renderFace = async (CE, node, scale) => {
    for (let attempt = 0; ; attempt++) {
      try { return await CE.nodeToImage(node, { type: "image/jpeg", scale, quality: 0.92, bg: "#fff" }); }
      catch (e) { if (attempt >= 1) throw e; await new Promise(r => setTimeout(r, 250)); }
    }
  };
  const nextFrame = () => new Promise(r => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

  const exportPdf = async () => {
    if (exp || !cards.length) return;
    try {
      setExp("Preparing…");
      const CE = await ensureLib();
      // Scale to hit ~330 DPI at the chosen trim width (card is 295 CSS px wide).
      const pdfScale = Math.max(2, Math.min(3.2, Math.round((330 * (cardW / 25.4) / 295) * 100) / 100));
      const fronts = [], backs = [], failed = [];
      for (let i = 0; i < cards.length; i++) {
        setExp("Rendering " + (i + 1) + " / " + cards.length + "…");
        try {
          await stageCard(cards[i]);
          const n = hostFaces();
          const f = await withBudget(renderFace(CE, n[0], pdfScale), 30000);
          const b = await withBudget(renderFace(CE, n[1], pdfScale), 30000);
          fronts.push({ dataUrl: f.dataUrl }); backs.push({ dataUrl: b.dataUrl });
        } catch (e) { failed.push(cardName(cards[i])); }
        await nextFrame(); // yield so the tab never locks up mid-run
      }
      setHostCard(null);
      if (!fronts.length) { setExp(""); setMsg("PDF export failed — no cards could be rendered."); return; }
      setExp("Imposing sheets…"); await nextFrame();
      // Front sheets first, then back sheets — so a shop can duplex and cut.
      const pdf = await CE.buildImpositionPDF(fronts.concat(backs), { sheet: "A4", trimW_mm: cardW, trimH_mm: cardH, marks: true });
      CE.download(pdf, setName() + "-print-cmyk.pdf", "application/pdf");
      setExp("");
      setMsg(failed.length ? (failed.length + " card(s) couldn't render and were left out — retry the export: " + failed.slice(0, 5).join(", ") + (failed.length > 5 ? "…" : "")) : "");
      if (!failed.length) setNotice("Print-ready PDF exported.");
    } catch (e) { setExp(""); setMsg("PDF export failed — try again."); }
  };

  const shell = (ch) => (
    <div style={{ minHeight: "100vh", background: navy, color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)", padding: "26px 20px 80px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>{ch}</div>
    </div>
  );
  if (state === "loading") return shell(<div style={{ textAlign: "center", padding: "90px 0" }}><div className="dash-spinner"/></div>);
  if (state === "need-auth") return shell(<div style={{ textAlign: "center", padding: "80px 0" }}><h1 style={{ fontSize: 22 }}>Staff sign-in required</h1><button onClick={() => auth && auth.openSignIn()} style={{ marginTop: 14, padding: "13px 26px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Sign in →</button></div>);
  if (state === "error") return shell(<div style={{ textAlign: "center", padding: "80px 0" }}><h1 style={{ fontSize: 20 }}>Couldn't load the studio</h1><button onClick={load} style={{ marginTop: 12, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Retry</button></div>);

  const cards = (isVol ? (vdata && vdata.cards) : (data && data.cards)) || [];
  const program = ((isVol ? vdata : data) && (isVol ? vdata : data).program) || {};
  // Physical card proportion (admin-set). The artwork's design canvas is 590×1004
  // (≈54×92mm); we keep the 590px width and derive the canvas height from the
  // configured aspect, so the whole studio + export + print reflect the size.
  const cardW = Number(program.widthMm) || 54;
  const cardH = Number(program.heightMm) || 75;
  const CANVAS_H = Math.round(590 * cardH / cardW);
  const units = isVol ? tiers : centres;
  const tab = (m, label) => (
    <button onClick={() => switchMode(m)} style={{ padding: "9px 18px", borderRadius: 99, border: "1px solid " + (mode === m ? gold : "rgba(255,255,255,.18)"), background: mode === m ? gold : "transparent", color: mode === m ? "#2b2100" : "#eef2fb", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{label}</button>
  );
  return shell(<>
    <style>{`
      @font-face { font-family: "TT Firs Neue"; src: url("/assets/fonts/tt-firs-neue-800.woff") format("woff"); font-weight: 700 900; font-display: swap; }
      @font-face { font-family: "Pagkaki"; src: url("/assets/fonts/pagkaki.woff2") format("woff2"); font-display: swap; }
      .card-pair { display: flex; gap: 14px; }
      @media print {
        body * { visibility: hidden; }
        .print-zone, .print-zone * { visibility: visible; }
        .print-zone { position: absolute; left: 0; top: 0; background: #fff; }
        .idcard { width: ${cardW}mm !important; height: ${cardH}mm !important; page-break-inside: avoid; box-shadow: none !important; }
        .card-pair { gap: 4mm; margin: 3mm; page-break-inside: avoid; float: left; }
      }
    `}</style>
    <div className="no-print" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 18, marginBottom: 18 }}>
      <div>
        <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>ID CARD STUDIO · {String(program.program || "")} {String(program.year || "")}</div>
        <h1 style={{ fontSize: 24, margin: "4px 0 0", fontWeight: 800 }}>{cards.length} {isVol ? "volunteer" : "verified student"}{cards.length === 1 ? "" : "s"} ready</h1>
        <p style={{ color: "rgba(230,238,255,.62)", fontSize: 13, margin: "6px 0 0", maxWidth: 520 }}>{isVol ? "Cards render for active volunteers — the ID and QR bind at approval. Colour + code come from the hierarchy tier." : "Cards render for verified students only — the ID and QR bind at parent consent. Print uses a true " + cardW + "×" + cardH + "mm per card."}</p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {notice && <span className="mono" style={{ fontSize: 12, color: "#6fdc9d" }}>{notice}</span>}
        {exp && <span className="mono" style={{ fontSize: 12, color: gold }}>{exp}</span>}
        <button onClick={exportZip} disabled={!cards.length || !!exp} title="High-resolution PNG of every card face, zipped"
          style={{ padding: "13px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#eef2fb", fontWeight: 800, fontSize: 14, cursor: cards.length ? "pointer" : "not-allowed", opacity: exp ? .6 : 1 }}>
          ↓ PNG (all, .zip)
        </button>
        <button onClick={exportPdf} disabled={!cards.length || !!exp} title="Print-ready, imposed, CMYK — hand this to a printer"
          style={{ padding: "13px 24px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: cards.length ? "pointer" : "not-allowed", opacity: exp ? .6 : 1 }}>
          ⎙ Print-ready PDF (CMYK)
        </button>
      </div>
    </div>
    <p className="no-print" style={{ color: "rgba(230,238,255,.5)", fontSize: 12, margin: "-8px 0 18px", maxWidth: 640 }}>
      The PDF imposes cards {"—"} auto-laid out N-up on A4 at an exact {cardW}{"×"}{cardH}&nbsp;mm trim with crop &amp; registration marks and a CMYK (FOGRA39) output intent, front sheets then back sheets for duplex. Card artwork is embedded at ~300&nbsp;DPI; the press RIP separates it to CMYK against the intent. Everything renders in your browser {"—"} nothing is uploaded.
    </p>

    <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 26 }}>
      {tab("students", "Summer students")}
      {tab("volunteers", "Volunteers")}
    </div>

    <div className="no-print" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 16, marginBottom: 30 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.6)", marginBottom: 10 }}>{isVol ? "HIERARCHY — CODE + CARD COLOUR" : "CENTRES — CODE + CARD COLOUR"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {units.map(u => (
          <span key={isVol ? u.tierId : u.centreId} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 99, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.15)", fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: u.color, flex: "none" }}/>
            {u.name} · <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{u.code}</span>
            <button onClick={() => delUnit(u)} style={{ background: "none", border: "none", color: "rgba(230,238,255,.5)", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
          </span>
        ))}
        {!units.length && <span style={{ fontSize: 13, color: "rgba(230,238,255,.55)" }}>{isVol ? "No tiers yet — add the first below. Volunteer cards colour by tier." : "No centres yet — add the first below. New registrations then pick from this list."}</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input value={mName} onChange={e => setMName(e.target.value)} placeholder={isVol ? "Tier name (Team Lead)" : "Centre name (Ijaiye)"} style={{ flex: "1 1 180px", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 14 }}/>
        <input value={mCode} onChange={e => setMCode(e.target.value.toUpperCase())} placeholder={isVol ? "CODE (LED)" : "CODE (IJ)"} maxLength={4} style={{ width: 110, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 14, fontFamily: "var(--font-mono, monospace)" }}/>
        <input type="color" value={mColor} onChange={e => setMColor(e.target.value)} style={{ width: 46, height: 40, border: "none", borderRadius: 10, background: "none", cursor: "pointer" }} aria-label="Card colour"/>
        <button onClick={addUnit} disabled={mName.trim().length < 2 || !mCode.trim()} style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: gold, color: "#2b2100", fontWeight: 800, cursor: "pointer" }}>{isVol ? "Add tier" : "Add centre"}</button>
      </div>
      {msg && <p style={{ color: "#ff9a9a", fontSize: 13, margin: "10px 0 0" }}>{msg}</p>}
    </div>

    <div className="no-print" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 16, marginBottom: 30 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.6)", marginBottom: 10 }}>CARD PROPORTION — PRINT SIZE (MM)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Width
          <input type="number" min={50} max={60} step={1} value={sizeW} onChange={e => setSizeW(e.target.value)} style={{ width: 74, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 14, fontFamily: "var(--font-mono, monospace)" }}/>
        </label>
        <span style={{ color: "rgba(230,238,255,.5)" }}>×</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Height
          <input type="number" min={64} max={100} step={1} value={sizeH} onChange={e => setSizeH(e.target.value)} style={{ width: 74, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 14, fontFamily: "var(--font-mono, monospace)" }}/>
        </label>
        <span style={{ fontSize: 12, color: "rgba(230,238,255,.5)" }}>mm</span>
        <button onClick={saveSize} style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: gold, color: "#2b2100", fontWeight: 800, cursor: "pointer" }}>Save size</button>
        {sizeMsg && <span className="mono" style={{ fontSize: 12, color: sizeMsg[0] === "S" ? "#6fdc9d" : "#ff9a9a" }}>{sizeMsg}</span>}
      </div>
      <p style={{ color: "rgba(230,238,255,.5)", fontSize: 12, margin: "10px 0 0" }}>Default is 54 × 75&nbsp;mm. Width 50–60, height 64–100. The card reflows to any proportion without distortion — preview, PNG/PDF export and print all follow.</p>
    </div>

    {/* Off-screen staging area — one card, only while a run is going. Placed
        off-screen rather than hidden: a display:none element has no layout for
        html2canvas to measure. */}
    <div ref={hostRef} aria-hidden="true" className="no-print"
      style={{ position: "fixed", left: -100000, top: 0, width: 640, opacity: 0, pointerEvents: "none" }}>
      {hostCard && (
        <SafeBlock>
          <div className="card-pair">
            {isVol ? <VolunteerCardFront card={hostCard} program={program} S={0.5} H={CANVAS_H}/>
                   : <CardFront card={hostCard} program={program} S={0.5} H={CANVAS_H}/>}
            <CardBack card={hostCard} program={program} S={0.5} H={CANVAS_H}/>
          </div>
        </SafeBlock>
      )}
    </div>
    {exp && (
      <div className="no-print" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 20, textAlign: "center" }}>
        <div style={{ font: "700 11px var(--font-mono, monospace)", letterSpacing: ".18em", color: gold }}>{exp.toUpperCase()}</div>
        <p style={{ fontSize: 12, color: "rgba(230,238,255,.5)", maxWidth: 520, margin: "10px auto 0" }}>
          Keep this tab open and in front {"—"} browsers throttle background tabs, which stalls the render.
        </p>
      </div>
    )}
    <div className="print-zone" ref={zoneRef} style={{ display: exp ? "none" : "flex", flexWrap: "wrap", gap: 26 }}>
      {!exp && cards.map((card, i) => (
        <div key={card.studentId || card.volunteerId} className="card-pair" style={{ position: "relative" }}>
          <div className="no-print" style={{ position: "absolute", top: -12, right: -8, zIndex: 2, display: "flex", gap: 6 }}>
            <button onClick={() => setEditPhoto(card)} title="Re-crop, adjust or replace this photo"
              style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "none", background: "#2f3f6b", color: "#eef2fb", fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>Edit photo</button>
            <button onClick={() => resendId(card)} disabled={!!resending} title="Resend this ID to the parent / volunteer (email + SMS)"
              style={{ height: 30, padding: "0 12px", borderRadius: 15, border: "none", background: "#2f3f6b", color: "#eef2fb", fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>
              {resending === (isVol ? card.volunteerId : card.studentId) ? "Sending…" : "Resend ID"}
            </button>
            <button onClick={() => exportPairPng(i)} disabled={!!exp} title="Download this card as PNG (front + back)"
              style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>↓</button>
          </div>
          <SafeBlock fallback={<CardDrawFailed id={card.displayId || card.studentId || card.volunteerId}/>}>
            <div style={{ boxShadow: "0 14px 34px rgba(0,0,0,.35)", borderRadius: 6, overflow: "hidden" }}>{isVol ? <VolunteerCardFront card={card} program={program} S={0.5} H={CANVAS_H}/> : <CardFront card={card} program={program} S={0.5} H={CANVAS_H}/>}</div>
          </SafeBlock>
          <SafeBlock fallback={<CardDrawFailed id={card.displayId || card.studentId || card.volunteerId}/>}>
            <div style={{ boxShadow: "0 14px 34px rgba(0,0,0,.35)", borderRadius: 6, overflow: "hidden" }}><CardBack card={card} program={program} S={0.5} H={CANVAS_H}/></div>
          </SafeBlock>
        </div>
      ))}
      {!cards.length && <p className="no-print" style={{ color: "rgba(230,238,255,.55)", fontSize: 14 }}>{isVol ? "No active volunteers yet — cards appear here the moment one is approved." : "No verified students yet — cards appear here the moment a parent consents."}</p>}
    </div>
    {editPhoto && (
      <PhotoEditor
        target={{ subjectType: isVol ? "volunteer" : "student", subjectId: editPhoto.volunteerId || editPhoto.studentId }}
        currentUrl={editPhoto.photoUrl}
        title={(editPhoto.firstName || "") + " " + (editPhoto.surname || "")}
        onSaved={() => { setEditPhoto(null); setNotice("Photo updated."); load(); }}
        onClose={() => setEditPhoto(null)}
      />
    )}
  </>);
}

/* =================== MENTOR PORTAL (/mentor) ================================
   A signed-in mentor's class for today. Award 1–3 behaviour stars per student
   (one rating per student per day). Grouped by the mentor's centre/department. */
function MentorPortal() {
  const auth = (window.useAuth || (() => null))();
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading | need-auth | not-mentor | ready | error
  const [sheet, setSheet] = React.useState(null);       // student being starred
  const [v3sheet, setV3sheet] = React.useState(null);   // student getting a V3 rating
  const navy = "#16223e", gold = "#ffce54";
  const load = React.useCallback(() => {
    setState("loading");
    NGGApi.member.mentorRoster().then(r => { setData(r); setState("ready"); })
      .catch(e => { const c = e.code || e.message; setState(c === "unauthorized" ? "need-auth" : c === "not_a_mentor" ? "not-mentor" : "error"); });
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (state === "need-auth" && auth && auth.isSignedIn) load(); }, [auth && auth.isSignedIn]);

  const shell = (ch) => (
    <div style={{ minHeight: "100vh", background: navy, color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)", padding: "26px 18px 90px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>{ch}</div>
    </div>
  );
  if (state === "loading") return shell(<div style={{ textAlign: "center", padding: "90px 0" }}><div className="dash-spinner"/></div>);
  if (state === "need-auth") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}><h1 style={{ fontSize: 22 }}>Mentor sign-in</h1><p style={{ color: "rgba(230,238,255,.6)", margin: "8px 0 16px" }}>Sign in with your mentor email to see your class.</p><button onClick={() => auth && auth.openSignIn()} style={{ padding: "13px 26px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, cursor: "pointer" }}>Sign in →</button></div>);
  if (state === "not-mentor") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}><h1 style={{ fontSize: 22 }}>Not a mentor account</h1><p style={{ color: "rgba(230,238,255,.6)", marginTop: 8 }}>This portal is for approved mentors. If that's you, make sure you're signed in with the email on your mentor record.</p></div>);
  if (state === "error") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}><h1 style={{ fontSize: 20 }}>Couldn't load your class</h1><button onClick={load} style={{ marginTop: 12, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Retry</button></div>);

  const m = data.mentor || {}, students = data.students || [];
  const done = students.filter(s => s.starredToday).length;
  return shell(<>
    <div style={{ marginBottom: 18 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>MENTOR PORTAL</div>
      <h1 style={{ fontSize: 24, margin: "4px 0 0", fontWeight: 800 }}>{m.name || "Your class"}</h1>
      <p style={{ color: "rgba(230,238,255,.62)", fontSize: 13, margin: "6px 0 0" }}>{m.centre || "All centres"}{m.department ? " · " + m.department : ""} · {students.length} student{students.length === 1 ? "" : "s"} · {done} starred today</p>
    </div>
    {!students.length && <p style={{ color: "rgba(230,238,255,.55)", fontSize: 14 }}>No students in your class yet.</p>}
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {students.map(s => (
        <div key={s.studentId} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: "10px 14px" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", background: "linear-gradient(180deg,#dff0fb,#8fbb3f)", flex: "none" }}>{s.photoUrl ? <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }}/> : null}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{s.fullName}</div>
            <div style={{ fontSize: 12, color: "rgba(230,238,255,.55)" }}>{s.track || ""}{s.v3 ? " · V3 " + (s.v3.verbal + s.v3.vocal + s.v3.visual) + "/15" : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
            {s.starredToday
              ? <span title={s.note} style={{ color: gold, fontWeight: 800, fontSize: 16 }}>{"★".repeat(s.starredToday)}</span>
              : <button onClick={() => setSheet(s)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid " + gold, background: "transparent", color: gold, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>★ Stars</button>}
            <button onClick={() => setV3sheet(s)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid " + (s.v3 ? "#7fd1a6" : "rgba(255,255,255,.28)"), background: s.v3 ? "rgba(127,209,166,.14)" : "transparent", color: s.v3 ? "#a7e8c6" : "#cdd6ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{s.v3 ? "V3 ✓" : "V3"}</button>
          </div>
        </div>
      ))}
    </div>
    {sheet && <MentorStarSheet student={sheet} categories={data.categories || []} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }}/>}
    {v3sheet && <MentorV3Sheet student={v3sheet} period={data.period} onClose={() => setV3sheet(null)} onDone={() => { setV3sheet(null); load(); }}/>}
  </>);
}

/* V3 weekly rating — Verbal · Vocal · Visual, each 1..5, one row per ISO week. */
function MentorV3Sheet({ student, period, onClose, onDone }) {
  const init = student.v3 || {};
  const [v, setV] = React.useState({ verbal: init.verbal || 3, vocal: init.vocal || 3, visual: init.visual || 3 });
  const [note, setNote] = React.useState(init.note || "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const gold = "#ffce54", green = "#7fd1a6";
  const total = v.verbal + v.vocal + v.visual;
  const dims = [["verbal", "Verbal", "How they express ideas in words"], ["vocal", "Vocal", "Voice, delivery, confidence"], ["visual", "Visual", "Presence, body language, craft"]];
  const submit = async () => {
    setBusy(true); setErr("");
    try { await NGGApi.member.v3Rate(student.studentId, v.verbal, v.vocal, v.visual, note.trim()); onDone(); }
    catch (e) { setErr(e.code === "not_your_centre" ? "That student isn't in your class." : (e.code || e.message)); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(4,8,20,.72)", display: "grid", placeItems: "end center" }}>
      <div style={{ width: "100%", maxWidth: 520, background: "#101a33", color: "#eef2fb", borderRadius: "18px 18px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom,0px))", border: "1px solid rgba(255,255,255,.14)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 19 }}>V3 rating · {student.fullName}</h2>
          <span style={{ color: green, fontWeight: 800, fontSize: 18 }}>{total}<span style={{ color: "rgba(230,238,255,.45)", fontSize: 12, fontWeight: 500 }}>/15</span></span>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(230,238,255,.6)" }}>Verbal · Vocal · Visual — this week{period ? " (" + period + ")" : ""}. One rating per student per week; you can refine it any time.</p>
        {dims.map(([key, label, hint]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
              <span style={{ fontSize: 11, color: "rgba(230,238,255,.5)" }}>{hint}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setV(s => ({ ...s, [key]: n }))} aria-label={label + " " + n}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid " + (n <= v[key] ? green : "rgba(255,255,255,.18)"), background: n <= v[key] ? "rgba(127,209,166,.18)" : "transparent", color: n <= v[key] ? "#d7f6e6" : "rgba(230,238,255,.5)", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{n}</button>
              ))}
            </div>
          </div>
        ))}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={300} placeholder="Optional note — what stood out this week?" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 14, resize: "vertical" }}/>
        {err && <p style={{ color: "#ff9a9a", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={submit} disabled={busy} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: green, color: "#08301f", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{busy ? "Saving…" : "Save V3 · " + total + "/15"}</button>
          <button onClick={onClose} disabled={busy} style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function MentorStarSheet({ student, categories, onClose, onDone }) {
  const [stars, setStars] = React.useState(3);
  const [category, setCategory] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const gold = "#ffce54";
  const submit = async () => {
    setBusy(true); setErr("");
    try { await NGGApi.member.starGive(student.studentId, stars, category, note.trim()); onDone(); }
    catch (e) { setErr(e.code === "already_starred_today" ? "This student already has a rating for today." : e.code === "not_your_centre" ? "That student isn't in your class." : (e.code || e.message)); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(4,8,20,.72)", display: "grid", placeItems: "end center", padding: 0 }}>
      <div style={{ width: "100%", maxWidth: 520, background: "#101a33", color: "#eef2fb", borderRadius: "18px 18px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom,0px))", border: "1px solid rgba(255,255,255,.14)" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 19 }}>Stars for {student.fullName}</h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(230,238,255,.6)" }}>One rating per student per day. Reward the behaviour you want to see more of.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", margin: "6px 0 16px" }}>
          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => setStars(n)} aria-label={n + " stars"} style={{ fontSize: 34, background: "none", border: "none", cursor: "pointer", color: n <= stars ? gold : "rgba(255,255,255,.25)" }}>★</button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(category === c ? "" : c)} style={{ padding: "6px 12px", borderRadius: 99, border: "1px solid " + (category === c ? gold : "rgba(255,255,255,.2)"), background: category === c ? gold : "transparent", color: category === c ? "#2b2100" : "#eef2fb", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>{c}</button>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={300} placeholder="Optional note — what did they do well?" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 14, resize: "vertical" }}/>
        {err && <p style={{ color: "#ff9a9a", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={submit} disabled={busy} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{busy ? "Saving…" : "Give " + stars + " ★"}</button>
          <button onClick={onClose} disabled={busy} style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* =================== LEGAL & DATA PROTECTION (public, /legal) ===============
   NDPA/NDPR-aligned. Six documents in one page with an anchored side-nav.
   Written for parents and volunteers of a Nigerian youth organisation, not
   copy-pasted boilerplate. `?doc=safeguarding` deep-links a section. */
const LEGAL_DOCS = [
  { id: "privacy",    label: "Privacy Notice" },
  { id: "terms",      label: "Terms of Use" },
  { id: "safeguarding", label: "Safeguarding" },
  { id: "consent",    label: "Parental Consent" },
  { id: "cookies",    label: "Cookies" },
  { id: "rights",     label: "Your Data Rights" },
];

function LegalPage({ setPage }) {
  const initial = new URLSearchParams(window.location.search).get("doc");
  const [doc, setDoc] = React.useState(LEGAL_DOCS.some(d => d.id === initial) ? initial : "privacy");
  const updated = "July 2026";
  const P = ({ children }) => <p style={{ color: "var(--ink-700)", lineHeight: 1.7, margin: "0 0 14px", fontSize: 15.5 }}>{children}</p>;
  const H = ({ children }) => <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "28px 0 12px", color: "var(--navy-900)" }}>{children}</h3>;
  const LI = ({ children }) => <li style={{ color: "var(--ink-700)", lineHeight: 1.65, marginBottom: 8, fontSize: 15.5 }}>{children}</li>;
  const UL = ({ children }) => <ul style={{ margin: "0 0 14px", paddingLeft: 22 }}>{children}</ul>;

  const bodies = {
    privacy: <>
      <P>Next Generation Genius (“NGG”, “we”), a programme of Street‑To‑Stardom under the Afrovanguard initiative, collects and processes personal data in line with the Nigeria Data Protection Act 2023 (NDPA) and the NDPR. This notice explains what we hold, why, and for how long. Because most of the people we serve are children, we treat this as a duty, not a formality.</P>
      <H>What we collect</H>
      <UL>
        <LI><b>Summer students &amp; members (children):</b> name, age, school, course/centre, a website headshot, and program work (attendance, missions, journal reflections).</LI>
        <LI><b>Parents/guardians:</b> name and at least one contact channel (phone or email), plus the consents you grant.</LI>
        <LI><b>Volunteers:</b> name, email, phone, role, courses you can teach, and — for roles working with children — safeguarding-screening status.</LI>
        <LI><b>Everyone:</b> minimal technical data (IP, coarse device info) used only for security and rate-limiting.</LI>
      </UL>
      <H>Why we process it (lawful basis)</H>
      <P>For children, our basis is <b>verifiable parental consent</b> plus our legitimate interest in running a safe programme. For volunteers and parents, it is consent and the performance of our arrangement with you. Safeguarding processing rests on protecting the <b>vital interests</b> of a child.</P>
      <H>Who can see it</H>
      <P>Program staff see what their role requires. Sensitive answers (e.g. medical notes) are visible only to program staff and are never exported. We publish first names and attendance on a child's QR profile — never contact details, never a home address. We do not sell data, ever.</P>
      <H>Sharing &amp; transfers</H>
      <P>We use a small set of processors — email/SMS delivery (Termii, Twilio), image hosting (Cloudinary), and an optional Google Sheet mirror for admins. Each receives only what it needs. Where data leaves Nigeria, we rely on the processor's adequacy/contractual safeguards.</P>
      <H>Retention</H>
      <P>Child records are kept for the programme cycle plus the period we are required to retain safeguarding records, then archived or deleted. Volunteer records persist while active and for a reasonable period after, to honour service certificates. You can request earlier deletion (see Your Data Rights).</P>
      <H>Contact</H>
      <P>Data questions: <a href={"mailto:" + (typeof CONTACT !== "undefined" ? CONTACT.email : "next@afrovanguard.org.ng")}>{typeof CONTACT !== "undefined" ? CONTACT.email : "next@afrovanguard.org.ng"}</a>. We respond within 30 days.</P>
    </>,
    terms: <>
      <P>By using this website and our registration tools, you agree to these terms. They are deliberately short and plain.</P>
      <H>Who may register</H>
      <P>Children are registered <b>by a parent or guardian, or by our staff with a parent's contact on file</b> — never by the child alone. Volunteer registration is for adults (18+). You confirm the information you give is true and yours to share.</P>
      <H>Acceptable use</H>
      <UL>
        <LI>Don't submit false registrations, scrape the site, or attempt to access another person's profile or ID.</LI>
        <LI>QR codes and volunteer IDs are personal — don't share or forge them.</LI>
        <LI>Don't upload anything you don't have the right to, or anything harmful.</LI>
      </UL>
      <H>Our commitments &amp; limits</H>
      <P>We work to keep the service accurate and available, but provide it “as is”. Attendance, IDs and certificates reflect our records; if something looks wrong, tell us and we'll fix it. We may suspend accounts that put children or the programme at risk.</P>
      <H>Changes</H>
      <P>We may update these terms; material changes are announced on this page with a new date.</P>
    </>,
    safeguarding: <>
      <P>The safety of every child in our rooms comes before everything else on this site. This is our public safeguarding commitment.</P>
      <H>Screening</H>
      <P>Every volunteer whose role brings them into contact with children — mentors and instructors — must complete <b>safeguarding screening before their first session</b>. Our attendance scanner shows a clear warning if an unscreened volunteer checks in, and they must not be alone with young people until cleared. Admin/ops roles that never work directly with children are screened proportionately.</P>
      <H>Least data, seen by the fewest people</H>
      <P>A child's public QR profile shows a first name, course and attendance — never contact details or address. Medical and sensitive notes are ring-fenced to program staff and excluded from every export and integration.</P>
      <H>Photography &amp; media</H>
      <P>Headshots are used for IDs and, where separately consented, programme media. Parents can withhold media consent without affecting registration, and can withdraw it later.</P>
      <H>Reporting a concern</H>
      <P>If you have a safeguarding concern, contact us immediately at <a href={"mailto:" + (typeof CONTACT !== "undefined" ? CONTACT.email : "next@afrovanguard.org.ng")}>{typeof CONTACT !== "undefined" ? CONTACT.email : "next@afrovanguard.org.ng"}</a> or {typeof CONTACT !== "undefined" ? CONTACT.phoneDisplay : "+234 903 777 6318"}. Urgent risk to a child should also be reported to the Lagos State authorities.</P>
    </>,
    consent: <>
      <P>Registering a child is a two-step, consent-first process. A child is only officially enrolled once a parent or guardian has confirmed and granted consent.</P>
      <H>The consents we ask for</H>
      <UL>
        <LI><b>Participation</b> — required. Permission for the child to take part in the programme.</LI>
        <LI><b>Medical &amp; emergency care</b> — required. Basic first aid and seeking care in an emergency where you can't be reached.</LI>
        <LI><b>Data processing</b> — required. Holding the child's registration data as described in the Privacy Notice.</LI>
        <LI><b>Media</b> — optional. Using photos/video of the child in programme media.</LI>
        <LI><b>Trips</b> — optional. Off-site programme activities.</LI>
        <LI><b>Communications</b> — optional. Programme updates to your contact channel.</LI>
      </UL>
      <P>The three required consents must each be granted explicitly — there are no pre-ticked boxes and no bundling. Optional consents can be declined without affecting the child's place, and any consent can be withdrawn later by contacting us.</P>
      <H>How we verify it's really you</H>
      <P>We send a private confirmation link to the parent contact on file (email and/or SMS). Only someone with that link can complete consent, and the record notes who confirmed and when.</P>
    </>,
    cookies: <>
      <P>We keep browser storage to the minimum needed to make the site work. We do not run advertising or third-party tracking cookies.</P>
      <H>What we store</H>
      <UL>
        <LI><b>Session &amp; security</b> — a signed session cookie for signed-in staff/members, and a CSRF token. Strictly necessary.</LI>
        <LI><b>Preferences</b> — small local-storage entries (e.g. theme, a saved registration draft) that stay on your device.</LI>
        <LI><b>Anonymous counts</b> — aggregate stats with no personal profile attached.</LI>
      </UL>
      <P>Because we use only strictly-necessary and preference storage, the site works without a consent banner interrupting you. Clearing your browser storage removes the preference entries at any time.</P>
    </>,
    rights: <>
      <P>Under the NDPA/NDPR you (or a parent, on a child's behalf) have clear rights over personal data. We honour them free of charge, within 30 days.</P>
      <H>Your rights</H>
      <UL>
        <LI><b>Access</b> — a copy of the data we hold.</LI>
        <LI><b>Rectification</b> — correct anything inaccurate.</LI>
        <LI><b>Erasure</b> — delete data, subject to safeguarding-retention duties.</LI>
        <LI><b>Restriction &amp; objection</b> — limit or object to certain processing.</LI>
        <LI><b>Portability</b> — receive your data in a portable format.</LI>
        <LI><b>Withdraw consent</b> — at any time, without affecting prior lawful processing.</LI>
      </UL>
      <H>How to exercise them</H>
      <P>Email <a href={"mailto:" + (typeof CONTACT !== "undefined" ? CONTACT.email : "next@afrovanguard.org.ng")}>{typeof CONTACT !== "undefined" ? CONTACT.email : "next@afrovanguard.org.ng"}</a> from the address on file, or call {typeof CONTACT !== "undefined" ? CONTACT.phoneDisplay : "+234 903 777 6318"}. If you're unhappy with our response, you may complain to the Nigeria Data Protection Commission (NDPC).</P>
    </>,
  };

  const active = LEGAL_DOCS.find(d => d.id === doc) || LEGAL_DOCS[0];
  return (
    <div className="page" data-screen-label="Legal">
      <section className="page-hero page-hero-dark" style={{ background: "var(--navy-900)", color: "white", padding: "56px 0 40px" }}>
        <div className="container">
          <span className="chip chip-on-dark"><span className="dot dot-gold"/> LEGAL &amp; DATA PROTECTION</span>
          <h1 className="display" style={{ fontSize: "clamp(36px,5vw,64px)", margin: "12px 0 6px", color: "white", lineHeight: 0.98 }}>The fine print, in plain words.</h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, margin: 0 }}>NDPA/NDPR-aligned · last updated {updated}</p>
        </div>
      </section>
      <section className="section">
        <div className="container legal-layout" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 40, alignItems: "start" }}>
          <nav className="legal-nav" style={{ position: "sticky", top: 90, display: "flex", flexDirection: "column", gap: 4 }}>
            {LEGAL_DOCS.map(d => (
              <button key={d.id} onClick={() => { setDoc(d.id); history.replaceState({}, "", "/legal?doc=" + d.id); }}
                className="legal-nav-item"
                style={{ textAlign: "left", padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14.5, fontWeight: doc === d.id ? 700 : 500,
                  background: doc === d.id ? "var(--navy-900)" : "transparent", color: doc === d.id ? "#fff" : "var(--ink-700)" }}>
                {d.label}
              </button>
            ))}
          </nav>
          <div className="legal-body" style={{ maxWidth: 720 }}>
            <h2 className="display" style={{ fontSize: 32, margin: "0 0 6px" }}>{active.label}</h2>
            <div className="mono" style={{ color: "var(--ink-500)", fontSize: 12, marginBottom: 24 }}>UPDATED {updated.toUpperCase()}</div>
            {bodies[doc]}
            <div style={{ marginTop: 36, paddingTop: 20, borderTop: "1px solid rgba(12,20,50,0.1)", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage("contact")}>Contact us</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage("home")}>Back to home</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { MediaPage, ParentsPage, VolunteersPage, VolunteerRegisterPage, JoinPage, ContactPage, MentorsPage, SummerProfilePage, InstructorRoster, CertificatePage, LegalPage, FAQList, MentorApplySection, MediaModal, CirclePortal, ParentVerifyPage, GatePage, CardStudio, MentorPortal });
