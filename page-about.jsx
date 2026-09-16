/* ================================================================
   NGG — About (/about)

   The public statement of the NGGC 2040 Human Capital Formation &
   Leadership Development Brief.

   Every structure on this page is rendered from formation.jsx, not
   retyped here. That is deliberate: this page and the mentor portal
   and a member's dashboard are all reading the same six goals, four
   divisions and five-rung courage ladder, so the programme can only
   drift in one place — the doctrine file — rather than in four.

   Design: the existing NGG system, not a new one. Cream paper and
   deep navy alternating by section, heavy display type over
   uppercase monospace metadata, gold carrying the 2040 thread and
   coral reserved for the emphatic clause. The brief's 24 sections
   collapse into eleven page sections; the course lists and the
   Rational Leadership Test sit behind disclosures rather than
   becoming four walls of bullets.
   ================================================================ */

/* ---- A numbered doctrine card. The page's most repeated unit: an
        index, a heading, a line of argument, and an optional list. ---- */
function DoctrineCard({ code, title, lead, items, note, accent = "var(--gold-500)", dark = false }) {
  const ink = dark ? "rgba(255,255,255,0.72)" : "var(--ink-500)";
  return (
    <div className={dark ? "card-dark" : "card"} style={{
      padding: 28, display: "flex", flexDirection: "column", gap: 12, height: "100%",
      ...(dark ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" } : null),
    }}>
      {code && <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: accent }}>{code}</div>}
      <h3 style={{
        fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.15, letterSpacing: "-0.02em",
        margin: 0, color: dark ? "white" : "var(--ink-900)",
      }}>{title}</h3>
      {lead && <p style={{ fontSize: 15, lineHeight: 1.55, color: ink, margin: 0 }}>{lead}</p>}
      {items && items.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map(it => (
            <li key={it} style={{
              fontSize: 13, lineHeight: 1.3, padding: "5px 10px", borderRadius: 999,
              background: dark ? "rgba(255,255,255,0.08)" : "var(--cream-100)",
              color: dark ? "rgba(255,255,255,0.88)" : "var(--ink-700)",
            }}>{it}</li>
          ))}
        </ul>
      )}
      {note && (
        <p style={{
          fontSize: 13.5, lineHeight: 1.5, color: ink, margin: "auto 0 0", paddingTop: 10,
          borderTop: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(12,20,50,0.08)",
        }}>{note}</p>
      )}
    </div>
  );
}

/* ---- One of the four divisions. The course list is a disclosure: ten
        courses × four divisions is forty bullets, which reads as a syllabus
        dump and buries the mandate — which is the part that explains why
        the division exists at all. ---- */
function DivisionPanel({ d, open, onToggle }) {
  const panelId = "division-courses-" + d.id;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 4, background: d.accent }} aria-hidden="true" />
      <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden="true" style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center",
            background: "var(--cream-100)", color: "var(--ink-900)", fontSize: 16, fontWeight: 700,
          }}>{d.icon}</span>
          <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--ink-500)" }}>
            DIVISION {d.code}
          </div>
        </div>
        <h3 style={{
          fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.1, letterSpacing: "-0.02em",
          margin: 0, color: "var(--ink-900)",
        }}>{d.name}</h3>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-700)", margin: 0 }}>{d.mandate}</p>

        <button
          className="btn btn-ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          style={{ alignSelf: "flex-start", marginTop: "auto", minHeight: 44 }}
        >
          {open ? "Hide the courses" : `The ${d.courses.length} courses`} <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>

        <div id={panelId} hidden={!open}>
          <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {d.courses.map(c => (
              <li key={c} style={{
                fontSize: 13, lineHeight: 1.3, padding: "5px 10px", borderRadius: 999,
                background: c === "Chess" ? "var(--navy-900)" : "var(--cream-100)",
                color: c === "Chess" ? "white" : "var(--ink-700)",
                fontWeight: c === "Chess" ? 600 : 400,
              }}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---- A question list that opens. Used for the Rational Leadership Test
        and the mentor's weekly review — both are long, both are reference
        material rather than reading, and both lose the section they sit in
        if they are always open. ---- */
function QuestionList({ id, label, questions, numbered = false, dark = false, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const ink = dark ? "rgba(255,255,255,0.82)" : "var(--ink-700)";
  return (
    <div style={{
      border: dark ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(12,20,50,0.1)",
      borderRadius: 16, overflow: "hidden",
      background: dark ? "rgba(255,255,255,0.04)" : "white",
    }}>
      <button
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", minHeight: 44, padding: "18px 22px", background: "none", border: "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          color: dark ? "white" : "var(--ink-900)",
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "-0.01em" }}>{label}</span>
        <span className="mono" style={{ fontSize: 12, letterSpacing: "0.12em", color: dark ? "rgba(255,255,255,0.6)" : "var(--ink-500)", whiteSpace: "nowrap" }}>
          {questions.length} · {open ? "HIDE" : "SHOW"}
        </span>
      </button>
      <ol id={id} hidden={!open} style={{
        margin: 0, padding: "0 22px 20px", listStyle: numbered ? "decimal" : "none",
        display: "flex", flexDirection: "column", gap: 10,
        ...(numbered ? { paddingLeft: 44 } : null),
      }}>
        {questions.map(q => (
          <li key={q} style={{ fontSize: 15, lineHeight: 1.55, color: ink, maxWidth: "64ch" }}>{q}</li>
        ))}
      </ol>
    </div>
  );
}

function AboutPage({ setPage }) {
  const [openDivision, setOpenDivision] = React.useState(NGGC_DIVISIONS[0].id);

  return (
    <div className="page" data-screen-label="About NGGC">

      {/* ═══ HERO — §1 core objective ═══ */}
      <section className="page-hero page-hero-dark" style={{
        background: "var(--navy-900)", color: "white", padding: "72px 0", position: "relative", overflow: "hidden",
      }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle at 78% 18%, rgba(245,176,38,0.18), transparent 58%)",
        }} />
        <div className="container" style={{ position: "relative" }}>
          <span className="chip chip-on-dark"><span className="dot dot-gold" /> NGGC 2040 · FORMATION BRIEF</span>
          <h1 className="display" style={{
            fontSize: "clamp(52px, 7.5vw, 116px)", margin: "20px 0 18px", color: "white", lineHeight: 0.92,
            letterSpacing: "-0.03em", maxWidth: "14ch",
          }}>
            A generation that cannot be <em style={{ fontStyle: "normal", color: "var(--coral)" }}>bought,<br />bent or broken.</em>
          </h1>
          <p style={{
            fontSize: 19, lineHeight: 1.55, color: "rgba(255,255,255,0.8)", maxWidth: "58ch", margin: "0 0 32px",
          }}>
            The Next Generation Genius Club is Afrovanguard's human-capital formation platform — for
            discovering, developing and deploying the potential of African children and teenagers
            into responsible, creative, competent and incorruptible leadership.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button className="btn btn-gold btn-lg" onClick={() => setPage("join")}>Apply for a session →</button>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("club")}>Inside the Club</button>
          </div>

          {/* What it is not. Four negations — the programme is mistaken for
              each of these in turn, so they are stated before anything else. */}
          <div style={{
            marginTop: 44, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.14)",
            display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          }}>
            <span className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)" }}>
              IT IS NOT
            </span>
            {NGGC_IS_NOT.map(n => (
              <span key={n} style={{
                fontSize: 14, padding: "6px 12px", borderRadius: 999,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.7)", textDecoration: "line-through",
                textDecorationColor: "var(--coral)", textDecorationThickness: 2,
              }}>{n}</span>
            ))}
            <span style={{ fontSize: 15, color: "white", fontWeight: 600 }}>— it is a formation system.</span>
          </div>
        </div>
      </section>

      {/* ═══ §1 — talent without its counterweight ═══ */}
      <section className="section" style={{ background: "var(--cream-50)" }}>
        <div className="container">
          <SectionHead
            eyebrow="WHY FORMATION COMES FIRST"
            title="The objective is not to make the child talented. It is to make the child formed."
            sub="A child may enter because they can sing, code, draw, play chess, speak well, solve problems — or simply because they show unusual curiosity. What they leave with is a different thing entirely."
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
            {NGGC_WITHOUT.map(w => (
              <div key={w.have} className="card" style={{ padding: 24 }}>
                <div className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink-900)", letterSpacing: "-0.02em" }}>
                  {w.have}
                </div>
                <div style={{ fontSize: 15, color: "var(--ink-500)", margin: "8px 0 10px", lineHeight: 1.5 }}>
                  without {w.without}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={{ color: "var(--coral)", fontSize: 18 }}>↳</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--coral)", letterSpacing: "-0.01em" }}>
                    {w.becomes}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p style={{
            marginTop: 28, fontSize: 17, lineHeight: 1.6, color: "var(--ink-700)", maxWidth: "62ch",
          }}>
            NGGC therefore develops the whole person. {NGGC_CORE_OBJECTIVE}
          </p>
        </div>
      </section>

      {/* ═══ §2 — Vision 2040 ═══ */}
      <section className="section" style={{ background: "var(--navy-900)", color: "white" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 48, alignItems: "start" }}>
            <div>
              <span className="eyebrow" style={{ color: "var(--gold-400)" }}>VISION 2040</span>
              <div className="display" style={{
                fontSize: "clamp(64px, 9vw, 132px)", lineHeight: 0.9, letterSpacing: "-0.04em",
                color: "var(--gold-500)", margin: "10px 0 4px", fontVariantNumeric: "tabular-nums",
              }}>
                {NGGC_VISION_2040.targetLabel}
              </div>
              <div className="display" style={{ fontSize: "clamp(26px, 3.2vw, 44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "white" }}>
                incorruptible African leaders by {NGGC_VISION_2040.horizon}.
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.75)", marginTop: 20, maxWidth: "50ch" }}>
                {NGGC_VISION_2040.statement}
              </p>
            </div>

            <div>
              <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
                CAPABLE OF BECOMING
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {NGGC_VISION_2040.becoming.map(b => (
                  <li key={b} style={{
                    fontSize: 14, padding: "7px 13px", borderRadius: 999,
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)",
                    color: "rgba(255,255,255,0.9)",
                  }}>{b}</li>
                ))}
              </ul>
              <p style={{
                fontSize: 16, lineHeight: 1.6, color: "white", marginTop: 22, paddingLeft: 16,
                borderLeft: "3px solid var(--gold-500)", maxWidth: "52ch",
              }}>
                {NGGC_VISION_2040.requirement}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §3 — the formation philosophy + the pathway ═══ */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="THE FORMATION MODEL"
            title="Discover. Form. Develop. Deploy. Multiply."
            sub="Five verbs, in order. Each one assumes the one before it has actually happened."
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 44 }}>
            {NGGC_PHILOSOPHY.map(p => (
              <div key={p.verb} className="card" style={{ padding: "22px 20px" }}>
                <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--gold-700)" }}>{p.code}</div>
                <div className="display" style={{ fontSize: 28, letterSpacing: "-0.02em", color: "var(--ink-900)", margin: "8px 0 2px" }}>
                  {p.verb}
                </div>
                <div style={{ fontSize: 15, color: "var(--ink-500)" }}>{p.object}</div>
              </div>
            ))}
          </div>

          {/* The pathway rail — the same five stops the whole movement uses. */}
          <div className="card" style={{ padding: "30px 28px" }}>
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--ink-500)", marginBottom: 20 }}>
              THE PATHWAY
            </div>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 18 }}>
              {NGGC_PATHWAY.map((s, i) => (
                <li key={s.id} style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 14, borderTop: "3px solid " + (i === NGGC_PATHWAY.length - 1 ? "var(--gold-500)" : "var(--cream-200)") }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: "-0.01em", color: "var(--ink-900)" }}>
                    {s.label}
                  </div>
                  <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold-700)" }}>
                    {s.role}
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-500)", margin: 0 }}>{s.note}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ═══ §4 — the six goals ═══ */}
      <section className="section" style={{ background: "var(--cream-50)" }}>
        <div className="container">
          <SectionHead
            eyebrow="THE SIX GOALS"
            title="What the programme is actually for."
            sub="Discover potential. Develop character. Build competence. Develop leaders. Create impact. Build the 2040 pipeline."
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
            {NGGC_GOALS.map(g => (
              <DoctrineCard
                key={g.code}
                code={"GOAL " + g.code}
                title={g.title}
                lead={g.verb + ":"}
                items={g.items}
                note={g.note}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ §5 — the four divisions ═══ */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="THE FOUR PROFESSIONAL DIVISIONS"
            title={`Four mandates, ${NGGC_DIVISIONS.reduce((n, d) => n + d.courses.length, 0)} courses, one compulsory board.`}
            sub="Every member belongs to a division. Chess is compulsory across all four — it is the one course that appears in every list."
          />
          {/* 440px floor, so four cards land as a 2×2 rather than a row of
              three and an orphan; `start` keeps a card with its courses open
              from stretching its neighbours into columns of white space. The
              min() matters: a bare minmax(440px,…) track does not shrink below
              its own floor, so on a 390px phone it pushed the cards off the
              side of the screen. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(440px, 100%), 1fr))", gap: 18, alignItems: "start" }}>
            {NGGC_DIVISIONS.map(d => (
              <DivisionPanel
                key={d.id}
                d={d}
                open={openDivision === d.id}
                onToggle={() => setOpenDivision(cur => cur === d.id ? null : d.id)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ §6 + §12 — chess as a leadership laboratory ═══ */}
      <section className="section" style={{ background: "var(--navy-900)", color: "white" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 48, alignItems: "start" }}>
            <div>
              <span className="eyebrow" style={{ color: "var(--gold-400)" }}>CHESS IS NOT JUST A CLASS</span>
              <h2 className="display" style={{
                fontSize: "clamp(34px, 4.4vw, 62px)", lineHeight: 1, letterSpacing: "-0.03em",
                color: "white", margin: "10px 0 16px", maxWidth: "16ch",
              }}>
                A leadership <span style={{ color: "var(--gold-500)" }}>laboratory</span> with sixty-four squares.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.78)", maxWidth: "50ch" }}>
                The question after a session is never only <em style={{ fontStyle: "normal", color: "rgba(255,255,255,0.5)", textDecoration: "line-through" }}>“{NGGC_CHESS.insufficientQuestion}”</em>
                {" "}— it is the four that follow.
              </p>
              <ol style={{ margin: "18px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {NGGC_CHESS.debrief.map(q => (
                  <li key={q} style={{
                    fontSize: 16, lineHeight: 1.5, color: "white", paddingLeft: 16,
                    borderLeft: "3px solid var(--gold-500)",
                  }}>{q}</li>
                ))}
              </ol>
              <ul style={{ margin: "26px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 7 }}>
                {NGGC_CHESS.teaches.map(t => (
                  <li key={t} style={{
                    fontSize: 13, padding: "5px 11px", borderRadius: 999,
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.85)",
                  }}>{t}</li>
                ))}
              </ul>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* The mirror table — behaviour on the board, named off it. */}
              <div className="card-dark" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", padding: 26 }}>
                <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--gold-400)", marginBottom: 16 }}>
                  ON THE BOARD → IN THE PERSON
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {NGGC_CHESS.mirrors.map(m => (
                    <div key={m.onBoard} style={{
                      display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center",
                      paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.09)",
                    }}>
                      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", lineHeight: 1.4 }}>{m.onBoard}</span>
                      <span aria-hidden="true" style={{ color: "var(--gold-500)" }}>→</span>
                      <span style={{ fontSize: 14, color: "white", lineHeight: 1.4, fontWeight: 600 }}>{m.inLife}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-dark" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", padding: 26 }}>
                <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--gold-400)", marginBottom: 14 }}>
                  THE CHESS DASHBOARD
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {NGGC_CHESS.dashboardFields.map(f => (
                    <li key={f} style={{
                      fontSize: 13, padding: "5px 11px", borderRadius: 999,
                      background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)",
                    }}>{f}</li>
                  ))}
                </ul>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.7)", margin: "16px 0 0" }}>
                  The dashboard goes beyond statistics. A mentor reads it as leadership behaviour,
                  not as a win rate.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §7–9, §19 — the mentor system ═══ */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="THE MENTOR SYSTEM"
            title="Teachers teach subjects. Mentors inspect formation."
            sub={NGGC_MENTOR.distinction.instructor + " " + NGGC_MENTOR.distinction.mentor + " " + NGGC_MENTOR.distinction.example}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 18, marginBottom: 20 }}>
            <DoctrineCard
              code="THE MENTOR ASKS"
              title="Questions an instructor never has to ask."
              items={NGGC_MENTOR.asks}
              accent="var(--coral)"
            />
            <DoctrineCard
              code="MUSING TIME"
              title="Deliberate thinking time, protected."
              lead={NGGC_MUSING.rules.join(" · ") + "."}
              items={NGGC_MUSING.prompts}
              note={"The mentor reviews the quality of the reflection, never the writing. " + NGGC_MUSING.purpose}
            />
            <DoctrineCard
              code="PERSONAL TIMETABLE"
              title="The child learns to run their own week."
              items={NGGC_TIMETABLE.items}
              note={NGGC_TIMETABLE.caution}
            />
          </div>

          {/* The five-rung handover — mentor reminds → child teaches others. */}
          <div className="card" style={{ padding: "26px 28px", marginBottom: 20 }}>
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--ink-500)", marginBottom: 16 }}>
              THE HANDOVER — THIS IS LEADERSHIP FORMATION
            </div>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {NGGC_TIMETABLE.progression.map((step, i) => (
                <React.Fragment key={step}>
                  <li style={{
                    fontSize: 15, fontWeight: i === NGGC_TIMETABLE.progression.length - 1 ? 700 : 400,
                    padding: "9px 15px", borderRadius: 999,
                    background: i === NGGC_TIMETABLE.progression.length - 1 ? "var(--navy-900)" : "var(--cream-100)",
                    color: i === NGGC_TIMETABLE.progression.length - 1 ? "white" : "var(--ink-700)",
                  }}>{step}</li>
                  {i < NGGC_TIMETABLE.progression.length - 1 && (
                    <li aria-hidden="true" style={{ color: "var(--gold-700)", fontSize: 16 }}>→</li>
                  )}
                </React.Fragment>
              ))}
            </ol>
          </div>

          {/* §19 — mentoring is not policing. The boundary, stated plainly. */}
          <div className="card" style={{
            padding: "28px 30px", background: "var(--cream-100)", border: "1px solid var(--cream-200)",
          }}>
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--coral)", marginBottom: 12 }}>
              MENTORING IS NOT POLICING
            </div>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-900)", margin: "0 0 14px", maxWidth: "64ch" }}>
              The mentor is not {NGGC_MENTOR.isNot.slice(0, -1).join(", ")} or {NGGC_MENTOR.isNot.slice(-1)} whose job is to
              catch children doing wrong. The mentor is a formation partner — and combines{" "}
              <strong>{NGGC_MENTOR.is.join(" + ")}</strong>.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {NGGC_MENTOR.says.map(s => (
                <blockquote key={s} style={{
                  margin: 0, padding: "14px 18px", background: "white", borderRadius: 12,
                  borderLeft: "3px solid var(--gold-500)", fontSize: 15, lineHeight: 1.55,
                  color: "var(--ink-700)", fontStyle: "italic",
                }}>“{s}”</blockquote>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <QuestionList
              id="about-weekly-review"
              label="The mentor's weekly review"
              questions={NGGC_WEEKLY_REVIEW}
              numbered
            />
          </div>
        </div>
      </section>

      {/* ═══ §10 — the Anchor Journal ═══ */}
      <section className="section" style={{ background: "var(--cream-50)" }}>
        <div className="container">
          <SectionHead
            eyebrow="THE ANCHOR JOURNAL · WEEKLY"
            title="The evidence of formation, in the member's own hand."
            sub="Nine blocks, one question each. The objective is not to grade writing. It is to develop self-awareness and accountability."
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {NGGC_ANCHOR_JOURNAL.map(b => (
              <div key={b.key} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--gold-700)" }}>{b.label}</div>
                <p style={{ fontSize: 16, lineHeight: 1.5, color: "var(--ink-900)", margin: 0, fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                  {b.q}
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button className="btn btn-primary" onClick={() => setPage("anchor")}>Anchor 12 — the flagship →</button>
            <button className="btn btn-ghost" onClick={() => setPage("book")}>The Anchor book</button>
          </div>
        </div>
      </section>

      {/* ═══ §11 + §13 — community and financial responsibility ═══ */}
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
            <div className="card" style={{ padding: 30 }}>
              <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--gold-700)", marginBottom: 12 }}>
                COMMUNITY PARTICIPATION
              </div>
              <h3 className="display" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 12px", color: "var(--ink-900)" }}>
                NGGC must not produce isolated geniuses.
              </h3>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-700)", margin: "0 0 16px", maxWidth: "56ch" }}>
                {NGGC_COMMUNITY.premise} So mentors monitor participation, and the question a member
                is measured against is a simple one: <strong>{NGGC_COMMUNITY.question}</strong>
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 7 }}>
                {NGGC_COMMUNITY.marks.map(m => (
                  <li key={m} style={{ fontSize: 13, padding: "5px 11px", borderRadius: 999, background: "var(--cream-100)", color: "var(--ink-700)" }}>{m}</li>
                ))}
              </ul>
            </div>

            <div className="card" style={{ padding: 30 }}>
              <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--gold-700)", marginBottom: 12 }}>
                DUES, FINES & FINANCIAL RESPONSIBILITY
              </div>
              <h3 className="display" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.02em", margin: "0 0 12px", color: "var(--ink-900)" }}>
                Money is a resource that requires responsibility.
              </h3>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-700)", margin: "0 0 16px", maxWidth: "56ch" }}>
                {NGGC_FINANCIAL.purpose}
              </p>
              <ul style={{ margin: "0 0 18px", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 7 }}>
                {NGGC_FINANCIAL.obligations.map(o => (
                  <li key={o} style={{ fontSize: 13, padding: "5px 11px", borderRadius: 999, background: "var(--cream-100)", color: "var(--ink-700)" }}>{o}</li>
                ))}
              </ul>
              <div style={{ paddingTop: 16, borderTop: "1px solid rgba(12,20,50,0.08)" }}>
                <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--coral)", marginBottom: 10 }}>
                  WHERE FINES APPLY, ALL OF THIS APPLIES TOO
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {NGGC_FINANCIAL.safeguards.map(s => (
                    <li key={s} style={{
                      fontSize: 13, padding: "5px 11px", borderRadius: 999,
                      background: "white", border: "1px solid var(--cream-200)", color: "var(--ink-700)",
                    }}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §14 — the Courage Index ═══ */}
      <section className="section" style={{ background: "var(--navy-900)", color: "white" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 48, alignItems: "start" }}>
            <div>
              <span className="eyebrow" style={{ color: "var(--gold-400)" }}>THE COURAGE INDEX</span>
              <h2 className="display" style={{
                fontSize: "clamp(34px, 4.4vw, 62px)", lineHeight: 1, letterSpacing: "-0.03em",
                color: "white", margin: "10px 0 16px", maxWidth: "15ch",
              }}>
                One of the most important things we measure.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.78)", maxWidth: "50ch", margin: "0 0 18px" }}>
                Courage is the willingness to do what is right or necessary despite fear, discomfort
                or pressure. The objective is not to create reckless children — it is principled courage.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 26 }}>
                <span className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)" }}>NOT</span>
                {NGGC_COURAGE_IS_NOT.map(n => (
                  <span key={n} style={{
                    fontSize: 14, padding: "6px 12px", borderRadius: 999,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.65)", textDecoration: "line-through",
                    textDecorationColor: "var(--coral)", textDecorationThickness: 2,
                  }}>{n}</span>
                ))}
              </div>

              {/* The 1–5 ladder. Rendered as rungs so the shape of the scale —
                  passive at the bottom, other-directed at the top — is visible
                  before any of the labels are read. */}
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {NGGC_COURAGE_LADDER.map(r => (
                  <li key={r.score} style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.11)",
                  }}>
                    <span className="mono" style={{
                      width: 32, height: 32, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center",
                      background: r.score >= 4 ? "var(--gold-500)" : "rgba(255,255,255,0.1)",
                      color: r.score >= 4 ? "var(--navy-900)" : "rgba(255,255,255,0.8)",
                      fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    }}>{r.score}</span>
                    <span style={{ fontSize: 15, lineHeight: 1.4, color: r.score === 5 ? "white" : "rgba(255,255,255,0.85)", fontWeight: r.score === 5 ? 700 : 400 }}>
                      {r.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
                WHAT A MENTOR SCORES AGAINST
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                {NGGC_COURAGE_PROMPTS.map(q => (
                  <li key={q} style={{
                    fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.86)",
                    paddingLeft: 16, borderLeft: "2px solid rgba(255,255,255,0.18)", maxWidth: "52ch",
                  }}>{q}</li>
                ))}
              </ol>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.62)", marginTop: 20, maxWidth: "52ch" }}>
                A mark is only ever recorded against something observed. The index is built over
                time, entry by entry, and it belongs to the member's formation record — not to a
                league table.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §15–16 — the rational of leadership ═══ */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="THE RATIONAL OF LEADERSHIP"
            title="Why should anyone follow you?"
            sub={NGGC_LEADERSHIP.philosophy}
          />

          <div className="card" style={{ padding: "26px 28px", marginBottom: 20, background: "var(--cream-100)", border: "1px solid var(--cream-200)" }}>
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--coral)", marginBottom: 12 }}>
              ANSWERS THE PROGRAMME DOES NOT ACCEPT
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {NGGC_LEADERSHIP.insufficient.map(a => (
                <li key={a} style={{
                  fontSize: 14, padding: "7px 13px", borderRadius: 999, background: "white",
                  border: "1px solid var(--cream-200)", color: "var(--ink-500)",
                  textDecoration: "line-through", textDecorationColor: "var(--coral)", textDecorationThickness: 2,
                }}>“{a}”</li>
              ))}
            </ul>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14, marginBottom: 20 }}>
            {NGGC_LEADERSHIP.measures.map(m => (
              <div key={m.name} className="card" style={{ padding: 22 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 21, letterSpacing: "-0.01em", color: "var(--ink-900)", marginBottom: 6 }}>
                  {m.name}
                </div>
                <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-500)", margin: 0 }}>{m.test}</p>
              </div>
            ))}
          </div>

          <QuestionList
            id="about-leadership-test"
            label="The Rational Leadership Test"
            questions={NGGC_LEADERSHIP_TEST}
          />
        </div>
      </section>

      {/* ═══ §17 + §20 + §21 — the dashboard, progression, the model ═══ */}
      <section className="section" style={{ background: "var(--cream-50)" }}>
        <div className="container">
          <SectionHead
            eyebrow="HOW FORMATION IS TRACKED"
            title="Every member has a record. Every record has seven parts."
            sub="Progression is evidence of formation, never time served. A member does not become an NGV because they have been around long enough."
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14, marginBottom: 40 }}>
            {NGGC_MEMBER_DASHBOARD.map(g => (
              <div key={g.group} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span aria-hidden="true" style={{
                    width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center",
                    background: "var(--navy-900)", color: "var(--gold-500)", fontSize: 14,
                  }}>{g.icon}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "-0.01em", color: "var(--ink-900)" }}>
                    {g.group}
                  </span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {g.fields.map(f => (
                    <li key={f} style={{ fontSize: 13, padding: "4px 10px", borderRadius: 999, background: "var(--cream-100)", color: "var(--ink-700)" }}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Progression NGG → NGV → Afrovanguard */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginBottom: 40 }}>
            {NGGC_PROGRESSION.map((p, i) => (
              <div key={p.id} className={i === NGGC_PROGRESSION.length - 1 ? "card" : "card"} style={{
                padding: 28, borderTop: "4px solid " + (i === 0 ? "var(--cream-200)" : i === 1 ? "var(--gold-500)" : "var(--coral)"),
              }}>
                <div className="display" style={{ fontSize: 34, letterSpacing: "-0.02em", color: "var(--ink-900)", lineHeight: 1 }}>
                  {p.stage}
                </div>
                <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--ink-700)", margin: "8px 0 14px", fontWeight: 600 }}>
                  {p.headline}
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.learning.map(l => (
                    <li key={l} style={{ fontSize: 13, padding: "4px 10px", borderRadius: 999, background: "var(--cream-100)", color: "var(--ink-700)" }}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* The four-layer model */}
          <div className="card" style={{ padding: "30px 28px" }}>
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--ink-500)", marginBottom: 6 }}>
              THE FOUR-LAYER MODEL
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-500)", margin: "0 0 20px", maxWidth: "62ch" }}>
              This is what prevents NGGC from becoming another place where children attend classes
              and collect certificates.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {NGGC_LAYERS.map(l => (
                <div key={l.n} style={{ paddingTop: 14, borderTop: "3px solid var(--navy-900)" }}>
                  <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--gold-700)" }}>LAYER {l.n}</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "-0.01em", color: "var(--ink-900)", margin: "4px 0 8px" }}>
                    {l.name}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-500)" }}>{l.parts.join(" · ")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §22–23 — the real product and the standard ═══ */}
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 48, alignItems: "start" }}>
            <div>
              <span className="eyebrow" style={{ color: "var(--gold-700)" }}>THE REAL PRODUCT</span>
              <h2 className="display" style={{
                fontSize: "clamp(34px, 4.4vw, 60px)", lineHeight: 1, letterSpacing: "-0.03em",
                margin: "10px 0 18px", color: "var(--ink-900)", maxWidth: "15ch",
              }}>
                {NGGC_REAL_PRODUCT.is}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", marginBottom: 16 }}>
                <span className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--ink-500)" }}>NOT</span>
                {NGGC_REAL_PRODUCT.notThe.map(n => (
                  <span key={n} style={{
                    fontSize: 14, padding: "6px 12px", borderRadius: 999, background: "var(--cream-100)",
                    color: "var(--ink-500)", textDecoration: "line-through",
                    textDecorationColor: "var(--coral)", textDecorationThickness: 2,
                  }}>{n}</span>
                ))}
                <span style={{ fontSize: 14, color: "var(--ink-500)" }}>— those are tools.</span>
              </div>
              <p style={{ fontSize: 19, lineHeight: 1.5, color: "var(--coral)", margin: 0, fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                {NGGC_REAL_PRODUCT.coda}
              </p>
            </div>

            <div className="card" style={{ padding: "30px 32px" }}>
              <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "var(--gold-700)", marginBottom: 18 }}>
                THE NGGC STANDARD
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
                {NGGC_STANDARD.map((line, i) => (
                  <li key={line} style={{
                    fontSize: 16.5, lineHeight: 1.5, padding: "10px 0",
                    color: i >= 10 ? "var(--ink-900)" : "var(--ink-700)",
                    fontWeight: i >= 10 ? 600 : 400,
                    borderTop: i === 0 ? "none" : "1px solid rgba(12,20,50,0.06)",
                  }}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §24 — the 2040 declaration ═══ */}
      <section className="section" style={{ background: "var(--navy-900)", color: "white", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle at 20% 80%, rgba(255,90,60,0.16), transparent 55%)",
        }} />
        <div className="container" style={{ position: "relative" }}>
          <span className="eyebrow" style={{ color: "var(--gold-400)" }}>THE 2040 DECLARATION</span>
          <h2 className="display" style={{
            fontSize: "clamp(36px, 5vw, 76px)", lineHeight: 0.98, letterSpacing: "-0.03em",
            color: "white", margin: "12px 0 20px", maxWidth: "18ch",
          }}>
            Africa needs a generation of <span style={{ color: "var(--gold-500)" }}>formed</span> people.
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "rgba(255,255,255,0.78)", maxWidth: "62ch", margin: "0 0 34px" }}>
            {NGGC_DECLARATION.premise}
          </p>

          <ul style={{
            margin: "0 0 40px", padding: 0, listStyle: "none",
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 12,
          }}>
            {NGGC_DECLARATION.people.map(p => (
              <li key={p} style={{
                fontSize: 15.5, lineHeight: 1.5, color: "rgba(255,255,255,0.88)",
                padding: "14px 18px", borderRadius: 12,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.11)",
              }}>{p}</li>
            ))}
          </ul>

          <div style={{
            paddingTop: 30, borderTop: "1px solid rgba(255,255,255,0.15)",
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32, alignItems: "start",
          }}>
            <div>
              <p style={{ fontSize: 17, lineHeight: 1.5, color: "rgba(255,255,255,0.6)", margin: "0 0 4px", textDecoration: "line-through", textDecorationColor: "var(--coral)" }}>
                {NGGC_DECLARATION.seed.a}
              </p>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px, 2.6vw, 34px)", lineHeight: 1.15, letterSpacing: "-0.02em", color: "white", margin: 0 }}>
                {NGGC_DECLARATION.seed.b}
              </p>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--gold-400)", margin: "16px 0 0", maxWidth: "44ch" }}>
                {NGGC_DECLARATION.assignment}
              </p>
            </div>

            <div>
              <div className="mono" style={{ fontSize: 12, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
                {NGGC_PATHWAY.map(s => s.label).join(" → ")}
              </div>
              <div className="display" style={{
                fontSize: "clamp(40px, 6vw, 82px)", lineHeight: 0.92, letterSpacing: "-0.04em",
                color: "var(--gold-500)", fontVariantNumeric: "tabular-nums",
              }}>
                {NGGC_VISION_2040.targetLabel}
              </div>
              <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {NGGC_DECLARATION.refrain.map(r => (
                  <li key={r} style={{
                    fontFamily: "var(--font-display)", fontSize: "clamp(20px, 2.4vw, 30px)",
                    lineHeight: 1.2, letterSpacing: "-0.02em", color: "white",
                  }}>{r}</li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 40 }}>
            <button className="btn btn-gold btn-lg" onClick={() => setPage("join")}>Apply for a session →</button>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("volunteers")}>Mentor a member</button>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={() => setPage("parents")}>For parents</button>
          </div>
        </div>
      </section>
    </div>
  );
}
