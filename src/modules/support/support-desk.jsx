/* ============================================================================
   NGG support — the in-portal desk (domain/support.php).

   One component, mounted in My NGG (and its community) and in the Family
   account, with that portal's own API (NGGApi.member.support /
   NGGApi.family.support — the same contract). Modelled on how Cloudflare
   runs support: the help answers come first and stay beside the form; a case
   has a category, a priority chosen by impact (each priority says what it
   means and how soon we aim to reply), what to include for that category, and
   screenshots; "My cases" is the list to come back to.

   A case is a CASE on every screen, never a ticket. Safeguarding is not a
   category: a worry about a child's safety goes to the safeguarding lead, and
   the desk says so above the form (`safeguard` prop: the portal's own way in).
   ========================================================================== */

const SUP_FILES_TOTAL = 7000000;   // what a shared host's post_max_size reliably takes, in base64

function supDate(iso) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d)) return "";
  const t = new Date(), same = d.toDateString() === t.toDateString();
  return same ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function supErr(e) { return (e && (e.detail || e.message)) || "That didn’t go through. Try again."; }
function supTone(st) { return { new: "info", open: "info", pending: "warn", solved: "ok", closed: "muted" }[st] || "muted"; }

/** Read chosen files as data URLs: photos shrunk by the shared tool, PDFs as they are. */
async function supReadFiles(list, max) {
  const out = [];
  for (const f of Array.from(list || []).slice(0, max)) {
    if (/^image\//.test(f.type)) { const url = await NGGApi.documentToDataUrl(f); if (url) out.push({ name: f.name, data: url }); }
    else if (f.type === "application/pdf" && f.size <= 3 * 1024 * 1024) {
      out.push({ name: f.name, data: await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }) });
    }
  }
  return out;
}

function SupFilePicker({ files, setFiles, max, busy }) {
  const ref = React.useRef(null);
  const [why, setWhy] = React.useState("");
  const pick = async e => {
    const chosen = Array.from(e.target.files || []); e.target.value = "";
    if (files.length + chosen.length > max) { setWhy("At most " + max + " files on one message."); return; }
    setWhy("");
    const read = await supReadFiles(chosen, max - files.length);
    if (read.length < chosen.length) setWhy("Only screenshots, photos and PDFs (up to 3 MB) can be attached.");
    const all = files.concat(read);
    if (all.reduce((n, f) => n + f.data.length, 0) > SUP_FILES_TOTAL) { setWhy("Those files are too large together. Attach fewer, or smaller screenshots."); return; }
    setFiles(all);
  };
  return <div className="sup-files">
    {files.map((f, i) => <span key={i} className="sup-file"><i className="ph ph-paperclip" aria-hidden="true"/>{f.name}
      <button type="button" className="sup-x" aria-label={"Remove " + f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))}><i className="ph ph-x" aria-hidden="true"/></button></span>)}
    {files.length < max ? <button type="button" className="sup-link" disabled={busy} onClick={() => ref.current && ref.current.click()}><i className="ph ph-paperclip" aria-hidden="true"/>Attach a screenshot</button> : null}
    <input ref={ref} type="file" accept="image/*,application/pdf" multiple hidden onChange={pick}/>
    {why ? <p className="sup-why" role="alert">{why}</p> : null}
  </div>;
}

/**
 * Props: api (the portal's support client), safeguard: { text, onClick } |
 * null, initialCase (a number from the URL), onCase(caseNo|null) so the
 * portal can keep the open case in its URL, source ("portal" | "community").
 */
function NggSupportDesk({ api, safeguard, initialCase, onCase, source }) {
  const [meta, setMeta] = React.useState(null);
  const [cases, setCases] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [mode, setMode] = React.useState(initialCase ? "case" : "list");
  const [openNo, setOpenNo] = React.useState(initialCase || 0);
  const [show, setShow] = React.useState("active");
  const load = React.useCallback(() => {
    setErr("");
    Promise.all([api.meta(), api.mine()]).then(([m, c]) => { setMeta(m); setCases(c.cases || []); }).catch(e => setErr(supErr(e)));
  }, [api]);
  React.useEffect(load, [load]);
  const goCase = no => { setOpenNo(no); setMode(no ? "case" : "list"); if (onCase) onCase(no || null); };

  if (err && !meta) return <div className="sup"><div className="sup-state" role="alert"><p>We couldn’t load support. {err}</p><button type="button" className="sup-btn" onClick={load}>Try again</button></div></div>;
  if (!meta || !cases) return <div className="sup"><div className="sup-state" role="status" aria-live="polite">Loading support…</div></div>;

  if (mode === "new") return <div className="sup"><SupNewCase api={api} meta={meta} source={source} safeguard={safeguard}
    onCancel={() => setMode("list")} onOpened={no => { load(); goCase(no); }}/></div>;
  if (mode === "case" && openNo) return <div className="sup"><SupCase api={api} caseNo={openNo} onBack={() => { load(); goCase(0); }} onFollowUp={no => { load(); goCase(no); }}/></div>;

  const active = cases.filter(c => ["new", "open", "pending"].indexOf(c.status) >= 0);
  const shown = show === "active" ? active : cases;
  const waiting = active.filter(c => c.status === "pending").length;
  return <div className="sup">
    <header className="sup-head">
      <div><h2 className="sup-h">Support</h2><p className="sup-sub">Ask the NGG team about anything that isn’t working. Each question is a case with its own number.</p></div>
      <button type="button" className="sup-btn" onClick={() => setMode("new")}><i className="ph ph-plus" aria-hidden="true"/>Open a case</button>
    </header>
    {safeguard ? <div className="sup-safe" role="note"><i className="ph ph-shield-check" aria-hidden="true"/><span>Worried about a child’s safety? Don’t open a case.</span>
      <button type="button" className="sup-link" onClick={safeguard.onClick}>{safeguard.text}</button></div> : null}
    {waiting ? <p className="sup-note" role="status"><i className="ph ph-bell-ringing" aria-hidden="true"/>{waiting === 1 ? "One case is waiting for your reply." : waiting + " cases are waiting for your reply."}</p> : null}
    <section className="sup-card" aria-labelledby="sup-mine-h">
      <div className="sup-card-head"><h3 id="sup-mine-h" className="sup-h3">My cases</h3>
        <div className="sup-seg" role="radiogroup" aria-label="Show">
          {[["active", "Open · " + active.length], ["all", "All · " + cases.length]].map(([v, l]) =>
            <button key={v} type="button" role="radio" aria-checked={show === v ? "true" : "false"} className={"sup-seg-b" + (show === v ? " is-on" : "")} onClick={() => setShow(v)}>{l}</button>)}
        </div></div>
      {!shown.length ? <p className="sup-empty">{cases.length ? "No open cases. Your earlier ones are under All." : "You haven’t opened a case. When something isn’t working, open one and it appears here."}</p>
        : <ul className="sup-list">{shown.map(c => <li key={c.caseNo}><button type="button" className="sup-row" onClick={() => goCase(c.caseNo)}>
            <span className="sup-row-main"><span className="sup-row-t">{c.subject}</span>
              <span className="sup-row-s">Case {c.caseNo} · {c.categoryL} · {c.priority} {c.priorityL}</span></span>
            <span className="sup-row-side"><span className={"sup-chip is-" + supTone(c.status)}>{c.statusL}</span><span className="sup-row-when">{supDate(c.lastActivityAt)}</span></span>
          </button></li>)}</ul>}
    </section>
    <SupAnswers meta={meta} q="" category=""/>
  </div>;
}

/** The help answers: the four that fit what is typed, or the first few. */
function SupAnswers({ meta, list, title }) {
  const items = list || (meta.articles || []).slice(0, 4);
  if (!items.length) return null;
  return <section className="sup-card" aria-label={title || "Help answers"}>
    <h3 className="sup-h3">{title || "Answers that often help"}</h3>
    <ul className="sup-answers">{items.map(a => <li key={a.id}><details className="sup-ans"><summary>{a.title}</summary><p>{a.body}</p>
      {a.link ? <a className="sup-link" href={a.link}>{a.linkL}<i className="ph ph-arrow-right" aria-hidden="true"/></a> : null}</details></li>)}</ul>
  </section>;
}

function SupNewCase({ api, meta, onCancel, onOpened, source, safeguard }) {
  const [cat, setCat] = React.useState("");
  const [sub, setSub] = React.useState("");
  const [pri, setPri] = React.useState("P3");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [about, setAbout] = React.useState((meta.subjects || []).length === 1 ? meta.subjects[0].id : "");
  const [files, setFiles] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [sugg, setSugg] = React.useState(null);
  const C = (meta.categories || []).find(c => c.id === cat);
  React.useEffect(() => {
    const q = subject.trim();
    if (q.length < 4 && !cat) { setSugg(null); return; }
    const t = setTimeout(() => api.suggest(q, cat).then(r => setSugg(r.articles || [])).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [subject, cat, api]);
  const submit = async e => {
    e.preventDefault();
    if (!cat) return setErr("Choose what the case is about.");
    if (subject.trim().length < 4) return setErr("Say in a few words what is wrong.");
    if (body.trim().length < 20) return setErr("Describe what happened in a sentence or two, so the team can act on it.");
    setBusy(true); setErr("");
    try {
      const r = await api.open({ category: cat, subcategory: sub, priority: pri, subject: subject.trim(), body: body.trim(), memberId: about, files, source: source || "portal", pageUrl: location.pathname });
      onOpened(r.caseNo);
    } catch (x) { setErr(supErr(x)); setBusy(false); }
  };
  return <form className="sup-new" onSubmit={submit} noValidate>
    <header className="sup-head"><div><h2 className="sup-h">Open a case</h2><p className="sup-sub">The more you tell us now, the fewer questions we have to ask.</p></div>
      <button type="button" className="sup-link" onClick={onCancel}>Cancel</button></header>
    {safeguard ? <div className="sup-safe" role="note"><i className="ph ph-shield-check" aria-hidden="true"/><span>Worried about a child’s safety? Don’t open a case.</span>
      <button type="button" className="sup-link" onClick={safeguard.onClick}>{safeguard.text}</button></div> : null}
    <div className="sup-grid">
      <div className="sup-form">
        <fieldset className="sup-fs"><legend className="sup-legend">What is it about?</legend>
          <div className="sup-cats">{meta.categories.map(c => <button key={c.id} type="button" aria-pressed={cat === c.id ? "true" : "false"} className={"sup-cat" + (cat === c.id ? " is-on" : "")}
            onClick={() => { setCat(c.id); setSub(""); }}><i className={"ph ph-" + c.icon} aria-hidden="true"/><span>{c.label}</span></button>)}</div>
          {C && C.subs.length ? <div className="sup-subs" role="group" aria-label="More exactly">{C.subs.map(s => <button key={s} type="button" aria-pressed={sub === s ? "true" : "false"}
            className={"sup-pill" + (sub === s ? " is-on" : "")} onClick={() => setSub(sub === s ? "" : s)}>{s}</button>)}</div> : null}
        </fieldset>
        {(meta.subjects || []).length > 1 ? <label className="sup-field"><span className="sup-label">Which child is it about?</span>
          <select className="sup-input" value={about} onChange={e => setAbout(e.target.value)}><option value="">Not about one child</option>
            {meta.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
        <fieldset className="sup-fs"><legend className="sup-legend">How much is it holding you up?</legend>
          <div className="sup-pris">{meta.priorities.map(p => <label key={p.id} className={"sup-pri" + (pri === p.id ? " is-on" : "")}>
            <input type="radio" name="sup-pri" value={p.id} checked={pri === p.id} onChange={() => setPri(p.id)}/>
            <span className="sup-pri-t">{p.id} · {p.label}</span><span className="sup-pri-s">{p.when}</span>
            <span className="sup-pri-h">We aim to reply within {p.hours < 24 ? p.hours + " hours" : p.hours === 24 ? "a day" : Math.round(p.hours / 24) + " days"}.</span></label>)}</div>
        </fieldset>
        <label className="sup-field"><span className="sup-label">In a few words</span>
          <input className="sup-input" value={subject} maxLength={meta.limits.subject} onChange={e => setSubject(e.target.value)} placeholder="My transfer isn’t showing on the account"/></label>
        <label className="sup-field"><span className="sup-label">What happened</span>
          <textarea className="sup-input sup-ta" rows={6} value={body} maxLength={meta.limits.body} onChange={e => setBody(e.target.value)}/></label>
        {C ? <div className="sup-include"><p className="sup-label">Please include</p><ul>{C.ask.map(a => <li key={a}>{a}</li>)}</ul></div> : null}
        <SupFilePicker files={files} setFiles={setFiles} max={meta.limits.files} busy={busy}/>
        {err ? <p className="sup-err" role="alert">{err}</p> : null}
        <div className="sup-actions"><button type="submit" className="sup-btn" disabled={busy}>{busy ? "Opening the case…" : "Open the case"}</button>
          <span className="sup-hint">{meta.who.email ? "Replies also go to " + meta.who.email + "." : "Replies appear here."}</span></div>
      </div>
      <aside className="sup-side" aria-live="polite">
        <SupAnswers meta={meta} list={sugg && sugg.length ? sugg : null} title={sugg && sugg.length ? "These might answer it" : "Answers that often help"}/>
      </aside>
    </div>
  </form>;
}

function SupCase({ api, caseNo, onBack, onFollowUp }) {
  const [c, setC] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [reply, setReply] = React.useState("");
  const [files, setFiles] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [rate, setRate] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [say, setSay] = React.useState("");
  const load = React.useCallback(() => { setErr(""); api.get(caseNo).then(r => setC(r.case)).catch(e => setErr(supErr(e))); }, [api, caseNo]);
  React.useEffect(load, [load]);
  if (err && !c) return <div className="sup-state" role="alert"><p>{err}</p><button type="button" className="sup-btn" onClick={load}>Try again</button> <button type="button" className="sup-link" onClick={onBack}>Back to my cases</button></div>;
  if (!c) return <div className="sup-state" role="status" aria-live="polite">Loading the case…</div>;
  const send = async e => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true); setSay("");
    try {
      const r = await api.reply(caseNo, reply.trim(), files);
      setReply(""); setFiles([]); setBusy(false);
      if (r.followUp) { onFollowUp(r.caseNo); return; }
      setSay("Sent. The case is back with the team."); load();
    } catch (x) { setBusy(false); setSay(supErr(x)); }
  };
  return <div className="sup-case">
    <button type="button" className="sup-link sup-back" onClick={onBack}><i className="ph ph-arrow-left" aria-hidden="true"/>My cases</button>
    <header className="sup-case-head">
      <h2 className="sup-h">{c.subject}</h2>
      <p className="sup-sub">Case {c.caseNo} · {c.categoryL}{c.subcategory ? " · " + c.subcategory : ""} · {c.priority} {c.priorityL}{c.followUpOf ? " · follows case " + c.followUpOf : ""}</p>
      <span className={"sup-chip is-" + supTone(c.status)}>{c.statusL}</span>
    </header>
    {c.status === "pending" ? <p className="sup-note" role="status"><i className="ph ph-bell-ringing" aria-hidden="true"/>The team is waiting for your reply.</p> : null}
    <ol className="sup-thread">{c.messages.map(m => <li key={m.id} className={"sup-msg is-" + m.by}>
      <p className="sup-msg-by">{m.by === "staff" ? m.name : m.by === "system" ? "NGG support" : "You"}<time dateTime={m.at}>{supDate(m.at)}</time></p>
      <p className="sup-msg-body">{m.body}</p>
      {m.files.length ? <p className="sup-msg-files">{m.files.map(f => <a key={f.id} className="sup-file" href={api.fileUrl(c.caseNo, f.id)} target="_blank" rel="noopener"><i className="ph ph-paperclip" aria-hidden="true"/>{f.name}</a>)}</p> : null}
    </li>)}</ol>
    {c.canReply ? <form className="sup-reply" onSubmit={send}>
      <label className="sup-field"><span className="sup-label">{c.status === "closed" ? "Reply" : "Add to the case"}</span>
        <textarea className="sup-input sup-ta" rows={4} value={reply} onChange={e => setReply(e.target.value)}/></label>
      <SupFilePicker files={files} setFiles={setFiles} max={3} busy={busy}/>
      <div className="sup-actions"><button type="submit" className="sup-btn" disabled={busy || !reply.trim()}>{busy ? "Sending…" : "Send"}</button>
        {c.canSolve ? <button type="button" className="sup-btn is-quiet" disabled={busy} onClick={() => api.solve(c.caseNo).then(load).catch(x => setSay(supErr(x)))}>It’s solved</button> : null}</div>
      {say ? <p className="sup-hint" role="status">{say}</p> : null}
    </form> : <form className="sup-reply" onSubmit={send}>
      <p className="sup-hint">This case is closed. Writing here opens a follow-up case that points back to it.</p>
      <label className="sup-field"><span className="sup-label">What’s happening now</span><textarea className="sup-input sup-ta" rows={3} value={reply} onChange={e => setReply(e.target.value)}/></label>
      <div className="sup-actions"><button type="submit" className="sup-btn" disabled={busy || !reply.trim()}>Open a follow-up</button></div>
    </form>}
    {c.canRate ? <div className="sup-rate">
      <p className="sup-label" id="sup-rate-h">How did we do?</p>
      <div className="sup-stars" role="radiogroup" aria-labelledby="sup-rate-h">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={rate === n ? "true" : "false"}
        aria-label={n + (n === 1 ? " star" : " stars")} className={"sup-star" + (rate >= n ? " is-on" : "")} onClick={() => setRate(n)}><i className={(rate >= n ? "ph-fill" : "ph") + " ph-star"} aria-hidden="true"/></button>)}</div>
      {rate ? <><label className="sup-field"><span className="sup-label">Anything to add? (optional)</span><input className="sup-input" value={note} onChange={e => setNote(e.target.value)}/></label>
        <button type="button" className="sup-btn" onClick={() => api.rate(c.caseNo, rate, note).then(() => { setSay("Thank you."); load(); }).catch(x => setSay(supErr(x)))}>Send</button></> : null}
    </div> : c.rating ? <p className="sup-hint">You rated this {c.rating} of 5.</p> : null}
  </div>;
}

/* ── The public help centre (/support) ───────────────────────────────────────
   Help notes, information and the way in — never a case form. A case is
   opened inside My NGG, its community or the Family account, where the person
   is signed in; somebody who is not a member yet uses the contact form. */
function HelpCentrePage({ setPage }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState(null);
  const load = () => { setErr(""); NGGApi.public.help().then(setD).catch(e => setErr(supErr(e))); };
  React.useEffect(load, []);
  React.useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setHits(null); return; }
    const h = setTimeout(() => NGGApi.public.help(t).then(r => setHits(r.articles || [])).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [q]);
  const phone = typeof CONTACT !== "undefined" ? CONTACT : null;
  const go = (page, href) => e => { if (setPage) { e.preventDefault(); if (href) { try { history.pushState({}, "", href); } catch (_) {} } setPage(page); } };
  const cats = d ? d.categories.filter(c => d.articles.some(a => a.cat === c.id)) : [];
  return <main className="hc">
    <section className="hc-hero">
      <div className="hc-wrap">
        <h1 className="hc-h1">How can we help?</h1>
        <form role="search" className="hc-search" onSubmit={e => e.preventDefault()}>
          <i className="ph ph-magnifying-glass" aria-hidden="true"/>
          <label className="sup-sr" htmlFor="hc-q">Search the help answers</label>
          <input id="hc-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Signing in, a payment, an absence, an ID card…"/>
        </form>
        <p className="hc-status" role="status" aria-live="polite">{hits ? (hits.length ? hits.length + (hits.length === 1 ? " answer" : " answers") + " for “" + q.trim() + "”" : "Nothing matches “" + q.trim() + "”. Try another word, or ask the team below.") : ""}</p>
      </div>
    </section>
    <div className="hc-wrap hc-body">
      {err ? <div className="sup-state" role="alert"><p>We couldn’t load the help answers. {err}</p><button type="button" className="sup-btn" onClick={load}>Try again</button></div>
        : !d ? <p className="sup-state" role="status">Loading the help answers…</p>
        : hits ? <div className="sup"><SupAnswers meta={d} list={hits} title="Answers"/></div>
        : <div className="hc-cats">{cats.map(c => <section key={c.id} className="sup-card" aria-labelledby={"hc-" + c.id}>
            <h2 id={"hc-" + c.id} className="sup-h3"><i className={"ph ph-" + c.icon} aria-hidden="true"/> {c.label}</h2>
            <ul className="sup-answers">{d.articles.filter(a => a.cat === c.id).map(a => <li key={a.id}><details className="sup-ans"><summary>{a.title}</summary><p>{a.body}</p>
              {a.link ? <a className="sup-link" href={a.link}>{a.linkL}<i className="ph ph-arrow-right" aria-hidden="true"/></a> : null}</details></li>)}</ul>
          </section>)}</div>}

      <section className="hc-ways" aria-labelledby="hc-ways-h">
        <h2 id="hc-ways-h" className="hc-h2">Still stuck? Ask the team</h2>
        <p className="sup-sub">Members and families open a case from inside their account, so we already know who you are and which child it is about. Each case has a number, a priority and a reply target, and you can follow it there.</p>
        <div className="hc-way-grid">
          <a className="hc-way" href="/dashboard/support" onClick={go("dashboard", "/dashboard/support")}><i className="ph ph-student" aria-hidden="true"/><b>Members</b><span>My NGG → Account → Support. Also in the Community, under Support.</span></a>
          <a className="hc-way" href="/family?view=account" onClick={go("family", "/family?view=account")}><i className="ph ph-house-line" aria-hidden="true"/><b>Parents and guardians</b><span>Family account → Account → Support.</span></a>
          <a className="hc-way" href="/contact" onClick={go("contact", "/contact")}><i className="ph ph-envelope-simple" aria-hidden="true"/><b>Not a member yet</b><span>Questions about joining, partnerships or press: the contact form. A person replies within two working days.</span></a>
          <a className="hc-way" href="/s-status"><i className="ph ph-pulse" aria-hidden="true"/><b>Live status</b><span>Attendance and the desks across the centres, right now.</span></a>
        </div>
      </section>
      {phone ? <section className="sup-safe hc-safe" aria-label="Safeguarding"><i className="ph ph-shield-check" aria-hidden="true"/>
        <p className="hc-safe-t">Worried about a child’s safety? Don’t wait for a case. Call <a href={"tel:" + phone.phone}>{phone.phoneDisplay}</a> or email <a href={"mailto:" + phone.email}>{phone.email}</a>. If a child is in danger now, call the police.</p></section> : null}
    </div>
  </main>;
}
