#!/usr/bin/env node
/* ============================================================================
   Notices before dues fall due, end to end: real PHP server, real session, the
   real screen (Control Room → Money → Dues & arrears → Reminders).

   A member's membership renews in five days. What must hold:

     · Reminders says families are told N days before, by which channels, and
       lists who will be told — this member, today, reaching one family app
       and two emails — with the payment notes waiting.
     · "Send today's … now" tells them: the guardian's family app holds the
       notice, the row turns to "Told", and "Sent to families" lists it.
     · Pressed again, nobody is told twice.
     · Amounts carries the settings: the switch, the days, every channel.

   Run:  node tests/dues-notices-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.DUESN_PORT || '8287';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-duesn-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'dues-notices');

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet;
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

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  dues notices UI: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'duesn_test_secret_0123456789abcdefg',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    // The renewal falls due in five days: inside a 7-day notice window, so the family is told today.
    php(`db_migrate(db_conn()); $now = now_iso();
      db_insert('centres', ['centreId'=>'CEN-DN-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>$now]);
      foreach ([['NGG-DN-ADM','Dues Admin','super_admin','', ''], ['NGG-DN-1','Ada Renew','member', gmdate('Y-m-d', strtotime('+5 days -1 year')), 'parent.dn1@example.org']] as [$id,$n,$role,$join,$pe])
        db_insert('members', ['memberId'=>$id,'fullName'=>$n,'email'=>strtolower($id).'@example.org','type'=>'NGG','status'=>'active','role'=>$role,'centre'=>'Egbeda',
          'joinDate'=>$join,'parentEmail'=>$pe,'createdAt'=>$now,'updatedAt'=>$now]);
      db_insert('guardians', ['guardianId'=>'GDN-DNUI0001','email'=>'mum.dn1@example.org','fullName'=>'Mum Renew','phone'=>'','status'=>'active','createdAt'=>$now]);
      db_insert('guardian_wards', ['linkId'=>'GW-DNUI0001','guardianId'=>'GDN-DNUI0001','memberId'=>'NGG-DN-1','relationship'=>'parent','status'=>'active','createdAt'=>$now]);
      setting_set('fees', ['enabled'=>true,'monthlyDues'=>0,'membershipFee'=>5000,'membershipEveryMonths'=>12,'trainingFee'=>0] + FEES_DEFAULTS, 'test');`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });

    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-DN-ADM'"), true);`);
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([
      { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
      { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
    ]);
    const ap = await ctx.newPage();
    const errs = [];
    ap.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (fn, arg, ms) => ap.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const body = () => ap.evaluate(() => document.body.innerText);

    await ap.goto(BASE + '/control/money/fees/reminders', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    chk('Reminders opens on the notices before dues fall due', await until(() => /Families are told 7 days before/.test(document.body.innerText) && /Coming up/.test(document.body.innerText), null, 60000));
    let t = await body();
    if (process.env.DUMP) console.error(t.slice(0, 3000));
    chk('it names the channels on, and says which are not available here (no Telegram bot, no SMS gateway in this test)',
      /by family app, email\./.test(t) && /Not available on this site: Telegram, SMS/.test(t));
    chk('the arrears reminders sit below it, said to be off', /Arrears reminders \(money already owed\) are switched off/.test(t));
    chk('the member renewing in five days is listed: the renewal, ₦5,000, told today, reaching one family app and two emails',
      /Ada Renew/.test(t) && /Membership renewal \(year 2\)/.test(t) && /₦5,000/.test(t) && /\bToday\b/i.test(t) && /1 app · 2 emails/.test(t));
    await ap.screenshot({ path: path.join(SHOTS, 'coming.png'), fullPage: true });

    await ap.click('button:has-text("Send today’s 1 now")');
    await ap.waitForSelector('[role="alertdialog"]');
    chk('the confirm says how many and that nobody is told twice', /1 family are due a notice today|1 family is due|1 family/.test(await ap.innerText('[role="alertdialog"]'))
      && /never told twice/.test(await ap.innerText('[role="alertdialog"]')));
    await ap.click('[role="alertdialog"] button:has-text("Send 1")');
    const toastSeen = await until(() => { const t = document.querySelector('.cr-toast'); return t && /\S/.test(t.textContent) && t.textContent; }, null, 20000);
    const toastText = await ap.evaluate(() => (document.querySelector('.cr-toast') || {}).textContent || '');
    chk('sent: the toast says one family was told', toastSeen && /\b1 told\b/.test(toastText));
    chk('the row says Told, and Sent to families lists it with the channel that reached them',
      await until(() => /Told [A-Z][a-z]{2} \d/.test(document.body.innerText) && /₦5,000 due .* for Ada/.test(document.body.innerText)
        && /Before it falls due/.test(document.body.innerText), null, 20000) && /family app/.test(await body()));
    chk('the guardian’s family app holds the notice; with no mail server the emails are honestly counted as not sent',
      php(`$n = db_row("SELECT title FROM guardian_notices WHERE guardianId = 'GDN-DNUI0001' AND kind = 'dues-upcoming'"); $r = db_row("SELECT channelsJson FROM dues_notices WHERE memberId = 'NGG-DN-1' AND kind = 'upcoming'");
        echo ($n && str_contains($n['title'], 'Ada') && (json_decode($r['channelsJson'], true)['app'] ?? 0) === 1 && (json_decode($r['channelsJson'], true)['email'] ?? 9) === 0) ? 'yes' : 'no';`) === 'yes');
    await ap.screenshot({ path: path.join(SHOTS, 'sent.png'), fullPage: true });
    chk('nobody is left to tell today, so the press is gone', !(await ap.$('button:has-text("Send today’s")')));
    chk('pressing the run again would tell nobody twice', php(`echo json_encode(admin_fees_notices_run(['requesterId' => 'NGG-DN-ADM']));`).includes('"upcoming":0'));

    await ap.click('[role="radio"]:has-text("Amounts"), button:has-text("Amounts") >> nth=0');
    chk('Amounts carries the notice settings: the switch, the days, every channel, the desk nudge',
      await until(() => /Before dues fall due/.test(document.body.innerText), null, 20000)
      && !!(await ap.$('[role="switch"][aria-label="Tell families before dues fall due"][aria-checked="true"]'))
      && !!(await ap.$('input[aria-label="How many days before"]'))
      && !!(await ap.$('[role="switch"][aria-label="By SMS"][aria-checked="false"]'))
      && !!(await ap.$('[role="switch"][aria-label="In the family app"]')) && !!(await ap.$('[role="switch"][aria-label="By Telegram"]'))
      && !!(await ap.$('input[aria-label="Nudge the Fees desk when a payment note waits (hours)"]')));
    // Paying online: the family bears Paystack's charge; the percentage is typed as a percentage, kept in basis points.
    chk('Amounts carries the Paystack charge: on by default, at Paystack’s local terms',
      !!(await ap.$('[role="switch"][aria-label="Families pay Paystack’s charge"][aria-checked="true"]'))
      && (await ap.inputValue('input[aria-label="Paystack’s percentage (%)"]')) === '1.5'
      && (await ap.inputValue('input[aria-label="Paystack’s charge is capped at (₦)"]')) === '2000');
    await ap.fill('input[aria-label="Paystack’s percentage (%)"]', '1.75');
    await ap.click('button.cr-unsaved-save');
    chk('a new percentage saves, and is stored as basis points',
      await until(() => /1 change saved/.test(document.body.innerText), null, 15000)
      && php(`echo fees_settings()['payFeeBps'];`) === '175');
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (dues notices UI)');
  process.exit(failed ? 1 : 0);
})();
