#!/usr/bin/env node
/* ============================================================================
   NGG centres and Summer School's, end to end: a past edition imported
   through Summer School → Past editions, and a participant promoted through
   the centre form, nearest NGG centre first.

   Run:  node tests/centres-promote.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CP_PORT || '8299';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-cp-'));
const DB = path.join(TMP, 'ngg.db');
const OLD = path.join(TMP, 'old-site', 'api', 'storage', 'photos');
const ADMIN = 'NGG-CP-ADM';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=stderr ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed: ' + String(e.stdout || '') + String(e.stderr || '')); }
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
  if (!process.env.PR_KEEP) try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  centres & promotion: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'centres_promote_secret_0123456789ab',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  const csv = path.join(TMP, 'past.csv');
  fs.writeFileSync(csv, "Child's Name,DOB,Centre,Course,Parent Phone,ID,Days present\nBisi Adeyemi,09/03/2014,Egbeda,Robotics,0803 111 2222,EG-24-001,18\nTayo Bello,2013-07-21,Agege,Music,08022223333,,12\nBisi Adeyemi,09/03/2014,Egbeda,Robotics,0803 111 2222,EG-24-001,18\n");
  try {
    // A live deployment's shape before the split: one Egbeda for both programmes, members on it.
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'C-EG','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','programmes'=>'','slug'=>'egbeda','lat'=>6.594,'lng'=>3.29,'summerLat'=>6.60,'summerLng'=>3.295,'createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'C-IK','name'=>'Ikeja','code'=>'IKJ','color'=>'#76b043','status'=>'active','programmes'=>'ngg','slug'=>'ikeja','lat'=>6.6018,'lng'=>3.3515,'createdAt'=>now_iso()]);`
      + `db_insert('summer_cohorts', ['cohortId'=>'SUM-2026','name'=>'Summer School 2026','year'=>2026,'startDate'=>'2026-07-01','endDate'=>'2026-08-28','status'=>'closed','createdAt'=>now_iso()]);`
      + `db_insert('summer_students', ['studentId'=>'SUM-2026-0001','cohortId'=>'SUM-2026','token'=>'','handle'=>'kemi-ade','fullName'=>'Kemi Adewale','centre'=>'Egbeda','status'=>'active','parentEmail'=>'kemi.mum@example.com','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `setting_set('centres_split_seed', '', 'test'); echo json_encode(centres_split_seed_once());`, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                          { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const errs = [];
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`, ['bootstrap']));

    chk('the split: NGG has Egbeda and Ayobo; Summer School’s Egbeda is its own record, retired, with Kemi on it',
      q(`db_row("SELECT programmes, status FROM centres WHERE name = 'Egbeda'")`).programmes === 'ngg'
      && q(`db_row("SELECT status FROM centres WHERE name = 'Ayobo'")`).status === 'active'
      && q(`db_row("SELECT status FROM centres WHERE name = 'Egbeda (Summer School)'")`).status === 'retired'
      && q(`db_row("SELECT centre FROM summer_students WHERE studentId = 'SUM-2026-0001'")`).centre === 'Egbeda (Summer School)');

    // A past edition, imported.
    await pg.goto(BASE + '/control/summer/summer-history', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('button:has-text("Import a past edition")', { timeout: 60000 });
    await pg.click('.cr-head-acts button:has-text("Import a past edition")');
    await pg.waitForSelector('form[aria-label="Import a past edition"]');
    await pg.click('form[aria-label="Import a past edition"] button:has-text("A new past edition")');
    await pg.fill('#crf-name', 'Summer School 2024');
    await pg.fill('#crf-year', '2024');
    await pg.fill('#crf-startDate', '2024-07-15');
    await pg.fill('#crf-endDate', '2024-08-30');
    await pg.setInputFiles('#crf-file', csv);
    await pg.click('form[aria-label="Import a past edition"] button[type=submit]');
    await pg.waitForFunction(() => /Nothing has been written/.test(document.body.innerText), null, { timeout: 30000 });
    const plan = await pg.innerText('body');
    chk('Past editions: the file is checked first — 2 new, 1 already there, Agege to be created — and nothing is written',
      /Agege/.test(plan) && q(`(int)db_row("SELECT COUNT(*) c FROM summer_students WHERE fullName = 'Bisi Adeyemi'")['c']`) === 0);
    await pg.click('button:has-text("Import 2 participants")');
    const conf = await pg.waitForSelector('.cr-layer button:has-text("Import"), [role=dialog] button:has-text("Import"), [role=alertdialog] button:has-text("Import")', { timeout: 10000 });
    await conf.click();
    await pg.waitForFunction(() => /2 participants imported/.test(document.body.innerText), null, { timeout: 30000 });
    const bisi = q(`db_row("SELECT s.centre, s.displayId, s.daysPresent, s.dob, c.status FROM summer_students s JOIN summer_cohorts c ON c.cohortId = s.cohortId WHERE s.fullName = 'Bisi Adeyemi'")`);
    chk('…then imported: the edition closed, Bisi on Summer School’s Egbeda with her ID, days and birthday', bisi && bisi.status === 'closed' && bisi.centre === 'Egbeda (Summer School)' && bisi.displayId === 'EG-24-001' && Number(bisi.daysPresent) === 18 && bisi.dob === '2014-03-09');

    // Promotion asks which NGG centre, nearest first.
    await pg.goto(BASE + '/control/members/members', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('[role=search] input, input[type=search]', { timeout: 60000 });
    await pg.fill('[role=search] input, input[type=search]', 'Kemi Adewale');
    await pg.waitForSelector('button:has-text("Promote to member")', { timeout: 30000 });
    await pg.click('button:has-text("Promote to member")');
    await pg.waitForSelector('form[aria-label^="Make Kemi Adewale"]', { timeout: 30000 });
    const form = await pg.innerText('form[aria-label^="Make Kemi Adewale"]');
    chk('Promote asks for the NGG centre: NGG centres only, the nearest to where her Summer School met first and chosen',
      /Egbeda · [^\n]*(min drive|km)[^\n]* · nearest/.test(form) && /Ikeja/.test(form) && !/Summer School\)/.test(form.replace(/Summer School record/, ''))
      && (await pg.$eval('form[aria-label^="Make Kemi Adewale"] [role=radio][aria-checked=true]', el => el.innerText)).startsWith('Egbeda'));
    await pg.click('form[aria-label^="Make Kemi Adewale"] [role=radio]:has-text("Ikeja")');
    await pg.click('form[aria-label^="Make Kemi Adewale"] button[type=submit]');
    await pg.waitForFunction(() => /now a member/.test(document.body.innerText), null, { timeout: 30000 });
    chk('…and the member joins the centre chosen', q(`db_row("SELECT centre FROM members WHERE fullName = 'Kemi Adewale'")`).centre === 'Ikeja');
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (centres & promotion)');
  process.exit(failed ? 1 : 0);
})();
