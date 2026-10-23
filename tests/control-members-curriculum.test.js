#!/usr/bin/env node
/* ============================================================================
   Control Room v2 — Members → Roster and Learning → Curriculum, end to end.

   The two screens that broke in the field: a member's Edit that would not
   save, and a bundled course that would not import. Driven against a REAL
   PHP + SQLite backend in Chromium, and checked in the database, not only on
   screen:

     · THE ROSTER IS SERVER-PAGED, and does not fetch in a loop (a `server`
       object made per render re-fetched forever and starved the browser).
     · EDIT SAVES WHAT CHANGED, with no CSRF cookie to begin with — the client
       mints one — and a refused save keeps the form and gives the server's
       sentence, not a code.
     · A BUNDLED COURSE IMPORTS: check, confirm, import, and a second check
       reports every lesson unchanged.

   Self-contained: throwaway api/config.php, refuses to overwrite one.
   Run:  node tests/control-members-curriculum.test.js   (CRMC_PORT, default 8266)
   ========================================================================== */
'use strict';

const { execFileSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CRMC_PORT || '8266';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-crmc-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-crmc-cache-${process.pid}`);

function php(snippet) {
  const code = `$GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util', 'session'].map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + 'db_conn();' + snippet;
  return execFileSync('php', ['-r', code], { cwd: ROOT }).toString().trim();
}
const one = sql => JSON.parse(php(`echo json_encode(db_row(${JSON.stringify(sql)}));`));

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
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  control members/curriculum: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'crmc_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'debug' => false,
  ];\n`);

  try {
    const sess = php(`$n = now_iso();
      db_insert('members', ['memberId'=>'CRMC-ADM','fullName'=>'Root Admin','email'=>'crmc-adm@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>$n,'updatedAt'=>$n]);
      db_insert('centres', ['centreId'=>'CTR-EG','name'=>'Egbeda','code'=>'EG','color'=>'#3B5BDB','status'=>'active','capacity'=>0,'createdAt'=>$n]);
      db_insert('centres', ['centreId'=>'CTR-IJ','name'=>'Ijaiye','code'=>'IJ','color'=>'#76B043','status'=>'active','capacity'=>0,'createdAt'=>$n]);
      for ($i = 1; $i <= 30; $i++) db_insert('members', ['memberId'=>'CRMC-'.$i,'fullName'=>'Member '.sprintf('%02d',$i),'email'=>"crmc$i@example.org",'type'=>'NGG','status'=>'active','role'=>'member','centre'=>$i % 2 ? 'Egbeda' : 'Ijaiye','createdAt'=>$n,'updatedAt'=>$n]);
      db_update('members', ['joinDate'=>'2021-05-02'], ['memberId'=>'CRMC-7']);
      echo session_issue(db_row("SELECT * FROM members WHERE memberId='CRMC-ADM'"), true);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else {
      const d = fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').find(x => x.startsWith('chromium-')) : null;
      if (d) launch.executablePath = `/opt/pw-browsers/${d}/chrome-linux/chrome`;
    }
    browser = await chromium.launch(launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: sess, domain: '127.0.0.1', path: '/', httpOnly: true }]);
    const page = await ctx.newPage();
    const errs = []; let listCalls = 0;
    page.on('pageerror', e => errs.push(String(e).slice(0, 240)));
    page.on('request', r => { if (r.method() === 'GET' && /\/api\/admin\/members\.php/.test(r.url()) && !/view=/.test(r.url())) listCalls++; });
    const body = () => page.innerText('body');
    const until = (re, ms) => page.waitForFunction(s => new RegExp(s).test(document.body.innerText), re.source, { timeout: ms || 20000 }).then(() => true, () => false);

    // ── Roster ──
    await page.goto(BASE + '/control/members', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    const listed = await page.waitForSelector('table tbody tr', { timeout: 60000 }).then(() => true, () => false);
    chk('the roster lists members', listed && /Member 0/.test(await page.innerText('table')));
    await page.waitForTimeout(2000);
    chk('the roster fetches once, not in a loop (' + listCalls + ')', listCalls <= 2);
    chk('the footer gives the true total', /of 31/.test(await body()));
    await page.fill('input[aria-label="Search by name, ID, email or phone"]', 'Member 07');
    chk('search narrows on the server', await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length === 1, null, { timeout: 15000 }).then(() => true, () => false));
    /* Joined is the roster's join date, not the day the record was made —
       an imported roster used to read as everybody joining on import day. */
    chk('the Joined column shows the join date on file', /2 May 2021/.test(await page.innerText('table tbody tr')));

    // ── Edit, with no CSRF cookie to start with ──
    await page.evaluate(() => { document.cookie = 'ngg_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });
    await page.click('table tbody tr');
    await page.click('.cr-sheet button:has-text("Edit")');
    await page.fill('#crf-phone', '08031234567');
    await page.selectOption('#crf-centre', 'Ijaiye');
    // The join date is not on the edit form any more: it is corrected with a reason (profile-drive.php).
    chk('the edit form does not carry the join date', !(await page.$('#crf-joinDate')));
    await page.click('button:has-text("Save changes")');
    chk('Edit saves and says so', await until(/Saved · Member 07/));
    const m7 = one("SELECT phone, centre, email, joinDate FROM members WHERE memberId='CRMC-7'");
    chk('…and the record holds the change, untouched fields intact', m7.phone === '08031234567' && m7.centre === 'Ijaiye' && m7.email === 'crmc7@example.org');
    chk('…the join date untouched by the edit', m7.joinDate === '2021-05-02');
    // Corrected through its own action, inside the intake year the printed ID carries.
    const did = one("SELECT displayId FROM members WHERE memberId='CRMC-7'").displayId || '';
    const yr = /^\d{3}-/.test(did) ? 2000 + (Number(did.slice(0, 3)) % 100) : 2021;
    await page.click('table tbody tr');
    await page.click('.cr-sheet button:has-text("Correct the join date")');
    await page.waitForSelector('form:has-text("Why it is being corrected")');
    await page.fill('form input[type=date]', yr + '-09-17');
    await page.fill('form textarea', 'The register shows September');
    await page.click('form button[type=submit]');
    chk('…and corrected with a reason through “Correct the join date”', await until(/Join date corrected/)
      && one("SELECT joinDate FROM members WHERE memberId='CRMC-7'").joinDate === yr + '-09-17');

    await page.click('table tbody tr');
    await page.click('.cr-sheet button:has-text("Edit")');
    await page.fill('#crf-email', 'crmc8@example.org');
    await page.click('button:has-text("Save changes")');
    chk('a refused save gives the server’s reason', await until(/already on Member 08/));
    chk('…and keeps the form open with what was typed', !!(await page.$('#crf-email')));
    await page.keyboard.press('Escape');

    await page.click('button:has-text("Add member")');
    await page.fill('#crf-fullName', 'New Person');
    await page.fill('#crf-email', 'crmc-new@example.org');
    await page.selectOption('#crf-centre', 'Egbeda');
    await page.click('.cr-sheet button[type=submit]');
    chk('Add member creates the record', await until(/Added · New Person/));
    const added = one("SELECT status, displayId FROM members WHERE email='crmc-new@example.org'");
    chk('…active, with a printed ID minted', !!added && added.status === 'active' && /^\d{3}-\d{3}$/.test(added.displayId || ''));

    // ── Curriculum import from a bundled course ──
    await page.goto(BASE + '/control/learning/curriculum', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Import lessons")', { timeout: 60000 });
    const check = async () => {
      await page.click('button:has-text("Import lessons")');
      await page.selectOption('#crf-seed', 'practical-coding-2026');
      await page.click('button:has-text("Check the lessons")');
    };
    await check();
    chk('the check lists the lessons before anything is written', await until(/Import 72 lessons/, 60000)
      && +one('SELECT COUNT(*) n FROM curriculum_units').n === 0);
    await page.click('button:has-text("Import 72 lessons")');
    await page.click('.cr-confirm button.is-primary');
    chk('Import writes the 72 lessons', await until(/Imported · 72 created/, 60000) && +one('SELECT COUNT(*) n FROM curriculum_units').n === 72);
    chk('…and the lessons table lists them', await until(/72 lessons/));
    await check();
    chk('a second check reports every lesson unchanged', await until(/72 unchanged/, 60000));

    // ── Course coverage, and a term's outline for a course with none ──
    chk('coverage: the Courses table lists the catalogue, with the courses that have no lessons', await until(/Courses with none/) && await until(/Robotics/) && await until(/No lessons/));
    await page.click('button:has-text("Build a course outline") >> nth=0');
    await page.selectOption('#crf-course', 'Robotics');
    await page.click('button:has-text("Draft the outline")');
    chk('the outline is checked like an import before anything is written', await until(/Import 12 lessons/, 60000)
      && +one("SELECT COUNT(*) n FROM curriculum_units WHERE course = 'Robotics'").n === 0);
    await page.click('button:has-text("Import 12 lessons")');
    await page.click('.cr-confirm button.is-primary');
    chk('…and imports twelve weekly drafts nobody sees yet', await until(/Imported · 12 created/, 60000)
      && +one("SELECT COUNT(*) n FROM curriculum_units WHERE course = 'Robotics' AND status = 'draft'").n === 12
      && +one("SELECT COUNT(*) n FROM curriculum_units WHERE course = 'Robotics' AND status = 'published'").n === 0);
    chk('…week 1 to 12, opening with the welcome and closing with the showcase', /Welcome to Robotics/.test(one("SELECT title FROM curriculum_units WHERE course = 'Robotics' AND week = 1").title)
      && /Showcase/.test(one("SELECT title FROM curriculum_units WHERE course = 'Robotics' AND week = 12").title));

    chk('no uncaught page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + String(e).slice(0, 400));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (control room: members + curriculum)`);
  process.exit(failed ? 1 : 0);
})();
