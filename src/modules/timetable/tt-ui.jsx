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

/* ── "What's your week like?" (§7.1) ── */

function TtModePicker({ C }) {
  return (
    <div className="tt-modes">
      <div className="tt-modes-head">
        <span className="tt-modes-title">What’s your week like?</span>
        <span>Pick the closest. It sets lengths and suggestions; you can still add anything.</span>
      </div>
      <div className="tt-modes-grid">
        {TT_MODE_IDS.map(k => {
          const m = TT_MODES[k];
          return (
            <button key={k} type="button" className="tt-mode" onClick={() => C.setMode(k)}>
              <span className="tt-tile tt-tile--36 tt-tile--gold"><TtIcon name={m.icon}/></span>
              <b>{m.label}</b>
              <span>{m.sub}</span>
            </button>
          );
        })}
      </div>
      <div className="tt-card">
        {[["map-pin", "My NGG centre", "Load Egbeda, Ayobo or Online sessions", "centre"], ["clipboard-text", "Paste a timetable", "From a spreadsheet or a WhatsApp message", "paste"]].map(([icon, l, d, tab]) => (
          <button key={tab} type="button" className="tt-startrow" onClick={() => C.open("import", { tab })}>
            <TtIcon name={icon} className="tt-startrow-icon"/>
            <span className="tt-startrow-text"><b>{l}</b><span>{d}</span></span>
            <TtIcon name="caret-right" className="tt-startrow-chev"/>
          </button>
        ))}
      </div>
    </div>
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
