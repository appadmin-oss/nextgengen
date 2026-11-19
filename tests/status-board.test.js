#!/usr/bin/env node
/* ============================================================================
   The status board and the member record, end to end.

   What is worth pinning is what a capability or a centre scope changes, since
   those are invisible when wrong — a board that shows a centre lead every
   centre reads perfectly well:

     · The board opens, and each tab says what it is about (members, centres,
       mentors, instructors, centre leads, staff).
     · A centre lead sees their own centre and no staff tab.
     · The member drawer has a tab per part of the record, read in one call,
       and a part the reader may not see says so rather than looking empty.

   Self-contained: throwaway api/config.php, SQLite temp, PHP built-in server,
   Chromium. NEVER overwrites an existing config.php.

   Run:  node tests/status-board.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.STATUSB_PORT || '8271';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-statusb-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-statusb-cache-${process.pid}`);
const ADMIN = 'NGG-SBT-ADM';
const LEAD = 'NGG-SBT-LEAD';

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-sb-php-${process.pid}-${++_seq}.php`);
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
  const f = path.join(os.tmpdir(), `ngg-sb-sess-${process.pid}-${++_seq}.php`);
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

let passed = 0, failed = 0;
const ok = (m) => { passed++; console.log('  ✓ ' + m); };
const bad = (m) => { failed++; console.error('  ✗ FAIL: ' + m); };
const chk = (m, cond) => cond ? ok(m) : bad(m);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  status board: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }

  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'statusb_test_secret_0123456789abc',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'debug' => false,
  ];\n`);

  try {
    const mem = (id, name, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'${name}','email'=>'${id.toLowerCase()}@example.org','type'=>'NGG','status'=>'active','role'=>'member','createdAt'=>now_iso(),'updatedAt'=>now_iso()], ${extra || '[]'}));`;
    // Lagos date and its Monday, as attendance_today()/companion_period() compute them.
    const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
    const dt = new Date(today + 'T00:00:00Z'); const monday = new Date(dt - (((dt.getUTCDay() + 6) % 7) * 864e5)).toISOString().slice(0, 10);
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CTR-SA','name'=>'Ijaiye','code'=>'IJ','status'=>'active','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-SB','name'=>'Egbeda','code'=>'EG','status'=>'active','createdAt'=>now_iso()]);`
      + mem(ADMIN, 'Ada Admin', `['role'=>'super_admin','centre'=>'Ijaiye','totpSecret'=>'X','lastLoginAt'=>now_iso()]`)
      + mem(LEAD, 'Lola Lead', `['role'=>'centre_lead','centre'=>'Ijaiye','centreScope'=>json_encode(['CTR-SA'])]`)
      + mem('NGG-SBT-M1', 'Tunde Present', `['centre'=>'Ijaiye','track'=>'Piano']`)
      + mem('NGG-SBT-M2', 'Kemi Atrisk', `['centre'=>'Ijaiye']`)
      + mem('NGG-SBT-M3', 'Bayo Egbeda', `['centre'=>'Egbeda']`)
      + `db_insert('attendance', ['studentId'=>'NGG-SBT-M1','date'=>'${today}','status'=>'late','checkInAt'=>now_iso(),'lateMinutes'=>12]);`
      + `db_insert('member_assessments', ['memberId'=>'NGG-SBT-M2','period'=>'${monday}','rating'=>'at_risk','summary'=>'Missed three sessions.','source'=>'rules','createdAt'=>now_iso()]);`
      + `db_insert('timetable_slots', ['slotId'=>'TT-SBT','centreId'=>'CTR-SA','course'=>'Piano','weekday'=>6,'startTime'=>'10:00','endTime'=>'11:00','status'=>'active','createdAt'=>now_iso()]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);

    const openAs = async (memberId) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: mintSession(memberId), domain: '127.0.0.1', path: '/', httpOnly: true }]);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e).slice(0, 220)));
      await page.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
      return { page, errs };
    };
    /* The Control Room (/control) draws a choice of parts as a radiogroup (CrSeg), not a tablist:
       "Status by area" on the board, "Part of the record" on a member's record page. */
    const radios = (page, label) => page.evaluate(l => Array.from(document.querySelectorAll('[role=radiogroup][aria-label="' + l + '"] [role=radio]')).map(b => b.textContent.trim()), label);
    const pick = async (page, label, name) => {
      const ok = await page.evaluate(({ l, n }) => {
        const b = Array.from(document.querySelectorAll('[role=radiogroup][aria-label="' + l + '"] [role=radio]')).find(x => x.textContent.trim() === n);
        if (b) b.click(); return !!b;
      }, { l: label, n: name });
      await page.waitForFunction(({ l, n }) => { const b = Array.from(document.querySelectorAll('[role=radiogroup][aria-label="' + l + '"] [role=radio]')).find(x => x.textContent.trim() === n); return b && b.getAttribute('aria-checked') === 'true'; }, { l: label, n: name }, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
      return ok;
    };
    const main = (page) => page.evaluate(() => (document.querySelector('#cr-main, #cr-pmain') || document.body).innerText);
    const board = async (page) => {
      await page.evaluate(() => window.__adminSection('status'));
      await page.waitForSelector('[role=radiogroup][aria-label="Status by area"]', { timeout: 30000 });
    };
    const record = async (page, id) => {
      await page.goto(BASE + '/control/members/members/' + id, { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForSelector('[role=radiogroup][aria-label="Part of the record"]', { timeout: 30000 });
    };
    const part = async (page, name, re) => {
      await pick(page, 'Part of the record', name);
      if (re) await page.waitForFunction(src => new RegExp(src).test((document.querySelector('#cr-main, #cr-pmain') || document.body).innerText), re.source, { timeout: 10000 }).catch(() => {});
      return main(page);
    };

    // ── The super admin's board ─────────────────────────────────────────
    console.log('\n── The status board, everything visible ─────────────────────');
    const A = await openAs(ADMIN);
    await board(A.page);
    chk('"Status board" is where the address says, under Analytics', /\/control\/analytics\/status/.test(A.page.url()) && /Status board/.test(await A.page.evaluate(() => (document.querySelector('.cr-crumb-tab') || {}).innerText || '')));
    let tl = await radios(A.page, 'Status by area');
    chk('a part for each area: members, centres, mentors, instructors, centre leads, staff (' + tl.join(' · ') + ')', tl.length === 6);
    await A.page.waitForFunction(() => /Kemi Atrisk/.test((document.querySelector('#cr-main') || document.body).innerText), null, { timeout: 15000 }).catch(() => {});
    let t = await main(A.page);
    chk('the at-risk member is on the attention list, saying why', /Kemi Atrisk/.test(t) && /at risk/i.test(t));
    await pick(A.page, 'Status by area', 'Centres');
    t = await main(A.page);
    chk('centres: both centres, and the one with no lead says so', /Ijaiye/.test(t) && /Egbeda/.test(t) && /no lead/i.test(t));
    await pick(A.page, 'Status by area', 'Staff & admins');
    t = await main(A.page);
    const staffRow = (page, who) => page.evaluate(w => { const r = Array.from(document.querySelectorAll('#cr-main tbody tr')).find(x => x.innerText.includes(w)); return r ? r.innerText : ''; }, who);
    chk('staff: the centre lead is listed, with 2FA off', /Lola Lead/.test(t) && /\bOff\b/.test(await staffRow(A.page, 'Lola Lead')));
    await A.page.click('[role=switch][aria-label="Only what needs attention"]');
    await A.page.waitForTimeout(400);
    t = await main(A.page);
    chk('"Only what needs attention" hides the admin who has 2FA and a clean record', /Lola Lead/.test(t) && !/Ada Admin/.test(await A.page.evaluate(() => Array.from(document.querySelectorAll('#cr-main tbody')).map(x => x.innerText).join(' '))));
    chk('no page errors on the board', A.errs.length === 0 || (console.log(A.errs), false));

    // ── The member record ───────────────────────────────────────────────
    console.log('\n── The member record ────────────────────────────────────────');
    await record(A.page, 'NGG-SBT-M1');
    tl = await radios(A.page, 'Part of the record');
    chk('the record has its parts (' + tl.join(' · ') + ')', ['Overview', 'Attendance', 'Conduct', 'Fees', 'Curriculum', 'Companion', 'Family & mentor', 'Classes'].every(x => tl.includes(x)));
    t = await part(A.page, 'Attendance', /Late · 12 min/);
    chk('attendance: today\'s late arrival, with the minutes', /Late · 12 min/.test(t));
    t = await part(A.page, 'Fees', /Payable now|isn’t part of your access/);
    chk('fees: a super admin (who holds every capability) sees the money', /Payable now/.test(t) && !/isn’t part of your access/.test(t));
    t = await part(A.page, 'Classes', /10:00/);
    chk('classes: their Piano class on their centre\'s timetable', /Piano/.test(t) && /10:00/.test(t));
    chk('no page errors on the record', A.errs.length === 0 || (console.log(A.errs), false));

    // ── The centre lead ─────────────────────────────────────────────────
    console.log('\n── A centre lead\'s board ────────────────────────────────────');
    const L = await openAs(LEAD);
    await board(L.page);
    tl = await radios(L.page, 'Status by area');
    chk('no staff part for a centre lead (' + tl.join(' · ') + ')', tl.length > 0 && !tl.some(x => /staff/i.test(x)));
    await pick(L.page, 'Status by area', tl.find(x => /centre/i.test(x) && !/lead/i.test(x)) || tl[1]);
    t = await main(L.page);
    chk('only their own centre', /Ijaiye/.test(t) && !/Egbeda/.test(t));
    await L.page.evaluate(() => window.__adminSection('members', 'members'));
    await L.page.waitForFunction(() => /Tunde Present/.test((document.querySelector('#cr-main') || document.body).innerText), null, { timeout: 30000 }).catch(() => {});
    t = await main(L.page);
    chk('the lead\'s roster holds their centre only', /Tunde Present/.test(t) && !/Bayo Egbeda/.test(t));
    await record(L.page, 'NGG-SBT-M1');
    t = await part(L.page, 'Fees', /Payable now|isn’t part of your access/);
    chk('fees: a centre lead (no fees capability) is told money is not their access — not shown an empty ledger', /isn’t part of your access/.test(t) && !/Payable now/.test(t));
    chk('no page errors for the lead', L.errs.length === 0 || (console.log(L.errs), false));
  } catch (e) {
    bad('threw: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log(`\n${failed ? '❌' : '✅'} status board: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
