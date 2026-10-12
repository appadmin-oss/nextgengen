/* ============================================================================
   NGG — ID Card export toolkit  (window.CardExport)

   High-standard, library-backed export. Loaded on demand by the ID Card Studio
   (/cards) so the libraries never bloat the main bundle. Everything is
   self-hosted (CSP-safe: no CDN, no eval): it lazy-loads three vendored,
   battle-tested libraries and orchestrates them.

     • html2canvas  — pixel-accurate rasterisation of the rendered card DOM
                      (fonts, gradients, images) → high-DPI PNG/JPEG.
     • fflate       — the bulk download (a real .zip, memory-lean at roster
                      scale).
     • jsPDF        — the prepress PDF.

   ── What makes the PDF print-grade ────────────────────────────────────────
   The PDF is not a browser print. It is built to what a trade printer expects
   to receive, and every choice below traces to a published standard:

   1. BLEED. Artwork extends 3 mm past every trim edge (the near-universal
      commercial default; ISO/GWG prepress guidance puts the BleedBox 3–5 mm
      outside the TrimBox). The card designs have no bleed of their own, so we
      *generate* it — the same rescue prepress tools (Enfocus PitStop, callas
      pdfToolbox, Esko's "smart bleed") apply to art supplied without one.

      We generate it by CLAMPING: every pixel of the bleed is a copy of the
      nearest pixel on the trim edge, so each edge extends its own colour
      outward and the corners extend the corner pixel. This file used to
      MIRROR instead — reflect the outer 3 mm back out — and that is wrong for
      this artwork, provably so. The volunteer front is a tier-coloured border
      22 of 590 design px wide, i.e. 2.01 mm on a 54 mm card. Mirroring 3 mm
      therefore reaches 0.99 mm past the border and reflects the white inner
      panel into the outside of the bleed: the finished sheets carried a white
      sliver around every card, and the STS badge — which straddles the top
      edge — appeared a second time above the trim. Clamping cannot reflect
      inner detail outward at all; it can only repeat the edge.

      The trade-off is patterned edges (the aso-oke weave on the card back):
      clamping smears them into 3 mm of streaks rather than repeating the
      motif. That is the safer failure. Streaks are trimmed off, and if the
      guillotine drifts they read as a continuation of the edge, where a
      mirrored motif reads as a printing error. Pass `bleedMode: 'mirror'` to
      restore the old behaviour for artwork that genuinely bleeds already.

   2. PAGE BOXES. Every page carries a MediaBox, BleedBox and TrimBox. This is
      the single most important thing an imposition RIP reads, and it is what
      the previous version of this file was missing. Single-up pages get
      TrimBox = the card and BleedBox = card + bleed. Imposed sheets are press
      sheets, so their TrimBox is the sheet itself and the individual card
      trims are carried by the crop marks and the ISO 19593-1 cutting layer.

   3. LAYERS (PDF optional content, "OCGs"). Artwork, printer marks, job slug,
      cut lines, bleed guides and the safe-area guide each sit on their own
      switchable layer, so the printer can turn the furniture off and look at
      the art alone. The technical layers are tagged per ISO 19593-1:2018
      ("Processing steps for packaging and labels") with a /GTS_Metadata
      dictionary naming the processing-step group and type — /Structural
      /Cutting for the die line, /Structural /Bleed for the bleed boundary,
      /Legend for the slug, /Dimensions for the safe area. Guide layers are
      marked non-printing via the OCG /Usage /Print state and an /AS auto-state
      in /OCProperties, so they never image even if a RIP prints all layers.

   4. MARKS. Crop marks sit in the sheet margin, aligned with every cut line,
      never inside a bleed (a mark inside the bleed prints on the finished
      card). They are drawn in registration colour — 100 % of every plate — so
      they appear on all four separations, at 0.25 pt, the Illustrator/InDesign
      default hairline. Four registration targets and a CMYK control strip
      (solids, overprints and 75/50/25 tints) let the press operator verify
      register and ink density on the sheet.

   5. DUPLEX. Back sheets are interleaved after their front sheet — emitting
      all fronts then all backs, as this did before, puts card 1's back on card
      N's front on any duplexing device. Where each back is imaged then depends
      on the axis the press turns the sheet about: long-edge (work-and-turn)
      mirrors columns and leaves the art upright; short-edge (work-and-tumble)
      mirrors rows and must ALSO turn the art 180°, because tumbling puts the
      card's head at the sheet's foot. Long-edge keeps the same gripper edge on
      both passes and registers better, so it is the default. The chosen flip
      is printed in the slug for the operator to check against the press.

   6. COLOUR. Artwork is RGB raster; the file declares the intended printing
      condition with a GTS_PDFX OutputIntent (FOGRA39 by default) so the RIP
      separates against a known target instead of guessing. We deliberately do
      *not* stamp /GTS_PDFXVersion: without an embedded ICC profile the file is
      not a conformant PDF/X, and claiming conformance a preflight check would
      reject is worse than not claiming it.

   Public API (all async unless noted): nodeToImage, addBleed, renderFace,
   scaleForDpi, zipStore, buildImpositionPDF, download.
   ========================================================================== */
(function (root) {
  'use strict';
  var MM = 72 / 25.4;

  /* ── Network hygiene ──────────────────────────────────────────────────────
   * Every remote read in this file is bounded. An export that walks hundreds
   * of cards touches hundreds of URLs; one socket that opens and never answers
   * used to hang the whole run with no way out but a reload. Nothing here
   * waits forever, and every failure degrades to "carry on without it". */
  var SCRIPT_TIMEOUT = 20000;   // ms — a vendored script is local; 20s is generous
  var FETCH_TIMEOUT = 12000;    // ms — remote images (a photo on a slow link)
  var LOCAL_TIMEOUT = 5000;     // ms — our own assets: near-instant or not coming
  var IMAGE_TIMEOUT = 8000;     // ms — html2canvas; images are inlined by then

  function loadScript(src) {
    // The page's build-versioned URL (components.jsx nggVendorUrl), so a deploy is never served last week's copy.
    if (root.nggVendorUrl && src.charAt(0) === '/') src = root.nggVendorUrl(src);
    return new Promise(function (res, rej) {
      var have = Array.prototype.some.call(document.scripts, function (s) { return s.src && s.src.indexOf(src) !== -1; });
      if (have) return res();
      var done = false;
      var finish = function (err) { if (done) return; done = true; clearTimeout(timer); err ? rej(err) : res(); };
      var el = document.createElement('script');
      var timer = setTimeout(function () { finish(new Error('timeout ' + src)); }, SCRIPT_TIMEOUT);
      el.src = src;
      el.onload = function () { finish(); };
      el.onerror = function () { finish(new Error('load ' + src)); };
      document.head.appendChild(el);
    });
  }

  var _deps = null;
  async function ensureDeps() {
    if (_deps) return _deps;
    if (!root.html2canvas) await loadScript('/vendor/html2canvas.min.js');
    if (!(root.jspdf && root.jspdf.jsPDF)) await loadScript('/vendor/jspdf.umd.min.js');
    _deps = { html2canvas: root.html2canvas, jsPDF: root.jspdf.jsPDF };
    return _deps;
  }

  function dataUrlToBytes(dataUrl) {
    var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var bin = atob(b64), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  function blobToDataURL(blob) {
    return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(null); }; fr.readAsDataURL(blob); });
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      var timer = setTimeout(function () { rej(new Error('decode timeout')); }, IMAGE_TIMEOUT);
      im.onload = function () { clearTimeout(timer); res(im); };
      im.onerror = function () { clearTimeout(timer); rej(new Error('decode failed')); };
      im.src = src;
    });
  }

  /* One bounded fetch attempt. AbortController is what actually frees the
   * socket — a bare Promise.race leaves the request in flight and the browser's
   * six-per-host connection pool fills up, which is how a slow photo host used
   * to stall every later card in the run. */
  function fetchOnce(src, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    // No cache mode override: forcing the HTTP cache can miss or fail against
    // an entry the <img> tag already stored as a no-CORS (opaque) response,
    // which loses photos that a plain fetch would have inlined fine.
    var opts = { mode: 'cors', credentials: 'omit' };
    if (ctl) opts.signal = ctl.signal;
    return fetch(src, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.blob();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  // Cache by full URL so the shared logos aren't re-fetched for every card in a
  // bulk export (the single biggest avoidable cost), and a re-fetch of the same
  // photo is free. Cloudinary edit URLs are unique per edit, so this is safe.
  // Failures are cached as null too: one dead URL must not be retried 300 times.
  var _dataUrlCache = {}, _cacheKeys = [];
  var _failed = Object.create(null);   // urls known not to answer — flags only
  var CACHE_MAX = 60;                  // successful payloads held
  async function fetchAsDataURL(src) {
    /* A URL that has already failed is never asked again, and the negative
     * cache is NEVER evicted. This matters far more than it looks. The card
     * logos are same-origin, so when the site's own server is unreachable
     * every card pays the full fetch timeout for each of them — with a retry
     * that is 24s per logo per card, which blows the per-face budget and
     * fails the whole roster with "couldn't render… not downloading".
     * Bounding this cache by entry count made it worse, because the unique
     * per-card photos evicted the shared logos and the stall came back every
     * few cards. Negative entries are flags, so keeping them all is free. */
    if (_failed[src]) return null;
    if (_dataUrlCache[src] !== undefined) return _dataUrlCache[src];
    var out = null;
    // Same-origin card furniture either answers at once or the site is down;
    // it does not deserve the patience a photo host gets, and that grace is
    // paid once per dead URL before the negative cache takes over.
    var budget = isSameOrigin(src) ? LOCAL_TIMEOUT : FETCH_TIMEOUT;
    for (var attempt = 0; attempt < 2 && out === null; attempt++) {
      try { out = await blobToDataURL(await fetchOnce(src, budget)); }
      catch (e) {
        // Our own abort means the host is not answering; waiting the same
        // twelve seconds a second time tells us nothing new.
        if (e && e.name === 'AbortError') break;
      }
    }
    if (out === null) { _failed[src] = true; return null; }
    // Bounded, oldest-first. Photos are unique per card and a data URL runs to
    // a few hundred KB, so an unbounded payload cache quietly accumulates
    // hundreds of megabytes across a full roster.
    _dataUrlCache[src] = out;
    _cacheKeys.push(src);
    while (_cacheKeys.length > CACHE_MAX) delete _dataUrlCache[_cacheKeys.shift()];
    return out;
  }
  function clearImageCache() { _dataUrlCache = {}; _cacheKeys = []; _failed = Object.create(null); }
  /* Inline every <img> in the node as a same-origin data URI before rasterising.
   * Without this, html2canvas taints cross-origin photos (Cloudinary/external)
   * and DROPS them — the on-screen edit "reverts" (vanishes) in the export. We
   * swap src to a data URL, snapshot, then restore the originals. */
  function isSameOrigin(src) {
    return src.charAt(0) === '/' ? src.charAt(1) !== '/' : src.indexOf(location.origin + '/') === 0;
  }
  var INLINE_BUDGET = 6000;   // ms for ALL of one face's images
  var BLANK_PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  async function inlineImages(node) {
    var imgs = Array.prototype.slice.call(node.querySelectorAll('img'));
    var restore = [];
    // Whole-face deadline. Inlining is an optimisation — it stops html2canvas
    // dropping cross-origin photos — not a requirement. Past the deadline the
    // rest keep their original src and the card still renders, which beats
    // failing the card outright because an asset host is slow.
    var deadline = Date.now() + INLINE_BUDGET;
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i], src = im.getAttribute('src') || '';
      if (!src || src.indexOf('data:') === 0) continue;
      var data = (Date.now() > deadline) ? null : await fetchAsDataURL(src);
      if (data) {
        restore.push([im, src]);
        im.setAttribute('src', data);
        // Ensure the swapped image is decoded before html2canvas snapshots.
        try { if (im.decode) await im.decode(); } catch (e) {}
      } else if (isSameOrigin(src)) {
        /* Our own furniture, and it did not answer — neutralise it so
         * html2canvas does not wait out its own imageTimeout on the same dead
         * URL for every face. The original src is restored afterwards, so the
         * on-screen card is untouched; it just prints without that asset.
         *
         * ONLY same-origin. A cross-origin photo that failed to inline is a
         * very different case: html2canvas still has useCORS and will usually
         * fetch it itself, so blanking it here turns "probably fine" into a
         * guaranteed empty photo frame. Losing the subject's picture off an ID
         * card is far worse than waiting on a logo. */
        restore.push([im, src]);
        im.setAttribute('src', BLANK_PX);
      }
    }
    return function () { for (var j = 0; j < restore.length; j++) restore[j][0].setAttribute('src', restore[j][1]); };
  }

  /* Fonts must be DECODED before html2canvas snapshots, not merely requested.
   * The card sets its names in Inter 800; `font-display: swap` means an
   * undecoded face paints in the system fallback, and html2canvas photographs
   * exactly what is painted. So an export fired on a cold cache — the common
   * case, since the studio is usually the first thing an operator opens —
   * silently rasterises the wrong typeface, at the wrong widths, and nobody
   * finds out until the sheets come back from the printer.
   *
   * `document.fonts.ready` alone is not enough: it settles when *pending*
   * loads finish, and a face nothing has painted yet was never requested, so
   * it resolves immediately and proves nothing. We ask for the weights the
   * card uses by name first, then wait out the set.
   *
   * Bounded and memoised: a font server that never answers must degrade to
   * the old behaviour (fallback face) rather than hang the export, and a
   * 300-card roster pays this once. */
  var CARD_FACES = ['800 42px "Inter"', '700 20px "Inter"', '600 16px "Inter"', '500 14px "Inter"', '400 14px "Inter"'];
  var FONT_TIMEOUT = 4000;      // ms — past this, print with what we have
  var _fontsReady = null;
  function ensureFonts() {
    if (_fontsReady) return _fontsReady;
    var fonts = root.document && root.document.fonts;
    if (!fonts || typeof fonts.load !== 'function') return (_fontsReady = Promise.resolve());
    var work = Promise.all(CARD_FACES.map(function (f) {
      // Plain-ASCII sample on purpose. `load()` only resolves faces covering
      // the sample's codepoints, so probing with a glyph outside the latin
      // subset would quietly match nothing and skip the load entirely.
      return fonts.load(f, 'Ag').catch(function () {});
    })).then(function () { return fonts.ready; }).catch(function () {});
    _fontsReady = Promise.race([work, new Promise(function (r) { setTimeout(r, FONT_TIMEOUT); })]);
    return _fontsReady;
  }

  /* ── Verify the printed QR actually decodes ─────────────────────────────
   *
   * The single most expensive failure this studio can ship is a batch of
   * cards whose QR will not scan. Everything upstream can be right — the
   * token correct in the database, the SVG correct in the DOM — and the
   * printed code still be unreadable, because rasterising to a fixed DPI can
   * land module edges between pixels, JPEG can ring around the finder
   * patterns, and a bleed pass can eat the quiet zone. None of that is
   * visible by eye on screen, and all of it is discovered at the moment a
   * child is standing at a gate.
   *
   * So: decode the QR back out of the EXPORTED pixels — the same raster that
   * goes to the printer, after bleed and after JPEG — and check it says what
   * it should. This is what a barcode verifier does on a production line, and
   * it is the difference between hoping the cards scan and knowing.
   *
   * jsQR is already vendored for the scanners, which means the decoder here
   * is the exact one the kiosks use. Verifying with a different decoder than
   * the one that will read the card in the field would prove much less.
   */
  var QR_LIB = '/vendor/jsQR.min.js';
  async function ensureQrDecoder() {
    if (root.jsQR) return root.jsQR;
    try { await loadScript(QR_LIB); } catch (e) { return null; }
    return root.jsQR || null;
  }

  /* Decode whatever QR is present in a rendered face.
   * Returns { ok, text, reason }. `ok:false` with reason 'no_decoder' means we
   * could not check, which is NOT the same as a bad code — callers must not
   * report an unverifiable card as a failed one. */
  async function verifyQR(dataUrl, expected) {
    var jsQR = await ensureQrDecoder();
    if (!jsQR) return { ok: false, reason: 'no_decoder' };
    var img;
    try { img = await loadImage(dataUrl); } catch (e) { return { ok: false, reason: 'decode_failed' }; }

    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    /* Try the full face first, then progressively smaller downsamples.
     * A 350 DPI face is ~2000px wide and jsQR scans it fine, but a very large
     * raster can exceed what a phone browser will allocate — and a downsample
     * often decodes MORE reliably, because it averages out the sub-pixel
     * ringing that a hard-edged upscale introduces. Trying several is closer
     * to what a real scanner does as it moves and refocuses. */
    var scales = [1, 0.5, 0.35];
    for (var i = 0; i < scales.length; i++) {
      var w = Math.max(64, Math.round(img.width * scales[i]));
      var h = Math.max(64, Math.round(img.height * scales[i]));
      cv.width = w; cv.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      var px;
      try { px = ctx.getImageData(0, 0, w, h); } catch (e) { return { ok: false, reason: 'canvas_tainted' }; }
      var r = null;
      try { r = jsQR(px.data, w, h, { inversionAttempts: 'attemptBoth' }); } catch (e) { r = null; }
      if (r && r.data) {
        var text = String(r.data);
        if (expected == null || expected === '') return { ok: true, text: text, atScale: scales[i] };
        // The card encodes a profile URL containing the token, so a substring
        // match is the right test — an exact compare would fail on the very
        // format the cards actually print.
        var hit = text.indexOf(String(expected)) !== -1;
        return { ok: hit, text: text, atScale: scales[i], reason: hit ? '' : 'wrong_token' };
      }
    }
    return { ok: false, reason: 'unreadable' };
  }

  /* ── Quiesce the rest of the page ─────────────────────────────────────────
   * html2canvas does not clone the target element on its own: it copies the
   * WHOLE document into an offscreen iframe and waits for that iframe to reach
   * readyState 'complete'. A single <img> anywhere on the page whose host
   * accepts the connection and never answers keeps the clone at 'loading'
   * forever — and that wait is html2canvas's own, so `imageTimeout` (which
   * only bounds its per-image decode) never fires. The export hangs with no
   * error, no failed card, and nothing to retry.
   *
   * That is not hypothetical for this studio: the operator reaches it from a
   * roster full of remote passport photos, and any one of them still in flight
   * poisons every card in the run — including cards that do not use it.
   *
   * So before rasterising, point every still-loading image OUTSIDE the target
   * at a blank pixel, and restore afterwards. Images inside the target are
   * left to inlineImages(), which has real content to fetch for them; these
   * ones contribute nothing to the raster and only gate the clone. */
  function quiesceDocument(node) {
    var imgs, i, im, undo = [];
    try { imgs = Array.prototype.slice.call(document.images || []); } catch (e) { return function () {}; }
    for (i = 0; i < imgs.length; i++) {
      im = imgs[i];
      if (im.complete) continue;              // already settled, one way or the other
      if (node && node.contains && node.contains(im)) continue;
      var src = im.getAttribute('src');
      if (!src || src.indexOf('data:') === 0) continue;
      undo.push([im, src]);
      im.setAttribute('src', BLANK_PX);
    }
    // Restoring re-points the src, so the browser resumes the load it was
    // already making. Nothing on screen is lost — it just finishes later.
    return function () { for (var j = 0; j < undo.length; j++) undo[j][0].setAttribute('src', undo[j][1]); };
  }

  /* Backstop for everything the sweep above cannot reach — a stalled <iframe>,
   * a webfont the clone is still blocked on, a future html2canvas that finds a
   * new way to wait. A failed card is recoverable (the studio reports it and
   * carries on); a hung export is not. */
  var RASTER_TIMEOUT = 45000;   // ms for ONE face, generous even at 600 dpi
  function withDeadline(p, ms, what) {
    var timer;
    return Promise.race([
      p.then(function (v) { clearTimeout(timer); return v; },
             function (e) { clearTimeout(timer); throw e; }),
      new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error(what + ' timed out after ' + ms + 'ms')); }, ms); }),
    ]);
  }

  /* Rasterise a rendered card node with html2canvas. Returns a data URL (+ bytes
   * + pixel size). Images are inlined first so cross-origin photos never taint. */
  async function nodeToImage(node, o) {
    o = o || {};
    var d = await ensureDeps();
    await ensureFonts();
    var restore = await inlineImages(node);
    // html2canvas ignores object-fit and stretches every photo to its box. Hand it
    // pixels already the box's shape, so it has nothing to distort.
    var unfit = await fitImagesForRaster(node);
    var restoreAll = function () { unfit(); restore(); };
    var unquiesce = quiesceDocument(node);
    try {
      var canvas = await withDeadline(d.html2canvas(node, {
        scale: o.scale || 3,
        backgroundColor: o.bg || '#ffffff',
        useCORS: true, allowTaint: false, logging: false,
        imageTimeout: o.imageTimeout || IMAGE_TIMEOUT,
      }), o.rasterTimeout || RASTER_TIMEOUT, 'rasterise');
      var type = o.type || 'image/png', q = o.quality || 0.95;
      var dataUrl = canvas.toDataURL(type, q);
      return { dataUrl: dataUrl, bytes: dataUrlToBytes(dataUrl), wPx: canvas.width, hPx: canvas.height };
    } finally { unquiesce(); restoreAll(); }
  }

  /* Crop (cover) or letterbox (contain) every object-fit image to its box's
   * exact shape, honouring object-position, at the image's own resolution.
   * Returns a function that puts every image back. A photo is never scaled
   * on one axis more than the other. */
  async function fitImagesForRaster(node) {
    var undo = [], loads = [];
    Array.prototype.forEach.call(node.querySelectorAll('img'), function (im) {
      try {
        var cs = getComputedStyle(im), fit = cs.objectFit;
        if (fit !== 'cover' && fit !== 'contain' && fit !== 'scale-down') return;
        var bw = im.clientWidth, bh = im.clientHeight, nw = im.naturalWidth, nh = im.naturalHeight;
        if (!bw || !bh || !nw || !nh) return;
        var cover = fit === 'cover';
        var k = cover ? Math.max(bw / nw, bh / nh) : Math.min(bw / nw, bh / nh, fit === 'scale-down' ? 1 : Infinity);
        var dw = nw * k, dh = nh * k;
        var pos = String(cs.objectPosition || '50% 50%').split(/\s+/);
        var frac = function (v, free) { if (/%$/.test(v)) return parseFloat(v) / 100; if (/px$/.test(v)) return free ? parseFloat(v) / free : 0.5; return v === 'left' || v === 'top' ? 0 : v === 'right' || v === 'bottom' ? 1 : 0.5; };
        var ox = (bw - dw) * frac(pos[0] || '50%', bw - dw), oy = (bh - dh) * frac(pos[1] || '50%', bh - dh);
        // Work at the source's own pixel density, so nothing is lost.
        var s = Math.max(1, 1 / k);
        var cv = document.createElement('canvas');
        cv.width = Math.round(bw * s); cv.height = Math.round(bh * s);
        var ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        // html2canvas ignores CSS filters too (the member card's photo is greyscale): bake it in.
        var filt = cs.filter && cs.filter !== 'none' ? cs.filter : '';
        if (filt && 'filter' in ctx) ctx.filter = filt;
        ctx.drawImage(im, ox * s, oy * s, dw * s, dh * s);
        var src = im.getAttribute('src'), styleFit = im.style.objectFit, styleFilter = im.style.filter;
        im.setAttribute('src', cv.toDataURL('image/png'));
        im.style.objectFit = 'fill';
        if (filt && 'filter' in ctx) im.style.filter = 'none';
        // html2canvas draws img.currentSrc, which moves to the new pixels only once they decode.
        if (im.decode) loads.push(im.decode().catch(function () {}));
        undo.push(function () { im.setAttribute('src', src); im.style.objectFit = styleFit; im.style.filter = styleFilter; });
      } catch (e) { /* a tainted image keeps its own fit; inlineImages ran first to prevent that */ }
    });
    await Promise.all(loads);
    return function () { for (var i = undo.length - 1; i >= 0; i--) undo[i](); };
  }

  /* The html2canvas scale that lands a `cssW`-wide node on `trimW_mm` of paper
   * at `dpi`. 350 dpi is the offset default (2× a 175 lpi screen); 300 is the
   * digital-press floor. Anything above ~600 buys nothing a press can hold. */
  function scaleForDpi(cssW, trimW_mm, dpi) {
    var s = (dpi || 350) * (trimW_mm / 25.4) / cssW;
    return Math.max(1, Math.round(s * 100) / 100);
  }

  /* Generate `bleedPx` of bleed on all four sides so the art runs past trim and
   * a drifting guillotine never cuts a white sliver onto the finished card.
   * Returns the enlarged face plus the bleed actually applied (in pixels),
   * which the PDF builder needs to place the image against the BleedBox rather
   * than the TrimBox.
   *
   *   o.mode 'clamp'  (default) each bleed pixel copies the nearest trim-edge
   *                   pixel. The edge colour — whatever it is — extends
   *                   outward, and no detail from inside the card can ever
   *                   reach the bleed. This is the correct mode for art whose
   *                   outer band is a solid colour, which is every face here.
   *   o.mode 'mirror' reflect the outer band back out. Repeats motifs rather
   *                   than streaking them, but only safe when the outermost
   *                   `bleedPx` of the design is itself edge-to-edge artwork.
   *                   See the header note for why this was the wrong default. */
  async function addBleed(dataUrl, bleedPx, o) {
    o = o || {};
    var b = Math.max(0, Math.round(bleedPx || 0));
    var img = await loadImage(dataUrl);
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!b) return { dataUrl: dataUrl, wPx: w, hPx: h, bleedPx: 0 };
    b = Math.min(b, Math.floor(Math.min(w, h) / 2));   // can't reflect more than half the art
    var cv = document.createElement('canvas');
    cv.width = w + 2 * b; cv.height = h + 2 * b;
    var ctx = cv.getContext('2d');
    ctx.drawImage(img, b, b);

    if (o.mode === 'mirror') {
      // Translate to the far side of the strip, flip, draw the adjacent band —
      // a true reflection about the trim edge.
      var mirror = function (tx, ty, sx_, sy_, sw, sh, dw, dh, fx, fy) {
        ctx.save(); ctx.translate(tx, ty); ctx.scale(fx, fy);
        ctx.drawImage(img, sx_, sy_, sw, sh, 0, 0, dw, dh);
        ctx.restore();
      };
      mirror(b, b, 0, 0, w, b, w, b, 1, -1);                      // top
      mirror(b, h + 2 * b, 0, h - b, w, b, w, b, 1, -1);          // bottom
      mirror(b, b, 0, 0, b, h, b, h, -1, 1);                      // left
      mirror(w + 2 * b, b, w - b, 0, b, h, b, h, -1, 1);          // right
      mirror(b, b, 0, 0, b, b, b, b, -1, -1);                     // top-left
      mirror(w + 2 * b, b, w - b, 0, b, b, b, b, -1, -1);         // top-right
      mirror(b, h + 2 * b, 0, h - b, b, b, b, b, -1, -1);         // bottom-left
      mirror(w + 2 * b, h + 2 * b, w - b, h - b, b, b, b, b, -1, -1); // bottom-right
    } else {
      // Clamp. Nearest-neighbour so a 1-px source strip replicates exactly
      // instead of being blurred across the strip by the default bilinear
      // filter — the bleed must be the edge colour, not a gradient towards it.
      ctx.imageSmoothingEnabled = false;
      ctx.mozImageSmoothingEnabled = false;
      ctx.webkitImageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, 1, b, 0, w, b);                   // top
      ctx.drawImage(img, 0, h - 1, w, 1, b, h + b, w, b);           // bottom
      ctx.drawImage(img, 0, 0, 1, h, 0, b, b, h);                   // left
      ctx.drawImage(img, w - 1, 0, 1, h, w + b, b, b, h);           // right
      ctx.drawImage(img, 0, 0, 1, 1, 0, 0, b, b);                   // top-left
      ctx.drawImage(img, w - 1, 0, 1, 1, w + b, 0, b, b);           // top-right
      ctx.drawImage(img, 0, h - 1, 1, 1, 0, h + b, b, b);           // bottom-left
      ctx.drawImage(img, w - 1, h - 1, 1, 1, w + b, h + b, b, b);   // bottom-right
    }
    var type = o.type || 'image/jpeg', q = o.quality || 0.95;
    return { dataUrl: cv.toDataURL(type, q), wPx: cv.width, hPx: cv.height, bleedPx: b };
  }

  /* Rasterise + bleed in one call — what the studio uses per face.
   *   opts: { trimW_mm, dpi, bleed_mm, bleedMode, type, quality, bg, retries } */
  /* One face for every caller (the member card's own downloads, the studios):
   * snapDOM first — the browser's own rendering, so object-fit, letter-spacing
   * and transforms are exactly what the screen shows — and html2canvas only if
   * snapDOM cannot. Same return shape either way. */
  async function renderFace(node, opts) {
    opts = opts || {};
    var trimW = opts.trimW_mm || 54, dpi = opts.dpi || 350;
    try {
      var r = await withDeadline(snapRaster(node, { widthPx: trimW / 25.4 * dpi, bleedPx: (opts.bleed_mm == null ? 3 : opts.bleed_mm) / 25.4 * dpi, bg: opts.bg }), 20000, 'snapdom');
      var url = r.canvas.toDataURL(opts.type || 'image/jpeg', opts.quality || 0.95);
      return { dataUrl: url, wPx: r.canvas.width, hPx: r.canvas.height, bleedPx: r.bleedPx, trimWPx: r.trimWPx, trimHPx: r.trimHPx, engine: 'snapdom' };
    } catch (e) {
      return renderFaceH2c(node, opts);
    }
  }
  async function renderFaceH2c(node, opts) {
    opts = opts || {};
    var cssW = node.offsetWidth || 295;
    var scale = opts.scale || scaleForDpi(cssW, opts.trimW_mm || 54, opts.dpi || 350);
    var retries = opts.retries == null ? 1 : opts.retries;
    var img = null;
    for (var attempt = 0; ; attempt++) {
      try { img = await nodeToImage(node, { scale: scale, type: 'image/png', bg: opts.bg || '#ffffff' }); break; }
      catch (e) { if (attempt >= retries) throw e; await new Promise(function (r) { setTimeout(r, 250); }); }
    }
    var pxPerMm = img.wPx / (opts.trimW_mm || 54);
    var bled = await addBleed(img.dataUrl, (opts.bleed_mm == null ? 3 : opts.bleed_mm) * pxPerMm,
      { type: opts.type || 'image/jpeg', quality: opts.quality || 0.95, mode: opts.bleedMode || 'clamp' });
    return { dataUrl: bled.dataUrl, wPx: bled.wPx, hPx: bled.hPx, bleedPx: bled.bleedPx, trimWPx: img.wPx, trimHPx: img.hPx };
  }

  /* Bulk download: a real .zip, built with fflate.
   *
   * fflate rather than JSZip because this has to survive a full roster: a
   * thousand cards is two thousand PNGs and roughly a gigabyte, and JSZip
   * holds every entry plus its output buffer in memory at once. fflate zips
   * from a plain map and is several times quicker besides. The PNGs are
   * already deflate-compressed internally, so entries go in STORED — running
   * deflate over them again costs seconds per hundred cards and saves nothing.
   *
   * JSZip stays loaded for nothing else; ensureDeps no longer pulls it. */
  var _fflate = null;
  async function ensureZip() {
    if (_fflate) return _fflate;
    if (!root.fflate) await loadScript('/vendor/fflate.min.js');
    _fflate = root.fflate;
    return _fflate;
  }
  async function zipStore(files, onProgress) {
    var z = await ensureZip();
    var map = {};
    for (var i = 0; i < files.length; i++) {
      // Level 0 = stored. PNG/JPEG/PDF payloads are already compressed.
      map[files[i].name] = [files[i].bytes, { level: 0 }];
    }
    return await new Promise(function (res, rej) {
      z.zip(map, { level: 0 }, function (err, data) { err ? rej(err) : res(data); });
    });
  }

  /* ── Printing conditions ──────────────────────────────────────────────────
   * OutputConditionIdentifier values are the ICC registry names
   * (http://www.color.org/registry). A shop on a different target can pass its
   * own via opts.intent. */
  var INTENTS = {
    FOGRA39: { id: 'FOGRA39', info: 'Coated FOGRA39 (ISO 12647-2:2004)', cond: 'Offset, coated stock, ISO 12647-2:2004, 330% TAC' },
    FOGRA51: { id: 'FOGRA51', info: 'PSO Coated v3 (FOGRA51)', cond: 'Offset, coated stock, ISO 12647-2:2013, 300% TAC' },
    GRACOL2013: { id: 'CGATS21-2-CRPC6', info: 'GRACoL 2013 (CGATS21-2-CRPC6)', cond: 'Offset, premium coated stock, 320% TAC' },
    SWOP2013: { id: 'CGATS21-2-CRPC5', info: 'SWOP 2013 (CGATS21-2-CRPC5)', cond: 'Web offset, coated stock, 300% TAC' },
  };

  /* ── ISO 19593-1:2018 processing-step layers ──────────────────────────────
   * `group`/`type` become the /GTS_Metadata dictionary on the OCG. Only the
   * Structural group mandates a type. Layers with print:false are switched off
   * for output through the OCG /Usage dictionary and the /AS auto-state, so
   * guides can never image. */
  var LAYERS = [
    { key: 'art',   name: 'Artwork',            print: true,  view: true },
    { key: 'marks', name: 'Printer marks',      print: true,  view: true },
    { key: 'slug',  name: 'Job info',           print: true,  view: true, group: 'Legend' },
    { key: 'cut',   name: 'Cut lines',          print: false, view: true, group: 'Structural', type: 'Cutting' },
    { key: 'bleed', name: 'Bleed guide',        print: false, view: false, group: 'Structural', type: 'Bleed' },
    { key: 'safe',  name: 'Safe area',          print: false, view: false, group: 'Dimensions' },
  ];

  var SHEETS = {
    A4: [210, 297], LETTER: [215.9, 279.4], LEGAL: [215.9, 355.6],
    A3: [297, 420], SRA3: [320, 450], TABLOID: [279.4, 431.8],
  };

  function pdfEscape(s) { return String(s == null ? '' : s).replace(/([\\()])/g, '\\$1').replace(/[\r\n]+/g, ' '); }

  /* Print-ready PDF via jsPDF.
   *
   *   faces : [{ dataUrl, bleedPx, wPx }]      — front faces, bleed included
   *   opts  : {
   *     backs        : [{ … }]      matching back faces → duplex
   *     layout       : 'imposed' | 'single-up'
   *     sheet        : 'A4' | 'Letter' | 'A3' | 'SRA3' | 'Legal' | 'Tabloid'
   *     trimW_mm, trimH_mm, bleed_mm, gutter_mm, margin_mm, safe_mm
   *     marks, layers, colourBar, slug   (all boolean, default true)
   *     intent       : 'FOGRA39' | 'FOGRA51' | 'GRACOL2013' | 'SWOP2013'
   *     jobName      : string for the slug line
   *   }
   *
   * Legacy call shape — a flat array of faces with no `backs` — still works and
   * produces a single-sided imposition.
   */
  async function buildImpositionPDF(faces, opts) {
    opts = opts || {};
    var d = await ensureDeps();
    // First pass builds with layers. If the optional-content plumbing did not
    // land in the file (a jsPDF change moving /XObject off the end of the
    // resource dictionary would do it), rebuild flat rather than ship a PDF
    // whose content references a property list that isn't there.
    var out = compose(d, faces, opts, opts.layers !== false);
    if (opts.layers !== false && !hasLayers(out)) out = compose(d, faces, opts, false);
    return out;
  }

  function hasLayers(bytes) {
    // The resource dictionaries, the OCG objects and the catalog are all
    // written after the page streams and are never themselves compressed, so
    // scanning the tail is a reliable structural check.
    var start = Math.max(0, bytes.length - 4 * 1024 * 1024), probe = '';
    for (var i = start; i < bytes.length; i += 8192) {
      probe += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
    }
    return probe.indexOf('/OCProperties') !== -1 && probe.indexOf('/Properties') !== -1;
  }

  function compose(d, faces, opts, useLayers) {
    faces = faces || [];
    var backs = opts.backs || null;
    var oneUp = opts.layout === 'single-up';
    var trimW = opts.trimW_mm || 54, trimH = opts.trimH_mm || 92;
    var bleed = opts.bleed_mm == null ? 3 : Math.max(0, opts.bleed_mm);
    var safe = opts.safe_mm == null ? 3 : Math.max(0, opts.safe_mm);
    var marks = opts.marks !== false;
    var intent = INTENTS[String(opts.intent || 'FOGRA39').toUpperCase()] || INTENTS.FOGRA39;

    // Mark geometry. markGap keeps the mark clear of the bleed: a crop mark that
    // starts inside the bleed prints on the finished card.
    var markLen = 4, markGap = 1.5, markW = 0.25 / MM;          // 0.25 pt hairline in mm
    var clearance = bleed + markGap + markLen;                   // margin a mark needs
    // Reserve enough for a wrapped slug: a single-up page is only ~70mm wide,
    // so the job line that fits on one line across A4 needs two or three there.
    var slugBand = (opts.slug === false ? 0 : 7);
    var barBand = (opts.colourBar === false || oneUp) ? 0 : 9;

    var pageW, pageH, cols, rows, startX, startY, gut = 0;
    if (oneUp) {
      // +1mm of slack all round so the outermost crop mark stops short of the
      // MediaBox edge rather than sitting exactly on it, where a RIP's own
      // clip can shave it off. The slug band is mirrored as dead space at the
      // top so the card sits dead centre: a centred card lands in the same
      // place under either duplex flip, which removes a whole class of
      // front-to-back misregistration.
      cols = rows = 1;
      pageW = trimW + 2 * (clearance + 1);
      pageH = trimH + 2 * (clearance + 1 + slugBand);
      startX = clearance + 1; startY = clearance + 1 + slugBand;
    } else {
      var fmt = SHEETS[String(opts.sheet || 'A4').toUpperCase()] || SHEETS.A4;
      pageW = fmt[0]; pageH = fmt[1];
      // Gutter must be at least two bleeds wide or neighbouring cards' bleeds
      // overlap and each cut destroys the card beside it.
      var gutter = Math.max(opts.gutter_mm == null ? 2 * bleed : opts.gutter_mm, 2 * bleed);
      var margin = Math.max(opts.margin_mm == null ? 10 : opts.margin_mm, clearance);
      cols = Math.max(1, Math.floor((pageW - 2 * margin + gutter) / (trimW + gutter)));
      rows = Math.max(1, Math.floor((pageH - 2 * margin + gutter) / (trimH + gutter)));
      // Shrink the grid until the furniture (marks, control strip, slug) fits in
      // the free margin the centred grid actually leaves.
      while (cols > 1 && (pageW - (cols * trimW + (cols - 1) * gutter)) / 2 < clearance) cols--;
      while (rows > 1 && (pageH - (rows * trimH + (rows - 1) * gutter)) / 2 < clearance + Math.max(slugBand, barBand)) rows--;
      var gridW = cols * trimW + (cols - 1) * gutter, gridH = rows * trimH + (rows - 1) * gutter;
      startX = (pageW - gridW) / 2; startY = (pageH - gridH) / 2;
      gut = gutter;
    }
    var perPage = cols * rows;
    var colX = function (c) { return startX + c * (trimW + gut); };
    var rowY = function (r) { return startY + r * (trimH + gut); };

    var doc = new d.jsPDF({
      unit: 'mm', orientation: pageH >= pageW ? 'portrait' : 'landscape',
      format: [pageW, pageH], compress: true,
    });

    /* ── Optional content plumbing ──────────────────────────────────────────
     * Page content refers to a layer by resource *name* (/L0), so the OCG
     * object numbers are only needed once the resource dictionaries are
     * written. They must not be reserved any earlier: output() resets jsPDF's
     * object counter before it lays the document out, so ids taken at
     * construction time are handed out a second time to the page objects and
     * the page tree ends up pointing at layer dictionaries.                    */
    var ocgOrder = [];
    if (useLayers) {
      try {
        LAYERS.forEach(function (L) { ocgOrder.push({ id: 0, def: L }); });
        doc.internal.events.subscribe('putResources', function () {
          ocgOrder.forEach(function (o) { o.id = doc.internal.newObjectDeferred(); });
        });
        doc.internal.events.subscribe('postPutResources', function () {
          ocgOrder.forEach(function (o) {
            var L = o.def;
            doc.internal.newObjectDeferredBegin(o.id, true);
            var s = '<< /Type /OCG /Name (' + pdfEscape(L.name) + ')';
            if (L.group) {
              s += ' /GTS_Metadata << /GTS_ProcStepsGroup /' + L.group;
              if (L.type) s += ' /GTS_ProcStepsType /' + L.type;
              s += ' >>';
            }
            s += ' /Usage << /Print << /PrintState /' + (L.print ? 'ON' : 'OFF') +
                 ' /Subtype /' + (L.print ? 'Print' : 'Design') + ' >>' +
                 ' /View << /ViewState /' + (L.view ? 'ON' : 'OFF') + ' >> >> >>';
            doc.internal.out(s);
            doc.internal.out('endobj');
          });
        });
        doc.internal.events.subscribe('putCatalog', function () {
          var all = ocgOrder.map(function (o) { return o.id + ' 0 R'; }).join(' ');
          var off = ocgOrder.filter(function (o) { return !o.def.view; }).map(function (o) { return o.id + ' 0 R'; }).join(' ');
          var noPrint = ocgOrder.filter(function (o) { return !o.def.print; }).map(function (o) { return o.id + ' 0 R'; }).join(' ');
          doc.internal.out('/OCProperties << /OCGs [' + all + '] /D << /Order [' + all + ']' +
            (off ? ' /OFF [' + off + ']' : '') +
            ' /AS [ << /Event /View /Category [/View] /OCGs [' + all + '] >>' +
            ' << /Event /Print /Category [/Print] /OCGs [' + all + '] >> ]' +
            (noPrint ? ' /Intent [/View /Design]' : '') + ' >> >>');
        });
      } catch (e) { useLayers = false; ocgOrder = []; }
    }
    var layerIndex = {};
    ocgOrder.forEach(function (o, i) { layerIndex[o.def.key] = i; });
    var open = null;
    function layer(key) {
      if (!useLayers) return;
      if (open === key) return;
      if (open !== null) { doc.internal.write('EMC'); open = null; }
      if (key != null && layerIndex[key] != null) { doc.internal.write('/OC /L' + layerIndex[key] + ' BDC'); open = key; }
    }
    function endLayer() { if (useLayers && open !== null) { doc.internal.write('EMC'); open = null; } }

    /* Colour target for the OutputIntent. Declaring the printing condition is
     * what lets the RIP separate the RGB art predictably. */
    try {
      var oiRef = null;
      doc.internal.events.subscribe('postPutResources', function () {
        oiRef = doc.internal.newObject();
        doc.internal.out('<< /Type /OutputIntent /S /GTS_PDFX' +
          ' /OutputConditionIdentifier (' + pdfEscape(intent.id) + ')' +
          ' /OutputCondition (' + pdfEscape(intent.cond) + ')' +
          ' /Info (' + pdfEscape(intent.info) + ')' +
          ' /RegistryName (http://www.color.org) >>');
        doc.internal.out('endobj');
      });
      doc.internal.events.subscribe('putCatalog', function () {
        if (oiRef) doc.internal.out('/OutputIntents [' + oiRef + ' 0 R]');
      });
    } catch (e) { /* the marks and boxes still stand without the intent tag */ }

    /* ── Furniture ─────────────────────────────────────────────────────────── */
    var REG = [1, 1, 1, 1];                    // registration: 100% of every plate
    function stroke(cmyk, w) { doc.setDrawColor(cmyk[0], cmyk[1], cmyk[2], cmyk[3]); doc.setLineWidth(w); }

    /* Draw a face into a trim+bleed rect, optionally turned 180° about the
     * rect's own centre. jsPDF's addImage `rotation` argument is broken in
     * 2.5.2 — it collapses the placement matrix to the unit square — so the
     * turn is applied as an outer transform instead. addImage brackets its own
     * `q … Q`, so this composes cleanly, and rotating here rather than
     * re-rendering the bitmap keeps the JPEG free of a second generation of
     * compression loss. Coordinates in the content stream are points from the
     * bottom-left, which is why y is measured back off the page height. */
    function placeImage(face, x, y, w, h, turn) {
      if (turn) {
        var cx = (x + w / 2) * MM, cy = (pageH - (y + h / 2)) * MM;
        doc.internal.write('q', '-1 0 0 -1', (2 * cx).toFixed(4), (2 * cy).toFixed(4), 'cm');
      }
      // 'FAST' — the art is already JPEG-compressed; 'SLOW' re-encodes and is
      // dramatically slower on a full mass-print run for no visible gain.
      doc.addImage(face.bytes || face.dataUrl, 'JPEG', x, y, w, h, face.alias, face.bytes ? 'NONE' : 'FAST');
      if (turn) doc.internal.write('Q');
    }

    // Crop marks live in the sheet margin, in line with each cut, so a gang-up
    // sheet is cut by lining the guillotine up on marks at the sheet edge.
    function cropMarks() {
      stroke(REG, markW);
      var c, r, x, y;
      for (c = 0; c < cols; c++) {
        [colX(c), colX(c) + trimW].forEach(function (vx) {
          doc.line(vx, startY - bleed - markGap, vx, startY - bleed - markGap - markLen);
          var yb = rowY(rows - 1) + trimH + bleed + markGap;
          doc.line(vx, yb, vx, yb + markLen);
        });
      }
      for (r = 0; r < rows; r++) {
        [rowY(r), rowY(r) + trimH].forEach(function (hy) {
          doc.line(startX - bleed - markGap, hy, startX - bleed - markGap - markLen, hy);
          var xr = colX(cols - 1) + trimW + bleed + markGap;
          doc.line(xr, hy, xr + markLen, hy);
        });
      }
    }
    function regTarget(cx, cy) {
      stroke(REG, 0.15);
      doc.circle(cx, cy, 1.9, 'S');
      doc.line(cx - 3.2, cy, cx + 3.2, cy);
      doc.line(cx, cy - 3.2, cx, cy + 3.2);
    }
    // Control strip: solids, two-colour overprints, the three-colour overprint,
    // K tints and paper. The operator reads ink density and trap off this.
    var BAR = [
      [0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1],
      [1, 1, 0, 0], [1, 0, 1, 0], [0, 1, 1, 0], [1, 1, 1, 0], [1, 1, 1, 1],
      [0, 0, 0, 0.75], [0, 0, 0, 0.5], [0, 0, 0, 0.25],
      [0.75, 0, 0, 0], [0, 0.75, 0, 0], [0, 0, 0.75, 0],
    ];
    function colourBar(y) {
      var pw = Math.min(5, (pageW - 2 * 8) / BAR.length), ph = 4;
      var x0 = (pageW - pw * BAR.length) / 2;
      doc.setLineWidth(0.1);
      for (var i = 0; i < BAR.length; i++) {
        var p = BAR[i];
        doc.setFillColor(p[0], p[1], p[2], p[3]);
        doc.setDrawColor(0, 0, 0, 1);
        doc.rect(x0 + i * pw, y, pw, ph, i === 0 ? 'FD' : 'F');
      }
    }
    /* Draw the job slug, wrapped and shrunk to fit the sheet. Sized off the
     * real text metrics rather than a guess: the same line that sits happily
     * across A4 runs off both edges of a single-up page. Bottom-aligned to
     * `bandBottom` so the block grows upward into the reserved band. */
    function drawSlug(text, bandBottom) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0, 1);
      var width = pageW - 8, lines = null, size = 5.5;
      var sizes = [5.5, 5, 4.5, 4];
      for (var i = 0; i < sizes.length; i++) {
        size = sizes[i];
        doc.setFontSize(size);
        lines = doc.splitTextToSize(text, width);
        if (lines.length <= 3) break;
      }
      doc.setFontSize(size);
      var lh = size / MM * 1.25;                     // line height in mm
      var top = bandBottom - (lines.length - 1) * lh;
      for (var j = 0; j < lines.length; j++) {
        doc.text(lines[j], pageW / 2, top + j * lh, { align: 'center', baseline: 'middle' });
      }
    }
    function guideRect(x, y, w, h, cmyk, dash) {
      stroke(cmyk, 0.1);
      if (dash && doc.setLineDashPattern) doc.setLineDashPattern([0.8, 0.8], 0);
      doc.rect(x, y, w, h, 'S');
      if (dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
    }

    /* ── Sheet assembly ────────────────────────────────────────────────────── */
    /* ── Duplex: putting each back on its own front ────────────────────────
     * The press turns the sheet between sides, and which axis it turns about
     * decides where a back has to be imaged.
     *
     *   long-edge  (work-and-turn)  — sheet flips about the VERTICAL axis, so
     *     the material at column c reappears at column cols-1-c. The card's
     *     "up" still points at the sheet's head, so the art stays upright.
     *     Same gripper edge both passes, which is why this registers best and
     *     is the default.
     *
     *   short-edge (work-and-tumble) — sheet flips about the HORIZONTAL axis:
     *     column stays, row becomes rows-1-r, and the card's "up" now points
     *     at the sheet's foot, so the back art must ALSO be turned 180° or it
     *     prints upside-down on the card. (Equivalently: take the long-edge
     *     back sheet and rotate the whole page 180°.) Gripper edge changes
     *     between passes, so register is looser.
     *
     *   none — fronts and backs aligned by hand, or a card printer that
     *     handles its own flip. No mirroring, no rotation.
     */
    var duplex = backs ? String(opts.duplex || 'long-edge').toLowerCase() : 'none';
    var flipRows = duplex === 'short-edge';
    var sheets = [];                        // [{ items:[{face,col,row,rot}], side }]
    var nSheets = Math.max(1, Math.ceil(faces.length / perPage));
    for (var s = 0; s < nSheets; s++) {
      var front = [], back = [];
      for (var idx = 0; idx < perPage; idx++) {
        var ci = s * perPage + idx;
        if (ci >= faces.length) break;
        var col = idx % cols, row = Math.floor(idx / cols);
        front.push({ face: faces[ci], col: col, row: row, rot: false, n: ci + 1 });
        if (backs && backs[ci]) {
          back.push({
            face: backs[ci], n: ci + 1,
            col: duplex === 'long-edge' ? cols - 1 - col : col,
            row: flipRows ? rows - 1 - row : row,
            rot: flipRows,
          });
        }
      }
      sheets.push({ items: front, side: 'front', sheet: s + 1 });
      if (backs) sheets.push({ items: back, side: 'back', sheet: s + 1 });
    }

    var job = opts.jobName || 'NGG ID cards';
    var stamp = opts.date || '';
    for (var pg = 0; pg < sheets.length; pg++) {
      if (pg > 0) doc.addPage([pageW, pageH], pageH >= pageW ? 'portrait' : 'landscape');
      var sh = sheets[pg];

      layer('art');
      for (var i = 0; i < sh.items.length; i++) {
        var it = sh.items[i], x = colX(it.col), y = rowY(it.row);
        // Place against the bleed box: the art is trim + 2×bleed and hangs
        // `bleed` outside the trim on every side.
        var fb = it.face.bleedPx && it.face.trimWPx ? bleed : 0;
        var w = trimW + 2 * fb, h = trimH + 2 * fb;
        placeImage(it.face, x - fb, y - fb, w, h, it.rot);
      }

      if (marks) {
        layer('marks');
        cropMarks();
        // Registration targets need REG_R of clear paper each way. A target
        // only goes down where the band outside the bleed can hold one whole —
        // on a tight single-up page there is no such band, and crop marks alone
        // are the convention there.
        var REG_R = 3.4;
        var topBand = startY - bleed, leftBand = startX - bleed;
        var botBand = rowY(rows - 1) + trimH + bleed, rightBand = colX(cols - 1) + trimW + bleed;
        if (topBand >= 2 * REG_R) regTarget(pageW / 2, topBand / 2);
        if (leftBand >= 2 * REG_R) regTarget(leftBand / 2, pageH / 2);
        if (pageW - rightBand >= 2 * REG_R) regTarget((rightBand + pageW) / 2, pageH / 2);
        // The bottom band stacks: crop marks, control strip, registration
        // target, slug — each only if what is left still clears the slug.
        var cur = botBand + markGap + markLen + 1;
        if (barBand && cur + 4 + slugBand <= pageH) { colourBar(cur); cur += 5.5; }
        if (cur + 2 * REG_R + slugBand <= pageH) regTarget(pageW / 2, cur + REG_R);
      }

      // Guides exist only as switchable, non-printing layers. Without optional
      // content there is nothing to switch them off with, so in the flat
      // fallback they are omitted rather than imaged onto the card.
      if (useLayers) {
        var placed = function (c, r) { return sh.items.some(function (q) { return q.col === c && q.row === r; }); };
        layer('cut');
        for (var c2 = 0; c2 < cols; c2++) for (var r2 = 0; r2 < rows; r2++) {
          if (placed(c2, r2)) guideRect(colX(c2), rowY(r2), trimW, trimH, REG, false);
        }
        if (bleed) {
          layer('bleed');
          for (var c3 = 0; c3 < cols; c3++) for (var r3 = 0; r3 < rows; r3++) {
            if (placed(c3, r3)) guideRect(colX(c3) - bleed, rowY(r3) - bleed, trimW + 2 * bleed, trimH + 2 * bleed, [1, 0, 0, 0], true);
          }
        }
        if (safe && trimW > 2 * safe && trimH > 2 * safe) {
          layer('safe');
          for (var c4 = 0; c4 < cols; c4++) for (var r4 = 0; r4 < rows; r4++) {
            if (placed(c4, r4)) guideRect(colX(c4) + safe, rowY(r4) + safe, trimW - 2 * safe, trimH - 2 * safe, [0, 1, 0, 0], true);
          }
        }
      }

      if (slugBand) {
        layer('slug');
        drawSlug(job + ' · ' + (oneUp ? 'card ' : 'sheet ') + sh.sheet + '/' + nSheets + ' ' + sh.side.toUpperCase() +
          ' · ' + trimW + '\u00D7' + trimH + ' mm trim · ' + bleed + ' mm bleed · ' +
          (oneUp ? '1-up' : cols + '\u00D7' + rows + '-up') +
          // The flip axis is the one setting that silently ruins a whole run,
          // so it is printed on the sheet for the operator to check against how
          // their press is actually set up.
          (backs ? ' · duplex: ' + (duplex === 'none' ? 'NO flip (align by hand)'
            : duplex === 'short-edge' ? 'SHORT-edge flip (work-and-tumble)'
            : 'LONG-edge flip (work-and-turn)') : '') +
          ' · ' + intent.id + (stamp ? ' · ' + stamp : ''), pageH - 2);
      }
      endLayer();

      // Page boxes. A single-up page IS the card, so its TrimBox is the card and
      // its BleedBox the card plus bleed. An imposed sheet is a press sheet: the
      // sheet is what gets trimmed, and each card's trim is carried by the crop
      // marks and the ISO 19593-1 cutting layer.
      var info = doc.internal.getPageInfo(pg + 1);
      if (info && info.pageContext) {
        var box = function (x0, y0, x1, y1) {
          return { bottomLeftX: x0 * MM, bottomLeftY: (pageH - y1) * MM, topRightX: x1 * MM, topRightY: (pageH - y0) * MM };
        };
        info.pageContext.mediaBox = box(0, 0, pageW, pageH);
        if (oneUp) {
          info.pageContext.trimBox = box(startX, startY, startX + trimW, startY + trimH);
          info.pageContext.bleedBox = box(startX - bleed, startY - bleed, startX + trimW + bleed, startY + trimH + bleed);
        } else {
          info.pageContext.trimBox = box(0, 0, pageW, pageH);
          info.pageContext.bleedBox = box(0, 0, pageW, pageH);
        }
      }
    }

    /* Expose the layers to the page resources. /XObject is the last entry
     * jsPDF writes into the resource dictionary, so closing it here and opening
     * /Properties appends a sibling key that jsPDF's own ">>" then closes.
     * This has to be the *last* putXobjectDict subscriber, or it would close
     * /XObject before the addImage plugin has written the images into it —
     * hence subscribing here rather than up with the other layer hooks.
     * The result is checked structurally after output(). */
    if (useLayers) {
      try {
        doc.internal.events.subscribe('putXobjectDict', function () {
          doc.internal.out('>> /Properties <<');
          ocgOrder.forEach(function (o, i) { doc.internal.out('/L' + i + ' ' + o.id + ' 0 R'); });
        });
      } catch (e) { /* the structural check downstream catches this */ }
    }

    doc.setProperties({
      title: job + ' — print-ready',
      subject: trimW + '\u00D7' + trimH + ' mm trim, ' + bleed + ' mm bleed, ' + intent.info,
      keywords: 'prepress, ' + (oneUp ? 'single-up' : 'imposed') + ', bleed, crop marks, ' + intent.id,
      creator: 'NGG Card Studio',
    });
    return new Uint8Array(doc.output('arraybuffer'));
  }

  /* Robust "smart download" via a Blob + object URL (works for large files). */
  function download(bytes, filename, mime) {
    var blob = (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) ? new Blob([bytes], { type: mime }) : bytes;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }

  /* ── The face renderer: snapDOM ────────────────────────────────────────
   * html2canvas re-implements CSS in JavaScript and copies the WHOLE document
   * for every capture, and its text is an approximation: letter-spaced
   * capitals collapse ("VOLUNTEER" squashed into its own width), pills
   * overflow, IDs lose their hyphens. snapDOM renders the node through the
   * browser's own layout engine (an SVG <foreignObject>, fonts embedded), so
   * the face prints exactly as the screen draws it, rasterised straight at the
   * target size — text and QR modules land on device pixels, never upscaled.
   *
   * Chosen by measurement, not reputation: every card type, front and back,
   * rendered at 300 dpi and diffed against Chromium's own screenshot of the
   * same element. snapDOM 0.0% of pixels off at 16–40 ms a face; the next best
   * library 1.3–2.3% off; html2canvas 4.7–6.2% off at 270–850 ms.
   * (vendor-build.js pins it; the numbers are in docs/HANDOFF.md.)
   *
   * Any failure (a browser that refuses, a resource that taints the canvas)
   * throws, and renderFaceFast falls back to html2canvas for that one face, so
   * the faster engine never costs a card. */
  var SNAPDOM_LIB = '/vendor/snapdom.js';
  async function ensureSnapdom() {
    if (!root.snapdom) await loadScript(SNAPDOM_LIB);
    if (!root.snapdom) throw new Error('snapdom_unavailable');
    return root.snapdom;
  }
  async function snapRaster(node, o) {
    var sd = await ensureSnapdom();
    var w = node.offsetWidth, h = node.offsetHeight;
    if (!w || !h) throw new Error('empty_node');
    var W = Math.round(o.widthPx), H = Math.round(W * h / w), b = Math.max(0, Math.round(o.bleedPx || 0));
    var art = await sd.toCanvas(node, { width: W, height: H, dpr: 1, embedFonts: true, backgroundColor: o.bg || '#ffffff' });
    var cv = document.createElement('canvas');
    cv.width = W + 2 * b; cv.height = H + 2 * b;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = o.bg || '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(art, b, b, W, H);
    clampBleed(ctx, cv, W, H, b);
    ctx.getImageData(0, 0, 1, 1);   // throws now on a tainted canvas, so the caller falls back
    return { canvas: cv, trimWPx: W, trimHPx: H, bleedPx: b };
  }

  /* One face, ready for a PDF or a ZIP: snapDOM, else html2canvas.
   * o: { trimW_mm, dpi, bleed_mm, type, quality } → { bytes, wPx, hPx, bleedPx, trimWPx, trimHPx, canvas, engine } */
  async function renderFaceFast(node, o) {
    o = o || {};
    var trimW = o.trimW_mm || 54, dpi = o.dpi || 300;
    var widthPx = trimW / 25.4 * dpi, bleedPx = (o.bleed_mm || 0) / 25.4 * dpi;
    var r, engine = 'snapdom', why = '';
    try { r = await withDeadline(snapRaster(node, { widthPx: widthPx, bleedPx: bleedPx }), 20000, 'snapdom'); }
    catch (e) {
      engine = 'html2canvas'; why = String(e && e.message || e);
      var f = await renderFaceH2c(node, { trimW_mm: trimW, dpi: dpi, bleed_mm: o.bleed_mm || 0, type: 'image/png' });
      var im = await loadImage(f.dataUrl), cv = document.createElement('canvas');
      cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0);
      r = { canvas: cv, trimWPx: f.trimWPx, trimHPx: f.trimHPx, bleedPx: f.bleedPx };
    }
    var type = o.type || 'image/jpeg';
    var blob = await new Promise(function (res, rej) { r.canvas.toBlob(function (b) { b ? res(b) : rej(new Error('encode_failed')); }, type, o.quality || 0.95); });
    var bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes: bytes, type: type, wPx: r.canvas.width, hPx: r.canvas.height, bleedPx: r.bleedPx, trimWPx: r.trimWPx, trimHPx: r.trimHPx, canvas: r.canvas, engine: engine, fallbackWhy: why };
  }
  /* A face that is already an image (a Design Studio template drawn by
   * Fabric at the target dpi): sized to the trim and given the same clamped
   * bleed, without going through the DOM at all. */
  async function imageFace(src, o) {
    var im = await loadImage(src);
    var dpi = o.dpi || 300, W = Math.round((o.trimW_mm || 54) / 25.4 * dpi), H = Math.round((o.trimH_mm || 85.6) / 25.4 * dpi);
    var b = Math.max(0, Math.round((o.bleed_mm || 0) / 25.4 * dpi));
    var cv = document.createElement('canvas');
    cv.width = W + 2 * b; cv.height = H + 2 * b;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingQuality = 'high';
    // Never stretched: fit the art inside the trim at its own aspect, centred.
    var k = Math.min(W / im.width, H / im.height), dw = im.width * k, dh = im.height * k;
    ctx.drawImage(im, b + (W - dw) / 2, b + (H - dh) / 2, dw, dh);
    clampBleed(ctx, cv, W, H, b);
    var type = o.type || 'image/jpeg';
    var blob = await new Promise(function (res, rej) { cv.toBlob(function (bl) { bl ? res(bl) : rej(new Error('encode_failed')); }, type, o.quality || 0.95); });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: type, wPx: cv.width, hPx: cv.height, bleedPx: b, trimWPx: W, trimHPx: H, canvas: cv, engine: 'image' };
  }
  function clampBleed(ctx, cv, W, H, b) {
    if (!b) return;
    // Every bleed pixel copies the nearest trim-edge pixel (see addBleed).
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, b, b, 1, H, 0, b, b, H);
    ctx.drawImage(cv, b + W - 1, b, 1, H, b + W, b, b, H);
    ctx.drawImage(cv, 0, b, W + 2 * b, 1, 0, 0, W + 2 * b, b);
    ctx.drawImage(cv, 0, b + H - 1, W + 2 * b, 1, 0, b + H, W + 2 * b, b);
    ctx.imageSmoothingEnabled = true;
  }

  /* QR read-back straight from a canvas — no PNG round trip. */
  async function verifyQRCanvas(cv, expected) {
    var jsQR = await ensureQrDecoder();
    if (!jsQR) return { ok: false, reason: 'no_decoder' };
    var scales = [0.5, 1, 0.35], t = document.createElement('canvas'), ctx = t.getContext('2d', { willReadFrequently: true });
    for (var i = 0; i < scales.length; i++) {
      var w = Math.max(64, Math.round(cv.width * scales[i])), h = Math.max(64, Math.round(cv.height * scales[i]));
      t.width = w; t.height = h; ctx.drawImage(cv, 0, 0, w, h);
      var r = null;
      try { r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); } catch (e) { r = null; }
      if (r && r.data) {
        var text = String(r.data);
        if (expected == null || expected === '') return { ok: true, text: text };
        var hit = text.indexOf(String(expected)) !== -1;
        return { ok: hit, text: text, reason: hit ? '' : 'wrong_token' };
      }
    }
    return { ok: false, reason: 'unreadable' };
  }

  /* ── The studio's own sheet, as a PDF ─────────────────────────────────────
   * Print used to hand the page to the browser's print dialog, which brought
   * the site's print stylesheet with it, re-laid the page out, and printed
   * whatever scaling the dialog defaulted to. This writes the sheet the
   * studio drew — every slot at its millimetre position, backs where the flip
   * puts them, the cut marks, the packing list — straight into a PDF.
   *
   *   spec = {
   *     pageW, pageH,                       mm
   *     title,                              document title
   *     packing: { title, sub, head:[…], rows:[[…]] } | null,
   *     pages: [{ items:[{ face, x, y, w, h, rot, clip:{x,y,w,h} }],
   *               marks:[{ x, y, w, h }], proof, label, test:[{x,y,w,h,n}] }],
   *   }
   * A face is { bytes|dataUrl, alias, bleedMm }: the art is trim + 2×bleed,
   * hung `bleedMm` outside the slot and clipped to `clip`, so a face rendered
   * once with full bleed serves every sheet, whatever its gap. */
  async function buildSheetPDF(spec) {
    var d = await ensureDeps();
    var W = spec.pageW, H = spec.pageH;
    var doc = new d.jsPDF({ unit: 'mm', orientation: H >= W ? 'portrait' : 'landscape', format: [W, H], compress: true });
    var first = true;
    var newPage = function () { if (!first) doc.addPage([W, H], H >= W ? 'portrait' : 'landscape'); first = false; };

    if (spec.packing) {
      var P = spec.packing, colW = P.widths || [];
      var x0 = 14, y = 0, lh = 6.2, total = colW.reduce(function (a, b) { return a + b; }, 0);
      var scale = (W - 2 * x0) / (total || 1);
      var head = function () {
        newPage(); y = 18;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(0, 0, 0);
        doc.text(P.title, x0, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
        doc.text(P.sub, x0, y); y += 8;
        doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold');
        var cx = x0;
        P.head.forEach(function (h, i) { doc.text(String(h), cx + 1, y); cx += colW[i] * scale; });
        y += 2; doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(x0, y, W - x0, y); y += lh - 1.5;
        doc.setFont('helvetica', 'normal');
      };
      head();
      P.rows.forEach(function (r) {
        if (y > H - 14) head();
        var cx = x0;
        r.forEach(function (c, i) {
          var t = doc.splitTextToSize(String(c == null ? '' : c), colW[i] * scale - 2)[0] || '';
          doc.text(t, cx + 1, y); cx += colW[i] * scale;
        });
        doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2); doc.line(x0, y + 2, W - x0, y + 2);
        if (P.tick) { doc.setDrawColor(0, 0, 0); doc.rect(W - x0 - 5, y - 3.2, 3.6, 3.6, 'S'); }
        y += lh;
      });
    }

    var gs = null;
    try { gs = new doc.GState({ opacity: 0.45 }); } catch (e) { gs = null; }
    spec.pages.forEach(function (pg) {
      newPage();
      pg.items.forEach(function (it) {
        var f = it.face, b = f.bleedMm || 0;
        doc.saveGraphicsState();
        var c = it.clip || { x: it.x, y: it.y, w: it.w, h: it.h };
        doc.rect(c.x, c.y, c.w, c.h, null); doc.clip(); doc.discardPath();
        var x = it.x - b, y2 = it.y - b, w = it.w + 2 * b, h = it.h + 2 * b;
        if (it.rot) {
          var cx2 = (x + w / 2) * MM, cy2 = (H - (y2 + h / 2)) * MM;
          doc.internal.write('q', '-1 0 0 -1', (2 * cx2).toFixed(4), (2 * cy2).toFixed(4), 'cm');
        }
        doc.addImage(f.bytes || f.dataUrl, 'JPEG', x, y2, w, h, f.alias, 'NONE');
        if (it.rot) doc.internal.write('Q');
        doc.restoreGraphicsState();
        if (pg.proof) {
          if (gs) { doc.saveGraphicsState(); doc.setGState(gs); }
          doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(200, 0, 0);
          doc.text('PROOF', it.x + it.w / 2, it.y + it.h / 2, { align: 'center', baseline: 'middle', angle: 30 });
          if (gs) doc.restoreGraphicsState();
        }
      });
      (pg.test || []).forEach(function (t) {
        doc.setDrawColor(11, 11, 12); doc.setLineWidth(0.2); doc.rect(t.x, t.y, t.w, t.h, 'S');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
        doc.text(String(t.n), t.x + t.w / 2, t.y + t.h / 2, { align: 'center', baseline: 'middle' });
      });
      if (pg.marks && pg.marks.length) {
        doc.setFillColor(0, 0, 0);
        pg.marks.forEach(function (m) { doc.rect(m.x, m.y, m.w, m.h, 'F'); });
      }
      if (pg.label) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(110, 110, 110);
        doc.text(pg.label, W / 2, H - 3, { align: 'center', baseline: 'bottom' });
      }
    });
    doc.setProperties({ title: spec.title || 'ID cards', creator: 'NGG ID Card Studio' });
    return new Uint8Array(doc.output('arraybuffer'));
  }

  root.CardExport = {
    ensureDeps: ensureDeps, ensureZip: ensureZip, ensureFonts: ensureFonts,
    nodeToImage: nodeToImage, addBleed: addBleed, verifyQR: verifyQR,
    renderFace: renderFace, scaleForDpi: scaleForDpi, zipStore: zipStore,
    buildImpositionPDF: buildImpositionPDF, download: download, dataUrlToBytes: dataUrlToBytes,
    clearImageCache: clearImageCache, ensureSnapdom: ensureSnapdom, renderFaceFast: renderFaceFast, verifyQRCanvas: verifyQRCanvas, buildSheetPDF: buildSheetPDF, imageFace: imageFace, renderFaceH2c: renderFaceH2c, fitImagesForRaster: fitImagesForRaster,
    INTENTS: INTENTS, LAYERS: LAYERS, SHEETS: SHEETS, MM: MM,
  };
})(typeof window !== 'undefined' ? window : this);
