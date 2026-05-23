/* ================================================================
   NGG — UX safety net: React ErrorBoundary + Toast system.
   Load before any page component.
   ================================================================ */

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
function SkipLink() {
  return <a className="skip-link" href="#main">Skip to content</a>;
}

window.ErrorBoundary = ErrorBoundary;
window.ToastHost = ToastHost;
window.SkipLink = SkipLink;
window.toast = toast;
