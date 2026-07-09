/* ================================================================
   NGG — Photo / portrait library
   
   STRATEGY:
   - Portraits: DiceBear "personas" — illustrated portraits, consistent
     and diverse-by-default. These are placeholder avatars chosen to
     read as a diverse cohort; the user can swap to real cohort photos
     by editing `portrait()` to point at /assets/portraits/N.jpg etc.
   - Scenes: Unsplash CDN — full-bleed photographs used for hero,
     community collage, blog covers, testimonial context.
   ================================================================ */

// Helper that builds a properly-formatted Unsplash URL
function ux(id, w = 800, h = null, opts = {}) {
  const params = new URLSearchParams({ auto: "format", fit: "crop", w: String(w), q: "80", ...opts });
  if (h) params.set("h", String(h));
  return `https://images.unsplash.com/photo-${id}?${params.toString()}`;
}

/* DiceBear personas — illustrated portrait avatars.
   Seeded by member id/name string so each member gets a stable face. */
const PERSONA_BG = ["1c2a5e", "f5b026", "d0ff3a", "ff5a3c", "b07cff", "ffd680", "0c1432"];
const PERSONA_SKIN = ["b16a5b", "8c5a3c", "a16e4b", "6a3f2a", "623d2e", "8a5a3c", "9b6a4d"];
const PERSONA_HAIR = ["362c47", "1a1a1a", "2c1810", "4a3520", "362c47"];

function persona(seed, size = 200) {
  const s = String(seed);
  // We pre-seed with deterministic options that bias toward an African cohort look.
  const bg = PERSONA_BG[seedHash(s) % PERSONA_BG.length];
  const skin = PERSONA_SKIN[seedHash(s + "skin") % PERSONA_SKIN.length];
  const hair = PERSONA_HAIR[seedHash(s + "hair") % PERSONA_HAIR.length];
  return `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(s)}&size=${size}&backgroundColor=${bg}&backgroundType=solid&skinColor=${skin}&hairColor=${hair}`;
}
function seedHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* portrait() — primary entry. Returns a DiceBear persona SVG URL. */
function portrait(seed, w = 200) {
  return persona(seed, w);
}

/* Scene photos — used for hero/section imagery.
   Each entry has been chosen because it composes well at large size
   (atmospheric, often without a focal face), so it works as a backdrop
   regardless of who appears in it. */
const SCENES = {
  heroMain:      "1517077304055-6e89abbf09b0", // group at table
  classroom:     "1577896851231-70ef18881754",
  studio:        "1598653222000-6b7b7a552625", // music studio
  techLab:       "1517694712202-14dd9538aa97", // code on screen
  graduation:    "1571260899304-425eee4c7efc",
  dance:         "1492684223066-81342ee5ff30", // event lights
  community:     "1582213782179-e0d53f98f2ca",
  art:           "1513475382585-d06e58bcb0e0",
  speaker:       "1485579149621-3123dd979885",
  podcast:       "1478737270239-2f02b77fc618",
  mentor:        "1556157382-97eda2d62296",
  showcase:      "1492684223066-81342ee5ff30",
  workshop:      "1524178232363-1fb2b075b655",
  performance:   "1571266028243-d220c6a5e3a8",
  drums:         "1519508234439-4f23643125c1",
  notebook:      "1517842645767-c639042777db",
  hands:         "1469571486292-0ba58a3f068b",
};

function scene(name, w = 1200, h = null) {
  const id = SCENES[name] || SCENES.heroMain;
  return ux(id, w, h);
}

const BLOG_COVERS = [
  "1503676260728-1c00da094a0b",
  "1591115765373-5207764f72e7",
  "1481627834876-b7833e8f5570",
  "1497486751825-1233686f5d54",
  "1559027615-cd4628902d4a",
  "1573497620053-ea5300f94f21",
  "1542751371-adc38448a05e",
  "1530021232320-687d8e3dba54",
];
function blogCover(seed, w = 800, h = 500) {
  // Admin-authored posts carry a real cover URL; seed posts carry an index.
  if (typeof seed === "string" && /^(https?:)?\/\//i.test(seed)) return seed;
  const id = BLOG_COVERS[(parseInt(seed, 10) || 0) % BLOG_COVERS.length];
  return ux(id, w, h);
}

/* ---------------- Blog content ---------------- */
const BLOG_POSTS = [
  {
    id: "what-we-actually-do",
    cover: 0,
    category: "Manifesto",
    title: "What we actually do — and what we don't.",
    excerpt: "A short, plain answer for the question every parent eventually asks. We are not a school. We are not a camp. We are a structured runway from teenage potential to African leadership.",
    author: { name: "Funmi Akinwale", role: "Founder", portrait: "funmi" },
    date: "May 14, 2026",
    read: "5 min",
    featured: true,
  },
  {
    id: "twelve-weeks",
    cover: 3,
    category: "Anchor 12",
    title: "Why twelve weeks. Not eight, not sixteen.",
    excerpt: "The shape of habit. Twelve is long enough to break the old self and short enough that a teenager will commit.",
    author: { name: "Dr. Ade", role: "Lead mentor", portrait: "ade" },
    date: "May 02, 2026",
    read: "8 min",
  },
  {
    id: "discipline-isnt-a-mood",
    cover: 5,
    category: "Discipline",
    title: "Discipline isn't a mood. It's a system you build around yourself.",
    excerpt: "Why we don't teach motivation. Why we do teach calendars, peer accountability and the small daily public commitment.",
    author: { name: "Aunty Funke", role: "Mentor — Lagos", portrait: "funke" },
    date: "Apr 21, 2026",
    read: "6 min",
  },
  {
    id: "african-intelligence",
    cover: 4,
    category: "Curriculum",
    title: "African intelligence is the spine, not the seasoning.",
    excerpt: "What changes when you stop translating a foreign syllabus and start writing the original. Notes from year two of the curriculum.",
    author: { name: "Prof. Eze", role: "Curriculum director", portrait: "eze" },
    date: "Apr 09, 2026",
    read: "12 min",
  },
  {
    id: "tunde-onitsha",
    cover: 6,
    category: "Cohort stories",
    title: "From Onitsha, with code: a sixteen-year-old's first app.",
    excerpt: "Tunde wanted to track Lagos buses for his grandmother. Six weeks later, the app shipped. He talks us through every wrong turn.",
    author: { name: "Tunde, 16", role: "NGGC · Tech", portrait: "tunde" },
    date: "Mar 28, 2026",
    read: "9 min",
  },
  {
    id: "safety-system",
    cover: 7,
    category: "Trust",
    title: "What a real safeguarding system looks like (and what it costs).",
    excerpt: "Two-mentor minimums, background checks, anonymous reporting, weekly parent digests. The boring infrastructure that lets the work be exciting.",
    author: { name: "Funmi Akinwale", role: "Founder", portrait: "funmi" },
    date: "Mar 14, 2026",
    read: "7 min",
  },
  {
    id: "first-cohort",
    cover: 1,
    category: "Looking back",
    title: "A year on: where the first NGGC cohort actually is.",
    excerpt: "We promised a runway, not a rocket. One year in, here is every member of cohort 01, what they shipped, and what they are doing now.",
    author: { name: "Editorial team", role: "NGG", portrait: "edit" },
    date: "Feb 28, 2026",
    read: "14 min",
  },
  {
    id: "voice-as-craft",
    cover: 2,
    category: "Public speaking",
    title: "Voice is a craft. Charisma is a side effect.",
    excerpt: "What we mean by 'speak so the back row leans in', and the three drills every NGGC member runs in their first month.",
    author: { name: "Zara, 15", role: "NGGC · Voice", portrait: "zara" },
    date: "Feb 12, 2026",
    read: "6 min",
  },
];

Object.assign(window, {
  ux, SCENES, BLOG_COVERS,
  persona, portrait, scene, blogCover,
  BLOG_POSTS,
});
