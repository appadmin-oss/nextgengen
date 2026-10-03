#!/usr/bin/env node
/* ============================================================================
   Uploading a sheet of fines, end to end: real PHP server, real session, the
   real screen (Dues & fees → Upload fines).

   What must hold:
     · A CSV of fines is checked first: every row names the member it matched
       and how, ambiguous rows are refused with the candidates, nothing posts.
     · Post fines writes exactly the rows that passed, to the member ledger.
     · The same sheet checked again reports every fine as already posted.

   Run:  node tests/fines-upload.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FINES_PORT || '8282';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-fines-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'fines');

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
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) }));
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

async function contextFor(memberId, admin, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`, ['session']);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
  await ctx.addCookies([
    { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
    { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
  ]);
  return { ctx, token };
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  fines upload: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'fines_test_secret_0123456789abcdefg',
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
    const mk = (id, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'X ${id}','email'=>strtolower('${id}').'@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}], ${extra}));`;
    php(`db_migrate(db_conn());`
      + mk('NGG-FU-ADM', "['role'=>'super_admin','fullName'=>'Fines Admin']")
      + mk('NGG-FU-1', "['fullName'=>'Chidi Okafor','displayId'=>'026-501']")
      + mk('NGG-FU-2', "['fullName'=>'Amaka Bello','email'=>'bello@example.org']")
      + mk('NGG-FU-3', "['fullName'=>'Tunde Bello','email'=>'bello@example.org']"));
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];
    const { ctx } = await contextFor('NGG-FU-ADM', true);
    const ap = await ctx.newPage();
    ap.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await ap.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
    await ap.evaluate(() => window.__adminSection('fees'));
    await ap.waitForSelector('button:has-text("Upload fines")', { timeout: 30000 });
    await ap.click('button:has-text("Upload fines")');
    await ap.waitForSelector('.fine-imp');
    const csv = path.join(TMP, 'fines.csv');
    fs.writeFileSync(csv, 'Member No,Name,Email,Amount,Reason,Date,Comments\n'
      + '026-501,,,"₦2,000",Lateness,04/10/2026,\n'
      + ',Tunde Bello,bello@example.org,500,conduct,2026-10-04,Shouting\n'
      + ',,bello@example.org,500,conduct,2026-10-04,\n'
      + ',Nobody Known,,500,late,,\n');
    await ap.setInputFiles('.fine-imp input[type=file]', csv);
    await ap.click('button:has-text("Check the file")');
    await ap.waitForSelector('.fine-imp-tally');
    const t1 = await ap.$eval('.fine-imp-plan', el => el.innerText);
    chk('the check matches by printed ID and by email + name, and posts nothing',
      /2\s*to post/.test(t1) && /Chidi Okafor/.test(t1) && /Tunde Bello/.test(t1)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM member_ledger")['c'];`) === '0');
    chk('a shared family email alone is refused, with both siblings named', /more than one member matches/i.test(t1) && /Amaka Bello/.test(t1));
    chk('an unknown person is refused', /no member matches/i.test(t1));
    await ap.screenshot({ path: path.join(SHOTS, 'checked.png'), fullPage: true });
    await ap.click('.fine-imp-plan button:has-text("Post fines")');
    await ap.click('.modal-ok, button:has-text("Post fines") >> nth=-1').catch(() => {});
    await ap.waitForFunction(() => /— posted\./.test(document.querySelector('.fine-imp-tally')?.innerText || ''), null, { timeout: 15000 });
    chk('Post fines writes the rows that passed, to the member ledger',
      php(`echo json_encode(db_all("SELECT memberId, amount FROM member_ledger WHERE kind = 'fine' ORDER BY memberId"));`) === '[{"memberId":"NGG-FU-1","amount":2000},{"memberId":"NGG-FU-3","amount":500}]');
    await ap.setInputFiles('.fine-imp input[type=file]', csv);
    await ap.click('button:has-text("Check the file")');
    await ap.waitForFunction(() => /2\s*already posted/.test(document.querySelector('.fine-imp-tally')?.innerText || ''), null, { timeout: 15000 });
    chk('the same sheet again fines nobody twice', !(await ap.$('.fine-imp-plan button:has-text("Post fines")')));
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (fines upload)');
  process.exit(failed ? 1 : 0);
})();
