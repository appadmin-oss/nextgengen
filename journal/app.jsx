/* ============================================================================
   NGG Anchor Journal — installable, offline-first PWA.

   A member's daily companion for the Anchor 12 journey: mood + guided
   reflection, streaks, entry history, this-week's missions and progress.

   - Reuses window.NGGApi (loaded first) → shares the site's HttpOnly session
     cookie, so a member already signed in on the main site is signed in here
     automatically (SSO). Otherwise a sign-in gate mirrors the main flow.
   - Offline-first: entries render from a local cache instantly and new
     reflections are queued in localStorage and synced when back online.
   - Mounts to #aj-root. No dependency on the marketing bundle.
   ============================================================================ */

const { useState, useEffect, useRef, useCallback } = React;

const MOODS = [
  { key: "🔥", label: "On fire" },
  { key: "🙂", label: "Good" },
  { key: "😐", label: "Flat" },
  { key: "😔", label: "Low" },
  { key: "😴", label: "Drained" },
];

const PROMPTS = [
  "What did you make, build or ship today — however small?",
  "Who did you help, and what did it cost you?",
  "What scared you a little today? Did you do it anyway?",
  "Name one thing you learned that you didn't know this morning.",
  "Where did you show discipline when no one was watching?",
  "What would the leader you're becoming have done differently today?",
  "What's one skill you moved forward, even by an inch?",
  "Who in your circle did you lift up today?",
  "What did you finish that you'd been avoiding?",
  "What's the bravest sentence you could write right now?",
  "Describe a moment today you felt fully yourself.",
  "What did failure teach you this week?",
  "What are you grateful for that money can't buy?",
  "What's the next small step on the thing that matters most?",
  "How did you use your voice today?",
  "What did you notice about your community that others missed?",
  "What would you tell your younger self about today?",
  "Where did you choose the hard right over the easy wrong?",
  "What are you building toward — and did you touch it today?",
  "What's one habit that's quietly shaping who you become?",
];

const TABS = [
  { id: "today",    label: "Today",   ico: "✦" },
  { id: "entries",  label: "Journal", ico: "❏" },
  { id: "missions", label: "Missions",ico: "◎" },
  { id: "progress", label: "Progress",ico: "▲" },
];

/* ---- Local persistence (offline-first) ---------------------------------- */
const CACHE_KEY = "ngg_aj_cache_v1";
const QUEUE_KEY = "ngg_aj_queue_v1";
const store = {
  cache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } },
  setCache(v) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch {} },
  queue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; } },
  setQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} },
  enqueue(item) { const q = store.queue(); q.push(item); store.setQueue(q); },
  dequeue(tempId) { store.setQueue(store.queue().filter(i => i.tempId !== tempId)); },
};

/* ---- Toasts ------------------------------------------------------------- */
let _pushToast = () => {};
const toast = {
  ok: (m) => _pushToast(m, "ok"),
  err: (m) => _pushToast(m, "err"),
  info: (m) => _pushToast(m, ""),
};
function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    _pushToast = (msg, kind) => {
      const id = Math.random().toString(36).slice(2);
      setItems(x => [...x, { id, msg, kind }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 3200);
    };
    return () => { _pushToast = () => {}; };
  }, []);
  return (
    <div className="aj-toasts" role="status" aria-live="polite">
      {items.map(i => <div key={i.id} className={"aj-toast " + i.kind}>{i.msg}</div>)}
    </div>
  );
}

/* ---- Helpers ------------------------------------------------------------ */
function humanErr(e) {
  const c = (e && (e.code || e.message)) || "";
  if (/network|fetch|Failed/i.test(c)) return "You're offline — saved on this device.";
  return c || "Something went wrong.";
}
function isOffline(e) { return e && /network|fetch|Failed to fetch|offline/i.test(e.message || e.code || ""); }
function fmtDay(d) { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }); }
function fmtShort(d) { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function promptOfDay(offset) { const seed = Math.floor(Date.now() / 86400000) + (offset || 0); return PROMPTS[((seed % PROMPTS.length) + PROMPTS.length) % PROMPTS.length]; }

/* ========================================================================== */
function App() {
  const [booting, setBooting] = useState(true);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("today");
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  const [entries, setEntries] = useState(() => store.cache().entries || null); // server entries
  const [pending, setPending] = useState(() => store.queue());
  const [stats, setStats] = useState(() => store.cache().stats || null);
  const [session, setSession] = useState(() => store.cache().session || null);
  const [today, setToday] = useState(() => store.cache().today || null);

  /* Boot: who am I? (shared cookie → SSO). */
  useEffect(() => {
    let alive = true;
    NGGApi.auth.me()
      .then(r => { if (!alive) return; setMember(r.member || null); })
      .catch(() => {})
      .finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, []);

  /* Online/offline wiring. */
  useEffect(() => {
    const on = () => { setOnline(true); syncPending(); refresh(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const onVis = () => { if (!document.hidden && navigator.onLine) { syncPending(); refresh(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line
  }, [member]);

  const persist = useCallback((patch) => {
    const next = Object.assign({}, store.cache(), patch, { savedAt: Date.now() });
    store.setCache(next);
  }, []);

  /* Fetch fresh data (stale-while-revalidate). */
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [dash, jrnl] = await Promise.all([
        NGGApi.member.dashboard().catch(() => null),
        NGGApi.member.journal().catch(() => null),
      ]);
      if (dash) { setStats(dash.stats || null); setSession(dash.session || null); setToday(dash.today || null); persist({ stats: dash.stats, session: dash.session, today: dash.today }); }
      if (jrnl) { setEntries(jrnl.entries || []); persist({ entries: jrnl.entries || [] }); }
    } catch (_) {/* keep cache */}
  }, [persist]);

  useEffect(() => { if (member) refresh(); }, [member, refresh]);

  /* Sync any queued (offline) entries. */
  const syncPending = useCallback(async () => {
    const q = store.queue();
    if (!q.length || !navigator.onLine) return;
    setSyncing(true);
    for (const item of q) {
      try {
        await NGGApi.member.journalCreate({ mood: item.mood, body: item.body, private: true });
        store.dequeue(item.tempId);
      } catch (e) { if (isOffline(e)) break; else store.dequeue(item.tempId); }
    }
    setPending(store.queue());
    setSyncing(false);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!member) return;
    syncPending();
    const id = setInterval(() => { if (navigator.onLine) syncPending(); }, 20000);
    return () => clearInterval(id);
  }, [member, syncPending]);

  /* Create an entry — optimistic + offline queue. */
  const saveEntry = useCallback(async (mood, body) => {
    const week = (session && session.weekOf) || (stats && stats.currentWeek) || 1;
    const tempId = "t-" + Date.now();
    const item = { tempId, mood, body, week, createdAt: new Date().toISOString() };
    store.enqueue(item);
    setPending(store.queue());
    try {
      await NGGApi.member.journalCreate({ mood, body, private: true });
      store.dequeue(tempId);
      setPending(store.queue());
      toast.ok("Entry saved ✓");
      await refresh();
    } catch (e) {
      if (isOffline(e)) toast.info("Saved offline — will sync when you're back online.");
      else { store.dequeue(tempId); setPending(store.queue()); toast.err(humanErr(e)); throw e; }
    }
  }, [session, stats, refresh]);

  if (booting) return <BootSplash/>;
  if (!member) return <SignInGate onIn={(m) => { setMember(m); }}/>;

  const streak = (stats && stats.streak) || 0;
  const week = (session && session.weekOf) || (stats && stats.currentWeek) || 0;
  const totalWeeks = (session && session.totalWeeks) || 12;

  return (
    <div className="aj-app">
      <TopBar member={member} streak={streak} online={online} syncing={syncing}/>
      <main className="aj-main" id="aj-main">
        {!online && <div className="aj-offline">⚠︎ Offline — your reflections are saved on this device and sync automatically.</div>}
        {tab === "today" && <TodayView member={member} week={week} totalWeeks={totalWeeks} session={session} today={today} onSave={saveEntry}/>}
        {tab === "entries" && <EntriesView entries={entries} pending={pending}/>}
        {tab === "missions" && <MissionsView/>}
        {tab === "progress" && <ProgressView stats={stats} entries={entries} week={week} totalWeeks={totalWeeks}/>}
      </main>
      <TabBar tab={tab} setTab={setTab}/>
      <InstallPrompt/>
      <Toasts/>
    </div>
  );
}

/* ---- Chrome ------------------------------------------------------------- */
function TopBar({ member, streak, online, syncing }) {
  const first = String(member.fullName || "Member").split(" ")[0];
  return (
    <header className="aj-topbar">
      <div className="aj-topbar-brand">
        <img className="aj-topbar-logo" src="/assets/logo.png" alt=""/>
        <div>
          <div className="aj-topbar-title">Anchor Journal</div>
          <div className="aj-topbar-sub">{first}</div>
        </div>
      </div>
      <div className="aj-topbar-spacer"/>
      <div className={"aj-sync" + (!online ? " is-off" : syncing ? " is-syncing" : "")} title={online ? (syncing ? "Syncing" : "Online") : "Offline"}>
        <span className="aj-sync-dot"/>{online ? (syncing ? "Sync" : "Live") : "Offline"}
      </div>
      <div className="aj-streak" title="Day streak"><span>🔥</span>{streak}</div>
    </header>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <nav className="aj-tabbar" role="tablist" aria-label="Journal sections">
      {TABS.map(t => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} aria-label={t.label}
          className={"aj-tab" + (tab === t.id ? " is-active" : "")} onClick={() => setTab(t.id)} style={{ position: "relative" }}>
          <span className="aj-tab-ico" aria-hidden="true">{t.ico}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/* ---- Today -------------------------------------------------------------- */
function TodayView({ member, week, totalWeeks, session, today, onSave }) {
  const [mood, setMood] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [promptOffset, setPromptOffset] = useState(0);
  const prompt = promptOfDay(promptOffset);
  const first = String(member.fullName || "there").split(" ")[0];

  const submit = async () => {
    if (!body.trim()) { toast.err("Write a line first."); return; }
    setBusy(true);
    try { await onSave(mood || "🙂", body.trim()); setBody(""); setMood(""); }
    catch (_) {} finally { setBusy(false); }
  };

  const openMissions = (today || []).filter(m => m.status === "todo" || m.status === "rejected");

  return (
    <React.Fragment>
      <div className="aj-hero">
        <div className="aj-hero-date">{greeting()} · {fmtDay(new Date())}</div>
        <h1 className="aj-h aj-h-xl">{first}.</h1>
        {week > 0 && <div className="aj-hero-week"><span className="aj-chip">WEEK {week} / {totalWeeks}</span>{session && session.theme ? <span>· {session.theme}</span> : null}</div>}
      </div>

      <div className="aj-card">
        <div className="aj-eyebrow">TODAY'S REFLECTION</div>
        <h2 className="aj-h aj-h-lg">How's your day?</h2>
        <div className="aj-moods" role="radiogroup" aria-label="Mood">
          {MOODS.map(m => (
            <button key={m.key} className={"aj-mood" + (mood === m.key ? " is-sel" : "")} role="radio" aria-checked={mood === m.key} aria-label={m.label} onClick={() => setMood(m.key)}>{m.key}</button>
          ))}
        </div>
        <div className="aj-prompt">
          <span className="aj-prompt-label">Prompt</span>
          {prompt}
          <div><button className="aj-prompt-shuffle" onClick={() => setPromptOffset(o => o + 1)}>↻ New prompt</button></div>
        </div>
        <textarea className="aj-textarea" placeholder="Write freely. Nobody sees this but you." value={body} maxLength={4000} onChange={e => setBody(e.target.value)} aria-label="Reflection"/>
        <div className="aj-count">{body.length} / 4000</div>
        <button className="aj-btn aj-btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save today's entry"}</button>
      </div>

      {openMissions.length > 0 && (
        <div className="aj-card">
          <div className="aj-eyebrow">THIS WEEK'S MISSIONS</div>
          <h2 className="aj-h aj-h-lg" style={{ marginBottom: 10 }}>{openMissions.length} to do</h2>
          {openMissions.slice(0, 4).map(m => (
            <div className="aj-mission" key={m.missionId}>
              <div className="aj-mission-icon" aria-hidden="true">{m.type === "Make" ? "✦" : m.type === "Read" ? "✺" : m.type === "Speak" ? "▶" : "◎"}</div>
              <div><div className="aj-mission-t">{m.title}</div><div className="aj-mission-m">{m.type} · +{m.xp} XP</div></div>
              <span className="aj-mission-st st-todo">to do</span>
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

/* ---- Entries ------------------------------------------------------------ */
function EntriesView({ entries, pending }) {
  const [q, setQ] = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const pend = (pending || []).map(p => ({ entryId: p.tempId, mood: p.mood, body: p.body, week: p.week, createdAt: p.createdAt, _pending: true }));
  const all = [...pend, ...(entries || [])];
  const filtered = all.filter(e =>
    (!moodFilter || e.mood === moodFilter) &&
    (!q || (e.body || "").toLowerCase().includes(q.toLowerCase()))
  );

  if (entries === null) return <ListSkeleton/>;

  return (
    <React.Fragment>
      <div className="aj-hero"><div className="aj-eyebrow">YOUR JOURNAL</div><h1 className="aj-h aj-h-lg">{all.length} {all.length === 1 ? "entry" : "entries"}</h1></div>
      <input className="aj-search" placeholder="Search your reflections…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search entries"/>
      <div className="aj-filter">
        <button className={"aj-filter-chip" + (!moodFilter ? " is-sel" : "")} onClick={() => setMoodFilter("")} aria-label="All moods">All</button>
        {MOODS.map(m => <button key={m.key} className={"aj-filter-chip" + (moodFilter === m.key ? " is-sel" : "")} onClick={() => setMoodFilter(moodFilter === m.key ? "" : m.key)} aria-label={m.label}>{m.key}</button>)}
      </div>
      {filtered.length === 0
        ? <div className="aj-empty"><div className="aj-empty-ico">✎</div><p>{all.length === 0 ? "No entries yet. Your first reflection starts on Today." : "Nothing matches that search."}</p></div>
        : filtered.map(e => (
          <div className="aj-entry" key={e.entryId}>
            <div className="aj-entry-head">
              <span className="aj-entry-mood">{e.mood || "•"}</span>
              <span className="aj-entry-date">{fmtShort(e.createdAt)}</span>
              {e.week ? <span className="aj-entry-week">WK {e.week}</span> : null}
            </div>
            <div className="aj-entry-body">{e.body}</div>
            {e._pending && <span className="aj-entry-pending">◷ pending sync</span>}
          </div>
        ))}
    </React.Fragment>
  );
}

/* ---- Missions ----------------------------------------------------------- */
function MissionsView() {
  const [data, setData] = useState(store.cache().anchor || null);
  const [err, setErr] = useState("");
  useEffect(() => {
    NGGApi.member.anchor()
      .then(r => { setData(r); const c = store.cache(); c.anchor = r; store.setCache(c); })
      .catch(e => { if (!store.cache().anchor) setErr(humanErr(e)); });
  }, []);
  if (err && !data) return <div className="aj-empty"><div className="aj-empty-ico">◎</div><p>{err}</p></div>;
  if (!data) return <ListSkeleton/>;
  const weeks = data.weeks || [];
  return (
    <React.Fragment>
      <div className="aj-hero"><div className="aj-eyebrow">ANCHOR 12</div><h1 className="aj-h aj-h-lg">The missions</h1></div>
      {weeks.length === 0 && <div className="aj-empty"><div className="aj-empty-ico">◎</div><p>Missions publish as your session runs.</p></div>}
      {weeks.map(w => (
        <div className="aj-week" key={w.week}>
          <div className="aj-week-h"><b>WK {String(w.week).padStart(2, "0")}</b> {w.theme || ""}</div>
          {w.missions.map(m => (
            <div className="aj-mission" key={m.missionId}>
              <div className="aj-mission-icon" aria-hidden="true">{m.type === "Make" ? "✦" : m.type === "Read" ? "✺" : m.type === "Speak" ? "▶" : "◎"}</div>
              <div><div className="aj-mission-t">{m.title}</div><div className="aj-mission-m">{m.type} · +{m.xp} XP</div></div>
              <span className={"aj-mission-st st-" + (m.status === "verified" ? "verified" : m.status === "submitted" ? "submitted" : "todo")}>{m.status === "verified" ? "done" : m.status === "submitted" ? "in review" : "to do"}</span>
            </div>
          ))}
        </div>
      ))}
    </React.Fragment>
  );
}

/* ---- Progress ----------------------------------------------------------- */
function ProgressView({ stats, entries, week, totalWeeks }) {
  if (!stats) return <ListSkeleton/>;
  // 28-day activity heatmap from entry dates.
  const days = {};
  (entries || []).forEach(e => { const k = String(e.createdAt).slice(0, 10); days[k] = (days[k] || 0) + 1; });
  const cells = [];
  for (let i = 27; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); const n = days[d] || 0; cells.push(n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3); }
  const badges = stats.badges || [];
  return (
    <React.Fragment>
      <div className="aj-hero"><div className="aj-eyebrow">YOUR PROGRESS</div><h1 className="aj-h aj-h-lg">The climb.</h1></div>
      <div className="aj-stats">
        <div className="aj-stat"><div className="aj-stat-n">{String(stats.level || 1).padStart(2, "0")}</div><div className="aj-stat-l">Level</div></div>
        <div className="aj-stat"><div className="aj-stat-n">{stats.streak || 0}<span style={{ fontSize: 16 }}>d</span></div><div className="aj-stat-l">Streak</div></div>
        <div className="aj-stat"><div className="aj-stat-n">{stats.xp || 0}</div><div className="aj-stat-l">XP</div></div>
        <div className="aj-stat"><div className="aj-stat-n">{(entries || []).length}</div><div className="aj-stat-l">Entries</div></div>
      </div>
      <div className="aj-card">
        <div className="aj-eyebrow">LAST 28 DAYS</div>
        <div className="aj-heat">{cells.map((c, i) => <div key={i} className={"aj-heat-cell" + (c ? " on-" + c : "")}/>)}</div>
      </div>
      {badges.length > 0 && (
        <div className="aj-card">
          <div className="aj-eyebrow">BADGES</div>
          <div className="aj-badges">{badges.map(b => <span className="aj-badge" key={b}>{b.replace(/-/g, " ")}</span>)}</div>
        </div>
      )}
      {week > 0 && (
        <div className="aj-card">
          <div className="aj-eyebrow">SESSION</div>
          <h2 className="aj-h aj-h-lg">Week {week} of {totalWeeks}</h2>
          <div style={{ height: 8, borderRadius: 8, background: "rgba(255,255,255,0.1)", marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: Math.min(100, Math.round(week / totalWeeks * 100)) + "%", background: "linear-gradient(90deg,#f5b026,#d0ff3a)" }}/>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* ---- Sign-in gate (mirrors the main site's magic-link + OTP flow) ------- */
function SignInGate({ onIn }) {
  const [stage, setStage] = useState("id"); // id | otp
  const [id, setId] = useState("");
  const [otp, setOtp] = useState("");
  const [masked, setMasked] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Consume a magic-link token if present (?signin=…).
  useEffect(() => {
    const t = new URLSearchParams(location.search).get("signin");
    if (!t) return;
    setBusy(true);
    NGGApi.auth.verify({ token: t }).then(r => onIn(r.member)).catch(e => setErr(e.code || e.message)).finally(() => setBusy(false));
  }, []);

  const request = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await NGGApi.auth.request(id.trim()); setMasked(r.masked || ""); setStage("otp"); }
    catch (e) { setErr(e.code === "rate_limited" ? "Too many tries — wait a minute." : (e.code || e.message)); }
    finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await NGGApi.auth.verify({ memberId: id.trim(), otp: otp.replace(/\s/g, "") }); onIn(r.member); }
    catch (e) { setErr("That code didn't work. Check the latest one, or use the magic link in your email."); }
    finally { setBusy(false); }
  };

  return (
    <div className="aj-gate">
      <div className="aj-gate-card">
        <img src="/assets/logo.png" alt="" style={{ width: 56, height: 56, borderRadius: 14, marginBottom: 14 }}/>
        <div className="aj-eyebrow" style={{ color: "var(--aj-gold)" }}>ANCHOR JOURNAL</div>
        <h1 className="aj-h aj-h-xl" style={{ marginBottom: 8 }}>Sign in.</h1>
        {stage === "id" ? (
          <form onSubmit={request}>
            <p className="aj-muted" style={{ fontSize: 14 }}>Enter your Member ID or email. We'll send a magic link and a 6-digit code.</p>
            <input className="aj-input" placeholder="NGG-2025-0001 or you@email.com" value={id} onChange={e => setId(e.target.value)} autoFocus/>
            <div className="aj-gate-err">{err}</div>
            <button className="aj-btn aj-btn-primary" disabled={busy || id.trim().length < 3}>{busy ? "Sending…" : "Send my code →"}</button>
            <button type="button" className="aj-prompt-shuffle" style={{ marginTop: 12 }} onClick={() => setStage("otp")}>I already have a code</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="aj-muted" style={{ fontSize: 14 }}>{masked ? <>Code sent to <b>{masked}</b>.</> : "Enter your Member ID and the 6-digit code."}</p>
            {!masked && <input className="aj-input" placeholder="Member ID (NGG-2025-0001)" value={id} onChange={e => setId(e.target.value)}/>}
            <input className="aj-input aj-otp" inputMode="numeric" maxLength={7} placeholder="••••••" value={otp} onChange={e => setOtp(e.target.value.replace(/[^\d ]/g, ""))} autoFocus/>
            <div className="aj-gate-err">{err}</div>
            <button className="aj-btn aj-btn-primary" disabled={busy || otp.replace(/\s/g, "").length !== 6}>{busy ? "Verifying…" : "Enter journal →"}</button>
            <button type="button" className="aj-prompt-shuffle" style={{ marginTop: 12 }} onClick={() => { setStage("id"); setErr(""); }}>← Start over</button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---- Install prompt ----------------------------------------------------- */
function InstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("ngg_aj_install_dismissed") === "1");
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (!evt || dismissed || standalone) return null;
  return (
    <div className="aj-install" role="dialog" aria-label="Install app">
      <img src="/assets/logo.png" alt="" style={{ width: 34, height: 34, borderRadius: 9 }}/>
      <div className="aj-install-txt"><b>Install the Anchor Journal</b><br/><span className="aj-muted">Add it to your home screen — works offline.</span></div>
      <button className="aj-btn aj-btn-lime" style={{ padding: "10px 14px" }} onClick={async () => { evt.prompt(); try { await evt.userChoice; } catch {} setEvt(null); }}>Install</button>
      <button className="aj-install-x" aria-label="Dismiss" onClick={() => { setDismissed(true); localStorage.setItem("ngg_aj_install_dismissed", "1"); }}>✕</button>
    </div>
  );
}

/* ---- Loading states ----------------------------------------------------- */
function BootSplash() {
  return <div className="aj-gate"><div style={{ textAlign: "center" }}><img src="/assets/logo.png" alt="" style={{ width: 64, height: 64, borderRadius: 16 }}/><div className="aj-spinner"/></div></div>;
}
function ListSkeleton() {
  return <React.Fragment><div className="aj-skel" style={{ height: 90, marginBottom: 12 }}/><div className="aj-skel" style={{ height: 120, marginBottom: 12 }}/><div className="aj-skel" style={{ height: 120 }}/></React.Fragment>;
}

/* ---- Error boundary ----------------------------------------------------- */
class AJErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error("[AnchorJournal]", err); } catch {} }
  render() {
    if (this.state.err) return <div className="aj-gate"><div className="aj-gate-card"><h1 className="aj-h aj-h-lg">Something broke.</h1><p className="aj-muted">Reload the app to continue.</p><button className="aj-btn aj-btn-primary" onClick={() => location.reload()}>Reload</button></div></div>;
    return this.props.children;
  }
}

/* ---- Mount + service worker -------------------------------------------- */
ReactDOM.createRoot(document.getElementById("aj-root")).render(
  <AJErrorBoundary><App/></AJErrorBoundary>
);

if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/journal/sw.js", { scope: "/journal/" }).catch(() => {}));
}
