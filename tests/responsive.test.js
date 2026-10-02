#!/usr/bin/env node
/* ============================================================================
   The public site, measured at the widths people actually hold it at.

   Two failures, both invisible to every other suite we have, and both of which
   this codebase has already shipped once:

   1. CLIPPED CONTENT. `styles.css` sets `overflow-x: hidden` globally, so
      `document.documentElement.scrollWidth` is pinned to the viewport no
      matter what a child element does. The obvious overflow check therefore
      passes while content sits off the side of the screen — not scrollable,
      unreachable. The /about page shipped four hard two-column grids past
      exactly that check. So the measurement here is `document.body.scrollWidth`
      plus a count of elements whose right edge is past the viewport, which is
      what the mask cannot hide.

   2. TOUCH TARGETS UNDER 44px. `tests/dashboard-shot.js` has asserted this for
      the member dashboard for a while and caught a real regression there. The
      public site — the part a parent opens on a phone from a WhatsApp link —
      had nothing equivalent, which is why its topnav sat at 38px unnoticed
      while the dashboard's 36px tabs were found and fixed.

   WHAT IS DELIBERATELY NOT ASSERTED: pixel positions, screenshots, or anything
   that pins a layout. A responsive suite that fails when a designer moves a
   card is a suite people delete. These two measurements are contracts — reach
   and reachability — not opinions about arrangement.

   Run:  node tests/responsive.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const { PROBE, WIDTHS, chromiumPath, loadChromium } = require('./_responsive-probe');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RESP_PORT || 8227;
const BASE = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

/* The public routes, read from the ROUTES registry rather than hand-listed —
   CLAUDE.md §11: a second list of pages drifts, and a responsive suite that
   silently stops covering a new page is worse than one that never covered it.
   Own-chrome and noindex surfaces are excluded: they are staff tools behind a
   sign-in, they have their own suites, and several cannot render at all
   without a session. */
function publicRoutes() {
  const src = fs.readFileSync(path.join(ROOT, 'app.jsx'), 'utf8');
  const block = src.slice(src.indexOf('const ROUTES = ['), src.indexOf('\n];', src.indexOf('const ROUTES = [')));
  const out = [];
  for (const line of block.split('\n')) {
    const m = line.match(/\{\s*id:\s*"([^"]+)"/);
    if (!m) continue;
    if (/chrome:\s*"own"/.test(line)) continue;
    if (/index:\s*false/.test(line)) continue;
    if (/addressable:\s*false/.test(line)) continue;
    out.push(m[1]);
  }
  return out;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  responsive: skipped (playwright not installed)'); process.exit(0); }
  const exe = chromiumPath(fs);
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('  ✗ dist/ missing — run node build.js first'); process.exit(1);
  }

  const routes = publicRoutes();
  console.log('Sweeping ' + routes.length + ' public route(s) × ' + WIDTHS.length + ' widths\n');

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', path.join(ROOT, 'dist')], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  const clipped = [], tiny = [];
  try {
    await waitForServer(BASE, 20000);
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

    for (const vp of WIDTHS) {
      console.log('  ' + vp.label);
      /* hasTouch/isMobile so `(pointer: coarse)` MATCHES. The 44px floor is
         raised under that query — the same rule the studios already use — so a
         run without touch emulation would measure the mouse layout and pass
         while a phone still could not hit anything. */
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h },
                                           hasTouch: vp.w < 900, isMobile: vp.w < 900 });
      /* `php -S` has no SPA fallback, so each route is reached the way a
         visitor reaches it — through the router — which also exercises the
         router rather than only the component. */
      await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
      await page.waitForSelector('main', { timeout: 20000 });

      for (const id of routes) {
        await page.evaluate((r) => window.__navigate(r), id);
        await page.waitForTimeout(260);
        // Scroll-reveal starts sections at opacity 0; settle them so nothing
        // is measured mid-transition.
        await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-visible')));
        await page.waitForTimeout(90);
        const r = await page.evaluate(PROBE, { sel: '.page *, .topnav *, .footer *', floor: 44 });

        /* Asserted on the STRAY LIST, not on body.scrollWidth.
         *
         * scrollWidth counts the closed mobile drawer, which is parked
         * off-canvas at left:100% by design and clipped by its own wrapper —
         * so it reports a page as overflowing that is perfectly fine, and a
         * suite that cries wolf on every page is a suite nobody reads. The
         * stray list asks the question that actually matters: is any CONTENT
         * past the edge with nothing clipping it. That is what caught this
         * page's four two-column grids, and it is what is asserted.
         *
         * The body figure rides along in the report as context for whoever is
         * debugging a real one. */
        if (r.strays.length) {
          clipped.push({ id, w: vp.w, body: r.body, vw: r.vw, n: r.strays.length, sample: r.strays.slice(0, 3) });
        }
        if (r.small.length) {
          tiny.push({ id, w: vp.w, sample: r.small.slice(0, 4), n: r.small.length });
        }
      }
      await page.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }

  console.log('');
  /* Reported per page rather than as one number: "17 problems" is a number to
     feel bad about, a named page at a named width is something to open. */
  ok('nothing is clipped off the side of any public page', clipped.length === 0);
  for (const c of clipped.slice(0, 12)) {
    console.error('      /' + c.id + ' @' + c.w + 'px — ' + c.n + ' element(s) past the edge (body ' + c.body + 'px vs ' + c.vw + 'px)');
    c.sample.forEach(s => console.error('         · ' + s));
  }

  ok('every standalone control on every public page meets the 44px touch floor', tiny.length === 0);
  for (const t of tiny.slice(0, 12)) {
    console.error('      /' + t.id + ' @' + t.w + 'px — ' + t.n + ' control(s)');
    t.sample.forEach(s => console.error('         · ' + s));
  }

  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (responsive)');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
