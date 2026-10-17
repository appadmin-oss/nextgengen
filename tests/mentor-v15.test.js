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
      // Summer School: its own centre and a participant, so the two programmes can be seen not to mix.
      db_insert('centres', ['centreId' => 'C-EGS', 'name' => 'Egbeda (Summer School)', 'code' => 'EGS', 'status' => 'active', 'programmes' => 'summer', 'slug' => 'egbeda-summer', 'createdAt' => $now]);
      db_insert('centres', ['centreId' => 'C-EGN', 'name' => 'Egbeda', 'code' => 'EGN', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      db_insert('centres', ['centreId' => 'C-IKJ', 'name' => 'Ikeja', 'code' => 'IKJ', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'ikeja', 'createdAt' => $now]);
      db_insert('summer_students', ['studentId' => 'SUM-MP-1', 'cohortId' => '', 'handle' => 'peace', 'fullName' => 'Peace Summer', 'centre' => 'Egbeda (Summer School)', 'track' => 'Music', 'status' => 'active', 'enrolledAt' => $now, 'updatedAt' => $now]);
      echo json_encode(ms_rules_run());`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));

    // ── /mentor as Ngozi, a pod mentor: straight to /mentor/ngg, the v15 portal, on real data ──
    const mt = await as('NGG-MS-M1', false);
    await mt.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mt);
    await mt.waitForFunction(() => location.pathname === '/mentor/ngg', null, { timeout: 60000 }).catch(() => {});
    chk('/mentor sends an NGG-only mentor to /mentor/ngg', new URL(mt.url()).pathname === '/mentor/ngg');
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
    await mt.waitForTimeout(800);
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/scorecard.png' : path.join(TMP, 'scorecard.png') });
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
    // Pod growth: the Leadership Index board, from the saved scorecard
    await mt.click('nav >> text=Mentees');
    await mt.click('main >> text=Pod growth');
    await mt.waitForFunction(() => /Communication|Leadership/.test(document.querySelector('main').innerText) && !document.querySelector('.m15x-load'), null, { timeout: 30000 });
    await mt.waitForTimeout(600);
    chk('Pod growth shows the Leadership Index from the server', /of 1 scored|1 of 2 scored/.test(await mt.innerText('main')));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/growth.png' : path.join(TMP, 'growth.png'), fullPage: true });
    // Saturday: Before shows the formation day and the 8:30 breakout agenda
    await mt.click('nav >> text=Saturday');
    await mt.waitForFunction(() => /Musing/.test(document.querySelector('main').innerText), null, { timeout: 30000 });
    await mt.click('main .sf-more');
    const sat = await mt.innerText('main');
    chk('Saturday shows the whole formation day and the 8:30 breakout', /Chess & strategic thinking/.test(sat) && /8:30/.test(sat));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/sat.png' : path.join(TMP, 'sat.png'), fullPage: false });
    // During: the register's formation duties, saved as tapped
    await mt.click('main button:has-text("During")');
    await mt.waitForFunction(() => /Assignment in/.test(document.querySelector('main').innerText), null, { timeout: 15000 });
    const regRow = mt.locator('main li, main [role=listitem], main div').filter({ hasText: 'Mariam Yusuf' }).filter({ hasText: 'Assignment in' }).last();
    /* Mark her here only if she is not already: on a Saturday the gate's check-in
       for today marks her here before the mentor touches anything, and a blind
       tap toggled her to Away — which disables every duty below. */
    const hereSw = regRow.locator('button[role=switch]').first();
    if ((await hereSw.getAttribute('aria-checked')) !== 'true') await hereSw.click();
    await mt.waitForTimeout(300);
    await regRow.locator('button', { hasText: 'Assignment in' }).first().click();
    await mt.waitForTimeout(1600);
    const reg = q(`db_row("SELECT here, checks FROM mentor_register WHERE subjectId = 'NGG-MS-K1' ORDER BY id DESC LIMIT 1")`) || {};
    chk('During: Here and “Assignment in” are on the register', Number(reg.here) === 1 && /Assignment in/.test(reg.checks || ''));
    // The detail line: written on the day, saved with the register, carried into the review and the timeline
    await regRow.locator('button', { hasText: 'Add detail' }).first().click();
    await mt.fill('main textarea[id^="m15-note-"]', 'Offered to present first when nobody else would.');
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/during-detail.png' : path.join(TMP, 'during-detail.png') });
    await mt.click('main button:has-text("Save detail")');
    await mt.waitForTimeout(1600);
    const regN = q(`db_row("SELECT note FROM mentor_register WHERE subjectId = 'NGG-MS-K1' ORDER BY id DESC LIMIT 1")`) || {};
    chk('During: the detail line is saved with the register', /Offered to present first/.test(regN.note || ''));
    chk('During: the row shows the detail under the name', /Offered to present first/.test(await mt.innerText('main')));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/during.png' : path.join(TMP, 'during.png') });
    await mt.click('main button:has-text("Go to the weekly review")');
    await mt.waitForTimeout(400);
    chk('After: the weekly review starts from the detail', /Noted: “Offered to present first/.test(await mt.innerText('main')));
    // The child's name opens their profile
    await mt.click('main button:has-text("During")');
    await mt.click('main button[aria-label="Open Mariam Yusuf’s profile"]');
    await mt.waitForFunction(() => /Offered to present first/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    chk('the register’s name opens the profile, whose timeline carries the detail', /Offered to present first/.test(await mt.innerText('main')));
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
    // Class: stars, presence, school results and curriculum are the portal's own screens — no embedded portal.
    await mt.locator('.m15-app button', { hasText: /^Class$/ }).first().click();
    await mt.waitForSelector('main .m15c table', { timeout: 30000 });
    chk('Class › Stars is the portal’s own screen at /mentor/class, with no embedded old portal',
      new URL(mt.url()).pathname === '/mentor/class' && !(await mt.$('.m15x-classic')) && /This week/.test(await mt.innerText('.m15-app')) && /Stars and presence/.test(await mt.innerText('main')));
    const starRow = mt.locator('main .m15c tr', { hasText: 'Daniel Okafor' });
    await starRow.locator('button', { hasText: 'Give stars' }).click();
    await mt.waitForSelector('.m15c-drawer', { timeout: 10000 });
    await mt.click('.m15c-drawer [role="radio"]:has-text("★★")');
    await mt.click('.m15c-drawer button:has-text("Give 2 stars")');
    await mt.waitForSelector('.m15c-drawer', { state: 'detached', timeout: 15000 });
    chk('Give stars: a drawer, two stars, saved on the server', Number(q(`(int)(db_row("SELECT stars FROM member_stars WHERE subjectId = 'NGG-MS-K2' ORDER BY id DESC LIMIT 1")['stars'] ?? 0)`)) === 2
      && /★★/.test(await starRow.innerText()));
    await starRow.locator('button', { hasText: 'Rate presence' }).click();
    await mt.waitForSelector('.m15c-drawer', { timeout: 10000 });
    await mt.click('.m15c-drawer [aria-labelledby="m15c-verbal"] [role="radio"]:has-text("5")');
    await mt.click('.m15c-drawer button:has-text("Save · 11 of 15")');
    await mt.waitForSelector('.m15c-drawer', { state: 'detached', timeout: 15000 });
    chk('Presence (verbal, vocal, visual) is saved for the week and shown as a total', /11 of 15/.test(await starRow.innerText())
      && Number(q(`(int)(db_row("SELECT verbal FROM v3_scores WHERE subjectId = 'NGG-MS-K2' ORDER BY id DESC LIMIT 1")['verbal'] ?? 0)`)) === 5);
    await mt.keyboard.press('Escape');
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/class-inside.png' : path.join(TMP, 'class-inside.png') });
    // The old email link (?tab=results) lands on Class › School results, inside the portal
    await mt.goto(BASE + '/mentor?tab=results', { waitUntil: 'domcontentloaded' });
    await mt.waitForFunction(() => /Waiting for you/.test((document.querySelector('main') || {}).innerText || ''), null, { timeout: 60000 });
    chk('/mentor?tab=results lands on Class › School results at /mentor/class, inside the portal',
      new URL(mt.url()).pathname === '/mentor/class' && /tab=results/.test(mt.url()) && await mt.isVisible('.m15-app') && !(await mt.$('.m15x-classic')));
    await mt.goto(BASE + '/mentor/summer', { waitUntil: 'domcontentloaded' });
    await mt.waitForFunction(() => /no class|isn’t/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    chk('an NGG-only mentor is refused the Summer School portal', !/Peace Summer/.test(await mt.innerText('body')) && q(`backend_dispatch('member.mentor.roster', ['requesterId' => 'NGG-MS-M1', 'programme' => 'summer'])['error'] ?? ''`) === 'not_this_programme');
    chk('no page errors (mentor)', mt.errs.length === 0);
    if (mt.errs.length) console.error(mt.errs.join('\n'));

    // ── An admin covers both programmes: a chooser, and the two never mix ──
    const ad = await as('NGG-MS-ADM', true);
    await ad.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ad);
    await ad.waitForSelector('.m15x-cards', { timeout: 60000 });
    const hub = await ad.innerText('.m15x-cards');
    chk('/mentor offers an admin the NGG portal, Summer School and the class tools', /NGG mentor portal/.test(hub) && /Summer School/.test(hub) && /class tools/.test(hub));
    await ad.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/hub.png' : path.join(TMP, 'hub.png') });
    await ad.click('.m15x-cards >> text=Summer School');
    await ad.waitForFunction(() => location.pathname === '/mentor/summer', null, { timeout: 10000 });
    await ad.waitForFunction(() => /Pick a centre|Peace Summer|participant/.test(document.body.innerText), null, { timeout: 60000 });
    const pick = await ad.$('select');
    const opts = pick ? await pick.evaluate(el => Array.from(el.options).map(o => o.value).filter(Boolean)) : [];
    chk('Summer School offers an admin only Summer School centres (one here, so no picker)', opts.every(o => o === 'Egbeda (Summer School)'));
    if (pick) await pick.selectOption('Egbeda (Summer School)');
    await ad.waitForFunction(() => /Peace Summer/.test(document.body.innerText), null, { timeout: 60000 });
    const sumTxt = await ad.innerText('body');
    chk('/mentor/summer: Summer participants only, never NGG members', /Peace Summer/.test(sumTxt) && !/Mariam Yusuf|Daniel Okafor/.test(sumTxt) && /SUMMER SCHOOL/.test(sumTxt));
    await ad.goto(BASE + '/mentor/ngg', { waitUntil: 'domcontentloaded' });
    await ad.waitForSelector('.m15-app', { timeout: 60000 });
    const cs = await ad.$('.m15x-centre select');
    chk('a coordinator over two NGG centres gets a centre switcher, NGG centres only', !!cs && JSON.stringify(await cs.evaluate(el => Array.from(el.options).map(o => o.value))) === JSON.stringify(['Egbeda', 'Ikeja']));
    await ad.click('nav >> text=Mentees');
    await ad.waitForFunction(() => /Mariam Yusuf/.test(document.querySelector('main').innerText), null, { timeout: 60000 }).catch(async e => { console.error('DEBUG ngg', ad.errs.join('\n'), (await ad.innerText('main')).slice(0, 800), JSON.stringify(q(`backend_dispatch('member.mentor.caseload', ['requesterId' => 'NGG-MS-ADM'])`)).slice(0, 600)); throw e; });
    chk('/mentor/ngg as an admin: the coordinator view of NGG members, no Summer participant', !/Peace Summer/.test(await ad.innerText('main')) && /Centre coordinator/.test(await ad.innerText('.m15-app')));
    // Control Room → Learning → Saturday formation: edit a block, every portal reads it
    await ad.goto(BASE + '/control/learning/formation', { waitUntil: 'domcontentloaded' });
    await ad.waitForFunction(() => /Chess & strategic thinking/.test(document.body.innerText), null, { timeout: 60000 });
    await ad.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/admin-formation.png' : path.join(TMP, 'admin-formation.png') });
    await ad.click('tr:has-text("Chess & strategic thinking"), [role=row]:has-text("Chess & strategic thinking")');
    await ad.getByLabel('Key question or line').fill('What do you do after making a bad move?');
    await ad.click('button:has-text("Save block")');
    await ad.waitForFunction(() => /Every portal shows the new/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    chk('Control Room: saving a block changes the schedule every portal reads', q(`public_formation(['audience' => 'mentor'])['blocks'][7]['quote']`) === 'What do you do after making a bad move?');
    chk('…and a member without the content capability cannot', !q(`admin_formation_save(['requesterId' => 'NGG-MS-K1', 'key' => 'chess', 'quote' => 'x'])['ok'] ?? false`));
    chk('no page errors (admin)', ad.errs.length === 0);
    if (ad.errs.length) console.error(ad.errs.join('\n'));

    // ── A member: their dashboard carries their part of the Saturday ──
    const me = await as('NGG-MS-K1', false);
    // Member Portal v9 keeps the Saturday on its own screen (/dashboard/saturday).
    await me.goto(BASE + '/dashboard/saturday', { waitUntil: 'domcontentloaded' });
    await waitForBoot(me);
    await me.waitForSelector('.sf-day', { timeout: 60000 }).catch(() => {});
    chk('member dashboard: the Saturday schedule, the member’s part', await me.isVisible('.sf-day') && /Saturday formation/.test(await me.innerText('.sf-day')));
    chk('the family message for each block is a sentence, never the mentor’s notes', typeof q(`public_formation(['audience' => 'parent'])['blocks'][1]['part']`) === 'string');
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
