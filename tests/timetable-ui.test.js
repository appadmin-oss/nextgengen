#!/usr/bin/env node
/* ============================================================================
   The timetable, end to end: the Control Room adds slots and is refused a
   clash with the reason on screen; a member sees their centre's week with
   their course marked; the public page shows it without instructors' names,
   accessibly, at phone width.

   Run:  node tests/timetable-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.TIMETABLE_PORT || '8285';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-timetable-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'timetable');

let _seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
function get(url, headers) {
  return new Promise((res, rej) => http.get(url, { headers }, r => {
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b).toString() }));
  }).on('error', rej));
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  timetable UI: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'timetable_test_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-TU-ADM','fullName'=>'Timetable Admin','email'=>'tu-adm@example.org','type'=>'NGG','status'=>'active','role'=>'club_admin','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-TU-M','fullName'=>'Ada Learner','email'=>'tu-m@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Piano','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('centres', ['centreId'=>'CEN-TU-1','name'=>'Egbeda','code'=>'EG','status'=>'active','meetDays'=>'Saturdays','meetTime'=>'9am - 2pm','slug'=>'egbeda','createdAt'=>${now}]);`
      + `db_insert('volunteers', ['volunteerId'=>'VOL-TU-1','fullName'=>'Ife Instructor','email'=>'tu-v@example.org','role'=>'instructor','status'=>'active','createdAt'=>${now},'updatedAt'=>${now}]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];
    const ctxFor = async (mid, admin, viewport) => {
      const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${mid}'"), ${admin ? 'true' : 'false'});`, ['session']);
      const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                            { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      return ctx;
    };

    /* ── The Control Room ── */
    const ap = await (await ctxFor('NGG-TU-ADM', true)).newPage();
    ap.on('pageerror', e => errs.push('admin: ' + String(e).slice(0, 200)));
    await ap.goto(BASE + '/nextadmin?s=timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForSelector('button:has-text("Add a slot")', { timeout: 40000 });
    await ap.selectOption('.admin-filters select', 'CEN-TU-1');
    const addSlot = async (course, start, end, room, instructor) => {
      await ap.click('button:has-text("Add a slot")');
      await ap.waitForSelector('.admin-drawer-panel');
      await ap.selectOption('.admin-drawer-panel select >> nth=1', '6');
      await ap.fill('.admin-drawer-panel input[type=time] >> nth=0', start);
      await ap.fill('.admin-drawer-panel input[type=time] >> nth=1', end);
      await ap.selectOption('.admin-drawer-panel select >> nth=2', course);
      if (room) await ap.fill('.admin-drawer-panel input[placeholder="e.g. Studio 2"]', room);
      if (instructor) await ap.selectOption('.admin-drawer-panel select >> nth=3', instructor);
      await ap.click('.admin-drawer-panel button[type=submit]');
    };
    await addSlot('Piano', '10:00', '11:30', '', 'VOL-TU-1');
    await ap.waitForSelector('.tt-table td:has-text("Piano")', { timeout: 15000 });
    chk('the Control Room adds a slot to the centre\'s timetable', php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '1');
    await addSlot('Guitar', '11:00', '12:00', '', '');
    await ap.waitForSelector('.admin-drawer-panel .admin-form-err', { timeout: 15000 });
    const why = await ap.$eval('.admin-drawer-panel .admin-form-err', el => el.innerText);
    chk('a clash is refused, and the drawer says what it clashes with', /clashes/i.test(why) && /main room already has Piano/i.test(why)
      && php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '1');
    await ap.fill('.admin-drawer-panel input[type=time] >> nth=0', '11:30');
    await ap.fill('.admin-drawer-panel input[type=time] >> nth=1', '12:30');
    await ap.click('.admin-drawer-panel button[type=submit]');
    await ap.waitForSelector('.tt-table td:has-text("Guitar")', { timeout: 15000 });
    chk('moving it to the next hour saves', php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '2');
    chk('the timetable is a real table: a caption and column headers', await ap.$eval('.tt-table', t => !!t.querySelector('caption') && t.querySelectorAll('th[scope=col]').length >= 4));
    await ap.screenshot({ path: path.join(SHOTS, 'admin.png'), fullPage: true });

    /* ── The member ── */
    const mp = await (await ctxFor('NGG-TU-M', false, { width: 390, height: 844 })).newPage();
    mp.on('pageerror', e => errs.push('member: ' + String(e).slice(0, 200)));
    await mp.goto(BASE + '/dashboard/timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.tt-table', { timeout: 40000 });
    const mine = await mp.$eval('.tt-table tr.is-mine', el => el.innerText);
    chk('the member\'s dashboard has a Timetable tab with their centre\'s week', (await mp.$$('.tt-table tbody tr')).length === 2);
    chk('…their own course marked in words, not only colour', /Piano/.test(mine) && /Your course/.test(mine));
    chk('…readable on a phone without sideways scrolling', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await mp.screenshot({ path: path.join(SHOTS, 'member-phone.png'), fullPage: true });

    /* ── The public ── */
    const pp = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    pp.on('pageerror', e => errs.push('public: ' + String(e).slice(0, 200)));
    await pp.goto(BASE + '/timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pp);
    await pp.waitForSelector('.tt-pick select', { timeout: 40000 });
    await pp.selectOption('.tt-pick select', 'egbeda');
    await pp.waitForSelector('.tt-table', { timeout: 15000 });
    chk('the public page shows a centre\'s week when it is chosen', (await pp.$$('.tt-table tbody tr')).length === 2);
    chk('…puts the centre in the address, so the link can be shared', /\?centre=egbeda/.test(pp.url()));
    chk('…and never names the instructor', !/Ife Instructor/.test(await pp.$eval('body', el => el.innerText)));
    chk('…labelled controls: the centre picker has a visible label', await pp.$eval('.tt-pick', el => /Centre/.test(el.innerText) && !!el.querySelector('select')));
    await pp.goto(BASE + '/timetable?centre=egbeda', { waitUntil: 'domcontentloaded' });
    await pp.waitForSelector('.tt-table', { timeout: 40000 });
    chk('a shared link opens straight on that centre', (await pp.$$('.tt-table tbody tr')).length === 2);
    await pp.screenshot({ path: path.join(SHOTS, 'public-phone.png'), fullPage: true });

    chk('no page errors on any screen', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (timetable UI)');
  process.exit(failed ? 1 : 0);
})();
