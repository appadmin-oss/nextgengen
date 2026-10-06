/* ============================================================================
   ID Card Studio — the page (/club/id-cards). ID_CARD_STUDIO.md.

   One component owns the queue, the settings and the run; the tabs only draw
   what it hands them through `M`. Three things are easy to get wrong here:
   - The layout follows the studio's own width (ResizeObserver), never the
     window's. Below 760px it is a Queue, never a sheet.
   - What is on the sheet is printed by the same faces, from a hidden host in
     millimetres; nothing is drawn twice.
   - A print is logged only when the print window opened. A failed card found
     afterwards is marked on the run it came from and goes back in the queue.
   ========================================================================== */

const IDS_DEFAULT_SETTINGS = { size: "cr80p", cw: 60, ch: 90, paper: "a4", margin: IDS_MARGIN.def, gap: IDS_GAP.def, skip: 0,
  backs: "off", marks: true, dpi: 300, order: "centre", breakBy: true, packing: true, reason: "new" };
const IDS_REASON_LABEL = Object.fromEntries(IDS_REASONS);
const IDS_KIND_FOR_RUN = { member: "member", summer: "student", volunteer: "volunteer" };

function idsReadUploadFiles(files) {
  const list = Array.from(files || []).filter(f => /^image\/(png|jpe?g|webp)$/.test(f.type));
  return Promise.all(list.map(file => new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ uid: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: file.name, src: fr.result,
        w: img.naturalWidth, h: img.naturalHeight, copies: 1, rot: 0, fit: "cover", backOf: null, back: "" });
      img.onerror = () => resolve(null);
      img.src = fr.result;
    };
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(file);
  }))).then(r => ({ ok: r.filter(Boolean), skipped: files && files.length ? files.length - list.length : 0 }));
}

/* The studio's type (§2): Geist, and Geist Mono for IDs and run numbers. Loaded
   once, when the studio first opens — no other page uses them. */
const IDS_FONT_HREF = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&display=swap";
function idsEnsureFonts() {
  if (document.getElementById("ids-fonts")) return;
  const l = document.createElement("link");
  l.id = "ids-fonts"; l.rel = "stylesheet"; l.href = IDS_FONT_HREF;
  document.head.appendChild(l);
}

function IdCardStudioPage({ setPage }) {
  React.useEffect(idsEnsureFonts, []);
  const rootRef = React.useRef(null);
  const W = idsUseWidth(rootRef) || 1280;
  const phone = W < 760;
  const [say, toastNode] = idsUseToast();
  const [tab, setTab] = React.useState("make");

  /* ── Data ── */
  const [data, setData] = React.useState({ state: "loading", records: [], queue: [], programs: {}, kinds: [] });
  const load = React.useCallback(() => {
    setData(d => Object.assign({}, d, { state: "loading" }));
    idsLoad().then(r => setData(Object.assign({ state: "ready" }, r)))
      .catch(e => setData(d => Object.assign({}, d, { state: e && e.forbidden ? "forbidden" : "error" })));
  }, []);
  React.useEffect(load, [load]);
  const [done, setDone] = React.useState({});     // printed this session: off the queue
  const [asked, setAsked] = React.useState({});
  const recs = React.useMemo(() => data.queue.filter(r => !done[r.key]), [data.queue, done]);
  const byKey = React.useMemo(() => Object.fromEntries(data.records.map(r => [r.key, r])), [data.records]);
  const centres = React.useMemo(() => [...new Set(data.records.map(r => r.centre).filter(Boolean))].sort(), [data.records]);
  const accentOf = React.useMemo(() => {
    const m = {};
    data.records.forEach(r => { if (r.centreObj && r.centreObj.color) m[r.centre] = r.centreObj.color; });
    return c => m[c] || "var(--ids-centre-other)";
  }, [data.records]);
  const isBlocked = r => !r.photoUrl;

  /* ── Settings and queue ── */
  const [st, setSt] = React.useState(IDS_DEFAULT_SETTINGS);
  const set = React.useCallback(p => setSt(s => Object.assign({}, s, p)), []);
  const [scen, setScen] = React.useState("batch");
  const [src, setSrc] = React.useState("records");
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("new");
  const [kind, setKind] = React.useState("");
  const [centre, setCentre] = React.useState("");
  const [lim, setLim] = React.useState(IDS_REC_PAGE);
  const [queue, setQueue] = React.useState([]);   // [{t:'r', key} | {t:'u', uid}]
  const [uploads, setUploads] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [sheetIdx, setSheetIdx] = React.useState(0);
  const [face, setFace] = React.useState("front");
  const [overview, setOverview] = React.useState(false);
  const searchRef = React.useRef(null);
  // The model names the custom size customW/customH; the settings keep it as cw/ch.
  const G = idsGrid(Object.assign({}, st, { customW: st.cw, customH: st.ch }));
  const recOK = st.size === "cr80p";

  const inQ = React.useMemo(() => new Set(queue.map(x => x.t === "r" ? x.key : x.uid)), [queue]);
  const upById = React.useMemo(() => Object.fromEntries(uploads.map(u => [u.uid, u])), [uploads]);

  /* ── The records list (§3.1) ── */
  const ql = q.trim().toLowerCase();
  const base = recs.filter(r => (!kind || r.kind === kind) && (!centre || r.centre === centre) && (!ql || (r.name + " " + r.displayId + " " + r.id).toLowerCase().includes(ql)));
  const cnt = { new: base.filter(r => !isBlocked(r) && r.reason === "new").length, reprint: base.filter(r => !isBlocked(r) && r.reason === "reprint").length, blocked: base.filter(isBlocked).length, all: base.length };
  const shown = base.filter(r => filter === "all" ? true : filter === "blocked" ? isBlocked(r) : !isBlocked(r) && r.reason === filter);
  const addable = shown.filter(r => !isBlocked(r) && !inQ.has(r.key));
  const addRecs = (list, msg) => {
    if (!list.length) return;
    const prev = queue;
    setQueue(prev.concat(list.map(r => ({ t: "r", key: r.key }))));
    say(msg || idsN(list.length, "card") + " added", () => setQueue(prev));
  };
  const toggleRec = r => {
    if (isBlocked(r)) return say("Needs a photo first");
    if (!recOK) return say("The standard cards are CR80 portrait. Switch the card size to print records.");
    if (inQ.has(r.key)) { setQueue(qq => qq.filter(x => !(x.t === "r" && x.key === r.key))); setSel(null); }
    else setQueue(qq => qq.concat([{ t: "r", key: r.key }]));
  };
  const askPhoto = r => {
    NGGApi.admin.idStudio.askPhoto(r.subjectType, r.id).then(res => {
      setAsked(a => Object.assign({}, a, { [r.key]: true }));
      say(res && res.sent ? "Guardian asked for a photo. It shows up here once approved." : "Noted. There’s no guardian email to send to, so ask them in person.");
    }).catch(() => say("Couldn’t send the request. Try again."));
  };
  const records = {
    q, setQ, kind, setKind, centre, setCentre, filter, setFilter: f => { setFilter(f); setLim(IDS_REC_PAGE); },
    filters: [["new", "New", "ok"], ["reprint", "Reprints", "warn"], ["blocked", "Blocked", "bad"], ["all", "All", null]].map(([k, label, dot]) => ({ k, label, dot, n: cnt[k], on: filter === k })),
    shown, addable: addable.length, canAddAll: addable.length > 0 && recOK, addAll: () => addRecs(addable),
    more: Math.max(0, shown.length - lim), showMore: () => setLim(l => l + IDS_REC_MORE),
    rows: shown.slice(0, lim).map(r => {
      const b = isBlocked(r), on = inQ.has(r.key), wasAsked = asked[r.key] || r.asked;
      const tag = b ? (wasAsked ? "Photo requested" : "No photo yet · can’t print") : r.reason === "reprint" ? "Reprint · " + (r.why || "requested") : r.divMissing ? "New · division is blank" : "New card";
      return Object.assign({}, r, { blocked: b, on, tag, tagTone: b ? (wasAsked ? "muted" : "bad") : r.reason === "reprint" || r.divMissing ? "warn" : "muted",
        aria: (on ? "Take " : "Put ") + r.name + (on ? " off the sheet" : " on the sheet"), toggle: () => toggleRec(r), ask: () => askPhoto(r) });
    }),
  };

  /* ── Uploads (§3.1) ── */
  const readUploads = files => idsReadUploadFiles(files).then(({ ok }) => {
    if (!ok.length) return say("Only PNG, JPG or WebP images");
    const { uploads: all, paired } = idsPairUploads(uploads.concat(ok));
    setUploads(all);
    const fronts = all.filter(u => ok.some(o => o.uid === u.uid) && !u.backOf);
    setQueue(qq => qq.concat(fronts.map(u => ({ t: "u", uid: u.uid }))));
    setSrc("uploads"); setSheetIdx(0);
    if (paired && st.backs === "off") set({ backs: "long" });
    say(idsN(ok.length, "image") + " added" + (paired ? ", " + paired + " paired front to back" : ""));
  });
  const setU = (uid, p) => setUploads(us => us.map(u => u.uid === uid ? Object.assign({}, u, p) : u));
  const uploadsUI = {
    read: readUploads,
    rows: uploads.map(u => {
      const isBack = !!u.backOf;
      return Object.assign({}, u, { isBack, on: isBack ? inQ.has(u.backOf) : inQ.has(u.uid), frontName: isBack ? (upById[u.backOf] || {}).name : "",
        dpi: idsDpiChip(idsEffDpi(u, G.cw, G.ch), st.dpi), fit: idsFitChip(u, G.cw, G.ch),
        toggle: () => { if (isBack) return; if (inQ.has(u.uid)) setQueue(qq => qq.filter(x => x.uid !== u.uid)); else setQueue(qq => qq.concat([{ t: "u", uid: u.uid }])); } });
    }),
    backChoices: f => uploads.filter(b => b.uid !== f.uid && (!b.backOf || b.backOf === f.uid) && !b.back && !(inQ.has(b.uid))),
    setBack: (uid, back) => setUploads(us => us.map(u => u.uid === uid ? Object.assign({}, u, { back }) : u.backOf === uid ? Object.assign({}, u, { backOf: null }) : u.uid === back ? Object.assign({}, u, { backOf: uid }) : u)),
    setCopies: (uid, n) => setU(uid, { copies: Math.max(1, Math.min(IDS_COPIES_MAX, n)) }),
    remove: uid => {
      const prevU = uploads, prevQ = queue, u = upById[uid];
      setUploads(us => us.filter(x => x.uid !== uid).map(x => x.back === uid ? Object.assign({}, x, { back: "" }) : x.backOf === uid ? Object.assign({}, x, { backOf: null }) : x));
      setQueue(qq => qq.filter(x => x.uid !== uid));
      say("Removed " + (u ? u.name : "the image"), () => { setUploads(prevU); setQueue(prevQ); });
    },
  };

  /* ── The sheet ── */
  const cards = React.useMemo(() => {
    const out = [];
    queue.forEach(x => {
      if (x.t === "r") { const r = byKey[x.key]; if (r) out.push({ key: r.key, base: r.key, rec: r, label: r.name, centre: r.centre, kind: r.kind, name: r.name }); }
      else { const u = upById[x.uid]; if (u) for (let c = 0; c < u.copies; c++) out.push({ key: u.uid + "#" + c, base: u.uid, upload: u, label: u.name, centre: "", kind: "upload", name: u.name }); }
    });
    return out;
  }, [queue, byKey, upById]);
  const sorted = React.useMemo(() => idsSort(cards, st.order, c => ({ centre: c.centre, kind: c.kind, name: c.name })), [cards, st.order]);
  const breakActive = st.breakBy && (st.order === "centre" || st.order === "kind");
  const { slots: rawSlots, pads } = React.useMemo(() => idsLayout(sorted, G.per, st.skip, breakActive ? (c => st.order === "centre" ? c.centre : c.kind) : null), [sorted, G.per, st.skip, breakActive, st.order]);
  const slots = rawSlots.map(s => {
    if (s.pad) return s;
    let warn = null;
    if (s.rec && s.rec.divMissing) warn = { tone: "warn", text: "Division is blank on the record" };
    if (s.upload) { const d = idsDpiChip(idsEffDpi(s.upload, G.cw, G.ch), st.dpi); if (d.tone !== "ok") warn = { tone: d.tone, text: d.label }; }
    return Object.assign({}, s, { warn });
  });
  const nSheets = idsSheetCount(G.per, st.skip, slots.length);
  const stock = idsStock(cards.length, slots.length, G.per, st.skip, st.backs);
  React.useEffect(() => { if (sheetIdx > Math.max(0, nSheets - 1)) setSheetIdx(Math.max(0, nSheets - 1)); }, [nSheets, sheetIdx]);
  const gap = nSheets && !breakActive ? nSheets * G.per - st.skip - slots.length : 0;
  const ready = recs.filter(r => !isBlocked(r) && !inQ.has(r.key));
  const fillGap = () => addRecs(ready.slice(0, gap), "Filled " + idsN(Math.min(gap, ready.length), "slot"));

  /* Reorder: everything happens in "My order", on the sheet's own sequence. */
  const reorder = (fromKey, toIdx) => {
    const seq = sorted.map(c => c.key);
    const from = seq.indexOf(fromKey);
    if (from < 0) return;
    const order = sorted.slice();
    const [moved] = order.splice(from, 1);
    order.splice(Math.max(0, Math.min(order.length, toIdx)), 0, moved);
    const seen = new Set(), next = [];
    order.forEach(c => { if (seen.has(c.base)) return; seen.add(c.base); next.push(c.rec ? { t: "r", key: c.base } : { t: "u", uid: c.base }); });
    setQueue(next);
    if (st.order !== "mine") { set({ order: "mine" }); say("Switched to your own order"); }
  };
  const selCard = sel ? cards.find(c => c.key === sel) : null;
  const moveSel = d => { if (!selCard) return; const i = sorted.findIndex(c => c.key === sel); reorder(sel, i + d); };
  const removeSel = () => {
    if (!selCard) return;
    const prev = queue;
    setQueue(qq => qq.filter(x => (x.t === "r" ? x.key : x.uid) !== selCard.base));
    setSel(null);
    say("Taken off the sheet", () => setQueue(prev));
  };

  /* ── Checks (§3.3) ── */
  const recCards = cards.filter(c => c.rec), upCards = cards.filter(c => c.upload);
  const upFronts = uploads.filter(u => !u.backOf && inQ.has(u.uid));
  const lowDpi = upFronts.filter(u => idsDpiChip(idsEffDpi(u, G.cw, G.ch), st.dpi).tone !== "ok");
  const sideways = upFronts.filter(u => idsFitChip(u, G.cw, G.ch).sideways);
  const noBack = st.backs !== "off" ? upFronts.filter(u => !u.back) : [];
  const memberNoBack = st.backs !== "off" ? recCards.filter(c => c.rec.kind === "member") : [];
  const noDiv = recCards.filter(c => c.rec.divMissing);
  const reprints = recCards.filter(c => c.rec.reason === "reprint");
  const blockedCount = recs.filter(isBlocked).length;
  const checks = [];
  if (!G.per) checks.push({ tone: "bad", text: "Cards this size don’t fit on " + IDS_PAPERS[G.paper][0] + " with these margins." });
  if (recCards.length && !recOK) checks.push({ tone: "bad", text: idsN(recCards.length, "record card") + " use the standard design, which is CR80 portrait. Switch size, or take them off and print them in their own run.", action: "Use CR80 portrait", onAction: () => set({ size: "cr80p" }) });
  if (lowDpi.length) checks.push({ tone: lowDpi.some(u => idsDpiChip(idsEffDpi(u, G.cw, G.ch), st.dpi).tone === "bad") ? "bad" : "warn", text: idsN(lowDpi.length, "uploaded image") + " " + (lowDpi.length === 1 ? "is" : "are") + " below " + st.dpi + " dpi at this size and may print soft." });
  if (sideways.length) checks.push({ tone: "warn", text: idsN(sideways.length, "image") + " look sideways for this card.", action: "Rotate them", onAction: () => setUploads(us => us.map(u => sideways.some(s => s.uid === u.uid) ? Object.assign({}, u, { rot: ((u.rot || 0) + 90) % 360 }) : u)) });
  if (noBack.length) checks.push({ tone: "warn", text: idsN(noBack.length, "uploaded card") + " have no back image, so the back prints blank." });
  if (memberNoBack.length) checks.push({ tone: "warn", text: idsN(memberNoBack.length, "member card") + " have no back design yet, so the back prints blank." });
  if (noDiv.length) checks.push({ tone: "warn", text: idsN(noDiv.length, "card") + " show no division, because it’s blank on the record." });
  if (reprints.length) checks.push({ tone: "info", text: idsN(reprints.length, "reprint") + " will use the current design, and the old cards stop working at the gate once printed." });
  if (blockedCount) checks.push({ tone: "info", text: idsN(blockedCount, "person", "people") + " are left out because they have no photo yet.", action: "See who", onAction: () => { setSrc("records"); setFilter("blocked"); } });
  if (!checks.some(c => c.tone === "warn" || c.tone === "bad") && cards.length) checks.push({ tone: "ok", text: "Ready to print. Everything on the sheet checks out." });
  const hasBad = checks.some(c => c.tone === "bad");
  const printBlock = !cards.length ? "Put some cards on the sheet first" : hasBad ? "Fix the red item first" : "";

  /* ── Scenarios (§3.2.1) ── */
  const applyScenario = key => {
    const sc = IDS_SCENARIOS.find(s => s.key === key);
    if (!sc) return;
    setScen(key); setSrc(sc.src);
    if (sc.filter) setFilter(sc.filter);
    set(Object.assign({ order: sc.order, breakBy: sc.breakBy, packing: sc.packing, reason: sc.reason }, sc.dpi ? { dpi: sc.dpi } : {}));
    if (sc.focusSearch) setTimeout(() => searchRef.current && searchRef.current.focus(), 30);
  };

  /* ── Printing (§4) ── */
  const designLabel = "Standard card";
  const [confirm, setConfirm] = React.useState(null);
  const [printJob, setPrintJob] = React.useState(null);   // { a, b, packing, test, proof }
  const [job, setJob] = React.useState(null);             // batch progress
  const [after, setAfter] = React.useState(null);         // { items, runs }
  const [runOpen, setRunOpen] = React.useState(null);
  const hostRef = React.useRef(null);
  const programFor = rec => (data.programs[rec.kind] || {});
  const renderFace = (s, f) => s.upload
    ? <IdsUploadFace u={f === "back" ? (s.upload.back ? upById[s.upload.back] : null) : s.upload} cw={G.cw} ch={G.ch} back={f === "back"}/>
    : <IdsRecordFace rec={s.rec} face={f} program={programFor(s.rec)} wMm={G.cw} hMm={G.ch}/>;

  const startPrint = () => {
    if (printBlock) return say(printBlock);
    const nRecords = recCards.length, nUploads = upCards.length;
    setConfirm({ nCards: cards.length, nRecords, nUploads, nSheets, G, backs: st.backs, skip: st.skip, designLabel, packing: st.packing, slots,
      defaultReason: idsAutoReason(scen, nRecords, reprints.length) });
  };

  // When the hidden host has drawn the pages, hand them to the print window and log what printed.
  React.useEffect(() => {
    if (!printJob) return undefined;
    let live = true;
    const go = async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!live || !hostRef.current) return;
      const opened = idsOpenPrintWindow(hostRef.current, G, printJob.test ? "Alignment test" : "ID cards");
      const pj = printJob;
      setPrintJob(null);
      if (!opened) return say("Allow pop-ups to print");
      if (pj.test) return say("Alignment test sent. Measure it with a ruler before printing cards.");
      await logPrinted(pj);
    };
    go();
    return () => { live = false; };
    // eslint-disable-next-line
  }, [printJob]);

  const inRange = (a, b) => {
    const out = [];
    for (let p = a - 1; p < b; p++) for (let i = 0; i < G.per; i++) { const s = slots[p * G.per + i - st.skip]; if (s && !s.pad) out.push({ s, sheet: p + 1, slotN: i + 1 }); }
    return out;
  };

  const logPrinted = async pj => {
    const items = inRange(pj.a, pj.b);
    const proof = pj.reason === "proof";
    const recItems = items.filter(x => x.s.rec);
    const runs = [];
    try {
      const groups = {};
      recItems.forEach(x => { const k = IDS_KIND_FOR_RUN[x.s.rec.kind]; (groups[k] = groups[k] || []).push(x); });
      for (const k of Object.keys(groups)) {
        const res = await NGGApi.admin.registration.cardRun({ kind: k, subjectType: k, mode: proof ? "proof" : undefined, output: "sheet", dpi: st.dpi, sheet: IDS_PAPERS[G.paper][0],
          reason: IDS_REASON_LABEL[pj.reason] || "", items: groups[k].map(x => ({ subjectId: x.s.rec.id, displayId: x.s.rec.displayId })) });
        runs.push({ runId: res.runId, subjectType: k, items: groups[k] });
      }
      if (items.some(x => x.s.upload)) {
        const res = await NGGApi.admin.registration.cardRun({ kind: "graphic", output: "sheet", dpi: st.dpi, sheet: IDS_PAPERS[G.paper][0], reason: IDS_REASON_LABEL.external, items: [] });
        runs.push({ runId: res.runId, subjectType: "graphic", items: [] });
      }
      if (!proof && recItems.length) {
        await NGGApi.admin.idStudio.printed(recItems.map(x => ({ subjectType: x.s.rec.subjectType, subjectId: x.s.rec.id })), runs[0] ? runs[0].runId : "").catch(() => {});
        const gone = new Set(recItems.map(x => x.s.rec.key));
        setDone(d => { const n = Object.assign({}, d); gone.forEach(k => { n[k] = true; }); return n; });
        setQueue(qq => qq.filter(x => !(x.t === "r" && gone.has(x.key))));
      }
    } catch (_) {
      say("Printed, but the log couldn’t be written. Note the sheets by hand and try the next run again.");
      return;
    }
    const ids = runs.map(r => r.runId).join(", ");
    if (job || pj.batch) say("Batch sent · sheets " + pj.a + "–" + pj.b + " of " + nSheets + ". Print the next when it’s out.");
    else { say("Sent to the printer and logged as " + ids); set({ skip: 0 }); setSheetIdx(0); }
    if (!proof && recItems.length) setAfter({ runs, items: recItems.map(x => ({ key: x.s.key, slot: x.s, name: x.s.label, sheet: x.sheet, slotN: x.slotN, cw: G.cw, ch: G.ch, rec: x.s.rec })) });
  };

  const onConfirmPrint = ({ mode, batches, range, packing, reason }) => {
    setConfirm(null);
    if (mode === "batch") {
      setJob({ batches, i: 0, total: nSheets, done: batches[0][1], next: batches[1] || batches[0], reason, packing });
      setPrintJob({ a: batches[0][0], b: batches[0][1], packing, reason, batch: true });
    } else {
      const [a, b] = mode === "range" ? range : [1, nSheets];
      setPrintJob({ a, b, packing, reason });
    }
  };
  const printNextBatch = () => {
    if (!job) return;
    const i = job.i + 1;
    if (i >= job.batches.length) { setJob(null); return; }
    const [a, b] = job.batches[i];
    setJob(i + 1 >= job.batches.length ? null : Object.assign({}, job, { i, done: b, next: job.batches[i + 1] }));
    setPrintJob({ a, b, packing: false, reason: job.reason, batch: true });
  };

  const afterDone = async bad => {
    const a = after;
    setAfter(null);
    if (!bad.length) return say("Logged. Every card printed fine.");
    try {
      for (const run of a.runs) {
        const mine = bad.filter(b => IDS_KIND_FOR_RUN[b.rec.kind] === run.subjectType);
        if (mine.length) await NGGApi.admin.idStudio.failed(run.runId, mine.map(b => ({ subjectType: b.rec.subjectType, subjectId: b.rec.id })));
      }
      setDone(d => { const n = Object.assign({}, d); bad.forEach(b => { delete n[b.rec.key]; }); return n; });
      setData(d => Object.assign({}, d, { queue: d.queue.map(r => bad.some(b => b.rec.key === r.key) ? Object.assign({}, r, { reason: "reprint", why: "Didn’t print properly" }) : r) }));
      setQueue(qq => qq.concat(bad.map(b => ({ t: "r", key: b.rec.key }))));
      say(idsN(bad.length, "card") + " back on the sheet as reprints");
    } catch (_) { say("Couldn’t record the failures. Try again from the print log."); }
  };

  /* ── Keys (§3.5) ── */
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") { if (confirm || runOpen || after) return; if (sel) { setSel(null); } return; }
      if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "") || !sel || phone || tab !== "make") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); moveSel(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveSel(1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* ── The log and lookup ── */
  const [log, setLog] = React.useState({ state: "idle", runs: [] });
  const loadLog = React.useCallback(() => {
    setLog({ state: "loading", runs: [] });
    NGGApi.admin.registration.cardRuns({ pageSize: 100 }).then(r => setLog({ state: "ready", runs: (r.runs || []).map(x => ({
      runId: x.runId, at: x.startedAt ? new Date(x.startedAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "",
      design: x.templateName || (x.kind === "graphic" ? "External upload" : "Standard card"), version: x.templateVersion ? "v" + x.templateVersion : "",
      type: x.kind === "graphic" ? "external" : x.mode === "proof" ? "proof" : x.mode === "reprint" ? "reprint" : "new",
      cards: x.issued || x.requested || 0, failed: x.failed || 0, output: [x.output === "sheet" ? "Browser print" : x.output, x.dpi ? x.dpi + " dpi" : "", x.sheet].filter(Boolean).join(" · "),
      by: x.actorName || "", kind: x.kind === "student" ? "summer" : x.kind, reprintable: x.kind !== "graphic",
    })) })).catch(() => setLog({ state: "error", runs: [] }));
  }, []);
  React.useEffect(() => { if (tab === "log" && log.state === "idle") loadLog(); }, [tab, log.state, loadLog]);
  const openRun = async r => {
    setRunOpen(Object.assign({}, r, { people: [] }));
    try {
      const res = await NGGApi.admin.registration.cardRunGet(r.runId);
      const people = (res.issues || []).map(i => { const rec = byKey[i.subjectType + ":" + i.subjectId]; return (rec ? rec.name : i.subjectId) + (i.displayId ? " · " + i.displayId : "") + (i.ok ? "" : " · not printed"); });
      setRunOpen(o => o && o.runId === r.runId ? Object.assign({}, o, { people, issues: res.issues || [], reprintable: o.reprintable && (res.issues || []).length > 0 }) : o);
    } catch (_) {}
  };
  const reprintRun = async r => {
    const items = (r.issues || []).map(i => ({ subjectType: i.subjectType, subjectId: i.subjectId, why: "Reprint of " + r.runId }));
    if (!items.length) return;
    try { await NGGApi.admin.idStudio.reprint(items); setRunOpen(null); say(idsN(items.length, "card") + " queued as reprints"); load(); }
    catch (_) { say("Couldn’t queue the reprint. Try again."); }
  };
  const lookup = async id => {
    const rec = data.records.find(r => r.displayId.toUpperCase() === id);
    if (!rec) return null;
    const res = await NGGApi.admin.registration.cardHistory(rec.id, rec.subjectType);
    const rows = (res.issues || res.history || []).map(i => ({ at: i.at ? new Date(i.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "",
      run: i.runId, design: (i.templateName || "Standard card") + (i.templateVersion ? " v" + i.templateVersion : ""), type: (i.reprint ? "Reprint" : "New issue") + (i.mode === "proof" ? " · proof" : ""), ok: i.ok !== false, reprint: !!i.reprint }));
    return { name: rec.name, rows, moved: !!(res.stale || (res.latest && res.latest.stale) || res.designMovedOn === true), queueable: true, rec };
  };
  const queueReprint = async d => {
    try { await NGGApi.admin.idStudio.reprint([{ subjectType: d.rec.subjectType, subjectId: d.rec.id, why: "Design changed" }]); say(d.name + " is queued for a reprint"); load(); }
    catch (_) { say("Couldn’t queue the reprint. Try again."); }
  };

  /* ── Everything the Make tab reads ── */
  const M = {
    G, st, settings: st, set, setOrder: o => set({ order: o }), scen, applyScenario, src, setSrc, records, uploadsUI, searchRef,
    recCount: recs.length, upFronts: uploads.filter(u => !u.backOf).length, centres, accent: accentOf, recOK, dataState: data.state, reload: load,
    slots, skip: st.skip, backs: st.backs, marks: st.marks, proof: st.reason === "proof", nCards: cards.length, pads, stock, gap, fillable: ready.length, fillGap, breakActive,
    sheet: { idx: sheetIdx, go: setSheetIdx, count: nSheets, face, setFace, overview, setOverview },
    sel, select: setSel, selCard, moveSel, removeSel,
    rotateSel: () => selCard && selCard.upload && setU(selCard.upload.uid, { rot: ((selCard.upload.rot || 0) + 90) % 360 }),
    toggleFitSel: () => selCard && selCard.upload && setU(selCard.upload.uid, { fit: selCard.upload.fit === "contain" ? "cover" : "contain" }),
    dropAt: (e, gi) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); if (k) reorder(k, gi); },
    renderFace, checks, printBlock, startPrint, printTest: () => setPrintJob({ test: true, a: 1, b: 1 }), job, printNextBatch, stopJob: () => { setJob(null); say("Stopped. The sheets already out are logged."); },
  };

  const tabs = [["make", phone ? "Queue" : "Make cards", recs.filter(r => !isBlocked(r)).length], ["log", "Print log", null], ["lookup", phone ? "Look up" : "Look up a person", null]];
  const gridCls = W >= 1280 ? "is-roomy" : W >= 1024 ? "is-wide" : "is-two";

  return (
    <div className={"ids-app" + (phone ? " is-phone" : "")} ref={rootRef}>
      <header className="ids-head">
        <a href="/club-admin" className="ids-brand" aria-label="Back to the Club portal" onClick={e => { e.preventDefault(); setPage && setPage("club-admin"); }}>
          <img src="/assets/logo.png" alt="" width="26" height="26"/><span>ID Card Studio</span>
        </a>
        <div className="ids-tabs" role="tablist" aria-label="Studio">
          {tabs.map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={"ids-tab" + (tab === k ? " is-on" : "")} onClick={() => setTab(k)}>
              {l}{n != null && <span className="ids-tab-n">{n}</span>}
            </button>
          ))}
        </div>
        <span className="ids-grow"/>
        {!phone && <span className="ids-design">Design: <b>{designLabel}</b></span>}
        <a href="/club-admin" className="ids-btn ids-btn--34 ids-btn--outline-soft" onClick={e => { e.preventDefault(); setPage && setPage("club-admin"); }}><IdsIcon name="arrow-left"/>Club portal</a>
      </header>

      {data.state === "forbidden" ? (
        <div className="ids-page"><div className="ids-state is-error" role="alert"><IdsIcon name="lock"/><span>Printing ID cards needs the People or Summer School permission. Ask an admin to grant it.</span></div></div>
      ) : tab === "make" ? (phone
        ? (data.state === "ready" ? <IdsPhoneQueue recs={recs} isBlocked={isBlocked} onAsk={askPhoto}/> : <div className="ids-page"><IdsLoadState state={data.state} onRetry={load} what="the records"/></div>)
        : (
          <div className={"ids-make " + gridCls}>
            <IdsSource M={M}/>
            <IdsSheetCol M={M}/>
            <IdsSettings M={M}/>
          </div>
        )) : tab === "log" ? <IdsLog runs={log.runs} state={log.state === "idle" ? "loading" : log.state} onRetry={loadLog} onOpen={openRun} narrow={W < 900}/>
        : <IdsLookup lookup={lookup} design={designLabel} onQueue={queueReprint}/>}

      {confirm && <IdsConfirm run={confirm} onCancel={() => setConfirm(null)} onPrint={onConfirmPrint}/>}
      {after && <IdsAfterPrint items={after.items} renderFace={renderFace} onLater={() => { setAfter(null); say("You can mark failures from the print log later."); }} onDone={afterDone}/>}
      {runOpen && <IdsRunDrawer run={runOpen} phone={phone} onClose={() => setRunOpen(null)} onReprint={reprintRun}/>}
      {toastNode}

      {printJob && (
        <div className="ids-print-host" aria-hidden="true">
          <div ref={hostRef}>
            {printJob.test ? <IdsPrintSide G={G} slots={[]} sheetIdx={0} skip={0} face="front" backs="off" marks test renderFace={renderFace}/> : <>
              {printJob.packing && <IdsPackingList nSheets={nSheets} from={printJob.a} to={printJob.b} proof={printJob.reason === "proof"}
                pages={Array.from({ length: printJob.b - printJob.a + 1 }, (_, k) => {
                  const p = printJob.a - 1 + k;
                  return { n: p + 1, cards: inRange(p + 1, p + 1).map(x => ({ slot: x.slotN, name: x.s.label, id: x.s.rec ? (x.s.rec.displayId || "Assigned on print") : "Uploaded", centre: x.s.centre })) };
                })}/>}
              {Array.from({ length: printJob.b - printJob.a + 1 }, (_, k) => printJob.a - 1 + k).map(p => (st.backs !== "off" ? ["front", "back"] : ["front"]).map(f => (
                <IdsPrintSide key={p + f} G={G} slots={slots} sheetIdx={p} skip={st.skip} face={f} backs={st.backs} marks={st.marks} proof={printJob.reason === "proof"} renderFace={renderFace}/>
              )))}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
