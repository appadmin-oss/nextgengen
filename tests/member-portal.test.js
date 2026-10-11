#!/usr/bin/env node
/* ============================================================================
   The Member Portal (src/modules/portal/*), end to end against a real PHP
   server: /dashboard forwards to /member; Today's To do comes from the server
   in its order and its rows navigate; Grow → School results goes Upload →
   Check → Plan → Send with the photo stored on this server (no Cloudinary),
   the "when and where" rule enforced on screen and by the server; a weekly
   tick; the profile is read-only and "Ask for a change" opens the desk with
   that request chosen; the phone layout has the five areas as a bottom bar.

   Run:  node tests/member-portal.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MPT_PORT || '8352';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mpt-'));
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
const SHOTS = path.join(ROOT, 'tests', 'screens', 'member-portal');

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

    console.log('Today');
    const P = await as('NGG-MPT-1', '/dashboard');
    await P.waitForSelector('.pt-todo-i', { timeout: 60000 });
    chk('/dashboard forwards to /member', new URL(P.url()).pathname === '/member');
    chk('five areas in the sidebar', (await P.$$eval('.pt-nav-i', b => b.map(x => x.innerText.trim().split('\n')[0]))).join('|') === 'Today|Mentor|Grow|Learn|Account');
    chk('the page title greets the member by first name', /, Amaka\./.test(await P.innerText('.pt-head h1')));
    const todo = await P.$$eval('.pt-todo-i b', b => b.map(x => x.innerText));
    chk('To do leads with the school results that are owed', /results/i.test(todo[0] || ''));
    chk('Grow carries a badge for the results that are due', /1/.test(await P.innerText('.pt-nav-i:has-text("Grow")')));
    chk('this week shows Saturday and the mentor by name', /Saturday|Today/.test(await P.innerText('.mbr-sat')) && /Remi Mentor/.test(await P.innerText('.mbr-mentor')));
    chk('where you stand: the figures that have something to say, each a button to its screen (no Anchor week shown before it starts)', (await P.$$('.pt-stats .pt-stat')).length === 3);
    await P.click('.mbr-mood:has-text("I’m okay")');
    await P.waitForSelector('.mbr-done', { timeout: 15000 });
    chk('one tap on "I’m okay" records this week’s check-in', php(`echo db_row("SELECT wellbeing FROM member_checkins WHERE memberId = 'NGG-MPT-1'")['wellbeing'];`) === 'Okay');
    chk('Today shows no empty "–" figures', !/(^|\n)–(\n|$)/.test(await P.innerText('.pt-stats')));
    await P.screenshot({ path: path.join(SHOTS, 'today.png'), fullPage: true });

    console.log('Mentor → chat');
    await P.click('.pt-nav-i:has-text("Mentor")');
    await P.waitForSelector('.mbr-compose textarea', { timeout: 20000 });
    chk('My mentor opens on the chat, with the mentor named', /Remi Mentor/.test(await P.innerText('.mbr-mhead')));
    await P.fill('.mbr-compose textarea', 'Can we talk about maths on Saturday?');
    await P.click('.mbr-compose button[type=submit]');
    await P.waitForFunction(() => /Can we talk about maths/.test(document.querySelector('.mbr-thread').innerText), null, { timeout: 15000 });
    const inbox = JSON.parse(php(`echo json_encode(member_mp_messages(['requesterId' => 'NGG-MPT-M'])['messages']);`));
    chk('the message reaches the mentor’s inbox as a message from their mentee', inbox.some(m => m.filter === 'chat' && /maths on Saturday/.test(m.body)));
    const tid = inbox.find(m => m.filter === 'chat').threadId;
    php(`$GLOBALS['__mp_now_override'] = 1; db_insert('mentor_messages', ['threadId' => '${tid}', 'kind' => 'Reply', 'subjectId' => 'NGG-MPT-1', 'fromId' => 'NGG-MPT-M', 'fromName' => 'Remi Mentor', 'toId' => 'NGG-MPT-1', 'body' => 'Yes, bring your book.', 'status' => 'sent', 'createdAt' => now_iso()]);`);
    await P.click('.pt-seg button:has-text("Next steps")'); await P.click('.pt-seg button:has-text("Chat")');
    await P.waitForFunction(() => { const t = document.querySelector('.mbr-thread'); return t && /bring your book/.test(t.innerText); }, null, { timeout: 15000 });
    chk('the mentor’s reply appears in the member’s thread', true);
    await P.fill('.mbr-compose textarea', 'I want to hurt myself');
    await P.click('.mbr-compose button[type=submit]');
    await P.waitForSelector('.mbr-crisis', { timeout: 15000 });
    chk('a crisis message still goes, and the member is shown who to call now', /112/.test(await P.innerText('.mbr-crisis'))
      && php(`echo db_row("SELECT COUNT(*) n FROM audit_log WHERE event = 'safeguarding.chat'")['n'];`) === '1');

    console.log('Grow → School results');
    await P.click('.pt-nav-i:has-text("Today")');
    await P.waitForSelector('.pt-todo-i', { timeout: 20000 });
    await P.click('.pt-todo-i:first-child .pt-btn');
    await P.waitForSelector('.rs-steps', { timeout: 20000 });
    chk('the To do row lands on /member/grow/results with the stepper at Upload', new URL(P.url()).pathname === '/member/grow/results'
      && /Upload/.test(await P.innerText('.rs-steps li.is-on')));
    chk('the tab strip shows the Grow tabs, School results selected', (await P.getAttribute('.pt-tab[aria-selected="true"]', 'id')) === 'pt-tab-results');
    const [chooser] = await Promise.all([P.waitForEvent('filechooser'), P.click('.rs-pick .pt-btn:not(.pt-btn--ink)')]);
    await chooser.setFiles(png);
    await P.waitForSelector('.rs-table', { timeout: 30000 });
    chk('with no reader configured the Check step says so and asks for the scores', /couldn’t read the report/i.test(await P.innerText('.pt-card')));
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
    chk('the plan step shows the four figures', /Average/.test(await P.innerText('.pt-stats')));
    await P.click('.rs-commit input');
    await P.click('button:has-text("Send to my mentor")');
    await P.waitForSelector('.rs-item .pt-field.is-bad', { timeout: 5000 });
    chk('sending without "when and where" marks every empty one and sends nothing', (await P.$$('.rs-item .pt-field.is-bad')).length === 3
      && php(`echo db_row("SELECT status FROM growth_plans WHERE memberId = 'NGG-MPT-1'")['status'];`) === 'draft');
    const when = ['Monday and Thursday after school, dining table', 'Wednesday 5pm in my room', 'Saturday 4pm at the centre'];
    for (let i = 0; i < 3; i++) await P.fill(`.rs-item >> nth=${i} >> input[placeholder^="e.g. Monday"]`, when[i]);
    await P.click('.rs-item >> nth=0 >> button[aria-label="Raise the target"]');
    await P.click('button:has-text("Send to my mentor")');
    await P.waitForSelector('.rs-where', { timeout: 20000 });
    chk('sent: "Where it is" shows it is with the mentor', /With your mentor/.test(await P.innerText('.rs-where')));
    chk('the raised target was what the server stored', php(`echo db_row("SELECT target FROM growth_plan_items WHERE subject = 'Mathematics'")['target'];`) === '57');
    chk('the mentor was told', php(`echo db_row("SELECT COUNT(*) n FROM notifications WHERE memberId = 'NGG-MPT-M' AND title LIKE '%sent their results and plan'")['n'];`) === '1');
    await P.click('.rs-ticks li >> nth=0 >> button:has-text("I did one")');
    await P.waitForFunction(() => document.querySelectorAll('.rs-ticks li:first-child .rs-dots .is-on').length === 1, null, { timeout: 10000 });
    chk('a tick is recorded on the server', php(`echo db_row("SELECT SUM(done) n FROM plan_checkins")['n'];`) === '1');
    await P.click('.rs-hist summary');
    chk('the history lists every step', /Sent the results and plan/.test(await P.innerText('.rs-hist')) && /Uploaded the report/.test(await P.innerText('.rs-hist')));
    await P.screenshot({ path: path.join(SHOTS, 'results-sent.png'), fullPage: true });

    console.log('Account');
    await P.click('.pt-nav-i:has-text("Account")');
    await P.waitForSelector('.mbr-dl', { timeout: 20000 });
    chk('the profile is read-only, says who manages it, and masks the guardian number', /Managed by NGG/.test(await P.innerText('.pt-body'))
      && /Egbeda High/.test(await P.innerText('.mbr-dl')) && /2348 ••• 567/.test(await P.innerText('.mbr-dl')) && !(await P.$('.mbr-dl input')));
    await P.click('button:has-text("Ask for a change")');
    await P.waitForFunction(() => /Correct my details/.test(document.body.innerText) && location.pathname === '/member/account/records', null, { timeout: 20000 });
    chk('"Ask for a change" opens Records with that request ready to write', true);
    const refused = await P.evaluate(() => NGGApi.member.updateProfile({ fullName: 'Someone Else' }).then(() => 'ok', e => e.code));
    chk('the server refuses a member renaming themselves', refused === 'managed_by_ngg');

    console.log('Addresses and keyboard');
    await P.goto(BASE + '/dashboard/account', { waitUntil: 'domcontentloaded' }); await waitForBoot(P);
    await P.waitForSelector('.pt-head h1', { timeout: 60000 });
    chk('an old /dashboard/account link opens Account → Money', new URL(P.url()).pathname === '/member/account/money' && (await P.innerText('.pt-head h1')) === 'Money');
    await P.keyboard.press('Control+k');
    await P.waitForSelector('.pt-palette', { timeout: 5000 });
    await P.keyboard.type('timet');
    await P.keyboard.press('Enter');
    await P.waitForFunction(() => location.pathname === '/member/learn/timetable', null, { timeout: 5000 });
    chk('⌘K finds a screen by name and goes there', true);
    await P.goBack();
    await P.waitForFunction(() => location.pathname === '/member/account/money', null, { timeout: 5000 });
    chk('the browser’s Back returns to the previous screen', (await P.innerText('.pt-head h1')) === 'Money');
    await P.context().close();

    console.log('Phone');
    const F = await as('NGG-MPT-1', '/member', 390);
    await F.waitForSelector('.pt-bottom', { timeout: 60000 });
    chk('the five areas are a bottom bar on a phone, and the sidebar is gone', (await F.$$('.pt-bottom-i')).length === 5 && !(await F.isVisible('.pt-side')));
    chk('nothing scrolls sideways', await F.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await F.screenshot({ path: path.join(SHOTS, 'today-phone.png'), fullPage: true });
    await F.click('.pt-bottom-i:has-text("Grow")');
    await F.waitForSelector('.rs-where, .pt-seg', { timeout: 20000 });
    chk('a bottom tab opens its area', new URL(F.url()).pathname.startsWith('/member/grow'));
    await F.context().close();

    chk('no script errors on any screen (' + errs.slice(0, 2).join(' | ') + ')', errs.length === 0);
  } catch (e) {
    failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close();
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (member portal)');
  process.exit(failed ? 1 : 0);
})();
