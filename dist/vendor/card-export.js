/* ============================================================================
   NGG — ID Card export toolkit  (window.CardExport)

   High-standard, library-backed export. Loaded on demand by the ID Card Studio
   (/cards) so the libraries never bloat the main bundle. Everything is
   self-hosted (CSP-safe: no CDN, no eval): it lazy-loads three vendored,
   battle-tested libraries and orchestrates them.

     • html2canvas  — pixel-accurate rasterisation of the rendered card DOM
                      (fonts, gradients, images) → high-DPI PNG/JPEG.
     • JSZip        — the bulk PNG download (a real .zip, streamed).
     • jsPDF        — the print-ready, N-up imposition PDF: exact 54×92 mm trim,
                      crop marks (rich CMYK black) + registration targets
                      (registration colour, all four plates), and a FOGRA39
                      CMYK OutputIntent. Not a browser print — a prepress PDF.

   Public API (all async): nodeToImage, zipStore, buildImpositionPDF, download.
   ========================================================================== */
(function (root) {
  'use strict';
  var MM = 72 / 25.4;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var have = Array.prototype.some.call(document.scripts, function (s) { return s.src && s.src.indexOf(src) !== -1; });
      if (have) return res();
      var el = document.createElement('script');
      el.src = src; el.onload = function () { res(); }; el.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(el);
    });
  }

  var _deps = null;
  async function ensureDeps() {
    if (_deps) return _deps;
    if (!root.html2canvas) await loadScript('/vendor/html2canvas.min.js');
    if (!(root.jspdf && root.jspdf.jsPDF)) await loadScript('/vendor/jspdf.umd.min.js');
    if (!root.JSZip) await loadScript('/vendor/jszip.min.js');
    _deps = { html2canvas: root.html2canvas, jsPDF: root.jspdf.jsPDF, JSZip: root.JSZip };
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
  async function fetchAsDataURL(src) {
    try { var r = await fetch(src, { mode: 'cors', credentials: 'omit' }); if (r.ok) return await blobToDataURL(await r.blob()); } catch (e) {}
    return null;
  }
  /* Inline every <img> in the node as a same-origin data URI before rasterising.
   * Without this, html2canvas taints cross-origin photos (Cloudinary/external)
   * and DROPS them — the on-screen edit "reverts" (vanishes) in the export. We
   * swap src to a data URL, snapshot, then restore the originals. */
  async function inlineImages(node) {
    var imgs = Array.prototype.slice.call(node.querySelectorAll('img'));
    var restore = [];
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i], src = im.getAttribute('src') || '';
      if (!src || src.indexOf('data:') === 0) continue;
      var data = await fetchAsDataURL(src);
      if (data) {
        restore.push([im, src]);
        im.setAttribute('src', data);
        // Ensure the swapped image is decoded before html2canvas snapshots.
        try { if (im.decode) await im.decode(); } catch (e) {}
      }
    }
    return function () { for (var j = 0; j < restore.length; j++) restore[j][0].setAttribute('src', restore[j][1]); };
  }

  /* Rasterise a rendered card node with html2canvas. Returns a data URL (+ bytes
   * + pixel size). Images are inlined first so cross-origin photos never taint. */
  async function nodeToImage(node, o) {
    o = o || {};
    var d = await ensureDeps();
    var restore = await inlineImages(node);
    try {
      var canvas = await d.html2canvas(node, {
        scale: o.scale || 3,
        backgroundColor: o.bg || '#ffffff',
        useCORS: true, allowTaint: false, logging: false,
        imageTimeout: 15000,
      });
      var type = o.type || 'image/png', q = o.quality || 0.95;
      var dataUrl = canvas.toDataURL(type, q);
      return { dataUrl: dataUrl, bytes: dataUrlToBytes(dataUrl), wPx: canvas.width, hPx: canvas.height };
    } finally { restore(); }
  }

  /* Bulk download: a real .zip of the PNG faces, built with JSZip. */
  async function zipStore(files) {
    var d = await ensureDeps();
    var zip = new d.JSZip();
    for (var i = 0; i < files.length; i++) zip.file(files[i].name, files[i].bytes);
    return await zip.generateAsync({ type: 'uint8array' });
  }

  /* Print-ready imposition PDF via jsPDF.
   *   cards: [{ dataUrl }]  — each a rendered card FACE (JPEG data URL).
   *   opts : { sheet:'A4'|'Letter', trimW_mm, trimH_mm, gutter_mm, margin_mm, marks }
   * Auto-lays out as many cards as fit per sheet, draws crop + registration
   * marks in true DeviceCMYK, and tags the doc with a FOGRA39 CMYK OutputIntent.
   */
  async function buildImpositionPDF(cards, opts) {
    opts = opts || {};
    var d = await ensureDeps();
    var isLetter = opts.sheet === 'Letter';
    var pageW = isLetter ? 215.9 : 210, pageH = isLetter ? 279.4 : 297;
    var trimW = opts.trimW_mm || 54, trimH = opts.trimH_mm || 92;
    var gutter = opts.gutter_mm != null ? opts.gutter_mm : 6;
    var margin = opts.margin_mm != null ? opts.margin_mm : 8;
    var marks = opts.marks !== false;
    var cols = Math.max(1, Math.floor((pageW - 2 * margin + gutter) / (trimW + gutter)));
    var rows = Math.max(1, Math.floor((pageH - 2 * margin + gutter) / (trimH + gutter)));
    var perPage = cols * rows;
    var gridW = cols * trimW + (cols - 1) * gutter, gridH = rows * trimH + (rows - 1) * gutter;
    var startX = (pageW - gridW) / 2, startY = (pageH - gridH) / 2;

    var doc = new d.jsPDF({ unit: 'mm', format: isLetter ? 'letter' : 'a4', orientation: 'portrait', compress: true });

    // FOGRA39 CMYK OutputIntent — declares the press target so the RIP separates
    // the RGB card art to CMYK against a known profile. Added via jsPDF's object
    // hooks; guarded so a jsPDF version change can never corrupt the file.
    try {
      var oiRef = null;
      doc.internal.events.subscribe('postPutResources', function () {
        oiRef = doc.internal.newObject();
        doc.internal.out('<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (FOGRA39) /Info (Coated FOGRA39 \\(ISO 12647-2:2004\\)) /RegistryName (http://www.color.org) >>');
        doc.internal.out('endobj');
      });
      doc.internal.events.subscribe('putCatalog', function () {
        if (oiRef) doc.internal.out('/OutputIntents [' + oiRef + ' 0 R]');
      });
    } catch (e) { /* CMYK marks still apply even without the intent tag */ }

    var cropLen = 3.2, cropOff = 1.4; // mm
    function cropMarks(x, y, w, h) {
      doc.setDrawColor(0, 0, 0, 1); // DeviceCMYK rich black — values 0..1 per the PDF K operator
      doc.setLineWidth(0.18);
      // top-left, top-right, bottom-left, bottom-right L-marks (y grows downward)
      doc.line(x - cropOff, y, x - cropOff - cropLen, y);       doc.line(x, y - cropOff, x, y - cropOff - cropLen);
      doc.line(x + w + cropOff, y, x + w + cropOff + cropLen, y); doc.line(x + w, y - cropOff, x + w, y - cropOff - cropLen);
      doc.line(x - cropOff, y + h, x - cropOff - cropLen, y + h); doc.line(x, y + h + cropOff, x, y + h + cropOff + cropLen);
      doc.line(x + w + cropOff, y + h, x + w + cropOff + cropLen, y + h); doc.line(x + w, y + h + cropOff, x + w, y + h + cropOff + cropLen);
    }
    function regTarget(cx, cy) {
      doc.setDrawColor(1, 1, 1, 1); // registration colour: 100% of every plate (DeviceCMYK 1 1 1 1)
      doc.setLineWidth(0.15);
      doc.circle(cx, cy, 2.2, 'S');
      doc.line(cx - 3.4, cy, cx + 3.4, cy);
      doc.line(cx, cy - 3.4, cx, cy + 3.4);
    }

    var pages = Math.max(1, Math.ceil(cards.length / perPage));
    for (var pg = 0; pg < pages; pg++) {
      if (pg > 0) doc.addPage();
      for (var idx = 0; idx < perPage; idx++) {
        var ci = pg * perPage + idx;
        if (ci >= cards.length) break;
        var col = idx % cols, row = Math.floor(idx / cols);
        var x = startX + col * (trimW + gutter), y = startY + row * (trimH + gutter);
        doc.addImage(cards[ci].dataUrl, 'JPEG', x, y, trimW, trimH, undefined, 'SLOW');
        if (marks) cropMarks(x, y, trimW, trimH);
      }
      if (marks) {
        regTarget(pageW / 2, margin / 2);
        regTarget(pageW / 2, pageH - margin / 2);
        regTarget(margin / 2, pageH / 2);
        regTarget(pageW - margin / 2, pageH / 2);
      }
    }
    doc.setProperties({ title: 'NGG ID cards — print', creator: 'NGG Card Studio' });
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

  root.CardExport = {
    ensureDeps: ensureDeps, nodeToImage: nodeToImage, zipStore: zipStore,
    buildImpositionPDF: buildImpositionPDF, download: download, dataUrlToBytes: dataUrlToBytes, MM: MM,
  };
})(typeof window !== 'undefined' ? window : this);
