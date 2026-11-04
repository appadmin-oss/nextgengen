/* ================================================================
   NGG — App router + Tweaks
   ================================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d0ff3a",
  "showLiveBadges": true
}/*EDITMODE-END*/;

/* ── THE ROUTE REGISTRY — one row per addressable page ───────────────────────
 *
 * A route used to be described by FOUR hand-maintained lists (`PAGE_IDS`, a
 * `PAGE_META` map, `OWN_CHROME_PAGES` and a `noindexPages` array buried in an
 * effect), and nothing checked that they agreed. They drifted, and the drift
 * was not cosmetic:
 *
 *   · `apply` and `review` were added to PAGE_IDS and to the render map but
 *     never to PAGE_META. So the public Direct Apply form — a page that loads
 *     and works — titled its own browser tab, its `og:title` (every shared
 *     link preview) and its polite route announcement **"Page not found ·
 *     NGG"**. To anybody handed the link, the page 404s.
 *   · `apply` was missing from the noindex list too, so a child-intake form
 *     asking for a name, a date of birth, a photograph and a guardian's email
 *     shipped `robots: index, follow` and a canonical URL, while the desk
 *     version of the same form (`gate`) was correctly noindexed.
 *
 * So a route is now ONE row and everything below is derived from it. There is
 * no second list to forget. `tests/route-registry.test.js` fails if a page in
 * the render map has no row, or a row has no page — the same drift guard
 * `validateOrderAgainstIndex()` gives the build.
 *
 *   id           first path segment (`home` → "/") AND the render-map key
 *   title        <title>, og:title and the route announcement — REQUIRED
 *   desc         meta description + og:description. "" = leave the previous
 *                one in place (a surface with nothing public to say)
 *   chrome:"own" full-screen surface: no topnav, no footer, no ⌘K hint
 *   index:false  <meta name="robots" content="noindex, nofollow"> and no
 *                canonical — personal, operational or token-scoped surfaces
 *   addressable  false = reachable only through a prefix route (/q, /s, /cert),
 *                so the router must not rewrite the address bar to `/<id>`
 */
const ROUTES = [
  // ── Public site ──────────────────────────────────────────────────────────
  { id: "home",        title: "Next Generation Genius · Afrovanguard",     desc: "A twelve-week growth journey for African teenagers, 10–17. From summer student to vanguard leader." },
  { id: "about",       title: "About NGGC · The 2040 formation brief",    desc: "The Next Generation Genius Club is a formation system: four divisions, six goals, a courage index and a mentor for every member — raising 1,000,000 incorruptible African leaders by 2040." },
  { id: "summer",      title: "Summer School · NGG",                       desc: "Six weeks, eight academies, one bold move. Search every NGG Summer School centre, course and edition — and apply." },
  /* The public timetable maker. A centre's official week (without instructors'
     names) is one way to start, and travels in the URL (?centre=slug), so a
     link to one centre's week is still a link anybody can send. */
  { id: "timetable",   title: "Timetable maker · NGG",                     desc: "Design your own weekly timetable on a professional template and download it as a PDF, a picture or a calendar file. Free, no account.", chrome: "own" },
  { id: "centres",     title: "NGG member centres · NGG",                  desc: "Every Next Generation Genius member centre — find yours, meet the crew, see what's next." },
  { id: "club",        title: "NGGC · The Genius Club",                    desc: "A teen society with Genius IDs, weekly missions, public skill badges and a leaderboard." },
  { id: "community",   title: "Community · NGG",                           desc: "Every centre, every track, one movement — the Next Generation Genius community." },
  { id: "anchor",      title: "Anchor 12 · The Flagship · NGG",            desc: "Twelve weeks. Fifty missions. One identity, rebuilt in public." },
  { id: "book",        title: "The Anchor · The book · NGG",               desc: "The field manual every NGG teenager works through during Anchor 12." },
  { id: "media",       title: "Media room · NGG",                          desc: "Reels, documentaries, performances, podcasts. The movement on camera." },
  { id: "parents",     title: "For parents · Safe room with high ceilings", desc: "Safeguarding, philosophy, FAQ. A program built to protect while it builds." },
  { id: "volunteers",  title: "Become a mentor · NGG",                     desc: "Three ways to be useful. Pick the shape of your time." },
  { id: "mentors",     title: "The mentors · NGG",                         desc: "The Afrovanguard Street-To-Stardom volunteers who show up every Saturday." },
  { id: "blog",        title: "The Journal · NGG",                         desc: "Long-form writing from mentors, members and the editorial team." },
  { id: "support",     title: "Help & support · NGG",                      desc: "Answers to common questions, the live status, and how to reach the NGG team: open a case from My NGG or the Family account." },
  { id: "contact",     title: "Contact · NGG",                             desc: "Questions about a session, mentoring, partnerships or press — a human replies within two working days." },
  { id: "study",       title: "Study tools · NGG",                         desc: "Flashcards with spaced repetition, a focus timer, typing practice, a scientific calculator, a graph plotter and a dictionary — free study tools for NGG members.", chrome: "own" },
  { id: "telegram",    title: "Free messages on Telegram · NGG",           desc: "Get NGG's messages — sign-in codes, check-ins and notices — on Telegram, free, instead of by SMS. Android and iPhone." },
  { id: "policies",    title: "Member and family policies · NGG",          desc: "What a family agrees to when a child joins the NGG Club: taking part, safeguarding, medical care, privacy, updates, photos, trips and fees." },
  { id: "legal",       title: "Legal & data protection · NGG",             desc: "Privacy, terms, safeguarding, parental consent, cookies and your data rights under the NDPA/NDPR." },
  { id: "s-status",    title: "Live status · Summer School · NGG",         desc: "A live, public view of attendance and participation across every NGG Summer School centre — aggregate numbers only." },
  { id: "v-status",    title: "Volunteer status · Next Generation Genius",  desc: "A live, public view of volunteer needs and fulfilment across every NGG centre — aggregate counts only, never a volunteer's name." },

  // ── Intake ───────────────────────────────────────────────────────────────
  { id: "join",        title: "Apply · NGG",                               desc: "Apply to the NGG Club or Summer School. We save as you go." },
  { id: "volunteer",   title: "Volunteer registration · NGG",              desc: "Register to volunteer — as an admin, a mentor, or an instructor teaching a course." },
  { id: "ngg-volunteer", title: "Volunteer with NGG · All year",           desc: "Serve Next Generation Genius all year — mentoring, club sessions, events, media and operations. Four short steps." },
  /* Direct Apply: the public, gate-scoped sign-up a centre hands to a family
     (`/apply?g=…`). A real page with a real title — and noindexed, because it
     collects a child's identity and the address is meant to be given out, not
     found. */
  { id: "apply",       title: "Direct Apply · Summer School · NGG",        desc: "", chrome: "own", index: false },

  // ── Member-facing, signed in ─────────────────────────────────────────────
  { id: "profile",     title: "Member profile · NGG",                      desc: "An NGG member's public profile — work, badges, mentor notes.", index: false },
  { id: "dashboard",   title: "My NGG · Member portal",                    desc: "Your missions, mentor, streak and journal — the member dashboard.", chrome: "own", index: false },
  /* The Learn app. Its own place, with its own addresses — /learn/lesson/<id>
     is a lesson a member can bookmark and send, which it could not be while
     the curriculum was a sheet over the portal. */
  { id: "learn",       title: "Learn · NGG",                               desc: "The NGG Club curriculum: this week's lessons, your courses, the review and the study helper.", chrome: "own", index: false },
  { id: "summerprofile", title: "ID card · NGG",                           desc: "The page an NGG or Summer School card opens when it is scanned.", addressable: false, index: false },
  /* A family's joining invoice, by its private token (/pay/<token>). Own
     chrome, never indexed: the address is a capability, sent by email. */
  { id: "pay",          title: "Complete membership · NGG",                desc: "", chrome: "own", index: false, addressable: false },

  // ── Staff & operational surfaces (own chrome, never indexed) ─────────────
  { id: "admin",        title: "Control Room · NGG",                       desc: "", chrome: "own", index: false },
  { id: "summer-admin", title: "Summer School · Staff Portal · NGG",       desc: "", chrome: "own", index: false },
  { id: "club-admin",   title: "NGG Club · Staff Portal · NGG",            desc: "", chrome: "own", index: false },
  { id: "mentor",       title: "Mentor Portal · NGG",                      desc: "", chrome: "own", index: false },
  { id: "instructor",   title: "Instructor Portal · NGG",                  desc: "", chrome: "own", index: false },
  /* A parent's own account: their own sign-in (not a member session), every
     child they look after on one screen. Noindexed — it is a signed-in page. */
  { id: "family",       title: "Family account · NGG",                     desc: "For parents and guardians: attendance, conduct, fees and lesson progress for each child, and a way to tell the centre.", chrome: "own", index: false },
  { id: "circle",       title: "Anchor Circle has moved · NGG",            desc: "Parents and teachers now follow a child's Anchor week in the NGG family account; mentors in the mentor portal.", chrome: "own", index: false },
  { id: "gate",         title: "Check-in desk · NGG",                      desc: "", chrome: "own", index: false },
  { id: "enrol",        title: "Registration desk · Summer School · NGG",   desc: "", chrome: "own", index: false },
  { id: "review",       title: "Review desk · NGG",                        desc: "", chrome: "own", index: false },
  { id: "verify",       title: "Confirm your child's registration · NGG",  desc: "", chrome: "own", index: false },
  { id: "reshoot",      title: "A new photo · NGG",                        desc: "", chrome: "own", index: false },
  { id: "id-cards",     title: "ID Card Studio · NGG",                     desc: "", chrome: "own", index: false },
  { id: "designer",     title: "Design Studio · NGG",                      desc: "", chrome: "own", index: false },
  /* An official notice from management (/notice/<id>), and /notice for a member's list. Members and families only. */
  { id: "notice",      title: "Notice · NGG",                              desc: "An official notice from the NGG management to members and their families.", index: false, addressable: false },
  { id: "certificate",  title: "Service certificate · NGG",                desc: "A verifiable Next Generation Genius volunteer service certificate.", chrome: "own", index: false },
  { id: "journal-entry",title: "From the programme journal · NGG",         desc: "", chrome: "own", index: false },
];

/* Everything below is DERIVED. Add a page by adding one row above. */
const PAGE_IDS = ROUTES.filter(r => r.addressable !== false).map(r => r.id);
const PAGE_META = ROUTES.reduce((m, r) => { m[r.id] = { title: r.title, desc: r.desc || "" }; return m; }, {});
/* Pages that draw their OWN full-screen chrome — no topnav, no footer. Needed
   in three places that had drifted apart: the render branch below, and (via
   the `own-chrome` body class it sets) both the CSS that suppresses the
   floating helpers and CommandHint's own check. */
const OWN_CHROME_PAGES = ROUTES.filter(r => r.chrome === "own").map(r => r.id);
/* Personal, operational and token-scoped surfaces stay out of the index.
   "certificate" belongs here: a completion certificate carries a child's full
   name, centre and course, the URL is shareable, and without this a parent
   forwarding it to one person put it in a search index for everyone. The
   document is theirs to show — that is not the same as publishing it. */
const NOINDEX_PAGES = ROUTES.filter(r => r.index === false).map(r => r.id);

/** Compare the registry against the render map. Returns the two ways they can
 *  disagree, plus the rows that are missing a title — the failure that shipped
 *  the Direct Apply page as "Page not found". Pure, so a test can call it. */
/* ── The signed-in bundle, fetched when a route needs it ──────────────────
   Production ships two bundles (build.js `MORE`): the public site, and
   everything behind a sign-in. A public visitor downloads only the first. A
   route whose page lives in the second waits for it here; so does a public
   page that switches to a portal when somebody is signed in (NGG_MORE_ROUTES:
   the dashboard turns into the member portal, Community into its app, the
   two admin portals mount their workspaces). Anything this list misses is
   caught by NggChunkGate — a ReferenceError while drawing loads the bundle
   and draws again — so a missed route costs a moment's wait, never a crash.
   In dev every file is already loaded (no <meta name="ngg-more">). */
const NGG_MORE_ROUTES = ["admin", "summer-admin", "club-admin", "circle", "family", "mentor", "instructor", "id-cards", "designer", "dashboard", "community"];
let nggMorePromise = null;
function nggMoreUrl() { const m = document.querySelector('meta[name="ngg-more"]'); return m ? m.getAttribute("content") : ""; }
function nggMoreReady() { return !!window.__nggMoreLoaded || !nggMoreUrl(); }
function nggNeedMore() {
  if (nggMoreReady()) return Promise.resolve(true);
  if (nggMorePromise) return nggMorePromise;
  nggMorePromise = new Promise((resolve, reject) => {
    window.__nggMoreReady = () => resolve(true);
    const el = document.createElement("script");
    el.src = nggMoreUrl(); el.async = true;
    el.onerror = () => { nggMorePromise = null; reject(new Error("chunk_failed")); };
    el.onload = () => { if (!window.__nggMoreLoaded) { nggMorePromise = null; reject(new Error("chunk_failed")); } };
    document.head.appendChild(el);
  });
  return nggMorePromise;
}
/* Draws a page once what it needs is loaded: a short wait with words, an
   honest error with a retry if the bundle could not be fetched (a dropped
   connection is the commonest case on a phone). */
class NggChunkGate extends React.Component {
  constructor(p) { super(p); this.state = { ready: nggMoreReady() || !NGG_MORE_ROUTES.includes(p.page), failed: false, tries: 0 }; }
  /* Only a name the signed-in bundle defines is this gate's business; any
     other error is thrown on, up to the app's own handling. */
  static getDerivedStateFromError(e) { return e && e.name === "ReferenceError" && !nggMoreReady() ? { ready: false, failed: false } : { fatal: e }; }
  componentDidCatch(e) { if (e && e.name === "ReferenceError" && !nggMoreReady()) this.load(); }
  componentDidMount() { if (!this.state.ready) this.load(); }
  componentDidUpdate(prev) { if (prev.page !== this.props.page && !nggMoreReady() && NGG_MORE_ROUTES.includes(this.props.page)) { this.setState({ ready: false }); this.load(); } }
  load() { nggNeedMore().then(() => this.setState({ ready: true, failed: false }), () => this.setState({ failed: true })); }
  render() {
    if (this.state.fatal) throw this.state.fatal;
    if (this.state.failed) return (
      <div className="ngg-chunk-wait" role="alert">
        <p>This part of the site didn’t load. Check your connection and try again.</p>
        <button type="button" className="btn btn-primary" onClick={() => { this.setState({ failed: false, tries: this.state.tries + 1 }); this.load(); }}>Try again</button>
      </div>);
    if (!this.state.ready) return <div className="ngg-chunk-wait" role="status" aria-live="polite"><span className="ngg-chunk-spin" aria-hidden="true"/>Loading…</div>;
    return this.props.render();
  }
}

function routeAudit(renderKeys) {
  const keys = renderKeys || [];
  const ids = ROUTES.map(r => r.id);
  const missingRoute = keys.filter(k => ids.indexOf(k) === -1).sort();   // rendered, no row
  const missingPage = ids.filter(id => keys.indexOf(id) === -1).sort();  // row, nothing renders
  const missingTitle = ROUTES.filter(r => !r.title).map(r => r.id).sort();
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i).sort();
  return {
    ok: !missingRoute.length && !missingPage.length && !missingTitle.length && !duplicateIds.length,
    missingRoute, missingPage, missingTitle, duplicateIds,
    routes: ids.length,
  };
}

/* ---- 404 fallback — when a hash doesn't match any registered page ---- */
function NotFound({ setPage }) {
  return (
    <section className="not-found" data-screen-label="404">
      <div className="container">
        <div className="mono not-found-eyebrow">404 · OFF THE PATH</div>
        <h1 className="display not-found-h">We don't have a room<br/>at that address.</h1>
        <p className="not-found-p">The page you were looking for either moved or never existed. Pick a doorway — they're all open.</p>
        <div className="not-found-actions">
          <button className="btn btn-primary btn-lg" onClick={() => setPage("home")}>Back to home →</button>
          <button className="btn btn-ghost btn-lg" onClick={() => setPage("anchor")}>Anchor 12</button>
          <button className="btn btn-ghost btn-lg" onClick={() => setPage("join")}>Apply for a session</button>
        </div>
      </div>
    </section>
  );
}

/* ---- Scroll progress bar (top of page) ---- */
function ScrollProgress() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? (h.scrollTop / max) * 100 : 0;
      if (ref.current) ref.current.style.setProperty("--p", p.toFixed(2) + "%");
      raf = 0;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div className="scroll-progress" ref={ref} aria-hidden="true"/>;
}

/* ---- Back-to-top floating button ---- */
function BackToTop() {
  const [vis, setVis] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setVis(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      className={"fab-top" + (vis ? " is-visible" : "")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
    >↑</button>
  );
}

/* ---- Auto scroll-reveal: tags first-level sections of each page ---- */
function useScrollReveal(page) {
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Wait for paint, then collect direct children of <main> > .page
    const id = requestAnimationFrame(() => {
      const page = document.querySelector("main > .page");
      if (!page) return;
      const candidates = Array.from(page.children);
      candidates.forEach(el => el.classList.add("reveal"));

      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });

      candidates.forEach(el => obs.observe(el));

      // Safety: ensure visible after 2s even if observer never fires
      setTimeout(() => candidates.forEach(el => el.classList.add("is-visible")), 2000);
    });
    return () => cancelAnimationFrame(id);
  }, [page]);
}

// In-page anchors that are scroll targets, not routes (skip link, section
// jumps). They live in the URL hash; the browser scrolls to them and the
// router leaves the current page untouched.
const ANCHOR_IDS = ["main", "mentor-apply"];

// Standard path-based routing. "/" → home, "/dashboard" → dashboard, etc.
// The server (.htaccess SPA fallback) serves index.html for every app path,
// so deep links + refresh work without a hash. Real files and /api, /journal,
// /assets are excluded server-side.
function pageFromPath() {
  const seg = (window.location.pathname || "/").replace(/^\/+|\/+$/g, "").split("/")[0];
  if (!seg) {
    /* Member cards printed before secure codes carried /?m=<memberId>, which
       opened the home page. They open the card's page now, like any scan. */
    try {
      const m = new URLSearchParams(window.location.search).get("m");
      if (m && /^[A-Za-z0-9-]{3,40}$/.test(m)) { history.replaceState({ page: "summerprofile" }, "", "/q/" + encodeURIComponent(m)); return "summerprofile"; }
    } catch (_) {}
    return "home";
  }
  // /login and /signin are conventional entry points — resolve to home; the
  // auth provider opens the sign-in modal (or redirects signed-in users).
  if (seg === "login" || seg === "signin") return "home";
  // What a scanned card opens: /q/<qr-token> (NGG member, Summer participant, volunteer) or /s/<handle>.
  if (seg === "q" || seg === "s") return "summerprofile";
  /* The Maths Lab lives on the study page; its short addresses forward there (docs/MATH-LAB-PLAN.md §6). */
  if (seg === "mathlab" || seg === "math-lab" || seg === "mathslab" || seg === "lab") { try { history.replaceState({ page: "study" }, "", "/study/lab" + window.location.search); } catch (_) {} return "study"; }
  /* /member/<area>/<tab> was the address of the 2026-10-11 Member Portal, which
     was withdrawn. Its links are in notifications and bookmarks, so each forwards
     to the dashboard section that holds the same thing. */
  if (seg === "member") {
    const parts = (window.location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
    const key = (parts[1] || "") + "/" + (parts[2] || "");
    const to = { "grow/results": "/dashboard/results", "account/money": "/dashboard/account", "account/records": "/dashboard/records",
                 "learn/": "/dashboard/learning", "learn/timetable": "/dashboard/timetable", "mentor/companion": "/dashboard/companion" }[key]
            || ({ grow: "/dashboard/results", learn: "/dashboard/learning" }[parts[1] || ""]) || "/dashboard";
    try { history.replaceState({ page: "dashboard" }, "", to + window.location.search); } catch (_) {}
    return "dashboard";
  }
  // A joining invoice: /pay/<token>.
  if (seg === "pay") return "pay";
  // Volunteer service certificates: /cert/<certId> — public + printable.
  if (seg === "cert") return "certificate";
  // Official notices: /notice/<id>, and /notice (or /notices) for the list.
  if (seg === "notice" || seg === "notices") return "notice";
  // The staff Control Room lives at /control (it owns the subtree
  // /control/<page>/<tab>); /nextadmin, /hq and /admin are kept as aliases so
  // old links, bookmarks and emailed ?s=<section> deep links keep working.
  if (seg === "control" || seg === "nextadmin" || seg === "hq" || seg === "admin") return "admin";
  // Legacy alias: the public attendance board moved from /status to /s-status.
  // Resolve old bookmarks/shared links transparently (the router then rewrites
  // the address bar to /s-status via pathForPage in the effect below).
  if (seg === "status") return "s-status";
  // The ID Card Studio lives under the Club (/club/id-cards). /cards was the
  // old Card Studio's address and is kept as an alias: it is in bookmarks.
  if (seg === "cards") return "id-cards";
  if (seg === "club" && (window.location.pathname || "").replace(/^\/+|\/+$/g, "").split("/")[1] === "id-cards") return "id-cards";
  if (seg === "join" && (window.location.pathname || "").replace(/\/+$/, "").split("/")[2] === "volunteer") return "ngg-volunteer";
  return PAGE_IDS.includes(seg) ? seg : "_notfound";
}
function pathForPage(page) {
  if (page === "admin") return "/control";
  if (page === "id-cards") return "/club/id-cards";
  if (page === "ngg-volunteer") return "/join/volunteer";
  return page === "home" ? "/" : "/" + page;
}

/* Open the application form, carrying what the applicant already told us.
 *
 * Every "Apply" CTAs in the product used to be `setPage("join")` and nothing
 * else, with the chosen programme smuggled across as `window.__nggProgram` one
 * tick before the route changed. Two things followed: a refresh of the form
 * silently switched the applicant from Summer School to Anchor 12, and "Apply
 * to THIS centre" opened a form with a different centre preselected.
 *
 * Both facts are now URL parameters, which is what makes them survive a
 * refresh, a bookmark, a shared link and a bounce through sign-in. The address
 * is pushed BEFORE the page switches so the router's own effect sees the path
 * it already wants and leaves the query string alone.
 *
 *   goApply(setPage, "summer")                    → /join?program=summer
 *   goApply(setPage, "summer", { centre: "Ijaiye" }) → …&centre=Ijaiye
 */
function goApply(setPage, program, opts) {
  const p = program === "summer" ? "summer" : "anchor";
  const q = new URLSearchParams({ program: p });
  const centre = (opts && opts.centre) ? String(opts.centre).trim() : "";
  if (centre) q.set("centre", centre);
  const track = (opts && opts.track) ? String(opts.track).trim() : "";
  if (track) q.set("track", track);
  try { history.pushState({ page: "join" }, "", "/join?" + q.toString()); } catch (_) {}
  setPage("join");
}

function App() {
  const [page, setPage] = React.useState(pageFromPath);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  // Context-aware chrome: the whole site knows when a member is signed in.
  const { isSignedIn } = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  React.useEffect(() => { document.body.classList.toggle("is-authed", !!isSignedIn); }, [isSignedIn]);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    // Reflect the current page as a clean path so refresh + share work.
    // Skip the 404 sentinel + deep-linked profile URLs so they stay as-typed.
    // The centres page owns a URL subtree (/centres and /centres/<slug>); don't
    // clobber a deep-linked slug by rewriting it back to the index path.
    const inCentresSubtree = page === "centres" && (window.location.pathname || "").replace(/\/+$/, "").startsWith("/centres");
    /* The dashboard owns a subtree too — /dashboard/account, /dashboard/records,
       /dashboard/requests. Its own router (see page-dashboard.jsx) pushes those,
       and rewriting them back to /dashboard here would undo a deep link the
       moment the page mounted, which reads as "the tab does not work". */
    const inDashSubtree = page === "dashboard" && (window.location.pathname || "").replace(/\/+$/, "").startsWith("/dashboard");
    /* The Control Room owns /control/<page>/<tab> and resolves the old
       /nextadmin?s=… addresses itself (src/modules/control/cr-app.jsx). */
    const inControlSubtree = page === "admin" && /^\/(control|nextadmin|hq|admin)(\/|$)/.test(window.location.pathname || "");
    /* The mentor portals own /mentor/ngg, /mentor/summer and /mentor/class (MentorHome). */
    const inMentorSubtree = (page === "mentor" && /^\/mentor(\/|$)/.test(window.location.pathname || "")) || (page === "instructor" && /^\/instructor(\/|$)/.test(window.location.pathname || ""));
    /* Study tools own /study/<tab>/<tool> (src/modules/tools/tools-core.jsx), and forward the old /study/cards-style addresses themselves. */
    const inStudySubtree = page === "study" && /^\/study(\/|$)/.test(window.location.pathname || "");
    /* The Learn app owns /learn/<view>/<id> (page-learn.jsx) and reads it
       itself, so a deep lesson address must not be rewritten back to /learn
       on mount — that is what made a lesson unbookmarkable before. */
    const inLearnSubtree = page === "learn" && /^\/learn(\/|$)/.test(window.location.pathname || "");
    const prefixRoute = ROUTES.some(r => r.id === page && r.addressable === false);
    if (page !== "_notfound" && !prefixRoute && page !== "certificate" && !inCentresSubtree && !inDashSubtree && !inControlSubtree && !inMentorSubtree && !inStudySubtree && !inLearnSubtree && window.location.pathname !== pathForPage(page)) {
      history.pushState({ page }, "", pathForPage(page) + window.location.search);
    }
    // Expose for the sign-in modal / magic link consumer.
    window.__navigate = setPage;
    /* A member whose record is locked by the record drive is sent to the one
       screen that opens it again (RecordDrive on the dashboard). */
    window.__onRecordIncomplete = () => { if (page !== "dashboard") setPage("dashboard"); };
    // Per-page document title + meta description — actually visible to
    // browser tabs, screen readers, share-link previews and SEO crawlers.
    const meta = PAGE_META[page] || { title: "Page not found · NGG", desc: "" };
    document.title = meta.title;
    const m = document.querySelector('meta[name="description"]');
    if (m && meta.desc) m.setAttribute("content", meta.desc);
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", meta.title);
    const ogd = document.querySelector('meta[property="og:description"]');
    if (ogd && meta.desc) ogd.setAttribute("content", meta.desc);
    /* Canonical + og:url must follow the route — a canonical pinned to "/"
       tells crawlers every deep page is a duplicate of the homepage. Only for
       pages we actually want indexed: a canonical on a noindexed surface
       advertises the address it is trying not to publish. */
    const indexable = PAGE_IDS.includes(page) && NOINDEX_PAGES.indexOf(page) === -1;
    const canonicalUrl = "https://next.afrovanguard.org.ng" + (page === "home" ? "/" : "/" + page);
    const can = document.querySelector('link[rel="canonical"]');
    if (can && indexable) can.setAttribute("href", canonicalUrl);
    const ogu = document.querySelector('meta[property="og:url"]');
    if (ogu && indexable) ogu.setAttribute("content", canonicalUrl);
    let rob = document.querySelector('meta[name="robots"]');
    if (rob) rob.setAttribute("content", NOINDEX_PAGES.includes(page) ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    // Announce route change for assistive tech via a polite live region.
    const live = document.getElementById("ngg-route-live");
    if (live) live.textContent = "Navigated to " + meta.title;
    // Make the current route addressable from CSS (e.g. hide the topnav
    // Apply button while we're already on the Join page).
    document.body.setAttribute("data-page", page);
    // Lets CSS and CommandHint agree on "this surface owns the whole screen".
    document.body.classList.toggle("own-chrome", OWN_CHROME_PAGES.includes(page));
  }, [page]);

  // React to browser back/forward via the History API.
  React.useEffect(() => {
    const onPop = () => {
      const next = pageFromPath();
      if (next !== page) setPage(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [page]);

  // Apply accent override
  React.useEffect(() => {
    document.documentElement.style.setProperty("--lime", t.accent);
  }, [t.accent]);

  useScrollReveal(page);
  useReveal([page]);

  const pages = {
    home:      () => <HomePage      setPage={setPage}/>,
    about:     () => <AboutPage     setPage={setPage}/>,
    summer:    () => <SummerPage    setPage={setPage}/>,
    centres:   () => <CentresPage   setPage={setPage}/>,
    timetable: () => <TimetableMakerPage setPage={setPage}/>,
    club:      () => <ClubPage      setPage={setPage}/>,
    community:  () => <CommunityPage setPage={setPage}/>,
    anchor:    () => <AnchorPage    setPage={setPage}/>,
    profile:   () => <ProfilePage   setPage={setPage}/>,
    dashboard: () => <DashboardPage setPage={setPage}/>,
    learn:     () => <LearnPage     setPage={setPage}/>,
    book:      () => <BookPage      setPage={setPage}/>,
    media:     () => <MediaPage     setPage={setPage}/>,
    parents:   () => <ParentsPage   setPage={setPage}/>,
    volunteers:() => <VolunteersPage setPage={setPage}/>,
    volunteer: () => <VolunteerRegisterPage setPage={setPage}/>,
    "ngg-volunteer": () => <NggVolunteerPage setPage={setPage}/>,
    mentors:   () => <MentorsPage    setPage={setPage}/>,
    join:      () => <JoinPage      setPage={setPage}/>,
    policies:  () => <PoliciesPage  setPage={setPage}/>,
    telegram:  () => <TelegramPage  setPage={setPage}/>,
    study:     () => <ToolsApp      setPage={setPage}/>,
    blog:      () => <BlogPage      setPage={setPage}/>,
    contact:   () => <ContactPage   setPage={setPage}/>,
    support:   () => <HelpCentrePage setPage={setPage}/>,
    "s-status": () => <StatusPage    setPage={setPage}/>,
    "v-status": () => <VolunteerStatusPage setPage={setPage}/>,
    summerprofile: () => <SummerProfilePage setPage={setPage}/>,
    admin:     () => <ControlRoomPage setPage={setPage}/>,
    "summer-admin": () => <SummerAdminPortal setPage={setPage}/>,
    "club-admin":   () => <ClubAdminPortal   setPage={setPage}/>,
    circle:     () => <CirclePortal   setPage={setPage}/>,
    family:     () => <FamilyPage     setPage={setPage}/>,
    mentor:     () => <MentorHome/>,
    instructor: () => <InstructorHome/>,
    apply:      () => <SelfRegisterPage/>,
    review:     () => <ReviewDeskPage/>,
    gate:       () => <GatePage/>,
    enrol:      () => <EnrolDeskPage/>,
    verify:     () => <ParentVerifyPage/>,
    reshoot:    () => <ReshootPage/>,
    "id-cards": () => <IdCardStudioPage setPage={setPage}/>,
    designer:   () => <DesignerPage/>,
    certificate: () => <CertificatePage/>,
    notice:     () => <NoticePage setPage={setPage}/>,
    pay: () => <MembershipPayPage setPage={setPage}/>,
    "journal-entry": () => <JournalEntryPage/>,
    legal:      () => <LegalPage setPage={setPage}/>,
  };

  /* ── The drift guard ──────────────────────────────────────────────────────
     The registry and the render map must name the same pages. This is exactly
     the check that was missing when /apply and /review shipped rendering fine
     and titling themselves "Page not found · NGG" for two releases.

     Published on `window` so `tests/route-registry.test.js` can assert it
     against the real production bundle rather than re-parsing the source, and
     logged rather than thrown, because one forgotten row must degrade a title
     — not blank the site. */
  React.useEffect(() => {
    const audit = routeAudit(Object.keys(pages));
    window.__routeAudit = audit;
    if (audit.ok === false) console.error("[router] route registry drift", audit);
    // eslint-disable-next-line
  }, []);

  // The staff console/portals, the guardian Circle portal, the gate desk and
  // the parent verification page use their own chrome — no topnav/footer.
  if (OWN_CHROME_PAGES.includes(page)) {
    return (
      <div className="app-shell app-shell-admin">
        <SkipLink/>
        <OfflineBanner/>
        <NggChunkGate page={page} render={pages[page]}/>
        <ToastHost/>
        <DialogHost/>
        {/* The Control Room has its own palette (⌘K, CONTROL_ROOM.md §4.1). */}
        {page !== "admin" && page !== "dashboard" && <CommandPalette/>}
        <div id="ngg-a11y-live" aria-live="polite" className="sr-only"/>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SkipLink/>
      <OfflineBanner/>
      <ScrollProgress/>
      <TopNav page={page} setPage={setPage}/>
      <div id="ngg-route-live" aria-live="polite" aria-atomic="true" className="sr-only"/>
      <main id="main" style={{flex:1}}>
        <PageTransition pageKey={page}>
          {page === "_notfound" || !pages[page] ? <NotFound setPage={setPage}/> : <NggChunkGate page={page} render={pages[page]}/>}
        </PageTransition>
      </main>
      <Footer setPage={setPage} page={page}/>
      <BackToTop/>
      <ToastHost/>
      <DialogHost/>
      <CommandPalette/>
      <div id="ngg-a11y-live" aria-live="polite" className="sr-only"/>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand"/>
        <TweakColor
          label="Neon accent"
          value={t.accent}
          onChange={v => setTweak("accent", v)}
          options={["#d0ff3a", "#ff5a3c", "#b07cff", "#f5b026"]}
        />
        <TweakSection label="Jump to page"/>
        <div style={{display:"grid", gridTemplateColumns:"var(--rs-gcolumns-16, 1fr 1fr)", gap:6, marginTop:8}}>
          {[
            ["home","Home"],["summer","Summer"],["club","NGGC"],["anchor","Anchor 12"],
            ["profile","Profile"],["blog","Journal"],["media","Media"],["parents","Parents"],
            ["volunteers","Volunteers"],["join","Join"]
          ].map(([id, label]) => (
            <button key={id} onClick={() => setPage(id)} style={{
              padding:"7px 10px", borderRadius:8,
              background: page === id ? "#0a1130" : "#f3f3f5",
              color: page === id ? "white" : "#0a1130",
              border:"none", cursor:"pointer", fontSize:12, fontWeight:500,
              fontFamily:"inherit", textAlign:"left",
            }}>{label}</button>
          ))}
        </div>
        <TweakSection label="Feel"/>
        <TweakToggle
          label="Show live cohort badges"
          value={t.showLiveBadges}
          onChange={v => setTweak("showLiveBadges", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <AuthProvider>
      <App/>
    </AuthProvider>
  </ErrorBoundary>
);
