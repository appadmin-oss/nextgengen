#!/usr/bin/env node
/* ============================================================================
   Mentorship, end to end (MENTORSHIP.md §6, MENTOR_PORTAL.md §7): the R2 and
   R5 rules showing up in the Mentor Portal, the Academy gate, evidence on a
   Saturday rating, a concern reported with the server's case number, and the
   workspace's choice-of-two approval with Undo.

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
      db_insert('attendance', ['cohortId' => '', 'studentId' => 'NGG-MS-K1', 'token' => '', 'date' => gmdate('Y-m-d'), 'checkInAt' => $now, 'method' => 'qr']);
      echo json_encode(ms_rules_run());`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));

    // ── The Mentor Portal, as Ngozi ─────────────────────────────────────
    const mt = await as('NGG-MS-M1', false);
    await mt.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mt);
    await mt.waitForSelector('.mt-app h1', { timeout: 60000 });
    const today = await mt.innerText('.mt-body');
    chk('Today: greets the mentor and counts the pod', /Good (morning|afternoon|evening), Ngozi/.test(today) && /pod of 2/.test(today));
    chk('R2 in the portal: “No one-to-one with Mariam” is in Needs you', /No one-to-one with Mariam Yusuf for \d+ days/.test(today));
    const first = await mt.innerText('.mt-card:has(h2:has-text("One-to-ones")) li:first-child');
    chk('R2 in the portal: Mariam is at the top of one-to-ones, marked 21 days+', /Mariam Yusuf/.test(first) && /21 days\+/.test(first));
    chk('the Report a concern button is always visible', await mt.isVisible('.mt-concern'));

    await mt.goto(BASE + '/mentor?s=case&m=NGG-MS-K2', { waitUntil: 'domcontentloaded' });
    await mt.waitForSelector('.mt-tabs', { timeout: 60000 });
    await mt.click('.mt-tabs button:has-text("Goals")');
    chk('R5 in the portal: goal tools are hidden in the first six weeks', /Goals start in week 7/.test(await mt.innerText('.mt-body')));

    await mt.goto(BASE + '/mentor?s=case&m=NGG-MS-K3', { waitUntil: 'domcontentloaded' });
    await mt.waitForFunction(() => /not in your pod/.test(document.body.innerText), null, { timeout: 60000 });
    chk('a mentee outside the pod is refused by the server', q(`backend_dispatch('member.ms.case', ['requesterId' => 'NGG-MS-M1', 'memberId' => 'NGG-MS-K3'])['error']`) === 'not_in_pod');

    await mt.goto(BASE + '/mentor?s=observe', { waitUntil: 'domcontentloaded' });
    await mt.waitForSelector('.mt-obs', { timeout: 60000 });
    chk('Saturday: only mentees here today are observed (Mariam), away ones skipped', /Mariam Yusuf/.test(await mt.innerText('.mt-body h1')) && /1 of 1/.test(await mt.innerText('.mt-body')));
    await mt.click('.mt-obs:has(legend:has-text("Courage")) button:has-text("Demonstrated")');
    const save = 'button:has-text("Save and go to next")';
    chk('Saturday: a rating without evidence cannot be saved', await mt.isDisabled(save) && /Evidence needed for this rating: Courage/.test(await mt.innerText('.mt-body')));
    await mt.fill('.mt-obs:has(legend:has-text("Courage")) input', 'Volunteered to present first.');
    await mt.click(save);
    await mt.waitForFunction(() => /Everyone here today has been observed/.test(document.body.innerText), null, { timeout: 30000 });
    chk('…and with evidence it saves, and the Saturday is done', q(`db_row("SELECT level, evidence FROM mentor_observations WHERE memberId = 'NGG-MS-K1' AND indicator = 'Courage'")`).evidence === 'Volunteered to present first.');

    await mt.click('.mt-concern');
    await mt.waitForSelector('text=call 112 first');
    await mt.selectOption('.mt-form select >> nth=0', 'Bullying');
    await mt.fill('.mt-form textarea', 'She said older boys took her phone at the gate.');
    await mt.click('button:has-text("Send to safeguarding")');
    await mt.waitForFunction(() => /Case C-\d+/.test(document.body.innerText), null, { timeout: 30000 });
    const caseNo = (await mt.innerText('.mt-body')).match(/Case (C-\d+)/)[1];
    chk('Report a concern: the case number comes from the server', q(`db_row("SELECT category FROM safeguarding_cases WHERE caseNo = '${caseNo}'")`).category === 'Bullying');
    chk('no page errors in the portal', mt.errs.length === 0);
    if (mt.errs.length) console.error(mt.errs.join('\n'));

    // Phone: the five-tab bar.
    const ph = await as('NGG-MS-M1', false, { width: 390, height: 844 });
    await ph.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await ph.waitForSelector('.mt-tabbar', { timeout: 60000 });
    chk('phone: Today · Pod · Saturday · Reviews · Check-ins in the tab bar, and no sideways scroll',
      (await ph.innerText('.mt-tabbar')).replace(/\s+/g, ' ').trim() === 'Today Pod Saturday Reviews Check-ins'
      && await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

    // The Academy gate, as Bola.
    const un = await as('NGG-MS-M3', false);
    await un.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await un.waitForSelector('.mt-steps', { timeout: 60000 });
    chk('Academy gate: an uncertified mentor sees the steps, and gets no mentee data from the server',
      /Before you meet your pod/.test(await un.innerText('.mt-body')) && q(`backend_dispatch('member.ms.today', ['requesterId' => 'NGG-MS-M3'])['pod']`).length === 0);

    await un.click('a:has-text("Open my class")');
    await un.waitForFunction(() => /MENTOR PORTAL|Pick a centre|students/i.test(document.body.innerText) && !/Before you meet your pod/.test(document.body.innerText), null, { timeout: 60000 });
    chk('…and is never locked out: “Open my class” opens the class roster as before', /view=class/.test(un.url()));
    // Staff who also hold an NGG mentor record keep the class roster until cleared.
    php(`db_insert('members', ['memberId' => 'NGG-MS-ADM2', 'fullName' => 'Admin Mentor', 'email' => 'am@pod.example', 'type' => 'NGG', 'status' => 'active', 'role' => 'admin', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
         db_insert('mentors', ['mentorId' => 'MEN-MS-AM', 'fullName' => 'Admin Mentor', 'status' => 'active', 'centre' => 'Egbeda', 'programme' => 'ngg', 'memberId' => 'NGG-MS-ADM2', 'createdAt' => now_iso()]);`);
    const am = await as('NGG-MS-ADM2', true, { width: 390, height: 844 });
    await am.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(am);
    await am.waitForFunction(() => /STAFF|Pick a centre|MENTOR PORTAL/i.test(document.body.innerText), null, { timeout: 60000 });
    chk('an admin with an uncleared mentor record lands on the class roster, not the Academy checklist', !/Before you meet your pod/.test(await am.innerText('body')));

    // ── A super admin reaches both mentor pages ─────────────────────────
    const su = await as('NGG-MS-ADM', true);
    await su.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(su);
    await su.waitForSelector('.mt-viewswitch', { timeout: 60000 });
    chk('super admin: /mentor opens the class roster (Summer School and NGG) with a switch to the NGG pods',
      /Class roster · Summer School and NGG/.test(await su.innerText('.mt-viewswitch')) && await su.isVisible('.mt-viewswitch a:has-text("NGG pods")'));
    await su.click('.mt-viewswitch a:has-text("NGG pods")');
    await su.waitForSelector('.mt-app .mt-body h1', { timeout: 60000 });
    const sv = await su.innerText('body');
    chk('super admin: the NGG pods page is the coordinator view of every pod, read only',
      /Coordinator view · every pod/.test(sv) && /pod of 2/.test(sv) && !/Before you meet your pod/.test(sv));
    await su.goto(BASE + '/mentor?view=pod&s=case&m=NGG-MS-K1', { waitUntil: 'domcontentloaded' });
    await su.waitForSelector('.mt-tabs', { timeout: 60000 });
    chk('super admin: a case file opens read only, naming the mentor', /Mentor · Ngozi Eke · read only/.test(await su.innerText('.mt-body')) && !(await su.isVisible('button:has-text("Log a one-to-one")')));

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
    await hq.waitForFunction(c => document.body.innerText.indexOf(c) >= 0, caseNo, { timeout: 60000 });
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
