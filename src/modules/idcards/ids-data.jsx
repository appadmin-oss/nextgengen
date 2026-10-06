/* ============================================================================
   ID Card Studio — the data, and the card faces.

   Records come from the three existing card ops (members, Summer School
   participants, volunteers), each under its own capability; a list the
   operator may not read is simply not offered, never an error on the page.
   Who already has a card, open reprint requests and photo asks come from one
   call (admin.ids.state), so the queue never asks per person.

   IdsCardFace is an ADAPTER, not a card: it places the real renderers —
   NggcMemberCard for members, CardFront / VolunteerCardFront / CardBack for
   the rest — in a box of the card's true size in millimetres. CLAUDE.md §7:
   one renderer per card, never two; what the sheet shows is what prints.
   ========================================================================== */

const IDS_MM_PX = 96 / 25.4;                 // CSS px per mm at 96 dpi
const IDS_FRONT_W = 590;                      // the participant / volunteer cards' design width
const IDS_MEMBER_MM = [54, 85];               // NggcMemberCard's own geometry

/** One row from any of the three lists, in the studio's shape. `raw` is what the renderer gets. */
function idsRecord(kind, raw, state) {
  const subjectType = kind === "summer" ? "student" : kind;
  const id = String(kind === "member" ? raw.memberId : kind === "summer" ? raw.studentId : raw.volunteerId || "");
  const name = kind === "member" ? String(raw.fullName || "") : [raw.firstName, raw.surname].filter(Boolean).join(" ");
  const centre = raw.centre && raw.centre.name ? raw.centre : null;
  const key = subjectType + ":" + id;
  const issued = (state.issued || {})[key] || null;
  const re = (state.reprints || {})[key] || null;
  const division = kind === "member" ? ((raw.disciplines || []).length ? raw.disciplines.join(" · ") : raw.track) : kind === "summer" ? raw.track : (raw.faculty || raw.role);
  const displayId = kind === "member" && raw.displayIdMissing ? "" : String(raw.displayId || "");
  return {
    key, id, subjectType, kind, name, raw,
    centre: centre ? centre.name : "", centreObj: centre,
    displayId, photoUrl: String(raw.photoUrl || ""),
    // A reprint is somebody already holding a card and asked for again; a
    // person with a card and no request is done, not queued.
    reason: re ? "reprint" : "new", why: re ? re.why : "",
    printedBefore: !!issued, lastIssue: issued,
    divMissing: !String(division || "").trim(),
    asked: !!(state.asked || {})[key],
  };
}

/** Load everything the studio shows. Each list is optional: a 403 means that desk is not this operator's. */
async function idsLoad() {
  const R = NGGApi.admin.registration;
  const soft = p => p.then(r => ({ ok: true, r }), e => ({ ok: false, forbidden: !!e && (e.status === 403 || e.code === "forbidden"), e }));
  const [st, mem, sum, vol] = await Promise.all([soft(NGGApi.admin.idStudio.state()), soft(R.memberCards()), soft(R.cards()), soft(R.volunteerCards())]);
  const lists = [["member", mem], ["summer", sum], ["volunteer", vol]];
  if (!st.ok || lists.every(([, x]) => !x.ok && x.forbidden)) {
    const err = new Error(st.ok ? "forbidden" : "failed");
    err.forbidden = !st.ok ? !!st.forbidden : true;
    throw err;
  }
  if (lists.some(([, x]) => !x.ok && !x.forbidden)) throw new Error("failed");
  const state = st.r || {};
  const records = [], programs = {};
  lists.forEach(([kind, x]) => {
    if (!x.ok) return;
    programs[kind] = x.r.program || {};
    (x.r.cards || []).forEach(row => records.push(idsRecord(kind, row, state)));
  });
  // Only people who still need a card: never printed, or asked for again.
  const queue = records.filter(r => !r.printedBefore || r.reason === "reprint");
  return { records, queue, programs, kinds: lists.filter(([, x]) => x.ok).map(([k]) => k) };
}

/** The card renderer for a record, scaled into a box of w × h mm. */
function IdsRecordFace({ rec, face, program, wMm, hMm }) {
  const boxW = wMm * IDS_MM_PX, boxH = hMm * IDS_MM_PX;
  if (rec.kind === "member") {
    if (face === "back") return <div className="ids-face-blank">Blank back</div>;
    return <IdsMemberFace rec={rec} boxW={boxW} boxH={boxH}/>;
  }
  const H = Math.round(IDS_FRONT_W * hMm / wMm);
  const S = boxW / IDS_FRONT_W;
  const Comp = face === "back" ? window.CardBack : rec.kind === "volunteer" ? window.VolunteerCardFront : window.CardFront;
  if (!Comp) return <div className="ids-face-blank">Card unavailable</div>;
  return <div className="ids-face-rec" style={{ width: boxW, height: boxH }}><Comp card={rec.raw} program={program} S={S} H={H}/></div>;
}

/* The member card is millimetre geometry (54 × 85). It is scaled to the slot
   whole, never redrawn; its QR is the same payload every member card carries. */
function IdsMemberFace({ rec, boxW, boxH }) {
  const [qrUrl, setQrUrl] = React.useState("");
  const payload = rec.raw && rec.raw.memberId && window._ngMemberQrPayload ? window._ngMemberQrPayload(rec.raw) : "";
  React.useEffect(() => {
    let live = true;
    if (!payload || !window._ngQrDataUrl) return undefined;
    window._ngQrDataUrl(payload).then(u => { if (live) setQrUrl(u || ""); });
    return () => { live = false; };
  }, [payload]);
  const nw = IDS_MEMBER_MM[0] * IDS_MM_PX, nh = IDS_MEMBER_MM[1] * IDS_MM_PX;
  const k = Math.min(boxW / nw, boxH / nh);
  const C = window.NggcMemberCard;
  return (
    <div className="ids-face-rec" style={{ width: boxW, height: boxH }}>
      <div style={{ width: nw, height: nh, transform: "scale(" + k + ")", transformOrigin: "top left" }}>
        {C ? <C member={rec.raw} size="wallet" qrUrl={qrUrl}/> : null}
      </div>
    </div>
  );
}
