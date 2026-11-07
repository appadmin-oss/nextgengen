/* ==========================================================================
   Learn — the exam player (owner, 7 Nov 2026: "turn on the per session exam by default. Upgrade the exam
   and make it standard with standardized features", "Make it modern, effective and smarter … adapt some
   concepts from the labs").

   One player for both sittings (domain/learn-exam.php): the SESSION exam that opens every session, and a
   course's TRIAL. What makes it standard is said on the first screen, before anything starts — how many
   questions, the time, the pass mark, the bands, and the rules — and then held:

     · one question at a time (the Lab's player), a navigator to any question, a flag to come back to;
     · "how sure are you?" on every choice question — not to score it, but so a learner who was SURE and
       wrong is told they have a misconception to fix (certainty-based feedback);
     · the timer is the SERVER's deadline, offset by the clock difference the server reported; at zero the
       answers saved so far are handed in, and a dropped connection resumes the same sitting;
     · autosave as they go, a review screen before handing in, then the follow-up questions about their
       own written answers (each with its own short clock), then the report.

   Nothing here can make an answer right: marking, deadlines and the follow-ups are the server's. The
   signals it sends (pasting, leaving the page) are counters for an instructor to ASK about, never marks.
   Ordering is with buttons, never a drag (CLAUDE.md §9).
   ========================================================================== */

const LX_CONF = [["sure", "Sure"], ["think", "Think so"], ["guess", "Guessing"]];
const LX_KIND = { mcq: "Choose one", order: "Put in order", short: "Short answer", task: "Practical", essay: "Extended answer",
  reflection: "Reflection", project: "Project", code: "Code", watch: "Watch and tell", evidence: "Outside exercise" };
const lxMmss = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

/* One question's answer box. A choice is a radio group; an ordering moves with buttons; everything
   written is a box that counts typing and pasting for the process signals. */
/* An outside exercise's answer (the `evidence` kind): the PROOF — a link to their result, or a screenshot
   uploaded with the attach button — and, typed, what they did, what they scored and one thing that went
   wrong. Saved as one answer ("Proof: …" then the account) so the marker and the instructor read both
   together. Pasting is allowed in the proof box even in an exam: a result link is pasted, not typed. */
function LxEvidence({ q, value, onChange, onType, onPasteBlocked, exam, disabled }) {
  const m = /^Proof: ([^\n]*)\n\n?([\s\S]*)$/.exec(value || "");
  const proof = m ? m[1] : "", account = m ? m[2] : (value || "");
  const put = (p, a) => onChange(p.trim() || a ? "Proof: " + p.trim() + "\n\n" + a : "");
  return (
    <div className="lx-evi">
      {q.linkUrl && <p className="lx-ext"><i className="ph ph-arrow-square-out" aria-hidden="true"/> Do the exercise: <a href={q.linkUrl} target="_blank" rel="noopener noreferrer">{q.linkUrl.replace(/^https?:\/\//, "")}</a></p>}
      <label className="lx-evi-f"><span>Your proof — the link to your result, or a screenshot</span>
        <input type="url" inputMode="url" className="lx-input" value={proof} disabled={disabled} placeholder="https://…"
          aria-label={"Proof for question " + q.n} onChange={e => put(e.target.value, account)}/></label>
      {!disabled && typeof CurAttach === "function" && <CurAttach n={q.n} onAdd={url => put(url, account)}/>}
      <label className="lx-evi-f"><span>What you did, what you scored, and one thing that went wrong</span>
        <textarea className="lx-text" rows={5} value={account} disabled={disabled} aria-label={"What you did, question " + q.n}
          onPaste={e => { if (exam) { e.preventDefault(); onPasteBlocked && onPasteBlocked(); } }}
          onChange={e => { onType && onType(Math.max(0, e.target.value.length - account.length)); put(proof, e.target.value); }}/></label>
    </div>);
}

function LxField({ q, value, onChange, onPaste, onType, onPasteBlocked, exam, disabled }) {
  if (q.kind === "evidence") return <LxEvidence q={q} value={value} onChange={onChange} onType={onType} onPasteBlocked={onPasteBlocked} exam={exam} disabled={disabled}/>;
  if (q.kind === "mcq") return (
    <div className="lx-opts" role="radiogroup" aria-label={"Options for question " + q.n}>
      {q.options.map((o, i) => (
        <label key={i} className={"lx-opt" + (value === i ? " is-on" : "")}>
          <input type="radio" name={"lx-" + q.checkId} checked={value === i} disabled={disabled} onChange={() => onChange(i)}/>
          <span className="lx-opt-k" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{o}</span>
        </label>))}
    </div>);
  if (q.kind === "order") {
    const cur = Array.isArray(value) && value.length === q.options.length ? value : q.options;
    /* The order shown first is never the right one (the server shuffles it so), so it is their answer
       until they change it — an ordering left alone is answered, wrongly, not blank. */
    React.useEffect(() => { if (!Array.isArray(value)) onChange(q.options); }, []); // eslint-disable-line
    const move = (i, d) => { const n = cur.slice(); const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
    return (
      <ol className="lx-order" aria-label={"Put these in order, question " + q.n}>
        {cur.map((t, i) => (
          <li key={t} className="lx-order-i">
            <span className="lx-order-n" aria-hidden="true">{i + 1}</span><span className="lx-order-t">{t}</span>
            <span className="lx-order-btns">
              <button type="button" className="lx-icon" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={"Move “" + t + "” up"}><i className="ph ph-arrow-up" aria-hidden="true"/></button>
              <button type="button" className="lx-icon" disabled={disabled || i === cur.length - 1} onClick={() => move(i, 1)} aria-label={"Move “" + t + "” down"}><i className="ph ph-arrow-down" aria-hidden="true"/></button>
            </span>
          </li>))}
      </ol>);
  }
  return (
    <>
      {q.kind === "watch" && q.videoUrl && <p className="lx-ext"><i className="ph ph-play-circle" aria-hidden="true"/> <a href={q.videoUrl} target="_blank" rel="noopener noreferrer">Watch the video</a>, then answer in your own words.</p>}
      <textarea className={"lx-text" + (q.kind === "code" ? " is-code" : "")} rows={q.kind === "short" ? 4 : 8} value={value || ""} disabled={disabled}
        spellCheck={q.kind !== "code"} aria-label={"Your answer to question " + q.n}
        /* In the exam, pasting into an answer is switched off (it is said on the rules screen) and each try is
           counted for the instructor; on the lesson page, practice, it is allowed and counted. */
        onPaste={e => { if (exam) { e.preventDefault(); onPasteBlocked && onPasteBlocked(); } else onPaste((e.clipboardData && e.clipboardData.getData("text") || "").length); }}
        onChange={e => { const v = e.target.value; onType(Math.max(0, v.length - String(value || "").length)); onChange(v); }}/>
    </>);
}

/** Ask for full screen where the browser allows it (most phones' browsers do not; that is fine). */
function lxFullscreen() { try { const el = document.documentElement; if (document.fullscreenEnabled && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); } catch (_) {} }

/* The report: band, score, time, and per question what they need. */
function LxResult({ ex, onDone }) {
  const r = ex.result || {};
  const tone = r.pending ? "is-wait" : r.passed ? "is-ok" : "is-no";
  const qs = ex.questions || [];
  const byId = {}; (r.questions || []).forEach(x => { byId[x.checkId] = x; });
  const sureWrong = (r.questions || []).filter(x => !x.right && !x.pending && x.confidence === "sure");
  return (
    <section className="lx-card lx-result" aria-labelledby="lx-res-h">
      <div className={"lx-band " + tone}>
        <span className="lx-band-k">{r.pending ? "Waiting for your instructor" : r.band || "Marked"}</span>
        <h2 id="lx-res-h" className="lx-band-score">{r.pending ? "Marked so far: " + Math.round(r.score) + " of " + r.max : r.pct + "%"}</h2>
        <span className="lx-band-sub">{Math.round(r.score)} of {r.max} marks · {r.minutes} min · pass mark {r.passMark}%{r.pledged ? " · sat on your honour" : ""}</span>
      </div>
      {/* The candidate slip: a standard paper's header. */}
      <dl className="lx-slipbox">
        {ex.candidate && ex.candidate.name && <div><dt>Candidate</dt><dd>{ex.candidate.name}{ex.candidate.memberNo ? " · " + ex.candidate.memberNo : ""}</dd></div>}
        <div><dt>Exam no.</dt><dd className="lx-mono">{ex.sittingId}</dd></div>
        <div><dt>{ex.kind === "trial" ? "Trial" : "Paper"}</dt><dd>{ex.title}</dd></div>
        <div><dt>Handed in</dt><dd>{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}</dd></div>
      </dl>
      {(r.sections || []).length > 1 && <ul className="lx-sections" aria-label="Score by section">{r.sections.map(x => <li key={x.name}><b>{x.pct}%</b><span>{x.name} · {Math.round(x.got)} of {x.max}</span></li>)}</ul>}
      {sureWrong.length > 0 && <p className="lx-callout"><i className="ph-fill ph-lightning" aria-hidden="true"/> You were <b>sure</b> of {sureWrong.length === 1 ? "one answer" : sureWrong.length + " answers"} that {sureWrong.length === 1 ? "was" : "were"} wrong. That is a misconception, not a slip — read the reason below; it is the most useful thing on this page.</p>}
      <ol className="lx-rlist">{qs.map(q => { const x = byId[q.checkId] || {};
        const st = x.held ? "held" : x.pending ? "wait" : x.right ? "ok" : (x.points > 0 ? "part" : "no");
        return (
          <li key={q.checkId} className={"lx-ritem is-" + st}>
            <span className="lx-ritem-ic" aria-hidden="true"><i className={"ph-fill " + ({ ok: "ph-check-circle", no: "ph-x-circle", part: "ph-circle-half", wait: "ph-hourglass", held: "ph-chat-circle-dots" })[st]}/></span>
            <div className="lx-ritem-b">
              <p className="lx-ritem-q"><b>{q.n}.</b> {q.prompt}</p>
              <p className="lx-ritem-m">{({ ok: "Right", no: "Not right", part: "Partly right", wait: "With your instructor", held: "Your instructor will look at this with you" })[st]}
                {x.points != null ? " · " + x.points + " of " + x.max : ""}{x.confidence ? " · you said: " + (LX_CONF.find(c => c[0] === x.confidence) || [])[1] : ""}{q.role === "spaced" ? " · from week " + q.week : ""}</p>
              {x.slip && <p className="lx-slip"><b>Why that one is tempting:</b> {x.slip}</p>}
              {x.feedback && <p className="lx-fb">{x.feedback}</p>}
              {x.answer && <p className="lx-ans"><b>The answer:</b> {x.answer}</p>}
            </div>
          </li>); })}</ol>
      {!r.passed && !r.pending && <p className="lx-note">The answers appear once you pass. Go back over the lesson and try its questions again on the lesson page — the next session exam will ask what you got wrong first.</p>}
      <LxAppeal ex={ex}/>
      {onDone && <button type="button" className="lrn-btn" onClick={onDone}>{ex.kind === "trial" ? "Back to the course" : "Start today's lesson"}</button>}
    </section>
  );
}

/* A re-mark, asked for once per sitting with a reason (member.exam.appeal). It changes no mark: it puts the
   sitting in front of an instructor, which is what a standard exam owes a candidate who disagrees. */
function LxAppeal({ ex }) {
  const [open, setOpen] = React.useState(false), [why, setWhy] = React.useState(""), [cid, setCid] = React.useState(""), [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(ex.appeal || null);
  if (done) return <p className="lx-note"><i className="ph ph-scales" aria-hidden="true"/> You asked for a re-mark{done.resolved ? " — your instructor has looked at it." : ". Your instructor will look at it."}</p>;
  if (!open) return <button type="button" className="lrn-btn is-ghost lx-appeal-btn" onClick={() => setOpen(true)}><i className="ph ph-scales" aria-hidden="true"/>Request a re-mark</button>;
  const send = async () => {
    setBusy(true);
    try { setDone((await NGGApi.member.exam.appeal(ex.sittingId, why, cid)).appeal); toast.success("Sent to your instructor."); }
    catch (e) { toast.error(e.code === "appeal_closed" ? "Re-marks can be asked for within 7 days of the exam." : e.code === "reason_required" ? "Say in a sentence why you think the mark is wrong." : humanizeError(e.code, e.code)); }
    finally { setBusy(false); }
  };
  return (
    <div className="lx-appeal">
      <label className="lx-evi-f"><span>Which question?</span>
        <select className="lx-input" value={cid} onChange={e => setCid(e.target.value)}>
          <option value="">The whole exam</option>{(ex.questions || []).map(q => <option key={q.checkId} value={q.checkId}>Question {q.n}</option>)}</select></label>
      <label className="lx-evi-f"><span>Why do you think the mark is wrong?</span>
        <textarea className="lx-text" rows={3} value={why} onChange={e => setWhy(e.target.value)}/></label>
      <div className="lx-acts"><button type="button" className="lrn-btn" disabled={busy || why.trim().length < 10} onClick={send}>{busy ? "Sending…" : "Send to my instructor"}</button>
        <button type="button" className="lrn-btn is-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      <p className="lx-note">Once per exam, within 7 days. A re-mark can go up or down.</p>
    </div>);
}

/* The follow-up questions about their own answers — one at a time, each with its own clock. */
function LxViva({ ex, onExam }) {
  const open = (ex.viva || []).filter(v => !v.answered);
  const v = open[0];
  const [text, setText] = React.useState(""), [busy, setBusy] = React.useState(false), [now, setNow] = React.useState(Date.now());
  const shift = React.useMemo(() => Date.parse(ex.serverNow) - Date.now(), [ex.serverNow]);
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  React.useEffect(() => { setText(""); }, [v && v.checkId]);
  if (!v) return null;
  const left = (ex.vivaSecs || 240) - (now + shift - Date.parse(v.askedAt)) / 1000;
  const send = async (answer) => {
    setBusy(true);
    try { onExam((await NGGApi.member.exam.viva(ex.sittingId, v.checkId, answer)).exam); }
    catch (e) { toast.error(humanizeError(e.code, "Couldn’t send it. Try again.")); }
    finally { setBusy(false); }
  };
  const q = (ex.questions || []).find(x => x.checkId === v.checkId) || {};
  return (
    <section className="lx-card lx-viva" aria-labelledby="lx-viva-h">
      <p className="lx-eyebrow">Follow-up {(ex.viva.length - open.length) + 1} of {ex.viva.length} · about your answer to question {q.n}</p>
      <h2 id="lx-viva-h" className="lx-q">{v.question}</h2>
      <p className="lx-note">Answer from memory, in a sentence or two, in your own words. Everybody gets the same number of follow-ups. They exist so the marks on your written answers are yours — an answer that does not hold up goes to your instructor, never straight to a zero.</p>
      <p className={"lx-clock" + (left < 30 ? " is-low" : "")} role="timer" aria-live="off">{lxMmss(left)}</p>
      <textarea className="lx-text" rows={4} value={text} onChange={e => setText(e.target.value)} aria-label="Your reply to the follow-up question" autoFocus/>
      <div className="lx-acts">
        <button type="button" className="lrn-btn" disabled={busy || !text.trim()} onClick={() => send(text)}>{busy ? "Sending…" : "Send"}</button>
        <button type="button" className="lrn-btn is-ghost" disabled={busy} onClick={() => send("")}>I can’t answer this</button>
      </div>
    </section>
  );
}

/**
 * The exam. `start` is {unitId} for the session exam or {kind:"trial", course}. `onDone` continues to the
 * lesson (or back to the course); `onSkip`, when given, lets a learner who was away go straight to today.
 */
function LrnExam({ start, onDone, onSkip }) {
  const [ex, setEx] = React.useState(undefined);
  const [err, setErr] = React.useState("");
  const [phase, setPhase] = React.useState("intro");          // intro | sit | review
  const [at, setAt] = React.useState(0);
  const [ans, setAns] = React.useState({}), [conf, setConf] = React.useState({}), [flag, setFlag] = React.useState({});
  const [busy, setBusy] = React.useState(false), [now, setNow] = React.useState(Date.now());
  const [pledge, setPledge] = React.useState(false);
  const sig = React.useRef({ pastes: 0, pastedChars: 0, typedChars: 0, leaves: 0, awaySecs: 0, awayAt: 0, pasteBlocked: 0, copyTries: 0, fsExits: 0 });
  const [warn, setWarn] = React.useState("");
  const dirty = React.useRef(false), sent = React.useRef(false);
  const startKey = JSON.stringify(start);

  const take = React.useCallback(x => {
    setEx(x || null);
    if (x) { setAns(x.answers && !Array.isArray(x.answers) ? x.answers : {}); setConf(x.confidence && !Array.isArray(x.confidence) ? x.confidence : {});
      if (x.status !== "open") setPhase("done"); else if (Object.keys(x.answers || {}).length) setPhase("sit"); }
  }, []);
  const load = React.useCallback(() => { setErr(""); NGGApi.member.exam.start(start).then(r => take(r.exam)).catch(e => setErr(e.code || "failed")); }, [startKey]); // eslint-disable-line
  React.useEffect(() => { load(); }, [load]);
  // Nothing to sit (the first lesson of a course, or nothing asked last time): straight to today.
  React.useEffect(() => { if (ex === null && onDone) onDone(true); }, [ex]); // eslint-disable-line

  const shift = React.useMemo(() => ex ? Date.parse(ex.serverNow) - Date.now() : 0, [ex && ex.serverNow]); // eslint-disable-line
  const left = ex ? (Date.parse(ex.deadline) - (now + shift)) / 1000 : 0;
  const signals = () => { const s = sig.current; return { pastes: s.pastes, pastedChars: s.pastedChars, typedChars: s.typedChars, leaves: s.leaves, awaySecs: Math.round(s.awaySecs),
    pasteBlocked: s.pasteBlocked, copyTries: s.copyTries, fsExits: s.fsExits }; };

  const submit = React.useCallback(async () => {
    if (!ex || sent.current) return; sent.current = true; setBusy(true);
    try { take((await NGGApi.member.exam.submit(ex.sittingId, ans, conf, signals())).exam); }
    catch (e) { sent.current = false; toast.error(humanizeError(e.code, "Couldn’t hand it in. Check your connection — your answers are saved.")); }
    finally { setBusy(false); }
  }, [ex, ans, conf]); // eslint-disable-line

  // The clock; at zero, hand in what is saved.
  React.useEffect(() => { if (phase !== "sit" && phase !== "review") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [phase]);
  React.useEffect(() => { if ((phase === "sit" || phase === "review") && ex && ex.status === "open" && left <= 0) submit(); }, [left <= 0, phase]); // eslint-disable-line
  // Autosave: every ten seconds while something changed, and when they leave the page.
  React.useEffect(() => {
    if (phase !== "sit" && phase !== "review") return;
    const save = () => { if (!dirty.current || !ex) return; dirty.current = false; NGGApi.member.exam.save(ex.sittingId, ans, conf, signals()).catch(() => { dirty.current = true; }); };
    const t = setInterval(save, 10000);
    const vis = () => { const s = sig.current;
      if (document.hidden) { s.leaves++; s.awayAt = Date.now(); dirty.current = true; save(); }
      else if (s.awayAt) { s.awaySecs += (Date.now() - s.awayAt) / 1000; s.awayAt = 0;
        setWarn("You left the exam " + (s.leaves === 1 ? "once" : s.leaves + " times") + ". Leaving is recorded for your instructor — stay on this page until you hand in."); } };
    /* Full screen is ASKED for on start (not every phone allows it); leaving it is counted and said. */
    const fs = () => { if (!document.fullscreenElement && sig.current.fsOn) { sig.current.fsExits++; dirty.current = true; setWarn("You left full screen. It is recorded — press “Full screen” to go back."); } if (document.fullscreenElement) sig.current.fsOn = true; };
    const leaving = e => { e.preventDefault(); e.returnValue = ""; };
    document.addEventListener("visibilitychange", vis);
    document.addEventListener("fullscreenchange", fs);
    window.addEventListener("beforeunload", leaving);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); document.removeEventListener("fullscreenchange", fs); window.removeEventListener("beforeunload", leaving); };
  }, [phase, ex, ans, conf]);

  if (err) return <ErrorState title="Couldn't open the session exam" code={err} onRetry={load}/>;
  if (ex === undefined) return <div className="lrn-wait" role="status" aria-label="Opening the exam"/>;
  if (ex === null) return null;
  if (ex.status === "viva") return <LxViva ex={ex} onExam={take}/>;
  if (ex.result) return <LxResult ex={ex} onDone={onDone ? () => onDone(false) : null}/>;

  const qs = ex.questions || [];
  const isTrial = ex.kind === "trial";
  const mins = Math.round(ex.timeLimitSec / 60);
  if (phase === "intro") return (
    <section className="lx-card lx-intro" aria-labelledby="lx-intro-h">
      <p className="lx-eyebrow">{isTrial ? "The Trial" : "Before today's lesson"}</p>
      <h2 id="lx-intro-h" className="lx-title">{ex.title}</h2>
      <dl className="lx-facts">
        <div><dt>Questions</dt><dd>{qs.length}</dd></div>
        <div><dt>Time</dt><dd>{mins} min</dd></div>
        <div><dt>Pass mark</dt><dd>{ex.passMark}%</dd></div>
        <div><dt>Outstanding</dt><dd>{ex.bands.outstanding}%+</dd></div>
      </dl>
      <ul className="lx-rules">
        <li>{isTrial ? "Questions from across everything you have completed in the course." : "Last session's questions from memory" + (qs.some(q => q.role === "spaced") ? ", plus a few from earlier weeks — the ones that slipped before come back first." : ".")}</li>
        <li>One question at a time. Go back to any of them, and flag the ones to check before you hand in.</li>
        <li>For choice questions, say how sure you are. It is not scored — it tells you where your misconceptions are.</li>
        <li>The clock keeps running if you leave. Your answers save as you go, and if the connection drops you carry on where you were.</li>
        <li>After you hand in, you may get {isTrial ? "" : "up to "}two short follow-up questions about your own written answers. Everybody gets the same number.</li>
        <li>The exam opens full screen. Pasting into answers and copying the questions are switched off, your name is shown across the paper, and leaving the page or full screen is recorded for your instructor.</li>
        <li>Bands: Outstanding {ex.bands.outstanding}%+, Distinction {ex.bands.distinction}%+, Merit {ex.bands.merit}%+, Pass {ex.passMark}%+.</li>
      </ul>
      {/* THE HONOUR PLEDGE (owner: "A standard honourable exam"). Made before the clock, recorded on the
          sitting, and what an instructor reads first beside the result. */}
      <label className="lx-pledge">
        <input type="checkbox" checked={pledge} onChange={e => setPledge(e.target.checked)}/>
        <span><b>On my honour</b>, I will answer from memory and on my own: no notes, no other person, no AI and no searching. What I hand in is my own work.</span>
      </label>
      <div className="lx-acts">
        <button type="button" className="lrn-btn" disabled={!pledge}
          onClick={() => { NGGApi.member.exam.save(ex.sittingId, {}, {}, { pledge: 1 }).catch(() => {}); lxFullscreen(); setPhase("sit"); }}>Start — the clock begins</button>
        {onSkip && !isTrial && <button type="button" className="lrn-btn is-ghost" onClick={onSkip}>Skip to today's lesson (it stays due)</button>}
      </div>
    </section>
  );

  const q = qs[Math.min(at, qs.length - 1)];
  const answered = id => { const v = ans[id]; return v !== undefined && v !== "" && !(Array.isArray(v) && !v.length); };
  const set = (id, v) => { setAns(a => ({ ...a, [id]: v })); dirty.current = true; };
  const done = qs.filter(x => answered(x.checkId)).length;
  const clock = <p className={"lx-clock" + (left < 60 ? " is-low" : "")} role="timer" aria-live={left < 60 ? "polite" : "off"} aria-label={"Time left " + lxMmss(left)}>{lxMmss(left)}</p>;

  if (phase === "review") return (
    <section className="lx-card lx-review" aria-labelledby="lx-rev-h">
      <div className="lx-top"><h2 id="lx-rev-h" className="lx-title">Check before you hand in</h2>{clock}</div>
      <p className="lx-note">{done} of {qs.length} answered{Object.values(flag).filter(Boolean).length ? " · " + Object.values(flag).filter(Boolean).length + " flagged" : ""}. Handing in is final for this sitting.</p>
      <ol className="lx-grid">{qs.map((x, i) => (
        <li key={x.checkId}><button type="button" className={"lx-cell" + (answered(x.checkId) ? " is-done" : "") + (flag[x.checkId] ? " is-flag" : "")}
          onClick={() => { setAt(i); setPhase("sit"); }} aria-label={"Question " + x.n + (answered(x.checkId) ? ", answered" : ", not answered") + (flag[x.checkId] ? ", flagged" : "")}>{x.n}</button></li>))}</ol>
      <div className="lx-acts">
        <button type="button" className="lrn-btn" disabled={busy} onClick={submit}>{busy ? "Marking…" : "Hand it in"}</button>
        <button type="button" className="lrn-btn is-ghost" onClick={() => setPhase("sit")}>Back to the questions</button>
      </div>
    </section>
  );

  /* No copying the questions out (to paste into an AI): selection, copy, cut and the context menu are
     switched off on the paper, and a try is counted. Answers stay editable. */
  const guard = e => { if (e.target && e.target.closest && e.target.closest("textarea, input")) return; e.preventDefault(); sig.current.copyTries++; dirty.current = true; };
  const mark = ex.candidate && ex.candidate.name ? ex.candidate.name + " · " + ex.sittingId : ex.sittingId;
  return (
    <section className="lx-card lx-sit lx-locked" aria-labelledby="lx-q-h" onCopy={guard} onCut={guard} onContextMenu={guard}>
      <div className="lx-mark" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i}>{mark}</span>)}</div>
      {warn && <p className="lx-warn" role="alert">{warn} <button type="button" className="lx-warn-x" onClick={() => setWarn("")} aria-label="Close the warning"><i className="ph ph-x" aria-hidden="true"/></button></p>}
      {typeof document !== "undefined" && document.fullscreenEnabled && !document.fullscreenElement && <button type="button" className="lrn-btn is-ghost lx-fsbtn" onClick={lxFullscreen}><i className="ph ph-arrows-out" aria-hidden="true"/>Full screen</button>}
      <div className="lx-top">
        <p className="lx-eyebrow">Question {at + 1} of {qs.length} · {LX_KIND[q.kind] || "Question"} · {q.points} mark{q.points === 1 ? "" : "s"}{q.role === "spaced" ? " · from week " + q.week : ""}</p>
        {clock}
      </div>
      <div className="lx-dots" aria-hidden="true">{qs.map((x, i) => <i key={x.checkId} className={(i === at ? "is-on " : "") + (answered(x.checkId) ? "is-done " : "") + (flag[x.checkId] ? "is-flag" : "")}/>)}</div>
      <h2 id="lx-q-h" className="lx-q">{q.prompt}</h2>
      <LxField key={q.checkId} q={q} exam value={ans[q.checkId]} onChange={v => set(q.checkId, v)}
        onPasteBlocked={() => { sig.current.pasteBlocked++; dirty.current = true; setWarn("Pasting is switched off in the exam — type your answer. The try is recorded."); }}
        onPaste={n => { sig.current.pastes++; sig.current.pastedChars += n; dirty.current = true; }} onType={n => { sig.current.typedChars += Math.min(n, 3); }}/>
      {(q.kind === "mcq" || q.kind === "order") && (
        <div className="lx-conf" role="radiogroup" aria-label="How sure are you?">
          <span className="lx-conf-k">How sure are you?</span>
          {LX_CONF.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={conf[q.checkId] === k} className={"lx-chip" + (conf[q.checkId] === k ? " is-on" : "")}
            onClick={() => { setConf(c => ({ ...c, [q.checkId]: k })); dirty.current = true; }}>{l}</button>)}
        </div>)}
      <div className="lx-acts lx-nav">
        <button type="button" className="lrn-btn is-ghost" disabled={at === 0} onClick={() => setAt(a => a - 1)}><i className="ph ph-arrow-left" aria-hidden="true"/>Back</button>
        <button type="button" className={"lrn-btn is-ghost lx-flag" + (flag[q.checkId] ? " is-on" : "")} aria-pressed={!!flag[q.checkId]} onClick={() => setFlag(f => ({ ...f, [q.checkId]: !f[q.checkId] }))}>
          <i className={(flag[q.checkId] ? "ph-fill" : "ph") + " ph-flag"} aria-hidden="true"/>{flag[q.checkId] ? "Flagged" : "Flag"}</button>
        {at < qs.length - 1
          ? <button type="button" className="lrn-btn" onClick={() => setAt(a => a + 1)}>Next<i className="ph ph-arrow-right" aria-hidden="true"/></button>
          : <button type="button" className="lrn-btn" onClick={() => setPhase("review")}>Review and hand in</button>}
      </div>
      <p className="lx-note" aria-live="polite">{done} of {qs.length} answered · saved as you go</p>
    </section>
  );
}

/* ── Mastery: from Starter to God, per course (domain/learn-mastery.php) ── */
const LX_TIER_IC = ["ph-leaf", "ph-plant", "ph-tree", "ph-mountains", "ph-crown-simple", "ph-crown"];
function LrnMastery({ course }) {
  const [d, setD] = React.useState(null), [err, setErr] = React.useState(""), [trial, setTrial] = React.useState(false);
  const load = React.useCallback(() => { setErr(""); NGGApi.member.exam.mastery().then(setD).catch(e => setErr(e.code || "failed")); }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <ErrorState title="Couldn't load your mastery" code={err} onRetry={load}/>;
  if (!d) return <div className="lrn-wait" role="status" aria-label="Loading your mastery"/>;
  const list = (d.courses || []).filter(c => !course || c.course.toLowerCase() === String(course).toLowerCase());
  const certs = (d.certificates || []).filter(c => !course || c.course.toLowerCase() === String(course).toLowerCase() || c.scope === "promotion");
  if (trial) return <LrnExam start={{ kind: "trial", course: trial }} onDone={() => { setTrial(false); load(); }}/>;
  return (
    <div className="lx-mastery">
      {list.map(c => (
        <section key={c.course} className={"lx-card lx-tier is-t" + c.tier} aria-label={c.course + ": " + c.tierName}>
          <div className="lx-tier-head">
            <span className="lx-tier-ic" aria-hidden="true"><i className={"ph-fill " + (LX_TIER_IC[Math.max(0, c.tier - 1)] || "ph-leaf")}/></span>
            <div><p className="lx-eyebrow">{c.course}</p><h3 className="lx-tier-name">{c.tier === 6 ? "God of " + c.course : c.tierName}</h3></div>
          </div>
          <ol className="lx-ladder" aria-label="Tiers">{d.tiers.map((t, i) => <li key={t} className={i + 1 <= c.tier ? "is-done" : i + 1 === c.tier + 1 ? "is-next" : ""}>{t}</li>)}</ol>
          <p className="lx-note">{c.completed} of {c.lessons} lessons · {c.exams} session exam{c.exams === 1 ? "" : "s"}{c.exams ? ", average " + c.examAvg + "%" : ""}{c.trialPct != null ? " · Trial best " + c.trialPct + "%" : ""}</p>
          <p className="lx-next"><b>Next:</b> {c.next}</p>
          {c.trial && (c.trial.open || c.trial.inProgress) && <button type="button" className="lrn-btn" onClick={() => setTrial(c.course)}>{c.trial.inProgress ? "Carry on with the Trial" : "Sit the Trial"}</button>}
          {c.trial && c.trial.waitDays > 0 && <p className="lx-note">The Trial opens again in {c.trial.waitDays} day{c.trial.waitDays === 1 ? "" : "s"} — use them on what it showed you.</p>}
        </section>))}
      {certs.length > 0 && (
        <section className="lx-card" aria-labelledby="lx-certs-h">
          <h3 id="lx-certs-h" className="lx-title">Certificates</h3>
          <ul className="lx-certs">{certs.map(c => (
            <li key={c.no} className={"lx-cert is-" + c.style}>
              <i className={"ph-fill " + (c.scope === "god" ? "ph-crown" : c.scope === "promotion" ? "ph-arrow-fat-up" : "ph-certificate")} aria-hidden="true"/>
              <span><b>{c.title}</b><small>{c.no}</small></span>
              <a className="lrn-btn is-ghost" href={c.url} target="_blank" rel="noopener">View</a>
            </li>))}</ul>
        </section>)}
    </div>
  );
}
