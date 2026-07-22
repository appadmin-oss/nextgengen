/* ================================================================
   NGG — Summer School centre pages

   Public, immersive landing pages for each Summer School centre.

     /centres            → the directory of published centres
     /centres/<slug>     → one centre's immersive page (giant hero
                           model image, tagline, story, gallery, find-us)

   The centres page owns its URL subtree: app.jsx resolves any
   /centres* path to page id "centres" and skips the address-bar
   rewrite so a deep-linked slug survives refresh + sharing. This
   component reads the slug from the pathname, navigates internally
   via pushState, and reacts to back/forward through popstate.
   ================================================================ */

const CENTRES_BASE = "/centres";

// Parse the current pathname into {view, slug}. /centres → index;
// /centres/<slug> → detail. Anything deeper collapses to its first slug.
function parseCentrePath() {
  const parts = (window.location.pathname || "").split("/").filter(Boolean);
  // parts[0] === "centres"
  const slug = (parts[1] || "").toLowerCase();
  return slug ? { view: "detail", slug } : { view: "index", slug: "" };
}

function CentresPage({ setPage }) {
  const [route, setRoute] = React.useState(parseCentrePath);

  // Back/forward within the /centres subtree (app.jsx's own popstate handler
  // no-ops because the page id doesn't change) — re-parse here.
  React.useEffect(() => {
    const onPop = () => setRoute(parseCentrePath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Internal navigation: push a clean URL and swap the view without a reload.
  const go = React.useCallback((path) => {
    if (window.location.pathname !== path) history.pushState({ page: "centres" }, "", path);
    setRoute(parseCentrePath());
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <div className="page centre-page">
      {route.view === "detail"
        ? <CentreDetail slug={route.slug} go={go} setPage={setPage}/>
        : <CentresIndex go={go} setPage={setPage}/>}
    </div>
  );
}

/* ---- Directory: every published centre ---- */
function CentresIndex({ go, setPage }) {
  const [state, setState] = React.useState({ loading: true, centres: [], err: false });
  React.useEffect(() => {
    let alive = true;
    NGGApi.public.centres()
      .then(r => { if (alive) setState({ loading: false, centres: r.centres || [], err: false }); })
      .catch(() => { if (alive) setState({ loading: false, centres: [], err: true }); });
    return () => { alive = false; };
  }, []);

  const { loading, centres, err } = state;

  return (
    <React.Fragment>
      <section className="centres-intro" data-screen-label="Summer School centres">
        <div className="container">
          <div className="mono centres-eyebrow">LCASP 2026 · ÌLÚ Ẹ̀KÒ · EMPOWERED 360°</div>
          <h1 className="display centres-intro-h">Find your centre.<br/>Show up. Stand out.</h1>
          <p className="centres-intro-p">
            The Lagos Child After-School Programme runs across neighbourhood
            centres. Each one is a room with high ceilings — mentors, tracks and
            a crew of teenagers who don't dey settle for less. Pick yours.
          </p>
        </div>
      </section>

      <section className="centres-list-wrap">
        <div className="container">
          {loading ? (
            <div className="centres-grid" aria-hidden="true">
              {[0, 1, 2].map(i => <div key={i} className="centre-card centre-card-skeleton"/>)}
            </div>
          ) : err ? (
            <div className="centres-empty">
              <p>We couldn't load the centres just now. Please try again in a moment.</p>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
            </div>
          ) : centres.length === 0 ? (
            <div className="centres-empty">
              <p>No centre pages are live yet — check back soon, or apply and we'll place you.</p>
              <button className="btn btn-primary btn-lg" onClick={() => setPage("join")}>Apply for a session →</button>
            </div>
          ) : (
            <div className="centres-grid">
              {centres.map(c => <CentreCard key={c.slug} c={c} go={go}/>)}
            </div>
          )}
        </div>
      </section>
    </React.Fragment>
  );
}

function CentreCard({ c, go }) {
  const accent = c.color || "#76B043";
  const href = CENTRES_BASE + "/" + c.slug;
  const onClick = (e) => { e.preventDefault(); go(href); };
  return (
    <a
      href={href}
      className="centre-card"
      onClick={onClick}
      style={{ "--centre-accent": accent }}
    >
      <div className="centre-card-media">
        {c.heroImageUrl
          ? <img src={c.heroImageUrl} alt={"A student at the " + c.name + " centre"} loading="lazy"/>
          : <div className="centre-card-media-fallback" aria-hidden="true">{(c.code || c.name || "•").slice(0, 3)}</div>}
        <span className="centre-card-badge mono">{c.code}</span>
      </div>
      <div className="centre-card-body">
        {c.area && <div className="mono centre-card-area">{c.area}</div>}
        <h3 className="centre-card-name">{c.name}</h3>
        {c.tagline && <p className="centre-card-tag">{c.tagline}</p>}
        <div className="centre-card-foot">
          {c.meetDays && <span className="chip centre-chip">{c.meetDays}{c.meetTime ? " · " + c.meetTime : ""}</span>}
          <span className="centre-card-cta">Explore →</span>
        </div>
      </div>
    </a>
  );
}

/* ---- Detail: one centre's immersive page ---- */
function CentreDetail({ slug, go, setPage }) {
  const [state, setState] = React.useState({ loading: true, centre: null, notFound: false });

  React.useEffect(() => {
    let alive = true;
    setState({ loading: true, centre: null, notFound: false });
    NGGApi.public.centre(slug)
      .then(r => { if (alive) setState({ loading: false, centre: r.centre, notFound: false }); })
      .catch(() => { if (alive) setState({ loading: false, centre: null, notFound: true }); });
    return () => { alive = false; };
  }, [slug]);

  // Per-centre SEO — title, description, canonical + OG once data lands. App's
  // route effect set the index defaults; this overrides them for the detail.
  React.useEffect(() => {
    const c = state.centre;
    if (!c) return;
    const title = c.name + " · Summer School centre · NGG";
    const desc = c.tagline || c.headline || ("The " + c.name + " Summer School centre — LCASP 2026.");
    const url = "https://next.afrovanguard.org.ng" + CENTRES_BASE + "/" + c.slug;
    document.title = title;
    const setMeta = (sel, attr, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute(attr, val); };
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('link[rel="canonical"]', "href", url);
    if (c.heroImageUrl) setMeta('meta[property="og:image"]', "content", c.heroImageUrl);
  }, [state.centre]);

  if (state.loading) {
    return <div className="centre-detail-loading"><div className="dash-spinner"/></div>;
  }
  if (state.notFound || !state.centre) {
    return (
      <section className="centres-empty centre-detail-404">
        <div className="container">
          <div className="mono centres-eyebrow">404 · NO CENTRE HERE</div>
          <h1 className="display">That centre isn't live yet.</h1>
          <p>The link may have changed, or the page hasn't been published. See every open centre instead.</p>
          <div className="centre-detail-404-actions">
            <button className="btn btn-primary btn-lg" onClick={() => go(CENTRES_BASE)}>All centres →</button>
            <button className="btn btn-ghost btn-lg" onClick={() => setPage("join")}>Apply for a session</button>
          </div>
        </div>
      </section>
    );
  }

  const c = state.centre;
  const accent = c.color || "#76B043";
  const paras = String(c.story || "").split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean);
  const hasWa = /^https:\/\//i.test(c.whatsappUrl || "");
  const capacityLeft = c.capacity > 0 ? Math.max(0, c.capacity - (c.enrolled || 0)) : null;

  return (
    <article className="centre-immersive" style={{ "--centre-accent": accent }}>
      {/* ---- Giant hero: model image + display type ---- */}
      <section className="centre-hero" data-screen-label={c.name + " centre"}>
        <div className="centre-hero-bg" aria-hidden="true"/>
        <div className="container centre-hero-inner">
          <div className="centre-hero-copy">
            <button className="centre-hero-back mono" onClick={() => go(CENTRES_BASE)}>← All centres</button>
            {c.tagline && <div className="mono centre-hero-eyebrow">{c.tagline}</div>}
            <h1 className="display centre-hero-h">{c.headline || c.name}</h1>
            <div className="centre-hero-name">
              <span className="centre-hero-code mono">{c.code}</span>
              <span>{c.name}{c.area ? " · " + c.area : ""}</span>
            </div>
            <div className="centre-hero-actions">
              <button className="btn btn-gold btn-lg" onClick={() => setPage("join")}>Apply to this centre →</button>
              {hasWa && <a className="btn btn-on-dark-ghost btn-lg" href={c.whatsappUrl} target="_blank" rel="noopener noreferrer">Join the group</a>}
            </div>
          </div>
          <div className="centre-hero-figure">
            {c.heroImageUrl
              ? <img className="centre-hero-img" src={c.heroImageUrl} alt={"A student of the " + c.name + " centre"}/>
              : <div className="centre-hero-img centre-hero-img-fallback" aria-hidden="true">{(c.code || "•")}</div>}
          </div>
        </div>
      </section>

      {/* ---- Live stat strip ---- */}
      <section className="centre-stats">
        <div className="container centre-stats-row">
          <div className="centre-stat">
            <div className="centre-stat-n">{c.enrolled || 0}</div>
            <div className="mono centre-stat-l">Enrolled this cohort</div>
          </div>
          {c.meetDays && (
            <div className="centre-stat">
              <div className="centre-stat-n centre-stat-n-sm">{c.meetDays}</div>
              <div className="mono centre-stat-l">{c.meetTime || "Meets weekly"}</div>
            </div>
          )}
          {capacityLeft != null && (
            <div className="centre-stat">
              <div className="centre-stat-n">{capacityLeft}</div>
              <div className="mono centre-stat-l">{capacityLeft === 0 ? "Waitlist open" : "Spots left"}</div>
            </div>
          )}
        </div>
      </section>

      {/* ---- Story ---- */}
      {paras.length > 0 && (
        <section className="centre-story">
          <div className="container centre-story-inner">
            <div className="mono centre-section-eyebrow">THE CENTRE</div>
            {paras.map((p, i) => <p key={i} className="centre-story-p">{p}</p>)}
          </div>
        </section>
      )}

      {/* ---- Gallery ---- */}
      {(c.gallery || []).length > 0 && (
        <section className="centre-gallery">
          <div className="container">
            <div className="mono centre-section-eyebrow">IN THE ROOM</div>
            <div className="centre-gallery-grid">
              {c.gallery.map((src, i) => (
                <figure key={i} className="centre-gallery-item">
                  <img src={src} alt={c.name + " — moment " + (i + 1)} loading="lazy"/>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- Find us ---- */}
      <section className="centre-find">
        <div className="container centre-find-inner">
          <div className="centre-find-card">
            <div className="mono centre-section-eyebrow">FIND US</div>
            <dl className="centre-find-list">
              {c.area && <div className="centre-find-row"><dt>Area</dt><dd>{c.area}</dd></div>}
              {c.address && <div className="centre-find-row"><dt>Address</dt><dd>{c.address}</dd></div>}
              {(c.meetDays || c.meetTime) && <div className="centre-find-row"><dt>Meets</dt><dd>{[c.meetDays, c.meetTime].filter(Boolean).join(" · ")}</dd></div>}
              {c.lead && (c.lead.name || c.lead.handle) && (
                <div className="centre-find-row"><dt>Centre lead</dt><dd>{c.lead.name || c.lead.handle}{c.lead.role ? " · " + c.lead.role : ""}</dd></div>
              )}
            </dl>
          </div>
          <div className="centre-find-cta">
            <h2 className="display centre-find-h">The room is open.<br/>Are you in?</h2>
            <div className="centre-find-actions">
              <button className="btn btn-primary btn-lg" onClick={() => setPage("join")}>Apply for a session →</button>
              {hasWa && <a className="btn btn-ghost btn-lg" href={c.whatsappUrl} target="_blank" rel="noopener noreferrer">Join the WhatsApp group</a>}
              <button className="btn btn-ghost btn-lg" onClick={() => go(CENTRES_BASE)}>See other centres</button>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

Object.assign(window, { CentresPage, CentresIndex, CentreCard, CentreDetail });
