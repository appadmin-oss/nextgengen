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
const { waitForServer, writeScreenIndex } = require('./_serve');

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
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script src="/dist/app.min.js"></script><script src="/dist/app-study.min.js"></script><script src="/dist/app-more.min.js"></script>
<script>
/* Record every call so the test can assert WHAT was posted, not only that
   something happened — "apply" arriving as false is the whole bug class. */
window.__calls = [];
/* The ID list is a download: catch the blob instead of saving a file. */
URL.createObjectURL = function (b) { window.__blob = b; return 'blob:fixture'; };
URL.revokeObjectURL = function () {};
HTMLAnchorElement.prototype.click = function () { window.__downloaded = this.download; };
/* After the bundle, which sets up its own NGGApi when it loads. */
window.NGGApi = { admin: { members: {
  importRoster: function (file, opts) {
    window.__calls.push({ members: file.members.length, source: file.source,
      fileSha: file.fileSha, opts: opts });
    var created = 2, updated = 0;
    return Promise.resolve({ applied: !!(opts && opts.apply), created: created, updated: updated,
      unchanged: 1, failed: 0, digest: 'd'.repeat(64), previous: window.__previous || null, rows: [
        { ref: '024-000', action: 'create', name: 'Example Member', detail: 'active · Egbeda', warnings: [] },
        { ref: '024-001', action: 'create', name: 'Second Example', detail: 'inactive · Ayobo',
          warnings: ['status "left" is not one the app counts — imported as inactive'] },
        { ref: 'row 3', action: 'create', name: 'No Id Yet', displayId: '026-019', detail: 'active · Egbeda',
          warnings: ['will be issued member ID 026-019'] },
      ],
      ids: { kept: 2, issued: 1, normalized: 0, refused: window.__declared ? 0 : 1, strict: !!(opts && opts.idStrict),
             undeclared: window.__declared ? {} : { 'AAA/99/999': { shape: 'AAA/99/999', count: 1, examples: ['OLD/19/042'],
               suggest: [{ from: 'O24-016', id: '024-016', holder: 'Adams Anthony' }] } } },
      idList: [{ name: 'No Id Yet', sheet: '', displayId: '026-019', action: 'issued', memberId: '' },
               { name: '=Formula Kid', sheet: '24-1', displayId: '024-001', action: 'normalized', memberId: 'NGG-1' }],
      applicants: { filed: 3, already: 1, onRoster: 0, invalid: 0, rows: [] } });
  },
  cards: {
    formats: function () { return Promise.resolve({ formats: [{ id: 'member-number', label: 'The member number printed on the card (023-001)', template: '{id}', mask: '999-999', field: 'displayId', builtin: true }] }); },
    declareIdFormat: function (example, label, vary, year) { window.__declaredWith = example; window.__declaredYear = year; window.__declared = true; return Promise.resolve({ format: { id: 'id-old-99-999', mask: 'OLD/99/999' } }); },
  },
} }, public: {
  /* The bundle's shared hooks (useSession, useSiteContent) call these on mount;
     with an empty object they threw before the drawer rendered — which is why
     this suite timed out on its first assertion. Same stubs as members-manage-shot. */
  session: function () { return Promise.resolve({ current: null, next: null }); },
  stats: function () { return Promise.resolve({}); },
  centres: function () { return Promise.resolve({ centres: [] }); },
  content: function () { return Promise.resolve({}); },
  siteContent: function () { return Promise.resolve({ content: {} }); },
} };
</script>
<script>
/* In a function: the bundle is one concatenated script in global scope, and a
   bare top-level "var e" here replaced the minified bundle function called e —
   "r is not a function", and the drawer never rendered. */
(function () {
var e = React.createElement;
window.__applied = 0;
/* DialogHost is normally mounted by App. The confirm before an apply is part
   of what is being tested, so it has to be here too. */
/* Into #root, as the other component fixtures do: the bundle mounts its own
   App there when it loads, and with no #root that mount threw (React #299)
   and left the page with no working root for this one. */
ReactDOM.createRoot(document.getElementById('root')).render(
  e(React.Fragment, null,
    e(window.AdminRosterImport, { onClose: function () {}, onApplied: function () { window.__applied++; } }),
    e(window.DialogHost)));
setTimeout(function () { document.body.setAttribute('data-ready', '1'); }, 250);
})();
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

    // ── Member IDs: strict by default, issued ones shown, undeclared shapes offered for declaring ──
    chk('the check asks for strict ID checking by default', first.opts.idStrict === true);
    chk('the preview counts the member IDs kept, to be issued, and refused',
      /Member IDs — 2 kept · 1 to be issued · 1 refused/.test(previewText));
    chk('…and names the ID a new member will be given', previewText.includes('No Id Yet') && previewText.includes('→ 026-019'));
    chk('an ID shape the sheet uses that is not declared is shown, with its example',
      /not declared/i.test(previewText) && previewText.includes('OLD/19/042') && previewText.includes('AAA/99/999'));
    chk('a near miss of a real ID is named as a probable typo, with whose ID it is',
      previewText.includes('O24-016') && previewText.includes('024-016') && previewText.includes('Adams Anthony'));
    chk('registrations with no roster row are counted as applicants to confirm, not members',
      /3 to be filed as applications/.test(previewText) && /not members/i.test(previewText));
    await btn(/Download the ID list/).click();
    const csv = await page.evaluate(() => window.__blob ? window.__blob.text() : '');
    chk('the IDs the workbook lacks download as a CSV, named for the file',
      /^member-ids-NGG_Members-preview\.csv$/.test(await page.evaluate(() => window.__downloaded || ''))
      && csv.includes('No Id Yet,,026-019,to be issued') && csv.includes('24-1,024-001'));
    chk('…and a name that would run as a formula in a spreadsheet does not', csv.includes("'=Formula Kid"));
    await page.fill('.imp-year input', '2019');
    const callsBefore = await page.evaluate(() => window.__calls.length);
    await btn('Declare this format').click();
    await page.waitForFunction(() => window.__declared === true);
    await page.waitForTimeout(250);
    chk('declaring it sends the example', await page.evaluate(() => window.__declaredWith) === 'OLD/19/042');
    chk('…and the intake year it belongs to, so older IDs file members in their year', await page.evaluate(() => window.__declaredYear) === '2019');
    chk('…and reads the file again, because the old dry run promised the old answer',
      await page.evaluate(() => window.__calls.length) === callsBefore + 1 && !/not declared/i.test(await panel()));

    /* The drawer is the only way in on a host with no shell, so it is worth a
       picture in docs/screens. Fixture data only — a capture of the real
       roster would put children's names in the repository. */
    const shotFile = path.join(ROOT, 'docs', 'screens', '27-roster-import.png');
    fs.mkdirSync(path.dirname(shotFile), { recursive: true });
    await page.locator('.admin-drawer-panel').screenshot({ path: shotFile });
    const kb = Math.round(fs.statSync(shotFile).size / 1024);
    writeScreenIndex(path.join(ROOT, 'docs', 'screens'), [
      { name: '27-roster-import', label: 'Importing the members workbook without a shell — the dry run, before anything is written', kb },
    ]);
    console.log('  ✓ docs/screens/27-roster-import.png  (' + kb + ' KB)');

    // ── Overwrite is a decision that invalidates the preview ──
    const overwriteBox = page.getByRole('checkbox', { name: /Replace values the record/ });
    await overwriteBox.check();
    await page.waitForTimeout(120);
    chk('turning on overwrite withdraws the preview, because it is no longer the same import',
      await btn(/^Import 2 record/).count() === 0);
    await overwriteBox.uncheck();

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

    /* ── Hashing ────────────────────────────────────────────────────────────
       Two hashes, two jobs. fileSha identifies the FILE — the same number
       extract.js prints — and rides along on every post so an applied run can
       be traced back to a file on disk. expectDigest identifies the IMPORT and
       holds the apply to the roster the dry run described: without it, picking
       a different file after reading the preview writes something nobody
       confirmed, and the server has no way to notice. */
    const sha = calls[0] && calls[0].fileSha;
    chk('the file is hashed as it is read, before anything is posted',
      typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha));
    chk('…and every post carries the same hash for the same file',
      calls.every((c) => c.fileSha === sha));
    /* Independently computed: the fixture writes the roster file itself, so the
       expected digest is known here and the browser must arrive at it too. */
    const want = require('crypto').createHash('sha256').update(fs.readFileSync(rosterFile)).digest('hex');
    chk('…and it is the sha256 of the bytes on disk, not of something reserialised',
      sha === want);

    const applyCall = calls.filter((c) => c.opts && c.opts.apply === true)[0];
    chk('the apply names the import its dry run returned',
      applyCall && applyCall.opts.expectDigest === 'd'.repeat(64));
    chk('…and the dry run does not — there is nothing yet to be held to',
      calls[0].opts.expectDigest === undefined);

    // The shown hash is what a person can compare against the terminal.
    const shown = await panel();
    chk('the drawer shows the file hash, short enough to read against a terminal',
      shown.includes('sha256 ' + sha.slice(0, 12)));
    chk('…with the whole of it recoverable, not just the stub',
      (await page.getAttribute('.admin-drawer-panel [title^="sha256:"]', 'title')) === 'sha256:' + sha);
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
