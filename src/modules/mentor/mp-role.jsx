/* ============================================================================
   Mentor Portal v14 — Saturday (Before · During · After), My role, Mentors
   (lead / coord), Academy and the module player, Report a concern.
   ========================================================================== */

/* ── Saturday ───────────────────────────────────────────────────────────── */
function MpSaturday(props) {
  const { phone, centre, say, go, refreshWeek, lead } = props;
  const r = useMp(() => NGGApi.member.mentorSaturday("", centre), [centre]);
  const [agenda, setAgenda] = React.useState(null);
  const [aim, setAim] = React.useState("All");
  const [reg, setReg] = React.useState({});
  const [doneIds, setDoneIds] = React.useState({});
  const d = r.data;
  React.useEffect(() => { if (d) { setAgenda(d.agenda); setReg(d.register || {}); const x = {}; Object.keys(d.reviews || {}).forEach(k => x[k] = true); setDoneIds(x); } }, [d]);
  const here = d ? d.mentees.filter(m => reg[m.id] && reg[m.id].here) : [];
  const reviewed = here.filter(m => doneIds[m.id]).length;
  const step = ["before", "during", "after"].indexOf(props.step) >= 0 ? props.step : (d && d.date === props.today ? "during" : "before");
  const setStep = s => go({ screen: "saturday", step: s });
  const sub = d ? "Session at 9:30am · " + mpPlural(d.mentees.length, "mentee") + " · " + mpDate(d.date, { weekday: "long", day: "numeric", month: "long" }) : "";
  const savePlan = (a, share) => NGGApi.member.mentorAct("saturdayPlan", { date: d.date, agenda: a, oneToOnes: d.oneToOnes, share: !!share })
    .then(() => share && say("Shared with " + lead + "."), e => say(mpErr(e), { bad: true }));
  const setA = a => { setAgenda(a); savePlan(a); };
  const total = (agenda || []).reduce((s, x) => s + (+x.minutes || 0), 0);
  const tap = (m, patch) => {
    const row = Object.assign({ here: false, observed: [] }, reg[m.id], patch);
    if (!row.here) row.observed = [];
    setReg(x => Object.assign({}, x, { [m.id]: row }));
    mpSend("register", { date: d.date, rows: [{ subjectId: m.id, here: row.here, observed: row.observed }] }, "Saturday register").catch(e => { if (!(e && e.queued)) say(mpErr(e), { bad: true }); });
  };
  const close = () => mpSend("register", { date: d.date, rows: [], close: true }, "Close register").then(() => { say("Register closed. Attendance is on the centre record."); refreshWeek(); setStep("after"); },
    e => e && e.queued ? say("Saved on this device. It sends itself when you’re back online.") : say(mpErr(e), { bad: true }));
  let at = 9 * 60 + 30;
  const tm = mins => { const h = Math.floor(mins / 60), mm = mins % 60; return ((h % 12) || 12) + ":" + String(mm).padStart(2, "0"); };
  return <>
    <MpHead sub={sub} title="Saturday" phone={phone}/>
    <MpLoad r={r} what="Saturday" rows={5}>{() => <>
      <div className="mp-seg is-tall" role="tablist" aria-label="Saturday">{[["before", "Before", "Plan the session"], ["during", "During", here.length + " here"], ["after", "After", reviewed + " of " + here.length + " reviewed"]].map(([k, l, s]) =>
        <button key={k} role="tab" aria-selected={step === k} onClick={() => setStep(k)}>{l}<em>{s}</em></button>)}</div>

      {step === "before" && agenda && <>
        <section className="mp-card is-clip" aria-labelledby="mp-ag-h">
          <div className="mp-card-head"><h2 id="mp-ag-h">Agenda · 9:30am</h2><span className={total > 90 ? "mp-total-bad" : ""}>{total + " of 90 min"}</span></div>
          {agenda.map((it, i) => { const start = at; at += +it.minutes || 0; return <div key={i} className="mp-ag"><span>{tm(start)}</span><div><b>{it.title}</b><em>{it.sub}</em></div>
            <span className="mp-num mp-meta">{it.minutes + " min"}</span>
            <span className="mp-actions" style={{ flexWrap: "nowrap", gap: 2 }}>
              <button className="mp-icon" aria-label={"Move " + it.title + " up"} disabled={i === 0} onClick={() => { const a = agenda.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setA(a); }}><i className="ph ph-arrow-up"/></button>
              <button className="mp-icon" aria-label={"Remove " + it.title} disabled={it.fixed} title={it.fixed ? "This stays on every Saturday" : undefined} onClick={() => setA(agenda.filter((_, j) => j !== i))}><i className="ph ph-x"/></button></span></div>; })}
          <div className="mp-card is-pad" style={{ margin: 12, background: "var(--mt-bg)", border: 0 }}>
            <b>{"One-to-ones · " + d.oneToOnes.length + ", 15 minutes each"}</b>
            <span>{d.oneToOnes.map(id => { const m = d.mentees.find(x => x.id === id); return m ? m.name + " (" + (m.contactDays == null ? "never" : m.contactDays + " days") + ")" : null; }).filter(Boolean).join(" · ") || "Nobody picked yet."}</span>
            <span className="mp-help">Longest since their last one-to-one first.</span></div>
          <div style={{ padding: "0 16px 16px" }}><button className="mp-btn is-sm" onClick={() => savePlan(agenda, true)}>{"Share with " + lead}</button></div>
        </section>
        <section className="mp-card is-clip" aria-labelledby="mp-act-h"><div className="mp-card-head"><h2 id="mp-act-h">Activities</h2></div>
          <div className="mp-chips is-wrap" role="radiogroup" aria-label="Aim" style={{ padding: "0 16px 8px" }}>{["All", "Courage", "Reflection", "Teamwork", "Leadership", "Character"].map(a => <button key={a} className="mp-chip" role="radio" aria-checked={aim === a} onClick={() => setAim(a)}>{a}</button>)}</div>
          {d.activities.filter(a => aim === "All" || a.aim === aim).map(a => <div key={a.title} className="mp-row"><span className="mp-row-t"><b>{a.title}</b><span>{a.aim + " · " + a.minutes + " min · " + a.sub}</span></span>
            <button className="mp-btn is-sm" onClick={() => { const x = agenda.slice(); x.splice(Math.max(0, x.length - 2), 0, { title: a.title, sub: a.sub, minutes: a.minutes, fixed: false }); setA(x); say(a.title + " added to the agenda."); }}>Add</button></div>)}
        </section></>}

      {step === "during" && <section className="mp-card is-clip" aria-label="Register">
        <div className="mp-card-head"><h2>Register</h2><span>{here.length + " of " + d.mentees.length + " here"}</span></div>
        {!d.mentees.length ? <MpEmpty title="No mentees yet."/> : d.mentees.map(m => { const row = reg[m.id] || {}; const on = !!row.here; const obs = row.observed || [];
          return <div key={m.id} className="mp-reg">
            <button className="mp-here" role="switch" aria-checked={on} aria-label={m.name + (on ? " is here" : " is away")} onClick={() => tap(m, { here: !on })}>{on ? "Here" : "Away"}</button>
            <span style={{ fontWeight: 600 }}>{m.name}{row.gate && <span className="mp-meta">{" · checked in at the gate"}</span>}</span>
            <span className="mp-vals">{d.values.map(v => <button key={v} className="mp-val" aria-pressed={obs.indexOf(v) >= 0} disabled={!on} aria-label={v + " seen in " + m.first}
              onClick={() => tap(m, { observed: obs.indexOf(v) >= 0 ? obs.filter(x => x !== v) : obs.concat(v) })}>{v}</button>)}</span></div>; })}
        <div className="mp-sc-foot"><p>Tap a value when you see it happen. You’ll add the detail in the weekly review.</p><button className="mp-btn is-ink" onClick={close} disabled={d.registerClosedAt !== ""}>{d.registerClosedAt ? "Register closed" : "Close register"}</button></div>
      </section>}

      {step === "after" && <>
        <section className="mp-card is-pad"><span className="mp-actions"><b>{reviewed + " of " + here.length + " reviews done · due Monday"}</b></span>
          <div className="mp-prog"><i style={{ width: (here.length ? reviewed * 100 / here.length : 0) + "%" }}/></div></section>
        {!here.length ? <section className="mp-card"><MpEmpty title="Nobody is marked here yet." body="Mark the register under During, then review each child here." action={<button className="mp-btn" onClick={() => setStep("during")}>Open the register</button>}/></section>
          : here.map(m => <MpReviewCard key={m.id} m={m} d={d} obs={(reg[m.id] || {}).observed || []} done={!!doneIds[m.id]} say={say}
            onDone={v => { setDoneIds(x => Object.assign({}, x, { [m.id]: v })); refreshWeek(); }}/>)}
      </>}
    </>}</MpLoad>
  </>;
}
function MpReviewCard({ m, d, obs, done, say, onDone }) {
  const have = (d.reviews || {})[m.id] || {};
  const [v, setV] = React.useState({ effort: have.effort || null, character: have.characterLevel || null, wellbeing: have.wellbeing || null, line: have.line || "" });
  const save = () => {
    if (!v.effort || !v.character || !v.wellbeing) { say("Rate effort, character and wellbeing first.", { bad: true }); return; }
    onDone(true);
    say("Review saved for " + m.first + ".", { undo: () => onDone(false),
      commit: () => mpSend("weekReview", { subjectId: m.id, date: d.date, effort: v.effort, character: v.character, wellbeing: v.wellbeing, line: v.line }, "Weekly review")
        .catch(e => { if (!(e && e.queued)) { onDone(false); say(mpErr(e), { bad: true }); } }) });
  };
  return <section className="mp-card mp-rev" aria-label={"Review for " + m.name}>
    <div className="mp-actions"><b style={{ fontSize: 15, flex: 1 }}>{m.name}</b>{done && <MpPill p={{ label: "Reviewed", tone: "ok" }}/>}</div>
    <span className="mp-meta">{obs.length ? "Seen today: " + obs.join(", ") : "No values tapped today"}</span>
    {[["effort", "Effort"], ["character", "Character"], ["wellbeing", "Wellbeing"]].map(([k, l]) => <div key={k} className="mp-rev-scale"><span className="mp-lab">{l}</span>
      <MpScale value={v[k]} labels={d.levels} label={l + " for " + m.first} onChange={x => setV(Object.assign({}, v, { [k]: x }))}/></div>)}
    <label className="mp-field"><span className="mp-lab">One thing you saw this week</span><input className="mp-input" value={v.line} onChange={e => setV(Object.assign({}, v, { line: e.target.value }))}/></label>
    <div><button className="mp-btn is-ink" onClick={save}>{done ? "Save changes" : "Save review"}</button></div>
  </section>;
}

/* ── My role ────────────────────────────────────────────────────────────── */
function MpRole(props) {
  const { phone, say, go, lead, me, refreshWeek } = props;
  const r = useMp(() => NGGApi.member.mentorCommitments(""), []);
  const [prep, setPrep] = React.useState(["", "", ""]);
  const [talk, setTalk] = React.useState(null);
  React.useEffect(() => { if (r.data && r.data.supervision) setPrep(r.data.supervision.prep.concat(["", "", ""]).slice(0, 3)); }, [r.data]);
  const act = a => {
    if (!a) return;
    if (a.route === "message:lead") { setTalk(""); return; }
    if (a.route === "action:retreat.book") { NGGApi.member.mentorRetreatBook(a.retreatId).then(() => { say("Booked. You’ll get a reminder 3 days before."); r.reload(); }, e => say(mpErr(e), { bad: true })); return; }
    if (a.route === "saturday:before") go({ screen: "saturday", step: "before" });
    else if (a.route === "saturday:after") go({ screen: "saturday", step: "after" });
    else if (a.route === "messages") go("messages");
    else if (a.route === "mentees:family") go({ screen: "mentees", filter: "family" });
  };
  const Q = ["What went well with a mentee since we last met?", "Where are you stuck?", "What do you need from me?"];
  return <>
    <MpHead sub="NGGC Mentorship Commitment and Conduct Policy" title="My role" phone={phone}/>
    <MpLoad r={r} what="your commitments" rows={6}>{d => {
      const need = d.commitments.filter(c => c.status !== "ok"), ok = d.commitments.filter(c => c.status === "ok");
      const order = ok.concat(d.commitments.filter(c => c.status === "warn"), d.commitments.filter(c => c.status === "bad"));
      return <>
        <section className="mp-card is-pad"><div className="mp-actions"><span className="mp-total" style={{ fontSize: 22 }}>{d.met + " of 12"}</span>
          <span style={{ flex: 1 }}>{"commitments on track for " + mpMonthName(d.month)}</span><span className="mp-meta">{mpPlural(d.daysLeft, "day") + " left in the month"}</span></div>
          <div className="mp-12" aria-hidden="true">{order.map(c => <i key={c.key} className={"is-" + c.status}/>)}</div></section>
        {talk !== null && <section className="mp-card is-pad mp-log"><label className="mp-field"><span className="mp-lab">{"Message to " + lead}</span><textarea className="mp-text" rows={3} value={talk} onChange={e => setTalk(e.target.value)} autoFocus/></label>
          <div className="mp-actions"><button className="mp-btn is-ink" disabled={!talk.trim()} onClick={() => NGGApi.member.mentorAct("messageLead", { body: talk }).then(() => { setTalk(null); say("Sent to " + lead + "."); }, e => say(mpErr(e, e && (e.code || e.message) === "no_lead" ? "Nobody is set as your lead yet. Ask your coordinator." : null), { bad: true }))}>{"Send to " + lead}</button>
            <button className="mp-btn" onClick={() => setTalk(null)}>Cancel</button></div></section>}
        <div className="mp-two is-wide2">
          <section className="mp-card is-clip"><div className="mp-card-head"><h2>Needs attention</h2><span>{need.length + " to do"}</span></div>
            {need.length ? need.map(c => <div key={c.key} className="mp-cm"><span className={"mp-reldot " + (c.status === "bad" ? "mp-c-bad" : "mp-c-amber")} aria-hidden="true"/>
              <div><b>{c.title}</b><span>{c.statusText + " · " + c.rule}</span></div>{c.action && <button className="mp-btn is-sm" onClick={() => act(c.action)}>{c.action.label}</button>}</div>)
              : <MpEmpty title="Every commitment is on track this month."/>}</section>
          <section className="mp-card is-clip"><div className="mp-card-head"><h2>On track</h2><span>How each is recorded</span></div>
            {ok.map(c => <div key={c.key} className="mp-cm"><i className="ph-fill ph-check-circle is-ok" aria-hidden="true"/><div><b>{c.title}</b><span>{c.statusText + " · " + c.source}</span></div></div>)}</section>
        </div>
        <section className="mp-card is-pad" aria-labelledby="mp-sup-h"><h2 id="mp-sup-h" className="mp-h2">{"Supervision with " + lead}</h2>
          <span className="mp-meta">{d.supervision ? mpDate(d.supervision.date, { weekday: "long", day: "numeric", month: "long" }) + " · after STS" : "Not booked yet. " + lead + " books it."}</span>
          {d.agreedLast && d.agreedLast.items.length > 0 && <><span className="mp-lab">{"Agreed last time · " + mpShort(d.agreedLast.date)}</span>
            <ul className="mp-checklist">{d.agreedLast.items.map((x, i) => <li key={i}><i className="ph ph-check" aria-hidden="true"/>{x}</li>)}</ul></>}
          <span className="mp-lab">Prepare for Tuesday</span>
          {Q.map((q, i) => <label key={q} className="mp-field"><span className="mp-help">{q}</span><textarea className="mp-text" rows={2} value={prep[i]} onChange={e => setPrep(p => p.map((x, j) => j === i ? e.target.value : x))}/></label>)}
          <div className="mp-actions"><button className="mp-btn is-ink" onClick={() => NGGApi.member.mentorSupervisionPrep(prep).then(() => say("Sent to " + lead + "."), e => say(mpErr(e, e && (e.code || e.message) === "answer_one" ? "Answer at least one first." : null), { bad: true }))}>{"Send to " + lead}</button>
            <span className="mp-meta">{prep.filter(x => x.trim()).length + " of 3 answered"}</span></div>
        </section>
        {d.feedback && <section className="mp-card is-pad"><h2 className="mp-h2">{"Feedback from " + lead}</h2><blockquote className="mp-quote">{d.feedback.text}</blockquote>
          <span className="mp-meta">{mpDate(d.feedback.at)}</span><div><button className="mp-btn is-sm" onClick={() => setTalk("")}>Respond or raise a concern</button></div></section>}
        <section className="mp-card is-pad"><h2 className="mp-h2">Commitment and conduct policy</h2>
          <span className="mp-meta">{d.policy.acceptedAt ? "Accepted " + mpDate(d.policy.acceptedAt) + (d.policy.version ? " · version " + d.policy.version : "") : "Not accepted yet"}</span>
          <p style={{ margin: 0 }}>{d.policy.standard}</p>
          <MpPolicy say={say} me={me} onSigned={() => { r.reload(); refreshWeek(); }}/></section>
      </>;
    }}</MpLoad>
  </>;
}

/** The full policy, read in place, and signed against its current version. */
function MpPolicy({ say, me, onSigned }) {
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [name, setName] = React.useState("");
  const load = () => NGGApi.member.pod.read("policy").then(setD, setErr);
  React.useEffect(() => { if (open && !d) load(); }, [open]);
  const sign = () => NGGApi.member.pod.act("policyAccept", { signedName: name, version: d.policy.version }).then(() => { say("Signed. Thank you."); setD(null); load(); onSigned(); },
    e => say((e && (e.code || e.message)) === "sign_with_your_name" ? "Sign with your full name." : (e && (e.code || e.message)) === "policy_changed" ? "The policy changed while you were reading. It has reloaded." : mpErr(e), { bad: true }));
  return <>
    <div><button className="mp-btn is-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide the policy" : "Read the full policy"}</button></div>
    {open && (err ? <MpError err={err} retry={() => { setErr(null); load(); }} what="the policy"/> : !d ? <MpSkel rows={3}/> : <>
      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>{d.policy.items.map(i => <li key={i.n}>{i.text}</li>)}</ol>
      {d.accepted ? <span className="mp-goodnote"><i className="ph-fill ph-seal-check" aria-hidden="true"/>{"Signed by " + d.accepted.signedName + " on " + mpDate(d.accepted.acceptedAt)}</span>
        : <div className="mp-actions"><input className="mp-input" style={{ maxWidth: 320 }} value={name} onChange={e => setName(e.target.value)} placeholder={me.name || "Your full name"} aria-label="Sign with your full name"/>
          <button className="mp-btn is-ink" disabled={name.trim().length < 3} onClick={sign}>I accept this policy</button></div>}</>)}
  </>;
}

/* ── Mentors (lead / coord) ─────────────────────────────────────────────── */
function MpMentors(props) {
  const { phone, centre, say } = props;
  const r = useMp(() => NGGApi.member.mentorTeam(centre), [centre]);
  const [q, setQ] = React.useState("");
  const [f, setF] = React.useState("all");
  const [write, setWrite] = React.useState(null);
  const all = (r.data && r.data.mentors) || [];
  const need = all.filter(m => m.needSupport);
  const n = q.trim().toLowerCase();
  const list = (f === "need" ? need : all).filter(m => !n || m.name.toLowerCase().indexOf(n) >= 0);
  const seen = all.filter(m => m.seenPct != null);
  const avg = seen.length ? Math.round(seen.reduce((a, m) => a + m.seenPct, 0) / seen.length) : null;
  const book = m => NGGApi.member.mentorSupervisionBook(m.mentorId).then(res => { say("Supervision booked with " + m.first + " for Tuesday after STS"); r.set(x => Object.assign({}, x, { mentors: x.mentors.map(y => y.mentorId === m.mentorId ? Object.assign({}, y, { booked: true }) : y) })); },
    e => say(mpErr(e), { bad: true }));
  const bar = p => p == null ? "var(--mt-row)" : p < 60 ? "var(--mt-bad)" : p < 80 ? "var(--mt-amber)" : "var(--mt-ok)";
  return <>
    <MpHead sub="The mentors you lead, and who needs support" title="Mentors" phone={phone}/>
    <div className="mp-stats">
      <div className="mp-stat"><b>{r.data ? all.length : "–"}</b><span>Mentors</span></div>
      <div className="mp-stat"><b className={avg != null && avg < 80 ? "is-warn" : ""}>{avg == null ? "–" : avg + "%"}</b><span>Seen in 2 weeks</span><em>Average across mentors · standard 80%</em></div>
      <div className="mp-stat"><b className={need.length ? "is-warn" : ""}>{r.data ? need.length : "–"}</b><span>Need support</span><em>Below standard or a commitment due</em></div>
    </div>
    <div className="mp-actions"><div className="mp-search" role="search"><i className="ph ph-magnifying-glass" aria-hidden="true"/><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search mentors" aria-label="Search mentors"/></div>
      <div className="mp-chips"><button className="mp-chip" aria-pressed={f === "all"} onClick={() => setF("all")}>All<em>{all.length}</em></button><button className="mp-chip" aria-pressed={f === "need"} onClick={() => setF("need")}>Need support<em>{need.length}</em></button></div></div>
    {write && <section className="mp-card is-pad mp-log"><label className="mp-field"><span className="mp-lab">{"Message to " + write.first}</span><textarea className="mp-text" rows={3} value={write.body} onChange={e => setWrite(Object.assign({}, write, { body: e.target.value }))} autoFocus/></label>
      <div className="mp-actions"><button className="mp-btn is-ink" disabled={!write.body.trim()} onClick={() => NGGApi.member.mentorAct("messageLead", { toId: write.memberId, body: write.body }).then(() => { say("Sent to " + write.first + "."); setWrite(null); }, e => say(mpErr(e), { bad: true }))}>Send</button><button className="mp-btn" onClick={() => setWrite(null)}>Cancel</button></div></section>}
    <section className="mp-card is-clip"><MpLoad r={r} what="your mentors" rows={5}>{() => !list.length ? <MpEmpty title="No mentor matches."/> : <div className="mp-scroll"><table className="mp-table" style={{ minWidth: 720 }}>
      <thead><tr><th scope="col">Mentor</th><th scope="col">Mentees</th><th scope="col">Seen in 2 weeks</th><th scope="col">Relationship avg</th><th scope="col">Commitments</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{(f === "need" ? list.slice().sort((a, b) => (a.seenPct == null ? 101 : a.seenPct) - (b.seenPct == null ? 101 : b.seenPct)) : list).map(m => <tr key={m.mentorId}>
        <td><span className="mp-who" style={{ cursor: "default" }}><span className="mp-av">{m.initials}</span><span><b>{m.name}</b><em>{m.kind}</em></span></span></td>
        <td className="mp-num">{m.mentees}</td>
        <td className="mp-num"><span className="mp-meter"><i style={{ width: (m.seenPct || 0) + "%", background: bar(m.seenPct) }}/></span>{m.seenPct == null ? "–" : m.seenPct + "%"}</td>
        <td className="mp-num">{m.relAvg == null ? "–" : m.relAvg.toFixed(1)}</td>
        <td><MpPill p={{ label: m.commitments, tone: m.commitments === "On track" ? "ok" : "warn" }}/></td>
        <td style={{ whiteSpace: "nowrap" }}><button className="mp-btn is-sm" onClick={() => !m.booked && book(m)} aria-disabled={m.booked} style={m.booked ? { opacity: .55 } : undefined}>{m.booked ? "Booked" : "Book supervision"}</button>
          {" "}<button className="mp-icon" aria-label={"Message " + m.name} onClick={() => setWrite({ memberId: m.memberId, first: m.first, body: "" })}><i className="ph ph-chat-circle-text"/></button></td></tr>)}</tbody></table></div>}</MpLoad></section>
  </>;
}

/* ── Academy ────────────────────────────────────────────────────────────── */
function MpAcademy(props) {
  const { phone, go, me } = props;
  const r = useMp(() => NGGApi.member.mentorAcademy(), []);
  if (r.err && (r.err.code || r.err.message) === "no_mentor_record") return <><MpHead sub="Mentor Academy" title="Academy" phone={phone}/>
    <section className="mp-card"><MpEmpty title="The Academy is for mentors." body={props.role === "coord" ? "As staff you don’t need to pass through the Academy. You can record a mentor’s training in the Control Room → Mentorship." : "Ask your coordinator to set up your mentor record."}/></section></>;
  return <>
    <MpHead sub="Mentor Academy" title="Academy" phone={phone}/>
    <MpLoad r={r} what="the Academy" rows={6}>{d => {
      const req = d.modules.filter(m => m.required); const passed = req.filter(m => m.passedAt);
      const pct = req.length ? Math.round(passed.length * 100 / req.length) : 100;
      return <>
        {d.byHand && <div className="mp-goodnote"><i className="ph-fill ph-seal-check" aria-hidden="true"/><span>Your coordinator recorded your training as complete. The modules stay open to review.</span></div>}
        <section className="mp-card is-pad"><div className="mp-actions"><b style={{ flex: 1 }}>{passed.length + " of " + req.length + " modules complete"}</b><span className="mp-num">{pct + "%"}</span></div>
          <div className="mp-prog is-ink"><i style={{ width: pct + "%" }}/></div></section>
        {(d.groups || []).map((gname, gi) => { const mods = d.modules.filter(m => m.group === gi); if (!mods.length) return null;
          return <section key={gname} className="mp-card is-clip"><div className="mp-card-head"><h2>{gname}</h2></div>
            {mods.map(m => <div key={m.id} className="mp-mod"><i className={m.passedAt ? "ph-fill ph-check-circle is-ok" : "ph ph-circle"} aria-hidden="true"/>
              <div><b>{m.title}</b><span>{m.passedAt ? "Passed " + m.score + "% · " + mpShort(m.passedAt) + (m.renewBy ? " · renew by " + mpShort(m.renewBy) : "") : m.mins + " min · " + (m.required ? "Required" : "Optional")}</span></div>
              <button className={"mp-btn is-sm" + (m.passedAt ? "" : " is-ink")} onClick={() => go({ screen: "module", id: m.id })}>{m.passedAt ? "Review" : "Start"}</button></div>)}</section>; })}
      </>;
    }}</MpLoad>
  </>;
}
function MpModule(props) {
  const { phone, go, say, id, refreshWeek } = props;
  const r = useMp(() => NGGApi.member.mentorAcademy(), []);
  const [i, setI] = React.useState(0);
  const [picks, setPicks] = React.useState({});
  const [result, setResult] = React.useState(null);
  const mod = r.data && r.data.modules.find(m => m.id === id);
  if (!mod) return <><MpHead title="Academy" phone={phone} onBack={() => go("academy")} backL="Academy"/><section className="mp-card">{r.data ? <MpEmpty title="That module isn’t in the Academy."/> : <MpLoad r={r} rows={4}>{() => null}</MpLoad>}</section></>;
  const steps = mod.lessons.map((l, k) => ({ kind: "lesson", l, k })).concat(mod.scenario ? [{ kind: "scenario" }] : [], mod.quiz.map((q, k) => ({ kind: "quiz", q, k })), [{ kind: "result" }]);
  const st = steps[i];
  const answered = st.kind === "lesson" || st.kind === "result" || picks[st.kind === "scenario" ? "s" : st.k] != null;
  const next = () => {
    if (!answered) { say("Choose an answer first", { bad: true }); return; }
    if (steps[i + 1] && steps[i + 1].kind === "result") {
      const answers = mod.quiz.map((_, k) => picks[k]);
      NGGApi.member.mentorAcademyResult(mod.id, answers).then(res => { setResult(res); setI(i + 1); if (res.passed) refreshWeek(); }, e => say(mpErr(e), { bad: true }));
      return;
    }
    setI(i + 1);
  };
  const opt = (key, o, k, right, why) => {
    const picked = picks[key]; const locked = picked != null; const isPick = picked === k;
    const cls = locked && right ? " is-right" : locked && isPick && !right ? " is-wrong" : "";
    return <button key={k} className={"mp-opt" + cls} role="radio" aria-checked={isPick} disabled={locked} onClick={() => setPicks(p => Object.assign({}, p, { [key]: k }))}>
      <i className={"ph" + (locked && right ? "-fill ph-check-circle" : locked && isPick ? "-fill ph-x-circle" : " ph-circle")} aria-hidden="true"/>{o}</button>;
  };
  const feedback = (key, right, why) => picks[key] != null && <p className={right ? "mp-goodnote" : "mp-infonote"} role="status">{(right ? "Right. " : "Not quite. ") + (why || "")}</p>;
  return <>
    <MpHead sub="Mentor Academy" title={mod.title} phone={phone} onBack={() => go("academy")} backL="Academy"/>
    <div className="mp-player" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="mp-actions"><span className="mp-meta" style={{ flex: 1 }}>{"Step " + (i + 1) + " of " + steps.length}</span><span className="mp-meta">{mod.mins + " min · " + (mod.required ? "Required" : "Optional")}</span></div>
      <div className="mp-prog is-ink"><i style={{ width: ((i + 1) * 100 / steps.length) + "%" }}/></div>
      <section className="mp-card is-pad mp-lesson">
        {st.kind === "lesson" && <><span className="mp-eyebrow">{"Lesson " + (st.k + 1) + " of " + mod.lessons.length}</span><h2>{st.l.h}</h2><p>{st.l.body}</p></>}
        {st.kind === "scenario" && <><span className="mp-eyebrow">What would you do?</span><p>{mod.scenario.situation}</p>
          <div role="radiogroup" aria-label="What would you do?" style={{ display: "flex", flexDirection: "column", gap: 8 }}>{mod.scenario.options.map((o, k) => opt("s", o.text, k, o.right))}</div>
          {picks.s != null && feedback("s", mod.scenario.options[picks.s].right, mod.scenario.options[picks.s].why)}</>}
        {st.kind === "quiz" && <><span className="mp-eyebrow">{"Question " + (st.k + 1) + " of " + mod.quiz.length}</span><h2>{st.q.q}</h2>
          <div role="radiogroup" aria-label={st.q.q} style={{ display: "flex", flexDirection: "column", gap: 8 }}>{st.q.options.map((o, k) => opt(st.k, o, k, k === st.q.answer))}</div>
          {feedback(st.k, picks[st.k] === st.q.answer, st.q.why)}</>}
        {st.kind === "result" && result && (result.passed ? <div className="mp-sent"><i className="ph-fill ph-seal-check" aria-hidden="true"/><h2>{"Passed · " + result.score + "%"}</h2>
          <p>{"Saved to your record. Your coordinator can see it" + (mod.renewDays ? ", and you’ll be reminded before it needs renewing." : ".")}</p>
          <div><button className="mp-btn is-ink" onClick={() => go("academy")}>Back to Academy</button></div></div>
          : <div className="mp-sent"><h2>{result.score + "% · the pass mark is " + (r.data.pass || 80) + "%"}</h2><p>Read the lessons again, then retake the questions. Nothing is recorded until you pass.</p>
            <div><button className="mp-btn is-ink" onClick={() => { setPicks({}); setResult(null); setI(0); }}>Try again</button></div></div>)}
      </section>
      {st.kind !== "result" && <div className="mp-actions">{i > 0 && <button className="mp-btn" onClick={() => setI(i - 1)}>Back</button>}
        <button className="mp-btn is-ink" onClick={next} aria-disabled={!answered} style={!answered ? { background: "var(--mt-field)", borderColor: "var(--mt-field)", color: "var(--mt-muted)" } : undefined}>{steps[i + 1] && steps[i + 1].kind === "result" ? "See result" : "Continue"}</button></div>}
    </div>
  </>;
}

/* ── Report a concern ───────────────────────────────────────────────────── */
function MpConcern(props) {
  const { centre, me } = props;
  const r = useMp(() => NGGApi.member.mentorCaseload(centre), [centre]);
  return <MpConcernForm {...props} officer={me.officer} mentees={(r.data && r.data.mentees) || []} loading={!r.data && r.loading}/>;
}
/** The concern form, for a mentee or a Summer School participant. */
function MpConcernForm(props) {
  const { phone, go, say, back, mentees, loading, officer: off } = props;
  const [who, setWho] = React.useState(props.subject || "");
  const [cat, setCat] = React.useState("");
  const [body, setBody] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(null);
  const ms = mentees || [];
  const me = { officer: off };
  const officer = (me.officer && me.officer.name) || "the safeguarding officer";
  const offFirst = me.officer ? me.officer.name.replace(/^(Mrs?|Ms|Miss|Dr)\.?\s+/i, "$1. ").split(/\s+/).slice(0, 2).join(" ") : "They";
  const KINDS = ["Something they told me", "Injury or harm", "Neglect", "Online safety", "An adult’s behaviour", "Something else"];
  const send = () => {
    if (!who) { setHint("Choose the child first."); return; }
    if (!cat) { setHint("Choose what kind of concern."); return; }
    if (body.trim().length <= 10) { setHint("Write what happened, in a sentence or two."); return; }
    setHint(""); setBusy(true);
    NGGApi.member.mentorConcern(who, cat, body).then(res => { setSent(res); say("Sent to the safeguarding officer. They’ll contact you today."); }, e => say(mpErr(e, "It didn’t send. Try again — and if a child is in danger, call 112 now."), { bad: true })).finally(() => setBusy(false));
  };
  if (sent) return <>
    <MpHead sub="Safeguarding" title="Report a concern" phone={phone} onBack={back}/>
    <section className="mp-card is-pad mp-concern mp-sent"><i className="ph-fill ph-check-circle" aria-hidden="true"/>
      <h2 className="mp-h2" style={{ fontSize: 20 }}>{"Sent to " + (sent.officerName || "the safeguarding officer")}</h2>
      <span className="mp-meta mp-mono">{"Reference " + sent.ref + " · Today, " + new Date(sent.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      <ol><li>{(sent.officerName ? offFirst : "The officer") + " reads it today and calls you if they need more detail."}</li>
        <li>They decide the next step with the centre lead. You won’t need to investigate.</li>
        <li>Carry on as normal with the child. Don’t promise them it stays secret.</li></ol>
      {!sent.assigned && <div className="mp-infonote"><i className="ph ph-warning" aria-hidden="true"/><span>No safeguarding officer is set for this centre yet, so the NGG admin has been alerted. Tell your coordinator today as well.</span></div>}
      <div className="mp-actions"><button className="mp-btn is-ink" onClick={() => go("week")}>Back to This week</button><button className="mp-btn" onClick={() => { setSent(null); setWho(""); setCat(""); setBody(""); }}>Report another</button></div>
    </section></>;
  return <>
    <MpHead sub="Safeguarding" title="Report a concern" phone={phone} onBack={back}/>
    <section className="mp-card is-pad mp-concern">
      <div className="mp-badnote"><i className="ph ph-phone" aria-hidden="true"/>If a child is in danger now, call 112, then tell the safeguarding officer.</div>
      <div className="mp-field"><label className="mp-lab" htmlFor="mp-cn-who">Which child?</label>{!loading ? <MpPicker id="mp-cn-who" mentees={ms} value={who} onChange={setWho} label="Which child?"/> : <MpSkel rows={1}/>}</div>
      <div className="mp-field"><span className="mp-lab" id="mp-cn-kind">What kind of concern?</span>
        <div className="mp-chips is-wrap" role="radiogroup" aria-labelledby="mp-cn-kind">{KINDS.map(k => <button key={k} className="mp-chip" role="radio" aria-checked={cat === k} onClick={() => setCat(k)}>{k}</button>)}</div></div>
      <label className="mp-field"><span className="mp-lab">What happened, in their words if you can</span><textarea className="mp-text" rows={5} value={body} onChange={e => setBody(e.target.value)}/></label>
      <div className="mp-actions"><button className="mp-btn is-red is-lg" onClick={send} disabled={busy}>Send to the safeguarding officer</button></div>
      {hint && <span className="mp-warnline" role="alert">{hint}</span>}
      <span className="mp-help">{"Goes only to " + officer + ". It is not added to the child’s file or shown to the family."}</span>
    </section></>;
}
