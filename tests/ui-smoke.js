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
  var PROGRAM = { program: 'NGG', year: '2026', motto: 'GROW', website: 'x.org', phone: '+234', widthMm: 54, heightMm: 75 };
  var ROSTER = { program: PROGRAM, cards: [1, 2, 3].map(function (n) {
    return { studentId: 'SUM-' + n, displayId: 'NGG/26/000' + n, firstName: 'NAME' + n, surname: 'SUR' + n,
             track: 'Arts', token: 'T' + n, photoUrl: '', centre: { name: 'Ijaiye', color: '#76B043' } };
  }) };
  window.NGGApi = deep({
    admin: deep({ registration: deep({
      cards: function () { return Promise.resolve(ROSTER); },
      volunteerCards: function () { return Promise.resolve({ program: PROGRAM, cards: [] }); },
      centres: function () { return Promise.resolve({ centres: [] }); },
      hierarchy: function () { return Promise.resolve({ tiers: [] }); },
    }) }),
    public: deep({
    status: stub('status', ${JSON.stringify(STATUS)}),
    volunteerStatus: stub('volunteerStatus', ${JSON.stringify(STATUS)}),
  }) });
  window.__errors = [];
  window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
</script>
<script src="/dist/app.min.js"></script>
<script>
  var b = new URLSearchParams(location.search).get('board');
  var which = b === 'vol' ? 'VolunteerStatusPage' : b === 'cards' ? 'CardStudio' : b === 'photo' ? 'PhotoEditor' : 'StatusPage';
  var props = b === 'photo'
    ? { target: { subjectType: 'student', subjectId: 'SUM-1' }, currentUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
        title: 'Test', onSaved: function () {}, onClose: function () {} }
    : { setPage: function () {} };
  // Stand in for the export toolkit so a click can be traced all the way into
  // buildImpositionPDF without rasterising anything.
  if (b === 'cards') {
    window.__pdf = [];
    var face = { dataUrl: 'data:image/jpeg;base64,x', wPx: 10, hPx: 12, bleedPx: 1, trimWPx: 8, trimHPx: 10, bytes: new Uint8Array([1]) };
    window.CardExport = {
      scaleForDpi: function () { return 2; },
      nodeToImage: function () { return Promise.resolve(face); },
      renderFace: function () { return Promise.resolve(face); },
      zipStore: function () { return Promise.resolve(new Uint8Array([80, 75])); },
      buildImpositionPDF: function (fronts, o) {
        window.__pdf.push({ fronts: fronts.length, backs: (o && o.backs || []).length });
        return Promise.resolve(new Uint8Array([37, 80, 68, 70]));
      },
      download: function () {},
    };
  }
  try {
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window[which], props));
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

    // ── choosing which cards to export ───────────────────────────────────
    const boxes = studio.locator('.card-pair input[type=checkbox]');
    ok('/cards renders the roster with a tick per card', await boxes.count() === 3);
    const bar = () => studio.evaluate(() => document.body.innerText);
    ok('/cards defaults to exporting everyone', /All 3 cards will export/.test(await bar()));
    await boxes.nth(1).uncheck();
    ok('/cards counts the selection after unticking', /2 of 3 selected/.test(await bar()));
    const offCount = () => studio.locator('.card-pair[data-sel="0"]').count();
    ok('/cards marks the excluded card so print skips it', await offCount() === 1);
    ok('/cards shows the count on the PDF button', /Print-ready PDF \(2\)/.test(await bar()));
    await studio.getByRole('button', { name: 'Clear' }).click();
    ok('/cards can clear the whole selection', await offCount() === 3);
    const disabled = await studio.evaluate(() =>
      Array.from(document.querySelectorAll('button')).filter(b => /Print-ready PDF|PNG \(all/.test(b.textContent || '')).every(b => b.disabled));
    ok('/cards disables both exports when nothing is selected', disabled);
    await studio.getByRole('button', { name: 'Select all' }).click();
    ok('/cards restores everyone with Select all', /All 3 cards will export/.test(await bar()) && await offCount() === 0);

    // The selection has to reach the exporter, not just the chrome.
    await boxes.nth(0).uncheck();
    await studio.getByRole('button', { name: /Print-ready PDF/ }).click();
    await studio.waitForFunction(() => window.__pdf.length > 0, null, { timeout: 20000 }).catch(() => {});
    const built = await studio.evaluate(() => window.__pdf);
    ok('/cards exports only the selected cards (' + JSON.stringify(built) + ')',
      built.length === 1 && built[0].fronts === 2 && built[0].backs === 2);
    await studio.close();

    // ── photo editor: zoom works, and previews without a round trip ──────
    const pe = await browser.newPage();
    const peErrs = [];
    pe.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) peErrs.push(m.text()); });
    pe.on('pageerror', e => peErrs.push(String(e.message)));
    await pe.goto(BASE + '/tests/_boards_fixture.html?board=photo&mode=ok', { waitUntil: 'networkidle' });
    await pe.waitForTimeout(500);
    ok('photo editor mounts with no script error', peErrs.length === 0);

    const tf = await pe.evaluate(() => {
      const f = window.buildEditTransform;
      const at = (z, g) => f({ gravity: g || 'center', zoom: z }, false);
      return {
        z15: at(1.5), z10: at(1.0), face: at(2, 'face'),
        baseSame: f({ gravity: 'center', zoom: 1 }, true) === f({ gravity: 'center', zoom: 2.4 }, true),
        anyPixelFraction: [1.001, 1.01, 2.5, 9].some((z) => {
          const m = /c_crop,g_\w+,w_([\d.]+)/.exec(at(z));
          return m && parseFloat(m[1]) >= 1;
        }),
      };
    });
    // z_ is a silent no-op in this chain, verified against Cloudinary — a zoom
    // built with it moves the slider and changes nothing.
    ok('zoom crops instead of emitting the no-op z_', /^c_crop,g_center,w_0\.667,h_0\.667\//.test(tf.z15) && tf.z15.indexOf('z_') === -1);
    ok('zoom 1x adds no crop', tf.z10.indexOf('c_crop') === -1);
    ok('zoom works for a detected-object gravity too', /^c_crop,g_face,w_0\.5,h_0\.5\//.test(tf.face));
    ok('crop fraction stays a ratio, never pixels', !tf.anyPixelFraction);
    ok('the preview base excludes zoom, so the slider needs no refetch', tf.baseSame);

    const slider = pe.locator('input[type=range]');
    ok('zoom slider offers only the range that can act (1–2.5)',
      await slider.getAttribute('min') === '1' && await slider.getAttribute('max') === '2.5');
    const shot = () => pe.evaluate(() => {
      const im = document.querySelector('img[alt=Preview]');
      return im ? { src: im.getAttribute('src'), tr: im.style.transform, origin: im.style.transformOrigin } : null;
    });
    const before = await shot();
    await slider.fill('1.8');
    await pe.waitForTimeout(150);
    const after = await shot();
    ok('dragging zoom changes the preview immediately', before && after && before.tr !== after.tr && /scale\(1.8\)/.test(after.tr));
    ok('…without swapping the image (no network round trip)', before.src === after.src);
    await pe.close();
  } catch (e) { fail++; console.error('  ✗ harness error: ' + (e && e.message)); }
  finally { if (browser) await browser.close(); try { process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(FIX); } catch (_) {} }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (UI smoke: boards + card studio)');
  process.exit(fail ? 1 : 0);
})();
