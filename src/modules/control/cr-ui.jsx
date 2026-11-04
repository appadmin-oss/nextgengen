/* ============================================================================
   Control Room v2 — primitives and hooks (README §4, CONTROL_ROOM.md §4).

   The width of the module root (ResizeObserver, never the window), toasts
   with Undo, the switch and segmented controls, a focus trap that returns
   focus to whatever opened the layer, and the phone's Back: each layer
   pushes one history entry and the browser's Back pops it.
   ========================================================================== */

function CrIcon({ n, className }) {
  return <i className={"ph ph-" + n + (className ? " " + className : "")} aria-hidden="true"/>;
}

/** The root's own width, kept current. */
function useCrWidth(ref) {
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

/** Toasts: Undo ones stay 6.5s, plain ones 4s (README §4.7). */
function useCrToast() {
  const [t, setT] = React.useState(null);
  const timer = React.useRef(0);
  const say = React.useCallback((text, undo, bad) => {
    clearTimeout(timer.current);
    setT({ text, undo: undo || null, bad: !!bad, id: Date.now() });
    timer.current = setTimeout(() => setT(null), undo ? 6500 : 4000);
  }, []);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const node = (raised) => t && (
    <div className={"cr-toast" + (raised ? " is-raised" : "") + (t.bad ? " is-bad" : "")} role="status" aria-live="polite" key={t.id}>
      <CrIcon n={t.bad ? "warning-circle" : "check-circle"}/>
      <span>{t.text}</span>
      {t.undo && <button type="button" className="cr-toast-undo" onClick={() => { const f = t.undo; clearTimeout(timer.current); setT(null); f(); }}>Undo</button>}
    </div>
  );
  return [say, node];
}

function CrSwitch({ on, onChange, label, disabled }) {
  return <button type="button" role="switch" className="cr-switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}/>;
}

/** A segmented control: a radio group; arrows move and select. */
function CrSeg({ label, value, options, onChange, full }) {
  const refs = React.useRef([]);
  const idx = Math.max(0, options.findIndex(o => o[0] === value));
  const key = e => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const n = (idx + d + options.length) % options.length;
    onChange(options[n][0]);
    setTimeout(() => refs.current[n] && refs.current[n].focus(), 0);
  };
  return (
    <div className={"cr-seg" + (full ? " is-full" : "")} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o[0]} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o[0] === value}
                tabIndex={i === idx ? 0 : -1} onKeyDown={key} onClick={() => onChange(o[0])}>{o[1]}</button>
      ))}
    </div>
  );
}

function CrPill({ tone, t }) {
  return <span className={"cr-pill cr-t-" + crTone(tone)}><span className="cr-pill-dot"/>{t}</span>;
}

/** Initials, or the photograph when there is one. */
function CrAvatar({ name, photo, className }) {
  const [bad, setBad] = React.useState(false);
  return <span className={className || "cr-ini"}>{photo && !bad ? <img src={nggImg(photo, "avatar")} alt="" loading="lazy" onError={() => setBad(true)}/> : crInitials(name)}</span>;
}

/**
 * A modal layer: focus moves in, Tab stays in, and focus returns to whatever
 * had it when the layer opened (README §4.5). Escape is the shell's job, so
 * the order of closing is decided in one place.
 */
function useCrTrap(ref, active) {
  React.useEffect(() => {
    if (!active) return undefined;
    const prev = document.activeElement;
    const el = ref.current;
    const focusables = () => el ? Array.from(el.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(x => x.offsetParent !== null || x === document.activeElement) : [];
    const t = setTimeout(() => {
      if (!el || el.contains(document.activeElement)) return;
      const pref = el.querySelector("[data-autofocus]") || focusables()[0];
      if (pref) pref.focus();
    }, 20);
    const onKey = e => {
      if (e.key !== "Tab" || !el) return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      if (prev && prev.focus && document.contains(prev)) { try { prev.focus(); } catch (_) {} }
    };
  }, [active]);
}

/**
 * The phone's Back closes the top layer (README §4.5): opening pushes one
 * history entry; Back pops it and closes; closing from the UI pops the entry
 * it pushed, so the history never fills with dead layers.
 */
const _crBackStack = [];
function useCrBack(open, close, enabled) {
  const closeRef = React.useRef(close);
  closeRef.current = close;
  React.useEffect(() => {
    if (!open || !enabled) return undefined;
    const id = "crl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = { id, popped: false };
    _crBackStack.push(entry);
    try { history.pushState(Object.assign({}, history.state || {}, { crLayer: id }), ""); } catch (_) {}
    const onPop = () => {
      if (_crBackStack[_crBackStack.length - 1] !== entry) return;
      entry.popped = true;
      _crBackStack.pop();
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!entry.popped) {
        const i = _crBackStack.indexOf(entry);
        if (i >= 0) _crBackStack.splice(i, 1);
        if (history.state && history.state.crLayer === id) { try { history.back(); } catch (_) {} }
      }
    };
  }, [open, enabled]);
}

/** Load something, with the three states the README requires and a retry. */
function useCrLoad(loader, deps) {
  const [st, setSt] = React.useState({ state: "loading", data: null, error: null });
  const seq = React.useRef(0);
  const run = React.useCallback(quiet => {
    const n = ++seq.current;
    if (!quiet) setSt(s => ({ state: "loading", data: s.data, error: null }));
    return Promise.resolve().then(loader).then(
      data => { if (n === seq.current) setSt({ state: "ready", data, error: null }); return data; },
      error => { if (n === seq.current) setSt(s => ({ state: quiet && s.data ? "ready" : "error", data: s.data, error })); });
    // eslint-disable-next-line
  }, deps);
  React.useEffect(() => { run(); }, [run]);
  const setData = React.useCallback(fn => setSt(s => ({ state: s.state, error: s.error, data: typeof fn === "function" ? fn(s.data) : fn })), []);
  return { state: st.state, data: st.data, error: st.error, reload: run, setData };
}

/** What a refusal says, in words. Server codes come back as Error.message; some carry `message`. */
const CR_ERRORS = {
  forbidden: "That needs a permission you don’t have.",
  unauthorized: "Your sign-in has ended. Sign in again.",
  session_expired: "Your sign-in has ended. Sign in again.",
  admin_2fa_required: "Enter your 2FA code to continue.",
  network: "Couldn’t reach the server. Check the connection and try again.",
  timeout: "The server took too long. Try again.",
  rate_limited: "Too many tries. Wait a minute, then try again.",
  not_found: "That record no longer exists.",
  out_of_scope: "That’s outside the centres you look after.",
  own_account: "You can’t do that to your own account.",
  staff_account: "Staff accounts are managed in Access & roles.",
  too_many: "That’s more than one run allows.",
  queued: "Sent to a second admin to approve.",
};
function crErr(e, fallback) {
  if (!e) return fallback || "Something went wrong. Try again.";
  const d = e.data || {};
  if (d.message) return d.message;
  /* The domain writes a sentence for a refusal the operator must act on
     ("m8@x.org is already on Member 08's record") and the route forwards it as
     `detail`. A bare token there (missing_cap:people) is not a sentence. */
  const det = d.detail || e.detail;
  if (typeof det === "string" && /\s/.test(det.trim())) return det;
  const code = d.error || e.code || e.message;
  return CR_ERRORS[code] || fallback || (code ? "Couldn’t do that (" + String(code).replace(/_/g, " ") + ")." : "Something went wrong. Try again.");
}
/** A request that queued for a second admin instead of running (domain/approvals.php). */
function crQueued(res) { return !!(res && (res.queued || res.approvalId || res.pending === "approval")); }

/** Skeleton rows at a block's final height (README §4.6): never a spinner in an empty page. */
function CrSkeleton({ kind, phone }) {
  if (kind === "kpis") return <div className="cr-skel" style={{ height: phone ? 168 : 104 }}/>;
  if (kind === "queue") return <div className="cr-skel" style={{ height: 540 }}/>;
  if (kind === "cards") return <div className="cr-skel" style={{ height: 172 }}/>;
  return (
    <div className="cr-box cr-table" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="cr-skel-row"><i style={{ width: 28, height: 28, borderRadius: "50%" }}/><i style={{ width: (30 + (i * 13) % 40) + "%" }}/><i style={{ width: "12%", marginLeft: "auto" }}/></div>)}
    </div>
  );
}

/** The honest error, with a retry (README §4.6). */
function CrError({ error, onRetry, what }) {
  return (
    <div className="cr-err" role="alert">
      <CrIcon n="warning-circle"/>
      <span>Couldn’t load {what || "this"}. {crErr(error, "")}</span>
      {onRetry && <button type="button" className="cr-btn is-sm" onClick={() => onRetry()}>Try again</button>}
    </div>
  );
}

/** Download rows as a CSV the operator can open in a spreadsheet. */
function crDownloadCsv(name, header, rows) {
  const esc = v => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""') + '"' : s; };
  const csv = [header].concat(rows).map(r => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name.replace(/[^\w.-]+/g, "-") + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read a chosen file as a data URL (uploads go through the existing API as base64). */
function crReadFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("read_failed"));
    fr.readAsDataURL(file);
  });
}

/* ── A v1 panel, mounted as a tab (page-admin.jsx) ─────────────────────────
   A tab not yet rebuilt as blocks mounts the panel that served it in v1, so
   nothing an operator could do there is lost. `render` returns the panel
   (resolved when the tab draws — page-admin.jsx loads after the tab files);
   `tab` opens the panel on one of its own sub-tabs, set ONCE as the panel
   mounts (the pending-tab store is consumed on mount; setting it on every
   render would leak into the next panel opened). */
function CrPanelMount({ tab, render, ctx }) {
  React.useState(() => { if (tab && typeof setPendingAdminTab === "function") setPendingAdminTab(tab); return true; });
  const ref = React.useRef(null);
  React.useEffect(() => crFoldHints(ref.current), []);
  return <div ref={ref} className="cr-panel admin-main">{render(ctx)}</div>;
}

/* On a phone, an old panel's long explanation folds to three lines with a More. The
   panels open with a paragraph of guidance — eleven lines above "Add a centre" — and on
   a phone that put every one of them below the first screen. Progressive: the button is
   appended to the paragraph (React leaves a node it did not render alone, and if a
   re-render replaces the text the observer adds it back), and nothing is removed, so a
   screen reader still reads the whole paragraph. Returns the cleanup for useEffect. */
const CR_FOLD_CHARS = 180;
function crFoldHints(root) {
  if (!root || typeof MutationObserver !== "function") return undefined;
  const phone = () => !!root.closest('.cr-app[data-tree="phone"]');
  const fold = () => {
    if (!phone()) return;
    root.querySelectorAll(".admin-hint").forEach(p => {
      if (p.querySelector(".cr-fold-btn") || (p.textContent || "").length < CR_FOLD_CHARS) return;
      p.classList.add("cr-fold");
      const b = document.createElement("button");
      b.type = "button"; b.className = "cr-fold-btn"; b.textContent = "More";
      b.setAttribute("aria-expanded", p.classList.contains("is-open") ? "true" : "false");
      b.addEventListener("click", () => {
        const open = p.classList.toggle("is-open");
        b.setAttribute("aria-expanded", open ? "true" : "false");
        b.textContent = open ? "Less" : "More";
      });
      p.appendChild(b);
    });
  };
  fold();
  const mo = new MutationObserver(fold);
  mo.observe(root, { childList: true, subtree: true });
  return () => mo.disconnect();
}
function crPanel(render, opts) {
  const o = opts || {};
  return {
    skeleton: o.skeleton || ["table"],
    actions: o.actions || null,
    blocks: (d, ctx) => [{ type: "custom", span: 6, render: c => <CrPanelMount tab={o.tab} render={render} ctx={c || ctx}/> }],
  };
}
