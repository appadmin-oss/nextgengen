#!/usr/bin/env node
/* ============================================================================
   Member dashboard — render the real bundle and photograph it.

   Same approach as dashboard-shot.js: mount the shipped bundle with the
   shipped CSS against a stubbed NGGApi, so what comes out is the actual
   component rather than a mock-up of it.

   The fixture deliberately carries UNEVEN data — one centre much larger than
   the rest, a quiet month in the middle of the growth series, and four
   different record problems — because a dashboard that only looks right on
   tidy numbers is a dashboard nobody has tested.

   Run:  node tests/members-dash-shot.js
   Out:  tests/screens/members-*.png
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MEMDASH_PORT || 8219;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_memdash_fixture.html');
const OUT = path.join(ROOT, 'tests', 'screens');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  member dashboard shots: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.mkdirSync(OUT, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));

  fs.writeFileSync(FIX, `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:var(--cream-50,#fdf9f0);padding:22px;}</style>
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script src="/dist/${manifest.bundle.file}"></script>
<script>
  var Q = new URLSearchParams(location.search);
  var clean = Q.get('state') === 'clean';
  var scoped = Q.get('state') === 'scoped';

  function months() {
    var out = [], now = new Date();
    /* A quiet month in the middle, so the chart is exercised on a zero
       rather than only on a smooth ramp. */
    var n = [4, 9, 6, 14, 11, 0, 7, 19, 23, 12, 8, 16];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      out.push({ month: d.toISOString().slice(0, 7), joined: n[11 - i] });
    }
    return out;
  }

  var OVERVIEW = {
    asAt: new Date().toISOString().slice(0, 10),
    scoped: scoped,
    headline: { total: 1284, active: 1061, inactive: 223, new30: 16, new365: 129, dormant: 184 },
    byStatus: { active: 1061, 'graduated-ngg': 121, inactive: 62, suspended: 28, 'graduated-vanguard': 12 },
    byType: { NGG: 806, Summer: 478 },
    byCentre: scoped
      ? [{ name: 'Egbeda', total: 412, active: 361 }]
      : [{ name: 'Egbeda', total: 412, active: 361 }, { name: 'Ayobo', total: 298, active: 240 },
         { name: 'Ikotun', total: 221, active: 190 }, { name: 'Alimosho', total: 186, active: 151 },
         { name: 'Idimu', total: 112, active: 96 }, { name: '(no centre)', total: 55, active: 23 }],
    growth: months(),
    staff: { member: 1261, editor: 9, summer_admin: 6, club_admin: 4, admin: 3, super_admin: 1 },
    consent: { participants: 478, named: 311, unrecorded: 167 },
    quality: clean
      ? { no_email: 0, no_phone: 0, no_centre: 0, unknown_centre: 0, no_dob: 0, minor_no_guardian: 0, duplicate_groups: 0 }
      : { no_email: 214, no_phone: 86, no_centre: 55, unknown_centre: 31, no_dob: 142,
          minor_no_guardian: 19, duplicate_groups: 7 },
    dues: { people: 148, outstanding: 884500 },
    conduct: { fined: 63, finesImposed: 412000, finesOwedBy: 21, finesOwed: 96500, suspended: 4,
               evicted: 1, awaitingReview: 3, promoted: 38, promoted365: 12 }
  };

  window.NGGApi = window.NGGApi || {};
  window.NGGApi.admin = Object.assign({}, window.NGGApi.admin, {
    membersOverview: function () { return Promise.resolve({ overview: OVERVIEW }); }
  });

  ReactDOM.createRoot(document.getElementById('root'))
    .render(React.createElement(MembersDashboard, { onFilter: function (f) { window.__lastFilter = f; } }));
</script>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  let shots = 0, problems = [];
  try {
    await waitForServer(BASE + '/tests/_memdash_fixture.html');
    const shoot = async (name, query, viewport) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message)));
      await page.goto(BASE + '/tests/_memdash_fixture.html?' + query, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);
      // Nothing may spill sideways — the bar labels and the chart are the
      // two things most likely to push the card wider than its column.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(name + ': ' + overflow + 'px of horizontal overflow');
      await page.screenshot({ path: path.join(OUT, 'members-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 members-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')'
        + (errs.length ? '  ⚠ ' + errs[0] : ''));
      await page.close();
    };
    await shoot('dash',       '',             { width: 1180, height: 1000 });

    /* The conduct tiles are lists, not posters: each opens the roster
       segment it counted. */
    {
      const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
      await page.goto(BASE + '/tests/_memdash_fixture.html', { waitUntil: 'networkidle' });
      await page.waitForSelector('.mem-dash-sub');
      const text = (await page.evaluate(() => document.body.innerText)).toLowerCase();
      for (const want of ['conduct & progression', 'fined', 'owing · ₦96,500', 'suspended now', 'evicted',
                          'sanction to decide', 'promoted to ngv', '12 promoted to ngv in the last 12 months', '₦412,000']) {
        if (!text.includes(want)) problems.push('conduct tiles: missing "' + want + '"');
      }
      for (const [label, segment] of [['Fined', 'fined'], ['Suspended now', 'suspended'], ['Evicted', 'evicted'],
                                      ['Sanction to decide', 'conduct_review'], ['Promoted to NGV', 'promoted_ngv']]) {
        await page.locator('.admin-tile', { has: page.locator('.admin-tile-l', { hasText: new RegExp('^' + label + '$', 'i') }) }).click();
        const f = await page.evaluate(() => window.__lastFilter);
        if (!f || f.segment !== segment) problems.push('conduct tiles: "' + label + '" opened ' + JSON.stringify(f) + ', not segment ' + segment);
      }
      await page.close();
    }
    await shoot('dash-clean', 'state=clean',  { width: 1180, height: 1000 });
    await shoot('dash-scoped','state=scoped', { width: 1180, height: 1000 });
    await shoot('dash-phone', '',             { width: 390, height: 844 });
  } finally {
    await browser.close();
    try { process.kill(srv.pid); } catch (_) {}
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  if (problems.length) { problems.forEach(p => console.log('  ✗ ' + p)); console.log('❌ FAIL (member dashboard)'); process.exit(1); }
  console.log('✅ PASS: ' + shots + ' member dashboard shots, no page errors, no overflow');
})();
