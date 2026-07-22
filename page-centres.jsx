/* ================================================================
   NGG — Summer School centre pages

   Public, immersive landing pages for each Summer School centre.

     /centres            → the directory of published centres
     /centres/<slug>     → one centre's immersive page

   The centre's colour code (centres.color) drives the hero
   background; the hero text colour is derived from it at render
   time (highest-contrast of ink/paper — see centreInk) so a centre
   can switch to any accent and the copy stays readable. (The native
   CSS contrast-color() isn't safely baseline across our build
   targets yet, so we compute it in JS where we already hold the hex.)

   Signed-in admins can add + position the giant hero image directly
   from the page (upload, drag to set the focal point, save).

   Meeting days/times are intentionally never shown here (a
   safeguarding choice); admins still manage them for status boards.
   ================================================================ */

const CENTRES_BASE = "/centres";
const ILU_EKO = "ÌLÚ Ẹ̀KÒ";     // the campaign motif shown as the hero watermark

/* ---- Contrast helpers: pick a readable ink for a dynamic bg ---- */
function centreHexToRgb(h) {
  h = String(h || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const n = parseInt(h || "000000", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function centreRelLum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function centreContrast(a, b) {
  const L1 = centreRelLum(centreHexToRgb(a)), L2 = centreRelLum(centreHexToRgb(b));
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
// Returns the CSS custom properties that theme the hero for a given accent.
function centreInk(accent) {
  const DARK = "#0c1432", LIGHT = "#fbf7ed";
  const bgLight = centreContrast(accent, DARK) >= centreContrast(accent, LIGHT);
  const base = bgLight ? "12,20,50" : "251,247,237";
  // The decorative circle behind the model is a SOLID navy almost always — a
  // fixed brand element, not tinted by the accent. It only flips to paper when
  // the accent sits so close to navy the two would cancel out (a rare case);
  // the ring then takes the opposite so it always reads against the orb.
  const orbNavyReads = centreContrast(accent, DARK) >= 1.6;
  return {
    "--centre-accent": accent,
    "--centre-ink": bgLight ? DARK : LIGHT,
    "--centre-on-ink": bgLight ? "#ffffff" : "#0c1432",
    "--centre-ink-soft": "rgba(" + base + ",0.74)",
    "--centre-ink-line": "rgba(" + base + ",0.34)",
    "--centre-back-bg": "rgba(" + base + ",0.12)",
    "--centre-orb": orbNavyReads ? DARK : LIGHT,
    "--centre-ring": orbNavyReads ? LIGHT : DARK,
  };
}

function parseCentrePath() {
  const parts = (window.location.pathname || "").split("/").filter(Boolean);
  const slug = (parts[1] || "").toLowerCase();
  return slug ? { view: "detail", slug } : { view: "index", slug: "" };
}

function CentresPage({ setPage }) {
  const [route, setRoute] = React.useState(parseCentrePath);
  React.useEffect(() => {
    const onPop = () => setRoute(parseCentrePath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
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
        <div className="centres-intro-glow" aria-hidden="true"/>
        <div className="container">
          <div className="mono centres-eyebrow"><span className="centres-live-dot" aria-hidden="true"/>LCASP 2026 · ÌLÚ Ẹ̀KÒ · EMPOWERED 360°</div>
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
            <div className="centres-grid" aria-hidden="true">{[0, 1, 2].map(i => <div key={i} className="centre-card centre-card-skeleton"/>)}</div>
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
              <div className="centre-card centre-card-soon">
                <div className="centre-card-media centre-card-soon-media" aria-hidden="true"><span className="mono">next centre</span></div>
                <div className="centre-card-body">
                  <div className="mono centre-card-area">Lagos</div>
                  <h3 className="centre-card-name centre-card-soon-name">Your neighbourhood?</h3>
                  <p className="centre-card-tag">We open new centres where the demand is loudest.</p>
                  <div className="centre-card-foot"><button className="centre-card-cta centre-card-cta-soon" onClick={() => setPage("contact")}>Nominate a centre →</button></div>
                </div>
              </div>
            </div>
          )}
          <div className="centres-cta-band">
            <div>
              <h2 className="display centres-cta-h">Not sure which room is yours?</h2>
              <p className="centres-cta-p">Apply once — we'll place you at the nearest centre with a spot.</p>
            </div>
            <button className="btn btn-primary btn-lg centres-cta-btn" onClick={() => setPage("join")}>Apply for a session →</button>
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}

function CentreCard({ c, go }) {
  const accent = c.color || "#76B043";
  const href = CENTRES_BASE + "/" + c.slug;
  return (
    <a href={href} className="centre-card" onClick={(e) => { e.preventDefault(); go(href); }} style={{ "--centre-accent": accent }}>
      <div className="centre-card-media">
        {c.heroImageUrl
          ? <img src={c.heroImageUrl} alt={"A student at the " + c.name + " centre"} loading="lazy" style={{ objectPosition: c.heroPosition || "bottom center" }}/>
          : <div className="centre-card-media-fallback" aria-hidden="true">{(c.code || c.name || "•").slice(0, 3)}</div>}
        <span className="centre-card-badge mono">{c.code}</span>
      </div>
      <div className="centre-card-body">
        {c.area && <div className="mono centre-card-area">{c.area}</div>}
        <h3 className="centre-card-name">{c.name}</h3>
        {c.tagline && <p className="centre-card-tag">{c.tagline}</p>}
        <div className="centre-card-foot">
          <span className="chip centre-chip">{(c.enrolled || 0) > 0 ? c.enrolled + " enrolled" : "Now enrolling"}</span>
          <span className="centre-card-cta">Explore →</span>
        </div>
      </div>
    </a>
  );
}

/* ---- Detail: one centre's immersive page ---- */
function CentreDetail({ slug, go, setPage }) {
  const [state, setState] = React.useState({ loading: true, centre: null, notFound: false });
  const auth = (typeof useAuth === "function") ? useAuth() : null;
  const canEdit = !!(auth && auth.isSignedIn && (auth.isAdmin || (auth.hasCap && auth.hasCap("summer"))));

  React.useEffect(() => {
    let alive = true;
    setState({ loading: true, centre: null, notFound: false });
    NGGApi.public.centre(slug)
      .then(r => { if (alive) setState({ loading: false, centre: r.centre, notFound: false }); })
      .catch(() => { if (alive) setState({ loading: false, centre: null, notFound: true }); });
    return () => { alive = false; };
  }, [slug]);

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

  if (state.loading) return <div className="centre-detail-loading"><div className="dash-spinner"/></div>;
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
  const patch = (fields) => setState(s => ({ ...s, centre: { ...s.centre, ...fields } }));
  const accent = c.color || "#76B043";
  const paras = String(c.story || "").split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean);
  const hasWa = /^https:\/\//i.test(c.whatsappUrl || "");
  const capacityLeft = c.capacity > 0 ? Math.max(0, c.capacity - (c.enrolled || 0)) : null;
  const lead = c.lead && (c.lead.name || c.lead.handle) ? c.lead : null;
  const top = c.topStudents || [];
  const needs = c.needs || { volunteers: [], materials: [] };
  const hasNeeds = (needs.volunteers || []).length > 0 || (needs.materials || []).length > 0;
  const wmLine = (ILU_EKO + " · ").repeat(12);
  const wmLines = 7; // fill the hero densely
  const avatarTones = ["linear-gradient(135deg,#a8d91a,#1c2a5e)", "linear-gradient(135deg,#f5b026,#ff5a3c)", "linear-gradient(135deg,#b07cff,#1c2a5e)", "linear-gradient(135deg,#d0ff3a,#1c2a5e)"];
  const rankColors = ["#e4032b", "#c0361c", "#8088a6", "#b8bfd6"];
  const rootStyle = { ...centreInk(accent) };

  return (
    <article className="centre-immersive" style={rootStyle}>
      {/* ---- Giant hero ---- */}
      <section className="centre-hero" data-screen-label={c.name + " centre"}>
        <div className="centre-hero-bg" aria-hidden="true">
          <div className="centre-hero-wash"/>
          <div className="centre-hero-orb"/>
          <div className="centre-hero-ring"/>
          <div className="centre-hero-watermark">
            {Array.from({ length: wmLines }).map((_, i) => (
              <span key={i} className="centre-hero-wm-line">{wmLine}</span>
            ))}
          </div>
        </div>
        <div className="container centre-hero-inner">
          <div className="centre-hero-copy">
            <button className="centre-hero-back mono" onClick={() => go(CENTRES_BASE)}>← All centres</button>
            <div className="mono centre-hero-eyebrow">
              <span className="centre-hero-pulse" aria-hidden="true"/>
              {c.tagline || "LCASP 2026 · EMPOWERED 360°"}
            </div>
            <h1 className="display centre-hero-h">{c.headline || c.name}</h1>
            <div className="centre-hero-underline" aria-hidden="true"/>
            <div className="centre-hero-name">
              <span className="centre-hero-code mono">{c.code}</span>
              <span>{c.name}</span>
            </div>
            <div className="centre-hero-actions">
              <button className="btn btn-lg centre-btn-ink" onClick={() => setPage("join")}>Apply to this centre →</button>
              {hasWa && <a className="btn btn-lg centre-btn-outline-ink" href={c.whatsappUrl} target="_blank" rel="noopener noreferrer">Join the group</a>}
            </div>
          </div>
          <CentreHeroFigure c={c} canEdit={canEdit} onSaved={patch}/>
        </div>
      </section>

      {/* ---- Mobile CTA band (navy, below the hero — matches the mobile design) ---- */}
      <section className="centre-hero-cta">
        <button className="btn btn-lg centre-btn-accent" onClick={() => setPage("join")}>Apply to this centre →</button>
        {hasWa && <a className="btn btn-lg centre-btn-outline-light" href={c.whatsappUrl} target="_blank" rel="noopener noreferrer">Join the group</a>}
      </section>

      {/* ---- Live stat strip (no meeting days) ---- */}
      <section className="centre-stats">
        <div className="container centre-stats-row">
          <div className="centre-stat">
            <div className="centre-stat-n">{c.enrolled || 0}</div>
            <div className="mono centre-stat-l">Enrolled this cohort</div>
          </div>
          {capacityLeft != null && (
            <div className="centre-stat">
              <div className="centre-stat-n">{capacityLeft}</div>
              <div className="mono centre-stat-l">{capacityLeft === 0 ? "Waitlist open" : "Spots left"}</div>
            </div>
          )}
          {lead && (
            <div className="centre-stat">
              <div className="centre-stat-n centre-stat-n-sm">{lead.name || lead.handle}</div>
              <div className="mono centre-stat-l">Centre lead</div>
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

      {/* ---- Centre lead + Top students ---- */}
      {(lead || top.length > 0) && (
        <section className="centre-people">
          <div className="container centre-people-grid">
            {lead && (
              <div className="centre-lead">
                <div className="mono centre-section-eyebrow">CENTRE LEAD</div>
                <div className="centre-lead-card">
                  <div className="centre-lead-portrait">
                    {lead.face
                      ? <img src={lead.face} alt={"Centre lead " + (lead.name || "")}/>
                      : <span className="centre-lead-initial" aria-hidden="true">{lead.initial || "★"}</span>}
                  </div>
                  <div className="centre-lead-body">
                    <div className="centre-lead-namerow">
                      <span className="centre-lead-name">{lead.name || lead.handle}</span>
                      <span className="centre-lead-badge mono">LEAD</span>
                    </div>
                    <div className="centre-lead-role">{[cap(lead.role), lead.faculty].filter(Boolean).join(" · ") || "Centre lead"}</div>
                    <button className="centre-lead-link mono" onClick={() => setPage("mentors")}>Meet the mentors →</button>
                  </div>
                </div>
              </div>
            )}
            {top.length > 0 && (
              <div className="centre-top">
                <div className="centre-top-head">
                  <div className="mono centre-section-eyebrow">TOP STUDENTS · THIS COHORT</div>
                  <span className="mono centre-top-by">by XP</span>
                </div>
                <div className="centre-top-list">
                  {top.map((s, i) => (
                    <div key={i} className="centre-top-row">
                      <span className="centre-top-rank" style={{ color: rankColors[i] || "#b8bfd6" }}>{s.rank}</span>
                      <span className="centre-top-avatar" style={{ background: avatarTones[i % avatarTones.length] }}>{(s.first || "•").charAt(0)}</span>
                      <div className="centre-top-meta">
                        <div className="centre-top-name">{s.first} {s.initial}{s.track ? <span className="centre-top-track"> · {s.track}</span> : null}</div>
                        <div className="mono centre-top-sub">Level {s.level} · {s.badges} badge{s.badges === 1 ? "" : "s"}{s.streak ? " · " + s.streak + "-day streak" : ""}</div>
                      </div>
                      <div className="centre-top-xp"><div className="centre-top-xp-n">{s.xp.toLocaleString()}</div><div className="mono centre-top-xp-l">XP</div></div>
                    </div>
                  ))}
                </div>
                <button className="centre-top-link mono" onClick={() => setPage("community")}>See the full leaderboard →</button>
              </div>
            )}
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
                <figure key={i} className="centre-gallery-item"><img src={src} alt={c.name + " — moment " + (i + 1)} loading="lazy"/></figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- What the centre needs ---- */}
      {hasNeeds && (
        <section className="centre-needs">
          <div className="container centre-needs-inner">
            <div className="centre-needs-copy">
              <div className="mono centre-section-eyebrow centre-needs-eyebrow">HOW YOU CAN HELP</div>
              <h2 className="display centre-needs-h">This centre needs a hand.</h2>
              <p className="centre-needs-p">Every Saturday runs on volunteers and kit. Here's what {c.name} is short on right now — step in where you can.</p>
              <div className="centre-needs-actions">
                <button className="btn btn-primary btn-lg" onClick={() => setPage("volunteer")}>Volunteer at this centre →</button>
                <button className="btn btn-ghost btn-lg" onClick={() => setPage("v-status")}>See the full board</button>
              </div>
            </div>
            <div className="centre-needs-cols">
              {(needs.volunteers || []).length > 0 && (
                <div className="centre-needs-block">
                  <div className="mono centre-needs-label">People needed</div>
                  <ul className="centre-needs-list">
                    {needs.volunteers.map((v, i) => (
                      <li key={i} className="centre-need-row"><span className="centre-need-name">{cap(v.role)}s</span><span className="centre-need-gap">{v.gap} needed</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {(needs.materials || []).length > 0 && (
                <div className="centre-needs-block">
                  <div className="mono centre-needs-label">Materials needed</div>
                  <ul className="centre-needs-list">
                    {needs.materials.map((m, i) => (
                      <li key={i} className="centre-need-row"><span className="centre-need-name">{m.item}</span><span className="centre-need-gap">{m.open ? (m.filled > 0 ? m.filled + " so far" : "Any welcome") : m.gap + (m.unit ? " " + m.unit : "") + " to go"}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---- Find us (no meeting days) ---- */}
      <section className="centre-find">
        <div className="container centre-find-inner">
          <div className="centre-find-card">
            <div className="mono centre-section-eyebrow">FIND US</div>
            <dl className="centre-find-list">
              {c.area && <div className="centre-find-row"><dt>Area</dt><dd>{c.area}</dd></div>}
              {c.address && <div className="centre-find-row"><dt>Address</dt><dd>{c.address}</dd></div>}
              {lead && <div className="centre-find-row"><dt>Centre lead</dt><dd>{(lead.name || lead.handle)}{lead.role ? " · " + cap(lead.role) : ""}</dd></div>}
            </dl>
          </div>
          <div className="centre-find-cta">
            <h2 className="display centre-find-h">The room is open.<br/>Are you in?</h2>
            <div className="centre-find-actions">
              <button className="btn btn-lg centre-btn-accent" onClick={() => setPage("join")}>Apply for a session →</button>
              {hasWa && <a className="btn btn-lg centre-btn-outline-light" href={c.whatsappUrl} target="_blank" rel="noopener noreferrer">Join the WhatsApp group</a>}
              <button className="btn btn-lg centre-btn-outline-light" onClick={() => go(CENTRES_BASE)}>See other centres</button>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

/* ---- Hero figure — the giant model image + (admin) inline add/position ---- */
function CentreHeroFigure({ c, canEdit, onSaved }) {
  const [editing, setEditing] = React.useState(false);
  const [url, setUrl] = React.useState(c.heroImageUrl || "");
  const [pos, setPos] = React.useState(c.heroPosition || "center bottom");
  const [centreId, setCentreId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const boxRef = React.useRef(null);

  React.useEffect(() => { setUrl(c.heroImageUrl || ""); setPos(c.heroPosition || "center bottom"); }, [c.heroImageUrl, c.heroPosition]);

  const enterEdit = async () => {
    if (!centreId) {
      try {
        const r = await NGGApi.admin.registration.centres();
        const match = (r.centres || []).find(x => x.slug === c.slug || x.name === c.name);
        if (!match) { toast.error("Couldn't find this centre in the admin list."); return; }
        setCentreId(match.centreId);
      } catch (e) { toast.error("Sign in to the Control Room first."); return; }
    }
    setEditing(true);
  };

  // Drag anywhere on the image to set the focal point (object-position %).
  const onMove = (clientX, clientY) => {
    const el = boxRef.current; if (!el) return;
    const b = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round((clientX - b.left) / b.width * 100)));
    const y = Math.max(0, Math.min(100, Math.round((clientY - b.top) / b.height * 100)));
    setPos(x + "% " + y + "%");
  };
  const onDown = (e) => { if (!editing) return; setDrag(true); const t = e.touches ? e.touches[0] : e; onMove(t.clientX, t.clientY); };
  const onDragMove = (e) => { if (!drag) return; const t = e.touches ? e.touches[0] : e; onMove(t.clientX, t.clientY); e.preventDefault && e.preventDefault(); };
  const onUp = () => setDrag(false);

  const save = async () => {
    if (!centreId) return;
    setSaving(true);
    try {
      await NGGApi.admin.registration.centreUpsert({ centreId, name: c.name, code: c.code, color: c.color, heroImageUrl: url.trim(), heroPosition: pos });
      toast.success("Hero image saved.");
      onSaved({ heroImageUrl: url.trim(), heroPosition: pos });
      setEditing(false);
    } catch (e) { toast.error(e.code === "bad_image" ? "Image links must start with https://" : (e.code || e.message)); }
    finally { setSaving(false); }
  };
  const cancel = () => { setUrl(c.heroImageUrl || ""); setPos(c.heroPosition || "center bottom"); setEditing(false); };

  return (
    <div
      className={"centre-hero-figure" + (editing ? " is-editing" : "")}
      ref={boxRef}
      onMouseMove={onDragMove} onMouseUp={onUp} onMouseLeave={onUp}
      onTouchMove={onDragMove} onTouchEnd={onUp}
    >
      <div className="centre-hero-figure-ring" aria-hidden="true"/>
      <div className="centre-hero-sts" aria-hidden="true">STREET TO<br/>STARDOM</div>
      {url
        ? <img className="centre-hero-img" src={url} alt={"A student of the " + c.name + " centre"} style={{ objectPosition: pos, cursor: editing ? (drag ? "grabbing" : "grab") : "default" }} onMouseDown={onDown} onTouchStart={onDown} draggable={false}/>
        : <div className="centre-hero-img centre-hero-img-fallback" aria-hidden="true">{(c.code || "•")}</div>}

      {canEdit && !editing && (
        <button className="centre-edit-fab" onClick={enterEdit}>✎ {url ? "Edit hero image" : "Add hero image"}</button>
      )}
      {canEdit && editing && (
        <div className="centre-edit-panel" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
          <div className="centre-edit-title mono">HERO IMAGE</div>
          <div className="centre-edit-row">
            <Uploader kind="cover" accept="image/*" compact onUploaded={(u) => setUrl(u)}/>
            <span className="centre-edit-hint">or paste a URL:</span>
          </div>
          <input className="centre-edit-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"/>
          <div className="centre-edit-hint">Drag the image to set its focal point. <b>{pos}</b></div>
          <div className="centre-edit-actions">
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPos("center bottom")}>Reset position</button>
            <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Capitalise a role/word for display ("mentor" → "Mentor").
function cap(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

Object.assign(window, { CentresPage, CentresIndex, CentreCard, CentreDetail, CentreHeroFigure });
