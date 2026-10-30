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

    const panel = () => pg.locator('.cr-mk-panel').first();
    const step = n => pg.locator('.cr-mk-step').nth(n - 1);
    const pill = async () => (await panel().locator('.cr-mk-head .cr-pill').innerText()).trim();
    const shot = async name => { if (process.env.MU_SHOT) await pg.screenshot({ path: process.env.MU_SHOT.replace(/\.png$/, '-' + name + '.png'), fullPage: true }); };

    await pg.goto(BASE + '/control/settings/integrations', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('.cr-mk-panel', { timeout: 60000 });
    chk('Integrations opens on a Make.com panel: not set up, three numbered steps, the first one the obvious next press',
      /Not set up/i.test(await pill()) && (await pg.$$('.cr-mk-step')).length === 3
      && (await step(1).locator('button.is-primary').innerText()).trim() === 'Make key' && (await step(2).locator('button.is-primary').count()) === 0);
    chk('the scenario guide is on the screen, each saying what it still needs', (await pg.$$('.cr-mk-sc')).length === 7 && /Needs step 1 and 2/.test(await pg.innerText('.cr-mk')));
    await shot('empty');

    await step(1).locator('button:has-text("Make key")').click();
    await pg.waitForSelector('.cr-mk-reveal');
    const key = (await pg.innerText('.cr-mk-reveal')).match(/mk_[0-9a-f]{48}/);
    chk('NGG makes the key and shows it inline, with the door, focused for a keyboard user',
      !!key && /\/api\/hooks\/make\.php/.test(await pg.innerText('.cr-mk-reveal')) && await pg.evaluate(() => document.activeElement && document.activeElement.classList.contains('cr-mk-reveal')));
    chk('…stored sealed, never as the key itself', !!key && !php(`echo (string)(db_row("SELECT settingValue FROM settings WHERE settingKey = 'make_link'")['settingValue'] ?? '');`, ['bootstrap']).includes(key[0]));
    chk('step 1 is ticked and step 2 becomes the next press', /done/.test(await step(1).innerText()) && (await step(2).locator('button.is-primary').innerText()).trim() === 'Connect' && /Step 2 of 3/.test(await pill()));
    await shot('reveal');
    await pg.click('.cr-mk-reveal button:has-text("I’ve copied it")');
    await pg.waitForFunction(() => !document.querySelector('.cr-mk-reveal'), null, { timeout: 20000 });
    await pg.waitForSelector('.cr-mk-panel', { timeout: 20000 });
    chk('once copied, the key is gone and only how it ends is shown', (await step(1).innerText()).includes('…' + key[0].slice(-4)) && !(await pg.innerText('body')).includes(key[0]));

    await step(2).locator('button:has-text("Connect")').click();
    await pg.waitForSelector('form #crf-url');
    chk('the form says where in Make to find the address', /Custom webhook/.test(await pg.innerText('form')));
    await pg.fill('form #crf-url', 'https://evil.example/x');
    await pg.click('form button[type=submit]');
    chk('only a Make webhook address is accepted', await pg.waitForFunction(() => /Paste a Make custom webhook address/.test(document.body.innerText), null, { timeout: 8000 }).then(() => true, () => false));
    await pg.fill('form #crf-url', 'https://hook.eu1.make.com/abc123XYZ');
    await pg.click('form button[type=submit]');
    await pg.waitForFunction(() => /hook\.eu1\.make\.com\/abc123XYZ/.test(document.querySelectorAll('.cr-mk-step')[1]?.innerText || ''), null, { timeout: 20000 });
    const dest = JSON.parse(php(`echo json_encode(db_row("SELECT events, status, kind FROM integrations WHERE name = 'Make.com'"));`, ['bootstrap']));
    chk('connecting creates one signed destination with exactly Make’s events', dest.kind === 'webhook' && dest.status === 'active' && JSON.parse(dest.events).includes('private.attendance.absences') && !JSON.parse(dest.events).includes('*'));
    chk('…shown once, in the panel — not again in the Destinations list', (await pg.locator('button.cr-card:has-text("Make.com")').count()) === 0 && /Make\.com is set up above/.test(await pg.innerText('body')));
    await step(2).locator('button:has-text("Send test")').click();
    chk('Send test says plainly whether Make took it, and what to check if not',
      await pg.waitForFunction(() => /Make did not take it|Make received the test/.test(document.querySelectorAll('.cr-mk-step')[1]?.innerText || ''), null, { timeout: 30000 }).then(() => true, () => false));

    await step(3).locator('button:has-text("Make addresses")').click();
    await pg.waitForSelector('.cr-mk-reveal');
    const urls = (await pg.innerText('.cr-mk-reveal')).match(/\/api\/public\/cron\.php\?key=ck_[0-9a-f]{48}&job=\w+/g) || [];
    chk('the scheduler comes as four labelled addresses, each with its own copy button', urls.length === 4 && (await pg.$$('.cr-mk-reveal .cr-mk-copy button')).length === 4 && /Every 15 minutes — Reminders/.test(await pg.innerText('.cr-mk-reveal')));
    const cron = await pg.evaluate(u => fetch(u).then(r => r.text().then(t => ({ s: r.status, t }))), BASE + urls[3]);
    chk('…and the address works: the background job runs', cron.s === 200 && /accrue\s+ran/.test(cron.t));
    await pg.click('.cr-mk-reveal button:has-text("I’ve copied it")');
    await pg.waitForFunction(() => !document.querySelector('.cr-mk-reveal'), null, { timeout: 20000 });
    await pg.waitForSelector('.cr-mk-panel', { timeout: 20000 });
    chk('all three steps done, and every scenario reads ready to build', (await pg.$$('.cr-mk-step.is-done')).length === 3 && !/Needs step/.test(await pg.innerText('.cr-mk')));

    await pg.click('.cr-mk-sc:has-text("Why were they away?") > summary');
    chk('a scenario opens to its build steps and a body to copy', /quick replies/.test(await pg.innerText('.cr-mk-sc[open]')) && (await pg.$$('.cr-mk-sc[open] .cr-mk-copy button')).length === 1);
    await shot('done');

    await panel().locator('button:has-text("Turn off")').click();
    await pg.click('[role=alertdialog] button:has-text("Turn it off"), .cr-confirm-acts button:has-text("Turn it off")');
    await pg.waitForFunction(() => /Turned off/.test(document.querySelector('.cr-mk-head')?.innerText || ''), null, { timeout: 20000 });
    chk('Turn off closes the door and pauses the events', php(`echo db_row("SELECT status FROM integrations WHERE name = 'Make.com'")['status'];`, ['bootstrap']) === 'paused');

    await pg.setViewportSize({ width: 390, height: 844 });
    await pg.waitForTimeout(400);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const small = await pg.$$eval('.cr-mk button, .cr-mk summary', els => els.filter(e => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 30).length);
    chk('on a phone it fits the width, and nothing to press is too small', over <= 1 && small === 0);
    await shot('phone');
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
