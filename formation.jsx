/* ================================================================
   NGG — The formation doctrine.

   The NGGC 2040 Human Capital Formation & Leadership Development
   Brief, transcribed into data.

   This file holds no markup and no behaviour on purpose. The brief
   is the programme's constitution: the same six goals, four
   divisions, five-rung courage ladder and twelve mentor questions
   have to read identically on the public About page, in the mentor
   portal, on a member's dashboard and in anything printed for a
   parent. Every one of those surfaces had its own copy of a
   fragment of it, which is how a "five-point index" becomes a
   four-point one in the room and nobody notices for a term.

   So: one list per instrument, exported once, rendered everywhere.
   Editing the programme means editing this file. Presentation
   belongs to whoever renders it.

   Kept separate from data.js, which is the demo/mock fixture set —
   nothing here is illustrative and nothing here should be replaced
   by live data.
   ================================================================ */

/* ── 1 · What NGGC is ─────────────────────────────────────────── */

const NGGC_CORE_OBJECTIVE =
  "To raise a generation that cannot be bought, bent or broken — equipped to think deeply, create boldly, live responsibly and lead for the good of Africa.";

// The four disclaimers, in the brief's order. Stated as negations because
// the programme is most often mistaken for each of them in turn.
const NGGC_IS_NOT = [
  "an after-school club",
  "a collection of classes",
  "a talent-development programme",
  "a certificate factory",
];

/* Talent without its counterweight. The brief states these as four parallel
   clauses, and they are the argument for why formation precedes skill. */
const NGGC_WITHOUT = [
  { have: "Talent",       without: "character",       becomes: "danger" },
  { have: "Intelligence", without: "wisdom",          becomes: "manipulation" },
  { have: "Courage",      without: "reason",          becomes: "recklessness" },
  { have: "Knowledge",    without: "responsibility",  becomes: "arrogance" },
];

/* ── 2 · Vision 2040 ──────────────────────────────────────────── */

const NGGC_VISION_2040 = {
  target: 1000000,
  targetLabel: "1,000,000",
  horizon: 2040,
  statement:
    "To contribute to raising 1,000,000 incorruptible African leaders by 2040 who will build, lead and transform Africa across every sector of society.",
  // Not a menu of careers — the brief's point is that the list is deliberately
  // wide, and that the common requirement sits underneath all of it.
  becoming: [
    "Professionals", "Entrepreneurs", "Scientists", "Technologists",
    "Creatives", "Artists", "Public servants", "Community builders",
    "Researchers", "Educators", "Institutional leaders", "Nation builders",
  ],
  requirement:
    "Most importantly, they must become people who can carry responsibility without being corrupted by power, money, popularity or fear.",
};

/* ── 3 · The formation philosophy ─────────────────────────────── */

const NGGC_PHILOSOPHY = [
  { verb: "Discover", object: "potential",       code: "01" },
  { verb: "Form",     object: "character",       code: "02" },
  { verb: "Develop",  object: "competence",      code: "03" },
  { verb: "Deploy",   object: "responsibility",  code: "04" },
  { verb: "Multiply", object: "leadership",      code: "05" },
];

// NGG → NGV → Afrovanguard → Institution Builders → Africa 2040.
const NGGC_PATHWAY = [
  { id: "ngg",         label: "NGG",                  role: "The seed",            note: "The child enters. Discovery and formation begin." },
  { id: "ngv",         label: "NGV",                  role: "The formation ground", note: "Beginning to lead. Evidence, not tenure, moves them here." },
  { id: "av",          label: "Afrovanguard",         role: "The movement",        note: "Real responsibility for people, projects and systems." },
  { id: "institution", label: "Institution Builders", role: "The assignment",      note: "Entering institutions and making them better." },
  { id: "africa",      label: "Africa 2040",          role: "The harvest",         note: "A million leaders who cannot be bought, bent or broken." },
];

/* ── 4 · The six goals ────────────────────────────────────────── */

const NGGC_GOALS = [
  {
    code: "01", title: "Discover Potential", verb: "Identify",
    items: ["Talents", "Interests", "Natural strengths", "Learning patterns", "Curiosity",
            "Creativity", "Leadership tendencies", "Entrepreneurial tendencies",
            "Communication ability", "Problem-solving ability"],
  },
  {
    code: "02", title: "Develop Character", verb: "Build",
    items: ["Integrity", "Discipline", "Responsibility", "Accountability", "Courage",
            "Self-control", "Diligence", "Respect", "Identity", "Community consciousness"],
  },
  {
    code: "03", title: "Build Competence", verb: "Develop practical capability in",
    items: ["Critical thinking", "Communication", "Creativity", "Technology",
            "Entrepreneurship", "Arts", "Media", "Strategy", "Problem-solving", "Project execution"],
  },
  {
    code: "04", title: "Develop Leaders", verb: "Progress members through",
    items: ["NGG → NGV → Afrovanguard"],
    note: "Each transition should represent an increase in competence + character + responsibility + influence.",
  },
  {
    code: "05", title: "Create Impact", verb: "Answer",
    items: ["“What problem can I solve because I have been trained?”"],
    note: "Members must learn that education is not merely for examination.",
  },
  {
    code: "06", title: "Build the 2040 Pipeline", verb: "Produce Africa's next",
    items: ["CEOs", "Engineers", "Developers", "Musicians", "Scientists", "Designers",
            "Entrepreneurs", "Administrators", "Public leaders", "Institution builders"],
  },
];

/* ── 5 · The four professional divisions ──────────────────────── */

/* Chess appears in all four course lists because it is compulsory across all
   four divisions — see NGGC_CHESS below for why it is not just another class.
   `chip` and `accent` name existing brand tokens so the divisions read as one
   set of four rather than four unrelated cards. */
const NGGC_DIVISIONS = [
  {
    id: "arts", code: "01", name: "Creative & Performing Arts",
    chip: "chip-gold", accent: "var(--gold-500)", icon: "♪",
    mandate: "Develop and monetize artistic, cultural and performance abilities.",
    audience: "For children interested in music, catering, musical instruments, acting, stagecraft, vocal training, adire, crafts, music production and other creative expressions.",
    courses: ["Music", "Piano", "Guitar", "Drums", "Violin", "Saxophone", "Vocal Training", "Music Production", "Acting", "Stagecraft", "Catering", "Adire", "Crafts", "Chess"],
  },
  {
    id: "media", code: "02", name: "Media & Content Strategy",
    chip: "chip-coral", accent: "var(--coral)", icon: "▶",
    mandate: "Develop the ability to communicate ideas, build audiences and position brands.",
    audience: "For children interested in video production, cinematography, graphic design, branding, digital content creation, social media and visual storytelling.",
    courses: ["Video Production", "Cinematography", "Graphic Design", "Branding", "Digital Content Creation", "Social Media", "Visual Storytelling", "Chess"],
  },
  {
    id: "tech", code: "03", name: "Technology & Applied Engineering",
    chip: "chip-lime", accent: "var(--lime)", icon: "</>",
    mandate: "Develop builders capable of creating technological solutions.",
    audience: "For children interested in artificial intelligence, coding, software development, robotics, automation, tech product design and cybersecurity.",
    courses: ["Artificial Intelligence", "Coding", "Software Development", "Robotics", "Automation", "Tech Product Design", "Cybersecurity", "Chess"],
  },
  {
    id: "business", code: "04", name: "Business Strategy, Operations & Administration",
    chip: "chip-plum", accent: "var(--plum)", icon: "◈",
    mandate: "Develop young people capable of organizing people, resources, systems and ideas into executable outcomes.",
    audience: "For children interested in project management, product management, data analysis, business development, finance, HR, operations, administration and strategic thinking.",
    courses: ["Project Management", "Product Management", "Data Analysis", "Business Development", "Finance", "Human Resources", "Operations", "Administration", "Strategic Thinking", "Chess"],
  },
];

/* ── 6 · Chess is not just a class ────────────────────────────── */

const NGGC_CHESS = {
  compulsory: true,
  framing: "Chess is a leadership laboratory, not an extracurricular activity.",
  teaches: ["Thinking before acting", "Consequences", "Planning", "Sacrifice", "Patience",
            "Pattern recognition", "Resource management", "Strategic positioning",
            "Recovery after mistakes", "Anticipating opposition", "Long-term thinking"],
  // The debrief matters more than the result. "Who won?" is the question the
  // brief explicitly says is not sufficient.
  insufficientQuestion: "Who won?",
  debrief: [
    "Why did you make that move?",
    "What did you fail to see?",
    "What would you do differently?",
    "What does this teach you about leadership?",
  ],
  // What a mentor reads off the board and names as behaviour off it.
  mirrors: [
    { onBoard: "Impulsive moves",                          inLife: "Impulsive decisions" },
    { onBoard: "Failure to plan",                          inLife: "Poor preparation" },
    { onBoard: "Giving up after losing material",          inLife: "Poor resilience" },
    { onBoard: "Sacrificing for long-term advantage",      inLife: "Strategic thinking" },
  ],
  dashboardFields: ["Games played", "Wins", "Losses", "Draws", "Opening knowledge",
                    "Tactical development", "Strategic understanding", "Mistakes",
                    "Tournament participation", "Improvement over time", "Lessons learned"],
};

/* ── 7–8 · The mentor system ──────────────────────────────────── */

const NGGC_MENTOR = {
  distinction: {
    instructor: "The instructor develops the skill.",
    mentor:     "The mentor develops the person.",
    example:    "The instructor may teach a child how to play the piano.",
  },
  // What the mentor asks that the instructor does not.
  asks: [
    "Are you practicing?",
    "Are you keeping your word?",
    "What are you afraid of?",
    "What responsibility did you avoid this week?",
    "What did you learn from your failure?",
    "Who did you help?",
    "What did you do when nobody was watching?",
  ],
  maxim: { a: "Teachers teach subjects.", b: "Mentors inspect formation." },
  // §19 — the boundary. Stated as four negations and one composition because
  // a mentor who reads the dashboard as a charge sheet breaks the programme.
  isNot: ["a spy", "a disciplinarian", "a secretary", "a policeman"],
  is: ["Affection", "Expectation", "Accountability", "Challenge"],
  says: [
    "I see something in you that you don't yet see in yourself.",
    "I will not allow your potential to become an excuse for your irresponsibility.",
  ],
};

/* Musing Time — deliberate thinking time. No entertainment, no unnecessary
   phone activity, no rushing. The mentor reviews the quality of the
   reflection, never grades the writing. */
const NGGC_MUSING = {
  rules: ["No entertainment", "No unnecessary phone activity", "No rushing"],
  purpose: "To teach children to think before they react.",
  prompts: [
    "What happened today?",
    "What did I learn?",
    "What did I do well?",
    "Where did I fail?",
    "What am I afraid of?",
    "What problem did I notice?",
    "What should I do differently?",
    "What idea came to me?",
    "What responsibility am I avoiding?",
  ],
};

/* ── 9 · Personal timetable management ────────────────────────── */

const NGGC_TIMETABLE = {
  items: ["School timetable", "NGGC classes", "Practice periods", "Homework", "Reading",
          "Musing", "Chess", "Family responsibilities", "Community activities", "Rest",
          "Personal projects"],
  caution: "The mentor should not become the child's secretary. The child must progressively learn to manage their own time.",
  // Five rungs. The last one is the definition of leadership formation.
  progression: ["Mentor reminds", "Child remembers", "Child plans", "Child executes", "Child teaches others"],
};

/* ── 10 · The Anchor Journal ──────────────────────────────────── */

/* Weekly, and the evidence of formation. Nine blocks, each a single question.
   `key` is stable and safe to persist against a journal entry; the objective
   is self-awareness and accountability, never a writing grade. */
const NGGC_ANCHOR_JOURNAL = [
  { key: "value",          label: "VALUE",          q: "What value did I demonstrate this week?" },
  { key: "vision",         label: "VISION",         q: "What am I trying to become?" },
  { key: "virtue",         label: "VIRTUE",         q: "What character quality am I developing?" },
  { key: "reflection",     label: "REFLECTION",     q: "What did I learn?" },
  { key: "failure",        label: "FAILURE",        q: "Where did I fail?" },
  { key: "courage",        label: "COURAGE",        q: "What difficult thing did I do?" },
  { key: "responsibility", label: "RESPONSIBILITY", q: "What responsibility did I carry?" },
  { key: "impact",         label: "IMPACT",         q: "Who benefited from my actions?" },
  { key: "nextMove",       label: "NEXT MOVE",      q: "What will I do next?" },
];

/* ── 11 · Community participation ─────────────────────────────── */

const NGGC_COMMUNITY = {
  premise: "A genius who cannot live with people is an unfinished person.",
  question: "Are you becoming useful to other people?",
  marks: ["Attend community meetings", "Participate in group projects", "Help younger members",
          "Respect different opinions", "Resolve disagreements", "Take responsibility",
          "Speak when necessary", "Listen when necessary", "Contribute resources or effort",
          "Serve without demanding recognition"],
};

/* ── 13 · Fines, dues & financial responsibility ──────────────── */

const NGGC_FINANCIAL = {
  purpose: "Actions have consequences. Not punishment for punishment's sake.",
  obligations: ["Membership dues", "Programme fees", "Community obligations",
                "Fines for clearly defined violations", "Missed commitments",
                "Lost or damaged communal resources", "Late attendance where applicable"],
  // Guardrails. A fine levied outside these is a safeguarding problem, not a
  // lesson, which is why they are listed alongside the power to levy one.
  safeguards: ["Clear rules", "Transparent records", "Appropriate limits", "No humiliation",
               "No arbitrary punishment", "Parent or guardian visibility where appropriate"],
};

/* ── 14 · The Courage Index ───────────────────────────────────── */

/* Courage is the willingness to do what is right or necessary despite fear,
   discomfort or pressure — explicitly not loudness, aggression or stubbornness.
   The ladder is 1–5 and the objective is principled courage, never reckless
   children, so the top rung is other-directed rather than simply bolder. */
const NGGC_COURAGE_IS_NOT = ["Loudness", "Aggression", "Stubbornness"];

const NGGC_COURAGE_LADDER = [
  { score: 1, label: "Avoids responsibility",                     tone: "var(--ink-500)" },
  { score: 2, label: "Acts only when instructed",                 tone: "var(--ink-500)" },
  { score: 3, label: "Attempts difficult things",                 tone: "var(--gold-500)" },
  { score: 4, label: "Takes responsibility voluntarily",          tone: "var(--gold-500)" },
  { score: 5, label: "Acts courageously for the good of others",  tone: "var(--coral)" },
];

/* The ten observations a mentor scores against. Kept as questions, in the
   brief's order, because a mark without an observed instance behind it is the
   failure mode this index exists to prevent. */
const NGGC_COURAGE_PROMPTS = [
  "Did they speak the truth when lying would have been easier?",
  "Did they apologize when wrong?",
  "Did they attempt something difficult?",
  "Did they defend someone being treated unfairly?",
  "Did they ask questions when confused?",
  "Did they accept correction?",
  "Did they admit failure?",
  "Did they volunteer for responsibility?",
  "Did they challenge an idea respectfully?",
  "Did they continue after failure?",
];

/* ── 15–16 · The rational of leadership ───────────────────────── */

const NGGC_LEADERSHIP = {
  question: "Why should anyone follow you?",
  // The answers the programme rejects, quoted so a member recognises their own.
  insufficient: ["Because I am intelligent.", "Because I am older.", "Because I am popular.",
                 "Because I have money.", "Because I am the best."],
  philosophy:
    "Leadership is not the privilege of being above people. It is the responsibility of becoming useful to people.",
  measures: [
    { name: "Competence",     test: "Can you actually do the work?" },
    { name: "Character",      test: "Can people trust you?" },
    { name: "Responsibility", test: "Do you carry what has been entrusted to you?" },
    { name: "Courage",        test: "Can you act when it is difficult?" },
    { name: "Reason",         test: "Can you think beyond emotion and pressure?" },
    { name: "Service",        test: "Can you create value for others?" },
    { name: "Accountability", test: "Can you admit and correct your mistakes?" },
    { name: "Influence",      test: "Can your example make other people better?" },
  ],
};

/* The Rational Leadership Test — the questions a mentor returns to until the
   member can answer them without rehearsing. They develop rational leadership
   rather than personality-based leadership. */
const NGGC_LEADERSHIP_TEST = [
  "What do you believe?",
  "Why do you believe it?",
  "What evidence supports it?",
  "What would make you change your mind?",
  "Who benefits from your decision?",
  "Who bears the cost?",
  "What happens if everyone behaves like you?",
  "Are you doing this because it is right or because people will praise you?",
  "Would you still do it if nobody knew?",
];

/* ── 17 · The member dashboard ────────────────────────────────── */

/* Seven groups. `route` points at the surface that already owns each one so
   the doctrine and the product stay honest about what exists. */
const NGGC_MEMBER_DASHBOARD = [
  { group: "Identity",               icon: "◉", fields: ["Name", "Age", "School", "Division", "Mentor", "Level"] },
  { group: "Formation",              icon: "✦", fields: ["Anchor Journal", "Musing records", "Courage Index", "Responsibility record", "Community participation"] },
  { group: "Discipline",             icon: "◴", fields: ["Attendance", "Timetable", "Assignments", "Practice", "Punctuality"] },
  { group: "Competence",             icon: "▲", fields: ["Courses", "Projects", "Assessments", "Certifications", "Portfolio"] },
  { group: "Chess",                  icon: "♞", fields: ["Games", "Performance", "Strategy development", "Tournaments", "Lessons"] },
  { group: "Financial accountability", icon: "₦", fields: ["Dues", "Fines", "Programme obligations", "Financial responsibilities"] },
  { group: "Leadership",             icon: "★", fields: ["Responsibilities held", "Projects led", "People mentored", "Problems solved", "Community impact"] },
];

/* ── 18 · The mentor's weekly review ──────────────────────────── */

/* Twelve questions a mentor should be able to answer for every assigned
   member, every week. Numbered because the brief numbers them and because a
   review that skips one is a review with a hole in a known place. */
const NGGC_WEEKLY_REVIEW = [
  "What did this child learn this week?",
  "What did this child produce?",
  "What responsibility did this child carry?",
  "What did this child struggle with?",
  "What fear did this child confront?",
  "What does the Anchor Journal reveal?",
  "Is the child's timetable being respected?",
  "Is the child participating in community?",
  "What is happening with chess development?",
  "Are dues, fines and accountability obligations up to date?",
  "What leadership behaviour did I observe?",
  "What should I challenge this child about next week?",
];

/* ── 20 · Progression: NGG → NGV ──────────────────────────────── */

/* Progression is evidence of formation, never time served. */
const NGGC_PROGRESSION = [
  {
    id: "ngg", stage: "NGG", headline: "Discovering and developing.",
    learning: ["Discipline", "Basic competence", "Community", "Responsibility", "Reflection", "Courage"],
  },
  {
    id: "ngv", stage: "NGV", headline: "Beginning to lead.",
    learning: ["Consistency", "Competence", "Initiative", "Courage", "Accountability",
               "Community contribution", "Ability to influence positively", "Ability to mentor younger members"],
  },
  {
    id: "av", stage: "Afrovanguard", headline: "Leadership in the wider movement.",
    learning: ["People", "Projects", "Systems", "Communities", "Institutions"],
  },
];

/* ── 21 · The four-layer model ────────────────────────────────── */

const NGGC_LAYERS = [
  { n: 1, name: "Formation",  parts: ["Mentor", "Anchor Journal", "Musing", "Values", "Courage"] },
  { n: 2, name: "Competence", parts: ["Four Divisions", "Courses", "Projects"] },
  { n: 3, name: "Strategy",   parts: ["Chess", "Critical Thinking", "Problem Solving"] },
  { n: 4, name: "Deployment", parts: ["Community", "Leadership", "Entrepreneurship", "Impact"] },
];

/* ── 22–24 · The product, the standard, the declaration ───────── */

const NGGC_REAL_PRODUCT = {
  notThe: ["music", "coding", "chess", "certificates"],
  is: "A capable human being who can be trusted with responsibility.",
  coda: "That is the person Africa needs.",
};

/* Fourteen lines. The first nine are what a member does; the last five are
   what a member survives — which is the harder half. */
const NGGC_STANDARD = [
  "Thinks deeply.", "Speaks wisely.", "Creates boldly.", "Works diligently.",
  "Keeps their word.", "Accepts correction.", "Faces fear.", "Serves others.",
  "Solves problems.", "Handles resources responsibly.",
  "Can disagree without becoming an enemy.",
  "Can win without becoming arrogant.",
  "Can lose without becoming bitter.",
  "Can possess power without becoming corrupt.",
];

const NGGC_DECLARATION = {
  premise: "Africa does not merely need another generation of educated people. Africa needs a generation of formed people.",
  people: [
    "People who cannot be bought by money.",
    "People who cannot be bent by pressure.",
    "People who cannot be broken by failure.",
    "People who can think independently without becoming selfish.",
    "People who can cooperate without becoming followers without thought.",
    "People who can lead without worshipping power.",
    "People who can create wealth without worshipping wealth.",
    "People who can enter institutions and make the institutions better.",
  ],
  seed: { a: "The child is not our project.", b: "The child is the beginning of the institution." },
  assignment: "Raise the human being before handing them the institution.",
  refrain: ["Cannot be bought.", "Cannot be bent.", "Cannot be broken."],
};

/* ── Helpers ──────────────────────────────────────────────────── */

/** The division record for an id, or null. Used wherever a member row carries
 *  a `division` string and a surface needs its mandate, colour or courses. */
function nggcDivision(id) {
  if (!id) return null;
  const key = String(id).toLowerCase();
  return NGGC_DIVISIONS.find(d => d.id === key || d.name.toLowerCase() === key) || null;
}

/** The courage rung for a 1–5 score, or null when unscored. Clamps rather
 *  than throws: a stored 0 or 9 is a data problem, not a reason to blank the
 *  member's whole dashboard. */
function nggcCourageRung(score) {
  const n = Math.round(Number(score));
  if (!Number.isFinite(n) || n < 1) return null;
  return NGGC_COURAGE_LADDER[Math.min(n, NGGC_COURAGE_LADDER.length) - 1] || null;
}

Object.assign(window, {
  NGGC_CORE_OBJECTIVE, NGGC_IS_NOT, NGGC_WITHOUT,
  NGGC_VISION_2040, NGGC_PHILOSOPHY, NGGC_PATHWAY, NGGC_GOALS,
  NGGC_DIVISIONS, NGGC_CHESS, NGGC_MENTOR, NGGC_MUSING, NGGC_TIMETABLE,
  NGGC_ANCHOR_JOURNAL, NGGC_COMMUNITY, NGGC_FINANCIAL,
  NGGC_COURAGE_IS_NOT, NGGC_COURAGE_LADDER, NGGC_COURAGE_PROMPTS,
  NGGC_LEADERSHIP, NGGC_LEADERSHIP_TEST, NGGC_MEMBER_DASHBOARD,
  NGGC_WEEKLY_REVIEW, NGGC_PROGRESSION, NGGC_LAYERS,
  NGGC_REAL_PRODUCT, NGGC_STANDARD, NGGC_DECLARATION,
  nggcDivision, nggcCourageRung,
});
