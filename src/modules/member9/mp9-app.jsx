/* ── Member Portal v9 (/dashboard) ────────────────────────────────────────
 *
 * Mp9View is the design, compiled (tools/dc-compile.js from
 * docs/design/portals/member-portal-v9.dc.html). This file and mp9-more.jsx
 * are its controller: the design's own logic, ported onto the member's real
 * endpoints. Every figure, list and verdict is the server's; the screen only
 * arranges it. Where the design had sample data, the value now comes from:
 *
 *   Today            member.today (To do in the server's order, standing, account)
 *   My mentor        chat · pod mine (goal, relationship check) · requests
 *   My growth        pod mine (Leadership Index, check-ins) · courage · journal
 *   School results   results.php (upload → read → confirm → draft → send → tick)
 *   Companion        companion (the week's verdict) · coach (Ask)
 *   Learn            curriculum · assignments · events · opportunities
 *   Saturday         public formation (member part) · the week's mission
 *   Me / Money / Records   dashboard · statement · compliance · records · requests · circle · security
 *
 * What the member writes for themselves (who they are becoming, dares, the
 * weekly review, a portfolio, a team project) lives in member_state under
 * `mp9.*` keys; anything they share goes to their mentor as a journal entry
 * with visibility "mentor", the way every shared reflection already does.
 */

/* Which reads a screen needs before it can draw. The core set loads at once. */
const MP9_CORE = ["today", "dash", "mine", "chat", "notifs", "state"];
const MP9_NEED = {
  today: ["today", "dash", "mine", "chat", "form", "mom"], mentor: ["chat", "mine"], growth: ["mine", "courage", "mom", "jm", "evals"],
  results: ["res"], companion: ["comp"], sat: ["form", "dash", "evals"], learn: ["cur", "dash", "opps"], timetable: ["tt", "cur"],
  journal: [], opps: ["opps"], community: ["feed"], passport: ["rec"], me: ["circle", "sec", "rec"],
  money: ["stmt", "comp9"], records: ["rec", "reqs"], help: [], more: [],
};
const MP9_LOADERS = {
  today: () => NGGApi.member.today(), dash: () => NGGApi.member.dashboard(), mine: () => NGGApi.member.pod.read("mine"),
  chat: () => NGGApi.member.chat(), notifs: () => NGGApi.member.notifications(), state: () => NGGApi.member.stateGet(MP9_STATE_KEYS),
  form: () => NGGApi.public.formation("member"), courage: () => NGGApi.member.courage(), mom: () => NGGApi.member.momentum(),
  jm: () => NGGApi.member.journalMine(0), res: () => NGGApi.member.results(""), comp: () => NGGApi.member.companion(),
  cur: () => NGGApi.member.curriculum(), tt: () => NGGApi.member.timetable(), opps: () => NGGApi.member.opps(),
  feed: () => NGGApi.member.community.feed("all", "latest", 0), rec: () => NGGApi.member.records(), circle: () => NGGApi.member.circle(),
  sec: () => NGGApi.member.security(), stmt: () => NGGApi.member.statement(), comp9: () => NGGApi.member.compliance(),
  reqs: () => NGGApi.member.requests(),
  // The mentor's Saturday evaluations of me: criteria, a strength and a next step — never their ratings or notes.
  evals: () => NGGApi.member.pod.read("evals"),
};
const MP9_SIMPLE_UNDER = 13;
/* Which area a screen belongs to, and that area's colour: one colour per place, so a child knows
   where they are by colour as well as by name. Each passes 4.5:1 with white text and on white. */
const MP9_AREA_OF = { today: "today", mentor: "mentor", companion: "mentor", community: "mentor", growth: "grow", results: "grow", passport: "grow", journal: "grow",
  learn: "learn", sat: "learn", timetable: "learn", tools: "learn", opps: "learn", me: "account", money: "account", records: "account", help: "account" };
const MP9_ACCENT = { today: "#c2410c", mentor: "#6d28d9", grow: "#15803d", learn: "#1d4ed8", account: "#334155" };
const MP9_STATE_KEYS = ["mp9.grow", "mp9.dare", "mp9.review", "mp9.cc", "mp9.portfolio", "mp9.project", "mp9.steps", "mp9.prep", "mp9.ticks", "mp9.lb", "mp9.view"];
const MP9_TONE = { danger: "#b0361c", warning: "#7a5600", info: "#1e4fae", neutral: "#4a4a50", success: "#1d6b30" };
/* A To do row's route (the server's) → the screen that answers it. */
const MP9_ROUTE = { "/member/account/money": "money", "/member/grow/results": "results", "/member/learn": "learn", "/member/mentor": "mentor",
  "/member/sat": "sat", "/member/records": "records", "/member/growth": "growth" };
const MP9_DAYS = ["M", "T", "W", "T", "F", "S", "S"], MP9_DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mp9First(n) { return String(n || "").replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, "").trim().split(/\s+/)[0] || ""; }
function mp9Ini(n) { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return ((p[0] || "")[0] || "").toUpperCase() + ((p.length > 1 ? p[p.length - 1] : "")[0] || "").toUpperCase(); }
function mp9Naira(n) { return "₦" + Math.round(Number(n) || 0).toLocaleString("en"); }
function mp9Date(iso, o) {
  if (!iso) return "";
  const d = new Date(String(iso).length === 10 ? iso + "T12:00:00Z" : iso);
  return isNaN(d) ? String(iso) : d.toLocaleDateString("en-GB", Object.assign({ day: "numeric", month: "short" }, o || {}));
}
function mp9When(iso) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d)) return String(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 1 && new Date().getDate() === d.getDate()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return mp9Date(iso);
}
/** ISO week key (Lagos is UTC+1, close enough for a week boundary on a Monday morning). */
function mp9Week(d) {
  const t = new Date(d || Date.now()); t.setUTCHours(12, 0, 0, 0);
  const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
  const y = t.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
  return y + "-W" + String(1 + Math.round(((t - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0");
}
function mp9Err(e) {
  const c = e && (e.code || e.message);
  const T = { network: "You’re offline. It will send when you’re back.", rate_limited: "That’s a lot at once. Wait a moment and try again.", no_mentor: "You don’t have a mentor yet.",
    quiet_hours: "Messages open at 8am.", uploads_disabled: "Uploads aren’t switched on here yet.", answer_all_four: "Answer all four first.", too_short: "Say a little more first.",
    managed_by_ngg: "NGG keeps that on your record. Ask the desk to change it.", not_ngg_member: "This portal is for NGG members." };
  return T[c] || (e && e.detail) || (typeof c === "string" && c.length < 80 && !/^[a-z_]+$/.test(c) ? c : "That didn’t work. Try again.");
}

class Mp9Portal extends React.Component {
  rootRef = React.createRef();
  palRef = React.createRef();
  state = {
    scr: mp9ScreenFromPath(), w: 1200, hist: [], d: {}, ld: {}, er: {},
    mood: null, wbStage: null, wbHelp: false, draft: {}, share: "mentor", msg: "", sending: false, fb: {}, fbSent: false, cat: null, cText: "", cRef: "", concernSent: false,
    toast: null, notif: false, read: false, sheet: null, sText: "", sPick: null, sAnon: false, sFile: null, sBusy: false, lq: {}, lqText: {}, lqRes: null, pf: {}, pfErr: "", delStep: 0,
    pal: false, palQ: "", palI: 0, mState: {}, qMood: null, qText: "", qSaved: [], liked: {}, cheered: {}, cmts: {}, cDraft: {}, cOpen: {}, daysAll: false, ledgerAll: false,
    rKind: null, rF: {}, nUnread: false, codeShown: false, evType: null, evText: "", evFile: null, evSent: false,
  };
  /* Each area has its own colour; the stylesheet reads it from data-area on the portal's frame. */
  markArea() { const r = this.rootRef.current, a = MP9_AREA_OF[this.state.scr] || "today", v = this.viewMode(); if (!r) return; if (r.dataset.area !== a) r.dataset.area = a; if (r.dataset.view !== v) r.dataset.view = v; }
  componentDidMount() {
    this.markArea();
    this.ro = new ResizeObserver(([e]) => this.setState({ w: e.contentRect.width }));
    if (this.rootRef.current) this.ro.observe(this.rootRef.current);
    MP9_CORE.forEach(k => this.load(k));
    this.ensure(this.state.scr);
    this._k = e => {
      const tg = (e.target.tagName || "").toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); this.setState(st => ({ pal: !st.pal, palQ: "", palI: 0 })); return; }
      if (e.key === "/" && tg !== "input" && tg !== "textarea" && tg !== "select") { e.preventDefault(); this.setState({ pal: true, palQ: "", palI: 0 }); return; }
      if (e.key === "Escape") {
        if (this.state.pal) this.setState({ pal: false });
        else if (this.state.sheet) this.closeSheet();
        else if (this.state.notif) this.setState({ notif: false });
      }
    };
    window.addEventListener("keydown", this._k);
    this._pop = () => { const s = mp9ScreenFromPath(); this.setState({ scr: s, sheet: null, notif: false }); this.ensure(s); };
    window.addEventListener("popstate", this._pop);
    this._online = () => this.setState({ net: navigator.onLine ? "online" : "offline" });
    window.addEventListener("online", this._online); window.addEventListener("offline", this._online);
  }
  componentDidUpdate(pp, ps) {
    this.rsEffects();
    this.markArea();
    if (this.state.pal && !ps.pal) setTimeout(() => this.palRef.current && this.palRef.current.focus(), 30);
    if (ps.sheet && !this.state.sheet && this._sheetFrom) { const el = this._sheetFrom; this._sheetFrom = null; setTimeout(() => { try { el.focus(); } catch (_) {} }, 0); }
  }
  componentWillUnmount() {
    clearInterval(this._tick); clearTimeout(this._t); this.ro && this.ro.disconnect();
    window.removeEventListener("keydown", this._k); window.removeEventListener("popstate", this._pop);
    window.removeEventListener("online", this._online); window.removeEventListener("offline", this._online);
  }

  /* ── Data ─────────────────────────────────────────────────────────────── */
  load(key) {
    const fn = MP9_LOADERS[key]; if (!fn) return Promise.resolve(null);
    this.setState(s => ({ ld: { ...s.ld, [key]: true }, er: { ...s.er, [key]: null } }));
    return fn().then(r => { this.setState(s => ({ d: { ...s.d, [key]: r }, ld: { ...s.ld, [key]: false } })); return r; })
      .catch(e => { this.setState(s => ({ ld: { ...s.ld, [key]: false }, er: { ...s.er, [key]: e } })); return null; });
  }
  refresh(keys) { (keys || []).forEach(k => this.load(k)); }
  ensure(scr) { (MP9_NEED[scr] || []).forEach(k => { if (!this.state.d[k] && !this.state.ld[k]) this.load(k); }); }
  dd(k) { return this.state.d[k] || null; }
  st(key, dflt) { const s = (this.dd("state") || {}).state || {}; const v = (this._st || {})[key] !== undefined ? this._st[key] : s[key]; return v === undefined || v === null ? dflt : v; }
  /** Keep a member-owned value (mp9.*): on screen at once, saved behind. */
  saveSt(key, value) {
    this._st = Object.assign({}, this._st || {}, { [key]: value });
    this.forceUpdate();
    return NGGApi.member.stateSet(key, value).catch(e => { this.toast(mp9Err(e)); });
  }
  toast(text, undo) { clearTimeout(this._t); this.setState({ toast: { text, undo } }); this._t = setTimeout(() => this.setState({ toast: null }), 6500); }
  act(p, ok, after) {
    return p.then(r => { if (ok) this.toast(typeof ok === "function" ? ok(r) : ok); if (after) this.refresh(after); return r || {}; })
      .catch(e => { this.toast(mp9Err(e)); return null; });
  }

  /* ── Navigation (the address is the screen) ───────────────────────────── */
  go(scr, extra) {
    // Study tools are their own app (/study), as the Anchor Journal is.
    if (scr === "tools") { location.href = "/study"; return; }
    const st = this.state;
    const path = "/dashboard" + (scr === "today" ? "" : "/" + (MP9_PATHS[scr] || scr));
    try { if (location.pathname !== path) history.pushState({ page: "dashboard" }, "", path); } catch (_) {}
    this.setState({ scr, sheet: null, notif: false, pal: false, hist: scr === st.scr ? st.hist : st.hist.concat([st.scr]).slice(-20), ...(extra || {}) });
    const m = this.rootRef.current && this.rootRef.current.querySelector("main"); if (m) m.scrollTop = 0;
    try { window.scrollTo(0, 0); } catch (_) {}
    this.ensure(scr);
  }
  goF(scr, extra) { return () => this.go(scr, extra); }
  goBack() { const h = this.state.hist; if (!h.length) return this.go("today"); const to = h[h.length - 1]; this.go(to); this.setState({ hist: h.slice(0, -1) }); }
  openSheet(sheet, extra) { this._sheetFrom = document.activeElement; this.setState({ sheet, sText: "", sPick: null, sAnon: false, sFile: null, sBusy: false, lq: {}, lqText: {}, lqRes: null, pf: {}, pfErr: "", delStep: 0, ...(extra || {}) }); }
  closeSheet() { this.setState({ sheet: null }); }

  /* ── Who is who ──────────────────────────────────────────────────────── */
  me() {
    const t = this.dd("today") || {}, d = this.dd("dash") || {}, m = d.member || {}, p = t.profile || {};
    const name = p.fullName || m.fullName || "";
    const sess = d.session || null, stats = d.stats || {};
    return { name, first: t.firstName || mp9First(name), ini: mp9Ini(name), id: p.displayId || m.displayId || p.memberId || m.memberId || "", memberId: p.memberId || m.memberId || "",
      centre: p.centre || m.centre || "", track: p.track || m.track || "", photo: m.photoUrl || "", hasPhoto: !!m.photoUrl, noPhoto: !m.photoUrl,
      age: t.age, older: !(t.age !== null && t.age !== undefined && t.age < 14),
      cohort: sess ? sess.name + " " + sess.year : "", stage: "Level " + (stats.level || (t.glance || {}).level || 1) + ((this.dd("mom") || {}).momentum ? " · " + this.dd("mom").momentum.levelName : ""),
      week: sess ? sess.weekOf : 0, weeks: sess ? sess.totalWeeks : 0, sessEnds: sess && sess.endDate ? sess.name + ", ends " + mp9Date(sess.endDate, { day: "numeric", month: "long" }) : "this session" };
  }
  mentorInfo() {
    const c = this.dd("chat") || {}, mine = this.dd("mine") || {}, t = this.dd("today") || {};
    const m = c.mentor || mine.mentor || (t.week || {}).mentor || null;
    const name = m ? m.name : "";
    return { has: !!m, name: name || "No mentor yet", first: m ? (m.first || mp9First(name)) : "your mentor", initials: m ? mp9Ini(name) : "?", role: m ? "Your NGG mentor" : "A mentor is matched to you by your centre" };
  }
  satDate() { const t = this.dd("today") || {}; return (t.week || {}).saturday || ""; }
  older() { return this.me().older; }
  /* The simple view: fewer areas in plain words, big buttons on Today. On by
     default below MP9_SIMPLE_UNDER, and every member can switch it in their
     profile — a confident ten-year-old and an unsure fifteen-year-old both
     get the view they chose, not the one their birthday chose. */
  viewMode() { const v = this.st("mp9.view", null); if (v === "simple" || v === "full") return v; const a = this.me().age; return a !== null && a !== undefined && a < MP9_SIMPLE_UNDER ? "simple" : "full"; }
  simple() { return this.viewMode() === "simple"; }
  setView(v) { if (v === this.viewMode()) return; this.saveSt("mp9.view", v); this.toast(v === "simple" ? "Simple view is on. Switch back any time in your profile." : "Full view is on. Switch back any time in your profile."); }

  /* ── Today ───────────────────────────────────────────────────────────── */
  todayVals(go) {
    const t = this.dd("today") || {}, a = t.account, mf = this.mentorInfo().first;
    const todo = (t.todo || []).map((x, i) => {
      const scr = MP9_ROUTE[x.route] || (/results/.test(x.route) ? "results" : /money|account/.test(x.route) ? "money" : /learn/.test(x.route) ? "learn" : /mentor/.test(x.route) ? "mentor" : "today");
      return { icon: "ph ph-" + x.icon, t: x.title, s: x.subtitle, cta: x.cta, go: go(scr), fg: MP9_TONE[x.tone] || "#4a4a50", bt: i ? "1px solid #f0efea" : "0" };
    });
    const ck = t.checkin || {};
    const stage = this.state.wbStage || (ck.done ? "done" : "ask");
    const moodsDef = [["good", "Good", "ph ph-smiley", "#1d6b30"], ["okay", "Okay", "ph ph-smiley-meh", "#4a4a50"], ["low", "Struggling", "ph ph-smiley-sad", "#7a5600"], ["help", "I need help", "ph ph-hand", "#b0361c"]];
    const sg = this.sgInfo();
    const save = (w, then) => NGGApi.member.pod.act("weekCheckin", { wellbeing: w }).then(() => { this.refresh(["today", "mine"]); then && then(); }).catch(e => this.toast(mp9Err(e)));
    const moods = moodsDef.map(([id, label, icon, ic]) => ({ label, icon, ic, on: this.state.mood === id ? "true" : "false", ring: this.state.mood === id ? "#0b0b0c" : "#d6d4cc", bw: this.state.mood === id ? "2px" : "1px",
      pick: () => {
        this.setState({ mood: id, wbHelp: id === "help", wbStage: id === "low" ? "follow" : "done" });
        save(id === "low" ? "Struggling" : id === "help" ? "Need help" : "Okay");
      } }));
    const doneText = this.state.wbHelp || ck.wellbeing === "Need help" ? sg.name + " from your centre will check in with you today. Only they and " + mf + " are told."
      : this.state.mood === "good" ? "Good to hear. Have a great week." : this.state.mood === "okay" || ck.wellbeing === "Okay" ? "Thanks for telling us. We’re here if that changes."
      : "Okay. You can ask for help any time from the lifebuoy button.";
    const pr = t.promises;
    const ticks = this.st("mp9.ticks", {}), wk = mp9Week(); const tk = (ticks.week === wk ? ticks.days : {}) || {};
    const acItems = pr ? (pr.items || []).map(it => {
      const days = tk[it.itemId] || [];
      return { t: it.subject + ": " + it.sessionsPerWeek + " session" + (it.sessionsPerWeek === 1 ? "" : "s"), prog: it.doneThisWeek + " of " + it.sessionsPerWeek + " done this week",
        days: MP9_DAYS.map((l, k) => { const on = !!days[k]; return { l, full: MP9_DAYS_FULL[k] + (on ? ", done" : ""), on: on ? "true" : "false", bd: on ? "#0b0b0c" : "#d6d4cc", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#f5b026" : "#4a4a50",
          go: () => this.tickDay(it, k, !on) }; }) };
    }) : [];
    return {
      todo, todoN: todo.length ? todo.length + (todo.length === 1 ? " thing" : " things") + " to do" : "", hasTodo: todo.length > 0, noTodo: todo.length === 0,
      moods, wbAsk: stage === "ask", wbFollow: stage === "follow", wbDone: stage === "done", wbDoneText: doneText,
      wbYes: () => { this.setState({ wbStage: "done", wbHelp: true }); save("Need help"); }, wbNo: () => this.setState({ wbStage: "done", wbHelp: false }),
      wbReset: () => this.setState({ wbStage: "ask", mood: null }),
      ac: { items: acItems, meta: "Week of " + mp9Date(new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 864e5).toISOString().slice(0, 10), { day: "numeric", month: "long" }) },
      goGrowScore: go("growth", { gtab: "score" }),
    };
  }
  tickDay(it, k, on) {
    const ticks = this.st("mp9.ticks", {}), wk = mp9Week();
    const days = { ...((ticks.week === wk && ticks.days) || {}) }; const row = (days[it.itemId] || []).slice(); row[k] = on; days[it.itemId] = row;
    this.saveSt("mp9.ticks", { week: wk, days });
    NGGApi.member.resultsTick(it.itemId, on ? 1 : -1).then(() => this.refresh(["today", "res"])).catch(e => this.toast(mp9Err(e)));
  }
  accVals() {
    const t = this.dd("today") || {}, a = t.account;
    if (!a) return { balance: mp9Naira(0), owes: false, clear: true, acc: { balFg: "#1d6b30", pillBg: "#e9f6ec", pill: "Nothing to pay", pillIcon: "ph-fill ph-check-circle",
      stats: [{ k: "Account", v: "Nothing charged", s: "Your centre hasn’t set dues", fg: "#0b0b0c" }, { k: "Training fee", v: "Covered", s: "NGG pays it · you pay ₦0", fg: "#0b0b0c" }],
      covered: "NGG pays your training fee in full. You only pay monthly dues and any fines." } };
    const owes = a.payable > 0;
    return { balance: mp9Naira(a.payable), owes, clear: !owes, acc: {
      balFg: owes ? "#b0361c" : "#1d6b30", pillBg: owes ? "#fdeeea" : "#e9f6ec", pill: owes ? (a.next ? "Due " + mp9Date(a.next.on, { weekday: "short", day: "numeric", month: "short" }) : "To pay now") : "All paid up", pillIcon: owes ? "ph-fill ph-clock" : "ph-fill ph-check-circle",
      stats: [
        { k: "Training fee", v: a.trainingFee ? mp9Naira(a.trainingFee) : "Covered", s: "Covered by NGG · you pay ₦0", fg: "#0b0b0c" },
        { k: "Next dues", v: a.next ? mp9Naira(a.next.amount) : "None set", s: a.next ? mp9Date(a.next.on) + " · " + a.next.label : "", fg: "#0b0b0c" },
        { k: "Paid this year", v: mp9Naira(a.paidThisYear), s: "", fg: "#1d6b30" },
        { k: "Last payment", v: a.lastPayment ? mp9Naira(a.lastPayment.amount) : "None", s: a.lastPayment ? mp9Date(a.lastPayment.at) : "", fg: "#0b0b0c" },
        { k: "Fines", v: a.fines ? mp9Naira(a.fines) + " owed" : "None owed", s: "", fg: a.fines ? "#b0361c" : "#0b0b0c" },
      ], covered: "NGG pays your training fee in full. You only pay monthly dues and any fines." } };
  }
  sgInfo() {
    const t = this.dd("today") || {}, o = t.safeguarding || null;
    return o && o.name ? { name: o.name, ini: mp9Ini(o.name), role: (o.centre || this.me().centre) + " · safeguarding", tel: o.phone ? "tel:" + o.phone.replace(/[^+\d]/g, "") : "tel:+2349037776318" }
      : { name: "NGG safeguarding", ini: "NG", role: "Someone trained to help, every day", tel: "tel:+2349037776318" };
  }

  /* ── My mentor ───────────────────────────────────────────────────────── */
  mentorVals(go) {
    const s = this.state, set = o => this.setState(o), M = this.mentorInfo(), mf = M.first, c = this.dd("chat") || {}, mine = this.dd("mine") || {};
    const tab = s.mvTab || "chat";
    const quiet = !!c.quiet;
    const satIso = this.satDate();
    const sat = satIso ? new Date(satIso + "T08:30:00+01:00") : null;
    const ms = sat ? sat - Date.now() : 0, dd = Math.max(0, Math.floor(ms / 864e5)), hh = Math.max(0, Math.floor(ms % 864e5 / 36e5));
    const prep = this.st("mp9.prep", {}); const tsent = prep.date === satIso && !!prep.sent;
    const topics = s.mvTopics || (prep.date === satIso ? prep.topics || [] : []), full = topics.length >= 3;
    const T = ["My goal", "School results", "Something worrying me", "My courage dare", "My project", "Friends or family"];
    const goal = mine.goal;
    const stepsDone = this.st("mp9.steps", {});
    const STEPS = goal ? [["Work towards: " + goal.goal, goal.reviewBy ? "Check by " + mp9Date(goal.reviewBy) : "Ongoing"]]
      .concat(goal.plan ? [["My plan: " + goal.plan, "Each week"]] : []).concat(goal.obstacle ? [["If “" + goal.obstacle + "” gets in the way, use my plan", "When it happens"]] : []) : [];
    const key = i => (goal ? goal.id : 0) + ":" + i;
    const left = STEPS.filter((_, i) => !stepsDone[key(i)]).length;
    const send = (t2, ok) => {
      if (!M.has) return this.toast("You don’t have a mentor yet. Your centre matches one to you.");
      return NGGApi.member.chatSend(t2).then(r => { this.refresh(["chat"]); if (r && r.crisis) this.toast(r.help || "Help is coming. If you’re in danger, call 112."); else if (ok) this.toast(ok); return r; }).catch(e => { this.toast(mp9Err(e)); return null; });
    };
    this._chatSend = send;
    return {
      tabs: [["chat", "Chat", "ph ph-chat-circle-text", 0], ["sess", "Sessions", "ph ph-calendar-check", tsent ? 0 : 1], ["steps", "Next steps", "ph ph-list-checks", left], ["fb", "How it’s going", "ph ph-heart", mine.relAsked && !mine.relDone ? 1 : 0]]
        .map(([k, l, icon, n]) => ({ l, icon, n: String(n), hasN: n > 0, on: tab === k ? "true" : "false", bg: tab === k ? "#fff" : "transparent", sh: tab === k ? "0 1px 2px rgba(11,11,12,.12)" : "none", fw: tab === k ? 700 : 500, go: () => set({ mvTab: k }) })),
      tChat: tab === "chat", tSess: tab === "sess", tSteps: tab === "steps", tFb: tab === "fb",
      replyT: M.has ? mf + " usually replies within a day" : "Your centre will match you with a mentor", openT: quiet ? "Closed · opens 8am" : "Open until 8pm", openBg: quiet ? "#f4f4f2" : "#e9f6ec", openFg: quiet ? "#6b6b72" : "#1d6b30",
      cd: sat ? (dd > 0 ? "in " + dd + "d " + hh + "h" : "in " + hh + "h") : "", prepL: tsent ? "Prepared" : "Prepare", goPrep: () => set({ mvTab: "sess" }),
      quick: ["Thank you!", "Can we talk on Saturday?", "I finished my step", "I need help with something"].map(l => ({ l, go: () => send(l) })),
      prepMeta: tsent ? "Sent to " + mf : "Takes a minute · helps you both",
      topics: T.map(l => { const on = topics.includes(l); return { l, on: on ? "true" : "false", off: !on && full, op: !on && full ? 0.45 : 1, bw: on ? "2px" : "1px", ring: on ? "#0b0b0c" : "#d6d4cc", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c",
        go: () => set({ mvTopics: on ? topics.filter(x => x !== l) : topics.concat([l]) }) }; }),
      note: s.mvNote !== undefined ? s.mvNote : (prep.date === satIso ? prep.note || "" : ""), onNote: e => set({ mvNote: e.target.value }),
      prepSent: tsent && !s.mvTopics && s.mvNote === undefined, prepBg: tsent ? "#e9f6ec" : "#0b0b0c", prepFg: tsent ? "#1d6b30" : "#fff", prepIcon: tsent ? "ph ph-check" : "ph ph-paper-plane-tilt", prepBtn: tsent ? "Sent to " + mf : "Send to " + mf,
      sendPrep: () => {
        const note = (s.mvNote !== undefined ? s.mvNote : prep.note || "").trim();
        if (!topics.length && !note) return this.toast("Pick a topic or write a line first.");
        send("Before Saturday, I’d like to talk about: " + (topics.length ? topics.join(", ") : "something") + "." + (note ? " " + note : ""), mf + " will see this before Saturday.")
          .then(r => { if (r) { this.saveSt("mp9.prep", { date: satIso, topics, note, sent: true }); set({ mvTopics: undefined, mvNote: undefined }); } });
      },
      past: [{ t: "Your one-to-ones", when: satIso ? "Next: " + mp9Date(satIso, { weekday: "short", day: "numeric", month: "short" }) : "", s: "What you agree together shows in Next steps. " + (M.has ? mf + "’s session notes stay with them." : "") }],
      stepsMeta: STEPS.length ? (left ? left + " to do before Saturday" : "All done. Nice work.") : "Nothing agreed yet. You’ll agree your next steps with " + mf + ".",
      steps: STEPS.map(([t2, due], i) => { const on = !!stepsDone[key(i)]; return { t: t2, due: on ? "Done" : due, dueFg: on ? "#1d6b30" : "#6b6b72", on: on ? "true" : "false", icon: on ? "ph-fill ph-check-square" : "ph ph-square", fg: on ? "#1d6b30" : "#9a9aa0", bd: on ? "#cfe8d5" : "#e8e5dd", bg: on ? "#f3faf4" : "#fff", strike: on ? "line-through" : "none",
        go: () => { this.saveSt("mp9.steps", { ...stepsDone, [key(i)]: !on }); if (!on) send("I finished a step: " + t2, mf + " can see you finished this."); } }; }),
      _send: send,
    };
  }
  chatVals() {
    const s = this.state, c = this.dd("chat") || {}, M = this.mentorInfo();
    const msgs = (c.messages || []).map(m => ({ t: m.body, when: (m.about ? m.about + " · " : "") + mp9When(m.at) + (m.mine && !m.read ? "" : ""), mine: m.mine, al: m.mine ? "flex-end" : "flex-start", bg: m.mine ? "#0b0b0c" : "#fff", fg: m.mine ? "#fff" : "#0b0b0c", bd: m.mine ? "#0b0b0c" : "#e8e5dd" }));
    if (!msgs.length) msgs.push({ t: M.has ? "No messages yet. Say hello, or ask " + M.first + " something before Saturday." : "When your centre matches you with a mentor, your messages show here.", when: "", al: "center", bg: "#f4f4f2", fg: "#4a4a50", bd: "#f4f4f2" });
    const sendMsg = () => { const t = s.msg.trim(); if (!t || s.sending) return; this.setState({ sending: true }); (this._chatSend ? this._chatSend(t) : Promise.resolve(null)).then(r => this.setState(r ? { msg: "", sending: false } : { sending: false })); };
    const mine = this.dd("mine") || {};
    const qs = mine.relQuestions || [];
    const fbOpts = [["Not really", 1], ["A bit", 3], ["Yes", 5]];
    const feedback = qs.map((q, k) => ({ q, opts: fbOpts.map(([o]) => ({ o, on: s.fb[k] === o ? "true" : "false", bg: s.fb[k] === o ? "#0b0b0c" : "#fff", fg: s.fb[k] === o ? "#fff" : "#0b0b0c", pick: () => this.setState({ fb: { ...this.state.fb, [k]: o } }) })) }));
    const fbCount = Object.keys(s.fb).length, fbLow = Object.values(s.fb).includes("Not really");
    const done = s.fbSent || (!!mine.relDone && !Object.keys(s.fb).length);
    return {
      msgs, msg: s.msg, onMsg: e => this.setState({ msg: e.target.value.slice(0, c.max || 1200) }), sendMsg, onMsgKey: e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } },
      agreement: ["Meet on Saturdays at the musing and mentor breakout (8:30)", "Messages through the portal only, 8am to 8pm", mine.goal ? "Work on: " + mine.goal.goal : "Agree one goal together, and check it every few weeks", "If something isn’t working, either of us tells the coordinator"],
      feedback, fbReady: qs.length > 0 && fbCount === qs.length && !done, fbSent: done, fbNotSent: !done, fbLow: s.fbSent ? fbLow : false,
      sendFb: () => NGGApi.member.pod.act("relChild", { answers: qs.map((_, k) => (fbOpts.find(o => o[0] === s.fb[k]) || [0, 3])[1]) })
        .then(() => { this.setState({ fbSent: true }); this.refresh(["mine"]); }).catch(e => this.toast(mp9Err(e))),
    };
  }

  /* ── My growth ───────────────────────────────────────────────────────── */
  liVals(go) {
    const s = this.state, set = o => this.setState(o), mine = this.dd("mine") || {}, mentor = this.mentorInfo().first;
    // MP_SKILLS arrives as [name, what it looks like] pairs; read every shape, or the rows have no names.
    const skills = (mine.skills || []).map(x => typeof x === "string" ? [x, ""] : Array.isArray(x) ? [String(x[0] || ""), String(x[1] || "")] : [x.label || x.name || x.k || "", x.hint || x.desc || x.h || ""]);
    const LI = skills.length ? skills : [];
    const sc = mine.mentorScores || [];
    const cur = sc[0] ? sc[0].scores : null, prev = sc[1] ? sc[1].scores : null;
    const selfDef = (mine.selfScore && mine.selfScore.scores) || LI.map(() => 5);
    const self = LI.map((_, i) => (s.liSelf || {})[i] !== undefined ? s.liSelf[i] : (selfDef[i] !== undefined ? selfDef[i] : 5));
    const tot = cur ? cur.reduce((a, b) => a + b, 0) : null, d = cur && prev ? tot - prev.reduce((a, b) => a + b, 0) : null;
    const mode = s.liMode || (cur ? "mentor" : "mine");
    const curV = cur || LI.map(() => 0);
    const lo = curV.indexOf(Math.min(...curV)), hi = curV.indexOf(Math.max(...curV));
    const focusI = s.liFocus !== undefined ? s.liFocus : lo;
    const monthName = m => m ? new Date(m + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long" }) : "";
    const saved = s.liSaved && s.liSaved === self.join(",");
    const dueSelf = mine.selfScoreDue !== false;
    const trend = sc.slice().reverse().map((r, i, a) => ({ m: monthName(r.month).slice(0, 3), v: r.total, h: Math.max(4, Math.round((r.total - 0) / 100 * 100)) + "%", bg: i === a.length - 1 ? "#0b0b0c" : "#d6d4cc" }));
    return { li: {
      mentor, month: cur ? monthName(sc[0].month) : "not scored yet", tot: tot === null ? "–" : tot, delta: d === null ? (cur ? "First month scored" : "Your mentor scores it monthly") : (d > 0 ? "+" : "") + d + " since " + monthName(sc[1].month),
      dFg: d > 0 ? "#1d6b30" : d < 0 ? "#b0361c" : "#6b6b72",
      focus: LI.length ? LI[focusI][0] : "–", strong: cur && LI.length ? LI[hi][0] + " · " + cur[hi] + " / 10" : "Not scored yet",
      strongNote: cur && LI.length ? mentor + " sees you " + (LI[hi][1] || LI[hi][0]).toLowerCase() + ". Use it to help someone else this week." : "When " + mentor + " scores your first month, your strongest skill shows here.",
      focusNote: cur && LI.length ? "Lowest right now at " + cur[focusI] + " / 10: " + (LI[focusI][1] || LI[focusI][0]).toLowerCase() + ". Small steps count." : "Score yourself in My view while you wait.",
      fL: s.liAsked ? "Sent to " + mentor : "Make it my next goal", fBd: s.liAsked ? "1px solid #cfe8d5" : "0", fBg: s.liAsked ? "#f3faf4" : "#0b0b0c", fFg: s.liAsked ? "#1d6b30" : "#fff",
      pickFocus: () => { if (s.liAsked || !LI.length) return; if (!this.mentorInfo().has) return this.toast("You don’t have a mentor yet.");
        NGGApi.member.chatSend("Can we make " + LI[focusI][0] + " my next goal? We can write it together on Saturday.").then(() => { set({ liAsked: true }); this.refresh(["chat"]); this.toast("Sent to " + mentor + ". You’ll write the goal together on Saturday."); }).catch(e => this.toast(mp9Err(e))); },
      modes: [["mentor", mentor + "’s view"], ["mine", "My view"], ["both", "Side by side"]].map(([id, l]) => ({ l, on: mode === id ? "true" : "false", bg: mode === id ? "#fff" : "transparent", sh: mode === id ? "0 1px 2px rgba(11,11,12,.1)" : "none", go: () => set({ liMode: id }) })),
      isMine: mode === "mine", notMine: mode !== "mine", isBoth: mode === "both", showBars: true,
      // Name | bars | the score (or the − + buttons): the row's three columns, which the design leaves to the controller.
      cols: "minmax(0, 1.3fr) minmax(64px, 1fr) auto",
      rows: LI.map(([l, h], i) => { const c0 = cur ? cur[i] : null, p = prev ? prev[i] : null, dd = c0 !== null && p !== null ? c0 - p : null;
        return { l, h, self: self[i], gap: mode === "both" && c0 !== null && Math.abs(self[i] - c0) >= 2,
          vT: mode === "both" ? self[i] + " · " + (c0 === null ? "–" : c0) : c0 === null ? "–" : String(c0), dT: mode === "both" ? "you · " + mentor : dd ? (dd > 0 ? "+" : "") + dd : "–",
          dFg: mode === "both" ? "#6b6b72" : dd > 0 ? "#1d6b30" : dd < 0 ? "#b0361c" : "#9a9aa0",
          segs: Array.from({ length: 10 }, (_, j) => ({ c: mode === "mine" ? (j < self[i] ? "#f5b026" : "#f0efea") : c0 !== null && j < c0 ? "#0b0b0c" : mode === "mentor" && p !== null && j < p ? "#d6d4cc" : "#f0efea" })),
          selfSegs: Array.from({ length: 10 }, (_, j) => ({ c: j < self[i] ? "#f5b026" : "#f0efea" })),
          up: () => set({ liSelf: { ...(s.liSelf || {}), [i]: Math.min(10, self[i] + 1) } }), dn: () => set({ liSelf: { ...(s.liSelf || {}), [i]: Math.max(0, self[i] - 1) } }) }; }),
      saveL: saved ? "Saved" : dueSelf ? "Save my scores" : "Update my scores", saveOp: saved ? 0.55 : 1, saveNote: saved ? mentor + " will see them before your next one-to-one." : "Only you and " + mentor + " see these.",
      saveSelf: () => { if (saved) return; NGGApi.member.pod.act("selfScore", { scores: self }).then(() => { set({ liSaved: self.join(","), liMode: cur ? "both" : "mine" }); this.refresh(["mine"]); this.toast(cur ? "Saved. Here’s how your view compares with " + mentor + "’s." : "Saved. " + mentor + " sees them before your next one-to-one."); }).catch(e => this.toast(mp9Err(e))); },
      trend: trend.length ? trend : [{ m: "Your first month shows here", v: "", h: "4%", bg: "#e6e5e0" }],
      mini: curV.map((v, i) => ({ h: (v * 10) + "%", bg: i === focusI ? "#f5b026" : "#0b0b0c" })),
    } };
  }
  growVals(go) {
    const mf = this.mentorInfo().first, older = this.older();
    const G = this.st("mp9.grow", null) || { fs: { statement: "", steps: [], done: {} } };
    const D0 = this.st("mp9.dare", null) || {};
    const wk = mp9Week();
    const dare = D0.week === wk ? D0 : { week: wk, stage: "pick", dare: null, count: D0.count || 0 };
    const s = this.state, set = o => this.setState(o);
    const c = s.cmp || {};
    const C0 = () => ({ fmt: "write", text: "", h: "", l: "", n: "", rec: "idle", recUrl: "", recSecs: 0, photo: null, photoUrl: "", priv: false, busy: false });
    const getC = k => Object.assign(C0(), c[k] || {});
    const upC = (k, p) => this.setState(st => ({ cmp: { ...(st.cmp || {}), [k]: Object.assign(C0(), (st.cmp || {})[k] || {}, p) } }));
    const resetC = k => this.setState(st => ({ cmp: { ...(st.cmp || {}), [k]: C0() } }));
    const canVoice = typeof window !== "undefined" && !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const comp = (k, ph, sendShared, sendPriv, onSend) => {
      const x = getC(k);
      const ok = !x.busy && (x.fmt === "write" ? x.text.trim().length > 3 : x.fmt === "voice" ? x.rec === "done" : x.fmt === "photo" ? !!x.photoUrl : [x.h, x.l, x.n].some(v => v.trim()));
      return {
        fmts: [["write", "Write", "ph ph-pencil-simple"], ["voice", "Voice note", "ph ph-microphone"], ["photo", "Photo", "ph ph-camera"], ["hln", older ? "High, low, next" : "Best, hard, next", "ph ph-list-bullets"]]
          .filter(f => f[0] !== "voice" || canVoice)
          .map(([id, l, icon]) => ({ l, icon, on: x.fmt === id ? "true" : "false", bw: x.fmt === id ? "2px" : "1px", ring: x.fmt === id ? "#0b0b0c" : "#d6d4cc", pick: () => upC(k, { fmt: id }) })),
        isWrite: x.fmt === "write", isVoice: x.fmt === "voice", isPhoto: x.fmt === "photo", isHln: x.fmt === "hln", ph,
        text: x.text, onText: e => upC(k, { text: e.target.value }), h: x.h, l: x.l, n: x.n,
        onH: e => upC(k, { h: e.target.value }), onL: e => upC(k, { l: e.target.value }), onN: e => upC(k, { n: e.target.value }),
        hL: older ? "High · the best part" : "Best bit", lL: older ? "Low · the hard part" : "Hard bit", nL: older ? "Next · what you’ll try" : "Next time I’ll…",
        recIdle: x.rec === "idle", recOn: x.rec === "rec", recDone: x.rec === "done", recLen: Math.floor(x.recSecs / 60) + ":" + String(x.recSecs % 60).padStart(2, "0") + (x.recUrl ? "" : " · uploading…"),
        recStart: () => this.recStart(k, upC), recStop: () => this.recStop(), recRedo: () => upC(k, { rec: "idle", recUrl: "", recSecs: 0 }),
        noPhoto: !x.photoUrl, hasPhoto: !!x.photoUrl, photoHint: x.busy ? "Uploading…" : "A photo of what you did",
        addPhoto: e => { const f = e.target.files && e.target.files[0]; if (!f) return; upC(k, { busy: true }); NGGApi.uploadOrInline(f, "journal").then(u => upC(k, { busy: false, photoUrl: mp9Abs(u.url) })).catch(er => { upC(k, { busy: false }); this.toast(mp9Err(er)); }); },
        removePhoto: () => upC(k, { photoUrl: "" }),
        shareAria: x.priv ? "false" : "true", toggleShare: () => upC(k, { priv: !x.priv }), track: x.priv ? "#d6d4cc" : "#0b0b0c", knob: x.priv ? "4px" : "24px",
        shareT: x.priv ? "Only me" : "Shared with " + mf, shareHelp: x.priv ? "Saved to your journal. Nobody else sees it." : mf + " can read this. Turn off to keep it to yourself.",
        cantA: ok ? "false" : "true", sendBg: ok ? "#0b0b0c" : "#efefed", sendFg: ok ? "#fff" : "#6b6b72", sendL: x.busy ? "Saving…" : x.priv ? sendPriv : sendShared,
        send: () => { if (!ok) return; const body = x.fmt === "hln" ? [x.h && (older ? "High: " : "Best: ") + x.h, x.l && (older ? "Low: " : "Hard: ") + x.l, x.n && "Next: " + x.n].filter(Boolean).join("\n") : x.fmt === "voice" ? "Voice note (" + Math.floor(x.recSecs / 60) + ":" + String(x.recSecs % 60).padStart(2, "0") + ")" : x.text.trim() || "A photo";
          const media = x.fmt === "photo" && x.photoUrl ? [{ type: "image", url: x.photoUrl, alt: x.text || "Photo", caption: x.text || "" }] : x.fmt === "voice" && x.recUrl ? [{ type: "audio", url: x.recUrl, alt: "Voice note", caption: "" }] : [];
          upC(k, { busy: true });
          onSend(!x.priv, body, media).then(r => { if (r) resetC(k); else upC(k, { busy: false }); }); },
      };
    };
    const fs = G.fs || { statement: "", steps: [], done: {} };
    const editing = !!s.fsEdit || !fs.statement;
    const d = s.fsD || { statement: fs.statement, steps: (fs.steps || []).concat(["", "", ""]).slice(0, 3) };
    const firstOpen = (fs.steps || []).findIndex((t, i) => !(fs.done || {})[i]);
    const fsOk = d.statement.trim().length > 3 && d.steps.some(x => x.trim());
    const DARES = older
      ? [["ph ph-hand", "Ask one question in class that you’d usually keep to yourself"], ["ph ph-chats-circle", "Disagree with someone respectfully, and say why"], ["ph ph-broom", "Volunteer for the job nobody wants this Saturday"]]
      : [["ph ph-hand", "Ask one question in class that you’d usually keep to yourself"], ["ph ph-heart", "Say sorry first after a disagreement"], ["ph ph-chalkboard-simple", "Teach a younger child one thing you know"]];
    const journal = this.journalSave.bind(this);
    // Look back: an entry of theirs from at least four weeks ago.
    const jm = this.dd("jm") || {};
    const entries = (jm.timeline || jm.entries || []).filter(e => e && (e.body || e.excerpt || e.title) && e.occurredOn && (Date.now() - new Date(e.occurredOn + "T12:00:00Z")) > 27 * 864e5);
    const lbS = this.st("mp9.lb", {});
    const lbIdx = s.lbIdx || 0, lbE = entries.length ? entries[lbIdx % entries.length] : null;
    const lb = lbE ? { when: "From " + Math.round((Date.now() - new Date(lbE.occurredOn + "T12:00:00Z")) / (7 * 864e5)) + " weeks ago", date: mp9Date(lbE.occurredOn, { weekday: "short", day: "numeric", month: "short" }), t: String(lbE.excerpt || lbE.body || lbE.title).slice(0, 220) }
      : { when: "Nothing to look back on yet", date: "your first entries", t: "When you have written for a few weeks, an old entry comes back here so you can see how far you’ve come." };
    const lbDoneNow = !!lbE && lbS.entryId === (lbE.entryId || lbE.id);
    return {
      mentorFirst: mf, mentorIni: (mf[0] || "").toUpperCase(),
      fsView: !editing, fsEditing: editing, fsLead: older ? "In three years I want to be someone who…" : "When I’m older I want to be someone who…",
      fsStatement: fs.statement, fsPh: older ? "e.g. builds things that help my community" : "e.g. is brave enough to speak up",
      fsMeta: Object.keys(fs.done || {}).filter(i => fs.done[i]).length + " of " + (fs.steps || []).length + " done",
      fsSteps: (fs.steps || []).map((t, i) => { const dn = !!(fs.done || {})[i]; return { t, pressed: dn ? "true" : "false", now: i === firstOpen, icon: dn ? "ph-fill ph-check-circle" : "ph ph-circle", ic: dn ? "#1d6b30" : "#9a9aa0", fg: dn ? "#4a4a50" : "#0b0b0c",
        toggle: () => { const was = fs.done || {}; this.saveSt("mp9.grow", { ...G, at: new Date().toISOString(), fs: { ...fs, done: { ...was, [i]: !dn } } }); if (!dn) this.toast("Step done. " + mf + " will see it on Saturday.", () => this.saveSt("mp9.grow", { ...G, fs: { ...fs, done: was } })); } }; }),
      fsStartEdit: () => set({ fsEdit: true, fsD: { statement: fs.statement, steps: (fs.steps || []).concat(["", "", ""]).slice(0, 3) } }),
      fsD: d, fsOnStatement: e => set({ fsD: { ...d, statement: e.target.value } }),
      fsDSteps: d.steps.map((v, i) => ({ v, l: "Step " + (i + 1), ph: ["e.g. Finish one unit in Learn", "e.g. Ask my mentor about it", "e.g. Try it once on Saturday"][i], on: e => { const st = d.steps.slice(); st[i] = e.target.value; set({ fsD: { ...d, steps: st } }); } })),
      fsCantA: fsOk ? "false" : "true", fsSaveBg: fsOk ? "#0b0b0c" : "#efefed", fsSaveFg: fsOk ? "#fff" : "#6b6b72", fsCanCancel: !!fs.statement,
      fsShareNote: mf + " can see this. It helps them help you.",
      fsSave: () => { if (!fsOk) return; const keep = d.steps.map(x => x.trim()).filter(Boolean); const done = {}; keep.forEach((x, i) => { const j = (fs.steps || []).indexOf(x); if (j >= 0 && (fs.done || {})[j]) done[i] = true; });
        this.saveSt("mp9.grow", { ...G, at: new Date().toISOString(), fs: { statement: d.statement.trim().replace(/[.…]+$/, ""), steps: keep, done } }).then(() => this.toast("Saved. " + mf + " can see it too."));
        set({ fsEdit: false, fsD: null }); },
      fsCancel: () => set({ fsEdit: false, fsD: null }),
      drPick: dare.stage === "pick", drOn: dare.stage === "on", drReflect: dare.stage === "reflect", drDone: dare.stage === "done",
      drOpts: DARES.map(([icon, t], i) => ({ icon, t, on: s.dPick === i ? "true" : "false", bw: s.dPick === i ? "2px" : "1px", ring: s.dPick === i ? "#0b0b0c" : "#d6d4cc", pick: () => set({ dPick: i }) })),
      drCantTakeA: s.dPick === undefined || s.dPick === null ? "true" : "false", drTakeBg: s.dPick === undefined || s.dPick === null ? "#efefed" : "#0b0b0c", drTakeFg: s.dPick === undefined || s.dPick === null ? "#6b6b72" : "#fff",
      drTake: () => { if (s.dPick === undefined || s.dPick === null) return; this.saveSt("mp9.dare", { ...dare, stage: "on", dare: DARES[s.dPick][1] }); },
      drDare: dare.dare || "", drDid: () => this.saveSt("mp9.dare", { ...dare, stage: "reflect" }), drChange: () => this.saveSt("mp9.dare", { ...dare, stage: "pick" }), drBack: () => this.saveSt("mp9.dare", { ...dare, stage: "on" }),
      cDare: comp("dare", older ? "What happened? What did it take?" : "What happened? How did you feel?", "Send to " + mf, "Save to my journal", (shared, body, media) =>
        journal({ title: "Courage dare: " + dare.dare, body, visibility: shared ? "mentor" : "private", tags: "dare courage", media }).then(r => {
          if (r) { this.saveSt("mp9.dare", { ...dare, stage: "done", priv: !shared, count: (dare.count || 0) + 1 }); this.toast(shared ? "Sent to " + mf : "Saved to your journal"); }
          return r; })),
      drDoneText: dare.priv ? "Saved to your journal. Only you can see it." : "Sent to " + mf + ". You’ll talk about it on Saturday.",
      drAck: false, drAckText: "",
      drCount: "You’ve taken " + (dare.count || 0) + (dare.count === 1 ? " dare" : " dares") + " so far. A new set comes on Monday.",
      lb, lbOpen: !lbDoneNow && !!lbE, lbDone: lbDoneNow, lbPrompt: older ? "What’s different now?" : "Is it still true? What changed?",
      lbSkip: () => { set({ lbIdx: lbIdx + 1 }); resetC("lb"); },
      cLb: comp("lb", older ? "A sentence is enough." : "Write as much or as little as you like.", "Save and share with " + mf, "Save to my journal", (shared, body, media) =>
        journal({ title: "Looking back at " + lb.date, body, prompt: lb.t, visibility: shared ? "mentor" : "private", tags: "lookback", media }).then(r => {
          if (r) { this.saveSt("mp9.lb", { entryId: lbE.entryId || lbE.id, shared }); this.toast("Saved next to your old entry"); this.refresh(["jm"]); }
          return r; })),
      lbDoneText: lbS.shared ? "Saved next to your old entry. " + mf + " can see both." : "Saved next to your old entry. Only you can see it.",
      goJournal: go("journal"),
    };
  }
  journalSave(data) {
    return NGGApi.member.journalSave(Object.assign({ visibility: "private" }, data)).then(r => { this.refresh(["jm", "mom"]); return r || {}; }).catch(e => { this.toast(mp9Err(e)); return null; });
  }
  recStart(k, upC) {
    if (this._rec) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const chunks = []; const rec = new MediaRecorder(stream); this._rec = rec; const t0 = Date.now();
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); this._rec = null; clearInterval(this._recT);
        const secs = Math.round((Date.now() - t0) / 1000);
        upC(k, { rec: "done", recSecs: secs, recUrl: "" });
        const file = new File([new Blob(chunks, { type: rec.mimeType || "audio/webm" })], "voice-note.webm", { type: rec.mimeType || "audio/webm" });
        NGGApi.uploadFile(file, "post").then(u => upC(k, { recUrl: mp9Abs(u.url) })).catch(e => { upC(k, { rec: "idle" }); this.toast(mp9Err(e) + " Write it instead."); });
      };
      rec.start(); upC(k, { rec: "rec" });
      this._recT = setInterval(() => { if (Date.now() - t0 > 120000) this.recStop(); }, 1000);
    }).catch(() => this.toast("Your phone didn’t let us use the microphone. Write it instead."));
  }
  recStop() { if (this._rec && this._rec.state !== "inactive") this._rec.stop(); }
  wellVals() {
    const s = this.state, mine = this.dd("mine") || {}, t = this.dd("today") || {}, mf = this.mentorInfo().first;
    const WQ = [["sleep", "Sleep", "ph ph-moon", ["Under 6 hours", "6–7 hours", "8 hours or more"]], ["energy", "Energy", "ph ph-lightning", ["Low", "Okay", "High"]], ["stress", "Stress", "ph ph-wave-triangle", ["A lot", "Some", "Calm"]], ["screen", "Screen time", "ph ph-device-mobile", ["4 hours or more", "2–4 hours", "Under 2 hours"]]];
    const to5 = v => [1, 3, 5][v], from5 = n => n ? (n <= 2 ? 0 : n <= 3 ? 1 : 2) : undefined;
    // stress is stored as how much (5 = a lot), the question is asked the other way round.
    const ck = mine.checkin || null;
    const wl = s.wl || (ck ? { sleep: from5(+ck.sleep), energy: from5(+ck.energy), stress: ck.stress ? (5 - ck.stress <= 1 ? 0 : 5 - ck.stress <= 2 ? 1 : 2) : undefined } : {});
    const wlOk = WQ.every(q => wl[q[0]] !== undefined);
    const saved = !s.wlEdit && !!ck && !!(+ck.sleep || +ck.energy || +ck.stress);
    const hist = (mine.checkins || []).slice(0, 4).reverse();
    const lowSleep = wl.sleep === 0 && hist.length >= 2 && from5(+hist[hist.length - 2].sleep) === 0;
    return { wl: { asking: !saved, done: saved, meta: saved ? "Saved for this week" : "Once a week", op: wlOk ? 1 : 0.4,
      qs: WQ.map(([k, l, icon, opts]) => ({ l, icon, opts: opts.map((o, v) => ({ l: o, on: wl[k] === v ? "true" : "false", bw: wl[k] === v ? "2px" : "1px", ring: wl[k] === v ? "#0b0b0c" : "#d6d4cc", go: () => this.setState({ wl: { ...wl, [k]: v } }) })) })),
      save: () => { if (!wlOk) return this.toast("Answer all four first.");
        NGGApi.member.pod.act("weekCheckin", { wellbeing: (ck && ck.wellbeing) || ((t.checkin || {}).wellbeing) || "Okay", sleep: to5(wl.sleep), energy: to5(wl.energy), stress: 6 - to5(wl.stress), note: "Screen time: " + WQ[3][3][wl.screen] })
          .then(() => { this.setState({ wlEdit: false, wl: null }); this.refresh(["mine", "today"]); }).catch(e => this.toast(mp9Err(e))); },
      redo: () => this.setState({ wlEdit: true, wl }),
      trend: WQ.slice(0, 3).map(([k, l, , opts]) => { const vals = hist.map(h => k === "stress" ? (h.stress ? (5 - h.stress <= 1 ? 0 : 5 - h.stress <= 2 ? 1 : 2) : null) : from5(+h[k])).filter(v => v !== null && v !== undefined);
        const cc = v => v === 0 ? "#e8590c" : v === 1 ? "#e0a100" : "#2f9e44"; const now = wl[k];
        return { l, dots: (vals.length ? vals : [now]).filter(v => v !== undefined).map(v => ({ c: cc(v) })), now: now !== undefined ? opts[now] : "—", fg: now === 0 ? "#b0361c" : now === 1 ? "#7a5600" : "#1d6b30" }; }),
      tip: lowSleep ? "Two weeks under 6 hours of sleep. " + mf + " will check in, and here’s one thing to try: screens off 30 minutes before bed." : wl.stress === 0 ? "A lot of stress this week. Talking helps; you can message " + mf + " or tap Get help any time." : "Thanks. Small habits add up: sleep, water, a walk, and time away from screens.",
      tipBg: lowSleep || wl.stress === 0 ? "#fdf6e3" : "#f3faf4", tipFg: lowSleep || wl.stress === 0 ? "#5c4100" : "#14501f" } };
  }
  qlineVals() {
    const s = this.state;
    const MOODS = [["Great", 5], ["Good", 4], ["Okay", 3], ["Low", 2]];
    return {
      qMoods: MOODS.map(([m]) => ({ m, on: s.qMood === m ? "true" : "false", bg: s.qMood === m ? "#0b0b0c" : "#fff", fg: s.qMood === m ? "#fff" : "#0b0b0c", pick: () => this.setState({ qMood: s.qMood === m ? null : m }) })),
      qText: s.qText, onQText: e => this.setState({ qText: e.target.value }), qCant: !s.qText.trim(), qOp: s.qText.trim() ? 1 : 0.4,
      qSave: () => { const t = s.qText.trim(); if (!t) return; const mood = (MOODS.find(x => x[0] === s.qMood) || [0, 0])[1];
        this.journalSave({ body: t, mood, visibility: "mentor", tags: "line" }).then(r => { if (r) { this.setState({ qSaved: [{ t, m: s.qMood || "" }].concat(s.qSaved), qText: "", qMood: null }); this.toast("Saved to your journal. Your mentor can see it."); } }); },
      qLast: s.qSaved[0] ? "Saved: “" + s.qSaved[0].t + "”" + (s.qSaved[0].m ? " · " + s.qSaved[0].m : "") : "", qHasLast: !!s.qSaved[0],
    };
  }
  journeyVals() {
    const cg = this.dd("courage") || {}, c = cg.courage || {}, ladderL = (cg.ladder || []).map(r => r.label);
    const now = c.current || 0;
    const mine = this.dd("mine") || {}, d = this.dd("dash") || {}, stats = d.stats || {}, mom = (this.dd("mom") || {}).momentum || {};
    const last = (c.marks || [])[0] || null;
    const goal = mine.goal;
    const prog = goal ? goal.progress || 0 : 0;
    const MS = ["Getting started", "First steps taken", "Halfway there", "Nearly there", "Done"];
    const sc = mine.mentorScores || [];
    const LI = (mine.skills || []).map(x => typeof x === "string" ? x : Array.isArray(x) ? String(x[0] || "") : x.label || x.name || "");
    const indicators = LI.map((k, i) => {
      const o = sc.slice().reverse().map(r => Math.min(3, Math.round((r.scores[i] || 0) / 10 * 3)));
      const first = o[0], lastV = o[o.length - 1];
      const trend = o.length < 2 ? "Steady" : lastV > first ? "Growing" : lastV <= 1 ? "Focus area" : "Steady";
      const words = ["Not yet seen", "Emerging", "Demonstrated", "Strong"];
      return { k, now: o.length ? words[lastV] : "Not scored yet", note: "", hasNote: false, trend, tbg: trend === "Growing" ? "#e9f6ec" : trend === "Focus area" ? "#fdf6e3" : "#f4f4f3", tfg: trend === "Growing" ? "#1d6b30" : trend === "Focus area" ? "#7a5600" : "#4a4a50",
        cols: (o.length ? o : [0]).map(v => ({ cells: [3, 2, 1].map(l => ({ bg: v >= l ? (trend === "Focus area" ? "#e0a100" : "#0b0b0c") : "#e6e5e0" })) })) };
    });
    const growing = indicators.filter(i => i.trend === "Growing").map(i => i.k);
    const notes = ((this.dd("notifs") || {}).notifications || []).slice(0, 6);
    const badges = (stats.badges || []).map(b => (stats.badgeLabels || {})[b] || b);
    return {
      ladder: ladderL.map((l, i) => ({ n: i + 1, l, on: i + 1 === now, bg: i + 1 <= now ? "#0b0b0c" : "#e6e5e0", nfg: i + 1 <= now ? "#fff" : "#4a4a50", fg: i + 1 === now ? "#0b0b0c" : "#6b6b72", fw: i + 1 === now ? 600 : 400 })).reverse(),
      courage: { by: last ? (last.by || last.byName || "your mentor") : "your mentor", date: last ? mp9Date(last.observedOn) : "not yet", label: c.rung ? c.rung.label : "Not observed yet",
        note: last ? (last.evidence || "") : "Your mentor adds to this when they see you do something difficult, own a mistake or stand up for someone." },
      courageHist: (c.marks || []).slice(0, 8).reverse().map(m => ({ h: (m.score / 5 * 100) + "%" })),
      tally: { rank: mom.levelName || "Seedling", level: stats.level || mom.level || 1, next: mom.xpToNext ? mom.xpToNext + " XP to the next level" : "Keep going", xp: 0, xpW: "0%", streak: stats.streak || 0, badges: stats.badgeCount || badges.length, best: badges[0] || "–" },
      goal: goal ? { t: goal.goal, why: goal.outcome || (goal.area ? "Area: " + goal.area : "") } : { t: "No goal agreed yet", why: "You’ll set one with " + this.mentorInfo().first + " at a one-to-one." },
      milestones: goal ? MS.map((t, i) => { const st = i + 1 <= prog ? "Done" : i + 1 === prog + 1 ? "Now" : "Later";
        return { t, s: st, ev: "", hasEv: false, bar: st === "Done" ? "#1d6b30" : st === "Now" ? "#f5b026" : "#e6e5e0", dot: st === "Done" ? "#1d6b30" : st === "Now" ? "#f5b026" : "#d6d4cc", icon: st === "Done" ? "ph-fill ph-check-circle" : st === "Now" ? "ph-fill ph-circle-half" : "ph ph-circle", fg: st === "Done" ? "#1d6b30" : st === "Now" ? "#7a5600" : "#8a8a90", tag: st === "Now" ? "Working on it" : st === "Done" ? "Done" : "", hasTag: st !== "Later" }; }) : [],
      indicators, growingText: growing.length ? growing.join(", ") : "nothing yet, which is normal early on",
      trail: notes.length ? notes.map(n => ({ icon: "ph ph-" + (/mentor/.test(n.kind) ? "chat-circle-text" : /badge|award/.test(n.kind) ? "medal" : "bell"), t: n.title, when: mp9When(n.createdAt) })) : [{ icon: "ph ph-path", t: "Your trail starts with your first mission or journal entry", when: "" }],
      shortcuts: [["ph ph-notebook", "Anchor Journal", "Daily reflection · install it as an app", "/journal/", "_blank"], ["ph ph-book-bookmark", "Anchor", "The twelve-week programme", "/anchor", "_self"],
        ["ph ph-images", "Media", "Photos and videos from NGG", "/media", "_self"], ["ph ph-article", "Blog", "Stories from the centres", "/blog", "_self"]].map(([icon, t, d0, href, target]) => ({ icon, t, d: d0, href, target })),
    };
  }
  momentumVals() {
    const m = (this.dd("mom") || {}).momentum || {}, jm = this.dd("jm") || {};
    const days = {};
    const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); const mondayIso = monday.toISOString().slice(0, 10);
    (jm.timeline || jm.entries || []).forEach(e => { if (e && e.occurredOn >= mondayIso) days[(new Date(e.occurredOn + "T12:00:00Z").getUTCDay() + 6) % 7] = true; });
    return { momentum: { streak: m.streak || 0, best: m.longestStreak || 0, nudge: (m.nudges && m.nudges[0] && m.nudges[0].text) || "One journal entry before Saturday keeps your streak going." },
      streakDays: MP9_DAYS.map((l, i) => ({ l, bg: days[i] ? "#0b0b0c" : "#e6e5e0", fg: days[i] ? "#f5b026" : "#8a8a90" })) };
  }
  subTabs(key, defs) {
    const cur = this.state[key] || defs[0][0], o = { tabs: defs.map(([k, l, icon]) => ({ l, icon, on: cur === k ? "true" : "false", bg: cur === k ? "#fff" : "transparent", sh: cur === k ? "0 1px 2px rgba(11,11,12,.12)" : "none", fw: cur === k ? 700 : 500, go: () => this.setState({ [key]: k }) })) };
    defs.forEach(([k]) => { o[k] = cur === k; }); return o;
  }

  /* ── Standing, network, session ─────────────────────────────────────── */
  standingVals(go) {
    const t = this.dd("today") || {}, st = t.standing, s = this.state;
    const k = st ? st.state : "clear";
    if (k === "clear" || ((k === "warned" || k === "dormant") && !["today", "records", "sat"].includes(s.scr))) return { on: false };
    if (!this._tick) this._tick = setInterval(() => this.setState({ tick: Date.now() }), 1000);
    const now = Date.now(), satIso = this.satDate();
    const nextSat = satIso ? new Date(satIso + "T" + (st.lateRedline || "08:30") + ":00+01:00").getTime() : now;
    const until = st.until ? new Date(st.until.length === 10 ? st.until + "T23:59:00+01:00" : st.until).getTime() : now;
    const fmt = (ms, secs) => { ms = Math.max(0, ms); const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), sc = Math.floor(ms % 6e4 / 1e3); const p = n => String(n).padStart(2, "0"); return (d ? d + "d " : "") + p(h) + "h " + p(m) + "m" + (secs ? " " + p(sc) + "s" : ""); };
    const dayL = ms => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const capA = st.absenceLimit || 3, capL = st.latenessCap || 3;
    const T = {
      warned: { tag: "WARNING", icon: "ph-fill ph-warning", bg: "#fdf6e3", bd: "#f1e3b8", fg: "#5c4100", title: "One more absence puts you on the Dormant Track", body: (st.reason || "You missed a Saturday without telling us.") + " Be at the centre by " + (st.lateRedline || "08:30") + " this Saturday, or tell us before Friday 6pm if you can’t come.", cdL: "Next check-in closes in", cd: fmt(nextSat - now), cdS: dayL(nextSat) + ", " + (st.lateRedline || "08:30"), lv: 1 },
      dormant: { tag: "DORMANT TRACK", icon: "ph-fill ph-pause-circle", bg: "#fff1e6", bd: "#f7cfae", fg: "#7a3200", title: "You’re on the Dormant Track", body: (st.reason || "Absences this term.") + " Awards and leadership roles are paused. Come on time for the next Saturdays to clear it.", cdL: "Next Saturday starts in", cd: fmt(nextSat - now), cdS: dayL(nextSat), lv: 2 },
      suspended: { tag: "SUSPENDED", icon: "ph-fill ph-prohibit", bg: "#fdeeea", bd: "#f3cfc5", fg: "#7a2410", title: "Suspended", body: (st.reason || "After repeated late arrivals.") + " You can’t check in or join sessions until the suspension ends. Finish the steps below so you’re ready to come straight back.", cdL: "Suspension ends in", cd: fmt(until - now, true), cdS: dayL(until), lv: 2, role: "alert" },
      evicted: { tag: "PLACE WITHDRAWN", icon: "ph-fill ph-x-circle", bg: "#0b0b0c", bd: "#2b2b30", fg: "#ffffff", title: "Your place was withdrawn", body: (st.reason || "After repeated absences.") + " You can ask the Governing Council to reinstate you. Your mentor and family have been told, and your records are kept.", cdL: "Review request open until", cd: st.until ? mp9Date(st.until, { day: "numeric", month: "long" }) : "–", cdS: "Then the place is offered to the waiting list", lv: 3, role: "alert" },
    }[k] || null;
    if (!T) return { on: false };
    const susp = k === "suspended", ev = k === "evicted";
    const pips = (n, max, col) => Array.from({ length: max }, (_, i) => ({ bg: i < n ? col : "#e6e5e0" }));
    const raise = (kind, subject) => () => this.go("records", { rKind: kind === "appeal" ? "Appeal a charge" : "I'll be away", rF: { subject } });
    return { on: true, role: T.role || "status", tag: T.tag, icon: T.icon, bg: T.bg, bd: T.bd, fg: T.fg, title: T.title, body: T.body, cdL: T.cdL, cd: T.cd, cdS: T.cdS,
      open: !!s.stOpen || susp, openA: s.stOpen || susp ? "true" : "false", chev: s.stOpen || susp ? "ph ph-caret-up" : "ph ph-caret-down", toggleL: s.stOpen || susp ? "Hide details" : "What this means and what to do", toggle: () => this.setState({ stOpen: !(s.stOpen || susp) }),
      ladder: ["Clear", "Warning", susp ? "Suspended" : "Dormant", "Place withdrawn"].map((l, i) => ({ l, cur: i === T.lv ? "step" : undefined, bar: i < T.lv ? "#e0a100" : i === T.lv ? (i >= 2 ? "#b0361c" : "#e0a100") : "#e6e5e0", fw: i === T.lv ? 700 : 500, fg: i === T.lv ? "#0b0b0c" : "#6b6b72" })),
      counts: [["Absences this term", (st.absences || 0) + " of " + capA, pips(st.absences || 0, capA, (st.absences || 0) >= capA - 1 ? "#b0361c" : "#e0a100"), capA + " means losing your place"],
               ["Late arrivals (after " + (st.lateRedline || "08:30") + ")", (st.lates || 0) + " of " + capL, pips(st.lates || 0, capL, (st.lates || 0) >= capL ? "#b0361c" : "#e0a100"), capL + " means a suspension"]]
        .concat(st.finesOwed ? [["Fines owed", mp9Naira(st.finesOwed), pips(1, 1, "#b0361c"), "Pay, or appeal from Records"]] : []).map(([k2, v, p, s2]) => ({ k: k2, v, pips: p, s: s2 })),
      hasCan: susp, can: ["Read lessons and do assignments", "Write in your journal", "Message your mentor"], cant: ["Check in at the centre", "Join Saturday sessions", "Earn points or awards"],
      stepsH: ev ? "To ask for reinstatement" : susp ? "To come back on time" : "To clear this",
      steps: (ev ? [["ph ph-file-text", "Write to the Governing Council", "Say what happened and what will change. Your mentor can help.", "Start", raise("appeal", "Reinstatement")], ["ph ph-users", "Family meeting", "The coordinator will call your parents to book it.", "", null]]
        : susp ? [].concat(st.finesOwed ? [["ph-fill ph-warning-circle", "Pay the " + mp9Naira(st.finesOwed) + " fine", "Or appeal it if you think it’s wrong", "Pay", go("money")]] : []).concat([["ph ph-handshake", "Talk to your mentor", "Make a plan to arrive on time", "Message", go("mentor")], ["ph ph-alarm", "Set a Saturday alarm", "We also send a reminder Friday evening and Saturday morning", "", null]])
        : [["ph ph-map-pin", "Be at the centre by " + (st.lateRedline || "08:30") + " Saturday", "Reminders go out Friday evening and Saturday morning", "", null], ["ph ph-calendar-x", "Can’t come? Tell us before Friday 6pm", "An excused absence doesn’t count", "Tell us", raise("leave", "")], ["ph ph-handshake", "Talk to your mentor", "If something is making Saturdays hard, they can help", "Message", go("mentor")]])
        .map(([icon, t2, s2, goL, fn]) => ({ icon, t: t2, s: s2, goL, go: fn, hasGo: !!fn, fg: icon.includes("warning") ? "#b0361c" : "#4a4a50" })),
      appeal: raise("appeal", "Review my standing") };
  }
  sysVals() {
    const s = this.state, net = s.net || (typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online");
    const anyNetErr = Object.values(s.er).some(e => e && (e.code === "network" || e.message === "network"));
    const N = net === "offline" ? ["ph ph-wifi-slash", "#fdeeea", "#f3cfc5", "#7a2410", "You’re offline. What you write stays on this page and sends when you’re back."]
      : anyNetErr ? ["ph ph-wifi-medium", "#fdf6e3", "#f1e3b8", "#5c4100", "Weak signal. Some parts didn’t load; nothing you saved is lost."] : null;
    return { netBar: !!N, icon: N ? N[0] : "", bg: N ? N[1] : "", bd: N ? N[2] : "", fg: N ? N[3] : "", t: N ? N[4] : "",
      retry: () => { if (typeof navigator !== "undefined" && navigator.onLine === false) return this.toast("Still offline. We’ll keep trying."); this.setState({ net: "online", er: {} }); Object.keys(this.state.d).concat(MP9_CORE).forEach(k => this.load(k)); this.toast("Connected. Everything is up to date."); },
      sessOn: false, stay: () => {}, signOut: () => {} };
  }
}

/* The address of every screen, under /dashboard. */
const MP9_PATHS = { today: "", mentor: "mentor", growth: "growth", results: "results", companion: "companion", sat: "saturday", journal: "journal", opps: "opportunities",
  community: "community", passport: "passport", help: "help", more: "more", learn: "learn", timetable: "timetable", me: "me", money: "account", records: "records" };
function mp9ScreenFromPath() {
  const seg = (typeof location !== "undefined" ? location.pathname : "").replace(/^\/+|\/+$/g, "").split("/");
  if (seg[0] !== "dashboard" || !seg[1]) return "today";
  const old = { learning: "learn", requests: "records" };
  const hit = Object.keys(MP9_PATHS).find(k => MP9_PATHS[k] === seg[1]);
  return hit || old[seg[1]] || "today";
}
function mp9Abs(u) { if (!u) return ""; if (/^https?:\/\//i.test(u) || /^data:/i.test(u)) return u; try { return new URL(u, location.origin).href; } catch (_) { return u; } }
