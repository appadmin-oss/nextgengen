/* ============================================================================
   Club portal v3 — what each screen is, as data (the design handoff's
   club-portal-data.js, less its sample rows). Titles, columns, copy and the
   decisions are the design's; the rows come from domain/club-portal.php and
   every decision names the server act that carries it out.
   ========================================================================== */

/* The sidebar: [id, label, icon, works on a phone]. One list; the sidebar,
   the phone's More sheet and the command palette are all drawn from it. */
const CP3_NAV = [
  [null, [["home", "Dashboard", "squares-four", 1]]],
  ["Members", [["roster", "Roster", "users", 1], ["promote", "Promote", "arrow-fat-line-up", 1], ["permissions", "Permissions", "shield-check", 1],
    ["applications", "Applications", "envelope-simple", 0], ["approvals", "Approvals", "check-circle", 1], ["requests", "Member requests", "hand", 1],
    ["families", "Families", "house-line", 0], ["idcards", "ID cards", "identification-card", 0]]],
  ["Care", [["companion", "Check-ins", "heart", 1], ["mentorship", "Mentorship", "users-three", 1], ["behaviour", "Behaviour", "pulse", 1], ["conduct", "Conduct & fines", "scales", 0]]],
  ["Programme", [["timetable", "Timetable", "calendar-blank", 1], ["curriculum", "Curriculum", "books", 0], ["tournaments", "Tournaments", "trophy", 0]]],
  ["Comms", [["announce", "Announcements", "megaphone", 1]]],
  ["Gate", [["desks", "Check-in desks", "scan", 1], ["rota", "Duty rota", "clock", 1]]],
  ["Team & centres", [["team", "Team", "identification-badge", 1], ["centres", "Centres", "map-pin", 1], ["volunteers", "Volunteers", "hand-heart", 0], ["staffact", "Staff activity", "activity", 0]]],
];
const CP3_TABS = [["home", "Home", "squares-four"], ["roster", "Roster", "users"], ["timetable", "Timetable", "calendar-blank"], ["companion", "Check-ins", "heart"], ["more", "More", "dots-three-circle"]];
const CP3_SECTION_IDS = CP3_NAV.reduce((a, g) => a.concat(g[1].map(n => n[0])), []).concat(["more"]);

const CP3_DIV = { tech: ["oklch(0.955 0.03 250)", "oklch(0.86 0.06 250)", "Technology"], arts: ["oklch(0.955 0.03 80)", "oklch(0.86 0.07 80)", "Creative Arts"],
  media: ["oklch(0.955 0.03 20)", "oklch(0.86 0.06 20)", "Media"], biz: ["oklch(0.955 0.03 160)", "oklch(0.86 0.06 160)", "Business"], chess: ["#f1f1ef", "#d6d6d3", "Chess · every division"] };
const CP3_TONE = { ok: ["#e8f5ec", "#17663a", "#22a05a"], warn: ["#fdf2d8", "#7a5600", "#e0a100"], bad: ["#fdeaea", "#a12a2a", "#d94141"], neutral: ["#f0f0ef", "#48484e", "#9a9aa0"] };
const CP3_DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* Generic sections: the design's title, description, columns and row action. */
const CP3_G = {
  applications: { title: "Applications", desc: "People asking to join the Club directly, not through Summer School.", cols: ["Applicant", "Wants", "Centre", "Applied", "Status"], act: "Review" },
  approvals: { title: "Approvals", desc: "Decisions that need a second pair of eyes before anything changes.", cols: ["Request", "From", "Detail", "Waiting"], act: "Decide" },
  requests: { title: "Member requests", desc: "Changes members and guardians have asked for.", cols: ["Member", "Asks to", "Detail", "Sent"], act: "Open" },
  families: { title: "Families", desc: "Guardian accounts and the children they can see.", cols: ["Guardian", "Children", "Relationship", "Signed in", "Status"] },
  idcards: { title: "ID cards", desc: "Cards for the gate scanners. A card can’t print until its photo is on file.", cols: ["Member", "Card", "Reason", "Photo", "Status"], act: "Print" },
  mentorship: { title: "Mentorship", desc: "Who mentors whom. The instructor develops the skill; the mentor develops the person.", cols: ["Mentee", "Mentor", "Since", "Last contact", "Health"], act: "Open" },
  behaviour: { title: "Behaviour", desc: "Early signals mentors should know about. Private to staff.", cols: ["Member", "Signal", "Kind", "Mentor", "Status"], act: "Open" },
  conduct: { title: "Conduct & fines", desc: "Clear rules and transparent records. Guardians can see every line.", cols: ["Rule", "Amount", "Cap per term", "Applied this term", "Status"] },
  curriculum: { title: "Curriculum", desc: "Courses taught across the four divisions. Chess is compulsory in all of them.", cols: ["Course", "Division", "Centres", "Members"] },
  tournaments: { title: "Tournaments", desc: "Chess and inter-centre competitions.", cols: ["Tournament", "Date", "Centre", "Entrants", "Status"], act: "Open" },
  desks: { title: "Check-in desks", desc: "Gate scanners at each centre.", cols: ["Desk", "On duty", "Scanned last session", "Last scan", "Status"] },
  rota: { title: "Duty rota", desc: "Who staffs each desk and when.", cols: ["Date", "Centre", "Shift", "On duty", "Status"], act: "Fill" },
  volunteers: { title: "Volunteers", desc: "People offering to help, and where their screening is.", cols: ["Volunteer", "Role", "Availability", "Screening", "Applied"], act: "Screen" },
  staffact: { title: "Staff activity", desc: "Who did what in the Club portal this week.", cols: ["Staff", "Access", "Actions this week", "Most active in", "Last active"] },
};

/* Row decisions. `act` is the server's (admin.clubp.decide); `do` is how the
   row reads afterwards until the list reloads; `remove` takes it off. */
const CP3_DECIDE = {
  applications: { acts: [
    { l: "Accept and add to roster", k: "primary", act: "accept", do: "remove", toast: "Added to the roster", block: r => r[4][1] === "Missing photo" ? "Ask for a photo before accepting. ID cards need one." : "" },
    { l: "Waitlist", k: "ghost", act: "waitlist", do: ["Waitlisted", "neutral"], toast: "Waitlisted", show: r => r[4][1] !== "Waitlisted" },
    { l: "Reject", k: "danger", act: "reject", do: "remove", toast: "Rejected" }] },
  approvals: { acts: [
    { l: "Approve", k: "primary", act: "approve", do: "remove", toast: "Approved", block: (r, m) => m && m.mine ? "You asked for this. A second admin decides it." : (m && m.canDecide === false ? "A second admin, not a club coordinator, decides this." : "") },
    { l: "Decline", k: "danger", act: "decline", do: "remove", toast: "Declined", block: (r, m) => m && (m.mine || m.canDecide === false) ? "A second admin decides this." : "" }] },
  requests: { acts: [
    { l: "Approve", k: "primary", act: "approve", do: "remove", toast: "Approved, the member has been told", block: (r, m) => m && m.kind === "payment" ? "A payment is approved in Dues & fees, by an admin who holds fees." : "" },
    { l: "Decline", k: "danger", act: "decline", do: "remove", toast: "Declined, the member has been told" }] },
  volunteers: { acts: [
    { l: "Start screening", k: "primary", act: "start", do: ["In progress", "warn"], toast: "Screening started", show: r => r[3][1] === "Not started" },
    { l: "Mark cleared", k: "primary", act: "clear", do: ["Cleared", "ok"], toast: "Marked cleared", show: r => r[3][1] !== "Cleared" },
    { l: "Decline", k: "danger", act: "decline", do: "remove", toast: "Declined", show: (r, m) => !!(m && m.app) }] },
  idcards: { acts: [
    { l: "Print in the ID Card Studio", k: "primary", act: "studio", toast: "", show: (r, m) => !!(m && m.photo) },
    { l: "Ask for a photo", k: "ghost", act: "askphoto", do: ["Photo requested", "warn"], toast: "Guardian asked for a photo", show: (r, m) => !(m && m.photo) }] },
  rota: { acts: [{ l: "Remove shift", k: "danger", act: "remove", do: "remove", toast: "Shift removed", show: (r, m) => !!(m && m.stored) }], fill: true },
  families: { acts: [
    { l: "Approve link", k: "primary", act: "approve", do: ["Linked", "ok"], toast: "Linked, the guardian can see their child now", show: r => r[4][1] !== "Linked" },
    { l: "Unlink", k: "danger", act: "unlink", do: "remove", toast: "Unlinked" }] },
  behaviour: { acts: [{ l: "Mark supported", k: "primary", act: "supported", do: ["Supported", "ok"], toast: "Marked supported", show: r => r[4][1] !== "Supported" }] },
  mentorship: { acts: [{ l: "Open in the Mentorship workspace", k: "primary", act: "workspace", toast: "" }] },
  conduct: { acts: [
    { l: "Turn off", k: "ghost", act: "off", do: ["Off", "neutral"], toast: "Rule turned off", show: r => r[4][1] === "On" },
    { l: "Turn on", k: "primary", act: "on", do: ["On", "ok"], toast: "Rule turned on", show: r => r[4][1] !== "On" }] },
  desks: { acts: [{ l: "Close desk", k: "ghost", act: "close", do: "remove", toast: "Desk closed" }] },
};

/* Header actions: [label, form]. */
const CP3_PAGE_ACTS = { families: ["Link a guardian", "families"], mentorship: ["Pair a member", "mentorship"], behaviour: ["Log a signal", "behaviour"],
  conduct: ["Add a rule", "conduct"], curriculum: ["Add a course", "curriculum"], rota: ["Add a shift", "rota"], desks: ["Open a desk", "desks"], roster: ["Add a member", "member"] };

/* Forms. `opts` may be a function of the live data (ctx). */
function cp3Forms(ctx) {
  const centres = ctx.centres.map(c => c.name);
  const cleared = () => ctx.pool.map(p => ({ v: p.v, l: p.l, bad: p.bad }));
  const mentors = () => ctx.staff.filter(s => s.role === "mentor").map(s => ({ v: s.id, l: s.name + (s.tone === "bad" ? " · not cleared" : s.load >= 12 ? " · full" : " · " + s.load + " mentees"), dis: s.tone === "bad" }));
  const dateOf = v => { try { return new Date(v + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); } catch (e) { return v; } };
  return {
    member: { title: "Add a member", submit: "Add to roster", note: "They get an NGG number straight away. A guardian is emailed a link to agree to the seven permissions.",
      fields: [{ id: "name", l: "Full name", t: "text", req: 1 }, { id: "dob", l: "Date of birth", t: "date", req: 1 }, { id: "centre", l: "Centre", t: "seg", req: 1, opts: centres, def: ctx.lockC || undefined },
        { id: "course", l: "Course", t: "select", req: 1, opts: () => [{ v: "", l: "Choose a course" }].concat(ctx.courses.map(c => ({ v: c[0], l: c[0] }))) },
        { id: "guardian", l: "Guardian’s name", t: "text", req: 1 }, { id: "contact", l: "Guardian’s email or phone", t: "text", req: 1, ph: "name@example.com or 080…" }],
      check: v => { const e = {}; if (v.dob) { const a = (Date.now() - new Date(v.dob)) / 31557600000; if (a < 8 || a > 19) e.dob = "NGG is for ages 8 to 19. This makes them " + Math.floor(a) + "."; }
        if (v.contact && !/@|^0\d{6,}|^\+?\d{10,}/.test(v.contact.replace(/\s/g, ""))) e.contact = "That doesn’t look like an email or a phone number."; return { e, warn: [] }; } },
    families: { title: "Link a guardian", submit: "Link",
      fields: [{ id: "guardian", l: "Guardian’s name", t: "text", req: 1 }, { id: "contact", l: "Email", t: "text", req: 1, ph: "They sign in with it" },
        { id: "child", l: "Child", t: "person", req: 1, filt: "family" }, { id: "rel", l: "Relationship", t: "seg", req: 1, opts: ["Mother", "Father", "Guardian", "Other"] },
        { id: "reason", l: "How you confirmed it", t: "select", req: 1, opts: [{ v: "", l: "Choose one" }, "Matches the phone on record", "Seen ID in person", "Child confirmed in person", "Other"] }],
      check: v => { const w = []; if (v.reason === "Other") w.push("A link confirmed some other way waits for an admin to approve it."); return { e: v.contact && !/@/.test(v.contact) ? { contact: "Use their email address. It is how they sign in." } : {}, warn: w }; } },
    mentorship: { title: "Pair a member with a mentor", submit: "Pair them", note: "A mentor takes up to 12 members. Both are told in their app.",
      fields: [{ id: "mentee", l: "Member", t: "person", req: 1, filt: "unpaired" }, { id: "mentor", l: "Mentor", t: "select", req: 1, opts: () => [{ v: "", l: "Choose a mentor" }].concat(mentors()) }],
      check: v => { const m = ctx.staff.find(s => s.role === "mentor" && s.id === v.mentor); return { e: {}, warn: m && m.tone === "warn" ? [m.name + ": " + m.detail + "."] : [] }; } },
    behaviour: { title: "Log a signal", submit: "Log it", note: "Private to staff. The member’s mentor is told.",
      fields: [{ id: "member", l: "Member", t: "person", req: 1, filt: "active" }, { id: "signal", l: "What you noticed", t: "text", req: 1 },
        { id: "trend", l: "Trend", t: "seg", opts: ["Worsening", "Flat", "Improving"] }, { id: "status", l: "What’s needed", t: "seg", opts: ["Needs a call", "Watching", "Supported"], def: "Watching" }] },
    conduct: { title: "Add a rule", submit: "Add rule", note: "Guardians see every rule and every fine. Fines never go over the cap.",
      fields: [{ id: "rule", l: "Rule", t: "text", req: 1 }, { id: "when", l: "When it applies", t: "text" }, { id: "amount", l: "Fine (₦)", t: "number", req: 1 },
        { id: "cap", l: "Cap per term (₦)", t: "number", req: 1 }, { id: "on", l: "Turn it on now", t: "toggle", def: true }],
      check: v => { const e = {}; if (+v.amount > 0 && +v.cap > 0 && +v.amount > +v.cap) e.cap = "The cap must be at least the fine."; return { e, warn: [] }; } },
    curriculum: { title: "Add a course", submit: "Add course", after: "It won’t appear on the timetable until you add a slot for it.",
      fields: [{ id: "name", l: "Course name", t: "text", req: 1 }, { id: "div", l: "Division", t: "seg", req: 1, opts: ["Technology", "Media", "Creative", "Business"] }],
      check: v => ({ e: {}, warn: ctx.courses.some(c => c[0].toLowerCase() === String(v.name || "").trim().toLowerCase()) ? ["A course with that name already exists."] : [] }) },
    rota: { title: "Add a duty shift", submit: "Add shift",
      fields: [{ id: "date", l: "Date", t: "date", req: 1 }, { id: "centre", l: "Centre", t: "seg", req: 1, opts: centres, def: ctx.lockC || undefined },
        { id: "start", l: "Starts", t: "time", req: 1 }, { id: "end", l: "Ends", t: "time", req: 1 },
        { id: "who", l: "On duty", t: "select", req: 1, opts: () => [{ v: "", l: "Choose someone cleared" }].concat(cleared().map(o => ({ v: o.v, l: o.l, dis: o.bad }))) }],
      check: v => { const e = {}; if (v.start && v.end && v.end <= v.start) e.end = "It must end after it starts."; return { e, warn: v.date ? [] : [] }; }, dateOf },
    desks: { title: "Open a check-in desk", submit: "Open desk", after: "Open the check-in screen on the device and enter the password.",
      fields: [{ id: "name", l: "Desk name", t: "text", req: 1, ph: "e.g. Gate A" }, { id: "centre", l: "Centre", t: "seg", req: 1, opts: centres, def: ctx.lockC || undefined },
        { id: "device", l: "Device", t: "seg", opts: ["Gate tablet", "Android phone", "iPhone"] }] },
  };
}

/* Tournaments: the wizard's choices (domain/tournament-pairing.php, chess-clock.php, chess-variants.php). */
const CP3_TRN = {
  formats: [{ id: "swiss", name: "Swiss", sub: "Everyone plays every round. Nobody is knocked out.", best: "8–60 players", min: 4 },
    { id: "knockout", name: "Knockout", sub: "Lose once and you are out. Seeded by rating.", best: "8–64 players", min: 4 },
    { id: "roundrobin", name: "Round robin", sub: "Everybody plays everybody, once.", best: "4–12 players", min: 3, max: 12 },
    { id: "centrecup", name: "Centre cup", sub: "Each centre runs its own knockout; the champions meet.", best: "Several centres", min: 4, server: "centre" },
    { id: "arena", name: "Arena", sub: "A timed window. Finish a game, get another straight away.", best: "Drop-in sessions", min: 2 }],
  tcs: [{ id: "3+2", name: "3+2", sub: "Blitz" }, { id: "5+3", name: "5+3", sub: "Blitz" }, { id: "10+0", name: "10+0", sub: "Rapid" }, { id: "15+10", name: "15+10", sub: "Rapid" }, { id: "1day", name: "1 day", sub: "Daily" }],
  variants: [{ id: "standard", name: "Standard", short: "Ordinary chess", rated: true, rule: "The game as it is played everywhere." },
    { id: "chess960", name: "Chess960", short: "Shuffled back row", rated: true, rule: "The back row is shuffled, the same for both of you. Nothing to memorise, so nobody can arrive prepared." },
    { id: "kingofthehill", name: "King of the Hill", short: "King to the middle", rated: false, rule: "Walk your king onto d4, d5, e4 or e5 and you win. Checkmate still wins too." },
    { id: "threecheck", name: "Three-check", short: "Check three times", rated: false, rule: "Check your opponent three times and you win. Checkmate still wins too." }],
  kinds: [{ id: "member", label: "NGG members" }, { id: "student", label: "Summer School participants" }, { id: "volunteer", label: "Volunteers" }, { id: "staff", label: "Staff & admins" }],
  durations: [{ id: 3, label: "An afternoon", sub: "3 hours" }, { id: 6, label: "A session", sub: "6 hours" }, { id: 24, label: "A day", sub: "24 hours" },
    { id: 168, label: "A week", sub: "7 days" }, { id: 336, label: "A fortnight", sub: "14 days" }, { id: 720, label: "A month", sub: "30 days" }],
};

/* The page heads the design writes out (sections in CP3_G take theirs from there). */
function cp3Meta(isAdm) {
  return { home: ["Dashboard", "How the Club is doing, from the members up to the people who run it."],
    promote: ["Promote from Summer School", "Enrol Summer School graduates into the Club. Their name, photograph, course and centre carry across, and they get a way to sign in. Worth doing for a whole group at once."],
    roster: ["Club roster", "Every Club member. Search by name, ID or email, filter by status, centre and course, and act on many students at once."],
    timetable: ["Timetable", "Which course meets when, where and with whom. Members see their own centre’s week, parents see it in the family app, and the public page leaves instructor names off."],
    companion: ["Companion check-ins", "How members say they’re doing between sessions. Low moods go to their mentor first."], more: ["More", ""],
    permissions: ["Permissions", "What each member’s guardian has agreed to. It decides who can attend, be photographed, be named in public and go on trips."],
    announce: ["Announcements", isAdm ? "Drafts from coordinators and centre leads wait here for you. Nothing reaches families until it’s approved." : "Write to members and guardians. An admin approves every announcement before it goes out."],
    team: ["Team", "Everyone who runs the Club, by role. Anyone who needs follow-up is listed first."], centres: ["Centres", "Each centre’s members, attendance and the people who run it."] };
}

Object.assign(window, { CP3_NAV, CP3_TABS, CP3_SECTION_IDS, CP3_DIV, CP3_TONE, CP3_DAYS, CP3_G, CP3_DECIDE, CP3_PAGE_ACTS, CP3_TRN, cp3Forms, cp3Meta });
