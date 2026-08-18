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

  /* A real Cloudinary PDF url — image resource type, `.pdf` still on the end,
     which is what the fixed upload path now produces. */
  const PDF = 'https://res.cloudinary.com/demo/image/upload/v1/ngg/community/handout_abc.pdf';

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
    React.createElement(window.NggPdf, { src: ${JSON.stringify(PDF)}, name: 'Week 3 handout.pdf', pages: 9, bytes: 842000 })
  );
</script>
</body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE, 15000);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
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
        && await page.locator('.pdfv-img').count() === 0);
    chk('…naming the file and what it costs to open',
        /Week 3 handout\.pdf/.test(await page.locator('.pdfv-open-name').innerText())
        && /PDF · 9 pages · 822 KB/.test(await page.locator('.pdfv-open-meta').innerText()));

    await page.locator('.pdfv-open').click();
    /* `attached`, not `visible`. What is under test is the URL this viewer
       asks Cloudinary for; whether the sandbox running the test can reach
       Cloudinary to paint it is not this suite's business, and asserting on
       visibility makes a network outage look like a broken viewer. */
    await page.waitForSelector('.pdfv-img', { state: 'attached' });

    const src1 = await page.locator('.pdfv-img').getAttribute('src');
    chk('opening it renders page 1 as an image, not a document frame',
        /\/pg_1,/.test(src1) && /\.jpg$/.test(src1) && await page.locator('.pdfv-frame').count() === 0);
    chk('the page count is shown', /Page 1 of 9/.test(await page.locator('.pdfv-count').innerText()));
    chk('there is no way back past page 1', await page.locator('.pdfv-pg[disabled]').count() === 1);

    await page.locator('.pdfv-pg').last().click();
    await page.waitForFunction(() => /pg_2,/.test(document.querySelector('.pdfv-img').src));
    chk('turning the page fetches the next page, only then',
        /\/pg_2,/.test(await page.locator('.pdfv-img').getAttribute('src'))
        && /Page 2 of 9/.test(await page.locator('.pdfv-count').innerText()));

    chk('the real document is always one tap away',
        await page.locator('.pdfv-bar a[href$=".pdf"]').count() >= 1);

    // Expanding asks for more pixels, because that is the point of expanding.
    await page.locator('.pdfv-btn', { hasText: 'Expand' }).click();
    await page.waitForFunction(() => /w_1400/.test(document.querySelector('.pdfv-img').src));
    chk('expanding requests a larger page', /w_1400/.test(await page.locator('.pdfv-img').getAttribute('src')));

    /* Every control a thumb has to hit clears 44px — the community's rule,
       and this viewer is read on a 390px phone. */
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.pdfv-btn, .pdfv-pg')]
        .filter(el => el.getBoundingClientRect().height < 44).length);
    chk('every viewer control is at least 44px tall', small === 0);

    // A non-PDF document must NOT claim to be previewable.
    const cardOnly = await page.evaluate((pdf) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      ReactDOM.createRoot(host).render(
        React.createElement(window.NggPdf, { src: pdf.replace('.pdf', '.docx'), name: 'notes.docx' }));
      return new Promise(r => setTimeout(() => r(host.innerHTML), 60));
    }, PDF);
    chk('a document with no page images falls back rather than pretending',
        /pdfv-open/.test(cardOnly));

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
