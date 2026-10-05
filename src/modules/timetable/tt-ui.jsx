/* ============================================================================
   Timetable Maker v5 — shared controls.

   The pieces every tree and every layer uses: the layer shell (dialog,
   drawer or bottom sheet, with a focus trap that hands focus back to whatever
   opened it), segmented controls, switches, the print options, the mode
   picker and the quick-add preview. One of each, so a phone sheet and a
   desktop popover cannot drift apart.
   ========================================================================== */

/** Phosphor, regular weight, decorative. */
function TtIcon({ name, className }) {
  return <i className={"ph ph-" + name + (className ? " " + className : "")} aria-hidden="true"/>;
}

/**
 * A layer: role="dialog" (or alertdialog), modal, labelled, focus kept inside
 * and returned to the trigger when it closes. `variant` decides the geometry:
 * sheet (phone, from the bottom), sheet-tall (phone, from 52px), form-left /
 * form-right (the class form), drawer-right (downloads), centre (dialogs).
 */
function TtLayer({ variant, labelledBy, label, onClose, children, className, scrim, as, onSubmit, initialFocus }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const trigger = document.activeElement;
    const node = ref.current;
    const first = initialFocus && node && node.querySelector(initialFocus);
    const fallback = node && node.querySelector("[data-tt-autofocus]") || node && node.querySelector("button, [href], input, select, textarea");
    setTimeout(() => { const el = first || fallback; if (el && document.activeElement !== el && node.contains(el) === true && !node.contains(document.activeElement)) el.focus(); }, 30);
    return () => { if (trigger && typeof trigger.focus === "function" && document.contains(trigger)) setTimeout(() => trigger.focus(), 0); };
    // eslint-disable-next-line
  }, []);
  const onKeyDown = e => {
    if (e.key !== "Tab" || !ref.current) return;
    const f = Array.from(ref.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  // The dialog is always a div (a <form> may not carry role="dialog"); a layer that submits wraps its body in one.
  const body = as === "form" ? <form className="tt-layer-form" onSubmit={onSubmit} noValidate>{children}</form> : children;
  return (
    <div className={"tt-scrim tt-scrim--" + (scrim || "phone")} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={"tt-layer tt-layer--" + variant + (className ? " " + className : "")} role="dialog" aria-modal="true"
        aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} onKeyDown={onKeyDown}>
        {(variant === "sheet" || variant === "sheet-tall") && <div className="tt-grab" aria-hidden="true"><span/></div>}
        {body}
      </div>
    </div>
  );
}

function TtClose({ onClick, label }) {
  return <button type="button" className="tt-iconbtn tt-iconbtn--44" onClick={onClick} aria-label={label || "Close"}><TtIcon name="x"/></button>;
}

/** A pill or rounded segmented control: white option + shadow on a track. */
function TtSeg({ label, value, options, onChange, size, track, dark, className }) {
  return (
    <div role="radiogroup" aria-label={label} className={"tt-seg tt-seg--" + (track || "pill") + (size ? " tt-seg--" + size : "") + (dark ? " tt-seg--dark" : "") + (className ? " " + className : "")}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} aria-label={o.aria} title={o.title || o.aria}
            className={"tt-seg-opt" + (on ? " is-on" : "")} onClick={() => onChange(o.value)}
            onKeyDown={e => {
              const i = options.findIndex(x => x.value === value);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onChange(options[(i + 1) % options.length].value); }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onChange(options[(i - 1 + options.length) % options.length].value); }
            }}>
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
      className={"tt-switch" + (big ? " tt-switch--big" : "") + (on && !disabled ? " is-on" : "")} onClick={() => !disabled && onChange(!on)}>
      <span/>
    </button>
  );
}

function TtPill({ tone, children }) { return <span className={"tt-pill tt-pill--" + tone}>{children}</span>; }

/* ── Print options (§7.13): the popover, the right-column card and the phone list ── */

function TtPrintOptions({ doc, setS, applyAll, hadAmPm, orientNow, termEnd, variant }) {
  const po = ttPrintOptions(doc, orientNow, hadAmPm);
  const s = doc.s;
  const clockSuggested = hadAmPm && s.clock !== "12";
  const weekSuggested = /starts on Sunday/.test(po.hint) && po.hintSuggested;
  const nApply = po.suggestions.length + (clockSuggested ? 1 : 0) + (weekSuggested ? 1 : 0);
  const ideas = ttNoteIdeas(doc, termEnd);
  const phone = variant === "phone";
  const toggles = po.rows.map((r, i) => (
    <div key={r.key} className={"tt-opt-row" + (r.disabled ? " is-disabled" : "")}>
      <span className="tt-opt-text">
        <span className="tt-opt-label">{r.label}{r.suggested && <TtPill tone="gold">Suggested</TtPill>}</span>
        <span className={"tt-opt-desc" + (r.suggested ? " is-suggested" : "")}>{r.desc}</span>
      </span>
      <TtSwitch big={phone} on={!!s[r.key]} label={r.label} disabled={r.disabled} onChange={v => setS(r.key, v)}/>
    </div>
  ));
  const clockWeek = (
    <div className="tt-opt-pair">
      <TtSeg label="Clock" track="box" size={phone ? "44" : "32"} value={s.clock} onChange={v => setS("clock", v)} options={[{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }]}/>
      <TtSeg label="Week starts" track="box" size={phone ? "44" : "32"} value={s.weekStart} onChange={v => setS("weekStart", v)} options={[{ value: 1, label: "Mon first" }, { value: 7, label: "Sun first" }]}/>
    </div>
  );
  if (phone) return <>
    <div className="tt-card tt-card--list">{toggles}</div>
    {clockWeek}
    <span className={"tt-opt-hint" + (po.hintSuggested ? " is-suggested" : "")}>{po.hint}</span>
  </>;
  return (
    <div className={"tt-opts tt-opts--" + variant}>
      <div className="tt-opts-head">
        <span className="tt-opts-title"><b>Print options</b><span>{po.summary}</span></span>
        {nApply > 0 && <button type="button" className="tt-btn tt-btn--outline-ink tt-btn--34" onClick={() => applyAll(po, clockSuggested, weekSuggested, nApply)}><TtIcon name="magic-wand"/>Use {nApply} suggestion{nApply === 1 ? "" : "s"}</button>}
      </div>
      {toggles}
      <div className="tt-opts-sec">
        {clockWeek}
        <span className={"tt-opt-hint" + (po.hintSuggested ? " is-suggested" : "")}>{po.hint}</span>
      </div>
      <div className="tt-opts-sec">
        <label className="tt-field tt-field--small">
          <span className="tt-field-label">Footer note</span>
          <input className="tt-input tt-input--40" value={s.note} maxLength={120} placeholder="A reminder printed at the bottom" onChange={e => setS("note", e.target.value)}/>
        </label>
        {ideas.length > 0 && <div className="tt-chiprow tt-chiprow--wrap">{ideas.map(n => <button key={n} type="button" className="tt-chip tt-chip--32" onClick={() => setS("note", n)}>+ {n}</button>)}</div>}
      </div>
    </div>
  );
}

/* ── The mode picker (§7.1) ── */

function TtModePicker({ onMode, onImport }) {
  return (
    <div className="tt-modes">
      <div className="tt-modes-head"><span className="tt-modes-title">What’s your week like?</span><span>Pick the closest. It sets lengths and suggestions; you can still add anything.</span></div>
      <div className="tt-modes-grid">
        {TT_MODE_IDS.map(k => {
          const m = TT_MODES[k];
          return (
            <button key={k} type="button" className="tt-mode" onClick={() => onMode(k)}>
              <span className="tt-tile tt-tile--36 tt-tile--gold"><TtIcon name={m.icon}/></span>
              <b>{m.label}</b><span>{m.sub}</span>
            </button>
          );
        })}
      </div>
      <div className="tt-card tt-card--list">
        {[["map-pin", "My NGG centre", "Load Egbeda, Ayobo or Online sessions", "centre"], ["clipboard-text", "Paste a timetable", "From a spreadsheet or a WhatsApp message", "paste"]].map(([icon, l, d, k]) => (
          <button key={k} type="button" className="tt-startrow" onClick={() => onImport(k)}>
            <TtIcon name={icon} className="tt-gold-ink"/>
            <span className="tt-startrow-text"><b>{l}</b><span>{d}</span></span>
            <TtIcon name="caret-right"/>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Quick add: what was understood (§7.2) ── */

function ttPreviewLine(q, off, clock) {
  if (!q) return "";
  const e = q.e;
  return [e.once ? "Only " + ttDshort(ttDateFor(e.days[0], off)) : e.days.map(d => TT_DAYS[d - 1][2]).join(" "),
    ttFmt(ttMin(e.start), clock) + "–" + ttFmt(ttMin(e.end), clock), e.place].filter(Boolean).join(" · ");
}

function TtQuickPreview({ q, off, clock, moreLabel, onMore, showGuess }) {
  if (!q) return null;
  return (
    <div className="tt-qa-preview" role="status">
      <TtIcon name={TT_KINDS[q.e.kind][1]} className="tt-gold-ink tt-qa-kind"/>
      <span className="tt-qa-preview-text">
        <b>{q.e.title}</b>
        <span>{ttPreviewLine(q, off, clock)}</span>
        {showGuess && q.guessed && <span className="tt-qa-guess">No time given, so it uses your next free slot</span>}
      </span>
      <button type="button" className="tt-textbtn" onClick={onMore}>{moreLabel}</button>
    </div>
  );
}
