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
  window.__fail = new URLSearchParams(location.search).get('fail') || '';
  function offline() { var e = new Error('timeout'); e.code = 'timeout'; e.status = 0; return Promise.reject(e); }
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
  var ROSTER = { program: PROGRAM, cards: Array.from({ length: 30 }, function (_, i) {
    var n = i + 1;
    return { studentId: 'SUM-' + n, displayId: 'NGG/26/' + ('000' + n).slice(-4),
             firstName: (n === 7 ? 'ZEBRA' : 'NAME' + n), surname: 'SUR' + n,
             track: 'Arts', token: 'T' + n, photoUrl: '',
             centre: { name: n % 2 ? 'Ijaiye' : 'Egbeda', color: '#76B043' } };
  }) };
  window.NGGApi = deep({
    imageTools: function () {
      if (window.ImageTools) return Promise.resolve(window.ImageTools);
      return new Promise(function (res, rej) {
        var sc = document.getElementById('it') || document.createElement('script');
        sc.id = 'it'; sc.src = '/vendor/image-tools.js';
        sc.onload = function () { res(window.ImageTools); };
        sc.onerror = function () { rej(new Error('no image tools')); };
        if (!sc.parentNode) document.head.appendChild(sc);
      });
    },
    admin: deep({ registration: deep({
      cards: function () { return window.__fail === 'all' ? offline() : Promise.resolve(ROSTER); },
      volunteerCards: function () { return window.__fail === 'all' ? offline() : Promise.resolve({ program: PROGRAM, cards: [] }); },
      centres: function () { return Promise.resolve({ centres: [] }); },
      // A secondary endpoint failing must not take the roster down with it.
      hierarchy: function () { return window.__fail ? offline() : Promise.resolve({ tiers: [] }); },
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
  var props;
  if (b === 'photo') {
    var pc = document.createElement('canvas'); pc.width = 800; pc.height = 1000;
    var px = pc.getContext('2d');
    px.fillStyle = '#88a'; px.fillRect(0, 0, 800, 1000);
    px.fillStyle = '#fff'; px.beginPath(); px.arc(400, 380, 190, 0, 7); px.fill();
    props = { target: { subjectType: 'student', subjectId: 'SUM-1' }, currentUrl: pc.toDataURL('image/png'),
              title: 'Test', onSaved: function () {}, onClose: function () {} };
  } else { props = { setPage: function () {} }; }
  // Stand in for the export toolkit so a click can be traced all the way into
  // buildImpositionPDF without rasterising anything.
  if (b === 'cards') {
    window.__pdf = [];
    var face = { dataUrl: 'data:image/jpeg;base64,x', wPx: 10, hPx: 12, bleedPx: 1, trimWPx: 8, trimHPx: 10, bytes: new Uint8Array([1]) };
    window.CardExport = {
      scaleForDpi: function () { return 2; },
      nodeToImage: function () { return Promise.resolve(face); },
      renderFace: function () { return new Promise(function (r) { setTimeout(function () { r(face); }, 25); }); },
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

  fs.writeFileSync(path.join(ROOT, 'tests', '_upload_fixture.html'),
    '<!doctype html><html><body><script src="/dist/api-client.js"></script></body></html>');

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

    // ── paging keeps the roster out of the DOM ───────────────────────────
    // html2canvas clones the whole document per capture, so what is mounted
    // sets the price of every face. A 30-card roster must not all be drawn.
    const boxes = studio.locator('.card-pair input[type=checkbox]');
    const bar = () => studio.evaluate(() => document.body.innerText);
    ok('/cards draws one page, not the whole roster (' + await boxes.count() + ' of 30)', await boxes.count() === 24);
    ok('/cards shows the paging position', /1–24 of 30 · page 1\/2/.test(await bar()));
    ok('/cards defaults to exporting everyone', /All 30 cards will export/.test(await bar()));

    // ── search + bulk selection ──────────────────────────────────────────
    await studio.locator('input[placeholder*="Search"]').fill('ZEBRA');
    await studio.waitForTimeout(150);
    ok('/cards search narrows the roster', await boxes.count() === 1 && /1 match/.test(await bar()));
    await studio.getByRole('button', { name: 'Untick these' }).click();
    ok('/cards can untick everything the search matched', /29 of 30 selected/.test(await bar()));
    await studio.getByRole('button', { name: 'Tick these', exact: true }).click();
    ok('/cards can tick everything the search matched', /All 30 cards will export/.test(await bar()));
    await studio.getByRole('button', { name: 'Clear search' }).click();
    await studio.waitForTimeout(150);

    // ── selection survives paging ────────────────────────────────────────
    await boxes.nth(1).uncheck();
    ok('/cards counts the selection after unticking', /29 of 30 selected/.test(await bar()));
    await studio.getByRole('button', { name: /Next →/ }).click();
    await studio.waitForTimeout(200);
    ok('/cards page 2 holds the remainder', await boxes.count() === 6);
    await boxes.nth(0).uncheck();
    ok('/cards keeps a selection made on another page', /28 of 30 selected/.test(await bar()));
    await studio.getByRole('button', { name: 'Clear', exact: true }).click();
    const disabled = await studio.evaluate(() =>
      Array.from(document.querySelectorAll('button')).filter(b => /Print-ready PDF|PNG \(all/.test(b.textContent || '')).every(b => b.disabled));
    ok('/cards disables both exports when nothing is selected', disabled);
    await studio.getByRole('button', { name: 'Select all' }).click();

    // ── the run: isolated host, batched output ───────────────────────────
    await studio.evaluate(() => {
      const cps = Array.from(document.querySelectorAll('select'))
        .find(x => Array.from(x.options).some(o => o.value === '100'));
      const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      set.call(cps, '100'); cps.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await studio.getByRole('button', { name: /Print-ready PDF/ }).click();
    await studio.waitForTimeout(400);
    // Mid-run the preview grid must be gone — that is the whole point.
    const midRun = await studio.evaluate(() => ({
      zone: document.querySelectorAll('.print-zone').length,
      pairs: document.querySelectorAll('.card-pair').length,
      progress: /\d+ \/ \d+/.test(document.body.innerText),
    }));
    ok('the preview grid is unmounted while rendering (pairs in DOM: ' + midRun.pairs + ')',
      midRun.zone === 0 && midRun.pairs <= 1);
    ok('a run reports progress', midRun.progress);
    await studio.waitForFunction(() => window.__pdf.length >= 1 && !/Rendering|Batch|Building|Preparing/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    const built = await studio.evaluate(() => window.__pdf);
    ok('a 30-card run splits into batches of 100→one file, honouring the cap ('
      + JSON.stringify(built) + ')', built.length === 1 && built[0].fronts === 30 && built[0].backs === 30);
    await studio.waitForSelector('.print-zone', { timeout: 20000 }).catch(() => {});
    ok('the grid comes back after the run', await studio.locator('.print-zone').count() === 1);
    await studio.close();

    // ── a partial load must not blank the studio ─────────────────────────
    const part = await browser.newPage();
    await part.goto(BASE + '/tests/_boards_fixture.html?board=cards&mode=ok&fail=one', { waitUntil: 'networkidle' });
    await part.waitForTimeout(700);
    const partTxt = await part.evaluate(() => document.body.innerText);
    ok('one failing endpoint still renders the roster',
      await part.locator('.card-pair input[type=checkbox]').count() === 24 && /didn.t load/.test(partTxt));
    await part.close();

    // ── and a total outage says so plainly ───────────────────────────────
    const down = await browser.newPage();
    await down.goto(BASE + '/tests/_boards_fixture.html?board=cards&mode=ok&fail=all', { waitUntil: 'networkidle' });
    await down.waitForTimeout(700);
    const downTxt = await down.evaluate(() => document.body.innerText);
    ok('a server outage says the server is unreachable, not that nothing exists',
      /Can't reach the server/.test(downTxt) && /isn.t your device/.test(downTxt));
    await down.close();

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

    // ── Studio: a real editor that does not touch Cloudinary ─────────────
    await pe.getByRole('tab', { name: 'Studio' }).click();
    await pe.waitForSelector('.cropper-container', { timeout: 15000 }).catch(() => {});
    ok('Studio boots Cropper.js on the device', await pe.locator('.cropper-container').count() === 1);
    const studioCtl = await pe.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
    ok('Studio offers rotate, flip and reset', ['90°', 'Flip', 'Reset'].every(t => studioCtl.some(x => x.indexOf(t) !== -1)));
    const sliders = await pe.locator('input[type=range]').count();
    ok('Studio offers straighten plus the three tone controls', sliders === 4);

    // rotateTo is absolute, so driving it from the straighten slider alone
    // would silently undo a 90° turn. Read Cropper's own state, not the DOM.
    const rotOf = () => pe.evaluate(() => {
      const el = document.querySelector('img[alt=Source]');
      return el && el.cropper ? el.cropper.getData().rotate : null;
    });
    await pe.getByRole('button', { name: /90°/ }).nth(1).click();
    const afterTurn = await rotOf();
    await pe.locator('input[type=range]').first().fill('6');
    await pe.waitForTimeout(150);
    const afterFine = await rotOf();
    const label = await pe.evaluate(() => document.body.innerText);
    ok('a 90° turn survives straightening (' + afterTurn + '° → ' + afterFine + '°)',
      afterTurn === 90 && afterFine === 96 && /\+90° turn/.test(label));

    // Leaving the tab must tear the instance down, not leak it.
    await pe.getByRole('tab', { name: 'Quick' }).click();
    await pe.waitForTimeout(200);
    ok('leaving Studio destroys the cropper', await pe.locator('.cropper-container').count() === 0);
    await pe.close();

    // ── upload shrinking ─────────────────────────────────────────────────
    const shrink = await (async () => {
      const p2 = await browser.newPage();
      await p2.goto(BASE + '/tests/_boards_fixture.html?board=photo&mode=ok', { waitUntil: 'networkidle' });
      const out = await p2.evaluate(async () => {
        const T = await window.NGGApi.imageTools();
        const c = document.createElement('canvas'); c.width = 3200; c.height = 2400;
        const x = c.getContext('2d');
        for (let i = 0; i < 3200; i += 6) { x.fillStyle = i % 12 ? '#eee' : '#333'; x.fillRect(i, 0, 3, 2400); }
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
        const f = new File([blob], 'p.jpg', { type: 'image/jpeg' });
        const big = await T.prepare(f, { maxPx: 1600, quality: 0.86 });
        const sc = document.createElement('canvas'); sc.width = 300; sc.height = 400;
        sc.getContext('2d').fillRect(0, 0, 300, 400);
        const sblob = await new Promise(r => sc.toBlob(r, 'image/jpeg', 0.8));
        const small = await T.prepare(new File([sblob], 's.jpg', { type: 'image/jpeg' }), { maxPx: 1600 });
        return { before: f.size, after: big.after, w: big.width, skipped: big.skipped, smallSkipped: small.skipped };
      });
      await p2.close();
      return out;
    })();
    ok('a phone-sized photo is resampled before upload (' + Math.round(shrink.before / 1024) + 'KB → ' + Math.round(shrink.after / 1024) + 'KB, ' + shrink.w + 'px wide)',
      !shrink.skipped && shrink.w === 1600 && shrink.after < shrink.before / 2);
    ok('an already-small image is left alone (no needless re-encode)', shrink.smallSkipped);

    // ── and the upload path actually uses it ─────────────────────────────
    // Measuring the library in isolation would still pass if uploadFile sent
    // the original, so this drives the real client and weighs what leaves.
    const up = await browser.newPage();
    let sentBytes = 0;
    await up.route('**/api/public/upload-headshot-sign.php', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, apiKey: 'k', timestamp: 1, signature: 's', folder: 'f',
        uploadUrl: BASE + '/__upload_sink' }),
    }));
    await up.route('**/__upload_sink', (route) => {
      const buf = route.request().postDataBuffer();
      sentBytes = buf ? buf.length : 0;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', public_id: 'a' }) });
    });
    await up.goto(BASE + '/tests/_upload_fixture.html', { waitUntil: 'networkidle' });
    const orig = await up.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 3200; c.height = 2400;
      const x = c.getContext('2d');
      for (let i = 0; i < 3200; i += 6) { x.fillStyle = i % 12 ? '#eee' : '#333'; x.fillRect(i, 0, 3, 2400); }
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
      const f = new File([blob], 'big.jpg', { type: 'image/jpeg' });
      await window.NGGApi.uploadFile(f, 'headshot');
      return f.size;
    });
    await up.close();
    ok('uploadFile puts the resampled image on the wire, not the original ('
      + Math.round(orig / 1024) + 'KB → ' + Math.round(sentBytes / 1024) + 'KB sent)',
      sentBytes > 0 && sentBytes < orig / 2);
  } catch (e) { fail++; console.error('  ✗ harness error: ' + (e && e.message)); }
  finally { if (browser) await browser.close(); try { process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(FIX); } catch (_) {}
    try { fs.unlinkSync(path.join(ROOT, 'tests', '_upload_fixture.html')); } catch (_) {}  }

  console.log((fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed (UI smoke: boards + card studio)');
  process.exit(fail ? 1 : 0);
})();
