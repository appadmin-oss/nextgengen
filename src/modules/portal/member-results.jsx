/* ── School results (the member dashboard's "School results" section) ─────────────
 *
 * Upload · Check · Plan · Send, then the plan lived with week by week.
 * Server: api/member/results.php → domain/school-results.php. The server
 * decides what is allowed (when-and-where required, three subjects at most,
 * a target never below the current score); this screen shows the member what
 * it will ask before it asks, and names the field when it refuses.
 */

/* ── Building blocks (from the withdrawn portal shell; only what this flow uses) ── */

/** Phosphor icon: regular when inactive, fill when active. */
function PIcon({ name, on, className }) {
  return <i className={"ph" + (on ? "-fill" : "") + " ph-" + name + (className ? " " + className : "")} aria-hidden="true"/>;
}


function PtCard({ title, meta, action, children, tone, className }) {
  return (
    <section className={"pt-card" + (tone ? " pt-card--" + tone : "") + (className ? " " + className : "")}>
      {(title || action) && (
        <div className="pt-card-h">
          <div><h2>{title}</h2>{meta && <p className="pt-card-meta">{meta}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** The three states that are not optional: loading, an honest error with a retry, and ready. */
function PtLoad({ state, onRetry, rows, children, what }) {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => { if (state !== "loading") return; const t = setTimeout(() => setSlow(true), 300); return () => clearTimeout(t); }, [state]);
  if (state === "loading") return slow ? <div className="pt-skel" aria-busy="true" aria-label="Loading">{Array.from({ length: rows || 3 }).map((_, i) => <div key={i} className="pt-skel-row"/>)}</div> : null;
  if (state === "error") return (
    <div className="pt-error" role="alert">
      <PIcon name="cloud-slash"/>
      <div><b>We couldn’t load {what || "this"}.</b><p>Check your connection, then try again.</p></div>
      <button type="button" className="pt-btn" onClick={onRetry}>Try again</button>
    </div>
  );
  return children;
}


/** A figure that is a button to the screen that explains it. */
function PtStat({ label, value, sub, onClick, tone }) {
  return (
    <button type="button" className={"pt-stat" + (tone ? " pt-tone-" + tone : "")} onClick={onClick}>
      <small>{label}</small><b>{value}</b>{sub && <span>{sub}</span>}
    </button>
  );
}


function ptDate(iso, opts) {
  if (!iso) return "";
  const d = new Date(String(iso).length === 10 ? iso + "T12:00:00Z" : iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString("en-GB", Object.assign({ day: "numeric", month: "short" }, opts || {}));
}


const RS_STEPS = [["upload", "Upload"], ["check", "Check"], ["plan", "Plan"], ["send", "Send"]];
const RS_ERR = {
  bad_file_url: "That file didn’t upload properly. Try again.",
  unsupported_type: "Use a photo (JPG or PNG) or a PDF.",
  file_too_large: "That file is over 10 MB. Take a photo instead, or use a smaller PDF.",
  already_sent: "These results were already sent.",
  score_required: "Add a score for every subject, or remove the ones you didn’t take.",
  no_subjects: "Add at least one subject.",
  too_many_subjects: "Pick at most three subjects for the plan.",
  target_below_current: "A target can’t be below your current score.",
  when_required: "Add when and where for each subject.",
  what_required: "Say what you’ll do for each subject.",
  commit_required: "Tick “I’ll do this” to send your plan.",
  uploads_disabled: "Uploading a PDF isn’t switched on here. Take a photo of your report instead.",
  week_closed: "That week has closed.",
  check_first: "Check your scores first.",
};
function rsErr(e) { return RS_ERR[e && (e.code || e.message)] || (e && e.detail) || "That didn’t work. Try again."; }

function rsStep(rec) {
  if (!rec || !rec.upload) return "upload";
  if (rec.upload.status === "draft") return "check";
  if (!rec.plan || rec.plan.status === "draft") return "plan";
  return "sent";
}

function MbrResults({ onChanged }) {
  const [d, setD] = React.useState(null);
  const [state, setState] = React.useState("loading");
  const [term, setTerm] = React.useState(() => { try { return new URLSearchParams(window.location.search).get("term") || ""; } catch (_) { return ""; } });
  const load = React.useCallback((t) => {
    setState(s => (s === "ready" ? "ready" : "loading"));
    return NGGApi.member.results(t !== undefined ? t : term).then(r => { setD(r); setTerm(r.term); setState("ready"); return r; })
      .catch(() => setState(s => (s === "ready" ? "ready" : "error")));
  }, [term]);
  React.useEffect(() => { load(); }, []); // eslint-disable-line
  const refresh = () => { load(term); if (onChanged) onChanged(); };

  return (
    <PtLoad state={state} onRetry={() => load()} what="your results" rows={4}>
      {d && <MbrResultsBody d={d} term={term} setTerm={t => { setTerm(t); load(t); }} refresh={refresh}/>}
    </PtLoad>
  );
}

function MbrResultsBody({ d, term, setTerm, refresh }) {
  const rec = d.record;
  const step = rsStep(rec);
  const idx = step === "sent" ? 4 : RS_STEPS.findIndex(s => s[0] === step);
  const termLabel = (d.terms.find(t => t.key === term) || {}).label || rec && rec.termLabel || "";
  return (
    <div className="rs">
      {d.due && d.due.term === term && step !== "sent" && (
        <div className={"rs-due" + (d.due.overdue ? " is-late" : "")} role="status">
          <PIcon name={d.due.overdue ? "warning-circle" : "calendar-blank"}/>
          <span><b>{d.due.overdue ? "Overdue · " : ""}{d.due.label} results</b> {d.due.overdue ? "were due" : "are due"} {ptDate(d.due.dueOn, { weekday: "long", day: "numeric", month: "long" })}. Required every term; the reminder stays until they’re sent.</span>
        </div>
      )}
      {step !== "sent" && (
        <ol className="rs-steps" aria-label="Steps">
          {RS_STEPS.map(([k, l], i) => (
            <li key={k} className={i < idx ? "is-done" : i === idx ? "is-on" : ""} aria-current={i === idx ? "step" : undefined}>
              <span className="rs-steps-bar"/><span>{i < idx ? <PIcon name="check"/> : null}{l}</span>
            </li>
          ))}
        </ol>
      )}
      {step === "upload" && <RsUpload d={d} term={term} setTerm={setTerm} onDone={refresh}/>}
      {step === "check" && <RsCheck rec={rec} onDone={refresh}/>}
      {step === "plan" && <RsPlan d={d} rec={rec} onDone={refresh}/>}
      {step === "sent" && <RsSent d={d} rec={rec} termLabel={termLabel} onDone={refresh}/>}
      <RsHistory d={d} term={term} setTerm={setTerm}/>
    </div>
  );
}

/* Upload ────────────────────────────────────────────────────────────────── */
function RsUpload({ d, term, setTerm, onDone }) {
  const [busy, setBusy] = React.useState(false);
  const [pct, setPct] = React.useState(0);
  const [err, setErr] = React.useState("");
  const fileRef = React.useRef(null), camRef = React.useRef(null);
  const pick = async (file) => {
    if (!file) return;
    setErr("");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf && !/^image\//.test(file.type || "")) { setErr(RS_ERR.unsupported_type); return; }
    if (isPdf && file.size > d.maxBytes) { setErr(RS_ERR.file_too_large); return; }
    setBusy(true); setPct(1);
    try {
      const up = isPdf ? await NGGApi.uploadFile(file, "results", setPct) : await NGGApi.uploadOrInline(file, "results", setPct);
      if (up.inline) throw Object.assign(new Error("bad_file_url"), { code: "bad_file_url" });
      const size = up.bytes || file.size || 1;
      const r = await NGGApi.member.resultsUpload(term, up.url, isPdf ? "application/pdf" : (/png$/i.test(up.url) ? "image/png" : "image/jpeg"), Math.min(size, d.maxBytes));
      setPct(100);
      // Read it straight away; the Check step shows what came back.
      try { await NGGApi.member.resultsRead(r.uploadId); } catch (_) {}
      onDone();
    } catch (e) { setErr(rsErr(e)); setBusy(false); setPct(0); }
  };
  return (
    <PtCard title="Upload your report card" meta="A clear photo of the whole page, or the PDF your school sent.">
      <label className="pt-field">
        <span>Which term</span>
        <select value={term} onChange={e => setTerm(e.target.value)} disabled={busy}>
          {d.terms.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>
      <div className="rs-pick">
        <button type="button" className="pt-btn pt-btn--ink" disabled={busy} onClick={() => camRef.current && camRef.current.click()}><PIcon name="camera"/> Take a photo</button>
        <button type="button" className="pt-btn" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}><PIcon name="file-arrow-up"/> Choose a photo or PDF</button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => pick(e.target.files[0])}/>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={e => pick(e.target.files[0])}/>
      </div>
      {busy && <div className="rs-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading"><span style={{ width: pct + "%" }}/></div>}
      {busy && <p className="pt-hint" aria-live="polite">{pct < 100 ? "Uploading… " + pct + "%" : "Reading your report…"}</p>}
      {err && <p className="pt-err" role="alert">{err}</p>}
      <p className="pt-hint"><PIcon name="lock-simple"/> Your results go to your mentor, your instructor and the NGG team. Never to other members.</p>
    </PtCard>
  );
}

/* Check ────────────────────────────────────────────────────────────────── */
function RsCheck({ rec, onDone }) {
  const [rows, setRows] = React.useState(null);
  const [read, setRead] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [bad, setBad] = React.useState([]);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    NGGApi.member.resultsRead(rec.upload.uploadId)
      .then(r => { setRead(r); setRows(r.subjects.length ? r.subjects.map(s => ({ name: s.name, score: s.score === null ? "" : String(s.score), last: s.last, low: s.low })) : [{ name: "", score: "", last: null, low: false }]); })
      .catch(() => { setRead({ read: false }); setRows([{ name: "", score: "", last: null, low: false }]); });
  }, [rec.upload.uploadId]);
  if (!rows) return <PtLoad state="loading" rows={5}/>;
  const set = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? Object.assign({}, r, { [k]: v, low: k === "score" ? false : r.low }) : r));
  const confirm = async () => {
    setErr(""); setBad([]);
    const subjects = rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), score: r.score === "" ? null : Number(r.score) }));
    const outOfRange = subjects.filter(s => s.score !== null && (isNaN(s.score) || s.score < 0 || s.score > 100)).map(s => s.name);
    if (outOfRange.length) { setBad(outOfRange); setErr("Scores are from 0 to 100."); return; }
    setBusy(true);
    try { await NGGApi.member.resultsConfirm(rec.upload.uploadId, subjects); onDone(); }
    catch (e) { setBad((e.data && e.data.subjects) || []); setErr(rsErr(e)); setBusy(false); }
  };
  return (
    <PtCard title="Check your scores" meta={read && read.read ? "We read these from your report. Check every number against the page — fix anything that’s wrong." : "We couldn’t read the report automatically. Type each subject’s term score."}
      action={rec.upload.fileUrl && <a className="pt-link" href={rec.upload.fileUrl} target="_blank" rel="noopener noreferrer">View your report <PIcon name="arrow-square-out"/></a>}>
      <div className="rs-table" role="table" aria-label="Your scores">
        <div className="rs-tr rs-th" role="row"><span role="columnheader">Subject</span><span role="columnheader">Score</span><span role="columnheader">Last term</span><span role="columnheader">Change</span><span role="columnheader"><span className="sr-only">Remove</span></span></div>
        {rows.map((r, i) => {
          const ch = r.last !== null && r.last !== undefined && r.score !== "" ? Number(r.score) - r.last : null;
          const isBad = bad.includes(r.name.trim());
          return (
            <div key={i} className={"rs-tr" + (r.low ? " is-low" : "") + (isBad ? " is-bad" : "")} role="row">
              <span role="cell"><input aria-label={"Subject " + (i + 1)} value={r.name} maxLength={40} placeholder="Subject" onChange={e => set(i, "name", e.target.value)}/></span>
              <span role="cell"><input aria-label={(r.name || "Subject " + (i + 1)) + " score"} inputMode="numeric" value={r.score} maxLength={3} placeholder="0–100"
                onChange={e => set(i, "score", e.target.value.replace(/[^0-9]/g, ""))}/></span>
              <span role="cell" className="rs-num">{r.last === null || r.last === undefined ? "–" : r.last}</span>
              <span role="cell" className={"rs-num " + (ch > 0 ? "is-up" : ch < 0 ? "is-down" : "")}>{ch === null ? "–" : (ch > 0 ? "+" : "") + ch}</span>
              <span role="cell"><button type="button" className="pt-icon-btn" aria-label={"Remove " + (r.name || "this row")} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><PIcon name="x"/></button></span>
            </div>
          );
        })}
      </div>
      {rows.some(r => r.low) && <p className="pt-hint"><span className="rs-swatch"/> Amber rows were hard to read. Check those first.</p>}
      <button type="button" className="pt-btn pt-btn--ghost" onClick={() => setRows(rs => rs.concat([{ name: "", score: "", last: null, low: false }]))} disabled={rows.length >= 20}><PIcon name="plus"/> Add subject</button>
      {err && <p className="pt-err" role="alert">{err}</p>}
      <div className="pt-actions">
        <button type="button" className="pt-btn pt-btn--ink" disabled={busy} onClick={confirm}>{busy ? "Saving…" : "These are right"}</button>
      </div>
      <p className="pt-hint">Every correction is recorded.</p>
    </PtCard>
  );
}

/* Plan ─────────────────────────────────────────────────────────────────── */
function RsPlan({ d, rec, onDone }) {
  const [plan, setPlan] = React.useState(rec.plan);
  const [items, setItems] = React.useState(rec.plan ? rec.plan.items : null);
  const [habit, setHabit] = React.useState(rec.plan ? rec.plan.habit : "");
  const [family, setFamily] = React.useState(rec.plan ? rec.plan.recipients.family : false);
  const [commit, setCommit] = React.useState(rec.plan ? rec.plan.committed : false);
  const [busy, setBusy] = React.useState("");
  const [bad, setBad] = React.useState({});
  const [err, setErr] = React.useState("");
  const [drafting, setDrafting] = React.useState(!rec.plan);
  React.useEffect(() => {
    if (rec.plan) return;
    NGGApi.member.resultsDraft(rec.upload.uploadId)
      .then(r => { setPlan(r.plan); setItems(r.plan.items); setHabit(r.plan.habit || ""); setDrafting(false); })
      .catch(e => { setErr(rsErr(e)); setDrafting(false); });
  }, []); // eslint-disable-line
  if (drafting) return <PtCard title="Drafting your plan…"><p className="pt-hint" aria-live="polite">Looking at your scores and picking where to start.</p><PtLoad state="loading" rows={3}/></PtCard>;
  if (!plan) return <PtCard title="Your plan">{err && <p className="pt-err" role="alert">{err}</p>}</PtCard>;
  const k = rec.kpis || {};
  const methods = d.methods || [];
  const subjects = rec.subjects || [];
  const unused = subjects.filter(s => !items.some(i => i.subject.toLowerCase() === s.name.toLowerCase()));
  const setItem = (i, key, v) => { setItems(xs => xs.map((x, j) => j === i ? Object.assign({}, x, { [key]: v }) : x)); setBad(b => Object.assign({}, b, { [i + key]: false })); };
  const body = () => ({ planId: plan.planId, items: items.map(x => ({ subject: x.subject, target: x.target, method: x.method, what: x.what, whenWhere: x.whenWhere, sessionsPerWeek: x.sessionsPerWeek, helper: x.helper })),
    habit, recipients: { family }, committed: commit });
  const save = async () => {
    setBusy("save"); setErr("");
    try { const r = await NGGApi.member.resultsSave(body()); setItems(r.plan.items); toast.success("Saved. Nothing is sent yet."); }
    catch (e) { setErr(rsErr(e)); } finally { setBusy(""); }
  };
  const send = async () => {
    setErr("");
    const miss = {};
    items.forEach((x, i) => { if (String(x.whenWhere || "").trim().length < 4) miss[i + "whenWhere"] = true; if (!String(x.what || "").trim()) miss[i + "what"] = true; });
    if (Object.keys(miss).length) {
      setBad(miss);
      const names = items.filter((x, i) => miss[i + "whenWhere"]).map(x => x.subject);
      toast.error(names.length ? "Add when and where for " + names.join(", ") + "." : RS_ERR.what_required);
      const first = document.querySelector(".rs-item .is-bad input, .rs-item .is-bad textarea"); if (first) first.focus();
      return;
    }
    if (!commit) { setErr(RS_ERR.commit_required); return; }
    setBusy("send");
    try {
      const r = await NGGApi.member.resultsSend(body());
      toast.success(r.mentor ? "Sent to " + r.mentor.split(" ")[0] + " for approval." : "Sent. Your mentor will see it when one is assigned.");
      onDone();
    } catch (e) {
      const subs = (e.data && e.data.subjects) || [];
      if (subs.length) { const m = {}; items.forEach((x, i) => { if (subs.includes(x.subject)) m[i + (e.code === "what_required" ? "what" : "whenWhere")] = true; }); setBad(m); }
      setErr(rsErr(e)); setBusy("");
    }
  };
  return (
    <React.Fragment>
      {plan.returnNote && (
        <div className="rs-returned" role="status"><PIcon name="arrow-u-up-left"/><div><b>Your mentor sent the plan back</b><p>“{plan.returnNote}”</p><small>Change what they asked, then send it again.</small></div></div>
      )}
      <div className="pt-stats">
        <PtStat label="Average" value={k.avg === null || k.avg === undefined ? "–" : k.avg}/>
        <PtStat label="Since last term" value={k.change === null || k.change === undefined ? "–" : (k.change > 0 ? "+" : "") + k.change} tone={k.change < 0 ? "danger" : k.change > 0 ? "success" : ""}/>
        <PtStat label="Best" value={k.best ? k.best.score : "–"} sub={k.best ? k.best.name : ""}/>
        <PtStat label="Focus" value={items.length + " of " + d.maxFocus}/>
      </div>
      {(plan.summary || plan.flags.length > 0) && (
        <div className="rs-ai">
          <span className="rs-ai-tag"><PIcon name="sparkle"/> {plan.draftedBy === "ai" ? "Drafted by AI" : "Drafted for you"} · yours to change</span>
          {plan.summary && <p>{plan.summary}</p>}
          {plan.flags.length > 0 && <ul>{plan.flags.map(f => <li key={f}>{f}</li>)}</ul>}
        </div>
      )}
      {items.map((x, i) => {
        const m = methods.find(mm => mm.key === x.method) || {};
        return (
          <PtCard key={x.subject} className="rs-item" title={x.subject} meta={"Now " + (x.current === null ? "–" : x.current)}
            action={<button type="button" className="pt-icon-btn" aria-label={"Take " + x.subject + " out of the plan"} onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}><PIcon name="trash"/></button>}>
            <div className="rs-target">
              <span>Target</span>
              <button type="button" className="pt-step" aria-label="Lower the target" disabled={x.target <= (x.current || 0)} onClick={() => setItem(i, "target", Math.max(x.current || 0, x.target - 1))}><PIcon name="minus"/></button>
              <b aria-live="polite">{x.target}</b>
              <button type="button" className="pt-step" aria-label="Raise the target" disabled={x.target >= 100} onClick={() => setItem(i, "target", Math.min(100, x.target + 1))}><PIcon name="plus"/></button>
              <small>A specific target, a little above where you are, works better than “do my best”.</small>
            </div>
            <label className={"pt-field" + (bad[i + "what"] ? " is-bad" : "")}>
              <span>What I’ll do</span>
              <textarea rows={2} maxLength={400} value={x.what} onChange={e => setItem(i, "what", e.target.value)}/>
            </label>
            <label className={"pt-field" + (bad[i + "whenWhere"] ? " is-bad" : "")}>
              <span>When and where <em>required</em></span>
              <input value={x.whenWhere} maxLength={200} placeholder="e.g. Monday and Thursday after school, at the dining table" onChange={e => setItem(i, "whenWhere", e.target.value)}
                aria-invalid={bad[i + "whenWhere"] ? "true" : undefined} aria-describedby={"rs-when-" + i}/>
              <small id={"rs-when-" + i}>Plans that say exactly when and where (“When it’s 5pm on Monday, I’ll…”) get done far more often.</small>
            </label>
            <div className="rs-row">
              <label className="pt-field">
                <span>How I’ll study</span>
                <select value={x.method} onChange={e => setItem(i, "method", e.target.value)}>
                  {methods.map(mm => <option key={mm.key} value={mm.key}>{mm.label}</option>)}
                </select>
                <small>{m.why}</small>
              </label>
              <div className="pt-field">
                <span id={"rs-wk-" + i}>Each week</span>
                <div className="rs-target" role="group" aria-labelledby={"rs-wk-" + i}>
                  <button type="button" className="pt-step" aria-label="Fewer sessions" disabled={x.sessionsPerWeek <= 1} onClick={() => setItem(i, "sessionsPerWeek", x.sessionsPerWeek - 1)}><PIcon name="minus"/></button>
                  <b aria-live="polite">{x.sessionsPerWeek}</b>
                  <button type="button" className="pt-step" aria-label="More sessions" disabled={x.sessionsPerWeek >= 7} onClick={() => setItem(i, "sessionsPerWeek", x.sessionsPerWeek + 1)}><PIcon name="plus"/></button>
                  <small>session{x.sessionsPerWeek === 1 ? "" : "s"}</small>
                </div>
              </div>
              <label className="pt-field">
                <span>Who helps</span>
                <select value={x.helper} onChange={e => setItem(i, "helper", e.target.value)}>
                  {(d.helpers || []).map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
                </select>
              </label>
            </div>
          </PtCard>
        );
      })}
      {items.length < d.maxFocus && unused.length > 0 && (
        <label className="pt-field rs-add">
          <span>Add a subject to the plan</span>
          <select value="" onChange={e => { const s = subjects.find(x => x.name === e.target.value); if (s) setItems(xs => xs.concat([{ subject: s.name, current: s.score, target: Math.min(100, s.score + d.targetStep), method: "retrieval", what: "", whenWhere: "", sessionsPerWeek: 2, helper: "self" }])); }}>
            <option value="">Choose…</option>
            {unused.map(s => <option key={s.name} value={s.name}>{s.name} ({s.score})</option>)}
          </select>
        </label>
      )}
      <PtCard title="One habit for the whole term" meta="Small and specific. It helps every subject.">
        <label className="pt-field"><span className="sr-only">Your habit</span>
          <input value={habit} maxLength={200} placeholder="e.g. Phone stays in the kitchen after 9pm" onChange={e => setHabit(e.target.value)}/></label>
      </PtCard>
      <PtCard title="Who sees it">
        <ul className="rs-recips">
          {[["Your mentor", "Approves it before it goes live"], ["Your instructor", "Reads it and helps in class"], ["The NGG team", "Keeps the record"]].map(([a, b]) => (
            <li key={a}><PIcon name="check-square" on/><span><b>{a}</b><small>{b}</small></span></li>
          ))}
          <li>
            <label className="rs-switch"><input type="checkbox" checked={family} onChange={e => setFamily(e.target.checked)}/><span><b>My family</b><small>Sent once your mentor approves it, with a conversation to have, not a score to check.</small></span></label>
          </li>
        </ul>
        <label className="rs-commit"><input type="checkbox" checked={commit} onChange={e => setCommit(e.target.checked)}/><span>I’ll do this. I’ll tick each session when it’s done.</span></label>
        {err && <p className="pt-err" role="alert">{err}</p>}
        <div className="pt-actions">
          <button type="button" className="pt-btn" disabled={!!busy || !items.length} onClick={save}>{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button type="button" className="pt-btn pt-btn--ink" disabled={!!busy || !items.length} onClick={send}>{busy === "send" ? "Sending…" : "Send to my mentor"}</button>
        </div>
      </PtCard>
    </React.Fragment>
  );
}

/* Sent ─────────────────────────────────────────────────────────────────── */
function RsSent({ d, rec, termLabel, onDone }) {
  const p = rec.plan;
  const [items, setItems] = React.useState(p.items);
  const [busy, setBusy] = React.useState("");
  React.useEffect(() => setItems(p.items), [p]);
  const tick = async (it, delta) => {
    setBusy(it.itemId);
    const before = items;
    setItems(xs => xs.map(x => x.itemId === it.itemId ? Object.assign({}, x, { doneThisWeek: Math.max(0, Math.min(x.sessionsPerWeek, x.doneThisWeek + delta)) }) : x));
    try { const r = await NGGApi.member.resultsTick(it.itemId, delta); setItems(xs => xs.map(x => x.itemId === it.itemId ? Object.assign({}, x, { doneThisWeek: r.done }) : x)); }
    catch (e) { setItems(before); toast.error(rsErr(e)); } finally { setBusy(""); }
  };
  const live = p.status === "live";
  const adh = p.adherence;
  return (
    <React.Fragment>
      <PtCard title={termLabel + " · your plan"} meta={live ? "Approved by " + p.approvedByName + " on " + ptDate(p.approvedAt) : "Waiting for your mentor to approve it"}>
        <ol className="rs-where" aria-label="Where it is">
          <li className="is-done"><b>Sent</b><small>{ptDate(p.sentAt, { weekday: "short", day: "numeric", month: "short" })}</small></li>
          <li className={live ? "is-done" : "is-on"}><b>{live ? "Approved" : "With your mentor"}</b><small>{live ? p.approvedByName : "They read it and approve it, or send it back with a note"}</small></li>
          <li className={p.recipients.family ? (p.familySentAt ? "is-done" : "") : "is-off"}><b>Family</b><small>{!p.recipients.family ? "You chose not to share it" : p.familySentAt ? "Shared " + ptDate(p.familySentAt) : "Shared once it’s approved"}</small></li>
        </ol>
      </PtCard>
      <PtCard title="This week" meta={"Week of " + ptDate(p.weekStart, { day: "numeric", month: "long" }) + (adh !== null && adh !== undefined ? " · " + adh + "% of sessions done over the last weeks" : "")}>
        <ul className="rs-ticks">
          {items.map(it => {
            const full = it.doneThisWeek >= it.sessionsPerWeek;
            return (
              <li key={it.itemId}>
                <div className="rs-ticks-t"><b>{it.subject}</b><small>{it.methodLabel} · {it.whenWhere}</small></div>
                <div className="rs-dots" aria-label={it.doneThisWeek + " of " + it.sessionsPerWeek + " done"}>
                  {Array.from({ length: it.sessionsPerWeek }).map((_, n) => <span key={n} className={n < it.doneThisWeek ? "is-on" : ""}/>)}
                </div>
                <div className="rs-ticks-a">
                  <button type="button" className="pt-icon-btn" aria-label={"Undo one " + it.subject + " session"} disabled={busy === it.itemId || it.doneThisWeek <= 0} onClick={() => tick(it, -1)}><PIcon name="arrow-counter-clockwise"/></button>
                  <button type="button" className={"pt-btn pt-btn--sm" + (full ? "" : " pt-btn--ink")} disabled={busy === it.itemId || full} onClick={() => tick(it, 1)}>{full ? "Done this week" : "I did one"}</button>
                </div>
              </li>
            );
          })}
        </ul>
        {p.habit && <p className="pt-hint"><PIcon name="repeat"/> Your habit: {p.habit}</p>}
      </PtCard>
      <PtCard title="Your reminders" meta="Sent to you automatically.">
        <ul className="rs-rem">
          {items.map(it => <li key={it.itemId}><PIcon name="bell"/> <span><b>{it.subject}</b> · {it.methodLabel}, {it.whenWhere} · {it.sessionsPerWeek} a week</span></li>)}
          <li><PIcon name="calendar-check"/> <span><b>Weekly check-in</b> · Sunday evening: tick what you did</span></li>
          {p.recipients.family && <li><PIcon name="users-three"/> <span><b>Family update</b> · with the weekly family mail</span></li>}
        </ul>
      </PtCard>
      {rec.notes && rec.notes.length > 0 && (
        <PtCard title="Notes on your plan">
          <ul className="rs-notes">{rec.notes.map((n, i) => <li key={i}><b>{n.who}</b> <small>{n.role} · {ptDate(n.at)}</small><p>{n.text}</p></li>)}</ul>
        </PtCard>
      )}
    </React.Fragment>
  );
}

/* History and past terms ─────────────────────────────────────────────── */
function RsHistory({ d, term, setTerm }) {
  const [open, setOpen] = React.useState(false);
  return (
    <React.Fragment>
      {d.history.length > 0 && (
        <details className="pt-card rs-hist" open={open} onToggle={e => setOpen(e.target.open)}>
          <summary><b>History</b> <small>Every change to your results and plan is recorded. Nothing is deleted.</small></summary>
          <ol>{d.history.map((h, i) => <li key={i}><time className="mono">{ptDate(h.at, { day: "numeric", month: "short" })} {String(h.at).slice(11, 16)}</time><span><b>{h.who}</b> {h.what}</span></li>)}</ol>
        </details>
      )}
      {d.past.length > 1 && (
        <PtCard title="Other terms">
          <ul className="rs-past">
            {d.past.filter(x => x.term !== term).map(x => (
              <li key={x.term}><button type="button" className="pt-row-btn" onClick={() => setTerm(x.term)}>
                <span><b>{x.label}</b><small>{x.planStatus === "live" ? "Plan live" : x.status === "sent" ? "Sent" : "Not finished"}</small></span>
                <b className="rs-num">{x.avg === null ? "–" : x.avg}</b><PIcon name="caret-right"/>
              </button></li>
            ))}
          </ul>
        </PtCard>
      )}
    </React.Fragment>
  );
}
