/* ============================================================================
   Control Room v2 — the page (/control). CONTROL_ROOM.md.

   The URL is the state (CLAUDE.md §2): /control/<page>/<tab>/<sub>. Old
   addresses arrive as /nextadmin?s=<section>&t=<tab> and are resolved once,
   then the address is rewritten. window.__adminSection(section, tab) keeps
   the portals' cross-links working. Escape closes one layer at a time, in
   the order §4.5 fixes: palette → form → drawer → menus → Ask.
   ========================================================================== */

const CR_LS = { density: "ngg.cr.density", collapsed: "ngg.cr.collapsed" };
function crLsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } }
function crLsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
function crSsGet(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }
function crSsSet(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} }

/** What the health endpoint says needs attention, worded for the banner (§2.3). */
function crHealthIssue(h) {
  const c = (h && h.checks) || {};
  const ph = c.photos || {}, cl = c.cloudinary || {};
  if (ph.where === "unwritable") return { key: "photos-failing", title: "Photo storage is failing.", text: "New headshots can’t be saved until the storage folder is writable.", short: "Photo storage is failing" };
  if (ph.where === "cache_fallback") return { key: "photos-degraded", title: "Photo storage is degraded.", text: "New headshots are going to the temporary cache.", short: "Photo storage is degraded" };
  if (cl.configured && cl.state && cl.state !== "ok" && cl.state !== "not_configured") {
    const t = { bad_credentials: "Cloudinary is refusing its keys.", exhausted: "The Cloudinary plan is used up for now.", unreachable: "Cloudinary can’t be reached." }[cl.state] || "Cloudinary reports “" + cl.state + "”.";
    return { key: "cloudinary-" + cl.state, title: "Photo uploads are degraded.", text: t, short: "Photo uploads are degraded" };
  }
  return null;
}

/** "Sign-in ends 18:40 · 3h 12m left" from the cookie's expiry (seconds). */
function crSignInEnds(exp) {
  if (!exp) return { long: "", short: "" };
  const ms = exp * 1000 - Date.now();
  if (ms <= 0) return { long: "Sign-in has ended", short: "signed out" };
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
  const left = (h ? h + "h " : "") + m + "m left";
  const at = new Date(exp * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return { long: "Sign-in ends " + at + " · " + left, short: left };
}

function crUrlParts() {
  const p = (window.location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  return p[0] === "control" ? p.slice(1).map(decodeURIComponent) : [];
}

function ControlRoomPage({ setPage }) {
  const auth = useAuth();
  const [unlockNote, setUnlockNote] = React.useState("");
  const gate = <CrGate auth={auth} onUnlocked={note => setUnlockNote(note || "")}/>;
  React.useEffect(() => { idsEnsureFonts && idsEnsureFonts(); }, []);
  if (auth.loading || !auth.member || !auth.isAdmin || !auth.adminOk) return <div className="cr-app">{gate}</div>;
  return <CrRoom auth={auth} setPage={setPage} unlockNote={unlockNote}/>;
}

function CrRoom({ auth, setPage, unlockNote }) {
  const rootRef = React.useRef(null);
  const mainRef = React.useRef(null);
  const W = useCrWidth(rootRef) || 1280;
  const has = React.useCallback(c => !!(auth.hasCap && auth.hasCap(c)), [auth]);
  const nav = React.useMemo(() => crNavFor(has), [has]);

  /* ── Where we are: the URL ── */
  const read = () => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("s");
    if (s && /^[a-z0-9-]{2,40}$/.test(s)) {
      const t = (q.get("t") || "").replace(/[^a-z0-9-]/g, "").slice(0, 40);
      return Object.assign({ fromQuery: true }, crResolve([s, t]));
    }
    return crResolve(crUrlParts());
  };
  const [loc, setLoc] = React.useState(read);
  const allowed = r => r && r.page && crTabsFor(r.page, has).some(t => t.id === r.tab);
  const fixLoc = r => {
    if (r.portal) return r;
    if (allowed(r)) return r;
    const tabs = r.page ? crTabsFor(r.page, has) : [];
    if (tabs.length) return { page: r.page, tab: tabs[0].id, sub: "" };
    return { page: "home", tab: "home", sub: "" };
  };
  const cur = fixLoc(loc);
  React.useEffect(() => {
    if (cur.portal) { setPage(cur.portal); return; }
    const want = crPath(cur.page, cur.tab, cur.sub);
    if (window.location.pathname !== want || window.location.search) history.replaceState(Object.assign({}, history.state || {}, { page: "admin" }), "", want);
  }, []);
  React.useEffect(() => {
    const onPop = () => { if (!history.state || !history.state.crLayer) setLoc(crResolve(crUrlParts())); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ── Layers ── */
  const [cmd, setCmd] = React.useState(false);
  const [cmdScope, setCmdScope] = React.useState("all");
  const [form, setForm] = React.useState(null);
  const [drawer, setDrawer] = React.useState(null);
  const [confirmQ, setConfirmQ] = React.useState(null);
  const [acct, setAcct] = React.useState(false);
  const [switcher, setSwitcher] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [ask, setAsk] = React.useState(false);
  const [say, toastNode] = useCrToast();
  const phone = W < CR_BP.phone;
  useCrBack(cmd, () => setCmd(false), phone);
  useCrBack(!!form, () => setForm(null), phone);
  useCrBack(!!drawer, () => setDrawer(null), phone);
  useCrBack(menu, () => setMenu(false), phone);
  useCrBack(ask, () => setAsk(false), phone);

  /* ── Preferences: per viewer, on this device ── */
  const [density, setDensityS] = React.useState(() => crLsGet(CR_LS.density, "balanced"));
  const setDensity = d => { setDensityS(d); crLsSet(CR_LS.density, d); };
  const [collapsed, setCollapsed] = React.useState(() => crLsGet(CR_LS.collapsed, "0") === "1");
  const L = crLayout(W, { collapsed, ask });

  /* ── Who ── */
  const [roles, setRoles] = React.useState(null);
  React.useEffect(() => { NGGApi.admin.roles().then(setRoles, () => setRoles(null)); }, []);
  const m = auth.member || {};
  const roleRow = roles && (roles.roles || []).find(r => r.id === m.role);
  const me = { id: m.memberId, name: m.fullName || "Staff", email: m.email || "", role: m.role, roleLabel: roleRow ? roleRow.label : String(m.role || "").replace(/_/g, " "), caps: m.caps || [], scoped: roles && roles.me ? !!roles.me.scoped : false };
  const [, tick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => tick(x => x + 1), 60000); return () => clearInterval(t); }, []);
  const ends = crSignInEnds(auth.sessionExp);

  /* ── Health (§2.3): settings holders only; dismissal lasts the session ── */
  const [health, setHealth] = React.useState(null);
  React.useEffect(() => { if (has("settings")) NGGApi.admin.ops.status().then(setHealth, () => setHealth(null)); }, [has]);
  const issue = crHealthIssue(health);
  const [dismissed, setDismissed] = React.useState(() => crSsGet("ngg.cr.banner") || "");
  const banner = issue && dismissed !== issue.key ? issue : null;

  /* ── Inbox counts: one request per queue the person can see ── */
  const [counts, setCounts] = React.useState({});
  const loadCounts = React.useCallback(() => {
    const tabs = crTabsFor("inbox", has).filter(t => CR_TAB_DEFS[t.id] && CR_TAB_DEFS[t.id].count);
    Promise.all(tabs.map(t => Promise.resolve(CR_TAB_DEFS[t.id].count(ctxRef.current)).then(n => [t.id, n], () => [t.id, 0])))
      .then(rows => { const c = {}; let all = 0; rows.forEach(([k, n]) => { c[k] = n || 0; all += n || 0; }); c.all = all; setCounts(c); });
  }, [has]);
  React.useEffect(() => { loadCounts(); const t = setInterval(loadCounts, 120000); return () => clearInterval(t); }, [loadCounts]);
  /* The browser tab says what is waiting, so the inbox is visible from any other tab. */
  React.useEffect(() => {
    const pg = CR_PAGES[cur.page];
    document.title = (counts.all > 0 ? "(" + counts.all + ") " : "") + (pg ? pg.label + " · " : "") + "Control Room";
  }, [counts.all, cur.page]);

  /* ── The tab's report back: header actions and facts ── */
  const [tabState, setTabState] = React.useState({ actions: [], facts: "", state: "loading" });
  const onReady = React.useCallback(s => setTabState(p => (p.actions === s.actions && p.facts === s.facts && p.state === s.state) ? p : s), []);
  const pendingAct = React.useRef(null);
  React.useEffect(() => {
    if (!pendingAct.current || tabState.state !== "ready") return;
    const a = tabState.actions.find(x => x.l === pendingAct.current);
    pendingAct.current = null;
    if (a && !a.disabled) a.run();
  }, [tabState]);

  /* ── Unsaved edits, reported by form blocks ── */
  const dirtyMap = React.useRef({});
  const [dirtyN, setDirtyN] = React.useState(0);
  const setDirty = React.useCallback((key, v) => {
    const prev = dirtyMap.current[key];
    if (!v) { if (!prev) return; delete dirtyMap.current[key]; }
    else { if (prev && prev.n === v.n) { dirtyMap.current[key] = v; return; } dirtyMap.current[key] = v; }
    setDirtyN(Object.values(dirtyMap.current).reduce((n, x) => n + x.n, 0));
  }, []);
  const dirty = dirtyN ? {
    n: dirtyN,
    save: async () => { for (const v of Object.values(dirtyMap.current)) await v.save(); },
    discard: () => Object.values(dirtyMap.current).forEach(v => v.discard()),
  } : null;

  /* ── Queue keys, reported by the open queue ── */
  const queueRef = React.useRef(null);
  const setQueue = React.useCallback(q => { queueRef.current = q; }, []);

  /* ── Navigation ── */
  const [reloadKey, setReloadKey] = React.useState(0);
  const askConfirm = c => new Promise(res => setConfirmQ(Object.assign({}, c, { res })));
  const go = async (page, tab, sub, opts) => {
    if (dirtyN && !(opts && opts.keepDirty)) {
      const ok = await askConfirm({ title: "Discard " + dirtyN + " unsaved change" + (dirtyN === 1 ? "" : "s") + "?", body: "You changed settings on this page and haven’t saved them.", cta: "Discard", danger: true, cancel: "Keep editing" });
      if (!ok) return;
      Object.values(dirtyMap.current).forEach(v => v.discard());
    }
    const tabs = crTabsFor(page, has);
    const t = tabs.find(x => x.id === tab) || tabs[0];
    if (!t) return say("That page needs a permission you don’t have", null, true);
    const next = { page, tab: t.id, sub: sub || "" };
    setLoc(next); setDrawer(null); setMenu(false); setCmd(false); setSwitcher(false); setAcct(false);
    history.pushState({ page: "admin" }, "", crPath(next.page, next.tab, next.sub));
    if (mainRef.current) mainRef.current.scrollTop = 0;
  };
  const portal = (name, panel) => {
    if (panel) history.pushState({ page: name }, "", "/" + name + "?panel=" + encodeURIComponent(panel));
    setPage(name);
  };
  React.useEffect(() => {
    window.__adminSection = (section, tab) => {
      const r = crResolve([section, tab]);
      if (r.portal) return portal(r.portal, r.panel);
      go(r.page, r.tab, r.sub);
    };
    return () => { window.__adminSection = null; };
  });

  const ctx = {
    api: NGGApi.admin, me, can: c => crCapOk(c, has), can1: has, phone, density, reloadKey,
    sub: cur.sub, page: cur.page, tab: cur.tab,
    setSub: s => { setLoc(l => Object.assign({}, l, { sub: s || "" })); history.replaceState({ page: "admin" }, "", crPath(cur.page, cur.tab, s)); },
    toast: say, confirm: askConfirm,
    form: spec => { setDrawer(null); setForm(spec); },
    palette: scope => { setCmdScope(scope || "all"); setCmd(true); },
    drawer: spec => setDrawer(spec), closeDrawer: () => setDrawer(null),
    go, portal, reloadAll: () => setReloadKey(k => k + 1), refreshCounts: loadCounts,
    setDirty, setQueue, studio: () => setPage("id-cards"),
  };
  const ctxRef = React.useRef(ctx);
  ctxRef.current = ctx;

  /* ── Keys (§4.5): plain keys are ignored while typing; ⌘ combos always work ── */
  React.useEffect(() => {
    const onKey = e => {
      const tag = (e.target && e.target.tagName) || "";
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) { e.preventDefault(); e.stopPropagation(); setCmdScope("all"); setCmd(c => !c); return; }
      if (mod && (e.key === "j" || e.key === "J")) { if (canAsk) { e.preventDefault(); setAsk(a => !a); } return; }
      if (e.key === "Escape") {
        if (confirmQ) { confirmQ.res(false); setConfirmQ(null); return; }
        if (cmd) return setCmd(false);
        if (form) return setForm(null);
        if (drawer) return setDrawer(null);
        if (acct || switcher || menu) { setAcct(false); setSwitcher(false); setMenu(false); return; }
        if (ask) return setAsk(false);
        return;
      }
      if (typing || mod || e.altKey) return;
      if (confirmQ || form || drawer || cmd || acct || menu) return;
      if (e.key === "/") { e.preventDefault(); setCmdScope("all"); setCmd(true); return; }
      if (e.key === "[" && !phone) { setCollapsed(c => { crLsSet(CR_LS.collapsed, c ? "0" : "1"); return !c; }); return; }
      /* A workspace (the inbox) owns its own keys while it is open:
         j/k, x, r, e, s and 1–9. It says whether it used the key. */
      const q = queueRef.current;
      if (q && q.key && q.key(e)) { e.preventDefault(); return; }
      if (/^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        const a = tabState.actions[n];
        if (a && !a.disabled) { e.preventDefault(); a.run(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  React.useEffect(() => { if (unlockNote) say(unlockNote); }, [unlockNote]);

  /* ── Account ── */
  const lock = async () => {
    setAcct(false); setMenu(false);
    try { await NGGApi.auth.adminLock(); } catch (_) {}
    auth.setAdminOk(false);
  };
  const signOut = () => { setAcct(false); setMenu(false); auth.signOut(); };
  const canAsk = has("audit") || has("summer");
  const portals = [{ l: "Control Room", icon: "squares-four", current: true, run: () => setSwitcher(false) }]
    .concat(has("summer") ? [{ l: "Summer School portal", icon: "sun", run: () => portal("summer-admin") }] : [])
    .concat(has("club") ? [{ l: "NGG Club portal", icon: "users-three", run: () => portal("club-admin") }] : [])
    .concat(has("people") || has("summer") ? [{ l: "ID Card Studio", icon: "identification-card", run: () => setPage("id-cards") }] : []);

  const palettePages = crPalettePages(has, (p, t) => go(p, t));
  const paletteActions = CR_ACTIONS.filter(a => CR_TAB_INDEX[a.tab] && crCapOk(CR_TAB_INDEX[a.tab].tab.cap, has)).map(a => ({
    icon: a.icon, l: a.l, path: "Action",
    run: () => { const ix = CR_TAB_INDEX[a.tab]; pendingAct.current = a.act || null; go(ix.page, a.tab); },
  }));
  const searchPeople = has("people") ? async q => {
    const r = await NGGApi.admin.members.list({ q, pageSize: 6, page: 1 });
    return (r.members || r.rows || []).slice(0, 6).map(x => ({ icon: "user", l: x.fullName, path: [x.displayId || x.memberId, x.centre].filter(Boolean).join(" · "), run: () => go("members", "members", x.memberId) }));
  } : null;

  const S = {
    page: cur.page, tab: cur.tab, me, counts, inboxCount: counts.all || 0, actions: tabState.actions, facts: tabState.facts,
    onReady, mainRef, banner, dismissBanner: () => { crSsSet("ngg.cr.banner", issue.key); setDismissed(issue.key); },
    switcher, toggleSwitcher: () => setSwitcher(s => !s), portals,
    openCmd: () => { setAcct(false); setMenu(false); setCmdScope("all"); setCmd(true); },
    toggleCollapse: () => setCollapsed(c => { crLsSet(CR_LS.collapsed, c ? "0" : "1"); return !c; }),
    canAsk, ask, toggleAsk: () => setAsk(a => !a),
    acct, toggleAcct: () => setAcct(a => !a),
    menu, openMenu: () => setMenu(true), closeMenu: () => setMenu(false),
    dirty, density, setDensity, lock, signOut, endsShort: ends.short,
  };
  const tabs = crTabsFor(cur.page, has);
  const layered = cmd || form || drawer || confirmQ;
  return (
    <div className={"cr-app is-" + density} ref={rootRef} data-tree={phone ? "phone" : "desktop"}>
      {phone ? <CrPhone S={S} nav={nav} tabs={tabs} ctx={ctx}/> : <CrDesktop S={S} nav={nav} tabs={tabs} ctx={ctx} L={L}/>}
      {typeof GuideTour === "function" && <GuideTour portal="control"/>}
      {phone && ask && <CrAsk where={CR_PAGES[cur.page].label} facts={tabState.facts} mode="overlay" onClose={() => setAsk(false)}/>}
      {acct && !phone && <CrAccountMenu me={me} ends={ends.long} density={density} setDensity={setDensity} onLock={lock} onSignOut={signOut} onClose={() => setAcct(false)}
        onShortcuts={() => { setAcct(false); say("⌘K search · ⌘J analyst · [ sidebar · J/K and 1–9 in Inbox · Esc close"); }}/>}
      {drawer && <CrDrawer d={drawer} phone={phone} onClose={() => setDrawer(null)}/>}
      {form && <CrFormSheet f={form} phone={phone} onClose={() => setForm(null)} toast={say}/>}
      {cmd && <CrPalette scope={cmdScope} pages={palettePages} actions={paletteActions} phone={phone} onClose={() => setCmd(false)} searchPeople={searchPeople}/>}
      {confirmQ && <CrConfirm c={confirmQ} onDone={v => { const r = confirmQ.res; setConfirmQ(null); r(v); }}/>}
      {toastNode(!!dirty && !layered)}
    </div>
  );
}
