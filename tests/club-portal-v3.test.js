#!/usr/bin/env node
/* Club portal v3 (/club-admin) end to end — real PHP + SQLite, Chromium. Run: node tests/club-portal-v3.test.js */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CLUBV3_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-clubv3-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-clubv3-cache-${process.pid}`);
const ADMIN = 'NGG-CV-ADM';
const CLUB = 'NGG-CV-CLUB';
const LEAD = 'NGG-CV-LEAD';

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-cv3-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}
function mintSession(memberId) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/session.php')};`
    + `echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), true);`;
  const f = path.join(os.tmpdir(), `ngg-cv3-sess-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.unlinkSync(DB); } catch (_) {}
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

/** Mirror of the client's fmtNum for the counts it renders. */
function fmtN(n) { return Number(n).toLocaleString('en-NG'); }

let passed = 0, failed = 0;
const ok = (m) => { passed++; console.log('  ✓ ' + m); };
const bad = (m) => { failed++; console.error('  ✗ FAIL: ' + m); };
const chk = (m, cond) => cond ? ok(m) : bad(m);
const SHOTS = process.env.CLUBV3_SHOTS || '';

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  club portal v3: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'clubv3_test_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'debug' => false,
  ];\n`);
  try {
    const now = "now_iso()";
    const mem = (id, name, role, centre, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'${name}','email'=>'${id.toLowerCase()}@example.org','type'=>'NGG','status'=>'active','role'=>'${role}','centre'=>'${centre}','createdAt'=>${now},'updatedAt'=>${now}], ${extra || '[]'}));`;
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CTR-EG','name'=>'Egbeda','code'=>'EG','color'=>'#3B5BDB','status'=>'active','programmes'=>'ngg','meetDays'=>'Saturdays','meetTime'=>'9am-2pm','createdAt'=>${now}]);`
      + `db_insert('centres', ['centreId'=>'CTR-AY','name'=>'Ayobo','code'=>'AY','color'=>'#76B043','status'=>'active','programmes'=>'ngg,summer','meetDays'=>'Saturdays','meetTime'=>'10am-1pm','createdAt'=>${now}]);`
      + `db_insert('centres', ['centreId'=>'CTR-SS','name'=>'Ijaiye','code'=>'IJ','color'=>'#f5b026','status'=>'active','programmes'=>'summer','createdAt'=>${now}]);`
      + mem(ADMIN, 'Ada Admin', 'admin', 'Egbeda')
      + mem(CLUB, 'Cole Club', 'club_admin', 'Egbeda')
      + mem(LEAD, 'Lola Lead', 'centre_lead', 'Ayobo', `['centreScope'=>'["CTR-AY"]']`)
      + mem('NGG-CV-M1', 'Tobi Adeyemi', 'member', 'Egbeda', `['track'=>'Coding','parentName'=>'Mrs Adeyemi','parentEmail'=>'p1@example.org','parentPhone'=>'08031234567']`)
      + mem('NGG-CV-M2', 'Bimpe Balogun', 'member', 'Ayobo', `['track'=>'Robotics','parentEmail'=>'p2@example.org']`)
      + mem('NGG-CV-M3', 'Chidi Okafor', 'member', 'Egbeda', `['track'=>'Chess','status'=>'inactive']`)
      + `db_insert('mentors', ['mentorId'=>'MEN-CV','fullName'=>'Mo Mentor','email'=>'mo@example.org','status'=>'active','centre'=>'Egbeda','programme'=>'ngg','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('mentor_assignments', ['memberId'=>'NGG-CV-M1','mentorId'=>'MEN-CV','status'=>'active','startedAt'=>${now}]);`
      + `db_insert('member_checkins', ['memberId'=>'NGG-CV-M1','week'=>'2026-W42','wellbeing'=>'Struggling','note'=>'Exams are a lot','createdAt'=>${now}]);`
      + `db_insert('applications', ['ref'=>'APP-CV1','kind'=>'teen','name'=>'Kemi Applicant','age'=>13,'centre'=>'Egbeda','track'=>'Coding','program'=>'anchor','email'=>'kemi@example.org','status'=>'new','photoUrl'=>'','createdAt'=>${now}]);`
      + `db_insert('summer_cohorts', ['cohortId'=>'SUM-CV','name'=>'CV Edition','year'=>2030,'status'=>'active','createdAt'=>${now}]);`
      + `db_insert('summer_students', ['studentId'=>'CV-S1','cohortId'=>'SUM-CV','token'=>'SUMQR-CV1','handle'=>'cvs1','fullName'=>'Graduating Kid','age'=>15,'centre'=>'Ijaiye','track'=>'Coding','parentEmail'=>'gk@example.org','status'=>'graduated','enrolledAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('summer_students', ['studentId'=>'CV-S2','cohortId'=>'SUM-CV','token'=>'SUMQR-CV2','handle'=>'cvs2','fullName'=>'Quiet Grad','age'=>14,'centre'=>'Ijaiye','track'=>'Robotics','parentEmail'=>'','status'=>'graduated','enrolledAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('volunteers', ['volunteerId'=>'VOL-CV1','fullName'=>'Vera Volunteer','email'=>'vera@example.org','status'=>'active','safeguarding'=>'cleared','centre'=>'Egbeda','programme'=>'ngg','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('timetable_slots', ['slotId'=>'TT-CV1','centreId'=>'CTR-EG','course'=>'Coding','level'=>'','weekday'=>6,'startTime'=>'09:00','endTime'=>'10:00','room'=>'Lab','status'=>'active','createdAt'=>${now},'updatedAt'=>${now}]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    const openAs = async (memberId, path, vp) => {
      const ctx = await browser.newContext({ viewport: vp || { width: 1440, height: 1000 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: mintSession(memberId), domain: '127.0.0.1', path: '/', httpOnly: true }]);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|\[BABEL\] Note/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
      await page.goto(BASE + (path || '/club-admin'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForFunction(() => !!document.querySelector('.cp3-app') || /Couldn’t open the Club portal/.test(document.body.innerText), null, { timeout: 60000 });
      return { page, errs, ctx };
    };
    const text = page => page.evaluate(() => document.body.innerText);
    const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };
    const clickBtn = (page, re) => page.evaluate(src => { const r = new RegExp(src); const b = Array.from(document.querySelectorAll('button')).find(x => r.test(x.innerText.trim()) && x.offsetParent !== null); if (b) { b.click(); return true; } return false; }, re.source);
    const q = sql => JSON.parse(php(`echo json_encode(db_all(${JSON.stringify(sql)}));`) || '[]');
    const nav = async (page, label) => { await page.evaluate(src => { const r = new RegExp('^' + src); const b = Array.from(document.querySelectorAll('aside button, nav button')).find(x => r.test(x.innerText.trim()) && x.offsetParent !== null); if (b) b.click(); }, label); await page.waitForTimeout(400); };
    const inDialog = (page, re) => page.evaluate(src => { const r = new RegExp(src); const d = document.querySelector('[role=alertdialog]') || Array.from(document.querySelectorAll('[role=dialog]')).pop(); const b = d && Array.from(d.querySelectorAll('button')).find(x => r.test(x.innerText.trim())); if (b) { b.click(); return true; } return false; }, re.source);
    const dialogText = page => page.evaluate(() => { const d = document.querySelector('[role=alertdialog]') || Array.from(document.querySelectorAll('[role=dialog]')).pop(); return d ? d.innerText : ''; });
    const toastText = page => page.evaluate(() => Array.from(document.querySelectorAll('[role=status],[aria-live]')).map(x => x.innerText).join(' / '));
    const waitText = (page, re, ms) => page.waitForFunction(src => new RegExp(src).test(document.body.innerText), re.source, { timeout: ms || 15000 }).then(() => true).catch(() => false);

    // ════════════════════════════════════════════════════════════════════
    console.log('\n── The dashboard, as a club coordinator ───────────────────');
    const c = await openAs(CLUB);
    await waitText(c.page, /Saturday readiness|to clear before|Ready for/, 20000);
    await waitText(c.page, /things? need/, 20000);
    let t = await text(c.page);
    await shot(c.page, '01-dashboard');
    chk('the Club portal v3 opens for a club coordinator', /NGG Club/.test(t) && /Staff portal/.test(t));
    chk('Saturday readiness counts what is not ready', /to clear before|Ready for/.test(t));
    chk('the centres table lists the NGG centres, never a Summer-only venue', /Egbeda/.test(t) && /Ayobo/.test(t) && !/Ijaiye/.test(t.split('Centres side by side')[1] || ''));
    chk('“needs you” names the struggling check-in and the application', await waitText(c.page, /struggling/, 15000) && await waitText(c.page, /Applications to review/, 5000));
    chk('no page errors on the dashboard', c.errs.length === 0);
    if (c.errs.length) c.errs.slice(0, 5).forEach(e => console.error('      ' + e));

    console.log('\n── Command palette ─────────────────────────────────────────');
    await c.page.keyboard.press('Control+k');
    await c.page.waitForTimeout(300);
    await c.page.keyboard.type('tobi');
    chk('Ctrl K opens the palette and finds a member by name', await waitText(c.page, /NGG-CV-M1|Tobi Adeyemi/, 8000));
    await c.page.keyboard.press('Escape');

    console.log('\n── Roster (the Student Directory) ──────────────────────────');
    await c.page.goto(BASE + '/club-admin?s=roster', { waitUntil: 'domcontentloaded' });
    await waitForBoot(c.page);
    chk('the directory lists the Club members', await waitText(c.page, /Tobi Adeyemi/, 20000) && await waitText(c.page, /Bimpe Balogun/, 5000));
    t = await text(c.page);
    chk('…and never a staff account', !/Cole Club/.test(t.split('Everyone')[1] || ''));
    await shot(c.page, '02-roster');
    await c.page.fill('input[aria-label="Search students"]', 'bimpe');
    await c.page.waitForTimeout(600);
    t = await text(c.page);
    chk('searching the directory narrows it to the match', /Bimpe Balogun/.test(t) && !/Tobi Adeyemi/.test(t.split('Needs attention')[1] || ''));
    await c.page.fill('input[aria-label="Search students"]', 'tobi');
    await c.page.waitForTimeout(600);
    await c.page.evaluate(() => { const r = Array.from(document.querySelectorAll('[role=row]')).find(x => /Tobi Adeyemi/.test(x.innerText) && x.offsetParent); if (r) r.click(); });
    await c.page.waitForTimeout(600);
    const drSel = await c.page.evaluate(() => Array.from(document.querySelectorAll('select')).filter(x => x.offsetParent).map(x => x.value));
    chk('the drawer shows the member’s real mentor and an unset class as unset', drSel.includes('Mo Mentor') && drSel.includes(''));
    await c.page.fill('input[placeholder="080…"]', '08099998888');
    await clickBtn(c.page, /^Save$/);
    await waitText(c.page, /Saved/, 8000);
    chk('saving the drawer writes the guardian phone to the record', (q("SELECT parentPhone FROM members WHERE memberId = 'NGG-CV-M1'")[0] || {}).parentPhone === '08099998888');

    console.log('\n── Promote from Summer School ──────────────────────────────');
    await c.page.goto(BASE + '/club-admin?s=promote', { waitUntil: 'domcontentloaded' });
    await waitForBoot(c.page);
    chk('the Summer graduate is waiting to be promoted', await waitText(c.page, /Graduating Kid/, 20000) && await waitText(c.page, /Quiet Grad/, 5000));
    await shot(c.page, '03-promote');
    const promoteRow = () => c.page.evaluate(() => { const tr = Array.from(document.querySelectorAll('tr')).find(x => /Quiet Grad/.test(x.innerText)); const b = tr && Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Promote'); if (b) b.click(); return !!b; });
    chk('a graduate from a Summer-only venue has no Club centre chosen for them', await c.page.evaluate(() => document.querySelector('select[aria-label="Club centre for Quiet Grad"]').value === ''));
    await promoteRow();
    chk('…and promoting before choosing one is refused with the reason', await waitText(c.page, /Choose the Club centre Quiet Grad joins first/, 5000));
    await c.page.selectOption('select[aria-label="Club centre for Quiet Grad"]', { label: 'Egbeda' });
    await promoteRow();
    await c.page.waitForTimeout(500);
    t = await dialogText(c.page);
    chk('the confirm warns that the graduate has no guardian email', /Quiet Grad has no guardian email on file/.test(t));
    await inDialog(c.page, /^Promote$/);
    await waitText(c.page, /promoted into the Club/, 10000);
    const qg = q("SELECT centre, type, status FROM members WHERE fullName = 'Quiet Grad'")[0] || {};
    chk('the promotion lands: an active NGG member at the chosen centre', qg.type === 'NGG' && qg.status === 'active' && qg.centre === 'Egbeda');
    chk('…and the Summer record is marked promoted', (q("SELECT status FROM summer_students WHERE studentId = 'CV-S2'")[0] || {}).status === 'promoted');

    console.log('\n── Permissions ─────────────────────────────────────────────');
    await nav(c.page, 'Permissions');
    await waitText(c.page, /The seven permissions|What each member/, 15000);
    await c.page.evaluate(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => /^Tobi Adeyemi/.test(x.innerText.trim())); if (b) b.click(); });
    await waitText(c.page, /The seven permissions/, 8000);
    await c.page.evaluate(() => { const d = Array.from(document.querySelectorAll('[role=dialog]')).pop(); const b = Array.from(d.querySelectorAll('button')).find(x => x.innerText.trim() === 'Granted'); if (b) b.click(); });
    chk('recording a consent offers Undo', await waitText(c.page, /Recorded: granted/, 5000));
    await c.page.waitForTimeout(7500);   // the write waits out the Undo window
    const cons = q("SELECT type, status, actorName FROM consents WHERE studentId = 'NGG-CV-M1'");
    chk('after the Undo window the consent is written, with who recorded it', cons.some(r => r.type === 'participation' && r.status === 'granted' && r.actorName === 'Cole Club'));
    await c.page.keyboard.press('Escape');

    console.log('\n── Check-ins ───────────────────────────────────────────────');
    await nav(c.page, 'Check-ins');
    await waitText(c.page, /Exams are a lot/, 15000);
    await clickBtn(c.page, /^Tell Mo$/);
    chk('“Tell Mo” tells the struggling member’s mentor', await waitText(c.page, /Mo Mentor has been told/, 8000));
    chk('…and records it', !!(q("SELECT toldAt FROM club_checkin_state WHERE checkinKey LIKE 'NGG-CV-M1|%'")[0] || {}).toldAt);

    console.log('\n── Mentorship ──────────────────────────────────────────────');
    await nav(c.page, 'Mentorship');
    chk('a pair made from a centre’s mentor list is listed', await waitText(c.page, /Mo Mentor/, 15000) && /Tobi Adeyemi/.test(await text(c.page)));
    chk('…as a new pair, not an overdue one', /New pair/.test(await text(c.page)));

    console.log('\n── Announcements: a coordinator submits ────────────────────');
    await nav(c.page, 'Announcements');
    await waitText(c.page, /Write to members and guardians/, 15000);
    await c.page.evaluate(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.trim() === 'New announcement'); if (b) b.click(); });
    await c.page.waitForTimeout(500);
    await c.page.fill('input[placeholder="e.g. No class on Saturday"]', 'No class on Saturday 24th');
    await c.page.fill('textarea[placeholder^="Say what"]', 'The centre is closed for repairs. Classes resume the week after.');
    const chan = l => c.page.evaluate(src => { const b = Array.from(document.querySelectorAll('button[aria-pressed]')).find(x => x.offsetParent && x.innerText.trim() === src); if (b) b.click(); }, l);
    const pressed = () => c.page.evaluate(() => Array.from(document.querySelectorAll('div[role=dialog] button[aria-pressed="true"]')).map(x => x.innerText.trim()));
    chk('a new announcement starts on App and Email, not SMS', JSON.stringify(await pressed()) === JSON.stringify(['App', 'Email']));
    await chan('Email');
    await clickBtn(c.page, /^Submit for approval$/);
    chk('app-only to guardians with no family account is refused, never sent to nobody', await waitText(c.page, /Nobody in this audience can be reached by the app/, 8000));
    await chan('Email');
    // SMS: too long for a text → a short version that keeps every fact, or email and Telegram.
    await c.page.fill('textarea[placeholder^="Say what"]', 'The centre is closed for repairs on Saturday 24th, so there is no class. Classes resume the week after, on Saturday 31st at 10am as usual. '
      + 'Please make sure your child brings their project folder, because instructors will check the robotics builds from before the break. Any questions, call the desk on 08031234567.');
    await chan('SMS');
    chk('a message too long for a text asks for an SMS version, and says email and Telegram are the fallback', await waitText(c.page, /SMS version/, 4000) && /Too long for a text/.test(await text(c.page)));
    await clickBtn(c.page, /^Shorten with AI/);
    chk('with no AI set up, shortening says so and offers email and Telegram', await waitText(c.page, /AI isn’t set up on this site/, 8000));
    await c.page.fill('textarea[aria-label="SMS version"]', 'No class Sat 24th (repairs). Back Sat 31st. Bring project folder. Desk: 08031234567.');
    chk('a short version that drops a fact is flagged, naming it', await waitText(c.page, /Leaves out 10/, 4000));
    await c.page.fill('textarea[aria-label="SMS version"]', 'No class Sat 24th (repairs). Back Sat 31st, 10am. Bring project folder. Desk: 08031234567.');
    await c.page.waitForTimeout(300);
    chk('…a faithful one is not, and the preview shows the text as sent', !/Leaves out/.test(await text(c.page)) && /As a text[\s\S]*NGG: No class Sat 24th/.test(await text(c.page)));
    await clickBtn(c.page, /^Submit for approval$/);
    await waitText(c.page, /Sent to an admin for approval/, 8000);
    { const r = q("SELECT status, channels, smsBody FROM club_announcements WHERE title = 'No class on Saturday 24th'")[0] || {};
      chk('a coordinator’s announcement waits for an admin, with its SMS version', r.status === 'pending' && /sms/.test(r.channels) && /Back Sat 31st, 10am/.test(r.smsBody)); }
    chk('…and the screen follows it to Waiting', /No class on Saturday 24th/.test(await text(c.page)));

    console.log('\n── Applications ────────────────────────────────────────────');
    await nav(c.page, 'Applications');
    await waitText(c.page, /Kemi Applicant/, 15000);
    await clickBtn(c.page, /^Review$/);
    await c.page.waitForTimeout(500);
    t = await dialogText(c.page);
    const acceptOff = await c.page.evaluate(() => { const d = Array.from(document.querySelectorAll('[role=dialog]')).pop(); const b = Array.from(d.querySelectorAll('button')).find(x => /^Accept/.test(x.innerText.trim())); return !!b && (b.disabled || b.getAttribute('aria-disabled') === 'true'); });
    chk('accepting an application without a photo is blocked, with the reason', acceptOff && /Ask for a photo before accepting/.test(t));
    const png = path.join(os.tmpdir(), `ngg-cv3-face-${process.pid}.png`);
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'));
    const [fc] = await Promise.all([c.page.waitForEvent('filechooser', { timeout: 8000 }), inDialog(c.page, /^Add their photo$/)]);
    await fc.setFiles(png);
    await waitText(c.page, /Photo added/, 15000);
    try { fs.unlinkSync(png); } catch (_) {}
    chk('staff can add the applicant’s photo', ((q("SELECT photoUrl FROM applications WHERE ref = 'APP-CV1'")[0] || {}).photoUrl || '') !== '');
    await clickBtn(c.page, /^Review$/);
    await c.page.waitForTimeout(500);
    await inDialog(c.page, /^Accept and add to roster$/);
    await waitText(c.page, /Added to the roster/, 10000);
    chk('…after which accepting adds them to the roster', (q("SELECT type FROM members WHERE fullName = 'Kemi Applicant'")[0] || {}).type === 'NGG');

    console.log('\n── Duty rota ───────────────────────────────────────────────');
    await nav(c.page, 'Duty rota');
    await waitText(c.page, /Unfilled/, 15000);
    const shiftDate = await c.page.evaluate(() => { const tr = Array.from(document.querySelectorAll('main tr')).find(x => /Egbeda/.test(x.innerText) && /Unfilled/.test(x.innerText)); const b = tr && Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Fill'); if (b) b.click(); return tr ? tr.innerText.split('\t')[0].trim() : ''; });
    await c.page.waitForTimeout(500);
    const fillSel = (await c.page.$$('[role=dialog]')).pop();
    await (await fillSel.$('select')).selectOption('VOL-CV1');
    await inDialog(c.page, /^Assign$/);
    chk('filling a shift puts the volunteer on duty', await waitText(c.page, /Vera Volunteer is on duty/, 10000));
    const duty = q("SELECT centre, source FROM attendance_duty WHERE volunteerId = 'VOL-CV1'");
    chk('…as one admin-set shift, starting no automatic Summer picks', duty.length === 1 && duty[0].centre === 'Egbeda' && duty[0].source === 'admin');
    if (!shiftDate) bad('no unfilled Egbeda shift was found to fill');

    console.log('\n── Timetable ───────────────────────────────────────────────');
    await nav(c.page, 'Timetable');
    await waitText(c.page, /Which course meets when/, 15000);
    await clickBtn(c.page, /^Egbeda$/);
    await clickBtn(c.page, /^Add a slot$/);
    await c.page.waitForTimeout(500);
    const ttIns = await (await c.page.$$('[role=dialog]')).pop().$$('input');
    await ttIns[0].fill('09:30'); await ttIns[1].fill('10:30');
    chk('a slot overlapping Coding in the Lab is caught as a clash before saving', await waitText(c.page, /This would clash/, 5000) && /Lab already has Coding 09:00–10:00/.test(await dialogText(c.page)));
    await inDialog(c.page, /^Try /);
    await c.page.waitForTimeout(300);
    await inDialog(c.page, /^Add to timetable$/);
    chk('taking the suggested time saves it (Chess, taught in every division)', await waitText(c.page, /Added Chess/, 10000));
    chk('…and it is stored', q("SELECT course FROM timetable_slots WHERE status = 'active' ORDER BY startTime").map(r => r.course).join(',') === 'Coding,Chess');
    await c.page.locator('button[aria-haspopup="menu"]', { hasText: 'Export' }).click();
    const [dlCsv] = await Promise.all([c.page.waitForEvent('download', { timeout: 8000 }), c.page.locator('[role=menuitem]', { hasText: 'Spreadsheet' }).click()]);
    const csv = fs.readFileSync(await dlCsv.path(), 'utf8');
    chk('the timetable exports as a spreadsheet with both slots', /^Centre,Day,Starts,Ends,Course/.test(csv) && /"Chess"/.test(csv) && /"Coding"/.test(csv));

    console.log('\n── Tournaments ─────────────────────────────────────────────');
    await nav(c.page, 'Tournaments');
    chk('no tournaments says so, and how to start one', await waitText(c.page, /No tournaments yet\. Start one with Host a tournament/, 15000));
    await c.page.locator('main button', { hasText: 'Host a tournament' }).first().click();
    for (let i = 0; i < 3; i++) { await c.page.locator('main button', { hasText: /^Next$/ }).click(); await c.page.waitForTimeout(250); }
    await c.page.fill('main input[placeholder="e.g. Egbeda Saturday Blitz"]', 'Egbeda Saturday Rapid');
    await c.page.locator('main button', { hasText: 'Create and open entries' }).click();
    chk('a tournament is created with entries open', await waitText(c.page, /Players can enter from the chess screen now/, 10000)
      && (q("SELECT status, programme FROM tournaments WHERE name = 'Egbeda Saturday Rapid'")[0] || {}).status === 'open');
    chk('…and its summary reads as words, not an object', !/\[object Object\]/.test(await text(c.page)));
    await shot(c.page, '05-tournament');
    chk('no page errors across the coordinator’s sections', c.errs.length === 0);
    if (c.errs.length) c.errs.slice(0, 5).forEach(e => console.error('      ' + e));

    console.log('\n── A centre lead is held to their centre ───────────────────');
    const l = await openAs(LEAD);
    await waitText(l.page, /things? need|Everything is on track/, 20000);
    t = await text(l.page);
    chk('the lead sees Ayobo and not Egbeda in the centres table', /Ayobo/.test(t) && !/Egbeda/.test(t.split('Centres side by side')[1] || 'Egbeda'));
    await l.page.goto(BASE + '/club-admin?s=roster', { waitUntil: 'domcontentloaded' });
    await waitForBoot(l.page);
    await waitText(l.page, /Bimpe Balogun/, 20000);
    chk('the lead’s roster holds only Ayobo', !/Tobi Adeyemi/.test(await text(l.page)));
    chk('the lead can take the register', await clickBtn(l.page, /^Take register/));
    await clickBtn(l.page, /^Mark the rest present$/);
    await l.page.waitForTimeout(300);
    await clickBtn(l.page, /^Submit register$/);
    chk('…and submitting it says what was saved', await waitText(l.page, /saved: 1 present, 0 late, 0 absent/, 10000));
    const att = q("SELECT studentId, status, method, byId FROM attendance");
    chk('…and writes the attendance, as the lead', att.length === 1 && att[0].studentId === 'NGG-CV-M2' && att[0].status === 'present' && att[0].method === 'register' && att[0].byId === LEAD);
    chk('no page errors for the lead', l.errs.length === 0);
    if (l.errs.length) l.errs.slice(0, 5).forEach(e => console.error('      ' + e));

    console.log('\n── Announcements: an admin approves ────────────────────────');
    const a = await openAs(ADMIN, '/club-admin?s=announce');
    await waitText(a.page, /No class on Saturday 24th/, 20000);
    await a.page.evaluate(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => /No class on Saturday 24th/.test(x.innerText)); if (b) b.click(); });
    await a.page.waitForTimeout(500);
    await inDialog(a.page, /^Approve and send$/);
    await a.page.waitForTimeout(400);
    await inDialog(a.page, /^Approve and send$/);
    await waitText(a.page, /has been told/, 10000);
    const ann = q("SELECT status, approvedByName, stats FROM club_announcements WHERE title = 'No class on Saturday 24th'")[0] || {};
    chk('an admin approves it and it goes out', ann.status === 'sent' && ann.approvedByName === 'Ada Admin');
    chk('no page errors for the admin', a.errs.length === 0);
    if (a.errs.length) a.errs.slice(0, 5).forEach(e => console.error('      ' + e));

    console.log('\n── Phone ───────────────────────────────────────────────────');
    const ph = await openAs(CLUB, '/club-admin', { width: 390, height: 760 });
    await waitText(ph.page, /Home/, 20000);
    const barOk = await ph.page.evaluate(() => { const n = document.querySelector('nav[aria-label="Main"]'); if (!n) return false; const r = n.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.height > 30; });
    chk('the bottom tab bar is fully on screen on a phone', barOk);
    await shot(ph.page, '04-phone');
  } catch (e) {
    bad('harness — ' + (e && e.message ? e.message : e));
    if (e && e.stack) console.error(String(e.stack).split('\n').slice(0, 4).join('\n'));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (club portal v3)');
  process.exit(failed ? 1 : 0);
})();
