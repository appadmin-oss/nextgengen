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
  window.NGGApi = deep({
    /* Real enough to drive the library path. The deep() proxy would hand back
       {} for these, so tools.prepare would be undefined and the upload would
       die in a catch whose toast goes to a host this fixture does not mount —
       invisible, and indistinguishable from "the feature did nothing". The
       resampler itself is covered in ui-smoke. */
    imageTools: function () {
      return Promise.resolve({
        prepare: function (file) { return Promise.resolve({ blob: file, width: 400, height: 300 }); },
      });
    },
    // No cloud in the fixture, so the library takes the local path.
    uploadFile: function () { return Promise.reject(new Error('uploads_disabled')); },
    admin: deep({ registration: {
    /* Stateful, like the real endpoint: after a save the new design is in the
       list. A stub that always returns [] leaves the picker with no option
       matching the id the screen just adopted, so it renders empty — which is
       the fixture lying, not the screen misbehaving. */
    templates: function () { return Promise.resolve({ templates: window.__tplList || [] }); },
    cards: P({ cards: CARDS }),
    volunteerCards: P({ cards: [] }),
    /* The merge roster. Deliberately NOT the same list as cards(): the whole
       point of the merge read is that it sees people the card payload cannot,
       so MRG-3 has no token and MRG-2 has no photograph. Filtering is asserted
       on the server; here we only record what the screen asked for. */
    mergeRows: function (f) {
      window.__mergeQuery = f;
      return Promise.resolve({
        ok: true, audience: (f && f.audience) || 'students', total: 3, matched: 3, truncated: false,
        // As the real endpoint answers: the LIST ceiling, the RUN ceiling, and
        // the order actually applied. They are three different numbers and the
        // picker reads all three.
        limit: 2000, runMax: 600,
        sort: (f && f.sort) || 'name', dir: (f && f.dir) || 'asc',
        facets: { centres: ['Egbeda', 'Ijaiye'], tracks: ['Coding', 'Piano'], roles: [], maxAttended: 9 },
        rows: [
          { key: 'MRG-1', studentId: 'MRG-1', displayId: 'NGG-26-0101', firstName: 'Amina', surname: 'Alpha',
            track: 'Piano', token: 'MT1', photoUrl: '', attended: 9, enrolledAt: '2026-06-01T09:00:00Z',
            centre: { name: 'Egbeda', code: 'EG', color: '#D64545' } },
          { key: 'MRG-2', studentId: 'MRG-2', displayId: 'NGG-26-0102', firstName: 'Bola', surname: 'Beta',
            track: 'Coding', token: 'MT2', photoUrl: '', attended: 4, enrolledAt: '2026-06-02T09:00:00Z',
            centre: { name: 'Ijaiye', code: 'IJ', color: '#76B043' } },
          { key: 'MRG-3', studentId: 'MRG-3', displayId: 'NGG-26-0103', firstName: 'Chidi', surname: 'Gamma',
            track: 'Piano', token: '', photoUrl: '', attended: 0, enrolledAt: '2026-06-03T09:00:00Z',
            centre: { name: 'Egbeda', code: 'EG', color: '#D64545' } },
        ],
      });
    },
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
    /* The asset library, stateful like the real one: upload puts a row in and
       the list returns it, so "place from the library" can be driven end to
       end. Deduping is asserted on the server; here we only need it to behave. */
    assets: function () { return Promise.resolve({ assets: window.__assets || [], folders: [], total: 0, bytes: 0 }); },
    assetUpload: function (d) {
      window.__uploaded = d;
      var a = { assetId: 'ast-1', name: d.name, url: '/api/public/photo.php?p=deadbeef.png',
                folder: d.folder, width: 400, height: 300, bytes: 1234, local: !!d.dataUrl };
      window.__assets = [a];
      return Promise.resolve({ ok: true, asset: a, deduped: false });
    },
  } }), public: deep({}) });
</script>
<script src="/dist/app.min.js"></script>
<script>
  /* AFTER the bundle: auth.jsx assigns window.useAuth as it loads, so a stub set
     before it is simply overwritten — the page then renders "staff sign-in
     required" and nothing else, which looks like a broken designer rather than a
     stub that lost a race. */
  window.useAuth = function () { return { isSignedIn: true, openSignIn: function () {} }; };
  /* NOT #root: app.jsx mounts the whole SPA into that id as the bundle loads, so
     a fixture sharing it gets two React roots writing to one container — the
     designer, then the app's error boundary underneath it.

     The REAL toast and dialog hosts, not stubs. "toast" and "dialog" are
     top-level bindings inside the bundle, so assigning window.toast here does
     not intercept anything the designer calls — it only looks like it does. The
     consequence is worse than a silent stub: dialog.confirm resolves through a
     listener set that a fixture without DialogHost never joins, so an awaited
     dialog.confirm never settles and the code under test simply stops, with no
     error and nothing on screen to say why. Mounting the hosts makes every
     message the screen produces a thing the test can read. */
  ReactDOM.createRoot(document.getElementById('dsn-root')).render(
    React.createElement(React.Fragment, null,
      React.createElement(window.DesignerPage),
      React.createElement(window.DialogHost),
      React.createElement(window.ToastHost)));
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

    /* ── 4b. …including type nobody can read ──────────────────────────────
       Preflight knew whether the QR would scan and whether type sat too near
       the trim. It did not know whether the type was LEGIBLE, so a volunteer
       card with its role line printed in the tier colour on a pill filled with
       the tier colour passed with zero errors and would publish. One wrong pick
       in a colour picker, 240 unreadable cards. */
    const ink = await page.evaluate(() => {
      const base = window.TPL_SYSTEM.find(x => x.id === 'sys-volunteer-front');
      const clone = () => JSON.parse(JSON.stringify(base));
      const errs = (t, rows) => window.tplPreflight(t, rows || [], window.TPL_REQUIRED.volunteer)
        .filter(p => p.level === 'error').map(p => p.message).join(' | ');
      const warns = (t, rows) => window.tplPreflight(t, rows || [], window.TPL_REQUIRED.volunteer)
        .filter(p => p.level === 'warn').map(p => p.message).join(' | ');

      // The exact mistake: the role line inked with the pill's own colour.
      const same = clone();
      same.elements.find(e => e.id === 'role').color = '{{tier.color}}';

      // Literal, and decidable with no roster at all: near-white on the panel.
      const pale = clone();
      pale.elements.find(e => e.id === 'surname').color = '#fdfdfd';

      // Only the DATA can answer this one: a tier colour that the template's
      // hard-coded ink does not read on.
      const bound = clone();
      // Chosen to land in the WARN band against this tier colour, so the check
      // proves the binding was resolved rather than that anything grey fails.
      bound.elements.find(e => e.id === 'role').color = '#a4a4a4';
      const boundRow = [{ surname: 'B', token: 'T', displayId: 'X',
                          centre: { color: '#00225F' }, tier: { color: '#8A1538' } }];

      // Type over a PHOTOGRAPH is unmeasurable, by us and by WCAG. It must not
      // be reported, or the check becomes noise people learn to skip past.
      const onPhoto = clone();
      const photo = onPhoto.elements.find(e => e.id === 'photo');
      onPhoto.elements.push({ id: 'over', type: 'text', x: photo.x + 10, y: photo.y + 10,
                              w: 100, h: 30, text: 'OVER', color: '#ffffff' });

      return { same: errs(same), pale: errs(pale), bound: warns(bound, boundRow),
               photo: errs(onPhoto) + ' | ' + warns(onPhoto) };
    });
    ok('preflight refuses text inked with the colour it sits on',
      /same colour as what it sits on/.test(ink.same));
    ok('…and text measured too pale against the panel under it',
      /measures 1\.0\d:1/.test(ink.pale) && /cannot be read/.test(ink.pale));
    ok('…and warns on a pair only the roster could resolve',
      /measures 3\.\d\d:1/.test(ink.bound) && /floor for text/.test(ink.bound));
    ok('…and says nothing about type over a photograph, which nobody can measure',
      !/OVER/.test(ink.photo));
    const sysErrs = await page.evaluate(() => window.TPL_SYSTEM
      .filter(t => t.kind !== 'graphic')
      .map(t => t.id + ': ' + window.tplPreflight(t, [], window.TPL_REQUIRED[t.kind] || [])
        .filter(p => p.level === 'error').map(p => p.message).join(' | '))
      .filter(l => !/: $/.test(l)));
    ok('…while every card we already print still passes it'
       + (sysErrs.length ? ' — ' + sysErrs.join('  //  ') : ''), sysErrs.length === 0);

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

    /* ── 9. It is not only an ID card designer ──────────────────────────────
       The whole product had been built around the summer programme; NGG has a
       poster to make, a certificate to award and a status to post, and none of
       those is a 54mm card with a QR on it. The credential rules must not apply
       to them, and — the part that was actually broken — the millimetre maths
       must come from the template's OWN trim size rather than from the width of
       an ID card. */
    const graphic = await page.evaluate(() => {
      const a4 = window.TPL_PRESETS.find(p => p.id === 'poster-a4');
      const t = window.dsnFromPreset(a4);
      const problems = window.tplPreflight(t, [], window.TPL_REQUIRED[t.kind] || []);
      const card = window.TPL_SYSTEM.find(x => x.id === 'sys-volunteer-front');
      return {
        kind: t.kind, wMm: t.wMm, hMm: t.hMm,
        // A starting design, not a blank rectangle.
        elements: t.elements.length,
        headline: !!t.elements.find(e => e.id === 'headline'),
        gradient: !!t.elements.find(e => e.fill && typeof e.fill === 'object'),
        errors: problems.filter(p => p.level === 'error').length,
        // 98 units is 9mm on a 54mm card and 23mm on a 210mm A4 sheet. One
        // constant for both is the bug this replaced.
        mmCard: window.tplMmPerUnit(card) * 98,
        mmA4: window.tplMmPerUnit(t) * 98,
        presets: window.TPL_PRESETS.length,
        brand: window.TPL_BRAND.colors.length,
      };
    });
    ok('a poster is a first-class design, not an ID card with the fields removed',
      graphic.kind === 'graphic' && graphic.wMm === 210 && graphic.hMm === 297
      && graphic.elements >= 6 && graphic.headline === true);
    ok('…and the credential rules do not fire on it (no QR is not an error)',
      graphic.errors === 0);
    ok('…while millimetres come from the design\'s own size, not from a card\'s',
      Math.abs(graphic.mmCard - 8.97) < 0.1 && Math.abs(graphic.mmA4 - 23.5) < 0.5);
    ok('…with ' + graphic.presets + ' sizes and an NGG brand palette of ' + graphic.brand,
      graphic.presets >= 10 && graphic.brand >= 6);
    ok('…and a gradient survives the schema as data, not as a library object',
      graphic.gradient === true);

    /* ── 10. The editor behaves like an editor ──────────────────────────────
       Undo, duplicate, align and free-hand strokes all have to round-trip
       through the template, because the template is what gets saved. A feature
       that only exists on the canvas is a feature that disappears on reload. */
    const editing = await page.evaluate(() => {
      const t = window.dsnFromPreset(window.TPL_PRESETS.find(p => p.id === 'social-sq'));
      // Alignment is pure maths on the document, so it can be checked directly.
      const el = t.elements.find(e => e.id === 'headline');
      const centred = Math.round((t.w - el.w) / 2);
      return { w: t.w, elW: el.w, centred, kind: t.kind };
    });
    ok('a social square is square and its content is centrable',
      editing.w === 1080 && editing.centred >= 0);

    // Free-hand strokes become path ELEMENTS, not a baked bitmap.
    const drew = await page.evaluate(async () => {
      const t = window.dsnFromPreset(window.TPL_PRESETS.find(p => p.id === 'social-sq'));
      t.elements.push({ id: 'ink', type: 'path', d: 'M 0 0 L 100 100 L 200 0', x: 100, y: 100, w: 200, h: 100,
                        stroke: '#E4155F', strokeWidth: 6, fill: 'none' });
      const c = new window.fabric.StaticCanvas(document.createElement('canvas'));
      await window.tplToFabric(window.tplResolve(t, {}), window.fabric, c, { scale: 0.4 });
      const p = c.getObjects().find(o => o.nggId === 'ink');
      const out = { drawn: !!p, type: p && p.type, stroke: p && p.stroke };
      c.dispose();
      return out;
    });
    ok('a free-hand stroke is a path element the renderer draws, not a bitmap',
      drew.drawn === true && drew.type === 'path' && drew.stroke === '#E4155F');

    // Locked and hidden are honoured by the renderer, not just by the UI.
    const state = await page.evaluate(async () => {
      const t = window.dsnFromPreset(window.TPL_PRESETS.find(p => p.id === 'poster-a4'));
      t.elements.find(e => e.id === 'headline').hidden = true;
      t.elements.find(e => e.id === 'body').locked = true;
      const c = new window.fabric.Canvas(document.createElement('canvas'));
      await window.tplToFabric(window.tplResolve(t, {}), window.fabric, c, { scale: 0.3, selectable: true });
      const ids = c.getObjects().map(o => o.nggId);
      const body = c.getObjects().find(o => o.nggId === 'body');
      const out = { hiddenGone: ids.indexOf('headline') === -1, lockedPresent: !!body, lockedFrozen: body && !body.selectable };
      c.dispose();
      return out;
    });
    ok('hidden means not drawn, and locked means drawn but not draggable',
      state.hiddenGone && state.lockedPresent && state.lockedFrozen);

    /* A PDF at the design's real trim size. The card studio's export is a batch
       imposition; this is one sheet a printer can use, and its page has to BE
       210×297mm rather than "some pixels". */
    const pdf = await page.evaluate(async () => {
      await window.loadVendor('jspdf');
      const t = window.dsnFromPreset(window.TPL_PRESETS.find(p => p.id === 'poster-a4'));
      const raster = await window.dsnRaster(t, {}, window.fabric, 150);
      const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: [t.wMm, t.hMm] });
      doc.addImage(raster.url, 'PNG', 0, 0, t.wMm, t.hMm, undefined, 'FAST');
      const size = doc.internal.pageSize;
      return { w: Math.round(size.getWidth()), h: Math.round(size.getHeight()),
               px: raster.w, bytes: doc.output('blob').size };
    });
    ok('a poster exports as a real A4 page (' + pdf.w + ' × ' + pdf.h + 'mm), not as pixels',
      pdf.w === 210 && pdf.h === 297 && pdf.bytes > 1000);
    ok('…rastered at the DPI asked for (' + pdf.px + 'px across at 150 DPI)',
      Math.abs(pdf.px - 210 / 25.4 * 150) < 3);

    /* ── 11. Two redraws must not race ──────────────────────────────────────
       Images resolve asynchronously, so a redraw started a frame after another
       can clear the canvas while the first one's objects are still in flight.
       The card never showed it — its photo is empty, so both passes are
       synchronous — and a poster with a logo on it came out completely blank.
       Drive two redraws back to back and check the canvas is not empty. */
    await page.selectOption('select[aria-label="Open a design"]', '__preset-poster-a4');
    await page.waitForTimeout(1600);
    const raced = await page.evaluate(async () => {
      // Two overlapping renders into one canvas, the later one winning.
      const t = window.dsnFromPreset(window.TPL_PRESETS.find(p => p.id === 'poster-a4'));
      const c = new window.fabric.StaticCanvas(document.createElement('canvas'));
      let token = 0;
      const draw = () => {
        const mine = ++token;
        c.clear();
        return window.tplToFabric(window.tplResolve(t, {}), window.fabric, c,
          { scale: 0.4, shouldPaint: () => token === mine });
      };
      const a = draw();
      const b = draw();
      await Promise.all([a, b]);
      return { objects: c.getObjects().length, expected: t.elements.length };
    });
    /* EXACTLY the element count, not "at least". Without the guard both renders
       paint into the same canvas and you get every object twice — which still
       looks like a poster, and is why ">= 6" would have passed a broken build. */
    ok('two overlapping redraws paint the design once, not twice (' + raced.objects + ' objects)',
      raced.objects === raced.expected);
    const painted = await page.evaluate(() => {
      /* And the on-screen canvas actually has ink on it: sample the middle of the
         top band, which the poster paints navy. A blank canvas reads white. */
      const cv = document.querySelector('.dsn-canvas-host canvas');
      if (!cv) return null;
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(Math.round(cv.width / 2), Math.round(cv.height * 0.12), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    });
    ok('…and the poster on screen is not a blank sheet (rgb ' + (painted ? [painted.r, painted.g, painted.b].join(',') : '?') + ')',
      !!painted && painted.r < 120 && painted.b > painted.r);

    /* ── 12. A placed image is a URL, never bytes in the design ─────────────
       The bug the library exists for: a design is capped at 512KB and one
       1600px photograph is about 548KB base64, so inlining meant a poster with
       a photo on it could not be saved. Asserted on what the designer PUTS in
       the document, because that is what gets sent to the server. */
    await page.selectOption('select[aria-label="Open a design"]', '__preset-poster-a4');
    await page.waitForTimeout(1400);
    await page.evaluate(() => { window.__assets = []; });
    /* setInputFiles rather than a hand-built change event: React's onChange for a
       file input rides the native event the browser emits when a file is really
       chosen, and a synthetic one does not reproduce it. Playwright drives the
       real path. */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAYAAAA1Ll1yAAAA' +
      'AXNSR0IArs4c6QAAAKxJREFUeF7twQEBAAAAgiD/r25IQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4N8AKvwAAeLqjIYAAAAA' +
      'SUVORK5CYII=', 'base64');
    await page.setInputFiles('.dsn-tools input[type=file]',
      { name: 'backdrop.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(2500);
    const placed = await page.evaluate(() => {
      const img = (window.__lastTpl || { elements: [] }).elements.filter(e => e.type === 'image');
      // Read the real toast host, so a failure says what the screen said.
      const bad = Array.from(document.querySelectorAll('.toast, .toast-msg')).map(e => e.textContent);
      return { sent: window.__uploaded, images: img.map(e => e.src), bad };
    });
    ok('an uploaded image goes to the library, not into the design',
      !!placed.sent && (!!placed.sent.dataUrl || !!placed.sent.url));
    if (!placed.sent) console.error('        no upload; errors:', JSON.stringify(placed.bad));
    /* Two images now — the preset's logo and the one just placed — and the
       placed one must be the LIBRARY url. Checking only "no data: URLs" would
       pass on the preset's logo alone if the upload silently did nothing, which
       is exactly how the first version of this test lied. */
    ok('…and the element placed on the canvas holds a library URL, not base64',
      placed.images.length >= 2
      && placed.images.some(u => u.indexOf('/api/public/photo.php') === 0)
      && placed.images.every(u => !/^data:/.test(u)));

    /* ── 13. Data merge: one design, many people ────────────────────────────
       The studio could always draw a certificate; the question is whether it
       can draw two hundred and forty of them. Driven end to end — the roster
       read, the tick list, the audit that names who is missing data, and a real
       zip whose entries are counted out of the bytes. */
    await page.selectOption('select[aria-label="Open a design"]', '__new_student');
    await page.waitForTimeout(1200);
    await page.click('button:has-text("Batch…")');
    await page.waitForSelector('.dsn-tbl tbody tr', { timeout: 8000 });
    const merged = await page.evaluate(() => ({
      rows: document.querySelectorAll('.dsn-tbl tbody tr').length,
      ticked: document.querySelectorAll('.dsn-tbl tbody tr.is-on').length,
      flags: Array.from(document.querySelectorAll('.dsn-merge-flag')).map(e => e.textContent),
      asked: window.__mergeQuery,
    }));
    ok('the batch panel reads its own roster and ticks everybody by default',
      merged.rows === 3 && merged.ticked === 3 && merged.asked && merged.asked.audience === 'students');
    /* The flags are the thing an operator scans for. Three "no photo" and one
       "no card" — and the "no card" row is the acceptance test for the whole
       feature: a child the card payload cannot see is in this run. */
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'studio-batch.png'), fullPage: false });
    await page.click('.dsn-view .dsn-chip:has-text("Cards")');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'studio-batch-cards.png'), fullPage: false });
    await page.click('.dsn-view .dsn-chip:has-text("List")');
    await page.waitForTimeout(200);

    /* Review evidence: the batch panel at a narrow desktop and the studio's
       own chrome, so a UX pass has the same screens an operator does. */
    /* ── 13c. The panel as an operator meets it ─────────────────────────────
       Measured on the RENDERED page rather than reasoned about from the
       stylesheet, because this panel is a translucent surface over a dark
       ground and the only way to know what its small text actually measures
       is to composite it and look.

       These were one-off probes during a UX pass. They are assertions now:
       every number below was a real answer that could quietly stop being
       true — a token change three files away, a new wrapper with its own
       background, a font-size nudge — and none of it shows up in a
       screenshot or a functional test. */
    const seen = await page.evaluate(() => {
      const lum = ([r, g, b]) => {
        const l = [r, g, b].map(v => { const x = v / 255;
          return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
        return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
      };
      const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      /* Composite every ancestor background down to one opaque colour. A
         translucent panel over a dark page is not the colour the stylesheet
         names, and measuring the named one gives an answer that is wrong in
         the safe direction — which is the worst kind. */
      const bgOf = (el) => {
        let out = [11, 17, 32];
        const chain = [];
        for (let n = el; n; n = n.parentElement) chain.unshift(n);
        for (const n of chain) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.length < 3) continue;
          const a = c.length > 3 ? c[3] : 1;
          if (a === 0) continue;
          out = [0, 1, 2].map(i => c[i] * a + out[i] * (1 - a));
        }
        return out;
      };
      const ratio = (el) => {
        const fg = parse(getComputedStyle(el).color);
        const a = fg.length > 3 ? fg[3] : 1;
        const bg = bgOf(el);
        const on = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
        const x = lum(on), y = lum(bg);
        return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
      };
      const panel = document.querySelector('.dsn-merge');
      const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const stops = Array.from(panel.querySelectorAll(focusable));
      const ticks = Array.from(document.querySelectorAll('.dsn-tbl tbody input[type=checkbox]'))
        .map(e => e.getBoundingClientRect());
      const text = {};
      [['idCell', '.dsn-td-mono'], ['runNote', '.dsn-merge-note'],
       ['chip', '.dsn-chip:not(.is-on)'], ['filterLabel', '.dsn-merge-filters .dsn-prop span'],
       ['colHeader', '.dsn-th:not(.is-on) button']].forEach(([k, sel]) => {
        const e = document.querySelector(sel);
        if (e) text[k] = { r: ratio(e), px: parseFloat(getComputedStyle(e).fontSize) };
      });
      return {
        text, stops: stops.length, offTab: stops.filter(e => e.tabIndex < 0).length,
        tick: ticks[0] ? { w: Math.round(ticks[0].width),
                           pitch: ticks[1] ? Math.round(ticks[1].top - ticks[0].top) : 0 } : null,
      };
    });

    /* Fixes from the UX pass, asserted where they can be. Each was a real
       defect a screenshot showed and no test caught. */
    const fixed = await page.evaluate(() => {
      const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const alpha = (el) => { const c = parse(getComputedStyle(el).backgroundColor);
        return c.length > 3 ? c[3] : 1; };
      return {
        // A sticky bar with content scrolling behind it has to be opaque, or
        // the rows show through and read as a rendering fault.
        runBarAlpha: alpha(document.querySelector('.dsn-merge-run')),
        picksAlpha: alpha(document.querySelector('.dsn-merge-picks')),
        // The count that says how big the run is, announced rather than
        // silently changing when a filter narrows it.
        headNoteLive: document.querySelector('.dsn-merge-head .dsn-merge-note')
                              .getAttribute('role'),
        // The native date pair renders in the BROWSER's locale, so it says so.
        dateHint: !!document.getElementById('dsn-date-fmt')
                  && document.querySelectorAll('input[type=date][aria-describedby="dsn-date-fmt"]').length,
      };
    });
    ok('the sticky bars are opaque, so nothing shows through them',
      fixed.runBarAlpha === 1 && fixed.picksAlpha === 1);

    ok('the match count is announced, not just silently changed',
      fixed.headNoteLive === 'status');
    ok('the date pair says whose date order it is using',
      fixed.dateHint === 2);

    /* The third state of a select-all. A page with some ticked drew an EMPTY
       box — "nothing here is selected", about a page where things are. */
    await page.click('.dsn-merge-picks button:has-text("Clear")');
    await page.click('.dsn-tbl tbody tr:nth-child(1) input[type=checkbox]');
    const tri = await page.evaluate(() => {
      const t = document.querySelector('.dsn-merge-all input');
      return { mixed: t.indeterminate, checked: t.checked };
    });
    ok('a partly-ticked page shows the mixed state rather than an empty box',
      tri.mixed === true && tri.checked === false);
    await page.click('.dsn-merge-picks button:has-text("Select all")');
    const allOn = await page.evaluate(() => {
      const t = document.querySelector('.dsn-merge-all input');
      return { mixed: t.indeterminate, checked: t.checked };
    });
    ok('…and a fully-ticked one is checked, not mixed',
      allOn.mixed === false && allOn.checked === true);

    const dim = Object.keys(seen.text).filter(k => seen.text[k].r < 4.5)
      .map(k => k + ' ' + seen.text[k].r + ':1');
    ok('every piece of small text in the batch panel clears 4.5:1 where it lands'
       + (dim.length ? ' — ' + dim.join(', ') : ''), dim.length === 0);
    ok('nothing in the panel is taken out of the tab order ('
       + seen.stops + ' stops)', seen.stops > 20 && seen.offTab === 0);
    /* WCAG 2.5.8 is 24×24, with a spacing exception: imagine a 24px circle on
       each target, and if none overlap it passes. A row tick is smaller than
       24px and legal only because the rows are far enough apart — so the row
       pitch is the thing that has to hold, not the tick. */
    ok('row ticks clear 2.5.8, by size or by the spacing exception ('
       + seen.tick.w + 'px, ' + seen.tick.pitch + 'px apart)',
       seen.tick.w >= 24 || seen.tick.pitch >= 24);

    /* 200% text zoom on a small window. WCAG 1.4.4 wants the content usable,
       and the failure mode is a horizontal scrollbar on the whole document. */
    await page.setViewportSize({ width: 700, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await page.waitForTimeout(400);
    const overflowPx = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('at 200% text zoom on a 700px window the page does not scroll sideways ('
       + overflowPx + 'px)', overflowPx <= 1);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

    /* ── PRINT MODE: the canvas holds its ground ─────────────────────────
       The defect this pins: the batch panel used to be a full-width block
       above the workspace, so opening it pushed the canvas — the thing being
       proofed — off screen, and proofOne scrolled it back. A studio where you
       cannot see what you are about to print three hundred times is the whole
       failure, so it is asserted rather than left to a screenshot nobody
       diffs. Batch is open at this point in the run. */
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(400);
    const printMode = await page.evaluate(() => {
      const stage = document.querySelector('.dsn-stage');
      const merge = document.querySelector('.dsn-merge');
      const work = document.querySelector('.dsn-work');
      if (!stage || !merge || !work) return null;
      const a = stage.getBoundingClientRect(), b = merge.getBoundingClientRect();
      const cv = document.querySelector('.dsn-canvas-host canvas');
      const c = cv ? cv.getBoundingClientRect() : null;
      return {
        printing: work.classList.contains('is-printing'),
        // Side by side, not stacked: the panels overlap vertically and not
        // horizontally. That is the geometric statement of "beside".
        sideBySide: a.right <= b.left + 1 && a.top < b.bottom && b.top < a.bottom,
        // The proof is reachable without scrolling.
        canvasTop: Math.round(a.top),
        canvasVisible: a.top < 1000 && a.bottom > 0,
        // The card must not escape its panel — it did at a 420px column.
        canvasFits: !!c && c.left >= a.left - 1 && c.right <= a.right + 1,
        /* Editing rails step aside; the canvas is not a rail and must remain.
           Counted over EVERY .dsn-rail on the page, not over a
           .is-printing-scoped selector — scoping it to the modifier made the
           check vacuous, because breaking the modifier also empties the
           selector and an empty set satisfies "all hidden". */
        railsOnPage: document.querySelectorAll('.dsn-rail').length,
        railsVisible: Array.from(document.querySelectorAll('.dsn-rail'))
          .filter(e => e.getBoundingClientRect().width > 0).length,
        // The picks bar reflows on the PANEL's width, not the window's: at
        // 1440 the window is roomy and the panel is not.
        picksRows: (() => {
          const p = document.querySelector('.dsn-merge-picks');
          return p ? Math.round(p.getBoundingClientRect().height) : 0;
        })(),
      };
    });
    ok('print mode puts the run beside the proof rather than below it',
      !!printMode && printMode.printing && printMode.sideBySide);
    ok('…so the canvas is on screen without scrolling (top ' + (printMode && printMode.canvasTop) + 'px)',
      !!printMode && printMode.canvasVisible && printMode.canvasTop < 700);
    ok('…the card stays inside its panel at this column width',
      !!printMode && printMode.canvasFits);
    ok('…and the editing rails step aside while printing (' + (printMode && printMode.railsOnPage)
       + ' on the page, ' + (printMode && printMode.railsVisible) + ' visible)',
      !!printMode && printMode.railsOnPage >= 2 && printMode.railsVisible === 0);
    ok('…with the picks bar reflowed to two rows on the panel width, not one squeezed row',
      !!printMode && printMode.picksRows > 60);

    /* The review screens. Off by default — they are for looking at, not for
       asserting, and rendering them on every run costs seconds for nobody. */
    if (process.env.DSN_SHOTS) {
      for (const [name, w, h] of [['1440', 1440, 1000], ['1100', 1100, 950], ['820', 820, 1000]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'ux-studio-' + name + '.png') });
      }
    }
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.waitForTimeout(300);
    ok('…including the people an ID-card read cannot see, flagged on the row',
      merged.flags.filter(f => f === 'no card').length === 1
      && merged.flags.filter(f => f === 'no photo').length === 3);

    /* Imposition is offered only where it means something. compose() clamps its
       grid to at least 1×1, so asking it to gang an A4 poster onto an A4 sheet
       does not fail — it returns a sheet with the artwork hanging off three
       edges, which is the kind of file a print shop phones about. */
    const gang = await page.evaluate(() => ({
      card: window.dsnPerSheet({ wMm: 54, hMm: 92, bleedMm: 3 }),
      a4: window.dsnPerSheet({ wMm: 210, hMm: 297, bleedMm: 3 }),
      a5: window.dsnPerSheet({ wMm: 148, hMm: 210, bleedMm: 3 }),
      offered: !document.querySelector('button[title*="A4 sheet"]').disabled,
    }));
    /* An A5 gangs 1-up at best (two of them are 296mm across, wider than A4
       less its margins), so it is not offered either — "a page each" already
       does one-up, and does it without pretending to be prepress. */
    ok('ID cards gang ' + gang.card + '-up on A4; A5 and larger are not offered imposition',
      gang.card >= 6 && gang.a4 === 0 && gang.a5 === 1 && gang.offered === true);

    // A filter reaches the server rather than being applied to a stale list.
    await page.fill('.dsn-merge-q input', 'Beta');
    await page.waitForTimeout(500);
    ok('…and a filter is a new read, not a client-side sieve over old rows',
      (await page.evaluate(() => (window.__mergeQuery || {}).q)) === 'Beta');

    /* ── 13b. The picker at roster scale ────────────────────────────────────
       It was a wrapping grid of tick-boxes in insertion order inside a 520px
       box. Fine at two hundred; at a thousand it is a scroll with no landmarks
       and no way to bring anybody to the top. */

    /* THE bug this rebuild exists to fix, and the one that cost work rather
       than patience: every read replaced the selection with "everything that
       just came back". Untick somebody, type one letter in the search box, and
       they were silently back in the run — and a run spanning two filters was
       impossible to build at all. */
    await page.fill('.dsn-merge-q input', '');
    await page.waitForTimeout(500);
    // Untick one person, then narrow and widen the filter around them.
    await page.click('.dsn-tbl tbody tr:nth-child(1) input[type=checkbox]');
    const tickedBefore = await page.evaluate(() => document.querySelectorAll('.dsn-tbl tbody tr.is-on').length);
    await page.fill('.dsn-merge-q input', 'Gamma');
    await page.waitForTimeout(500);
    await page.fill('.dsn-merge-q input', '');
    await page.waitForTimeout(600);
    const tickedAfter = await page.evaluate(() => document.querySelectorAll('.dsn-tbl tbody tr.is-on').length);
    ok('unticking somebody survives a filter change (' + tickedBefore + ' → ' + tickedAfter + ')',
      tickedBefore === 2 && tickedAfter === 2);
    // Put them back so the run below is the three the later checks expect.
    await page.click('.dsn-tbl tbody tr:nth-child(1) input[type=checkbox]');

    /* Sorting is a SERVER read. Sorting the page in hand would order one page
       of the roster and call it the roster. */
    await page.click('.dsn-th:has-text("Surname") button');
    await page.waitForTimeout(500);
    const sorted = await page.evaluate(() => window.__mergeQuery || {});
    ok('a column header orders the run on the server, not the page in hand',
      sorted.sort === 'surname' && sorted.dir === 'asc');
    await page.click('.dsn-th:has-text("Surname") button');
    await page.waitForTimeout(500);
    ok('…and clicking it again reverses rather than re-sorting the same way',
      (await page.evaluate(() => (window.__mergeQuery || {}).dir)) === 'desc');
    ok('…with the sorted column announced to assistive tech',
      (await page.locator('.dsn-th:has-text("Surname")').getAttribute('aria-sort')) === 'descending');

    /* The readiness chip is the filter an operator actually reaches for: the
       question before a print run is "which of these will come out wrong". */
    await page.click('.dsn-chip:has-text("Needs attention")');
    await page.waitForTimeout(200);
    const needs = await page.evaluate(() => ({
      rows: document.querySelectorAll('.dsn-tbl tbody tr').length,
      ok: document.querySelectorAll('.dsn-merge-flag--ok').length,
    }));
    ok('the readiness chip narrows to the rows that will print wrong',
      needs.rows === 3 && needs.ok === 0);
    /* The COUNT is the reason anybody clicks it: "Needs attention" makes you
       click to find out whether it is two or two hundred. */
    ok('…and says how many before you click it',
      (await page.locator('.dsn-chip:has-text("Needs attention") .dsn-chip-n').textContent()).trim() === '3');
    await page.click('.dsn-chip:has-text("Everyone")');
    await page.waitForTimeout(200);

    /* Shift-click a range. Picking two hundred out of a thousand one tick at a
       time is not a workflow, and "select all" plus two hundred unticks is not
       one either. */
    await page.click('.dsn-tbl tbody tr:nth-child(1) input[type=checkbox]');   // untick + anchor
    await page.click('.dsn-tbl tbody tr:nth-child(3) input[type=checkbox]', { modifiers: ['Shift'] });
    ok('shift-click carries the anchor row\'s state across the whole range',
      (await page.evaluate(() => document.querySelectorAll('.dsn-tbl tbody tr.is-on').length)) === 0);
    await page.click('.dsn-tbl tbody tr:nth-child(1) input[type=checkbox]');   // re-tick + anchor
    await page.click('.dsn-tbl tbody tr:nth-child(3) input[type=checkbox]', { modifiers: ['Shift'] });
    ok('…and back the other way, so a range never half-ticks',
      (await page.evaluate(() => document.querySelectorAll('.dsn-tbl tbody tr.is-on').length)) === 3);

    /* Seeing the card, which is the whole point of the batch panel: a table
       says Chidi has no photograph, the card shows the hole where the face
       goes. Drawn by the SAME renderer that writes the print file. */
    await page.click('.dsn-view .dsn-chip:has-text("Cards")');
    await page.waitForSelector('.dsn-card img', { timeout: 20000 });
    await page.waitForTimeout(1800);
    const thumbs = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('.dsn-card img'));
      return { n: imgs.length, real: imgs.filter(i => /^data:image\/png/.test(i.src) && i.src.length > 3000).length };
    });
    ok('every card in the grid is a real render, not a placeholder (' + thumbs.real + '/' + thumbs.n + ')',
      thumbs.n === 3 && thumbs.real === 3);

    /* Clicking a name proofs THAT person on the canvas. The toolbar's preview
       picker only ever knew the card payload; this list is a bigger
       population, so a child whose photograph was rejected — visible to the
       merge, invisible to the card read — had no way to be looked at. */
    await page.click('.dsn-card-name:has-text("Chidi")');
    await page.waitForTimeout(400);
    ok('clicking a name proofs that person on the canvas',
      /Proofing Chidi/.test(await page.evaluate(() => document.body.innerText)));

    /* A page starts at the top of itself.
       The list keeps its own scroll offset and nothing put it back, so turning
       a page or switching view landed you wherever the last scroll left you —
       most visibly as a first row of cards cut off above the fold with its
       selection ticks out of sight. That reads as controls that are MISSING,
       and it fooled me into calling it a contrast problem and then a stacking
       problem before elementFromPoint gave the real answer. Asserted as the
       thing it actually is: a scroll position.

       Exercised in Cards view because that is the only one that overflows with
       a three-row fixture. */
    const scrolled = await page.evaluate(() => {
      const list = document.querySelector('.dsn-merge-list');
      /* Three cards do not overflow a 560px box, so the box is squeezed to
         make one. How the list came to be scrolled is not what is under test
         — that it gets put back is. */
      list.style.maxHeight = '90px';
      list.scrollTop = 40;
      return list.scrollTop;
    });
    await page.click('.dsn-chip:has-text("Ready to print")');
    await page.waitForTimeout(300);
    const afterFilter = await page.evaluate(() => document.querySelector('.dsn-merge-list').scrollTop);
    ok('changing what is shown puts the list back to the top (' + scrolled + ' → ' + afterFilter + ')',
      scrolled > 0 && afterFilter === 0);
    await page.evaluate(() => { document.querySelector('.dsn-merge-list').style.maxHeight = ''; });
    await page.click('.dsn-chip:has-text("Everyone")');
    await page.waitForTimeout(300);

    /* And the consequence, measured rather than inferred: the first card's
       selection control is the thing at its own coordinates. */
    const reachable = await page.evaluate(() => {
      const t = document.querySelector('.dsn-card-tick');
      const r = t.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { isTick: top === t, over: top ? String(top.className).slice(0, 24) : null };
    });
    ok("…so the first card's tick is hittable, not under the toolbar"
       + (reachable.isTick ? '' : ' — covered by ' + reachable.over), reachable.isTick);
    await page.click('.dsn-view .dsn-chip:has-text("List")');
    await page.waitForTimeout(200);

    // Paging, because a thousand rows is not a scroll.
    await page.selectOption('.dsn-merge-size select', '25');
    await page.waitForTimeout(200);
    ok('the picker pages rather than scrolling, and says where it is',
      /1–3 of 3/.test(await page.evaluate(() => document.querySelector('.dsn-merge-pager .dsn-merge-note').textContent)));

    await page.click('.dsn-th:has-text("Name") button');
    await page.waitForTimeout(500);

    // Drop one person, then run. Two pieces must come out, not three.
    await page.click('.dsn-tbl tbody tr:nth-child(3) input[type=checkbox]');
    await page.selectOption('.dsn-merge-run select', '150');
    await page.click('button:has-text("ZIP of images")');

    /* The run stops to say what the DATA will do to the design. This is the
       check tplPreflight cannot make: the design is fine, the roster is the
       problem, and two grey rectangles where a face should be is not something
       to discover on paper. */
    await page.waitForSelector('.dialog-card', { timeout: 10000 });
    const asked = await page.evaluate(() => ({
      title: document.querySelector('.dialog-h').textContent,
      body: (document.querySelector('.dialog-p') || {}).textContent || '',
    }));
    ok('…and it stops to name which of them have no photograph on file',
      /missing data/i.test(asked.title) && /2 of 2/.test(asked.body)
      && /photograph/i.test(asked.body) && /Amina Alpha/.test(asked.body));

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('.dialog-actions .btn-primary'),
    ]);
    const zipPath = await download.path();
    const zip = fs.readFileSync(zipPath);
    // Central-directory headers: one per entry, counted out of the real bytes.
    let entries = 0;
    for (let i = 0; i + 4 <= zip.length; i++) {
      if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x01 && zip[i + 3] === 0x02) entries++;
    }
    const names = zip.toString('latin1');
    ok('a batch of ' + entries + ' renders one real image per person, named for them',
      entries === 2 && names.indexOf('NGG-26-0101.png') !== -1 && names.indexOf('NGG-26-0102.png') !== -1
      && names.indexOf('NGG-26-0103') === -1 && zip.length > 4000);

    /* And the prepress route, through the card studio's own imposition rather
       than a second engine written for posters. Both cards must land on ONE
       sheet — a merge that emitted a page per card would be the "a page each"
       button wearing prepress clothing. */
    await page.click('button:has-text("PDF · imposed sheet")');
    await page.waitForSelector('.dialog-card', { timeout: 10000 });
    const [sheetDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('.dialog-actions .btn-primary'),
    ]);
    const sheetPdf = fs.readFileSync(await sheetDl.path()).toString('latin1');
    ok('…and an imposed sheet is one A4 page carrying both, with marks and layers',
      sheetPdf.slice(0, 5) === '%PDF-' && /\/Count 1\b/.test(sheetPdf)
      && sheetPdf.indexOf('/OCProperties') !== -1);

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
