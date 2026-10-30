#!/usr/bin/env node
/* ============================================================================
   Official notices, end to end: the Management notice pasted as it was written
   for WhatsApp, checked as a draft, published to a centre, read and
   acknowledged by a member and by a parent from their family account, and
   counted at the desk. Real PHP server, real sessions.

   Run:  node tests/notices.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.NOTICES_PORT || '8295';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-notices-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'notices');

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
    'cookie_secret' => 'notices_test_secret_0123456789abcdef',
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
      + `db_insert('centres', ['centreId'=>'CEN-NT-1','name'=>'Ikotun','code'=>'IK','status'=>'active','slug'=>'ikotun','createdAt'=>now_iso()]);`
      + mk('NGG-NT-ADM', "['role'=>'super_admin','fullName'=>'Notices Admin','centre'=>'']")
      + mk('NGG-NT-1', "['fullName'=>'Musa Lateef']") + mk('NGG-NT-2', "['fullName'=>'Grace Obi']")
      + `db_insert('guardians', ['guardianId'=>'GRD-NT-1','email'=>'mrs.obi@example.org','fullName'=>'Mrs Obi','status'=>'active','sessionEpoch'=>1,'createdAt'=>now_iso()]);`
      + `db_insert('guardian_wards', ['linkId'=>'LNK-NT-1','guardianId'=>'GRD-NT-1','memberId'=>'NGG-NT-2','relationship'=>'parent','status'=>'active','createdAt'=>now_iso()]);`);
    const notice = fs.readFileSync(path.join(ROOT, 'api', 'tests', 'sts-notice.txt'), 'utf8');

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const P = await pageFor('NGG-NT-ADM');
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const text = pg => pg.evaluate(() => document.body.innerText);
    const dlg = 'form[role="dialog"]';

    // ── The desk: paste the whole notice ──
    await P.goto(BASE + '/control/comms/broadcast', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('Announcements opens on notices, with “New notice”', await until(P, () => /New notice/.test(document.body.innerText) && /Notices published/.test(document.body.innerText), null, 60000));
    await P.click('button:has-text("New notice")');
    await P.waitForSelector(dlg);
    await P.fill(dlg + ' textarea#crf-text', notice);
    await P.selectOption(dlg + ' select#crf-audience', 'Ikotun');
    await P.click(dlg + ' button[type="submit"]');
    chk('the whole notice is taken as a draft, split into its parts, and opened for checking', await until(P, () => /Preview — exactly what they will read/.test(document.body.innerText), null, 30000)
      && /\/control\/comms\/broadcast\/NTC-/.test(new URL(P.url()).pathname));
    let t = await text(P);
    chk('…the preview shows the letterhead, the kind, the subject and the sign-off', /STREET TO STARDOM \(STS\)/.test(t) && /MANAGEMENT OFFICIAL NOTICE/.test(t)
      && /Subject: REVISED SATURDAY RESUMPTION/.test(t) && /STS MANAGEMENT/.test(t));
    const pv = P.locator('.nt-doc').first();
    chk('…formatted: numbered sections are headings, the dash lines are a list, *bold* is bold — no asterisks left',
      (await pv.locator('h3').count()) >= 7 && (await pv.locator('li').count()) >= 15 && (await pv.locator('strong').count()) >= 2 && !/\*[A-Z]/.test(await pv.innerText()));
    await P.screenshot({ path: path.join(SHOTS, 'draft.png'), fullPage: true });
    chk('a draft reaches nobody yet', php(`echo (int)db_row("SELECT COUNT(*) c FROM notifications WHERE kind = 'notice'")['c'];`) === '0');

    // ── Publish ──
    await P.click('.cr-note button:has-text("Publish…")');
    await P.waitForSelector('[role="alertdialog"]');
    chk('the confirm says how many it is about to reach', /2 members and their families/.test(await P.locator('[role="alertdialog"]').innerText()));
    await P.click('[role="alertdialog"] .cr-confirm-acts button:has-text("Publish")');
    chk('published: both members have it in their feed, and the family account once', await until(P, () => /Published · 2 members · 1 family account/.test(document.body.innerText), null, 20000)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM notifications WHERE kind = 'notice' AND linkPage = 'notice'")['c'];`) === '2'
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM guardian_notices WHERE kind = 'notice' AND sign = 1")['c'];`) === '1');
    const id = php(`echo db_row("SELECT noticeId FROM notices LIMIT 1")['noticeId'];`);

    // ── A member reads it and acknowledges ──
    const M = await pageFor('NGG-NT-1');
    M.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await M.goto(BASE + '/notice/' + id, { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    chk('a member opens /notice/<id> and reads the formatted notice', await until(M, () => /LATENESS AND DISCIPLINARY MEASURES/.test(document.body.innerText) && /I have read and understood this notice/.test(document.body.innerText), null, 60000));
    await M.screenshot({ path: path.join(SHOTS, 'member.png'), fullPage: true });
    await M.click('button:has-text("I have read and understood this notice")');
    chk('…acknowledges it in one press, and is told so with the date', await until(M, () => /Acknowledged on/.test(document.body.innerText))
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM notice_reads WHERE readerKey = 'm:NGG-NT-1' AND ackAt <> ''")['c'];`) === '1');
    await M.goto(BASE + '/notice', { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    chk('the member’s notices list shows it, acknowledged', await until(M, () => !!document.querySelector('.nt-list') && /REVISED SATURDAY RESUMPTION/.test(document.body.innerText) && /Acknowledged/.test(document.body.innerText), null, 60000));

    // ── A parent reads it from the family account ──
    const famToken = php(`echo session_issue_family(db_row("SELECT * FROM guardians WHERE guardianId = 'GRD-NT-1'"), true);`, ['session']);
    const fctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await fctx.addCookies([{ name: 'ngg_sess_family', value: famToken, domain: '127.0.0.1', path: '/', httpOnly: true },
                           { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const F = await fctx.newPage();
    F.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await F.goto(BASE + '/notice/' + id, { waitUntil: 'domcontentloaded' });
    await waitForBoot(F);
    chk('a parent with only a family account reads it too, for their child', await until(F, () => /REQUESTING PERMISSION/.test(document.body.innerText) && /for Grace Obi/.test(document.body.innerText), null, 60000));
    await F.click('button:has-text("I have read and understood this notice")');
    chk('…and acknowledges it for their child; the family inbox shows it signed', await until(F, () => /Acknowledged on/.test(document.body.innerText))
      && php(`echo (string)db_row("SELECT signedAt FROM guardian_notices WHERE kind = 'notice'")['signedAt'] !== '' ? 'y' : 'n';`) === 'y');
    const over = await F.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk('on a phone the notice fits its width (overflow ' + over + 'px)', over <= 1);
    await F.screenshot({ path: path.join(SHOTS, 'family-phone.png'), fullPage: true });

    // ── Back at the desk: who has read it ──
    await P.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await until(P, () => /Notices published/.test(document.body.innerText), null, 60000);
    await P.click('tr:has-text("REVISED SATURDAY RESUMPTION")');
    chk('the desk sees both read and acknowledged — one by the member, one by a parent', await until(P, () => /Who has read it/.test(document.body.innerText) && /By a parent/.test(document.body.innerText), null, 20000));
    t = await text(P);
    chk('…and nobody is left to remind', !/Remind the/.test(t) && /Not yet acknowledged\s*0/.test(t));

    // A signed-out visitor is asked to sign in, not shown the notice.
    const V = await (await browser.newContext()).newPage();
    await V.goto(BASE + '/notice/' + id, { waitUntil: 'domcontentloaded' });
    await waitForBoot(V);
    chk('somebody signed out is asked to sign in — the notice is not public', await until(V, () => /Sign in to read this notice/.test(document.body.innerText), null, 60000) && !/LATENESS/.test(await text(V)));

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (notices)');
  process.exit(failed ? 1 : 0);
})();
