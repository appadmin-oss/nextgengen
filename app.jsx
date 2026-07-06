/* ================================================================
   NGG — App router + Tweaks
   ================================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d0ff3a",
  "showLiveBadges": true
}/*EDITMODE-END*/;

const PAGE_IDS = ["home","summer","club","anchor","profile","dashboard","book","media","parents","volunteers","mentors","join","blog","contact","admin","summer-admin","club-admin"];

// Page metadata — drives <title>, meta description and the screen-reader
// route announcement when navigating between pages.
const PAGE_META = {
  home:       { title: "Next Generation Genius · Afrovanguard",      desc: "A twelve-week growth journey for African teenagers, 10–17. From summer student to vanguard leader." },
  summer:     { title: "Summer Students · NGG",                       desc: "Six weeks, eight tracks, one bold move. The on-ramp into the Next Generation Genius movement." },
  club:       { title: "NGGC · The Genius Club",                      desc: "A teen society with Genius IDs, weekly missions, public skill badges and a leaderboard." },
  anchor:     { title: "Anchor 12 · The Flagship · NGG",              desc: "Twelve weeks. Fifty missions. One identity, rebuilt in public." },
  profile:    { title: "Member profile · NGG",                        desc: "An NGG member's public profile — work, badges, mentor notes." },
  dashboard:  { title: "My dashboard · NGG",                          desc: "Your missions, mentor, streak and journal — the member dashboard." },
  book:       { title: "The Anchor · The book · NGG",                 desc: "The field manual every NGG teenager works through during Anchor 12." },
  media:      { title: "Media room · NGG",                            desc: "Reels, documentaries, performances, podcasts. The movement on camera." },
  parents:    { title: "For parents · Safe room with high ceilings",  desc: "Safeguarding, philosophy, FAQ. A program built to protect while it builds." },
  volunteers: { title: "Become a mentor · NGG",                       desc: "Five ways to be useful. Pick the shape of your time." },
  mentors:    { title: "The mentors · NGG",                           desc: "The Afrovanguard Street-To-Stardom volunteers who show up every Saturday." },
  join:       { title: "Apply · Summer 2026 · NGG",                   desc: "Four short steps. About six minutes. Pause and come back — we save as you go." },
  blog:       { title: "The Journal · NGG",                           desc: "Long-form writing from mentors, members and the editorial team." },
  contact:    { title: "Contact · NGG",                               desc: "Questions about a session, mentoring, partnerships or press — a human replies within two working days." },
  summerprofile: { title: "Summer student · NGG",                     desc: "A Summer School student's standard profile." },
  admin:      { title: "Admin · Control Room · NGG",                  desc: "" },
  "summer-admin": { title: "Summer School · Staff Portal · NGG",      desc: "" },
  "club-admin":   { title: "NGG Club · Staff Portal · NGG",           desc: "" },
};

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
  if (!seg) return "home";
  // /login and /signin are conventional entry points — resolve to home; the
  // auth provider opens the sign-in modal (or redirects signed-in users).
  if (seg === "login" || seg === "signin") return "home";
  // Summer student profiles: /q/<qr-token> or /s/<handle>.
  if (seg === "q" || seg === "s") return "summerprofile";
  return PAGE_IDS.includes(seg) ? seg : "_notfound";
}
function pathForPage(page) {
  return page === "home" ? "/" : "/" + page;
}

function App() {
  const [page, setPage] = React.useState(pageFromPath);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    // Reflect the current page as a clean path so refresh + share work.
    // Skip the 404 sentinel + deep-linked profile URLs so they stay as-typed.
    if (page !== "_notfound" && page !== "summerprofile" && window.location.pathname !== pathForPage(page)) {
      history.pushState({ page }, "", pathForPage(page) + window.location.search);
    }
    // Expose for the sign-in modal / magic link consumer.
    window.__navigate = setPage;
    // Per-page document title + meta description — actually visible to
    // browser tabs, screen readers, share-link previews and SEO crawlers.
    const meta = PAGE_META[page] || { title: "Page not found · NGG", desc: "" };
    document.title = meta.title;
    const m = document.querySelector('meta[name="description"]');
    if (m && meta.desc) m.setAttribute("content", meta.desc);
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", meta.title);
    // Announce route change for assistive tech via a polite live region.
    const live = document.getElementById("ngg-route-live");
    if (live) live.textContent = "Navigated to " + meta.title;
    // Make the current route addressable from CSS (e.g. hide the topnav
    // Apply button while we're already on the Join page).
    document.body.setAttribute("data-page", page);
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
  useCursor();

  const pages = {
    home:      <HomePage      setPage={setPage}/>,
    summer:    <SummerPage    setPage={setPage}/>,
    club:      <ClubPage      setPage={setPage}/>,
    anchor:    <AnchorPage    setPage={setPage}/>,
    profile:   <ProfilePage   setPage={setPage}/>,
    dashboard: <DashboardPage setPage={setPage}/>,
    book:      <BookPage      setPage={setPage}/>,
    media:     <MediaPage     setPage={setPage}/>,
    parents:   <ParentsPage   setPage={setPage}/>,
    volunteers:<VolunteersPage setPage={setPage}/>,
    mentors:   <MentorsPage    setPage={setPage}/>,
    join:      <JoinPage      setPage={setPage}/>,
    blog:      <BlogPage      setPage={setPage}/>,
    contact:   <ContactPage   setPage={setPage}/>,
    summerprofile: <SummerProfilePage setPage={setPage}/>,
    admin:     <AdminPage     setPage={setPage}/>,
    "summer-admin": <SummerAdminPortal setPage={setPage}/>,
    "club-admin":   <ClubAdminPortal   setPage={setPage}/>,
  };

  // The admin console and the two staff portals use their own chrome —
  // no public topnav/footer.
  if (page === "admin" || page === "summer-admin" || page === "club-admin") {
    return (
      <div className="app-shell app-shell-admin">
        <SkipLink/>
        {pages[page]}
        <ToastHost/>
        <DialogHost/>
        <CommandPalette/>
        <AccessibilityWidget/>
        <div id="ngg-a11y-live" aria-live="polite" className="sr-only"/>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SkipLink/>
      <ScrollProgress/>
      <TopNav page={page} setPage={setPage}/>
      <div id="ngg-route-live" aria-live="polite" aria-atomic="true" className="sr-only"/>
      <main id="main" style={{flex:1}}>
        <PageTransition pageKey={page}>
          {page === "_notfound" ? <NotFound setPage={setPage}/> : (pages[page] || <NotFound setPage={setPage}/>)}
        </PageTransition>
      </main>
      <Footer setPage={setPage}/>
      <BackToTop/>
      <ToastHost/>
      <DialogHost/>
      <CommandPalette/>
      <AccessibilityWidget/>
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
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:8}}>
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
