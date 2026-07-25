#!/usr/bin/env node
/* ============================================================================
   UI smoke test — the two live boards and the ID Card Studio.

   `node build.js` only transforms JSX; it happily ships a component that
   references an identifier that no longer exists, which then blanks the page
   at runtime. This mounts the real production bundle against a stubbed NGGApi
   and checks what the build cannot:

     /status, /v-status — mount clean, render real numbers, and when the origin
       is unreachable show an honest "can't reach the server" state, a working
       Retry, and no pile-up of overlapping requests.
     /cards            — the studio mounts clean with all its print controls,
       so a change to the export options can't blank the page.

   Run:  node tests/ui-smoke.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, BOARDS_PORT (default 8198).
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.BOARDS_PORT || 8198;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_boards_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

const STATUS = {
  status: {
    kpis: { totalStudents: 120, presentToday: 96, lateToday: 4, attendanceRate: 80, fulfillmentRate: 72,
            totalNeed: 50, totalFilled: 36, totalGap: 14, onTimeToday: 92 },
    byCentre: [{ centreId: 'IJ', name: 'Ijaiye', need: 20, filled: 14, gap: 6, present: 30, enrolled: 40, rate: 75 }],
    directory: [], deltas: {}, page: { published: true },
  },
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  boards: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  // Mount the built bundle directly: React, a stubbed NGGApi, then render the
  // board under test into a root div. No API, no router, no service worker.
  fs.writeFileSync(FIX, `<!doctype html><html><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script>
  window.__calls = { status: 0, volunteerStatus: 0 };
  window.__mode = new URLSearchParams(location.search).get('mode') || 'ok';
  var pending = [];
  function stub(name, payload) {
    return function () {
      window.__calls[name]++;
      if (window.__mode === 'ok') return Promise.resolve(payload);
      if (window.__mode === 'hang') return new Promise(function (res) { pending.push(res); });
      var e = new Error('timeout'); e.code = 'timeout'; e.status = 0;
      return Promise.reject(e);
    };
  }
  // The pages pull in shared chrome (Footer et al) and, for the studio, a tree
  // of admin endpoints. Any path not named below resolves empty, so unrelated
  // chrome can never fail an assertion; only the two board calls are counted.
  function deep(over) {
    return new Proxy(function () { return Promise.resolve({}); }, {
      get: function (t, k) {
        if (over && Object.prototype.hasOwnProperty.call(over, k)) return over[k];
        if (k === 'then' || typeof k === 'symbol') return undefined;
        return deep();
      },
      apply: function () { return Promise.resolve({}); },
    });
  }
  window.NGGApi = deep({ public: deep({
    status: stub('status', ${JSON.stringify(STATUS)}),
    volunteerStatus: stub('volunteerStatus', ${JSON.stringify(STATUS)}),
  }) });
  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
</script>
<script src="/dist/app.min.js"></script>
<script>
  var b = new URLSearchParams(location.search).get('board');
  var which = b === 'vol' ? 'VolunteerStatusPage' : b === 'cards' ? 'CardStudio' : 'StatusPage';
  try {
    ReactDOM.createRoot(document.getElementById('root'))
      .render(React.createElement(window[which], { setPage: function () {} }));
  } catch (e) { window.__errors.push(String(e && e.message)); }
</script></body></html>`);

  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1000));
  let pass = 0, fail = 0;
  const ok = (l, c) => { c ? pass++ : (fail++, console.error('  ✗ ' + l)); };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

    for (const board of ['status', 'vol']) {
      const label = board === 'vol' ? '/v-status' : '/status';

      // ── renders with data ────────────────────────────────────────────────
      let page = await browser.newPage();
      const consoleErrs = [];
      // Script errors only — a missing favicon under php -S is not a defect.
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrs.push(m.text()); });
      page.on('pageerror', e => consoleErrs.push(String(e.message)));
      await page.goto(BASE + '/tests/_boards_fixture.html?board=' + board + '&mode=ok', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1600);   // let the count-up animation settle
      const body = await page.evaluate(() => document.body.innerText);
      const errs = await page.evaluate(() => window.__errors);
      ok(label + ' mounts with no script error', errs.length === 0 && consoleErrs.length === 0);
      if (errs.length || consoleErrs.length) console.error('      ', errs.concat(consoleErrs).slice(0, 3).join(' | '));
      ok(label + ' renders live numbers, not an error state', body.indexOf("couldn't load") === -1 && body.indexOf("can't reach") === -1 && /\d/.test(body));
      await page.close();

      // ── unreachable origin ───────────────────────────────────────────────
      page = await browser.newPage();
      await page.goto(BASE + '/tests/_boards_fixture.html?board=' + board + '&mode=fail', { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const failBody = await page.evaluate(() => document.body.innerText);
      ok(label + ' says the server is unreachable, not "your device"', /can't reach the server/i.test(failBody));
      // The retry button must work and must not be wired to a stale binding.
      const before = await page.evaluate(() => window.__calls);
      await page.getByRole('button', { name: /retry/i }).first().click();
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => window.__calls);
      const key = board === 'vol' ? 'volunteerStatus' : 'status';
      ok(label + ' Retry re-fetches (' + before[key] + ' → ' + after[key] + ')', after[key] > before[key]);
      await page.close();

      // ── no request pile-up while a call is in flight ─────────────────────
      page = await browser.newPage();
      await page.goto(BASE + '/tests/_boards_fixture.html?board=' + board + '&mode=hang', { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const n0 = await page.evaluate((k) => window.__calls[k], key);
      // Hammer the refresh control: with a request already hanging, none of
      // these may open another one.
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /retry|refresh/i.test(x.textContent || ''));
          if (b) b.click();
        });
      }
      await page.waitForTimeout(300);
      const n1 = await page.evaluate((k) => window.__calls[k], key);
      ok(label + ' does not stack requests while one is in flight (' + n0 + ' → ' + n1 + ')', n1 === n0);
      await page.close();
    }

    // ── ID Card Studio: mounts with its print controls intact ──────────────
    const studio = await browser.newPage();
    const studioErrs = [];
    studio.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) studioErrs.push(m.text()); });
    studio.on('pageerror', e => studioErrs.push(String(e.message)));
    await studio.goto(BASE + '/tests/_boards_fixture.html?board=cards&mode=ok', { waitUntil: 'networkidle' });
    await studio.waitForTimeout(900);
    const sErrs = await studio.evaluate(() => window.__errors);
    ok('/cards studio mounts with no script error', sErrs.length === 0 && studioErrs.length === 0);
    if (sErrs.length || studioErrs.length) console.error('       ', sErrs.concat(studioErrs).slice(0, 3).join(' | '));
    const opts = await studio.evaluate(() =>
      Array.from(document.querySelectorAll('select')).map(s => Array.from(s.options).map(o => o.value).join('|')));
    ok('/cards exposes the layout, flip and resolution controls', opts.some(o => /imposed\|1up/.test(o))
      && opts.some(o => /long-edge\|short-edge\|none/.test(o))
      && opts.some(o => /300\|350\|600/.test(o)));
    const copy = await studio.evaluate(() => document.body.innerText);
    ok('/cards explains the selected flip on the page', /work-and-turn/i.test(copy));
    await studio.close();
  } catch (e) { fail++; console.error('  ✗ harness error: ' + (e && e.message)); }
  finally { if (browser) await browser.close(); try { process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(FIX); } catch (_) {} }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (UI smoke: boards + card studio)');
  process.exit(fail ? 1 : 0);
})();
