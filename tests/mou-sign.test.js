#!/usr/bin/env node
/* ============================================================================
   The Membership Agreement, end to end: real PHP server, real screens.

   A family on a phone opens the emailed link (/mou/<token>):
     · reads the clauses (an "In short" line each, the exact words on a tap),
     · answers the five questions — a wrong answer shows what the agreement
       says and lets them try again; Continue opens only when all are right,
     · confirms the details and makes the off-site choice,
     · signs with the typed name (nobody needs to drag), leaves the witness to
       NGG, and is told a copy is on its way.
   Then staff open Members → Agreements, see it waiting, and countersign
   (witnessing too). The family is emailed the completed copy, the consents
   are in the ledger, and the printable copy opens.

   Run:  node tests/mou-sign.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MOU_PORT || '8293';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mou-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const MAILS = path.join(TMP, 'mails.jsonl');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'mou');

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function mails() { try { return fs.readFileSync(MAILS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (_) { return []; } }
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
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
  if (!chromium) { console.log('⏭  mou: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => ''], 'test_sink' => ${JSON.stringify(MAILS)}],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'mou_test_secret_0123456789abcdefghij',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60], 'mou' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn()); $now = now_iso();
      db_insert('centres', ['centreId'=>'CEN-MOU-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>$now]);
      db_insert('members', ['memberId'=>'NGG-MOU-ADM','fullName'=>'Agnes Coordinator','email'=>'adm.mou@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>$now,'updatedAt'=>$now]);
      db_insert('members', ['memberId'=>'NGG-MOU-1','fullName'=>'Tobi Adeyemi','email'=>'family.mou@example.org','parentEmail'=>'family.mou@example.org','parentPhone'=>'08031112222','parentName'=>'Kemi Adeyemi',
        'type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','dob'=>gmdate('Y-m-d', strtotime('-13 years')),'school'=>'Egbeda High School','createdAt'=>$now,'updatedAt'=>$now]);
      mou_start(db_row("SELECT * FROM members WHERE memberId = 'NGG-MOU-1'"), 'NGG-MOU-ADM');`);
    const invite = mails().find(m => m.to === 'family.mou@example.org');
    const link = ((invite && invite.html) || '').match(/https?:\/\/[^"'\s]+\/mou\/[A-Za-z0-9_-]+/);
    chk('the family is emailed a private link to read and sign', !!link);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── The family, on a small phone ──
    const fam = await (await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
    const errs = []; fam.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await fam.goto(link[0], { waitUntil: 'domcontentloaded' });
    await waitForBoot(fam);
    chk('the page opens on the agreement, all thirteen clauses, each with its short line', await fam.waitForSelector('.mou-clause', { timeout: 60000 }).then(() => true, () => false)
      && (await fam.$$('.mou-clause')).length === 13 && (await fam.$$('.mou-short')).length === 13);
    chk('it names the child and the parties', /Tobi Adeyemi/i.test(await fam.innerText('.mou-head')) && /Okun Alimosho/.test(await fam.innerText('.mou-parties')));
    await fam.waitForFunction(() => { const b = document.getElementById('ngg-boot'); return !b || getComputedStyle(b).opacity === '0' || b.classList.contains('gone'); }, null, { timeout: 15000 }).catch(() => {});
    await fam.screenshot({ path: path.join(SHOTS, 'read.png') });
    await fam.click('.mou-clause:nth-child(9) .mou-link');
    chk('the exact words open on a tap (the talent clause: 30% / 10% / 60%)', /Member 30%, the instructor 10%, NGG 60%/.test(await fam.innerText('.mou-clause:nth-child(9) .mou-body')));
    await fam.click('button:has-text("check my understanding")');
    await fam.waitForSelector('.mou-q');
    chk('Continue stays shut until every question is right', await fam.isDisabled('.mou-actions .mou-btn:not(.mou-btn--ghost)'));
    // A wrong answer first, on the prize question.
    await fam.click('.mou-q:nth-of-type(3) .mou-opt:nth-child(1)');
    chk('a wrong answer says what the agreement says, and lets them try again', /Not quite/.test(await fam.innerText('.mou-q:nth-of-type(3)')) && /Try again/.test(await fam.innerText('.mou-q:nth-of-type(3)')));
    await fam.screenshot({ path: path.join(SHOTS, 'check-wrong.png') });
    const right = [1, 1, 1, 0, 2];
    for (let i = 0; i < 5; i++) await fam.click(`.mou-q:nth-of-type(${i + 1}) .mou-opt:nth-child(${right[i] + 1})`);
    chk('all five right: each says so, and Continue opens', (await fam.$$('.mou-q.is-right')).length === 5 && !(await fam.isDisabled('.mou-actions .mou-btn:not(.mou-btn--ghost)')));
    await fam.click('.mou-actions .mou-btn:not(.mou-btn--ghost)');
    await fam.waitForSelector('text=The family');
    chk('the details are filled in from the record', (await fam.inputValue('label:has-text("Email") input')) === 'family.mou@example.org' && (await fam.inputValue('label:has-text("School") input')) === 'Egbeda High School');
    await fam.fill('label:has-text("Mother’s name") input', 'Kemi Adeyemi');
    await fam.fill('label:has-text("Home address") input', '12 Oremeji Street, Egbeda');
    await fam.click('[role=radio]:has-text("No")');
    await fam.screenshot({ path: path.join(SHOTS, 'details.png'), fullPage: true });
    await fam.click('button:has-text("Continue to sign")');
    await fam.waitForSelector('text=You, the parent or guardian');
    await fam.fill('label:has-text("Your full name") input', 'Kemi Adeyemi');
    await fam.selectOption('label:has-text("You are the child") select', 'Mother');
    await fam.click('button:has-text("Sign with the typed name")');
    chk('the typed name becomes the signature — nobody has to drag', !!(await fam.$('.mou-sign-typed img[alt^="Signature: Kemi Adeyemi"]')));
    await fam.check('.mou-agree input');
    await fam.click('[role=radio]:has-text("NGG will witness")');
    await fam.screenshot({ path: path.join(SHOTS, 'sign.png'), fullPage: true });
    await fam.click('button:has-text("Sign the agreement")');
    chk('signed: the family is told, and that their copy is on its way', await fam.waitForSelector('text=Thank you — it’s signed', { timeout: 20000 }).then(() => true, () => false)
      && /family\.mou@example\.org/.test(await fam.innerText('.mou-done')));
    await fam.screenshot({ path: path.join(SHOTS, 'done.png') });
    const row = JSON.parse(php(`echo json_encode(db_row("SELECT status, clientName, clientRel, tripsChoice, witnessSignedAt FROM mou_agreements WHERE memberId = 'NGG-MOU-1'"));`));
    chk('the record: waiting on NGG, signed by the mother, trips declined, no witness yet', row.status === 'awaiting_ngg' && row.clientName === 'Kemi Adeyemi' && row.clientRel === 'Mother' && row.tripsChoice === 'declined' && row.witnessSignedAt === '');
    chk('the consents are in the ledger, by the agreement', php(`echo db_row("SELECT COUNT(*) n FROM consents WHERE studentId = 'NGG-MOU-1' AND method = 'mou'")['n'];`) === '7');
    chk('the family’s copy was emailed at once', mails().some(m => m.to === 'family.mou@example.org' && /Your copy/.test(m.subject)));
    chk('no page errors on the family’s page', errs.length === 0);

    // ── Staff countersign ──
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-MOU-ADM'"), true);`);
    const sctx = await browser.newContext({ viewport: { width: 1360, height: 960 } });
    await sctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const ad = await sctx.newPage(); const aerr = []; ad.on('pageerror', e => aerr.push(String(e).slice(0, 200)));
    await ad.goto(BASE + '/control/members/agreements', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ad);
    chk('Members → Agreements lists it to countersign, needing a witness', await ad.waitForFunction(() => /Tobi Adeyemi/.test(document.body.innerText) && /needs a witness/i.test(document.body.innerText), null, { timeout: 60000 }).then(() => true, () => false));
    await ad.screenshot({ path: path.join(SHOTS, 'control-list.png') });
    await ad.click('text=Tobi Adeyemi');
    await ad.click('[role=dialog] button:has-text("Countersign")');
    await ad.waitForSelector('text=Your role');
    await ad.fill('#crf-role', 'Centre coordinator, Egbeda');
    await ad.click('form[role=dialog] button:has-text("Sign with the typed name")');
    await ad.screenshot({ path: path.join(SHOTS, 'control-countersign.png') });
    await ad.click('form[role=dialog] button[type=submit]');
    const done = await ad.waitForFunction(() => /Signed by all parties/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true, () => false);
    const fin = JSON.parse(php(`echo json_encode(db_row("SELECT status, nggName, nggRole, witnessBy, witnessName FROM mou_agreements WHERE memberId = 'NGG-MOU-1'"));`));
    chk('countersigned: signed by all, NGG’s representative witnessed it', done && fin.status === 'signed' && fin.nggName === 'Agnes Coordinator' && fin.witnessBy === 'ngg' && fin.nggRole === 'Centre coordinator, Egbeda');
    const final = mails().find(m => m.to === 'family.mou@example.org' && /complete/.test(m.subject));
    chk('the family is emailed the completed copy', !!final);
    const doc = ((final && final.html) || '').match(/\/api\/public\/mou\.php\?doc=[A-Za-z0-9_-]+/);
    const page = await (await browser.newContext()).newPage();
    const resp = await page.goto(BASE + (doc ? doc[0] : '/nope'));
    chk('the printable copy opens from the email: every clause and three signatures', resp && resp.status() === 200 && (await page.$$('.rp-sign-img')).length === 3 && /Ending the Agreement early/.test(await page.innerText('body')));
    await page.screenshot({ path: path.join(SHOTS, 'document.png'), fullPage: true });
    chk('no page errors in the Control Room', aerr.length === 0);
    if (aerr.length) console.error(aerr.join('\n'));
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: threw — ' + (e && e.stack || e));
  } finally {
    try { await browser && browser.close(); } catch (_) {}
    cleanup();
  }
  console.log(`\nmou: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
