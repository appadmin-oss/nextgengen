#!/usr/bin/env node
/* ============================================================================
   The dashboard's URL subtree — /dashboard/account, /records, /requests.

   The overview stays one scroll of cards, because that is the glance that
   answers "what do I owe, what is due today". What needed addresses is the
   self-service work: a member emailing the desk wants to send a link to their
   statement, and a back button that leaves the page is not a back button.

   So the properties worth pinning are the ones a hand-rolled router gets wrong:
     · a deep link opens the section it names, not the default
     · choosing a section changes the address, without reloading
     · Back returns to the previous SECTION, not to the previous PAGE
     · an address nobody defined falls back rather than rendering nothing

   The router is mounted out of the built bundle with no API and no session —
   it is a function of the URL, which is exactly what makes it testable.

   Run:  node tests/dashboard-routing.test.js
   Skips with a pass if playwright isn't installed, like the other E2E tests.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.DASH_ROUTE_PORT || 8257;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_dash_route_fixture.html');

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  dashboard routing: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  /* The fixture is served FROM the dashboard subtree so the router sees a real
     /dashboard/... path. A query string carries which one, because the fixture
     file itself has to keep its own name. */
  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#fff}</style>
</head><body><div id="shot"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script>window.NGGApi = { admin: {}, public: {} };</script>
<script src="/dist/app.min.js"></script><script src="/dist/app-more.min.js"></script>
<script>
var e = React.createElement;
/* Put the address bar where the test asked BEFORE the router reads it, so this
   is a genuine deep link and not a navigation after mount. */
var want = new URLSearchParams(location.search).get('at');
if (want) history.replaceState({}, '', want);

function Harness() {
  var r = window.useDashSection();
  var section = r[0], go = r[1];
  window.__section = section;
  return e('div', null,
    e(window.DashSectionTabs, { section: section, go: go, openRequests: 2 }),
    e('div', { id: 'body', 'data-section': section }, section));
}
ReactDOM.createRoot(document.getElementById('shot')).render(e(Harness));
setTimeout(function () { document.body.setAttribute('data-ready', '1'); }, 200);
</script></body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE);
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const open = async (at) => {
      await page.goto(BASE + '/tests/_dash_route_fixture.html' + (at ? '?at=' + encodeURIComponent(at) : ''),
        { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.dataset.ready === '1');
    };
    const section = () => page.getAttribute('#body', 'data-section');
    const url = () => page.evaluate(() => location.pathname);

    // ── Deep links ──
    await open('/dashboard');
    chk('/dashboard opens the overview', await section() === 'overview');
    await open('/dashboard/account');
    chk('/dashboard/account opens the account, not the default', await section() === 'account');
    await open('/dashboard/records');
    chk('/dashboard/records opens the records', await section() === 'records');
    await open('/dashboard/requests');
    chk('/dashboard/requests opens the requests', await section() === 'requests');
    await open('/dashboard/nonsense');
    chk('an address nobody defined falls back to the overview rather than rendering nothing',
      await section() === 'overview');

    // ── Navigating ──
    await open('/dashboard');
    await page.locator('button', { hasText: 'Money & account' }).click();
    await page.waitForTimeout(120);
    chk('choosing a section changes the address bar', await url() === '/dashboard/account');
    chk('…and the rendered section with it', await section() === 'account');
    chk('…without reloading the page',
      await page.evaluate(() => document.body.dataset.ready === '1'));

    await page.locator('button', { hasText: 'Records' }).click();
    await page.waitForTimeout(120);
    chk('a second choice moves again', await url() === '/dashboard/records' && await section() === 'records');

    // ── Back ──
    await page.goBack();
    await page.waitForTimeout(150);
    chk('Back returns to the previous SECTION, not the previous page',
      await url() === '/dashboard/account' && await section() === 'account');
    await page.goBack();
    await page.waitForTimeout(150);
    chk('…and again, to the overview', await section() === 'overview');
    await page.goForward();
    await page.waitForTimeout(150);
    chk('Forward works too — the history is real, not simulated', await section() === 'account');

    // ── The tab strip itself ──
    await open('/dashboard/requests');
    chk('the current tab says so to a screen reader, not only in colour',
      await page.getAttribute('button[aria-current="page"]', 'aria-current') === 'page'
      && (await page.innerText('button[aria-current="page"]')).includes('Requests'));
    chk('an open-request count rides on the tab, so it is visible from any section',
      (await page.innerText('.dash-tabs')).includes('2'));

    await page.close();
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (dashboard routing)');
  process.exit(failed === 0 ? 0 : 1);
})();
