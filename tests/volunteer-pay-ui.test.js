#!/usr/bin/env node
/* ============================================================================
   Volunteer pay (Control Room → Money → Volunteer pay, and the volunteer's
   own Me screen), end to end.

   A volunteer present and active on a programme day earns the admin's amount
   (domain/volunteer-pay.php). This drives the screens: the period shows the
   volunteer and what is owed; their wallet lists each day, earned or excluded
   with the reason; a period that has ended is paid, with its reference, and
   the payout is recorded once; the volunteer sees their own wallet.

   Run:  node tests/volunteer-pay-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.VP_PORT || '8311';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-vp-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-VP-ADM', MEM = 'NGG-VP-MEM', VOL = 'VOL-VP-1';
const CSRF = 'vp-csrf-0123456789abcdef';

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
const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  volunteer pay: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'volunteer_pay_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const period = php(`db_migrate(db_conn());
      db_insert('centres', ['centreId'=>'CEN-VP-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','totpSecret'=>'JBSWY3DPEHPK3PXP','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${MEM}','fullName'=>'Tobi Adeyemi','email'=>'tobi@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','displayId'=>'026-201','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('volunteers', ['volunteerId'=>'${VOL}','fullName'=>'Tobi Adeyemi','email'=>'tobi@example.org','role'=>'facilitator','status'=>'active','safeguarding'=>'cleared','programme'=>'ngg','centre'=>'Egbeda','memberId'=>'${MEM}','createdAt'=>now_iso()]);
      $mon = gmdate('Y-m-d', strtotime('monday last week'));
      $day = fn($n) => gmdate('Y-m-d', strtotime($mon . ' +' . $n . ' days'));
      foreach ([[1, true], [2, false], [3, true]] as [$n, $out]) db_insert('attendance', ['studentId'=>'${VOL}','date'=>$day($n),'checkInAt'=>$day($n).'T08:00:00Z','checkOutAt'=>$out ? $day($n).'T15:00:00Z' : '','method'=>'test','status'=>'present','lateMinutes'=>0]);
      volpay_settings_save(['enabled'=>true,'amount'=>3000,'frequency'=>'weekly','startDate'=>$mon,'days'=>'any','requireActivity'=>true,'activities'=>['checkout','duty','points','session']], '${ADMIN}');
      volpay_accrue();
      echo volpay_period($day(1), 'weekly')[0];`, ['bootstrap']);
    chk('two days earned, one excluded, before any screen opens', php(`echo db_row("SELECT SUM(status='earned') e, SUM(status='excluded') x FROM volunteer_pay")['e'] . '/' . db_row("SELECT SUM(status='excluded') x FROM volunteer_pay")['x'];`, ['bootstrap']) === '2/1');

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const tok = (id, adm) => php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), ${adm ? 'true' : 'false'});`, ['session']);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    browser = await launch();
    const errs = [];
    const open = async (id, adm, at, w = 1440, h = 1000) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addCookies([{ name: 'ngg_sess', value: tok(id, adm), domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: CSRF, domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };

    console.log('Control Room → Money → Volunteer pay');
    const P = await open(ADMIN, true, '/control/money/volpay/' + period);
    chk('the period lists the volunteer, with what is owed', await until(P, () => /Tobi Adeyemi/.test(document.body.innerText) && /₦6,000/.test(document.body.innerText), null, 60000));
    chk('the rules are on the same tab: the amount, the pay period, the exclusions', await until(P, () => /Amount per day/.test(document.body.innerText) && /Pay period/.test(document.body.innerText) && /Exclude when later than/.test(document.body.innerText)));
    await P.click('tr:has-text("Tobi Adeyemi")');
    chk('their wallet lists each day, the excluded one with its reason', await until(P, () => /Present, but no activity recorded/.test(document.body.innerText) && /Owed/.test(document.body.innerText)));
    await P.keyboard.press('Escape');
    await P.click('button:has-text("Pay this period")');
    await P.waitForSelector('[role="dialog"]');
    await P.click('[role="dialog"] button[type="submit"]');
    chk('a transfer is refused without its reference, on the form', await until(P, () => /Give the transfer reference/.test(document.querySelector('[role="dialog"]').innerText)));
    await P.fill('[role="dialog"] input[type="text"]', 'TRF-2026-0042');
    await P.click('[role="dialog"] button[type="submit"]');
    chk('paying says who was paid and how much', await until(P, () => /1 volunteer paid · ₦6,000/.test(document.body.innerText)));
    chk('…and the payout is recorded once, with its reference', php(`echo json_encode(db_all("SELECT amount, days, reference FROM volunteer_payouts"));`, ['bootstrap']) === '[{"amount":6000,"days":2,"reference":"TRF-2026-0042"}]');
    await P.context().close().catch(() => {});

    console.log('the volunteer’s own Me screen');
    await browser.close().catch(() => {});
    browser = await launch();
    const M = await open(MEM, false, '/dashboard/me', 420, 900);
    chk('the volunteer sees their pay: earned, paid, and the day not paid with why', await until(M, () => {
      const t = (document.querySelector('.m9x-vp') || {}).innerText || '';
      return /Volunteer pay/.test(t) && /₦6,000/.test(t) && /Not paid: present, but no activity recorded/.test(t) && /paid/.test(t);
    }, null, 60000));
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
