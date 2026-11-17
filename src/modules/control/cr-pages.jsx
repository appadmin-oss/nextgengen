/* ============================================================================
   Control Room v2 — the ONE registry (CLAUDE.md §6, §11): groups, pages and
   their tabs, each tab's capability, and where every old section id lands.
   The sidebar, the phone menu, the palette, the breadcrumb, the deep-link
   resolver and window.__adminSection are all generated from it.

   A tab's id IS the old section id wherever one existed, so bookmarks,
   emails (?s=<section>&t=<tab>) and the portals' cross-links still resolve.
   What a tab shows lives in CR_TAB_DEFS, filled by the cr-tab-*.jsx files:
     { load(ctx) → data, blocks(data, ctx) → [block], actions(data, ctx) → [action],
       count(ctx) → n (a tab pill), skeleton: [kinds], facts(data) → text for Ask }
   ========================================================================== */

const CR_GROUPS = [
  { h: null, items: ["home", "inbox", "support", "analytics"] },
  { h: "People", items: ["members", "mentors", "mentorship", "money", "shop"] },
  { h: "Programme", items: ["checkin", "summer", "learning", "events"] },
  { h: "Publishing", items: ["content", "community", "comms"] },
  { h: "System", items: ["settings", "wifi"] },
];

/* cap: null = any staff · "x" = that capability · ["x","y"] = any of them. */
const CR_PAGES = {
  home: { label: "Home", icon: "house", tabs: [
    { id: "home", label: "Overview", desc: "What needs you today, and how the programme is doing.", cap: null },
  ] },
  inbox: { label: "Inbox", icon: "tray", tabs: [
    { id: "all", label: "All", desc: "Every item waiting on staff, from every queue, in one place.", cap: ["people", "inbox", "content"] },
    { id: "applications", label: "Applications", desc: "New NGG and Summer School applications.", cap: "people" },
    { id: "approvals", label: "Approvals", desc: "Family links, promotions and waivers that need a second pair of eyes.", cap: "people" },
    { id: "requests", label: "Member requests", desc: "Changes members and parents have asked for.", cap: "people" },
    { id: "messages", label: "Messages", desc: "Contact form and replies.", cap: "inbox" },
    { id: "comments", label: "Comments", desc: "Public comments waiting for moderation.", cap: "content" },
    { id: "photos", label: "Photo review", desc: "Headshots must pass before an ID card can print.", cap: "content" },
    { id: "testimonials", label: "Testimonials", desc: "What members said about their own sessions, waiting to be read.", cap: "content" },
  ] },
  /* Support cases (domain/support.php, cr-tab-support.jsx): opened by members
     and families inside their portals, answered here. */
  support: { label: "Support", icon: "lifebuoy", tabs: [
    { id: "cases", label: "Cases", desc: "What members and families have asked the team, next reply due first.", cap: "support" },
    { id: "support-health", label: "How we’re doing", desc: "Open and overdue cases, reply targets and how people rated the help.", cap: "support" },
  ] },
  analytics: { label: "Analytics", icon: "chart-line-up", tabs: [
    { id: "dashboard", label: "M&E overview", desc: "Monitoring and evaluation against the formation goals.", cap: null },
    { id: "engagement", label: "Engagement", desc: "How members use the app and the journal.", cap: "audit" },
    { id: "behaviour", label: "Behaviour", desc: "Patterns mentors should know about. Not a punishment list.", cap: ["people", "summer"] },
    { id: "staff", label: "Staff activity", desc: "Who did what in the Control Room this week.", cap: "people" },
    { id: "status", label: "Status board", desc: "How members, centres, mentors and staff are doing, at a glance.", cap: ["people", "club", "rbac", "audit"] },
  ] },
  members: { label: "Members", icon: "users", tabs: [
    { id: "members", label: "Roster", desc: "Everyone in NGG, NGV and Afrovanguard.", cap: "people" },
    { id: "courses", label: "Courses", desc: "Every child’s courses: confirm what their record proposes, or choose. Every portal reads what is placed here.", cap: "people" },
    { id: "quality", label: "Data quality", desc: "Gaps and duplicates that break ID cards, reminders and reports.", cap: "people" },
    { id: "families", label: "Families", desc: "Parent and guardian accounts connected to members.", cap: "people" },
    { id: "centres", label: "Centres", desc: "Where NGG meets. A centre’s code is the printed ID prefix on Summer School cards (EG-26-001), so it stays once cards are printed.", cap: "people" },
    { id: "idcards", label: "ID cards", desc: "Print queue for member and staff cards.", cap: "people" },
    { id: "reg-checklist", label: "Registration", desc: "Every new member’s registration checklist: what is left, who is helping them at their centre, and the items staff add.", cap: "people" },
    { id: "request-log", label: "Request history", desc: "Every request members and parents have raised — open, approved, declined and withdrawn — and who decided it.", cap: "people" },
    { id: "accounts", label: "Accounts", desc: "Who cannot sign in, and why. Ending a membership is not done here.", cap: "people" },
    { id: "security", label: "Sign-in security", desc: "Who has a second sign-in step, the policy for each kind of person, and letting someone in for ten minutes.", cap: "people" },
  ] },
  mentors: { label: "Mentors & volunteers", icon: "handshake", tabs: [
    { id: "mentors", label: "Mentors", desc: "The mentor develops the person.", cap: "people" },
    { id: "mentorship", label: "Pairings", desc: "Who mentors whom, and whether the weekly review is happening.", cap: "people" },
    { id: "volunteers", label: "Volunteers", desc: "Everyone helping on Saturdays.", cap: "people" },
    { id: "companion", label: "Companion check-ins", desc: "How members say they are doing, between sessions.", cap: "club" },
  ] },
  /* The Anchor Pods workspace (MENTORSHIP.md §4.2; cr-tab-mentorship.jsx).
     Its tab ids carry an ms- prefix because "mentorship" is already the old
     Pairings tab's id — /control/mentorship now opens this page, which is
     where a mentorship link should land. */
  mentorship: { label: "Mentorship", icon: "users-three", tabs: [
    { id: "ms-overview", label: "Overview", desc: "This week across the pods: who needs a person, relationship health and the match lifecycle.", cap: "people" },
    { id: "ms-queue", label: "Match queue", desc: "Mentees waiting for a mentor. Each is offered two and chooses one.", cap: "people" },
    { id: "ms-rel", label: "Relationships", desc: "Every live match, its phase and its health.", cap: "people" },
    { id: "ms-checkins", label: "Check-ins", desc: "The cadence every match carries, and what is overdue.", cap: "people" },
    { id: "ms-interventions", label: "Interventions", desc: "Every flag becomes a plan with an owner and a review date.", cap: "people" },
    { id: "ms-projects", label: "Projects", desc: "Projects and activities set for mentors and children: who is on each, in which group, and the countdown to the finish.", cap: "people" },
    { id: "ms-safeguarding", label: "Safeguarding", desc: "Concerns reported about young people. Visible only to safeguarding roles.", cap: "safeguarding" },
    { id: "ms-mentors", label: "Mentors", desc: "From application to first match: screening, the Academy, the Commitment Policy and each pod.", cap: "people" },
    { id: "ms-impact", label: "Impact", desc: "Six measures against fixed targets.", cap: "people" },
  ] },
  money: { label: "Money", icon: "wallet", tabs: [
    { id: "membership", label: "Membership payments", desc: "Joining invoices: Paystack, and offline payments a second person checks against their evidence.", cap: "fees" },
    { id: "fees", label: "Dues & arrears", desc: "Every naira owed, paid and waived, with the reason kept on the account.", cap: "fees" },
    { id: "volpay", label: "Volunteer pay", desc: "What active volunteers earn for each programme day they are present and active, the rules that decide it, and paying each period.", cap: "fees" },
    { id: "conduct", label: "Conduct & fines", desc: "Every rule in one place, uploading fines, the compliance board, the policy and the programme calendars.", cap: ["fees", "people", "summer"] },
    { id: "donations", label: "Donations", desc: "Gifts received through Paystack and bank transfer.", cap: "settings" },
  ] },
  /* The NGG shop (domain/shop.php, cr-tab-shop.jsx). Two trusts, as the server
     has them: orders and the shop's settings are money (`fees`); the catalogue
     is what NGG shows (`content`). */
  shop: { label: "Shop", icon: "storefront", tabs: [
    { id: "shop-orders", label: "Orders", desc: "What people bought in the NGG shop: paid, ready, handed over or cancelled, and the buyer for each.", cap: "fees" },
    { id: "shop-products", label: "Products", desc: "What the shop sells: price, sizes, stock, picture, and whether it is on sale.", cap: "content" },
    { id: "shop-settings", label: "Settings", desc: "Open or close the shop, delivery and its fee, and what buyers are told about collecting.", cap: "fees" },
  ] },
  checkin: { label: "Check-in", icon: "qr-code", tabs: [
    { id: "checkin", label: "Desks", desc: "Live gate and desk scanners for today’s session.", cap: "checkin" },
    { id: "attendance", label: "Duty rota", desc: "Who staffs each desk, each Saturday.", cap: "checkin" },
  ] },
  summer: { label: "Summer School", icon: "sun", tabs: [
    /* The handoff calls this tab "Cohort"; this codebase never shows that word
       for an edition (CLAUDE.md §5, §11), so it is "Edition". */
    { id: "summer", label: "Edition", desc: "The Summer School edition that is running, at a glance.", cap: "summer" },
    { id: "assessment", label: "Assessments", desc: "Baseline at week 1, endline at week 12.", cap: "summer" },
    { id: "summer-history", label: "Past editions", desc: "Every edition, and the registers of past ones brought in from a spreadsheet.", cap: "summer" },
  ] },
  learning: { label: "Learning", icon: "graduation-cap", tabs: [
    { id: "divisions", label: "Divisions & courses", desc: "The NGG Club’s four divisions and the courses in each — what the join form offers and the card prints.", cap: ["curriculum", "club", "people"] },
    { id: "curriculum", label: "Curriculum", desc: "What the Club teaches, lesson by lesson, and the exam that ends each one.", cap: "curriculum" },
    { id: "feedback", label: "How lessons land", desc: "What members tapped after each lesson — the ones most of a class could not follow, worst first.", cap: ["curriculum", "club"] },
    { id: "course-health", label: "Course health", desc: "Whether each course can be taught: children, instructors, lessons, class times, a channel, and what is missing.", cap: ["curriculum", "club", "people"] },
    { id: "outside", label: "How members are doing", desc: "Lessons here and learning outside NGG — logged by members with videos and pictures, or from a platform’s report — confirmed by an instructor. And each member’s achievements.", cap: ["curriculum", "club", "people"] },
    { id: "providers", label: "Where courses lead", desc: "The awarding bodies outside NGG — freeCodeCamp, Trinity, NBTE — what each awards, and which members hold one.", cap: ["curriculum", "club"] },
    { id: "sessions", label: "Sessions", desc: "Each session is 12 weeks.", cap: "content" },
    { id: "missions", label: "Missions", desc: "Anchor missions members complete and mentors verify.", cap: "content" },
    { id: "assignments", label: "Assignments", desc: "Coursework submitted for grading.", cap: "content" },
    { id: "anchor", label: "Anchor Journal", desc: "The weekly reflection every member writes.", cap: "content" },
    { id: "timetable", label: "Timetable", desc: "Which course meets when, where and with whom, at each centre.", cap: "club" },
    { id: "formation", label: "Saturday formation", desc: "The Saturday schedule every portal reads: the main day, a centre’s own, one changed Saturday, a Saturday off.", cap: "content" },
    { id: "opps", label: "Opportunities", desc: "Bootcamps, competitions and volunteering shown to members, matched to their age.", cap: "content" },
  ] },
  events: { label: "Events", icon: "calendar-blank", tabs: [
    { id: "events", label: "Events", desc: "Sessions, outings and showcases members can RSVP to.", cap: "content" },
    { id: "tournaments", label: "Tournaments", desc: "Chess is a leadership laboratory.", cap: "people" },
  ] },
  content: { label: "Content", icon: "article", tabs: [
    { id: "posts", label: "Posts", desc: "Stories and updates on the public site.", cap: "content" },
    { id: "site", label: "Site content", desc: "Words and images on the public website.", cap: "settings" },
    { id: "status-pages", label: "Status pages", desc: "Public pages parents can check for an application or volunteer status.", cap: "content" },
    { id: "forms", label: "Forms", desc: "Sign-up and feedback forms.", cap: "summer" },
    { id: "promos", label: "Promotions", desc: "Banners and cards shown inside the member app.", cap: "content" },
    { id: "wisdom", label: "Quote of the week", desc: "One line every member sees on Monday.", cap: "content" },
  ] },
  community: { label: "Community", icon: "chats-circle", tabs: [
    { id: "community", label: "Threads", desc: "Member conversations. A genius who cannot live with people is an unfinished person.", cap: "content" },
  ] },
  comms: { label: "Announcements", icon: "megaphone", tabs: [
    { id: "broadcast", label: "Notices", desc: "Official notices to members and their families — and who has read them. Quick one-line messages too.", cap: "content" },
    { id: "newsletter", label: "Newsletter", desc: "The monthly email to subscribers.", cap: "inbox" },
  ] },
  /* The centres' Wi-Fi (cr-tab-wifi.jsx). The Club portal's Wi-Fi item opens it. */
  wifi: { label: "Wi-Fi", icon: "wifi-high", tabs: [
    { id: "wifi", label: "Gateways", desc: "Each centre’s Wi-Fi gateway: whether it is working, and what to do when it isn’t.", cap: "network" },
    { id: "wifi-analytics", label: "Analytics", desc: "Who is online and when, how much of the day each gateway is there, line speeds and each region’s health.", cap: "network" },
    { id: "wifi-regions", label: "Regions", desc: "Centres grouped for their Wi-Fi: their leads, their speeds and how they are doing.", cap: "wifi_regions" },
    { id: "wifi-health", label: "Speed & health", desc: "How fast each centre’s line is, how busy it gets, and testing it from where people sit.", cap: "network" },
    { id: "wifi-usage", label: "Data used", desc: "How much data each person used, against their allowance, and who is over it.", cap: "network" },
    { id: "wifi-access", label: "Who gets on", desc: "Wi-Fi follows people’s records. Why somebody can’t get on, who gets what, and how fast.", cap: "network" },
    { id: "wifi-guides", label: "Setup guides", desc: "Which gateway a centre can use, what each does, and how it fits together.", cap: "network" },
  ] },
  settings: { label: "Settings", icon: "gear", tabs: [
    { id: "settings", label: "General", desc: "Sign-ups, messages, staff sign-in and the homepage banner.", cap: "settings" },
    { id: "attendance-rules", label: "Attendance", desc: "When somebody is late, and when they may leave.", cap: "settings" },
    { id: "card-branding", label: "Card branding", desc: "What is printed on the Summer School cards and digital IDs.", cap: "settings" },
    { id: "member-records", label: "Member records", desc: "Make every member’s record complete: the fields asked for, the deadline, who is still missing what, and reminders.", cap: "people" },
    { id: "mentor-automations", label: "Mentorship automations", desc: "The Mentor Portal's background jobs: their thresholds, times and centres, and what each run found.", cap: "people" },
    { id: "keys", label: "API keys", desc: "Connect AI, photo storage, payments, email and text messages.", cap: "settings" },
    { id: "access", label: "Access & roles", desc: "Who can do what. Give people the least they need.", cap: "rbac" },
    { id: "integrations", label: "Integrations", desc: "Services that send, store and take payments.", cap: "settings" },
    { id: "ops", label: "Diagnostics", desc: "Health checks for the server and storage.", cap: "settings" },
    { id: "audit", label: "Audit log", desc: "Every change, who made it and when.", cap: "audit" },
  ] },
};

/* Filled by the cr-tab-*.jsx files, keyed by tab id. */
const CR_TAB_DEFS = {};

/* Old section ids that were not carried over as a tab, and where they went.
   A retired id is not a dead route (CLAUDE.md §6): it forwards. */
const CR_ALIASES = {
  registration: { portal: "summer-admin", panel: "gates" },
  qr: { portal: "summer-admin", panel: "qr" },
  "data-quality": { page: "members", tab: "quality" },
};

/* Palette actions (§4.1): each opens a tab and runs the header action named. */
const CR_ACTIONS = [
  { icon: "user-plus", l: "Add member", tab: "members", act: "Add member" },
  { icon: "currency-ngn", l: "Record a payment", tab: "fees", act: "Record payment" },
  { icon: "megaphone", l: "Send a notice", tab: "broadcast" },
  { icon: "pencil-simple", l: "New post", tab: "posts", act: "New post" },
  { icon: "calendar-plus", l: "New event", tab: "events", act: "New event" },
  { icon: "star", l: "Add mission", tab: "missions", act: "Add mission" },
  { icon: "clipboard-text", l: "New assignment", tab: "assignments", act: "New assignment" },
  { icon: "qr-code", l: "Open a check-in desk", tab: "checkin", act: "Open a desk" },
  { icon: "printer", l: "Print ID cards", tab: "idcards", act: "Print batch" },
];

/* ── Derived ────────────────────────────────────────────────────────────── */

/** Every tab, with the page it is on. */
const CR_TAB_INDEX = (() => {
  const out = {};
  Object.keys(CR_PAGES).forEach(pid => CR_PAGES[pid].tabs.forEach((t, i) => { out[t.id] = { page: pid, tab: t, first: i === 0 }; }));
  return out;
})();
function crGroupOf(pageId) { const g = CR_GROUPS.find(g => g.items.indexOf(pageId) >= 0); return g ? g.h : null; }

/** Does a holder of `has(cap)` reach this capability rule? */
function crCapOk(cap, has) {
  if (!cap) return true;
  return Array.isArray(cap) ? cap.some(c => has(c)) : has(cap);
}
/** The tabs of a page this person may open, in order. */
function crTabsFor(pageId, has) { const p = CR_PAGES[pageId]; return p ? p.tabs.filter(t => crCapOk(t.cap, has)) : []; }
/** The pages this person may open, by group. */
function crNavFor(has) {
  return CR_GROUPS.map(g => ({ h: g.h, items: g.items.filter(id => crTabsFor(id, has).length > 0) })).filter(g => g.items.length);
}

/**
 * Where an address points: /control/<page>/<tab>/<sub…>, or an old section id
 * (from ?s=<section>&t=<tab>, a portal's cross-link, or a bookmark). Unknown
 * pages and tabs fall back rather than erroring — a stale link shows Home.
 */
/* A view that moved to another tab keeps its address: "page/tab/view" → where it lives now. */
const CR_SUB_ALIASES = {
  "money/fees/fines": { page: "money", tab: "conduct", sub: "" },   // the fines upload moved to Conduct & fines
};
function crResolve(parts) {
  const [a, b, ...rest] = (parts || []).filter(Boolean);
  if (!a) return { page: "home", tab: "home", sub: "" };
  if (CR_PAGES[a]) {
    const tab = CR_PAGES[a].tabs.find(t => t.id === b);
    const moved = tab && rest.length ? CR_SUB_ALIASES[a + "/" + tab.id + "/" + rest[0]] : null;
    if (moved) return Object.assign({}, moved);
    return { page: a, tab: tab ? tab.id : CR_PAGES[a].tabs[0].id, sub: tab ? rest.join("/") : [b].concat(rest).filter(Boolean).join("/") };
  }
  if (CR_TAB_INDEX[a]) return { page: CR_TAB_INDEX[a].page, tab: a, sub: [b].concat(rest).filter(Boolean).join("/") };
  if (CR_ALIASES[a]) return Object.assign({ sub: b || "" }, CR_ALIASES[a].page ? { page: CR_ALIASES[a].page, tab: CR_ALIASES[a].tab } : { portal: CR_ALIASES[a].portal, panel: b || CR_ALIASES[a].panel });
  return { page: "home", tab: "home", sub: "" };
}
function crPath(page, tab, sub) {
  if (!page || page === "home") return "/control";
  const p = CR_PAGES[page];
  const t = tab && p && p.tabs[0].id !== tab ? "/" + tab : "";
  return "/control/" + page + (sub ? (t || "/" + p.tabs[0].id) + "/" + sub : t);
}

/** Pages for the palette: a page, then each later tab as "Page › Tab". */
function crPalettePages(has, go) {
  const out = [];
  crNavFor(has).forEach(g => g.items.forEach(id => {
    const p = CR_PAGES[id];
    crTabsFor(id, has).forEach((t, ti) => {
      const sub = ti > 0;
      out.push({ icon: p.icon, l: sub ? p.label + " › " + t.label : p.label, path: g.h || "Workspace", sub, keywords: t.label + " " + t.desc + " " + t.id, run: () => go(id, t.id) });
    });
  }));
  return out;
}
