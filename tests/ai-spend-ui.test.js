#!/usr/bin/env node
/* ============================================================================
   AI spending (Settings → API keys), end to end.

   Nobody chooses an AI provider: everyday work runs on free models, hard
   thinking on paid ones first, within a monthly limit (api/_lib/ai.php
   ai_route). This pins what the operator sees and sets: the month's spend,
   each feature's kind of work and tier, and the limit form — saved through
   the route, read back from the database, and reflected on the screen.

   Run:  node tests/ai-spend-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.AS_PORT || '8296';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-as-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-AS-ADM';
const CSRF = 'as-csrf-0123456789abcdef';

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
  if (!chromium) { console.log('⏭  ai spend: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'ai_spend_secret_0123456789abcdef01',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'debug' => false,
    'ai' => ['groq_api_key' => 'gsk_test', 'anthropic_api_key' => 'sk-ant-test', 'anthropic_model' => 'claude-opus-5-5'],
  ];\n`);
  try {
    php(`db_migrate(db_conn());
      db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','totpSecret'=>'JBSWY3DPEHPK3PXP','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      $m = gmdate('Y-m');
      db_insert('ai_usage', ['at'=>now_iso(),'month'=>$m,'profile'=>'insight_answer','job'=>'brain','provider'=>'anthropic','model'=>'claude-opus-5-5','tier'=>'paid','inTokens'=>100000,'outTokens'=>20000,'costMicros'=>800000,'estimated'=>0,'ok'=>1,'error'=>'']);
      db_insert('ai_usage', ['at'=>now_iso(),'month'=>$m,'profile'=>'moderation','job'=>'everyday','provider'=>'groq','model'=>'llama-3.1-8b-instant','tier'=>'free','inTokens'=>4000,'outTokens'=>900,'costMicros'=>0,'estimated'=>0,'ok'=>1,'error'=>'']);`, ['bootstrap']);
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
    const box = async () => (await P.innerText('.cr-sy-spend')).replace(/\s+/g, ' ');

    console.log('Settings → API keys, with no limit set');
    await P.goto(BASE + '/control/settings/keys', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.cr-sy-spend', { timeout: 60000 });
    let b = await box();
    chk('the month’s spend is shown, and paid models are off without a limit', /\$0\.80/.test(b) && /Paid models off/.test(b) && /Set a monthly limit/.test(b));
    chk('spend is broken down by model, free calls counted at no cost', /claude-opus-5-5/.test(b) && /llama-3\.1-8b-instant/.test(b) && /Free/.test(b) && /100,000 \/ 20,000/.test(b));
    const feat = (await P.innerText('main')).replace(/\s+/g, ' ');
    chk('each feature says its kind of work', /Hard thinking · paid first/.test(feat) && /Everyday · free models/.test(feat));
    chk('with paid models off, hard thinking runs on the free model', !/On · paid/.test(feat));

    console.log('setting a limit');
    await P.click('.cr-sy-spend button:has-text("Set a monthly limit")');
    await P.waitForSelector('[role="dialog"]');
    await P.fill('[role="dialog"] input >> nth=0', 'ten');
    await P.click('[role="dialog"] button[type="submit"]');
    chk('a limit that is not a number is refused on the form', await until(P, () => /Enter a number of dollars/.test(document.querySelector('[role="dialog"]').innerText)));
    await P.fill('[role="dialog"] input >> nth=0', '5');
    await P.click('[role="dialog"] button[type="submit"]');
    chk('saving says what paid models may now spend', await until(P, () => /Paid models may spend up to \$5\.00 a month/.test(document.body.innerText)));
    chk('the limit is stored', JSON.parse(php(`echo json_encode(setting_get('ai_routing'));`, ['bootstrap'])).monthlyLimitUsd === 5);
    await until(P, () => /of \$5\.00/.test((document.querySelector('.cr-sy-spend') || {}).innerText || ''), null, 20000);
    b = await box();
    chk('the block shows the limit, what is left and the progress', /of \$5\.00/.test(b) && /\$4\.20 left/.test(b) && !!(await P.$('.cr-sy-spend [role="progressbar"][aria-valuenow="16"]')));
    const feat2 = (await P.innerText('main')).replace(/\s+/g, ' ');
    chk('…and hard thinking now goes to the paid model first', /On · paid/.test(feat2));
    chk('the change is audited once', Number(php(`echo (int)db_row("SELECT COUNT(*) c FROM audit_log WHERE event = 'ai.routing.set'")['c'];`, ['bootstrap'])) === 1);
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
