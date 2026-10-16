/* ============================================================================
   ID Card Studio — the page (/club/id-cards). ID_CARD_STUDIO.md.

   One component owns the queue, the settings and the run; the tabs only draw
   what it hands them through `M`. Three things are easy to get wrong here:
   - The layout follows the studio's own width (ResizeObserver), never the
     window's. Below 760px it is a Queue, never a sheet.
   - What is on the sheet is printed by the same faces, from a hidden host in
     millimetres; nothing is drawn twice.
   - Print makes a PDF of the sheet (ids-print.jsx), never the browser's print
     dialog. A print is logged only when the PDF was made; a failed card found
     afterwards is marked on the run it came from and goes back in the queue.
   - Each card type prints with the design assigned to it — a published,
     versioned Design Studio template and its paired back — or the standard
     card. The sheet takes the size of the cards on it, never the reverse, and
     every run records the template and version the server says it used.
   ========================================================================== */
/* RESTORE PROGRESS (features the 6c45071 rebuild dropped from the old Card
   Studio / Control Room ID screens; a resumed run picks up from here):
   [x] F1 standard card size per subject + the lanyard size setting
   [x] F2 a card that fails to draw costs its slot, not the sheet
   [x] F3 no-centre filter + warning, range by date / ID number, paste IDs
   [x] F4 per-card edit photo, resend ID (PNG download is F5)
   [x] F5 print-ready PDF (bleed, crop marks, CMYK intent, duplex, dpi, QR verify, art probe) + PNG ZIP
   [x] F6 volunteer tiers (code + card colour)
   [x] F7 warm the hosted QR cache
   [x] F8 log paging, first/repeat + mark failed later in the run drawer, look up by record id */

const IDS_DEFAULT_SETTINGS = { size: "cr80p", cw: 60, ch: 90, paper: "a4", margin: IDS_MARGIN.def, gap: IDS_GAP.def, skip: 0,
  backs: "off", marks: true, dpi: 300, order: "centre", breakBy: true, packing: true, reason: "new" };
const IDS_REASON_LABEL = Object.fromEntries(IDS_REASONS);
const IDS_KIND_FOR_RUN = { member: "member", summer: "student", volunteer: "volunteer", afrovanguard: "afrovanguard" };
const IDS_ASK_QUIET_MS = 3 * 864e5;   // the server's quiet period: asking again inside it needs an explicit press
const IDS_ASK_MAX = 200;              // and its cap per request
const IDS_QR_WARM_CHUNK = 8;          // hosted QR PNGs sent per request (~30 KB), so no request trips a host's body filter
/* "The records with no centre on file": a value no real centre can collide with, so the filter stays one value. */
const IDS_NO_CENTRE = "\u0000none";
const IDS_CARDED_MAX = 8;   // people with a card shown under a name search
function idsAskedRecently(a) { return !!(a && a.at && Date.now() - Date.parse(a.at) < IDS_ASK_QUIET_MS); }
/* The subjects that have somewhere to send their ID, and whose photo the
   shared PhotoEditor can re-crop or replace. Members issue their own card from
   their dashboard and the photo pipeline has no member target, so a member
   gets neither button rather than one that cannot act (CLAUDE.md §11). */
const IDS_RESEND = { summer: { kind: "student", to: "their guardian" }, volunteer: { kind: "volunteer", to: "them" } };
const IDS_PHOTO_EDIT = { member: "member", summer: "student", volunteer: "volunteer" };
/** A scannable PNG of a token's /q/ address, for the emailed ID (mail clients strip data: QR images, so the server hosts it). */
function idsQrPng(token) {
  return new Promise(res => {
    if (window.qrcode) return res(window.qrcode);
    let sc = document.getElementById("ngg-qrlib");
    if (!sc) { sc = document.createElement("script"); sc.id = "ngg-qrlib"; sc.src = "/vendor/qrcode.min.js"; document.head.appendChild(sc); }
    sc.addEventListener("load", () => res(window.qrcode), { once: true });
    sc.addEventListener("error", () => res(null), { once: true });
    setTimeout(() => res(window.qrcode || null), 6000);
  }).then(lib => {
    if (!lib || !token) return "";
    return idsQrPngWith(lib, token);
  });
}
/* A PNG, drawn on a canvas. The encoder's own createDataURL makes a GIF, which
   the server's QR cache refuses (it stores PNG only) — the old studio's warm-up
   sent GIFs and so never warmed anything. */
function idsQrPngWith(lib, token) {
  try {
    const q = lib(0, "M"); q.addData(location.origin + "/q/" + String(token)); q.make();
    const n = q.getModuleCount(), cell = 8, margin = 16, size = n * cell + margin * 2;
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
    ctx.save(); ctx.translate(margin, margin); q.renderTo2dContext(ctx, cell); ctx.restore();
    return cv.toDataURL("image/png");
  } catch (_) { return ""; }
}
function idsErrText(e, fallback) { return (e && e.data && e.data.message) || fallback; }

function idsReadUploadFiles(files) {
  const list = Array.from(files || []).filter(f => /^image\/(png|jpe?g|webp)$/.test(f.type));
  return Promise.all(list.map(file => new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ uid: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: file.name, src: fr.result,
        w: img.naturalWidth, h: img.naturalHeight, copies: 1, rot: 0, fit: "contain", backOf: null, back: "" });
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
  /* The right-hand panel shows Settings or the Assistant (v4). Below 1024px
     there is no third column: the same panel opens as a drawer over the sheet. */
  const [pane, setPaneS] = React.useState(() => { try { return localStorage.getItem("ngg.ids.pane") === "assistant" ? "assistant" : "settings"; } catch (_) { return "settings"; } });
  const setPane = p => { setPaneS(p); try { localStorage.setItem("ngg.ids.pane", p); } catch (_) {} };
  const [drawer, setDrawer] = React.useState(false);
  const paneTrigger = React.useRef(null);
  // The composer remounts with the pane, so it is found when it is there, not held.
  const focusComposer = (n = 0) => { const el = document.getElementById("ids-ai-in"); if (el) el.focus(); else if (n < 20) setTimeout(() => focusComposer(n + 1), 30); };

  /* ── Data ── */
  const [data, setData] = React.useState({ state: "loading", records: [], queue: [], programs: {}, kinds: [], designs: {}, choices: {} });
  const load = React.useCallback(() => {
    setData(d => Object.assign({}, d, { state: "loading" }));
    idsLoad().then(r => { setData(Object.assign({ state: "ready" }, r)); if (r.avNote) say(r.avNote); })
      .catch(e => setData(d => Object.assign({}, d, { state: e && e.forbidden ? "forbidden" : "error" })));
  }, []);
  React.useEffect(load, [load]);
  const [done, setDone] = React.useState({});     // printed this session: off the queue
  const [asked, setAsked] = React.useState({});   // asked this session: "type:id" => { at, channels }
  const recs = React.useMemo(() => data.queue.filter(r => !done[r.key]), [data.queue, done]);
  const byKey = React.useMemo(() => Object.fromEntries(data.records.map(r => [r.key, r])), [data.records]);
  const centres = React.useMemo(() => [...new Set(data.records.map(r => r.centre).filter(Boolean))].sort(), [data.records]);
  const accentOf = React.useMemo(() => {
    const m = {};
    data.records.forEach(r => { if (r.centreObj && r.centreObj.color) m[r.centre] = r.centreObj.color; });
    return c => m[c] || "var(--ids-centre-other)";
  }, [data.records]);
  // An Afrovanguard card without a photo prints the member's initials, as Afrovanguard designed it.
  const isBlocked = r => r.kind !== "afrovanguard" && !r.photoUrl;
  const designOfKind = k => k === "afrovanguard" ? null : (data.designs || {})[IDS_KIND_FOR_RUN[k]] || null;
  // Afrovanguard's card is Afrovanguard's design: no studio template is ever put on it.
  const designOf = rec => rec.kind === "afrovanguard" ? null : (data.designs || {})[rec.subjectType] || null;
  const mmOf = rec => idsRecordMm(designOf(rec), rec.kind, (data.programs || {})[rec.kind]);

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
  // G is the grid for UPLOADED images (the "Card size" setting); a record's card prints at its own size.
  const G = idsGrid(Object.assign({}, st, { customW: st.cw, customH: st.ch }));
  const upMm = [G.cw, G.ch];

  const inQ = React.useMemo(() => new Set(queue.map(x => x.t === "r" ? x.key : x.uid)), [queue]);
  const upById = React.useMemo(() => Object.fromEntries(uploads.map(u => [u.uid, u])), [uploads]);

  /* ── The records list (§3.1) ── */
  const ql = q.trim().toLowerCase();
  /* A range: "not everybody", said the three ways coordinators say it — by
     when they registered, by the block of ID numbers they were given, or by a
     pasted list (restored from the old Card Studio). Applied AFTER the centre,
     because that is the order it is said in: "Egbeda, the ones from last week". */
  /* v4 adds "by name" and makes "by ID" read the printed ID alphabetically
     ("EG-26-1100" to "EG-26-1150"); a range of bare digits still means the
     serial at the end of the ID, which is what a coordinator handed a block of
     numbers says. Partial values work and the ends are inclusive: "Ade" to
     "Chi" covers Ade… through Chi…; ends typed the wrong way round swap. */
  const [rmode, setRmode] = React.useState("name");      // name | id | date | paste
  const [rng, setRng] = React.useState({ dFrom: "", dTo: "", nFrom: "", nTo: "" });
  const rangeAlpha = idsRangeEnds(rng.nFrom, rng.nTo);
  const rangeKeyOf = r => rmode === "name" ? String(r.name || "") : String(r.displayId || r.id || "");
  const alphaRanged = (rmode === "name" || (rmode === "id" && !rangeAlpha.digits)) && (rangeAlpha.lo !== "" || rangeAlpha.hi !== "");
  const inRangeRec = r => {
    if (rmode === "date" && (rng.dFrom || rng.dTo)) return !!r.day && (!rng.dFrom || r.day >= rng.dFrom) && (!rng.dTo || r.day <= rng.dTo);
    if (rmode === "id" && rangeAlpha.digits) {
      const lo = rangeAlpha.lo === "" ? -Infinity : Number(rangeAlpha.lo), hi = rangeAlpha.hi === "" ? Infinity : Number(rangeAlpha.hi);
      return r.seq !== null && r.seq >= lo && r.seq <= hi;
    }
    if (alphaRanged) return idsInAlphaRange(rangeKeyOf(r), rangeAlpha.lo, rangeAlpha.hi);
    return true;
  };
  const inCentre = r => !centre || (centre === IDS_NO_CENTRE ? !r.centre : r.centre === centre);
  const preRange = recs.filter(r => (!kind || r.kind === kind) && inCentre(r) && (!ql || (r.name + " " + r.displayId + " " + r.id).toLowerCase().includes(ql)));
  const base = preRange.filter(inRangeRec);
  const undated = rmode === "date" && (rng.dFrom || rng.dTo) ? preRange.filter(r => !r.day).length : 0;
  const noCentreCount = recs.filter(r => (!kind || r.kind === kind) && !r.centre).length;
  const cnt = { new: base.filter(r => !isBlocked(r) && r.reason === "new").length, reprint: base.filter(r => !isBlocked(r) && r.reason === "reprint").length, blocked: base.filter(isBlocked).length, all: base.length };
  const shown0 = base.filter(r => filter === "all" ? true : filter === "blocked" ? isBlocked(r) : !isBlocked(r) && r.reason === filter);
  // While a range is set the list reads in the range's own order, so its two ends are where you look.
  const shown = alphaRanged || (rmode === "id" && rangeAlpha.digits && (rangeAlpha.lo !== "" || rangeAlpha.hi !== ""))
    ? shown0.slice().sort((a, b) => rmode === "name" ? String(a.name).localeCompare(String(b.name)) : rangeAlpha.digits ? (a.seq || 0) - (b.seq || 0) : rangeKeyOf(a).localeCompare(rangeKeyOf(b)))
    : shown0;
  const addable = shown.filter(r => !isBlocked(r) && !inQ.has(r.key));
  /* Every card prints at its own size: a record at its design's (or its
     standard card's) size, an uploaded image at the size set for uploads. A
     card of another size is never refused or squeezed into the wrong slot; it
     goes onto sheets of its own (idsSections), after the others. */
  const addRecs = (list, msg) => {
    if (!list.length) return 0;
    const prev = queue;
    setQueue(prev.concat(list.map(r => ({ t: "r", key: r.key }))));
    const sizes = new Set(list.map(r => idsMmLabel(mmOf(r))).concat(cards.map(c => idsMmLabel(c.mm))));
    say((msg || idsN(list.length, "card") + " added") + (sizes.size > 1 ? ". Each card size prints on its own sheets" : ""), () => setQueue(prev));
    return list.length;
  };
  const toggleRec = r => {
    if (isBlocked(r)) return say("Needs a photo first");
    if (inQ.has(r.key)) { setQueue(qq => qq.filter(x => !(x.t === "r" && x.key === r.key))); setSel(null); return; }
    setQueue(qq => qq.concat([{ t: "r", key: r.key }]));
  };

  /* Photo requests go to the person (a child's guardians), and one summary to
     the admins for their centres. What the toast says comes from the server's
     per-row verdicts, not from what was pressed. */
  const askedOf = r => asked[r.key] || r.asked;
  const nameOfRow = x => { const r = data.records.find(y => y.id === x.subjectId && (!x.subjectType || y.subjectType === x.subjectType)); return r ? r.name : "That person"; };
  const askPhotos = (list, force) => {
    if (!list.length) return Promise.resolve();
    return NGGApi.admin.idStudio.askPhoto(list.map(r => ({ subjectType: r.subjectType, subjectId: r.id })), !!force).then(res => {
      const at = new Date().toISOString();
      setAsked(a => {
        const n = Object.assign({}, a);
        (res.results || []).forEach(x => { if (x.sent) n[x.subjectType + ":" + x.subjectId] = { at, channels: x.sent }; });
        return n;
      });
      say(idsAskSummary(res, nameOfRow));
    }).catch(e => say(idsErrText(e, "Couldn’t send the request. Try again.")));
  };
  const askOne = r => askPhotos([r], idsAskedRecently(askedOf(r)));
  const askable = shown.filter(r => isBlocked(r) && !idsAskedRecently(askedOf(r)));
  const [askConfirm, setAskConfirm] = React.useState(null);   // the list, frozen when the dialog opened
  /* A list of IDs pasted from a message: matched on the printed ID or the
     record id, case- and separator-insensitive, or a bare number on the ID's
     sequence. The matches go on the sheet; the misses are named. */
  const pasteIds = (text, pool) => {
    const norm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Report what was typed, not its normalised form ("026-003", not "026003").
    const wanted = String(text || "").split(/[\s,;]+/).map(raw => ({ raw: raw.trim(), w: norm(raw) })).filter(x => x.w);
    if (!wanted.length) return { matched: 0, miss: [], hidden: [], carded: [], nothing: true };
    const hit = [], miss = [], hidden = [], carded = [], blocked = [];
    const find = (list, w) => list.find(c => norm(c.displayId) === w || norm(c.id) === w || (/^\d+$/.test(w) && c.seq === parseInt(w, 10)));
    wanted.forEach(({ raw, w }) => {
      const r = find(pool, w);
      /* On record but outside the Kind / Centre / search filters: say so, rather
         than "not found" for somebody who is there. */
      if (!r) {
        if (find(recs, w)) hidden.push(raw);
        /* Already carded, so off the queue: name them and offer the reprint
           route, which is how a carded person goes back on a sheet. */
        else { const c = find(data.records, w); if (c) { if (!carded.includes(c)) carded.push(c); } else miss.push(raw); }
        return;
      }
      if (isBlocked(r)) blocked.push(r.name); else if (!hit.includes(r) && !inQ.has(r.key)) hit.push(r);
    });
    const added = hit.length ? addRecs(hit, idsN(hit.length, "card") + " matched from the list") : 0;
    return { matched: added, otherSize: hit.length - added, miss, hidden, carded, blocked };
  };
  const queueReprints = async (list, cause) => {
    const rs = IDS_REPRINT_REASONS.find(x => x[0] === cause);
    const items = list.map(r => ({ subjectType: r.subjectType, subjectId: r.id, cause: cause || "asked", why: rs ? rs[1] : "Reprint asked for by ID" }));
    if (!items.length) return false;
    try { await NGGApi.admin.idStudio.reprint(items); say(idsN(items.length, "card") + " queued as reprints"); load(); return true; }
    catch (e) { say(idsErrText(e, "Couldn’t queue the reprint. Try again.")); return false; }
  };
  /* Per-card acts the old Card Studio had on every card: resend the digital
     ID, and re-crop or replace the photo. */
  const [resending, setResending] = React.useState("");
  const [editPhoto, setEditPhoto] = React.useState(null);
  const [framePhoto, setFramePhoto] = React.useState(null);
  const resendOne = async r => {
    const R0 = IDS_RESEND[r.kind];
    if (!R0 || resending) return;
    setResending(r.key);
    try {
      const qrPng = r.raw && r.raw.token ? await idsQrPng(r.raw.token) : "";
      const res = await NGGApi.admin.registration.resendId(R0.kind, r.id, qrPng);
      const ch = res.channels || [];
      /* No channel went: say whether that is a record with no contact, or a
         send that failed — "nobody on file" for somebody with an email on
         file sends the operator to fix the wrong thing. */
      const onFile = !!res.onFile;
      say(ch.length ? r.name + "’s ID sent by " + ch.join(" and ") + (res.qr ? ", with the QR" : "") + "."
        : onFile ? "Couldn’t send " + r.name + "’s ID — the email or text didn’t go. Check the mail settings, then try again."
        : "Nobody on file to send " + r.name + "’s ID to. Add an email or phone to their record first.");
    } catch (e) {
      const c = e && (e.code || e.message);
      say(c === "no_id" ? "No ID has been issued to " + r.name + " yet." : c === "forbidden" || (e && e.status === 403) ? "Resending this ID needs the " + (r.kind === "summer" ? "Summer School" : "People") + " permission." : idsErrText(e, "Couldn’t resend " + r.name + "’s ID. Try again."));
    } finally { setResending(""); }
  };
  /* A name search reaches everyone, not only the queue: somebody who already
     holds a card is found too, with a Reprint on their row. "Lost her card"
     starts with typing her name, and the queue does not have her in it. */
  const [reprintOpen, setReprintOpen] = React.useState("");
  const [reprinting, setReprinting] = React.useState("");
  const queuedKeys = React.useMemo(() => new Set(recs.map(r => r.key)), [recs]);
  const carded = ql.length >= 2 ? data.records.filter(r => r.printedBefore && !queuedKeys.has(r.key) && (!kind || r.kind === kind) && inCentre(r)
    && (r.name + " " + r.displayId + " " + r.id).toLowerCase().includes(ql)) : [];
  const reprintOne = async (r, cause) => {
    if (reprinting) return;
    setReprinting(r.key);
    const ok = await queueReprints([r], cause);
    setReprinting("");
    if (!ok) return;
    setReprintOpen("");
    // Straight onto the sheet: the operator searched for them to print them.
    if (!isBlocked(r) && !inQ.has(r.key)) setQueue(qq => qq.concat([{ t: "r", key: r.key }]));
    if (filter !== "all" && filter !== "reprint") setFilter("reprint");
  };
  const records = {
    q, setQ, kind, setKind, centre, setCentre, filter, setFilter: f => { setFilter(f); setLim(IDS_REC_PAGE); },
    noCentreCount, rmode, setRmode: m => { setRmode(m); setRng({ dFrom: "", dTo: "", nFrom: "", nTo: "" }); }, rng, setRng: p => setRng(r => Object.assign({}, r, p)),
    clearRange: () => setRng({ dFrom: "", dTo: "", nFrom: "", nTo: "" }),
    rangeSet: (rmode === "date" && !!(rng.dFrom || rng.dTo)) || ((rmode === "name" || rmode === "id") && (rangeAlpha.lo !== "" || rangeAlpha.hi !== "")),
    rangeLo: rangeAlpha.shownLo, rangeHi: rangeAlpha.shownHi, rangeDigits: rangeAlpha.digits,
    undated, ranged: base.length !== preRange.length || undated > 0, inRangeN: base.length, preRangeN: preRange.length, pasteIds: list => pasteIds(list, preRange), queueReprints,
    // Status: pressing the one that is on again shows everybody (v4).
    filters: [["new", "New", "ok", "Have a photo and have never had a card"], ["reprint", "Reprints", "warn", "Lost, damaged or details changed"], ["blocked", "Blocked", "bad", "No approved photo yet"]]
      .map(([k, label, dot, help]) => ({ k, label, dot, help, n: cnt[k], on: filter === k })),
    narrowed: !!(kind || centre || ((rmode === "name" || rmode === "id" || rmode === "date") && (rng.dFrom || rng.dTo || rng.nFrom || rng.nTo))),
    shown, addable: addable.length, canAddAll: addable.length > 0, addAll: () => addRecs(addable),
    askable: askable.length, canAskAll: filter === "blocked" && askable.length > 1, askAll: () => setAskConfirm(askable.slice(0, IDS_ASK_MAX)),
    more: Math.max(0, shown.length - lim), showMore: () => setLim(l => l + IDS_REC_MORE),
    carded: carded.slice(0, IDS_CARDED_MAX).map(r => {
      const at = r.lastIssue && r.lastIssue.at ? idsAskedOn(r.lastIssue) + " " + String(r.lastIssue.at).slice(0, 4) : "";
      return Object.assign({}, r, { printedOn: at, open: reprintOpen === r.key, busy: reprinting === r.key,
        toggleOpen: () => setReprintOpen(k => k === r.key ? "" : r.key), reprint: cause => reprintOne(r, cause) });
    }),
    cardedMore: Math.max(0, carded.length - IDS_CARDED_MAX),
    rows: shown.slice(0, lim).map(r => {
      const b = isBlocked(r), on = inQ.has(r.key), wasAsked = askedOf(r), recent = idsAskedRecently(wasAsked);
      const tag = b ? (wasAsked ? "Photo requested " + idsAskedOn(wasAsked) + " · waiting for approval" : "No photo yet · can’t print") : r.reason === "reprint" ? "Reprint · " + (r.why || "requested") : r.divMissing ? "New · division is blank" : r.kind === "afrovanguard" && !r.hasPhoto ? "New card · no photo, prints initials" : "New card";
      return Object.assign({}, r, { blocked: b, on, tag, tagTone: b ? (recent ? "muted" : "bad") : r.reason === "reprint" || r.divMissing ? "warn" : "muted",
        aria: (on ? "Take " : "Put ") + r.name + (on ? " off the sheet" : " on the sheet"), toggle: () => toggleRec(r),
        asked: recent, askedOn: wasAsked ? idsAskedOn(wasAsked) : "", askLabel: recent ? "Ask again" : "Ask for photo", ask: () => askOne(r),
        canEditPhoto: !!IDS_PHOTO_EDIT[r.kind], editPhoto: () => setEditPhoto(r) });
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
      if (x.t === "r") { const r = byKey[x.key]; if (r) out.push({ key: r.key, base: r.key, rec: r, label: r.name, centre: r.centre, kind: r.kind, name: r.name, mm: mmOf(r) }); }
      else { const u = upById[x.uid]; if (u) for (let c = 0; c < u.copies; c++) out.push({ key: u.uid + "#" + c, base: u.uid, upload: u, label: u.name, centre: "", kind: "upload", name: u.name, mm: upMm }); }
    });
    return out;
    // eslint-disable-next-line
  }, [queue, byKey, upById, upMm[0], upMm[1], data.designs, data.programs]);
  const sorted = React.useMemo(() => idsSort(cards, st.order, c => ({ centre: c.centre, kind: c.kind, name: c.name })), [cards, st.order]);
  const breakActive = st.breakBy && (st.order === "centre" || st.order === "kind");
  /* One section per card size, each on its own sheets and its own grid. */
  const layout = React.useMemo(() => idsSections(sorted, c => c.mm, { paper: st.paper, margin: st.margin, gap: st.gap }, st.skip,
    breakActive ? (c => st.order === "centre" ? c.centre : c.kind) : null, IDS_SIZE_TOL), [sorted, st.paper, st.margin, st.gap, st.skip, breakActive, st.order]);
  const [badPhotos, setBadPhotos] = React.useState({});   // photoUrl → true when it can't be loaded
  const sections = layout.sections.map(sec => Object.assign({}, sec, { slots: sec.slots.map(s => {
    if (s.pad) return s;
    let warn = null;
    if (s.rec && s.rec.divMissing) warn = { tone: "warn", text: "Division is blank on the record" };
    if (s.rec && badPhotos[s.rec.photoUrl]) warn = { tone: "bad", text: "The photo file is missing on the server" };
    if (s.upload) { const d = idsDpiChip(idsEffDpi(s.upload, sec.G.cw, sec.G.ch), st.dpi); if (d.tone !== "ok") warn = { tone: d.tone, text: d.label }; }
    return Object.assign({}, s, { warn, cw: sec.G.cw, ch: sec.G.ch, sec: sec.key });
  }) }));
  const slots = [].concat(...sections.map(sec => sec.slots));
  const pads = sections.reduce((n, sec) => n + sec.pads, 0);
  const nSheets = layout.nSheets;
  const stock = { sheets: nSheets, sides: nSheets * (st.backs === "off" ? 1 : 2),
    used: nSheets ? Math.round(cards.length / sections.reduce((n, sec) => n + sec.count * sec.G.per, 0) * 100) : 0 };
  React.useEffect(() => { if (sheetIdx > Math.max(0, nSheets - 1)) setSheetIdx(Math.max(0, nSheets - 1)); }, [nSheets, sheetIdx]);
  const lastSec = sections[sections.length - 1] || null;
  const gap = lastSec && lastSec.count ? lastSec.count * lastSec.G.per - lastSec.skip - lastSec.slots.length : 0;
  const ready = recs.filter(r => !isBlocked(r) && !inQ.has(r.key));
  // The last sheet is filled with cards of ITS size; another size would start a sheet of its own.
  const fillable = lastSec ? ready.filter(r => idsSameMm(mmOf(r), lastSec.mm)) : [];
  const fillGap = () => addRecs(fillable.slice(0, gap), "Filled " + idsN(Math.min(gap, fillable.length), "slot"));
  const here = idsSheetAt(sections, sheetIdx);
  const sheetG = here ? here.sec.G : G;

  /* Delete a sheet: everything on it comes off the run, with Undo. An uploaded
     image printed in copies loses only the copies that were on this sheet. */
  const removeSheet = idx => {
    const on = idsCardsOnSheets(sections, idx + 1, idx + 1);
    if (!on.length) return;
    const prevQ = queue, prevU = uploads;
    const recKeys = new Set(on.filter(x => x.s.rec).map(x => x.s.rec.key));
    const upCut = {};
    on.filter(x => x.s.upload).forEach(x => { upCut[x.s.upload.uid] = (upCut[x.s.upload.uid] || 0) + 1; });
    const gone = new Set(Object.keys(upCut).filter(uid => (upById[uid] || {}).copies <= upCut[uid]));
    setUploads(us => us.map(u => upCut[u.uid] && !gone.has(u.uid) ? Object.assign({}, u, { copies: u.copies - upCut[u.uid] }) : u));
    setQueue(qq => qq.filter(x => x.t === "r" ? !recKeys.has(x.key) : !gone.has(x.uid)));
    setSel(null);
    say("Sheet " + (idx + 1) + " removed · " + idsN(on.length, "card") + " off the run", () => { setQueue(prevQ); setUploads(prevU); });
  };

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
  // Moves among the cards of its own size: a step past a card of another size would change nothing on any sheet.
  const moveSel = d => {
    if (!selCard) return;
    const same = sorted.filter(c => idsSameMm(c.mm, selCard.mm)), j = same.findIndex(c => c.key === sel), to = same[j + d];
    if (to) reorder(sel, sorted.indexOf(to));
  };
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
  const designNoBack = st.backs !== "off" ? recCards.filter(c => { const d = designOf(c.rec); return d && !d.back; }) : [];
  const photoGone = recCards.filter(c => badPhotos[c.rec.photoUrl]);
  const needId = st.reason === "proof" ? [] : recCards.filter(c => c.rec.kind === "member" && !c.rec.displayId);
  const noDiv = recCards.filter(c => c.rec.divMissing);
  const reprints = recCards.filter(c => c.rec.reason === "reprint");
  const blockedCount = recs.filter(isBlocked).length;
  const checks = [];
  sections.filter(sec => !sec.G.per).forEach(sec => checks.push({ tone: "bad", text: "Cards at " + idsMmLabel(sec.mm) + " don’t fit on " + IDS_PAPERS[st.paper][0] + " with these margins. Use bigger paper or smaller margins." }));
  if (sections.length > 1) checks.push({ tone: "info", text: "Cards in " + sections.length + " sizes, so each size prints on its own sheets: " + sections.map(sec => idsN(sec.n, "card") + " at " + idsMmLabel(sec.mm) + " (" + idsSheetSpan(sec) + ")").join(", ") + "." });
  if (photoGone.length) {
    const gone = new Set(photoGone.map(c => c.base));
    checks.push({ tone: "bad", text: idsN(photoGone.length, "photo") + " can’t be loaded (" + photoGone.slice(0, 3).map(c => c.label).join(", ") + (photoGone.length > 3 ? "…" : "") + "): the file is missing on the server, so the card would print with an empty photo box. Replace the photo, or take " + (photoGone.length === 1 ? "it" : "them") + " off the sheet.",
      action: "Take " + (photoGone.length === 1 ? "it" : "them") + " off", onAction: () => setQueue(qq => qq.filter(x => !(x.t === "r" && gone.has(x.key)))) });
  }
  if (lowDpi.length) checks.push({ tone: lowDpi.some(u => idsDpiChip(idsEffDpi(u, G.cw, G.ch), st.dpi).tone === "bad") ? "bad" : "warn", text: idsN(lowDpi.length, "uploaded image") + " " + (lowDpi.length === 1 ? "is" : "are") + " below " + st.dpi + " dpi at this size and may print soft." });
  if (sideways.length) checks.push({ tone: "warn", text: idsN(sideways.length, "image") + " look sideways for this card.", action: "Rotate them", onAction: () => setUploads(us => us.map(u => sideways.some(s => s.uid === u.uid) ? Object.assign({}, u, { rot: ((u.rot || 0) + 90) % 360 }) : u)) });
  if (noBack.length) checks.push({ tone: "warn", text: idsN(noBack.length, "uploaded card") + " have no back image, so the back prints blank." });
  if (designNoBack.length) checks.push({ tone: "info", text: idsN(designNoBack.length, "card") + " use a design with no paired back, so the standard back prints behind them." });
  if (needId.length) checks.push({ tone: "info", text: (needId.length === 1 ? "1 member gets their ID number" : needId.length + " members get their ID numbers") + " when you print. It’s theirs for good, and never reissued." });
  if (noDiv.length) checks.push({ tone: "warn", text: idsN(noDiv.length, "card") + " show no division, because it’s blank on the record." });
  if (reprints.length) {
    const newQr = reprints.filter(c => ["lost", "never_received", "qr"].indexOf(c.rec.cause) >= 0).length;
    checks.push({ tone: "info", text: idsN(reprints.length, "reprint") + " will use the current design. "
      + (newQr ? idsN(newQr, "lost card") + " get" + (newQr === 1 ? "s" : "") + " a new QR, and the lost " + (newQr === 1 ? "card stops" : "cards stop") + " working at the gate. " : "")
      + (reprints.length - newQr ? (newQr ? "The rest keep" : "They keep") + " the QR already on their card, so the old card still opens until it is handed back." : "") });
  }
  if (blockedCount) checks.push({ tone: "info", text: idsN(blockedCount, "person", "people") + " are left out because they have no photo yet.", action: "See who", onAction: () => { setSrc("records"); setFilter("blocked"); } });
  if (!checks.some(c => c.tone === "warn" || c.tone === "bad") && cards.length) checks.push({ tone: "ok", text: "Ready to print. Everything on the sheet checks out." });
  const toneRank = { ok: 0, bad: 1, warn: 2, info: 3 };
  checks.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
  const hasBad = checks.some(c => c.tone === "bad");
  const printBlock = !cards.length ? "Put some cards on the sheet first" : hasBad ? "Fix the red item first" : "";

  /* A record's photo that will not load — a stored file gone from the server
     (photo.php answers 404) — would print as an empty photo box. Each photo on
     the sheet is tried once, a few at a time, and a failure is named on its
     slot and in the checks before anything prints. */
  const photoTried = React.useRef({});
  const sheetPhotos = recCards.map(c => c.rec.photoUrl).filter(Boolean);
  const sheetPhotosSig = [...new Set(sheetPhotos)].join("\n");
  React.useEffect(() => {
    const todo = [...new Set(sheetPhotos)].filter(u => !(u in photoTried.current));
    if (!todo.length) return undefined;
    todo.forEach(u => { photoTried.current[u] = null; });
    const tryOne = u => new Promise(res => {
      const im = new Image();
      const t = setTimeout(() => res(true), 15000);           // slow is not missing
      im.onload = () => { clearTimeout(t); res(true); };
      im.onerror = () => { clearTimeout(t); res(false); };
      im.src = typeof nggPhotoSrc === "function" ? nggPhotoSrc(u) : u;
    });
    (async () => {
      for (let i = 0; i < todo.length; i += 6) {
        const part = todo.slice(i, i + 6);
        const ok = await Promise.all(part.map(tryOne));
        part.forEach((u, k) => { photoTried.current[u] = ok[k]; });
        const bad = part.filter((u, k) => !ok[k]);
        // Kept even if the sheet changed meanwhile: the verdict is about the URL, not the sheet.
        if (bad.length) setBadPhotos(b => Object.assign({}, b, Object.fromEntries(bad.map(u => [u, true]))));
      }
    })();
    return undefined;
    // eslint-disable-next-line
  }, [sheetPhotosSig]);

  /* ── Scenarios (§3.2.1) ── */
  const applyScenario = key => {
    const sc = IDS_SCENARIOS.find(s => s.key === key);
    if (!sc) return;
    setScen(key); setSrc(sc.src);
    if (sc.filter) setFilter(sc.filter);
    set(Object.assign({ order: sc.order, breakBy: sc.breakBy, packing: sc.packing, reason: sc.reason }, sc.dpi ? { dpi: sc.dpi } : {}));
    if (sc.focusSearch) setTimeout(() => searchRef.current && searchRef.current.focus(), 30);
  };
  /* Changing the job changes several things at once; the toast says which, and Undo puts them back (v4). */
  const pickJob = key => {
    const sc = IDS_SCENARIOS.find(x => x.key === key);
    if (!sc || key === scen) return;
    const was = { scen, src, filter, st };
    applyScenario(key);
    const bits = [sc.src === "uploads" ? "showing uploads" : sc.filter === "all" ? "showing everyone" : "showing " + (sc.filter === "reprint" ? "reprints" : "new cards"),
      "sorted by " + ((IDS_ORDERS.find(o => o[0] === sc.order) || IDS_ORDERS[0])[1]).toLowerCase(), sc.packing ? "packing list on" : "no packing list"];
    if (sc.dpi && sc.dpi !== st.dpi) bits.push(sc.dpi + " dpi");
    say("Job: " + sc.label + " · " + bits.join(", "), () => { setScen(was.scen); setSrc(was.src); setFilter(was.filter); setSt(was.st); });
  };

  /* ── Printing (§4) ── */
  /* Which design each card type prints with — the header says it, the confirm
     says it for the kinds on this sheet, and the Designs section changes it. */
  const designName = d => d ? d.name + " v" + d.version : "Standard card";
  const kindsHere = data.kinds.filter(k => k !== "afrovanguard").filter(k => (data.choices || {})[IDS_KIND_FOR_RUN[k]] !== undefined || (data.designs || {})[IDS_KIND_FOR_RUN[k]] !== undefined);
  /* The header names only the card types printing with a design of their own;
     every other type prints the standard card, said once. */
  const designHead = (() => {
    const own = kindsHere.filter(k => (data.designs || {})[IDS_KIND_FOR_RUN[k]]);
    const std = kindsHere.length - own.length;
    return own.map(k => IDS_KINDS[k] + ": " + designName((data.designs || {})[IDS_KIND_FOR_RUN[k]])).concat(std ? [own.length ? "the rest standard" : "Standard cards"] : []).join(" · ") || "Standard cards";
  })();
  const sheetKinds = [...new Set(recCards.map(c => c.rec.kind))];
  const designLabel = sheetKinds.map(k => (sheetKinds.length > 1 ? IDS_KINDS[k] + ": " : "") + (k === "afrovanguard" ? "Afrovanguard’s card" : designName(designOfKind(k)))).join(" · ") || "Standard card";
  const [designBusy, setDesignBusy] = React.useState("");
  const setDesign = (kind, templateId) => {
    const t = IDS_KIND_FOR_RUN[kind];
    setDesignBusy(kind);
    NGGApi.admin.idStudio.design(t, templateId).then(res => {
      setData(d => Object.assign({}, d, { designs: Object.assign({}, d.designs, { [t]: res.design || null }) }));
      say(IDS_KIND_PLURAL[kind] + " now print with " + designName(res.design || null));
    }).catch(e => say(idsErrText(e, "Couldn’t change the design. Try again."))).then(() => setDesignBusy(""));
  };
  const designsUI = kindsHere.map(k => {
    const t = IDS_KIND_FOR_RUN[k], d = (data.designs || {})[t] || null;
    return { kind: k, label: IDS_KIND_PLURAL[k], value: d ? d.templateId : "", options: (data.choices || {})[t] || [], busy: designBusy === k,
      help: d ? idsMmLabel(idsRecordMm(d)) + " · " + (d.back ? "back: " + d.back.name + " v" + d.back.version : "standard back") : "Built in · " + idsMmLabel(idsRecordMm(null, k, (data.programs || {})[k])) + " · front and back" };
  });
  /* The standard lanyard card's size (Summer School and volunteers), restored
     from the old studio's "card proportion" box. One programme setting
     (idcard.widthMm × heightMm), saved through settings, so it needs that
     permission and says so when refused. The member card is ID-1 and fixed. */
  const lanyardProgram = (data.programs || {}).summer || (data.programs || {}).volunteer || null;
  const [sizeBusy, setSizeBusy] = React.useState(false);
  const saveLanyardSize = (w, h) => {
    const W2 = Math.max(50, Math.min(60, Number(w) || 54)), H2 = Math.max(64, Math.min(100, Number(h) || 75));
    setSizeBusy(true);
    return NGGApi.admin.settings.set({ idcard: { widthMm: W2, heightMm: H2 } })
      .then(() => {
        setData(d => { const pr = Object.assign({}, d.programs); ["summer", "volunteer"].forEach(k => { if (pr[k]) pr[k] = Object.assign({}, pr[k], { widthMm: W2, heightMm: H2 }); }); return Object.assign({}, d, { programs: pr }); });
        say("Summer School and volunteer cards are now " + W2 + " × " + H2 + " mm");
      })
      .catch(e => say(e && (e.status === 403 || e.code === "forbidden") ? "Changing the card size needs the Settings permission." : idsErrText(e, "Couldn’t save the size. Try again.")))
      .then(() => setSizeBusy(false));
  };
  const lanyardUI = lanyardProgram ? { w: Number(lanyardProgram.widthMm) || 54, h: Number(lanyardProgram.heightMm) || 75, busy: sizeBusy, save: saveLanyardSize, hasMembers: data.kinds.includes("member") } : null;
  const [confirm, setConfirm] = React.useState(null);
  const [job, setJob] = React.useState(null);             // batch progress
  const [after, setAfter] = React.useState(null);         // { items, runs }
  const [runOpen, setRunOpen] = React.useState(null);
  const programFor = rec => (data.programs[rec.kind] || {});
  const renderFace = (s, f) => s.upload
    ? <IdsUploadFace u={f === "back" ? (s.upload.back ? upById[s.upload.back] : null) : s.upload} cw={s.cw || G.cw} ch={s.ch || G.ch} back={f === "back"}/>
    : <IdsRecordFace rec={s.rec} face={f} program={programFor(s.rec)} wMm={s.cw || G.cw} hMm={s.ch || G.ch} design={designOf(s.rec)}/>;

  const startPrint = () => {
    if (printBlock) return say(printBlock);
    const nRecords = recCards.length, nUploads = upCards.length;
    setConfirm({ nCards: cards.length, nRecords, nUploads, nSheets, sections, backs: st.backs, designLabel, packing: st.packing,
      defaultReason: idsAutoReason(scen, nRecords, reprints.length) });
  };


  const inRange = (a, b) => idsCardsOnSheets(sections, a, b);

  const logPrinted = async pj => {
    const items = pj.items || inRange(pj.a, pj.b);
    const output = pj.output || "sheet", runDpi = pj.dpi || st.dpi;
    const proof = pj.reason === "proof";
    const recItems = items.filter(x => x.s.rec);
    const runs = [];
    try {
      const groups = {};
      recItems.forEach(x => { const k = IDS_KIND_FOR_RUN[x.s.rec.kind]; (groups[k] = groups[k] || []).push(x); });
      for (const k of Object.keys(groups)) {
        const d = (data.designs || {})[k];
        /* One token per run: if the reply is lost and the log is sent again,
           the server returns the same run instead of logging the cards twice. */
        const token = (pj.token || (pj.token = "ids-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8))) + "-" + k;
        const res = await NGGApi.admin.registration.cardRun({ kind: k, subjectType: k, token, mode: proof ? "proof" : undefined, output, dpi: runDpi, sheet: IDS_PAPERS[G.paper][0],
          templateId: d ? d.templateId : "",
          reason: IDS_REASON_LABEL[pj.reason] || "", items: groups[k].map(x => ({ subjectId: x.s.rec.id, displayId: x.s.rec.displayId })) });
        runs.push({ runId: res.runId, subjectType: k, items: groups[k] });
      }
      if (items.some(x => x.s.upload)) {
        const res = await NGGApi.admin.registration.cardRun({ kind: "graphic", output, dpi: runDpi, sheet: IDS_PAPERS[G.paper][0], reason: IDS_REASON_LABEL.external, items: [] });
        runs.push({ runId: res.runId, subjectType: "graphic", items: [] });
      }
      if (!proof && recItems.length) {
        // Logging the run closed their reprint requests in the same step, on the server.
        const gone = new Set(recItems.map(x => x.s.rec.key));
        setDone(d => { const n = Object.assign({}, d); gone.forEach(k => { n[k] = true; }); return n; });
        setQueue(qq => qq.filter(x => !(x.t === "r" && gone.has(x.key))));
      }
    } catch (_) {
      say((pj.output ? "Exported" : "Printed") + ", but the log couldn’t be written. Note the cards by hand and try the next run again.");
      return;
    }
    const ids = runs.map(r => r.runId).join(", ");
    if (pj.output) return ids;   // an export reports in its own result dialog; failures are marked from the print log
    if (job || pj.batch) say("Batch ready · sheets " + pj.a + "–" + pj.b + " of " + nSheets + " in " + pj.fileName + ". Print it, then make the next.");
    else { say("Ready · " + pj.fileName + ", logged as " + ids + ". Print it at Actual size (100%)."); set({ skip: 0 }); setSheetIdx(0); }
    if (!proof && recItems.length) setAfter({ runs, items: recItems.map(x => ({ key: x.s.key, slot: x.s, name: x.s.label, sheet: x.sheet, slotN: x.slotN, cw: x.s.cw || G.cw, ch: x.s.ch || G.ch, rec: x.s.rec })) });
  };

  /* Before a print, every member on it is made ready on the server: a member
     printed for the first time is given their ID number (minted from the
     highest serial, never reissued), and every member's card is given its
     SECURE code — the QR a phone scans to open their page. Issued here, by a
     scoped POST at print time; listing the roster issues nothing. A proof
     mints no ID numbers, but its QR still needs a real code. */
  const mintMissing = async (list, proof) => {
    const all = Array.from(new Set(list.map(c => c.rec.id)));
    if (!all.length) return true;
    try {
      const got = {}, codes = {};
      for (let i = 0; i < all.length; i += 600) {
        const res = await NGGApi.admin.idStudio.mintIds(all.slice(i, i + 600), !!proof);
        Object.assign(got, res.issued || {}); Object.assign(codes, res.codes || {});
        (res.refused || []).forEach(x => { if (x.error === "unchanged" && x.displayId) got[x.memberId] = x.displayId; });
      }
      const upd = r => {
        if (r.kind !== "member" || (!got[r.id] && !codes[r.id])) return r;
        const raw = Object.assign({}, r.raw, got[r.id] ? { displayId: got[r.id], displayIdMissing: false } : {}, codes[r.id] ? { token: codes[r.id], cardSecure: true } : {});
        return Object.assign({}, r, got[r.id] ? { displayId: got[r.id] } : {}, { raw });
      };
      setData(d => Object.assign({}, d, { records: d.records.map(upd), queue: d.queue.map(upd) }));
      byKeyRef.current = Object.fromEntries(Object.entries(byKeyRef.current).map(([k, r]) => [k, upd(r)]));
      const left = proof ? 0 : list.filter(c => !c.rec.displayId && !got[c.rec.id]).length;
      if (left) { say(idsN(left, "member") + " couldn’t be given an ID number, so nothing was printed. Take them off the sheet, or check their records."); return false; }
      return true;
    } catch (e) { say(idsErrText(e, "Couldn’t prepare the members’ cards, so nothing was printed. Try again.")); return false; }
  };

  /* Before anything prints, every photo on it is measured by Gemini (once per
     photograph, ever — the server keeps the answer) so the card frames an
     accurate headshot. With no key set this is skipped and the cards frame
     from Cloudinary's landmarks, exactly as before. */
  const framePhotos = async recs => {
    const urls = Array.from(new Set(recs.map(r => nggPhotoSrc(r && r.photoUrl)).filter(Boolean)));
    if (!urls.length || !NGGApi.admin.photoFrame || typeof cphHintsPut !== "function") return;
    try {
      for (let i = 0; i < urls.length; i += 40) {
        const r = await NGGApi.admin.photoFrame.frame(urls.slice(i, i + 40));
        cphHintsPut(r.framing || {});
      }
    } catch (e) {
      if (e && e.code !== "ai_disabled" && e.code !== "forbidden") say("Some photos couldn’t be measured (" + idsErrText(e, "no answer") + "); they print framed by their face landmarks.");
    }
  };

  const onConfirmPrint = async ({ mode, batches, range, packing, reason }) => {
    setConfirm(null);
    if (!(await mintMissing(recCards.filter(c => c.rec.kind === "member"), reason === "proof"))) return;
    await framePhotos(recCards.map(c => c.rec));
    if (mode === "batch") {
      setJob({ batches, i: 0, total: nSheets, done: batches[0][1], next: batches[1] || batches[0], reason, packing });
      runPrint({ a: batches[0][0], b: batches[0][1], packing, reason, batch: true });
    } else {
      const [a, b] = mode === "range" ? range : [1, nSheets];
      runPrint({ a, b, packing, reason });
    }
  };
  const printNextBatch = () => {
    if (!job) return;
    const i = job.i + 1;
    if (i >= job.batches.length) { setJob(null); return; }
    const [a, b] = job.batches[i];
    setJob(i + 1 >= job.batches.length ? null : Object.assign({}, job, { i, done: b, next: job.batches[i + 1] }));
    runPrint({ a, b, packing: false, reason: job.reason, batch: true });
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

  /* ── Faces: drawn once, at print resolution, ahead of time (§4) ──
     Every face on the sheet is rendered by the component the preview shows,
     mounted IDS_FARM_CHUNK at a time in a hidden farm at its true millimetre
     size, and rasterised by snapDOM (CardExport.renderFaceFast) with 3 mm of
     generated bleed. A design is drawn straight from the Design Studio at the
     print dpi instead — no DOM in between. Faces are cached by what they show
     (the record, the design and its version, the size, the dpi), so Print,
     the print-shop export, a batch and a reprint all reuse one drawing, and a
     member minted a moment ago is a new face carrying their number.

     While the operator arranges the sheet, the faces are drawn in the
     background; any change supersedes the run in progress. Print and export
     pre-empt it, so they never wait behind it. */
  const byKeyRef = React.useRef(byKey);
  byKeyRef.current = byKey;
  const [farm, setFarm] = React.useState(null);        // { jobs: [{ key, s, face }] }
  const farmRef = React.useRef(null);
  const farmDone = React.useRef(null);
  const farmLock = React.useRef(Promise.resolve());
  const farmGen = React.useRef(0);
  const [warm, setWarm] = React.useState({ ready: 0, total: 0, busy: false });
  const [xconfirm, setXconfirm] = React.useState(null);
  const [xjob, setXjob] = React.useState(null);        // { i, n, note, print }
  const [xresult, setXresult] = React.useState(null);
  const xcancel = React.useRef(false);
  React.useEffect(() => {
    if (!farm || !farmDone.current) return;
    const done = farmDone.current; farmDone.current = null;
    (async () => {
      const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frames();
      await idsTplSettled();
      if (typeof idsAvSettled === "function") await idsAvSettled();
      // A card photo asks Cloudinary where the face is before it settles on a URL (card-photo.jsx).
      if (typeof cardPhotosSettled === "function") await cardPhotosSettled();
      // Photos and the member QR arrive after the first paint: wait for the farm to go quiet, then for every image.
      await idsDomQuiet(farmRef.current, 80, 4000);
      const imgs = farmRef.current ? Array.from(farmRef.current.querySelectorAll("img")) : [];
      await Promise.all(imgs.map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 6000); })));
      done();
    })();
  }, [farm]);
  const mountFarm = jobs => new Promise(resolve => { farmDone.current = resolve; setFarm({ jobs }); });
  const withFarm = fn => { const p = farmLock.current.then(fn, fn); farmLock.current = p.catch(() => {}); return p; };

  const curSlot = s => s.rec ? Object.assign({}, s, { rec: byKeyRef.current[s.rec.key] || s.rec }) : s;
  const faceSig = (s, f) => {
    if (s.upload) { const u = f === "back" ? (s.upload.back ? upById[s.upload.back] : null) : s.upload; return ["u", s.base || s.key, f, u ? idsHash(u.src) + (u.rot || 0) + (u.fit || "") : "blank"].join("|"); }
    const d = designOf(s.rec);
    return [s.rec.key, f, idsHash(JSON.stringify(s.rec.raw || {}) + (typeof cphHintSig === "function" ? cphHintSig(s.rec.photoUrl) : "")), d ? d.templateId + "v" + d.version + (d.back ? "+" + d.back.templateId + "v" + d.back.version : "") : "std", idsHash(JSON.stringify(programFor(s.rec)))].join("|");
  };
  const faceKey = (s, f, dpi, type) => faceSig(s, f) + "|" + (s.cw || G.cw) + "x" + (s.ch || G.ch) + "|" + dpi + "|" + (type || "jpeg");

  /* Draw the faces for `jobs` ([{ s, face }]). Returns { faces, failed, why }
     with faces[i] for jobs[i] and, for a failure, why[i] in words — or null
     when a newer background run superseded this one. Each face is drawn at
     its own card's size. o: { dpi, type: "jpeg"|"png", gen, onTick } */
  const drawFaces = async (jobs, o) => {
    const CE = await loadVendor("cardExport");
    const faces = new Array(jobs.length), failed = [], why = {};
    const fail = (i, e) => { failed.push(i); why[i] = idsFaceWhy(e); };
    let n = 0;
    const tick = () => { n++; if (o.onTick) o.onTick(n, jobs.length); };
    const stale = () => (o.gen != null && o.gen !== farmGen.current) || (o.cancel && o.cancel());
    const mime = o.type === "png" ? "image/png" : "image/jpeg";
    /* One drawing per distinct face. Copies of an uploaded image are the same
       face under the same key; mounted side by side they gave React duplicate
       keys, the farm's nodes stopped lining up with its jobs, and cards that
       had nothing wrong with them were reported as not drawn. */
    const dom = [], domByKey = {};
    for (let i = 0; i < jobs.length; i++) {
      const s = curSlot(jobs[i].s), f = jobs[i].face, key = faceKey(s, f, o.dpi, o.type);
      const hit = idsFaceGet(key);
      if (hit) { faces[i] = hit; tick(); continue; }
      if (s.rec && s.rec.kind === "afrovanguard") {
        /* Afrovanguard's own card, laid out alone and rasterised at this dpi
           (ids-av.jsx), then given the studio's bleed like a design is. */
        if (stale()) return null;
        try {
          const art = await idsAvRaster(s.rec, f === "back" ? "back" : "front", o.dpi);
          if (art.failed) throw new Error(art.why || "draw_failed");
          const r = await CE.imageFace(art.url, { trimW_mm: s.cw || G.cw, trimH_mm: s.ch || G.ch, dpi: o.dpi, bleed_mm: IDS_FACE_BLEED, type: mime, quality: 0.95 });
          faces[i] = { bytes: r.bytes, bleedMm: IDS_FACE_BLEED, bleedPx: r.bleedPx, trimWPx: r.trimWPx, trimHPx: r.trimHPx, alias: "f" + idsHash(key), engine: "afrovanguard" };
          idsFacePut(key, faces[i]);
        } catch (e) { fail(i, e); }
        tick(); continue;
      }
      const d = s.rec && designOf(s.rec), t = d && (f === "back" ? d.back : d);
      if (t) {
        if (stale()) return null;
        try {
          const fab = await loadVendor("fabric");
          const art = await window.dsnRaster(Object.assign({}, t.published, { wMm: d.wMm, hMm: d.hMm }), s.rec.raw, fab, o.dpi);
          const r = await CE.imageFace(art.url, { trimW_mm: s.cw || G.cw, trimH_mm: s.ch || G.ch, dpi: o.dpi, bleed_mm: IDS_FACE_BLEED, type: mime, quality: 0.95 });
          faces[i] = { bytes: r.bytes, bleedMm: IDS_FACE_BLEED, bleedPx: r.bleedPx, trimWPx: r.trimWPx, trimHPx: r.trimHPx, alias: "f" + idsHash(key), engine: "design" };
          idsFacePut(key, faces[i]);
        } catch (e) { fail(i, e); }
        tick(); continue;
      }
      if (domByKey[key]) { domByKey[key].dups.push(i); continue; }
      domByKey[key] = { i, s, face: f, key, dups: [] };
      dom.push(domByKey[key]);
    }
    for (let c = 0; c < dom.length; c += IDS_FARM_CHUNK) {
      if (stale()) return null;
      const chunk = dom.slice(c, c + IDS_FARM_CHUNK);
      const ok = await withFarm(async () => {
        if (stale()) return false;
        await mountFarm(chunk);
        const nodes = farmRef.current ? Array.from(farmRef.current.querySelectorAll(".ids-x-face")) : [];
        /* A few faces in flight at once: one rasterising while the last is
           still being JPEG-encoded off the main thread. */
        let next = 0;
        const worker = async () => {
          while (next < chunk.length) {
            const k = next++, job = chunk[k], node = nodes[k];
            try {
              // A card its renderer choked on is never rasterised as if it were the card.
              if (!node || node.querySelector("[data-ids-failed]")) throw new Error("draw_failed");
              const r = await CE.renderFaceFast(node, { trimW_mm: job.s.cw || G.cw, dpi: o.dpi, bleed_mm: IDS_FACE_BLEED, type: mime, quality: 0.95 });
              faces[job.i] = { bytes: r.bytes, bleedMm: IDS_FACE_BLEED, bleedPx: r.bleedPx, trimWPx: r.trimWPx, trimHPx: r.trimHPx, alias: "f" + idsHash(job.key), engine: r.engine };
              idsFacePut(job.key, faces[job.i]);
              job.dups.forEach(d => { faces[d] = faces[job.i]; tick(); });
            } catch (e) { fail(job.i, e); job.dups.forEach(d => { fail(d, e); tick(); }); }
            tick();
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        /* Unmounted INSIDE the lock. It was unmounted after the loop, outside
           it, where a background run finishing could take down the farm a
           print had just mounted — and every card in that chunk then failed. */
        setFarm(null);
        return true;
      });
      if (!ok) return null;
    }
    return { faces, failed, why };
  };

  // The sheet's faces, drawn while the operator is still arranging it.
  const sheetJobs = () => {
    const jobs = [];
    slots.forEach(s => { if (!s.pad) { jobs.push({ s, face: "front" }); if (st.backs !== "off") jobs.push({ s, face: "back" }); } });
    return jobs;
  };
  const warmSig = tab === "make" && !phone ? slots.map(s => s.pad ? "_" : faceSig(curSlot(s), "front") + "@" + s.cw + "x" + s.ch).join(",") + "|" + st.backs + "|" + st.dpi : "";
  React.useEffect(() => {
    const gen = ++farmGen.current;
    if (!warmSig || xjob) { setWarm({ ready: 0, total: 0, busy: false }); return undefined; }
    const jobs = sheetJobs().slice(0, IDS_WARM_MAX);
    if (!jobs.length) { setWarm({ ready: 0, total: 0, busy: false }); return undefined; }
    const t = setTimeout(() => {
      setWarm({ ready: 0, total: jobs.length, busy: true });
      drawFaces(jobs, { dpi: st.dpi, gen, onTick: (k, total) => { if (gen === farmGen.current) setWarm({ ready: k, total, busy: k < total }); } })
        .catch(() => null)
        .then(() => { if (gen === farmGen.current) setWarm(w => Object.assign({}, w, { busy: false })); });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [warmSig, !!xjob]);

  const today = () => new Date().toISOString().slice(0, 10);
  const failedNames = (jobs, idx) => Array.from(new Set(idx.map(i => { const s = jobs[i].s; return s.label + (s.rec && s.rec.displayId ? " · " + s.rec.displayId : ""); })));
  const failedWhy = (res) => Array.from(new Set(res.failed.map(i => res.why[i]).filter(Boolean)));
  const failedBases = (jobs, idx) => new Set(idx.map(i => jobs[i].s.base));
  /* Take the cards that couldn't be drawn off the sheet (uploads entirely, all copies). */
  const dropBases = bases => { const prev = queue; setQueue(qq => qq.filter(x => !bases.has(x.t === "r" ? x.key : x.uid))); say(idsN(bases.size, "card") + " taken off the sheet", () => setQueue(prev)); };

  /* Print: the studio's sheet as a PDF, never the browser's print dialog. */
  const runPrint = async pj => {
    farmGen.current++;                       // the background run yields
    xcancel.current = false;
    let CE;
    setXjob({ i: 0, n: 1, note: "Getting ready", print: true });
    try { CE = await loadVendor("cardExport"); } catch (e) { setXjob(null); say(idsVendorWhy(e, "print")); return false; }
    try {
      if (pj.test) {
        const TG = sheetG.per ? sheetG : G;
        const pdf = await CE.buildSheetPDF({ pageW: TG.pw, pageH: TG.ph, title: "Alignment test", pages: [idsTestPage(TG)] });
        CE.download(pdf, "alignment-test-" + IDS_PAPERS[G.paper][0] + ".pdf", "application/pdf");
        setXjob(null);
        say("Alignment test ready. Print it at Actual size (100%) and measure it with a ruler before printing cards.");
        return true;
      }
      const proof = pj.reason === "proof";
      const items = inRange(pj.a, pj.b);
      const jobs = [];
      items.forEach(x => { jobs.push({ s: x.s, face: "front" }); if (st.backs !== "off") jobs.push({ s: x.s, face: "back" }); });
      const res = await drawFaces(jobs, { dpi: st.dpi, cancel: () => xcancel.current, onTick: (k, n) => setXjob({ i: k, n, note: "Preparing the cards", print: true }) });
      if (!res || xcancel.current) { setXjob(null); say("Stopped. Nothing was printed or logged."); return false; }
      if (res.failed.length) {
        const names = failedNames(jobs, res.failed), bases = failedBases(jobs, res.failed);
        setXjob(null);
        // Kept on screen, with why and what to do — not a toast that is gone before it is read.
        setXresult({ print: true, made: 0, failed: names, qrBad: [], why: failedWhy(res),
          retry: () => { setXresult(null); runPrint(pj); }, drop: () => { setXresult(null); dropBases(bases); } });
        return false;
      }
      setXjob({ i: jobs.length, n: jobs.length, note: "Making the PDF", print: true });
      const byJob = new Map();
      jobs.forEach((j, k) => byJob.set(j.s.key + "|" + j.face, res.faces[k]));
      const pages = idsSheetPages({ sections, a: pj.a, b: pj.b, backs: st.backs, marks: st.marks, proof, nSheets, faceOf: (s, side) => byJob.get(s.key + "|" + side) });
      const packing = pj.packing ? {
        title: "Packing list" + (proof ? " · PROOF" : ""),
        sub: "Sheets " + pj.a + "–" + pj.b + " of " + nSheets + " · tick each card as you cut and bag it · " + new Date().toLocaleString("en-GB"),
        head: ["Sheet", "Slot", "Name", "ID", "Centre", ""], widths: [12, 10, 62, 30, 40, 8], tick: true,
        rows: items.map(x => [x.sheet, x.slotN, x.s.label, x.s.rec ? (curSlot(x.s).rec.displayId || "Assigned on print") : "Uploaded", x.s.centre || "", ""]),
      } : null;
      const PG = (sections[0] || {}).G || G;
      const pdf = await CE.buildSheetPDF({ pageW: PG.pw, pageH: PG.ph, title: "NGG ID cards" + (proof ? " (proof)" : ""), packing, pages });
      const fileName = "id-cards-" + today() + (proof ? "-proof" : "") + (pj.a === 1 && pj.b === nSheets ? "" : "-sheets-" + pj.a + "-" + pj.b) + ".pdf";
      CE.download(pdf, fileName, "application/pdf");
      setXjob(null);
      await logPrinted(Object.assign({}, pj, { items, fileName }));
      return true;
    } catch (e) {
      setXjob(null);
      say(e && e.code === "vendor_stale" ? idsVendorWhy(e, "print") : "Couldn’t make the PDF (" + idsFaceWhy(e) + ") Nothing was printed or logged. Try again.");
      return false;
    }
  };

  /* Improve photos: one Cloudinary edit (admin.photo.edit.bulk) for every
     photographed person on the sheet, sent a few at a time so a slow upload
     never meets the host's request time limit. The count is read before the
     confirm; per-person verdicts win over the batch's ok. */
  const IDS_IMPROVE_KIND = { member: "member", summer: "student", volunteer: "volunteer" };
  const IDS_IMPROVE_CHUNK = 8;
  const [improve, setImprove] = React.useState(null);      // { n, items } while the dialog is open
  const [improveRes, setImproveRes] = React.useState(null);
  const improvable = () => {
    const seen = new Set(), out = [];
    cards.forEach(c => { const r = c.rec; if (!r || !IDS_IMPROVE_KIND[r.kind] || !r.photoUrl || seen.has(r.key)) return; seen.add(r.key); out.push(r); });
    return out;
  };
  const improveN = React.useMemo(() => improvable().length, [cards]); // eslint-disable-line
  const runImprove = async spec => {
    const recs = improve.recs;
    setImprove(null);
    farmGen.current++;
    xcancel.current = false;
    let applied = 0, unchanged = 0;
    const failed = [];
    for (let i = 0; i < recs.length; i += IDS_IMPROVE_CHUNK) {
      if (xcancel.current) break;
      setXjob({ i, n: recs.length, note: "Improving photos" });
      const part = recs.slice(i, i + IDS_IMPROVE_CHUNK);
      try {
        const res = await NGGApi.admin.photos.editBulk(part.map(r => ({ subjectType: IDS_IMPROVE_KIND[r.kind], subjectId: r.id })), spec);
        (res.results || []).forEach(x => {
          const r = part.find(p => p.id === x.subjectId);
          if (x.ok) { if (x.unchanged) unchanged++; else applied++; }
          else failed.push({ name: r ? r.name : x.subjectId, error: x.error || "failed" });
        });
      } catch (e) {
        const c = e && (e.code || e.message);
        setXjob(null);
        if (c === "forbidden" || (e && e.status === 403)) return say("Improving photos needs the Content permission.");
        if (c === "cloudinary_not_configured") return say("Cloudinary isn’t set up on this site, so photos can’t be improved. Its three keys go in api/config.php (docs/SETUP.md, “cloudinary”).");
        if (c === "credits_exhausted") return say("Cloudinary’s credits are used up, so the background can’t be removed. Try again without “Plain grey background”.");
        part.forEach(r => failed.push({ name: r.name, error: idsErrText(e, "failed") }));
      }
    }
    setXjob(null);
    _idsTplDone.clear(); idsFaceForget();
    if (applied) load();
    setImproveRes({ applied, unchanged, failed });
  };

  /* Files for a print shop: the same cached faces, imposed by CardExport with
     3 mm bleed, crop and registration marks, ISO 19593 layers, a FOGRA39
     intent and backs interleaved for the press's flip — or a ZIP of PNGs, or
     one card's PNG. Every standard card's QR is read back out of the exported
     pixels with the gate's own reader. Nothing is drawn twice. */
  const fileStem = s => String((s.rec ? s.rec.displayId || s.rec.id : s.upload.name.replace(IDS_IMG_EXT, "")) || "card").replace(/[^\w.-]+/g, "-");
  /* What the card's QR should carry, for the decode check: the token's /q/
     address, or a member's MEMQR token or member id. A design's QR binding is
     its own, so for a design the check is only that a code decodes at all. */
  const qrExpect = s => {
    if (!s.rec) return null;
    const raw = s.rec.raw || {};
    if (designOf(s.rec)) return "";
    if (s.rec.kind === "member") return /^MEMQR-/i.test(String(raw.token || "")) ? String(raw.token).toUpperCase() : encodeURIComponent(raw.memberId || "");
    return raw.token ? String(raw.token) : null;
  };
  const withBacks = st.backs !== "off";

  const startExport = () => {
    if (printBlock) return say(printBlock);
    setXconfirm({ nCards: cards.length, nRecords: recCards.length, backs: st.backs, sections, dpi: st.dpi === 150 ? 300 : st.dpi,
      defaultReason: idsAutoReason(scen, recCards.length, reprints.length), designLabel });
  };

  const runExport = async ({ format, dpi, verify, reason, only }) => {
    setXconfirm(null);
    const proof = reason === "proof";
    const list = only ? [{ s: only, sheet: 0, slotN: 0 }] : inRange(1, nSheets);
    if (!list.length) return;
    if (!(await mintMissing(list.filter(x => x.s.rec && x.s.rec.kind === "member").map(x => ({ rec: x.s.rec })), proof))) return;
    await framePhotos(list.filter(x => x.s.rec).map(x => x.s.rec));
    farmGen.current++;
    xcancel.current = false;
    setXjob({ i: 0, n: list.length, note: "Getting ready" });
    let CE;
    try { CE = await loadVendor("cardExport"); } catch (e) { setXjob(null); return say(idsVendorWhy(e, "export")); }
    const isPdf = format === "pdf";
    const jobs = [];
    list.forEach(x => { jobs.push({ s: x.s, face: "front" }); if (withBacks) jobs.push({ s: x.s, face: "back" }); });
    let res;
    try { res = await drawFaces(jobs, { dpi, type: isPdf ? "jpeg" : "png", cancel: () => xcancel.current, onTick: (k, n) => setXjob({ i: k, n, note: "Drawing the cards" }) }); }
    catch (e) { setXjob(null); return say(e && e.code === "vendor_stale" ? idsVendorWhy(e, "export") : "Couldn’t draw the cards (" + idsFaceWhy(e) + ") Try again."); }
    const cancelled = xcancel.current || !res;
    const bad = new Set(res ? res.failed : []);
    const fronts = [], backsOut = [], files = [], failed = [], qrBad = [], ok = [], okSec = [];
    const failBases = new Set();
    let qrSkipped = 0;
    const per = withBacks ? 2 : 1;
    for (let i = 0; res && i < list.length; i++) {
      const s = curSlot(list[i].s), fi = i * per, bi = fi + 1;
      const f = res.faces[fi], b = withBacks ? res.faces[bi] : null;
      if (!f || bad.has(fi) || (withBacks && (!b || bad.has(bi)))) { failed.push(s.label + (s.rec && s.rec.displayId ? " · " + s.rec.displayId : "")); failBases.add(s.base); continue; }
      const want = qrExpect(s);
      if (verify && want !== null) {
        setXjob({ i, n: list.length, note: "Checking every QR code" });
        let v;
        try {
          const bmp = await createImageBitmap(new Blob([f.bytes], { type: isPdf ? "image/jpeg" : "image/png" }));
          const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; cv.getContext("2d").drawImage(bmp, 0, 0);
          v = await CE.verifyQRCanvas(cv, want);
        } catch (_) { v = { ok: false, reason: "decode_failed" }; }
        if (v.reason === "no_decoder") qrSkipped++;
        else if (!v.ok) qrBad.push({ name: s.label + (s.rec && s.rec.displayId ? " · " + s.rec.displayId : ""), reason: v.reason || "unreadable" });
      }
      if (isPdf) { fronts.push(f); backsOut.push(b); }
      else {
        const stem = fileStem(s) + (only ? "" : "-" + String(i + 1).padStart(3, "0"));
        files.push({ name: stem + "-front.png", bytes: f.bytes });
        if (b) files.push({ name: stem + "-back.png", bytes: b.bytes });
      }
      ok.push(list[i]); okSec.push(s.sec || "");
    }
    const why = res ? failedWhy(res) : [];
    const again = failed.length ? { retry: () => { setXresult(null); runExport({ format, dpi, verify, reason, only }); }, drop: () => { setXresult(null); dropBases(failBases); } } : {};
    if (!ok.length) { setXjob(null); setXresult(Object.assign({ format, made: 0, failed, qrBad, cancelled, why }, again)); return; }
    setXjob({ i: list.length, n: list.length, note: isPdf ? "Imposing the sheets" : "Packing the ZIP" });
    const job = sheetKinds.map(k => IDS_KIND_PLURAL[k]).join(", ");
    let fileName = "";
    try {
      if (isPdf) {
        /* The imposition takes one trim size, so a run in several sizes is one
           PDF per size, each named by its size. */
        const secKeys = [...new Set(okSec)], names = [];
        for (const k of secKeys) {
          const sec = sections.find(x => x.key === k) || { G: { cw: (ok[0].s.cw || G.cw), ch: (ok[0].s.ch || G.ch) }, mm: [ok[0].s.cw || G.cw, ok[0].s.ch || G.ch] };
          const idx = okSec.map((x, j) => x === k ? j : -1).filter(j => j >= 0);
          const pdf = await CE.buildImpositionPDF(idx.map(j => fronts[j]), { backs: withBacks ? idx.map(j => backsOut[j]) : null, duplex: st.backs === "short" ? "short-edge" : "long-edge",
            sheet: IDS_PAPERS[st.paper][0], trimW_mm: sec.G.cw, trimH_mm: sec.G.ch, bleed_mm: IDS_FACE_BLEED, safe_mm: 3, marks: true, layers: true, intent: "FOGRA39",
            jobName: "NGG ID cards " + job + (proof ? " PROOF" : ""), date: today() });
          const nm = "id-cards-" + today() + (proof ? "-proof" : "") + "-print-shop" + (secKeys.length > 1 ? "-" + idsMmLabel(sec.mm).replace(/ × /, "x").replace(/ mm$/, "mm") : "") + ".pdf";
          CE.download(pdf, nm, "application/pdf");
          names.push(nm);
        }
        fileName = names.join(", ");
      } else if (only) {
        files.forEach(f => CE.download(f.bytes, f.name, "image/png"));
        fileName = files.map(f => f.name).join(", ");
      } else {
        fileName = "id-cards-" + today() + "-png.zip";
        CE.download(await CE.zipStore(files), fileName, "application/zip");
      }
    } catch (e) { setXjob(null); setXresult({ format, made: 0, failed, qrBad, cancelled, why: why.concat(["The file couldn’t be assembled: " + idsFaceWhy(e)]) }); return; }
    setXjob(null);
    // One run in the log per kind, with the cards that are actually in the file. A single
    // card's PNG is a download, not an issue, so it is not logged.
    const runIds = only ? "" : await logPrinted({ items: ok, reason, output: isPdf ? "pdf" : "png", dpi, a: 1, b: nSheets });
    setXresult(Object.assign({ format, made: ok.length, failed, qrBad, qrSkipped, verify, cancelled, fileName, runIds: runIds || "", total: list.length, why }, again));
  };

  /* Warm the hosted QR cache, once, in the background (restored from the old
     Card Studio). Mail clients strip data: images, so an emailed ID needs a
     hosted QR PNG, and the server has no QR encoder — only this browser does.
     After one visit every participant and volunteer token has a hosted image,
     so an ID mailed at 2am by a consent link still carries a scannable code.
     It asks the server which tokens are missing first and sends only those,
     IDS_QR_WARM_CHUNK to a request: sixty PNGs on every visit was a quarter of
     a megabyte a request, which a shared host's request filter answered by
     resetting the connection (ERR_HTTP2_PROTOCOL_ERROR on registration.php). */
  const qrWarmed = React.useRef(false);
  React.useEffect(() => {
    // The server gates the warm-up on Summer School; an operator without it has nothing to warm.
    if (qrWarmed.current || data.state !== "ready" || !data.kinds.includes("summer")) return undefined;
    // Afrovanguard's codes are Afrovanguard's: its own site answers them.
    const tokens = data.records.filter(r => r.kind !== "member" && r.kind !== "afrovanguard").map(r => String((r.raw || {}).token || "")).filter(Boolean);
    if (!tokens.length) return undefined;
    const t = setTimeout(async () => {
      qrWarmed.current = true;
      try {
        if (!(await idsQrPng(""))) { /* loads the encoder; "" makes no image */ }
        if (!window.qrcode) return;
        const missing = [];
        for (let i = 0; i < tokens.length; i += 500) {
          try { missing.push(...((await NGGApi.admin.registration.qrMissing(tokens.slice(i, i + 500))).missing || [])); } catch (_) { return; }
        }
        for (let i = 0; i < missing.length; i += IDS_QR_WARM_CHUNK) {
          const items = [];
          missing.slice(i, i + IDS_QR_WARM_CHUNK).forEach(tok => { const png = idsQrPngWith(window.qrcode, tok); if (png) items.push({ token: tok, qrPng: png }); });
          try { if (items.length) await NGGApi.admin.registration.qrWarm(items); } catch (_) { break; }
        }
      } catch (_) {}
    }, 1500);
    return () => clearTimeout(t);
  }, [data.state, data.records]);

  /* ── Keys (§3.5) ── */
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") {
        if (confirm || runOpen || after || document.querySelector(".ids-dialog")) return;
        if (drawer && W < 1024) { setDrawer(false); if (paneTrigger.current) paneTrigger.current.focus(); return; }
        if (sel) { setSel(null); } return;
      }
      // "/" anywhere in the studio goes to the assistant's composer, as it does in most tools.
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && tab === "make" && !phone && data.state === "ready"
          && !/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "") && !document.querySelector(".ids-dialog")) {
        // Ours, not the site's command palette (window-level, so it never sees this).
        e.preventDefault(); e.stopPropagation();
        setPane("assistant"); if (W < 1024) setDrawer(true);
        setTimeout(() => focusComposer(), 0);
        return;
      }
      if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "") || !sel || phone || tab !== "make") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); moveSel(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveSel(1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  /* ── The log and lookup ── */
  /* The log reads the server a page at a time, with the kind and run type
     filtered ON THE SERVER — a filter applied to the drawn page filters the
     page (CLAUDE.md §6). The rebuild read the newest 100 and filtered those. */
  const IDS_LOG_PAGE = 50;
  const [log, setLog] = React.useState({ state: "idle", runs: [], total: 0, page: 0, kind: "", type: "" });
  const logRow = x => ({
    runId: x.runId, at: x.startedAt ? new Date(x.startedAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "",
    design: x.templateName || (x.kind === "graphic" ? "External upload" : "Standard card"), version: x.templateVersion ? "v" + x.templateVersion : "",
    type: x.kind === "graphic" ? "external" : x.mode === "proof" ? "proof" : x.mode === "reprint" ? "reprint" : x.reason === IDS_REASON_LABEL.mixed ? "mixed" : "new",
    cards: x.issued || x.requested || 0, failed: x.failed || 0, output: [x.output === "sheet" ? "Sheet PDF" : x.output === "pdf" ? "Print-ready PDF" : x.output === "png" ? "PNG images" : x.output, x.dpi ? x.dpi + " dpi" : "", x.sheet].filter(Boolean).join(" · "),
    by: x.actorName || "", kind: x.kind === "student" ? "summer" : x.kind, reprintable: x.kind !== "graphic", proof: x.mode === "proof",
  });
  const logRef = React.useRef(log);
  logRef.current = log;
  const loadLog = React.useCallback((f, more) => {
    const l = logRef.current;
    const kind = f ? f.kind : l.kind, type = f ? f.type : l.type, page = more ? l.page + 1 : 1;
    const q = { pageSize: IDS_LOG_PAGE, page };
    if (type === "external") q.kind = "graphic";
    else if (kind) q.kind = IDS_KIND_FOR_RUN[kind];
    if (type === "new" || type === "mixed") q.mode = "print"; else if (type === "reprint" || type === "proof") q.mode = type;
    setLog(cur => Object.assign({}, cur, { kind, type, state: more ? cur.state : "loading", runs: more ? cur.runs : [], moreErr: false, loadingMore: !!more }));
    NGGApi.admin.registration.cardRuns(q).then(r => setLog(cur => {
      if (cur.kind !== kind || cur.type !== type) return cur;      // a newer filter has taken over
      // "New issues" and "mixed" share the server's print mode; the reason tells them apart.
      const rows = (r.runs || []).map(logRow).filter(x => type !== "new" && type !== "mixed" ? true : x.type === type);
      return Object.assign({}, cur, { state: "ready", runs: more ? cur.runs.concat(rows) : rows, total: r.total || 0, page, more: page * IDS_LOG_PAGE < (r.total || 0), loadingMore: false });
    })).catch(() => setLog(cur => Object.assign({}, cur, { state: more ? "ready" : "error", moreErr: !!more, loadingMore: false })));
    // eslint-disable-next-line
  }, []);
  React.useEffect(() => { if (tab === "log" && log.state === "idle") loadLog(); }, [tab, log.state, loadLog]);
  const openRun = async r => {
    setRunOpen(Object.assign({}, r, { people: [], issuesState: "loading" }));
    try {
      const res = await NGGApi.admin.registration.cardRunGet(r.runId);
      const issues = (res.issues || []).map(i => { const rec = byKey[i.subjectType + ":" + i.subjectId]; return Object.assign({}, i, { name: rec ? rec.name : i.subjectId }); });
      setRunOpen(o => o && o.runId === r.runId ? Object.assign({}, o, { issues, issuesState: "ready", people: issues.map(i => i.name), reprintable: o.reprintable && issues.length > 0 }) : o);
    } catch (_) { setRunOpen(o => o && o.runId === r.runId ? Object.assign({}, o, { issuesState: "error" }) : o); }
  };
  /* "Check later" promised failures could be marked from the print log, and
     the log had no way to. A card spoiled at the cutter or at a print shop is
     marked here: failed on its run, back in the queue as a reprint. */
  const markRunFailed = async (r, list) => {
    if (!list.length) return;
    try {
      const res = await NGGApi.admin.idStudio.failed(r.runId, list.map(i => ({ subjectType: i.subjectType, subjectId: i.subjectId })));
      say(idsN(res.marked || list.length, "card") + " marked as not printed" + (res.requeued ? ", back in the queue as reprints" : ""));
      openRun(r); loadLog(); load();
    } catch (e) { say(idsErrText(e, "Couldn’t mark them. Try again.")); }
  };
  const reprintRun = async r => {
    const items = (r.issues || []).map(i => ({ subjectType: i.subjectType, subjectId: i.subjectId, why: "Reprint of " + r.runId }));
    if (!items.length) return;
    try { await NGGApi.admin.idStudio.reprint(items); setRunOpen(null); say(idsN(items.length, "card") + " queued as reprints"); load(); }
    catch (_) { say("Couldn’t queue the reprint. Try again."); }
  };
  /* Look up by printed ID or by the record's own id (member, participant or
     volunteer id), as the old Control Room did, and answer "is the card in
     their hand current?" all three ways: current, moved on, or a standard
     card that carries no version. */
  const lookup = async id => {
    const norm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const want = norm(id);
    const rec = data.records.find(r => norm(r.displayId) === want) || data.records.find(r => norm(r.id) === want);
    if (!rec) return null;
    const res = await NGGApi.admin.registration.cardHistory(rec.id, rec.subjectType);
    const rows = (res.issues || res.history || []).map(i => ({ at: i.at ? new Date(i.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "",
      run: i.runId, design: (i.templateName || "Standard card") + (i.templateVersion ? " v" + i.templateVersion : ""), type: (i.reprint ? "Reprint" : "New issue") + (i.mode === "proof" ? " · proof" : ""), ok: i.ok !== false, reprint: !!i.reprint, output: i.output || "" }));
    const l = res.latest || {};
    const moved = !!(res.stale || l.stale || res.designMovedOn === true);
    return { name: rec.name, displayId: rec.displayId, rows, moved, changed: res.changedSincePrint || [], current: res.designMovedOn === false, unversioned: res.designMovedOn === null && rows.length > 0,
      latestDesign: l.templateName ? l.templateName + (l.templateVersion ? " v" + l.templateVersion : "") : "", queueable: true, rec };
  };
  const queueReprint = async (d, cause) => {
    const rs = IDS_REPRINT_REASONS.find(x => x[0] === cause);
    const why = rs ? rs[1] : d.changed && d.changed.length ? idsStaleWhy(d.changed) : "Design changed";
    try { await NGGApi.admin.idStudio.reprint([{ subjectType: d.rec.subjectType, subjectId: d.rec.id, cause: cause || (d.changed && d.changed.length ? d.changed[0] : "design"), why }]);
      say(d.name + " is queued for a reprint" + (cause === "lost" || cause === "never_received" ? ". Their card gets a new QR when it prints" : "")); load(); }
    catch (_) { say("Couldn’t queue the reprint. Try again."); }
  };

  /* ── The assistant (ids-ask.jsx) ──
     A plan selects from what the studio shows and sets its own controls; the
     reply names the count, and its Print goes to the PDF only while the sheet
     still holds exactly that many cards. The pane keeps the conversation:
     `chat` is the transcript, `liveId` the one reply that is live. A plan on
     screen is sent with the next request, which adjusts it; a chip's × adjusts
     it here. In Ask mode a reply waits for Apply; in Act mode it applies. */
  const [askBusy, setAskBusy] = React.useState(false);
  const [askRes, setAskRes] = React.useState(null);
  const [chat, setChat] = React.useState([]);
  const [liveId, setLiveId] = React.useState(0);
  const [askMode, setAskModeS] = React.useState(idsAskModeGet);
  const setAskMode = m => { setAskModeS(m); try { localStorage.setItem(IDS_ASK_MODE_KEY, m); } catch (_) {} };
  const chatSeq = React.useRef(0);
  const aiInput = React.useRef(null);
  const say2 = (who, m) => { const id = ++chatSeq.current; setChat(c => c.concat([Object.assign({ id, who }, m)])); return id; };
  const askUndo = React.useRef(null);     // the studio as it was before the first plan
  const askLast = React.useRef("");
  const applyPlan = (res, prompt) => {
    const plan = res.plan || {};
    const meta = { by: res.by, provider: res.provider, aiError: res.aiError, refined: !!res.refined, prompt };
    if (!Object.keys(plan).length) { setAskRes(null); return null; }
    const sel = idsPlanSelect(plan, { pool: recs, all: data.records, isBlocked });
    const issues = (res.notes || []).map(t => ({ tone: "info", text: t }));
    if (sel.blocked.length) issues.push({ tone: "warn", text: idsN(sel.blocked.length, "person", "people") + " left out: no photo yet (" + sel.blocked.slice(0, 3).map(r => r.name).join(", ") + (sel.blocked.length > 3 ? "…" : "") + ").",
      action: "Ask for photos", onAction: () => setAskConfirm(sel.blocked.filter(r => !idsAskedRecently(askedOf(r))).slice(0, IDS_ASK_MAX)) });
    if (sel.missing.length) issues.push({ tone: "bad", text: "Not found: " + sel.missing.slice(0, 8).join(", ") + (sel.missing.length > 8 ? "…" : "") + "." });
    sel.ambiguous.forEach(x => issues.push({ tone: "warn", text: "“" + x.name + "” matches " + x.n + " people. Add a surname or their ID number." }));
    if (sel.excluded.length) issues.push({ tone: "info", text: "Left out as asked: " + sel.excluded.slice(0, 4).map(r => r.name).join(", ") + (sel.excluded.length > 4 ? " +" + (sel.excluded.length - 4) : "") + "." });
    if (sel.cut) issues.push({ tone: "info", text: idsN(sel.cut, "more card") + " matched beyond the limit and " + (sel.cut === 1 ? "was" : "were") + " left for the next run." });
    const n = sel.pick.length;
    if (sel.carded.length) {
      const list = sel.carded;
      issues.push({ key: "carded", tone: "info", text: idsN(list.length, "person", "people") + " already " + (list.length === 1 ? "has" : "have") + " a card (" + list.slice(0, 3).map(r => r.name).join(", ") + (list.length > 3 ? "…" : "") + ").",
        action: "Reprint " + (list.length === 1 ? "it" : "them"), onAction: async () => {
          if (!(await queueReprints(list, "asked"))) return;
          const add = list.filter(r => !isBlocked(r));
          setQueue(qq => qq.concat(add.filter(r => !qq.some(x => x.t === "r" && x.key === r.key)).map(r => ({ t: "r", key: r.key }))));
          set({ reason: n ? "mixed" : "reprint" });
          setAskRes(a => a && Object.assign({}, a, { n: a.n + add.length, issues: a.issues.filter(x => x.key !== "carded") }));
        } });
    }
    const out = Object.assign(meta, { plan, what: idsPlanWhat(plan), issues, n, applied: false });
    /* The first plan keeps the studio as it was, for Undo. A follow-up always
       re-applies, even to an empty sheet, so the sheet never shows a selection
       the card no longer describes; a fresh request that finds nobody leaves
       the sheet alone. */
    const following = !!askUndo.current && !!res.refined;
    if (n || following) {
      if (!askUndo.current) askUndo.current = { queue, st, kind, centre, filter, rmode, rng };
      const reasons = new Set(sel.pick.map(r => r.reason));
      const patch = { reason: plan.proof ? "proof" : reasons.size > 1 ? "mixed" : reasons.has("reprint") ? "reprint" : "new", skip: 0 };
      ["backs", "marks", "paper", "dpi", "order", "margin", "gap", "skip", "packing"].forEach(k => { if (plan[k] !== undefined) patch[k] = plan[k]; });
      if (plan.order) patch.breakBy = plan.order !== "name";
      if (plan.breakBy !== undefined) patch.breakBy = plan.breakBy;
      setQueue(sel.pick.map(r => ({ t: "r", key: r.key })));
      set(patch);
      // The list on the left shows the same people, so what the plan chose can be checked and changed by hand.
      setSrc("records"); setScen("batch");
      setKind(plan.kind || ""); setCentre(plan.centre === "none" ? IDS_NO_CENTRE : plan.centre || "");
      setFilter((plan.ids || []).length || (plan.names || []).length || plan.also || plan.which === "all" ? "all" : plan.which || "new");
      if (plan.dateFrom || plan.dateTo) { setRmode("date"); setRng({ dFrom: plan.dateFrom || "", dTo: plan.dateTo || "", nFrom: "", nTo: "" }); }
      else if (plan.numFrom != null || plan.numTo != null) { setRmode("id"); setRng({ dFrom: "", dTo: "", nFrom: plan.numFrom != null ? String(plan.numFrom) : "", nTo: plan.numTo != null ? String(plan.numTo) : "" }); }
      else { setRmode("name"); setRng({ dFrom: "", dTo: "", nFrom: "", nTo: "" }); }
      setSel(null); setSheetIdx(0);
      out.applied = true;
      const base = askUndo.current.st;
      out.changed = ["backs", "marks", "paper", "dpi", "order", "reason", "margin", "gap", "skip", "packing"].filter(k => patch[k] !== undefined && patch[k] !== base[k]);
    }
    setAskRes(out);
    return out;
  };
  /* What a reply says, without touching the sheet: the count and the chips. */
  const planSnap = res => {
    const plan = res.plan || {};
    const sel = idsPlanSelect(plan, { pool: recs, all: data.records, isBlocked });
    return { n: sel.pick.length, what: idsPlanWhat(plan), refined: !!res.refined };
  };
  const ranOf = (out, n) => {
    const ran = [];
    if (out.applied) ran.push("Put " + idsN(n, "card") + " on the sheet");
    (out.changed || []).forEach(k => ran.push("Set " + ({ backs: "backs", marks: "cut marks", paper: "paper", dpi: "image quality", order: "the order", reason: "the reason for the log", margin: "the margin", gap: "the gap", skip: "skipped slots", packing: "the packing list" })[k]));
    return ran;
  };
  const commit = (id, res, prompt) => {
    const out = applyPlan(res, prompt);
    if (!out) return;
    setLiveId(id);
    setChat(c => c.map(m => m.id === id ? Object.assign({}, m, { pending: false, ran: ranOf(out, out.n) }) : m));
  };
  /* ── Commands: settings on the sheet as it is, and the three acts ──
     A request with no "who" in it ("make it A3", "margin 5mm", "fill the
     gaps", "clear the sheet") changes the sheet on screen; it never reselects
     people. Asking for photos opens the same confirm as the button, with the
     count — the assistant never sends on its own. */
  const [lastCmdId, setLastCmdId] = React.useState(0);
  const runCmd = plan => {
    const undo = { queue, st };
    const ran = [], notes = [];
    const patch = {};
    IDS_ASK_SET_KEYS.forEach(k => {
      if (plan[k] === undefined) return;
      if (k === "proof") { const want = plan.proof ? "proof" : (st.reason === "proof" ? "new" : st.reason); if (want !== st.reason) { patch.reason = want; if (plan.proof) patch.dpi = 150; ran.push("Set " + idsCmdLabel(k, plan[k], st)); } return; }
      if (plan[k] !== st[k]) { patch[k] = plan[k]; ran.push("Set " + idsCmdLabel(k, plan[k], Object.assign({}, st, patch))); }
      else notes.push("It was already " + idsCmdLabel(k, plan[k], st) + ".");
    });
    if (Object.keys(patch).length) set(patch);
    if (plan.do === "clear") {
      if (!queue.length) notes.push("The sheet was already empty.");
      else { setQueue([]); setSel(null); ran.push("Took " + idsN(cards.length, "card") + " off the sheet"); }
    }
    if (plan.do === "fill") {
      const k = Math.min(gap, fillable.length);
      if (!cards.length) notes.push("The sheet is empty, so there are no gaps to fill. Tell me who to put on it.");
      else if (!gap) notes.push("Every slot on the last sheet is already used.");
      else if (!k) notes.push("No card that is ready to print fits the " + idsN(gap, "empty slot") + ".");
      else { fillGap(); ran.push("Filled " + idsN(k, "empty slot") + " with cards that were waiting"); }
    }
    if (plan.do === "askPhotos") {
      const p = Object.assign({}, plan); delete p.do;
      const pool = idsPlanHasSel(p) ? idsPlanSelect(p, { pool: recs, all: data.records, isBlocked }).blocked : recs.filter(isBlocked);
      const list = pool.filter(r => !idsAskedRecently(askedOf(r))).slice(0, IDS_ASK_MAX);
      const recent = pool.length - pool.filter(r => !idsAskedRecently(askedOf(r))).length;
      if (!pool.length) notes.push("Nobody " + (idsPlanHasSel(p) ? "there " : "") + "is waiting for a photo.");
      else if (!list.length) notes.push("All " + pool.length + " were asked in the last 3 days. Ask one again from their row if you need to.");
      else { setAskConfirm(list); ran.push("Opened the photo request for " + idsN(list.length, "person", "people") + ". Check the count and send it"); if (recent) notes.push(recent + " asked in the last 3 days " + (recent === 1 ? "is" : "are") + " left out."); }
    }
    return { ran, notes, undo: ran.length && plan.do !== "askPhotos" ? undo : null };
  };
  const commitCmd = (id, plan) => {
    const r = runCmd(plan);
    if (r.undo) setLastCmdId(id);
    setChat(c => c.map(m => m.id === id ? Object.assign({}, m, { pending: false, ran: r.ran, notes: r.notes, undo: r.undo }) : m));
  };
  const undoCmd = m => {
    if (!m.undo) return;
    setQueue(m.undo.queue); setSt(m.undo.st);
    setChat(c => c.map(x => x.id === m.id ? Object.assign({}, x, { undone: true }) : x));
    setLastCmdId(0);
    say("The sheet is back as it was");
  };
  /* What the answers read: the studio as it is now. */
  const askCtx = () => {
    const norm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const statusOf = r => {
      const q = recs.find(x => x.key === r.key);
      if (q && inQ.has(q.key)) return "is on the sheet now";
      if (q && isBlocked(q)) { const a = askedOf(q); return "is waiting for a photo" + (a ? " (asked " + idsAskedOn(a) + ")" : ", and hasn’t been asked yet"); }
      if (q && q.reason === "reprint") return "is waiting for a reprint" + (q.why ? " (" + q.why.toLowerCase() + ")" : "");
      if (q) return "is waiting for their first card, ready to print";
      if (r.printedBefore) return "has a card" + (r.lastIssue && r.lastIssue.at ? ", printed " + idsAskedOn(r.lastIssue) + " " + String(r.lastIssue.at).slice(0, 4) : "");
      return "isn’t waiting for a card";
    };
    const lookup = text => {
      const t = " " + String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ") + " ";
      const ids = (String(text).match(/\b(?:[a-z]{2,4}-\d{2}-\d{3,4}|\d{3}-\d{3,4})\b/gi) || []).map(norm);
      const hits = data.records.filter(r => {
        if (ids.length) return ids.includes(norm(r.displayId)) || ids.includes(norm(r.id));
        const words = String(r.name || "").toLowerCase().split(/\s+/).filter(w => w.length > 1);
        return words.length >= 2 && t.includes(" " + words[0] + " ") && t.includes(" " + words[words.length - 1] + " ");
      });
      return hits.map(r => ({ name: r.name, displayId: r.displayId, centre: r.centre, status: statusOf(r) }));
    };
    const byC = {};
    recs.filter(r => !isBlocked(r)).forEach(r => { const k = r.centre || "No centre"; byC[k] = (byC[k] || 0) + 1; });
    return {
      n: cards.length, sheets: nSheets, block: printBlock, stock, gap, fillable: fillable.length,
      bad: checks.filter(c => c.tone === "bad").map(c => c.text), warn: checks.filter(c => c.tone === "warn").map(c => c.text),
      blocked: recs.filter(isBlocked).length, ready: ready.length, reprints: recs.filter(r => !isBlocked(r) && r.reason === "reprint").length,
      blockedList: recs.filter(isBlocked).map(r => ({ name: r.name, asked: idsAskedRecently(askedOf(r)) })),
      onSheet: sorted.map(c => c.label), byCentre: Object.entries(byC).sort((a, b) => b[1] - a[1]).map(([centre, n]) => ({ centre, n })), lookup,
    };
  };
  const askPlan = prompt => {
    askLast.current = prompt;
    say2("me", { text: prompt });
    // A question about the sheet or a person is answered here, from the studio's own data; nothing is sent.
    const local = idsAskAnswer(prompt, askCtx());
    if (local) { say2("studio", { kind: "answer", text: local }); return; }
    setAskBusy(true);
    const current = askRes && askRes.plan ? askRes.plan : (chat.slice().reverse().find(m => m.kind === "plan" && m.res) || {}).res ? (chat.slice().reverse().find(m => m.kind === "plan" && m.res)).res.plan : null;
    NGGApi.admin.idStudio.plan(prompt, current).then(res => {
      const meta = { by: res.by, provider: res.provider, aiError: res.aiError };
      if (!Object.keys(res.plan || {}).length) {
        const bad = checks.filter(c => c.tone === "bad").map(c => c.text), warn = checks.filter(c => c.tone === "warn").map(c => c.text);
        const answer = idsAskAnswer(prompt, { n: cards.length, sheets: nSheets, block: printBlock, bad, warn, blocked: recs.filter(isBlocked).length, ready: ready.length });
        say2("studio", answer ? { kind: "answer", text: answer } : Object.assign({ kind: "empty" }, meta));
        return;
      }
      const plan = res.plan;
      const live0 = !!(askRes && askRes.plan && liveId);
      if (plan.do || (!idsPlanHasSel(plan) && !live0)) {
        const id = say2("studio", Object.assign({ kind: "cmd", plan, preview: idsCmdPreview(plan, st), pending: askMode === "ask" }, meta));
        if (askMode === "act") commitCmd(id, plan);
        return;
      }
      // Each reply keeps what it said, so it still reads right once a later one is live.
      const snap = planSnap(res);
      const id = say2("studio", Object.assign({ kind: "plan", res, prompt, snap, pending: askMode === "ask" }, meta));
      if (askMode === "act") commit(id, res, prompt);
    }).catch(e => say2("studio", { kind: "error", retry: true, text: e && e.code === "rate_limited" ? "That’s a lot of requests in a few minutes. Wait a moment, then try again."
      : e && e.code === "prompt_too_long" ? "Keep it under 400 characters." : idsErrText(e, "Couldn’t read that. Check your connection, then try again.") }))
      .finally(() => setAskBusy(false));
  };
  // A chip's ×: the same plan without that part, applied here — no second reading needed.
  const askDrop = fn => {
    if (!askRes || !askRes.plan) return;
    const next = fn(askRes.plan);
    // With every part taken out, what is left is "every new card".
    applyPlan({ plan: Object.keys(next).length ? next : { which: "new" }, by: askRes.by, provider: askRes.provider, refined: true, notes: [] }, askRes.prompt);
  };
  const askReset = () => { setChat([]); setLiveId(0); setAskRes(null); askUndo.current = null; };
  const askUndoIt = () => {
    const u = askUndo.current;
    if (!u) return;
    setQueue(u.queue); setSt(u.st); setKind(u.kind); setCentre(u.centre); setFilter(u.filter); setRmode(u.rmode); setRng(u.rng);
    askUndo.current = null;
    setAskRes(null);
    setChat(c => c.map(m => m.id === liveId ? Object.assign({}, m, { undone: true }) : m));
    setLiveId(0);
    say("The sheet is back as it was");
  };
  const askPrint = () => {
    if (!askRes || !askRes.n) return;
    if (cards.length !== askRes.n) return say("The sheet has changed since the plan (" + idsN(cards.length, "card") + " now). Check it, then use Print in the panel.");
    if (printBlock) return say(printBlock);
    /* Not straight to the printer: the same confirm the header's Print opens,
       with the count, the sheets and the reason on it (v4: the assistant
       cannot print). */
    startPrint();
  };
  const askFill = () => { const k = fillGap(); if (k) setAskRes(a => a && Object.assign({}, a, { n: a.n + k })); };
  /* Starters from the studio's real queue, and the next steps after a reply. */
  const askStarters = (() => {
    const out = [];
    const byC = {};
    recs.filter(r => !isBlocked(r) && r.reason === "new").forEach(r => { if (r.centre) byC[r.centre] = (byC[r.centre] || 0) + 1; });
    const top = Object.entries(byC).sort((a, b) => b[1] - a[1])[0];
    if (top) out.push("New cards for everyone at " + top[0] + ", front and back");
    const rp = recs.filter(r => !isBlocked(r) && r.reason === "reprint").length;
    if (rp) out.push("Print the " + rp + " " + (rp === 1 ? "reprint" : "reprints"));
    const bl = recs.filter(isBlocked).length;
    if (bl) out.push("Who is waiting for a photo?");
    return out;
  })();
  const askNext = (() => {
    const out = [];
    if (!cards.length) return out;
    if (gap > 0 && fillable.length && !(breakActive && pads)) out.push("Fill the gaps");
    if (printBlock) out.push("Why can’t I print yet?");
    if (st.backs === "off") out.push("Front and back");
    if (st.reason !== "proof") out.push("Make it a proof");
    if (recs.some(isBlocked)) out.push("Ask the ones with no photo for photos");
    if (!printBlock) out.push("Who is on the sheet?");
    return out.slice(0, 3);
  })();
  const askLive = askRes && askRes.n && liveId ? {
    sheets: nSheets, block: printBlock, gap, fill: Math.min(gap, fillable.length),
    settings: [
      { label: IDS_PAPERS[st.paper][0], k: "paper" },
      { label: (IDS_BACKS.find(b => b[0] === st.backs) || IDS_BACKS[0])[1], k: "backs" },
      { label: st.marks ? "Crop marks" : "No crop marks", k: "marks" },
      { label: st.dpi + " dpi", k: "dpi" },
      { label: "Sorted by " + ((IDS_ORDERS.find(o => o[0] === st.order) || IDS_ORDERS[0])[1]).toLowerCase(), k: "order" },
    ].concat((askRes.changed || []).filter(k => k === "margin" || k === "gap" || k === "skip" || k === "packing").map(k => ({ label: idsCmdLabel(k, st[k], st).replace(/^./, c => c.toUpperCase()), k }))).concat(st.reason === "proof" ? [{ label: "Proof", k: "reason" }] : []).map(x => Object.assign(x, { changed: (askRes.changed || []).includes(x.k) })),
  } : null;
  const A = { ask: askPlan, retry: () => askLast.current && askPlan(askLast.current), busy: askBusy, result: askRes, live: askLive,
    chat, liveId, mode: askMode, setMode: setAskMode, reset: askReset, apply: m => m.kind === "cmd" ? commitCmd(m.id, m.plan) : commit(m.id, m.res, m.prompt),
    lastCmdId, undoCmd, starters: askStarters, next: askNext,
    bindInput: ref => { aiInput.current = ref.current; },
    people: q => { const t = String(q || "").toLowerCase(); return data.records.filter(r => !t || (r.name + " " + (r.displayId || "")).toLowerCase().includes(t)).slice(0, 6); },
    print: askPrint, undo: askUndoIt, canUndo: !!(askRes && askUndo.current && liveId), drop: askDrop, fill: askFill };

  /* ── Everything the Make tab reads ── */
  const M = {
    G, st, settings: st, set, setOrder: o => set({ order: o }), scen, applyScenario, src, setSrc, records, uploadsUI, searchRef,
    recCount: recs.length, upFronts: uploads.filter(u => !u.backOf).length, centres, accent: accentOf, dataState: data.state, reload: load,
    designsUI, setDesign, lanyardUI, hasVolunteers: data.kinds.includes("volunteer"), openDesigner: e => { e.preventDefault(); setPage && setPage("designer"); },
    slots, sections, sheetG, skip: st.skip, backs: st.backs, marks: st.marks, proof: st.reason === "proof", nCards: cards.length, pads, stock, gap, fillable: fillable.length, fillGap, breakActive,
    sheet: { idx: sheetIdx, go: setSheetIdx, count: nSheets, face, setFace, overview, setOverview, remove: removeSheet, sec: here ? here.sec : null, page: here ? here.page : 0 },
    sel, select: setSel, selCard, moveSel, removeSel,
    resendSel: () => selCard && selCard.rec && resendOne(selCard.rec), resending,
    canResendSel: !!(selCard && selCard.rec && IDS_RESEND[selCard.rec.kind] && selCard.rec.raw && selCard.rec.raw.token),
    canEditPhotoSel: !!(selCard && selCard.rec && IDS_PHOTO_EDIT[selCard.rec.kind]), editPhotoSel: () => selCard && selCard.rec && setEditPhoto(selCard.rec),
    canFrameSel: !!(selCard && selCard.rec && selCard.rec.photoUrl), frameSel: () => selCard && selCard.rec && setFramePhoto(selCard.rec),
    rotateSel: () => selCard && selCard.upload && setU(selCard.upload.uid, { rot: ((selCard.upload.rot || 0) + 90) % 360 }),
    toggleFitSel: () => selCard && selCard.upload && setU(selCard.upload.uid, { fit: selCard.upload.fit === "contain" ? "cover" : "contain" }),
    /* Dropped on a card: it takes that card's place. Dropped on an empty slot:
       it goes after the last card of that sheet's size. */
    dropAt: (e, target, secKey) => {
      e.preventDefault();
      const k = e.dataTransfer.getData("text/plain");
      if (!k) return;
      if (target) return reorder(k, sorted.findIndex(c => c.key === target));
      const last = sorted.map((c, j) => (slots.find(x => !x.pad && x.key === c.key) || {}).sec === secKey ? j : -1).filter(j => j >= 0).pop();
      reorder(k, last == null ? sorted.length : last + 1);
    },
    setFilterToggle: f => records.setFilter(filter === f ? "all" : f), pickJob,
    renderFace, checks, printBlock, startPrint, startExport, xjob, warm, dpi: st.dpi, improve: { n: improveN, open: () => setImprove({ n: improveN, recs: improvable() }) }, stopExport: () => { xcancel.current = true; },
    pngSel: () => { const sl = selCard && slots.find(x => !x.pad && x.key === selCard.key); if (sl) runExport({ format: "png", dpi: st.dpi >= 300 ? st.dpi : 300, verify: false, reason: "proof", only: sl }); }, printTest: () => runPrint({ test: true }), job, printNextBatch, stopJob: () => { setJob(null); say("Stopped. The sheets already out are logged."); },
  };

  const tabs = [["make", phone ? "Queue" : "Make cards", recs.filter(r => !isBlocked(r)).length], ["log", "Print log", null], ["lookup", phone ? "Look up" : "Look up a person", null]];
  const gridCls = W >= 1280 ? "is-roomy" : W >= 1024 ? "is-wide" : "is-two";

  const two = W < 1024;
  const showPane = p => e => {
    paneTrigger.current = e.currentTarget;
    if (two) { if (drawer && pane === p) setDrawer(false); else { setPane(p); setDrawer(true); } }
    else setPane(p);
    if (p === "assistant") setTimeout(() => focusComposer(), 0);
  };
  const closePane = () => {
    if (two) setDrawer(false); else setPane("settings");
    if (paneTrigger.current) paneTrigger.current.focus();
  };
  const paneOn = p => two ? drawer && pane === p : pane === p;
  const side = pane === "assistant" ? <IdsAssistant A={A} onClose={closePane}/> : <IdsSettings M={M}/>;

  return (
    <div className={"ids-app" + (phone ? " is-phone" : "")} ref={rootRef}>
      <header className="ids-head">
        <a href="/club-admin" className="ids-brand" aria-label="Back to the Club portal" onClick={e => { e.preventDefault(); setPage && setPage("club-admin"); }}>
          <IdsIcon name="caret-left" className="ids-brand-back"/><img src="/assets/logo.png" alt="" width="26" height="26"/><span>ID Card Studio</span>
        </a>
        <div className="ids-tabs" role="tablist" aria-label="Studio">
          {tabs.map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={"ids-tab" + (tab === k ? " is-on" : "")} onClick={() => setTab(k)}>
              {l}{n != null && <span className="ids-tab-n">{n}</span>}
            </button>
          ))}
        </div>
        <span className="ids-grow"/>
        {tab === "make" && !phone && data.state === "ready" && <>
          <div className="ids-tabs ids-panes" role="group" aria-label="Side panel">
            <button type="button" className={"ids-tab" + (paneOn("settings") ? " is-on" : "")} aria-pressed={paneOn("settings")} onClick={showPane("settings")}><IdsIcon name="sliders-horizontal"/>Settings</button>
            <button type="button" className={"ids-tab" + (paneOn("assistant") ? " is-on" : "")} aria-pressed={paneOn("assistant")} onClick={showPane("assistant")}><IdsIcon name="sparkle" className="ids-spark"/>Assistant</button>
          </div>
          {/* The one solid button on screen: it states the count before anyone presses it. */}
          <button type="button" className={"ids-btn ids-btn--headprint" + (printBlock ? " is-off" : "")} aria-disabled={!!printBlock || undefined} disabled={!!xjob}
                  title={printBlock || undefined} onClick={startPrint}>
            <IdsIcon name="printer"/>Print {cards.length}
          </button>
        </>}
      </header>

      {data.state === "forbidden" ? (
        <div className="ids-page"><div className="ids-state is-error" role="alert"><IdsIcon name="lock"/><span>Printing ID cards needs the People or Summer School permission. Ask an admin to grant it.</span></div></div>
      ) : tab === "make" ? (phone
        ? (data.state === "ready" ? <IdsPhoneQueue recs={recs} isBlocked={isBlocked} onAsk={askOne} askedOf={r => idsAskedRecently(askedOf(r))}/> : <div className="ids-page"><IdsLoadState state={data.state} onRetry={load} what="the records"/></div>)
        : (
          <div className="ids-make-wrap">
            <div className={"ids-make " + gridCls + (!two && pane === "assistant" ? " has-ai" : "") + (W < 860 ? " is-narrow" : "")}>
              <IdsSource M={M}/>
              <IdsSheetCol M={M}/>
              {!two && (pane === "assistant" ? <aside className="ids-side" aria-label="Assistant">{side}</aside> : side)}
            </div>
            {two && drawer && (
              <div className="ids-pane-drawer" role="dialog" aria-modal="false" aria-label={pane === "assistant" ? "Assistant" : "Settings"}>
                <div className="ids-pane-drawer-top">
                  <b>{pane === "assistant" ? "Assistant" : "Settings"}</b>
                  <button type="button" className="ids-iconbtn" aria-label={"Close " + (pane === "assistant" ? "the assistant" : "settings")} onClick={closePane}><IdsIcon name="x"/></button>
                </div>
                {side}
              </div>
            )}
          </div>
        )) : tab === "log" ? <IdsLog log={log} state={log.state === "idle" ? "loading" : log.state} onFilter={f => loadLog(f)} onMore={() => loadLog(null, true)} onRetry={() => loadLog()} onOpen={openRun} narrow={W < 900}/>
        : <IdsLookup lookup={lookup} design={designHead} onQueue={queueReprint}/>}

      {confirm && <IdsConfirm run={confirm} onCancel={() => setConfirm(null)} onPrint={onConfirmPrint}/>}
      {askConfirm && (
        <IdsDialog alert width={480} title={"Ask " + idsN(askConfirm.length, "person", "people") + " for a photo?"} onClose={() => setAskConfirm(null)}
          footer={<>
            <button type="button" className="ids-btn" onClick={() => setAskConfirm(null)}>Cancel</button>
            <button type="button" className="ids-btn ids-btn--primary" data-autofocus onClick={() => { const l = askConfirm; setAskConfirm(null); askPhotos(l, false); }}>Ask {askConfirm.length}</button>
          </>}>
          <p className="ids-note">Each member gets a message saying how to add a photo, and a child’s guardians get it too. Summer School participants’ guardians are asked; volunteers are asked by email. The admins for their centres get one summary.</p>
          <p className="ids-note">Anyone asked in the last 3 days is left out.{askable.length > IDS_ASK_MAX ? " This sends the first " + IDS_ASK_MAX + "; ask again for the rest." : ""}</p>
        </IdsDialog>
      )}
      {after && <IdsAfterPrint items={after.items} renderFace={renderFace} onLater={() => { setAfter(null); say("You can mark failures from the print log later."); }} onDone={afterDone}/>}
      {runOpen && <IdsRunDrawer run={runOpen} phone={phone} onClose={() => setRunOpen(null)} onReprint={reprintRun} onFailed={markRunFailed} onRetry={() => openRun(runOpen)}/>}
      {framePhoto && <IdsPhotoFrame rec={framePhoto} say={say} onClose={() => setFramePhoto(null)} onSaved={() => { idsFaceForget(); setData(d => Object.assign({}, d)); }}/>}
      {editPhoto && typeof PhotoEditor !== "undefined" && (
        <PhotoEditor target={{ subjectType: IDS_PHOTO_EDIT[editPhoto.kind], subjectId: editPhoto.id }} currentUrl={editPhoto.photoUrl} title={editPhoto.name}
          onSaved={() => { say(editPhoto.name + "’s photo is updated"); _idsTplDone.clear(); idsFaceForget(); load(); }} onClose={() => setEditPhoto(null)}/>
      )}
      {improve && <IdsImproveDialog run={improve} onCancel={() => setImprove(null)} onStart={runImprove}/>}
      {improveRes && <IdsImproveResult res={improveRes} onClose={() => setImproveRes(null)}/>}
      {xconfirm && <IdsExportDialog run={xconfirm} onCancel={() => setXconfirm(null)} onStart={runExport}/>}
      {xresult && <IdsExportResult res={xresult} onClose={() => setXresult(null)} onRetry={xresult.retry} onDrop={xresult.drop}/>}
      {toastNode}
      {farm && (
        <div className="ids-farm" aria-hidden="true">
          <div ref={farmRef}>
            {farm.jobs.map(j => <div key={j.key} className="ids-x-face" style={{ width: (j.s.cw || G.cw) + "mm", height: (j.s.ch || G.ch) + "mm" }}>{renderFace(j.s, j.face)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
