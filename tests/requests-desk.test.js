#!/usr/bin/env node
/* ============================================================================
   The requests desk, end to end: real PHP server, real session, the real
   drawer (Members › Request log) and its forms.

   Seeded with the two requests that were reported, exactly as written:
     · a payment claim whose Reference is the family's whole story —
       "2MPTg39mv. 210882705917985177. I paid 10000 naira as transfer and
       2000 naira cash to Mrs Basirat Awolaja Egbeda";
     · "Correct my details" reading "Date of birth: 08/06/2013.   Phone
       number: 08098190961".
   What must hold: the drawer reads them (two payment lines, the references,
   the cash and who took it; the date and the phone beside the record), the
   desk acts from the drawer, a payment posts one ledger entry per way it
   came, a details change lands on the record and approves the request with a
   reply saying what changed, a message reaches the request without deciding
   it, and an empty section says so instead of drawing a bare heading.

   Run:  node tests/requests-desk.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.REQDESK_PORT || '8286';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-reqdesk-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'requests');

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
  if (!chromium) { console.log('⏭  requests desk: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'reqdesk_test_secret_0123456789abcdefg',
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
    const mk = (id, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'X ${id}','email'=>strtolower('${id}').'@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','createdAt'=>now_iso(),'updatedAt'=>now_iso()], ${extra}));`;
    const ids = JSON.parse(php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-RQ-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);`
      + mk('NGG-RQ-ADM', "['role'=>'super_admin','fullName'=>'Desk Admin']")
      + mk('NGG-RQ-1', "['fullName'=>'Elizabeth Araoluwa Ajao','displayId'=>'026-143','dob'=>'2013-08-06','phone'=>'']")
      + `$pay = member_request_create(['memberId'=>'NGG-RQ-1','kind'=>'payment','amount'=>12000,'reference'=>'2MPTg39mv. 210882705917985177. I paid 10000 naira as transfer and 2000 naira cash to Mrs Basirat Awolaja Egbeda']);`
      + `$det = member_request_create(['memberId'=>'NGG-RQ-1','kind'=>'details','body'=>"Date of birth: 08/06/2013.      Phone number: 08098190961"]);`
      + `echo json_encode(['pay'=>$pay['request']['requestId'] ?? '', 'det'=>$det['request']['requestId'] ?? '', 'perr'=>$pay['error'] ?? '', 'derr'=>$det['error'] ?? '']);`));
    chk('the two reported requests are seeded (' + ids.pay + ', ' + ids.det + ')', /^REQ-/.test(ids.pay) && /^REQ-/.test(ids.det));
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const P = await pageFor('NGG-RQ-ADM');
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (fn, arg, ms) => P.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const dlg = '[role="dialog"]';
    const sheet = () => P.evaluate(() => (document.querySelector('.cr-sheet, .cr-pfull, [aria-modal="true"]') || document.body).innerText);
    const open = async id => {
      await P.goto(BASE + '/control/members/request-log/' + id, { waitUntil: 'domcontentloaded' });
      await waitForBoot(P);
      await until(i => document.body.innerText.includes(i), id, 60000);
      await P.click('tr:has-text("' + id + '")');
      await until(() => /The reply/.test(document.body.innerText));
    };

    // ── The payment claim written as a sentence ──
    await open(ids.pay);
    let t = await sheet();
    chk('the drawer pulls the references out of the sentence', /2MPTg39mv · 210882705917985177/.test(t));
    chk('…keeps what they wrote, under its own heading', /What they wrote about the payment/.test(t) && /Mrs Basirat Awolaja/.test(t));
    chk('…says an empty section is empty rather than drawing a bare heading', /Not decided yet\./.test(t) && /Nothing beyond the subject\./.test(t));
    chk('…and can be decided from the drawer', /Approve and post/.test(t) && /Decline/.test(t) && /Send a message/.test(t));
    await P.screenshot({ path: path.join(SHOTS, 'payment.png') });
    await P.click('button:has-text("Approve and post")');
    await P.waitForSelector(dlg);
    const vals = await P.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea')).map(e => e.value));
    chk('the approval is filled in from the sentence: ₦10,000 by transfer with its reference, ₦2,000 cash to Mrs Basirat Awolaja (' + vals.filter(Boolean).slice(0, 4).join(' | ') + ')',
      vals.includes('10000') && vals.includes('2000') && vals.some(v => /210882705917985177/.test(v)) && vals.some(v => /^Mrs Basirat Awolaja/.test(v)));
    chk('…with a drafted reply in full sentences', vals.some(v => /We have received ₦10,000 by transfer and ₦2,000 in cash/.test(v)));
    await P.screenshot({ path: path.join(SHOTS, 'payment-approve.png'), fullPage: true });
    await P.click(dlg + ' button[type="submit"]');
    await until(() => !document.querySelector('[role="dialog"]'));
    const led = JSON.parse(php(`echo json_encode(db_all("SELECT amount, method, reference FROM member_ledger WHERE memberId = 'NGG-RQ-1' AND kind = 'payment' ORDER BY amount DESC"));`));
    chk('approving posts two ledger entries — the transfer with its reference, the cash with who took it',
      led.length === 2 && +led[0].amount === 10000 && led[0].method === 'transfer' && /210882705917985177/.test(led[0].reference)
      && +led[1].amount === 2000 && led[1].method === 'cash' && /Awolaja/.test(led[1].reference));
    chk('…and the request is approved with that reply', /We have received/.test(php(`echo db_row("SELECT decision FROM member_requests WHERE requestId = '${ids.pay}'")['decision'];`)));

    // ── Correct my details ──
    await open(ids.det);
    t = await sheet();
    chk('the details request is read against the record: the date and the phone, with what is there now',
      /What they asked to change/.test(t) && /Date of birth: Sat 8 Jun 2013/.test(t) && /On the record now: Tue 6 Aug 2013/.test(t) && /Phone: 08098190961/.test(t));
    await P.screenshot({ path: path.join(SHOTS, 'details.png') });
    await P.click('button:has-text("Send a message")');
    await P.waitForSelector(dlg);
    await P.fill(dlg + ' textarea', 'Thank you. Is 08098190961 your own number, or your parent’s?');
    await P.click(dlg + ' button[type="submit"]');
    chk('a message is sent without deciding the request, and shows on it', await until(() => /Messages/.test(document.body.innerText) && /your own number, or your parent/.test(document.body.innerText))
      && php(`echo db_row("SELECT status FROM member_requests WHERE requestId = '${ids.det}'")['status'];`) === 'open'
      && /your own number/.test(php(`echo db_row("SELECT comments FROM member_requests WHERE requestId = '${ids.det}'")['comments'];`)));
    await P.click('button:has-text("Change it")');
    await P.waitForSelector(dlg);
    const dv = await P.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] input, [role="dialog"] select')).map(e => e.value));
    chk('“Change it” opens with the two lines filled in (' + dv.filter(Boolean).join(' | ') + ')', dv.includes('dob') && dv.includes('08/06/2013') && dv.includes('phone') && dv.includes('08098190961'));
    await P.click(dlg + ' button[type="submit"]');
    await until(() => !document.querySelector('[role="dialog"]'));
    const m = JSON.parse(php(`echo json_encode(db_row("SELECT dob, phone FROM members WHERE memberId = 'NGG-RQ-1'"));`));
    const rq = JSON.parse(php(`echo json_encode(db_row("SELECT status, decision FROM member_requests WHERE requestId = '${ids.det}'"));`));
    chk('the record is changed and the request approved, its reply saying what changed',
      m.dob === '2013-06-08' && m.phone === '08098190961' && rq.status === 'approved' && /Date of birth → 8 Jun 2013/.test(rq.decision) && /Phone → 08098190961/.test(rq.decision));

    // ── The phone ──
    const M = await pageFor('NGG-RQ-ADM', { width: 390, height: 844 });
    M.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await M.goto(BASE + '/control/members/request-log', { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    await M.waitForFunction(() => /Every request/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    const over = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk('on a phone the request log fits its width (overflow ' + over + 'px)', over <= 1);

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (requests desk)');
  process.exit(failed ? 1 : 0);
})();
