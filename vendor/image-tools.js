/* ============================================================================
   NGG — local image toolkit  (window.ImageTools)

   Everything here runs in the browser. No Cloudinary, no upload, no round
   trip: decode → resample → adjust → crop → encode, all on the device. Loaded
   on demand (never in the main bundle) and self-hosted like the rest of
   /vendor — no CDN.

     • pica       — Lanczos resampling with an unsharp pass, in a worker.
                    The reason downscaling here does not turn a phone photo
                    into mush: one big `drawImage` step uses a cheap box-ish
                    filter and aliases badly, which shows up as fringing on
                    hair and text at print resolution.
     • Cropper.js — the crop / straighten / flip surface.

   ── Why this exists ──────────────────────────────────────────────────────
   Uploads sent the raw camera file. A modern phone photo is 3–12 MB, so on a
   mobile connection the upload took minutes, and the very first thing the
   server did was hand it to Cloudinary to be shrunk to 1600px anyway. Every
   one of those megabytes was thrown away after being paid for twice — once in
   the visitor's data, once in their time. Resampling before the upload cuts a
   typical 8 MB photo to roughly 300 KB: the same delivered pixels, a fraction
   of the wait.

   The editing side matters for the same reason the export does: the ID card
   is print artwork. Doing the geometry locally at full source resolution and
   uploading the finished frame means the card is cut from the pixels an
   operator actually chose, rather than from a server-side guess at where the
   face is.

   Public API (async unless noted):
     prepare(file, opts)      → { blob, width, height, before, after, skipped }
     decode(fileOrUrl)        → { source, width, height }   (EXIF-oriented)
     resample(src, w, h)      → canvas
     adjust(canvas, spec)     → canvas   (brightness / contrast / sharpen)
     toBlob(canvas, type, q)  → Blob
     openCropper(img, opts)   → Cropper instance
     ensurePica / ensureCropper
   ========================================================================== */
(function (root) {
  'use strict';

  var LOAD_TIMEOUT = 20000;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var have = Array.prototype.some.call(document.scripts, function (s) { return s.src && s.src.indexOf(src) !== -1; });
      if (have) return res();
      var done = false, el = document.createElement('script');
      var finish = function (e) { if (done) return; done = true; clearTimeout(t); e ? rej(e) : res(); };
      var t = setTimeout(function () { finish(new Error('timeout ' + src)); }, LOAD_TIMEOUT);
      el.src = src;
      el.onload = function () { finish(); };
      el.onerror = function () { finish(new Error('load ' + src)); };
      document.head.appendChild(el);
    });
  }
  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  /* pica spins its worker pool off a blob URL. A CSP without `worker-src`
   * falls back to default-src and blocks that, so the worker path is tried
   * first and quietly dropped to main-thread resampling if it is refused —
   * slower on a big photo, but it always produces the same pixels. */
  var _pica = null;
  async function ensurePica() {
    if (_pica) return _pica;
    if (!root.pica) await loadScript('/vendor/pica.min.js');
    try {
      _pica = root.pica({ features: ['js', 'wasm', 'ww'] });
      await _pica.resize(tinyCanvas(4, 4), tinyCanvas(2, 2));   // prove the pool works
    } catch (e) {
      _pica = root.pica({ features: ['js', 'wasm'] });
    }
    return _pica;
  }
  function tinyCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').fillRect(0, 0, w, h);
    return c;
  }

  var _cropper = null;
  async function ensureCropper() {
    if (_cropper) return _cropper;
    loadCss('/vendor/cropper.min.css');
    if (!root.Cropper) await loadScript('/vendor/cropper.min.js');
    _cropper = root.Cropper;
    return _cropper;
  }

  /* Decode to something drawable, with EXIF orientation applied. A phone
   * portrait is very often stored landscape plus an orientation tag; ignoring
   * it is how a headshot ends up sideways on the card. createImageBitmap is
   * asked explicitly; the <img> fallback gets it right by default in current
   * browsers. */
  async function decode(input) {
    var isBlob = typeof Blob !== 'undefined' && input instanceof Blob;
    if (isBlob && typeof createImageBitmap === 'function') {
      try {
        var bmp = await createImageBitmap(input, { imageOrientation: 'from-image' });
        return { source: bmp, width: bmp.width, height: bmp.height };
      } catch (e) { /* Safari and older Firefox: fall through to the <img> path */ }
    }
    var url = isBlob ? URL.createObjectURL(input) : input;
    try {
      var im = await new Promise(function (res, rej) {
        var i = new Image();
        if (!isBlob) i.crossOrigin = 'anonymous';
        i.onload = function () { res(i); };
        i.onerror = function () { rej(new Error('decode_failed')); };
        i.src = url;
      });
      return { source: im, width: im.naturalWidth, height: im.naturalHeight };
    } finally { if (isBlob) setTimeout(function () { URL.revokeObjectURL(url); }, 0); }
  }

  function canvasOf(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function toBlob(canvas, type, q) {
    return new Promise(function (res) { canvas.toBlob(res, type || 'image/jpeg', q == null ? 0.85 : q); });
  }

  /* Resample `source` into a w×h canvas. pica does the filtering; the plain
   * drawImage path is only a fallback for when pica cannot load at all. */
  async function resample(source, w, h) {
    var out = canvasOf(w, h);
    var src = source;
    if (!(src instanceof HTMLCanvasElement)) {
      var tmp = canvasOf(source.width || source.naturalWidth, source.height || source.naturalHeight);
      tmp.getContext('2d').drawImage(source, 0, 0);
      src = tmp;
    }
    try {
      var p = await ensurePica();
      await p.resize(src, out, { alpha: false, unsharpAmount: 55, unsharpRadius: 0.6, unsharpThreshold: 2 });
    } catch (e) {
      var ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, out.width, out.height);
    }
    return out;
  }

  /* Local tone adjustment — the Cloudinary-free equivalent of e_brightness /
   * e_sharpen. Brightness and contrast are a single pass over the pixels;
   * sharpen is a 3×3 unsharp convolution. Values are 0-centred: 0 = untouched. */
  function adjust(canvas, spec) {
    spec = spec || {};
    var b = Number(spec.brightness) || 0;      // -100..100
    var c = Number(spec.contrast) || 0;        // -100..100
    var s = Number(spec.sharpen) || 0;         // 0..100
    if (!b && !c && !s) return canvas;
    var ctx = canvas.getContext('2d');
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var d = img.data;
    if (b || c) {
      // Standard contrast factor; brightness is a straight offset in 8-bit.
      var f = (259 * (c + 255)) / (255 * (259 - c));
      var lut = new Uint8ClampedArray(256);
      for (var v = 0; v < 256; v++) lut[v] = f * (v - 128) + 128 + b * 2.55;
      for (var i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    }
    if (s) {
      var amt = s / 100;
      var w = canvas.width, h = canvas.height;
      var src = new Uint8ClampedArray(d);      // read from a copy, write in place
      for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          var o = (y * w + x) * 4;
          for (var ch = 0; ch < 3; ch++) {
            var k = o + ch;
            var lap = 5 * src[k] - src[k - 4] - src[k + 4] - src[k - w * 4] - src[k + w * 4];
            d[k] = src[k] + (lap - src[k]) * amt;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /* Formats the rest of the product will accept. Anything else HAS to be
   * re-encoded here, whatever its size — see prepare(). */
  var OK_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  function typeOk(t) { return OK_TYPES.indexOf(String(t || '').toLowerCase()) !== -1; }

  /* Shrink-and-encode for upload. Returns the original untouched when it is
   * already small enough AND already a format we accept — re-encoding an
   * already-web-sized JPEG only costs a generation of quality.
   *
   * THAT SECOND CONDITION IS NOT AN OPTIMISATION. This function used to skip on
   * size alone, and every skip handed back the ORIGINAL FILE. An iPhone set to
   * "High Efficiency" saves HEIC; a 900px HEIC headshot is comfortably under
   * both thresholds, so it skipped, went into the submission as
   * `data:image/heic;base64,…`, and the server's photo gate refused it as
   * `not_an_image`. Big photos were re-encoded to JPEG on the way past and went
   * through fine — which is exactly why the failure looked random and only hit
   * SOME photos.
   *
   * The two later escape hatches (`no_gain`, and `undecodable` above) hand back
   * the original for the same reason and needed the same condition. `reason` is
   * reported either way so the caller can refuse a format it cannot send rather
   * than posting bytes the server will reject with a generic message. */
  async function prepare(file, opts) {
    opts = opts || {};
    var maxPx = opts.maxPx || 1600;
    var quality = opts.quality == null ? 0.85 : opts.quality;
    var floorBytes = opts.floorBytes == null ? 350 * 1024 : opts.floorBytes;
    var before = file.size || 0;
    // A format we cannot send has to be converted no matter how small it is.
    var mustConvert = !typeOk(file && file.type);
    var dec;
    try { dec = await decode(file); }
    catch (e) {
      /* Nothing can be done with bytes this browser cannot decode — Chrome on
       * Android cannot read HEIC at all. Say which it is, so the caller can
       * give advice ("switch the camera to Most Compatible") instead of letting
       * the server answer "not an image" three screens later. */
      return { blob: file, width: 0, height: 0, before: before, after: before, skipped: true,
               reason: 'undecodable', type: (file && file.type) || '', typeOk: !mustConvert };
    }
    var long = Math.max(dec.width, dec.height);
    if (!mustConvert && long <= maxPx && before && before <= floorBytes) {
      return { blob: file, width: dec.width, height: dec.height, before: before, after: before,
               skipped: true, reason: 'already_small', type: file.type, typeOk: true };
    }
    var scale = Math.min(1, maxPx / long);
    var canvas = await resample(dec.source, dec.width * scale, dec.height * scale);
    if (opts.adjust) adjust(canvas, opts.adjust);
    var blob = await toBlob(canvas, 'image/jpeg', quality);
    if (dec.source.close) { try { dec.source.close(); } catch (e) {} }
    // A pathological source can encode larger than it arrived; keep the smaller
    // — but never in exchange for keeping a format we cannot send.
    if (!blob || (!mustConvert && before && blob.size >= before && long <= maxPx)) {
      if (blob && mustConvert) {
        return { blob: blob, width: canvas.width, height: canvas.height, before: before,
                 after: blob.size, skipped: false, type: 'image/jpeg', typeOk: true };
      }
      return { blob: file, width: dec.width, height: dec.height, before: before, after: before,
               skipped: true, reason: 'no_gain', type: (file && file.type) || '', typeOk: !mustConvert };
    }
    return { blob: blob, width: canvas.width, height: canvas.height, before: before, after: blob.size,
             skipped: false, type: 'image/jpeg', typeOk: true };
  }

  /* Render the crop Cropper hands back, at a chosen output size, resampled
   * properly rather than by the browser's default scaler. */
  async function renderCrop(cropper, outW, outH, spec) {
    var raw = cropper.getCroppedCanvas({
      // Ask for generous source pixels, then resample down — cropping at the
      // target size directly would let the browser do the filtering.
      maxWidth: 4096, maxHeight: 4096,
      imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
      fillColor: '#ffffff',
    });
    if (!raw) return null;
    var out = (raw.width === outW && raw.height === outH) ? raw : await resample(raw, outW, outH);
    if (spec) adjust(out, spec);
    return out;
  }

  root.ImageTools = {
    ensurePica: ensurePica, ensureCropper: ensureCropper,
    decode: decode, resample: resample, adjust: adjust, toBlob: toBlob,
    prepare: prepare, renderCrop: renderCrop, canvasOf: canvasOf,
    // Exposed so a caller can check a picked file before doing any work with it.
    typeOk: typeOk, okTypes: OK_TYPES.slice(),
  };
})(typeof window !== 'undefined' ? window : this);
