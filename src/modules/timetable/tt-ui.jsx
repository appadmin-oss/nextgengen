/* ============================================================================
   Timetable Maker v5 — shared controls.

   What every tree and every layer uses: the layer shell (sheet, drawer or
   dialog, with a focus trap that hands focus back to whatever opened it),
   segmented controls, switches, pills, the print options, the mode picker,
   the quick-add preview and the size hook. One of each, so a phone sheet and a
   desktop popover cannot drift apart.
   ========================================================================== */

/** A Phosphor icon, regular weight, decorative. */
function TtIcon({ name, className }) {
  return <i className={"ph ph-" + name + (className ? " " + className : "")} aria-hidden="true"/>;
}

/**
 * Width and height of an element, kept current by a ResizeObserver — never
 * window.innerWidth (§3.1). It checks the ref after every render, because the
 * element often mounts after the hook's first run (a drawer's preview box) and
 * nothing else would make it look again.
 */
function ttUseSize(ref, active) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const watch = React.useRef({ el: null, ro: null });
  React.useLayoutEffect(() => {
    const el = active === false ? null : ref.current;
    if (watch.current.el === el) return;
    if (watch.current.ro) watch.current.ro.disconnect();
    watch.current = { el, ro: null };
    if (!el) return;
    const read = () => setSize(p => (Math.abs(p.w - el.clientWidth) > 1 || Math.abs(p.h - el.clientHeight) > 1) ? { w: el.clientWidth, h: el.clientHeight } : p);
    read();
    if (window.ResizeObserver) { watch.current.ro = new ResizeObserver(read); watch.current.ro.observe(el); }
  });
  React.useEffect(() => () => { if (watch.current.ro) watch.current.ro.disconnect(); }, []);
  return size;
}

const TT_FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A layer: a modal dialog, labelled, focus held inside it and returned to the
 * trigger when it closes (§7.12). `variant` is its geometry — sheet and
 * sheet-tall on a phone, form-left / form-right for the class form,
 * drawer-right for downloads, centre and keys for dialogs, fs for full screen.
 * A layer that submits wraps its body in a form; the dialog itself stays a
 * div, since a <form> may not carry role="dialog".
 */
function TtLayer({ variant, scrim, labelledBy, label, onClose, onSubmit, className, initialFocus, children }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const trigger = document.activeElement;
    const node = ref.current;
    const id = setTimeout(() => {
      if (!node || node.contains(document.activeElement)) return;
      const el = (initialFocus && node.querySelector(initialFocus)) || node.querySelector(TT_FOCUSABLE);
      if (el) el.focus();
    }, 30);
    return () => {
      clearTimeout(id);
      if (trigger && typeof trigger.focus === "function" && document.contains(trigger)) setTimeout(() => trigger.focus(), 0);
    };
    // Mount and unmount only: focus moves in once and back once.
    // eslint-disable-next-line
  }, []);
  const onKeyDown = e => {
    if (e.key !== "Tab" || !ref.current) return;
    const f = Array.from(ref.current.querySelectorAll(TT_FOCUSABLE)).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const sheet = variant === "sheet" || variant === "sheet-tall";
  return (
    <div className={"tt-scrim tt-scrim--" + (scrim || "phone")} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label}
        className={"tt-layer tt-layer--" + variant + (className ? " " + className : "")} onKeyDown={onKeyDown}>
        {sheet && <div className="tt-grab" aria-hidden="true"><span/></div>}
        {onSubmit ? <form className="tt-layer-form" onSubmit={onSubmit} noValidate>{children}</form> : children}
      </div>
    </div>
  );
}

function TtClose({ onClick, label, className }) {
  return <button type="button" className={"tt-iconbtn tt-iconbtn--44 tt-iconbtn--round" + (className ? " " + className : "")} onClick={onClick} aria-label={label || "Close"}><TtIcon name="x"/></button>;
}

/** The header of a layer: an optional back button, the title (and a line under it), the close button. */
function TtLayerHead({ id, title, sub, onClose, back, line, extra }) {
  return (
    <div className={"tt-lhead" + (sub ? " tt-lhead--sub" : "") + (line ? " tt-lhead--line" : "")}>
      {back && <button type="button" className="tt-iconbtn tt-iconbtn--44 tt-iconbtn--round" aria-label={back.label} onClick={back.onClick}><TtIcon name="caret-left"/></button>}
      <div className={"tt-lhead-text" + (back || !line ? "" : " is-padded")}>
        <h2 id={id} className="tt-lhead-title">{title}</h2>
        {sub && <span className="tt-lhead-sub">{sub}</span>}
      </div>
      {extra}
      <TtClose onClick={onClose}/>
    </div>
  );
}

/**
 * A segmented control: radios on a track, the chosen one white with a shadow
 * (§3.4's exception). Arrow keys move the choice. track: pill | box | dark;
 * size: the option height.
 */
function TtSeg({ label, value, options, onChange, track, size, full, className }) {
  const i = options.findIndex(o => o.value === value);
  const move = (e, d) => { e.preventDefault(); onChange(options[(Math.max(0, i) + d + options.length) % options.length].value); };
  return (
    <div role="radiogroup" aria-label={label} className={"tt-seg tt-seg--" + (track || "pill") + " tt-seg--h" + (size || "32") + (full ? " tt-seg--full" : "") + (className ? " " + className : "")}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} aria-label={o.aria} title={o.title || o.aria}
            tabIndex={on || (i < 0 && o === options[0]) ? 0 : -1} className={"tt-seg-opt" + (on ? " is-on" : "")} onClick={() => onChange(o.value)}
            onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowDown") move(e, 1); if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(e, -1); }}>
            {o.icon && <TtIcon name={o.icon}/>}{o.label}
          </button>
        );
      })}
    </div>
  );
}

function TtSwitch({ on, label, disabled, onChange, big }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled}
      className={"tt-switch" + (big ? " tt-switch--big" : "") + (on && !disabled ? " is-on" : "")} onClick={() => onChange(!on)}>
      <span/>
    </button>
  );
}

function TtPill({ tone, children }) { return <span className={"tt-pill tt-pill--" + tone}>{children}</span>; }

/* ── Print options (§7.13): one component, three placements ── */

/**
 * variant: pop (desktop-2 popover), card (desktop-3 right column), phone (the
 * More sheet's toggle list, clock and week start). The data — descriptions,
 * suggestions, what cannot apply — is ttPrintOptions's.
 */
function TtPrintOptions({ C, variant }) {
  const doc = C.doc, s = doc.s;
  const orientNow = ttOrientFor(s.orient, doc.entries, s.weekStart);
  const po = ttPrintOptions(doc, orientNow, C.hadAmPm);
  const phone = variant === "phone";
  const toggles = po.rows.map(r => (
    <div key={r.key} className={"tt-opt-row" + (r.disabled ? " is-disabled" : "")}>
      <span className="tt-opt-text">
        <span className="tt-opt-label">{r.label}{r.suggested && <TtPill tone="gold">Suggested</TtPill>}</span>
        <span className={"tt-opt-desc" + (r.suggested ? " is-suggested" : "")}>{r.desc}</span>
      </span>
      <TtSwitch big={phone} on={!!s[r.key]} label={r.label} disabled={r.disabled} onChange={v => C.setS(r.key, v)}/>
    </div>
  ));
  const pair = (
    <div className="tt-opt-pair">
      <TtSeg label="Clock" track="box" size={phone ? "44" : "32"} full value={s.clock} onChange={v => C.setS("clock", v)} options={[{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }]}/>
      <TtSeg label="Week starts" track="box" size={phone ? "44" : "32"} full value={s.weekStart} onChange={v => C.setS("weekStart", v)} options={[{ value: 1, label: "Mon first" }, { value: 7, label: "Sun first" }]}/>
    </div>
  );
  const hint = <span className={"tt-opt-hint" + (po.hintSuggested ? " is-suggested" : "")}>{po.hint}</span>;
  if (phone) return <>
    <div className="tt-card tt-optlist">{toggles}</div>
    {pair}
    {hint}
  </>;
  const ideas = ttNoteIdeas(doc, C.term && C.term.end);
  return (
    <div className={"tt-opts tt-opts--" + variant}>
      <div className="tt-opts-head">
        <span className="tt-opts-title"><b>Print options</b><span>{po.summary}</span></span>
        {po.nApply > 0 && (
          <button type="button" className="tt-btn tt-btn--suggest" onClick={() => C.commit(d => Object.assign({}, d, { s: ttApplySuggested(d.s, po) }), "Applied " + po.nApply + " suggestion" + (po.nApply === 1 ? "" : "s"), true)}>
            <TtIcon name="magic-wand"/>Use {po.nApply} suggestion{po.nApply === 1 ? "" : "s"}
          </button>
        )}
      </div>
      {toggles}
      <div className="tt-opts-sec">{pair}{hint}</div>
      <div className="tt-opts-sec">
        <label className="tt-field tt-field--small">
          <span className="tt-field-label">Footer note</span>
          <input className="tt-input tt-input--note" value={s.note} maxLength={120} placeholder="A reminder printed at the bottom" onChange={e => C.setS("note", e.target.value)}/>
        </label>
        {ideas.length > 0 && <div className="tt-chiprow tt-chiprow--wrap">{ideas.map(n => <button key={n} type="button" className="tt-chip tt-chip--note" onClick={() => C.setS("note", n)}>+ {n}</button>)}</div>}
      </div>
    </div>
  );
}

/* ── Making your week, in three steps ──
   A child said "I am having trouble doing my timetable", and the owner found
   creating one confusing: the maker opened on six equal choices and two more
   buttons, and a member's own NGG classes were not in it. It now opens on the
   three things a week is made of — your NGG classes, your school lessons, your
   study time — each with one button and a tick once done. They are help, not
   a gate: the add box is there from the start and anything can be built
   freely. The kinds of week (§7.1) are presets that only change the
   suggestions. The steps stay until the week has lessons and study time in
   it, and can be hidden. */
function TtStartSteps({ C }) {
  const [hidden, setHidden] = React.useState(false);
  const own = C.entries.filter(e => !e.official);
  const done = { ngg: C.entries.some(e => e.official), school: own.some(e => ttKindOf(e) === "class" || ttKindOf(e) === "activity"), study: own.some(e => ttKindOf(e) === "study") };
  if (hidden || (done.school && done.study)) return null;
  const typeIn = () => setTimeout(() => C.qaRef.current && C.qaRef.current.focus(), 60);
  const steps = [
    ["ngg", "Your NGG classes", done.ngg ? "In your week, and kept in step with your centre." : "Your centre’s Saturday classes, with your own course marked.",
      <button type="button" className="tt-btn tt-btn--outline tt-btn--ctl" onClick={() => C.open("import", { tab: "centre" })}>{done.ngg ? "Change centre" : "Add my centre’s classes"}</button>],
    ["school", "Your school lessons", done.school ? "Added. Add more any time in the add box." : "Type one at a time, like “Maths Mon Wed 8–8:40”, or paste the list from WhatsApp.",
      done.school ? null : <span className="tt-row8"><button type="button" className="tt-btn tt-btn--primary tt-btn--ctl" onClick={typeIn}>Type a lesson</button><button type="button" className="tt-btn tt-btn--outline tt-btn--ctl" onClick={() => C.open("import", { tab: "paste" })}>Paste a list</button></span>],
    ["study", "Your study time", done.study ? "Planned." : "We fit study sessions into the free time around everything else.",
      done.study ? null : <button type="button" className="tt-btn tt-btn--outline tt-btn--ctl" disabled={!C.entries.length} onClick={() => C.open("plan")}>Plan my study time</button>],
  ];
  return (
    <section className="tt-steps" aria-labelledby="tt-steps-h">
      <div className="tt-modes-head">
        <h3 className="tt-modes-title" id="tt-steps-h">Not sure where to start?</h3>
        <span>Type anything into the add box, in your own words, or follow these steps. It saves as you go.</span>
      </div>
      <ol className="tt-steps-list">
        {steps.map(([k, title, sub, act], i) => (
          <li key={k} className={"tt-step" + (done[k] ? " is-done" : "")}>
            <span className="tt-step-n" aria-hidden="true">{done[k] ? <TtIcon name="check"/> : i + 1}</span>
            <span className="tt-step-body"><b>{title}{done[k] ? <span className="tt-sr"> (done)</span> : null}</b><span>{sub}</span>{act}</span>
          </li>
        ))}
      </ol>
      <div className="tt-steps-other" role="group" aria-label="Suggestions for">
        <span>Suggestions for:</span>
        {TT_MODE_IDS.map(k => <button key={k} type="button" aria-pressed={C.s.mode === k} className={"tt-chip tt-chip--36" + (C.s.mode === k ? " is-on" : "")} onClick={() => C.setMode(k)}>{TT_MODES[k].label}</button>)}
      </div>
      {C.entries.length > 0 && <button type="button" className="tt-linkbtn" onClick={() => setHidden(true)}>Hide these steps</button>}
    </section>
  );
}

/* ── Quick add: what was understood (§7.2) ── */

function TtQuickPreview({ q, C, moreLabel, onMore, showGuess }) {
  if (!q) return null;
  const e = q.e;
  const when = e.once ? "Only " + ttDshort(ttDateFor(e.days[0], C.week, C.now)) : e.days.map(d => TT_DAYS[d - 1][2]).join(" ");
  const line = [when, ttFmt(ttMin(e.start), C.s.clock) + "–" + ttFmt(ttMin(e.end), C.s.clock), e.place].filter(Boolean).join(" · ");
  return (
    <div className="tt-qa-preview" role="status">
      <TtIcon name={TT_KINDS[e.kind][1]} className="tt-qa-kind"/>
      <span className="tt-qa-text">
        <b>{e.title}</b>
        <span>{line}</span>
        {showGuess && q.guessed && <span className="tt-qa-guess">No time given, so it uses your next free slot</span>}
      </span>
      <button type="button" className="tt-textbtn" onClick={onMore}>{moreLabel}</button>
    </div>
  );
}
