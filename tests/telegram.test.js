#!/usr/bin/env node
/* ============================================================================
   Free messages on Telegram, through the real routes: the webhook refuses
   anything without the secret this site gave Telegram, links a number when a
   person shares their OWN contact, and the public /telegram page invites
   people with the bot's link and a QR code.

   Run:  node tests/telegram.test.js
   ========================================================================== */
'use strict';
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.TG_PORT || '8376';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-tg-'));
const DB = path.join(TMP, 'ngg.db');
let _seq = 0;
function php(snippet) {
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() { for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} } return null; }
let passed = 0, failed = 0;
const chk = (m, c, extra) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m + (extra ? ' — ' + extra : '')); } };
let server, browser;
function cleanup() { try { if (server) process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(CFG); } catch (_) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} }
const hook = (secret, body) => fetch(BASE + '/api/hooks/telegram.php', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}), body: JSON.stringify(body) });

(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'tg_e2e_secret_bot_xx_0123456789abcdefgh',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
    'telegram' => ['bot_token' => '123456789:AAHfake_token_for_e2e_tests_0123456789', 'bot_username' => 'NGGTestBot'],
  ];\n`);
  try {
    php(`db_conn(); echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const secret = php(`echo telegram_webhook_secret();`);
    const contact = (uid) => ({ update_id: 9, message: { message_id: 3, chat: { id: 4242, type: 'private' }, from: { id: 4242 }, contact: { phone_number: '+234 803 555 0101', user_id: uid, first_name: 'Ngozi' } } });
    chk('the webhook refuses an update with no secret', (await hook('', contact(4242))).status === 401);
    chk('…and one with the wrong secret', (await hook('x'.repeat(48), contact(4242))).status === 401);
    chk('…and a GET', (await fetch(BASE + '/api/hooks/telegram.php')).status === 405);
    let r = await hook(secret, contact(777));
    chk('a forwarded contact is answered 200 but links nothing', r.status === 200 && php(`echo (int)db_row("SELECT COUNT(*) AS n FROM telegram_links")['n'];`) === '0');
    r = await hook(secret, contact(4242));
    const row = JSON.parse(php(`echo json_encode(db_row("SELECT phone, chatId FROM telegram_links LIMIT 1"));`) || 'null');
    chk('sharing your own number through the real route links it, as E.164', r.status === 200 && row && row.phone === '+2348035550101' && row.chatId === '4242', JSON.stringify(row));
    const pub = await (await fetch(BASE + '/api/public/telegram.php')).json();
    chk('the public endpoint gives the bot link, and nothing secret', pub.enabled === true && pub.url === 'https://t.me/NGGTestBot?start=ngg' && !/AAH|token/i.test(JSON.stringify(pub)));

    const chromium = loadChromium();
    if (!chromium) { console.log('⏭  browser half skipped (playwright not installed)'); }
    else {
      const d = fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
      browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/' + d + '/chrome-linux/chrome' });
      const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
      await p.goto(BASE + '/telegram', { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      await p.waitForSelector('.tgc-go', { timeout: 30000 });
      chk('/telegram invites people: a button to the bot', (await p.getAttribute('.tgc-go', 'href')) === 'https://t.me/NGGTestBot?start=ngg' && /@NGGTestBot/.test(await p.innerText('.tgc')));
      await p.waitForSelector('.tgc-qr', { timeout: 15000 });
      chk('…and a QR code of the same link', /^data:image\//.test(await p.getAttribute('.tgc-qr', 'src')));
      chk('the page has its own title', /Telegram/.test(await p.title()));
      const sw = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      chk('no sideways scroll on a phone', sw);
      chk('no page errors', !errs.length, errs.join(' | '));
    }
  } catch (e) { failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e)); }
  finally { try { browser && await browser.close(); } catch (_) {} cleanup(); }
  console.log((failed ? '❌' : '✅') + ' telegram: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
