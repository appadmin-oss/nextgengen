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
const chk = (m, c, x) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m + (x ? ' — ' + x : '')); } };
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
        foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId' => "MEN-MS-$i", 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
        db_insert('mentor_policy', ['mentorId' => "MEN-MS-$i", 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'x', 'acceptedAt' => $now]);
      }
      foreach ([1 => 'Mariam Yusuf', 2 => 'Daniel Okafor', 3 => 'Kemi Adewale'] as $i => $n) $mk("NGG-MS-K$i", $n);
      // A Summer School mentor on their first day: no Academy yet.
      $mk('NGG-MS-S1', 'Sade Summer');
      db_insert('mentors', ['mentorId' => 'MEN-MS-S', 'fullName' => 'Sade Summer', 'email' => 'sade.summer@pod.example', 'status' => 'active', 'centre' => 'Egbeda (Summer School)',
        'programme' => 'summer', 'memberId' => 'NGG-MS-S1', 'checkedAt' => $now, 'createdAt' => $now]);
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
    chk('This week: the formation schedule sits under the page title, never above it', await mt.evaluate(() => { const h = document.querySelector('main h1'), f = document.querySelector('main .sf-day'); return !!(h && f) && !!(h.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING); }));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/week.png' : path.join(TMP, 'week.png') });
    // Mentees
    await mt.click('nav >> text=Mentees');
    await mt.waitForFunction(() => /Mariam Yusuf/.test(document.querySelector('main').innerText) && /Daniel Okafor/.test(document.querySelector('main').innerText), null, { timeout: 30000 });
    chk('Mentees lists exactly her caseload', !/Kemi Adewale/.test(await mt.innerText('main')));
    chk('Mentees: each row’s columns line up with the header', await mt.evaluate(() => {
      const hd = Array.from(document.querySelectorAll('main span')).find(e => e.textContent === 'Last one-to-one'); const cell = Array.from(document.querySelectorAll('main span')).find(e => e.textContent === 'Never');
      return !!(hd && cell) && Math.abs(hd.getBoundingClientRect().left - cell.getBoundingClientRect().left) < 2; }));
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/list.png' : path.join(TMP, 'list.png') });
    // Open Mariam, score her month
    await mt.click('main >> text=Mariam Yusuf');
    await mt.waitForFunction(() => /Overview/.test(document.querySelector('main').innerText) && !document.querySelector('.m15x-load'), null, { timeout: 30000 });
    await mt.waitForFunction(() => /record yet|·/.test(document.querySelector('main').innerText), null, { timeout: 15000 }).catch(() => {});
    chk('Overview: an empty record says so and offers the next step, never a blank panel', /Nothing on Mariam’s record yet/.test(await mt.innerText('main')) && await mt.isVisible('main button:has-text("Log a session") >> nth=1'));
    await mt.click('main [role="tab"]:has-text("Relationship")');
    await mt.waitForFunction(() => /rates it/.test(document.querySelector('main').innerText), null, { timeout: 15000 }).catch(() => {});
    const relTxt = await mt.innerText('main');
    chk('Relationship: an unasked check reads “Not yet”, never a bare “/ 5”', /Not yet/.test(relTxt) && !/(^|\n)\s*\/ 5/.test(relTxt));
    await mt.click('main [role="tab"]:has-text("Family")');
    await mt.waitForFunction(() => /SMS and the family app/.test(document.querySelector('main').innerText), null, { timeout: 15000 }).catch(() => {});
    const famTxt = await mt.innerText('main');
    chk('Family: with no guardian named, no “their family” and no “last update days ago”', !/their family|update\s+days ago/i.test(famTxt) && /no update yet/.test(famTxt) && /Good afternoon\. On Saturday/.test(await mt.inputValue('main textarea')));
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
    chk('Pod growth: By mentee lists every mentee, the unscored one marked as not scored yet', /Daniel Okafor/.test(await mt.innerText('main')) && /Not scored for/.test(await mt.innerText('main')));
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
    // The Saturday evaluation: Mariam's card is open (the first not yet evaluated); rate everything, by keyboard-reachable radios.
    chk('After: progress counts evaluations, due Monday', /0 of 1 evaluated · due Monday/.test(await mt.innerText('main')));
    const card = mt.locator('main section[aria-label="Saturday evaluation for Mariam Yusuf"]');
    chk('After: the register pre-fills the evaluation (assignment handed in, the detail as the strength)',
      await card.getByRole('radiogroup', { name: 'Assignment for Mariam Yusuf' }).getByRole('radio', { name: 'Demonstrated' }).getAttribute('aria-checked') === 'true'
      && /Offered to present first/.test(await card.locator('textarea').first().inputValue()));
    for (const [g, o] of [['Effort', 'Strong'], ['Character', 'Steady'], ['Wellbeing', 'Steady']]) await card.getByRole('radiogroup', { name: g + ' for Mariam Yusuf' }).getByRole('radio', { name: o, exact: true }).click();
    await card.locator('button:has-text("Save evaluation")').click({ force: true });
    chk('After: an incomplete evaluation names what is left, and saves nothing', /Still to do:/.test(await card.innerText()) && !q(`db_row("SELECT 1 FROM mentor_reviews WHERE subjectId = 'NGG-MS-K1' AND evalJson <> ''")`));
    for (const [c, o] of [['Punctuality', 'Demonstrated'], ['Participation', 'Strong'], ['Respect', 'Demonstrated'], ['Teamwork', 'Emerging'], ['Courage', 'Strong'], ['Initiative', 'Emerging'], ['Reflection', 'Demonstrated']]) {
      const r = card.getByRole('radiogroup', { name: c + ' for Mariam Yusuf' }).getByRole('radio', { name: o, exact: true });
      await r.focus(); await mt.keyboard.press('Enter');
    }
    await card.locator('textarea').nth(1).fill('Practise the two-minute talk once at home.');
    await card.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/after-evaluating.png' : path.join(TMP, 'after-evaluating.png') });
    await card.locator('button:has-text("Save evaluation")').click();
    await mt.waitForFunction(() => /Evaluation saved for Mariam/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    await mt.waitForTimeout(800);
    const evRow = JSON.parse((q(`db_row("SELECT evalJson FROM mentor_reviews WHERE subjectId = 'NGG-MS-K1' AND evalJson <> ''")`) || {}).evalJson || '{}');
    chk('After: a full Saturday evaluation is on her row (8 criteria, strength from the register, the next step)',
      Object.keys(evRow.criteria || {}).length === 8 && evRow.criteria.participation === 'Strong' && evRow.criteria.assignment === 'Demonstrated'
      && /Offered to present first/.test(evRow.strength || '') && evRow.next === 'Practise the two-minute talk once at home.');
    chk('After: the card reads Evaluated and the count moves', /1 of 1 evaluated/.test(await mt.innerText('main')) && /Evaluated/.test(await card.innerText()));
    chk('her own read returns it, without the staff fields', (() => { const r = q(`backend_dispatch('member.saturday.evals', ['requesterId' => 'NGG-MS-K1'])`); return r.evals.length === 1 && r.evals[0].next === 'Practise the two-minute talk once at home.' && !('line' in r.evals[0]); })());
    await mt.screenshot({ path: process.env.MP15_SHOTS ? process.env.MP15_SHOTS + '/after-evaluated.png' : path.join(TMP, 'after-evaluated.png'), fullPage: true });
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
    await waitForBoot(mt);
    await mt.waitForFunction(() => /Waiting for you/.test((document.querySelector('main') || {}).innerText || ''), null, { timeout: 60000 });
    chk('/mentor?tab=results lands on Class › School results at /mentor/class, inside the portal',
      new URL(mt.url()).pathname === '/mentor/class' && /tab=results/.test(mt.url()) && await mt.isVisible('.m15-app') && !(await mt.$('.m15x-classic')));
    await mt.goto(BASE + '/mentor/summer', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mt);
    await mt.waitForFunction(() => /no class|isn’t/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    chk('an NGG-only mentor is refused the Summer School portal', !/Peace Summer/.test(await mt.innerText('body')) && q(`backend_dispatch('member.mentor.roster', ['requesterId' => 'NGG-MS-M1', 'programme' => 'summer'])['error'] ?? ''`) === 'not_this_programme');
    chk('no page errors (mentor)', mt.errs.length === 0);
    if (mt.errs.length) console.error(mt.errs.join('\n'));

    // ── First login: a new mentor's portal opens on the Academy's "Start here", and stays there until it is passed ──
    const nb = await as('NGG-MS-M3', false);
    await nb.goto(BASE + '/mentor/ngg', { waitUntil: 'domcontentloaded' });
    await waitForBoot(nb);
    const lockedIn = await nb.waitForFunction(() => /Start here: 0 of 6 portal guides done/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true).catch(() => false);
    chk('a new mentor’s first login opens on the Academy’s “Start here”, saying how long it takes', lockedIn && /about \d+ minutes/.test(await nb.innerText('main')));
    chk('…with the portal guides first, and the nav holding only the Academy', /Start here: using the portal/.test(await nb.innerText('main'))
      && !(await nb.$$eval('.m15-app nav', ns => ns.map(n => n.innerText).join(' '))).match(/Mentees|Saturday|Messages/));
    chk('…Report a concern still one press away', (await nb.$$('text=Report a concern')).length > 0);
    chk('…and the server refuses the portal’s writes until then', q(`backend_dispatch('member.mentor.session.save', ['requesterId' => 'NGG-MS-M3', 'type' => 'one_to_one'])['error'] ?? ''`) === 'orientation_required');
    php(`foreach (array_slice(academy_orientation_ids('mentor', ['ngg']), 0, 5) as $m) db_insert('mentor_academy', ['mentorId' => 'MEN-MS-3', 'moduleId' => $m, 'score' => 100, 'passedAt' => now_iso()]);`);
    await nb.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(nb);
    await nb.waitForFunction(() => /Start here: 5 of 6 portal guides done/.test(document.body.innerText), null, { timeout: 60000 });
    const lastId = q(`academy_orientation_ids('mentor', ['ngg'])[5]`); const lastMod = q(`(function () { foreach (ms_academy()['modules'] as $m) if ($m['id'] === '${lastId}') return $m; })()`);
    await nb.evaluate(t => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.parentElement && x.parentElement.innerText.includes(t)); b && b.click(); }, lastMod.title);
    const cont = async () => { await nb.evaluate(() => { const b = Array.from(document.querySelectorAll('main button')).filter(x => /^(Continue|See result)$/.test(x.innerText.trim())).pop(); b && b.click(); }); await nb.waitForTimeout(150); };
    for (let k = 0; k < lastMod.lessons.length; k++) await cont();
    const choose = async txt => { await nb.evaluate(t => { const b = Array.from(document.querySelectorAll('main [role=radio]')).find(x => x.innerText.trim() === t); b && b.click(); }, txt); await nb.waitForTimeout(100); await cont(); };
    if (lastMod.scenario) await choose(lastMod.scenario.options.find(o => o.right).text);
    for (const qq of lastMod.quiz) await choose(qq.options[qq.answer]);
    const opened = await nb.waitForFunction(() => /Passed · 100%/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true).catch(() => false);
    await nb.waitForFunction(() => /Mentees/.test(Array.from(document.querySelectorAll('.m15-app nav')).map(n => n.innerText).join(' ')), null, { timeout: 30000 }).catch(() => {});
    chk('passing the last guide in the portal opens the whole portal', opened && /Mentees/.test(await nb.$$eval('.m15-app nav', ns => ns.map(n => n.innerText).join(' '))));
    chk('no page errors (new mentor)', nb.errs.length === 0);
    if (nb.errs.length) console.error(nb.errs.join('\n'));

    // ── A Summer School mentor's first login: the Academy, with the Summer School portal's own guides ──
    const sm = await as('NGG-MS-S1', false);
    await sm.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(sm);
    const smLocked = await sm.waitForFunction(() => /Start here: 0 of 3 portal guides done/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true).catch(() => false);
    const smTxt = await sm.innerText('body');
    chk('a Summer School mentor’s first login opens the Mentor Academy too, not the portal', smLocked && /Mentor Academy/.test(smTxt) && !/Peace Summer/.test(smTxt));
    chk('…with the Summer School portal’s guides, not the NGG portal’s', /Summer School portal: your participants/.test(smTxt) && /Summer School portal: reviews, conversations and goals/.test(smTxt)
      && !/This week and what’s due/.test(smTxt));
    chk('…and Report a concern on the same screen', (await sm.$$('button:has-text("Report a concern")')).length === 1);
    chk('…and the server holds a Summer School save until then', q(`backend_dispatch('member.mentor.meeting.save', ['requesterId' => 'NGG-MS-S1', 'subjectId' => 'SUM-MP-1'])['error'] ?? ''`) === 'orientation_required');
    php(`foreach (['p07', 'p08', 'p06'] as $m) db_insert('mentor_academy', ['mentorId' => 'MEN-MS-S', 'moduleId' => $m, 'score' => 100, 'passedAt' => now_iso()]);`);
    await sm.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(sm);
    const smOpen = await sm.waitForFunction(() => /Peace Summer/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true).catch(() => false);
    chk('once done, /mentor opens their Summer School portal', smOpen && new URL(sm.url()).pathname === '/mentor/summer');
    await sm.goto(BASE + '/mentor/academy', { waitUntil: 'domcontentloaded' });
    await waitForBoot(sm);
    chk('…and the Academy stays a page away for renewals (/mentor/academy)', await sm.waitForFunction(() => /Mentor Academy/.test(document.body.innerText) && /3 of \d+ modules complete/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true).catch(() => false));
    chk('no page errors (Summer School mentor)', sm.errs.length === 0);
    if (sm.errs.length) console.error(sm.errs.join('\n'));

    // ── An admin covers both programmes: a chooser, and the two never mix ──
    const ad = await as('NGG-MS-ADM', true);
    ad.on('response', r => { if (/\/api\/member\/mentor\.php/.test(r.url()) && r.status() >= 400) ad.bad400 = (ad.bad400 || '') + r.url(); });
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
    await waitForBoot(ad);
    await ad.waitForSelector('.m15-app', { timeout: 60000 });
    const cs = await ad.$('.m15x-centre select');
    chk('a coordinator over two NGG centres gets a centre switcher, NGG centres only', !!cs && JSON.stringify(await cs.evaluate(el => Array.from(el.options).map(o => o.value))) === JSON.stringify(['Egbeda', 'Ikeja']));
    await ad.click('nav >> text=Mentees');
    await ad.waitForFunction(() => /Mariam Yusuf/.test(document.querySelector('main').innerText), null, { timeout: 60000 }).catch(async e => { console.error('DEBUG ngg', ad.errs.join('\n'), (await ad.innerText('main')).slice(0, 800), JSON.stringify(q(`backend_dispatch('member.mentor.caseload', ['requesterId' => 'NGG-MS-ADM'])`)).slice(0, 600)); throw e; });
    chk('a coordinator with no mentor record has no Academy to fail on (no tab, no request)', !(await ad.innerText('.m15-app')).includes('Academy') && !ad.bad400);
    const rosterCentre = ad.waitForRequest(r => /\/member\/mentor\.php\?centre=/.test(r.url()), { timeout: 30000 }).catch(() => null);
    await ad.locator('.m15-app button', { hasText: /^Class$/ }).first().click();
    await ad.waitForSelector('main .m15c .m15c-card', { timeout: 30000 });
    await ad.waitForFunction(() => !document.querySelector('main .m15c [role="status"]'), null, { timeout: 30000 }).catch(() => {});
    const rq = await rosterCentre;
    chk('a coordinator’s Class screens open on the portal’s centre, with no second “Pick a centre” and no error',
      !!rq && /centre=Egbeda/.test(rq.url()) && !/Pick a centre|Couldn't load/.test(await ad.innerText('main')), (rq ? rq.url() : 'no roster request') + ' | ' + (await ad.innerText('main')).slice(0, 300).replace(/\n/g, ' '));
    await ad.click('nav >> text=Mentees');
    chk('/mentor/ngg as an admin: the coordinator view of NGG members, no Summer participant', !/Peace Summer/.test(await ad.innerText('main')) && /Centre coordinator/.test(await ad.innerText('.m15-app')));
    // Control Room → Learning → Saturday formation: edit a block, every portal reads it
    await ad.goto(BASE + '/control/learning/formation', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ad);
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
