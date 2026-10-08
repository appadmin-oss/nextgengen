/* ============================================================================
   The NGG member card's BACK — the one renderer for it.

   NggcMemberCard (card-template.jsx) is the front, in millimetres at a real
   54 × 85 mm. This is its other side in the same idiom: the same navy and
   amber, the same faces (Poppins for words, IBM Plex Mono for the ID and the
   labels), the same caption grey measured at 4.83:1. It is drawn once, here;
   the ID Card Studio's slots and its print PDF both place this component
   (CLAUDE.md §7: one renderer per card, never two). A Design Studio back,
   when one is assigned and paired, replaces it for that card type.

   What a back carries, and what it must not (README §12): who to return it
   to and how, what it admits the holder to, a signature line — and never
   money or medical details. Phone and website come from the member
   programme's own settings (idcard_program('member')), so they change in one
   place for every card.
   ========================================================================== */

function NggcMemberCardBack({ member, program }) {
  const m = member || {};
  const p = program || {};
  const NAVY = "#0B1F51", AMBER = "#FCB316", INK = "#1F2937", CAP = "#6B7280", HAIR = "#E6E8EC";
  const mm = v => v + "mm", pt = v => v + "pt";
  const name = String(m.fullName || "").trim() || "NGG member";
  const did = String(m.displayId || m.memberId || "").toUpperCase();
  const centre = (m.centre && (m.centre.name || m.centre)) || "";
  const website = String(p.website || "next.afrovanguard.org.ng").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const phone = String(p.phone || "");
  const label = { fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500, fontSize: pt(4.4), letterSpacing: ".18em", color: CAP, textTransform: "uppercase" };
  const body = { fontFamily: "'Poppins',sans-serif", fontSize: pt(6), lineHeight: 1.35, color: INK, margin: 0 };

  return (
    <div style={{ width: mm(54), height: mm(85), background: "#fff", position: "relative", overflow: "hidden", boxSizing: "border-box",
      display: "flex", flexDirection: "column", fontFamily: "'Poppins',sans-serif", WebkitFontSmoothing: "antialiased" }}>
      {/* The band: the programme, named, on the colour the front leads with. */}
      <div style={{ background: NAVY, color: "#fff", padding: mm(3.2) + " " + mm(5), display: "flex", alignItems: "center", justifyContent: "space-between", flex: "none" }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: pt(5), letterSpacing: ".22em", fontWeight: 500 }}>NEXT GENERATION GENIUS</span>
        <span style={{ width: mm(2.4), height: mm(2.4), borderRadius: "50%", background: AMBER, display: "block" }}/>
      </div>

      <div style={{ padding: mm(4) + " " + mm(5) + " 0", display: "flex", flexDirection: "column", gap: mm(3.2), flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: mm(1) }}>
          <span style={label}>This card belongs to</span>
          <span style={{ fontWeight: 600, fontSize: pt(8.5), color: NAVY, lineHeight: 1.1 }}>{name}</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: pt(6), letterSpacing: ".14em", color: NAVY }}>{did}</span>
        </div>

        <div style={{ height: mm(0.3), background: HAIR, flex: "none" }}/>

        <div style={{ display: "flex", flexDirection: "column", gap: mm(1) }}>
          <span style={label}>If found, please return to</span>
          <p style={body}>Next Generation Genius{centre ? <><br/>{centre} centre</> : null}</p>
          {phone && <p style={{ ...body, fontFamily: "'IBM Plex Mono',monospace", fontSize: pt(5.6) }}>{phone}</p>}
          <p style={{ ...body, fontFamily: "'IBM Plex Mono',monospace", fontSize: pt(5.6) }}>{website}</p>
        </div>

        <p style={{ ...body, fontSize: pt(5.2), color: CAP }}>
          Admits the holder to NGG sessions and events. This card carries no money and no medical details. It stays valid while the holder is a member.
        </p>

        <span style={{ flex: "1 1 auto" }}/>

        <div style={{ display: "flex", flexDirection: "column", gap: mm(1), paddingBottom: mm(5) }}>
          <span style={{ height: mm(0.25), background: NAVY, display: "block" }}/>
          <span style={label}>Holder’s signature</span>
        </div>
      </div>
    </div>
  );
}
