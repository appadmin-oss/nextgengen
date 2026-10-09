/* ============================================================================
   The NGG member card's BACK — the one renderer for it.

   NggcMemberCard (card-template.jsx) is the front, in millimetres at a real
   54 × 85 mm. This is its other side, to the programme's own design: a navy
   field with a faint pattern and the NGG mark at large scale, the member's QR
   in the middle inside scan brackets, and an amber band with the
   programme's email and social handle. It is drawn once, here; the ID Card
   Studio's slots and its print PDF both place this component (CLAUDE.md §7:
   one renderer per card, never two). A Design Studio back, when one is
   assigned and paired, replaces it for that card type.

   The QR is the same payload as the front's (_ngMemberQrPayload): the
   member's secure code, so a phone that scans either side opens their member
   page (/q/<code>). The back carries no name, no money and no medical
   details — it is the side a stranger who finds the card sees first. The
   email and handle come from the member programme's settings when set
   (idcard_program('member') email / socialHandle), so they change in one
   place for every card.
   ========================================================================== */

const NGGC_BACK = { NAVY: "#0A1F5C", AMBER: "#FFC93C", INK: "#0A1F5C" };

/* The background's faint icons — a note, a gear, a play button, a bulb, a
   chart — drawn as simple strokes so they print at any size. */
function NggcBackPattern() {
  const c = "rgba(255,255,255,0.035)";
  return (
    <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block" }}>
      <defs>
        <pattern id="nggc-back-pat" width="44" height="44" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 14v-8l7-2v8"/><circle cx="4.5" cy="14" r="1.6"/><circle cx="11.5" cy="12" r="1.6"/>
            <circle cx="32" cy="9" r="4"/><path d="M32 3v2M32 13v2M26 9h2M36 9h2"/>
            <rect x="4" y="27" width="11" height="8" rx="1.5"/><path d="M8.5 29.5l3 1.5-3 1.5z"/>
            <path d="M30 37a5 5 0 1 1 6 0v2h-6z"/><path d="M31 41h4"/>
            <path d="M22 22v-6M25 22v-3M19 22v-2"/>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#nggc-back-pat)"/>
    </svg>
  );
}

/* The NGG mark — two rounds joined by the diagonal stroke — as a watermark. */
function NggcBackMark({ size }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }}>
      <g fill="#ffffff" fillOpacity="0.12">
        <path d="M14 30a16 16 0 0 1 30-8l3 6c3 6-1 12-7 13l-6 1a14 14 0 0 1-20-12z"/>
        <rect x="-2" y="40" width="104" height="22" rx="11" transform="rotate(-45 50 50)"/>
        <circle cx="74" cy="78" r="15"/>
      </g>
    </svg>
  );
}

const NGGC_ICONS = {
  mail: "M2 4h20v16H2z M2 5l10 8 10-8",
  linkedin: "M3 3h18v18H3z M7 10v7 M7 7v.01 M11 17v-4a2 2 0 0 1 4 0v4 M11 10v7",
  facebook: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.3-1.3 1.4-1.3h1.4V5.9a17 17 0 0 0-2.1-.1c-2 0-3.4 1.2-3.4 3.5v2h-2.3V14h2.3v7",
  instagram: "M4 4h16v16H4z M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M16.8 7.2v.01",
};
function NggcBackIcon({ n, size }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} style={{ display: "block", flex: "none" }}>
      <path d={NGGC_ICONS[n]} fill="none" stroke={NGGC_BACK.INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function NggcMemberCardBack({ member, program, qrUrl: given }) {
  const m = member || {};
  const p = program || {};
  const mm = v => v + "mm", pt = v => v + "pt";
  const email = String(p.email || "next@afrovanguard.org.ng");
  const handle = String(p.socialHandle || "nextgengen37").replace(/^@/, "");
  const payload = m.memberId && typeof window !== "undefined" && window._ngMemberQrPayload ? window._ngMemberQrPayload(m) : "";
  const [qr, setQr] = React.useState(given || "");
  React.useEffect(() => {
    if (given) { setQr(given); return undefined; }
    let live = true;
    if (!payload || !window._ngQrDataUrl) return undefined;
    window._ngQrDataUrl(payload).then(u => { if (live) setQr(u || ""); });
    return () => { live = false; };
  }, [payload, given]);
  const W = 54, H = 85, BAND = 8.6, QR = 13.5, BR = QR + 7;
  const corner = (pos) => {
    const s = { position: "absolute", width: mm(4.2), height: mm(4.2), borderColor: "#fff", borderStyle: "solid", borderWidth: 0 };
    const w = mm(0.55);
    if (pos[0] === "t") { s.top = 0; s.borderTopWidth = w; } else { s.bottom = 0; s.borderBottomWidth = w; }
    if (pos[1] === "l") { s.left = 0; s.borderLeftWidth = w; } else { s.right = 0; s.borderRightWidth = w; }
    return <span key={pos} style={s}/>;
  };
  return (
    <div className="nggc-back" style={{ width: mm(W), height: mm(H), position: "relative", overflow: "hidden", background: NGGC_BACK.NAVY, boxSizing: "border-box",
      fontFamily: "'Poppins',sans-serif", WebkitFontSmoothing: "antialiased" }}>
      <NggcBackPattern/>
      {/* The mark is centred on the QR, as the design has it, and fills most of the width. */}
      <div style={{ position: "absolute", left: "50%", top: mm((H - BAND) / 2), transform: "translate(-50%, -50%)" }}><NggcBackMark size={mm(48)}/></div>
      {/* The QR in its scan brackets, centred in the navy field. */}
      <div style={{ position: "absolute", left: "50%", top: mm((H - BAND) / 2), width: mm(BR), height: mm(BR), transform: "translate(-50%, -50%)" }}>
        {["tl", "tr", "bl", "br"].map(corner)}
        <div style={{ position: "absolute", inset: mm(3.5), background: "#fff", padding: mm(0.8), boxSizing: "border-box" }}>
          {qr ? <img src={qr} alt="Scan to open this member's page" style={{ width: "100%", height: "100%", display: "block", imageRendering: "pixelated" }}/>
              : <div style={{ width: "100%", height: "100%", background: "#eef0f4" }}/>}
        </div>
      </div>
      {/* The amber band: how to reach the programme. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: mm(BAND), background: NGGC_BACK.AMBER, display: "flex", alignItems: "center", justifyContent: "center",
        gap: mm(2.2), padding: "0 " + mm(2), boxSizing: "border-box", color: NGGC_BACK.INK, fontWeight: 700, fontSize: pt(4.6), whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: mm(0.6) }}><NggcBackIcon n="mail" size={mm(2.4)}/>{email}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: mm(0.4) }}>
          <NggcBackIcon n="linkedin" size={mm(2.4)}/><NggcBackIcon n="facebook" size={mm(2.4)}/><NggcBackIcon n="instagram" size={mm(2.4)}/>
          <span style={{ marginLeft: mm(0.4) }}>{handle}</span>
        </span>
      </div>
    </div>
  );
}
