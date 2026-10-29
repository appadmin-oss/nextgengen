#!/usr/bin/env node
/* ============================================================================
   Settings → Integrations → Make.com, end to end in a browser.

   Make is set up on screen, never in config.php: NGG makes the signing key
   and shows it once, connects Make's webhook to exactly the events the
   scenarios use, makes the scheduler key and hands over the addresses, and
   turns it all off again. (domain/make.php, docs/make.md)

   Run:  node tests/make-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MU_PORT || '8296';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mu-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-MU-ADM';

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
  if (!chromium) { console.log('⏭  make ui: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'make_ui_secret_0123456789abcdefghij',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                          { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const errs = [];
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));

    const card = () => pg.locator('button.cr-card:has-text("Make.com")').first();   // the setup card comes before Destinations, where the connected webhook also appears
    const drawerText = () => pg.innerText('.cr-sheet, .cr-pfull');
    const press = l => pg.click(`.cr-sheet button:has-text("${l}"), .cr-pfull button:has-text("${l}")`);

    await pg.goto(BASE + '/control/settings/integrations', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('button.cr-card:has-text("Make.com")', { timeout: 60000 });
    chk('Integrations has a Make.com card, off until it is set up', /Off/.test(await card().innerText()) && /\/api\/hooks\/make\.php/.test(await card().innerText()));

    await card().click();
    await pg.waitForSelector('.cr-sheet, .cr-pfull');
    chk('the drawer says the door is closed and offers to make the key', /Closed/.test(await drawerText()) && /Make signing key/.test(await drawerText()));
    await press('Make signing key');
    await pg.waitForFunction(() => /Copy Make’s signing key now/.test(document.body.innerText), null, { timeout: 20000 });
    const shown = (await pg.innerText('body')).match(/mk_[0-9a-f]{48}/);
    chk('NGG makes the key and shows it once, with where it goes', !!shown && /X-NGG-Signature/.test(await pg.innerText('body')));
    chk('…stored sealed, never as the key itself', !!shown && !php(`echo (string)(db_row("SELECT settingValue FROM settings WHERE settingKey = 'make_link'")['settingValue'] ?? '');`, ['bootstrap']).includes(shown[0]));
    await press('Done');
    await pg.waitForFunction(() => /Half set up/.test(document.querySelector('button.cr-card')?.closest('.cr-cards')?.innerText || document.body.innerText), null, { timeout: 20000 });
    chk('afterwards the card shows only how the key ends', /Half set up/.test(await card().innerText()) && (await card().innerText()).includes('…' + shown[0].slice(-4)) && !(await pg.innerText('body')).includes(shown[0]));

    await card().click();
    await press('Connect Make’s webhook');
    await pg.waitForSelector('form #crf-url');
    await pg.fill('form #crf-url', 'https://evil.example/x');
    await pg.click('form button[type=submit]');
    chk('only a Make webhook address is accepted', await pg.waitForFunction(() => /Paste a Make custom webhook address/.test(document.body.innerText), null, { timeout: 8000 }).then(() => true, () => false));
    await pg.fill('form #crf-url', 'https://hook.eu1.make.com/abc123XYZ');
    await pg.click('form button[type=submit]');
    await pg.waitForFunction(() => /Connected/.test([...document.querySelectorAll('button.cr-card')].find(b => /Make\.com/.test(b.innerText))?.innerText || ''), null, { timeout: 20000 });
    const dest = JSON.parse(php(`echo json_encode(db_row("SELECT events, status, kind FROM integrations WHERE name = 'Make.com'"));`, ['bootstrap']));
    chk('connecting creates one signed destination with exactly Make’s events', dest.kind === 'webhook' && dest.status === 'active' && JSON.parse(dest.events).includes('private.attendance.absences') && !JSON.parse(dest.events).includes('*'));

    await card().click();
    await press('Make scheduler key');
    await pg.waitForFunction(() => /Copy the scheduler addresses now/.test(document.body.innerText), null, { timeout: 20000 });
    const urls = (await pg.innerText('body')).match(/\/api\/public\/cron\.php\?key=ck_[0-9a-f]{48}&job=\w+/g) || [];
    chk('the scheduler key comes as the four addresses to paste into Make', urls.length === 4);
    const cron = await pg.evaluate(u => fetch(u).then(r => r.text().then(t => ({ s: r.status, t }))), BASE + urls[3]);
    chk('…and the address works: the background job runs', cron.s === 200 && /accrue\s+ran/.test(cron.t));
    await press('Done');

    await card().click();
    await press('Turn off');
    await pg.click('[role=alertdialog] button:has-text("Turn it off"), .cr-confirm-acts button:has-text("Turn it off")');
    await pg.waitForFunction(() => /\bOff\b/.test([...document.querySelectorAll('button.cr-card')].find(b => /Make\.com/.test(b.innerText))?.innerText || ''), null, { timeout: 20000 });
    chk('Turn off closes the door and pauses the events', php(`echo db_row("SELECT status FROM integrations WHERE name = 'Make.com'")['status'];`, ['bootstrap']) === 'paused');
    if (process.env.MU_SHOT) { await card().click(); await pg.screenshot({ path: process.env.MU_SHOT }); }
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (Make.com set up on screen)');
  process.exit(failed ? 1 : 0);
})();
