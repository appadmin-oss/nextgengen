/* ============================================================================
   Mentor Portal v14 — the Summer School view (prefix mp-).

   A Summer School mentor runs a season, not a year: participants (never
   "students", never members), the edition's dates, a short note after each
   talk, values seen on the day, a weekly review on the same four levels the
   NGG pods use, and Report a concern. Same shell, tokens and states as the
   NGG portal; only the programme's own words and screens differ. The class
   roster's fuller tools stay one link away (?view=class).
   ========================================================================== */
const MP_VALUES_SUMMER = ["Courage", "Responsibility", "Respect", "Teamwork"];

/**
 * Minimal on purpose. A Summer School mentor has a season, not a caseload
 * system: who is here today, a word about each, a short review at the end of
 * the week, and a way to raise a concern. One column, three tabs, no sidebar,
 * everything one tap from the row it is about.
 */
function MpSummerPortal({ week }) {
  const parse = () => {
    const seg = (location.pathname || "").replace(/^\/+|\/+$/g, "").split("/").slice(1);
    return { tab: ["everyone", "reviews", "concern"].indexOf(seg[0]) >= 0 ? seg[0] : "today", open: new URLSearchParams(location.search).get("p") || "" };
  };
  const [route, setRoute] = React.useState(parse);
  const [toast, setToast] = React.useState(null);
  const centre = new URLSearchParams(location.search).get("centre") || "";
  const r = useMp(() => NGGApi.member.mentorView("summer", { centre }), [centre]);
  React.useEffect(() => { const f = () => setRoute(parse()); window.addEventListener("popstate", f); return () => window.removeEventListener("popstate", f); }, []);
  const go = (tab, open) => {
    const q = new URLSearchParams(); if (centre) q.set("centre", centre); if (open) q.set("p", open);
    try { history.pushState({ page: "mentor" }, "", "/mentor" + (tab === "today" ? "" : "/" + tab) + (q.toString() ? "?" + q : "")); } catch (_) {}
    setRoute({ tab, open: open || "" }); window.scrollTo && window.scrollTo(0, 0);
  };
  const say = (text, o) => { clearTimeout(say._t); setToast({ text, bad: !!(o && o.bad) }); say._t = setTimeout(() => setToast(null), 3500); };
  const d = r.data;
  const me = (d && d.me) || {};
  const ed = d && d.edition;
  const open = d ? d.participants.filter(p => !p.review).length : 0;
  const tabs = [["today", "Today"], ["everyone", "Everyone"], ["reviews", "Reviews" + (open ? " · " + open : "")]];
  let body;
  if (!d) body = r.err ? <MpError err={r.err} retry={r.reload} what="your participants"/> : <MpSkel rows={6}/>;
  else if (d.needsCentre) body = <MpEmpty title="Choose your centre" action={<select className="mp-select is-sm" style={{ width: "auto" }} defaultValue="" onChange={e => { const u = new URL(location.href); u.searchParams.set("centre", e.target.value); location.href = u.toString(); }}>
    <option value="" disabled>Centre</option>{(d.centres || []).map(c => <option key={c}>{c}</option>)}</select>}/>;
  else if (route.tab === "reviews") body = <MpSumReviews d={d} say={say} reload={r.reload}/>;
  else if (route.tab === "concern") body = <MpConcernForm mentees={d.participants.map(p => ({ id: p.id, name: p.name, initials: p.initials, school: p.group }))} officer={me.officer} go={() => go("today")} say={say} phone={true} back={() => go("today")}/>;
  else body = <MpSumList d={d} today={route.tab === "today"} openId={route.open} setOpen={id => go(route.tab, id)} say={say} reload={r.reload}/>;
  return <div className="mp-app mp-sum">
    <div className="mp-col">
      <header className="mp-sum-head">
        <div><b>Mentor</b><span>{["Summer School", ed && ed.name, d && d.centre].filter(Boolean).join(" · ")}</span></div>
        {d && (d.centres || []).length > 1 && <select className="mp-select is-sm" style={{ width: "auto" }} aria-label="Centre" value={d.centre} onChange={e => { const u = new URL(location.href); u.searchParams.set("centre", e.target.value); location.href = u.toString(); }}>{d.centres.map(c => <option key={c}>{c}</option>)}</select>}
        <button className="mp-icon is-concern" aria-label="Report a concern" title="Report a concern" onClick={() => go("concern")}><i className="ph ph-shield-warning"/></button>
      </header>
      {route.tab !== "concern" && <nav className="mp-sum-tabs" role="tablist" aria-label="Mentor">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={route.tab === k} onClick={() => go(k)}>{l}</button>)}</nav>}
      <main className="mp-main"><div className="mp-sum-page">{body}
        <a className="mp-sum-more" href="/mentor?view=class">More tools: the class roster<i className="ph ph-arrow-right" aria-hidden="true"/></a></div></main>
    </div>
    {toast && <div className={"mp-toast" + (toast.bad ? " is-bad" : "")} role="status" aria-live="polite"><i className={"ph-fill " + (toast.bad ? "ph-warning-circle" : "ph-check-circle")} aria-hidden="true"/><span>{toast.text}</span></div>}
  </div>;
}

/** Today: who is here (from the gate). Everyone: the whole list. Each row opens in place. */
function MpSumList({ d, today, openId, setOpen, say, reload }) {
  const [q, setQ] = React.useState("");
  const n = q.trim().toLowerCase();
  const base = today ? d.participants.filter(p => p.hereToday) : d.participants;
  const list = base.filter(p => !n || (p.name + " " + p.group).toLowerCase().indexOf(n) >= 0);
  return <>
    {!today && <div className="mp-search mp-sum-search" role="search"><i className="ph ph-magnifying-glass" aria-hidden="true"/><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a participant" aria-label="Find a participant"/></div>}
    {today && <p className="mp-sum-lede">{base.length ? mpPlural(base.length, "participant") + " checked in at the gate today. Tap a value when you see it." : "Nobody has checked in at the gate yet today."}</p>}
    <ul className="mp-sum-list">{list.map(p => <MpSumRow key={p.id} p={p} d={d} open={openId === p.id} toggle={() => setOpen(openId === p.id ? "" : p.id)} say={say} reload={reload}/>)}</ul>
    {!list.length && (today ? null : <MpEmpty title="Nobody matches that."/>)}
  </>;
}
function MpSumRow({ p, d, open, toggle, say, reload }) {
  const [seen, setSeen] = React.useState({});
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const values = d.categories && d.categories.length ? d.categories.slice(0, 4) : MP_VALUES_SUMMER;
  const star = c => { setSeen(x => Object.assign({}, x, { [c]: true })); NGGApi.member.starGive(p.id, 1, c, "").then(() => say(c + " · " + p.first), e => { setSeen(x => Object.assign({}, x, { [c]: false })); say(mpErr(e), { bad: true }); }); };
  const save = () => {
    if (note.trim().length <= 3) return;
    setBusy(true);
    NGGApi.member.mentorMeeting(p.id, { metOn: d.today, kind: "one-to-one", discussed: note, agreed: "", concern: false }).then(() => { setNote(""); say("Note saved for " + p.first); reload(); }, e => say(mpErr(e), { bad: true })).finally(() => setBusy(false));
  };
  return <li className={"mp-sum-row" + (open ? " is-open" : "")}>
    <button className="mp-sum-who" aria-expanded={open} onClick={toggle}>
      <span className="mp-av" aria-hidden="true">{p.initials}</span>
      <span><b>{p.name}</b><em>{[p.group, p.lastNoteAt ? "note " + mpAgo(p.lastNoteAt, d.today).toLowerCase() : "no note yet"].filter(Boolean).join(" · ")}</em></span>
      {p.review ? <i className="ph-fill ph-check-circle mp-sum-ok" aria-label="Reviewed this week"/> : null}
      <i className={"ph ph-caret-" + (open ? "up" : "down")} aria-hidden="true"/>
    </button>
    <div className="mp-sum-vals" role="group" aria-label={"Seen in " + p.first + " today"}>{values.map(v => <button key={v} className="mp-val" aria-pressed={!!seen[v]} onClick={() => !seen[v] && star(v)}>{v}</button>)}</div>
    {open && <div className="mp-sum-note">
      <textarea className="mp-text" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={"A word about " + p.first + " today"} aria-label={"Note about " + p.name}/>
      <div className="mp-actions"><button className="mp-btn is-sm is-ink" disabled={busy || note.trim().length <= 3} onClick={save}>Save note</button>
        <span className="mp-help">Worried about safety? Use the shield at the top, not a note.</span></div>
    </div>}
  </li>;
}

function MpSumReviews({ d, say, reload }) {
  const [done, setDone] = React.useState({});
  const todo = d.participants;
  const n = todo.filter(p => p.review || done[p.id]).length;
  return <>
    <div className="mp-sum-lede"><b>{n + " of " + todo.length + " reviewed this week"}</b><div className="mp-prog" style={{ marginTop: 8 }}><i style={{ width: (todo.length ? n * 100 / todo.length : 0) + "%" }}/></div></div>
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

