/* The registration checklist in the portals (domain/registration-checklist.php).

   RclSupervisorDesk — "My registrations" in the Mentor Portal: the members this
   person was asked to help register, what is left for each, and a form per
   item. The server verifies everything (the file's type, its age, that this is
   the assigned supervisor, and their check-in at the member's centre that day)
   and answers in words; this screen only shows what it said. An item the
   record decides has no upload: "Check again" asks the record.

   RclProgress — "Your registration: 6 of 9 done" for the member (Me), and the
   same for a guardian (family Today): what is left and who is helping, by
   first name. No evidence, nobody else's. Classes only; the bar is a native
   <progress>, so no width is set from script. */

function rclAccept(evidence) { return evidence === "photo" ? "image/*" : "image/*,.pdf,.doc,.docx,.odt,.rtf,.txt"; }
function rclIcon(i) { return i.done ? "ph-fill ph-check-circle" : i.kind === "auto" ? "ph ph-database" : i.evidence === "photo" ? "ph ph-camera" : i.evidence === "document" ? "ph ph-file-text" : "ph ph-note-pencil"; }

function RclEvidenceForm({ m, i, onDone, onCancel }) {
  const id = "rcl-" + m.memberId + "-" + i.key.replace(/[^a-z0-9]/gi, "");
  const file = i.evidence === "photo" || i.evidence === "document";
  const [f, setF] = React.useState(null);
  const [on, setOn] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState(null);
  const first = React.useRef(null);
  React.useEffect(() => { if (first.current) first.current.focus(); }, []);
  const send = async e => {
    e.preventDefault();
    if (file && !f) { setRes({ ok: false, t: "Attach the " + (i.evidence === "photo" ? "photo" : "document") + " first." }); return; }
    if (!file && note.trim().length < 3) { setRes({ ok: false, t: "Write a short note saying what you checked." }); return; }
    setBusy(true); setRes(null);
    try {
      const body = { memberId: m.memberId, itemKey: i.key, note, capturedOn: on };
      if (file) { const up = await NGGApi.uploadFile(f, "evidence"); Object.assign(body, { url: up.url, mime: f.type || "", bytes: up.bytes || f.size || 0 }); }
      const r = await NGGApi.member.regcheck.submit(body);
      setRes({ ok: !!r.accepted, t: r.reason });
      if (r.accepted) onDone(r.reason);
    } catch (err) {
      setRes({ ok: false, t: (err && err.data && (err.data.message || err.data.detail)) || "Couldn’t send it. Check your connection and try again." });
    }
    setBusy(false);
  };
  return (
    <form className="rcl-form" onSubmit={send} onKeyDown={e => { if (e.key === "Escape") onCancel(); }} aria-label={"Evidence for " + i.title}>
      {file && <label className="rcl-field" htmlFor={id + "-file"}><span>{i.evidence === "photo" ? "Photo" : "Document"}</span>
        <input ref={first} id={id + "-file"} type="file" accept={rclAccept(i.evidence)} onChange={e => setF(e.target.files && e.target.files[0] ? e.target.files[0] : null)}/></label>}
      {i.maxAgeDays > 0 && <label className="rcl-field" htmlFor={id + "-on"}><span>{i.evidence === "photo" ? "Taken on" : "Dated"}</span>
        <input id={id + "-on"} type="date" value={on} onChange={e => setOn(e.target.value)} required/></label>}
      <label className="rcl-field" htmlFor={id + "-note"}><span>{file ? "Note (optional)" : "What you checked"}</span>
        <textarea ref={file ? null : first} id={id + "-note"} rows="3" maxLength="500" value={note} onChange={e => setNote(e.target.value)}/></label>
      {res && <p className={"rcl-res" + (res.ok ? " is-ok" : " is-bad")} role={res.ok ? "status" : "alert"}>{res.t}</p>}
      <div className="rcl-acts">
        <button type="submit" className="rcl-btn is-main" disabled={busy}>{busy ? "Checking…" : "Submit"}</button>
        <button type="button" className="rcl-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function RclSupervisorDesk() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [open, setOpen] = React.useState("");
  const [said, setSaid] = React.useState({});
  const load = React.useCallback(() => { setErr(null); return NGGApi.member.regcheck.mine().then(setD).catch(setErr); }, []);
  React.useEffect(() => { load(); }, [load]);
  const recheck = (m, i) => NGGApi.member.regcheck.submit({ memberId: m.memberId, itemKey: i.key })
    .then(r => { setSaid(s => Object.assign({}, s, { [m.memberId + i.key]: { ok: !!r.accepted, t: r.reason } })); load(); },
          e => setSaid(s => Object.assign({}, s, { [m.memberId + i.key]: { ok: false, t: (e && e.data && e.data.message) || "Couldn’t check. Try again." } })));
  if (err) return <div className="rcl-card rcl-state" role="alert"><p>Your registrations couldn’t load.</p><button type="button" className="rcl-btn" onClick={load}>Try again</button></div>;
  if (!d) return <div className="rcl-card rcl-state" role="status" aria-live="polite"><p>Loading your registrations…</p></div>;
  const ms = d.members || [];
  if (!ms.length) return <div className="rcl-card rcl-state"><p>Nobody to help yet. When the staff ask you to help a new member finish registering, they appear here with what is left.</p></div>;
  return (
    <div className="rcl-desk">
      <p className="rcl-lead" role="status" aria-live="polite">{ms.filter(m => m.status === "open").length} of {ms.length} still registering. Items marked “at the centre” need you checked in at their centre that day.</p>
      {ms.map(m => (
        <section key={m.memberId} className="rcl-card" aria-labelledby={"rcl-h-" + m.memberId}>
          <div className="rcl-head"><h2 id={"rcl-h-" + m.memberId}>{m.fullName}</h2><span>{[m.displayId, m.centre].filter(Boolean).join(" · ")}</span></div>
          <p className="rcl-meta">{m.done} of {m.total} done · {m.presentToday ? "You are checked in at " + m.centre + " today" : "You have not checked in at " + m.centre + " today"}</p>
          <progress className="rcl-bar" value={m.done} max={m.total || 1} aria-label={m.first + "’s registration: " + m.done + " of " + m.total + " done"}/>
          <ul className="rcl-items">
            {m.items.map(i => {
              const k = m.memberId + i.key, s = said[k];
              const sub = i.done ? (i.kind === "auto" ? "The record shows it." : "Verified.")
                : i.status === "rejected" ? "Reopened: " + i.rejectReason
                : i.kind === "auto" ? i.fix
                : [i.help, i.presence ? "At the centre." : "", i.maxAgeDays ? "From the last " + i.maxAgeDays + " days." : ""].filter(Boolean).join(" ");
              return (
                <li key={i.key} className={"rcl-item" + (i.done ? " is-done" : "")}>
                  <i className={rclIcon(i)} aria-hidden="true"/>
                  <div className="rcl-item-body">
                    <b>{i.title}</b><span>{sub}</span>
                    {!i.done && i.lastRefusal && !s && open !== k && <span className="rcl-why">Last try: {i.lastRefusal}</span>}
                    {s && <span className={"rcl-res" + (s.ok ? " is-ok" : " is-bad")} role={s.ok ? "status" : "alert"}>{s.t}</span>}
                    {open === k && <RclEvidenceForm m={m} i={i} onCancel={() => setOpen("")} onDone={t => { setOpen(""); setSaid(x => Object.assign({}, x, { [k]: { ok: true, t } })); load(); }}/>}
                  </div>
                  {!i.done && open !== k && (i.kind === "auto"
                    ? <button type="button" className="rcl-btn" onClick={() => recheck(m, i)}>Check again</button>
                    : <button type="button" className="rcl-btn" aria-expanded="false" onClick={() => setOpen(k)}>Submit</button>)}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RclProgress({ who, linkId, first }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(() => {
    setErr(null);
    return (who === "family" ? NGGApi.family.registration(linkId) : NGGApi.member.regcheck.progress()).then(setD).catch(setErr);
  }, [who, linkId]);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <section className="rcl-card rcl-state" role="alert"><p>The registration couldn’t load.</p><button type="button" className="rcl-btn" onClick={load}>Try again</button></section>;
  if (!d) return <section className="rcl-card rcl-state" role="status" aria-live="polite"><p>Loading the registration…</p></section>;
  if (!d.started) return null;   // no checklist: nothing to finish
  const name = who === "family" ? (first || d.first) : "";
  const h = (who === "family" ? name + "’s registration" : "Your registration") + ": " + d.done + " of " + d.total + " done";
  return (
    <section className="rcl-card rcl-progress" aria-labelledby={"rcl-p-" + (linkId || "me")}>
      <h2 id={"rcl-p-" + (linkId || "me")}>{h}</h2>
      <progress className="rcl-bar" value={d.done} max={d.total || 1} aria-label={h}/>
      {d.complete
        ? <p className="rcl-meta">Everything is done. {who === "family" ? name + " is" : "You are"} fully registered.</p>
        : <React.Fragment><p className="rcl-meta">Still to do:</p><ul className="rcl-left">{d.left.map((t, n) => <li key={n}>{t}</li>)}</ul></React.Fragment>}
      {!d.complete && <p className="rcl-meta">{d.helper ? d.helper + " at the centre is helping " + (who === "family" ? name : "you") + " with this." : "Someone at the centre will be asked to help " + (who === "family" ? name : "you") + "."}</p>}
    </section>
  );
}
