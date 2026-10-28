#!/usr/bin/env node
/* ============================================================================
   Sign-in for the team, and two-step sign-in (api/_lib/domain/mfa.php,
   src/modules/auth/mfa.jsx), end to end through the real routes and screens:

   - an instructor signs in at the main door with their card number and an
     emailed code (they used to be turned away as "not a member ID");
   - a session still owing its second step is refused everywhere but the step;
   - a member signs in and is asked their private question; a wrong answer is
     refused, the right one opens the portal;
   - a coordinator lets a child who forgot their answer in for ten minutes;
   - the team, required by policy, sets up an authenticator app at sign-in;
   - the alert shows for someone with no second step, and setting one up from
     it clears it;
   - the Control Room desk lists who has it and changes the policy.

   Run:  node tests/mfa.test.js     (MFA_SHOTS=dir for screenshots)
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MFA_PORT || '8319';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mfa-'));
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
/* RFC 6238, as an authenticator app computes it. */
function totp(secretB32, at) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/[^A-Z2-7]/gi, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeUInt32BE(Math.floor((at || Date.now()) / 30000), 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
}

let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
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
const otpFor = id => q(`(string)(db_row("SELECT otp FROM auth_sessions WHERE memberId = '${id}' ORDER BY id DESC LIMIT 1")['otp'] ?? '')`);
async function typeCode(pg, sel, code) { await pg.click(sel); await pg.keyboard.type(code, { delay: 20 }); }

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  mfa: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'mfa_e2e_secret_portal_x_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`
      $now = now_iso();
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@mfa.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk('NGG-MF-ADM', 'Ada Admin', 'super_admin', ['totpSecret' => 'JBSWY3DPEHPK3PXP']);
      $mk('NGG-MF-K1', 'Kemi Okoro', 'member', ['displayId' => '026-501']);
      $mk('NGG-MF-K2', 'Bayo Adeyemi');
      $mk('NGG-MF-K3', 'Zainab Bello');
      db_insert('volunteers', ['volunteerId' => 'VOL-INS-26-501', 'fullName' => 'Tunde Instructor', 'email' => 'tunde.ins@mfa.example', 'phone' => '08031234567', 'role' => 'instructor', 'centre' => 'Egbeda', 'status' => 'active', 'createdAt' => $now, 'updatedAt' => $now]);
      mfa_enroll_finish(['requesterId' => 'NGG-MF-K1', 'who' => 'member', 'type' => 'question', 'question' => MFA_QUESTIONS[0], 'answer' => 'Mrs Okafor']);
      mfa_enroll_finish(['requesterId' => 'NGG-MF-K2', 'who' => 'member', 'type' => 'question', 'question' => MFA_QUESTIONS[2], 'answer' => 'Rex the dog']);
      echo 'ok';
    `);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const shot = (pg, n) => pg.screenshot({ path: (process.env.MFA_SHOTS || TMP) + '/' + n + '.png' });

    // ── 1. The instructor at the main door, by card number + emailed code (routes only) ──
    const api = await fresh();
    let r = await post(api, '/auth/gateway.php', { identifier: 'vol-ins-26-501' });
    chk('the main door accepts a volunteer card number (was bad_identifier_format)', r.ok() && (await r.json()).methods.includes('code'));
    r = await post(api, '/auth/request.php', { identifier: 'VOL-INS-26-501' });
    chk('and emails the instructor a code', r.ok() && otpFor('VOL-INS-26-501').length === 6);
    r = await post(api, '/auth/verify.php', { memberId: 'VOL-INS-26-501', otp: otpFor('VOL-INS-26-501') });
    const vj = await r.json();
    chk('the code signs them in as a volunteer, with their portal named', r.ok() && vj.member && vj.member.type === 'VOLUNTEER' && vj.member.memberId === 'VOL-INS-26-501' && vj.mfa === '');
    r = await api.request.get(BASE + '/api/auth/me.php');
    chk('and the session holds: /auth/me knows them', ((await r.json()).member || {}).memberId === 'VOL-INS-26-501');
    r = await post(api, '/auth/student-login.php', { displayId: 'vol-ins-26-501', phone: '+234 803 123 4567' });
    chk('the card door matches the card number whatever its case', r.ok() || console.error('   ', r.status(), await r.text()));

    // ── 2. A member owing their question: refused everywhere but the step ──
    const kq = await fresh();
    await post(kq, '/auth/request.php', { identifier: 'kemi.okoro@mfa.example' });
    r = await post(kq, '/auth/verify.php', { memberId: '026-501', otp: otpFor('NGG-MF-K1') });
    const kj = await r.json();
    chk('a member signing in by their card number is told they owe their question', r.ok() && kj.mfa === 'question');
    r = await kq.request.get(BASE + '/api/member/today.php');
    chk('every other route answers mfa_required until it is answered', r.status() === 401 && (await r.json()).error === 'mfa_required');
    r = await kq.request.get(BASE + '/api/auth/me.php');
    chk('/auth/me says which step is owed', (await r.json()).mfaPending === 'question');
    await kq.close();

    // ── 3. The same, on screen: the sign-in modal, then the question ──
    const kid = await fresh();
    await kid.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await waitForBoot(kid);
    await kid.waitForSelector('#signin-idp', { timeout: 60000 });
    await kid.fill('#signin-idp', 'kemi.okoro@mfa.example');
    await kid.click('.signin-card button[type="submit"]');
    /* A browser that has not signed in before gets the same screen for every
       address (password, or a code) — so the member asks for the code. */
    await kid.waitForSelector('#signin-pw', { timeout: 20000 });
    chk('a new browser is shown the same first screen for every account: password, or a code', /No password\? Email me a sign-in code/.test(await kid.innerText('.signin-alts')));
    await kid.click('.signin-alts button');
    await kid.waitForSelector('#signin-otp', { timeout: 20000 });
    await typeCode(kid, '#signin-otp', otpFor('NGG-MF-K1'));
    await kid.waitForSelector('.mfa-q', { timeout: 20000 });
    chk('after the emailed code, the screen asks the member their question', /One more question/.test(await kid.innerText('#mfa-h')) && /first teacher/.test(await kid.innerText('.mfa-q')));
    await shot(kid, 'mfa-question');
    await kid.fill('#mfa-ans', 'Mr Bello');
    await kid.click('.signin-card button[type="submit"]');
    await kid.waitForSelector('.signin-ferr', { timeout: 10000 });
    chk('a wrong answer is refused, on the screen', /isn’t right/.test(await kid.innerText('.signin-ferr')));
    await kid.fill('#mfa-ans', '  mrs. OKAFOR ');
    await kid.click('.signin-card button[type="submit"]');
    await kid.waitForSelector('#mfa-h', { state: 'detached', timeout: 20000 });
    r = await kid.request.get(BASE + '/api/member/today.php');
    chk('the right answer (in any case and spacing) opens everything', r.status() === 200);
    chk('no page errors (member sign-in)', kid.errs.length === 0);
    if (kid.errs.length) console.error(kid.errs.join('\n'));

    // ── 4. A child who forgot their answer, let in by the desk ──
    const k2 = await fresh();
    await post(k2, '/auth/request.php', { identifier: 'bayo.adeyemi@mfa.example' });
    await post(k2, '/auth/verify.php', { memberId: 'bayo.adeyemi@mfa.example', otp: otpFor('NGG-MF-K2') });
    await k2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(k2);
    await k2.waitForSelector('.mfa-q', { timeout: 60000 });
    chk('a reload while the step is owed opens it again', /pet or favourite toy/.test(await k2.innerText('.mfa-q')));
    const desk = await as('NGG-MF-ADM', true);
    r = await post(desk, '/admin/mfa.php', { action: 'bypass', people: [{ id: 'NGG-MF-K2', who: 'member' }], minutes: 10 });
    chk('a coordinator lets the child in for ten minutes', r.ok() && (await r.json()).applied === 1);
    await k2.click('button:has-text("I’ve been let in by staff")');
    await k2.waitForSelector('#mfa-h', { state: 'detached', timeout: 20000 });
    r = await k2.request.get(BASE + '/api/member/today.php');
    chk('and the child is in without the answer', r.status() === 200);
    await k2.close();

    // ── 5. Policy: the team must have it; the instructor sets up an app at sign-in ──
    r = await post(desk, '/admin/mfa.php', { action: 'policy', policy: { team: 'required' } });
    chk('a super admin requires a second step of the team', r.ok() && (await r.json()).policy.team === 'required');
    const ins = await fresh();
    r = await post(ins, '/auth/student-login.php', { displayId: 'VOL-INS-26-501', phone: '08031234567' });
    chk('the card sign-in now owes setting one up', r.ok() && (await r.json()).mfa === 'enroll');
    await ins.goto(BASE + '/community', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ins);
    await ins.waitForSelector('.mfa-opt', { timeout: 60000 });
    const opts = await ins.$$eval('.mfa-opt b', els => els.map(e => e.textContent));
    chk('the team are offered an authenticator app, an emailed code or a PIN', opts.join('|') === 'An authenticator app|A code by email|A 6-digit PIN');
    chk('and it cannot be closed', !(await ins.isVisible('.signin-close')));
    await ins.click('.mfa-opt:has-text("authenticator app")');
    await ins.waitForSelector('.mfa-key', { timeout: 15000 });
    await ins.waitForSelector('.mfa-qr svg', { timeout: 15000 }).catch(() => {});
    chk('a QR code and a typed key are shown', await ins.isVisible('.mfa-qr svg'));
    await shot(ins, 'mfa-app-setup');
    const secret = (await ins.innerText('.mfa-key')).replace(/Setup key:|\s/g, '');
    await typeCode(ins, '#mfa-app', totp(secret));
    await ins.click('.signin-card button[type="submit"]');
    await ins.waitForSelector('.mfa-codes li', { timeout: 20000 });
    const backup = await ins.$$eval('.mfa-codes li', els => els.map(e => e.textContent.trim()));
    chk('setting it up shows eight one-time backup codes, once', backup.length === 8 && /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(backup[0]));
    await shot(ins, 'mfa-backup-codes');
    await ins.click('button:has-text("I’ve saved them")');
    await ins.waitForSelector('#mfa-h', { state: 'detached', timeout: 20000 });
    chk('the code from the app turns it on and opens the portal', q(`mfa_enrolment('VOL-INS-26-501')['type'] ?? ''`) === 'app');
    r = await post(ins, '/auth/student-login.php', { displayId: 'VOL-INS-26-501', phone: '08031234567' });
    const nx = await r.json();
    chk('the next card sign-in asks for the app', nx.mfa === 'app' || console.error('   ', JSON.stringify(nx)));
    r = await post(ins, '/auth/mfa.php', { action: 'verify', answer: totp(secret) });
    chk('and the app code passes it', r.ok());
    // Lost phone: a backup code on the screen instead.
    r = await post(ins, '/auth/student-login.php', { displayId: 'VOL-INS-26-501', phone: '08031234567' });
    await ins.goto(BASE + '/community', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ins);
    await ins.waitForSelector('#mfa-h', { timeout: 60000 });
    await ins.click('button:has-text("Use a backup code")');
    await ins.fill('#mfa-bk', backup[0].toLowerCase());
    await ins.click('.signin-card button[type="submit"]');
    await ins.waitForSelector('#mfa-h', { state: 'detached', timeout: 20000 });
    chk('a backup code opens the portal when the phone is not to hand', (await ins.request.get(BASE + '/api/auth/me.php').then(x => x.json())).mfaPending === '');
    chk('…and is spent', q(`mfa_backup_left('VOL-INS-26-501')`) === 7);
    chk('no page errors (instructor)', ins.errs.length === 0);
    if (ins.errs.length) console.error(ins.errs.join('\n'));

    // ── 6. The alert for someone with none, and setting it up from it ──
    const k3 = await as('NGG-MF-K3', false, true);
    await k3.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(k3);
    await k3.waitForSelector('.mfa-nudge', { timeout: 60000 });
    chk('a member with no second step is shown the alert', /no second sign-in step/.test(await k3.innerText('.mfa-nudge')));
    await shot(k3, 'mfa-nudge');
    await k3.click('.mfa-nudge-go');
    await k3.waitForSelector('.mfa-opt', { timeout: 15000 });
    const mopts = await k3.$$eval('.mfa-opt b', els => els.map(e => e.textContent));
    chk('a member may choose a question, a PIN, an app or an emailed code', mopts.join('|') === 'A private question|A 6-digit PIN|An authenticator app|A code by email');
    await k3.click('.mfa-opt:has-text("private question")');
    await k3.waitForSelector('#mfa-new', { timeout: 15000 });
    await k3.fill('#mfa-new', 'Ibadan grammar');
    await k3.fill('#mfa-new2', 'ibadan  grammar');
    await k3.click('.signin-card button[type="submit"]');
    await k3.waitForSelector('.mfa-codes li', { timeout: 15000 });
    await k3.click('button:has-text("I’ve saved them")');
    await k3.waitForSelector('.mfa-toast', { timeout: 15000 });
    chk('setting a question from the alert turns it on', q(`mfa_enrolment('NGG-MF-K3')['type'] ?? ''`) === 'question');
    await k3.waitForSelector('.mfa-nudge', { state: 'detached', timeout: 15000 });
    chk('and the alert goes away', !(await k3.isVisible('.mfa-nudge')));
    chk('no page errors (alert)', k3.errs.length === 0);
    if (k3.errs.length) console.error(k3.errs.join('\n'));

    // ── 7. The Control Room desk ──
    await desk.goto(BASE + '/control/members/security', { waitUntil: 'domcontentloaded' });
    await waitForBoot(desk);
    await desk.waitForSelector('.mfa-desk table', { timeout: 60000 });
    const body = await desk.innerText('.mfa-desk');
    chk('the desk lists members and the second step each has', /Kemi Okoro/.test(body) && /Private question/.test(body) && !/Ada Admin/.test(body));
    await desk.click('.mfa-desk-kind:has-text("Instructors")');
    await desk.waitForFunction(() => /Tunde Instructor/.test(document.querySelector('.mfa-desk').innerText), null, { timeout: 15000 });
    chk('and the team, with the app', /Authenticator app/.test(await desk.innerText('.mfa-desk table')));
    await desk.click('.mfa-desk-kind:has-text("Members")');
    await desk.selectOption('.mfa-desk-filters select', 'none');
    await desk.waitForFunction(() => document.querySelectorAll('.mfa-desk tbody tr').length === 0 || !/Kemi Okoro/.test(document.querySelector('.mfa-desk').innerText), null, { timeout: 15000 });
    chk('filtering to “no second step yet” leaves out those who have one', !/Kemi Okoro/.test(await desk.innerText('.mfa-desk')));
    await desk.click('.mfa-desk-policy summary');
    const memKind = desk.locator('.mfa-desk-policy-kind').filter({ hasText: 'Members' });
    await memKind.locator('.mfa-desk-method:has-text("Emailed code") input').uncheck();
    await desk.click('button:has-text("Save the policy")');
    await desk.waitForFunction(() => /applies from each person/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    chk('the desk chooses which ways each kind may use', JSON.stringify(q(`mfa_methods_for('member')`)) === JSON.stringify(['question', 'pin', 'app']));
    await shot(desk, 'mfa-desk');
    chk('no page errors (desk)', desk.errs.length === 0);
    if (desk.errs.length) console.error(desk.errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (mfa)` : `✅ PASS: ${passed} passed, 0 failed (mfa)`));
  process.exit(failed ? 1 : 0);
})();
