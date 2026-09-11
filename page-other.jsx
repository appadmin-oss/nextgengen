/* ================================================================
   NGG — Media + Parents + Volunteers + Join
   ================================================================ */

/* Send an intake form through the offline outbox (see outbox.js).
 *
 * Banks the submission on this device BEFORE attempting it, attaches a
 * submissionId so a retry replays server-side rather than creating a second
 * record, and keeps trying until the server has actually accepted it. On a
 * network failure the rejection carries `queued: true`, which means the work is
 * safe and will go on its own — a very different thing to tell someone than
 * "check your connection and try again".
 *
 * Falls back to a direct call when outbox.js has not loaded (an older cached
 * bundle, or a browser with no storage at all). The form still works; it just
 * loses the banking, which is the pre-existing behaviour rather than a new
 * failure mode. */
function sendIntake(op, payload, formKey) {
  if (window.outbox && window.NGGApi && window.NGGApi.__outboxOps && window.NGGApi.__outboxOps[op]) {
    return window.outbox.intake(op, payload, formKey);
  }
  const direct = (window.NGGApi && window.NGGApi.__outboxOps && window.NGGApi.__outboxOps[op]) || null;
  return direct ? direct(payload) : Promise.reject(new Error("unavailable"));
}

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
      await sendIntake("public.apply", {
        kind: "mentor",
        firstName: d.firstName.trim(), lastName: d.lastName.trim(), otherName: d.otherName.trim(),
        sex: d.sex,
        email: d.email.trim(), phone: d.phone.trim(), dob: d.dob,
        role: d.role,
        why: d.why.trim(),
      }, "ngg_apply_mentor");
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
            <span style={{ width: 30, height: 30, borderRadius: 9, display: "inline-grid", placeItems: "center", fontFamily: sora, fontWeight: 800, fontSize: 13, color: inkOn(s.color).ink, background: s.color }}>{s.n}</span>
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
  /* Which programme the applicant is applying to. 'summer' = the Summer School
     on-ramp, 'anchor' = the flagship 12-week NGG journey.
   *
   * It comes from the URL (`/join?program=summer`), not from a global. It used
   * to be handed over as `window.__nggProgram`, set by the Summer page one tick
   * before it routed here — which meant the one thing this form must get right
   * was the one thing it lost on a refresh. A family that reloaded the page (or
   * shared the link, or came back to a restored tab, or was bounced through
   * sign-in) silently switched from Summer School to Anchor 12 and submitted an
   * application to the wrong programme, with no visible change on screen.
   *
   * The global is still read once as a fallback so an in-app click from an older
   * cached bundle keeps working, and it is normalised into the address bar below
   * so the choice survives everything a URL survives. */
  const [program] = useState(() => {
    let q = "";
    try { q = (new URLSearchParams(window.location.search).get("program") || "").toLowerCase(); } catch (_) {}
    const legacy = (typeof window !== "undefined" && window.__nggProgram === "summer") ? "summer" : "";
    if (typeof window !== "undefined") window.__nggProgram = null;
    return (q === "summer" || legacy === "summer") ? "summer" : "anchor";
  });
  /* Put the programme in the address bar so a refresh, a bookmark and a shared
     link all reopen the same form. replaceState, not push: this is the same
     step, spelled correctly — it must not add a history entry the Back button
     has to walk through. */
  React.useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if ((u.searchParams.get("program") || "") === program) return;
      u.searchParams.set("program", program);
      window.history.replaceState(window.history.state, "", u.pathname + "?" + u.searchParams.toString() + u.hash);
    } catch (_) {}
  }, [program]);
  const isSummer = program === "summer";
  const [restored, setRestored] = useState(false);
  const [data, setData] = useState(() => {
    const base = { firstName: "", lastName: "", otherName: "", sex: "", dob: "", city: "Egbeda", track: "Music", why: "", parentEmail: "", parentPhone: "", photoUrl: "" };
    /* "Apply to THIS centre" has to arrive at a form with that centre already
       chosen, or the button is decoration. Same for a course picked off the
       Summer School page. A saved draft still wins — somebody halfway through
       typing must not have their answers overwritten by a link. */
    let seed = {};
    try {
      const q = new URLSearchParams(window.location.search);
      const centre = (q.get("centre") || "").trim();
      const track = (q.get("track") || "").trim();
      if (centre) seed.city = centre;
      if (track) seed.track = track;
    } catch (_) {}
    try {
      const saved = JSON.parse(localStorage.getItem(JOIN_DRAFT_KEY) || "null");
      if (saved && typeof saved === "object") return Object.assign(base, seed, saved);
    } catch (_) {}
    return Object.assign(base, seed);
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
      const r = await sendIntake("public.apply", {
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
        /* Three the server can refuse a teen application for, all of them
           silent before: the generic fallback told a family to try again, and
           trying again failed the same way, because the field that was too
           long was still too long. */
        bad_otherName: "That middle name is too long — keep it under 60 characters.",
        email_too_long: "That email address is too long — check it for a typo.",
        why_too_long: "That answer is too long — keep it under 2,000 characters.",
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
      const r = await sendIntake("public.contact", {
        name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(),
        purpose: d.purpose, subject: d.subject.trim(), message: d.message.trim(), website: d.website,
      }, "ngg_contact");
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
          {["2000", "5000", "10000"].map(a => <button type="button" key={a} onClick={() => setD(o => ({ ...o, amount: a }))} className={"btn btn-sm " + (d.amount === a ? "btn-gold" : "btn-on-dark-ghost")}>{fmtMoney(a)}</button>)}
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
      {err && <p role="alert" style={{ color: "var(--coral)", fontSize: 13, marginTop: 10 }}>{err}</p>}
      {res && <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--cream-50)", borderRadius: 10 }}>
        <div style={{ fontWeight: 700 }}>{res.label}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>Submitted {fmtDate(res.submittedAt)}</div>
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
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>Signed in as {name} · from your ID card. {err && <span role="alert" style={{ color: "#ffb3b3" }}>{err}</span>}</div>
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
    catch (e) { setRes({ err: (e.code === "student_not_found" ? "Not assigned to anyone yet." : e.code === "qr_unassigned" ? "This card isn't assigned yet." : e.code === "id_expired" ? ("This ID expired on " + ((e.data && e.data.expiredOn) || "an earlier date") + " — the coordinator needs to reissue it.") : "Couldn't mark present — try again.") }); }
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
  /* The backend blanks fullName on the public handle route when the guardian
     has not consented to the child being named. Fall back to the handle so
     the page still reads as somebody's profile rather than an empty heading —
     the attendance and milestones on it are not personally identifying. */
  const shownName = m.fullName || (m.handle ? "@" + m.handle : "Student");
  const initials = (m.fullName || m.handle || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const title = isVol ? (m.role ? m.role.charAt(0).toUpperCase() + m.role.slice(1) : "Volunteer") : (m.track ? m.track : "Participant");
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
                <h1 className="display" style={{ fontSize: "clamp(24px,4vw,32px)", letterSpacing: "-0.02em", margin: 0, color: "var(--ink-900)" }}>{shownName}</h1>
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
            ? <ProfileCheckin token={state.token} name={shownName}/> : null}
          {!isVol && state.token && !(auth && auth.isSignedIn)
            ? <ProfileCommunityCTA token={state.token} name={shownName}/> : null}
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
  const issued = fmtDateLong(c.issuedAt);
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
      const r = await sendIntake("public.apply", {
        kind: "volunteer", role,
        firstName: d.firstName.trim(), lastName: d.lastName.trim(), otherName: d.otherName.trim(),
        sex: d.sex,
        email: d.email.trim(), phone: d.phone.trim(), dob: d.dob,
        why: d.why.trim(), photoUrl: d.photoUrl || "", courses: role === "instructor" ? courses : [],
        centre, faculty: needsFaculty ? faculty : "", visibilityConsent,
      }, "ngg_apply_volunteer");
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
  const [childName, setChildName] = React.useState("");
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
  const addStudent = () => { setRole((dash && dash.role) || role || "mentor"); setStudent(null); setCode(""); setChildName(""); setErr(""); setStep("code"); };

  const roleWord = role === "teacher" ? "student" : (role === "mentor" ? "mentee" : "child");
  const submitCode = async () => {
    setBusy(true); setErr("");
    try { const r = await NGGApi.public.circle.lookup(code, childName.trim()); setStudent(r.student); setStep("verify"); }
    /* One message for a wrong code AND a wrong name, matching the server. Telling
       someone "right code, wrong name" would confirm the code is live, which is
       most of what the name check was added to prevent. */
    catch (e) { setErr((e.code === "not_found")
      ? "That code and name don't match a student. Check both and try again."
      : humanizeError(e.message, e.code)); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setErr("");
    try {
      const r = await NGGApi.public.circle.connect({ code, name: childName.trim(), role, guardianName, consent: true });
      try { localStorage.setItem(CIRCLE_TOKEN_KEY, r.token); } catch (_) {}
      circleTokens.add(r.token);
      setToken(r.token); await loadDash(r.token); flash("Connected securely ✓");
    } catch (e) { setErr(humanizeError(e.message, e.code)); } finally { setBusy(false); }
  };
  const unlink = () => { try { localStorage.removeItem(CIRCLE_TOKEN_KEY); } catch (_) {} circleTokens.save([]); setCohort(null); setToken(""); setDash(null); setRole(null); setCode(""); setChildName(""); setConsent(false); setStep("role"); flash("Signed out of this device"); };
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
      aria-label="6-digit Anchor Link code"
      style={{ width: "100%", marginTop: 24, textAlign: "center", letterSpacing: ".5em", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 18, color: "#fff", font: "700 34px var(--font-mono,monospace)", padding: "20px 0 20px .5em", outline: "none" }}/>
    {/* Required, and it is the actual security control on this page: without
        it a six-digit code was enough to pull back a child's name and then a
        guardian's-eye view of them. Asking for a name the guardian obviously
        knows costs them one field and makes a guessed code worth nothing.
        It also stops a mistyped code quietly pairing you to another child. */}
    <input value={childName} onChange={e => setChildName(e.target.value)} placeholder={"Your " + roleWord + "'s name"}
      aria-label={"Your " + roleWord + "'s name"} autoComplete="off"
      style={{ width: "100%", marginTop: 12, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 14, color: "#fff", font: "600 15px var(--font-body,sans-serif)", padding: "13px 15px", outline: "none" }}/>
    <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 7 }}>First name or surname — whichever is on their record.</div>
    <input value={guardianName} onChange={e => setGuardianName(e.target.value)} placeholder="Your name (optional)"
      aria-label="Your name (optional)"
      style={{ width: "100%", marginTop: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, color: "#fff", font: "600 15px var(--font-body,sans-serif)", padding: "13px 15px", outline: "none" }}/>
    {err && <div role="alert" className="circle-err">{err}</div>}
    {(() => {
      const ready = code.length === 6 && childName.trim().length >= 2;
      return <button className="btn btn-lg" disabled={!ready || busy} onClick={submitCode} style={{ width: "100%", marginTop: 18, background: ready ? teal : "rgba(255,255,255,.12)", color: ready ? "#06231d" : "rgba(255,255,255,.4)", border: "none", fontWeight: 800 }}>{busy ? "Checking…" : "Find student →"}</button>;
    })()}
  </>);

  if (step === "verify") return wrap(<>
    <button className="circle-back" onClick={() => setStep("code")} aria-label="Back">←</button>
    <div className="mono" style={{ letterSpacing: ".2em", color: teal, fontSize: 11, marginTop: 20 }}>STEP 2 OF 3 · VERIFY</div>
    <h1 style={{ font: "800 28px/1.05 var(--font-display,sans-serif)", margin: "12px 0 18px" }}>Is this your {roleWord}?</h1>
    <div style={{ ...card, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ width: 74, height: 74, borderRadius: "50%", background: "radial-gradient(circle at 35% 28%,#7fb0ff,#2f6fd0)", display: "grid", placeItems: "center", font: "800 30px var(--font-display,sans-serif)" }}>{((student && student.name) || "?").charAt(0)}</div>
      <div style={{ font: "800 22px var(--font-display,sans-serif)", marginTop: 14 }}>{student && student.name}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "6px 13px", borderRadius: 99, background: "rgba(94,224,192,.14)", border: "1px solid rgba(94,224,192,.3)" }}><span style={{ color: teal, fontSize: 11, fontWeight: 700 }} className="mono">✓ CODE + NAME MATCHED</span></div>
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
    {err && <div role="alert" className="circle-err">{err}</div>}
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
  const [signature, setSignature] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!t) { setState("error"); setErr("This link is incomplete — open it exactly as it was sent to you."); return; }
    NGGApi.public.verify.context(t)
      .then(r => { setCtx(r); setActorName(r.guardianName || ""); setState(r.done ? "done" : "form"); })
      .catch(e => { setState("error"); setErr((e.code === "link_expired") ? "This link has expired. Ask the program team to send a new one." : "This link isn't valid. Check you opened it exactly as sent — or ask the program team for a new one."); });
  }, []);

  const types = (ctx && ctx.consentTypes) || {};
  const p0 = Object.keys(types).filter(k => types[k].p === 0);
  /* Three groups, not two. `mustAnswer` clauses are optional to GRANT but
     required to ANSWER — a checkbox cannot tell "no" apart from "did not
     read", and an untouched box used to be recorded as a refusal the parent
     never actually made. These get an explicit Yes / No. */
  const mustAnswer = Object.keys(types).filter(k => types[k].p > 0 && types[k].mustAnswer);
  const optional = Object.keys(types).filter(k => types[k].p > 0 && !types[k].mustAnswer);
  const p0Done = p0.every(k => consents[k]);
  const answered = mustAnswer.every(k => Object.prototype.hasOwnProperty.call(consents, k));
  const ready = p0Done && answered && actorName.trim().length >= 2;
  const allKeys = Object.keys(types);
  const allAccepted = allKeys.length > 0 && allKeys.every(k => consents[k] === true);
  const acceptAll = () => setConsents(() => {
    const next = {};
    allKeys.forEach(k => { next[k] = true; });
    return next;
  });
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
      await NGGApi.public.verify.submit(t, consents, actorName.trim(), feedback.trim(), signature);
      setState("success");
    } catch (e) {
      setErr(e.code === "consent_required" ? ("Please tick all " + p0.length + " required boxes — the registration can't complete without them.")
        : e.code === "consent_answer_required" ? "Please answer Yes or No to every question above — both answers are fine, but we need your decision on each."
        : "Couldn't save just now — check your connection and try again. Nothing you entered was lost.");
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
  /* The centre's parent group, offered the moment consent is done — the one
     moment a parent is certain to be looking at this page, and the point at
     which the group is most useful to them. Rendered only when the centre has
     actually set a link; an empty invitation to nothing is worse than none. */
  const groupPanel = () => {
    const g = (ctx && ctx.parentGroup) || {};
    if (!g.url) return null;
    return (
      <div style={{ ...card, marginTop: 14, textAlign: "left", background: "#f0f4e4", border: "1px solid #dbe5bd" }}>
        <b style={{ fontSize: 14 }}>Join the {g.centre} parent group</b>
        <p style={{ margin: "6px 0 12px", fontSize: 13.5, color: "#4a4f42", lineHeight: 1.55 }}>
          Pickup times, session changes and centre notices go out here first. It is optional, and you can leave at any time.
        </p>
        <a href={g.url} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", padding: "13px 16px", borderRadius: 12, background: "#c9f24e", color: "#243300", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>
          Open the parent group →
        </a>
      </div>
    );
  };

  if (state === "done") return shell(<><div style={{ ...card, textAlign: "center" }}><div style={{ fontSize: 44 }}>✅</div><h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>Already confirmed</h1><p style={{ color: "#555" }}>You've already given consent for <b>{ctx.student.name}</b>. Nothing more is needed — thank you.</p></div>{groupPanel()}</>);
  if (state === "success") return shell(<><div style={{ ...card, textAlign: "center" }}><div style={{ fontSize: 44 }}>🎉</div><h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>{first} is fully registered</h1><p style={{ color: "#555", lineHeight: 1.55 }}>Thank you. Their ID card is being prepared, and the program team has been notified. We'll only contact you about the program.</p></div>{groupPanel()}</>);

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

    {/* One tap for the common case.
        Most parents agree to everything and were made to tick five to seven
        boxes to say so, on a phone, at a registration desk. This does it in
        one — but it is not a shortcut past the wording: every clause is
        spelled out in full below it, and the button says exactly what it is
        agreeing to. Anyone who wants to differ on one answer just changes
        that one afterwards; nothing is locked by using this. */}
    <div style={{ ...card, padding: 16, marginBottom: 14, borderColor: allAccepted ? "#9fbc3b" : "#e6e6e0", background: allAccepted ? "#f4f9e8" : "#fff" }}>
      <b style={{ fontSize: 14.5 }}>Happy with everything?</b>
      <p style={{ margin: "6px 0 12px", fontSize: 13.5, color: "#5a5f52", lineHeight: 1.55 }}>
        Agree to all {allKeys.length} of the permissions below in one tap. Every one is written out in full underneath —
        <button type="button" onClick={() => setShowAll(v => !v)} style={{ background: "none", border: "none", padding: "0 0 0 4px", color: "#4a6b00", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
          {showAll ? "hide the wording" : "read the wording"}
        </button>. You can change any single answer afterwards.
      </p>
      {showAll && (
        <ul style={{ margin: "0 0 12px", padding: "0 0 0 18px", fontSize: 13, color: "#5a5f52", lineHeight: 1.6 }}>
          {allKeys.map(k => <li key={k} style={{ marginBottom: 4 }}><b>{types[k].label}</b> — {first} {CONSENT_COPY[k] || ""}</li>)}
        </ul>
      )}
      <button type="button" onClick={acceptAll}
        style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 15,
                 background: allAccepted ? "#eaf3d4" : "#c9f24e", color: allAccepted ? "#5a7000" : "#243300" }}>
        {allAccepted ? "✓ All permissions accepted" : "Accept all " + allKeys.length + " permissions"}
      </button>
    </div>

    <div style={{ fontSize: 11, letterSpacing: ".14em", fontWeight: 700, color: "#8a8a80", margin: "18px 0 8px", textTransform: "uppercase" }}>Required — please tick all {p0.length}</div>
    {p0.map(k => (
      <label key={k} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", padding: 14, marginBottom: 8, cursor: "pointer", borderColor: consents[k] ? "#9fbc3b" : "#e6e6e0" }}>
        <input type="checkbox" checked={!!consents[k]} onChange={e => setConsents(c => ({ ...c, [k]: e.target.checked }))} style={{ width: 19, height: 19, marginTop: 1, accentColor: "#7a9c1e" }}/>
        <span style={{ fontSize: 14, lineHeight: 1.5 }}><b>{types[k].label}</b> — {first} {CONSENT_COPY[k] || ""}</span>
      </label>
    ))}
    {mustAnswer.length > 0 && <>
      <div style={{ fontSize: 11, letterSpacing: ".14em", fontWeight: 700, color: "#8a8a80", margin: "18px 0 4px", textTransform: "uppercase" }}>Please answer — either way is fine</div>
      <p style={{ fontSize: 12.5, color: "#8a8a80", margin: "0 0 8px", lineHeight: 1.5 }}>
        Saying no to these changes nothing about {first}'s place on the programme. We just need your decision on each.
      </p>
      {mustAnswer.map(k => {
        const v = consents[k];
        const set = (val) => setConsents(c => ({ ...c, [k]: val }));
        const pill = (on, tone) => ({ flex: 1, padding: "10px 12px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
          border: "1.5px solid " + (on ? (tone === "yes" ? "#7a9c1e" : "#b03535") : "#dcdcd4"),
          background: on ? (tone === "yes" ? "#eef7d8" : "#fdeceb") : "#fff",
          color: on ? (tone === "yes" ? "#3d5200" : "#7f1d1d") : "#5a5a52" });
        return (
          <div key={k} style={{ ...card, padding: 14, marginBottom: 8, borderColor: v === undefined ? "#e8c98a" : "#e6e6e0" }}>
            <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}><b>{types[k].label}</b> — {first} {CONSENT_COPY[k] || ""}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => set(true)} style={pill(v === true, "yes")}>Yes</button>
              <button type="button" onClick={() => set(false)} style={pill(v === false, "no")}>No</button>
            </div>
          </div>
        );
      })}
    </>}
    {optional.length > 0 && <div style={{ fontSize: 11, letterSpacing: ".14em", fontWeight: 700, color: "#8a8a80", margin: "18px 0 8px", textTransform: "uppercase" }}>Optional — your choice either way</div>}
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
    {/* The signature is what turns this from a record of ticked boxes into a
        document that was signed. Optional on purpose — a parent on a cracked
        phone screen should not be blocked from consenting — but captured
        whenever it can be, and printed on the record when it is. */}
    <div style={{ ...card, padding: 14, marginTop: 12 }}>
      <SignaturePad value={signature} onChange={setSignature} height={140} label={"Sign below (optional)"}/>
      <p style={{ fontSize: 12, color: "#9a9a90", margin: "8px 0 0", lineHeight: 1.5 }}>
        Your signature is stored with this consent record and appears on the printed copy.
      </p>
    </div>

    {err && <p role="alert" style={{ color: "#b03535", fontSize: 13.5, margin: "10px 0 0" }}>{err}</p>}
    {!busy && !err && !ready && (
      <p style={{ color: "#8a7a2e", fontSize: 13, margin: "10px 0 0" }}>
        {!p0Done ? "Tick all the required boxes above to confirm."
          : !answered ? "Answer Yes or No to each question above — both answers are fine."
          : "Add your name above to confirm."}
      </p>
    )}
    <button onClick={submit} disabled={!ready || busy}
      style={{ width: "100%", marginTop: 14, padding: 16, borderRadius: 14, border: "none", cursor: ready ? "pointer" : "default", fontWeight: 800, fontSize: 16, background: ready ? "#c9f24e" : "#e8e8e0", color: ready ? "#243300" : "#9a9a90" }}>
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

/* ── The public self-registration link — /apply?g=… ──────────────────────────
   A family filling this in on a phone, unsupervised, possibly on a slow
   connection, probably interrupted. Everything here follows from that:

   · Four short steps rather than one long page, because a twenty-field form
     on a phone is where people give up.
   · Every keystroke autosaves to the device. A dropped call at step three
     must not cost somebody ten minutes of typing.
   · The photo is checked BEFORE the family leaves the photo step, with the
     reason shown. Being told at the end that something ten minutes ago was
     wrong is the worst possible moment to hear it.
   · The consents are listed before submitting, so nobody is surprised by the
     email — and it says plainly which ones are optional.
   · The end state says what happens next and when, because the one thing this
     flow cannot do is confirm a place. */
/* The closed door.
 *
 * One generic message that is true for every family, and nothing else. The first
 * version listed every centre with its address and meeting days — which is a
 * wall of detail for somebody who only needs to know the form is shut and to go
 * to their own centre, goes stale the moment a centre moves, and publishes the
 * programme's whole physical footprint on a public page.
 *
 * The only variable part is the note an admin writes, because the reason changes
 * and "closed" with no reason invites somebody to keep refreshing.
 */
function SelfRegClosed({ info, gold }) {
  const mut = { color: "rgba(230,238,255,.68)" };
  return (
    <div style={{ padding: "60px 0" }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>NGG SUMMER SCHOOL</div>
      <h1 style={{ fontSize: 25, margin: "8px 0 0", fontWeight: 800, lineHeight: 1.2 }}>Online sign-up is closed</h1>
      <p style={{ ...mut, fontSize: 15.5, lineHeight: 1.65, marginTop: 12 }}>
        Your link is fine and nothing you did is wrong — we've closed the online form for now.
      </p>
      <p style={{ ...mut, fontSize: 15.5, lineHeight: 1.65, marginTop: 10 }}>
        You can still register your child <b style={{ color: "#fff" }}>in person at your nearest NGG centre</b>.
        Bring your child; it takes a few minutes at the desk, there's nothing to print and nothing to pay.
        Your centre coordinator can also tell you when sign-ups reopen.
      </p>
      {info.note && (
        <div style={{ marginTop: 18, padding: 15, borderRadius: 14,
                      background: "rgba(255,206,84,.08)", border: "1px solid rgba(255,206,84,.4)" }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>{info.note}</p>
        </div>
      )}
      <p style={{ ...mut, fontSize: 13, lineHeight: 1.6, marginTop: 18 }}>
        Keep this link — it's the same one, and it will work again when sign-ups reopen.
      </p>
    </div>
  );
}

function SelfRegisterPage() {
  const g = new URLSearchParams(window.location.search).get("g") || "";
  const [ctx, setCtx] = React.useState(null);
  const [state, setState] = React.useState("loading");  // loading|ready|closed|bad|error
  const draftKey = "ngg_apply_draft_" + g;
  const navy = "#101a33", gold = "#ffce54", goldInk = "#2b2100";

  React.useEffect(() => {
    if (!g) { setState("bad"); return; }
    NGGApi.public.selfreg.context(g)
      // `expired` and `open:false` are the same screen: the intake is shut. The
      // difference is only which control shut it — the link's own end date, or
      // the global pause — and a family does not need to know that.
      .then(r => { setCtx(r); setState((r.open === false || r.expired) ? "closed" : "ready"); })
      .catch(e => setState((e.code || e.message) === "gate_invalid" ? "bad" : "error"));
  }, [g]);

  const shell = (ch) => (
    <div style={{ minHeight: "100vh", background: navy, color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)", padding: "26px 18px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>{ch}</div>
    </div>
  );
  const notice = (title, body) => shell(
    <div style={{ textAlign: "center", padding: "70px 0" }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>NGG SUMMER SCHOOL</div>
      <h1 style={{ fontSize: 23, margin: "8px 0 0", fontWeight: 800 }}>{title}</h1>
      <p style={{ color: "rgba(230,238,255,.62)", marginTop: 10, fontSize: 14.5, lineHeight: 1.55 }}>{body}</p>
    </div>
  );
  if (state === "loading") return shell(<div style={{ textAlign: "center", padding: "90px 0" }}><div className="dash-spinner"/></div>);
  if (state === "bad") return notice("This link isn't open",
    "Registration links are given out by each centre and are closed once the intake is finished. Ask your centre coordinator for the current one.");
  /* Closed is not an error, and this screen must not behave like one.
     
     A family has arrived with a link somebody gave them and a child they want to
     enrol. The old copy told them to "try again shortly" and stopped — which
     leaves the one thing they need unsaid: every centre still registers children
     at the door. So the door comes first, with addresses and days, and the online
     form being shut is the second sentence rather than the whole page. */
  if (state === "closed") return shell(<SelfRegClosed info={(ctx && ctx.closed) || {}} gold={gold}/>);
  if (state === "error") return notice("We couldn't load the form",
    "Check your connection and refresh. Nothing you typed has been lost.");

  return shell(<SelfRegisterForm g={g} ctx={ctx} draftKey={draftKey} gold={gold} goldInk={goldInk}/>);
}

function SelfRegisterForm({ g, ctx, draftKey, gold, goldInk }) {
  const fields = (ctx.form && ctx.form.fields) || [];
  /* Grouped consent, with the document link, from selfreg_context. The
     fallback derives the same split from the flat list an older cached
     response carries, so a client that loaded before the server rolled still
     renders one tick rather than an empty consent step. */
  const PUBLICATION_KEYS = ["media", "site_visibility"];
  const cself = ctx.consentSelf || null;
  const flat = ctx.consents || [];
  const bundled = cself ? cself.bundled : flat.filter(c => PUBLICATION_KEYS.indexOf(c.key) === -1);
  const consentUrl = (cself && cself.url) || "/legal?doc=consent";
  const [step, setStep] = React.useState(0);   // 0 details · 1 photo · 2 consent · 3 done
  const [form, setForm] = React.useState(() => { try { return JSON.parse(localStorage.getItem(draftKey)) || {}; } catch (_) { return {}; } });
  const [errors, setErrors] = React.useState({});
  const [photo, setPhoto] = React.useState("");        // inline image (no cloud)
  const [photoHosted, setPhotoHosted] = React.useState("");  // uploaded URL (cloud)
  const [photoMsg, setPhotoMsg] = React.useState(null);
  const [agreed, setAgreed] = React.useState(false);
  const [publication, setPublication] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [done, setDone] = React.useState(null);
  const fileRef = React.useRef(null);
  const mut = { color: "rgba(230,238,255,.62)" };
  const inputS = { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 11, fontSize: 16,
                   background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.18)", color: "#eef2fb", fontFamily: "inherit" };
  const card = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14 };

  const set = (k, v) => setForm(f => {
    const n = { ...f, [k]: v };
    fields.forEach(d => { if (d.optionsFrom === k && n[d.key] && formFieldOptions(d, n).indexOf(n[d.key]) === -1) n[d.key] = ""; });
    try { localStorage.setItem(draftKey, JSON.stringify(n)); } catch (_) {}
    return n;
  });
  const visible = (f) => formFieldVisible(f, form);

  /* Checked here, on this step, while the camera is still open. The server
     runs the same rules again — this is the fast half, not the real one. */
  const inspect = (dataUrl) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const issues = [];
      if (img.width < 320 || img.height < 320) issues.push("It's too small to print — we need at least 320 pixels on each side.");
      if (img.height > 0 && img.width / img.height > 1.45) issues.push("This looks like a wide photo. A head-and-shoulders picture works best.");
      resolve({ ok: issues.length === 0, issues, w: img.width, h: img.height });
    };
    img.onerror = () => resolve({ ok: false, issues: ["We couldn't read that file. Try a JPG or PNG."], w: 0, h: 0 });
    img.src = dataUrl;
  });

  /* Last-resort inline encoder, for a client bundle too old to have
     uploadOrInline. Same budget as the one in api-client.js: 1000px/q0.78 keeps
     a real photograph near 150KB, inside nginx's 1MB body default. */
  const selfregInlinePhoto = async (file) => {
    let out = file;
    try {
      const tools = await NGGApi.imageTools();
      const r = await tools.prepare(file, { maxPx: 1000, quality: 0.78 });
      if (!r.skipped && r.blob) out = r.blob;
    } catch (_) { /* no optimiser — send what we have and let the size check speak */ }
    const url = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ""));
      fr.onerror = () => rej(new Error("unreadable_image"));
      fr.readAsDataURL(out);
    });
    if (url.length > 1400000) throw new Error("photo_too_large");
    return url;
  };

  /* The headshot, by whichever route this deployment actually has.
     
     This form used to ALWAYS embed the image in the submission JSON, on the
     reasoning that a public sign-up has no session and so cannot use the signed
     upload path. True — but it skipped the UNSIGNED one, which exists precisely
     for surfaces with no account and which the volunteer application already
     uses. The result was the only screen in the app that never touched
     Cloudinary even on a deployment paying for it: no CDN, no face-aware crop,
     no AI edit, and a megabyte of base64 through PHP on every registration.

     uploadOrInline picks: the cloud when one is configured, the image itself
     when not. Inline is still a first-class path — Cloudinary is opt-in and a
     form that cannot take a photo without it is not acceptable — and it is
     resampled to 1000px/q0.78 first, which is comfortably above what a printed
     ID card needs (the card art is delivered at 900px) and lands around
     80–150KB against nginx's 1MB client_max_body_size default. That resampling
     is what fixed the bare 413 on the last tap of a five-minute form. */
  const takeFile = async (file) => {
    setPhotoMsg(null); setErr("");
    if (!file) return;
    // Generous, and about the camera rather than the wire: a 40MP burst frame
    // is not a headshot, but a 9MB one shrinks fine and used to be refused.
    if (file.size > 30000000) { setPhotoMsg({ ok: false, issues: ["That file is over 30MB. Most phones have a 'medium' size option in the camera settings."] }); return; }
    setPhotoMsg({ ok: true, working: true, issues: [] });
    let up;
    try {
      /* Guarded against an OLDER api-client.js than this bundle expects — which
         is not hypothetical on a site that has had caching trouble: index.html
         and the client are separate files, and a proxy holding one but not the
         other is exactly the mismatch fingerprinted filenames were added to
         stop. Without this the family gets "uploadOrInline is not a function"
         where a photo should be. Inline is the correct fallback anyway. */
      up = typeof NGGApi.uploadOrInline === "function"
        ? await NGGApi.uploadOrInline(file, "headshot")
        : { url: await selfregInlinePhoto(file), inline: true };
    } catch (e) {
      const m = String((e && (e.message || e.code)) || "");
      setPhotoMsg({ ok: false, issues: [/photo_too_large/.test(m)
        ? "That photo is too large to send. Set your camera to a smaller size, or take it again."
        : "We couldn't use that photo (" + (m || "unknown") + "). Try another one."] });
      setPhoto(""); setPhotoHosted("");
      return;
    }
    /* Inspected locally either way, so a family is told about a 90-pixel avatar
       here rather than after a round trip. A hosted URL is same-origin-agnostic
       and loads fine in an <img>; only the data URL needs no network at all. */
    const v = await inspect(up.url);
    setPhotoMsg(v);
    if (!v.ok) { setPhoto(""); setPhotoHosted(""); return; }
    // `photo` is the image, `photoHosted` is a URL — the server takes either and
    // the preview renders both, so the rest of the form does not care which.
    setPhoto(up.inline ? up.url : "");
    setPhotoHosted(up.inline ? "" : up.url);
  };

  /* Banked before it is sent, and sent through the outbox rather than straight
     at the network — see outbox.js. The submissionId is minted once per form
     fill and survives a reload, so a re-send after a timeout replays the
     original registration instead of creating a second child. */
  const submit = async () => {
    if (!agreed) {
      setErr("Please tick the consent box — we can't register a child without their parent or guardian agreeing.");
      const el = document.querySelector('input[type="checkbox"]');
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); }
      return;
    }
    setBusy(true); setErr(""); setErrors({});
    const sid = window.outbox ? window.outbox.submissionId(draftKey) : "";
    // One of the two is set, never both — see takeFile. The server accepts
    // either and the reviewer's screen cannot tell the difference.
    const payload = { gate: g, data: form, photo, photoUrl: photoHosted, consent: true, publication, submissionId: sid };
    try {
      const r = window.outbox
        ? await window.outbox.send("selfreg.submit", payload, { label: regDisplayName(form) })
        : await NGGApi.public.selfreg.submit(payload);
      try { localStorage.removeItem(draftKey); } catch (_) {}
      // A fresh id for the next child, or a sibling registration would replay
      // this one's result straight back.
      if (window.outbox) window.outbox.resetSubmissionId(draftKey);
      setDone(r); setStep(3);
    } catch (e) {
      const c = e.code || e.message;
      if (e.data && e.data.errors) { setErrors(e.data.errors); setStep(0); setErr("Please check the highlighted answers."); }
      else if (c === "photo_rejected") { setStep(1); setPhoto(""); setPhotoHosted(""); setPhotoMsg({ ok: false, issues: ["That photo can't be used for an ID card. Please take another."] }); }
      else if (c === "consent_required") setErr("Please tick the consent box before sending.");
      /* 413 is the server refusing to READ the request, so nothing inside it —
         including a helpful error — ever comes back. The photo is the only
         thing in this payload big enough to cause it, and it is now shrunk on
         the way in, so this is the belt to that braces: name the cause and the
         fix instead of showing a bare status code. */
      else if (c === "http_413" || /\b413\b/.test(String(c || ""))) { setStep(1); setPhoto(""); setPhotoHosted(""); setPhotoMsg({ ok: false, issues: ["That photo was too large for the server to accept. Take it again — the camera's 'medium' size setting works best."] }); setErr("The photo was too large to send. Please take another."); }
      else if (c === "duplicate_suspect") setErr("Someone has already registered this child with the same contact details. Speak to your centre coordinator rather than registering twice.");
      else if (c === "closed") {
        /* Closed while they were filling it in. They have typed everything and
           the draft is still on the device — so say both, rather than refusing in
           one line after five minutes of work. */
        const ci = (e.data && e.data.closed) || {};
        setErr("Online sign-up closed while you were filling this in — sorry. Your answers are saved on this device. "
          + "You can register your child in person at your nearest NGG centre."
          + (ci.note ? " " + ci.note : ""));
      }
      /* Not a dead end: the server is still working on THIS submission, and the
         outbox retries until it can hand back the real result. Say so, rather
         than telling somebody to stop doing the thing they already did. */
      else if (c === "in_flight") setErr("Still sending — this is taking a moment. Leave the page open; it finishes on its own and you don't need to send it again.");
      /* Queued, not lost. The outbox has it on this device and will keep trying
         on its own, so the honest thing to say is "it will go", not "try again"
         — and certainly not "check your connection", which is what sent
         families round the retry loop that duplicated records. */
      else if (e.queued) setErr("Saved on this device — the connection dropped, so we'll finish sending it automatically. You can close this page.");
      else if (c === "rate_limited") setErr("That's a few submissions in a short time. Wait a couple of minutes and try again.");
      else setErr("We couldn't send that (" + (c || "unknown") + "). It's saved on this device — tell your centre coordinator what this says.");
      setBusy(false);
    }
  };

  const named = regDisplayName(form);
  const steps = ["Details", "Photo", "Consent", "Done"];
  /* The preview, and the thing every "have they chosen a photo yet" check reads.
     Exactly one of the two is ever set, and an <img> renders both, so nothing
     below this line has to know whether a cloud was involved. */
  const photoSrc = photo || photoHosted;
  // The age the server will derive, shown back for checking. -1 means the date
  // isn't a date yet, and `age` covers a form an admin published before the
  // date-of-birth field replaced the typed one.
  const derivedAge = dobToAge(form.dob);
  const shownAge = derivedAge >= 0 ? derivedAge : (form.age ? Number(form.age) : null);

  /* Leaving the Details step is where the answers get checked — and where the
     first bad one gets FOCUSED. Telling somebody "please check the highlighted
     answers" and leaving them at the top of a twelve-field form to find the
     highlight is not telling them anything; on a phone the offending box is
     usually below the fold. */
  const onContinue = () => {
    const bad = regMissing(fields, form);
    setErrors(bad);
    const keys = Object.keys(bad);
    if (!keys.length) { setErr(""); setStep(1); window.scrollTo({ top: 0, behavior: "instant" }); return; }
    setErr(keys.length === 1 ? "One answer needs fixing." : keys.length + " answers need fixing.");
    const el = document.querySelector('[data-fieldkey="' + keys[0] + '"]');
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const input = el.querySelector("input, select, textarea");
      if (input) input.focus({ preventScroll: true });
    }
  };

  if (step === 3 && done) return (
    <div style={{ textAlign: "center", padding: "50px 0" }}>
      <div style={{ fontSize: 46 }} aria-hidden="true">✓</div>
      <h1 style={{ fontSize: 24, margin: "10px 0 0", fontWeight: 800 }}>Sent for checking</h1>
      <p style={{ ...mut, marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>
        Thank you. A coordinator will look at {named || "this registration"} — usually within a day.
        {" "}Your consent is recorded, so there is nothing further for you to fill in: once they confirm it, the place is confirmed and the Genius ID is sent to the contact you gave.
      </p>
      <div style={{ ...card, padding: 14, marginTop: 18, textAlign: "left" }}>
        <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: gold }}>YOUR REFERENCE</div>
        <div className="mono" style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>{done.ref}</div>
        <p style={{ ...mut, fontSize: 12.5, margin: "8px 0 0" }}>Write this down. Your coordinator can find the registration with it.</p>
      </div>
      {/* Said plainly, because the one thing this flow cannot do is confirm a
          place, and a family that believes it can will stop chasing. */}
      <p style={{ ...mut, fontSize: 12.5, marginTop: 16 }}>This is not a confirmed place yet — it becomes one when a coordinator has checked it.</p>
    </div>
  );

  return <>
    <div style={{ marginBottom: 16 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>NGG SUMMER SCHOOL</div>
      <h1 style={{ fontSize: 24, margin: "4px 0 0", fontWeight: 800 }}>Register online</h1>
      <p style={{ ...mut, fontSize: 13.5, margin: "6px 0 0" }}>About five minutes. Everything saves on this device as you go.</p>
    </div>

    {/* Where you are, and how much is left. */}
    <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, margin: "0 0 18px" }}>
      {steps.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined}
          style={{ flex: 1, fontSize: 11, textAlign: "center", color: i <= step ? "#eef2fb" : "rgba(230,238,255,.4)" }}>
          <div style={{ height: 4, borderRadius: 3, background: i <= step ? gold : "rgba(255,255,255,.14)", marginBottom: 5 }}/>
          {label}
        </li>
      ))}
    </ol>

    {err && <div role="alert" style={{ ...card, borderColor: "rgba(255,120,100,.5)", background: "rgba(255,90,60,.12)", padding: 12, marginBottom: 14, fontSize: 14 }}>{err}</div>}

    {step === 0 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <RegFieldList fields={fields} form={form} set={set} errors={errors} visible={visible} inputS={inputS} gold={gold} mut={mut}/>
        {/* Enabled whatever the state of the answers. A greyed-out button that
            will not say why is the worst of both: you cannot proceed and you
            cannot find out what is wrong. Press it and it tells you. */}
        <button onClick={onContinue}
          style={{ padding: 14, minHeight: 48, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15.5, cursor: "pointer" }}>
          Continue → Photo
        </button>
        <p style={{ ...mut, fontSize: 11.5, textAlign: "center", margin: 0 }}>Saved on this device as you type — nothing is lost if you're interrupted.</p>
      </div>
    )}

    {step === 1 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ ...card, padding: 15 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>A photo for the ID card</div>
          <p style={{ ...mut, fontSize: 13.5, margin: "0 0 10px", lineHeight: 1.55 }}>
            Head and shoulders, facing the camera, in good light. A plain wall behind is best. It goes on a printed card, so a blurry one will be sent back.
          </p>
          {photoSrc
            ? <img src={photoSrc} alt="The photo you chose" style={{ width: 150, height: 190, objectFit: "cover", borderRadius: 12, display: "block", margin: "0 auto 10px" }}/>
            : <div style={{ width: 150, height: 190, borderRadius: 12, margin: "0 auto 10px", display: "grid", placeItems: "center",
                            border: "2px dashed rgba(255,255,255,.22)", color: "rgba(230,238,255,.4)", fontSize: 13 }}>No photo yet</div>}
          <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }}
            onChange={e => takeFile(e.target.files && e.target.files[0])}/>
          <button onClick={() => fileRef.current && fileRef.current.click()}
            style={{ width: "100%", padding: 13, minHeight: 48, borderRadius: 11, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            {photoSrc ? "Take a different photo" : "📷 Take or choose a photo"}
          </button>
          {/* The reason, on this step, while the camera is still open. */}
          {photoMsg && !photoMsg.ok && (
            <div role="alert" style={{ marginTop: 10, fontSize: 13.5, color: "#ffb3a3", lineHeight: 1.5 }}>
              {photoMsg.issues.map((t, i) => <div key={i}>• {t}</div>)}
            </div>
          )}
          {photoMsg && photoMsg.ok && photoMsg.working && (
            <div style={{ marginTop: 10, fontSize: 13.5, color: "rgba(230,238,255,.7)" }}>Getting the photo ready…</div>
          )}
          {photoMsg && photoMsg.ok && !photoMsg.working && (
            <div style={{ marginTop: 10, fontSize: 13.5, color: "#a7e8c6" }}>✓ That will work — {photoMsg.w}×{photoMsg.h}.</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(0)} style={{ padding: 13, minHeight: 48, borderRadius: 12, border: "1px solid rgba(255,255,255,.24)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Back</button>
          <button onClick={() => setStep(2)} disabled={!photoSrc}
            style={{ flex: 1, padding: 14, minHeight: 48, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15.5, cursor: "pointer", opacity: photoSrc ? 1 : .5 }}>
            Continue → Consent
          </button>
        </div>
      </div>
    )}

    {step === 2 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ ...card, padding: 15 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Consent</div>
          {/* One tick, given here, by the person giving it. This form is filled
              in by the parent or guardian themselves — so asking them to read
              the clauses now and then emailing them a link to agree to the same
              clauses tomorrow adds a day and a deliverability failure, not
              consent. What the tick covers is listed, and the full document is
              one tap away: a single tick standing for several clauses is only
              honest if the clauses are readable. */}
          <p style={{ ...mut, fontSize: 13.5, margin: "0 0 12px", lineHeight: 1.55 }}>
            Read this as the parent or guardian. One tick covers everything the place depends on — you're agreeing to it now, and nothing further is emailed to you.
          </p>
          {bundled.map(c => (
            <div key={c.key} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <span aria-hidden="true" style={{ color: gold, fontSize: 12 }}>•</span>
              <span style={{ flex: 1, fontSize: 14 }}>{c.label}</span>
            </div>
          ))}
          <a href={consentUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 12, color: gold, fontSize: 13.5, fontWeight: 700 }}>
            Read the full consent document ↗
          </a>

          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", marginTop: 14,
                          padding: "14px 15px", borderRadius: 12,
                          background: agreed ? "rgba(255,206,84,.10)" : "rgba(255,255,255,.05)",
                          border: "1px solid " + (agreed ? gold : "rgba(255,255,255,.2)") }}>
            <input type="checkbox" checked={agreed} onChange={e => { setAgreed(e.target.checked); if (err) setErr(""); }}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: gold, flex: "none" }}/>
            <span style={{ fontSize: 14, lineHeight: 1.5 }}>
              I am {named ? named.split(" ")[0] + "'s" : "this child's"} parent or guardian. I have read the consent document and I agree to all of it on their behalf.
            </span>
          </label>
        </div>

        {/* Deliberately NOT inside the tick above, and deliberately not
            required. Consent to publish a child's photograph is not freely
            given if refusing it costs them their place — which would make the
            consent worthless and the publication unlawful. Either answer is
            accepted and the place is identical. */}
        <div style={{ ...card, padding: 15 }}>
          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={publication} onChange={e => setPublication(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: gold, flex: "none" }}/>
            <span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>You may use {named ? named.split(" ")[0] + "'s" : "the child's"} photo publicly</span>
              <span style={{ ...mut, display: "block", fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
                Photographs and video from the programme, and being featured on our website. This one is genuinely your choice — saying no changes nothing about the place, and you can change your mind later.
              </span>
            </span>
          </label>
        </div>

        <div style={{ ...card, padding: 15 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Check before you send</div>
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            <div><span style={mut}>Name</span> · <b>{named || "—"}</b></div>
            {/* Shown as the age, because that is what a parent can check at a
                glance — but derived from the date they gave, so a mistyped year
                shows up here as an obviously wrong number. */}
            {shownAge !== null && <div><span style={mut}>Age</span> · {shownAge}{form.dob ? <span style={mut}> (born {form.dob})</span> : null}</div>}
            {form.centre && <div><span style={mut}>Centre</span> · {form.centre}</div>}
            {form.course && <div><span style={mut}>Course</span> · {form.course}</div>}
            <div><span style={mut}>Parent contact</span> · {form.parentEmail || form.parentPhone || "—"}</div>
          </div>
          <button onClick={() => setStep(0)} style={{ marginTop: 10, background: "none", border: "none", color: gold, textDecoration: "underline", cursor: "pointer", font: "inherit", fontSize: 13.5, padding: 0 }}>Change something</button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(1)} disabled={busy} style={{ padding: 13, minHeight: 48, borderRadius: 12, border: "1px solid rgba(255,255,255,.24)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Back</button>
          {/* Enabled, and it says why — the same reason the Details step's
              button is always live. A dead button that will not explain itself
              is the worst outcome on the last tap of a five-minute form. */}
          <button onClick={submit} disabled={busy}
            style={{ flex: 1, padding: 14, minHeight: 48, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15.5, cursor: "pointer", opacity: busy ? .6 : 1 }}>
            {busy ? "Sending…" : "Agree & send registration"}
          </button>
        </div>
      </div>
    )}
  </>;
}


/* ── The review desk — /review?g=… ───────────────────────────────────────────
   Its own link and its own password. A coordinator opens this with three
   hundred submissions and fifteen minutes, so the whole screen is built for
   deciding fast without deciding carelessly:

   · Filters that narrow to the ones needing a judgement — photo verdict
     first, because that is the only thing here a person cannot skim.
   · The photo large enough to actually look at, with the machine's verdict
     next to it rather than instead of it.
   · Approve in bulk for the clean ones; a rejection always costs a reason.
   · The count of what is left, always visible, because "am I nearly done" is
     the question that decides whether somebody finishes the queue today. */
/* ── The review desk — /review?g=… ───────────────────────────────────────────
   This is a DESK, not a report. It sits where the registration desk sits in
   the day: somebody at a table, working through a pile, deciding. So it is
   built the way the registration flow is built — one record at a time, the
   whole record on screen, the card that will be printed shown before the
   decision, and the next one queued up behind it.

   A filtered table was the wrong shape for that. A table asks you to approve
   from a summary line, which means approving without looking, which is the
   one thing a review step exists to prevent.

   Two modes, because there are two jobs:
   · REVIEW  — the default. One submission, everything the family typed, the
               photo at a size you can judge, the card preview, approve or
               reject, straight on to the next.
   · LIST    — the same queue as rows, for sweeping obviously-clean batches
               and for finding one particular child.

   Keyboard: A approves, R focuses the reason box, ← → move. A coordinator
   with three hundred of these should not have to reach for a mouse. */
/* Refusals that mean "unlock the desk again", not "something is broken".
   require_session answers `unauthorized` when there is no session and
   `session_expired` when a kiosk one has idled out — twelve hours is a normal
   working day, so the second is the one a real reviewer hits, and it was the one
   nobody checked for. `forbidden` is the gate-mismatch case: a session for
   another desk is not a session for this one, and re-unlocking is the fix.
   `suspended` is deliberately NOT here: that needs an admin, and offering a
   password box would just let somebody type the right password and be refused
   again for a reason nobody told them. */
const DESK_RELOCK = ["unauthorized", "session_expired", "forbidden"];

function ReviewDeskPage() {
  const g = new URLSearchParams(window.location.search).get("g") || "";
  const auth = (window.useAuth || (() => null))();
  const [state, setState] = React.useState("loading");   // loading|locked|ready|bad|error
  const [pw, setPw] = React.useState("");
  const [unlockBusy, setUnlockBusy] = React.useState(false);
  const [unlockErr, setUnlockErr] = React.useState("");
  const [d, setD] = React.useState(null);
  /* WHICH submission, in the URL. Each one is its own page — its own address,
     its own back button, its own thing to send somebody. A decision about a
     child is not a row that expands; sharing "the one I'm stuck on" should be
     copying the address bar, and Back should return to the queue rather than
     to whatever was open before the desk. */
  const [openId, setOpenId] = React.useState(() => new URLSearchParams(window.location.search).get("s") || "");
  React.useEffect(() => {
    const onPop = () => setOpenId(new URLSearchParams(window.location.search).get("s") || "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const goto = React.useCallback((id) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("s", id); else u.searchParams.delete("s");
    window.history.pushState({}, "", u.pathname + u.search);
    setOpenId(id || "");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const [f, setF] = React.useState({ status: "self_pending", q: "", centre: "", course: "", photo: "", page: 1 });
  const [picked, setPicked] = React.useState([]);
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const navy = "#101a33", gold = "#ffce54";

  const load = React.useCallback(() => {
    NGGApi.public.review.queue(g, f)
      .then(r => { setD(r); setState("ready"); })
      .catch(e => {
        const c = e.code || e.message;
        /* An expired desk session is the SAME situation as a locked one: the
           link is fine, the person just has to unlock it again. It arrives as
           `session_expired` rather than `unauthorized` (see require_session),
           which this only checked for — so a reviewer whose 12-hour kiosk
           session had timed out got "couldn't load, check your connection" for
           a connection that was fine, and no way back except knowing to reload. */
        if (DESK_RELOCK.indexOf(c) !== -1) { setState("locked"); setUnlockErr(c === "session_expired" ? "The desk session timed out. Unlock it again to carry on — nothing is lost." : ""); }
        else if (c === "gate_invalid") setState("bad");
        else setState("error");
      });
  }, [g, f]);
  React.useEffect(() => { if (!g) { setState("bad"); return; } load(); /* eslint-disable-next-line */ },
    [g, f.status, f.centre, f.course, f.photo, f.page]);
  React.useEffect(() => {
    if (state !== "ready") return;
    const t = setTimeout(() => load(), 260);
    return () => clearTimeout(t);
  }, [f.q]);

  const doUnlock = async (e) => {
    if (e) e.preventDefault();
    if (!pw.trim() || unlockBusy) return;
    setUnlockBusy(true); setUnlockErr("");
    try { await NGGApi.public.gate.unlock(g, pw.trim()); setPw(""); setState("loading"); load(); }
    catch (er) {
      const c = er.code || er.message;
      setUnlockErr(c === "bad_password" ? "That password isn't right for this desk."
        : c === "password_expired" ? "This desk's password has expired — ask an admin for the new one."
        : c === "gate_invalid" ? "This review link has been closed or revoked."
        : "Couldn't reach the server. Check your connection.");
    } finally { setUnlockBusy(false); }
  };

  const shell = (ch, wide) => (
    <div style={{ minHeight: "100vh", background: navy, color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: wide ? 1080 : 900, margin: "0 auto", padding: "20px 16px 70px" }}>{ch}</div>
    </div>
  );
  if (state === "loading") return shell(<div style={{ textAlign: "center", padding: "90px 0" }}><div className="dash-spinner"/></div>);
  if (state === "bad") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}>
    <h1 style={{ fontSize: 22 }}>This review link isn't open</h1>
    <p style={{ color: "rgba(230,238,255,.6)", marginTop: 8 }}>It has been closed or revoked. Ask an admin for a fresh one.</p></div>);
  if (state === "error") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}>
    <h1 style={{ fontSize: 21 }}>Couldn't load the queue</h1>
    <button onClick={() => { setState("loading"); load(); }} style={{ marginTop: 12, minHeight: 44, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Retry</button></div>);

  if (state === "locked") return shell(
    <form onSubmit={doUnlock} style={{ maxWidth: 380, margin: "60px auto 0", textAlign: "center" }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>REGISTRATION REVIEW</div>
      <h1 style={{ fontSize: 23, margin: "8px 0 0", fontWeight: 800 }}>Unlock the desk</h1>
      {/* Said out loud, because a coordinator who tries the check-in password
          three times and gives up is the failure this separation invites. */}
      <p style={{ color: "rgba(230,238,255,.6)", fontSize: 13.5, margin: "10px 0 16px", lineHeight: 1.55 }}>
        This desk has its own password — not the one used for check-in.
      </p>
      <input value={pw} onChange={e => setPw(e.target.value)} type="password" autoFocus aria-label="Review desk password"
        style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", minHeight: 48, borderRadius: 11, fontSize: 16,
                 background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.2)", color: "#eef2fb", textAlign: "center" }}/>
      {unlockErr && <p role="alert" style={{ color: "#ff9a9a", fontSize: 13.5, margin: "10px 0 0" }}>{unlockErr}</p>}
      <button disabled={unlockBusy} style={{ width: "100%", marginTop: 12, padding: 14, minHeight: 48, borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15.5, cursor: "pointer" }}>
        {unlockBusy ? "Checking…" : "Unlock →"}
      </button>
      <button type="button" onClick={() => auth && auth.openSignIn()} style={{ marginTop: 14, background: "none", border: "none", color: "rgba(230,238,255,.6)", textDecoration: "underline", cursor: "pointer", font: "inherit", fontSize: 13 }}>
        Or sign in as an admin
      </button>
    </form>
  );

  const rows = (d && d.queue) || [];
  const counts = (d && d.counts) || {};
  const setF1 = (k, v) => { setF(x => ({ ...x, [k]: v, page: k === "page" ? v : 1 })); setPicked([]); };
  const at = openId ? rows.findIndex(r => r.studentId === openId) : -1;
  const current = at >= 0 ? rows[at] : null;
  const inputS = { padding: "10px 12px", minHeight: 44, borderRadius: 10, fontSize: 15, background: "rgba(255,255,255,.07)",
                   border: "1px solid rgba(255,255,255,.18)", color: "#eef2fb", fontFamily: "inherit" };

  /* After a decision the row leaves this filter, so the desk moves to the one
     that was next — by address, so Back still walks the trail. Running out
     returns to the queue rather than stranding somebody on a page that no
     longer has anything to decide. */
  const afterDecision = (text) => {
    setMsg(text);
    const nextId = at >= 0 && rows[at + 1] ? rows[at + 1].studentId : "";
    NGGApi.public.review.queue(g, f).then(r => {
      setD(r);
      const still = (r.queue || []).some(x => x.studentId === nextId);
      goto(still ? nextId : "");
    }).catch(() => { load(); goto(""); });
  };

  /* ── One submission: its own page ──────────────────────────────────────
     Not the queue with a row expanded. A different address, a different
     screen, one job on it — and the queue is where Back goes. */
  if (openId) {
    if (!current) return shell(
      <div style={{ maxWidth: 520, margin: "70px auto 0", textAlign: "center" }}>
        <h1 style={{ fontSize: 21, fontWeight: 800 }}>That submission isn't in this queue</h1>
        <p style={{ color: "rgba(230,238,255,.6)", fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
          It may already have been decided, or it may be under a different filter. The queue is where to look.
        </p>
        <button onClick={() => goto("")} style={{ marginTop: 16, minHeight: 48, padding: "13px 24px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
          ← Back to the queue
        </button>
      </div>
    );
    return shell(<>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => goto("")}
          style={{ minHeight: 44, padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.22)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          ← Queue{counts.self_pending ? " · " + counts.self_pending + " waiting" : ""}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => goto(rows[at - 1] && rows[at - 1].studentId)} disabled={at <= 0} aria-label="Previous submission"
            style={{ minHeight: 44, padding: "10px 15px", borderRadius: 10, border: "1px solid rgba(255,255,255,.22)", background: "transparent", color: "#fff", cursor: "pointer", opacity: at <= 0 ? .35 : 1 }}>←</button>
          <span style={{ fontSize: 13, color: "rgba(230,238,255,.6)" }}>{at + 1} of {rows.length}</span>
          <button onClick={() => goto(rows[at + 1] && rows[at + 1].studentId)} disabled={at >= rows.length - 1} aria-label="Next submission"
            style={{ minHeight: 44, padding: "10px 15px", borderRadius: 10, border: "1px solid rgba(255,255,255,.22)", background: "transparent", color: "#fff", cursor: "pointer", opacity: at >= rows.length - 1 ? .35 : 1 }}>→</button>
        </div>
      </div>
      {msg && <div role="status" style={{ marginBottom: 12, fontSize: 13.5, color: "#a7e8c6" }}>{msg}</div>}
      <ReviewOne key={current.studentId} r={current} g={g} gold={gold}
        onPrev={() => at > 0 && goto(rows[at - 1].studentId)}
        onNext={() => at < rows.length - 1 && goto(rows[at + 1].studentId)}
        onDone={afterDecision}/>
    </>, true);
  }

  /* ── The queue ─────────────────────────────────────────────────────────
     An index. Its job is to get somebody to the right submission, not to be
     the place decisions are made — every row opens its own page. */
  return shell(<>
    <header style={{ marginBottom: 14 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>
        REGISTRATION REVIEW · {(d.gate && d.gate.name) || ""}
      </div>
      <h1 style={{ fontSize: 24, margin: "4px 0 0", fontWeight: 800 }}>{counts.self_pending || 0} waiting</h1>
      <p style={{ color: "rgba(230,238,255,.62)", fontSize: 13, margin: "5px 0 0" }}>
        Consent is already on file — the guardian gave it on the form. Approving is what confirms the place and issues the Genius ID, so look at the photo and the answers first.
      </p>
    </header>

    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }} role="tablist" aria-label="Status">
      {/* Approved now means `verified` — the row goes straight there. The
          parent_pending tab only appears while rows approved under the old
          flow are still waiting on their consent email, so it doesn't sit
          there as a permanent zero once they've drained. */}
      {[["self_pending", "Waiting", counts.self_pending || 0],
        ["verified", "Approved", counts.verified || 0],
        ...(counts.parent_pending ? [["parent_pending", "Awaiting consent", counts.parent_pending]] : []),
        ["rejected", "Rejected", counts.rejected || 0],
        ["all", "All", Object.values(counts).reduce((a, b) => a + b, 0)]].map(([k, label, n]) => (
        <button key={k} role="tab" aria-selected={f.status === k} onClick={() => setF1("status", k)}
          style={{ minHeight: 44, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5,
                   border: "1px solid " + (f.status === k ? gold : "rgba(255,255,255,.18)"),
                   background: f.status === k ? "rgba(255,206,84,.16)" : "transparent", color: f.status === k ? "#fff" : "rgba(230,238,255,.7)" }}>
          {label} · {n}
        </button>
      ))}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
      <input value={f.q} onChange={e => setF(x => ({ ...x, q: e.target.value, page: 1 }))} style={{ ...inputS, gridColumn: "1 / -1" }}
        placeholder="Search name, phone, email or reference" aria-label="Search the queue"/>
      <select value={f.photo} onChange={e => setF1("photo", e.target.value)} style={inputS} aria-label="Filter by photo verdict">
        <option value="">Any photo</option>
        <option value="check">⚠ Needs a look</option>
        <option value="fail">✕ Unusable</option>
        <option value="pass">✓ Fine</option>
      </select>
      <select value={f.centre} onChange={e => setF1("centre", e.target.value)} style={inputS} aria-label="Filter by centre">
        <option value="">All centres</option>
        {(d.centres || []).map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={f.course} onChange={e => setF1("course", e.target.value)} style={inputS} aria-label="Filter by course">
        <option value="">All courses</option>
        {(d.courses || []).map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>

    {msg && <div role="status" style={{ marginBottom: 12, fontSize: 13.5, color: "#a7e8c6" }}>{msg}</div>}

    {!rows.length && <p style={{ color: "rgba(230,238,255,.55)", fontSize: 14, padding: "40px 0", textAlign: "center" }}>
      {f.q || f.centre || f.course || f.photo ? "Nothing matches those filters." : "Nothing waiting. That is the good answer."}
    </p>}

    {rows.length > 0 && (
      <ReviewList rows={rows} g={g} gold={gold} picked={picked} setPicked={setPicked}
        selectable={f.status === "self_pending"} busy={busy}
        onOpen={(i) => goto(rows[i].studentId)}
        onBulk={async () => {
          setBusy("approve");
          try { const r = await NGGApi.public.review.approveBulk(g, picked); setPicked([]); setMsg(r.approved + " approved"); load(); }
          catch (e) { setMsg("Couldn't approve — " + (e.code || e.message)); }
          finally { setBusy(""); }
        }}/>
    )}

    {d.total > d.per && (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 12 }}>
        <span style={{ fontSize: 13, color: "rgba(230,238,255,.6)" }}>{d.shown} of {d.total}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={f.page <= 1} onClick={() => setF1("page", f.page - 1)} style={{ minHeight: 44, padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.22)", background: "transparent", color: "#fff", cursor: "pointer", opacity: f.page <= 1 ? .4 : 1 }}>← Back</button>
          <button disabled={f.page * d.per >= d.total} onClick={() => setF1("page", f.page + 1)} style={{ minHeight: 44, padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.22)", background: "transparent", color: "#fff", cursor: "pointer", opacity: f.page * d.per >= d.total ? .4 : 1 }}>Next →</button>
        </div>
      </div>
    )}
  </>);
}

/* Registration states in the words a coordinator uses, not the words the
   column holds. "parent_pending" is a database value; "waiting on consent" is
   what is actually true of the family. */
const REVIEW_STATE = {
  self_pending: "waiting to be checked",
  parent_pending: "waiting on consent",
  verified: "confirmed",
  rejected: "rejected",
};

/* Shared vocabulary for the photo verdict. The wording has to read as advice
   and never as the decision — the model does not get to turn a child away. */
function reviewVerdict(v) {
  return { pass:  { tint: "#a7e8c6", bg: "rgba(127,209,166,.18)", label: "Photo looks fine", short: "✓ photo ok" },
           check: { tint: "#ffce54", bg: "rgba(245,176,38,.18)", label: "Worth a look",      short: "⚠ check photo" },
           fail:  { tint: "#ffb3a3", bg: "rgba(255,90,60,.2)",   label: "Not usable on a card", short: "✕ photo unusable" } }[v]
      || { tint: "rgba(230,238,255,.6)", bg: "rgba(255,255,255,.08)", label: "Not checked", short: "photo unchecked" };
}

/* How long a family has been waiting, in the words somebody uses out loud.
 *
 * A date is a fact you have to do arithmetic on. "3 days waiting" is the same
 * fact already turned into the thing a reviewer is deciding with — and it is
 * the number that should be embarrassing when it grows, which a timestamp
 * quietly never is. */
function waitedFor(iso) {
  const t = Date.parse(String(iso || ""));
  if (!isFinite(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 0) return null;
  if (mins < 60) return { text: mins <= 1 ? "just now" : mins + " min", days: 0 };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { text: hrs + (hrs === 1 ? " hour" : " hours") + " waiting", days: 0 };
  const days = Math.floor(hrs / 24);
  return { text: days + (days === 1 ? " day" : " days") + " waiting", days };
}

/* One submission, the whole of it. Laid out the way the registration desk's
   confirm step is laid out, because it is the same job read backwards: there
   somebody checks what they typed before committing it, here somebody checks
   what a family typed before letting it through. */
/* The submitted photo, or a straight answer about why there isn't one.
 *
 * A family cannot submit this form without a photo — it is enforced on the
 * client and again on the server. So a row with no photoUrl does not mean "they
 * sent none", it means the server could not keep the one they sent: an
 * unwritable image directory is the usual cause, and on a shared host the only
 * trace was a line in a PHP error log. And a photoUrl that 404s renders as an
 * identical blank box, because <img> failures are silent.
 *
 * Three states, three different things to do about them, so the desk says which
 * one it is instead of showing the same grey rectangle for all three. */
function ReviewPhoto({ r }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [r.photoUrl]);
  const box = { width: 200, height: 254, borderRadius: 12, display: "grid", placeItems: "center",
                textAlign: "center", padding: 12, boxSizing: "border-box", fontSize: 12.5, lineHeight: 1.5 };
  // `stored === false` is the server telling us it lost the image. null means an
  // older submission that predates the flag — don't accuse the host on a guess.
  const lost = r.photoUrl === "" && r.photo && r.photo.stored === false;

  if (r.photoUrl && !failed) {
    return <img src={r.photoUrl} alt={"Photo submitted for " + r.fullName} onError={() => setFailed(true)}
      style={{ width: 200, height: 254, objectFit: "cover", borderRadius: 12, display: "block", background: "rgba(255,255,255,.06)" }}/>;
  }
  if (r.photoUrl && failed) {
    return (
      <div style={{ ...box, background: "rgba(255,90,60,.12)", border: "1px solid rgba(255,120,100,.45)", color: "#ffb3a3" }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Photo won't load</div>
          <div>It's on the record but the server didn't return it. Send this line to your administrator:</div>
          <div className="mono" style={{ fontSize: 10.5, marginTop: 6, wordBreak: "break-all", opacity: .85 }}>{r.photoUrl}</div>
        </div>
      </div>
    );
  }
  if (lost) {
    return (
      <div style={{ ...box, background: "rgba(255,90,60,.12)", border: "1px solid rgba(255,120,100,.45)", color: "#ffb3a3" }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Photo was not saved</div>
          <div>The family did send one — this server couldn't store it. Ask an administrator to check
          Diagnostics → Photo storage; the image directory is usually not writable.</div>
        </div>
      </div>
    );
  }
  /* No photoUrl and no flag either way. This form cannot be submitted without a
     photo, so "the family sent none" is not a possible explanation on this
     screen — the honest reading is that this submission arrived under a version
     that discarded the image, which is unrecoverable and needs a retake. Saying
     "No photo" here blamed the family for something the software did. */
  return (
    <div style={{ ...box, background: "rgba(245,176,38,.10)", border: "1px solid rgba(245,176,38,.35)", color: "#ffce54" }}>
      <div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>No photo on file</div>
        <div style={{ color: "rgba(230,238,255,.7)" }}>This form can't be sent without one, so the image was
        lost before it reached the record. It can't be recovered — approve on the answers and send a retake
        link, or ask the family to register again.</div>
      </div>
    </div>
  );
}

/* The list's 42×54 thumbnail. Same three states as ReviewPhoto, compressed to
   what fits in a row: the picture, a warning glyph, or nothing. */
function ReviewThumb({ r }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [r.photoUrl]);
  const box = { width: 42, height: 54, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", fontSize: 17 };
  const lost = r.photoUrl === "" && r.photo && r.photo.stored === false;
  if (r.photoUrl && !failed) {
    return <img src={r.photoUrl} alt="" onError={() => setFailed(true)}
      style={{ width: 42, height: 54, objectFit: "cover", borderRadius: 8, flex: "none" }}/>;
  }
  if (failed || lost) {
    return <div title={failed ? "This photo won't load — open the record" : "The server did not save this photo"}
      style={{ ...box, background: "rgba(255,90,60,.16)", border: "1px solid rgba(255,120,100,.5)", color: "#ffb3a3" }}>⚠</div>;
  }
  // Same reasoning as ReviewPhoto: on this screen an absent photo is a lost one.
  return <div title="No photo on file — the image was lost before it reached the record"
    style={{ ...box, background: "rgba(245,176,38,.12)", border: "1px solid rgba(245,176,38,.4)", color: "#ffce54", fontSize: 14 }}>?</div>;
}

function ReviewOne({ r, g, gold, onPrev, onNext, onDone }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const noteRef = React.useRef(null);
  const mut = { color: "rgba(230,238,255,.55)" };
  const card = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 16 };
  const v = reviewVerdict(r.photo && r.photo.verdict);
  const decided = r.regStatus !== "self_pending";

  const run = async (fn, label) => {
    setBusy(label); setErr("");
    try { await fn(); onDone(r.fullName + " " + label + "d"); }
    catch (e) { setErr(e.code === "reason_required" ? "Say why, so the family can be told what to fix."
      : e.code === "not_pending" ? "Somebody else already handled this one."
      : (e.code || e.message)); setBusy(""); }
  };
  const approve = () => run(() => NGGApi.public.review.approve(g, r.studentId, ""), "approve");
  const reject = () => run(() => NGGApi.public.review.reject(g, r.studentId, note.trim()), "reject");

  /* A coordinator with three hundred of these should not have to reach for a
     mouse between each one. Ignored while typing, so R in a reason does not
     submit it. */
  React.useEffect(() => {
    const onKey = (e) => {
      const t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (e.key === "ArrowLeft") { onPrev(); return; }
      if (e.key === "ArrowRight") { onNext(); return; }
      if (decided || busy) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); approve(); }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); noteRef.current && noteRef.current.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return <>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }} className="review-grid">
      {/* Left: the photo, at a size you can actually judge, with the machine's
          reading beside it rather than instead of it. */}
      <div style={card}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "none" }}>
            {/* A blank frame used to be the answer to three different questions:
                no photo was sent, the server failed to keep the one that was, or
                the URL on the row does not load. The desk can distinguish all
                three, so it should — an empty box that will not say why is what
                made this impossible to report. */}
            <ReviewPhoto r={r}/>
          </div>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 22, margin: 0, fontWeight: 800 }}>{r.fullName}</h2>
              {r.possibleDuplicate && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999, color: "#ffce54", background: "rgba(245,176,38,.18)" }}>possible duplicate</span>}
              {decided && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999, color: "#a7e8c6", background: "rgba(127,209,166,.18)" }}>{r.regStatus === "rejected" ? "rejected" : "approved"}</span>}
            </div>
            <div className="mono" style={{ ...mut, fontSize: 12.5, marginTop: 5 }}>{r.studentId}{r.submittedAt ? " · submitted " + String(r.submittedAt).slice(0, 10) : ""}{(() => {
              const w = waitedFor(r.submittedAt); return w && !decided ? " · " + w.text : "";
            })()}</div>
            {/* Age and the date it came from, together. The age is what a
                reviewer checks against the photograph in front of them; the date
                is what makes that check possible — an age on its own cannot be
                wrong in a way anybody can see, and this programme has a floor
                and a ceiling on it. */}
            {(r.dob || r.age) && (
              <div style={{ ...mut, fontSize: 12.5, marginTop: 3 }}>
                {r.age ? "Age " + r.age : "Age not given"}
                {r.dob ? " · born " + String(r.dob) : " · no date of birth on file"}
                {r.dob && r.age && (r.age < 5 || r.age > 19) ? " ⚠ outside the programme's age range" : ""}
              </div>
            )}

            {/* WHICH records it collides with. The chip on its own was a dead
                end dressed as a warning: a reviewer still had to go and search
                the name by hand to find out whether this is the same child
                entered twice at one centre — reject it — or two children who
                happen to share a very common name, which must go through.
                Those need opposite decisions and the difference is usually
                obvious the moment you can see both rows. */}
            {(r.duplicates || []).length > 0 && (
              <div style={{ marginTop: 11, padding: 11, borderRadius: 11, background: "rgba(245,176,38,.1)", border: "1px solid rgba(245,176,38,.35)" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#ffce54" }}>
                  Already {r.duplicates.length === 1 ? "one record" : r.duplicates.length + " records"} under this name
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "7px 0 0", display: "grid", gap: 5 }}>
                  {r.duplicates.map(d => (
                    <li key={d.studentId} className="mono" style={{ fontSize: 12, color: "rgba(230,238,255,.8)" }}>
                      {d.displayId || d.studentId} · {d.centre || "no centre"}{d.course ? " · " + d.course : ""} · {REVIEW_STATE[d.regStatus] || d.regStatus}
                      {d.submittedAt ? " · " + String(d.submittedAt).slice(0, 10) : ""}
                    </li>
                  ))}
                </ul>
                <p style={{ ...mut, fontSize: 12, margin: "8px 0 0", lineHeight: 1.5 }}>
                  Same centre and same course usually means the family registered twice. A different centre, or a common name, usually means two different children — check the photo and the guardian's number before rejecting either.
                </p>
              </div>
            )}

            <div style={{ marginTop: 12, padding: 11, borderRadius: 11, background: v.bg, border: "1px solid " + v.tint + "33" }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: v.tint }}>{v.label}{r.photo && r.photo.score !== null && r.photo.score !== undefined ? " · " + r.photo.score + "/100" : ""}</div>
              {r.photo && (r.photo.notes || []).length > 0 && <div style={{ ...mut, fontSize: 12.5, marginTop: 4 }}>{r.photo.notes.join(". ")}</div>}
              {r.photo && (r.photo.issues || []).length > 0 && <div style={{ ...mut, fontSize: 12, marginTop: 4 }}>{r.photo.issues.join(", ")}</div>}
              {/* Which checks actually ran. A verdict from half of them reads
                  identically to one from all of them otherwise. */}
              <div style={{ ...mut, fontSize: 11.5, marginTop: 5 }}>
                {r.photo && r.photo.source === "ai" ? "Size and vision check" :
                 r.photo && r.photo.source === "shape_ai_unavailable" ? "Size only — the vision check was unavailable" : "Size only"}
                {r.photo && r.photo.width ? " · " + r.photo.width + "×" + r.photo.height : ""}
                {" · this is advice, not the decision"}
              </div>
            </div>

            {/* What the family said about PUBLISHING this photo, next to the
                photo. It is the one consent answer that changes what a person
                may do with what is on their screen, and a reviewer who has to
                go and look it up elsewhere will assume yes. */}
            {r.publication === "declined" && (
              <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "rgba(255,120,100,.12)", border: "1px solid rgba(255,120,100,.42)" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#ffb3a3" }}>Not for publication</div>
                <div style={{ ...mut, fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>The guardian declined photo and website use. ID card only — do not post this photo or feature {r.firstName || "this child"} on the site. The place is unaffected.</div>
              </div>
            )}
            {r.publication === "granted" && (
              <div style={{ ...mut, fontSize: 12, marginTop: 8 }}>✓ Guardian agreed to photo and website use.</div>
            )}
          </div>
        </div>
      </div>

      {/* Right: everything the family actually typed, against the questions
          they were asked. A field nobody looks at may as well not be asked. */}
      <div style={card}>
        <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: gold, marginBottom: 10 }}>WHAT THEY SUBMITTED</div>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, 34%) 1fr", gap: "7px 14px", fontSize: 14 }}>
          {(r.answers || []).map(a => (
            <React.Fragment key={a.key}>
              <dt style={{ ...mut, fontSize: 12.5 }}>{a.label}</dt>
              <dd style={{ margin: 0, wordBreak: "break-word", color: a.value ? "#eef2fb" : "rgba(230,238,255,.35)" }}>{a.value || "—"}</dd>
            </React.Fragment>
          ))}
          {!(r.answers || []).length && <>
            <dt style={{ ...mut, fontSize: 12.5 }}>Centre</dt><dd style={{ margin: 0 }}>{r.centre || "—"}</dd>
            <dt style={{ ...mut, fontSize: 12.5 }}>Course</dt><dd style={{ margin: 0 }}>{r.course || "—"}</dd>
          </>}
        </dl>
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid rgba(255,255,255,.1)" }}>
          <div style={{ ...mut, fontSize: 12.5 }}>Guardian we will email on approval</div>
          <div style={{ fontSize: 14.5, marginTop: 3 }}>
            {r.guardianName || "—"}{" · "}
            <span className="mono">{r.parentEmail || r.guardianPhone || "no contact on file"}</span>
          </div>
        </div>
        {r.reviewNote && <div style={{ ...mut, fontSize: 13, marginTop: 10 }}>Note: {r.reviewNote}</div>}
      </div>

    </div>

    {!decided && (
      <div style={{ position: "sticky", bottom: 0, marginTop: 16, padding: "12px 0 calc(4px + env(safe-area-inset-bottom,0px))",
                    background: "linear-gradient(180deg, rgba(16,26,51,0) 0%, #101a33 26%)" }}>
        {err && <div role="alert" style={{ color: "#ff9a9a", fontSize: 13.5, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button disabled={!!busy} onClick={approve}
            style={{ minHeight: 50, padding: "13px 26px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15.5, cursor: "pointer" }}>
            {busy === "approve" ? "Approving…" : "Approve & confirm place"}
          </button>
          <input ref={noteRef} value={note} onChange={e => setNote(e.target.value)} placeholder="Reason, if rejecting"
            aria-label={"Reason for rejecting " + r.fullName}
            style={{ flex: "1 1 200px", minWidth: 150, minHeight: 50, padding: "12px 14px", borderRadius: 11, fontSize: 15,
                     background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.18)", color: "#eef2fb" }}/>
          <button disabled={!!busy} onClick={reject}
            style={{ minHeight: 50, padding: "13px 20px", borderRadius: 12, border: "1px solid rgba(255,120,100,.5)", background: "transparent", color: "#ffb3a3", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
        <div style={{ ...mut, fontSize: 11.5, marginTop: 7 }}>
          <b>A</b> approve · <b>R</b> reason · <b>←</b> <b>→</b> move between submissions
        </div>
      </div>
    )}
  </>;
}

/* The list. For sweeping obviously-clean batches and for finding one child —
   not for deciding from, which is why every row opens into the full record. */
function ReviewList({ rows, g, gold, picked, setPicked, selectable, busy, onOpen, onBulk }) {
  const allPicked = rows.length > 0 && rows.every(r => picked.indexOf(r.studentId) !== -1);
  const mut = { color: "rgba(230,238,255,.55)" };
  return <>
    {selectable && (
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer", minHeight: 44 }}>
          <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rows.map(r => r.studentId))}
            style={{ width: 20, height: 20, accentColor: gold }}/>
          Select all {rows.length} shown
        </label>
        {picked.length > 0 && (
          <button disabled={!!busy} onClick={onBulk}
            style={{ minHeight: 44, padding: "10px 18px", borderRadius: 11, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            {busy === "approve" ? "Approving…" : "Approve " + picked.length + " →"}
          </button>
        )}
        <span style={{ ...mut, fontSize: 12.5 }}>Approving from here does not show you the photo — open one to look.</span>
      </div>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => {
        const v = reviewVerdict(r.photo && r.photo.verdict);
        const on = picked.indexOf(r.studentId) !== -1;
        return (
          <div key={r.studentId} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 12px", borderRadius: 12,
                background: on ? "rgba(255,206,84,.12)" : "rgba(255,255,255,.06)",
                border: "1px solid " + (on ? "rgba(255,206,84,.45)" : "rgba(255,255,255,.12)") }}>
            {selectable && <input type="checkbox" checked={on} aria-label={"Select " + r.fullName}
              onChange={() => setPicked(p => on ? p.filter(x => x !== r.studentId) : p.concat([r.studentId]))}
              style={{ width: 20, height: 20, accentColor: gold, flex: "none", cursor: "pointer" }}/>}
            {/* A row whose thumbnail is an empty grey box says nothing about
                whether the photo is missing or merely failed to arrive — and
                bulk-approving from this list is offered right above it. The
                marker is what stops a whole page being approved on the
                assumption the photos were fine. */}
            <ReviewThumb r={r}/>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{r.fullName}</div>
              <div className="mono" style={{ ...mut, fontSize: 12 }}>{r.centre || "no centre"}{r.course ? " · " + r.course : ""} · {r.studentId}</div>
            </div>
            {/* How long they have been waiting, not when they arrived. Past two
                days it stops being grey — the queue is served oldest first, so
                anything old is either a backlog or something everybody has been
                quietly stepping over. */}
            {(() => {
              const w = waitedFor(r.submittedAt);
              if (!w) return null;
              const late = w.days >= 2;
              return <span title={"Submitted " + String(r.submittedAt || "").slice(0, 10)}
                style={{ fontSize: 11.5, fontWeight: late ? 800 : 600, whiteSpace: "nowrap", flex: "none",
                         color: late ? "#ffce54" : "rgba(230,238,255,.5)" }}>{w.text}</span>;
            })()}
            <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, color: v.tint, background: v.bg, whiteSpace: "nowrap", flex: "none" }}>{v.short}</span>
            {r.possibleDuplicate && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, color: "#ffce54", background: "rgba(245,176,38,.18)", flex: "none" }}>dup?</span>}
            <button onClick={() => onOpen(i)}
              style={{ minHeight: 44, padding: "9px 15px", borderRadius: 10, border: "1px solid rgba(255,255,255,.24)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", flex: "none" }}>
              Open →
            </button>
          </div>
        );
      })}
    </div>
  </>;
}

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
  const [lockNote, setLockNote] = React.useState("");
  const [switching, setSwitching] = React.useState(false);
  const draftKey = "ngg_gate_draft_" + g;

  const load = React.useCallback(() => {
    setState("loading");
    NGGApi.public.gate.context(g)
      .then(r => { setCtx(r); setState("ready"); })
      .catch(e => {
        const c = e.code || e.message;
        /* Every refusal in DESK_RELOCK means "unlock this desk", not "something
         * is broken" — including `forbidden`, which this used to route to a
         * dead end.
         *
         * `forbidden` is what the gate route answers whenever the session on
         * the device is not an admin AND not a kiosk session bound to THIS
         * gate. Three ordinary situations land there: a parent or mentor
         * signed into their own account on a shared desk phone, a volunteer
         * or student signed in with their ID card, and a staffer who unlocked
         * a DIFFERENT gate in this browser. All three are fixed by typing the
         * desk password — which the page refused to show them, offering
         * "Your account doesn't have staff access" and a Retry button that
         * could only ever fail again. The link looked broken; it never was. */
        if (DESK_RELOCK.indexOf(c) !== -1) {
          setLockNote(c === "session_expired" ? "The desk session timed out. Unlock it again to carry on — nothing is lost."
            : c === "forbidden" ? "" : "");
          setState("need-auth");
        } else {
          setErr(c === "gate_invalid" ? "This gate link has been closed or revoked. Ask an admin for a fresh one."
            : "Couldn't load the gate — check your connection.");
          setState("error");
        }
      });
  }, [g]);
  React.useEffect(() => { load(); }, [load]);
  /* After the operator signs in through the modal, retry automatically — but
   * only on the transition INTO signed-in. Re-running while already signed in
   * as somebody without access would just re-fetch the same 403. */
  const wasSignedIn = React.useRef(auth && auth.isSignedIn);
  React.useEffect(() => {
    const now = !!(auth && auth.isSignedIn);
    if (state === "need-auth" && now && !wasSignedIn.current) load();
    wasSignedIn.current = now;
  }, [auth && auth.isSignedIn]);

  /* Sign out of the personal account WITHOUT leaving the gate.
   *
   * auth.signOut() navigates to home, which on a desk phone throws the
   * operator off the link they were sent and gives them nothing to go back
   * to. Here the point of signing out is to carry on at this gate. */
  const switchAccount = async () => {
    if (switching) return;
    setSwitching(true);
    try { await NGGApi.auth.logout(); } catch (_) {}
    try { if (auth && auth.refresh) await auth.refresh(); } catch (_) {}
    setSwitching(false);
    if (auth && auth.openSignIn) auth.openSignIn();
  };

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
        : c === "password_expired" ? "This desk password has expired. Ask an admin to issue a new one — the link itself is still fine."
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
  if (state === "need-auth") {
    /* Someone IS signed in, and it is not an account that can open this desk.
     * Saying only "sign in" to a person who is already signed in reads as the
     * link being broken, so name what happened and give both ways out. */
    const blockedAs = auth && auth.isSignedIn ? auth.member : null;
    const who = blockedAs ? (blockedAs.fullName || blockedAs.name || blockedAs.email || "this account") : "";
    return shell(<div style={{ ...card, padding: 24, marginTop: 48 }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 38 }}>🛡️</div>
      <h1 style={{ fontSize: 22, margin: "10px 0 6px" }}>Open the desk</h1>
      <p style={{ color: "rgba(230,238,255,.66)", fontSize: 14, lineHeight: 1.55 }}>This gate link is real — the person operating it just needs to unlock it.</p>
      {lockNote && <p style={{ color: "#ffd58a", fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}>{lockNote}</p>}
      {blockedAs && <p style={{ color: "rgba(230,238,255,.66)", fontSize: 13.5, lineHeight: 1.55, margin: "10px 0 0" }}>
        This device is signed in as <b style={{ color: "#eef2fb" }}>{who}</b>, which can't open a registration desk.
        Use the desk password below — it works without an account, and it will sign {who} out of this device.
      </p>}
      {!blockedAs && <button onClick={() => auth && auth.openSignIn()} style={{ marginTop: 14, padding: "13px 26px", borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Staff sign-in →</button>}
      {blockedAs && <button onClick={switchAccount} disabled={switching} style={{ marginTop: 14, padding: "11px 22px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{switching ? "Signing out…" : "Sign in as staff instead"}</button>}
    </div>
    {/* Desk password — no admin account needed. */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 14px", color: "rgba(230,238,255,.4)", fontSize: 11, fontWeight: 700, letterSpacing: ".14em" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }}/>OR DESK PASSWORD<div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }}/>
    </div>
    <form onSubmit={doUnlock} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <input type="password" value={pw} onChange={e => { setPw(e.target.value); if (unlockErr) setUnlockErr(""); }} placeholder="Desk password" autoComplete="off"
        style={{ width: "100%", padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 16, fontFamily: "inherit" }}/>
      {unlockErr && <div role="alert" style={{ fontSize: 12.5, color: "#ff9a9a" }}>{unlockErr}</div>}
      <button type="submit" disabled={unlockBusy || !pw.trim()} style={{ padding: "12px 26px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: pw.trim() ? 1 : .55 }}>{unlockBusy ? "Unlocking…" : "Unlock the desk"}</button>
      <p style={{ color: "rgba(230,238,255,.5)", fontSize: 11.5, textAlign: "center", margin: "2px 0 0", lineHeight: 1.5 }}>Ask your coordinator for the desk password. It works only for this gate and expires automatically.</p>
    </form>
  </div>);
  }
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

/* Conditional-logic evaluation for a form field. A line-for-line mirror of
   form_field_visible() in api/_lib/domain/registration.php — the server is the
   authority, this only decides what to draw, and the two are pinned together
   by tests. Anything the browser hides, the server also treats as absent, so a
   hidden required field never blocks a submission.

   ops: is · isNot · in (comma list) · answered · empty
   The pre-upgrade {key,value} shape has no op and means `is`. */
function formFieldVisible(f, data) {
  const c = f && f.showIf;
  if (!c || !c.key) return true;
  const raw = data ? data[c.key] : undefined;
  const vals = (Array.isArray(raw) ? raw : [raw]).map(x => String(x == null ? "" : x).trim()).filter(Boolean);
  const want = String(c.value == null ? "" : c.value).trim();
  switch (c.op || "is") {
    case "answered": return vals.length > 0;
    case "empty":    return vals.length === 0;
    case "isNot":    return vals.indexOf(want) === -1;
    case "in":       return want.split(",").map(x => x.trim()).filter(Boolean).some(v => vals.indexOf(v) !== -1);
    default:         return vals.indexOf(want) !== -1;
  }
}

/* The options a choice field offers right now. `optionsFrom` names another
   field — the faculty — and `optionsBy` is the faculty→courses map the server
   ships alongside it, so narrowing costs no round trip and the list cannot
   drift from the catalogue.
   
   With nothing chosen in the parent field, a dependent field offers NOTHING.
   It used to fall back to the flat list of every course in the programme,
   which read as "the cascade is broken": the Course box said "choose a faculty
   first" and then listed all twelve courses anyway. Worse, you could pick one
   before choosing a faculty and have it silently cleared the moment you did —
   the reconciliation below drops any answer that is not in the new parent's
   list. The volunteer form has always gated its course picker this way; this
   is the same rule. */
function formFieldOptions(f, data) {
  const base = (f && f.options) || [];
  if (!f || !f.optionsFrom) return base;
  const picked = String((data && data[f.optionsFrom]) || "").trim();
  if (!picked) return [];
  const sub = (f.optionsBy && f.optionsBy[picked]) || null;
  // A faculty with no courses mapped is an empty list, not the full one:
  // offering courses from other faculties would just be wrong.
  return sub ? sub : [];
}

/* The child's name as the LIVE form collects it.
   Registration asks for First and Last separately; a form definition
   published before that split still has a single `fullName`. Reading both
   keeps the wizard working across a deploy — and stops a hardcoded
   `form.fullName` silently disabling the Continue button, which is exactly
   what happened when the fields were split. */
function regDisplayName(form) {
  const two = [form.firstName, form.lastName].map(v => (v || "").trim()).filter(Boolean).join(" ");
  return two || (form.fullName || "").trim();
}

/* What is still missing from the answers, keyed by field.
 *
 * The wizard used to let you leave the Details step as soon as a name was
 * typed, and everything else was checked by the SERVER after the photo, the
 * consents and the submit. So a family who left Centre blank found out about
 * it four screens later, thrown back to the top of a twelve-field form with
 * "please check the highlighted answers" — having already taken a photo of
 * their child and read three consent clauses. The rules are the same ones the
 * server enforces; running them here just moves the news to the moment the
 * answer is wrong.
 *
 * The server still checks. This is the courtesy, not the guard. */
function regMissing(fields, form) {
  const out = {};
  fields.forEach(f => {
    if (!f || ['section', 'info'].indexOf(f.type) !== -1) return;
    if (!formFieldVisible(f, form)) return;          // a hidden field is not owed an answer
    const raw = form[f.key];
    const v = Array.isArray(raw) ? raw.join("") : String(raw == null ? "" : raw).trim();
    if (f.required && !v) { out[f.key] = "This one is needed."; return; }
    if (!v) return;
    if (f.type === "email" && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v)) out[f.key] = "That doesn't look like an email address.";
    if (f.type === "number") {
      const n = Number(v);
      if (!isFinite(n)) out[f.key] = "Numbers only.";
      else if (f.min != null && n < Number(f.min)) out[f.key] = "Must be " + f.min + " or more.";
      else if (f.max != null && n > Number(f.max)) out[f.key] = "Must be " + f.max + " or less.";
    }
    if (f.type === "phone" && v.replace(/\D/g, "").length < 10) out[f.key] = "That looks too short for a phone number.";
  });
  /* Either phone or email, not neither — the rule the server applies and the
     one nothing on the form states, because it belongs to the PAIR and every
     message on a form belongs to a single field. Attached to the phone box,
     which is the one a Nigerian family is more likely to have. */
  const has = (k) => String(form[k] == null ? "" : form[k]).trim() !== "";
  const asks = (k) => fields.some(f => f && f.key === k && formFieldVisible(f, form));
  if (asks('parentPhone') && asks('parentEmail') && !has('parentPhone') && !has('parentEmail')) {
    out.parentPhone = "We need a phone number or an email — this is how we reach your parent or guardian.";
  }
  return out;
}

/* The live form's fields, rendered.
   Shared by the staff gate and the public self-registration link, because the
   two must ask exactly the same questions with exactly the same conditional
   logic — a second copy is a second set of rules that drifts the first time
   somebody edits the form builder. */
function RegFieldList({ fields, form, set, errors, visible, inputS, gold, mut }) {
  const shown = fields.filter(visible);
  return <>
    {shown.map((f, i) => {
      /* A heading has to be visibly a heading. This was a 10px mono line with
         6px of air above it, which at arm's length on a phone is another row
         of grey text in a column of grey text — and the form it is dividing is
         twelve boxes long. The rule and the space are what make the groups
         read as groups; without them the questions run together and a parent
         does not notice the form has changed who it is asking about. */
      if (f.type === "section") return (
        <div key={f.key} style={{ marginTop: i === 0 ? 0 : 20 }}>
          <div style={{ font: "800 11px var(--font-mono, monospace)", letterSpacing: ".18em", color: gold, textTransform: "uppercase" }}>{f.label}</div>
          <div style={{ height: 1, background: "rgba(255,255,255,.14)", marginTop: 7 }}/>
        </div>
      );
      if (f.type === "info") return <p key={f.key} style={{ ...mut, fontSize: 13, margin: 0 }}>{f.label}</p>;
      const errMsg = errors[f.key];
      return (
        /* data-fieldkey is how the wizard finds the first bad answer to scroll
           to and focus. aria-invalid is the same fact for a screen reader,
           which otherwise gets a red border it cannot see and a message it is
           never told about. */
        <label key={f.key} data-fieldkey={f.key} aria-invalid={errMsg ? "true" : undefined} style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: gold }}> *</span>}{f.sensitive && " 🔒"}</span>
          {f.type === "longtext" ? (
        <textarea style={{ ...inputS, minHeight: 70, resize: "vertical" }} value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder || ""}/>
          ) : f.type === "choice" ? (() => {
        const parentField = f.optionsFrom ? fields.find(x => x.key === f.optionsFrom) : null;
        const parentLabel = (parentField && parentField.label) || f.optionsFrom;
        const waiting = !!f.optionsFrom && !form[f.optionsFrom];
        const opts = formFieldOptions(f, form);
        return (
          <>
            {/* Disabled, not merely empty — an enabled select that opens
            on nothing looks broken rather than sequenced. */}
            <select style={{ ...inputS, opacity: waiting ? 0.6 : 1 }} disabled={waiting}
          value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)}>
          <option value="">{waiting ? "Choose a " + String(parentLabel).toLowerCase() + " first…" : "Choose…"}</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {!waiting && f.optionsFrom && opts.length === 0 && (
          <span style={{ ...mut, display: "block", fontSize: 11.5, marginTop: 4 }}>
            No {String(f.label).toLowerCase()} options are listed under {form[f.optionsFrom]} yet.
          </span>
            )}
          </>
        );
          })() : f.type === "yesno" ? (
        <div style={{ display: "flex", gap: 8 }}>
          {["Yes", "No"].map(v => <button type="button" key={v} onClick={() => set(f.key, v)} style={{ flex: 1, padding: 11, borderRadius: 10, cursor: "pointer", fontWeight: 700, border: "1px solid " + (form[f.key] === v ? gold : "rgba(255,255,255,.18)"), background: form[f.key] === v ? "rgba(255,206,84,.16)" : "rgba(255,255,255,.06)", color: "#fff" }}>{v}</button>)}
        </div>
          ) : (
        <input style={inputS} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
          value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder || ""} inputMode={f.type === "phone" ? "tel" : undefined}/>
          )}
          {f.help && !errMsg && <span style={{ ...mut, display: "block", fontSize: 11.5, marginTop: 4 }}>{f.help}</span>}
          {errMsg && <span role="alert" style={{ display: "block", fontSize: 12, marginTop: 4, color: "#ff9a9a" }}>{errMsg}</span>}
        </label>
      );
        })}
  </>;
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
  const set = (k, v) => setForm(f => {
    const n = { ...f, [k]: v };
    /* Changing a faculty invalidates the course chosen under the old one.
       Leaving it would submit a course the new faculty does not offer — the
       server rejects that, so the desk would hit an error on a field that
       still looks answered. Clear it instead. */
    fields.forEach(d => { if (d.optionsFrom === k && n[d.key] && formFieldOptions(d, n).indexOf(n[d.key]) === -1) n[d.key] = ""; });
    try { localStorage.setItem(draftKey, JSON.stringify(n)); } catch (_) {}
    return n;
  });
  const visible = (f) => formFieldVisible(f, form);
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
    /* Same outbox as the public form. A field desk on a tethered hotspot is the
       case this exists for: the row is banked before the attempt, so a timeout
       costs the queue nothing, and the submissionId makes the re-send a replay
       rather than a second registration. `force` deliberately gets a NEW id —
       overriding a duplicate warning is a decision to create another record. */
    const sid = window.outbox ? (force ? "" : window.outbox.submissionId(draftKey)) : "";
    try {
      const payload = { gate: g, data: form, photoUrl, force: !!force,
                        lat: geo.lat, lng: geo.lng, submissionId: sid };
      const r = window.outbox && !force
        ? await window.outbox.send("gate.register", payload, { label: regDisplayName(form) })
        : await NGGApi.public.gate.register(g, form, photoUrl, !!force, { lat: geo.lat, lng: geo.lng, submissionId: sid });
      try { localStorage.removeItem(draftKey); } catch (_) {}
      if (window.outbox) window.outbox.resetSubmissionId(draftKey);
      setDone(r);
    } catch (e) {
      /* The refusal payload lives on e.data — api-client sets err.data to the
         whole body, while err.detail is only body.detail. Reading e.errors and
         e.detail.errors meant the per-field branch below never once fired: a
         validation refusal arrives as {ok:false, errors:{…}} with no `detail`
         and no `error`, so every one of them fell past these cases into the
         generic handler and the desk was told the server "refused this
         registration" with no code and nothing highlighted. */
      const d = e.data || {};
      const c = e.code || d.error;
      if (c === "duplicate_suspect" || d.existing) { setDupe(d.existing || {}); }
      else if (c === "photo_required") { setErrors({ _: "A headshot is required — take or upload a photo to register." }); setStep(1); }
      else if (c === "geo_unavailable") { setErrors({ _: "This desk needs your location to register. Allow location access and try again." }); setStep(0); }
      else if (c === "geo_out_of_fence") { const n = d.nearest || {}; setErrors({ _: "You're outside every registration centre's area" + (n.name ? " — nearest is " + n.name + ", about " + n.distanceM + "m away" : "") + ". Registration is only allowed on-site." }); setStep(0); }
      else if (d.errors) { setErrors(Object.assign({ _: "Some answers need fixing — see the highlighted fields." }, d.errors)); setStep(0); }
      /* Everything else. This used to say "check the connection" for ANY
         unrecognised failure, including ones where the connection was fine and
         the server had refused for a nameable reason — staff at a desk on full
         signal were told to check their signal, and the actual cause never
         reached anyone who could act on it.
         Two cases now, told apart by whether a response arrived at all. */
      else if (c === "gate_invalid") { setErrors({ _: "This desk link is no longer valid — it may have been revoked or used up. Ask an admin for a fresh gate link." }); }
      else if (c === "csrf_failed" || DESK_RELOCK.indexOf(c) !== -1) { setErrors({ _: "The desk session has expired. Reload the page and unlock the desk again — the draft is safe on this device." }); }
      else if (c === "in_flight") { setErrors({ _: "Still sending — give it a moment. It finishes on its own; don't re-send or you'll be waiting on two of them." }); }
      /* Queued by the outbox: banked on this device, and it will keep trying by
         itself. This replaces the advice that used to be given after a timeout —
         "check with an admin before re-registering, in case this one went
         through" — which was honest but unactionable at a busy desk. The desk
         can now move to the next child, because the submissionId guarantees the
         retry replays rather than registers twice. */
      else if (e.queued) {
        setErrors({ _: "Saved on this device — the connection dropped, so it will finish sending on its own. Carry on with the next child." });
      }
      /* status 0 is the client's marker for "no response arrived at all" —
         DNS, refused, TLS, or our own abort. It is falsy, and the code in that
         case is a truthy 'network'/'timeout', so the order here matters: test
         for it explicitly or a genuine outage gets reported as a refusal. */
      else if (e.status === 0 || c === "network" || c === "timeout") {
        setErrors({ _: "Couldn't reach the server. The registration is saved on this device and will send itself when the connection returns." });
      }
      else {
        // The server answered and refused. Say what it said; a code nobody can
        // read still beats a wrong explanation, and it is what gets reported.
        setErrors({ _: "The server refused this registration" + (c ? " (" + c + ")" : "") + ". The draft is safe on this device — tell an admin what this says." });
      }
    } finally { setBusy(false); }
  };

  if (done) return (
    <div style={{ ...card, padding: 22, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>📨</div>
      <h2 style={{ fontSize: 20, margin: "10px 0 6px" }}>Registered — parent notified</h2>
      <p style={{ ...mut, fontSize: 14, lineHeight: 1.55 }}>{regDisplayName(form)} is in as <b style={{ color: "#fff" }}>{done.studentId}</b>. The registration completes when the parent confirms{done.verificationSending && done.verificationSending.length ? " — the consent link is on its way by " + done.verificationSending.join(" + ") : ""}. Their ID is issued at that moment.</p>
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
        <RegFieldList fields={fields} form={form} set={set} errors={errors} visible={visible} inputS={inputS} gold={gold} mut={mut}/>
        })}
        {(() => {
          /* The form asks for First and Last now. This gate used to require
             `fullName`, which the split left permanently empty — the Continue
             button would never enable and nobody could register at all. Read
             whichever the live form actually asks for. */
          const named = (regDisplayName(form) || "").trim();
          const ready = named && geoReady;
          return <button onClick={() => setStep(1)} disabled={!ready} style={{ padding: 14, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, fontSize: 15, cursor: "pointer", opacity: ready ? 1 : .5 }}>Continue → Photo</button>; })()}
        {geoOn && !geoReady && <p style={{ fontSize: 11.5, textAlign: "center", margin: 0, color: "#ffb0b0" }}>You must be on-site at a registration centre to continue.</p>}
        <p style={{ ...mut, fontSize: 11.5, textAlign: "center", margin: 0 }}>Every field autosaves on this device — nothing is lost if you're interrupted.</p>
      </div>
    )}

    {step === 1 && <GatePhoto photoUrl={photoUrl} setPhotoUrl={setPhotoUrl} onBack={() => setStep(0)} onNext={() => setStep(2)} card={card} gold={gold} goldInk={goldInk} mut={mut}/>}

    {step === 2 && (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...card, padding: 16, display: "flex", gap: 13, alignItems: "center" }}>
          {photoUrl ? <img src={photoUrl} alt="" style={{ width: 54, height: 54, borderRadius: 12, objectFit: "cover" }}/> : <div style={{ width: 54, height: 54, borderRadius: 12, background: "rgba(255,255,255,.1)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800 }}>{(regDisplayName(form) || "?").charAt(0)}</div>}
          <div><div style={{ fontWeight: 800, fontSize: 16 }}>{regDisplayName(form)}</div><div style={{ ...mut, fontSize: 13 }}>{form.course || ""}{form.age ? " · " + form.age : ""}</div></div>
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
  // The stream lives in STATE, not just a ref, because the <video> it has to be
  // attached to is rendered conditionally. Assigning srcObject straight out of
  // the getUserMedia callback ran BEFORE camState flipped to 'live', so the
  // element was not mounted yet, videoRef.current was null, the assignment was
  // skipped — and the video then mounted with nothing in it. A camera that was
  // permanently blank. As state it drives an effect that runs after the render
  // that mounts the element, so the ordering cannot go wrong.
  const [stream, setStream] = React.useState(null);
  // Which camera. Registration is usually a desk operator photographing the
  // child across the table, which is the REAR lens on a phone — but the front
  // one is right for a self-serve kiosk, and some tablets only have one.
  const [facing, setFacing] = React.useState("user");
  const [multiCam, setMultiCam] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [uErr, setUErr] = React.useState("");

  const stopStream = React.useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setStream(null);
  }, []);

  // The camera only runs while the full-screen overlay is open. Opening it asks
  // for the front camera; closing it (or unmounting the step) releases the
  // hardware so the light doesn't stay on behind the rest of the form.
  React.useEffect(() => {
    if (!camOpen) { stopStream(); return; }
    let cancelled = false;
    setCamState("starting"); setUErr("");
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { setCamState("denied"); return; }
    // Release the previous facing before asking for the next: a phone will not
    // hand out both lenses at once, so re-requesting without stopping fails.
    stopStream();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1350 } }, audio: false })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        setStream(s);
        setCamState("live");
        // Only offer the flip when there is something to flip to. Asking a
        // single-camera tablet to switch just kills the preview.
        if (navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices()
            .then(ds => setMultiCam(ds.filter(d => d.kind === "videoinput").length > 1))
            .catch(() => {});
        }
      })
      .catch(() => setCamState("denied"));
    return () => { cancelled = true; };
  }, [camOpen, facing, stopStream]);

  // Release the camera when the step unmounts.
  React.useEffect(() => stopStream, [stopStream]);

  const openCam = () => { setUErr(""); setCamOpen(true); };
  const closeCam = () => { setCamOpen(false); setCamState("idle"); };

  const uploadBlob = async (blob) => {
    setBusy(true); setUErr("");
    try {
      /* Keep the REAL type. This used to relabel every blob as image/jpeg,
         which on a picked HEIC produced a file claiming to be a JPEG while
         holding HEIC bytes — it sailed past the format check and landed as an
         image nothing could open, printed blank on the card. The converter
         needs to see what it actually is in order to convert it. */
      const type = (blob && blob.type) || "image/jpeg";
      const file = blob instanceof File ? blob : new File([blob], "headshot.jpg", { type });
      /* Uploads when a cloud is configured, carries the image in the submission
         when one is not. It used to try the unsigned path, then the signed one,
         then give up with "photo uploads aren't set up on this server yet" —
         which on a deployment with no Cloudinary was every registration, so no
         child got a photograph and the review desk had nothing to look at.
         Cloudinary is opt-in; a desk that cannot take a photo without it is not. */
      const up = await NGGApi.uploadOrInline(file, "headshot");
      // Face-centred crop + auto colour/lighting via Cloudinary URL transforms —
      // a fast, free client preview; a no-op on an inline image, and the server
      // pipeline still does the professional edit when there is a cloud to do it.
      setPhotoUrl(cldEnhance(up.url));
      closeCam();
    } catch (e) {
      // Surface the real reason — a vague message can't be diagnosed or fixed.
      const msg = String((e && (e.message || e.code)) || "");
      if ((e && e.code) === "photo_format")
        setUErr(photoFormatHelp(e));
      else if (/photo_too_large/.test(msg))
        setUErr("That photo is too large to send. Take it again — the camera's 'medium' size setting works best.");
      else if (/network|failed to fetch|timeout/i.test(msg))
        setUErr("Couldn't reach the photo service — check the connection and try again.");
      else
        setUErr("Couldn't use that photo (" + (msg || "unknown error") + "). Try again, or skip and add it later.");
    } finally { setBusy(false); }
  };
  const capture = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = 720; c.height = 900;
    const ctx = c.getContext("2d");
    const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
    const dx = (c.width - v.videoWidth * scale) / 2, dy = (c.height - v.videoHeight * scale) / 2;
    // Save what the operator SAW. The front preview is mirrored, so the frame
    // has to be mirrored to match it; the rear preview is not, so it must not
    // be — otherwise every rear-camera headshot comes out flipped.
    if (facing !== "environment") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, dx, dy, v.videoWidth * scale, v.videoHeight * scale);
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
      {uErr && <div role="alert" style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,206,84,.12)", border: "1px solid rgba(255,206,84,.4)", fontSize: 13 }}>{uErr}</div>}
      {/* No `capture` attribute: it forces the camera on mobile and removes
          "choose an existing photo" entirely, so the overlay's device-photo
          button could never actually upload one. The camera has its own
          button; this is the way round it. */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files && e.target.files[0]; if (f) uploadBlob(f); e.target.value = ""; }}/>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>←</button>
        {photoUrl
          ? <button onClick={() => setPhotoUrl("")} style={{ flex: 1, padding: 13, borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Retake</button>
          : <>
              <button onClick={openCam} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: gold, color: goldInk, fontWeight: 800, cursor: "pointer" }}>{busy ? "Uploading…" : "Open camera"}</button>
              {/* On a device with no camera, or one where it is blocked, the
                  overlay is the only place an upload was offered — so a
                  blocked camera meant no photo at all. */}
              <button onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} style={{ padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Upload</button>
            </>}
        <button onClick={onNext} disabled={!photoUrl} title={photoUrl ? "" : "A headshot is required"} style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: photoUrl ? gold : "rgba(255,255,255,.14)", color: photoUrl ? goldInk : "rgba(255,255,255,.5)", fontWeight: 800, cursor: photoUrl ? "pointer" : "not-allowed" }}>Use photo →</button>
      </div>
      {camOpen && (
        <CameraOverlay
          videoRef={videoRef} stream={stream} camState={camState} busy={busy}
          onCapture={capture} onClose={closeCam} gold={gold} goldInk={goldInk}
          onPickFile={() => fileRef.current && fileRef.current.click()}
          facing={facing} canFlip={multiCam}
          onFlip={() => { setCamState("starting"); setFacing(f => (f === "user" ? "environment" : "user")); }}
        />
      )}
    </div>
  );
}

/* Full-screen guided camera. A fixed overlay above the whole app: the live
 * front-camera fills the screen, a dimming scrim with a transparent face oval
 * shows exactly where to line up, and a shutter sits at the bottom. Falls back
 * to a device-photo picker when the camera is blocked or unavailable. */
function CameraOverlay({ videoRef, stream, camState, busy, onCapture, onClose, onPickFile, gold, goldInk, facing, canFlip, onFlip }) {
  // Attach the stream here, after the render that mounted the element, keyed on
  // the stream itself. The element is also mounted unconditionally (hidden
  // until live) so the ref is never null when this runs.
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== (stream || null)) v.srcObject = stream || null;
    if (stream) v.play().catch(() => {});
  }, [stream, videoRef]);
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
        {/* Always mounted, hidden until live. The effect above is what actually
            fixes the blank camera; this removes the remaining dependency on
            setStream and setCamState landing in the same commit. If they ever
            didn't batch, the effect would run with the element unmounted and
            the stream would be orphaned again — which is the bug this was. */}
        {/* Mirror the FRONT camera only: a selfie reads naturally mirrored,
            a rear-facing shot of someone else reads backwards. */}
        <video ref={videoRef} muted playsInline autoPlay
          style={{ width: "100%", height: "100%", objectFit: "cover",
                   transform: facing === "environment" ? "none" : "scaleX(-1)",
                   display: camState === "live" ? "block" : "none" }}/>
        {camState !== "live" && (
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
        {canFlip
          ? <button onClick={onFlip} disabled={busy} style={{ ...iconBtn, fontSize: 18 }} aria-label={"Switch to the " + (facing === "user" ? "back" : "front") + " camera"} title="Flip camera">🔄</button>
          : <div style={{ width: 44 }}/>}
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
      /* Hosted when there is a cloud, inline when there is not. reshoot_submit
         accepts either — a guardian who did what the email asked must not be
         told their photograph is bad because nobody set three config keys. */
      const up = await NGGApi.uploadOrInline(file, "headshot");
      setPhotoUrl(cldEnhance(up.url));
    } catch (e) {
      const m = String((e && (e.message || e.code)) || "");
      setUErr(/network|failed to fetch/i.test(m) ? "Couldn't reach the photo service — check the connection." : "Upload failed — please try another photo.");
    } finally { setUploading(false); }
  };
  const submit = async () => {
    if (!photoUrl || busy) return;
    setBusy(true); setUErr("");
    try { await sendIntake("reshoot.submit", { t, photoUrl }, "ngg_reshoot_" + t); setState("done"); }
    catch (e) {
      setUErr(e.queued
        ? "Saved on this device — the connection dropped, so we'll finish sending the photo automatically."
        : e.code === "bad_photo" ? "That photo didn't come through — try again." : "Couldn't send the photo — try again.");
    }
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
    {uErr && <div role="alert" style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,206,84,.12)", border: "1px solid rgba(255,206,84,.4)", fontSize: 13, marginBottom: 10 }}>{uErr}</div>}
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
/* ── Scan feedback ──────────────────────────────────────────────────────────
 * A check-in desk is used at arm's length, in a noisy hall, by someone also
 * talking to a child. The old confirmation was an eleven-pixel row prepended
 * to a list of identical-looking rows — technically present, effectively
 * invisible, and indistinguishable from the scan before it. Operators could
 * not tell a successful check-in from a repeat or a refusal without reading.
 *
 * So the outcome is announced three ways at once, because any one of them can
 * be missed: a panel that takes over the top of the screen, a distinct sound,
 * and a distinct vibration. Colour never carries meaning alone — every state
 * has its own glyph and its own word.
 */
const SCAN_KINDS = {
  in:      { word: "Checked in",   glyph: "✓", tone: [880, 1320], buzz: [60],         bg: "rgba(48,160,90,.20)",  edge: "#4ad07f", fg: "#b9f5d0" },
  already: { word: "Already in",   glyph: "↻", tone: [660, 660],  buzz: [40, 70, 40], bg: "rgba(245,176,38,.18)", edge: "#f5b026", fg: "#ffd98a" },
  queued:  { word: "Saved offline", glyph: "☁", tone: [520],      buzz: [30],         bg: "rgba(120,160,255,.16)", edge: "#7da2ff", fg: "#c7d8ff" },
  no:      { word: "Not accepted", glyph: "✕", tone: [220, 180],  buzz: [180],        bg: "rgba(230,70,70,.20)",  edge: "#ff6b6b", fg: "#ffc4c4" },
};

/* WebAudio rather than an audio file: no asset to ship, no decode latency, and
 * the tone can differ per outcome. iOS will not start a context without a user
 * gesture, so it is created lazily — by the time anything is scanned the
 * operator has already tapped to unlock the desk. */
let _scanAudio = null;
function scanBeep(tones) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_scanAudio) _scanAudio = new AC();
    if (_scanAudio.state === "suspended") _scanAudio.resume();
    let t = _scanAudio.currentTime;
    tones.forEach((hz, i) => {
      const osc = _scanAudio.createOscillator(), gain = _scanAudio.createGain();
      osc.type = "sine"; osc.frequency.value = hz;
      // A short envelope — a square-edged tone clicks, and a click at volume is
      // what makes people turn the sound off.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(gain); gain.connect(_scanAudio.destination);
      osc.start(t); osc.stop(t + 0.14);
      t += 0.11 + (i === 0 ? 0.02 : 0);
    });
  } catch (_) { /* audio is a bonus; never let it break a check-in */ }
}

function scanFeedback(kind, muted) {
  const k = SCAN_KINDS[kind] || SCAN_KINDS.in;
  if (!muted) scanBeep(k.tone);
  // Vibration is separate from mute on purpose: it is silent, and it is the
  // one channel that still works with the phone face-down on a desk.
  if (navigator.vibrate) { try { navigator.vibrate(k.buzz); } catch (_) {} }
}

/* The panel itself. Big enough to read without leaning in, and it shows the
 * PHOTO — an operator glancing between the screen and the child is the only
 * check that the card belongs to the person holding it. */
function ScanResult({ result, onDone }) {
  React.useEffect(() => {
    if (!result) return;
    // Long enough to read a name and compare a face; short enough not to block
    // the queue behind them.
    const t = setTimeout(onDone, result.kind === "no" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [result, onDone]);
  if (!result) return null;
  const k = SCAN_KINDS[result.kind] || SCAN_KINDS.in;
  return (
    <div role="status" aria-live="assertive"
      style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 18px",
        borderRadius: 16, background: k.bg, border: "2px solid " + k.edge, minHeight: 96 }}>
      {result.photo
        ? <img src={result.photo} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", flex: "none", border: "2px solid " + k.edge }}/>
        : <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "rgba(0,0,0,.22)", fontSize: 34, color: k.edge, fontWeight: 800 }}>{k.glyph}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ fontSize: 20, color: k.edge, fontWeight: 900 }}>{k.glyph}</span>
          <span style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 800, color: k.fg, fontFamily: "var(--font-mono, monospace)" }}>
            {result.word || k.word}
          </span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.name}</div>
        {result.sub && <div style={{ fontSize: 13, color: "rgba(230,238,255,.75)", marginTop: 2 }}>{result.sub}</div>}
      </div>
    </div>
  );
}

function QRScanner({ onToken, gold }) {
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const rafRef = React.useRef(0);
  const last = React.useRef({ tok: "", at: 0 });
  const [state, setState] = React.useState("starting"); // starting|live|denied|nolib
  const [hit, setHit] = React.useState(0); // brief flash on a successful read
  // Cards are usually presented to the REAR lens, but a laptop at a desk only
  // has a front one and a tablet may be turned either way.
  const [facing, setFacing] = React.useState("environment");
  const [multiCam, setMultiCam] = React.useState(false);

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
      ? navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false })
          .then(stream => {
            if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.setAttribute("playsinline", ""); videoRef.current.muted = true; videoRef.current.play().catch(() => {}); }
            setState("live"); rafRef.current = requestAnimationFrame(tick);
            if (navigator.mediaDevices.enumerateDevices) {
              navigator.mediaDevices.enumerateDevices()
                .then(ds => setMultiCam(ds.filter(d => d.kind === "videoinput").length > 1))
                .catch(() => {});
            }
          })
          .catch(() => setState("denied"))
      : setState("denied");
    // Re-runs on `facing`; the cleanup stops the old stream first, because a
    // phone will not hand out both lenses at once.
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } };
  }, [facing]);

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
      {multiCam && (
        <button type="button" onClick={() => { setState("starting"); setFacing(f => (f === "environment" ? "user" : "environment")); }}
          aria-label={"Switch to the " + (facing === "environment" ? "front" : "back") + " camera"} title="Flip camera"
          style={{ position: "absolute", top: 10, right: 10, width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(255,255,255,.35)", background: "rgba(0,0,0,.4)", color: "#fff", fontSize: 17, cursor: "pointer", lineHeight: 1 }}>🔄</button>
      )}
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
  // The big outcome panel + whether the desk is allowed to make noise.
  const [scan, setScan] = React.useState(null);
  const [muted, setMuted] = React.useState(() => { try { return localStorage.getItem("ngg.gate.mute") === "1"; } catch (_) { return false; } });
  const mutedRef = React.useRef(muted);
  React.useEffect(() => { mutedRef.current = muted; try { localStorage.setItem("ngg.gate.mute", muted ? "1" : "0"); } catch (_) {} }, [muted]);
  // Announce and show in one place, so no outcome can ever get one without the
  // other — a silent panel or a beep with nothing on screen is how an operator
  // ends up guessing.
  const announce = React.useCallback((kind, r) => {
    scanFeedback(kind, mutedRef.current);
    setScan({ kind, ...r });
  }, []);
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
          const r = await NGGApi.public.gate.checkin(g, item.token, item.scannedAt);
          dequeue(item.token);
          const st = r.student || {};
          setRecent(list => [{ name: st.fullName || item.token, at: fmtTime(new Date()), already: !!r.already, synced: true }, ...list].slice(0, 12));
        } catch (e) {
          if (isNetErr(e)) break;                       // still offline — stop, keep the rest
          // The server rejected a banked scan (e.g. unassigned card). Drop it, but
          // never silently: tell the operator and flag it so it can be re-scanned.
          dequeue(item.token);
          setErr("A saved scan couldn't be synced (" + (e.code === "qr_unassigned" ? "code not assigned" : e.code === "student_not_found" ? "no member for that code" : e.code === "policy_suspended" ? "that person is suspended" : e.code === "policy_evicted" ? "that person has been evicted" : e.code === "id_expired" ? "that ID has expired" : (e.code || "rejected")) + "). " + (/^policy_/.test(e.code || "") ? "They are NOT checked in — refer them to the coordinator." : "Please re-scan that card."));
          setRecent(list => [{ name: item.token, at: fmtTime(new Date()), failed: true }, ...list].slice(0, 12));
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
      announce(r.already ? "already" : "in", {
        name: st.fullName || token,
        photo: st.photoUrl || "",
        sub: [st.centre, st.track || st.role, r.status === "late" ? "Late by " + (r.lateMinutes || 0) + " min" : ""]
          .filter(Boolean).join(" · "),
        word: r.already ? "Already in today" : (isVol ? "Checked in · volunteer" : "Checked in"),
      });
      setRecent(list => [{
        name: st.fullName,
        at: fmtTime(new Date()),
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
        const q = loadQ(); if (!q.some(x => x.token === token)) { q.push({ token, at: Date.now(), scannedAt: new Date().toISOString() }); saveQ(q); }
        announce("queued", { name: token, sub: "No signal — this scan will sync automatically." });
        setRecent(list => [{ name: token, at: fmtTime(new Date()), queued: true }, ...list].slice(0, 12));
        setCode("");
      } else {
        const c = e2.code || e2.message;
        /* A refusal is the outcome an operator MUST not miss: the person in
           front of them is not checked in, and some of these mean they must not
           be let in at all. It gets the loudest treatment and stays up longest. */
        const why = c === "qr_unassigned" ? "That card isn't assigned to anyone yet."
          : c === "student_not_found" ? "No student or volunteer found for that code."
          : c === "id_expired" ? "That ID has expired — send them to the coordinator."
          : c === "policy_suspended" ? "Suspended. Do NOT admit — refer to the coordinator."
          : c === "policy_evicted" ? "Association terminated. Do NOT admit."
          : (e2.message || "Couldn't check in — try again.");
        announce("no", { name: /^policy_/.test(c) ? ((e2.data && e2.data.student && e2.data.student.fullName) || "Not accepted") : "Not accepted", sub: why });
        setErr(why);
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
      {dutyMsg && <div role="alert" style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(111,220,157,.12)", border: "1px solid rgba(111,220,157,.35)", fontSize: 13 }}>{dutyMsg}</div>}
      {/* The outcome, before anything else on the screen. */}
      <ScanResult result={scan} onDone={() => setScan(null)}/>
      {/* QR-first: the camera scans continuously; typing is the fallback. */}
      <QRScanner onToken={mark} gold={gold}/>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" onClick={() => setMuted(m => !m)} aria-pressed={muted}
          style={{ background: "none", border: "1px solid rgba(255,255,255,.22)", color: "rgba(230,238,255,.8)",
            borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {muted ? "🔇 Scan sound off" : "🔊 Scan sound on"}
        </button>
      </div>
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
   first name / navy surname in Inter 800 · track · QR of the check-in
   token · centre-coloured bar) + back (Ìlú Èkó watermark in Georgia · LCASP
   year · program contacts · printed ID). Admin-managed centres drive the
   bar colour and the CODE-YY-serial ID. Print = true 54×92mm per card.
   ============================================================================ */
const CARD_CRIMSON = "#E4155F", CARD_NAVY = "#1B2B6B";
// The card artwork is laid out in a 590-wide design grid. Its height is the
// default 54×89 mm card at that width (590·89/54 ≈ 972), so the default prints
// with NO scaling at all (vf = 1). A non-default admin proportion scales the
// whole card vertically from this base — bounded and only when they deviate.
const CARD_DESIGN_H = 972;
/* Sentinel for "the records that have no centre". A real centre could never
   collide with it — centre names come from the admin list and are trimmed
   non-empty — and it keeps the filter a single value rather than a value plus
   a boolean that can disagree with it. */
const NO_CENTRE = "\u0000none";

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

/* ── Centre colour, made context-aware ───────────────────────────────────────
 * A centre's colour is chosen by an admin in a colour picker, so it can be
 * anything: NGG green, a deep maroon, or a pale yellow. Everything that sat on
 * top of it was hard-coded to white text with a drop shadow, which is fine for
 * two of those three and illegible for the third — and the card is PRINTED, so
 * nobody finds out until a box of two hundred arrives with an unreadable band.
 *
 * These three helpers make the card read its own colours and adapt.
 */
function cardRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
/** Ink that stays legible on `hex`, plus the shadow and hairline that go with it.
 *
 *  The rule itself lives in components.jsx as `inkOn`, because the same
 *  admin-picked colours turn up on the screen — centre rings, channel chips,
 *  ranked centre badges — and a printed card and a roster row that disagree about
 *  when a colour is "pale" is a bug nobody would think to look for. This name
 *  stays because the card is where the threshold was reasoned about. */
function cardInk(hex) {
  return inkOn(hex);
}
/* The caption ink — "VOLUNTEER ID", "VALID TO" — the small upper-case labels
   that say what the number under them means.

   It was #aeb4c0, which measures 2.08:1 on the white panel. That is not a
   subtle miss: it is roughly a quarter of the contrast the label needs, on the
   one piece of text that makes an ID number legible as an ID number, printed
   on a card a steward reads at a gate under a fluorescent tube. It survived
   this long because preflight had no way to measure it and nobody photographs
   a caption. #687083 is the same cool neutral, still visibly a caption against
   the #1B2B6B name and the #5b6478 body, and 4.96:1.

   Named rather than repeated: the same three characters appear in the two
   system templates in card-template.jsx, and a caption that is one grey on the
   drawn card and another on the printed one is its own bug. */
const CARD_CAPTION_INK = "#687083";
/** Are two card colours close enough to merge into one shape? Redmean distance
 *  — cheap, and markedly better than plain RGB at matching what an eye does.
 *
 *  This no longer has anything to do with the card's own geometry: the centre
 *  colour and the tier colour are never adjacent on it (see VolunteerCardFront),
 *  so there is nothing on the artwork for them to merge INTO. What remains is
 *  the failure the colour device exists to prevent — two CENTRES, or two TIERS,
 *  that look alike — which is a picker-time warning, not a render-time one.
 *
 *  The threshold is 200, not the 120 this shipped with. 120 is roughly "the
 *  same colour"; the pair that actually caused the problem — #D64545 centre
 *  inside a #8A1538 tier — measures 158 and sailed through it. Two colours a
 *  reviewer describes as "both red" do not have to be near-identical to merge
 *  at arm's length under a fluorescent tube, which is the condition the card is
 *  read in. Over-applying a hairline costs nothing; under-applying it costs a
 *  print run. */
function cardColorsClash(a, b) {
  const x = cardRgb(a), y = cardRgb(b);
  if (!x || !y) return false;
  const rm = (x[0] + y[0]) / 2, dr = x[0] - y[0], dg = x[1] - y[1], db = x[2] - y[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) < 200;
}
/**
 * Which existing card colours a proposed one would collide with.
 *
 * One direction matters now: a centre colour close to ANOTHER CENTRE'S (or a
 * tier close to another tier) makes two of them indistinguishable, which defeats
 * the whole device. The cross-check against the OTHER list is gone with the
 * geometry that motivated it — a centre colour and a tier colour no longer touch
 * anywhere on the card, so "these two merge into one shape" is no longer a thing
 * that can happen, and warning about it would be telling an admin to avoid a
 * pairing that renders perfectly well.
 *
 * `own` is the list the new colour joins. Anything already carrying this exact
 * colour is skipped: an admin editing Egbeda should not be told Egbeda is too
 * close to Egbeda.
 */
function colourNeighbours(colour, own) {
  const hit = [];
  const norm = String(colour || "").trim().toLowerCase();
  (own || []).forEach(u => {
    if (String(u.color || "").trim().toLowerCase() === norm) return;
    if (cardColorsClash(colour, u.color)) hit.push({ name: u.name, sameList: true });
  });
  return hit.slice(0, 4);
}

/* The centre a card should SHOW, which is not always the centre it has.
 *
 * A roving mentor, an ops volunteer or a programme-wide coordinator genuinely
 * has no single site. Dropping the band for them left two different card
 * geometries in one print run — and a card with a gap where every other card
 * has a colour reads as a misprint, not as "works everywhere". So they get the
 * programme's own mark instead, which is the true answer. */
const CARD_ALL_CENTRES = { name: "All centres", code: "NGG", color: "#1b2b6b", every: true };
function cardCentreOf(card) {
  const c = card && card.centre;
  if (c && (c.name || c.code)) return c;
  return card && card.tier ? CARD_ALL_CENTRES : null;   // volunteers only; a student always has one
}
/** Letter-spacing and size that keep a centre name on one line. "Egbeda" and
 *  "Ikotun-Egbe Community Hall" are both legal names, and the second used to
 *  run off the end of the band under `whiteSpace: nowrap`.
 *
 *  Sized from the space actually available, not from a magic character count.
 *  The first version shrank on `14 / n` with a 0.62 floor, which was fitted to
 *  one band at one size — so when the band grew, the longest name on the sheet
 *  came out as the SMALLEST text on it, while a third of the band sat empty
 *  either side. Backwards: length is a reason to use the room, not to give it
 *  up. Inter at weight 800 in caps advances about 0.62em per character, so the
 *  width a name needs is n·(0.62·size + tracking) and the size that fits is
 *  that solved for size — never above `base`, and floored so a pathological
 *  name degrades rather than disappears. */
function centreBandFont(name, base, px, availUnits = 470) {
  const n = ((name || "").trim().length) || 1;
  const track = 2.2;
  const fit = (availUnits - n * track) / (n * 0.62);
  const size = Math.max(base * 0.55, Math.min(base, fit));
  // Tracking tightens with the type so a shrunk name does not read as gappy.
  return { fontSize: px(size), letterSpacing: px(track * (size / base)) };
}
/** The same solve, in design units, for a string with FIXED tracking.
 *
 *  Inter advances about 0.62 em per glyph at the weights this card uses, so a
 *  line of n characters at `size` with `track` units between them needs
 *  n·(0.62·size + track) units of width. Solved for size and capped at `base`,
 *  that is the largest type that still fits — the caller decides the floor,
 *  because what should happen below it differs per field. */
function cardFit(text, base, avail, track = 0) {
  const n = ((text || "").trim().length) || 1;
  return Math.min(base, (avail - n * track) / (n * 0.62));
}
/** The foot band, whose tracking is PROPORTIONAL to its own size (0.2 em), so
 *  the per-glyph advance is a constant 0.82 em and the solve collapses to
 *  `avail / (n · 0.82)`.
 *
 *  The band spans the full card width rather than sitting inside the content
 *  gutter, so it has 520 units to work with. It still has a floor, and the floor
 *  is the point: with a fixed 5-unit track and a `base · 0.5` floor,
 *  "IEC · IKOTUN-EGBE COMMUNITY HALL" solved to 13 units — about 1.1 mm, under
 *  4 pt — which made the longest centre name on the sheet the smallest type on
 *  the card. Below the floor the answer is not smaller type, it is a second
 *  line, so `split` says which one the caller is getting. */
function footBandFit(text, avail = 520, base = 25, floor = 22) {
  const n = ((text || "").trim().length) || 1;
  const raw = avail / (n * 0.82);
  const size = Math.max(floor, Math.min(base, raw));
  return { size, track: size * 0.2, split: raw < floor };
}

/* Which centre a card belongs to, readable across a room.
 *
 * The student card already carried the centre colour as a bar along the
 * bottom, which is invisible the moment the card is in a lanyard sleeve or
 * face-up on a table with the bottom edge tucked under. The volunteer card
 * carried no centre at all — it is coloured by TIER, which says what somebody
 * does and nothing about where they belong, so at a site with forty
 * volunteers nobody could tell who was theirs.
 *
 * The ring goes round the photo, which is the one part of a card that is
 * always visible and always looked at. The CODE is set into it because colour
 * alone is not a label: roughly one man in twelve cannot read it, print
 * colour drifts between batches, and a photocopy has none of it at all.
 */
function CardCentreRing({ centre, size, px, radius, children }) {
  const c = centre || {};
  const tint = c.color || "#76B043";
  // Ink chosen from the colour rather than assumed white — see cardInk. A pale
  // centre colour used to print a white code on a near-white chip.
  const ink = cardInk(tint);
  const band = Math.max(2, px(14));           // scales with the card
  const chipH = Math.max(7, px(38));
  return (
    <div style={{ position: "relative", width: px(size), height: px(size), flex: "none" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, background: tint,
                    boxShadow: `0 ${px(14)}px ${px(34)}px rgba(27,43,107,.16)` }}/>
      <div style={{ position: "absolute", inset: band, borderRadius: radius, overflow: "hidden",
                    background: "linear-gradient(180deg,#dff0fb 55%,#8fbb3f 90%)" }}>
        {children}
      </div>
      {/* On the ring at 45°, not hanging below it: underneath is where the
          name divider and the child's first name live, and a chip there
          collided with both. Bottom-right also matches where the volunteer
          card puts its code, so the two cards are read the same way. */}
      {c.code ? (
        <div style={{ position: "absolute", left: "85.4%", top: "85.4%", transform: "translate(-50%, -50%)",
                      height: chipH, minWidth: chipH * 2, padding: `0 ${px(13)}px`, borderRadius: chipH,
                      background: tint, border: `${Math.max(1, px(5))}px solid #fff`,
                      display: "grid", placeItems: "center", boxSizing: "border-box",
                      /* A pale chip against the white border and the white card
                         disappears into both, so a light colour gets its own
                         hairline. Nothing changes for a dark one. */
                      outline: ink.light ? `${Math.max(1, px(2))}px solid ${ink.hairline}` : "none",
                      outlineOffset: `-${Math.max(1, px(5)) + Math.max(1, px(2))}px`,
                      boxShadow: `0 ${px(4)}px ${px(10)}px rgba(0,0,0,.18)` }}>
          <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 800, fontSize: chipH * 0.6,
                         letterSpacing: px(1), color: ink.ink, lineHeight: 1, whiteSpace: "nowrap",
                         textShadow: ink.shadow }}>{c.code}</span>
        </div>
      ) : null}
    </div>
  );
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
      <CardCentreRing centre={centre} size={photoD} px={px} radius="50%">
        {card.photoUrl && <img src={cardFacePhoto(card.photoUrl, 900, 900)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>}
      </CardCentreRing>
      <div style={{ width: px(30), height: px(6), borderRadius: px(3), background: "#8FA3C8", margin: px(15) + "px 0 " + px(9) + "px", flex: "none" }}/>
      <div style={{ textAlign: "center", fontFamily: '"Inter", sans-serif', fontWeight: 800, fontSize: px(nameFontPx(card.firstName, 42, 12)), lineHeight: 1.04, color: CARD_CRIMSON, textTransform: "uppercase", letterSpacing: px(-1), whiteSpace: "nowrap", flex: "none", maxWidth: "100%" }}>{card.firstName}</div>
      <div style={{ textAlign: "center", fontFamily: '"Inter", sans-serif', fontWeight: 800, fontSize: px(nameFontPx(card.surname, 46, 12)), lineHeight: 1.02, color: CARD_NAVY, textTransform: "uppercase", letterSpacing: px(-1), padding:`0 ${px(16)}px`, whiteSpace: "nowrap" }}>{card.surname || " "}</div>
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
      {(() => {
        // Same three adaptations as the volunteer band: ink from the colour, and
        // a name that shrinks rather than running off the end of the card.
        const ink = cardInk(centre.color || "#76B043");
        const fit = centreBandFont(centre.name, 15, px, 540);
        return (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: px(28), background: centre.color || "#76B043",
                        display: "grid", placeItems: "center", overflow: "hidden" }}>
            {centre.name ? <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 800, fontSize: fit.fontSize,
              letterSpacing: fit.letterSpacing, color: ink.ink, textTransform: "uppercase", lineHeight: 1,
              whiteSpace: "nowrap", textShadow: ink.shadow }}>{centre.name}</span> : null}
          </div>
        );
      })()}
    </div>
  );
}

/* Volunteer front, per the build spec.
 *
 * The card carries two admin-picked colours and the whole design is arranged so
 * they never touch:
 *
 *   centre.color — the card background, which IS the frame on all four edges,
 *                  and the foot band, which is the same continuous shape.
 *   tier.color   — the 92-unit disc at the top and the role pill. Both sit fully
 *                  inside the white panel.
 *
 * That is the entire mechanism. There is no contrast test between them, no
 * conditional keyline and no fallback path, because there is no seam for a
 * keyline to defend: a centre colour identical to the tier colour renders
 * correctly. The only adaptive rule left is cardInk(), which picks the ink for
 * type sitting ON either colour.
 *
 * Geometry is in design units on a 590-wide grid (H = 920 at 50×78 mm). Three
 * `flex: 1 1 0` spacers absorb any other proportion, so nothing is ever
 * stretched. */
function VolunteerCardFront({ card, S, H = CARD_DESIGN_H }) {
  const px = (n) => n * S;
  const tier = card.tier || {};                 // same hazard as centre, above
  const tTint = tier.color || "#00225F";
  const tInk = cardInk(tTint);
  /* The centre this card should show — a real one, or the programme mark for
     somebody who genuinely works across all of them. Never nothing: the centre
     colour is the card's background here, so a missing centre would mean a
     second card geometry in the same print run, which reads as a misprint rather
     than as "works everywhere" (see cardCentreOf). */
  const centre = cardCentreOf(card) || CARD_ALL_CENTRES;
  const cTint = centre.color || "#76B043";
  const cInk = cardInk(cTint);
  /* Role, qualified by faculty when there is one. "INSTRUCTOR" alone identifies
     nobody at a site where every third person is one. */
  const role = [String(card.role || tier.name || "").trim(), String(card.faculty || "").trim()]
    .filter(Boolean).join(" · ").toUpperCase();
  /* The four variable-length strings, each sized from the room it actually has.
     The surname floors at half its base and stays on one line — a surname long
     enough to hit that floor is a data problem worth seeing, not one worth
     hiding. The first name takes the same floor for the opposite reason: it has
     no floor in the spec, and unfloored it would solve to a couple of units and
     vanish, which hides the same problem instead of showing it. */
  const fnSize = Math.max(33 * 0.5, cardFit(card.firstName, 33, 420));
  const snSize = Math.max(50 * 0.5, cardFit(card.surname, 50, 424));
  const roleSize = Math.max(18 * 0.5, cardFit(role, 18, 360, 3.2));
  /* The photograph is 404 × 318 units on the design grid, and the three spacers
     absorb a TALLER card. A shorter one they cannot absorb — the default admin
     proportion is 54 × 75 mm, which is H = 819, ninety units short of the grid
     this was drawn on — so the frame scales down on its own aspect rather than
     letting the column overflow the panel. Everything else on the card is type
     at a legibility floor and must not shrink. */
  const colH = H - 30 - 112 - 96 - 44;         // panel, less the column's padding
  const fixed = fnSize * 1.1 + snSize * 1.04 + 2 + 46 + 20 + 98 + 3 * 14;
  const phH = Math.round(Math.max(150, Math.min(318, colH - fixed)));
  const phW = Math.round(phH * 404 / 318);
  const field = (label, value, big) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: px(5) }}>
      <span style={{ fontSize: px(11), fontWeight: 600, letterSpacing: px(2.4), textTransform: "uppercase", color: CARD_CAPTION_INK, lineHeight: 1 }}>{label}</span>
      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontVariantNumeric: "tabular-nums",
                     fontSize: px(big ? 21 : 15), fontWeight: 500, color: big ? CARD_NAVY : "#5b6478", lineHeight: 1 }}>{value}</span>
    </div>
  );
  return (
    <div className="idcard" style={{ width: px(590), height: px(H), background: cTint, position: "relative", overflow: "hidden", fontFamily: '"Inter", system-ui, sans-serif', flex: "none" }}>
      {/* The white panel. Plain — no inset outline, no keyline. Its only job is
          to hold the two colours apart; the centre reads off the frame around it,
          which is simply the card's background showing through on all four edges.
          Bleed is therefore a straight extension of the same colour, with no
          artwork anywhere near the trim. */}
      <div style={{ position: "absolute", top: px(30), left: px(30), right: px(30), bottom: px(112), background: "#fff", borderRadius: px(22) }}/>
      {/* Foot band, spanning the full width — it is the same continuous shape as
          the frame. Painted in the centre colour rather than left transparent
          over an identical background: the paint is the same either way, and an
          element that owns its colour can be measured — by a test, and by anyone
          reading this — instead of inferred from what sits behind it. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: px(112), background: cTint, color: cInk.ink,
                    display: "grid", placeItems: "center", overflow: "hidden" }}>
        {(() => {
          const code = String(centre.code || "").toUpperCase();
          const name = String(centre.name || "").toUpperCase();
          const line = (code ? code + "  ·  " : "") + name;
          const one = footBandFit(line, 520, 25, 22);
          const sp = (size, track, weight) => ({
            fontWeight: weight, fontSize: px(size), letterSpacing: px(track),
            /* The trailing track sits after the last glyph and shifts a centred
               line left by that much; an equal indent puts it back. */
            textIndent: px(track), lineHeight: 1, whiteSpace: "nowrap", textShadow: cInk.shadow,
          });
          if (!one.split) return <span style={sp(one.size, one.track, 600)}>{line}</span>;
          /* Too long for one legible line, so the code takes a line of its own
             and the name gets the full width beneath it. Two lines at 22 units
             beat one line at 13. */
          const two = footBandFit(name, 520, 23, 18);
          return (
            <div style={{ display: "grid", justifyItems: "center", gap: px(7) }}>
              {code ? <span style={sp(25, 5, 800)}>{code}</span> : null}
              <span style={sp(two.size, two.track, 600)}>{name}</span>
            </div>
          );
        })()}
      </div>
      {/* STS disc, straddling the top edge of the panel. The 9-unit white ring is
          what lets it overlap the frame and still read as a disc — including when
          the tier colour is pale. */}
      <div style={{ position: "absolute", top: px(2), left: "50%", transform: "translateX(-50%)", width: px(110), height: px(110), zIndex: 2,
                    borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center" }}>
        <div style={{ position: "relative", width: px(92), height: px(92), borderRadius: "50%", background: tTint, display: "grid", placeItems: "center" }}>
          {/* Ink from the tier colour rather than assumed white — a pale tier
              printed a white STS on a near-white disc. Only ever seen if the SVG
              below it fails to load. */}
          <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 800, fontSize: px(28), letterSpacing: px(1), color: tInk.ink }}>STS</span>
          {/* Clipped to its own disc. The supplied SVG carries a near-white
              square across its full canvas — invisible against a screen, and a
              faint grey box around the badge once it is printed on card stock.
              The artwork inside it is a circle, so a circular clip loses nothing
              and removes the box without touching the asset. */}
          <img src="/assets/idcard/logo-sts.svg" alt="Street-To-Stardom" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", borderRadius: "50%", clipPath: "circle(46% at 50% 50%)" }}
            onError={e => { e.target.style.display = "none"; }}/>
        </div>
      </div>
      {/* Content column, inset to the panel. The three spacers are what let it
          reflow to any card height without stretching a single element. */}
      <div style={{ position: "absolute", top: px(30), left: px(30), right: px(30), bottom: px(112), display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box",
                    padding: px(96) + "px " + px(48) + "px " + px(44) + "px" }}>
        <div style={{ flex: "1 1 0", minHeight: px(14) }}/>
        {/* A plain plate at the panel's own radius — no coloured mount, no
            keyline, no shadow. The crop is baked into the delivered URL at the
            frame's own aspect because html2canvas ignores object-fit, so a
            mismatch that looks right on screen distorts in the exported PNG. */}
        <div style={{ width: px(phW), height: px(phH), borderRadius: px(22), overflow: "hidden", background: "#eef0f4", flex: "none" }}>
          {card.photoUrl && <img src={cardFacePhoto(card.photoUrl, phW * 2, phH * 2)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>}
        </div>
        <div style={{ flex: "1 1 0", minHeight: px(14) }}/>
        {/* Sentence case, light, grey — the quiet half of the pair. */}
        <div style={{ textAlign: "center", fontWeight: 400, fontSize: px(fnSize), lineHeight: 1.1, color: "#5b6478", letterSpacing: px(0.4), whiteSpace: "nowrap", flex: "none" }}>{card.firstName}</div>
        {/* …and the only shouted word on the card. */}
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: px(snSize), lineHeight: 1.04, color: CARD_NAVY, textTransform: "uppercase", letterSpacing: px(-1.2), whiteSpace: "nowrap", flex: "none", marginTop: px(2) }}>{card.surname || " "}</div>
        {/* Role pill in the tier colour — hug width, so a long role grows the
            pill rather than shrinking the type until the 360-unit ceiling. */}
        <div style={{ display: "grid", placeItems: "center", height: px(46), padding: `0 ${px(26)}px`, borderRadius: px(23), marginTop: px(20), flex: "none", background: tTint }}>
          <span style={{ fontWeight: 700, fontSize: px(roleSize), letterSpacing: px(3.2), textIndent: px(3.2), textTransform: "uppercase", lineHeight: 1, whiteSpace: "nowrap", color: tInk.ink, textShadow: tInk.shadow }}>{role}</span>
        </div>
        <div style={{ flex: "1 1 0", minHeight: px(14) }}/>
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: px(22), flex: "none" }}>
          <CardQR token={card.token} size={px(98)}/>
          <span style={{ width: Math.max(1, px(1)), height: px(74), background: "#e6e8ee", flex: "none" }}/>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: px(14), flex: "none" }}>
            {field("Volunteer ID", card.displayId || card.volunteerId || "", true)}
            {/* Omitted entirely rather than printed blank: a programme running
                with no expiry has no date to put here. */}
            {card.expiresAt ? field("Valid to", String(card.expiresAt).slice(0, 10)) : null}
          </div>
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
  // for students and the ROLE for volunteers. A volunteer's centre is on the
  // front twice over (the frame and the foot band it is continuous with), so the
  // one line the back can spare goes to the thing the front only says once.
  const isVol = !!card.tier;
  const key = card.studentId || card.volunteerId || card.displayId;
  /* Role, qualified by faculty when there is one. "INSTRUCTOR" is the least
     identifying thing you can print on a card at a site where every third
     person is one; "INSTRUCTOR · MUSIC" is what everybody is actually asking. */
  const volRole = [String(card.role || (card.tier && card.tier.name) || "").toUpperCase(),
                   String(card.faculty || "").toUpperCase()].filter(Boolean).join(" · ");
  const midRow = isVol
    ? ["ROLE", volRole, "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-9 9a9 9 0 0 1 18 0"]
    : ["CENTRE", ((card.centre && card.centre.name) || "").toUpperCase(), "M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"];
  const rows = [
    ["WEBSITE", program.website, "M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0Zm2 0h16M12 2c3 3.5 3 16.5 0 20-3-3.5-3-16.5 0-20Z"],
    ["PHONE", program.phone, "M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"],
    midRow,
    ["ID", card.displayId, "M4 5h16v14H4zM8 9.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM7 15c.7-1.8 2.2-2.5 3-2.5s2.3.7 3 2.5M15 10h3M15 13h3"],
  ];
  /* Printed expiry. The server refuses an expired card at the gate regardless,
     but a date on the card lets a desk see it without scanning, and lets the
     holder know before they turn up. Only shown when the card actually has
     one — a programme running "never expires" should not get a blank row. */
  if (card.expiresAt) {
    rows.push(["VALID TO", String(card.expiresAt).slice(0, 10),
      "M7 4v3M17 4v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"]);
  }
  const wm = [];
  for (let i = 0; i < 9; i++) wm.push(<div key={i} style={{ fontFamily: 'Georgia, serif', fontWeight: 800, fontSize: px(86), lineHeight: 1.28, color: "rgba(27,43,107,.045)", whiteSpace: "nowrap", textTransform: "uppercase", marginLeft: (i % 2 ? px(-70) : 0) }}>ÈKÓ ÌLÚ ÈKÓ ÌLÚ</div>);
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
      <div style={{ position: "absolute", top: pt(170), left: 0, right: 0, textAlign: "center", fontFamily: '"Inter", sans-serif', fontWeight: 800, fontSize: px(62), letterSpacing: px(-1) }}>
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

/* The member card, in the Card Studio's contract.
 *
 * Two renderers meet here and neither should bend to the other. The studio's
 * fronts are absolutely-positioned design pixels scaled by S against a design
 * height H; NggcMemberCard is laid out in MILLIMETRES at a real 54 × 85mm,
 * because it is a credential and its geometry is the specification (see
 * docs/PRINT-SPEC.md). Redrawing it in this file's idiom would fork a shipped
 * design — the card a member downloads from their dashboard, and the one
 * NggcMemberCardExport prints — and the fork would drift within a season.
 *
 * So this is an ADAPTER, not a second card: the real renderer inside a box
 * that reports the size the studio expects, with a CSS transform doing the
 * scaling. 96dpi CSS gives 1mm = 96/25.4 px, which is how a millimetre design
 * gets a pixel height to scale against. transform-origin at the top left so
 * the scaled card sits where the unscaled one would have.
 */
const MM_PX = 96 / 25.4;
function MemberCardStudioFront({ card, S, H }) {
  const wMm = 54, hMm = 85;
  const pxH = hMm * MM_PX;
  // Fill the height the studio has allotted, exactly as its own fronts do.
  const k = (H * (S || 1)) / pxH;
  return (
    <div style={{ width: wMm * MM_PX * k, height: pxH * k, overflow: "hidden", position: "relative" }}>
      <div style={{ transform: "scale(" + k + ")", transformOrigin: "top left",
        width: wMm * MM_PX, height: pxH }}>
        {window.NggcMemberCard
          ? <window.NggcMemberCard member={card} size="wallet" qrUrl={card && card.token
              ? (window.location.origin || "") + "/q/" + card.token : ""}/>
          : null}
      </div>
    </div>
  );
}

/* ── The Card Studio's SUBJECTS ──────────────────────────────────────────────
 *
 * This was a boolean. `const isVol = mode === "volunteers"` was threaded
 * through some twenty-five sites, each re-deciding what a volunteer is and
 * what a student is: the noun, the id field, the rows source, the units they
 * colour by, the renderer, the file name, the example id printed in the range
 * hint, who the resend email goes to. A boolean can hold two subjects and NGG
 * has three — members were printed from a drawer in the member roster instead,
 * which is the same job in a different place through different code.
 *
 * So: one declaration per subject, and every site reads a field off it. Adding
 * a fourth means adding a row, not finding twenty-five branches.
 *
 *   noun/nouns  what to call one and many of them
 *   idOf        the row's own id — the three tables do not share a key name
 *   load        the rows op; all three return { ok, cards[], program }
 *   units       which vocabulary colours the card: centres, or volunteer tiers
 *   resendKind  the `kind` the resend op takes, or "" where there is no resend
 *   idEg        a real id from that subject, for the print-range hint
 *   ready       the sentence under the count, which differs per subject
 *               because what makes a card printable differs per subject
 */
const CARD_SUBJECTS = {
  students: {
    /* "Participants", not "Summer School": the other two tabs name PEOPLE, and
       a tab row reading Summer School | NGG members | Volunteers mixes a
       programme with two audiences. It is also the label this tab already had. */
    id: "students", label: "Participants", noun: "verified participant", nouns: "verified participants",
    ready: (w, h) => "Cards render for verified participants only — the ID and QR bind at parent consent. Print uses a true " + w + "\u00d7" + h + "mm per card.",
    empty: "No verified participants yet — cards appear here the moment a parent consents.",
    idOf: (c) => c.studentId, units: "centres", resendKind: "student", resendTo: "parent",
    file: "participant-id-cards", idEg: "NGG/26/00", unitNoun: "centre",
    load: () => NGGApi.admin.registration.cards(),
    fixHint: "the participant's record",
  },
  volunteers: {
    id: "volunteers", label: "Volunteers", noun: "volunteer", nouns: "volunteers",
    ready: () => "Cards render for active volunteers — the ID and QR bind at approval. Colour + code come from the hierarchy tier.",
    empty: "No active volunteers yet — cards appear here the moment one is approved.",
    idOf: (c) => c.volunteerId, units: "tiers", resendKind: "volunteer", resendTo: "volunteer",
    file: "volunteer-id-cards", idEg: "VOL-MEN-26-0", unitNoun: "tier",
    load: () => NGGApi.admin.registration.volunteerCards(),
    fixHint: "the tier on the volunteer's record",
  },
  /* NGG MEMBERS — the third subject, and the reason this table exists.
   * `resendKind` is empty because there is no member resend op: the member
   * dashboard issues its own card. An empty string rather than a lie, and the
   * button reads the field rather than assuming every subject has one. */
  members: {
    id: "members", label: "NGG members", noun: "member", nouns: "members",
    /* A member card is ID-1 (54 \u00d7 85mm, a wallet slot) and its geometry
       lives in the renderer, not in the programme's trim setting — so this
       subject declares its size fixed and the trim control says so rather
       than implying it applies. */
    fixedSize: true, trimMm: [54, 85],
    ready: () => "Cards render for every member on the roster \u2014 the QR carries their member id, and the printed ID comes from their record. Fixed at 54\u00d785mm (ID-1), the size of a wallet slot.",
    empty: "No members on the roster yet — cards appear here as members are enrolled.",
    idOf: (c) => c.memberId, units: "centres", resendKind: "", resendTo: "",
    file: "member-id-cards", idEg: "NGG/EG/00", unitNoun: "centre",
    load: () => NGGApi.admin.registration.memberCards(),
    fixHint: "the centre on the member's record",
  },
};
/* Tab order, and the first entry is the studio's default — the two must not
   disagree, or the tab that opens is not the tab that looks selected. */
const CARD_SUBJECT_ORDER = ["students", "members", "volunteers"];

function CardStudio() {
  const auth = (window.useAuth || (() => null))();
  /* Participants stay the front door. Members are an ADDITION to this studio,
     and changing which tab opens first is a behaviour change for everybody who
     already uses it — a separate decision from giving members a tab at all. */
  const [mode, setMode] = React.useState("students"); // see CARD_SUBJECTS
  /* Cards keyed by subject, not one useState per subject. Two states meant
     every read site branched to pick one; a third would have meant a third
     branch at every one of them. */
  const [subjectData, setSubjectData] = React.useState({});
  const [centres, setCentres] = React.useState([]);
  const [tiers, setTiers] = React.useState([]);
  const [state, setState] = React.useState("loading");
  // Shared manager inputs (reused across centres + tiers).
  const [mName, setMName] = React.useState(""); const [mCode, setMCode] = React.useState(""); const [mColor, setMColor] = React.useState("#76B043");
  const [msg, setMsg] = React.useState("");
  /* Which centre's batch is on the table. "" is everyone; NO_CENTRE is the
     one filter you cannot build out of the list of centres — the records that
     have none. Those are the cards that print with a plain frame and no band,
     and before this there was no way to see them coming: you found out at the
     guillotine, with the run already cut. */
  const [pick, setPick] = React.useState("");
  /* Which slice of the batch goes to the printer.
   *
   * "Everybody" is the rarest print run there is. A real one is the children who
   * registered since the last batch went out, or the block of IDs a coordinator
   * was given, or the eleven cards that came back creased. Without a way to say
   * that, the studio's only honest option was to print all 300 again — so people
   * printed all 300 again, and the cost of a reprint is paid in card stock. */
  const [rmode, setRmode] = React.useState("");        // "" | date | number | pick
  const [dFrom, setDFrom] = React.useState(""); const [dTo, setDTo] = React.useState("");
  const [nFrom, setNFrom] = React.useState(""); const [nTo, setNTo] = React.useState("");
  const [chosen, setChosen] = React.useState(() => new Set());
  const [paste, setPaste] = React.useState("");
  const [pasteMsg, setPasteMsg] = React.useState("");
  // Card proportion (mm) — admin-set, applies to preview, PNG/PDF export + print.
  const [sizeW, setSizeW] = React.useState(54); const [sizeH, setSizeH] = React.useState(75);
  const [sizeMsg, setSizeMsg] = React.useState("");
  const navy = "#16223e", gold = "#ffce54";

  const load = React.useCallback(() => {
    setState("loading");
    /* Every subject's rows come from its own declaration, so a new subject
       needs no new call here. A subject the operator cannot read (members are
       gated on `people`, participants on `summer`) resolves to empty rather
       than failing the whole studio: a Summer School coordinator should get
       their own tab working, not an error page. */
    const subjects = CARD_SUBJECT_ORDER.map(k => CARD_SUBJECTS[k]);
    Promise.all([
      Promise.all(subjects.map(sub => sub.load().catch(() => ({ cards: [], program: null })))),
      NGGApi.admin.registration.centres(), NGGApi.admin.registration.hierarchy(),
    ])
      .then(([rows, ct, h]) => {
        const next = {};
        subjects.forEach((sub, i) => { next[sub.id] = rows[i] || { cards: [] }; });
        setSubjectData(next);
        setCentres(ct.centres || []); setTiers(h.tiers || []); setState("ready");
      })
      .catch(e => setState((e.code || e.message) === "unauthorized" ? "need-auth" : "error"));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (state === "need-auth" && auth && auth.isSignedIn) load(); }, [auth && auth.isSignedIn]);
  // Seed the size inputs from whichever dataset has loaded.
  React.useEffect(() => {
    const pr = CARD_SUBJECT_ORDER.map(k => (subjectData[k] || {}).program).filter(Boolean)[0];
    if (pr) { setSizeW(Number(pr.widthMm) || 54); setSizeH(Number(pr.heightMm) || 75); }
  }, [subjectData]);
  const saveSize = async () => {
    setSizeMsg("");
    const w = Math.max(50, Math.min(60, Number(sizeW) || 54));
    const h = Math.max(64, Math.min(100, Number(sizeH) || 75));
    try { await NGGApi.admin.settings.set({ idcard: { widthMm: w, heightMm: h } }); setSizeMsg("Saved · " + w + "×" + h + "mm"); load(); }
    catch (e) { setSizeMsg("Couldn't save — need staff permission."); }
  };

  /* Warm the hosted QR cache, once, in the background.
   *
   * Unglamorous and it decides something real: mail clients strip `data:` URIs,
   * so an in-email QR has to be a hosted PNG, and there is no QR encoder on the
   * server — only the vendored one this screen has just used to draw every card.
   * An ID issued with a browser present (a resend) can hand one over; an ID
   * issued when a parent clicks a consent link at 2am cannot.
   *
   * So this screen lends its encoder. After one visit every token in the roster
   * has a hosted image and every ID mailed from then on embeds a scannable code
   * rather than only a link. Fire-and-forget, after paint, and the server skips
   * tokens it already holds so a second visit writes nothing. */
  const warmedQr = React.useRef(false);
  React.useEffect(() => {
    if (warmedQr.current || state !== "ready") return;
    const tokens = CARD_SUBJECT_ORDER
      .reduce((all, k) => all.concat((subjectData[k] || {}).cards || []), [])
      .map(c => String(c.token || "")).filter(Boolean);
    if (!tokens.length) return;
    warmedQr.current = true;
    const t = setTimeout(async () => {
      try {
        if (!window.qrcode) {
          await new Promise((res) => {
            let sc = document.getElementById("ngg-qrlib");
            if (!sc) { sc = document.createElement("script"); sc.id = "ngg-qrlib"; sc.src = "/vendor/qrcode.min.js"; document.head.appendChild(sc); }
            sc.addEventListener("load", res, { once: true });
            setTimeout(res, 6000);   // never hang the page on a missing vendor file
          });
        }
        if (!window.qrcode) return;
        const origin = window.location.origin;
        const items = [];
        tokens.forEach(tok => {
          try {
            const q = window.qrcode(0, "M");
            q.addData(origin + "/q/" + tok); q.make();
            items.push({ token: tok, qrPng: q.createDataURL(8, 0) });
          } catch (_) {}
        });
        // Batched, because 300 tokens is a 3MB body and one request is kinder
        // than 300 — but not one 300-token body either.
        for (let i = 0; i < items.length; i += 60) {
          try { await NGGApi.admin.registration.qrWarm(items.slice(i, i + 60)); } catch (_) { break; }
        }
      } catch (_) {}
    }, 1200);
    return () => clearTimeout(t);
  }, [state, subjectData]);

  /* One lookup, not a boolean. See CARD_SUBJECTS above: `isVol` could only
     ever express two of three subjects, and every site re-decided what each
     one meant. `S` is the subject; isVol survives only where the difference
     really is "volunteers versus everyone else" — the units vocabulary. */
  const S = CARD_SUBJECTS[mode] || CARD_SUBJECTS.students;
  const isVol = S.units === "tiers";
  const resetInputs = () => { setMName(""); setMCode(""); setMColor(isVol ? "#00225F" : "#76B043"); };
  const clearRange = () => { setRmode(""); setDFrom(""); setDTo(""); setNFrom(""); setNTo(""); setChosen(new Set()); setPaste(""); setPasteMsg(""); };
  /* Same reason the centre filter clears: a range carried across rosters hides
     most of the new one, and the header would still read as if that were
     everybody. The IDs do not even overlap between the two. */
  const switchMode = (m) => { setMode(m); setMsg(""); setMName(""); setMCode(""); setPick(""); clearRange(); setMColor(m === "volunteers" ? "#00225F" : "#76B043"); };

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
    if (!(await dialog.confirm({ title: "Remove " + unit.name + "?",
      body: isVol ? "The tier is removed. Cards already printed keep the colour they were printed with."
                  : "The centre is removed from the pickers. Members already assigned to it keep the name on their record.",
      cta: "Remove", danger: true }))) return;
    try { if (isVol) await NGGApi.admin.registration.hierarchyDelete(unit.tierId); else await NGGApi.admin.registration.centreDelete(unit.centreId); load(); }
    catch (e) {}
  };

  // ── Export toolkit (PNG · bulk ZIP · print-ready CMYK PDF) ──────────────
  const BLEED_MM = 3;
  // Which way the press turns the sheet between sides. Long-edge
  // (work-and-turn) keeps the same gripper edge and registers best.
  const [duplex, setDuplex] = React.useState("long-edge");
  // Raster resolution for the embedded artwork. 350 is the offset standard
  // (2× a 175 lpi screen), 300 the digital-press floor, 600 for line art.
  const [dpi, setDpi] = React.useState(350);
  /* Barcode verification, on by default.
     Off is for a quick proof: it adds a decode pass per card, and somebody
     checking a layout does not need it. For a real run it should stay on —
     a batch of cards nobody can scan is scrap, and this is the only step
     that catches it before the guillotine. */
  const [verifyQr, setVerifyQr] = React.useState(true);
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
    const kind = S.resendKind;
    const id = S.idOf(card);
    // No resend for members: they issue their own card from their dashboard.
    if (!kind || !id || resending) return;
    const who = card.firstName || "this person";
    if (!(await dialog.confirm({ title: "Resend " + who + "'s ID?",
      body: "Emails the digital ID and the scannable QR to the " + S.resendTo
            + ", and texts a link by SMS if a number is on file.",
      cta: "Send it again" }))) return;
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
  const cardName = (card) => (card.displayId || S.idOf(card) || "card").replace(/[^\w.-]+/g, "-");
  const setName = () => S.file;

  /* Takes the CARD, not an index. The preview list and the print list are no
     longer the same array — in pick mode you are looking at every candidate and
     printing only the ticked ones — and an index into the wrong one downloads
     somebody else's card. */
  const exportPairPng = async (card) => {
    if (exp || !card) return;
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
      // Same resolution and the same 3mm of bleed as the PDF, so a designer
      // re-laying these out by hand has usable art. Fixed-scale, bleedless
      // PNGs were a different deliverable wearing the same label.
      const pngScale = Math.max(2, Math.min(6, Math.round((dpi * (cardW / 25.4) / 295) * 100) / 100));
      const facePng = async (node) => {
        const r = await CE.renderFace(node, { trimW_mm: cardW, scale: pngScale, bleed_mm: BLEED_MM, type: "image/png", bg: "#fff" });
        return CE.dataUrlToBytes(r.dataUrl);
      };
      for (let i = 0; i < cards.length; i++) {
        setExp("Rendering " + (i + 1) + " / " + cards.length + "…");
        try {
          await stageCard(cards[i]);
          const n = hostFaces();
          files.push({ name: cardName(cards[i]) + "-front.png", bytes: await withBudget(facePng(n[0]), 30000) });
          files.push({ name: cardName(cards[i]) + "-back.png", bytes: await withBudget(facePng(n[1]), 30000) });
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

  // Render a face at the chosen DPI for the actual trim size. One retry + a
  // frame yield so a single hiccup never kills a mass run and the tab stays
  // responsive across hundreds of cards.
  const renderFace = async (CE, node, scale) => {
    for (let attempt = 0; ; attempt++) {
      // renderFace (not nodeToImage) so the face carries 3mm of real bleed.
      try { return await CE.renderFace(node, { trimW_mm: cardW, scale, bleed_mm: BLEED_MM, quality: 0.95, bg: "#fff" }); }
      catch (e) { if (attempt >= 1) throw e; await new Promise(r => setTimeout(r, 250)); }
    }
  };
  const nextFrame = () => new Promise(r => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

  /* Which of the card's shared logos fail to load. The card hides a broken
     logo rather than showing a torn-image icon — good on screen, but it means
     a missing crest is invisible until the sheets come back from the printer.
     Probed once per export, not per card. */
  const missingCardArt = () => {
    const art = [
      ["Programme lockup", (program && program.logoLockup) || "/assets/idcard/logo-lockup.png"],
      ["Okun Alimọsho crest", (program && program.logoOkun) || "/assets/idcard/logo-okun.png"],
    ];
    return Promise.all(art.map(([label, url]) => new Promise(res => {
      if (!url) return res(label + " — not set");
      const im = new Image();
      const done = (bad) => res(bad ? label + " — " + url : null);
      im.onload = () => done(!im.naturalWidth);
      im.onerror = () => done(true);
      setTimeout(() => done(!im.complete || !im.naturalWidth), 6000);
      im.src = url;
    }))).then(r => r.filter(Boolean));
  };

  const exportPdf = async () => {
    if (exp || !cards.length) return;
    try {
      /* Preflight. Two things that are invisible on screen and obvious on
         paper, both worth catching before a run of several hundred cards. */
      const warn = [];
      // 1. A card with no photo prints the empty gradient frame, which reads as
      //    a printing fault rather than as missing data.
      const noPhoto = cards.filter(c => !c.photoUrl);
      if (noPhoto.length) {
        warn.push(noPhoto.length + " of " + cards.length + " card(s) have no photo and will print an empty frame:\n  "
          + noPhoto.slice(0, 8).map(cardName).join(", ") + (noPhoto.length > 8 ? ", …" : ""));
      }
      // 2. A card logo that 404s. The card hides a broken logo by design, so
      //    the omission is silent — and one of these assets is not in the
      //    repository, so a deploy that syncs the tree can drop it and every
      //    card in the run comes out missing a crest with nothing to say so.
      const missingArt = await missingCardArt();
      if (missingArt.length) {
        warn.push("Card artwork that will not load, so it prints missing:\n  " + missingArt.join("\n  "));
      }
      /* A pre-flight the operator has to read: what will be WRONG on the
         printed sheet, before the sheet exists. In the styled dialog rather
         than a native one, so the list is legible and the buttons say what
         they do — "OK" on a warning about eleven missing photographs is not
         a sentence anybody should have to interpret. */
      if (warn.length && !(await dialog.confirm({
        title: "Some cards will print with gaps",
        body: warn.join("\n\n"), cta: "Export anyway", cancel: "Go back and fix it", danger: true,
      }))) return;
      setExp("Preparing…");
      const CE = await ensureLib();
      // Scale to hit the chosen DPI at the chosen trim width (card is 295 CSS
      // px wide). Capped at 6× — beyond that html2canvas allocates more canvas
      // than a phone will give it and the run dies mid-roster.
      const pdfScale = Math.max(2, Math.min(6, Math.round((dpi * (cardW / 25.4) / 295) * 100) / 100));
      const fronts = [], backs = [], failed = [], qrBad = [];
      let qrSkipped = 0;
      for (let i = 0; i < cards.length; i++) {
        setExp("Rendering " + (i + 1) + " / " + cards.length + "…");
        try {
          await stageCard(cards[i]);
          const n = hostFaces();
          const f = await withBudget(renderFace(CE, n[0], pdfScale), 30000);
          const b = await withBudget(renderFace(CE, n[1], pdfScale), 30000);
          fronts.push(f); backs.push(b);
          /* Verify the QR out of the EXPORTED pixels, not the DOM.
           *
           * This is the one failure that cannot be seen and cannot be fixed
           * after the fact: everything upstream can be right and the printed
           * code still not scan, because rasterising can land module edges
           * between pixels, JPEG can ring around the finder patterns, and the
           * bleed pass can eat the quiet zone. A batch of cards nobody can
           * scan is scrap. Decoded with the same jsQR the gate kiosks use, so
           * this proves the thing that will actually read it can. */
          if (verifyQr && cards[i].token) {
            const v = await CE.verifyQR(f.dataUrl, cards[i].token);
            if (!v.ok && v.reason !== "no_decoder") {
              qrBad.push({ name: cardName(cards[i]), reason: v.reason || "unreadable" });
            } else if (v.reason === "no_decoder") {
              qrSkipped++;
            }
          }
        } catch (e) { failed.push(cardName(cards[i])); }
        await nextFrame(); // yield so the tab never locks up mid-run
      }
      setHostCard(null);
      if (!fronts.length) { setExp(""); setMsg("PDF export failed — no cards could be rendered."); return; }
      setExp("Imposing sheets…"); await nextFrame();
      /* Hand the backs over AS backs. Concatenating them onto the fronts — all
       * fronts, then all backs — is what the builder sees as a single-sided
       * job, so it does no mirroring and card 1's back lands on card N's
       * front. With `backs` passed properly each back sheet follows its own
       * front and is mirrored for the press's flip. */
      const pdf = await CE.buildImpositionPDF(fronts, {
        backs, duplex,
        sheet: "A4", trimW_mm: cardW, trimH_mm: cardH,
        bleed_mm: BLEED_MM, safe_mm: 3, marks: true, layers: true, intent: "FOGRA39",
        jobName: [program.program, program.year, S.id].filter(Boolean).join(" "),
        date: new Date().toISOString().slice(0, 10),
      });
      CE.download(pdf, setName() + "-print-cmyk.pdf", "application/pdf");
      setExp("");
      /* Report both failure classes, and be exact about which is which.
         A card that did not render is missing from the PDF. A card whose QR
         did not verify IS in the PDF and will print — it just may not scan,
         which the operator has to decide about before the run. Conflating
         them would send someone hunting for cards that are present. */
      const notes = [];
      if (failed.length) {
        notes.push(failed.length + " card(s) couldn't render and were LEFT OUT — retry the export: "
          + failed.slice(0, 5).join(", ") + (failed.length > 5 ? "…" : ""));
      }
      if (qrBad.length) {
        notes.push("⚠ " + qrBad.length + " card(s) are in the PDF but their QR did not decode from the exported artwork — they may not scan at a gate: "
          + qrBad.slice(0, 5).map(q => q.name + " (" + q.reason + ")").join(", ") + (qrBad.length > 5 ? "…" : "")
          + ". Try a higher resolution, or PNG instead of JPEG.");
      } else if (verifyQr && qrSkipped === 0 && fronts.length) {
        notes.push("✓ Every QR decoded from the exported artwork.");
      } else if (verifyQr && qrSkipped > 0) {
        notes.push("QR check skipped — the decoder could not be loaded. The cards are fine; they were just not verified.");
      }
      setMsg(notes.join("  "));
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

  const allCards = ((subjectData[mode] || {}).cards) || [];
  /* Everything downstream reads `cards` — the header count, the ZIP, the
     imposed PDF and the print zone. Filtering here rather than only in the
     preview is the point: a batch you can see is a batch you can print. */
  const cardCentre = (c) => (c.centre && c.centre.name) || "";
  const noCentreCount = allCards.filter(c => !cardCentre(c)).length;
  const centreCounts = allCards.reduce((m, c) => {
    const n = cardCentre(c); if (n) m[n] = (m[n] || 0) + 1; return m;
  }, {});
  const inCentre = pick === NO_CENTRE ? allCards.filter(c => !cardCentre(c))
    : pick ? allCards.filter(c => cardCentre(c) === pick)
    : allCards;
  /* Range, applied AFTER the centre filter, because that is the order a
     coordinator says it in: "Egbeda, the ones from last week". */
  /* The row's own id, per subject. This read `c.studentId || c.volunteerId`,
     which is empty for a member — so every member card got the SAME React key
     (""), and the pick set and the paste-a-list matcher keyed off it too: one
     tick would have selected the whole roster, and switching subjects leaked
     stale cards because React had no way to tell three identical keys apart.
     S.idOf is the subject's declared id field. */
  const cardId = (c) => String(S.idOf(c) || c.displayId || "");
  /* The number a human means by "cards 40 to 80" is the sequence in the printed
     ID — NGG/26/0041 — not a row id and not a position in this list, which
     shifts every time somebody else registers. Last run of digits, so both
     NGG/26/0041 and VOL-MEN-26-004 answer. */
  const cardSeq = (c) => {
    const m = String(c.displayId || "").match(/(\d+)(?!.*\d)/);
    return m ? parseInt(m[1], 10) : null;
  };
  const cardDay = (c) => String(c.enrolledAt || "").slice(0, 10);
  /* Computed plainly, NOT in a useMemo. This sits below the early returns for
     the loading and need-auth states, and a hook after a conditional return is
     React error #310 — the studio mounted blank. It is a filter over at most 500
     rows; memoising it was buying nothing and cost the whole screen. */
  const cards = (() => {
    if (rmode === "date" && (dFrom || dTo)) {
      /* A card with no date on file is EXCLUDED from a date range, not swept in.
         Those are the oldest records in the system; including them silently
         would make "print this week's intake" quietly reprint the founders. */
      return inCentre.filter(c => {
        const d = cardDay(c);
        if (!d) return false;
        return (!dFrom || d >= dFrom) && (!dTo || d <= dTo);
      });
    }
    if (rmode === "number" && (nFrom || nTo)) {
      const lo = nFrom === "" ? -Infinity : Number(nFrom);
      const hi = nTo === "" ? Infinity : Number(nTo);
      return inCentre.filter(c => { const n = cardSeq(c); return n !== null && n >= lo && n <= hi; });
    }
    if (rmode === "pick") return inCentre.filter(c => chosen.has(cardId(c)));
    return inCentre;
  })();
  const program = ((subjectData[mode] || {}).program) || {};
  // Physical card proportion (admin-set). The artwork's design canvas is 590×1004
  // (≈54×92mm); we keep the 590px width and derive the canvas height from the
  // configured aspect, so the whole studio + export + print reflect the size.
  /* The card's real-world size. The SUBJECT gets first say: a member card is
     ID-1 (54 × 85mm, a wallet slot) and its geometry lives in its renderer,
     not in the Summer School programme's trim setting — reading the programme
     for every subject had the export blurb promising a 54×75 trim for a card
     that prints at 54×85, and the preview scaling was derived from the same
     wrong ratio. Programme setting still governs the subjects it belongs to. */
  const cardW = (S.trimMm && S.trimMm[0]) || Number(program.widthMm) || 54;
  const cardH = (S.trimMm && S.trimMm[1]) || Number(program.heightMm) || 75;
  const CANVAS_H = Math.round(590 * cardH / cardW);
  const units = isVol ? tiers : centres;
  const tab = (m, label) => (
    <button onClick={() => switchMode(m)} aria-pressed={mode === m}
      className={"cs-btn cs-btn-pill" + (mode === m ? " is-on" : "")}>{label}</button>
  );
  return shell(<>
    <style>{`
      /* TT Firs Neue and Pagkaki used to be declared here. Neither file was
         ever in the repository, so every studio load fetched two 404s and the
         browser fell through to the stack behind them. The names were taken
         out of the card font stacks; these declarations were left behind,
         still 404ing on every visit. Nothing about the printed card changes. */
      .card-pair { display: flex; gap: 14px; }
      @media print {
        body * { visibility: hidden; }
        .print-zone, .print-zone * { visibility: visible; }
        .print-zone { position: absolute; left: 0; top: 0; background: #fff; }
        .idcard { width: ${cardW}mm !important; height: ${cardH}mm !important; page-break-inside: avoid; box-shadow: none !important; }
        .card-pair { gap: 4mm; margin: 3mm; page-break-inside: avoid; float: left; }
        /* Dimming is a screen affordance; on paper it has to be absent, or a
           reprint of eleven cards comes out as the whole run at 34% opacity. */
        .card-unpicked { display: none !important; }
      }
    `}</style>
    <div className="no-print" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 18, marginBottom: 18 }}>
      <div>
        <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>CARD STUDIO · PRINT RUNS · {String(program.program || "")} {String(program.year || "")}</div>
        {/* "1 of 30 verified student ready" — the noun agrees with the TOTAL
            once there is a total in the sentence, not with the filtered count. */}
        <h1 style={{ fontSize: 24, margin: "4px 0 0", fontWeight: 800 }}>{cards.length}{cards.length !== allCards.length ? " of " + allCards.length : ""} {(cards.length !== allCards.length ? allCards.length : cards.length) === 1 ? S.noun : S.nouns} ready</h1>
        {/* The subject's own sentence. This was a two-way branch and showed
            the participants' one on the members tab — telling an operator
            printing member cards that they "bind at parent consent" and print
            at 54×75, neither of which is true of a member card. */}
        <p style={{ color: "rgba(230,238,255,.62)", fontSize: 13, margin: "6px 0 0", maxWidth: 520 }}>{S.ready(cardW, cardH)}</p>
        {/* WHICH STUDIO AM I IN.
            There are two, and for years neither said so — so which one an
            operator used depended on which link they happened to click. This
            one PRINTS the standard cards, laid out in code; the Design Studio
            is where a layout is drawn, bound to fields and published, and it
            is the only one that can make an NGG member card or a card back.
            Said here rather than left as folklore. */}
        <p style={{ color: "rgba(230,238,255,.5)", fontSize: 12.5, margin: "8px 0 0", maxWidth: 520, lineHeight: 1.5 }}>
          This studio prints the <b style={{ color: "rgba(230,238,255,.8)" }}>standard</b> cards for all three
          subjects — Summer School participants, NGG members and volunteers — whose layouts live in
          code. To <i>draw</i> a layout, bind it to your own fields, or make a card{" "}
          <b style={{ color: "rgba(230,238,255,.8)" }}>back</b>, use the{" "}
          <a href="/designer" style={{ color: gold }}>Design Studio</a>. Every run from either is recorded in{" "}
          <b style={{ color: "rgba(230,238,255,.8)" }}>Control Room → People → ID cards</b>.
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {notice && <span className="mono" style={{ fontSize: 12, color: "#6fdc9d" }}>{notice}</span>}
        {exp && <span className="mono" style={{ fontSize: 12, color: gold }}>{exp}</span>}
        <button onClick={exportZip} disabled={!cards.length || !!exp} title="High-resolution PNG of every card face, zipped"
          style={{ padding: "13px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#eef2fb", fontWeight: 800, fontSize: 14, cursor: cards.length ? "pointer" : "not-allowed", opacity: exp ? .6 : 1 }}>
          ↓ PNG (all, .zip)
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(230,238,255,.72)" }}>Resolution
          <select value={dpi} onChange={e => setDpi(Number(e.target.value))} disabled={!!exp} className="cs-field"
            title="Raster resolution of the card artwork inside the PDF. 350 DPI is the offset standard; 300 is the digital-press floor; 600 is for line art and is slow and large."
            >
            <option value={300}>300 DPI — digital press</option>
            <option value={350}>350 DPI — offset standard</option>
            <option value={600}>600 DPI — line art (slow)</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(230,238,255,.72)", cursor: "pointer" }}
          title="Decodes each card's QR back out of the exported artwork, using the same reader the gate kiosks use. Catches codes that look right on screen but will not scan once printed.">
          <input type="checkbox" checked={verifyQr} onChange={e => setVerifyQr(e.target.checked)} disabled={!!exp}
            style={{ width: 16, height: 16, accentColor: "#ffce54" }}/>
          Verify QR codes
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(230,238,255,.72)" }}>Front/back flip
          <select value={duplex} onChange={e => setDuplex(e.target.value)} disabled={!!exp} className="cs-field"
            title="How the press turns the sheet between sides — ask your printer. The wrong axis puts every back on the wrong front."
            >
            <option value="long-edge">Long edge — work-and-turn</option>
            <option value="short-edge">Short edge — work-and-tumble</option>
            <option value="none">No flip — align by hand</option>
          </select>
        </label>
        <button onClick={exportPdf} disabled={!cards.length || !!exp} title="Print-ready, imposed, CMYK — hand this to a printer"
          style={{ padding: "13px 24px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: cards.length ? "pointer" : "not-allowed", opacity: exp ? .6 : 1 }}>
          ⎙ Print-ready PDF (CMYK)
        </button>
      </div>
    </div>
    <p className="no-print" style={{ color: "rgba(230,238,255,.5)", fontSize: 12, margin: "-8px 0 18px", maxWidth: 640 }}>
      The PDF imposes cards {"—"} auto-laid out N-up on A4 at an exact {cardW}{"×"}{cardH}&nbsp;mm trim with 3&nbsp;mm bleed, crop &amp; registration marks and a CMYK (FOGRA39) output intent, front and back sheets interleaved for duplex. Card artwork is embedded at {dpi}&nbsp;DPI; the press RIP separates it to CMYK against the intent. Everything renders in your browser {"—"} nothing is uploaded.
    </p>

    <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      {/* Generated, so a subject cannot exist in the table and be missing
          here — the drift that left members with no tab at all. */}
      {CARD_SUBJECT_ORDER.map(k => <React.Fragment key={k}>{tab(k, CARD_SUBJECTS[k].label)}</React.Fragment>)}
      <span style={{ width: 1, height: 26, background: "rgba(255,255,255,.16)", margin: "0 4px" }}/>
      {/* Print one site's batch at a time — that is how the cards are handed
          out — and, the reason this exists, find the records with no centre on
          file before they are printed rather than after. */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(230,238,255,.7)" }}>
        Batch
        <select value={pick} onChange={e => setPick(e.target.value)} aria-label="Filter cards by centre"
          style={{ minHeight: 40, padding: "9px 12px", borderRadius: 10, border: "1px solid " + (pick === NO_CENTRE ? "#f5b026" : "rgba(255,255,255,.18)"), background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 13, fontWeight: 700 }}>
          <option value="">All centres · {allCards.length}</option>
          {Object.keys(centreCounts).sort().map(n => <option key={n} value={n}>{n} · {centreCounts[n]}</option>)}
          {noCentreCount > 0 && <option value={NO_CENTRE}>⚠ No centre on file · {noCentreCount}</option>}
        </select>
      </label>
      {/* Shown whatever the filter is set to. A warning you only see once you
          have already gone looking for the problem is not a warning. */}
      {noCentreCount > 0 && pick !== NO_CENTRE && (
        <button onClick={() => setPick(NO_CENTRE)}
          className="cs-btn is-on">
          ⚠ {noCentreCount} with no centre
        </button>
      )}
      <span style={{ width: 1, height: 26, background: "rgba(255,255,255,.16)", margin: "0 4px" }}/>
      {/* Range. Three ways of saying "not everybody", because coordinators say
          it three ways: by when they registered, by the ID block they were
          given, and by pointing at the ones that came back creased. */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(230,238,255,.7)" }}>
        Range
        <select value={rmode} onChange={e => { const v = e.target.value; clearRange(); setRmode(v); }} aria-label="Print a range of cards"
          style={{ minHeight: 40, padding: "9px 12px", borderRadius: 10, border: "1px solid " + (rmode ? gold : "rgba(255,255,255,.18)"), background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 13, fontWeight: 700 }}>
          <option value="">Whole batch</option>
          <option value="date">By date registered</option>
          <option value="number">By ID number</option>
          <option value="pick">Pick individually</option>
        </select>
      </label>
      {rmode === "date" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "rgba(230,238,255,.7)" }}>
          <input type="date" value={dFrom} onChange={e => setDFrom(e.target.value)} aria-label="Registered from"
            />
          to
          <input type="date" value={dTo} onChange={e => setDTo(e.target.value)} aria-label="Registered to"
            />
          {/* The run people actually want, one click instead of two date pickers. */}
          {[["Last 7 days", 7], ["Last 30 days", 30]].map(([label, days]) => (
            <button key={days} onClick={() => {
              const t = new Date(); const f = new Date(t.getTime() - (days - 1) * 86400000);
              setDFrom(f.toISOString().slice(0, 10)); setDTo(t.toISOString().slice(0, 10));
            }} className="cs-btn cs-btn-pill">{label}</button>
          ))}
        </span>
      )}
      {rmode === "number" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "rgba(230,238,255,.7)" }}>
          <input type="number" min={1} value={nFrom} onChange={e => setNFrom(e.target.value)} placeholder="from" aria-label="ID number from"
            className="cs-field" style={{ width: 92, fontFamily: "var(--font-mono, monospace)" }}/>
          to
          <input type="number" min={1} value={nTo} onChange={e => setNTo(e.target.value)} placeholder="to" aria-label="ID number to"
            className="cs-field" style={{ width: 92, fontFamily: "var(--font-mono, monospace)" }}/>
        </span>
      )}
      {rmode === "pick" && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "rgba(230,238,255,.7)" }}>
          <b className="mono" style={{ color: chosen.size ? "#6fdc9d" : "rgba(230,238,255,.55)" }}>{chosen.size} picked</b>
          <button onClick={() => setChosen(new Set(chosen.size === inCentre.length ? [] : inCentre.map(cardId)))}
            className="cs-btn cs-btn-pill">
            {chosen.size === inCentre.length ? "Clear all" : "Select all " + inCentre.length}
          </button>
        </span>
      )}
    </div>
    {/* What the range came out as, said in words next to the numbers.
        A filter that silently returns nothing looks identical to a roster that
        is empty, and the first is a typo in a date field while the second means
        stop and go fix the data. */}
    {rmode && (
      <div className="no-print" style={{ background: cards.length ? "rgba(255,255,255,.06)" : "rgba(245,176,38,.12)",
             border: "1px solid " + (cards.length ? "rgba(255,255,255,.14)" : "rgba(245,176,38,.4)"),
             borderRadius: 12, padding: "12px 14px", marginBottom: 22, maxWidth: 760 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: cards.length ? "#eef2fb" : "#ffce54" }}>
          {cards.length
            ? "Printing " + cards.length + " of " + inCentre.length + (pick ? " in this batch" : "")
            : "Nothing matches this range"}
        </div>
        <p style={{ margin: "5px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "rgba(230,238,255,.72)" }}>
          {rmode === "date" && (dFrom || dTo)
            ? <>Registered {dFrom ? <>from <b>{dFrom}</b></> : "up to"} {dTo ? <>to <b>{dTo}</b></> : dFrom ? "onwards" : ""}.{" "}
                {(() => {
                  /* Named, not hidden. These are the oldest records in the system
                     and a date range cannot speak about them either way. */
                  const undated = inCentre.filter(c => !cardDay(c)).length;
                  return undated ? <><b>{undated}</b> {undated === 1 ? "card has" : "cards have"} no registration date on file and {undated === 1 ? "is" : "are"} left out of any date range — print those with{" "}<em>Whole batch</em> or by picking them.</> : null;
                })()}</>
            : rmode === "number" && (nFrom || nTo)
            ? <>ID numbers {nFrom || "the start"} to {nTo || "the end"} — read off the number printed on the card ({S.idEg}<b>42</b>), not the position in this list, which moves every time somebody registers.</>
            : rmode === "pick"
            ? <>Tick the cards you want below. Useful for a reprint: the eleven that came back creased, not the whole run again.</>
            : <>Choose the dates, numbers or cards on the right. Until then this is the whole batch.</>}
        </p>
        {rmode === "pick" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            {/* Because the list of IDs usually arrives as a message, not as a
                mental note — pasting it beats hunting 200 previews for twelve. */}
            <input value={paste} onChange={e => setPaste(e.target.value)} placeholder="…or paste IDs: NGG/26/0041, NGG/26/0043"
              aria-label="Paste card IDs"
              style={{ flex: "1 1 260px", minWidth: 200 }}/>
            <button onClick={() => {
              /* Matched on the ID or the printed display ID, case- and
                 separator-insensitive, because the list is copied out of a
                 WhatsApp message and will not be tidy. */
              const norm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
              const wanted = paste.split(/[\s,;]+/).map(norm).filter(Boolean);
              if (!wanted.length) { setPasteMsg("Nothing to match."); return; }
              const next = new Set(chosen); const miss = [];
              wanted.forEach(w => {
                const hit = inCentre.find(c => norm(c.displayId) === w || norm(cardId(c)) === w
                  // A bare number matches the sequence, so "41, 43" works.
                  || (/^\d+$/.test(w) && cardSeq(c) === parseInt(w, 10)));
                if (hit) next.add(cardId(hit)); else miss.push(w);
              });
              setChosen(next);
              setPasteMsg(miss.length
                ? (wanted.length - miss.length) + " matched · not in this batch: " + miss.slice(0, 6).join(", ") + (miss.length > 6 ? " +" + (miss.length - 6) : "")
                : wanted.length + " matched.");
            }} className="cs-btn">Add these</button>
            {pasteMsg && <span role="alert" className="mono" style={{ fontSize: 12, color: /not in this batch|Nothing/.test(pasteMsg) ? "#ffce54" : "#6fdc9d" }}>{pasteMsg}</span>}
          </div>
        )}
      </div>
    )}
    {pick === NO_CENTRE && (
      <div className="no-print" style={{ background: "rgba(245,176,38,.12)", border: "1px solid rgba(245,176,38,.4)", borderRadius: 12, padding: "12px 14px", marginBottom: 22, maxWidth: 720 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: "#ffce54" }}>{noCentreCount === 1 ? "This card prints" : "These " + noCentreCount + " cards print"} without a centre</div>
        <p style={{ margin: "5px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "rgba(230,238,255,.72)" }}>
          No coloured ring, no code, no band {"—"} nothing on the card says which site the {isVol ? "volunteer belongs to" : "child attends"}. Set the centre in {isVol ? <>Admin {"→"} Volunteers {"→"} Roster {"→"} Edit</> : <>Admin {"→"} Summer {"→"} the child{"'"}s record</>}, then come back and reprint. Printing them as they are is fine if you mean to; it is only a problem when nobody noticed.
        </p>
      </div>
    )}

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
        <input value={mName} onChange={e => setMName(e.target.value)} className="cs-field" style={{ flex: "1 1 180px" }}
          placeholder={isVol ? "Tier name (Team Lead)" : "Centre name (Ijaiye)"}/>
        <input value={mCode} onChange={e => setMCode(e.target.value.toUpperCase())} className="cs-field" maxLength={4}
          placeholder={isVol ? "CODE (LED)" : "CODE (IJ)"} style={{ width: 110, fontFamily: "var(--font-mono, monospace)" }}/>
        <input type="color" value={mColor} onChange={e => setMColor(e.target.value)} style={{ width: 46, height: 40, border: "none", borderRadius: 10, background: "none", cursor: "pointer" }} aria-label="Card colour"/>
        <button onClick={addUnit} disabled={mName.trim().length < 2 || !mCode.trim()} className="cs-btn is-primary">{isVol ? "Add tier" : "Add centre"}</button>
      </div>
      {/* Say it here, where it is still free to change.
          The card does everything it can with a bad pair — ink chosen from the
          luminance, the code written out in words — but two navies a shade apart
          are two navies a shade apart, and nothing on the artwork makes them
          readable from a doorway. This is the only moment where the fix costs one
          click instead of a reprint, so the collision is named here rather than
          discovered at the guillotine. */}
      {(() => {
        const near = colourNeighbours(mColor, units);
        if (!near.length) return null;
        return (
          <p role="status" style={{ fontSize: 12.5, lineHeight: 1.55, margin: "10px 0 0", color: "#ffd48a" }}>
            <b>That colour is close to {near.map(n => n.name).join(", ")}.</b>{" "}
            {"Two " + (isVol ? "tiers" : "centres") + " that look alike defeat the point of colouring by " + (isVol ? "tier" : "centre") + " — nobody can tell the cards apart across a room. "}
            Pick something further away if you can.
          </p>
        );
      })()}
      {/* The other thing that is free to fix here and expensive later: a colour
          that NO ink reads on.

          cardInk() picks the better of black and white, and for most colours
          the better one is fine. For a band in the middle it is not: white has
          gone too dark and black has not gone light enough, and both land under
          4.5:1. #D64545 tops out at 4.38 and #4C6FFF at 4.45 — close enough to
          look deliberate on a screen and not close enough to read on a card
          across a hall. The card cannot solve this; only the picker can. */}
      {(() => {
        if (!/^#[0-9a-fA-F]{6}$/.test(mColor) || inkIsLegible(mColor, 4.5)) return null;
        const best = Math.max(inkContrast(mColor, "#ffffff") || 0, inkContrast(mColor, "#10131a") || 0);
        return (
          <p role="status" style={{ fontSize: 12.5, lineHeight: 1.55, margin: "8px 0 0", color: "#ffd48a" }}>
            <b>Nothing reads well on that colour.</b>{" "}
            The best either black or white manages is {best.toFixed(1)}:1, and text needs 4.5:1 to be
            read at arm's length. Nudge it darker or lighter — a small move is usually enough.
          </p>
        );
      })()}
      {msg && <p role="alert" style={{ color: "#ff9a9a", fontSize: 13, margin: "10px 0 0" }}>{msg}</p>}
    </div>

    <div className="no-print" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 16, marginBottom: 30 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.6)", marginBottom: 10 }}>CARD PROPORTION — PRINT SIZE (MM){S.fixedSize ? " · NOT USED BY THIS CARD" : ""}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Width
          <input type="number" min={50} max={60} step={1} disabled={!!S.fixedSize} value={sizeW} onChange={e => setSizeW(e.target.value)}
            className="cs-field" style={{ width: 74, fontFamily: "var(--font-mono, monospace)" }}/>
        </label>
        <span style={{ color: "rgba(230,238,255,.5)" }}>×</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Height
          <input type="number" min={64} max={100} step={1} disabled={!!S.fixedSize} value={sizeH} onChange={e => setSizeH(e.target.value)}
            className="cs-field" style={{ width: 74, fontFamily: "var(--font-mono, monospace)" }}/>
        </label>
        <span style={{ fontSize: 12, color: "rgba(230,238,255,.5)" }}>mm</span>
        {/* Disabled, not merely labelled: a control that cannot affect the
            card in front of you should not accept input. It stays VISIBLE with
            its reason, because an operator who cannot find the size box is
            worse off than one who can see why it is inert. */}
        <button onClick={saveSize} disabled={!!S.fixedSize} className={"cs-btn" + (S.fixedSize ? "" : " is-primary")}>Save size</button>
        {sizeMsg && <span role="alert" className="mono" style={{ fontSize: 12, color: sizeMsg[0] === "S" ? "#6fdc9d" : "#ff9a9a" }}>{sizeMsg}</span>}
      </div>
      <p style={{ color: "rgba(230,238,255,.5)", fontSize: 12, margin: "10px 0 0" }}>{S.fixedSize
        ? "The " + S.noun + " card is fixed at " + cardW + " × " + cardH + "\u00a0mm (ID-1, a wallet slot) and does not follow this setting. It governs the Summer School and volunteer cards."
        : "Default is 54 × 75\u00a0mm. Width 50–60, height 64–100. The card reflows to any proportion without distortion — preview, PNG/PDF export and print all follow."}</p>
    </div>

    {/* Off-screen staging area — one card, only while a run is going. Placed
        off-screen rather than hidden: a display:none element has no layout for
        html2canvas to measure. */}
    <div ref={hostRef} aria-hidden="true" className="no-print"
      style={{ position: "fixed", left: -100000, top: 0, width: 640, opacity: 0, pointerEvents: "none" }}>
      {hostCard && (
        <SafeBlock>
          <div className="card-pair">
            {/* One design per subject, and for members that design already
                exists: NggcMemberCard is what the member downloads from their
                own dashboard and what NggcMemberCardExport prints. Drawing a
                second member card in this file's scaled-pixel idiom would be
                a fork of a shipped design, and the two would drift — so the
                member card is ADAPTED to this contract, not redrawn. */}
            {mode === "members"
              ? <MemberCardStudioFront card={hostCard} S={0.5} H={CANVAS_H}/>
              : <>
                  {isVol ? <VolunteerCardFront card={hostCard} program={program} S={0.5} H={CANVAS_H}/>
                         : <CardFront card={hostCard} program={program} S={0.5} H={CANVAS_H}/>}
                  <CardBack card={hostCard} program={program} S={0.5} H={CANVAS_H}/>
                </>}
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
      {/* In pick mode the preview shows every candidate, because a list that
          removed each card as you ticked it would leave you unable to tick a
          second one. Unpicked pairs are dimmed on screen and dropped from the
          print sheet by `.card-unpicked`. */}
      {!exp && (rmode === "pick" ? inCentre : cards).map((card) => {
        const key = cardId(card);
        const picked = rmode !== "pick" || chosen.has(key);
        return (
        <div key={key} className={"card-pair" + (picked ? "" : " card-unpicked")} style={{ position: "relative", opacity: picked ? 1 : .34 }}>
          {rmode === "pick" && (
            <label className="no-print" title={picked ? "Printing this one" : "Not in this run"}
              style={{ position: "absolute", top: -12, left: -8, zIndex: 3, display: "inline-flex", alignItems: "center", gap: 6,
                       height: 30, padding: "0 12px", borderRadius: 15, cursor: "pointer",
                       background: picked ? gold : "#2f3f6b", color: picked ? "#2b2100" : "#eef2fb",
                       fontWeight: 800, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>
              <input type="checkbox" checked={picked} aria-label={"Print " + (card.displayId || key)}
                onChange={() => setChosen(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                style={{ width: 15, height: 15, accentColor: "#2b2100", cursor: "pointer" }}/>
              {picked ? "Printing" : "Skip"}
            </label>
          )}
          <div className="no-print" style={{ position: "absolute", top: -12, right: -8, zIndex: 2, display: "flex", gap: 6 }}>
            <button onClick={() => setEditPhoto(card)} title="Re-crop, adjust or replace this photo"
              className="cs-btn cs-btn-pill">Edit photo</button>
            {/* Only where the subject has somewhere to send it. There is no
                member resend op — a member issues their own card from their
                dashboard — and a button that cannot do anything is worse than
                a missing one, because it claims the feature exists. */}
            {S.resendKind && <button onClick={() => resendId(card)} disabled={!!resending} title={"Resend this ID to the " + S.resendTo + " (email + SMS)"}
              className="cs-btn cs-btn-pill">
              {resending === S.idOf(card) ? "Sending…" : "Resend ID"}
            </button>}
            <button onClick={() => exportPairPng(card)} disabled={!!exp} title="Download this card as PNG (front + back)"
              style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>↓</button>
          </div>
          <SafeBlock fallback={<CardDrawFailed id={card.displayId || card.studentId || card.volunteerId}/>}>
            <div style={{ boxShadow: "0 14px 34px rgba(0,0,0,.35)", borderRadius: 6, overflow: "hidden" }}>{mode === "members"
              ? <MemberCardStudioFront card={card} S={0.5} H={CANVAS_H}/>
              : isVol ? <VolunteerCardFront card={card} program={program} S={0.5} H={CANVAS_H}/>
                      : <CardFront card={card} program={program} S={0.5} H={CANVAS_H}/>}</div>
          </SafeBlock>
          <SafeBlock fallback={<CardDrawFailed id={card.displayId || card.studentId || card.volunteerId}/>}>
            {/* No back for members. The member card's reverse is a
                published template (sys-member-back, in the Design Studio),
                not a face this studio draws — and drawing the participant
                back beside a member front would be a plain lie about what
                comes off the printer. */}
            {mode !== "members" && <div style={{ boxShadow: "0 14px 34px rgba(0,0,0,.35)", borderRadius: 6, overflow: "hidden" }}><CardBack card={card} program={program} S={0.5} H={CANVAS_H}/></div>}
          </SafeBlock>
        </div>
        );
      })}
      {!cards.length && <p className="no-print" style={{ color: "rgba(230,238,255,.55)", fontSize: 14 }}>{S.empty}</p>}
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
/* Who is looking. The portal is the same tool for all three, but they arrive
   with different reach and different words for the people in front of them. */
const PORTAL_ROLES = {
  lead:       { eyebrow: "LEAD MENTOR · CENTRE",  they: "students" },
  mentor:     { eyebrow: "MENTOR PORTAL",     they: "students" },
  instructor: { eyebrow: "INSTRUCTOR PORTAL", they: "students in your courses" },
  admin:      { eyebrow: "STAFF · ALL CENTRES", they: "students" },
};

/* ── One child's mentoring record ─────────────────────────────────────────
   The screen a mentor opens with the child in front of them.

   Until now the whole trace of a mentor on a child was a star for today and a
   V3 for this week. Both are scores, both are transient, and neither records a
   conversation — so nothing carried from one week to the next and a mentor
   taking over a class inherited numbers and no context. This is the record:
   what has happened, what was said, and what was agreed.

   Everything here is staff-only. None of it is served to the child's own
   portal, and the server enforces that rather than this file.
   ═══════════════════════════════════════════════════════════════════════ */

const MC_NAVY = "#16223e", MC_GOLD = "#ffce54", MC_CARD = "rgba(255,255,255,.06)";

function MentorChildSheet({ student, onClose, onChanged }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState("record");
  const closeRef = React.useRef(null);

  const load = React.useCallback(() => {
    NGGApi.member.mentorChild(student.studentId)
      .then(r => { setD(r); setErr(""); })
      .catch(e => setErr((e && e.message) || "Could not open that record."));
  }, [student.studentId]);
  React.useEffect(() => { load(); }, [load]);
  // Escape closes, and focus starts on the close control rather than wherever
  // it happened to be behind the sheet.
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    if (closeRef.current) closeRef.current.focus();
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const after = () => { load(); if (onChanged) onChanged(); };

  return (
    <div role="dialog" aria-modal="true" aria-label={"Record for " + student.fullName}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: MC_NAVY, color: "#eef2fb",
               overflowY: "auto", padding: "18px 16px calc(40px + env(safe-area-inset-bottom,0px))" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button ref={closeRef} onClick={onClose}
            style={{ minWidth: 44, minHeight: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,.24)",
                     background: "transparent", color: "#eef2fb", fontSize: 18, cursor: "pointer" }}
            aria-label="Close record">←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{student.fullName}</h2>
            <div style={{ fontSize: 12.5, color: "rgba(230,238,255,.6)" }}>
              {(d && d.subject.centre) || student.centre || ""}
              {d && d.subject.track ? " · " + d.subject.track : ""}
              {d && d.mentor.name ? " · mentor: " + d.mentor.name + (d.mentor.isMine ? " (you)" : "") : " · no mentor assigned"}
            </div>
          </div>
        </div>

        {err && <div role="alert" style={{ background: "rgba(255,90,110,.16)", border: "1px solid rgba(255,90,110,.5)",
                     borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}>{err}</div>}

        {!d ? <div style={{ textAlign: "center", padding: "60px 0" }}><div className="dash-spinner"/></div> : <>
          <McStats d={d}/>
          <McV3 weeks={d.v3}/>

          <div role="tablist" style={{ display: "flex", gap: 4, margin: "22px 0 14px", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
            {[["record", "Conversations (" + d.meetings.length + ")"], ["goals", "Goals (" + d.goals.filter(g => g.status === "open").length + ")"]].map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                style={{ padding: "11px 14px", minHeight: 44, background: "none", border: "none", cursor: "pointer",
                         borderBottom: "2px solid " + (tab === k ? MC_GOLD : "transparent"), marginBottom: -1,
                         color: tab === k ? "#fff" : "rgba(230,238,255,.6)", fontWeight: 700, fontSize: 14, fontFamily: "inherit" }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "record"
            ? <McMeetings d={d} subjectId={student.studentId} busy={busy} setBusy={setBusy} onDone={after} setErr={setErr}/>
            : <McGoals d={d} subjectId={student.studentId} busy={busy} setBusy={setBusy} onDone={after} setErr={setErr}/>}
        </>}
      </div>
    </div>
  );
}

/* A KPI row rather than a chart: three headline numbers with no trend between
   them is a stat row, and a three-bar bar chart of unrelated quantities would
   be inventing a comparison that does not exist. */
function McStats({ d }) {
  const tiles = [
    ["Stars", d.stars.total, "all time"],
    ["Sessions", d.attendance.total, d.attendance.last90 + " in 90 days"],
    ["Last seen", d.attendance.lastSeen || "—", d.attendance.lastSeen ? "" : "never checked in"],
  ];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {tiles.map(([label, value, sub]) => (
        <div key={label} style={{ flex: "1 1 150px", minWidth: 130, background: MC_CARD,
              border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: "12px 14px" }}>
          <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".14em",
                        color: "rgba(230,238,255,.55)", textTransform: "uppercase" }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
          {sub ? <div style={{ fontSize: 11.5, color: "rgba(230,238,255,.5)" }}>{sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/* ── The V3 trend ─────────────────────────────────────────────────────────
   Eight weeks × three measures, each on a fixed 1–5 scale.

   SMALL MULTIPLES, not a grouped or stacked bar. Three series crammed into one
   eight-week strip is unreadable at 360px, and stacking them would make the
   reader compare inner segments across columns — the thing stacked bars are
   worst at. Three separate rows, each direct-labelled, answers both questions a
   mentor actually has: is this going up, and which of the three is weak.

   Because the ROW LABEL carries the identity, colour has no identity job here —
   so there is one colour, and height alone encodes the value. Colouring the
   bars by their own value would double-encode what the height already says.

   AN UNRATED WEEK IS NOT A ZERO. The gaps are the finding: a trend that
   silently drops the weeks nobody rated reads as eight weeks of steady
   attention when it might be three. An unrated week is an empty dashed track;
   a rated 1 is a short solid bar. They cannot be confused. */
function McV3({ weeks }) {
  const rows = [["verbal", "Verbal"], ["vocal", "Vocal"], ["visual", "Visual"]];
  const rated = weeks.filter(w => w.rated).length;
  const shortWeek = (p) => String(p).split("-W")[1] || p;
  return (
    <section style={{ background: MC_CARD, border: "1px solid rgba(255,255,255,.12)",
                      borderRadius: 16, padding: "14px 16px", marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>V3 over eight weeks</h3>
        <span style={{ fontSize: 11.5, color: "rgba(230,238,255,.5)" }}>
          {rated === 0 ? "Not rated in this period" : rated + " of 8 weeks rated · each out of 5"}
        </span>
      </div>

      {rows.map(([key, label]) => (
        <div key={key} style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 8, maxWidth: 420 }}>
          {/* Direct label — identity never rests on colour. */}
          <div style={{ flex: "none", width: 52, fontSize: 11.5, fontWeight: 700,
                        color: "rgba(230,238,255,.72)", paddingBottom: 2 }}>{label}</div>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, height: 46 }}>
            {weeks.map((w) => {
              const v = w.rated ? w[key] : 0;
              return (
                <div key={w.period} tabIndex={0}
                  aria-label={label + ", week " + shortWeek(w.period) + ": " + (w.rated ? v + " out of 5" : "not rated")}
                  title={label + " · week " + shortWeek(w.period) + " · " + (w.rated ? v + "/5" : "not rated")}
                  /* border-box, and a border on BOTH states: the unrated cell
                     is dashed and the rated one is not, and without this they
                     are different heights and the bars hang out of the track. */
                  style={{ flex: 1, minWidth: 0, height: "100%", boxSizing: "border-box",
                           display: "flex", alignItems: "flex-end",
                           // The track shows the 1–5 scale so a short bar reads as
                           // "low", not as "the chart is small".
                           background: w.rated ? "rgba(255,255,255,.05)" : "transparent",
                           border: "1px " + (w.rated ? "solid transparent" : "dashed rgba(255,255,255,.22)"),
                           borderRadius: 3, outlineOffset: 2 }}>
                  {w.rated && (
                    <div style={{ width: "100%", height: (v / 5) * 100 + "%",
                                  // 4px rounded data-end, square at the baseline.
                                  background: MC_GOLD, borderRadius: "4px 4px 0 0" }}/>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 3, marginLeft: 62, marginTop: 2, maxWidth: 420 - 62 }}>
        {weeks.map((w, i) => (
          <div key={w.period} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 9.5,
                 color: "rgba(230,238,255,.4)", fontVariantNumeric: "tabular-nums" }}>
            {/* Every other week, so eight labels do not collide at 360px. */}
            {i % 2 === 0 ? shortWeek(w.period) : " "}
          </div>
        ))}
      </div>

      {/* The table view. Always in the DOM for anyone who cannot read the strip
          at all — a chart with no textual equivalent is a chart some people
          simply do not get. */}
      <table className="sr-only">
        <caption>V3 ratings by week, each out of 5</caption>
        <thead><tr><th>Week</th>{rows.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
        <tbody>
          {weeks.map(w => (
            <tr key={w.period}>
              <th scope="row">{w.period}</th>
              {rows.map(([k]) => <td key={k}>{w.rated ? w[k] : "not rated"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ── Conversations ────────────────────────────────────────────────────── */

function McMeetings({ d, subjectId, busy, setBusy, onDone, setErr }) {
  const [open, setOpen] = React.useState(false);
  const [edit, setEdit] = React.useState(null);
  const del = async (id) => {
    if (!(await dialog.confirm({ title: "Delete this entry?",
      body: "The entry goes. The fact that it existed, and that you removed it, stays in the audit log.",
      cta: "Delete entry", danger: true }))) return;
    setBusy(true);
    NGGApi.member.mentorMeetingDelete(subjectId, id)
      .then(() => onDone()).catch(e => setErr((e && e.message) || "Could not delete that."))
      .then(() => setBusy(false));
  };
  return (
    <>
      {!open && !edit && (
        <button onClick={() => setOpen(true)}
          style={{ width: "100%", padding: "13px 18px", minHeight: 44, borderRadius: 12, border: "1px dashed rgba(255,255,255,.3)",
                   background: "transparent", color: MC_GOLD, fontWeight: 700, fontSize: 14.5, cursor: "pointer", marginBottom: 14 }}>
          + Write up a conversation
        </button>
      )}
      {(open || edit) && <McMeetingForm subjectId={subjectId} kinds={d.kinds} entry={edit}
        onCancel={() => { setOpen(false); setEdit(null); }}
        onSaved={() => { setOpen(false); setEdit(null); onDone(); }} setErr={setErr}/>}

      {!d.meetings.length && !open && (
        <p style={{ color: "rgba(230,238,255,.5)", fontSize: 13.5 }}>
          Nothing written down yet. A star says a child did well; this is where what they actually said goes.
        </p>
      )}

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {d.meetings.map(m => (
          <li key={m.id} style={{ background: MC_CARD, borderRadius: 14, padding: "12px 14px",
                border: "1px solid " + (m.concern ? "rgba(255,150,90,.55)" : "rgba(255,255,255,.12)") }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <b style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{m.metOn}</b>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em",
                             color: "rgba(230,238,255,.55)" }}>{m.kind}</span>
              {/* A concern says so in words as well as in colour — an orange
                  border alone is invisible to a good many readers. */}
              {m.concern && <span style={{ fontSize: 11, fontWeight: 800, color: "#ffb27a" }}>⚑ CONCERN RAISED</span>}
              <span style={{ flex: 1 }}/>
              <span style={{ fontSize: 11.5, color: "rgba(230,238,255,.5)" }}>{m.mentorName || "—"}</span>
            </div>
            {m.discussed ? <p style={{ margin: "0 0 6px", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.discussed}</p> : null}
            {m.agreed ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#a7e8c6", whiteSpace: "pre-wrap" }}>
              <b style={{ fontSize: 11, letterSpacing: ".08em" }}>AGREED </b>{m.agreed}</p> : null}
            {/* Only the author gets these. A lead who disagrees writes their own
                entry — both then stand, which is what a record is for. */}
            {m.mine && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => setEdit(m)} disabled={busy}
                  style={{ padding: "8px 12px", minHeight: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,.24)",
                           background: "transparent", color: "#cdd6ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Edit</button>
                <button onClick={() => del(m.id)} disabled={busy}
                  style={{ padding: "8px 12px", minHeight: 40, borderRadius: 10, border: "1px solid rgba(255,120,140,.4)",
                           background: "transparent", color: "#ff9db0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function McMeetingForm({ subjectId, kinds, entry, onCancel, onSaved, setErr }) {
  const today = new Date().toISOString().slice(0, 10);
  const [metOn, setMetOn] = React.useState((entry && entry.metOn) || today);
  const [kind, setKind] = React.useState((entry && entry.kind) || "one-to-one");
  const [discussed, setDiscussed] = React.useState((entry && entry.discussed) || "");
  const [agreed, setAgreed] = React.useState((entry && entry.agreed) || "");
  const [concern, setConcern] = React.useState(!!(entry && entry.concern));
  const [saving, setSaving] = React.useState(false);
  const field = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11, fontSize: 16,
                  background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.2)", color: "#eef2fb",
                  fontFamily: "inherit", minHeight: 44 };
  const save = (e) => {
    e.preventDefault();
    if (!discussed.trim() && !agreed.trim()) { setErr("Write down what was discussed, or what was agreed."); return; }
    setSaving(true); setErr("");
    NGGApi.member.mentorMeeting(subjectId, { id: (entry && entry.id) || 0, metOn, kind, discussed, agreed, concern })
      .then(() => onSaved())
      .catch(er => { setErr((er && er.message) === "too_long" ? "That is longer than the record will hold — keep it to the essentials."
                                                             : ((er && er.message) || "Could not save that.")); setSaving(false); });
  };
  return (
    <form onSubmit={save} style={{ background: MC_CARD, border: "1px solid rgba(255,255,255,.16)",
          borderRadius: 16, padding: "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 150px" }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
                         color: "rgba(230,238,255,.6)", marginBottom: 4 }}>WHEN IT HAPPENED</span>
          {/* Backdating on purpose: a write-up happens after the conversation,
              and a record that insists otherwise is a false record. */}
          <input type="date" value={metOn} max={today} onChange={e => setMetOn(e.target.value)} style={field}/>
        </label>
        <label style={{ flex: "1 1 150px" }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
                         color: "rgba(230,238,255,.6)", marginBottom: 4 }}>KIND</span>
          <select value={kind} onChange={e => setKind(e.target.value)} style={field}>
            {(kinds || []).map(k => <option key={k} value={k} style={{ color: MC_NAVY }}>{k}</option>)}
          </select>
        </label>
      </div>
      <label>
        <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
                       color: "rgba(230,238,255,.6)", marginBottom: 4 }}>WHAT WAS DISCUSSED</span>
        <textarea value={discussed} onChange={e => setDiscussed(e.target.value)} rows={4}
          placeholder="In their words where you can." style={{ ...field, resize: "vertical" }}/>
      </label>
      <label>
        <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
                       color: "rgba(230,238,255,.6)", marginBottom: 4 }}>WHAT WAS AGREED</span>
        <textarea value={agreed} onChange={e => setAgreed(e.target.value)} rows={2}
          placeholder="Something specific enough to check next time." style={{ ...field, resize: "vertical" }}/>
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "4px 0" }}>
        <input type="checkbox" checked={concern} onChange={e => setConcern(e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 2, accentColor: "#ff9d5c", flex: "none" }}/>
        <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>
          <b>This needs a lead's attention.</b>
          <span style={{ display: "block", color: "rgba(230,238,255,.6)", fontSize: 12.5 }}>
            The lead mentors at this centre are told straight away. Use it whenever you are unsure — that is what it is for.
          </span>
        </span>
      </label>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} disabled={saving}
          style={{ padding: "11px 18px", minHeight: 44, borderRadius: 11, border: "1px solid rgba(255,255,255,.24)",
                   background: "transparent", color: "#cdd6ea", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
        <button type="submit" disabled={saving}
          style={{ padding: "11px 22px", minHeight: 44, borderRadius: 11, border: "none", background: MC_GOLD,
                   color: "#2b2100", fontWeight: 800, cursor: "pointer" }}>{saving ? "Saving…" : (entry ? "Save changes" : "Save")}</button>
      </div>
    </form>
  );
}

/* ── Goals ────────────────────────────────────────────────────────────── */

function McGoals({ d, subjectId, busy, setBusy, onDone, setErr }) {
  const [goal, setGoal] = React.useState("");
  const [dueOn, setDueOn] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const field = { padding: "11px 13px", borderRadius: 11, fontSize: 16, background: "rgba(255,255,255,.07)",
                  border: "1px solid rgba(255,255,255,.2)", color: "#eef2fb", fontFamily: "inherit", minHeight: 44,
                  boxSizing: "border-box" };
  const add = (e) => {
    e.preventDefault();
    if (!goal.trim()) return;
    setSaving(true); setErr("");
    NGGApi.member.mentorGoal(subjectId, { goal, dueOn })
      .then(() => { setGoal(""); setDueOn(""); onDone(); })
      .catch(er => setErr((er && er.message) || "Could not save that."))
      .then(() => setSaving(false));
  };
  const setStatus = (id, status) => {
    setBusy(true);
    NGGApi.member.mentorGoalStatus(subjectId, id, status)
      .then(() => onDone()).catch(er => setErr((er && er.message) || "Could not update that."))
      .then(() => setBusy(false));
  };
  const open = d.goals.filter(g => g.status === "open");
  const closed = d.goals.filter(g => g.status !== "open");
  return (
    <>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input value={goal} onChange={e => setGoal(e.target.value)} maxLength={500}
          placeholder="Something specific, that can be finished" aria-label="The goal"
          style={{ ...field, flex: "1 1 220px", minWidth: 180 }}/>
        <input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)}
          aria-label="Due date (optional)" style={{ ...field, flex: "0 1 160px" }}/>
        <button type="submit" disabled={saving || !goal.trim()}
          style={{ padding: "11px 20px", minHeight: 44, borderRadius: 11, border: "none", background: MC_GOLD,
                   color: "#2b2100", fontWeight: 800, cursor: "pointer", opacity: (saving || !goal.trim()) ? .55 : 1 }}>Add</button>
      </form>

      {!d.goals.length && <p style={{ color: "rgba(230,238,255,.5)", fontSize: 13.5 }}>
        No goals set. One specific thing with a date beats five vague ones.
      </p>}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {open.concat(closed).map(g => (
          <li key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                background: MC_CARD, borderRadius: 13, padding: "11px 14px",
                border: "1px solid " + (g.overdue ? "rgba(255,150,90,.5)" : "rgba(255,255,255,.12)"),
                opacity: g.status === "open" ? 1 : .6 }}>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600,
                            textDecoration: g.status === "done" ? "line-through" : "none" }}>{g.goal}</div>
              <div style={{ fontSize: 11.5, color: "rgba(230,238,255,.5)", fontVariantNumeric: "tabular-nums" }}>
                {g.dueOn ? "due " + g.dueOn : "no date"}
                {/* The word as well as the colour. */}
                {g.overdue ? " · OVERDUE" : ""}
                {g.status !== "open" ? " · " + g.status : ""}
                {g.setByName ? " · " + g.setByName : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              {g.status === "open" ? <>
                <button onClick={() => setStatus(g.id, "done")} disabled={busy}
                  style={{ padding: "8px 12px", minHeight: 40, borderRadius: 10, border: "1px solid #7fd1a6",
                           background: "transparent", color: "#a7e8c6", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✓ Done</button>
                {/* 'Drop' exists so a goal that stopped being the right goal is
                    not cleared by pretending it was achieved. A record where
                    everything is always achieved is a record nobody believes. */}
                <button onClick={() => setStatus(g.id, "dropped")} disabled={busy}
                  style={{ padding: "8px 12px", minHeight: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,.24)",
                           background: "transparent", color: "#cdd6ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Drop</button>
              </> : (
                <button onClick={() => setStatus(g.id, "open")} disabled={busy}
                  style={{ padding: "8px 12px", minHeight: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,.24)",
                           background: "transparent", color: "#cdd6ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Reopen</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── What needs attention ─────────────────────────────────────────────────
   The lead's queue: concerns raised by mentors at this centre, and goals that
   have gone past their date.

   This screen is the reason the concern flag exists. A mentor ticking "this
   needs a lead's attention" sends a notification, but a notification is read
   once and then gone — the standing list of what is outstanding has to live
   somewhere, and this is it.
   ═══════════════════════════════════════════════════════════════════════ */
function MentorAttention({ centre, onOpenChild }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.mentorAttention(centre || "")
      .then(r => { if (alive) { setD(r); setErr(""); } })
      .catch(e => { if (alive) setErr((e && e.message) || "Could not load that."); });
    return () => { alive = false; };
  }, [centre]);

  if (err) return <div role="alert" style={{ background: "rgba(255,90,110,.16)", border: "1px solid rgba(255,90,110,.5)",
                       borderRadius: 12, padding: "10px 14px", fontSize: 14 }}>{err}</div>;
  if (!d) return <div style={{ textAlign: "center", padding: "50px 0" }}><div className="dash-spinner"/></div>;

  const nothing = !d.concerns.length && !d.overdue.length;
  const card = { background: "rgba(255,255,255,.06)", borderRadius: 14, padding: "12px 14px" };
  const open = (id, name) => onOpenChild && onOpenChild({ studentId: id, fullName: name });

  return (
    <>
      {nothing && (
        <p style={{ color: "rgba(230,238,255,.6)", fontSize: 14, lineHeight: 1.6 }}>
          Nothing outstanding. Concerns a mentor raises appear here, along with any goal that has gone past its date.
        </p>
      )}

      {d.concerns.length > 0 && <>
        <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                     color: "rgba(230,238,255,.6)", margin: "0 0 10px" }}>
          Concerns raised ({d.concerns.length})
        </h3>
        <ul style={{ listStyle: "none", margin: "0 0 24px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {d.concerns.map(c => (
            <li key={c.id} style={{ ...card, border: "1px solid rgba(255,150,90,.55)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <button type="button" onClick={() => open(c.subjectId, c.fullName)}
                  style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer",
                           color: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "underline",
                           textDecorationColor: "rgba(255,255,255,.3)", textUnderlineOffset: 3 }}>
                  {c.fullName}
                </button>
                {/* The word, not only the colour. */}
                <span style={{ fontSize: 11, fontWeight: 800, color: "#ffb27a" }}>⚑ CONCERN</span>
                <span style={{ flex: 1 }}/>
                <span style={{ fontSize: 11.5, color: "rgba(230,238,255,.5)", fontVariantNumeric: "tabular-nums" }}>
                  {c.metOn} · {c.mentorName || "—"}
                </span>
              </div>
              {c.discussed ? <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.5 }}>{c.discussed}</p> : null}
              {c.agreed ? <p style={{ margin: 0, fontSize: 13, color: "#a7e8c6" }}>
                <b style={{ fontSize: 10.5, letterSpacing: ".08em" }}>AGREED </b>{c.agreed}</p> : null}
            </li>
          ))}
        </ul>
      </>}

      {d.overdue.length > 0 && <>
        <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                     color: "rgba(230,238,255,.6)", margin: "0 0 10px" }}>
          Goals past their date ({d.overdue.length})
        </h3>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {d.overdue.map(o => (
            <li key={o.id} style={{ ...card, border: "1px solid rgba(255,255,255,.12)",
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontSize: 14.5 }}>{o.goal}</div>
                <div style={{ fontSize: 11.5, color: "rgba(230,238,255,.5)", fontVariantNumeric: "tabular-nums" }}>
                  due {o.dueOn} · OVERDUE{o.setByName ? " · " + o.setByName : ""}
                </div>
              </div>
              <button type="button" onClick={() => open(o.subjectId, o.fullName)}
                style={{ marginLeft: "auto", padding: "9px 14px", minHeight: 44, borderRadius: 10,
                         border: "1px solid rgba(255,255,255,.24)", background: "transparent",
                         color: "#cdd6ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {o.fullName} →
              </button>
            </li>
          ))}
        </ul>
      </>}
    </>
  );
}

function MentorPortal() {
  const auth = (window.useAuth || (() => null))();
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState("loading"); // loading | need-auth | not-mentor | ready | error
  const [sheet, setSheet] = React.useState(null);       // student being starred
  const [v3sheet, setV3sheet] = React.useState(null);   // student getting a V3 rating
  const [picked, setPicked] = React.useState([]);       // bulk selection
  const [query, setQuery] = React.useState("");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  /* Which centre's class is on screen. Only ever set by someone who covers
     more than one — a mentor at a single centre never sees the control. */
  const [centre, setCentre] = React.useState("");
  const [tabState, setTabState] = React.useState("");   // "" = the role's default
  /* "" lets the SERVER decide: my mentees if I have any, the centre otherwise.
     Deciding it here would mean guessing before the roster has loaded. */
  const [scope, setScope] = React.useState("");
  const [childOn, setChildOn] = React.useState(null);  // whose record is open
  const [remarkOn, setRemarkOn] = React.useState(null); // child whose thread is open
  const navy = "#16223e", gold = "#ffce54";
  const load = React.useCallback((c, sc) => {
    setState("loading");
    NGGApi.member.mentorRoster(c || "", sc || "").then(r => { setData(r); setState("ready"); })
      .catch(e => {
        const c2 = e.code || e.message;
        setState(c2 === "unauthorized" ? "need-auth"
               : c2 === "not_a_mentor" ? "not-mentor"
               : c2 === "not_cleared" ? "not-cleared"
               : c2 === "no_centre" ? "no-centre"
               : "error");
      });
  }, []);
  React.useEffect(() => { load(centre, scope); }, [load, centre, scope]);
  React.useEffect(() => { if (state === "need-auth" && auth && auth.isSignedIn) load(centre, scope); }, [auth && auth.isSignedIn]);
  // Switching centre is switching class: a selection carried across would
  // apply an observation to children the mentor is no longer looking at.
  /* Picking a centre also drops back to the centre list. Staying on "my
     mentees" would leave the centre control visibly set to somewhere the list
     on screen does not come from — mentees are scoped by the assignment, not
     by centre. */
  const pickCentre = (c) => { setPicked([]); setQuery(""); setScope("centre"); setCentre(c); };

  const shell = (ch) => (
    <div style={{ minHeight: "100vh", background: navy, color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)", padding: "26px 18px 90px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>{ch}</div>
    </div>
  );
  if (state === "loading") return shell(<div style={{ textAlign: "center", padding: "90px 0" }}><div className="dash-spinner"/></div>);
  /* Two doors, because the people who work here hold two different things.
     Mentors and admins have an account and a password. Instructors and summer
     volunteers hold an ID CARD and no account at all — the modal is
     email-and-password only, so from this page they could not sign in by any
     means. That is the whole of the "can't log in to the mentorship page"
     report: the backend accepted them and there was no door. */
  if (state === "need-auth") return shell(<div style={{ padding: "40px 0 0" }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>MENTOR &amp; INSTRUCTOR PORTAL</div>
      <h1 style={{ fontSize: 24, margin: "6px 0 0", fontWeight: 800 }}>Sign in to see your class</h1>
      <p style={{ color: "rgba(230,238,255,.6)", margin: "8px auto 20px", maxWidth: 420, fontSize: 14 }}>
        Staff and admins sign in with their email. Instructors and volunteers use the ID card they were issued.
      </p>
      <button onClick={() => auth && auth.openSignIn()}
        style={{ padding: "13px 26px", minHeight: 44, borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, cursor: "pointer" }}>
        Sign in with email →
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "26px 0 18px", color: "rgba(230,238,255,.4)", fontSize: 12 }}>
        <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }}/>OR<span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.14)" }}/>
      </div>
    </div>
    {typeof CmStudentSignIn === "function"
      ? <CmStudentSignIn dest="/mentor" roles={["instructor"]}/>
      : <p style={{ color: "rgba(230,238,255,.55)", fontSize: 13.5, textAlign: "center" }}>Card sign-in is on the Community page.</p>}
  </div>);
  /* A centre Ops volunteer whose safeguarding is not cleared, or whose record
     names no centre, is not a stranger and not an error — they are one staff
     action away, and each of these says which one. */
  if (state === "not-cleared") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}>
    <h1 style={{ fontSize: 22 }}>Your safeguarding check isn’t cleared yet</h1>
    <p style={{ color: "rgba(230,238,255,.6)", marginTop: 8, maxWidth: 430, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
      The portal opens once your screening is cleared — the same check required before anyone takes a
      register. Ask your centre coordinator where yours has got to.
    </p>
  </div>);
  if (state === "no-centre") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}>
    <h1 style={{ fontSize: 22 }}>No centre on your record</h1>
    <p style={{ color: "rgba(230,238,255,.6)", marginTop: 8, maxWidth: 430, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
      The portal shows a centre’s children, and yours doesn’t name one yet. A coordinator can add it to
      your volunteer record in the console.
    </p>
  </div>);
  if (state === "not-mentor") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}><h1 style={{ fontSize: 22 }}>This account has no class</h1><p style={{ color: "rgba(230,238,255,.6)", marginTop: 8 }}>The portal opens for mentors, instructors and admin staff. If that's you, make sure you're signed in with the email on your mentor record, or with the ID card issued for your instructor or volunteer role.</p></div>);
  if (state === "error") return shell(<div style={{ textAlign: "center", padding: "70px 0" }}><h1 style={{ fontSize: 20 }}>Couldn't load your class</h1><button onClick={() => load(centre, scope)} style={{ marginTop: 12, padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Retry</button></div>);

  const m = data.mentor || {}, students = data.students || [];
  const done = students.filter(s => s.starredToday).length;
  /* A lead runs a centre rather than a class, and the header is the only
     place that says so — the reach is otherwise indistinguishable from an
     unusually broad mentor. */
  const roleKey = data.rank === "lead" ? "lead" : data.role;
  const role = PORTAL_ROLES[roleKey] ? roleKey : "mentor";
  const roleMeta = PORTAL_ROLES[role];
  const centres = data.centres || [];
  /* The centre switcher. An admin reaches the whole programme, and a roster of
     "the whole programme" truncated to the first 400 names is not a roster —
     so the server asks for one centre and this is where it gets picked. */
  /* MY MENTEES vs THE WHOLE CENTRE.
     `mentor_assignments` has always been written — an admin pairs a child with
     a mentor, and the CHILD's dashboard names them — but nothing on the
     mentor's side ever read it, so the portal showed every active child in the
     centre and the pairing changed nothing about what the mentor saw. This is
     that link. It only appears for someone who actually has mentees; a mentor
     with none is never shown a switch with one empty side. */
  const scopePicker = (data.mineCount > 0) && (
    <div role="group" aria-label="Which children to show"
      style={{ display: "inline-flex", gap: 2, padding: 3, marginBottom: 14, borderRadius: 12,
               background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)" }}>
      {[["mine", "My mentees (" + data.mineCount + ")"], ["centre", "Whole centre"]].map(([k, label]) => {
        const on = (data.scope || "centre") === k;
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => { setPicked([]); setScope(k); }}
            style={{ padding: "9px 14px", minHeight: 44, borderRadius: 10, border: "none", cursor: "pointer",
                     fontFamily: "inherit", fontWeight: 700, fontSize: 13.5,
                     background: on ? gold : "transparent", color: on ? "#2b2100" : "#cdd6ea" }}>
            {label}
          </button>
        );
      })}
    </div>
  );

  const centrePicker = centres.length > 1 && (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      <span style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.6)" }}>CENTRE</span>
      <select value={data.centre || ""} onChange={e => pickCentre(e.target.value)}
        style={{ flex: "1 1 200px", minWidth: 170, minHeight: 44, padding: "10px 12px", borderRadius: 11, fontSize: 15, fontWeight: 600,
                 background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.18)", color: "#eef2fb" }}>
        <option value="">Choose a centre…</option>
        {centres.map(c => <option key={c} value={c} style={{ color: "#16223e" }}>{c}</option>)}
      </select>
    </label>
  );

  if (data.needsCentre) return shell(<>
    <div style={{ marginBottom: 18 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>{roleMeta.eyebrow}</div>
      <h1 style={{ fontSize: 24, margin: "4px 0 0", fontWeight: 800 }}>Pick a centre</h1>
      <p style={{ color: "rgba(230,238,255,.62)", fontSize: 13, margin: "6px 0 0" }}>You cover {centres.length} centres. Choose the one you're standing in.</p>
    </div>
    {centrePicker}
  </>);

  /* Filter + multi-select. A mentor with thirty children in front of them
     needs to find four of them and mark all four in one action; scrolling a
     list of four hundred to tap each one is the reason this data stopped
     being recorded during the session and started being recalled that
     evening. Selection survives filtering, so you can search, tick, clear the
     search, search again, and apply to the lot. */
  const q = (query || "").trim().toLowerCase();
  const shown = q
    ? students.filter(s => (s.fullName || "").toLowerCase().includes(q) || (s.track || "").toLowerCase().includes(q))
    : students;
  const isPicked = (id) => picked.indexOf(id) !== -1;
  const toggle = (id) => setPicked(p => isPicked(id) ? p.filter(x => x !== id) : p.concat([id]));
  // "All" means everything currently visible — the filtered set is the thing
  // the mentor is looking at, so that is what the control should act on.
  const allShownPicked = shown.length > 0 && shown.every(s => isPicked(s.studentId));
  const toggleAllShown = () => setPicked(p => allShownPicked
    ? p.filter(id => !shown.some(s => s.studentId === id))
    : Array.from(new Set(p.concat(shown.map(s => s.studentId)))));

  /* An instructor's home screen is the SESSION, not the roster: they teach one
     course to the same twenty children and the first thing they need is
     today's class, already filled in. A mentor's home is still the roster —
     they cover a centre, not a class. */
  const teachCourses = (data.courses && data.courses.length) ? data.courses : [];
  const canTeach = role === "instructor" || (role === "admin" && teachCourses.length > 0);
  /* The queue is for whoever can act on it across a centre — a lead mentor, or
     an admin. A single mentor's own concerns are already on the records they
     wrote them on; the queue is the CENTRE view, and it is the reason the flag
     exists at all. */
  const canOversee = role === "lead" || role === "admin";

  /* One tab row rather than two. It was rendered only for people who teach, so
     a lead mentor — the person the concern flag exists for — had no way to
     reach anything but the roster. */
  const tabList = (canTeach ? [["session", "Today's session"], ["class", "Stars & notes"], ["skills", "Skills"]]
                            : [["class", "Stars & notes"]])
    .concat(canOversee ? [["attention", "Needs attention"]] : []);

  /* An explicit choice wins, but only if it is a tab this person actually has —
     otherwise switching centre into a role with fewer tabs would leave a
     selection pointing at nothing. */
  const defaultTab = canTeach ? (role === "instructor" ? "session" : "class") : "class";
  const tab = tabList.some(([k]) => k === tabState) ? tabState : defaultTab;

  const tabs = tabList.length > 1 && (
    <div role="tablist" style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
      {tabList.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTabState(k)}
          style={{ padding: "11px 14px", minHeight: 44, background: "none", border: "none", cursor: "pointer",
                   borderBottom: "2px solid " + (tab === k ? gold : "transparent"), marginBottom: -1,
                   color: tab === k ? "#fff" : "rgba(230,238,255,.6)", fontWeight: 700, fontSize: 14, fontFamily: "inherit" }}>
          {label}
        </button>
      ))}
    </div>
  );

  const header = (
    <div style={{ marginBottom: 18 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: gold }}>{roleMeta.eyebrow}</div>
      <h1 style={{ fontSize: 24, margin: "4px 0 0", fontWeight: 800 }}>{m.name || "Your class"}</h1>
      <p style={{ color: "rgba(230,238,255,.62)", fontSize: 13, margin: "6px 0 0" }}>{m.centre || "All centres"}{m.department ? " · " + m.department : ""} · {students.length} student{students.length === 1 ? "" : "s"} · {done} starred today</p>
    </div>
  );

  if (tab === "session") return shell(<>{header}{centrePicker}{tabs}
    <SessionPanel courses={teachCourses} centre={data.centre || m.centre || ""} onRemarks={setRemarkOn}/>
  </>);
  if (tab === "skills") return shell(<>{header}{centrePicker}{tabs}
    <SkillsPanel courses={teachCourses} centre={data.centre || m.centre || ""}/>
  </>);
  if (tab === "attention") return shell(<>{header}{centrePicker}{tabs}
    <MentorAttention centre={data.centre || m.centre || ""} onOpenChild={setChildOn}/>
    {childOn && <MentorChildSheet student={childOn} onClose={() => setChildOn(null)}
                                  onChanged={() => load(centre, scope)}/>}
  </>);

  return shell(<>
    {header}
    {centrePicker}
    {scopePicker}
    {tabs}
    {!students.length && <p style={{ color: "rgba(230,238,255,.55)", fontSize: 14 }}>No {roleMeta.they} here yet.</p>}

    {students.length > 0 && (
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or course…"
          aria-label="Search students"
          style={{ flex: "1 1 200px", minWidth: 160, padding: "11px 14px", borderRadius: 11, fontSize: 15,
                   background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", color: "#eef2fb" }}/>
        <button type="button" onClick={toggleAllShown}
          style={{ padding: "11px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,.22)", background: "transparent", color: "#cdd6ea", fontWeight: 700, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap" }}>
          {allShownPicked ? "Clear" : "Select"} all{q ? " shown" : ""} ({shown.length})
        </button>
      </div>
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: picked.length ? 96 : 0 }}>
      {!shown.length && students.length > 0 && <p style={{ color: "rgba(230,238,255,.5)", fontSize: 13.5 }}>Nobody matches “{query}”.</p>}
      {shown.map(s => (
        /* Three actions plus a checkbox and an avatar do not fit beside a
           name at 390px — the name wrapped mid-word and the buttons collided.
           Let the action group drop to its own line instead of squeezing. */
        <div key={s.studentId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            background: isPicked(s.studentId) ? "rgba(255,206,84,.14)" : "rgba(255,255,255,.06)",
            border: "1px solid " + (isPicked(s.studentId) ? "rgba(255,206,84,.5)" : "rgba(255,255,255,.12)"),
            borderRadius: 14, padding: "10px 14px" }}>
          <input type="checkbox" checked={isPicked(s.studentId)} onChange={() => toggle(s.studentId)}
            aria-label={"Select " + s.fullName}
            style={{ width: 20, height: 20, flex: "none", accentColor: gold, cursor: "pointer" }}/>
          <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", background: "linear-gradient(180deg,#dff0fb,#8fbb3f)", flex: "none" }}>{s.photoUrl ? <img src={s.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }}/> : null}</div>
          {/* The NAME opens the record. It is already the thing a mentor looks
              at, and this row overflowed at 390px with three buttons on it —
              a fourth would have made it worse. */}
          <button type="button" onClick={() => setChildOn(s)}
            aria-label={"Open the record for " + s.fullName}
            style={{ flex: "1 1 120px", minWidth: 0, textAlign: "left", background: "none", border: "none",
                     padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}>
            <div style={{ fontWeight: 700, fontSize: 15, textDecoration: "underline", textDecorationColor: "rgba(255,255,255,.25)", textUnderlineOffset: 3 }}>{s.fullName}</div>
            <div style={{ fontSize: 12, color: "rgba(230,238,255,.55)" }}>{s.track || ""}{s.v3 ? " · V3 " + (s.v3.verbal + s.v3.vocal + s.v3.visual) + "/15" : ""}</div>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto", marginLeft: "auto" }}>
            {s.starredToday
              ? <span title={s.note} style={{ color: gold, fontWeight: 800, fontSize: 16 }}>{"★".repeat(s.starredToday)}</span>
              : <button onClick={() => setSheet(s)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid " + gold, background: "transparent", color: gold, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>★ Stars</button>}
            <button onClick={() => setV3sheet(s)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid " + (s.v3 ? "#7fd1a6" : "rgba(255,255,255,.28)"), background: s.v3 ? "rgba(127,209,166,.14)" : "transparent", color: s.v3 ? "#a7e8c6" : "#cdd6ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{s.v3 ? "V3 ✓" : "V3"}</button>
            {/* The thread. A star is a reward and one a day; this is where the
                things that are not rewards go, and where the mentor reads what
                the instructor saw on Wednesday. */}
            <button onClick={() => setRemarkOn(s)} title={"Notes on " + s.fullName} aria-label={"Notes on " + s.fullName}
              style={{ minWidth: 44, minHeight: 40, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,.28)", background: "transparent", color: "#cdd6ea", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>✎</button>
          </div>
        </div>
      ))}
    </div>
    {picked.length > 0 && (
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 90, padding: "12px 16px calc(12px + env(safe-area-inset-bottom,0px))",
                    background: "rgba(10,17,36,.96)", borderTop: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(8px)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{picked.length} selected</span>
          <button type="button" onClick={() => setPicked([])}
            style={{ background: "none", border: "none", color: "rgba(230,238,255,.6)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5 }}>Clear</button>
          <span style={{ flex: 1 }}/>
          <button type="button" onClick={() => setBulkOpen(true)}
            style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Record for {picked.length} →
          </button>
        </div>
      </div>
    )}
    {bulkOpen && <MentorBulkSheet
      count={picked.length}
      presets={data.presets || []}
      categories={data.categories || []}
      onClose={() => setBulkOpen(false)}
      onDone={(res) => { setBulkOpen(false); setPicked([]); load(centre, scope); return res; }}
      subjectIds={picked}/>}
    {sheet && <MentorStarSheet student={sheet} categories={data.categories || []} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(centre, scope); }}/>}
    {v3sheet && <MentorV3Sheet student={v3sheet} period={data.period} onClose={() => setV3sheet(null)} onDone={() => { setV3sheet(null); load(centre, scope); }}/>}
    {remarkOn && <RemarksSheet student={remarkOn} onClose={() => setRemarkOn(null)}/>}
    {childOn && <MentorChildSheet student={childOn} onClose={() => setChildOn(null)}
                                  onChanged={() => load(centre, scope)}/>}
  </>);
}

/* ── Today's session ─────────────────────────────────────────────────────────
   The instructor's home screen. Two things to fill in — what we covered and
   how the room went — over a register the gate has already answered. Ticking
   twenty children who were all scanned in is work with no information in it,
   so the list starts correct and you touch only the exceptions. */
function SessionPanel({ courses, centre, onRemarks }) {
  const [course, setCourse] = React.useState(courses[0] || "");
  const [d, setD] = React.useState(null);
  const [state, setState] = React.useState("loading");
  const [covered, setCovered] = React.useState("");
  const [room, setRoom] = React.useState(0);
  const [flip, setFlip] = React.useState({});   // studentId → present, only where changed
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState("");
  const [err, setErr] = React.useState("");
  const gold = "#ffce54", green = "#7fd1a6";

  const load = React.useCallback(() => {
    if (!course) { setState("ready"); setD(null); return; }
    setState("loading"); setErr("");
    NGGApi.member.session(course, centre).then(r => {
      setD(r); setState("ready"); setFlip({});
      setCovered((r.log && r.log.covered) || "");
      setRoom((r.log && r.log.roomScore) || 0);
    }).catch(e => { setErr(e.code || e.message); setState("error"); });
  }, [course, centre]);
  React.useEffect(() => { load(); }, [load]);

  if (!courses.length) return <p style={{ color: "rgba(230,238,255,.6)", fontSize: 14 }}>No courses are assigned to you yet — ask an admin to add them to your record.</p>;
  if (state === "loading") return <div style={{ textAlign: "center", padding: "50px 0" }}><div className="dash-spinner"/></div>;
  if (state === "error") return <p style={{ color: "#ff9a9a", fontSize: 14 }}>Couldn't load the class ({err}). <button onClick={load} style={{ background: "none", border: "none", color: gold, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Retry</button></p>;

  const kids = (d && d.students) || [];
  const isHere = (s) => (s.studentId in flip) ? flip[s.studentId] : s.present;
  const here = kids.filter(isHere).length;
  const submit = async () => {
    setBusy(true); setErr(""); setSaved("");
    const markedPresent = [], markedAbsent = [];
    kids.forEach(s => {
      // Only send what differs from the gate's own answer — the log records
      // corrections, not a second copy of the register.
      const want = isHere(s);
      if (want !== s.scanned) (want ? markedPresent : markedAbsent).push(s.studentId);
    });
    try {
      const r = await NGGApi.member.sessionSave({ course, centre, covered: covered.trim(), roomScore: room, markedPresent, markedAbsent });
      setSaved("Filed · " + r.presentCount + " here, " + r.absentCount + " away");
      setBusy(false); load();
    } catch (e) {
      setErr(e.code === "nothing_to_record" ? "Add a line about what you covered, or rate the room."
           : e.code === "not_your_course" ? "That isn't one of your courses."
           : (e.code || e.message));
      setBusy(false);
    }
  };

  return <>
    {courses.length > 1 && (
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.6)" }}>COURSE</span>
        <select value={course} onChange={e => setCourse(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 170, minHeight: 44, padding: "10px 12px", borderRadius: 11, fontSize: 15, fontWeight: 600,
                   background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.18)", color: "#eef2fb" }}>
          {courses.map(c => <option key={c} value={c} style={{ color: "#16223e" }}>{c}</option>)}
        </select>
      </label>
    )}

    <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 14, marginBottom: 14 }}>
      <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.6)", marginBottom: 8 }}>
        {course.toUpperCase()} · {d && d.date}{d && d.log ? " · FILED" : ""}
      </div>
      <textarea value={covered} onChange={e => setCovered(e.target.value)} rows={3} maxLength={1000}
        placeholder="What did you cover today?" aria-label="What did you cover today?"
        style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 15, resize: "vertical", fontFamily: "inherit" }}/>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, color: "rgba(230,238,255,.7)", marginBottom: 6 }}>How did the room go?</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setRoom(room === n ? 0 : n)} aria-label={"Room " + n + " of 5"} aria-pressed={room === n}
              style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "1px solid " + (n <= room ? green : "rgba(255,255,255,.18)"),
                       background: n <= room ? "rgba(127,209,166,.18)" : "transparent",
                       color: n <= room ? "#d7f6e6" : "rgba(230,238,255,.5)", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{n}</button>
          ))}
        </div>
      </div>
    </div>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
      <span style={{ fontWeight: 700, fontSize: 15 }}>Register</span>
      <span style={{ fontSize: 13, color: "rgba(230,238,255,.6)" }}>{here} of {kids.length} here</span>
    </div>
    {!kids.length && <p style={{ color: "rgba(230,238,255,.55)", fontSize: 14 }}>Nobody is enrolled on {course} at {centre} yet.</p>}
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 90 }}>
      {kids.map(s => {
        const on = isHere(s);
        return (
          <div key={s.studentId} style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "8px 12px",
              background: on ? "rgba(127,209,166,.10)" : "rgba(255,255,255,.05)",
              border: "1px solid " + (on ? "rgba(127,209,166,.32)" : "rgba(255,255,255,.12)") }}>
            <button onClick={() => setFlip(f => ({ ...f, [s.studentId]: !on }))} aria-pressed={on} aria-label={(on ? "Mark away: " : "Mark here: ") + s.fullName}
              style={{ minWidth: 74, minHeight: 40, borderRadius: 9, cursor: "pointer", fontWeight: 800, fontSize: 13,
                       border: "1px solid " + (on ? green : "rgba(255,255,255,.24)"),
                       background: on ? "rgba(127,209,166,.2)" : "transparent", color: on ? "#d7f6e6" : "rgba(230,238,255,.6)" }}>
              {on ? "Here" : "Away"}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{s.fullName}</div>
              {/* A scan and a hand correction look identical otherwise, and an
                  instructor should be able to see which one they are trusting. */}
              <div style={{ fontSize: 11.5, color: "rgba(230,238,255,.5)" }}>
                {s.scanned ? "scanned in at the gate" : "no gate scan"}{(s.studentId in flip) ? " · changed by you" : (s.overridden ? " · corrected" : "")}
              </div>
            </div>
            <button onClick={() => onRemarks(s)} aria-label={"Notes on " + s.fullName}
              style={{ minWidth: 44, minHeight: 40, borderRadius: 9, border: "1px solid rgba(255,255,255,.24)", background: "transparent", color: "#cdd6ea", fontSize: 15, cursor: "pointer" }}>✎</button>
          </div>
        );
      })}
    </div>

    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 90, padding: "12px 16px calc(12px + env(safe-area-inset-bottom,0px))",
                  background: "rgba(10,17,36,.96)", borderTop: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(8px)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: err ? "#ff9a9a" : "rgba(230,238,255,.7)", flex: 1, minWidth: 0 }}>{err || saved || (d && d.log ? "Filed — saving again updates it" : "Not filed yet")}</span>
        <button onClick={submit} disabled={busy}
          style={{ padding: "13px 22px", borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: "pointer", minHeight: 44 }}>
          {busy ? "Filing…" : (d && d.log ? "Update" : "File session")}
        </button>
      </div>
    </div>
  </>;
}

/* ── Skills ──────────────────────────────────────────────────────────────────
   Four levels and no numbers. A score out of five invites a ranking between
   children; these say what one child can now do. */
function SkillsPanel({ courses, centre }) {
  const [course, setCourse] = React.useState(courses[0] || "");
  const [d, setD] = React.useState(null);
  const [state, setState] = React.useState("loading");
  const [open, setOpen] = React.useState("");   // studentId whose card is expanded
  const [busy, setBusy] = React.useState("");
  const gold = "#ffce54";
  const LEVEL_COLOR = { 1: "rgba(255,255,255,.16)", 2: "rgba(245,176,38,.35)", 3: "rgba(127,209,166,.4)", 4: "rgba(127,209,166,.75)" };

  const load = React.useCallback(() => {
    if (!course) { setState("ready"); return; }
    setState("loading");
    NGGApi.member.skillsBoard(course, centre).then(r => { setD(r); setState("ready"); }).catch(() => setState("error"));
  }, [course, centre]);
  React.useEffect(() => { load(); }, [load]);

  if (!courses.length) return <p style={{ color: "rgba(230,238,255,.6)", fontSize: 14 }}>No courses are assigned to you yet.</p>;
  if (state === "loading") return <div style={{ textAlign: "center", padding: "50px 0" }}><div className="dash-spinner"/></div>;
  if (state === "error") return <p style={{ color: "#ff9a9a", fontSize: 14 }}>Couldn't load the skills grid. <button onClick={load} style={{ background: "none", border: "none", color: gold, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Retry</button></p>;

  const skills = (d && d.skills) || [];
  const levels = (d && d.levels) || {};
  const mark = async (studentId, skill, level) => {
    setBusy(studentId + "|" + skill);
    try { await NGGApi.member.skillsMark(studentId, course, { [skill]: level }); await load(); }
    catch (_) { /* the grid reloads either way; a failed mark simply stays unset */ }
    setBusy("");
  };

  return <>
    {courses.length > 1 && (
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".16em", color: "rgba(230,238,255,.6)" }}>COURSE</span>
        <select value={course} onChange={e => { setCourse(e.target.value); setOpen(""); }}
          style={{ flex: "1 1 200px", minWidth: 170, minHeight: 44, padding: "10px 12px", borderRadius: 11, fontSize: 15, fontWeight: 600,
                   background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.18)", color: "#eef2fb" }}>
          {courses.map(c => <option key={c} value={c} style={{ color: "#16223e" }}>{c}</option>)}
        </select>
      </label>
    )}
    {!skills.length && <p style={{ color: "rgba(230,238,255,.6)", fontSize: 14 }}>No skills are named for {course} yet — an admin sets them in the Control Room.</p>}
    {skills.length > 0 && (
      <p style={{ color: "rgba(230,238,255,.55)", fontSize: 13, margin: "0 0 12px" }}>
        {skills.length} skills · tap a child, then tap where they are. You can change it any week — the question is what they can do now.
      </p>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24 }}>
      {((d && d.students) || []).map(s => {
        const isOpen = open === s.studentId;
        return (
          <div key={s.studentId} style={{ borderRadius: 14, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }}>
            <button onClick={() => setOpen(isOpen ? "" : s.studentId)} aria-expanded={isOpen}
              style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                       background: "none", border: "none", color: "#eef2fb", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15 }}>{s.fullName}</span>
              <span style={{ fontSize: 12.5, color: s.marked === s.of && s.of > 0 ? "#a7e8c6" : "rgba(230,238,255,.55)" }}>{s.marked}/{s.of}</span>
              <span aria-hidden="true" style={{ color: "rgba(230,238,255,.5)" }}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 14px 14px" }}>
                {skills.map(sk => (
                  <div key={sk} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13.5, marginBottom: 6, color: "rgba(230,238,255,.85)" }}>{sk}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[1, 2, 3, 4].map(n => {
                        const on = (s.marks || {})[sk] === n;
                        return (
                          <button key={n} disabled={busy === s.studentId + "|" + sk} onClick={() => mark(s.studentId, sk, n)} aria-pressed={on}
                            style={{ flex: "1 1 auto", minWidth: 78, minHeight: 40, padding: "8px 10px", borderRadius: 9, cursor: "pointer",
                                     border: "1px solid " + (on ? LEVEL_COLOR[n] : "rgba(255,255,255,.16)"),
                                     background: on ? LEVEL_COLOR[n] : "transparent",
                                     color: on ? "#0d1c14" : "rgba(230,238,255,.65)", fontWeight: on ? 800 : 600, fontSize: 12.5, fontFamily: "inherit" }}>
                            {levels[n]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </>;
}

/* ── The thread on one child ─────────────────────────────────────────────────
   Staff-only. The instructor writes what they saw on Wednesday and the mentor
   reads it before Saturday — that hand-off is the entire point.

   The four kinds are the author's own call. The classifier runs behind them
   and raises the safeguarding flag, which is the one thing nobody should have
   to remember to tick, but it never touches the words. */
const REMARK_KIND_META = {
  progress:        { label: "Progress",       hint: "moved forward on something",       color: "#7fd1a6" },
  strength:        { label: "Strength",       hint: "something they are good at",       color: "#ffce54" },
  concern:         { label: "Concern",        hint: "something that worried you",       color: "#ff9a9a" },
  "parent-worthy": { label: "Tell a parent",  hint: "worth saying at the next pickup",  color: "#b07cff" },
};

function RemarksSheet({ student, onClose }) {
  const [rows, setRows] = React.useState(null);
  const [kind, setKind] = React.useState("progress");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const gold = "#ffce54";
  const load = React.useCallback(() => {
    NGGApi.member.remarks(student.studentId).then(r => setRows(r.remarks || [])).catch(() => setRows([]));
  }, [student.studentId]);
  React.useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr("");
    try { await NGGApi.member.remarkAdd(student.studentId, kind, body.trim()); setBody(""); setBusy(false); load(); }
    catch (e) { setErr(e.code === "not_found" ? "That child isn't in your class." : (e.code || e.message)); setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={"Notes on " + student.fullName}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(4,8,20,.72)", display: "grid", placeItems: "end center" }}>
      <div style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", background: "#101a33", color: "#eef2fb",
                    borderRadius: "18px 18px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom,0px))", border: "1px solid rgba(255,255,255,.14)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 19 }}>Notes · {student.fullName}</h2>
          <button onClick={onClose} aria-label="Close" style={{ minWidth: 44, minHeight: 40, background: "none", border: "none", color: "rgba(230,238,255,.6)", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "rgba(230,238,255,.55)" }}>Seen by their mentor and by admin staff. Never shown to parents or to the child.</p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {Object.keys(REMARK_KIND_META).map(k => {
            const meta = REMARK_KIND_META[k], on = kind === k;
            return (
              <button key={k} onClick={() => setKind(k)} aria-pressed={on} title={meta.hint}
                style={{ minHeight: 40, padding: "9px 13px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                         border: "1px solid " + (on ? meta.color : "rgba(255,255,255,.2)"),
                         background: on ? meta.color : "transparent", color: on ? "#0d1424" : "rgba(230,238,255,.7)",
                         fontWeight: on ? 800 : 600, fontSize: 13 }}>{meta.label}</button>
            );
          })}
        </div>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={1200}
          placeholder={REMARK_KIND_META[kind].hint + "…"} aria-label="Your note"
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 15, resize: "vertical", fontFamily: "inherit" }}/>
        {err && <p role="alert" style={{ color: "#ff9a9a", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
        <button onClick={submit} disabled={busy || !body.trim()}
          style={{ width: "100%", marginTop: 10, padding: "13px", borderRadius: 12, border: "none", minHeight: 44,
                   background: body.trim() ? gold : "rgba(255,255,255,.12)", color: body.trim() ? "#2b2100" : "rgba(230,238,255,.4)",
                   fontWeight: 800, fontSize: 15, cursor: body.trim() ? "pointer" : "default" }}>
          {busy ? "Saving…" : "Add note"}
        </button>

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {rows === null && <div style={{ textAlign: "center", padding: 20 }}><div className="dash-spinner"/></div>}
          {rows && !rows.length && <p style={{ color: "rgba(230,238,255,.5)", fontSize: 13.5 }}>Nothing written about {student.fullName} yet.</p>}
          {(rows || []).map(r => {
            const meta = REMARK_KIND_META[r.kind] || { label: r.kind, color: "rgba(255,255,255,.4)" };
            return (
              <div key={r.remarkId} style={{ borderRadius: 12, padding: "11px 13px", background: "rgba(255,255,255,.05)",
                    borderLeft: "3px solid " + meta.color, border: "1px solid rgba(255,255,255,.1)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 5 }}>
                  <span style={{ fontWeight: 800, fontSize: 12, color: meta.color }}>{meta.label}</span>
                  {/* A flag that only lives in a database column is a flag
                      nobody acts on. It is the first thing on the card. */}
                  {r.safeguarding && (
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                                   background: r.status === "acknowledged" ? "rgba(127,209,166,.2)" : "rgba(255,90,60,.22)",
                                   color: r.status === "acknowledged" ? "#a7e8c6" : "#ffb3a3" }}>
                      {r.status === "acknowledged" ? "✓ seen by admin" : "⚑ safeguarding"}
                    </span>
                  )}
                  <span style={{ flex: 1 }}/>
                  <span style={{ fontSize: 11.5, color: "rgba(230,238,255,.45)" }}>{(r.createdAt || "").slice(0, 10)}</span>
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{r.body}</div>
                <div style={{ fontSize: 11.5, color: "rgba(230,238,255,.45)", marginTop: 6 }}>
                  {r.authorName}{r.authorRole ? " · " + r.authorRole : ""}{r.course ? " · " + r.course : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Bulk record sheet ───────────────────────────────────────────────────────
   One observation, many children. Two ways in:

   PRESETS are one tap and carry their own stars, category and severity — the
   preset IS the classification, so there is no AI round trip, nothing to wait
   for on a bad connection, and every mentor files the same behaviour the same
   way. That last part is what makes the data comparable across centres.

   FREE TEXT is for everything a preset cannot say, and goes through the
   server's classifier (AI when it is on, deterministic rules when it is not).

   The result is reported per child, because partial success is the normal
   case: some of a selection will already have been starred today by another
   mentor. Failing the whole batch and leaving the mentor to guess what landed
   would be worse than useless. */
function MentorBulkSheet({ count, subjectIds, presets, categories, onClose, onDone }) {
  const [preset, setPreset] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [stars, setStars] = React.useState(null);   // null = take it from the preset
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [result, setResult] = React.useState(null);
  const gold = "#ffce54", green = "#7fd1a6";

  const effStars = stars != null ? stars : (preset ? preset.stars : 0);
  const canSend = !!preset || note.trim().length >= 5;

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const opts = {};
      if (preset) opts.presetId = preset.id;
      if (stars != null) opts.stars = stars;
      if (note.trim()) opts.note = note.trim();
      const r = await NGGApi.member.bulkAward(subjectIds, opts);
      setResult(r);
    } catch (e) {
      setErr(e.code === "too_many_subjects" ? "That is too many at once — select fewer."
        : e.code === "nothing_to_record" ? "Pick a preset or write a note first."
        : (e.code || e.message));
      setBusy(false);
    }
  };

  const chip = (on) => ({
    display: "flex", alignItems: "center", gap: 7, padding: "10px 13px", borderRadius: 11, cursor: "pointer",
    fontSize: 13.5, fontWeight: 700, textAlign: "left",
    border: "1.5px solid " + (on ? gold : "rgba(255,255,255,.18)"),
    background: on ? "rgba(255,206,84,.16)" : "rgba(255,255,255,.05)",
    color: on ? gold : "#cdd6ea",
  });

  return (
    <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(4,8,20,.72)", display: "grid", placeItems: "end center" }}>
      <div style={{ width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: "#101a33", color: "#eef2fb",
                    borderRadius: "18px 18px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom,0px))", border: "1px solid rgba(255,255,255,.14)" }}>

        {result ? (
          <>
            <h2 style={{ margin: "0 0 10px", fontSize: 19 }}>Recorded</h2>
            <p style={{ color: "rgba(230,238,255,.72)", fontSize: 14, lineHeight: 1.6, margin: "0 0 14px" }}>
              {result.awarded > 0 && <><b style={{ color: gold }}>{result.awarded}</b> starred. </>}
              {result.logged > 0 && <><b style={{ color: green }}>{result.logged}</b> observation{result.logged === 1 ? "" : "s"} logged. </>}
              {result.skipped > 0 && <><b style={{ color: "#ffb0b0" }}>{result.skipped}</b> skipped.</>}
            </p>
            {/* Naming the skips matters: "already starred today" is somebody
                else having got there first, not a failure to fix. */}
            {result.skipped > 0 && (
              <ul style={{ margin: "0 0 16px", padding: "0 0 0 18px", color: "rgba(230,238,255,.55)", fontSize: 12.5, lineHeight: 1.6 }}>
                {(result.results || []).filter(r => !r.ok).slice(0, 8).map((r, i) => (
                  <li key={i}>{r.subjectId} — {r.error === "already_starred_today" ? "already starred today" : r.error === "not_your_centre" ? "not in your class" : r.error}</li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => onDone(result)}
              style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: gold, color: "#2b2100", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Done</button>
          </>
        ) : (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: 19 }}>Record for {count} student{count === 1 ? "" : "s"}</h2>
            <p style={{ color: "rgba(230,238,255,.55)", fontSize: 13, margin: "0 0 14px" }}>Tap what happened. One tap covers all {count}.</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8, marginBottom: 16 }}>
              {presets.map(pr => (
                <button key={pr.id} type="button" onClick={() => { setPreset(preset && preset.id === pr.id ? null : pr); setStars(null); }}
                  style={chip(!!preset && preset.id === pr.id)}>
                  <span aria-hidden="true" style={{ fontSize: 16 }}>{pr.icon || "•"}</span>
                  <span style={{ flex: 1 }}>{pr.label}</span>
                  {pr.stars > 0 && <span style={{ opacity: .85 }}>{"★".repeat(pr.stars)}</span>}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(230,238,255,.6)", marginBottom: 6 }}>
                Stars {preset && stars == null ? "(from the preset)" : ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {[0, 1, 2, 3].map(n => (
                  <button key={n} type="button" onClick={() => setStars(n)}
                    style={{ ...chip(effStars === n), justifyContent: "center", flex: 1, padding: "10px 6px" }}>
                    {n === 0 ? "None" : "★".repeat(n)}
                  </button>
                ))}
              </div>
            </div>

            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(230,238,255,.6)", marginBottom: 6 }}>
              Note {preset ? "(optional)" : "(or write what happened — we file it for you)"}
            </span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={300}
              placeholder={preset ? preset.label : "e.g. Worked well together on the group build"}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 15, resize: "vertical", fontFamily: "inherit",
                       background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.16)", color: "#eef2fb" }}/>

            {err && <p role="alert" style={{ color: "#ffb0b0", fontSize: 13.5, margin: "10px 0 0" }}>{err}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={onClose} disabled={busy}
                style={{ flex: "0 0 auto", padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,.22)", background: "transparent", color: "#cdd6ea", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={submit} disabled={busy || !canSend}
                style={{ flex: 1, padding: 14, borderRadius: 12, border: "none", cursor: canSend ? "pointer" : "default", fontWeight: 800, fontSize: 15,
                         background: canSend ? gold : "rgba(255,255,255,.12)", color: canSend ? "#2b2100" : "rgba(230,238,255,.4)" }}>
                {busy ? "Recording…" : "Record for " + count}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
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
        {err && <p role="alert" style={{ color: "#ff9a9a", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
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
        {err && <p role="alert" style={{ color: "#ff9a9a", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
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
        <LI><b>Summer School participants &amp; members (children):</b> name, age, school, course/centre, a website headshot, and program work (attendance, missions, journal reflections).</LI>
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
      <P>No child is enrolled until a parent or guardian has granted consent. This page is the full wording behind that decision — it is what the single tick on our online registration form refers to, and what the confirmation link sent to a parent asks for.</P>
      <H>The consents we ask for</H>
      <UL>
        <LI><b>Participation</b> — required. Permission for the child to take part in the programme.</LI>
        <LI><b>Medical &amp; emergency care</b> — required. Basic first aid and seeking care in an emergency where you can't be reached.</LI>
        <LI><b>Data processing</b> — required. Holding the child's registration data as described in the Privacy Notice.</LI>
        <LI><b>Trips</b> — off-site programme activities.</LI>
        <LI><b>Communications</b> — programme updates to your contact channel.</LI>
        <LI><b>Photos &amp; media</b> — <b>optional, and separate</b>. Using photographs or video of the child in programme media.</LI>
        <LI><b>Feature on our website</b> — <b>optional, and separate</b>. Showing the child's name and picture on this site.</LI>
      </UL>
      <P>The last two are asked on their own, and either answer is accepted. We will not make a child's place depend on permission to publish their photograph: a consent you cannot refuse without losing something is not a consent, and we would rather have an honest no than a worthless yes. Any consent can be withdrawn later by contacting us, and withdrawing publication permission means we stop using the images going forward.</P>
      <H>How we know it is really you</H>
      <P>There are two routes in, and which one applies depends on who filled the form.</P>
      <UL>
        <LI><b>A parent or guardian registers online.</b> You read this wording and consent on the form itself, identified by the contact details you give us. Nothing further is emailed to you to sign — you have already given the consent, and asking twice would only delay the place. A coordinator still checks every submission before it is confirmed.</LI>
        <LI><b>Our staff register a child at a desk.</b> A volunteer typing your answers cannot consent on your behalf, so we send a private confirmation link to the parent contact on file (email and/or SMS). Only someone with that link can complete it.</LI>
      </UL>
      <P>Either way the record notes what was granted, how it was given, and when.</P>
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

Object.assign(window, { MediaPage, ParentsPage, VolunteersPage, VolunteerRegisterPage, JoinPage, ContactPage, MentorsPage, SummerProfilePage, InstructorRoster, CertificatePage, LegalPage, FAQList, MentorApplySection, MediaModal, CirclePortal, ParentVerifyPage, GatePage, CardStudio, MentorPortal, SelfRegisterPage, ReviewDeskPage, CardFront, VolunteerCardFront, CardBack,
  /* Pure helpers, exported so the card rules can be tested as rules rather than
     inferred from pixels. Both of these shipped with a bug that a rendering
     assertion had actually LOCKED IN — the long-name test asserted the shrunk
     size was smaller, which it was, because the formula was wrong. */
  cardColorsClash, centreBandFont, cardFit, footBandFit, colourNeighbours, cardInk });
