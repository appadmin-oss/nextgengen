/* ============================================================================
   Mentor Portal v14 — the Summer School view (prefix mp-).

   A Summer School mentor runs a season, not a year: participants (never
   "students", never members), the edition's dates, a short note after each
   talk, values seen on the day, a weekly review on the same four levels the
   NGG pods use, and Report a concern. Same shell, tokens and states as the
   NGG portal; only the programme's own words and screens differ. The class
   roster's fuller tools stay one link away (?view=class).
   ========================================================================== */
const MP_SUMMER_NAV = [["week", "This week", "sun-horizon"], ["participants", "Participants", "users-three"], ["reviews", "Weekly reviews", "clipboard-text"]];

function MpSummerPortal({ week }) {
  const rootRef = React.useRef(null);
  const width = mpUseWidth(rootRef);
  const phone = width < 760;
  const parse = () => {
    const seg = (location.pathname || "").replace(/^\/+|\/+$/g, "").split("/").slice(1);
    if (seg[0] === "participants" && seg[1]) return { screen: "participant", id: decodeURIComponent(seg[1]) };
    return { screen: ["participants", "reviews", "concern"].indexOf(seg[0]) >= 0 ? seg[0] : "week", filter: new URLSearchParams(location.search).get("filter") || "" };
  };
  const [route, setRoute] = React.useState(parse);
  const [toast, setToast] = React.useState(null);
  const centre = new URLSearchParams(location.search).get("centre") || "";
  const r = useMp(() => NGGApi.member.mentorView("summer", { centre }), [centre]);
  React.useEffect(() => { const f = () => setRoute(parse()); window.addEventListener("popstate", f); return () => window.removeEventListener("popstate", f); }, []);
  const go = next => {
    next = typeof next === "string" ? { screen: next } : next;
    const p = "/mentor" + (next.screen === "participant" ? "/participants/" + encodeURIComponent(next.id) : next.screen === "week" ? "" : "/" + next.screen)
      + (centre || next.filter ? "?" + new URLSearchParams(Object.assign(centre ? { centre } : {}, next.filter ? { filter: next.filter } : {})) : "");
    try { history.pushState({ page: "mentor" }, "", p); } catch (_) {}
    setRoute(next);
  };
  const say = (text, o) => { clearTimeout(say._t); setToast({ text, bad: !!(o && o.bad) }); say._t = setTimeout(() => setToast(null), 4000); };
  const d = r.data;
  const me = (d && d.me) || {};
  const sh = { go, say, phone, d, reload: r.reload, back: () => history.length > 1 ? history.back() : go("week") };
  let body;
  if (!d) body = r.err ? <section className="mp-card"><MpError err={r.err} retry={r.reload} what="your participants"/></section> : <section className="mp-card"><MpSkel rows={6}/></section>;
  else if (route.screen === "participants") body = <MpSumList {...sh} filter={route.filter}/>;
  else if (route.screen === "participant") body = <MpSumOne {...sh} id={route.id}/>;
  else if (route.screen === "reviews") body = <MpSumReviews {...sh}/>;
  else if (route.screen === "concern") body = <MpSumConcern {...sh}/>;
  else body = <MpSumWeek {...sh}/>;
  const cur = route.screen === "participant" ? "participants" : route.screen;
  const open = d ? d.participants.filter(p => !p.review).length : 0;
  return <div className={"mp-app" + (phone ? " is-phone" : "")} ref={rootRef}>
    {!phone && <aside className="mp-side" aria-label="Mentor portal">
      <div className="mp-brand"><img src="/assets/logo.png" alt=""/><span><b>Mentor portal</b><span>{"Summer School · " + (d && d.centre || me.centre || "")}</span></span></div>
      <nav className="mp-nav" aria-label="Sections">{MP_SUMMER_NAV.map(([id, l, ic]) => <button key={id} className="mp-nav-i" aria-current={cur === id ? "page" : undefined} onClick={() => go(id)}>
        <i className={(cur === id ? "ph-fill" : "ph") + " ph-" + ic} aria-hidden="true"/><span>{l}</span>{id === "reviews" && open > 0 && <em className="mp-badge">{open}</em>}</button>)}
        <a className="mp-nav-i" href="/mentor?view=class" style={{ textDecoration: "none", color: "inherit" }}><i className="ph ph-list-checks" aria-hidden="true"/><span>Class tools</span></a></nav>
      <button className="mp-concern-btn" onClick={() => go("concern")}><i className="ph ph-shield-warning" aria-hidden="true"/>Report a concern</button>
      <div className="mp-me"><span className="mp-me-av">{mpIni(me.name)}</span><span><b>{me.name}</b><em>{me.memberId}</em></span></div>
    </aside>}
    <div className="mp-col">
      {phone && <header className="mp-bar">{route.screen === "participant" || route.screen === "concern" ? <button className="mp-icon" aria-label="Back" onClick={sh.back}><i className="ph ph-caret-left"/></button> : null}
        <b>{route.screen === "concern" ? "Report a concern" : (MP_SUMMER_NAV.find(n => n[0] === cur) || MP_SUMMER_NAV[0])[1]}</b>
        <button className="mp-icon" aria-label="Report a concern" onClick={() => go("concern")}><i className="ph ph-shield-warning"/></button></header>}
      <main className="mp-main"><div className="mp-page">
        {d && d.centres && d.centres.length > 1 && <label className="mp-actions" style={{ alignSelf: "flex-start" }}><span className="mp-sub">Centre</span>
          <select className="mp-select is-sm" style={{ width: "auto" }} value={d.centre} onChange={e => { const u = new URL(location.href); u.searchParams.set("centre", e.target.value); location.href = u.toString(); }}>
            {d.centres.map(c => <option key={c}>{c}</option>)}</select></label>}
        {body}</div></main>
      {phone && <nav className="mp-tabs" aria-label="Sections">{MP_SUMMER_NAV.map(([id, l, ic]) => <button key={id} aria-current={cur === id ? "page" : undefined} onClick={() => go(id)}>
        <i className={(cur === id ? "ph-fill" : "ph") + " ph-" + ic} aria-hidden="true"/><span>{l}</span></button>)}
        <a href="/mentor?view=class" className="mp-tabs-a" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: "var(--mt-subtle)", textDecoration: "none" }}><i className="ph ph-list-checks" style={{ fontSize: 22 }} aria-hidden="true"/>Class tools</a></nav>}
    </div>
    {toast && <div className={"mp-toast" + (toast.bad ? " is-bad" : "")} role="status" aria-live="polite"><i className={"ph-fill " + (toast.bad ? "ph-warning-circle" : "ph-check-circle")} aria-hidden="true"/><span>{toast.text}</span></div>}
  </div>;
}

function MpSumWeek({ d, go, phone }) {
  const ed = d.edition;
  const sub = (ed ? ed.name + (ed.startDate && ed.endDate ? " · " + mpShort(ed.startDate) + " to " + mpShort(ed.endDate) : "") + " · " : "") + mpPlural(d.participants.length, "participant");
  return <>
    <MpHead sub={sub} title="This week" phone={phone}/>
    <section className="mp-card is-clip"><div className="mp-card-head"><h2>Due now</h2><span>Most urgent first</span></div>
      {d.needsCentre ? <MpEmpty title="Choose a centre to see its participants."/> : !d.due.length ? <div className="mp-allclear"><i className="ph ph-check-circle" aria-hidden="true"/><span>Nothing is due. Every participant has a note and a review this week.</span></div>
        : d.due.map(x => <button key={x.key} className="mp-row" onClick={() => go({ screen: x.go.screen, filter: x.go.filter || "" })}><span className={"mp-tile-ic mp-tone-" + x.tone}><i className={"ph ph-" + x.icon} aria-hidden="true"/></span>
          <span className="mp-row-t"><b>{x.title}</b><span>{x.sub}</span></span><i className="ph ph-caret-right" aria-hidden="true"/></button>)}</section>
    <section className="mp-card is-clip"><div className="mp-card-head"><h2>Here today</h2><span>From the gate</span></div>
      {d.participants.filter(p => p.hereToday).length ? d.participants.filter(p => p.hereToday).map(p => <button key={p.id} className="mp-row" style={{ minHeight: 56 }} onClick={() => go({ screen: "participant", id: p.id })}>
        <span className="mp-av">{p.initials}</span><span className="mp-row-t"><b>{p.name}</b><span>{p.group}</span></span><i className="ph ph-caret-right" aria-hidden="true"/></button>)
        : <MpEmpty title="Nobody has checked in at the gate today."/>}</section>
  </>;
}

function MpSumList({ d, go, phone, filter }) {
  const [q, setQ] = React.useState("");
  const [f, setF] = React.useState(filter === "quiet" ? "quiet" : "all");
  const n = q.trim().toLowerCase();
  const list = d.participants.filter(p => (f === "all" || (f === "quiet" ? p.notSeen : f === "review" ? !p.review : p.hereToday)) && (!n || (p.name + " " + p.group).toLowerCase().indexOf(n) >= 0));
  return <>
    <MpHead sub={mpPlural(d.participants.length, "participant") + (d.scope === "mine" ? " paired with you" : " at " + d.centre)} title="Participants" phone={phone}/>
    <div className="mp-chips" role="group" aria-label="Filter">{[["all", "All"], ["quiet", "No note this week"], ["review", "Review to do"], ["here", "Here today"]].map(([k, l]) =>
      <button key={k} className="mp-chip" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
    <section className="mp-card is-clip"><div className="mp-listbar"><div className="mp-search" role="search"><i className="ph ph-magnifying-glass" aria-hidden="true"/><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or group" aria-label="Search participants"/></div>
      <span style={{ flex: 1 }}/><span className="mp-meta" role="status">{mpPlural(list.length, "participant")}</span></div>
      {list.length ? list.map(p => <button key={p.id} className="mp-row" style={{ minHeight: 60 }} onClick={() => go({ screen: "participant", id: p.id })}>
        <span className="mp-av">{p.initials}</span><span className="mp-row-t"><b>{p.name}</b><span>{[p.group, p.lastNoteAt ? "last note " + mpAgo(p.lastNoteAt, d.today).toLowerCase() : "no note yet"].filter(Boolean).join(" · ")}</span></span>
        <span className="mp-flags">{p.notSeen && <MpPill p={{ label: "No note this week", tone: "warn" }}/>}{!p.review && <MpPill p={{ label: "Review to do", tone: "neu" }}/>}</span></button>)
        : <MpEmpty title="Nobody matches that." action={<button className="mp-btn" onClick={() => { setQ(""); setF("all"); }}>Show everyone</button>}/>}</section>
  </>;
}

function MpSumOne({ d, id, go, say, phone, reload, back }) {
  const r = useMp(() => NGGApi.member.mentorChild(id), [id]);
  const [what, setWhat] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const p = d.participants.find(x => x.id === id) || {};
  const cats = d.categories && d.categories.length ? d.categories : MP_VALUES_SUMMER;
  const note = () => {
    if (what.trim().length <= 3) { say("Say what you talked about.", { bad: true }); return; }
    setBusy(true);
    NGGApi.member.mentorMeeting(id, { metOn: d.today, kind: "one-to-one", discussed: what, agreed: "", concern: false }).then(() => { setWhat(""); say("Note saved."); r.reload(); reload(); },
      e => say(mpErr(e), { bad: true })).finally(() => setBusy(false));
  };
  const star = c => NGGApi.member.starGive(id, 1, c, "").then(() => { say(c + " noted for " + mpFirst(p.name) + "."); r.reload(); }, e => say(mpErr(e), { bad: true }));
  return <>
    <MpHead sub={[p.group, d.centre].filter(Boolean).join(" · ")} title={p.name || "Participant"} phone={phone} onBack={back} backL="Participants"/>
    <MpLoad r={r} what="this participant" rows={5}>{c => <>
      <section className="mp-card is-pad"><div className="mp-facts">
        <div className="mp-fact"><span>Last note</span><b className={p.notSeen ? "is-warn" : ""}>{p.lastNoteAt ? mpAgo(p.lastNoteAt, d.today) : "Never"}</b></div>
        <div className="mp-fact"><span>Days at the centre</span><b>{(c.attendance && c.attendance.total) || 0}</b></div>
        <div className="mp-fact"><span>Stars</span><b>{(c.stars && c.stars.total) || 0}</b></div>
        <div className="mp-fact"><span>This week’s review</span><b className={p.review ? "is-ok" : ""}>{p.review ? "Done" : "To do"}</b></div></div>
        <span className="mp-lab">Seen today</span>
        <div className="mp-chips is-wrap">{cats.slice(0, 6).map(k => <button key={k} className="mp-val" onClick={() => star(k)}>{k}</button>)}</div>
        <div className="mp-actions"><button className="mp-btn is-sm" onClick={() => go("reviews")}>Weekly review</button><button className="mp-btn is-sm" onClick={() => go("concern")}><i className="ph ph-shield-warning" aria-hidden="true"/>Report a concern</button></div>
      </section>
      <section className="mp-card is-pad"><label className="mp-field"><span className="mp-lab">Add a note</span><textarea className="mp-text" rows={3} value={what} onChange={e => setWhat(e.target.value)} placeholder="What you talked about, and what they said"/></label>
        <div><button className="mp-btn is-ink" onClick={note} disabled={busy}>Save note</button></div><span className="mp-help">Worried about safety? Use Report a concern, not a note.</span></section>
      <section className="mp-card is-clip"><div className="mp-card-head"><h2>Notes</h2></div>
        {(c.meetings || []).filter(m => !+m.concern).length ? c.meetings.filter(m => !+m.concern).map(m => <div key={m.id} className="mp-tl"><i className="ph ph-chats-circle" aria-hidden="true"/><div><p>{m.discussed}</p><span>{mpShort(m.metOn) + " · " + (m.mentorName || "")}</span></div></div>)
          : <MpEmpty title="No notes yet."/>}</section>
    </>}</MpLoad>
  </>;
}
const MP_VALUES_SUMMER = ["Courage", "Responsibility", "Respect", "Teamwork"];

function MpSumReviews({ d, phone, say, reload }) {
  const [done, setDone] = React.useState({});
  const todo = d.participants;
  const n = todo.filter(p => p.review || done[p.id]).length;
  return <>
    <MpHead sub={"Week " + d.period + " · " + n + " of " + todo.length + " reviewed"} title="Weekly reviews" phone={phone}/>
    <section className="mp-card is-pad"><div className="mp-prog"><i style={{ width: (todo.length ? n * 100 / todo.length : 0) + "%" }}/></div></section>
    {!todo.length ? <section className="mp-card"><MpEmpty title="No participants yet."/></section> : todo.map(p => <MpSumReviewCard key={p.id} p={p} levels={d.levels} say={say} done={!!(p.review || done[p.id])} onDone={() => { setDone(x => Object.assign({}, x, { [p.id]: true })); }}/>)}
  </>;
}
function MpSumReviewCard({ p, levels, say, done, onDone }) {
  const h = p.review || {};
  const [v, setV] = React.useState({ effort: h.effort || null, character: h.characterLevel || null, wellbeing: h.wellbeing || null, line: h.line || "" });
  const save = () => {
    if (!v.effort || !v.character || !v.wellbeing) { say("Rate effort, character and wellbeing first.", { bad: true }); return; }
    mpSend("summerReview", { subjectId: p.id, effort: v.effort, character: v.character, wellbeing: v.wellbeing, line: v.line }, "Weekly review")
      .then(() => { onDone(); say("Review saved for " + p.first + "."); }, e => e && e.queued ? (onDone(), say("Saved on this device. It sends itself when you’re back online.")) : say(mpErr(e), { bad: true }));
  };
  return <section className="mp-card mp-rev" aria-label={"Review for " + p.name}>
    <div className="mp-actions"><b style={{ flex: 1, fontSize: 15 }}>{p.name}</b>{done && <MpPill p={{ label: "Reviewed", tone: "ok" }}/>}</div>
    {[["effort", "Effort"], ["character", "Character"], ["wellbeing", "Wellbeing"]].map(([k, l]) => <div key={k} className="mp-rev-scale"><span className="mp-lab">{l}</span>
      <MpScale value={v[k]} labels={levels} label={l + " for " + p.first} onChange={x => setV(Object.assign({}, v, { [k]: x }))}/></div>)}
    <label className="mp-field"><span className="mp-lab">One thing you saw this week</span><input className="mp-input" value={v.line} onChange={e => setV(Object.assign({}, v, { line: e.target.value }))}/></label>
    <div><button className="mp-btn is-ink" onClick={save}>{done ? "Save changes" : "Save review"}</button></div></section>;
}

function MpSumConcern({ d, go, say, phone, back }) {
  const ms = d.participants.map(p => ({ id: p.id, name: p.name, initials: p.initials, school: p.group }));
  return <MpConcernForm mentees={ms} officer={d.me.officer} go={go} say={say} phone={phone} back={back} child="participant"/>;
}
