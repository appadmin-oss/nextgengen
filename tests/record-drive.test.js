#!/usr/bin/env node
/* ============================================================================
   The member record drive (domain/profile-drive.php), end to end: staff set
   the drive in Control Room → Settings → Member records and see who is
   incomplete; a member is asked on the dashboard before the deadline and
   locked to the form after it (other member screens send them back to it);
   completing it opens the dashboard again; a suspended member is never
   locked; the join date is corrected only with a reason.

   Run:  node tests/record-drive.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RD_PORT || '8345';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-rd-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
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
const SHOTS = path.join(ROOT, 'tests', 'screens', 'record-drive');
const yearsAgo = (n, md) => (new Date().getFullYear() - n) + '-' + (md || '01-15');

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  record drive: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'record_drive_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false, 'maps' => ['offline' => true],
  ];\n`);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-RD-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','programmes'=>'ngg','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-RD-ADM','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-RD-KID','fullName'=>'Tobi','email'=>'tobi@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','displayId'=>'025-777','joinDate'=>'2025-03-01','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-RD-OLD','fullName'=>'Left Member','email'=>'left@example.org','type'=>'NGG','status'=>'suspended','role'=>'member','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const errs = [];
    const as = async (id, admin, at, w) => {
      const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), ${admin ? 'true' : 'false'});`);
      const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };
    fs.mkdirSync(SHOTS, { recursive: true });
    const future = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), past = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);

    console.log('staff: Control Room → Settings → Member records');
    const A = await as('NGG-RD-ADM', true, '/control/settings/member-records', 1400);
    await A.waitForSelector('.cr-rec', { timeout: 60000 });
    chk('the tab shows how complete the roster is and who is missing what (before the drive starts)', /active members asked/.test(await A.innerText('.cr-rec-kpis'))
      && /Tobi/.test(await A.innerText('.cr-rec-table')) && !/Left Member/.test(await A.innerText('.cr-rec')));
    await A.click('.cr-rec-phase:has-text("Collecting")');
    await A.fill('.cr-rec-row input[type=date]', future);
    await A.click('.cr-rec-actions .cr-btn');
    await A.waitForFunction(() => /Members are being asked/.test(document.body.innerText), null, { timeout: 15000 });
    chk('setting it to Collecting with a deadline is saved', JSON.parse(php(`echo json_encode(profile_drive());`)).phase === 'collect');
    await A.screenshot({ path: path.join(SHOTS, 'staff.png'), fullPage: true });
    await A.context().close();

    console.log('member: before the deadline');
    const M = await as('NGG-RD-KID', false, '/dashboard');
    await M.waitForSelector('.rec', { timeout: 60000 });
    chk('a card asks for the record, with the days left, and the dashboard is still there', /Complete your record/.test(await M.innerText('.rec')) && /days? left/.test(await M.innerText('.rec')) && !(await M.$('.rec.is-locked')));
    await M.context().close();

    console.log('member: after the deadline');
    php(`setting_set('profile_drive', array_merge(setting_get('profile_drive'), ['deadline' => '${past}']), 't');`
      + `db_update('members', ['photoUrl' => 'https://res.cloudinary.com/demo/image/upload/v1/face.jpg'], ['memberId' => 'NGG-RD-KID']);`);
    const L = await as('NGG-RD-KID', false, '/dashboard', 390);
    await L.waitForSelector('.rec.is-locked', { timeout: 60000 });
    await L.screenshot({ path: path.join(SHOTS, 'locked-phone.png'), fullPage: true });
    chk('after the deadline the dashboard is the record form, and it asks only what is missing', /Complete your record to carry on/.test(await L.innerText('.rec'))
      && !!(await L.$('#rec-dob')) && !!(await L.$('#rec-parentEmail')) && !(await L.$('#rec-centre')));
    chk('nothing scrolls sideways on a phone', await L.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    const blocked = await L.evaluate(() => NGGApi.member.requests ? NGGApi.member.requests().then(() => 'ok', e => e.code) : 'none');
    chk('another member action is refused as record_incomplete (a refusal, not an error)', blocked === 'record_incomplete' || blocked === 'none');
    await L.fill('#rec-fullName', 'tobi adewale');
    await L.fill('#rec-dob', '2013-05-04');
    await L.selectOption('#rec-sex', 'Female');
    await L.fill('#rec-school', 'Egbeda Senior High School');
    await L.selectOption('#rec-class', 'JSS 2');
    await L.fill('#rec-address', '3 Ola Street, Egbeda');
    await L.selectOption('#rec-resState', 'Lagos');
    await L.selectOption('#rec-resLga', 'Alimosho');
    await L.fill('#rec-parentName', 'bola adewale');
    await L.fill('#rec-parentPhone', '0803 123 4567');
    await L.fill('#rec-parentEmail', 'not-an-email');
    await L.click('.rec-actions .btn-primary');
    await L.waitForSelector('#rec-parentEmail-e', { timeout: 15000 });
    chk('a bad answer is named at its field and nothing else is lost', /full email address/.test(await L.innerText('#rec-parentEmail-e')) && (await L.inputValue('#rec-fullName')) === 'tobi adewale');
    await L.fill('#rec-parentEmail', 'bola@example.org');
    await L.click('.rec-actions .btn-primary');
    await L.waitForFunction(() => !document.querySelector('.rec.is-locked'), null, { timeout: 20000 }).catch(() => {});
    const row = JSON.parse(php(`echo json_encode(db_row("SELECT fullName, dob, parentPhone, profileJson FROM members WHERE memberId = 'NGG-RD-KID'"));`));
    chk('completing it saves the answers, normalised, and opens the dashboard again', row.fullName === 'Tobi Adewale' && row.dob === '2013-05-04' && row.parentPhone === '08031234567'
      && JSON.parse(row.profileJson).resLga === 'Alimosho' && !(await L.$('.rec.is-locked')));
    await L.context().close();

    console.log('a suspended member is never locked');
    chk('suspended: not asked, not locked', JSON.parse(php(`echo json_encode(profile_gate_for('NGG-RD-OLD'));`)).locked === false);

    console.log('staff: the join date');
    const J = await as('NGG-RD-ADM', true, '/control/members/members/NGG-RD-KID', 1400);
    await J.waitForSelector('button:has-text("Correct the join date")', { timeout: 60000 });
    await J.click('button:has-text("Edit")');
    await J.waitForSelector('form', { timeout: 15000 });
    chk('the member edit form no longer carries the join date, and has the record answers', !/Date joined/.test(await J.innerText('form')) && /Home address/.test(await J.innerText('form')));
    await J.keyboard.press('Escape');
    await J.click('button:has-text("Correct the join date")');
    await J.waitForSelector('form:has-text("Why it is being corrected")', { timeout: 15000 });
    await J.fill('form input[type=date]', '2024-09-07');
    await J.fill('form textarea', 'The register shows September');
    await J.click('form button[type=submit]');
    await J.waitForFunction(() => /2025 intake/.test(document.body.innerText), null, { timeout: 15000 }).then(() => chk('a date outside the intake year on the printed ID is refused, with why', true), () => chk('a date outside the intake year on the printed ID is refused, with why', false));
    await J.fill('form input[type=date]', '2025-02-15');
    await J.click('form button[type=submit]');
    await J.waitForFunction(() => /Join date corrected/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    chk('…a date in it is saved, with the reason on record', php(`echo db_row("SELECT joinDate FROM members WHERE memberId = 'NGG-RD-KID'")['joinDate'];`) === '2025-02-15'
      && /register shows September/.test(php(`echo db_row("SELECT meta FROM audit_log WHERE event = 'admin.member.joindate' ORDER BY id DESC LIMIT 1")['meta'];`)));
    await J.context().close();

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (record drive)`);
    process.exit(failed ? 1 : 0);
  }
})();
