/* ── Onboarding tours and duty pop-ups, for every portal ──────────────────
 *
 * GuideTour — a first-visit walk-through: a few big cards, one idea each, in
 * plain words. It shows once per person per portal (member_state
 * `onboard.<portal>`, or this browser when nobody is signed in) and comes back
 * whenever they ask for it (`nggGuide("<portal>")`, wired to each portal's
 * help or palette). Escape or "Skip" ends it; nothing is lost by skipping.
 *
 * DutyPopup — when something the person must do is due or overdue
 * (domain/duties.php), a large reminder on opening their portal, with a
 * button straight to each one. "Remind me later" waits a few hours, never for
 * good; the daily email keeps going until the duty is done.
 */

const GUIDE_TOURS = {
  member: { title: "Welcome to My NGG", steps: [
    ["ph ph-hand-waving", "This is your space", "Everything about you at NGG is here: what to do this week, your mentor, your lessons and how you are growing."],
    ["ph ph-sun-horizon", "Start with Today", "Today shows what to do first. Do the top thing, then the next. When it says “all caught up”, you are."],
    ["ph ph-handshake", "Talk to your mentor", "Open Mentor to message your mentor (8am to 8pm), get ready for Saturday and tick the steps you agreed."],
    ["ph ph-plant", "Watch yourself grow", "Grow shows your Leadership Index, your courage and your goal. Score yourself too: it helps your mentor understand you."],
    ["ph ph-book-open-text", "Learn every week", "Lessons, assignments and the Saturday plan live in Learn. Finish each lesson’s check to complete it."],
    ["ph ph-lifebuoy", "Help is one tap away", "If anything feels wrong, tap Get help. It goes privately to someone trained to help, the same day."],
  ] },
  mentor: { title: "Welcome to the Mentor Portal", steps: [
    ["ph ph-hand-waving", "Your pod, in one place", "Every child you mentor, what is due this week, Saturday and your messages. Nothing here is shared beyond the people who need it."],
    ["ph ph-sun-horizon", "This week first", "This week lists what needs you, most urgent first. Clear it and you are done for the week."],
    ["ph ph-calendar-star", "Saturday, in three steps", "Before: plan the session. During: tap who is here, what you saw, and add a line of detail. After: evaluate each child by Monday."],
    ["ph ph-users-three", "Each child’s page", "Tap a name to see their goals, scores, sessions, family contact and timeline. Log a one-to-one there after you meet."],
    ["ph ph-chat-circle-text", "Messages and families", "Reply to journal entries and check-ins, and send families short updates. Replies wait until 8am if you write late."],
    ["ph ph-shield-check", "Report a concern", "If a child tells you something worrying, use Report a concern. It goes only to the safeguarding officer, the same day."],
    ["ph ph-graduation-cap", "Start here, in the Academy", "Your portal opens once you have taken the short guides under “Start here” in the Academy — about half an hour, one per part of the job. They show you the right tool for each thing you do."],
  ] },
  summer: { title: "Welcome to Summer School mentoring", steps: [
    ["ph ph-hand-waving", "Your participants", "This edition’s participants, and only them. NGG members are in a separate portal."],
    ["ph ph-star", "Stars and notes", "Give stars for what you see, add a note, and a V3 rating when you watch someone speak."],
    ["ph ph-clipboard-text", "Weekly reviews", "Each week, review every participant. The list shows who is still waiting."],
    ["ph ph-shield-check", "Concerns", "Report anything worrying with Report a concern. It goes straight to the safeguarding officer."],
  ] },
  instructor: { title: "Welcome to the Instructor Portal", steps: [
    ["ph ph-hand-waving", "Your class, ready to teach", "Today shows your course, room and time, the Saturday day, and what still needs you."],
    ["ph ph-list-checks", "Take the roll", "Tap each child as they arrive. Close the roll when the class starts: the centre’s attendance updates."],
    ["ph ph-clipboard-text", "Plan, teach, check", "Plan sets the goal and the hinge question from this week’s lesson. The exit ticket shows who got it."],
    ["ph ph-notebook", "File the log", "After class, file the session log. Mentors only see your remarks once it is filed."],
    ["ph ph-chart-line-up", "Skills and marking", "Move a child up a skill level with what you saw, and mark written answers waiting for you."],
    ["ph ph-graduation-cap", "Start here, in the Academy", "Your portal opens once you have taken the short guides under “Start here” in the Instructor Academy — about twenty minutes, one per part of the job. Support and Report a concern work the whole time."],
  ] },
  family: { title: "Welcome to your family account", steps: [
    ["ph ph-hand-waving", "Your child at NGG", "See attendance, lessons, conduct, fees and what their mentor shares, for each child linked to you."],
    ["ph ph-calendar-check", "Saturdays", "You get the plan at 8:00, a note if they have not arrived by 8:45, and how the day went at 2:00."],
    ["ph ph-chat-circle-text", "Tell the centre", "Use the message button to tell the centre anything: an absence, a question or a worry."],
  ] },
  control: { title: "Welcome to the Control Room", steps: [
    ["ph ph-hand-waving", "The whole programme", "Members, mentors, learning, money and messages, grouped on the left. You only see what your role allows."],
    ["ph ph-magnifying-glass", "Find anything fast", "Press ⌘K (or Ctrl K) to search for a person, a page or an action."],
    ["ph ph-tray", "Inbox first", "Applications, approvals, requests and messages that need someone wait in the Inbox."],
    ["ph ph-check-square", "Act on many at once", "Tick rows to act on several together. Every bulk action says how many, asks first, and is recorded."],
  ] },
  idcards: { title: "Welcome to the ID Card Studio", steps: [
    ["ph ph-hand-waving", "Print cards in three steps", "Pick whose cards, check the sheet, print. The studio works out the layout to the millimetre."],
    ["ph ph-user-list", "Choose the cards", "New cards, reprints, or one person. Anyone without a photo or a number is flagged before you print."],
    ["ph ph-printer", "Print and check", "Print, then tell the studio which cards came out. Failed ones go back in the queue."],
  ] },
};

function guideKey(portal) { return "onboard." + portal; }
/* Automated browsers (the test suites) don't get pop-ups they didn't ask for:
   they would sit over every screen a test drives. A test that is about the
   tour or the reminder sets localStorage "ngg.guide.force" to "1". */
function guideAuto() {
  try { if (localStorage.getItem("ngg.guide.force") === "1") return true; } catch (_) {}
  return !(typeof navigator !== "undefined" && navigator.webdriver);
}

/** Has this person seen the tour? Signed in: their record; otherwise this browser. */
function guideSeen(portal) {
  return NGGApi.member.stateGet([guideKey(portal)]).then(r => !!(r && r.state && r.state[guideKey(portal)]))
    .catch(() => { try { return localStorage.getItem("ngg." + guideKey(portal)) === "1"; } catch (_) { return true; } });
}
function guideMark(portal) {
  try { localStorage.setItem("ngg." + guideKey(portal), "1"); } catch (_) {}
  return NGGApi.member.stateSet(guideKey(portal), { done: true, at: new Date().toISOString() }).catch(() => null);
}
/** Open a portal's tour from anywhere (help links, palettes). */
window.nggGuide = function (portal) { window.dispatchEvent(new CustomEvent("ngg:guide", { detail: { portal } })); };

function GuideTour({ portal, auto = true, name }) {
  const tour = GUIDE_TOURS[portal];
  const [open, setOpen] = React.useState(false);
  const [i, setI] = React.useState(0);
  const card = React.useRef(null), from = React.useRef(null);
  React.useEffect(() => {
    let live = true;
    if (auto && tour && guideAuto()) guideSeen(portal).then(seen => { if (live && !seen) { from.current = document.activeElement; setI(0); setOpen(true); } });
    const f = e => { if (e.detail && e.detail.portal === portal) { from.current = document.activeElement; setI(0); setOpen(true); } };
    window.addEventListener("ngg:guide", f);
    return () => { live = false; window.removeEventListener("ngg:guide", f); };
  }, [portal]);
  React.useEffect(() => { if (open && card.current) { const b = card.current.querySelector(".ngt-next"); if (b) b.focus(); } }, [open, i]);
  if (!open || !tour) return null;
  const steps = tour.steps, last = i === steps.length - 1, st = steps[i];
  const close = () => { setOpen(false); guideMark(portal); setTimeout(() => { try { from.current && from.current.focus(); } catch (_) {} }, 0); };
  const key = e => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "ArrowRight" && !last) setI(i + 1);
    if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
    if (e.key === "Tab") { const f = card.current.querySelectorAll("button"); if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  };
  return (
    <div className="ngt-scrim" onKeyDown={key}>
      <div className="ngt-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="ngt-h" aria-describedby="ngt-p">
        <div className="ngt-top">
          <span className="ngt-eyebrow">{i === 0 ? tour.title : "Step " + (i + 1) + " of " + steps.length}</span>
          <button type="button" className="ngt-skip" onClick={close}>Skip the tour</button>
        </div>
        <span className="ngt-icon" aria-hidden="true"><i className={st[0]}/></span>
        <h2 id="ngt-h">{i === 0 && name ? st[1].replace("This is your space", "Hi " + name + ", this is your space") : st[1]}</h2>
        <p id="ngt-p">{st[2]}</p>
        <ol className="ngt-dots" aria-label={"Step " + (i + 1) + " of " + steps.length}>
          {steps.map((_, k) => <li key={k} className={k === i ? "is-on" : k < i ? "is-done" : ""}/>)}
        </ol>
        <div className="ngt-acts">
          {i > 0 && <button type="button" className="ngt-back" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="ngt-next" onClick={() => (last ? close() : setI(i + 1))}>{last ? "Start" : "Next"}</button>
        </div>
        <p className="ngt-foot">You can open this tour again any time from Help.</p>
      </div>
    </div>
  );
}

/**
 * The duty pop-up. `role` narrows it to the portal's own duties ("member",
 * "mentor", "instructor"); `onGo(duty)` takes the person to one, and returns
 * false to fall back to the duty's own address.
 */
function DutyPopup({ role, onGo, delay = 900 }) {
  const [d, setD] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const card = React.useRef(null);
  const load = React.useCallback(() => NGGApi.member.duties(role).then(r => {
    setD(r);
    // A first-visit tour finishes first; the reminder waits for it.
    if (document.querySelector(".ngt-card")) { const w = setInterval(() => { if (!document.querySelector(".ngt-card")) { clearInterval(w); load(); } }, 1500); return; }
    const n = (r.duties || []).filter(x => x.level !== "info").length;
    let shown = false; try { shown = sessionStorage.getItem("ngg.duty." + role) === new Date().toDateString() + ":" + n; } catch (_) {}
    if (n && !r.snoozedUntil && !shown) setOpen(true);
  }).catch(() => {}), [role]);
  React.useEffect(() => { if (!guideAuto()) return undefined; const t = setTimeout(load, delay); return () => clearTimeout(t); }, [load]);
  React.useEffect(() => { if (open && card.current) { const b = card.current.querySelector(".ndp-go"); if (b) b.focus(); } }, [open]);
  if (!open || !d) return null;
  const list = (d.duties || []).filter(x => x.level !== "info");
  const n = list.length, urgent = list.filter(x => x.level === "urgent").length;
  const oldest = Math.max(0, ...list.map(x => x.days || 0));
  const seen = () => { try { sessionStorage.setItem("ngg.duty." + role, new Date().toDateString() + ":" + n); } catch (_) {} };
  const close = () => { seen(); setOpen(false); };
  const later = () => { NGGApi.member.dutiesSnooze(4).catch(() => {}); close(); };
  const go = x => { close(); const r = onGo ? onGo(x) : false; if (r === false && x.route) location.href = x.route; };
  return (
    <div className="ngt-scrim" onKeyDown={e => { if (e.key === "Escape") close(); }}>
      <div className={"ndp-card" + (urgent ? " is-urgent" : "")} ref={card} role="alertdialog" aria-modal="true" aria-labelledby="ndp-h" aria-describedby="ndp-p">
        <span className="ndp-icon" aria-hidden="true"><i className={urgent ? "ph-fill ph-warning-circle" : "ph-fill ph-bell-ringing"}/></span>
        <h2 id="ndp-h">{n === 1 ? "One thing needs you" : n + " things need you"}</h2>
        <p id="ndp-p">{oldest >= 7 ? "Some of these have waited over a week. Please do them now." : oldest >= 3 ? "These are still open from earlier this week." : urgent ? "Please do these today." : "Do these when you can, before Saturday."}</p>
        <ul className="ndp-list">
          {list.slice(0, 6).map(x => (
            <li key={x.key} className={"ndp-item is-" + x.level}>
              <i className={"ph ph-" + x.icon} aria-hidden="true"/>
              <span><b>{x.title}</b><small>{x.sub}{x.days >= 1 ? " · open " + x.days + (x.days === 1 ? " day" : " days") : ""}</small></span>
              <button type="button" className="ndp-go" onClick={() => go(x)}>{x.cta || "Do it"}</button>
            </li>
          ))}
        </ul>
        {n > 6 && <p className="ndp-more">And {n - 6} more on your To do list.</p>}
        <div className="ngt-acts">
          <button type="button" className="ngt-back" onClick={later}>Remind me in 4 hours</button>
          <button type="button" className="ngt-next" onClick={close}>I’ll do them now</button>
        </div>
        <p className="ngt-foot">You also get one email a day while something is open. It stops when they are done.</p>
      </div>
    </div>
  );
}

/* ── The staff Academies (mentors and instructors) ──────────────────────────
   One list-and-player for every staff portal's Academy: "Start here: using the
   portal" — one short guide per part of the portal, naming the right tool for
   each job — then the training modules. A module is lessons, an optional
   "what would you do?" (which shows its answer: it teaches), and questions
   whose key stays on the server; the score comes back when it is finished.
   Until "Start here" is passed the portal opens on this and nothing else
   (domain/academy.php). `submit(moduleId, answers)` is the portal's own call. */
const SA_ERR = { answer_all: "Answer every question first.", retry_later: "That is three tries at this module today. Read it again and try tomorrow.",
  network: "You’re offline. Nothing was saved.", rate_limited: "Too many in a row. Wait a minute and try again." };
function saErr(e) { const c = (e && (e.code || e.message)) || "failed"; return SA_ERR[c] || "Couldn’t save (" + c + ")."; }
function saDate(iso, o) { const d = /^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? new Date(String(iso).slice(0, 10) + "T12:00:00Z") : null; return d ? d.toLocaleDateString("en-GB", Object.assign({ timeZone: "UTC" }, o || { day: "numeric", month: "short" })) : ""; }

/* How children and families address this adult: a title and the surname
   ("Mrs Adeyemi"), never the first name. The list and the default are the
   server's (STAFF_HONORIFICS); this card only lets the person pick one. */
function StaffTitleCard({ toast }) {
  const [t, setT] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.member.staffTitle().then(r => { setT(r); setErr(''); }).catch(e => setErr(e.code || e.message || 'error'));
  React.useEffect(() => { load(); }, []);
  if (err === 'not_staff') return null;
  if (err) return <section className="sa-card sa-title" role="alert"><span>Couldn’t load how children see you ({err}).</span><button type="button" className="sa-btn" onClick={load}>Retry</button></section>;
  if (!t) return null;
  const pick = async v => {
    setBusy(true);
    try { const r = await NGGApi.member.staffTitleSet(v); setT(r); toast && toast('Children now see you as ' + r.seenAs + '.'); }
    catch (e) { toast && toast('Not saved (' + (e.code || e.message) + '). Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="sa-card sa-title" aria-labelledby="sa-title-h">
      <div><h2 id="sa-title-h" className="sa-h">How children see you</h2>
        <p>Children and their families see you as <b>{t.seenAs}</b> — a title and your surname, never your first name.</p></div>
      <label className="sa-title-pick"><span>Your title</span>
        <select value={t.honorific || ''} disabled={busy} onChange={e => pick(e.target.value)}>
          <option value="">{t.titleDefault} (default)</option>
          {(t.titles || []).filter(x => x !== t.titleDefault).map(x => <option key={x} value={x}>{x}</option>)}
        </select></label>
    </section>
  );
}

function StaffAcademy({ data, err, reload, toast, submit, portal, jobs, lead }) {
  const [mod, setMod] = React.useState(null);
  const [step, setStep] = React.useState(0);
  const [ans, setAns] = React.useState({});
  const [res, setRes] = React.useState(null);
  const topRef = React.useRef(null);
  const today = new Date().toISOString().slice(0, 10);
  const done = m => !!m.passedAt && !(m.renewBy && m.renewBy < today);
  React.useEffect(() => { if (topRef.current) { topRef.current.focus(); } }, [mod, step]);
  if (err) return <div className="m15x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>The Academy couldn’t load ({(err.code || err.message || 'error')}).</span><button type="button" onClick={reload}>Retry</button></div>;
  if (!data) return <div className="m15x-load" role="status" aria-live="polite"><span className="m15x-bar"/><span className="m15x-sr">Loading the Academy</span></div>;
  const mods = data.modules || []; const ori = data.orientation || { ok: true };
  const m = mods.find(x => x.id === mod);
  if (!m) {
    const n = mods.filter(done).length;
    return (
      <div className="sa">
        {!ori.ok && <section className="sa-lock" role="note" aria-labelledby="sa-lock-h"><i className="ph-fill ph-graduation-cap" aria-hidden="true"/>
          <div><h2 id="sa-lock-h">Your Academy: {ori.done} of {ori.required} done</h2>
            <p>Start with the short guides under “Start here: using the portal” ({(ori.startHere || {}).done || 0} of {(ori.startHere || {}).required || 0} done) — each shows you the right tool for one part of the job: {jobs}. Then the required modules. You can look around your whole portal meanwhile, but nothing you do there saves until the Academy is complete (about {ori.mins} minutes left). {lead || "Report a concern works the whole time."}</p></div></section>}
        <StaffTitleCard toast={toast}/>
        <section className="sa-card sa-prog" aria-label="Your progress"><div><b>{n} of {mods.length} modules complete</b><span>{Math.round(n / Math.max(1, mods.length) * 100)}%</span></div>
          <div className="sa-bar"><span style={{ width: (n / Math.max(1, mods.length) * 100) + '%' }}/></div></section>
        {(data.groups || []).map((h, gi) => (
          <section key={gi} className="sa-card" aria-labelledby={'sa-g' + gi}><h2 id={'sa-g' + gi} className="sa-h">{h}</h2>
            <ul className="sa-list">{mods.filter(x => x.group === gi).map(x => { const d = done(x), lapsed = !!x.passedAt && !d;
              return <li key={x.id}><i className={d ? 'ph-fill ph-check-circle is-done' : 'ph ph-circle'} aria-hidden="true"/>
                <span className="sa-t"><b>{x.title}</b><span>{d ? 'Passed ' + x.score + '%' + (x.renewBy ? ' · renew by ' + saDate(x.renewBy, { day: 'numeric', month: 'short', year: 'numeric' }) : '') : (lapsed ? 'Needs renewing · ' : '') + x.mins + ' min' + (x.orientation ? ' · start here' : x.required ? ' · required' : '') + (x.note && !x.orientation ? ' · ' + x.note : '')}</span></span>
                <button type="button" className={'sa-btn' + (d ? '' : ' is-primary')} onClick={() => { setMod(x.id); setStep(0); setAns({}); setRes(null); }}>{d ? 'Review' : lapsed ? 'Renew' : 'Start'}<span className="m15x-sr"> {x.title}</span></button></li>; })}</ul></section>
        ))}
      </div>
    );
  }
  const steps = (m.lessons || []).map(l => ({ k: 'lesson', h: l.h, b: l.body }));
  if (m.scenario) steps.push({ k: 'scen', h: m.scenario.situation, opts: m.scenario.options.map(o => o.text), right: m.scenario.options.map(o => !!o.right), why: m.scenario.options.map(o => o.why) });
  (m.quiz || []).forEach(q => steps.push({ k: 'quiz', h: q.q, opts: q.options }));
  steps.push({ k: 'result' });
  const i = Math.min(step, steps.length - 1), st = steps[i], a = ans[i];
  const qIdx = steps.map((s, j) => s.k === 'quiz' ? j : -1).filter(j => j >= 0);
  const choice = st.k === 'scen' || st.k === 'quiz', answered = a !== undefined;
  const pass = !!(res && res.passed), pending = !!(res && res.pending);
  const to = n => {
    if (steps[n] && steps[n].k === 'result') {
      setRes({ pending: true });
      const wasLocked = !ori.ok;
      submit(m.id, qIdx.map(j => ans[j])).then(r => { setRes(r); if (r.passed) { reload(); if (wasLocked && r.orientation && r.orientation.ok) toast('“Start here” is done. Your whole portal is open.'); } })
        .catch(e => setRes({ error: saErr(e) }));
    }
    setStep(n);
  };
  return (
    <div className="sa">
      <button type="button" className="sa-back" onClick={() => setMod(null)}><i className="ph ph-arrow-left" aria-hidden="true"/>Academy</button>
      <section className="sa-card sa-player" aria-labelledby="sa-mh">
        <div className="sa-meta"><span>{st.k === 'result' ? 'Finished' : 'Step ' + (i + 1) + ' of ' + (steps.length - 1)}</span><span>{m.mins} min</span></div>
        <div className="sa-bar"><span style={{ width: (i / Math.max(1, steps.length - 1) * 100) + '%' }}/></div>
        <p className="sa-kind">{m.title} · {st.k === 'lesson' ? 'Lesson ' + (i + 1) + ' of ' + (m.lessons || []).length : st.k === 'scen' ? 'What would you do?' : st.k === 'quiz' ? 'Question ' + (qIdx.indexOf(i) + 1) + ' of ' + qIdx.length : 'Result'}</p>
        {st.k !== 'result' ? <>
          <h2 id="sa-mh" className="sa-mh" tabIndex={-1} ref={topRef}>{st.h}</h2>
          {st.k === 'lesson' && <p className="sa-body">{st.b}</p>}
          {choice && <div className="sa-opts" role="radiogroup" aria-labelledby="sa-mh">{st.opts.map((l, j) => { const on = a === j; const scen = st.k === 'scen'; const ok = scen && answered && st.right[j], bad = scen && answered && on && !st.right[j];
            return <button key={j} type="button" role="radio" aria-checked={on} className={'sa-opt' + (on ? ' is-on' : '') + (ok ? ' is-ok' : '') + (bad ? ' is-bad' : '')}
              onClick={() => { if (scen && answered) return; setAns(Object.assign({}, ans, { [i]: j })); }}>
              <i className={ok ? 'ph-fill ph-check-circle' : bad ? 'ph-fill ph-x-circle' : on ? 'ph-fill ph-radio-button' : 'ph ph-circle'} aria-hidden="true"/>{l}</button>; })}</div>}
          {choice && answered && <p className={'sa-fb' + (st.k === 'scen' ? (st.right[a] ? ' is-ok' : ' is-warn') : '')} role="status">
            <b>{st.k === 'scen' ? (st.right[a] ? 'Right. ' : 'Not quite. ') : 'Answer recorded. '}</b>{st.k === 'scen' ? st.why[a] : 'You can change it before you go on. Your score is worked out when you finish.'}</p>}
        </> : <div className="sa-res" role="status" aria-live="polite">
          <i className={pending ? 'ph ph-hourglass' : pass ? 'ph-fill ph-seal-check is-done' : 'ph ph-arrow-counter-clockwise'} aria-hidden="true"/>
          <h2 id="sa-mh" className="sa-mh" tabIndex={-1} ref={topRef}>{pending ? 'Checking your answers…' : res && res.error ? 'Not saved' : pass ? 'Passed · ' + res.score + '%' : (res ? res.score : 0) + '% · the pass mark is ' + (data.pass || 80) + '%'}</h2>
          <p className="sa-body">{pending ? '' : res && res.error ? res.error : pass ? 'Saved to your record.' + (m.renewDays ? ' You’ll be reminded before it needs renewing.' : '') : 'Read the lessons again, then retake the questions. Nothing is recorded until you pass.'}</p></div>}
        <div className="sa-nav">
          {i > 0 && st.k !== 'result' && <button type="button" className="sa-btn" onClick={() => to(i - 1)}>Back</button>}
          <span className="sa-grow"/>
          <button type="button" className="sa-btn is-primary" aria-disabled={(choice && !answered) || pending}
            onClick={() => { if (pending) return; if (st.k === 'result') { if (pass || (res && res.error)) setMod(null); else { setStep(0); setAns({}); setRes(null); } return; } if (choice && !answered) return toast('Choose an answer first'); to(i + 1); }}>
            {st.k === 'result' ? (pass || (res && res.error) ? 'Back to Academy' : 'Try again') : steps[i + 1].k === 'result' ? 'See result' : 'Continue'}</button>
        </div>
      </section>
    </div>
  );
}

