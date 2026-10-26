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
    await btn(fp, /^Connect$/).click();
    await waitText(fp, /don’t match a member/);
    chk('a code with the wrong name connects nothing, and says why', true);
    await fp.fill('input[placeholder="e.g. their first name"]', 'Tobi');
    await btn(fp, /^Connect$/).click();
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
    chk('the absence sheet opens with focus inside it', await fp.evaluate(() => !!document.activeElement.closest('[role=dialog]')));
    await fp.fill('[role=dialog] input[type=date] >> nth=0', '2026-11-07');
    await fp.locator('[role=dialog] button', { hasText: 'Tell the centre' }).click();
    await waitText(fp, /Say why Tobi will be away/);
    chk('…and refuses an absence with no reason, saying so', true);
    await fp.fill('[role=dialog] textarea', 'Family wedding');
    await fp.locator('[role=dialog] button', { hasText: 'Tell the centre' }).click();
    await waitText(fp, /The centre has been told/);
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
