/* ============================================================================
   Timetable Maker v5 — the layers.

   Every layer is a TtLayer: a modal dialog that traps focus and hands it back
   to whatever opened it, with its geometry decided by the breakpoint — a
   bottom sheet on a phone, a drawer or a centred dialog wider up (§5.4, §6.6).
   They are mounted in a fixed order so the one that closes first with Back or
   Esc (§3.5) is also the one drawn on top.
   ========================================================================== */

function TtLayers({ C }) {
  const L = C.layers;
  return <>
    {L.fs && <TtFullScreen C={C}/>}
    {L.more && C.bp === "phone" && <TtMoreSheet C={C}/>}
    {L.form && <TtClassForm C={C} init={L.form}/>}
    {L.import && <TtImport C={C} init={L.import}/>}
    {L.plan && <TtPlan C={C}/>}
    {L.download && <TtDownload C={C} init={L.download}/>}
    {L.save && <TtSave C={C} init={L.save}/>}
    {L.sync && C.sync && <TtSyncReview C={C}/>}
    {L.keys && <TtKeys C={C}/>}
  </>;
}

/** Dialog geometry by breakpoint (§5.4, §6.6). */
function ttDialogVariant(C) { return C.bp === "phone" ? "sheet" : "centre"; }

function TtLayerHead({ id, title, sub, onClose, back }) {
  return (
    <div className={"tt-lhead" + (sub ? " tt-lhead--sub" : "")}>
      {back && <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round" aria-label={back.label} onClick={back.onClick}><TtIcon name="caret-left"/></button>}
      <div className="tt-lhead-text">
        <h2 id={id} className="tt-lhead-title">{title}</h2>
        {sub && <span className="tt-lhead-sub">{sub}</span>}
      </div>
      <TtClose onClick={onClose}/>
    </div>
  );
}

/* ── The class form (§7.3) ── */

function TtClassForm({ C, init }) {
  const [f, setF] = React.useState(() => Object.assign({ place: "", once: false }, init));
  const [err, setErr] = React.useState("");
  const set = (k, v) => { setErr(""); setF(p => Object.assign({}, p, { [k]: k === "days" && p.once ? v.slice(-1) : v })); };
  const a = ttMin(f.start), b = ttMin(f.end);
  const clash = a !== null && b !== null ? C.entries.filter(x => x.id !== f.id && x.days.some(d => f.days.includes(d)) && ttMin(x.start) < b && a < ttMin(x.end)) : [];
  const th = TT_THEMES[C.s.theme] || TT_THEMES.paper;
  const off = f.ctxOff || 0;
  const kind = f.kind || ttKindOf(f);
  const onceDay = f.days[0] || f.ctxDay || C.T.day;
  const skipKey = f.id + ":" + f.ctxDay;
  const skipped = !!ttWeekEx(C.ex, off, C.now).skip[skipKey];
  const showSkip = !!f.id && !f.origOnce && !!f.ctxDay && f.days.includes(f.ctxDay);
  const places = [...new Set(C.entries.map(e => e.place).filter(Boolean))];
  const variant = C.bp === "phone" ? "sheet-tall" : C.bp === "tablet" ? "form-right" : "form-left";
  const scrim = C.bp === "phone" ? "phone" : C.bp === "tablet" ? "drawer" : "form";
  const submit = e => { e.preventDefault(); const r = C.saveForm(f); if (r) setErr(r); };
  return (
    <TtLayer as="form" variant={variant} scrim={scrim} labelledBy="tt-form-h" onClose={() => C.close("form")} onSubmit={submit}
      className="tt-form" initialFocus={f.id || f.title ? ".tt-form-close" : "#tt-form-name"}>
      <div className="tt-lhead tt-lhead--line">
        <div className="tt-lhead-text"><h2 id="tt-form-h" className="tt-lhead-title">{f.id ? "Edit class" : "Add a class"}</h2></div>
        {f.official && <span className="tt-official"><TtIcon name="seal-check"/>From {f.source}</span>}
        <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round tt-form-close" aria-label="Close" onClick={() => C.close("form")}><TtIcon name="x"/></button>
      </div>
      <div className="tt-lbody">
        <div className="tt-col tt-col--16">
          <label className="tt-field">
            <span className="tt-field-label">Name</span>
            <input id="tt-form-name" className="tt-input tt-input--ctl" list="tt-subjects" value={f.title} maxLength={60} enterKeyHint="next" autoComplete="off" placeholder="Mathematics, Piano, Football…" onChange={e => set("title", e.target.value)}/>
            <datalist id="tt-subjects">{TT_SUBJECTS.map(x => <option key={x} value={x}/>)}</datalist>
          </label>
          <div role="radiogroup" aria-label="Type" className="tt-kinds">
            {TT_KIND_IDS.map(k => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={"tt-kind" + (kind === k ? " is-on" : "")} onClick={() => set("kind", k)}>
                <TtIcon name={TT_KINDS[k][1]}/>{TT_KINDS[k][0]}
              </button>
            ))}
          </div>
          <fieldset className="tt-fieldset">
            <legend className="tt-field-label">Days</legend>
            <div className="tt-days">
              {ttDayOrder(C.s.weekStart).map(([d, name, short]) => {
                const on = f.days.includes(d);
                return <button key={d} type="button" aria-pressed={on} aria-label={name} className={"tt-dayt" + (on ? " is-on" : "")}
                  onClick={() => set("days", on ? f.days.filter(x => x !== d) : f.days.concat([d]).sort((x, y) => x - y))}>{short}</button>;
              })}
            </div>
          </fieldset>
          <div className="tt-pair">
            <label className="tt-field"><span className="tt-field-label">Starts</span>
              <input type="time" step="300" className="tt-input tt-input--ctl" value={f.start} onChange={e => {
                const v = e.target.value, len = a !== null && b !== null && b > a ? b - a : 60;
                setErr(""); setF(p => Object.assign({}, p, { start: v, end: ttMin(v) !== null ? ttHhmm(Math.min(ttMin(v) + len, 1439)) : p.end }));
              }}/></label>
            <label className="tt-field"><span className="tt-field-label">Ends · {a !== null && b !== null && b > a ? ttDur(b - a) : "—"}</span>
              <input type="time" step="300" className="tt-input tt-input--ctl" value={f.end} onChange={e => set("end", e.target.value)}/></label>
          </div>
          {(!f.id || f.origOnce) && (
            <TtSeg label="Repeats" track="box" size="ctl" value={!!f.once} className="tt-seg--full"
              onChange={v => setF(p => Object.assign({}, p, { once: v, days: v ? [p.days[0] || p.ctxDay || C.T.day] : p.days }))}
              options={[{ value: false, label: "Every week" }, { value: true, label: "Only " + ttDshort(ttDateFor(onceDay, off, C.now)).replace(",", "") }]}/>
          )}
          {showSkip && (
            <button type="button" className="tt-skipbtn" onClick={() => C.toggleSkip(f, f.ctxDay, off)}>
              <TtIcon name={skipped ? "calendar-check" : "calendar-x"} className="tt-gold-ink"/>
              <span className="tt-grow">{(skipped ? "Put back on " : "Skip just ") + ttDshort(ttDateFor(f.ctxDay, off, C.now)).replace(",", "")}</span>
              <span className="tt-skipbtn-note">Only that day</span>
            </button>
          )}
          <label className="tt-field">
            <span className="tt-field-label">Where <span className="tt-field-opt">· optional</span></span>
            <input className="tt-input tt-input--ctl" list="tt-places" value={f.place} maxLength={60} enterKeyHint="done" autoComplete="off" placeholder="Room, lab, field…" onChange={e => set("place", e.target.value)}/>
            <datalist id="tt-places">{places.map(x => <option key={x} value={x}/>)}</datalist>
          </label>
          <fieldset className="tt-fieldset">
            <legend className="tt-field-label">Colour</legend>
            <div role="radiogroup" aria-label="Colour" className="tt-swatches">
              {th.pal.map((c, i) => (
                <button key={i} type="button" role="radio" aria-checked={f.color === i} aria-label={TT_COLOUR_NAMES[i]} className={"tt-swatchbtn" + (f.color === i ? " is-on" : "")} onClick={() => set("color", i)}>
                  <span style={{ background: c }}/>
                </button>
              ))}
            </div>
          </fieldset>
          {clash.length > 0 && <span role="status" className="tt-formclash"><TtIcon name="warning"/>Overlaps {clash.map(x => x.title).join(", ")}. Both will show side by side.</span>}
          {err && <span role="alert" className="tt-err"><TtIcon name="warning-circle"/>{err}</span>}
        </div>
      </div>
      <div className="tt-lfoot tt-lfoot--form">
        {f.id && <button type="button" className="tt-delbtn" aria-label="Remove class" title="Remove" onClick={() => C.removeEntry(f)}><TtIcon name="trash"/></button>}
        <button type="submit" className="tt-btn tt-btn--primary tt-btn--cta tt-btn--grow">{f.id ? "Save changes" : "Add class"}</button>
      </div>
    </TtLayer>
  );
}

/* ── Import (§7.7) ── */

/** The sample school week, for somebody who wants to see the maker working before typing. */
function ttSampleWeek() {
  const E = (title, days, start, end, place, color) => ({ id: ttUid(), title, days, start, end, place, color, kind: ttKindOf({ title }) });
  return [E("Mathematics", [1, 3, 5], "08:00", "09:00", "Room 4", 0), E("Basic Science", [2, 4], "08:00", "09:00", "Lab", 1), E("English", [1, 2, 4], "09:00", "10:00", "Room 2", 3),
    E("Social Studies", [3], "09:00", "10:00", "Room 2", 5), E("Computer Studies", [5], "09:00", "10:30", "ICT room", 6), E("Break", [1, 2, 3, 4, 5], "10:30", "11:00", "", 7),
    E("French", [1, 3], "11:00", "12:00", "Room 6", 4), E("Civic Education", [2, 4], "11:00", "12:00", "Room 3", 2), E("PE", [5], "11:00", "12:30", "Field", 1), E("Homework club", [1, 3], "14:00", "15:00", "Library", 4)];
}

function TtImport({ C, init }) {
  const [centres, setCentres] = React.useState(null);
  const [slug, setSlug] = React.useState(init.slug || "");
  const [busy, setBusy] = React.useState(false);
  const [fail, setFail] = React.useState(init.failed ? (init.slug || "") : "");
  const [paste, setPaste] = React.useState("");
  const [listErr, setListErr] = React.useState(false);
  const pasteRef = React.useRef(null);
  const loadList = () => {
    setListErr(false);
    NGGApi.public.timetable("").then(r => { setCentres(r.centres || []); if (!slug && r.centres && r.centres[0]) setSlug(r.centres[0].slug); }).catch(() => setListErr(true));
  };
  React.useEffect(loadList, []);
  React.useEffect(() => { if (init.tab === "paste") setTimeout(() => pasteRef.current && pasteRef.current.focus(), 60); }, []);
  const name = (centres || []).find(c => c.slug === slug);
  const add = async () => {
    if (!slug) return;
    setBusy(true); setFail("");
    try { await C.addCentre(slug); C.close("import"); }
    catch (_) { setFail(slug); }
    finally { setBusy(false); }
  };
  const pr = paste.trim() ? ttParseRows(paste, C.entries.length) : null;
  const ownN = C.entries.filter(e => !e.official).length;
  const failName = ((centres || []).find(c => c.slug === fail) || {}).name || "the centre";
  return (
    <TtLayer variant={ttDialogVariant(C)} scrim="phone" labelledBy="tt-im-h" onClose={() => C.close("import")} initialFocus={init.tab === "paste" ? "textarea" : "select"}>
      <TtLayerHead id="tt-im-h" title="Import classes" onClose={() => C.close("import")}/>
      <div className="tt-lbody tt-lbody--safe">
        <div className="tt-col tt-col--18">
          <div className="tt-col tt-col--8">
            <span className="tt-field-label">Your NGG centre’s sessions</span>
            <div className="tt-row8">
              <select className="tt-input tt-input--ctl tt-select tt-grow" aria-label="NGG centre" value={slug} disabled={!centres} onChange={e => { setSlug(e.target.value); setFail(""); }}>
                {!centres && <option value="">{listErr ? "Couldn’t load the centres" : "Loading centres…"}</option>}
                {(centres || []).map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <button type="button" className="tt-btn tt-btn--primary tt-btn--ctl" disabled={!slug || busy} onClick={add}>{busy ? "Adding…" : "Add"}</button>
            </div>
            {fail && (
              <span role="alert" className="tt-err tt-err--inline">
                <TtIcon name="warning-circle"/><span className="tt-grow">Couldn’t load {failName}’s sessions. Check your connection and try again.</span>
                <button type="button" className="tt-textbtn" onClick={add}>Try again</button>
              </span>
            )}
            {listErr && <span role="alert" className="tt-err tt-err--inline"><TtIcon name="warning-circle"/><span className="tt-grow">Couldn’t load the centres. Check your connection and try again.</span><button type="button" className="tt-textbtn" onClick={loadList}>Try again</button></span>}
            <span className="tt-help">They stay in step with the centre. If it changes a session, you’re asked first.</span>
          </div>
          <div className="tt-col tt-col--8">
            <label className="tt-field-label" htmlFor="tt-paste">Paste from a spreadsheet or WhatsApp</label>
            <textarea id="tt-paste" ref={pasteRef} className="tt-paste" rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder="Mon, Wed  8:00-9:00  Mathematics  Room 4" aria-label="Rows to paste"/>
            <span className="tt-help" role="status">{pr ? "Found " + pr.rows.length + " class" + (pr.rows.length === 1 ? "" : "es") + (pr.skipped.length ? " · skipped " + pr.skipped.join("; ") : "") : "One class per line: days, times, name, then room."}</span>
            {pr && pr.rows.length > 0 && (
              <button type="button" className="tt-btn tt-btn--primary tt-btn--ctl" onClick={() => {
                C.commit(d => Object.assign({}, d, { entries: d.entries.concat(pr.rows), s: d.s.mode ? d.s : Object.assign({}, d.s, { mode: "school" }) }), "Added " + pr.rows.length + " class" + (pr.rows.length === 1 ? "" : "es"), true);
                C.setDay(null); C.close("import");
              }}>Add {pr.rows.length} class{pr.rows.length === 1 ? "" : "es"}</button>
            )}
          </div>
          {ownN === 0 && (
            <button type="button" className="tt-linkbtn" onClick={() => {
              C.commit(d => Object.assign({}, d, { entries: d.entries.filter(x => x.official).concat(ttSampleWeek()),
                s: d.entries.length ? Object.assign({}, d.s, { mode: d.s.mode || "school" }) : Object.assign({}, d.s, { title: "My school week", subtitle: d.s.subtitle, mode: d.s.mode || "school" }) }), "Added a sample school week", true);
              C.setDay(null); C.close("import");
            }}>Or use a sample school week</button>
          )}
        </div>
      </div>
    </TtLayer>
  );
}

/* ── Plan study time (§7.6) ── */

function TtPlan({ C }) {
  const [P, setP] = React.useState({ subjects: null, per: 3, len: 45, win: "after" });
  const pool = ttSubjectPool(C.entries);
  const picked = P.subjects || pool.slice(0, 3);
  const planned = React.useMemo(() => ttPlanStudy(C.entries, { subjects: picked, per: P.per, len: P.len, win: P.win }), [C.entries, picked.join("|"), P.per, P.len, P.win]);
  const th = TT_THEMES[C.s.theme] || TT_THEMES.paper;
  const set = (k, v) => setP(p => Object.assign({}, p, { [k]: v }));
  const segH = C.bp === "phone" ? "44" : "36";
  return (
    <TtLayer variant={ttDialogVariant(C)} scrim="phone" labelledBy="tt-pl-h" onClose={() => C.close("plan")}>
      <TtLayerHead id="tt-pl-h" title="Plan study time" sub="Fits sessions into your free time, around everything already on." onClose={() => C.close("plan")}/>
      <div className="tt-lbody">
        <div className="tt-col tt-col--16">
          <div className="tt-col tt-col--8">
            <span className="tt-field-label" id="tt-pl-subj">Subjects</span>
            <div className="tt-chiprow tt-chiprow--wrap" role="group" aria-labelledby="tt-pl-subj">
              {pool.map(t => {
                const on = picked.includes(t);
                return <button key={t} type="button" aria-pressed={on} className={"tt-chip tt-chip--" + segH + (on ? " is-on" : "")} onClick={() => set("subjects", on ? picked.filter(x => x !== t) : picked.concat([t]))}>{t}</button>;
              })}
            </div>
          </div>
          {[["Sessions a week", "per", [[2, "2"], [3, "3"], [4, "4"], [5, "5"]]], ["Each session", "len", [[30, "30 min"], [45, "45 min"], [60, "1 hour"]]], ["When", "win", [["after", "After school"], ["evening", "Evenings"], ["weekend", "Weekends"]]]].map(([l, k, opts]) => (
            <div key={k} className="tt-col tt-col--6">
              <span className="tt-field-label">{l}</span>
              <TtSeg label={l} track="box" size={segH} value={P[k]} className="tt-seg--full" onChange={v => set(k, v)} options={opts.map(([value, label]) => ({ value, label }))}/>
            </div>
          ))}
          <div className="tt-col tt-col--6">
            <span className="tt-field-label">{planned.length ? planned.length + " sessions fit" : "Nothing fits yet"}</span>
            <div className="tt-planlist">
              {planned.map((p, i) => (
                <div key={i} className="tt-planrow">
                  <span className="tt-planrow-when">{TT_DAYS[p.days[0] - 1][2] + " " + ttFmt(ttMin(p.start), C.s.clock)}</span>
                  <span className="tt-planrow-dot" style={{ background: th.pal[p.color] || th.pal[7] }}/>
                  <span className="tt-planrow-title">{p.title}</span>
                </div>
              ))}
              {!planned.length && <div className="tt-planlist-none">No free time in that window. Try evenings or weekends.</div>}
            </div>
          </div>
        </div>
      </div>
      <div className="tt-lfoot">
        <button type="button" className="tt-btn tt-btn--primary tt-btn--cta tt-btn--grow" disabled={!planned.length} onClick={() => {
          C.commit(d => Object.assign({}, d, { entries: d.entries.concat(planned) }), "Added " + planned.length + " study sessions", true);
          C.setSuggOff(true); C.close("plan");
        }}>{planned.length ? "Add " + planned.length + " study sessions" : "Nothing to add"}</button>
      </div>
    </TtLayer>
  );
}

/* ── Save (§7.9). Member sign-in is the site's own one-time code; there is no second OTP system. ── */

function TtSave({ C, init }) {
  const [step, setStep] = React.useState(init.step || "choose");
  const [who, setWho] = React.useState(init.who || "member");
  const [ident, setIdent] = React.useState("");
  const [code, setCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [masked, setMasked] = React.useState("");
  const [wait, setWait] = React.useState(0);
  React.useEffect(() => { if (wait <= 0) return undefined; const id = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(id); }, [wait]);
  const human = e => (typeof humanizeAuthError === "function" ? humanizeAuthError(e && (e.code || e.message)) : "That didn’t work, try again.");
  const m = C.member;
  const closeIt = () => C.close("save");
  const sendCode = async () => {
    setBusy(true); setErr("");
    try { const r = await NGGApi.auth.request(ident.trim()); setMasked(r.masked || ""); setStep("code"); setWait(45); setCode(""); }
    catch (e) { setErr(human(e)); }
    finally { setBusy(false); }
  };
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (step === "choose" && who === "member") {
      if (ident.trim().length < 3) { setErr("Enter your member ID, like NGG-2025-0042, or your email."); return; }
      return sendCode();
    }
    if (step === "choose") {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("That email looks incomplete."); return; }
      setBusy(true); setErr("");
      try { await C.keepByEmail(email.trim()); setStep("emailDone"); }
      catch (_) { setErr("Couldn’t save. Changes are kept here."); }
      finally { setBusy(false); }
      return;
    }
    if (step === "code") {
      if (!/^\d{6}$/.test(code)) { setErr("Enter all 6 digits."); return; }
      setBusy(true); setErr("");
      try {
        await NGGApi.auth.verify({ memberId: ident.trim(), otp: code });
        if (C.refreshAuth) await C.refreshAuth();
        await C.keepInAccount();
        setStep("memberDone");
      } catch (x) { setErr(human(x)); }
      finally { setBusy(false); }
    }
  };
  const confirm = async () => { setBusy(true); try { await C.keepInAccount(); closeIt(); C.say("Saved to your account"); } finally { setBusy(false); } };
  const first = C.firstName || (m && String(m.fullName || "").split(" ")[0]) || "your";
  let title, text;
  if (step === "confirm") { title = "Save to your NGG account"; text = "Signed in as " + (m ? m.fullName : "") + " · " + (m ? (m.displayId || m.memberId) : "") + "."; }
  else if (step === "choose") { title = "Keep this timetable"; text = "It’s only in this browser right now. Save it to open it anywhere."; }
  else if (step === "code") { title = "Check your email"; text = "We sent a 6-digit code to " + (masked || "the email on " + ident.trim()) + "."; }
  else if (step === "memberDone") { title = "Saved to " + first + "’s account"; text = "You’re signed in, and changes now save as you go."; }
  else { title = "Check your email"; text = "We sent a link to " + email.trim() + "."; }
  const field = (props) => <input {...props} className={"tt-input tt-input--ctl" + (err ? " is-invalid" : "")} aria-invalid={err ? "true" : undefined} aria-describedby={err ? "tt-sv-err" : undefined}/>;
  return (
    <TtLayer variant={ttDialogVariant(C)} scrim="phone" labelledBy="tt-sv-h" onClose={closeIt}>
      <TtLayerHead id="tt-sv-h" title={title} sub={text} onClose={closeIt}/>
      <div className="tt-lbody tt-lbody--safe">
        <div className="tt-col tt-col--14">
          {step === "confirm" && <>
            <div className="tt-points">
              {[["house-line", "It shows on your member dashboard."], ["users-three", "Your parent or guardian sees it in the family app."], ["arrows-clockwise", "If your centre changes a session, you’re asked before anything changes here."]].map(([i, t]) => <span key={i} className="tt-point"><TtIcon name={i}/><span>{t}</span></span>)}
            </div>
            <button type="button" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy} onClick={confirm}>Save to my account</button>
          </>}
          {step === "choose" && <>
            <div role="radiogroup" aria-label="Are you an NGG member?" className="tt-who">
              {[["member", "identification-badge", "I’m an NGG member", "Add it to my member account"], ["guest", "envelope-simple", "I’m not a member", "Save it with my email"]].map(([k, icon, l, d]) => (
                <button key={k} type="button" role="radio" aria-checked={who === k} className={"tt-whocard" + (who === k ? " is-on" : "")} onClick={() => { setWho(k); setErr(""); }}>
                  <TtIcon name={icon} className="tt-gold-ink"/><b>{l}</b><span>{d}</span>
                </button>
              ))}
            </div>
            <form className="tt-col tt-col--10" onSubmit={submit} noValidate>
              {who === "member" ? <>
                <label className="tt-field"><span className="tt-field-label">Member ID or email</span>
                  {field({ value: ident, autoComplete: "username", enterKeyHint: "send", placeholder: "NGG-2025-0042 or you@example.com", onChange: e => { setIdent(e.target.value); setErr(""); } })}</label>
                {err && <span id="tt-sv-err" role="alert" className="tt-err">{err}</span>}
                <button type="submit" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
              </> : <>
                <label className="tt-field"><span className="tt-field-label">Email</span>
                  {field({ type: "email", inputMode: "email", value: email, autoComplete: "email", enterKeyHint: "send", placeholder: "you@example.com", onChange: e => { setEmail(e.target.value); setErr(""); } })}</label>
                {err && <span id="tt-sv-err" role="alert" className="tt-err">{err}</span>}
                <button type="submit" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button>
                <span className="tt-help">No membership needed. Open the link on any phone or computer to keep editing.</span>
              </>}
            </form>
          </>}
          {step === "code" && (
            <form className="tt-col tt-col--10" onSubmit={submit} noValidate>
              <label className="tt-field"><span className="tt-field-label">6-digit code</span>
                <input className={"tt-input tt-code" + (err ? " is-invalid" : "")} value={code} inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" enterKeyHint="done" maxLength={6}
                  aria-invalid={err ? "true" : undefined} aria-describedby={err ? "tt-sv-err" : undefined} onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }} autoFocus/></label>
              {err && <span id="tt-sv-err" role="alert" className="tt-err">{err}</span>}
              <button type="submit" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy}>{busy ? "Signing in…" : "Sign in and save"}</button>
              <div className="tt-coderow">
                <button type="button" className="tt-linkbtn" onClick={() => { setStep("choose"); setCode(""); setErr(""); }}>Use a different ID</button>
                {wait > 0 ? <span className="tt-help" aria-live="off">Resend in {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, "0")}</span>
                  : <button type="button" className="tt-linkbtn" onClick={sendCode} disabled={busy}>Send a new code</button>}
              </div>
            </form>
          )}
          {(step === "memberDone" || step === "emailDone") && <>
            <div className="tt-points tt-points--ok">
              {(step === "memberDone"
                ? [["house-line", "It’s on your member dashboard."], ["users-three", "Your family app shows it too."]]
                : [["link-simple", "Open it on any phone or computer to keep editing."], ["device-mobile", "This browser keeps saving changes in the meantime."]]
              ).map(([i, t]) => <span key={i} className="tt-point"><TtIcon name={i}/><span>{t}</span></span>)}
            </div>
            <button type="button" className="tt-btn tt-btn--primary tt-btn--cta" onClick={closeIt}>Done</button>
            {step === "emailDone" && <a className="tt-joinlink" href="/join" onClick={e => { if (C.setPage) { e.preventDefault(); closeIt(); goApply(C.setPage, "anchor"); } }}>Curious about NGG? See how to join</a>}
          </>}
        </div>
      </div>
    </TtLayer>
  );
}

/* ── Downloads (§7.8) ── */

const TT_FORMATS = [
  { id: "pdf", icon: "file-pdf", name: "Poster PDF", short: "PDF", desc: "A4 or Letter, for the wall or the fridge" },
  { id: "share", icon: "image", name: "Share image", short: "Image", desc: "Portrait card sized for WhatsApp and status" },
  { id: "phone", icon: "device-mobile", name: "Phone wallpaper", short: "Wallpaper", desc: "A lock-screen list that leaves room for the clock" },
  { id: "ics", icon: "calendar-plus", name: "Calendar file", short: "Calendar", desc: "Every class repeats in your phone’s calendar" },
  { id: "link", icon: "link-simple", name: "Share link", short: "Link", desc: "Others get their own copy to change" },
];

function TtDownload({ C, init }) {
  const phone = C.bp === "phone";
  const [fmt, setFmt] = React.useState(init.format || "pdf");
  const [step, setStep] = React.useState(phone ? (init.step || "list") : "detail");
  const [paper, setPaper] = React.useState("a4");
  const [wall, setWall] = React.useState("week");
  const termFrom = C.term && C.term.start, termTo = C.term && C.term.end;
  const today = ttYmd(C.now);
  const [icsFrom, setIcsFrom] = React.useState(termFrom && termFrom > today ? termFrom : ttWeekKey(0, C.now));
  const [icsUntil, setIcsUntil] = React.useState(termTo && termTo > today ? termTo : ttYmd(new Date(C.now.getTime() + 84 * 864e5)));
  const [remind, setRemind] = React.useState("10");
  const [busy, setBusy] = React.useState(false);
  const boxRef = React.useRef(null);
  const box = ttUseSize(boxRef, step === "detail");
  const f = TT_FORMATS.find(x => x.id === fmt) || TT_FORMATS[0];
  const vis = fmt === "pdf" || fmt === "share" || fmt === "phone";
  const model = React.useMemo(() => vis && step === "detail" ? ttPosterModel(C.doc, { kind: fmt === "pdf" ? "poster" : fmt, orient: C.s.orient, paper, today: false, live: false, wall, now: C.now }) : null, [vis, step, C.doc, fmt, C.s.orient, paper, wall, C.now]);
  const eo = ttOrientFor(C.s.orient, C.entries, C.s.weekStart), recO = ttOrientFor("auto", C.entries, C.s.weekStart);
  const nEv = C.entries.reduce((k, e) => k + e.days.length, 0);
  const weeks = Math.max(1, Math.round((new Date(icsUntil) - new Date(icsFrom)) / (7 * 864e5)) + 1);
  const overlapN = Object.keys(ttOverlaps(C.entries)).length;
  const link = fmt === "link" ? C.shareLink() : "";
  const segH = phone ? "44" : "38";
  const notes = [];
  if (fmt === "pdf") {
    notes.push(["lightbulb", eo === "portrait" ? "Portrait turns the week sideways: each day is a row and time runs across, so it fits a tall page without shrinking." : "Landscape gives each day a column with time running down."]);
    if (overlapN && C.s.layout === "timeline") notes.push(["warning", "Overlapping classes share their slot. List shows them one under another.", true]);
    notes.push(["text-aa", "Text stays sharp and searchable."]);
  }
  if (fmt === "share") notes.push(["lightbulb", "A card for each day with large type, so it reads on a phone without zooming."]);
  if (fmt === "phone") notes.push(["lightbulb", wall === "next" ? "Bigger text for just the next two days. Download again each week, or use the calendar file instead." : "The top third stays clear for your lock-screen clock."]);
  if (fmt === "link") notes.push(["shield-check", "Nothing is uploaded; the timetable lives inside the link."]);
  const file = { pdf: C.fileName + ".pdf · " + (paper === "letter" ? "Letter" : "A4") + " " + eo, share: C.fileName + ".png · 1080×1350", phone: C.fileName + "-wallpaper.png · 1080×2340",
    ics: C.fileName + ".ics · " + nEv + " weekly events", link: Math.round(link.length / 100) / 10 + "k characters" }[fmt];
  const cta = { pdf: "Download PDF", share: phone ? "Share image" : "Download image", phone: "Download", ics: "Add to calendar", link: phone ? "Share link" : "Copy link" }[fmt];
  const ctaIcon = fmt === "link" ? (phone ? "share-network" : "copy") : fmt === "share" && phone ? "share-network" : "download-simple";
  const go = async () => {
    setBusy(true);
    const ok = await C.exportFile(fmt, { paper, wall, icsFrom, icsUntil, remind: +remind });
    setBusy(false);
    if (ok) C.close("download");
  };
  const tag = x => x.id === "pdf" ? "Best for printing" : x.id === "phone" && C.member ? "For you" : "";
  return (
    <TtLayer variant={phone ? "sheet-tall" : "drawer-right"} scrim={phone ? "phone" : "drawer"} labelledBy="tt-ex-h" onClose={() => C.close("download")} className="tt-dl">
      <div className="tt-lhead tt-lhead--line">
        {phone && step === "detail" && <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round" aria-label="All formats" onClick={() => setStep("list")}><TtIcon name="caret-left"/></button>}
        <div className={"tt-lhead-text" + (phone && step === "detail" ? "" : " tt-lhead-text--pad")}><h2 id="tt-ex-h" className="tt-lhead-title">{phone && step === "detail" ? f.name : "Download or share"}</h2></div>
        <TtClose onClick={() => C.close("download")}/>
      </div>
      {!phone && (
        <div className="tt-fmtchips" role="tablist" aria-label="Format">
          {TT_FORMATS.map(x => <button key={x.id} type="button" role="tab" aria-selected={fmt === x.id} className={"tt-fmtchip" + (fmt === x.id ? " is-on" : "")} onClick={() => setFmt(x.id)}><TtIcon name={x.icon}/>{x.short}</button>)}
        </div>
      )}
      {phone && step === "list" && (
        <div className="tt-lbody tt-lbody--safe">
          <div className="tt-card">
            {TT_FORMATS.map(x => (
              <button key={x.id} type="button" className="tt-fmtrow" onClick={() => { setFmt(x.id); setStep("detail"); }}>
                <span className="tt-tile tt-tile--40 tt-tile--sand"><TtIcon name={x.icon}/></span>
                <span className="tt-fmtrow-text"><span className="tt-fmtrow-name"><b>{x.name}</b>{tag(x) && <TtPill tone="gold">{tag(x)}</TtPill>}</span><span>{x.desc}</span></span>
                <TtIcon name="caret-right" className="tt-chev"/>
              </button>
            ))}
          </div>
        </div>
      )}
      {step === "detail" && <>
        <div className="tt-lbody">
          <div className="tt-col tt-col--14">
            <span className="tt-dl-desc">{f.desc}.</span>
            {vis && (
              <div ref={boxRef} className="tt-dl-box">
                {model && box.w > 0 && <TtPosterStage model={model} width={Math.max(200, box.w - 32)} maxHeight={box.h - 32} className="tt-stage--dl" label={"Preview of the " + f.name.toLowerCase()}/>}
              </div>
            )}
            {fmt === "pdf" && <>
              <TtSegField label="Orientation" segH={segH} value={C.s.orient} onChange={v => C.setS("orient", v)} options={[["auto", "Auto · " + recO], ["landscape", "Landscape"], ["portrait", "Portrait"]]}/>
              <TtSegField label="Layout" segH={segH} value={C.s.layout} onChange={v => C.setS("layout", v)} options={[["timeline", "Timeline"], ["list", "List"]]}/>
              <TtSegField label="Paper" segH={segH} value={paper} onChange={setPaper} options={[["a4", "A4"], ["letter", "US Letter"]]}/>
            </>}
            {fmt === "phone" && <TtSegField label="Show" segH={segH} value={wall} onChange={setWall} options={[["week", "Whole week"], ["next", "Today & next day"]]}/>}
            {fmt === "ics" && <>
              <div className="tt-icsgrid">
                <label className="tt-field"><span className="tt-field-label">First week</span><input type="date" className={"tt-input tt-input--" + segH} value={icsFrom} onChange={e => setIcsFrom(e.target.value)}/></label>
                <label className="tt-field"><span className="tt-field-label">Last day of term</span><input type="date" className={"tt-input tt-input--" + segH} value={icsUntil} onChange={e => setIcsUntil(e.target.value)}/></label>
                <label className="tt-field"><span className="tt-field-label">Reminder</span>
                  <select className={"tt-input tt-select tt-input--" + segH} value={remind} onChange={e => setRemind(e.target.value)}>
                    <option value="0">None</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option>
                  </select></label>
              </div>
              <span className="tt-help tt-help--ink">{nEv} weekly events for about {weeks} weeks, in Lagos time (WAT).</span>
            </>}
            {fmt === "link" && <input readOnly className="tt-input tt-linkfield" value={link} aria-label="Share link" onFocus={e => e.target.select()}/>}
            {notes.map(([icon, t, warn]) => <span key={t} className={"tt-dlnote" + (warn ? " is-warn" : "")}><TtIcon name={icon}/><span>{t}</span></span>)}
          </div>
        </div>
        <div className="tt-lfoot tt-lfoot--dl">
          <span className="tt-dl-file">{file}</span>
          <button type="button" className={"tt-btn tt-btn--primary tt-btn--" + (phone ? "52" : "46")} disabled={busy} onClick={go}><TtIcon name={ctaIcon}/>{busy ? "Preparing…" : cta}</button>
        </div>
      </>}
    </TtLayer>
  );
}

function TtSegField({ label, segH, value, onChange, options }) {
  return (
    <div className="tt-col tt-col--6">
      <span className="tt-field-label">{label}</span>
      <TtSeg label={label} track="box" size={segH} value={value} onChange={onChange} className="tt-seg--full" options={options.map(([v, l]) => ({ value: v, label: l }))}/>
    </div>
  );
}

/* ── Full screen (§5.6, §6.6) ── */

function TtFullScreen({ C }) {
  const phone = C.bp === "phone";
  const [zoom, setZoom] = React.useState("fit");
  const stageRef = React.useRef(null);
  const sz = ttUseSize(stageRef);
  const model = React.useMemo(() => ttPosterModel(C.doc, { kind: "poster", orient: C.s.orient, paper: "a4", today: true, live: true, now: C.now }), [C.doc, C.s.orient, C.now]);
  const ori = ttOrientFor(C.s.orient, C.entries, C.s.weekStart);
  const pad = phone ? 16 : 64;
  const fw = Math.max(1, sz.w - pad), fh = Math.max(1, sz.h - (phone ? 16 : 44));
  const fit = Math.min(fw / model.w, fh / model.h);
  const zoomed = Math.min(1, Math.max(fit, fh / model.h, fw / model.w * (ori === "landscape" ? 2 : 1.4)));
  const sc = phone && zoom === "zoom" ? zoomed : Math.min(fit, 1.6);
  const caption = "A4 " + ori + " · " + (C.s.layout === "timeline" ? "Timeline" : "List") + (C.s.fold && C.s.layout === "timeline" ? " · empty hours folded" : "") + (phone ? "" : " · Esc to close");
  const darkSeg = (label, value, opts, onChange) => <TtSeg dark label={label} size={phone ? "44" : "36"} value={value} onChange={onChange} options={opts}/>;
  const orientOpts = [{ value: "landscape", label: phone ? "Landscape" : "", icon: "rectangle", aria: "Landscape" }, { value: "portrait", label: phone ? "Portrait" : "", icon: "device-tablet", aria: "Portrait" }];
  return (
    <TtLayer variant="fs" scrim="none" label="Full-screen preview" onClose={() => C.close("fs")}>
      <div className="tt-fsbar">
        <button type="button" className="tt-fsclose" aria-label="Close preview" title="Close (Esc)" onClick={() => C.close("fs")}><TtIcon name="x"/></button>
        <span className="tt-fstitle"><b>{C.s.title}</b><span>{caption}</span></span>
        {!phone && <>
          <TtLookSelect C={C} dark/>
          <TtThemeDots C={C} dark/>
          {darkSeg("Layout", C.s.layout, [{ value: "timeline", label: "Timeline", icon: "grid-four" }, { value: "list", label: "List", icon: "list-bullets" }], v => C.setS("layout", v))}
          {darkSeg("Orientation", ori, orientOpts, v => C.setS("orient", v))}
        </>}
        <button type="button" className="tt-fsdl" onClick={() => C.swap("fs", "download", { format: phone && C.member ? "phone" : "pdf", step: phone ? "list" : "detail" })}><TtIcon name="download-simple"/>Download</button>
      </div>
      <div ref={stageRef} className="tt-fsstage">
        {sz.w > 0 && (
          <div className="tt-fsposter" style={{ width: Math.floor(model.w * sc), height: Math.floor(model.h * sc) }}>
            <div className="tt-stage-scale" style={{ transform: "scale(" + sc + ")" }}><TimetablePoster model={model}/></div>
          </div>
        )}
      </div>
      {phone && (
        <div className="tt-fsfoot">
          {darkSeg("Orientation", ori, orientOpts, v => C.setS("orient", v))}
          {darkSeg("Zoom", zoom, [{ value: "fit", label: "Fit", icon: "corners-in" }, { value: "zoom", label: "Zoom in", icon: "magnifying-glass-plus" }], setZoom)}
        </div>
      )}
    </TtLayer>
  );
}

/* ── The phone's More sheet (§5.5) ── */

function TtMoreSheet({ C }) {
  const si = C.saveInfo, unsaved = si.state !== "saved" && si.state !== "saving";
  const ori = ttOrientFor(C.s.orient, C.entries, C.s.weekStart);
  const rows = [
    [si.state === "failed" ? "warning-circle" : unsaved ? "cloud-arrow-up" : "check-circle", si.state === "failed" ? "Retry" : unsaved ? (C.member ? "Save to my account" : "Save this timetable") : "Saved", si.status,
      si.state === "failed" ? "error" : unsaved ? "gold" : "ok", () => { if (si.state === "failed") { C.retrySave(); return; } if (si.state === "unsaved") C.swap("more", "save", { step: C.member ? "confirm" : "choose" }); else C.say(si.status); }],
    ["arrows-out", "Full-screen preview", "See the printed timetable", "info", () => C.swap("more", "fs")],
    ["pencil-simple-line", "Plan study time", "Fit sessions into free time", "info", () => C.swap("more", "plan")],
    ["tray-arrow-down", "Import", "Your NGG centre or a paste", "info", () => C.swap("more", "import", { tab: "centre" })],
  ];
  return (
    <TtLayer variant="sheet" scrim="phone" labelledBy="tt-more-h" onClose={() => C.close("more")}>
      <TtLayerHead id="tt-more-h" title="Timetable" onClose={() => C.close("more")}/>
      <div className="tt-lbody">
        <div className="tt-col tt-col--18">
          <div className="tt-col tt-col--10">
            <label className="tt-field"><span className="tt-field-label">Name</span><input className="tt-input tt-input--52 tt-input--strong" value={C.s.title} maxLength={60} enterKeyHint="done" onChange={e => C.setS("title", e.target.value)}/></label>
            <label className="tt-field"><span className="tt-field-label">Subtitle <span className="tt-field-opt">· optional</span></span><input className="tt-input tt-input--52" value={C.s.subtitle} maxLength={80} enterKeyHint="done" placeholder="Class, term or school" onChange={e => C.setS("subtitle", e.target.value)}/></label>
          </div>
          <div className="tt-card">
            {rows.map(([icon, l, d, tone, fn]) => (
              <button key={l} type="button" className="tt-morerow" onClick={fn}>
                <span className={"tt-tile tt-tile--34 tt-tile--" + tone}><TtIcon name={icon}/></span>
                <span className="tt-morerow-text"><b>{l}</b><span>{d}</span></span>
                <TtIcon name="caret-right" className="tt-chev"/>
              </button>
            ))}
          </div>
          <span className="tt-field-label tt-field-label--tight">Style of the printed timetable</span>
          <div role="radiogroup" aria-label="Style" className="tt-grid2">
            {TT_LOOK_IDS.map(k => {
              const L = TT_LOOKS[k], on = C.s.look === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} className={"tt-lookcard" + (on ? " is-on" : "")} onClick={() => C.setS("look", k)}>
                  <span className="tt-lookcard-aa" aria-hidden="true" style={{ fontFamily: L.disp }}>Aa</span>
                  <span className="tt-lookcard-text"><b>{L.name}</b><span>{L.sample}</span></span>
                </button>
              );
            })}
          </div>
          <span className="tt-field-label tt-field-label--tight">Colours</span>
          <div role="radiogroup" aria-label="Theme" className="tt-grid2">
            {TT_THEME_IDS.map(k => {
              const t = TT_THEMES[k], on = C.s.theme === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} className={"tt-themecard" + (on ? " is-on" : "")} onClick={() => C.setS("theme", k)}>
                  <span className="tt-themecard-sw" style={{ background: t.bg }}><span style={{ background: t.dot }}/></span><b>{t.name}</b>
                </button>
              );
            })}
          </div>
          <div className="tt-col tt-col--8">
            <span className="tt-field-label">Printed layout</span>
            <div role="radiogroup" aria-label="Layout" className="tt-grid2 tt-grid2--8">
              {[["timeline", "Timeline", "grid-four", "Classes placed by time"], ["list", "List", "list-bullets", "Classes listed under each day"]].map(([v, l, icon, d]) => (
                <button key={v} type="button" role="radio" aria-checked={C.s.layout === v} className={"tt-layoutcard" + (C.s.layout === v ? " is-on" : "")} onClick={() => C.setS("layout", v)}>
                  <b><TtIcon name={icon}/>{l}</b><span>{d}</span>
                </button>
              ))}
            </div>
          </div>
          <TtPrintOptions doc={C.doc} variant="phone" hadAmPm={C.hadAmPm} orientNow={ori} termEnd={C.term && C.term.end} setS={C.setS} applyAll={() => {}}/>
        </div>
      </div>
      <div className="tt-lfoot"><button type="button" className="tt-btn tt-btn--primary tt-btn--52 tt-btn--grow tt-btn--r16" onClick={() => C.close("more")}>Done</button></div>
    </TtLayer>
  );
}

/* ── Official sync review (§7.9): accept or keep, one session at a time ── */

function TtSyncReview({ C }) {
  const changes = C.sync.changes;
  const [pick, setPick] = React.useState({});
  const fit = e => TT_DAYS[e.days[0] - 1][2] + " " + ttFmt(ttMin(e.start), C.s.clock) + "–" + ttFmt(ttMin(e.end), C.s.clock) + (e.place ? " · " + e.place : "");
  return (
    <TtLayer variant={ttDialogVariant(C)} scrim="phone" labelledBy="tt-sy-h" onClose={() => C.close("sync")}>
      <TtLayerHead id="tt-sy-h" title={C.sync.source + " changed " + changes.length + " session" + (changes.length === 1 ? "" : "s")} sub="Nothing changes here until you accept it." onClose={() => C.close("sync")}/>
      <div className="tt-lbody">
        <div className="tt-card">
          {changes.map((c, i) => {
            const e = c.fresh || c.local, p = pick[i];
            return (
              <div key={i} className="tt-syncrow">
                <span className="tt-syncrow-text">
                  <b>{e.title}</b>
                  <span>{c.kind === "added" ? "New · " + fit(c.fresh) : c.kind === "removed" ? "No longer on · " + fit(c.local) : fit(c.local) + " → " + fit(c.fresh)}</span>
                </span>
                <TtSeg label={e.title} track="box" size="36" value={p || null} onChange={v => setPick(x => Object.assign({}, x, { [i]: v }))}
                  options={[{ value: "accept", label: "Accept" }, { value: "keep", label: "Keep mine" }]}/>
              </div>
            );
          })}
        </div>
      </div>
      <div className="tt-lfoot">
        <button type="button" className="tt-btn tt-btn--primary tt-btn--cta tt-btn--grow" onClick={() => C.applySync(changes.filter((_, i) => pick[i] === "accept"))}>Done</button>
      </div>
    </TtLayer>
  );
}

/* ── Keyboard shortcuts (§7.12) ── */

function TtKeys({ C }) {
  const list = [["Add in plain words", "/"], ["Add with all options", "N"], ["Full-screen preview", "F"], ["Download or share", "D"], ["Undo / redo", "Ctrl Z / Ctrl ⇧ Z"], ["Close the top panel", "Esc"], ["This list", "?"]];
  return (
    <TtLayer variant="keys" scrim="phone" labelledBy="tt-ks-h" onClose={() => C.close("keys")}>
      <div className="tt-lhead tt-lhead--keys"><div className="tt-lhead-text"><h2 id="tt-ks-h" className="tt-lhead-title">Keyboard shortcuts</h2></div>
        <button type="button" className="tt-iconbtn tt-iconbtn--40 tt-iconbtn--round" aria-label="Close" onClick={() => C.close("keys")}><TtIcon name="x"/></button></div>
      {list.map(([l, k]) => <div key={l} className="tt-keyrow"><span className="tt-grow">{l}</span><kbd>{k}</kbd></div>)}
    </TtLayer>
  );
}
