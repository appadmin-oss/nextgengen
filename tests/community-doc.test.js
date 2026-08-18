#!/usr/bin/env node
/* ============================================================================
   Document sharing in the community — the upload classification and the viewer.

   These two are one bug, tested together because that is how they failed.

   A shared PDF used to be classified as an image on the way out (everything
   that was not a video was), signed as an image upload with an `f_auto`
   incoming transformation, and rasterised by Cloudinary into a PNG. The
   document was never stored. Downstream, the community's PDF viewer asked
   "does this url end in .pdf?", got "no" — correctly, it was a .png — and
   rendered a plain download card instead. One cause, two symptoms, and each
   one looked like a separate feature request.

   So this checks BOTH halves against the shipped bundle:
     · mediaKindOf() calls a PDF a pdf, a docx raw, a clip a video, a photo an
       image, and does so by extension when the browser supplies no MIME type
       (which some Android file managers do not).
     · NggPdf opens, pages, and asks Cloudinary for `pg_N` JPEGs rather than
       trying to make a browser render a document format inline.

   Run:  node tests/community-doc.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.DOC_PORT || 8219;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_doc_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  community documents: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  /* A REAL three-page PDF, served from this repo. The viewer now renders pages
     with pdf.js rather than asking a CDN for pictures of them, so the test has
     to hand it an actual document — and a local one, because a suite that needs
     the network to prove a renderer works reports outages as bugs. */
  const PDF = '/tests/_fixture-handout.pdf';

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fff}</style>
</head><body class="cm-app"><div style="max-width:390px;padding:16px"><div id="root"></div></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(window.NggPdf, { src: ${JSON.stringify(PDF)}, name: 'Week 3 handout.pdf', pages: 3, bytes: 1125 })
  );
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const requested = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('request', r => requested.push(r.url()));
    await page.goto(BASE + '/tests/_doc_fixture.html', { waitUntil: 'networkidle' });

    /* ── The classifier, exercised in the browser it actually runs in ──────
       This is the line that caused the bug: `video ? 'video' : 'image'`. */
    const kinds = await page.evaluate(() => {
      const mk = (name, type) => window.NGGApi.__mediaKindOf({ name, type });
      return {
        pdf:        mk('handout.pdf', 'application/pdf'),
        pdfNoType:  mk('handout.pdf', ''),
        docx:       mk('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        docxNoType: mk('notes.docx', ''),
        zipNoType:  mk('pack.zip', ''),
        video:      mk('clip.mp4', 'video/mp4'),
        image:      mk('photo.jpg', 'image/jpeg'),
        camera:     mk('', 'image/jpeg'),
      };
    });
    chk('a PDF is classified as a pdf, not an image', kinds.pdf === 'pdf');
    chk('…even when the browser supplies no MIME type', kinds.pdfNoType === 'pdf');
    chk('a Word document is raw, so nothing re-encodes it', kinds.docx === 'raw');
    chk('…also by extension alone', kinds.docxNoType === 'raw');
    chk('a zip is raw', kinds.zipNoType === 'raw');
    chk('a clip is still a video', kinds.video === 'video');
    chk('a photo is still an image', kinds.image === 'image');
    chk('a camera capture with no filename is still an image', kinds.camera === 'image');

    /* ── The viewer ───────────────────────────────────────────────────── */
    chk('a document is offered closed, not fetched on sight',
        await page.locator('.pdfv-open').count() === 1
        && await page.locator('.pdfv-canvas').count() === 0);
    chk('…naming the file and what it costs to open',
        /Week 3 handout\.pdf/.test(await page.locator('.pdfv-open-name').innerText())
        && /PDF · 3 pages · 1 KB/.test(await page.locator('.pdfv-open-meta').innerText()));

    /* Nothing about pdf.js may be on the wire until somebody asks for it. It is
       half a megabyte plus a one-megabyte worker, and this is the whole reason
       the viewer opens closed. */
    const early = requested.filter(u => /pdfjs/.test(u));
    chk('the pdf.js library is NOT fetched until a document is opened', early.length === 0);

    await page.locator('.pdfv-open').click();
    await page.waitForSelector('.pdfv-canvas', { state: 'attached', timeout: 30000 });

    chk('opening it fetches the library and its worker, once',
        requested.some(u => /pdfjs\.min\.js/.test(u)) && requested.some(u => /pdfjs\.worker/.test(u)));
    chk('page 1 renders to a canvas with real pixels', await page.evaluate(() => {
      const c = document.querySelector('.pdfv-canvas');
      if (!c || !c.width || !c.height) return false;
      // Not a blank canvas: some pixel must differ from the top-left one.
      const d = c.getContext('2d').getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
      for (let i = 4; i < d.length; i += 4) {
        if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) return true;
      }
      return false;
    }));
    chk('the page count comes from the document itself, not from the caller',
        /Page 1 of 3/.test(await page.locator('.pdfv-count').innerText()));
    chk('there is no way back past page 1', await page.locator('.pdfv-pg[disabled]').count() === 1);

    /* Compare the PIXELS, not the length of their encoding. Two pages of the
       same document differ by a single glyph here, and their PNGs can compress
       to byte-identical lengths — an assertion that passed or failed on the
       compressor's mood rather than on whether the page turned. */
    const firstPixels = await page.evaluate(() => document.querySelector('.pdfv-canvas').toDataURL());
    await page.locator('.pdfv-pg').last().click();
    await page.waitForFunction(() => /Page 2 of 3/.test(document.querySelector('.pdfv-count').textContent));
    // The canvas is redrawn asynchronously after the page number updates.
    await page.waitForFunction((was) => {
      const c = document.querySelector('.pdfv-canvas');
      return c && c.width > 0 && c.toDataURL() !== was;
    }, firstPixels, { timeout: 15000 }).catch(() => {});
    chk('turning the page draws a different page', await page.evaluate((was) =>
      document.querySelector('.pdfv-canvas').toDataURL() !== was, firstPixels));

    chk('the real document is always one tap away',
        await page.locator('.pdfv-bar a[href$=".pdf"]').count() >= 1);

    /* Zoom must RE-RENDER, not stretch. A bigger canvas is the observable
       difference between real zoom and a scaled picture. */
    const beforeZoom = await page.evaluate(() => document.querySelector('.pdfv-canvas').width);
    await page.locator('.pdfv-btn[aria-label="Zoom in"]').click();
    await page.waitForFunction((w) => document.querySelector('.pdfv-canvas').width > w, beforeZoom);
    chk('zooming re-renders at a higher resolution rather than scaling pixels',
        await page.evaluate((w) => document.querySelector('.pdfv-canvas').width > w, beforeZoom)
        && /125%/.test(await page.locator('.pdfv-zoomv').innerText()));

    // Arrow keys page it — the only route for a keyboard user, and expected of
    // anything that shows a page number.
    await page.locator('.pdfv').press('ArrowRight');
    await page.waitForFunction(() => /Page 3 of 3/.test(document.querySelector('.pdfv-count').textContent));
    chk('arrow keys turn the page', /Page 3 of 3/.test(await page.locator('.pdfv-count').innerText()));
    chk('…and stop at the last page', await page.locator('.pdfv-pg[disabled]').count() === 1);

    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.pdfv-btn, .pdfv-pg')]
        .filter(el => el.getBoundingClientRect().height < 44).length);
    chk('every viewer control is at least 44px tall', small === 0);

    /* A document that cannot be opened must SAY WHICH failure it was. "Could
       not open" covers a missing file, a password and a corrupt file, and a
       reader can act on exactly one of those. */
    const missing = await page.evaluate(() => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.id = 'missing-host';
      ReactDOM.createRoot(host).render(
        React.createElement(window.NggPdf, { src: '/tests/_no-such-file.pdf', name: 'gone.pdf', pages: 2 }));
      return new Promise(r => setTimeout(() => r(true), 50));
    });
    await page.locator('#missing-host .pdfv-open').click();
    await page.waitForSelector('#missing-host .pdfv-fallback', { timeout: 30000 });
    chk('a document that is not there says so, and still offers the link',
        /could not be found/i.test(await page.locator('#missing-host .pdfv-fallback p').innerText())
        && await page.locator('#missing-host .pdfv-fallback a').count() === 1);

    chk('no page errors', errors.length === 0);
    if (errors.length) errors.forEach(e => console.log('    ' + e));
    await page.close();
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log(failed ? `\n❌ community documents: ${passed} passed, ${failed} failed`
                     : `\n✅ community documents: ${passed} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
