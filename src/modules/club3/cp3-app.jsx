/* ============================================================================
   Club portal v3 — the controller for /club-admin.

   The screens are the design, compiled (cp3-view.jsx from
   docs/design/portals/club-portal-v3.dc.html). This class is the design's
   logic (its `class Component`) ported onto live data: every list comes from
   domain/club-portal.php or an existing op, every action writes through one,
   and what the server refuses is said in words.

   Rules kept from the design:
     · Esc closes the top-most layer; ⌘K / Ctrl K / "/" opens the palette.
     · Reversible acts toast Undo for 6.5s and the write waits until it
       expires (so Undo really does cancel it); external or irreversible acts
       (sending, promoting, accepting) ask first and never offer Undo.
     · Centre scope filters every list, count and badge. A centre lead's is
       fixed — and the server holds them to it regardless.
     · The section is in the URL (/club-admin?s=…), so a refresh or a shared
       link opens the same screen.
   ========================================================================== */

const CP3_PSIZE = 50;

function cp3Ini(n) { return String(n || "").split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase(); }
function cp3M(t) { const p = String(t || "0:0").split(":").map(Number); return p[0] * 60 + (p[1] || 0); }
function cp3HM(x) { return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); }
function cp3Fmt(n) { return Number(n || 0).toLocaleString("en"); }
/* The facts a shortened SMS must keep — numbers, named days and months,
   links, emails. The live hint only; cp_ann_facts() on the server decides. */
const CP3_NAMED = (() => { const m = { today: "today", tomorrow: "tomorrow", tonight: "tonight", tues: "tue", thur: "thu", thurs: "thu", sept: "sep" };
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december"]
    .forEach(w => { m[w] = w.slice(0, 3); m[w.slice(0, 3)] = w.slice(0, 3); }); return m; })();
function cp3AnnFacts(t) {
  const out = {}; t = String(t || "").replace(/(\d),(?=\d{3}\b)/g, "$1");
  const urlRe = /\bhttps?:\/\/[^\s<>"]+|\bwww\.[^\s<>"]+/gi, mailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  (t.match(urlRe) || []).forEach(u => { u = u.replace(/[.,;:)!?]+$/, ""); out["url:" + u.toLowerCase().replace(/^https?:\/\//, "")] = u; });
  (t.match(mailRe) || []).forEach(e => { out["email:" + e.toLowerCase()] = e; });
  const rest = t.replace(urlRe, " ").replace(mailRe, " ");
  (rest.match(/\d+/g) || []).forEach(n => { out["n:" + (n.replace(/^0+/, "") || "0")] = n; });
  (rest.match(/\b[A-Za-z]+\b/g) || []).forEach(w => { const k = CP3_NAMED[w.toLowerCase()]; if (k) out["d:" + k] = w; });
  if (/\bmay\s+\d|\d(?:st|nd|rd|th)?\s+may\b/i.test(rest)) out["d:may"] = "May";
  return out;
}
function cp3LostFacts(long, short) { const a = cp3AnnFacts(long), b = cp3AnnFacts(short); return Object.keys(a).filter(k => !(k in b)).map(k => a[k]); }
function cp3Err(e, fallback) {
  if (!e) return fallback || "Something went wrong.";
  if (e.detail) return e.detail;
  const c = e.code || e.message || "";
  return (typeof humanizeError === "function" ? humanizeError(c, c) : "") || fallback || c || "Something went wrong.";
}
function cp3SecFromUrl() {
  try { const s = new URLSearchParams(window.location.search).get("s") || ""; return CP3_SECTION_IDS.indexOf(s) !== -1 ? s : ""; } catch (e) { return ""; }
}

class Cp3Portal extends React.Component {
  constructor(props) {
    super(props);
    this.rootRef = React.createRef();
    this.pending = {};   // deferred writes, keyed; flushed when their Undo window closes
    this.state = {
      boot: null, bootErr: "", sec: cp3SecFromUrl() || "home", width: 1280,
      dash: null, dashErr: "", slots: null, slotsErr: "", promote: null, promoteErr: "", roster: null, rosterErr: "",
      comp: null, compErr: "", cons: null, consErr: "", gData: {}, gErr: {}, ann: null, annErr: "", annMeta: { canApprove: false, smsOn: false, tgOn: false, aiOn: false, defaultCh: ["app", "email"], smsChars: 306 },
      trnList: null, trnErr: "", trnView: null, trnDetail: null, trnDraft: null, trnStep: 0, trnTried: false, trnQ: "", trnCands: [],
      centre: (() => { try { return localStorage.getItem("ngg.tt.centre") || ""; } catch (e) { return ""; } })(), view: "week",
      form: null, psel: {}, rsel: {}, q: "", pcentre: "", joins: {}, result: null, confirm: null, exportOpen: false, showIns: false, toast: "", toastUndo: false,
      gtab: null, gq: "", accessOpen: false, scope: "all", scopeOpen: false, recent: [], pq: {}, pres: {},
      annEdit: null, annNote: "", annTab: null, annReach: null, gDetail: null, gForm: null, fillWho: "", pages: {}, psize: CP3_PSIZE,
      density: (() => { try { return localStorage.getItem("ngg.cp3.density") || "comfortable"; } catch (e) { return "comfortable"; } })(),
      permOver: {}, permSel: null, permFilter: "all", permQ: "", permMethod: "Paper form",
      pal: false, palQ: "", palI: 0, palMembers: [], recentSec: [], brief: "", briefBusy: false, busy: false,
    };
  }

  /* ── lifecycle ─────────────────────────────────────────────────────── */
  componentDidMount() {
    this.measure = () => { const el = this.rootRef.current; const w = Math.round((el && el.getBoundingClientRect().width) || window.innerWidth); if (w && Math.abs(w - this.state.width) > 16) this.setState({ width: w }); };
    window.addEventListener("resize", this.measure); this.measure();
    this.onKey = e => {
      /* The portal's own palette. The site-wide one (command.jsx) listens on
         window for the same keys; this listener is on document and runs first,
         so stopping it here keeps one palette, not two fighting for the keys. */
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); e.stopPropagation(); return this.setState(s => ({ pal: !s.pal, palQ: "", palI: 0, palMembers: [] })); }
      if (e.key === "Escape" && this.state.pal) return this.setState({ pal: false });
      if (e.key === "/" && !this.state.pal && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); e.stopPropagation(); return this.setState({ pal: true, palQ: "", palI: 0, palMembers: [] }); }
      if (e.key === "Escape") {
        const S = this.state;
        if (S.scopeOpen) return this.setState({ scopeOpen: false });
        if (S.annEdit) return this.setState({ annEdit: null });
        if (S.accessOpen) return this.setState({ accessOpen: false });
        if (S.gForm) return this.setState({ gForm: null });
        if (S.gDetail) return this.setState({ gDetail: null });
        if (S.permSel) return this.setState({ permSel: null });
        if (S.confirm) return this.setState({ confirm: null });
        if (S.form) return this.setState({ form: null });
        if (S.exportOpen) this.setState({ exportOpen: false });
      }
    };
    document.addEventListener("keydown", this.onKey);
    this.onPop = () => { const s = cp3SecFromUrl() || "home"; if (s !== this.state.sec) { this.setState({ sec: s }); this.loadFor(s); } };
    window.addEventListener("popstate", this.onPop);
    this.onUnload = () => this.flushAll();
    window.addEventListener("pagehide", this.onUnload);
    this.boot();
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.measure); document.removeEventListener("keydown", this.onKey);
    window.removeEventListener("popstate", this.onPop); window.removeEventListener("pagehide", this.onUnload);
    clearTimeout(this.tt); clearTimeout(this.palT); clearTimeout(this.pqT);
    this.flushAll();
  }
  componentDidUpdate(_, prev) { if (prev.boot !== this.state.boot || prev.sec !== this.state.sec) this.measure(); }

  /* ── data ──────────────────────────────────────────────────────────── */
  api(op, args) { return NGGApi.admin.clubp(op, args); }
  boot() {
    this.setState({ bootErr: "" });
    this.api("boot").then(b => {
      const lock = b.me.scoped ? (b.me.centres[0] || "") : "";
      /* loadFor reads this.state.boot, so it runs once boot is IN state: called
         straight after setState it returned early, and a section opened by its
         URL (?s=promote) never loaded. */
      this.setState(s => ({ boot: b, scope: lock || s.scope, centre: s.centre && b.centres.some(c => c.id === s.centre) ? s.centre : (b.centres[0] ? b.centres[0].id : "") }),
        () => { this.loadDash(); this.loadSlots(); this.loadComp(); this.loadAnn(); if (this.state.sec !== "home") this.loadFor(this.state.sec); });
    }).catch(e => this.setState({ bootErr: cp3Err(e, "Couldn’t open the Club portal.") }));
  }
  loadDash() { this.setState({ dashErr: "" }); return this.api("dashboard").then(d => this.setState({ dash: d })).catch(e => this.setState({ dashErr: cp3Err(e) })); }
  loadSlots() {
    this.setState({ slotsErr: "" });
    return NGGApi.admin.timetable.list("").then(r => {
      const ids = new Set((this.state.boot ? this.state.boot.centres : []).map(c => c.id));
      const slots = (r.slots || []).filter(s => ids.has(s.centreId)).map(s => ({ id: s.slotId, centreId: s.centreId, wd: +s.weekday, s: s.startTime, e: s.endTime,
        course: s.course, room: s.room || "Main hall", ins: s.instructor || "", insId: s.instructorId || "", level: s.level || "", note: s.note || "" }));
      this.setState({ slots, canEditTT: !!r.canEdit });
    }).catch(e => this.setState({ slotsErr: cp3Err(e) }));
  }
  loadComp() { this.setState({ compErr: "" }); return this.api("checkins").then(r => this.setState({ comp: r.checkins || [] })).catch(e => this.setState({ compErr: cp3Err(e) })); }
  loadAnn() { this.setState({ annErr: "" }); return this.api("ann.list").then(r => this.setState({ ann: r.announcements || [], annMeta: { canApprove: !!r.canApprove, smsOn: !!r.smsOn, tgOn: !!r.tgOn, aiOn: !!r.aiOn, defaultCh: r.defaultCh || ["app", "email"], smsChars: r.smsChars || 306 } })).catch(e => this.setState({ annErr: cp3Err(e) })); }
  loadCons() { this.setState({ consErr: "" }); return this.api("consents").then(r => this.setState({ cons: r, permOver: {} })).catch(e => this.setState({ consErr: cp3Err(e) })); }
  loadPromote() {
    this.setState({ promoteErr: "" });
    return NGGApi.admin.club.promotable({ pageSize: 200 }).then(r => this.setState({ promote: { rows: r.students || [], total: r.total || 0, max: r.max || 200 } }))
      .catch(e => this.setState({ promoteErr: cp3Err(e) }));
  }
  loadSection(sec) {
    this.setState(s => ({ gErr: Object.assign({}, s.gErr, { [sec]: "" }) }));
    return this.api("section", { sec }).then(r => this.setState(s => ({ gData: Object.assign({}, s.gData, { [sec]: r }) })))
      .catch(e => this.setState(s => ({ gErr: Object.assign({}, s.gErr, { [sec]: cp3Err(e) }) })));
  }
  loadTrn() { this.setState({ trnErr: "" }); return NGGApi.admin.tournaments.list().then(r => this.setState({ trnList: r.tournaments || [] })).catch(e => this.setState({ trnErr: cp3Err(e) })); }
  loadTrnDetail(id) {
    return Promise.all([NGGApi.admin.tournaments.rounds(id), NGGApi.admin.tournaments.standings(id)]).then(([r, st]) =>
      this.setState({ trnDetail: { id, rounds: r.rounds || [], tournament: st.tournament || r.tournament || null, standings: st.standings || [] } }))
      .catch(e => this.setState({ trnErr: cp3Err(e) }));
  }
  /* What a section needs. Generic sections load their rows; the rest have their own. */
  loadFor(sec) {
    if (!this.state.boot) return;
    if (sec === "promote") this.loadPromote();
    else if (sec === "roster") this.setState(s => ({ dirKey: (s.dirKey || 0) + 1 }));
    else if (sec === "permissions") this.loadCons();
    else if (sec === "companion") this.loadComp();
    else if (sec === "announce") this.loadAnn();
    else if (sec === "tournaments") this.loadTrn();
    else if (sec === "timetable") this.loadSlots();
    else if (sec === "team" || sec === "centres" || sec === "home") this.loadDash();
    else if (CP3_G[sec]) this.loadSection(sec);
    if (sec === "rota" || sec === "desks") this.loadSection("rota");
  }

  /* ── helpers ───────────────────────────────────────────────────────── */
  B() { return this.state.boot; }
  C(id) { return (this.B().centres || []).find(c => c.id === id) || { id, name: id, days: [6], open: "09:00", close: "15:00", rooms: ["Main hall"], slug: "" }; }
  CN(name) { return (this.B().centres || []).find(c => c.name === name); }
  lockC() { const b = this.B(); return b && b.me.scoped ? (b.me.centres[0] || "") : ""; }
  scopeName() { return this.lockC() || this.state.scope; }
  isAdm() { const b = this.B(); return !!(b && b.me.isAdmin); }
  div(course) { const c = (this.B().courses || []).find(x => x[0].toLowerCase() === String(course || "").toLowerCase()); return CP3_DIV[c ? c[1] : "chess"]; }
  toast(t, undo, commit) {
    clearTimeout(this.tt);
    this.flushPending();
    this.undoFn = undo || null; this.commitFn = commit || null;
    this.setState({ toast: t, toastUndo: !!undo });
    this.tt = setTimeout(() => { const c = this.commitFn; this.commitFn = null; this.undoFn = null; this.setState({ toast: "" }); c && c(); }, undo ? 6500 : 4000);
  }
  flushPending() { const c = this.commitFn; this.commitFn = null; this.undoFn = null; if (c) c(); }
  flushAll() { this.flushPending(); }
  fail(e, fallback) { this.toast(cp3Err(e, fallback)); }
  go(sec) {
    if (CP3_SECTION_IDS.indexOf(sec) === -1) sec = "home";
    this.flushPending();
    this.setState(s => ({ recentSec: [sec].concat(s.recentSec.filter(x => x !== sec)).slice(0, 4) }));
    this.setState({ sec, pal: false, exportOpen: false, confirm: null, gq: "", gtab: null, permSel: null, gDetail: null, gForm: null, trnView: null, trnDetail: null });
    try { const u = new URL(window.location.href); if (sec === "home") u.searchParams.delete("s"); else u.searchParams.set("s", sec); window.history.pushState({}, "", u.pathname + u.search); } catch (e) {}
    const m = this.rootRef.current && this.rootRef.current.querySelector("main"); if (m) m.scrollTop = 0;
    this.loadFor(sec);
  }
  pager(key, total, sig, isPhone) {
    const S = this.state; const size = S.psize; const pages = Math.max(1, Math.ceil(total / size));
    const st = S.pages[key]; let p = st && st.sig === sig ? st.p : 0; if (p > pages - 1) p = pages - 1;
    const go = np => this.setState(s => ({ pages: Object.assign({}, s.pages, { [key]: { p: Math.max(0, Math.min(pages - 1, np)), sig } }) }));
    const start = isPhone ? 0 : p * size; const end = Math.min(total, (p + 1) * size);
    const atS = p === 0, atE = p >= pages - 1;
    return { start, end, size: String(size), range: total ? cp3Fmt(start + 1) + "–" + cp3Fmt(end) + " of " + cp3Fmt(total) : "None", label: "Page " + (p + 1) + " of " + cp3Fmt(pages), multi: pages > 1,
      first: () => go(0), prev: () => go(p - 1), next: () => go(p + 1), last: () => go(pages - 1), atStartA: atS ? "true" : undefined, atEndA: atE ? "true" : undefined,
      sColor: atS ? "#c4c4c0" : "#0b0b0c", eColor: atE ? "#c4c4c0" : "#0b0b0c", hasMore: !atE, moreN: cp3Fmt(Math.min(size, total - end)), shown: cp3Fmt(end) + " of " + cp3Fmt(total) };
  }
  clashesFor(x, all) {
    const c = this.C(x.centreId); const out = []; const a = cp3M(x.s), b = cp3M(x.e);
    if (b <= a) { out.push({ type: "bad_time", detail: "It must end after it starts." }); return out; }
    if (!c.days.includes(+x.wd)) out.push({ type: "centre_day", detail: c.name + " only meets on " + c.days.map(d => CP3_DAYS[d] + "s").join(" and ") + "." });
    else if (a < cp3M(c.open) || b > cp3M(c.close)) out.push({ type: "centre_time", detail: c.name + " is open " + c.open + "–" + c.close + " on " + CP3_DAYS[x.wd] + "s." });
    all.forEach(o => {
      if (o.id === x.id || +o.wd !== +x.wd) return;
      if (!(cp3M(o.s) < b && a < cp3M(o.e))) return;
      if (o.centreId === x.centreId && o.room === x.room) out.push({ type: "room", detail: x.room + " already has " + o.course + " " + o.s + "–" + o.e + "." });
      if (x.insId && o.insId === x.insId) out.push({ type: "instructor", detail: x.ins + " is teaching " + o.course + " at " + this.C(o.centreId).name + " " + o.s + "–" + o.e + "." });
      if (o.centreId === x.centreId && o.course === x.course && (o.level || "") === (x.level || "")) out.push({ type: "course", detail: x.course + " already meets " + o.s + "–" + o.e + " here. Its members can’t be in two rooms." });
    });
    return out;
  }
  suggest(x, all) {
    const c = this.C(x.centreId); const dur = Math.max(30, cp3M(x.e) - cp3M(x.s));
    const days = c.days.includes(+x.wd) ? [+x.wd] : c.days;
    for (const wd of days) for (let t = cp3M(c.open); t + dur <= cp3M(c.close); t += 15) { const y = Object.assign({}, x, { wd, s: cp3HM(t), e: cp3HM(t + dur) }); if (!this.clashesFor(y, all).length) return y; }
    return null;
  }
  nextDate(wd) { const today = new Date(); today.setHours(0, 0, 0, 0); const cur = today.getDay() || 7; const d = new Date(today); d.setDate(d.getDate() + ((wd - cur + 7) % 7)); return d; }
  fmtDate(d) { return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
  slots() { return this.state.slots || []; }
  ttCentre() { const S = this.state; const sc = this.CN(this.scopeName()); return sc ? sc.id : (S.centre || "all"); }

  openForm(slot) {
    const cen = this.ttCentre(); const c = this.C(slot ? slot.centreId : (cen === "all" ? (this.B().centres[0] || {}).id : cen));
    const base = slot ? Object.assign({}, slot) : { id: null, centreId: c.id, wd: c.days[0], s: c.open, e: cp3HM(cp3M(c.open) + 60), course: "Chess", room: c.rooms[0], ins: "", insId: "", level: "" };
    if (!slot) { const sg = this.suggest(base, this.slots()); if (sg) Object.assign(base, sg); }
    this.setState({ form: base, exportOpen: false });
  }
  saveForm() {
    const f = this.state.form; if (this.clashesFor(f, this.slots()).length || this.state.busy) return;
    this.setState({ busy: true });
    NGGApi.admin.timetable.save({ slotId: f.id || undefined, centreId: f.centreId, course: f.course, level: f.level || "", weekday: +f.wd, startTime: f.s, endTime: f.e,
      room: f.room === "Main hall" ? "" : f.room, instructorId: f.insId || "", note: f.note || "" })
      .then(() => { this.setState({ form: null, busy: false }); this.toast((f.id ? "Saved " : "Added ") + f.course + " · " + CP3_DAYS[f.wd] + " " + f.s); this.loadSlots(); })
      .catch(e => { this.setState({ busy: false }); this.fail(e, "Couldn’t save the slot."); });
  }
  removeSlot(slot) {
    const prev = this.slots();
    this.setState({ slots: prev.filter(s => s.id !== slot.id), form: null });
    this.toast("Removed " + slot.course + " · " + CP3_DAYS[slot.wd] + " " + slot.s, () => this.setState({ slots: prev }),
      () => NGGApi.admin.timetable.remove([slot.id]).catch(e => { this.setState({ slots: prev }); this.fail(e, "Couldn’t remove the slot."); }));
  }
  exportSlots() { const cen = this.ttCentre(); const all = this.slots(); return all.filter(s => (cen === "all" || s.centreId === cen) && !this.clashesFor(s, all).length).sort((a, b) => a.centreId.localeCompare(b.centreId) || a.wd - b.wd || cp3M(a.s) - cp3M(b.s)); }
  scopeLabel() { const cen = this.ttCentre(); return cen === "all" ? "Every centre" : this.C(cen).name; }
  download(name, text, type) {
    try { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); this.setState({ exportOpen: false }); this.toast("Downloaded " + name); }
    catch (e) { this.toast("Your browser blocked the download."); }
  }
  doICS() {
    const rows = this.exportSlots(); const ins = this.state.showIns; const p = n => String(n).padStart(2, "0"); const now = new Date();
    const stamp = now.getUTCFullYear() + p(now.getUTCMonth() + 1) + p(now.getUTCDate()) + "T" + p(now.getUTCHours()) + p(now.getUTCMinutes()) + "00Z";
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NGG Club//Timetable//EN", "X-WR-CALNAME:NGG Club · " + this.scopeLabel(), "X-WR-TIMEZONE:Africa/Lagos"];
    rows.forEach(s => { const d = this.nextDate(s.wd); const ds = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); const c = this.C(s.centreId);
      lines.push("BEGIN:VEVENT", "UID:" + s.id + "@ngg-club", "DTSTAMP:" + stamp, "DTSTART;TZID=Africa/Lagos:" + ds + "T" + s.s.replace(":", "") + "00", "DTEND;TZID=Africa/Lagos:" + ds + "T" + s.e.replace(":", "") + "00",
        "RRULE:FREQ=WEEKLY;COUNT=12", "SUMMARY:" + s.course + (s.level ? " (" + s.level + ")" : ""), "LOCATION:NGG " + c.name + " · " + s.room, "DESCRIPTION:" + (ins && s.ins ? "Instructor: " + s.ins + "." : ""), "END:VEVENT"); });
    lines.push("END:VCALENDAR");
    this.download("ngg-timetable-" + (this.ttCentre() === "all" ? "all" : this.C(this.ttCentre()).slug) + ".ics", lines.join("\r\n"), "text/calendar");
  }
  doCSV() {
    const ins = this.state.showIns; const head = ["Centre", "Day", "Starts", "Ends", "Course", "Level", "Room"].concat(ins ? ["Instructor"] : []); const q = v => '"' + String(v || "").replace(/"/g, '""') + '"';
    const body = this.exportSlots().map(s => [this.C(s.centreId).name, CP3_DAYS[s.wd], s.s, s.e, s.course, s.level, s.room].concat(ins ? [s.ins] : []).map(q).join(","));
    this.download("ngg-timetable.csv", [head.join(",")].concat(body).join("\n"), "text/csv");
  }
  doPDF() {
    const rows = this.exportSlots(); const ins = this.state.showIns; const groups = {};
    rows.forEach(s => { const k = s.centreId + ":" + s.wd; (groups[k] = groups[k] || { c: this.C(s.centreId), wd: s.wd, rows: [] }).rows.push(s); });
    const esc = t => String(t || "").replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
    const sec = Object.values(groups).map(g => "<section><h2>" + esc(g.c.name) + " · " + CP3_DAYS[g.wd] + "<span>" + g.c.open + "–" + g.c.close + "</span></h2><table><thead><tr><th>Time</th><th>Course</th><th>Room</th>" + (ins ? "<th>Instructor</th>" : "") + "</tr></thead><tbody>"
      + g.rows.map(s => { const d = this.div(s.course); return '<tr><td class="t">' + s.s + "–" + s.e + '</td><td><i style="background:' + d[1] + '"></i><b>' + esc(s.course) + "</b>" + (s.level ? " <em>" + esc(s.level) + "</em>" : "") + "</td><td>" + esc(s.room) + "</td>" + (ins ? "<td>" + esc(s.ins) + "</td>" : "") + "</tr>"; }).join("") + "</tbody></table></section>").join("");
    const css = "@page{size:A4;margin:14mm}body{font-family:Geist,Helvetica,Arial,sans-serif;color:#0b0b0c;margin:0}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0b0b0c;padding-bottom:10px;margin-bottom:18px}h1{font-size:22pt;margin:0;letter-spacing:-.02em}header p{margin:4px 0 0;color:#555;font-size:10pt}header .r{text-align:right;font-size:9pt;color:#555}section{break-inside:avoid;margin-bottom:16px}h2{font-size:12pt;margin:0 0 6px;display:flex;justify-content:space-between}h2 span{font-weight:400;color:#666;font-size:10pt}table{width:100%;border-collapse:collapse;font-size:10.5pt}th{text-align:left;font-weight:600;color:#555;font-size:9pt;border-bottom:1px solid #ccc;padding:5px 6px}td{padding:6px;border-bottom:1px solid #eee}td.t{width:28mm;font-variant-numeric:tabular-nums}td i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}em{color:#666;font-style:normal;font-size:9pt}footer{margin-top:20px;font-size:8.5pt;color:#777;border-top:1px solid #ddd;padding-top:8px}";
    const printed = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>NGG Club timetable · ' + esc(this.scopeLabel()) + "</title><style>" + css + "</style></head><body><header><div><h1>NGG Club timetable</h1><p>" + esc(this.scopeLabel()) + '</p></div><div class="r">Printed ' + printed + "<br>" + esc(window.location.host) + "/timetable</div></header>" + (sec || "<p>No sessions.</p>") + "<footer>" + (ins ? "Staff copy, includes instructor names. Do not post publicly." : "Public copy, instructor names are left off.") + " Times are West Africa Time.</footer></body></html>";
    const w = window.open("", "_blank"); if (!w) return this.toast("Allow pop-ups to print the PDF"); w.document.open(); w.document.write(html); w.document.close(); this.setState({ exportOpen: false }); setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 400);
  }

  /* ── promotion ─────────────────────────────────────────────────────── */
  joinsOf(p) { const S = this.state; return S.joins[p.studentId] || (p.suggestedCentre && p.suggestedCentre.name) || ""; }
  askPromote(ids) {
    const list = ((this.state.promote || {}).rows || []).filter(p => ids.includes(p.studentId)); const noEmail = list.filter(p => p.noContact).length; const one = list.length === 1;
    if (!list.length) return;
    const noCentre = list.filter(p => !this.joinsOf(p));
    if (noCentre.length) return this.toast("Choose the Club centre " + (noCentre.length === 1 ? noCentre[0].fullName + " joins" : noCentre.length + " of them join") + " first. Their Summer centre isn’t a Club centre.");
    this.setState({ confirm: { title: one ? "Promote " + list[0].fullName + " into the Club?" : "Promote " + list.length + " into the Club?",
      body: (one ? "They become an active NGG member carrying their name, photograph, course and centre, and are" : "Each becomes an active NGG member carrying their name, photograph, course and centre, and is") + " emailed a link to set a password. " + (one ? "Their Summer School record is" : "Their Summer School records are") + " marked promoted.",
      hasWarn: noEmail > 0, warn: (one ? list[0].fullName + " has" : noEmail + (noEmail === 1 ? " of them has" : " of them have")) + " no guardian email on file. They’ll still be promoted, but nobody can email them a way in, so a centre lead will need to set that up by hand.",
      cta: one ? "Promote" : "Promote " + list.length, onOk: () => this.promote(ids) } });
  }
  promote(ids) {
    const rows = ((this.state.promote || {}).rows || []); const centres = {}; rows.filter(p => ids.includes(p.studentId)).forEach(p => { centres[p.studentId] = this.joinsOf(p); });
    const noEmail = rows.filter(p => ids.includes(p.studentId) && p.noContact).length;
    this.setState({ confirm: null, busy: true });
    NGGApi.admin.club.promoteBulk(ids, centres).then(r => {
      const failed = (r.results || []).filter(x => x && x.ok === false);
      const okIds = ids.filter(id => !failed.some(x => (x.studentId || x.id) === id));
      const noEmailOk = failed.length ? rows.filter(p => okIds.includes(p.studentId) && p.noContact).length : noEmail;
      this.setState({ psel: {}, busy: false, result: { n: r.promoted || 0, noEmail: noEmailOk, failed: failed.length, why: failed.length && typeof adminFailSummary === "function" ? adminFailSummary(failed.map(x => ({ ok: false, error: x.error }))) : "" } });
      this.loadPromote(); this.loadDash();
    }).catch(e => { this.setState({ busy: false }); this.fail(e, "Couldn’t promote them."); });
  }

  /* ── generic decisions and forms ───────────────────────────────────── */
  decide(sec, row, x) {
    if (x.act === "studio") { this.setState({ gDetail: null }); if (this.props.setPage) this.props.setPage("id-cards"); return; }
    if (x.act === "photo") return this.addApplicantPhoto(row);
    if (x.act === "workspace") { this.setState({ gDetail: null }); try { window.location.href = "/control/mentorship"; } catch (e) {} return; }
    const prev = this.state.gData[sec];
    const apply = rows => this.setState(s => ({ gData: Object.assign({}, s.gData, { [sec]: Object.assign({}, prev, { rows }) }), gDetail: null }));
    const sIdx = row.cells.findIndex(c => Array.isArray(c) && c[0] === "s");
    const next = x.do === "remove" ? prev.rows.filter(r => r.id !== row.id) : x.do ? prev.rows.map(r => r.id !== row.id ? r : Object.assign({}, r, { cells: r.cells.map((c, i) => i === sIdx ? ["s", x.do[0], x.do[1]] : c) })) : prev.rows;
    const title = (row.cells.find(c => Array.isArray(c) && c[0] === "p") || [])[1] || "";
    const run = () => this.api("decide", { sec, id: row.id, act: x.act, who: this.state.fillWho }).then(r => {
      if (sec === "volunteers" || sec === "applications" || sec === "approvals") this.loadDash();
      if (sec === "rota") { this.loadSection("rota"); this.loadDash(); }
      return r;
    });
    /* External or irreversible acts (accepting, approving, declining people)
       ask nothing more — the drawer was the question — but write at once and
       never offer Undo. A rule switch, a desk closing and "supported" can be
       taken back, so they wait out the Undo window. */
    const reversible = ["on", "off", "supported"].indexOf(x.act) !== -1;
    if (reversible) {
      apply(next);
      this.toast(x.toast + " · " + title, () => apply(prev.rows), () => run().catch(e => { apply(prev.rows); this.fail(e); }));
      return;
    }
    this.setState({ busy: true });
    run().then(() => { this.setState({ busy: false }); apply(next); this.toast(x.toast + " · " + title); }).catch(e => { this.setState({ busy: false }); this.fail(e); });
  }
  /* An application can't be accepted without a photo (the ID card needs one).
     The family usually hands one over at the centre, so staff can add it here. */
  addApplicantPhoto(row) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      if (!/^image\//.test(f.type || "")) return this.toast("That isn’t a photo. Choose a JPG or PNG.");
      this.setState({ busy: true });
      NGGApi.uploadOrInline(f, "headshot")
        .then(up => this.api("decide", { sec: "applications", id: row.id, act: "photo", url: up.url }))
        .then(() => { this.setState({ busy: false, gDetail: null }); this.toast("Photo added. They can be accepted now."); this.loadSection("applications"); this.loadDash(); })
        .catch(e => { this.setState({ busy: false }); this.fail(e, "Couldn’t add the photo."); });
    };
    inp.click();
  }
  openGForm(key) {
    const FM = cp3Forms(this.formCtx())[key]; const vals = {};
    FM.fields.forEach(x => { if (x.def !== undefined) vals[x.id] = x.def; else if (x.t === "chips") vals[x.id] = []; });
    if (key === "rota" || key === "mentorship" || key === "desks") { if (!this.state.gData.rota) this.loadSection("rota"); }
    if (key === "mentorship") this.loadUnpaired();
    this.setState({ gForm: { key, vals, tried: false }, gDetail: null, exportOpen: false });
  }
  formCtx() {
    const B = this.B(); const dash = this.state.dash || {};
    return { centres: B.centres, courses: B.courses, staff: dash.staff || [], pool: ((this.state.gData.rota || {}).pool) || [], lockC: this.lockC() };
  }
  loadUnpaired() { NGGApi.admin.mentorship.roster().then(r => this.setState({ unpaired: (r.unassigned || []).map(m => ({ id: m.memberId, name: m.fullName, centre: m.centre, course: m.track })) })).catch(() => {}); }
  submitGForm(key, v) {
    this.setState({ busy: true });
    this.api("create", { form: key, vals: v }).then(r => {
      this.setState({ gForm: null, busy: false });
      const FM = cp3Forms(this.formCtx())[key];
      if (key === "member") { this.toast(String(v.name).trim() + " added as " + (r.displayId || r.memberId) + (r.consentSent ? ". Consent link sent to the guardian." : ". Record the permissions in Permissions.")); this.setState(s => ({ dirKey: (s.dirKey || 0) + 1 })); this.loadDash(); return; }
      if (key === "families") this.toast(r.pending ? "Sent to an admin to approve. A second guardian always is." : "Linked. The guardian can sign in and see their child now.");
      else if (key === "desks") this.setState({ confirm: { title: "Desk open", body: "Open the check-in screen on the device and enter this password. It is shown once.", hasWarn: true, warn: "Password: " + (r.password || "(set by the server)"), cta: "Done", onOk: () => this.setState({ confirm: null }), noCancel: true } });
      else this.toast("Added" + (FM && FM.after ? ". " + FM.after : ""));
      const sec = { families: "families", mentorship: "mentorship", behaviour: "behaviour", conduct: "conduct", curriculum: "curriculum", rota: "rota", desks: "desks" }[key];
      if (sec) this.loadSection(sec);
      if (key === "curriculum") this.boot();
      if (key === "rota" || key === "mentorship") this.loadDash();
    }).catch(e => { this.setState({ busy: false }); this.fail(e, "Couldn’t save that."); });
  }
  /* The person picker: recent picks and suggestions when empty, a server search otherwise. */
  searchPeople(fid, q) {
    clearTimeout(this.pqT);
    this.setState(s => ({ pq: Object.assign({}, s.pq, { [fid]: q }) }));
    if (q.trim().length < 2) return;
    /* Filed under the TRIMMED query, which is what the picker compares it with:
       filed as typed, "amina " (a phone keyboard's trailing space) never
       showed the results it had fetched. */
    const qt = q.trim();
    this.pqT = setTimeout(() => this.api("search", { q: qt }).then(r => this.setState(s => ({ pres: Object.assign({}, s.pres, { [fid]: { q: qt, rows: r.members || [] } }) }))).catch(() => this.setState(s => ({ pres: Object.assign({}, s.pres, { [fid]: { q: qt, rows: [], failed: true } }) }))), 200);
  }

  /* ── announcements ─────────────────────────────────────────────────── */
  annSave(action, extra) {
    const E = this.state.annEdit; if (!E) return;
    this.setState({ busy: true });
    return this.api("ann.save", Object.assign({ action, ann: { id: E.id || "", title: E.title, body: E.body, aud: E.aud, centre: E.centre, ch: E.ch, smsBody: E.smsBody || "", when: E.when || "asap", sendAt: E.sendAtLocal || "" } }, extra || {}))
      .then(r => {
        // Follow the announcement to the tab it now lives in, so it doesn't seem to vanish.
        const st = ((r && r.announcement) || {}).status; const adm = this.isAdm();
        const tab = !st || action === "delete" ? this.state.annTab : (st === "draft" || st === "changes") ? (adm ? (st === "draft" ? "draft" : "changes") : "mine") : st;
        this.setState({ busy: false, annEdit: null, annNote: "", annTab: tab }); this.loadAnn(); if (action !== "draft") this.loadDash();
        if (r && r.smsNote) this.toast(r.smsNote);
        return r; })
      .catch(e => { this.setState({ busy: false }); if ((e.code || "") === "incomplete") this.setState(s => ({ annEdit: Object.assign({}, s.annEdit, { tried: true }) })); else this.fail(e); throw e; });
  }
  /* An SMS version of a long announcement, by AI. The server checks it kept
     every date, time, amount and link; when it can't (or AI isn't set up) the
     SMS gives way to email and Telegram, which carry the whole message. */
  annShorten() {
    const E = this.state.annEdit; if (!E || this.state.annShortBusy) return;
    this.setState({ annShortBusy: true, annShortMsg: "" });
    this.api("ann.shorten", { title: E.title, body: E.body })
      .then(r => this.setState(s => ({ annShortBusy: false, annShortMsg: r.fits ? "It already fits in a text." : "Shortened. Every date, time, amount and link is kept — read it before it goes.", annEdit: r.text ? Object.assign({}, s.annEdit, { smsBody: r.text }) : s.annEdit })))
      .catch(e => this.setState({ annShortBusy: false, annShortMsg: cp3Err(e) || "Couldn’t shorten it." }));
  }
  annNoSms() {
    const M = this.state.annMeta;
    this.setState(s => ({ annShortMsg: "", annEdit: Object.assign({}, s.annEdit, { smsBody: "", ch: Array.from(new Set(s.annEdit.ch.filter(c => c !== "sms").concat(["email"], M.tgOn ? ["telegram"] : []))) }) }));
    this.toast(M.tgOn ? "SMS off. It goes by email and Telegram, which carry the whole message." : "SMS off. It goes by email, which carries the whole message.");
  }
  annReach(E) {
    const key = E.aud + "|" + E.centre;
    if (this.reachKey === key) return; this.reachKey = key;
    this.api("ann.reach", { aud: E.aud, centre: E.centre }).then(r => this.setState({ annReach: Object.assign({ key }, r) })).catch(() => {});
  }

  /* ── the brief ─────────────────────────────────────────────────────── */
  writeBrief() {
    this.setState({ briefBusy: true, brief: "" });
    this.api("brief").then(r => this.setState({ briefBusy: false, brief: r.text, briefLeads: r.leads || [] })).catch(e => { this.setState({ briefBusy: false }); this.fail(e, "Couldn’t write the brief."); });
  }

  /* ── render ────────────────────────────────────────────────────────── */
  renderVals() {
    const S = this.state; const B = S.boot;
    const W = S.width; const isPhone = W < 640;
    const sec = S.sec;
    const tone = t => CP3_TONE[t] || CP3_TONE.neutral;
    const isAdm = this.isAdm(); const lockC = this.lockC();
    const scope = this.scopeName(); const inScope = c => scope === "all" || String(c || "").indexOf(scope) >= 0 || c === "All centres";
    const dash = S.dash || { memberStats: { total: 0, byStatus: [["Active", 0, "ok"], ["Inactive", 0, "warn"], ["Graduated", 0, "neutral"]], atRisk: 0, unpaired: 0 }, centreStats: {}, counts: {}, staff: [], attFrom: "" };
    const cnt = dash.counts || {};
    const all = this.slots(); const clashing = all.filter(s => this.clashesFor(s, all).length);
    const comp = S.comp || []; const lowN = comp.filter(c => c.tone === "bad" && !c.told && (this.scopeName() === "all" || c.centre === this.scopeName())).length;
    const ST = (dash.staff || []).filter(x => inScope(x.centre));
    const annAll = S.ann || []; const annBadge = isAdm ? annAll.filter(a => a.status === "pending").length : annAll.filter(a => a.status === "changes").length;
    const permIssues = S.cons ? S.cons.rows.filter(r => r.status === "Active" && inScope(r.centre) && (!this.consentOf(r).guardian || this.reqMissing(this.consentOf(r)).length)).length : (cnt.permissionsMissing || 0);
    const gRows = k => ((S.gData[k] || {}).rows || []);
    const rotaUnfilled = S.gData.rota ? gRows("rota").filter(r => r.cells[4][1] === "Unfilled").length : (cnt.rotaUnfilled || 0);
    const badge = { announce: [annBadge, isAdm ? "#f5b026" : "#d94141", isAdm ? "#2a1d00" : "#fff"], promote: [cnt.promotable || 0, "#f5b026", "#2a1d00"],
      timetable: [clashing.length, "#d94141", "#fff"], companion: [lowN, "#f5b026", "#2a1d00"], approvals: [S.gData.approvals ? gRows("approvals").length : (cnt.approvals || 0), "#f5b026", "#2a1d00"],
      applications: [S.gData.applications ? gRows("applications").length : (cnt.applications || 0), "#f5b026", "#2a1d00"], permissions: [permIssues, "#d94141", "#fff"],
      team: [ST.filter(x => x.tone === "bad").length, "#d94141", "#fff"], rota: [rotaUnfilled, "#d94141", "#fff"] };
    const cap99 = n => n > 99 ? "99+" : n;
    const isTab = CP3_TABS.some(t => t[0] === sec);
    const mk = (n, on) => { const b = badge[n[0]]; return { label: n[1], short: n[1], icon: "ph ph-" + n[2], current: on ? "page" : undefined, bg: on ? "#ebebe9" : "transparent", fw: on ? 600 : 400, ic: on ? "#0b0b0c" : "#5d5d63", pc: on ? "#0b0b0c" : "#6b6b72", pbg: on ? "#f1f1ef" : "transparent", hasBadge: !!(b && b[0]), badge: b ? cap99(b[0]) : 0, bb: b ? b[1] : "", bf: b ? b[2] : "", onClick: () => this.go(n[0]) }; };
    /* Hide what this account cannot use rather than show a door that 403s:
       curriculum edits need `curriculum`, the gate needs `checkin`. */
    const canSee = id => !((id === "desks" || id === "rota") && !B.me.canCheckin) && !(String(id).indexOf("wifi") === 0 && !B.me.canNetwork) && !(id === "wifi-regions" && !B.me.canWifiRegions);
    const NAVG = CP3_NAV.map(g => [g[0], g[1].filter(n => canSee(n[0]))]).filter(g => g[1].length);
    const navGroups = NAVG.map(g => ({ h: g[0] || "", hasH: !!g[0], items: g[1].map(n => mk(n, n[0] === sec)) }));
    const moreItems = NAVG.reduce((a, g) => a.concat(g[1]), []).filter(n => !CP3_TABS.some(t => t[0] === n[0]));
    const moreN = moreItems.filter(n => n[3]).reduce((a, n) => a + ((badge[n[0]] || [0])[0] || 0), 0);
    const nav = CP3_TABS.map(t => { const x = mk(t, t[0] === sec || (t[0] === "more" && !isTab)); if (t[0] === "more") Object.assign(x, { hasBadge: moreN > 0, badge: cap99(moreN), bb: "#f5b026", bf: "#2a1d00" }); return x; });
    const META = cp3Meta(isAdm); Object.keys(CP3_G).forEach(k => { META[k] = [CP3_G[k].title, CP3_G[k].desc]; });
    Object.assign(META, CW_META);
    const SHORT = { home: "Dashboard", promote: "Promote", companion: "Check-ins", roster: "Roster" }; const stop = e => e.stopPropagation();
    const fmt = cp3Fmt;
    const centresAll = B.centres;
    const out = { rootRef: this.rootRef, isPhone, isDesktop: !isPhone, nav, navGroups, title: META[sec][0], desc: META[sec][1], isHome: sec === "home", isPromote: sec === "promote", isRoster: sec === "roster", isTT: sec === "timetable", isComp: sec === "companion", stop,
      centreOpts: centresAll.map(c => ({ id: c.id, name: c.name })), isAdminAcct: isAdm || B.me.canControl, scopeL: scope === "all" ? "All centres" : scope, scopeLocked: !!lockC, scopeFree: !lockC,
      scopeOpen: S.scopeOpen && !lockC, toggleScope: () => !lockC && this.setState(s => ({ scopeOpen: !s.scopeOpen })), closeScope: () => this.setState({ scopeOpen: false }),
      scopeSub: lockC ? "Your centre" : "Showing", hasScopeCrumb: scope !== "all",
      scopeOpts: [{ n: "All centres", id: "all" }].concat(centresAll.map(c => ({ n: c.name, id: c.name, tone: (dash.centreStats[c.id] || {}).tone }))).map(o => {
        const on = scope === o.id; const n = o.id === "all" ? (dash.memberStats.byStatus[0] || [0, 0])[1] : ((dash.centreStats[(this.CN(o.id) || {}).id] || {}).members || 0);
        return { l: o.n, n: fmt(n) + " active", on, check: on ? "ph ph-check" : "", dot: o.tone ? CP3_TONE[o.tone][2] : "transparent",
          onClick: () => { const c = this.CN(o.id); this.setState({ scope: o.id, scopeOpen: false, centre: c ? c.id : S.centre, pages: {} }); this.toast(o.id === "all" ? "Showing every centre" : "Showing " + o.n + " only"); } }; }),
      toControl: () => { if (this.props.setPage) this.props.setPage("admin"); }, toSummer: () => { if (B.me.canSummer && this.props.setPage) this.props.setPage("summer-admin"); else this.toast("Summer School needs a Summer coordinator’s access."); },
      signOut: () => { this.flushAll(); if (this.props.signOut) this.props.signOut(); },
      phoneBackdrop: "#fff", phoneW: "100%", phoneH: "100%", phoneR: "0", phoneShadow: "none",
      phoneTitle: SHORT[sec] || META[sec][0], cellPad: S.density === "compact" ? "5px 16px" : "10px 16px",
      onPageSize: e => this.setState({ psize: +e.target.value, pages: {} }),
      densityOpts: [["comfortable", "Comfortable", "ph ph-rows"], ["compact", "Compact", "ph ph-list"]].map(o => { const on = S.density === o[0]; return { l: o[1], icon: o[2], on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", onClick: () => { try { localStorage.setItem("ngg.cp3.density", o[0]); } catch (e) {} this.setState({ density: o[0] }); } }; }),
      ctlH: isPhone ? "48px" : "38px", btnH: isPhone ? "48px" : "38px", attFrom: dash.attFrom || "", clauseN: String((B.clauses || []).length) };

    /* ── dashboard ── */
    const CS = dash.centreStats || {}; const SCs = centresAll.filter(c => inScope(c.name));
    const MS = scope === "all" ? dash.memberStats : (() => { const c = this.CN(scope); const x = c ? CS[c.id] || {} : {}; return { total: x.members || 0, byStatus: [["Active", x.members || 0, "ok"]], atRisk: dash.memberStats.atRisk, unpaired: x.unpaired || 0 }; })();
    const roleName = { mentor: "mentor", instructor: "instructor", lead: "centre lead", admin: "admin" };
    const live = all.filter(s => !this.clashesFor(s, all).length);
    const roleList = r => ST.filter(x => x.role === r).map(x => r === "instructor" ? Object.assign({}, x, { classes: live.filter(s => s.ins === x.name).length, teaches: [...new Set(live.filter(s => s.ins === x.name).map(s => s.course))].join(", ") }) : x);
    const MEN = roleList("mentor"), INS = roleList("instructor"), LEAD = roleList("lead"), ADM = roleList("admin");
    const LBL = { ok: "Active", warn: "Needs follow-up", bad: "Blocked", neutral: "Away or off" };
    const peopleSegs = list => ["ok", "warn", "bad", "neutral"].map(k => [LBL[k], list.filter(x => x.tone === k).length, k]);
    const firstIssue = list => { const x = list.find(p => p.tone === "bad") || list.find(p => p.tone === "warn"); return x ? { t: x.name + " · " + x.state.toLowerCase() + (x.detail ? ". " + x.detail : ""), s: x.name + " · " + x.state.toLowerCase(), tone: x.tone } : null; };
    const cTone = { ok: "Running normally", warn: "Needs attention", bad: "Problem" };
    const badC = SCs.find(c => (CS[c.id] || {}).tone === "bad") || SCs.find(c => (CS[c.id] || {}).tone === "warn");
    const groupDefs = [
      { title: "Members", icon: "users", n: fmt(MS.byStatus[0][1]), unit: "active of " + fmt(MS.total), segs: MS.byStatus, issue: MS.atRisk || MS.unpaired ? { t: MS.atRisk + " at risk of dropping out · " + MS.unpaired + " have no mentor", s: MS.atRisk + " at risk · " + MS.unpaired + " no mentor", tone: "warn" } : null, go: ["roster"] },
      { title: "Centres", icon: "map-pin", n: String(SCs.length), unit: "centres", segs: ["ok", "warn", "bad"].map(k => [cTone[k], SCs.filter(c => (CS[c.id] || {}).tone === k).length, k]), issue: badC ? { t: badC.name + " · " + CS[badC.id].issue, s: badC.name + " · " + CS[badC.id].issue.toLowerCase(), tone: CS[badC.id].tone } : null, go: ["centres"] },
      { title: "Mentors", icon: "compass", list: MEN, unit: "mentoring " + MEN.reduce((a, x) => a + (x.load || 0), 0) + " members", go: ["team", "mentors"] },
      { title: "Instructors", icon: "chalkboard-teacher", list: INS, unit: "teaching " + live.length + " classes a week", go: ["team", "instructors"] },
      { title: "Centre leads", icon: "flag", list: LEAD, unit: "one per centre", go: ["team", "leads"] },
      { title: "Admins", icon: "shield-check", list: ADM, unit: "with portal access", go: ["team", "admins"] },
    ];
    out.groups = groupDefs.map((g, i) => { const segs = (g.list ? peopleSegs(g.list) : g.segs).filter(x => x[1] > 0); const issue = g.list ? firstIssue(g.list) : g.issue; const it = issue ? tone(issue.tone) : null;
      return { title: g.title, icon: "ph ph-" + g.icon, n: g.list ? String(g.list.length) : g.n, unit: g.unit, segs: segs.map(x => ({ l: x[0], n: fmt(x[1]), f: String(x[1]), bg: tone(x[2])[2] })),
        issue: issue ? issue.t : "Nothing needs attention", issueShort: issue ? issue.s : "Nothing needs attention", issueColor: issue ? it[1] : "#17663a", issueIcon: issue ? "ph ph-warning-circle" : "ph ph-check-circle", toneDot: issue ? it[2] : "#22a05a",
        bt: i ? "1px solid #f1f1ef" : "0", onClick: () => { this.go(g.go[0]); this.setState({ gtab: g.go[1] || null }); } }; });
    const pres = SCs.reduce((a, c) => a + ((CS[c.id] || {}).present || 0), 0), exp = SCs.reduce((a, c) => a + ((CS[c.id] || {}).expected || 0), 0);
    const uniq = [...new Set(ST.filter(x => x.tone !== "neutral").map(x => x.name))]; const follow = uniq.filter(nm => ST.some(x => x.name === nm && (x.tone === "bad" || x.tone === "warn")));
    const avgTrend = (() => { const t = SCs.map(c => parseInt(String((CS[c.id] || {}).trend || "0").replace("−", "-"), 10) || 0); return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 0; })();
    out.primary = [
      { l: "Active members", short: "active members", v: fmt(MS.byStatus[0][1]), s: "of " + fmt(MS.total) + " on the roster", d: MS.unpaired + " without a mentor", dc: MS.unpaired ? "#a12a2a" : "#17663a", onClick: () => this.go("roster") },
      { l: "Attendance last session", short: "came last session", v: exp ? Math.round(pres / exp * 100) + "%" : "—", s: pres + " of " + exp + " active members", d: (avgTrend >= 0 ? "+" : "−") + Math.abs(avgTrend) + " pt" + (Math.abs(avgTrend) === 1 ? "" : "s") + " on the weeks before", dc: avgTrend < 0 ? "#a12a2a" : "#17663a", onClick: () => this.go("centres") },
      { l: "Team needing follow-up", short: "team need follow-up", v: String(follow.length), s: "of " + uniq.length + " mentors, instructors, leads and admins", d: ST.filter(x => x.tone === "bad").length + " blocked from working", dc: ST.some(x => x.tone === "bad") ? "#a12a2a" : "#17663a", onClick: () => { this.go("team"); this.setState({ gtab: "mentors" }); } },
    ];
    const needs = [];
    ST.filter(x => x.tone === "bad").forEach(x => needs.push({ n: 1, l: "A " + roleName[x.role] + " isn’t cleared to work with children", s: x.name + " · " + x.centre + (x.detail ? " · " + x.detail.toLowerCase() : ""), tone: "bad", go: "team", gtab: x.role + "s" }));
    if (rotaUnfilled) { const f = cnt.rotaFirstUnfilled; needs.push({ n: rotaUnfilled, l: "Duty shift" + (rotaUnfilled > 1 ? "s" : "") + " with nobody on " + (rotaUnfilled > 1 ? "them" : "it"), s: f ? this.fmtDate(new Date(f.date + "T00:00:00")) + " · " + f.centre + " " + f.start + "–" + f.end : "", tone: "bad", go: "rota" }); }
    if (clashing.length) needs.push({ n: clashing.length, l: "Timetable slot" + (clashing.length > 1 ? "s" : "") + " clashing", s: this.clashesFor(clashing[0], all)[0].detail, tone: "bad", go: "timetable", centre: clashing[0].centreId });
    if (lowN) needs.push({ n: lowN, l: "Members said they’re struggling", s: "Their mentors haven’t been told yet", tone: "bad", go: "companion" });
    if (permIssues) needs.push({ n: permIssues, l: "Active member" + (permIssues > 1 ? "s" : "") + " missing a required permission", s: "They shouldn’t be in class until a guardian agrees", tone: "bad", go: "permissions", pf: "missing" });
    if (badge.approvals[0]) needs.push({ n: badge.approvals[0], l: "Approvals waiting", s: (cnt.approvalKinds || []).join(", ") || "A second admin decides these", tone: "warn", go: "approvals" });
    if (cnt.promotable) needs.push({ n: cnt.promotable, l: "Summer graduates waiting to join", s: (cnt.promotableNoEmail || 0) + " have no guardian email", tone: "warn", go: "promote" });
    if (badge.applications[0]) needs.push({ n: badge.applications[0], l: "Applications to review", s: cnt.applicationsOldestDays ? "Oldest has waited " + cnt.applicationsOldestDays + " day" + (cnt.applicationsOldestDays === 1 ? "" : "s") : "New today", tone: "warn", go: "applications" });
    out.needs = needs.map((r, i) => { const t = tone(r.tone); return Object.assign({}, r, { n: cap99(r.n), bg: t[0], fg: t[1], bt: i ? "1px solid #f1f1ef" : "0", onClick: () => { this.go(r.go); this.setState({ centre: r.centre || S.centre, gtab: r.gtab || null, permFilter: r.pf || S.permFilter }); } }); });
    out.allClear = needs.length === 0;
    { const now = new Date(); const satDays = SCs.length === 1 ? SCs[0].days : [6]; const sc0 = SCs.length === 1 ? SCs[0] : null;
      let nx = null; for (let i = 0; i < 8 && !nx; i++) { const d = new Date(now); d.setDate(now.getDate() + i); if (satDays.includes(d.getDay() || 7)) { const [h, m] = (sc0 ? sc0.open : "09:00").split(":").map(Number); d.setHours(h, m || 0, 0, 0); if (d > now) nx = d; } }
      if (!nx) { nx = new Date(now); nx.setDate(now.getDate() + 7); }
      const ms = nx - now; const dD = Math.floor(ms / 864e5), hH = Math.floor((ms % 864e5) / 36e5);
      out.satWhen = nx.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + " · doors " + (sc0 ? sc0.open : "09:00");
      out.satIn = dD ? dD + "d " + hH + "h" : hH + "h";
      const badStaff = ST.filter(x => x.tone === "bad").length; const nextName = sc0 ? CP3_DAYS[satDays[0]] : "Saturday";
      const checks = [["Timetable has no clashes", !clashing.length, "timetable", clashing.length + " clashing"], ["Every duty shift has someone on it", !rotaUnfilled, "rota", rotaUnfilled + " unfilled"],
        ["Every active member has guardian permission", !permIssues, "permissions", permIssues + " missing"], ["Every adult is cleared to work with children", !badStaff, "team", badStaff + " not cleared"],
        ["Struggling members passed to their mentor", !lowN, "companion", lowN + " not passed on"]];
      const okN = checks.filter(c => c[1]).length; const pct = Math.round(okN / checks.length * 100);
      out.satPct = pct + "%"; out.satRing = "conic-gradient(" + (okN === checks.length ? "#22a05a" : "#0b0b0c") + " " + pct + "%, #ececea 0)";
      out.satHead = okN === checks.length ? "Ready for " + nextName : (checks.length - okN) + (checks.length - okN > 1 ? " things" : " thing") + " to clear before " + nextName;
      out.satChecks = checks.map(([l, ok, go, why]) => ({ l, why: ok ? "Done" : why, icon: ok ? "ph ph-check-circle" : "ph ph-warning-circle", ic: ok ? "#22a05a" : "#d94141", fg: ok ? "#6b6b72" : "#0b0b0c", fw: ok ? 400 : 500, wc: ok ? "#6b6b72" : "#a12a2a", hasFix: !ok,
        onClick: () => { this.go(go); if (go === "permissions") this.setState({ permFilter: "missing" }); } }));
      out.briefIdle = !S.brief && !S.briefBusy; out.briefBusy = S.briefBusy; out.briefHas = !!S.brief && !S.briefBusy; out.brief = S.brief;
      out.writeBrief = () => this.writeBrief();
      out.briefCopy = () => { try { navigator.clipboard.writeText(S.brief); this.toast("Brief copied"); } catch (e) { this.toast("Copy it by selecting the text."); } };
      out.briefSend = () => this.setState({ confirm: { title: "Send the brief to the centre leads?", body: "It goes to " + ((S.briefLeads || []).join(", ") || "the leads of these centres") + " in the app and by email. Sent messages can’t be recalled.", cta: "Send now",
        onOk: () => { this.setState({ confirm: null }); this.api("brief.send", { text: S.brief }).then(r => this.toast("Sent to " + (r.sentTo || []).join(", "))).catch(e => this.fail(e)); } } });
      out.briefScope = scope === "all" ? "All centres" : scope; }
    const nBad = needs.filter(r => r.tone === "bad").length;
    out.healthHead = !S.dash ? (S.dashErr ? "Couldn’t load the figures" : "Reading the Club…") : needs.length ? needs.length + (needs.length === 1 ? " thing needs you" : " things need you") + (nBad ? ", " + nBad + " urgent" : "") : "Everything is on track";
    const slipping = SCs.filter(c => (CS[c.id] || {}).tone && CS[c.id].tone !== "ok");
    out.healthSub = !S.dash ? (S.dashErr || "") : slipping.length ? (slipping.length === SCs.length ? "Every centre needs attention: " : "Most of the Club is running normally. ") + slipping.map(c => c.name + " — " + CS[c.id].issue.toLowerCase()).join("; ") + "." : "Every centre is running normally.";
    out.healthDot = nBad ? "#d94141" : needs.length ? "#f5b026" : "#22a05a";
    out.centreRows = SCs.map(c => { const x = CS[c.id] || { members: 0, expected: 0, present: 0, trend: "+0 pts", unpaired: 0, desk: "—", tone: "ok", issue: "Running normally" }; const t = tone(x.tone); const pct = x.expected ? Math.round(x.present / x.expected * 100) : 0;
      const lead = LEAD.find(l => l.centre === c.name); const men = MEN.filter(m => m.centre === c.name); const okM = men.filter(m => m.tone === "ok").length;
      return { name: c.name, meets: c.days.map(d => CP3_DAYS[d] + "s").join(", ") + " " + c.open + "–" + c.close, st: cTone[x.tone], sbg: t[0], sfg: t[1], sdot: t[2], hasIssue: x.tone !== "ok", issue: x.issue,
        members: fmt(x.members), pct: pct + "%", trend: x.trend, trendColor: String(x.trend).charAt(0) === "+" ? "#17663a" : "#a12a2a", present: x.present + " of " + x.expected,
        lead: lead ? lead.name : "—", leadSub: lead ? lead.state : "No lead", leadColor: lead && lead.tone !== "ok" ? tone(lead.tone)[1] : (lead ? "#6b6b72" : "#a12a2a"),
        mentors: okM + " of " + men.length + " active", menColor: okM < men.length ? "#7a5600" : "#3a3a40", unpaired: String(x.unpaired), unpairedColor: x.unpaired > 5 ? "#a12a2a" : "#3a3a40",
        classes: String(live.filter(s => s.centreId === c.id).length), desk: x.desk }; });
    out.goTT = () => this.go("timetable");

    /* ── promote ── */
    const promotable = ((S.promote || {}).rows || []);
    const q = S.q.trim().toLowerCase();
    const plist = promotable.filter(p => inScope(this.joinsOf(p) || p.centre)).filter(p => (!q || (p.fullName + " " + p.studentId + " " + (p.displayId || "")).toLowerCase().includes(q)) && (!S.pcentre || p.centre === S.pcentre));
    const pselIds = Object.keys(S.psel).filter(k => S.psel[k] && promotable.find(p => p.studentId === k));
    const pAll = plist.length > 0 && plist.every(p => S.psel[p.studentId]);
    out.q = S.q; out.onQ = e => this.setState({ q: e.target.value });
    const summerCentres = [...new Set(promotable.map(p => p.centre).filter(Boolean))].sort();
    out.pCentreChips = [["", "All centres"]].concat(summerCentres.map(c => [c, c])).map(c => ({ l: c[1], on: S.pcentre === c[0], border: S.pcentre === c[0] ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => this.setState({ pcentre: c[0] }) }));
    const pP = this.pager("promote", plist.length, [q, S.pcentre].join("|"), isPhone); out.pPg = pP;
    out.prows = plist.slice(pP.start, pP.end).map(p => { const sel = !!S.psel[p.studentId]; const joins = this.joinsOf(p); const moved = joins !== p.centre; const days = +p.attendanceCount || 0;
      return { id: p.studentId, name: p.fullName, course: p.track, summer: p.centre, sub: (p.displayId || p.studentId) + (p.status === "graduated" ? " · graduated" : " · still enrolled"), sel, bg: sel ? "#fafaf9" : "#fff", cbBg: sel ? "#0b0b0c" : "#fff", cbBorder: sel ? "#0b0b0c" : "#cfcfcb",
        joins: (this.CN(joins) || {}).id || "", joinsName: joins || "Choose a centre", moved, joinsBorder: moved ? "#e0a100" : "#e2e2df", days: days + " days", pct: Math.min(100, days / 30 * 100) + "%", pbg: days < 21 ? "#e0a100" : "#0b0b0c",
        hasEmail: !p.noContact, noEmail: !!p.noContact, email: p.parentEmail || "", onSel: () => this.setState(s => ({ psel: Object.assign({}, s.psel, { [p.studentId]: !sel }) })),
        onJoins: e => { const v = e.target.value; const c = this.C(v); this.setState(s => ({ joins: Object.assign({}, s.joins, { [p.studentId]: c.name }) })); }, onPromote: () => this.askPromote([p.studentId]) }; });
    out.pAllSel = pAll; out.pAllBg = pAll ? "#0b0b0c" : "#fff"; out.pAllBorder = pAll ? "#0b0b0c" : "#cfcfcb";
    out.pToggleAll = () => { const n = {}; if (!pAll) plist.forEach(p => n[p.studentId] = true); this.setState({ psel: n }); };
    out.pSelCount = pselIds.length; out.hasPSel = pselIds.length > 0;
    const noEmailSel = promotable.filter(p => pselIds.includes(p.studentId) && p.noContact).length;
    out.hasNoEmailSel = noEmailSel > 0; out.noEmailSelText = noEmailSel ? noEmailSel + " with no guardian email" : "All have a guardian email";
    out.askPromoteSel = () => this.askPromote(pselIds);
    out.phonePromoteBar = isPhone && sec === "promote" && pselIds.length > 0;
    // Loading, failed and empty each say so: a table that stays blank hides an outage.
    out.pEmpty = !!S.promoteErr || !S.promote || plist.length === 0;
    out.pEmptyText = S.promoteErr ? "Couldn’t load the Summer School list: " + S.promoteErr + " Open Promote again to retry."
      : !S.promote ? "Loading the Summer School records…"
      : promotable.length ? "Nobody matches these filters." : "Nobody is waiting to be promoted. Summer School records appear here once they graduate.";
    out.hasResult = !!S.result; out.resultText = S.result ? (S.result.n ? S.result.n + " promoted into the Club." : "Nobody was promoted.") + (S.result.failed ? " " + S.result.failed + " refused (" + S.result.why + ")." : "") : "";
    out.resultSub = !S.result || !S.result.n ? "" : S.result.noEmail ? S.result.noEmail + (S.result.noEmail === 1 ? " needs" : " need") + " a sign-in set up by hand." : "Sign-in links are on their way to guardians."; out.dismissResult = () => this.setState({ result: null });

    /* ── roster: the Student Directory, embedded (cp3-directory.jsx) ── */
    out.true = true;
    out.dcImports = { "Student Directory": props => React.createElement(Sd3Directory, Object.assign({}, props, { key: "dir", centre: scope === "all" ? null : scope, reloadKey: S.dirKey || 0, seedQ: S.dirQ || "",
      density: S.density === "compact" ? "Compact" : "Comfortable", onAdd: () => this.openGForm("member"),
      onPermissions: id => { this.go("permissions"); this.setState({ permSel: id }); } })) };
    const STL = { active: "Active", inactive: "Inactive", "graduated-ngg": "Graduated", "graduated-vanguard": "Graduated", suspended: "Suspended" };

    /* ── timetable ── */
    const cen = this.ttCentre(); const one = cen !== "all"; const C0 = one ? this.C(cen) : null;
    const scC = this.CN(scope);
    out.centreTabs = (scC ? [scC] : [{ id: "all", name: "Every centre" }].concat(centresAll)).map(c => { const on = cen === c.id; return { l: c.name, on, hasClash: c.id !== "all" && clashing.some(s => s.centreId === c.id), bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => { try { localStorage.setItem("ngg.tt.centre", c.id); } catch (e) { } this.setState({ centre: c.id }); } }; });
    out.oneCentre = one;
    out.viewOpts = [["week", "Week", "squares-four"], ["list", "List", "list-bullets"]].map(o => { const on = S.view === o[0]; return { l: o[1], icon: "ph ph-" + o[2], on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", onClick: () => this.setState({ view: o[0] }) }; });
    const scoped = all.filter(s => (!one || s.centreId === cen) && inScope(this.C(s.centreId).name));
    const scClash = scoped.filter(s => this.clashesFor(s, all).length);
    out.hasClashes = scClash.length > 0; out.clashTitle = scClash.length + " slot" + (scClash.length > 1 ? "s clash" : " clashes");
    out.clashList = scClash.map(s => ({ title: this.C(s.centreId).name + " · " + CP3_DAYS[s.wd] + " " + s.s + "–" + s.e + " · " + s.course, detail: this.clashesFor(s, all).map(c => c.detail).join(" "), onFix: () => { const sg = this.suggest(s, all); this.setState({ form: sg ? Object.assign({}, s, sg) : Object.assign({}, s) }); }, onRemove: () => this.removeSlot(s) }));
    if (one) { const nd = this.nextDate(C0.days[0]); const today = new Date(); today.setHours(0, 0, 0, 0); const da = Math.round((nd - today) / 864e5);
      out.ttContext = "Meets " + C0.days.map(d => CP3_DAYS[d] + "s").join(", ") + " " + C0.open + "–" + C0.close + " · next " + (da === 0 ? "today" : this.fmtDate(nd) + ", in " + da + " days") + (C0.hoursSet ? "" : " · set its hours in Centres"); }
    else out.ttContext = S.slotsErr ? "Couldn’t load the timetable: " + S.slotsErr : scoped.length + " classes across " + centresAll.length + " centres";
    out.showGrid = !isPhone && one && S.view === "week"; out.showList = !isPhone && (!one || S.view === "list");
    if (one) {
      const HH = 76; const o = cp3M(C0.open), cl = cp3M(C0.close);
      out.gridH = ((cl - o) / 60 * HH) + "px"; out.gridCols = String(C0.days.length);
      out.hours = []; for (let t = o; t <= cl; t += 60) out.hours.push({ l: cp3HM(t), top: ((t - o) / 60 * HH) + "px" });
      out.gridDays = C0.days.map(wd => {
        const ds = scoped.filter(s => s.wd === wd && !this.clashesFor(s, all).length).sort((a, b) => cp3M(a.s) - cp3M(b.s));
        const lanes = []; const laneOf = {};
        ds.forEach(s => { let li = lanes.findIndex(end => end <= cp3M(s.s)); if (li < 0) { li = lanes.length; lanes.push(0); } lanes[li] = cp3M(s.e); laneOf[s.id] = li; });
        const L = Math.max(1, lanes.length);
        const blocks = ds.map(s => { const d = this.div(s.course); const a = cp3M(s.s), b = cp3M(s.e); return { course: s.course, time: s.s + "–" + s.e, meta: s.room + " · " + (s.ins || "No instructor"), aria: s.course + ", " + s.s + " to " + s.e + ", " + s.room + ". Edit",
          top: ((a - o) / 60 * HH + 3) + "px", height: ((b - a) / 60 * HH - 6) + "px", left: "calc(" + (laneOf[s.id] / L * 100) + "% + 4px)", width: "calc(" + (100 / L) + "% - 8px)", bg: d[0], line: d[1], onClick: () => this.setState({ form: Object.assign({}, s) }) }; });
        const gaps = []; for (let x = o; x < cl; x += 30) { const used = ds.filter(s => cp3M(s.s) < x + 30 && x < cp3M(s.e)).length; if (used === 0) gaps.push(x); }
        return { name: CP3_DAYS[wd], meta: this.fmtDate(this.nextDate(wd)) + " · " + ds.length + (ds.length === 1 ? " class" : " classes"), blocks,
          gaps: gaps.map(x => ({ l: cp3HM(x), aria: "Add a slot at " + cp3HM(x), top: ((x - o) / 60 * HH + 2) + "px", height: (30 / 60 * HH - 4) + "px",
            onClick: () => { const f = { id: null, centreId: cen, wd, s: cp3HM(x), e: cp3HM(Math.min(cl, x + 60)), course: "Chess", room: C0.rooms[0], ins: "", insId: "", level: "" }; const free = C0.rooms.find(r => !this.clashesFor(Object.assign({}, f, { room: r }), all).some(c => c.type === "room")); this.setState({ form: Object.assign({}, f, { room: free || f.room }) }); } })) };
      });
    } else { out.gridDays = []; out.hours = []; out.gridH = "0px"; out.gridCols = "1"; }
    const grp = {}; scoped.filter(s => !this.clashesFor(s, all).length).sort((a, b) => a.wd - b.wd || cp3M(a.s) - cp3M(b.s)).forEach(s => { const k = (one ? "" : s.centreId + ":") + s.wd; (grp[k] = grp[k] || { title: (one ? "" : this.C(s.centreId).name + " · ") + CP3_DAYS[s.wd] + " " + this.fmtDate(this.nextDate(s.wd)).replace(/^\w+ /, ""), rows: [] }).rows.push(s); });
    out.listGroups = Object.values(grp).map(g => ({ title: g.title, rows: g.rows.map((s, i) => ({ time: s.s + "–" + s.e, start: s.s, end: s.e, course: s.course, level: s.level, room: s.room, ins: s.ins || "No instructor", dot: this.div(s.course)[1], bt: i ? "1px solid #f1f1ef" : "0", onClick: () => this.setState({ form: Object.assign({}, s) }) })) }));
    out.legend = Object.keys(CP3_DIV).map(k => ({ l: CP3_DIV[k][2], bg: CP3_DIV[k][0], line: CP3_DIV[k][1] }));
    out.addSlot = () => this.openForm(null);
    out.exportOpen = S.exportOpen && !isPhone; out.exportPhone = S.exportOpen && isPhone; out.toggleExport = () => this.setState(s => ({ exportOpen: !s.exportOpen }));
    out.exportScope = this.scopeLabel() + " · " + this.exportSlots().length + " classes · " + (S.showIns ? "staff copy with instructors" : "public copy, no instructor names");
    const link = window.location.host + "/timetable" + (one ? "?centre=" + C0.slug : "");
    out.exports = [["file-pdf", "Print or save as PDF", "A4, grouped by centre and day, for a notice board", () => this.doPDF()], ["calendar-plus", "Add to calendar (.ics)", "Repeats weekly for twelve weeks", () => this.doICS()], ["file-csv", "Spreadsheet (.csv)", "For Sheets or Excel", () => this.doCSV()],
      ["link", "Copy the public link", link, () => { try { navigator.clipboard.writeText("https://" + link); this.toast("Public link copied"); } catch (e) { this.toast(link); } this.setState({ exportOpen: false }); }]].map(x => ({ icon: "ph ph-" + x[0], l: x[1], s: x[2], onClick: x[3] }));
    out.showIns = S.showIns; out.toggleIns = () => this.setState(s => ({ showIns: !s.showIns })); out.insTrack = S.showIns ? "#0b0b0c" : "#d6d6d3"; out.insKnob = S.showIns ? "16px" : "2px";

    /* ── companion ── */
    out.comp = comp.filter(c => inScope(c.centre)).map(c => { const t = tone(c.tone);
      return Object.assign({}, c, { ini: cp3Ini(c.name), bg: t[0], fg: t[1], hasNote: !!c.note, isLow: c.tone === "bad" && !c.told, mentorFirst: c.hasMentor ? c.mentor.split(" ")[0] : "a mentor",
        onTell: () => { if (!c.hasMentor) { this.toast(c.name + " has no mentor yet. Pair them in Mentorship."); return; }
          this.api("checkin", { id: c.id, act: "tell" }).then(r => { this.setState(s => ({ comp: (s.comp || []).map(x => x.id === c.id ? Object.assign({}, x, { told: true }) : x) })); this.toast(r.mentor + " has been told"); }).catch(e => this.fail(e)); },
        onSeen: () => { const prev = S.comp; this.setState(s => ({ comp: (s.comp || []).filter(x => x.id !== c.id) }));
          this.toast("Marked seen", () => this.setState({ comp: prev }), () => this.api("checkin", { id: c.id, act: "seen" }).catch(e => { this.setState({ comp: prev }); this.fail(e); })); } }); });
    out.compEmpty = !!S.comp && comp.length === 0;

    /* ── team, centres and the generic sections ── */
    const ord = { bad: 0, warn: 1, ok: 2, neutral: 3 }; const srt = l => l.slice().sort((x, y) => ord[x.tone] - ord[y.tone]);
    const also = x => { const o = ST.filter(y => y.name === x.name && y.role !== x.role).map(y => roleName[y.role]); return o.length ? "Also " + o.join(", ") : ""; };
    const pst = x => ["s", x.state, x.tone];
    const TEAM = { tabs: [
      { id: "mentors", l: "Mentors", cols: ["Mentor", "Centre", "Mentees", "Status", "Detail", "Last active"], rows: srt(MEN).map(x => ({ id: "m" + x.id, cells: [["p", x.name, also(x)], x.centre, ["n", String(x.load || 0)], pst(x), x.detail, x.last] })), src: MEN },
      { id: "instructors", l: "Instructors", cols: ["Instructor", "Teaches", "Classes a week", "Status", "Detail", "Last active"], rows: srt(INS).map(x => ({ id: "i" + x.id, cells: [["p", x.name, also(x)], x.teaches || "—", ["n", String(x.classes)], pst(x), x.detail || (x.classes ? "On the timetable" : "Not on the timetable"), x.last] })), src: INS },
      { id: "leads", l: "Centre leads", cols: ["Centre lead", "Centre", "Status", "Detail", "Last active"], rows: srt(LEAD).map(x => ({ id: "l" + x.name + x.centre, cells: [["p", x.name, also(x)], x.centre, pst(x), x.detail, x.last] })), src: LEAD },
      { id: "admins", l: "Admins", cols: ["Staff", "Access level", "Covers", "Status", "Detail", "Last active"], rows: srt(ADM).map(x => ({ id: "a" + x.name, cells: [["p", x.name, also(x)], x.access, x.centre, pst(x), x.detail, x.last] })), src: ADM, note: "Only a super admin can change access levels, resend invites or remove someone. That is in the Control Room." },
    ] };
    const CEN = { act: "Open", cols: ["Centre", "Status", "Active members", "Attendance", "Centre lead", "No mentor", "Gate desk"], rows: out.centreRows.map((c, i) => ({ id: c.name, cells: [["p", c.name, c.meets], ["s", c.st, (CS[(SCs[i] || {}).id] || {}).tone || "ok"], ["n", c.members], ["n", c.pct + " · " + c.present], c.lead, ["n", c.unpaired], c.desk] })) };
    const gsrc = CP3_G[sec] && sec !== "tournaments" ? S.gData[sec === "desks" ? "desks" : sec] : null;
    const gdef = sec === "team" ? TEAM : sec === "centres" ? CEN : sec === "tournaments" ? null : CP3_G[sec] ? Object.assign({}, CP3_G[sec], { rows: (gsrc || {}).rows || [], note: (gsrc || {}).note || "" }) : null;
    // The centres' Wi-Fi (cp3-wifi.jsx), for those holding `network`.
    if (String(sec).indexOf("wifi") === 0 && B.me.canNetwork && !(sec === "wifi-regions" && !B.me.canWifiRegions) && typeof Cp3Wifi === "function") out.mainSlotEnd = <Cp3Wifi view={sec} me={B.me} phone={isPhone} go={s => this.go(s)}/>;
    out.isGen = !!gdef; out.isMore = sec === "more"; out.phoneBack = isPhone && !isTab; out.goMore = () => this.go("more");
    const gLoading = !!CP3_G[sec] && sec !== "tournaments" && !gsrc && !S.gErr[sec];
    if (gdef) {
      const tabs = gdef.tabs || null; const tab = tabs ? (tabs.find(t => t.id === S.gtab) || tabs[0]) : gdef;
      const gq = (S.gq || "").trim().toLowerCase(); const txt = c => Array.isArray(c) ? c.slice(1).join(" ") : String(c);
      const cell = c => { if (Array.isArray(c)) { if (c[0] === "p") return { isP: true, a: c[1], b: c[2] || "" }; if (c[0] === "s") { const t = tone(c[2]); return { isS: true, a: c[1], tn: c[2], bg: t[0], fg: t[1], dot: t[2] }; } if (c[0] === "n") return { isN: true, a: c[1] }; } return { isT: true, a: String(c) }; };
      const CNames = centresAll.map(c => c.name); const rowCen = r => r.cells.filter(c => typeof c === "string" && CNames.some(n => c.indexOf(n) >= 0));
      const rowsI = tab.rows.filter(x => scope === "all" || !rowCen(x).length || rowCen(x).some(c => c.indexOf(scope) >= 0)).filter(x => !gq || x.cells.map(txt).join(" ").toLowerCase().includes(gq));
      const DEC = CP3_DECIDE[sec]; const act = DEC ? (tab.act || gdef.act || "Open") : (tab.act || gdef.act);
      out.gHasTabs = !!tabs;
      out.gTabs = tabs ? tabs.map(t => { const on = t === tab; const w = (t.src || []).find(x => x.tone === "bad") ? "#d94141" : (t.src || []).find(x => x.tone === "warn") ? "#e0a100" : ""; return { l: t.l, n: String(t.rows.length), on, hasDot: !!w, dot: w, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => this.setState({ gtab: t.id, gq: "" }) }; }) : [];
      out.gCols = tab.cols;
      const gP = this.pager("g:" + sec + ":" + (tab.id || ""), rowsI.length, gq, isPhone); out.gPg = gP;
      out.gRows = rowsI.slice(gP.start, gP.end).map(row => { const openD = () => this.setState({ gDetail: { sec, id: row.id }, fillWho: "" }); const cells = row.cells.map(cell); const p = cells.find(c => c.isP); const s2 = cells.find(c => c.isS);
        const rest = cells.filter(c => (c.isT || c.isN) && c.a && c.a !== "—").map(c => c.a).slice(0, 2).join(" · "); const nm = p ? p.a : "";
        const onAct = DEC ? openD : sec === "centres" ? () => { this.setState({ scope: row.id }); this.toast("Showing " + row.id + " only"); } : () => {};
        return { cells, hasAct: !!act && (!!DEC || sec === "centres"), act, onAct, onClick: onAct, pA: nm || (cells[0] || {}).a, sub: rest, hasSt: !!s2, st: s2 ? s2.a : "", sbg: s2 ? s2.bg : "", sfg: s2 ? s2.fg : "" }; });
      const cntS = {}; tab.rows.forEach(r => { const s2 = r.cells.find(c => Array.isArray(c) && c[0] === "s"); if (s2) cntS[s2[2]] = (cntS[s2[2]] || 0) + 1; });
      const ks = ["bad", "warn", "ok", "neutral"].filter(k => cntS[k]); const SL = sec === "team" ? LBL : { bad: "Blocked", warn: "Needs action", ok: "Fine", neutral: "Off" };
      out.gSummary = ks.length > 1 ? ks.map(k => ({ l: SL[k], n: cntS[k], dot: tone(k)[2] })) : [];
      out.gEmpty = !gLoading && rowsI.length === 0; out.gEmptyText = gq ? "Nothing matches that search." : tab.rows.length ? "Nothing at " + scope + " in this list." : (tab.empty || gdef.empty || "Nothing here yet."); out.gq = S.gq || ""; out.onGQ = e => this.setState({ gq: e.target.value });
      const errNote = S.gErr[sec] ? "Couldn’t load this list: " + S.gErr[sec] + "." : gLoading ? "Loading…" : "";
      out.gNote = errNote || tab.note || gdef.note || ""; out.gHasNote = !!out.gNote; out.gCount = rowsI.length === tab.rows.length ? rowsI.length + " shown" : rowsI.length + " of " + tab.rows.length;
    } else { out.gPg = {}; out.gTabs = []; out.gCols = []; out.gRows = []; out.gSummary = []; out.gHasTabs = false; out.gEmpty = false; out.gEmptyText = ""; out.gHasNote = false; }
    out.moreGroups = NAVG.map(g => ({ h: g[0] || "Overview", items: g[1].filter(n => !CP3_TABS.some(t => t[0] === n[0])).map((n, i) => { const b = badge[n[0]]; const ok = !!n[3];
      return { l: n[1], icon: "ph ph-" + n[2], ok, off: !ok, ariaOff: ok ? undefined : "true", fg: ok ? "#0b0b0c" : "#8a8a90", bt: i ? "1px solid #f1f1ef" : "0", hasBadge: !!(ok && b && b[0]), badge: b ? cap99(b[0]) : 0, bb: b ? b[1] : "", bf: b ? b[2] : "",
        onClick: () => ok ? this.go(n[0]) : this.toast("Open the portal on a computer to use " + n[1].toLowerCase() + ".") }; }) })).filter(g => g.items.length);
    out.moreHasOff = out.moreGroups.some(g => g.items.some(n => n.off));

    /* ── access ── */
    const AC = B.access; out.accessOpen = !!S.accessOpen; out.openAccess = () => this.setState({ accessOpen: true, exportOpen: false }); out.closeAccess = () => this.setState({ accessOpen: false });
    out.accRole = B.me.roleLabel + (lockC ? " · " + lockC : ""); out.accCaps = AC.caps + (lockC ? " · one centre" : "");
    const can = AC.can.slice(); can.splice(3, 0, ["Announcements", isAdm ? "Write, approve and send to members and guardians" : "Draft and submit. An admin approves before anything is sent"]);
    out.accCan = can.map(x => ({ h: x[0], s: lockC ? x[1] + ", for " + lockC + " only" : x[1] }));
    out.accCannot = AC.cannot.map(x => ({ h: x[0], s: "Ask " + x[1] }));
    out.meName = B.me.name; out.meRole = B.me.roleLabel; out.meIni = String(B.me.name || "?").trim().split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase();
    out.accAlign = isPhone ? "flex-end" : "center"; out.accPad = isPhone ? "0" : "16px"; out.accRadius = isPhone ? "24px 24px 0 0" : "18px";

    /* ── permissions ── */
    out.isPerm = sec === "permissions";
    {
      const CL = B.clauses; const cons = S.cons || { rows: [], totals: { members: 0, complete: 0, missingRequired: 0, namedOk: 0, tripsOk: 0 } };
      const mark = rec => !rec ? { sym: "–", l: "Not recorded", bg: "#f4f4f3", fg: "#6b6b72" } : rec.v === "g" ? { sym: "✓", l: "Granted", bg: "#e8f5ec", fg: "#17663a" } : { sym: "✕", l: "Declined", bg: "#fdeaea", fg: "#a12a2a" };
      const derive = c => { const g = k => c[k] && c[k].v === "g"; const miss = this.reqMissing(c); const o2 = [];
        if (!c.guardian) o2.push({ t: "No guardian on file. Nobody can give permission yet.", tone: "bad" });
        else if (miss.length) o2.push({ t: "Can’t take part yet: " + miss.map(k => k.short.toLowerCase()).join(", ") + " not agreed.", tone: "bad" });
        if (g("media") && g("site_visibility")) o2.push({ t: "Can be named and pictured publicly.", tone: "ok" });
        else if (g("site_visibility")) o2.push({ t: "Name can appear publicly, but no photo. Photos not agreed.", tone: "warn" });
        else if (g("media")) o2.push({ t: "Can be photographed, but never published. Shown publicly by handle only.", tone: "warn" });
        else o2.push({ t: "Not photographed or named publicly. Shown by handle only.", tone: "neutral" });
        if (!g("trips")) o2.push({ t: "Can’t go on trips or away tournaments.", tone: "warn" });
        return o2; };
      const F2 = S.permFilter; const pq = (S.permQ || "").trim().toLowerCase();
      const filt = { all: () => true, missing: c => !c.guardian || this.reqMissing(c).length > 0, nophoto: c => !(c.media && c.media.v === "g" && c.site_visibility && c.site_visibility.v === "g"), notrips: c => !(c.trips && c.trips.v === "g"), unrecorded: c => CL.some(k => !c[k.k]) };
      const list = cons.rows.filter(r => inScope(r.centre)).filter(r => filt[F2](this.consentOf(r))).filter(r => !pq || (r.name + " " + r.id + " " + r.displayId).toLowerCase().includes(pq));
      const ord2 = r => { const c = this.consentOf(r); return (!c.guardian || this.reqMissing(c).length) ? 0 : CL.some(k => !c[k.k]) ? 1 : 2; };
      list.sort((x, y) => ord2(x) - ord2(y) || x.name.localeCompare(y.name));
      const T2 = cons.totals; const pc = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
      out.permKpis = [
        { l: "Missing required", v: String(T2.missingRequired), s: "can’t be in class until fixed", tone: "bad", f: "missing" },
        { l: "Public photo OK", v: pc(T2.namedOk, T2.members), s: fmt(T2.namedOk) + " of " + fmt(T2.members) + " · photos and naming both agreed", tone: "neutral", f: "nophoto", fl: "Show the rest" },
        { l: "Trip-ready", v: pc(T2.tripsOk, T2.members), s: fmt(T2.tripsOk) + " of " + fmt(T2.members), tone: "neutral", f: "notrips", fl: "Show the rest" },
        { l: "Fully recorded", v: pc(T2.complete, T2.members), s: "every permission answered either way", tone: "neutral", f: "unrecorded", fl: "Show gaps" },
      ].map(k => Object.assign({}, k, { vColor: k.tone === "bad" ? "#a12a2a" : "#0b0b0c", on: F2 === k.f, border: F2 === k.f ? "2px solid #0b0b0c" : "1px solid #ececea", onClick: () => this.setState({ permFilter: F2 === k.f ? "all" : k.f, permSel: null }) }));
      out.permFilters = [["all", "Everyone"], ["missing", "Missing required"], ["nophoto", "Not public"], ["notrips", "No trips"], ["unrecorded", "Gaps"]].map(o => { const on = F2 === o[0]; return { l: o[1], on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => this.setState({ permFilter: o[0], permSel: null }) }; });
      out.permQ = S.permQ; out.onPermQ = e => this.setState({ permQ: e.target.value });
      out.permCols = CL.map(k => ({ l: k.short, title: k.n + ". " + k.title + (k.req ? " · required" : ""), req: !!k.req }));
      const prP = this.pager("perm", list.length, [F2, pq].join("|"), isPhone); out.permPg = prP;
      out.permRows = list.slice(prP.start, prP.end).map(r => { const c = this.consentOf(r); const dv = derive(c); const top = dv[0]; const tt = tone(top.tone); const on = S.permSel === r.id;
        return { name: r.name, id: r.displayId, centre: r.centre, guardian: c.guardian || "No guardian on file", gColor: c.guardian ? "#6b6b72" : "#a12a2a", cells: CL.map(k => { const mk2 = mark(c[k.k]); return Object.assign({}, mk2, { aria: k.title + ": " + mk2.l }); }),
          sum: top.t, sumColor: tt[1], sumDot: tt[2], bg: on ? "#f4f4f3" : "#fff", onClick: () => this.setState({ permSel: on ? null : r.id }), mGranted: CL.filter(k => c[k.k] && c[k.k].v === "g").length }; });
      out.permEmpty = !!S.cons && list.length === 0; out.permCount = S.consErr ? "Couldn’t load permissions: " + S.consErr : !S.cons ? "Loading…" : "";
      const selR = cons.rows.find(r => r.id === S.permSel);
      out.hasPermSel = !!selR;
      if (selR) {
        const c = this.consentOf(selR);
        const setC = (k, v) => {
          const prevOver = S.permOver; const cur = Object.assign({}, prevOver[selR.id] || {}); cur[k] = { v, method: S.permMethod, by: B.me.name, at: new Date().toISOString().slice(0, 10) };
          this.setState({ permOver: Object.assign({}, prevOver, { [selR.id]: cur }) });
          const label = CL.find(x => x.k === k).short;
          this.toast((v === "g" ? "Recorded: granted" : "Recorded: declined") + " · " + label, () => this.setState({ permOver: prevOver }),
            () => this.api("consent.set", { memberId: selR.id, type: k, v, method: S.permMethod }).then(() => this.loadDash()).catch(e => { this.setState({ permOver: prevOver }); this.fail(e, "Couldn’t record that."); }));
        };
        out.ps = { name: selR.name, id: selR.displayId, centre: selR.centre, guardian: c.guardian || "No guardian on file", noGuardian: !c.guardian,
          derived: derive(c).map(x => { const t = tone(x.tone); return { t: x.t, bg: t[0], fg: t[1], icon: x.tone === "ok" ? "ph ph-check-circle" : x.tone === "bad" ? "ph ph-prohibit" : x.tone === "warn" ? "ph ph-warning-circle" : "ph ph-eye-slash" }; }),
          clauses: CL.map(k => { const rec = c[k.k]; const mk2 = mark(rec); const g = rec && rec.v === "g", dd = rec && rec.v === "d";
            return { n: k.n, title: k.title, means: k.means, tag: k.req ? "Required" : k.must ? "Must be answered" : "Optional", tagColor: k.req ? "#a12a2a" : "#6b6b72", st: mk2.l, stBg: mk2.bg, stFg: mk2.fg,
              meta: rec ? (rec.method || "Recorded") + " · " + (rec.by === "Guardian" || !rec.by ? "by the guardian" : "recorded by " + rec.by) + " · " + rec.at : "Nobody has answered this yet",
              gBg: g ? "#0b0b0c" : "#fff", gFg: g ? "#fff" : "#0b0b0c", dBg: dd ? "#0b0b0c" : "#fff", dFg: dd ? "#fff" : "#0b0b0c", gPressed: g ? "true" : "false", dPressed: dd ? "true" : "false", onG: () => setC(k.k, "g"), onD: () => setC(k.k, "d") }; }) };
        out.permMethods = B.methods; out.permMethod = S.permMethod; out.onPermMethod = e => this.setState({ permMethod: e.target.value });
        out.closePerm = () => this.setState({ permSel: null });
        out.sendLink = () => this.api("consent.link", { memberId: selR.id }).then(r => this.toast("Consent link sent to " + r.to)).catch(e => this.fail(e));
      } else { out.ps = { derived: [], clauses: [] }; out.permMethods = []; }
      out.permPanelW = isPhone ? "100%" : "min(520px, calc(100% - 24px))";
      out.exportPerm = () => { const q3 = v => '"' + String(v || "").replace(/"/g, '""') + '"';
        this.download("club-permissions.csv", [["Member ID", "Name", "Centre", "Guardian"].concat(CL.map(k => k.short)).map(q3).join(",")].concat(list.map(r => { const c = this.consentOf(r); return [r.displayId, r.name, r.centre, c.guardian].concat(CL.map(k => c[k.k] ? (c[k.k].v === "g" ? "Granted" : "Declined") : "Not recorded")).map(q3).join(","); })).join("\n"), "text/csv"); };
    }

    /* ── the person picker inside forms ── */
    out.pickFor = (fid, filt) => {
      const qq = ((S.pq || {})[fid] || "").trim(); const res0 = (S.pres[fid] && S.pres[fid].q === qq) ? S.pres[fid].rows : [];
      let res;
      if (!qq) {
        const sugg = filt === "unpaired" ? (S.unpaired || []).filter(r => inScope(r.centre)).slice(0, 6).map(r => [r, "Needs a mentor"]) : [];
        res = S.recent.map(r => [r, "Recent"]).concat(sugg.filter(x => !S.recent.some(y => y.id === x[0].id)));
      } else res = res0.filter(r => r.status === "active").map(r => [r, ""]);
      const names = {}; res.forEach(([r]) => names[r.name] = (names[r.name] || 0) + 1);
      return { q: (S.pq || {})[fid] || "", empty: qq.length >= 2 && S.pres[fid] && S.pres[fid].q === qq && res.length === 0, emptyMsg: S.pres[fid] && S.pres[fid].failed ? "Couldn’t search just now. Change the search to try again." : "No active member matches “" + qq + "”" + (scope !== "all" ? " at " + scope : "") + ".",
        hasHead: !qq && res.length > 0, head: S.recent.length ? "Recent and suggested" : "Suggested",
        res: res.map(([r, tag]) => { const t = CP3_TONE.neutral; return { name: r.name, id: r.displayId || r.id, meta: (r.centre || "") + " · " + (r.course || ""), dup: names[r.name] > 1, dupL: names[r.name] + " with this name, check the ID", tag, hasTag: !!tag, cx: r.course || "", cbg: t[0], cfg: t[1], v: r.name + "|" + r.id, rid: r.id, raw: r }; }),
        onQ: e => this.searchPeople(fid, e.target.value) };
    };
    out.pickRecent = r => this.setState(s => ({ recent: [r].concat(s.recent.filter(x => x.id !== r.id)).slice(0, 3) }));

    /* ── generic detail drawer and forms ── */
    {
      const PA = CP3_PAGE_ACTS[sec];
      const paOk = PA && !(PA[1] === "curriculum" && !B.me.canCurriculum) && !((PA[1] === "rota" || PA[1] === "desks") && !B.me.canCheckin) && !(PA[1] === "conduct" && lockC);
      out.hasPageAct = !!paOk && !isPhone; out.pageActL = PA ? PA[0] : ""; out.pageActClick = () => paOk && this.openGForm(PA[1]);
      out.phonePageAct = !!paOk && isPhone && sec !== "roster";
      const gd = S.gDetail; const srcSec = gd ? gd.sec : sec; const rowsOf = k => ((S.gData[k] || {}).rows || []);
      out.hasGDetail = !!(gd && gd.sec === sec && CP3_DECIDE[sec]);
      if (out.hasGDetail) {
        const row = rowsOf(srcSec).find(r => r.id === gd.id); const cols = CP3_G[sec].cols; const DEC = CP3_DECIDE[sec];
        const meta = Object.assign({}, row || {}, { canDecide: (S.gData[sec] || {}).canDecide });
        if (!row) { out.hasGDetail = false; } else {
          const r = row.cells; const p = r.find(c => Array.isArray(c) && c[0] === "p");
          out.gdTitle = p ? p[1] : String(r[0]); out.gdSub = p ? p[2] : "";
          out.gdFields = cols.map((c, j) => { const v = r[j]; const isS = Array.isArray(v) && v[0] === "s"; const t = isS ? tone(v[2]) : null; return { l: c, v: Array.isArray(v) ? (v[0] === "p" ? v[1] + (v[2] ? " · " + v[2] : "") : v[1]) : String(v), isS, isT: !isS, bg: t ? t[0] : "", fg: t ? t[1] : "" }; }).filter((x, j) => j > 0 || !p);
          const acts = DEC.acts.filter(x => !x.show || x.show(r, meta));
          out.gdActs = acts.map(x => { const why = (x.block ? x.block(r, meta) : "") || (S.busy ? "Working…" : ""); return { l: x.l, why, hasWhy: !!why && why !== "Working…", bg: x.k === "primary" ? (why ? "#a3a3a8" : "#0b0b0c") : "#fff", fg: x.k === "primary" ? "#fff" : x.k === "danger" ? "#a12a2a" : "#0b0b0c", border: x.k === "primary" ? "0" : "1px solid #e2e2df", dis: why ? "true" : undefined,
            onClick: () => { if (why) return;
              if (x.k === "danger" && ["remove", "decline", "reject", "unlink"].indexOf(x.act) !== -1) { this.setState({ confirm: { title: x.l + " · " + out.gdTitle + "?", body: "This can’t be undone from here.", cta: x.l, danger: true, onOk: () => { this.setState({ confirm: null }); this.decide(sec, row, x); } } }); return; }
              this.decide(sec, row, x); } }; });
          out.gdFill = !!DEC.fill; const pool = ((S.gData.rota || {}).pool) || [];
          out.fillOpts = DEC.fill ? [{ v: "", l: pool.length ? "Choose someone" : "Nobody yet: approve a volunteer in Volunteers first" }].concat(pool.map(o => ({ v: o.v, l: o.l }))) : [];
          out.fillWho = S.fillWho; out.onFillWho = e => this.setState({ fillWho: e.target.value });
          const who = pool.find(o => o.v === S.fillWho);
          out.doFill = () => { if (!S.fillWho || (who && who.bad)) return; this.decide(sec, row, { act: "fill", do: ["Confirmed", "ok"], toast: (who ? who.l : "They") + " is on duty" }); };
          out.fillWarn = who && who.bad ? who.l.replace(" · not cleared", "") + " isn’t cleared to work with children yet. Choose someone who is." : ""; out.hasFillWarn = !!out.fillWarn;
        }
      }
      out.closeGDetail = () => this.setState({ gDetail: null });
      const gf = S.gForm; out.hasGForm = !!gf;
      if (gf) {
        const FM = cp3Forms(this.formCtx())[gf.key]; const v = gf.vals; const chk = FM.check ? FM.check(v) : { e: {}, warn: [] };
        const errs = {}; FM.fields.forEach(x => { const val = v[x.id]; const empty = val == null || val === "" || (Array.isArray(val) && !val.length); if (x.req && empty) errs[x.id] = "Required"; }); Object.assign(errs, chk.e || {});
        const setV = (id, val) => this.setState(s => ({ gForm: Object.assign({}, s.gForm, { vals: Object.assign({}, s.gForm.vals, { [id]: val }) }) }));
        out.gf = { title: FM.title, submit: S.busy ? "Saving…" : FM.submit, note: FM.note || "", hasNote: !!FM.note, warn: chk.warn || [], hasWarn: (chk.warn || []).length > 0,
          fields: FM.fields.map(x => { const opts = typeof x.opts === "function" ? x.opts() : (x.opts || []); const O = opts.map(o => typeof o === "string" ? { v: o, l: o } : o); const val = v[x.id];
            const err = (gf.tried || (chk.e && chk.e[x.id] && val)) ? errs[x.id] : ""; const multi = Array.isArray(val) ? val : [];
            const pk = x.t === "person" && !val ? (() => { const pp = out.pickFor(gf.key + ":" + x.id, x.filt); return Object.assign(pp, { res: pp.res.map(r => Object.assign(r, { onPick: () => { setV(x.id, r.v); out.pickRecent(r.raw); } })),
              onKey: e => { if (e.key === "Enter" && pp.res[0]) { e.preventDefault(); setV(x.id, pp.res[0].v); out.pickRecent(pp.res[0].raw); } } }); })() : { res: [] };
            const pickR = x.t === "person" && val ? String(val).split("|") : null;
            return { l: x.l, req: !!x.req, ph: x.ph || "", type: x.t === "number" ? "number" : x.t === "date" ? "date" : x.t === "time" ? "time" : "text", isInput: ["text", "number", "date", "time"].includes(x.t), isPerson: x.t === "person",
              hasPick: !!pickR, noPick: x.t === "person" && !val, pickName: pickR ? pickR[0] : "", pickMeta: pickR ? (S.recent.find(r => r.id === pickR[1]) || {}).displayId || pickR[1] : "", clearPick: () => setV(x.id, ""), pk,
              isSelect: x.t === "select", isSeg: x.t === "seg", isChips: x.t === "chips", isToggle: x.t === "toggle", v: val == null ? "" : val, onChange: e => setV(x.id, e.target.value),
              border: err ? "#d94141" : "#d6d6d3", inv: err ? "true" : "false", err, hasErr: !!err,
              opts: O.map(o => { const on = x.t === "chips" ? multi.includes(o.v) : val === o.v; return { v: o.v, l: o.l, dis: o.dis ? true : undefined, on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => setV(x.id, x.t === "chips" ? (on ? multi.filter(m => m !== o.v) : multi.concat([o.v])) : o.v) }; }),
              tOn: !!val, track: val ? "#0b0b0c" : "#d6d6d3", knob: val ? "18px" : "2px", onToggle: () => setV(x.id, !val) }; }),
          onSubmit: () => { if (S.busy) return; if (Object.keys(errs).length) return this.setState(s => ({ gForm: Object.assign({}, s.gForm, { tried: true }) })); this.submitGForm(gf.key, v); },
          errCount: Object.keys(errs).length, showErrSum: gf.tried && Object.keys(errs).length > 0, errSum: Object.keys(errs).length === 1 ? "Fix 1 thing to continue" : "Fix " + Object.keys(errs).length + " things to continue" };
      } else out.gf = { fields: [], warn: [] };
      out.closeGForm = () => {
        const g2 = S.gForm; const touched = g2 && Object.keys(g2.vals).some(k => { const x = g2.vals[k]; return x !== "" && x != null && !(Array.isArray(x) && !x.length) && x !== true; });
        if (touched) this.setState({ confirm: { title: "Discard this form?", body: "What you entered will be lost.", cta: "Discard", danger: true, cancelL: "Keep editing", onOk: () => this.setState({ confirm: null, gForm: null }) } });
        else this.setState({ gForm: null });
      };
    }

    /* ── tournaments ── */
    {
      const TR = CP3_TRN; const list = S.trnList || []; out.isTrn = sec === "tournaments";
      const stOf = t => t.status === "open" || t.status === "draft" ? ["Entries open", "ok"] : t.status === "running" ? ["Round " + (t.round || 1) + (t.totalRounds ? " of " + t.totalRounds : ""), "warn"] : t.status === "cancelled" ? ["Cancelled", "neutral"] : ["Finished", "neutral"];
      out.trnIsList = out.isTrn && !S.trnView; out.trnIsNew = out.isTrn && S.trnView === "new"; out.trnIsDetail = out.isTrn && !!S.trnView && S.trnView !== "new";
      out.trnRows = list.map(t => { const c = stOf(t); const tn = tone(c[1]); return { name: t.name, sub: (t.formatName || t.format) + " · " + (t.timeControl || "") + (t.variant && t.variant !== "standard" ? " · " + (t.variantName || t.variant) : ""),
        when: t.startsAt ? new Date(t.startsAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "When you draw", centre: t.programme === "summer" ? "Summer School" : "NGG Club",
        entrants: String(t.entrants || 0), st: c[0], sbg: tn[0], sfg: tn[1], sdot: tn[2], onClick: () => { this.setState({ trnView: t.tournamentId, trnQ: "", trnDetail: null }); this.loadTrnDetail(t.tournamentId); } }; });
      out.trnNew = () => this.setState({ trnView: "new", trnStep: 0, trnTried: false, trnDraft: { format: "swiss", tc: "10+0", variant: "standard", rated: true, rounds: 0, kinds: ["member", "student", "volunteer", "staff"], centres: [], minR: 0, maxR: 0, programme: "ngg", when: "open", startsAt: "", dur: 24, name: "", desc: "" } });
      out.trnBack = () => this.setState({ trnView: null, trnDetail: null });
      out.trnEmpty = out.trnIsList && list.length === 0; out.trnEmptyText = S.trnErr ? "Couldn’t load tournaments: " + S.trnErr + " Open Tournaments again to retry." : !S.trnList ? "Loading tournaments…" : "No tournaments yet. Start one with Host a tournament.";
      if (out.trnIsNew) {
        const dr = S.trnDraft; const set = p => this.setState(s => ({ trnDraft: Object.assign({}, s.trnDraft, p) })); const step = S.trnStep; const fm = TR.formats.find(x => x.id === dr.format) || TR.formats[0]; const vr = TR.variants.find(x => x.id === dr.variant);
        const tcName = id => (TR.tcs.find(x => x.id === id) || {}).name || id;
        const errs = [[], [], [], []];
        if (dr.format === "arena" && dr.tc === "1day") errs[0].push("An arena needs a running clock. The window would close before a daily game finished.");
        if (!dr.kinds.length) errs[1].push("Pick at least one group, or nobody can enter.");
        if (dr.format === "centrecup" && dr.centres.length < 2) errs[1].push("A centre cup needs at least two centres.");
        if (dr.minR && dr.maxR && +dr.minR > +dr.maxR) errs[1].push("The lowest rating is above the highest.");
        if (dr.when === "scheduled" && !dr.startsAt) errs[2].push("Pick a start time, or choose “Open until I draw”.");
        if (dr.name.trim().length < 3) errs[3].push("Give it a name players will recognise.");
        const labels = ["Format", "Who can enter", "When", "Name & check"];
        out.tw = { step: step + 1, label: labels[step], s0: step === 0, s1: step === 1, s2: step === 2, s3: step === 3, isLast: step === 3, notFirst: step > 0,
          steps: labels.map((l, i) => ({ l, n: i + 1, bg: i <= step ? "#0b0b0c" : "#ececea", fg: i <= step ? "#0b0b0c" : "#8a8a90", fw: i === step ? 600 : 500, cur: i === step ? "step" : undefined, onClick: () => i < step && this.setState({ trnStep: i }) })),
          errs: S.trnTried ? errs[step] : [], hasErr: S.trnTried && errs[step].length > 0,
          formats: TR.formats.map(x => { const on = dr.format === x.id; return { l: x.name, s: x.sub, best: "Best for " + x.best, on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", bg: on ? "#fafaf9" : "#fff", onClick: () => set({ format: x.id, tc: x.id === "arena" && dr.tc === "1day" ? "5+3" : dr.tc }) }; }),
          tcs: TR.tcs.map(x => { const on = dr.tc === x.id; const off = dr.format === "arena" && x.id === "1day"; return { l: x.name, s: x.sub, on, dis: off ? "true" : undefined, fg: off ? "#a3a3a8" : "#0b0b0c", border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => !off && set({ tc: x.id }) }; }),
          tcNote: dr.tc === "1day" ? "Daily games use almost no data. A move is smaller than a text message." : "",
          variants: TR.variants.map(x => { const on = dr.variant === x.id; return { l: x.name, s: x.short, on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => set({ variant: x.id, rated: x.rated ? dr.rated : false }) }; }),
          vRule: vr.rule, ratedLocked: !vr.rated, rated: dr.rated && vr.rated, ratedTrack: dr.rated && vr.rated ? "#0b0b0c" : "#d6d6d3", ratedKnob: dr.rated && vr.rated ? "18px" : "2px", ratedNote: vr.rated ? (dr.rated ? "Results move each player’s rating." : "A friendly. Ratings stay put.") : vr.name + " is never rated.", onRated: () => vr.rated && set({ rated: !dr.rated }),
          kinds: TR.kinds.map(x => { const on = dr.kinds.includes(x.id); return { l: x.label, on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => set({ kinds: on ? dr.kinds.filter(k => k !== x.id) : dr.kinds.concat([x.id]) }) }; }),
          progs: [["", "Everyone"], ["ngg", "NGG Club"], ["summer", "Summer School"]].map(x => { const on = dr.programme === x[0]; return { l: x[1], on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", onClick: () => set({ programme: x[0] }) }; }),
          showCentres: dr.format === "centrecup", centres: centresAll.map(c => { const on = dr.centres.includes(c.name); return { l: c.name, on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => set({ centres: on ? dr.centres.filter(k => k !== c.name) : dr.centres.concat([c.name]) }) }; }),
          showRounds: dr.format === "swiss", rounds: String(dr.rounds), onRounds: e => set({ rounds: Math.max(0, Math.min(15, +e.target.value || 0)) }),
          minR: String(dr.minR), maxR: String(dr.maxR), onMinR: e => set({ minR: Math.max(0, +e.target.value || 0) }), onMaxR: e => set({ maxR: Math.max(0, +e.target.value || 0) }),
          whens: [["open", "Open until I draw"], ["scheduled", "Set a start and a length"]].map(x => { const on = dr.when === x[0]; return { l: x[1], on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", onClick: () => set({ when: x[0] }) }; }),
          isSched: dr.when === "scheduled", whenNote: dr.when === "open" ? "Entries stay open until you draw the first round. Right for a club night where you don’t know yet who is coming." : "Entries close the moment it starts, so nobody joins a round that has already been paired.",
          startsAt: dr.startsAt, onStarts: e => set({ startsAt: e.target.value }),
          durs: TR.durations.map(x => { const on = dr.dur === x.id; return { l: x.label, s: x.sub, on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => set({ dur: x.id }) }; }),
          endsLine: dr.startsAt ? "Ends " + new Date(new Date(dr.startsAt).getTime() + dr.dur * 36e5).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ". Games in progress still finish." : "",
          name: dr.name, desc: dr.desc, onName: e => set({ name: e.target.value }), onDesc: e => set({ desc: e.target.value }),
          summary: [["Format", fm.name + " · " + fm.sub], ["Clock", tcName(dr.tc) + " · " + (TR.tcs.find(x => x.id === dr.tc) || {}).sub], ["Game", vr.name + (dr.rated && vr.rated ? " · rated" : " · not rated")],
            ["Open to", (dr.kinds.length === TR.kinds.length ? "Everyone" : dr.kinds.map(k => (TR.kinds.find(x => x.id === k) || {}).label).join(", ")) + (dr.programme ? " in " + (dr.programme === "ngg" ? "NGG Club" : "Summer School") : "") + (dr.minR || dr.maxR ? " · rated " + (dr.minR || 0) + "–" + (dr.maxR || "∞") : "")]]
            .concat(dr.format === "centrecup" ? [["Centres", dr.centres.join(", ") || "—"]] : [])
            .concat([["When", dr.when === "open" ? "Entries open now. You draw round one when everyone is there." : (dr.startsAt ? new Date(dr.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " · " + (TR.durations.find(x => x.id === dr.dur) || {}).sub : "—")]]).map(x => ({ l: x[0], v: x[1] })),
          next: () => { if (errs[step].length) return this.setState({ trnTried: true }); if (step < 3) return this.setState({ trnStep: step + 1, trnTried: false });
            if (S.busy) return; this.setState({ busy: true });
            const startsAt = dr.when === "scheduled" && dr.startsAt ? new Date(dr.startsAt).toISOString() : "";
            NGGApi.admin.tournaments.create({ name: dr.name.trim(), description: dr.desc, programme: dr.programme, format: fm.server || fm.id, timeControl: dr.tc, variant: dr.variant, rated: !!(dr.rated && vr.rated),
              kinds: dr.kinds, centres: dr.centres, totalRounds: dr.rounds || 0, minRating: dr.minR || 0, maxRating: dr.maxR || 0, startsAt, endsAt: startsAt ? new Date(new Date(startsAt).getTime() + dr.dur * 36e5).toISOString() : "" })
              .then(r => { this.setState({ busy: false, trnDraft: null, trnView: r.tournamentId }); this.toast("Created. Players can enter from the chess screen now."); this.loadTrn(); this.loadTrnDetail(r.tournamentId); })
              .catch(e => { this.setState({ busy: false }); this.fail(e, "Couldn’t create it."); }); },
          back: () => this.setState({ trnStep: Math.max(0, step - 1), trnTried: false }), nextL: step === 3 ? (S.busy ? "Creating…" : "Create and open entries") : "Next" };
      } else out.tw = { steps: [], errs: [], formats: [], tcs: [], variants: [], kinds: [], progs: [], centres: [], whens: [], durs: [], summary: [] };
      if (out.trnIsDetail) {
        const t = list.find(x => x.tournamentId === S.trnView) || ((S.trnDetail || {}).tournament) || { name: "Loading…", status: "open" };
        const det = S.trnDetail || { rounds: [], standings: [] }; const c = stOf(t); const tn = tone(c[1]);
        const cur = (det.rounds[0] || { boards: [] }).boards; const left = cur.filter(g => !g.isBye && !g.result).length;
        const fm = TR.formats.find(x => x.id === t.format || x.server === t.format) || TR.formats[0];
        out.td = { name: t.name, sub: (t.formatName || fm.name) + " · " + (t.timeControl || "") + (t.window && t.window.startsAt ? " · starts " + new Date(t.window.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""), st: c[0], sbg: tn[0], sfg: tn[1], desc: t.description || fm.sub,
          isOpen: t.status === "open" || t.status === "draft", isRunning: t.status === "running", isDone: t.status === "complete",
          kpis: [["Entrants", String(t.entrants || det.standings.length || 0)], ["Rounds", (det.rounds.length || 0) + (t.totalRounds ? " of " + t.totalRounds : "")], ["Games still to play", String(left)]].map(x => ({ l: x[0], v: x[1] })) };
        const tq = (S.trnQ || "").trim();
        out.td.cands = S.trnCands.map(r => ({ name: r.name, sub: r.displayId + " · " + r.centre, onAdd: () => NGGApi.admin.tournaments.enter(t.tournamentId, r.id).then(() => { this.setState({ trnQ: "", trnCands: [] }); this.toast(r.name + " entered"); this.loadTrn(); this.loadTrnDetail(t.tournamentId); }).catch(e => this.fail(e)) }));
        out.td.hasCands = out.td.cands.length > 0; out.td.noCands = tq.length >= 2 && !out.td.hasCands; out.trnQ = S.trnQ;
        out.onTrnQ = e => { const v2 = e.target.value; this.setState({ trnQ: v2 }); clearTimeout(this.palT); if (v2.trim().length >= 2) this.palT = setTimeout(() => this.api("search", { q: v2.trim() }).then(r => this.setState({ trnCands: (r.members || []).filter(m => m.status === "active") })).catch(() => {}), 200); else this.setState({ trnCands: [] }); };
        out.td.entrants = det.standings.map((s, i) => ({ seed: String(i + 1), name: s.name || s.playerName || "", sub: s.centre || "", rating: String(s.rating || ""),
          onRemove: () => NGGApi.admin.tournaments.withdraw(t.tournamentId, s.playerId || s.id).then(() => { this.loadTrn(); this.loadTrnDetail(t.tournamentId); }).catch(e => this.fail(e)) }));
        out.td.addTop = () => NGGApi.admin.tournaments.inviteAll(t.tournamentId, false).then(r => { this.toast((r.invited || r.count || 0) + " invited. They enter from the chess screen."); this.loadTrnDetail(t.tournamentId); }).catch(e => this.fail(e));
        const n = +t.entrants || det.standings.length; const tooFew = n < fm.min, tooMany = fm.max && n > fm.max;
        out.td.drawWhy = tooFew ? "A " + fm.name.toLowerCase() + " needs at least " + fm.min + " players. " + (fm.min - n) + " more to go." : tooMany ? "A round robin works for up to " + fm.max + ". That’s " + (n - fm.max) + " too many; try a Swiss." : "This closes entries and pairs " + (n % 2 ? (n - 1) + " players, with a bye for one" : n + " players") + ".";
        out.td.canDraw = !tooFew && !tooMany; out.td.drawBg = out.td.canDraw ? "#0b0b0c" : "#a3a3a8"; out.td.drawDis = out.td.canDraw ? undefined : "true";
        out.td.draw = () => { if (!out.td.canDraw) return; NGGApi.admin.tournaments.draw(t.tournamentId).then(() => { this.toast("Round 1 drawn. Boards are on the chess screen."); this.loadTrn(); this.loadTrnDetail(t.tournamentId); }).catch(e => this.fail(e)); };
        out.td.roundL = (det.rounds[0] || {}).label || "Round " + (t.round || 0);
        out.td.games = cur.map(g => ({ board: String(g.board), w: g.white.name, wr: "", b: g.isBye ? "Bye" : g.black.name, br: g.isBye ? "Scores a point" : "", isBye: g.isBye, hasOpts: false, opts: [],
          res: g.result ? String(g.result).replace("-", "–") : g.isBye ? "Bye" : "Playing", resColor: g.result ? "#0b0b0c" : "#7a5600" }));
        out.td.hasGames = cur.length > 0; out.td.koNote = "Results come from the games on the chess screen; boards update as they finish."; out.td.hasKoNote = t.status === "running";
        out.td.nextWhy = left ? left + " game" + (left > 1 ? "s" : "") + " still to finish." : "Everyone has a result.";
        out.td.canNext = t.status === "running" && !left; out.td.nextBg = out.td.canNext ? "#0b0b0c" : "#a3a3a8";
        out.td.nextL = t.totalRounds && (t.round || 0) >= t.totalRounds ? "Finish and publish results" : "Pair the next round";
        out.td.next = () => { if (!out.td.canNext) return; NGGApi.admin.tournaments.advance(t.tournamentId).then(() => { this.toast("Done. The chess screen has the new boards."); this.loadTrn(); this.loadTrnDetail(t.tournamentId); }).catch(e => this.fail(e)); };
        out.td.standings = det.standings.slice(0, 50).map((s, i) => ({ rank: String(i + 1), name: s.name || s.playerName || "", sub: s.centre || "", score: String(s.score), played: String(s.played || 0), rating: String(s.rating || ""), top: i < 3 && t.status === "complete", medal: ["#c9a227", "#9ea3a8", "#b07a4a"][i] || "transparent" }));
        out.td.hasStand = det.standings.length > 0; out.td.standNote = det.standings.length > 50 ? "Top 50 of " + det.standings.length : "";
      } else out.td = { kpis: [], entrants: [], cands: [], games: [], standings: [] };
    }

    /* ── announcements ── */
    {
      const list = S.ann || []; const me = B.me.name;
      const ST2 = { draft: ["Draft", "neutral"], pending: ["Waiting for approval", "warn"], changes: ["Changes requested", "bad"], scheduled: ["Approved · scheduled", "ok"], sent: ["Sent", "ok"] };
      const vis = list.filter(x => inScope(x.centre === "all" ? "All centres" : x.centre));
      const tabsDef = isAdm ? [["pending", "To approve"], ["changes", "Sent back"], ["scheduled", "Scheduled"], ["sent", "Sent"], ["draft", "Drafts"]] : [["mine", "Drafts & sent back"], ["pending", "Waiting"], ["scheduled", "Scheduled"], ["sent", "Sent"]];
      const inTab = (x, t) => t === "mine" ? (x.status === "draft" || x.status === "changes") : x.status === t;
      const curT = S.annTab || tabsDef[0][0];
      out.isAnn = sec === "announce";
      out.annTabs = tabsDef.map(t => { const on = curT === t[0]; const n = vis.filter(x => inTab(x, t[0])).length; return { l: t[1], n: String(n), on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => this.setState({ annTab: t[0] }) }; });
      const chL = { app: "App", sms: "SMS", email: "Email", telegram: "Telegram", community: "Community" };
      out.annRows = vis.filter(x => inTab(x, curT)).map(x => { const s = ST2[x.status] || ST2.draft; const t = CP3_TONE[s[1]];
        return { title: x.title || "Untitled draft", sub: ({ guardians: "Guardians", members: "Members", both: "Members and guardians" })[x.aud] + " · " + (x.centre === "all" ? "every centre" : x.centre) + " · " + cp3Fmt(x.reach || 0) + " people",
          ch: x.ch.map(c => chL[c]).join(" · "), by: x.by, at: x.sendAt ? "Goes " + x.sendAt : x.at, st: s[0], sbg: t[0], sfg: t[1], sdot: t[2], onClick: () => { this.reachKey = ""; this.setState({ annEdit: Object.assign({}, x, { when: x.sendAtIso ? "later" : "asap", sendAtLocal: x.sendAtIso ? x.sendAtIso.slice(0, 16) : "" }), annNote: "", annReach: null, annShortMsg: "" }); } }; });
      out.annEmpty = !!S.ann && out.annRows.length === 0; out.annEmptyL = S.annErr ? "Couldn’t load announcements: " + S.annErr : curT === "pending" && isAdm ? "Nothing waiting. You’re all caught up." : "Nothing here.";
      out.annNew = () => { this.reachKey = ""; this.setState({ annEdit: { id: null, title: "", body: "", aud: "guardians", centre: lockC || (scope !== "all" ? scope : "all"), ch: (S.annMeta.defaultCh || ["app", "email"]).slice(), smsBody: "", status: "draft", by: me, byId: B.me.id, when: "asap", sendAtLocal: "" }, annNote: "", annReach: null, annShortMsg: "" }); };
      const E = S.annEdit; out.hasAnn = !!E;
      if (E) {
        this.annReach(E);
        const mine = E.byId === B.me.id || !E.id; const editable = (E.status === "draft" || E.status === "changes") && (mine || isAdm); const reviewing = isAdm && E.status === "pending";
        const set = p => this.setState(s => ({ annEdit: Object.assign({}, s.annEdit, p) }));
        const len = (E.body || "").length; const rc = S.annReach && S.annReach.key === E.aud + "|" + E.centre ? S.annReach : null;
        const reach = rc ? rc.reach : (E.reach || 0); const smsN = E.ch.includes("sms") && rc ? Math.max(0, rc.phones - (E.ch.includes("telegram") ? rc.telegram || 0 : 0)) : 0;
        const errs = []; if (!E.title.trim()) errs.push("Add a title."); if (!E.body.trim()) errs.push("Write the message."); if (!E.ch.length) errs.push("Pick at least one channel."); if (E.when === "later" && !E.sendAtLocal) errs.push("Pick when it goes out."); { const c = k => E.ch.includes(k); if (E.ch.length && E.aud === "members" && !(c("app") || c("email") || c("telegram"))) errs.push("Members don’t get SMS. Add App or Email to reach them."); }
        const warn = []; if (E.ch.includes("sms") && E.aud === "members") warn.push("Members don’t get SMS. It only goes to guardians’ phones.");
        if (E.aud !== "members" && E.ch.length === 1 && E.ch[0] === "app" && rc) warn.push("In the app, only guardians with a family account see it (" + cp3Fmt(rc.familyApp || 0) + " here). Add Email to reach the rest.");
        if (E.ch.includes("telegram") && !S.annMeta.tgOn) warn.push("Telegram isn’t set up on this site (Settings → API keys → Telegram), so nothing will go there.");
        if (E.ch.includes("sms") && !S.annMeta.smsOn) warn.push("SMS isn’t set up on this site, so nothing will go by text. Choose App or Email too.");
        const smsMax = S.annMeta.smsChars || 306; const fullSms = "NGG: " + (E.title || "").trim() + ". " + (E.body || "").trim();
        const needsShort = E.ch.includes("sms") && fullSms.length > smsMax; const smsText = needsShort ? (E.smsBody ? "NGG: " + E.smsBody.trim() : "") : fullSms;
        const smsLost = needsShort && E.smsBody ? cp3LostFacts((E.title || "") + " " + (E.body || ""), E.smsBody) : [];
        const smsSeg = Math.max(1, Math.ceil(smsText.length / 160));
        if (E.ch.includes("sms") && !needsShort && smsSeg > 1) warn.push("That’s " + smsSeg + " texts per person. Shorter is cheaper and more likely to be read.");
        if (needsShort && (!E.smsBody || smsLost.length || smsText.length > smsMax)) warn.push("Too long for a text. Without a short version that keeps every fact, SMS is dropped and it goes by email" + (S.annMeta.tgOn ? " and Telegram" : "") + " instead — never cut off.");
        if (E.centre === "all" && !isAdm && !lockC) warn.push("This goes to every centre. Check it applies to all of them.");
        const confirmSend = (label, fn) => this.setState({ confirm: { title: "Send to " + cp3Fmt(reach) + " people?", body: "Goes out now by " + E.ch.map(c => chL[c]).join(", ") + "." + (smsN && S.annMeta.smsOn ? " SMS costs about ₦" + cp3Fmt(smsN * smsSeg * 4) + "." : "") + " Sent messages can’t be recalled.", cta: label, onOk: () => { this.setState({ confirm: null }); fn(); } } });
        const statsLine = r => { if (!r || !r.stats) return ""; const parts = [r.stats.app ? r.stats.app + " in the app" : "", r.stats.family ? r.stats.family + " in family accounts" : "", r.stats.email ? r.stats.email + " by email" : "", r.stats.telegram ? r.stats.telegram + " on Telegram" : "", r.stats.sms ? r.stats.sms + " by SMS" : "", r.stats.community ? "pinned in Community" : ""].filter(Boolean);
          return (parts.length ? "Sent: " + parts.join(", ") + "." : "Marked sent, but it reached nobody: nobody in this audience has a contact for these channels.") + (r.stats.emailSkipped || r.stats.smsSkipped || r.stats.telegramSkipped ? " Some were over the per-send limit; send again for the rest." : "") + (r.stats.smsDropped ? " No texts went: it was too long for SMS." : ""); };
        out.an = { title: E.id ? (editable ? "Edit announcement" : E.title) : "New announcement", t: E.title, b: E.body, onT: e => set({ title: e.target.value }), onB: e => set({ body: e.target.value }), len: len + " characters" + (E.ch.includes("sms") && !needsShort ? " · " + smsSeg + " text" + (smsSeg > 1 ? "s" : "") : needsShort ? " · too long for a text" : ""), lenColor: E.ch.includes("sms") && (needsShort || smsSeg > 1) ? "#7a5600" : "#6b6b72",
          editable, readOnly: !editable, reviewing, isChanges: E.status === "changes" && !!E.note, note: E.note || "", st: (ST2[E.status] || ST2.draft)[0], stBg: CP3_TONE[(ST2[E.status] || ST2.draft)[1]][0], stFg: CP3_TONE[(ST2[E.status] || ST2.draft)[1]][1], by: E.by, approvedBy: E.approvedBy || "", hasApproved: !!E.approvedBy,
          auds: [["guardians", "Guardians"], ["members", "Members"], ["both", "Both"]].map(o => { const on = E.aud === o[0]; return { l: o[1], on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => editable && set({ aud: o[0] }) }; }),
          centreLocked: !!lockC, centreL: lockC || "", cens: [["all", "Every centre"]].concat(centresAll.map(c => [c.name, c.name])).map(o => { const on = E.centre === o[0]; return { l: o[1], on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => editable && set({ centre: o[0] }) }; }),
          chs: [["app", "App"], ["email", "Email"], ["telegram", "Telegram"], ["sms", "SMS"], ["community", "Community"]].map(o => { const on = E.ch.includes(o[0]); return { l: o[1], on, border: on ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => editable && set({ ch: on ? E.ch.filter(c => c !== o[0]) : E.ch.concat([o[0]]) }) }; }),
          chHint: "App reaches members and guardians with a family account. Email and Telegram carry the whole message" + (S.annMeta.tgOn ? "" : " (Telegram isn’t set up yet)") + "; SMS costs per text. Community pins it for members in the commons" + (E.aud === "guardians" ? " — not used for a guardians-only message." : (E.centre !== "all" ? ", headed “For " + E.centre + " centre”." : ".")),
          needsShort, smsWhy: "the message is " + fullSms.length + " characters; a text holds " + smsMax, sms: E.smsBody || "", onSms: e => set({ smsBody: e.target.value }),
          smsLen: (E.smsBody ? ("NGG: " + E.smsBody.trim()).length : 0) + " / " + smsMax + " characters", smsLenColor: E.smsBody && ("NGG: " + E.smsBody.trim()).length > smsMax ? "#a12a2a" : "#6b6b72",
          hasSmsLost: smsLost.length > 0, smsLost: "Leaves out " + smsLost.join(", ") + ". Put it back, or send by email and Telegram instead.",
          hasSmsMsg: !!S.annShortMsg, smsMsg: S.annShortMsg || "", onShorten: () => this.annShorten(), shortenBusy: !!S.annShortBusy,
          shortenL: S.annShortBusy ? "Shortening…" : S.annMeta.aiOn ? "Shorten with AI" : "Shorten with AI (not set up)", onNoSms: () => this.annNoSms(), noSmsL: S.annMeta.tgOn ? "Send by email and Telegram instead" : "Send by email instead",
          showSmsPv: E.ch.includes("sms") && !!smsText, smsPv: smsText,
          whens: [["asap", isAdm ? "Send now" : "As soon as approved"], ["later", "At a set time"]].map(o => { const on = (E.when || "asap") === o[0]; return { l: o[1], on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(0,0,0,.1)" : "none", onClick: () => editable && set({ when: o[0] }) }; }),
          isLater: E.when === "later", sendAt: E.sendAtLocal || "", onSendAt: e => set({ sendAtLocal: e.target.value }),
          reach: rc ? "Reaches " + cp3Fmt(reach) + " " + ({ guardians: "guardians", members: "members", both: "members and guardians" })[E.aud] + (E.centre === "all" ? " across every centre" : " at " + E.centre) + ", each counted once." : "Counting who it reaches…",
          cost: smsN && smsText ? "SMS costs about ₦" + cp3Fmt(smsN * smsSeg * 4) + " (" + cp3Fmt(smsN) + " phones × " + smsSeg + " text" + (smsSeg > 1 ? "s" : "") + ")." : "", hasCost: !!smsN && !!smsText && S.annMeta.smsOn,
          warn, hasWarn: warn.length > 0, errs: E.tried ? errs : [], hasErr: !!E.tried && errs.length > 0, pvTitle: E.title || "Your title", pvBody: E.body || "Your message appears here.",
          approvalNote: isAdm ? "" : "An admin reviews it before anything is sent. You can still edit it until then.", hasApprovalNote: !isAdm && editable,
          noteV: S.annNote, onNote: e => this.setState({ annNote: e.target.value }), noteErr: !!E.triedNote && !S.annNote.trim(),
          primaryL: S.busy ? "Working…" : isAdm ? (E.when === "later" ? "Schedule" : "Send now") : "Submit for approval",
          onPrimary: () => { if (S.busy) return; if (errs.length) return set({ tried: true }); if (isAdm && E.when !== "later") confirmSend("Send now", () => this.annSave("submit").then(r => this.toast(statsLine(r) || "Sent")).catch(() => {}));
            else this.annSave("submit").then(r => this.toast(isAdm ? "Scheduled. It goes out " + ((r.announcement || {}).sendAt || "at the time you set") + "." : "Sent to an admin for approval. You’ll be told when it goes out.")).catch(() => {}); },
          onDraft: () => this.annSave("draft").then(() => this.toast("Draft saved")).catch(() => {}),
          onApprove: () => { if (S.busy) return; const later = !!E.sendAtIso && new Date(E.sendAtIso) > new Date(); const go2 = () => this.annSave("approve").then(r => this.toast(later ? "Approved. It goes out " + E.sendAt + "." : (statsLine(r) || "Approved and sent") + " " + E.by + " has been told.")).catch(() => {}); if (later) go2(); else confirmSend("Approve and send", go2); },
          onChanges: () => { if (!S.annNote.trim()) return set({ triedNote: true }); this.annSave("sendback", { note: S.annNote.trim() }).then(() => this.toast("Sent back to " + E.by + " with your note")).catch(() => {}); },
          canWithdraw: !isAdm && E.status === "pending" && mine, onWithdraw: () => this.annSave("withdraw").then(() => this.toast("Withdrawn. It’s a draft again.")).catch(() => {}),
          canDelete: editable && !!E.id, onDelete: () => this.setState({ confirm: { title: "Delete this draft?", body: "It can’t be brought back.", cta: "Delete", danger: true, onOk: () => { this.setState({ confirm: null }); this.annSave("delete").then(() => this.toast("Draft deleted")).catch(() => {}); } } }) };
      } else out.an = { auds: [], cens: [], chs: [], whens: [], warn: [], errs: [] };
      out.closeAnn = () => this.setState({ annEdit: null });
      out.annNewL = "New announcement";
    }

    /* ── the slot form ── */
    const F = S.form;
    out.hasForm = !!F;
    if (F) {
      const cl = this.clashesFor(F, all); const sg = cl.length ? this.suggest(F, all) : null; const fc = this.C(F.centreId);
      const set = patch => this.setState(s => ({ form: Object.assign({}, s.form, patch) }));
      const insList = B.instructors || [];
      out.form = { title: F.id ? "Change " + F.course : "Add a slot", isEdit: !!F.id, s: F.s, e: F.e, course: F.course, ins: F.insId || "", centreName: fc.name,
        centres: centresAll.filter(c => inScope(c.name)).map(c => ({ l: c.name, on: c.id === F.centreId, border: c.id === F.centreId ? "2px solid #0b0b0c" : "1px solid #e2e2df", onClick: () => set({ centreId: c.id, wd: c.days.includes(+F.wd) ? F.wd : c.days[0], room: c.rooms.includes(F.room) ? F.room : c.rooms[0] }) })),
        days: [1, 2, 3, 4, 5, 6, 7].map(d => { const on = +F.wd === d; const meets = fc.days.includes(d); return { l: CP3_DAYS[d].slice(0, 3), title: meets ? CP3_DAYS[d] : fc.name + " doesn’t meet on " + CP3_DAYS[d] + "s", on, border: on ? "2px solid #0b0b0c" : "1px solid " + (meets ? "#e2e2df" : "#f1f1ef"), bg: "#fff", fg: meets ? "#0b0b0c" : "#a3a3a8", onClick: () => set({ wd: d }) }; }),
        dayHelp: fc.name + " meets " + fc.days.map(d => CP3_DAYS[d] + "s").join(", ") + ", " + fc.open + "–" + fc.close + "." + (fc.daysSet && fc.hoursSet ? "" : " Set its meeting days and hours in Centres to change this."),
        onS: e => { const v2 = e.target.value; const dur = cp3M(F.e) - cp3M(F.s); set({ s: v2, e: dur > 0 ? cp3HM(cp3M(v2) + dur) : F.e }); }, onE: e => set({ e: e.target.value }),
        onCourse: e => set({ course: e.target.value }), onIns: e => { const id = e.target.value; const ins = insList.find(x => x.id === id); set({ insId: id, ins: ins ? ins.name : "" }); },
        rooms: fc.rooms.map(r => { const busy = this.clashesFor(Object.assign({}, F, { room: r }), all).some(c => c.type === "room"); return { l: r, on: r === F.room, border: r === F.room ? "2px solid #0b0b0c" : "1px solid #e2e2df", dot: busy ? "#d94141" : "#22a05a", onClick: () => set({ room: r }) }; }),
        insOpts: [{ v: "", l: "No instructor yet" }].concat(insList.map(n => { const busy = this.clashesFor(Object.assign({}, F, { insId: n.id, ins: n.name }), all).some(c => c.type === "instructor"); return { v: n.id, l: n.name + (busy ? " · busy then" : "") + (n.cleared ? "" : " · not cleared") }; })),
        hasClash: cl.length > 0, clashes: cl, ok: cl.length === 0, hasSuggest: !!sg, suggest: sg ? (sg.wd !== +F.wd ? CP3_DAYS[sg.wd] + " " : "") + sg.s + "–" + sg.e : "", onSuggest: () => sg && set({ wd: sg.wd, s: sg.s, e: sg.e }),
        disabled: cl.length || S.busy || !this.state.canEditTT ? "true" : undefined, saveBg: cl.length || !this.state.canEditTT ? "#a3a3a8" : "#0b0b0c",
        saveLabel: !this.state.canEditTT ? "Only a club coordinator edits the timetable" : cl.length ? "Fix the clash to save" : S.busy ? "Saving…" : (F.id ? "Save changes" : "Add to timetable"),
        onSave: () => this.state.canEditTT && this.saveForm(), onRemove: () => this.state.canEditTT && this.removeSlot(F) };
      out.courseOpts = B.courses.map(c => c[0]);
    } else { out.form = { centres: [], days: [], rooms: [], insOpts: [], clashes: [] }; out.courseOpts = []; }
    out.closeForm = () => this.setState({ form: null });
    out.scrim = isPhone ? "rgba(11,11,12,.32)" : "rgba(11,11,12,.12)";
    out.fTop = isPhone ? "0" : "12px"; out.fRight = isPhone ? "0" : "12px"; out.fBottom = isPhone ? "0" : "12px"; out.fLeft = isPhone ? "0" : "auto"; out.fWidth = isPhone ? "100%" : "min(480px, calc(100% - 24px))"; out.fRadius = isPhone ? "0" : "16px";

    out.hasConfirm = !!S.confirm; out.confirm = Object.assign({ cancelL: "Cancel" }, S.confirm || {}); out.cancelConfirm = () => this.setState({ confirm: null });
    out.hasToast = !!S.toast; out.toast = S.toast; out.toastUndo = S.toastUndo;
    out.onUndo = () => { const f = this.undoFn; this.undoFn = null; this.commitFn = null; clearTimeout(this.tt); this.setState({ toast: "" }); f && f(); };
    out.toastBottom = isPhone ? "100px" : "24px";

    /* ── command palette ── */
    { const pq2 = S.palQ.trim().toLowerCase(); const run = f => () => { this.setState({ pal: false, palQ: "" }); f(); };
      const flat = NAVG.reduce((a, g) => a.concat(g[1].map(n => ({ id: n[0], l: n[1], icon: "ph ph-" + n[2], s: g[0] || "Overview", b: (badge[n[0]] || [0])[0] || 0 }))), []);
      const secItem = n => ({ icon: n.icon, l: n.l, s: n.s, b: n.b, run: run(() => this.go(n.id)) });
      const acts = [{ icon: "ph ph-sparkle", l: "Write the weekly brief", s: "AI summary of this dashboard for centre leads", run: run(() => { this.go("home"); this.writeBrief(); }) },
        { icon: "ph ph-plus", l: "Add a timetable slot", s: "Timetable", run: run(() => { this.go("timetable"); setTimeout(() => this.openForm(null), 0); }) },
        { icon: "ph ph-megaphone", l: "Write an announcement", s: "Announcements", run: run(() => { this.go("announce"); setTimeout(() => out.annNew(), 0); }) },
        { icon: "ph ph-arrow-fat-line-up", l: "Promote Summer graduates", s: "Members", run: run(() => this.go("promote")) }]
        .concat(lockC ? [] : (out.scopeOpts || []).map(o => ({ icon: "ph ph-map-pin", l: "Show " + o.l, s: "Switch centre · " + o.n, run: run(o.onClick) })));
      const groups = [];
      if (!pq2) {
        const rec = S.recentSec.filter(id => id !== sec).map(id => flat.find(n => n.id === id)).filter(Boolean).slice(0, 3);
        if (rec.length) groups.push({ h: "Recent", items: rec.map(secItem) });
        const wait = flat.filter(n => n.b > 0).sort((a, b) => b.b - a.b).slice(0, 4);
        if (wait.length) groups.push({ h: "Waiting on you", items: wait.map(n => Object.assign(secItem(n), { s: n.b + " waiting · " + n.s })) });
        groups.push({ h: "Actions", items: acts.slice(0, 4) });
        groups.push({ h: "All sections", items: flat.map(secItem) });
      } else {
        const has = t => t.toLowerCase().indexOf(pq2) >= 0;
        const s1 = flat.filter(n => has(n.l) || has(n.s)).map(secItem); if (s1.length) groups.push({ h: "Sections", items: s1 });
        const a1 = acts.filter(a => has(a.l) || has(a.s)); if (a1.length) groups.push({ h: "Actions", items: a1 });
        if (pq2.length >= 2 && S.palMembers.length) groups.push({ h: "Members", items: S.palMembers.map(r => ({ icon: "ph ph-user", l: r.name, s: r.displayId + " · " + (r.course || "No course") + " · " + r.centre + (r.status !== "active" ? " · " + (STL[r.status] || r.status) : ""),
          run: run(() => { this.go("roster"); this.setState({ dirQ: r.displayId || r.id }); }) })) });
      }
      const all3 = groups.reduce((a, g) => a.concat(g.items), []); const pi = Math.min(S.palI, Math.max(0, all3.length - 1)); this.palFlat = all3; this.palIdx = pi;
      let k = 0; out.palGroups = groups.map(g => ({ h: g.h, items: g.items.map(it => { const i = k++; const on = i === pi; return { icon: it.icon, l: it.l, s: it.s, hasBadge: !!it.b, badge: it.b, on, sel: on ? "true" : "false", bg: on ? "#f1f1ef" : "transparent", onClick: it.run, hover: () => this.state.palI !== i && this.setState({ palI: i }) }; }) }));
      out.palOpen = S.pal; out.palQ = S.palQ; out.palEmpty = !all3.length; out.palPad = isPhone ? "12px" : "11vh 20px 20px";
      out.openPal = () => this.setState({ pal: true, palQ: "", palI: 0, palMembers: [] }); out.closePal = () => this.setState({ pal: false });
      out.onPalQ = e => { const v2 = e.target.value; this.setState({ palQ: v2, palI: 0 }); clearTimeout(this.palT);
        if (v2.trim().length >= 2) this.palT = setTimeout(() => this.api("search", { q: v2.trim() }).then(r => { if (this.state.palQ === v2) this.setState({ palMembers: r.members || [] }); }).catch(() => {}), 180); else this.setState({ palMembers: [] }); };
      out.onPalKey = e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = (this.palFlat || []).length; if (!n) return; this.setState({ palI: (this.palIdx + (e.key === "ArrowDown" ? 1 : n - 1)) % n }); } else if (e.key === "Enter") { e.preventDefault(); const it = (this.palFlat || [])[this.palIdx]; it && it.run(); } };
      out.palStop = e => e.stopPropagation(); }
    return out;
  }
  consentOf(r) { return Object.assign({}, r.consent, this.state.permOver[r.id] || {}); }
  reqMissing(c) { return (this.B().clauses || []).filter(k => k.req && !(c[k.k] && c[k.k].v === "g")); }

  render() {
    const S = this.state;
    if (!S.boot) {
      return <div className="cp3x cp3x-boot" ref={this.rootRef}>
        {S.bootErr
          ? <div className="cp3x-bootcard" role="alert"><h1>Couldn’t open the Club portal</h1><p>{S.bootErr}</p><button type="button" className="cp3x-btn" onClick={() => this.boot()}>Try again</button></div>
          : <div className="cp3x-bootcard" role="status"><span className="cp3x-spin" aria-hidden="true"/><p>Opening the Club portal…</p></div>}
      </div>;
    }
    const v = this.renderVals();
    return <div className="cp3x" data-busy={S.busy ? "true" : undefined}>{ClubPortalV3View(v)}</div>;
  }
}

Object.assign(window, { Cp3Portal });
