/* ================================================================
   NGG — About (/about)

   The public statement of the NGGC 2040 Human Capital Formation &
   Leadership Development Brief.

   Every structure on this page is rendered from formation.jsx, not
   retyped here. That is deliberate: this page and the mentor portal
   and a member's dashboard are all reading the same six goals, four
   divisions and five-rung courage ladder, so the programme can only
   drift in one place — the doctrine file — rather than in four.

   Chrome is in styles.css under `.ab-*`, per CLAUDE.md §11: an
   inline style cannot be corrected from a stylesheet, so chrome
   written inline is where drift hides — and this page has eleven
   sections repeating the same six units. What stays inline is
   per-element geometry and values that ARE data (a division's own
   brand colour, which a stylesheet cannot know).

   Design: the existing NGG system, not a new one. Cream paper and
   deep navy alternating by section, heavy display type over
   uppercase monospace metadata, gold carrying the 2040 thread and
   coral reserved for the emphatic clause. The brief's 24 sections
   collapse into eleven page sections; the forty-one courses and the
   two long question lists sit behind disclosures rather than
   becoming four walls of bullets.
   ================================================================ */

/* ---- A numbered doctrine card. The page's most repeated unit: an
        index, a heading, a line of argument, and an optional list. ---- */
function DoctrineCard({ code, title, lead, items, note, accent, dark = false }) {
  return (
    <div className={"ab-card " + (dark ? "ab-panel" : "card")}>
      {code && (
        <div className="mono ab-label" style={accent ? { color: accent } : null}>{code}</div>
      )}
      <h3 className="ab-h ab-h-card">{title}</h3>
      {lead && <p className="ab-body">{lead}</p>}
      {items && items.length > 0 && (
        <ul className="ab-pills ab-pills-tight">
          {items.map(it => <li key={it} className="ab-pill">{it}</li>)}
        </ul>
      )}
      {note && <p className="ab-note">{note}</p>}
    </div>
  );
}

/* ---- One of the four divisions. The course list is a disclosure: ten
        courses × four divisions is forty-one bullets, which reads as a
        syllabus dump and buries the mandate — the part that explains why
        the division exists at all. ---- */
function DivisionPanel({ d, open, onToggle }) {
  const panelId = "division-courses-" + d.id;
  return (
    <div className="card ab-div">
      {/* The bar's colour is the division's own — data, not chrome. */}
      <div className="ab-div-bar" style={{ background: d.accent }} aria-hidden="true" />
      <div className="ab-div-body">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="ab-div-icon" aria-hidden="true">{d.icon}</span>
          <div className="mono ab-label ab-label-ink">DIVISION {d.code}</div>
        </div>
        <h3 className="ab-h ab-h-panel">{d.name}</h3>
        <p className="ab-body ab-body-lg">{d.mandate}</p>
        {d.audience && <p className="ab-body ab-div-audience">{d.audience}</p>}

        <button
          className="btn btn-ghost ab-div-more"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {open ? "Hide the courses" : "The " + d.courses.length + " courses"}{" "}
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>

        <div id={panelId} hidden={!open}>
          <ul className="ab-pills ab-pills-tight" style={{ marginTop: 4 }}>
            {d.courses.map(c => (
              <li key={c} className={"ab-pill" + (c === "Chess" ? " ab-pill-chess" : "")}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---- A question list that opens. Used for the Rational Leadership Test
        and the mentor's weekly review — both are long, both are reference
        material rather than reading, and both swamp the section they sit
        in if they are always open. ---- */
function QuestionList({ id, label, questions, numbered = false, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="ab-disc">
      <button className="ab-disc-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span className="ab-disc-h">{label}</span>
        <span className="mono ab-disc-n">{questions.length} · {open ? "HIDE" : "SHOW"}</span>
      </button>
      <ol id={id} hidden={!open} className={"ab-disc-list" + (numbered ? " is-numbered" : "")}>
        {questions.map(q => <li key={q}>{q}</li>)}
      </ol>
    </div>
  );
}

function AboutPage({ setPage }) {
  const [openDivision, setOpenDivision] = React.useState(NGGC_DIVISIONS[0].id);
  const courseCount = NGGC_DIVISIONS.reduce((n, d) => n + d.courses.length, 0);

  return (
    <div className="page" data-screen-label="About NGGC">

      {/* ═══ HERO — §1 core objective ═══ */}
      <section className="page-hero page-hero-dark ab-sec-dark on-dark"
        style={{ padding: "var(--rs-p-48, 72px 0px)", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle at 78% 18%, rgba(245,176,38,0.18), transparent 58%)",
        }} />
        <div className="container" style={{ position: "relative" }}>
          <span className="chip chip-on-dark"><span className="dot dot-gold" /> NGGC 2040 · FORMATION BRIEF</span>
          <h1 className="display" style={{
            fontSize: "var(--rs-fsize-49, clamp(52px, 7.5vw, 116px))", margin: "20px 0 18px", color: "white", lineHeight: "var(--rs-lheight-50, 0.92)",
            letterSpacing: "-0.03em", maxWidth: "14ch",
          }}>
            A generation that cannot be <em style={{ fontStyle: "normal", color: "var(--coral)" }}>bought,<br />bent or broken.</em>
          </h1>
          <p className="ab-body" style={{ fontSize: 19, maxWidth: "58ch", margin: "0 0 32px" }}>
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
            <span className="mono ab-label" style={{ color: "rgba(255,255,255,0.55)" }}>IT IS NOT</span>
            {NGGC_IS_NOT.map(n => <span key={n} className="ab-pill ab-pill-lg ab-pill-no">{n}</span>)}
            <span style={{ fontSize: 15, color: "white", fontWeight: 600 }}>— it is a formation system.</span>
          </div>
        </div>
      </section>

      {/* ═══ §1 — talent without its counterweight ═══ */}
      <section className="section ab-sec-cream">
        <div className="container">
          <SectionHead
            eyebrow="WHY FORMATION COMES FIRST"
            title="The objective is not to make the child talented. It is to make the child formed."
            sub="A child may enter because they can sing, code, draw, play chess, speak well, solve problems — or simply because they show unusual curiosity. What they leave with is a different thing entirely."
          />
          <div className="ab-grid ab-grid-sm">
            {NGGC_WITHOUT.map(w => (
              <div key={w.have} className="card" style={{ padding: 24 }}>
                <div className="display" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--ink-900)", letterSpacing: "-0.02em" }}>
                  {w.have}
                </div>
                <div className="ab-body" style={{ margin: "8px 0 10px" }}>without {w.without}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={{ color: "var(--coral)", fontSize: 18 }}>↳</span>
                  <span className="ab-h" style={{ fontSize: 20, color: "var(--coral)" }}>{w.becomes}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="ab-body ab-body-lg ab-measure" style={{ marginTop: 28, fontSize: 17 }}>
            NGGC therefore develops the whole person. {NGGC_CORE_OBJECTIVE}
          </p>
        </div>
      </section>

      {/* ═══ §2 — Vision 2040 ═══ */}
      <section className="section ab-sec-dark on-dark">
        <div className="container">
          <div className="ab-split">
            <div>
              <span className="eyebrow ab-label">VISION 2040</span>
              <div className="display ab-num" style={{
                fontSize: "var(--rs-fsize-51, clamp(64px, 9vw, 132px))", lineHeight: "var(--rs-lheight-52, 0.9)", letterSpacing: "-0.04em",
                color: "var(--gold-500)", margin: "10px 0 4px",
              }}>
                {NGGC_VISION_2040.targetLabel}
              </div>
              <div className="display" style={{ fontSize: "var(--rs-fsize-53, clamp(26px, 3.2vw, 44px))", lineHeight: "var(--rs-lheight-54, 1.05)", letterSpacing: "-0.02em", color: "white" }}>
                incorruptible African leaders by {NGGC_VISION_2040.horizon}.
              </div>
              <p className="ab-body" style={{ fontSize: 16, marginTop: 20, maxWidth: "50ch" }}>
                {NGGC_VISION_2040.statement}
              </p>
            </div>

            <div>
              <div className="mono ab-label" style={{ color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
                CAPABLE OF BECOMING
              </div>
              <ul className="ab-pills">
                {NGGC_VISION_2040.becoming.map(b => <li key={b} className="ab-pill ab-pill-lg">{b}</li>)}
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

          <div className="ab-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 14, marginBottom: 44 }}>
            {NGGC_PHILOSOPHY.map(p => (
              <div key={p.verb} className="card" style={{ padding: "22px 20px" }}>
                <div className="mono ab-label">{p.code}</div>
                <div className="display" style={{ fontSize: 28, letterSpacing: "-0.02em", color: "var(--ink-900)", margin: "8px 0 2px" }}>
                  {p.verb}
                </div>
                <div className="ab-body">{p.object}</div>
              </div>
            ))}
          </div>

          {/* The pathway rail — the same five stops the whole movement uses. */}
          <div className="card" style={{ padding: "30px 28px" }}>
            <div className="mono ab-label ab-label-ink" style={{ marginBottom: 20 }}>THE PATHWAY</div>
            <ol className="ab-grid" style={{ margin: 0, padding: 0, listStyle: "none", gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}>
              {NGGC_PATHWAY.map((s, i) => (
                <li key={s.id} className={"ab-step" + (i === NGGC_PATHWAY.length - 1 ? " is-last" : "")}>
                  <div className="ab-step-h">{s.label}</div>
                  <div className="mono ab-label" style={{ fontSize: 11, textTransform: "uppercase" }}>{s.role}</div>
                  <p className="ab-body" style={{ fontSize: 14 }}>{s.note}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ═══ §4 — the six goals ═══ */}
      <section className="section ab-sec-cream">
        <div className="container">
          <SectionHead
            eyebrow="THE SIX GOALS"
            title="What the programme is actually for."
            sub="Discover potential. Develop character. Build competence. Develop leaders. Create impact. Build the 2040 pipeline."
          />
          <div className="ab-grid ab-grid-md">
            {NGGC_GOALS.map(g => (
              <DoctrineCard key={g.code} code={"GOAL " + g.code} title={g.title}
                lead={g.verb + ":"} items={g.items} note={g.note} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ §5 — the four divisions ═══ */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="THE FOUR PROFESSIONAL DIVISIONS"
            title={"Four mandates, " + courseCount + " courses, one compulsory board."}
            sub="Every member belongs to a division. Chess is compulsory across all four — it is the one course that appears in every list."
          />
          {/* 440px floor, so four cards land as a 2×2 rather than a row of
              three and an orphan; the grid's own `start` alignment keeps a card
              with its courses open from stretching its neighbours. */}
          <div className="ab-grid ab-grid-lg">
            {NGGC_DIVISIONS.map(d => (
              <DivisionPanel key={d.id} d={d} open={openDivision === d.id}
                onToggle={() => setOpenDivision(cur => cur === d.id ? null : d.id)} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ §6 + §12 — chess as a leadership laboratory ═══ */}
      <section className="section ab-sec-dark on-dark">
        <div className="container">
          <div className="ab-split">
            <div>
              <span className="eyebrow ab-label">CHESS IS NOT JUST A CLASS</span>
              <h2 className="display ab-h ab-h-sec" style={{ maxWidth: "16ch" }}>
                A leadership <span style={{ color: "var(--gold-500)" }}>laboratory</span> with sixty-four squares.
              </h2>
              <p className="ab-body" style={{ fontSize: 16, maxWidth: "50ch" }}>
                The question after a session is never only{" "}
                <em style={{ fontStyle: "normal", color: "rgba(255,255,255,0.5)", textDecoration: "line-through" }}>
                  “{NGGC_CHESS.insufficientQuestion}”
                </em>{" "}— it is the four that follow.
              </p>
              <ol className="ab-asks" style={{ marginTop: 18 }}>
                {NGGC_CHESS.debrief.map(q => <li key={q} className="ab-ask ab-ask-strong">{q}</li>)}
              </ol>
              <ul className="ab-pills" style={{ marginTop: 26 }}>
                {NGGC_CHESS.teaches.map(t => <li key={t} className="ab-pill">{t}</li>)}
              </ul>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* The mirror table — behaviour on the board, named off it. */}
              <div className="ab-panel">
                <div className="mono ab-label" style={{ marginBottom: 16 }}>ON THE BOARD → IN THE PERSON</div>
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

              <div className="ab-panel">
                <div className="mono ab-label" style={{ marginBottom: 14 }}>THE CHESS DASHBOARD</div>
                <ul className="ab-pills">
                  {NGGC_CHESS.dashboardFields.map(f => <li key={f} className="ab-pill">{f}</li>)}
                </ul>
                <p className="ab-body" style={{ fontSize: 14, marginTop: 16 }}>
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

          <div className="ab-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(290px, 100%), 1fr))", marginBottom: 20 }}>
            <DoctrineCard code="THE MENTOR ASKS" accent="var(--coral)"
              title="Questions an instructor never has to ask."
              items={NGGC_MENTOR.asks} />
            <DoctrineCard code="MUSING TIME"
              title="Deliberate thinking time, protected."
              lead={NGGC_MUSING.rules.join(" · ") + "."}
              items={NGGC_MUSING.prompts}
              note={"The mentor reviews the quality of the reflection, never the writing. " + NGGC_MUSING.purpose} />
            <DoctrineCard code="PERSONAL TIMETABLE"
              title="The child learns to run their own week."
              items={NGGC_TIMETABLE.items}
              note={NGGC_TIMETABLE.caution} />
          </div>

          {/* The five-rung handover — mentor reminds → child teaches others. */}
          <div className="card" style={{ padding: "var(--rs-p-40, 26px 28px)", marginBottom: 20 }}>
            <div className="mono ab-label ab-label-ink" style={{ marginBottom: 16 }}>
              THE HANDOVER — THIS IS LEADERSHIP FORMATION
            </div>
            <ol className="ab-chain">
              {NGGC_TIMETABLE.progression.map((step, i) => (
                <React.Fragment key={step}>
                  <li className={i === NGGC_TIMETABLE.progression.length - 1 ? "is-end" : ""}>{step}</li>
                  {i < NGGC_TIMETABLE.progression.length - 1 && (
                    <li className="is-arrow" aria-hidden="true">→</li>
                  )}
                </React.Fragment>
              ))}
            </ol>
          </div>

          {/* §19 — mentoring is not policing. The boundary, stated plainly. */}
          <div className="card ab-card-pad" style={{ background: "var(--cream-100)", border: "var(--rs-border-55, 1px solid var(--cream-200))" }}>
            <div className="mono ab-label ab-label-warn" style={{ marginBottom: 12 }}>MENTORING IS NOT POLICING</div>
            <p className="ab-body-lg" style={{ fontSize: 17, color: "var(--ink-900)", margin: "0 0 14px", maxWidth: "64ch" }}>
              The mentor is not {NGGC_MENTOR.isNot.slice(0, -1).join(", ")} or {NGGC_MENTOR.isNot.slice(-1)} whose job is to
              catch children doing wrong. The mentor is a formation partner — and combines{" "}
              <strong>{NGGC_MENTOR.is.join(" + ")}</strong>.
            </p>
            <div className="ab-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 14 }}>
              {NGGC_MENTOR.says.map(s => <blockquote key={s} className="ab-quote">“{s}”</blockquote>)}
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <QuestionList id="about-weekly-review" label="The mentor's weekly review"
              questions={NGGC_WEEKLY_REVIEW} numbered />
          </div>
        </div>
      </section>

      {/* ═══ §10 — the Anchor Journal ═══ */}
      <section className="section ab-sec-cream">
        <div className="container">
          <SectionHead
            eyebrow="THE ANCHOR JOURNAL · WEEKLY"
            title="The evidence of formation, in the member's own hand."
            sub="Nine blocks, one question each. The objective is not to grade writing. It is to develop self-awareness and accountability."
          />
          <div className="ab-grid ab-grid-tile">
            {NGGC_ANCHOR_JOURNAL.map(b => (
              <div key={b.key} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="mono ab-label">{b.label}</div>
                <p className="ab-h" style={{ fontSize: 16, lineHeight: 1.5 }}>{b.q}</p>
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
          <div className="ab-grid ab-grid-md">
            <div className="card ab-card-pad">
              <div className="mono ab-label" style={{ marginBottom: 12 }}>COMMUNITY PARTICIPATION</div>
              <h3 className="display ab-h ab-h-lead">NGGC must not produce isolated geniuses.</h3>
              <p className="ab-body-lg" style={{ margin: "0 0 16px", maxWidth: "56ch" }}>
                {NGGC_COMMUNITY.premise} So mentors monitor participation, and the question a member
                is measured against is a simple one: <strong>{NGGC_COMMUNITY.question}</strong>
              </p>
              <ul className="ab-pills">
                {NGGC_COMMUNITY.marks.map(m => <li key={m} className="ab-pill">{m}</li>)}
              </ul>
            </div>

            <div className="card ab-card-pad">
              <div className="mono ab-label" style={{ marginBottom: 12 }}>DUES, FINES &amp; FINANCIAL RESPONSIBILITY</div>
              <h3 className="display ab-h ab-h-lead">Money is a resource that requires responsibility.</h3>
              <p className="ab-body-lg" style={{ margin: "0 0 16px", maxWidth: "56ch" }}>{NGGC_FINANCIAL.purpose}</p>
              <ul className="ab-pills" style={{ marginBottom: 18 }}>
                {NGGC_FINANCIAL.obligations.map(o => <li key={o} className="ab-pill">{o}</li>)}
              </ul>
              <div style={{ paddingTop: 16, borderTop: "1px solid rgba(12,20,50,0.08)" }}>
                <div className="mono ab-label ab-label-warn" style={{ fontSize: 11, marginBottom: 10 }}>
                  WHERE FINES APPLY, ALL OF THIS APPLIES TOO
                </div>
                <ul className="ab-pills">
                  {NGGC_FINANCIAL.safeguards.map(s => <li key={s} className="ab-pill ab-pill-outline">{s}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §14 — the Courage Index ═══ */}
      <section className="section ab-sec-dark on-dark">
        <div className="container">
          <div className="ab-split">
            <div>
              <span className="eyebrow ab-label">THE COURAGE INDEX</span>
              <h2 className="display ab-h ab-h-sec" style={{ maxWidth: "15ch" }}>
                One of the most important things we measure.
              </h2>
              <p className="ab-body" style={{ fontSize: 16, maxWidth: "50ch", margin: "0 0 18px" }}>
                Courage is the willingness to do what is right or necessary despite fear, discomfort
                or pressure. The objective is not to create reckless children — it is principled courage.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 26 }}>
                <span className="mono ab-label" style={{ color: "rgba(255,255,255,0.55)" }}>NOT</span>
                {NGGC_COURAGE_IS_NOT.map(n => <span key={n} className="ab-pill ab-pill-lg ab-pill-no">{n}</span>)}
              </div>

              {/* The 1–5 ladder. Rendered as rungs so the shape of the scale —
                  passive at the bottom, other-directed at the top — is visible
                  before any of the labels are read. */}
              <ol className="ab-rungs">
                {NGGC_COURAGE_LADDER.map(r => (
                  <li key={r.score} className={"ab-rung" + (r.score === 5 ? " is-top" : "")}>
                    <span className={"mono ab-rung-n ab-num" + (r.score >= 4 ? " is-high" : "")}>{r.score}</span>
                    <span>{r.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <div className="mono ab-label" style={{ color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
                WHAT A MENTOR SCORES AGAINST
              </div>
              <ol className="ab-asks">
                {NGGC_COURAGE_PROMPTS.map(q => <li key={q} className="ab-ask">{q}</li>)}
              </ol>
              <p className="ab-body" style={{ fontSize: 14, marginTop: 20, maxWidth: "52ch", color: "rgba(255,255,255,0.62)" }}>
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

          <div className="card" style={{ padding: "var(--rs-p-40, 26px 28px)", marginBottom: 20, background: "var(--cream-100)", border: "var(--rs-border-55, 1px solid var(--cream-200))" }}>
            <div className="mono ab-label ab-label-warn" style={{ marginBottom: 12 }}>
              ANSWERS THE PROGRAMME DOES NOT ACCEPT
            </div>
            <ul className="ab-pills">
              {NGGC_LEADERSHIP.insufficient.map(a => (
                <li key={a} className="ab-pill ab-pill-lg ab-pill-outline ab-pill-no">“{a}”</li>
              ))}
            </ul>
          </div>

          <div className="ab-grid ab-grid-sm" style={{ marginBottom: 20 }}>
            {NGGC_LEADERSHIP.measures.map(m => (
              <div key={m.name} className="card" style={{ padding: 22 }}>
                <div className="ab-h" style={{ fontSize: 21, marginBottom: 6 }}>{m.name}</div>
                <p className="ab-body" style={{ fontSize: 14.5 }}>{m.test}</p>
              </div>
            ))}
          </div>

          <QuestionList id="about-leadership-test" label="The Rational Leadership Test"
            questions={NGGC_LEADERSHIP_TEST} />
        </div>
      </section>

      {/* ═══ §17 + §20 + §21 — the dashboard, progression, the model ═══ */}
      <section className="section ab-sec-cream">
        <div className="container">
          <SectionHead
            eyebrow="HOW FORMATION IS TRACKED"
            title="Every member has a record. Every record has seven parts."
            sub="Progression is evidence of formation, never time served. A member does not become an NGV because they have been around long enough."
          />

          <div className="ab-grid ab-grid-tile" style={{ marginBottom: 40 }}>
            {NGGC_MEMBER_DASHBOARD.map(g => (
              <div key={g.group} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="ab-icon-sq" aria-hidden="true">{g.icon}</span>
                  <span className="ab-h" style={{ fontSize: 18 }}>{g.group}</span>
                </div>
                <ul className="ab-pills ab-pills-tight">
                  {g.fields.map(f => <li key={f} className="ab-pill">{f}</li>)}
                </ul>
              </div>
            ))}
          </div>

          {/* Progression NGG → NGV → Afrovanguard */}
          <div className="ab-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", marginBottom: 40 }}>
            {NGGC_PROGRESSION.map((p, i) => (
              <div key={p.id} className="card" style={{
                padding: 28,
                borderTop: "4px solid " + (i === 0 ? "var(--cream-200)" : i === 1 ? "var(--gold-500)" : "var(--coral)"),
              }}>
                <div className="display" style={{ fontSize: 34, letterSpacing: "-0.02em", color: "var(--ink-900)", lineHeight: 1 }}>
                  {p.stage}
                </div>
                <p className="ab-body-lg" style={{ fontSize: 15.5, margin: "8px 0 14px", fontWeight: 600 }}>{p.headline}</p>
                <ul className="ab-pills ab-pills-tight">
                  {p.learning.map(l => <li key={l} className="ab-pill">{l}</li>)}
                </ul>
              </div>
            ))}
          </div>

          {/* The four-layer model */}
          <div className="card" style={{ padding: "30px 28px" }}>
            <div className="mono ab-label ab-label-ink" style={{ marginBottom: 6 }}>THE FOUR-LAYER MODEL</div>
            <p className="ab-body ab-measure" style={{ margin: "0 0 20px" }}>
              This is what prevents NGGC from becoming another place where children attend classes
              and collect certificates.
            </p>
            <div className="ab-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 16 }}>
              {NGGC_LAYERS.map(l => (
                <div key={l.n} className="ab-step" style={{ borderTopColor: "var(--navy-900)" }}>
                  <div className="mono ab-label" style={{ fontSize: 11 }}>LAYER {l.n}</div>
                  <div className="ab-step-h" style={{ fontSize: "var(--rs-fsize-1, 22px)" }}>{l.name}</div>
                  <div className="ab-body" style={{ fontSize: 14 }}>{l.parts.join(" · ")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §22–23 — the real product and the standard ═══ */}
      <section className="section">
        <div className="container">
          <div className="ab-split">
            <div>
              <span className="eyebrow ab-label">THE REAL PRODUCT</span>
              <h2 className="display ab-h" style={{
                fontSize: "var(--rs-fsize-56, clamp(34px, 4.4vw, 60px))", lineHeight: "var(--rs-lheight-7, 1)", letterSpacing: "-0.03em",
                margin: "10px 0 18px", maxWidth: "15ch",
              }}>
                {NGGC_REAL_PRODUCT.is}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center", marginBottom: 16 }}>
                <span className="mono ab-label ab-label-ink">NOT</span>
                {NGGC_REAL_PRODUCT.notThe.map(n => <span key={n} className="ab-pill ab-pill-lg ab-pill-no">{n}</span>)}
                <span className="ab-body" style={{ fontSize: 14 }}>— those are tools.</span>
              </div>
              <p className="ab-h" style={{ fontSize: 19, lineHeight: 1.5, color: "var(--coral)" }}>
                {NGGC_REAL_PRODUCT.coda}
              </p>
            </div>

            <div className="card" style={{ padding: "30px 32px" }}>
              <div className="mono ab-label" style={{ marginBottom: 18 }}>THE NGGC STANDARD</div>
              <ul className="ab-standard">
                {NGGC_STANDARD.map((line, i) => (
                  <li key={line} className={i >= 10 ? "is-hard" : ""}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ §24 — the 2040 declaration ═══ */}
      <section className="section ab-sec-dark on-dark" style={{ position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle at 20% 80%, rgba(255,90,60,0.16), transparent 55%)",
        }} />
        <div className="container" style={{ position: "relative" }}>
          <span className="eyebrow ab-label">THE 2040 DECLARATION</span>
          <h2 className="display ab-h" style={{
            fontSize: "var(--rs-fsize-57, clamp(36px, 5vw, 76px))", lineHeight: "var(--rs-lheight-4, 0.98)", letterSpacing: "-0.03em",
            margin: "12px 0 20px", maxWidth: "18ch",
          }}>
            Africa needs a generation of <span style={{ color: "var(--gold-500)" }}>formed</span> people.
          </h2>
          <p className="ab-body" style={{ fontSize: 17, maxWidth: "62ch", margin: "0 0 34px" }}>
            {NGGC_DECLARATION.premise}
          </p>

          <ul className="ab-grid ab-grid-wide" style={{ margin: "0 0 40px", padding: 0, listStyle: "none" }}>
            {NGGC_DECLARATION.people.map(p => (
              <li key={p} className="ab-panel" style={{ padding: "14px 18px", borderRadius: 12,
                    fontSize: 15.5, lineHeight: 1.5, color: "rgba(255,255,255,0.88)" }}>{p}</li>
            ))}
          </ul>

          <div className="ab-split" style={{ paddingTop: 30, borderTop: "1px solid rgba(255,255,255,0.15)", gap: 32 }}>
            <div>
              <p style={{ fontSize: 17, lineHeight: 1.5, color: "rgba(255,255,255,0.6)", margin: "0 0 4px",
                    textDecoration: "line-through", textDecorationColor: "var(--coral)" }}>
                {NGGC_DECLARATION.seed.a}
              </p>
              <p className="ab-h" style={{ fontSize: "clamp(22px, 2.6vw, 34px)", lineHeight: 1.15 }}>
                {NGGC_DECLARATION.seed.b}
              </p>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--gold-400)", margin: "16px 0 0", maxWidth: "44ch" }}>
                {NGGC_DECLARATION.assignment}
              </p>
            </div>

            <div>
              <div className="mono ab-label" style={{ color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
                {NGGC_PATHWAY.map(s => s.label).join(" → ")}
              </div>
              <div className="display ab-num" style={{
                fontSize: "var(--rs-fsize-58, clamp(40px, 6vw, 82px))", lineHeight: "var(--rs-lheight-50, 0.92)", letterSpacing: "-0.04em",
                color: "var(--gold-500)",
              }}>
                {NGGC_VISION_2040.targetLabel}
              </div>
              <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {NGGC_DECLARATION.refrain.map(r => (
                  <li key={r} className="ab-h" style={{ fontSize: "clamp(20px, 2.4vw, 30px)", lineHeight: 1.2 }}>{r}</li>
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
