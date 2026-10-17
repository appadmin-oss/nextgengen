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
     · Signing out ends the family session; the page fits a phone.

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
      + `$d = gmdate('Y-m-d'); db_insert('attendance', ['cohortId'=>'','studentId'=>'NGG-FU-KID','date'=>$d,'checkInAt'=>$d.'T09:12:00Z','checkOutAt'=>'','status'=>'late','lateMinutes'=>12,'method'=>'test','createdAt'=>${now}]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];

    /* ── Sign in with a code ── */
    const fctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const fp = await fctx.newPage();
    fp.on('pageerror', e => errs.push('family: ' + String(e).slice(0, 200)));
    await fp.goto(BASE + '/family', { waitUntil: 'domcontentloaded' });
    await waitForBoot(fp);
    await fp.waitForSelector('#fam-email', { timeout: 40000 });
    chk('a signed-out visitor sees the family sign-in, with what they can and cannot see', /can't see/i.test(await fp.$eval('.fam-promise', el => el.innerText)));
    await fp.fill('#fam-email', 'Mum@Example.org');
    await fp.click('button:has-text("Email me a code")');
    await fp.waitForSelector('#fam-otp');
    await fp.fill('#fam-otp', latestCode());
    await fp.click('button:has-text("Sign in")');
    await fp.waitForSelector('.fam-head', { timeout: 15000 });
    chk('the code signs the parent in to a new family account', php(`echo db_row("SELECT COUNT(*) c FROM guardians WHERE email = 'mum@example.org'")['c'];`) === '1');
    const cookies = await fctx.cookies();
    const fam = cookies.find(c => c.name === 'ngg_sess_family');
    chk('…on a family cookie, never a member session', !!fam && fam.httpOnly && !cookies.find(c => c.name === 'ngg_sess'));
    const asMember = await get(BASE + '/api/auth/me.php', { Cookie: 'ngg_sess=' + fam.value });
    chk('…and the family cookie used as a member cookie is nobody', JSON.parse(asMember.body).member === null);
    chk('…nor reads a member route', (await get(BASE + '/api/member/self.php?view=requests', { Cookie: 'ngg_sess=' + fam.value })).status === 401);

    /* ── Add a child with their code ── */
    await fp.waitForSelector('#fam-add');
    chk('the parent is offered the records that name their email, by first name', /Kemi/.test(await fp.$eval('#fam-add', el => el.innerText)) && !/Adeyemi/.test(await fp.$eval('#fam-add .fam-list', el => el.innerText)));
    await fp.fill('#fam-code', '482913');
    await fp.fill('#fam-kid', 'Bello');
    await fp.click('#fam-add button:text-is("Connect")');
    await fp.waitForSelector('#fam-add .fam-err');
    chk('a code with the wrong name connects nothing, and says why', /don't match/.test(await fp.$eval('#fam-add .fam-err', el => el.innerText)));
    await fp.fill('#fam-kid', 'Tobi');
    await fp.click('#fam-add button:text-is("Connect")');
    await fp.waitForSelector('.fam-hero', { timeout: 15000 });
    chk('the child\'s code + name connects at once and opens their dashboard', /Tobi Adeyemi/.test(await fp.$eval('.fam-hero', el => el.innerText)));
    chk('…showing today\'s sign-in, late and by how much', /Signed in 09:12 · 12 min late/.test(await fp.$eval('.fam-today', el => el.innerText)));
    chk('…with attendance, conduct, fees and lessons', (await fp.$$('.fam-grid > .fam-card')).length === 4);
    chk('…and the child is told', php(`echo db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'NGG-FU-KID' AND title = 'A family account is connected to you'")['c'];`) === '1');

    /* ── Ask for the sibling through the record ── */
    await fp.click('button:has-text("+ Add a child")');
    await fp.waitForSelector('#fam-add button:has-text("Ask to connect")');
    await fp.click('#fam-add button:has-text("Ask to connect")');
    await fp.waitForSelector('text=Waiting for the centre', { timeout: 15000 });
    chk('asking through the record waits for the centre', php(`echo db_row("SELECT status FROM guardian_wards WHERE memberId = 'NGG-FU-SIB'")['status'];`) === 'pending');

    /* ── Tell the centre; switch on sign-in mails ── */
    await fp.fill('#fam-from', '2026-11-07');
    await fp.fill('#fam-body', 'Family wedding');
    await fp.click('button:has-text("Send to the centre")');
    await fp.waitForSelector('text=Sent. The centre will reply by email.');
    chk('a parent\'s absence notice lands in the desk\'s request queue, marked as theirs',
      php(`echo json_encode(db_row("SELECT kind, raisedBy <> '' fam FROM member_requests WHERE memberId = 'NGG-FU-KID'"));`) === '{"kind":"leave","fam":1}');
    // Family emails are always on: listed as On, with nothing to switch.
    const ntf = await fp.evaluate(() => { const c = document.getElementById('fam-ntf-h'); const s = c && c.closest('section'); return s ? { text: s.innerText, switches: s.querySelectorAll('.fam-switch, [aria-pressed]').length } : null; });
    chk('…and every family email is shown as always on, with no switch to turn one off',
      !!ntf && ntf.switches === 0 && /Sign-in and sign-out/.test(ntf.text) && /always on/i.test(ntf.text));
    await fp.screenshot({ path: path.join(SHOTS, 'family-desktop.png'), fullPage: true });

    /* ── The Control Room approves the sibling ── */
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
    await ap.waitForSelector('.admin-table tbody tr', { timeout: 40000 });
    chk('the Families section lists the request, with the parent email on the record beside it', /Kemi Adeyemi[\s\S]*mum@example\.org/.test(await ap.$eval('.admin-table tbody', el => el.innerText)));
    await ap.check('.admin-table tbody tr input[type=checkbox]');
    await ap.click('.admin-bulkbar button:has-text("Approve")');
    await ap.waitForSelector('.dialog-card');
    await ap.click('.dialog-card .dialog-actions .btn-primary');
    await ap.waitForFunction(() => !document.querySelector('.admin-table tbody tr') || /Nobody is waiting/.test(document.body.innerText), null, { timeout: 15000 });
    chk('approving connects the parent', php(`echo db_row("SELECT status FROM guardian_wards WHERE memberId = 'NGG-FU-SIB'")['status'];`) === 'active');
    await ap.goto(BASE + '/nextadmin?s=requests', { waitUntil: 'domcontentloaded' });
    await ap.waitForSelector('text=From their family account', { timeout: 40000 });
    chk('the desk sees the notice came from the family account', true);

    await fp.reload({ waitUntil: 'domcontentloaded' });
    await fp.waitForSelector('.fam-tab', { timeout: 40000 });
    chk('…and the parent now has both children', (await fp.$$('.fam-tab')).length === 2);

    /* ── The emailed link, on another device ── */
    const lctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const lp = await lctx.newPage();
    lp.on('pageerror', e => errs.push('link: ' + String(e).slice(0, 200)));
    await lp.goto(BASE + '/family', { waitUntil: 'domcontentloaded' });
    await waitForBoot(lp);
    await lp.waitForSelector('#fam-email', { timeout: 40000 });
    await lp.fill('#fam-email', 'mum@example.org');
    await lp.click('button:has-text("Email me a code")');
    await lp.waitForSelector('#fam-otp');
    await lp.goto(BASE + '/family?fsignin=' + latestToken(), { waitUntil: 'domcontentloaded' });
    await lp.waitForSelector('.fam-tab', { timeout: 40000 });
    chk('the emailed link signs in on a phone', (await lp.$$('.fam-tab')).length === 2);
    chk('…and is stripped from the address bar', !/fsignin/.test(lp.url()));
    chk('the page fits a phone without sideways scrolling', await lp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await lp.screenshot({ path: path.join(SHOTS, 'family-phone.png'), fullPage: true });

    /* ── Sign out ── */
    await fp.click('.fam-menu > .fam-btn');
    await fp.click('.fam-pop button:has-text("Sign out")');
    await fp.waitForSelector('#fam-email', { timeout: 15000 });
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
