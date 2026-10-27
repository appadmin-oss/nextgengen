#!/usr/bin/env node
/* ============================================================================
   Summer School portal v3, end to end (src/modules/summer3/ss3-app.jsx over
   domain/summer-portal.php). The portal opens on Today from live figures; the
   palette finds a child and opens their drawer; "g" shortcuts move between
   screens; a bulk alert is PARKED on the server and Undo cancels it there, so
   nothing is sent; the desk checks a child in by card code through the one
   check-in op; Into NGG moves a graduate once the undo window closes; and the
   phone layout has a tab bar and no sideways scroll.

   Run:  node tests/summer-portal-v3.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SS3_PORT || '8333';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ss3-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=1 -d error_reporting=-1 ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed (' + e.status + '): ' + String(e.stdout || '') + String(e.stderr || '')); }
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
async function as(memberId, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), true);`);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && /Warning: Cannot update|Maximum update depth|is not a function|undefined/.test(m.text())) pg.errs.push('console: ' + m.text().slice(0, 300)); });
  return pg;
}
const text = (pg) => pg.evaluate(() => document.body.innerText);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  summer portal v3: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'ss3_e2e_secret_portal_x_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'seed_bundled_curriculum' => false,
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    /* One live edition. Doors at 00:00 and sign-out at 00:01 so a check-in
       made whenever this runs is graded deterministically (late) and a
       check-out is never "too early". Six earlier register days. */
    php(`
      $now = now_iso(); $A = 'NGG-SS3E-ADM';
      db_insert('members', ['memberId' => $A, 'fullName' => 'Adaeze Okafor', 'email' => 'adaeze@example.org', 'type' => 'NGG', 'status' => 'active', 'role' => 'super_admin', 'centre' => 'Egbeda', 'totpSecret' => 'JBSWY3DPEHPK3PXP', 'createdAt' => $now, 'updatedAt' => $now]);
      setting_set('programme', ['enabled' => false], $A);
      setting_set('attendance', ['enabled' => true, 'tzOffset' => 0, 'graceMinutes' => 0, 'resumptionByType' => ['student' => '00:00', 'volunteer' => '00:00'], 'closeByType' => ['student' => '00:01']], $A);
      $ed = 'SS3E-ED';
      db_insert('summer_cohorts', ['cohortId' => $ed, 'year' => 2026, 'name' => 'Summer 2026', 'startDate' => gmdate('Y-m-d', strtotime('-20 days')), 'endDate' => gmdate('Y-m-d', strtotime('+20 days')), 'status' => 'active', 'createdAt' => $now]);
      $kid = function ($id, $name, $extra = []) use ($ed, $now) {
        db_insert('summer_students', array_merge(['studentId' => $id, 'cohortId' => $ed, 'token' => 'SS3E-' . $id, 'handle' => strtolower($id), 'fullName' => $name, 'centre' => 'Egbeda', 'track' => 'Coding',
          'status' => 'active', 'regStatus' => 'verified', 'guardianName' => 'Guardian of ' . $name, 'guardianPhone' => '08030000000', 'parentEmail' => strtolower($id) . '@example.org',
          'displayId' => 'EG-26-' . substr($id, -3), 'enrolledAt' => $now, 'updatedAt' => $now], $extra));
        db_insert('qr_codes', ['token' => 'SS3E-' . $id, 'batch' => 'B-E2E', 'cohortId' => $ed, 'status' => 'assigned', 'studentId' => $id, 'assignedName' => $name, 'createdAt' => $now, 'assignedAt' => $now]);
      };
      $kid('SS3E-001', 'Adaora Steady');
      $kid('SS3E-002', 'Bolu Stopped');
      $kid('SS3E-003', 'Chidi Absent');
      $mark = function ($id, $daysAgo) use ($ed) {
        $d = gmdate('Y-m-d', strtotime(attendance_today() . ' -' . $daysAgo . ' days'));
        db_insert('attendance', ['cohortId' => $ed, 'studentId' => $id, 'token' => 'SS3E-' . $id, 'date' => $d, 'checkInAt' => $d . 'T08:30:00Z', 'method' => 'qr', 'status' => 'present', 'createdAt' => now_iso()]);
      };
      foreach ([6, 5, 4, 3, 2, 1] as $n) { $mark('SS3E-001', $n); $mark('SS3E-003', $n); }
      foreach ([6, 5, 4] as $n) $mark('SS3E-002', $n);
      // An NGG centre for a graduate to move into (and the Summer School venue's name).
      db_insert('centres', ['centreId' => 'CEN-E2E-EGB', 'name' => 'Egbeda', 'code' => 'EG', 'status' => 'active', 'programmes' => json_encode(['ngg', 'summer'])]);
      db_insert('summer_groups', ['groupId' => 'GRP-E2E', 'cohortId' => $ed, 'code' => 'EG-A', 'name' => 'Egbeda Coders', 'centreId' => '', 'track' => 'Coding', 'capacity' => 10, 'status' => 'active', 'createdAt' => $now, 'updatedAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));

    // ── Today, from live figures ──
    const pg = await as('NGG-SS3E-ADM');
    await pg.goto(BASE + '/summer-admin', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('.ss3x .ss3-app', { timeout: 60000 });
    await pg.waitForFunction(() => /Live register/.test(document.body.innerText) && /Needs you/.test(document.body.innerText), null, { timeout: 20000 });
    let t = await text(pg);
    chk('Today opens on the live edition', /Summer 2026/.test(t) && /Live register/.test(t));
    chk('Today shows nobody in yet, of three expected', /of 3 expected/.test(t));
    chk('Needs you names the child who came then stopped', /Children came, then stopped/.test(t) && /Bolu Stopped/.test(t));
    chk('Right now is drawn from the door rules, not a sample timetable', !/Morning circle|Week \d · /.test(t));
    chk('no sample names from the design', !/Ada Obi|Mrs Adeyemi|Egbeda Community Hall/.test(t));

    // ── The palette: server search, then the child's drawer ──
    await pg.keyboard.press('/');
    await pg.waitForSelector('[role="dialog"][aria-label="Search or jump to"] input', { timeout: 5000 });
    await pg.keyboard.type('Bolu');
    await pg.waitForFunction(() => /EG-26-002/.test((document.querySelector('[role="dialog"][aria-label="Search or jump to"]') || {}).innerText || ''), null, { timeout: 8000 });
    chk('/ opens the palette and it finds a child by name', true);
    await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => { const h = document.getElementById('sel-h'); return h && /Bolu Stopped/.test(h.innerText); }, null, { timeout: 8000 });
    t = await text(pg);
    chk('Enter opens the child’s drawer with their guardian and consents', /Guardian of Bolu Stopped/.test(t) && /Emergency medical care/.test(t));
    await pg.keyboard.press('Escape');
    await pg.waitForFunction(() => !document.getElementById('sel-h'), null, { timeout: 5000 });
    chk('Esc closes the drawer', true);
    const rec = q(`array_column(db_all("SELECT studentId FROM summer_recent"), 'studentId')`);
    chk('opening a child is remembered as recent', rec.includes('SS3E-002'));

    // ── g shortcuts ──
    await pg.keyboard.press('g'); await pg.keyboard.press('p');
    await pg.waitForFunction(() => /Every child in Summer 2026/.test(document.body.innerText) && /3 children/.test(document.body.innerText), null, { timeout: 10000 });
    chk('g p opens Participants with every child counted', /[?&]s=participants/.test(pg.url()));
    await pg.click('button[role="tab"]:has-text("Stopped coming")');
    await pg.waitForFunction(() => /1 child\b/.test(document.body.innerText), null, { timeout: 8000 });
    chk('the Stopped coming view is exactly the one child Today named', /Bolu Stopped/.test(await text(pg)) && !/Adaora Steady/.test(await text(pg)));
    await pg.keyboard.press('?');
    await pg.waitForSelector('#kb-h', { timeout: 5000 });
    chk('? lists the keyboard shortcuts', /Undo the last bulk action/.test(await text(pg)));
    await pg.keyboard.press('Escape');

    // ── A parked bulk alert, undone on the server ──
    await pg.keyboard.press('g'); await pg.keyboard.press('r');
    await pg.waitForFunction(() => /Alert all 3 guardians/.test(document.body.innerText), null, { timeout: 10000 });
    await pg.click('button:has-text("Alert all 3 guardians")');
    await pg.waitForFunction(() => /Undo · \d+s/.test(document.body.innerText), null, { timeout: 8000 });
    const parked = q(`db_row("SELECT status, n FROM pending_actions ORDER BY id DESC LIMIT 1")`);
    chk('the alert is parked on the server for its window, for three guardians', parked.status === 'pending' && +parked.n === 3);
    await pg.keyboard.press('z');
    await pg.waitForFunction(() => /Undone\. Nothing was sent\./.test(document.body.innerText), null, { timeout: 8000 });
    chk('z undoes it: the parked act is cancelled, so nothing was sent', q(`db_row("SELECT status FROM pending_actions ORDER BY id DESC LIMIT 1")['status']`) === 'cancelled');

    // ── The desk: a card code through the one check-in op ──
    await pg.keyboard.press('g'); await pg.keyboard.press('d');
    await pg.waitForSelector('input[aria-label="Card code, ID or name"]', { timeout: 10000 });
    await pg.fill('input[aria-label="Card code, ID or name"]', 'ss3e-ss3e-001');
    await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => /Welcome, Adaora/.test(document.body.innerText), null, { timeout: 10000 });
    chk('the desk checks a child in by card code', q(`(int)db_row("SELECT COUNT(*) c FROM attendance WHERE studentId = 'SS3E-001' AND date = '" . attendance_today() . "'")['c']`) === 1);
    await pg.fill('input[aria-label="Card code, ID or name"]', 'Nobody Like This');
    await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => /No child found/.test(document.body.innerText), null, { timeout: 8000 });
    chk('an unknown code is said in words', true);
    await pg.waitForFunction(() => /Adaora Steady/.test(document.body.innerText) && /Scans by centre/.test(document.body.innerText), null, { timeout: 8000 });
    chk('the latest scans show the check-in', true);
    chk('the desk promises no camera or offline mode it does not have', !/Hold the card up to the camera|Works offline/.test(await text(pg)));
    // Shortcuts are ignored while typing; leave the desk's box first.
    await pg.evaluate(() => document.activeElement && document.activeElement.blur());

    // ── Cards: voiding asks first, in the portal's own dialog ──
    await pg.goto(BASE + '/summer-admin?s=cards', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('input[aria-label="Card code"]', { timeout: 60000 });
    await pg.fill('input[aria-label="Card code"]', 'ss3e-ss3e-002');
    await pg.waitForFunction(() => /Bolu Stopped/.test(document.body.innerText), null, { timeout: 8000 });
    await pg.click('button:has-text("Void card")');
    await pg.waitForSelector('#m-h', { timeout: 5000 });
    chk('voiding a card asks in the portal’s own dialog', /Void card SS3E-SS3E-002\?/.test(await pg.innerText('#m-h')));
    await pg.click('[role="dialog"] button:has-text("Cancel")');
    await pg.waitForFunction(() => !document.getElementById('m-h'), null, { timeout: 5000 });
    chk('Cancel voids nothing', q(`db_row("SELECT status FROM qr_codes WHERE token = 'SS3E-SS3E-002'")['status']`) === 'assigned');

    // ── Incidents: logged, told, and a safeguarding one goes to the lead ──
    await pg.evaluate(() => document.activeElement && document.activeElement.blur());
    await pg.keyboard.press('g'); await pg.keyboard.press('i');
    await pg.waitForFunction(() => /Guardian not told/.test(document.body.innerText), null, { timeout: 15000 });
    chk('g i opens Incidents', /[?&]s=incidents/.test(pg.url()));
    await pg.click('button:has-text("Log an incident")');
    await pg.waitForSelector('#in-f', { timeout: 5000 });
    await pg.fill('input[placeholder="Full name"]', 'Chidi Absent');
    await pg.fill('textarea[placeholder^="Facts only"]', 'Grazed knee in the yard at break. Cleaned and plastered.');
    await pg.click('button:has-text("Save incident")');
    await pg.waitForFunction(() => /logged for Chidi Absent/.test(document.body.innerText), null, { timeout: 10000 });
    chk('an incident is logged against the child on the roster', q(`(int)db_row("SELECT COUNT(*) c FROM summer_incidents WHERE studentId = 'SS3E-003'")['c']`) === 1);
    chk('it shows as guardian not told, with the button to tell them', /Guardian not told yet/.test(await text(pg)) && !!(await pg.$('button:has-text("Tell guardian")')));
    await pg.click('button:has-text("Log an incident")');
    await pg.waitForSelector('#in-f', { timeout: 5000 });
    await pg.fill('input[placeholder="Full name"]', 'Bolu Stopped');
    await pg.selectOption('#in-f ~ * select, section[aria-labelledby="in-f"] select >> nth=0', 'Safeguarding');
    await pg.waitForFunction(() => /straight to the safeguarding lead/.test(document.body.innerText), null, { timeout: 5000 });
    chk('choosing Safeguarding says where it goes before it is saved', true);
    await pg.fill('textarea[placeholder^="Facts only"]', 'Said something worrying about home at break.');
    await pg.click('button:has-text("Save incident")');
    await pg.waitForFunction(() => /as case C-/.test(document.body.innerText), null, { timeout: 10000 });
    t = await text(pg);
    chk('a safeguarding incident becomes a case the portal cannot read', /Restricted/.test(t) && !/worrying about home/.test(t)
      && q(`(int)db_row("SELECT COUNT(*) c FROM safeguarding_cases WHERE subjectName = 'Bolu Stopped'")['c']`) === 1);

    // ── Messages: a template to an audience, parked, then sent and recorded ──
    await pg.evaluate(() => document.activeElement && document.activeElement.blur());
    await pg.keyboard.press('g'); await pg.keyboard.press('m');
    await pg.waitForSelector('#ms-c', { timeout: 15000 });
    await pg.click('button[aria-pressed]:has-text("A note from Summer School")');
    await pg.selectOption('section[aria-labelledby="ms-c"] select', 'all');
    await pg.fill('input[placeholder="One or two sentences"]', 'Bring a water bottle tomorrow');
    await pg.waitForFunction(() => /Bring a water bottle tomorrow/.test(document.body.innerText) && /Send to 3 guardians/.test(document.body.innerText), null, { timeout: 5000 });
    chk('the preview fills the template, and the button names who it reaches', !/Mrs Adeyemi/.test(await text(pg)));
    await pg.click('button:has-text("Send to 3 guardians")');
    await pg.waitForFunction(() => /Undo · \d+s/.test(document.body.innerText), null, { timeout: 8000 });
    chk('a send waits out its undo window: nothing recorded yet', !q(`db_row("SELECT id FROM summer_messages")`));
    await pg.waitForFunction(() => /of 3 reached/.test(document.body.innerText), null, { timeout: 20000 });
    chk('then it goes, and the Sent list records it once', q(`(int)db_row("SELECT COUNT(*) c FROM summer_messages")['c']`) === 1 && /families/.test(await text(pg)));

    // ── Into NGG: a graduate moves once the undo window closes ──
    await pg.keyboard.press('g'); await pg.keyboard.press('n');
    await pg.waitForFunction(() => /Adaora Steady/.test(document.body.innerText) && /Move to NGG/.test(document.body.innerText), null, { timeout: 15000 });
    t = await text(pg);
    chk('Into NGG lists the graduates at or over the rate, not the child who stopped', /Chidi Absent/.test(t) && !/Bolu Stopped/.test(t));
    chk('fees switched off read as off, never as ₦0', /Fees are off/.test(t) && !/₦0\b/.test(t));
    await pg.getByRole('button', { name: 'Move to NGG' }).first().click();
    await pg.waitForFunction(() => /Undo · \d+s/.test(document.body.innerText), null, { timeout: 8000 });
    chk('a move waits out its window: no member yet', !q(`db_row("SELECT memberId FROM members WHERE fromSummerId = 'SS3E-001'")`));
    await pg.waitForFunction(() => /now NGG members?/.test(document.body.innerText), null, { timeout: 20000 });
    chk('when the window closes the child is an NGG member, recorded as from Summer School', !!q(`db_row("SELECT memberId FROM members WHERE fromSummerId = 'SS3E-001'")`));

    chk('no script errors on the desktop portal', pg.errs.length === 0);
    if (pg.errs.length) console.error(pg.errs.join('\n'));

    // ── Phone ──
    const ph = await as('NGG-SS3E-ADM', { width: 390, height: 844 });
    await ph.goto(BASE + '/summer-admin?s=participants', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ph);
    await ph.waitForFunction(() => /3 children/.test(document.body.innerText), null, { timeout: 60000 });
    chk('a shared ?s= link opens the same screen', /Every child in Summer 2026/.test(await text(ph)));
    chk('the phone has the bottom tab bar', !!(await ph.$('nav[aria-label="Main"]')));
    const sw = await ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk('no sideways scroll at 390px', sw <= 1);
    chk('no script errors on the phone', ph.errs.length === 0);
    if (ph.errs.length) console.error(ph.errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌' : '✅') + ' summer portal v3: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
