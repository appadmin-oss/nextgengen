/* Is this an NGG member (not a Summer School account)? The same rule as the
   server's member_is_ngg(): anything but "summer", in any case or spacing.
   The dashboard used to ask for the exact string "NGG", so an account whose
   type was blank or "ngg" got the old dashboard while the server called it a
   member. */
/* The portals' area colours, one meaning each across all three portals: amber is
   "today / this week", blue is Saturday and the classroom, teal is progress, violet
   is people (mentees, students, mentors), slate is admin. None is a status colour,
   and each passes 4.5:1 as text on white. The member portal's MP9_ACCENT uses the same. */
const PORTAL_HUE = { amber: "#a15c07", blue: "#1d4ed8", teal: "#0f766e", violet: "#6d28d9", slate: "#475569" };

function memberIsNgg(m) { return !!m && String(m.type == null ? "NGG" : m.type).trim().toLowerCase() !== "summer"; }

/* ================================================================
   NGG — Shared components
   Loaded as type=text/babel after React + data.js + photos.js
   ================================================================ */

/**
 * A photo URL a card or roster can draw, or "" for none.
 *
 * Photos stored on this site are written to the record as a SITE-RELATIVE
 * address (/api/public/photo.php?p=…, see photo_store_relativise): baking the
 * hostname into every row would break them all on the next move. Renderers
 * that only accepted http(s) URLs treated every one of those as "no photo",
 * and the member card printed an empty panel where the face should be. One
 * test, used everywhere: absolute, site-relative and inline images all draw.
 */
function nggPhotoSrc(u) {
  const s = String(u == null ? "" : u).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s) || /^blob:/i.test(s)) return s;
  if (/^\/(?!\/)/.test(s)) return s;                       // site-relative
  if (/^api\/public\/photo\.php\?/i.test(s)) return "/" + s;  // relative, missing its slash
  return "";
}

const { useState, useEffect, useRef, useMemo } = React;

/* ---- Shared public-data hooks ----
   One fetch per visit, shared by every component that asks (hero badges,
   flagship calendar, footer status, join page). Cache lives at module
   scope so route changes don't refetch. */
const _pubCache = {};
const _pubInflight = {};
function usePublicData(key, fetcher) {
  const [data, setData] = React.useState(_pubCache[key] !== undefined ? _pubCache[key] : null);
  React.useEffect(() => {
    if (_pubCache[key] !== undefined) return;
    let alive = true;
    if (!_pubInflight[key]) {
      _pubInflight[key] = fetcher()
        .then(d => { _pubCache[key] = d; return d; })
        .catch(() => { _pubCache[key] = null; return null; });
    }
    _pubInflight[key].then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [key]);
  return data;
}

/* Current (or next) session — { code, year, name, startDate, endDate,
   isActive, weekOf, totalWeeks } or null. */
function useSession() {
  return usePublicData("session", () =>
    NGGApi.public.session().then(r => r.current || r.next || null));
}

/* Public stats — { activeMembers, missionsVerified, mentors, centres … } or null. */
function useStats() {
  return usePublicData("stats", () =>
    NGGApi.public.stats().then(r => r.stats || null));
}

/* Editable site copy (homepage hero + taglines), admin-managed via Site
   settings. Falls back to {} so callers use their own hardcoded defaults. */
function useSiteContent() {
  return usePublicData("siteContent", () =>
    NGGApi.public.siteContent().then(r => r.site || {}).catch(() => ({}))) || {};
}

/* Human session label, e.g. "SUM · 2026" → falls back to given text. */
function sessionLabel(session, fallback) {
  if (!session) return fallback;
  return (session.name || session.code) + " " + session.year;
}

/* Days until the session starts (0 when live or past). */
function sessionDaysToStart(session) {
  if (!session || !session.startDate) return 0;
  const d = Math.ceil((new Date(session.startDate) - new Date()) / 86400000);
  return Math.max(0, d);
}

/* ── Ink that a background can actually carry ────────────────────────────────
 *
 * Centres, hierarchy tiers and community channels all carry a colour an admin
 * picked in a colour picker, so it can be anything: NGG green, a deep maroon, or
 * a pale yellow. Every surface built on one of those colours hard-coded white
 * text with a drop shadow, which is right for two of those three and unreadable
 * for the third — and a shadow under white text on pale yellow does not rescue
 * it, it just makes a smudge. "It usually works" is not a rule; this is.
 *
 * Relative luminance (sRGB, gamma-corrected), thresholded at 0.42 rather than
 * the screen-perfect 0.5 because ink on card stock reads darker than a backlit
 * pixel — a mid-tone that just carries white on a monitor does not carry it in
 * print, and the ID card shares this function with the screen.
 *
 * Returns the ink, the shadow that belongs with it (none under dark ink — a
 * shadow there is just smudge), and a hairline for when a pale fill needs an
 * edge of its own against a white surface.
 */
/* ── What the screen is currently looking at ─────────────────────────────────
 *
 * The Analyst pane is docked in the admin SHELL, not inside any one section, so
 * it cannot be handed the analytics filters as props — and it should not be,
 * because the point of a docked pane is that it follows whatever is open rather
 * than belonging to one screen.
 *
 * So a section announces its scope and the pane displays exactly what it was
 * told. A section that announces nothing gets a pane that says it is not scoped,
 * which is the truth and is better than a pane implying a filter it cannot see.
 */
const NGG_SCOPE_EVENT = "ngg:scope";
function nggPublishScope(scope) {
  window.__nggScope = scope || null;
  try { window.dispatchEvent(new CustomEvent(NGG_SCOPE_EVENT, { detail: scope || null })); } catch (_) {}
}
function useNggScope() {
  const [s, setS] = React.useState(() => window.__nggScope || null);
  React.useEffect(() => {
    const fn = (e) => setS(e.detail || null);
    window.addEventListener(NGG_SCOPE_EVENT, fn);
    // A section may have published before this mounted — read the latch too.
    setS(window.__nggScope || null);
    return () => window.removeEventListener(NGG_SCOPE_EVENT, fn);
  }, []);
  return s;
}

function inkRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
/** WCAG 2.1 relative luminance. The one place this arithmetic lives. */
function inkLum(hex) {
  const rgb = inkRgb(hex);
  if (!rgb) return null;
  const lin = rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** The WCAG 2.1 contrast ratio between two colours, 1–21. Null if either is
 *  not a hex we can read — a caller deciding whether to warn must be able to
 *  tell "these clash" from "I could not measure this". */
function inkContrast(a, b) {
  const x = inkLum(a), y = inkLum(b);
  if (x == null || y == null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* The luminance at which #10131a and #fff are equally legible on a background.
   Solving 1.05/(L+0.05) = (L+0.05)/(L_dark+0.05) for L_dark = L("#10131a")
   gives L = sqrt(1.05 × 0.0565) − 0.05 = 0.1936, where both inks measure
   4.31:1. Picking the ink by this number is the best either can do.

   It used to be 0.42, which is more than twice the crossover, so every
   background between the two got white text when black was the better choice.
   That is not a rounding difference. #76B043 — the DEFAULT centre colour, the
   one a new centre gets before anybody picks one — measured 2.60:1 with white
   and measures 7.13:1 with black. Six of the eight roster avatar colours and
   four of the five community ones were on the wrong side of it, two of them
   below 3:1, and the same function inks printed ID cards, where nobody finds
   out until a box of them arrives. */
const INK_CROSSOVER_L = 0.1936;

function inkOn(hex) {
  const L = inkLum(hex);
  // Unparseable (a CSS keyword, an rgba() string, a missing value) keeps the old
  // behaviour rather than guessing: white with a shadow, which is what every
  // caller did unconditionally before.
  if (L == null) return { ink: "#fff", shadow: "0 1px 2px rgba(0,0,0,.4)", hairline: "rgba(255,255,255,.55)", light: false };
  return L > INK_CROSSOVER_L
    ? { ink: "#10131a", shadow: "none", hairline: "rgba(0,0,0,.35)", light: true }
    : { ink: "#fff", shadow: "0 1px 2px rgba(0,0,0,.4)", hairline: "rgba(255,255,255,.55)", light: false };
}

/** Is there ANY ink that reads on this colour? Some colours are legible with
 *  neither: they sit in the band where white has gone too dark and black has
 *  not yet gone light enough. Worth saying at the moment somebody picks one,
 *  because by the time it is a centre colour it is on every card that centre
 *  prints. `min` is the ratio to clear — 4.5 for body text, 3 for the large
 *  type a card band is set in. */
function inkIsLegible(hex, min) {
  const best = Math.max(inkContrast(hex, "#ffffff") || 0, inkContrast(hex, "#10131a") || 0);
  return best >= (min || 4.5);
}

/* ── Heavy design libraries, fetched only when a screen actually opens ───────
 *
 * Fabric, Filerobot and TUI come to about 2 MB between them — twice the whole
 * rest of the app. They belong to one admin screen that most people never open,
 * and this app is used on 3G at centres, so none of them may be in the bundle or
 * in the service worker's precache. They are fetched on demand, once, and then
 * they are in the HTTP cache like any other hashed asset.
 *
 * Each entry names the global it defines, which is also how we detect that a
 * script has finished: a <script onload> fires before an IIFE has necessarily
 * assigned its export, and the CSS has to be counted too or the first paint of
 * an editor is unstyled.
 *
 * The version numbers are here rather than only in vendor-build.js because this
 * is the file that has to be right at RUNTIME — if the vendored file is ever
 * swapped for a different major, the global check below is what fails loudly.
 */
const VENDOR_LIBS = {
  // Fabric 7.4.0 — the design canvas. UMD, defines window.fabric.
  fabric: { js: ["/vendor/fabric.min.js"], global: "fabric" },
  /* @vladmandic/human 3.3.6 — the desk's face check (face-check.jsx). Bundles
     its own TensorFlow.js; the models load from /vendor/human/models/. */
  human: { js: ["/vendor/human/human.js"], global: "Human" },
  qrcode: { js: ["/vendor/qrcode.min.js"], global: "qrcode" },
  // KaTeX 0.16.11 — maths typesetting for the Maths Lab (woff2 fonts only).
  katex: { js: ["/vendor/katex/katex.min.js"], css: ["/vendor/katex/katex.min.css"], global: "katex" },
  // Filerobot 5.0.0 — the photo editor. Built by vendor-build.js with React
  // aliased to our page globals, so it must load AFTER React (it always does:
  // React is in the document head, this is fetched from a click).
  filerobot: {
    js: ["/vendor/filerobot-image-editor.min.js"],
    css: ["/vendor/filerobot-image-editor.min.css"],
    global: "FilerobotImageEditor",
    needs: () => !!(window.React && window.ReactDOM && window.ReactDOM.createRoot),
  },
  /* TUI Image Editor 3.15.3 — the second photo engine. Its colour picker is a
     genuine external, so it loads first, in order.
     THE ONE REAL COLLISION IN ALL OF THIS: TUI's dist has Fabric 4.6.0 bundled
     inside its webpack closure AND publishes it to window.fabric as it
     evaluates. Load TUI after the designer and window.fabric silently drops from
     7.4.0 to 4.6.0 — every subsequent Fabric 7 call fails with a "not a
     constructor" a long way from the cause. `isolates` is the fix: see below. */
  tui: {
    js: ["/vendor/tui-color-picker.min.js", "/vendor/tui-image-editor.min.js"],
    css: ["/vendor/tui-color-picker.min.css", "/vendor/tui-image-editor.min.css"],
    global: "tui",
    isolates: ["fabric"],
  },
  // Already vendored for the card studio's batch PDF; the designer wants it too,
  // for a single sheet at its real trim size with crop marks.
  jspdf: { js: ["/vendor/jspdf.umd.min.js"], global: "jspdf" },
  // Reading an .xlsx someone saved from Excel — an upload screen that says
  // "from Excel" and then refuses an Excel file is the screen not working.
  jszip: { js: ["/vendor/jszip.min.js"], global: "JSZip" },
  // A page rendered to an image, for the timetable maker's download.
  html2canvas: { js: ["/vendor/html2canvas.min.js"], global: "html2canvas" },
  /* The card studio's prepress module — imposition, bleed, crop marks, real
     zips. The design studio's data merge produces exactly the artefacts this
     already knows how to lay out, and a second imposition engine written for
     posters would be a second place for the bleed arithmetic to be wrong. */
  /* `ok` names what the callers use. /vendor files keep their names across
     deploys and are cached for a week, so a browser that opened the studio the
     week before a deploy held the OLD card-export.js — without renderFaceFast —
     and every card on every sheet failed to draw ("Nothing could be exported").
     A library that loads without what `ok` asks for is fetched once more,
     past the cache. */
  cardExport: { js: ["/vendor/card-export.js"], global: "CardExport",
    ok: g => typeof g.renderFaceFast === "function" && typeof g.imageFace === "function" && typeof g.buildSheetPDF === "function" },
  /* docx 9.7.1 — a real Word file for the Analyst's report draft. Bundled by
     vendor-build.js because the package is ESM/CJS with no UMD. 414KB, so it is
     fetched by the Export button and never by the page. */
  docx: { js: ["/vendor/docx.min.js"], global: "docx" },
  /* PDF.js 5.4.624, legacy build — the community's document reader.
   *
   * 486KB (151KB gzipped) for the library, and the worker it starts is another
   * 1MB on top. That is a real cost on a Nigerian mobile connection and it was
   * refused once for exactly that reason. It is affordable now only because it
   * is loaded from HERE: nothing fetches it until a member opens a document,
   * and it is fetched once per browser and then cached. A reader who never
   * taps a PDF never pays for any of it.
   *
   * `needs` is not used — pdf.js has no dependency on the page — but the
   * worker path has to be set before the first getDocument(), which the viewer
   * does on the resolved global. */
  pdfjs: { js: ["/vendor/pdfjs.min.js"], global: "pdfjsLib" },
};
const _vendorLoads = {};
/* A vendor file's URL for this build. The production build stamps its id on
   the page (<meta name="ngg-build">), so each deploy asks for the files under a
   new URL and a week-old cached copy cannot be served for them. `bust` forces
   a fresh fetch where there is no build id (the source deploy). */
function nggVendorUrl(url, bust) {
  const m = typeof document !== "undefined" && document.querySelector('meta[name="ngg-build"]');
  const v = bust || (m && m.content) || "";
  return v ? url + (url.indexOf("?") === -1 ? "?" : "&") + "v=" + encodeURIComponent(v) : url;
}
window.nggVendorUrl = nggVendorUrl;
function loadVendorAsset(url, kind) {
  return new Promise((resolve, reject) => {
    const sel = kind === "css" ? 'link[href="' + url + '"]' : 'script[src="' + url + '"]';
    if (document.querySelector(sel)) return resolve();
    const el = document.createElement(kind === "css" ? "link" : "script");
    if (kind === "css") { el.rel = "stylesheet"; el.href = url; } else { el.src = url; el.async = false; }
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => reject(new Error("could not load " + url)), { once: true });
    document.head.appendChild(el);
  });
}
/** Load a design library on demand. Resolves with its global; the same call
 *  twice returns the same promise rather than fetching a megabyte twice. */
function loadVendor(name) {
  const spec = VENDOR_LIBS[name];
  if (!spec) return Promise.reject(new Error("unknown library: " + name));
  const fresh = g => !!g && (!spec.ok || spec.ok(g));
  if (fresh(window[spec.global])) return Promise.resolve(window[spec.global]);
  if (_vendorLoads[name]) return _vendorLoads[name];
  if (spec.needs && !spec.needs()) return Promise.reject(new Error(name + " needs React on the page first"));
  _vendorLoads[name] = (async () => {
    /* Globals this library is known to trample, saved before it evaluates and
       put back after. TUI publishes its bundled Fabric 4.6.0 to window.fabric,
       which would silently downgrade the Fabric 7 the designer is holding — and
       the failure surfaces much later, as a "not a constructor" on an unrelated
       line. It keeps its own internal reference, so restoring ours costs it
       nothing. Cheaper and far more predictable than an iframe. */
    const saved = (spec.isolates || []).map(k => [k, window[k], Object.prototype.hasOwnProperty.call(window, k)]);
    // Stylesheets in parallel; scripts in ORDER, because tui-image-editor reads
    // tui.colorPicker at evaluation time.
    await Promise.all((spec.css || []).map(u => loadVendorAsset(u, "css")));
    for (const u of spec.js) await loadVendorAsset(nggVendorUrl(u), "js");
    if (window[spec.global] && !fresh(window[spec.global])) {
      // A stale copy from the HTTP cache: drop it and fetch past the cache, once.
      try { delete window[spec.global]; } catch (_) { window[spec.global] = undefined; }
      const bust = "r" + Date.now().toString(36);
      for (const u of spec.js) await loadVendorAsset(nggVendorUrl(u, bust), "js");
    }
    saved.forEach(([k, v, had]) => { if (had) window[k] = v; else delete window[k]; });
    if (!window[spec.global]) throw new Error(name + " loaded but did not define window." + spec.global);
    if (!fresh(window[spec.global])) { const e = new Error(name + " is out of date in this browser"); e.code = "vendor_stale"; throw e; }
    return window[spec.global];
  })();
  // A failed load must not be cached as a permanent failure: the usual cause is
  // a flaky connection at a centre, and the fix is pressing the button again.
  _vendorLoads[name].catch(() => { delete _vendorLoads[name]; });
  return _vendorLoads[name];
}

/* ---- Brand mark — uses actual logo PNG ---- */
function BrandLogo({ size = 36, style = {} }) {
  return (
    <img
      src="assets/logo.png"
      alt="Next Generation Genius"
      width={size}
      height={size}
      style={{ display: "block", borderRadius: "50%", ...style }}
    />
  );
}

/* ---- Avatar — DiceBear persona illustrated portrait ---- */
function Avatar({ seed = 0, name = "", size = 44, ring = false, square = false }) {
  const src = portrait(name || String(seed), Math.max(120, size * 2));
  const node = (
    <div style={{
      width: size, height: size,
      borderRadius: square ? 14 : "50%",
      overflow: "hidden",
      flexShrink: 0,
      background: "var(--navy-700)",
      position: "relative",
    }}>
      <img src={src} alt={name} loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
  return ring ? <div className="glow-ring" style={{display:"inline-block"}}>{node}</div> : node;
}

/* ---- Photo — cinematic real image with optional caption + gradient ---- */
function Photo({ src, name, label, ratio = "1/1", style = {}, overlay = false, dark = false, children, eager = false }) {
  const url = src || (name ? scene(name, 1200) : null);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // Stable accent stripe based on the source — gives broken/loading images
  // a recognizable identity instead of a flat block.
  const tint = React.useMemo(() => {
    const s = String(url || name || label || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const palette = dark
      ? ["#1c2a5e", "#2a3a7a", "#131e48", "#1a2454"]
      : ["#f3ecdb", "#e8dec6", "#fbf7ed", "#f5e9c8"];
    return palette[Math.abs(h) % palette.length];
  }, [url, name, label, dark]);

  return (
    <div
      className={"photo-frame " + (loaded ? "is-loaded " : "") + (failed ? "is-failed " : "")}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      style={{
        position: "relative",
        aspectRatio: ratio,
        overflow: "hidden",
        borderRadius: 18,
        background: tint,
        ...style,
        maxWidth: "100%",
      }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={label || name || ""}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchpriority={eager ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(true); setFailed(true); }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: dark ? "brightness(0.85)" : "none",
          }}
        />
      ) : null}
      {/* Skeleton shimmer while the photo is in flight */}
      {!loaded && url && (
        <div className="photo-skel" aria-hidden="true"/>
      )}
      {/* Graceful fallback when the host blocks the image — keeps the
          composition (chip / overlay copy) readable instead of a broken icon. */}
      {failed && (
        <div className="photo-fallback" aria-hidden="true">
          <span className="photo-fallback-mark">◈</span>
        </div>
      )}
      {overlay && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, transparent 35%, rgba(12,20,50,0.78) 100%)"
        }}/>
      )}
      {children}
    </div>
  );
}

/* Old PhotoSlot kept for legacy uses — now silently renders a Photo. */
function PhotoSlot({ label, dark, ratio = "1/1", style, children, name }) {
  return <Photo name={name} label={label} ratio={ratio} dark={dark} style={style}>{children}</Photo>;
}

/* ---- Animated count-up ---- */
function CountUp({ to, duration = 1400, suffix = "" }) {
  const [val, setVal] = useState(0);
  const ref = useRef();
  useEffect(() => {
    let started = false;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started) return;
      started = true;
      const target = parseInt(String(to).replace(/[^0-9]/g, "")) || 0;
      const start = performance.now();
      function tick(t) {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);
  const orig = String(to);
  const hasPlus = orig.endsWith("+");
  const padded = orig.startsWith("0") && val > 0 ? String(val).padStart(orig.replace("+","").length, "0") : String(val);
  return <span ref={ref} className="kpi-num">{padded}{hasPlus ? "+" : ""}{suffix}</span>;
}

/* ---- Chip ---- */
function Tag({ children, variant = "" }) { return <span className={"chip " + variant}>{children}</span>; }

/* ---- Section header ---- */
function SectionHead({ eyebrow, title, sub, align = "left" }) {
  const baseStyle = align === "center" ? { margin: "0 auto 48px", textAlign: "center", alignItems: "center" } : {};
  return (
    <div className="section-h reveal" data-reveal style={baseStyle}>
      {eyebrow && <span className="eyebrow reveal" data-reveal style={{ color: "var(--eyebrow-fg, var(--gold-700))", "--reveal-delay": "0ms" }}>{eyebrow}</span>}
      <h2 className="reveal" data-reveal style={{ "--reveal-delay": "120ms" }}>{title}</h2>
      {sub && <p className="reveal" data-reveal style={{ fontSize: 17, color: "var(--ink-700)", margin: 0, lineHeight: 1.5, maxWidth: 640, "--reveal-delay": "240ms" }}>{sub}</p>}
    </div>
  );
}

/* ---- Progress bar w/ label ---- */
function Progress({ value, label, variant = "" }) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:6, width:"100%"}}>
      {label && <div style={{display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--ink-500)"}}>
        <span>{label}</span><span className="mono">{value}%</span>
      </div>}
      <div className={"progress " + variant}>
        <i style={{ width: `${value}%`, transition: "width calc(0.8s * var(--motion, 1)) cubic-bezier(0.2,0.7,0.2,1)" }} />
      </div>
    </div>
  );
}

/* ---- Mobile drawer auth block ---- */
function DrawerAuthBlock({ go, close }) {
  const { isSignedIn, member, openSignIn, signOut, isAdmin } = useAuth();
  if (!isSignedIn) {
    return (
      <button className="nav-link" onClick={() => { close(); openSignIn(); }}>
        Sign in →
      </button>
    );
  }
  return (
    <React.Fragment>
      <div className="drawer-auth">
        <div className="drawer-auth-avatar">{(member.fullName || "M").charAt(0)}</div>
        <div>
          <div className="drawer-auth-name">{member.fullName}</div>
          <div className="mono drawer-auth-id">{member.memberId}</div>
        </div>
      </div>
      <button className="nav-link" onClick={() => go("dashboard")}>Dashboard</button>
      {isAdmin && <button className="nav-link nav-link-admin" onClick={() => go("admin")}>⚙ Admin console</button>}
      <button className="nav-link nav-link-danger" onClick={async () => { close(); await signOut(); }}>Sign out</button>
    </React.Fragment>
  );
}

/* ---- Top nav auth slot: shows Sign-in button OR member chip + menu. ---- */
function NavAuthSlot({ setPage }) {
  const { isSignedIn, member, loading, openSignIn, signOut, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (loading) {
    return <div className="nav-auth-loading" aria-hidden="true"/>;
  }
  if (!isSignedIn) {
    return (
      <button className="btn btn-ghost btn-sm nav-signin" onClick={() => openSignIn()}>
        Sign in
      </button>
    );
  }
  const first = String(member.fullName || member.memberId || "M").split(" ")[0];
  const initial = first.charAt(0).toUpperCase();
  return (
    <div className="nav-auth" ref={menuRef}>
      <button className="nav-auth-trigger" onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen}>
        <span className="nav-auth-avatar">{initial}</span>
        <span className="nav-auth-name">{first}</span>
        <span className="nav-auth-chevron" aria-hidden="true">▾</span>
      </button>
      {menuOpen && (
        <div className="nav-auth-menu" role="menu">
          <div className="nav-auth-menu-head">
            <div className="nav-auth-menu-name">{member.fullName}</div>
            <div className="mono nav-auth-menu-id">{member.memberId}</div>
          </div>
          <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); setPage("dashboard"); }}>Dashboard</button>
          <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); setPage("anchor"); }}>Anchor 12</button>
          <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); setPage("book"); }}>The Anchor book</button>
          {/* The Mentor Portal had no link anywhere in the site — you had to be
              told the URL and type it. A tool nobody can find is a tool nobody
              uses, and this is the surface that records behaviour data every
              session. `portal` is the server's answer to "which view do they
              get" — mentor, instructor or admin — and empty for everyone
              else. */}
          {member.portal && (
            <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); setPage("mentor"); }}>
              <span>★</span> {member.portal === "instructor" ? "Instructor Portal" : "Mentor Portal"}
            </button>
          )}
          {isAdmin && (
            <button className="nav-auth-menu-item nav-auth-menu-admin" onClick={() => { setMenuOpen(false); setPage("admin"); }}>
              <span>⚙</span> Control Room
            </button>
          )}
          {/* Staff manage the console's authenticator in the Control Room; a
              participant's card has no second step (mfa.jsx). */}
          {!isAdmin && member.role !== "student" && (
            <button className="nav-auth-menu-item" onClick={() => { setMenuOpen(false); if (window.nggMfa) window.nggMfa("manage"); }}>
              <span>🛡</span> Two-step sign-in
            </button>
          )}
          <div className="nav-auth-menu-divider"/>
          <button className="nav-auth-menu-item nav-auth-menu-danger" onClick={async () => { setMenuOpen(false); await signOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ---- Notifications bell ---- */
function cmBellAgo(iso) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(String(iso).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? "" : "Z")).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return Math.floor(s / 604800) + "w";
}
function NavBell({ setPage }) {
  const { isSignedIn } = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  const [items, setItems] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const load = React.useCallback(() => {
    if (!isSignedIn) return;
    NGGApi.member.notifications().then(r => setItems(r.notifications || [])).catch(() => {});
  }, [isSignedIn]);
  React.useEffect(() => {
    if (!isSignedIn) { setItems([]); return; }
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(id);
  }, [isSignedIn, load]);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  if (!isSignedIn) return null;
  const unread = items.filter(n => !n.readAt).length;
  const markRead = async (n) => {
    if (n.readAt) return;
    setItems(list => list.map(x => x.notifId === n.notifId ? { ...x, readAt: "1" } : x));
    try { await NGGApi.member.markRead(n.notifId); } catch (_) {}
  };
  const openItem = async (n) => {
    await markRead(n);
    setOpen(false);
    if (n.linkPage === "notice" && n.linkRef) { location.assign("/notice/" + encodeURIComponent(n.linkRef)); return; }
    if (n.linkPage) setPage(n.linkPage);
  };
  const markAll = async () => {
    const un = items.filter(n => !n.readAt);
    setItems(list => list.map(x => ({ ...x, readAt: x.readAt || "1" })));
    for (const n of un) { try { await NGGApi.member.markRead(n.notifId); } catch (_) {} }
  };
  const icon = (kind) => kind && kind.indexOf("mention") >= 0 ? "@" : kind && kind.indexOf("comment") >= 0 ? "💬" : kind && kind.indexOf("community") >= 0 ? "◈" : "•";
  return (
    <div className="nav-bell" ref={ref}>
      <button className="nav-bell-btn" onClick={() => { setOpen(o => !o); if (!open) load(); }} aria-label={"Notifications" + (unread ? " (" + unread + " unread)" : "")} aria-expanded={open}>
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="nav-bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="nav-bell-menu" role="menu">
          <div className="nav-bell-head">
            <span>Notifications</span>
            {unread > 0 && <button className="nav-bell-all" onClick={markAll}>Mark all read</button>}
          </div>
          <div className="nav-bell-list">
            {items.length === 0 ? (
              <div className="nav-bell-empty">You're all caught up ✨</div>
            ) : items.slice(0, 20).map(n => (
              <button key={n.notifId} className={"nav-bell-item" + (n.readAt ? "" : " is-unread")} onClick={() => openItem(n)}>
                <span className="nav-bell-ic">{icon(n.kind)}</span>
                <span className="nav-bell-body">
                  <span className="nav-bell-title">{n.title}</span>
                  {n.body && <span className="nav-bell-text">{n.body}</span>}
                  <span className="nav-bell-ago">{cmBellAgo(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="nav-bell-dot" aria-hidden="true"/>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Top nav ---- */
function TopNav({ page, setPage }) {
  // Primary nav structure — 4 top-level entries plus the right-rail.
  // `mega` items expand to a rich dropdown panel.
  const primary = [
    { id: "home", label: "Home", kind: "link" },
    { id: "programs", kind: "mega", label: "Programs", match: ["summer","club","anchor","book"], items: [
      { id: "anchor",  label: "Anchor 12",       desc: "12-week flagship",         icon: "✦", badge: "FLAGSHIP" },
      { id: "summer",  label: "Summer Students", desc: "The on-ramp · 6 weeks",    icon: "☀" },
      { id: "club",    label: "NGGC",             desc: "Identity society",         icon: "◐" },
      { id: "book",    label: "The Anchor book", desc: "Field manual",              icon: "▢" },
    ]},
    { id: "stay", kind: "mega", label: "The room", match: ["about","community","blog","media","volunteers","parents","contact","timetable","shop","shop-order"], items: [
      { id: "about",      label: "About NGGC",      desc: "The 2040 formation brief", icon: "◆", badge: "2040" },
      { id: "community",  label: "Community",        desc: "The movement, live",      icon: "◈" },
      { id: "blog",       label: "The Journal",     desc: "Stories + essays",        icon: "✎" },
      { id: "media",      label: "Media room",      desc: "Films · podcast · reels", icon: "▶" },
      { id: "mentors",    label: "The mentors",     desc: "Meet the mentor circle",  icon: "◐" },
      { id: "volunteers", label: "Become a mentor", desc: "Volunteer with NGG",      icon: "✚" },
      { id: "parents",    label: "For parents",     desc: "Safeguarding · FAQ",      icon: "♡" },
      { id: "timetable",  label: "Timetable maker", desc: "Design yours, download it", icon: "▦", badge: "FREE" },
      { id: "shop",       label: "Shop",            desc: "Souvenirs and merchandise", icon: "◇" },
      { id: "contact",    label: "Contact",         desc: "Talk to a human",         icon: "✆" },
    ]},
  ];

  const { isSignedIn } = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false };
  const [open, setOpen]       = React.useState(false);
  const [mega, setMega]       = React.useState(null);   // active mega panel id
  const [scrolled, setScroll] = React.useState(false);
  const navRef = React.useRef(null);
  const drawerRef = React.useRef(null);
  const burgerRef = React.useRef(null);
  const megaTimer = React.useRef(0);

  // Mobile drawer focus management — trap Tab inside the open drawer and
  // restore focus to the burger on close (parity with the other modals).
  React.useEffect(() => {
    if (!open) return;
    const panel = drawerRef.current;
    if (!panel) return;
    const first = panel.querySelector('button,a[href],input,[tabindex]:not([tabindex="-1"])');
    if (first) setTimeout(() => { try { first.focus(); } catch (_) {} }, 40);
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const f = panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const a = f[0], b = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (burgerRef.current) { try { burgerRef.current.focus(); } catch (_) {} } };
  }, [open]);

  // Scroll-state — apply solid background when not at top.
  React.useEffect(() => {
    const onScroll = () => setScroll(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Body scroll lock when drawer open
  React.useEffect(() => {
    document.body.classList.toggle("no-scroll", open);
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  // Close drawer + mega on Escape
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); setMega(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside the mega closes it.
  React.useEffect(() => {
    if (!mega) return;
    const onDoc = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setMega(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mega]);

  const go = (id) => { setPage(id); setOpen(false); setMega(null); };

  // Hover-intent: small open delay, longer close delay so cursor can travel.
  const openMega  = (id) => { clearTimeout(megaTimer.current); megaTimer.current = setTimeout(() => setMega(id), 60); };
  const closeMega = ()   => { clearTimeout(megaTimer.current); megaTimer.current = setTimeout(() => setMega(null), 180); };

  const isItemActive = (item) =>
    page === item.id || (item.kind === "mega" && item.match && item.match.indexOf(page) !== -1);

  return (
    <React.Fragment>
      <div ref={navRef} role="banner" className={"topnav" + (scrolled ? " is-scrolled" : "") + (mega ? " has-mega" : "")}>
        <div className="topnav-inner">
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("home"); }} aria-label="Next Generation Genius — Home">
            <BrandLogo size={42}/>
            <div className="brand-word">
              <b>Next Generation Genius</b>
              <span>Afrovanguard · est. 2023</span>
            </div>
          </a>

          <nav className="nav-links" aria-label="Primary navigation">
            {primary.map(item => {
              const active = isItemActive(item);
              if (item.kind === "mega") {
                return (
                  <div
                    key={item.id}
                    className="nav-mega-wrap"
                    onMouseEnter={() => openMega(item.id)}
                    onMouseLeave={closeMega}
                  >
                    <button
                      className={"nav-link nav-link-mega" + (active ? " active" : "") + (mega === item.id ? " is-expanded" : "")}
                      onClick={() => setMega(m => m === item.id ? null : item.id)}
                      aria-haspopup="true"
                      aria-expanded={mega === item.id}
                    >
                      {item.label}
                      <span className="nav-link-chev" aria-hidden="true">▾</span>
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={item.id}
                  className={"nav-link" + (active ? " active" : "")}
                  onClick={() => { setPage(item.id); setMega(null); }}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="nav-right">
            <A11yNavButton/>
            <NavBell setPage={setPage}/>
            <NavAuthSlot setPage={setPage}/>
            {/* Context-aware: signed-in members already belong — the public
                "Apply" CTA gives way to their own dashboard. */}
            <Magnetic strength={6}>
              {isSignedIn
                ? <button className="btn btn-primary btn-sm nav-apply" onClick={() => setPage("dashboard")}>My dashboard →</button>
                : <button className="btn btn-primary btn-sm nav-apply" onClick={() => goApply(setPage, "anchor")}>Apply →</button>}
            </Magnetic>
            <button
              ref={burgerRef}
              className={"nav-burger" + (open ? " is-open" : "")}
              onClick={() => setOpen(v => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              <span className="nav-burger-bars" aria-hidden="true">
                <span/><span/><span/>
              </span>
            </button>
          </div>
        </div>

        {/* Mega panels — rendered inside the nav so hover-bridging works. */}
        {primary.map(item => {
          if (item.kind !== "mega") return null;
          const isOpen = mega === item.id;
          return (
            <div
              key={item.id}
              className={"nav-mega" + (isOpen ? " is-open" : "")}
              onMouseEnter={() => openMega(item.id)}
              onMouseLeave={closeMega}
              aria-hidden={!isOpen}
            >
              <div className="nav-mega-inner">
                <div className="nav-mega-grid">
                  {item.items.map(sub => (
                    <button
                      key={sub.id}
                      className={"nav-mega-item" + (page === sub.id ? " is-active" : "")}
                      onClick={() => go(sub.id)}
                    >
                      <span className="nav-mega-icon" aria-hidden="true">{sub.icon}</span>
                      <span className="nav-mega-body">
                        <span className="nav-mega-label">
                          {sub.label}
                          {sub.badge && <span className="nav-mega-badge">{sub.badge}</span>}
                        </span>
                        <span className="nav-mega-desc">{sub.desc}</span>
                      </span>
                      <span className="nav-mega-arrow" aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
                <div className="nav-mega-foot">
                  <span className="mono">PRESS <kbd>⌘</kbd><kbd>K</kbd> FOR QUICK NAV</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => go("join")}>Apply for a session →</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile drawer */}
      <div className={"mobile-drawer" + (open ? " is-open" : "")} role="dialog" aria-modal="true">
        <div className="mobile-drawer-scrim" onClick={() => setOpen(false)}/>
        <div className="mobile-drawer-panel" ref={drawerRef}>
          <div className="mobile-drawer-head">
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <BrandLogo size={34}/>
              <div className="brand-word">
                <b style={{fontFamily:"var(--font-display)", fontSize:15, fontWeight:800, letterSpacing:"-0.02em"}}>NGG</b>
                <span style={{fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.22em", textTransform:"uppercase", color:"var(--ink-500)", marginTop:2}}>Afrovanguard</span>
              </div>
            </div>
            <button className="mobile-drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
          </div>

          <DrawerAuthBlock go={go} close={() => setOpen(false)}/>

          <button className={"nav-link" + (page === "home" ? " active" : "")} onClick={() => go("home")}>
            <span className="drawer-link-icon">◉</span> Home
          </button>

          <div className="drawer-section">
            <div className="drawer-section-h">PROGRAMS</div>
            {primary.find(p => p.id === "programs").items.map(sub => (
              <button key={sub.id} className={"nav-link" + (page === sub.id ? " active" : "")} onClick={() => go(sub.id)}>
                <span className="drawer-link-icon" aria-hidden="true">{sub.icon}</span>
                {sub.label}
                {sub.badge && <span className="nav-mega-badge" style={{marginLeft:8}}>{sub.badge}</span>}
              </button>
            ))}
          </div>

          <div className="drawer-section">
            <div className="drawer-section-h">THE ROOM</div>
            {primary.find(p => p.id === "stay").items.map(sub => (
              <button key={sub.id} className={"nav-link" + (page === sub.id ? " active" : "")} onClick={() => go(sub.id)}>
                <span className="drawer-link-icon" aria-hidden="true">{sub.icon}</span>
                {sub.label}
              </button>
            ))}
          </div>

          <div className="mobile-drawer-cta">
            <button className="btn btn-primary" onClick={() => go("join")}>Apply for a session →</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ---- Social icons (inline SVGs) ---- */
const SOCIAL_ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.53 3H20.7l-6.93 7.93L22 21h-6.36l-4.99-6.53L4.9 21H1.74l7.41-8.48L1.5 3h6.52l4.51 5.96L17.53 3Zm-1.11 16.2h1.76L7.66 4.69H5.78L16.42 19.2Z"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.23 5 12 5 12 5s-6.23 0-7.81.42A2.51 2.51 0 0 0 2.42 7.19 26.2 26.2 0 0 0 2 12a26.2 26.2 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.77C5.77 19 12 19 12 19s6.23 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77A26.2 26.2 0 0 0 22 12a26.2 26.2 0 0 0-.42-4.81ZM10 15V9l5.2 3-5.2 3Z"/>
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 3a5.6 5.6 0 0 0 4.5 4.5v3a8.5 8.5 0 0 1-4.5-1.3v6.4a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3h3Z"/>
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0H13v1.7a4 4 0 0 1 3.5-1.9c3.6 0 4.5 2.3 4.5 5.4V21h-4v-5.5c0-1.4-.03-3.2-2-3.2s-2.3 1.5-2.3 3.1V21h-4V9.5Z"/>
    </svg>
  ),
};

function SocialLink({ name, href = "#", icon, label }) {
  // Don't render a channel that points at a bare platform homepage (a
  // placeholder handle) — an icon that lands on instagram.com/ reads as broken
  // or fake. It appears only once a real profile URL (with a path) is set.
  let real = false;
  try { const u = new URL(href); real = u.pathname.replace(/\/+$/, "").length > 0; } catch (_) { real = false; }
  if (!real) return null;
  return (
    <a className="footer-social" href={href} aria-label={label} target="_blank" rel="noopener noreferrer">
      {icon}
    </a>
  );
}

/* ---- Newsletter form ---- */
function NewsletterForm({ source = "footer" }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState("idle"); // idle | busy | sent | error
  const [err, setErr]     = React.useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    // Instant client-side check — saves the round-trip and gives specific
    // feedback instead of a generic network error when the API is slow.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setState("error");
      setErr("That email doesn't look right.");
      return;
    }
    setState("busy"); setErr("");
    try {
      await NGGApi.public.newsletter(v, source);
      setState("sent");
      if (typeof toast !== "undefined") toast.success("You're in. Watch your inbox.", "Newsletter");
      setTimeout(() => { setState("idle"); setEmail(""); }, 4200);
    } catch (e) {
      setState("error");
      const code = e.code || e.message;
      const map = {
        rate_limited:        "Too many tries — wait a few minutes.",
        bad_email:           "That email doesn't look right.",
        missing_field_email: "Enter your email first.",
        upstream_unreachable:"We can't reach the server right now.",
      };
      setErr(map[code] || "Couldn't subscribe. Try again.");
      if (typeof toast !== "undefined") toast.error(map[code] || "Couldn't subscribe.", "Newsletter");
    }
  };

  const sent = state === "sent";
  const busy = state === "busy";

  return (
    <div>
      <form className={"newsletter-form" + (sent ? " is-sent" : "")} onSubmit={onSubmit} noValidate>
        <input
          type="email"
          required
          placeholder={sent ? "You're in. Watch your inbox." : "your@email.com"}
          value={sent ? "" : email}
          onChange={e => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          aria-label="Email address"
          aria-invalid={state === "error"}
          disabled={sent || busy}
          autoComplete="email"
        />
        <button type="submit" disabled={busy || !email.trim()}>
          {sent ? "Sent ✓" : busy ? "Sending…" : "Subscribe →"}
        </button>
      </form>
      <div className="newsletter-meta">
        {state === "error"
          ? <span style={{color:"var(--coral)"}}>{err}</span>
          : <>
              <span>MONTHLY · NO SPAM</span>
              <span style={{opacity:0.4}}>·</span>
              <span>UNSUBSCRIBE ANYTIME</span>
            </>}
      </div>
    </div>
  );
}

/* ---- Footer ---- */
function Footer({ setPage, page }) {
  const go = (id) => () => setPage(id);
  // Deep-link into a centre's public page (/centres/<slug>). Pushes the clean
  // URL, then hands off to the centres page (which reads the slug from the
  // path); the synthetic popstate re-parses it even if we're already there.
  const goCentre = (slug) => (e) => {
    if (e) e.preventDefault();
    const path = "/centres/" + slug;
    if (window.location.pathname !== path) history.pushState({ page: "centres" }, "", path);
    setPage("centres");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const auth = (typeof useAuth === "function") ? useAuth() : { isSignedIn: false, member: null };
  const session = useSession();
  const site = useSiteContent();

  // Live, published centres — never hardcoded. Empty until data lands / if none.
  const [centres, setCentres] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.public.centres()
      .then(r => { if (alive) setCentres(r.centres || []); })
      .catch(() => { if (alive) setCentres([]); });
    return () => { alive = false; };
  }, []);

  const columns = [
    {
      h: "Programs",
      links: [
        { label: "Summer Students", page: "summer" },
        { label: "Find your centre", page: "centres" },
        { label: "NGGC · Identity society", page: "club" },
        { label: "Anchor 12", page: "anchor", badge: "LIVE" },
        { label: "Vanguard track", page: "anchor" },
      ],
    },
    {
      h: "Stay in motion",
      links: [
        { label: "About NGGC", page: "about" },
        { label: "The Anchor book", page: "book" },
        { label: "The Journal", page: "blog" },
        { label: "Media room", page: "media" },
        { label: "Shop", page: "shop" },
        { label: "Member dashboard", page: "dashboard", needsAuth: true },
      ],
    },
    {
      h: "Get involved",
      links: [
        { label: "Apply for a session", page: "join" },
        { label: "Volunteer with us", page: "volunteer" },
        { label: "Become a mentor", page: "volunteers" },
        { label: "The mentors", page: "mentors" },
        { label: "Contact us", page: "contact" },
      ],
    },
  ];

  const sessionLabel = session
    ? (session.code + " · " + session.year + " — " + (session.isActive ? "live" : "upcoming"))
    : "Session info loading…";

  // Context-aware chrome: inside the signed-in Community workspace (a full-height
  // app), the big marketing footer is just noise — collapse it to a hairline.
  if (page === "community" && auth.isSignedIn) {
    return (
      <footer className="footer footer-mini" role="contentinfo">
        <span className="mono footer-mini-label">NGG · Afrovanguard</span>
        <span className="footer-mini-links">
          <a href="#" onClick={e => { e.preventDefault(); setPage("legal"); }}>Privacy</a>
          <a href="#" onClick={e => { e.preventDefault(); setPage("parents"); }}>Safeguarding</a>
          <a href="#" onClick={e => { e.preventDefault(); setPage("contact"); }}>Contact</a>
        </span>
      </footer>
    );
  }

  return (
    <React.Fragment>
      {/* Pre-footer call band — final cinematic push before the footer proper. */}
      <section className="prefooter" aria-label="Join the movement">
        <div className="container prefooter-inner">
          <div className="prefooter-copy">
            <div className="mono prefooter-eyebrow">JOIN THE MOVEMENT</div>
            <h2 className="display prefooter-h">
              The room is open.<br/>
              <span className="prefooter-h-em">Are you in?</span>
            </h2>
            <p className="prefooter-p">
              Neighbourhood centres. Four sessions a year. One generation showing up.
              Apply now or send a mentor — both move the needle.
            </p>
          </div>
          <div className="prefooter-actions">
            <Magnetic strength={12}>
              <button className="btn btn-gold btn-lg" onClick={go("join")}>Apply for a session →</button>
            </Magnetic>
            <button className="btn btn-on-dark-ghost btn-lg" onClick={go("volunteers")}>Become a mentor</button>
          </div>
        </div>
      </section>

      <footer className="footer" role="contentinfo">
        <div className="footer-accent" aria-hidden="true"><i/><i/><i/><i/></div>
        <div className="container">
          {/* ---- Live status strip ---- */}
          <div className="footer-status" aria-live="polite">
            <div className="footer-status-left">
              <span className="footer-status-dot" aria-hidden="true"/>
              <span className="mono footer-status-label">{sessionLabel}</span>
            </div>
            <div className="footer-status-right">
              {auth.isSignedIn && auth.member ? (
                <button className="footer-status-pill" onClick={go("dashboard")}>
                  <span className="footer-status-avatar">{(auth.member.fullName || "M").charAt(0)}</span>
                  <span>Open my dashboard →</span>
                </button>
              ) : (
                <button className="footer-status-pill" onClick={() => auth.openSignIn && auth.openSignIn()}>
                  <span>Members — sign in →</span>
                </button>
              )}
            </div>
          </div>

          {/* ---- Newsletter band ---- */}
          <div className="footer-newsletter">
            <div>
              <span className="eyebrow" style={{color:"var(--gold-400)"}}>STAY CLOSE · THE DIGEST</span>
              <h3>One letter a month.<br/>No noise.</h3>
              <p>
                Cohort stories, mentor essays, missions we're shipping next.
                Written by the team, sent to your inbox the first Sunday of every month.
              </p>
            </div>
            <NewsletterForm/>
          </div>

          {/* ---- Main grid ---- */}
          <div className="footer-main">
            <div className="footer-brand">
              <div className="footer-brand-head">
                <BrandLogo size={52}/>
                <div>
                  <div className="footer-brand-line">Next Generation Genius</div>
                  <div className="footer-brand-tag">An Afrovanguard movement · est. 2023</div>
                </div>
              </div>
              <p>
                {site.movementTagline || "Not a school. Not a club. The structured runway from teenage potential to African leadership — built mission by mission, week by week."}
              </p>
              <div className="footer-socials" aria-label="Social channels">
                <SocialLink label="Instagram" href={CONTACT.socials.instagram} icon={SOCIAL_ICONS.instagram}/>
                <SocialLink label="X / Twitter" href={CONTACT.socials.x} icon={SOCIAL_ICONS.x}/>
                <SocialLink label="YouTube" href={CONTACT.socials.youtube} icon={SOCIAL_ICONS.youtube}/>
                <SocialLink label="TikTok" href={CONTACT.socials.tiktok} icon={SOCIAL_ICONS.tiktok}/>
                <SocialLink label="LinkedIn" href={CONTACT.socials.linkedin} icon={SOCIAL_ICONS.linkedin}/>
              </div>
              <div className="footer-contact" aria-label="Direct contact">
                <a className="footer-contact-line" href={"mailto:" + CONTACT.email}>
                  <span className="footer-contact-icon" aria-hidden="true">✉</span>
                  {CONTACT.email}
                </a>
                <a className="footer-contact-line" href={"tel:" + CONTACT.phone}>
                  <span className="footer-contact-icon" aria-hidden="true">☎</span>
                  {CONTACT.phoneDisplay}
                </a>
              </div>
            </div>

            {columns.map(col => (
              <div key={col.h} className="footer-col">
                <h4>{col.h}</h4>
                <ul>
                  {col.links.map(l => (
                    <li key={l.label}>
                      <button
                        className="footer-link"
                        onClick={() => {
                          if (l.needsAuth && !auth.isSignedIn) { auth.openSignIn && auth.openSignIn(); return; }
                          setPage(l.page);
                        }}
                      >
                        {l.label}
                        {l.badge && <span className="badge-new">{l.badge}</span>}
                        {l.needsAuth && !auth.isSignedIn && <span className="footer-link-lock" aria-hidden="true">·</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="footer-col footer-col-centres">
              <h4>Find us</h4>
              {centres && centres.length > 0 ? (
                <ul className="footer-centres">
                  {centres.map(c => (
                    <li key={c.slug} className="footer-centre">
                      <a href={"/centres/" + c.slug} className="footer-centre-link" onClick={goCentre(c.slug)}>
                        <div className="footer-centre-head">
                          <span className="footer-centre-dot"/>
                          <span className="footer-centre-name">{c.name}</span>
                          <span className="footer-centre-go" aria-hidden="true">→</span>
                        </div>
                        {c.area && <div className="footer-centre-meta">{c.area}</div>}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  <li><button className="footer-link" onClick={() => setPage("centres")}>Find your centre →</button></li>
                </ul>
              )}
            </div>
          </div>

          {/* ---- Editorial signature ---- */}
          <div className="footer-wordmark" aria-hidden="true">Next Gen Genius</div>

          {/* ---- Bottom row ---- */}
          <div className="footer-bottom">
            <span className="copy">© {new Date().getFullYear()} AFROVANGUARD · ALL RIGHTS RESERVED</span>
            <div className="legal-links">
              <button className="legal" onClick={() => { history.replaceState({}, "", "/legal?doc=privacy"); setPage("legal"); }}>Privacy</button>
              <button className="legal" onClick={() => { history.replaceState({}, "", "/legal?doc=safeguarding"); setPage("legal"); }}>Safeguarding</button>
              <button className="legal" onClick={() => { history.replaceState({}, "", "/legal?doc=rights"); setPage("legal"); }}>Data rights</button>
              <button className="legal" onClick={go("contact")}>Contact</button>
              <button className="legal" onClick={go("s-status")}>Live status</button>
              <button className="legal" onClick={go("v-status")}>Volunteer status</button>
              <button className="legal" onClick={go("admin")}>Staff</button>
            </div>
            <span className="made">
              Made with <span className="heart" aria-hidden="true">♥</span> in Lagos
            </span>
          </div>
        </div>
      </footer>
    </React.Fragment>
  );
}

/* ---- Shared state UI: offline / error / empty ---- */
function humanizeError(message, code) {
  const c = String(code || message || "");
  const map = {
    forbidden: "You don't have permission to view this.",
    unauthorized: "Please sign in to continue.",
    admin_2fa_required: "This area needs a 2FA code.",
    not_found: "We couldn't find that.",
    rate_limited: "Too many requests — wait a moment and try again.",
    link_invalid: "This link isn't valid or has expired. Ask for a fresh invite code.",
    already_connected: "You're already connected to this student on this device.",
    consent_required: "Please tick the required consent boxes to continue.",
    member_gone: "That account no longer exists.",
    approval_pending: "Sent to an admin for approval — nothing changes until it is approved.",
    http_0: "Network trouble — check your connection.",
    csrf_failed: "Your session needs refreshing. Reload the page and try again.",
    http_500: "The server hit an error. Please try again shortly.",
    http_403: "The host refused this request before it reached the site. Ask your host to allow it, or try a smaller file.",
    http_406: "The host's firewall refused this request. Ask your host to allow it, or try a smaller file.",
    http_413: "That is larger than this host accepts. Split it into smaller files.",
    blocked_upstream: "The host's firewall refused this request before it reached the site. Ask your host to allow it, or try a smaller file.",
    request_too_large: "That is larger than this host accepts. Split it into smaller files.",
    bad_rows_json: "The lessons could not be read. Choose the file again.",
    import_changed: "The file changed since it was checked — check it again.",
    nothing_to_import: "There are no lessons to import.",
    too_many: "That is more than the limit for one run — split the file.",
    http_503: "The service is busy. Please try again shortly.",
  };
  if (map[c]) return map[c];
  if (/network|fetch|Failed to fetch|offline/i.test(c)) return "Network trouble — check your connection and try again.";
  return "Something went wrong. Please try again — if it persists, contact support." + (code ? " (" + code + ")" : "");
}

/* ============================================================================
   THE ADMIN ACTION LAYER — one selection primitive, one bulk bar, one runner.

   Every screen in this console had rolled its own. There were at least six
   variants of "tick some rows and do a thing to them": the old applications screen (removed) kept a
   Set and awaited a loop, SummerPending kept a Set called `ticked` with its own
   bar, the review desk kept `picked` and passed an `onBulk` up, the assessment
   screen kept an object map, the mentor sheet took an array of ids, and the two
   screens where bulk mattered most — Members and the Club roster — had none at
   all. They disagreed about the things that actually matter:

     · WHETHER THE COUNT IS TRUE. Some confirms interpolated the selection size
       at press time and some at render time, so a confirm could say 12 and act
       on 40 after a background refresh landed in between. The count is read
       ONCE here, before the confirm, and is the count acted on.
     · WHETHER A HALF-DONE BULK IS REPORTED. Several looped `await` inside a
       try and reported success if the last row worked. A bulk that half-worked
       is the case worth designing for, so a partial result is a distinct
       outcome with its own message naming how many failed and why.
     · WHETHER SELECTION SURVIVES A FILTER CHANGE. Most did. Changing the filter
       and pressing a bulk action then acted on rows that were no longer on
       screen. Selection is keyed to the list here and clears itself.
     · WHETHER THE OPERATOR MAY DO IT. Bulk buttons were rendered
       unconditionally and the server 403'd, so the feedback for "you may not"
       was an error toast after the confirm. An action declares its capability
       and is not rendered without it. (The server still enforces; this is the
       UI being honest, never the check itself.)
     · WHETHER IT IS KEYBOARD-REACHABLE AND ANNOUNCED. The bars were divs. This
       one is a labelled region with a live count, so a screen-reader user knows
       the selection changed without hunting for it.

   Use it as three pieces:

     const sel = useAdminSelection(rows, r => r.memberId);
     <AdminBulkBar selection={sel} total={meta.total} actions={[...]}/>
     // and, for one row's own menu, the same runner:
     runAdminAction(action, [id], { reload })

   An action is a plain object so the same declaration drives the bulk bar and
   a single-row menu — which is what keeps the two consistent by construction
   rather than by everyone remembering:

     { id, label, rowLabel, cap, danger, hint,
       confirm: ({count, ids}) => ({title, body, cta, danger}),
       run: (ids) => result,  runOne: (id) => result,  open: (ids) => void,
       pastTense, reload, bulkHidden, rowHidden, keepSelection }
   ============================================================================ */

/** Row selection for a paged admin table.
 *
 * `rows` is the page in hand and `key` reads a row's stable id. The selection
 * clears whenever the identity of the list changes, so a filter or a page turn
 * can never leave rows selected that the operator can no longer see.
 */
/* ── Leave notice (owner, 14 Nov 2026) ─────────────────────────────────────────────────────────────
   A leave request sent less than 24 hours before the day it excuses is not approved, unless it is an
   emergency the centre can check, and it is still allowed to send. This is the server's rule
   (member_leave_notice in domain/member-self.php) worked out in the browser so the warning appears while
   the date is being chosen; the server decides and records it when the request is sent. Measured from the
   first meeting day on or after `fromIso` (Saturday unless told otherwise), at the arrival time, Lagos time. */
const NGG_LEAVE_NOTICE_HOURS = 24;
function nggLeaveNotice(fromIso, redline, weekdays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso || "")) return { short: false };
  const wd = (weekdays && weekdays.length ? weekdays : [6]).map(Number), rl = /^\d{2}:\d{2}$/.test(redline || "") ? redline : "09:00";
  let d = new Date(fromIso + "T12:00:00Z");
  for (let i = 0; i < 7 && wd.indexOf(d.getUTCDay() === 0 ? 7 : d.getUTCDay()) < 0; i++) d = new Date(d.getTime() + 864e5);
  const first = d.toISOString().slice(0, 10), starts = new Date(first + "T" + rl + ":00+01:00").getTime();
  return { short: Date.now() > starts - NGG_LEAVE_NOTICE_HOURS * 36e5, first, day: new Date(starts).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }) };
}
function nggLeaveNoticeText(n, who) {
  return "This is less than 24 hours before " + n.day + ". Leave asked for this late is not approved, unless it is an emergency the centre can check, such as illness or a family emergency. You can still send it: say what happened, and keep any proof" + (who ? " " + who : "") + " can show, such as a hospital note.";
}

function useAdminSelection(rows, key) {
  const list = rows || [];
  const getKey = key || ((r) => r && (r.id || r.memberId || r.studentId));
  const ids = React.useMemo(() => list.map(getKey).filter(Boolean).map(String), [list]);
  const sig = ids.join("|");
  const [picked, setPicked] = React.useState(() => new Set());
  // Drop anything no longer on screen rather than clearing outright: turning a
  // page and coming back should not silently discard a careful selection, but
  // acting on an off-screen row must be impossible.
  React.useEffect(() => {
    setPicked(prev => {
      if (!prev.size) return prev;
      const keep = new Set();
      prev.forEach(id => { if (ids.indexOf(id) !== -1) keep.add(id); });
      return keep.size === prev.size ? prev : keep;
    });
    // eslint-disable-next-line
  }, [sig]);

  const has = React.useCallback((id) => picked.has(String(id)), [picked]);
  const toggle = React.useCallback((id) => setPicked(p => {
    const n = new Set(p); const k = String(id);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  }), []);
  const clear = React.useCallback(() => setPicked(new Set()), []);
  const allOnPage = ids.length > 0 && ids.every(id => picked.has(id));
  const someOnPage = ids.some(id => picked.has(id)) && !allOnPage;
  const togglePage = React.useCallback(() => {
    setPicked(p => (ids.length && ids.every(id => p.has(id))) ? new Set() : new Set(ids));
    // eslint-disable-next-line
  }, [sig]);
  return {
    ids: Array.from(picked), size: picked.size, has, toggle, clear, togglePage,
    allOnPage, someOnPage, pageIds: ids,
    /* Replace the selection outright — for "select all N matching the filter",
       where the ids come from the server rather than from the page in hand. */
    replace: (next) => setPicked(new Set((next || []).map(String))),
  };
}

/** A tri-state select-all checkbox. Indeterminate has to be set imperatively;
 *  React has no prop for it, which is why every hand-rolled version was a
 *  two-state box that lied about a partial selection. */
function AdminSelectAll({ selection, label }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!selection.someOnPage;
  }, [selection.someOnPage, selection.allOnPage]);
  return (
    <label className="admin-bulk-all">
      <input ref={ref} type="checkbox" checked={selection.allOnPage} onChange={selection.togglePage}
        aria-label={label || "Select all rows on this page"}/>
      <span>{selection.size ? selection.size + " selected" : (label || "Select all")}</span>
    </label>
  );
}

/** One row's checkbox. Stops the click from also opening the row. */
function AdminRowCheck({ selection, id, label }) {
  return (
    <input type="checkbox" checked={selection.has(id)} aria-label={label || ("Select " + id)}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); selection.toggle(id); }}/>
  );
}

/**
 * Run one declared action over a set of ids.
 *
 * Returns { ran, ok, failed, results } and never throws — a caller that only
 * wants "did it work" reads `ok`, and one that wants to show the operator which
 * rows failed reads `results`. `ran: false` means the operator cancelled, which
 * is not a failure and must not be reported as one.
 *
 * `action.run(ids)` may either do the whole set in ONE server call (preferred —
 * one request, one audit event, and the server decides the partial outcome) or
 * be omitted in favour of `action.runOne(id)`, which is looped here. Looping is
 * the fallback because it is N requests and cannot be atomic, not because it is
 * equivalent.
 */
async function runAdminAction(action, ids, opts) {
  const o = opts || {};
  const list = (ids || []).map(String).filter(Boolean);
  const count = list.length;   // read ONCE, before the confirm, and used throughout
  if (!count) return { ran: false, ok: 0, failed: 0, results: [], reason: "empty" };

  if (action.confirm !== false && typeof dialog !== "undefined" && dialog.confirm) {
    const c = typeof action.confirm === "function" ? action.confirm({ count, ids: list }) : (action.confirm || {});
    const ok = await dialog.confirm({
      title: c.title || ((action.label || "Apply") + " · " + count + " selected"),
      body: c.body || ("This applies to " + count + " record" + (count === 1 ? "" : "s") + "."),
      cta: c.cta || (action.label || "Apply"),
      cancel: c.cancel,
      danger: c.danger !== undefined ? c.danger : !!action.danger,
    });
    if (!ok) return { ran: false, ok: 0, failed: 0, results: [], reason: "cancelled" };
  }

  let results = [];
  let failed = 0, okCount = 0;
  try {
    if (typeof action.run === "function") {
      const r = await action.run(list);
      /* A server that reports per-row outcomes is believed over its own
         top-level ok — a bulk endpoint returning ok:true with 28 refusals in
         `results` is the exact case a caller must not read as success. */
      if (r && Array.isArray(r.results)) {
        results = r.results;
        results.forEach(x => { if (x && x.ok === false) failed++; else okCount++; });
      } else {
        okCount = typeof (r && r.applied) === "number" ? r.applied
                : typeof (r && r.assigned) === "number" ? r.assigned : count;
        failed = Math.max(0, count - okCount);
      }
    } else if (typeof action.runOne === "function") {
      for (const id of list) {
        try { await action.runOne(id); results.push({ id, ok: true }); okCount++; }
        catch (e) { results.push({ id, ok: false, error: (e && (e.code || e.message)) || "failed" }); failed++; }
      }
    } else {
      /* Declaring neither `run` nor `runOne` nor `open` is a programming
         mistake, not a user-facing outcome. Reported rather than shown as a
         success over zero rows. */
      console.error("[admin] action has no runner", action && action.id);
      return { ran: false, ok: 0, failed: 0, results: [], reason: "no_runner" };
    }
  } catch (e) {
    const msg = (e && (e.code || e.message)) || "failed";
    /* A club admin's sensitive run is queued, not refused (domain/approvals.php):
       nothing changed yet, and that is the expected outcome, not an error. */
    if (msg === "approval_pending") {
      if (typeof toast !== "undefined") toast.info(humanizeError(msg, msg), action.label || "Approval");
      return { ran: true, ok: 0, failed: 0, results: [], queued: true, approvalId: e.data && e.data.approvalId };
    }
    if (typeof toast !== "undefined") {
      toast.error(msg === "forbidden" ? "You don't have permission to do that." : humanizeError(msg, msg),
        action.label || "Action failed");
    }
    return { ran: true, ok: 0, failed: count, results: [], error: msg };
  }

  if (typeof toast !== "undefined") {
    const noun = (o.noun || "record") + (okCount === 1 ? "" : "s");
    if (failed && okCount) {
      /* The half-done case, said plainly and with the reason attached. The
         previous behaviour was a success toast for a run where most rows were
         refused. */
      const why = adminFailSummary(results);
      toast.warn
        ? toast.warn(okCount + " of " + count + " done — " + failed + " refused" + (why ? " (" + why + ")" : "") + ".", action.label)
        : toast.error(okCount + " of " + count + " done — " + failed + " refused" + (why ? " (" + why + ")" : "") + ".", action.label);
    } else if (failed) {
      const why = adminFailSummary(results);
      toast.error("Nothing was changed — all " + failed + " refused" + (why ? " (" + why + ")" : "") + ".", action.label);
    } else {
      toast.success(okCount + " " + noun + " " + (o.pastTense || "updated") + ".", action.label);
    }
  }
  if (typeof action.done === "function") { try { await action.done(results); } catch (_) {} }
  if (typeof o.reload === "function") { try { await o.reload(); } catch (_) {} }
  return { ran: true, ok: okCount, failed, results };
}

/** The distinct reasons rows were refused, most common first — so a partial
 *  result says "12 already verified" rather than "12 refused". */
function adminFailSummary(results) {
  const counts = {};
  (results || []).forEach(r => {
    if (!r || r.ok !== false) return;
    const k = String(r.error || "refused").replace(/_/g, " ");
    counts[k] = (counts[k] || 0) + 1;
  });
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!keys.length) return "";
  return keys.slice(0, 2).map(k => counts[k] + " " + k).join(", ");
}

/**
 * The bulk bar.
 *
 * Shown only once something is selected, because a permanent bar of disabled
 * buttons is noise. A labelled region with a polite live count, so the
 * selection size is announced rather than only drawn; every action is a real
 * button; nothing is rendered that the operator's capabilities do not allow.
 *
 * `total` + `selectAllMatching` provide the escape hatch the paged tables
 * needed: a filter matching 340 rows can only ever tick the 50 in hand, and
 * "apply to all 340" has to be an explicit, separate decision.
 */
function AdminBulkBar({ selection, actions, total, selectAllMatching, hasCap, noun, busy, children }) {
  const [running, setRunning] = React.useState("");
  const can = (a) => !a.cap || !hasCap || hasCap(a.cap);
  const usable = (actions || []).filter(a => a && can(a));
  if (!selection.size) return null;
  const n = selection.size;
  const label = (noun || "record") + (n === 1 ? "" : "s");
  const go = async (a) => {
    /* An action that needs a VALUE ("which status?", "which centre?") cannot
       be a button — it has to ask first. Those declare `open(ids)` instead of
       `run(ids)`: the bar hands over the ids and steps out of the way, and
       crucially does NOT clear the selection, because whatever it opened is
       about to act on it. */
    if (typeof a.open === "function") { a.open(selection.ids); return; }
    setRunning(a.id);
    try { await runAdminAction(a, selection.ids, { noun: noun || "record", pastTense: a.pastTense, reload: a.reload }); }
    finally { setRunning(""); }
    if (a.keepSelection !== true) selection.clear();
  };
  return (
    <div className="admin-bulkbar" role="region" aria-label="Actions for the selected rows">
      <p className="admin-bulk-count" aria-live="polite">
        <b>{n}</b> {label} selected
        {typeof total === "number" && total > selection.pageIds.length && selectAllMatching && n < total && (
          <> · <button type="button" className="admin-bulk-link" onClick={selectAllMatching}>
            Select all {fmtNum(total)} matching the filter
          </button></>
        )}
      </p>
      <div className="admin-bulk-actions">
        {usable.map(a => (
          <button key={a.id} type="button"
            className={"btn btn-sm " + (a.danger ? "btn-danger" : "btn-ghost")}
            disabled={!!running || !!busy}
            aria-busy={running === a.id ? "true" : undefined}
            title={a.hint || undefined}
            onClick={() => go(a)}>
            {running === a.id ? "Working…" : a.label}
          </button>
        ))}
        {children}
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!running} onClick={selection.clear}>Clear</button>
      </div>
    </div>
  );
}

/**
 * One row's action menu, built from the SAME action declarations as the bulk
 * bar. That is the point: an individual action and its bulk equivalent cannot
 * drift into doing different things, asking differently, or being permitted
 * differently, because there is one declaration for both.
 */
function AdminRowActions({ id, actions, hasCap, noun, reload, label }) {
  const [open, setOpen] = React.useState(false);
  const [running, setRunning] = React.useState("");
  const ref = React.useRef(null);
  const btnRef = React.useRef(null);
  const usable = (actions || []).filter(a => a && (!a.cap || !hasCap || hasCap(a.cap)) && a.rowHidden !== true);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); if (btnRef.current) btnRef.current.focus(); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!usable.length) return null;
  const go = async (a) => {
    setOpen(false);
    if (typeof a.open === "function") { a.open([id]); return; }
    setRunning(a.id);
    try { await runAdminAction(a, [id], { noun: noun || "record", pastTense: a.pastTense, reload }); }
    finally { setRunning(""); }
  };
  return (
    <div className="admin-rowmenu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} type="button" className="btn btn-ghost btn-sm admin-rowmenu-btn"
        aria-haspopup="menu" aria-expanded={open} disabled={!!running}
        onClick={() => setOpen(o => !o)}>
        {running ? "…" : (label || "Actions")} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="admin-rowmenu-pop" role="menu">
          {usable.map(a => (
            <button key={a.id} type="button" role="menuitem"
              className={"admin-rowmenu-item" + (a.danger ? " is-danger" : "")}
              onClick={() => go(a)}>{a.rowLabel || a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function OfflineBanner() {
  const [off, setOff] = React.useState(typeof navigator !== "undefined" && navigator.onLine === false);
  /* Anything the outbox is still holding. This is shown whether or not the
     device is offline, because the submission that actually gets lost is the
     one that looked fine and then timed out — so "3 waiting to send" has to be
     visible to someone whose connection appears perfectly healthy. */
  const [queued, setQueued] = React.useState(0);
  React.useEffect(() => {
    const up = () => setOff(false), down = () => setOff(true);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    const un = window.outbox ? window.outbox.subscribe(rows => setQueued(rows.length)) : null;
    return () => {
      window.removeEventListener("online", up); window.removeEventListener("offline", down);
      if (un) un();
    };
  }, []);
  if (!off && !queued) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span className="offline-dot" aria-hidden="true"/>
      {queued > 0
        ? <>
            {queued} {queued === 1 ? "submission is" : "submissions are"} saved on this device and still sending
            {off ? " — they'll go when you're back online." : " — this finishes on its own, you can close the page."}
            {" "}
            <button type="button" className="offline-retry" onClick={() => window.outbox && window.outbox.flush()}>Try now</button>
          </>
        : "You're offline — showing the latest saved view. Changes sync when you reconnect."}
    </div>
  );
}

/* ── The training-fee watch ─────────────────────────────────────────────────
 *
 * One drawing of fees_training_watch() (domain/fees.php), for the member's own
 * account panel and the Control Room's account drawer alike, so the member and
 * the desk are never looking at two different lists. `audience` changes the
 * words, never the rows: a member reads "on your account", a coordinator reads
 * "charged". A long day-rate history is folded to its latest rows with a way
 * to open the rest — two hundred lines is a ledger, not a watch.
 */
const TFW_TAG = {
  member: { charged: "on your account", due: "next to be added", upcoming: "to come" },
  staff:  { charged: "charged", due: "waiting for the next run", upcoming: "to come" },
};
const TFW_PHASE = { training: "training", service: "service", complete: "complete", unknown: "no join date" };
function TrainingFeeWatch({ w, audience }) {
  const [all, setAll] = React.useState(false);
  if (!w) return null;
  const who = audience === "staff" ? "staff" : "member";
  const tag = TFW_TAG[who];
  const charged = w.rows.filter(r => r.state === "charged");
  const rest = w.rows.filter(r => r.state !== "charged");
  const SHOW = 6;
  const shownCharged = all ? charged : charged.slice(-SHOW);
  const total = w.trainingMonths + w.serviceMonths;
  return (
    <div className="dash-sched tfw" data-audience={who}>
      <div className="dash-sched-head">
        <b>{fmtMoney(w.perUnit)}</b> per {w.unit}
        <span> · {w.charged} charged{w.due ? " · " + w.due + " waiting" : ""}{w.upcoming ? " · " + w.upcoming + " still to come" : ""}</span>
      </div>
      {w.chargedAmount > 0 && (
        <div className="tfw-progress">
          <div className="tfw-bar" role="progressbar" aria-valuenow={w.coveredPct} aria-valuemin="0" aria-valuemax="100"
            aria-label={who === "staff" ? "Training fee covered by service" : "Your training fee earned off so far"}><span style={{ width: w.coveredPct + "%" }}/></div>
          <div className="tfw-figs">
            <span><b>{fmtMoney(w.covered)}</b> of {fmtMoney(w.chargedAmount)} {who === "staff" ? "covered" : "earned off"} ({w.coveredPct}%)</span>
            {who === "staff" && <span>{fmtMoney(w.earnedOff)} earned by service · {fmtMoney(w.writtenOff)} written off</span>}
          </div>
        </div>
      )}
      {w.phase !== "unknown" ? (
        <div className="dash-account-phase mono">
          MONTH {w.months} OF {total} · {String(TFW_PHASE[w.phase] || w.phase).toUpperCase()}
          {w.phase === "service" && <> · {w.servedMonths}/{w.serviceMonths} SERVED</>}
          {w.phase === "training" && w.trainingEndsAt && <> · CHARGES END {fmtDate(w.trainingEndsAt).toUpperCase()}</>}
        </div>
      ) : <p className="dash-sched-foot">No join date on the record, so the training clock cannot be worked out.</p>}
      {w.creditStopped && <div className="dash-account-halt">{who === "staff"
        ? "Service credit stopped on " + fmtDate(w.creditPausedAt) + " (eviction). Nothing more is earned off."
        : "Your service credit stopped on " + fmtDate(w.creditPausedAt) + ". Speak to your centre coordinator — this is something to talk through, not something to read off a screen."}</div>}
      {!w.creditStopped && w.creditPausedAt && <div className="dash-account-halt is-paused">{who === "staff"
        ? "Service credit paused from " + fmtDate(w.creditPausedAt) + " while a suspension stands."
        : "Your service credit is paused from " + fmtDate(w.creditPausedAt) + " while your suspension stands. It starts again when the suspension is lifted."}</div>}
      {w.rows.length > 0 && (
        <ol className="dash-sched-list">
          {shownCharged.map(x => <TrainingFeeRow key={x.key} x={x} tag={tag}/>)}
          {rest.map(x => <TrainingFeeRow key={x.key} x={x} tag={tag}/>)}
        </ol>
      )}
      {charged.length > SHOW && (
        <button type="button" className="btn btn-ghost btn-sm tfw-more" aria-expanded={all} onClick={() => setAll(a => !a)}>
          {all ? "Show only the latest" : "Show all " + charged.length + " charged"}
        </button>
      )}
      {w.phase === "training" && !w.calendarKnown && (
        <p className="dash-sched-foot">What is still to come shows once the meeting calendar for the rest of the training period is set.</p>
      )}
      {w.phase === "training" && w.upcoming > rest.filter(r => r.state === "upcoming").length && (
        <p className="dash-sched-foot">Showing the next {rest.filter(r => r.state === "upcoming").length} of {w.upcoming} still to come.</p>
      )}
    </div>
  );
}
function TrainingFeeRow({ x, tag }) {
  return (
    <li className={"dash-sched-row is-" + x.state}>
      <span className="dash-sched-name">{x.label}</span>
      <span className="mono dash-sched-when">{fmtDate(x.date)}</span>
      <span className="mono dash-sched-amt">{fmtMoney(x.amount)}</span>
      <span className="dash-sched-tag">{tag[x.state] || x.state}</span>
    </li>
  );
}

/* ── The timetable, drawn once ───────────────────────────────────────────────
 *
 * One component for every place a timetable appears — the Control Room, a
 * member's dashboard, a parent's family account and the public centre page —
 * so they cannot show the same week differently.
 *
 * Accessible by construction: a heading per day and a real table under it
 * (caption, th scope="col"), times as text, and "Your course" written out
 * rather than shown by colour alone. On a narrow screen the rows stack into
 * labelled cards by the container's own width. Printing prints only the
 * timetable (`.tt-print`), on white, with every row.
 */
const TT_DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function TimetableView({ slots, showInstructor, mineLabel, emptyText, actions, title }) {
  const list = Array.isArray(slots) ? slots : [];
  const days = [1, 2, 3, 4, 5, 6, 7].filter(d => list.some(x => x.weekday === d));
  if (!list.length) return <p className="tt-empty">{emptyText || "No timetable has been set yet."}</p>;
  return (
    <div className="tt">
      {days.map(d => {
        const rows = list.filter(x => x.weekday === d);
        return (
          <section key={d} className="tt-day" aria-labelledby={"tt-d" + d + (title ? "-" + title : "")}>
            <h3 className="tt-day-h" id={"tt-d" + d + (title ? "-" + title : "")}>{TT_DAY_NAMES[d]}</h3>
            <table className="tt-table">
              <caption className="sr-only">{(title ? title + " — " : "") + TT_DAY_NAMES[d] + ", " + rows.length + " session" + (rows.length === 1 ? "" : "s")}</caption>
              <thead><tr>
                <th scope="col">Time</th><th scope="col">Course</th><th scope="col">Room</th>
                {showInstructor && <th scope="col">Instructor</th>}
                {actions && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr></thead>
              <tbody>{rows.map(x => (
                <tr key={x.slotId} className={(x.mine ? "is-mine" : "") + (x.clashes && x.clashes.length ? " is-clash" : "")}>
                  <td data-label="Time"><span className="tt-time">{x.startTime}–{x.endTime}</span></td>
                  <td data-label="Course"><b>{x.course}</b>{x.level ? <span className="tt-sub"> · {x.level}</span> : null}
                    {x.mine && <span className="tt-mine">{mineLabel || "Your course"}</span>}
                    {x.note ? <div className="tt-sub">{x.note}</div> : null}
                    {x.clashes && x.clashes.length > 0 && <ul className="tt-clash" aria-label="Clashes">{x.clashes.map((c, i) => <li key={i}>⚠ {c.detail}</li>)}</ul>}</td>
                  <td data-label="Room">{x.room || "Main room"}</td>
                  {showInstructor && <td data-label="Instructor">{x.instructor || "—"}</td>}
                  {actions && <td data-label="Actions" className="tt-actions">{actions(x)}</td>}
                </tr>
              ))}</tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function ErrorState({ title, message, code, onRetry }) {
  return (
    <div className="state-block state-error" role="alert">
      <div className="state-ic state-ic-error" aria-hidden="true">!</div>
      <h3 className="state-h">{title || "Something went wrong"}</h3>
      <p className="state-p">{humanizeError(message, code)}</p>
      {onRetry && <button className="btn btn-ghost btn-sm state-retry" onClick={onRetry}>Try again</button>}
    </div>
  );
}

function EmptyState({ icon, title, message, action }) {
  return (
    <div className="state-block state-empty">
      <div className="state-ic state-ic-empty" aria-hidden="true">{icon || "◍"}</div>
      <h3 className="state-h">{title || "Nothing here yet"}</h3>
      {message && <p className="state-p">{message}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

/* ---- Sparkline ---- */
function Sparkline({ data, color = "var(--gold-500)", w = 120, h = 36, fill = false }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / (max - min || 1)) * (h - 4) - 2;
    return [x, y];
  });
  const line = pts.map(p => `${p[0]},${p[1]}`).join(" ");
  const area = `${pts[0][0]},${h} ${line} ${pts[pts.length-1][0]},${h}`;
  return (
    <svg width={w} height={h} style={{display:"block"}}>
      {fill && <polygon fill={color} fillOpacity="0.15" points={area} />}
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={line} />
    </svg>
  );
}

/* ---- Uploader — direct-to-Cloudinary media upload with URL fallback ----
   Renders an "Upload" button when the server has Cloudinary configured
   (GET /api/public/config.php → uploads.enabled). On success calls
   onUploaded(secureUrl, meta). Renders nothing when uploads are disabled,
   so callers can still show a paste-a-URL field alongside. */
/* ---- PhotoCapture — camera-first headshot, with upload + link fallbacks ----
   Used wherever a person's photo is set (admin enrol, member editor, gate
   registration). The site TAKES the picture; uploading a file or pasting a
   link are secondary options. Editors can re-take/re-upload any time. */
/* Cloudinary delivery-URL enhancement used across every photo taker. Kept in
   one place so the capture preview, the compare toggle and the fallbacks all
   agree on the exact transform. e_improve auto-fixes colour/lighting and the
   face-centred crop tidies the framing — both are FREE (no add-on). The
   background swap (e_background_removal) is deliberately NOT here: it is a paid
   add-on and runs server-side behind the credit guard, never on a client URL. */
const CLD_ENHANCE = "c_thumb,g_face,w_600,h_750,e_improve,q_auto";
const CLD_PLAIN   = "c_thumb,g_face,w_600,h_750,q_auto"; // same framing, no e_improve → the "before"

function cldEnhance(url) {
  return url && url.indexOf("/upload/") !== -1 ? url.replace("/upload/", "/upload/" + CLD_ENHANCE + "/") : url;
}

/* What to say when the browser cannot turn a picked file into something the
   server accepts. Almost always an iPhone on "High Efficiency", which saves
   HEIC — a format Chrome on Android cannot decode at all. One sentence of
   advice beats a rejection the family cannot act on. */
function photoFormatHelp(e) {
  const t = String((e && e.photoType) || "").replace(/^image\//, "").toUpperCase();
  const named = t && t !== "" ? "a " + t + " file" : "a format we can't read";
  return "Your phone saved this as " + named + ". Use the in-app camera button instead, or switch the "
    + "phone's camera format to “Most Compatible” / JPEG and pick it again.";
}

/* The floor below which a printed ID really is a blur. Matches PHOTO_MIN_PX in
   api/_lib/domain/selfreg.php — the two ends used to disagree (360 here, a
   message promising 400, 320 on the server), so a photo could be turned away
   by the browser for a size the server would have accepted. */
const HEADSHOT_MIN_PX = 320;

/* Client-side headshot check — a fast pre-read before we upload.
   IT ADVISES; IT DOES NOT DECIDE. api/_lib/domain/selfreg.php is explicit that
   only a human may turn a family away, and then this function did exactly the
   opposite: a mean-luminance floor and the browser's FaceDetector could block a
   submission outright, with no override and nobody to appeal to. Both misread
   darker skin in poor indoor light, which is most of this programme's intake on
   most evenings — so the check was rejecting the children it was least able to
   judge.
   Now it returns {ok, reason} for the two things that genuinely cannot work
   (unreadable, or smaller than a printable ID), and {ok:true, warn} for
   everything else, which the caller shows as advice with a way past it. `el` is
   a loaded <img> or a <canvas>; w/h are its natural pixel dimensions. */
async function validateHeadshot(el, w, h) {
  try {
    if (!w || !h) return { ok: false, reason: "Couldn't read that image — try a different photo." };
    if (Math.min(w, h) < HEADSHOT_MIN_PX) {
      return { ok: false, reason: "That image is too small for a printed ID — it needs to be at least "
        + HEADSHOT_MIN_PX + " pixels on the short side. Use a larger photo." };
    }
    const MAX = 480, s = Math.min(1, MAX / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.max(2, Math.round(w * s)); c.height = Math.max(2, Math.round(h * s));
    const ctx = c.getContext("2d"); ctx.drawImage(el, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const N = c.width * c.height, gray = new Float32Array(N);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) { const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; gray[p] = g; sum += g; }
    const mean = sum / N;
    /* Advice from here down. A luminance mean is a proxy for "can a person be
       made out", and a bad one on darker skin indoors — the reading it is worst
       at, and the one this programme produces most of. */
    if (mean < 26) return { ok: true, warn: "This looks very dark. If you can, face a window or add light and retake — but you can send it as it is and the desk will decide." };
    if (mean > 240) return { ok: true, warn: "This looks washed out by glare. Moving out of direct light usually fixes it — or send it and the desk will decide." };
    // Blur: variance of the Laplacian. Low variance = soft/out-of-focus.
    let ls = 0, lsq = 0, n = 0; const W = c.width;
    for (let y = 1; y < c.height - 1; y++) for (let x = 1; x < W - 1; x++) { const idx = y * W + x; const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - W] - gray[idx + W]; ls += lap; lsq += lap * lap; n++; }
    const lv = lsq / n - (ls / n) * (ls / n);
    if (lv < 18) return { ok: true, warn: "This looks soft or out of focus. Hold steady, let the camera focus and retake — or send it and the desk will decide." };
    /* FaceDetector, where the browser has it at all — it is behind a flag in
       most builds, so this rarely runs. It stays ADVISORY on purpose: face
       detection is measurably worse on darker skin, and a browser heuristic
       must not be the thing that stops a child getting an ID card. */
    if (typeof window.FaceDetector === "function") {
      try {
        const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 }).detect(el);
        if (!faces || faces.length === 0) return { ok: true, warn: "We couldn't spot a face in this — that is often just the lighting. Check the face is visible, or send it and the desk will decide." };
        if (faces.length > 1) return { ok: true, warn: "This looks like more than one person. A headshot should show just the one — retake if you can." };
        const b = faces[0].boundingBox, cx = (b.x + b.width / 2) / w, fh = b.height / h;
        if (fh < 0.16) return { ok: true, warn: "The face is small in the frame. Moving closer makes a better card — or send it as it is." };
        if (cx < 0.18 || cx > 0.82) return { ok: true, warn: "The face is off to one side. Centring it makes a better card — or send it as it is." };
      } catch (e) { /* detector hiccup — nothing to report */ }
    }
    return { ok: true };
  } catch (e) { return { ok: true }; } // never block on a validator error
}

// Load a URL into an <img> (CORS-enabled) for validation / re-upload.
function loadImageEl(src) {
  return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("load_failed")); im.src = src; });
}
/**
 * Where to cut a 4:5 card portrait from a camera frame of vw × vh, at the camera's own resolution — never enlarged.
 * The output is at most 900 × 1125 (the card's art size) and must reach the print floor (600 × 800, PHOTO_QA_RULES):
 * a 4:5 crop reaches it at 640 × 800. A frame too small for that is refused with what to do, rather than stretched
 * into a soft picture the sharpness check would call blurry.
 */
function photoCaptureRect(vw, vh) {
  if (!vw || !vh) return { ok: false, reason: "The camera isn’t ready yet — wait a second and try again." };
  const r = 4 / 5;
  let sw = vw, sh = vh;
  if (vw / vh > r) sw = Math.round(vh * r); else sh = Math.round(vw / r);
  const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
  const ow = Math.min(900, sw), oh = Math.round(ow / r);
  const need = Math.max(PHOTO_QA_RULES.minShort, Math.ceil(PHOTO_QA_RULES.minLong * r));
  if (ow < need) return { ok: false, sw, sh, reason: "This camera only gives a small picture (" + vw + " × " + vh + "), too small to print on a card. Take the photo with a phone’s camera app and use Upload instead." };
  return { ok: true, sx, sy, sw, sh, ow, oh };
}
function canvasToBlob(c, type, q) { return new Promise((res) => c.toBlob(res, type || "image/jpeg", q == null ? 0.9 : q)); }
// Swap (or insert) the transform segment right after /upload/. Leaves non-
// Cloudinary URLs (pasted links) untouched so the compare simply hides itself.
function cldWith(url, tf) {
  if (!url) return url;
  const i = url.indexOf("/upload/");
  if (i === -1) return url;
  let tail = url.slice(i + 8);
  const slash = tail.indexOf("/");
  const seg = slash === -1 ? tail : tail.slice(0, slash);
  if (slash !== -1 && !/^v\d+$/.test(seg) && /[,_]/.test(seg)) tail = tail.slice(slash + 1); // drop existing transform
  return url.slice(0, i + 8) + (tf ? tf + "/" : "") + tail;
}

/* Before/after preview with a reverse button, like Canva's edit toggle. Shows
   the enhanced image by default; press ⤺ to peek at the original, press again
   to restore. Only appears for Cloudinary uploads (there's nothing to compare
   for a pasted link). Purely a view — the stored value stays the enhanced URL. */
function PhotoCompare({ url, radius = "0", onError }) {
  const [orig, setOrig] = React.useState(false);
  const canCompare = !!(url && url.indexOf("/upload/") !== -1);
  React.useEffect(() => { setOrig(false); }, [url]); // a fresh capture resets to "enhanced"
  const shown = orig && canCompare ? cldWith(url, CLD_PLAIN) : url;
  const pill = { position: "absolute", top: 8, left: 8, fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: orig ? "rgba(0,0,0,.6)" : "rgba(245,176,38,.92)", color: orig ? "#fff" : "#2b2100", pointerEvents: "none" };
  const btn = { position: "absolute", bottom: 8, right: 8, width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 17, cursor: "pointer", display: "grid", placeItems: "center", lineHeight: 1, boxShadow: "0 2px 8px rgba(0,0,0,.35)" };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: radius, overflow: "hidden" }}>
      <img src={shown} alt={orig ? "Original photo" : "Enhanced photo"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={onError}/>
      {canCompare && (<>
        <span style={pill}>{orig ? "Original" : "Enhanced"}</span>
        <button type="button" onClick={() => setOrig(o => !o)} style={btn} title={orig ? "Show enhanced" : "Show original"} aria-label={orig ? "Show enhanced photo" : "Show original photo"}>⤺</button>
      </>)}
    </div>
  );
}

/* Full-screen image viewer — a headshot is impossible to judge inside a 64px
   circle. Tap the thumbnail (or the ⤢ control) to see it big; click the
   backdrop, press Esc, or hit ✕ to close. Reused wherever a photo is shown. */
function ImageLightbox({ url, alt, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  if (!url) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={alt || "Photo"} style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(6,9,20,0.86)", backdropFilter: "var(--lite-blur, blur(4px))", WebkitBackdropFilter: "var(--lite-blur, blur(4px))", display: "grid", placeItems: "center", padding: 24 }}>
      <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 18, right: 18, width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: "var(--rs-fsize-1, 22px)", cursor: "pointer", lineHeight: 1 }}>✕</button>
      <img src={url} alt={alt || "Photo"} onClick={e => e.stopPropagation()} style={{ maxWidth: "min(92vw, 620px)", maxHeight: "88vh", width: "auto", height: "auto", objectFit: "contain", borderRadius: 14, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)" }}/>
    </div>
  );
}

/* ── The photo quality gate, browser half ───────────────────────────────
   NGG does not take low-quality photos. These are the rules of
   api/_lib/domain/photo-quality.php, run here first so a family is told at
   once and can retake; the server measures again and is the one that decides.
   PHOTO_QA_RULES must equal PHOTO_QA there (tests/photo-quality.test.js).
   Exposure is judged on the face zone, so a passport photo on a white wall
   passes; sharpness is the Crete et al. blur score (0 sharp … 1 blurred). */
const PHOTO_QA_RULES = { minShort: 600, minLong: 800, workWidth: 600, zone: [0.18, 0.08, 0.82, 0.62], inner: [0.35, 0.20, 0.65, 0.50],
  minMean: 50, maxMean: 215, maxClipped: 0.30, minStd: 22, maxBlur: 0.58, blurKernel: 9 };
const PHOTO_QA_WORDS = {
  too_small: "This photo is too small to print sharply. Use the camera, not a WhatsApp forward or a screenshot.",
  too_dark: "The face is too dark. Stand facing a window or a light and retake.",
  too_bright: "The face is washed out. Move out of direct sunlight or away from the flash and retake.",
  clipped: "Part of the face is pure white or black. Even out the light and retake.",
  low_contrast: "The photo looks flat or foggy. Wipe the lens and retake in better light.",
  blurry: "The photo is blurry. Hold the phone steady, tap the face to focus, and retake.",
  unreadable: "We could not open this photo. Take it again as a JPG or PNG.",
  unavailable: "We could not check the photo just now. Try again in a minute.",
};
/** Crete et al. blur score of a row-major luma array (w × h): the worse axis. */
function photoQaBlur(L, w, h) {
  if (w < 12 || h < 12) return 1;
  const k = PHOTO_QA_RULES.blurKernel, r = k >> 1, B = new Float32Array(w * h), out = [];
  for (const horiz of [true, false]) {
    if (horiz) {
      for (let y = 0; y < h; y++) {
        const row = y * w; let acc = 0;
        for (let i = -r; i <= r; i++) acc += L[row + Math.min(w - 1, Math.max(0, i))];
        for (let x = 0; x < w; x++) { B[row + x] = acc / k; acc += L[row + Math.min(w - 1, x + r + 1)] - L[row + Math.max(0, x - r)]; }
      }
    } else {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) acc += L[Math.min(h - 1, Math.max(0, i)) * w + x];
        for (let y = 0; y < h; y++) { B[y * w + x] = acc / k; acc += L[Math.min(h - 1, y + r + 1) * w + x] - L[Math.max(0, y - r) * w + x]; }
      }
    }
    const step = horiz ? 1 : w; let sF = 0, sV = 0;
    for (let y = horiz ? 0 : 1; y < h; y++) for (let x = horiz ? 1 : 0; x < w; x++) {
      const i = y * w + x, dF = Math.abs(L[i] - L[i - step]), dB = Math.abs(B[i] - B[i - step]);
      sF += dF; if (dF > dB) sV += dF - dB;
    }
    out.push(sF > 0 ? (sF - sV) / sF : 1);
  }
  return Math.max(out[0], out[1]);
}
/** Measure a canvas already at the working size (600 wide, never enlarged). */
function photoQaMeasure(canvas) {
  const w = canvas.width, h = canvas.height, R = PHOTO_QA_RULES;
  const x0 = Math.floor(w * R.zone[0]), y0 = Math.floor(h * R.zone[1]), x1 = Math.floor(w * R.zone[2]), y1 = Math.floor(h * R.zone[3]);
  const ix0 = Math.floor(w * R.inner[0]), iy0 = Math.floor(h * R.inner[1]), ix1 = Math.floor(w * R.inner[2]), iy1 = Math.floor(h * R.inner[3]);
  const zw = x1 - x0, zh = y1 - y0;
  const d = canvas.getContext("2d", { willReadFrequently: true }).getImageData(x0, y0, zw, zh).data;
  const L = new Float32Array(zw * zh); let sum = 0, sq = 0, clip = 0, inner = 0;
  for (let y = 0; y < zh; y++) for (let x = 0; x < zw; x++) {
    const i = y * zw + x, v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    L[i] = v; sum += v; sq += v * v;
    const ax = x + x0, ay = y + y0;
    if (ax >= ix0 && ax < ix1 && ay >= iy0 && ay < iy1) { inner++; if (v <= 8 || v >= 247) clip++; }
  }
  const n = Math.max(1, zw * zh), mean = sum / n;
  return { mean: Math.round(mean * 10) / 10, std: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean)) * 10) / 10,
    clipped: inner ? Math.round(clip / inner * 1000) / 1000 : 0, blur: Math.round(photoQaBlur(L, zw, zh) * 1000) / 1000 };
}
/** The issues, in the order a family should fix them. `srcW`/`srcH` are the ORIGINAL's pixels for the part kept. */
function photoQaJudge(m, srcW, srcH) {
  const R = PHOTO_QA_RULES, out = [];
  if (Math.min(srcW, srcH) < R.minShort || Math.max(srcW, srcH) < R.minLong) out.push("too_small");
  if (m.mean < R.minMean) out.push("too_dark");
  if (m.mean > R.maxMean) out.push("too_bright");
  if (m.clipped > R.maxClipped) out.push("clipped");
  if (m.std < R.minStd) out.push("low_contrast");
  if (m.blur > R.maxBlur) out.push("blurry");
  return out;
}
/** Judge a chosen file before it is uploaded: { issues, words } (issues empty = it passes here; the server checks again). */
async function photoQaCheckFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, cw = Math.min(w, PHOTO_QA_RULES.workWidth), ch = Math.max(1, Math.round(h * cw / w));
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, cw, ch);
    const issues = photoQaJudge(photoQaMeasure(c), w, h);
    return { issues, words: issues.slice(0, 2).map(i => PHOTO_QA_WORDS[i]).join(" ") };
  } catch (_) { return { issues: ["unreadable"], words: PHOTO_QA_WORDS.unreadable }; }
  finally { URL.revokeObjectURL(url); }
}
/**
 * A staff save that carries a photo: when the photo check doubts it (`photo_low_quality`, overridable), the person
 * saving — who is looking at the photo — is asked once whether to use it anyway, and the save is sent again with
 * `photoQaOverride`, which the server records (photo_qa_gate_staff). `send(data)` makes the request.
 */
async function nggSaveWithPhotoOverride(send, data) {
  try { return await send(data); }
  catch (e) {
    const d = (e && e.data) || {};
    if (!e || e.code !== "photo_low_quality" || d.overridable === false) throw e;
    const why = d.message || photoQaServerWords(e) || "The photo check doubts this photo.";
    const ok = typeof window !== "undefined" && window.confirm(why + "\n\nYou can see the photo. If the face is clear and sharp, use it anyway? This is recorded.");
    if (!ok) throw e;
    return await send(Object.assign({}, data, { photoQaOverride: true }));
  }
}

/** The server's refusal (`photo_low_quality`) in the family's words. */
function photoQaServerWords(e) {
  const d = (e && e.data) || {}, issues = Array.isArray(d.issues) ? d.issues : [];
  return issues.length ? issues.slice(0, 2).map(i => PHOTO_QA_WORDS[i] || "").join(" ").trim() : (d.message || PHOTO_QA_WORDS.blurry);
}

function PhotoCapture({ value, onChange, size = 96, label = "Photo" }) {
  const [mode, setMode] = React.useState("idle"); // idle | camera | link
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  /* Advice, not a refusal. The pre-read's soft judgements land here with the
     blob they are about, so the operator can act on them or send anyway —
     which is the difference between guidance and a locked door. */
  const [advice, setAdvice] = React.useState(null);   // { text, send: () => void }
  const [linkVal, setLinkVal] = React.useState("");
  const [zoom, setZoom] = React.useState(false);  // full-screen photo viewer
  const [shot, setShot] = React.useState(null);   // captured still awaiting confirm: {url, blob}
  // Same reason as the registration step's camera: the stream is state, and an
  // effect attaches it after the render that mounts the <video>. Assigning
  // srcObject straight out of the getUserMedia callback depends on the element
  // already existing, and when it doesn't the stream is silently orphaned and
  // the camera shows a blank frame with no error.
  const [stream, setStream] = React.useState(null);
  const [facing, setFacing] = React.useState("user");
  const [multiCam, setMultiCam] = React.useState(false);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const fileRef = React.useRef(null);

  const stop = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setStream(null);
  };
  React.useEffect(() => stop, []);
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== (stream || null)) v.srcObject = stream || null;
    if (stream) v.play().catch(() => {});
  }, [stream, mode]);
  // Lock body scroll while the full-screen camera overlay is open.
  React.useEffect(() => {
    if (mode !== "camera") return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mode]);

  const startCamera = async (want) => {
    const side = want || facing;
    setErr(""); setMode("camera");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setErr("No camera on this device — upload a photo or paste a link instead."); setMode("idle"); return; }
    // A phone will not hand out both lenses at once — release before asking.
    stop();
    try {
      /* Ask for a large frame. "ideal 720" gave a laptop's 720 × 540, which had to be ENLARGED to fill the card's
         portrait — and an enlarged frame is soft, so the quality check rightly called a sharp face blurry. */
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: side, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      streamRef.current = s;
      setStream(s);
      setFacing(side);
      if (navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
          .then(ds => setMultiCam(ds.filter(d => d.kind === "videoinput").length > 1))
          .catch(() => {});
      }
    } catch (_) { setErr("Camera permission denied — upload a photo or paste a link instead."); setMode("idle"); }
  };
  const flipCamera = () => startCamera(facing === "user" ? "environment" : "user");

  const uploadBlob = async (blob, name) => {
    setBusy(true); setErr(""); setAdvice(null);
    try {
      // A real File keeps its own type; only a canvas blob needs a name put on
      // it, and that one genuinely is a JPEG.
      const file = blob instanceof File ? blob : new File([blob], name || "headshot.jpg", { type: (blob && blob.type) || "image/jpeg" });
      /* Uploads when a cloud is configured, hands the image back inline when one
         is not — so "paste an image link instead" stops being the only option on
         a site whose Cloudinary keys were never set. The server accepts either
         shape (photo_intake_url) and stores the bytes itself. */
      const up = await NGGApi.uploadOrInline(file, "headshot");
      // Face-centred crop + auto colour/lighting (Cloudinary URL transform); a
      // no-op on an inline image, which the server pipeline edits instead.
      onChange(cldEnhance(up.url));
      stop(); setMode("idle");
    } catch (e) {
      const code = e.code || "";
      setErr(
        code === "photo_format" ? photoFormatHelp(e)
        : /photo_too_large/.test(e.message || "") ? "That photo is too large to send — use your camera's 'medium' size, or a smaller file."
        : code === "csrf_failed" ? "Your session expired — refresh the page, then try the photo again."
        : code === "rate_limited" ? "Too many tries in a row — wait a moment and try again."
        : /network/.test(e.message || "") ? "Network hiccup sending the photo — check the connection and try again."
        : "Couldn't use that photo — try again, or paste an image link instead."
      );
    } finally { setBusy(false); }
  };

  // Grab a still from the live video and FREEZE it for review — no upload yet.
  // The user then presses "Use photo" (accept) or "Retake". The camera keeps
  // running behind the frozen still so retake is instant.
  const capture = async () => {
    const v = videoRef.current; if (!v) return;
    // Cover-crop the video frame to a 4:5 portrait. The live front-camera
    // preview is shown mirrored, because that is how people expect to see
    // themselves while they line up — but the photo is NOT saved mirrored.
    // It goes on an ID card, which must show the face as everyone else sees
    // it; a baked-in mirror reversed the face and any lettering on the
    // clothing on every selfie-camera card. The frozen still shows the true
    // image, so what is reviewed is exactly what is saved.
    /* Cropped at the camera's OWN size and never enlarged (photoCaptureRect): a small frame stretched to 720 × 900
       printed soft and was refused as blurry. A camera that cannot give a printable portrait is told so instead. */
    const vw = v.videoWidth || 0, vh = v.videoHeight || 0;
    const R = photoCaptureRect(vw, vh);
    if (!R.ok) { setErr(R.reason); return; }
    const c = document.createElement("canvas");
    c.width = R.ow; c.height = R.oh;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true; if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(v, R.sx, R.sy, R.sw, R.sh, 0, 0, R.ow, R.oh);
    setBusy(true); setErr(""); setAdvice(null);
    const check = await validateHeadshot(c, c.width, c.height);
    setBusy(false);
    if (!check.ok) { setErr(check.reason); return; }   // stay live so they can reframe
    const blob = await canvasToBlob(c, "image/jpeg", 0.9);
    if (!blob) { setErr("Couldn't capture that frame — try again."); return; }
    /* The still is frozen for review either way. A warning rides along with it
       rather than sending them back to the live view, because the operator is
       about to look at the photo themselves and is a better judge than the
       luminance mean. */
    if (check.warn) setAdvice({ text: check.warn });
    setShot({ url: c.toDataURL("image/jpeg", 0.9), blob });
  };
  // Accept the reviewed still → upload it. On success uploadBlob stops the
  // camera and returns to idle; on failure the review stays put with the error.
  const acceptShot = async () => { if (shot) { await uploadBlob(shot.blob, "headshot.jpg"); setShot(null); } };
  const closeCamera = () => { stop(); setShot(null); setMode("idle"); setErr(""); };
  React.useEffect(() => { if (mode !== "camera") setMultiCam(false); }, [mode]);

  /* Upload a chosen file — read it first, then send.
     A format the browser cannot decode is NOT a dead end here: the file may
     still be a HEIC that a configured cloud would accept, and the pre-read is
     advice anyway. So a decode failure hands the file to uploadBlob and lets
     the pipeline give the specific answer, instead of "try a different photo"
     for a photo that is fine. */
  const uploadPicked = async (file) => {
    setBusy(true); setErr(""); setAdvice(null);
    let check = { ok: true };
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const im = await loadImageEl(url);
      check = await validateHeadshot(im, im.naturalWidth, im.naturalHeight);
    } catch (e) { /* undecodable here — let the upload pipeline name the reason */ }
    finally { if (url) { try { URL.revokeObjectURL(url); } catch (_) {} } }
    if (!check.ok) { setErr(check.reason); setBusy(false); return; }
    if (check.warn) setAdvice({ text: check.warn, send: () => uploadBlob(file, file.name) });
    else uploadBlob(file, file.name);
    if (check.warn) setBusy(false);
  };

  // Paste-a-link — load it, validate it, and RE-UPLOAD to Cloudinary so it's a
  // real, enhanced, same-origin-safe headshot (never a raw foreign URL).
  const useLink = async () => {
    const url = linkVal.trim(); if (!url) return;
    setBusy(true); setErr(""); setAdvice(null);
    try {
      const im = await loadImageEl(url);
      const check = await validateHeadshot(im, im.naturalWidth, im.naturalHeight);
      if (!check.ok) { setErr(check.reason); setBusy(false); return; }
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext("2d").drawImage(im, 0, 0);
      const blob = await canvasToBlob(c, "image/jpeg", 0.92);
      if (!blob) throw new Error("encode");
      if (check.warn) { setAdvice({ text: check.warn, send: () => { setLinkVal(""); return uploadBlob(blob, "headshot.jpg"); } }); setBusy(false); return; }
      await uploadBlob(blob, "headshot.jpg");
      setLinkVal("");
    } catch (e) {
      setErr("That link isn't a directly-viewable image (a Drive/Photos share link won't work). Paste a direct image URL, or upload the file.");
      setBusy(false);
    }
  };

  // CAMERA MODE — a full-screen overlay (not a cramped inline frame). Capture
  // freezes the shot for review; nothing is saved until "Use photo" is pressed,
  // so it never jumps straight to the little circle.
  if (mode === "camera") {
    return (
      <div role="dialog" aria-modal="true" aria-label="Take a photo" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(6,9,20,0.94)", backdropFilter: "var(--lite-blur, blur(4px))", WebkitBackdropFilter: "var(--lite-blur, blur(4px))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 16 }}>
        <button type="button" onClick={closeCamera} aria-label="Close" style={{ position: "absolute", top: 16, right: 16, width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: "var(--rs-fsize-1, 22px)", lineHeight: 1, cursor: "pointer" }}>✕</button>
        <div style={{ color: "#fff", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 18 }}>{shot ? "Use this photo?" : "Take your photo"}</div>
        <div style={{ position: "relative", width: "100%", maxWidth: 360, aspectRatio: "4 / 5", borderRadius: 18, overflow: "hidden", background: "#0b1020", boxShadow: "0 24px 70px -24px rgba(0,0,0,0.75)" }}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", transform: facing === "environment" ? "none" : "scaleX(-1)", display: shot ? "none" : "block" }}/>
          {shot && <img src={shot.url} alt="Captured photo" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>}
          {!shot && <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "43%", transform: "translate(-50%,-50%)", width: "62%", height: "72%", border: "2px dashed rgba(255,255,255,0.65)", borderRadius: "50%" }}/>}
          {!shot && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, fontSize: 12.5, color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,0.65))", textAlign: "center" }}>Line your face up with the oval, then press Capture.</div>}
        </div>
        {err && <div role="alert" style={{ fontSize: 13, color: "#ffb0b0", maxWidth: 360, textAlign: "center", lineHeight: 1.4 }}>{err}</div>}
        {/* Advice, in a colour that is not a rejection. The photo stays and
            "Use photo" still works — that is the whole point. */}
        {advice && !err && <div style={{ fontSize: 13, color: "#ffe0ad", maxWidth: 360, textAlign: "center", lineHeight: 1.45, padding: "9px 12px", borderRadius: 10, background: "rgba(245,176,38,0.14)", border: "1px solid rgba(245,176,38,0.34)" }}>{advice.text}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {shot ? (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={acceptShot}>{busy ? "Saving…" : "✓ Use photo"}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => { setShot(null); setErr(""); setAdvice(null); }} style={{ color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)" }}>↺ Retake</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={capture}>{busy ? "Checking…" : "📸 Capture"}</button>
              {multiCam && <button type="button" className="btn" disabled={busy} onClick={flipCamera} title="Flip camera"
                style={{ color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)" }}>🔄 {facing === "user" ? "Back" : "Front"} camera</button>}
              <button type="button" className="btn" onClick={closeCamera} style={{ color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)" }}>Cancel</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <button type="button" onClick={() => value ? setZoom(true) : startCamera()} title={value ? "View photo" : "Take a photo"}
        style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flex: "0 0 auto", background: "var(--bg-sunken, #f4f4f0)", border: "1px solid rgba(12,20,50,0.14)", display: "grid", placeItems: "center", fontSize: size / 3, color: "var(--ink-400, #93939a)", padding: 0, cursor: "pointer", position: "relative" }}>
        {value ? <PhotoCompare url={value} onError={e => { e.target.style.display = "none"; }}/> : "📷"}
        {value && <span aria-hidden="true" style={{ position: "absolute", right: 2, bottom: 2, width: 22, height: 22, borderRadius: "50%", background: "rgba(10,17,48,0.82)", color: "#fff", fontSize: 11, display: "grid", placeItems: "center" }}>⤢</span>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {mode === "link" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="admin-input" style={{ flex: "1 1 180px" }} aria-label="Direct image link" placeholder="https://…/photo.jpg (direct image link)" value={linkVal} onChange={e => setLinkVal(e.target.value)}/>
            <button type="button" className="btn btn-primary btn-sm" disabled={!linkVal.trim() || busy} onClick={useLink}>{busy ? "Checking…" : "Use"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={startCamera}>{value ? "Re-take" : "Take photo"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>{busy ? "Uploading…" : "Upload"}</button>
            {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoom(true)}>View larger</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("link")}>Paste link</button>
            {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")}>Remove</button>}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) uploadPicked(f); e.target.value = ""; }}/>
          </div>
        )}
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8 }}>
          {err ? <span style={{ color: "var(--coral)" }}>{err}</span> : (label + " — the site takes the picture; upload or link are optional. Tap the photo to view it larger.")}
        </div>
        {/* An uploaded or linked photo the pre-read is unsure about. It has NOT
            been refused: the operator is told what looks off and can send it
            anyway, which is the difference between advice and a locked door. */}
        {advice && advice.send && !err && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(245,176,38,0.12)", border: "1px solid rgba(245,176,38,0.35)" }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-700,#2a335c)" }}>{advice.text}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                onClick={() => { const go = advice.send; setAdvice(null); go(); }}>{busy ? "Sending…" : "Use it anyway"}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdvice(null)}>Pick another</button>
            </div>
          </div>
        )}
      </div>
      {zoom && value && <ImageLightbox url={value} alt={label} onClose={() => setZoom(false)}/>}
    </div>
  );
}

/* Build a Cloudinary delivery transform from an explicit edit spec — mirrors
   the server's cloudinary_edit_manual so the preview matches the save.
   `omitZoom` returns the un-zoomed base, which the editor scales in CSS for a
   live preview instead of fetching a new derivative on every slider tick. */
function buildEditTransform(spec, omitZoom) {
  const g = spec.gravity || "face";
  const parts = ["c_fill", "g_" + g, "w_600", "h_750", "f_auto", "q_auto:good", "e_improve:30"];
  if (spec.brighten) parts.push("e_brightness:18");
  if (spec.sharpen) parts.push("e_sharpen:80");
  let chain = parts.join(",");
  // Zoom is a fractional crop chained BEFORE the fill, not Cloudinary's z_.
  // z_ is silently ignored in this chain — verified against Cloudinary:
  // c_fill with z_1.6 returns byte-identical output to no zoom, for g_face as
  // well as the fixed gravities. Cropping 1/zoom of the source about the same
  // gravity and then filling gives the framing z_ was meant to, for every
  // gravity, and it is what the CSS preview scale corresponds to.
  if (!omitZoom && spec.zoom > 1.005) {
    const f = Math.max(0.2, Math.min(0.99, Math.round(1000 / spec.zoom) / 1000));
    chain = "c_crop,g_" + g + ",w_" + f + ",h_" + f + "/" + chain;
  }
  // Soft neutral grey (mirrors ID_BG_GREY in photos.php) — a studio backdrop,
  // not stark white, so the subject stands off the white card stock.
  if (spec.removeBg) chain += "/e_background_removal/b_rgb:eceef2";
  return chain;
}
// Where the crop is anchored, as a CSS transform-origin — so scaling the base
// preview zooms about the same point Cloudinary will crop about.
const EDIT_ORIGIN = { face: "50% 50%", faces: "50% 50%", auto: "50% 50%", center: "50% 50%", north: "50% 0%", south: "50% 100%" };

/* Admin photo editor — re-edit ANY image (card headshot, review-queue asset).
   Live client-side preview via cldWith; Save persists through the server which
   re-derives from the clean source and re-applies to the subject. Replace
   uploads a fresh, validated headshot. `target` = {assetId} or
   {subjectType, subjectId}; the latter also enables Replace. */
function PhotoEditor({ target, currentUrl, title, onSaved, onClose }) {
  const [spec, setSpec] = React.useState({ gravity: "face", zoom: 1, brighten: false, sharpen: false, removeBg: false });
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const fileRef = React.useRef(null);
  const set = (k, v) => setSpec(s => Object.assign({}, s, { [k]: v }));
  /* The preview image is the UN-zoomed base. Zoom is applied as a CSS scale
   * about the crop anchor, which is exactly what the fractional crop does on
   * save — so dragging the slider is instant and costs no network, instead of
   * requesting a freshly-generated Cloudinary derivative per tick and sitting
   * on a blank frame while it renders. Only the discrete controls (focus,
   * brighten, sharpen, backdrop) fetch a new base. */
  const base = currentUrl ? cldWith(currentUrl, buildEditTransform(spec, true)) : "";
  const [shown, setShown] = React.useState(base);   // last base that finished loading
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!base) { setShown(""); return; }
    if (base === shown) return;
    let alive = true;
    setLoading(true);
    const im = new Image();
    // Swap only once the new base has decoded, so the frame never goes blank.
    im.onload = () => { if (alive) { setShown(base); setLoading(false); } };
    im.onerror = () => { if (alive) setLoading(false); };
    im.src = base;
    return () => { alive = false; };
  }, [base]);

  const save = async () => {
    setBusy("save"); setErr("");
    try { const r = await NGGApi.admin.photos.edit(target, spec); onSaved && onSaved(r.url); onClose && onClose(); }
    catch (e) { setErr(e.code === "not_editable" ? "This photo isn't a Cloudinary image — use Replace to edit it." : e.code === "no_photo" ? "No photo on file yet — use Replace to add one." : (e.code || e.message)); setBusy(""); }
  };
  const replace = async (file) => {
    if (!target.subjectId) { setErr("Can't replace here."); return; }
    setBusy("replace"); setErr("");
    try {
      /* Same rule as the public taker: the pre-read may refuse an image that
         cannot make a printed card, and only advises about the rest. An admin
         choosing a dim photo on purpose is making a decision, not a mistake. */
      let check = { ok: true };
      try {
        const im = await loadImageEl(URL.createObjectURL(file));
        check = await validateHeadshot(im, im.naturalWidth, im.naturalHeight);
      } catch (_) { /* undecodable — let the upload pipeline name the reason */ }
      if (!check.ok) { setErr(check.reason); setBusy(""); return; }
      const up = await NGGApi.uploadOrInline(file, "headshot");
      const r = await NGGApi.admin.photos.replace(target.subjectType, target.subjectId, up.url);
      onSaved && onSaved(r.editedUrl || up.url); onClose && onClose();
    } catch (e) {
      setErr(e.code === "photo_format" ? photoFormatHelp(e) : "Couldn't replace — " + (e.code || e.message));
      setBusy("");
    }
  };

  /* ── Studio: the same edits, done on the device ──────────────────────────
   * Quick mode asks Cloudinary to reframe by rule (crop toward the face, this
   * much zoom) and every change is a round trip. Studio hands the operator the
   * actual frame: drag the crop, straighten, flip, set the tone, and it is all
   * local pixels updating as you move. What gets uploaded is the finished
   * 900×1125 frame, so the card is cut from the crop somebody chose rather
   * than from a server-side guess at where the face is — and it keeps working
   * when Cloudinary's credits run out.
   *
   * Background removal is the one thing left on Cloudinary: it is an AI
   * service, not a filter, and there is no honest local equivalent. */
  const OUT_W = 900, OUT_H = 1125;                 // 4:5, comfortably over 350 DPI
  const [tab, setTab] = React.useState("quick");   // quick | studio
  const [tone, setTone] = React.useState({ brightness: 0, contrast: 0, sharpen: 0 });
  // Quarter turns and the straighten angle are tracked apart and combined on
  // every change: Cropper's rotateTo is absolute, so driving it from the
  // slider alone would silently undo a 90° turn the moment you straightened.
  const [quarter, setQuarter] = React.useState(0);
  const [fine, setFine] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const imgRef = React.useRef(null);
  const cropRef = React.useRef(null);

  // Edit the CLEAN source, not the already-cropped delivery URL — editing a
  // derivative would bake one crop inside another.
  const sourceUrl = currentUrl ? cldWith(currentUrl, "") : "";

  React.useEffect(() => {
    if (tab !== "studio" || !sourceUrl) return;
    let alive = true, inst = null;
    setReady(false); setErr(""); setQuarter(0); setFine(0);
    (async () => {
      try {
        const T = await NGGApi.imageTools();
        const Cropper = await T.ensureCropper();
        if (!alive || !imgRef.current) return;
        inst = new Cropper(imgRef.current, {
          aspectRatio: OUT_W / OUT_H,
          viewMode: 1, autoCropArea: 0.92, background: false,
          responsive: true, checkOrientation: true, movable: true,
          zoomable: true, guides: true, center: true,
          ready: () => { if (alive) setReady(true); },
        });
        cropRef.current = inst;
      } catch (e) { if (alive) setErr("Couldn't open the studio — " + (e.message || e)); }
    })();
    return () => { alive = false; if (inst) { try { inst.destroy(); } catch (e) {} } cropRef.current = null; };
  }, [tab, sourceUrl]);

  const studioAct = (fn) => { const c = cropRef.current; if (c) { try { fn(c); } catch (e) {} } };
  const turn = (deg) => { const q = quarter + deg; setQuarter(q); studioAct(c => c.rotateTo(q + fine)); };
  const applyStudio = async () => {
    const c = cropRef.current;
    if (!c || !target.subjectId) { setErr(target.subjectId ? "Nothing to apply yet." : "Can't save here — open this from a card."); return; }
    setBusy("studio"); setErr("");
    try {
      const T = await NGGApi.imageTools();
      const canvas = await T.renderCrop(c, OUT_W, OUT_H, tone);
      if (!canvas) throw new Error("render_failed");
      const blob = await T.toBlob(canvas, "image/jpeg", 0.92);
      if (!blob) throw new Error("encode_failed");
      const file = new File([blob], "headshot.jpg", { type: "image/jpeg" });
      // Send as a fresh source and point the subject at it. No Cloudinary
      // transform is involved — the frame is already exactly what we want, and
      // with no cloud configured the bytes travel inline and the server holds them.
      const up = await NGGApi.uploadOrInline(file, "headshot");
      const r = await NGGApi.admin.photos.replace(target.subjectType, target.subjectId, up.url);
      onSaved && onSaved(r.editedUrl || up.url); onClose && onClose();
    } catch (e) {
      setErr("Couldn't apply the edit — " + (e.code || e.message || e)); setBusy("");
    }
  };

  const chip = (k, v, label) => (
    <button type="button" onClick={() => set(k, v)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + (spec[k] === v ? "#16223e" : "rgba(12,20,50,.18)"), background: spec[k] === v ? "#16223e" : "transparent", color: spec[k] === v ? "#fff" : "#16223e", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>{label}</button>
  );
  const toggle = (k, label) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={!!spec[k]} onChange={e => set(k, e.target.checked)}/> {label}
    </label>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit photo" onClick={e => { if (e.target === e.currentTarget && !busy) onClose && onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,10,24,.6)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ maxWidth: 560, width: "100%", background: "#fff", borderRadius: 16, padding: 20, maxHeight: "92vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Edit photo{title ? " — " + title : ""}</h3>
          <button onClick={() => !busy && onClose && onClose()} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["quick", "Quick", "Rule-based reframe, rendered by Cloudinary"], ["studio", "Studio", "Crop, straighten and tone on this device"]].map(([k, lbl, tip]) => (
            <button key={k} role="tab" aria-selected={tab === k} title={tip} disabled={!!busy} onClick={() => setTab(k)}
              style={{ padding: "7px 15px", borderRadius: 9, border: "1px solid " + (tab === k ? "#16223e" : "rgba(12,20,50,.18)"), background: tab === k ? "#16223e" : "transparent", color: tab === k ? "#fff" : "#16223e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{lbl}</button>
          ))}
        </div>
        {tab === "studio" ? (
          <div>
            <div style={{ background: "#0d1426", borderRadius: 12, overflow: "hidden", maxHeight: "48vh" }}>
              {sourceUrl
                ? <img ref={imgRef} src={sourceUrl} alt="Source" crossOrigin="anonymous" style={{ maxWidth: "100%", display: "block" }}/>
                : <div style={{ display: "grid", placeItems: "center", height: 220, color: "#889" }}>No photo to edit</div>}
            </div>
            {!ready && sourceUrl && <p className="mono" style={{ fontSize: 11, color: "#889", margin: "8px 0 0" }}>Loading the studio…</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {[
                ["\u27F2 90\u00B0", () => turn(-90)],
                ["\u27F3 90\u00B0", () => turn(90)],
                ["\u21CB Flip", () => studioAct(c => c.scaleX(-(c.getData().scaleX || 1)))],
                ["\u21F5 Flip", () => studioAct(c => c.scaleY(-(c.getData().scaleY || 1)))],
                ["Reset", () => { setQuarter(0); setFine(0); setTone({ brightness: 0, contrast: 0, sharpen: 0 }); studioAct(c => c.reset()); }],
              ].map(([lbl, fn]) => (
                <button key={lbl} type="button" disabled={!ready || !!busy} onClick={fn}
                  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(12,20,50,.18)", background: "transparent", color: "#16223e", fontWeight: 600, fontSize: 12.5, cursor: ready ? "pointer" : "not-allowed", opacity: ready ? 1 : .5 }}>{lbl}</button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#889", marginBottom: 6 }}>STRAIGHTEN · {fine}°{quarter ? " (+" + quarter + "° turn)" : ""}</div>
              <input type="range" min="-15" max="15" step="0.5" value={fine} disabled={!ready}
                onChange={e => { const v = parseFloat(e.target.value); setFine(v); studioAct(c => c.rotateTo(quarter + v)); }}
                style={{ width: "100%" }} aria-label="Straighten"/>
            </div>
            {[["brightness", "BRIGHTNESS", -100, 100], ["contrast", "CONTRAST", -100, 100], ["sharpen", "SHARPEN", 0, 100]].map(([k, lbl, lo, hi]) => (
              <div key={k} style={{ marginTop: 10 }}>
                <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#889", marginBottom: 6 }}>{lbl} · {tone[k] || 0}</div>
                <input type="range" min={lo} max={hi} step="1" value={tone[k] || 0} disabled={!ready}
                  onChange={e => setTone(t => Object.assign({}, t, { [k]: parseInt(e.target.value, 10) }))}
                  style={{ width: "100%" }} aria-label={lbl}/>
              </div>
            ))}
            <p className="mono" style={{ fontSize: 11, color: "#99a", marginTop: 10 }}>
              Runs entirely on this device {"—"} nothing is sent until you apply, and the tone sliders bake into the {OUT_W}{"×"}{OUT_H} frame that gets uploaded. Reframing only; never generative.
            </p>
            {err && <p role="alert" style={{ color: "var(--coral, #ff5a3c)", fontSize: 13, margin: "12px 0 0" }}>{err}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" disabled={!!busy || !ready || !target.subjectId} onClick={applyStudio}>{busy === "studio" ? "Applying…" : "Apply & save"}</button>
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => onClose && onClose()}>Cancel</button>
            </div>
          </div>
        ) : (<>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", width: 168, height: 210, borderRadius: 12, overflow: "hidden", background: "linear-gradient(180deg,#dff0fb 55%,#8fbb3f 90%)", border: "1px solid rgba(12,20,50,.14)", flex: "0 0 auto" }}>
            {shown
              ? <img src={shown} alt="Preview" style={{
                  width: "100%", height: "100%", objectFit: "cover", display: "block",
                  transform: "scale(" + spec.zoom + ")",
                  transformOrigin: EDIT_ORIGIN[spec.gravity] || "50% 50%",
                }}/>
              : <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#889" }}>{base ? "Loading…" : "No photo"}</div>}
            {loading && shown && <span className="mono" style={{ position: "absolute", right: 6, bottom: 6, fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "rgba(12,20,50,.62)", color: "#fff" }}>updating…</span>}
          </div>
          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#889", marginBottom: 6 }}>CROP FOCUS</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{chip("gravity", "face", "Face")}{chip("gravity", "center", "Centre")}{chip("gravity", "north", "Top")}{chip("gravity", "south", "Bottom")}</div>
            </div>
            <div>
              {/* 1× is already the widest framing the source allows — c_fill
                  at 1× shows the full extent cropped to the card's 4:5 — so
                  the slider only zooms in. It used to offer 0.6× and nothing
                  below 1× could ever have had an effect. */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "#889" }}>ZOOM · {spec.zoom.toFixed(2)}×</span>
                {spec.zoom > 1.005 && <button type="button" onClick={() => set("zoom", 1)} style={{ border: "none", background: "none", color: "#16223e", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>reset</button>}
              </div>
              <input type="range" min="1" max="2.5" step="0.05" value={spec.zoom} onChange={e => set("zoom", parseFloat(e.target.value))} style={{ width: "100%" }} aria-label="Zoom"/>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {toggle("brighten", "Brighten")}
              {toggle("sharpen", "Sharpen (unsharp — no generative)")}
              {toggle("removeBg", "Clean studio backdrop")}
            </div>
          </div>
        </div>
        {err && <p role="alert" style={{ color: "var(--coral, #ff5a3c)", fontSize: 13, margin: "12px 0 0" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={!!busy || !base} onClick={save}>{busy === "save" ? "Saving…" : "Save edit"}</button>
          {target.subjectId && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => fileRef.current && fileRef.current.click()}>{busy === "replace" ? "Uploading…" : "Replace photo"}</button>}
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => onClose && onClose()}>Cancel</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) replace(f); e.target.value = ""; }}/>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "#99a", marginTop: 10 }}>Edits reframe/adjust the existing photo only — never generative. The change applies to the card and profile immediately.</p>
        </>
        )}
      </div>
    </div>
  );
}

function Uploader({ kind = "proof", accept, onUploaded, compact }) {
  // 'signed'  — full Cloudinary keys, the normal path
  // 'public'  — only a cloud name + unsigned preset. Still a working upload,
  //             and the shape a lot of deployments actually have. This used to
  //             count as "uploads off", which is why the centre hero ("giant
  //             model") field showed a URL box and no upload button at all.
  // 'off'     — neither. The button stays, disabled, saying why. Rendering
  //             nothing is indistinguishable from a broken page.
  const [mode, setMode] = useState(null);   // null = still asking
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    NGGApi.config().then(c => {
      if (!alive) return;
      if (c && c.uploads && c.uploads.enabled) setMode("signed");
      else if (c && c.publicUpload && c.publicUpload.enabled) setMode("public");
      else setMode("off");
    }).catch(() => alive && setMode("off"));
    return () => { alive = false; };
  }, []);

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setBusy(true); setPct(0);
    try {
      // Try the signed path, then the unsigned one — a deployment can have
      // either, and which it has is not this component's business.
      let r;
      try { r = await NGGApi.uploadFile(file, kind, setPct); }
      catch (e1) { r = await NGGApi.uploadPublic(file, setPct); }
      onUploaded && onUploaded(r.url, r);
      if (window.toast) toast.success("Uploaded", file.name);
    } catch (err) {
      if (window.toast) toast.error("Upload failed", err.message || String(err));
    } finally { setBusy(false); }
  };

  const off = mode === "off";
  return (
    <span className={"uploader" + (compact ? " uploader-compact" : "")}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={pick} disabled={busy || mode === null}/>
      <button type="button" className="btn btn-ghost btn-sm uploader-btn" disabled={busy || mode === null || off}
        title={off ? "Image uploads aren't configured on this server (Cloudinary keys or an unsigned preset are missing). Paste a direct https:// image URL instead." : undefined}
        onClick={() => inputRef.current && inputRef.current.click()}>
        {busy ? ("Uploading " + pct + "%") : mode === null ? "…" : off ? "Upload unavailable" : "↑ Upload"}
      </button>
      {busy && <span className="uploader-bar" aria-hidden="true"><span className="uploader-bar-fill" style={{ width: pct + "%" }}/></span>}
    </span>
  );
}

/* ---- Accessibility widget ----------------------------------------------
   A persistent, keyboard-operable control panel that lets any visitor tune the
   site to their needs: magnify text, force high contrast, stop motion, switch
   to a high-legibility font, and underline every link. Preferences persist in
   localStorage and are applied to <html> via data attributes (see styles.css).
   An inline bootstrap in index.html applies them before first paint. */
const A11Y_KEY = "ngg.a11y";
const A11Y_DEFAULTS = { contrast: false, motion: false, readable: false, underline: false, lite: null };

/* LITE (owner, 7 Nov 2026: "the site cannot run on low end devices … create a lite version"). One
   site, drawn more cheaply: no animations or transitions, no backdrop blur, no scroll effects — the
   work a cheap phone's GPU and CPU stall on. `lite` is true/false when chosen, null for AUTOMATIC:
   on when the phone reports ≤ 2 GB of memory or ≤ 2 cores, asks to save data, or is on 2G/3G. The
   same test runs before first paint in index.html; keep the two in step. */
function nggLiteAuto() {
  try {
    const n = navigator, c = n.connection || {};
    return !!((n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || ""));
  } catch (_) { return false; }
}
function nggLiteOn(s) { return s.lite === true || (s.lite == null && nggLiteAuto()); }

function applyA11y(s) {
  const root = document.documentElement;
  root.setAttribute("data-contrast", s.contrast ? "high" : "normal");
  root.setAttribute("data-motion", s.motion ? "reduce" : "auto");
  root.setAttribute("data-font", s.readable ? "readable" : "default");
  root.setAttribute("data-links", s.underline ? "underline" : "default");
  root.setAttribute("data-lite", nggLiteOn(s) ? "on" : "off");
}

// Read the visitor's OS accessibility preferences so we can honour them by
// default (smart: no need to toggle what the system already asked for).
function osA11y() {
  const mm = (q) => typeof window !== "undefined" && window.matchMedia && window.matchMedia(q).matches;
  return { motion: mm("(prefers-reduced-motion: reduce)"), contrast: mm("(prefers-contrast: more)") };
}

/* The a11y preferences themselves, shared by every surface that offers them.
 * Device-local (localStorage), not per-account — they describe how this person
 * needs THIS screen to behave, which is not something to make them sign in for.
 */
function useA11yState() {
  const [autoOs, setAutoOs] = React.useState(false); // seeded from the OS, not chosen
  const [s, setS] = React.useState(() => {
    try {
      const saved = localStorage.getItem(A11Y_KEY);
      if (saved) return Object.assign({}, A11Y_DEFAULTS, JSON.parse(saved));
    } catch (_) {}
    // First visit — inherit the operating system's accessibility settings.
    return Object.assign({}, A11Y_DEFAULTS, osA11y());
  });
  React.useEffect(() => { try { if (!localStorage.getItem(A11Y_KEY)) { const o = osA11y(); setAutoOs(o.motion || o.contrast); } } catch (_) {} }, []);
  React.useEffect(() => {
    applyA11y(s);
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(s)); } catch (_) {}
    const live = document.getElementById("ngg-a11y-live");
    if (live) live.textContent = "Accessibility settings updated";
  }, [s]);
  return {
    s, autoOs,
    set: (k, v) => setS(o => Object.assign({}, o, { [k]: v })),
    reset: () => setS({ ...A11Y_DEFAULTS }),
    anyOn: s.contrast || s.motion || s.readable || s.underline,
  };
}

/* The controls, with no chrome of their own, so the same panel can sit in a
 * nav dropdown on the public site and in a settings page in the Control Room.
 * There is one implementation because there is one set of preferences; two
 * would drift, and a toggle that disagrees with itself is worse than none. */
function A11ySettingsPanel({ heading }) {
  const { s, autoOs, set, reset, anyOn } = useA11yState();
  return (
    <div className="a11y-settings">
      {heading && <h3 className="a11y-settings-h">{heading}</h3>}
      {autoOs && (
        <p className="a11y-auto">✓ Matched to your device's accessibility settings. Tweak anything below.</p>
      )}
      <p className="a11y-tip">Tip: press <kbd>Ctrl</kbd>/<kbd>⌘</kbd> and <kbd>+</kbd> to enlarge the page.</p>
      <A11yToggle label="High contrast" desc="Stronger colours + borders" on={s.contrast} onChange={v => set("contrast", v)}/>
      <A11yToggle label="Reduce motion" desc="Stop animations + transitions" on={s.motion} onChange={v => set("motion", v)}/>
      <A11yToggle label="Readable font" desc="High-legibility, spaced type" on={s.readable} onChange={v => set("readable", v)}/>
      <A11yToggle label="Underline links" desc="Underline every link" on={s.underline} onChange={v => set("underline", v)}/>
      <A11yToggle label="Lite mode" desc={"Faster on low-end phones: no animations, blur or scroll effects" + (s.lite == null && nggLiteAuto() ? " — on automatically for this device" : "")}
        on={nggLiteOn(s)} onChange={v => set("lite", v)}/>
      <button className="a11y-reset" onClick={reset} disabled={!anyOn}>Reset to defaults</button>
    </div>
  );
}

/* The nav entry point. Previously a fixed-position button floating over the
 * page corner, which is how it ended up overlapping the community workspace,
 * the back-to-top control and the composer — each fixed later by nudging its
 * coordinates for that one screen. It now lives in the nav's action row like
 * every other control, so it cannot cover content at all.
 *
 * Still one tap from anywhere, and deliberately NOT moved behind a sign-in:
 * the people most likely to need it include the ones who have not made an
 * account yet. */
function A11yNavButton() {
  const [open, setOpen] = React.useState(false);
  const { anyOn } = useA11yState();
  const wrapRef = React.useRef(null);
  const btnRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); if (btnRef.current) btnRef.current.focus(); } };
    // Dismiss on a click anywhere outside, the way the other nav menus behave.
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    const first = wrapRef.current && wrapRef.current.querySelector(".a11y-settings button");
    if (first) first.focus();
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <div className="a11y-nav" ref={wrapRef}>
      <button
        ref={btnRef}
        className={"a11y-nav-btn" + (open ? " is-open" : "")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={"Accessibility options" + (anyOn ? " (some are on)" : "")}
        title="Accessibility"
        onClick={() => setOpen(v => !v)}
      >
        <span aria-hidden="true">♿</span>
        {anyOn && <span className="a11y-nav-dot" aria-hidden="true"/>}
      </button>
      {open && (
        <div className="a11y-pop" role="dialog" aria-label="Accessibility options">
          <div className="a11y-panel-head">
            <h2 className="a11y-panel-title">Accessibility</h2>
            <button className="a11y-panel-close" onClick={() => setOpen(false)} aria-label="Close accessibility options">✕</button>
          </div>
          <A11ySettingsPanel/>
        </div>
      )}
    </div>
  );
}

function A11yToggle({ label, desc, on, onChange }) {
  return (
    <label className="a11y-toggle">
      <span>
        <span className="a11y-label">{label}</span>
        <span className="a11y-desc">{desc}</span>
      </span>
      {/* The painted track is its own element so the BUTTON can be 44px tall
          on a touch screen while the switch still looks like a 46×28 switch.
          A pseudo-element hit area would not have worked: it does not enlarge
          the element's own box, so the control would measure as reachable to
          a human and as 28px to every tool. */}
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={"a11y-switch" + (on ? " is-on" : "")} onClick={() => onChange(!on)}>
        <span className="a11y-switch-track"><span className="a11y-switch-knob"/></span>
      </button>
    </label>
  );
}


/* ── Signature pad ───────────────────────────────────────────────────────────
   Draws to a canvas with pointer events, exports a trimmed PNG data URI.

   A consent record with no signature is a note saying somebody ticked a box.
   This is what makes the printed document evidence: the mark the parent
   actually made, captured at the moment they made it.

   Pointer events rather than mouse+touch: one code path covers a finger on a
   phone at a registration desk, a stylus, and a mouse, and it does not fight
   the browser over which fired first. `touch-action: none` stops the page
   scrolling out from under someone mid-signature, which is the single most
   common way these are unusable on a phone.

   The canvas is sized to its own layout box times devicePixelRatio, so a
   signature drawn on a phone is not a blurry upscale when it reaches A4. */
function SignaturePad({ value, onChange, height = 150, label = "Signature" }) {
  const wrapRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  const last = React.useRef(null);

  const ctx2d = () => {
    const c = canvasRef.current;
    return c ? c.getContext("2d") : null;
  };

  // Size the backing store to the CSS box. Re-run on resize, because a phone
  // rotating mid-signature would otherwise stretch what was already drawn.
  React.useEffect(() => {
    const fit = () => {
      const c = canvasRef.current, wrap = wrapRef.current;
      if (!c || !wrap) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(120, wrap.clientWidth);
      // Preserve what is already there across a resize.
      const prev = dirty.current ? c.toDataURL("image/png") : "";
      c.width = Math.round(w * dpr);
      c.height = Math.round(height * dpr);
      c.style.width = w + "px";
      c.style.height = height + "px";
      const g = c.getContext("2d");
      g.scale(dpr, dpr);
      g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#11131a";
      if (prev) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, w, height); im.src = prev; }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [height]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture && canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true; last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const g = ctx2d(); if (!g) return;
    const p = pos(e);
    g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke();
    last.current = p; dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    // Export on release rather than per-stroke: a data URL per pointermove
    // would re-encode the whole canvas hundreds of times while signing.
    if (dirty.current && onChange) onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current, g = ctx2d();
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange && onChange("");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5a6488" }}>{label}</span>
        <button type="button" onClick={clear} style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, color: "#8a8a80", textDecoration: "underline", cursor: "pointer" }}>Clear</button>
      </div>
      <div ref={wrapRef} style={{ position: "relative", border: "1px dashed #c9cbd6", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          aria-label={label}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
        />
        {!value && (
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "#b9bcc7", fontSize: 13.5 }}>
            Sign here with your finger or mouse
          </span>
        )}
      </div>
    </div>
  );
}


/**
 * One CSV cell, safe to open in a spreadsheet.
 *
 * These exports carry names, guardian details and free text typed into public
 * forms. Excel, Google Sheets and LibreOffice all treat a cell beginning with
 * =, +, - or @ as a FORMULA, so a volunteer who applies under the name
 * `=HYPERLINK("http://…"&A1,"Payroll")` gets that formula executed on the
 * machine of whichever member of staff opens the export. Quoting alone does not
 * prevent it — the parser strips the quotes first.
 *
 * The fix is the standard one: prefix a leading formula character with an
 * apostrophe, which every spreadsheet reads as "this is text". Tab and carriage
 * return are included because they are also treated as leading whitespace and
 * skipped before the formula test.
 */
function nggCsvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}


/* ============================================================================
   In-page viewers — markdown, video, PDF.

   All three are built here rather than pulled in as libraries. That is a
   deliberate trade for this project: the app is a no-build bundle served from
   shared hosting to phones on Nigerian mobile data, and a markdown parser plus
   a PDF renderer plus a video framework is comfortably more JavaScript than the
   entire rest of the site. These do the part that is actually used.

   Nothing here uses dangerouslySetInnerHTML. The markdown renderer emits React
   nodes, so a post cannot inject markup no matter what a member types — which
   matters more than usual on a feed written by children and read by children.
   ========================================================================== */

/** Inline spans: `code`, *bold*, _italic_, ~strike~, [text](https://…). */
function nggMdInline(line, kp) {
  const out = [];
  let last = 0, idx = 0, m;
  // Links first so their label is not eaten by the emphasis rules.
  const re = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const k = kp + (idx++);
    if (m[1] != null) {
      /* rel="noopener noreferrer" is not decoration: without it the opened page
         gets a handle on this one through window.opener. */
      out.push(<a key={k} href={m[2]} target="_blank" rel="noopener noreferrer nofollow ugc">{m[1]}</a>);
    }
    else if (m[3] != null) out.push(<code key={k} className="cm-code">{m[3]}</code>);
    else if (m[4] != null) out.push(<b key={k}>{m[4]}</b>);
    else if (m[5] != null) out.push(<b key={k}>{m[5]}</b>);
    else if (m[6] != null) out.push(<em key={k}>{m[6]}</em>);
    else out.push(<s key={k}>{m[7]}</s>);
    last = re.lastIndex;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/**
 * Markdown → React nodes. Block level: headings, lists, quotes, fenced code,
 * rules, paragraphs.
 *
 * Headings start at <h4>, not <h1>. These render inside a feed card that already
 * sits under the page's own headings, and a member typing "# Hi" should not be
 * able to insert a document-level heading into somebody else's page outline.
 */
/**
 * What a fenced block becomes. ONE decision, used by BOTH lesson renderers.
 *
 * There are two markdown renderers here: NggMarkdown, and CurriculumText for
 * a lesson body. The lesson diagrams (lesson-blocks.jsx) were wired into
 * NggMarkdown alone, and a lesson is rendered by CurriculumText — so every
 * ```keys, ```chord and ```staff an instructor wrote came out as a code
 * block on the member's screen, and the editor's own preview agreed with it,
 * which is the worst way for a renderer to be wrong. Verifying NggMarkdown in
 * a browser proved the plumbing and not the path.
 *
 * Two renderers is already one more than this codebase should have. Until
 * they are one, the part that decides what a fence MEANS is shared, so they
 * cannot disagree about it again. tests/curriculum-ui.test.js asserts a
 * diagram reaches the member's screen, not just this function.
 */
function nggFenceBlock(lang, args, code, key, preClass) {
  const d = typeof lessonBlockFor === "function" ? lessonBlockFor(lang, (args || "").trim() || code.trim()) : null;
  if (d) { const D = d.Component; return <D key={key} args={d.args}/>; }
  const full = (args || "").trim() ? [(args || "").trim(), code].filter(x => x !== "").join("\n") : code;
  return <pre key={key} className={preClass}><code>{full}</code></pre>;
}

function NggMarkdown({ text, className }) {
  const src = String(text || "");
  const lines = src.split("\n");
  const blocks = [];
  let i = 0, key = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* Fenced code — taken verbatim, including any markdown inside it.
       A fence may carry arguments after its language (```keys C E G). When the
       language names a lesson diagram (lesson-blocks.jsx) it is DRAWN; any
       other language, and any fence where that file is not loaded, stays a
       code block — which is what a Coding lesson wants and what the Word
       export and a plain-text copy fall back to. */
    const fence = line.match(/^```\s*([a-z0-9+#-]*)\s*(.*)$/i);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of input — an unclosed fence still renders)
      blocks.push(nggFenceBlock(fence[1], fence[2], body.join("\n"), key++, "md-pre"));
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { blocks.push(<hr key={key++} className="md-hr"/>); i++; continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const Tag = ["h4", "h5", "h6"][h[1].length - 1];
      blocks.push(<Tag key={key++} className={"md-h md-h" + h[1].length}>{nggMdInline(h[2], "h" + key + "-")}</Tag>);
      i++; continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={key++} className="md-quote">{body.map((b, j) => <p key={j}>{nggMdInline(b, "q" + key + "-" + j + "-")}</p>)}</blockquote>);
      continue;
    }

    const ul = /^\s*[-*+]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={key++} className="md-list">{items.map((it, j) => <li key={j}>{nggMdInline(it, "li" + key + "-" + j + "-")}</li>)}</List>);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    // Paragraph: consecutive non-blank lines that start no other block.
    const para = [];
    while (i < lines.length && lines[i].trim() !== ""
      && !/^```/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i])
      && !ul.test(lines[i]) && !ol.test(lines[i]) && !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="md-p">
        {para.map((l, j) => (
          <React.Fragment key={j}>
            {nggMdInline(l, "p" + key + "-" + j + "-")}
            {j < para.length - 1 && <br/>}
          </React.Fragment>
        ))}
      </p>
    );
  }
  return <div className={"md " + (className || "")}>{blocks}</div>;
}

/* ── One way to write a date, and one way to write a number ──────────────────
 *
 * This product used to have three. Counted across the sources: 25 bare
 * `toLocaleString()` calls, 13 more passing `undefined` as the locale, 7
 * pinned to en-GB and 3 to en-US. The bare and undefined ones render in
 * whatever locale the DEVICE is set to, so two coordinators looking at the
 * same record saw different strings; the pinned ones disagreed with each
 * other outright. 08/09/2026 is the 8th of September on one screen in this app
 * and the 9th of August on another, and nothing on either screen says which.
 *
 * Two of those calls outlived their screen: a generated analytics PDF stamped
 * with the exporter's device locale, and an events table with US month names.
 *
 * So: one locale, chosen and stated. en-GB, because the programme is Nigerian
 * and Nigeria writes dates day-first — and because a fixed wrong-ish locale is
 * still better than a variable one, since a report has to mean the same thing
 * to the person who exports it and the person who reads it a month later.
 *
 * Every one of these takes anything — a Date, an ISO string, a number, null,
 * a string that is not a date — and returns "" for what it cannot read. A
 * formatter that throws on bad input is a formatter that takes a screen down
 * because one row had an empty column.                                       */

const NGG_LOCALE = "en-GB";

/** Anything → a Date, or null. Accepts the "YYYY-MM-DD HH:MM:SS" the API
 *  sometimes returns, which Safari refuses to parse without the T. */
function nggDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  const s = String(v).trim();
  if (!s) return null;
  let d = new Date(s);
  if (isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) d = new Date(s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d;
}

/** "22 Aug 2026". The default for anything a person reads and might act on. */
function fmtDate(v) {
  const d = nggDate(v);
  return d ? d.toLocaleDateString(NGG_LOCALE, { day: "numeric", month: "short", year: "numeric" }) : "";
}
/** "22 Aug" — for a list where the year is obvious from context. */
function fmtDayMonth(v) {
  const d = nggDate(v);
  return d ? d.toLocaleDateString(NGG_LOCALE, { day: "numeric", month: "short" }) : "";
}
/** "Saturday 22 August 2026" — for a single date that is the subject of a page. */
function fmtDateLong(v) {
  const d = nggDate(v);
  return d ? d.toLocaleDateString(NGG_LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
}
/** "14:30". Twenty-four hour, because a record is read later by somebody who
 *  was not there and "2:30" without a suffix has cost people a session. */
function fmtTime(v) {
  const d = nggDate(v);
  return d ? d.toLocaleTimeString(NGG_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
}
/** "4pm", "4:30pm" — how you tell a child when to turn up. Member-facing
 *  surfaces only; anything that is a RECORD uses fmtTime. */
function fmtTimeFriendly(v) {
  const d = nggDate(v);
  if (!d) return "";
  return d.toLocaleTimeString(NGG_LOCALE, { hour: "numeric", minute: "2-digit", hour12: true })
          .replace(":00", "").replace(/\s/g, "").toLowerCase();
}
/** "22 Aug 2026, 14:30". */
function fmtDateTime(v) {
  const d = nggDate(v);
  return d ? fmtDate(d) + ", " + fmtTime(d) : "";
}
/** "1,234". Integers keep their grouping; a fraction keeps up to `dp` places
 *  and drops trailing zeros, so 2.50 reads 2.5 and 2.00 reads 2. */
function fmtNum(n, dp) {
  const v = typeof n === "number" ? n : Number(n);
  if (v == null || !isFinite(v)) return "";
  return v.toLocaleString(NGG_LOCALE, { maximumFractionDigits: dp == null ? 0 : dp });
}
/** "₦1,234". The symbol is not part of the locale — this programme prices in
 *  naira wherever it is read from. */
function fmtMoney(n) {
  const v = typeof n === "number" ? n : Number(n);
  return "₦" + (isFinite(v) ? v.toLocaleString(NGG_LOCALE, { maximumFractionDigits: 0 }) : "0");
}

/* ── Prices in the family's own currency (domain/fx.php; owner, 25 Nov 2026) ──────────────────────────────
   The account is naira and payment is naira; what changes is what a family abroad READS beside the price:
   "₦13,000 · about £7". The currency is guessed from the device's time zone (never its locale, which says
   how to write numbers, not where the money is), remembered on this device once the family picks one, and
   shown only where the server has a rate. A dollar price staff promise ($10 for ₦13,000) is shown exactly. */
const NGG_FX_KEY = "ngg.currency";
const NGG_FX_EURO = ["Paris", "Berlin", "Madrid", "Rome", "Amsterdam", "Brussels", "Vienna", "Dublin", "Lisbon", "Athens", "Helsinki", "Luxembourg", "Bratislava", "Ljubljana", "Tallinn", "Riga", "Vilnius", "Valletta", "Nicosia", "Zagreb", "Monaco", "Andorra"];
const NGG_FX_ZONES = { "Europe/London": "GBP", "Europe/Belfast": "GBP", "Africa/Lagos": "NGN", "Africa/Accra": "GHS", "Africa/Nairobi": "KES",
  "Africa/Johannesburg": "ZAR", "Asia/Dubai": "AED", "Asia/Riyadh": "SAR", "Asia/Kolkata": "INR", "Asia/Calcutta": "INR", "Asia/Shanghai": "CNY",
  "Africa/Abidjan": "XOF", "Africa/Dakar": "XOF", "Africa/Lome": "XOF", "Africa/Porto-Novo": "XOF", "Africa/Ouagadougou": "XOF", "Africa/Bamako": "XOF", "Africa/Niamey": "XOF" };
const NGG_FX_CANADA = ["Toronto", "Vancouver", "Edmonton", "Winnipeg", "Halifax", "St_Johns", "Regina", "Montreal", "Moncton"];
/** The currency a device's time zone suggests, or "NGN". */
function nggFxGuess(tz) {
  let z = tz;
  if (z === undefined) { try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { z = ""; } }
  if (NGG_FX_ZONES[z]) return NGG_FX_ZONES[z];
  const [area, city] = String(z).split("/");
  if (area === "Europe" && NGG_FX_EURO.indexOf(city) >= 0) return "EUR";
  if (area === "America") return NGG_FX_CANADA.indexOf(city) >= 0 ? "CAD" : "USD";
  if (area === "Australia") return "AUD";
  return "NGN";
}
let __nggFx = null, __nggFxP = null;
function nggFxLoad() {
  if (!__nggFxP) __nggFxP = (window.NGGApi && NGGApi.public && NGGApi.public.fx ? NGGApi.public.fx() : Promise.reject(new Error("no api")))
    .then(r => (__nggFx = r || { rates: {}, currencies: [] })).catch(() => (__nggFx = { rates: {}, currencies: [] }));
  return __nggFxP;
}
function nggFxCode() { try { const v = localStorage.getItem(NGG_FX_KEY); if (v) return v; } catch (e) {} return nggFxGuess(); }
function nggFxSet(code) {
  try { localStorage.setItem(NGG_FX_KEY, code); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent("ngg-currency", { detail: code })); } catch (e) {}
}
/** "about £7" for a naira amount, or "" when the currency is naira or has no rate. */
function nggLocalPrice(naira, fx, code) {
  const n = Number(naira) || 0;
  if (!fx || !code || code === "NGN" || n <= 0) return "";
  const cur = (fx.currencies || []).find(c => c.code === code);
  const stated = fx.stated && fx.stated[code] && fx.stated[code][String(n)];
  if (cur && stated) return cur.symbol + Number(stated).toLocaleString(NGG_LOCALE);
  const rate = fx.rates && fx.rates[code];
  if (!cur || !rate) return "";
  const v = n / rate;
  return "about " + cur.symbol + (v < 10 ? (Math.round(v * 10) / 10).toLocaleString(NGG_LOCALE) : Math.round(v).toLocaleString(NGG_LOCALE));
}
/** The rates and the chosen currency, kept current when the family changes it. */
function useNggFx() {
  const [fx, setFx] = useState(__nggFx);
  const [code, setCode] = useState(nggFxCode);
  useEffect(() => {
    let live = true;
    nggFxLoad().then(r => { if (live) setFx(r); });
    const on = e => setCode(e.detail || nggFxCode());
    window.addEventListener("ngg-currency", on);
    return () => { live = false; window.removeEventListener("ngg-currency", on); };
  }, []);
  return { fx, code };
}
/** "Show prices in" — the family's own choice, remembered on this device. Hidden until rates exist. */
function NggCurrencyPick() {
  const { fx, code } = useNggFx();
  const list = (fx && fx.currencies) || [];
  if (list.length < 2) return null;
  const known = list.some(c => c.code === code);
  return <label className="ngg-currency-pick">
    <span>Show prices in</span>
    <select value={known ? code : "NGN"} onChange={e => nggFxSet(e.target.value)} aria-label="Currency to show prices in">
      {list.map(c => <option key={c.code} value={c.code}>{c.code === "NGN" ? "Naira only" : c.name + " (" + c.code + ")"}</option>)}
    </select>
    <small>You always pay in naira. Other currencies are approximate.</small>
  </label>;
}
/** A start time in the family's own clock, with Lagos time beside it when they differ. */
function nggLocalTime(iso, lagosLabel) {
  if (!iso) return lagosLabel || "";
  const d = new Date(iso);
  let mine = "", tz = "";
  try {
    mine = new Intl.DateTimeFormat(NGG_LOCALE, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(d);
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (e) { return lagosLabel || ""; }
  if (!tz || tz === "Africa/Lagos") return mine;
  return mine + " your time" + (lagosLabel ? " · " + lagosLabel.replace(/^.*?,\s*/, "") + " in Lagos" : "");
}

/** A guardian's answer to "why were they away?" (domain/make.php), as one
 *  line beside the absence. It explains the absence; it does not void it. */
const GUARDIAN_REASON_LABELS = { sick: "Sick", travelled: "Travelled", family: "Family matter", other: "Other" };
function guardianReasonText(g) {
  if (!g || !g.reason) return "";
  return "Guardian says: " + (GUARDIAN_REASON_LABELS[g.reason] || g.reason) + (g.note ? " — " + g.note : "")
    + (g.channel ? " (" + g.channel + ")" : "");
}

function nggFmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

/**
 * Video player.
 *
 * The native control bar differs on every browser, hides on mobile Safari at
 * the worst moments, and gives no playback-speed control — which is the one
 * control that matters for a recorded lesson. This is a thin shell over the
 * same <video> element: the element does the decoding, this does the buttons.
 *
 * Keyboard follows what people already know from YouTube: space/k play, arrows
 * seek, m mute, f fullscreen.
 */
function NggVideo({ src, poster, caption }) {
  const ref = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [t, setT] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const [vol, setVol] = React.useState(1);
  const [muted, setMuted] = React.useState(false);
  const [rate, setRate] = React.useState(1);
  const [rateOpen, setRateOpen] = React.useState(false);

  const v = () => ref.current;
  const toggle = () => { const el = v(); if (!el) return; el.paused ? el.play() : el.pause(); };
  const seekBy = (d) => { const el = v(); if (el) el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + d)); };
  const onKey = (e) => {
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "arrowright") { e.preventDefault(); seekBy(5); }
    else if (k === "arrowleft") { e.preventDefault(); seekBy(-5); }
    else if (k === "m") { const el = v(); if (el) { el.muted = !el.muted; setMuted(el.muted); } }
    else if (k === "f") { const w = wrapRef.current; if (w) (document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen && w.requestFullscreen()); }
  };

  return (
    <figure className="vp" ref={wrapRef} onKeyDown={onKey} tabIndex={0} aria-label="Video player">
      <video ref={ref} src={src} poster={poster} preload="metadata" playsInline
        onClick={toggle}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={e => setT(e.target.currentTime)}
        onDurationChange={e => setDur(e.target.duration || 0)}
        onVolumeChange={e => { setVol(e.target.volume); setMuted(e.target.muted); }}/>
      {!playing && <button className="vp-big" onClick={toggle} aria-label="Play">▶</button>}
      <div className="vp-bar">
        <button className="vp-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
        <input className="vp-seek" type="range" min={0} max={Math.max(dur, 0.1)} step="0.1" value={t}
          onChange={e => { const el = v(); if (el) el.currentTime = +e.target.value; }}
          aria-label="Seek" aria-valuetext={nggFmtTime(t) + " of " + nggFmtTime(dur)}/>
        <span className="vp-time">{nggFmtTime(t)} / {nggFmtTime(dur)}</span>
        <button className="vp-btn" onClick={() => { const el = v(); if (el) { el.muted = !el.muted; setMuted(el.muted); } }}
          aria-label={muted ? "Unmute" : "Mute"}>{muted || vol === 0 ? "🔇" : "🔊"}</button>
        <input className="vp-vol" type="range" min={0} max={1} step="0.05" value={muted ? 0 : vol}
          onChange={e => { const el = v(); if (el) { el.volume = +e.target.value; el.muted = +e.target.value === 0; } }}
          aria-label="Volume"/>
        <div className="vp-rate">
          <button className="vp-btn" onClick={() => setRateOpen(o => !o)} aria-expanded={rateOpen} aria-label="Playback speed">{rate}×</button>
          {rateOpen && <div className="vp-rate-menu" role="menu">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
              <button key={r} role="menuitemradio" aria-checked={rate === r}
                onClick={() => { const el = v(); if (el) el.playbackRate = r; setRate(r); setRateOpen(false); }}>{r}×</button>
            ))}
          </div>}
        </div>
        <button className="vp-btn" aria-label="Fullscreen"
          onClick={() => { const w = wrapRef.current; if (w) (document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen && w.requestFullscreen()); }}>⛶</button>
      </div>
      {caption && <figcaption className="vp-cap">{caption}</figcaption>}
    </figure>
  );
}

/* ── The document reader ──────────────────────────────────────────────────
 *
 * PDF.js, rendering real pages to a canvas, loaded only when a member opens a
 * document.
 *
 * The cost is not small and is worth naming: 486KB of library and a 1MB worker,
 * roughly 450KB gzipped between them, on connections where that is a real
 * expense. It buys three things the page-image approach could not:
 *
 *   · ANY pdf renders — one stored locally when no media cloud is configured,
 *     one attached from an older post, one a member downloaded and re-shared.
 *     Page images only ever worked for PDFs that happened to live on Cloudinary
 *     as image-type assets, which is a property of our upload plumbing rather
 *     than a property of the document.
 *   · The text is TEXT. It can be selected, copied, read by a screen reader and
 *     found with the browser's own find-in-page. A picture of a page is a
 *     picture: a homework sheet a member cannot copy a question out of, and a
 *     document a blind member cannot read at all.
 *   · Zoom is real. Pinching a JPEG enlarges its pixels; re-rendering at a
 *     higher scale enlarges the type.
 *
 * The expense is contained rather than argued away. Nothing here is fetched
 * until somebody taps Preview, one page renders at a time, and the worker keeps
 * parsing off the main thread — on the phones this is read on, rasterising a
 * page on the main thread locks the interface for seconds.
 */

/** Point pdf.js at its worker and its fonts. Idempotent; call before use. */
function nggPdfConfigure(lib) {
  if (lib && lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs.worker.min.js";
  }
  return lib;
}

/* Documents are opened over the network, and the network is the thing that
   fails here. Loading options in one place so the failure modes are one set. */
const NGG_PDF_OPTS = {
  // Base-14 fonts for documents that reference one without embedding it —
  // most things exported by older Word, and by phone scanner apps.
  standardFontDataUrl: "/vendor/pdfjs-standard-fonts/",
  // cmaps are NOT shipped (1.7MB, CJK only). A document that needs them fails
  // with a clear message rather than everybody paying for them.
  isEvalSupported: false,   // the CSP forbids eval; pdf.js has a slower path
};

/** One rendered page. Owns its canvas and cancels cleanly on change. */
function NggPdfPage({ doc, page, scale, onSize }) {
  const canvasRef = React.useRef(null);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let task = null;
    (async () => {
      try {
        const pg = await doc.getPage(page);
        if (cancelled) return;
        /* Render at the device's real pixel density, then let CSS scale it
           back down. Rendering at CSS pixels on a 3x phone screen produces
           type that looks like a fax. */
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = pg.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = Math.floor(vp.width / dpr) + "px";
        canvas.style.height = Math.floor(vp.height / dpr) + "px";
        if (onSize) onSize(Math.floor(vp.width / dpr), Math.floor(vp.height / dpr));
        task = pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
        await task.promise;
      } catch (e) {
        // A cancelled render is the expected outcome of turning the page
        // quickly; it is not a failure and must not be reported as one.
        if (!cancelled && !/cancell?ed/i.test(String(e && e.message))) {
          setErr("This page could not be drawn.");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (task && task.cancel) { try { task.cancel(); } catch (_) {} }
    };
  }, [doc, page, scale]); // eslint-disable-line

  if (err) return <div className="pdfv-pageerr">{err}</div>;
  return <canvas className="pdfv-canvas" ref={canvasRef} role="img"
                 aria-label={"Page " + page}/>;
}

/**
 * The document viewer.
 *
 * Closed by default. A feed can carry several documents and none of them should
 * spend a reader's data before the reader asks — the same rule the YouTube
 * embed already follows, and it matters far more now that opening one costs
 * half a megabyte of library.
 */
/**
 * The document reader.
 *
 * Two ways in, one reader. Left alone it renders its own card and opens when
 * that card is tapped — how a document arrives in a message. Given `open` and
 * `onClose` it renders no card at all and is driven from outside — how the
 * Files screen opens the same document from a list. A second reader for the
 * second entry point is how the two would drift apart.
 */
function NggPdf({ src, name, pages, bytes, open: openProp, onClose }) {
  const controlled = typeof openProp === "boolean";
  const [openState, setOpenState] = React.useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = React.useCallback((v) => {
    if (controlled) { if (!v && onClose) onClose(); return; }
    setOpenState(v);
  }, [controlled, onClose]);
  const [doc, setDoc] = React.useState(null);
  const [total, setTotal] = React.useState(Math.max(0, pages | 0));
  const [page, setPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(1);
  const [status, setStatus] = React.useState("idle"); // idle|loading|ready|failed
  const [failure, setFailure] = React.useState("");
  const [width, setWidth] = React.useState(0);
  const hostRef = React.useRef(null);
  const shellRef = React.useRef(null);
  const label = name || "Document";

  const close = React.useCallback(() => setOpen(false), []);

  /* Full-screen means the page underneath must stop being interactive: lock
     its scroll, take focus into the viewer, and answer the phone's own Back
     — on Android that is the button people press to leave, and a viewer that
     ignores it navigates the whole app away instead of closing a document. */
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => { if (shellRef.current) shellRef.current.focus(); }, 30);
    history.pushState({ pdfv: 1 }, "");
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
      window.removeEventListener("popstate", onPop);
    };
  }, [open]);

  /* Fit the page to the column it is being read in. A PDF is authored at a
     fixed size and a phone is 390px wide, so "scale 1" is the wrong default
     everywhere — the useful default is "as wide as there is room for". */
  const fitScale = React.useCallback((pdfPage) => {
    const host = hostRef.current;
    const avail = host ? Math.max(240, host.clientWidth - 20) : 340;
    const natural = pdfPage.getViewport({ scale: 1 }).width || 612;
    return avail / natural;
  }, []);
  const [base, setBase] = React.useState(0);

  React.useEffect(() => {
    if (!open || doc || status === "loading") return;
    let dead = false;
    setStatus("loading"); setFailure("");
    (async () => {
      try {
        const lib = nggPdfConfigure(await loadVendor("pdfjs"));
        const task = lib.getDocument(Object.assign({ url: src }, NGG_PDF_OPTS));
        const d = await task.promise;
        if (dead) { d.destroy(); return; }
        setDoc(d);
        setTotal(d.numPages);
        const first = await d.getPage(1);
        if (!dead) { setBase(fitScale(first)); setStatus("ready"); }
      } catch (e) {
        if (dead) return;
        const msg = String((e && e.message) || e);
        /* Say which failure it was. "Could not open" covers a missing file, a
           password, a CORS refusal and a browser that ran out of memory, and
           a reader can act on exactly one of those. */
        setFailure(
          /password/i.test(msg) ? "This document is password-protected."
          : /Missing PDF|404|Unexpected server response/i.test(msg) ? "This document could not be found on the server."
          : /Invalid PDF|corrupt/i.test(msg) ? "This file is not a readable PDF."
          : "This document could not be opened here.");
        setStatus("failed");
      }
    })();
    return () => { dead = true; };
  }, [open, src]); // eslint-disable-line

  // Release the worker's memory when the reader closes the document.
  React.useEffect(() => () => { if (doc) { try { doc.destroy(); } catch (_) {} } }, [doc]);

  // Re-fit when the column changes width (rotation, expand, desktop resize).
  React.useEffect(() => {
    if (!doc || !open) return;
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      doc.getPage(1).then(p => setBase(fitScale(p))).catch(() => {});
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [doc, open, fitScale]);

  const at = total ? Math.min(Math.max(1, page), total) : page;
  const turn = React.useCallback((d) => setPage(p => {
    const n = p + d;
    return n < 1 ? 1 : (total && n > total ? total : n);
  }), [total]);

  // Arrow keys page the document while the viewer has focus. Expected of
  // anything that shows a page number, and the only route for a keyboard user.
  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); turn(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(-1); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  const meta = [
    "PDF",
    total ? total + (total === 1 ? " page" : " pages") : "",
    bytes ? nggFmtBytes(bytes) : "",
  ].filter(Boolean).join(" · ");

  if (!open) {
    if (controlled) return null;   // the list that owns it draws its own row
    return (
      <div className="pdfv pdfv-closed">
        <button type="button" className="pdfv-open" onClick={() => setOpen(true)}
                aria-label={"Preview " + label}>
          <span className="pdfv-open-ic" aria-hidden="true">📄</span>
          <span className="pdfv-open-body">
            <span className="pdfv-open-name">{label}</span>
            <span className="pdfv-open-meta">{meta}</span>
          </span>
          <span className="pdfv-open-cta">Preview</span>
        </button>
      </div>
    );
  }

  /* FULL SCREEN. A document is a thing you read, not a thing you glance at
   * inside a feed, and a page rendered into a 300px-tall well between two
   * other people's messages is neither. Opening one takes the whole screen —
   * the reader is doing one thing now — and closing gives the feed back
   * exactly as it was.
   *
   * It also removes the worst of the small-screen arithmetic: no competing
   * with the tab bar for the bottom of the phone, no inner scroll area inside
   * an outer scroll area, and pinch-zoom that works on the page rather than
   * on a box containing the page.
   */
  /* PORTALLED to <body>, not rendered where it sits.
   *
   * `position: fixed` is measured against the nearest ancestor that has a
   * transform, filter or containment — and this viewer opens from inside a
   * message card, under a global `article:hover { transform: translateY(-3px) }`.
   * A hover three levels up was enough to turn a full-screen reader into a
   * 356x157 box wedged into the feed. Any future animation anywhere above it
   * would do the same. A full-screen layer must not be able to be captured by
   * its ancestors, so it does not live among them. */
  return ReactDOM.createPortal(
    <div className="pdfv-full" role="dialog" aria-modal="true" aria-label={label}
         onKeyDown={onKey} tabIndex={-1} ref={shellRef}>
      <header className="pdfv-bar">
        <button type="button" className="pdfv-x" onClick={close} aria-label="Close the document">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <span className="pdfv-name" title={label}>{label}</span>
        <a className="pdfv-act" href={src} download={label} aria-label="Download this document">
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor"
                  strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </header>

      <div className="pdfv-page" ref={hostRef}>
        {status === "loading" && (
          /* A skeleton the shape of a page, not a spinner. The wait here is
             the library downloading, which on a slow connection is long
             enough that a reader needs to see the shape of what is coming. */
          <div className="pdfv-skel" aria-live="polite" aria-label="Opening the document">
            <span className="pdfv-skel-line" style={{ width: "72%" }}/>
            <span className="pdfv-skel-line" style={{ width: "95%" }}/>
            <span className="pdfv-skel-line" style={{ width: "88%" }}/>
            <span className="pdfv-skel-line" style={{ width: "94%" }}/>
            <span className="pdfv-skel-line" style={{ width: "61%" }}/>
          </div>
        )}
        {status === "failed" && (
          <div className="pdfv-fallback">
            <p>{failure}</p>
            <a className="btn btn-primary btn-sm" href={src} target="_blank" rel="noopener noreferrer">
              Open it in a new tab
            </a>
          </div>
        )}
        {status === "ready" && doc && base > 0 && (
          <NggPdfPage doc={doc} page={at} scale={base * zoom} onSize={(w) => setWidth(w)}/>
        )}
      </div>

      {status === "ready" && (
        <footer className="pdfv-foot">
          <span className="pdfv-zoom" role="group" aria-label="Zoom">
            <button type="button" className="pdfv-round"
                    onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                    disabled={zoom <= 0.5} aria-label="Zoom out">−</button>
            <span className="pdfv-zoomv" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" className="pdfv-round"
                    onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                    disabled={zoom >= 3} aria-label="Zoom in">+</button>
          </span>
          {total > 1 && (
            <span className="pdfv-pager">
              <button type="button" className="pdfv-round" onClick={() => turn(-1)}
                      disabled={at <= 1} aria-label="Previous page">‹</button>
              <span className="pdfv-count" aria-live="polite">{at} / {total}</span>
              <button type="button" className="pdfv-round" onClick={() => turn(1)}
                      disabled={at >= total} aria-label="Next page">›</button>
            </span>
          )}
        </footer>
      )}
    </div>,
    document.body
  );
}

/** Human file size. Used by the document card and the viewer toolbar. */
function nggFmtBytes(n) {
  const b = Number(n) || 0;
  if (b <= 0) return "";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
  return (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + " MB";
}


/**
 * YouTube embed, loaded only when asked.
 *
 * The iframe is NOT in the page until a member presses play. Three reasons, in
 * order of how much they matter here:
 *
 *   1. A feed with six embedded videos otherwise opens six connections to
 *      Google and pulls the player bundle six times, on mobile data, before
 *      anybody has watched anything.
 *   2. Nothing is sent to YouTube about a child who merely scrolled past.
 *   3. It scrolls and renders like an image until it is a video.
 *
 * The src is built from an 11-character id the SERVER validated, never from a
 * pasted URL, so this cannot be steered into framing something else.
 * youtube-nocookie.com is the same player without the tracking cookie; rel=0
 * and modestbranding trim the end-of-video suggestions as far as the embed API
 * still allows.
 */
function NggYouTube({ id, thumb, title }) {
  const [playing, setPlaying] = React.useState(false);
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(id || ""))) return null;
  const label = title || "YouTube video";
  const poster = thumb || ("https://i.ytimg.com/vi/" + id + "/hqdefault.jpg");
  if (!playing) {
    return (
      <button type="button" className="yt yt-cover" onClick={() => setPlaying(true)}
        aria-label={"Play " + label + " on YouTube"}>
        <img src={poster} alt="" loading="lazy"/>
        <span className="yt-play" aria-hidden="true">▶</span>
        <span className="yt-badge" aria-hidden="true">YouTube</span>
      </button>
    );
  }
  return (
    <div className="yt">
      <iframe
        src={"https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&modestbranding=1&playsinline=1"}
        title={label} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin"/>
    </div>
  );
}

Object.assign(window, {
  nggCsvCell,
  NggMarkdown, NggVideo, NggPdf, NggYouTube, nggMdInline, nggFmtTime, nggFmtBytes,
  // One date, one number, one locale. See the block above nggDate.
  NGG_LOCALE, nggDate, fmtDate, fmtDayMonth, fmtDateLong, fmtTime, fmtTimeFriendly,
  fmtDateTime, fmtNum, fmtMoney,
  BrandLogo, Avatar, Photo, PhotoSlot,
  CountUp, Tag, SectionHead, Progress, TopNav, Footer, Sparkline,
  usePublicData, useSession, useStats, sessionLabel, sessionDaysToStart,
  // The contrast arithmetic, exported so preflight and the colour pickers use
  // the SAME numbers the renderer inks with rather than a second copy of it.
  inkOn, inkLum, inkContrast, inkIsLegible, INK_CROSSOVER_L,
  loadVendor, VENDOR_LIBS, nggPublishScope, useNggScope,
  Uploader, A11ySettingsPanel, A11yNavButton, PhotoEditor, PhotoCapture, ImageLightbox, SignaturePad,
  /* The admin action layer. Exported so a test can drive the runner and the
     bulk bar without mounting the whole console — the partial-failure and
     stale-count behaviours are exactly what cannot be asserted from a
     screenshot. */
  useAdminSelection, AdminSelectAll, AdminRowCheck, AdminBulkBar, AdminRowActions,
  runAdminAction, adminFailSummary,
  ErrorState, EmptyState, humanizeError,
  // Exported for the browser tests: both decide whether a family's photo is
  // accepted, and neither is reachable through a rendered component alone.
  validateHeadshot, photoFormatHelp, HEADSHOT_MIN_PX,
});

/* ============================================================================
   CURRICULUM — the pieces the member's lesson, the instructor's view and the
   Control Room editor all draw with (domain/curriculum.php). One renderer for
   a lesson's text, so what an editor previews is what a member reads.
   ========================================================================== */

const CUR_MATERIAL_ICON = { pdf: "📄", slides: "📊", doc: "📝", sheet: "📈", video: "🎬", audio: "🎧", image: "🖼", ebook: "📚", code: "⌨", archive: "🗂", interactive: "🧩", link: "🔗" };
/** Every file type the curriculum store accepts — keep in step with CURR_FILE_TYPES. */
const CUR_FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.rtf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif,.mp3,.m4a,.wav,.ogg,.mp4,.webm,.mov,.epub,.zip,.sb3,.py,.ino";

/* A lesson's body as text, never as HTML: blank lines make paragraphs, lines
   starting "- " or "* " make a list, "## " a subheading. Anything an importer
   or an AI typed reaches the page as words, so a pasted <script> is a sentence. */
/* ── Lesson text: a small, safe formatting language ──────────────────────────
   What the lesson editor's toolbar writes and what learners read. Rendered as
   React elements, never as HTML, so nothing a lesson says can become markup:

     ## Heading   ### Smaller heading      **bold**  *italic*  `code`
     - bullet     1. numbered              [link text](https://…)
     > a callout  ---  (a divider)         ![caption](https://… or a stored file)
     ```          a block of code          a line that is just a YouTube or
     ```                                   Vimeo link becomes the video

   Links and images accept https only, or a file in the curriculum store. The
   server renders the same language for the downloadable document
   (curriculum_text_html), so the page and the printout agree. */
// The site's own shipped lesson media (assets/learn-media/) is safe too: it is code, not a stranger's URL.
const CUR_SAFE_URL = /^(https:\/\/[^\s<>"']+|\/api\/member\/curriculum-file\.php\?f=[a-f0-9]{16,64}\.[a-z0-9]{2,5}|\/assets\/learn-media\/[a-z0-9][a-z0-9\/_-]{0,180}\.(?:png|svg|jpe?g|webp|gif|html|pdf))$/i;
function curVideoEmbed(url) {
  const u = String(url || "").trim();
  let m = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/);
  if (m) return { src: "https://www.youtube-nocookie.com/embed/" + m[1], title: "YouTube video" };
  m = u.match(/^https:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{5,12})/);
  if (m) return { src: "https://player.vimeo.com/video/" + m[1], title: "Vimeo video" };
  return null;
}
function curInline(text, keyBase) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0, m, k = 0;
  const s = String(text || "");
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const key = keyBase + "-" + (k++);
    if (m[2]) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={key}>{m[3]}</em>);
    else if (m[4]) out.push(<code key={key} className="cur-code-inline">{m[4]}</code>);
    else if (m[5]) out.push(CUR_SAFE_URL.test(m[6]) ? <a key={key} href={m[6]} target="_blank" rel="noopener noreferrer">{m[5]}</a> : m[5]);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
/* A picture in a lesson. One that cannot be loaded (its file lost with a
   server folder, or its host gone) says so in words instead of showing a
   broken-image icon, and names what it was, so a learner can ask for it. */
function CurFigure({ src, alt }) {
  const [gone, setGone] = React.useState(false);
  if (gone) return <p className="cur-figure-gone" role="note">{"The picture" + (alt ? " “" + alt + "”" : "") + " could not be loaded. Tell your instructor so they can add it again."}</p>;
  return <figure className="cur-figure"><img src={src} alt={alt} loading="lazy" onError={() => setGone(true)}/>{alt && <figcaption>{alt}</figcaption>}</figure>;
}
function CurriculumText({ text }) {
  const src = String(text || "").replace(/\r\n?/g, "\n");
  if (!src.trim()) return null;
  /* Code fences first, so nothing inside one is read as formatting.
     Scanned line by line rather than split on the fence, because a split
     throws the fence's INFO STRING away — and the language and arguments are
     exactly what decides whether ```keys C E G is a keyboard or a code
     block. See nggFenceBlock. */
  const srcLines = src.split("\n");
  const blocks = [];
  let buf = [];
  const flush = () => {
    buf.join("\n").split(/\n{2,}/).map(b => b.replace(/^\n+|\n+$/g, "")).filter(b => b.trim()).forEach(b => blocks.push({ text: b }));
    buf = [];
  };
  for (let li = 0; li < srcLines.length; li++) {
    const fm = srcLines[li].match(/^```\s*([a-z0-9+#-]*)\s*(.*)$/i);
    if (!fm) { buf.push(srcLines[li]); continue; }
    flush();
    const code = [];
    li++;
    while (li < srcLines.length && !/^```\s*$/.test(srcLines[li])) code.push(srcLines[li++]);
    blocks.push({ code: code.join("\n"), lang: fm[1], args: fm[2] });
  }
  flush();
  return (
    <div className="cur-text">
      {blocks.map((blk, i) => {
        if (blk.code !== undefined) return nggFenceBlock(blk.lang, blk.args, blk.code, i, "cur-code");
        const b = blk.text, lines = b.split("\n");
        if (lines.every(l => /^\s*[-*•]\s+/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{curInline(l.replace(/^\s*[-*•]\s+/, ""), i + "." + j)}</li>)}</ul>;
        if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{curInline(l.replace(/^\s*\d+[.)]\s+/, ""), i + "." + j)}</li>)}</ol>;
        if (lines.every(l => /^\s*>\s?/.test(l))) return <blockquote key={i} className="cur-callout">{lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br/>}{curInline(l.replace(/^\s*>\s?/, ""), i + "." + j)}</React.Fragment>)}</blockquote>;
        if (lines.length === 1) {
          const one = b.trim();
          if (/^-{3,}$/.test(one)) return <hr key={i} className="cur-rule"/>;
          if (/^###\s+/.test(one)) return <h4 key={i} className="cur-text-h4">{curInline(one.replace(/^###\s+/, ""), i)}</h4>;
          if (/^#{1,2}\s+/.test(one)) return <h3 key={i} className="cur-text-h">{curInline(one.replace(/^#{1,2}\s+/, ""), i)}</h3>;
          const img = one.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
          if (img && CUR_SAFE_URL.test(img[2])) return <CurFigure key={i} src={img[2]} alt={img[1]}/>;
          const vid = curVideoEmbed(one);
          if (vid) return <div key={i} className="cur-embed"><iframe src={vid.src} title={vid.title} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>;
        }
        return <p key={i}>{lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br/>}{curInline(l, i + "." + j)}</React.Fragment>)}</p>;
      })}
    </div>
  );
}

/* Materials open IN the lesson — a PDF, a video, a recording, a picture or a
   YouTube/Vimeo link plays or reads in place — with "Open" beside it for a new
   tab or a download. Anything else (a document, slides, a zip) opens as before. */
/* `fileUrl` is how THIS surface fetches a lesson file from our own origin, or
   null when it has no such route. A PDF on the image cloud is not delivered
   to a browser, so its own address opens an error page rather than the file —
   but the route that solves that is gated on a MEMBER session, and this same
   component draws an instructor's preview. So the caller names it: the
   member surfaces pass `curMemberFile`, staff passes nothing and links out,
   and neither has to know about the other's gate. */
/** A lesson file served from this origin (api/member/lesson-file.php). */
function curMemberFile(materialId) { return "/api/member/lesson-file.php?id=" + encodeURIComponent(materialId || ""); }

function curMaterialViewer(m, fileUrl) {
  const u = String(m.url || ""), k = m.kind;
  const v = curVideoEmbed(u);
  if (v) return { type: "frame", src: v.src, title: v.title };
  const ours = k === "pdf" && m.materialId && fileUrl ? fileUrl(m.materialId) : "";
  if (ours) return { type: "frame", src: ours, title: m.title || "PDF", at: ours };
  if (!CUR_SAFE_URL.test(u)) return null;
  if (k === "pdf") return { type: "frame", src: u, title: m.title || "PDF" };
  if (k === "video" && /\.(mp4|webm|mov)(\?|$)/i.test(u)) return { type: "video", src: u };
  if (k === "audio") return { type: "audio", src: u };
  if (k === "image") return { type: "image", src: u };
  return null;
}
/* What a learner DOES with each kind — the verb on the row, not a file type. */
const CUR_MATERIAL_VERB = { pdf: "Read", slides: "Slides", doc: "Document", sheet: "Spreadsheet", video: "Watch", audio: "Listen",
  image: "Look", ebook: "Book", code: "Code", archive: "Download", interactive: "Practise", link: "Read" };
/** Where a material comes from, in words: the site's name, or "Lesson file" for one of ours. */
function curMaterialSource(url) {
  const u = String(url || "");
  if (u.indexOf("/api/") === 0 || /\/curriculum-file\.php|\/lesson-file\.php/.test(u)) return "Lesson file";
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}
function CurriculumMaterials({ materials, fileUrl }) {
  const [open, setOpen] = React.useState("");
  if (!materials || !materials.length) return null;
  return (
    <ul className="cur-mats" aria-label="Materials">
      {materials.map((m, i) => {
        const id = m.materialId || String(i);
        const viewer = curMaterialViewer(m, fileUrl);
        /* Open ↗ has to go to the same place the reader does, or the one
           control that is meant to rescue a file nobody can read is the one
           that opens the error page. */
        const away = (viewer && viewer.at) || m.url;
        const isOpen = open === id && viewer;
        return (
          <li key={id} className={isOpen ? "is-open" : ""}>
            <div className="cur-mat-row">
              {viewer
                ? <button type="button" className="cur-mat" aria-expanded={!!isOpen} onClick={() => setOpen(isOpen ? "" : id)}>
                    <CurMaterialFace m={m} verb={isOpen ? "Close" : (m.kind === "audio" ? "Listen" : m.kind === "image" ? "View" : m.kind === "pdf" ? "Read here" : "Watch")}/>
                  </button>
                : <a className="cur-mat" href={away} target="_blank" rel="noopener noreferrer">
                    <CurMaterialFace m={m} verb={(CUR_MATERIAL_VERB[m.kind] || "Open") + " ↗"}/>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>}
              {viewer && <a className="cur-mat-open" href={away} target="_blank" rel="noopener noreferrer" aria-label={"Open " + (m.title || "material") + " in a new tab"}>Open ↗</a>}
            </div>
            {isOpen && (
              <div className={"cur-viewer is-" + viewer.type}>
                {viewer.type === "frame" && <iframe src={viewer.src} title={viewer.title} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen/>}
                {viewer.type === "video" && <video src={viewer.src} controls preload="metadata"/>}
                {viewer.type === "audio" && <audio src={viewer.src} controls preload="metadata"/>}
                {viewer.type === "image" && <CurFigure src={viewer.src} alt={m.title || ""}/>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* One material's face: what it is, what to do with it, and where it is from.
   The guide line is the point — a title and the word LINK told a child
   nothing about whether to read it now, practise on it or keep it. */
function CurMaterialFace({ m, verb }) {
  const src = curMaterialSource(m.url);
  return (
    <>
      <span className="cur-mat-icon" aria-hidden="true">{CUR_MATERIAL_ICON[m.kind] || "🔗"}</span>
      <span className="cur-mat-body">
        <span className="cur-mat-title">{m.title || m.url}</span>
        {m.guide && <span className="cur-mat-guide">{m.guide}</span>}
        {src && <span className="cur-mat-src">{src}</span>}
      </span>
      <span className="cur-mat-kind">{verb}</span>
    </>
  );
}

/* ── Growth: one child over the term (mp_growth) ──────────────────────────
   The mentor's profile tab and the family portal draw the same report; the
   server decides what each audience may see and how the sentences are
   written. Every chart is a row of marks in CSS — no chart library — and
   every mark has its words for a screen reader. */
function growthMonth(m) { return /^\d{4}-\d{2}$/.test(m || "") ? new Date(m + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "short" }) : m; }
function growthDay(d) { return d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; }
function GrowthReport({ data, err, retry }) {
  if (err) return <div className="grw-msg" role="alert"><span>Couldn’t load the growth report ({err.code || err.message || err}).</span>{retry && <button type="button" className="grw-btn" onClick={retry}>Retry</button>}</div>;
  if (!data) return <div className="grw-msg" role="status" aria-live="polite">Loading the growth report…</div>;
  const d = data, A = d.attendance || {}, L = d.leadership || {}, E = d.evaluations || {}, W = d.wellbeing;
  const lMax = Math.max(1, ...(L.months || []).map(m => m.total));
  const toneIcon = { up: "ph-trend-up", down: "ph-trend-down", steady: "ph-minus" };
  return (
    <div className="grw">
      <section className="grw-card grw-ins" aria-labelledby="grw-ins-h">
        <h3 id="grw-ins-h">What changed <small>{growthDay(d.from)} – {growthDay(d.to)}</small></h3>
        <ul>{(d.insights || []).map((x, i) => (
          <li key={i} className={"is-" + x.tone}><i className={"ph " + (toneIcon[x.tone] || "ph-minus")} aria-hidden="true"/>
            <span><span className="grw-sr">{x.tone === "up" ? "Up: " : x.tone === "down" ? "Down: " : ""}</span>{x.text}{x.do && <em>{x.do}</em>}</span></li>
        ))}</ul>
      </section>
      <div className="grw-grid">
        <section className="grw-card" aria-labelledby="grw-att-h">
          <h3 id="grw-att-h">Saturdays <small>{A.rate !== null && A.rate !== undefined ? A.rate + "% of the Saturdays the centre met" : "No Saturdays recorded yet"}</small></h3>
          <ol className="grw-dots" aria-label="The last 12 Saturdays">{(A.series || []).map(s => (
            <li key={s.date} className={s.beforeJoining ? "is-pre" : s.here === null ? "is-none" : s.here ? "is-here" : "is-away"}
              title={growthDay(s.date) + ": " + (s.beforeJoining ? "before joining" : s.here === null ? "the centre did not meet" : s.here ? "here" : "away")}>
              <span className="grw-sr">{growthDay(s.date)}: {s.beforeJoining ? "before joining" : s.here === null ? "no Saturday" : s.here ? "here" : "away"}</span></li>
          ))}</ol>
          {A.earlier !== null && A.recent !== null && A.earlier !== undefined && <p className="grw-note">Earlier {A.earlier}% · recently {A.recent}%</p>}
        </section>
        <section className="grw-card" aria-labelledby="grw-li-h">
          <h3 id="grw-li-h">Leadership Index <small>{L.change === null || L.change === undefined ? (L.months || []).length ? "one month scored" : "not scored yet" : (L.change > 0 ? "+" : "") + L.change + " since " + growthMonth((L.months[0] || {}).month)}</small></h3>
          {(L.months || []).length > 0 && <ol className="grw-bars" aria-label="Leadership Index by month">{L.months.map(m => (
            <li key={m.month}><span className="grw-bar" style={{ height: Math.max(6, Math.round(m.total / lMax * 64)) + "px" }}/><b>{m.total}</b><small>{growthMonth(m.month)}</small></li>
          ))}</ol>}
          {((L.gains || []).length > 0 || (L.dips || []).length > 0) && <p className="grw-chips">
            {(L.gains || []).map(g => <span key={g.skill} className="grw-chip is-up">{g.skill} {g.from}→{g.to}</span>)}
            {(L.dips || []).map(g => <span key={g.skill} className="grw-chip is-down">{g.skill} {g.from}→{g.to}</span>)}</p>}
        </section>
        <section className="grw-card" aria-labelledby="grw-ev-h">
          <h3 id="grw-ev-h">Saturday evaluations <small>{(E.series || []).length ? (E.series[E.series.length - 1].shown + " of " + E.series[E.series.length - 1].of + " shown last time") : "none yet"}</small></h3>
          {(E.series || []).length > 0 && <ol className="grw-bars" aria-label="Criteria shown per evaluation">{E.series.map((x, i) => (
            <li key={i}><span className="grw-bar is-ev" style={{ height: Math.max(6, Math.round(x.shown / Math.max(1, x.of) * 64)) + "px" }}/><b>{x.shown}</b><small>{growthDay(x.date)}</small></li>
          ))}</ol>}
          {(E.moved || []).length > 0 && <ul className="grw-list">{E.moved.map(x => <li key={x.label} className={x.up ? "is-up" : "is-down"}>{x.label}: {x.from.toLowerCase()} → {x.to.toLowerCase()}</li>)}</ul>}
          {E.strength && <p className="grw-note"><b>A strength:</b> {E.strength}</p>}
          {E.next && <p className="grw-note"><b>The next step:</b> {E.next}</p>}
        </section>
        <section className="grw-card" aria-labelledby="grw-more-h">
          <h3 id="grw-more-h">Learning and goals</h3>
          <dl className="grw-facts">
            <div><dt>Lessons</dt><dd>{d.learning.total ? d.learning.completed + " of " + d.learning.total + " done" + (d.learning.overdue ? " · " + d.learning.overdue + " overdue" : "") : "None set yet"}</dd></div>
            <div><dt>Goal</dt><dd>{d.goal ? d.goal.title + (d.audience === "mentor" ? " (" + d.goal.progress + " of 5)" : "") : "None agreed yet"}{d.goalsDone ? " · " + d.goalsDone + " achieved before" : ""}</dd></div>
            <div><dt>Courage</dt><dd>{d.courage && d.courage.current !== null ? (d.courage.rung || d.courage.current) + (d.courage.direction ? ", " + d.courage.direction : "") : "Not observed yet"}</dd></div>
            <div><dt>School</dt><dd>{d.school ? (d.school.average !== null ? d.school.average + "% average" : "Uploaded") + (d.school.change !== null ? " (" + (d.school.change > 0 ? "+" : "") + d.school.change + ")" : "") + " · " + d.school.term : "No report uploaded yet"}</dd></div>
          </dl>
        </section>
        {W && <section className="grw-card" aria-labelledby="grw-wb-h">
          <h3 id="grw-wb-h">Wellbeing check-ins <small>staff only</small></h3>
          {W.length ? <ol className="grw-dots" aria-label="Weekly check-ins">{W.map(w => (
            <li key={w.week} className={w.wellbeing === "Okay" ? "is-here" : "is-away"} title={w.week + ": " + w.wellbeing}><span className="grw-sr">{w.week}: {w.wellbeing}</span></li>
          ))}</ol> : <p className="grw-note">No check-ins yet.</p>}
        </section>}
      </div>
    </div>
  );
}

/* ── The curriculum as staff read it: course → year → term → week ──────────
   One map for the mentor's and the instructor's portal (staff_curriculum):
   the year tabs and the terms within them, each lesson at its week with how
   many of their members have done it, the week the Club is on, and who is
   past a due date without it. A lesson opens in place: what it covers, the
   lesson itself, its materials, its checks, and adding a material. */
function staffCurrState(u, weekNow) {
  const st = u.stats || {}, pct = st.audience ? Math.round((st.completed || 0) / st.audience * 100) : 0;
  if (weekNow && u.week === weekNow) return { k: "now", label: "This week" };
  if (st.behind) return { k: "behind", label: st.behind + " behind" };
  if (weekNow && u.week < weekNow) return pct >= 80 || !st.audience ? { k: "done", label: "Done" } : { k: "open", label: pct + "% done" };
  return { k: "next", label: weekNow && u.week === weekNow + 1 ? "Next week" : "Coming" };
}
/* An instructor writes a lesson for their own course (staff.curriculum.lesson):
   a draft for the curriculum lead, or published when they hold `curriculum`. */
/**
 * An instructor writes a lesson — in the SAME editor the Control Room uses.
 *
 * What was here was a four-field form: title, week, one line of summary and
 * a plain textarea. The people who actually teach the course could file a
 * sketch and nothing else — no opening review, no objectives, no materials,
 * no diagrams — while a curriculum lead two portals away had all of it. The
 * standard the programme asks of a lesson was invisible on the one screen
 * where lessons are most often written.
 *
 * `desk` is the whole of the difference now: an instructor's lesson goes
 * through their own route, and saves as a draft unless they hold the
 * curriculum capability. The server decides that, not this component.
 */
function StaffLessonForm({ course, week, canPublish, courses, examRefs, onDone }) {
  const [open, setOpen] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  if (!course) return null;

  const desk = React.useMemo(() => ({
    canPublish: !!canPublish,
    upload: (file) => NGGApi.member.curriculumUpload(file),
    save: async (d) => {
      const r = await NGGApi.member.curriculumLesson({
        unitId: d.unitId || "", course: d.course, week: Number(d.week) || 1, position: Number(d.position) || 0,
        title: d.title, summary: d.summary,
        objectives: String(d.objectives || "").split("\n").map(x => x.trim()).filter(Boolean),
        body: d.body, materials: d.materials, checks: d.checks,
        durationMins: Number(d.durationMins) || 0, passMark: Number(d.passMark),
        status: d.status,
      });
      return r.unit || { unitId: r.unitId, title: d.title, version: 1, status: r.status };
    },
  }), [canPublish]);

  if (!open) return (
    <div className="scm-write">
      {msg && <p className="scm-note" role="status"><i className="ph ph-check-circle" aria-hidden="true"/> {msg}</p>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setMsg(""); }}>
        <i className="ph ph-plus" aria-hidden="true"/> Write a lesson for {course}
      </button>
    </div>
  );

  return (
    <div className="scm-write-open">
      <CurriculumEditor
        unit={{ course: course, week: week || 1 }}
        courses={courses && courses.length ? courses : [course]}
        divisions={[]}
        examRefs={examRefs || {}}
        canWrite={true}
        aiEnabled={false}
        desk={desk}
        onClose={() => setOpen(false)}
        onSaved={(u) => {
          setOpen(false);
          setMsg(canPublish
            ? "Published for " + course + ", week " + (u && u.week ? u.week : week) + "."
            : "Saved as a draft for " + course + ". A curriculum lead publishes it; your class sees it then.");
          if (onDone) onDone();
        }}/>
    </div>
  );
}
function StaffCurriculumMap({ data, course, reload, intro }) {
  const units0 = (data && data.units) || [];
  /* A lesson sits under the catalogue course it belongs to (family): "Piano" lessons are Musical Instruments'. */
  const courseOf = u => u.family || u.course || "";
  const courses = Array.from(new Set(units0.map(courseOf))).sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
  const [cSel, setCSel] = React.useState(course || "");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState("");
  const weekNow = data && data.weekNow;
  const curCourse = course !== undefined && course !== null && course !== "" ? course : cSel || (courses.find(c => c) || "");
  const inCourse = units0.filter(u => !courseOf(u) || !curCourse || String(courseOf(u)).toLowerCase() === String(curCourse).toLowerCase() || String(u.course || "").toLowerCase() === String(curCourse).toLowerCase());
  const ownLessons = inCourse.filter(u => courseOf(u)).length;
  const years = Array.from(new Set(inCourse.map(u => (u.path && u.path.year) || 0))).sort((a, b) => (a || 99) - (b || 99));
  const yearNow = (inCourse.find(u => weekNow && u.week === weekNow && u.path) || {}).path;
  const [ySel, setYSel] = React.useState(null);
  const year = ySel !== null && years.includes(ySel) ? ySel : yearNow && years.includes(yearNow.year) ? yearNow.year : years[0];
  const t = q.trim().toLowerCase();
  const shown = inCourse.filter(u => ((u.path && u.path.year) || 0) === year && (!t || (u.title + " " + (u.summary || "")).toLowerCase().includes(t)));
  const terms = Array.from(new Set(shown.map(u => (u.path && u.path.term) || 1))).sort((a, b) => a - b);
  const now = inCourse.filter(u => weekNow && u.week === weekNow);
  const pctOf = list => { const a = list.reduce((n, u) => n + ((u.stats || {}).audience || 0), 0); return a ? Math.round(list.reduce((n, u) => n + ((u.stats || {}).completed || 0), 0) / a * 100) : null; };
  const dateW = d => d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  if (!units0.length) return (
    <div className="scm">
      <p className="scm-note" role="note"><i className="ph ph-info" aria-hidden="true"/> No lessons have been published for {course || "your courses"} yet. A curriculum lead writes them in Control Room → Curriculum{course ? ", or write the first one here" : ""}.</p>
      <StaffLessonForm course={course} week={weekNow} courses={(data && data.courses) || null} examRefs={(data && data.examRefs) || {}} canPublish={!!(data && data.selfApprove)} onDone={reload}/>
    </div>
  );
  const row = u => {
    const st = u.stats || {}, s = staffCurrState(u, weekNow), pct = st.audience ? Math.round((st.completed || 0) / st.audience * 100) : 0, isOpen = open === u.unitId;
    return (
      <li key={u.unitId} className={"scm-row is-" + s.k}>
        <button type="button" className="scm-row-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : u.unitId)}>
          <span className="scm-wk" aria-label={"Week " + ((u.path && u.path.week) || u.week)}>W{(u.path && u.path.week) || u.week}</span>
          <span className="scm-t"><b>{u.title}</b><small>{(u.due ? "Due " + dateW(u.due) + " · " : "") + (st.audience ? st.completed + " of " + st.audience + " done" : "Nobody in your class takes it") + (st.avgScore !== null && st.avgScore !== undefined ? " · average " + st.avgScore + "%" : "")}</small></span>
          <span className="scm-bar" aria-hidden="true"><span style={{ width: pct + "%" }}/></span>
          <span className={"scm-chip is-" + s.k}>{s.label}</span>
          <i className={"ph ph-caret-" + (isOpen ? "up" : "down")} aria-hidden="true"/>
        </button>
        {isOpen && (
          <div className="scm-lesson">
            {u.path && u.path.label && <p className="scm-path">{u.path.label}{u.durationMins ? " · " + u.durationMins + " min" : ""}</p>}
            {u.summary && <p>{u.summary}</p>}
            {(u.objectives || []).length > 0 && <><h4 className="scm-h4">By the end, they can</h4><ul>{u.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul></>}
            {st.behind > 0 && <p className="scm-behind" role="note"><i className="ph ph-warning" aria-hidden="true"/> Past its due date without it: {(st.behindNames || []).join(", ")}{st.behind > (st.behindNames || []).length ? " and " + (st.behind - st.behindNames.length) + " more" : ""}.</p>}
            {typeof CurriculumText === "function" && u.body && <CurriculumText text={u.body}/>}
            {typeof CurriculumMaterials === "function" && <CurriculumMaterials materials={u.materials || []}/>}
            <p className="scm-path">{(u.checks || []).length ? u.checks.length + " check" + (u.checks.length === 1 ? "" : "s") + " · pass mark " + u.passMark + "%" : "No checks: nothing to mark for this one."}</p>
            {typeof StaffMaterialForm === "function" && <StaffMaterialForm unitId={u.unitId} selfApprove={!!(data && data.selfApprove)} onDone={reload}/>}
          </div>
        )}
      </li>
    );
  };
  return (
    <div className="scm">
      {intro && <p className="scm-intro">{intro}</p>}
      <div className="scm-bar-top">
        {!course && courses.filter(Boolean).length > 1 && (
          <div className="scm-seg" role="group" aria-label="Course">{courses.filter(Boolean).map(c => <button key={c} type="button" aria-pressed={c === curCourse} className={c === curCourse ? "is-on" : ""} onClick={() => { setCSel(c); setYSel(null); setOpen(""); }}>{c}</button>)}</div>
        )}
        {years.length > 1 && (
          <div className="scm-seg" role="group" aria-label="Year">{years.map(y => <button key={y} type="button" aria-pressed={y === year} className={y === year ? "is-on" : ""} onClick={() => { setYSel(y); setOpen(""); }}>{y ? "Year " + y : "Any year"}</button>)}</div>
        )}
        <label className="scm-find" role="search"><span className="sr-only">Find a lesson</span><i className="ph ph-magnifying-glass" aria-hidden="true"/>
          <input type="search" value={q} placeholder="Find a lesson" onChange={e => setQ(e.target.value)}/></label>
      </div>
      <p className="scm-status" role="status" aria-live="polite">{(curCourse || "Whole Club") + " · " + inCourse.length + " lesson" + (inCourse.length === 1 ? "" : "s") + (years.length > 1 ? " over " + years.filter(Boolean).length + " years" : "")
        + (weekNow ? " · the Club is on week " + weekNow + (data.termWeeks ? " (term weeks " + data.termWeeks + ")" : "") : "") + (t ? " · " + shown.length + " match" + (shown.length === 1 ? "" : "es") : "")}</p>
      {!weekNow && data && data.termStart === "" && <p className="scm-note" role="note"><i className="ph ph-calendar-x" aria-hidden="true"/> Lessons have no due dates yet: the term’s start date is not set. An admin sets it in Control Room → Curriculum → Schedule.</p>}
      {curCourse && !ownLessons && !t && <p className="scm-note" role="note"><i className="ph ph-info" aria-hidden="true"/> No lessons have been published for {curCourse} yet. A curriculum lead writes them in Control Room → Curriculum, or write the first one below.</p>}
      <StaffLessonForm course={course || curCourse} week={weekNow} courses={(data && data.courses) || null} examRefs={(data && data.examRefs) || {}} canPublish={!!(data && data.selfApprove)} onDone={reload}/>
      {now.length > 0 && !t && (
        <section className="scm-now" aria-labelledby="scm-now-h">
          <h3 id="scm-now-h">This week</h3>
          <ul className="scm-list">{now.map(row)}</ul>
        </section>
      )}
      {!shown.length && (t || ownLessons > 0) && <p className="scm-empty">{t ? "No lesson in this year matches “" + q + "”." : "Nothing in this year yet."}</p>}
      {terms.map(tm => {
        const list = shown.filter(u => ((u.path && u.path.term) || 1) === tm).sort((a, b) => a.week - b.week || a.position - b.position);
        const name = (list.find(u => u.path && u.path.termName) || { path: {} }).path.termName;
        const p = pctOf(list), wks = list.map(u => (u.path && u.path.week) || u.week);
        return (
          <section key={tm} className="scm-term" aria-labelledby={"scm-t" + tm}>
            <h3 id={"scm-t" + tm} className="scm-term-h">Term {tm}{name ? ": " + name : ""}<small>{list.length} lesson{list.length === 1 ? "" : "s"} · weeks {Math.min.apply(null, wks)}–{Math.max.apply(null, wks)}{p !== null ? " · " + p + "% done" : ""}</small></h3>
            <ol className="scm-list">{list.map(row)}</ol>
          </section>
        );
      })}
    </div>
  );
}


/* Where a member stands on one lesson, in words a chip can carry. */
function curriculumStatusLabel(p) {
  if (!p) return { label: "New", tone: "" };
  if (p.status === "completed") return { label: "Done", tone: "is-done" };
  if (p.pending) return { label: "Waiting for marking", tone: "is-wait" };
  if (p.attempts > 0) return { label: "Try again", tone: "is-retry" };
  return { label: "Started", tone: "is-started" };
}

/* ============================================================================
   Every drop-down opens as the application's list (page-apply.jsx's picker):
   a searchable list under the field on a wide screen, a full-screen sheet
   with a search box on a phone, the chosen option ticked, groups as headings.

   One layer for every <select> in the site and the Control Room, rather than
   two hundred rewrites: the <select> stays the source of truth (its value,
   its React onChange, its form submission, Playwright's selectOption); only
   the OS's own option list is replaced. Choosing sets the value through the
   native setter and fires `input` and `change`, which is what React listens
   for. Opt out with data-native on the <select>; a multiple or sized list is
   left alone.
   ========================================================================== */
function installNggSelect() {
  if (typeof document === "undefined" || window.__ngsInstalled) return;
  window.__ngsInstalled = true;
  const PHONE = 640, SEARCH_FROM = 8;
  let cur = null;   // { sel, root, items, hi, input, list }
  const eligible = el => el && el.tagName === "SELECT" && !el.multiple && !(el.size > 1) && !el.disabled && !el.hasAttribute("data-native") && !el.closest("[data-native-selects]");
  const labelOf = sel => sel.getAttribute("aria-label") || (sel.id && document.querySelector('label[for="' + CSS.escape(sel.id) + '"]') || {}).textContent || (sel.closest("label") || {}).textContent || "Choose";
  const isDark = el => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor, m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (m && (m[4] === undefined || +m[4] > 0.5)) return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 110;
    }
    return false;
  };
  const setValue = (sel, v) => {
    if (sel.value === v) return;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, v);
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const close = refocus => {
    if (!cur) return;
    const { sel, root } = cur;
    cur = null;
    root.remove();
    sel.removeAttribute("aria-expanded");
    document.documentElement.classList.remove("ngs-lock");
    if (refocus) try { sel.focus({ preventScroll: true }); } catch (_) {}
  };
  const render = () => {
    const { sel, list, input } = cur;
    const q = input ? input.value.trim().toLowerCase() : "";
    // Every word typed, in any order: "college lagos" finds "Lagos State Model College".
    const words = q.split(/\s+/).filter(Boolean);
    const hit = text => { const t = String(text || "").toLowerCase(); return words.every(w => t.includes(w)); };
    list.textContent = "";
    cur.items = [];
    const add = (opt) => {
      if (q && !hit(opt.text)) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "ngs-o" + (opt.value === "" ? " is-placeholder" : ""); b.setAttribute("role", "option");
      b.id = "ngs-o-" + cur.items.length;
      b.setAttribute("aria-selected", String(opt.value === sel.value));
      if (opt.disabled) { b.disabled = true; b.setAttribute("aria-disabled", "true"); }
      const t = document.createElement("span"); t.textContent = opt.text || " "; b.appendChild(t);
      if (opt.value === sel.value && opt.value !== "") { const i = document.createElement("i"); i.className = "ph-bold ph-check"; i.setAttribute("aria-hidden", "true"); b.appendChild(i); }
      b.addEventListener("mousedown", e => e.preventDefault());
      b.addEventListener("click", () => { if (!opt.disabled) { setValue(sel, opt.value); close(true); } });
      list.appendChild(b);
      if (!opt.disabled) cur.items.push({ b, opt });
    };
    for (const node of sel.children) {
      if (node.tagName === "OPTGROUP") {
        const kids = [...node.children].filter(o => !q || hit(o.text));
        if (!kids.length) continue;
        const g = document.createElement("span"); g.className = "ngs-g"; g.setAttribute("role", "presentation"); g.textContent = node.label; list.appendChild(g);
        kids.forEach(add);
      } else if (node.tagName === "OPTION" && !node.hidden) add(node);
    }
    if (!cur.items.length) { const n = document.createElement("div"); n.className = "ngs-none"; n.textContent = q ? "No match for “" + input.value.trim() + "”." : "Nothing to choose."; list.appendChild(n); }
    const at = cur.items.findIndex(x => x.opt.value === sel.value);
    move(at >= 0 ? at : 0, true);
  };
  const move = (i, quiet) => {
    if (!cur || !cur.items.length) return;
    cur.hi = Math.max(0, Math.min(cur.items.length - 1, i));
    cur.items.forEach((x, k) => x.b.classList.toggle("is-hi", k === cur.hi));
    const b = cur.items[cur.hi].b;
    (cur.input || cur.list).setAttribute("aria-activedescendant", b.id);
    if (!quiet || cur.hi) b.scrollIntoView({ block: "nearest" });
  };
  const open = sel => {
    if (cur && cur.sel === sel) { close(true); return; }
    close(false);
    const phone = window.innerWidth < PHONE;
    const root = document.createElement("div");
    root.className = "ngs" + (phone ? " ngs--sheet" : " ngs--pop") + (isDark(sel) ? " is-dark" : "");
    root.setAttribute("role", "dialog"); root.setAttribute("aria-label", labelOf(sel).trim());
    if (phone) root.setAttribute("aria-modal", "true");
    const many = sel.options.length > SEARCH_FROM;
    let head = "";
    if (phone) head = '<div class="ngs-h"><button type="button" class="ngs-x" aria-label="Close"><i class="ph ph-x" aria-hidden="true"></i></button><b></b></div>';
    root.innerHTML = head + (many || phone ? '<div class="ngs-s"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="search" autocomplete="off" placeholder="Search" aria-label="Search the options"></div>' : "") + '<div class="ngs-l" role="listbox" tabindex="-1"></div>';
    if (phone) root.querySelector(".ngs-h b").textContent = labelOf(sel).trim();
    // Inside the dialog the select is in, so a dialog's focus trap keeps the list.
    (sel.closest('dialog, [role="dialog"], [aria-modal="true"]') || document.body).appendChild(root);
    const input = root.querySelector(".ngs-s input"), list = root.querySelector(".ngs-l");
    list.id = "ngs-l";
    list.setAttribute("aria-label", labelOf(sel).trim());
    if (input) input.setAttribute("aria-controls", "ngs-l");
    cur = { sel, root, input, list, items: [], hi: 0 };
    sel.setAttribute("aria-expanded", "true");
    if (phone) { document.documentElement.classList.add("ngs-lock"); root.querySelector(".ngs-x").addEventListener("click", () => close(true)); }
    else place(sel, root);
    if (input) input.addEventListener("input", render);
    render();
    (input || list).focus({ preventScroll: true });
  };
  /* Under the field (above it when there is no room below), as wide as the
     field and at least 220. Called again on scroll, so it follows the field. */
  const place = (sel, root) => {
    const r = sel.getBoundingClientRect(), w = Math.min(Math.max(r.width, 220), window.innerWidth - 16);
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 260 && above > below;
    root.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    root.style.width = w + "px";
    root.style.top = up ? "" : (r.bottom + 4) + "px";
    root.style.bottom = up ? (window.innerHeight - r.top + 4) + "px" : "";
    root.style.setProperty("--ngs-max", Math.max(160, Math.min(360, up ? above : below)) + "px");
    /* Inside a transformed dialog "fixed" is relative to the dialog, not the
       window: measure where it landed and correct by the difference. */
    const want = parseFloat(root.style.left), got = root.getBoundingClientRect();
    if (Math.abs(got.left - want) > 1) root.style.left = (want + (want - got.left)) + "px";
    if (!up) { const wantTop = r.bottom + 4; if (Math.abs(got.top - wantTop) > 1) root.style.top = (wantTop + (wantTop - got.top)) + "px"; }
    return r;
  };
  const onKeyInside = e => {
    if (!cur) return;
    const k = e.key;
    if (k === "ArrowDown") { e.preventDefault(); move(cur.hi + 1); }
    else if (k === "ArrowUp") { e.preventDefault(); move(cur.hi - 1); }
    else if (k === "Home" && !cur.input) { e.preventDefault(); move(0); }
    else if (k === "End" && !cur.input) { e.preventDefault(); move(cur.items.length - 1); }
    else if (k === "Enter") { e.preventDefault(); const x = cur.items[cur.hi]; if (x) { setValue(cur.sel, x.opt.value); close(true); } }
    else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (k === "Tab") close(true);
    else if (!cur.input && k.length === 1) {   // type-ahead when there is no search box
      const i = cur.items.findIndex(x => x.opt.text.toLowerCase().startsWith(k.toLowerCase()));
      if (i >= 0) move(i);
    }
  };
  document.addEventListener("keydown", e => {
    if (cur && cur.root.contains(e.target)) return onKeyInside(e);
    const sel = e.target;
    if (!eligible(sel)) return;
    if (e.key === "Enter" || e.key === " " || e.key === "F4" || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))) { e.preventDefault(); open(sel); }
  }, true);
  document.addEventListener("mousedown", e => {
    if (cur && !cur.root.contains(e.target) && e.target !== cur.sel) close(false);
    const sel = e.target;
    if (e.button !== 0 || !eligible(sel)) return;
    e.preventDefault();
    try { sel.focus({ preventScroll: true }); } catch (_) {}
    open(sel);
  }, true);
  /* Touch: the OS picker opens on the tap, so the tap is taken (a swipe that
     starts on a select still scrolls the page). */
  let touch = null;
  document.addEventListener("touchstart", e => { touch = eligible(e.target) ? { sel: e.target, x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { capture: true, passive: true });
  document.addEventListener("touchend", e => {
    if (!touch || e.target !== touch.sel) { touch = null; return; }
    const t = e.changedTouches[0];
    if (Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10) { touch = null; return; }
    e.preventDefault();
    const sel = touch.sel; touch = null;
    open(sel);
  }, { capture: true, passive: false });
  window.addEventListener("resize", () => { if (cur && !cur.root.classList.contains("ngs--sheet")) close(false); });
  document.addEventListener("scroll", e => {
    if (!cur || cur.root.contains(e.target) || cur.root.classList.contains("ngs--sheet")) return;
    const r = place(cur.sel, cur.root);
    if (r.bottom < 0 || r.top > window.innerHeight) close(false);   // the field scrolled away
  }, true);
}
installNggSelect();

/* ── Pay the balance online ─────────────────────────────────────────────────
 * One button for every screen that shows a balance (the member's account, the
 * family portal). `pay()` asks the server for a balance invoice; the browser
 * goes to that invoice's /pay page, where Paystack takes the payment and the
 * server's own verify settles it. Nothing is marked paid from here. */
const PAY_BALANCE_ERR = {
  payments_unavailable: "Online payment is not switched on yet. Pay by transfer and the centre will record it.",
  nothing_to_pay: "There is nothing to pay right now.",
  offline_pending: "A transfer is waiting to be checked by the centre, so there is nothing to pay online until it is.",
  no_email: "We need an email address for the receipt. Ask the centre to add one.",
  fees_off: "Fees are not switched on at this centre.",
  not_ngg: "Online payment is for NGG membership.",
  rate_limited: "Too many tries. Wait a minute and try again.",
};
function PayBalanceButton({ amountText, pay, className }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const go = () => {
    setBusy(true); setErr("");
    Promise.resolve().then(pay).then(r => {
      if (r && r.payUrl) { window.location.assign(r.payUrl); return; }
      setBusy(false); setErr("The payment page could not be opened. Try again.");
    }).catch(e => {
      setBusy(false);
      setErr(PAY_BALANCE_ERR[(e && e.code) || ""] || "The payment page could not be opened. Try again.");
    });
  };
  return (
    <div className="pay-balance">
      <button type="button" className={className || "btn btn-primary btn-sm"} onClick={go} disabled={busy} aria-busy={busy ? "true" : "false"}>
        {busy ? "Opening payment…" : "Pay " + (amountText || "") + " online"}
      </button>
      {err && <p className="pay-balance-err" role="alert">{err}</p>}
    </div>
  );
}

/* ── Free messages on Telegram ───────────────────────────────────────────────
 * Every text the site sends (sign-in codes, check-ins, notices) goes to
 * Telegram instead of SMS for a number connected to the programme's bot
 * (api/_lib/telegram.php) — free, on Android or iPhone. This card is the
 * invitation: the bot link, a QR for a phone held up to a laptop screen, and
 * what happens. Renders nothing when no bot is set up, and an honest line
 * with a retry when the check fails — never a dead button. */
function TelegramConnect({ compact }) {
  const [st, setSt] = React.useState({ phase: "loading" });
  const load = React.useCallback(() => {
    setSt({ phase: "loading" });
    NGGApi.public.telegram().then(r => setSt({ phase: "ok", r }), () => setSt({ phase: "error" }));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  const [qr, setQr] = React.useState("");
  const url = st.phase === "ok" && st.r.enabled ? st.r.url : "";
  React.useEffect(() => {
    if (!url || compact) return;
    let alive = true;
    loadVendor("qrcode").then(() => {
      if (!alive || !window.qrcode) return;
      try { const q = window.qrcode(0, "M"); q.addData(url); q.make(); setQr(q.createDataURL(6, 2)); } catch (_) {}
    }).catch(() => {});
    return () => { alive = false; };
  }, [url, compact]);
  if (st.phase === "loading") return <div className="tgc is-loading" aria-busy="true"><span className="tgc-skel"/></div>;
  if (st.phase === "error") return <div className="tgc is-error" role="alert"><p>Couldn’t check whether Telegram messages are available.</p><button type="button" className="tgc-retry" onClick={load}>Try again</button></div>;
  if (!url) return null;
  return (
    <section className={"tgc" + (compact ? " is-compact" : "")} aria-labelledby="tgc-h">
      <div className="tgc-body">
        <h2 id="tgc-h" className="tgc-h"><i className="ph ph-telegram-logo" aria-hidden="true"/>Get our messages free on Telegram</h2>
        <p className="tgc-p">Sign-in codes, check-ins and notices about your child come to Telegram instead of by SMS. It works on Android and iPhone, and costs nothing.</p>
        <ol className="tgc-steps">
          <li>Open our bot{st.r.bot ? <> (<b>@{st.r.bot}</b>)</> : null} and press <b>Start</b>.</li>
          <li>Press <b>Share my phone number</b>. Use the number on your NGG record.</li>
        </ol>
        <a className="tgc-go" href={url} target="_blank" rel="noopener noreferrer">Open Telegram</a>
        <p className="tgc-fine">Send /stop in the chat at any time to go back to SMS.</p>
      </div>
      {qr && !compact ? <img className="tgc-qr" src={qr} alt={"QR code for " + url}/> : null}
    </section>
  );
}

/* /telegram — the same invitation as a page of its own, to share in a parents'
   WhatsApp group or print for a centre's noticeboard. */
function TelegramPage({ setPage }) {
  return (
    <div className="tgp" data-screen-label="Telegram">
      <p className="tgp-eyebrow">Messages from NGG</p>
      <h1 className="tgp-h1">Free messages, on the phone you already have</h1>
      <p className="tgp-lead">A text message costs money every time it is sent. Telegram does not. Connect once and every message we would have texted you comes to Telegram instead.</p>
      <TelegramConnect/>
      <TelegramPageFallback setPage={setPage}/>
    </div>
  );
}
function TelegramPageFallback({ setPage }) {
  const [on, setOn] = React.useState(null);
  React.useEffect(() => { NGGApi.public.telegram().then(r => setOn(!!r.enabled), () => setOn(true)); }, []);
  if (on !== false) return null;
  return <EmptyState title="Telegram messages aren’t set up yet" message="We’ll keep sending messages by SMS and email. Check back later."
    action={<button type="button" className="tgc-retry" onClick={() => setPage("home")}>Back to the home page</button>}/>;
}

Object.assign(window, { TelegramConnect, TelegramPage });

/* ============================================================================
   Push notifications — the client half (server: api/_lib/domain/push.php).

   One set of parts for all three places a person can be reached: the member
   portal, the family account and the Control Room (`surface`). The SERVER
   decides whether a message buzzes a phone — quiet hours, muted topics, "they
   are looking at the portal right now" — so this side only has to:

   · say plainly whether this device CAN be reached, and if not, the one
     thing that would fix it (an iPhone needs NGG on the Home Screen; a
     blocked site needs the browser's site settings) — never a dead button;
   · ask at a moment the person can see the point (NggPushNudge), never on
     page load, and take "not now" for two weeks;
   · keep the server's record of this device true (nggPushBoot re-registers a
     subscription the browser rotated or that moved to another account);
   · tell the server while the portal is in front of somebody, so their
     phone does not buzz for what is already on their screen.
   ========================================================================== */
const NGG_PUSH_SNOOZE_DAYS = 14;
const NGG_PUSH_SURFACE_WORDS = {
  member: { what: "Answers to your requests, messages from your mentor, results and reminders — on this device, without opening NGG.", home: "/dashboard" },
  family: { what: "When your child checks in or out, when the centre answers you, and anything about fees — on this phone, without signing in.", home: "/family" },
  admin:  { what: "When something new lands in the inbox — requests, messages, applications, approvals — on this device.", home: "/control/inbox" },
};

/**
 * Can this device receive push at all, and if not, why — in a word the card
 * turns into a sentence. Every platform that can is let through; every one
 * that cannot gets the one thing that would fix it, because "this browser
 * can't" is not an answer a parent on an iPhone can act on:
 *   iPhone/iPad, iOS 16.4+  only from NGG on the Home Screen (Safari's rule)
 *   iPhone, older iOS       not possible until iOS is updated
 *   in-app browsers         WhatsApp/Instagram/Facebook pages cannot; open it in the real browser
 *   Brave                   push is off by default (checked when subscribing)
 *   everything else         Chrome, Edge, Firefox, Opera, Samsung Internet, Safari 16+ on Mac
 */
function nggPushEnv() {
  const n = typeof navigator !== "undefined" ? navigator : {}, w = typeof window !== "undefined" ? window : {};
  const ua = n.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (n.platform === "MacIntel" && n.maxTouchPoints > 1);
  const standalone = !!((w.matchMedia && w.matchMedia("(display-mode: standalone)").matches) || n.standalone === true);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|musical_ly|TikTok|Twitter|LinkedInApp|; wv\)/i.test(ua);
  const iosVer = (ua.match(/OS (\d+)[_.](\d+)/) || []).slice(1).map(Number);
  const has = "serviceWorker" in n && "PushManager" in w && "Notification" in w;
  if (inApp && !has) return { ok: false, why: "in_app" };
  if (!w.isSecureContext) return { ok: false, why: "unsupported" };
  if (!has) {
    if (ios && iosVer.length && (iosVer[0] < 16 || (iosVer[0] === 16 && iosVer[1] < 4))) return { ok: false, why: "ios_old" };
    if (ios && !standalone) return { ok: false, why: /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios_other_browser" : "ios_install" };
    if (/Macintosh/.test(ua) && /Version\/(\d+)/.test(ua) && +ua.match(/Version\/(\d+)/)[1] < 16) return { ok: false, why: "safari_old" };
    return { ok: false, why: "unsupported" };
  }
  if (w.Notification.permission === "denied") return { ok: false, why: "denied" };
  return { ok: true, why: "", permission: w.Notification.permission, ios, standalone };
}
const NGG_PUSH_WHY = {
  ios_install: "On an iPhone or iPad, notifications work from NGG on your Home Screen. In Safari, tap Share, then “Add to Home Screen”, open NGG from the new icon, and turn them on there.",
  ios_other_browser: "On an iPhone or iPad, notifications only work from NGG on your Home Screen. Open this page in Safari, tap Share, then “Add to Home Screen”, and turn them on from the new icon.",
  ios_old: "This iPhone or iPad needs iOS 16.4 or later for notifications. Update it in Settings → General → Software Update, then add NGG to your Home Screen.",
  safari_old: "This version of Safari can’t receive notifications. Update macOS (Safari 16 or later), or use Chrome, Edge or Firefox.",
  in_app: "This page is open inside another app (WhatsApp, Instagram, Facebook…), which can’t receive notifications. Open it in Chrome or Safari — the menu (⋯) has “Open in browser”.",
  brave: "Brave keeps notifications off until you allow its push service. Open brave://settings/privacy, turn on “Use Google services for push messaging”, then press Turn on again.",
  service: "The browser couldn’t reach its notification service. Check your connection and press Turn on again; if it keeps failing, try Chrome or Firefox.",
  denied: "Notifications are blocked for this site in your browser. Open the site’s settings (the icon to the left of the address), allow Notifications, then reload this page. On a phone: Settings → Apps → your browser → Notifications.",
  unsupported: "This browser can’t receive notifications. Chrome, Edge, Firefox, Samsung Internet or Safari can.",
};
/** Notification.requestPermission, on browsers that answer by promise AND the older Safari that answers by callback. */
function nggPushAsk() {
  return new Promise(resolve => {
    let done = false; const fin = p => { if (!done) { done = true; resolve(p); } };
    try { const r = Notification.requestPermission(fin); if (r && typeof r.then === "function") r.then(fin, () => fin("default")); }
    catch (_) { fin(Notification.permission || "default"); }
  });
}
/** A subscription's keys, from toJSON or — where a browser leaves them out — read off the object. */
function nggPushSubJson(sub) {
  const j = sub.toJSON ? sub.toJSON() : {};
  if (j && j.keys && j.keys.p256dh && j.keys.auth) return { endpoint: j.endpoint || sub.endpoint, keys: j.keys };
  const k = n => { try { const b = new Uint8Array(sub.getKey(n)); let s = ""; b.forEach(x => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); } catch (_) { return ""; } };
  return { endpoint: sub.endpoint, keys: { p256dh: k("p256dh"), auth: k("auth") } };
}

function nggPushKey(b64u) {
  const s = String(b64u || "").replace(/-/g, "+").replace(/_/g, "/"), pad = "=".repeat((4 - s.length % 4) % 4);
  const raw = atob(s + pad), out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
/* Safari and older Firefox do not expose the key a subscription was made
   with. Unknown is treated as the same: answering "different" would
   unsubscribe and resubscribe on every visit, minting a new address each time. */
function nggPushSameKey(sub, key) {
  try {
    const k = sub && sub.options && sub.options.applicationServerKey;
    if (!k) return true;
    const a = new Uint8Array(k); return a.length === key.length && a.every((x, i) => x === key[i]);
  } catch (_) { return true; }
}
async function nggPushReg() {
  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) reg = await navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" });
  if (!reg.active) await new Promise(res => { const sw = reg.installing || reg.waiting; if (!sw) return res(); sw.addEventListener("statechange", () => { if (sw.state === "activated") res(); }); setTimeout(res, 8000); });
  return reg;
}
async function nggPushCurrent() {
  try { if (!("serviceWorker" in navigator)) return null; const reg = await navigator.serviceWorker.getRegistration("/"); return reg && reg.pushManager ? await reg.pushManager.getSubscription() : null; } catch (_) { return null; }
}

/** Ask, subscribe this device, and tell the server. Throws with a `why` the card can say. */
async function nggPushEnable(surface, publicKey) {
  const env = nggPushEnv();
  if (!env.ok) throw Object.assign(new Error(env.why), { why: env.why });
  if (!publicKey) throw Object.assign(new Error("unavailable"), { why: "unavailable" });
  // Asked first, inside the press: Safari refuses a permission prompt that is not the direct result of one.
  const perm = await nggPushAsk();
  if (perm !== "granted") throw Object.assign(new Error(perm), { why: perm === "denied" ? "denied" : "dismissed" });
  const reg = await nggPushReg();
  const key = nggPushKey(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !nggPushSameKey(sub, key)) { try { await sub.unsubscribe(); } catch (_) {} sub = null; }
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); }
    catch (e) {
      /* Brave refuses with a push-service error until its own setting is
         on; any other browser failing here could not reach its service. */
      let brave = false; try { brave = !!(navigator.brave && await navigator.brave.isBrave()); } catch (_) {}
      throw Object.assign(new Error("service"), { why: brave ? "brave" : e && e.name === "NotAllowedError" ? "denied" : "service" });
    }
  }
  const json = nggPushSubJson(sub);
  if (!json.keys.p256dh || !json.keys.auth) throw Object.assign(new Error("service"), { why: "service" });
  await NGGApi.push.subscribe(surface, json);
  try { localStorage.removeItem("ngg.push.snooze." + surface); } catch (_) {}
  // The page that just turned it on starts reporting presence at once (nggPushBoot).
  try { window.dispatchEvent(new CustomEvent("ngg:push-changed", { detail: { surface, on: true } })); } catch (_) {}
  return sub;
}
async function nggPushDisable(surface, everywhere) {
  const sub = await nggPushCurrent();
  await NGGApi.push.unsubscribe(surface, sub ? sub.endpoint : "", !!everywhere);
  if (sub) { try { await sub.unsubscribe(); } catch (_) {} }
}

/**
 * Once per portal visit: keep the server's record of this device true, and
 * report presence while the page is in front of somebody. The Control Room
 * always reports (it also decides whether an inbox email is needed); a
 * portal only when the person has a device to spare a buzz on. Returns the
 * cleanup.
 */
function nggPushBoot(surface) {
  let stop = false, timer = null, last = 0;
  const ping = () => {
    if (stop || document.visibilityState !== "visible") return;
    const now = Date.now(); if (now - last < 45000) return; last = now;
    NGGApi.push.seen(surface).catch(() => {});
  };
  const onVis = () => ping();
  let pinging = false;
  const startPing = () => {
    if (pinging || stop) return; pinging = true;
    document.addEventListener("visibilitychange", onVis); window.addEventListener("focus", onVis);
    timer = setInterval(ping, 60000); last = 0; ping();
  };
  const onChanged = e => { if (e && e.detail && e.detail.on && e.detail.surface === surface) startPing(); };
  window.addEventListener("ngg:push-changed", onChanged);
  const onMsg = e => { if (e && e.data && e.data.type === "ngg:push") { try { window.dispatchEvent(new CustomEvent("ngg:push", { detail: e.data })); } catch (_) {} } };
  (async () => {
    const sub = await nggPushCurrent();
    let prefs = null;
    try { prefs = await NGGApi.push.prefs(surface, sub ? sub.endpoint : ""); } catch (_) { return; }
    if (stop || !prefs) return;
    // A device the browser renewed, or one last used by somebody else here: register it again.
    const env = nggPushEnv();
    if (sub && env.ok && env.permission === "granted" && prefs.publicKey && (!prefs.thisDevice || !nggPushSameKey(sub, nggPushKey(prefs.publicKey)))) {
      try { await nggPushEnable(surface, prefs.publicKey); } catch (_) {}
    }
    if (stop) return;
    if (surface === "admin" || (prefs.devices || []).length) startPing();
  })();
  try { if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", onMsg); } catch (_) {}
  return () => {
    stop = true; if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); window.removeEventListener("ngg:push-changed", onChanged);
    try { if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onMsg); } catch (_) {}
  };
}
function useNggPush(surface) { React.useEffect(() => nggPushBoot(surface), [surface]); }

/* ── The settings card ──────────────────────────────────────────────────── */

function NggPushCard({ surface, compact, title }) {
  const sf = surface || "member";
  const words = NGG_PUSH_SURFACE_WORDS[sf] || NGG_PUSH_SURFACE_WORDS.member;
  const [st, setSt] = React.useState({ loading: true });
  const [busy, setBusy] = React.useState("");
  const [note, setNote] = React.useState("");
  const [open, setOpen] = React.useState(!compact);
  const env = nggPushEnv();
  const load = React.useCallback(async () => {
    setSt(x => Object.assign({}, x, { loading: true, error: "" }));
    try {
      const sub = await nggPushCurrent();
      const r = await NGGApi.push.prefs(sf, sub ? sub.endpoint : "");
      setSt({ loading: false, data: r, on: !!(sub && r.thisDevice) });
    } catch (e) { setSt({ loading: false, error: (e && (e.detail || e.message)) || "We couldn’t check your notifications." }); }
  }, [sf]);
  React.useEffect(() => { load(); }, [load]);
  const d = st.data || {};
  const prefs = d.prefs || {};
  const save = async patch => {
    const next = Object.assign({}, prefs, patch);
    setSt(x => Object.assign({}, x, { data: Object.assign({}, x.data, { prefs: next }) }));
    setNote("Saving…");
    try { const r = await NGGApi.push.savePrefs(sf, next); setSt(x => Object.assign({}, x, { data: Object.assign({}, x.data, { prefs: r.prefs }) })); setNote("Saved."); }
    catch (e) { setNote((e && e.detail) || "That didn’t save. Try again."); setSt(x => Object.assign({}, x, { data: Object.assign({}, x.data, { prefs }) })); }
  };
  const turnOn = async () => {
    setBusy("on"); setNote("");
    try { await nggPushEnable(sf, d.publicKey); await load(); setNote("Notifications are on for this device."); }
    catch (e) {
      const why = e && e.why;
      setNote(why === "dismissed" ? "Nothing changed — the browser’s question was closed. Press Turn on again when you’re ready."
        : NGG_PUSH_WHY[why] || (e && e.detail) || "We couldn’t turn them on here. Try again, or try another browser.");
      await load();
    }
    setBusy("");
  };
  const turnOff = async everywhere => {
    setBusy(everywhere ? "all" : "off"); setNote("");
    try { await nggPushDisable(sf, everywhere); await load(); setNote(everywhere ? "Turned off on every device." : "Turned off on this device."); }
    catch (e) { setNote((e && e.detail) || "That didn’t work. Try again."); }
    setBusy("");
  };
  const test = async () => {
    setBusy("test"); setNote("");
    try { const r = await NGGApi.push.test(sf); setNote(r.sent ? "Sent to " + (r.sent === 1 ? "1 device" : r.sent + " devices") + ". It should appear in a few seconds." + (r.failed ? " " + r.failed + " didn’t answer." : "") : "No device answered. Turn notifications off and on again here."); }
    catch (e) { setNote((e && e.detail) || (e && e.code === "rate_limited" ? "That’s a lot of tests — wait a few minutes." : "The test didn’t send. Try again.")); }
    setBusy("");
  };
  const topics = d.topics || [];
  const others = (d.devices || []).filter(x => !x.thisOne);
  const muted = prefs.muted || [];

  return (
    <section className={"ngp" + (compact ? " is-compact" : "")} aria-labelledby={"ngp-h-" + sf}>
      <div className="ngp-head">
        <span className="ngp-ic" aria-hidden="true"><i className={"ph " + (st.on ? "ph-bell-ringing" : "ph-bell-slash")}/></span>
        <div className="ngp-head-t">
          <h3 id={"ngp-h-" + sf} className="ngp-h">{title || "Notifications on this device"}</h3>
          <p className="ngp-sub">{st.loading ? "Checking…" : st.error ? "Couldn’t check" : !d.available ? "Not available yet" : !env.ok ? "Can’t be turned on here" : st.on ? "On" + (prefs.quiet ? " · quiet " + prefs.quietFrom + "–" + prefs.quietTo : "") : "Off"}</p>
        </div>
        {compact && !st.loading && !st.error ? <button type="button" className="ngp-link" aria-expanded={open ? "true" : "false"} onClick={() => setOpen(!open)}>{open ? "Hide" : "Settings"}</button> : null}
      </div>

      {st.loading ? <div className="ngp-skel" role="status" aria-label="Checking notifications"><span/><span/></div>
      : st.error ? <div className="ngp-state" role="alert"><p>{st.error}</p><button type="button" className="ngp-btn" onClick={load}>Try again</button></div>
      : !d.available ? <p className="ngp-p">This server can’t send notifications yet. Email and the bell in the portal still work.</p>
      : <>
        {!env.ok ? <p className="ngp-p ngp-why" role="note">{NGG_PUSH_WHY[env.why] || NGG_PUSH_WHY.unsupported}</p>
        : !st.on ? <div className="ngp-off">
            <p className="ngp-p">{words.what}</p>
            <button type="button" className="ngp-btn is-primary" onClick={turnOn} disabled={!!busy}>{busy === "on" ? "Turning on…" : "Turn on notifications"}</button>
          </div>
        : <div className="ngp-row">
            <button type="button" className="ngp-btn" onClick={test} disabled={!!busy}>{busy === "test" ? "Sending…" : "Send a test"}</button>
            <button type="button" className="ngp-btn" onClick={() => turnOff(false)} disabled={!!busy}>{busy === "off" ? "Turning off…" : "Turn off here"}</button>
          </div>}

        {open && (st.on || others.length || sf === "admin") ? <div className="ngp-prefs">
          <div className="ngp-pref">
            <div><b>Quiet hours</b><small>Nothing buzzes in this window; it waits and arrives as one summary when it ends. Urgent alerts still come through — {sf === "admin" ? "a safeguarding concern" : "a child checking in or out, a safeguarding message"}.</small></div>
            <button type="button" className={"ngp-sw" + (prefs.quiet ? " is-on" : "")} aria-pressed={prefs.quiet ? "true" : "false"} aria-label="Quiet hours" onClick={() => save({ quiet: !prefs.quiet })}><span/></button>
          </div>
          {prefs.quiet ? <div className="ngp-times">
            <label>From <input type="time" value={prefs.quietFrom || "21:00"} onChange={e => save({ quietFrom: e.target.value })}/></label>
            <label>Until <input type="time" value={prefs.quietTo || "07:00"} onChange={e => save({ quietTo: e.target.value })}/></label>
          </div> : null}
          <fieldset className="ngp-topics">
            <legend>What reaches {sf === "family" ? "this phone" : "this device"}</legend>
            {topics.map(t => { const on = !muted.includes(t.id); return (
              <div key={t.id} className="ngp-pref">
                <span>{t.label}</span>
                <button type="button" className={"ngp-sw" + (on ? " is-on" : "")} aria-pressed={on ? "true" : "false"} aria-label={t.label}
                  onClick={() => save({ muted: on ? muted.concat([t.id]) : muted.filter(x => x !== t.id) })}><span/></button>
              </div>); })}
          </fieldset>
          {sf === "admin" ? <div className="ngp-pref">
            <div><b>Email me about new inbox items</b><small>At most one email every half hour for each part of the inbox, and none while you’re in the Control Room.</small></div>
            <button type="button" className={"ngp-sw" + (prefs.inboxEmail ? " is-on" : "")} aria-pressed={prefs.inboxEmail ? "true" : "false"} aria-label="Email me about new inbox items" onClick={() => save({ inboxEmail: !prefs.inboxEmail })}><span/></button>
          </div> : null}
          {others.length ? <div className="ngp-devs">
            <p className="ngp-p">{st.on ? "Also on " : "On "}{others.map(x => x.device).join(", ")}.</p>
            <button type="button" className="ngp-link" onClick={() => turnOff(true)} disabled={!!busy}>{busy === "all" ? "Turning off…" : "Turn off everywhere"}</button>
          </div> : null}
        </div> : null}
      </>}
      <p className="ngp-note" role="status" aria-live="polite">{note}</p>
    </section>
  );
}

/**
 * The ask, at a moment the person can see the point of it. Shown only when
 * the device can be reached, the browser has not been asked yet, the person
 * has no device on, and they did not say "not now" in the last two weeks.
 */
function NggPushNudge({ surface, text }) {
  const sf = surface || "member";
  const words = NGG_PUSH_SURFACE_WORDS[sf] || NGG_PUSH_SURFACE_WORDS.member;
  const [show, setShow] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const snoozeKey = "ngg.push.snooze." + sf;
  React.useEffect(() => {
    let live = true;
    const env = nggPushEnv();
    if (!env.ok || env.permission !== "default") return undefined;
    try { const t = Number(localStorage.getItem(snoozeKey) || 0); if (t && Date.now() - t < NGG_PUSH_SNOOZE_DAYS * 864e5) return undefined; } catch (_) {}
    NGGApi.push.prefs(sf, "").then(r => { if (live && r && r.available && !(r.devices || []).length) { setKey(r.publicKey); setShow(true); } }, () => {});
    return () => { live = false; };
  }, [sf]);
  if (!show) return null;
  const later = () => { try { localStorage.setItem(snoozeKey, String(Date.now())); } catch (_) {} setShow(false); };
  const on = async () => {
    setBusy(true); setMsg("");
    try { await nggPushEnable(sf, key); setMsg("Done — notifications are on. Change what you get any time in settings."); setTimeout(() => setShow(false), 4000); }
    catch (e) { setMsg(e && e.why === "dismissed" ? "No problem — nothing was turned on." : NGG_PUSH_WHY[e && e.why] || "That didn’t work on this browser."); if (e && e.why === "dismissed") later(); }
    setBusy(false);
  };
  return (
    <aside className="ngp-nudge" aria-label="Turn on notifications">
      <span className="ngp-ic" aria-hidden="true"><i className="ph ph-bell-ringing"/></span>
      <div className="ngp-nudge-t"><b>Get these on your {sf === "admin" ? "device" : "phone"}</b><small>{text || words.what}</small>
        <span className="ngp-note" role="status" aria-live="polite">{msg}</span></div>
      <div className="ngp-row">
        <button type="button" className="ngp-btn is-primary" onClick={on} disabled={busy}>{busy ? "Turning on…" : "Turn on"}</button>
        <button type="button" className="ngp-btn" onClick={later} disabled={busy}>Not now</button>
      </div>
    </aside>
  );
}

Object.assign(window, { NggPushCard, NggPushNudge, nggPushBoot, useNggPush, nggPushEnv, nggPushEnable, nggPushDisable });

/* Shared with public pages (owner, 7 Nov 2026: "optimise speed … for low-end devices"): these lived in
   page-portals.jsx / page-dashboard.jsx, which now ship only in the signed-in bundle, so a public page
   (the Club, the Anchor application, Learn) must find them here. */
const naira = (n) => fmtMoney(n);

function Field({ label, value, onChange, type, placeholder, required, disabled, hint }) {
  return (
    <label className="admin-field">
      <span>{label}{required && <em>*</em>}</span>
      <input type={type || "text"} className="admin-input" value={value == null ? "" : value} disabled={!!disabled}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required}
        style={disabled ? { opacity: .7, cursor: "not-allowed" } : undefined}/>
      {hint && <span className="admin-hint" style={{ margin: 0 }}>{hint}</span>}
    </label>
  );
}

function CurCheckField({ c, n, value, onChange, verdict, mark, disabled }) {
  const rv = verdict;
  return (
    <fieldset className="cur-check">
      <legend><span className="cur-check-n">{n}.</span> {c.prompt} <span className="cur-check-pts">{c.points} pt{c.points === 1 ? "" : "s"}</span></legend>
      {/* THE VIDEO IS PART OF THE QUESTION, so it plays here. Sending a
          learner away to find it is where this flow breaks: they lose the
          exam, they lose the question, and on a phone they lose the tab. */}
      {c.kind === "watch" && c.videoUrl && (() => {
        const v = curVideoEmbed(c.videoUrl);
        return v ? <div className="cur-watch">
          <div className="cur-embed"><iframe src={v.src} title={v.title} loading="lazy"
            allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"/></div>
          <p className="cur-watch-note">Watch it, then write what you took from it — in your own words. A detail or a moment from the video counts for more than a tidy summary.</p>
        </div> : null;
      })()}
      {/* An outside exercise: where it is, then their proof and account in the box below. */}
      {c.kind === "order" || c.kind === "evidence"
        /* One ordering control and one outside-exercise answer in the app: the exam player's (lrn-exam.jsx). */
        ? <LxField q={{ ...c, n }} value={value} onChange={onChange} onPaste={() => {}} onType={() => {}} disabled={disabled}/>
        : c.kind === "mcq"
        ? c.options.map((o, k) => (
            /* `answer` is there once the right answers are revealed (a pass,
               or enough tries); before that only `right` comes back, so the
               learner is told which they got wrong and has to think again. */
            <label key={k} className={"cur-opt" + (rv && (rv.answer !== undefined ? String(k) === rv.answer : rv.right && value === k) ? " is-right" : "")
                                     + (rv && value === k && (rv.answer !== undefined ? String(k) !== rv.answer : !rv.right) ? " is-wrong" : "")}>
              <input type="radio" name={c.checkId} checked={value === k} disabled={disabled} onChange={() => onChange(k)}/>
              <span>{o}</span>
            </label>))
        : <React.Fragment>
            <textarea className={"cur-answer" + (c.kind === "code" ? " is-code" : "")} rows={["essay", "reflection", "project", "code"].includes(c.kind) ? 8 : 3}
              value={value || ""} aria-label={"Answer to question " + n} spellCheck={c.kind !== "code"} disabled={disabled}
              onChange={e => onChange(e.target.value)}
              placeholder={{ essay: "Make your case — a clear point, your reasons, an example", reflection: "Be honest and specific — there is no wrong answer",
                project: "What you made, how you made it, and what you learned", task: "What you actually did, and one decision you made while doing it",
                watch: "What you took from it — something specific you saw or heard, in your own words",
                evidence: "The link to your result, then what you did, your score, and one thing that went wrong",
                code: "Paste or type your code" }[c.kind] || "Your answer, in your own words"}/>
            {CUR_SHOWS_WORK.includes(c.kind) && !disabled && <CurAttach n={n} onAdd={url => onChange(((value || "") + "\n" + url).trim())}/>}
          </React.Fragment>}
      {mark && mark.feedback && <p className="cur-feedback"><b>{mark.by === "ai" ? "Feedback (AI)" : mark.by === "auto" ? "Note" : "Your instructor"}:</b> {mark.feedback}</p>}
      {rv && rv.slip && <p className="cur-feedback"><b>Why that one is tempting:</b> {rv.slip}</p>}
      {rv && c.kind !== "mcq" && c.kind !== "order" && rv.answer && <p className="cur-model"><b>A strong answer:</b> {rv.answer}</p>}
      {rv && rv.answer === undefined && !rv.right && <p className="cur-feedback"><b>Not yet.</b> Think it through again — the answer is shown once you pass, or after a few tries.</p>}
    </fieldset>
  );
}

const CUR_SHOWS_WORK = ["task", "project", "code"];

function CurAttach({ n, onAdd }) {
  const [busy, setBusy] = React.useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await NGGApi.member.curriculumUpload(file);
      onAdd(r.url);
      toast.success("Added to your answer.", file.name);
    } catch (e) {
      toast.error(e.code === "too_large" ? "That file is over 25 MB — a shorter recording or a smaller photo."
        : e.code === "bad_type" ? "That kind of file is not allowed here." : humanizeError(e.code, e.code));
    } finally { setBusy(false); }
  };
  return (
    <div className="cur-attach">
      <label className={"cur-attach-btn" + (busy ? " is-busy" : "")}>
        {busy ? "Adding…" : "Attach your work"}
        <input type="file" className="sr-only" disabled={busy} accept={CUR_FILE_ACCEPT}
               aria-label={"Attach your work for question " + n}
               onChange={e => { pick(e.target.files && e.target.files[0]); e.target.value = ""; }}/>
      </label>
      <span className="cur-attach-hint">A photo, a recording, a screenshot or a file — whatever shows you did it.</span>
    </div>
  );
}
