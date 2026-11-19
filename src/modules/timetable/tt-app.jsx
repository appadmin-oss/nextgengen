/* ============================================================================
   Timetable Maker v5 — the page (/timetable).

   One component owns the document ({ s, entries, ex }) and its undo history,
   where the document is kept (this browser, an NGG account, an emailed link),
   which layers are open, and the clock. The trees in tt-views.jsx and the
   layers in tt-layers.jsx only draw what this hands them and call its actions.

   Three things here are easy to get wrong, and each has been:
   - The markup is chosen by the ROOT's measured width (a ResizeObserver),
     never window.innerWidth (§3.1).
   - Every layer pushes one history entry so the phone's Back closes the top
     one; a layer closed from the UI pops its entry, and the popstate that
     causes is ignored rather than read as a second close (§7.12).
   - A save that fails keeps everything here and says so; nothing waits on the
     network to be kept (§7.9–7.11).
   ========================================================================== */

/* The URL as the page was opened, read before React mounts. "?signin=1" asks
   the maker to open on its Save dialog; it is taken out of the address here,
   before anything else on the site can read it as a sign-in link's token. */
const TT_BOOT_URL = (function () {
  if (typeof window === "undefined") return { search: "", hash: "" };
  const at = { search: window.location.search, hash: window.location.hash };
  if (/^\/timetable\/?$/.test(window.location.pathname) && /[?&]signin=1(&|$)/.test(at.search)) {
    const u = new URL(window.location.href);
    u.searchParams.delete("signin");
    try { window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash); } catch (_) {}
  }
  return at;
})();

const TT_HISTORY_MAX = 60;
/* Layers in the order they close, top-most first (§3.5). The official-sync
   review opens from a note, so it sits with the other dialogs. */
const TT_LAYER_ORDER = ["keys", "sync", "save", "download", "plan", "import", "form", "more", "fs"];
const TT_SAVE_RETRY = [2000, 5000, 15000];

/** The document and its history. `rev` counts edits; saving compares it, never the document. */
function ttDocReducer(st, a) {
  if (a.type === "commit") {
    const next = a.fn(st.doc);
    if (!next || next === st.doc) return st;
    return { doc: next, past: st.past.concat([st.doc]).slice(-TT_HISTORY_MAX), future: [], rev: st.rev + 1 };
  }
  if (a.type === "undo" && st.past.length) return { doc: st.past[st.past.length - 1], past: st.past.slice(0, -1), future: [st.doc].concat(st.future), rev: st.rev + 1 };
  if (a.type === "redo" && st.future.length) return { doc: st.future[0], past: st.past.concat([st.doc]), future: st.future.slice(1), rev: st.rev + 1 };
  if (a.type === "load") return { doc: a.doc, past: [], future: [], rev: st.rev + 1, loadedAt: st.rev + 1 };
  return st;
}

/** What this browser holds (§7.11): v2, else v1 read once and migrated, else nothing. */
function ttReadLocal() {
  try {
    const v2 = localStorage.getItem(TT_STORE);
    if (v2) { const raw = JSON.parse(v2); return { doc: ttClean(raw), keep: raw.keep && raw.keep.mode ? raw.keep : null }; }
    const v1 = localStorage.getItem(TT_STORE_V1);
    if (v1) return { doc: ttFromV1(JSON.parse(v1)), keep: null };
  } catch (_) { /* unreadable storage is an empty browser */ }
  return null;
}

/** A centre's published slots as official entries. The public op carries no instructors (§3.7). */
function ttSlotsToEntries(res, member) {
  const track = member && member.track ? String(member.track).toLowerCase() : "";
  return (res.slots || []).map((x, i) => ({
    id: ttUid(), title: String(x.course || "").slice(0, 60), days: [+x.weekday], start: x.startTime, end: x.endTime,
    place: String(x.room || "").slice(0, 60), color: i % 8, kind: ttKindOf({ title: x.course }),
    official: true, source: res.centre || "", mine: typeof x.mine === "boolean" ? x.mine : !!track && String(x.course).toLowerCase() === track,
  })).filter(e => e.title && e.days[0] >= 1 && e.days[0] <= 7 && ttMin(e.start) !== null && ttMin(e.end) > ttMin(e.start));
}

/** One centre session's identity in the import dialog's choice: course, day and start. */
function ttSlotKey(e) { return e.title.toLowerCase() + "|" + e.days[0] + "|" + e.start; }

/** A centre's official entries against what it publishes now: what was added, changed or removed, by course and day. */
function ttOfficialDiff(local, fresh) {
  const key = e => e.title.toLowerCase() + "|" + e.days[0];
  const L = {}, F = {}, out = [];
  local.forEach(e => { L[key(e)] = e; });
  fresh.forEach(e => { F[key(e)] = e; });
  Object.keys(F).forEach(k => {
    const f = F[k], l = L[k];
    if (!l) out.push({ kind: "added", fresh: f });
    else if (l.start !== f.start || l.end !== f.end || (l.place || "") !== (f.place || "")) out.push({ kind: "changed", local: l, fresh: f });
  });
  Object.keys(L).forEach(k => { if (!F[k]) out.push({ kind: "removed", local: L[k] }); });
  return out;
}

function ttDownloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/**
 * The PDF with real text (§7.8): the full-size poster node copied into a
 * hidden frame whose @page is the paper, scaled to fill it, and printed — the
 * browser's own print-to-PDF keeps every word selectable and searchable. The
 * frame's title is the file's name, which is what the save dialog offers.
 */
async function ttPrintPdf(node, model, paper, name) {
  const mm = paper === "letter" ? [279.4, 215.9] : [297, 210];
  const [pw, ph] = model.h > model.w ? [mm[1], mm[0]] : mm;
  const scale = (pw / 25.4 * 96) / model.w;
  const frame = document.createElement("iframe");
  frame.className = "tt-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  document.body.appendChild(frame);
  const d = frame.contentDocument;
  const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => '<link rel="stylesheet" href="' + l.href + '">').join("");
  d.open();
  d.write("<!doctype html><html><head><meta charset='utf-8'><title>" + name.replace(/[<&]/g, "") + "</title>" + sheets
    + "<style>@page{size:" + pw + "mm " + ph + "mm;margin:0}html,body{margin:0;padding:0}"
    + ".tt-print-page{width:" + pw + "mm;height:" + ph + "mm;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}"
    + ".tt-print-page>.tt-pos{transform:scale(" + scale + ");transform-origin:top left}</style></head><body><div class='tt-print-page'></div></body></html>");
  d.close();
  d.querySelector(".tt-print-page").appendChild(d.importNode(node, true));
  await new Promise(r => { if (d.readyState === "complete") r(); else frame.onload = r; setTimeout(r, 1500); });
  try { await d.fonts.ready; } catch (_) {}
  const back = document.activeElement;
  frame.contentWindow.focus();
  frame.contentWindow.print();
  // print() returns once the dialog is dismissed. Focus is still inside the
  // frame, where no shortcut and no Tab order reaches: hand it back to the page.
  window.focus();
  if (back && back.isConnected && typeof back.focus === "function") back.focus();
  setTimeout(() => frame.remove(), 60000);
}

/**
 * Is this somebody arriving at a bare /timetable for the first time (LANDING.md §1)?
 * Then they are shown the landing instead. Anything that says what they came to
 * do opens the maker: a link (#t=, ?k=), a mode, an import, a sign-in, a centre,
 * a timetable already in this browser, or having just come from the landing —
 * whose "Make my timetable" is a plain link to /timetable, and must not bounce.
 * Only ever true AT /timetable: the SPA also resolves /timetable/about to this
 * page when the static file is not there (offline, a dev server), and a
 * redirect from it to itself would never end.
 */
function ttFirstVisit() {
  if (!/^\/timetable\/?$/.test(window.location.pathname)) return false;
  if (/#t=/.test(TT_BOOT_URL.hash)) return false;
  const q = new URLSearchParams(TT_BOOT_URL.search);
  if (["k", "mode", "import", "signin", "centre", "easy", "full"].some(k => q.has(k))) return false;
  try { if (localStorage.getItem(TT_STORE) || localStorage.getItem(TT_STORE_V1)) return false; } catch (_) { return false; }
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.origin === window.location.origin && /^\/timetable(\/about\/?|-about\.html)$/.test(r.pathname)) return false;
  } catch (_) {}
  return true;
}

/**
 * The route. Decides between the landing and the maker BEFORE the maker
 * mounts, because the maker keeps a copy in this browser within 300ms of
 * opening — and a first visit that wrote one would never be a first visit
 * again. A signed-in member with a saved personal timetable is not new here.
 * The landing is never a gate: if the check cannot be made, the maker opens.
 */
function TimetableMakerPage({ setPage }) {
  /* Personal timetable first (owner, 19 Nov 2026): a child makes their week in the guided "My week"
     (tt-myweek.jsx). ?easy=1 opens it; ?full=1 is the full maker; a signed-in member with no
     timetable yet gets "My week" at /timetable, and the maker is one link away. */
  const q = new URLSearchParams(window.location.search);
  // Read on the first render: the router may rewrite the address (/timetable/me → /timetable) before the maker mounts.
  const [firstVisit] = React.useState(ttFirstVisit);
  const [pick] = React.useState(() => q.get("easy") === "1" ? "easy" : q.get("full") === "1" || q.has("k") || q.has("mode") || q.has("import") || q.has("centre") || /#t=/.test(window.location.hash) || ttReadLocal() ? "full" : "auto");   // a week already kept in this browser opens in the maker
  const auth = useAuth() || {};
  const [first, setFirst] = React.useState(pick === "auto" ? null : pick);
  // Never wait long on who is signed in: after 3s the maker opens, as it always did.
  React.useEffect(() => {
    if (first !== null) return undefined;
    const t = setTimeout(() => setFirst(f => f === null ? "full" : f), 3000);
    return () => clearTimeout(t);
  }, [first]);
  React.useEffect(() => {
    if (first !== null || auth.loading) return undefined;
    if (!auth.member) { setFirst("full"); return undefined; }
    let live = true;
    NGGApi.member.myTimetable().then(r => { if (live) setFirst(r && r.timetable ? "full" : "easy"); }, () => { if (live) setFirst("full"); });
    return () => { live = false; };
  }, [first, auth.loading, auth.member]);
  if (first === null) return <div className="tt-app" aria-busy="true"/>;
  if (first === "easy") return <TtMyWeek/>;
  return <TtMakerGate setPage={setPage} firstVisit={firstVisit}/>;
}

function TtMakerGate({ setPage, firstVisit }) {
  const auth = useAuth() || {};
  const [open, setOpen] = React.useState(() => !firstVisit);
  React.useEffect(() => {
    if (open || auth.loading) return undefined;
    const toLanding = () => window.location.replace("/timetable/about");
    if (!auth.member) { toLanding(); return undefined; }
    let live = true;
    NGGApi.member.myTimetable()
      .then(r => { if (live) { if (r && r.timetable) setOpen(true); else toLanding(); } })
      .catch(() => { if (live) setOpen(true); });
    return () => { live = false; };
  }, [open, auth.loading, auth.member]);
  if (!open) return <div className="tt-app" aria-busy="true"/>;
  return <TtMaker setPage={setPage}/>;
}

function TtMaker({ setPage }) {
  const auth = useAuth() || {};
  const member = auth.member || null;
  const firstName = member ? String(member.fullName || "").trim().split(/\s+/)[0] : "";

  /* ── Where the page starts (§7.11): #t= link, ?k= link, the account (below), this browser, a blank week ── */
  const boot = React.useMemo(() => {
    const q = new URLSearchParams(TT_BOOT_URL.search);
    const out = { ctx: "new", doc: null, sharedBy: "", keep: null, k: (q.get("k") || "").replace(/[^a-f0-9]/g, ""),
      mode: q.get("mode"), importTab: q.get("import"), signin: q.get("signin") === "1", centre: (q.get("centre") || "").replace(/[^a-z0-9-]/g, "") };
    const t = /#t=([A-Za-z0-9_-]+)/.exec(TT_BOOT_URL.hash);
    const decoded = t ? ttDecode(t[1]) : null;
    const local = ttReadLocal();
    if (decoded) { out.doc = decoded.doc; out.sharedBy = decoded.sharedBy; out.ctx = "shared"; out.doc.s.mode = out.doc.s.mode || "school"; }
    else if (local) { out.doc = local.doc; out.keep = local.keep; out.ctx = "local"; }
    else out.doc = ttClean({ s: {}, entries: [], ex: {} });
    if (TT_MODES[out.mode]) out.doc.s.mode = out.mode;
    // What the URL asked for now lives in state; a refresh must not ask again.
    try { window.history.replaceState(window.history.state, "", window.location.pathname); } catch (_) {}
    return out;
  }, []);

  const [D, dispatch] = React.useReducer(ttDocReducer, { doc: boot.doc, past: [], future: [], rev: 0, loadedAt: 0 });
  const doc = D.doc, s = doc.s;
  const docRef = React.useRef(doc);
  docRef.current = doc;
  const revRef = React.useRef(D.rev);
  revRef.current = D.rev;

  /* ── How it is kept ── */
  const [keep, setKeep] = React.useState(boot.keep);                          // null | { mode: 'account'|'email', k, email, base }
  const [save, setSave] = React.useState({ status: "idle", savedRev: boot.keep && boot.keep.pending ? -1 : 0, error: "", server: null });
  const [online, setOnline] = React.useState(navigator.onLine !== false);
  const [note, setNote] = React.useState(boot.ctx === "shared" ? { kind: "shared", by: boot.sharedBy } : null);
  const [sync, setSync] = React.useState(null);
  const [hadAmPm, setHadAmPm] = React.useState(false);
  const [term, setTerm] = React.useState(null);

  /* ── The screen ── */
  const rootRef = React.useRef(null);
  const size = ttUseSize(rootRef);
  const W = size.w || 1280, H = size.h || 800;
  const bp = W < 600 ? "phone" : W < 840 ? "tablet" : W < 1200 ? "desk2" : "desk3";
  const [week, setWeek] = React.useState(0);
  const [day, setDay] = React.useState(null);
  const [pane, setPane] = React.useState("classes");
  const [layers, setLayers] = React.useState({ fs: null, more: null, form: null, plan: null, download: null, keys: null, sync: null,
    import: boot.importTab === "centre" || boot.importTab === "paste" ? { tab: boot.importTab } : null,
    save: boot.signin ? { step: "choose", who: "member" } : null });
  const [popover, setPopover] = React.useState(false);
  const [suggOff, setSuggOff] = React.useState(false);
  const [qaFocus, setQaFocus] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [now, setNow] = React.useState(() => new Date());
  const qaRef = React.useRef(null);
  const toastTimer = React.useRef(null);

  React.useEffect(() => { ttEnsureFonts(); }, []);
  // Now/next moves with the clock, not only when something renders (§7.14).
  React.useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  React.useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  // The calendar file defaults to this term's dates, from the server (§10).
  React.useEffect(() => { NGGApi.public.timetableTerm().then(r => { if (r && r.start) setTerm({ start: r.start, end: r.end }); }).catch(() => {}); }, []);

  /* ── Toasts (§7.12): Undo ones for 6.5s, others 5s, hidden under any layer ── */
  const say = React.useCallback((text, undo) => {
    clearTimeout(toastTimer.current);
    setToast({ text, undo: !!undo, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6500 : 5000);
  }, []);

  /* ── The document ── */
  const commit = React.useCallback((fn, msg, undoable) => { dispatch({ type: "commit", fn }); if (msg) say(msg, undoable); }, [say]);
  const setS = React.useCallback((k, v) => commit(d => d.s[k] === v ? d : Object.assign({}, d, { s: Object.assign({}, d.s, { [k]: v }) })), [commit]);
  const undo = React.useCallback(() => dispatch({ type: "undo" }), []);
  const redo = React.useCallback(() => dispatch({ type: "redo" }), []);
  const dirty = D.rev !== save.savedRev;

  // Always in this browser too, 300ms after the last change (§7.11). `pending` survives a closed tab.
  React.useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(TT_STORE, JSON.stringify({ s: doc.s, entries: doc.entries, ex: doc.ex, keep: keep ? Object.assign({}, keep, { pending: dirty }) : null })); } catch (_) {}
    }, 300);
    return () => clearTimeout(id);
  }, [doc, keep, dirty]);

  /* ── Opening what a link or the account holds ── */
  const loadServer = React.useCallback(t => {
    dispatch({ type: "load", doc: ttClean({ s: t.settings, entries: t.entries, ex: t.exceptions }) });
    setSave({ status: "saved", savedRev: revRef.current + 1, error: "", server: null });
  }, []);
  React.useEffect(() => {
    if (!boot.k) return;
    NGGApi.public.timetableLoad(boot.k).then(r => {
      if (!r || !r.timetable) return;
      setKeep({ mode: "email", k: boot.k, email: r.email || "", base: r.timetable.updatedAt || "" });
      loadServer(r.timetable);
    }).catch(() => say("That link has expired. This is the copy in this browser."));
    // Once, for the link the page was opened with.
    // eslint-disable-next-line
  }, []);
  const accountChecked = React.useRef(false);
  React.useEffect(() => {
    if (!member || accountChecked.current || boot.ctx === "shared" || boot.k) return;
    accountChecked.current = true;
    NGGApi.member.myTimetable().then(r => {
      const t = r && r.timetable;
      if (!t) return;
      const pending = keep && keep.mode === "account" && save.savedRev === -1;
      setKeep({ mode: "account", base: t.updatedAt || "" });
      if (!pending) loadServer(t);   // edits made here while offline win; the autosave sends them
    }).catch(() => {});
    // Once per signed-in member.
    // eslint-disable-next-line
  }, [member]);

  /* ── A centre's sessions in, the visitor's own kept (§7.7) ── */
  /* A member's own centre comes from their record, which marks the classes
     that are theirs (member_timetable `mine`), not a guess from the track. */
  const fetchCentre = React.useCallback(async slug => {
    let r = null;
    if (member) { try { const own = await NGGApi.member.timetable(); if (own && own.slug === slug) r = own; } catch (_) {} }
    if (!r) r = await NGGApi.public.timetable(slug);
    const entries = ttSlotsToEntries(r, member);
    if (!entries.length) throw new Error("no_sessions");
    return { centre: r.centre, slug, entries, marked: entries.some(e => e.mine) };
  }, [member]);
  /* A child's week holds THEIR classes, not the whole centre's Saturday: a
     member's marked ones go in and the rest are offered (owner, 2026-10-29:
     four courses in one child's week read as clashes they do not have).
     `pick` is the keys chosen in the import dialog; without it, a member gets
     their own and anyone else gets everything. */
  const addCentre = React.useCallback(async (slug, quiet, pick) => {
    const got = await fetchCentre(slug);
    /* A timetable is a person's (owner, 2026-10-29: "most timetables would be
       personal"): nothing goes in that nobody chose. Unknown classes are asked
       about — the caller opens the picker on "choose". */
    const chosen = pick ? got.entries.filter(e => pick.includes(ttSlotKey(e))) : got.marked ? got.entries.filter(e => e.mine) : null;
    if (!chosen) throw new Error("choose");
    if (!chosen.length) throw new Error("none_chosen");
    commit(d => {
      const own = d.entries.filter(x => !x.official);
      const s2 = d.entries.length || !member || !firstName ? d.s : Object.assign({}, d.s, { title: firstName + "’s week" });
      return Object.assign({}, d, { entries: own.concat(chosen.map((e, i) => Object.assign(e, { color: (own.length + i) % 8 }))), s: Object.assign({}, s2, { mode: s2.mode || "school" }) });
    }, quiet ? null : "Added " + chosen.length + " class" + (chosen.length === 1 ? "" : "es") + " from " + got.centre, !quiet);
    setDay(null);
    return { centre: got.centre, slug, added: chosen, others: got.entries.length - chosen.length };
  }, [commit, member, firstName, fetchCentre]);
  const centreBooted = React.useRef(false);
  React.useEffect(() => {
    // After sign-in has settled, so a member's own classes are marked.
    if (!boot.centre || auth.loading || centreBooted.current) return;
    centreBooted.current = true;
    addCentre(boot.centre, true).then(r => setNote({ kind: "centre", centre: r.centre, slug: r.slug, mine: r.added.map(e => e.title), others: r.others }))
      .catch(err => setLayers(l => Object.assign({}, l, { import: { tab: "centre", slug: boot.centre, failed: !(err && err.message === "choose") } })));
    // Once, for the centre in the address.
    // eslint-disable-next-line
  }, [auth.loading]);

  /* ── Official sync (§7.9): on load, a centre that changed a session is reported, never applied ── */
  const syncChecked = React.useRef(false);
  React.useEffect(() => {
    if (syncChecked.current || boot.ctx === "shared" || auth.loading) return;
    const sources = [...new Set(doc.entries.filter(e => e.official && e.source).map(e => e.source))];
    if (!sources.length) return;
    syncChecked.current = true;
    NGGApi.public.timetable("").then(async list => {
      for (const src of sources) {
        const c = (list.centres || []).find(x => x.name.toLowerCase() === src.toLowerCase());
        if (!c) continue;
        const r = await NGGApi.public.timetable(c.slug);
        const local = docRef.current.entries.filter(e => e.official && e.source === src);
        // Only the courses kept from this centre, and a member's own: a class they left out is not a change to them.
        const kept = new Set(local.map(e => e.title.toLowerCase()));
        const changes = ttOfficialDiff(local, ttSlotsToEntries(r, member).filter(e => kept.has(e.title.toLowerCase()) || e.mine));
        const sig = JSON.stringify(changes.map(x => [x.kind, (x.fresh || x.local).title, (x.fresh || x.local).days[0], x.fresh ? x.fresh.start + x.fresh.end + x.fresh.place : ""]));
        let seen = null;
        try { seen = localStorage.getItem("ngg.timetable.sync." + c.slug); } catch (_) {}
        if (changes.length && sig !== seen) { setSync({ source: src, slug: c.slug, changes, sig }); return; }
      }
    }).catch(() => {});
  }, [auth.loading, D.loadedAt]);
  const settleSync = React.useCallback(accepted => {
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
    setSync(null);
  }, [sync, commit]);

  /* ── Saving (§7.9–7.11) ── */
  const saving = React.useRef(false);
  const retries = React.useRef(0);
  const body = d => ({ settings: d.s, entries: d.entries, exceptions: d.ex });
  const saveNow = React.useCallback(async baseOverride => {
    if (!keep || saving.current) return;
    if (!navigator.onLine) { setOnline(false); return; }
    saving.current = true;
    const rev = revRef.current, d = docRef.current;
    setSave(p => Object.assign({}, p, { status: "saving", error: "" }));
    try {
      const r = keep.mode === "account"
        ? await NGGApi.member.saveMyTimetable(Object.assign(body(d), { baseUpdatedAt: baseOverride !== undefined ? baseOverride : keep.base || "" }))
        : await NGGApi.public.timetableSave(Object.assign(body(d), { k: keep.k }));
      setKeep(k => Object.assign({}, k, { base: (r && r.updatedAt) || k.base }));
      setSave({ status: "saved", savedRev: rev, error: "", server: null });
      retries.current = 0;
    } catch (e) {
      const conflict = e && (e.code === "conflict" || e.status === 409);
      setSave(p => Object.assign({}, p, { status: "error", error: conflict ? "conflict" : (e && e.code) || "failed", server: conflict && e.data ? e.data.server : null }));
    } finally { saving.current = false; }
  }, [keep]);
  // Autosave: 900ms after the last change, once a way of keeping it has been chosen; held while offline.
  React.useEffect(() => {
    if (!keep || !dirty || save.status === "error" || save.status === "saving" || !online) return undefined;
    const id = setTimeout(() => saveNow(), 900);
    return () => clearTimeout(id);
  }, [D.rev, keep, dirty, save.status, online, saveNow]);
  // A failed save tries again after 2s, 5s and 15s, then waits for Retry. A conflict waits for the visitor.
  React.useEffect(() => {
    if (save.status !== "error" || save.error === "conflict" || retries.current >= TT_SAVE_RETRY.length) return undefined;
    const id = setTimeout(() => { retries.current++; setSave(p => Object.assign({}, p, { status: "idle", error: "" })); }, TT_SAVE_RETRY[retries.current]);
    return () => clearTimeout(id);
  }, [save.status, save.error]);
  const retrySave = React.useCallback(() => {
    retries.current = 0;
    if (save.error === "conflict" && save.server) {
      // Retry after a conflict is the visitor choosing this copy over the one saved elsewhere.
      const base = save.server.updatedAt || "";
      setKeep(k => Object.assign({}, k, { base }));
      saveNow(base);
      return;
    }
    setSave(p => Object.assign({}, p, { status: "idle", error: "" }));
  }, [save, saveNow]);

  const saveInfo = (() => {
    const owner = firstName ? firstName + "’s" : "your";
    if (keep && save.status === "error") return { state: "failed", status: "Couldn’t save. Changes are kept here.", label: "Retry", icon: "warning-circle", tone: "error" };
    if (keep && (dirty || save.status === "saving")) {
      return { state: "saving", status: keep.mode === "account" ? "Saving to " + owner + " account…" : "Saving…", label: "Saving…", icon: "cloud-arrow-up", tone: "soft" };
    }
    if (keep && keep.mode === "account") return { state: "saved", status: "Saved to " + owner + " NGG account", label: "Saved to account", icon: "check-circle", tone: "ok" };
    if (keep) return { state: "saved", status: "Saved · link sent to " + (keep.email || "your email"), label: "Saved", icon: "check-circle", tone: "ok" };
    if (member) return { state: "unsaved", status: "Not in your account yet · tap the cloud", label: "Save to my account", icon: "cloud-arrow-up", tone: "gold" };
    return { state: "unsaved", status: boot.ctx === "shared" && D.rev === 0 ? "Your copy · only in this browser" : "Only in this browser · tap the cloud to keep it", label: "Save", icon: "cloud-arrow-up", tone: "gold" };
  })();

  /* ── Layers and the Back button (§7.12) ── */
  const openCount = TT_LAYER_ORDER.filter(k => layers[k]).length;
  const shown = React.useRef(0), ignore = React.useRef(0), popping = React.useRef(false);
  React.useEffect(() => {
    const a = shown.current, b = openCount;
    shown.current = b;
    try {
      if (b > a) for (let i = a; i < b; i++) window.history.pushState(Object.assign({}, window.history.state, { ttLayer: i + 1 }), "");
      else if (b < a && !popping.current) { ignore.current += a - b; window.history.go(b - a); }
    } catch (_) {}
    popping.current = false;
  }, [openCount]);
  const open = React.useCallback((name, payload) => { setPopover(false); setLayers(l => Object.assign({}, l, { [name]: payload || {} })); }, []);
  const close = React.useCallback(name => setLayers(l => l[name] ? Object.assign({}, l, { [name]: null }) : l), []);
  // One layer giving way to another keeps the history count, so no entry is pushed or popped.
  const swap = React.useCallback((from, to, payload) => setLayers(l => Object.assign({}, l, { [from]: null, [to]: payload || {} })), []);
  const closeTop = React.useCallback(() => setLayers(l => { const k = TT_LAYER_ORDER.find(x => l[x]); return k ? Object.assign({}, l, { [k]: null }) : l; }), []);
  React.useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) { ignore.current--; return; }
      if (shown.current > 0) { popping.current = true; closeTop(); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [closeTop]);
  // Leaving the page with a layer open must not leave its history entries behind.
  React.useEffect(() => () => { if (shown.current > 0) { try { window.history.go(-shown.current); } catch (_) {} } }, []);

  /* ── Entries ── */
  const T = { day: now.getDay() || 7, mins: now.getHours() * 60 + now.getMinutes() };
  const openForm = React.useCallback((init, ctx) => {
    let base = {};
    if (!(init && init.id)) {
      const len = (TT_MODES[s.mode] || TT_MODES.school).len;
      const d = (init && init.days && init.days[0]) || (ctx && ctx.day) || T.day;
      const st = ttFreeSlot(doc.entries, d, len, 8 * 60, 22 * 60);
      const s0 = st === null ? 9 * 60 : st;
      base = { id: "", title: "", days: [d], start: ttHhmm(s0), end: ttHhmm(s0 + len), place: "", color: doc.entries.length % 8, kind: "class", once: false };
    }
    open("form", Object.assign(base, init || {}, { ctxDay: ctx ? ctx.day : null, ctxOff: ctx ? ctx.off : week }));
  }, [s.mode, doc.entries, T.day, week, open]);

  const addEntry = React.useCallback((e, off) => {
    const o = off === undefined ? week : off;
    if (e.once) {
      const one = Object.assign({}, e, { id: e.id || ttUid(), days: [e.days[0]], once: true });
      commit(d => Object.assign({}, d, { ex: ttWithWeek(d.ex, o, x => { x.once = x.once.filter(y => y.id !== one.id).concat([one]); return x; }, now) }),
        "Added " + one.title + " · " + ttDshort(ttDateFor(one.days[0], o, now)) + " only", true);
      return;
    }
    const n = Object.assign({}, e, { id: e.id || ttUid() });
    delete n.once;
    commit(d => Object.assign({}, d, { entries: d.entries.concat([n]) }),
      "Added " + n.title + " · " + n.days.map(x => TT_DAYS[x - 1][2]).join(" ") + " " + ttFmt(ttMin(n.start), s.clock), true);
  }, [commit, week, now, s.clock]);

  /** The class form's submit: "" when it went through, else the error to show (§7.3). */
  const saveForm = React.useCallback(f => {
    const a = ttMin(f.start), b = ttMin(f.end);
    const err = !f.title.trim() ? "Give it a name." : !f.days.length ? "Pick at least one day." : a === null || b === null ? "Times look like 09:00 or 14:30." : b <= a ? "It has to end after it starts." : "";
    if (err) return err;
    const e = { id: f.id || "", title: f.title.trim().slice(0, 60), days: f.days.slice().sort((x, y) => x - y), start: f.start, end: f.end, place: f.place.trim().slice(0, 60), color: f.color, kind: f.kind || ttKindOf(f) };
    if (f.official) Object.assign(e, { official: true, source: f.source, mine: !!f.mine });
    const off = f.ctxOff || 0;
    close("form");
    if (f.origOnce && f.once) {
      commit(d => Object.assign({}, d, { ex: ttWithWeek(d.ex, off, x => { x.once = x.once.map(y => y.id === f.id ? Object.assign({}, e, { days: [e.days[0]], once: true }) : y); return x; }, now) }), "Saved " + e.title);
    } else if (f.origOnce) {
      // A one-off made weekly leaves its week and joins the timetable, in one undoable step.
      commit(d => Object.assign({}, d, { entries: d.entries.concat([Object.assign({}, e, { id: ttUid() })]), ex: ttWithWeek(d.ex, off, x => { x.once = x.once.filter(y => y.id !== f.id); return x; }, now) }), "Saved " + e.title);
    } else if (f.id) {
      commit(d => Object.assign({}, d, { entries: d.entries.map(x => x.id === f.id ? e : x) }), "Saved " + e.title);
    } else addEntry(Object.assign(e, { once: !!f.once }), off);
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
      was ? e.title + " is back on" : e.title + " is off " + ttDshort(ttDateFor(d, off, now)), !was);
  }, [doc.ex, now, close, commit]);

  const runFix = React.useCallback((e, d) => {
    const fx = ttFixFor(doc.entries, e, d);
    if (!fx) return;
    commit(x => Object.assign({}, x, { entries: fx.apply(x.entries, ttUid()) }), "Moved " + e.title + " to " + ttFmt(fx.start, s.clock) + (e.days.length > 1 ? " on " + TT_DAYS[d - 1][1] + "s" : ""), true);
  }, [doc.entries, commit, s.clock]);

  const setMode = React.useCallback(k => {
    commit(d => Object.assign({}, d, { s: Object.assign({}, d.s, { mode: k, title: d.s.title === "My week" ? TT_MODES[k].title : d.s.title }) }));
    if (k === "revision") open("plan");
    else setTimeout(() => qaRef.current && qaRef.current.focus(), 80);
  }, [commit, open]);

  /* ── Files (§7.8). Every file is drawn from the full-size, off-screen poster. ── */
  const [job, setJob] = React.useState(null);
  const hostRef = React.useRef(null);
  const jobWait = React.useRef(null);
  React.useEffect(() => {
    if (!job) return undefined;
    let live = true;
    ttFontsReady(job.model.lookKey)
      .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
      .then(() => { if (live && hostRef.current) jobWait.current.resolve(hostRef.current); })
      .catch(e => jobWait.current.reject(e));
    return () => { live = false; };
  }, [job]);
  const drawNode = model => new Promise((resolve, reject) => { jobWait.current = { resolve, reject }; setJob({ model, id: Date.now() }); });
  const fileName = ttSlug(s.title);
  const shareLink = React.useCallback(() => window.location.origin + "/timetable#t=" + ttEncode(docRef.current, member ? member.fullName : ""), [member]);

  /** Makes one file. true when the drawer can close; false keeps it open (a link copied, nothing to export). */
  const exportFile = React.useCallback(async (k, o) => {
    const d = docRef.current;
    try {
      if (k === "ics") {
        if (!d.entries.length) { say("Add a class first"); return false; }
        ttDownloadBlob(new Blob([ttIcs(d, { from: o.icsFrom, until: o.icsUntil, remind: o.remind })], { type: "text/calendar;charset=utf-8" }), fileName + ".ics");
        say("Downloaded " + fileName + ".ics · open it to add to your calendar");
        return true;
      }
      if (k === "link") {
        const u = shareLink();
        if (bp === "phone" && navigator.share) { await navigator.share({ title: d.s.title, url: u }).catch(() => {}); return true; }
        try { await navigator.clipboard.writeText(u); say("Link copied"); } catch (_) { say("Select the link to copy it"); }
        return false;
      }
      const model = ttPosterModel(d, { kind: k === "pdf" ? "poster" : k, orient: d.s.orient, paper: o.paper, wall: o.wall, now });
      const node = await drawNode(model);
      if (k === "pdf") { await ttPrintPdf(node, model, o.paper, fileName); setJob(null); return true; }
      const h2c = await loadVendor("html2canvas");
      // The share card is drawn at 2×; the wallpaper is already a phone's own pixel size.
      const canvas = await h2c(node, { scale: k === "phone" ? 1 : 2, backgroundColor: null, useCORS: true, logging: false, width: model.w, height: model.h, windowWidth: model.w, windowHeight: model.h });
      setJob(null);
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      const name = fileName + (k === "phone" ? "-wallpaper" : "") + ".png";
      const asFile = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
      if (k === "share" && bp === "phone" && asFile && navigator.canShare && navigator.canShare({ files: [asFile] })) {
        await navigator.share({ files: [asFile], title: d.s.title }).catch(() => {});
        return true;
      }
      ttDownloadBlob(blob, name);
      say(k === "phone" ? "Downloaded wallpaper · set it from your Photos app" : "Downloaded " + name);
      return true;
    } catch (_) {
      setJob(null);
      if (window.toast && window.toast.error) window.toast.error("That didn’t work, try again.", "Download failed");
      else say("That didn’t work, try again.");
      return false;
    }
  }, [now, fileName, shareLink, say, bp]);

  /* ── Keyboard (§7.12) ── */
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") {
        if (openCount) { e.preventDefault(); closeTop(); }
        else if (popover) setPopover(false);
        return;
      }
      const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (e.ctrlKey || e.metaKey) {
        if (typing) return;
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
        else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
        return;
      }
      if (typing || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); open("keys"); return; }
      if (TT_LAYER_ORDER.some(k => k !== "fs" && layers[k])) return;
      if (e.key === "f" || e.key === "F") { e.preventDefault(); if (layers.fs) close("fs"); else open("fs"); return; }
      if (layers.fs) return;
      if (e.key === "/") { e.preventDefault(); setPane("classes"); setTimeout(() => qaRef.current && qaRef.current.focus(), 0); return; }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); openForm(); return; }
      if (e.key === "d" || e.key === "D") { e.preventDefault(); open("download", { format: "pdf", step: "detail" }); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openCount, popover, layers, closeTop, undo, redo, open, close, openForm]);

  /* ── Everything the trees and layers read ── */
  const C = {
    setPage, doc, s, entries: doc.entries, ex: doc.ex, now, T, bp, W, H, week, setWeek, day, setDay, pane, setPane, member, firstName,
    canUndo: D.past.length > 0, canRedo: D.future.length > 0, undo, redo, commit, setS, say, setMode,
    layers, open, close, swap, popover, setPopover, openForm, addEntry, saveForm, removeEntry, toggleSkip, runFix,
    qaRef, qaFocus, setQaFocus, suggOff, setSuggOff, hadAmPm, setHadAmPm, term, note, dismissNote: () => setNote(null), online,
    sync, dismissSync: () => settleSync([]), applySync: accepted => { settleSync(accepted); close("sync"); },
    saveInfo, addCentre, fetchCentre, exportFile, shareLink, fileName, refreshAuth: () => auth.refresh ? auth.refresh() : Promise.resolve(),
    startSave: () => {
      if (saveInfo.state === "failed") retrySave();
      else if (keep) say(saveInfo.status);
      else open("save", {});
    },
    keepInAccount: async () => {
      let base = "";
      try { const r = await NGGApi.member.myTimetable(); base = (r && r.timetable && r.timetable.updatedAt) || ""; } catch (_) {}
      // Choosing "Save to my account" is choosing this copy, so it is saved over whatever the account held.
      setKeep({ mode: "account", base });
      setSave({ status: "idle", savedRev: -1, error: "", server: null });
    },
    keepByEmail: async email => {
      const r = await NGGApi.public.timetableSave(Object.assign(body(docRef.current), { email }));
      setKeep({ mode: "email", k: r.k, email, base: r.updatedAt || "" });
      setSave({ status: "saved", savedRev: revRef.current, error: "", server: null });
    },
  };

  return (
    <div ref={rootRef} className={"tt-app tt-app--" + bp + (H < 480 ? " is-short" : "")}>
      {bp === "phone" ? <TtPhone C={C}/> : <TtWide C={C}/>}
      <TtLayers C={C}/>
      <div className="tt-live" role="status" aria-live="polite">
        {toast && !openCount && (
          <div key={toast.id} className={"tt-toast" + (bp === "phone" ? qaFocus ? " is-phone is-lifted" : " is-phone" : "")}>
            <TtIcon name="check-circle" className="tt-toast-icon"/>
            <span>{toast.text}</span>
            {toast.undo && <button type="button" className="tt-toast-undo" onClick={() => { clearTimeout(toastTimer.current); setToast(null); undo(); }}>Undo</button>}
          </div>
        )}
      </div>
      <div className="tt-export-host" aria-hidden="true">{job && <TimetablePoster model={job.model} nodeRef={hostRef}/>}</div>
    </div>
  );
}
