/* ================================================================
   NGG — App router + Tweaks
   ================================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d0ff3a",
  "showLiveBadges": true
}/*EDITMODE-END*/;

const PAGE_IDS = ["home","summer","club","anchor","profile","dashboard","book","media","parents","volunteers","join","blog","admin"];

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

function App() {
  const [page, setPage] = React.useState(() => {
    // Allow deep-linking via hash, e.g. /#admin or /#dashboard
    const h = (window.location.hash || "").replace(/^#/, "");
    return h && PAGE_IDS.includes(h) ? h : "home";
  });
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    // Reflect current page in URL hash so refresh + share works.
    if (page === "home") history.replaceState(null, "", window.location.pathname + window.location.search);
    else history.replaceState(null, "", "#" + page);
    // Expose for the sign-in modal / magic link consumer.
    window.__navigate = setPage;
  }, [page]);

  // React to back/forward.
  React.useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || "").replace(/^#/, "");
      if (h && PAGE_IDS.includes(h) && h !== page) setPage(h);
      else if (!h && page !== "home") setPage("home");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
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
    profile:   <DashboardPage setPage={setPage}/>,
    dashboard: <DashboardPage setPage={setPage}/>,
    book:      <BookPage      setPage={setPage}/>,
    media:     <MediaPage     setPage={setPage}/>,
    parents:   <ParentsPage   setPage={setPage}/>,
    volunteers:<VolunteersPage setPage={setPage}/>,
    join:      <JoinPage      setPage={setPage}/>,
    blog:      <BlogPage      setPage={setPage}/>,
    admin:     <AdminPage     setPage={setPage}/>,
  };

  // Admin uses its own chrome — no public topnav/footer.
  if (page === "admin") {
    return (
      <div className="app-shell app-shell-admin">
        <SkipLink/>
        {pages.admin}
        <ToastHost/>
        <CommandPalette/>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SkipLink/>
      <ScrollProgress/>
      <TopNav page={page} setPage={setPage}/>
      <main id="main" style={{flex:1}}>
        <PageTransition pageKey={page}>
          {pages[page] || pages.home}
        </PageTransition>
      </main>
      <Footer setPage={setPage}/>
      <BackToTop/>
      <ToastHost/>
      <CommandPalette/>

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
