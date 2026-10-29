#!/usr/bin/env node
/* ============================================================================
   One email, several member accounts — "Who's signing in?" (auth.php
   auth_pick, api-client.js authPickDialog), through the real sign-in screen:

   - two brothers on their mother's address: the code is emailed once, and
     after it is typed the screen asks who is signing in, then opens that one;
   - Escape cancels the choice and says what to do; nothing is signed in;
   - one password set for both offers the same choice; a password that is
     one child's own opens that child straight away;
   - the dialog is a labelled modal, keyboard-only, with focus inside it.

   Run:  node tests/shared-email.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SHARED_PORT || '8327';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-shared-'));
const DB = path.join(TMP, 'ngg.db');
const CSRF = 'e2e-csrf-token-0123456789';

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=1 -d error_reporting=-1 ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed (' + e.status + '): ' + String(e.stdout || '') + String(e.stderr || '')); }
}
const q = expr => JSON.parse(php(`echo json_encode(${expr});`));
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
let server, browser, passed = 0, failed = 0;
const chk = (m, c, x) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m + (x ? ' — ' + x : '')); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
async function fresh(viewport, force) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: 'ngg_csrf', value: CSRF, domain: '127.0.0.1', path: '/' }]);
  if (force) await ctx.addInitScript(() => { try { localStorage.setItem('ngg.mfa.force', '1'); } catch (_) {} });
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && /Warning: Cannot update|Maximum update depth|is not a function|is not defined/.test(m.text())) pg.errs.push('console: ' + m.text().slice(0, 300)); });
  return pg;
}
async function as(memberId, admin, force) {
  const pg = await fresh(null, force);
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`);
  await pg.context().addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
  return pg;
}
/* Sign-in rotates the CSRF cookie (csrf_issue), so echo whatever the jar holds now. */
const post = async (pg, p, body) => {
  const c = (await pg.context().cookies(BASE)).find(x => x.name === 'ngg_csrf');
  return pg.request.post(BASE + '/api' + p, { data: body, headers: { 'X-NGG-CSRF': c ? c.value : CSRF } });
};
const otpForEmail = em => q(`(string)(db_row("SELECT otp FROM auth_sessions WHERE email = '${em}' AND purpose = 'login' ORDER BY id DESC LIMIT 1")['otp'] ?? '')`);
async function typeCode(pg, sel, code) { await pg.click(sel); await pg.keyboard.type(code, { delay: 20 }); }

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  shared-email: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'shared_e2e_secret_portal_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  const EM = 'mama.family@shared.example';
  try {
    php(`
      $now = now_iso();
      foreach ([['NGG-SE-1', 'Tobi Adeyemi', '026-701'], ['NGG-SE-2', 'Femi Adeyemi', '026-702']] as [$id, $n, $d])
        db_insert('members', ['memberId' => $id, 'fullName' => $n, 'email' => '${EM}', 'displayId' => $d, 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]);
      // No second sign-in step for this suite: it is about who, not how.
      setting_set('mfa_policy', ['member' => 'off']);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    /* Who the browser is signed in as, once the sign-in has landed (the pick's request is in flight when the dialog closes). */
    const meAfter = async (pg, want) => { let id = ''; for (let i = 0; i < 40; i++) { id = await meId(pg); if (id === want) break; await pg.waitForTimeout(250); } return id; };
    const meId = async pg => { const r = await pg.request.get(BASE + '/api/auth/me.php'); const j = await r.json().catch(() => ({})); return ((j.member || j.data || {}).memberId) || j.memberId || ''; };

    // ── 1. A code: emailed once, then "Who's signing in?" ──
    const pg = await fresh({ width: 390, height: 844 });
    await pg.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('#signin-idp', { timeout: 60000 });
    await pg.fill('#signin-idp', EM);
    await pg.click('.signin-card button[type="submit"]');
    await pg.waitForSelector('#signin-pw', { timeout: 20000 });
    await pg.click('.signin-alts button');
    await pg.waitForSelector('#signin-otp', { timeout: 20000 });
    chk('one code is issued for the address, not for either child', q(`(int)db_row("SELECT COUNT(*) c FROM auth_sessions WHERE email = '${EM}' AND purpose = 'login'")['c']`) === 1
      && q(`(string)db_row("SELECT memberId FROM auth_sessions WHERE email = '${EM}' ORDER BY id DESC LIMIT 1")['memberId']`).startsWith('@shared:'));
    await typeCode(pg, '#signin-otp', otpForEmail(EM));
    await pg.waitForSelector('.ngg-pick[role="dialog"]', { timeout: 20000 });
    const dlg = await pg.innerText('.ngg-pick');
    chk('after the code, the screen asks who is signing in, with each account’s name and card number',
      /Who’s signing in\?/.test(dlg) && /Tobi Adeyemi/.test(dlg) && /Femi Adeyemi/.test(dlg) && /026-702/.test(dlg));
    chk('…a labelled modal with focus on the first choice', await pg.evaluate(() => { const d = document.querySelector('.ngg-pick'); return d.getAttribute('aria-modal') === 'true' && !!document.getElementById(d.getAttribute('aria-labelledby')) && document.activeElement === d.querySelector('.ngg-pick-who'); }));
    chk('…and no one is signed in yet', !(await meId(pg)));
    // Keyboard only: Tab to the second account, Enter.
    await pg.keyboard.press('Tab'); await pg.keyboard.press('Enter');
    await pg.waitForSelector('.ngg-pick', { state: 'detached', timeout: 20000 });
    await pg.waitForFunction(() => !/\/login/.test(location.pathname), null, { timeout: 30000 }).catch(() => {});
    const femi = await meAfter(pg, 'NGG-SE-2');
    chk('choosing Femi signs Femi in — not the first account on the address', femi === 'NGG-SE-2', 'signed in as ' + (femi || 'nobody') + ' · ' + (await pg.innerText('body')).slice(0, 200).replace(/\n/g, ' | '));
    chk('no page errors (code)', pg.errs.length === 0);
    if (pg.errs.length) console.error(pg.errs.join('\n'));

    // ── 2. Escape cancels: nothing opens, and the screen says why ──
    const p2 = await fresh();
    await p2.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p2);
    await p2.waitForSelector('#signin-idp', { timeout: 60000 });
    await p2.fill('#signin-idp', EM);
    await p2.click('.signin-card button[type="submit"]');
    await p2.waitForSelector('#signin-pw', { timeout: 20000 });
    await p2.click('.signin-alts button');
    await p2.waitForSelector('#signin-otp', { timeout: 20000 });
    await typeCode(p2, '#signin-otp', otpForEmail(EM));
    await p2.waitForSelector('.ngg-pick', { timeout: 20000 });
    await p2.keyboard.press('Escape');
    await p2.waitForSelector('.ngg-pick', { state: 'detached', timeout: 10000 });
    await p2.waitForFunction(() => /Choose who is signing in/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    chk('Escape closes the choice, signs nobody in, and says what to do', !(await meId(p2)) && /Choose who is signing in/.test(await p2.innerText('body')));

    // ── 3. Passwords: one each opens straight; one for both asks ──
    php(`db_exec("UPDATE members SET passwordHash = ? WHERE memberId = 'NGG-SE-1'", [password_hash_best('tobi-own-pass')]);
         db_exec("UPDATE members SET passwordHash = ? WHERE memberId = 'NGG-SE-2'", [password_hash_best('femi-own-pass')]);`);
    const p3 = await fresh();
    await p3.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p3);
    await p3.waitForSelector('#signin-idp', { timeout: 60000 });
    await p3.fill('#signin-idp', EM);
    await p3.click('.signin-card button[type="submit"]');
    await p3.waitForSelector('#signin-pw', { timeout: 20000 });
    await p3.fill('#signin-pw', 'tobi-own-pass');
    await p3.click('.signin-card button[type="submit"]');
    await p3.waitForFunction(() => !/\/login/.test(location.pathname) || document.querySelector('.ngg-pick'), null, { timeout: 30000 }).catch(() => {});
    const tobi = await meAfter(p3, 'NGG-SE-1');
    chk('a password that is one child’s own opens that child, with no question', !(await p3.$('.ngg-pick')) && tobi === 'NGG-SE-1', 'signed in as ' + (tobi || 'nobody') + ' · ' + (await p3.innerText('body')).slice(0, 300).replace(/\n/g, ' | '));
    php(`db_exec("UPDATE members SET passwordHash = ? WHERE memberId IN ('NGG-SE-1','NGG-SE-2')", [password_hash_best('family-pass-1')]);`);
    const p4 = await fresh();
    await p4.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p4);
    await p4.waitForSelector('#signin-idp', { timeout: 60000 });
    await p4.fill('#signin-idp', EM);
    await p4.click('.signin-card button[type="submit"]');
    await p4.waitForSelector('#signin-pw', { timeout: 20000 });
    await p4.fill('#signin-pw', 'family-pass-1');
    await p4.click('.signin-card button[type="submit"]');
    await p4.waitForSelector('.ngg-pick', { timeout: 20000 });
    await p4.click('.ngg-pick-who:has-text("Tobi")');
    await p4.waitForSelector('.ngg-pick', { state: 'detached', timeout: 20000 });
    await p4.waitForFunction(() => !/\/login/.test(location.pathname), null, { timeout: 30000 }).catch(() => {});
    chk('one password for both: the same choice, and Tobi is opened', (await meAfter(p4, 'NGG-SE-1')) === 'NGG-SE-1');
    chk('no page errors (password)', p3.errs.length === 0 && p4.errs.length === 0);
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (shared email)` : `✅ PASS: ${passed} passed, 0 failed (shared email)`));
  process.exit(failed ? 1 : 0);
})();
