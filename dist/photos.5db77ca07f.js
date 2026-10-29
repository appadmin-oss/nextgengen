/* ================================================================
   NGG — Photo / portrait library
   
   STRATEGY:
   - Portraits: initials on a seeded colour, drawn here as a data URI. No
     network, no third party, and no child's name leaving this origin to
     fetch a picture. A real photo on the member's record is shown wherever
     there is one; this is the honest fallback when there is not.
   - Scenes: Unsplash CDN — full-bleed photographs used for hero,
     community collage, blog covers, testimonial context.
   ================================================================ */

/**
 * LOCAL MEDIA ONLY — the one switch a zero-rated deployment turns on.
 *
 * The scene photographs below are stock images on Unsplash's CDN, and they
 * are the last third-party host this app reaches (docs/ZERO-RATING.md). A
 * mobile operator zero-rating the service whitelists hostnames; a learner
 * arriving on free data would pay for these, or wait for them to time out,
 * on the very first page.
 *
 * It is ON by default, and that is a deliberate change. The scenes are
 * photographs of other people's children standing in for NGG's own cohort —
 * one of them was captioned "Current cohort" — on a live site about real
 * Nigerian teenagers. There is no version of that which is fine, and the
 * host it cost was the smaller half of the problem.
 *
 * Scenes are composed locally instead: a gradient on the programme's own
 * palette, deterministic per scene, so the pages keep their rhythm and
 * nothing pretends to be a photograph of anybody.
 *
 * The real fix is the programme's own photographs from its own centres, in
 * /assets, with the consent that comes with them. A deployment that has put
 * licensed imagery back can opt out with
 * `<meta name="ngg-local-media" content="false"/>`.
 */
function photosLocalOnly() {
  try {
    if (typeof window !== "undefined" && window.NGG_LOCAL_MEDIA !== undefined) return !!window.NGG_LOCAL_MEDIA;
    if (typeof document !== "undefined") {
      const m = document.querySelector('meta[name="ngg-local-media"]');
      if (m) return m.content !== "false";
    }
  } catch (e) {}
  return true;
}

/* A stand-in that costs nothing and still composes: two seeded tones on the
   programme's own palette, so a page keeps its weight and its rhythm. */
function uxLocal(id, w, h) {
  const t = seedHash(String(id));
  const a = ["#1c2a5e", "#0c1432", "#2a1d00", "#123", "#241a3a"][t % 5];
  const b = ["#f5b026", "#d0ff3a", "#ff5a3c", "#b07cff", "#ffd680"][(t >> 3) % 5];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h || Math.round(w * 0.66)}" width="${w}" height="${h || Math.round(w * 0.66)}" role="img">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}" stop-opacity="0.55"/></linearGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// Helper that builds a properly-formatted Unsplash URL
function ux(id, w = 800, h = null, opts = {}) {
  if (photosLocalOnly()) return uxLocal(id, w, h);
  const params = new URLSearchParams({ auto: "format", fit: "crop", w: String(w), q: "80", ...opts });
  if (h) params.set("h", String(h));
  return `https://images.unsplash.com/photo-${id}?${params.toString()}`;
}

/* Avatar colours, seeded per member so a face does not move between
   screens. The skin and hair tables that used to sit here existed only to
   make a GENERATED FACE look plausible; nothing draws a face now. */
const PERSONA_BG = ["1c2a5e", "f5b026", "d0ff3a", "ff5a3c", "b07cff", "ffd680", "0c1432"];

/**
 * A member's placeholder avatar, drawn HERE — initials, not a face.
 *
 * Two things were wrong with what this was. It fetched an illustrated
 * portrait from `https://api.dicebear.com/…?seed=<the member's name>`, which
 * means every time the portal drew an avatar it sent that child's name to a
 * third party, as a URL, in the clear, for a picture. A youth organisation
 * handling children's records should not be doing that by accident, for
 * decoration.
 *
 * And it drew a FACE. A generated face for a real child is a stranger's
 * face wearing their name — it is not them, it does not become them, and
 * where there is a real photo on the record that is what is shown anyway.
 * Initials on their own colour say "we do not have your photo yet" honestly,
 * which is the true thing.
 *
 * Deterministic, as the old one was: the same seed gives the same colour and
 * the same letters every time, so somebody does not change between screens.
 * It is also one fewer host on the whitelist an operator is asked for
 * (docs/ZERO-RATING.md), though that is the smallest of the reasons.
 */
function persona(seed, size = 200) {
  const s = String(seed);
  const bg = PERSONA_BG[seedHash(s) % PERSONA_BG.length];
  const ink = ["#ffffff", "#0c1432"][bg === "f5b026" || bg === "d0ff3a" || bg === "ffd680" ? 1 : 0];
  const words = s.trim().split(/\s+/).filter(w => /^[\p{L}]/u.test(w));
  const initials = words.length
    ? (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase()
    : "·";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img">`
    + `<rect width="100" height="100" fill="#${bg}"/>`
    + `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" `
    + `font-family="Inter,system-ui,sans-serif" font-size="${initials.length > 1 ? 40 : 48}" `
    + `font-weight="700" letter-spacing="1" fill="${ink}">${initials}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function seedHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* portrait() — primary entry. Returns a locally drawn SVG, as a data URI. */
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
