/* ============================================================================
   Family Portal v3 — the controller for /family.

   Fp3View is the design, compiled (tools/dc-compile.js from
   docs/design/portals/family-portal-v3.dc.html). This class is the design's
   logic (its `class Component`) ported onto live data built by fp3-data.jsx.
   Every write goes through an op, waits for it, and says what the server
   refused in words. Nothing is recorded only on screen.

   Rules kept from the handoff (docs/design … README §2):
     · The URL is the state: /family?child=&view=&sub=&session=&st= — a
       refresh or a shared link opens the same screen.
     · Only one sub-tab's content is in the DOM at a time.
     · Profile, collectors and consents are read-only here; "Ask to change"
       is a request the desk decides.
     · No money on a child's own screens, and the training place is never in
       a total (the server's fees3 view, never client arithmetic).
     · A plan is shown only after a mentor approved it — the server returns
       none before that.
   Mobile is designed, not shrunk: a bottom tab bar, bottom sheets, one
   primary action full width, nothing that needs a hover.
   ========================================================================== */

/* Public names (the URL) ↔ the design's internal section keys. */
const FP3_VIEWS = { today: "today", saturdays: "attendance", growth: "progress", fees: "money", messages: "requests", account: "account", add: "add" };
const FP3_VIEW_OF = { today: "today", attendance: "saturdays", progress: "growth", money: "fees", requests: "messages", account: "account", add: "add", pending: "today" };
const FP3_SUB_PUBLIC = { req: "requests" };
const FP3_SUB_INTERNAL = { requests: "req" };
const FP3_STF = ["all", "charges", "payments", "fines", "place"];
const FP3_RELATIONSHIPS_FALLBACK = { parent: "Parent", guardian: "Guardian", carer: "Carer", relative: "Relative" };
const FP3_ERRORS = {
  bad_email: "That doesn’t look like an email address.", invalid: "That code isn’t right. Check the latest email and try again.",
  expired: "That code has expired. Ask for a new one.", already_used: "That link has already been used. Ask for a new one.",
  too_many_attempts: "Too many tries. Wait fifteen minutes, or ask for a new code.", suspended: "This family account is suspended. Contact the centre.",
  not_found: "That code and name don’t match a member. Check the code on their app. After a few wrong tries we pause for 15 minutes.",
  already_linked: "You’re already connected to this child.", too_many_wards: "A family account holds up to eight children.",
  not_ngg_member: "That code belongs to someone who isn’t an NGG member.", member_inactive: "That membership isn’t active. Contact the centre.",
  too_soon: "They were reminded today already.", slot_taken: "Someone booked that time a moment ago. Pick another.",
  closed: "Replies for that event have closed.", not_reviewed: "That plan hasn’t been checked by the mentor yet.",
  too_large: "That file is too large. Take a photo of the report instead.", bad_type: "Use a photo of the report (JPEG, PNG or WebP).",
  already_uploaded: "Those results are already uploaded.", read_only: "Your details can’t be edited here. Ask the centre to change them.",
  too_many_open: "You already have several of these waiting for a reply. The desk will answer them in turn.",
  need_reason: "Tell the centre a little more.", unauthorized: "You’ve been signed out. Sign in again.", network: "Couldn’t reach NGG. Check your connection and try again.",
};
function fp3Err(e, fallback) {
  if (!e) return fallback || "Something went wrong.";
  if (e.detail && typeof e.detail === "string") return e.detail;
  const c = e.code || e.message || "";
  return FP3_ERRORS[c] || (/fetch|network|Failed/i.test(c) ? FP3_ERRORS.network : "") || fallback || "Something went wrong. Try again.";
}
function fp3UrlState() {
  try {
    const q = new URLSearchParams(window.location.search);
    const view = q.get("view") || "";
    const sub = q.get("sub") || "";
    return { child: q.get("child") || "", sec: FP3_VIEWS[view] || "", sub: FP3_SUB_INTERNAL[sub] || sub, session: q.get("session") || "", st: FP3_STF.indexOf(q.get("st")) !== -1 ? q.get("st") : "all" };
  } catch (_) { return { child: "", sec: "", sub: "", session: "", st: "all" }; }
}

class Fp3Portal extends React.Component {
  constructor(props) {
    super(props);
    this.rootRef = React.createRef();
    const u = fp3UrlState();
    this.state = {
      me: undefined, meErr: "", mfaPending: "", wards: {}, wardErr: {}, inbox: null, inboxErr: "", events: null, eventsErr: "", rsvp: {},
      w: 1280, sec: u.sec || null, childId: u.child, sub: u.sub ? { [u.sec === "attendance" ? "attendance" : u.sec === "requests" ? "requests" : "progress"]: u.sub } : {},
      rsSession: u.session, stF: u.st, stN: 14, ibCat: "all",
      ttOpen: false, todoAll: false, sw: false, bank: false, sheet: null, shDone: null, shErr: "", busy: false,
      fFrom: "", fTo: "", fRef: "", fBody: "", fWhy: "lost", slot: 0, upFile: null, upName: "", msgId: null,
      siStep: "email", siEmail: "", siCode: "", siErr: "", siBusy: false,
      adCode: "", adName: "", adRel: "parent", adErr: "", adDone: null, adBusy: false,
      mfa: false, toast: "", online: typeof navigator === "undefined" ? true : navigator.onLine !== false, savedAt: "",
    };
  }

  /* ── lifecycle ─────────────────────────────────────────────────────── */
  componentDidMount() {
    const el = this.rootRef.current;
    // Push: this phone's registration kept true, and presence while the account is open (components.jsx).
    if (typeof nggPushBoot === "function") this._pushOff = nggPushBoot("family");
    this.ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { const r = this.rootRef.current; const w = Math.round((r && r.getBoundingClientRect().width) || window.innerWidth); if (Math.abs(w - this.state.w) > 8) this.setState({ w }); }) : null;
    if (this.ro && el) this.ro.observe(el); else this.setState({ w: window.innerWidth });
    this.onKey = e => {
      if (e.key === "Escape") { if (this.state.sw) { e.preventDefault(); return this.closeSw(); } if (this.state.sheet) { e.preventDefault(); return this.closeSheet(); } }
      const t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || this.state.sheet || this.state.sw || !this.state.me) return;
      const secs = ["today", "attendance", "progress", "money", "requests"];
      if (/^[1-5]$/.test(e.key)) this.go(secs[+e.key - 1]);
      else if (e.key === "[" || e.key === "]") { const l = this.links().filter(x => x.status !== "refused"); if (l.length > 1) { const i = Math.max(0, l.findIndex(x => x.linkId === this.curLink().linkId)); this.go(this.state.sec || "today", { childId: l[(i + (e.key === "]" ? 1 : l.length - 1)) % l.length].linkId }); } }
    };
    document.addEventListener("keydown", this.onKey);
    this.onPop = () => { const u = fp3UrlState(); this.setState(s => ({ sec: u.sec || null, childId: u.child || s.childId, sub: u.sub ? Object.assign({}, s.sub, { [u.sec]: u.sub }) : s.sub, rsSession: u.session, stF: u.st })); };
    window.addEventListener("popstate", this.onPop);
    this.onNet = () => this.setState({ online: navigator.onLine !== false });
    window.addEventListener("online", this.onNet); window.addEventListener("offline", this.onNet);
    this.onMfa = () => this.loadMfa();
    window.addEventListener("ngg:mfa-changed", this.onMfa);
    // Arrived from the sign-in email: spend the link, then strip it from the address bar.
    let token = "";
    try { token = new URL(window.location.href).searchParams.get("fsignin") || ""; } catch (_) {}
    if (token) {
      try { const u = new URL(window.location.href); u.searchParams.delete("fsignin"); window.history.replaceState({}, "", u.toString()); } catch (_) {}
      NGGApi.family.verify({ token, remember: true }).catch(e => this.setState({ siErr: fp3Err(e) })).finally(() => this.boot());
    } else this.boot();
  }
  componentWillUnmount() {
    if (this._pushOff) this._pushOff();
    this.ro && this.ro.disconnect(); document.removeEventListener("keydown", this.onKey);
    window.removeEventListener("popstate", this.onPop); window.removeEventListener("online", this.onNet); window.removeEventListener("offline", this.onNet);
    window.removeEventListener("ngg:mfa-changed", this.onMfa); clearTimeout(this.tt);
  }
  componentDidUpdate(_, prev) {
    // A sheet takes focus when it opens and gives it back when it closes.
    if (!prev.sheet && this.state.sheet) { this.sheetBack = document.activeElement; setTimeout(() => { const r = this.rootRef.current; const f = r && r.querySelector('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select, [role="dialog"] button'); if (f) f.focus(); }, 30); }
    if (prev.sheet && !this.state.sheet && this.sheetBack && this.sheetBack.focus) { try { this.sheetBack.focus(); } catch (_) {} this.sheetBack = null; }
    if (!prev.sw && this.state.sw) { this.swBack = document.activeElement; setTimeout(() => { const r = this.rootRef.current; const f = r && r.querySelector('[role="dialog"] button'); if (f) f.focus(); }, 30); }
    if (prev.sw && !this.state.sw && this.swBack && this.swBack.focus) { try { this.swBack.focus(); } catch (_) {} this.swBack = null; }
  }

  /* ── data ──────────────────────────────────────────────────────────── */
  boot() {
    this.setState({ meErr: "" });
    return NGGApi.family.me().then(d => {
      const me = d && d.guardian ? d : null;
      this.setState({ me, mfaPending: (d && d.mfaPending) || "", savedAt: new Date().toTimeString().slice(0, 5) }, () => {
        if (!me) return;
        const l = this.links();
        let child = this.state.childId;
        if (!l.some(x => x.linkId === child)) { try { child = localStorage.getItem("ngg.family.child") || ""; } catch (_) {} }
        if (!l.some(x => x.linkId === child)) child = (l.find(x => x.status === "active") || l[0] || {}).linkId || "";
        this.setState({ childId: child });
        l.filter(x => x.status === "active").forEach(x => this.loadWard(x.linkId));
        this.loadInbox(); this.loadEvents(); this.loadMfa();
      });
    }).catch(e => this.setState({ me: e && (e.status === 401 || e.code === "unauthorized") ? null : (this.state.me || null), meErr: e && e.status === 401 ? "" : fp3Err(e, "Couldn’t open your family account.") }));
  }
  loadWard(linkId) {
    this.setState(s => ({ wardErr: Object.assign({}, s.wardErr, { [linkId]: "" }) }));
    return NGGApi.family.ward(linkId).then(d => this.setState(s => ({ wards: Object.assign({}, s.wards, { [linkId]: d }) })))
      .catch(e => this.setState(s => ({ wardErr: Object.assign({}, s.wardErr, { [linkId]: fp3Err(e, "Couldn’t load this child’s page.") }) })));
  }
  loadInbox() { this.setState({ inboxErr: "" }); return NGGApi.family.inbox("").then(r => this.setState({ inbox: r.rows || [] })).catch(e => this.setState({ inboxErr: fp3Err(e, "Couldn’t load your messages.") })); }
  loadEvents() { this.setState({ eventsErr: "" }); return NGGApi.family.events().then(r => this.setState({ events: r.rows || [], rsvp: r.rsvp || {} })).catch(e => this.setState({ eventsErr: fp3Err(e, "Couldn’t load what’s coming up.") })); }
  loadMfa() { if (!NGGApi.auth || !NGGApi.auth.mfa) return; NGGApi.auth.mfa.status(true).then(s => this.setState({ mfa: !!(s && s.enrolled) })).catch(() => {}); }

  /* ── helpers ───────────────────────────────────────────────────────── */
  links() { return ((this.state.me && this.state.me.wards) || []).filter(x => x.status !== "refused"); }
  curLink() { const l = this.links(); return l.find(x => x.linkId === this.state.childId) || l[0] || {}; }
  today() { if (!this._today || Date.now() - this._todayAt > 60000) { this._today = fp3Lagos(); this._todayAt = Date.now(); } return this._today; }
  wardsAll() { const T = this.today(); return this.links().map(l => fp3Ward(l, this.state.wards[l.linkId] || null, T)); }
  inbox() { return fp3Inbox(this.state.inbox || []); }
  events() { return fp3Events(this.state.events || []); }
  naira(n) { return "₦" + Number(n || 0).toLocaleString("en"); }
  ini(n) { return String(n || "").split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
  toast(t) { clearTimeout(this.tt); this.setState({ toast: t }); this.tt = setTimeout(() => this.setState({ toast: "" }), 3800); }
  can() { if (!this.state.online) { this.toast("You’re offline. Try again when you’re connected."); return false; } return true; }
  /** One screen, one URL. `extra` may move the child (childId), a sub-tab or a filter. */
  go(sec, extra) {
    const next = Object.assign({ sec, sw: false, sheet: null, shDone: null, shErr: "" }, extra || {});
    this.setState(next, () => {
      this.pushUrl();
      const m = this.rootRef.current && this.rootRef.current.querySelector("main"); if (m) m.scrollTop = 0;
      try { window.scrollTo(0, 0); } catch (_) {}
      try { if (this.state.childId) localStorage.setItem("ngg.family.child", this.state.childId); } catch (_) {}
    });
  }
  pushUrl(replace) {
    try {
      const S = this.state, u = new URL(window.location.href), q = u.searchParams;
      const sec = S.sec || "today";
      ["child", "view", "sub", "session", "st"].forEach(k => q.delete(k));
      if (S.childId) q.set("child", S.childId);
      if (sec !== "today") q.set("view", FP3_VIEW_OF[sec] || sec);
      const sb = S.sub[sec]; if (sb) q.set("sub", FP3_SUB_PUBLIC[sb] || sb);
      if (sec === "progress" && S.rsSession) q.set("session", S.rsSession);
      if (sec === "money" && S.stF !== "all") q.set("st", S.stF);
      const url = u.pathname + (q.toString() ? "?" + q.toString() : "");
      if (url !== window.location.pathname + window.location.search) window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    } catch (_) {}
  }
  setSub(sec, sub) { this.setState(s => ({ sub: Object.assign({}, s.sub, { [sec]: sub }) }), () => this.pushUrl()); }
  closeSheet() { this.setState({ sheet: null, shDone: null, shErr: "", busy: false }); }
  closeSw() { this.setState({ sw: false }); }
  openSheet(kind, extra) { this.setState(Object.assign({ sheet: kind, shDone: null, shErr: "", fBody: "", fFrom: "", fTo: "", fWhy: "lost", busy: false }, extra || {})); }
  /** Run a write: busy while it goes, the server's refusal in words, then re-read what changed. */
  write(fn, done, after) {
    if (this.state.busy || !this.can()) return;
    this.setState({ busy: true, shErr: "" });
    return Promise.resolve().then(fn).then(r => { this.setState({ busy: false }); if (done) done(r); if (after) after(r); })
      .catch(e => this.setState({ busy: false, shErr: fp3Err(e) }));
  }
  /* Which things need this parent, per child — the one source of truth for
     the badges, the banner and the to-do list (SCREENS F1 §4). */
  needs(x) {
    const rs = [], W = { warn: ["#fdf2d8", "#7a5600"], bad: ["#fdeaea", "#a12a2a"], neutral: ["#efede8", "#48484e"] };
    if (x.status !== "active" || !x.loaded) return rs;
    x.conduct.fines.forEach(() => rs.push(["Fine to review", "ph ph-warning-circle", W.warn]));
    fp3Asks(x).forEach(a => rs.push([a.badge, "ph ph-hand-waving", W.warn]));
    if ((this.curRes(x) || {}).status === "missing") rs.push(["Results due", "ph ph-upload-simple", W.bad]);
    if (this.planOpen(x)) rs.push(["Plan to sign", "ph ph-signature", W.warn]);
    this.inbox().filter(m => m.sign && !m.signed && m.ward === x.linkId).forEach(() => rs.push(["Report to sign", "ph ph-file-text", W.neutral]));
    return rs;
  }
  curRes(x) { return (x.results || [])[0] || null; }
  planOpen(x) { const r = (x.results || []).find(y => y.status === "uploaded" && y.plan); return r && !r.plan.ack ? r : null; }

  /* ── writes ────────────────────────────────────────────────────────── */
  rsvp(e, answer) {
    if (!this.can()) return;
    const prev = this.state.rsvp[e.id];
    this.setState(s => ({ rsvp: Object.assign({}, s.rsvp, { [e.id]: answer }) }));
    NGGApi.family.act("rsvp", { eventId: e.id, answer })
      .then(() => this.toast(answer === "yes" ? "Thanks. The centre has you down." : "Thanks for telling us. The notes come to Messages afterwards."))
      .catch(err => { this.setState(s => ({ rsvp: Object.assign({}, s.rsvp, { [e.id]: prev }) })); this.toast(fp3Err(err)); });
  }
  readMsg(m) {
    if (!m.unread) return;
    this.setState(s => ({ inbox: (s.inbox || []).map(r => r.id === m.id ? Object.assign({}, r, { unread: false }) : r) }));
    NGGApi.family.act("notices.read", { noticeId: m.id }).catch(() => {});
  }
  signOut(all) { NGGApi.family.logout(!!all).catch(() => {}).finally(() => { this.setState({ me: null, wards: {}, inbox: null, events: null, sec: null }); if (all) this.toast("Signed out on every device"); }); }

  /* ── values for the view ───────────────────────────────────────────── */
  renderVals() {
    const S = this.state, T = { ok: ["#e8f5ec", "#17663a", "#22a05a"], warn: ["#fdf2d8", "#7a5600", "#e0a100"], bad: ["#fdeaea", "#a12a2a", "#d94141"], neutral: ["#efede8", "#48484e", "#9a9aa0"] };
    const W0 = S.w, wide = W0 >= 900, narrow = !wide, phone = W0 < 640, N = n => this.naira(n);
    const base = { rootRef: this.rootRef, frameW: "100%", frameH: "100%", frameR: "0", frameSh: "none", outerPad: "0" };
    const signedIn = !!S.me;
    const out = Object.assign(base, { signedIn, signedOut: !signedIn, wide, narrow, stop: e => e.stopPropagation(), hasToast: !!S.toast, toast: S.toast,
      toastB: narrow ? "92px" : "28px", h1: phone ? "28px" : "34px", mPad: phone ? "16px 14px 28px" : narrow ? "22px 20px 32px" : "32px 32px 64px", topPad: "10px" });

    if (!signedIn) {
      const step = S.siStep;
      Object.assign(out, { siEmailStep: step === "email", siCodeStep: step === "code", siEmail: S.siEmail, siCode: S.siCode, siHasErr: !!(S.siErr || S.meErr), siErr: S.siErr || S.meErr,
        siH: step === "email" ? "See how your child is doing at NGG." : "Check your email",
        siP: step === "email" ? "Attendance, lessons, fees and what their mentor says, all in one place. We’ll email you a code, so there’s no password to remember." : "We sent a 6-digit code to " + (S.siMasked || S.siEmail) + ". It works for 15 minutes.",
        onSiEmail: e => this.setState({ siEmail: e.target.value, siErr: "" }), onSiCode: e => this.setState({ siCode: e.target.value.replace(/\D/g, "").slice(0, 6), siErr: "" }),
        siSend: () => {
          if (S.siBusy) return;
          if (!/^\S+@\S+\.\S+$/.test(S.siEmail.trim())) return this.setState({ siErr: FP3_ERRORS.bad_email });
          this.setState({ siBusy: true, siErr: "" });
          NGGApi.family.request(S.siEmail.trim()).then(r => this.setState({ siStep: "code", siBusy: false, siMasked: (r && r.masked) || S.siEmail.trim(), siErr: r && r.delivery === false ? "We couldn’t send the email just now. Try again in a minute." : "" }))
            .catch(e => this.setState({ siBusy: false, siErr: fp3Err(e) }));
        },
        siVerify: () => {
          if (S.siBusy) return;
          if (S.siCode.length !== 6) return this.setState({ siErr: "The code is 6 digits." });
          this.setState({ siBusy: true, siErr: "" });
          NGGApi.family.verify({ email: S.siEmail.trim(), otp: S.siCode, remember: true }).then(() => {
            /* Sent here from a notice (/notice/<id>) to sign in: back to that notice, not the dashboard. */
            const next = new URLSearchParams(location.search).get("next") || "";
            if (/^\/notice\/[A-Za-z0-9-]+$/.test(next)) { location.assign(next); return; }
            this.setState({ siBusy: false, siStep: "email", siCode: "" }); this.boot(); })
            .catch(e => this.setState({ siBusy: false, siErr: fp3Err(e) }));
        },
        siBack: () => this.setState({ siStep: "email", siCode: "", siErr: "" }) });
      out.onSiKey = e => { if (e.key === "Enter") (S.siStep === "email" ? out.siSend : out.siVerify)(); };
      return out;
    }

    const D = S.me, g = D.guardian || {}, gName = g.fullName || g.email || "";
    const wards = this.wardsAll();
    const cur = this.curLink();
    const wi = Math.max(0, wards.findIndex(x => x.linkId === cur.linkId));
    const w = wards[wi];
    const active = !!(w && w.status === "active");
    const sec0 = S.sec || "today";
    const sec = !w ? "add" : (!active && ["today", "attendance", "progress", "money", "requests"].includes(sec0)) ? "pending" : sec0;
    const loaded = !active || !!w.loaded;
    const T0 = this.today();
    const stOf = x => {
      if (x.status !== "active") return ["Waiting for the centre to confirm", "#9a9aa0", "#6b6b72"];
      if (!x.loaded) return ["Loading…", "#9a9aa0", "#6b6b72"];
      const t = x.today;
      if (t.status === "starting") return ["Starts " + x.starting, "#9a9aa0", "#6b6b72"];
      if (t.status === "off") return ["No class today", "#9a9aa0", "#6b6b72"];
      return t.status === "present" ? ["In since " + t.in, T.ok[2], "#17663a"] : t.status === "late" ? ["In since " + t.in + " · late", T.warn[2], "#7a5600"] : ["Not in yet", T.bad[2], "#a12a2a"];
    };
    const pick = (x, i) => this.go(x.status === "active" ? (["add", "account", "pending"].includes(sec) ? "today" : sec) : "pending", { childId: x.linkId, rsSession: "" });
    out.wardList = wards.map((x, i) => { const on = i === wi && !["add", "account"].includes(sec); const s = stOf(x); return { name: x.member.fullName, first: x.member.first, ini: this.ini(x.member.fullName), tone: x.member.tone, sub: s[0], dot: s[1], sc: s[2], cur: on ? "true" : undefined, sel: on ? "true" : "false", bg: on ? "#fff" : "transparent", bd: on ? "#e8e5dd" : "transparent", onClick: () => pick(x, i) }; });
    if (narrow) out.wardList.forEach(x => { x.bg = x.sel === "true" ? "#fff" : "transparent"; x.bd = x.sel === "true" ? "#0b0b0c" : "#e8e5dd"; });
    const evs = this.events();
    const unanswered = evs.filter(e => e.expected && !S.rsvp[e.id]);
    wards.forEach((x, i) => { const rs = this.needs(x); const a = rs.length; const o = out.wardList[i]; o.reasons = rs.map(r => ({ l: r[0], icon: r[1], bg: r[2][0], fg: r[2][1] })); o.hasAlerts = a > 0; o.op = x.status === "active" ? 1 : 0.6; o.sh = o.sel === "true" ? "0 1px 3px rgba(11,11,12,.10)" : "none"; o.aria = x.member.fullName + ". " + o.sub + (rs.length ? ". " + rs.map(r => r[0]).join(", ") : ""); o.alerts = String(a); o.alertL = a ? rs.map(r => r[0]).join(" · ") : (x.status === "active" ? "All good" : "Waiting to connect"); o.alc = a ? "#7a5600" : "#6b6b72"; o.check = o.sel === "true"; o.onPick = () => { this.setState({ sw: false }); o.onClick(); }; });
    const cw = out.wardList[wi];
    { const nk = wards.filter((x, i) => x.status === "active" && +out.wardList[i].alerts > 0); const nt = nk.reduce((t, x) => t + +out.wardList[wards.indexOf(x)].alerts, 0);
      const rv = unanswered.length ? 1 : 0; const nAll = nt + rv; out.hasNeeds = nAll > 0; out.needsN = String(nAll); out.needsH = nAll + (nAll === 1 ? " thing needs you" : " things need you"); out.needsS = nk.map(x => x.member.first).concat(rv ? ["an event reply"] : []).join(", ");
      out.toNeeds = () => this.go("today", { todoAll: true, childId: nk.length && !nk.includes(w) ? nk[0].linkId : cur.linkId }); }
    out.kidsN = String(wards.length); out.cur = cw || {}; out.multi = wards.length > 1; out.hasSw = !!S.sw; out.openSw = () => this.setState({ sw: true }); out.closeSw = () => this.closeSw(); out.swAdd = () => { this.setState({ sw: false }); this.go("add", { adDone: null, adErr: "" }); };
    out.ctxL = !["add", "account"].includes(sec) && cw ? cw.first + "’s pages" : "Pages";
    out.swAria = cw ? (wards.length > 1 ? "Switch child. Showing " : "") + cw.aria : "Your children";
    const owed = active && loaded ? w.fees.payable : 0;
    const openReq = active && loaded ? w.requests.filter(r => r.status === "open").length : 0;
    const rMiss = active && loaded && (this.curRes(w) || {}).status === "missing", pOpen = active && loaded && !!this.planOpen(w);
    const unread = this.inbox().filter(m => m.unread).length;
    const tot = x => x.reduce((a, b) => a + b, 0);
    const NAV = [["today", "Today", "Today", "house-line"], ["attendance", "Saturdays", "Saturdays", "calendar-check"], ["progress", "Growth", "Growth", "chart-line-up"], ["money", "Fees & fines", "Fees", "wallet"], ["requests", "Messages", "Messages", "chat-circle-text"]];
    const HINT = active && loaded ? { today: [stOf(w)[0], stOf(w)[2]], attendance: [w.attendance.rateKnown && w.attendance.daysRan ? w.attendance.rate + "% this term" : w.starting ? "First Saturday " + w.starting : w.attendance.present + " Saturdays this term", w.attendance.rateKnown && w.attendance.rate < 80 ? "#a12a2a" : "#6b6b72"], progress: rMiss ? ["School results not uploaded", "#a12a2a"] : pOpen ? ["A plan to sign", "#7a5600"] : w.score ? ["Leadership index " + tot(w.score.now) + " of 100", "#6b6b72"] : ["First scorecard after four Saturdays", "#6b6b72"], money: !w.fees.enabled ? ["No fees on this account", "#6b6b72"] : owed ? [N(owed) + (w.fees.joining ? " · joining invoice" : " to pay"), "#7a5600"] : ["Nothing to pay", "#17663a"], requests: unread ? [unread + " unread", "#0b0b0c"] : openReq ? [openReq + " waiting for a reply", "#0b0b0c"] : ["Reports, alerts, requests", "#6b6b72"] } : {};
    const badges = { money: owed ? ["1", "#f5b026", "#2a1d00"] : null, progress: rMiss || pOpen ? [String((rMiss ? 1 : 0) + (pOpen ? 1 : 0)), "#f5b026", "#2a1d00"] : null, requests: unread + openReq ? [String(unread + openReq), "#0b0b0c", "#fff"] : null };
    out.navItems = NAV.map((n, ni) => { const on = sec === n[0] || (n[0] === "today" && sec === "pending"); const b = badges[n[0]]; return { label: n[1], short: n[2], icon: "ph ph-" + n[3], icon2: "ph ph-" + n[3], cur: on ? "page" : undefined, bg: on ? "#efede8" : "transparent", fw: on ? 600 : 500, c: on ? "#0b0b0c" : "#6b6b72", pill: on ? "#f5b026" : "transparent", hint: (HINT[n[0]] || [""])[0], hc: (HINT[n[0]] || ["", "#6b6b72"])[1], hasHint: !!HINT[n[0]], kbd: String(ni + 1), tip: n[1] + " · press " + (ni + 1), hasBadge: !!b, badge: b ? b[0] : "", bb: b ? b[1] : "", bf: b ? b[2] : "", onClick: () => this.go(n[0]) }; });
    Object.assign(out, { gName, gEmail: g.email, gIni: this.ini(gName || "N G"), accBg: sec === "account" ? "#fff" : "transparent", toAccount: () => this.go("account"), toAdd: () => this.go("add", { adDone: null, adErr: "" }),
      isToday: sec === "today" && loaded, isAtt: sec === "attendance" && loaded, isProg: sec === "progress" && loaded, isMoney: sec === "money" && loaded, isReq: sec === "requests" && loaded, isPending: sec === "pending", isAdd: sec === "add", isAcc: sec === "account" });
    out.showWardHead = active && loaded && ["attendance", "progress", "money", "requests"].includes(sec);
    out.viewTitle = { attendance: "Saturdays", progress: "Growth", money: "Fees & fines", requests: "Messages" }[sec] || "";
    if (w) out.wdMeta = wide ? w.member.fullName + " · " + [w.member.displayId, w.member.centre, w.member.track, w.member.level].filter(Boolean).join(" · ") : [w.member.displayId, w.member.track, w.member.level].filter(Boolean).join(" · ");
    if (w) out.wd = { name: w.member.fullName, first: w.member.first, ini: this.ini(w.member.fullName), tone: w.member.tone, centre: w.member.centre, meta: active ? [w.member.displayId, w.member.centre, w.member.track, w.member.level].filter(Boolean).join(" · ") : w.member.centre + " centre · waiting to connect" };
    const openSheet = (kind, extra) => this.openSheet(kind, extra);

    /* What <main> shows above and below the page: the offline line, and a
       child's page that is still loading or failed to (with Retry). */
    const wErr = active ? S.wardErr[w.linkId] : "";
    out.mainSlot = (
      <React.Fragment>
        {!S.online && <div className="fp3x-offline" role="status"><i className="ph ph-wifi-slash" aria-hidden="true"/>You’re offline. Showing what was saved at {S.savedAt || "your last visit"}. Changes wait until you’re back online.</div>}
        {active && !loaded && ["today", "attendance", "progress", "money", "requests"].includes(sec) && (wErr
          ? <div className="fp3x-state" role="alert"><p><b>Couldn’t load {w.member.first}’s page.</b> {wErr}</p><button type="button" className="fp3x-retry" onClick={() => this.loadWard(w.linkId)}>Try again</button></div>
          : <div className="fp3x-skel" role="status" aria-label={"Loading " + w.member.first + "’s page"}><span/><span/><span/><span/></div>)}
      </React.Fragment>
    );
    // Free messages on Telegram: the old account screen's one switch a parent controls, kept on Account.
    /* Support cases (support-desk.jsx) sit on Account: the household's own
       cases, opened here. A reply's email points to /family?view=account&case=N.
       A safeguarding worry is not a case: it goes straight to the lead by phone. */
    const supCase = Number(new URLSearchParams(window.location.search).get("case")) || 0;
    const supPhone = typeof CONTACT !== "undefined" ? CONTACT.phoneDisplay : "", supTel = typeof CONTACT !== "undefined" ? CONTACT.phone : "";
    /* Below the design's own page: on Today, what a parent can do next and
       what is coming; on Fees, paying ahead and telling the centre about a
       payment made offline. */
    const wl = active && loaded;
    out.mainSlotEnd = sec === "today" && wl ? <Fp3TodayMore key={w.linkId} c={this} w={w}/>
      : sec === "money" && wl && w.fees.enabled ? <div className="fp3x-more" key={w.linkId}><Fp3Ahead c={this} w={w}/><Fp3Paid c={this} w={w}/></div>
      // Anchor Circle, in the family account: the child's week on Growth (domain/circle.php).
      : sec === "progress" && wl ? <div className="fp3x-more" key={w.linkId}><Fp3Anchor c={this} linkId={w.linkId} first={w.member.first} role="parent"/></div>
      : sec === "account" ? <React.Fragment>
      {typeof NggSupportDesk === "function" ? <div className="fp3x-support"><NggSupportDesk api={NGGApi.family.support} initialCase={supCase} source="family"
        safeguard={supPhone ? { text: "Call " + supPhone, onClick: () => { location.href = "tel:" + String(supTel || supPhone).replace(/[^+\d]/g, ""); } } : null}
        onCase={n => { try { const u = new URL(window.location.href); if (n) u.searchParams.set("case", n); else u.searchParams.delete("case"); window.history.replaceState({}, "", u.toString()); } catch (_) {} }}/></div> : null}
      {typeof NggPushCard === "function" ? <div className="fp3x-push"><NggPushCard surface="family"/></div> : null}
      {typeof TelegramConnect === "function" ? <div className="fp3x-tg"><TelegramConnect/></div> : null}
    </React.Fragment> : null;

    if (active && loaded && sec === "today") {
      const hr = +T0.hm.slice(0, 2);
      out.nowL = fp3Date(T0.date) + " · " + T0.hm; out.acFs = phone ? "34px" : "40px";
      out.hello = (hr < 12 ? "Good morning, " : hr < 17 ? "Good afternoon, " : "Good evening, ") + (fp3First(gName) || "there");
      const t = w.today, first = w.member.first;
      /* The hours come with the day (family_day_times): the doors and grace from the attendance settings, sign-out from its rule or the timetable's close. */
      const doors = t.opensAt || "09:00", grace = t.grace != null ? t.grace : 10, outAt = t.signOutAt || t.dayEnd || "15:00";
      const s = t.status === "starting" ? ["neutral", "ph ph-flag-banner", "First Saturday: " + w.starting, "Doors open at " + doors + " at the " + w.member.centre + " centre. " + first + "’s mentor is " + w.member.mentor + "."]
        : t.status === "off" ? ["neutral", "ph ph-calendar-blank", "No class today", "NGG meets on Saturdays at " + w.member.centre + ". You get a text when " + first + " checks in."]
        : t.status === "present" ? ["ok", "ph ph-check-circle", "In since " + t.in, (t.out ? "Signed out at " + t.out + "." : "On time. Sign-out opens at " + outAt + ", and you’ll get a text when " + first + " leaves.")]
        : t.status === "late" ? ["warn", "ph ph-clock", "In since " + t.in + ", " + t.lateMinutes + " min late", "Doors open at " + doors + (grace ? " with " + grace + " minutes’ grace." : ".") + " You’ll get a text at sign-out."]
        : ["bad", "ph ph-door-open", "Not in yet", "Doors opened at " + doors + ". If " + first + " is away today, tell the centre here and the day is marked excused."];
      /* "Not in yet" names the fix: tell the centre about the absence, from here. */
      out.st = { bg: T[s[0]][0], fg: T[s[0]][1], icon: s[1], h: first + " · " + s[2], s: s[3], hasAct: s[0] === "bad", actL: "Tell the centre", act: () => this.openSheet("leave") };
      const m = x => +String(x).split(":")[0] * 60 + +String(x).split(":")[1];
      const nowM = T0.mins;
      const ttAll = w.timetable.map(c => { const now = m(c[0]) <= nowM && nowM < m(c[1]); return { time: c[0] + "–" + c[1], name: c[2], sub: [c[3], c[4]].filter(Boolean).join(" · "), now, bg: now ? "#fdf6e3" : "transparent", fw: now ? 700 : 600, past: m(c[1]) <= nowM }; });
      const ni = ttAll.findIndex(c => c.now), nx = ttAll.findIndex(c => !c.past && !c.now);
      ttAll.forEach((c, i) => { c.hasTag = c.now || i === nx; c.tag = c.now ? "Now" : "Next"; c.tbg = c.now ? "#0b0b0c" : "#efede8"; c.tfg = c.now ? "#f5b026" : "#48484e"; });
      const focus = [ni, nx].filter(i => i >= 0);
      const short = t.status === "starting" || t.status === "off" ? [] : (focus.length ? focus.map(i => ttAll[i]) : ttAll.slice(0, 2));
      out.ttShown = S.ttOpen ? ttAll : short; out.hasTT = ttAll.length > short.length; out.ttOpenA = S.ttOpen ? "true" : "false";
      out.ttL = S.ttOpen ? "Show less" : "Full day at " + w.member.centre + " · " + ttAll.length + " block" + (ttAll.length === 1 ? "" : "s"); out.ttIcon = S.ttOpen ? "ph ph-caret-up" : "ph ph-caret-down"; out.toggleTT = () => this.setState(st => ({ ttOpen: !st.ttOpen })); out.ttW = phone ? "84px" : "96px";
      // No blocks to show (no class today, not started): the band alone, not a band over an empty white strip.
      out.ttPad = out.ttShown.length || out.hasTT ? "8px 16px 4px" : "0";
      const todo = [];
      wards.forEach(x => {
        if (x.status !== "active" || !x.loaded) return;
        x.conduct.fines.forEach(fn => todo.push(["ph ph-warning-circle", "A " + N(fn.amount) + " fine for " + x.member.first, fn.reason, "Pay or appeal it", () => this.go("money", { childId: x.linkId }), "warn"]));
        fp3Asks(x).forEach(a => todo.push(["ph ph-hand-waving", a.h, a.s, a.cta, () => this.go("money", { childId: x.linkId }), "warn"]));
        const cr0 = this.curRes(x); if (cr0 && cr0.status === "missing") todo.push(["ph ph-upload-simple", x.member.first + "’s " + cr0.name + " results aren’t in yet", "Due " + cr0.due + ". Members upload their results every session, and the mentor builds the plan from them. You can upload the report for them.", "Upload the report", () => this.go("progress", { childId: x.linkId, rsSession: "", sub: Object.assign({}, S.sub, { progress: "results" }), sheet: "upload", upFile: null, upName: "" }), "warn"]);
        const po = this.planOpen(x); if (po) todo.push(["ph ph-signature", "Read and sign " + x.member.first + "’s session plan", "Built from the " + po.name + " results and checked by " + po.plan.reviewedBy + ".", "Read and sign", () => this.go("progress", { childId: x.linkId, rsSession: po.id, sub: Object.assign({}, S.sub, { progress: "results" }) }), "neutral"]);
      });
      this.inbox().filter(mm => mm.sign && !mm.signed).forEach(mm => todo.push(["ph ph-file-text", "Sign: " + mm.h, "So the mentor knows home has seen it.", "Read and sign", () => { this.readMsg(mm); openSheet("msg", { msgId: mm.id }); }, "neutral"]));
      unanswered.slice(0, 1).forEach(e => todo.push(["ph ph-calendar-star", "Can you come? " + e.title, e.date + " · " + e.time + ". Families are expected.", "Reply", () => this.go("attendance", { sub: Object.assign({}, S.sub, { attendance: "coming" }) }), "neutral"]));
      const RANK = { "ph ph-hand-waving": 0, "ph ph-warning-circle": 0, "ph ph-upload-simple": 1, "ph ph-signature": 2, "ph ph-file-text": 3, "ph ph-calendar-star": 4 };
      todo.sort((a, b) => RANK[a[0]] - RANK[b[0]]);
      out.todoN = String(todo.length); out.todoMore = todo.length > 3; out.todoMoreL = S.todoAll ? "Show fewer" : "Show " + Math.min(5, todo.length - 3) + " more"; out.toggleTodo = () => this.setState(st => ({ todoAll: !st.todoAll }));
      out.todo = todo.slice(0, S.todoAll ? 8 : 3).map((x, ti) => ({ bt: ti ? "1px solid #f1efea" : "0", icon: x[0], h: x[1], s: x[2], cta: x[3], onClick: x[4], bg: x[5] === "warn" ? "#fffaf0" : "#fff", bd: x[5] === "warn" ? "#f3e3bb" : "#e8e5dd", ibg: x[5] === "warn" ? "#fdf2d8" : "#efede8", ifg: x[5] === "warn" ? "#7a5600" : "#3a3a40" }));
      out.hasTodo = todo.length > 0;
      { const F = w.fees, P = F.programme || {}, pend = !!F.offlinePending;
        const chip = !F.enabled ? "Not set up" : P.paused ? "Paused" : ({ starting: "Starts " + (F.joining ? F.joining.start : (w.starting || "soon")), training: "In training", service: "Serving · " + P.pct + "% earned off", complete: "MOU complete" }[P.phase] || "In training");
        const actv = wards.filter(x => x.status === "active" && x.loaded), house = actv.reduce((tt, x) => tt + (x.fees.payable || 0), 0);
        out.ac = { h: first + "’s account", lab: !F.enabled ? "No fees" : F.joining ? "Joining invoice" : F.payable ? "To pay now" : "All paid", amount: N(F.payable),
          sub: !F.enabled ? "The centre hasn’t set up fees for " + first + "’s account." : F.payable ? (F.joining ? "Membership and the first month’s commitment fee, charged only for the Saturdays left." : fp3Owed(F.lines)) : "Thank you. Nothing is owed for " + first + ".",
          canPay: F.payable > 0 && !pend, payL: F.payOnline ? "Pay " + N(F.payable) : "How to pay", pay: () => F.payOnline ? openSheet("pay") : this.go("money", { bank: true }), pending: pend && F.payable > 0, pendingL: "Bank transfer being checked",
          facts: [["Next charge", F.next[0] ? N(F.next[0].amount) : "—", F.next[0] ? F.next[0].when : "Nothing scheduled"]]
            .concat(F.ahead && F.ahead.paidThrough ? [["Paid ahead", "to " + F.ahead.paidThroughL, N(F.ahead.credit) + " held on the account"]] : [])
            .concat([["Training place", chip, "Covered by NGG, not a bill"]]).concat(actv.length > 1 ? [["All your children", N(house), house ? "To pay across " + actv.length + " children" : "Nothing owed"]] : []).map(f => ({ l: f[0], v: f[1], s: f[2] })),
          labBg: !F.enabled || !F.payable ? "#16301f" : "#3a2c0a", labFg: !F.enabled || !F.payable ? "#8fe0ad" : "#f8d98a",
          toFees: () => this.go("money") }; }
      const rc = this.curRes(w), sDelta = w.score ? tot(w.score.now) - tot(w.score.prev) : 0;
      const cr = { on_track: ["On track", "#17663a"], watch: ["Worth watching", "#7a5600"], at_risk: ["Needs support", "#a12a2a"], none: ["Not yet", "#6b6b72"] }[w.companion.rating] || ["Not yet", "#6b6b72"];
      out.tiles = [
        ["ph ph-calendar-check", "Attendance", w.attendance.rateKnown && w.attendance.daysRan ? w.attendance.rate + "%" : String(w.attendance.present), w.attendance.rateKnown && w.attendance.daysRan ? w.attendance.present + " of " + w.attendance.daysRan + " Saturdays this term" : w.starting ? "Starts " + w.starting : "Saturdays this term", w.attendance.rateKnown && w.attendance.rate < 80 ? "#a12a2a" : "#0b0b0c", "attendance"],
        ["ph ph-chart-line-up", "Leadership index", w.score ? String(tot(w.score.now)) : "—", w.score ? (w.score.hasPrev ? (sDelta >= 0 ? "+" : "−") + Math.abs(sDelta) + " since last month · of 100" : "of 100 · first scorecard") : "First score after four Saturdays", "#0b0b0c", "progress", "score"],
        ["ph ph-exam", "School results", rc ? (rc.status === "uploaded" ? (rc.avg != null ? rc.avg + "%" : "In") : rc.status === "processing" ? "Reading" : "Missing") : "—", rc ? (rc.status === "uploaded" ? rc.name + " average" : rc.status === "processing" ? "The plan goes to the mentor first" : "Due " + rc.due) : "Nothing due yet", rc && rc.status === "missing" ? "#a12a2a" : "#0b0b0c", "progress", "results"],
        ["ph ph-heart", "Mentor says", cr[0], w.member.hasMentor ? w.member.mentor + (w.companion.period ? " · " + w.companion.period.replace("Week of ", "w/c ") : "") : "No mentor yet", cr[1], "progress", "mentor"],
      ].map(k => ({ icon: k[0], l: k[1], v: k[2], s: k[3], c: k[4], onClick: () => this.go(k[5], { sub: Object.assign({}, S.sub, { [k[5]]: k[6] || "record" }) }) }));
      out.inbox = this.inbox().filter(mm => mm.ward === "all" || mm.ward === w.linkId).slice(0, 3).map(mm => ({ icon: mm.icon, h: mm.h, b: mm.b, t: mm.t, dot: mm.unread ? "#f5b026" : "transparent", fw: mm.unread ? 600 : 500, onClick: () => { this.readMsg(mm); openSheet("msg", { msgId: mm.id }); } }));
      out.toInbox = () => this.go("requests", { sub: Object.assign({}, S.sub, { requests: "inbox" }) });
    }

    if (active && loaded && sec === "attendance") {
      const a = w.attendance, first = w.member.first, rate = a.rate || 0;
      out.att = { rate: a.rateKnown ? rate + "%" : String(a.present), ring: a.rateKnown ? "conic-gradient(" + (rate >= 85 ? "#22a05a" : rate >= 70 ? "#e0a100" : "#d94141") + " " + rate + "%, #efede8 0)" : "conic-gradient(#22a05a 100%, #efede8 0)",
        h: a.rateKnown && a.daysRan ? a.present + " of " + a.daysRan + " Saturdays this term" : a.present ? a.present + " Saturday" + (a.present === 1 ? "" : "s") + " in so far" : "No Saturdays yet",
        s: w.today.status === "starting" ? "First Saturday: " + w.starting + "." : w.today.status === "present" ? "Today: in at " + w.today.in + ", on time." : w.today.status === "late" ? "Today: in at " + w.today.in + ", " + w.today.lateMinutes + " minutes late." : w.today.status === "off" ? "No class today." : "Today: not in yet.",
        strip: a.recent.map((d, i) => { const M = { p: ["#22a05a", "#fff", "ph ph-check", "In"], l: ["#e0a100", "#2a1d00", "ph ph-clock", "Late"], a: ["#d94141", "#fff", "ph ph-x", "Missed"], x: ["#e8e5dd", "#6b6b72", "ph ph-minus", "No record"] }[d]; return { c: M[0], fg: M[1], icon: M[2], t: (i === a.recent.length - 1 ? "Last Saturday" : (a.recent.length - 1 - i) + " weeks before") + ": " + M[3] }; }),
        hasLate: a.late.length > 0, late: a.late.map(l => ({ date: l.date, min: l.minutes + " min late" })) };
      const ex = w.excuses;
      /* The revised rules come from the server in sentences (policy_member_rule_lines), so this box cannot
         state a time or an amount the engine does not use; the older ladder keeps its own lines. */
      const session = ex && ex.rulebook === "session";
      out.dayRules = (session
        ? [["ph ph-check-circle", "Absences with permission: " + ex.used + " of " + ex.max + " used this session" + (ex.ahead ? ", " + ex.ahead + " still ahead" : "") + ". Ask on the dashboard — asking is not approval until the centre says yes."]].concat(ex.recorded ? [["ph ph-warning", ex.recorded + " absence" + (ex.recorded === 1 ? "" : "s") + " without permission this session; " + ex.suspendAfter + " is a suspension."]] : []).concat(ex.rules || [])
        : (ex ? [["ph ph-calendar-x", "Absences: " + ex.used + " of " + ex.max + " allowed in the programme" + (ex.ahead ? ", " + ex.ahead + " of them still ahead" : "") + (ex.left ? ". " + ex.left + " left." : ". None left — a further absence starts a review, so speak to the centre in an emergency.")]].concat(ex.fine ? [["ph ph-receipt", "An absence nobody told the centre about is fined " + N(ex.fine) + ". If you’ve asked, nothing is charged until the centre answers."]] : []) : []).concat([["ph ph-door-open", "Doors open at 09:00. After 09:10 it counts as late."]]))
        .concat([["ph ph-sign-in", "You get a text and email when " + first + " checks in, and again at sign-out."], ["ph ph-sign-out", "Sign-out opens at " + ((w.today && (w.today.signOutAt || w.today.dayEnd)) || "15:00") + ". Leaving earlier needs a coordinator, so collect them from the desk."], ["ph ph-warning", "Leaving without signing out counts as “no sign-out” and can be fined. You’ll be told the same day."]]).map(r => ({ icon: r[0], t: r[1] }));
      out.leaveL = "Tell the centre " + first + " will be away"; out.newLeave = () => openSheet("leave");
    }

    if (active && loaded && sec === "progress") {
      const L = w.learning;
      out.lr = { done: String(L.completed), of: "of " + L.total + " lessons done · " + L.pct + "%", pct: L.pct + "%", hasOver: L.overdue > 0, overL: L.overdue + " overdue",
        next: L.next.map(u => ({ title: u.title, sub: u.course + " · week " + u.week + " · " + u.due, dc: u.overdue ? "#a12a2a" : "#6b6b72", icon: u.overdue ? "ph ph-warning-circle" : u.status === "in_progress" ? "ph ph-play-circle" : "ph ph-circle", ibg: u.overdue ? "#fdeaea" : u.status === "in_progress" ? "#fdf1d6" : "#efede8", ifg: u.overdue ? "#a12a2a" : u.status === "in_progress" ? "#6b4b00" : "#6b6b72" })),
        note: "Lessons are done on the member app. You can see what’s done, but not " + w.member.first + "’s answers." };
      const c = w.companion; const R = { on_track: ["On track", T.ok], watch: ["Worth watching", T.warn], at_risk: ["Needs support", T.bad], none: ["Not yet", T.neutral] }[c.rating] || ["Not yet", T.neutral];
      out.cm = { rating: R[0], bg: R[1][0], fg: R[1][1], dot: R[1][2], summary: c.summary || "The first weekly check-in comes after " + w.member.first + "’s first Saturday.", by: c.by, period: c.period };
      const k = w.conduct;
      out.cd = k.state === "good" ? { icon: "ph ph-seal-check", ibg: T.ok[0], ifg: T.ok[1], h: "Conduct: in good standing", s: "No warnings or fines this term." }
        : { icon: "ph ph-warning", ibg: T.warn[0], ifg: T.warn[1], h: k.fines.length ? "Conduct: " + k.fines.length + " fine" + (k.fines.length === 1 ? "" : "s") + " to review" : "Conduct: a warning this month", s: (k.reason || (k.fines[0] ? k.fines[0].reason + "." : "")) + " A third one starts a review with the centre lead." };
      out.priv = { h: "Between " + w.member.first + " and their mentor", items: ["Journal", "Reflections", "Coach chats", "Messages with their mentor"], p: "Their mentor reads these; you don’t, so " + w.member.first + " can be honest. If a mentor is ever worried about " + w.member.first + "’s safety, the centre calls you straight away." };
    }

    if (active && loaded && sec === "money") {
      const F = w.fees, P = F.programme || {}, TM = F.terms || {}, J = F.joining, first = w.member.first;
      const pend = !!F.offlinePending, online = F.payOnline && !pend;
      const KI = { dues: "ph ph-calendar-check", membership: "ph ph-identification-badge", fine: "ph ph-warning", adjustment: "ph ph-pencil-simple-line", payment: "ph ph-arrow-down-left", waiver: "ph ph-hand-heart", training: "ph ph-graduation-cap", writeoff: "ph ph-graduation-cap" };
      const lines = J ? J.items : F.lines;
      const ref = J ? J.invoiceId : "NGG-BAL-" + String(w.member.displayId || "").replace(/-/g, "");
      const isPlace = r => r.kind === "training" || r.kind === "writeoff";
      const FIL = { all: () => true, charges: r => r.dir === "charge" && !isPlace(r), payments: r => r.dir === "credit" && !isPlace(r), fines: r => r.kind === "fine", place: isPlace };
      const list = F.entries.filter(FIL[S.stF] || FIL.all);
      const shown = list.slice(0, S.stN);
      const rows = []; let curM = "";
      shown.forEach(r => {
        if (r.month !== curM) { curM = r.month; const inM = list.filter(x => x.month === curM && !isPlace(x) && !x.void); const ch = inM.filter(x => x.dir === "charge").reduce((tt, x) => tt + x.amount, 0), pd = inM.filter(x => x.dir === "credit").reduce((tt, x) => tt + x.amount, 0); rows.push({ head: true, item: false, month: curM, net: [ch ? "Charged " + N(ch) : "", pd ? "Paid " + N(pd) : ""].filter(Boolean).join(" · ") }); }
        const pl = isPlace(r), crd = r.dir === "credit";
        rows.push({ head: false, item: true, note: r.note, when: r.when, icon: KI[r.kind] || "ph ph-receipt", amount: (crd ? "− " : "") + N(r.amount), ac: pl ? "#6b6b72" : crd ? "#17663a" : "#0b0b0c", nc: pl ? "#4a4a50" : "#0b0b0c", td: r.void ? "line-through" : "none", ibg: pl ? "#efede8" : crd ? T.ok[0] : r.kind === "fine" ? T.warn[0] : "#efede8", ifg: pl ? "#6b6b72" : crd ? T.ok[1] : r.kind === "fine" ? T.warn[1] : "#3a3a40", hasTag: pl || !!r.void, tag: r.void ? "Cancelled" : "Covered by NGG, not a bill" });
      });
      const TABS = [["all", "All"], ["charges", "Charges"], ["payments", "Payments"], ["fines", "Fines"], ["place", "Training place"]];
      const bk = F.bank;
      out.mo = {
        lab: !F.enabled ? "Fees aren’t switched on" : J ? "Joining invoice · " + J.invoiceId : F.payable ? "To pay now" : "Nothing to pay", amount: N(F.payable),
        sub: !F.enabled ? "The centre hasn’t set up fees for " + first + "’s account. Nothing is owed." : J ? first + "’s place at " + w.member.centre + " is confirmed. Paying this completes membership. " + first + "’s first Saturday is " + J.start + "." : F.payable ? "What’s owed on " + first + "’s account today." : "Thank you. Nothing is owed for " + first + ".",
        hasLines: F.payable > 0 && lines.length > 0,
        lines: lines.map((l, i) => ({ icon: KI[l.kind] || "ph ph-receipt", label: l.label, detail: l.detail, amount: N(l.amount), bt: i ? "#2a2a2e" : "transparent" })),
        pending: pend && F.payable > 0, pendingL: "A bank transfer for " + N(F.payable) + " is with the desk to check. Online payment is paused until it’s checked, so nobody pays twice.",
        canPay: F.payable > 0 && !pend, online, bankOpen: S.bank ? "true" : "false", showBank: (S.bank || !online) && F.payable > 0 && !pend && !!bk,
        bank: bk ? [["Account name", bk.name, "inherit"], ["Bank", bk.bank, "inherit"], ["Account no.", bk.account, "'Geist Mono', monospace"], ["Amount", N(F.payable), "'Geist Mono', monospace"], ["Reference", ref, "'Geist Mono', monospace"]].map(b => ({ k: b[0], v: b[1], ff: b[2] })) : [],
        hasFines: w.conduct.fines.length > 0,
        fines: w.conduct.fines.map(x => ({ amount: N(x.amount), when: x.when, reason: x.reason, canAppeal: true, appealed: false, appeal: () => openSheet("appeal", { fRef: (w.charges.find(c => /fine/i.test(c.label)) || w.charges[0] || {}).id || "" }) })),
        next: F.next.map(x => ({ label: x.label, when: x.when, amount: N(x.amount) })),
        termsL: "Membership is " + N(TM.membershipFee) + " a year, renewed on the date " + first + " joined. The commitment fee is " + N(TM.monthly) + " a month, charged on the 1st; a first month is charged only for the Saturdays left." + (TM.remindEvery ? " While something is owed, a reminder is emailed every " + TM.remindEvery + " days." : ""),
        stTabs: TABS.map(tb => { const on = S.stF === tb[0]; return { l: tb[1], sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#d9d6cd", onClick: () => this.setState({ stF: tb[0], stN: 14 }, () => this.pushUrl(true)) }; }),
        rows, stCount: list.length + (list.length === 1 ? " entry" : " entries"), stEmpty: !list.length, stEmptyL: S.stF === "fines" ? "No fines. " + first + " has a clean record." : "Nothing here yet.",
        stMore: list.length > S.stN, stMoreL: "Show " + Math.min(20, list.length - S.stN) + " more of " + (list.length - S.stN), showMore: () => this.setState(s2 => ({ stN: s2.stN + 20 })),
      };
      const tm = P.trainingMonths || 0, sm = P.serviceMonths || 0, leave = " If " + first + " leaves before the MOU is complete, the part not yet earned off becomes due.";
      const PH = {
        starting: ["Starts " + (J ? J.start : (w.starting || "soon")), T.neutral, N(0), "nothing yet", "NGG covers the cost of " + first + "’s training place. It shows here as it builds up, so nothing comes as a surprise, and service earns it off: " + tm + " months of training, then " + sm + " months of service." + leave],
        training: ["In training", T.neutral, N(P.cost), "what " + first + "’s training has cost NGG so far", "Not a bill, and not part of what you pay. From " + (P.serviceStarts || "the end of training") + ", each month of service earns part of it off. When the MOU is complete it is fully covered." + leave],
        service: ["Serving · " + P.pct + "% earned off", T.ok, N(P.cost), "cost of the place · " + N(P.covered) + " earned off so far", "Not a bill, and not part of what you pay. Each month of service earns part of it off: " + P.servedMonths + " of " + sm + " months so far. Fully covered on " + P.completes + "." + leave],
        complete: ["MOU complete", T.ok, N(P.cost), "fully covered by NGG", first + " has completed the MOU. The training place is fully covered."],
      }[P.phase] || ["In training", T.neutral, N(P.cost), "", ""];
      const paused = P.paused ? " Earning off is paused while " + first + " is suspended, and starts again when the suspension ends." : "";
      out.pp = { h: "Training place", chip: P.paused ? "Paused" : PH[0], cbg: P.paused ? T.warn[0] : PH[1][0], cfg: P.paused ? T.warn[1] : PH[1][1], cost: PH[2], costL: PH[3], note: PH[4] + paused,
        tFlex: String(tm || 1), sFlex: String(sm || 1), tFill: tm ? Math.min(100, Math.round((P.months || 0) / tm * 100)) + "%" : "0%", sFill: sm ? Math.round((P.servedMonths || 0) / sm * 100) + "%" : "0%",
        tL: "Training · " + tm + " months", sL: "Service · " + sm + " months", aria: first + " is " + (P.months || 0) + " months into " + (tm + sm) + ". " + (P.servedMonths || 0) + " months of service done." };
      out.openPay = () => openSheet("pay"); out.toggleBank = () => this.setState(s2 => ({ bank: !s2.bank }));
      out.appealAny = () => openSheet("appeal", { fRef: (w.charges[0] || {}).id || "" });
    }

    if (active && loaded && sec === "requests") {
      out.reqKinds = [["leave", "ph ph-calendar-blank", "Tell the centre about an absence", "Before or after. They’re marked excused."], ["appeal", "ph ph-scales", "Appeal a charge", "A fine or fee you think is wrong"], ["idcard", "ph ph-identification-card", "Replacement ID card", "Lost, damaged or wrong name"], ["academic", "ph ph-graduation-cap", "Academic leave", "Weeks away for exams or a school programme"], ["mentor", "ph ph-chat-teardrop-text", "Ask the mentor", "About growth, results or the plan"]]
        .filter(k => k[0] !== "mentor" || w.member.hasMentor)
        .map(k => ({ icon: k[1], l: k[2], s: k[3], onClick: () => openSheet(k[0], { fRef: (w.charges[0] || {}).id || "" }) }));
      const SM = { open: ["With the desk", T.warn], approved: ["Approved", T.ok], declined: ["Not approved", T.bad], withdrawn: ["Withdrawn", T.neutral] };
      out.reqs = w.requests.map(r => ({ h: (r.kindLabel || r.kind) + (r.subject ? ": " + r.subject : ""), sub: (r.from ? r.from + (r.to && r.to !== r.from ? " to " + r.to : "") + " · " : "") + "Sent " + r.at, st: (SM[r.status] || SM.open)[0], sbg: (SM[r.status] || SM.open)[1][0], sfg: (SM[r.status] || SM.open)[1][1], hasReply: !!r.reply, reply: r.reply || "", open: r.status === "open",
        withdraw: () => { if (!this.can()) return; NGGApi.family.act("withdraw", { requestId: r.id }).then(() => { this.toast("Withdrawn"); this.loadWard(w.linkId); }).catch(e => this.toast(fp3Err(e))); } }));
      out.reqEmpty = !w.requests.length;
    }

    if (w && sec === "pending") {
      out.pd = { h: "Waiting to connect to " + w.member.first, s: w.member.centre + " centre · asked " + (w.asked || "just now"), steps: [["ph ph-check", "You asked", w.asked || "Just now", T.ok[2], "#fff", "#e8e5dd"], ["ph ph-hourglass-medium", "The " + w.member.centre + " desk checks the record", "They confirm the relationship with the details NGG already has. Usually within two days.", "#f5b026", "#2a1d00", "#e8e5dd"], ["ph ph-envelope-simple", "You get an email", "Then " + w.member.first + "’s attendance, lessons and fees show here, and " + w.member.first + " is told.", "#efede8", "#6b6b72", "transparent"]].map(s => ({ icon: s[0], h: s[1], s: s[2], bg: s[3], fg: s[4], line: s[5] })) };
      out.pdWithdraw = () => { if (!this.can()) return; NGGApi.family.act("ward.remove", { linkId: w.linkId }).then(() => { this.toast("Ask withdrawn"); this.setState({ childId: "", sec: "today" }); this.boot(); }).catch(e => this.toast(fp3Err(e))); };
    }

    if (sec === "add") {
      const count = wards.length, max = D.max || 8, rels = D.relationships || FP3_RELATIONSHIPS_FALLBACK;
      out.addSub = "Connect any NGG member you look after, up to " + max + " on one account.";
      out.addMax = count + " of " + max + " children on this account.";
      out.adCode = S.adCode; out.adName = S.adName; out.onAdCode = e => this.setState({ adCode: e.target.value.replace(/\D/g, "").slice(0, 6), adErr: "" }); out.onAdName = e => this.setState({ adName: e.target.value, adErr: "" });
      out.rels = Object.keys(rels).map(k => { const on = S.adRel === k; return { l: rels[k], sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#d9d6cd", onClick: () => this.setState({ adRel: k }) }; });
      out.adHasErr = !!S.adErr; out.adErr = S.adErr;
      out.adGo = () => {
        if (S.adBusy || !this.can()) return;
        if (count >= max) return this.setState({ adErr: "A family account holds up to " + max + " children." });
        if (S.adCode.length !== 6 || S.adName.trim().length < 2) return this.setState({ adErr: "Enter the 6-digit code and at least two letters of their name." });
        this.setState({ adBusy: true, adErr: "" });
        NGGApi.family.act("ward.add", { method: "code", code: S.adCode, name: S.adName.trim(), relationship: S.adRel }).then(r => {
          const f = fp3First((r.link && r.link.fullName) || S.adName);
          this.setState({ adBusy: false, adCode: "", adName: "", adDone: ["Connected to " + f, f + " has been told that a family account is now following their record. You’ll find them in your list."], childId: r.link ? r.link.linkId : S.childId });
          this.boot();
        }).catch(e => this.setState({ adBusy: false, adErr: fp3Err(e) }));
      };
      out.addDone = !!S.adDone; out.addDoneH = S.adDone ? S.adDone[0] : ""; out.addDoneS = S.adDone ? S.adDone[1] : "";
      const sugg = D.suggestions || [];
      out.hasSugg = sugg.length > 0;
      out.sugg = sugg.map(s => ({ first: s.firstName, ini: (s.firstName || "?")[0], centre: s.centre, ask: () => {
        if (!this.can()) return;
        NGGApi.family.act("ward.add", { method: "record", memberId: s.memberId, relationship: S.adRel })
          .then(() => { this.setState({ adDone: ["Asked to connect to " + s.firstName, "The " + s.centre + " desk will check and email you, usually within two days."] }); this.boot(); })
          .catch(e => this.setState({ adErr: fp3Err(e) }));
      } }));
    }

    if (sec === "account") {
      out.pf = [["Name", g.fullName || "Not given yet"], ["Phone", g.phone || "Not given yet"], ["Email", g.email], ["With NGG since", fp3Long(g.createdAt)]].map(x => ({ k: x[0], v: x[1] }));
      out.pfAsk = () => { const x = wards.find(y => y.status === "active"); if (!x) return this.toast("Connect a child first; the centre that looks after them keeps your details."); this.setState({ childId: x.linkId }); openSheet("profile"); };
      out.acColl = wards.filter(x => x.status === "active").map(x => ({ name: x.member.first, ini: this.ini(x.member.fullName), tone: x.member.tone, list: !x.loaded ? "Loading…" : (x.collectors || []).length ? x.collectors.map(c => c[0] + " (" + c[1] + ")").join(", ") : "Nobody listed yet. Press Add who collects to ask the centre to add someone.",
        changeL: x.loaded && !(x.collectors || []).length ? "Add who collects" : "Change who collects", changeA: (x.loaded && !(x.collectors || []).length ? "Add who may collect " : "Change who may collect ") + x.member.first,
        change: () => { this.setState({ childId: x.linkId }); openSheet("collect"); } }));
      const cs = (w && w.consents && w.consents.length ? w.consents : (wards.find(x => x.consents && x.consents.length) || {}).consents) || [];
      out.consents = (cs.length ? cs : [{ label: "Taking part in NGG" }, { label: "Emergency medical care" }, { label: "Keeping and using their records" }, { label: "Photos and videos in NGG materials" }, { label: "First name and work on the website", key: "site_visibility" }])
        .map(c => ({ l: c.label, s: "Given " + (c.given ? fp3Long(c.given) : "") + " on the application" + (c.key === "site_visibility" ? ". First name only: never a surname, age or school with a photo." : "") }));
      out.accWards = wards.map(x => ({ name: x.member.fullName, ini: this.ini(x.member.fullName), tone: x.member.tone, sub: x.status === "active" ? ((D.relationships || FP3_RELATIONSHIPS_FALLBACK)[x.relationship] || "Parent") + " · connected " + (x.since || "") + (x.via === "code" ? " with their code" : " by the centre") : "Waiting for the " + x.member.centre + " desk", removeL: x.status !== "active" ? "Withdraw" : S.confirmRemove === x.linkId ? "Disconnect " + x.member.first + "?" : "Disconnect",
        /* Disconnecting is two taps: the first turns the button into the question
           (and says it out loud), so a stray tap on a phone undoes nothing. */
        remove: () => {
          if (!this.can()) return;
          if (x.status === "active" && S.confirmRemove !== x.linkId) { clearTimeout(this.crT); this.setState({ confirmRemove: x.linkId }); this.toast("Tap “Disconnect " + x.member.first + "?” again to stop seeing their page."); this.crT = setTimeout(() => this.setState({ confirmRemove: "" }), 5000); return; }
          this.setState({ confirmRemove: "" });
          NGGApi.family.act("ward.remove", { linkId: x.linkId }).then(() => { this.toast(x.status === "active" ? "Disconnected from " + x.member.first : "Ask withdrawn"); this.setState({ childId: "" }); this.boot(); }).catch(e => this.toast(fp3Err(e)));
        } }));
      out.notes = [["ph ph-sign-in", "Check-in and sign-out", "A text and email each Saturday when they arrive and leave."], ["ph ph-envelope-simple", "The Monday summary", "Last week for every child: attendance, lessons and anything new."], ["ph ph-bell-ringing", "Alerts", "Fines, missed sign-outs and anything the centre needs you to know the same day."]].map(n => ({ icon: n[0], h: n[1], s: n[2] }));
      out.mfaOn = S.mfa ? "true" : "false"; out.mfaTrack = S.mfa ? "#0b0b0c" : "#d9d6cd"; out.mfaKnob = S.mfa ? "21px" : "3px";
      out.toggleMfa = () => { if (typeof window.nggMfa === "function") window.nggMfa(S.mfa ? "manage" : "setup"); else this.toast("Two-step sign-in can’t be changed right now. Try again."); };
      out.signOut = () => this.signOut(false); out.signOutAll = () => this.signOut(true);
    }

    const SUBS = { attendance: [["record", "Record"], ["coming", "Coming up"]], progress: [["score", "Scorecard"], ["results", "Results"], ["lessons", "Lessons"], ["mentor", "Mentor"]], requests: [["inbox", "Inbox"], ["req", "Requests"]] };
    const sub = active && loaded && SUBS[sec] ? (SUBS[sec].some(t => t[0] === S.sub[sec]) ? S.sub[sec] : SUBS[sec][0][0]) : "";
    const subN = { results: (rMiss ? 1 : 0) + (pOpen ? 1 : 0), inbox: unread, req: openReq, coming: unanswered.length };
    out.hasSub = !!sub; out.subAria = out.viewTitle;
    out.subTabs = sub ? SUBS[sec].map(t => { const on = sub === t[0], n = subN[t[0]] || 0; return { l: t[1], sel: on ? "true" : "false", bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(11,11,12,.14)" : "none", fw: on ? 600 : 500, fg: on ? "#0b0b0c" : "#4a4a50", hasN: n > 0, n: String(n), onClick: () => this.setSub(sec, t[0]) }; }) : [];
    Object.assign(out, { subRecord: sub === "record", subComing: sub === "coming", subScore: sub === "score", subRes: sub === "results", subLessons: sub === "lessons", subMentor: sub === "mentor", subInbox: sub === "inbox", subReq: sub === "req" });
    const pill = (on, l, fn) => ({ l, sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#d9d6cd", onClick: fn });

    if (active && loaded && sec === "attendance" && sub === "coming") {
      const list = evs.slice();
      if (S.eventsErr) list.length = 0;
      if (w.meeting) { const d = w.meeting.date; list.unshift({ id: "MEET", dd: String(+d.slice(8, 10)), mm: FP3_MON[+d.slice(5, 7) - 1], date: fp3Date(d), time: w.meeting.time, title: "Meeting with " + w.member.mentor, where: w.meeting.mode === "phone" ? "By phone" : w.member.centre + " centre", meet: true }); }
      out.evs = list.map((e, i) => { const r = S.rsvp[e.id]; return { dd: e.dd, mm: e.mm, title: e.title, when: e.date + " · " + e.time, where: e.where, bt: i ? "1px solid #f1efea" : "0", expected: !!e.expected, canRsvp: !e.info && !e.meet,
        opts: [["yes", "I’ll come"], ["no", "Can’t make it"]].map(o => pill(r === o[0], o[1], () => this.rsvp(e, o[0]))),
        hasState: !!(e.meet || e.info), state: e.meet ? "Booked · reminder the day before" : e.info ? "No class" : "", stc: e.meet ? "#17663a" : "#6b6b72", dbg: e.meet ? "#e8f5ec" : e.info ? "#efede8" : "#fdf6e3" }; });
    }

    if (active && loaded && sec === "progress") {
      const first = w.member.first, sc = w.score;
      if (sc) {
        const t1 = tot(sc.now), d = t1 - tot(sc.prev), I = sc.now.map((v, i) => i), skills = sc.skills || [];
        const hi = I.reduce((a, i) => sc.now[i] > sc.now[a] ? i : a, 0), lo = I.reduce((a, i) => sc.now[i] < sc.now[a] ? i : a, 0);
        out.sc = { has: true, none: false, session: sc.session, total: String(t1), delta: sc.hasPrev ? (d >= 0 ? "+" : "−") + Math.abs(d) + " since last month" : "First scorecard", dbg: d >= 0 ? T.ok[0] : T.bad[0], dfg: d >= 0 ? T.ok[1] : T.bad[1], by: sc.by, taken: sc.taken, hi: skills[hi], lo: skills[lo], note: sc.note || "The mentor’s note comes with the next Saturday evaluation.", tip: FP3_HOME_TIPS[skills[lo]] || "",
          rows: skills.map((k, i) => { const v = sc.now[i], p = sc.prev[i], dd = v - p; return { k, v: v + "/10", w: v * 10 + "%", pw: "calc(" + p * 10 + "% - 1px)", c: v >= 8 ? "#22a05a" : v >= 6 ? "#3a3a40" : "#e0a100", d: dd ? (dd > 0 ? "+" : "−") + Math.abs(dd) : "0", dc: dd > 0 ? "#17663a" : dd < 0 ? "#a12a2a" : "#6b6b72", aria: k + ": " + v + " out of 10, " + (dd > 0 ? "up " + dd : dd < 0 ? "down " + -dd : "no change") + " since last month" }; }) };
      } else out.sc = { has: false, none: true, rows: [] };
      const RS = w.results || [];
      const ri = Math.max(0, RS.findIndex(x => x.id === S.rsSession)), r = RS[ri] || {};
      const grade = s => (FP3_GRADES.find(g2 => s >= g2[0]) || [0, "F9"])[1];
      const up = r.avg != null && r.prevAvg != null && r.avg >= r.prevAvg;
      out.rs = { tabs: RS.map((x, i) => pill(i === ri, x.name, () => this.setState({ rsSession: x.id }, () => this.pushUrl(true)))), multi: RS.length > 1, missing: r.status === "missing", processing: r.status === "processing", has: r.status === "uploaded",
        mH: !RS.length ? "No school results are due yet" : first + " hasn’t uploaded their " + r.name + " results yet",
        mS: !RS.length ? "Members upload their report after each school term. It will show here." : "Due " + r.due + ". Members upload their school results every session, and the mentor builds the plan from them." + (r.reminded ? " " + first + " was reminded on " + r.reminded + "." : ""),
        remindL: r.reminded === fp3Date(T0.date) ? "Reminded" : "Remind " + first,
        remind: () => { if (r.reminded === fp3Date(T0.date) || !this.can()) return; NGGApi.family.act("results.remind", { linkId: w.linkId, resultId: r.id }).then(() => { this.toast(first + " gets a reminder on the member app."); this.loadWard(w.linkId); }).catch(e => this.toast(fp3Err(e))); },
        upload: () => openSheet("upload", { upFile: null, upName: "" }), pH: "Reading " + first + "’s results", pS: "The plan goes to " + w.member.mentor + " first, then comes to you here, usually within two days.",
        name: r.name, school: r.school || "School", uploaded: "uploaded " + (r.uploaded || "") + (r.uploadedBy === "guardian" ? " by you" : ""), avg: r.avg != null ? r.avg + "%" : "—", ad: r.prevAvg != null && r.avg != null ? (up ? "+" : "−") + Math.abs(r.avg - r.prevAvg) + " on last term" : "", adbg: up ? T.ok[0] : T.bad[0], adfg: up ? T.ok[1] : T.bad[1],
        subjects: (r.subjects || []).map(s => { const dd = s[2] == null ? null : s[1] - s[2]; return { k: s[0], v: String(s[1]), g: grade(s[1]), gbg: s[1] >= 70 ? T.ok[0] : s[1] >= 50 ? "#efede8" : T.bad[0], gfg: s[1] >= 70 ? T.ok[1] : s[1] >= 50 ? "#48484e" : T.bad[1], d: dd === null ? "new" : (dd > 0 ? "+" : dd < 0 ? "−" : "") + Math.abs(dd), dc: dd > 0 ? "#17663a" : dd < 0 ? "#a12a2a" : "#6b6b72" }; }),
        viewDoc: () => { if (r.fileUrl) window.open(r.fileUrl, "_blank", "noopener"); } };
      /* Nothing owed yet (a new member, or the first term not over): a quiet
         line, not a red card with buttons that would act on nothing. */
      if (!RS.length) Object.assign(out.rs, { missing: false, processing: true, pH: "No school results are due yet", pS: "Members upload their report after each school term, and it shows here. You can upload it for " + first + " if they haven’t." });
      out.hasPlan = !!(r.plan && r.status === "uploaded");
      if (out.hasPlan) { const P2 = r.plan;
        out.pl = { by: (P2.byAi ? "Drafted by NGG’s assistant from the results on " + P2.drafted + ", then checked and edited by " : "Written with " + first + " and checked by ") + P2.reviewedBy + " on " + P2.reviewed + ". The instructors and the centre lead see it too.", summary: P2.summary, focus: P2.focus, actions: P2.actions.map(a => ({ who: a[0], what: a[1] })), acked: !!P2.ack, open: !P2.ack, ackL: "You signed this on " + P2.ack + ". " + P2.reviewedBy + " can see that.",
          sign: () => { if (!this.can()) return; NGGApi.family.act("plan.sign", { linkId: w.linkId, resultId: r.id }).then(() => { this.toast("Signed. " + P2.reviewedBy + " can see you’ve read it."); this.loadWard(w.linkId); }).catch(e => this.toast(fp3Err(e))); },
          ask: () => openSheet("mentor") }; }
      const bk = w.meeting;
      out.mt = { h: w.member.hasMentor ? "Meet " + w.member.mentor : "No mentor yet", s: w.member.hasMentor ? "Mentors meet every family at least once a term, and whenever something needs talking through." : "The centre pairs every member with a mentor. You’ll see them here once they’re matched.",
        booked: !!bk, free: !bk && w.member.hasMentor, bookedL: bk ? bk.label : "", book: () => openSheet("meet", { slot: 0 }), ask: () => openSheet("mentor") };
    }

    if (active && loaded && sec === "requests") {
      const all = this.inbox(), nameOf = id => { const x = wards.find(y => y.linkId === id); return x ? x.member.first : "All your children"; };
      const list = all.filter(mm => S.ibCat === "all" || mm.cat === S.ibCat);
      out.ibCats = [["all", "All"], ["report", "Reports"], ["alert", "Alerts"], ["centre", "From the centre"]].map(c => { const n = (c[0] === "all" ? all : all.filter(mm => mm.cat === c[0])).filter(mm => mm.unread).length; return pill(S.ibCat === c[0], c[1] + (n ? " · " + n : ""), () => this.setState({ ibCat: c[0] })); });
      out.ibRows = list.map((mm, i) => ({ icon: mm.icon, h: mm.h, b: mm.b, meta: mm.t + " · " + nameOf(mm.ward), dot: mm.unread ? "#f5b026" : "transparent", fw: mm.unread ? 600 : 500, bt: i ? "1px solid #f1efea" : "0", hasChip: !!mm.sign, chip: mm.signed ? "Signed" : "Needs your signature", cbg: mm.signed ? T.ok[0] : T.warn[0], cfg: mm.signed ? T.ok[1] : T.warn[1], onClick: () => { this.readMsg(mm); openSheet("msg", { msgId: mm.id }); } }));
      out.ibEmpty = !list.length; out.ibEmptyL = S.ibCat === "all" ? "No messages yet. Reports, alerts and news from the centre arrive here." : "Nothing in this list. Press All to see every message.";
    }

    const sh = S.sheet;
    out.hasSheet = !!sh && active && loaded; out.closeSheet = () => this.closeSheet();
    out.sheetAlign = phone ? "flex-end" : "center"; out.sheetPad = phone ? "0" : "16px"; out.sheetR = phone ? "22px 22px 0 0" : "20px";
    out.shDone = !!S.shDone; out.shForm = !S.shDone; out.shDoneH = S.shDone ? S.shDone[0] : ""; out.shDoneS = S.shDone ? S.shDone[1] : "";
    out.shHasErr = !!S.shErr; out.shErr = S.shErr; out.shGoBg = "#0b0b0c"; out.shGoFg = "#fff";
    out.fFrom = S.fFrom; out.fTo = S.fTo; out.fBody = S.fBody; out.fRef = S.fRef;
    out.onFFrom = e => this.setState({ fFrom: e.target.value, shErr: "" }); out.onFTo = e => this.setState({ fTo: e.target.value, shErr: "" }); out.onFBody = e => this.setState({ fBody: e.target.value, shErr: "" }); out.onFRef = e => this.setState({ fRef: e.target.value });
    out.shIsPay = sh === "pay"; out.shIsLeave = sh === "leave" || sh === "academic"; out.shIsAppeal = sh === "appeal"; out.shIsCard = sh === "idcard"; out.shHasBody = !["pay", "upload", "meet", "msg"].includes(sh); out.shIsUpload = sh === "upload"; out.shIsMeet = sh === "meet"; out.shIsMsg = sh === "msg";
    if (out.hasSheet) {
      const first = w.member.first;
      const busyL = l => S.busy ? "Sending…" : l;
      const req = (kind, fields, done) => this.write(() => NGGApi.family.act("request", Object.assign({ linkId: w.linkId, kind }, fields)), () => this.setState({ shDone: done }), () => this.loadWard(w.linkId));
      if (sh === "upload") {
        const r0 = (w.results || []).find(x => x.status === "missing") || this.curRes(w) || {};
        Object.assign(out, { shTitle: "Upload " + first + "’s results", shLead: "The " + r0.name + " report. " + first + " is told you uploaded it.", upL: S.upName || "Take a photo or choose a picture", upIcon: S.upName ? "ph ph-file-check" : "ph ph-camera", upBd: S.upName ? "#22a05a" : "#c9c7bf", shGoL: S.busy ? (S.upPct ? "Uploading… " + S.upPct + "%" : "Uploading…") : "Upload" });
        out.upChecks = ["The name and school are visible", "Every subject and score can be read", "The term and year are on it"];
        out.onUpFile = e => { const f0 = e.target.files && e.target.files[0]; if (!f0) return; if (f0.size > 10 * 1024 * 1024) return this.setState({ shErr: "That file is over 10 MB. Take a photo of the report instead." }); if (!/^image\//.test(f0.type)) return this.setState({ shErr: FP3_ERRORS.bad_type }); this.setState({ upFile: f0, upName: f0.name, shErr: "" }); };
        out.shGo = () => {
          if (!S.upFile) return this.setState({ shErr: "Take a photo of the report or choose the file first." });
          this.write(async () => {
            const url = await NGGApi.documentToDataUrl(S.upFile);
            const st = await NGGApi.family.uploadReport(url, p => this.setState({ upPct: Math.round(p * 100) }));
            return NGGApi.family.act("results.upload", { linkId: w.linkId, resultId: r0.id, fileUrl: st.url, mime: st.mime, size: st.size });
          }, () => this.setState({ upPct: 0, shDone: ["Uploaded", first + " checks the scores that were read off it and writes the plan. " + w.member.mentor + " checks it, then it comes to you here, usually within two days."] }), () => this.loadWard(w.linkId));
        };
      }
      if (sh === "meet") {
        const sl = w.mentorSlots || [];
        out.slots = sl.map((t, i) => { const on = S.slot === i; return { l: t.label, sel: on ? "true" : "false", bg: on ? "#fdf6e3" : "#fff", bd: on ? "#0b0b0c" : "#d9d6cd", icon: on ? "ph-fill ph-radio-button" : "ph ph-circle", onClick: () => this.setState({ slot: i }) }; });
        Object.assign(out, { shTitle: "Meet " + w.member.mentor, shLead: sl.length ? "Times " + w.member.mentor + " has kept free. You’ll get a reminder the day before." : w.member.mentor + " has no free times listed right now. Ask a question instead, and they’ll suggest one.", shGoL: sl.length ? busyL("Book this time") : "Ask a question instead" });
        out.shGo = () => {
          if (!sl.length) return openSheet("mentor");
          const pickd = sl[S.slot] || sl[0];
          this.write(() => NGGApi.family.act("mentor.book", { linkId: w.linkId, slotId: pickd.id }), () => this.setState({ shDone: ["Booked", pickd.label + " with " + w.member.mentor + ". It’s in Saturdays → Coming up."] }), () => this.loadWard(w.linkId));
        };
      }
      if (sh === "msg") {
        const mm = this.inbox().find(x => x.id === S.msgId) || {};
        /* An official notice is read on its own page, in full, formatted — and
           acknowledged there (domain/notices.php); this is its summary. */
        const notice = !!mm.href;
        out.msg = { meta: [mm.t, mm.from].filter(Boolean).join(" · "), b: notice ? mm.b + (mm.sign && !mm.signed ? "\n\nPlease read the whole notice and confirm you have understood it." : "") : mm.b,
          signed: !!mm.signed, signedL: notice ? "Acknowledged. The centre can see you have read and understood it." : "Signed. The mentor can see you’ve read it." };
        Object.assign(out, { shTitle: mm.h || "", shLead: "", shGoL: notice ? (mm.sign && !mm.signed ? "Read and acknowledge" : "Open the notice") : mm.sign && !mm.signed ? busyL("Sign as read") : "Close" });
        out.shGo = () => {
          if (notice) { location.assign(mm.href); return; }
          if (!(mm.sign && !mm.signed)) return this.closeSheet();
          this.write(() => NGGApi.family.act("report.sign", { id: mm.id }), () => { this.closeSheet(); this.toast("Signed. The mentor can see you’ve read it."); }, () => this.loadInbox());
        };
      }
      if (sh === "mentor") {
        Object.assign(out, { shTitle: "Ask " + w.member.mentor, shLead: "It goes to " + w.member.mentor + ", and the centre lead can see it. Expect a reply within two days.", shBodyL: "Your question", shBodyPh: "e.g. How can I help with the reading at home?", shGoL: busyL("Send") });
        out.shGo = () => { if (S.fBody.trim().length < 5) return this.setState({ shErr: "Write your question first." }); req("askmentor", { subject: S.fBody.trim().slice(0, 60), body: S.fBody.trim() }, ["Sent to " + w.member.mentor, "The reply comes to Messages → Requests."]); };
      }
      if (sh === "profile" || sh === "collect") {
        const pr = sh === "profile";
        Object.assign(out, { shTitle: pr ? "Ask to change your details" : "Change who can collect " + first, shLead: pr ? "The centre keeps family details as they were checked at registration. Say what has changed and they’ll update it after a quick check." : "Give the person’s full name, how they’re related and their phone number. They’ll need ID at the desk.", shBodyL: pr ? "What should change" : "Add or remove", shBodyPh: pr ? "e.g. My phone number is now 0809 …" : "e.g. Add Mrs Kemi Bello, aunt, 0813 …", shGoL: busyL("Send to the centre") });
        out.shGo = () => { if (S.fBody.trim().length < 8) return this.setState({ shErr: "Tell the centre a little more." }); req(pr ? "familydetails" : "collect", { subject: S.fBody.trim().slice(0, 60), body: S.fBody.trim() }, ["Sent", "The " + w.member.centre + " desk checks it and replies in Messages → Requests, usually within two days."]); };
      }
      if (sh === "pay") {
        Object.assign(out, { shTitle: w.fees.joining ? "Pay " + first + "’s joining invoice" : "Pay for " + first, shLead: "You’ll go to Paystack to pay by card, bank or USSD, then come straight back here.", shGoL: S.busy ? "Opening Paystack…" : "Continue to Paystack", shGoBg: "#f5b026", shGoFg: "#2a1d00" });
        out.payLines = (w.fees.joining ? w.fees.joining.items : w.fees.lines).map(rr => ({ k: rr.label, v: N(rr.amount) })).concat([{ k: "Total", v: N(w.fees.payable) }]);
        out.shGo = () => this.write(() => NGGApi.family.pay(w.linkId), rr => { if (rr && rr.payUrl) window.location.assign(rr.payUrl); else this.setState({ shErr: "The payment page couldn’t be opened. Try again." }); });
      }
      if (sh === "leave") {
        const ex = w.excuses;
        Object.assign(out, { shTitle: first + " will be away", shLead: "The centre marks those days as excused, so they don’t count against " + first + "’s attendance." + (ex ? (ex.left ? " " + first + " has " + ex.left + " of " + ex.max + " absences left in the programme. Nothing is fined while the centre considers it." : " " + first + " has used all " + ex.max + " absences the programme allows, so the centre can’t take another. Speak to them if it’s an emergency.") : ""), shBodyL: "Why " + first + " will be away", shBodyPh: "e.g. family wedding, hospital appointment", shGoL: ex && !ex.left ? "Close" : busyL("Tell the centre") });
        // None left: no form to fill in and be refused — the sheet says why and closes.
        if (ex && !ex.left) { out.shIsLeave = false; out.shHasBody = false; }
        out.shGo = () => { if (ex && !ex.left) return this.closeSheet(); if (!S.fFrom) return this.setState({ shErr: "Pick the first day " + first + " will be away." }); if (S.fTo && S.fTo < S.fFrom) return this.setState({ shErr: "The last day can’t be before the first." }); if (S.fBody.trim().length < 5) return this.setState({ shErr: "Say why " + first + " will be away, so the desk can answer without asking." }); req("leave", { subject: S.fBody.trim().slice(0, 60), body: S.fBody.trim(), fromDate: S.fFrom, toDate: S.fTo || S.fFrom }, ["The centre has been told", "The " + w.member.centre + " desk will reply in Messages → Requests. " + first + " won’t be marked absent for those days."]); };
      }
      if (sh === "academic") {
        Object.assign(out, { shTitle: "Academic leave for " + first, shLead: "For school exams or a school programme that clashes with Saturdays, up to ten weeks at a time. Once the centre approves it, those Saturdays aren’t absences: nothing is fined and nothing counts against " + first + "’s " + (w.excuses ? w.excuses.max : 2) + " absences.", shBodyL: "What it’s for, and the school", shBodyPh: "e.g. WAEC mock exams at Grace High School, 2–20 Nov", shGoL: busyL("Ask for academic leave") });
        out.shGo = () => { if (!S.fFrom || !S.fTo) return this.setState({ shErr: "Pick the first and the last day." }); if (S.fTo < S.fFrom) return this.setState({ shErr: "The last day can’t be before the first." }); if (S.fBody.trim().length < 10) return this.setState({ shErr: "Say what it’s for — the exams or the programme, and the school." }); req("academic", { subject: S.fBody.trim().slice(0, 60), body: S.fBody.trim(), fromDate: S.fFrom, toDate: S.fTo }, ["Sent to the centre", "The " + w.member.centre + " desk will reply in Messages → Requests. Until they answer, any absence in those dates is held, not fined."]); };
      }
      if (sh === "appeal") {
        out.chargeOpts = w.charges.map(c => ({ v: c.id, l: c.label + " · " + c.when }));
        Object.assign(out, { shTitle: "Appeal a charge", shLead: out.chargeOpts.length ? "Say what happened. The centre lead reads every appeal, and the charge is on hold while they decide." : "There are no charges on " + first + "’s account to appeal.", shBodyL: "What happened", shBodyPh: "e.g. I collected her early from the desk because of a family emergency.", shGoL: busyL("Send the appeal") });
        out.shGo = () => { if (!out.chargeOpts.length) return this.closeSheet(); if (S.fBody.trim().length < 10) return this.setState({ shErr: "Tell the centre a little more, so they can decide fairly." }); const o = out.chargeOpts.find(x => x.v === S.fRef) || out.chargeOpts[0]; req("appeal", { subject: o.l.slice(0, 120), body: S.fBody.trim(), refEntryId: o.v }, ["Appeal sent", "The charge is on hold. You’ll get an email when the centre lead decides, usually within a week."]); };
      }
      if (sh === "idcard") {
        out.cardWhy = [["lost", "Lost"], ["damaged", "Damaged"], ["name", "Wrong name or photo"]].map(rr => { const on = S.fWhy === rr[0]; return { l: rr[1], sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#d9d6cd", onClick: () => this.setState({ fWhy: rr[0] }) }; });
        Object.assign(out, { shTitle: "New ID card for " + first, shLead: "The old card stops working as soon as the new one is printed. Collect it from the " + w.member.centre + " desk.", shBodyL: "Anything else (optional)", shBodyPh: "e.g. it went through the wash", shGoL: busyL("Ask for a new card") });
        out.shGo = () => { const why = { lost: "Lost", damaged: "Damaged", name: "Wrong name or photo" }[S.fWhy]; req("idcard", { subject: why, body: (why + ". " + S.fBody.trim()).trim() }, ["Asked for a new card", "You’ll get a text when it’s ready to collect, usually the next Saturday."]); };
      }
    }
    return out;
  }

  render() {
    const S = this.state;
    if (S.me === undefined) return <div className="fp3x-boot" role="status" aria-label="Opening your family account"><span className="fp3x-boot-mark" aria-hidden="true"/></div>;
    if (S.mfaPending && typeof MfaHost === "function") {
      return <div className="fp3x-boot"><MfaHost family id="family" pending={S.mfaPending} onCleared={() => this.boot()} onSignOut={() => this.signOut(false)}/></div>;
    }
    return (
      <React.Fragment>
        {Fp3View(this.renderVals())}
        {S.me && typeof MfaHost === "function" && <MfaHost family id={S.me.guardian.guardianId} pending="" onCleared={() => this.boot()} onSignOut={() => this.signOut(false)}/>}
      </React.Fragment>
    );
  }
}

window.Fp3Portal = Fp3Portal;


/* ── What a child asked of their parents (member_family_nudge) ─────────────
   Only while it still applies: an ask to pay goes once nothing is owed, an
   ask to confirm goes once the parent has told the centre. */
function fp3Asks(x) {
  const F = x.fees || {}, first = x.member.first;
  if (!F.asked || F.claim || !(F.payable > 0 || F.joining)) return [];
  return [{ badge: first + " asked about fees", h: first + " asked you to pay their fees", s: "Pay online here, by transfer, or ahead for the months to come. Already paid by transfer or at the desk? Press I’ve paid on Fees and give the reference.", cta: F.payable > 0 ? "Pay " + "₦" + Number(F.payable).toLocaleString("en") : "Pay the joining invoice" }];
}

/** Fees → Pay ahead: months of the commitment fee (and any renewal among them), priced by the server. */
function Fp3Ahead({ c, w }) {
  const A = w.fees.ahead, qs = (A && A.quotes) || [], first = w.member.first, N = n => c.naira(n);
  const [pick, setPick] = React.useState(() => (qs.find(q => q.months === 3) || qs[0] || {}).months || 0);
  const [busy, setBusy] = React.useState(false), [err, setErr] = React.useState("");
  if (!A) return null;
  const q = qs.find(x => x.months === pick) || qs[0];
  const go = () => {
    if (!q || busy || !c.can()) return;
    setBusy(true); setErr("");
    NGGApi.family.act("fees.advance", { linkId: w.linkId, months: q.months })
      .then(r => { if (r && r.payUrl) window.location.assign(r.payUrl); else { setBusy(false); setErr("The payment page couldn’t be opened. Try again."); } })
      .catch(e => { setBusy(false); setErr(fp3Err(e)); });
  };
  return (
    <section className="fp3x-card" aria-labelledby={"fp3x-ah-" + w.linkId}>
      <div className="fp3x-card-h">
        <span className="fp3x-ic" aria-hidden="true"><i className="ph ph-calendar-plus"/></span>
        <div>
          <h2 id={"fp3x-ah-" + w.linkId}>Pay ahead</h2>
          <p>{A.paidThrough ? first + " is paid to the end of " + A.paidThroughL + ". " + N(A.credit) + " is held on the account." : "Pay several months of " + first + "’s commitment fee in one go, with any membership renewal that falls in them."}</p>
        </div>
      </div>
      {q ? <React.Fragment>
        <div className="fp3x-opts" role="group" aria-label="How many months ahead">
          {qs.map(x => <button key={x.months} type="button" aria-pressed={x.months === q.months ? "true" : "false"} className={"fp3x-opt" + (x.months === q.months ? " is-on" : "")} onClick={() => setPick(x.months)}>
            <b>{x.months} month{x.months === 1 ? "" : "s"}</b><span>to {x.throughL}</span><em>{N(x.total)}</em>
          </button>)}
        </div>
        <ul className="fp3x-lines" aria-label="What this pays">
          {q.items.map((it, i) => <li key={i}><span>{it.label}<small>{it.detail}</small></span><b>{it.amount < 0 ? "− " + N(-it.amount) : N(it.amount)}</b></li>)}
          <li className="is-total"><span>Total</span><b>{N(q.total)}</b></li>
        </ul>
        {err && <p className="fp3x-err" role="alert">{err}</p>}
        <button type="button" className="fp3x-go" onClick={go} disabled={busy}>{busy ? "Opening the invoice…" : "Pay " + N(q.total) + " ahead"}</button>
        <p className="fp3x-fine">Nothing is charged early. The payment waits on {first}’s account and meets each month’s fee on the 1st, so no reminder comes while it lasts. Card, bank or USSD through Paystack, or by transfer.</p>
      </React.Fragment> : <p className="fp3x-fine">Nothing to pay ahead right now.</p>}
    </section>
  );
}

/** Fees → I've paid: a parent tells the centre about a transfer or cash at the desk. The desk checks it against the statement. */
function Fp3Paid({ c, w }) {
  const F = w.fees, first = w.member.first, N = n => c.naira(n), asked = !!F.asked;
  const [open, setOpen] = React.useState(false);
  /* One line per way it was paid. A parent who sent ₦10,000 by transfer and
     handed ₦2,000 to a coordinator had one Reference box, wrote the story in
     it, and the desk could match neither. Each line now has its own amount and
     its own proof: a transfer's reference, or who took the cash. */
  const blank = m => ({ method: m || "transfer", amount: "", ref: "" });
  const [lines, setLines] = React.useState(() => [Object.assign(blank(), { amount: F.payable ? String(F.payable) : "" })]);
  const [when, setWhen] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState(false), [err, setErr] = React.useState("");
  /* The receipt: a photo of the transfer screen or the cash receipt. There was
     no place to give one, so the desk matched a claim to the statement by the
     reference alone — and cash had nothing at all. Stored by the same uploader
     as school reports (the site's own photo store). */
  const [proof, setProof] = React.useState(null), [pct, setPct] = React.useState(0);
  const pickProof = e => {
    const f0 = e.target.files && e.target.files[0]; if (!f0) return;
    if (!/^image\//.test(f0.type)) return setErr("Choose a photo or screenshot of the receipt.");
    if (f0.size > 10 * 1024 * 1024) return setErr("That picture is over 10 MB. Take a screenshot instead.");
    setProof(f0); setErr("");
  };
  const setLine = (i, k, v) => { setLines(ls => ls.map((l, j) => j === i ? Object.assign({}, l, { [k]: v }) : l)); setErr(""); };
  if (F.claim) return (
    <section className="fp3x-card" aria-label="Payment being checked">
      <div className="fp3x-card-h"><span className="fp3x-ic is-ok" aria-hidden="true"><i className="ph ph-hourglass-medium"/></span>
        <div><h2>Your payment is being checked</h2><p>{N(F.claim.amount)}{F.claim.reference ? " · ref " + F.claim.reference : ""}, told to the centre {F.claim.when}. The desk matches it to the bank statement and the receipt is emailed. Please don’t pay it twice.</p></div></div>
    </section>
  );
  const total = lines.reduce((n, l) => n + (Math.round(Number(String(l.amount).replace(/[^\d.]/g, ""))) || 0), 0);
  const send = e => {
    e.preventDefault();
    const parts = [];
    for (const l of lines) {
      const amt = Math.round(Number(String(l.amount).replace(/[^\d.]/g, "")));
      if (!(amt > 0)) { if (lines.length > 1 && !l.amount && !l.ref.trim()) continue; return setErr("How much was paid " + (l.method === "cash" ? "in cash" : l.method === "pos" ? "by POS" : "by transfer") + "?"); }
      if (l.method === "cash" && l.ref.trim().length < 2) return setErr("Who took the cash of " + N(amt) + "? Their name lets the desk confirm it.");
      if (l.method !== "cash" && l.ref.trim().length < 3) return setErr("Give the reference for the " + N(amt) + (l.method === "pos" ? " POS payment" : " transfer") + ", so the desk can find it on the statement.");
      parts.push({ method: l.method, amount: amt, reference: l.method === "cash" ? "" : l.ref.trim(), receivedBy: l.method === "cash" ? l.ref.trim() : "" });
    }
    if (!parts.length) return setErr("How much did you pay?");
    if (busy || !c.can()) return;
    setBusy(true); setErr("");
    (async () => {
      let proofUrl = "";
      if (proof) { const st = await NGGApi.family.uploadReport(await NGGApi.documentToDataUrl(proof), x => setPct(Math.round(x * 100))); proofUrl = st.url || ""; }
      return NGGApi.family.act("request", { linkId: w.linkId, kind: "payment", amount: parts.reduce((n, p) => n + p.amount, 0), parts, paidAt: when, proofUrl });
    })()
      .then(() => { setBusy(false); setPct(0); c.toast("Sent. The centre checks it against the statement and emails the receipt."); c.loadWard(w.linkId); })
      .catch(er => { setBusy(false); setPct(0); setErr(fp3Err(er)); });
  };
  return (
    <section className={"fp3x-card" + (asked ? " is-asked" : "")} aria-labelledby={"fp3x-pd-" + w.linkId}>
      <div className="fp3x-card-h">
        <span className="fp3x-ic" aria-hidden="true"><i className="ph ph-receipt"/></span>
        <div>
          <h2 id={"fp3x-pd-" + w.linkId}>Paid by transfer or at the desk?</h2>
          <p>{asked ? first + " asked about their fees. If you have already paid, this is where you say so. " : ""}Tell the centre what you paid and the reference. Nothing changes on the account until the desk has matched it to the statement.</p>
        </div>
      </div>
      {!open ? <button type="button" className="fp3x-ghost" aria-expanded="false" onClick={() => setOpen(true)}>I’ve paid</button> :
      <form className="fp3x-form" onSubmit={send} noValidate>
        {lines.map((l, i) => (
          <fieldset key={i} className="fp3x-payline">
            <legend>{lines.length > 1 ? "Payment " + (i + 1) : "How you paid"}</legend>
            <div className="fp3x-seg" role="radiogroup" aria-label={"How payment " + (i + 1) + " was made"}>
              {[["transfer", "Transfer"], ["cash", "Cash"], ["pos", "POS"]].map(o => (
                <button key={o[0]} type="button" role="radio" aria-checked={l.method === o[0]} onClick={() => setLine(i, "method", o[0])}>{o[1]}</button>
              ))}
            </div>
            <label><span>Amount (₦)</span><input inputMode="numeric" autoComplete="off" value={l.amount} onChange={e => setLine(i, "amount", e.target.value)}/></label>
            <label><span>{l.method === "cash" ? "Who took the cash" : l.method === "pos" ? "POS receipt number" : "Transfer reference"}</span>
              <input autoComplete="off" value={l.ref} onChange={e => setLine(i, "ref", e.target.value)} maxLength={l.method === "cash" ? 80 : 60}
                placeholder={l.method === "cash" ? "e.g. Mrs Awolaja, Egbeda coordinator" : "e.g. 210882705917985177"}/></label>
            {lines.length > 1 && <button type="button" className="fp3x-ghost" onClick={() => setLines(ls => ls.filter((x, j) => j !== i))}>Remove this payment</button>}
          </fieldset>
        ))}
        {lines.length < 3 && <button type="button" className="fp3x-ghost" onClick={() => setLines(ls => ls.concat([blank(lines[0].method === "cash" ? "transfer" : "cash")]))}>
          <i className="ph ph-plus" aria-hidden="true"/> Paid part another way</button>}
        {lines.length > 1 && <p className="fp3x-fine" aria-live="polite">Total {N(total)}</p>}
        <label className="fp3x-file"><span>Photo of the receipt <em>(helps the desk find it faster)</em></span>
          <input type="file" accept="image/*" onChange={pickProof}/>
          <b aria-live="polite"><i className={"ph " + (proof ? "ph-file-check" : "ph-camera")} aria-hidden="true"/> {proof ? proof.name : "Take a photo or choose a screenshot"}</b>
        </label>
        <label><span>Date paid</span><input type="date" value={when} max={new Date().toISOString().slice(0, 10)} onChange={e => setWhen(e.target.value)}/></label>
        {err && <p className="fp3x-err" role="alert">{err}</p>}
        <div className="fp3x-row"><button type="submit" className="fp3x-go" disabled={busy}>{busy ? (pct ? "Uploading… " + pct + "%" : "Sending…") : "Tell the centre"}</button><button type="button" className="fp3x-ghost" onClick={() => { setOpen(false); setErr(""); }}>Cancel</button></div>
      </form>}
    </section>
  );
}

/** Today, below the design's page: quick actions, what is coming, and this week's lessons. */
function Fp3TodayMore({ c, w }) {
  const S = c.state, first = w.member.first, F = w.fees, L = w.learning || {};
  const acts = [
    ["ph ph-calendar-blank", "Tell the centre about an absence", "Before or after; marked excused", () => c.openSheet("leave")],
    w.member.hasMentor ? ["ph ph-chat-teardrop-text", "Ask " + w.member.mentor, "About growth, results or the plan", () => c.openSheet("mentor")] : null,
    F.enabled && F.ahead && (F.ahead.quotes || []).length ? ["ph ph-calendar-plus", "Pay ahead", F.ahead.paidThrough ? "Paid to " + F.ahead.paidThroughL : "Months of fees in one go", () => c.go("money")] : null,
    ["ph ph-identification-card", "Replacement ID card", "Lost, damaged or wrong name", () => c.openSheet("idcard")],
  ].filter(Boolean);
  const evs = S.events ? c.events().slice(0, 3) : null;
  return (
    <div className="fp3x-more">
      {/* Asked here, where a parent can see the point: their child's day. */}
      {typeof NggPushNudge === "function" ? <NggPushNudge surface="family" text={"Know the moment " + first + " checks in or out, and when the centre answers you — on this phone, without signing in. Nights stay quiet."}/> : null}
      <Fp3Anchor c={c} linkId={w.linkId} first={first} role="parent" compact/>
      <section className="fp3x-card" aria-labelledby="fp3x-qa">
        <h2 id="fp3x-qa" className="fp3x-h">For {first}</h2>
        <div className="fp3x-acts">
          {acts.map((a, i) => <button key={i} type="button" className="fp3x-act" onClick={a[3]}><i className={a[0]} aria-hidden="true"/><span><b>{a[1]}</b><small>{a[2]}</small></span></button>)}
        </div>
      </section>
      <section className="fp3x-card" aria-labelledby="fp3x-cu">
        <div className="fp3x-h-row"><h2 id="fp3x-cu" className="fp3x-h">Coming up</h2>
          {evs && evs.length ? <button type="button" className="fp3x-link" onClick={() => c.go("attendance", { sub: Object.assign({}, S.sub, { attendance: "coming" }) })}>All<i className="ph ph-arrow-right" aria-hidden="true"/></button> : null}</div>
        {S.eventsErr ? <div className="fp3x-state" role="alert"><p>{S.eventsErr}</p><button type="button" className="fp3x-retry" onClick={() => c.loadEvents()}>Try again</button></div>
          : !evs ? <div className="fp3x-skel fp3x-skel-in" role="status" aria-label="Loading what’s coming up"><span/></div>
          : !evs.length ? <p className="fp3x-empty">Nothing on the calendar yet. Events at {w.member.centre} show here as soon as they’re planned.</p>
          : <ul className="fp3x-evs">{evs.map(e => <li key={e.id}><span className="fp3x-date" aria-hidden="true"><b>{e.dd}</b>{e.mm}</span><span><b>{e.title}</b><small>{[e.date, e.time, e.where].filter(Boolean).join(" · ")}</small></span>{e.expected ? <em>{S.rsvp[e.id] === "yes" ? "Coming" : S.rsvp[e.id] ? "Replied" : "Families expected"}</em> : null}</li>)}</ul>}
      </section>
      <section className="fp3x-card" aria-labelledby="fp3x-ln">
        <div className="fp3x-h-row"><h2 id="fp3x-ln" className="fp3x-h">What {first} is learning</h2><span className="fp3x-meta">{L.completed || 0} of {L.total || 0} lessons done</span></div>
        <div className="fp3x-bar" role="progressbar" aria-label={first + "’s lessons"} aria-valuemin="0" aria-valuemax="100" aria-valuenow={L.pct || 0}><span style={{ width: (L.pct || 0) + "%" }}/></div>
        {(L.next || []).length ? <ul className="fp3x-evs">{L.next.slice(0, 3).map((u, i) => <li key={i}><span className="fp3x-ic" aria-hidden="true"><i className="ph ph-book-open-text"/></span><span><b>{u.title}</b><small>{[u.course, u.due].filter(Boolean).join(" · ")}</small></span>{u.overdue ? <em className="is-warn">Overdue</em> : null}</li>)}</ul>
          : <p className="fp3x-empty">{L.total ? "All caught up. New lessons appear here when the instructor sets them." : "Lessons appear here once " + first + "’s track has them."}</p>}
      </section>
    </div>
  );
}


/* ── Anchor, in the family account ──────────────────────────────────────────
   The child's week as their circle of adults sees it (family.anchor): the
   systems they held, the days they reflected, the streak, and the days an
   adult confirmed their conduct. Their words go to their mentor, not here. A
   parent and the mentor each confirm their own days and leave their own
   notes; the conduct figure counts anyone's. `compact` is the line on Today. */
const FP3_ANCHOR_WHERE = { parent: "at home", mentor: "this week" };
function fp3Esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]); }
function Fp3Anchor({ c, linkId, first, role, compact }) {
  const [d, setD] = React.useState(null), [err, setErr] = React.useState(""), [note, setNote] = React.useState(""), [busy, setBusy] = React.useState("");
  const load = () => { setErr(""); NGGApi.family.anchor(linkId).then(setD, e => setErr(fp3Err(e, "Couldn’t load the Anchor week."))); };
  React.useEffect(load, [linkId]);
  const today = new Date().toISOString().slice(0, 10);
  const toggle = day => {
    if (busy || day.future || !c.can()) return;
    setBusy(day.date);
    setD(x => Object.assign({}, x, { days: x.days.map(y => y.date === day.date ? Object.assign({}, y, { mine: !y.mine, any: !y.mine || y.any }) : y) }));
    NGGApi.family.act("anchor.confirm", { linkId, date: day.date, on: !day.mine }).then(load, e => { c.toast(fp3Err(e)); load(); }).finally(() => setBusy(""));
  };
  const send = e => {
    e.preventDefault();
    if (busy || note.trim().length < 2 || !c.can()) return;
    setBusy("note");
    NGGApi.family.act("anchor.remark", { linkId, text: note.trim() }).then(() => { setNote(""); c.toast("Sent to " + first + ". They read it in their app."); load(); }, er => c.toast(fp3Err(er))).finally(() => setBusy(""));
  };
  const print = () => {
    const S = d.stats, w = window.open("", "_blank"); if (!w) return;
    const days = d.days.map(x => "<td>" + fp3Esc(x.label) + "<br><b>" + x.held + "</b>" + (x.any ? " ✓" : "") + "</td>").join("");
    w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Anchor week · " + fp3Esc(d.student.name) + "</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#111;margin:32px;max-width:680px}h1{font-size:22px;margin:0}table{border-collapse:collapse;width:100%;margin:16px 0}td{border:1px solid #ccc;text-align:center;padding:8px}.k{display:flex;gap:12px}.k div{flex:1;border:1px solid #ccc;border-radius:10px;padding:10px;text-align:center}.k b{display:block;font-size:22px}</style></head><body>"
      + "<h1>Anchor week · " + fp3Esc(d.student.name) + "</h1><p>Week of " + fp3Esc(fp3Date(d.weekStart)) + "</p>"
      + "<div class='k'><div><b>" + S.streak + "</b>day streak</div><div><b>" + S.reflections + "</b>days reflected</div><div><b>" + S.avgSystems + "/" + S.systemsTotal + "</b>systems a day</div><div><b>" + S.conduct + "%</b>conduct confirmed</div></div>"
      + "<table><tr>" + days + "</tr></table><p><b>" + (S.atRisk ? "Needs support" : "On track") + "</b> · " + fp3Esc(S.trend) + ". " + fp3Esc(d.suggestion) + "</p>"
      + "<p style='color:#555;font-size:13px'>Systems held each day, ✓ where an adult confirmed conduct.</p><script>window.onload=function(){print()}</script></body></html>");
    w.document.close();
  };
  if (err) return <section className="fp3x-card" aria-label="Anchor"><div className="fp3x-state" role="alert"><p>{err}</p><button type="button" className="fp3x-retry" onClick={load}>Try again</button></div></section>;
  if (!d) return <section className="fp3x-card" aria-label="Anchor"><div className="fp3x-skel fp3x-skel-in" role="status" aria-label="Loading the Anchor week"><span/></div></section>;
  const S = d.stats, todayRow = d.days.find(x => x.date === today);
  const tone = S.atRisk ? "is-warn" : "is-ok";
  if (compact) return (
    <section className="fp3x-card fp3x-anc-mini" aria-labelledby={"fp3x-anc-m-" + linkId}>
      <div className="fp3x-h-row"><h2 id={"fp3x-anc-m-" + linkId} className="fp3x-h">Anchor this week</h2><span className={"fp3x-anc-tag " + tone}>{S.atRisk ? "Needs support" : "On track"}</span></div>
      <p className="fp3x-anc-line"><b>{S.streak}</b>-day streak · reflected <b>{S.reflections}</b> {S.reflections === 1 ? "day" : "days"} · conduct <b>{S.conduct}%</b></p>
      <div className="fp3x-row">
        {todayRow && !todayRow.future ? <button type="button" className={todayRow.mine ? "fp3x-ghost" : "fp3x-go"} aria-pressed={todayRow.mine ? "true" : "false"} onClick={() => toggle(todayRow)} disabled={!!busy}>
          {todayRow.mine ? "Confirmed today ✓" : "Confirm today " + FP3_ANCHOR_WHERE[role]}</button> : null}
        <button type="button" className="fp3x-link" onClick={() => c.go("progress")}>The whole week<i className="ph ph-arrow-right" aria-hidden="true"/></button>
      </div>
    </section>
  );
  const total = S.systemsTotal || 6;
  return (
    <section className="fp3x-card" aria-labelledby={"fp3x-anc-" + linkId}>
      <div className="fp3x-card-h">
        <span className="fp3x-ic" aria-hidden="true"><i className="ph ph-anchor-simple"/></span>
        <div><h2 id={"fp3x-anc-" + linkId}>{d.student.first}’s Anchor week</h2>
          <p>Week of {fp3Date(d.weekStart)}. What {d.student.first} did this week. Their journal and reflections are read by their mentor.</p></div>
      </div>
      <div className="fp3x-anc-stats">
        <div><b>{S.streak}</b><span>day streak · best {S.longestStreak}</span></div>
        <div><b>{S.reflections}</b><span>{S.reflections === 1 ? "day" : "days"} reflected</span></div>
        <div><b>{S.avgSystems}<small>/{total}</small></b><span>systems a day</span></div>
        <div><b>{S.conduct}%</b><span>conduct confirmed</span></div>
      </div>
      <p className={"fp3x-anc-note " + tone}><b>{S.atRisk ? "Needs support" : "On track"}</b> · {S.trend}. {d.suggestion}</p>
      <div>
        <h3 className="fp3x-anc-h3">Confirm the days {d.student.first}’s conduct met expectations {FP3_ANCHOR_WHERE[role]}</h3>
        <div className="fp3x-anc-days" role="group" aria-label="Days this week">
          {d.days.map(x => <button key={x.date} type="button" className={"fp3x-anc-day" + (x.mine ? " is-on" : "")} aria-pressed={x.mine ? "true" : "false"} disabled={x.future || busy === x.date}
            onClick={() => toggle(x)} aria-label={x.label + " " + fp3Date(x.date) + ": " + x.held + " of " + total + " systems held" + (x.future ? ", still to come" : x.mine ? ", you confirmed it" : "")}>
            <span className="fp3x-anc-bar" aria-hidden="true"><i style={{ height: Math.round(Math.min(1, x.held / total) * 100) + "%" }}/></span>
            <span>{x.label.slice(0, 3)}</span>{x.mine ? <i className="ph ph-check" aria-hidden="true"/> : null}
          </button>)}
        </div>
        <p className="fp3x-fine">Bars are the systems {d.student.first} held each day. Tap a day to confirm it; tap again to take it back.</p>
      </div>
      <form className="fp3x-form" onSubmit={send}>
        <label><span>A note to {d.student.first}</span>
          <textarea rows="3" value={note} maxLength={600} onChange={e => setNote(e.target.value)} placeholder="A word of encouragement, or something you noticed this week" disabled={!d.remarksLeft}/></label>
        <div className="fp3x-row"><button type="submit" className="fp3x-go" disabled={busy === "note" || note.trim().length < 2 || !d.remarksLeft}>{busy === "note" ? "Sending…" : "Send to " + d.student.first}</button>
          <span className="fp3x-fine">{d.remarksLeft ? d.remarksLeft + " left this week" : "That’s this week’s notes. More from Monday."}</span>
          <button type="button" className="fp3x-ghost" onClick={print}>Print the week</button></div>
      </form>
      {d.remarks.length ? <div><h3 className="fp3x-anc-h3">Your notes</h3><ul className="fp3x-evs">{d.remarks.map((r, i) => <li key={i}><span className="fp3x-ic" aria-hidden="true"><i className="ph ph-note-pencil"/></span><span><b>{r.text}</b><small>{fp3Date(r.at)}</small></span></li>)}</ul></div> : null}
    </section>
  );
}

