/* ================================================================
   NGG — Anchor 12 dashboard + Member Profile
   ================================================================ */

/* =================== ANCHOR 12 — cinematic rebuild =================== */
function AnchorPage({ setPage }) {
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  const [live, setLive] = React.useState(null);

  React.useEffect(() => {
    if (!auth.isSignedIn) return;
    NGGApi.member.dashboard()
      .then(d => setLive({
        week: (d.session && d.session.weekOf) || 1,
        session: d.session,
        name: d.member.fullName,
        totalWeeks: (d.session && d.session.totalWeeks) || 12,
        xp: d.stats.xp,
        completed: d.stats.completedThisSession,
      }))
      .catch(() => {});
  }, [auth.isSignedIn]);

  return (
    <div className="page anchor-v2" data-screen-label="04 Anchor 12">
      <AnchorMemberBanner auth={auth} live={live} setPage={setPage}/>
      <AnchorHero setPage={setPage}/>
      <AnchorManifesto/>
      <AnchorBookSpread setPage={setPage}/>
      <AnchorWeeksMap live={live}/>
      <AnchorWeekDeepDive/>
      <AnchorStories/>
      <AnchorProof/>
      <AnchorCta setPage={setPage} auth={auth}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// IMAGE PLACEHOLDER — drop a real <img> in here when book photos arrive.
// All `<BookImage slot="..."/>` are search-replaceable.
// ─────────────────────────────────────────────────────────────────────────

function BookImage({ slot, ratio = "4/5", label, dark = false, src, alt }) {
  if (src) {
    return (
      <div className="anch-img" style={{aspectRatio: ratio}}>
        <img src={src} alt={alt || label || slot} loading="lazy" decoding="async"/>
      </div>
    );
  }
  return (
    <div className={"anch-img anch-img-placeholder" + (dark ? " is-dark" : "")} style={{aspectRatio: ratio}}>
      <div className="anch-img-grid" aria-hidden="true"/>
      <div className="anch-img-meta">
        <div className="mono anch-img-slot">{slot}</div>
        <div className="anch-img-label">{label || "Book photo"}</div>
      </div>
      <div className="anch-img-cross" aria-hidden="true">
        <span/><span/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1 · HERO — cinematic opening with the book as co-star
// ─────────────────────────────────────────────────────────────────────────

function AnchorHero({ setPage }) {
  return (
    <section className="anch-hero">
      <div className="anch-hero-bg" aria-hidden="true">
        <div className="anch-hero-bg-grad"/>
        <div className="anch-hero-bg-glow"/>
      </div>
      <div className="container anch-hero-inner">
        <div className="anch-hero-text">
          <div className="mono anch-hero-eyebrow reveal" data-reveal>THE FLAGSHIP EXPERIENCE · A 12-WEEK BUILD</div>
          <h1 className="anch-hero-h1">
            <Kinetic as="span" text="Twelve weeks." by="word"/><br/>
            <span className="anch-hero-h1-em">
              <Kinetic as="span" text="One Anchor." by="word" delay={280}/>
            </span><br/>
            <Kinetic as="span" text="A generation" by="word" delay={520}/><br/>
            <Kinetic as="span" text="built on purpose." by="word" delay={760}/>
          </h1>
          <p className="anch-hero-p reveal" data-reveal style={{"--reveal-delay":"600ms"}}>
            Anchor 12 is the heart of NGG. Every member walks the same twelve weeks —
            structured missions from <em>The Anchor</em>, weekly mentor sessions at
            Egbeda or Ayobo, and a record of every promise kept.
          </p>
          <div className="anch-hero-ctas reveal" data-reveal style={{"--reveal-delay":"800ms"}}>
            <Magnetic strength={10}>
              <button className="btn btn-gold btn-lg" onClick={() => setPage("book")}>
                Read the Anchor book →
              </button>
            </Magnetic>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("join")}>
              Apply for the next session
            </button>
          </div>
          <div className="anch-hero-meta reveal" data-reveal style={{"--reveal-delay":"1000ms"}}>
            <div>
              <div className="mono anch-hero-meta-l">PUBLISHED IN</div>
              <div className="anch-hero-meta-v">Lagos · 2024</div>
            </div>
            <div>
              <div className="mono anch-hero-meta-l">CHAPTERS</div>
              <div className="anch-hero-meta-v">12</div>
            </div>
            <div>
              <div className="mono anch-hero-meta-l">FOR AGES</div>
              <div className="anch-hero-meta-v">10 – 17</div>
            </div>
          </div>
        </div>
        <div className="anch-hero-art">
          <BookImage slot="HERO-01" ratio="3/4" label="The Anchor — front cover" dark/>
          <div className="anch-hero-art-shadow" aria-hidden="true"/>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2 · MANIFESTO — three pillars, restrained, editorial
// ─────────────────────────────────────────────────────────────────────────

const PILLARS = [
  { n: "01", verb: "Identity",   line: "Define who you are before others define you.",      detail: "Weeks 1 – 4. You will write the line you stand on. You will rehearse it until it stops sounding strange in your own mouth." },
  { n: "02", verb: "Discipline", line: "The promises you keep when nobody is watching.",    detail: "Weeks 5 – 8. Daily structure. Reading, reflection, movement, mentor check-in. The streak is the point." },
  { n: "03", verb: "Influence",  line: "Build a room. Bring people who weren't invited.",   detail: "Weeks 9 – 12. Public work, in front of real audiences. Showcase your craft. Earn a Vanguard pin." },
];

function AnchorManifesto() {
  return (
    <section className="anch-section anch-manifesto">
      <div className="container">
        <div className="anch-section-head reveal" data-reveal>
          <div className="mono anch-section-eyebrow">THE ARC</div>
          <h2 className="anch-section-h">Three movements,<br/>twelve weeks, one runway.</h2>
        </div>
        <ol className="anch-pillars">
          {PILLARS.map((p, i) => (
            <li key={p.n} className="anch-pillar reveal" data-reveal style={{"--reveal-delay": (i * 120) + "ms"}}>
              <span className="anch-pillar-n">{p.n}</span>
              <div className="anch-pillar-body">
                <h3 className="anch-pillar-verb">{p.verb}.</h3>
                <p className="anch-pillar-line">{p.line}</p>
                <p className="anch-pillar-detail">{p.detail}</p>
              </div>
              <span className="anch-pillar-tick" aria-hidden="true"/>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3 · THE BOOK — editorial spread, multiple image slots
// ─────────────────────────────────────────────────────────────────────────

function AnchorBookSpread({ setPage }) {
  return (
    <section className="anch-section anch-book">
      <div className="container">
        <div className="anch-book-grid">
          <div className="anch-book-art reveal" data-reveal>
            <BookImage slot="BOOK-01" ratio="3/4" label="The Anchor — front cover"/>
            <div className="anch-book-art-stack">
              <BookImage slot="BOOK-02" ratio="3/4" label="Stacked spines"/>
            </div>
          </div>
          <div className="anch-book-copy reveal" data-reveal style={{"--reveal-delay":"160ms"}}>
            <div className="mono anch-section-eyebrow">THE FIELD MANUAL</div>
            <h2 className="anch-section-h">Every mission lives <em>inside the book.</em></h2>
            <p className="anch-book-lede">
              The Anchor is the printed companion to the program. Twelve chapters,
              one per week. Read the chapter, then run the missions in your
              dashboard. The work is the point.
            </p>
            <ul className="anch-book-list">
              <li><span/>Read the chapter on Saturday at your centre.</li>
              <li><span/>Run the missions Monday – Friday.</li>
              <li><span/>Verify with your mentor on Saturday.</li>
              <li><span/>Reflect — privately or with the cohort.</li>
            </ul>
            <div className="anch-book-ctas">
              <button className="btn btn-primary btn-lg" onClick={() => setPage("book")}>Open the book page →</button>
              <button className="btn btn-ghost btn-lg" onClick={() => setPage("join")}>Apply for a session</button>
            </div>
          </div>
        </div>
        <div className="anch-book-strip">
          <BookImage slot="BOOK-03" ratio="3/4" label="Sample chapter"/>
          <BookImage slot="BOOK-04" ratio="3/4" label="Mission prompt"/>
          <BookImage slot="BOOK-05" ratio="3/4" label="Reflection page"/>
          <BookImage slot="BOOK-06" ratio="3/4" label="End of week"/>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4 · THE 12 WEEKS — clean two-column map
// ─────────────────────────────────────────────────────────────────────────

function AnchorWeeksMap({ live }) {
  const currentWeek = live ? Math.min(12, live.week) : 0;
  const items = WEEKS.map(w => ({
    n: w.n,
    theme: w.theme,
    verb: w.verb,
    missions: w.missions,
    status: currentWeek === 0
      ? "future"
      : (w.n < currentWeek ? "done" : w.n === currentWeek ? "current" : "future"),
  }));
  const colA = items.slice(0, 6);
  const colB = items.slice(6, 12);
  return (
    <section className="anch-section anch-weeks">
      <div className="container">
        <div className="anch-section-head reveal" data-reveal>
          <div className="mono anch-section-eyebrow">THE 12-WEEK MAP</div>
          <h2 className="anch-section-h">{currentWeek ? <>You are on <span className="anch-current-mark">Week {currentWeek}</span>. Here's where you've been, and where you're going.</> : <>Every week has a theme.<br/>Every theme is a building block.</>}</h2>
        </div>
        <div className="anch-weeks-grid">
          <ul className="anch-weeks-col">
            {colA.map((w, i) => <AnchorWeekRow key={w.n} w={w} idx={i}/>)}
          </ul>
          <ul className="anch-weeks-col">
            {colB.map((w, i) => <AnchorWeekRow key={w.n} w={w} idx={i + 6}/>)}
          </ul>
        </div>
        <div className="anch-weeks-legend reveal" data-reveal>
          <span><span className="anch-pip done"/> Completed</span>
          <span><span className="anch-pip current"/> Active week</span>
          <span><span className="anch-pip future"/> Ahead</span>
        </div>
      </div>
    </section>
  );
}

function AnchorWeekRow({ w, idx }) {
  return (
    <li className={"anch-week-row is-" + w.status + " reveal"} data-reveal style={{"--reveal-delay": (idx * 40) + "ms"}}>
      <div className="anch-week-n">{String(w.n).padStart(2, "0")}</div>
      <div className="anch-week-body">
        <div className="anch-week-theme">{w.theme}</div>
        <div className="anch-week-verb">{w.verb}</div>
      </div>
      <div className="anch-week-side">
        <span className="anch-week-missions">{w.missions} missions</span>
        <span className={"anch-pip " + w.status}/>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 5 · A WEEK INSIDE — editorial deep-dive on one week
// ─────────────────────────────────────────────────────────────────────────

const SAMPLE_WEEK = {
  n: 3,
  theme: "Communication",
  verb: "Be understood. Then be remembered.",
  missions: [
    { id: 1, t: "Record a 90-second voice note that argues a single idea.", type: "Speak", min: 15 },
    { id: 2, t: "Read aloud, in front of someone older, for ten minutes.",  type: "Read",  min: 10 },
    { id: 3, t: "Lead one conversation this week. Don't interrupt once.",   type: "Practice", min: 0 },
    { id: 4, t: "Write the email you've been avoiding. Send it Friday.",    type: "Make", min: 20 },
  ],
  reflection: "Where did your voice carry, and where did it disappear?",
};

function AnchorWeekDeepDive() {
  return (
    <section className="anch-section anch-deep">
      <div className="container">
        <div className="anch-section-head reveal" data-reveal>
          <div className="mono anch-section-eyebrow">A WEEK INSIDE · WK 03</div>
          <h2 className="anch-section-h">What a Monday-to-Saturday looks like.</h2>
        </div>
        <div className="anch-deep-grid">
          <div className="anch-deep-theme reveal" data-reveal>
            <div className="mono anch-deep-week">WEEK 03</div>
            <h3 className="anch-deep-h">{SAMPLE_WEEK.theme}.</h3>
            <p className="anch-deep-verb">"{SAMPLE_WEEK.verb}"</p>
            <div className="anch-deep-stats">
              <div><div className="anch-deep-n">{SAMPLE_WEEK.missions.length}</div><div className="mono anch-deep-l">MISSIONS</div></div>
              <div><div className="anch-deep-n">~3h</div><div className="mono anch-deep-l">YOUR TIME</div></div>
              <div><div className="anch-deep-n">+340</div><div className="mono anch-deep-l">XP MAX</div></div>
            </div>
          </div>
          <ol className="anch-deep-missions">
            {SAMPLE_WEEK.missions.map((m, i) => (
              <li key={m.id} className="anch-deep-mission reveal" data-reveal style={{"--reveal-delay": (i * 80) + "ms"}}>
                <div className="anch-deep-mission-n">M{String(i + 1).padStart(2, "0")}</div>
                <div className="anch-deep-mission-body">
                  <div className="anch-deep-mission-t">{m.t}</div>
                  <div className="mono anch-deep-mission-meta">{m.type.toUpperCase()}{m.min ? " · " + m.min + " MIN" : ""}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="anch-deep-reflect reveal" data-reveal>
          <div className="mono anch-deep-reflect-l">SATURDAY REFLECTION PROMPT</div>
          <p className="anch-deep-reflect-q">"{SAMPLE_WEEK.reflection}"</p>
        </div>
        <div className="anch-deep-photos">
          <BookImage slot="WEEK-01" ratio="3/2" label="Saturday session — Egbeda"/>
          <BookImage slot="WEEK-02" ratio="3/2" label="Mission in the field"/>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 6 · STORIES — three portrait cards
// ─────────────────────────────────────────────────────────────────────────

const STORIES = [
  { id: 1, name: "Adaeze, 15", centre: "Egbeda", track: "Music",          quote: "Week three was the one. I argued one idea in 90 seconds. People stopped scrolling.", badge: "Identity" },
  { id: 2, name: "Tunde, 16",  centre: "Ayobo",  track: "Tech",           quote: "Mentor said: 'submit it Friday'. I sent it. The CTO replied on Monday. NGG made me unembarrassed.", badge: "Influence" },
  { id: 3, name: "Zara, 14",   centre: "Egbeda", track: "Public Speaking", quote: "I read aloud to my grandmother for ten minutes every night. My voice changed.", badge: "Discipline" },
];

function AnchorStories() {
  return (
    <section className="anch-section anch-stories">
      <div className="container">
        <div className="anch-section-head reveal" data-reveal>
          <div className="mono anch-section-eyebrow">FROM THE COHORT</div>
          <h2 className="anch-section-h">Three teenagers.<br/>One Anchor.</h2>
        </div>
        <div className="anch-stories-grid">
          {STORIES.map((s, i) => (
            <article key={s.id} className="anch-story reveal" data-reveal style={{"--reveal-delay": (i * 140) + "ms"}}>
              <BookImage slot={"STORY-0" + (i + 1)} ratio="4/5" label={s.name + " portrait"}/>
              <div className="anch-story-body">
                <div className="anch-story-head">
                  <div className="anch-story-name">{s.name}</div>
                  <div className="mono anch-story-meta">{s.track.toUpperCase()} · {s.centre.toUpperCase()}</div>
                </div>
                <p className="anch-story-q">"{s.quote}"</p>
                <div className="anch-story-badge">
                  <span className="anch-story-badge-dot"/>
                  <span className="mono">{s.badge.toUpperCase()} CHAPTER</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 7 · PROOF — numbers in a wide cinematic band
// ─────────────────────────────────────────────────────────────────────────

function AnchorProof() {
  const [stats, setStats] = React.useState(null);
  const [err, setErr] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    NGGApi.public.stats()
      .then(r => { if (alive) setStats(r.stats || {}); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  // While loading we render the cells with em-dashes so the layout doesn't
  // jump when real numbers arrive. If the upstream is unreachable we hide
  // the section entirely rather than show fake numbers.
  if (err) return null;

  const fmt = (n) => (n === undefined || n === null) ? "—" : new Intl.NumberFormat("en").format(n);
  const cells = stats ? [
    { n: stats.completionRate ? stats.completionRate + "%" : "—", l: "Cohort completion rate" },
    { n: fmt(stats.missionsVerified),                              l: "Anchor missions verified" },
    { n: fmt(stats.activeMembers),                                 l: "Active members today" },
    { n: String(stats.centres || 0).padStart(2, "0"),              l: "Centres · Alimosho, Lagos" },
  ] : [
    { n: "—", l: "Cohort completion rate" },
    { n: "—", l: "Anchor missions verified" },
    { n: "—", l: "Active members today" },
    { n: "—", l: "Centres · Alimosho, Lagos" },
  ];

  return (
    <section className="anch-proof">
      <div className="container">
        <div className="anch-proof-grid" aria-busy={!stats}>
          {cells.map((p, i) => (
            <div key={i} className="anch-proof-cell reveal" data-reveal style={{"--reveal-delay": (i * 100) + "ms"}}>
              <div className="anch-proof-n">{p.n}</div>
              <div className="mono anch-proof-l">{p.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 8 · CTA — final cinematic push
// ─────────────────────────────────────────────────────────────────────────

function AnchorCta({ setPage, auth }) {
  return (
    <section className="anch-cta">
      <div className="container anch-cta-inner">
        <div className="mono anch-cta-eyebrow">YOUR MOVE</div>
        <h2 className="anch-cta-h">
          <Kinetic as="span" text="Twelve weeks" by="word"/><br/>
          <span className="anch-cta-h-em">
            <Kinetic as="span" text="from today." by="word" delay={260}/>
          </span>
        </h2>
        <p className="anch-cta-p">
          Applications close two weeks before each session begins.
          Two centres, four sessions a year, one cohort at a time.
        </p>
        <div className="anch-cta-actions">
          <Magnetic strength={14}>
            <button className="btn btn-gold btn-lg" onClick={() => setPage("join")}>Apply now →</button>
          </Magnetic>
          {auth && auth.isSignedIn ? (
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("dashboard")}>Open my dashboard</button>
          ) : (
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("book")}>Read the book first</button>
          )}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LEGACY — the old in-line dashboard sections below are no longer used by
// the rebuilt AnchorPage above, but the helper components (Stat, MissionRow,
// HabitGrid, ProfilePage) are still referenced elsewhere so they remain.
// ─────────────────────────────────────────────────────────────────────────


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
  // 8 weeks × 7 days = 56 cells. Deterministic so the grid doesn't re-shuffle
  // on every re-render (which used to flash a different "history" each time).
  // A simple LCG seeded from the cell index gives us a stable mock pattern.
  const cells = React.useMemo(() => {
    return Array.from({length: 56}, (_, i) => {
      const r = ((i * 9301 + 49297) % 233280) / 233280;
      const filled = i > 14 && (i % 7 !== 0 || r > 0.3);
      return filled ? (i > 35 ? 1 : 0.55) : 0;
    });
  }, []);
  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(14, 1fr)", gap:4, marginTop:16}} aria-hidden="true">
      {cells.map((intensity, i) => (
        <div key={i} style={{
          aspectRatio:"1/1",
          borderRadius:3,
          background: intensity > 0.7 ? "var(--coral)" : intensity > 0 ? "rgba(255,90,60,0.4)" : "rgba(12,20,50,0.06)"
        }}/>
      ))}
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
