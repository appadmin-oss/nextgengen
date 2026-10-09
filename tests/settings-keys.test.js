#!/usr/bin/env node
/* ============================================================================
   Settings: the split tabs and Settings → API keys, end to end.

   A key is added through the form, shows as connected (never its value),
   is stored sealed, and is removed again. (domain/service-keys.php)

   Run:  node tests/settings-keys.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SK_PORT || '8298';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-sk-'));
const DB = path.join(TMP, 'ngg.db');
const OLD = path.join(TMP, 'old-site', 'api', 'storage', 'photos');
const ADMIN = 'NGG-SK-ADM';

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
  if (!chromium) { console.log('⏭  settings keys: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'settings_keys_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'cloudinary' => ['cloud_name' => 'from-file', 'api_key' => '12345', 'api_secret' => 'filesecretABCD'],
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

    await pg.goto(BASE + '/control/settings/settings', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForFunction(() => /Sign-ups/.test(document.body.innerText), null, { timeout: 60000 });
    const gen = await pg.innerText('body');
    chk('General is short: sign-ups and messages, without attendance times or card branding', /Sign-ups/.test(gen) && !/Attendance and punctuality/.test(gen) && !/Programme name/.test(gen));
    await pg.goto(BASE + '/control/settings/attendance-rules', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForFunction(() => /Closing time/.test(document.body.innerText), null, { timeout: 60000 });
    chk('Attendance has its own tab', /Attendance and punctuality/.test(await pg.innerText('body')));
    await pg.goto(BASE + '/control/settings/card-branding', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForFunction(() => /Programme name/.test(document.body.innerText), null, { timeout: 60000 });
    chk('Card branding has its own tab', true);

    await pg.goto(BASE + '/control/settings/keys', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('.cr-key', { timeout: 60000 });
    const groq = pg.locator('article.cr-key[aria-label="Groq"]');
    const cloud = pg.locator('article.cr-key[aria-label="Cloudinary"]');
    chk('API keys lists every service, grouped, with where to get a key', (await pg.$$('.cr-key')).length >= 10 && /Payments/.test(await pg.innerText('body')) && (await groq.locator('a.cr-key-link').getAttribute('href')).startsWith('https://'));
    chk('a service set in config.php says so, and shows its secret only by how it ends', /Connected · config\.php/.test(await cloud.innerText()) && /•••• ABCD/.test(await cloud.innerText()) && !/filesecret/.test(await pg.innerText('body')));
    chk('a service with no key says Not set and offers Add key', /Not set/.test(await groq.innerText()) && (await groq.locator('button:has-text("Add key")').count()) === 1);
    await groq.locator('button:has-text("Add key")').click();
    await pg.waitForSelector('form[aria-label="Connect Groq"]');
    await pg.fill('form[aria-label="Connect Groq"] input[type=password]', 'gsk_TESTkeyFROMtheSCREEN000000000000wxyz');
    await pg.click('form[aria-label="Connect Groq"] button[type=submit]');
    await pg.waitForFunction(() => /Connected/.test(document.querySelector('article.cr-key[aria-label="Groq"]')?.innerText || ''), null, { timeout: 30000 });
    const g2 = await groq.innerText();
    if (process.env.SK_SHOT) await pg.screenshot({ path: process.env.SK_SHOT, fullPage: true });
    chk('the key saves: Groq reads Connected, ending wxyz, and the key itself is nowhere on the page', /•••• wxyz/.test(g2) && !/FROMtheSCREEN/.test(await pg.innerText('body')));
    chk('…stored sealed on the server', !php(`echo (string)(db_row("SELECT settingValue FROM settings WHERE settingKey = 'service_keys'")['settingValue'] ?? '');`, ['bootstrap']).includes('FROMtheSCREEN'));
    pg.once('dialog', dlg => dlg.accept());
    await groq.locator('button:has-text("Remove")').click();
    const conf = await pg.waitForSelector('.cr-layer button:has-text("Remove"), [role=alertdialog] button:has-text("Remove"), [role=dialog] button:has-text("Remove")', { timeout: 10000 }).catch(() => null);
    if (conf) await conf.click();
    await pg.waitForFunction(() => /Not set/.test(document.querySelector('article.cr-key[aria-label="Groq"]')?.innerText || ''), null, { timeout: 30000 });
    chk('Remove takes it away again', true);
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (settings keys)');
  process.exit(failed ? 1 : 0);
})();
