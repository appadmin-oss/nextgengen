/* ============================================================================
   Mentor Portal v14 (/mentor) — design handoff "mentor portal" (prefix mp-).

   One portal, five roles (pod · peer · instructor · lead · coord), from
   auth/me's mentorRole and the server's own reading of it. Every number,
   flag and urgency on these screens is the server's (domain/mentor-portal.php);
   this file draws them and never recomputes a rule.

   The URL is the state: /mentor/<screen>/<id>/<tab>, plus ?centre= for a
   coordinator. A refresh, a bookmark and a shared link land on the same
   place. History is the browser's, so Back works everywhere.

   Reversible writes (a weekly review, a goal's status, deleting a session)
   use Undo instead of a confirm: the write waits until the toast expires.
   Irreversible ones (a message, a family update, a concern) say so and go
   at once.
   ========================================================================== */

const MP_NAV = [
  ["week", "This week", "sun-horizon"], ["mentees", "Mentees", "users-three"], ["mentors", "Mentors", "chalkboard-teacher"],
  ["goals", "Goals", "target"], ["sessions", "Sessions", "chats-circle"], ["saturday", "Saturday", "calendar-check"],
  ["messages", "Messages", "chat-circle-text"], ["growth", "Pod growth", "chart-line-up"], ["academy", "Academy", "graduation-cap"],
  ["role", "My role", "identification-badge"],
];
const MP_PHONE_TABS = ["week", "mentees", "saturday", "messages"];
const MP_ROLE_LABEL = { pod: "Pod mentor", peer: "Peer mentor", instructor: "Instructor mentor", lead: "Lead mentor", coord: "Centre coordinator" };
const MP_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ── Small helpers ──────────────────────────────────────────────────────── */
function mpFirst(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
function mpIni(n) { const p = String(n || "?").trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
function mpDay(d) { return new Date(String(d).slice(0, 10) + "T12:00:00Z"); }
function mpDate(d, opts) { if (!d) return ""; const t = mpDay(d); return isNaN(t) ? String(d) : t.toLocaleDateString("en-GB", Object.assign({ day: "numeric", month: "long" }, opts || {})); }
function mpShort(d) { return mpDate(d, { day: "numeric", month: "short" }); }
function mpDaysAgo(d, today) { if (!d) return null; return Math.round((mpDay(today || new Date().toISOString()) - mpDay(d)) / 86400000); }
function mpAgo(d, today) { const n = mpDaysAgo(d, today); if (n === null) return "Never"; return n <= 0 ? "Today" : n === 1 ? "Yesterday" : n + " days ago"; }
function mpPlural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
function mpMonthName(ym) { return MP_MONTHS[(+String(ym).slice(5, 7) || 1) - 1]; }
function mpErr(e, fb) {
  const c = (e && (e.code || e.message)) || "";
  return ({
    not_in_caseload: "That child is not in your care.", locked: "This month’s scores are locked. Ask the NGG admin to unlock them.",
    peer_no_family: "Your lead mentor contacts families.", say_what_happened: "Say what happened in a sentence or two.",
    choose_a_mentee: "Choose a mentee first.", nobody_here: "Mark who was here on Saturday first.", answer_all_four: "Answer all four first",
    rate_all_three: "Rate effort, character and wellbeing first.", fixed_item_missing: "The pod huddle, one-to-ones and close stay on the agenda.",
    no_wish: "Write the wish first.", not_agreed: "Agree it with them first, then make it active.", goals_locked_connect: "In the Connect phase, wait until week 3.",
    no_guardian_contact: "There is no guardian phone or email on this record. Ask the centre to add one.", forbidden: "That is for lead mentors and coordinators.",
    write_a_message: "Write a message first", write_a_reply: "Write a reply first", choose_the_kind: "Choose what kind of concern.", choose_the_child: "Choose the child first.",
    bad_date: "Choose a date that has happened.", no_mentor_record: "You need a mentor record for this. Ask your coordinator.",
  })[c] || fb || "Something went wrong. Try again.";
}

/** One read with the three states the handoff asks for: loading, error with retry, data. */
function useMp(fn, deps) {
  const [st, setSt] = React.useState({ loading: true, data: null, err: null });
  const seq = React.useRef(0);
  const load = React.useCallback(() => {
    const n = ++seq.current;
    setSt(s => ({ loading: true, data: s.data, err: null }));
    let p; try { p = fn(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(d => { if (n === seq.current) setSt({ loading: false, data: d, err: null }); },
      e => { if (n === seq.current) setSt(s => ({ loading: false, data: s.data, err: e || new Error("failed") })); });
  }, deps); // eslint-disable-line
  React.useEffect(() => { load(); }, [load]);
  return Object.assign({}, st, { reload: load, set: d => setSt(s => Object.assign({}, s, { data: typeof d === "function" ? d(s.data) : d })) });
}
function MpSkel({ rows }) {
  return <div className="mp-skel" aria-busy="true" aria-label="Loading">{Array.from({ length: rows || 4 }).map((_, i) =>
    <div key={i}><i style={{ width: 36, height: 36, borderRadius: 10 }}/><span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><i style={{ width: (55 + (i * 13) % 30) + "%" }}/><i style={{ width: "30%" }}/></span></div>)}</div>;
}
function MpError({ err, retry, what }) {
  return <div className="mp-error" role="alert"><b>{"Couldn’t load " + (what || "this") + "."}</b><span className="mp-note">{mpErr(err, "Check your connection, then try again.")}</span>
    <button className="mp-btn is-sm" onClick={retry}>Try again</button></div>;
}
function MpEmpty({ title, body, action }) { return <div className="mp-empty"><b>{title}</b>{body && <p>{body}</p>}{action}</div>; }
/** Wrap a read: skeleton first time, error with Try again, then the body. */
function MpLoad({ r, rows, what, children }) {
  if (r.err && !r.data) return <MpError err={r.err} retry={r.reload} what={what}/>;
  if (!r.data) return <MpSkel rows={rows}/>;
  return children(r.data);
}
function MpPill({ p }) { return <span className={"mp-pill is-" + (p.tone || "neu")}>{p.label}</span>; }
function MpSegs({ n, of, state }) {
  return <span className={"mp-segs" + (state ? " is-" + state : "")} aria-hidden="true">{Array.from({ length: of || 5 }).map((_, i) => <i key={i} className={i < n ? "is-on" : ""}/>)}</span>;
}
function MpSwitch({ on, onChange, label, disabled }) {
  return <button type="button" className="mp-switch" role="switch" aria-checked={!!on} disabled={disabled} onClick={() => onChange(!on)}><i className="knob" aria-hidden="true"/><span>{label}</span></button>;
}
/** A 1–n single choice (radiogroup), 44px targets. */
function MpScale({ value, onChange, n, label, labels, disabled }) {
  const opts = labels || Array.from({ length: n || 5 }).map((_, i) => String(i + 1));
  const ref = React.useRef(null);
  const key = (e, i) => {
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].indexOf(e.key) < 0) return;
    e.preventDefault(); const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const j = (i + d + opts.length) % opts.length; onChange(labels ? opts[j] : j + 1);
    const b = ref.current && ref.current.querySelectorAll("button")[j]; b && b.focus();
  };
  return <div className="mp-scale" role="radiogroup" aria-label={label} ref={ref}>{opts.map((o, i) => {
    const v = labels ? o : i + 1; const on = value === v;
    return <button key={o} type="button" role="radio" aria-checked={on} tabIndex={on || (value == null && i === 0) ? 0 : -1} disabled={disabled}
      onClick={() => onChange(v)} onKeyDown={e => key(e, i)}>{o}</button>;
  })}</div>;
}

/**
 * The mentee picker every "choose a mentee" control uses: type to filter by
 * name or school, ↑/↓, Enter to pick, Esc to close, × to clear, eight
 * results at most and an honest "No match".
 */
function MpPicker({ mentees, value, onChange, label, id, placeholder }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const inp = React.useRef(null);
  const lid = (id || "mp-pick") + "-list";
  const picked = (mentees || []).find(m => m.id === value);
  const n = q.trim().toLowerCase();
  const list = (mentees || []).filter(m => !n || (m.name + " " + (m.school || "")).toLowerCase().indexOf(n) >= 0).slice(0, 8);
  const pick = m => { onChange(m ? m.id : ""); setQ(""); setOpen(false); };
  if (picked) return <div className="mp-combo"><div className="mp-combo-picked"><span className="mp-av">{picked.initials || mpIni(picked.name)}</span><b>{picked.name}</b>
    <button type="button" className="mp-icon" aria-label={"Clear " + (label || "choice")} onClick={() => { onChange(""); setTimeout(() => inp.current && inp.current.focus(), 0); }}><i className="ph ph-x"/></button></div></div>;
  const key = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { if (open && list[hi]) { e.preventDefault(); pick(list[hi]); } }
    else if (e.key === "Escape") { if (open) { e.stopPropagation(); setOpen(false); } }
  };
  return <div className="mp-combo">
    <div className="mp-combo-box"><i className="ph ph-magnifying-glass" aria-hidden="true"/>
      <input ref={inp} id={id} role="combobox" aria-expanded={open} aria-controls={lid} aria-autocomplete="list" aria-label={label}
        aria-activedescendant={open && list[hi] ? lid + "-" + hi : undefined} value={q} placeholder={placeholder || "Type a name or school"}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onKeyDown={key}
        onBlur={() => setTimeout(() => setOpen(false), 150)}/>
      {q && <button type="button" className="mp-icon" aria-label="Clear search" onClick={() => setQ("")}><i className="ph ph-x"/></button>}
    </div>
    {open && <ul className="mp-combo-list" id={lid} role="listbox">
      {list.length ? list.map((m, i) => <li key={m.id} id={lid + "-" + i} role="option" aria-selected={i === hi} onMouseDown={e => { e.preventDefault(); pick(m); }} onMouseEnter={() => setHi(i)}>
        <span className="mp-av">{m.initials || mpIni(m.name)}</span><span><b>{m.name}</b><em>{m.school || m.centre || ""}</em></span></li>)
        : <li className="is-none" role="option" aria-selected="false" aria-disabled="true">No match</li>}
    </ul>}
  </div>;
}

/* ── /mentor: who gets which page ───────────────────────────────────────── */

/**
 * The portal for anyone the server reads as an NGG mentor, a lead or a
 * coordinator. A Summer School mentor gets the Summer view of the same
 * portal (mp-summer.jsx). ?view=class keeps the class roster for anyone who
 * wants it.
 */
function MentorHome() {
  const auth = (window.useAuth || (() => null))();
  const view = typeof location !== "undefined" ? new URLSearchParams(location.search).get("view") : "";
  const centre = typeof location !== "undefined" ? new URLSearchParams(location.search).get("centre") || "" : "";
  const [probe, setProbe] = React.useState({ s: "loading" });
  React.useEffect(() => {
    if (view === "class") { setProbe({ s: "class" }); return; }
    let p; try { p = NGGApi.member.mentorWeek(centre); } catch (e) { setProbe({ s: "class" }); return; }
    Promise.resolve(p).then(r => {
      if (!(r && r.me)) { setProbe({ s: "class" }); return; }
      if (r.me.ngg === false && typeof MpSummerPortal === "function") { setProbe({ s: "summer", week: r }); return; }
      setProbe({ s: "portal", week: r });
    }).catch(() => setProbe({ s: "class" }));
  }, [view, auth && auth.isSignedIn]);
  if (probe.s === "loading") return <div className="mp-app"><div className="mp-boot"><div className="dash-spinner" aria-label="Loading"/></div></div>;
  if (probe.s === "class") return <MentorPortal/>;
  if (probe.s === "summer") return <MpSummerPortal week={probe.week}/>;
  return <MpPortal week={probe.week}/>;
}

/** Read /mentor/<screen>/<id>/<tab> into a route. */
function mpParse() {
  const seg = (location.pathname || "").replace(/^\/+|\/+$/g, "").split("/").slice(1);
  const sc = seg[0] || "week";
  const u = new URLSearchParams(location.search);
  if (sc === "mentees" && seg[1]) return { screen: "mentee", id: decodeURIComponent(seg[1]), tab: seg[2] || "overview" };
  if (sc === "academy" && seg[1]) return { screen: "module", id: decodeURIComponent(seg[1]) };
  if (sc === "saturday") return { screen: "saturday", step: seg[1] || "" };
  const known = MP_NAV.some(n => n[0] === sc) || sc === "concern";
  return { screen: known ? sc : "week", filter: u.get("filter") || "", subject: u.get("child") || "" };
}
function mpPath(r) {
  let p = "/mentor";
  if (r.screen === "mentee") p += "/mentees/" + encodeURIComponent(r.id) + (r.tab && r.tab !== "overview" ? "/" + r.tab : "");
  else if (r.screen === "module") p += "/academy/" + encodeURIComponent(r.id);
  else if (r.screen === "saturday") p += "/saturday" + (r.step ? "/" + r.step : "");
  else if (r.screen !== "week") p += "/" + r.screen;
  const q = new URLSearchParams();
  const c = new URLSearchParams(location.search).get("centre"); if (c) q.set("centre", c);
  if (r.filter) q.set("filter", r.filter);
  if (r.subject) q.set("child", r.subject);
  return p + (q.toString() ? "?" + q : "");
}

/** The width the portal actually has (not the window's). */
function mpUseWidth(ref) {
  const [w, setW] = React.useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  React.useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(es => { const x = es[0] && es[0].contentRect.width; if (x) setW(x); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return w;
}

function MpPortal({ week }) {
  const rootRef = React.useRef(null);
  const mainRef = React.useRef(null);
  const width = mpUseWidth(rootRef);
  const phone = width < 760;
  const [route, setRoute] = React.useState(mpParse);
  const [wk, setWk] = React.useState(week);
  const [more, setMore] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const pending = React.useRef([]);
  const me = (wk && wk.me) || {};
  const role = me.role || "pod";
  const lead = me.lead ? me.lead.first : "your lead";
  const centre = new URLSearchParams(location.search).get("centre") || "";

  const refreshWeek = React.useCallback(() => NGGApi.member.mentorWeek(centre).then(setWk).catch(() => {}), [centre]);
  React.useEffect(() => {
    const f = () => { setRoute(mpParse()); setMore(false); };
    window.addEventListener("popstate", f); return () => window.removeEventListener("popstate", f);
  }, []);
  const go = React.useCallback((r) => {
    const next = typeof r === "string" ? { screen: r } : r;
    try { history.pushState({ page: "mentor" }, "", mpPath(next)); } catch (_) {}
    setRoute(next); setMore(false);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, []);
  const back = () => { if (history.length > 1) history.back(); else go("week"); };

  /* Toasts. `undo` defers the write: `commit` runs when the toast expires,
     or at once if another undoable action replaces it or the page closes. */
  const flush = React.useCallback(() => { const p = pending.current; pending.current = []; p.forEach(x => { try { x(); } catch (_) {} }); }, []);
  React.useEffect(() => { window.addEventListener("pagehide", flush); return () => { window.removeEventListener("pagehide", flush); flush(); }; }, [flush]);
  const say = React.useCallback((text, opts) => {
    opts = opts || {};
    clearTimeout(say._t);
    if (opts.commit) { flush(); pending.current.push(opts.commit); }
    setToast({ text, bad: !!opts.bad, undo: opts.undo || null, id: Date.now() });
    say._t = setTimeout(() => { setToast(null); if (opts.commit) flush(); }, opts.undo ? 6500 : 4000);
  }, [flush]);
  const undo = () => { clearTimeout(say._t); pending.current = []; const u = toast && toast.undo; setToast(null); u && u(); };

  const nav = MP_NAV.filter(([id]) => id !== "mentors" || role === "lead" || role === "coord");
  const badges = (wk && wk.badges) || {};
  const badgeOf = id => ({ mentees: badges.mentees, saturday: badges.saturday, messages: badges.messages, academy: badges.academy })[id] || 0;
  const current = route.screen === "mentee" ? "mentees" : route.screen === "module" ? "academy" : route.screen;
  const titles = { mentee: "Mentee", module: "Academy", concern: "Report a concern" };
  const title = titles[route.screen] || (MP_NAV.find(n => n[0] === route.screen) || MP_NAV[0])[1];
  const shared = { me, role, lead, today: wk && wk.today, go, back, say, phone, width, centre, refreshWeek, week: wk };

  let body;
  switch (route.screen) {
    case "mentees": body = <MpMentees {...shared} filter={route.filter}/>; break;
    case "mentee": body = <MpMentee {...shared} id={route.id} tab={route.tab}/>; break;
    case "mentors": body = (role === "lead" || role === "coord") ? <MpMentors {...shared}/> : <MpWeek {...shared}/>; break;
    case "goals": body = <MpGoals {...shared} filter={route.filter}/>; break;
    case "sessions": body = <MpSessions {...shared} subject={route.subject}/>; break;
    case "saturday": body = <MpSaturday {...shared} step={route.step}/>; break;
    case "messages": body = <MpMessages {...shared}/>; break;
    case "growth": body = <MpGrowth {...shared}/>; break;
    case "academy": body = <MpAcademy {...shared}/>; break;
    case "module": body = <MpModule {...shared} id={route.id}/>; break;
    case "role": body = <MpRole {...shared}/>; break;
    case "concern": body = <MpConcern {...shared} subject={route.subject}/>; break;
    default: body = <MpWeek {...shared}/>;
  }
  const showBack = route.screen === "mentee" || route.screen === "concern" || route.screen === "module";
  const backL = route.screen === "mentee" ? "Mentees" : route.screen === "module" ? "Academy" : "Back";
  const centres = me.centres || [];
  return (
    <div className={"mp-app" + (phone ? " is-phone" : "")} ref={rootRef}>
      {!phone && <aside className="mp-side" aria-label="Mentor portal">
        <div className="mp-brand"><img src="/assets/logo.png" alt="" onError={e => { e.currentTarget.style.display = "none"; }}/><span><b>Mentor portal</b><span>{MP_ROLE_LABEL[role]} · {me.centreOnScreen || me.centre || "NGG"}</span></span></div>
        <nav className="mp-nav" aria-label="Sections">
          {nav.map(([id, l, ic]) => <button key={id} className="mp-nav-i" aria-current={current === id ? "page" : undefined} onClick={() => go(id)}>
            <i className={(current === id ? "ph-fill" : "ph") + " ph-" + ic} aria-hidden="true"/><span>{l}</span>
            {badgeOf(id) > 0 && <em className="mp-badge" aria-label={badgeOf(id) + " to do"}>{badgeOf(id)}</em>}
          </button>)}
        </nav>
        <button className="mp-concern-btn" onClick={() => go("concern")}><i className="ph ph-shield-warning" aria-hidden="true"/>Report a concern</button>
        <div className="mp-me"><span className="mp-me-av" aria-hidden="true">{mpIni(me.name)}</span><span style={{ minWidth: 0 }}><b>{me.name}</b><em>{me.memberId}</em></span></div>
      </aside>}
      <div className="mp-col">
        {phone && <header className="mp-bar">
          {showBack ? <button className="mp-icon" aria-label="Back" onClick={back}><i className="ph ph-caret-left"/></button> : null}
          <b>{title}</b>
          <button className="mp-icon" aria-label="Report a concern" onClick={() => go("concern")}><i className="ph ph-shield-warning"/></button>
        </header>}
        <main className="mp-main" ref={mainRef}>
          <div className="mp-page">
            {(role === "coord" && centres.length > 1) && <label className="mp-actions" style={{ alignSelf: "flex-start" }}><span className="mp-sub">Centre</span>
              <select className="mp-select is-sm" style={{ width: "auto" }} value={me.centreOnScreen || ""} onChange={e => { const u = new URL(location.href); u.searchParams.set("centre", e.target.value); location.href = u.toString(); }}>
                {centres.map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
            {role === "coord" && <nav className="mp-view-switch" aria-label="Mentor pages"><a href="/mentor" aria-current="page">Mentor portal</a><a href="/mentor?view=class">Class roster · Summer School and NGG</a></nav>}
            {me.screened === false && <div className="mp-infonote"><i className="ph ph-shield-check" aria-hidden="true"/><span>Your safeguarding check isn’t recorded yet, so children’s records stay closed. The Academy, My role and Report a concern are open. Your coordinator records the check.</span></div>}
            {body}
          </div>
        </main>
        {phone && <nav className="mp-tabs" aria-label="Sections">
          {MP_PHONE_TABS.map(id => { const n = MP_NAV.find(x => x[0] === id); return <button key={id} aria-current={current === id ? "page" : undefined} onClick={() => go(id)}>
            <i className={(current === id ? "ph-fill" : "ph") + " ph-" + n[2]} aria-hidden="true"/><span>{n[1]}</span>{badgeOf(id) > 0 && <span className="mp-dot" aria-label={badgeOf(id) + " to do"}/>}</button>; })}
          <button aria-expanded={more} onClick={() => setMore(true)} aria-current={MP_PHONE_TABS.indexOf(current) < 0 ? "page" : undefined}><i className="ph ph-dots-three-outline" aria-hidden="true"/><span>More</span>
            {nav.some(([id]) => MP_PHONE_TABS.indexOf(id) < 0 && badgeOf(id) > 0) && <span className="mp-dot"/>}</button>
        </nav>}
      </div>
      {more && <MpMoreSheet nav={nav.filter(([id]) => MP_PHONE_TABS.indexOf(id) < 0)} current={current} badgeOf={badgeOf} go={go} close={() => setMore(false)}/>}
      {toast && <div className={"mp-toast" + (toast.bad ? " is-bad" : "")} role="status" aria-live="polite">
        <i className={"ph-fill " + (toast.bad ? "ph-warning-circle" : "ph-check-circle")} aria-hidden="true"/><span style={{ flex: 1 }}>{toast.text}</span>
        {toast.undo && <button onClick={undo}>Undo</button>}</div>}
    </div>
  );
}
function MpMoreSheet({ nav, current, badgeOf, go, close }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const prev = document.activeElement; const b = ref.current && ref.current.querySelector("button"); b && b.focus();
    const k = e => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev && prev.focus && prev.focus(); };
  }, []);
  return <div className="mp-sheet-back" onClick={close}><div className="mp-sheet" role="dialog" aria-modal="true" aria-label="More" ref={ref} onClick={e => e.stopPropagation()}>
    <div className="mp-sheet-head"><h2>More</h2><button className="mp-icon" aria-label="Close" onClick={close}><i className="ph ph-x"/></button></div>
    {nav.map(([id, l, ic]) => <button key={id} className="mp-nav-i" aria-current={current === id ? "page" : undefined} onClick={() => go(id)}>
      <i className={"ph ph-" + ic} aria-hidden="true"/><span>{l}</span>{badgeOf(id) > 0 && <em className="mp-badge">{badgeOf(id)}</em>}</button>)}
    <button className="mp-nav-i" onClick={() => go("concern")}><i className="ph ph-shield-warning" aria-hidden="true"/><span>Report a concern</span></button>
  </div></div>;
}

/** Page header (desktop): subtitle over the H1, with a back link where there is one. */
function MpHead({ sub, title, phone, onBack, backL, right }) {
  if (phone) return sub ? <span className="mp-sub">{sub}</span> : null;
  return <div className="mp-head">
    {onBack && <button className="mp-back" onClick={onBack}><i className="ph ph-caret-left" aria-hidden="true"/>{backL || "Back"}</button>}
    <div><span className="mp-sub">{sub}</span><h1 className="mp-h1">{title}</h1></div>{right}
  </div>;
}

/** Send a mentor write through the outbox, so a Saturday with no signal loses nothing. */
function mpSend(action, body, label) {
  const ob = window.outbox || window.NGGOutbox;
  const payload = Object.assign({ action }, body || {});
  if (ob && ob.send) return ob.send("mentor.act", payload, { label: label || action });
  return NGGApi.member.mentorAct(action, body);
}

window.MentorHome = MentorHome;
