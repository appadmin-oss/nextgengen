/* ============================================================================
   ID Card Studio — the data, and the card faces.

   Records come from the three existing card ops (members, Summer School
   participants, volunteers) and from Afrovanguard (its member cards, through
   ids-av.jsx and domain/ngv-portal.php), each under its own capability; a list the
   operator may not read is simply not offered, never an error on the page.
   Who already has a card, open reprint requests, photo asks and the design
   each card type prints with come from one call (admin.ids.state), so the
   queue never asks per person.

   IdsRecordFace is an ADAPTER, not a card. A card type prints with the
   design assigned to it (a PUBLISHED Design Studio template, and its paired
   back), drawn by the Design Studio's own renderer — dsnRaster → tplToFabric
   — so what this sheet shows is what /designer shows. With no design
   assigned it is the standard card: NggcMemberCard and NggcMemberCardBack for
   members, CardFront / VolunteerCardFront / CardBack for the rest. CLAUDE.md
   §7: one renderer per card, never two; what the sheet shows is what prints.
   ========================================================================== */

const IDS_MM_PX = 96 / 25.4;                 // CSS px per mm at 96 dpi
const IDS_FRONT_W = 590;                      // the participant / volunteer cards' design width
const IDS_MEMBER_MM = [54, 85];               // NggcMemberCard's own geometry
const IDS_TPL_DPI = 300;                      // a design is rastered once, at print resolution
const IDS_SIZE_TOL = 0.6;                     // mm: CR80's 53.98 × 85.6 and the member card's 54 × 85 are one card

/** One row from any of the three lists, in the studio's shape. `raw` is what the renderer gets. */
function idsRecord(kind, raw, state) {
  const subjectType = kind === "summer" ? "student" : kind;
  const id = String(kind === "member" ? raw.memberId : kind === "summer" ? raw.studentId : kind === "afrovanguard" ? raw.avId : raw.volunteerId || "");
  const name = kind === "member" || kind === "afrovanguard" ? String(raw.fullName || "") : [raw.firstName, raw.surname].filter(Boolean).join(" ");
  const centre = raw.centre && raw.centre.name ? raw.centre : null;
  const key = subjectType + ":" + id;
  const issued = (state.issued || {})[key] || null;
  const re = (state.reprints || {})[key] || null;
  /* The card in their hand no longer matches the record — the server compares
     what was PRINTED (photo, name, ID, QR) with the record now. A newer design
     alone is not a reason: a card in last year's design is still a good card. */
  const staleAll = (state.stale || {})[key] || [];
  const stale = staleAll.filter(x => x !== "design");
  const division = kind === "afrovanguard" ? (raw.avKind === "NGV" ? "NextGen Vanguard" : "Level " + (raw.level || "")) : kind === "member" ? ((raw.disciplines || []).length ? raw.disciplines.join(" · ") : raw.track) : kind === "summer" ? raw.track : (raw.faculty || raw.role);
  const displayId = kind === "member" && raw.displayIdMissing ? "" : String(raw.displayId || "");
  return {
    key, id, subjectType, kind, name, raw,
    centre: centre ? centre.name : "", centreObj: centre,
    // An Afrovanguard card's photo is inside its own markup; without one it prints initials, as designed.
    displayId, photoUrl: kind === "afrovanguard" ? "" : String(raw.photoUrl || ""),
    hasPhoto: kind === "afrovanguard" ? !!raw.hasPhoto : !!raw.photoUrl,
    // A reprint is somebody already holding a card and asked for again; a
    // person with a card and no request is done, not queued.
    reason: re || stale.length ? "reprint" : "new", why: re ? re.why : stale.length ? idsStaleWhy(stale) : "",
    cause: re ? (re.cause || "") : stale.length ? "changed" : "", stale, designOld: staleAll.indexOf("design") >= 0,
    printedBefore: !!issued, lastIssue: issued,
    divMissing: !String(division || "").trim(),
    // When they registered (participants, volunteers) or joined (members): what a run "by date" cuts on.
    day: String(raw.enrolledAt || raw.joinDate || raw.createdAt || "").slice(0, 10),
    // The number a person means by "cards 40 to 80": the last run of digits in the printed ID.
    seq: (m => m ? parseInt(m[1], 10) : null)(String(displayId).match(/(\d+)(?!.*\d)/)),
    asked: (state.asked || {})[key] || null,      // { at, channels } of the last photo request
  };
}

/** "Card no longer matches: photo changed, name corrected". */
const IDS_STALE_WORDS = { photo: "photo changed", name: "name corrected", id: "ID number changed", qr: "QR reissued, the old card no longer opens" };
function idsStaleWhy(list) { return "Card no longer matches: " + list.map(x => IDS_STALE_WORDS[x] || x).join(", "); }
/** Reprint reasons an operator picks; the server keeps them as codes (lost and never received get a new QR). */
const IDS_REPRINT_REASONS = [["lost", "Lost", "Lost or stolen — gets a new QR, the old card stops working"], ["damaged", "Damaged", "Damaged or faded — same QR"],
  ["never_received", "Never received", "Never reached them — gets a new QR"], ["name", "Details changed", "Name or details corrected"]];

/** Load everything the studio shows. Each list is optional: a 403 means that desk is not this operator's. */
async function idsLoad() {
  const R = NGGApi.admin.registration;
  const soft = p => p.then(r => ({ ok: true, r }), e => ({ ok: false, forbidden: !!e && (e.status === 403 || e.code === "forbidden"), e }));
  const [st, mem, sum, vol, av] = await Promise.all([soft(NGGApi.admin.idStudio.state()), soft(R.memberCards()), soft(R.cards()), soft(R.volunteerCards()),
    soft(NGGApi.admin.idStudio.avCards())]);
  const lists = [["member", mem], ["summer", sum], ["volunteer", vol]];
  if (!st.ok || lists.every(([, x]) => !x.ok && x.forbidden)) {
    const err = new Error(st.ok ? "forbidden" : "failed");
    err.forbidden = !st.ok ? !!st.forbidden : true;
    throw err;
  }
  if (lists.some(([, x]) => !x.ok && !x.forbidden)) throw new Error("failed");
  /* Afrovanguard is another site: a failure is said on the page, with its
     reason (not set up, wrong secret, unreachable), never a reason the
     studio's own cards cannot print. */
  const avNote = av.ok || av.forbidden ? "" : "Afrovanguard cards couldn’t be fetched: " + ((av.e && (av.e.detail || av.e.message)) || "no answer") + "";
  if (av.ok) lists.push(["afrovanguard", av]);
  const state = st.r || {};
  const records = [], programs = {};
  lists.forEach(([kind, x]) => {
    if (!x.ok) return;
    programs[kind] = x.r.program || {};
    (x.r.cards || []).forEach(row => records.push(idsRecord(kind, row, state)));
  });
  // Only people who still need a card: never printed, or asked for again.
  const queue = records.filter(r => !r.printedBefore || r.reason === "reprint");
  return { records, queue, programs, kinds: lists.filter(([, x]) => x.ok).map(([k]) => k), avNote,
    designs: state.designs || {}, choices: state.choices || {} };
}

/* ── The size a card is, which the sheet must match ───────────────────────── */

/**
 * [w, h] in mm a record's card prints at: its assigned design's trim first;
 * else the standard card's own size, which comes from its SUBJECT first and
 * the programme setting second (CLAUDE.md §7). A member card is ID-1 and its
 * geometry is its renderer's; the Summer School and volunteer standard cards
 * are the lanyard size the programme sets (idcard.widthMm × heightMm, 54 × 75
 * by default). Reading CR80 for every subject printed a 54 × 75 card
 * stretched to 85.6mm — the old Card Studio got this right and the rebuild
 * lost it.
 */
function idsRecordMm(design, kind, program) {
  if (design) return [Number(design.wMm) || 54, Number(design.hMm) || 85];
  // Afrovanguard's card is ID-1, 54 × 85.6 mm: its own geometry, never a setting here.
  if (kind === "afrovanguard") return [54, 85.6];
  if (kind && kind !== "member") {
    const p = program || {};
    return [Number(p.widthMm) || 54, Number(p.heightMm) || 75];
  }
  return [IDS_SIZES.cr80p[2], IDS_SIZES.cr80p[3]];
}
function idsSameMm(a, b) { return Math.abs(a[0] - b[0]) <= IDS_SIZE_TOL && Math.abs(a[1] - b[1]) <= IDS_SIZE_TOL; }
/** The sheet settings that print cards of this size: a named size where one matches, else custom. */
function idsSizeSettings(mm) {
  const k = IDS_SIZE_IDS.find(s => s !== "custom" && idsSameMm([IDS_SIZES[s][2], IDS_SIZES[s][3]], mm));
  return k ? { size: k } : { size: "custom", cw: mm[0], ch: mm[1] };
}
function idsMmLabel(mm) { return (+mm[0].toFixed(1)) + " × " + (+mm[1].toFixed(1)) + " mm"; }

/* ── Design Studio faces ──────────────────────────────────────────────────── */

/* Rasters are cached per template, version, side and person, and every one in
   flight is tracked, so a print can wait for the last card to finish drawing
   rather than snapshotting a blank slot. */
const _idsTplDone = new Map();
const _idsTplWait = new Map();
function idsTplKey(t, side, row) { return [t.templateId, t.version, side, row.studentId || row.volunteerId || row.memberId || ""].join("|"); }
function idsTplRaster(key, tpl, row) {
  if (_idsTplDone.has(key)) return Promise.resolve(_idsTplDone.get(key));
  if (_idsTplWait.has(key)) return _idsTplWait.get(key);
  const p = loadVendor("fabric")
    .then(f => window.dsnRaster(tpl, row, f, IDS_TPL_DPI))
    .then(out => ({ url: out.url }), () => ({ url: "", failed: true }))
    .then(v => { _idsTplDone.set(key, v); _idsTplWait.delete(key); return v; });
  _idsTplWait.set(key, p);
  return p;
}
/** Resolves once nothing is drawing — including anything a later draw started. */
async function idsTplSettled() {
  while (_idsTplWait.size) await Promise.all(Array.from(_idsTplWait.values()));
}

function IdsTplFace({ design, side, row, boxW, boxH }) {
  const t = side === "back" ? design.back : design;
  const tpl = Object.assign({}, t.published, { wMm: design.wMm, hMm: design.hMm });
  const key = idsTplKey(t, side, row);
  const [px, setPx] = React.useState(() => _idsTplDone.get(key) || null);
  React.useEffect(() => {
    let live = true;
    if (_idsTplDone.has(key)) { setPx(_idsTplDone.get(key)); return undefined; }
    setPx(null);
    idsTplRaster(key, tpl, row).then(v => { if (live) setPx(v); });
    return () => { live = false; };
    // eslint-disable-next-line
  }, [key]);
  if (!px) return <div className="ids-face-blank" style={{ width: boxW, height: boxH }}>Drawing {design.name}…</div>;
  if (px.failed) return <div className="ids-face-blank is-bad" style={{ width: boxW, height: boxH }}>{design.name} couldn’t be drawn</div>;
  return <img className="ids-face-tpl" src={px.url} alt="" style={{ width: boxW, height: boxH }}/>;
}

/* ── The card for a record ────────────────────────────────────────────────── */

/** The card renderer for a record, scaled into a box of w × h mm. `design` is its type's assigned design, or null. */
function IdsRecordFace(props) {
  /* One record the renderer chokes on costs its own slot, named, never the
     whole sheet — the old studio's CardDrawFailed, restored. */
  const r = props.rec || {};
  const boxW = props.wMm * IDS_MM_PX, boxH = props.hMm * IDS_MM_PX;
  // data-ids-failed: print and export look for it, so a failed card is never printed or logged as issued.
  const fallback = <div className="ids-face-blank is-bad" data-ids-failed={r.displayId || r.name || r.id || "a card"} style={{ width: boxW, height: boxH }}>Couldn’t draw this card<br/><span className="ids-mono">{r.displayId || r.id}</span></div>;
  return typeof SafeBlock !== "undefined" ? <SafeBlock label={"ids-face " + (r.key || "")} fallback={fallback}><IdsRecordFaceInner {...props}/></SafeBlock> : <IdsRecordFaceInner {...props}/>;
}
function IdsRecordFaceInner({ rec, face, program, wMm, hMm, design }) {
  const boxW = wMm * IDS_MM_PX, boxH = hMm * IDS_MM_PX;
  if (rec.kind === "afrovanguard") return <IdsAvFace rec={rec} side={face === "back" ? "back" : "front"} boxW={boxW} boxH={boxH}/>;
  if (design && (face !== "back" || design.back)) return <IdsTplFace design={design} side={face} row={rec.raw} boxW={boxW} boxH={boxH}/>;
  if (rec.kind === "member") return <IdsMemberFace rec={rec} back={face === "back"} program={program} boxW={boxW} boxH={boxH}/>;
  const H = Math.round(IDS_FRONT_W * hMm / wMm);
  const S = boxW / IDS_FRONT_W;
  const Comp = face === "back" ? window.CardBack : rec.kind === "volunteer" ? window.VolunteerCardFront : window.CardFront;
  if (!Comp) return <div className="ids-face-blank">Card unavailable</div>;
  return <div className="ids-face-rec" style={{ width: boxW, height: boxH }}><Comp card={rec.raw} program={program} S={S} H={H}/></div>;
}

/* The member card is millimetre geometry (54 × 85), front and back. Each is
   scaled to the slot whole, never redrawn; the front's QR is the same payload
   every member card carries. */
function IdsMemberFace({ rec, back, program, boxW, boxH }) {
  const [qrUrl, setQrUrl] = React.useState("");
  const payload = !back && rec.raw && rec.raw.memberId && window._ngMemberQrPayload ? window._ngMemberQrPayload(rec.raw) : "";
  React.useEffect(() => {
    let live = true;
    if (!payload || !window._ngQrDataUrl) return undefined;
    window._ngQrDataUrl(payload).then(u => { if (live) setQrUrl(u || ""); });
    return () => { live = false; };
  }, [payload]);
  const nw = IDS_MEMBER_MM[0] * IDS_MM_PX, nh = IDS_MEMBER_MM[1] * IDS_MM_PX;
  const k = Math.min(boxW / nw, boxH / nh);
  return (
    <div className="ids-face-rec" style={{ width: boxW, height: boxH }}>
      <div style={{ width: nw, height: nh, transform: "scale(" + k + ")", transformOrigin: "top left" }}>
        {back ? <NggcMemberCardBack member={rec.raw} program={program}/>
          : window.NggcMemberCard ? <window.NggcMemberCard member={rec.raw} size="wallet" qrUrl={qrUrl}/> : null}
      </div>
    </div>
  );
}

/* ── Photo requests: what went where, in words ────────────────────────────── */

const IDS_ASK_CHANNEL = { member: "them by email", member_app: "them in the app", guardians: "their guardians", guardian: "their guardian", volunteer: "them by email" };
const IDS_ASK_REFUSAL = { has_photo: "already has a photo", asked_recently: "was asked in the last few days", out_of_scope: "is outside your centres",
  forbidden: "isn’t yours to ask", not_found: "wasn’t found", bad_subject: "wasn’t found" };

/** One sentence for the toast, from the server's per-row verdicts — never from what was pressed. */
function idsAskSummary(res, nameOf) {
  const rows = (res && res.results) || [];
  const sent = rows.filter(r => r.sent), refused = rows.filter(r => r.error);
  const admins = (res && res.admins) || 0;
  const adminsTxt = admins ? " " + idsN(admins, "admin") + " told." : "";
  if (rows.length === 1 && sent.length === 1) {
    const ch = sent[0].sent.map(c => IDS_ASK_CHANNEL[c]).filter(Boolean);
    return ch.length ? "Asked " + ch.join(" and ") + "." + adminsTxt : "Noted, but there was nobody to send it to. Ask them in person." + adminsTxt;
  }
  if (rows.length === 1 && refused.length === 1) return nameOf(refused[0]) + " " + (IDS_ASK_REFUSAL[refused[0].error] || "couldn’t be asked") + ".";
  const quiet = sent.filter(r => !r.sent.length).length;
  return "Asked " + idsN(sent.length - quiet, "person", "people") + (quiet ? ", " + quiet + " with no one to send to" : "")
    + (refused.length ? ", " + refused.length + " skipped" : "") + "." + adminsTxt;
}
function idsAskedOn(a) {
  return a && a.at ? new Date(a.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
}
