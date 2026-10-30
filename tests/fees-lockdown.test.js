#!/usr/bin/env node
/* ============================================================================
   Money that one person cannot make disappear, end to end.

   1. "Clear dues they don't owe" is gone (retired 2026-10-30 as a fraud path):
      a member's Fees part no longer offers it, and the server refuses it.
   2. Every active member's fines can be cleared ONCE (Dues & arrears →
      Upload fines): a super admin previews the accounts, then runs it with a
      reason, the typed phrase and a code from their authenticator app. After
      that the screen shows the record of the run and nothing else — reloaded,
      and to the server — for ever.

   Run:  node tests/fees-lockdown.test.js
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
  if (!chromium) { console.log('⏭  fees lockdown: skipped (playwright not installed)'); process.exit(0); }
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
    await until(P, () => /Outstanding/.test(document.body.innerText), null, 20000);
    const feesText = await P.evaluate(() => document.body.innerText);
    chk('a member’s Fees part no longer offers to clear dues', !/Clear dues they don’t owe|Owes dues from before this system|Settle to a later date/.test(feesText));
    const refused = php(`echo json_encode(backend_dispatch('admin.fees.settle', ['requesterId' => '${ADMIN}', 'memberId' => '${MEM}', 'reason' => 'Imported: paid before', 'date' => gmdate('Y-m-d')]));`, ['bootstrap']);
    chk('…and the server refuses it to a super admin, writing nothing', JSON.parse(refused).error === 'retired' && payable() === before);

    // ── The one-time clearance ──
    php(`fees_post('${MEM}', 'fine', 2500, ['periodKey' => 'fs:fine1', 'method' => 'other', 'note' => 'Old register']);
         db_insert('members', ['memberId'=>'NGG-FS-K2','fullName'=>'Kemi Fined','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','joinDate'=>gmdate('Y-m-d'),'createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
         fees_post('NGG-FS-K2', 'fine', 1000, ['periodKey' => 'fs:fine2', 'method' => 'other', 'note' => 'Old register']);`, ['bootstrap']);
    const finesOwed = () => Number(php(`echo fees_unpaid_of(db_row("SELECT * FROM members WHERE memberId = '${MEM}'"), ['fine']) + fees_unpaid_of(db_row("SELECT * FROM members WHERE memberId = 'NGG-FS-K2'"), ['fine']);`, ['bootstrap']));
    chk('two active members owe old fines', finesOwed() === 3500);
    await P.goto(BASE + '/control/money/fees/fines', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('Upload fines offers the super admin the one-time clearance', await until(P, () => /Clear the fines of every active member — once/.test(document.body.innerText), null, 60000));
    await P.click('button:has-text("See whose fines would be cleared")');
    chk('the preview lists each account and the total before anything happens',
      await until(P, () => /2 active members with unpaid fines — ₦3,500 in all/.test(document.body.innerText) && /Kemi Fined/.test(document.body.innerText)) && finesOwed() === 3500);
    await P.click('button:has-text("Clear these fines, once")');
    await P.waitForSelector('[role="dialog"]');
    const dlg = '[role="dialog"]';
    await P.fill(dlg + ' textarea', 'Fines carried over from the paper register, cleared by board decision');
    const inputs = await P.$$(dlg + ' input');
    await inputs[0].fill('CLEAR ALL FINES');
    await inputs[1].fill('000000');
    await P.click(dlg + ' button[type="submit"]');
    chk('a wrong authenticator code is refused on the form, and nothing is cleared',
      await until(P, () => /not the current code/.test(document.querySelector('[role="dialog"]')?.innerText || '')) && finesOwed() === 3500);
    const code = php(`echo totp_code('JBSWY3DPEHPK3PXP', intdiv(time(), 30));`, ['bootstrap']);
    await inputs[1].fill(code);
    await P.click(dlg + ' button[type="submit"]');
    const okRun = await until(P, () => /₦3,500 of fines cleared across 2 members\. This is now locked\./.test(document.body.innerText));
    if (!okRun) console.error('   body: ' + (await P.evaluate(() => document.body.innerText)).slice(0, 900).replace(/\s+/g, ' '));
    const k2 = () => Number(php(`echo fees_balance(db_row("SELECT * FROM members WHERE memberId = 'NGG-FS-K2'"))['payable'];`, ['bootstrap']));
    chk('with the current code it clears every unpaid fine and says it is locked (each account down by exactly its fines)', okRun && k2() === 0 && payable() === before);
    chk('…the dues are still owed', payable() === before && before > 40000);
    await P.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('reloaded, the screen shows the record of the one run and no way to run it again',
      await until(P, () => /Fines were cleared once for every active member/.test(document.body.innerText) && /can never be run again/.test(document.body.innerText), null, 60000)
      && !(await P.$('button:has-text("See whose fines would be cleared")')));
    const again = JSON.parse(php(`echo json_encode(backend_dispatch('admin.fees.finesClearOnce', ['requesterId' => '${ADMIN}', 'mode' => 'preview']));`, ['bootstrap']));
    chk('…and the server refuses it for good', again.error === 'already_used');
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
