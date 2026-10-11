/* ── The portals' shared shell ────────────────────────────────────────────────
 *
 * Member, Mentor and Instructor portals share one structure (handoff v2,
 * INFORMATION_ARCHITECTURE.md): five AREAS, each a sidebar item on a wide
 * screen and a bottom-tab item on a phone, and inside an area a TAB STRIP when
 * it holds more than one screen. A detail view (/member/grow/results/…, a
 * mentee, a student) hides the strip and shows Back. The portals differ only
 * in the area config they hand this shell.
 *
 * The URL is the state: /{portal}/{area}/{tab}/{detail}. A refresh, a shared
 * link and the browser's Back all land where they should, and the router in
 * app.jsx leaves the subtree alone (see `inPortalSubtree`).
 *
 * Badges come from the server. An area's badge counts its tabs that carry one;
 * a tab's badge is its own count or an amount ("₦500") — never computed here.
 */

/** Parse /{prefix}/{area}/{tab}/{detail} against an area config. Unknown parts fall back, never 404. */
function portalParse(prefix, areas) {
  const segs = (window.location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  if (segs[0] !== prefix) return { area: areas[0].id, tab: "", detail: "" };
  const a = areas.find(x => x.id === (segs[1] || "")) || areas[0];
  const tabs = a.tabs || [];
  const t = tabs.find(x => x.id === (segs[2] || "")) ;
  if (!t && segs[2] && tabs.length) {
    // /member/mentor/k42 style detail directly under an area's first tab.
    return { area: a.id, tab: tabs[0].id, detail: decodeURIComponent(segs[2]) };
  }
  return { area: a.id, tab: t ? t.id : (tabs[0] ? tabs[0].id : ""), detail: decodeURIComponent(segs[3] || "") };
}

function portalPath(prefix, areas, area, tab, detail) {
  const a = areas.find(x => x.id === area) || areas[0];
  const tabs = a.tabs || [];
  const first = tabs[0] ? tabs[0].id : "";
  let p = "/" + prefix + (a.id === areas[0].id && !tab && !detail ? "" : "/" + a.id);
  if (tab && (tab !== first || detail)) p += "/" + tab;
  if (detail) p += "/" + encodeURIComponent(detail);
  return p;
}

/** The router: current place + go(area, tab, detail, query). Listens to Back/Forward. */
function usePortalRoute(prefix, areas) {
  const [place, setPlace] = React.useState(() => portalParse(prefix, areas));
  React.useEffect(() => {
    const onPop = () => setPlace(portalParse(prefix, areas));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [prefix, areas]);
  const go = React.useCallback((area, tab, detail, query) => {
    const path = portalPath(prefix, areas, area, tab || "", detail || "") + (query ? "?" + query : "");
    if (path !== window.location.pathname + window.location.search) history.pushState({ page: prefix }, "", path);
    setPlace(portalParse(prefix, areas));
    try { window.scrollTo({ top: 0, behavior: "instant" }); } catch (_) { window.scrollTo(0, 0); }
  }, [prefix, areas]);
  /** A server route ("/member/grow/results?x=1") — the To do rows carry these. */
  const goRoute = React.useCallback((route) => {
    const [path, query] = String(route || "").split("?");
    if (!path.startsWith("/" + prefix)) { if (window.__navigate) { history.pushState({}, "", path); window.__navigate(path.replace(/^\/+/, "").split("/")[0] || "home"); } return; }
    history.pushState({ page: prefix }, "", path + (query ? "?" + query : ""));
    setPlace(portalParse(prefix, areas));
    try { window.scrollTo({ top: 0, behavior: "instant" }); } catch (_) { window.scrollTo(0, 0); }
  }, [prefix, areas]);
  return [place, go, goRoute];
}

function portalBadgeText(b) {
  if (b === undefined || b === null || b === false || b === 0 || b === "") return "";
  if (b === true || b === "due") return "Due";
  return String(b);
}

/** Phosphor icon: regular when inactive, fill when active. */
function PIcon({ name, on, className }) {
  return <i className={"ph" + (on ? "-fill" : "") + " ph-" + name + (className ? " " + className : "")} aria-hidden="true"/>;
}

/** The ⌘K palette: every area and tab, filterable, keyboard only. */
function PortalPalette({ areas, onPick, onClose }) {
  const [q, setQ] = React.useState("");
  const [i, setI] = React.useState(0);
  const items = [];
  areas.forEach(a => (a.tabs && a.tabs.length ? a.tabs : [{ id: "", label: a.label }]).forEach(t => {
    if (t.hidden) return;
    items.push({ area: a.id, tab: t.id, label: t.id ? a.label + " › " + t.label : a.label, icon: a.icon, external: !!t.external });
  }));
  const shown = items.filter(x => x.label.toLowerCase().includes(q.trim().toLowerCase()));
  const ref = React.useRef(null);
  const back = React.useRef(document.activeElement);
  React.useEffect(() => { if (ref.current) ref.current.focus(); return () => { try { back.current && back.current.focus(); } catch (_) {} }; }, []);
  const key = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setI(n => Math.min(shown.length - 1, n + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI(n => Math.max(0, n - 1)); }
    else if (e.key === "Enter" && shown[i]) { e.preventDefault(); onPick(shown[i]); }
  };
  return (
    <div className="pt-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pt-palette" role="dialog" aria-modal="true" aria-label="Go to">
        <label className="pt-palette-q">
          <PIcon name="magnifying-glass"/>
          <input ref={ref} value={q} onChange={e => { setQ(e.target.value); setI(0); }} onKeyDown={key}
            placeholder="Go to…" aria-label="Go to a screen" role="combobox" aria-expanded="true" aria-controls="pt-palette-list"/>
        </label>
        <ul id="pt-palette-list" role="listbox" className="pt-palette-list">
          {shown.map((x, n) => (
            <li key={x.area + x.tab} role="option" aria-selected={n === i}>
              <button type="button" className={n === i ? "is-on" : ""} onMouseEnter={() => setI(n)} onClick={() => onPick(x)}>
                <PIcon name={x.icon}/> <span>{x.label}</span>{x.external && <PIcon name="arrow-square-out"/>}
              </button>
            </li>
          ))}
          {!shown.length && <li className="pt-palette-empty">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

/**
 * PortalShell — the frame. `areas`: [{ id, label, icon, tabs: [{ id, label, external?, hidden? }] }].
 * `badges`: { "area/tab": value }. `title`/`subtitle`: the page header.
 */
function PortalShell({ kind, brand, sub, me, areas, place, go, badges, title, subtitle, actions, detail, onBack, banner, children, onSignOut, palette }) {
  const [pal, setPal] = React.useState(false);
  const area = areas.find(a => a.id === place.area) || areas[0];
  const tabs = (area.tabs || []).filter(t => !t.hidden);
  const b = badges || {};
  const tabBadge = (a, t) => b[a + "/" + t];
  const areaBadge = (a) => {
    const n = (a.tabs || []).filter(t => !t.hidden && portalBadgeText(tabBadge(a.id, t.id))).length + (portalBadgeText(b[a.id]) ? 1 : 0);
    return n;
  };
  React.useEffect(() => {
    if (!palette) return;
    /* The site's own command palette (command.jsx) listens for the same keys on
       window. Inside a portal this one answers instead: captured first and
       stopped there, so one key never opens two dialogs. */
    const k = (e) => {
      const meta = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") && !(e.target && e.target.isContentEditable);
      if (!meta && !slash) return;
      e.preventDefault(); e.stopImmediatePropagation();
      setPal(p => meta ? !p : true);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [palette]);
  const tabKey = (e, i) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    go(area.id, tabs[n].id);
    setTimeout(() => { const el = document.getElementById("pt-tab-" + tabs[n].id); if (el) el.focus(); }, 0);
  };

  return (
    <div className={"pt-app pt-" + kind}>
      <a className="pt-skip" href="#pt-main">Skip to content</a>
      <aside className="pt-side" aria-label={brand}>
        <div className="pt-brand">
          <span className="pt-brand-mark" aria-hidden="true">NGG</span>
          <span><b>{brand}</b><small>{sub}</small></span>
        </div>
        <nav className="pt-nav" aria-label="Areas">
          {areas.map(a => {
            const on = a.id === area.id, n = areaBadge(a);
            return (
              <button key={a.id} type="button" className={"pt-nav-i" + (on ? " is-on" : "")} aria-current={on ? "page" : undefined} onClick={() => go(a.id)}>
                <PIcon name={a.icon} on={on}/><span>{a.label}</span>{n > 0 && <span className="pt-badge" aria-label={n + " need attention"}>{n}</span>}
              </button>
            );
          })}
        </nav>
        <div className="pt-side-foot">
          {palette && <button type="button" className="pt-side-k" onClick={() => setPal(true)}><PIcon name="command"/> Go to… <kbd>⌘K</kbd></button>}
          {me && (
            <div className="pt-me">
              <span className="pt-av" aria-hidden="true">{me.photoUrl ? <img src={me.photoUrl} alt=""/> : me.initials}</span>
              <span className="pt-me-t"><b>{me.name}</b><small>{me.role}</small></span>
              {onSignOut && <button type="button" className="pt-icon-btn" onClick={onSignOut} aria-label="Sign out"><PIcon name="sign-out"/></button>}
            </div>
          )}
        </div>
      </aside>

      <header className="pt-top">
        {detail ? <button type="button" className="pt-icon-btn" onClick={onBack} aria-label="Back"><PIcon name="arrow-left"/></button>
                : <span className="pt-brand-mark" aria-hidden="true">NGG</span>}
        <b className="pt-top-t">{detail ? title : brand}</b>
        {palette && <button type="button" className="pt-icon-btn" onClick={() => setPal(true)} aria-label="Go to a screen"><PIcon name="magnifying-glass"/></button>}
        {onSignOut && <button type="button" className="pt-icon-btn" onClick={onSignOut} aria-label="Sign out"><PIcon name="sign-out"/></button>}
      </header>

      <main id="pt-main" className="pt-main" tabIndex={-1}>
        {banner}
        <div className="pt-head">
          {detail && <button type="button" className="pt-back" onClick={onBack}><PIcon name="arrow-left"/> Back</button>}
          <div className="pt-head-row">
            <div className="pt-head-t">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className="pt-head-a">{actions}</div>}
          </div>
          {!detail && tabs.length > 1 && (
            <div className="pt-tabs" role="tablist" aria-label={area.label}>
              {tabs.map((t, i) => {
                const on = t.id === place.tab, bt = portalBadgeText(tabBadge(area.id, t.id));
                return (
                  <button key={t.id} id={"pt-tab-" + t.id} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
                    className={"pt-tab" + (on ? " is-on" : "")} onClick={() => go(area.id, t.id)} onKeyDown={e => tabKey(e, i)}>
                    {t.label}{t.external && <PIcon name="arrow-square-out"/>}{bt && <span className="pt-badge">{bt}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="pt-body">{children}</div>
      </main>

      <nav className="pt-bottom" aria-label="Areas">
        {areas.map(a => {
          const on = a.id === area.id, n = areaBadge(a);
          return (
            <button key={a.id} type="button" className={"pt-bottom-i" + (on ? " is-on" : "")} aria-current={on ? "page" : undefined} onClick={() => go(a.id)}>
              <span className="pt-bottom-ic"><PIcon name={a.icon} on={on}/>{n > 0 && <span className="pt-dot" aria-label={n + " need attention"}/>}</span>
              <span>{a.label}</span>
            </button>
          );
        })}
      </nav>
      {pal && <PortalPalette areas={areas} onClose={() => setPal(false)} onPick={x => { setPal(false); go(x.area, x.tab); }}/>}
    </div>
  );
}

/* ── Building blocks every portal screen uses ──────────────────────────── */

function PtCard({ title, meta, action, children, tone, className }) {
  return (
    <section className={"pt-card" + (tone ? " pt-card--" + tone : "") + (className ? " " + className : "")}>
      {(title || action) && (
        <div className="pt-card-h">
          <div><h2>{title}</h2>{meta && <p className="pt-card-meta">{meta}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** The three states that are not optional: loading, an honest error with a retry, and ready. */
function PtLoad({ state, onRetry, rows, children, what }) {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => { if (state !== "loading") return; const t = setTimeout(() => setSlow(true), 300); return () => clearTimeout(t); }, [state]);
  if (state === "loading") return slow ? <div className="pt-skel" aria-busy="true" aria-label="Loading">{Array.from({ length: rows || 3 }).map((_, i) => <div key={i} className="pt-skel-row"/>)}</div> : null;
  if (state === "error") return (
    <div className="pt-error" role="alert">
      <PIcon name="cloud-slash"/>
      <div><b>We couldn’t load {what || "this"}.</b><p>Check your connection, then try again.</p></div>
      <button type="button" className="pt-btn" onClick={onRetry}>Try again</button>
    </div>
  );
  return children;
}

/** A server-ordered To do list. Never re-sorted here. */
function PtTodo({ items, onGo, limit, empty }) {
  const [all, setAll] = React.useState(false);
  const list = items || [];
  const shown = limit && !all ? list.slice(0, limit) : list;
  if (!list.length) return <div className="pt-empty"><PIcon name="check-circle"/> {empty || "You’re all caught up."}</div>;
  return (
    <React.Fragment>
      <ul className="pt-todo">
        {shown.map(t => (
          <li key={t.key} className={"pt-todo-i pt-tone-" + (t.tone || "neutral")}>
            <span className="pt-todo-ic"><PIcon name={t.icon || "circle"}/></span>
            <span className="pt-todo-t"><b>{t.title}</b><small>{t.subtitle}</small></span>
            <button type="button" className="pt-btn pt-btn--sm" onClick={() => onGo(t.route)}>{t.cta}</button>
          </li>
        ))}
      </ul>
      {limit && list.length > limit && <button type="button" className="pt-more" onClick={() => setAll(a => !a)}>{all ? "Show fewer" : "Show " + (list.length - limit) + " more"}</button>}
    </React.Fragment>
  );
}

/** A figure that is a button to the screen that explains it. */
function PtStat({ label, value, sub, onClick, tone }) {
  return (
    <button type="button" className={"pt-stat" + (tone ? " pt-tone-" + tone : "")} onClick={onClick}>
      <small>{label}</small><b>{value}</b>{sub && <span>{sub}</span>}
    </button>
  );
}

/** An external app's tab: what it is, who sees what, and an Open button (new tab). */
function PtExternal({ icon, title, body, points, href, cta }) {
  return (
    <PtCard>
      <div className="pt-ext">
        <span className="pt-ext-ic"><PIcon name={icon}/></span>
        <div>
          <h2>{title}</h2>
          <p>{body}</p>
          {points && <ul className="pt-ext-pts">{points.map(p => <li key={p}><PIcon name="check"/> {p}</li>)}</ul>}
          <a className="pt-btn pt-btn--ink" href={href} target="_blank" rel="noopener noreferrer">{cta || "Open"} <PIcon name="arrow-square-out"/><span className="sr-only"> (opens in a new tab)</span></a>
        </div>
      </div>
    </PtCard>
  );
}

function ptMoney(n) {
  const v = Math.round(Number(n) || 0);
  return "₦" + v.toLocaleString("en-NG");
}
function ptDate(iso, opts) {
  if (!iso) return "";
  const d = new Date(String(iso).length === 10 ? iso + "T12:00:00Z" : iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString("en-GB", Object.assign({ day: "numeric", month: "short" }, opts || {}));
}
function ptInitials(name) { return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?"; }
