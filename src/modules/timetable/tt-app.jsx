/* ============================================================================
   Timetable Maker v5 — the page (/timetable).

   One component owns the document ({ s, entries, ex }), its undo history,
   where it is kept (this browser, an NGG account, an emailed link), which
   layers are open, and the clock. The trees in tt-views.jsx and the layers in
   tt-layers.jsx only draw what this hands them and call its actions back.

   Three things here are easy to get wrong and each was wrong once:
   - The markup is chosen by the CONTAINER's width, measured with a
     ResizeObserver on the page root — never window.innerWidth (§3.1).
   - Every layer pushes one history entry, so the phone's Back button closes
     the top one; closing through the UI pops it again and the popstate that
     causes is ignored, not treated as a second close (§7.12).
   - A save that fails keeps the timetable here and says so; nothing is lost
     waiting for a network (§7.9–7.11).
   ========================================================================== */

const TT_HISTORY_MAX = 60;
/* The order layers close in, top-most first (§3.5). `sync` is the official
   sync review, which opens from a note, so it sits with the dialogs. */
const TT_LAYER_ORDER = ["keys", "sync", "save", "download", "plan", "import", "form", "more", "fs"];
const TT_SAVE_RETRY = [2000, 5000, 15000];

function ttDocReducer(st, a) {
  if (a.type === "commit") {
    const next = a.fn(st.doc);
    if (!next || next === st.doc) return st;
    return { doc: next, past: st.past.concat([st.doc]).slice(-TT_HISTORY_MAX), future: [], rev: st.rev + 1 };
  }
  if (a.type === "undo") {
    if (!st.past.length) return st;
    return { doc: st.past[st.past.length - 1], past: st.past.slice(0, -1), future: [st.doc].concat(st.future), rev: st.rev + 1 };
  }
  if (a.type === "redo") {
    if (!st.future.length) return st;
    return { doc: st.future[0], past: st.past.concat([st.doc]), future: st.future.slice(1), rev: st.rev + 1 };
  }
  if (a.type === "load") return { doc: a.doc, past: [], future: [], rev: st.rev + (a.edit ? 1 : 0) };
  return st;
}

/** What this browser holds: the document plus how it is being kept. */
function ttReadLocal() {
  try {
    const v2 = localStorage.getItem(TT_STORE);
    if (v2) { const raw = JSON.parse(v2); return { doc: ttClean(raw), keep: raw.keep || null, from: "v2" }; }
    const v1 = localStorage.getItem(TT_STORE_V1);
    if (v1) { const raw = JSON.parse(v1); return { doc: ttFromV1(raw), keep: null, from: "v1" }; }
  } catch (_) { /* unreadable storage is an empty browser */ }
  return null;
}

/** Width and height of an element, kept current by a ResizeObserver. */
function ttUseSize(ref, on) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || on === false) return undefined;
    const read = () => setSize(p => (Math.abs(p.w - el.clientWidth) > 1 || Math.abs(p.h - el.clientHeight) > 1) ? { w: el.clientWidth, h: el.clientHeight } : p);
    read();
    if (!window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref.current, on]);
  return size;
}

/** A centre's published slots, as official entries. Instructors never come through (§3.7). */
function ttSlotsToEntries(res, member, startColour) {
  const name = res.centre || "";
  return (res.slots || []).map((x, i) => ({
    id: ttUid(), title: String(x.course || "").slice(0, 60), days: [+x.weekday], start: x.startTime, end: x.endTime,
    place: String(x.room || "").slice(0, 60), color: (startColour + i) % 8, kind: ttKindOf({ title: x.course }),
    official: true, source: name, mine: !!(member && member.track && String(x.course).toLowerCase() === String(member.track).toLowerCase()),
  })).filter(e => e.title && ttMin(e.start) !== null && ttMin(e.end) > ttMin(e.start) && e.days[0] >= 1 && e.days[0] <= 7);
}

/** Official entries from one centre against what it publishes now: what changed, by session. */
function ttOfficialDiff(local, fresh) {
  const key = e => e.title.toLowerCase() + "|" + e.days[0];
  const L = {}, F = {};
  local.forEach(e => { L[key(e)] = e; });
  fresh.forEach(e => { F[key(e)] = e; });
  const out = [];
  Object.keys(F).forEach(k => {
    const f = F[k], l = L[k];
    if (!l) out.push({ kind: "added", fresh: f });
    else if (l.start !== f.start || l.end !== f.end || (l.place || "") !== (f.place || "")) out.push({ kind: "changed", local: l, fresh: f });
  });
  Object.keys(L).forEach(k => { if (!F[k]) out.push({ kind: "removed", local: L[k] }); });
  return out;
}

function TimetableMakerPage({ setPage }) {
  const auth = (typeof useAuth === "function" ? useAuth() : null) || {};
  const member = auth.member || null;

  /* ── Where the page starts (§7.11's order) ── */
  const boot = React.useMemo(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams, hash = window.location.hash || "";
    const out = { ctx: "new", doc: null, sharedBy: "", keep: null, k: q.get("k") || "", mode: q.get("mode"), importTab: q.get("import"),
      signin: q.get("signin") === "1", centre: (q.get("centre") || "").replace(/[^a-z0-9-]/g, ""), local: ttReadLocal() };
    const t = /#t=([A-Za-z0-9_-]+)/.exec(hash);
    if (t) { const d = ttDecode(t[1]); if (d) { out.doc = d.doc; out.sharedBy = d.sharedBy; out.ctx = "shared"; } }
    if (!out.doc && out.local) { out.doc = out.local.doc; out.keep = out.local.keep; out.ctx = "local"; }
    if (!out.doc) out.doc = ttClean({ s: Object.assign({}, TT_DEFAULTS, { mode: null }), entries: [], ex: {} });
    if (out.ctx === "shared") out.doc.s.mode = out.doc.s.mode || "school";
    if (TT_MODES[out.mode]) out.doc.s.mode = out.mode;
    // The URL is read once; what it asked for now lives in state, and a refresh must not ask again.
    ["k", "mode", "import", "signin", "centre"].forEach(x => q.delete(x));
    try { window.history.replaceState(window.history.state, "", url.pathname + (q.toString() ? "?" + q : "")); } catch (_) {}
    return out;
  }, []);

  const [D, dispatch] = React.useReducer(ttDocReducer, { doc: boot.doc, past: [], future: [], rev: boot.ctx === "shared" ? 1 : 0 });
  const doc = D.doc, s = doc.s;

  /* ── Where it is kept: { mode: null|'account'|'email', k, email, base } ── */
  const [keep, setKeep] = React.useState(boot.keep || null);
  const [saveState, setSaveState] = React.useState({ status: "idle", savedRev: D.rev, error: "" });
  const [online, setOnline] = React.useState(typeof navigator === "undefined" || navigator.onLine !== false);
  const [note, setNote] = React.useState(boot.ctx === "shared" ? { kind: "shared", by: boot.sharedBy } : null);
  const [sync, setSync] = React.useState(null);      // { source, changes } — official sessions that moved
  const [hadAmPm, setHadAmPm] = React.useState(false);
  const [term, setTerm] = React.useState(null);

  /* ── UI ── */
  const rootRef = React.useRef(null);
  const size = ttUseSize(rootRef);
  const W = size.w || (typeof window !== "undefined" ? window.innerWidth : 1280), H = size.h || 800;
  const bp = W < 600 ? "phone" : W < 840 ? "tablet" : W < 1200 ? "desk2" : "desk3";
  const [week, setWeek] = React.useState(0);
  const [day, setDay] = React.useState(null);        // null = auto, 'week', or 1..7
  const [pane, setPane] = React.useState("classes");
  const [layers, setLayers] = React.useState({ fs: null, more: null, form: null, import: boot.importTab ? { tab: boot.importTab } : null, plan: null, download: null, save: null, keys: null, sync: null });
  const [popover, setPopover] = React.useState(false);
  const [suggOff, setSuggOff] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [qaFocus, setQaFocus] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const qaRef = React.useRef(null);
  const toastT = React.useRef(null);

  // Now/next is recomputed every minute, not only when something renders (§7.14).
  React.useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  React.useEffect(() => { ttEnsureFonts(); }, []);
  React.useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  // The calendar file's default dates are this term's, from the server — never typed in (§10).
  React.useEffect(() => {
    let live = true;
    if (NGGApi.public && NGGApi.public.session) NGGApi.public.session().then(r => { if (live && r && r.term && r.term.start) setTerm(r.term); }).catch(() => {});
    return () => { live = false; };
  }, []);

  /* ── Toasts (§7.12): Undo ones last 6.5s, the rest 5s; hidden while a layer is open ── */
  const say = React.useCallback((text, undo) => {
    clearTimeout(toastT.current);
    setToast({ text, undo: !!undo, id: Date.now() });
    toastT.current = setTimeout(() => setToast(null), undo ? 6500 : 5000);
  }, []);
  const failed = React.useCallback(() => {
    if (window.toast && window.toast.error) window.toast.error("That didn’t work, try again.", "Download failed");
    else say("That didn’t work, try again.");
  }, [say]);

  /* ── The document ── */
  const commit = React.useCallback((fn, msg, undoable) => { dispatch({ type: "commit", fn }); if (msg) say(msg, undoable); }, [say]);
  const setS = React.useCallback((k, v) => commit(d => d.s[k] === v ? d : Object.assign({}, d, { s: Object.assign({}, d.s, { [k]: v }) })), [commit]);
  const undo = React.useCallback(() => dispatch({ type: "undo" }), []);
  const redo = React.useCallback(() => dispatch({ type: "redo" }), []);

  // Always kept in this browser, 300ms after the last change (§7.11).
  React.useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(TT_STORE, JSON.stringify({ s: doc.s, entries: doc.entries, ex: doc.ex, keep: keep && Object.assign({}, keep, { pending: D.rev !== saveState.savedRev }) })); } catch (_) {}
    }, 300);
    return () => clearTimeout(id);
  }, [doc, keep, D.rev, saveState.savedRev]);

  /* ── Loading what the URL or the account holds ── */
  React.useEffect(() => {
    if (!boot.k) return;
    NGGApi.public.timetableLoad(boot.k).then(r => {
      if (!r || !r.timetable) return;
      dispatch({ type: "load", doc: ttClean({ s: r.timetable.settings, entries: r.timetable.entries, ex: r.timetable.exceptions }) });
      setKeep({ mode: "email", k: boot.k, email: r.email || "", base: r.timetable.updatedAt || "" });
      setSaveState(p => Object.assign({}, p, { status: "saved", savedRev: D.rev }));
    }).catch(() => say("That link has expired. This is the copy in this browser."));
    // eslint-disable-next-line
  }, []);
  const accountLoaded = React.useRef(false);
  React.useEffect(() => {
    if (!member || accountLoaded.current || boot.ctx === "shared" || boot.k) return;
    accountLoaded.current = true;
    NGGApi.member.myTimetable().then(r => {
      const t = r && r.timetable;
      if (!t) return;
      const pending = boot.keep && boot.keep.mode === "account" && boot.keep.pending;
      setKeep({ mode: "account", base: t.updatedAt || "" });
      if (pending) return; // edits made here while offline win; the autosave sends them
      dispatch({ type: "load", doc: ttClean({ s: t.settings, entries: t.entries, ex: t.exceptions }) });
      setSaveState(p => Object.assign({}, p, { status: "saved", savedRev: D.rev }));
    }).catch(() => {});
    // eslint-disable-next-line
  }, [member]);

  /* ?centre= : that centre's official sessions in, the visitor's own kept (§7.7). */
  const addCentre = React.useCallback(async (slug, quiet) => {
    const r = await NGGApi.public.timetable(slug);
    const fresh = ttSlotsToEntries(r, member, 0);
    if (!fresh.length) throw new Error("empty");
    const name = r.centre || fresh[0].source;
    commit(d => {
      const blank = !d.entries.length;
      const own = d.entries.filter(x => !x.official);
      const recoloured = fresh.map((e, i) => Object.assign(e, { color: (own.length + i) % 8 }));
      return Object.assign({}, d, { entries: own.concat(recoloured), s: blank ? Object.assign({}, d.s, { title: name + " timetable", mode: d.s.mode || "school", legend: d.s.legend }) : d.s });
    }, quiet ? null : "Added " + fresh.length + " sessions from " + name, !quiet);
    setDay(null);
    return name;
  }, [commit, member]);
  React.useEffect(() => {
    if (!boot.centre) return;
    addCentre(boot.centre, true).then(name => setNote({ kind: "centre", centre: name })).catch(() => setLayers(l => Object.assign({}, l, { import: { tab: "centre", slug: boot.centre, failed: true } })));
    // eslint-disable-next-line
  }, []);

  /* Official sync (§7.9): a centre that changed a session is reported, never applied silently. */
  React.useEffect(() => {
    const sources = [...new Set(doc.entries.filter(e => e.official && e.source).map(e => e.source))];
    if (!sources.length || boot.ctx === "shared") return undefined;
    let live = true;
    NGGApi.public.timetable("").then(async list => {
      for (const src of sources) {
        const c = (list.centres || []).find(x => x.name.toLowerCase() === src.toLowerCase());
        if (!c) continue;
        const r = await NGGApi.public.timetable(c.slug);
        const changes = ttOfficialDiff(doc.entries.filter(e => e.official && e.source === src), ttSlotsToEntries(r, member, 0));
        const seen = (() => { try { return localStorage.getItem("ngg.timetable.sync." + c.slug); } catch (_) { return null; } })();
        const sig = JSON.stringify(changes.map(x => [x.kind, (x.fresh || x.local).title, (x.fresh || x.local).days[0], x.fresh && x.fresh.start]));
        if (live && changes.length && sig !== seen) { setSync({ source: src, slug: c.slug, changes, sig }); break; }
      }
    }).catch(() => {});
    return () => { live = false; };
    // Checked once per load, as the spec says: on the next load, not on every edit.
    // eslint-disable-next-line
  }, [keep && keep.mode, member && member.memberId]);

  /* ── Saving (§7.9–7.11) ── */
  const body = React.useCallback(d => ({ settings: d.s, entries: d.entries, exceptions: d.ex }), []);
  const saving = React.useRef(false);
  const retryN = React.useRef(0);
  const saveNow = React.useCallback(async (force) => {
    if (!keep || !keep.mode || saving.current) return;
    if (!navigator.onLine) { setOnline(false); return; }
    saving.current = true;
    const rev = D.rev;
    setSaveState(p => Object.assign({}, p, { status: "saving", error: "" }));
    try {
      let r;
      if (keep.mode === "account") r = await NGGApi.member.saveMyTimetable(Object.assign(body(D.doc), { baseUpdatedAt: force ? (force.base || "") : (keep.base || "") }));
      else r = await NGGApi.public.timetableSave(Object.assign(body(D.doc), { k: keep.k }));
      setKeep(k => Object.assign({}, k, { base: (r && r.updatedAt) || k.base }));
      setSaveState({ status: "saved", savedRev: rev, error: "" });
      retryN.current = 0;
    } catch (e) {
      const conflict = e && (e.code === "conflict" || e.status === 409);
      setSaveState(p => Object.assign({}, p, { status: "error", error: conflict ? "conflict" : (e && e.code) || "failed", server: conflict && e.data ? e.data.server : null }));
    } finally { saving.current = false; }
  }, [keep, D.rev, D.doc, body]);
  // Autosave: 900ms after the last change, once a way of keeping it is chosen.
  React.useEffect(() => {
    if (!keep || !keep.mode || D.rev === saveState.savedRev || saveState.status === "error") return undefined;
    if (!online) return undefined;
    const id = setTimeout(() => saveNow(), 900);
    return () => clearTimeout(id);
  }, [D.rev, keep, online, saveState.savedRev, saveState.status, saveNow]);
  // A failed save retries itself at 2s, 5s and 15s, then waits for Retry.
  React.useEffect(() => {
    if (saveState.status !== "error" || saveState.error === "conflict" || retryN.current >= TT_SAVE_RETRY.length) return undefined;
    const id = setTimeout(() => { retryN.current++; setSaveState(p => Object.assign({}, p, { status: "idle" })); }, TT_SAVE_RETRY[retryN.current]);
    return () => clearTimeout(id);
  }, [saveState.status, saveState.error]);
  const retrySave = React.useCallback(() => {
    retryN.current = 0;
    // A conflict's Retry is the visitor choosing this copy over the other one.
    if (saveState.error === "conflict" && saveState.server) { const base = saveState.server.updatedAt || ""; setKeep(k => Object.assign({}, k, { base })); saveNow({ base }); return; }
    setSaveState(p => Object.assign({}, p, { status: "idle", error: "" }));
  }, [saveState, saveNow]);

  const firstName = member ? (member.firstName || String(member.fullName || "").split(" ")[0] || "your") : "";
  const dirty = D.rev !== saveState.savedRev;
  const saveInfo = (() => {
    const owner = firstName ? firstName + "’s" : "your";
    if (keep && keep.mode && saveState.status === "error") return { state: "failed", status: "Couldn’t save. Changes are kept here.", label: "Retry", icon: "warning-circle", tone: "error" };
    if (keep && keep.mode === "account") return (saveState.status === "saving" || dirty)
      ? { state: "saving", status: "Saving to " + owner + " account…", label: "Saving…", icon: "cloud-arrow-up", tone: "soft" }
      : { state: "saved", status: "Saved to " + owner + " NGG account", label: "Saved to account", icon: "check-circle", tone: "ok" };
    if (keep && keep.mode === "email") return (saveState.status === "saving" || dirty)
      ? { state: "saving", status: "Saving…", label: "Saving…", icon: "cloud-arrow-up", tone: "soft" }
      : { state: "saved", status: "Saved · link sent to " + (keep.email || "your email"), label: "Saved", icon: "check-circle", tone: "ok" };
    if (member) return { state: "unsaved", status: "Not in your account yet · tap the cloud", label: "Save to my account", icon: "cloud-arrow-up", tone: "gold" };
    return { state: "unsaved", status: boot.ctx === "shared" && D.rev <= 1 ? "Your copy · only in this browser" : "Only in this browser · tap the cloud to keep it", label: "Save", icon: "cloud-arrow-up", tone: "gold" };
  })();

  /* ── Layers and the Back button (§7.12) ── */
  const openCount = TT_LAYER_ORDER.filter(k => layers[k]).length;
  const prevCount = React.useRef(openCount);
  const ignorePops = React.useRef(0);
  const popping = React.useRef(false);
  React.useEffect(() => {
    const a = prevCount.current, b = openCount;
    prevCount.current = b;
    try {
      if (b > a) for (let i = a; i < b; i++) window.history.pushState(Object.assign({}, window.history.state, { ttLayer: i + 1 }), "");
      else if (b < a && !popping.current) { ignorePops.current += a - b; window.history.go(b - a); }
    } catch (_) {}
    popping.current = false;
  }, [openCount]);
  const open = React.useCallback((name, payload) => { setPopover(false); setLayers(l => Object.assign({}, l, { [name]: payload || {} })); }, []);
  const close = React.useCallback(name => setLayers(l => l[name] ? Object.assign({}, l, { [name]: null }) : l), []);
  const swap = React.useCallback((from, to, payload) => setLayers(l => Object.assign({}, l, { [from]: null, [to]: payload || {} })), []);
  const closeTop = React.useCallback(() => {
    setLayers(l => { const k = TT_LAYER_ORDER.find(x => l[x]); return k ? Object.assign({}, l, { [k]: null }) : l; });
  }, []);
  React.useEffect(() => {
    const onPop = () => {
      if (ignorePops.current > 0) { ignorePops.current--; return; }
      if (TT_LAYER_ORDER.some(k => layers[k])) { popping.current = true; closeTop(); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [layers, closeTop]);
  // A layer left open when the page goes away must not leave history entries behind.
  React.useEffect(() => () => { if (prevCount.current > 0) { try { window.history.go(-prevCount.current); } catch (_) {} } }, []);

  /* ── The class form ── */
  const T = { day: now.getDay() || 7, mins: now.getHours() * 60 + now.getMinutes() };
  const openForm = React.useCallback((init, ctx) => {
    const mode = TT_MODES[s.mode] || TT_MODES.school;
    let base = {};
    if (!(init && init.id)) {
      const d = (init && init.days && init.days[0]) || (ctx && ctx.day) || T.day;
      const st = ttFreeSlot(doc.entries, d, mode.len, 8 * 60, 22 * 60);
      const s0 = st === null ? 9 * 60 : st;
      base = { id: "", title: "", days: [d], start: ttHhmm(s0), end: ttHhmm(s0 + mode.len), place: "", color: doc.entries.length % 8, kind: "class", once: false };
    }
    if (qaRef.current) qaRef.current.value = qaRef.current.value; // keep what was typed
    open("form", Object.assign(base, init || {}, { ctxDay: ctx ? ctx.day : null, ctxOff: ctx ? ctx.off : week }));
  }, [s.mode, doc.entries, T.day, week, open]);

  const addEntry = React.useCallback((e, off) => {
    const o = off === undefined ? week : off;
    if (e.once) {
      const one = Object.assign({}, e, { id: e.id || ttUid(), days: [e.days[0]], once: true });
      commit(d => Object.assign({}, d, { ex: ttWithWeek(d.ex, o, x => { x.once = x.once.filter(y => y.id !== one.id).concat([one]); return x; }, now) }),
        "Added " + one.title + " · " + ttDshort(ttDateFor(one.days[0], o, now)).replace(",", "") + " only", true);
      return;
    }
    const n = Object.assign({}, e, { id: e.id || ttUid() });
    delete n.once;
    commit(d => Object.assign({}, d, { entries: d.entries.some(x => x.id === n.id) ? d.entries.map(x => x.id === n.id ? n : x) : d.entries.concat([n]) }),
      "Added " + n.title + " · " + n.days.map(x => TT_DAYS[x - 1][2]).join(" ") + " " + ttFmt(ttMin(n.start), s.clock), true);
  }, [commit, week, now, s.clock]);

  /** The form's submit. Returns the error to show, or "" when it went through. */
  const saveForm = React.useCallback(f => {
    const a = ttMin(f.start), b = ttMin(f.end);
    const err = !f.title.trim() ? "Give it a name." : !f.days.length ? "Pick at least one day." : a === null || b === null ? "Times look like 09:00 or 14:30." : b <= a ? "It has to end after it starts." : "";
    if (err) return err;
    const e = { id: f.id || "", title: f.title.trim().slice(0, 60), days: f.days.slice().sort((x, y) => x - y), start: f.start, end: f.end, place: f.place.trim().slice(0, 60), color: f.color, kind: f.kind || ttKindOf(f) };
    if (f.official) { e.official = true; e.source = f.source; e.mine = !!f.mine; }
    const off = f.ctxOff || 0;
    close("form");
    if (f.origOnce && f.once) {
      commit(d => Object.assign({}, d, { ex: ttWithWeek(d.ex, off, x => { x.once = x.once.map(y => y.id === f.id ? Object.assign({}, e, { days: [e.days[0]], once: true }) : y); return x; }, now) }), "Saved " + e.title);
      return "";
    }
    if (f.origOnce && !f.once) {
      // A one-off made weekly leaves that week's list and joins the timetable, in one undoable step.
      const n = Object.assign({}, e, { id: ttUid() });
      commit(d => Object.assign({}, d, { entries: d.entries.concat([n]), ex: ttWithWeek(d.ex, off, x => { x.once = x.once.filter(y => y.id !== f.id); return x; }, now) }), "Saved " + e.title);
      return "";
    }
    if (f.id) { commit(d => Object.assign({}, d, { entries: d.entries.map(x => x.id === f.id ? Object.assign({}, e) : x) }), "Saved " + e.title); return ""; }
    addEntry(Object.assign(e, { once: !!f.once }), off);
    return "";
  }, [close, commit, addEntry, now]);

  const removeEntry = React.useCallback(f => {
    close("form");
    if (f.origOnce) commit(d => Object.assign({}, d, { ex: ttWithWeek(d.ex, f.ctxOff || 0, x => { x.once = x.once.filter(y => y.id !== f.id); return x; }, now) }), "Removed " + f.title, true);
    else commit(d => Object.assign({}, d, { entries: d.entries.filter(x => x.id !== f.id) }), "Removed " + f.title, true);
  }, [close, commit, now]);

  const toggleSkip = React.useCallback((e, d, off) => {
    const k = e.id + ":" + d, was = !!ttWeekEx(doc.ex, off, now).skip[k];
    close("form");
    commit(x => Object.assign({}, x, { ex: ttWithWeek(x.ex, off, w => { if (was) delete w.skip[k]; else w.skip[k] = true; return w; }, now) }),
      was ? e.title + " is back on" : e.title + " is off " + ttDshort(ttDateFor(d, off, now)).replace(",", ""), !was);
  }, [doc.ex, now, close, commit]);

  const runFix = React.useCallback((e, d) => {
    const fx = ttFixFor(doc.entries, e, d);
    if (!fx) return;
    commit(x => Object.assign({}, x, { entries: fx.apply(x.entries, ttUid()) }),
      "Moved " + e.title + " to " + ttFmt(fx.start, s.clock) + (e.days.length > 1 ? " on " + TT_DAYS[d - 1][1] + "s" : ""), true);
  }, [doc.entries, commit, s.clock]);

  const setMode = React.useCallback(k => {
    commit(d => Object.assign({}, d, { s: Object.assign({}, d.s, { mode: k, title: d.s.title === "My week" ? TT_MODES[k].title : d.s.title }) }));
    if (k === "revision") open("plan");
    else setTimeout(() => qaRef.current && qaRef.current.focus(), 80);
  }, [commit, open]);

  /* ── Exports (§7.8). Every file is drawn from the full-size poster node. ── */
  const [job, setJob] = React.useState(null);
  const hostRef = React.useRef(null);
  const jobDone = React.useRef(null);
  React.useEffect(() => {
    if (!job) return;
    let alive = true;
    (async () => {
      try {
        await ttFontsReady(s.look);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!alive || !hostRef.current) return;
        jobDone.current.resolve(hostRef.current);
      } catch (err) { jobDone.current.reject(err); }
    })();
    return () => { alive = false; };
  }, [job]);
  const drawNode = React.useCallback(model => new Promise((resolve, reject) => { jobDone.current = { resolve, reject }; setJob({ model, id: Date.now() }); }), []);
  const fileName = ttSlug(s.title);
  const shareLink = React.useCallback(() => window.location.origin + "/timetable#t=" + ttEncode(doc, member ? (member.fullName || "") : ""), [doc, member]);

  const exportFile = React.useCallback(async (k, o) => {
    try {
      if (k === "ics") {
        if (!doc.entries.length) { say("Add a class first"); return false; }
        ttDownloadBlob(new Blob([ttIcs(doc, { from: o.icsFrom, until: o.icsUntil, remind: o.remind })], { type: "text/calendar;charset=utf-8" }), fileName + ".ics");
        say("Downloaded " + fileName + ".ics · open it to add to your calendar");
        return true;
      }
      if (k === "link") {
        const u = shareLink();
        if (bp === "phone" && navigator.share) { await navigator.share({ title: s.title, url: u }).catch(() => {}); return true; }
        try { await navigator.clipboard.writeText(u); say("Link copied"); } catch (_) { say("Select the link to copy it"); }
        return false;
      }
      const model = ttPosterModel(doc, { kind: k === "pdf" ? "poster" : k, orient: s.orient, paper: o.paper, today: false, live: false, wall: o.wall, now });
      const node = await drawNode(model);
      if (k === "pdf") { await ttPrintPdf(node, model, o.paper, fileName); setJob(null); return true; }
      const h2c = await loadVendor("html2canvas");
      const canvas = await h2c(node, { scale: k === "phone" ? 1 : 2, backgroundColor: null, useCORS: true, logging: false, width: model.w, height: model.h, windowWidth: model.w, windowHeight: model.h });
      setJob(null);
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      const name = fileName + (k === "phone" ? "-wallpaper" : "") + ".png";
      if (k === "share" && bp === "phone" && navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: "image/png" })] })) {
        await navigator.share({ files: [new File([blob], name, { type: "image/png" })], title: s.title }).catch(() => {});
        return true;
      }
      ttDownloadBlob(blob, name);
      say(k === "phone" ? "Downloaded wallpaper · set it from your Photos app" : "Downloaded " + name);
      return true;
    } catch (err) {
      setJob(null);
      failed();
      return false;
    }
  }, [doc, s.orient, s.title, now, drawNode, fileName, shareLink, say, failed, bp]);

  /* ── Keyboard (§7.12) ── */
  const anyLayer = openCount > 0;
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") {
        if (anyLayer) { e.preventDefault(); closeTop(); return; }
        if (popover) { setPopover(false); return; }
        return;
      }
      const t = e.target;
      const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (e.ctrlKey || e.metaKey) {
        if (typing) return;
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
        else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
        return;
      }
      if (typing || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); open("keys"); return; }
      const busy = TT_LAYER_ORDER.some(k => k !== "fs" && layers[k]);
      if (busy) return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); if (layers.fs) close("fs"); else open("fs"); return; }
      if (layers.fs) return;
      if (e.key === "/") { e.preventDefault(); if (bp === "tablet") setPane("classes"); setTimeout(() => qaRef.current && qaRef.current.focus(), 0); return; }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); openForm(); return; }
      if (e.key === "d" || e.key === "D") { e.preventDefault(); open("download", { format: "pdf", step: "detail" }); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [anyLayer, popover, layers, closeTop, undo, redo, open, close, openForm, bp]);

  /* ── Everything the trees and layers read ── */
  const C = {
    setPage, setPageHome: setPage ? () => setPage("home") : null,
    doc, s, entries: doc.entries, ex: doc.ex, now, T, bp, W, H, week, setWeek, day, setDay, pane, setPane, member, firstName,
    canUndo: D.past.length > 0, canRedo: D.future.length > 0, undo, redo, commit, setS, say, setMode,
    layers, open, close, swap, popover, setPopover, openForm, addEntry, saveForm, removeEntry, toggleSkip, runFix,
    qaFocus, setQaFocus, suggOff, setSuggOff, hadAmPm, setHadAmPm, term, note, dismissNote: () => setNote(null), sync, online,
    keep, saveInfo, retrySave, qaRef, addCentre, exportFile, shareLink, fileName,
    startSave: () => {
      if (saveInfo.state === "failed") { retrySave(); return; }
      if (keep && keep.mode) { say(saveInfo.status); return; }
      open("save", { step: member ? "confirm" : "choose", who: boot.signin ? "member" : "member" });
    },
    keepInAccount: async () => {
      let base = "";
      try { const r = await NGGApi.member.myTimetable(); base = (r && r.timetable && r.timetable.updatedAt) || ""; } catch (_) {}
      setKeep({ mode: "account", base });
      setSaveState(p => Object.assign({}, p, { status: "idle", savedRev: -1 }));
    },
    keepByEmail: async email => {
      const r = await NGGApi.public.timetableSave(Object.assign(body(doc), { email }));
      setKeep({ mode: "email", k: r.k || "", email, base: r.updatedAt || "" });
      setSaveState({ status: "saved", savedRev: D.rev, error: "" });
    },
    refreshAuth: auth.refresh,
    reviewSync: () => open("sync"),
    applySync: (accepted) => {
      if (!sync) return;
      try { localStorage.setItem("ngg.timetable.sync." + sync.slug, sync.sig); } catch (_) {}
      if (accepted.length) commit(d => {
        let list = d.entries.slice();
        accepted.forEach(c => {
          if (c.kind === "removed") list = list.filter(x => x.id !== c.local.id);
          else if (c.kind === "changed") list = list.map(x => x.id === c.local.id ? Object.assign({}, x, { start: c.fresh.start, end: c.fresh.end, place: c.fresh.place }) : x);
          else list = list.concat([Object.assign({}, c.fresh, { color: list.length % 8 })]);
        });
        return Object.assign({}, d, { entries: list });
      }, "Updated " + accepted.length + " session" + (accepted.length === 1 ? "" : "s") + " from " + sync.source, true);
      setSync(null); close("sync");
    },
  };

  const isPhone = bp === "phone";
  const toastBottom = isPhone ? "tt-toast--phone" : "tt-toast--wide";
  return (
    <div ref={rootRef} className={"tt-app tt-app--" + bp + (H < 480 ? " is-short" : "")}>
      {isPhone ? <TtPhone C={C}/> : <TtWide C={C}/>}
      <TtLayers C={C}/>
      <div className="tt-live" role="status" aria-live="polite">
        {toast && !anyLayer && (
          <div key={toast.id} className={"tt-toast " + toastBottom + (C.qaFocus ? " is-lifted" : "")}>
            <TtIcon name="check-circle" className="tt-toast-icon"/>
            <span>{toast.text}</span>
            {toast.undo && <button type="button" className="tt-toast-undo" onClick={() => { clearTimeout(toastT.current); setToast(null); undo(); }}>Undo</button>}
          </div>
        )}
      </div>
      <div className="tt-export-host" aria-hidden="true">{job && <TimetablePoster model={job.model} nodeRef={hostRef}/>}</div>
    </div>
  );
}

function ttDownloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/**
 * The PDF, with real text (§7.8): the full-size poster node copied into a
 * hidden frame whose @page is the paper, scaled to fill it, and printed — the
 * browser's own print-to-PDF keeps every word selectable and searchable.
 * The frame's title is the file's name, which is what the save dialog offers.
 */
async function ttPrintPdf(node, model, paper, name) {
  const mm = paper === "letter" ? [279.4, 215.9] : [297, 210];
  const portrait = model.h > model.w;
  const [pw, ph] = portrait ? [mm[1], mm[0]] : mm;
  const pxW = pw / 25.4 * 96;
  const scale = pxW / model.w;
  const frame = document.createElement("iframe");
  frame.className = "tt-print-frame";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const d = frame.contentDocument;
  const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => '<link rel="stylesheet" href="' + l.href + '">').join("");
  d.open();
  d.write("<!doctype html><html><head><meta charset='utf-8'><title>" + name.replace(/[<&]/g, "") + "</title>" + sheets +
    "<style>@page{size:" + pw + "mm " + ph + "mm;margin:0}html,body{margin:0;padding:0;background:#fff}" +
    ".tt-print-page{width:" + pw + "mm;height:" + ph + "mm;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    ".tt-print-page>.tt-pos{transform:scale(" + scale + ");transform-origin:top left}</style></head><body><div class='tt-print-page'></div></body></html>");
  d.close();
  d.querySelector(".tt-print-page").appendChild(d.importNode(node, true));
  await new Promise(r => { if (d.readyState === "complete") r(); else frame.onload = r; setTimeout(r, 1500); });
  try { await d.fonts.ready; } catch (_) {}
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60000);
}
