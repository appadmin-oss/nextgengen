#!/usr/bin/env node
/* ============================================================================
   The landing page's poster images, drawn by the maker's own renderer.

   LANDING.md §3: the images are the real <TimetablePoster> at its print size,
   never a mock. This host has no browser, so they cannot be drawn by the
   build; this script draws them on a machine that has one, and they are
   committed under assets/timetable/landing/:

     style-<look>.png   1744 × 1232, the fallback and the Open Graph image
     style-<look>.webp  the same pixels, which is what the page loads first

   The sample is the maker's own sample school week plus Egbeda's Saturday
   sessions, as a member would have it, on a Monday morning. Paper colours,
   landscape grid, one image per style.

   Run:  npm run build:ttposters   (then commit the ten files)
   ========================================================================== */
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { waitForServer, waitForBoot } = require('../../../../tests/_serve');

const ROOT = path.resolve(__dirname, '../../../..');
const OUT = path.join(ROOT, 'assets/timetable/landing');
const PORT = process.env.TT_POSTERS_PORT || '8296';
const BASE = 'http://127.0.0.1:' + PORT;
const SIZE = [1744, 1232];

/* The repo's own playwright-core first: a global 'playwright' of another
   version is not what the test suites run against. */
function chromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  throw new Error('playwright is not installed');
}
function executable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
  return d ? '/opt/pw-browsers/' + d + '/chrome-linux/chrome' : undefined;
}

/*
 * The poster's faces come from Google Fonts, and the images are only true if
 * they arrive. Behind an outbound proxy (HTTPS_PROXY), Chromium's cross-origin
 * font fetches can fail where an ordinary client succeeds, and a face that
 * fails is drawn in a fallback without a word. So there, the page's font
 * requests are answered from here, through curl, which honours the proxy and
 * its certificate bundle the way the rest of the machine does.
 */
const FONT_TYPES = { css: 'text/css; charset=utf-8', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf' };
async function routeFontsThroughCurl(page) {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async route => {
    const url = route.request().url();
    try {
      const body = execFileSync('curl', ['-sfL', '--max-time', '30', '-A', route.request().headers()['user-agent'] || 'Mozilla/5.0', url], { maxBuffer: 8 << 20 });
      const ext = /fonts\.googleapis\.com/.test(url) ? 'css' : (/\.(\w+)(?:\?|$)/.exec(url) || [])[1];
      await route.fulfill({ status: 200, body, headers: { 'content-type': FONT_TYPES[ext] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
    } catch (_) {
      await route.abort();
    }
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // The page only needs the renderer, not the API, so no config is written.
  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(BASE);
    browser = await chromium().launch({ executablePath: executable() });
    // 1600 css px at this scale is 1744 device px: the poster at its print size, sampled once.
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: SIZE[0] / 1600, timezoneId: 'Africa/Lagos' });
    if (process.env.HTTPS_PROXY || process.env.https_proxy) await routeFontsThroughCurl(page);
    // ?mode= opens the maker rather than the landing; nothing it saves matters here.
    await page.goto(BASE + '/timetable?mode=school', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForSelector('.tt-app', { timeout: 60000 });

    for (const look of await page.evaluate(() => TT_LOOK_IDS)) {
      await page.evaluate(async lk => {
        const now = new Date('2026-10-05T10:40:00');
        const o = (title, start, end, place, color, mine) => ({ id: ttUid(), title, days: [6], start, end, place, color, kind: ttKindOf({ title }), official: true, source: 'Egbeda', mine: !!mine });
        const doc = ttClean({
          s: { title: 'Tobi’s week', subtitle: 'JSS2 · Term 1, plus NGG Egbeda on Saturdays', theme: 'paper', look: lk, layout: 'timeline', orient: 'landscape', legend: true, fold: true },
          entries: ttSampleWeek().concat([o('Chess', '10:00', '11:00', 'Main hall', 0), o('Coding', '11:00', '12:30', 'ICT room', 6, true),
            o('Public speaking', '12:30', '13:30', 'Main hall', 5), o('Anchor Journal', '13:30', '14:00', 'Main hall', 2)]),
          ex: {},
        });
        let host = document.getElementById('tt-lp-shot');
        if (host) { host.__root.unmount(); host.remove(); }
        host = document.createElement('div');
        host.id = 'tt-lp-shot';
        host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647';
        document.body.appendChild(host);
        host.__root = ReactDOM.createRoot(host);
        // today: the preview's highlight, as the reference captures show it.
        host.__root.render(React.createElement(TimetablePoster, { model: ttPosterModel(doc, { kind: 'poster', orient: 'landscape', paper: 'a4', today: true, now }) }));
        const want = TT_LOOKS[lk].families.concat(['Sora', 'JetBrains Mono']);
        await ttFontsReady(lk);
        await Promise.all(want.map(f => document.fonts.load("16px '" + f + "'").catch(() => [])));
        await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        // document.fonts.check() answers true for a family with no face at all,
        // so ask for a face of each family that has actually loaded.
        const loaded = new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
        const missing = want.filter(f => !loaded.has(f));
        if (missing.length) throw new Error(lk + ': these faces did not load, so the image would show a fallback: ' + missing.join(', '));
      }, look);
      const shot = await page.locator('#tt-lp-shot .tt-pos').screenshot({ type: 'png' });
      // Resample to the exact size and encode both formats in the browser, which writes WebP.
      const files = await page.evaluate(async ({ b64, w, h }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, w, h);
        return { png: c.toDataURL('image/png').split(',')[1], webp: c.toDataURL('image/webp', 0.9).split(',')[1] };
      }, { b64: shot.toString('base64'), w: SIZE[0], h: SIZE[1] });
      for (const x of ['png', 'webp']) fs.writeFileSync(path.join(OUT, 'style-' + look + '.' + x), Buffer.from(files[x], 'base64'));
      console.log('  ✓ style-' + look + ' (' + (Buffer.from(files.webp, 'base64').length / 1024).toFixed(0) + ' KB webp)');
    }
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    try { process.kill(-server.pid); } catch (_) {}
  }
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
