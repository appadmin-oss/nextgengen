#!/usr/bin/env node
/* ============================================================================
   School results, end to end against a real PHP server, on the screens that
   carry them: the member dashboard (/dashboard/results) and the Mentor Portal
   (/mentor → School results). Upload → Check → Plan → Send with the photo on
   this server's own store, the "when and where" rule on screen and on the
   server, a weekly tick; then the mentor sends it back with a note and, once
   resent, approves it. The withdrawn /member/* addresses forward to the
   dashboard section that holds the same thing. Edit profile shows the managed
   details read-only and its "Ask for a change" opens Requests.

   Run:  node tests/dashboard-results.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.DRT_PORT || '8352';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-drt-'));
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
const SHOTS = path.join(ROOT, 'tests', 'screens', 'dashboard-results');

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  member portal: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'member_portal_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'photo_dir' => ${JSON.stringify(path.join(TMP, 'photos'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false, 'maps' => ['offline' => true],
  ];\n`);
  // A report card photo: a real PNG, big enough to be a photo.
  const png = path.join(TMP, 'report.png');
  execSync(`php -r '$i=imagecreatetruecolor(900,1200);imagefill($i,0,0,imagecolorallocate($i,250,250,245));for($y=60;$y<1100;$y+=60)imageline($i,40,$y,860,$y,imagecolorallocate($i,30,30,30));imagestring($i,5,60,20,"TERM REPORT",0);imagepng($i,${JSON.stringify(png)});'`);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-MP-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','programmes'=>'ngg','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-MPT-1','fullName'=>'Amaka Obi','email'=>'amaka@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'tech','displayId'=>'025-101','dob'=>'2011-04-02','school'=>'Egbeda High','parentName'=>'Mrs Obi','parentPhone'=>'+2348031234567','joinDate'=>'2025-01-10','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-MPT-M','fullName'=>'Remi Mentor','email'=>'remi@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','dob'=>'1990-01-01','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('mentors', ['mentorId'=>'MEN-MPT','fullName'=>'Remi Mentor','email'=>'remi@example.org','status'=>'active','centre'=>'Egbeda','programme'=>'ngg','memberId'=>'NGG-MPT-M','checkedAt'=>${now},'maxMentees'=>8,'joinedAt'=>'2025-01-01','rank'=>'mentor','createdAt'=>${now}]);`
      + `db_insert('mentor_assignments', ['memberId'=>'NGG-MPT-1','mentorId'=>'MEN-MPT','status'=>'active','startedAt'=>'2025-02-01']);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const errs = [];
    const as = async (id, at, w) => {
      const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), false);`);
      const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };
    fs.mkdirSync(SHOTS, { recursive: true });

    console.log('Addresses');
    const P = await as('NGG-MPT-1', '/member/grow/results');
    await P.waitForSelector('.dash-results .rs-steps', { timeout: 60000 });
    chk('an old /member/grow/results link opens the dashboard’s School results', new URL(P.url()).pathname === '/dashboard/results');
    chk('the section is a dashboard tab, and it is the selected one', (await P.innerText('.dash-tabs [aria-current="page"]')).trim() === 'School results');
    chk('the stepper starts at Upload', /Upload/.test(await P.innerText('.rs-steps li.is-on')));

    console.log('Upload · Check · Plan · Send');
    const [chooser] = await Promise.all([P.waitForEvent('filechooser'), P.click('.rs-pick .pt-btn:not(.pt-btn--ink)')]);
    await chooser.setFiles(png);
    await P.waitForSelector('.rs-table', { timeout: 30000 });
    chk('with no reader configured the Check step says so and asks for the scores', /couldn’t read the report/i.test(await P.innerText('.dash-results .pt-card')));
    chk('the stored report is this server’s own photo store', /\/api\/public\/photo\.php\?p=/.test(php(`echo db_row("SELECT fileUrl FROM results_uploads WHERE memberId = 'NGG-MPT-1'")['fileUrl'];`)));
    const rows = [['Mathematics', '48'], ['English Language', '71'], ['Biology', '60']];
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) await P.click('button:has-text("Add subject")');
      await P.fill(`.rs-tr:nth-child(${i + 2}) input >> nth=0`, rows[i][0]);
      await P.fill(`.rs-tr:nth-child(${i + 2}) input >> nth=1`, rows[i][1]);
    }
    await P.click('button:has-text("These are right")');
    await P.waitForSelector('.rs-item', { timeout: 30000 });
    const items = await P.$$eval('.rs-item .pt-card-h h2', h => h.map(x => x.innerText));
    chk('the plan picks the weakest subjects, at most three', items[0] === 'Mathematics' && items.length === 3);
    chk('the target starts at current + 8', (await P.innerText('.rs-item >> nth=0 >> .rs-target b')) === '56');
    await P.click('.rs-commit input');
    await P.click('button:has-text("Send to my mentor")');
    await P.waitForSelector('.rs-item .pt-field.is-bad', { timeout: 5000 });
    chk('sending without "when and where" marks every empty one and sends nothing', (await P.$$('.rs-item .pt-field.is-bad')).length === 3
      && php(`echo db_row("SELECT status FROM growth_plans WHERE memberId = 'NGG-MPT-1'")['status'];`) === 'draft');
    const when = ['Monday and Thursday after school, dining table', 'Wednesday 5pm in my room', 'Saturday 4pm at the centre'];
    const fillWhen = async () => { for (let i = 0; i < 3; i++) await P.fill(`.rs-item >> nth=${i} >> input[placeholder^="e.g. Monday"]`, when[i]); };
    await fillWhen();
    await P.click('.rs-item >> nth=0 >> button[aria-label="Raise the target"]');
    await P.click('button:has-text("Send to my mentor")');
    await P.waitForSelector('.rs-where', { timeout: 20000 });
    chk('sent: "Where it is" shows it is with the mentor', /With your mentor/.test(await P.innerText('.rs-where')));
    chk('the raised target was what the server stored', php(`echo db_row("SELECT target FROM growth_plan_items WHERE subject = 'Mathematics'")['target'];`) === '57');
    chk('the mentor was told, and the email opens the Mentor Portal’s School results', php(`echo db_row("SELECT COUNT(*) n FROM notifications WHERE memberId = 'NGG-MPT-M' AND title LIKE '%sent their results and plan'")['n'];`) === '1');
    await P.click('.rs-ticks li >> nth=0 >> button:has-text("I did one")');
    await P.waitForFunction(() => document.querySelectorAll('.rs-ticks li:first-child .rs-dots .is-on').length === 1, null, { timeout: 10000 });
    chk('a tick is recorded on the server', php(`echo db_row("SELECT SUM(done) n FROM plan_checkins")['n'];`) === '1');
    chk('the cards take the dashboard’s white, not the withdrawn portal’s grey page', await P.evaluate(() => getComputedStyle(document.querySelector('.dash-results')).getPropertyValue('--pt-page').trim() === 'transparent'));
    await P.screenshot({ path: path.join(SHOTS, 'member-sent.png'), fullPage: true });

    console.log('The mentor: send back, then approve');
    const M = await as('NGG-MPT-M', '/mentor?tab=results');
    await M.waitForSelector('.mtr-plans', { timeout: 60000 });
    chk('/mentor?tab=results opens School results in the Mentor Portal', (await M.getAttribute('[role="tab"][aria-selected="true"]', 'role')) === 'tab'
      && /School results/.test(await M.innerText('[role="tab"][aria-selected="true"]')));
    await M.waitForSelector('.mtr-plan-row', { timeout: 20000 });
    chk('the plan is waiting, under the mentee’s name', /Amaka Obi/.test(await M.innerText('.mtr-plan-row')));
    await M.screenshot({ path: path.join(SHOTS, 'mentor-waiting.png'), fullPage: true });
    await M.click('.mtr-plan-row');
    await M.waitForSelector('.mtr-items', { timeout: 20000 });
    chk('the mentor reads the scores and the plan', /Mathematics/.test(await M.innerText('.mtr-scores')) && /dining table/.test(await M.innerText('.mtr-items')));
    await M.click('button:has-text("Send it back")');
    chk('sending back without a note is stopped on screen', /short note/.test(await M.innerText('.mtr-msg')));
    await M.fill('#mtr-note', 'Make the Biology slot earlier in the week.');
    await M.click('button:has-text("Send it back")');
    await M.waitForFunction(() => /Sent back/.test((document.querySelector('.mtr-msg') || {}).innerText || ''), null, { timeout: 15000 });
    chk('sent back: the plan returns to the member as a draft with the note', php(`echo db_row("SELECT status FROM growth_plans WHERE memberId = 'NGG-MPT-1'")['status'];`) === 'draft');
    await P.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(P);
    await P.waitForSelector('.rs-returned', { timeout: 60000 });
    chk('the member sees the mentor’s note on the dashboard', /Biology slot earlier/.test(await P.innerText('.rs-returned')));
    await P.click('.rs-commit input').catch(() => {});
    if (!(await P.isChecked('.rs-commit input'))) await P.click('.rs-commit input');
    await P.click('button:has-text("Send to my mentor")');
    await P.waitForSelector('.rs-where', { timeout: 20000 });
    await M.click('.mtr-back');
    await M.waitForSelector('.mtr-plan-row', { timeout: 20000 });
    await M.click('.mtr-plan-row');
    await M.waitForSelector('button:has-text("Approve the plan")', { timeout: 20000 });
    await M.click('button:has-text("Approve the plan")');
    await M.waitForFunction(() => /Approved/.test((document.querySelector('.mtr-msg') || {}).innerText || ''), null, { timeout: 15000 });
    chk('approved: the plan is live', php(`echo db_row("SELECT status FROM growth_plans WHERE memberId = 'NGG-MPT-1'")['status'];`) === 'live');
    chk('…and the member is told', php(`echo db_row("SELECT COUNT(*) n FROM notifications WHERE memberId = 'NGG-MPT-1' AND title = 'Your plan is approved'")['n'];`) === '1');
    await M.screenshot({ path: path.join(SHOTS, 'mentor-approved.png'), fullPage: true });
    await M.context().close();

    console.log('Edit profile');
    await P.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' }); await waitForBoot(P);
    await P.waitForSelector('button:has-text("Edit profile")', { timeout: 60000 });
    await P.click('button:has-text("Edit profile") >> nth=0');
    await P.waitForSelector('.dash-managed', { timeout: 10000 });
    chk('school and phone are shown, managed by NGG, not editable', /Egbeda High/.test(await P.innerText('.dash-managed')) && !(await P.$('.dash-managed input')));
    await P.fill('.admin-drawer-panel textarea', 'I build robots.');
    await P.click('.admin-drawer-panel button:has-text("Save")');
    await P.waitForFunction(() => !document.querySelector('.admin-drawer-panel'), null, { timeout: 15000 });
    chk('saving the bio works (the form no longer sends the fields the server refuses)', php(`echo db_row("SELECT bio FROM members WHERE memberId = 'NGG-MPT-1'")['bio'];`) === 'I build robots.');
    await P.click('button:has-text("Edit profile") >> nth=0');
    await P.click('.dash-managed button:has-text("Ask for a change")');
    await P.waitForFunction(() => location.pathname === '/dashboard/requests' && /Correct my details/.test(document.body.innerText), null, { timeout: 20000 });
    chk('"Ask for a change" opens Requests with that request ready to write', true);
    await P.context().close();

    console.log('Phone');
    const F = await as('NGG-MPT-1', '/dashboard/results', 390);
    await F.waitForSelector('.dash-results .rs-where, .dash-results .rs-steps', { timeout: 60000 });
    chk('School results on a phone: nothing scrolls sideways', await F.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await F.screenshot({ path: path.join(SHOTS, 'member-phone.png'), fullPage: true });
    await F.context().close();

    chk('no script errors on any screen (' + errs.slice(0, 2).join(' | ') + ')', errs.length === 0);
  } catch (e) {
    failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close();
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (school results)');
  process.exit(failed ? 1 : 0);
})();
