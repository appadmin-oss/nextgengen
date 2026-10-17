/* ============================================================================
   Mentor Portal v15 — Class: stars, school results and curriculum.

   These were the old dark "Stars & results" portal embedded whole inside v15:
   its own header, its own centre switch, its own tabs and its own words ("V3",
   "2026-W42 · 0/2"), a second app inside the first. They are now the portal's
   own screens in its own language, on the SAME endpoints the old panel called
   (member.mentor roster/star/v3/bulk, teaching remarks, curriculum staff/mark,
   mentor plans/plan/approve/return) — no new server surface.

   One drawer pattern for every per-child action (right side, full screen on a
   phone, Escape closes, focus returns to the button that opened it).
   ========================================================================== */

const MP15C_REMARK = {
  progress: ["Progress", "moved forward on something"],
  strength: ["Strength", "something they are good at"],
  concern: ["Concern", "something that worried you"],
  "parent-worthy": ["Tell a parent", "worth saying at the next pickup"],
};
const MP15C_ERR = {
  already_starred_today: "Already starred today — one rating per child per day.",
  not_your_centre: "That child isn't in your class.",
  not_found: "That child isn't in your class.",
  too_many_subjects: "That's too many at once — select fewer.",
  nothing_to_record: "Pick what happened, or write a note.",
  note_required: "Write a short note so they know what to change.",
  not_waiting: "This plan is no longer waiting for you.",
  peer_cannot_approve: "A peer mentor can read plans but not approve them.",
  not_ngg_staff: "The Club curriculum is for NGG mentors and instructors.",
  network: "You're offline. Try again when you're connected.",
};
const mp15cErr = (e, fb) => MP15C_ERR[(e && (e.code || e.message)) || ""] || fb || "That didn't work. Try again.";

/* The drawer: one for every per-child action on these screens. */
function Mp15CDrawer({ title, sub, onClose, children, foot }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const back = document.activeElement;
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    const t = setTimeout(() => { const f = ref.current && ref.current.querySelector("button, textarea, input"); if (f) f.focus(); }, 0);
    return () => { document.removeEventListener("keydown", onKey, true); clearTimeout(t); try { back && back.focus && back.focus(); } catch (_) {} };
  }, []);
  return (
    <div className="m15c-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="m15c-drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="m15c-drawer-h">
          <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <button type="button" className="m15c-icon" onClick={onClose} aria-label="Close"><i className="ph ph-x" aria-hidden="true"/></button>
        </header>
        <div className="m15c-drawer-b">{children}</div>
        {foot && <footer className="m15c-drawer-f">{foot}</footer>}
      </div>
    </div>
  );
}

function Mp15Class({ screen, centre, say, onOpenChild }) {
  if (screen === "results") return <Mp15CResults centre={centre}/>;
  if (screen === "curric") return <Mp15CCurric say={say}/>;
  return <Mp15CStars centre={centre} say={say} onOpenChild={onOpenChild}/>;
}

/* ── Stars ──────────────────────────────────────────────────────────────── */

function Mp15CStars({ centre, say, onOpenChild }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [scope, setScope] = React.useState("");
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState({});
  const [open, setOpen] = React.useState(null);   // { kind: 'star'|'presence'|'notes'|'bulk', s }
  const load = React.useCallback(() => {
    setErr(null);
    return NGGApi.member.mentorRoster(centre || "", scope, "ngg").then(r => { setD(r); }).catch(e => setErr(e));
  }, [centre, scope]);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { setSel({}); }, [centre, scope]);

  if (err) return <div className="m15c-card m15c-msg" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>Couldn't load your class ({mp15cErr(err, (err && (err.code || err.message)) || "error")}).</span><button type="button" className="m15c-btn" onClick={load}>Retry</button></div>;
  if (!d) return <div className="m15c-card m15c-msg" role="status" aria-live="polite"><span className="m15x-bar"/><span className="m15x-sr">Loading your class</span></div>;

  if (d.needsCentre) return <div className="m15c-card m15c-msg" role="status"><i className="ph ph-buildings" aria-hidden="true"/><span>Choose a centre at the top of the portal to see its class.</span></div>;
  const all = d.students || [];
  const ql = q.trim().toLowerCase();
  const rows = all.filter(s => !ql || ((s.fullName || "") + " " + (s.track || "")).toLowerCase().includes(ql));
  const selIds = Object.keys(sel).filter(k => sel[k] && all.some(s => s.studentId === k));
  const allOn = rows.length > 0 && rows.every(s => sel[s.studentId]);
  const starred = all.filter(s => s.starredToday).length;
  const presence = s => s.v3 ? (s.v3.verbal + s.v3.vocal + s.v3.visual) : null;
  const done = () => { setOpen(null); load(); };

  return (
    <>
      <section className="m15c-card">
        <div className="m15c-head">
          <div>
            <h2 className="m15c-h">Stars and presence</h2>
            <p className="m15c-sub">{starred} of {all.length} starred today · presence is rated once a week{d.period ? " (" + d.period.replace(/^(\d{4})-W(\d+)$/, "week $2") + ")" : ""}</p>
          </div>
          {d.mineCount > 0 && (
            <div className="m15c-seg" role="radiogroup" aria-label="Whose children">
              {[["mine", "My mentees (" + d.mineCount + ")"], ["centre", "Whole centre"]].map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={d.scope === k} className={d.scope === k ? "is-on" : ""} onClick={() => setScope(k)}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <div className="m15c-tools" role="search">
          <label className="m15c-search"><i className="ph ph-magnifying-glass" aria-hidden="true"/>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or course" aria-label="Search name or course"/></label>
          <span className="m15c-sub" role="status" aria-live="polite">{rows.length === all.length ? all.length + " children" : rows.length + " of " + all.length}</span>
        </div>
        {selIds.length > 0 && (
          <div className="m15c-bulk" role="region" aria-label="Selection">
            <b aria-live="polite">{selIds.length} selected</b>
            <button type="button" className="m15c-btn is-primary" onClick={() => setOpen({ kind: "bulk" })}><i className="ph ph-star" aria-hidden="true"/>Record for {selIds.length}</button>
            <button type="button" className="m15c-btn" onClick={() => setSel({})}>Clear</button>
          </div>
        )}
        {!all.length ? <p className="m15c-empty">No children in this list yet.</p> : !rows.length ? <p className="m15c-empty">Nobody matches “{q}”.</p> : (
          <table className="m15c-table">
            <thead><tr>
              <th scope="col" className="m15c-chk"><input type="checkbox" aria-label="Select all shown" checked={allOn}
                ref={el => { if (el) el.indeterminate = !allOn && rows.some(s => sel[s.studentId]); }}
                onChange={() => { const n = { ...sel }; rows.forEach(s => { n[s.studentId] = !allOn; }); setSel(n); }}/></th>
              <th scope="col">Child</th><th scope="col">Today</th><th scope="col">Presence this week</th><th scope="col"><span className="m15x-sr">Notes</span></th>
            </tr></thead>
            <tbody>{rows.map(s => {
              const p = presence(s);
              return (
                <tr key={s.studentId}>
                  <td className="m15c-chk"><input type="checkbox" aria-label={"Select " + s.fullName} checked={!!sel[s.studentId]} onChange={() => setSel({ ...sel, [s.studentId]: !sel[s.studentId] })}/></td>
                  <td><button type="button" className="m15c-name" aria-label={(onOpenChild && s.kind === "member" ? "Open the record for " : "Notes on ") + s.fullName} onClick={() => onOpenChild && s.kind === "member" ? onOpenChild(s.studentId) : setOpen({ kind: "notes", s })}>
                    <span className="m15c-av" aria-hidden="true">{(s.fullName || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("")}</span>
                    <span><b>{s.fullName}</b><small>{s.track || "—"}</small></span></button></td>
                  <td>{s.starredToday
                    ? <span className="m15c-stars" title={s.note || ""} aria-label={s.starredToday + " stars today"}>{"★".repeat(s.starredToday)}<small>{s.note ? " · " + s.note : ""}</small></span>
                    : <button type="button" className="m15c-btn" onClick={() => setOpen({ kind: "star", s })}><i className="ph ph-star" aria-hidden="true"/>Give stars</button>}</td>
                  <td><button type="button" className={"m15c-btn" + (p != null ? " is-done" : "")} onClick={() => setOpen({ kind: "presence", s })}>
                    {p != null ? <><i className="ph ph-check" aria-hidden="true"/>{p} of 15</> : "Rate presence"}</button></td>
                  <td className="m15c-right"><button type="button" className="m15c-icon" onClick={() => setOpen({ kind: "notes", s })} aria-label={"Notes on " + s.fullName}><i className="ph ph-note-pencil" aria-hidden="true"/></button></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </section>
      {open && open.kind === "star" && <Mp15CStarDrawer s={open.s} categories={d.categories || []} onClose={() => setOpen(null)} onDone={() => { say && say("Stars given to " + open.s.fullName.split(" ")[0]); done(); }}/>}
      {open && open.kind === "presence" && <Mp15CPresenceDrawer s={open.s} period={d.period} onClose={() => setOpen(null)} onDone={t => { say && say("Presence " + t + " of 15 for " + open.s.fullName.split(" ")[0]); done(); }}/>}
      {open && open.kind === "notes" && <Mp15CNotesDrawer s={open.s} onClose={() => setOpen(null)}/>}
      {open && open.kind === "bulk" && <Mp15CBulkDrawer ids={selIds} presets={d.presets || []} onClose={() => setOpen(null)} onDone={r => { setSel({}); say && say((r.awarded || 0) + " starred, " + (r.logged || 0) + " logged" + (r.skipped ? ", " + r.skipped + " skipped" : "")); done(); }}/>}
    </>
  );
}

function Mp15CStarDrawer({ s, categories, onClose, onDone }) {
  const [stars, setStars] = React.useState(3);
  const [cat, setCat] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const send = async () => {
    setBusy(true); setErr("");
    try { await NGGApi.member.starGive(s.studentId, stars, cat, note.trim()); onDone(); }
    catch (e) { setErr(mp15cErr(e)); setBusy(false); }
  };
  return (
    <Mp15CDrawer title={"Stars for " + s.fullName} sub="One rating per child per day. Reward the behaviour you want to see more of." onClose={onClose}
      foot={<><button type="button" className="m15c-btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="m15c-btn is-primary" onClick={send} disabled={busy}>{busy ? "Saving…" : "Give " + stars + " star" + (stars === 1 ? "" : "s")}</button></>}>
      <div className="m15c-field"><span className="m15c-label" id="m15c-stars-l">How many</span>
        <div className="m15c-seg is-wide" role="radiogroup" aria-labelledby="m15c-stars-l">
          {[1, 2, 3].map(n => <button key={n} type="button" role="radio" aria-checked={stars === n} className={stars === n ? "is-on" : ""} onClick={() => setStars(n)}>{"★".repeat(n)}</button>)}
        </div></div>
      {categories.length > 0 && <div className="m15c-field"><span className="m15c-label">For (optional)</span>
        <div className="m15c-chips">{categories.map(c => <button key={c} type="button" aria-pressed={cat === c} className={"m15c-chip" + (cat === c ? " is-on" : "")} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>)}</div></div>}
      <label className="m15c-field"><span className="m15c-label">What did they do well? (optional)</span>
        <textarea className="m15c-input" rows={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)}/></label>
      {err && <p className="m15c-err" role="alert">{err}</p>}
    </Mp15CDrawer>
  );
}

/* Presence — the V3 rating, in words: verbal, vocal, visual, each 1–5, once a week. */
function Mp15CPresenceDrawer({ s, period, onClose, onDone }) {
  const init = s.v3 || {};
  const [v, setV] = React.useState({ verbal: init.verbal || 3, vocal: init.vocal || 3, visual: init.visual || 3 });
  const [note, setNote] = React.useState(init.note || "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const total = v.verbal + v.vocal + v.visual;
  const dims = [["verbal", "Verbal", "How they put ideas into words"], ["vocal", "Vocal", "Voice, delivery, confidence"], ["visual", "Visual", "Presence, body language, craft"]];
  const send = async () => {
    setBusy(true); setErr("");
    try { await NGGApi.member.v3Rate(s.studentId, v.verbal, v.vocal, v.visual, note.trim()); onDone(total); }
    catch (e) { setErr(mp15cErr(e)); setBusy(false); }
  };
  return (
    <Mp15CDrawer title={"Presence · " + s.fullName} sub={"Verbal, vocal and visual, each from 1 to 5, once a week. You can change it until the week ends."} onClose={onClose}
      foot={<><button type="button" className="m15c-btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="m15c-btn is-primary" onClick={send} disabled={busy}>{busy ? "Saving…" : "Save · " + total + " of 15"}</button></>}>
      {dims.map(([k, l, h]) => (
        <div key={k} className="m15c-field"><span className="m15c-label" id={"m15c-" + k}>{l} <small>{h}</small></span>
          <div className="m15c-seg is-wide" role="radiogroup" aria-labelledby={"m15c-" + k}>
            {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={v[k] === n} className={v[k] === n ? "is-on" : ""} onClick={() => setV({ ...v, [k]: n })}>{n}</button>)}
          </div></div>
      ))}
      <label className="m15c-field"><span className="m15c-label">What stood out this week? (optional)</span>
        <textarea className="m15c-input" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)}/></label>
      {err && <p className="m15c-err" role="alert">{err}</p>}
    </Mp15CDrawer>
  );
}

function Mp15CNotesDrawer({ s, onClose }) {
  const [rows, setRows] = React.useState(null);
  const [kind, setKind] = React.useState("progress");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => NGGApi.member.remarks(s.studentId).then(r => setRows(r.remarks || [])).catch(() => setRows([])), [s.studentId]);
  React.useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr("");
    try { await NGGApi.member.remarkAdd(s.studentId, kind, body.trim()); setBody(""); await load(); }
    catch (e) { setErr(mp15cErr(e)); }
    finally { setBusy(false); }
  };
  return (
    <Mp15CDrawer title={"Notes · " + s.fullName} sub="Seen by their mentor and by staff. Never shown to the child or their family." onClose={onClose}>
      <div className="m15c-field"><span className="m15c-label">Kind of note</span>
        <div className="m15c-chips">{Object.keys(MP15C_REMARK).map(k => <button key={k} type="button" aria-pressed={kind === k} title={MP15C_REMARK[k][1]} className={"m15c-chip" + (kind === k ? " is-on" : "")} onClick={() => setKind(k)}>{MP15C_REMARK[k][0]}</button>)}</div></div>
      <label className="m15c-field"><span className="m15c-label">Your note</span>
        <textarea className="m15c-input" rows={3} maxLength={1200} value={body} onChange={e => setBody(e.target.value)} placeholder={"Something they " + MP15C_REMARK[kind][1]}/></label>
      {err && <p className="m15c-err" role="alert">{err}</p>}
      <button type="button" className="m15c-btn is-primary" onClick={add} disabled={busy || !body.trim()}>{busy ? "Saving…" : "Add note"}</button>
      <div className="m15c-notes">
        {rows === null ? <span className="m15x-bar"/> : !rows.length ? <p className="m15c-empty">Nothing written about {s.fullName.split(" ")[0]} yet.</p>
          : rows.map(r => (
            <article key={r.remarkId} className="m15c-note">
              <div className="m15c-note-h"><b>{(MP15C_REMARK[r.kind] || [r.kind])[0]}</b>
                {r.safeguarding && <span className={"m15c-tag " + (r.status === "acknowledged" ? "is-ok" : "is-bad")}>{r.status === "acknowledged" ? "Seen by staff" : "Safeguarding"}</span>}
                <span className="m15c-sub">{(r.createdAt || "").slice(0, 10)}</span></div>
              <p>{r.body}</p>
              <small className="m15c-sub">{r.authorName}{r.authorRole ? " · " + r.authorRole : ""}{r.course ? " · " + r.course : ""}</small>
            </article>
          ))}
      </div>
    </Mp15CDrawer>
  );
}

function Mp15CBulkDrawer({ ids, presets, onClose, onDone }) {
  const [preset, setPreset] = React.useState(null);
  const [stars, setStars] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const eff = stars != null ? stars : (preset ? preset.stars : 0);
  const can = !!preset || note.trim().length >= 5;
  const send = async () => {
    setBusy(true); setErr("");
    try {
      const o = {}; if (preset) o.presetId = preset.id; if (stars != null) o.stars = stars; if (note.trim()) o.note = note.trim();
      onDone(await NGGApi.member.bulkAward(ids, o));
    } catch (e) { setErr(mp15cErr(e)); setBusy(false); }
  };
  return (
    <Mp15CDrawer title={"Record for " + ids.length + " " + (ids.length === 1 ? "child" : "children")} sub="Tap what happened. One tap covers everyone selected; anyone already starred today is skipped and named." onClose={onClose}
      foot={<><button type="button" className="m15c-btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="m15c-btn is-primary" onClick={send} disabled={busy || !can}>{busy ? "Recording…" : "Record for " + ids.length}</button></>}>
      <div className="m15c-field"><span className="m15c-label">What happened</span>
        <div className="m15c-presets">{presets.map(p => <button key={p.id} type="button" aria-pressed={!!preset && preset.id === p.id} className={"m15c-chip" + (preset && preset.id === p.id ? " is-on" : "")}
          onClick={() => { setPreset(preset && preset.id === p.id ? null : p); setStars(null); }}><span aria-hidden="true">{p.icon || "•"}</span> {p.label}{p.stars > 0 ? " · " + "★".repeat(p.stars) : ""}</button>)}</div></div>
      <div className="m15c-field"><span className="m15c-label" id="m15c-bstars">Stars {preset && stars == null ? "(from what happened)" : ""}</span>
        <div className="m15c-seg is-wide" role="radiogroup" aria-labelledby="m15c-bstars">
          {[0, 1, 2, 3].map(n => <button key={n} type="button" role="radio" aria-checked={eff === n} className={eff === n ? "is-on" : ""} onClick={() => setStars(n)}>{n ? "★".repeat(n) : "None"}</button>)}
        </div></div>
      <label className="m15c-field"><span className="m15c-label">{preset ? "Note (optional)" : "Or write what happened"}</span>
        <textarea className="m15c-input" rows={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Worked well together on the group build"/></label>
      {err && <p className="m15c-err" role="alert">{err}</p>}
    </Mp15CDrawer>
  );
}

/* ── School results: the mentor's half of the growth plan ───────────────── */

function Mp15CResults({ centre }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  const load = React.useCallback(() => { setErr(null); return NGGApi.member.mentorPlans(centre || "").then(setD).catch(setErr); }, [centre]);
  React.useEffect(() => { load(); }, [load]);
  if (open) return <Mp15CPlan subjectId={open.id} term={open.term} onBack={() => { setOpen(null); load(); }}/>;
  if (err) return <div className="m15c-card m15c-msg" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{mp15cErr(err, "Couldn't load the plans.")}</span><button type="button" className="m15c-btn" onClick={load}>Retry</button></div>;
  if (!d) return <div className="m15c-card m15c-msg" role="status"><span className="m15x-bar"/><span className="m15x-sr">Loading plans</span></div>;
  const row = (r, tag, tone) => (
    <li key={r.planId}><button type="button" className="m15c-row" onClick={() => setOpen({ id: r.subjectId, term: r.term })}>
      <span><b>{r.name}</b><small>{r.termLabel}</small></span><span className={"m15c-tag " + (tone || "")}>{tag}</span><i className="ph ph-caret-right" aria-hidden="true"/></button></li>
  );
  return (
    <>
      <section className="m15c-card">
        <div className="m15c-head"><div><h2 className="m15c-h">Waiting for you <span className="m15c-count">{d.waiting.length}</span></h2>
          <p className="m15c-sub">A mentee uploads their report, checks the scores and plans up to three subjects. It goes live when you approve it.</p></div></div>
        {d.waiting.length ? <ul className="m15c-list">{d.waiting.map(r => row(r, r.days === 0 ? "Sent today" : "Sent " + r.days + " day" + (r.days === 1 ? "" : "s") + " ago", "is-warn"))}</ul>
          : <p className="m15c-empty">No plans waiting. When a mentee sends their results and plan, it appears here.</p>}
      </section>
      {d.stalled.length > 0 && (
        <section className="m15c-card">
          <div className="m15c-head"><div><h2 className="m15c-h">Stalled plans</h2><p className="m15c-sub">Fewer study sessions kept than planned. Ask what got in the way.</p></div></div>
          <ul className="m15c-list">{d.stalled.map(r => row(r, r.adherence + "% kept", "is-bad"))}</ul>
        </section>
      )}
      <p className="m15c-sub">{d.live} plan{d.live === 1 ? "" : "s"} live in your care.</p>
    </>
  );
}

function Mp15CPlan({ subjectId, term, onBack }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const load = React.useCallback(() => { setErr(null); return NGGApi.member.mentorPlan(subjectId, term).then(setD).catch(setErr); }, [subjectId, term]);
  React.useEffect(() => { load(); }, [load]);
  const act = kind => {
    if (busy) return;
    if (kind === "return" && note.trim().length < 4) { setMsg(MP15C_ERR.note_required); return; }
    setBusy(kind); setMsg("");
    const call = kind === "approve" ? NGGApi.member.mentorPlanApprove(d.record.plan.planId, note.trim()) : NGGApi.member.mentorPlanReturn(d.record.plan.planId, note.trim());
    call.then(r => { setNote(""); setMsg(kind === "approve" ? "Approved. The plan is live" + (r && r.family ? ", and the family has been sent it." : ".") : "Sent back with your note."); load(); })
      .catch(e => setMsg(mp15cErr(e))).finally(() => setBusy(""));
  };
  const back = <button type="button" className="m15c-back" onClick={onBack}><i className="ph ph-caret-left" aria-hidden="true"/>All plans</button>;
  if (err) return <>{back}<div className="m15c-card m15c-msg" role="alert"><span>{mp15cErr(err, "Couldn't load the plan.")}</span><button type="button" className="m15c-btn" onClick={load}>Retry</button></div></>;
  if (!d) return <>{back}<div className="m15c-card m15c-msg" role="status"><span className="m15x-bar"/></div></>;
  const rec = d.record || {}, plan = rec.plan, k = rec.kpis || {};
  const first = String(d.member.fullName || "").split(/\s+/)[0];
  const waiting = plan && plan.status === "sent";
  return (
    <>
      {back}
      <section className="m15c-card">
        <div className="m15c-head"><div><h2 className="m15c-h">{d.member.fullName}</h2>
          <p className="m15c-sub">{rec.termLabel}{plan ? " · " + ({ sent: "waiting for you", live: "live", draft: "with " + first, closed: "closed" }[plan.status] || plan.status) : ""}</p></div>
          {rec.upload && rec.upload.fileUrl && <a className="m15c-btn" href={rec.upload.fileUrl} target="_blank" rel="noopener"><i className="ph ph-file" aria-hidden="true"/>Report card</a>}</div>
        <div className="m15c-kpis">
          <div><small>Average</small><b>{k.avg == null ? "—" : k.avg}</b></div>
          <div><small>Since last term</small><b>{k.change == null ? "—" : (k.change > 0 ? "+" : "") + k.change}</b></div>
          <div><small>Subjects</small><b>{(rec.subjects || []).length}</b></div>
        </div>
        {(rec.subjects || []).length > 0 && (
          <table className="m15c-table"><thead><tr><th scope="col">Subject</th><th scope="col">Score</th><th scope="col">Last term</th></tr></thead>
            <tbody>{rec.subjects.map(x => <tr key={x.name}><td>{x.name}</td><td className="m15c-num">{x.score == null ? "—" : x.score}</td><td className="m15c-num">{x.last == null ? "—" : x.last}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="m15c-card">
        <h2 className="m15c-h">The plan</h2>
        {!plan ? <p className="m15c-empty">{first} hasn't written a plan for this term yet.</p> : <>
          <ol className="m15c-items">{plan.items.map(it => (
            <li key={it.itemId}><div className="m15c-row-static"><b>{it.subject}</b><span className="m15c-num">{it.current == null ? "—" : it.current} → {it.target}</span></div>
              <p>{it.methodLabel ? it.methodLabel + " · " : ""}{it.what}</p>
              <small className="m15c-sub">{it.whenWhere} · {it.sessionsPerWeek} a week{plan.status === "live" ? " · " + it.doneThisWeek + " done this week" : ""}</small></li>
          ))}</ol>
          {plan.habit && <p><b>Habit for the term:</b> {plan.habit}</p>}
          {plan.status === "live" && plan.adherence != null && <p className="m15c-sub">{plan.adherence}% of study sessions kept so far.</p>}
          {plan.recipients && plan.recipients.family && <p className="m15c-sub">{first} chose to share it with their family once you approve it.</p>}
          {waiting && d.canApprove && (
            <div className="m15c-decide">
              <label className="m15c-field"><span className="m15c-label">A note for {first} <small>(needed to send it back)</small></span>
                <textarea className="m15c-input" rows={3} maxLength={600} value={note} onChange={e => setNote(e.target.value)}/></label>
              <div className="m15c-actions">
                <button type="button" className="m15c-btn is-primary" disabled={!!busy} onClick={() => act("approve")}>{busy === "approve" ? "Approving…" : "Approve the plan"}</button>
                <button type="button" className="m15c-btn" disabled={!!busy} onClick={() => act("return")}>{busy === "return" ? "Sending…" : "Send it back"}</button>
              </div>
            </div>
          )}
          {waiting && !d.canApprove && <p className="m15c-sub">{MP15C_ERR.peer_cannot_approve}</p>}
          {msg && <p className="m15c-ok" role="status">{msg}</p>}
          {(rec.notes || []).length > 0 && <div className="m15c-notes">{rec.notes.map((n, i) => <article key={i} className="m15c-note"><b>{n.who}</b><p>{n.text}</p></article>)}</div>}
        </>}
      </section>
    </>
  );
}

/* ── Curriculum: answers to mark, and the lessons for their courses ──────── */

function Mp15CCurric({ say }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [open, setOpen] = React.useState("");
  const [marks, setMarks] = React.useState({});
  const [busy, setBusy] = React.useState(0);
  const load = React.useCallback(() => { setErr(null); return NGGApi.member.curriculumStaff().then(setD).catch(setErr); }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <div className="m15c-card m15c-msg" role="alert"><span>{mp15cErr(err, "Couldn't load the curriculum.")}</span><button type="button" className="m15c-btn" onClick={load}>Retry</button></div>;
  if (!d) return <div className="m15c-card m15c-msg" role="status"><span className="m15x-bar"/><span className="m15x-sr">Loading the curriculum</span></div>;
  const setMark = (pid, cid, k, v) => setMarks(x => ({ ...x, [pid]: { ...(x[pid] || {}), [cid]: { ...((x[pid] || {})[cid] || {}), [k]: v } } }));
  const save = async item => {
    const mk = marks[item.progressId] || {};
    if (item.checks.some(c => !mk[c.checkId] || mk[c.checkId].points === undefined || mk[c.checkId].points === "")) { say && say("Give every answer a mark first."); return; }
    setBusy(item.progressId);
    try {
      const out = {}; item.checks.forEach(c => { out[c.checkId] = { points: Number(mk[c.checkId].points), feedback: mk[c.checkId].feedback || "" }; });
      const r = await NGGApi.member.curriculumMark(item.progressId, out);
      say && say((r.status === "completed" ? "Marked — lesson complete (" : "Marked — ") + r.pct + "%" + (r.status === "completed" ? ")" : "") + " · " + item.memberName);
      load();
    } catch (e) { say && say(mp15cErr(e)); } finally { setBusy(0); }
  };
  return (
    <>
      <section className="m15c-card">
        <div className="m15c-head"><div><h2 className="m15c-h">Answers to mark <span className="m15c-count">{d.pending.length}</span></h2>
          <p className="m15c-sub">Written answers your members submit wait here for a mark and a line of feedback.</p></div></div>
        {!d.pending.length ? <p className="m15c-empty">Nothing waiting to be marked.</p> : d.pending.map(item => (
          <div key={item.progressId} className="m15c-mark">
            <h3 className="m15c-h3">{item.memberName} · {item.unitTitle}</h3>
            {item.checks.map(c => (
              <div key={c.checkId} className="m15c-q">
                {c.flag === "safeguarding" && <p className="m15c-err" role="alert">Safeguarding: this answer may describe harm or risk, so it was not marked automatically. Read it and follow the safeguarding procedure before marking.</p>}
                <p className="m15c-q-p">{c.prompt} <span className="m15c-tag">{c.points} pt{c.points === 1 ? "" : "s"}</span></p>
                <blockquote>{c.answer || "(no answer)"}</blockquote>
                {(c.modelAnswer || c.rubric) && <p className="m15c-sub">Model answer: {c.modelAnswer}{c.rubric ? " · Rubric: " + c.rubric : ""}</p>}
                <div className="m15c-q-row">
                  <label className="m15c-pts">Mark <input type="number" min={0} max={c.points} className="m15c-input" value={((marks[item.progressId] || {})[c.checkId] || {}).points ?? ""} onChange={e => setMark(item.progressId, c.checkId, "points", e.target.value)}/> of {c.points}</label>
                  <input className="m15c-input" placeholder="A line of feedback (optional)" aria-label="Feedback" value={((marks[item.progressId] || {})[c.checkId] || {}).feedback || ""} onChange={e => setMark(item.progressId, c.checkId, "feedback", e.target.value)}/>
                </div>
              </div>
            ))}
            <button type="button" className="m15c-btn is-primary" disabled={busy === item.progressId} onClick={() => save(item)}>{busy === item.progressId ? "Saving…" : "Save marks"}</button>
          </div>
        ))}
      </section>
      <section className="m15c-card">
        <div className="m15c-head"><div><h2 className="m15c-h">Lessons</h2><p className="m15c-sub">For your courses · {d.members} member{d.members === 1 ? "" : "s"}{d.clearance === "pending" ? " · learners appear once your safeguarding check is cleared" : ""}</p></div></div>
        {!d.units.length ? <p className="m15c-empty">No published lessons for your courses yet.</p> : (
          <ul className="m15c-list">{d.units.map(u => (
            <li key={u.unitId}>
              <button type="button" className="m15c-row" aria-expanded={open === u.unitId} onClick={() => setOpen(open === u.unitId ? "" : u.unitId)}>
                <span><b>Week {u.week} · {u.title}</b><small>{u.course || "Whole Club"}</small></span>
                <span className="m15c-tag">{u.stats.completed} of {u.stats.audience} done</span><i className={"ph ph-caret-" + (open === u.unitId ? "up" : "down")} aria-hidden="true"/></button>
              {open === u.unitId && (
                <div className="m15c-lesson">
                  {u.summary && <p>{u.summary}</p>}
                  {u.objectives.length > 0 && <ul>{u.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>}
                  {typeof CurriculumText === "function" && <CurriculumText text={u.body}/>}
                  {typeof CurriculumMaterials === "function" && <CurriculumMaterials materials={u.materials}/>}
                  {u.checks.length > 0 && <p className="m15c-sub">{u.checks.length} check{u.checks.length === 1 ? "" : "s"} · pass mark {u.passMark}%</p>}
                  {typeof StaffMaterialForm === "function" && <StaffMaterialForm unitId={u.unitId} selfApprove={!!d.selfApprove} onDone={load}/>}
                </div>
              )}
            </li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
