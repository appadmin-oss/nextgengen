#!/usr/bin/env node
/* ============================================================================
   The registration checklist (Control Room → Members → Registration, the
   Mentor Portal's My registrations, and the member's Me), end to end.

   The promises: a member nobody can be found for is listed as such (one who
   can be found is given a helper by itself, and the list says so); the supervisors
   offered are the server's, from real presence at the member's centre, with
   the reasons in words; assigning one from the suggestions is recorded and
   audited once; the supervisor finds the member in My registrations, and an
   item that needs them at the centre is verified because they checked in
   there today; an item the record decides is not ticked by asking; and the
   member sees how far along they are and who is helping, by first name.

   Run:  node tests/registration-checklist.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RC_PORT || '8314';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-rc-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-RC-ADM', MEM = 'NGG-RC-MEM', SUP = 'NGG-RC-SUP';
const CSRF = 'rc-csrf-0123456789abcdef';

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet;
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
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  registration checklist: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'registration_checklist_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());
      $now = now_iso(); $today = attendance_today();
      db_insert('centres', ['centreId'=>'CEN-RC-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','programmes'=>'ngg','createdAt'=>$now]);
      $mk = fn($id, $name, $role = 'member') => db_insert('members', ['memberId'=>$id,'fullName'=>$name,'email'=>strtolower(str_replace(' ', '.', $name)).'@example.org','type'=>'NGG','status'=>'active','role'=>$role,'centre'=>'Egbeda','centreId'=>'CEN-RC-1','createdAt'=>$now,'updatedAt'=>$now] + ($role === 'super_admin' ? ['totpSecret'=>'JBSWY3DPEHPK3PXP'] : []));
      $mk('${ADMIN}', 'Adaeze Okafor', 'super_admin');
      $mk('${MEM}', 'Tobi Adeyemi');
      $mk('${SUP}', 'Ngozi Eke');
      db_insert('mentors', ['mentorId'=>'MEN-RC-1','fullName'=>'Ngozi Eke','email'=>'ngozi.eke@example.org','status'=>'active','centre'=>'Egbeda','centreId'=>'CEN-RC-1','tracks'=>'tech',
        'programme'=>'ngg','memberId'=>'${SUP}','checkedAt'=>$now,'maxMentees'=>8,'createdAt'=>$now]);
      foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId'=>'MEN-RC-1','moduleId'=>$mod,'score'=>100,'passedAt'=>$now]);
      db_insert('mentor_policy', ['mentorId'=>'MEN-RC-1','policyVersion'=>MS_POLICY_VERSION,'signedName'=>'x','acceptedAt'=>$now]);
      // Tobi's checklist starts before anybody has been seen at Egbeda, so nobody can be chosen for him automatically.
      rcl_start(db_row("SELECT * FROM members WHERE memberId = '${MEM}'"), '${ADMIN}');
      // Ngozi checked in at Egbeda on four of the last five Saturdays, and today.
      $sats = rcl_saturdays($today, 5);
      foreach ([1, 2, 3, 4] as $i) db_insert('attendance', ['cohortId'=>'','studentId'=>'${SUP}','date'=>$sats[$i],'checkInAt'=>$sats[$i].'T08:00:00Z','method'=>'gate','status'=>'present','lateMinutes'=>0,'centreId'=>'CEN-RC-1','createdAt'=>$now]);
      db_insert('attendance', ['cohortId'=>'','studentId'=>'${SUP}','date'=>$today,'checkInAt'=>$today.'T08:00:00Z','method'=>'gate','status'=>'present','lateMinutes'=>0,'centreId'=>'CEN-RC-1','createdAt'=>$now]);
      admin_regcheck_item_save(['requesterId'=>'${ADMIN}','title'=>'Welcome talk given','help'=>'Walk the family through a Saturday.','evidence'=>'none','presence'=>true]);
      rcl_refresh(['${MEM}']);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const tok = (id, adm) => php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), ${adm ? 'true' : 'false'});`);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    browser = await launch();
    const errs = [];
    const open = async (id, adm, at, w = 1440, h = 1000) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addCookies([{ name: 'ngg_sess', value: tok(id, adm), domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: CSRF, domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };

    console.log('Control Room → Members → Registration');
    const P = await open(ADMIN, true, '/control/members/reg-checklist');
    chk('the new member is listed with nobody helping', await until(P, () => /Tobi Adeyemi/.test(document.body.innerText) && /Needs a supervisor/.test(document.body.innerText) && /Nobody helping yet/.test(document.body.innerText), null, 60000));
    chk('the record’s own items and the item staff added are both shown', await until(P, () => /From the record/.test(document.body.innerText) && /Welcome talk given/.test(document.body.innerText) && /Guardian linked/.test(document.body.innerText)));
    await P.click('tr:has-text("Tobi Adeyemi")');
    chk('her checklist opens in a drawer: what is left, nobody helping', await until(P, () => { const t = (document.querySelector('[role="dialog"]') || {}).innerText || ''; return /Still to do/.test(t) && /Welcome talk given/.test(t) && /Nobody yet/.test(t); }));
    await P.click('[role="dialog"] button:has-text("Assign a supervisor")');
    chk('the suggestions come from the server, with the reasons in words', await until(P, () => { const t = (document.querySelector('[role="dialog"]') || {}).innerText || '';
      return /Who can help Tobi Adeyemi/.test(t) && /Ngozi Eke · Mentor/.test(t) && /Checked in at Egbeda on \d of the last 5 Saturdays/.test(t) && /No members to support yet/.test(t) && /Safeguarding cleared/.test(t); }));
    await P.click('[role="dialog"] .cr-list-row:has-text("Ngozi Eke") button:has-text("Assign")');
    chk('assigning says how many, by name', await until(P, () => /1 assigned to Ngozi/.test(document.body.innerText)));
    chk('…recorded on the checklist, with one audit event', php(`echo db_row("SELECT supervisorId FROM reg_checklists WHERE memberId = '${MEM}'")['supervisorId'] . '|' . db_row("SELECT COUNT(*) c FROM audit_log WHERE event = 'regcheck.assign'")['c'];`) === SUP + '|1');
    chk('…and the list now names who is helping', await until(P, () => /Ngozi Eke/.test((document.querySelector('tr:has(td)') ? Array.from(document.querySelectorAll('tr')).map(r => r.innerText).join('\n') : '')) && /In progress/.test(document.body.innerText)));
    await P.context().close().catch(() => {});

    console.log('the supervisor’s My registrations (Mentor Portal)');
    await browser.close().catch(() => {}); browser = await launch();
    const S = await open(SUP, false, '/mentor/ngg');
    await S.waitForSelector('.m15-app', { timeout: 60000 }).catch(() => {});
    await S.click('nav >> text=My role');
    await S.click('button:has-text("My registrations"):visible');
    chk('Tobi is there, with whether Ngozi is at Egbeda today', await until(S, () => { const t = (document.querySelector('.rcl-desk') || {}).innerText || ''; return /Tobi Adeyemi/.test(t) && /You are checked in at Egbeda today/.test(t); }, null, 60000));
    await S.click('.rcl-item:has-text("Guardian linked") button:has-text("Check again")');
    chk('asking does not tick an item the record decides: the server says why, in words', await until(S, () => /The record does not show it yet/.test((document.querySelector('.rcl-item:has(b)') && Array.from(document.querySelectorAll('.rcl-item')).find(li => /Guardian linked/.test(li.innerText)) || {}).innerText || '')));
    await S.click('.rcl-item:has-text("Welcome talk given") button:has-text("Submit")');
    await S.waitForSelector('.rcl-form textarea');
    await S.click('.rcl-form button[type="submit"]');
    chk('an empty note is refused on the form', await until(S, () => /Write a short note/.test((document.querySelector('.rcl-form [role="alert"]') || {}).innerText || '')));
    await S.fill('.rcl-form textarea', 'Walked Tobi and his mother through a Saturday at the gate.');
    await S.click('.rcl-form button[type="submit"]');
    chk('submitted at the centre today, it is verified and says so', await until(S, () => /Verified: note recorded, at Egbeda today/.test((document.querySelector('.rcl-desk') || {}).innerText || '')));
    chk('…and the server holds the verdict and the submission', php(`echo db_row("SELECT status FROM reg_checklist_state WHERE memberId = '${MEM}'")['status'] . '|' . db_row("SELECT verdict FROM reg_checklist_submissions WHERE memberId = '${MEM}' ORDER BY id DESC LIMIT 1")['verdict'];`) === 'verified|accepted');
    await S.context().close().catch(() => {});

    console.log('the member’s own Me');
    await browser.close().catch(() => {}); browser = await launch();
    const M = await open(MEM, false, '/dashboard/me', 420, 900);
    chk('the member sees their registration: N of M done, what is left and who is helping', await until(M, () => {
      const t = (document.querySelector('.rcl-progress') || {}).innerText || '';
      return /Your registration: 1 of \d+ done/.test(t) && /Date of birth/.test(t) && /Ngozi at the centre is helping you/.test(t) && !/Ngozi Eke/.test(t);
    }, null, 60000));
    chk('no inline style on anything the feature draws', await M.evaluate(() => !document.querySelector('.rcl-progress [style], .rcl-progress[style]')));
    await M.context().close().catch(() => {});

    /* Owner, 24 Nov 2026: nobody waits on a person to choose a helper. A member whose checklist starts once
       Ngozi has been seen at Egbeda gets her by itself, and the list says it was automatic. */
    console.log('a helper chosen by itself');
    php(`$now = now_iso(); db_insert('members', ['memberId'=>'NGG-RC-KEMI','fullName'=>'Kemi Bello','email'=>'kemi.bello@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','centreId'=>'CEN-RC-1','createdAt'=>$now,'updatedAt'=>$now]);
      rcl_start(db_row("SELECT * FROM members WHERE memberId = 'NGG-RC-KEMI'"), '${ADMIN}');`);
    chk('…recorded as automatic, on the person seen at the centre', php(`$c = db_row("SELECT supervisorId, assignedBy FROM reg_checklists WHERE memberId = 'NGG-RC-KEMI'"); echo $c['supervisorId'] . '|' . $c['assignedBy'];`) === SUP + '|auto');
    await browser.close().catch(() => {}); browser = await launch();
    const P2 = await open(ADMIN, true, '/control/members/reg-checklist');
    chk('…and the list names her, chosen automatically', await until(P2, () => { const r = Array.from(document.querySelectorAll('tr')).find(x => /Kemi Bello/.test(x.innerText)); return !!r && /Ngozi Eke/.test(r.innerText) && /Chosen automatically/.test(r.innerText); }, null, 60000));
    chk('no page errors', errs.length === 0);
    if (errs.length) console.log(errs.slice(0, 5));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: the suite crashed: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
