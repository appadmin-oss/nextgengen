/* ============================================================================
   Timetable Maker v5 — the layers.

   Every layer is a TtLayer: a modal dialog that keeps focus inside and gives
   it back to whatever opened it, shaped by the breakpoint — a bottom sheet on
   a phone, a drawer or a centred dialog wider up (§5.4, §6.6). They mount in
   the reverse of the order they close in (§3.5), so the one Back or Escape
   closes first is also the one drawn on top.
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

/** Save, import, plan and sync: a sheet on a phone, a centred dialog wider up. */
function ttDialogShape(C) { return C.bp === "phone" ? "sheet" : "centre"; }

/* ── The class form (§7.3) ── */

function TtClassForm({ C, init }) {
  const [f, setF] = React.useState(() => Object.assign({ place: "", once: false }, init));
  const [err, setErr] = React.useState("");
  const set = (k, v) => { setErr(""); setF(p => Object.assign({}, p, { [k]: k === "days" && p.once ? v.slice(-1) : v })); };
  const a = ttMin(f.start), b = ttMin(f.end), len = a !== null && b !== null && b > a ? b - a : null;
  const clash = len ? C.entries.filter(x => x.id !== f.id && x.days.some(d => f.days.includes(d)) && ttMin(x.start) < b && a < ttMin(x.end)) : [];
  const th = TT_THEMES[C.s.theme] || TT_THEMES.paper;
  const off = f.ctxOff || 0, kind = f.kind || ttKindOf(f);
  const onceDay = f.days[0] || f.ctxDay || C.T.day;
  const showSkip = !!f.id && !f.origOnce && !!f.ctxDay && f.days.includes(f.ctxDay);
  const skipped = showSkip && !!ttWeekEx(C.ex, off, C.now).skip[f.id + ":" + f.ctxDay];
  const places = [...new Set(C.entries.map(e => e.place).filter(Boolean))];
  const shape = C.bp === "phone" ? "sheet-tall" : C.bp === "tablet" ? "form-right" : "form-left";
  const submit = e => { e.preventDefault(); const r = C.saveForm(f); if (r) setErr(r); };
  return (
    <TtLayer variant={shape} scrim={C.bp === "phone" ? "phone" : C.bp === "tablet" ? "drawer" : "form"} labelledBy="tt-form-h" className="tt-form"
      onClose={() => C.close("form")} onSubmit={submit} initialFocus={f.title ? ".tt-form .tt-lhead button" : "#tt-form-name"}>
      <TtLayerHead id="tt-form-h" title={f.id ? "Edit class" : "Add a class"} line onClose={() => C.close("form")}
        extra={f.official ? <span className="tt-official"><TtIcon name="seal-check"/>From {f.source}</span> : null}/>
      <div className="tt-lbody">
        <div className="tt-col tt-col--16">
          <label className="tt-field">
            <span className="tt-field-label">Name</span>
            <input id="tt-form-name" className="tt-input tt-input--ctl" list="tt-subjects" value={f.title} maxLength={60} enterKeyHint="next" autoComplete="off"
              placeholder="Mathematics, Piano, Football…" onChange={e => set("title", e.target.value)}/>
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
                return (
                  <button key={d} type="button" aria-pressed={on} aria-label={name} className={"tt-dayt" + (on ? " is-on" : "")}
                    onClick={() => set("days", on ? f.days.filter(x => x !== d) : f.days.concat([d]).sort((x, y) => x - y))}>{short}</button>
                );
              })}
            </div>
          </fieldset>
          <div className="tt-pair">
            <label className="tt-field">
              <span className="tt-field-label">Starts</span>
              {/* Changing the start keeps the length. */}
              <input type="time" step="300" className="tt-input tt-input--ctl" value={f.start} onChange={e => {
                const v = e.target.value, keep = len || 60;
                setErr("");
                setF(p => Object.assign({}, p, { start: v, end: ttMin(v) !== null ? ttHhmm(Math.min(ttMin(v) + keep, 1439)) : p.end }));
              }}/>
            </label>
            <label className="tt-field">
              <span className="tt-field-label">Ends · {len ? ttDur(len) : "—"}</span>
              <input type="time" step="300" className="tt-input tt-input--ctl" value={f.end} onChange={e => set("end", e.target.value)}/>
            </label>
          </div>
          {(!f.id || f.origOnce) && (
            <TtSeg label="Repeats" track="box" size="ctl" full value={!!f.once}
              onChange={v => { setErr(""); setF(p => Object.assign({}, p, { once: v, days: v ? [p.days[0] || p.ctxDay || C.T.day] : p.days })); }}
              options={[{ value: false, label: "Every week" }, { value: true, label: "Only " + ttDshort(ttDateFor(onceDay, off, C.now)) }]}/>
          )}
          {showSkip && (
            <button type="button" className="tt-skipbtn" onClick={() => C.toggleSkip(f, f.ctxDay, off)}>
              <TtIcon name={skipped ? "calendar-check" : "calendar-x"} className="tt-skipbtn-icon"/>
              <span className="tt-grow">{(skipped ? "Put back on " : "Skip just ") + ttDshort(ttDateFor(f.ctxDay, off, C.now))}</span>
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

/** The sample school week, for somebody who wants to see the maker working before typing anything. */
function ttSampleWeek() {
  const E = (title, days, start, end, place, color) => ({ id: ttUid(), title, days, start, end, place, color, kind: ttKindOf({ title }) });
  return [E("Mathematics", [1, 3, 5], "08:00", "09:00", "Room 4", 0), E("Basic Science", [2, 4], "08:00", "09:00", "Lab", 1), E("English", [1, 2, 4], "09:00", "10:00", "Room 2", 3),
    E("Social Studies", [3], "09:00", "10:00", "Room 2", 5), E("Computer Studies", [5], "09:00", "10:30", "ICT room", 6), E("Break", [1, 2, 3, 4, 5], "10:30", "11:00", "", 7),
    E("French", [1, 3], "11:00", "12:00", "Room 6", 4), E("Civic Education", [2, 4], "11:00", "12:00", "Room 3", 2), E("PE", [5], "11:00", "12:30", "Field", 1),
    E("Homework club", [1, 3], "14:00", "15:00", "Library", 4)];
}

function TtImport({ C, init }) {
  const [centres, setCentres] = React.useState(null);
  const [listFailed, setListFailed] = React.useState(false);
  const [slug, setSlug] = React.useState(init.slug || "");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(init.failed ? init.slug : "");
  const [paste, setPaste] = React.useState("");
  const loadList = () => {
    setListFailed(false);
    NGGApi.public.timetable("").then(r => {
      const list = r.centres || [];
      setCentres(list);
      setSlug(s => s || (list[0] ? list[0].slug : ""));
    }).catch(() => setListFailed(true));
  };
  React.useEffect(loadList, []);
  const nameOf = sl => ((centres || []).find(c => c.slug === sl) || {}).name || "the centre";
  const add = async () => {
    if (!slug) return;
    setBusy(true); setFailed("");
    try { await C.addCentre(slug); C.close("import"); }
    catch (_) { setFailed(slug); }
    finally { setBusy(false); }
  };
  const pr = paste.trim() ? ttParseRows(paste, C.entries.length) : null;
  const n = pr ? pr.rows.length : 0, classes = n + " class" + (n === 1 ? "" : "es");
  return (
    <TtLayer variant={ttDialogShape(C)} scrim="phone" labelledBy="tt-im-h" onClose={() => C.close("import")} initialFocus={init.tab === "paste" ? "textarea" : "select"}>
      <TtLayerHead id="tt-im-h" title="Import classes" onClose={() => C.close("import")}/>
      <div className="tt-lbody tt-lbody--safe">
        <div className="tt-col tt-col--18">
          <div className="tt-col tt-col--8">
            <span className="tt-field-label" id="tt-im-centre">Your NGG centre’s sessions</span>
            <div className="tt-row8">
              <select className="tt-input tt-input--ctl tt-select tt-grow" aria-labelledby="tt-im-centre" value={slug} disabled={!centres || !centres.length} onChange={e => { setSlug(e.target.value); setFailed(""); }}>
                {!centres && <option value="">{listFailed ? "Couldn’t load the centres" : "Loading centres…"}</option>}
                {(centres || []).map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <button type="button" className="tt-btn tt-btn--primary tt-btn--ctl" disabled={!slug || busy} onClick={add}>{busy ? "Adding…" : "Add"}</button>
            </div>
            {failed && (
              <span role="alert" className="tt-err tt-err--inline">
                <TtIcon name="warning-circle"/><span className="tt-grow">Couldn’t load {nameOf(failed)}’s sessions. Check your connection and try again.</span>
                <button type="button" className="tt-textbtn" onClick={add}>Try again</button>
              </span>
            )}
            {listFailed && (
              <span role="alert" className="tt-err tt-err--inline">
                <TtIcon name="warning-circle"/><span className="tt-grow">Couldn’t load the centres. Check your connection and try again.</span>
                <button type="button" className="tt-textbtn" onClick={loadList}>Try again</button>
              </span>
            )}
            <span className="tt-help">They stay in step with the centre. If it changes a session, you’re asked first.</span>
          </div>
          <div className="tt-col tt-col--8">
            <label className="tt-field-label" htmlFor="tt-paste">Paste from a spreadsheet or WhatsApp</label>
            <textarea id="tt-paste" className="tt-paste" rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder="Mon, Wed  8:00-9:00  Mathematics  Room 4"/>
            <span className="tt-help" role="status">{pr ? "Found " + classes + (pr.skipped.length ? " · skipped " + pr.skipped.join("; ") : "") : "One class per line: days, times, name, then room."}</span>
            {n > 0 && (
              <button type="button" className="tt-btn tt-btn--primary tt-btn--ctl" onClick={() => {
                C.commit(d => Object.assign({}, d, { entries: d.entries.concat(pr.rows), s: d.s.mode ? d.s : Object.assign({}, d.s, { mode: "school" }) }), "Added " + classes, true);
                C.setDay(null);
                C.close("import");
              }}>Add {classes}</button>
            )}
          </div>
          {!C.entries.some(e => !e.official) && (
            <button type="button" className="tt-linkbtn" onClick={() => {
              C.commit(d => Object.assign({}, d, { entries: d.entries.filter(x => x.official).concat(ttSampleWeek()),
                s: Object.assign({}, d.s, d.entries.length ? {} : { title: "My school week" }, { mode: d.s.mode || "school" }) }), "Added a sample school week", true);
              C.setDay(null);
              C.close("import");
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
  const h = C.bp === "phone" ? "44" : "36";
  return (
    <TtLayer variant={ttDialogShape(C)} scrim="phone" labelledBy="tt-pl-h" onClose={() => C.close("plan")}>
      <TtLayerHead id="tt-pl-h" title="Plan study time" sub="Fits sessions into your free time, around everything already on." onClose={() => C.close("plan")}/>
      <div className="tt-lbody">
        <div className="tt-col tt-col--16">
          <div className="tt-col tt-col--8">
            <span className="tt-field-label" id="tt-pl-subj">Subjects</span>
            <div className="tt-chiprow tt-chiprow--wrap" role="group" aria-labelledby="tt-pl-subj">
              {pool.map(t => {
                const on = picked.includes(t);
                return <button key={t} type="button" aria-pressed={on} className={"tt-chip tt-chip--" + h + (on ? " is-on" : "")} onClick={() => set("subjects", on ? picked.filter(x => x !== t) : picked.concat([t]))}>{t}</button>;
              })}
            </div>
          </div>
          {[["Sessions a week", "per", [[2, "2"], [3, "3"], [4, "4"], [5, "5"]]], ["Each session", "len", [[30, "30 min"], [45, "45 min"], [60, "1 hour"]]],
            ["When", "win", [["after", "After school"], ["evening", "Evenings"], ["weekend", "Weekends"]]]].map(([l, k, opts]) => (
            <TtSegField key={k} label={l} size={h} value={P[k]} onChange={v => set(k, v)} options={opts}/>
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
          C.setSuggOff(true);
          C.close("plan");
        }}>{planned.length ? "Add " + planned.length + " study sessions" : "Nothing to add"}</button>
      </div>
    </TtLayer>
  );
}

function TtSegField({ label, size, value, onChange, options }) {
  return (
    <div className="tt-col tt-col--6">
      <span className="tt-field-label">{label}</span>
      <TtSeg label={label} track="box" size={size} full value={value} onChange={onChange} options={options.map(([v, l]) => ({ value: v, label: l }))}/>
    </div>
  );
}

/* ── Save (§7.9). Members sign in with the site's own one-time code; there is no second OTP system. ── */

const TT_RESEND_AFTER = 45;

function TtSave({ C, init }) {
  const m = C.member;
  const [step, setStep] = React.useState(init.step || (m ? "confirm" : "choose"));
  const [who, setWho] = React.useState(init.who || "member");
  const [ident, setIdent] = React.useState("");
  const [code, setCode] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [masked, setMasked] = React.useState("");
  const [wait, setWait] = React.useState(0);
  React.useEffect(() => { if (wait <= 0) return undefined; const id = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(id); }, [wait]);
  const human = e => typeof humanizeAuthError === "function" ? humanizeAuthError(e && (e.code || e.message)) : "That didn’t work, try again.";
  const close = () => C.close("save");
  const sendCode = async () => {
    setBusy(true); setErr("");
    try { const r = await NGGApi.auth.request(ident.trim()); setMasked(r.masked || ""); setCode(""); setStep("code"); setWait(TT_RESEND_AFTER); }
    catch (e) { setErr(human(e)); }
    finally { setBusy(false); }
  };
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (step === "choose" && who === "member") {
      if (ident.trim().length < 3) { setErr("Enter your member ID, like NGG-2025-0042, or your email."); return; }
      await sendCode();
      return;
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
        await C.refreshAuth();
        await C.keepInAccount();
        setStep("memberDone");
      } catch (x) { setErr(human(x)); }
      finally { setBusy(false); }
    }
  };
  const confirm = async () => {
    setBusy(true);
    try { await C.keepInAccount(); close(); C.say("Saved to your account"); }
    finally { setBusy(false); }
  };
  const first = C.firstName || "your";
  const copy = {
    confirm: ["Save to your NGG account", "Signed in as " + (m ? m.fullName + " · " + (m.displayId || m.memberId) : "") + "."],
    choose: ["Keep this timetable", "It’s only in this browser right now. Save it to open it anywhere."],
    code: ["Check your email", "We sent a 6-digit code to " + (masked || "the email on " + ident.trim()) + "."],
    memberDone: ["Saved to " + first + "’s account", "You’re signed in, and changes now save as you go."],
    emailDone: ["Check your email", "We sent a link to " + email.trim() + "."],
  }[step];
  const fieldProps = { "aria-invalid": err ? "true" : undefined, "aria-describedby": err ? "tt-sv-err" : undefined };
  const errLine = err && <span id="tt-sv-err" role="alert" className="tt-err">{err}</span>;
  const points = list => list.map(([i, t]) => <span key={i} className="tt-point"><TtIcon name={i}/><span>{t}</span></span>);
  return (
    <TtLayer variant={ttDialogShape(C)} scrim="phone" labelledBy="tt-sv-h" onClose={close}>
      <TtLayerHead id="tt-sv-h" title={copy[0]} sub={copy[1]} onClose={close}/>
      <div className="tt-lbody tt-lbody--safe">
        <div className="tt-col tt-col--14">
          {step === "confirm" && <>
            <div className="tt-points">{points([["house-line", "It shows on your member dashboard."], ["users-three", "Your parent or guardian sees it in the family app."],
              ["arrows-clockwise", "If your centre changes a session, you’re asked before anything changes here."]])}</div>
            <button type="button" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy} onClick={confirm}>Save to my account</button>
          </>}
          {step === "choose" && <>
            <div role="radiogroup" aria-label="Are you an NGG member?" className="tt-who">
              {[["member", "identification-badge", "I’m an NGG member", "Add it to my member account"], ["guest", "envelope-simple", "I’m not a member", "Save it with my email"]].map(([k, icon, l, d]) => (
                <button key={k} type="button" role="radio" aria-checked={who === k} className={"tt-whocard" + (who === k ? " is-on" : "")} onClick={() => { setWho(k); setErr(""); }}>
                  <TtIcon name={icon}/><b>{l}</b><span>{d}</span>
                </button>
              ))}
            </div>
            <form className="tt-col tt-col--10" onSubmit={submit} noValidate>
              {who === "member" ? <>
                <label className="tt-field"><span className="tt-field-label">Member ID or email</span>
                  <input className={"tt-input tt-input--ctl" + (err ? " is-invalid" : "")} value={ident} autoComplete="username" enterKeyHint="send" placeholder="NGG-2025-0042 or you@example.com"
                    onChange={e => { setIdent(e.target.value); setErr(""); }} {...fieldProps}/></label>
                {errLine}
                <button type="submit" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
              </> : <>
                <label className="tt-field"><span className="tt-field-label">Email</span>
                  <input type="email" inputMode="email" className={"tt-input tt-input--ctl" + (err ? " is-invalid" : "")} value={email} autoComplete="email" enterKeyHint="send" placeholder="you@example.com"
                    onChange={e => { setEmail(e.target.value); setErr(""); }} {...fieldProps}/></label>
                {errLine}
                <button type="submit" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button>
                <span className="tt-help">No membership needed. Open the link on any phone or computer to keep editing.</span>
              </>}
            </form>
          </>}
          {step === "code" && (
            <form className="tt-col tt-col--10" onSubmit={submit} noValidate>
              <label className="tt-field"><span className="tt-field-label">6-digit code</span>
                <input className={"tt-input tt-code" + (err ? " is-invalid" : "")} value={code} inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" enterKeyHint="done" maxLength={6}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }} {...fieldProps}/></label>
              {errLine}
              <button type="submit" className="tt-btn tt-btn--primary tt-btn--cta" disabled={busy}>{busy ? "Signing in…" : "Sign in and save"}</button>
              <div className="tt-coderow">
                <button type="button" className="tt-linkbtn" onClick={() => { setStep("choose"); setCode(""); setErr(""); }}>Use a different ID</button>
                {wait > 0
                  ? <span className="tt-help">Send a new code in {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, "0")}</span>
                  : <button type="button" className="tt-linkbtn" disabled={busy} onClick={sendCode}>Send a new code</button>}
              </div>
            </form>
          )}
          {(step === "memberDone" || step === "emailDone") && <>
            <div className="tt-points tt-points--ok">{points(step === "memberDone"
              ? [["house-line", "It’s on your member dashboard."], ["users-three", "Your family app shows it too."]]
              : [["link-simple", "Open it on any phone or computer to keep editing."], ["device-mobile", "This browser keeps saving changes in the meantime."]])}</div>
            <button type="button" className="tt-btn tt-btn--primary tt-btn--cta" onClick={close}>Done</button>
            {step === "emailDone" && <a className="tt-joinlink" href="/join" onClick={e => { e.preventDefault(); close(); goApply(C.setPage, "anchor"); }}>Curious about NGG? See how to join</a>}
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
  const [step, setStep] = React.useState(phone ? init.step || "list" : "detail");
  const [paper, setPaper] = React.useState("a4");
  const [wall, setWall] = React.useState("week");
  const today = ttYmd(C.now);
  const [icsFrom, setIcsFrom] = React.useState(C.term && C.term.start > today ? C.term.start : ttWeekKey(0, C.now));
  const [icsUntil, setIcsUntil] = React.useState(C.term && C.term.end > today ? C.term.end : ttYmd(new Date(C.now.getTime() + 84 * 864e5)));
  const [remind, setRemind] = React.useState("10");
  const [busy, setBusy] = React.useState(false);
  const boxRef = React.useRef(null);
  const box = ttUseSize(boxRef, step === "detail");
  const f = TT_FORMATS.find(x => x.id === fmt);
  const visual = fmt === "pdf" || fmt === "share" || fmt === "phone";
  const model = React.useMemo(() => visual && step === "detail" ? ttPosterModel(C.doc, { kind: fmt === "pdf" ? "poster" : fmt, orient: C.s.orient, paper, wall, now: C.now }) : null,
    [visual, step, C.doc, fmt, paper, wall, C.now]);
  const eo = ttOrientFor(C.s.orient, C.entries, C.s.weekStart), auto = ttOrientFor("auto", C.entries, C.s.weekStart);
  const nEv = C.entries.reduce((k, e) => k + e.days.length, 0);
  const weeks = Math.max(1, Math.round((new Date(icsUntil) - new Date(icsFrom)) / (7 * 864e5)) + 1);
  const link = fmt === "link" ? C.shareLink() : "";
  const h = phone ? "44" : "38";
  const notes = {
    pdf: [["lightbulb", eo === "portrait" ? "Portrait turns the week sideways: each day is a row and time runs across, so it fits a tall page without shrinking." : "Landscape gives each day a column with time running down."]]
      .concat(Object.keys(ttOverlaps(C.entries)).length && C.s.layout === "timeline" ? [["warning", "Overlapping classes share their slot. List shows them one under another.", true]] : [])
      .concat([["text-aa", "Text stays sharp and searchable."]]),
    share: [["lightbulb", "A card for each day with large type, so it reads on a phone without zooming."]],
    phone: [["lightbulb", wall === "next" ? "Bigger text for just the next two days. Download again each week, or use the calendar file instead." : "The top third stays clear for your lock-screen clock."]],
    ics: [],
    link: [["shield-check", "Nothing is uploaded; the timetable lives inside the link."]],
  }[fmt];
  const file = { pdf: C.fileName + ".pdf · " + (paper === "letter" ? "Letter" : "A4") + " " + eo, share: C.fileName + ".png · 1080×1350", phone: C.fileName + "-wallpaper.png · 1080×2340",
    ics: C.fileName + ".ics · " + nEv + " weekly events", link: Math.round(link.length / 100) / 10 + "k characters" }[fmt];
  const cta = { pdf: "Download PDF", share: phone ? "Share image" : "Download image", phone: "Download", ics: "Add to calendar", link: phone ? "Share link" : "Copy link" }[fmt];
  const ctaIcon = fmt === "link" ? (phone ? "share-network" : "copy") : fmt === "share" && phone ? "share-network" : "download-simple";
  const tag = x => x.id === "pdf" ? "Best for printing" : x.id === "phone" && C.member ? "For you" : "";
  const go = async () => {
    setBusy(true);
    const done = await C.exportFile(fmt, { paper, wall, icsFrom, icsUntil, remind: +remind });
    setBusy(false);
    if (done) C.close("download");
  };
  const detail = phone && step === "detail";
  return (
    <TtLayer variant={phone ? "sheet-tall" : "drawer-right"} scrim={phone ? "phone" : "drawer"} labelledBy="tt-ex-h" className="tt-dl" onClose={() => C.close("download")}>
      <TtLayerHead id="tt-ex-h" title={detail ? f.name : "Download or share"} line onClose={() => C.close("download")} back={detail ? { label: "All formats", onClick: () => setStep("list") } : null}/>
      {!phone && (
        <div className="tt-fmtchips" role="tablist" aria-label="Format">
          {TT_FORMATS.map(x => <button key={x.id} type="button" role="tab" aria-selected={fmt === x.id} className={"tt-fmtchip" + (fmt === x.id ? " is-on" : "")} onClick={() => setFmt(x.id)}><TtIcon name={x.icon}/>{x.short}</button>)}
        </div>
      )}
      {step === "list" && (
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
        <div className="tt-lbody tt-lbody--dl">
          <div className="tt-col tt-col--14">
            <span className="tt-dl-desc">{f.desc}.</span>
            {visual && (
              <div ref={boxRef} className="tt-dl-box">
                {model && box.w > 0 && <TtPosterStage model={model} width={Math.max(200, box.w - 32)} maxHeight={box.h - 32} className="tt-stage--dl" label={"Preview of the " + f.name.toLowerCase()}/>}
              </div>
            )}
            {fmt === "pdf" && <>
              <TtSegField label="Orientation" size={h} value={C.s.orient} onChange={v => C.setS("orient", v)} options={[["auto", "Auto · " + auto], ["landscape", "Landscape"], ["portrait", "Portrait"]]}/>
              <TtSegField label="Layout" size={h} value={C.s.layout} onChange={v => C.setS("layout", v)} options={[["timeline", "Timeline"], ["list", "List"]]}/>
              <TtSegField label="Paper" size={h} value={paper} onChange={setPaper} options={[["a4", "A4"], ["letter", "US Letter"]]}/>
            </>}
            {fmt === "phone" && <TtSegField label="Show" size={h} value={wall} onChange={setWall} options={[["week", "Whole week"], ["next", "Today & next day"]]}/>}
            {fmt === "ics" && <>
              <div className="tt-icsgrid">
                <label className="tt-field"><span className="tt-field-label">First week</span><input type="date" className={"tt-input tt-input--h" + h} value={icsFrom} onChange={e => setIcsFrom(e.target.value)}/></label>
                <label className="tt-field"><span className="tt-field-label">Last day of term</span><input type="date" className={"tt-input tt-input--h" + h} value={icsUntil} onChange={e => setIcsUntil(e.target.value)}/></label>
                <label className="tt-field"><span className="tt-field-label">Reminder</span>
                  <select className={"tt-input tt-select tt-input--h" + h} value={remind} onChange={e => setRemind(e.target.value)}>
                    <option value="0">None</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option>
                  </select>
                </label>
              </div>
              <span className="tt-help tt-help--ink">{nEv} weekly events for about {weeks} weeks, in Lagos time (WAT).</span>
            </>}
            {fmt === "link" && <input readOnly className="tt-input tt-linkfield" value={link} aria-label="Share link" onFocus={e => e.target.select()}/>}
            {notes.map(([icon, t, warn]) => <span key={t} className={"tt-dlnote" + (warn ? " is-warn" : "")}><TtIcon name={icon}/><span>{t}</span></span>)}
          </div>
        </div>
        <div className="tt-lfoot tt-lfoot--dl">
          <span className="tt-dl-file">{file}</span>
          <button type="button" className="tt-btn tt-btn--primary tt-btn--go" disabled={busy} onClick={go}><TtIcon name={ctaIcon}/>{busy ? "Preparing…" : cta}</button>
        </div>
      </>}
    </TtLayer>
  );
}

/* ── Full screen (§5.6, §6.6) ── */

function TtFullScreen({ C }) {
  const phone = C.bp === "phone";
  const [zoom, setZoom] = React.useState("fit");
  const stageRef = React.useRef(null);
  const sz = ttUseSize(stageRef);
  const model = React.useMemo(() => ttPosterModel(C.doc, { kind: "poster", orient: C.s.orient, paper: "a4", today: true, live: true, now: C.now }), [C.doc, C.now]);
  const ori = ttOrientFor(C.s.orient, C.entries, C.s.weekStart);
  const fw = Math.max(1, sz.w - (phone ? 16 : 64)), fh = Math.max(1, sz.h - (phone ? 16 : 44));
  const fit = Math.min(fw / model.w, fh / model.h);
  // Zoom in fills the height, or up to 2× (landscape) / 1.4× (portrait) the width, never past full size; the stage then scrolls to pan.
  const sc = phone && zoom === "zoom" ? Math.min(1, Math.max(fit, fh / model.h, fw / model.w * (ori === "landscape" ? 2 : 1.4))) : Math.min(fit, 1.6);
  const caption = "A4 " + ori + " · " + (C.s.layout === "timeline" ? "Timeline" : "List") + (C.s.fold && C.s.layout === "timeline" ? " · empty hours folded" : "") + (phone ? "" : " · Esc to close");
  const segH = phone ? "44" : "36";
  const orients = [{ value: "landscape", label: phone ? "Landscape" : "", icon: "rectangle", aria: "Landscape" }, { value: "portrait", label: phone ? "Portrait" : "", icon: "device-tablet", aria: "Portrait" }];
  return (
    <TtLayer variant="fs" scrim="none" label="Full-screen preview" onClose={() => C.close("fs")}>
      <div className="tt-fsbar">
        <button type="button" className="tt-fsclose" aria-label="Close preview" title="Close (Esc)" onClick={() => C.close("fs")}><TtIcon name="x"/></button>
        <span className="tt-fstitle"><b>{C.s.title}</b><span>{caption}</span></span>
        {!phone && <>
          <TtLookSelect C={C} dark/>
          <TtThemeDots C={C} dark/>
          <TtSeg label="Layout" track="dark" size={segH} value={C.s.layout} onChange={v => C.setS("layout", v)}
            options={[{ value: "timeline", label: "Timeline", icon: "grid-four" }, { value: "list", label: "List", icon: "list-bullets" }]}/>
          <TtSeg label="Orientation" track="dark" size={segH} value={ori} onChange={v => C.setS("orient", v)} options={orients}/>
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
          <TtSeg label="Orientation" track="dark" size={segH} value={ori} onChange={v => C.setS("orient", v)} options={orients}/>
          <TtSeg label="Zoom" track="dark" size={segH} value={zoom} onChange={setZoom} options={[{ value: "fit", label: "Fit", icon: "corners-in" }, { value: "zoom", label: "Zoom in", icon: "magnifying-glass-plus" }]}/>
        </div>
      )}
    </TtLayer>
  );
}

/* ── The phone's More sheet (§5.5) ── */

function TtMoreSheet({ C }) {
  const si = C.saveInfo;
  const saveRow = si.state === "failed" ? ["warning-circle", "Retry", "error"] : si.state === "unsaved" ? ["cloud-arrow-up", C.member ? "Save to my account" : "Save this timetable", "gold"] : ["check-circle", "Saved", "ok"];
  const rows = [
    [saveRow[0], saveRow[1], si.status, saveRow[2], () => { if (si.state === "unsaved") C.swap("more", "save", {}); else C.startSave(); }],
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
            <label className="tt-field"><span className="tt-field-label">Name</span>
              <input className="tt-input tt-input--h52 tt-input--strong" value={C.s.title} maxLength={60} enterKeyHint="done" onChange={e => C.setS("title", e.target.value)}/></label>
            <label className="tt-field"><span className="tt-field-label">Subtitle <span className="tt-field-opt">· optional</span></span>
              <input className="tt-input tt-input--h52" value={C.s.subtitle} maxLength={80} enterKeyHint="done" placeholder="Class, term or school" onChange={e => C.setS("subtitle", e.target.value)}/></label>
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
          <div className="tt-col tt-col--10">
            <span className="tt-field-label">Style of the printed timetable</span>
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
          </div>
          <div className="tt-col tt-col--10">
            <span className="tt-field-label">Colours</span>
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
          </div>
          <div className="tt-col tt-col--8">
            <span className="tt-field-label">Printed layout</span>
            <div role="radiogroup" aria-label="Layout" className="tt-grid2 tt-grid2--tight">
              {[["timeline", "Timeline", "grid-four", "Classes placed by time"], ["list", "List", "list-bullets", "Classes listed under each day"]].map(([v, l, icon, d]) => (
                <button key={v} type="button" role="radio" aria-checked={C.s.layout === v} className={"tt-layoutcard" + (C.s.layout === v ? " is-on" : "")} onClick={() => C.setS("layout", v)}>
                  <b><TtIcon name={icon}/>{l}</b><span>{d}</span>
                </button>
              ))}
            </div>
          </div>
          <TtPrintOptions C={C} variant="phone"/>
        </div>
      </div>
      <div className="tt-lfoot"><button type="button" className="tt-btn tt-btn--primary tt-btn--done tt-btn--grow" onClick={() => C.close("more")}>Done</button></div>
    </TtLayer>
  );
}

/* ── A centre that changed a session (§7.9): accept or keep, one at a time, nothing silent ── */

function TtSyncReview({ C }) {
  const changes = C.sync.changes;
  const [pick, setPick] = React.useState({});
  const at = e => TT_DAYS[e.days[0] - 1][2] + " " + ttFmt(ttMin(e.start), C.s.clock) + "–" + ttFmt(ttMin(e.end), C.s.clock) + (e.place ? " · " + e.place : "");
  const k = changes.length;
  return (
    <TtLayer variant={ttDialogShape(C)} scrim="phone" labelledBy="tt-sy-h" onClose={() => C.close("sync")}>
      <TtLayerHead id="tt-sy-h" title={C.sync.source + " changed " + k + " session" + (k === 1 ? "" : "s")} sub="Nothing changes here until you accept it." onClose={() => C.close("sync")}/>
      <div className="tt-lbody">
        <div className="tt-card">
          {changes.map((c, i) => {
            const e = c.fresh || c.local;
            return (
              <div key={i} className="tt-syncrow">
                <span className="tt-syncrow-text">
                  <b>{e.title}</b>
                  <span>{c.kind === "added" ? "New · " + at(c.fresh) : c.kind === "removed" ? "No longer on · " + at(c.local) : at(c.local) + " → " + at(c.fresh)}</span>
                </span>
                <TtSeg label={e.title} track="box" size="36" value={pick[i] || null} onChange={v => setPick(x => Object.assign({}, x, { [i]: v }))}
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

/* ── Keyboard shortcuts (§7.12), exactly the list the spec gives ── */

function TtKeys({ C }) {
  const list = [["Add in plain words", "/"], ["Add with all options", "N"], ["Full-screen preview", "F"], ["Download or share", "D"], ["Undo / redo", "Ctrl Z / Ctrl ⇧ Z"], ["Close the top panel", "Esc"], ["This list", "?"]];
  return (
    <TtLayer variant="keys" scrim="phone" labelledBy="tt-ks-h" onClose={() => C.close("keys")}>
      <div className="tt-lhead tt-lhead--keys">
        <div className="tt-lhead-text"><h2 id="tt-ks-h" className="tt-lhead-title">Keyboard shortcuts</h2></div>
        <button type="button" className="tt-iconbtn tt-iconbtn--40 tt-iconbtn--round" aria-label="Close" onClick={() => C.close("keys")}><TtIcon name="x"/></button>
      </div>
      {list.map(([l, k]) => <div key={l} className="tt-keyrow"><span className="tt-grow">{l}</span><kbd>{k}</kbd></div>)}
    </TtLayer>
  );
}
