#!/usr/bin/env node
/* ============================================================================
   Clearing dues a member does not owe (Members → a record → Fees), end to end.

   Imported members arrive with years of membership and dues charged from an
   old join date. "Clear dues they don't owe" settles them up to a date
   (fees_settle_through): unpaid membership and dues on or before it are
   waived with a reason, and the accrual never charges those periods again.

   Run:  node tests/fees-settle-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FS_PORT || '8298';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-fs-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-FS-ADM', MEM = 'NGG-FS-IMP';
const CSRF = 'fs-csrf-0123456789abcdef';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
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

const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 15000 }).then(() => true, () => false);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  fees settle: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'fees_settle_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());
      db_insert('centres', ['centreId'=>'CEN-FS-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','totpSecret'=>'JBSWY3DPEHPK3PXP','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${MEM}','fullName'=>'Imported Ada Bello','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','joinDate'=>'2024-01-10','displayId'=>'024-001','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      fees_settings_save(['enabled' => true, 'membershipFee' => 5000, 'membershipEveryMonths' => 12, 'monthlyDues' => 1000, 'trainingFee' => 0, 'balanceCap' => 0, 'remindEnabled' => false], '${ADMIN}');
      fees_accrue_member(db_row("SELECT * FROM members WHERE memberId = '${MEM}'"));`, ['bootstrap']);
    const payable = () => Number(php(`echo fees_balance(db_row("SELECT * FROM members WHERE memberId = '${MEM}'"))['payable'];`, ['bootstrap']));
    const before = payable();
    chk('the imported member starts owing years of dues', before > 40000);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const admTok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: admTok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: CSRF, domain: '127.0.0.1', path: '/' }]);
    const P = await ctx.newPage();
    const errs = [];
    P.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    P.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
    await P.goto(BASE + '/control/members/members/' + MEM, { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('[aria-label="Part of the record"]', { timeout: 60000 });
    await P.click('[aria-label="Part of the record"] >> text=Fees');
    chk('the Fees part offers to clear dues they don’t owe', await until(P, () => /Owes dues from before this system/.test(document.body.innerText), null, 20000));
    await P.click('button:has-text("Clear dues they don’t owe")');
    await P.waitForSelector('[role="dialog"]');
    await P.click('[role="dialog"] button[type="submit"]');
    chk('a reason is required on the form', await until(P, () => /Enter why/.test(document.querySelector('[role="dialog"]').innerText)));
    await P.fill('[role="dialog"] textarea', 'Imported member: paid before joining this system');
    await P.click('[role="dialog"] button[type="submit"]');
    chk('saving says what was cleared and to when', await until(P, () => /cleared · settled up to/.test(document.body.innerText)));
    chk('…the account owes nothing now', payable() === 0);
    chk('the record says it is settled, and offers a later date', await until(P, () => /Membership and dues settled up to/.test(document.body.innerText) && /Settle to a later date/.test(document.body.innerText), null, 20000));
    php(`fees_accrue_member(db_row("SELECT * FROM members WHERE memberId = '${MEM}'"));`, ['bootstrap']);
    chk('the next accrual does not bring the dues back', payable() === 0);
    chk('no page errors', errs.length === 0);
    if (errs.length) console.log(errs.slice(0, 5));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: the suite crashed: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
