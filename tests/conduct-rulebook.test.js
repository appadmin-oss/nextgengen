#!/usr/bin/env node
/* ============================================================================
   Conduct & fines under the member rulebook (Management notice, Oct 2026), end
   to end: real PHP server, real session, the screens in cr-tab-conduct.jsx.

     · Compliance shows suspensions, reviews and frog jumps to do; a suspended
       member's record names the re-entry fee; frog jumps are ticked off;
     · the Policy view sets out the notice's figures, editable;
     · a fresh start previews exactly, then revokes everything before the day.

   Run:  node tests/conduct-rulebook.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RULEBOOK_PORT || '8293';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-rulebook-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'conduct-rulebook');

let _seq = 0;
function php(snippet, extra = ['bootstrap']) {
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

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

async function pageFor(memberId, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), true);`, ['session']);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
  await ctx.addCookies([
    { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
    { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
  ]);
  return ctx.newPage();
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  conduct rulebook: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'rulebook_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  const errs = [];
  try {
    const mk = (id, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'X ${id}','email'=>strtolower('${id}').'@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Ikotun','createdAt'=>now_iso(),'updatedAt'=>now_iso()], ${extra}));`;
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-RB-1','name'=>'Ikotun','code'=>'IK','status'=>'active','slug'=>'ikotun','createdAt'=>now_iso()]);`
      + mk('NGG-RB-ADM', "['role'=>'super_admin','fullName'=>'Rules Admin','centre'=>'']")
      + mk('NGG-RB-1', "['fullName'=>'Musa Lateef']") + mk('NGG-RB-2', "['fullName'=>'Grace Obi']")
      + `$t = attendance_today(); $d = fn($n) => gmdate('Y-m-d', strtotime($t . ' UTC') - $n * 86400);`
      + `member_programme_settings_save(['enabled'=>true,'startDate'=>$d(60),'endDate'=>$d(-30),'weekdays'=>[1,2,3,4,5,6,7],'holidays'=>[],'extraDays'=>[]], 'NGG-RB-ADM');`
      + `policy_settings_save(['enabled'=>true,'autoEnforce'=>true,'member'=>['enabled'=>true,'checkoutRequired'=>false]], 'NGG-RB-ADM');`
      // Musa came in at 09:38 one Saturday: ₦500 and 3 frog jumps.
      + `$at = strtotime($d(6) . ' 09:38:00 UTC') - (int)attendance_settings()['tzOffset'] * 60;`
      + `db_insert('attendance', ['cohortId'=>'','studentId'=>'NGG-RB-1','token'=>'','date'=>$d(6),'checkInAt'=>gmdate('Y-m-d\\TH:i:s\\Z', $at),'method'=>'gate','centre'=>'Ikotun','createdAt'=>now_iso()]);`
      + `policy_on_checkin('NGG-RB-1', 'member', $d(6), policy_punctuality('member', $at));`
      // Grace missed three days without permission: suspended a week ago, re-entry fee unpaid.
      + `foreach ([$d(20), $d(19), $d(18)] as $x) policy_log('NGG-RB-2', 'member', 'absence', $x, 'No check-in on a member programme day.'); policy_apply('NGG-RB-2', 'member');`);
    const fixture = JSON.parse(php(`echo json_encode(['jumps' => (int)db_row("SELECT COALESCE(SUM(amount),0) s FROM sanctions WHERE kind = 'corrective' AND status = 'pending'")['s'],
      'state' => policy_state('NGG-RB-2', 'member')]);`));
    if (fixture.jumps !== 3 + 21 || fixture.state.state !== 'suspended' || fixture.state.reentryOwed !== 5000) throw new Error('fixture: ' + JSON.stringify(fixture));

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const P = await pageFor('NGG-RB-ADM');
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (fn, arg, ms) => P.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const text = () => P.evaluate(() => document.body.innerText);
    const dlg = 'form[role="dialog"]';

    await P.goto(BASE + '/control/money/conduct/compliance', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('Compliance reads the rulebook: suspended, frog jumps to do, fines owed', await until(() => /Frog jumps to do/.test(document.body.innerText) && /Awaiting management review/.test(document.body.innerText), null, 60000));
    chk('…and lists who owes frog jumps and why', /Frog jumps to do \(24\)/.test(await text()) && /Arrived 09:38 .* — 3 frog jumps/.test(await text()) && /7 frog jumps/.test(await text()));
    await P.screenshot({ path: path.join(SHOTS, 'compliance.png'), fullPage: true });

    // Grace's record: suspended, the re-entry fee named.
    await P.click('tr:has-text("Grace Obi") >> nth=-1');
    chk('a suspended member\'s record names the re-entry fee', await until(() => /Re-entry fee/.test(document.body.innerText) && /₦5,000/.test(document.body.innerText)));
    await P.keyboard.press('Escape');

    // Tick off the frog jumps.
    const jumps = P.locator('section, div').filter({ has: P.locator('text=/^Frog jumps to do \\(/') }).last();
    await P.click('text=/^Frog jumps to do \\(/');
    const table = P.locator('table').filter({ hasText: 'Why' }).first();
    await table.locator('button[aria-label="Select all"]').click();
    await P.click('button:has-text("Mark done")');
    chk('“Mark done” ticks them all off, on the record', await until(() => !/Frog jumps to do \(/.test(document.body.innerText))
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM sanctions WHERE kind = 'corrective' AND status = 'done'")['c'];`) === '4');

    // The rulebook form: the notice's figures, editable.
    await P.click('[aria-label="Conduct view"] button:has-text("Policy")');
    chk('the Policy view sets out the rulebook with the notice\'s figures', await until(() => /NGG members — the rulebook/.test(document.body.innerText), null, 20000)
      && (await P.inputValue('input[aria-label="Late band 1 — from"], #crf-member\\.band1From').catch(() => '')) !== null);
    let t = await text();
    chk('…bands, review time, absence, suspension, re-entry, permission and evidence', /Late band 1 — from/.test(t) && /Management review from/.test(t) && /Re-entry fee after a suspension/.test(t)
      && /Absences with permission accepted in a session/.test(t) && /No assignment evidence by the due day/.test(t));
    await P.screenshot({ path: path.join(SHOTS, 'policy.png'), fullPage: true });

    // Fresh start, end to end.
    await P.click('[aria-label="Conduct view"] button:has-text("Compliance")');
    await until(() => /Everyone with something on record/.test(document.body.innerText));
    await P.click('button:has-text("Fresh start…")');
    await P.waitForSelector(dlg);
    await P.click(dlg + ' button[type="submit"]');
    chk('a fresh start previews who starts afresh and what is lifted, changing nothing', await until(() => /2 members start afresh/.test(document.body.innerText) && /imported fines stay owed/.test(document.body.innerText))
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM infractions WHERE (voidedAt IS NULL OR voidedAt = '')")['c'];`) === '4');
    await P.screenshot({ path: path.join(SHOTS, 'fresh-preview.png'), fullPage: true });
    await P.click('button:has-text("Revoke and start afresh…")');
    await P.waitForSelector(dlg);
    await P.fill(dlg + ' textarea#crf-reason', 'Revised Saturday policy — every child starts afresh');
    await P.click(dlg + ' button[type="submit"]');
    chk('applied: no offence before the day is standing, Grace may come back, and it says so', await until(() => /Fresh start from/.test(document.body.innerText), null, 20000)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM infractions WHERE (voidedAt IS NULL OR voidedAt = '')")['c'];`) === '0'
      && php(`echo json_encode(policy_gate_checkin('NGG-RB-2', 'member')['ok'] ?? false);`) === 'true');

    const M = await pageFor('NGG-RB-ADM', { width: 390, height: 844 });
    M.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await M.goto(BASE + '/control/money/conduct/policy', { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    await M.waitForFunction(() => /NGG members — the rulebook/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    const over = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk('on a phone the rulebook form fits its width (overflow ' + over + 'px)', over <= 1);

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (conduct rulebook)');
  process.exit(failed ? 1 : 0);
})();
