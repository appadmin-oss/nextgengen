/* ============================================================================
   ID Card Studio — small parts every tab uses: icon, toast with Undo,
   segmented control, switch, dialog, and the container-width hook.
   ========================================================================== */

function IdsIcon({ name, className }) {
  return <i className={"ph ph-" + name + (className ? " " + className : "")} aria-hidden="true"/>;
}

/** Width of an element, kept current by a ResizeObserver: the layout follows the studio's own width, never the window's. */
function idsUseWidth(ref) {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(Math.round(el.getBoundingClientRect().width));
    read();
    if (!window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** One toast at a time. say(text, undo?) — an Undo toast stays 6.5s, others 3.8s. */
function idsUseToast() {
  const [t, setT] = React.useState(null);
  const timer = React.useRef(0);
  const say = React.useCallback((text, undo) => {
    clearTimeout(timer.current);
    setT({ text, undo: undo || null, id: Date.now() });
    timer.current = setTimeout(() => setT(null), undo ? 6500 : 3800);
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const node = t && (
    <div className="ids-toast" role="status" aria-live="polite" key={t.id}>
      <span>{t.text}</span>
      {t.undo && <button type="button" className="ids-toast-undo" onClick={() => { t.undo(); setT(null); }}>Undo</button>}
    </div>
  );
  return [say, node];
}

/** A segmented control: a radio group whose options are buttons; arrows move and select. */
function IdsSeg({ label, value, options, onChange, className, size }) {
  const refs = React.useRef([]);
  const idx = Math.max(0, options.findIndex(o => o[0] === value));
  const key = (e, i) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    let j = i;
    for (let n = 0; n < options.length; n++) { j = (j + d + options.length) % options.length; if (!options[j][3]) break; }
    onChange(options[j][0]);
    if (refs.current[j]) refs.current[j].focus();
  };
  return (
    <div className={"ids-seg" + (size ? " ids-seg--" + size : "") + (className ? " " + className : "")} role="radiogroup" aria-label={label}>
      {options.map(([k, l, icon, disabled], i) => (
        <button key={k} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={k === value} tabIndex={i === idx ? 0 : -1}
                disabled={!!disabled} className={"ids-seg-opt" + (k === value ? " is-on" : "")} onClick={() => onChange(k)} onKeyDown={e => key(e, i)}>
          {icon && <IdsIcon name={icon}/>}{l}
        </button>
      ))}
    </div>
  );
}

function IdsSwitch({ on, onChange, label, help, id }) {
  return (
    <label className="ids-switchrow" htmlFor={id}>
      <span className="ids-grow"><span className="ids-switch-l">{label}</span>{help && <span className="ids-help">{help}</span>}</span>
      <button id={id} type="button" role="switch" aria-checked={on} className={"ids-switch" + (on ? " is-on" : "")} onClick={() => onChange(!on)}><span/></button>
    </label>
  );
}

/** A number field in mm (or a count) that clamps on blur, not on every keystroke. */
/* `inline`: the label and its help on the left, a small field on the right (the "skip used slots" row). */
function IdsNum({ label, value, min, max, step, unit, onChange, id, inline, help }) {
  const [txt, setTxt] = React.useState(String(value));
  React.useEffect(() => { setTxt(String(value)); }, [value]);
  const commit = () => {
    const n = Number(txt);
    const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    setTxt(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <label className={"ids-num" + (inline ? " ids-num--inline" : "")} htmlFor={id}>
      {inline ? <span className="ids-grow"><span className="ids-num-l">{label}</span>{help && <span className="ids-help">{help}</span>}</span> : <span className="ids-num-l">{label}</span>}
      <span className="ids-num-box">
        <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step || 1} value={txt}
               onChange={e => setTxt(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); }}/>
        {unit && <span className="ids-num-u">{unit}</span>}
      </span>
    </label>
  );
}

/**
 * A dialog: focus moves in, Tab stays in, Escape closes, focus goes back to
 * what opened it. `alert` makes it an alertdialog (the print confirm).
 */
function IdsDialog({ title, sub, onClose, children, footer, width, alert, className }) {
  const ref = React.useRef(null);
  const back = React.useRef(null);
  const id = React.useMemo(() => "ids-dlg-" + Math.random().toString(36).slice(2, 8), []);
  React.useEffect(() => {
    back.current = document.activeElement;
    const el = ref.current;
    const first = el && el.querySelector("[data-autofocus], button, input, select, [tabindex='0']");
    if (first) first.focus();
    return () => { if (back.current && back.current.focus && back.current.isConnected) back.current.focus(); };
  }, []);
  const trap = e => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const f = Array.from(ref.current.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex='0']"));
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };
  return (
    <div className="ids-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={"ids-dialog" + (className ? " " + className : "")} role={alert ? "alertdialog" : "dialog"} aria-modal="true"
           aria-labelledby={id + "-t"} style={width ? { width: "min(" + width + "px, calc(100% - 24px))" } : undefined} onKeyDown={trap}>
        <div className="ids-dialog-head">
          <h2 id={id + "-t"}>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="ids-dialog-body">{children}</div>
        {footer && <div className="ids-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** A tinted check row (§3.3): tone ok | warn | bad | info, with an optional action link. */
function IdsCheck({ tone, text, action, onAction }) {
  const icon = { ok: "check-circle", warn: "warning", bad: "warning-octagon", info: "info" }[tone];
  return (
    <div className={"ids-check is-" + tone}>
      <IdsIcon name={icon}/>
      <span className="ids-grow">{text}</span>
      {action && <button type="button" className="ids-linkbtn" onClick={onAction}>{action}</button>}
    </div>
  );
}

/** A pill in one of the five tones. */
function IdsPill({ tone, children, icon }) {
  return <span className={"ids-pill is-" + (tone || "neutral")}>{icon && <IdsIcon name={icon}/>}{children}</span>;
}
