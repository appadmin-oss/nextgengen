#!/usr/bin/env node
/* ============================================================================
   Let in at the desk, from the USER's side, on the production build.

   Owner, 5 Nov 2026: "The security features are STILL not working. On the
   side of the User it does not work … We cannot even get past the first!"
   The earlier tests let a person in through the API, by a record id, from a
   first screen. Real people are stuck one screen later (the password or the
   emailed-code screen), type the email they always use (often a parent's,
   shared by siblings), and some are guardians on the family app. This signs
   in as each of them with NO session, NO password and NO emailed code — only
   the code staff made — and fails on any screen that offers no way to type it.

   Writes dist/api/config.php for the run and removes it after; refuses to run
   if one exists.   Run:  node build.js && node tests/desk-signin.test.js
   ========================================================================== */
'use strict';
const { execFileSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { waitForServer, waitForBoot } = require('./_serve');

const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'dist');
const PORT = process.env.DESK_PORT || '8337', BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(WEB, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-desk-'));
const DB = path.join(TMP, 'ngg.db');
const OUT = path.join(ROOT, 'tests', 'screens', 'desk-signin');

let seq = 0, server, browser, pass = 0, fail = 0;
function chk(label, ok, extra) { if (ok) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FAIL: ' + label + (extra ? ' — ' + extra : '')); } }
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(WEB + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`); fs.writeFileSync(f, code);
  return execFileSync('php', [f], { cwd: WEB }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
/** What the desk does: press "Let in for 10 minutes" on a row. Returns the result row ({code, signInAs, door}). */
const letIn = (who, id) => JSON.parse(php(`echo json_encode(admin_mfa_act(['requesterId' => 'NGG-DK-ADM', 'ip' => '', 'action' => 'bypass', 'people' => [['who' => '${who}', 'id' => '${id}']]])['results'][0]);`));

async function fresh(W, H) {
  const ctx = await browser.newContext({ viewport: { width: W || 1280, height: H || 900 } });
  const p = await ctx.newPage(); p.log = [];
  p.on('pageerror', e => p.log.push('page error: ' + e.message));
  return p;
}
async function memberDoor(p, ident, how) {
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await waitForBoot(p);
  await p.waitForSelector('#signin-idp', { timeout: 60000 });
  if (how === 'first') return;
  // Stuck one screen later: they typed their ID or email and pressed Continue.
  await p.fill('#signin-idp', ident);
  await p.click('.signin-card button[type="submit"]');
  await p.waitForSelector('#signin-pw, #signin-otp, .signin-otp, [id^="signin-otp"]', { timeout: 20000 }).catch(() => {});
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  desk sign-in: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('dist/api/config.php already exists — refusing to overwrite.'); process.exit(2); }
  if (!fs.existsSync(path.join(WEB, 'index.html'))) { console.error('no dist/ — run node build.js first'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CFG, `<?php return ['db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'desk_signin_e2e_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false, 'seed_bundled_curriculum' => false];\n`);
  try {
    php(`db_migrate(db_conn()); $now = now_iso();
      db_insert('members', ['memberId'=>'NGG-DK-ADM','fullName'=>'Desk Admin','email'=>'desk.admin@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','createdAt'=>$now,'updatedAt'=>$now]);
      // Two children on their mother's email; both have a password AND a private question.
      foreach ([['NGG-DK-1','Tobi Ade','026-611'],['NGG-DK-2','Kemi Ade','026-612']] as [$id,$n,$d]) {
        db_insert('members', ['memberId'=>$id,'fullName'=>$n,'email'=>'mum.ade@example.org','displayId'=>$d,'type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda',
          'passwordHash'=>password_hash_best('forgotten-pass-1'),'createdAt'=>$now,'updatedAt'=>$now]);
        mfa_put($id, 'mfa', ['type'=>'question','since'=>$now,'q'=>'What was the name of your first pet?','a'=>password_hash('bingo', PASSWORD_DEFAULT)]);
      }
      db_conn()->exec("INSERT INTO volunteers (volunteerId, fullName, email, role, status, programme, centre, createdAt) VALUES ('VOL-INS-26-611','Ife Instructor','ife.ins@example.org','instructor','active','ngg','Egbeda','2026-09-01T00:00:00Z')");
      db_insert('guardians', ['guardianId'=>'G-DK-1','email'=>'papa.ade@example.org','fullName'=>'Papa Ade','status'=>'active','sessionEpoch'=>1,'createdAt'=>$now,'updatedAt'=>$now]);
      echo 1;`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', WEB], { cwd: WEB, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    { const exe = require('./_responsive-probe').chromiumPath(require('fs'));   // either layout: chrome-linux/ or chrome-linux64/
      browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
    console.log('Let in at the desk, from the user’s side (production build):');

    // 0. Google's way: staff press Let in, the person types their email or ID, Continue — and is in.
    const kw = letIn('member', 'NGG-DK-2');
    let p = await fresh();
    await memberDoor(p, '', 'first');
    await p.fill('#signin-idp', 'mum.ade@example.org');
    await p.click('.signin-card button[type="submit"]');
    await p.waitForSelector('#signin-idp', { state: 'detached', timeout: 20000 }).catch(() => {});
    let me = await p.evaluate(() => fetch('/api/auth/me.php', { credentials: 'include' }).then(r => r.json()));
    chk('inside the 10 minutes, the email alone signs them in: no password, no code, no second step', JSON.stringify(me).includes('NGG-DK-2') && !/"mfaPending":"[a-z]/.test(JSON.stringify(me)), JSON.stringify(me).slice(0, 160));
    chk('…and they are taken to choose a new second step, without the old one, on a page that did not crash',
      await p.waitForSelector('.mfa-opt', { timeout: 20000 }).then(() => true, () => false) && !(await p.$('#mfa-cur')) && !/Hold on\./.test(await p.innerText('body')));
    await p.screenshot({ path: path.join(OUT, 'window-in.png') });
    chk('no page errors (window)', p.log.length === 0, p.log.join(' | '));
    await p.context().close();
    p = await fresh();
    await memberDoor(p, 'mum.ade@example.org', 'stuck');
    chk('ONE sign-in: the next person typing the same email gets the normal door (password), not a free pass', await p.locator('#signin-pw').count() === 1);
    chk('…and the code made with that let-in is spent too', (await p.evaluate(c => fetch('/api/auth/desk.php', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: '026-612', code: c }) }).then(r => r.status), kw.code)) >= 400);
    await p.context().close();

    // 1. Over the phone, after the window: a child stuck on the PASSWORD screen types the code they were read.
    const k = letIn('member', 'NGG-DK-2');
    php(`$b = mfa_get('NGG-DK-2', 'mfa.bypass'); $b['until'] = time() - 1; mfa_put('NGG-DK-2', 'mfa.bypass', $b); echo 1;`);
    chk('the desk gets a code and the ID to read out', /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(k.code || '') && k.signInAs === '026-612' && k.door === 'main');
    p = await fresh();
    await memberDoor(p, 'mum.ade@example.org', 'stuck');
    const stuckTxt = await p.innerText('.signin-card');
    chk('stuck one screen in, the way out is right there: “Got a code from staff? Enter it”', await p.locator('.signin-card .signin-staff button:has-text("Enter it")').count() === 1, stuckTxt.slice(0, 200));
    await p.click('.signin-card .signin-staff button:has-text("Enter it")');
    chk('…which keeps what they typed', (await p.inputValue('#signin-desk-id')) === 'mum.ade@example.org');
    await p.fill('#signin-desk-code', 'WXYZ-2345');
    await p.click('.signin-card button[type="submit"]');
    chk('a wrong code is refused, in words', await p.waitForFunction(() => /don’t match, or the code has expired/.test((document.querySelector('.signin-ferr') || {}).innerText || ''), null, { timeout: 15000 }).then(() => true, () => false));
    await p.fill('#signin-desk-code', k.code.toLowerCase().replace('-', ' '));
    await p.click('.signin-card button[type="submit"]');
    await p.waitForSelector('#signin-desk-code', { state: 'detached', timeout: 20000 }).catch(() => {});
    me = await p.evaluate(() => fetch('/api/auth/me.php', { credentials: 'include' }).then(r => r.json()));
    chk('the shared family email and the code sign in the child the code was made for: no password, no question',
      ((me.member || me.data && me.data.member || {}).memberId || JSON.stringify(me)).includes('NGG-DK-2') && !(me.mfaPending || (me.data || {}).mfaPending));
    const setup = await p.waitForSelector('.mfa-opt', { timeout: 20000 }).then(() => true, () => false);
    chk('…and they are taken to choose a new second step, without the old one, on a page that did not crash',
      setup && !(await p.$('#mfa-cur')) && !/Hold on\./.test(await p.innerText('body')), (await p.innerText('body')).slice(0, 300));
    await p.screenshot({ path: path.join(OUT, 'member-in.png') });
    chk('no page errors (member)', p.log.length === 0, p.log.join(' | '));
    await p.context().close();

    // 2. On a phone, by the number printed on the card, from the very first screen.
    const k1 = letIn('member', 'NGG-DK-1');
    p = await fresh(390, 844);
    await memberDoor(p, '', 'first');
    // The start-up splash fades over the first screen; a person cannot press through it either.
    await p.waitForFunction(() => { const b = document.getElementById('ngg-boot'); return !b || b.classList.contains('gone'); }, null, { timeout: 30000 });
    await p.screenshot({ path: path.join(OUT, 'phone-first.png') });
    await p.click('.signin-card .signin-pair button:has-text("From staff")');   // first screen: "Already have a code?"
    // Type until the form holds it (as a person would retype a field the page cleared while it finished loading).
    for (let t = 0; t < 3; t++) {
      await p.fill('#signin-desk-id', '026 611');
      await p.fill('#signin-desk-code', k1.code);
      if (await p.waitForFunction(() => { const b = document.querySelector('.signin-card button[type=submit]'); return b && !b.disabled; }, null, { timeout: 3000 }).then(() => true, () => false)) break;
    }
    await p.click('.signin-card button[type="submit"]');
    await p.waitForSelector('#signin-desk-code', { state: 'detached', timeout: 20000 }).catch(() => {});
    me = await p.evaluate(() => fetch('/api/auth/me.php', { credentials: 'include' }).then(r => r.json()));
    chk('on a phone, the printed card number and the code sign them in', JSON.stringify(me).includes('NGG-DK-1'));
    await p.context().close();

    // 3. An instructor, let in for 10 minutes: their email alone, then Continue.
    letIn('volunteer', 'VOL-INS-26-611');
    p = await fresh();
    await memberDoor(p, 'ife.ins@example.org', 'stuck');
    me = await p.evaluate(() => fetch('/api/auth/me.php', { credentials: 'include' }).then(r => r.json()));
    chk('an instructor let in for 10 minutes gets in on their email alone', JSON.stringify(me).includes('VOL-INS-26-611'), JSON.stringify(me).slice(0, 200));
    await p.context().close();

    // 4. A guardian, on the family app.
    const kg = letIn('guardian', 'G-DK-1');
    chk('a guardian’s code names the family app as the door', kg.door === 'family' && kg.signInAs === 'papa.ade@example.org');
    p = await fresh(390, 844);
    await p.goto(BASE + '/family', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p);
    await p.waitForSelector('button:has-text("I have a code from staff")', { timeout: 60000 });
    await p.click('button:has-text("I have a code from staff")');
    await p.fill('input[type="email"]', 'papa.ade@example.org');
    await p.fill('input[placeholder="XXXX-XXXX"]', kg.code);
    await p.click('button:has-text("Sign in")');
    const fam = await p.waitForFunction(() => fetch('/api/family/me.php', { credentials: 'include' }).then(r => r.json()).then(j => JSON.stringify(j).includes('G-DK-1')), null, { timeout: 20000, polling: 1000 }).then(() => true, () => false);
    chk('the guardian gets into the family app with their email and the code', fam);
    await p.screenshot({ path: path.join(OUT, 'family-in.png') });
    chk('no page errors (family)', p.log.length === 0, p.log.join(' | '));
    await p.context().close();

    // 4b. A guardian let in for 10 minutes: their email, "Email me a sign-in code" — and they are in.
    letIn('guardian', 'G-DK-1');
    p = await fresh(390, 844);
    await p.goto(BASE + '/family', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p);
    await p.waitForSelector('input[type="email"]', { timeout: 60000 });
    await p.fill('input[type="email"]', 'papa.ade@example.org');
    await p.click('button:has-text("Email me a sign-in code")');
    const famW = await p.waitForFunction(() => fetch('/api/family/me.php', { credentials: 'include' }).then(r => r.json()).then(j => JSON.stringify(j).includes('G-DK-1')), null, { timeout: 20000, polling: 1000 }).then(() => true, () => false);
    chk('a guardian let in for 10 minutes gets into the family app on their email alone', famW);
    await p.context().close();

    // 5. A code is good once.
    p = await fresh();
    await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    const again = await p.evaluate(c => fetch('/api/auth/desk.php', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: '026-612', code: c }) }).then(r => r.status), k.code);
    chk('the same code does not work a second time', again >= 400);
    await p.context().close();
  } catch (e) { fail++; console.error('  ✗ FAIL: ' + (e && e.stack || e)); }
  finally { if (browser) await browser.close(); cleanup(); }
  console.log((fail ? '\n❌ FAIL: ' : '\n✅ PASS: ') + pass + ' passed, ' + fail + ' failed (desk sign-in, user side)');
  process.exit(fail ? 1 : 0);
})();
