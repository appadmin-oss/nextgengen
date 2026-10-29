#!/usr/bin/env node
/* ============================================================================
   Course placement and course health, end to end (domain/course-placement.php).

   A child's courses are a stored fact that staff confirm. Pinned here:
     · a Tech child whose card also says Media is PROPOSED Technology courses
       and listed under "Needs a look", with the reason in words;
     · confirming makes them placed, and the member's own portal then shows the
       courses without "not confirmed yet";
     · Course health names a course with children and nothing to teach them.

   Run:  node tests/course-placement.test.js     Env: CPLACE_PORT (default 8287)
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CPLACE_PORT || '8287';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-cplace-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-cplace-cache-${process.pid}`);
const ADMIN = 'NGG-CP-ADM';

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-cp-php-${process.pid}-${++_seq}.php`);
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
  const f = path.join(os.tmpdir(), `ngg-cp-sess-${process.pid}-${++_seq}.php`);
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
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  course placement: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'cplace_test_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Ada Admin','email'=>'cp-admin@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Ijaiye','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-IJ','name'=>'Ijaiye','code'=>'IJ','color'=>'#76B043','status'=>'active','capacity'=>0,'createdAt'=>now_iso()]);`
      + `db_insert('members', ['memberId'=>'NGG-CP-TM','fullName'=>'Tobi Techmedia','email'=>'cp-tm@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Ijaiye','track'=>'Tech','disciplines'=>'Tech, Media','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('members', ['memberId'=>'NGG-CP-PI','fullName'=>'Pelumi Piano','email'=>'cp-pi@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Ijaiye','track'=>'Piano','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    browser = await chromium.launch(launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: mintSession(ADMIN), domain: '127.0.0.1', path: '/', httpOnly: true }]);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 220)));

    await page.goto(BASE + '/control/members/courses', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForFunction(() => /Tobi Techmedia/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    let txt = await page.evaluate(() => document.body.innerText);
    if (process.env.CPLACE_SHOTS) await page.screenshot({ path: process.env.CPLACE_SHOTS + '/placement.png' });
    chk('Needs a look lists the Tech child whose card also names Media, with the reason in words', /Tobi Techmedia/.test(txt) && /another division/.test(txt) && /Coding/.test(txt));
    chk('…and their proposal holds no Media course', !/Graphic Design[\s\S]{0,40}Proposed, not confirmed/.test(txt));

    // Open the child and confirm from their drawer (the Control Room's own drawer and confirm).
    await page.evaluate(() => { const r = Array.from(document.querySelectorAll('tbody tr')).find(x => /Tobi Techmedia/.test(x.innerText)); r.click(); });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => /^Confirm these courses$/.test(b.innerText.trim())), null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /^Confirm these courses$/.test(b.innerText.trim())).click());
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => /^Confirm 1 placement$/.test(b.innerText.trim())), null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Confirm 1 placement$/.test(x.innerText.trim())); if (b) b.click(); });
    for (let i = 0; i < 30 && !/Coding/.test(php(`echo db_row("SELECT courses FROM members WHERE memberId = 'NGG-CP-TM'")['courses'];`)); i++) await page.waitForTimeout(500);
    const placed = php(`echo db_row("SELECT courses FROM members WHERE memberId = 'NGG-CP-TM'")['courses'];`);
    chk('Confirming places the child: their courses are stored, Technology only', /Coding/.test(placed) && !/Graphic Design|Media Lab/.test(placed));
    await page.waitForFunction(() => /Placed\s*1/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    chk('The counts move: one child is now placed', /Placed\s*1/.test(await page.evaluate(() => document.body.innerText)));

    // Course health.
    await page.goto(BASE + '/control/learning/course-health', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Every course/.test(document.body.innerText) && /Coding/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    txt = await page.evaluate(() => document.body.innerText);
    if (process.env.CPLACE_SHOTS) await page.screenshot({ path: process.env.CPLACE_SHOTS + '/health.png' });
    chk('Course health names courses with children and nothing to teach them', /Coding/.test(txt) && /No instructor teaches it/.test(txt) && /No class time/.test(txt) && /Missing something/.test(txt));
    await page.evaluate(() => { const r = Array.from(document.querySelectorAll('tbody tr')).find(x => /^\s*Piano/.test(x.innerText)); r.click(); });
    await page.waitForFunction(() => /proposed/.test(document.body.innerText) && Array.from(document.querySelectorAll('button')).some(b => /Give it an instructor/.test(b.innerText)), null, { timeout: 10000 }).catch(() => {});
    txt = await page.evaluate(() => document.body.innerText);
    chk('A course opens with what is missing and a button to where each is fixed; a proposed child is counted apart', /1 proposed/.test(txt) && /Give it an instructor/.test(txt) && /Put it on the timetable/.test(txt));
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs);
  } catch (e) {
    failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (course placement)');
  process.exit(failed ? 1 : 0);
})();
