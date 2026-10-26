/* ============================================================================
   THE NGG LEARN APP — /learn
   ===========================================================================

   The curriculum used to be a SHEET. A lesson opened in the same overlay the
   member portal uses for "Edit profile" and "Gate pass": no address, nothing
   to bookmark or send, the browser's Back closing it instead of going back,
   and the whole of a Saturday's teaching paginated inside a panel on top of a
   dashboard. The thing the programme exists to do was a modal.

   This is a place instead. It has its own address, its own shell and its own
   navigation — the same way the Anchor Journal and the Study tools are their
   own apps — and it is built for the one thing a member does here: work
   through a lesson and be asked about it.

   ── THE ADDRESSES ──────────────────────────────────────────────────────────

     /learn                      This week — what to do now
     /learn/courses              My courses — the shelf
     /learn/course/<slug>        One course, week by week
     /learn/lesson/<unitId>      A lesson, full screen
     /learn/review               The review — last session's questions
     /learn/helper               The study helper

   Every one of them is real: refresh it, bookmark it, send it to a mentor.
   `app.jsx` leaves the /learn subtree alone (inLearnSubtree) so a deep path
   is not rewritten back to /learn on mount.

   ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────

   It does not draw a second lesson. `LearnLesson` is the only renderer for a
   lesson in this app, and it reuses the pieces that already exist and are
   already tested — CurriculumText, CurriculumMaterials, CurCheckField,
   DashOpeningReview, DashLessonFeedback — rather than forking them
   (CLAUDE.md §11). What is new here is the PLACE, not the parts.

   Mobile first, not scaled down: one column, 44px targets, a bottom bar on a
   phone and a rail on a wide screen. Every width decision is a container
   query on the app's own root, never the window's.
   ========================================================================== */

const LRN_NAV = [
  { id: "week",    path: "/learn",         label: "This week", icon: "ph ph-calendar-check" },
  { id: "courses", path: "/learn/courses", label: "My courses", icon: "ph ph-books" },
  { id: "plan",    path: "/learn/plan",    label: "School",     icon: "ph ph-exam" },
  { id: "review",  path: "/learn/review",  label: "Review",     icon: "ph ph-target" },
  { id: "helper",  path: "/learn/helper",  label: "Helper",     icon: "ph ph-sparkle" },
];

/** A course name → the slug its address uses, and back. */
function lrnSlug(course) {
  return String(course || "club").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "club";
}

/** Where we are, from the address. One reader, so nothing can disagree. */
function lrnRoute() {
  const seg = (window.location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  if (seg[0] !== "learn") return { view: "week" };
  const a = seg[1] || "", b = seg.slice(2).join("/");
  if (a === "courses") return { view: "courses" };
  if (a === "plan") return b ? { view: "drill", itemId: decodeURIComponent(b) } : { view: "plan" };
  if (a === "review") return { view: "review" };
  if (a === "helper") return { view: "helper" };
  if (a === "course") return { view: "course", slug: decodeURIComponent(b || "") };
  if (a === "lesson") return { view: "lesson", unitId: decodeURIComponent(b || "") };
  return { view: "week" };
}

function lrnGo(path, replace) {
  try {
    if (replace) history.replaceState({ page: "learn" }, "", path);
    else history.pushState({ page: "learn" }, "", path);
  } catch (_) {}
  window.dispatchEvent(new Event("ngg:learnroute"));
}

/* ── Read aloud ──────────────────────────────────────────────────────────────
 * Shares mp9Speakable() with the member portal, so there is ONE idea of what
 * a lesson sounds like: headings become sentences, links read as their words,
 * code is announced rather than recited, and the text is queued in chunks so
 * Chrome does not stop after fifteen seconds. Voices load asynchronously —
 * reading getVoices() synchronously is why the first press used to be silent
 * or American. */
function LearnReadAloud({ text, label }) {
  const [on, setOn] = React.useState(false);
  const [rate, setRate] = React.useState(() => { try { return parseFloat(localStorage.getItem("ngg.learn.rate")) || 0.95; } catch (_) { return 0.95; } });
  const live = React.useRef(false);
  const stop = React.useCallback(() => {
    live.current = false;
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {}
    setOn(false);
  }, []);
  React.useEffect(() => stop, [stop, text]);
  const can = typeof window !== "undefined" && !!window.speechSynthesis;
  if (!can) return null;
  const pickVoice = () => {
    const vs = (window.speechSynthesis.getVoices && window.speechSynthesis.getVoices()) || [];
    return vs.find(v => /en[-_]NG/i.test(v.lang)) || vs.find(v => /en[-_](GH|KE|ZA)/i.test(v.lang))
        || vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
  };
  const start = () => {
    const ss = window.speechSynthesis;
    const chunks = typeof mp9Speakable === "function" ? mp9Speakable(text) : [String(text || "")];
    if (!chunks.length) return;
    const run = () => {
      const v = pickVoice();
      let i = 0;
      live.current = true;
      setOn(true);
      const say = () => {
        if (!live.current) return;
        if (i >= chunks.length) return stop();
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        if (v) { u.voice = v; u.lang = v.lang; }
        u.rate = rate;
        u.onend = say;
        u.onerror = stop;
        ss.speak(u);
      };
      say();
    };
    ss.cancel();
    if ((ss.getVoices && ss.getVoices().length) || !("onvoiceschanged" in ss)) return run();
    const once = () => { ss.removeEventListener("voiceschanged", once); run(); };
    ss.addEventListener("voiceschanged", once);
    setTimeout(() => { if (!live.current) { ss.removeEventListener("voiceschanged", once); run(); } }, 1200);
  };
  const setSpeed = (r) => { setRate(r); try { localStorage.setItem("ngg.learn.rate", String(r)); } catch (_) {} if (live.current) { stop(); setTimeout(start, 60); } };
  return (
    <div className="lrn-aloud">
      <button type="button" className={"lrn-aloud-btn" + (on ? " is-on" : "")} onClick={() => (on ? stop() : start())}
              aria-pressed={on} aria-label={on ? "Stop reading aloud" : "Read " + (label || "this") + " aloud"}>
        <i className={on ? "ph-fill ph-stop-circle" : "ph ph-speaker-high"} aria-hidden="true"/>
        <span>{on ? "Stop" : "Read it to me"}</span>
      </button>
      {/* Speed matters more to a child reading along than to an adult. */}
      <div className="lrn-aloud-rate" role="group" aria-label="Reading speed">
        {[["Slower", 0.75], ["Normal", 0.95], ["Faster", 1.2]].map(([l, r]) => (
          <button key={l} type="button" className={"lrn-chip" + (Math.abs(rate - r) < 0.01 ? " is-on" : "")}
                  aria-pressed={Math.abs(rate - r) < 0.01} onClick={() => setSpeed(r)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/* ── One lesson card, used by This week and by a course ─────────────────── */
function LearnLessonCard({ u, showCourse }) {
  const st = curriculumStatusLabel(u.progress);
  const late = u.overdueDays > 0 && !(u.progress && (u.progress.status === "completed" || u.progress.pending));
  return (
    <li>
      <a className={"lrn-card" + (late ? " is-late" : "")} href={"/learn/lesson/" + encodeURIComponent(u.unitId)}
         onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); lrnGo("/learn/lesson/" + encodeURIComponent(u.unitId)); }}>
        <span className="lrn-card-top">
          {showCourse && <span className="lrn-card-course">{u.course || "Whole Club"}</span>}
          <span className={"lrn-card-chip " + st.tone}>{st.label}{u.progress && u.progress.attempts > 0 && !u.progress.pending ? " · " + u.progress.bestPct + "%" : ""}</span>
        </span>
        <span className="lrn-card-title">{u.title}</span>
        <span className="lrn-card-meta">
          {(u.path ? u.path.code : "Week " + u.week)}
          {u.durationMins ? " · about " + u.durationMins + " minutes" : ""}
          {u.checks ? " · " + u.checks + (u.checks === 1 ? " question" : " questions") : ""}
        </span>
        {late && <span className="lrn-card-late">{u.overdueDays} day{u.overdueDays === 1 ? "" : "s"} late</span>}
      </a>
    </li>
  );
}

/* ── This week ───────────────────────────────────────────────────────────── */
function LearnWeek({ d, plan, onRetry }) {
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading your lessons"/>;
  const units = d.units || [];
  if (!units.length) return (
    <div className="lrn-empty">
      <i className="ph ph-book-open-text" aria-hidden="true"/>
      <h2>No lessons yet{d.track ? " for " + d.track : ""}.</h2>
      <p>Your lessons appear here as your instructors publish them. Nothing is missing on your side.</p>
    </div>
  );
  /* What to do NOW: anything overdue, then anything started, then the lowest
     unfinished week. A list of every lesson in the term is a shelf, not an
     answer to "what do I do today". */
  const open = units.filter(u => !u.progress || u.progress.status !== "completed");
  const late = open.filter(u => u.overdueDays > 0);
  const going = open.filter(u => u.progress && u.overdueDays <= 0);
  const lowest = open.length ? Math.min.apply(null, open.filter(u => !u.progress).map(u => u.week).concat([99])) : 99;
  const next = open.filter(u => !u.progress && u.week === lowest);
  const done = units.length - open.length;
  return (
    <div className="lrn-stack">
      <section className="lrn-prog" aria-label="Your progress">
        <div>
          <p className="lrn-prog-n">{done} of {units.length} lessons done</p>
          {d.overdue > 0
            ? <p className="lrn-prog-s is-late">{d.overdue} {d.overdue === 1 ? "is" : "are"} late</p>
            : <p className="lrn-prog-s">Nothing is late. Keep going.</p>}
        </div>
        <div className="lrn-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.pct} aria-label="Curriculum completed">
          <span style={{ width: d.pct + "%" }}/>
        </div>
      </section>
      {/* School sits WITH the Club's lessons rather than behind another tab:
          a member's week is one week, and a plan they agreed to in their own
          results is not a different kind of thing to remember separately. */}
      <LearnSchoolStrip plan={plan}/>
      {late.length > 0 && <LearnGroup title="Late — do these first" tone="late" units={late}/>}
      {next.length > 0 && <LearnGroup title={late.length ? "Then this" : "Start here"} units={next}/>}
      {going.length > 0 && <LearnGroup title="Carry on" units={going}/>}
      {!late.length && !next.length && !going.length && (
        <div className="lrn-empty">
          <i className="ph-fill ph-check-circle" aria-hidden="true"/>
          <h2>Everything is done.</h2>
          <p>Nothing is waiting for you. Your next lesson appears when your instructor publishes it.</p>
          <a className="lrn-btn" href="/learn/courses" onClick={e => { e.preventDefault(); lrnGo("/learn/courses"); }}>Look back over my courses</a>
        </div>
      )}
    </div>
  );
}

/* The school plan, in one line per subject, on the week's own screen. Drawn
   only when there is something outstanding — a finished week is not a thing
   to nag somebody about. */
function LearnSchoolStrip({ plan }) {
  if (!plan || plan.state !== "ready") return null;
  const owing = (plan.items || []).filter(it => it.doneThisWeek < it.planned);
  if (!owing.length) return null;
  return (
    <section className="lrn-group" aria-label="School this week">
      <h2 className="lrn-group-h">School this week</h2>
      <ul className="lrn-list">
        {owing.map(it => (
          <li key={it.itemId}>
            <a className="lrn-card" href={"/learn/plan/" + encodeURIComponent(it.itemId)}
               onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo("/learn/plan/" + encodeURIComponent(it.itemId)); }}>
              <span className="lrn-card-top">
                <span className="lrn-card-course">{it.subject}</span>
                <span className="lrn-card-chip">{it.doneThisWeek} of {it.planned}</span>
              </span>
              <span className="lrn-card-title">
                {it.current != null && it.target != null ? it.current + "% → " + it.target + "%" : "Practise " + it.subject}
              </span>
              <span className="lrn-card-meta">{plan.questions} questions · level {it.level} of {plan.levels}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LearnGroup({ title, units, tone }) {
  return (
    <section className="lrn-group" aria-label={title}>
      <h2 className={"lrn-group-h" + (tone === "late" ? " is-late" : "")}>{title}</h2>
      <ul className="lrn-list">{units.map(u => <LearnLessonCard key={u.unitId} u={u} showCourse/>)}</ul>
    </section>
  );
}

/* ── My courses ──────────────────────────────────────────────────────────── */
function LearnCourses({ d }) {
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading your courses"/>;
  const units = d.units || [];
  const by = {};
  units.forEach(u => { const c = u.course || "Whole Club"; (by[c] = by[c] || []).push(u); });
  const names = Object.keys(by).sort();
  if (!names.length) return (
    <div className="lrn-empty"><i className="ph ph-books" aria-hidden="true"/><h2>No courses yet.</h2>
      <p>When your centre puts you on a course, its lessons appear here.</p></div>
  );
  return (
    <div className="lrn-stack">
      <ul className="lrn-shelf">
        {names.map(c => {
          const us = by[c];
          const done = us.filter(u => u.progress && u.progress.status === "completed").length;
          const pct = us.length ? Math.round(done / us.length * 100) : 0;
          return (
            <li key={c}>
              <a className="lrn-course" href={"/learn/course/" + lrnSlug(c)}
                 onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo("/learn/course/" + lrnSlug(c)); }}>
                <span className="lrn-course-n">{c}</span>
                <span className="lrn-course-m">{done} of {us.length} done</span>
                <span className="lrn-meter is-sm"><span style={{ width: pct + "%" }}/></span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="lrn-aside">
        <h2 className="lrn-aside-h">Take it with you</h2>
        <p>Your whole curriculum, as one document, to read when you are offline.</p>
        <div className="lrn-aside-acts">
          <a className="lrn-btn is-ghost" href="/api/member/curriculum-doc.php" target="_blank" rel="noopener">Open as a PDF</a>
          <a className="lrn-btn is-ghost" href="/api/member/curriculum-doc.php?format=doc">Download for Word</a>
        </div>
      </div>
    </div>
  );
}

/* ── One course, week by week ────────────────────────────────────────────── */
function LearnCourse({ d, slug }) {
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading the course"/>;
  const units = (d.units || []).filter(u => lrnSlug(u.course || "Whole Club") === slug);
  const name = units.length ? (units[0].course || "Whole Club") : "";
  if (!units.length) return (
    <div className="lrn-empty"><i className="ph ph-book-open-text" aria-hidden="true"/><h2>That course is not one of yours.</h2>
      <p>It may have been renamed, or you may have been moved.</p>
      <a className="lrn-btn" href="/learn/courses" onClick={e => { e.preventDefault(); lrnGo("/learn/courses"); }}>My courses</a></div>
  );
  const weeks = [];
  units.slice().sort((a, b) => a.week - b.week || a.position - b.position)
       .forEach(u => { const w = weeks.find(x => x.week === u.week); w ? w.units.push(u) : weeks.push({ week: u.week, units: [u] }); });
  return (
    <div className="lrn-stack">
      <h2 className="lrn-course-title">{name}</h2>
      {weeks.map(w => (
        <section key={w.week} className="lrn-group" aria-label={"Week " + w.week}>
          <h3 className="lrn-group-h">Week {w.week}</h3>
          <ul className="lrn-list">{w.units.map(u => <LearnLessonCard key={u.unitId} u={u}/>)}</ul>
        </section>
      ))}
    </div>
  );
}

/* ── A lesson, full screen ───────────────────────────────────────────────── */
function LearnLesson({ unitId, onDone }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [answers, setAnswers] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [started, setStarted] = React.useState(false);
  const load = React.useCallback(() => {
    setErr(""); setD(null);
    return NGGApi.member.curriculumUnit(unitId).then(r => { setD(r); setAnswers({}); setResult(null); setStarted(false); })
      .catch(e => setErr(e.code || e.message || "failed"));
  }, [unitId]);
  React.useEffect(() => { load(); window.scrollTo(0, 0); }, [load]);

  if (err) return <ErrorState title="Couldn't open this lesson" code={err} onRetry={load}/>;
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading the lesson"/>;
  const u = d.unit;
  const p = (result && result.progress) || d.progress;
  const review = result && result.review;
  const reviewById = {}; (review || []).forEach(c => { reviewById[c.checkId] = c; });
  const marks = (p && p.marks) || {};
  const answered = u.checks.every(c => answers[c.checkId] !== undefined && answers[c.checkId] !== "");
  const st = curriculumStatusLabel(p);
  /* The opening review comes FIRST and today's teaching waits behind it — a
     review sat after the lesson it is meant to precede is just a quiz. The
     skip is always there: being away last week is not a reason to be shut out
     of this week. */
  const opened = started || !d.review;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await NGGApi.member.curriculumSubmit(unitId, answers);
      setResult(r);
      if (r.progress.status === "completed") toast.success("Lesson complete — " + r.progress.bestPct + "%.", u.title);
      else if (r.progress.pending) toast.info("Sent. Your instructor will mark the written answers.", u.title);
      else toast.info("Not yet — " + Math.round(r.progress.score) + " of " + r.progress.maxScore + ". Have another go.", u.title);
      if (onDone) onDone();
    } catch (e2) { toast.error(humanizeError(e2.code, e2.code)); }
    finally { setBusy(false); }
  };
  const back = u.course ? "/learn/course/" + lrnSlug(u.course) : "/learn";
  return (
    <article className="lrn-lesson">
      <a className="lrn-back" href={back} onClick={e => { e.preventDefault(); lrnGo(back); }}>
        <i className="ph ph-arrow-left" aria-hidden="true"/> {u.course || "All lessons"}
      </a>
      <header className="lrn-lesson-head">
        <p className="lrn-lesson-eyebrow">{(u.path ? u.path.label : "Week " + u.week)} · {(u.course || "Whole Club")}</p>
        <h1 className="lrn-lesson-title">{u.title}</h1>
        {u.summary && <p className="lrn-lesson-sum">{u.summary}</p>}
        <span className={"lrn-card-chip " + st.tone}>{st.label}</span>
        {p && p.stale && <p className="lrn-note">This lesson's questions have changed since you sat them — your earlier score was on the older ones.</p>}
      </header>

      {!opened && <DashOpeningReview review={d.review} onDone={() => setStarted(true)} onSkip={() => setStarted(true)}/>}

      {opened && u.objectives.length > 0 && (
        <section className="lrn-sec">
          <h2 className="lrn-sec-h">What you'll learn</h2>
          <ul className="lrn-objectives">{u.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </section>
      )}

      {opened && (u.body || u.materials.length > 0) && (
        <section className="lrn-sec">
          <div className="lrn-sec-bar">
            <h2 className="lrn-sec-h">The lesson</h2>
            <LearnReadAloud text={u.body} label="the lesson"/>
          </div>
          <CurriculumText text={u.body}/>
          <CurriculumMaterials materials={u.materials}/>
        </section>
      )}

      {opened && u.checks.length > 0 && (
        /* These are the questions asked at the START of the next session, a
           week from now. They stay reachable here on purpose: a member who
           wants to try them now should be able to, and the last lesson of a
           course has no next session to be asked in. */
        <form className="lrn-sec lrn-checks" onSubmit={submit} aria-label="Next session's review">
          <h2 className="lrn-sec-h">Next session's review</h2>
          <p className="lrn-note">
            You'll be asked {u.checks.length === 1 ? "this" : "these"} at the start of your next session, from memory.
            Have a go now if you like — it is the remembering a week later that makes it stick. Pass mark {u.passMark}%.
            {p && p.attempts > 0 ? " Attempts so far: " + p.attempts + "." : ""}
          </p>
          {u.checks.map((c, i) => (
            <CurCheckField key={c.checkId} c={c} n={i + 1} value={answers[c.checkId]}
                           onChange={v => setAnswers(a => ({ ...a, [c.checkId]: v }))}
                           verdict={reviewById[c.checkId]} mark={marks[c.checkId]}/>
          ))}
          {p && p.attempts > 0 && (
            <p className="lrn-result" aria-live="polite">
              {p.pending ? "Your written answers are with your instructor. Your score appears once they're marked."
                : "Score: " + Math.round(p.score) + " of " + p.maxScore + " (" + Math.round(p.maxScore ? p.score / p.maxScore * 100 : 0) + "%) · best " + p.bestPct + "%."}
            </p>
          )}
          <button type="submit" className="lrn-btn" disabled={busy || !answered}>{busy ? "Marking…" : p && p.attempts > 0 ? "Submit again" : "Submit answers"}</button>
          {!answered && <p className="lrn-note">Answer every question to submit.</p>}
        </form>
      )}

      {/* Last, after the work, because that is when somebody knows how it
          went. Never a gate on any of it. */}
      {opened && <DashLessonFeedback unitId={unitId} mine={d.feedback} onSaved={() => {}}/>}
    </article>
  );
}

/* ── Studying for school ─────────────────────────────────────────────────────
 *
 * The growth plan built from a member's school results already said what to
 * work on — "Mathematics, 62 → 70, retrieval practice, three sessions a week"
 * — and there was nowhere to do one of those sessions. This is that place.
 *
 * A drill is one session: five questions on that subject, at the level they
 * are working at, marked with the REASON. Then the week's check-in goes up by
 * one and everything they got wrong becomes a flashcard — the plan's own
 * counter and the spaced repetition they already have, not a second of either.
 *
 * The screen takes ONE call (`member.study.plan`), already shaped for it, and
 * a drill has a real address like everything else here: /learn/plan/<itemId>.
 * Holding a drill in component state would have made it the very thing this
 * app was built to stop being — a modal with no way back to it.
 */
function LearnPlan({ d, onRetry }) {
  const [err, setErr] = React.useState("");
  const retry = React.useCallback(() => { setErr(""); return onRetry().catch(e => setErr(e.code || e.message || "failed")); }, [onRetry]);
  if (err) return <ErrorState title="Couldn't load your school plan" code={err} onRetry={retry}/>;
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading your plan"/>;
  if (d.state !== "ready") return (
    <div className="lrn-empty">
      <i className="ph ph-exam" aria-hidden="true"/>
      <h2>{d.state === "plan_empty" ? "Your plan has no subjects yet." : "No school plan yet."}</h2>
      <p>
        This is where you practise the subjects your own results say to work on. Upload a term's
        result in your portal and agree the plan with your mentor — the subjects appear here, with
        somewhere to actually do the work.
      </p>
      <a className="lrn-btn" href="/dashboard/results">Open School results</a>
    </div>
  );
  return (
    <div className="lrn-stack">
      <section className="lrn-aside">
        <h2 className="lrn-aside-h">From your own results</h2>
        <p>{d.summary || "The subjects you agreed to work on this term."} Each go is {d.questions} questions,
          marked straight away, and it counts towards your week.</p>
        <p className="lrn-note">
          {d.todayLeft > 0
            ? d.todayLeft + " more " + (d.todayLeft === 1 ? "go" : "goes") + " today"
            : "That is enough for today — come back tomorrow."}
        </p>
      </section>
      <ul className="lrn-list">
        {d.items.map(it => (
          <li key={it.itemId}>
            <a className="lrn-plan" href={"/learn/plan/" + encodeURIComponent(it.itemId)}
               onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo("/learn/plan/" + encodeURIComponent(it.itemId)); }}>
              <span className="lrn-plan-top">
                <span className="lrn-plan-sub">{it.subject}</span>
                <span className="lrn-card-chip">Level {it.level} of {d.levels}</span>
              </span>
              <span className="lrn-plan-aim">
                {it.current != null ? it.current + "% now" : "No score yet"}
                {it.target != null ? <> → <b>{it.target}%</b></> : null}
                {it.what ? " · " + it.what : ""}
              </span>
              <span className="lrn-plan-week">
                {Array.from({ length: it.planned }).map((_, i) => (
                  <span key={i} className={"lrn-pip" + (i < it.doneThisWeek ? " is-on" : "")} aria-hidden="true"/>
                ))}
                <span className="lrn-plan-wk">{it.doneThisWeek} of {it.planned} this week</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="lrn-aside">
        <h2 className="lrn-aside-h">What happens to what you get wrong</h2>
        <p>It becomes a flashcard, in a deck for that subject, and comes back on the day you are most
          likely to have forgotten it — in <a href="/study">Study tools</a>.</p>
      </div>
    </div>
  );
}

/* Which exam the questions are written for. "Just school" is first because
   it is most members: a JAMB paper is not what a JSS2 child needs. */
const LRN_EXAMS = [["", "Just school"], ["waec", "WAEC"], ["neco", "NECO"], ["utme", "JAMB / UTME"]];

/* One subject: set it up, sit it, see how it went — all at its own address,
   one screen, no overlay. */
function LearnDrill({ itemId, onChanged }) {
  const [plan, setPlan] = React.useState(null);
  const [drill, setDrill] = React.useState(null);
  const [picked, setPicked] = React.useState({});
  const [res, setRes] = React.useState(null);
  const [topic, setTopic] = React.useState("");
  const [exam, setExam] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.member.studyPlan().then(setPlan).catch(e => setErr(e.code || e.message || "failed"));
  }, []);
  React.useEffect(() => { load(); window.scrollTo(0, 0); }, [load]);

  const item = plan && (plan.items || []).find(x => x.itemId === itemId);
  const back = () => lrnGo("/learn/plan");

  const start = async () => {
    setBusy(true); setErr("");
    try { setDrill(await NGGApi.member.studyStart(itemId, topic.trim(), exam)); setPicked({}); setRes(null); window.scrollTo(0, 0); }
    catch (e) {
      setErr(e.code === "enough_today" ? "That is enough for today. Come back tomorrow."
        /* The server's refusal carries the sentence a child should read, and
           api-client puts it on `e.data.message` — `e.message` is the raw
           code, which is what a member was being shown. */
        : e.code === "no_questions" ? ((e.data && e.data.message) || "Nobody can write you questions right now.")
        : e.code === "plan_not_live" ? "This plan is not live yet."
        : humanizeError(e.code, e.code));
    } finally { setBusy(false); }
  };
  const mark = async () => {
    setBusy(true);
    try {
      const qs = drill.questions || [];
      setRes(await NGGApi.member.studyMark(drill.drillId, qs.map((_, i) => (picked[i] === undefined ? -1 : picked[i]))));
      window.scrollTo(0, 0);
      /* The week just moved, so the screens that show it are told — rather
         than being left to go stale until somebody reloads. */
      if (onChanged) onChanged();
    } catch (e) { toast.error(humanizeError(e.code, e.code)); }
    finally { setBusy(false); }
  };

  if (err && !plan) return <ErrorState title="Couldn't open this subject" code={err} onRetry={load}/>;
  if (!plan) return <div className="lrn-wait" role="status" aria-label="Loading"/>;
  if (!item) return (
    <div className="lrn-empty"><i className="ph ph-exam" aria-hidden="true"/>
      <h2>That subject is not on your plan.</h2>
      <p>It may have changed when your plan was last agreed.</p>
      <button type="button" className="lrn-btn" onClick={back}>My school plan</button></div>
  );

  const qs = (drill && drill.questions) || [];
  const all = qs.length > 0 && qs.every((_, i) => picked[i] !== undefined);
  return (
    <div className="lrn-stack">
      <button type="button" className="lrn-back" onClick={back}><i className="ph ph-arrow-left" aria-hidden="true"/> My school plan</button>
      <header className="lrn-lesson-head">
        <p className="lrn-lesson-eyebrow">
          {item.subject} · level {drill ? drill.level : item.level} of {plan.levels}
          {drill && drill.topic ? " · " + drill.topic : ""}
        </p>
        <h1 className="lrn-lesson-title">{res ? "How you did" : drill ? plan.questions + " questions" : item.subject}</h1>
        {!drill && (
          <p className="lrn-lesson-sum">
            {item.current != null ? item.current + "% now" : "No score yet"}
            {item.target != null ? " → " + item.target + "%" : ""}
            {item.what ? " · " + item.what : ""}
            {item.whenWhere ? " · " + item.whenWhere : ""}
          </p>
        )}
      </header>

      {/* 1 · Set it up. Both fields are optional: pressing the button is a
            complete answer, because a blank field must never be a blocker. */}
      {!drill && (
        <section className="lrn-sec">
          <h2 className="lrn-sec-h">This go</h2>
          <div className="lrn-plan-go">
            <label className="lrn-field">
              <span>Anything in particular? (you can leave this)</span>
              <input className="lrn-input" value={topic} maxLength={120} disabled={busy}
                     placeholder="e.g. quadratic equations" onChange={e => setTopic(e.target.value)}/>
            </label>
            <label className="lrn-field">
              <span>Written for</span>
              <select className="lrn-input is-sel" value={exam} disabled={busy} onChange={e => setExam(e.target.value)}>
                {LRN_EXAMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="lrn-btn" onClick={start} disabled={busy || plan.todayLeft <= 0}>
            {busy ? "Writing your questions…" : "Start"}
          </button>
          {plan.todayLeft <= 0 && <p className="lrn-note">That is enough for today. Come back tomorrow.</p>}
          {err && <p className="lrn-plan-err" role="alert">{err}</p>}
          <p className="lrn-note">
            {item.doneThisWeek} of {item.planned} done this week. What you get wrong becomes a flashcard.
          </p>
        </section>
      )}

      {/* 3 · How it went, above the paper, because it is what they came back for. */}
      {res && (
        <section className="lrn-sec" aria-live="polite">
          <p className="lrn-score">{res.correct} of {res.asked} right · {res.pct}%</p>
          <p className="lrn-note">
            {res.nextLevel > res.level ? "That moves you up to level " + res.nextLevel + "."
              : res.nextLevel < res.level ? "The next go steps back to level " + res.nextLevel + " to fill the gaps."
              : "The next go stays at level " + res.level + "."}
            {res.cardsMade > 0 ? " " + res.cardsMade + " flashcard" + (res.cardsMade === 1 ? "" : "s") + " made from what you missed." : ""}
            {res.tick ? " This counts: " + res.tick.done + " of " + res.tick.planned + " for the week." : ""}
          </p>
          <div className="lrn-plan-go">
            <button type="button" className="lrn-btn" onClick={back}>Back to my plan</button>
            <button type="button" className="lrn-btn is-ghost" onClick={() => { setDrill(null); setRes(null); setPicked({}); load(); }}>Another go</button>
          </div>
        </section>
      )}

      {/* 2 · The paper. */}
      {drill && (
        <ol className="lrn-qs">
          {qs.map((q, i) => {
            const m = res && res.marks[i];
            return (
              <li key={i} className={"lrn-q" + (m ? (m.right ? " is-right" : " is-wrong") : "")}>
                <p className="lrn-q-t"><span className="lrn-q-n">{i + 1}.</span> {q.q}</p>
                <div className="lrn-q-opts" role="group" aria-label={"Question " + (i + 1)}>
                  {q.options.map((o, k) => (
                    <label key={k} className={"lrn-opt"
                      + (m && k === m.answer ? " is-right" : "")
                      + (m && k === m.picked && k !== m.answer ? " is-wrong" : "")}>
                      <input type="radio" name={"q" + i} checked={picked[i] === k} disabled={!!res}
                             onChange={() => setPicked(st => ({ ...st, [i]: k }))}/>
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
                {/* The reason, not just a verdict: this is the part that teaches. */}
                {m && m.why && <p className="lrn-why"><b>{m.right ? "Why" : "How to get it"}:</b> {m.why}</p>}
              </li>
            );
          })}
        </ol>
      )}

      {drill && !res && (
        <div className="lrn-sec">
          <button type="button" className="lrn-btn" onClick={mark} disabled={busy || !all}>{busy ? "Marking…" : "Mark my answers"}</button>
          {!all && <p className="lrn-note">Answer all {qs.length} to mark them.</p>}
        </div>
      )}
    </div>
  );
}

/* ── The review: last session's questions, on their own ──────────────────── */
function LearnReview({ d }) {
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading"/>;
  const units = (d.units || []);
  /* A lesson carries the questions you are asked about it a week later. What
     is waiting is every lesson you have not finished that has questions on
     it — which is exactly what the next session will open with. */
  const waiting = units.filter(u => u.checks > 0 && (!u.progress || u.progress.status !== "completed"));
  const marked = units.filter(u => u.progress && u.progress.pending);
  return (
    <div className="lrn-stack">
      <section className="lrn-aside">
        <h2 className="lrn-aside-h">How the review works</h2>
        <p>Every lesson's questions are asked at the <b>start of the next session</b>, a week later, from memory.
          That gap is the point: remembering a week later is what makes it stick.</p>
      </section>
      {marked.length > 0 && (
        <section className="lrn-group" aria-label="With your instructor">
          <h2 className="lrn-group-h">With your instructor</h2>
          <p className="lrn-note">You have answered these. Your score appears when they are marked.</p>
          <ul className="lrn-list">{marked.map(u => <LearnLessonCard key={u.unitId} u={u} showCourse/>)}</ul>
        </section>
      )}
      {waiting.length > 0 ? (
        <section className="lrn-group" aria-label="To be asked">
          <h2 className="lrn-group-h">You will be asked about these</h2>
          <ul className="lrn-list">{waiting.map(u => <LearnLessonCard key={u.unitId} u={u} showCourse/>)}</ul>
        </section>
      ) : (
        <div className="lrn-empty"><i className="ph-fill ph-check-circle" aria-hidden="true"/>
          <h2>Nothing waiting.</h2><p>You have finished every lesson that has questions on it.</p></div>
      )}
    </div>
  );
}

/* ── The page ────────────────────────────────────────────────────────────────
 * Signed out, /learn is still a real address: it says what it is and offers
 * the way in, rather than a blank screen or a bounce to the home page. A
 * member following a lesson link from a mentor lands here, signs in, and is
 * on the lesson. */
function LearnPage({ setPage }) {
  const { isSignedIn, loading, openSignIn } = useAuth();
  if (loading) return <div className="lrn-app"><div className="lrn-shell"><div className="lrn-main"><div className="lrn-wait" role="status" aria-label="Loading"/></div></div></div>;
  if (!isSignedIn) return (
    <div className="lrn-app">
      <div className="lrn-shell"><div className="lrn-main">
        <div className="lrn-empty">
          <i className="ph ph-book-open-text" aria-hidden="true"/>
          <h2>Sign in to open your lessons.</h2>
          <p>This is the NGG Club curriculum — your lessons, your review and the study helper. You need your member account.</p>
          <button type="button" className="lrn-btn" onClick={openSignIn}>Sign in</button>
          <a className="lrn-btn is-ghost" href="/" onClick={e => { e.preventDefault(); setPage && setPage("home"); }}>Back to the website</a>
        </div>
      </div></div>
    </div>
  );
  return <LearnApp/>;
}

/* ── The shell ───────────────────────────────────────────────────────────── */
function LearnApp() {
  const [route, setRoute] = React.useState(lrnRoute);
  const [d, setD] = React.useState(null);
  const [plan, setPlan] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.member.curriculum().then(setD).catch(e => setErr(e.code || e.message || "failed"));
  }, []);
  /* The school plan is loaded HERE, beside the curriculum, because "this
     week" means both kinds of work. Its own request and its own silence:
     school results not being set up must never cost anybody their lessons. */
  const loadPlan = React.useCallback(() => NGGApi.member.studyPlan().then(setPlan).catch(() => setPlan(null)), []);
  React.useEffect(() => { load(); loadPlan(); }, [load, loadPlan]);
  React.useEffect(() => {
    const sync = () => { setRoute(lrnRoute()); window.scrollTo(0, 0); };
    window.addEventListener("popstate", sync);
    window.addEventListener("ngg:learnroute", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("ngg:learnroute", sync); };
  }, []);
  React.useEffect(() => { document.title = "Learn · NGG"; }, []);

  const view = route.view;
  const here = view === "course" || view === "lesson" ? "courses" : view === "drill" ? "plan" : view;

  if (err === "not_ngg_member") return (
    <div className="lrn-app"><div className="lrn-shell"><div className="lrn-main"><div className="lrn-empty">
      <i className="ph ph-info" aria-hidden="true"/><h2>The Club curriculum is for NGG members.</h2>
      <p>Summer School has its own course log, kept with your instructor.</p>
      <a className="lrn-btn" href="/dashboard">Back to my portal</a></div></div></div></div>
  );

  return (
    <div className="lrn-app"><div className="lrn-shell">
      <header className="lrn-top">
        <a className="lrn-home" href="/dashboard" aria-label="Back to my NGG portal">
          <img src="/assets/logo.png" alt="" className="lrn-logo"/>
          <span><b>Learn</b><small>Next Generation Genius</small></span>
        </a>
        <a className="lrn-exit" href="/dashboard"><i className="ph ph-arrow-u-up-left" aria-hidden="true"/><span>My portal</span></a>
      </header>

      <nav className="lrn-rail" aria-label="Learn">
        {LRN_NAV.map(n => (
          <a key={n.id} href={n.path} aria-current={here === n.id ? "page" : undefined}
             className={"lrn-rail-item" + (here === n.id ? " is-on" : "")}
             onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo(n.path); }}>
            <i className={here === n.id ? n.icon.replace("ph ", "ph-fill ") : n.icon} aria-hidden="true"/>
            <span>{n.label}</span>
          </a>
        ))}
      </nav>

      <main className="lrn-main">
        {err && err !== "not_ngg_member" && view !== "lesson"
          ? <ErrorState title="Couldn't load your lessons" code={err} onRetry={load}/>
          : view === "lesson" ? <LearnLesson unitId={route.unitId} onDone={load}/>
          : view === "courses" ? <LearnCourses d={d}/>
          : view === "course" ? <LearnCourse d={d} slug={route.slug}/>
          : view === "plan" ? <LearnPlan d={plan} onRetry={loadPlan}/>
          : view === "drill" ? <LearnDrill itemId={route.itemId} onChanged={loadPlan}/>
          : view === "review" ? <LearnReview d={d}/>
          : view === "helper" ? <CurStudyHelper units={(d && d.units) || []}/>
          : <LearnWeek d={d} plan={plan} onRetry={load}/>}
      </main>
    </div></div>
  );
}
