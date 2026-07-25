/* ================================================================
   NGG — UX safety net: React ErrorBoundary + Toast system.
   Load before any page component.
   ================================================================ */

/* A boundary scoped to ONE block, unlike the page-level ErrorBoundary below.
   Where that one is right for "the app broke, stop everything", this keeps a
   single bad item from taking its whole list down: a card whose record is
   missing a field renders a placeholder in its own slot and every other card
   still draws. Blanking an entire roster because of one row is the worst
   possible failure for a screen whose job is to show the roster. */
class SafeBlock extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("[NGG SafeBlock]", this.props.label || "", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback || null;
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Best-effort report to the backend audit log.
    if (typeof NGGApi !== "undefined") {
      try {
        fetch("/api/public/stats.php", { method: "GET" }); // warm a noop so we know we're online
      } catch (_) {}
    }
    // Log to the console so we can see it in dev.
    console.error("[NGG ErrorBoundary]", error, errorInfo);
  }
  reset = () => {
    this.setState({ error: null, errorInfo: null });
    // Go home — a fresh tree gives the user a clean state.
    if (window.__navigate) window.__navigate("home");
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boundary">
        <div className="boundary-inner">
          <div className="mono boundary-eyebrow">SOMETHING BROKE</div>
          <h1 className="display boundary-h">Hold on.</h1>
          <p className="boundary-p">
            We hit an unexpected error and stopped the page so nothing worse happens.
            Try refreshing — if it keeps happening, screenshot this and send to the team.
          </p>
          {this.state.error && (
            <details className="boundary-detail">
              <summary>What happened</summary>
              <code>{String(this.state.error.message || this.state.error)}</code>
            </details>
          )}
          <div className="boundary-actions">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Refresh</button>
            <button className="btn btn-ghost" onClick={this.reset}>Back to home</button>
          </div>
        </div>
      </div>
    );
  }
}

// ============================================================================
// Toast system — global pub/sub, mounted once near the App root.
// API:  toast.success("…")  toast.error("…")  toast.info("…")  toast.show({...})
// ============================================================================

const _toastListeners = new Set();
let _toastSeq = 0;

const toast = {
  show(opts) {
    const t = Object.assign(
      { id: ++_toastSeq, kind: "info", title: "", body: "", ttl: 4200, action: null },
      typeof opts === "string" ? { body: opts } : opts
    );
    _toastListeners.forEach(fn => fn({ type: "add", toast: t }));
    if (t.ttl > 0) {
      setTimeout(() => toast.dismiss(t.id), t.ttl);
    }
    return t.id;
  },
  success(body, title) { return this.show({ kind: "success", title: title || "Done", body }); },
  error(body, title)   { return this.show({ kind: "error",   title: title || "Heads up", body, ttl: 6500 }); },
  info(body, title)    { return this.show({ kind: "info",    title: title || "", body }); },
  warn(body, title)    { return this.show({ kind: "warn",    title: title || "Heads up", body, ttl: 6500 }); },
  dismiss(id) { _toastListeners.forEach(fn => fn({ type: "remove", id })); },
};

function ToastHost() {
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    const fn = (evt) => {
      if (evt.type === "add") {
        setList(L => [...L, evt.toast]);
      } else if (evt.type === "remove") {
        setList(L => L.filter(t => t.id !== evt.id));
      }
    };
    _toastListeners.add(fn);
    return () => _toastListeners.delete(fn);
  }, []);

  return (
    <div className="toast-host" role="region" aria-live="polite" aria-label="Notifications">
      {list.map(t => (
        <div key={t.id} className={"toast toast-" + t.kind} role="status">
          <div className="toast-icon" aria-hidden="true">
            {t.kind === "success" ? "✓" : t.kind === "error" ? "!" : t.kind === "warn" ? "⚠" : "i"}
          </div>
          <div className="toast-body">
            {t.title && <div className="toast-title">{t.title}</div>}
            {t.body && <div className="toast-text">{t.body}</div>}
            {t.action && (
              <button className="toast-action" onClick={() => { try { t.action.onClick(); } catch (_) {} toast.dismiss(t.id); }}>
                {t.action.label} →
              </button>
            )}
          </div>
          <button className="toast-close" aria-label="Dismiss" onClick={() => toast.dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

// Skip-to-content link — sits hidden until focused, helps keyboard users.
// Focuses #main programmatically instead of navigating to #main, because
// the hash router would treat "main" as an unknown page and show the 404.
function SkipLink() {
  const onSkip = (e) => {
    e.preventDefault();
    const main = document.getElementById("main");
    if (!main) return;
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: false });
    main.scrollIntoView();
  };
  return <a className="skip-link" href="#main" onClick={onSkip}>Skip to content</a>;
}

// ============================================================================
// Dialog system — promise-based replacement for window.confirm / window.prompt.
// Use:   await dialog.confirm({ title, body, cta, cancel, danger });   // → bool
//        await dialog.prompt({ title, label, placeholder, multiline }); // → string|null
// A single host is mounted by App; calls open it from anywhere.
// ============================================================================

const _dialogListeners = new Set();
let _dialogSeq = 0;

const dialog = {
  _open(opts) {
    return new Promise((resolve) => {
      const id = ++_dialogSeq;
      const payload = Object.assign({ id, resolve }, opts);
      _dialogListeners.forEach(fn => fn(payload));
    });
  },
  confirm(opts) {
    const o = typeof opts === "string" ? { body: opts } : (opts || {});
    return this._open({
      kind: "confirm",
      title: o.title || "Are you sure?",
      body: o.body || "",
      cta: o.cta || "Confirm",
      cancel: o.cancel || "Cancel",
      danger: !!o.danger,
    });
  },
  prompt(opts) {
    const o = typeof opts === "string" ? { title: opts } : (opts || {});
    return this._open({
      kind: "prompt",
      title: o.title || "Enter a value",
      body: o.body || "",
      label: o.label || "",
      placeholder: o.placeholder || "",
      defaultValue: o.defaultValue || "",
      multiline: !!o.multiline,
      required: o.required !== false,
      cta: o.cta || "Submit",
      cancel: o.cancel || "Cancel",
      inputType: o.inputType || "text",
    });
  },
};

function DialogHost() {
  const [current, setCurrent] = React.useState(null);
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const fn = (d) => {
      setValue(d.defaultValue || "");
      setCurrent(d);
    };
    _dialogListeners.add(fn);
    return () => _dialogListeners.delete(fn);
  }, []);

  React.useEffect(() => {
    if (!current) return;
    document.body.classList.add("no-scroll");
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    const onKey = (e) => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter" && current.kind === "confirm") { e.preventDefault(); close(true); }
      if (e.key === "Enter" && current.kind === "prompt" && !current.multiline && !e.shiftKey) {
        e.preventDefault(); submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [current]);

  if (!current) return null;

  function close(result) {
    current.resolve(result);
    setCurrent(null);
  }
  function submit() {
    if (current.kind === "confirm") return close(true);
    const v = (value || "").trim();
    if (current.required && !v) return;
    close(v);
  }

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(current.kind === "confirm" ? false : null); }}>
      <div className={"dialog-card dialog-" + current.kind} role="dialog" aria-modal="true" aria-labelledby={"dlg-h-" + current.id}>
        <h3 id={"dlg-h-" + current.id} className="dialog-h">{current.title}</h3>
        {current.body && <p className="dialog-p">{current.body}</p>}
        {current.kind === "prompt" && (
          <label className="dialog-field">
            {current.label && <span className="dialog-label">{current.label}</span>}
            {current.multiline ? (
              <textarea
                ref={inputRef}
                className="dialog-input"
                rows={4}
                placeholder={current.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <input
                ref={inputRef}
                type={current.inputType}
                className="dialog-input"
                placeholder={current.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => close(current.kind === "confirm" ? false : null)}>
            {current.cancel}
          </button>
          <button
            type="button"
            className={"btn " + (current.danger ? "btn-danger" : "btn-primary")}
            onClick={submit}
            disabled={current.kind === "prompt" && current.required && !value.trim()}
          >
            {current.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

window.ErrorBoundary = ErrorBoundary;
window.ToastHost = ToastHost;
window.SkipLink = SkipLink;
window.toast = toast;
window.dialog = dialog;
window.DialogHost = DialogHost;
