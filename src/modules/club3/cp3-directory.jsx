/* ============================================================================
   The Club roster: the Student Directory design (sd3-view.jsx, compiled from
   docs/design/portals/student-directory.dc.html), embedded in the Club portal
   by <dc-import name="Student Directory">.

   One request brings every member in scope, compact (admin.clubp.directory),
   so the directory's own search, views, filters and keyboard work at once on
   thousands of rows — the list is windowed, so only what is on screen renders.
   Every change goes back through an op: the drawer (dir.save), the bulk bar
   (dir.bulk, message), the register (register). A refusal is said in words,
   and the row reverts.
   ========================================================================== */

class Sd3Directory extends React.Component {
  constructor(props) {
    super(props);
    this.rootRef = React.createRef(); this.listRef = React.createRef(); this.qRef = React.createRef(); this.saveRef = React.createRef();
    this.state = { data: null, err: "", w: 1200, q: props.seedQ || "", view: "all", cur: null, f: {}, sort: "name", sel: {}, last: null, top: 0, vh: 600, focus: -1, open: null, drawer: null, dd: {},
      reg: false, marks: {}, dialog: null, toast: null, saving: false, saveName: "", dens: null, sheet: false, custom: [], busy: false };
  }
  componentDidMount() {
    try { this.setState({ custom: JSON.parse(localStorage.getItem("sd-views-v1") || "[]") }); } catch (e) {}
    this.measure = () => {
      const w = Math.round(this.rootRef.current ? this.rootRef.current.getBoundingClientRect().width : window.innerWidth) || window.innerWidth;
      const vh = this.listRef.current ? this.listRef.current.clientHeight : 600;
      if (Math.abs(w - this.state.w) > 4 || Math.abs(vh - this.state.vh) > 4) this.setState({ w, vh });
    };
    if (typeof ResizeObserver === "function") { this.ro = new ResizeObserver(this.measure); this.rootRef.current && this.ro.observe(this.rootRef.current); this.listRef.current && this.ro.observe(this.listRef.current); }
    window.addEventListener("resize", this.measure);
    this.measure(); requestAnimationFrame(this.measure); setTimeout(this.measure, 300);
    this.onKey = e => {
      const tag = (e.target.tagName || "").toLowerCase(); const typing = /input|textarea|select/.test(tag);
      const S = this.state;
      if (e.key === "Escape") { if (S.dialog) return this.setState({ dialog: null }); if (S.drawer) return this.setState({ drawer: null }); if (S.open || S.sheet) return this.setState({ open: null, sheet: false }); if (typing) return e.target.blur(); if (Object.keys(S.sel).length) return this.setState({ sel: {} }); }
      if (S.drawer && (e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); return this.saveDrawer(true); }
      if (typing || e.metaKey || e.ctrlKey || S.dialog) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') && !S.drawer) return;   // the portal's own layers come first
      const L = this.list || [];
      if (e.key === "/") { e.preventDefault(); e.stopPropagation(); this.qRef.current && this.qRef.current.focus(); return; }
      if (S.drawer) { if (e.key === "j") this.stepDrawer(1); if (e.key === "k") this.stepDrawer(-1); return; }
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); this.moveFocus(1); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); this.moveFocus(-1); }
      const cur = L[S.focus];
      if (!cur) return;
      if (e.key === "x") this.toggleSel(cur.memberId, S.focus, e.shiftKey);
      if (e.key === "Enter") this.openDrawer(cur.memberId);
      if (S.reg && /^[pla]$/i.test(e.key)) { this.mark(cur.memberId, e.key.toUpperCase()); this.moveFocus(1); }
    };
    window.addEventListener("keydown", this.onKey, true);
    this.load();
  }
  componentDidUpdate(prev) {
    if (prev.centre !== this.props.centre) this.setState({ sel: {}, f: {}, drawer: null });
    if (prev.reloadKey !== this.props.reloadKey) this.load();
    // The command palette opened a member: search for them, in everyone.
    if (prev.seedQ !== this.props.seedQ && this.props.seedQ) this.setState({ q: this.props.seedQ, view: "all", cur: null, f: {} });
  }
  componentWillUnmount() { this.ro && this.ro.disconnect(); window.removeEventListener("resize", this.measure); window.removeEventListener("keydown", this.onKey, true); clearTimeout(this._t); cancelAnimationFrame(this._raf); }

  load() {
    this.setState({ err: "" });
    return NGGApi.admin.clubp("directory").then(d => this.setState({ data: d }, this.measure)).catch(e => this.setState({ err: cp3Err(e, "Couldn’t load the roster.") }));
  }
  /* A change the server has accepted lands in the rows we hold; no reload needed. */
  patchRows(ids, fn) { this.setState(s => ({ data: Object.assign({}, s.data, { students: s.data.students.map(r => ids.indexOf(r.memberId) !== -1 ? Object.assign({}, r, fn(r)) : r) }) })); }
  rowH() { return this.state.w < 760 ? 80 : ((this.state.dens || this.props.density || "Comfortable") === "Compact" ? 36 : 48); }
  moveFocus(d) {
    const n = (this.list || []).length; if (!n) return;
    const f = Math.max(0, Math.min(n - 1, (this.state.focus < 0 ? (d > 0 ? -1 : 0) : this.state.focus) + d));
    this.setState({ focus: f });
    const el = this.listRef.current, h = this.rowH();
    if (el) { if (f * h < el.scrollTop) el.scrollTop = f * h; else if ((f + 1) * h > el.scrollTop + el.clientHeight) el.scrollTop = (f + 1) * h - el.clientHeight; }
  }
  toast(text, undo) { clearTimeout(this._t); this.setState({ toast: { text, undo } }); this._t = setTimeout(() => this.setState({ toast: null }), undo ? 6500 : 4000); }
  toggleSel(id, idx, shift) {
    this.setState(s => {
      const sel = Object.assign({}, s.sel);
      if (shift && s.last != null && this.list) { const [a, b] = [Math.min(s.last, idx), Math.max(s.last, idx)]; const on = !sel[id]; for (let i = a; i <= b; i++) { const x = this.list[i]; if (x) { if (on) sel[x.memberId] = 1; else delete sel[x.memberId]; } } }
      else if (sel[id]) delete sel[id]; else sel[id] = 1;
      return { sel, last: idx };
    });
  }
  mark(id, m) { this.setState(s => { const marks = Object.assign({}, s.marks); if (marks[id] === m) delete marks[id]; else marks[id] = m; return { marks }; }); }
  openDrawer(id) { const i = (this.list || []).findIndex(x => x.memberId === id); this.setState({ drawer: id, dd: {}, focus: i }); }
  stepDrawer(d) { const L = this.list || []; const i = L.findIndex(x => x.memberId === this.state.drawer); const n = L[i + d]; if (n) { this.setState({ drawer: n.memberId, dd: {}, focus: i + d }); this.moveFocusTo(i + d); } }
  moveFocusTo(i) { const el = this.listRef.current, h = this.rowH(); if (el && (i * h < el.scrollTop || (i + 1) * h > el.scrollTop + el.clientHeight)) el.scrollTop = Math.max(0, i * h - el.clientHeight / 2); }
  saveDrawer(next) {
    const S = this.state; if (!S.drawer || !Object.keys(S.dd).length) { if (next) this.stepDrawer(1); return; }
    const id = S.drawer; const dd = S.dd; const data = {};
    ["cls", "centre", "guardian", "phone", "status"].forEach(k => { if (k in dd) data[k] = dd[k]; });
    if ("mentor" in dd) { const m = this.mentorByName(dd.mentor); data.mentorId = m ? m.id : ""; }
    this.setState({ busy: true });
    NGGApi.admin.clubp("dir.save", { memberId: id, data }).then(() => {
      this.patchRows([id], () => Object.assign({}, dd));
      this.setState({ dd: {}, busy: false }); this.toast("Saved");
      if (next) setTimeout(() => this.stepDrawer(1), 0);
    }).catch(e => { this.setState({ busy: false }); this.toast(cp3Err(e, "Couldn’t save.")); });
  }
  mentorByName(name) { const M = (this.state.data || {}).mentors || {}; for (const k in M) { const m = M[k].find(x => x.name === name); if (m) return m; } return null; }
  bulk(act, ids, extra, done, patch) {
    this.setState({ busy: true });
    NGGApi.admin.clubp("dir.bulk", Object.assign({ act, memberIds: ids }, extra)).then(r => {
      const bad = (r.results || []).filter(x => x && x.ok === false && !x.unchanged);
      const okIds = ids.filter(id => !bad.some(b => b.id === id));
      if (patch) this.patchRows(okIds, patch);
      this.setState({ busy: false, dialog: null, sel: {} });
      this.toast(done(r.applied || 0) + (bad.length ? " · " + bad.length + " not (" + (typeof adminFailSummary === "function" ? adminFailSummary(bad) : "refused") + ")" : ""));
    }).catch(e => { this.setState({ busy: false }); this.toast((e.code || "") === "approval_pending" ? "Sent to a second admin to approve." : cp3Err(e)); });
  }
  exportCsv(rows) {
    const esc = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = ["ID", "Name", "Centre", "Class", "Division", "Course", "Mentor", "Status", "Attendance %", "Guardian", "Guardian phone", "Consent", "ID card"];
    const csv = [head].concat(rows.map(s => [s.id, s.name, s.centre, s.cls, s.division, s.course, s.mentor || "", s.status, s.pct == null ? "" : s.pct, s.guardian, s.phone, s.consent ? "Yes" : "No", s.idCard ? "Printed" : "Not printed"])).map(r => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "ngg-students-" + rows.length + ".csv"; a.click();
    this.setState({ dialog: null }); this.toast("Exported " + rows.length.toLocaleString() + " students to CSV");
  }

  renderVals() {
    const D = this.state.data, S = this.state, P = this.props;
    const fmt = n => Number(n || 0).toLocaleString("en-GB");
    const isMob = S.w < 760, isDesk = !isMob;
    const cen = P.centre && P.centre !== "all" && P.centre !== "All centres" ? P.centre : null;
    const R = cen ? { scope: s => s.centre === cen, scopeL: cen + " centre", acts: ["message", "mentor", "idcard", "status", "export"], reg: true, filters: ["cls", "division", "mentor", "status", "att"] }
      : { scope: () => true, scopeL: "All centres", acts: ["message", "mentor", "idcard", "move", "status", "export"], reg: false, filters: ["centre", "cls", "division", "mentor", "status", "att"] };
    const base0 = { rootRef: this.rootRef, listRef: this.listRef, qRef: this.qRef, saveRef: this.saveRef, scopeL: R.scopeL, rows: [], views: [], filters: [], isDesk, isMob, listUnit: "students", acts: [], keys: [], dr: {}, dl: {}, classOpts: [], centreOpts: [], densOpts: [], sortOpts: [], rootH: "100%" };
    if (!D) return Object.assign(base0, { scopeN: "…", listN: S.err ? "0" : "…", isEmpty: !!S.err, emptyH: S.err ? "Couldn’t load the roster" : "", emptyS: S.err ? S.err + " Refresh the page to try again." : "" });
    const all = D.students;
    const byId = {}; all.forEach(s => byId[s.memberId] = s); this.byId = byId;
    const scoped = all.filter(R.scope);
    const showFlags = P.showFlags ?? true;
    const T = { red: ["#fde8e6", "#a12a1f"], amber: ["#fdf2d8", "#7a5600"], green: ["#e8f5ec", "#17663a"], blue: ["#e6efff", "#1f4aa8"], neutral: ["#f1f1ef", "#3a3a40"] };
    const VIEWS = [
      { id: "all", l: "Everyone", p: () => true },
      { id: "absent", l: "Absent 2+ sessions", p: s => s.absentRun >= 2 },
      { id: "nomentor", l: "No mentor", p: s => !s.mentor },
      { id: "consent", l: "Missing consent", p: s => !s.consent },
      { id: "idcard", l: "No ID card", p: s => !s.idCard },
      { id: "new", l: "New this term", p: s => s.status === "New" },
      { id: "owing", l: "Dues owing", p: s => s.owing },
    ];
    const bucket = s => s.pct == null ? "No record yet" : s.pct >= 80 ? "80% and above" : s.pct >= 50 ? "50–79%" : "Under 50%";
    const mentorsIn = [...new Set(scoped.map(s => s.mentor).filter(Boolean))].sort();
    const FD = {
      centre: { name: "Centre", opts: D.centres, get: s => s.centre }, cls: { name: "Class", opts: D.classes.concat(scoped.some(s => !s.cls) ? ["Not set"] : []), get: s => s.cls || "Not set" },
      division: { name: "Division", opts: D.divisions, get: s => s.division }, mentor: { name: "Mentor", opts: ["No mentor"].concat(mentorsIn), get: s => s.mentor || "No mentor" },
      status: { name: "Status", opts: ["Active", "New", "Paused"], get: s => s.status }, att: { name: "Attendance", opts: ["80% and above", "50–79%", "Under 50%", "No record yet"], get: bucket },
    };
    const fkeys = R.filters;
    const F = S.f; const fOn = k => (F[k] || []).length > 0;
    const passF = (s, ex) => fkeys.every(k => k === ex || !fOn(k) || F[k].includes(FD[k].get(s)));
    const toks = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const mq = s => { if (!toks.length) return true; const hay = (s.name + " " + s.id + " " + s.cls + " " + s.course + " " + s.guardian + " " + (s.mentor || "")).toLowerCase(); return toks.every(t => hay.includes(t) || (/^\d{3,}$/.test(t) && String(s.phone || "").replace(/\D/g, "").includes(t))); };
    const view = VIEWS.find(v => v.id === S.view) || VIEWS[0];
    const inView = scoped.filter(view.p);
    const qMatch = toks.length ? inView.filter(mq) : inView;
    let list = qMatch.filter(s => passF(s, null));
    const SORTS = { name: (a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first), attLow: (a, b) => (a.pct ?? 101) - (b.pct ?? 101), newest: (a, b) => String(b.joined).localeCompare(String(a.joined)), cls: (a, b) => D.classes.indexOf(a.cls) - D.classes.indexOf(b.cls) || a.last.localeCompare(b.last) };
    list = list.slice().sort(SORTS[S.sort] || SORTS.name);
    this.list = list;
    const outsideN = toks.length && (view.id !== "all" || fkeys.some(fOn)) ? scoped.filter(mq).length - list.length : 0;
    const anyF = fkeys.some(fOn);
    const dirty = !!(toks.length || anyF);
    const roleKey = cen ? "Club lead:" + cen : "Club lead";
    const curV = S.cur && S.custom.find(c => c.id === S.cur);
    const curDirty = curV && JSON.stringify({ v: curV.view, f: curV.f, q: curV.q }) !== JSON.stringify({ v: S.view, f: S.f, q: S.q });
    const setView = (id, extra) => { if (this.listRef.current) this.listRef.current.scrollTop = 0; this.setState(Object.assign({ view: id, cur: null, f: {}, q: "", focus: -1, top: 0 }, extra)); };
    const views = VIEWS.map(v => { const on = S.view === v.id && !S.cur && !dirty; const n = scoped.filter(v.p).length; return { l: v.l, n: fmt(n), on, custom: false, line: on ? "#0b0b0c" : "transparent", fw: on ? 600 : 500, fg: on ? "#0b0b0c" : "#4a4a50", cbg: on ? "#0b0b0c" : "#f1f1ef", cfg: on ? "#fff" : "#4a4a50", onClick: () => setView(v.id) }; })
      .concat(S.custom.filter(c => c.role === roleKey).map(c => { const on = S.cur === c.id; const vv = VIEWS.find(v => v.id === c.view) || VIEWS[0]; const ct = String(c.q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
        const n = scoped.filter(s => vv.p(s) && fkeys.every(k => !(c.f[k] || []).length || c.f[k].includes(FD[k].get(s))) && (!ct.length || ct.every(t => (s.name + " " + s.id + " " + s.cls + " " + s.course).toLowerCase().includes(t)))).length;
        return { l: c.name, n: fmt(n), on, custom: true, line: on ? "#0b0b0c" : "transparent", fw: on ? 600 : 500, fg: on ? "#0b0b0c" : "#4a4a50", cbg: on ? "#0b0b0c" : "#f1f1ef", cfg: on ? "#fff" : "#4a4a50", onClick: () => setView(c.view, { cur: c.id, f: c.f, q: c.q }) }; }));
    const filters = fkeys.map(k => {
      const d = FD[k]; const base = qMatch.filter(s => passF(s, k)); const cnt = {}; base.forEach(s => { const g = d.get(s); cnt[g] = (cnt[g] || 0) + 1; });
      const selected = F[k] || []; const open = S.open === k;
      const label = selected.length === 0 ? d.name : selected.length <= 2 ? d.name + ": " + selected.join(", ") : d.name + ": " + selected.length + " selected";
      const toggle = o => this.setState(s => { const cur = (s.f[k] || []).slice(); const i = cur.indexOf(o); if (i >= 0) cur.splice(i, 1); else cur.push(o); return { f: Object.assign({}, s.f, { [k]: cur }), focus: -1 }; });
      return { name: d.name, label, open, any: selected.length > 0, border: selected.length ? "#0b0b0c" : "#e2e2df", bg: selected.length ? "#f4f4f3" : "#fff",
        onClick: () => this.setState({ open: open ? null : k }), onClear: () => this.setState(s => ({ f: Object.assign({}, s.f, { [k]: [] }) })),
        opts: d.opts.map(o => { const on = selected.includes(o); const n = cnt[o] || 0; return { l: o, n: fmt(n), on, op: n || on ? 1 : 0.45, cb: on ? "#0b0b0c" : "#c9c9c5", cbg: on ? "#0b0b0c" : "#fff", chipB: on ? "#0b0b0c" : "#e2e2df", chipBg: on ? "#0b0b0c" : "#fff", chipFg: on ? "#fff" : "#0b0b0c", onClick: () => toggle(o) }; }) };
    });
    const rowH = this.rowH(); const n = list.length;
    const start = Math.max(0, Math.floor(S.top / rowH) - 8); const end = Math.min(n, start + Math.ceil(S.vh / rowH) + 16);
    const reg = !!(S.reg && R.reg);
    const attC = { P: "#2f9e5b", L: "#e0a100", A: "#d6453d" }; const attT = { P: "Present", L: "Late", A: "Absent" };
    const flagsOf = s => { const g = []; if (s.absentRun >= 2) g.push({ l: "Absent " + s.absentRun + " sessions", t: "red" }); if (!s.consent) g.push({ l: "No consent", t: "red" }); if (!s.mentor) g.push({ l: "No mentor", t: "amber" }); if (s.owing) g.push({ l: "Owing", t: "amber" }); if (!s.idCard) g.push({ l: "No ID card", t: "neutral" }); if (s.status === "New") g.push({ l: "New", t: "blue" }); if (s.status === "Paused") g.push({ l: "Paused", t: "neutral" }); return g.map(x => ({ l: x.l, bg: T[x.t][0], fg: T[x.t][1] })); };
    const pctColor = p => p == null ? "#6b6b72" : p < 50 ? "#a12a1f" : p < 80 ? "#7a5600" : "#17663a";
    const maxF = S.w >= 1280 ? 2 : 1;
    const nextOf = s => { const d = (D.registerDates || {})[s.centre]; return d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "this session"; };
    const NEXT = cen ? nextOf({ centre: cen }) : "this session";
    const rows = list.slice(start, end).map((s, j) => {
      const i = start + j; const sel = !!S.sel[s.memberId]; const focus = S.focus === i; const fl = flagsOf(s); const wk = (D.weeks || {})[s.centre] || [];
      return { id: s.id, name: s.name, centre: s.centre, cls: s.cls || "—", course: s.course || "—", sel, mentorL: s.mentor || "No mentor", mentorC: s.mentor ? "#0b0b0c" : "#7a5600",
        bg: sel ? "#f4f4f3" : "#fff", ring: focus ? "inset 3px 0 0 #0b0b0c" : "none", cb: sel ? "#0b0b0c" : "#c9c9c5", cbg: sel ? "#0b0b0c" : "#fff",
        att: s.att.map((a, w) => ({ bg: a ? attC[a] : "#e7e7e5", t: (wk[w] || "") + ": " + (a ? attT[a] : "not enrolled") })),
        pctL: s.pct == null ? "—" : s.pct + "%", pctC: pctColor(s.pct),
        flags: showFlags ? (isMob ? fl.slice(0, 2) : fl.slice(0, maxF).map(x => Object.assign({ sh: 1 }, x)).concat(fl.length > maxF ? [{ l: "+" + (fl.length - maxF), bg: "#f1f1ef", fg: "#3a3a40", sh: 0 }] : [])) : [],
        mobSub: s.id + " · " + (s.cls || "No class") + (!cen ? " · " + s.centre : "") + " · " + (s.mentor || "No mentor"),
        marks: ["P", "L", "A"].map(m => { const on = S.marks[s.memberId] === m; const c = { P: ["#e8f5ec", "#17663a"], L: ["#fdf2d8", "#7a5600"], A: ["#fde8e6", "#a12a1f"] }[m]; return { l: m, on, aria: attT[m] + " " + s.name, border: on ? c[1] : "#e2e2df", bg: on ? c[0] : "#fff", fg: on ? c[1] : "#5d5d63", onClick: e => { e.stopPropagation(); this.mark(s.memberId, m); this.setState({ focus: i }); } }; }),
        onSel: e => { e.stopPropagation(); this.toggleSel(s.memberId, i, e.shiftKey); },
        onOpen: () => this.openDrawer(s.memberId) };
    });
    const showCentre = !cen && S.w >= 1240; const showCourse = S.w >= 1100;
    const cols = ["44px", "minmax(160px,2fr)"].concat(showCentre ? ["96px"] : [], ["64px"], showCourse ? ["minmax(110px,1.1fr)"] : [], ["minmax(100px,1fr)", "150px", reg ? "150px" : "minmax(170px,1.3fr)"]).join(" ");
    const selIds = Object.keys(S.sel); const selN = selIds.length;
    const inList = {}; list.forEach(s => inList[s.memberId] = 1); const hiddenSel = selIds.filter(id => !inList[id]).length;
    const selInList = selN - hiddenSel;
    const allSel = n > 0 && selInList === n; const someSel = selInList > 0 && !allSel;
    const visIds = list.slice(start, end).map(r => r.memberId);
    const toggleAll = () => this.setState(s => { const sel = Object.assign({}, s.sel); if (allSel || someSel) list.forEach(x => delete sel[x.memberId]); else visIds.forEach(id => sel[id] = 1); return { sel }; });
    const showAllBanner = isDesk && selInList > 0 && selInList < n && selInList >= visIds.length && visIds.every(id => S.sel[id]) || allSel && n > visIds.length;
    const marked = list.filter(s => S.marks[s.memberId]).length;
    const ACTS = { message: ["Message guardians", "ph-chat-circle-text"], mentor: ["Assign mentor", "ph-user-plus"], idcard: ["Print ID cards", "ph-identification-card"], move: ["Move centre", "ph-arrows-left-right"], status: ["Change status", "ph-tag"], export: ["Export CSV", "ph-download-simple"] };
    const selRows = selIds.map(id => byId[id]).filter(Boolean);
    const regActs = [["P", "Mark present", "ph-check-circle"], ["L", "Mark late", "ph-clock"], ["A", "Mark absent", "ph-x-circle"]].map(([m, l, icon]) => ({ l: isMob ? l.replace("Mark ", "") : l, icon, onClick: () => { this.setState(s => { const marks = Object.assign({}, s.marks); selIds.forEach(id => marks[id] = m); return { marks, sel: {} }; }); this.toast(fmt(selN) + " marked " + l.replace("Mark ", "").toLowerCase()); } }));
    const acts = reg ? regActs : R.acts.map(k => ({ l: isMob && k === "message" ? "Message" : isMob && k === "idcard" ? "ID cards" : ACTS[k][0], icon: ACTS[k][1],
      onClick: () => k === "export" ? this.exportCsv(selRows) : this.setState({ dialog: { kind: k, ch: { sms: true, app: true }, text: "Hello. This is a message from NGG " + (cen || "Club") + " about your child.", mentor: "", centre: cen || (D.centres[0] || ""), status: "Active" } }) }));
    let dl = {};
    if (S.dialog) {
      const k = S.dialog.kind, dg = S.dialog; const up = p => this.setState(s => ({ dialog: Object.assign({}, s.dialog, p) }));
      const noPhone = selRows.filter(s => !String(s.phone || "").replace(/\D/g, "")).length; const noConsent = selRows.filter(s => !s.consent).length;
      const centresOf = [...new Set(selRows.map(s => s.centre))];
      const seg = (opts, cur, key) => opts.map(o => ({ l: o, on: cur === o, bg: cur === o ? "#fff" : "transparent", sh: cur === o ? "0 1px 2px rgba(11,11,12,.12)" : "none", onClick: () => up({ [key]: o }) }));
      const ids = selRows.map(s => s.memberId);
      if (k === "message") { const to = selN - noPhone; const segs = Math.max(1, Math.ceil(dg.text.length / 160));
        dl = { title: "Message guardians", sub: "To the guardians of " + fmt(selN) + " students.", warns: noPhone ? [fmt(noPhone) + " have no guardian phone on record. They will get the app message only."] : [], isMsg: true, text: dg.text, onText: e => up({ text: e.target.value }),
          count: dg.text.length + " characters · " + segs + " SMS each · about " + fmt(to * segs) + " SMS in total", chans: [["sms", "SMS"], ["app", "App notification"]].map(([id, l]) => ({ l, on: dg.ch[id], border: dg.ch[id] ? "#0b0b0c" : "#e2e2df", bg: dg.ch[id] ? "#f4f4f3" : "#fff", onClick: () => up({ ch: Object.assign({}, dg.ch, { [id]: !dg.ch[id] }) }) })),
          cta: S.busy ? "Sending…" : "Send to " + fmt(selN) + " guardians", blocked: S.busy || !dg.text.trim() || !(dg.ch.sms || dg.ch.app),
          confirm: () => { this.setState({ busy: true }); NGGApi.admin.clubp("message", { memberIds: ids, text: dg.text, ch: dg.ch }).then(r => { this.setState({ busy: false, dialog: null, sel: {} });
            this.toast("Sent: " + [r.app ? fmt(r.app) + " in the app" : "", r.sms ? fmt(r.sms) + " by SMS" : ""].filter(Boolean).join(", ") + (dg.ch.sms && !r.smsOn ? ". SMS isn’t set up on this site, so none went by text." : ".")); })
            .catch(e => { this.setState({ busy: false }); this.toast(cp3Err(e)); }); } }; }
      if (k === "mentor") { const pool = centresOf.length === 1 ? ((D.mentors || {})[centresOf[0]] || []).concat((D.mentors || {}).All || []) : []; const load = {}; all.forEach(s => { if (s.mentor) load[s.mentor] = (load[s.mentor] || 0) + 1; });
        dl = { title: "Assign a mentor", sub: fmt(selN) + " students will be paired with the mentor you pick.", warns: centresOf.length > 1 ? ["These students are at " + centresOf.length + " centres. Pick students from one centre to assign a mentor."] : (pool.length ? [] : ["This centre has no mentors yet. Add one in the Control Room."]), isMentor: true,
          mentor: dg.mentor, onMentor: e => up({ mentor: e.target.value }), mentorOpts: [{ v: "", l: "Choose a mentor" }].concat(pool.map(m => ({ v: m.id, l: m.name + " · " + (load[m.name] || 0) + " mentees" }))),
          cta: "Assign to " + fmt(selN), blocked: S.busy || !dg.mentor || centresOf.length > 1,
          confirm: () => { const m = pool.find(x => x.id === dg.mentor); this.bulk("mentor", ids, { mentorId: dg.mentor }, n2 => fmt(n2) + " students paired with " + (m ? m.name : "the mentor"), () => ({ mentor: m ? m.name : null })); } }; }
      if (k === "idcard") { const ok = selN - noConsent;
        dl = { title: "Print ID cards", sub: fmt(ok) + " cards go to the ID Card Studio’s print queue.", warns: noConsent ? [fmt(noConsent) + " are missing a required permission. They are left out until a guardian agrees."] : [],
          cta: "Queue " + fmt(ok) + " cards", blocked: S.busy || ok === 0, confirm: () => this.bulk("idcard", selRows.filter(s => s.consent).map(s => s.memberId), {}, n2 => fmt(n2) + " cards queued in the ID Card Studio") }; }
      if (k === "move") dl = { title: "Move centre", sub: fmt(selN) + " students will move. A coordinator’s move waits for a second admin.", warns: [], isMove: true, centres: seg(D.centres, dg.centre, "centre"),
        cta: "Move " + fmt(selN) + " to " + dg.centre, blocked: S.busy, confirm: () => this.bulk("move", ids, { value: dg.centre }, n2 => fmt(n2) + " students moved to " + dg.centre, () => ({ centre: dg.centre })) };
      if (k === "status") dl = { title: "Change status", sub: "Paused students stay on record but leave registers and messages.", warns: [], isStatus: true, statuses: seg(["Active", "Paused"], dg.status, "status"),
        cta: "Set " + fmt(selN) + " to " + dg.status, blocked: S.busy, confirm: () => this.bulk("status", ids, { value: dg.status }, n2 => fmt(n2) + " students set to " + dg.status.toLowerCase(), () => ({ status: dg.status })) };
      dl.op = dl.blocked ? 0.4 : 1; dl.warns = dl.warns || [];
    }
    let dr = {};
    const drS = S.drawer && byId[S.drawer];
    if (drS) {
      const v = Object.assign({}, drS, S.dd); const i = list.findIndex(x => x.memberId === drS.memberId); const up = p => this.setState(s => ({ dd: Object.assign({}, s.dd, p) }));
      const clean = !Object.keys(S.dd).length; const phoneBad = v.phone && !/^0\d{10}$/.test(String(v.phone).replace(/\s/g, ""));
      const wk = (D.weeks || {})[v.centre] || [];
      dr = { name: v.name, id: v.id, sub: v.centre + " · " + v.division + " · " + (v.course || "No course") + " · joined " + (v.joined || "—"), pos: i >= 0 ? fmt(i + 1) + " of " + fmt(n) : "Not in this view", prev: () => this.stepDrawer(-1), next: () => this.stepDrawer(1),
        flags: flagsOf(v), hasFlags: flagsOf(v).length > 0, pctL: v.pct == null ? "no record yet" : v.pct + "% present or late",
        weeks: v.att.map((a, w) => ({ w: wk[w] || "", l: a || "–", bg: a ? { P: "#e8f5ec", L: "#fdf2d8", A: "#fde8e6" }[a] : "#f4f4f3", fg: a ? { P: "#17663a", L: "#7a5600", A: "#a12a1f" }[a] : "#a3a3a8" })),
        cls: v.cls, onCls: e => up({ cls: e.target.value }), centre: v.centre, onCentre: e => up({ centre: e.target.value, mentor: null }), centreLocked: !!cen,
        mentor: v.mentor || "", onMentor: e => up({ mentor: e.target.value || null }), mentorLocked: false, mentorOpts: (() => { const o = (((D.mentors || {})[v.centre] || []).concat((D.mentors || {}).All || [])).map(m => m.name); return v.mentor && !o.includes(v.mentor) ? [v.mentor].concat(o) : o; })(),
        statusOpts: ["Active", "Paused"].map(o => ({ l: o, on: (v.status === "New" ? "Active" : v.status) === o, bg: (v.status === "New" ? "Active" : v.status) === o ? "#fff" : "transparent", sh: (v.status === "New" ? "Active" : v.status) === o ? "0 1px 2px rgba(11,11,12,.12)" : "none", onClick: () => up({ status: o }) })),
        guardian: v.guardian, onGuardian: e => up({ guardian: e.target.value }), phone: v.phone, onPhone: e => up({ phone: e.target.value }), phoneBorder: phoneBad ? "#d6453d" : "#e2e2df",
        consent: v.consent, onConsent: () => { if (P.onPermissions) P.onPermissions(v.memberId); }, consentTrack: v.consent ? "#17663a" : "#c9c9c5", consentKnob: v.consent ? "16px" : "2px",
        clean: clean || phoneBad || S.busy, btnOp: clean || phoneBad || S.busy ? 0.4 : 1, saveHint: phoneBad ? "Phone must be 11 digits starting with 0" : isMob ? "" : clean ? "J / K to move between students. Permissions are recorded in Permissions." : "Ctrl + Enter saves and opens the next",
        save: () => this.saveDrawer(false), saveNext: () => this.saveDrawer(true) };
    }
    const listUnit = reg ? "on this register" : n === 1 ? "student" : "students";
    return Object.assign(base0, {
      rootH: P.embedded ? "100%" : "100vh", embedReg: !!P.embedded && R.reg, showKeys: isDesk && !P.embedded, standalone: !P.embedded, headPad: P.embedded ? "0 0 10px" : "14px 20px 10px", padX: P.embedded ? "0" : "20px",
      scopeL: R.scopeL, scopeN: fmt(scoped.length), canReg: R.reg, reg, notReg: !reg,
      toggleReg: () => this.setState(s => ({ reg: !s.reg, view: !s.reg ? "all" : s.view, sel: {} })),
      regBtnL: reg ? "Close register" : "Take register · " + NEXT, regBorder: reg ? "#0b0b0c" : "#e2e2df", regBg: reg ? "#0b0b0c" : "#fff", regFg: reg ? "#fff" : "#0b0b0c",
      addStudent: () => P.onAdd && P.onAdd(),
      views, saving: S.saving, canSave: !S.saving && (dirty && !S.cur || curDirty), canDelView: !!S.cur && !S.saving,
      startSave: () => { this.setState({ saving: true, saveName: curV ? curV.name : "" }); setTimeout(() => this.saveRef.current && this.saveRef.current.focus(), 30); },
      cancelSave: () => this.setState({ saving: false }), onSaveName: e => this.setState({ saveName: e.target.value }),
      saveView: e => { e.preventDefault(); const name = S.saveName.trim(); if (!name) return; const id = curV ? curV.id : "c" + Date.now(); const c = { id, role: roleKey, name, view: S.view, f: S.f, q: S.q }; const custom = S.custom.filter(x => x.id !== id).concat([c]); try { localStorage.setItem("sd-views-v1", JSON.stringify(custom)); } catch (er) {} this.setState({ custom, cur: id, saving: false }); this.toast("View saved on this device."); },
      delView: () => { const custom = S.custom.filter(x => x.id !== S.cur); try { localStorage.setItem("sd-views-v1", JSON.stringify(custom)); } catch (er) {} this.setState({ custom, cur: null, f: {}, q: "", view: "all" }); },
      q: S.q, hasQ: !!S.q, showKbd: isDesk && !S.q, qPh: isMob ? "Name, ID or phone" : "Search name, member ID, class or guardian phone", qBorder: S.q ? "#0b0b0c" : "#e2e2df",
      onQ: e => { if (this.listRef.current) this.listRef.current.scrollTop = 0; this.setState({ q: e.target.value, focus: -1, top: 0 }); }, clearQ: () => this.setState({ q: "" }),
      filters, anyF, clearAll: () => this.setState({ f: {} }), closeF: () => this.setState({ open: null }),
      openSheet: () => this.setState({ sheet: true }), closeSheet: () => this.setState({ sheet: false }), hasSheet: S.sheet && isMob,
      mfL: anyF ? "Filters · " + fkeys.filter(fOn).length : "Filters", mfBorder: anyF ? "#0b0b0c" : "#e2e2df",
      listN: fmt(n), listUnit, hasOutside: outsideN > 0, outsideL: fmt(outsideN) + " more " + (outsideN === 1 ? "match" : "matches") + " outside this view. Search everyone",
      searchEverywhere: () => this.setState({ view: "all", cur: null, f: {} }),
      regPct: (n ? Math.round(marked / n * 100) : 0) + "%", regProg: fmt(marked) + " of " + fmt(n) + " marked",
      markRest: () => this.setState(s => { const marks = Object.assign({}, s.marks); list.forEach(x => { if (!marks[x.memberId]) marks[x.memberId] = "P"; }); return { marks }; }),
      submitReg: () => { const left = n - marked; if (left) return this.toast(fmt(left) + " not marked yet. Mark them or use “Mark the rest present”."); if (S.busy) return;
        const marks = {}; list.forEach(x => { if (S.marks[x.memberId]) marks[x.memberId] = S.marks[x.memberId]; });
        this.setState({ busy: true });
        NGGApi.admin.clubp("register", { marks }).then(r => { this.setState({ busy: false, reg: false, marks: {} });
          this.toast("Register for " + NEXT + " saved: " + fmt(r.present) + " present, " + fmt(r.late) + " late, " + fmt(r.absent) + " absent" + (r.already ? " · " + fmt(r.already) + " already checked in at the gate" : "") + "."); this.load(); })
          .catch(e => { this.setState({ busy: false }); this.toast(cp3Err(e)); }); },
      sort: S.sort, onSort: e => this.setState({ sort: e.target.value }), sortOpts: [{ v: "name", l: "Surname A–Z" }, { v: "attLow", l: "Lowest attendance" }, { v: "newest", l: "Newest first" }, { v: "cls", l: "Class" }],
      densOpts: ["Comfortable", "Compact"].map(o => { const on = (S.dens || P.density || "Comfortable") === o; return { l: o, on, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(11,11,12,.12)" : "none", onClick: () => this.setState({ dens: o }) }; }),
      showAllBanner, canSelAll: !allSel, allBannerL: allSel ? "All " + fmt(n) + " students in this view are selected." : "The " + fmt(selInList) + " students on screen are selected.",
      selAllMatching: () => this.setState(s => { const sel = Object.assign({}, s.sel); list.forEach(x => sel[x.memberId] = 1); return { sel }; }),
      clearSel: () => this.setState({ sel: {} }),
      cols, rowH: rowH + "px", padTop: start * rowH + "px", padBottom: (n - end) * rowH + "px", rows,
      onScroll: e => { const t = e.currentTarget.scrollTop; cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this.setState({ top: t })); },
      showCentre, showCourse, allSel, someSel, allCb: allSel || someSel ? "#0b0b0c" : "#c9c9c5", allCbg: allSel || someSel ? "#0b0b0c" : "#fff", toggleAll, lastColL: reg ? "Mark · " + NEXT : "Needs attention",
      isEmpty: n === 0, emptyH: toks.length ? "No student matches “" + S.q.trim() + "”" : scoped.length ? "Nobody in this view" : "No members here yet",
      emptyS: toks.length ? "Check the spelling, or search by member ID or the last digits of a guardian phone." : scoped.length ? "Nothing needs doing here right now." : "Add a member, or promote Summer School graduates into the Club.",
      keys: [{ k: "/", l: "Search" }, { k: "J K", l: "Move" }, { k: "X", l: "Select" }, { k: "Shift", l: "Select a range" }, { k: "Enter", l: "Open record" }].concat(reg ? [{ k: "P L A", l: "Mark and move on" }] : []),
      listMb: isMob && selN ? "84px" : isMob ? "12px" : P.embedded ? "4px" : "0",
      hasSel: selN > 0, selN: fmt(selN), hasHiddenSel: hiddenSel > 0, hiddenSelL: fmt(hiddenSel) + " not in this view", acts,
      bulkL: isMob ? "0" : "50%", bulkR: isMob ? "0" : "auto", bulkB: isMob ? "0" : P.embedded ? "20px" : "52px", bulkTx: isMob ? "none" : "translateX(-50%)", bulkRad: isMob ? "16px 16px 0 0" : "14px", bulkMax: isMob ? "100%" : "calc(100% - 40px)",
      hasToast: !!S.toast, toastText: S.toast ? S.toast.text : "", toastUndo: false, toastB: isMob ? (selN ? "96px" : "20px") : P.embedded ? "76px" : "104px",
      undo: () => {},
      hasDrawer: !!drS, dr, drawerW: isMob ? "100%" : "460px", closeDrawer: () => this.setState({ drawer: null, dd: {} }),
      classOpts: D.classes, centreOpts: D.centres,
      hasDialog: !!S.dialog, dl, closeDialog: () => this.setState({ dialog: null }),
    });
  }
  render() { return StudentDirectoryView(this.renderVals()); }
}

Object.assign(window, { Sd3Directory });
