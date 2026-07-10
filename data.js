/* ================================================================
   NGG — Mock data
   ================================================================ */

// Curated palette for member/avatar gradients (brand-friendly)
const AVATAR_PALETTES = [
  ["#f5b026", "#ff5a3c"],
  ["#1c2a5e", "#b07cff"],
  ["#d0ff3a", "#1c2a5e"],
  ["#ff5a3c", "#f5b026"],
  ["#b07cff", "#1c2a5e"],
  ["#1c2a5e", "#f5b026"],
  ["#d0ff3a", "#f5b026"],
  ["#b07cff", "#d0ff3a"],
];

function avatarBg(seed) {
  const p = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
  const angle = (seed * 37) % 360;
  return `linear-gradient(${angle}deg, ${p[0]}, ${p[1]})`;
}

const STATS = [
  { num: "517", label: "Teen creators in motion" },
  { num: "22",  label: "Communities reached" },
  { num: "63",  label: "Volunteer mentors" },
  { num: "01",  label: "African future" },
];

const STAGES = [
  {
    id: "summer",
    code: "01",
    title: "Summer Students",
    age: "10–17",
    tag: "Discovery",
    color: "gold",
    desc: "Short-term discovery cohorts. Music, tech, media, leadership, arts, public speaking, community intelligence, entrepreneurship.",
    deliverables: ["Graduation showcase", "Profile badge", "NGGC recommendation"],
  },
  {
    id: "club",
    code: "02",
    title: "Next Generation Genius Club",
    age: "12–17",
    tag: "Identity",
    color: "lime",
    desc: "The core teen identity society. Genius ID cards, profile pages, skill badges, ranking points, weekly missions, levels.",
    deliverables: ["Genius ID", "Weekly missions", "Skill badges & XP"],
  },
  {
    id: "vanguard",
    code: "03",
    title: "Next Generation Vanguard",
    age: "15–19",
    tag: "Lead",
    color: "coral",
    desc: "Acting leadership class. Mentor younger students, lead teams, coordinate projects, represent Afrovanguard publicly.",
    deliverables: ["Mentor caseload", "Project ownership", "Public representation"],
  },
  {
    id: "full",
    code: "04",
    title: "Full Afrovanguard",
    age: "18+",
    tag: "Elite",
    color: "navy",
    desc: "Advanced leadership and cultural responsibility. The graduating class of the movement.",
    deliverables: ["Cultural stewardship", "Movement strategy", "Lifetime cohort"],
  },
];

const TRACKS = [
  { id: "music",    name: "Music",              icon: "♪", desc: "Producers, vocalists, instrumentalists.", chip: "chip-gold" },
  { id: "tech",     name: "Tech",               icon: "</>", desc: "Code, hardware, AI literacy, robotics.", chip: "chip-lime" },
  { id: "media",    name: "Media",              icon: "▶", desc: "Film, podcasting, photography, editing.", chip: "chip-coral" },
  { id: "lead",     name: "Leadership",         icon: "★", desc: "Decision-making, ethics, team dynamics.", chip: "chip-navy" },
  { id: "arts",     name: "Arts",               icon: "✷", desc: "Visual art, design, fashion, craft.", chip: "chip-plum" },
  { id: "speak",    name: "Public Speaking",    icon: "“",  desc: "Voice, rhetoric, storytelling on stage.", chip: "chip-gold" },
  { id: "comm",     name: "Community Intel.",   icon: "◎",  desc: "Civic literacy, fieldwork, social fluency.", chip: "chip-lime" },
  { id: "biz",      name: "Entrepreneurship",   icon: "₦",  desc: "From idea to revenue. Build, sell, learn.", chip: "chip-coral" },
];

const MEMBERS = [
  { id: 1, first: "Adaeze",    title: "Future Music Producer",   track: "Music",            level: 7, xp: 2140, badges: 9,  streak: 21, week: 8,  community: "Egbeda", quote: "I make beats from city noise." },
  { id: 2, first: "Tunde",     title: "Tech Explorer",            track: "Tech",             level: 9, xp: 2980, badges: 12, streak: 34, week: 10, community: "Ayobo",  quote: "If I can break it, I can build it." },
  { id: 3, first: "Zara",      title: "Voice of Influence",       track: "Public Speaking",  level: 6, xp: 1820, badges: 7,  streak: 12, week: 7,  community: "Egbeda", quote: "Speak so the back row leans in." },
  { id: 4, first: "Kwame",     title: "Young Community Leader",   track: "Leadership",       level: 8, xp: 2410, badges: 11, streak: 28, week: 9,  community: "Ayobo",  quote: "Lead the work you would not delegate." },
  { id: 5, first: "Ife",       title: "Creative Genius",          track: "Arts",             level: 5, xp: 1340, badges: 6,  streak: 8,  week: 5,  community: "Egbeda", quote: "Colour first, rules later." },
  { id: 6, first: "Bayo",      title: "Future Vanguard",          track: "Leadership",       level: 10,xp: 3420, badges: 14, streak: 41, week: 11, community: "Egbeda", quote: "Stand for it, even when alone." },
  { id: 7, first: "Nneka",     title: "Cultural Ambassador",      track: "Community Intel.", level: 6, xp: 1720, badges: 8,  streak: 17, week: 6,  community: "Ayobo",  quote: "My grandmother is my syllabus." },
  { id: 8, first: "Sefa",      title: "Tech Explorer",            track: "Tech",             level: 4, xp: 980,  badges: 4,  streak: 6,  week: 4,  community: "Ayobo",  quote: "Tiny script, big mischief." },
  { id: 9, first: "Mariam",    title: "Discipline Award",         track: "Leadership",       level: 7, xp: 2050, badges: 9,  streak: 50, week: 8,  community: "Egbeda", quote: "Show up. Show up. Show up." },
  { id: 10, first: "Chinedu",  title: "Young Founder",            track: "Entrepreneurship", level: 5, xp: 1430, badges: 7,  streak: 11, week: 6,  community: "Ayobo",  quote: "I sell what I would buy." },
  { id: 11, first: "Tomi",     title: "Future Music Producer",    track: "Music",            level: 3, xp: 740,  badges: 3,  streak: 4,  week: 3,  community: "Egbeda", quote: "Headphones on. World off." },
  { id: 12, first: "Hadiza",   title: "Voice of Influence",       track: "Public Speaking",  level: 6, xp: 1880, badges: 8,  streak: 19, week: 7,  community: "Ayobo",  quote: "A small voice carries far if it is true." },
];

const WEEKS = [
  { n: 1,  theme: "Identity",            verb: "Define who you are before others define you.", missions: 3 },
  { n: 2,  theme: "Discipline",          verb: "The promises you keep when nobody is watching.", missions: 4 },
  { n: 3,  theme: "Communication",       verb: "Be understood. Then be remembered.", missions: 4 },
  { n: 4,  theme: "Leadership",          verb: "Lead the work you would not delegate.", missions: 5 },
  { n: 5,  theme: "Creativity",          verb: "The original move beats the polished copy.", missions: 4 },
  { n: 6,  theme: "African Intelligence",verb: "We carry knowledge older than our textbooks.", missions: 4 },
  { n: 7,  theme: "Team Building",       verb: "A great team is a small army of generous minds.", missions: 4 },
  { n: 8,  theme: "Digital Influence",   verb: "Build a feed your future self will be proud of.", missions: 5 },
  { n: 9,  theme: "Entrepreneurship",    verb: "From idea to revenue, in plain sight.", missions: 5 },
  { n: 10, theme: "Community Impact",    verb: "Pick a problem on your street, solve it in public.", missions: 4 },
  { n: 11, theme: "Responsibility",      verb: "Own the outcome, not just the assignment.", missions: 4 },
  { n: 12, theme: "Legacy & Graduation", verb: "Leave a doorway, not a monument.", missions: 6 },
];

const BADGES = [
  { id: "comm",    name: "Community Builder",   color: "navy",     pinned: true },
  { id: "disc",    name: "Discipline",          color: "gold",     pinned: true },
  { id: "tech",    name: "Tech Explorer",       color: "lime",     pinned: true },
  { id: "voice",   name: "Voice of Influence",  color: "coral",    pinned: false },
  { id: "create",  name: "Creative Genius",     color: "plum",     pinned: true },
  { id: "vanguard",name: "Future Vanguard",     color: "navy-gold",pinned: false, locked: true },
  { id: "culture", name: "Cultural Ambassador", color: "gold",     pinned: false },
  { id: "streak",  name: "30-Day Streak",       color: "lime",     pinned: true },
  { id: "mentor",  name: "Mentor in Training",  color: "coral",    pinned: false, locked: true },
];

const MISSIONS_THIS_WEEK = [
  { id: 1, name: "Record a 60-second 'who I am' intro on video.",     xp: 80,  due: "Today",     done: true,  type: "Reflect" },
  { id: 2, name: "Interview an elder. Bring back one proverb.",        xp: 120, due: "Tomorrow",  done: true,  type: "Field" },
  { id: 3, name: "Lead a 10-minute warm-up at your local meet-up.",    xp: 150, due: "Wed",       done: false, type: "Lead" },
  { id: 4, name: "Post one original piece — your track, your voice.",  xp: 100, due: "Thu",       done: false, type: "Make" },
  { id: 5, name: "Mentor check-in: write a 5-line reflection.",        xp: 60,  due: "Fri",       done: false, type: "Reflect" },
];

const TESTIMONIALS = [
  { from: "Adaeze, 15", role: "Music · Egbeda",  q: "I came in shy with one beat. I left with a name, a team and a graduation showcase. NGG turned my hobby into my handle." },
  { from: "Mr. Okoye",  role: "Parent",          q: "I was sceptical. Three months in, my son leads his school's debate club. The discipline of Anchor 12 is real." },
  { from: "Tunde, 16",  role: "Tech · Ayobo",    q: "I built my first app the week we did Digital Influence. The mentors do not let you hide behind 'someday'." },
  { from: "Dr. Ade",    role: "Mentor — 4 yrs",  q: "These teenagers do not need rescuing. They need a room with high ceilings. NGG is that room." },
];

const MEDIA_ITEMS = [
  { kind: "Reel",         label: "Anchor 12 — Week 1 trailer",   meta: "0:47 · 12.4k views" },
  { kind: "Documentary",  label: "From Onitsha, with code.",     meta: "12:04 · Mini-doc" },
  { kind: "Performance",  label: "Lagos NGGC live showcase",     meta: "23:18 · Live cut" },
  { kind: "Podcast",      label: "Genius FM ep. 12 — Discipline",meta: "38:12 · Audio" },
  { kind: "Before/After", label: "Zara: From back row to mic",   meta: "1:32 · Story" },
  { kind: "Day in life",  label: "A Tuesday at CACENTRE Ayobo",  meta: "3:54 · Vlog" },
];

const FAQ = [
  { q: "How do you keep my child safe?", a: "Every mentor is background-checked, two-mentor rule for any session with minors, and parents get a weekly digest of activities and reflections." },
  { q: "Is this religious or political?", a: "Neither. NGG is a values-based youth movement focused on identity, discipline, leadership and African excellence." },
  { q: "What does it cost?", a: "Summer Students is free for accepted applicants. NGGC and Anchor 12 use a sliding scholarship model — no qualified teen is turned away for money." },
  { q: "How much time per week?", a: "Anchor 12 expects ~4 hours/week of missions plus one in-person Saturday session. Less than a sport, more than a hobby." },
  { q: "Where do you meet?", a: "Two centres in Alimosho, Lagos: CACENTRE Egbeda and CACENTRE Ayobo. Saturdays — see the home page for the next session schedule." },
];

const VOLUNTEER_ROLES = [
  { name: "Mentor",            commit: "4 hrs / week",  ideal: "Adults 25+ in any field, willing to listen first." },
  { name: "Instructor",        commit: "Cohort-based",  ideal: "Practitioners who can teach one skill across 12 weeks." },
  { name: "Project Coordinator",commit:"6–10 hrs / week",ideal: "Operators who like calendars, logistics, momentum." },
  { name: "Creative",          commit: "Project-based", ideal: "Designers, filmmakers, photographers, writers." },
  { name: "Admin / Ops",       commit: "Flexible",      ideal: "People who turn chaos into a checklist." },
];

// Organisation contact + social handles — the single place to update them.
// The footer (and anything else) reads from here. Replace the social URLs
// with the real account links when the handles are confirmed.
const CONTACT = {
  email: "cacentre@afrovanguard.org.ng",
  phone: "+2349037776318",          // same public line as the printed ID cards
  phoneDisplay: "+234 903 777 6318",
  socials: {
    instagram: "https://instagram.com/",   // TODO: real handle
    x:         "https://x.com/",           // TODO: real handle
    youtube:   "https://youtube.com/",     // TODO: real handle
    tiktok:    "https://tiktok.com/",      // TODO: real handle
    linkedin:  "https://linkedin.com/",    // TODO: real handle
  },
};

Object.assign(window, {
  AVATAR_PALETTES, avatarBg,
  STATS, STAGES, TRACKS, MEMBERS, WEEKS, BADGES,
  MISSIONS_THIS_WEEK, TESTIMONIALS, MEDIA_ITEMS, FAQ, VOLUNTEER_ROLES,
  CONTACT,
});
