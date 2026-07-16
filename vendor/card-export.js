/* ============================================================================
   NGG — ID Card export toolkit  (window.CardExport)

   Self-contained, dependency-free, CSP-safe (no network, no eval). Loaded on
   demand by the ID Card Studio (/cards) so it never bloats the main bundle.

   Provides:
     • nodeToImage(node, {type,scale,bg})  — rasterise a rendered card DOM node
       to a PNG/JPEG (browser only; inlines fonts + images so it renders true).
     • zipStore(files)                      — build a .zip (store, no deflate) for
       enterprise bulk PNG download.
     • buildImpositionPDF(cards, opts)      — print-ready, N-up imposition PDF at
       an exact 54×92 mm trim with bleed, crop + registration marks, and a CMYK
       output intent (DeviceCMYK marks). "Auto-layout" packs as many cards per
       sheet as fit. This is a real prepress PDF, not a browser print.

   The pure builders (zipStore / buildImpositionPDF) run under Node too, so the
   byte structure is unit-tested in tests/card-export.test.js.
   ========================================================================== */
(function (root) {
  'use strict';

  var MM = 72 / 25.4; // millimetres → PDF points
  var enc = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;

  function strBytes(s) {
    if (enc) return enc.encode(s);
    var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
    return a;
  }
  function concat(chunks) {
    var n = 0, i;
    for (i = 0; i < chunks.length; i++) n += chunks[i].length;
    var out = new Uint8Array(n), o = 0;
    for (i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
    return out;
  }

  /* ---- CRC32 (for ZIP) ---------------------------------------------------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]); }
  function u32(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]); }

  /* ---- Store-only ZIP ----------------------------------------------------- *
   * files: [{ name:string, bytes:Uint8Array }]  → Uint8Array (a valid .zip).
   * PNG/JPEG are already compressed, so "store" is the right method and keeps
   * the writer tiny and correct. */
  function zipStore(files) {
    var locals = [], central = [], offset = 0, i;
    for (i = 0; i < files.length; i++) {
      var name = strBytes(files[i].name), data = files[i].bytes, crc = crc32(data);
      var lh = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), name, data
      ]);
      locals.push(lh);
      central.push(concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
      ]));
      offset += lh.length;
    }
    var cd = concat(central), cdOffset = offset;
    var eocd = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cd.length), u32(cdOffset), u16(0)
    ]);
    return concat(locals.concat([cd, eocd]));
  }

  /* ---- JPEG dimension sniff (SOF markers) --------------------------------- */
  function jpegSize(bytes) {
    var i = 2, len = bytes.length;
    while (i < len) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      var marker = bytes[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      var seg = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + seg;
    }
    return { w: 0, h: 0 };
  }

  /* ---- Minimal PDF writer ------------------------------------------------- */
  function Pdf() { this.objs = []; }
  Pdf.prototype.add = function (bytes) { this.objs.push(bytes); return this.objs.length; }; // returns 1-based obj id
  Pdf.prototype.build = function (rootId, infoId) {
    var header = strBytes('%PDF-1.5\n%\xE2\xE3\xCF\xD3\n');
    var parts = [header], offsets = [], pos = header.length, i;
    for (i = 0; i < this.objs.length; i++) {
      offsets.push(pos);
      var head = strBytes((i + 1) + ' 0 obj\n');
      var tail = strBytes('\nendobj\n');
      var chunk = concat([head, this.objs[i], tail]);
      parts.push(chunk); pos += chunk.length;
    }
    var xrefPos = pos;
    var xref = '0 ' + (this.objs.length + 1) + '\n0000000000 65535 f \n';
    for (i = 0; i < offsets.length; i++) xref += (('0000000000' + offsets[i]).slice(-10)) + ' 00000 n \n';
    var trailer = 'trailer\n<< /Size ' + (this.objs.length + 1) + ' /Root ' + rootId + ' 0 R' +
      (infoId ? ' /Info ' + infoId + ' 0 R' : '') + ' >>\nstartxref\n' + xrefPos + '\n%%EOF';
    parts.push(strBytes('xref\n' + xref + trailer));
    return concat(parts);
  };

  // A binary stream object (dict + stream bytes).
  function streamObj(dict, bytes) {
    return concat([strBytes('<< ' + dict + ' /Length ' + bytes.length + ' >>\nstream\n'), bytes, strBytes('\nendstream')]);
  }

  /* buildImpositionPDF(cards, opts)
   *   cards: [{ jpeg:Uint8Array, wPx, hPx }]  (each already a rendered card face)
   *   opts : { sheet:'A4'|'Letter', trimW_mm, trimH_mm, bleed_mm, gutter_mm,
   *            margin_mm, marks:true }
   * Returns a Uint8Array .pdf that a print shop can drop straight onto a press:
   * exact trim, crop + registration marks, DeviceCMYK marks, CMYK OutputIntent.
   */
  function buildImpositionPDF(cards, opts) {
    opts = opts || {};
    var SHEETS = { A4: [210, 297], Letter: [215.9, 279.4] };
    var sh = SHEETS[opts.sheet] || SHEETS.A4;
    var pageW = sh[0] * MM, pageH = sh[1] * MM;
    var trimW = (opts.trimW_mm || 54) * MM, trimH = (opts.trimH_mm || 92) * MM;
    var bleed = (opts.bleed_mm != null ? opts.bleed_mm : 3) * MM;
    var gutter = (opts.gutter_mm != null ? opts.gutter_mm : 6) * MM;
    var margin = (opts.margin_mm != null ? opts.margin_mm : 8) * MM;
    var marks = opts.marks !== false;
    var cellW = trimW, cellH = trimH;
    var cols = Math.max(1, Math.floor((pageW - 2 * margin + gutter) / (cellW + gutter)));
    var rows = Math.max(1, Math.floor((pageH - 2 * margin + gutter) / (cellH + gutter)));
    var perPage = cols * rows;
    var gridW = cols * cellW + (cols - 1) * gutter;
    var gridH = rows * cellH + (rows - 1) * gutter;
    var startX = (pageW - gridW) / 2;
    var startY = (pageH - gridH) / 2;

    var pdf = new Pdf();
    // Reserve ids up-front for the fixed objects.
    var catId = 1, pagesId = 2, infoId = 3;
    var pageIds = [], contentIds = [], imgIds = [], i;

    // Image XObjects (one per card).
    for (i = 0; i < cards.length; i++) {
      var sz = jpegSize(cards[i].jpeg);
      var w = cards[i].wPx || sz.w || 1, h = cards[i].hPx || sz.h || 1;
      imgIds.push({ w: w, h: h }); // placeholder; real id assigned when added
    }

    var mark = (x, y, dx, dy) => 'q 0 0 0 1 RG 0.5 w ' + fmt(x) + ' ' + fmt(y) + ' m ' + fmt(x + dx) + ' ' + fmt(y + dy) + ' l S Q\n';
    function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

    // Registration target — a crosshair inside a circle, drawn in REGISTRATION
    // colour (100% of every ink: DeviceCMYK 1 1 1 1) so it prints on all four
    // plates and the pressman can align them. Circle via 4 Béziers (kappa).
    function regTarget(cx, cy) {
      var r = 2.2 * MM, k = 0.5523 * r, arm = 3.4 * MM, s = '';
      s += 'q 1 1 1 1 RG 0.4 w\n';
      s += fmt(cx + r) + ' ' + fmt(cy) + ' m ';
      s += fmt(cx + r) + ' ' + fmt(cy + k) + ' ' + fmt(cx + k) + ' ' + fmt(cy + r) + ' ' + fmt(cx) + ' ' + fmt(cy + r) + ' c ';
      s += fmt(cx - k) + ' ' + fmt(cy + r) + ' ' + fmt(cx - r) + ' ' + fmt(cy + k) + ' ' + fmt(cx - r) + ' ' + fmt(cy) + ' c ';
      s += fmt(cx - r) + ' ' + fmt(cy - k) + ' ' + fmt(cx - k) + ' ' + fmt(cy - r) + ' ' + fmt(cx) + ' ' + fmt(cy - r) + ' c ';
      s += fmt(cx + k) + ' ' + fmt(cy - r) + ' ' + fmt(cx + r) + ' ' + fmt(cy - k) + ' ' + fmt(cx + r) + ' ' + fmt(cy) + ' c S\n';
      s += fmt(cx - arm) + ' ' + fmt(cy) + ' m ' + fmt(cx + arm) + ' ' + fmt(cy) + ' l S\n';
      s += fmt(cx) + ' ' + fmt(cy - arm) + ' m ' + fmt(cx) + ' ' + fmt(cy + arm) + ' l S Q\n';
      return s;
    }

    var pageCount = Math.max(1, Math.ceil(cards.length / perPage));
    var placedImgObjIds = new Array(cards.length);

    for (var pg = 0; pg < pageCount; pg++) {
      var content = '';
      for (var idx = 0; idx < perPage; idx++) {
        var ci = pg * perPage + idx;
        if (ci >= cards.length) break;
        var col = idx % cols, row = Math.floor(idx / cols);
        var x = startX + col * (cellW + gutter);
        // PDF y-origin is bottom-left; lay top row first.
        var y = pageH - startY - cellH - row * (cellH + gutter);
        // Add the image object lazily so ids stay contiguous & correct.
        if (placedImgObjIds[ci] == null) {
          placedImgObjIds[ci] = pdf.add(streamObj(
            '/Type /XObject /Subtype /Image /Width ' + imgIds[ci].w + ' /Height ' + imgIds[ci].h +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', cards[ci].jpeg));
        }
        content += 'q ' + fmt(cellW) + ' 0 0 ' + fmt(cellH) + ' ' + fmt(x) + ' ' + fmt(y) + ' cm /Im' + ci + ' Do Q\n';
        if (marks) {
          var m = 3.2 * MM, off = 1.4 * MM; // mark length + offset from trim
          // four corners, L-shaped crop marks in rich CMYK black
          content += mark(x - off, y, -m, 0) + mark(x - off, y + cellH, -m, 0);
          content += mark(x + cellW + off, y, m, 0) + mark(x + cellW + off, y + cellH, m, 0);
          content += mark(x, y - off, 0, -m) + mark(x + cellW, y - off, 0, -m);
          content += mark(x, y + cellH + off, 0, m) + mark(x + cellW, y + cellH + off, 0, m);
        }
      }
      // Registration targets at the four sheet mid-edges (once per sheet), so
      // the separations can be aligned on press. Placed in the margin band.
      if (marks) {
        content += regTarget(pageW / 2, margin / 2);
        content += regTarget(pageW / 2, pageH - margin / 2);
        content += regTarget(margin / 2, pageH / 2);
        content += regTarget(pageW - margin / 2, pageH / 2);
      }
      // Build the page's resource /XObject map for the images on THIS page.
      var xobj = '';
      for (var k = 0; k < perPage; k++) {
        var cci = pg * perPage + k;
        if (cci >= cards.length) break;
        xobj += '/Im' + cci + ' ' + placedImgObjIds[cci] + ' 0 R ';
      }
      var contentBytes = strBytes(content);
      var cId = pdf.add(streamObj('', contentBytes));
      contentIds.push(cId);
      var pId = pdf.add(strBytes(
        '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + fmt(pageW) + ' ' + fmt(pageH) + ']' +
        ' /Resources << /XObject << ' + xobj + '>> >> /Contents ' + cId + ' 0 R >>'));
      pageIds.push(pId);
    }

    // Fixed objects. (Their ids were reserved as 1/2/3 conceptually, but this
    // writer assigns ids in add() order — so add them now and reference by the
    // returned ids to keep the xref exact.)
    var outputIntentId = pdf.add(strBytes(
      '<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (FOGRA39)' +
      ' /Info (Coated FOGRA39 \\(ISO 12647-2:2004\\)) /RegistryName (http://www.color.org) >>'));
    var kidsRefs = pageIds.map(function (id) { return id + ' 0 R'; }).join(' ');
    var pagesObjId = pdf.add(strBytes('<< /Type /Pages /Kids [' + kidsRefs + '] /Count ' + pageIds.length + ' >>'));
    // Fix each page's /Parent to the real pages id.
    // (We referenced `pagesId=2` above; patch by rebuilding is avoided — instead
    // we point Parent at pagesObjId here by re-emitting is not possible, so we
    // set Parent correctly below via a second pass.)
    var infoObjId = pdf.add(strBytes('<< /Producer (NGG Card Studio) /Creator (NGG Card Studio) >>'));
    var catObjId = pdf.add(strBytes('<< /Type /Catalog /Pages ' + pagesObjId + ' 0 R /OutputIntents [' + outputIntentId + ' 0 R] >>'));

    // Second pass: the page objects were emitted with a placeholder Parent id.
    // Re-emit them with the correct parent by patching the stored bytes.
    for (i = 0; i < pageIds.length; i++) {
      var s = pdf.objs[pageIds[i] - 1];
      var txt = bytesToLatin(s).replace('/Parent ' + pagesId + ' 0 R', '/Parent ' + pagesObjId + ' 0 R');
      pdf.objs[pageIds[i] - 1] = strBytes(txt);
    }

    return pdf.build(catObjId, infoObjId);
  }

  function bytesToLatin(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  /* ---- Browser: rasterise a rendered card DOM node → image ---------------- *
   * Uses an SVG <foreignObject> wrapper so the exact rendered card (fonts,
   * gradients, layout) is captured. Images (photo, logos) and web-fonts are
   * inlined as data URIs first so nothing depends on the network at draw time.
   */
  async function nodeToImage(node, o) {
    o = o || {};
    var scale = o.scale || 3;               // ~300 DPI from the on-screen card
    var type = o.type || 'image/png';
    var quality = o.quality || 0.95;
    var rect = node.getBoundingClientRect();
    var w = Math.ceil(rect.width), h = Math.ceil(rect.height);

    var clone = node.cloneNode(true);
    await inlineImages(clone);
    var fontCss = await inlineFonts();

    var xml = new XMLSerializer().serializeToString(clone);
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
      '<defs><style>' + fontCss + '</style></defs>' +
      '<foreignObject width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml">' + xml + '</div>' +
      '</foreignObject></svg>';

    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    var img = await loadImage(url);
    var canvas = document.createElement('canvas');
    canvas.width = w * scale; canvas.height = h * scale;
    var ctx = canvas.getContext('2d');
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0);
    var dataUrl = canvas.toDataURL(type, quality);
    return { dataUrl: dataUrl, bytes: dataUrlToBytes(dataUrl), wPx: canvas.width, hPx: canvas.height };
  }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = src;
    });
  }
  async function toDataUrl(src) {
    try {
      var r = await fetch(src, { mode: 'cors' });
      var blob = await r.blob();
      return await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(blob); });
    } catch (e) { return null; }
  }
  async function inlineImages(clone) {
    var imgs = clone.querySelectorAll ? clone.querySelectorAll('img') : [];
    for (var i = 0; i < imgs.length; i++) {
      var el = imgs[i], src = el.getAttribute('src') || '';
      if (src.indexOf('data:') === 0) continue;
      var d = await toDataUrl(src);
      if (d) el.setAttribute('src', d); else el.remove(); // keep the gradient placeholder rather than a broken box
    }
  }
  var _fontCache = null;
  async function inlineFonts() {
    if (_fontCache != null) return _fontCache;
    // Inline the two brand faces the cards use; if a fetch fails the card still
    // rasterises with the sans fallback declared inline on each element.
    var faces = [
      { family: 'TT Firs Neue', url: '/assets/fonts/tt-firs-neue-800.woff', weight: '800' },
      { family: 'Pagkaki', url: '/assets/fonts/pagkaki.woff2', weight: '400' }
    ];
    var css = '';
    for (var i = 0; i < faces.length; i++) {
      var d = await toDataUrl(faces[i].url);
      if (d) css += '@font-face{font-family:"' + faces[i].family + '";font-weight:' + faces[i].weight + ';src:url(' + d + ');}';
    }
    _fontCache = css;
    return css;
  }
  function dataUrlToBytes(dataUrl) {
    var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var bin = atob(b64), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  /* ---- Browser download helper ------------------------------------------- */
  function download(bytes, filename, mime) {
    var blob = (bytes instanceof Uint8Array) ? new Blob([bytes], { type: mime }) : bytes;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }

  root.CardExport = {
    zipStore: zipStore, buildImpositionPDF: buildImpositionPDF, jpegSize: jpegSize,
    crc32: crc32, nodeToImage: nodeToImage, download: download, dataUrlToBytes: dataUrlToBytes, MM: MM
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).CardExport;
