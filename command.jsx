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
  // Floating bottom-left hint, dismissible.
  const [dismissed, setDismissed] = React.useState(
    typeof localStorage !== "undefined" && localStorage.getItem("ngg.cmdk.dismissed") === "1"
  );
  if (dismissed) return null;
  return (
    <button
      className="cmdk-hint"
      onClick={() => {
        const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true });
        window.dispatchEvent(evt);
      }}
      aria-label="Open command palette"
    >
      <span><kbd>⌘</kbd><kbd>K</kbd></span>
      <span className="cmdk-hint-text">Quick nav</span>
      <span
        className="cmdk-hint-x"
        onClick={(e) => {
          e.stopPropagation();
          setDismissed(true);
          try { localStorage.setItem("ngg.cmdk.dismissed", "1"); } catch (_) {}
        }}
      >✕</span>
    </button>
  );
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
    { id: "nav.join",       section: "Pages", icon: "→", label: "Apply for a session", hint: "Open applications",    run: nav("join"),    keywords: ["apply","join"] },
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
    list.push(
      { id: "adm.console",  section: "Admin", icon: "⚙", label: "Admin console",  hint: "All admin sections",      run: nav("admin") },
      { id: "adm.members",  section: "Admin", icon: "◯", label: "Members",         hint: "Browse + edit",            run: () => { window.__navigate && window.__navigate("admin"); setTimeout(() => window.__adminSection && window.__adminSection("members"), 60); } },
      { id: "adm.posts",    section: "Admin", icon: "✎", label: "New post",        hint: "Blog · news · update",     run: () => { window.__navigate && window.__navigate("admin"); setTimeout(() => window.__adminSection && window.__adminSection("posts"), 60); } },
      { id: "adm.events",   section: "Admin", icon: "▶", label: "New event",       hint: "Showcase · parent meet",   run: () => { window.__navigate && window.__navigate("admin"); setTimeout(() => window.__adminSection && window.__adminSection("events"), 60); } },
      { id: "adm.broadcast",section: "Admin", icon: "✉", label: "Broadcast",       hint: "Notify every member",      run: () => { window.__navigate && window.__navigate("admin"); setTimeout(() => window.__adminSection && window.__adminSection("broadcast"), 60); } },
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
