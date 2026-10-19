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
      + `db_insert('mentors', ['mentorId'=>'MEN-CV','fullName'=>'Mo Mentor','email'=>'mo@example.org','status'=>'active','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('mentor_assignments', ['memberId'=>'NGG-CV-M1','mentorId'=>'MEN-CV','status'=>'active','startedAt'=>${now}]);`
      + `db_insert('member_checkins', ['memberId'=>'NGG-CV-M1','week'=>'2026-W42','wellbeing'=>'Struggling','note'=>'Exams are a lot','createdAt'=>${now}]);`
      + `db_insert('applications', ['ref'=>'APP-CV1','kind'=>'teen','name'=>'Kemi Applicant','age'=>13,'centre'=>'Egbeda','track'=>'Coding','program'=>'anchor','email'=>'kemi@example.org','status'=>'new','photoUrl'=>'','createdAt'=>${now}]);`
      + `db_insert('summer_cohorts', ['cohortId'=>'SUM-CV','name'=>'CV Edition','year'=>2030,'status'=>'active','createdAt'=>${now}]);`
      + `db_insert('summer_students', ['studentId'=>'CV-S1','cohortId'=>'SUM-CV','token'=>'SUMQR-CV1','handle'=>'cvs1','fullName'=>'Graduating Kid','age'=>15,'centre'=>'Ijaiye','track'=>'Coding','parentEmail'=>'gk@example.org','status'=>'graduated','enrolledAt'=>${now},'updatedAt'=>${now}]);`
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
    chk('“needs you” names the struggling check-in and the application', /struggling/.test(t) && /Applications to review/.test(t));
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

    console.log('\n── Promote from Summer School ──────────────────────────────');
    await c.page.goto(BASE + '/club-admin?s=promote', { waitUntil: 'domcontentloaded' });
    await waitForBoot(c.page);
    chk('the Summer graduate is waiting to be promoted', await waitText(c.page, /Graduating Kid/, 20000));
    await shot(c.page, '03-promote');
    chk('no page errors across palette, roster and promote', c.errs.length === 0);
    if (c.errs.length) c.errs.slice(0, 5).forEach(e => console.error('      ' + e));

    console.log('\n── A centre lead is held to their centre ───────────────────');
    const l = await openAs(LEAD);
    await waitText(l.page, /things? need|Everything is on track/, 20000);
    t = await text(l.page);
    chk('the lead sees Ayobo and not Egbeda in the centres table', /Ayobo/.test(t) && !/Egbeda/.test(t.split('Centres side by side')[1] || 'Egbeda'));
    chk('no page errors for the lead', l.errs.length === 0);

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
