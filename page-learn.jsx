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
     /learn/notes                My notes, and the lessons I saved for later
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
  { id: "timetable", path: "/learn/timetable", label: "Timetable", icon: "ph ph-clock" },
  { id: "plan",    path: "/learn/plan",    label: "School",     icon: "ph ph-exam" },
  { id: "review",  path: "/learn/review",  label: "Review",     icon: "ph ph-target" },
  { id: "notes",   path: "/learn/notes",   label: "Notes",      icon: "ph ph-note-pencil" },
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
  if (a === "timetable") return { view: "timetable" };
  if (a === "plan") return b ? { view: "drill", itemId: decodeURIComponent(b) } : { view: "plan" };
  if (a === "review") return { view: "review" };
  if (a === "notes") return { view: "notes" };
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
        {u.summary && <span className="lrn-card-sum">{u.summary}</span>}
        <span className="lrn-card-meta">
          {(u.path ? u.path.code : "Week " + u.week)}
          {u.durationMins ? " · about " + u.durationMins + " minutes" : ""}
          {u.checks ? " · " + u.checks + (u.checks === 1 ? " question" : " questions") : ""}
          {!late && lrnDue(u) ? " · " + lrnDue(u) : ""}
        </span>
        {late && <span className="lrn-card-late">{u.overdueDays} day{u.overdueDays === 1 ? "" : "s"} late</span>}
      </a>
    </li>
  );
}

/* ── Time and the timetable ──────────────────────────────────────────────────
   The member's own classes come with the boot (member.timetable): each slot
   carries `mine` when it is one of their courses. Days are 0 (Sunday) to 6. */
const LRN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function lrnMins(t) { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function lrnClock(t) { const n = lrnMins(t); if (n === null) return t || ""; const h = Math.floor(n / 60), mi = n % 60; return (h % 12 || 12) + (mi ? ":" + String(mi).padStart(2, "0") : "") + (h < 12 ? "am" : "pm"); }
/* The next time one of these slots meets, from now: the slot and its date. */
function lrnNextClass(slots, now) {
  const t = now || new Date(); let best = null;
  (slots || []).forEach(s => {
    const start = lrnMins(s.startTime), end = lrnMins(s.endTime) || start;
    if (start === null || s.weekday == null) return;
    let add = (Number(s.weekday) - t.getDay() + 7) % 7;
    const nowM = t.getHours() * 60 + t.getMinutes();
    if (add === 0 && nowM >= end) add = 7;                    // today's has finished: next week's
    const when = new Date(t.getFullYear(), t.getMonth(), t.getDate() + add, Math.floor(start / 60), start % 60);
    const live = add === 0 && nowM >= start && nowM < end;
    if (!best || when < best.when) best = { slot: s, when, live, inDays: add };
  });
  return best;
}
function lrnWhenSay(n) {
  if (!n) return "";
  if (n.live) return "On now, until " + lrnClock(n.slot.endTime);
  if (n.inDays === 0) return "Today, " + lrnClock(n.slot.startTime);
  if (n.inDays === 1) return "Tomorrow, " + lrnClock(n.slot.startTime);
  return LRN_DAYS[n.when.getDay()] + " " + n.when.getDate() + " " + n.when.toLocaleDateString("en-GB", { month: "short" }) + ", " + lrnClock(n.slot.startTime);
}
function lrnGreeting(first) {
  const h = new Date().getHours();
  return (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + (first ? ", " + first : "");
}

/* The next class, on its own card. Their courses first; when none of their
   courses is on the timetable it says so rather than offering somebody else's. */
function LearnNextClass({ tt, compact }) {
  if (!tt) return null;
  const mine = (tt.slots || []).filter(s => s.mine);
  const n = lrnNextClass(mine);
  const go = e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo("/learn/timetable"); };
  if (!n) return (
    <section className={"lrn-next is-none" + (compact ? " is-compact" : "")} aria-label="Your next class">
      <p className="lrn-next-k">Your next class</p>
      <p className="lrn-next-t">Not on the timetable yet</p>
      <p className="lrn-next-s">{(tt.courses || []).length ? "Your centre has not given " + tt.courses.slice(0, 2).join(" or ") + " a time yet." : "You are not on a course yet: ask your centre."}</p>
      <a className="lrn-next-link" href="/learn/timetable" onClick={go}>See the centre's week <i className="ph ph-arrow-right" aria-hidden="true"/></a>
    </section>
  );
  const s = n.slot;
  return (
    <section className={"lrn-next" + (n.live ? " is-live" : "") + (compact ? " is-compact" : "")} aria-label="Your next class">
      <p className="lrn-next-k">{n.live ? "Your class is on now" : "Your next class"}</p>
      <p className="lrn-next-t">{s.course}{s.level ? " · " + s.level : ""}</p>
      <p className="lrn-next-w"><i className="ph ph-calendar-blank" aria-hidden="true"/>{lrnWhenSay(n)}{!n.live && s.endTime ? " – " + lrnClock(s.endTime) : ""}</p>
      <ul className="lrn-next-meta">
        {(s.room || tt.centre) && <li><i className="ph ph-map-pin" aria-hidden="true"/>{[s.room, tt.centre].filter(Boolean).join(", ")}</li>}
        {s.instructor && <li><i className="ph ph-chalkboard-teacher" aria-hidden="true"/>{s.instructor}</li>}
      </ul>
      {!compact && <a className="lrn-next-link" href="/learn/timetable" onClick={go}>My whole week <i className="ph ph-arrow-right" aria-hidden="true"/></a>}
    </section>
  );
}

/* Where each course stands: the shelf in miniature, beside the week. */
function LearnCourseBars({ units }) {
  const by = {};
  (units || []).forEach(u => { const c = u.course || "Whole Club"; (by[c] = by[c] || []).push(u); });
  const names = Object.keys(by).sort();
  if (!names.length) return null;
  return (
    <section className="lrn-bars" aria-label="Your courses">
      <h2 className="lrn-sec-h">Your courses</h2>
      <ul>
        {names.map(c => {
          const us = by[c], done = us.filter(u => u.progress && u.progress.status === "completed").length, pct = Math.round(done / us.length * 100);
          return (
            <li key={c}>
              <a href={"/learn/course/" + lrnSlug(c)} onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo("/learn/course/" + lrnSlug(c)); }}>
                <span className="lrn-bars-n">{c}</span><span className="lrn-bars-p">{pct}%</span>
                <span className="lrn-meter is-sm" role="img" aria-label={done + " of " + us.length + " lessons done"}><span style={{ width: pct + "%" }}/></span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── The richer pieces: a ring, a due date, the next lesson, the term ────── */

/** An in-app link: a real href, and a client-side move on a plain click. */
function lrnLink(path) {
  return { href: path, onClick: e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); lrnGo(path); } };
}
const lrnDone = u => !!(u.progress && u.progress.status === "completed");
/** "Due Sat 31 Oct" from a YYYY-MM-DD, or "". */
function lrnDue(u) {
  if (!u.dueDate || lrnDone(u)) return "";
  const t = new Date(u.dueDate + "T12:00:00");
  if (isNaN(t)) return "";
  return "Due " + t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
/** Minutes as words: "45 min", "2 h 30 min". */
function lrnDur(m) { m = Math.round(m || 0); return m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : ""); }

/** A progress ring. The number inside is the figure; the ring only draws it. */
function LearnRing({ pct, size, label, sub }) {
  const r = 42, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
  return (
    <span className={"lrn-ring" + (size === "sm" ? " is-sm" : size === "lg" ? " is-lg" : "")} role="img" aria-label={label || p + "% done"}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="lrn-ring-bg" cx="50" cy="50" r={r}/>
        <circle className="lrn-ring-fg" cx="50" cy="50" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}/>
      </svg>
      <span className="lrn-ring-n" aria-hidden="true"><b>{p}%</b>{sub && <small>{sub}</small>}</span>
    </span>
  );
}

/* The one lesson to do now, large: what it is about, how long, when it is
   due, and one button. Everything else on the week is the rest of the list. */
function LearnUpNext({ u, why, pickup }) {
  if (!u) return null;
  const started = !!u.progress && !lrnDone(u);
  const late = u.overdueDays > 0 && !(u.progress && u.progress.pending);
  const due = lrnDue(u);
  /* The whole card is the link: a child taps the lesson, not a button on it. */
  return (
    <a className={"lrn-upnext" + (late ? " is-late" : "") + (pickup ? " lrn-pickup" : "")} {...lrnLink("/learn/lesson/" + encodeURIComponent(u.unitId))}>
      <span className="lrn-upnext-k"><i className={pickup ? "ph-fill ph-play-circle" : late ? "ph-fill ph-warning-circle" : "ph-fill ph-star"} aria-hidden="true"/>{why}</span>
      <span className="lrn-upnext-c">{u.course || "Whole Club"}{u.path ? " · " + u.path.label : ""}</span>
      <h2 className="lrn-upnext-t">{u.title}</h2>
      {u.summary && <span className="lrn-upnext-s">{u.summary}</span>}
      <span className="lrn-upnext-meta">
        {u.durationMins > 0 && <span><i className="ph ph-timer" aria-hidden="true"/>About {lrnDur(u.durationMins)}</span>}
        {u.checks > 0 && <span><i className="ph ph-list-checks" aria-hidden="true"/>{u.checks} {u.checks === 1 ? "question" : "questions"}</span>}
        {u.materials > 0 && <span><i className="ph ph-paperclip" aria-hidden="true"/>{u.materials} {u.materials === 1 ? "material" : "materials"}</span>}
        {late ? <span className="is-late"><i className="ph ph-warning" aria-hidden="true"/>{u.overdueDays} day{u.overdueDays === 1 ? "" : "s"} late</span>
              : due && <span><i className="ph ph-calendar-blank" aria-hidden="true"/>{due}</span>}
      </span>
      <span className="lrn-upnext-go">{started ? "Carry on" : "Start the lesson"} <i className="ph ph-arrow-right" aria-hidden="true"/></span>
    </a>
  );
}

/** Lessons in terms: "Y1·T1" → { key, label, weeks: {1: [units]} }, in order. */
function lrnTerms(units) {
  const terms = [];
  units.forEach(u => {
    const p = u.path || { year: u.year || 0, term: 1, week: u.week, label: "" };
    const key = (p.year || 0) + "·" + p.term;
    let t = terms.find(x => x.key === key);
    if (!t) { t = { key, year: p.year || 0, term: p.term, name: p.termName || "", weeks: {} }; terms.push(t); }
    (t.weeks[p.week] = t.weeks[p.week] || []).push(u);
  });
  return terms.sort((a, b) => a.year - b.year || a.term - b.term);
}
/** One week's state: done, late, started, open, or nothing to do. */
function lrnWeekState(us) {
  if (!us || !us.length) return "none";
  if (us.every(lrnDone)) return "done";
  if (us.some(u => u.overdueDays > 0 && !lrnDone(u) && !(u.progress && u.progress.pending))) return "late";
  if (us.some(u => u.progress && !lrnDone(u)) || us.some(lrnDone)) return "going";
  return "open";
}
const LRN_WEEK_SAY = { done: "done", late: "late", going: "started", open: "to do", none: "no lessons" };

/* The term at a glance: one cell a week, coloured by where it stands, the
   week they are on marked. A list says what is next; this says how far. */
function LearnTermMap({ units, termWeeks, focus }) {
  const terms = lrnTerms(units);
  if (!terms.length) return null;
  const at = terms.find(t => Object.values(t.weeks).some(us => us.some(u => !lrnDone(u)))) || terms[terms.length - 1];
  const n = Math.max(termWeeks || 12, ...Object.keys(at.weeks).map(Number));
  const here = focus && focus.path ? focus.path.week : null;
  const cells = Array.from({ length: n }, (_, i) => i + 1);
  const doneW = cells.filter(w => lrnWeekState(at.weeks[w]) === "done").length;
  return (
    <section className="lrn-term" aria-label="This term, week by week">
      <div className="lrn-term-head">
        <h2 className="lrn-sec-h">{(at.year ? "Year " + at.year + " · " : "") + "Term " + at.term + (at.name ? ": " + at.name : "")}</h2>
        <span className="lrn-term-s">{doneW} of {cells.filter(w => at.weeks[w]).length} weeks done</span>
      </div>
      <ol className="lrn-term-grid">
        {cells.map(w => {
          const us = at.weeks[w], st = lrnWeekState(us), first = us && (us.find(u => !lrnDone(u)) || us[0]);
          const label = "Week " + w + ": " + (us ? us.length + (us.length === 1 ? " lesson, " : " lessons, ") : "") + LRN_WEEK_SAY[st] + (w === here ? ", you are here" : "");
          const inner = <><span className="lrn-term-w">{w}</span><span className="lrn-term-dots" aria-hidden="true">{(us || []).slice(0, 4).map(u => <i key={u.unitId} className={lrnDone(u) ? "is-done" : ""}/>)}</span></>;
          return (
            <li key={w} className={"lrn-term-cell is-" + st + (w === here ? " is-here" : "")}>
              {first ? <a {...lrnLink("/learn/lesson/" + encodeURIComponent(first.unitId))} aria-label={label} title={label}>{inner}</a>
                     : <span aria-label={label} title={label}>{inner}</span>}
            </li>
          );
        })}
      </ol>
      <ul className="lrn-term-key" aria-hidden="true">
        <li><i className="is-done"/>Done</li><li><i className="is-going"/>Started</li><li><i className="is-open"/>To do</li><li><i className="is-late"/>Late</li>
      </ul>
    </section>
  );
}

/* What they kept: lessons saved for later, and the last note written. */
function LearnKept({ d }) {
  const L = d.learn || {}, byId = {};
  (d.units || []).forEach(u => { byId[u.unitId] = u; });
  const saved = (L.saved || []).map(x => byId[x.unitId]).filter(Boolean).slice(0, 4);
  const note = (L.notes || []).find(x => byId[x.unitId]);
  if (!saved.length && !note) return null;
  return (
    <section className="lrn-kept" aria-label="What you kept">
      {saved.length > 0 && <>
        <h2 className="lrn-sec-h">Saved for later</h2>
        <ul className="lrn-kept-list">
          {saved.map(u => (
            <li key={u.unitId}><a {...lrnLink("/learn/lesson/" + encodeURIComponent(u.unitId))}>
              <i className="ph-fill ph-bookmark-simple" aria-hidden="true"/><span><b>{u.title}</b><small>{u.course || "Whole Club"}</small></span>
            </a></li>
          ))}
        </ul>
      </>}
      {note && <>
        <h2 className="lrn-sec-h">Your latest note</h2>
        <a className="lrn-kept-note" {...lrnLink("/learn/notes")}>
          <span>“{note.note.length > 140 ? note.note.slice(0, 140).trim() + "…" : note.note}”</span>
          <small>On {byId[note.unitId].title}</small>
        </a>
      </>}
    </section>
  );
}

/* ── Timetable: their week ───────────────────────────────────────────────── */
function LearnTimetable({ tt, failed, onRetry }) {
  const [all, setAll] = React.useState(false);
  if (failed && !tt) return <ErrorState title="Couldn't load your timetable" code="load_failed" onRetry={onRetry}/>;
  if (!tt) return <div className="lrn-wait" role="status" aria-label="Loading your timetable"/>;
  const slots = tt.slots || [];
  const mine = slots.filter(s => s.mine);
  const shown = all ? slots : mine;
  const byDay = {};
  shown.forEach(s => { (byDay[s.weekday] = byDay[s.weekday] || []).push(s); });
  const order = [6, 0, 1, 2, 3, 4, 5].filter(d => byDay[d]);   // Saturday first: the Club's day
  const today = new Date().getDay();
  return (
    <div className="lrn-stack">
      <header className="lrn-head">
        <h1 className="lrn-h1">My timetable</h1>
        <p className="lrn-head-s">{tt.centre ? tt.centre + " centre" : "Your centre"}{(tt.courses || []).length ? " · " + tt.courses.join(", ") : ""}</p>
      </header>
      <LearnNextClass tt={tt} compact/>
      <div className="lrn-seg" role="group" aria-label="Show">
        <button type="button" aria-pressed={!all} className={!all ? "is-on" : ""} onClick={() => setAll(false)}>My classes · {mine.length}</button>
        <button type="button" aria-pressed={all} className={all ? "is-on" : ""} onClick={() => setAll(true)}>The whole centre · {slots.length}</button>
      </div>
      {!shown.length ? (
        <div className="lrn-empty">
          <i className="ph ph-clock" aria-hidden="true"/>
          <h2>{all ? "Nothing is on this centre's timetable yet." : "None of your courses has a time yet."}</h2>
          <p>{all ? "Your centre adds its classes as the term is planned." : "Your centre gives each course a day, a time and a room. Until then, check the whole centre's week or ask your instructor."}</p>
          {!all && slots.length > 0 && <button type="button" className="lrn-btn is-ghost" onClick={() => setAll(true)}>See the whole centre</button>}
        </div>
      ) : (
        <ol className="lrn-days">
          {order.map(d => (
            <li key={d} className={"lrn-day" + (d === today ? " is-today" : "")}>
              <h2 className="lrn-day-h">{LRN_DAYS[d]}{d === today ? <span className="lrn-day-tag">Today</span> : null}</h2>
              <ul className="lrn-slots">
                {byDay[d].map(s => (
                  <li key={s.slotId || s.course + s.startTime} className={"lrn-slot" + (s.mine ? " is-mine" : "")}>
                    <span className="lrn-slot-t">{lrnClock(s.startTime)}<small>{s.endTime ? lrnClock(s.endTime) : ""}</small></span>
                    <span className="lrn-slot-c"><b>{s.course}{s.level ? " · " + s.level : ""}</b>
                      <span>{[s.room, s.instructor].filter(Boolean).join(" · ") || "Room to be confirmed"}</span></span>
                    {s.mine && all && <span className="lrn-slot-mine">Yours</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ── This week ───────────────────────────────────────────────────────────── */
function LearnWeek({ d, plan, aw, me, tt, onRetry }) {
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
  // What follows, so the week shows the road ahead and not only today's step.
  const later = open.filter(u => !u.progress && u.week > lowest && !(u.overdueDays > 0))
    .sort((a, b) => (a.year || 0) - (b.year || 0) || a.week - b.week || a.position - b.position).slice(0, 3);
  const done = units.length - open.length;
  /* Where they were: the last lesson they opened that is not finished. The
     address is real, so this is the same lesson on the phone and the laptop. */
  const L = d.learn || {};
  const byId = {}; units.forEach(u => { byId[u.unitId] = u; });
  const pick = (L.recent || []).map(r => byId[r.unitId]).find(u => u && (!u.progress || u.progress.status !== "completed"));
  const st = L.stats || null;
  const m = me || {};
  const hero = pick || late[0] || going[0] || next[0] || null;
  const rest = list => list.filter(u => u !== hero);
  return (
    <div className="lrn-week">
      <header className="lrn-head">
        <p className="lrn-head-k">{m.weekNow ? "Week " + m.weekNow + (m.termWeeks ? " of " + m.termWeeks : "") : "This week"}</p>
        <h1 className="lrn-h1">{lrnGreeting(m.first)}</h1>
        <p className="lrn-head-s">{late.length ? late.length + (late.length === 1 ? " lesson is" : " lessons are") + " late. Start with " + (late.length === 1 ? "it" : "those") + "."
          : open.length ? open.length + (open.length === 1 ? " lesson" : " lessons") + " to do. " + (next.length ? "Start with " + next[0].title + "." : "")
          : "Everything is done. Well played."}</p>
      </header>
      <div className="lrn-week-grid">
      <div className="lrn-stack">
      {/* One lesson, large: where they left off, else what is late, else
          what they started, else the first new one. The lists below are the rest. */}
      <LearnUpNext u={hero} pickup={hero === pick} why={hero === pick ? "Pick up where you left off" : late.includes(hero) ? "Late — do this first" : going.includes(hero) ? "Carry on" : "Up next"}/>
      <section className="lrn-prog" aria-label="Your progress">
        <LearnRing pct={d.pct} size="lg" label={d.pct + "% of your lessons done"}/>
        <div className="lrn-prog-body">
          <p className="lrn-prog-n">{done} of {units.length} lessons done</p>
          {d.overdue > 0
            ? <p className="lrn-prog-s is-late">{d.overdue} {d.overdue === 1 ? "is" : "are"} late</p>
            : <p className="lrn-prog-s">Nothing is late. Keep going.</p>}
          {st && (
            <ul className="lrn-figs" aria-label="Your learning so far">
              <li><i className="ph-fill ph-fire" aria-hidden="true"/><b>{st.streakWeeks}</b><span>{st.streakWeeks === 1 ? "week" : "weeks"} in a row</span></li>
              <li><i className="ph-fill ph-check-circle" aria-hidden="true"/><b>{st.doneThisWeek}</b><span>done this week</span></li>
              <li><i className="ph-fill ph-hourglass-medium" aria-hidden="true"/><b>{st.minutes >= 120 ? Math.round(st.minutes / 60) : st.minutes}</b><span>{st.minutes >= 120 ? "hours" : "minutes"} learned</span></li>
              <li><i className="ph-fill ph-stack" aria-hidden="true"/><b>{open.length}</b><span>still to do</span></li>
            </ul>
          )}
        </div>
      </section>
      {aw && (aw.earned > 0) && (
        <section className="lrn-earned" aria-label="What you hold">
          <i className="ph-fill ph-seal-check" aria-hidden="true"/>
          <p>
            <b>{aw.earned} {aw.earned === 1 ? "credential" : "credentials"}</b> from outside NGG
            {" · "}{(aw.held || []).filter(h => h.state === "earned").map(h => h.title).slice(0, 3).join(", ")}
          </p>
        </section>
      )}
      <LearnTermMap units={units} termWeeks={m.termWeeks} focus={hero}/>
      {/* School sits WITH the Club's lessons rather than behind another tab:
          a member's week is one week, and a plan they agreed to in their own
          results is not a different kind of thing to remember separately. */}
      <LearnSchoolStrip plan={plan}/>
      {rest(late).length > 0 && <LearnGroup title="Also late" tone="late" units={rest(late)}/>}
      {rest(going).length > 0 && <LearnGroup title="Carry on" units={rest(going)}/>}
      {rest(next).length > 0 && <LearnGroup title={hero && next.includes(hero) ? "Also this week" : "Then this"} units={rest(next)}/>}
      {later.length > 0 && <LearnGroup title="Coming up" units={later}/>}
      {!late.length && !next.length && !going.length && !later.length && (
        <div className="lrn-empty">
          <i className="ph-fill ph-check-circle" aria-hidden="true"/>
          <h2>Everything is done.</h2>
          <p>Nothing is waiting for you. Your next lesson appears when your instructor publishes it.</p>
          <a className="lrn-btn" href="/learn/courses" onClick={e => { e.preventDefault(); lrnGo("/learn/courses"); }}>Look back over my courses</a>
        </div>
      )}
      </div>
      <aside className="lrn-week-aside" aria-label="Your week">
        <LearnNextClass tt={tt}/>
        <LearnCourseBars units={units}/>
        <LearnKept d={d}/>
      </aside>
      </div>
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

/* Find a lesson across every course: its title, its summary, its course. The
   lessons are already here, so the search is instant and works offline. */
function LearnSearch({ units }) {
  const [q, setQ] = React.useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? units.filter(u => { const hay = (u.title + " " + (u.summary || "") + " " + (u.course || "")).toLowerCase(); return words.every(w => hay.includes(w)); }) : [];
  return (
    <section className="lrn-search" role="search" aria-label="Find a lesson">
      <label className="lrn-search-box">
        <i className="ph ph-magnifying-glass" aria-hidden="true"/>
        <span className="lrn-sr">Find a lesson</span>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a lesson in any course"/>
      </label>
      <p className="lrn-note" role="status" aria-live="polite">{words.length ? (hits.length ? hits.length + (hits.length === 1 ? " lesson matches." : " lessons match.") : "No lesson matches “" + q.trim() + "”.") : ""}</p>
      {hits.length > 0 && <ul className="lrn-list">{hits.slice(0, 30).map(u => <LearnLessonCard key={u.unitId} u={u} showCourse/>)}</ul>}
    </section>
  );
}

/* ── My courses ──────────────────────────────────────────────────────────── */

/** One course's figures, shared by the shelf and the course's own page. */
function lrnCourseFacts(us, tt) {
  const sorted = us.slice().sort((a, b) => (a.year || 0) - (b.year || 0) || a.week - b.week || a.position - b.position);
  const done = sorted.filter(lrnDone).length;
  const late = sorted.filter(u => u.overdueDays > 0 && !lrnDone(u) && !(u.progress && u.progress.pending)).length;
  const next = sorted.find(u => u.progress && !lrnDone(u)) || sorted.find(u => !lrnDone(u)) || null;
  const mins = sorted.reduce((t, u) => t + (u.durationMins || 0), 0);
  const left = sorted.filter(u => !lrnDone(u)).reduce((t, u) => t + (u.durationMins || 0), 0);
  const name = (sorted[0] && sorted[0].course) || "Whole Club";
  const slot = tt ? lrnNextClass((tt.slots || []).filter(x => x.mine && String(x.course).toLowerCase() === name.toLowerCase())) : null;
  const scores = sorted.filter(u => u.progress && u.progress.attempts > 0 && !u.progress.pending).map(u => u.progress.bestPct);
  return { sorted, done, late, next, mins, left, slot, pct: sorted.length ? Math.round(done / sorted.length * 100) : 0,
           avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
}

function LearnCourses({ d, tt }) {
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading your courses"/>;
  const units = d.units || [];
  const by = {};
  units.forEach(u => { const c = u.course || "Whole Club"; (by[c] = by[c] || []).push(u); });
  const names = Object.keys(by).sort();
  if (!names.length) return (
    <div className="lrn-empty"><i className="ph ph-books" aria-hidden="true"/><h2>No courses yet.</h2>
      <p>When your centre puts you on a course, its lessons appear here.</p></div>
  );
  const all = units.filter(lrnDone).length;
  return (
    <div className="lrn-stack">
      <header className="lrn-head">
        <h1 className="lrn-h1">My courses</h1>
        <p className="lrn-head-s">{names.length} {names.length === 1 ? "course" : "courses"} · {all} of {units.length} lessons done</p>
      </header>
      <LearnSearch units={units}/>
      <ul className="lrn-shelf">
        {names.map(c => {
          const f = lrnCourseFacts(by[c], tt);
          return (
            <li key={c}>
              <a className="lrn-course" {...lrnLink("/learn/course/" + lrnSlug(c))}>
                <LearnRing pct={f.pct} size="sm" label={f.done + " of " + f.sorted.length + " lessons done"}/>
                <span className="lrn-course-body">
                  <span className="lrn-course-n">{c}</span>
                  <span className="lrn-course-m">{f.done} of {f.sorted.length} done · about {lrnDur(f.mins)} in all{f.avg !== null ? " · average " + f.avg + "%" : ""}</span>
                  {f.next && <span className="lrn-course-next"><i className="ph ph-arrow-circle-right" aria-hidden="true"/>Next: {f.next.title}</span>}
                  {f.slot && <span className="lrn-course-when"><i className="ph ph-clock" aria-hidden="true"/>{lrnWhenSay(f.slot)}{f.slot.slot.room ? " · " + f.slot.slot.room : ""}</span>}
                </span>
                {f.late > 0 && <span className="lrn-course-late">{f.late} late</span>}
                {!f.next && <span className="lrn-course-done"><i className="ph-fill ph-check-circle" aria-hidden="true"/>Done</span>}
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

/* ── One course: where it stands, then its weeks as a path ───────────────── */
function LearnCourse({ d, slug, aw, onAim, tt }) {
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading the course"/>;
  const units = (d.units || []).filter(u => lrnSlug(u.course || "Whole Club") === slug);
  const name = units.length ? (units[0].course || "Whole Club") : "";
  if (!units.length) return (
    <div className="lrn-empty"><i className="ph ph-book-open-text" aria-hidden="true"/><h2>That course is not one of yours.</h2>
      <p>It may have been renamed, or you may have been moved.</p>
      <a className="lrn-btn" href="/learn/courses" onClick={e => { e.preventDefault(); lrnGo("/learn/courses"); }}>My courses</a></div>
  );
  const f = lrnCourseFacts(units, tt);
  const weeks = [];
  f.sorted.forEach(u => {
    const label = u.path ? u.path.label.replace(/ · Week \d+$/, "") : "";
    const k = (u.year || 0) + "|" + (u.path ? u.path.term : 0) + "|" + u.week;
    const w = weeks.find(x => x.k === k);
    w ? w.units.push(u) : weeks.push({ k, week: u.path ? u.path.week : u.week, term: label, units: [u] });
  });
  return (
    <div className="lrn-stack">
      <a className="lrn-back" {...lrnLink("/learn/courses")}><i className="ph ph-arrow-left" aria-hidden="true"/>My courses</a>
      <section className="lrn-chero" aria-label={name + " at a glance"}>
        <LearnRing pct={f.pct} size="lg" label={f.pct + "% of " + name + " done"}/>
        <div className="lrn-chero-body">
          <h2 className="lrn-course-title">{name}</h2>
          <ul className="lrn-chero-figs">
            <li><b>{f.done}/{f.sorted.length}</b><span>lessons done</span></li>
            <li><b>{lrnDur(f.left)}</b><span>left to do</span></li>
            <li><b>{f.avg !== null ? f.avg + "%" : "—"}</b><span>average score</span></li>
            {f.late > 0 && <li className="is-late"><b>{f.late}</b><span>late</span></li>}
          </ul>
          {f.slot && <p className="lrn-chero-when"><i className="ph ph-clock" aria-hidden="true"/>Class: {lrnWhenSay(f.slot)}{f.slot.slot.room ? " · " + f.slot.slot.room : ""}{f.slot.slot.instructor ? " · " + f.slot.slot.instructor : ""}</p>}
          {f.next && <a className="lrn-btn" {...lrnLink("/learn/lesson/" + encodeURIComponent(f.next.unitId))}>{f.next.progress ? "Carry on" : f.done ? "Next lesson" : "Start the course"}: {f.next.title}</a>}
        </div>
      </section>
      <ol className="lrn-path" aria-label={name + ", week by week"}>
        {weeks.map((w, i) => {
          const st = lrnWeekState(w.units), showTerm = w.term && (i === 0 || weeks[i - 1].term !== w.term);
          return (
            <li key={w.k} className={"lrn-path-w is-" + st}>
              {showTerm && <p className="lrn-path-term">{w.term}</p>}
              <h3 className="lrn-group-h"><span className="lrn-path-dot" aria-hidden="true">{st === "done" ? <i className="ph-bold ph-check"/> : w.week}</span>Week {w.week}<span className="lrn-path-st"> · {LRN_WEEK_SAY[st]}</span></h3>
              <ul className="lrn-list">{w.units.map(u => <LearnLessonCard key={u.unitId} u={u}/>)}</ul>
            </li>
          );
        })}
      </ol>
      <LearnAwards aw={aw} course={name} onAim={onAim} onRetry={onAim}/>
    </div>
  );
}

/* ── Where the work leads: credentials from outside NGG ──────────────────── */

/**
 * One award. A child who has done twenty-four weeks of a course should be
 * able to see that there is a recognised certificate at the end of it, and
 * say they are going for it — which is all they may do here. A RESULT is
 * recorded by their centre (domain/providers.php), never asserted on this
 * screen, so there is no control here that claims one.
 */
function LearnAward({ a, onAim, busy }) {
  const held = a.state === "earned" || a.state === "lapsed";
  return (
    <li>
      <div className={"lrn-award" + (held ? " is-held" : "")}>
        <div className="lrn-award-top">
          <span className="lrn-award-by">{a.provider}</span>
          {a.free && !held && <span className="lrn-card-chip">Free</span>}
          {a.state && <span className={"lrn-card-chip" + (a.state === "earned" ? " ok" : a.state === "lapsed" ? " warn" : "")}>{a.stateLabel}</span>}
        </div>
        <span className="lrn-award-title">{a.title}{a.level ? " · " + a.level : ""}</span>
        <span className="lrn-award-meta">
          {a.kindLabel}
          {a.grade ? " · " + a.grade : ""}
          {a.awardedOn ? " · " + a.awardedOn : ""}
          {!held && a.costNote ? " · " + a.costNote : ""}
        </span>
        {a.examNote && !held && <span className="lrn-award-meta">{a.examNote}</span>}
        <div className="lrn-award-acts">
          {a.url && <a className="lrn-award-link" href={a.url} target="_blank" rel="noopener noreferrer">About it ↗</a>}
          {a.evidenceUrl && <a className="lrn-award-link" href={a.evidenceUrl} target="_blank" rel="noopener noreferrer">Your certificate ↗</a>}
          {!held && onAim && (
            <button type="button" className={"lrn-award-aim" + (a.state === "aiming" ? " is-on" : "")}
                    aria-pressed={a.state === "aiming"} disabled={busy}
                    onClick={() => onAim(a)}>
              {a.state === "aiming" ? "You're going for this" : "I'm going for this"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** The routes out of ONE course, plus anything they already hold from it. */
function LearnAwards({ aw, course, onAim, onRetry }) {
  const [busy, setBusy] = React.useState("");
  /* `aw` is null only when the load FAILED — an empty registry still comes
     back as a real answer with empty lists. Saying nothing in both cases is
     the silent empty that hides an outage (CLAUDE.md §9), so a failure says
     so and offers the retry. It stays quiet and small: this is the bottom of
     a course page, not the lesson, and nothing here blocks the work. */
  if (!aw) return onRetry ? (
    <section className="lrn-group" aria-label="Where this leads">
      <h3 className="lrn-group-h">Where this leads</h3>
      <p className="lrn-note" role="status">
        Couldn't load where this course leads.{" "}
        <button type="button" className="lrn-note-retry" onClick={onRetry}>Try again</button>
      </p>
    </section>
  ) : null;
  const mine = (aw.held || []).filter(a => !course || (a.fromCourses || []).indexOf(course) >= 0);
  const open = (aw.routes || []).filter(a => !course || (a.fromCourses || []).indexOf(course) >= 0);
  if (!mine.length && !open.length) return null;
  const aim = async (a) => {
    setBusy(a.awardId);
    try { await NGGApi.member.providerAim(a.awardId, a.state === "aiming"); if (onAim) await onAim(); }
    catch (e) { toast.error(humanizeError(e.code, e.code)); }
    finally { setBusy(""); }
  };
  return (
    <section className="lrn-group" aria-label="Where this leads">
      <h3 className="lrn-group-h">Where this leads</h3>
      <p className="lrn-note">
        These are awarded by bodies outside NGG. Your centre records a result — here you can say what you are working towards.
      </p>
      <ul className="lrn-list">
        {mine.map(a => <LearnAward key={a.awardId} a={a} busy={busy === a.awardId}/>)}
        {open.map(a => <LearnAward key={a.awardId} a={a} onAim={aim} busy={busy === a.awardId}/>)}
      </ul>
    </section>
  );
}

/* ── A lesson, full screen ───────────────────────────────────────────────── */
/* Go deeper: a short read fetched from Wikipedia on the lesson's topic, and
   vetted free sources for the course (domain/learn.php). Its own request, its
   own silence: a source that does not answer never costs anybody the lesson. */
function LearnDeeper({ unitId }) {
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true; setD(null); setFailed(false);
    NGGApi.member.learnSources(unitId).then(r => { if (live) setD(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [unitId]);
  if (failed || (d && !d.read && !(d.sources || []).length)) return null;
  return (
    <section className="lrn-sec lrn-deeper" aria-labelledby="lrn-deeper-h">
      <h2 className="lrn-sec-h" id="lrn-deeper-h">Go deeper</h2>
      {!d ? <div className="lrn-wait is-sm" role="status" aria-label="Finding good sources"/> : (
        <>
          {d.read && (
            <figure className="lrn-read">
              <figcaption><b>{d.read.title}</b></figcaption>
              <blockquote cite={d.read.url}><p>{d.read.extract}</p></blockquote>
              <p className="lrn-read-src">
                From <a href={d.read.url} target="_blank" rel="noopener">{d.read.source}</a>, shared under{" "}
                <a href={d.read.licenceUrl} target="_blank" rel="noopener license">{d.read.licence}</a>. Anybody can edit it, so check what matters.
              </p>
            </figure>
          )}
          {(d.sources || []).length > 0 && (
            <>
              <p className="lrn-note">Free places to learn more, chosen for this course. They open in a new tab.</p>
              <ul className="lrn-sources">
                {d.sources.map(x => (
                  <li key={x.url}>
                    <a href={x.url} target="_blank" rel="noopener">
                      <span className="lrn-src-t">{x.title}</span>
                      <span className="lrn-src-by">{x.by}</span>
                      <span className="lrn-src-why">{x.why}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

/* Their own note on the lesson, saved to their account — on any device, and
   never shown to staff. Saved when they leave the box and with the button. */
function LearnNote({ unitId, mine, onSaved }) {
  const [v, setV] = React.useState((mine && mine.note) || "");
  const [saved, setSaved] = React.useState((mine && mine.note) || "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => { const n = (mine && mine.note) || ""; setV(n); setSaved(n); setMsg(""); }, [unitId]);
  const dirty = v.trim() !== saved.trim();
  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true); setMsg("");
    try { const r = await NGGApi.member.learnNote(unitId, v); setSaved(r.note); setMsg(r.note ? "Saved." : "Note cleared."); onSaved && onSaved(); }
    catch (e) { setMsg(humanizeError(e.code, "Couldn’t save your note. It is still here — try again.")); }
    finally { setBusy(false); }
  };
  return (
    <section className="lrn-sec lrn-mynote" aria-labelledby="lrn-note-h">
      <h2 className="lrn-sec-h" id="lrn-note-h">My notes</h2>
      <p className="lrn-note">Only you can see these. They are kept with your account, on every device.</p>
      <label className="lrn-sr" htmlFor={"lrn-note-" + unitId}>My notes on this lesson</label>
      <textarea id={"lrn-note-" + unitId} className="lrn-textarea" rows={5} maxLength={4000} value={v}
                placeholder="What clicked, what to ask about, what to try at home…" onChange={e => setV(e.target.value)} onBlur={save}/>
      <div className="lrn-row">
        <button type="button" className="lrn-btn is-ghost" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save note"}</button>
        <span className="lrn-note" role="status" aria-live="polite">{msg}</span>
      </div>
    </section>
  );
}

function LearnLesson({ unitId, onDone, units }) {
  const [saved, setSaved] = React.useState(false);
  const [marking, setMarking] = React.useState(false);
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [answers, setAnswers] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [started, setStarted] = React.useState(false);
  const load = React.useCallback(() => {
    setErr(""); setD(null);
    return NGGApi.member.curriculumUnit(unitId).then(r => { setD(r); setAnswers({}); setResult(null); setStarted(false); setSaved(!!(r.mine && r.mine.saved)); })
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
  /* Where this lesson sits in its course, and the ones either side — so
     finishing one leads to the next instead of back to a list. */
  const course = (units || []).filter(x => (x.course || "") === (u.course || "")).sort((a, b) => a.week - b.week || a.position - b.position);
  const at = course.findIndex(x => x.unitId === unitId);
  const prev = at > 0 ? course[at - 1] : null, next = at >= 0 && at < course.length - 1 ? course[at + 1] : null;
  const toggleSave = async () => {
    const on = !saved; setSaved(on);
    try { await NGGApi.member.learnSave(unitId, on); toast.info(on ? "Saved for later. It is in Notes." : "Taken off your saved lessons.", u.title); if (onDone) onDone(); }
    catch (e) { setSaved(!on); toast.error(humanizeError(e.code, "Couldn’t save it.")); }
  };
  /* A lesson with no questions has nothing to submit, so it could never be
     finished from here. Submitting no answers completes it (the server's
     own rule: nothing to mark is full marks). */
  const markRead = async () => {
    setMarking(true);
    try { const r = await NGGApi.member.curriculumSubmit(unitId, {}); setResult(r); toast.success("Done. On to the next one.", u.title); if (onDone) onDone(); }
    catch (e) { toast.error(humanizeError(e.code, e.code)); }
    finally { setMarking(false); }
  };
  const go = x => e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo("/learn/lesson/" + encodeURIComponent(x.unitId)); };
  return (
    <article className="lrn-lesson">
      <a className="lrn-back" href={back} onClick={e => { e.preventDefault(); lrnGo(back); }}>
        <i className="ph ph-arrow-left" aria-hidden="true"/> {u.course || "All lessons"}
      </a>
      <header className="lrn-lesson-head">
        <p className="lrn-lesson-eyebrow">{(u.path ? u.path.label : "Week " + u.week)} · {(u.course || "Whole Club")}</p>
        <h1 className="lrn-lesson-title">{u.title}</h1>
        {u.summary && <p className="lrn-lesson-sum">{u.summary}</p>}
        <div className="lrn-row">
          <span className={"lrn-card-chip " + st.tone}>{st.label}</span>
          {at >= 0 && <span className="lrn-note">Lesson {at + 1} of {course.length}{u.durationMins ? " · about " + u.durationMins + " minutes" : ""}</span>}
          <button type="button" className={"lrn-save" + (saved ? " is-on" : "")} aria-pressed={saved} onClick={toggleSave}>
            <i className={saved ? "ph-fill ph-bookmark-simple" : "ph ph-bookmark-simple"} aria-hidden="true"/>{saved ? "Saved" : "Save for later"}
          </button>
        </div>
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
          <CurriculumMaterials materials={u.materials} fileUrl={curMemberFile}/>
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

      {opened && u.checks.length === 0 && (
        <section className="lrn-sec lrn-markread">
          {p && p.status === "completed"
            ? <p className="lrn-result"><i className="ph-fill ph-check-circle" aria-hidden="true"/> You have finished this lesson.</p>
            : <><p className="lrn-note">This lesson has no questions. When you have worked through it, mark it done.</p>
                <button type="button" className="lrn-btn" disabled={marking} onClick={markRead}>{marking ? "Saving…" : "Mark as done"}</button></>}
        </section>
      )}

      {opened && <LearnNote unitId={unitId} mine={d.mine} onSaved={onDone}/>}
      {opened && <LearnDeeper unitId={unitId}/>}

      {/* Last, after the work, because that is when somebody knows how it
          went. Never a gate on any of it. */}
      {opened && <DashLessonFeedback unitId={unitId} mine={d.feedback} onSaved={() => {}}/>}

      {(prev || next) && (
        <nav className="lrn-pager" aria-label="Lessons in this course">
          {prev ? <a href={"/learn/lesson/" + encodeURIComponent(prev.unitId)} onClick={go(prev)} className="lrn-pager-a">
            <i className="ph ph-arrow-left" aria-hidden="true"/><span><small>Previous</small>{prev.title}</span></a> : <span/>}
          {next ? <a href={"/learn/lesson/" + encodeURIComponent(next.unitId)} onClick={go(next)} className="lrn-pager-a is-next">
            <span><small>Next</small>{next.title}</span><i className="ph ph-arrow-right" aria-hidden="true"/></a> : <span/>}
        </nav>
      )}
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

/* ── Notes: what they wrote, and what they saved for later ───────────────── */
function LearnNotes({ d }) {
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading your notes"/>;
  const L = d.learn || {}, byId = {};
  (d.units || []).forEach(u => { byId[u.unitId] = u; });
  const saved = (L.saved || []).map(x => byId[x.unitId]).filter(Boolean);
  const notes = (L.notes || []).filter(x => byId[x.unitId]);
  if (!saved.length && !notes.length) return (
    <div className="lrn-empty">
      <i className="ph ph-note-pencil" aria-hidden="true"/>
      <h2>No notes or saved lessons yet.</h2>
      <p>In any lesson, write in <b>My notes</b> or press <b>Save for later</b>. They collect here, on every device you sign in on. Only you can see them.</p>
    </div>
  );
  const open = id => e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); lrnGo("/learn/lesson/" + encodeURIComponent(id)); };
  return (
    <div className="lrn-stack">
      {saved.length > 0 && <LearnGroup title={"Saved for later · " + saved.length} units={saved}/>}
      {notes.length > 0 && (
        <section className="lrn-group" aria-label="My notes">
          <h2 className="lrn-group-h">My notes · {notes.length}</h2>
          <ul className="lrn-list">
            {notes.map(n => { const u = byId[n.unitId]; return (
              <li key={n.unitId}>
                <a className="lrn-card lrn-notecard" href={"/learn/lesson/" + encodeURIComponent(n.unitId)} onClick={open(n.unitId)}>
                  <span className="lrn-card-top"><span className="lrn-card-course">{u.course || "Whole Club"}</span>
                    {n.at && <span className="lrn-note">{fmtDayMonth(n.at)}</span>}</span>
                  <span className="lrn-card-title">{u.title}</span>
                  <span className="lrn-notecard-body">{n.note}</span>
                </a>
              </li>); })}
          </ul>
        </section>
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
  const [aw, setAw] = React.useState(null);
  const [me, setMe] = React.useState(null);
  const [tt, setTt] = React.useState(null);
  const [err, setErr] = React.useState("");
  /* ONE request for the first screen. "This week" means lessons, school and
     where the work leads, so asking for them separately was three HTTP round
     trips and three PHP bootstraps before a child on a phone saw anything.
     The server still keeps their failures apart: school and awards come back
     null rather than taking the lessons down with them. */
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.member.learnBoot()
      .then(b => { setD(b.curriculum || null); setPlan(b.plan || null); setAw(b.awards || null); setMe(b.me || null); setTt(b.timetable || null); })
      .catch(e => setErr(e.code || e.message || "failed"));
  }, []);
  /* After an action, only the part that moved is refetched — marking a drill
     does not need the lessons again. */
  const loadPlan = React.useCallback(() => NGGApi.member.studyPlan().then(setPlan).catch(() => setPlan(null)), []);
  const loadAwards = React.useCallback(() => NGGApi.member.providersMine().then(setAw).catch(() => setAw(null)), []);
  React.useEffect(() => { load(); }, [load]);
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

      <main className={"lrn-main" + (view === "week" ? " is-wide" : "")}>
        {err && err !== "not_ngg_member" && view !== "lesson"
          ? <ErrorState title="Couldn't load your lessons" code={err} onRetry={load}/>
          : view === "lesson" ? <LearnLesson unitId={route.unitId} onDone={load} units={(d && d.units) || []}/>
          : view === "notes" ? <LearnNotes d={d}/>
          : view === "courses" ? <LearnCourses d={d} tt={tt}/>
          : view === "timetable" ? <LearnTimetable tt={tt} failed={!!d && !tt} onRetry={load}/>
          : view === "course" ? <LearnCourse d={d} slug={route.slug} aw={aw} onAim={loadAwards} tt={tt}/>
          : view === "plan" ? <LearnPlan d={plan} onRetry={loadPlan}/>
          : view === "drill" ? <LearnDrill itemId={route.itemId} onChanged={loadPlan}/>
          : view === "review" ? <LearnReview d={d}/>
          : view === "helper" ? <CurStudyHelper units={(d && d.units) || []}/>
          : <LearnWeek d={d} plan={plan} aw={aw} me={me} tt={tt} onRetry={load}/>}
      </main>
    </div></div>
  );
}
