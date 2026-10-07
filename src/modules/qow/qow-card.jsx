/* ============================================================================
   Quote of the week — the share card (design_handoff_quote_card v2).

   Three fixed canvases from ONE data object and ONE palette:
     feed 1080×1350 · story 1080×1920 · wide 1200×630.
   The layout is assets/fonts/qcard/qcard.css; colours are the palette's eight
   slots, set on the card root as CSS custom properties (QC_PALETTES is the only
   place a card hex lives).

   Export draws the card the browser has ALREADY laid out: the live DOM node is
   serialised into an SVG <foreignObject> with the same stylesheet, its fonts and
   the logo inlined, and painted onto a canvas at 1× (or 2×, on request). There
   is no second drawing of the card — no canvas re-layout, no html2canvas — so
   the PNG is the preview, balanced wrapping and the per-line highlight included.

   Data (QowShareSheet → QcCard): the saying as written in Hausa, Igbo or
   Yorùbá is the quote; "by" is the language and kind ("Igbo proverb"); the
   source line is "Quote of the week · Igbo"; week is the ISO week number of
   the week the saying is for.
   ========================================================================== */

const QC_PALETTES = {
  "Brand":        { bg: "#1F3263", onBg: "#FFFFFF", card: "#FFFAF0", ink: "#14203F", inkMuted: "#525B75", a1: "#F5B026", a2: "#FF5C7A", a3: "#3FB8FF" },
  "Brand Bright": { bg: "#2A3F8F", onBg: "#FFFFFF", card: "#FFF8E8", ink: "#14203F", inkMuted: "#525B75", a1: "#FFC233", a2: "#FF6B4A", a3: "#B8F04A" },
  "Brand Gold":   { bg: "#F5B026", onBg: "#14203F", card: "#FFFFFF", ink: "#14203F", inkMuted: "#525B75", a1: "#7FD6FF", a2: "#1F3263", a3: "#FF8FB1" },
  "Pop":          { bg: "#5B3DF5", onBg: "#FFFFFF", card: "#FFFAF0", ink: "#16122E", inkMuted: "#5A5470", a1: "#C8F53A", a2: "#FF6B57", a3: "#FF9FD4" },
  "Sunset":       { bg: "#FF6A3D", onBg: "#1D1020", card: "#FFF6EA", ink: "#1D1020", inkMuted: "#6A5560", a1: "#FFD93D", a2: "#3A2CF0", a3: "#FFB8CC" },
  "Lagoon":       { bg: "#0B7A72", onBg: "#FFFFFF", card: "#F4FFFB", ink: "#0D1F1D", inkMuted: "#4C6461", a1: "#FFD23F", a2: "#FF5F93", a3: "#8FE3FF" },
};
const QC_PALETTE_NAMES = Object.keys(QC_PALETTES);
const QC_KINDS = [
  { id: "feed", label: "Feed post", w: 1080, h: 1350, use: "Instagram and Facebook" },
  { id: "story", label: "Story", w: 1080, h: 1920, use: "Stories and WhatsApp status" },
  { id: "wide", label: "Wide", w: 1200, h: 630, use: "X and link previews" },
];
const QC_MAX_QUOTE = 220;
const QC_CSS_URL = "/assets/fonts/qcard/qcard.css";
const QC_FOOTER_DEFAULT = "next.afrovanguard.org.ng";

/* ── Derived values (spec §1.1) ─────────────────────────────────────────── */

/** First non-space character of `by`, uppercased; N when there is none. */
function qcInitial(by) { const m = String(by || "").match(/\S/); return m ? m[0].toUpperCase() : "N"; }

/** [before, match, after] around the FIRST case-insensitive match of the highlight; the match keeps the quote's casing. */
function qcSegments(quote, highlight) {
  const q = String(quote || ""), h = String(highlight || "").trim();
  const i = h ? q.toLowerCase().indexOf(h.toLowerCase()) : -1;
  if (i < 0) return [{ text: q, hl: false }];
  return [{ text: q.slice(0, i), hl: false }, { text: q.slice(i, i + h.length), hl: true }, { text: q.slice(i + h.length), hl: false }].filter(s => s.text);
}

/** Quote size step by length (spec §1.1): 1 for ≤ 60 characters … 4 for > 150.
    The pixel sizes per card are classes in qcard.css (.qc-s1 … .qc-s4) — not an
    inline style, which the site's phone stylesheet rewrites by attribute match. */
function qcQuoteStep(n) { return n <= 60 ? 1 : n <= 100 ? 2 : n <= 150 ? 3 : 4; }

/* Yorùbá stacks marks: ẹ̀ is e + dot below + grave, and no single character
   holds both, so after composing (NFC) the grave is left loose beside a
   precomposed ẹ — and drawn as a spacing accent, detached. Such a letter is
   written fully decomposed instead, so Bricolage stacks both marks itself.
   ṣ/Ṣ are decomposed too: Bricolage has no ṣ, but draws s + U+0323. */
function qcText(s) {
  return String(s || "").normalize("NFC").replace(/\P{M}\p{M}*/gu, c => {
    const n = c.normalize("NFC");
    return (n.length > 1 || n === "ṣ" || n === "Ṣ") ? c.normalize("NFD") : n;
  });
}

/** ISO week number of a YYYY-MM-DD date (the Monday the saying is for). */
function qcIsoWeek(ymd) {
  const d = ymd ? new Date(ymd + "T12:00:00Z") : new Date();
  if (isNaN(d)) return "";
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return String(Math.ceil(((t - y0) / 86400000 + 1) / 7));
}

function qcFooter() {
  const h = String((window.location && window.location.hostname) || "").replace(/^www\./, "");
  return !h || h === "localhost" || /^[\d.]+$/.test(h) ? QC_FOOTER_DEFAULT : h;
}

/** The card's data object from the home page's saying. */
function qcDataFromSaying(s, weekYmd) {
  const lang = QOW_LANG[s.language] || "";
  const kind = (QOW_KIND[s.kind] || "Quote").toLowerCase();
  return {
    quote: String(s.text || "").trim(),
    highlight: "",
    by: (lang ? lang + " " : "") + kind,
    source: "Quote of the week" + (lang ? " · " + lang : ""),
    week: qcIsoWeek(weekYmd),
    footer: qcFooter(),
  };
}

/** Spec §10: the exported image's alt text. */
function qcAlt(d) { return "“" + d.quote + "” " + d.by + ", " + d.source + ". Next Generation Genius quote of the week, week " + d.week + "."; }

/* ── The card ───────────────────────────────────────────────────────────── */

function QcCard({ kind, data, palette, cardRef }) {
  const p = QC_PALETTES[palette] || QC_PALETTES.Brand;
  /* The palette is data, so it is the one thing set inline — as variables the
     stylesheet reads, never as a colour on an element. */
  const vars = { "--qc-bg": p.bg, "--qc-on-bg": p.onBg, "--qc-card": p.card, "--qc-ink": p.ink, "--qc-ink-muted": p.inkMuted, "--qc-a1": p.a1, "--qc-a2": p.a2, "--qc-a3": p.a3 };
  const quote = qcText(data.quote);
  const segs = qcSegments(quote, qcText(data.highlight));
  const q = (
    <p className={"qc-quote qc-s" + qcQuoteStep(quote.length)}>
      {segs.map((s, i) => <span key={i} className={s.hl ? "qc-mark" : undefined}>{s.text}</span>)}
    </p>
  );
  const badge = <span className="qc-badge" aria-hidden="true">{"“"}</span>;
  const logo = <img className="qc-logo" src="/assets/logo.png" alt="" crossOrigin="anonymous"/>;
  const avatar = <span className="qc-avatar">{qcInitial(data.by)}</span>;
  const src = qcText(data.source), by = qcText(data.by);

  if (kind === "wide") return (
    <div ref={cardRef} className="qc qc-wide" style={vars} data-qc="wide">
      <span className="qc-deco qc-deco-c qc-d1" aria-hidden="true"/>
      <div className="qc-wleft">
        {badge}
        <span className="qc-week">WEEK {data.week}</span>
        {logo}
      </div>
      <div className="qc-panel">
        <span className="qc-eyebrow">Next Generation Genius · Quote of the week</span>
        {q}
        <div className="qc-author">{avatar}<span className="qc-by">{by}</span><span className="qc-src">{src}</span></div>
      </div>
    </div>
  );
  const story = kind === "story";
  return (
    <div ref={cardRef} className={"qc qc-" + (story ? "story" : "feed")} style={vars} data-qc={kind}>
      <span className="qc-deco qc-deco-c qc-d1" aria-hidden="true"/>
      <span className="qc-deco qc-deco-c qc-d2" aria-hidden="true"/>
      <span className="qc-deco qc-d3" aria-hidden="true"/>
      <div className="qc-head">
        {logo}
        <span className="qc-brand">Next Generation Genius</span>
        <span className="qc-week">{story ? "QUOTE OF THE WEEK · " + data.week : "WEEK " + data.week}</span>
      </div>
      <div className="qc-panel">
        {badge}
        {!story && <span className="qc-chip">Quote of the week</span>}
        {q}
        <div className="qc-author">{avatar}<div className="qc-who"><span className="qc-by">{by}</span><span className="qc-src">{src}</span></div></div>
      </div>
      <span className="qc-foot">{data.footer}</span>
    </div>
  );
}

/* ── Fonts and the stylesheet, loaded only when somebody shares ─────────── */

let _qcCssReady = null;
function qcEnsureAssets() {
  if (_qcCssReady) return _qcCssReady;
  _qcCssReady = new Promise((resolve, reject) => {
    let link = document.getElementById("qc-css");
    if (!link) {
      link = document.createElement("link");
      link.id = "qc-css"; link.rel = "stylesheet"; link.href = QC_CSS_URL;
      document.head.appendChild(link);
    }
    if (link.sheet) return resolve();
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => reject(new Error("card_css")), { once: true });
  }).then(() => Promise.all([
    /* Every subset, not just Latin: a font only loads for the characters asked
       for, and the sayings live in latin-ext (ɗ ƙ ŋ) and the Vietnamese subset
       (ẹ ọ and the combining marks). */
    document.fonts.load('800 96px "QC Bricolage"', "Aa\u1EB9\u1ECD\u0323\u0300\u0301\u0100"), document.fonts.load('700 34px "QC Bricolage"', "Aa\u0100\u1EB9"), document.fonts.load('600 26px "QC Bricolage"'),
    document.fonts.load('800 96px "QC Hooks"', "ƙɗɓ"),
    document.fonts.load('400 26px "QC Geist"'), document.fonts.load('600 20px "QC Geist"'), document.fonts.load('500 28px "QC Geist Mono"'),
  ])).then(() => document.fonts.ready).catch(e => { _qcCssReady = null; throw e; });
  return _qcCssReady;
}

/* ── Export ─────────────────────────────────────────────────────────────── */

function qcBlobToDataUrl(blob) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
}
async function qcFetchDataUrl(url) {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error("asset_" + r.status);
  return qcBlobToDataUrl(await r.blob());
}
let _qcInlineCss = null;
/** The card stylesheet with every font inlined, for the SVG the export draws. */
function qcInlineCss() {
  if (_qcInlineCss) return _qcInlineCss;
  _qcInlineCss = (async () => {
    const css = await (await fetch(QC_CSS_URL, { cache: "force-cache" })).text();
    const base = QC_CSS_URL.replace(/[^/]+$/, "");
    const urls = Array.from(new Set((css.match(/url\(\.\/[^)]+\)/g) || []).map(u => u.slice(6, -1))));
    const map = {};
    await Promise.all(urls.map(async u => { map[u] = await qcFetchDataUrl(base + u); }));
    return css.replace(/url\(\.\/([^)]+)\)/g, (m, u) => "url(" + map[u] + ")");
  })().catch(e => { _qcInlineCss = null; throw e; });
  return _qcInlineCss;
}

/**
 * Does any text spill out of the card? The panel must hold the quote and the
 * author row, and no line may run past its box (spec §1.2 — never truncate).
 */
function qcOverflows(el) {
  if (!el) return false;
  const panel = el.querySelector(".qc-panel");
  if (panel && panel.scrollHeight > panel.clientHeight + 1) return true;
  for (const n of el.querySelectorAll(".qc-quote, .qc-by, .qc-src, .qc-author")) {
    if (n.scrollWidth > n.clientWidth + 1) return true;
  }
  const quote = el.querySelector(".qc-quote"), author = el.querySelector(".qc-author");
  if (panel && quote && author) {
    const pb = panel.getBoundingClientRect(), ab = author.getBoundingClientRect(), qb = quote.getBoundingClientRect();
    const k = el.getBoundingClientRect().width / el.offsetWidth || 1;   // the preview is scaled
    if (ab.bottom > pb.bottom + 1 * k || qb.bottom > ab.top + 1 * k) return true;
  }
  return false;
}

/** The card node → a PNG Blob at `scale` × its canvas size. */
async function qcRenderPng(el, scale) {
  await qcEnsureAssets();
  const w = el.offsetWidth, h = el.offsetHeight;
  const [css, logo] = await Promise.all([qcInlineCss(), qcFetchDataUrl("/assets/logo.png")]);
  const clone = el.cloneNode(true);
  clone.style.transform = "none";
  clone.querySelectorAll("img.qc-logo").forEach(img => { img.setAttribute("src", logo); img.removeAttribute("crossorigin"); });
  const html = new XMLSerializer().serializeToString(clone);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><foreignObject x="0" y="0" width="100%" height="100%">'
    + '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + w + 'px;height:' + h + 'px;margin:0;padding:0"><style>' + css.replace(/<\/style/gi, "<\\/style") + '</style>' + html + '</div>'
    + '</foreignObject></svg>';
  const img = new Image();
  img.decoding = "sync";
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  /* A data-URL font inside an SVG image can still be settling when it first
     decodes; one frame's grace keeps the first export out of a fallback face. */
  await new Promise(r => setTimeout(r, 120));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("png_failed")), "image/png"));
}

function qcFileName(d, kind) { return "ngg-quote-w" + (d.week || "0") + "-" + kind + ".png"; }

/* ── The share sheet ────────────────────────────────────────────────────── */

function qcStored(key, ok, fallback) { try { const v = localStorage.getItem(key); return ok(v) ? v : fallback; } catch (_) { return fallback; } }
function qcStore(key, v) { try { localStorage.setItem(key, v); } catch (_) {} }

function QowShareSheet({ saying, weekYmd, onClose, shareText }) {
  const data = React.useMemo(() => qcDataFromSaying(saying, weekYmd), [saying, weekYmd]);
  const [kind, setKind] = React.useState(() => qcStored("ngg_qc_kind", v => QC_KINDS.some(k => k.id === v), "feed"));
  const [palette, setPalette] = React.useState(() => qcStored("ngg_qc_palette", v => !!QC_PALETTES[v], "Brand"));
  const [double, setDouble] = React.useState(false);
  const [ready, setReady] = React.useState(false);       // fonts + stylesheet loaded
  const [loadErr, setLoadErr] = React.useState(false);
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [overflow, setOverflow] = React.useState(false);
  const [box, setBox] = React.useState(0);
  const cardRef = React.useRef(null), stageRef = React.useRef(null), panelRef = React.useRef(null), backRef = React.useRef(null);
  const k = QC_KINDS.find(x => x.id === kind) || QC_KINDS[0];
  const tooLong = data.quote.length > QC_MAX_QUOTE;

  React.useEffect(() => {
    let alive = true;
    qcEnsureAssets().then(() => alive && setReady(true), () => alive && setLoadErr(true));
    backRef.current = document.activeElement;
    const onKey = e => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    setTimeout(() => { const f = panelRef.current && panelRef.current.querySelector("button"); if (f) f.focus(); }, 30);
    return () => { alive = false; document.removeEventListener("keydown", onKey); try { backRef.current && backRef.current.focus(); } catch (_) {} };
  }, []);
  // The preview scales the fixed canvas into the space it has — the card itself never changes size.
  React.useEffect(() => {
    const el = stageRef.current; if (!el) return undefined;
    const measure = () => setBox(el.clientWidth);
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, []);
  React.useEffect(() => { if (ready) setOverflow(qcOverflows(cardRef.current)); }, [ready, kind, palette, data, box]);

  const maxH = Math.min(560, Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.55));
  const scale = box ? Math.min(box / k.w, maxH / k.h, 1) : 0.3;
  const blocked = tooLong ? "Quote is too long for the card (max 220)." : overflow ? "Shorten the quote or source." : "";

  const pickKind = id => { setKind(id); qcStore("ngg_qc_kind", id); setMsg(""); };
  const pickPalette = name => { setPalette(name); qcStore("ngg_qc_palette", name); setMsg(""); };
  const make = async () => {
    const blob = await qcRenderPng(cardRef.current, double ? 2 : 1);
    return new File([blob], qcFileName(data, kind), { type: "image/png" });
  };
  const download = async () => {
    if (blocked) return;
    setBusy("download"); setMsg("");
    try {
      const f = await make();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMsg("Saved " + f.name + ".");
    } catch (_) { setMsg("Couldn’t make the image. Try again."); }
    finally { setBusy(""); }
  };
  const canShareFiles = typeof navigator !== "undefined" && !!navigator.canShare;
  const shareImage = async () => {
    if (blocked) return;
    setBusy("share"); setMsg("");
    try {
      const f = await make();
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: "Quote of the week", text: shareText });
      } else {
        setMsg("This browser can’t share an image directly. Download it, then post it.");
      }
    } catch (e) { if (!(e && e.name === "AbortError")) setMsg("Couldn’t share the image. Download it instead."); }
    finally { setBusy(""); }
  };
  const copyText = async () => {
    try { await navigator.clipboard.writeText(shareText); setMsg("Copied the saying. Paste it anywhere."); }
    catch (_) { setMsg("Couldn’t copy. Select the saying on the page to copy it."); }
  };

  return (
    <div className="qcs-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} className="qcs" role="dialog" aria-modal="true" aria-labelledby="qcs-h">
        <div className="qcs-head">
          <h2 id="qcs-h" className="qcs-title">Share the quote of the week</h2>
          <button type="button" className="qcs-x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="qcs-body">
          <div className="qcs-stage" ref={stageRef}>
            {loadErr ? <p className="qcs-note" role="alert">The card’s fonts didn’t load, so it can’t be drawn properly. Check your connection and open Share again.</p>
              : !ready ? <div className="qcs-wait" style={{ height: Math.round(k.h * scale) + "px" }} aria-busy="true">Preparing the card…</div>
              : (
                <div className="qcs-frame" role="img" aria-label={qcAlt(data)} style={{ width: Math.round(k.w * scale) + "px", height: Math.round(k.h * scale) + "px" }}>
                  <div className="qcs-scale" style={{ transform: "scale(" + scale + ")" }}>
                    <QcCard kind={kind} data={data} palette={palette} cardRef={cardRef}/>
                  </div>
                </div>
              )}
          </div>

          <div className="qcs-side">
            <div className="qcs-group" role="radiogroup" aria-label="Size">
              <span className="qcs-k">Size</span>
              <div className="qcs-seg">
                {QC_KINDS.map(x => (
                  <button key={x.id} type="button" role="radio" aria-checked={kind === x.id} className={"qcs-opt" + (kind === x.id ? " is-on" : "")} onClick={() => pickKind(x.id)}>
                    <b>{x.label}</b><span>{x.use}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="qcs-group" role="radiogroup" aria-label="Colours">
              <span className="qcs-k">Colours</span>
              <div className="qcs-swatches">
                {QC_PALETTE_NAMES.map(name => {
                  const p = QC_PALETTES[name];
                  return (
                    <button key={name} type="button" role="radio" aria-checked={palette === name} aria-label={name} title={name}
                            className={"qcs-swatch" + (palette === name ? " is-on" : "")} onClick={() => pickPalette(name)}>
                      {/* The swatch IS the palette — data, so inline. */}
                      <span style={{ background: p.bg }}/><span style={{ background: p.a1 }}/><span style={{ background: p.a2 }}/>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="qcs-check"><input type="checkbox" checked={double} onChange={e => setDouble(e.target.checked)}/> Double size ({k.w * 2} × {k.h * 2})</label>

            {blocked && <p className="qcs-note" role="alert">{blocked}</p>}
            <div className="qcs-actions">
              {canShareFiles && <button type="button" className="qcs-btn is-primary" disabled={!ready || !!blocked || !!busy} onClick={shareImage}>{busy === "share" ? "Preparing…" : "Share image"}</button>}
              <button type="button" className={"qcs-btn" + (canShareFiles ? "" : " is-primary")} disabled={!ready || !!blocked || !!busy} onClick={download}>{busy === "download" ? "Preparing…" : "Download PNG"}</button>
              <button type="button" className="qcs-btn" onClick={copyText}>Copy the text</button>
            </div>
            <p className="qcs-status" aria-live="polite">{msg}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
