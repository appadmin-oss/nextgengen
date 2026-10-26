/* ============================================================================
   Control Room v2 — the layers (CONTROL_ROOM.md §4): the command palette, the
   drawer, the form, Ask, the account menu, and the confirm dialog used only
   for what cannot be undone. On a phone the drawer and the form are full
   screens with a Back (§5). Escape order lives in the shell.
   ========================================================================== */

/* ── Drawer (§4.2) ── */
/* One section of a drawer, the same on a desk and a phone. The phone branch used to
   draw `rows` and `text` and silently drop `list`, so anything a tab listed in a
   drawer simply did not exist on a phone. A list row may carry one action
   (`act: { l, run }`), for the one-person decision that belongs beside the name. */
function crDrawerSec(s, i, phone) {
  const val = f => f[1] == null || f[1] === "" ? "—" : f[1];
  return (
    <div key={i} className="cr-sheet-sec">
      {s.h && <h4>{s.h}</h4>}
      {s.rows && (phone
        ? <div className="cr-pbox cr-pfields">{s.rows.map((f, j) => <div key={j}><span>{f[0]}</span><b>{val(f)}</b></div>)}</div>
        : <dl className="cr-dl">{s.rows.map((f, j) => <React.Fragment key={j}><dt>{f[0]}</dt><dd>{val(f)}</dd></React.Fragment>)}</dl>)}
      {s.text && <p className="cr-prose" style={{ fontSize: phone ? 15 : 13.5 }}>{s.text}</p>}
      {s.list && <div className={phone ? "cr-pbox cr-list" : "cr-box cr-list"}>{s.list.length ? s.list.map((r, j) => (
        <div key={j} className="cr-list-row">
          <span className="cr-list-ico"><CrIcon n={r.icon || "circle"}/></span>
          <span className="cr-list-text"><b>{r.t}</b>{r.s && <span>{r.s}</span>}</span>
          {r.m && <span className="cr-list-m">{r.m}</span>}
          {r.act && <button type="button" className="cr-btn is-sm" onClick={r.act.run}>{r.act.l}</button>}
        </div>
      )) : <div className="cr-tempty" style={{ padding: 16 }}>{s.empty || "Nothing yet."}</div>}</div>}
    </div>
  );
}
function CrDrawer({ d, phone, onClose }) {
  const ref = React.useRef(null);
  useCrTrap(ref, true);
  const acts = (d.actions || []).filter(Boolean);
  const btn = (a, i, big) => (
    <button key={i} type="button" className={big ? "cr-pbig" + (a.primary ? "" : " is-ghost") + (crIsDanger(a.l) && !a.primary ? " is-danger" : "") : "cr-btn" + (a.primary ? " is-primary" : crIsDanger(a.l) ? " is-danger" : "")}
            disabled={a.disabled} title={a.why} onClick={() => a.run()}>{a.l}</button>
  );
  const sections = (d.sections || []).filter(Boolean);
  if (phone) return (
    <div ref={ref} className="cr-pfull" role="dialog" aria-modal="true" aria-label={d.title}>
      <div className="cr-pfull-head"><button type="button" className="cr-p44" aria-label="Back" onClick={onClose}><CrIcon n="caret-left"/></button><b>{d.title}</b></div>
      <div className="cr-pfull-body">
        <div className="cr-pfull-who"><CrAvatar name={d.name || d.title} photo={d.photo} className="cr-sheet-ini"/><span>{d.sub}</span></div>
        {d.stats && d.stats.length > 0 && <div className="cr-pstats">{d.stats.map((s, i) => <div key={i}><span>{s[0]}</span><b>{s[1]}</b></div>)}</div>}
        {d.fields && d.fields.length > 0 && <div className="cr-pbox cr-pfields">{d.fields.map((f, i) => <div key={i}><span>{f[0]}</span><b>{f[1] == null || f[1] === "" ? "—" : f[1]}</b></div>)}</div>}
        {sections.map((s, i) => crDrawerSec(s, i, true))}
      </div>
      {acts.length > 0 && <div className="cr-pfull-foot">{acts.map((a, i) => btn(a, i, true))}</div>}
    </div>
  );
  return (
    <div className="cr-layer cr-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={ref} className="cr-sheet" role="dialog" aria-modal="true" aria-label={d.title}>
        <div className="cr-sheet-head">
          <CrAvatar name={d.name || d.title} photo={d.photo} className="cr-sheet-ini"/>
          <div className="cr-sheet-title"><b>{d.title}</b>{d.sub && <span>{d.sub}</span>}</div>
          <button type="button" className="cr-sheet-x" aria-label="Close" onClick={onClose}><CrIcon n="x"/></button>
        </div>
        <div className="cr-sheet-body">
          {d.stats && d.stats.length > 0 && <div className="cr-stats">{d.stats.map((s, i) => <div key={i}><span>{s[0]}</span><b>{s[1]}</b></div>)}</div>}
          {d.fields && d.fields.length > 0 && <dl className="cr-dl">{d.fields.map((f, i) => <React.Fragment key={i}><dt>{f[0]}</dt><dd>{f[1] == null || f[1] === "" ? "—" : f[1]}</dd></React.Fragment>)}</dl>}
          {sections.map((s, i) => crDrawerSec(s, i, false))}
        </div>
        {acts.length > 0 && <div className="cr-sheet-foot">{acts.map((a, i) => btn(a, i))}</div>}
      </aside>
    </div>
  );
}

/* ── Form (§4.3): validate on submit, then live ── */
/* A field's options; `optsFor(values)` lets them follow another field (a
   member's courses follow their division). */
function crFieldOpts(f, vals) { return ((typeof f.optsFor === "function" ? f.optsFor(vals || {}) : f.opts) || []).map(o => Array.isArray(o) ? o : [o, o]); }
function CrFormSheet({ f, phone, onClose, toast }) {
  const init = React.useMemo(() => {
    const v = Object.assign({}, f.values || {});
    (f.fields || []).forEach(x => { if (v[x.id] === undefined) v[x.id] = x.type === "multi" ? [] : x.type === "switch" ? false : x.type === "chips" && x.req ? (crFieldOpts(x)[0] || [""])[0] : ""; });
    return v;
  }, [f]);
  const [vals, setVals] = React.useState(init);
  const [fe, setFe] = React.useState({});
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef(null);
  useCrTrap(ref, true);
  const fields = (f.fields || []).filter(x => !(x.when && !x.when(vals)));
  const set = (id, v) => {
    const next = Object.assign({}, vals, { [id]: v });
    setVals(next);
    if (tried) setFe(crValidate(fields, next)); else setFe(e => { const n = Object.assign({}, e); delete n[id]; return n; });
  };
  const submit = async e => {
    if (e) e.preventDefault();
    setTried(true);
    const errs = crValidate(fields, vals);
    setFe(errs);
    if (Object.keys(errs).length) { setTimeout(() => { const el = document.getElementById("crf-" + Object.keys(errs)[0]); if (el) el.focus(); }, 30); return; }
    setBusy(true);
    try {
      const r = await f.onSubmit(vals);
      if (r && r.fieldErrors) { setFe(r.fieldErrors); setBusy(false); return; }
      onClose();
      const msg = typeof f.done === "function" ? f.done(vals, r) : f.done;
      if (msg) toast(msg);
    } catch (err) {
      setBusy(false);
      const d = (err && err.data) || {};
      if (d.field && fields.some(x => x.id === d.field)) setFe({ [d.field]: crErr(err) });
      else toast(crErr(err, "Couldn’t save. What you typed is still here."), null, true);
    }
  };
  const field = x => {
    const id = "crf-" + x.id, err = fe[x.id], v = vals[x.id];
    const desc = err ? id + "-err" : x.help ? id + "-help" : undefined;
    let control;
    if (x.type === "chips" || x.type === "multi") {
      const multi = x.type === "multi";
      control = (
        <div className="cr-wrap" role={multi ? "group" : "radiogroup"} aria-label={x.l} id={id} tabIndex={-1}>
          {crFieldOpts(x, vals).map(o => {
            const on = multi ? (v || []).includes(o[0]) : v === o[0];
            return <button key={o[0]} type="button" className="cr-chip" role={multi ? "checkbox" : "radio"} aria-checked={on}
                           onClick={() => set(x.id, multi ? (on ? (v || []).filter(y => y !== o[0]) : (v || []).concat([o[0]])) : (on && !x.req ? "" : o[0]))}>{o[1]}</button>;
          })}
        </div>
      );
    } else if (x.type === "select") {
      control = <select id={id} className="cr-select" value={v == null ? "" : v} aria-invalid={err ? true : undefined} aria-describedby={desc} onChange={e => set(x.id, e.target.value)}>{!x.req && <option value="">{x.ph || "None"}</option>}{crFieldOpts(x, vals).map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>;
    } else if (x.type === "textarea") {
      control = <textarea id={id} rows={x.rows || 5} placeholder={x.ph} maxLength={x.max} value={v == null ? "" : v} aria-invalid={err ? true : undefined} aria-describedby={desc} onChange={e => set(x.id, e.target.value)}/>;
    } else if (x.type === "switch") {
      return (
        <div key={x.id} className="cr-ff">
          <div className="cr-ff-check" style={{ justifyContent: "space-between" }}><span className="cr-ff-l" id={id + "-l"}>{x.l}</span><CrSwitch on={!!v} onChange={b => set(x.id, b)} label={x.l}/></div>
          {x.help && <span className="cr-ff-help">{x.help}</span>}
        </div>
      );
    } else if (x.type === "file") {
      control = <input id={id} type="file" accept={x.accept} aria-invalid={err ? true : undefined} aria-describedby={desc} onChange={e => set(x.id, e.target.files && e.target.files[0] ? e.target.files[0] : "")}/>;
    } else {
      control = <input id={id} type={x.type || "text"} inputMode={x.im || (x.num ? "decimal" : x.email ? "email" : undefined)} autoComplete={x.ac || "off"} enterKeyHint={phone ? "next" : undefined}
                       placeholder={x.ph} maxLength={x.max} value={v == null ? "" : v} aria-invalid={err ? true : undefined} aria-describedby={desc} onChange={e => set(x.id, e.target.value)}/>;
    }
    return (
      <div key={x.id} className={"cr-ff" + (x.type === "file" ? " cr-ff-file" : "")}>
        {x.type === "chips" || x.type === "multi" ? <span className="cr-ff-l">{x.l}{!x.req && <span className="cr-ff-opt"> (optional)</span>}</span> : <label htmlFor={id}>{x.l}{!x.req && <span className="cr-ff-opt"> (optional)</span>}</label>}
        {control}
        {x.help && !err && <span className="cr-ff-help" id={id + "-help"}>{x.help}</span>}
        {err && <span className="cr-ff-err" id={id + "-err"}><CrIcon n="warning-circle"/>{err}</span>}
      </div>
    );
  };
  const intro = f.intro ? <p className="cr-prose" style={{ fontSize: phone ? 15 : 13.5, color: "var(--cr-muted-2)" }}>{f.intro}</p> : null;
  if (phone) return (
    <form ref={ref} className="cr-pfull is-form" role="dialog" aria-modal="true" aria-label={f.title} onSubmit={submit} noValidate>
      <div className="cr-pfull-head"><button type="button" className="cr-p44" aria-label="Close" onClick={onClose}><CrIcon n="x"/></button><b>{f.title}</b></div>
      <div className="cr-pfull-body" style={{ gap: 20 }}>{intro}{fields.map(field)}</div>
      <div className="cr-pfull-foot"><button type="submit" className="cr-pbig" disabled={busy}>{busy ? (f.busyLabel || "Saving…") : f.submit}</button></div>
    </form>
  );
  return (
    <div className="cr-layer cr-scrim is-form" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form ref={ref} className="cr-sheet" role="dialog" aria-modal="true" aria-label={f.title} onSubmit={submit} noValidate>
        <div className="cr-sheet-head is-form"><span className="cr-grow" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{f.title}</span><button type="button" className="cr-sheet-x" aria-label="Close" onClick={onClose}><CrIcon n="x"/></button></div>
        <div className="cr-sheet-body is-form">{intro}{fields.map(field)}</div>
        <div className="cr-sheet-foot is-form">
          <button type="button" className="cr-btn is-38" onClick={onClose}>Cancel</button>
          <button type="submit" className="cr-btn is-primary is-38" disabled={busy}>{busy ? (f.busyLabel || "Saving…") : f.submit}</button>
        </div>
      </form>
    </div>
  );
}

/* ── Confirm: only for the irreversible or external (README §4.7) ── */
function CrConfirm({ c, onDone }) {
  const ref = React.useRef(null);
  useCrTrap(ref, true);
  return (
    <div className="cr-confirm-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onDone(false); }}>
      <div ref={ref} className="cr-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cr-confirm-t" aria-describedby="cr-confirm-b">
        <h2 id="cr-confirm-t">{c.title}</h2>
        {c.body && <p id="cr-confirm-b">{c.body}</p>}
        <div className="cr-confirm-acts">
          <button type="button" className="cr-btn" onClick={() => onDone(false)}>{c.cancel || "Cancel"}</button>
          <button type="button" className={"cr-btn" + (c.danger ? " is-danger" : " is-primary")} data-autofocus onClick={() => onDone(true)}>{c.cta || "Continue"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Command palette (§4.1) ── */
function CrPalette({ pages, actions, phone, onClose, searchPeople, scope: initScope }) {
  const [q, setQ] = React.useState("");
  const [scope, setScope] = React.useState(initScope || "all");
  const [ci, setCi] = React.useState(0);
  const [people, setPeople] = React.useState([]);
  /* The member search is a server round trip; until it answers, "nothing
     called …" would be a claim about members nobody has looked up yet. */
  const [finding, setFinding] = React.useState(false);
  const inRef = React.useRef(null);
  const listRef = React.useRef(null);
  const box = React.useRef(null);
  useCrTrap(box, true);
  React.useEffect(() => { const t = setTimeout(() => inRef.current && inRef.current.focus(), 30); return () => clearTimeout(t); }, []);
  React.useEffect(() => {
    let live = true;
    const s = q.trim();
    const asks = !!searchPeople && (scope === "people" || (scope === "all" && s.length >= 2));
    setFinding(asks);
    const t = setTimeout(() => {
      if (!asks) { setPeople([]); return; }
      searchPeople(s).then(r => { if (live) { setPeople(r || []); setFinding(false); } }, () => { if (live) { setPeople([]); setFinding(false); } });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, scope]);
  const groups = crPaletteResults(q, scope, pages, actions, people);
  const flat = [];
  groups.forEach(g => g.items.forEach(it => flat.push(it)));
  const n = flat.length;
  const keepVisible = () => setTimeout(() => {
    const el = listRef.current && listRef.current.querySelector('[aria-selected="true"]');
    const lb = listRef.current;
    if (!el || !lb) return;
    const t = el.offsetTop, b = t + el.offsetHeight;
    if (t < lb.scrollTop) lb.scrollTop = t - 6; else if (b > lb.scrollTop + lb.clientHeight) lb.scrollTop = b - lb.clientHeight + 6;
  }, 0);
  const onKey = e => {
    if (e.key === "Tab") { e.preventDefault(); setScope(s => crNextScope(s, e.shiftKey)); setCi(0); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCi(i => Math.min(n - 1, i + 1)); keepVisible(); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCi(i => Math.max(0, i - 1)); keepVisible(); }
    if (e.key === "Enter" && flat[ci]) { e.preventDefault(); flat[ci].run(); }
  };
  let idx = 0;
  return (
    <div className={"cr-cmd-wrap" + (phone ? " is-phone" : "")} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="cr-cmd" role="dialog" aria-modal="true" aria-label="Search and jump">
        <div className="cr-cmd-in">
          <CrIcon n="magnifying-glass"/>
          <input ref={inRef} value={q} onChange={e => { setQ(e.target.value); setCi(0); }} onKeyDown={onKey} placeholder="Search pages, actions and members" aria-label="Search pages, actions and members"
                 role="combobox" aria-expanded="true" aria-controls="cr-cmd-results" aria-activedescendant={flat[ci] ? "cr-opt-" + ci : undefined}/>
          <kbd className="cr-kbd" style={{ background: "transparent" }}>Esc</kbd>
        </div>
        <div className="cr-cmd-scopes" role="tablist" aria-label="Search scope">
          {CR_SCOPES.map(s => <button key={s[0]} type="button" role="tab" aria-selected={scope === s[0]} className="cr-cmd-scope" tabIndex={-1} onClick={() => { setScope(s[0]); setCi(0); inRef.current && inRef.current.focus(); }}>{s[1]}</button>)}
        </div>
        <div ref={listRef} className="cr-cmd-list" role="listbox" id="cr-cmd-results" aria-label="Results">
          {groups.map(g => (
            <div key={g.h} role="group" aria-label={g.h}>
              <div className="cr-cmd-h" aria-hidden="true">{g.h}</div>
              {g.items.map(it => {
                const my = idx++;
                const on = my === ci;
                return (
                  <button key={my} id={"cr-opt-" + my} type="button" tabIndex={-1} role="option" aria-selected={on} className="cr-cmd-opt" onClick={() => it.run()} onMouseEnter={() => ci !== my && setCi(my)}>
                    <span className="cr-cmd-ico"><CrIcon n={it.icon || "circle"}/></span>
                    <span className="cr-cmd-l">{it.l}</span>
                    {it.path && <span className="cr-cmd-path">{it.path}</span>}
                    {on && <CrIcon n="arrow-elbow-down-left"/>}
                  </button>
                );
              })}
            </div>
          ))}
          {!n && <div className="cr-cmd-none" role="status">{finding ? (q.trim() ? "Nothing called “" + q + "” yet. Searching members…" : "Searching members…") : "Nothing called “" + q + "”. Try a member’s name, printed ID or phone."}</div>}
        </div>
        <div className="cr-cmd-foot" aria-hidden="true">
          <span><kbd>↑↓</kbd>move</span><span><kbd>↵</kbd>open</span><span><kbd>Tab</kbd>switch scope</span>
        </div>
      </div>
    </div>
  );
}

/* ── Ask (§4.4): the analyst, looking at the page on screen ── */
const CR_ASK_SUGGESTIONS = ["Summarise this page in two lines", "What changed most since last week?", "Which centre needs attention?"];
function CrAsk({ where, facts, mode, onClose }) {
  const [msgs, setMsgs] = React.useState([]);
  const [ask, setAsk] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [thread, setThread] = React.useState("");
  const ref = React.useRef(null);
  const ctl = React.useRef(null);
  useCrTrap(ref, mode !== "side");
  React.useEffect(() => () => ctl.current && ctl.current.abort(), []);
  const send = async text => {
    const t = String(text || "").trim();
    if (!t || thinking) return;
    setMsgs(m => m.concat([{ role: "user", text: t }]));
    setAsk(""); setThinking(true);
    ctl.current = window.AbortController ? new AbortController() : null;
    /* The figures on screen travel with the question, so the answer is about
       this page; the analyst scrubs and grounds it on the server (insight-chat.php). */
    const question = t + (facts ? "\n\nI am looking at " + where + ". The figures on this page:\n" + facts : "");
    let answer = "";
    try {
      const r = await NGGApi.admin.insightChatAsk({ question: question.slice(0, 600), threadId: thread || undefined }, ctl.current && ctl.current.signal);
      if (r && r.threadId) setThread(r.threadId);
      const turn = (r && r.turn) || {};
      answer = String(turn.answer || "").trim();
    } catch (e) {
      answer = e && (e.code === "question_identifies_someone" || e.message === "question_identifies_someone") ? "That question names somebody. Ask about the figures instead, without names or IDs." : "Couldn’t get an answer right now. " + crErr(e, "");
    }
    setMsgs(m => m.concat([{ role: "ai", text: answer || "No answer came back. Try asking another way." }]));
    setThinking(false);
  };
  const body = (
    <>
      <div className="cr-ask-head"><CrIcon n="sparkle"/><b>Analyst</b><span>Looking at {where}</span><button type="button" className="cr-iconbtn" style={{ width: 30, height: 30 }} aria-label="Close analyst" onClick={onClose}><CrIcon n="x"/></button></div>
      <div className="cr-ask-body" aria-live="polite">
        {!msgs.length && <>
          <p>Ask about what’s on screen. Answers use the numbers on this page only.</p>
          <div className="cr-ask-sugs">{CR_ASK_SUGGESTIONS.map(s => <button key={s} type="button" className="cr-ask-sug" onClick={() => send(s)}>{s}</button>)}</div>
        </>}
        {msgs.map((m, i) => <div key={i} className={"cr-msg " + (m.role === "user" ? "is-user" : "is-ai")}>{m.text}</div>)}
        {thinking && <span className="cr-thinking">Thinking…</span>}
      </div>
      <form className="cr-ask-form" onSubmit={e => { e.preventDefault(); send(ask); }}>
        <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Ask about this page" aria-label="Ask the analyst" data-autofocus/>
        <button type="submit" className="cr-ask-send" aria-label="Send"><CrIcon n="arrow-up"/></button>
      </form>
    </>
  );
  if (mode === "side") return <aside ref={ref} className="cr-ask" aria-label="Analyst">{body}</aside>;
  return (
    <>
      <div className="cr-ask-scrim" onMouseDown={onClose}/>
      <aside ref={ref} className="cr-ask is-overlay" role="dialog" aria-modal="true" aria-label="Analyst">{body}</aside>
    </>
  );
}

/* ── Account menu (§2.2) ── */
function CrAccountMenu({ me, ends, density, setDensity, onLock, onShortcuts, onSignOut, onClose }) {
  const ref = React.useRef(null);
  useCrTrap(ref, true);
  return (
    <div className="cr-acct-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="cr-acct" role="menu" aria-label="Account">
        <div className="cr-acct-who">
          <b>{me.name}</b>
          <span>{me.roleLabel}{me.email ? " · " + me.email : ""}</span>
          {ends && <span><CrIcon n="key"/>{ends}</span>}
        </div>
        <div className="cr-acct-density"><span>Density</span><CrSeg label="Density" full value={density} onChange={setDensity} options={CR_DENSITY_IDS.map(k => [k, k[0].toUpperCase() + k.slice(1)])}/></div>
        <button type="button" role="menuitem" className="cr-menuitem" onClick={onLock}><CrIcon n="lock-simple"/>Lock Control Room</button>
        <button type="button" role="menuitem" className="cr-menuitem" onClick={onShortcuts}><CrIcon n="keyboard"/>Keyboard shortcuts</button>
        <button type="button" role="menuitem" className="cr-menuitem is-danger" onClick={onSignOut}><CrIcon n="sign-out"/>Sign out</button>
      </div>
    </div>
  );
}
