#!/usr/bin/env node
/* ============================================================================
   Member dashboard — render the real production bundle and photograph it.

   Same approach as chess-shot.js: mount the shipped bundle with the shipped CSS
   against a stubbed NGGApi. What comes out is the actual component, not a
   mock-up of it.

   The fixture is deliberately a member who owes REAL money (dues + a fine) and
   who also has a training place the programme covers — because the whole point
   of the recent work is that those two must never read as one number.

   Run:  node tests/dashboard-shot.js
   Out:  tests/screens/dashboard-*.png
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.DASH_PORT || 8213;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_dash_fixture.html');
const OUT = path.join(ROOT, 'tests', 'screens');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  dashboard shots: skipped (playwright not installed)'); process.exit(0); }
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
  var paused = Q.get('state') === 'paused';
  var settled = Q.get('state') === 'settled';

  /* Real money: ₦6,000 dues + ₦500 fine, less a ₦2,000 payment = ₦4,500.
     Notional: a ₦75,000 training place the programme covers, ₦18,000 of it
     earned off by four months of service. */
  var ACC = {
    memberId: 'NGG-2024-0117',
    payable: settled ? 0 : 4500,
    /* Coherent with the schedule below: THREE sessions charged at ₦75,000 is a
       ₦225,000 place, and four of eighteen service months have earned off
       floor(225000 × 4/18) = ₦50,000. A screenshot whose figures do not add up
       is a good way to ship a broken card and not notice. */
    outstanding: 229500, charged: 231500, credited: 2000,
    realCharged: 6500, realCredited: settled ? 6500 : 2000,
    programmeCost: 225000, programmeCovered: 50000,
    trainingCharged: 225000, trainingEarned: 50000, trainingWrittenOff: 0,
    trainingFeePerSession: 75000,
    schedule: [
      { sessionId: 'TONI-2025', name: 'Toni 2025', startDate: '2025-01-06', amount: 75000, state: 'charged' },
      { sessionId: 'MEDI-2025', name: 'Medi 2025', startDate: '2025-04-07', amount: 75000, state: 'charged' },
      { sessionId: 'SUMMER-2025', name: 'Summer 2025', startDate: '2025-07-07', amount: 75000, state: 'charged' },
      { sessionId: 'DOMI-2025', name: 'Domi 2025', startDate: '2025-09-08', amount: 75000, state: 'due' },
      { sessionId: 'TONI-2026', name: 'Toni 2026', startDate: '2026-01-05', amount: 75000, state: 'upcoming' }
    ],
    mouAt: '', currency: 'NGN', remindOff: false,
    tenure: { start: '2024-09-01', months: 22, phase: 'service',
              trainingMonths: 18, serviceMonths: 18, servedMonths: 4, complete: false,
              trainingEndsAt: '2026-03-01',
              standing: paused ? 'suspended' : 'clear',
              creditPausedAt: paused ? '2026-05-14' : '',
              creditStopped: false },
    entries: [
      { kind: 'payment', direction: 'credit', amount: 2000, note: '', createdAt: '2026-07-02T09:00:00Z', void: false },
      { kind: 'training', direction: 'charge', amount: 75000, note: 'Training fee — Summer 2025', createdAt: '2025-07-07T09:00:00Z', void: false },
      { kind: 'training', direction: 'charge', amount: 75000, note: 'Training fee — Medi 2025', createdAt: '2025-04-07T09:00:00Z', void: false },
      { kind: 'training', direction: 'charge', amount: 75000, note: 'Training fee — Toni 2025', createdAt: '2025-01-06T09:00:00Z', void: false },
      { kind: 'dues', direction: 'charge', amount: 6000, note: 'Monthly dues 2026-05', createdAt: '2026-05-12T09:00:00Z', void: false },
      { kind: 'fine', direction: 'charge', amount: 500, note: 'Late arrival — three times in August', createdAt: '2026-05-11T09:00:00Z', void: false }
    ]
  };
  ReactDOM.createRoot(document.getElementById('root'))
    .render(React.createElement(DashboardObligations, { account: ACC }));
</script>
</body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  let shots = 0, problems = [];
  try {
    await waitForServer(BASE + '/tests/_dash_fixture.html');
    const shoot = async (name, query, viewport, expand) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message)));
      await page.goto(BASE + '/tests/_dash_fixture.html?' + query, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      if (expand) {
        const btn = page.locator('button', { hasText: 'See every entry' });
        if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(250); }
      }
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) problems.push(name + ': rendered nothing');
      if (errs.length) problems.push(name + ': ' + errs[0]);
      await page.screenshot({ path: path.join(OUT, 'dashboard-' + name + '.png'), fullPage: true });
      shots++;
      console.log('  📸 dashboard-' + name + '.png  (' + viewport.width + '×' + viewport.height + ')' + (errs.length ? '  ⚠ ' + errs[0] : ''));
      await page.close();
    };
    await shoot('account',         '',                 { width: 520, height: 900 });
    await shoot('account-open',    '',                 { width: 520, height: 900 }, true);
    await shoot('account-phone',   '',                 { width: 390, height: 844 });
    await shoot('account-paused',  'state=paused',     { width: 520, height: 900 });
    await shoot('account-settled', 'state=settled',    { width: 520, height: 900 });
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }
  if (problems.length) { problems.forEach(p => console.log('  ✗ ' + p)); console.log('\n❌ DASHBOARD SHOTS: ' + problems.length + ' problem(s)'); process.exit(1); }
  console.log('\n✅ DASHBOARD SHOTS: ' + shots + ' screens rendered clean into tests/screens/');
})();
