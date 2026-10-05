/* ============================================================================
   Timetable Maker v5 — the two trees.

   TtPhone (<600px) and TtWide (≥600px: tablet tabs, two panes, three panes)
   are separate markup, chosen by the page root's measured width. The desktop
   tree is never reflowed into one column for a phone (§3.1).

   Each pane is exactly one scroll container, and everything inside a scroll
   container sits in a non-flex inner column, so nothing can be squashed by
   flex-shrink (§3.2 — v2 squashed cards to 278px that way).
   ========================================================================== */

/** Now / next (§7.14), as the card, the toolbar line and the dot's tone. */
function ttNowView(C) {
  const nn = ttNowNext(C.entries, C.ex, C.now);
  const fmt = m => ttFmt(m, C.s.clock);
  const when = n => (n.k === 0 ? "Today " : n.k === 1 ? "Tomorrow " : TT_DAYS[n.d - 1][1] + " ") + fmt(ttMin(n.e.start));
  if (!C.entries.length && !Object.keys(C.ex).length) return { tone: "none", text: "Add a class to see what’s next." };
  if (nn.now) {
    const n = nn.next;
    return { tone: "now", text: "Now: " + nn.now.title + " until " + fmt(ttMin(nn.now.end)), kicker: "Now · until " + fmt(ttMin(nn.now.end)), title: nn.now.title,
      meta: n ? "Then " + n.e.title + ", " + when(n).toLowerCase() : (nn.now.place || "") };
  }
  if (nn.next) {
    const n = nn.next;
    return { tone: "next", text: "Next: " + n.e.title + ", " + when(n).toLowerCase(), kicker: "Next up", title: n.e.title, meta: when(n) + (n.e.place ? " · " + n.e.place : "") };
  }
  return { tone: "none", text: "Add a class to see what’s next." };
}

/** The context note (§5.1): the visitor's own copy of a shared link, or a centre's sessions just loaded. */
function ttNoteView(C) {
  if (!C.note) return null;
  if (C.note.kind === "shared") return { icon: "link-simple", text: C.note.by ? "Shared by " + C.note.by + ". This is your own copy; changes won’t reach them." : "This is your own copy" };
  if (C.note.kind === "centre") return { icon: "seal-check", text: C.note.centre + "’s official sessions are in. Add your school classes around them." };
  return null;
}

/** The study suggestion (§7.6), with its long and short copy. */
function ttSuggView(C) {
  const h = ttStudyHint(C.entries, C.s.mode);
  const show = h.show && !C.suggOff && !C.layers.form;
  const none = C.s.mode === "revision" && !h.freeDays;
  return {
    show,
    text: none ? "Add what’s fixed first, or let us place revision sessions in your evenings and weekends." : "You’re free after 4pm on " + h.freeDays + " weekday" + (h.freeDays === 1 ? "" : "s") + ". Want a few study sessions placed around your classes?",
    short: none ? "Revision placed in evenings and weekends" : "Free after 4pm on " + h.freeDays + " weekday" + (h.freeDays === 1 ? "" : "s"),
  };
}

/** The day the phone shows, and the day quick add adds to (§7.2 step 10). */
function ttSelDay(C) {
  const fr = ttFrame(C.entries, C.s.weekStart);
  const inFrame = fr.days.some(d => d[0] === C.T.day);
  const sel = C.day === null ? (inFrame && C.week === 0 ? C.T.day : "week") : C.day;
  const qDay = typeof sel === "number" ? sel : (C.week === 0 ? C.T.day : 1);
  return { fr, sel, qDay };
}

/** A day's rows for the phone (§5.2): rows, free gaps, overlaps and their fixes. */
function ttDayRows(C, d) {
  const off = C.week, w = ttWeekEx(C.ex, off, C.now), ov = ttOverlaps(C.entries), th = TT_THEMES[C.s.theme] || TT_THEMES.paper;
  const its = C.entries.filter(e => e.days.includes(d)).concat(w.once.filter(e => e.days.includes(d))).sort((a, b) => ttMin(a.start) - ttMin(b.start));
  const out = [];
  let prevEnd = null;
  its.forEach(e => {
    const skipped = !e.once && !!w.skip[e.id + ":" + d];
    const st = ttMin(e.start), en = ttMin(e.end);
    if (!skipped && prevEnd !== null && st - prevEnd >= 30) out.push({ gap: true, key: "g" + e.id, label: "Free · " + ttDur(st - prevEnd) });
    const o = !skipped && !e.once ? (ov[e.id] || []).filter(x => x.ds.includes(d)) : [];
    const fx = o.length && !e.official ? ttFixFor(C.entries, e, d) : null;
    out.push({ key: e.id, e, d, skipped, once: !!e.once, st, en, edge: ttShade(th.pal[e.color] || th.pal[0], -0.3),
      isNow: off === 0 && d === C.T.day && st <= C.T.mins && en > C.T.mins && !skipped,
      warn: o.length ? "Overlaps " + o.map(x => x.t).join(", ") : "", fix: fx });
    if (!skipped) prevEnd = Math.max(prevEnd || 0, en);
  });
  return out;
}

function TtPillsFor({ r }) {
  return <>
    {r.isNow && <TtPill tone="now">Now</TtPill>}
    {r.e.mine && <TtPill tone="mine">Your course</TtPill>}
    {r.skipped && <TtPill tone="off">Off this week</TtPill>}
    {r.once && <TtPill tone="gold">One-off</TtPill>}
  </>;
}

function TtFixLine({ warn, fix, clock, onFix }) {
  return (
    <div className="tt-fixline">
      <TtIcon name="warning"/><span className="tt-fixline-text">{warn}</span>
      <button type="button" className="tt-fixbtn" onClick={onFix}>Move to {ttFmt(fix.start, clock)}</button>
    </div>
  );
}

function TtNote({ v, onDismiss, onReview }) {
  if (!v) return null;
  return (
    <div className="tt-note" role="status">
      <TtIcon name={v.icon} className="tt-note-icon"/>
      <span className="tt-note-text">{v.text}</span>
      {onReview && <button type="button" className="tt-textbtn tt-textbtn--note" onClick={onReview}>Review</button>}
      <button type="button" className="tt-note-x" onClick={onDismiss} aria-label="Dismiss"><TtIcon name="x"/></button>
    </div>
  );
}

function TtSyncNote({ C }) {
  if (!C.sync) return null;
  const n = C.sync.changes.length;
  return <TtNote v={{ icon: "arrows-clockwise", text: C.sync.source + " changed " + n + " session" + (n === 1 ? "" : "s") + "." }} onReview={C.reviewSync} onDismiss={() => C.applySync([])}/>;
}

function TtOffline({ C }) {
  if (C.online) return null;
  return <div className="tt-offline" role="status"><TtIcon name="wifi-slash"/>You’re offline. Changes are saved on this device.</div>;
}

/* ── Quick add (§7.2): one parser, two composers ── */

function ttUseQuick(C, qDay) {
  const [text, setText] = React.useState("");
  const q = text.trim() ? ttQuick(text, { entries: C.entries, mode: C.s.mode, defDay: qDay, today: C.T.day }) : null;
  const mode = TT_MODES[C.s.mode] || TT_MODES.school;
  const have = new Set(C.entries.map(e => e.title.toLowerCase()));
  const chips = mode.chips.filter(c => !have.has(c.toLowerCase())).slice(0, 7);
  return {
    text, q, mode, chips,
    onChange: e => { const v = e.target.value; setText(v); if (/\d\s*(am|pm)\b/i.test(v)) C.setHadAmPm(true); },
    submit: e => {
      e.preventDefault();
      if (q) { C.addEntry(q.e); setText(""); }
      else if (text.trim()) C.say("Add a name, like “Maths Mon 8–9”");
    },
    more: () => { if (!q) return; C.openForm(Object.assign({}, q.e), { day: q.e.days[0], off: C.week }); setText(""); },
    chip: c => {
      setText(c + " " + TT_DAYS[qDay - 1][2] + " ");
      setTimeout(() => { const el = C.qaRef.current; if (el) { el.focus(); const n = el.value.length; if (el.setSelectionRange) el.setSelectionRange(n, n); } }, 0);
    },
  };
}

/* ═══ Phone ════════════════════════════════════════════════════════════════ */

function TtPhone({ C }) {
  const { fr, sel, qDay } = ttSelDay(C);
  const [scrolled, setScrolled] = React.useState(false);
  const swipe = React.useRef(null);
  const qa = ttUseQuick(C, qDay);
  const off = C.week, m0 = ttMonday(off, C.now), m6 = ttDateFor(7, off, C.now);
  const w = ttWeekEx(C.ex, off, C.now);
  const nCh = Object.keys(w.skip).length + w.once.length;
  const mon = d => d.toLocaleDateString("en-GB", { month: "short" });
  const range = m0.getDate() + (m0.getMonth() !== m6.getMonth() ? " " + mon(m0) : "") + "–" + m6.getDate() + " " + mon(m6);
  const rel = off === 0 ? "This week" + (nCh ? " · " + nCh + " change" + (nCh === 1 ? "" : "s") : "") : off === 1 ? "Next week · tap for this week" : off === -1 ? "Last week · tap for this week" : "Tap for this week";
  const started = C.entries.length > 0 || !!C.s.mode;
  const isDay = typeof sel === "number";
  const order = fr.days.map(d => d[0]);
  const countOn = d => ttOnDay(C.entries, C.ex, d, off, C.now).length;
  const unsaved = C.saveInfo.state === "unsaved";

  // The day heading (§5.1.2).
  let head;
  if (isDay) {
    const on = ttOnDay(C.entries, C.ex, sel, off, C.now);
    const relW = off === 0 ? (sel === C.T.day ? "Today" : sel === C.T.day % 7 + 1 ? "Tomorrow" : null) : null;
    const dt = ttDateFor(sel, off, C.now);
    const span = on.length ? on.length + " on, " + ttFmt(Math.min(...on.map(e => ttMin(e.start))), C.s.clock) + "–" + ttFmt(Math.max(...on.map(e => ttMin(e.end))), C.s.clock) : "Nothing planned";
    head = { title: relW || TT_DAYS[sel - 1][1], sub: (relW ? TT_DAYS[sel - 1][1] + " " + dt.getDate() : dt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })) + " · " + span };
  } else head = { title: off === 0 ? "This week" : "Week view", sub: ttSummary(C.entries) };

  const goDay = dir => {
    const cur = isDay ? order.indexOf(sel) : -1, nx = cur + dir;
    if (nx >= 0 && nx < order.length) C.setDay(order[nx]);
    else if (nx >= order.length) { C.setWeek(off + 1); C.setDay(order[0]); }
    else { C.setWeek(off - 1); C.setDay(order[order.length - 1]); }
  };
  const sugg = ttSuggView(C);
  const sections = !started ? [] : isDay ? [sel] : order;

  return <>
    <header className={"tt-pbar" + (scrolled ? " is-scrolled" : "")}>
      <div className="tt-pbar-row">
        <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round" aria-label="Previous week" onClick={() => { C.setWeek(off - 1); C.setDay(null); }}><TtIcon name="caret-left"/></button>
        <button type="button" className="tt-weeklabel" aria-label="Back to this week" onClick={() => { C.setWeek(0); C.setDay(null); }}>
          <b>{range}</b><span className={off === 0 ? "" : "is-away"}>{rel}</span>
        </button>
        <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round" aria-label="Next week" onClick={() => { C.setWeek(off + 1); C.setDay(null); }}><TtIcon name="caret-right"/></button>
        <span className="tt-vdiv" aria-hidden="true"/>
        <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round tt-iconbtn--big" aria-label="Download or share" onClick={() => C.open("download", { format: C.member ? "phone" : "pdf", step: "list" })}><TtIcon name="export"/></button>
        <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round tt-iconbtn--big tt-more" aria-label={"Timetable settings" + (unsaved ? ", not saved yet" : "")} onClick={() => C.open("more")}>
          <TtIcon name="dots-three-outline"/>{unsaved && C.entries.length > 0 && <span className="tt-more-dot" aria-hidden="true"/>}
        </button>
      </div>
      <div className="tt-strip" role="tablist" aria-label="Day" style={{ gridTemplateColumns: "repeat(" + fr.days.length + ", minmax(0, 1fr))" }}>
        {fr.days.map(([d, name]) => {
          const on = sel === d, isT = off === 0 && d === C.T.day, n = countOn(d), dt = ttDateFor(d, off, C.now);
          return (
            <button key={d} type="button" role="tab" aria-selected={on} aria-label={name + " " + dt.getDate() + (isT ? ", today" : "") + ", " + n + " on"}
              className={"tt-stripday" + (on ? " is-on" : "") + (isT ? " is-today" : "")} onClick={() => C.setDay(d)}>
              <span className="tt-stripday-l">{name.slice(0, 3)}</span>
              <span className="tt-stripday-n">{dt.getDate()}</span>
              <span className="tt-stripday-dots" aria-hidden="true">{Array.from({ length: Math.min(3, Math.ceil(n / 2)) }, (_, i) => <span key={i}/>)}</span>
            </button>
          );
        })}
      </div>
    </header>
    <TtOffline C={C}/>
    <main className="tt-pmain" onScroll={e => { const v = e.currentTarget.scrollTop > 8; if (v !== scrolled) setScrolled(v); }}
      onTouchStart={e => { const t = e.touches && e.touches[0]; swipe.current = t && t.clientX > 16 && t.clientX < C.W - 16 ? { x: t.clientX, y: t.clientY } : null; }}
      onTouchEnd={e => {
        const a = swipe.current; swipe.current = null;
        const t = e.changedTouches && e.changedTouches[0];
        if (!a || !t || !isDay) return;
        const dx = t.clientX - a.x, dy = t.clientY - a.y;
        if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) goDay(dx < 0 ? 1 : -1);
      }}>
      <div className="tt-col tt-col--12">
        <TtNote v={ttNoteView(C)} onDismiss={C.dismissNote}/>
        <TtSyncNote C={C}/>
        {started && (
          <div className="tt-dayhead">
            <div className="tt-dayhead-text"><h1>{head.title}</h1><span>{head.sub}</span></div>
            <TtSeg label="View" value={isDay ? "day" : "week"} className="tt-seg--view" onChange={v => C.setDay(v === "week" ? "week" : (off === 0 && order.includes(C.T.day) ? C.T.day : order[0]))}
              options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]}/>
          </div>
        )}
        {!started && <TtModePicker onMode={C.setMode} onImport={k => C.open("import", { tab: k })}/>}
        {sections.map(d => <TtPhoneSection key={d + ":" + off} C={C} d={d} head={!isDay}/>)}
        {sugg.show && (
          <button type="button" className="tt-sugg tt-sugg--phone" onClick={() => C.open("plan")}>
            <TtIcon name="lightbulb" className="tt-sugg-icon"/>
            <span className="tt-sugg-text"><b>Plan study time</b><span>{sugg.short}</span></span>
            <TtIcon name="caret-right" className="tt-chev"/>
          </button>
        )}
      </div>
    </main>
    <div className="tt-composer">
      {qa.q && <TtQuickPreview q={qa.q} off={off} clock={C.s.clock} moreLabel="Details" onMore={qa.more}/>}
      {!qa.text.trim() && C.qaFocus && qa.chips.length > 0 && (
        <div className="tt-chiprow tt-chiprow--bleed">
          {qa.chips.map(c => <button key={c} type="button" className="tt-chip tt-chip--40" onPointerDown={e => e.preventDefault()} onClick={() => qa.chip(c)}>+ {c}</button>)}
        </div>
      )}
      <form className="tt-composer-row" aria-label="Quick add" onSubmit={qa.submit}>
        <input ref={C.qaRef} className="tt-composer-input" value={qa.text} onChange={qa.onChange}
          onFocus={() => C.setQaFocus(true)} onBlur={() => setTimeout(() => C.setQaFocus(false), 120)}
          aria-label={"Add to " + TT_DAYS[qDay - 1][1] + " in plain words, like " + qa.mode.example}
          placeholder={off === 0 && qDay === C.T.day ? "Add to today…" : "Add to " + TT_DAYS[qDay - 1][1] + "…"}
          enterKeyHint="done" autoComplete="off"/>
        <button type="submit" className={"tt-send" + (qa.q ? " is-ready" : "")} aria-label="Add"><TtIcon name="arrow-up"/></button>
      </form>
    </div>
  </>;
}

function TtPhoneSection({ C, d, head }) {
  const rows = ttDayRows(C, d);
  const dt = ttDateFor(d, C.week, C.now), nm = TT_DAYS[d - 1];
  const label = nm[1] + " " + dt.getDate() + (C.week === 0 && d === C.T.day ? " · Today" : "");
  const on = rows.filter(r => !r.gap && !r.skipped).length;
  let first = true;
  return (
    <section className="tt-psec" aria-label={label}>
      {head && <h2 className="tt-psec-h"><span>{label}</span><span>{on} on</span></h2>}
      <div className="tt-card">
        {!rows.length && <div className="tt-psec-none">Nothing on {nm[1]} yet.</div>}
        {rows.map(r => {
          if (r.gap) return <div key={r.key} className="tt-gap"><TtIcon name="coffee"/>{r.label}</div>;
          const top = first; first = false;
          return (
            <div key={r.key} className={"tt-prow-wrap" + (top ? " is-first" : "") + (r.isNow ? " is-now" : "")}>
              <button type="button" className={"tt-prow" + (r.skipped ? " is-skipped" : "")} aria-label={"Edit " + r.e.title + ", " + ttFmt(r.st, C.s.clock) + " to " + ttFmt(r.en, C.s.clock)}
                onClick={() => C.openForm(Object.assign({}, r.e, { origOnce: !!r.e.once }), { day: d, off: C.week })}>
                <span className="tt-prow-time"><b>{ttFmt(r.st, C.s.clock)}</b><span>{ttFmt(r.en, C.s.clock)}</span></span>
                <span className="tt-prow-bar" style={{ background: r.edge }}/>
                <span className="tt-prow-body">
                  <span className="tt-prow-line">
                    <TtIcon name={TT_KINDS[ttKindOf(r.e)][1]} className="tt-prow-kind"/>
                    <b className="tt-prow-title">{r.e.title}</b>
                    <TtPillsFor r={r}/>
                  </span>
                  {(r.e.place || r.e.official) && <span className="tt-prow-sub">{[r.e.place, r.e.official ? "From " + r.e.source : ""].filter(Boolean).join(" · ")}</span>}
                  {r.warn && !r.fix && <span className="tt-prow-warn"><TtIcon name="warning"/>{r.warn}</span>}
                </span>
                <TtIcon name="caret-right" className="tt-chev"/>
              </button>
              {r.fix && <TtFixLine warn={r.warn} fix={r.fix} clock={C.s.clock} onFix={() => C.runFix(r.e, d)}/>}
            </div>
          );
        })}
        <button type="button" className="tt-addrow" onClick={() => C.openForm({ days: [d] }, { day: d, off: C.week })}><TtIcon name="plus-circle"/>Add to {nm[1]}</button>
      </div>
    </section>
  );
}

/* ═══ Tablet and desktop ═══════════════════════════════════════════════════ */

function TtWide({ C }) {
  const tablet = C.bp === "tablet", three = C.bp === "desk3";
  const showList = !tablet || C.pane === "classes", showPreview = !tablet || C.pane === "preview";
  const si = C.saveInfo;
  return <>
    <a href="#tt-main" className="tt-skip">Skip to timetable</a>
    <header className="tt-head">
      <a href="/" className="tt-logo" aria-label="Next Generation Genius home" onClick={e => { if (C.setPageHome) { e.preventDefault(); C.setPageHome(); } }}>
        <img src="/assets/logo.png" alt="" width="32" height="32"/>
      </a>
      <div className="tt-head-titles">
        <input className="tt-head-title" value={C.s.title} maxLength={60} aria-label="Timetable title" onChange={e => C.setS("title", e.target.value)}/>
        <input className="tt-head-sub" value={C.s.subtitle} maxLength={80} aria-label="Subtitle" placeholder="Add a subtitle, like your class or term" onChange={e => C.setS("subtitle", e.target.value)}/>
      </div>
      <div className="tt-head-actions">
        <button type="button" className="tt-iconbtn tt-iconbtn--40" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!C.canUndo} onClick={C.undo}><TtIcon name="arrow-counter-clockwise"/></button>
        <button type="button" className="tt-iconbtn tt-iconbtn--40" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!C.canRedo} onClick={C.redo}><TtIcon name="arrow-clockwise"/></button>
        <button type="button" className={"tt-savepill tt-savepill--" + si.state} title={si.status} aria-label={C.W < 760 ? si.label : undefined} onClick={C.startSave}>
          <TtIcon name={si.icon} className={"tt-tone-" + si.tone}/><span className="tt-savepill-l">{si.label}</span>
        </button>
        <button type="button" className="tt-btn tt-btn--primary tt-btn--44 tt-btn--pill" onClick={() => C.open("download", { format: "pdf", step: "detail" })}><TtIcon name="download-simple"/>Download</button>
      </div>
    </header>
    {tablet && (
      <div className="tt-tabs" role="tablist" aria-label="View">
        {[["classes", "Classes", "list-bullets"], ["preview", "Preview", "eye"]].map(([k, l, icon]) => (
          <button key={k} type="button" role="tab" aria-selected={C.pane === k} className={"tt-tab" + (C.pane === k ? " is-on" : "")} onClick={() => C.setPane(k)}><TtIcon name={icon}/>{l}</button>
        ))}
      </div>
    )}
    <TtOffline C={C}/>
    <div className="tt-panes">
      {showList && <TtListPane C={C}/>}
      {showPreview && <TtPreviewPane C={C}/>}
      {three && (C.entries.length > 0 || C.s.mode) && <TtRail C={C}/>}
    </div>
  </>;
}

function TtListPane({ C }) {
  const { qDay } = ttSelDay(C);
  const qa = ttUseQuick(C, qDay);
  const started = C.entries.length > 0 || !!C.s.mode;
  const sugg = ttSuggView(C);
  const th = TT_THEMES[C.s.theme] || TT_THEMES.paper;
  const ov = ttOverlaps(C.entries);
  const fit = e => ttFmt(ttMin(e.start), C.s.clock) + "–" + ttFmt(ttMin(e.end), C.s.clock);
  const sorted = C.entries.slice().sort((a, b) => Math.min(...a.days) - Math.min(...b.days) || ttMin(a.start) - ttMin(b.start));
  const offE = sorted.filter(e => e.official), ownE = sorted.filter(e => !e.official);
  const groups = TT_KIND_IDS.map(k => [k, ownE.filter(e => ttKindOf(e) === k)]).filter(g => g[1].length);
  const row = (e, x) => {
    const o = ov[e.id], fx = o && !e.official ? ttFixFor(C.entries, e, o[0].ds[0]) : null;
    const c = th.pal[e.color] || th.pal[0];
    return Object.assign({ key: e.id, e, bg: c, edge: ttShade(c, -0.4), sub: e.days.map(d => TT_DAYS[d - 1][2]).join(" ") + (e.place ? " · " + e.place : ""), time: fit(e),
      warn: o ? "Overlaps " + o.map(y => y.t).join(", ") : "", fix: fx, fixDay: o ? o[0].ds[0] : null, onClick: () => C.openForm(Object.assign({}, e)) }, x || {});
  };
  const nowKey = ttWeekKey(0, C.now), mon0 = ttMonday(0, C.now);
  const changes = [];
  Object.keys(C.ex).filter(k => k >= nowKey).sort().forEach(k => {
    const x = C.ex[k], offK = Math.round((new Date(k + "T12:00:00") - mon0) / (7 * 864e5));
    Object.keys(x.skip || {}).forEach(z => {
      const [id, d] = z.split(":"), e = C.entries.find(y => y.id === id);
      if (e) changes.push(row(e, { key: k + z, skipped: true, sub: "Off " + ttDshort(ttDateFor(+d, offK, C.now)).replace(",", "") + " · click to restore", warn: "", fix: null,
        aria: "Restore " + e.title, onClick: () => C.commit(doc => Object.assign({}, doc, { ex: ttWithWeek(doc.ex, offK, w => { delete w.skip[z]; return w; }, C.now) }), e.title + " is back on", true) }));
    });
    (x.once || []).forEach(e => changes.push(row(e, { key: k + e.id, once: true, sub: ttDshort(ttDateFor(e.days[0], offK, C.now)).replace(",", "") + (e.place ? " · " + e.place : ""), warn: "", fix: null,
      onClick: () => C.openForm(Object.assign({}, e, { origOnce: true }), { day: e.days[0], off: offK }) })));
  });
  const blocks = [];
  groups.forEach(([k, list]) => blocks.push({ head: (groups.length > 1 || offE.length) ? { label: TT_KIND_GROUPS[k], icon: TT_KINDS[k][1] } : null, rows: list.map(e => row(e)) }));
  if (offE.length) blocks.push({ head: { label: "From " + offE[0].source + " centre · kept in step", icon: "seal-check" }, rows: offE.map(e => row(e)) });
  if (changes.length) blocks.push({ head: { label: "One-offs and days off", icon: "calendar-dots" }, rows: changes });

  return (
    <aside className="tt-listpane" aria-labelledby="tt-week-h">
      <div className="tt-col tt-col--14 tt-col--list">
        <TtNote v={ttNoteView(C)} onDismiss={C.dismissNote}/>
        <TtSyncNote C={C}/>
        <div className="tt-listhead"><h2 id="tt-week-h">Your week</h2><span>{ttSummary(C.entries)}</span></div>
        {!started && <TtModePicker onMode={C.setMode} onImport={k => C.open("import", { tab: k })}/>}
        {started && (
          <form className="tt-qa" aria-label="Quick add" onSubmit={qa.submit}>
            <div className="tt-qa-row">
              <input ref={C.qaRef} className="tt-input tt-input--qa" value={qa.text} onChange={qa.onChange} aria-label="Add in plain words" placeholder={qa.mode.example} enterKeyHint="done" autoComplete="off"/>
              <button type="submit" className={"tt-qa-send" + (qa.q ? " is-ready" : "")} aria-label="Add"><TtIcon name="plus"/></button>
            </div>
            <TtQuickPreview q={qa.q} off={C.week} clock={C.s.clock} moreLabel="More options" onMore={qa.more} showGuess/>
            {!qa.text.trim() && qa.chips.length > 0 && (
              <div className="tt-chiprow tt-chiprow--wrap">{qa.chips.map(c => <button key={c} type="button" className="tt-chip tt-chip--36" onClick={() => qa.chip(c)}>+ {c}</button>)}</div>
            )}
          </form>
        )}
        {sugg.show && C.bp !== "desk3" && (
          <button type="button" className="tt-sugg tt-sugg--slim" onClick={() => C.open("plan")}>
            <TtIcon name="lightbulb" className="tt-sugg-icon"/>
            <span className="tt-sugg-text"><b>Plan study time</b><span>{sugg.short}</span></span>
            <TtIcon name="caret-right" className="tt-chev"/>
          </button>
        )}
        {C.entries.length > 0 && (
          <div className="tt-card">
            {blocks.map((b, bi) => (
              <React.Fragment key={bi}>
                {b.head && <div className={"tt-grouphead" + (bi ? " has-line" : "")}><TtIcon name={b.head.icon}/>{b.head.label}</div>}
                {b.rows.map(r => (
                  <div key={r.key} className={"tt-lrow-wrap" + (r.e.mine ? " is-mine" : "")}>
                    <button type="button" className={"tt-lrow" + (r.skipped ? " is-skipped" : "")} aria-label={r.aria || "Edit " + r.e.title} onClick={r.onClick}>
                      <span className="tt-swatch" style={{ background: r.bg, boxShadow: "inset 0 0 0 1px " + r.edge }}/>
                      <span className="tt-lrow-body">
                        <span className="tt-lrow-line">
                          <b className="tt-lrow-title">{r.e.title}</b>
                          {r.e.mine && <TtPill tone="mine">Your course</TtPill>}
                          {r.skipped && <TtPill tone="off">Off this week</TtPill>}
                          {r.once && <TtPill tone="gold">One-off</TtPill>}
                          {r.warn && !r.fix && <span className="tt-lrow-warn" title={r.warn} role="img" aria-label={r.warn}><TtIcon name="warning"/></span>}
                        </span>
                        <span className="tt-lrow-sub">{r.sub}</span>
                      </span>
                      <span className="tt-lrow-time">{r.time}</span>
                    </button>
                    {r.fix && <TtFixLine warn={r.warn} fix={r.fix} clock={C.s.clock} onFix={() => C.runFix(r.e, r.fixDay)}/>}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="tt-btnrow">
          <button type="button" className="tt-btn tt-btn--outline tt-btn--44 tt-btn--grow" onClick={() => C.openForm()}><TtIcon name="sliders-horizontal"/>Add with all options</button>
          <button type="button" className="tt-btn tt-btn--outline tt-btn--44" onClick={() => C.open("import", { tab: "centre" })}><TtIcon name="tray-arrow-down"/>Import</button>
        </div>
      </div>
    </aside>
  );
}

function TtThemeDots({ C, dark }) {
  return (
    <div role="radiogroup" aria-label="Theme" className={"tt-themedots" + (dark ? " is-dark" : "")}>
      {TT_THEME_IDS.map(k => {
        const t = TT_THEMES[k], on = C.s.theme === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={on} aria-label={t.name + " theme"} title={t.name} className={"tt-themedot" + (on ? " is-on" : "")}
            style={{ background: t.bg }} onClick={() => C.setS("theme", k)}><span style={{ background: t.dot }}/></button>
        );
      })}
    </div>
  );
}

function TtLookSelect({ C, dark }) {
  const sel = <select className={dark ? "tt-darkselect" : "tt-lookselect-input"} aria-label="Style" value={C.s.look} onChange={e => C.setS("look", e.target.value)}>
    {TT_LOOK_IDS.map(k => <option key={k} value={k}>{TT_LOOKS[k].name}</option>)}
  </select>;
  if (dark) return sel;
  return <label className="tt-lookselect" title="Style of the printed timetable"><TtIcon name="text-aa"/>{sel}</label>;
}

function TtPreviewPane({ C }) {
  const boxRef = React.useRef(null);
  const box = ttUseSize(boxRef);
  const model = React.useMemo(() => ttPosterModel(C.doc, { kind: "poster", orient: C.s.orient, paper: "a4", today: true, live: true, now: C.now }), [C.doc, C.s.orient, C.now]);
  const portrait = model.h > model.w;
  const maxH = portrait ? (C.W >= 1024 ? 860 : 800) : Infinity;
  const fr = ttFrame(C.entries, C.s.weekStart);
  const ori = ttOrientFor(C.s.orient, C.entries, C.s.weekStart);
  const caption = "A4 " + ori + (C.s.orient === "auto" ? " (picked for " + fr.days.length + " days)" : "") + " · " +
    (C.s.layout === "timeline" ? (ori === "portrait" ? "days run down, time runs across" : "time runs down the page") : (ori === "portrait" ? "a card for each day" : "a list under each day")) +
    " · today is highlighted here, not in downloads";
  const nv = ttNowView(C);
  const popRef = React.useRef(null);
  React.useEffect(() => {
    if (!C.popover) return undefined;
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target) && !(e.target.closest && e.target.closest(".tt-optbtn"))) C.setPopover(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [C.popover]);
  return (
    <section id="tt-main" className="tt-previewpane" aria-label="Preview" tabIndex={-1}>
      <div className="tt-col tt-col--14">
        <div className="tt-ptools">
          <TtThemeDots C={C}/>
          <span className="tt-vdiv tt-vdiv--strong" aria-hidden="true"/>
          <TtLookSelect C={C}/>
          <span className="tt-vdiv tt-vdiv--strong" aria-hidden="true"/>
          <TtSeg label="Layout" value={C.s.layout} size="32" onChange={v => C.setS("layout", v)}
            options={[{ value: "timeline", label: "Timeline", icon: "grid-four", title: "Classes placed by time" }, { value: "list", label: "List", icon: "list-bullets", title: "Classes listed under each day" }]}/>
          <TtSeg label="Orientation" value={C.s.orient} size="32" onChange={v => C.setS("orient", v)}
            options={[{ value: "auto", label: "Auto", icon: "magic-wand", title: "Orientation picked for your week" }, { value: "landscape", icon: "rectangle", aria: "Landscape" }, { value: "portrait", icon: "device-tablet", aria: "Portrait" }]}/>
          {C.bp !== "desk3" && <button type="button" className="tt-btn tt-btn--outline tt-btn--38 tt-btn--pill tt-optbtn" aria-expanded={C.popover} onClick={() => C.setPopover(!C.popover)}><TtIcon name="sliders-horizontal"/>Options</button>}
          <button type="button" className="tt-iconbtn tt-iconbtn--38 tt-iconbtn--outline" title="Full screen (F)" aria-label="Full screen" onClick={() => C.open("fs")}><TtIcon name="arrows-out"/></button>
          <span className="tt-grow"/>
          {C.W >= 1024 && C.W < 1200 && <span className="tt-nowline"><span className={"tt-dot tt-dot--" + nv.tone}/>{nv.text}</span>}
          {C.popover && (
            <div ref={popRef} className="tt-popover" role="dialog" aria-label="Print options">
              <TtPrintOptions doc={C.doc} variant="pop" hadAmPm={C.hadAmPm} orientNow={ori} termEnd={C.term && C.term.end} setS={C.setS} applyAll={(po, cs, ws, n) => ttApplySuggestions(C, po, cs, ws, n)}/>
            </div>
          )}
        </div>
        <div ref={boxRef} className="tt-stagebox">
          {box.w > 0 && <TtPosterStage model={model} width={box.w} maxHeight={maxH} className="tt-stage--preview" onOpen={() => C.open("fs")} label={"Preview of " + C.s.title + ". Open full screen"}/>}
        </div>
        <span className="tt-caption">{caption}</span>
      </div>
    </section>
  );
}

/** "Use N suggestions": every suggested toggle, the clock and the week start, as one undoable step. */
function ttApplySuggestions(C, po, clockSug, weekSug, n) {
  C.commit(d => {
    const ns = Object.assign({}, d.s);
    po.suggestions.forEach(r => { ns[r.key] = true; });
    if (clockSug) ns.clock = "12";
    if (weekSug) ns.weekStart = 7;
    return Object.assign({}, d, { s: ns });
  }, "Applied " + n + " suggestion" + (n === 1 ? "" : "s"), true);
}

function TtRail({ C }) {
  const nv = ttNowView(C);
  const sugg = ttSuggView(C);
  const th = TT_THEMES[C.s.theme] || TT_THEMES.paper;
  const w0 = ttWeekEx(C.ex, 0, C.now), d0 = C.T.day;
  const todays = C.entries.filter(e => e.days.includes(d0)).concat(w0.once.filter(e => e.days.includes(d0))).sort((a, b) => ttMin(a.start) - ttMin(b.start));
  const ori = ttOrientFor(C.s.orient, C.entries, C.s.weekStart);
  return (
    <aside className="tt-rail" aria-label="Today and print options">
      <div className="tt-col tt-col--16">
        <section className="tt-card tt-today" aria-labelledby="tt-today-h">
          <div className="tt-today-head"><h2 id="tt-today-h">Today · {ttDshort(ttDateFor(d0, 0, C.now)).replace(",", "")}</h2><span>{todays.length} on</span></div>
          {nv.tone !== "none" && (
            <div className={"tt-nowcard tt-nowcard--" + nv.tone}>
              <span className={"tt-dot tt-dot--" + nv.tone + " tt-dot--halo"}/>
              <span className="tt-nowcard-text"><span className="tt-nowcard-k">{nv.kicker}</span><b>{nv.title}</b><span>{nv.meta}</span></span>
            </div>
          )}
          {todays.map(e => {
            const sk = !e.once && !!w0.skip[e.id + ":" + d0], st = ttMin(e.start), en = ttMin(e.end);
            const isNow = !sk && st <= C.T.mins && en > C.T.mins;
            return (
              <button key={e.id} type="button" className={"tt-trow" + (sk ? " is-skipped" : "")} aria-label={"Edit " + e.title + " today"}
                onClick={() => C.openForm(Object.assign({}, e, { origOnce: !!e.once }), { day: d0, off: 0 })}>
                <span className="tt-trow-time">{ttFmt(st, C.s.clock)}</span>
                <span className="tt-trow-bar" style={{ background: ttShade(th.pal[e.color] || th.pal[0], -0.3) }}/>
                <span className="tt-trow-body"><b>{e.title}</b><span>{(sk ? "Off today · " : "") + ttFmt(st, C.s.clock) + "–" + ttFmt(en, C.s.clock) + (e.place ? " · " + e.place : "")}</span></span>
                {isNow && <TtPill tone="now">Now</TtPill>}
              </button>
            );
          })}
          {!todays.length && <div className="tt-today-none">Nothing today. {nv.tone === "none" ? "Add something with the box on the left." : ""}</div>}
          <div className="tt-today-foot">Click one to edit it or skip just today.</div>
        </section>
        {sugg.show && (
          <div className="tt-suggcard">
            <TtIcon name="lightbulb" className="tt-suggcard-icon"/>
            <div className="tt-suggcard-body">
              <span>{sugg.text}</span>
              <div className="tt-suggcard-actions">
                <button type="button" className="tt-btn tt-btn--primary tt-btn--36 tt-btn--pill" onClick={() => C.open("plan")}>Plan study time</button>
                <button type="button" className="tt-textbtn tt-textbtn--quiet" onClick={() => C.setSuggOff(true)}>Not now</button>
              </div>
            </div>
          </div>
        )}
        <section className="tt-card tt-card--pad8" aria-label="Print options">
          <TtPrintOptions doc={C.doc} variant="card" hadAmPm={C.hadAmPm} orientNow={ori} termEnd={C.term && C.term.end} setS={C.setS} applyAll={(po, cs, ws, n) => ttApplySuggestions(C, po, cs, ws, n)}/>
        </section>
      </div>
    </aside>
  );
}
