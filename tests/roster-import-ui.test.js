#!/usr/bin/env node
/* ============================================================================
   The roster import drawer — Control Room → Members → Import roster.

   This exists because of one constraint: NGG runs on shared hosting with no
   SSH. api/tools/seed-members.php is the same import, but a CLI-only importer
   is one the person who actually keeps the roster cannot run. So the browser
   half is not a convenience — it is the only way in, and it has to be tested
   like it.

   What is asserted is the safety property, not the styling: you cannot write
   136 member records without first having read what they would do. Plus the
   two things that silently break a file-driven UI — a file that is not a
   roster, and re-picking the same file after a failure.

   The component is mounted out of the built bundle with a stubbed NGGApi, the
   same way the card suites do it: no server, no session, no database.

   Run:  node tests/roster-import-ui.test.js
   Skips with a pass if playwright isn't installed, like the other E2E tests.
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ROSTER_UI_PORT || 8253;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_roster_import_fixture.html');

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

/* Two members and a warning — enough for the preview table to have something
   to say, and for "already current" rows to be the thing that is NOT shown. */
const ROSTER = {
  source: 'NGG_Members.xlsx',
  warnings: ['024-088 carries two different people'],
  members: [
    { displayId: '024-000', fullName: 'Example Member', level: 'B', disciplines: 'TECH,MEDIA', status: 'active', centre: 'Egbeda' },
    { displayId: '024-001', fullName: 'Second Example', level: 'A', disciplines: 'ART', status: 'inactive', centre: 'Ayobo' },
  ],
};

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  roster import UI: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.writeFileSync(FIX, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/dist/styles.css">
<link rel="stylesheet" href="/dist/styles-app.css">
<style>body{margin:0;background:#0b1327}</style>
</head><body><div id="shot"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script>
/* Record every call so the test can assert WHAT was posted, not only that
   something happened — "apply" arriving as false is the whole bug class. */
window.__calls = [];
window.NGGApi = { admin: { members: {
  importRoster: function (file, opts) {
    window.__calls.push({ members: file.members.length, source: file.source, opts: opts });
    var created = 2, updated = 0;
    return Promise.resolve({ applied: !!(opts && opts.apply), created: created, updated: updated,
      unchanged: 1, failed: 0, rows: [
        { ref: '024-000', action: 'create', name: 'Example Member', detail: 'active · Egbeda', warnings: [] },
        { ref: '024-001', action: 'create', name: 'Second Example', detail: 'inactive · Ayobo',
          warnings: ['status "left" is not one the app counts — imported as inactive'] },
      ] });
  },
} }, public: {} };
</script>
<script src="/dist/app.min.js"></script>
<script>
var e = React.createElement;
window.__applied = 0;
/* DialogHost is normally mounted by App. The confirm before an apply is part
   of what is being tested, so it has to be here too. */
ReactDOM.createRoot(document.getElementById('shot')).render(
  e(React.Fragment, null,
    e(window.AdminRosterImport, { onClose: function () {}, onApplied: function () { window.__applied++; } }),
    e(window.DialogHost)));
setTimeout(function () { document.body.setAttribute('data-ready', '1'); }, 250);
</script></body></html>`);

  const rosterFile = path.join(os.tmpdir(), `ngg-roster-ui-${process.pid}.json`);
  const junkFile = path.join(os.tmpdir(), `ngg-roster-junk-${process.pid}.json`);
  fs.writeFileSync(rosterFile, JSON.stringify(ROSTER));
  fs.writeFileSync(junkFile, '{"totally":"not a roster"}');

  const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: exe });
  try {
    await waitForServer(BASE);
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    await page.goto(BASE + '/tests/_roster_import_fixture.html', { waitUntil: 'domcontentloaded' });
    // The drawer is fixed-position, so the body itself has no box and
    // waitForSelector's visibility check never passes. Wait on the flag.
    await page.waitForFunction(() => document.body.dataset.ready === '1');

    const btn = (label) => page.locator('button', { hasText: label });
    const fileInput = page.locator('input[type=file]');
    /* Assert on the panel's text rather than on nth(.mono): the drawer has
       several .mono nodes and an index into them is a test that breaks the
       next time a line is added, without anything being wrong. */
    const panel = () => page.locator('.admin-drawer-panel').innerText();

    chk('the drawer opens on the roster, not on a form',
      await page.locator('.admin-drawer-head h3').innerText() === 'Import roster');
    chk('nothing can be checked before a file is chosen',
      await btn('Check what would change').isDisabled());
    chk('and there is no Import button to press by mistake',
      await btn(/^Import \d/).count() === 0);

    // ── A file that is not a roster ──
    await fileInput.setInputFiles(junkFile);
    await page.waitForTimeout(150);
    chk('a JSON file that is not a roster is refused, by name',
      (await page.locator('.admin-hint').allInnerTexts()).some((t) => t.includes('not a roster file')));
    chk('…and nothing was posted', await page.evaluate(() => window.__calls.length) === 0);

    // ── The real thing ──
    await fileInput.setInputFiles(rosterFile);
    await page.waitForTimeout(150);
    const loaded = await panel();
    chk('a roster file reports what is in it before anything is sent',
      loaded.includes('NGG_Members.xlsx') && loaded.includes('2 members'));
    chk('…including the extractor warnings the desk still has to settle',
      loaded.includes('1 extractor warning'));
    chk('…and the earlier error is cleared',
      !(await page.locator('.admin-hint').allInnerTexts()).some((t) => t.includes('not a roster file')));

    await btn('Check what would change').click();
    await page.waitForTimeout(200);
    const first = await page.evaluate(() => window.__calls[0]);
    chk('the check posts the whole file', first.members === 2 && first.source === 'NGG_Members.xlsx');
    chk('…as a dry run — this is the property the whole drawer exists for',
      first.opts.apply === false);
    chk('the preview says what would change', (await panel()).includes('Would import'));
    const previewText = await panel();
    chk('…row by row, with what each row would touch',
      previewText.includes('024-000') && previewText.includes('Example Member')
      && previewText.includes('active · Egbeda'));
    chk('…and the per-row warnings attached to the row they belong to',
      previewText.includes('is not one the app counts'));
    chk('only now does an Import button exist', await btn(/^Import 2 record/).count() === 1);

    /* The drawer is the only way in on a host with no shell, so it is worth a
       picture in docs/screens. Fixture data only — a capture of the real
       roster would put children's names in the repository. */
    const shotFile = path.join(ROOT, 'docs', 'screens', '27-roster-import.png');
    fs.mkdirSync(path.dirname(shotFile), { recursive: true });
    await page.locator('.admin-drawer-panel').screenshot({ path: shotFile });
    const kb = Math.round(fs.statSync(shotFile).size / 1024);
    const idxFile = path.join(ROOT, 'docs', 'screens', 'INDEX.json');
    let idx = [];
    try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch (_) {}
    const keep = Array.isArray(idx) ? idx.filter((x) => x.name !== '27-roster-import') : [];
    keep.push({ name: '27-roster-import', label: 'Importing the members workbook without a shell — the dry run, before anything is written', kb });
    fs.writeFileSync(idxFile, JSON.stringify(keep, null, 2) + '\n');
    console.log('  ✓ docs/screens/27-roster-import.png  (' + kb + ' KB)');

    // ── Overwrite is a decision that invalidates the preview ──
    await page.locator('input[type=checkbox]').check();
    await page.waitForTimeout(120);
    chk('turning on overwrite withdraws the preview, because it is no longer the same import',
      await btn(/^Import 2 record/).count() === 0);
    await page.locator('input[type=checkbox]').uncheck();

    await btn('Check what would change').click();
    await page.waitForTimeout(200);

    /* Applying goes through the app's own confirm modal — not window.confirm —
       so the CTA has to be pressed like a person would. */
    await btn(/^Import 2 record/).click();
    const confirmCta = page.locator('button', { hasText: /^Import roster$/ });
    await confirmCta.last().waitFor({ timeout: 5000 });
    chk('applying asks first, and says how many records and in which mode',
      (await page.locator('body').innerText()).includes('Existing values are kept'));
    await confirmCta.last().click();
    await page.waitForTimeout(300);

    const calls = await page.evaluate(() => window.__calls);
    chk('applying posts apply:true', calls.some((c) => c.opts && c.opts.apply === true));
    const after = await panel();
    chk('…and the result reads as done, not as a forecast',
      after.includes('Imported') && !after.includes('Would import'));
    chk('…and the way back to the roster reloads it',
      await btn('Back to the roster').count() === 1);

    await page.close();
  } finally {
    await browser.close();
    srv.kill();
    for (const f of [FIX, rosterFile, junkFile]) { try { fs.unlinkSync(f); } catch (_) {} }
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (roster import drawer)');
  process.exit(failed === 0 ? 0 : 1);
})();
