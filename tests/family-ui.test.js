#!/usr/bin/env node
/* ============================================================================
   Family accounts, end to end: real PHP server, real cookies, real screens.

   What must hold:
     · A parent signs in at /family with an emailed code — no member session
       is created, and the family cookie is useless as a member cookie.
     · The child's code + name connects at once and the dashboard shows the
       day's sign-in, late and by how much.
     · A record that names the parent's email only ASKS; the Control Room's
       Families section approves it, and the parent then sees that child too.
     · A notice to the centre lands in the desk's request queue; an email
       switch is saved.
     · The emailed link signs in and is stripped from the address bar.
     · Signing out ends the family session; the page fits a phone, with one
       bar at the top and five sections at the bottom (Family Portal v3).
     · The URL is the state; Account is read-only and the server refuses a
       profile write from a family route.

   Run:  node tests/family-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FAMILY_PORT || '8283';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-family-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'family');

let _seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
// The same, through bootstrap: every domain loaded, so an op can be dispatched.
function phpB(snippet) {
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
function get(url, headers) {
  return new Promise((res, rej) => http.get(url, { headers }, r => {
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b).toString() }));
  }).on('error', rej));
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
const latestCode = () => php(`echo db_row("SELECT otp FROM auth_sessions WHERE purpose = 'family_login' ORDER BY id DESC LIMIT 1")['otp'];`);
const latestToken = () => php(`echo db_row("SELECT token FROM auth_sessions WHERE purpose = 'family_login' ORDER BY id DESC LIMIT 1")['token'];`);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  family UI: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'family_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60], 'family.request' => ['max' => 1000, 'window' => 60], 'family.verify' => ['max' => 1000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'ai' => ['enabled' => false],
    'debug' => false,
  ];\n`);

  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-FU-ADM','fullName'=>'Family Admin','email'=>'fu-adm@example.org','type'=>'NGG','status'=>'active','role'=>'admin','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-FU-KID','fullName'=>'Tobi Adeyemi','email'=>'fu-kid@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Piano','anchorCode'=>'482913','parentEmail'=>'mum@example.org','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-FU-SIB','fullName'=>'Kemi Adeyemi','email'=>'fu-sib@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','parentEmail'=>'mum@example.org','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `$d = (new DateTime('now', new DateTimeZone('Africa/Lagos')))->format('Y-m-d'); db_insert('attendance', ['cohortId'=>'','studentId'=>'NGG-FU-KID','date'=>$d,'checkInAt'=>$d.'T09:12:00Z','checkOutAt'=>'','status'=>'late','lateMinutes'=>12,'method'=>'test','createdAt'=>${now}]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const launch = { executablePath: require('./_responsive-probe').chromiumPath(fs) };
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];
    const btn = (p, name) => p.locator('button', { hasText: name }).first();
    const bodyText = p => p.evaluate(() => document.body.innerText);
    // The boot splash fades after mount; a screenshot taken under it shows the splash, not the page.
    const settle = p => p.waitForFunction(() => { const b = document.getElementById('ngg-boot'); return !b || b.classList.contains('gone'); }, null, { timeout: 30000 }).then(() => p.waitForTimeout(700), () => {});
    const waitText = (p, re, t) => p.waitForFunction(r => new RegExp(r).test(document.body.innerText), re.source, { timeout: t || 20000 });

    /* ── Sign in with a code, on a phone ── */
    const fctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const fp = await fctx.newPage();
    fp.on('pageerror', e => errs.push('family: ' + String(e).slice(0, 200)));
    await fp.goto(BASE + '/family', { waitUntil: 'domcontentloaded' });
    await waitForBoot(fp);
    await fp.waitForSelector('.fp3-app input[type=email]', { timeout: 40000 });
    chk('a signed-out visitor sees the family sign-in', /See how your child is doing at NGG/.test(await bodyText(fp)));
    await fp.fill('input[type=email]', 'Mum@Example.org');
    await btn(fp, 'Email me a sign-in code').click();
    await fp.waitForSelector('input[autocomplete=one-time-code]');
    await fp.fill('input[autocomplete=one-time-code]', latestCode());
    await btn(fp, 'Sign in').click();
    await waitText(fp, /Add a child|Connect/, 20000);
    chk('the code signs the parent in to a new family account', php(`echo db_row("SELECT COUNT(*) c FROM guardians WHERE email = 'mum@example.org'")['c'];`) === '1');
    const cookies = await fctx.cookies();
    const fam = cookies.find(c => c.name === 'ngg_sess_family');
    chk('…on a family cookie, never a member session', !!fam && fam.httpOnly && !cookies.find(c => c.name === 'ngg_sess'));
    const asMember = await get(BASE + '/api/auth/me.php', { Cookie: 'ngg_sess=' + fam.value });
    chk('…and the family cookie used as a member cookie is nobody', JSON.parse(asMember.body).member === null);
    chk('…nor reads a member route', (await get(BASE + '/api/member/self.php?view=requests', { Cookie: 'ngg_sess=' + fam.value })).status === 401);

    /* ── Add a child with their code ── */
    chk('with no child yet, the parent lands on "Add a child", offered the records naming their email by first name only',
      /We found a record with your email/.test(await bodyText(fp)) && /Kemi/.test(await bodyText(fp)) && !/Kemi Adeyemi/.test(await bodyText(fp)));
    await fp.fill('input[placeholder="6 digits"]', '482913');
    await fp.fill('input[placeholder="e.g. their first name"]', 'Bello');
    await btn(fp, /^Connect this child$/).click();
    await waitText(fp, /don’t match a member/);
    chk('a code with the wrong name connects nothing, and says why', true);
    await fp.fill('input[placeholder="e.g. their first name"]', 'Tobi');
    await btn(fp, /^Connect this child$/).click();
    await waitText(fp, /Connected to Tobi/);
    chk('the child\'s code + name connects at once', php(`echo db_row("SELECT status FROM guardian_wards WHERE memberId = 'NGG-FU-KID'")['status'];`) === 'active');
    chk('…and the child is told', php(`echo db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'NGG-FU-KID' AND title = 'A family account is connected to you'")['c'];`) === '1');

    /* ── Today, on a phone ── */
    await fp.goto(BASE + '/family?view=today', { waitUntil: 'domcontentloaded' });
    await waitForBoot(fp);
    await waitText(fp, /Tobi’s account/, 40000);
    const today = await bodyText(fp);
    chk('Today shows the child\'s sign-in, late and by how much', /In since 09:12, 12 min late/.test(today));
    chk('…with the account card before the to-do list', today.indexOf('Tobi’s account') !== -1 && (today.indexOf('For you to do') === -1 || today.indexOf('Tobi’s account') < today.indexOf('For you to do')));
    const top = await fp.evaluate(() => { const h = document.querySelector('.fp3-app header'); return h ? h.getBoundingClientRect().height : 999; });
    chk('the top of the phone screen is one bar, not a stack (≤ 76px)', top <= 76);
    chk('the page fits a phone without sideways scrolling', await fp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    chk('…with the five sections in a bottom tab bar, each a 44px target', await fp.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('.fp3-app nav[aria-label="Main"]')).pop();
      const tabs = nav ? Array.from(nav.querySelectorAll('button')) : [];
      return tabs.length === 5 && tabs.every(t => { const r = t.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; });
    }));
    chk('every control on Today is at least 44px tall on a touch screen', await fp.evaluate(() => Array.from(document.querySelectorAll('.fp3-app main button:not([role=tab])')).filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 44)));
    await settle(fp);
    await fp.screenshot({ path: path.join(SHOTS, 'family-today-phone.png') });

    /* ── URL is the state; one sub-tab in the DOM ── */
    await fp.locator('nav[aria-label="Main"] button', { hasText: 'Growth' }).last().click();
    await fp.waitForFunction(() => /view=growth/.test(location.search));
    await fp.locator('[role=tab]', { hasText: 'Results' }).click();
    await fp.waitForFunction(() => /sub=results/.test(location.search));
    chk('the section and sub-tab travel in the address', /view=growth/.test(fp.url()) && /sub=results/.test(fp.url()));
    chk('…and only the chosen sub-tab is drawn', !/NGG Leadership Index/.test(await bodyText(fp)) && (await fp.$$('[role=tab][aria-selected=true]')).length === 1);
    await fp.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await fp.waitForSelector('[role=tab][aria-selected=true]', { timeout: 40000 });
    chk('…so a refresh opens the same screen', /Results/.test(await fp.$eval('[role=tab][aria-selected=true]', el => el.innerText)));

    /* ── Tell the centre: the absence sheet ── */
    await fp.goto(BASE + '/family?view=saturdays', { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /will be away/, 40000);
    await btn(fp, 'Tell the centre Tobi will be away').click();
    await fp.waitForSelector('[role=dialog] input[type=date]');
    // Focus moves in as the sheet finishes opening (a 30ms tick), so wait for it rather than sampling once.
    chk('the absence sheet opens with focus inside it', await fp.waitForFunction(() => !!(document.activeElement && document.activeElement.closest('[role=dialog]')), null, { timeout: 3000 }).then(() => true, () => false));
    await fp.fill('[role=dialog] input[type=date] >> nth=0', '2026-11-07');
    await fp.locator('[role=dialog] button', { hasText: 'Tell the centre' }).click();
    await waitText(fp, /Say why Tobi will be away/);
    chk('…and refuses an absence with no reason, saying so', true);
    /* 7 Nov is already past, so this is under 24 hours' notice (owner, 14 Nov 2026): the sheet warns as the
       date is chosen, still lets it send (it may be a verifiable emergency), and says what the server decided. */
    chk('a date under 24 hours ahead shows the notice in the sheet, without blocking the send',
      /not approved, unless it is an emergency the centre can check/.test(await fp.innerText('[role=dialog]')));
    await fp.fill('[role=dialog] textarea', 'Family wedding');
    await fp.locator('[role=dialog] button', { hasText: 'Tell the centre' }).click();
    await waitText(fp, /Sent, with less than 24 hours’ notice/);
    chk('…and it is sent, with a confirmation that says it was short notice',
      php(`echo (string)db_row("SELECT shortNotice FROM member_requests WHERE memberId = 'NGG-FU-KID' AND kind = 'leave'")['shortNotice'];`) === '1');
    chk('a parent\'s absence notice lands in the desk\'s request queue, marked as theirs, with its reason',
      php(`echo json_encode(db_row("SELECT kind, raisedBy <> '' fam FROM member_requests WHERE memberId = 'NGG-FU-KID'"));`) === '{"kind":"leave","fam":1}');
    await fp.keyboard.press('Escape');

    /* ── Account: read-only, consents without controls ── */
    await fp.goto(BASE + '/family?view=account', { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /Kept by the centre/, 40000);
    const acc = await fp.evaluate(() => { const m = document.querySelector('.fp3-app main'); return { inputs: m.querySelectorAll('input, textarea, select').length, text: m.innerText }; });
    chk('Account has no editable field, and says the centre keeps the details', acc.inputs === 0 && /Ask to change/.test(acc.text));
    chk('…and every consent is shown as given, with nothing to switch', /Consents/.test(acc.text) && /can’t be changed or withdrawn here/.test(acc.text));
    const ro = await new Promise(res => { const d = JSON.stringify({ action: 'profile', fullName: 'X' }); const r = http.request(BASE + '/api/family/account.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), Cookie: 'ngg_sess_family=' + fam.value + '; ngg_csrf=x', 'X-CSRF-Token': 'x', Origin: BASE } }, x => { x.resume(); x.on('end', () => res(x.statusCode)); }); r.end(d); });
    chk('…and the server refuses a profile write from a family route', ro === 403);

    /* ── The Control Room approves the sibling ── */
    await fp.goto(BASE + '/family?view=add', { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /Ask to connect/, 40000);
    await btn(fp, 'Ask to connect').click();
    await waitText(fp, /Asked to connect to Kemi/);
    chk('asking through the record waits for the centre', php(`echo db_row("SELECT status FROM guardian_wards WHERE memberId = 'NGG-FU-SIB'")['status'];`) === 'pending');
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-FU-ADM'"), true);`, ['session']);
    const actx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    await actx.addCookies([
      { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
      { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
    ]);
    const ap = await actx.newPage();
    ap.on('pageerror', e => errs.push('admin: ' + String(e).slice(0, 200)));
    await ap.goto(BASE + '/nextadmin?s=families', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForSelector('.cr-tbl tbody tr', { timeout: 40000 });
    chk('the Families section lists the request, with the parent email on the record beside it', /Kemi Adeyemi[\s\S]*mum@example\.org/.test(await ap.$eval('.cr-tbl tbody', el => el.innerText)));
    await ap.click('.cr-tbl tbody tr [role=checkbox]');
    await ap.click('.cr-selbar button:has-text("Approve")');
    await ap.waitForSelector('.cr-confirm');
    await ap.click('.cr-confirm .cr-confirm-acts .is-primary');
    await ap.waitForFunction(() => !document.querySelector('.cr-tbl tbody tr') || /Nobody is waiting/.test(document.body.innerText), null, { timeout: 15000 });
    chk('approving connects the parent', php(`echo db_row("SELECT status FROM guardian_wards WHERE memberId = 'NGG-FU-SIB'")['status'];`) === 'active');

    /* ── Announcements reach the inbox; switching child ── */
    php(`$g = db_row("SELECT guardianId FROM guardians WHERE email = 'mum@example.org'");
         db_insert('guardian_notices', ['noticeId' => 'GN-FU1', 'guardianId' => $g['guardianId'], 'kind' => 'announcement', 'refId' => 'ANN-FU1',
           'title' => 'Kit day on Saturday', 'body' => 'Bring trainers and water.', 'fromName' => 'Ada Admin', 'createdAt' => gmdate('Y-m-d\\TH:i:s\\Z'), 'readAt' => '']);`);
    await fp.goto(BASE + '/family?view=messages', { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /Kit day on Saturday/, 40000);
    chk('a Club announcement is in the household inbox, marked unread on the Messages tab', /Messages/.test(await fp.locator('nav[aria-label="Main"]').last().innerText()));
    await fp.locator('button', { hasText: 'Kit day on Saturday' }).first().click();
    await fp.waitForSelector('[role=dialog]');
    chk('…opening it shows the message', /Bring trainers and water/.test(await fp.$eval('[role=dialog]', el => el.innerText)));
    await fp.waitForFunction(() => true);
    for (let i = 0; i < 20 && php(`echo db_row("SELECT readAt FROM guardian_notices WHERE noticeId = 'GN-FU1'")['readAt'];`) === ''; i++) await fp.waitForTimeout(250);
    chk('…and marks it read, on the server', php(`echo db_row("SELECT readAt FROM guardian_notices WHERE noticeId = 'GN-FU1'")['readAt'];`) !== '');
    await fp.keyboard.press('Escape');
    await fp.locator('header button[aria-haspopup=dialog]').first().click();
    await fp.waitForSelector('[role=dialog]');
    chk('the child switcher lists both children', /Tobi Adeyemi[\s\S]*Kemi Adeyemi|Kemi Adeyemi[\s\S]*Tobi Adeyemi/.test(await fp.$eval('[role=dialog]', el => el.innerText)));
    await fp.keyboard.press('Escape');
    chk('…and Escape closes it, giving focus back to the switcher', await fp.evaluate(() => !document.querySelector('[role=dialog]') && document.activeElement && document.activeElement.getAttribute('aria-haspopup') === 'dialog'));

    /* ── Money: the child asks, the parent pays ahead or confirms a transfer ── */
    phpB(`setting_set('fees', ['enabled' => true, 'membershipFee' => 12000, 'membershipEveryMonths' => 12, 'monthlyDues' => 2000, 'trainingFee' => 0, 'balanceCap' => 0, 'remindEnabled' => false] + fees_settings(), 'test');
          setting_set('membership_pay', ['bankName' => 'Test Bank', 'accountName' => 'Afrovanguard NGG', 'accountNumber' => '0123456789'], 'test');
          db_exec("UPDATE members SET joinDate = ? WHERE memberId IN ('NGG-FU-KID','NGG-FU-SIB')", [gmdate('Y-m-d', strtotime(gmdate('Y-m-15') . ' -3 months'))]);
          foreach (['NGG-FU-KID', 'NGG-FU-SIB'] as $k) fees_accrue_member(db_row('SELECT * FROM members WHERE memberId = ?', [$k]));`);
    const kidTok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-FU-KID'"), false);`, ['session']);
    const kctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await kctx.addCookies([
      { name: 'ngg_sess', value: kidTok, domain: '127.0.0.1', path: '/', httpOnly: true },
      { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
    ]);
    const kp = await kctx.newPage();
    kp.on('pageerror', e => errs.push('member: ' + String(e).slice(0, 200)));
    await kp.goto(BASE + '/dashboard/account', { waitUntil: 'domcontentloaded' }); await waitForBoot(kp);
    await kp.waitForSelector('.m9x-ask-b', { timeout: 40000 });
    const kText = await bodyText(kp);
    chk('the member\'s money screen has no "I\'ve made a payment"; one button asks their parent instead', !/I've made a payment/.test(kText) && await kp.locator('.m9x-ask-b').count() === 1);
    await kp.locator('.m9x-ask-b').click();
    await waitText(kp, /Sent to your parent|Asked /, 15000);
    chk('…and pressing it puts a request in the parent\'s family inbox, tied to the child',
      php(`echo db_row("SELECT COUNT(*) c FROM guardian_notices WHERE kind = 'nudge' AND memberId = 'NGG-FU-KID'")['c'];`) === '1');
    await settle(kp);
    await kp.screenshot({ path: path.join(SHOTS, 'member-ask-parent-phone.png') });
    const raw = await kp.evaluate(() => NGGApi.member.raiseRequest({ kind: 'payment', amount: 500, reference: 'X' }).then(() => 'accepted', e => (e && (e.code || e.message)) || 'error'));
    chk('…and the member route refuses a payment claim outright', raw === 'ask_parent');

    const tobi = php(`echo db_row("SELECT linkId FROM guardian_wards WHERE memberId = 'NGG-FU-KID'")['linkId'];`);
    await fp.goto(BASE + '/family?view=today&child=' + tobi, { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /asked you to pay their fees/, 40000);
    const t2 = await bodyText(fp);
    chk('the parent\'s Today puts the child\'s ask in the to-do list', /Tobi asked you to pay their fees/.test(t2));
    /* Each to-do row is one button that ends in its action ("Pay ₦…", "Upload the report"), never a bare caret, "Open Fees", "Review" or "See".
       Only the rows this family actually has are checked. */
    const todoBtns = await fp.evaluate(() => Array.from(document.querySelectorAll('section[aria-labelledby="todo-h"] button')).map(b => (b.textContent || '').replace(/\s+/g, ' ').trim()));
    const todoOk = !/Open Fees/.test(t2) && todoBtns.length > 0
      && todoBtns.some(x => /asked you to pay.*(Pay ₦[\d,]+|Pay the joining invoice)$/.test(x))
      && todoBtns.filter(x => /results aren’t in yet/.test(x)).every(x => /Upload the report$/.test(x))
      && !todoBtns.some(x => /(Review|See|Open|Read)$/.test(x));
    if (!todoOk) console.error('    to-do rows: ' + JSON.stringify(todoBtns));
    chk('…and each to-do row names its action: the ask ends "Pay ₦…", missing results end "Upload the report"', todoOk);
    chk('…and Today is fuller: things to do for the child, what is coming, and their lessons', /For Tobi/.test(t2) && /Coming up/.test(t2) && /What Tobi is learning/.test(t2) && /Pay ahead/.test(t2));
    await settle(fp);
    await fp.screenshot({ path: path.join(SHOTS, 'family-today-fees-phone.png'), fullPage: true });

    await fp.goto(BASE + '/family?view=fees&child=' + tobi, { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /Pay ahead/, 40000);
    const opts = fp.locator('.fp3x-opts button');
    chk('Fees offers paying 1, 3, 6 or 12 months ahead, each priced', await opts.count() === 4 && /₦/.test(await opts.first().innerText()));
    chk('…with the notice that a dues change can mean paying the difference', /Dues can change/.test(await fp.locator('.fp3x-notice').innerText())
        && /pay the difference/.test(await fp.locator('.fp3x-notice').innerText()));
    /* By the term: the same card switches to terms, priced by the server, never past a year. */
    await fp.locator('.fp3x-mode', { hasText: 'By term' }).click();
    const tOpts = fp.locator('.fp3x-opts button');
    const tCount = await tOpts.count();
    chk('Fees also offers paying by the term: through this term and up to two more, each priced',
        tCount >= 1 && tCount <= 3 && /Through this term/.test(await tOpts.first().innerText()) && /₦/.test(await tOpts.first().innerText())
        && (await fp.locator('.fp3x-mode', { hasText: 'By term' }).getAttribute('aria-pressed')) === 'true');
    await settle(fp);
    await fp.screenshot({ path: path.join(SHOTS, 'family-pay-ahead-terms-phone.png'), fullPage: true });
    await fp.locator('.fp3x-mode', { hasText: 'By month' }).click();
    await opts.nth(2).click();
    chk('…choosing one marks it pressed', (await opts.nth(2).getAttribute('aria-pressed')) === 'true');
    await settle(fp);
    await fp.screenshot({ path: path.join(SHOTS, 'family-pay-ahead-phone.png'), fullPage: true });
    const want = await fp.locator('.fp3x-lines .is-total b').innerText();
    await fp.locator('.fp3x-go', { hasText: 'ahead' }).click();
    await fp.waitForURL(/\/pay\//, { timeout: 20000 });
    const inv = JSON.parse(php(`echo json_encode(db_row("SELECT purpose, total FROM membership_invoices WHERE memberId = 'NGG-FU-KID' AND status = 'open' ORDER BY id DESC LIMIT 1"));`));
    chk('paying ahead opens an advance invoice for the figure on screen, priced by the server', inv && inv.purpose === 'advance' && want.replace(/\D/g, '') === String(inv.total));
    await waitForBoot(fp);   // /pay is a full page load: the app boots again (a minute, cold, in dev) before it can say anything
    await waitText(fp, /Pay ahead for Tobi/, 40000);
    chk('…and the /pay page names it as paying ahead', true);
    chk('…and repeats the dues-change notice', /pay the difference/.test(await fp.locator('.mpay-notice').innerText()));

    /* Instalment plans (domain/fee-plans.php): the parent picks, sees the
       server's dates, agrees by name, and the plan waits for approval. */
    await fp.goto(BASE + '/family?view=fees&child=' + tobi, { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /Payment plan/, 40000);
    await fp.locator('.fp3x-go', { hasText: 'Set up a payment plan' }).click();
    await fp.locator('.fp3x-opt', { hasText: /^2/ }).first().click();
    await fp.locator('.fp3x-mode', { hasText: 'Every two weeks' }).click();
    await waitText(fp, /Instalment 2/, 20000);
    const planTxt = await fp.locator('section', { hasText: 'Payment plan' }).last().innerText();
    chk('plans: the parent sees two dated instalments from the server, two weeks apart, and the terms', /Instalment 1/.test(planTxt) && /Instalment 2/.test(planTxt) && /approves it/.test(planTxt));
    await fp.locator('.fp3x-go', { hasText: 'Ask NGG for this plan' }).click();
    await waitText(fp, /Type your full name/, 15000);
    chk('plans: no name, no plan — and the page says why', true);
    await fp.fill('.fp3x-field input', 'Ada Parent');
    await fp.locator('.fp3x-tick input').check();
    await settle(fp);
    await fp.screenshot({ path: path.join(SHOTS, 'family-plan-phone.png'), fullPage: true });
    await fp.locator('.fp3x-go', { hasText: 'Ask NGG for this plan' }).click();
    await waitText(fp, /Waiting for NGG to approve/, 30000);
    const plan = JSON.parse(php(`echo json_encode(db_row("SELECT status, count, cadence, agreedVia, signedName FROM fee_plans WHERE memberId = 'NGG-FU-KID' ORDER BY id DESC LIMIT 1"));`));
    chk('plans: the request is stored PENDING, as agreed in the app by the name typed', plan && plan.status === 'pending' && Number(plan.count) === 2 && plan.cadence === 'fortnightly' && plan.agreedVia === 'app' && plan.signedName === 'Ada Parent');
    php(`db_exec("DELETE FROM fee_plans WHERE memberId = 'NGG-FU-KID'");`);

    await fp.goto(BASE + '/family?view=fees&child=' + tobi, { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /Paid by transfer or at the desk/, 40000);
    await fp.locator('.fp3x-ghost', { hasText: 'I’ve paid' }).click();
    await fp.fill('.fp3x-form input >> nth=0', '2000');
    await fp.fill('.fp3x-form input >> nth=1', 'TRF-FU-7781');
    await fp.locator('.fp3x-form button[type=submit]').click();
    await waitText(fp, /Your payment is being checked/, 20000);
    chk('the parent confirms a transfer: a claim for the desk, marked as theirs, and the page says it is being checked',
      php(`echo json_encode(db_row("SELECT amount, reference, raisedBy <> '' fam FROM member_requests WHERE memberId = 'NGG-FU-KID' AND kind = 'payment'"));`) === '{"amount":2000,"reference":"TRF-FU-7781","fam":1}');

    /* ── Anchor Circle, in the family account: a parent on Growth ── */
    await fp.goto(BASE + '/family?view=growth&child=' + tobi, { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await fp.waitForSelector('.fp3x-anc-day', { timeout: 40000 });
    chk('a parent finds their child\'s Anchor week on Growth: the days and the stats', /Tobi’s Anchor week/.test(await bodyText(fp)) && (await fp.$$('.fp3x-anc-day')).length === 7);
    await fp.locator('.fp3x-anc-day:not([disabled])').last().click();
    await fp.waitForFunction(() => { const b = Array.from(document.querySelectorAll('.fp3x-anc-day:not([disabled])')).pop(); return b && b.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 10000 }).catch(() => {});
    chk('…confirms a day at home, saved as the parent\'s', php(`echo db_row("SELECT COUNT(*) c FROM circle_confirmations WHERE memberId = 'NGG-FU-KID' AND role = 'parent'")['c'];`) === '1');
    await fp.fill('.fp3x-anc-day ~ * textarea, .fp3x-form textarea', 'Lovely to see you reflecting every evening.');
    await fp.locator('.fp3x-form button[type=submit]', { hasText: 'Send to Tobi' }).click();
    await waitText(fp, /Your notes/, 15000);
    chk('…and leaves Tobi a note', php(`echo db_row("SELECT COUNT(*) c FROM circle_remarks WHERE memberId = 'NGG-FU-KID' AND role = 'parent'")['c'];`) === '1');
    await settle(fp);
    await fp.screenshot({ path: path.join(SHOTS, 'family-anchor-phone.png'), fullPage: true });



    const cctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cp = await cctx.newPage();
    cp.on('pageerror', e => errs.push('circle: ' + String(e).slice(0, 200)));
    await cp.goto(BASE + '/circle', { waitUntil: 'domcontentloaded' }); await waitForBoot(cp);
    await waitText(cp, /Anchor Circle has moved/, 30000);
    const cm = await bodyText(cp);
    chk('/circle says it has moved, and sends parents and mentors each to their place', /Parents and guardians/.test(cm) && !/Teachers/.test(cm) && /Mentors/.test(cm)
      && (await cp.$$('a[href="/family"]')).length >= 1 && (await cp.$$('a[href="/mentor"]')).length === 1);
    await settle(cp);
    await cp.screenshot({ path: path.join(SHOTS, 'circle-moved-phone.png'), fullPage: true });
    await cctx.close();

    /* ── The emailed link, on another device ── */
    const lctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const lp = await lctx.newPage();
    lp.on('pageerror', e => errs.push('link: ' + String(e).slice(0, 200)));
    await lp.goto(BASE + '/family', { waitUntil: 'domcontentloaded' }); await waitForBoot(lp);
    await lp.waitForSelector('input[type=email]', { timeout: 40000 });
    await lp.fill('input[type=email]', 'mum@example.org');
    await btn(lp, 'Email me a sign-in code').click();
    await lp.waitForSelector('input[autocomplete=one-time-code]');
    await lp.goto(BASE + '/family?fsignin=' + latestToken(), { waitUntil: 'domcontentloaded' }); await waitForBoot(lp);
    await waitText(lp, /Your children · 2/, 40000);
    chk('the emailed link signs in, and on a desktop the children are in the sidebar', true);
    chk('…and is stripped from the address bar', !/fsignin/.test(lp.url()));
    await settle(lp);
    await lp.screenshot({ path: path.join(SHOTS, 'family-desktop.png') });

    /* ── Sign out ── */
    await fp.goto(BASE + '/family?view=account', { waitUntil: 'domcontentloaded' }); await waitForBoot(fp);
    await waitText(fp, /Sign out on every device/, 40000);
    await btn(fp, /^Sign out$/).click();
    await fp.waitForSelector('input[type=email]', { timeout: 15000 });
    chk('signing out returns to the sign-in screen', !(await fctx.cookies()).find(c => c.name === 'ngg_sess_family' && c.value));
    const after = await get(BASE + '/api/family/ward.php?link=x', { Cookie: 'ngg_sess_family=' + fam.value });
    chk('…and an old copy of the cookie still reads nothing it is not linked to', after.status === 404 || after.status === 401);

    chk('no page errors on any screen', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (family UI)');
  process.exit(failed ? 1 : 0);
})();
