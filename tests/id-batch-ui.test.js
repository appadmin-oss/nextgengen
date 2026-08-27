#!/usr/bin/env node
/* ============================================================================
   Print member ID cards — Control Room → Members → Print IDs.

   A print run is paper, a print shop and a day. The thing this drawer has to do
   before any of that is say what is MISSING across the selection, because a
   card with an empty photo box prints perfectly well and is wrong in the hand —
   and after the roster import, that was every member.

   So what is pinned here is the preflight: it counts the real gaps, it counts
   them over the actual filtered roster rather than the table's page, and it is
   a heads-up rather than a block. Plus the failure list, which used to be a
   toast truncated to three names and then gone.

   Mounted out of the built bundle with a stubbed NGGApi — no session, no DB.

   Run:  node tests/id-batch-ui.test.js
   Skips with a pass if playwright isn't installed, like the other E2E tests.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ID_BATCH_PORT || 8261;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_id_batch_fixture.html');

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

/* Five members: one complete, and one missing each of the three things the
   preflight counts — plus a second with no photograph, so the counts have to be
   counts rather than booleans. */
const ROSTER = [
  { memberId: 'NGG-1', fullName: 'Complete Member', displayId: '024-001', disciplines: 'TECH,MEDIA', photoUrl: 'https://example.org/a.png' },
  { memberId: 'NGG-2', fullName: 'No Photo One',    displayId: '024-002', disciplines: 'ART',        photoUrl: '' },
  { memberId: 'NGG-3', fullName: 'No Photo Two',    displayId: '024-003', disciplines: 'TECH',       photoUrl: '' },
  { memberId: 'NGG-4', fullName: 'No Printed Id',   displayId: '',        disciplines: 'MEDIA',      photoUrl: 'https://example.org/d.png' },
  { memberId: 'NGG-5', fullName: 'No Discipline',   displayId: '024-005', disciplines: '',  track: '', photoUrl: 'https://example.org/e.png' },
];

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  id batch UI: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css"><link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#0b1327}</style>
</head><body><div id="shot"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script>
var ROSTER = ${JSON.stringify(ROSTER)};
window.__listArgs = null;
window.NGGApi = { admin: { members: {
  list: function (q) { window.__listArgs = q; return Promise.resolve({ members: ROSTER, total: ROSTER.length }); },
} }, public: {} };
</script>
<script src="/dist/app.min.js"></script>
<script>
/* The renderer the drawer calls, stubbed AFTER the bundle — the bundle defines
   these same globals, so a stub installed first is simply overwritten and the
   test ends up driving the real canvas renderer. Reports two members it could
   not draw, so the failure list has something real to show. */
window.__exportArgs = null;
window.NggcMemberCardExport = function (members, opts) {
  window.__exportArgs = { n: members.length, order: members.map(function (m) { return m.memberId; }), opts: opts };
  if (opts && opts.onProgress) opts.onProgress(0, members.length, members[0]);
  return Promise.resolve({ made: members.length - 2, failed: ['No Photo One', 'No Photo Two'], mode: opts.mode });
};
window.MemberIDCardBatch = window.NggcMemberCardExport;

var e = React.createElement;
ReactDOM.createRoot(document.getElementById('shot')).render(
  e(React.Fragment, null,
    e(window.AdminMemberIdBatch, { filters: { centre: 'Egbeda' }, sort: { col: 'fullName', dir: 'asc' },
      total: 999, onClose: function () { window.__closed = true; } }),
    e(window.DialogHost)));
setTimeout(function () { document.body.setAttribute('data-ready', '1'); }, 300);
</script></body></html>`);

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE);
    const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
    page.on('pageerror', (e) => console.log('    [page] ' + e.message));
    await page.goto(BASE + '/tests/_id_batch_fixture.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.waitForTimeout(250);
    const panel = () => page.locator('.admin-drawer-panel').innerText();

    // ── The roster, and the count that comes from it ──
    const args = await page.evaluate(() => window.__listArgs);
    chk('the roster is read on open, filtered and in the table\'s own order',
      args && args.all === 1 && args.centre === 'Egbeda' && args.sort === 'fullName' && args.dir === 'asc');
    /* The button used to read the table's `total`, which is the PAGE count. */
    chk('the button counts the roster it actually has, not the table\'s total',
      (await page.innerText('.admin-drawer-foot .btn-primary')).includes('Print 5'));

    // ── The preflight ──
    const p = await panel();
    chk('it says how many have no photograph, before anything is printed', /\b2\b of 5[^.]*no photograph/.test(p));
    chk('…how many have no printed ID', /\b1\b of 5[^.]*no printed ID/.test(p));
    chk('…and how many have no discipline', /\b1\b of 5[^.]*no discipline/.test(p));
    chk('it is a heads-up, not a block', p.includes('not a block')
      && !(await page.locator('.admin-drawer-foot .btn-primary').isDisabled()));

    // ── The run ──
    await page.locator('.admin-drawer-foot .btn-primary').click();
    await page.waitForTimeout(400);
    const ex = await page.evaluate(() => window.__exportArgs);
    chk('the run gets every member, in the order the table was sorted',
      ex && ex.n === 5 && ex.order[0] === 'NGG-1' && ex.order[4] === 'NGG-5');
    chk('…and is not re-read from the server a second time',
      (await page.evaluate(() => window.__listArgs)).all === 1);

    const after = await panel();
    /* Case-folded: the heading is uppercased in CSS, and innerText reports what
       is rendered rather than what is in the markup. */
    chk('what could not be rendered is named in the drawer, not in a toast that goes away',
      /2 could not be rendered/i.test(after) && after.includes('No Photo One') && after.includes('No Photo Two'));
    chk('…and the drawer stays open so the list can be read',
      !(await page.evaluate(() => window.__closed)));

    await page.locator('.admin-drawer-panel').screenshot({ path: path.join(ROOT, 'docs', 'screens', '28-id-preflight.png') });
    const kb = Math.round(fs.statSync(path.join(ROOT, 'docs', 'screens', '28-id-preflight.png')).size / 1024);
    const idxFile = path.join(ROOT, 'docs', 'screens', 'INDEX.json');
    let idx = []; try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch (_) {}
    const keep = Array.isArray(idx) ? idx.filter((x) => x.name !== '28-id-preflight') : [];
    keep.push({ name: '28-id-preflight', label: 'Printing member IDs — what is missing across the selection, before the run', kb });
    fs.writeFileSync(idxFile, JSON.stringify(keep, null, 2) + '\n');
    console.log('  ✓ docs/screens/28-id-preflight.png  (' + kb + ' KB)');

    await page.close();
  } finally {
    await browser.close();
    srv.kill();
    try { fs.unlinkSync(FIX); } catch (_) {}
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (ID print preflight)');
  process.exit(failed === 0 ? 0 : 1);
})();
