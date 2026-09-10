/* ================================================================
   NGG — Command palette (Cmd-K / Ctrl-K).
   Quick navigation, member actions, admin shortcuts.
   ================================================================ */

function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const auth = useAuth();
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      } else if (e.key === "/" && !open && !isMeta && !isEditableTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("no-scroll");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  React.useEffect(() => { setActive(0); }, [query]);

  const items = React.useMemo(() => buildItems(auth), [auth.isSignedIn, auth.isAdmin, auth.member && auth.member.memberId]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.label.toLowerCase().includes(q) ||
      (it.hint && it.hint.toLowerCase().includes(q)) ||
      (it.keywords || []).some(k => k.toLowerCase().includes(q))
    );
  }, [items, query]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(filtered.length - 1, a + 1)); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
      else if (e.key === "Enter")     {
        e.preventDefault();
        const hit = filtered[active];
        if (hit) { hit.run(); setOpen(false); setQuery(""); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active]);

  if (!open) {
    return <CommandHint/>;
  }

  return (
    <div className="cmdk-scrim" onMouseDown={() => setOpen(false)}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input-wrap">
          <span className="cmdk-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Jump to a page, run an action, search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search commands"
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className="cmdk-esc">ESC</kbd>
        </div>
        <div className="cmdk-list" role="listbox">
          {filtered.length === 0 && (
            <div className="cmdk-empty">
              <div className="cmdk-empty-h">No matches.</div>
              <div className="cmdk-empty-sub">Try “Anchor” or “Sign in”.</div>
            </div>
          )}
          {groupBy(filtered, "section").map(([sec, group]) => (
            <div key={sec} className="cmdk-group">
              <div className="cmdk-group-h">{sec}</div>
              {group.map(it => (
                <button
                  key={it.id}
                  role="option"
                  aria-selected={filtered[active] === it}
                  className={"cmdk-item" + (filtered[active] === it ? " is-active" : "")}
                  onMouseEnter={() => setActive(filtered.indexOf(it))}
                  onClick={() => { it.run(); setOpen(false); setQuery(""); }}
                >
                  <span className="cmdk-item-icon" aria-hidden="true">{it.icon || "›"}</span>
                  <span className="cmdk-item-body">
                    <span className="cmdk-item-label">{it.label}</span>
                    {it.hint && <span className="cmdk-item-hint">{it.hint}</span>}
                  </span>
                  {it.kbd && <kbd>{it.kbd}</kbd>}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function CommandHint() {
  // A gentle, self-retiring hint — never a permanent floater. It:
  //  · stays hidden inside full-screen app chrome (community/admin) where it
  //    would overlap the UI (a `cm-app`/`admin` body class marks those),
  //  · auto-hides after ~14s so it never lingers over content,
  //  · shows at most a few times ever, then bows out for good,
  //  · is fully dismissible.
  /* `own-chrome` is set by the router from OWN_CHROME_PAGES (see app.jsx), which
     is the single list of surfaces that draw their own full screen. It replaces a
     regex that only knew about /community and /admin — so the hint used to float
     over the gate desk, the guardian pages and the public registration form,
     where on a phone it landed directly on a field's help text. */
  const appChrome = () => typeof document !== "undefined" && (
    document.body.classList.contains("own-chrome") ||
    document.body.classList.contains("cm-app") ||
    /^\/(community|nextadmin|admin)/.test(location.pathname));
  const seen = () => { try { return parseInt(localStorage.getItem("ngg.cmdk.seen") || "0", 10); } catch (_) { return 0; } };
  const [hidden, setHidden] = React.useState(
    (typeof localStorage !== "undefined" && localStorage.getItem("ngg.cmdk.dismissed") === "1") || seen() >= 3 || appChrome()
  );
  React.useEffect(() => {
    if (hidden) return;
    try { localStorage.setItem("ngg.cmdk.seen", String(seen() + 1)); } catch (_) {}
    const t = setTimeout(() => setHidden(true), 14000);
    const onNav = () => { if (appChrome()) setHidden(true); };
    window.addEventListener("popstate", onNav);
    return () => { clearTimeout(t); window.removeEventListener("popstate", onNav); };
  }, [hidden]);
  if (hidden) return null;
  return (
    <button
      className="cmdk-hint"
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
      aria-label="Open quick navigation (Command or Control + K)"
    >
      <span aria-hidden="true"><kbd>⌘</kbd><kbd>K</kbd></span>
      <span className="cmdk-hint-text">Quick nav</span>
      <span
        className="cmdk-hint-x" role="button" aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          setHidden(true);
          try { localStorage.setItem("ngg.cmdk.dismissed", "1"); } catch (_) {}
        }}
      >✕</span>
    </button>
  );
}

/* Open the Control Room at a named section.
 *
 * The console publishes `window.__adminSection` from an effect, so it does not
 * exist until AdminPage has mounted. Every call site used to guess at that with
 * a 60ms setTimeout, which is a race that mostly wins — and when it loses, the
 * palette navigates to the Overview and the section the operator asked for is
 * silently dropped. This polls briefly instead, and gives up rather than
 * hanging, so the failure is "you are on the Overview" and not a wedged tab.
 *
 * Section ids are resolved through ADMIN_SECTION_ALIASES by the console itself,
 * so a retired id still lands where the work moved.
 */
function adminGo(sectionId) {
  if (window.__navigate) window.__navigate("admin");
  let tries = 0;
  const go = () => {
    if (window.__adminSection) { window.__adminSection(sectionId); return; }
    if (++tries > 40) return;      // ~2s, then leave them on the Overview
    setTimeout(go, 50);
  };
  go();
}

function buildItems(auth) {
  const nav = (id) => () => window.__navigate && window.__navigate(id);
  const list = [
    { id: "nav.home",       section: "Pages", icon: "◉", label: "Home",          hint: "Hero, programs, the room", run: nav("home"),    keywords: ["start","intro"] },
    { id: "nav.summer",     section: "Pages", icon: "☀", label: "Summer Students",hint: "The on-ramp",              run: nav("summer") },
    { id: "nav.club",       section: "Pages", icon: "◐", label: "NGGC",            hint: "The identity society",     run: nav("club"),    keywords: ["club","identity"] },
    { id: "nav.anchor",     section: "Pages", icon: "✦", label: "Anchor 12",       hint: "The 12-week flagship",     run: nav("anchor") },
    { id: "nav.book",       section: "Pages", icon: "📕", label: "The Anchor book",hint: "Field manual",             run: nav("book"),    keywords: ["book","manual"] },
    { id: "nav.blog",       section: "Pages", icon: "✎", label: "The Journal",     hint: "Blog · stories",           run: nav("blog"),    keywords: ["blog","stories"] },
    { id: "nav.media",      section: "Pages", icon: "▶", label: "Media room",      hint: "Films · podcast · reels",  run: nav("media") },
    { id: "nav.parents",    section: "Pages", icon: "♡", label: "For parents",     hint: "Safeguarding · FAQ",       run: nav("parents") },
    { id: "nav.volunteers", section: "Pages", icon: "✚", label: "Become a mentor", hint: "Volunteer with NGG",       run: nav("volunteers") },
    /* Two distinct programmes, two entries. One "Apply" that opened whichever
       programme a stale global happened to be holding is how somebody applies
       to Anchor 12 believing they applied to Summer School. */
    { id: "nav.join.summer", section: "Pages", icon: "→", label: "Apply · Summer School", hint: "The six-week on-ramp",
      run: () => goApply(window.__navigate, "summer"), keywords: ["apply", "join", "summer", "school"] },
    { id: "nav.join.anchor", section: "Pages", icon: "⚓", label: "Apply · Anchor 12", hint: "The twelve-week flagship",
      run: () => goApply(window.__navigate, "anchor"), keywords: ["apply", "join", "anchor"] },
  ];

  if (auth.isSignedIn) {
    list.push(
      { id: "me.dashboard", section: "You",   icon: "◎", label: "Open dashboard",    hint: "Missions, streak, journal", run: nav("dashboard") },
      { id: "me.anchor",    section: "You",   icon: "◴", label: "My anchor progress",hint: "Current week + missions",   run: nav("anchor") },
      { id: "me.signout",   section: "You",   icon: "⏻", label: "Sign out",           hint: "End this session",          run: () => auth.signOut && auth.signOut() },
    );
  } else {
    list.push(
      { id: "me.signin", section: "You", icon: "→", label: "Sign in",     hint: "Members + admins",  run: () => auth.openSignIn && auth.openSignIn() },
    );
  }

  if (auth.isAdmin) {
    /* EVERY admin section, generated from ADMIN_SECTIONS.
     *
     * There used to be five hand-written entries — members, posts, events,
     * broadcast and "the console" — out of some forty sections, each repeating
     * the same navigate-then-setSection dance with a magic 60ms timeout. So
     * ⌘K, the fastest way to reach anything in the product, could not reach
     * thirty-five of the places an administrator works, and the console's
     * sidebar was the only route to them.
     *
     * Generated from the section table means it cannot go stale: a section
     * added there is searchable here, gated by the same capability, with the
     * same label. */
    list.push({ id: "adm.console", section: "Admin", icon: "⚙", label: "Control Room",
      hint: "The staff console", run: nav("admin") });
    (typeof ADMIN_SECTIONS !== "undefined" ? ADMIN_SECTIONS : [])
      .filter(sec => sec.id !== "home")
      .filter(sec => !sec.cap || (auth.hasCap && auth.hasCap(sec.cap)))
      .forEach(sec => list.push({
        id: "adm." + sec.id, section: "Admin", icon: sec.icon || "›",
        label: sec.label,
        hint: (sec.group ? sec.group + " · " : "") + (sec.title || sec.label),
        keywords: [sec.id, sec.group || ""].filter(Boolean),
        run: () => adminGo(sec.id),
      }));
    // Two shortcuts that are an ACTION rather than a place, so they read as
    // verbs beside the sections.
    list.push(
      { id: "adm.new.post",  section: "Admin", icon: "✎", label: "New post", hint: "Blog · news · update", keywords: ["write", "publish"], run: () => adminGo("posts") },
      { id: "adm.new.event", section: "Admin", icon: "▶", label: "New event", hint: "Showcase · parent meet", keywords: ["schedule"], run: () => adminGo("events") },
    );
  }

  return list;
}

function groupBy(items, key) {
  const map = new Map();
  for (const it of items) {
    const k = it[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return Array.from(map.entries());
}

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

window.CommandPalette = CommandPalette;
