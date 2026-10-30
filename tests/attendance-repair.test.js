#!/usr/bin/env node
/* ============================================================================
   Conduct & fines › Compliance, when check-ins did not arrive — end to end:
   real PHP server, real session, the screen in cr-tab-conduct.jsx.

   The failure it exists for: CACENTRE's check-ins named members in a way NGG
   did not read, so the nightly check marked a whole centre absent, day after
   day — warnings, the Dormant Track and absence fines followed. This holds:

     · a day the check HELD is on screen, and "nobody is absent" closes it;
     · a check-in that named nobody can be matched to its person, and their
       absence that day is undone;
     · the repair previews before it runs, says what it leaves alone, needs a
       reason, and afterwards nobody is Dormant and the absence fines are
       lifted — while the imported fine and dues are byte-for-byte unchanged.

   Run:  node tests/attendance-repair.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.REPAIR_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-repair-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'attendance-repair');

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
  if (!chromium) { console.log('⏭  attendance repair: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'repair_test_secret_0123456789abcdef',
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
    let seed = `db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-AR-1','name'=>'Ikotun','code'=>'IK','status'=>'active','slug'=>'ikotun','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CEN-AR-2','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);`
      + mk('NGG-AR-ADM', "['role'=>'super_admin','fullName'=>'Repair Admin','centre'=>'']");
    const names = ['Musa Lateef', 'Grace Obi', 'Tunde Bello', 'Ada Eze'];
    names.forEach((n, i) => { seed += mk('NGG-AR-' + (i + 1), `['fullName'=>'${n}']`); });
    seed += `$t = attendance_today(); $d = fn($n) => gmdate('Y-m-d', strtotime($t . ' UTC') - $n * 86400);`
      + `member_programme_settings_save(['enabled'=>true,'startDate'=>$d(60),'endDate'=>$d(-30),'weekdays'=>[1,2,3,4,5,6,7],'holidays'=>[],'extraDays'=>[]], 'NGG-AR-ADM');`
      + `policy_settings_save(['enabled'=>true,'autoEnforce'=>true,'outageBrake'=>true,'member'=>['enabled'=>true,'absenceLimit'=>2,'absenceFine'=>1000,'checkoutRequired'=>false]], 'NGG-AR-ADM');`
      // The weeks CACENTRE's check-ins were not read: every Ikotun member marked absent on two days.
      + `foreach (['NGG-AR-1','NGG-AR-2','NGG-AR-3','NGG-AR-4'] as $id) { foreach ([$d(10), $d(9)] as $day) policy_log($id, 'member', 'absence', $day, 'No check-in on a member programme day.'); policy_apply($id, 'member'); }`
      // Money brought over from the old records: must not move.
      + `fees_post('NGG-AR-1', 'fine', 3000, ['periodKey'=>'bulkfine:old-2026','note'=>'Imported fine','by'=>'import']);`
      + `fees_post('NGG-AR-1', 'dues', 2000, ['periodKey'=>'import:2026-08','note'=>'Imported dues','by'=>'import']);`
      // A day the new brake held, and a check-in that named nobody.
      + `db_insert('attendance_held_days', ['date'=>$d(2),'centre'=>'Ikotun','personType'=>'member','expected'=>4,'present'=>0,'why'=>'No check-ins arrived from Ikotun (0 of 4 expected).','status'=>'held','createdAt'=>now_iso()]);`
      + `db_insert('attendance_unmatched', ['refKey'=>'CAC-777','ref'=>'CAC-777','name'=>'Ada Eze','date'=>$d(3),'centre'=>'Ikotun','source'=>'cacentre','action'=>'in','status'=>'open','createdAt'=>now_iso()]);`
      + `policy_log('NGG-AR-4', 'member', 'absence', $d(3), 'No check-in on a member programme day.');`;
    php(seed);
    const before = JSON.parse(php(`echo json_encode(['dormant' => (int)db_row("SELECT COUNT(*) c FROM sanctions WHERE kind = 'dormant' AND status = 'active' AND personId LIKE 'NGG-AR-%'")['c'],
      'imported' => db_all("SELECT entryId, amount, voidedAt FROM member_ledger WHERE memberId = 'NGG-AR-1' AND (periodKey LIKE 'bulkfine:%' OR periodKey LIKE 'import:%') ORDER BY entryId")]);`));
    if (before.dormant !== 4) throw new Error('fixture: expected four members on the Dormant Track, got ' + before.dormant);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });

    const P = await pageFor('NGG-AR-ADM');
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (fn, arg, ms) => P.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const text = () => P.evaluate(() => document.body.innerText);
    const dlg = 'form[role="dialog"]';
    const confirmYes = async cta => { const b = `[role="alertdialog"] .cr-confirm-acts button:has-text("${cta}")`; await P.waitForSelector(b); await P.click(b); };

    await P.goto(BASE + '/control/money/conduct/compliance', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('Compliance shows the held day — nobody marked absent', await until(() => /1 day held — nobody was marked absent/.test(document.body.innerText) && /Held days/.test(document.body.innerText), null, 60000));
    chk('…and the check-in that named nobody', /Check-ins that named nobody \(1\)/.test(await text()) && /Ada Eze/.test(await text()));
    await P.screenshot({ path: path.join(SHOTS, 'compliance.png'), fullPage: true });

    // ── A held day: the centre did not meet ──
    await P.click('.cr-list-row:has-text("Ikotun"):has-text("checked in")');
    chk('a held day opens with why it was held and the two answers', await until(() => /Why it was held/.test(document.body.innerText) && /It met — count the absences/.test(document.body.innerText)));
    await P.click('button:has-text("Nobody is absent — it didn’t meet")');
    await confirmYes('Nobody is absent');
    chk('“nobody is absent” closes the day and logs nothing', await until(() => !/day held — nobody/.test(document.body.innerText))
      && php(`echo db_row("SELECT status FROM attendance_held_days WHERE centre = 'Ikotun'")['status'];`) === 'closed');

    // ── An unmatched check-in: matched to Ada ──
    await P.click('.cr-list-row:has-text("Ada Eze")');
    await until(() => /Why it is here/.test(document.body.innerText));
    await P.click('button:has-text("Match to a person…")');
    await P.waitForSelector(dlg);
    await P.fill(dlg + ' input#crf-personId', 'NGG-AR-4');
    await P.click(dlg + ' button[type="submit"]');
    chk('matching it records the check-in and undoes that day’s absence', await until(() => /Recorded for Ada Eze · their absence that day is undone/.test(document.body.innerText))
      && php(`echo db_row("SELECT method FROM attendance WHERE studentId = 'NGG-AR-4'")['method'] ?? '';`) === 'matched');

    // ── The repair ──
    await P.click('button:has-text("Repair absences")');
    await P.waitForSelector(dlg);
    chk('the repair form says what it leaves alone before anything runs', /Imported fines and dues are not touched/.test(await P.locator(dlg).innerText()));
    await P.click(dlg + ' button[type="submit"]');
    chk('the preview counts the absences and people', await until(() => /8 absences the check logged, across 4 people/.test(document.body.innerText)));
    let t = await text();
    chk('…the Dormant Track and the absence fines it would lift', /4 people are warned, Dormant or proposed for eviction now/.test(t) && /8 absence fines \(₦8,000\) lifted with them/.test(t));
    chk('…that the imported fine and dues stay exactly as they are', /2 imported fines and dues on their accounts stay exactly as they are/.test(t));
    chk('…and each centre-day, read as a failed feed', /Centre-days in the period/.test(t) && (await P.locator('tr:has-text("Feed failed")').count()) === 2);
    await P.screenshot({ path: path.join(SHOTS, 'preview.png'), fullPage: true });
    chk('nothing changed on a preview', php(`echo db_row("SELECT COUNT(*) c FROM sanctions WHERE kind = 'dormant' AND status = 'active' AND personId LIKE 'NGG-AR-%'")['c'];`) === '4');
    await P.click('button:has-text("Undo these absences…")');
    await P.waitForSelector(dlg);
    await P.click(dlg + ' button[type="submit"]');
    chk('a reason is required', await until(() => /Enter why|Say why/.test(document.querySelector('form[role="dialog"]')?.innerText || '')));
    await P.fill(dlg + ' textarea#crf-reason', 'CACENTRE check-ins were not recognised');
    await P.click(dlg + ' button[type="submit"]');
    chk('the run reports what it undid', await until(() => /8 absences undone for 4 people/.test(document.body.innerText)));
    const after = JSON.parse(php(`echo json_encode(['dormant' => (int)db_row("SELECT COUNT(*) c FROM sanctions WHERE kind = 'dormant' AND status = 'active' AND personId LIKE 'NGG-AR-%'")['c'],
      'fines' => (int)db_row("SELECT COUNT(*) c FROM sanctions WHERE kind = 'fine' AND tier >= 500000 AND status IN ('pending','active') AND personId LIKE 'NGG-AR-%'")['c'],
      'imported' => db_all("SELECT entryId, amount, voidedAt FROM member_ledger WHERE memberId = 'NGG-AR-1' AND (periodKey LIKE 'bulkfine:%' OR periodKey LIKE 'import:%') ORDER BY entryId"),
      'reason' => db_row("SELECT voidReason FROM infractions WHERE personId = 'NGG-AR-2' AND kind = 'absence' ORDER BY id LIMIT 1")['voidReason'],
      'audit' => (int)db_row("SELECT COUNT(*) c FROM audit_log WHERE event = 'policy.absence_repair'")['c']]);`));
    chk('nobody is on the Dormant Track any more', after.dormant === 0);
    chk('the absence fines are lifted', after.fines === 0);
    chk('the imported fine and dues are exactly as they were', JSON.stringify(after.imported) === JSON.stringify(before.imported) && after.imported.length === 2);
    chk('each voided entry carries the reason', after.reason === 'Repair: CACENTRE check-ins were not recognised');
    chk('one audit event for the run', after.audit === 1);
    await P.screenshot({ path: path.join(SHOTS, 'done.png'), fullPage: true });

    // ── The brake is a setting the operator can see ──
    await P.click('[aria-label="Conduct view"] button:has-text("Policy")');
    chk('the Policy form shows the brake, on', await until(() => /Hold a day when check-ins did not arrive/.test(document.body.innerText)));

    // ── Phone ──
    const M = await pageFor('NGG-AR-ADM', { width: 390, height: 844 });
    M.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await M.goto(BASE + '/control/money/conduct/compliance', { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    await M.waitForFunction(() => /Everyone with something on record/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    const over = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk('on a phone the screen fits its width (overflow ' + over + 'px)', over <= 1);

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (attendance repair)');
  process.exit(failed ? 1 : 0);
})();
