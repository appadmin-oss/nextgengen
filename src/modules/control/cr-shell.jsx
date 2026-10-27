/* ============================================================================
   Control Room v2 — the frames (CONTROL_ROOM.md §2, §5). The desktop shell
   (sidebar, top bar, health banner, page frame) and the phone shell (app bar
   with a large title that collapses, pill tabs, bottom tab bar, menu sheet)
   are separate trees, not one squeezed. Both draw the same tab through
   CrTabView, which owns loading, the honest error and the blocks.
   ========================================================================== */

/** The figures a tab shows, as plain lines, for Ask (§4.4). */
function crFacts(blocks) {
  return (blocks || []).map(b => {
    if (b.type === "kpis") return b.items.map(k => k.l + ": " + k.v + (k.d ? " (" + k.d + " " + (k.dn || "") + ")" : "")).join("; ");
    if (b.type === "bars") return (b.title || "") + ": " + b.rows.map(r => r[0] + " " + r[1] + (b.pct ? "%" : "")).join(", ");
    if (b.type === "attention") return b.rows.filter(r => r.n > 0).map(r => r.n + " " + r.l).join("; ");
    if (b.type === "columns") return (b.title || "") + " " + b.big + ": " + b.bars.map(x => (x.l || "") + " " + x.v).join(", ");
    if (b.type === "status") return (b.title || "") + ": " + b.items.map(s => s[0] + " " + s[1]).join(", ");
    return "";
  }).filter(Boolean).join("\n");
}

/** One tab: load it, show the three states, and lay its blocks on the grid. */
function CrTabView({ tabId, ctx, phone, mainW, onReady, loadKey }) {
  const def = CR_TAB_DEFS[tabId] || null;
  /* A workspace page loads once for the page, not once per view: moving
     between its views (the inbox's Messages, Requests…) must not refetch. */
  const L = useCrLoad(() => (def && def.load ? def.load(ctx) : null), [loadKey || tabId, ctx.reloadKey]);
  const tctx = Object.assign({}, ctx, { data: L.data, setData: L.setData, reload: () => L.reload(true), state: L.state, view: tabId });
  let blocks = [], actions = [], err = null;
  if (def && L.state === "ready") {
    try { blocks = (def.blocks(L.data, tctx) || []).filter(Boolean); } catch (e) { err = e; if (window.console) console.error(e); }
    try { actions = def.actions ? (def.actions(L.data, tctx) || []).filter(Boolean) : []; } catch (e) { actions = []; }
  }
  React.useEffect(() => { onReady({ actions: L.state === "ready" ? actions : [], facts: L.state === "ready" ? (def && def.facts ? def.facts(L.data) : crFacts(blocks)) : "", state: L.state }); });
  if (!def) return <div className="cr-locked" style={{ marginTop: 24 }}><CrIcon n="hammer"/><span>This part of the Control Room isn’t built yet.</span></div>;
  if (L.state === "loading" && L.data == null) {
    const sk = def.skeleton || ["kpis", "table"];
    if (phone) return <>{sk.map((k, i) => <div key={i} className="cr-pblock"><CrSkeleton kind={k} phone/></div>)}</>;
    return <div className="cr-grid" aria-busy="true">{sk.map((k, i) => <div key={i} className="cr-block" style={{ gridColumn: "span 6" }}><CrSkeleton kind={k}/></div>)}</div>;
  }
  if (L.state === "error" || err) {
    const e = err || L.error;
    const forbidden = e && (e.status === 403 || e.code === "forbidden");
    const box = forbidden
      ? <div className="cr-locked"><CrIcon n="lock-simple"/><span>This needs a permission your account doesn’t have. Ask a super admin if you should see it.</span></div>
      : <CrError error={e} onRetry={() => L.reload()} what="this page"/>;
    return phone ? box : <div style={{ marginTop: 24 }}>{box}</div>;
  }
  if (def.workspace && def.render) return def.render(L.data, tctx, !!phone);
  /* A block may name its own key: one that comes and goes above it (a
     suggestion panel over the roster) must not shift it to a new position and
     re-create it, losing the search typed into it. */
  if (phone) return <>{blocks.map((b, i) => <CrBlock key={tabId + (b.key || i)} b={b} ctx={tctx} phone/>)}</>;
  return (
    <div className="cr-grid">
      {blocks.map((b, i) => <CrBlock key={tabId + (b.key || i)} b={b} ctx={tctx} span={crSpan(b.span || 6, mainW)}/>)}
    </div>
  );
}

function crHeaderButtons(actions) {
  let seenPrimary = false;
  return actions.map((a, i) => {
    const primary = !!a.primary && !seenPrimary;
    if (primary) seenPrimary = true;
    return (
      <button key={i} type="button" className={"cr-btn" + (primary ? " is-primary" : crIsDanger(a.l) ? " is-danger" : "")} disabled={a.disabled} title={a.why || undefined} onClick={a.run}>
        <CrIcon n={a.icon || "circle"}/>{a.l}
      </button>
    );
  });
}

/* ── Desktop (§2) ─────────────────────────────────────────────────────── */
function CrDesktop({ S, nav, tabs, ctx, L }) {
  const p = CR_PAGES[S.page];
  const tab = tabs.find(t => t.id === S.tab) || tabs[0];
  const group = crGroupOf(S.page);
  const top = crTopbar(L.mainW);
  const showLabels = !L.collapsed;
  return (
    <div className="cr-desk">
      <a href="#cr-main" className="cr-skip" onClick={e => { e.preventDefault(); const m = document.getElementById("cr-main"); if (m) m.focus(); }}>Skip to content</a>
      <aside className={"cr-side" + (L.collapsed ? " is-rail" : "")} aria-label="Control Room navigation">
        <div className="cr-side-top">
          <button type="button" className="cr-switcher" aria-haspopup="menu" aria-expanded={S.switcher} onClick={S.toggleSwitcher} title={L.collapsed ? "Control Room" : undefined}>
            <img src="/assets/logo.png" alt=""/>
            {showLabels && <><span className="cr-switcher-text"><b>Control Room</b><span>Next Generation Genius</span></span><CrIcon n="caret-up-down"/></>}
            {!showLabels && <span className="cr-sr">Control Room · switch portal</span>}
          </button>
          {S.switcher && (
            <div className="cr-menu" role="menu" aria-label="Portals">
              {S.portals.map(pt => (
                <button key={pt.l} type="button" role="menuitem" className="cr-menuitem" onClick={pt.run}>
                  <CrIcon n={pt.icon}/><span className="cr-grow">{pt.l}</span>{pt.current && <CrIcon n="check"/>}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="cr-searchbtn" title="Search or jump to (⌘K)" onClick={() => S.openCmd()} aria-label={showLabels ? undefined : "Search or jump to"}>
            <CrIcon n="magnifying-glass"/>
            {showLabels && <><span className="cr-grow">Search or jump to</span><kbd className="cr-kbd">⌘K</kbd></>}
          </button>
        </div>
        <nav className="cr-nav" aria-label="Pages">
          {nav.map((g, gi) => (
            <div key={gi} className="cr-nav-group">
              {g.h && showLabels && <div className="cr-nav-h">{g.h}</div>}
              {g.items.map(id => {
                const pg = CR_PAGES[id];
                const badge = id === "inbox" ? S.inboxCount : 0;
                return (
                  <button key={id} type="button" className="cr-nav-item" aria-current={id === S.page ? "page" : undefined} title={pg.label} onClick={() => ctx.go(id)}>
                    <CrIcon n={pg.icon}/>
                    {showLabels ? <><span className="cr-nav-label">{pg.label}</span>{badge > 0 && <span className="cr-badge" aria-label={badge + " waiting"}>{badge}</span>}</> : <span className="cr-sr">{pg.label}{badge > 0 ? ", " + badge + " waiting" : ""}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="cr-body">
        <header className="cr-top">
          <button type="button" className="cr-iconbtn" aria-label="Toggle sidebar" title="Toggle sidebar ([)" onClick={S.toggleCollapse} disabled={L.railForced}><CrIcon n="sidebar-simple"/></button>
          <nav aria-label="Breadcrumb" className="cr-crumb">
            {group && top.showGroup && <><span className="cr-crumb-group">{group}</span><CrIcon n="caret-right"/></>}
            <span className="cr-crumb-page" aria-current={tabs.length > 1 ? undefined : "page"}>{p.label}</span>
            {tabs.length > 1 && <><CrIcon n="caret-right"/><span className="cr-crumb-tab" aria-current="page">{tab.label}</span></>}
          </nav>
          <div className="cr-top-right">
            {top.showViewSite && <a href="/" className="cr-topbtn" target="_blank" rel="noopener">View site<CrIcon n="arrow-up-right"/></a>}
            {S.canAsk && <button type="button" className="cr-topbtn" aria-pressed={S.ask} onClick={S.toggleAsk} title="Ask (⌘J)"><CrIcon n="sparkle"/>Ask</button>}
            <button type="button" className="cr-avatar" aria-haspopup="menu" aria-expanded={S.acct} aria-label="Account menu" onClick={S.toggleAcct}>{crInitials(S.me.name)}</button>
          </div>
        </header>
        {S.banner && S.page !== "home" && (
          <div className="cr-banner" role="status">
            <CrIcon n="warning"/>
            <span className="cr-grow"><b>{S.banner.title}</b> {S.banner.text}</span>
            <button type="button" className="cr-banner-btn" onClick={() => ctx.go("settings", "ops")}>Open diagnostics</button>
            <button type="button" className="cr-banner-x" aria-label="Dismiss" onClick={S.dismissBanner}><CrIcon n="x"/></button>
          </div>
        )}
        {p.frame === "workspace" ? (
        <main id="cr-main" className="cr-main is-workspace" tabIndex={-1} ref={S.mainRef}>
          <div className="cr-wshead">
            <h1>{p.label}{S.counts.all > 0 && <span className="cr-wshead-n" aria-label={S.counts.all + " waiting"}>{S.counts.all}</span>}</h1>
            <p>{tab.desc}</p>
            <div className="cr-head-acts">{crHeaderButtons(S.actions)}</div>
          </div>
          <div className="cr-ws">
            <CrTabView key={S.page} loadKey={S.page} tabId={tab.id} ctx={ctx} mainW={L.mainW} onReady={S.onReady}/>
          </div>
        </main>
        ) : (
        <main id="cr-main" className="cr-main" tabIndex={-1} ref={S.mainRef}>
          <div className="cr-page">
            <div className="cr-head">
              <div style={{ minWidth: 0 }}>
                <h1>{p.label}</h1>
                <p>{tab.desc}</p>
              </div>
              <div className="cr-head-acts">{crHeaderButtons(S.actions)}</div>
            </div>
            {tabs.length > 1 && (
              <div className="cr-tabs" role="tablist" aria-label={p.label + " sections"}>
                {tabs.map(t => (
                  <button key={t.id} type="button" role="tab" className="cr-tab" aria-selected={t.id === tab.id} onClick={() => ctx.go(S.page, t.id)}>
                    {t.label}{S.counts[t.id] > 0 && <span className="cr-tab-n">{S.counts[t.id]}</span>}
                  </button>
                ))}
              </div>
            )}
            <div role={tabs.length > 1 ? "tabpanel" : undefined} aria-label={tab.label}>
              <CrTabView key={tab.id} tabId={tab.id} ctx={ctx} mainW={L.mainW} onReady={S.onReady}/>
            </div>
            {S.dirty && (
              <div className="cr-unsaved" role="region" aria-label="Unsaved changes">
                <CrIcon n="pencil-simple"/>
                <span>{S.dirty.n} unsaved change{S.dirty.n === 1 ? "" : "s"}</span>
                <button type="button" className="cr-unsaved-discard" onClick={S.dirty.discard}>Discard</button>
                <button type="button" className="cr-unsaved-save" onClick={S.dirty.save}>Save changes</button>
              </div>
            )}
          </div>
        </main>
        )}
        {S.ask && L.ask === "overlay" && <CrAsk where={p.label + " › " + tab.label} facts={S.facts} mode="overlay" onClose={S.toggleAsk}/>}
      </div>
      {S.ask && L.ask === "side" && <CrAsk where={p.label + " › " + tab.label} facts={S.facts} mode="side" onClose={S.toggleAsk}/>}
    </div>
  );
}

/* ── Phone (§5) ───────────────────────────────────────────────────────── */
const CR_PHONE_TABS = [["home", "Home", "house"], ["inbox", "Inbox", "tray"], ["members", "Members", "users"], ["checkin", "Check-in", "qr-code"]];
function CrPhone({ S, nav, tabs, ctx }) {
  const p = CR_PAGES[S.page];
  const tab = tabs.find(t => t.id === S.tab) || tabs[0];
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => { setScrolled(false); }, [S.page, S.tab]);
  const prim = S.actions.find(a => a.primary);
  const can = id => nav.some(g => g.items.indexOf(id) >= 0);
  return (
    <div className="cr-phone">
      <header className={"cr-pbar" + (scrolled ? " is-scrolled" : "")}>
        <div className="cr-pbar-row">
          <button type="button" className="cr-p44" aria-label="Menu" onClick={S.openMenu}><img src="/assets/logo.png" alt=""/></button>
          <span className="cr-psmall" aria-hidden="true">{p.label}</span>
          <span className="cr-grow"/>
          {prim && <button type="button" className="cr-p44" aria-label={prim.l} title={prim.l} onClick={prim.run} disabled={prim.disabled}><span className="cr-p44-dot"><CrIcon n={prim.icon || "plus"}/></span></button>}
          <button type="button" className="cr-p44" aria-label="Search" onClick={() => S.openCmd()}><CrIcon n="magnifying-glass"/></button>
          <button type="button" className="cr-p44" aria-label="Account and settings" onClick={S.openMenu}><span className="cr-p44-av">{crInitials(S.me.name)}</span></button>
        </div>
        <div className="cr-plarge"><div><h1>{p.label}</h1></div></div>
        {tabs.length > 1 && p.frame !== "workspace" && (
          <div className="cr-ptabs" role="tablist" aria-label={p.label + " sections"}>
            {tabs.map(t => <button key={t.id} type="button" role="tab" className="cr-ptab" aria-selected={t.id === tab.id} onClick={() => ctx.go(S.page, t.id)}>{t.label}{S.counts[t.id] > 0 && <span>{S.counts[t.id]}</span>}</button>)}
          </div>
        )}
      </header>
      {S.banner && S.page !== "home" && <button type="button" className="cr-pbanner" onClick={() => ctx.go("settings", "ops")}><CrIcon n="warning"/><span className="cr-grow">{S.banner.short}</span><CrIcon n="caret-right"/></button>}
      <main id="cr-pmain" className="cr-pmain" tabIndex={-1} ref={S.mainRef} onScroll={e => { const s = e.currentTarget.scrollTop > 8; if (s !== scrolled) setScrolled(s); }}>
        {p.frame !== "workspace" && <p className="cr-pdesc">{tab.desc}</p>}
        {S.actions.filter(a => a !== prim).length > 0 && <div className="cr-pchips">{S.actions.filter(a => a !== prim).map((a, i) => <button key={i} type="button" className="cr-chip" disabled={a.disabled} onClick={a.run}><CrIcon n={a.icon || "circle"}/>{a.l}</button>)}</div>}
        {p.frame === "workspace"
          ? <CrTabView key={S.page} loadKey={S.page} tabId={tab.id} ctx={ctx} phone mainW={390} onReady={S.onReady}/>
          : <CrTabView key={tab.id} tabId={tab.id} ctx={ctx} phone mainW={390} onReady={S.onReady}/>}
      </main>
      {S.dirty && (
        <div className="cr-punsaved" role="region" aria-label="Unsaved changes">
          <span><b>{S.dirty.n} unsaved change{S.dirty.n === 1 ? "" : "s"}</b><button type="button" className="cr-clear" onClick={S.dirty.discard}>Discard</button></span>
          <button type="button" className="cr-pbig" onClick={S.dirty.save}>Save</button>
        </div>
      )}
      <nav className="cr-tabbar" aria-label="Main">
        {CR_PHONE_TABS.filter(t => can(t[0])).map(t => (
          <button key={t[0]} type="button" aria-current={t[0] === S.page && !S.menu ? "page" : undefined} onClick={() => ctx.go(t[0])}>
            <span className="cr-tabbar-ico"><CrIcon n={t[2]}/>{t[0] === "inbox" && S.inboxCount > 0 && <span className="cr-badge" aria-label={S.inboxCount + " waiting"}>{S.inboxCount}</span>}</span>
            {t[1]}
          </button>
        ))}
        <button type="button" aria-expanded={S.menu} onClick={S.openMenu}><span className="cr-tabbar-ico"><CrIcon n="list"/></span>Menu</button>
      </nav>
      {S.menu && <CrPhoneMenu S={S} nav={nav} ctx={ctx}/>}
    </div>
  );
}

function CrPhoneMenu({ S, nav, ctx }) {
  const ref = React.useRef(null);
  useCrTrap(ref, true);
  return (
    <div className="cr-pmenu-wrap" onMouseDown={e => { if (e.target === e.currentTarget) S.closeMenu(); }}>
      <div ref={ref} className="cr-pmenu" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="cr-pmenu-grab" aria-hidden="true"><span/></div>
        <div className="cr-pmenu-head"><b>Menu</b><button type="button" className="cr-p44" aria-label="Close menu" onClick={S.closeMenu}><CrIcon n="x"/></button></div>
        <div className="cr-pmenu-body">
          <div className="cr-pmenu-acct"><span className="cr-p44-av">{crInitials(S.me.name)}</span><span><b>{S.me.name}</b><em>{S.me.roleLabel}{S.endsShort ? " · " + S.endsShort : ""}</em></span></div>
          {nav.map((g, gi) => (
            <div key={gi} className="cr-pmenu-group">
              <span>{g.h || "Workspace"}</span>
              <div className="cr-pmenu-card">
                {g.items.map(id => {
                  const pg = CR_PAGES[id];
                  const ts = crTabsFor(id, ctx.can1);
                  const sub = ts.length > 1 ? ts.map(t => t.label).slice(0, 3).join(", ") + (ts.length > 3 ? "…" : "") : ts[0].label;
                  return (
                    <button key={id} type="button" className="cr-prow is-56" onClick={() => { S.closeMenu(); ctx.go(id); }}>
                      <span className="cr-card-ico"><CrIcon n={pg.icon}/></span>
                      <span className="cr-prow-t"><b>{pg.label}</b><span>{sub}</span></span>
                      {id === "inbox" && S.inboxCount > 0 && <span className="cr-badge" style={{ minWidth: 22, height: 22, fontSize: 12 }}>{S.inboxCount}</span>}
                      <CrIcon n="caret-right"/>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="cr-pmenu-group">
            <span>Display</span>
            <div className="cr-pmenu-density"><span>Density</span><CrSeg label="Density" full value={S.density} onChange={S.setDensity} options={CR_DENSITY_IDS.map(k => [k, k[0].toUpperCase() + k.slice(1)])}/></div>
          </div>
          <div className="cr-pmenu-card">
            <button type="button" className="cr-prow is-56" onClick={S.lock}><CrIcon n="lock-simple"/><span className="cr-prow-t"><b>Lock Control Room</b></span></button>
            <a href="/" className="cr-prow is-56" target="_blank" rel="noopener" style={{ textDecoration: "var(--rs-textdecoration-47, none)" }}><CrIcon n="arrow-square-out"/><span className="cr-prow-t"><b>View public site</b></span></a>
            {S.portals.filter(pt => !pt.current).map(pt => <button key={pt.l} type="button" className="cr-prow is-56" onClick={pt.run}><CrIcon n={pt.icon}/><span className="cr-prow-t"><b>{pt.l}</b></span></button>)}
            <button type="button" className="cr-prow is-56" style={{ color: "var(--cr-danger)" }} onClick={S.signOut}><CrIcon n="sign-out"/><span className="cr-prow-t"><b>Sign out</b></span></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── One Control Room page, hosted inside another portal ───────────────────
   The Club portal shows the Wi-Fi page in place for the people who hold its
   capability, instead of sending them away to the Control Room. It is the
   SAME page — CR_PAGES' tabs, CR_TAB_DEFS' blocks, the same drawer, form,
   confirm and toast — given a ctx by this host, not a second drawing that
   would drift from the first (CLAUDE.md §11). Its layers sit in a fixed
   overlay so they cover the screen whatever the host's layout is.
   props: page (a CR_PAGES id), caps (the person's capabilities), me, phone. */
function CrEmbed({ page, caps, me, phone }) {
  const has = c => (caps || []).indexOf(c) !== -1;
  const tabs = crTabsFor(page, has);
  const [tab, setTab] = React.useState(tabs[0] ? tabs[0].id : "");
  const [form, setForm] = React.useState(null);
  const [drawer, setDrawer] = React.useState(null);
  const [confirmQ, setConfirmQ] = React.useState(null);
  const [say, toastNode] = useCrToast();
  const [reloadKey, setReloadKey] = React.useState(0);
  /* The tab reports its header actions on every render; the newest are kept
     in a ref (their closures hold the newest data) and the bar re-renders
     only when what it shows changes. */
  const actionsRef = React.useRef([]);
  const [, setActSig] = React.useState("");
  const onReady = s => {
    actionsRef.current = s.actions || [];
    const sig = s.state + "|" + actionsRef.current.map(a => a.l + (a.disabled ? "!" : "")).join(",");
    setActSig(p => (p === sig ? p : sig));
  };
  const dirtyMap = React.useRef({});
  const [dirtyN, setDirtyN] = React.useState(0);
  const setDirty = (key, v) => {
    const prev = dirtyMap.current[key];
    if (!v) { if (!prev) return; delete dirtyMap.current[key]; }
    else { if (prev && prev.n === v.n) { dirtyMap.current[key] = v; return; } dirtyMap.current[key] = v; }
    setDirtyN(Object.values(dirtyMap.current).reduce((n, x) => n + x.n, 0));
  };
  const boxRef = React.useRef(null);
  const mainW = useCrWidth(boxRef);
  const askConfirm = c => new Promise(res => setConfirmQ(Object.assign({}, c, { res })));
  const go = (p, t) => {
    if (p === page && tabs.some(x => x.id === t)) { setTab(t); setDrawer(null); return; }
    try { window.location.href = "/control/" + p + (t ? "/" + t : ""); } catch (_) {}
  };
  const ctx = {
    api: NGGApi.admin, me: me || {}, can: c => crCapOk(c, has), can1: has, phone: !!phone, density: "balanced", reloadKey,
    sub: "", page, tab, setSub: () => {},
    toast: say, confirm: askConfirm,
    form: spec => { setDrawer(null); setForm(spec); },
    palette: () => {}, drawer: spec => setDrawer(spec), closeDrawer: () => setDrawer(null),
    go, portal: () => {}, reloadAll: () => setReloadKey(k => k + 1), refreshCounts: () => {},
    setDirty, setQueue: () => {}, studio: () => {},
  };
  React.useEffect(() => {
    const onKey = e => {
      if (e.key !== "Escape") return;
      if (confirmQ) { confirmQ.res(false); setConfirmQ(null); return; }
      if (form) { setForm(null); return; }
      if (drawer) setDrawer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!tabs.length) return <div className="cr-app cr-embed"><div className="cr-locked"><CrIcon n="lock-simple"/><span>This needs a permission your account doesn’t have.</span></div></div>;
  const cur = tabs.find(t => t.id === tab) || tabs[0];
  const dirty = dirtyN ? { n: dirtyN, save: async () => { for (const v of Object.values(dirtyMap.current)) await v.save(); }, discard: () => Object.values(dirtyMap.current).forEach(v => v.discard()) } : null;
  return (
    <div className={"cr-app cr-embed" + (phone ? " is-phone" : "")} ref={boxRef}>
      <div className="cr-embed-head">
        <div className="cr-tabs" role="tablist" aria-label={(CR_PAGES[page] || {}).label + " sections"}>
          {tabs.map(t => <button key={t.id} type="button" role="tab" className="cr-tab" aria-selected={t.id === cur.id} onClick={() => go(page, t.id)}>{t.label}</button>)}
        </div>
        <div className="cr-embed-acts">{crHeaderButtons(actionsRef.current)}</div>
      </div>
      <p className="cr-embed-desc">{cur.desc}</p>
      <div role="tabpanel" aria-label={cur.label}>
        <CrTabView key={cur.id} tabId={cur.id} ctx={ctx} phone={phone} mainW={mainW || 900} onReady={onReady}/>
      </div>
      <div className="cr-app cr-embed-layers">
        {drawer && <CrDrawer d={drawer} phone={phone} onClose={() => setDrawer(null)}/>}
        {form && <CrFormSheet f={form} phone={phone} onClose={() => setForm(null)} toast={say}/>}
        {confirmQ && <CrConfirm c={confirmQ} onDone={v => { const r = confirmQ.res; setConfirmQ(null); r(v); }}/>}
        {dirty && !form && !drawer && (
          <div className="cr-unsaved cr-embed-unsaved" role="status">
            <span>{dirty.n} unsaved change{dirty.n === 1 ? "" : "s"}</span>
            <button type="button" className="cr-unsaved-discard" onClick={dirty.discard}>Discard</button>
            <button type="button" className="cr-unsaved-save" onClick={dirty.save}>Save changes</button>
          </div>
        )}
        {toastNode(!!dirty)}
      </div>
    </div>
  );
}
