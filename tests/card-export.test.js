/* Library-backed ID-card export test (html2canvas + jsPDF + fflate).
   Runs in real Chromium via Playwright, served by php -S so /vendor/* resolves.
   Skips with a pass if playwright-core isn't installed (like the kiosk E2E).

   Beyond "a PDF came out", this asserts the prepress properties a print shop
   actually checks: page boxes, real bleed, optional-content layers with their
   ISO 19593-1 processing-step metadata, marks in registration colour, and the
   duplex page order. */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8196, BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_export_fixture.html');
const MM = 72 / 25.4;

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  card-export: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.writeFileSync(FIX, '<!doctype html><html><body>'
    + '<div id="card" class="idcard" style="width:295px;height:410px;background:#fff;position:relative;font-family:Inter,sans-serif;overflow:hidden">'
    + '<div style="position:absolute;top:180px;left:0;right:0;text-align:center;font-weight:800;font-size:26px;color:#E4155F">ADAEZE</div>'
    + '<div style="position:absolute;left:0;right:0;bottom:0;height:14px;background:#B0143C"></div>'
    + '<img id="xphoto" src="http://127.0.0.1:9411/xorigin-photo.png" style="position:absolute;top:20px;left:20px;width:80px;height:80px">'
    + '<img id="deadlogo" src="/assets/__never_answers/logo-a.png" style="width:40px">'
    + '<img src="/assets/__never_answers/logo-b.png" style="width:40px"></div>'
    + '<script src="/vendor/card-export.js"></script></body></html>');

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  await waitForServer(BASE);
  let pass = 0, fail = 0; const ok = (l, c) => { c ? pass++ : (fail++, console.error('  ✗ ' + l)); };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    // A host that accepts the connection and never answers — what the site's
    // own asset URLs look like when the origin is down.
    await page.route('**/__never_answers/**', () => {});
    /* A cross-origin photo whose <img> loads but whose fetch() is refused —
     * a host that serves images without an Access-Control-Allow-Origin the
     * inliner can use. It must still reach the raster: html2canvas has useCORS
     * of its own. Blanking these "so html2canvas doesn't wait" silently
     * emptied the photo frame on every card. */
    const MAGENTA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==', 'base64');
    await page.route('**/xorigin-photo.png', (route) => route.request().resourceType() === 'fetch'
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'image/png', body: MAGENTA,
                        headers: { 'Access-Control-Allow-Origin': '*' } }));
    page.on('console', m => { if (m.type() === 'error') console.error('    page:', m.text()); });
    // Not 'networkidle': the deliberately-dead images never settle.
    await page.goto(BASE + '/tests/_export_fixture.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.CardExport, null, { timeout: 15000 });
    const r = await page.evaluate(async (MM) => {
      const CE = window.CardExport; await CE.ensureDeps();
      const node = document.getElementById('card');
      const TRIM_W = 54, TRIM_H = 75, BLEED = 3;

      /* ── bleed generation ────────────────────────────────────────────────
       * The probe is the shape of the real artwork that broke in production:
       * a 2px coloured border round a white panel, bled by 4px. The border is
       * NARROWER than the bleed, so mirroring reflects the white panel into
       * the outside of the bleed — which is exactly what put a white sliver
       * around every card on the printed sheets, and duplicated the badge
       * that straddles the top edge. Clamping repeats the edge pixel and
       * cannot reach inside the card at all. */
      const probe = document.createElement('canvas');
      probe.width = 20; probe.height = 20;
      const pc = probe.getContext('2d');
      pc.fillStyle = '#ff0000'; pc.fillRect(0, 0, 20, 20);   // 2px red border…
      pc.fillStyle = '#ffffff'; pc.fillRect(2, 2, 16, 16);   // …round a white panel
      const readBack = async (url) => {
        const bi = new Image(); bi.src = url; await bi.decode();
        const rc = document.createElement('canvas');
        rc.width = bi.width; rc.height = bi.height;
        rc.getContext('2d').drawImage(bi, 0, 0);
        const d = rc.getContext('2d');
        return (x, y) => { const p = d.getImageData(x, y, 1, 1).data; return p[0] + ',' + p[1] + ',' + p[2]; };
      };
      const clamped = await CE.addBleed(probe.toDataURL('image/png'), 4, { type: 'image/png' });
      const cp = await readBack(clamped.dataUrl);
      const mirroredOut = await CE.addBleed(probe.toDataURL('image/png'), 4, { type: 'image/png', mode: 'mirror' });
      const mp = await readBack(mirroredOut.dataUrl);
      // b=4, so the left bleed is x=0..3 and the trim edge is x=4.
      const bleedClamps = cp(0, 12) === '255,0,0' && cp(3, 12) === '255,0,0'   // whole strip = edge colour
                       && cp(0, 0) === '255,0,0'                               // corner too
                       && cp(12, 0) === '255,0,0' && cp(12, 27) === '255,0,0'; // top and bottom
      // …and the old behaviour still available, still demonstrably different:
      // mirroring x=0..3 reflects source columns 3,2,1,0 → x=0 is column 3,
      // which is inside the white panel. That is the defect, reproduced.
      const mirrorLeaksInnerArt = mp(0, 12) === '255,255,255' && mp(3, 12) === '255,0,0';
      const bleedDefault = clamped.dataUrl !== mirroredOut.dataUrl;

      /* ── a dead asset host must not fail the card ────────────────────────
       * The card logos are same-origin. When the site's own server stops
       * answering, every face used to pay the fetch timeout twice over for
       * each of them, blow the per-face budget and fail the entire roster
       * with "couldn't render" and no download. Discovery costs one grace
       * period; after that the URL is known-bad and faces are fast again. */
      const deadT0 = performance.now();
      await CE.renderFace(node, { trimW_mm: TRIM_W, dpi: 150, bleed_mm: 1 });
      const firstDeadMs = performance.now() - deadT0;
      const deadT1 = performance.now();
      await CE.renderFace(node, { trimW_mm: TRIM_W, dpi: 150, bleed_mm: 1 });
      const laterDeadMs = performance.now() - deadT1;

      // The photo frame must not come back empty.
      const shot = await CE.nodeToImage(node, { scale: 1, type: 'image/png', bg: '#fff' });
      const si = new Image(); si.src = shot.dataUrl; await si.decode();
      const sc = document.createElement('canvas'); sc.width = si.width; sc.height = si.height;
      sc.getContext('2d').drawImage(si, 0, 0);
      const pd = sc.getContext('2d').getImageData(60, 60, 1, 1).data;
      const photoKept = !(pd[0] > 250 && pd[1] > 250 && pd[2] > 250);
      const photoSrc = document.getElementById('xphoto').getAttribute('src');

      // ── faces, with bleed, at a real print resolution ────────────────────
      const scale = CE.scaleForDpi(295, TRIM_W, 350);
      const front = await CE.renderFace(node, { trimW_mm: TRIM_W, dpi: 350, bleed_mm: BLEED, quality: 0.95 });
      const back = await CE.renderFace(node, { trimW_mm: TRIM_W, dpi: 350, bleed_mm: BLEED, quality: 0.95 });
      const dpiPx = front.trimWPx / (TRIM_W / 25.4);

      const png = await CE.nodeToImage(node, { scale: 2 });
      const zip = await CE.zipStore([{ name: 'a.png', bytes: png.bytes }]);

      const decode = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + 8192, u8.length))); return s; };

      // Inflate the page content streams so the imposition geometry can be read
      // back out of the finished file rather than trusted.
      const contentStreams = async (u8) => {
        const s = decode(u8), out = [];
        for (let i = 0; (i = s.indexOf('\nstream', i)) !== -1;) {
          const hdr = s.slice(Math.max(0, s.lastIndexOf(' obj', i)), i);
          const len = /\/Length (\d+)/.exec(hdr);
          let b = i + 7; if (s[b] === '\r') b++; if (s[b] === '\n') b++;
          if (!len) { i = b; continue; }
          const end = b + Number(len[1]);
          if (hdr.indexOf('FlateDecode') !== -1) {
            try {
              const ds = new DecompressionStream('deflate');
              const buf = await new Response(new Blob([u8.subarray(b, end)]).stream().pipeThrough(ds)).arrayBuffer();
              const txt = decode(new Uint8Array(buf));
              if (txt.indexOf(' cm') !== -1) out.push(txt);
            } catch (_) {}
          }
          i = end;
        }
        return out;
      };
      // Image placements as {x, y, turned} in mm, PDF origin bottom-left.
      // A turned back face is drawn inside an extra `q -1 0 0 -1 … cm` so the
      // effective placement is only visible once the transforms are composed —
      // hence a real (if tiny) content-stream interpreter rather than a regex
      // over individual matrices.
      const placements = (txt) => {
        const out = [], stack = [];
        let ctm = [1, 0, 0, 1, 0, 0];
        // PDF row-vector convention: CTM' = operand × CTM.
        const mul = (m, n) => [
          m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
          m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
          m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
        ];
        const re = /([-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+) cm|(?:^|\s)(q|Q)(?=\s)|\/(\w+) Do/g;
        let m;
        while ((m = re.exec(txt)) !== null) {
          if (m[1]) ctm = mul(m[1].split(' ').map(Number), ctm);
          else if (m[2] === 'q') stack.push(ctm.slice());
          else if (m[2] === 'Q') ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
          else if (m[3]) {
            const p = (x, y) => [(ctm[0] * x + ctm[2] * y + ctm[4]) / MM, (ctm[1] * x + ctm[3] * y + ctm[5]) / MM];
            const a = p(0, 0), b = p(1, 1);
            if (Math.abs(b[0] - a[0]) < 30) continue;   // not a card-sized image
            out.push({
              x: Math.round(Math.min(a[0], b[0]) * 100) / 100,
              y: Math.round(Math.min(a[1], b[1]) * 100) / 100,
              turned: ctm[0] < 0 && ctm[3] < 0,
            });
          }
        }
        return out;
      };

      // ── imposed duplex sheet ─────────────────────────────────────────────
      // Seven cards on a 3×3 grid: the ragged last row is what exposes a
      // back sheet that hasn't been column-mirrored for the duplex flip.
      const seven = [front, front, front, front, front, front, front];
      const imposed = await CE.buildImpositionPDF(seven, {
        backs: seven.map(() => back), layout: 'imposed', sheet: 'A4',
        trimW_mm: TRIM_W, trimH_mm: TRIM_H, bleed_mm: BLEED, marks: true, layers: true,
        jobName: 'NGG test', date: '2026-07-25',
      });
      const it = decode(imposed);

      const key = (l) => l.map((p) => p.x + '@' + p.y).sort().join(' ');
      const axisMirror = (list, axis) => {
        const vals = Array.from(new Set(list.map((p) => p[axis]))).sort((a, b) => a - b);
        return (v) => vals[vals.length - 1 - vals.indexOf(v)];
      };
      // Build the same seven-up sheet under each flip and read back where the
      // backs actually landed.
      const duplexRun = async (mode) => {
        const bytes = await CE.buildImpositionPDF(seven, {
          backs: seven.map(() => back), layout: 'imposed', sheet: 'A4', duplex: mode,
          trimW_mm: TRIM_W, trimH_mm: TRIM_H, bleed_mm: BLEED, marks: true, layers: true,
        });
        const st = await contentStreams(bytes);
        return { f: placements(st[0] || ''), b: placements(st[1] || '') };
      };
      const longEdge = await duplexRun('long-edge');
      const shortEdge = await duplexRun('short-edge');
      const noFlip = await duplexRun('none');

      const mirX = axisMirror(longEdge.f, 'x'), mirY = axisMirror(longEdge.f, 'y');
      // Long edge: columns reverse, rows hold, art stays upright.
      const longOk = longEdge.f.length === 7 && longEdge.b.length === 7
        && key(longEdge.b) === key(longEdge.f.map((p) => ({ x: mirX(p.x), y: p.y })))
        && key(longEdge.b) !== key(longEdge.f)
        && longEdge.b.every((p) => !p.turned);
      // Short edge: rows reverse, columns hold, and every back is turned 180°
      // or it prints upside-down on the card.
      const shortOk = shortEdge.b.length === 7
        && key(shortEdge.b) === key(shortEdge.f.map((p) => ({ x: p.x, y: mirY(p.y) })))
        && key(shortEdge.b) !== key(shortEdge.f)
        && shortEdge.b.every((p) => p.turned);
      // The two flips must not agree, or one of them is wrong.
      const flipsDiffer = key(longEdge.b) !== key(shortEdge.b);
      // None: backs sit exactly where the fronts do, untouched.
      const noneOk = key(noFlip.b) === key(noFlip.f) && noFlip.b.every((p) => !p.turned);

      const fs_ = longEdge.f, bs_ = longEdge.b;
      const duplexMirrored = longOk;

      // Object numbers must be unique: handing a page's id to a layer
      // dictionary leaves a file that opens with no pages at all.
      const ids = (it.match(/(?:^|[\r\n])(\d+) 0 obj/g) || []).map((m) => m.trim().split(' ')[0]);
      const uniqueIds = ids.length > 0 && new Set(ids).size === ids.length;
      // …and the artwork must land in /XObject, not get swept into the
      // /Properties list spliced in beside it.
      const xobjectIntact = /\/XObject <<\s*(?:\/I\d+ \d+ 0 R\s*)+>> \/Properties <</.test(it);

      // ── single-up prepress page ──────────────────────────────────────────
      const oneUp = await CE.buildImpositionPDF([front], {
        backs: [back], layout: 'single-up',
        trimW_mm: TRIM_W, trimH_mm: TRIM_H, bleed_mm: BLEED, marks: true, layers: true,
      });
      const ot = decode(oneUp);
      const boxOf = (t, name) => {
        const m = new RegExp('/' + name + ' \\[([-\\d. ]+)\\]').exec(t);
        if (!m) return null;
        const v = m[1].trim().split(/\s+/).map(Number);
        return { w: (v[2] - v[0]) / MM, h: (v[3] - v[1]) / MM };
      };
      const near = (a, b, tol) => a != null && Math.abs(a - b) <= (tol || 0.15);
      const trim = boxOf(ot, 'TrimBox'), bleedBox = boxOf(ot, 'BleedBox');

      // Uncompressed probe: prove setDrawColor(4 args) emits a DeviceCMYK op.
      const jd = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      jd.setDrawColor(0, 0, 0, 1); jd.line(10, 10, 40, 10);
      const pl = decode(new Uint8Array(jd.output('arraybuffer')));

      return {
        firstDeadMs: Math.round(firstDeadMs), laterDeadMs: Math.round(laterDeadMs),
        photoKept, photoSrcBlanked: photoSrc.indexOf('data:') === 0,
        jpg: front.dataUrl.indexOf('data:image/jpeg') === 0 && front.wPx > front.trimWPx,
        dpi: Math.round(dpiPx),
        scale,
        bleedClamps, mirrorLeaksInnerArt, bleedDefault,
        bleedPx: front.bleedPx,
        bleedGeom: front.wPx === front.trimWPx + 2 * front.bleedPx && front.hPx === front.trimHPx + 2 * front.bleedPx,
        zipPk: zip[0] === 0x50 && zip[1] === 0x4b && zip.length > 100,
        pdfHeader: it.indexOf('%PDF') === 0, pdfEof: it.trim().slice(-5) === '%%EOF', pdfLen: imposed.length,
        outputIntent: it.indexOf('OutputIntent') !== -1 && it.indexOf('FOGRA39') !== -1,
        cmyk: /(\d+\.?\d* ){4}K/.test(pl) && pl.indexOf(' 255. K') === -1, // 4-channel K op, in-range (0..1)
        // layers
        ocProps: it.indexOf('/OCProperties') !== -1 && it.indexOf('/Type /OCG') !== -1,
        ocRefs: it.indexOf('/Properties <<') !== -1,
        uniqueIds, xobjectIntact, duplexMirrored, shortOk, noneOk, flipsDiffer,
        frontXs: fs_.map((p) => p.x).join(','), backXs: bs_.map((p) => p.x).join(','),
        shortYs: shortEdge.b.map((p) => p.y).join(','),
        procSteps: it.indexOf('/GTS_ProcStepsGroup /Structural') !== -1 && it.indexOf('/GTS_ProcStepsType /Cutting') !== -1,
        nonPrinting: it.indexOf('/PrintState /OFF') !== -1,
        autoState: it.indexOf('/Event /Print') !== -1,
        // page boxes + duplex ordering
        imposedTrim: !!boxOf(it, 'TrimBox'),
        pages: (it.match(/\/Type \/Page[^s]/g) || []).length,
        oneUpTrimW: trim && trim.w, oneUpTrimH: trim && trim.h,
        oneUpBoxes: near(trim && trim.w, TRIM_W) && near(trim && trim.h, TRIM_H)
          && near(bleedBox && bleedBox.w, TRIM_W + 2 * BLEED) && near(bleedBox && bleedBox.h, TRIM_H + 2 * BLEED),
        oneUpPages: (ot.match(/\/Type \/Page[^s]/g) || []).length,
        slug: it.indexOf('/OutputIntents') !== -1,
      };
    }, MM);

    ok('a card whose asset host never answers still renders (' + r.firstDeadMs + 'ms)', r.firstDeadMs < 25000);
    ok('and the dead URL is not re-tried on later faces (' + r.laterDeadMs + 'ms)', r.laterDeadMs < 1500);
    ok('a cross-origin photo that cannot be inlined still reaches the card', r.photoKept);
    ok('…and its src is left alone rather than blanked', !r.photoSrcBlanked);
    ok('renderFace produced a bled JPEG face', r.jpg);
    ok('artwork lands at 350 DPI for the trim size (got ' + r.dpi + ')', Math.abs(r.dpi - 350) <= 6);
    ok('bleed clamps the trim edge outward on all four sides and corners', r.bleedClamps);
    ok('…which is the default, not the same image as mirroring', r.bleedDefault);
    ok('…and mirroring, the old default, provably leaks inner artwork into the bleed', r.mirrorLeaksInnerArt);
    ok('face geometry is trim + 2×bleed (' + r.bleedPx + 'px each side)', r.bleedGeom && r.bleedPx > 20);
    ok('fflate produced a valid .zip', r.zipPk);
    ok('jsPDF produced a valid PDF (%PDF … %%EOF, ' + r.pdfLen + ' bytes)', r.pdfHeader && r.pdfEof);
    ok('PDF carries a FOGRA39 CMYK OutputIntent', r.outputIntent);
    ok('marks drawn in DeviceCMYK (4-channel stroke operator)', r.cmyk);
    ok('PDF declares optional-content layers (/OCProperties + /OCG)', r.ocProps);
    ok('page resources expose the layers as a /Properties list', r.ocRefs);
    ok('cut layer tagged per ISO 19593-1 (Structural / Cutting)', r.procSteps);
    ok('guide layers are flagged non-printing (/PrintState /OFF + /AS print state)', r.nonPrinting && r.autoState);
    ok('object numbers are unique (page tree not overwritten by layers)', r.uniqueIds);
    ok('artwork stays in /XObject beside the spliced /Properties list', r.xobjectIntact);
    ok('every page carries a TrimBox', r.imposedTrim);
    ok('duplex interleaves a back sheet per front sheet (' + r.pages + ' pages)', r.pages === 2);
    ok('long-edge flip: back columns mirrored, art upright (front ' + r.frontXs + ' → back ' + r.backXs + ')', r.duplexMirrored);
    ok('short-edge flip: back rows mirrored AND art turned 180°', r.shortOk);
    ok('the two flip axes produce different back sheets', r.flipsDiffer);
    ok('duplex "none" leaves backs untouched', r.noneOk);
    ok('single-up TrimBox is the card (' + (r.oneUpTrimW || 0).toFixed(2) + '×' + (r.oneUpTrimH || 0).toFixed(2) + 'mm) inside a +3mm BleedBox', r.oneUpBoxes);
    ok('single-up emits one page per face', r.oneUpPages === 2);
  } catch (e) { fail++; console.error('  ✗ harness error: ' + (e && e.message)); }
  finally { if (browser) await browser.close(); try { process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(FIX); } catch (_) {} }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (card-export, library-backed)');
  process.exit(fail ? 1 : 0);
})();
