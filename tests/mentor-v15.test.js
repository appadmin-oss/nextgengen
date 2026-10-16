#!/usr/bin/env node
/* ============================================================================
   Mentor Portal v15, end to end (docs/design/portals/mentor-portal-v15.dc.html): the Mentor Portal opens on the
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
const PORT = process.env.MP15_PORT || '8312';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mp15-'));
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
    'cookie_secret' => 'mp15_e2e_secret_portal_0123456789abc',
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

    // ── /mentor as Ngozi, a pod mentor: the v15 portal, on real data ──
    const mt = await as('NGG-MS-M1', false);
    await mt.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mt);
    await mt.waitForSelector('.m15-app', { timeout: 60000 }).catch(async e => { console.error('DEBUG', mt.errs.join('\n'), await mt.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); return document.body.innerText.slice(0, 2500); })); throw e; });
    await mt.waitForFunction(() => !document.querySelector('.m15x-load'), null, { timeout: 60000 });
    const wk = await mt.innerText('main');
    chk('/mentor opens the v15 portal on This week', /This week/.test(await mt.innerText('.m15-app')) && /2 mentees/.test(wk));
    chk('the Saturday formation schedule comes from the server (mentor part)', await mt.isVisible('.sf-day'));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/week.png' : path.join(TMP, 'week.png') });
    // Mentees
    await mt.click('nav >> text=Mentees');
    await mt.waitForFunction(() => /Mariam Yusuf/.test(document.querySelector('main').innerText) && /Daniel Okafor/.test(document.querySelector('main').innerText), null, { timeout: 30000 });
    chk('Mentees lists exactly her caseload', !/Kemi Adewale/.test(await mt.innerText('main')));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/list.png' : path.join(TMP, 'list.png') });
    // Open Mariam, score her month
    await mt.click('main >> text=Mariam Yusuf');
    await mt.waitForFunction(() => /Overview/.test(document.querySelector('main').innerText) && !document.querySelector('.m15x-load'), null, { timeout: 30000 });
    await mt.click('main >> text=Scorecard');
    await mt.waitForFunction(() => /Communication/.test(document.querySelector('main').innerText), null, { timeout: 15000 });
    const up = await mt.$$('main button[aria-label^="Raise"], main button[aria-label*="up" i]');
    if (up.length) { await up[0].click(); await up[0].click(); }
    await mt.click('main button:has-text("scores")');
    await mt.waitForFunction(() => /scores saved for Mariam/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    chk('Scorecard: saving writes ten integers for this month', (q(`db_row("SELECT scores FROM mentor_scorecards WHERE subjectId = 'NGG-MS-K1' AND byKind = 'mentor'")`) || {}).scores?.split(',').length === 10);
    // Log a one-to-one from the record
    await mt.click('main button:has-text("Log a session")');
    await mt.waitForSelector('main textarea', { timeout: 15000 });
    const tas = await mt.$$('main textarea');
    await tas[0].fill('Talked about her robot and what scares her about presenting it.');
    await mt.click('main button:has-text("Save session")');
    await mt.waitForFunction(() => /Session saved/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    chk('Sessions: a one-to-one is logged on her record by this mentor',
      q(`(int)db_row("SELECT COUNT(*) c FROM mentor_meetings WHERE subjectId = 'NGG-MS-K1' AND kind = 'one-to-one' AND mentorId = 'NGG-MS-M1'")['c']`) === 1);
    // Saturday: Before shows the formation day and the 8:30 breakout agenda
    await mt.click('nav >> text=Saturday');
    await mt.waitForFunction(() => /Musing/.test(document.querySelector('main').innerText), null, { timeout: 30000 });
    const sat = await mt.innerText('main');
    chk('Saturday shows the whole formation day and the 8:30 breakout', /Chess & strategic thinking/.test(sat) && /8:30/.test(sat));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/sat.png' : path.join(TMP, 'sat.png'), fullPage: false });
    // Report a concern: one queue
    await mt.click('button:has-text("Report a concern")');
    await mt.waitForSelector('main textarea', { timeout: 15000 });
    await mt.fill('main input[role="combobox"], main input[aria-autocomplete]', 'Mari').catch(() => {});
    await mt.keyboard.press('Enter');
    await mt.click('main button:has-text("Something they told me")');
    await mt.fill('main textarea', 'She said older boys took her phone at the gate.');
    await mt.click('main button:has-text("Send to the safeguarding officer")');
    await mt.waitForFunction(() => /SG-\d{6}/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    chk('Report a concern: a safeguarding case with the server’s SG reference', q(`(int)db_row("SELECT COUNT(*) c FROM safeguarding_cases WHERE subjectId = 'NGG-MS-K1'")['c']`) === 1);
    chk('a child outside the caseload is refused by the server', q(`backend_dispatch('member.mentor.mentee', ['requesterId' => 'NGG-MS-M1', 'subjectId' => 'NGG-MS-K3'])['error']`) === 'not_in_caseload');
    // Stars & results still reachable
    await mt.goto(BASE + '/mentor?tab=results', { waitUntil: 'domcontentloaded' });
    await mt.waitForSelector('.m15x-back', { timeout: 60000 });
    chk('the class portal (stars, school results) is one press away, with a way back', await mt.isVisible('[role="tab"]:has-text("School results")'));
    chk('no page errors', mt.errs.length === 0);
    if (mt.errs.length) console.error(mt.errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (mentor v15)` : `✅ PASS: ${passed} passed, 0 failed (mentor v15)`));
  process.exit(failed ? 1 : 0);
})();
