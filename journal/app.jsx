/* ============================================================================
   NGG Anchor Journal — installable, offline-first PWA.  Design-matched build.
   "A daily discipline for an incorruptible generation. Twelve weeks. One
   reflection at a time."

   Screens: onboarding · journey (path) · reflect editor (morning quote +
   read-aloud, musing, 3-sentence night reflection) · daily systems · growth
   (rank ring, streak/diamonds, week dots, rank ladder, self-score, habit
   focus, 12-week map) · prompt library · peers · weekly review · you.

   Reuses window.NGGApi (shared cookie → SSO). Progression (XP/diamonds/streak/
   rank) is derived from server-persisted journal entries. Daily systems, weekly
   self-score and peers persist via the member_state KV endpoint (offline-first,
   fire-and-forget sync). Membership tiering gates NGG-only community features.
   ============================================================================ */

const { useState, useEffect, useRef, useCallback } = React;

/* ---- Static content (from the Anchor design) ---------------------------- */
let QUOTES = [
  "The purpose of life is not to be happy — it is to be useful, honorable and compassionate.",
  "To live is the rarest thing in the world. Most people exist, that is all.",
  "Our most authentic capacity is to overcome, endure, transform and love.",
  "No matter how strong you are, if your steps are not arranged you will stumble before your destiny.",
  "The plans of the diligent lead surely to abundance.",
  "Lack of order destroys strength.",
  "Live out of your imagination, not your history.",
  "I can be changed by what happens to me, but I refuse to be reduced by it.",
  "The value of life is measured by how much of it was given away.",
  "I have more understanding than all my teachers, for Your testimonies are my meditation.",
  "Stand firm and disciplined in ranks, as a solid structure.",
  "Persevere, endure and remain stationed — that you may succeed.",
];
let WEEK_TITLES = [
  "Identity · Awareness & Reset", "Study Time System", "Personal Hygiene", "Device Control",
  "Note-Taking", "Respect System", "Time Consciousness", "Self-Control",
  "Integrity", "Responsibility", "Independent Integrity", "Review & Leadership",
];
let SYSTEMS = [
  { key: "woke", label: "Woke up on time", icon: "ph-sun-horizon" },
  { key: "study", label: "Studied at my fixed time", icon: "ph-book-open-text" },
  { key: "clean", label: "Kept myself clean", icon: "ph-drop" },
  { key: "phone", label: "Controlled my phone", icon: "ph-device-mobile" },
  { key: "respect", label: "Respected authority", icon: "ph-handshake" },
  { key: "time", label: "Was time-conscious", icon: "ph-clock" },
];
const MOODS = [
  { key: "great", label: "Great", icon: "ph-smiley" },
  { key: "good", label: "Good", icon: "ph-smiley-wink" },
  { key: "okay", label: "Okay", icon: "ph-smiley-blank" },
  { key: "low", label: "Low", icon: "ph-smiley-meh" },
  { key: "rough", label: "Rough", icon: "ph-smiley-sad" },
];
const MOOD_ICON = { great: "ph-smiley", good: "ph-smiley-wink", okay: "ph-smiley-blank", low: "ph-smiley-meh", rough: "ph-smiley-sad" };
const SCORE_DIMS = [
  { key: "journal", label: "Journal Consistency" },
  { key: "home", label: "Home Discipline" },
  { key: "school", label: "School Conduct" },
  { key: "habit", label: "Habit Practice" },
  { key: "peer", label: "Peer Influence" },
];
const RANKS = [
  { name: "Seedling", xp: 0, icon: "ph-plant", L: 1 },
  { name: "Sprout", xp: 250, icon: "ph-leaf", L: 2 },
  { name: "Sapling", xp: 750, icon: "ph-tree", L: 3 },
  { name: "Rooted", xp: 1500, icon: "ph-tree-evergreen", L: 4 },
  { name: "Vanguard", xp: 3000, icon: "ph-crown-simple", L: 5 },
];
// Per-week build sheet (the physical Anchor journal's weekly structure).
let WEEK_DATA = [
  { system: "Self-awareness & reset", focus: "Name who you are becoming.", home: "Make your bed; greet your family each morning.", school: "Arrive settled, not rushed.", peer: "Notice who you follow — and why.", journal: "Who am I when no one is watching?", stop: "Comparing yourself to others", start: "A morning reset ritual", automate: "Making your bed on waking" },
  { system: "A fixed study time", focus: "Same time, same place, every day.", home: "Study before screens.", school: "Review each day's notes within 24 hours.", peer: "Invite a friend to study with you.", journal: "When do I focus best — and why?", stop: "Studying at random times", start: "A fixed daily study slot", automate: "Reviewing notes before screens" },
  { system: "Daily hygiene", focus: "Clean body, clear mind.", home: "Bath, brush, tidy your space.", school: "Neat uniform and materials.", peer: "Model care, not vanity.", journal: "What does self-respect look like today?", stop: "Skipping your routine when tired", start: "A morning & night wash routine", automate: "Laying out clothes the night before" },
  { system: "Device boundaries", focus: "Own the phone — don't be owned.", home: "Phone in a drawer while studying.", school: "No phone in class.", peer: "Lead a screen-free hangout.", journal: "What did my phone cost me today?", stop: "Excess phone use", start: "Phone-free study blocks", automate: "Charging your phone outside your room" },
  { system: "A note-taking system", focus: "Capture — don't just consume.", home: "Summarize your day in three lines.", school: "One-page notes per subject.", peer: "Share a useful note with a friend.", journal: "What idea deserved a note today?", stop: "Passive consuming", start: "One-page notes per subject", automate: "A 5-minute note review" },
  { system: "Respect for authority", focus: "Honor those who lead you.", home: "Speak kindly to your family.", school: "Respect teachers, even when it's hard.", peer: "Defend someone being mocked.", journal: "Where was my respect tested today?", stop: "Talking back in the moment", start: "Greeting elders first", automate: "Pausing before you reply" },
  { system: "Time consciousness", focus: "On time is early.", home: "Sleep and wake on schedule.", school: "Beat the bell.", peer: "Keep a promise on time.", journal: "Where did I waste time today?", stop: "Running late", start: "Arriving five minutes early", automate: "A fixed sleep & wake time" },
  { system: "Self-control", focus: "Master the impulse.", home: "Pause before reacting at home.", school: "No cheating, no shortcuts.", peer: "Walk away from trouble.", journal: "What did I resist today?", stop: "Reacting on impulse", start: "A ten-second pause", automate: "Walking away from trouble" },
  { system: "Integrity", focus: "Do right when unseen.", home: "Return what isn't yours.", school: "Honest marks only.", peer: "Tell a hard truth, kindly.", journal: "Where was I fully honest today?", stop: "Small dishonesties", start: "Telling the hard truth kindly", automate: "Returning what isn't yours" },
  { system: "Responsibility", focus: "Own the outcome.", home: "Take a chore without being asked.", school: "Own a mistake at school.", peer: "Carry a friend's load.", journal: "What did I take responsibility for?", stop: "Blaming others", start: "Owning your outcomes", automate: "One chore without being asked" },
  { system: "Independent integrity", focus: "Discipline without supervision.", home: "Do right with no one home.", school: "Study without being told.", peer: "Set the standard for your peers.", journal: "Who am I without an audience?", stop: "Needing to be watched", start: "Doing right when alone", automate: "Studying without being told" },
  { system: "Review & leadership", focus: "Lead by example.", home: "Serve your household.", school: "Help a struggling classmate.", peer: "Bring two friends to NGG.", journal: "Who have I become in twelve weeks?", stop: "Keeping growth to yourself", start: "Serving your household", automate: "Helping one peer each week" },
];
// Habit focus (STOP/START/AUTOMATE) for a given 1-based week, with a safe
// fallback so the screen is never blank if a week omits them.
function habitFocus(week) {
  const d = WEEK_DATA[(week || 1) - 1] || WEEK_DATA[0] || {};
  return {
    stop: d.stop || "One thing to give up",
    start: d.start || "One habit to begin",
    automate: d.automate || "One habit to make automatic",
  };
}
// Parse a saved reflection body back into its authored sections. The Reflect
// editor joins these with newlines in a fixed order; this is the inverse so
// the full reflection (not just its first line) can be shown.
const ENTRY_PARTS = [
  ["School: ", "school", "School", "ph-chalkboard-teacher"],
  ["Home: ", "home", "Home", "ph-house"],
  ["Peer: ", "peer", "Peers", "ph-users-three"],
  ["Did well by ", "did", "Did well by", "ph-check-circle"],
  ["Difficult because ", "hard", "Difficult because", "ph-cloud-rain"],
  ["Tomorrow I improve by ", "tomorrow", "Tomorrow I improve by", "ph-arrow-up-right"],
];
function parseEntry(body) {
  const out = { musing: "", school: "", home: "", peer: "", did: "", hard: "", tomorrow: "" };
  const musings = [];
  (body || "").split("\n").forEach(ln => {
    for (const [pre, key] of ENTRY_PARTS) { if (ln.indexOf(pre) === 0) { out[key] = ln.slice(pre.length).trim(); return; } }
    if (ln.trim()) musings.push(ln.trim());
  });
  out.musing = musings.join("\n");
  return out;
}

// Pull the member's own execution logs (School/Home/Peer lines) for a given
// week from their real journal entries — used by the Weekly Review.
function weekLogs(entries, week) {
  const mon = mondayOf(Date.now()); const end = new Date(mon); end.setUTCDate(end.getUTCDate() + 7);
  const inWeek = (entries || []).filter(e => { const t = new Date(e.createdAt); return t >= mon && t < end; });
  const pick = (prefix) => {
    for (const e of inWeek) {
      const line = (e.body || "").split("\n").find(l => l.toLowerCase().indexOf(prefix + ":") === 0);
      if (line) return line.slice(prefix.length + 1).trim();
    }
    return "";
  };
  return { school: pick("school"), home: pick("home"), peer: pick("peer"), count: inWeek.length };
}

// Admin-managed content overrides the built-in defaults above (fetched from
// /api/public/anchor-content.php). Falls back to the defaults if unset/offline.
let TILT_ON = true;
function applyContent(c) {
  if (!c) return;
  if (Array.isArray(c.quotes) && c.quotes.length) QUOTES = c.quotes;
  if (Array.isArray(c.systems) && c.systems.length) SYSTEMS = c.systems;
  if (Array.isArray(c.weeks) && c.weeks.length) { WEEK_TITLES = c.weeks.map(w => w.title); WEEK_DATA = c.weeks; }
  TILT_ON = c.tilt !== false;
}

/* ---- 3D Tilt (ported from the marketing site's motion.jsx) --------------- */
function Tilt({ children, strength = 9, glare = true, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!TILT_ON) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(hover: none)").matches) return;
    const el = ref.current; if (!el) return;
    let rect = null, raf = 0;
    const onMove = (e) => {
      if (!rect) rect = el.getBoundingClientRect();
      const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      if (!raf) raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${(-y * strength).toFixed(2)}deg) rotateY(${(x * strength).toFixed(2)}deg)`;
        if (glare) { el.style.setProperty("--tilt-gx", ((x + 1) * 50).toFixed(1) + "%"); el.style.setProperty("--tilt-gy", ((y + 1) * 50).toFixed(1) + "%"); el.style.setProperty("--tilt-glare", "0.16"); }
        raf = 0;
      });
    };
    const onEnter = () => { rect = el.getBoundingClientRect(); };
    const onLeave = () => { rect = null; el.style.transform = ""; if (glare) el.style.setProperty("--tilt-glare", "0"); };
    el.addEventListener("mouseenter", onEnter); el.addEventListener("mousemove", onMove); el.addEventListener("mouseleave", onLeave);
    return () => { el.removeEventListener("mouseenter", onEnter); el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); if (raf) cancelAnimationFrame(raf); };
  }, [strength, glare]);
  return <div ref={ref} className={"aj-tilt" + (glare ? " glare" : "") + (className ? " " + className : "")}>{children}</div>;
}

/* ---- Local persistence -------------------------------------------------- */
const CK = "ngg_aj_c_v3", QK = "ngg_aj_q_v3";
const store = {
  cache() { try { return JSON.parse(localStorage.getItem(CK)) || {}; } catch { return {}; } },
  patch(p) { try { localStorage.setItem(CK, JSON.stringify(Object.assign({}, store.cache(), p))); } catch {} },
  queue() { try { return JSON.parse(localStorage.getItem(QK)) || []; } catch { return []; } },
  setQueue(q) { try { localStorage.setItem(QK, JSON.stringify(q)); } catch {} },
};

/* ---- Toasts ------------------------------------------------------------- */
let _push = () => {};
const toast = { ok: m => _push(m, "ok"), err: m => _push(m, "err"), info: m => _push(m, "") };
function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => { _push = (msg, k) => { const id = Math.random().toString(36).slice(2); setItems(x => [...x, { id, msg, k }]); setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 3000); }; return () => { _push = () => {}; }; }, []);
  return <div className="aj-toasts" role="status" aria-live="polite">{items.map(i => <div key={i.id} className={"aj-toast " + i.k}>{i.msg}</div>)}</div>;
}

/* ---- Helpers ------------------------------------------------------------ */
const isOffline = e => e && /network|fetch|Failed to fetch|offline/i.test(e.message || e.code || "");
const dayKey = d => new Date(d).toISOString().slice(0, 10);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
function mondayOf(d) { const x = new Date(d); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x; }
function speak(t) { try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 0.92; window.speechSynthesis.speak(u); } catch {} }
function computeStreak(dates) { let n = 0; const d = new Date(); if (!dates.has(dayKey(d))) { d.setDate(d.getDate() - 1); if (!dates.has(dayKey(d))) return 0; } while (dates.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); } return n; }
function rankFor(xp) { let cur = RANKS[0], next = null; for (let i = 0; i < RANKS.length; i++) { if (xp >= RANKS[i].xp) { cur = RANKS[i]; next = RANKS[i + 1] || null; } } return { cur, next }; }

/* ========================================================================== */
function App() {
  const [booting, setBooting] = useState(true);
  const [member, setMember] = useState(null);
  const [view, setView] = useState("home");
  const prev = useRef("home");
  const [online, setOnline] = useState(navigator.onLine);

  const c0 = store.cache();
  const [entries, setEntries] = useState(c0.entries || null);
  const [weeks, setWeeks] = useState(c0.weeks || null);
  const [session, setSession] = useState(c0.session || null);
  const [mentor, setMentor] = useState(c0.mentor || null);
  const [pstate, setPstate] = useState(c0.pstate || {});   // member_state map
  const [pending, setPending] = useState(store.queue());
  const [celebrate, setCelebrate] = useState(null);
  const [onboard, setOnboard] = useState(false);
  const [selWeek, setSelWeek] = useState(1);
  const [selEntry, setSelEntry] = useState(null);
  const [cver, setCver] = useState(0);

  // Admin-managed Anchor content (weeks/quotes/systems/tilt). Cached locally.
  useEffect(() => {
    const cached = store.cache().content; if (cached) { applyContent(cached); setCver(v => v + 1); }
    NGGApi.public.anchorContent().then(r => { if (r && r.content) { applyContent(r.content); store.patch({ content: r.content }); setCver(v => v + 1); } }).catch(() => {});
  }, []);

  const go = (v) => { prev.current = view; setView(v); };
  const back = () => setView(prev.current || "home");

  useEffect(() => {
    let alive = true;
    NGGApi.auth.me().then(r => {
      if (!alive) return;
      setMember(r.member || null);
      if (r.member && localStorage.getItem("ngg_aj_onb") !== "1") setOnboard(true);
    }).catch(() => {}).finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [dash, jrnl, anc, st] = await Promise.all([
        NGGApi.member.dashboard().catch(() => null),
        NGGApi.member.journal().catch(() => null),
        NGGApi.member.anchor().catch(() => null),
        NGGApi.member.stateGet(["peers", "prefs", "systems:" + dayKey(Date.now()), "selfscore:" + dayKey(mondayOf(Date.now()))]).catch(() => null),
      ]);
      if (dash) { setSession(dash.session || null); setMentor(dash.mentor || null); store.patch({ session: dash.session, mentor: dash.mentor }); }
      if (jrnl) { setEntries(jrnl.entries || []); store.patch({ entries: jrnl.entries || [] }); }
      if (anc) { setWeeks(anc.weeks || []); store.patch({ weeks: anc.weeks || [] }); }
      if (st && st.state) { setPstate(s => { const merged = Object.assign({}, s, st.state); store.patch({ pstate: merged }); return merged; }); }
    } catch {}
  }, []);
  useEffect(() => { if (member) refresh(); }, [member, refresh]);

  // Daily reflection reminder (opt-in pref + granted permission). Fires at most
  // once per day when today's reflection is still missing.
  useEffect(() => {
    if (!member) return;
    if (((pstate && pstate.prefs) || {}).reminder === false) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const today = dayKey(Date.now());
    if ((entries || []).some(e => dayKey(e.createdAt) === today)) return;
    if (localStorage.getItem("ngg_aj_reminded") === today) return;
    try { new Notification("Anchor Journal", { body: "One reflection keeps your streak alive." }); localStorage.setItem("ngg_aj_reminded", today); } catch {}
  }, [member, entries, pstate]);

  const syncPending = useCallback(async () => {
    const q = store.queue(); if (!q.length || !navigator.onLine) return;
    for (const it of q) { try { await NGGApi.member.journalCreate({ mood: it.mood, body: it.body, private: true }); store.setQueue(store.queue().filter(x => x.tempId !== it.tempId)); } catch (e) { if (isOffline(e)) break; else store.setQueue(store.queue().filter(x => x.tempId !== it.tempId)); } }
    setPending(store.queue()); await refresh();
  }, [refresh]);
  useEffect(() => {
    const on = () => { setOnline(true); syncPending(); };
    const off = () => setOnline(false);
    const vis = () => { if (!document.hidden && navigator.onLine) { syncPending(); refresh(); } };
    window.addEventListener("online", on); window.addEventListener("offline", off); document.addEventListener("visibilitychange", vis);
    const id = setInterval(() => { if (navigator.onLine) syncPending(); }, 20000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); document.removeEventListener("visibilitychange", vis); clearInterval(id); };
  }, [syncPending, refresh]);

  /* persist a member_state key (optimistic + fire-and-forget) */
  const setState = useCallback((key, value) => {
    setPstate(s => { const merged = Object.assign({}, s, { [key]: value }); store.patch({ pstate: merged }); return merged; });
    NGGApi.member.stateSet(key, value).catch(() => {});
  }, []);

  /* save a reflection (Anchor it) */
  const anchorReflection = useCallback(async ({ mood, musing, s1, s2, s3, school, home, peer }) => {
    const parts = [];
    if (musing) parts.push(musing.trim());
    if (school) parts.push("School: " + school.trim());
    if (home) parts.push("Home: " + home.trim());
    if (peer) parts.push("Peer: " + peer.trim());
    if (s1) parts.push("Did well by " + s1.trim());
    if (s2) parts.push("Difficult because " + s2.trim());
    if (s3) parts.push("Tomorrow I improve by " + s3.trim());
    const body = parts.join("\n");
    const already = (entries || []).some(e => dayKey(e.createdAt) === dayKey(Date.now()));
    const tempId = "t-" + Date.now();
    const optimistic = { entryId: tempId, mood: mood || "good", body, week: (session && session.weekOf) || 1, createdAt: new Date().toISOString(), _pending: true };
    setEntries(e => [optimistic, ...(e || [])]);
    const q = store.queue(); q.push({ tempId, mood: mood || "good", body }); store.setQueue(q); setPending(q);
    setCelebrate({ already });
    setView("home");
    try { await NGGApi.member.journalCreate({ mood: mood || "good", body, private: true }); store.setQueue(store.queue().filter(x => x.tempId !== tempId)); setPending(store.queue()); await refresh(); }
    catch (e) { if (!isOffline(e)) toast.err("Couldn't save — kept on this device."); }
    setTimeout(() => setCelebrate(null), 2800);
  }, [entries, session, refresh]);

  if (booting) return <Boot/>;
  if (!member) return <SignInGate onIn={m => { setMember(m); if (localStorage.getItem("ngg_aj_onb") !== "1") setOnboard(true); }}/>;

  // Derived progression
  const dates = new Set((entries || []).map(e => dayKey(e.createdAt)));
  const reflections = (entries || []).length;
  const xp = Math.min(RANKS[RANKS.length - 1].xp, reflections * 60);
  const diamonds = reflections * 5;
  const streak = computeStreak(dates);
  const { cur, next } = rankFor(xp);
  const bandBase = cur.xp, bandNext = next ? next.xp : cur.xp;
  const xpInBand = xp - bandBase, xpBand = Math.max(1, bandNext - bandBase);
  const xpPct = next ? Math.min(100, Math.round(xpInBand / xpBand * 100)) : 100;
  const reflectedToday = dates.has(dayKey(Date.now()));
  const currentWeek = (session && session.weekOf) || 1;
  const isNGG = String(member.type || "").toUpperCase() === "NGG";

  const openWeek = (n) => { setSelWeek(n); go("weekdetail"); };
  const openEntry = (e) => { setSelEntry(e); go("entry"); };
  const ctx = { member, entries, weeks, session, mentor, pstate, setState, go, back, xp, diamonds, streak, cur, next, xpPct, reflectedToday, currentWeek, isNGG, anchorReflection, online, selWeek, openWeek, selEntry, openEntry };

  return (
    <div className="aj-app">
      <div className="aj-bg" aria-hidden="true"/><div className="aj-blob b1" aria-hidden="true"/><div className="aj-blob b2" aria-hidden="true"/><div className="aj-blob b3" aria-hidden="true"/><div className="aj-veil" aria-hidden="true"/>
      {view === "home" && <Journey ctx={ctx}/>}
      {view === "reflect" && <Reflect ctx={ctx}/>}
      {view === "systems" && <Systems ctx={ctx}/>}
      {view === "timeline" && <Timeline ctx={ctx}/>}
      {view === "entry" && <EntryDetail ctx={ctx}/>}
      {view === "calendar" && <Calendar ctx={ctx}/>}
      {view === "charge" && <Charge ctx={ctx}/>}
      {view === "weekdetail" && <WeekDetail ctx={ctx}/>}
      {view === "growth" && <Growth ctx={ctx}/>}
      {view === "library" && <Library ctx={ctx}/>}
      {view === "peers" && <Peers ctx={ctx}/>}
      {view === "review" && <Review ctx={ctx}/>}
      {view === "you" && <You ctx={ctx}/>}
      {view !== "reflect" && <BottomNav view={view} go={go}/>}
      {celebrate && <Celebrate/>}
      {onboard && <Onboarding name={member.fullName} onDone={() => { localStorage.setItem("ngg_aj_onb", "1"); setOnboard(false); }}/>}
      <InstallPrompt/>
      <Toasts/>
    </div>
  );
}

/* ---- Journey (path) ----------------------------------------------------- */
function Journey({ ctx }) {
  const { member, weeks, currentWeek, streak, diamonds, xp, cur, next, xpPct, reflectedToday, go } = ctx;
  const first = String(member.fullName || "there").split(" ")[0];
  const wk = (weeks || []).find(w => w.week === currentWeek) || (weeks || [])[0];
  const firstMission = wk && wk.missions && wk.missions[0];
  const done = firstMission && (firstMission.status === "verified" || firstMission.status === "submitted");

  return (
    <div className="aj-view">
      <div className="aj-top">
        <div className="aj-top-metrics">
          <span className="aj-metric flame"><i className="ph-fill ph-fire"/>{streak}</span>
          <span className="aj-metric dia"><i className="ph-fill ph-diamond"/>{diamonds}</span>
        </div>
        <div className="aj-top-actions">
          <button className="icon-btn" aria-label="Calendar" onClick={() => go("calendar")}><i className="ph-bold ph-calendar-dots"/></button>
          <button className="aj-star" aria-label="You" onClick={() => go("you")}><i className="ph-fill ph-star"/></button>
        </div>
      </div>

      <div className="aj-hero">
        <div className="aj-hero-rank">· {cur.name.toUpperCase()} · LEVEL {cur.L}</div>
        <h1 className="aj-hero-h">{greeting()},<br/>{first}.</h1>
        <p className="aj-hero-sub">{reflectedToday ? "You showed up today. Keep the chain alive." : "One reflection keeps your streak alive."}</p>
      </div>
      <div className="aj-xp">
        <div className="aj-xp-track"><div className="aj-xp-fill" style={{ width: xpPct + "%" }}/></div>
        <div className="aj-xp-meta"><span>{xp} XP</span><span>{next ? "LEVEL " + next.L : "MAX"}</span></div>
      </div>
      <div className="aj-wkchip"><span><b>WK {String(currentWeek).padStart(2, "0")}</b><em>{(WEEK_TITLES[currentWeek - 1] || "").split(" · ")[0].toUpperCase()}</em></span></div>

      <div className="aj-path">
        <svg viewBox="0 0 402 700" preserveAspectRatio="none" aria-hidden="true"><polyline points="201,60 118,196 284,332 148,468 262,604" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="4" strokeDasharray="1 15" strokeLinecap="round"/></svg>

        <button className="aj-pnode" style={{ left: "50%", top: 14 }} onClick={() => go("reflect")}>
          {!reflectedToday && <span className="aj-start">START</span>}
          <span className={"aj-pcirc reflect"} aria-hidden="true"><i className={"ph-fill " + (reflectedToday ? "ph-check" : "ph-feather")}/></span>
          <div className="aj-plabel">Today's reflection</div>
        </button>

        <button className="aj-pnode" style={{ left: "29%", top: 150 }} onClick={() => go("reflect")}>
          <span className={"aj-pcirc " + (done ? "done" : "lime")} aria-hidden="true"><i className={"ph-fill " + (done ? "ph-check" : "ph-target")}/></span>
          <div className="aj-plabel">{firstMission ? firstMission.title : "Name yourself"}</div>
        </button>

        <button className="aj-pnode" style={{ left: "71%", top: 286 }} onClick={() => go("systems")}>
          <span className="aj-pcirc glass" aria-hidden="true"><i className="ph-fill ph-check-square-offset"/></span>
          <div className="aj-plabel">Daily systems</div>
        </button>

        <button className="aj-pnode" style={{ left: "37%", top: 422 }} onClick={() => go("reflect")}>
          <span className="aj-pcirc glass" aria-hidden="true"><i className="ph-fill ph-sun"/></span>
          <div className="aj-plabel">Morning quote</div>
        </button>
        <button className="aj-pnode" style={{ left: "65%", top: 558 }} onClick={() => go("reflect")}>
          <span className="aj-pcirc glass" aria-hidden="true"><i className="ph-fill ph-moon-stars"/></span>
          <div className="aj-plabel">Night reflection</div>
        </button>
      </div>
    </div>
  );
}

/* ---- Reflect editor ----------------------------------------------------- */
function Reflect({ ctx }) {
  const { currentWeek, back, anchorReflection, pstate, setState } = ctx;
  const [musing, setMusing] = useState("");
  const [s1, setS1] = useState(""); const [s2, setS2] = useState(""); const [s3, setS3] = useState("");
  const [school, setSchool] = useState(""); const [home, setHome] = useState(""); const [peer, setPeer] = useState("");
  const [mood, setMood] = useState("good");
  const [busy, setBusy] = useState(false);
  const quote = QUOTES[(Math.floor(Date.now() / 864e5)) % QUOTES.length];
  const theme = (WEEK_TITLES[currentWeek - 1] || "Identity").split(" · ")[0];
  const weekPrompt = (WEEK_DATA[currentWeek - 1] || {}).journal || "";
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

  const sysKey = "systems:" + dayKey(Date.now());
  const sys = pstate[sysKey] || {};
  const [sysLocal, setSysLocal] = useState(sys);
  useEffect(() => { setSysLocal(pstate[sysKey] || {}); }, [pstate[sysKey]]);
  const toggleSys = (k) => { const next = Object.assign({}, sysLocal, { [k]: !sysLocal[k] }); setSysLocal(next); setState(sysKey, next); };
  const doneCount = SYSTEMS.filter(s => sysLocal[s.key]).length;

  const sec = (n, label, children) => (
    <div className="pad" style={{ marginTop: 24 }}><div className="eyebrow" style={{ marginBottom: 12 }}>SECTION {n} · {label}</div>{children}</div>
  );

  const submit = async () => {
    if (!musing.trim() && !s1.trim() && !s2.trim() && !s3.trim() && !school.trim() && !home.trim() && !peer.trim()) { toast.err("Write at least one line."); return; }
    setBusy(true);
    try { await anchorReflection({ mood, musing, s1, s2, s3, school, home, peer }); } finally { setBusy(false); }
  };

  return (
    <div className="aj-view noNav">
      <div className="aj-head" style={{ justifyContent: "space-between" }}>
        <button className="icon-btn" aria-label="Back" onClick={back}><i className="ph-bold ph-arrow-left"/></button>
        <div className="aj-head-center">WK {String(currentWeek).padStart(2, "0")} · {theme.toUpperCase()}</div>
        <div style={{ width: 42 }}/>
      </div>
      <div className="pad" style={{ marginTop: 16 }}>
        <div className="eyebrow">{dateStr}</div>
        <h2 className="disp" style={{ fontSize: 27, margin: "8px 0 0" }}>Today's reflection</h2>
      </div>

      <div className="pad" style={{ marginTop: 20 }}><Tilt strength={7}><div className="card-grad aj-quote">
        <div className="aj-quote-top">
          <span className="aj-quote-lbl">MORNING QUOTE</span>
          {(pstate.prefs || {}).readAloud !== false && <button className="aj-read" onClick={() => speak(quote)}><i className="ph-fill ph-speaker-high"/>Read aloud</button>}
        </div>
        <p className="aj-quote-q">“{quote}”</p>
      </div></Tilt></div>

      {sec("1", "TODAY'S MUSING", <>
        {weekPrompt && <div className="aj-prompt-hint"><i className="ph-fill ph-notebook"/><span>This week's prompt · <b>{weekPrompt}</b></span></div>}
        <textarea className="aj-musing" placeholder="What's on your mind this morning?" value={musing} maxLength={2000} onChange={e => setMusing(e.target.value)}/>
      </>)}

      {sec("2", "DAILY SYSTEM CHECK · " + doneCount + "/6", (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SYSTEMS.map(s => <button key={s.key} className={"aj-syschip" + (sysLocal[s.key] ? " on" : "")} onClick={() => toggleSys(s.key)}><i className={"ph-fill " + (sysLocal[s.key] ? "ph-check-circle" : s.icon)}/>{s.label}</button>)}
        </div>
      ))}

      {sec("3", "SCHOOL EXECUTION LOG", <input className="aj-logline" placeholder="One line: how did school go?" value={school} maxLength={200} onChange={e => setSchool(e.target.value)}/>)}
      {sec("4", "HOME EXECUTION LOG", <input className="aj-logline" placeholder="One line: how did home go?" value={home} maxLength={200} onChange={e => setHome(e.target.value)}/>)}
      {sec("5", "PEER MODELING LOG", <input className="aj-logline" placeholder="One line: who did you influence?" value={peer} maxLength={200} onChange={e => setPeer(e.target.value)}/>)}

      <div className="pad" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><i className="ph-fill ph-moon-stars" style={{ fontSize: 17, color: "var(--violet-l)" }}/><span className="eyebrow" style={{ letterSpacing: ".14em" }}>SECTION 6 · NIGHT REFLECTION · 3 SENTENCES</span></div>
        {[["Today I did well by…", s1, setS1], ["Today was difficult because…", s2, setS2], ["Tomorrow I will improve by…", s3, setS3]].map(([lbl, val, set], i) => (
          <div className="aj-sent" key={i}>
            <div className="aj-sent-n">{i + 1}</div>
            <div style={{ flex: 1 }}><div className="aj-sent-lbl">{lbl}</div><input className="aj-sent-in" placeholder="write one line" value={val} maxLength={200} onChange={e => set(e.target.value)}/></div>
          </div>
        ))}
      </div>

      <div className="pad" style={{ marginTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>HOW DID TODAY FEEL?</div>
        <div className="aj-moods">
          {MOODS.map(m => <button key={m.key} className={"aj-mood" + (mood === m.key ? " on" : "")} onClick={() => setMood(m.key)} aria-label={m.label}><span className="aj-mood-c"><i className={"ph-fill " + m.icon}/></span><span>{m.label}</span></button>)}
        </div>
      </div>

      <div className="pad" style={{ marginTop: 28 }}>
        <button className="btn-a" disabled={busy} onClick={submit}>Anchor it <i className="ph-fill ph-anchor"/></button>
        <p className="center muted" style={{ fontSize: 12, margin: "14px 0 0" }}>Earn +60 XP · keep your streak alive</p>
      </div>
    </div>
  );
}

/* ---- Daily systems ------------------------------------------------------ */
function Systems({ ctx }) {
  const { pstate, setState, go } = ctx;
  const key = "systems:" + dayKey(Date.now());
  const data = pstate[key] || {};
  const [local, setLocal] = useState(data);
  useEffect(() => { setLocal(pstate[key] || {}); }, [pstate[key]]);
  const total = SYSTEMS.length || 6;
  const doneCount = SYSTEMS.filter(s => local[s.key]).length;
  const toggle = (k) => { const next = Object.assign({}, local, { [k]: !local[k] }); setLocal(next); setState(key, next); };
  const setMood = (m) => { const next = Object.assign({}, local, { mood: m }); setLocal(next); setState(key, next); };
  // Real weekly history — systems held each day this week, from persisted state.
  const mon = mondayOf(Date.now());
  const todayK = dayKey(Date.now());
  const week = ["M", "T", "W", "T", "F", "S", "S"].map((lbl, i) => {
    const dd = new Date(mon); dd.setUTCDate(dd.getUTCDate() + i);
    const k = dayKey(dd);
    const v = k === todayK ? local : (pstate["systems:" + k] || {});
    return { lbl, cnt: SYSTEMS.filter(s => v[s.key]).length, today: k === todayK, future: k > todayK };
  });
  const weekHeld = week.reduce((a, w) => a + w.cnt, 0);

  return (
    <div className="aj-view">
      <div className="aj-head">
        <button className="icon-btn" aria-label="Back" onClick={() => go("home")}><i className="ph-bold ph-arrow-left"/></button>
        <div><h2>Daily systems</h2><div className="sub">Was order maintained today?</div></div>
      </div>
      <div className="aj-sys-top">
        <div><div className="aj-sys-cnt">{doneCount}/{total}</div><div className="muted" style={{ fontSize: 12 }}>systems held today</div></div>
        <div className="aj-sys-week" role="img" aria-label={weekHeld + " systems held this week"}>
          {week.map((w, i) => (
            <div className={"aj-sys-wk-col" + (w.today ? " today" : "") + (w.future ? " future" : "")} key={i}>
              <div className="aj-sys-wk-bar"><div className="aj-sys-wk-fill" style={{ height: (w.cnt / total * 100) + "%" }}/></div>
              <span className="aj-sys-wk-lbl">{w.lbl}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="pad" style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
        {SYSTEMS.map(s => (
          <button key={s.key} className="aj-sys-row" onClick={() => toggle(s.key)} aria-pressed={!!local[s.key]}>
            <span className="aj-sys-ic"><i className={"ph-fill " + s.icon}/></span>
            <span className="aj-sys-lbl">{s.label}</span>
            <span className={"aj-sys-check" + (local[s.key] ? " on" : "")}>{local[s.key] ? <i className="ph-bold ph-check"/> : null}</span>
          </button>
        ))}
      </div>
      <div className="pad" style={{ marginTop: 26 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>HOW DID TODAY FEEL?</div>
        <div className="aj-moods">{MOODS.map(m => <button key={m.key} className={"aj-mood" + (local.mood === m.key ? " on" : "")} onClick={() => setMood(m.key)} aria-label={m.label}><span className="aj-mood-c"><i className={"ph-fill " + m.icon}/></span><span>{m.label}</span></button>)}</div>
      </div>
    </div>
  );
}

/* ---- Timeline / journal ------------------------------------------------- */
function Timeline({ ctx }) {
  const { entries, currentWeek, go, openEntry } = ctx;
  const list = entries || [];
  return (
    <div className="aj-view">
      <div className="aj-head">
        <button className="icon-btn" aria-label="Back" onClick={() => go("home")}><i className="ph-bold ph-arrow-left"/></button>
        <h2>Your journal</h2>
      </div>
      <div className="pad" style={{ marginTop: 20 }}>
        <div className="eyebrow" style={{ color: "var(--gold)", marginBottom: 14 }}>WEEK {String(currentWeek).padStart(2, "0")} · {(WEEK_TITLES[currentWeek - 1] || "").split(" · ")[0].toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {list.map(e => {
            const d = new Date(e.createdAt);
            return (
              <button className={"aj-entry" + (e._pending ? " fresh" : "")} key={e.entryId} onClick={() => openEntry(e)} style={{ textAlign: "left", width: "100%", cursor: "pointer" }}>
                <div className="aj-entry-top">
                  <div className="aj-entry-l">
                    <div className="aj-entry-ic"><i className={"ph-fill " + (MOOD_ICON[e.mood] || "ph-feather")}/></div>
                    <div><div className="aj-entry-day">{d.toLocaleDateString(undefined, { weekday: "long" })}</div><div className="aj-entry-date mono">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}</div></div>
                  </div>
                  {e._pending ? <span className="aj-entry-sys"><i className="ph-fill ph-cloud-arrow-up"/>SYNC</span> : <i className="ph-bold ph-arrow-right" style={{ color: "var(--tx-30)", fontSize: 15 }}/>}
                </div>
                <p className="aj-entry-body">{(e.body || "").split("\n")[0]}</p>
              </button>
            );
          })}
          <div className="aj-entry-add" onClick={() => go("reflect")}><i className="ph-fill ph-plus-circle"/><span>Today's entry is waiting…</span></div>
        </div>
      </div>
    </div>
  );
}

/* ---- Entry detail (the full reflection, not just its first line) -------- */
function EntryDetail({ ctx }) {
  const { selEntry, back, go } = ctx;
  const e = selEntry;
  if (!e) return (
    <div className="aj-view"><div className="aj-head"><button className="icon-btn" aria-label="Back" onClick={() => go("timeline")}><i className="ph-bold ph-arrow-left"/></button><h2>Reflection</h2></div><div className="pad" style={{ marginTop: 20 }}><div className="aj-empty muted">That reflection isn't loaded. Open it from your journal.</div></div></div>
  );
  const d = new Date(e.createdAt);
  const p = parseEntry(e.body);
  const mood = MOODS.find(m => m.key === e.mood);
  const night = [
    ["Did well by", p.did, "ph-check-circle", "var(--a)"],
    ["Difficult because", p.hard, "ph-cloud-rain", "var(--violet-l)"],
    ["Tomorrow I improve by", p.tomorrow, "ph-arrow-up-right", "var(--gold)"],
  ].filter(r => r[1]);
  const logs = [
    ["School", p.school, "ph-chalkboard-teacher", "var(--violet-l)"],
    ["Home", p.home, "ph-house", "var(--a)"],
    ["Peers", p.peer, "ph-users-three", "var(--magenta-l)"],
  ].filter(r => r[1]);
  return (
    <div className="aj-view">
      <div className="aj-head">
        <button className="icon-btn" aria-label="Back" onClick={back}><i className="ph-bold ph-arrow-left"/></button>
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: ".16em", color: "var(--gold)", fontWeight: 700 }}>WK {String(e.week || 1).padStart(2, "0")}{e._pending ? " · SAVING" : ""}</div>
          <h2 style={{ fontSize: 22 }}>{d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
        </div>
      </div>
      {mood && (
        <div className="pad" style={{ marginTop: 16 }}>
          <div className="aj-entry-mood"><span className="aj-mood-c"><i className={"ph-fill " + mood.icon}/></span><span>Felt {mood.label.toLowerCase()}</span></div>
        </div>
      )}
      {p.musing && (
        <div className="pad" style={{ marginTop: 16 }}><Tilt strength={6}><div className="card-grad">
          <div className="eyebrow" style={{ marginBottom: 8 }}>TODAY'S MUSING</div>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--tx-80)", margin: 0, whiteSpace: "pre-wrap" }}>{p.musing}</p>
        </div></Tilt></div>
      )}
      {logs.length > 0 && (
        <div className="pad" style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>EXECUTION LOGS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {logs.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "14px 16px", borderRadius: 16, background: "var(--card)", border: "1px solid var(--line)" }}>
                <i className={"ph-fill " + r[2]} style={{ fontSize: 20, color: r[3], marginTop: 1 }}/>
                <div style={{ flex: 1 }}><div className="eyebrow" style={{ letterSpacing: ".14em" }}>{r[0]}</div><div style={{ fontSize: 15, marginTop: 4, color: "var(--tx-80)" }}>{r[1]}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {night.length > 0 && (
        <div className="pad" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><i className="ph-fill ph-moon-stars" style={{ fontSize: 17, color: "var(--violet-l)" }}/><span className="eyebrow" style={{ letterSpacing: ".14em" }}>NIGHT REFLECTION</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {night.map((r, i) => (
              <div className="aj-sent" key={i}><div className="aj-sent-n" style={{ background: "transparent" }}><i className={"ph-fill " + r[2]} style={{ color: r[3] }}/></div><div style={{ flex: 1 }}><div className="aj-sent-lbl">{r[0]}…</div><div style={{ fontSize: 15, color: "var(--tx-80)", marginTop: 2 }}>{r[1]}</div></div></div>
            ))}
          </div>
        </div>
      )}
      {!p.musing && !logs.length && !night.length && (
        <div className="pad" style={{ marginTop: 20 }}><p className="muted" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{e.body || "This reflection is empty."}</p></div>
      )}
      <div className="pad" style={{ marginTop: 24 }}>
        <button className="aj-link" onClick={() => go("timeline")}><i className="ph-fill ph-list-bullets lead" style={{ color: "var(--violet-l)" }}/><span>Back to your journal</span><i className="ph-bold ph-arrow-right chev"/></button>
      </div>
    </div>
  );
}

/* ---- Calendar ----------------------------------------------------------- */
function Calendar({ ctx }) {
  const { entries, streak, pstate, go, openEntry } = ctx;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const monthLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first = new Date(y, m, 1).getDay();               // 0 = Sunday
  const daysIn = new Date(y, m + 1, 0).getDate();
  const todayD = now.getDate();
  const byDay = {}; (entries || []).forEach(e => { const d = new Date(e.createdAt); if (d.getFullYear() === y && d.getMonth() === m) byDay[d.getDate()] = e; });
  const [sel, setSel] = useState(todayD);

  // avg systems held (from any persisted systems:* states this month)
  let sums = 0, cnt = 0;
  Object.keys(pstate || {}).forEach(k => { if (k.indexOf("systems:" + y + "-" + String(m + 1).padStart(2, "0")) === 0) { const v = pstate[k] || {}; sums += SYSTEMS.filter(s => v[s.key]).length; cnt++; } });
  const monthAvg = cnt ? (sums / cnt).toFixed(1) : "—";
  const journaled = Object.keys(byDay).length;

  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) {
    const has = !!byDay[d];
    const isToday = d === todayD;
    const isPast = d < todayD;
    let cls = "up"; if (isToday) cls = "today"; else if (has) cls = "done"; else if (isPast) cls = "missed";
    cells.push({ d, cls });
  }
  const selEntry = byDay[sel];
  const selKey = "systems:" + y + "-" + String(m + 1).padStart(2, "0") + "-" + String(sel).padStart(2, "0");
  const selSys = pstate[selKey] ? SYSTEMS.filter(s => pstate[selKey][s.key]).length + "/6" : "—";

  return (
    <div className="aj-view">
      <div className="aj-head" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}><button className="icon-btn" aria-label="Back" onClick={() => go("home")}><i className="ph-bold ph-arrow-left"/></button><h2>{monthLabel}</h2></div>
        <button className="icon-btn" aria-label="List view" onClick={() => go("timeline")}><i className="ph-bold ph-list-bullets"/></button>
      </div>
      <div className="pad" style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <div className="aj-calstat"><b>{journaled}</b><small>journaled</small></div>
        <div className="aj-calstat"><b style={{ color: "var(--flame)" }}>{streak}</b><small>day streak</small></div>
        <div className="aj-calstat"><b style={{ color: "var(--a)" }}>{monthAvg}</b><small>avg systems</small></div>
      </div>
      <div className="pad aj-calgrid" style={{ marginTop: 20 }}>{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="aj-calwd">{d}</div>)}</div>
      <div className="pad aj-calgrid">{cells.map((c, i) => c ? <button key={i} className={"aj-calday " + c.cls} onClick={() => setSel(c.d)}>{c.d}</button> : <div key={i}/>)}</div>
      <div className="pad aj-callegend"><span><i className="dot done"/>Done</span><span><i className="dot missed"/>Missed</span><span><i className="dot up"/>Upcoming</span></div>
      <div className="pad" style={{ marginTop: 18 }}>{React.createElement(selEntry ? "button" : "div", { className: "card", onClick: selEntry ? (() => openEntry(selEntry)) : undefined, style: selEntry ? { textAlign: "left", width: "100%", cursor: "pointer" } : undefined },
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700 }}>{new Date(y, m, sel).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</div><span className="aj-entry-sys"><i className="ph-fill ph-check-circle"/>{selSys}</span></div>,
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}><i className={"ph-fill " + (selEntry ? (MOOD_ICON[selEntry.mood] || "ph-feather") : "ph-moon-stars")} style={{ fontSize: 28, color: "var(--violet-l)" }}/><p style={{ flex: 1, fontSize: 14, lineHeight: 1.45, color: "var(--tx-70)", margin: 0 }}>{selEntry ? (selEntry.body || "").split("\n")[0] : "No reflection logged this day."}</p>{selEntry && <i className="ph-bold ph-arrow-right" style={{ color: "var(--tx-30)", fontSize: 15 }}/>}</div>
      )}</div>
    </div>
  );
}

/* ---- The Charge (Chief Servant's letter) -------------------------------- */
function Charge({ ctx }) {
  const { go } = ctx;
  return (
    <div className="aj-view">
      <div className="aj-head"><button className="icon-btn" aria-label="Back" onClick={() => go("you")}><i className="ph-bold ph-arrow-left"/></button><h2>The Charge</h2></div>
      <div className="pad" style={{ marginTop: 20 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: ".18em", color: "var(--gold)", fontWeight: 700 }}>CHIEF SERVANT · VAN. BABATUNDE ADEOLA</div>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--tx-70)", margin: "16px 0 0" }}>To parents, teachers, and all who claim to care about the next generation — spoken plainly, without diplomacy.</p>
        <p className="disp" style={{ fontSize: 24, lineHeight: 1.3, margin: "22px 0 0" }}>“Values are not inherited. They are installed.”</p>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--tx-70)", margin: "14px 0 0" }}>And installation requires three things, every single day:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <div className="aj-focus start"><i className="ph-fill ph-calendar-check"/><span className="t">Daily structure</span></div>
          <div className="aj-focus auto"><i className="ph-fill ph-users-three"/><span className="t">Unified authority</span></div>
          <div className="aj-charge-rep"><i className="ph-fill ph-repeat"/><span className="t">Repetition without negotiation</span></div>
        </div>
        <p className="disp" style={{ fontSize: 22, lineHeight: 1.35, margin: "26px 0 0" }}>“We do not need more emotional children. We need governed humans.”</p>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--tx-70)", margin: "14px 0 0" }}>Not louder motivation — quieter consistency. Not perfect children — incorruptible ones: those who do the right thing even when no one is watching.</p>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--tx-70)", margin: "14px 0 0" }}>ANCHOR is the shared language between the Home, the School, and your Afrovanguard Mentor. It removes guesswork. It removes selective discipline.</p>
        <p style={{ fontWeight: 700, fontSize: 14, color: "var(--gold)", margin: "26px 0 0" }}>— Chief Servant</p>
      </div>
    </div>
  );
}

/* ---- Week detail (build sheet) ------------------------------------------ */
function WeekDetail({ ctx }) {
  const { selWeek, go } = ctx;
  const n = selWeek || 1;
  const d = WEEK_DATA[n - 1] || WEEK_DATA[0];
  const title = (WEEK_TITLES[n - 1] || "").split(" · ")[0];
  const rows = [
    { lbl: "PERSONAL FOCUS", icon: "ph-target", c: "var(--a)", v: d.focus },
    { lbl: "HOME ACTIONS", icon: "ph-house", c: "var(--violet-l)", v: d.home },
    { lbl: "SCHOOL ACTIONS", icon: "ph-chalkboard-teacher", c: "var(--violet-l)", v: d.school },
    { lbl: "PEER MODELING", icon: "ph-users-three", c: "var(--magenta-l)", v: d.peer },
  ];
  return (
    <div className="aj-view">
      <div className="aj-head"><button className="icon-btn" aria-label="Back" onClick={() => go("library")}><i className="ph-bold ph-arrow-left"/></button><div><div className="mono" style={{ fontSize: 11, letterSpacing: ".2em", color: "var(--gold)", fontWeight: 700 }}>WEEK {String(n).padStart(2, "0")}</div><h2 style={{ fontSize: 22 }}>{title}</h2></div></div>
      <div className="pad" style={{ marginTop: 20 }}><Tilt strength={7}><div className="card-grad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><div className="mono" style={{ fontSize: 11, letterSpacing: ".12em", color: "var(--tx-55)" }}>SYSTEM BEING BUILT</div><div className="disp" style={{ fontSize: 22, marginTop: 4 }}>{d.system}</div></div>
        <i className="ph-fill ph-shield-check" style={{ fontSize: 38, color: "var(--a)" }}/>
      </div></Tilt></div>
      <div className="pad" style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "15px 16px", borderRadius: 16, background: "var(--card)", border: "1px solid var(--line)" }}>
            <i className={"ph-fill " + r.icon} style={{ fontSize: 21, color: r.c, marginTop: 1 }}/>
            <div style={{ flex: 1 }}><div className="eyebrow" style={{ letterSpacing: ".14em" }}>{r.lbl}</div><div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{r.v}</div></div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start", padding: "15px 16px", borderRadius: 16, background: "linear-gradient(140deg,rgba(255,206,84,.14),rgba(255,255,255,.04))", border: "1px solid rgba(255,206,84,.24)" }}>
          <i className="ph-fill ph-notebook" style={{ fontSize: 21, color: "var(--gold)", marginTop: 1 }}/>
          <div style={{ flex: 1 }}><div className="eyebrow" style={{ letterSpacing: ".14em" }}>JOURNAL PROMPT</div><div className="disp" style={{ fontSize: 15, lineHeight: 1.35, marginTop: 4, fontWeight: 600 }}>{d.journal}</div></div>
        </div>
      </div>
    </div>
  );
}

/* ---- Growth ------------------------------------------------------------- */
function Growth({ ctx }) {
  const { entries, streak, diamonds, xp, cur, xpPct, currentWeek, pstate, setState, go, isNGG } = ctx;
  const dates = new Set((entries || []).map(e => dayKey(e.createdAt)));
  const mon = mondayOf(Date.now());
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const weekDots = days.map((d, i) => { const dd = new Date(mon); dd.setUTCDate(dd.getUTCDate() + i); return { d, on: dates.has(dayKey(dd)) }; });
  const scoreKey = "selfscore:" + dayKey(mon);
  const scores = pstate[scoreKey] || {};
  const setScore = (k, v) => setState(scoreKey, Object.assign({}, scores, { [k]: v }));

  return (
    <div className="aj-view">
      <div className="pad"><h2 className="disp" style={{ fontSize: 26, margin: 0 }}>Growth</h2><div className="muted" style={{ fontSize: 13 }}>Quiet consistency, made visible.</div></div>

      <div className="pad" style={{ marginTop: 20 }}><Tilt><div className="card" style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div className="aj-ring" style={{ "--deg": (xpPct * 3.6) + "deg" }}><div className="aj-ring-in"><b>L{cur.L}</b><small>{cur.name.toUpperCase()}</small></div></div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="aj-gstat"><i className="ph-fill ph-fire" style={{ color: "var(--flame)" }}/><div><b>{streak} days</b><small>current streak</small></div></div>
          <div className="aj-gstat"><i className="ph-fill ph-diamond" style={{ color: "var(--a)" }}/><div><b>{diamonds}</b><small>diamonds earned</small></div></div>
        </div>
      </div></Tilt></div>

      <div className="pad" style={{ marginTop: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>THIS WEEK</div>
        <div className="aj-week">{weekDots.map((w, i) => <div className="aj-week-d" key={i}><div className={"aj-week-c" + (w.on ? " on" : "")}>{w.on ? <i className="ph-bold ph-check"/> : null}</div><span>{w.d}</span></div>)}</div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="eyebrow pad" style={{ marginBottom: 12 }}>YOUR RANK</div>
        <div className="aj-ranks">{RANKS.map(r => { const c = r.name === cur.name; return (
          <div className={"aj-rank" + (c ? " cur" : "")} key={r.name}><div className="aj-rank-ic"><i className={"ph-fill " + r.icon}/></div><div className="aj-rank-nm">{r.name}</div><div className="aj-rank-xp">{c ? "CURRENT" : r.xp + " XP"}</div></div>
        ); })}</div>
      </div>

      <div className="pad" style={{ marginTop: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>THIS WEEK · SELF SCORE <span className="muted" style={{ letterSpacing: 0 }}>· tap to rate</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {SCORE_DIMS.map(dim => { const v = scores[dim.key] || 0; return (
            <div key={dim.key} onClick={() => setScore(dim.key, v >= 5 ? 1 : v + 1)} style={{ cursor: "pointer" }}>
              <div className="aj-score-row"><span>{dim.label}</span><span className="v">{v}/5</span></div>
              <div className="aj-score-track"><div className="aj-score-fill" style={{ width: (v / 5 * 100) + "%" }}/></div>
            </div>
          ); })}
        </div>
      </div>

      <div className="pad" style={{ marginTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>HABIT FOCUS · WEEK {currentWeek}</div>
        {(() => { const h = habitFocus(currentWeek); return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="aj-focus stop"><span className="aj-focus-tag">STOP</span><i className="ph-fill ph-hand-palm"/><span className="t">{h.stop}</span></div>
            <div className="aj-focus start"><span className="aj-focus-tag">START</span><i className="ph-fill ph-play-circle"/><span className="t">{h.start}</span></div>
            <div className="aj-focus auto"><span className="aj-focus-tag">AUTOMATE</span><i className="ph-fill ph-arrows-clockwise"/><span className="t">{h.automate}</span></div>
          </div>
        ); })()}
      </div>

      <div className="pad" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><div className="eyebrow">12-WEEK JOURNEY</div><span className="mono" style={{ fontSize: 11, color: "var(--a)", fontWeight: 700 }}>{currentWeek} / 12</span></div>
        <div className="aj-wkgrid">{WEEK_TITLES.map((_, i) => <div className={"aj-wkcell" + (i + 1 === currentWeek ? " cur" : "")} key={i}>{String(i + 1).padStart(2, "0")}</div>)}</div>
      </div>

      <div className="pad" style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        <button className="aj-link" onClick={() => go("library")}><i className="ph-fill ph-books lead" style={{ color: "var(--gold)" }}/><span>Prompt library</span><i className="ph-bold ph-arrow-right chev"/></button>
        <button className="aj-link" onClick={() => go("peers")}><i className="ph-fill ph-users-three lead" style={{ color: "var(--violet-l)" }}/><span>Peer modeling</span>{isNGG ? <i className="ph-bold ph-arrow-right chev"/> : <span className="aj-lock-note"><i className="ph-fill ph-lock-simple"/>NGG</span>}</button>
        <button className="aj-link" onClick={() => go("review")}><i className="ph-fill ph-seal-check lead" style={{ color: "var(--a)" }}/><span>Weekly review</span><i className="ph-bold ph-arrow-right chev"/></button>
      </div>
    </div>
  );
}

/* ---- Library ------------------------------------------------------------ */
function Library({ ctx }) {
  const { currentWeek, go } = ctx;
  return (
    <div className="aj-view">
      <div className="aj-head"><button className="icon-btn" aria-label="Back" onClick={() => go("growth")}><i className="ph-bold ph-arrow-left"/></button><h2>Anchor quotes</h2></div>
      <div className="pad" style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {QUOTES.map((q, i) => <div className="aj-quote-card" key={i}><span className="n">{String(i + 1).padStart(2, "0")}</span><p>“{q}”</p></div>)}
      </div>
      <div className="pad" style={{ marginTop: 26 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>THE 12 WEEKS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WEEK_TITLES.map((t, i) => { const cur = i + 1 === currentWeek; return (
            <button className={"aj-wkrow" + (cur ? " cur" : "")} key={i} onClick={() => ctx.openWeek(i + 1)} style={{ cursor: "pointer", width: "100%", textAlign: "left" }}><span className="n">{String(i + 1).padStart(2, "0")}</span><span className="t">{t}</span>{cur ? <span className="aj-now">NOW</span> : <i className="ph-bold ph-arrow-right" style={{ color: "var(--tx-30)", fontSize: 15 }}/>}</button>
          ); })}
        </div>
      </div>
    </div>
  );
}

/* ---- Peers -------------------------------------------------------------- */
function Peers({ ctx }) {
  const { pstate, setState, go, isNGG } = ctx;
  const peers = pstate.peers || [];
  const [draft, setDraft] = useState("");
  const attended = peers.filter(p => p.attended).length;
  const save = (next) => setState("peers", next);
  const add = () => { const n = draft.trim(); if (!n) return; save([...peers, { name: n, modeled: "", invited: false, attended: false }]); setDraft(""); };
  const toggle = (i, f) => save(peers.map((p, idx) => idx === i ? Object.assign({}, p, { [f]: !p[f] }) : p));

  if (!isNGG) return (
    <div className="aj-view">
      <div className="aj-head"><button className="icon-btn" aria-label="Back" onClick={() => go("growth")}><i className="ph-bold ph-arrow-left"/></button><div><h2>Peer modeling</h2><div className="sub">An NGG member feature.</div></div></div>
      <div className="pad" style={{ marginTop: 24 }}><div className="card-grad center" style={{ padding: 28 }}>
        <i className="ph-fill ph-users-three" style={{ fontSize: 48, color: "var(--violet-l)" }}/>
        <h3 className="disp" style={{ fontSize: 22, margin: "14px 0 8px" }}>Lead by example.</h3>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 18px" }}>Peer modeling — bringing friends into the movement at an NGG centre — is part of Next Generation Genius membership. Your personal discipline tools stay free forever.</p>
        <a className="btn-a" href="/#join">Join Next Generation Genius <i className="ph-bold ph-arrow-right"/></a>
      </div></div>
    </div>
  );

  return (
    <div className="aj-view">
      <div className="aj-head"><button className="icon-btn" aria-label="Back" onClick={() => go("growth")}><i className="ph-bold ph-arrow-left"/></button><div><h2>Peer modeling</h2><div className="sub">Lead by example — bring 2 friends.</div></div></div>
      <div className="pad" style={{ marginTop: 20 }}><div className="card-grad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><div className="disp" style={{ fontSize: 28 }}>{attended} / 2</div><div className="muted" style={{ fontSize: 12 }}>friends confirmed at NGG</div></div>
        <i className="ph-fill ph-users-three" style={{ fontSize: 38, color: "var(--violet-l)" }}/>
      </div></div>
      <div className="pad" style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {peers.map((p, i) => (
          <div className="aj-peer" key={i}>
            <div className="aj-peer-top"><div className="aj-peer-av">{(p.name || "?").charAt(0).toUpperCase()}</div><div style={{ flex: 1 }}><div className="aj-peer-nm">{p.name}</div><div className="aj-peer-m">Modeled · {p.modeled || "Getting started"}</div></div></div>
            <div className="aj-peer-btns">
              <button className={"aj-peer-btn" + (p.invited ? " inv-on" : "")} onClick={() => toggle(i, "invited")}><i className={"ph-fill " + (p.invited ? "ph-check-circle" : "ph-circle")}/>Invited</button>
              <button className={"aj-peer-btn" + (p.attended ? " att-on" : "")} onClick={() => toggle(i, "attended")}><i className={"ph-fill " + (p.attended ? "ph-check-circle" : "ph-circle")}/>Attended</button>
            </div>
          </div>
        ))}
        <div className="aj-peer-add"><input placeholder="Add a friend's name" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}/><button onClick={add} aria-label="Add"><i className="ph-bold ph-plus"/></button></div>
      </div>
    </div>
  );
}

/* ---- Weekly review ------------------------------------------------------ */
function Review({ ctx }) {
  const { currentWeek, mentor, entries, go, isNGG } = ctx;
  const h = habitFocus(currentWeek);
  const logs = weekLogs(entries, currentWeek);
  // The member's own execution logs this week — real data captured in their
  // reflections. Empty states are honest, never fabricated.
  const myLogs = [
    { role: "Home", icon: "ph-house", tint: "rgba(201,242,78,.14)", ic: "#c9f24e", msg: logs.home },
    { role: "School", icon: "ph-chalkboard-teacher", tint: "rgba(139,92,246,.2)", ic: "#c9b0ff", msg: logs.school },
    { role: "Peers", icon: "ph-users-three", tint: "rgba(217,110,194,.2)", ic: "#f0a6da", msg: logs.peer },
  ];
  return (
    <div className="aj-view">
      <div className="aj-head"><button className="icon-btn" aria-label="Back" onClick={() => go("growth")}><i className="ph-bold ph-arrow-left"/></button><div><h2>Weekly review</h2><div className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700 }}>WEEK {String(currentWeek).padStart(2, "0")} · {(WEEK_TITLES[currentWeek - 1] || "").split(" · ")[0].toUpperCase()}</div></div></div>
      <div className="pad" style={{ marginTop: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>HABIT FOCUS</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="aj-focus stop" style={{ flex: 1, flexDirection: "column", textAlign: "center", gap: 6 }}><div className="aj-focus-tag" style={{ width: "auto" }}>STOP</div><span className="t" style={{ flex: "none", fontSize: 12 }}>{h.stop}</span></div>
          <div className="aj-focus start" style={{ flex: 1, flexDirection: "column", textAlign: "center", gap: 6 }}><div className="aj-focus-tag" style={{ width: "auto" }}>START</div><span className="t" style={{ flex: "none", fontSize: 12 }}>{h.start}</span></div>
          <div className="aj-focus auto" style={{ flex: 1, flexDirection: "column", textAlign: "center", gap: 6 }}><div className="aj-focus-tag" style={{ width: "auto" }}>AUTO</div><span className="t" style={{ flex: "none", fontSize: 12 }}>{h.automate}</span></div>
        </div>
      </div>
      <div className="pad" style={{ marginTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>YOUR EXECUTION THIS WEEK</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>{logs.count ? logs.count + " reflection" + (logs.count === 1 ? "" : "s") + " logged this week." : "No reflections logged yet this week."}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {myLogs.map((r, i) => (
            <div className="aj-remark" key={i}><div className="aj-remark-top"><div className="aj-remark-ic" style={{ background: r.tint }}><i className={"ph-fill " + r.icon} style={{ color: r.ic }}/></div><div className="aj-remark-role">{r.role}</div></div><p style={r.msg ? null : { color: "var(--tx-40)", fontStyle: "italic" }}>{r.msg || "No log yet — add it in today's reflection."}</p></div>
          ))}
        </div>
      </div>
      <div className="pad" style={{ marginTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>YOUR MENTOR</div>
        {mentor ? (
          <div className="aj-remark"><div className="aj-remark-top"><div className="aj-remark-ic" style={{ background: "rgba(217,110,194,.2)" }}><i className="ph-fill ph-compass" style={{ color: "#f0a6da" }}/></div><div className="aj-remark-role">{mentor.fullName}{mentor.centre ? " · " + mentor.centre : ""}</div></div>{(mentor.remark || mentor.note) ? <p>{mentor.remark || mentor.note}</p> : <p style={{ color: "var(--tx-40)", fontStyle: "italic" }}>Your Afrovanguard mentor is linked. Their weekly remarks appear here after your check-in.</p>}</div>
        ) : (
          <div className="aj-remark"><div className="aj-remark-top"><div className="aj-remark-ic" style={{ background: "rgba(217,110,194,.2)" }}><i className="ph-fill ph-compass" style={{ color: "#f0a6da" }}/></div><div className="aj-remark-role">Afrovanguard Mentor</div></div><p style={{ color: "var(--tx-40)", fontStyle: "italic" }}>{isNGG ? "No mentor assigned yet — your centre will pair you soon." : "Mentor pairing is part of NGG membership."}</p></div>
        )}
      </div>
    </div>
  );
}

/* ---- You ---------------------------------------------------------------- */
function You({ ctx }) {
  const { member, cur, mentor, pstate, setState, isNGG, entries } = ctx;
  // Export the member's whole journal as a Markdown file — fully client-side,
  // works offline from the cached entries.
  const exportJournal = () => {
    const list = entries || [];
    if (!list.length) { toast.info("No reflections to export yet."); return; }
    const out = ["# " + (member.fullName || "My") + " — Anchor Journal", "", "Exported " + new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) + " · " + list.length + " reflections", ""];
    [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(e => {
      const d = new Date(e.createdAt); const p = parseEntry(e.body);
      out.push("## " + d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + (e.week ? "  ·  Week " + String(e.week).padStart(2, "0") : ""));
      const mood = MOODS.find(m => m.key === e.mood); if (mood) out.push("_Felt " + mood.label.toLowerCase() + "._");
      if (p.musing) out.push("", p.musing);
      if (p.school || p.home || p.peer) { out.push(""); if (p.school) out.push("- **School:** " + p.school); if (p.home) out.push("- **Home:** " + p.home); if (p.peer) out.push("- **Peers:** " + p.peer); }
      if (p.did || p.hard || p.tomorrow) { out.push("", "**Night reflection**"); if (p.did) out.push("- Did well by " + p.did); if (p.hard) out.push("- Difficult because " + p.hard); if (p.tomorrow) out.push("- Tomorrow I improve by " + p.tomorrow); }
      out.push("", "---", "");
    });
    const blob = new Blob([out.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "anchor-journal-" + dayKey(Date.now()) + ".md"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.ok("Exported " + list.length + " reflection" + (list.length === 1 ? "" : "s"));
  };
  const prefs = pstate.prefs || { reminder: true, readAloud: true };
  const toggle = (k) => setState("prefs", Object.assign({}, prefs, { [k]: !(prefs[k] !== false) }));
  const on = (k) => prefs[k] !== false;
  const circle = [
    { role: "Home · Parent", sub: "Confirms daily order", icon: "ph-house", tint: "rgba(201,242,78,.16)", ic: "#c9f24e", tag: isNGG ? "pending" : "locked" },
    { role: "School · Teacher", sub: "Verifies school conduct", icon: "ph-chalkboard-teacher", tint: "rgba(139,92,246,.2)", ic: "#c9b0ff", tag: isNGG ? "pending" : "locked" },
    { role: mentor ? mentor.fullName : "Afrovanguard Mentor", sub: "Weekly discipline & remarks", icon: "ph-compass", tint: "rgba(217,110,194,.2)", ic: "#f0a6da", tag: mentor ? "linked" : (isNGG ? "pending" : "locked") },
  ];
  return (
    <div className="aj-view">
      <div className="pad"><h2 className="disp" style={{ fontSize: 26, margin: 0 }}>You</h2></div>
      <div className="pad" style={{ marginTop: 18 }}><Tilt strength={7}><div className="card-grad" style={{ background: "linear-gradient(140deg,rgba(139,92,246,.35),rgba(201,242,78,.12))", display: "flex", alignItems: "center", gap: 16 }}>
        <div className="aj-profile-av"><i className="ph-fill ph-star"/></div>
        <div style={{ flex: 1 }}><div className="disp" style={{ fontSize: 22 }}>{member.fullName}</div><div className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, marginTop: 2 }}>{cur.name.toUpperCase()} · LEVEL {cur.L}</div></div>
      </div></Tilt></div>

      <div className="pad" style={{ marginTop: 22 }}>
        <button className="aj-link" onClick={() => ctx.go("charge")}><i className="ph-fill ph-scroll lead" style={{ color: "var(--gold)" }}/><span>The Charge — why Anchor exists</span><i className="ph-bold ph-arrow-right chev"/></button>
      </div>

      <div className="pad" style={{ marginTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>YOUR CIRCLE</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>One aligned language across home, school & mentor.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {circle.map((c, i) => (
            <div className="aj-circle-row" key={i}><div className="aj-circle-ic" style={{ background: c.tint }}><i className={"ph-fill " + c.icon} style={{ color: c.ic }}/></div><div className="aj-circle-t"><b>{c.role}</b><small>{c.sub}</small></div><span className={"aj-tag " + c.tag}>{c.tag === "locked" ? "NGG" : c.tag.toUpperCase()}</span></div>
          ))}
        </div>
        {!isNGG && <a className="btn-a" href="/#join" style={{ marginTop: 14 }}>Join NGG to activate your circle <i className="ph-bold ph-arrow-right"/></a>}
      </div>

      <div className="pad" style={{ marginTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>SETTINGS</div>
        <div className="aj-settings">
          <button className="aj-setrow" onClick={() => { if (!on("reminder") && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch {} } toggle("reminder"); }}><i className="ph-fill ph-bell lead"/><span>Daily reflection reminder</span><span className={"aj-toggle " + (on("reminder") ? "on" : "off")}><span/></span></button>
          <button className="aj-setrow" onClick={() => toggle("readAloud")}><i className="ph-fill ph-speaker-high lead"/><span>Read quote aloud</span><span className={"aj-toggle " + (on("readAloud") ? "on" : "off")}><span/></span></button>
          <button className="aj-setrow" onClick={exportJournal}><i className="ph-fill ph-download-simple lead"/><span>Export my journal</span><i className="ph-bold ph-arrow-right" style={{ color: "var(--tx-30)" }}/></button>
          <button className="aj-setrow" onClick={() => { localStorage.removeItem("ngg_aj_onb"); location.reload(); }}><i className="ph-fill ph-arrow-counter-clockwise lead"/><span>Replay intro</span><i className="ph-bold ph-arrow-right" style={{ color: "var(--tx-30)" }}/></button>
          <button className="aj-setrow" onClick={() => { NGGApi.auth.logout().finally(() => location.reload()); }}><i className="ph-fill ph-sign-out lead"/><span>Sign out</span><i className="ph-bold ph-arrow-right" style={{ color: "var(--tx-30)" }}/></button>
        </div>
      </div>
      <p className="aj-virtues" style={{ margin: "26px 24px 0" }}>Study harder · think deeper · speak wiser<br/>love purer · live truer</p>
    </div>
  );
}

/* ---- Bottom nav --------------------------------------------------------- */
function BottomNav({ view, go }) {
  const growthViews = ["growth", "library", "peers", "review"];
  const items = [{ id: "home", label: "Journey", icon: "ph-path", on: view === "home" || view === "reflect" || view === "systems" || view === "timeline" }, { id: "growth", label: "Growth", icon: "ph-chart-line-up", on: growthViews.includes(view) }, { id: "you", label: "You", icon: "ph-user-circle", on: view === "you" }];
  return <nav className="aj-nav" role="tablist">{items.map(it => <button key={it.id} className={"aj-nav-btn" + (it.on ? " on" : "")} role="tab" aria-selected={it.on} onClick={() => go(it.id)}><i className={"ph-fill " + it.icon}/>{it.label}</button>)}</nav>;
}

/* ---- Celebrate ---------------------------------------------------------- */
function Celebrate() {
  return <div className="aj-celebrate"><div className="aj-celebrate-in"><div className="aj-celebrate-badge"><i className="ph-fill ph-anchor"/></div><h2>Anchored!</h2><p>+60 XP · your streak is alive</p></div></div>;
}

/* ---- Onboarding --------------------------------------------------------- */
function Onboarding({ name, onDone }) {
  return (
    <div className="aj-celebrate" style={{ background: "var(--bg0)", zIndex: 70 }}>
      <div className="aj-onb" style={{ maxWidth: 440, width: "100%" }}>
        <div className="aj-onb-top">
          <div className="aj-onb-badge"><i className="ph-fill ph-anchor"/></div>
          <h1 className="aj-onb-h">ANCHOR</h1>
          <div className="aj-onb-sub">JOURNAL</div>
          <p className="aj-onb-p">A daily discipline for an <b>incorruptible generation.</b> Twelve weeks. One reflection at a time.</p>
        </div>
        <div style={{ marginTop: "auto" }}>
          <button className="btn-a" onClick={onDone}>Begin the journey <i className="ph-bold ph-arrow-right"/></button>
          <p className="aj-virtues">Study harder · think deeper · speak wiser<br/>love purer · live truer</p>
        </div>
      </div>
    </div>
  );
}

/* ---- Sign-in gate ------------------------------------------------------- */
function SignInGate({ onIn }) {
  const [stage, setStage] = useState("id");
  const [id, setId] = useState(""); const [otp, setOtp] = useState(""); const [masked, setMasked] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { const t = new URLSearchParams(location.search).get("signin"); if (!t) return; setBusy(true); NGGApi.auth.verify({ token: t }).then(r => onIn(r.member)).catch(e => setErr(e.code || e.message)).finally(() => setBusy(false)); }, []);
  const request = async e => { e.preventDefault(); setBusy(true); setErr(""); try { const r = await NGGApi.auth.request(id.trim()); setMasked(r.masked || ""); setStage("otp"); } catch (e) { setErr(e.code === "rate_limited" ? "Too many tries — wait a minute." : (e.code || e.message)); } finally { setBusy(false); } };
  const verify = async e => { e.preventDefault(); setBusy(true); setErr(""); try { const r = await NGGApi.auth.verify({ memberId: id.trim(), otp: otp.replace(/\s/g, "") }); onIn(r.member); } catch { setErr("That code didn't work. Try the latest one, or the magic link in your email."); } finally { setBusy(false); } };
  return (
    <div className="aj-app"><div className="aj-bg" aria-hidden="true"/><div className="aj-blob b1"/><div className="aj-blob b2"/><div className="aj-blob b3"/>
      <div className="aj-gate"><div className="aj-gate-card">
        <div className="aj-onb-badge" style={{ width: 84, height: 84, borderRadius: 24, fontSize: 42 }}><i className="ph-fill ph-anchor"/></div>
        <h1 className="aj-onb-h" style={{ fontSize: 38 }}>ANCHOR</h1>
        <div className="aj-onb-sub" style={{ marginBottom: 20 }}>JOURNAL</div>
        {stage === "id" ? (
          <form onSubmit={request}>
            <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>Your Member ID or email. We'll send a magic link + 6-digit code.</p>
            <input className="aj-input" placeholder="NGG-2025-0001 or you@email.com" value={id} onChange={e => setId(e.target.value)} autoFocus/>
            <div className="aj-gate-err">{err}</div>
            <button className="btn-a" disabled={busy || id.trim().length < 3}>{busy ? "Sending…" : "Send my code"} <i className="ph-bold ph-arrow-right"/></button>
            <button type="button" className="aj-linkbtn" onClick={() => setStage("otp")}>I already have a code</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>{masked ? <>Code sent to <b>{masked}</b>.</> : "Enter your Member ID and code."}</p>
            {!masked && <input className="aj-input" placeholder="Member ID" value={id} onChange={e => setId(e.target.value)}/>}
            <input className="aj-input aj-otp" inputMode="numeric" maxLength={7} placeholder="••••••" value={otp} onChange={e => setOtp(e.target.value.replace(/[^\d ]/g, ""))} autoFocus/>
            <div className="aj-gate-err">{err}</div>
            <button className="btn-a" disabled={busy || otp.replace(/\s/g, "").length !== 6}>{busy ? "Verifying…" : "Enter journal"}</button>
            <button type="button" className="aj-linkbtn" onClick={() => { setStage("id"); setErr(""); }}>← Start over</button>
          </form>
        )}
      </div></div>
    </div>
  );
}

/* ---- Install ------------------------------------------------------------ */
function InstallPrompt() {
  const [evt, setEvt] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("ngg_aj_install_dismissed") === "1");
  useEffect(() => { const h = e => { e.preventDefault(); setEvt(e); }; window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (!evt || dismissed || standalone) return null;
  return (
    <div className="aj-install" role="dialog" aria-label="Install app">
      <img src="/assets/logo.png" alt="" style={{ width: 34, height: 34, borderRadius: 9 }}/>
      <div className="aj-install-txt"><b>Install the Anchor Journal</b><br/><small>Add to your home screen — works offline.</small></div>
      <button className="btn-a" style={{ width: "auto", padding: "10px 14px", fontSize: 13, boxShadow: "none" }} onClick={async () => { evt.prompt(); try { await evt.userChoice; } catch {} setEvt(null); }}>Install</button>
      <button className="aj-install-x" aria-label="Dismiss" onClick={() => { setDismissed(true); localStorage.setItem("ngg_aj_install_dismissed", "1"); }}>✕</button>
    </div>
  );
}

/* ---- Boot + boundary + mount ------------------------------------------- */
function Boot() { return <div className="aj-app"><div className="aj-bg"/><div className="aj-gate"><div style={{ textAlign: "center" }}><img src="/assets/logo.png" alt="" style={{ width: 64, height: 64, borderRadius: 16 }}/><div className="aj-spinner"/></div></div></div>; }

class AJErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error("[AnchorJournal]", err); } catch {} }
  render() { return this.state.err ? <div className="aj-gate"><div className="aj-gate-card"><h1 className="disp" style={{ fontSize: 24 }}>Something broke.</h1><p className="muted">Reload to continue.</p><button className="btn-a" style={{ marginTop: 14 }} onClick={() => location.reload()}>Reload</button></div></div> : this.props.children; }
}

ReactDOM.createRoot(document.getElementById("aj-root")).render(<AJErrorBoundary><App/></AJErrorBoundary>);
if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") { window.addEventListener("load", () => navigator.serviceWorker.register("/journal/sw.js", { scope: "/journal/" }).catch(() => {})); }
