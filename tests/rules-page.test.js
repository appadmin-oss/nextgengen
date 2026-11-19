#!/usr/bin/env node
/* ============================================================================
   The Rules page, end to end: every rule in one place (the rulebook's own and
   the written ones), a written rule with a fine, frog jumps and a suspension
   on its third breach, the rulebook edited from the page, a breach recorded
   for two members from the roster, and the rules announced as a notice.
   Real PHP server, real sessions.

   Run:  node tests/rules-page.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RULES_PORT || '8297';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-rules-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'rules');

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
  if (!chromium) { console.log('⏭  notices: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'rules_test_secret_0123456789abcdef',
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
      + `db_insert('centres', ['centreId'=>'CEN-RU-1','name'=>'Ikotun','code'=>'IK','status'=>'active','slug'=>'ikotun','createdAt'=>now_iso()]);`
      + mk('NGG-RU-ADM', "['role'=>'super_admin','fullName'=>'Rules Admin','centre'=>'']")
      + mk('NGG-RU-1', "['fullName'=>'Ada Lateef']") + mk('NGG-RU-2', "['fullName'=>'Bayo Obi']") + mk('NGG-RU-3', "['fullName'=>'Chidi Eze']")
      + `policy_settings_save(['enabled'=>true,'autoEnforce'=>true,'member'=>['enabled'=>true,'rulebook'=>'session']], 'test');`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const P = await pageFor('NGG-RU-ADM');
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const text = pg => pg.evaluate(() => document.body.innerText);
    const dlg = 'form[role="dialog"]';

    // ── Every rule in one place ──
    await P.goto(BASE + '/control/money/conduct/rules', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('Conduct & fines opens on Rules: the rulebook\'s four and the written rules in one table',
      await until(P, () => /Every rule in one place/.test(document.body.innerText) && /Lateness/.test(document.body.innerText) && /Absence without permission/.test(document.body.innerText)
        && /Assignment evidence/.test(document.body.innerText) && /Recorded by staff|Fines of kind/.test(document.body.innerText), null, 90000));
    let t = await text(P);
    chk('…each says what triggers it, what it costs, and what repeating it leads to', /Automatic — the check-in time/.test(t) && /09:30: ₦500 fine and 3 frog jumps/.test(t)
      && /3 in a session → 7-day suspension, ₦5,000 to come back/.test(t));

    // ── A written rule that costs money, frog jumps and — the third time — a suspension ──
    await P.click('button:has-text("Add a rule")');
    await P.waitForSelector(dlg);
    await P.fill(dlg + ' #crf-name', 'No uniform');
    await P.fill(dlg + ' #crf-whenText', 'Arriving out of uniform');
    await P.fill(dlg + ' #crf-amount', '500');
    await P.fill(dlg + ' #crf-jumps', '5');
    await P.fill(dlg + ' #crf-escalateAfter', '3');
    await P.click(dlg + ' button[type="submit"]');
    chk('a repeat with no “leads to” is refused on the form, before anything is saved', await until(P, () => /Say both how many breaches and what they lead to/.test(document.body.innerText))
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM conduct_rules WHERE name = 'No uniform'")['c'];`) === '0');
    await P.selectOption(dlg + ' #crf-escalateTo', 'suspension');
    await P.fill(dlg + ' #crf-reentryFee', '2000');
    await P.click(dlg + ' button[type="submit"]');
    chk('the rule is added, and its row says what it costs and what the third breach brings', await until(P, () => /No uniform/.test(document.body.innerText)
      && /₦500 fine and 5 frog jumps/.test(document.body.innerText) && /3 in a session → 7-day suspension, ₦2,000 to come back/.test(document.body.innerText), null, 20000));
    chk('…and members and families are told it in a sentence', /No uniform \(Arriving out of uniform\): ₦500 fine and 5 frog jumps\. 3 in a session is a 7-day suspension, and ₦2,000 to come back\./.test(await text(P)));
    await P.screenshot({ path: path.join(SHOTS, 'rules.png'), fullPage: true });

    // ── The rulebook from the same page ──
    await P.click('tr:has-text("Lateness")');
    await P.waitForSelector(dlg);
    await P.fill(dlg + ' #crf-member\\.band1Fine', '600');
    await P.click(dlg + ' button[type="submit"]');
    chk('a rulebook rule opens and saves from the Rules page: band 1 is now ₦600', await until(P, () => /09:30: ₦600 fine and 3 frog jumps/.test(document.body.innerText), null, 20000)
      && php(`echo policy_for('member')['lateBands'][0]['fine'];`) === '600');

    // ── A breach recorded for two members, from the roster ──
    await P.click('.cr-note button:has-text("Record a breach")');
    chk('“Record a breach” takes the desk to the roster to choose who', await until(P, () => location.pathname.startsWith('/control/members') && /Broke a rule|Tick who broke the rule/.test(document.body.innerText), null, 60000)
      || await until(P, () => location.pathname.startsWith('/control/members'), null, 30000));
    await until(P, () => !!document.querySelector('button.cr-cb[aria-label*="Ada Lateef"]'), null, 60000);
    await P.click('button.cr-cb[aria-label*="Ada Lateef"]');
    await P.click('button.cr-cb[aria-label*="Bayo Obi"]');
    await P.click('.cr-selbar button:has-text("Broke a rule…")');
    await P.waitForSelector(dlg);
    const ruleId = php(`echo db_row("SELECT ruleId FROM conduct_rules WHERE name = 'No uniform'")['ruleId'];`);
    await P.selectOption(dlg + ' #crf-ruleId', ruleId);
    await P.fill(dlg + ' #crf-note', 'Came in house clothes');
    await P.click(dlg + ' button[type="submit"]');
    chk('…both are recorded in one go, and the toast says so', await until(P, () => /“No uniform”: recorded for 2 members/.test(document.body.innerText), null, 20000));
    chk('…each owes the ₦500 on their account and 5 frog jumps', php(`echo (int)db_row("SELECT COUNT(*) c FROM sanctions WHERE personId IN ('NGG-RU-1','NGG-RU-2') AND ((kind = 'fine' AND amount = 500) OR (kind = 'corrective' AND amount = 5))")['c'];`) === '4'
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM member_ledger WHERE memberId IN ('NGG-RU-1','NGG-RU-2') AND kind = 'fine' AND amount = 500")['c'];`) === '2');

    // ── The rules as a notice ──
    await P.goto(BASE + '/control/money/conduct/rules', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await until(P, () => /Every rule in one place/.test(document.body.innerText), null, 90000);
    await P.click('button:has-text("Announce the rules")');
    chk('“Announce the rules” opens a draft notice of them in the editor — nothing sent', await until(P, () => /\/comms\/broadcast\/NTC-[^/]+\/edit$/.test(location.pathname) && !!document.querySelector('#nte-body'), null, 60000)
      && /No uniform/.test(php(`echo db_row("SELECT body FROM notices WHERE subject = 'Our rules'")['body'];`))
      && php(`echo db_row("SELECT status FROM notices WHERE subject = 'Our rules'")['status'];`) === 'draft');

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (rules page)');
  process.exit(failed ? 1 : 0);
})();
