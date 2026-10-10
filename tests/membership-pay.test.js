#!/usr/bin/env node
/* ============================================================================
   Joining NGG, end to end against the real PHP backend: the divisions, the
   join form, acceptance with a start date, the joining invoice, the family's
   payment page, an offline payment recorded with evidence and verified by a
   SECOND member of staff, the receipt, a scanned member card, and the centre
   directory split by programme.

   Run:  node tests/membership-pay.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MP_PORT || '8303';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mp-'));
const DB = path.join(TMP, 'ngg.db');
const A1 = 'NGG-MPE-A1', A2 = 'NGG-MPE-A2';

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
  try { php; } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  membership payments: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'membership_pay_secret_0123456789abc',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  const evidenceBefore = new Set(fs.existsSync(path.join(ROOT, 'api/storage/payment-evidence')) ? fs.readdirSync(path.join(ROOT, 'api/storage/payment-evidence')) : []);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-MP-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','programmes'=>'ngg','createdAt'=>${now}]);`
      + `db_insert('centres', ['centreId'=>'CEN-MP-2','name'=>'Ijaiye Summer Venue','code'=>'IJ','color'=>'#3b5bdb','status'=>'active','slug'=>'ijaiye','programmes'=>'summer','createdAt'=>${now}]);`
      + `foreach (['${A1}' => 'Adaeze Okafor', '${A2}' => 'Bola Ade'] as $id => $n) db_insert('members', ['memberId'=>$id,'fullName'=>$n,'email'=>strtolower($id).'@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `setting_set('intake_photo_required', '0', 't');`
      + `setting_set('fees', ['enabled'=>true,'membershipFee'=>10000,'membershipEveryMonths'=>12,'monthlyDues'=>4000,'trainingFee'=>0,'balanceCap'=>0,'remindEnabled'=>false], 't');`
      + `setting_set('membership_pay', ['bankName'=>'GTBank','accountName'=>'Afrovanguard Foundation','accountNumber'=>'0123456789'], 't');`, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const tok = id => php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), true);`, ['session']);
    const errs = [];
    const open = async (at, who, w) => {
      const ctx = await browser.newContext({ viewport: { width: w || 1360, height: 900 } });
      if (who) await ctx.addCookies([{ name: 'ngg_sess', value: tok(who), domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };
    const crToast = (p, re) => p.waitForFunction(src => new RegExp(src).test((document.querySelector('.cr-toast') || {}).innerText || ''), re.source, { timeout: 15000 }).then(() => true, () => false);

    console.log('the join form (phone, 390)');
    const J = await open('/join?program=anchor', null, 390);
    // Everything up to Interests answered already, as a resumed draft would have it.
    await J.evaluate(() => localStorage.setItem('ngg-apply', JSON.stringify({ step: 5, v: {
      filledBy: 'parent', centre: 'Egbeda', firstName: 'Tobi', middleName: '', surname: 'Ade', dob: (new Date().getFullYear() - 13) + '-03-02', sex: 'Female',
      email: 'tobi.parent@example.org', mobile: '08031234567', school: 'Egbeda Senior High School', class: 'JSS 2', classArm: '',
      address: '4 Ola Street, Egbeda', resState: 'Lagos', resLga: 'Alimosho', originState: 'Ogun', originLga: '', nationality: 'Nigerian',
      parent1Rel: 'Mother', parent1Name: 'Bola Ade', parent1Phone: '08031234567', parent2None: true, hobbies: [], influenceAreas: [],
      photoUrl: '/assets/logo.png', heardFrom: 'WhatsApp' } })));
    await J.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(J);
    await J.waitForSelector('.apf-cgroup', { timeout: 30000 });
    const divs = await J.$$eval('.apf-cgroup', g => g.map(x => x.innerText.replace(/\s+/g, ' ')));
    chk('the NGG form groups courses by the four NGG divisions, each in a family\'s words', divs.length === 5 && /Creative & Performing Arts/.test(divs[0]) && /cybersecurity/i.test(divs[2]) && /Business Strategy, Operations & Administration/.test(divs[3]) && /Not sure yet/.test(divs[4]));
    chk('…and no Summer School course is on it', !/Talking Drums|Piano|Tie & Dye/.test(await J.innerText('.apf-courses')));
    await J.click('button:has-text("Continue")');
    chk('continuing without a course says what is missing', /Choose an option/.test(await J.innerText('.apf-errsum')));
    await J.click('.apf-course:has-text("Robotics")');
    await J.click('.apf-starters button >> nth=0');
    await J.type('#apf-in-vision', 'an engineer who builds robots that sort plastic waste.');
    await J.click('#apf-fld-hobbies .apf-chip:has-text("Reading")');
    await J.click('#apf-fld-influenceAreas .apf-chip:has-text("Education")');
    await J.click('button:has-text("Continue")');
    await J.waitForSelector('#apf-fld-agree', { timeout: 10000 });
    const costs = await J.innerText('.apf-info');
    chk('before applying, the family is told what joining costs and that nothing is paid now', /₦10,000/.test(costs) && /₦4,000/.test(costs) && /first month is charged only for the meetings left/.test(costs) && /Nothing to pay today/.test(costs));
    chk('nothing on the form scrolls sideways on a phone', await J.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await J.click('button:has-text("Agree to all")');
    await J.click('button:has-text("Review")');
    await J.waitForSelector('.apf-review', { timeout: 10000 });
    chk('the review names the course', /Robotics/.test(await J.innerText('.apf-review')));
    await J.click('button:has-text("Send application")');
    await J.waitForSelector('.apf-done', { timeout: 20000 });
    const app = JSON.parse(php(`echo json_encode(db_row("SELECT id, faculty, track, program FROM applications WHERE email = 'tobi.parent@example.org'"));`));
    chk('the application is filed under its division and course', app && app.faculty === 'Technology & Applied Engineering' && app.track === 'Robotics' && app.program === 'anchor');
    await J.context().close();

    console.log('the Control Room: divisions, acceptance, payments');
    const P = await open('/control', A1);
    await P.waitForSelector('.cr-app', { timeout: 30000 });
    await P.evaluate(() => window.__adminSection('divisions'));
    await P.waitForSelector('.cr-dv-card', { timeout: 20000 });
    chk('Learning → Divisions & courses shows the four NGG divisions, with icon and card label', (await P.$$('.cr-dv-card')).length === 4
      && (await P.$eval('.cr-dv-card >> nth=2', el => el.querySelector('.cr-dv-short input').value)) === 'TECH' && /Summer School keeps its own catalogue/.test(await P.innerText('.cr-dv-intro')));
    await P.fill('.cr-dv-card >> nth=2 >> input[placeholder="Add a course…"]', 'Drone Engineering');
    await P.keyboard.press('Enter');
    await P.fill('.cr-dv-card >> nth=1 >> input[placeholder="Add a course…"]', 'robotics');
    await P.keyboard.press('Enter');
    chk('a course already in another division is refused there, by name', /Robotics is already in Technology & Applied Engineering/.test(await P.innerText('.cr-dv')));
    await P.click('button:has-text("Save divisions")');
    chk('saving says so', await crToast(P, /Saved\. The join form/));
    chk('…and the server has the new course in its division', JSON.parse(php(`echo json_encode(club_catalogue()['Technology & Applied Engineering']);`, ['bootstrap'])).includes('Drone Engineering'));

    await P.evaluate(() => window.__adminSection('inbox', 'applications'));
    await P.waitForSelector('.cr-ib-row', { timeout: 20000 });
    chk('the application shows its division and course', /Technology & Applied Engineering/.test(await P.innerText('.cr-ib-pane')) && /Robotics/.test(await P.innerText('.cr-ib-pane')));
    await P.click('.cr-ib-pane button:has-text("Accept & create member")');
    await P.waitForSelector('.cr-sheet', { timeout: 10000 });
    chk('accepting asks for the start date and says the invoice follows', /Start date/.test(await P.innerText('.cr-sheet')) && /one invoice/.test(await P.innerText('.cr-sheet')));
    const start = php(`echo gmdate('Y-m-d', strtotime('+2 days'));`);
    await P.fill('#crf-start', start);
    await P.click('.cr-sheet button[type=submit]');
    chk('accepting creates the member and the invoice, and says the email did not go (no mail server here)', await crToast(P, /Member created · NGG-[\s\S]*invoice made, but the email didn’t go/));
    const inv = JSON.parse(php(`echo json_encode(db_row("SELECT i.*, m.disciplines, m.joinDate FROM membership_invoices i JOIN members m ON m.memberId = i.memberId ORDER BY i.id DESC LIMIT 1"));`));
    const wantDues = +php(`echo membership_prorate(4000, '${start}', db_row("SELECT * FROM members WHERE memberId = '${inv.memberId}'"))['amount'];`, ['bootstrap']);
    chk('the invoice is the membership fee and the pro-rated first month, from the start date', inv.total === 10000 + wantDues && inv.joinDate === start && inv.disciplines === 'TECH');

    await P.evaluate(() => window.__adminSection('membership'));
    await P.waitForSelector('.cr-mp-table', { timeout: 20000 });
    chk('Money → Membership payments lists it, awaiting payment, with the bank details', /Awaiting payment/.test(await P.innerText('.cr-mp-table')) && /GTBank · 0123456789/.test(await P.innerText('.cr-mp-bar')));
    await P.click('.cr-mp-table button:has-text("Record offline payment")');
    await P.waitForSelector('.cr-sheet', { timeout: 10000 });
    const slip = path.join(TMP, 'slip.png');
    const png = await P.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 800; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 800); x.fillStyle = '#000'; x.font = '32px sans-serif'; x.fillText('GTB transfer 14,000 ' + Date.now(), 30, 100); return c.toDataURL('image/png').split(',')[1]; });
    fs.writeFileSync(slip, Buffer.from(png, 'base64'));
    await P.fill('#crf-amount', String(inv.total - 500));
    await P.fill('#crf-payerName', 'Mrs Ade');
    await P.fill('#crf-bankName', 'GTBank');
    await P.fill('#crf-reference', 'GTB-2026-55128');
    await P.setInputFiles('#crf-evidence', slip);
    await P.click('.cr-sheet button[type=submit]');
    chk('a payment that is not the invoice total is stopped at the field, before it is sent', /Record it only when that has been paid in full/.test(await P.innerText('.cr-sheet')));
    await P.fill('#crf-amount', String(inv.total));
    await P.click('.cr-sheet button[type=submit]');
    chk('recording it says a second person must verify it', await crToast(P, /Another member of staff with the Fees permission must now verify it/));
    await P.waitForFunction(() => /Check the payment/.test(document.querySelector('.cr-mp-table')?.innerText || ''), null, { timeout: 10000 });
    chk('…the row now waits for the check, naming who recorded it', /recorded by Adaeze Okafor/.test(await P.innerText('.cr-mp-table')));
    // aria-disabled, not disabled: a person can press it and is told why (Playwright needs force for that).
    await P.click('.cr-mp-table button:has-text("Verify")', { force: true });
    chk('the person who recorded it is told someone else must verify it', await crToast(P, /someone else must verify it/));
    chk('…and nothing was paid', php(`echo db_row("SELECT status FROM membership_invoices WHERE invoiceId = '${inv.invoiceId}'")['status'];`) === 'open');
    await P.context().close();

    const Q = await open('/control', A2);
    await Q.waitForSelector('.cr-app', { timeout: 30000 });
    await Q.evaluate(() => window.__adminSection('membership'));
    await Q.waitForSelector('.cr-mp-table', { timeout: 20000 });
    const evHref = await Q.getAttribute('.cr-mp-table a:has-text("Evidence")', 'href');
    const evRes = await Q.evaluate(u => fetch(u, { credentials: 'include' }).then(r => [r.status, r.headers.get('content-type')]), evHref);
    chk('the second person can open the evidence, served as the image it is', evRes[0] === 200 && /^image\//.test(evRes[1]));
    await Q.click('.cr-mp-table button:has-text("Verify")');
    await Q.waitForSelector('.cr-sheet', { timeout: 10000 });
    chk('verifying shows the claim and asks for the statement’s own figures', /Recorded by Adaeze Okafor/.test(await Q.innerText('.cr-sheet')) && /Do not copy from the record/.test(await Q.innerText('.cr-sheet')));
    await Q.fill('#crf-ref', 'GTB-2026-55129');
    await Q.fill('#crf-amt', String(inv.total));
    await Q.click('.cr-sheet [role=switch]');
    await Q.click('.cr-sheet button[type=submit]');
    chk('a reference that does not match the record is refused at the field', await Q.waitForFunction(() => /does not match the one recorded/.test(document.querySelector('.cr-sheet')?.innerText || ''), null, { timeout: 10000 }).then(() => true, () => false));
    await Q.fill('#crf-ref', 'gtb 2026 55128');
    await Q.click('.cr-sheet button[type=submit]');
    chk('the right figures settle it and send the receipt', await crToast(Q, /Verified\. Receipt NGG-RCT-\d{4}-\d{5}/));
    const paid = JSON.parse(php(`echo json_encode(db_row("SELECT status, paidVia, receiptNo, receiptToken, payToken FROM membership_invoices WHERE invoiceId = '${inv.invoiceId}'"));`));
    chk('…the invoice is paid by transfer, checked by the second person', paid.status === 'paid' && paid.paidVia === 'transfer'
      && php(`echo db_row("SELECT verifiedBy FROM offline_payments WHERE invoiceId = '${inv.invoiceId}'")['verifiedBy'];`) === A2);
    await Q.waitForFunction(() => /Paid/.test(document.querySelector('.cr-mp-table')?.innerText || ''), null, { timeout: 10000 });
    chk('…and the row shows the receipt and who checked it', /checked by Bola Ade/.test(await Q.innerText('.cr-mp-table')) && !!(await Q.$('.cr-mp-table a:has-text("NGG-RCT-")')));

    await Q.evaluate(() => window.__adminSection('centres'));
    await Q.waitForSelector('.admin-seg', { timeout: 20000 });
    await Q.click('.admin-seg button:has-text("NGG Club")');
    const cen = await Q.innerText('.admin-main');
    chk('People → Centres can be read programme by programme', /Egbeda/.test(cen) && !/Ijaiye Summer Venue/.test(cen) && /NGG Club only/i.test(cen));
    if (!/NGG Club only/i.test(cen) || /Ijaiye Summer Venue/.test(cen)) console.error('       centres said: ' + cen.replace(/\s+/g, ' ').slice(0, 600));
    await Q.context().close();

    console.log('the family’s pages');
    const R = await open('/');
    await R.goto(BASE + '/api/public/receipt.php?t=' + paid.receiptToken, { waitUntil: 'domcontentloaded' });
    const rec = await R.innerText('body');
    chk('the receipt is a printable document: number, PAID, member, method, reference, total', new RegExp(paid.receiptNo).test(rec) && /PAID/.test(rec) && /Tobi Ade/.test(rec) && /Bank transfer/.test(rec) && /GTB-2026-55128/.test(rec) && /Mrs Ade/.test(rec));
    await R.goto(BASE + '/pay/' + paid.payToken, { waitUntil: 'domcontentloaded' }); await waitForBoot(R);
    await R.waitForSelector('.mpay-title', { timeout: 20000 });
    chk('the payment link of a paid invoice thanks them and links the receipt — it cannot be paid twice', /fully enrolled/.test(await R.innerText('.mpay-title')) && !!(await R.$('a:has-text("View and print the receipt")')) && !(await R.$('.mpay-pay')));
    php(`$m = db_row("SELECT * FROM members WHERE memberId = '${A1}'"); $m['memberId'] = 'NGG-MPE-K2'; $m['role'] = 'member'; $m['email'] = 'k2@example.org'; $m['parentEmail'] = 'k2p@example.org'; $m['fullName'] = 'Kemi Bello'; $m['joinDate'] = gmdate('Y-m-d'); unset($m['id']); db_insert('members', $m); membership_invoice_create($m, 'test');`, ['bootstrap']);
    const t2 = php(`echo db_row("SELECT payToken FROM membership_invoices WHERE memberId = 'NGG-MPE-K2'")['payToken'];`);
    await R.goto(BASE + '/pay/' + t2, { waitUntil: 'domcontentloaded' }); await waitForBoot(R);
    await R.waitForSelector('.mpay-items', { timeout: 20000 });
    const pg = await R.innerText('.mpay-card');
    chk('an unpaid invoice shows its lines, the total, and the bank details with the invoice as narration', /Complete Kemi’s membership/.test(pg) && /Membership fee/.test(pg) && /Commitment fee/.test(pg) && /0123456789/.test(pg) && /NGG-INV-/.test(pg));
    chk('…with no Paystack button when Paystack is not set up', !(await R.$('.mpay-pay')));
    await R.goto(BASE + '/pay/not-a-real-token', { waitUntil: 'domcontentloaded' }); await waitForBoot(R);
    await R.waitForSelector('.mpay-msg', { timeout: 20000 });
    chk('a wrong link says so', /This link isn’t valid/.test(await R.innerText('.mpay-msg')));

    console.log('scanning a member card');
    const code = php(`echo member_cards_ensure(db_row("SELECT * FROM members WHERE memberId = '${inv.memberId}'"), 'test', 'created')['secure'];`, ['bootstrap']);
    await R.goto(BASE + '/q/' + code, { waitUntil: 'domcontentloaded' }); await waitForBoot(R);
    await R.waitForSelector('.mcv-card', { timeout: 20000 });
    const mc = await R.innerText('.mcv-card');
    chk('a phone scanning a member card opens the NGG member page — not the Summer School one', /Tobi Ade/.test(mc) && /Active member/.test(mc) && /Technology & Applied Engineering/.test(mc) && /Robotics/.test(mc) && !/SUMMER SCHOOL/i.test(mc));
    await R.goto(BASE + '/?m=' + inv.memberId, { waitUntil: 'domcontentloaded' }); await waitForBoot(R);
    await R.waitForSelector('.mcv-card', { timeout: 20000 });
    chk('an old card that carried /?m=<member id> opens the member page too — confirming the membership, naming nobody', new URL(R.url()).pathname === '/q/' + inv.memberId && /Active member/.test(await R.innerText('.mcv-card')) && !/Tobi|T\.A\.|Robotics|Egbeda/.test(await R.innerText('.mcv-card')));
    await R.context().close();

    chk('no page errors anywhere', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    // Evidence files written by this run go with it.
    try { const dir = path.join(ROOT, 'api/storage/payment-evidence'); fs.readdirSync(dir).filter(f => !evidenceBefore.has(f)).forEach(f => fs.unlinkSync(path.join(dir, f))); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (membership payments)`);
    process.exit(failed ? 1 : 0);
  }
})();
