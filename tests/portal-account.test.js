#!/usr/bin/env node
/* ============================================================================
   The member portal's account basics, end to end — the P0s from the portal
   audit: a member changes their password (the current one is asked for, and
   a wrong one is said in words), forgets it and sets a new one from a code
   emailed to the record, and signs out from inside the portal. Ideas are
   their own request kind: they never fill the cap that "I need help" shares,
   an anonymous one needs no email, and the Control Room thanks it or passes
   it on rather than "approving" it. The mentor portal signs out too.

   Run:  node tests/portal-account.test.js     (PA_SHOTS=dir for screenshots)
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PA_PORT || '8331';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-pa-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=1 -d error_reporting=-1 ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed (' + e.status + '): ' + String(e.stdout || '') + String(e.stderr || '')); }
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
async function as(memberId, admin, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 300)));
  return pg;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  portal account: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'pa_e2e_secret_portal_account_0123456789',
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
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@pa.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk('NGG-PA-ADM', 'Ade Admin', 'super_admin');
      $mk('NGG-PA-LEAD', 'Lola Lead', 'centre_lead', ['centreScope' => json_encode(['C-EG'])]);
      $mk('NGG-PA-K1', 'Tolu Adebayo', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-14 years')), 'displayId' => '026-014', 'passwordHash' => password_hash('first-pass-1', PASSWORD_DEFAULT)]);
      $mk('NGG-PA-MEN', 'Ngozi Eke');
      db_insert('mentors', ['mentorId' => 'MEN-PA-1', 'fullName' => 'Ngozi Eke', 'email' => 'ngozi.eke@pa.example', 'status' => 'active', 'centre' => 'Egbeda', 'tracks' => 'Coding',
        'programme' => 'ngg', 'memberId' => 'NGG-PA-MEN', 'checkedAt' => $now, 'maxMentees' => 8, 'createdAt' => $now]);
      foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId' => 'MEN-PA-1', 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
      db_insert('mentor_policy', ['mentorId' => 'MEN-PA-1', 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'x', 'acceptedAt' => $now]);
      $a = backend_dispatch('admin.ms.match.approve', ['requesterId' => 'NGG-PA-ADM', 'memberId' => 'NGG-PA-K1', 'mentorIds' => ['MEN-PA-1']]);
      backend_dispatch('admin.ms.match.choose', ['requesterId' => 'NGG-PA-ADM', 'matchId' => $a['matchId'], 'mentorId' => 'MEN-PA-1', 'chosenBy' => 'mentee']);
      if (!db_row("SELECT 1 FROM mentor_assignments WHERE memberId = 'NGG-PA-K1' AND status = 'active'")) db_insert('mentor_assignments', ['mentorId' => 'MEN-PA-1', 'memberId' => 'NGG-PA-K1', 'status' => 'active', 'startedAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));
    const shot = (pg, n) => pg.screenshot({ path: (process.env.PA_SHOTS || TMP) + '/' + n + '.png' });
    const pwIs = pw => q(`password_verify(${JSON.stringify(pw)}, (string)db_row("SELECT passwordHash FROM members WHERE memberId = 'NGG-PA-K1'")['passwordHash'])`);
    const sheet = '[role="dialog"]';
    const sheetText = pg => pg.innerText(sheet).catch(() => '');
    const palette = async (pg, what) => {
      await pg.click('aside button[title^="Search or jump"]');
      await pg.fill('[role="dialog"] input', what);
      await pg.click('[role="dialog"] [role="option"]:has-text("' + what + '"), [role="dialog"] button:has-text("' + what + '")');
    };
    const boot = async pg => {
      await pg.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
      await waitForBoot(pg);
      await pg.waitForSelector('.m9-app main', { timeout: 60000 }).catch(async e => { console.error('DEBUG', pg.errs.join('\n'), (await pg.innerText('body')).slice(0, 800)); throw e; });
      await pg.waitForFunction(() => /Tolu/.test(document.body.innerText), null, { timeout: 30000 });
    };

    // ── Password: changing it asks for the current one ──
    const mb = await as('NGG-PA-K1', false);
    await boot(mb);
    // ── Messages: written straight from a deep link, before any other screen has drawn ──
    await mb.goto(BASE + '/dashboard/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mb); await mb.waitForSelector('.m9-app main input[aria-label="Message"]', { timeout: 60000 });
    await mb.fill('main input[aria-label="Message"]', 'Hello coach, straight from the link');
    await mb.click('main button[aria-label="Send"]');
    await mb.waitForTimeout(1500);
    const chatT = await mb.innerText('body');
    chk('Messages: a member with a mentor can write the moment the page opens — never “you don’t have a mentor”',
      q(`(int)db_row("SELECT COUNT(*) c FROM mentor_messages WHERE threadId = 'chat:NGG-PA-K1' AND body = 'Hello coach, straight from the link'")['c']`) === 1 && !/don’t have a mentor/.test(chatT));

    // The password has its own place on Me: no searching, no signing out.
    await mb.goto(BASE + '/dashboard/me', { waitUntil: 'domcontentloaded' }); await waitForBoot(mb);
    await mb.waitForSelector('main h2:has-text("Sign-in and password")', { timeout: 40000 }).catch(async e => { console.error('DEBUG me:', (await mb.innerText('body')).slice(0, 900), mb.errs); throw e; });
    await mb.waitForFunction(() => /You have a password/.test(document.querySelector('main').innerText), null, { timeout: 15000 }).catch(() => {});
    chk('Password: Me has a “Sign-in and password” section saying whether there is a password', /You have a password/.test(await mb.innerText('main')));
    const openPw = async () => { await mb.click('main section:has(h2:has-text("Sign-in and password")) button:has-text("Change password")'); await mb.waitForSelector(sheet + ' input[aria-label="New password"]', { timeout: 20000 }); };
    await openPw();
    // The sheet reads the security record (hasPassword) itself; that read decides whether "Current password" is asked.
    await mb.waitForSelector(sheet + ' input[aria-label="Current password"]', { timeout: 15000 }).catch(() => {});
    chk('Password: a member who has one is asked for the current password', await mb.isVisible(sheet + ' input[aria-label="Current password"]'));
    await mb.fill(sheet + ' input[aria-label="New password"]', 'second-pass-2');
    await mb.fill(sheet + ' input[aria-label="Confirm password"]', 'second-pass-2');
    await mb.click(sheet + ' button:has-text("Change password")');
    await mb.waitForTimeout(500);
    chk('Password: …and is told to type it, not sent to the server without it', /Type your current password first/.test(await sheetText(mb)) && pwIs('first-pass-1'));
    await mb.fill(sheet + ' input[aria-label="Current password"]', 'not-my-password');
    await mb.click(sheet + ' button:has-text("Change password")');
    await mb.waitForFunction(() => /current password/.test((document.querySelector('[role="dialog"]') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    const wrong = await sheetText(mb);
    chk('Password: a wrong current password is said in words, never as a code', /isn’t your current password/.test(wrong) && !/bad_current_password/.test(wrong) && pwIs('first-pass-1'));
    await mb.fill(sheet + ' input[aria-label="Current password"]', 'first-pass-1');
    await mb.click(sheet + ' button:has-text("Change password")');
    await mb.waitForFunction(() => /Password changed/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    const meNow = await mb.evaluate(() => fetch('/api/auth/me.php', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({})));
    chk('Password: with the right current password it changes, the sheet closes, and the member is still signed in',
      pwIs('second-pass-2') && !(await mb.isVisible(sheet + ' input[aria-label="New password"]')) && !!(meNow && meNow.member));
    await shot(mb, 'password-changed');

    // ── Password: forgotten, reset from a code emailed to the record ──
    await openPw();
    await mb.waitForSelector(sheet + ' button:has-text("Forgot it?")', { timeout: 10000 });
    await mb.click(sheet + ' button:has-text("Forgot it?")');
    await mb.waitForSelector(sheet + ' input[aria-label="Code from the email"]', { timeout: 15000 });
    const otp = q(`(string)(db_row("SELECT otp FROM auth_sessions WHERE memberId = 'NGG-PA-K1' AND purpose = 'reset' ORDER BY id DESC LIMIT 1")['otp'] ?? '')`);
    chk('Reset: “Forgot it?” sends a code to the record, and the sheet asks for it instead of the current password',
      /^\d{6}$/.test(otp) && !(await mb.isVisible(sheet + ' input[aria-label="Current password"]')) && /6-digit code/.test(await sheetText(mb)));
    await mb.fill(sheet + ' input[aria-label="Code from the email"]', otp === '000000' ? '111111' : '000000');
    await mb.fill(sheet + ' input[aria-label="New password"]', 'third-pass-3');
    await mb.fill(sheet + ' input[aria-label="Confirm password"]', 'third-pass-3');
    await mb.click(sheet + ' button:has-text("Set my new password")');
    await mb.waitForFunction(() => /code isn’t right/.test((document.querySelector('[role="dialog"]') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    chk('Reset: a wrong code is said in words and changes nothing', /code isn’t right/.test(await sheetText(mb)) && pwIs('second-pass-2'));
    await mb.fill(sheet + ' input[aria-label="Code from the email"]', otp);
    await mb.click(sheet + ' button:has-text("Set my new password")');
    await mb.waitForFunction(() => /Password changed/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    chk('Reset: the right code sets the new password, and the member stays in their portal', pwIs('third-pass-3') && await mb.isVisible('.m9-app main'));

    // ── Ideas: their own kind, never filling the help cap ──
    await mb.click('aside button:has-text("Get help")');
    await mb.waitForFunction(() => /How is NGG going for you\?/.test(document.querySelector('main').innerText), null, { timeout: 15000 });
    chk('Help: the Help screen has “Share an idea” next to “Tell us about something”', /Tell us about something/.test(await mb.innerText('main')));
    for (let i = 0; i < 4; i++) {
      await mb.click('main button:has-text("Share an idea")');
      await mb.waitForSelector(sheet + ' textarea[aria-label="Your idea"]', { timeout: 10000 });
      if (i === 0) {
        const t = await sheetText(mb);
        chk('Ideas: “makes me uncomfortable” is not an idea chip; it is a link to tell us privately',
          !/makes me uncomfortable/.test(t) && /Something feels wrong\? Tell us privately/.test(t));
      }
      await mb.click(sheet + ' button:has-text("Something NGG should change")');
      await mb.fill(sheet + ' textarea[aria-label="Your idea"]', 'More robotics on Saturdays, idea ' + i);
      if (i === 3) await mb.click(sheet + ' button:has-text("Send without my name")');
      await mb.click(sheet + ' button:text-is("Send")');
      await mb.waitForFunction(() => !document.querySelector('[role="dialog"] textarea[aria-label="Your idea"]'), null, { timeout: 10000 }).catch(async () => console.error('DEBUG idea sheet:', (await sheetText(mb)).slice(0, 600)));
    }
    const fb = q(`db_all("SELECT memberId, kind, topic, centre FROM member_requests WHERE kind = 'feedback' ORDER BY id")`);
    chk('Ideas: four ideas are four feedback rows with their topic; the anonymous one has no member, only the centre',
      fb.length === 4 && fb.every(r => r.topic === 'change') && fb.filter(r => r.memberId === 'NGG-PA-K1').length === 3 && fb[3].memberId === '' && fb[3].centre === 'Egbeda');
    chk('Ideas: none of them is a “help” request, so the help cap is untouched', q(`(int)db_row("SELECT COUNT(*) c FROM member_requests WHERE kind = 'help'")['c']`) === 0);
    const help = q(`backend_dispatch('member.request.create', ['memberId' => 'NGG-PA-K1', 'kind' => 'help', 'body' => 'Something happened at school'])`);
    chk('Ideas: with three ideas waiting, “I need help” still goes through', !!help.ok);
    // ── Experience: how NGG is going, as a rating ──
    await mb.click('main button:has-text("Share an idea")');
    await mb.waitForSelector(sheet + ' textarea[aria-label="Your idea"]', { timeout: 10000 });
    await mb.click(sheet + ' button:has-text("How NGG is going for me")');
    const sendBtn = sheet + ' button:text-is("Send")';
    chk('Experience: choosing “How NGG is going for me” asks for a rating, and Send waits for one', await mb.isVisible(sheet + ' [role="group"][aria-label="How is NGG going for you"]') && await mb.isDisabled(sendBtn));
    await mb.click(sheet + ' [role="group"] button:text-is("Good")');
    await mb.click(sendBtn);
    await mb.waitForTimeout(1200);
    chk('Experience: the rating alone is sent, as an experience row the desk can read',
      q(`(int)(db_row("SELECT rating FROM member_requests WHERE kind = 'feedback' AND topic = 'experience' ORDER BY id DESC LIMIT 1")['rating'] ?? 0)`) === 4);

    // ── Errors: never a raw code ──
    const codeShown = await mb.evaluate(() => [mp9Err({ code: 'missing_field:email' }), mp9Err({ code: 'no_member' }), mp9Err({ code: 'too_many_open', detail: 'You have 6 ideas waiting.' })]);
    chk('Errors: a code never reaches the child; a server sentence does', codeShown[0] === 'That didn’t work. Try again.' && codeShown[1] === 'That didn’t work. Try again.' && codeShown[2] === 'You have 6 ideas waiting.');

    // ── Control Room: thank it or pass it on ──
    const ad = await as('NGG-PA-ADM', true);
    await ad.goto(BASE + '/control?s=inbox', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ad);
    await ad.waitForFunction(() => /More robotics on Saturdays/.test(document.body.innerText), null, { timeout: 60000 }).catch(async e => { console.error('DEBUG', ad.errs.join('\n'), (await ad.innerText('body')).slice(0, 1200)); });
    await ad.click('text=More robotics on Saturdays, idea 0');
    await ad.waitForTimeout(600);
    const pane = await ad.innerText('body');
    chk('Control Room: feedback offers “Thank and close” and “Pass to centre lead”, not Approve / Decline',
      /Thank and close/.test(pane) && /Pass to centre lead/.test(pane));
    await shot(ad, 'inbox-feedback');
    const rid0 = q(`db_row("SELECT requestId FROM member_requests WHERE kind = 'feedback' ORDER BY id LIMIT 1")['requestId']`);
    const passed1 = q(`backend_dispatch('admin.requests.decide', ['requesterId' => 'NGG-PA-ADM', 'requestId' => '${rid0}', 'answer' => 'pass', 'decision' => 'Can we try this?'])`);
    chk('Control Room: passing it reaches the Egbeda centre lead, and it stays open',
      !!passed1.ok && passed1.request.status === 'open' && q(`(int)db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'NGG-PA-LEAD' AND body LIKE '%Can we try this?%'")['c']`) === 1);
    // The action opens the reply box (the note); its own button sends it, empty for a plain thank-you.
    await ad.click('.cr-ib-pane button:has-text("Thank and close")');
    await ad.waitForTimeout(400);
    await ad.locator('.cr-ib-pane button.is-primary:has-text("Thank and close")').last().click();
    await ad.waitForFunction(rid => true, rid0, { timeout: 1000 }).catch(() => {});
    await ad.waitForTimeout(1500);
    const thanked = q(`db_row("SELECT status, decision FROM member_requests WHERE requestId = '${rid0}'")`);
    chk('Control Room: “Thank and close” closes it with a plain thank-you the member reads',
      thanked.status === 'approved' && /Thank you for telling us/.test(thanked.decision)
      && q(`(int)db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'NGG-PA-K1' AND title = 'Thank you for your idea'")['c']`) === 1);

    // ── Sign out, from inside the portal ──
    chk('Sign out: the member portal has a Sign out control in its sidebar', await mb.isVisible('aside button[aria-label="Sign out"]'));
    await mb.click('aside button[aria-label="Sign out"]');
    await mb.waitForFunction(() => !document.querySelector('.m9-app'), null, { timeout: 20000 }).catch(() => {});
    const me1 = await mb.evaluate(() => fetch('/api/auth/me.php', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({})));
    chk('Sign out: it ends the session and leaves the portal', !(await mb.$('.m9-app')) && !(me1 && me1.member));
    const mbN = await as('NGG-PA-K1', false, { width: 390, height: 844 });
    await boot(mbN);
    await mbN.click('header button[aria-label="Everything else, and sign out"]');
    await mbN.waitForTimeout(800);
    chk('Sign out: on a phone, the account button in the header opens More, where Sign out is', await mbN.isVisible('main button:has-text("Sign out")'));

    const mt = await as('NGG-PA-MEN', false);
    await mt.goto(BASE + '/mentor/ngg', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mt);
    await mt.waitForSelector('aside[aria-label="Mentor portal"]', { timeout: 60000 }).catch(async () => { console.error('DEBUG mentor', mt.errs.join('\n'), (await mt.innerText('body')).slice(0, 800)); });
    const mside = await mt.innerText('aside[aria-label="Mentor portal"]').catch(() => '');
    chk('Mentor portal: shows the mentor’s own id, not a placeholder, and has Sign out', !/NGG-M-0142/.test(mside) && await mt.isVisible('aside button[aria-label="Sign out"]'));
    await mt.click('aside button[aria-label="Sign out"]');
    await mt.waitForTimeout(2000);
    const me2 = await mt.evaluate(() => fetch('/api/auth/me.php', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({})));
    chk('Mentor portal: Sign out ends the session', !(me2 && me2.member));

    chk('no page errors in any portal', ![mb, ad, mbN, mt].some(p => p.errs.length) || (console.error([mb, ad, mbN, mt].map(p => p.errs.join('\n')).join('\n')), false));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌' : '✅') + ` portal account: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
