#!/usr/bin/env node
/**
 * The ID designer, driven in a real browser against the real vendored libraries.
 *
 * The point of this suite is the joins, not the widgets. Three third-party
 * libraries were vendored and one of them was rebuilt by hand, so the questions
 * worth asking are: does anything actually load, do two canvas libraries
 * co-exist, does the schema still describe the cards we already print, and does
 * the same renderer that draws the preview draw the print file.
 *
 *   node tests/designer.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8477;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_designer_fixture.html');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
async function waitForServer(url, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    try { const r = await fetch(url + '/index.html'); if (r.ok || r.status === 404) return; } catch (_) {}
    if (Date.now() - t0 > ms) throw new Error('server did not start');
    await new Promise(r => setTimeout(r, 200));
  }
}

/* A page with the bundle and nothing else — no auth, no API. The designer
   fetches its libraries itself, which is the behaviour under test. */
fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
</head><body>
<!-- app.jsx mounts the whole SPA into #root as the bundle loads, unconditionally.
     It needs to exist (createRoot throws on a missing container) and it must not
     be the container this fixture renders into, or two roots write to one div. -->
<div id="root" hidden></div>
<div id="dsn-root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/qrcode.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script>
  window.__errors = [];
  window.addEventListener('error', e => window.__errors.push(String(e.message)));
  var CARDS = [
    { studentId: 'S1', displayId: 'NGG/26/0001', firstName: 'Amina', surname: 'Alpha', handle: 'amina',
      track: 'Piano', faculty: 'Music', token: 'T1', photoUrl: '',
      centre: { name: 'Egbeda', code: 'EG', color: '#D64545' } },
    { studentId: 'S2', displayId: 'NGG/26/0002', firstName: 'Chidi', surname: 'Oyelaran-Oyeyinka',
      handle: 'chidi', track: 'Graphics', faculty: 'Media', token: 'T2', photoUrl: '',
      centre: { name: 'Ikotun-Egbe Community Hall', code: 'IEC', color: '#F7E36B' } },
  ];
  function P(v) { return function () { return Promise.resolve(v); }; }
  window.__saved = null;
  /* Everything not named below resolves to {} rather than being undefined —
     the shell renders a Footer that reads NGGApi.public.session, and an
     undefined stub there throws inside a component we are not testing. */
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
  window.NGGApi = deep({ admin: deep({ registration: {
    /* Stateful, like the real endpoint: after a save the new design is in the
       list. A stub that always returns [] leaves the picker with no option
       matching the id the screen just adopted, so it renders empty — which is
       the fixture lying, not the screen misbehaving. */
    templates: function () { return Promise.resolve({ templates: window.__tplList || [] }); },
    cards: P({ cards: CARDS }),
    volunteerCards: P({ cards: [] }),
    /* Mirrors the server's fork rule rather than always returning the same id:
       saving a sys- design creates a copy, and the screen has to say so. */
    templateSave: function (id, t) {
      window.__saved = { id: id, t: t };
      var forked = !id || /^sys-/.test(id);
      var newId = forked ? 'ctpl-test1' : id;
      window.__tplList = [{ templateId: newId, name: t.name, kind: t.kind, status: 'draft', version: 1 }];
      return Promise.resolve({ ok: true, templateId: newId, forked: forked });
    },
    templatePublish: P({ ok: true, version: 1 }),
  } }), public: deep({}) });
</script>
<script src="/dist/app.min.js"></script>
<script>
  /* AFTER the bundle: auth.jsx assigns window.useAuth as it loads, so a stub set
     before it is simply overwritten — the page then renders "staff sign-in
     required" and nothing else, which looks like a broken designer rather than a
     stub that lost a race. */
  window.useAuth = function () { return { isSignedIn: true, openSignIn: function () {} }; };
  /* Same reason: safety.jsx assigns window.toast and window.dialog as the bundle
     loads, so stubs set before it are silently replaced and every message the
     screen produces goes to a toast host that is not mounted. */
  window.toast = { success: function (m) { (window.__said = window.__said || []).push(String(m)); },
                   error: function (m) { (window.__bad = window.__bad || []).push(String(m)); } };
  window.dialog = { confirm: function () { return Promise.resolve(true); } };
  /* NOT #root: app.jsx mounts the whole SPA into that id as the bundle loads, so
     a fixture sharing it gets two React roots writing to one container — the
     designer, then the app's error boundary underneath it. */
  ReactDOM.createRoot(document.getElementById('dsn-root')).render(React.createElement(window.DesignerPage));
</script>
</body></html>`);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('· playwright not installed — skipping'); process.exit(0); }
  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  let pass = 0, fail = 0;
  const ok = (label, cond) => { cond ? pass++ : (fail++, console.error('  ✗ ' + label)); if (cond) console.log('  ✓ ' + label); };
  let browser;
  try {
    await waitForServer(BASE);
    const exe = process.env.CHROMIUM_PATH
      || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
    browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message)));

    /* ── 1. Nothing heavy is in the bundle ──────────────────────────────────
       Two megabytes of design library must not reach a coordinator on 3G who
       never opens this screen. Asserted on the WIRE, not on intent. */
    const wire = [];
    page.on('request', r => wire.push(r.url()));
    await page.goto(BASE + '/tests/_designer_fixture.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const heavy = (u) => /fabric|filerobot|tui-/.test(u);
    ok('the app bundle carries none of the design libraries',
      !wire.filter(u => u.includes('/app.min.js')).some(heavy)
      && wire.filter(heavy).length <= 1);            // fabric only, and only because this page IS the designer
    ok('…and the service worker does not precache them',
      !fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').match(/fabric|filerobot|tui-image/));

    /* ── 2. Fabric loads on its own and the canvas appears ──────────────── */
    await page.waitForFunction(() => !!window.fabric, { timeout: 20000 });
    ok('fabric loads on demand, from our own /vendor', await page.evaluate(() => !!window.fabric));
    ok('…served by us, not a CDN', wire.some(u => u.endsWith('/vendor/fabric.min.js') && u.startsWith(BASE)));
    await page.selectOption('select[aria-label="Open a design"]', 'sys-volunteer-front');
    await page.waitForTimeout(1200);
    ok('a design opens and draws on a canvas',
      (await page.locator('.dsn-canvas-host canvas').count()) >= 1);
    ok('the designer mounts with no script error', errs.length === 0);
    if (errs.length) console.error('       ', errs.slice(0, 3).join(' | '));

    /* ── 3. The schema can express the cards we already print ───────────────
       This is the acceptance test for the whole design. If the standard
       volunteer card cannot be described as a template, the schema is wrong and
       no amount of editor makes up for it. */
    const shape = await page.evaluate(() => {
      const t = window.TPL_SYSTEM.find(x => x.id === 'sys-volunteer-front');
      const r = window.tplResolve(t, {
        firstName: 'Tunde', surname: 'Bakare', displayId: 'VOL-LED-26-001', role: 'Lead Mentor',
        faculty: 'Music', token: 'V1', expiresAt: '2026-10-29',
        centre: { name: 'Egbeda', code: 'EG', color: '#D64545' },
        tier: { name: 'Lead Mentor', code: 'LED', color: '#8A1538' },
      });
      const by = {}; r.elements.forEach(e => { by[e.id] = e; });
      return { bg: r.background, surname: by.surname.text, role: by.role.text,
               band: by.band.text, pill: by.pill.fill, ink: by.band.color,
               problems: window.tplPreflight(t, [], window.TPL_REQUIRED.volunteer) };
    });
    ok('the standard volunteer card survives the round trip through the schema',
      shape.bg === '#D64545' && shape.surname === 'BAKARE'
      && shape.role === 'LEAD MENTOR · MUSIC' && /^EG {2}·{1} {2}EGBEDA$/.test(shape.band)
      && shape.pill === '#8A1538');
    /* The ink rule survives binding too: a pale centre must flip the band to
       dark ink, and it must do so from the DATA, because the colour is picked
       after the template is drawn. */
    const paleInk = await page.evaluate(() => {
      const t = window.TPL_SYSTEM.find(x => x.id === 'sys-volunteer-front');
      const dark = window.tplResolve(t, { centre: { color: '#0A2A6E' }, tier: {} });
      const pale = window.tplResolve(t, { centre: { color: '#F7E36B' }, tier: {} });
      const f = (r) => r.elements.find(e => e.id === 'band').color;
      return { dark: f(dark), pale: f(pale) };
    });
    ok('…including ink chosen from whatever colour an admin picks later',
      paleInk.dark === '#fff' && paleInk.pale === '#10131a');
    /* The standard card must pass the rule that guards printing it. The first
       version of this check refused it — an invented 18mm floor on the OVERALL
       code size, against a card whose 9mm QR the gate kiosks read every day. */
    ok('…and it passes the rule that guards printing it',
      shape.problems.filter(p => p.level === 'error').length === 0);

    /* ── 4. Preflight refuses what a print run cannot survive ─────────────── */
    const flight = await page.evaluate(() => {
      const base = window.TPL_SYSTEM.find(x => x.id === 'sys-student-front');
      const clone = () => JSON.parse(JSON.stringify(base));
      const noQr = clone(); noQr.elements = noQr.elements.filter(e => e.type !== 'qr');
      const tiny = clone(); tiny.elements.find(e => e.type === 'qr').w = 40;
      tiny.elements.find(e => e.type === 'qr').h = 40;
      const msgs = (t) => window.tplPreflight(t, [], window.TPL_REQUIRED.student)
        .filter(p => p.level === 'error').map(p => p.message).join(' | ');
      // The check only real data can answer.
      const longName = window.tplPreflight(base, [{ surname: 'Oyelaran-Oyeyinka-Abiodun-Babatunde', token: 'T', displayId: 'X' }],
        window.TPL_REQUIRED.student).filter(p => p.level === 'warn').map(p => p.message).join(' | ');
      return { noQr: msgs(noQr), tiny: msgs(tiny), longName };
    });
    ok('preflight names a missing field rather than letting it print blank',
      /token/.test(flight.noQr));
    ok('…and a QR whose squares are too small for a camera', /per square/.test(flight.tiny));
    ok('…and a name that only fits at the minimum size, from the REAL roster',
      /only fits at the minimum size/.test(flight.longName));

    /* ── 5. One renderer, three scales ──────────────────────────────────────
       The export is the same function that drew the preview, at a multiplier —
       not a screenshot of the screen. Asserted by rendering the same template at
       two scales and checking the pixel dimensions follow. */
    const render = await page.evaluate(async () => {
      const t = window.TPL_SYSTEM.find(x => x.id === 'sys-student-front');
      const row = { firstName: 'Amina', surname: 'Alpha', displayId: 'NGG/26/0001', token: 'T1',
                    centre: { name: 'Egbeda', code: 'EG', color: '#D64545' } };
      const out = {};
      for (const [key, scale] of [['screen', 0.7], ['print', (54 / 25.4 * 300) / 590]]) {
        const c = new window.fabric.StaticCanvas(document.createElement('canvas'));
        await window.tplToFabric(window.tplResolve(t, row), window.fabric, c, { scale, qrUrl: window.dsnQrUrl });
        out[key] = { w: c.getWidth(), h: c.getHeight(), objects: c.getObjects().length };
        c.dispose();
      }
      return out;
    });
    ok('the same renderer produces the screen proof and the print file',
      render.screen.objects === render.print.objects && render.screen.objects >= 8);
    ok('…and 300 DPI on a 54mm card really is 638 pixels wide (' + render.print.w + ')',
      Math.abs(render.print.w - 638) <= 2);

    /* ── 6. Two canvas libraries in one page ────────────────────────────────
       The hazard everyone expects from vendoring TUI beside Fabric: TUI 3.15
       needs Fabric 4 and the designer uses Fabric 7. It turns out TUI bundles
       its own copy inside its webpack closure and never touches window.fabric —
       which is worth an assertion, because if a future version stops doing that
       the designer breaks in a way that looks like a Fabric bug. */
    const coexist = await page.evaluate(async () => {
      const before = window.fabric.version;
      await window.loadVendor('tui');
      const after = window.fabric.version;
      // And Fabric 7 must still WORK, not merely report its version: a stale
      // reference with a downgraded global would pass a version check and throw
      // on the next call.
      let usable = false;
      try { usable = new window.fabric.Rect({ width: 10, height: 10 }).type === 'rect'; } catch (_) {}
      return { before, after, usable, tui: !!(window.tui && window.tui.ImageEditor) };
    });
    ok('TUI loads beside Fabric 7 without downgrading window.fabric (' + coexist.after + ')',
      coexist.tui === true && coexist.after === coexist.before && /^7\./.test(coexist.after) && coexist.usable);

    /* ── 7. Filerobot uses OUR React ────────────────────────────────────────
       vendor-build.js aliases react/react-dom to the page globals. If that ever
       silently stops working the symptom is a blank panel, not an error, so the
       assertion is that exactly one React exists after loading it. */
    const fr = await page.evaluate(async () => {
      const v = window.React.version;
      await window.loadVendor('filerobot');
      return { v, after: window.React.version, ctor: typeof window.FilerobotImageEditor };
    });
    ok('filerobot loads against the page\'s own React ' + fr.after + ', not a second copy',
      fr.ctor === 'function' && fr.after === fr.v);

    /* ── 8. Editing writes to the template, and saving sends it ─────────── */
    await page.evaluate(() => {
      const sel = document.querySelectorAll('.dsn-layer');
      const band = Array.from(sel).find(b => /band/.test(b.textContent));
      if (band) band.click();
    });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(400);
    const saved = await page.evaluate(() => window.__saved);
    ok('saving sends the template, bindings and all',
      !!saved && saved.t && saved.t.kind === 'volunteer'
      && saved.t.elements.some(e => e.text === '{{surname}}')
      && saved.t.elements.some(e => e.type === 'qr'));
    /* Asserted on what the screen DID, not on the message it showed. `toast` is a
       top-level binding in the bundle, so a stubbed window.toast is shadowed —
       and bending the production code so a test can read a string would be
       testing the test. What matters is that the standard design's own id went
       up (so the server can fork it) and the forked id came back and was
       adopted, which is what stops the next save overwriting the original. */
    const after = await page.evaluate(() => ({
      sent: window.__saved && window.__saved.id,
      adopted: document.querySelector('select[aria-label="Open a design"]').value,
    }));
    ok('…and a standard design is saved as a copy, not over the original',
      after.sent === 'sys-volunteer-front' && after.adopted === 'ctpl-test1');

    ok('no uncaught page errors across the whole session', errs.length === 0);
    if (errs.length) console.error('       ', errs.slice(0, 4).join(' | '));
    await page.close();
  } catch (e) {
    fail++; console.error('  ✗ harness: ' + (e && e.message));
  } finally {
    if (browser) await browser.close();
    srv.kill();
    try { if (!process.env.KEEP_FIX) fs.unlinkSync(FIX); } catch (_) {}
  }
  console.log(`\n${fail ? '❌' : '✅'} DESIGNER: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
