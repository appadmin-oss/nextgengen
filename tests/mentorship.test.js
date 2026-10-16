#!/usr/bin/env node
/* ============================================================================
   Mentorship, end to end (MENTORSHIP.md §6): the Mentor Portal opens on the
   mentor's caseload with School results beside it, the server's caseload and
   screening gates, a Summer volunteer brought into NGG, the automation board,
   the member's weekly check-in, and the workspace's choice-of-two approval
   with Undo.

   Run:  node tests/mentorship.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MS_PORT || '8311';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ms-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=stderr ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed: ' + String(e.stdout || '') + String(e.stderr || '')); }
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
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 200)));
  return pg;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  mentorship: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'mentorship_e2e_secret_0123456789abc',
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
      $mk = function ($id, $name, $role = 'member') use ($now) { db_insert('members', ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@pod.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'track' => 'tech', 'joinDate' => '2026-01-10', 'createdAt' => $now, 'updatedAt' => $now]); };
      $mk('NGG-MS-ADM', 'Adaeze Okafor', 'super_admin');
      foreach ([1 => 'Ngozi Eke', 2 => 'Tunde Bakare', 3 => 'Bola Ade'] as $i => $n) {
        $mk("NGG-MS-M$i", $n);
        db_insert('mentors', ['mentorId' => "MEN-MS-$i", 'fullName' => $n, 'email' => strtolower(str_replace(' ', '.', $n)) . '@pod.example', 'status' => 'active', 'centre' => 'Egbeda',
          'tracks' => 'tech', 'programme' => 'ngg', 'memberId' => "NGG-MS-M$i", 'checkedAt' => $now, 'maxMentees' => 8, 'createdAt' => $now]);
      }
      foreach ([1, 2] as $i) {   // Ngozi and Tunde are cleared; Bola has not done the Academy
        foreach (ms_required_modules() as $mod) db_insert('mentor_academy', ['mentorId' => "MEN-MS-$i", 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
        db_insert('mentor_policy', ['mentorId' => "MEN-MS-$i", 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'x', 'acceptedAt' => $now]);
      }
      foreach ([1 => 'Mariam Yusuf', 2 => 'Daniel Okafor', 3 => 'Kemi Adewale'] as $i => $n) $mk("NGG-MS-K$i", $n);
      foreach ([1, 2] as $i) {
        $a = backend_dispatch('admin.ms.match.approve', ['requesterId' => 'NGG-MS-ADM', 'memberId' => "NGG-MS-K$i", 'mentorIds' => ['MEN-MS-1', 'MEN-MS-2']]);
        backend_dispatch('admin.ms.match.choose', ['requesterId' => 'NGG-MS-ADM', 'matchId' => $a['matchId'], 'mentorId' => 'MEN-MS-1', 'chosenBy' => 'mentee']);
      }
      // Mariam's match began 30 days ago (Grow soon; no one-to-one since → R2). Daniel's 10 days ago (Connect → R5).
      db_exec("UPDATE mentor_matches SET startedAt = ? WHERE memberId = 'NGG-MS-K1'", [gmdate('Y-m-d', time() - 30 * 86400)]);
      db_exec("UPDATE mentor_matches SET startedAt = ? WHERE memberId = 'NGG-MS-K2'", [gmdate('Y-m-d', time() - 10 * 86400)]);
      db_insert('attendance', ['cohortId' => '', 'studentId' => 'NGG-MS-K1', 'token' => '', 'date' => mp_today(), 'checkInAt' => $now, 'method' => 'qr']);
      echo json_encode(ms_rules_run());`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));

    // ── The Mentor Portal (/mentor), as Ngozi: her class, and School results ──
    const mt = await as('NGG-MS-M1', false);
    // The class portal (stars, school results) is /mentor?tab=…; /mentor itself is the v15 portal (tests/mentor-v15.test.js).
    await mt.goto(BASE + '/mentor?tab=class', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mt);
    await mt.waitForFunction(() => /Daniel Okafor/.test(document.body.innerText), null, { timeout: 60000 });
    const roster = await mt.innerText('body');
    chk('/mentor opens the Mentor Portal on her mentees', /Mariam Yusuf/.test(roster) && /Daniel Okafor/.test(roster));
    chk('School results is one of its tabs', await mt.isVisible('[role="tab"]:has-text("School results")'));
    // Report a concern: from the header, to the one safeguarding queue.
    await mt.click('.mtr-concern-btn');
    await mt.waitForSelector('.mtr-sheet', { timeout: 10000 });
    await mt.click('.mtr-cn-form button[type=submit]');
    chk('an incomplete concern names what is missing first', /Choose the child first/.test(await mt.innerText('.mtr-err')));
    await mt.selectOption('#mtr-cn-who', { label: 'Mariam Yusuf' });
    await mt.click('.mtr-chip:has-text("Something they told me")');
    await mt.fill('#mtr-cn-body', 'She said older boys took her phone at the gate.');
    await mt.click('.mtr-cn-form button[type=submit]');
    await mt.waitForFunction(() => /SG-\d{6}/.test((document.querySelector('.mtr-sent') || {}).innerText || ''), null, { timeout: 30000 });
    const ref = (await mt.innerText('.mtr-sent')).match(/(SG-\d{6})/)[1];
    chk('Report a concern: one queue, the server’s SG reference, never on the child’s record',
      q(`db_row("SELECT category, subjectId FROM safeguarding_cases WHERE caseNo = '${ref}'")`).category === 'Something they told me'
      && q(`db_row("SELECT COUNT(*) c FROM mentor_meetings WHERE subjectId = 'NGG-MS-K1' AND concern = 1")`).c === 0);
    await mt.keyboard.press('Escape');
    chk('Escape closes the sheet', !(await mt.isVisible('.mtr-sheet')));
    chk('a child outside the caseload is refused by the server', q(`backend_dispatch('member.mentor.mentee', ['requesterId' => 'NGG-MS-M1', 'subjectId' => 'NGG-MS-K3'])['error']`) === 'not_in_caseload');
    // Goals in the restored record: a draft goes live once the mentee agrees it,
    // and Done is there to press — it never was while the panel looked for "open".
    await mt.click('button[aria-label="Open the record for Mariam Yusuf"]');
    await mt.waitForSelector('[role="tab"]:has-text("Goals (")', { timeout: 20000 });
    await mt.click('[role="tab"]:has-text("Goals (")');
    await mt.fill('input[aria-label="The goal"]', 'Present her robot to the centre.');
    await mt.click('button[type=submit]:has-text("Add")');
    await mt.waitForSelector('text=draft, not agreed yet', { timeout: 15000 }).catch(async e => { const b = await mt.innerText('body'); console.error('DEBUG sheet:', b.slice(b.indexOf('Goals ('), b.indexOf('Goals (') + 900)); throw e; });
    chk('a new goal shows as a draft with a way to start it once agreed', await mt.isVisible('button:has-text("They agreed · start it")'));
    await mt.click('button:has-text("They agreed · start it")');
    await mt.waitForSelector('button:has-text("✓ Done")', { timeout: 15000 });
    const gl = q(`db_row("SELECT status, agreed FROM mentor_goals WHERE subjectId = 'NGG-MS-K1' ORDER BY id DESC LIMIT 1")`);
    chk('…starting it records the agreement and makes it active', gl.status === 'active' && Number(gl.agreed) === 1);
    await mt.click('button:has-text("✓ Done")');
    await mt.waitForFunction(() => /achieved/.test(document.body.innerText), null, { timeout: 15000 });
    chk('Done marks it achieved', q(`db_row("SELECT status FROM mentor_goals WHERE subjectId = 'NGG-MS-K1' ORDER BY id DESC LIMIT 1")`).status === 'achieved');
    await mt.keyboard.press('Escape');
    chk('no page errors in the portal', mt.errs.length === 0);
    if (mt.errs.length) console.error(mt.errs.join('\n'));

    // An unscreened mentor gets no child's record from the server.
    php(`db_exec("UPDATE mentors SET checkedAt = '' WHERE mentorId = 'MEN-MS-3'"); db_insert('members', ['memberId' => 'NGG-MS-K9', 'fullName' => 'Ife Ola', 'email' => 'ife@pod.example', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
         db_insert('mentor_assignments', ['memberId' => 'NGG-MS-K9', 'mentorId' => 'MEN-MS-3', 'status' => 'active', 'startedAt' => '2026-01-01']);`);
    chk('an unscreened mentor gets no child’s record from the server', q(`backend_dispatch('member.mentor.caseload', ['requesterId' => 'NGG-MS-M3'])['mentees']`).length === 0);
    chk('…nor through the restored portal’s record', q(`backend_dispatch('member.mentor.child', ['requesterId' => 'NGG-MS-M3', 'subjectId' => 'NGG-MS-K9'])['error']`) === 'not_screened');

    const su = await as('NGG-MS-ADM', true);

    // ── A Summer School volunteer brought into NGG ──────────────────────
    php(`db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EG', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => now_iso()]);
         db_insert('centres', ['centreId' => 'C-EGS', 'name' => 'Egbeda (Summer School)', 'code' => 'EGS', 'status' => 'retired', 'programmes' => 'summer', 'slug' => 'egbeda-summer', 'createdAt' => now_iso()]);
         db_insert('volunteers', ['volunteerId' => 'VOL-MS-1', 'fullName' => 'Sade Summer', 'email' => 'sade@pod.example', 'role' => 'mentor', 'programme' => 'summer', 'centre' => 'Egbeda (Summer School)', 'status' => 'active', 'safeguarding' => 'cleared', 'token' => 'tok-ms-1', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);`);
    await su.goto(BASE + '/control/mentors/volunteers', { waitUntil: 'domcontentloaded' });
    await waitForBoot(su);
    await su.waitForSelector('button:has-text("Roster")', { timeout: 60000 });
    await su.click('button:has-text("Roster")');
    await su.waitForSelector('tr:has-text("Sade Summer") button:has-text("Bring into NGG")', { timeout: 30000 });
    await su.click('tr:has-text("Sade Summer") button:has-text("Bring into NGG")');
    await su.waitForSelector('.vol-ngg-centres', { timeout: 30000 });
    chk('Bring into NGG: Egbeda (the centre her Summer venue was split from) is suggested; no Summer venue is offered',
      await su.isChecked('.vol-ngg-opt:has-text("Egbeda · suggested") input') && !(await su.$$eval('.vol-ngg-centres .vol-ngg-opt', ls => ls.some(l => /Summer School/.test(l.textContent)))));
    await su.click('.vol-ngg button:has-text("Bring into NGG")');
    await su.waitForFunction(() => /now serves NGG and Summer School at Egbeda/.test(document.body.innerText), null, { timeout: 30000 });
    chk('…and she serves both, at Egbeda', JSON.stringify(q(`db_row("SELECT programme, centre FROM volunteers WHERE volunteerId = 'VOL-MS-1'")`)) === JSON.stringify({ programme: 'both', centre: 'Egbeda' }));
    chk('no page errors for the super admin', su.errs.length === 0);
    if (su.errs.length) console.error(su.errs.join('\n'));

    // ── Settings › Mentorship automations: an automation board ──────────
    const au = await as('NGG-MS-ADM', true);
    await au.goto(BASE + '/control/settings/mentor-automations', { waitUntil: 'domcontentloaded' });
    await waitForBoot(au);
    await au.waitForSelector('.cr-mpa-card', { timeout: 60000 });
    if (process.env.SHOTS) await au.screenshot({ path: process.env.SHOTS + '/automations.png', fullPage: false });
    chk('automations: every automation is a card with When and Then', (await au.$$('.cr-mpa-card')).length >= 35 && /When/i.test(await au.innerText('.cr-mpa-card >> nth=0')));
    await au.fill('.cr-mpa-search input', 'birthday');
    chk('automations: search narrows the board', (await au.$$('.cr-mpa-card')).length === 1);
    await au.fill('.cr-mpa-search input', 'one-to-one');
    const num = au.locator('.cr-mpa-card:has-text("One-to-one overdue") .cr-mpa-num').first();
    await num.fill('21'); await num.press('Enter');
    await au.waitForFunction(() => /applies from the next run/.test(document.body.innerText), null, { timeout: 30000 });
    chk('automations: a number edited in the sentence is saved', q(`mp_opts()['overdueDays']`) === 21);
    // Birthdays only fed the withdrawn v14 screens: paused in code, with the reason on its card.
    await au.fill('.cr-mpa-search input', 'birthday');
    chk('automations: a job for a withdrawn screen says it is paused in code, and why',
      await au.isVisible('.cr-mpa-card:has-text("Birthdays") >> text=Paused in code')
      && /Mentor Portal v14 screens, which are withdrawn/.test(await au.innerText('.cr-mpa-card:has-text("Birthdays")'))
      && (await au.$$('.cr-mpa-card:has-text("Birthdays") [role=switch]')).length === 0);
    await au.fill('.cr-mpa-search input', 'review date');
    await au.click('.cr-mpa-card:has-text("Goal review date") [role=switch]');
    await au.waitForFunction(() => /Goal review date is paused/.test(document.body.innerText), null, { timeout: 30000 });
    chk('automations: an automation is paused from its card', q(`mpa_job_on('goalReviewDate') ? 1 : 0`) === 0);
    chk('no page errors on the automation board', au.errs.length === 0);
    if (au.errs.length) console.error(au.errs.join('\n'));

    // ── The member's own weekly check-in ────────────────────────────────
    const mem = await as('NGG-MS-K1', false);
    await mem.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mem);
    await mem.waitForSelector('.dci-feel', { timeout: 60000 });
    if (process.env.SHOTS) await mem.locator('.dci').screenshot({ path: process.env.SHOTS + '/checkin.png' });
    await mem.click('.dci-feel-b:has-text("It’s been hard")');
    await mem.click('.dci-link');
    await mem.click('.dci-extra:has-text("Sleep") button:has-text("Poor")');
    await mem.click('.dci button:has-text("Send to")');
    await mem.waitForSelector('.dci-done', { timeout: 30000 });
    chk('check-in: a member says how their week was, and their mentor hears at once',
      q(`db_row("SELECT wellbeing, sleep FROM member_checkins WHERE memberId = 'NGG-MS-K1'")`).wellbeing === 'Struggling'
      && !!q(`db_row("SELECT 1 FROM mentor_nudges WHERE rule = 'J:wellbeingAlert' AND memberId = 'NGG-MS-K1'")`));
    chk('no page errors on the member dashboard', mem.errs.length === 0);
    if (mem.errs.length) console.error(mem.errs.join('\n'));

    // ── The workspace, as HQ ────────────────────────────────────────────
    const hq = await as('NGG-MS-ADM', true);
    await hq.goto(BASE + '/control/mentorship', { waitUntil: 'domcontentloaded' });
    await waitForBoot(hq);
    await hq.waitForFunction(() => /Relationship health/.test(document.body.innerText), null, { timeout: 60000 });
    chk('Workspace overview: the briefing blocks render', /Needs attention/.test(await hq.innerText('body')) && /Match lifecycle/.test(await hq.innerText('body')));
    await hq.goto(BASE + '/control/mentorship/ms-queue', { waitUntil: 'domcontentloaded' });
    await hq.waitForFunction(() => /Kemi Adewale/.test(document.body.innerText), null, { timeout: 60000 });
    await hq.click('tr:has-text("Kemi Adewale"), [role=row]:has-text("Kemi Adewale")');
    await hq.waitForSelector('form[aria-label^="Offer two mentors"]', { timeout: 30000 });
    await hq.click('form[aria-label^="Offer two mentors"] button[type=submit]');
    await hq.waitForFunction(() => /The portal created/.test(document.body.innerText), null, { timeout: 30000 }).catch(async e => { console.error((await hq.innerText("body")).slice(-1500)); throw e; });
    chk('Approve match: Kemi is offered two mentors and assigned to nobody',
      q(`(int)db_row("SELECT COUNT(*) c FROM mentor_match_offers o JOIN mentor_matches x ON x.matchId = o.matchId WHERE x.memberId = 'NGG-MS-K3' AND x.status = 'offered'")['c']`) === 2
      && !q(`db_row("SELECT 1 FROM mentor_assignments WHERE memberId = 'NGG-MS-K3' AND status = 'active'")`));
    await hq.click('button:has-text("Undo")');
    await hq.waitForFunction(() => /Offer withdrawn/.test(document.body.innerText), null, { timeout: 30000 });
    chk('Undo reverses everything', !q(`db_row("SELECT 1 FROM mentor_matches WHERE memberId = 'NGG-MS-K3'")`));
    await hq.goto(BASE + '/control/mentorship/ms-safeguarding', { waitUntil: 'domcontentloaded' });
    await hq.waitForFunction(c => document.body.innerText.indexOf(c) >= 0, ref, { timeout: 60000 });
    chk('Safeguarding: the case reaches the safeguarding role', true);
    chk('no page errors in the workspace', hq.errs.length === 0);
    if (hq.errs.length) console.error(hq.errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (mentorship)` : `✅ PASS: ${passed} passed, 0 failed (mentorship)`));
  process.exit(failed ? 1 : 0);
})();
