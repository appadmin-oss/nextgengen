/* ============================================================================
   Summer School portal v3 — the controller for /summer-admin.

   The screens are the design, compiled (ss3-view.jsx from
   docs/design/portals/summer-school-portal-v3.dc.html, with the sample copy
   rebound by ss3-subs.json). This class is the design's logic (its
   `class Component`) ported onto live data: every figure comes from
   domain/summer-portal.php or an existing op, every act writes through one,
   and what the server refuses is said in words.

   Rules kept from the design:
     · ⌘K / Ctrl K / "/" opens the palette; "?" the shortcut list; "g" then a
       letter jumps (t today, d desk, r register, p participants, n Into NGG);
       "z" undoes the last bulk act while its toast is up; Esc closes the
       top-most layer.
     · A bulk act that reaches people (alerting guardians, moving children into
       NGG, sending joining invoices) is PARKED on the server for its undo
       window (domain/pending.php). Undo cancels it there, so nothing was sent;
       when the window closes it is committed, and if this tab is gone by then
       the next portal read or the webcron commits it instead.
     · The section is in the URL (/summer-admin?s=…), so a refresh or a shared
       link opens the same screen.

   Sections with no backend yet (timetable, Demo Day, pickup, volunteers) are
   not offered at all, rather than drawn on sample data — a screen that cannot
   act does not appear.
   ========================================================================== */

const SS3_UNDO_S = 8;
const SS3_SECTIONS = ["today", "participants", "registrations", "groups", "register", "desk", "incidents", "consent", "messages", "cards", "editions", "tongg", "more"];
const SS3_NAV = [
  [null, [["today", "Today", "sun-horizon"]]],
  ["Children", [["participants", "Participants", "users"], ["registrations", "Registrations", "envelope-simple-open"], ["groups", "Groups", "squares-four"]]],
  ["Attendance", [["register", "Register", "list-checks"], ["desk", "Check-in desk", "scan"]]],
  ["Safety", [["incidents", "Incidents", "first-aid-kit"], ["consent", "Consent", "shield-check"]]],
  ["Families", [["messages", "Messages", "chat-circle-text"]]],
  ["Season", [["cards", "Cards & QR", "qr-code"], ["editions", "Editions & certificates", "certificate"], ["tongg", "Into NGG", "arrow-fat-lines-right"]]],
];
const SS3_TABS = [["today", "Today", "sun-horizon"], ["desk", "Desk", "scan"], ["register", "Register", "list-checks"], ["participants", "Children", "users"], ["more", "More", "dots-three-circle"]];
const SS3_GO = { t: "today", d: "desk", r: "register", p: "participants", i: "incidents", m: "messages", n: "tongg" };
const SS3_INC_SEV = { low: ["Low", "neutral"], med: ["Medium", "warn"], high: ["High", "bad"] };
const SS3_CH = [["email", "Email"], ["sms", "SMS"], ["both", "SMS + email"]];
const SS3_T = { ok: ["#e8f5ec", "#17663a", "#22a05a"], warn: ["#fdf2d8", "#7a5600", "#e0a100"], bad: ["#fdeaea", "#a12a2a", "#d94141"], neutral: ["#f0f0ef", "#48484e", "#9a9aa0"], ink: ["#0b0b0c", "#fff", "#0b0b0c"] };
const SS3_TONES = ["#f3d9a4", "#bcd9c3", "#d9dcf0", "#ead6ef", "#cfe3d3", "#d4e6ea", "#f0dccb", "#f0d4d4", "#e3dccf"];
const SS3_VIEWS = [["all", "Everyone"], ["in", "In today"], ["absent", "Not in"], ["stopped", "Stopped coming"], ["risk", "Under 50%"], ["nogroup", "No group"], ["unverified", "Not confirmed"], ["consent", "Consent missing"]];
const SS3_FACETS = [["centre", "Centre"], ["group", "Group"], ["track", "Track"], ["today", "Today"]];
const SS3_TODAY_L = { in: "In", late: "Late", out: "Signed out", absent: "Not in", off: "Not expected" };
const SS3_REG_TABS = [["parent_pending", "Waiting for guardian"], ["self_pending", "Signed up themselves"], ["verified", "Confirmed"]];
const SS3_GRAD_TABS = [["ready", "Ready to move"], ["promoted", "Moved · invoice not sent"], ["invoiced", "Invoice sent"], ["paid", "Paid"], ["all", "All"]];

function ss3Fmt(n) { return Number(n || 0).toLocaleString("en"); }
function ss3Ini(n) { return String(n || "").split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
function ss3Tone(id) { let h = 7; const s = String(id || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return SS3_TONES[h % SS3_TONES.length]; }
function ss3M(t) { const p = String(t || "").split(":"); return p.length < 2 ? NaN : (+p[0]) * 60 + (+p[1]); }
function ss3HM(x) { return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); }
/* A YYYY-MM-DD as "Mon 12 Aug". Built from the parts so a time zone cannot move the day. */
function ss3Day(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || "")); if (!m) return String(d || "");
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()] + " " + (+m[3]) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1];
}
function ss3Err(e, fallback) {
  if (!e) return fallback || "Something went wrong.";
  if (e.detail) return e.detail;
  if (e.data && e.data.detail) return e.data.detail;
  if (e.message && / /.test(e.message)) return e.message;
  const c = e.code || e.error || e.message || "";
  return (typeof humanizeError === "function" ? humanizeError(c, c) : "") || fallback || c || "Something went wrong.";
}
function ss3SecFromUrl() {
  try { const s = new URLSearchParams(window.location.search).get("s") || ""; return SS3_SECTIONS.indexOf(s) !== -1 ? s : ""; } catch (e) { return ""; }
}
function ss3Pill(t) {
  return t === "in" ? SS3_T.ok : t === "late" ? SS3_T.warn : t === "absent" ? SS3_T.bad : SS3_T.neutral;
}

class Ss3Portal extends React.Component {
  constructor(props) {
    super(props);
    this.rootRef = React.createRef();
    this.palRef = React.createRef();
    this.state = {
      boot: null, bootErr: "", sec: ss3SecFromUrl() || "today", w: 1280,
      data: {}, err: {}, busy: false,
      pview: "all", pq: "", f: {}, page: 0,
      day: "", rf: "absent",
      incForm: false, incDraft: {}, incKind: "all", msgTpl: "", msgAud: "absent", msgCh: "email", msgDetails: "",
      regTab: "parent_pending", resent: {},
      ngTab: "ready", ngQ: "", ngPage: 0, ngSel: {}, ngC: {}, ngStart: 0,
      deskMode: "in", deskQ: "", deskRes: null,
      cardQ: "",
      modal: null, mRes: null, placeTo: "", walk: {}, mintN: "50", placeIds: null,
      pal: false, palQ: "", palI: 0, palKids: [], recent: [],
      help: false, toast: "", toastUndo: false, undoLeft: 0,
      sel: null, child: null, childErr: "", paper: null, ins: null, insBusy: false,
    };
  }

  /* ── lifecycle ─────────────────────────────────────────────────────── */
  componentDidMount() {
    const el = this.rootRef.current;
    this.measure = () => { const r = this.rootRef.current; const w = Math.round((r && r.getBoundingClientRect().width) || window.innerWidth); if (w && Math.abs(w - this.state.w) > 8) this.setState({ w }); };
    if (typeof ResizeObserver === "function") { this.ro = new ResizeObserver(this.measure); if (el) this.ro.observe(el); }
    window.addEventListener("resize", this.measure); this.measure();
    this.onKey = e => {
      const t = e.target, typing = t && /INPUT|TEXTAREA|SELECT/.test(t.tagName || "");
      /* The portal's own palette. The site-wide one (command.jsx) listens on
         window for the same keys; this listener is on document and runs first,
         so stopping it here keeps one palette, not two fighting for the keys. */
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); e.stopPropagation(); return this.openPal(); }
      if (e.key === "Escape") {
        const S = this.state;
        if (S.pal) return this.setState({ pal: false });
        if (S.help) return this.setState({ help: false });
        if (S.paper) return;   // the consent recorder has its own Escape
        if (S.modal) return this.setState({ modal: null, mRes: null });
        if (S.sel) return this.closeSel();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); e.stopPropagation(); return this.openPal(); }
      if (e.key === "?") return this.setState({ help: true });
      if (this.gPend) { this.gPend = false; const m = SS3_GO[e.key]; if (m) { e.preventDefault(); return this.go(m); } }
      if (e.key === "g") { this.gPend = true; clearTimeout(this.gT); this.gT = setTimeout(() => { this.gPend = false; }, 900); return; }
      if ((e.key === "z" || e.key === "Z") && this.state.toastUndo) return this.doUndo();
    };
    document.addEventListener("keydown", this.onKey);
    this.onPop = () => { const s = ss3SecFromUrl() || "today"; if (s !== this.state.sec) { this.setState({ sec: s }); this.loadFor(s); } };
    window.addEventListener("popstate", this.onPop);
    this.boot();
  }
  componentWillUnmount() {
    this.ro && this.ro.disconnect();
    window.removeEventListener("resize", this.measure); document.removeEventListener("keydown", this.onKey);
    window.removeEventListener("popstate", this.onPop);
    clearTimeout(this.tt); clearInterval(this.ut); clearTimeout(this.gT); clearTimeout(this.palT); clearTimeout(this.pqT); clearTimeout(this.cardT);
    /* A parked act is NOT flushed here: the server commits it when its window
       closes (any portal read, or the webcron), which is the whole point of
       parking it there rather than in this tab. */
  }

  /* ── data ──────────────────────────────────────────────────────────── */
  S() { return NGGApi.admin.summer; }
  boot() {
    this.setState({ bootErr: "" });
    this.S().portal("boot").then(b => {
      this.setState({ boot: b }, () => this.loadFor(this.state.sec));
    }).catch(e => this.setState({ bootErr: ss3Err(e, "Couldn’t open the Summer School portal.") }));
  }
  /* One loader per screen; each keeps its own error so one failure never blanks another screen. */
  load(key, p) {
    this.setState(s => ({ err: Object.assign({}, s.err, { [key]: "" }) }));
    return p.then(r => {
      // A portal read carries the shell's figures too; keep them current.
      const patch = { data: Object.assign({}, this.state.data, { [key]: r }) };
      if (r && r.badges && this.state.boot) patch.boot = Object.assign({}, this.state.boot, { badges: r.badges, edition: r.edition || this.state.boot.edition, rules: r.rules || this.state.boot.rules });
      this.setState(patch);
      return r;
    }).catch(e => { this.setState(s => ({ err: Object.assign({}, s.err, { [key]: ss3Err(e) }) })); });
  }
  peopleOpts(extra) {
    const S = this.state, o = { pview: S.pview, q: S.pq, page: S.page };
    SS3_FACETS.forEach(([k]) => { if (S.f[k]) o["f_" + k] = S.f[k]; });
    return Object.assign(o, extra || {});
  }
  loadFor(sec) {
    if (!this.state.boot) return;
    const S = this.state, P = (part, o) => this.S().portal(part, o);
    if (sec === "today") this.load("today", P("today"));
    else if (sec === "participants") this.load("people", P("people", this.peopleOpts()));
    else if (sec === "groups") { this.load("today", P("today")); }
    else if (sec === "register") this.load("register", P("register", { date: S.day, rf: S.rf }));
    else if (sec === "consent") this.load("consent", P("consent"));
    else if (sec === "cards") this.load("cards", P("cards", { q: S.cardQ.trim() }));
    else if (sec === "desk") this.load("desk", P("desk"));
    else if (sec === "incidents") this.load("incidents", P("incidents"));
    else if (sec === "messages") this.load("messages", P("messages"));
    else if (sec === "registrations") this.load("regs", NGGApi.admin.registration.list({ status: S.regTab, pageSize: 50 }));
    else if (sec === "editions") this.load("editions", this.S().editions());
    else if (sec === "tongg") this.load("grads", NGGApi.admin.club.graduates({ stage: S.ngTab, q: S.ngQ.trim(), page: S.ngPage }));
  }
  reload() { this.loadFor(this.state.sec); }

  /* ── shell helpers ─────────────────────────────────────────────────── */
  go(sec, extra) {
    if (SS3_SECTIONS.indexOf(sec) === -1) sec = "today";
    this.setState(Object.assign({ sec, pal: false, help: false, modal: null, mRes: null, deskRes: null }, extra || {}), () => this.loadFor(sec));
    try { const u = new URL(window.location.href); if (sec === "today") u.searchParams.delete("s"); else u.searchParams.set("s", sec); window.history.pushState({}, "", u.pathname + u.search); } catch (e) {}
    const m = this.rootRef.current && this.rootRef.current.querySelector("main"); if (m) m.scrollTop = 0;
  }
  toast(t) {
    clearTimeout(this.tt); clearInterval(this.ut);
    this.undoFn = null;
    this.setState({ toast: t, toastUndo: false, undoLeft: 0 });
    this.tt = setTimeout(() => this.setState({ toast: "" }), 4200);
  }
  fail(e, fallback) { this.toast(ss3Err(e, fallback)); }
  /* A bulk act that reaches people. `call(defer)` asks the server to park it
     for SS3_UNDO_S seconds; the toast counts the window down, Undo cancels it
     on the server, and at zero it is committed and `done(result)` reports what
     actually happened — per row, not a top-level ok. */
  parked(label, call, done) {
    this.setState({ busy: true });
    call(SS3_UNDO_S).then(r => {
      this.setState({ busy: false });
      if (!r || !r.deferred || !r.pendingId) { done(r); return; }
      const id = r.pendingId;
      clearTimeout(this.tt); clearInterval(this.ut);
      this.undoFn = () => this.S().pendingCancel(id)
        .then(() => this.toast("Undone. Nothing was sent."))
        .catch(e => this.fail(e, "Too late to undo — that has already gone."));
      this.setState({ toast: label, toastUndo: true, undoLeft: SS3_UNDO_S });
      this.ut = setInterval(() => {
        const n = this.state.undoLeft - 1;
        if (n > 0) return this.setState({ undoLeft: n });
        clearInterval(this.ut); this.undoFn = null;
        this.setState({ toastUndo: false, undoLeft: 0, toast: "Sending…" });
        // A second of slack: the server refuses a flush that is not yet due.
        setTimeout(() => this.S().pendingFlush(id).then(x => {
          if (x && x.status === "cancelled") return this.toast("Undone. Nothing was sent.");
          done((x && x.result) || x);
        }).catch(e => this.fail(e, "It will still go through — the portal finishes it on its next read.")), 1100);
      }, 1000);
    }).catch(e => { this.setState({ busy: false }); this.fail(e); });
  }
  /* A destructive or irreversible act asks first, in the portal's own dialog
     (never the browser’s native confirm box). `go` returns a promise of the toast. */
  ask(title, body, goL, go) { this.setState({ modal: "confirm", mRes: null, confirm: { title, body, goL, go } }); }
  doUndo() {
    const u = this.undoFn; this.undoFn = null; clearInterval(this.ut);
    this.setState({ toastUndo: false, undoLeft: 0, toast: "Undoing…" });
    if (u) u();
  }
  openPal() {
    if (this.state.pal && this.palRef.current) this.palRef.current.focus();   // already open: back to the search
    this.setState({ pal: true, palQ: "", palI: 0, palKids: [], help: false });
    this.S().recent().then(r => this.setState({ recent: r.children || [] })).catch(() => {});
  }
  /* Focus the search the moment the palette is committed, not on a 30 ms timer: "/" then a name
     typed straight after lost its first letters to whatever had focus in between. */
  componentDidUpdate(_, prev) {
    if (this.state.pal && !prev.pal && this.palRef.current) this.palRef.current.focus();
  }
  onPalQ(q) {
    this.setState({ palQ: q, palI: 0 });
    clearTimeout(this.palT);
    if (q.trim().length < 2) return this.setState({ palKids: [] });
    this.palT = setTimeout(() => this.S().search(q.trim()).then(r => { if (this.state.palQ === q) this.setState({ palKids: r.children || [] }); }).catch(() => {}), 200);
  }
  openChild(id) {
    this.lastFocus = document.activeElement;
    this.setState({ sel: id, child: null, childErr: "", pal: false });
    this.S().portal("child", { studentId: id }).then(r => {
      if (this.state.sel !== id) return;
      if (!r.child) return this.setState({ childErr: "That child isn’t in your centres, or no longer exists." });
      this.setState({ child: r.child });
    }).catch(e => this.setState({ childErr: ss3Err(e) }));
  }
  closeSel() {
    this.setState({ sel: null, child: null });
    const f = this.lastFocus; this.lastFocus = null;
    if (f && f.focus) setTimeout(() => { try { f.focus(); } catch (e) {} }, 0);
  }
  setPeople(patch) { this.setState(Object.assign({ page: 0 }, patch), () => this.load("people", this.S().portal("people", this.peopleOpts()))); }

  /* ── values for the view ──────────────────────────────────────────── */
  renderVals() {
    const S = this.state, B = S.boot, T = SS3_T, f = ss3Fmt;
    const W = S.w, wide = W >= 960, narrow = !wide, phone = W < 640;
    const sec = S.sec, ed = B.edition, bd = B.badges || {}, rules = B.rules || {};
    const caps = B.caps || [];
    const badge = {
      incidents: [bd.incidents, T.bad[2], "#fff"],
      participants: [bd.stopped, T.bad[2], "#fff"], registrations: [bd.regOpen, "#f5b026", "#2a1d00"],
      groups: [bd.noGroup, "#f5b026", "#2a1d00"], consent: [bd.consent, T.bad[2], "#fff"], cards: [bd.cardsLow ? 1 : 0, "#f5b026", "#2a1d00"],
    };
    const mk = (n, on) => { const b = badge[n[0]]; return { label: n[1], icon: "ph ph-" + n[2], cur: on ? "page" : undefined, bg: on ? "#ebebe9" : "transparent", fw: on ? 600 : 400, ic: on ? "#0b0b0c" : "#5d5d63", hasBadge: !!(b && b[0]), badge: b ? b[0] : 0, bb: b ? b[1] : "", bf: b ? b[2] : "", onClick: () => this.go(n[0]) }; };
    const flatNav = SS3_NAV.reduce((a, g) => a.concat(g[1]), []);
    const isTab = SS3_TABS.some(t => t[0] === sec);
    const moreList = flatNav.filter(n => !SS3_TABS.some(t => t[0] === n[0]));
    const moreN = moreList.reduce((a, n) => a + ((badge[n[0]] || [0])[0] || 0), 0);
    const edName = ed ? ed.name + (ed.status === "closed" ? " · closed" : ed.status === "archived" ? " · archived" : "") : "No edition yet";
    const dayL = ed ? (ed.status !== "active" ? "Check-ins have stopped" : "Day " + ed.dayN + " of " + ed.days + (ed.endDate ? " · ends " + ss3Day(ed.endDate) : "")) : "Set one up in Editions";
    const META = {
      today: ["Today", (ed && ed.isDay ? ss3Day(B.today) + " · day " + ed.dayN + " of " + ed.days + ". " : ss3Day(B.today) + " · not a programme day. ") + "Who’s in, who isn’t, and what to do about it."],
      participants: ["Participants", "Every child in " + (ed ? ed.name : "the season") + ". Filters combine, and each count shows how many match."],
      registrations: ["Registrations", "Families who signed up but haven’t confirmed yet. Nobody gets a card until they do."],
      groups: ["Groups", "A class within the season: one centre, one track, one lead, its own seats."],
      register: ["Register", "One day, by name: who came in, who came late, and who didn’t come."],
      desk: ["Check-in desk", "Check a child in or out by card code, printed ID or name. Lateness is graded by the same rules as the kiosk."],
      incidents: ["Incidents", "First aid, health, behaviour, pickups and lost items. A safeguarding report goes straight to the safeguarding lead, who alone sees it."],
      messages: ["Messages", "Send guardians an email or text from a template. Every send shows how many it reached."],
      consent: ["Consent", "What each guardian agreed to. Some consents must be given, some must only be answered."],
      cards: ["Cards & QR", "Cards are printed blank before anyone enrols. A card is linked to a child when they enrol."],
      editions: ["Editions & certificates", "A season from start to end: close it, issue certificates, archive it, and pass graduates on to the Club."],
      tongg: ["Into NGG", "Children who finished Summer School, moved into an NGG centre near them. Their family gets one joining invoice; Summer School itself stays free."],
      more: ["More", "Everything else in the Summer School portal."],
    };
    const m = META[sec] || META.today;
    const me = B.me || {};
    const out = {
      rootRef: this.rootRef, wide, narrow, title: m[0], desc: m[1], h1: phone ? "24px" : "28px", hPad: phone ? "12px" : "20px",
      mPad: phone ? "18px 14px 32px" : narrow ? "24px 20px 40px" : "28px 32px 72px", searchW: phone ? "40px" : "min(280px, 28vw)",
      meName: me.name || "Staff", meIni: ss3Ini(me.name || "S"), showMe: W >= 1280,
      edName, edDot: ed && ed.status === "active" ? "#22a05a" : "#9a9aa0", edPct: ed && ed.days ? Math.min(100, Math.round(ed.dayN / ed.days * 100)) + "%" : "0%", edDay: dayL,
      navGroups: SS3_NAV.map(g => ({ h: g[0] || "", hasH: !!g[0], items: g[1].map(n => mk(n, n[0] === sec)) })),
      tabs: SS3_TABS.map(t => { const on = t[0] === sec || (t[0] === "more" && !isTab); const b = t[0] === "more" ? [moreN, "#f5b026", "#2a1d00"] : badge[t[0]]; return { label: t[1], icon: (on ? "ph-fill ph-" : "ph ph-") + t[2], cur: on ? "page" : undefined, c: on ? "#0b0b0c" : "#6b6b72", fw: on ? 600 : 500, hasBadge: !!(b && b[0]), badge: b ? b[0] : 0, bb: b ? b[1] : "", bf: b ? b[2] : "", onClick: () => this.go(t[0]) }; }),
      moreItems: moreList.map(n => mk(n, false)),
      deskWarn: false, toDesk: () => this.go("desk"),
      isToday: sec === "today", isPeople: sec === "participants", isRegs: sec === "registrations", isGroups: sec === "groups", isReg: sec === "register",
      isDesk: sec === "desk", isInc: sec === "incidents", isMsg: sec === "messages", isConsent: sec === "consent", isCards: sec === "cards", isEd: sec === "editions", isNgg: sec === "tongg", isMore: sec === "more",
      hasAct: false, stop: e => e.stopPropagation(), hasToast: !!S.toast, toast: S.toast, hasUndo: S.toastUndo, undoS: String(S.undoLeft), doUndo: () => this.doUndo(),
      toastB: narrow ? "84px" : "24px",
      openPal: () => this.openPal(), showSearchL: !phone, kbdL: /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K",
      hasHelp: S.help, closeHelp: () => this.setState({ help: false }),
      keys: [["Search or jump to", "⌘K  or  /"], ["Today", "g  t"], ["Check-in desk", "g  d"], ["Register", "g  r"], ["Participants", "g  p"], ["Incidents", "g  i"], ["Messages", "g  m"], ["Into NGG", "g  n"], ["Undo the last bulk action", "z"], ["Close a panel", "Esc"], ["This list", "?"]].map(k => ({ l: k[0], k: k[1] })),
      groupsL: "All " + f((B.groups || []).length) + " groups", stripL: "Recent programme days", lowAt: String((S.data.cards && S.data.cards.lowAt) || 15),
    };
    const act2 = { registrations: ["Enrol a walk-in", "ph ph-user-plus", () => this.setState({ modal: "walk", walk: {}, mRes: null })],
      participants: ["Enrol a walk-in", "ph ph-user-plus", () => this.setState({ modal: "walk", walk: {}, mRes: null })],
      incidents: ["Log an incident", "ph ph-plus", () => this.openIncForm()], cards: ["Mint a batch", "ph ph-plus", () => this.setState({ modal: "mint", mRes: null })] }[sec];
    if (act2) Object.assign(out, { hasAct: true, actL: act2[0], actIcon: act2[1], actClick: act2[2] });

    /* The screen's own loading and error states, in the slot above the page. */
    const key = { incidents: "incidents", messages: "messages", today: "today", participants: "people", register: "register", consent: "consent", cards: "cards", desk: "desk", registrations: "regs", editions: "editions", tongg: "grads", groups: "today" }[sec];
    const e = key && S.err[key], d = key ? S.data[key] : null;
    if (!ed && sec !== "editions" && sec !== "more") {
      out.mainSlot = <div className="ss3x-note" role="status"><b>No Summer School edition yet.</b> <span>Create one in Editions, then come back here.</span> <button type="button" className="ss3x-btn" onClick={() => this.go("editions")}>Open Editions</button></div>;
    } else if (e) {
      out.mainSlot = <div className="ss3x-note is-bad" role="alert"><b>Couldn’t load this screen.</b> <span>{e}</span> <button type="button" className="ss3x-btn" onClick={() => this.reload()}>Try again</button></div>;
    } else if (key && !d) {
      out.mainSlot = <div className="ss3x-note" role="status"><span className="ss3x-spin" aria-hidden="true"/> Loading…</div>;
    }
    if (d) this["vals_" + sec] && this["vals_" + sec](out, d);
    this.valsPalette(out, phone);
    this.valsDrawer(out, phone);
    this.valsModal(out);
    out.mainSlotEnd = S.paper ? <ConsentRecorder rows={[S.paper]} onClose={() => this.setState({ paper: null })}
      onDone={() => { this.setState({ paper: null }); this.toast(S.paper.fullName + " is confirmed. Give them a blank card at the desk."); this.reload(); }}/> : null;
    return out;
  }

  vals_today(out, d) {
    const S = this.state, T = SS3_T, f = ss3Fmt, B = S.boot, R = B.rules || {}, ed = B.edition;
    const L = d.live || { expected: 0, in: 0, late: 0, out: 0, absent: 0 };
    const exp = L.expected, here = L.in + L.late + L.out;
    /* "Right now", from the door rules rather than a timetable this programme
       has not entered: doors, the grace window, the day, sign-out. */
    const now = ss3M(R.now), doors = ss3M(R.student), grace = doors + (R.grace || 0), close = ss3M(R.closeStudent);
    const blocks = [];
    if (!isNaN(doors)) { blocks.push([doors - 60, doors, "Before doors"], [doors, grace, "Doors open"]); }
    if (!isNaN(close) && !isNaN(grace)) blocks.push([grace, close, "Programme day"], [close, close + 60, "Sign-out"]);
    const cur = ed && ed.isDay ? blocks.find(b => now >= b[0] && now < b[1]) : null;
    if (cur) {
      out.nowBlock = cur[2]; out.nowTime = ss3HM(cur[0]) + "–" + ss3HM(cur[1]);
      out.nowPct = Math.round((now - cur[0]) / Math.max(1, cur[1] - cur[0]) * 100) + "%"; out.nowLeft = (cur[1] - now) + " min left";
      const nb = blocks[blocks.indexOf(cur) + 1]; out.nextL = nb ? ss3HM(nb[0]) + " · " + nb[2] : "the day ends";
    } else {
      out.nowBlock = ed && ed.isDay ? (now < doors ? "Doors open at " + R.student : "The day is over") : "Not a programme day";
      out.nowTime = R.student ? "Doors " + R.student + (R.closeStudent ? " · sign-out " + R.closeStudent : "") : ""; out.nowPct = "0%"; out.nowLeft = "";
      out.nextL = "the desk";
    }
    out.toProg = () => this.go("desk");
    out.nowL = "Updated " + (R.now || "");
    const reg = (rf) => () => this.go("register", { day: "", rf });
    out.liveStats = [["In now", L.in + L.late, "#22a05a", "of " + f(exp) + " expected", reg("in")], ["Came late", L.late, "#e0a100", R.student ? "after " + ss3HM(ss3M(R.student) + (R.grace || 0)) : "after the grace time", reg("late")],
      ["Signed out", L.out, "#9a9aa0", "left for the day", reg("in")], ["Not in yet", L.absent, "#d94141", exp ? Math.round(L.absent / exp * 100) + "% of today" : "nobody expected", reg("absent")]]
      .map(k => ({ l: k[0], v: f(k[1]), c: k[2], s: k[3], onClick: k[4] }));
    out.liveSegs = [[L.in, "#22a05a", "In"], [L.late, "#e0a100", "Late"], [L.out, "#9a9aa0", "Signed out"], [L.absent, "#ececea", "Not in"]].map(s => ({ f: s[0], c: s[1], t: s[2] + ": " + f(s[0]) }));
    out.centreRows = (d.byCentre || []).map(c => ({ name: c.name, pct: Math.round(c.here / Math.max(1, c.of) * 100) + "%", n: f(c.here) + " / " + f(c.of), desk: c.here ? "Scanning" : "No scans yet", dc: "#6b6b72" }));
    const C = d.counts || {}, bd = B.badges || {};
    const needs = [];
    if (C.stopped) needs.push([C.stopped, "Children came, then stopped", (d.stoppedNames || []).join(", ") + ". Call before they drift away.", "bad", () => this.go("participants", { pview: "stopped", f: {}, pq: "" })]);
    if (C.consent) needs.push([C.consent, "Missing a required consent", "Medical, participation or data not given. Keep them out of class.", "bad", () => this.go("consent")]);
    if (C.risk) needs.push([C.risk, "Under " + B.riskRate + "% attendance", "Worth a call to the guardian this week", "warn", () => this.go("participants", { pview: "risk", f: {}, pq: "" })]);
    if (C.unverified) needs.push([C.unverified, "Registrations not confirmed", "Guardian hasn’t clicked the email link", "warn", () => this.go("registrations")]);
    if (C.nogroup) needs.push([C.nogroup, "Children with no group", "No lead is counting them", "warn", () => this.go("groups")]);
    if (bd.cardsLow) needs.push([bd.blank, "Blank cards left in stock", "Walk-ins will be turned away when they run out", "warn", () => this.go("cards")]);
    if (bd.incidents) needs.push([bd.incidents, "Incident, guardian not told yet", "Tell them before pick-up", "bad", () => this.go("incidents")]);
    out.needs = needs.length ? needs.map(r => ({ n: f(r[0]), l: r[1], s: r[2], bg: T[r[3]][0], fg: T[r[3]][1], onClick: r[4] }))
      : [{ n: "0", l: "Nothing needs you right now", s: "Every child is accounted for, confirmed, grouped and consented.", bg: T.ok[0], fg: T.ok[1], onClick: () => this.go("participants") }];
    const ser = d.series || [];
    const mx = Math.max(1, ...ser.map(s => s.n));
    out.bars = ser.map(s => { const isT = s.date === B.today; return { h: Math.max(4, Math.round(s.n / mx * 100)) + "%", c: isT ? "#ff9f43" : "#0b0b0c", t: ss3Day(s.date) + ": " + f(s.n) + " in" + (isT ? " so far" : ""), onClick: () => this.go("register", { day: s.date, rf: "absent" }) }; });
    out.barFirst = ser[0] ? ss3Day(ser[0].date) : ""; out.barMid = ser.length > 4 ? ss3Day(ser[Math.floor(ser.length / 2)].date) : "";
    const past = ser.filter(s => s.date !== B.today);
    const avg = past.length ? Math.round(past.reduce((a, s) => a + s.n, 0) / past.length) : 0;
    out.avgIn = f(avg); out.bestDay = past.length ? ss3Day(past.slice().sort((a, b) => b.n - a.n)[0].date) : "—"; out.friDrop = "";
    const rules = [f(here) + " in today, " + f(L.absent) + " not yet in, out of " + f(exp) + " expected.",
      past.length ? "Across the last " + past.length + " programme days an average of " + f(avg) + " came in" + (exp ? " (" + Math.round(avg / exp * 100) + "%)." : ".") : "No earlier programme days have a register yet.",
      C.stopped ? f(C.stopped) + " came and then stopped: absent for the last " + B.stoppedRun + " days in a row." : "Nobody has stopped coming.",
      C.risk ? f(C.risk) + " are under " + B.riskRate + "% for the season." : "Nobody is under " + B.riskRate + "% for the season."];
    const ins = S.ins || { src: "rules", lines: rules };
    out.insLines = ins.lines; out.insBusy = S.insBusy; out.insReady = !S.insBusy;
    out.insSrc = ins.src === "ai" ? "Written by AI from the register. Check it before you act." : "From the register’s own figures. Ask AI for a fuller read.";
    out.askL = ins.src === "ai" ? "Ask again" : "Ask AI for a read";
    out.askAI = () => {
      this.setState({ insBusy: true });
      this.S().insights(ed ? ed.id : "").then(r => {
        const lines = String(r.insight || "").split(/\n+/).map(x => x.replace(/^[\s·•\-*]+/, "").trim()).filter(Boolean);
        this.setState({ insBusy: false, ins: lines.length ? { src: r.source === "ai" ? "ai" : "rules", lines } : null });
        if (r.source !== "ai") this.toast(r.aiConfigured ? "AI didn’t answer, so this is the register’s own read." : "AI isn’t set up, so this is the register’s own read.");
      }).catch(e => { this.setState({ insBusy: false }); this.fail(e); });
    };
    out.toAtRisk = () => this.go("participants", { pview: "risk", f: {}, pq: "" }); out.toGroups = () => this.go("groups");
    out.watchGroups = (d.watch || []).map(g => ({ name: g.name, lead: g.lead || "No lead", time: g.time || g.centre, rate: g.rate + "%", rc: g.rate < 70 ? "#a12a2a" : "#0b0b0c", todayL: g.here + " of " + g.n + " in today",
      onClick: () => this.go("participants", { pview: "all", f: { group: g.id }, pq: "" }) }));
  }

  vals_groups(out, d) {
    const S = this.state, T = SS3_T, B = S.boot, bd = B.badges || {};
    const rate = {}; (d.groupStats || []).forEach(g => { rate[g.id] = g; });
    out.hasUnplaced = (bd.noGroup || 0) > 0; out.unplacedL = ss3Fmt(bd.noGroup) + (bd.noGroup === 1 ? " child has no group" : " children have no group");
    out.openPlace = () => this.openPlace();
    out.groupCards = (B.groups || []).map(g => {
      const w = rate[g.id] || {}, n = w.n || 0, cap = g.cap || 0, left = cap - n, full = cap > 0 && left <= 0;
      return { name: g.name, code: g.code, lead: g.lead || "No lead yet", time: [g.centre, g.time].filter(Boolean).join(" · "), seats: !cap ? "No seat limit" : full ? "Full" : left + " seats left",
        fill: n + (cap ? " / " + cap : ""), fillPct: cap ? Math.min(100, Math.round(n / cap * 100)) + "%" : "0%", fillC: full ? "#e0a100" : "#0b0b0c",
        rate: w.rate != null ? w.rate + "%" : "—", rc: w.rate != null && w.rate < 70 ? "#a12a2a" : "#0b0b0c", today: (w.here || 0) + " / " + n,
        state: full ? "Full" : "Open", sbg: full ? T.warn[0] : T.ok[0], sfg: full ? T.warn[1] : T.ok[1] };
    });
  }
  /* The children to place are read when the dialog opens, so the count the
     coordinator agrees to is the count that is sent. */
  openPlace() {
    this.setState({ modal: "place", mRes: null, placeIds: null, placeTo: (this.state.boot.groups[0] || {}).id || "" });
    this.S().portal("people", { pview: "nogroup", export: 1 }).then(r => this.setState({ placeIds: (r.rows || []).map(x => ({ id: x.id, name: x.name, centre: x.centre })) }))
      .catch(e => this.setState({ mRes: [ss3Err(e), "bad"] }));
  }

  vals_participants(out, d) {
    const S = this.state, T = SS3_T, f = ss3Fmt, B = S.boot, phone = S.w < 640;
    const vc = d.views || {};
    out.views = SS3_VIEWS.map(v => { const on = S.pview === v[0]; return { l: v[1], n: f(vc[v[0]] || 0), sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#e2e2df", onClick: () => this.setPeople({ pview: v[0] }) }; });
    const gName = id => ((B.groups || []).find(g => g.id === id) || {}).name || id;
    out.facets = SS3_FACETS.map(([k, l]) => {
      const counts = (d.facets || {})[k] || {}, on = !!S.f[k];
      const opts = Object.keys(counts).map(v => ({ v, l: (k === "group" ? gName(v) : k === "today" ? (SS3_TODAY_L[v] || v) : v) + " · " + f(counts[v]) }));
      if (on && !counts[S.f[k]]) opts.unshift({ v: S.f[k], l: (k === "group" ? gName(S.f[k]) : S.f[k]) + " · 0" });
      return { l, v: S.f[k] || "", bd: on ? "#0b0b0c" : "#e2e2df", bg: on ? "#f4f4f3" : "#fff", opts: [{ v: "", l: "Any" }].concat(opts),
        onChange: e => { const v = e.target.value; this.setPeople({ f: Object.assign({}, S.f, { [k]: v }) }); } };
    });
    out.hasF = Object.values(S.f).some(Boolean) || !!S.pq || S.pview !== "all";
    out.clearF = () => this.setPeople({ f: {}, pq: "", pview: "all" });
    out.pq = S.pq; out.onPQ = e => { const v = e.target.value; this.setState({ pq: v, page: 0 }); clearTimeout(this.pqT); this.pqT = setTimeout(() => this.setPeople({}), 250); };
    const total = d.total || 0, size = d.pageSize || 25, pages = Math.max(1, Math.ceil(total / size)), pg = d.page || 0;
    out.pCount = f(total) + (total === 1 ? " child" : " children");
    out.pRange = total ? f(pg * size + 1) + "–" + f(Math.min(total, pg * size + size)) + " of " + f(total) : "";
    out.pPage = "Page " + (pg + 1) + " of " + pages; out.pMulti = pages > 1;
    out.pPrev = () => pg > 0 && this.setPeople({ page: pg - 1 }); out.pNext = () => pg < pages - 1 && this.setPeople({ page: pg + 1 });
    out.pEmpty = !total; out.tableMode = !phone && total > 0; out.listMode = phone && total > 0;
    out.rows = (d.rows || []).map(p => {
      const pill = ss3Pill(p.today), live = p.status === "active" && p.reg === "verified";
      return { name: p.name, ini: ss3Ini(p.name), tone: ss3Tone(p.id), sub: [p.displayId, p.age != null ? p.age : "", p.centre].filter(x => x !== "").join(" · "),
        group: p.group || "No group", gc: p.group ? "#3a3a40" : "#7a5600",
        rate: live && p.rate != null ? p.rate + "%" : "—", rc: !live ? "#9a9aa0" : p.rate != null && p.rate < B.riskRate ? "#a12a2a" : "#0b0b0c",
        today: p.reg !== "verified" ? "Not confirmed" : p.status !== "active" ? (p.status[0].toUpperCase() + p.status.slice(1)) : (SS3_TODAY_L[p.today] || p.today) + (p.today === "late" && p.lateMin ? " " + p.lateMin + "m" : p.today === "in" && p.inAt ? " " + p.inAt : ""),
        tbg: p.reg !== "verified" ? T.warn[0] : pill[0], tfg: p.reg !== "verified" ? T.warn[1] : pill[1],
        gName: p.guardian || "No guardian on file", gPhone: p.phone || "",
        consent: p.consent === "complete" ? "Complete" : "Missing", cc: p.consent === "complete" ? "#17663a" : "#a12a2a",
        card: p.displayId || "No card", kc: p.displayId ? "#3a3a40" : "#7a5600", open: () => this.openChild(p.id) };
    });
    out.exportCSV = () => {
      this.S().portal("people", this.peopleOpts({ export: 1, page: 0 })).then(r => {
        const head = "ID,Name,Age,Centre,Group,Attendance,Today,Guardian,Phone,Consent\n";
        const body = (r.rows || []).map(p => [p.displayId, p.name, p.age == null ? "" : p.age, p.centre, p.group, p.rate == null ? "" : p.rate + "%", SS3_TODAY_L[p.today] || p.today, p.guardian, p.phone, p.consent]
          .map(x => '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"').join(",")).join("\n");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([head + body], { type: "text/csv" }));
        a.download = "summer-participants-" + B.today + ".csv"; document.body.appendChild(a); a.click(); a.remove();
        this.toast(ss3Fmt((r.rows || []).length) + " rows exported.");
      }).catch(e => this.fail(e));
    };
  }

  vals_registrations(out, d) {
    const S = this.state, f = ss3Fmt, counts = d.counts || {};
    out.regTabs = SS3_REG_TABS.map(t => { const on = S.regTab === t[0]; return { l: t[1], n: f(counts[t[0]] || 0), sel: on ? "true" : "false", bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(11,11,12,.08)" : "none",
      onClick: () => this.setState({ regTab: t[0] }, () => this.reload()) }; });
    out.regRows = (d.registrations || []).map(r => {
      const pend = r.regStatus === "parent_pending", self = r.regStatus === "self_pending", rs = S.resent[r.studentId];
      return { name: r.fullName, sub: [r.age, r.centre, r.track].filter(Boolean).join(" · "), guardian: r.guardianName || "No guardian on file", email: r.parentEmail || "No email",
        link: r.regStatus === "verified" ? "Confirmed" + (r.verifiedAt ? " " + ss3Day(r.verifiedAt) : "") : self ? "Waiting for review" : "Sent " + (r.waitingDays ? r.waitingDays + (r.waitingDays === 1 ? " day" : " days") + " ago" : "today"),
        lc: pend && r.waitingDays >= 7 ? "#a12a2a" : "#3a3a40",
        rem: rs ? "Reminder sent just now" : r.remindedDaysAgo != null ? "Reminded " + (r.remindedDaysAgo ? r.remindedDaysAgo + "d ago" : "today") : self ? "Review it in the Control Room" : "Not reminded yet",
        open: pend, done: r.regStatus === "verified", resendL: "Remind",
        resend: () => {
          if (!r.parentEmail) return this.toast("No guardian email for " + r.fullName + ". Record a paper form instead.");
          NGGApi.admin.registration.remind(r.studentId).then(() => { this.setState(s => ({ resent: Object.assign({}, s.resent, { [r.studentId]: 1 }) })); this.toast("Reminder sent to " + r.parentEmail + "."); })
            .catch(e => this.fail(e));
        },
        paper: () => this.setState({ paper: { studentId: r.studentId, guardianName: r.guardianName || "", fullName: r.fullName } }) };
    });
    out.regEmpty = !out.regRows.length;
  }

  vals_register(out, d) {
    const S = this.state, T = SS3_T, f = ss3Fmt, B = S.boot;
    const chips = d.dayChips || [];
    out.dayChips = chips.map(dt => { const on = dt === d.date, parts = ss3Day(dt).split(" "); return { w: dt === B.today ? "Today" : parts[0], d: parts.slice(1).join(" "), sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#e2e2df",
      onClick: () => this.setState({ day: dt }, () => this.reload()) }; });
    const k = d.kpis || {}, live = d.live || 0;
    const K = [["in", "In", k.in, "#17663a"], ["late", "Came late", k.late, "#7a5600"], ["absent", "Not in", k.absent, "#a12a2a"], ["stopped", "Stopped coming", k.stopped, "#a12a2a"]];
    out.regKpis = K.map(x => ({ l: x[1], v: f(x[2]), c: x[3], s: (live ? Math.round((x[2] || 0) / live * 100) : 0) + "% of " + f(live), sel: d.rf === x[0] ? "true" : "false", bd: d.rf === x[0] ? "#0b0b0c" : "#ececea",
      onClick: () => this.setState({ rf: x[0] }, () => this.reload()) }));
    const dl = d.isToday ? "today" : ss3Day(d.date);
    out.regListH = { in: "In " + dl, late: "Late " + dl, absent: "Not in " + dl, stopped: "Not in for " + B.stoppedRun + " days in a row" }[d.rf] + " · " + f(d.listTotal || 0);
    out.regList = (d.list || []).map(p => {
      const s = p.mark, pill = s === "in" ? [p.markAt || "In", T.ok] : s === "late" ? ["Late " + p.markLate + "m", T.warn] : ["Not in", T.bad];
      return { name: p.name, group: p.group || p.centre + " · no group", inL: pill[0], tbg: pill[1][0], tfg: pill[1][1], out: s === "absent" ? "—" : (p.markOut || (d.isToday ? "Still in" : "No sign-out")),
        gName: p.guardian || "—", gPhone: p.phone || "", canAlert: false, alerted: false, open: () => this.openChild(p.id) };
    });
    /* One alert for everyone not in today, through the one absence op, parked
       for its undo window. Only today: "we missed them" a week late is noise. */
    const n = (d.rf === "absent" || d.rf === "stopped") && d.isToday ? (k.absent || 0) : 0;
    out.canBulkAlert = n > 0; out.bulkAlertL = "Alert all " + f(n) + " guardians";
    out.bulkAlert = () => this.parked("Emailing " + f(n) + " guardians…", defer => this.S().alertAbsent(defer, B.edition.id),
      r => { if (r && r.ok === false) return this.fail(r); this.toast(f((r && r.sent) || 0) + " guardians emailed" + (r && r.skipped ? ", " + f(r.skipped) + " skipped: no email on file." : ".")); });
    out.regListEmpty = !(d.list || []).length; out.regListEmptyL = "Nobody here.";
    out.regMore = (d.listTotal || 0) > (d.list || []).length; out.regMoreL = "Showing the first " + (d.list || []).length + ". Open Participants to filter and export the full list.";
  }

  vals_desk(out, d) {
    const S = this.state, T = SS3_T, R = S.boot.rules || {}, md = S.deskMode;
    out.deskModes = [["in", "Check in", "ph ph-sign-in"], ["out", "Check out", "ph ph-sign-out"]].map(x => ({ l: x[1], icon: x[2], sel: md === x[0] ? "true" : "false", bg: md === x[0] ? "#fff" : "transparent", fg: md === x[0] ? "#0b0b0c" : "rgba(255,255,255,.75)", onClick: () => this.setState({ deskMode: x[0], deskRes: null }) }));
    out.deskQ = S.deskQ; out.onDeskQ = e => this.setState({ deskQ: e.target.value });
    out.deskHint = "a card code, a printed ID like EG-26-001, or a child’s name";
    out.deskGoL = md === "in" ? "Check in" : "Check out";
    const run = (early) => {
      const q = (early ? early.q : S.deskQ).trim(); if (!q || S.busy) return;
      this.setState({ busy: true });
      this.S().desk(q, early ? "out" : md, early ? early.reason : "").then(r => {
        const first = r.child ? String(r.child.name).split(" ")[0] : "";
        let res;
        if (md === "in" && !early) res = r.already ? ["neutral", "ph ph-check", first + " is already in", "Scanned earlier today. Nothing more to do."]
          : r.status === "late" ? ["warn", "ph ph-clock", "Welcome, " + first + " — late by " + r.lateMinutes + " min", "Doors " + R.student + " + " + R.grace + " min grace. Logged as late at " + r.at + "."]
          : ["ok", "ph ph-check-circle", "Welcome, " + first, "Checked in on time at " + r.at + "."];
        else res = r.already ? ["neutral", "ph ph-check", first + " was already signed out", "Nothing more to do."] : ["ok", "ph ph-sign-out", first + " signed out" + (early ? " early" : ""), early ? "Reason recorded: " + early.reason + "." : "Signed out at " + r.at + "."];
        this.setState({ busy: false, deskRes: res, deskQ: "" }); this.loadFor("desk");
      }).catch(e => {
        const x = (e && e.data) || e || {}, c = e && (e.code || e.error), ch = x.child, first = ch ? String(ch.name).split(" ")[0] : "";
        const res = c === "card_not_found" ? ["bad", "ph ph-question", "No child found", "Not a card, ID or name in this season. Check it, or give them a blank card."]
          : c === "ambiguous" ? ["warn", "ph ph-users", "More than one child matches", "Type more of the name, or use their ID: " + ((x.names || []).join(", ")) + "."]
          : c === "not_verified" ? ["warn", "ph ph-envelope-simple", first + " isn’t confirmed yet", "Their guardian hasn’t clicked the link. A paper form at the desk will do it."]
          : c === "not_active" ? ["neutral", "ph ph-user-circle", first + " is " + (ch ? ch.status : "not active"), "Check with the coordinator before letting them in."]
          : c === "no_card" ? ["warn", "ph ph-identification-card", first + " has no card", "Give them a blank card and link it when you enrol them."]
          : c === "too_early" ? ["bad", "ph ph-hand", "Sign-out opens at " + (x.closesAt || R.closeStudent), "Leaving early needs a reason, and it is recorded.", true, q]
          : c === "not_checked_in" ? ["bad", "ph ph-sign-in", "Not checked in today", "Check them in first."]
          : ["bad", "ph ph-warning", "Not done", ss3Err(e)];
        this.setState({ busy: false, deskRes: res });
      });
    };
    out.deskGo = () => run(); out.onDeskKey = e => { if (e.key === "Enter") run(); };
    const r = S.deskRes;
    out.hasDeskRes = !!r;
    out.dr = r ? { bg: { ok: "#e8f5ec", warn: "#fdf2d8", bad: "#fdeaea", neutral: "#f0f0ef" }[r[0]], fg: T[r[0]][1], icon: r[1], h: r[2], s: r[3], hasEarly: !!r[4] } : {};
    out.deskEarly = () => this.setState({ modal: "early", mRes: null, walk: { reason: "" }, early: { q: r[5], run } });
    out.desks = (d.deskCentres || []).map(c => ({ name: c.name, dot: "#22a05a", sub: c.last ? "Last scan " + c.last : "No scans yet", sc: "#6b6b72", n: ss3Fmt(c.scans) + " today", hasQ: false }));
    if (!out.desks.length) out.desks = [{ name: "No scans yet today", dot: "#9a9aa0", sub: "Scans appear here as children arrive", sc: "#6b6b72", n: "", hasQ: false }];
    out.rules = [["Children", R.student ? "Doors " + R.student + ", " + R.grace + " minutes’ grace. Later than that is late." : "No door time set."],
      ["Volunteers", R.volunteer ? "In by " + R.volunteer + "." : "No time set."],
      ["Sign-out", R.closeStudent ? "From " + R.closeStudent + " for children" + (R.closeVolunteer ? ", " + R.closeVolunteer + " for volunteers" : "") + ". Earlier needs a reason." : "Any time."],
      ["Where set", "Control Room → Settings → Attendance."]].map(x => ({ k: x[0], v: x[1] }));
    const SC = { in: ["On time", T.ok], late: ["Late", T.warn], out: ["Signed out", T.neutral] };
    out.feed = (d.feed || []).map(s => ({ t: s.t, name: s.name, sub: s.group, st: s.st === "late" ? "Late " + s.late + "m" : SC[s.st][0], bg: SC[s.st][1][0], fg: SC[s.st][1][1] }));
  }

  openIncForm() { this.setState({ incForm: true, incDraft: { kind: "First aid", sev: "low" } }); }

  vals_incidents(out, d) {
    const S = this.state, T = SS3_T, f = ss3Fmt;
    const all = d.incidents || [], k = d.incKpis || {}, kinds = d.kinds || [];
    out.incTabs = ["all"].concat(kinds).map(kd => { const on = S.incKind === kd; const n = kd === "all" ? all.length : (d.incKinds || {})[kd] || 0;
      return { l: kd === "all" ? "All" : kd, n: f(n), bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#3a3a40", bd: on ? "#0b0b0c" : "#e2e2df", sel: on ? "true" : "false", onClick: () => this.setState({ incKind: kd }) }; });
    out.incKpis = [["Open", k.open], ["Guardian not told", k.untold], ["This week", k.week], ["Safeguarding open", k.safeOpen]].map(x => ({ l: x[0], v: f(x[1] || 0) }));
    const act = (fn, done) => this.setState({ busy: true }, () => fn().then(r => { this.setState({ busy: false }); this.toast(done(r)); this.loadFor("incidents"); this.refreshBadges(); })
      .catch(e => { this.setState({ busy: false }); this.fail(e); }));
    out.incs = all.filter(x => S.incKind === "all" || x.kind === S.incKind).map(x => {
      const sv = SS3_INC_SEV[x.sev] || SS3_INC_SEV.low, told = !!x.toldAt, open = x.status === "open";
      const when = x.createdAt ? (x.createdAt.slice(0, 10) === S.boot.today ? "Today, " : ss3Day(x.createdAt) + ", ") + x.createdAt.slice(11, 16) : "";
      return { id: x.id, kind: x.kind, sev: sv[0], sbg: T[sv[1]][0], sfg: T[sv[1]][1], lock: x.restricted, child: x.child, centre: x.centre, when, by: x.by || "staff", note: x.note,
        stL: open ? "Open" : "Closed", stc: open ? "#0b0b0c" : "#6b6b72", tc: open ? "#22a05a" : "#9a9aa0",
        toldL: x.restricted ? "The safeguarding lead decides who is told" : told ? "Guardian told · " + x.toldBy : "Guardian not told yet",
        notTold: !x.restricted && !told && !!x.studentId,
        tell: () => act(() => this.S().incidentTell(x.id), r => "Told by " + (r.channels || []).join(" and ") + "."),
        canClose: open && !x.restricted, close: () => act(() => this.S().incidentClose(x.id), () => x.id + " closed.") };
    });
    if (!out.incs.length) out.incs = [{ id: "", kind: S.incKind === "all" ? "Nothing logged" : "No " + S.incKind.toLowerCase() + " incidents", sev: "", child: "Nothing has been logged this season", centre: "", when: "", by: "", note: "Log one with the button above when something happens.", stL: "", toldL: "", notTold: false, canClose: false, lock: false }];
    const dr = S.incDraft || {};
    out.incForm = S.incForm; out.incChild = dr.child || ""; out.incNote = dr.note || ""; out.incK = dr.kind || "First aid"; out.incSev = dr.sev || "low";
    const cs = d.incCentres || [];
    out.incCentre = dr.centre || cs[0] || "";
    const setD = key => e => { const v = e.target.value; this.setState(s => ({ incDraft: Object.assign({}, s.incDraft, { [key]: v }) })); };
    out.onIncChild = setD("child"); out.onIncNote = setD("note"); out.onIncK = setD("kind"); out.onIncSev = setD("sev"); out.onIncCentre = setD("centre");
    out.incKindOpts = kinds.map(x => ({ v: x, l: x })); out.centreOpts = cs.map(c => ({ v: c, l: c }));
    out.isSafe = out.incK === "Safeguarding";
    out.incCancel = () => this.setState({ incForm: false, incDraft: {} });
    out.incSave = () => {
      if (S.busy) return;
      this.setState({ busy: true });
      this.S().incidentSave({ editionId: S.boot.edition.id, child: out.incChild, kind: out.incK, sev: out.incSev, centre: out.incCentre, note: out.incNote }).then(r => {
        this.setState({ busy: false, incForm: false, incDraft: {} });
        this.toast(r.restricted ? "Sent to " + (r.officerName || "the safeguarding lead") + " as case " + r.caseNo + ". Only they can see the details."
          : r.incidentId + " logged" + (r.linked ? " for " + r.childName + "." : ". " + r.childName + " isn’t on the roster, so there is no guardian to tell from here."));
        this.loadFor("incidents"); this.refreshBadges();
      }).catch(e => { this.setState({ busy: false }); this.fail(e); });
    };
  }

  vals_messages(out, d) {
    const S = this.state, f = ss3Fmt, tpls = d.templates || [], auds = d.audiences || [];
    const tpl = tpls.find(t => t.id === S.msgTpl) || tpls[0] || { id: "", title: "", body: "" };
    const aud = auds.find(a => a.id === S.msgAud) || auds[0] || { id: "", label: "", n: 0 };
    out.tpls = tpls.map(t => { const on = t.id === tpl.id; return { l: t.title, bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#3a3a40", bd: on ? "#0b0b0c" : "#e2e2df", sel: on ? "true" : "false", onClick: () => this.setState({ msgTpl: t.id }) }; });
    out.audOpts = auds.map(a => ({ v: a.id, l: a.label + " (" + f(a.n) + ")" })); out.msgAud = aud.id; out.onAud = e => this.setState({ msgAud: e.target.value });
    const smsOn = !!d.smsOn, ch = smsOn ? S.msgCh : "email";
    out.chOpts = SS3_CH.map(c => { const on = ch === c[0]; return { l: c[1], bg: on ? "#fff" : "transparent", fw: on ? 600 : 500, sel: on ? "true" : "false",
      onClick: () => (c[0] !== "email" && !smsOn) ? this.toast("Text messages aren’t set up. Email still works.") : this.setState({ msgCh: c[0] }) }; });
    out.needDetails = !!tpl.needsDetails; out.detailsL = "What to say"; out.detailsPh = tpl.id === "change" ? "e.g. the yard is closed after rain, so play is indoors" : "One or two sentences";
    out.msgDetails = S.msgDetails; out.onDetails = e => this.setState({ msgDetails: e.target.value });
    const R = d.rules || {}, details = S.msgDetails.trim() || (tpl.needsDetails ? "…" : "");
    out.previewWho = "a guardian";
    out.preview = String(tpl.body || "").replace("{guardian}", "Mrs Bakare").replace("{child}", "Ayomide").replace("{centre}", (S.boot.centres || [])[0] || "your centre").replace("{time}", R.closeStudent || "").replace("{details}", details);
    const segs = Math.max(1, Math.ceil(out.preview.length / 160));
    out.chars = out.preview.length + " characters" + (ch !== "email" ? " · " + segs + " SMS each" : "");
    out.cost = ch === "email" ? "Email is free." : "Texts are charged by your SMS provider: about " + f(aud.n * segs) + " SMS.";
    out.sendL = aud.n ? "Send to " + f(aud.n) + " guardian" + (aud.n === 1 ? "" : "s") : "Nobody in that group";
    out.send = () => {
      if (!aud.n) return this.toast("Nobody in that group right now.");
      if (tpl.needsDetails && S.msgDetails.trim().length < 3) return this.toast("Say what to tell them first.");
      this.parked("Sending to " + f(aud.n) + " guardians…", defer => this.S().messageSend({ editionId: S.boot.edition.id, template: tpl.id, audience: aud.id, channel: ch, details: S.msgDetails.trim() }, defer),
        r => { if (!r || r.ok === false) return this.fail(r); this.toast(f(r.delivered) + " of " + f(r.recipients) + " reached" + (r.failed ? ", " + f(r.failed) + " failed" : "") + (r.noContact ? ", " + f(r.noContact) + " had no contact for that channel" : "") + ".");
          this.setState({ msgDetails: "" }); this.loadFor("messages"); });
    };
    const AL = {}; auds.forEach(a => { AL[a.id] = a.label; });
    out.sent = (d.sent || []).map(m => ({ title: m.title, to: AL[m.audience] || m.audience, when: m.at ? (m.at.slice(0, 10) === S.boot.today ? "Today, " : ss3Day(m.at) + ", ") + m.at.slice(11, 16) : "",
      ch: (SS3_CH.find(c => c[0] === m.channel) || ["", m.channel])[1], by: m.by, n: f(m.recipients) + " families",
      delivered: f(m.delivered) + " reached" + (m.failed ? " · " + f(m.failed) + " not" : ""), dPct: (m.recipients ? Math.round(m.delivered / m.recipients * 100) : 0) + "%", hasRead: false, hasRep: false }));
  }
  refreshBadges() { this.S().portal("boot").then(b => this.setState(s => ({ boot: Object.assign({}, s.boot, { badges: b.badges }) }))).catch(() => {}); }

  vals_consent(out, d) {
    const S = this.state, T = SS3_T, f = ss3Fmt;
    out.conRows = (d.types || []).map(c => {
      const req = c.rule === "required", ans = c.rule === "answer", u = c.unanswered;
      return { label: c.label, note: req ? "Needed for a place" : ans ? "Either answer keeps the place" : "Optional", rule: req ? "Must agree" : ans ? "Must answer" : "Optional",
        rbg: req ? T.bad[0] : ans ? T.warn[0] : T.neutral[0], rfg: req ? T.bad[1] : ans ? T.warn[1] : T.neutral[1],
        g: f(c.granted), r: f(c.declined), u: f(u), gf: c.granted, rf: c.declined, uf: Math.max(u, u ? 6 : 0), uc: req || ans ? "#d94141" : "#e0a100", uw: u && !(c.rule === "optional") ? 600 : 400, uc2: u && c.rule !== "optional" ? "#a12a2a" : "#4a4a50" };
    });
    const media = (d.types || []).find(t => t.type === "media") || { declined: 0 };
    out.conKpis = [["Missing a required consent", d.missingTotal, "Out of class until fixed", d.missingTotal ? "#f3c7c2" : "#ececea", d.missingTotal ? "#fdf1ef" : "#fff", "#a12a2a"],
      ["Photos or website not answered", d.unansweredTotal, "Ask at pick-up", "#ececea", "#fff", "#7a5600"],
      ["Said no to photos", media.declined, "The photo tools hide these children", "#ececea", "#fff", "#0b0b0c"],
      ["Fully recorded", d.completeTotal, "of " + f(d.activeTotal) + " active", "#ececea", "#fff", "#17663a"]].map(k => ({ l: k[0], v: f(k[1]), s: k[2], bd: k[3], bg: k[4], c: k[5] }));
    out.conMissing = (d.missing || []).map(p => {
      const pend = p.reg === "parent_pending";
      return { name: p.name, what: p.missingLabel, group: p.group || p.centre, open: pend, done: !pend,
        doneL: p.reg === "verified" ? "Confirmed before this was asked — ask the guardian at pick-up" : "Waiting for review in the Control Room",
        send: () => NGGApi.admin.registration.remind(p.id).then(() => this.toast("Consent link sent again.")).catch(e => this.fail(e)),
        paper: () => this.setState({ paper: { studentId: p.id, guardianName: p.guardian || "", fullName: p.name } }) };
    });
  }

  vals_cards(out, d) {
    const S = this.state, f = ss3Fmt, c = d.cardCounts || {}, low = d.lowAt || 15;
    out.cardKpis = [["Linked to a child", c.assigned, "across " + (d.batches || []).length + " batches", "#ececea", "#fff", "#0b0b0c"], ["Blank in stock", c.blank, "ready for walk-ins", c.blank < low ? "#f1d58f" : "#ececea", c.blank < low ? "#fdf6e3" : "#fff", "#0b0b0c"],
      ["Void", c.void, "lost, swapped or damaged", "#ececea", "#fff", "#4a4a50"], ["Confirmed, no card", c.noCard, "give one at the desk", c.noCard ? "#f1d58f" : "#ececea", c.noCard ? "#fdf6e3" : "#fff", "#7a5600"]]
      .map(k => ({ l: k[0], v: f(k[1]), s: k[2], bd: k[3], bg: k[4], c: k[5] }));
    const B = d.batches || [], mx = Math.max(1, ...B.map(b => b.blank));
    out.stock = B.slice(0, 8).map(b => ({ c: b.id, n: b.blank, w: Math.round(b.blank / mx * 100) + "%", col: b.blank < low ? "#e0a100" : "#0b0b0c", col2: b.blank < low ? "#7a5600" : "#0b0b0c" }));
    out.batches = B.map(b => ({ id: b.id, minted: b.minted ? ss3Day(b.minted) : "", total: f(b.total), centre: "Any centre", assigned: b.assigned, blank: b.blank, void: b.void }));
    out.cardEg = "SUMQR-1A2B"; out.cardQ = S.cardQ;
    out.onCardQ = e => { const v = e.target.value; this.setState({ cardQ: v }); clearTimeout(this.cardT); this.cardT = setTimeout(() => this.loadFor("cards"), 300); };
    const hit = d.card;
    out.cardHit = !!hit && hit.status === "assigned"; out.cardMiss = !!d.cardAsked && S.cardQ.trim().length >= 6 && !out.cardHit;
    out.ch = hit ? { name: hit.name || "Blank card", sub: [hit.displayId, "batch " + hit.batch, hit.centre].filter(Boolean).join(" · ") } : {};
    out.cardVoid = () => {
      if (!hit) return;
      this.ask("Void card " + hit.token + "?", "It stops working at every desk straight away, and cannot be brought back. Give " + String(hit.name).split(" ")[0] + " a blank card afterwards.", "Void the card",
        () => this.S().qrVoid(hit.token).then(() => { this.setState({ cardQ: "" }, () => this.loadFor("cards")); return "Card " + hit.token + " is void. Give " + String(hit.name).split(" ")[0] + " a blank one at the desk."; }));
    };
  }

  vals_editions(out, d) {
    const S = this.state, T = SS3_T, f = ss3Fmt, cur = S.boot.edition;
    const SM = { planning: ["Planning", T.neutral], active: ["Live", T.ok], closed: ["Closed", T.warn], archived: ["Archived", T.neutral] };
    out.editions = (d.editions || []).map(e => {
      const isCur = cur && e.editionId === cur.id, st = SM[e.status] || SM.planning;
      const stats = [["Children", f(e.participants)], ["Groups", f(e.groups)]].concat(e.waitlisted ? [["Waitlisted", f(e.waitlisted)]] : []);
      const closed = e.status === "closed" || e.status === "archived", archived = e.status === "archived";
      const steps = isCur ? [
        ["1", "Close the season", "Every desk stops taking check-ins. Do it after the last session" + (e.endDate ? " on " + ss3Day(e.endDate) : "") + ".", e.status === "active", "Close " + e.name, () => this.setState({ modal: "close", mRes: null }), closed, "Closed"],
        /* The press used to give no sign it had been made: no working state, a
           toast easy to miss, and the step never marked done — so it read as a
           button that does nothing, and was pressed again. It now says
           "Issuing…" while it runs, reports the count, and shows what has been
           issued from the server's own count, so a reload tells the same story. */
        /* Automatic: closing queues a thank-you to every volunteer of the season
           (summer-editions.php, summer_thanks_queue), sent in batches. This step
           only says how far it has got, and who could not be reached. */
        (() => { const t = e.thanks || {}, left = t.queued || 0;
          const said = t.total ? f(t.sent) + " of " + f(t.total) + " volunteers thanked" + (left ? ", " + f(left) + " still sending" : "") + (t.noEmail ? " · " + f(t.noEmail) + " with no email" : "") + (t.failed ? " · " + f(t.failed) + " not delivered" : "") + "."
            : "Every volunteer of the season is sent a thank-you, with the sessions they gave, when it closes.";
          return ["2", "Thank the volunteers", said, false, "", null, t.total > 0 && !left, f(t.sent || 0) + " thanked"]; })(),
        ["3", "Issue certificates", "One per child still active at the end. Each guardian gets a link anyone can check.", closed && !archived && !(e.certified > 0 && e.certified >= e.participants),
          S.certBusy === e.editionId ? "Issuing…" : e.certified > 0 ? "Issue " + f(Math.max(0, e.participants - e.certified)) + " more" : "Issue certificates", () => {
          if (S.certBusy) return;
          this.setState({ certBusy: e.editionId });
          this.S().issueCerts("active", e.editionId).then(r => {
            this.setState({ certBusy: "" });
            this.toast(r.issued ? f(r.issued) + (r.issued === 1 ? " certificate" : " certificates") + " issued. Each guardian has been sent the link." : "No new certificates — every active child already has one.");
            this.loadFor("editions");
          }).catch(x => { this.setState({ certBusy: "" }); this.fail(x); }); },
          e.certified > 0 && e.certified >= e.participants, f(e.certified) + " issued"],
        ["4", "Archive & roll up", "Each child’s attendance is saved onto their record. Daily scans are kept.", closed && !archived, "Archive the season", () => {
          this.ask("Archive " + e.name + "?", "Each child’s attendance is rolled up onto their record. The season can’t be reopened afterwards.", "Archive the season",
            () => this.S().archive(e.editionId, false).then(() => { this.boot(); return e.name + " archived."; })); }, archived, "Archived"],
        ["5", "Move graduates into NGG", "Pick each child’s NGG centre, nearest first, then send the family one joining invoice.", true, "Open Into NGG", () => this.go("tongg"), false, ""],
      ].map(s => ({ n: s[0], l: s[1], d: s[2], canRun: !!s[3], cta: s[4], run: s[5], done: !!s[6], doneL: s[7], nbg: s[6] ? "#22a05a" : s[3] ? "#0b0b0c" : "#ececea", nfg: s[6] || s[3] ? "#fff" : "#6b6b72" })) : [];
      return { name: e.name, dates: e.startDate ? ss3Day(e.startDate) + " – " + ss3Day(e.endDate) : "No dates yet", state: st[0], sbg: st[1][0], sfg: st[1][1], stats: stats.map(s => ({ l: s[0], v: s[1] })),
        hasSteps: isCur, steps, hasNote: !!e.notes, note: e.notes, bd: isCur ? "#0b0b0c" : "#ececea", bg: "#fff" };
    });
  }

  vals_tongg(out, d) {
    const S = this.state, T = SS3_T, f = ss3Fmt, terms = d.terms || {}, canMove = !!d.canMove, canInv = !!d.canInvoice;
    const starts = d.startOptions || [], stI = Math.min(S.ngStart, Math.max(0, starts.length - 1)), st = starts[stI];
    /* With fees switched off there is no price to show, and "₦0" would read as
       "joining is free" — so say they are off, and where they are set. */
    const feesOn = !!terms.enabled;
    out.ngTerms = [["ph ph-identification-badge", "Membership", feesOn ? "₦" + f(terms.membershipFee) : "Fees are off", feesOn ? "A year, renewed on the date they join" : "Nothing is invoiced while fees are off", "#fafaf9"],
      ["ph ph-calendar-check", "Commitment fee", feesOn ? "₦" + f(terms.monthlyCommitment) + " a month" : "Fees are off", feesOn ? "The first month is pro-rated to the meetings left." : "Switch fees on in Control Room → Fees", "#fafaf9"],
      ["ph ph-graduation-cap", "Training place", "Covered by NGG", "Not billed.", "#eef7f0"]].map(t => ({ icon: t[0], l: t[1], v: t[2], s: t[3], bg: t[4] }));
    out.ngStarts = starts.map((o, i) => { const on = i === stI; return { l: ss3Day(o.date), s: o.month + ": " + o.remaining + " of " + o.meetings + " meetings · ₦" + f(o.prorated), total: "₦" + f(o.total), sel: on ? "true" : "false", bd: on ? "#0b0b0c" : "#e2e2df", bg: on ? "#fafaf9" : "#fff", ring: on ? "5px solid #0b0b0c" : "1.5px solid #c9c9c5", onClick: () => this.setState({ ngStart: i }) }; });
    out.ngNoFees = !canInv;
    const counts = d.counts || {};
    out.ngTabs = SS3_GRAD_TABS.map(t => { const on = S.ngTab === t[0]; return { l: t[1], n: f(counts[t[0]] || 0), sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", nc: on ? "#ff9f43" : "#6b6b72", bd: on ? "#0b0b0c" : "#e2e2df",
      onClick: () => this.setState({ ngTab: t[0], ngPage: 0, ngSel: {} }, () => this.reload()) }; });
    const SM = { ready: ["Ready", T.neutral], promoted: ["NGG member · no invoice", T.warn], invoiced: ["Invoice sent", T.ink], paid: ["Paid · member", T.ok] };
    const rows = d.rows || [];
    const centreOf = r => S.ngC[r.id] || (r.options[0] || {}).name || "";
    const moved = res => {
      if (res && res.ok === false && !res.results) return this.fail(res);
      const list = (res && res.results) || (res && res.ok !== false ? [{ ok: true }] : []);
      const ok = list.filter(x => x.ok).length, bad = list.filter(x => !x.ok);
      this.toast(f(ok) + (ok === 1 ? " child is" : " children are") + " now NGG members." + (bad.length ? " " + f(bad.length) + " not moved: " + bad.slice(0, 3).map(x => (x.name || x.studentId || x.id) + " (" + ss3Err(x) + ")").join(", ") + "." : ""));
      this.setState({ ngSel: {} }); this.reload();
    };
    const invoiced = res => {
      if (!res || res.ok === false) return this.fail(res);
      this.toast(f(res.sent) + " joining invoices emailed." + (res.existed ? " " + f(res.existed) + " already had one." : "") + (res.refused ? " " + f(res.refused) + " not sent: " + (res.results || []).filter(x => !x.ok).slice(0, 3).map(x => x.name).join(", ") + "." : ""));
      this.setState({ ngSel: {} }); this.reload();
    };
    const promote = (list) => this.parked("Moving " + f(list.length) + (list.length === 1 ? " child" : " children") + " into NGG…",
      defer => list.length === 1 ? NGGApi.admin.club.promote(list[0].id, centreOf(list[0]), defer) : NGGApi.admin.club.promoteBulk(list.map(r => r.id), list.reduce((a, r) => (a[r.id] = centreOf(r), a), {}), defer), moved);
    const invoice = (list) => this.parked("Sending " + f(list.length) + " joining invoice" + (list.length === 1 ? "" : "s") + "…",
      defer => this.S().graduatesInvoice(list.map(r => r.memberId), st ? st.date : "", defer), invoiced);
    out.ngRows = rows.map(r => {
      const on = !!S.ngSel[r.id], sm = SM[r.stage] || SM.ready;
      const noCentre = r.stage === "ready" && !r.options.length;
      const act = r.stage === "ready" && canMove && !noCentre ? ["Move to NGG", () => promote([r]), "#0b0b0c", "#0b0b0c", "#fff"]
        : r.stage === "promoted" && canInv && r.hasEmail ? ["Send invoice", () => invoice([r]), "#f3c48f", "#fff7ec", "#6b3b00"]
        : r.stage === "invoiced" && canInv ? ["Resend", () => NGGApi.admin.membership.resend(r.invoiceId).then(() => this.toast("Invoice sent again to " + r.emailHint + ".")).catch(e => this.fail(e)), "#e2e2df", "#fff", "#0b0b0c"] : null;
      const note = noCentre ? "No NGG centre to offer — add one in Control Room → Centres" : r.stage === "ready" && !canMove ? "Needs the Club permission" : r.stage === "promoted" && !r.hasEmail ? "No guardian email" : r.stage === "promoted" && !canInv ? "With the Fees desk" : r.stage === "paid" ? "Receipt sent" : "";
      return { name: r.name, sub: [r.displayId, r.centre, r.track].filter(Boolean).join(" · "), ini: ss3Ini(r.name), tone: ss3Tone(r.id), rate: r.rate + "%",
        centre: r.stage === "ready" ? centreOf(r) : r.nggCentre, centreL: "NGG centre for " + r.name,
        opts: r.stage === "ready" ? r.options.map(o => ({ v: o.name, l: o.name + (o.km != null ? " · " + o.km + " km" : "") })) : [{ v: r.nggCentre, l: r.nggCentre || "—" }],
        lockC: r.stage !== "ready", onCentre: e => { const v = e.target.value; this.setState(s => ({ ngC: Object.assign({}, s.ngC, { [r.id]: v }) })); },
        st: sm[0], sbg: sm[1][0], sfg: sm[1][1], sel: on ? "true" : "false", selL: "Select " + r.name, cbd: on ? "#0b0b0c" : "#c9c9c5", cbg: on ? "#0b0b0c" : "#fff", cop: on ? 1 : 0, bg: on ? "#fafaf9" : "#fff",
        toggle: () => this.setState(s => ({ ngSel: Object.assign({}, s.ngSel, { [r.id]: !s.ngSel[r.id] }) })),
        hasAct: !!act, actL: act ? act[0] : "", act: act ? act[1] : null, abd: act ? act[2] : "", abg: act ? act[3] : "", afg: act ? act[4] : "", hasNote: !act && !!note, note };
    });
    const selRows = rows.filter(r => S.ngSel[r.id]), pageAll = rows.length > 0 && rows.every(r => S.ngSel[r.id]);
    Object.assign(out, { ngAllSel: pageAll ? "true" : selRows.length ? "mixed" : "false", ngAllBd: selRows.length ? "#0b0b0c" : "#c9c9c5", ngAllBg: selRows.length ? "#0b0b0c" : "#fff", ngAllIcon: pageAll ? "ph ph-check" : selRows.length ? "ph ph-minus" : "ph ph-check",
      ngTogglePage: () => this.setState(s => { const n = Object.assign({}, s.ngSel); rows.forEach(r => { n[r.id] = !pageAll; }); return { ngSel: n }; }),
      ngHasSel: selRows.length > 0, ngSelL: selRows.length ? f(selRows.length) + " selected" : "Select children to move them together", ngBarBg: selRows.length ? "#fff7ec" : "#fafaf9", ngClearSel: () => this.setState({ ngSel: {} }) });
    const canP = selRows.filter(r => r.stage === "ready" && r.options.length), canI = selRows.filter(r => r.stage === "promoted" && r.hasEmail);
    out.ngCanBulkPromote = canMove && canP.length > 0; out.ngBulkPromoteL = "Move " + f(canP.length) + " to NGG"; out.ngBulkPromote = () => promote(canP);
    out.ngCanBulkInvoice = canInv && canI.length > 0; out.ngBulkInvoiceL = "Send " + f(canI.length) + " joining invoice" + (canI.length === 1 ? "" : "s"); out.ngBulkInvoice = () => invoice(canI);
    const total = d.total || 0, size = d.pageSize || 25, pages = Math.max(1, Math.ceil(total / size)), pg = d.page || 0;
    Object.assign(out, { ngQ: S.ngQ, onNgQ: e => { const v = e.target.value; this.setState({ ngQ: v, ngPage: 0 }); clearTimeout(this.pqT); this.pqT = setTimeout(() => this.reload(), 250); },
      ngCountL: f(total) + " of " + f(counts.all || 0) + " graduates · finished with " + d.threshold + "% attendance or more",
      ngEmpty: !total, ngEmptyL: S.ngQ ? "Nobody matches “" + S.ngQ + "”." : S.ngTab === "ready" ? "Everyone who finished has been moved." : "Nobody at this stage yet.",
      ngPageL: total ? (pg * size + 1) + "–" + Math.min(total, pg * size + size) + " of " + f(total) : "", ngNoPrev: pg === 0, ngNoNext: pg >= pages - 1, ngPrevOp: pg === 0 ? 0.4 : 1, ngNextOp: pg >= pages - 1 ? 0.4 : 1,
      ngPrev: () => pg > 0 && this.setState({ ngPage: pg - 1 }, () => this.reload()), ngNext: () => pg < pages - 1 && this.setState({ ngPage: pg + 1 }, () => this.reload()) });
  }

  valsPalette(out, phone) {
    const S = this.state;
    out.hasPal = S.pal; out.palRef = this.palRef; out.palQ = S.palQ; out.closePal = () => this.setState({ pal: false });
    out.palPad = phone ? "0" : "72px 16px 16px"; out.palR = phone ? "0" : "16px"; out.palMaxH = phone ? "100%" : "min(560px, calc(100% - 96px))";
    if (!S.pal) { out.palGroups = []; out.palEmpty = false; return; }
    const q = S.palQ.trim().toLowerCase();
    const flatNav = SS3_NAV.reduce((a, g) => a.concat(g[1]), []);
    const kids = q.length >= 2 ? S.palKids : (q ? [] : S.recent);
    const pages = flatNav.filter(n => !q || n[1].toLowerCase().includes(q) || n[0].includes(q)).slice(0, q ? 5 : 6);
    const ACTS = [["Enrol a walk-in", "user-plus", () => this.go("registrations", { modal: "walk", walk: {}, mRes: null })], ["Send guardians a message", "paper-plane-tilt", () => this.go("messages")],
      ["Record an incident", "first-aid-kit", () => this.go("incidents", { incForm: true, incDraft: {} })], ["Open the check-in desk", "scan", () => this.go("desk")], ["Mint a batch of cards", "qr-code", () => this.go("cards", { modal: "mint", mRes: null })]];
    const acts = ACTS.filter(a => !q || a[0].toLowerCase().includes(q)).slice(0, 4);
    const G = [];
    if (kids.length) G.push([q ? "Children" : "Recent children", kids.map(p => { const pill = ss3Pill(p.today); return { l: p.name, sub: [p.displayId, p.centre, p.group || "No group"].filter(Boolean).join(" · "), ini: ss3Ini(p.name), tone: ss3Tone(p.id), rad: "50%", hasIni: true, hasIcon: false,
      pill: SS3_TODAY_L[p.today] || p.today, pbg: pill[0], pfg: pill[1], hasPill: true, run: () => this.openChild(p.id) }; })]);
    if (pages.length) G.push(["Pages", pages.map(n => ({ l: n[1], sub: "", icon: "ph ph-" + n[2], tone: "#f5f5f4", rad: "9px", hasIcon: true, hasIni: false, hasPill: false, run: () => this.go(n[0]) }))]);
    if (acts.length) G.push(["Actions", acts.map(a => ({ l: a[0], sub: "", icon: "ph ph-" + a[1], tone: "#fff1df", rad: "9px", hasIcon: true, hasIni: false, hasPill: false, run: () => { this.setState({ pal: false }); a[2](); } }))]);
    const items = []; G.forEach(g => g[1].forEach(it => items.push(it)));
    const pi = Math.min(S.palI, Math.max(0, items.length - 1));
    items.forEach((it, i) => { it.id = "pal-" + i; it.cur = i === pi; it.sel = i === pi ? "true" : "false"; it.bg = i === pi ? "#f3f3f1" : "transparent"; it.hasSub = !!it.sub; it.onClick = it.run; it.hover = () => { if (this.state.palI !== i) this.setState({ palI: i }); }; });
    out.palGroups = G.map(g => ({ h: g[0], items: g[1] })); out.palEmpty = !items.length && !!q; out.palAct = items.length ? "pal-" + pi : "";
    out.onPalQ = e => this.onPalQ(e.target.value);
    out.onPalKey = e => {
      if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ palI: Math.min(items.length - 1, pi + 1) }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ palI: Math.max(0, pi - 1) }); }
      else if (e.key === "Enter" && items[pi]) { e.preventDefault(); items[pi].run(); }
      else if (e.key === "Escape") this.setState({ pal: false });
    };
  }

  valsDrawer(out, phone) {
    const S = this.state, T = SS3_T, B = S.boot;
    out.hasSel = !!S.sel; out.closeSel = () => this.closeSel(); out.drawerW = phone ? "100%" : "460px";
    const p = S.child;
    if (!S.sel) return;
    if (!p) { out.sp = { name: S.childErr ? "Couldn’t open this child" : "Loading…", sub: S.childErr || "", ini: "", tone: "#f0f0ef", strip: [], consent: [] }; return; }
    const pill = ss3Pill(p.today), live = p.status === "active" && p.reg === "verified";
    const CV = { granted: ["Yes", T.ok], declined: ["No", T.neutral], "": ["Not answered", T.bad] };
    out.sp = { name: p.name, ini: ss3Ini(p.name), tone: ss3Tone(p.id), sub: [p.displayId, p.age != null ? p.age : "", p.centre, p.track].filter(x => x !== "").join(" · "), status: p.status,
      onStatus: e => { const v = e.target.value; this.S().studentStatus(p.id, v).then(() => { this.toast(p.name.split(" ")[0] + " is now " + v + "."); this.openChild(p.id); this.reload(); }).catch(x => this.fail(x)); },
      canAlert: live && p.today === "absent",
      alert: () => this.S().absenceAlert(p.id, "").then(r => this.toast(r && r.sent ? "Email sent to " + (p.guardian || "the guardian") + "." : "No email on file for " + (p.guardian || "the guardian") + (p.phone ? ". Call them on " + p.phone + " instead." : ". There is no phone either: ask the coordinator to add a guardian contact."))).catch(x => this.fail(x)),
      tel: p.phone ? "tel:" + p.phone : undefined, today: p.reg !== "verified" ? "Not confirmed" : SS3_TODAY_L[p.today] || p.today, tc: pill[1],
      todaySub: p.today === "absent" ? (p.lastSeen ? "Last seen " + ss3Day(p.lastSeen) : "Not seen yet this season") : p.today === "out" ? "Signed out " + p.outAt : p.inAt ? "In at " + p.inAt : "",
      rate: live && p.rate != null ? p.rate + "%" : "—", rc: p.rate != null && p.rate < B.riskRate ? "#a12a2a" : "#0b0b0c", days: p.days + " programme days",
      strip: (p.strip || []).map(s => ({ c: s.mark === "in" ? "#22a05a" : s.mark === "late" ? "#e0a100" : "#ececea", t: ss3Day(s.date) + ": " + (s.mark === "absent" ? "not in" : s.mark) })),
      hasGroup: !!p.group, noGroup: !p.group, group: p.group ? p.group + (p.groupCode ? " · " + p.groupCode : "") : "", placeL: "Place in a group",
      place: () => { this.setState({ modal: "place", mRes: null, placeIds: [{ id: p.id, name: p.name, centre: p.centre }], placeTo: (B.groups[0] || {}).id || "" }); },
      gName: p.guardian || "No guardian on file", gPhone: p.phone || "", gEmail: p.email || "",
      consent: (p.consents || []).map(c => { const v = c.status === "granted" ? "granted" : c.status ? "declined" : ""; const cv = CV[v]; const soft = !v && !c.required && !c.mustAnswer;
        return { l: c.label, v: cv[0], bg: soft ? T.neutral[0] : cv[1][0], fg: soft ? T.neutral[1] : cv[1][1] }; }),
      card: p.card ? "Card ending " + p.card.last4 : "No card yet",
      cardSub: p.card ? (p.card.expiresAt ? "Works until " + ss3Day(p.card.expiresAt) : "No expiry set") : "Give a blank card at the desk once registration is confirmed" };
  }

  valsModal(out) {
    const S = this.state, T = SS3_T, B = S.boot, md = S.modal;
    out.hasModal = !!md; out.closeModal = () => this.setState({ modal: null, mRes: null });
    out.mPlace = md === "place"; out.mWalk = md === "walk"; out.mMint = md === "mint";
    out.mHasResult = !!S.mRes; out.mResult = S.mRes ? S.mRes[0] : ""; out.mResBg = S.mRes ? T[S.mRes[1]][0] : ""; out.mResFg = S.mRes ? T[S.mRes[1]][1] : "";
    out.mCancelL = S.mRes && S.mRes[1] !== "bad" ? "Done" : "Cancel"; out.mCanGo = !(S.mRes && S.mRes[1] !== "bad") && !S.busy; out.mGoBg = md === "close" ? "#a12a2a" : "#0b0b0c";
    const finish = (msg, tone) => this.setState({ busy: false, mRes: [msg, tone || "ok"] });
    if (md === "place") {
      const ids = S.placeIds;
      out.mTitle = ids ? "Place " + ss3Fmt(ids.length) + (ids.length === 1 ? " child" : " children") + " in a group" : "Place children in a group";
      out.mBody = ids ? (ids.length ? "A group takes as many as it has seats for. Anyone who doesn’t fit is named, so nobody is silently left out." : "Every child already has a group.") : "Reading who has no group…";
      out.placeOpts = (B.groups || []).map(g => ({ v: g.id, l: g.name + (g.centre ? " · " + g.centre : "") + (g.cap ? " · " + g.cap + " seats" : "") }));
      out.placeTo = S.placeTo; out.onPlaceTo = e => this.setState({ placeTo: e.target.value });
      out.mGoL = "Place them"; if (!ids || !ids.length || !S.placeTo) out.mCanGo = false;
      out.mGo = () => {
        this.setState({ busy: true });
        this.S().groupAssign(S.placeTo, ids.map(x => x.id)).then(r => {
          const res = r.results || [], ok = res.filter(x => x.ok).length, bad = res.filter(x => !x.ok), gn = (B.groups.find(g => g.id === S.placeTo) || {}).name || "the group";
          const name = id => (ids.find(x => x.id === id) || {}).name || id;
          finish((ok ? "Placed " + ok + " in " + gn + "." : "Nobody was placed.") + (bad.length ? " Not placed: " + bad.slice(0, 6).map(x => name(x.studentId || x.id) + " (" + ss3Err(x) + ")").join(", ") + (bad.length > 6 ? " and " + (bad.length - 6) + " more" : "") + "." : ""), bad.length ? (ok ? "warn" : "bad") : "ok");
          this.boot(); if (S.sel) this.openChild(S.sel);
        }).catch(e => finish(ss3Err(e), "bad"));
      };
    }
    out.walkNote = "The guardian gets an email to confirm. The card works at the desk once they do, or as soon as a paper form is signed.";
    if (md === "confirm" && S.confirm) {
      const c = S.confirm;
      out.mTitle = c.title; out.mBody = c.body; out.mGoL = c.goL; out.mGoBg = "#a12a2a";
      out.mGo = () => { this.setState({ busy: true }); c.go().then(msg => { this.setState({ busy: false, modal: null, confirm: null }); this.toast(msg); }).catch(e => finish(ss3Err(e), "bad")); };
    }
    if (md === "early" && S.early) {
      out.mWalk = true; out.mTitle = "Let them go early"; out.mBody = "Sign-out hasn’t opened yet. Say why they are leaving; it is recorded against the sign-out.";
      out.walkFields = [{ l: "Reason", ph: "e.g. Collected by guardian for a clinic appointment", v: (S.walk || {}).reason || "", onChange: e => { const v = e.target.value; this.setState({ walk: { reason: v } }); } }];
      out.walkNote = "Only staff can do this. The door’s kiosk can’t let anyone go before sign-out.";
      out.mGoL = "Sign them out";
      out.mGo = () => { const why = ((S.walk || {}).reason || "").trim(); if (why.length < 3) return this.setState({ mRes: ["Say why they are leaving.", "bad"] }); this.setState({ modal: null, mRes: null }); S.early.run({ q: S.early.q, reason: why }); };
    }
    if (md === "walk") {
      const W2 = S.walk; const set = k => e => { const v = e.target.value; this.setState(s => ({ walk: Object.assign({}, s.walk, { [k]: v }) })); };
      out.mTitle = "Enrol a walk-in"; out.mBody = "For a child who turned up with a guardian but didn’t register online.";
      out.walkFields = [["fullName", "Child’s full name", "e.g. Ayomide Bakare"], ["age", "Age", "5 to 19"], ["centre", "Centre", (B.centres || []).join(", ") || "Centre name"], ["track", "Track", "e.g. Coding"],
        ["guardianName", "Guardian’s name", "e.g. Mrs Bakare"], ["guardianPhone", "Guardian’s phone", "080…"], ["parentEmail", "Guardian’s email", "For the confirmation link"], ["token", "Blank card code", "Scan or type it, or leave empty"]]
        .map(x => ({ l: x[1], ph: x[2], v: W2[x[0]] || "", onChange: set(x[0]) }));
      out.mGoL = "Enrol";
      out.mGo = () => {
        if (!(W2.fullName || "").trim() || !(W2.guardianPhone || "").trim()) return this.setState({ mRes: ["Add the child’s name and a guardian’s phone number.", "bad"] });
        this.setState({ busy: true });
        this.S().enroll(Object.assign({}, W2, { age: +W2.age || 0 })).then(r => {
          finish((W2.fullName.trim()) + " is enrolled" + (r.token || W2.token ? " and their card is linked" : "") + ". " + (W2.parentEmail ? "Their guardian has been emailed to confirm." : "Record a paper form to confirm them."));
          this.reload();
        }).catch(e => finish(ss3Err(e), "bad"));
      };
    }
    if (md === "mint") {
      out.mTitle = "Mint a batch of blank cards"; out.mBody = "Cards are printed before anyone enrols. Each one is linked to a child at enrolment. Print the batch from the ID Card Studio.";
      out.mintN = S.mintN; out.onMintN = e => this.setState({ mintN: e.target.value }); out.mGoL = "Mint the batch";
      out.mGo = () => {
        const n = Math.max(10, Math.min(500, +S.mintN || 0));
        this.setState({ busy: true });
        this.S().mint(n).then(r => { finish(ss3Fmt(r.count) + " blank cards minted as batch " + r.batch + "."); this.loadFor("cards"); }).catch(e => finish(ss3Err(e), "bad"));
      };
    }
    if (md === "close") {
      const ed = B.edition;
      out.mTitle = "Close " + (ed ? ed.name : "the season") + "?"; out.mBody = "Every desk stops taking check-ins straight away, and every volunteer of the season is sent a thank-you. You can still issue certificates and archive afterwards. Do this after the last session.";
      out.mGoL = "Close the season";
      out.mGo = () => {
        this.setState({ busy: true });
        this.S().editionStatus(ed.id, "closed").then(r => { this.setState({ busy: false, modal: null }); this.toast(ed.name + " closed. Desks have stopped taking check-ins" + (r && r.volunteersThanked ? ", and " + ss3Fmt(r.volunteersThanked) + " volunteers are being thanked." : ".")); this.boot(); })
          .catch(e => finish(ss3Err(e), "bad"));
      };
    }
  }

  render() {
    const S = this.state;
    if (!S.boot) {
      return <div className="ss3x ss3x-boot" ref={this.rootRef}>
        {S.bootErr
          ? <div className="ss3x-bootcard" role="alert"><h1>Couldn’t open the Summer School portal</h1><p>{S.bootErr}</p><button type="button" className="ss3x-btn" onClick={() => this.boot()}>Try again</button></div>
          : <div className="ss3x-bootcard" role="status"><span className="ss3x-spin" aria-hidden="true"/><p>Opening the Summer School portal…</p></div>}
      </div>;
    }
    return <div className="ss3x" data-busy={S.busy ? "true" : undefined}>{Ss3View(this.renderVals())}</div>;
  }
}

Object.assign(window, { Ss3Portal });
