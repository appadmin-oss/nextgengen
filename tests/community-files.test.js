#!/usr/bin/env node
/* ============================================================================
   Files in a channel — turn 4A.

   The screen exists to answer one question honestly: what will this cost me?
   Members are on metered data, so the parts worth testing are not the layout,
   they are the promises:

     · nothing over the 5 MB threshold transfers before somebody taps twice,
       and the sheet that intervenes states the figure in megabytes;
     · a file saved offline is really in Cache Storage, and the row says so;
     · a format this app cannot render says so instead of opening a blank
       rectangle;
     · the grouping and the counts come from the server, so the chip that
       reads "Docs 2" and the list under it cannot disagree.

   Run:  node tests/community-files.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FILES_PORT || 8221;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_files_fixture.html');

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

/* The server's answer, verbatim in shape — grouping and counts included, since
   the client is deliberately not allowed to re-derive either. The urls are real
   files in this repo so "save offline" has something it can actually cache. */
const FILES = {
  ok: true,
  channel: { slug: 'studio', name: 'Studio · Music' },
  counts: { all: 4, doc: 2, image: 1, video: 1 },
  files: [
    { postId: 'CP-1', kind: 'doc', format: 'pdf', name: 'Showcase running order.pdf',
      url: '/tests/_fixture-handout.pdf', poster: '', bytes: 389120, pages: 6, duration: 0,
      pinned: true, group: 'pinned', note: 'Running order for the showcase',
      author: { name: 'Coach Bisi', centre: 'Egbeda', isMe: false, photo: '' },
      createdAt: '2026-08-18 09:00:00' },
    { postId: 'CP-2', kind: 'video', format: 'mp4', name: 'Market recording — take 3.mp4',
      url: '/tests/_fixture-clip.mp4', poster: '', bytes: 18874368, pages: 0, duration: 252,
      pinned: false, group: 'week', note: '',
      author: { name: 'Adaeze O.', centre: 'Egbeda', isMe: false, photo: '' },
      createdAt: '2026-08-18 08:00:00' },
    { postId: 'CP-3', kind: 'image', format: 'jpg', name: 'IMG_2481.jpg',
      url: '/tests/_fixture-photo.png', poster: '', bytes: 2100000, pages: 0, duration: 0,
      pinned: false, group: 'week', note: 'Zara marking the eight rows.',
      author: { name: 'Nneka E.', centre: 'Egbeda', isMe: false, photo: '' },
      createdAt: '2026-08-17 18:12:00' },
    { postId: 'CP-4', kind: 'doc', format: 'xlsx', name: 'Hall costs — August.xlsx',
      url: '/tests/_fixture-costs.xlsx', poster: '', bytes: 43008, pages: 0, duration: 0,
      pinned: false, group: 'older', note: '',
      author: { name: 'Mr Adewale', centre: 'Egbeda', isMe: false, photo: '' },
      createdAt: '2026-07-02 10:00:00' },
  ],
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  community files: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  // Small real files so a cache write has bytes to write.
  fs.writeFileSync(path.join(ROOT, 'tests', '_fixture-costs.xlsx'), 'not-really-a-spreadsheet');
  fs.writeFileSync(path.join(ROOT, 'tests', '_fixture-photo.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  fs.writeFileSync(path.join(ROOT, 'tests', '_fixture-clip.mp4'), 'not-really-a-clip');

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fff}</style>
</head><body class="cm-app"><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  // The screen under test talks to one endpoint. Stub it, so the test is about
  // the screen and not about a database.
  window.__filesPayload = ${JSON.stringify(FILES)};
  NGGApi.member.community.files = () => Promise.resolve(window.__filesPayload);
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(window.CmFiles, { slug: 'studio', channelName: 'Studio · Music', onBack: () => {} })
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
    await page.goto(BASE + '/tests/_files_fixture.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('.cmm-file', { timeout: 10000 });

    chk('the screen renders without a page error', errors.length === 0);
    chk('every file in the channel gets a row', await page.locator('.cmm-file').count() === 4);

    /* Grouping is the server's answer, rendered in its order. */
    const heads = await page.locator('.cmm-list-h').allInnerTexts();
    chk('rows are grouped pinned → this week → older',
        heads.join('|') === 'PINNED BY MENTORS|THIS WEEK|OLDER');

    /* The counts describe the whole channel even while a filter is on, so the
       chips can say "Docs 2" and be right about it. */
    const chips = await page.locator('.cm-chip, .cmm-chip').allInnerTexts();
    chk('the chips carry the channel-wide counts',
        chips.join(' ').includes('4') && chips.join(' ').includes('2'));

    /* THE promise. 18 MB may not begin transferring on a tap. */
    const beforeTap = requested.filter(u => /_fixture-clip/.test(u)).length;
    await page.locator('.cmm-file-main').nth(1).click();
    await page.waitForSelector('.cmm-cost', { timeout: 5000 });
    chk('an 18 MB video does not start transferring on the first tap',
        requested.filter(u => /_fixture-clip/.test(u)).length === beforeTap);
    const cost = await page.locator('.cmm-cost').innerText();
    chk('…the sheet states the cost in megabytes', /18 MB/.test(cost));
    chk('…and offers the data-saver figure as the alternative', /Data saver/.test(cost) && /6\.3 MB|6 MB|6\.\d MB/.test(cost));
    chk('…and the ask-first rule is a preference the member can turn off',
        await page.locator('.cmm-check input').isChecked() === true);
    await page.keyboard.press('Escape');

    /* A small file has nothing to warn about and simply opens. */
    chk('only the file over the threshold is badged for Wi-Fi',
        await page.locator('.cmm-file-wifi').count() === 1);

    /* No dead ends: a spreadsheet says so rather than opening blank. */
    await page.locator('.cmm-file-main').nth(3).click();
    await page.waitForSelector('.cmm-cost', { timeout: 5000 });
    chk('a format this app cannot render says so, and offers what does work',
        /No preview for XLSX/i.test(await page.locator('.cmm-cost').innerText())
        && await page.locator('.cmm-cost a').count() === 1);
    await page.keyboard.press('Escape');

    /* Offline is real: Cache Storage, and the row then says so. */
    await page.locator('.cmm-file-more').first().click();
    await page.waitForSelector('.cmm-act-row', { timeout: 5000 });
    const saveRow = page.locator('.cmm-act-row', { hasText: 'Save offline' });
    chk('the actions sheet offers to save the file offline', await saveRow.count() === 1);
    await saveRow.first().click();
    await page.waitForSelector('.cmm-off-bar', { timeout: 10000 });
    chk('saving it really writes to Cache Storage', await page.evaluate(async () => {
      const c = await caches.open('ngg-files-v1');
      const keys = await c.keys();
      return keys.some(k => /_fixture-handout\.pdf/.test(k.url));
    }));
    chk('…and the screen says how much is now available with no data',
        /saved offline/.test(await page.locator('.cmm-off-bar').innerText()));
    chk('…and the row itself is marked offline',
        await page.locator('.cmm-file-off').count() >= 1);

    /* A saved file must open without asking about cost — it costs nothing. */
    const photo = page.locator('.cmm-file-main').nth(2);
    await photo.click();
    await page.waitForSelector('.cmm-photo', { timeout: 5000 });
    chk('a photo opens full screen with its position in the set',
        /1 \/ 1/.test(await page.locator('.cmm-photo-n').innerText()));
    chk('…portalled to <body>, so no transformed ancestor can capture it',
        await page.evaluate(() => {
          const el = document.querySelector('.cmm-photo');
          return !!el && el.parentElement === document.body;
        }));
    chk('…and it really fills the screen', await page.evaluate(() => {
      const r = document.querySelector('.cmm-photo').getBoundingClientRect();
      return Math.round(r.width) === window.innerWidth && Math.round(r.height) === window.innerHeight;
    }));

    /* ── Opening a photo ──
       The one screen in this app built entirely around metered data, and the
       likeliest outcome of a tap on it is "the network dropped". That was the
       one outcome the viewer could not say: a black rectangle, a caption, and
       a spinner that never resolved. */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.route('**/_fixture-photo.png', r => r.abort());
    const photoRow = page.locator('.cmm-file', { hasText: 'IMG_2481' }).locator('.cmm-file-main');
    await photoRow.click();
    await page.waitForTimeout(1200);
    const failText = await page.evaluate(() => {
      const f = document.querySelector('.cmm-photo-fail');
      return f ? f.innerText.replace(/\n+/g, ' ') : '';
    });
    chk('a photo that will not load says so, rather than showing black forever',
        /didn.t load/i.test(failText));
    chk('…says it cost nothing, which is the thing a metered reader needs',
        /Nothing was used up/i.test(failText));
    chk('…and offers a retry and a way out',
        /Try again/.test(failText) && /Open it in the browser/.test(failText));
    /* Primary-on-dark is amber. .cmm-cta is navy on white, and on this scrim
       it rendered as a navy box on a navy field — under the 3:1 that WCAG
       1.4.11 asks of a UI component. */
    chk('…and the retry button is visible against the dark viewer',
        await page.evaluate(() => {
          const b = document.querySelector('.cmm-photo-fail-acts .cmm-cta');
          if (!b) return false;
          const bg = getComputedStyle(b).backgroundColor;
          const m = bg.match(/\d+/g).map(Number);
          // relative luminance, sRGB
          const L = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          const lum = 0.2126 * L(m[0]) + 0.7152 * L(m[1]) + 0.0722 * L(m[2]);
          const scrim = 0.2126 * L(11) + 0.7152 * L(15) + 0.0722 * L(28);
          const ratio = (Math.max(lum, scrim) + 0.05) / (Math.min(lum, scrim) + 0.05);
          return ratio >= 3;
        }));

    await page.unroute('**/_fixture-photo.png');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.cmm-photo-fail-acts button')]
        .find(x => /Try again/.test(x.textContent));
      if (b) b.click();
    });
    await page.waitForTimeout(1200);
    chk('…and Try again really re-fetches it',
        await page.evaluate(() => !document.querySelector('.cmm-photo-fail')));

    chk('no page errors across the whole run', errors.length === 0);
  } finally {
    await browser.close();
    server.kill();
    for (const f of [FIX, 'tests/_fixture-costs.xlsx', 'tests/_fixture-photo.png', 'tests/_fixture-clip.mp4']) {
      try { fs.unlinkSync(path.isAbsolute(f) ? f : path.join(ROOT, f)); } catch (_) {}
    }
  }

  console.log((failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (community files)');
  process.exit(failed ? 1 : 0);
})();
