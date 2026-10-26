#!/usr/bin/env node
/* ============================================================================
   Support cases, end to end (domain/support.php, support-desk.jsx,
   cr-tab-support.jsx). The public /support page is help answers and the way
   in — never a case form. A member opens a case inside My NGG; staff answer it
   in the Control Room; the member sees the reply, writes back, marks it
   solved and rates it. Phone width has no sideways scroll.

   Run:  node tests/support.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SUP_PORT || '8331';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-sup-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=1 -d error_reporting=-1 ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed (' + e.status + '): ' + String(e.stdout || '') + String(e.stderr || '')); }
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
async function as(memberId, admin, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && /Warning: Cannot update|Maximum update depth|is not a function|undefined/.test(m.text())) pg.errs.push('console: ' + m.text().slice(0, 300)); });
  return pg;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  support: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'sup_e2e_secret_portal_x_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    /* The bundled curricula seed themselves on first boot. This suite
       counts what IT writes, so it declines them (docs/SETUP.md). */
    'seed_bundled_curriculum' => false,
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`
      $now = now_iso();
      db_insert('members', ['memberId' => 'NGG-SP-K1', 'fullName' => 'Tolu Adebayo', 'email' => 'tolu@example.org', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]);
      db_insert('members', ['memberId' => 'NGG-SP-ADM', 'fullName' => 'Adaeze Okafor', 'email' => 'adaeze@example.org', 'type' => 'NGG', 'status' => 'active', 'role' => 'super_admin', 'centre' => 'Egbeda', 'totpSecret' => 'JBSWY3DPEHPK3PXP', 'createdAt' => $now, 'updatedAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));

    // ── The public help centre: answers and the way in, no case form ──
    const pub = await as('NGG-SP-K1', false);
    await pub.context().clearCookies();
    await pub.goto(BASE + '/support', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pub);
    await pub.waitForSelector('.hc .sup-ans', { timeout: 60000 });
    chk('/support is the help centre: answers by topic', /How can we help/.test(await pub.innerText('.hc')) && (await pub.$$('.hc .sup-ans')).length >= 5);
    chk('/support opens no case: no case form on the public page', (await pub.$$('.hc textarea, .hc .sup-new')).length === 0);
    await pub.fill('#hc-q', 'sign in password');
    await pub.waitForFunction(() => /answer/.test((document.querySelector('.hc-status') || {}).innerText || ''), null, { timeout: 10000 });
    chk('/support search finds the sign-in answer', /I can’t sign in/.test(await pub.innerText('.hc')));
    const ways = await pub.innerText('.hc-ways');
    chk('/support says where members and families open a case, and the contact form for everyone else', /My NGG/.test(ways) && /Family account/.test(ways) && /contact form/.test(ways));

    // ── A member opens a case in My NGG ──
    const mb = await as('NGG-SP-K1', false);
    await mb.goto(BASE + '/dashboard/support', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mb);
    await mb.waitForSelector('.sup .sup-head', { timeout: 60000 });
    chk('My NGG → Support: the desk, with no cases yet', /haven’t opened a case/.test(await mb.innerText('.sup')));
    await mb.click('.sup button:has-text("Open a case")');
    await mb.click('.sup-cat:has-text("Fees, fines and payments")');
    chk('choosing a category shows what to include for it', /payment reference or receipt number/.test(await mb.innerText('.sup-include')));
    await mb.click('.sup-pill:has-text("A payment isn’t showing")');
    await mb.click('.sup-pri:has-text("P2")');
    await mb.fill('.sup-new input.sup-input', 'My transfer isn’t showing');
    await mb.waitForFunction(() => /might answer it/.test((document.querySelector('.sup-side') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    chk('the help answers that fit sit beside the form', /Paying, and a payment that isn’t showing/.test(await mb.innerText('.sup-side')));
    await mb.fill('.sup-new textarea', 'I paid 5,000 on Monday by transfer and the account still shows it owed.');
    await mb.click('.sup-new button[type="submit"]');
    await mb.waitForSelector('.sup-case', { timeout: 15000 });
    const no = q(`(int)db_row("SELECT MAX(caseNo) n FROM support_cases")['n']`);
    chk('the case opens with its number and “Received”', no >= 100001 && new RegExp('Case ' + no).test(await mb.innerText('.sup-case')) && /Received/i.test(await mb.innerText('.sup-case .sup-chip')));
    const row = q(`db_row("SELECT * FROM support_cases WHERE caseNo = ${no}")`);
    chk('it is the member’s, with the priority and sub-category they chose', row.requesterKind === 'member' && row.requesterId === 'NGG-SP-K1' && row.priority === 'P2' && row.subcategory === 'A payment isn’t showing' && row.source === 'portal');
    chk('the open case is in the address, for a refresh or an email link', new URL(mb.url()).search === '?case=' + no);

    // ── Staff answer it in the Control Room ──
    const ad = await as('NGG-SP-ADM', true, { width: 1440, height: 900 });
    await ad.goto(BASE + '/control/support/cases', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ad);
    await ad.waitForSelector('.cr-app', { timeout: 30000 });
    await ad.waitForFunction(n => document.body.innerText.includes(String(n)), no, { timeout: 30000 });
    chk('Control Room → Support → Cases lists it, with the reply due', /My transfer isn’t showing/.test(await ad.innerText('main')) && /Reply in/.test(await ad.innerText('main')));
    await ad.click('text=My transfer isn’t showing');
    await ad.waitForSelector('text=Conversation', { timeout: 10000 });
    chk('the drawer shows the thread and what this category asks for', /I paid 5,000 on Monday/.test(await ad.innerText('body')) && /payment reference/.test(await ad.innerText('body')));
    chk('…and what we already know about the member, so staff need not ask', /What we already know/.test(await ad.innerText('.cr-sheet, body')) && /To pay now/.test(await ad.innerText('body')));
    await ad.click('.cr-sheet button:has-text("Reply"), [role="dialog"] button:has-text("Reply")');
    await ad.waitForSelector('textarea', { timeout: 8000 });
    await ad.fill('textarea', 'Please send the reference on the bank alert.');
    await ad.click('button:has-text("Send reply")');
    await ad.waitForFunction(() => /Reply sent/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    const after = q(`db_row("SELECT status, firstResponseAt, assigneeId FROM support_cases WHERE caseNo = ${no}")`);
    chk('the reply waits for the member, is the first response, and the replier owns the case', after.status === 'pending' && after.firstResponseAt !== '' && after.assigneeId === 'NGG-SP-ADM');

    // ── The member sees it, writes back, solves and rates ──
    await mb.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(mb);
    await mb.waitForSelector('.sup-case', { timeout: 60000 });
    const c1 = await mb.innerText('.sup-case');
    chk('the member sees the reply and that the team is waiting for them', /send the reference on the bank alert/.test(c1) && /waiting for your reply/i.test(c1));
    await mb.fill('.sup-reply textarea', 'The reference is 0012345.');
    await mb.click('.sup-reply button[type="submit"]');
    await mb.waitForFunction(() => /back with the team/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    chk('their reply puts the case back with the team', q(`db_row("SELECT status FROM support_cases WHERE caseNo = ${no}")['status']`) === 'open');
    await mb.click('.sup-reply button:has-text("It’s solved")');
    await mb.waitForSelector('.sup-rate', { timeout: 10000 });
    await mb.click('.sup-star[aria-label="5 stars"]');
    await mb.click('.sup-rate button:has-text("Send")');
    await mb.waitForFunction(() => /rated this 5/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    const fin = q(`db_row("SELECT status, rating FROM support_cases WHERE caseNo = ${no}")`);
    chk('marked solved and rated, once', fin.status === 'solved' && +fin.rating === 5);

    // ── Phone ──
    const ph = await as('NGG-SP-K1', false, { width: 390, height: 844 });
    await ph.goto(BASE + '/dashboard/support', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ph);
    await ph.waitForSelector('.sup .sup-row', { timeout: 60000 });
    chk('on a phone the desk lists the case with no sideways scroll', await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await ph.click('.sup button:has-text("Open a case")');
    chk('…and the new-case form fits too', await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

    const errs = [].concat(pub.errs, mb.errs, ad.errs, ph.errs);
    chk('no uncaught page errors', errs.length === 0 || (console.error(errs.join('\n')), false));
  } catch (e) { failed++; console.error('  ✗ FAIL: crashed: ' + (e && e.stack || e)); }
  finally { try { if (browser) await browser.close(); } catch (_) {} cleanup(); }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (support)');
  process.exit(failed ? 1 : 0);
})();
