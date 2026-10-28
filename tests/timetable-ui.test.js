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
      + `db_insert('members', ['memberId'=>'NGG-TU-M','fullName'=>'Ada Learner','email'=>'tu-m@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Music','createdAt'=>${now},'updatedAt'=>${now}]);`
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
    await addSlot('Music', '10:00', '11:30', '', 'VOL-TU-1');
    await ap.waitForSelector('.tt-table td:has-text("Music")', { timeout: 15000 });
    chk('the Control Room adds a slot to the centre\'s timetable', php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '1');
    await addSlot('Acting', '11:00', '12:00', '', '');
    await ap.waitForSelector('.admin-drawer-panel .admin-form-err', { timeout: 15000 });
    const why = await ap.$eval('.admin-drawer-panel .admin-form-err', el => el.innerText);
    chk('a clash is refused, and the drawer says what it clashes with', /clashes/i.test(why) && /main room already has Music/i.test(why)
      && php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '1');
    await ap.fill('.admin-drawer-panel input[type=time] >> nth=0', '11:30');
    await ap.fill('.admin-drawer-panel input[type=time] >> nth=1', '12:30');
    await ap.click('.admin-drawer-panel button[type=submit]');
    await ap.waitForSelector('.tt-table td:has-text("Acting")', { timeout: 15000 });
    chk('moving it to the next hour saves', php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '2');
    chk('the timetable is a real table: a caption and column headers', await ap.$eval('.tt-table', t => !!t.querySelector('caption') && t.querySelectorAll('th[scope=col]').length >= 4));
    await ap.screenshot({ path: path.join(SHOTS, 'admin.png'), fullPage: true });

    /* ── The member ── */
    const mp = await (await ctxFor('NGG-TU-M', false, { width: 390, height: 844 })).newPage();
    mp.on('pageerror', e => errs.push('member: ' + String(e).slice(0, 200)));
    await mp.goto(BASE + '/dashboard/timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    /* The member portal (v9): THEIR class first, the centre's classes by day
       with theirs marked in words, then one button into the maker. */
    await mp.waitForFunction(() => /Your class/.test(document.body.innerText) && /Make my week/.test(document.body.innerText), null, { timeout: 60000 });
    const mtxt = await mp.innerText('main');
    chk('the member\'s timetable leads with their own class: course, day and time', /Your class\s*\n\s*Music\s*\n\s*Saturday · 10:00–11:30/.test(mtxt));
    chk('…then the centre\'s classes, theirs marked in words, not only colour', /Classes on Saturday/.test(mtxt) && /Music\s*Yours/.test(mtxt) && /Acting/.test(mtxt) && !/Acting\s*Yours/.test(mtxt));
    chk('…readable on a phone without sideways scrolling', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await mp.screenshot({ path: path.join(SHOTS, 'member-phone.png'), fullPage: true });
    await mp.click('button:has-text("Make my week")');
    await mp.waitForURL(/\/timetable\/me/, { timeout: 20000 });
    await waitForBoot(mp);
    await mp.waitForFunction(() => /Not sure where to start\?/.test(document.body.innerText), null, { timeout: 40000 });
    await mp.waitForFunction(() => /Your NGG classes \(done\)/.test(document.body.innerText) || /Change centre/.test(document.body.innerText), null, { timeout: 20000 });
    const tx = await mp.innerText('body');
    chk('"Make my week" opens the maker with their centre\'s classes already in, and three optional steps instead of six choices', /Change centre/.test(tx) && /Type a lesson/.test(tx) && /Plan my study time/.test(tx) && !/What’s your week like\?/.test(tx));
    chk('…their own class is marked in the maker too', await mp.evaluate(() => /Music[\s\S]{0,40}Your course/i.test(document.body.innerText)));
    await mp.screenshot({ path: path.join(SHOTS, 'maker-steps-phone.png'), fullPage: false });
    await mp.click('button:has-text("Type a lesson")');
    await mp.waitForTimeout(400);
    chk('…"Type a lesson" puts the cursor in the add box', await mp.evaluate(() => !!document.activeElement && /tt-composer-input|tt-input--qa/.test(document.activeElement.className)));
    /* Building is free: a first-time visitor on a desktop can type a class
       at once, with no preset chosen; the presets only change suggestions. */
    const fp = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
    fp.on('pageerror', e => errs.push('maker: ' + String(e).slice(0, 200)));
    await fp.goto(BASE + '/timetable/me', { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await fp.waitForSelector('input[aria-label="Add in plain words"]', { timeout: 40000 });
    chk('a fresh maker has the add box from the start, and the presets are optional suggestions', /Suggestions for:/.test(await fp.innerText('body')) && !/What’s your week like\?/.test(await fp.innerText('body')));
    await fp.fill('input[aria-label="Add in plain words"]', 'Maths Mon Wed 8-9 Room 4');
    await fp.press('input[aria-label="Add in plain words"]', 'Enter');
    await fp.waitForFunction(() => /Maths/.test((document.querySelector('.tt-listpane') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    chk('…and a class typed in plain words goes straight into the week, no preset needed', /Maths/.test(await fp.innerText('.tt-listpane')));
    await fp.screenshot({ path: path.join(SHOTS, 'maker-free-desktop.png') });
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
