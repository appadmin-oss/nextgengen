#!/usr/bin/env node
/* ============================================================================
   Instructor Portal v6, end to end (docs/design/portals/instructor-portal-v6.dc.html): the Mentor Portal opens on the
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
const PORT = process.env.IP6_PORT || '8313';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ip6-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=1 -d error_reporting=-1 ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed (' + e.status + '): ' + String(e.stdout || '') + String(e.stderr || '') + ' ' + fs.readFileSync(f, 'utf8').slice(0, 200)); }
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
  if (!chromium) { console.log('⏭  instructor v6: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'ip6_e2e_secret_portal_x_0123456789abc',
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
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@class.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk('NGG-IN-ADM', 'Ade Admin', 'super_admin');
      $mk('NGG-IN-INS', 'Tunde Teacher');
      db_insert('volunteers', ['volunteerId' => 'VOL-IN-1', 'fullName' => 'Tunde Teacher', 'email' => 'tunde.teacher@class.example', 'role' => 'instructor', 'courses' => '["Coding"]', 'centre' => 'Egbeda',
        'status' => 'active', 'programme' => 'ngg', 'safeguarding' => 'cleared', 'memberId' => 'NGG-IN-INS', 'createdAt' => $now]);
      // Tunde has taught here for a while: the Academy's "Start here" is behind him. Femi starts today.
      foreach (academy_required_ids('instructor') as $mod) db_insert('academy_passes', ['track' => 'instructor', 'personId' => 'NGG-IN-INS', 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
      $mk('NGG-IN-NEW', 'Femi New');
      db_insert('volunteers', ['volunteerId' => 'VOL-IN-2', 'fullName' => 'Femi New', 'email' => 'femi.new@class.example', 'role' => 'instructor', 'courses' => '["Coding"]', 'centre' => 'Egbeda',
        'status' => 'active', 'programme' => 'ngg', 'safeguarding' => 'cleared', 'memberId' => 'NGG-IN-NEW', 'createdAt' => $now]);
      foreach ([1 => 'Zara Ibrahim', 2 => 'Kelechi Ike', 3 => 'Mariam Yusuf', 4 => 'Samuel Ade'] as $i => $n) $mk("NGG-IN-K$i", $n, 'member', ['track' => 'Coding', 'dob' => '2013-03-0' . $i]);
      db_insert('mentors', ['mentorId' => 'MEN-IN-1', 'fullName' => 'Ngozi Eke', 'email' => 'ngozi@class.example', 'status' => 'active', 'centre' => 'Egbeda', 'programme' => 'ngg', 'memberId' => '', 'createdAt' => $now]);
      db_insert('mentor_assignments', ['mentorId' => 'MEN-IN-1', 'memberId' => 'NGG-IN-K1', 'status' => 'active', 'startedAt' => $now]);
      setting_set('course_skills', ['Coding' => ['Reads an error message and acts on it', 'Writes a loop that does what they meant', 'Breaks a problem into steps']]);
      // A term that began two weeks ago, and a published lesson with a choice question for every week, so this week's hinge comes from the lesson.
      setting_set('curriculum', ['startDate' => gmdate('Y-m-d', time() - 14 * 86400)]);
      for ($w = 1; $w <= 5; $w++) {
        db_insert('curriculum_units', ['unitId' => "CU-IN-$w", 'course' => 'Coding', 'level' => '', 'week' => $w, 'position' => 1, 'title' => "Coding week $w", 'status' => 'published', 'version' => 1, 'createdAt' => $now]);
        db_insert('curriculum_checks', ['checkId' => "CHK-IN000$w", 'unitId' => "CU-IN-$w", 'kind' => 'mcq', 'prompt' => "Week $w question: which tag is a heading?", 'options' => json_encode(['<p>', '<h1>', '<div>']), 'answer' => '1', 'points' => 1, 'position' => 1]);
      }
      db_insert('timetable_slots', ['slotId' => 'TT-IN-1', 'centreId' => 'C-EG', 'course' => 'Coding', 'weekday' => 6, 'startTime' => '11:00', 'endTime' => '12:30', 'room' => 'Lab 1', 'status' => 'active', 'createdAt' => $now]);
      db_insert('skill_marks', ['subjectId' => 'NGG-IN-K1', 'course' => 'Coding', 'skill' => 'Reads an error message and acts on it', 'level' => 4, 'prevLevel' => 3, 'markedById' => 'x', 'markedByName' => 'x', 'centre' => 'Egbeda', 'updatedAt' => $now]);
      db_insert('skill_marks', ['subjectId' => 'NGG-IN-K2', 'course' => 'Coding', 'skill' => 'Reads an error message and acts on it', 'level' => 1, 'markedById' => 'x', 'markedByName' => 'x', 'centre' => 'Egbeda', 'updatedAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));
    const shot = (pg, n) => pg.screenshot({ path: (process.env.IP6_SHOTS || TMP) + '/' + n + '.png' });
    const sess = () => q(`db_row("SELECT * FROM club_class_sessions WHERE course = 'Coding' AND centre = 'Egbeda' ORDER BY id DESC LIMIT 1")`) || {};

    // ── The instructor: /instructor sends them straight to /instructor/ngg ──
    const ip = await as('NGG-IN-INS', false);
    await ip.goto(BASE + '/instructor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ip);
    await ip.waitForSelector('.i6-app', { timeout: 60000 }).catch(async e => { console.error('DEBUG', ip.errs.join('\n'), await ip.evaluate(() => { document.querySelectorAll('details').forEach(x => x.open = true); return document.body.innerText.slice(0, 1500); })); throw e; });
    await ip.waitForFunction(() => !document.querySelector('.m15x-load'), null, { timeout: 60000 });
    chk('/instructor sends an NGG instructor to /instructor/ngg', new URL(ip.url()).pathname === '/instructor/ngg');
    const t = await ip.innerText('.i6-app');
    chk('Today: the course, its room and time from the timetable, and the Saturday formation day', /Coding/.test(t) && /Lab 1/.test(t) && /11:00/.test(t) && /Musing/.test(t));
    await shot(ip, 'today');
    // Roll
    await ip.click('nav >> text=Saturday');
    await ip.waitForFunction(() => /Mark everyone here/.test(document.querySelector('main').innerText), null, { timeout: 20000 });
    await ip.click('main button[aria-pressed]:near(:text("Zara Ibrahim"))').catch(() => ip.click('main button[aria-pressed]'));
    await ip.waitForTimeout(1800);
    chk('Roll: a tap is saved on the class record', /here/.test((sess().rollJson || '')));
    await shot(ip, 'roll');
    await ip.click('main button:has-text("Close roll")');
    await ip.waitForFunction(() => /Roll closed/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    await ip.waitForTimeout(800);
    chk('Roll: closing it records the time and adds the children marked here to the centre’s attendance', !!sess().rollClosedAt && q(`(int)db_row("SELECT COUNT(*) c FROM attendance WHERE method = 'instructor'")['c']`) >= 1);
    // Plan: the lesson's own questions
    await ip.click('main >> text=Plan');
    await ip.waitForSelector('main input[aria-label="Lesson goal"]', { timeout: 20000 });
    const planTxt = await ip.innerText('main');
    chk('Plan: the hinge question is this week’s lesson check, and retrieval comes from earlier weeks', /Week \d question: which tag is a heading\?/.test(planTxt) && /B <h1>/.test(planTxt));
    await ip.fill('main input[aria-label="Lesson goal"]', 'Everyone can build a page with a heading and a paragraph');
    await ip.waitForTimeout(2200);
    chk('Plan: the goal and the six phases are saved to the class record', /build a page with a heading/.test(sess().planJson || '') && (JSON.parse(sess().planJson || '{}').steps || []).length === 6);
    await shot(ip, 'plan');
    // Exit ticket
    await ip.click('main >> text=Exit ticket');
    await ip.waitForFunction(() => /Mark the rest/.test(document.querySelector('main').innerText), null, { timeout: 20000 });
    await ip.click('main button:has-text("Mark the rest")');
    await ip.click('main button:has-text("Save and add to next week")');
    await ip.waitForTimeout(1500);
    chk('Exit ticket: every child here marked, saved and done', !!sess().exitAt && /got/.test(sess().exitJson || ''));
    // Session log
    await ip.click('main >> text=Session log');
    await ip.waitForSelector('main textarea', { timeout: 20000 });
    await (await ip.$$('main textarea'))[0].fill('Headings and paragraphs; everyone built a page.');
    await ip.waitForTimeout(400);
    await ip.click('main button:has-text("File session log")');
    await ip.waitForFunction(() => /Session log filed/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    await ip.waitForTimeout(800);
    chk('Session log: filed with what was covered', !!sess().filedAt && /What we covered: Headings/.test(sess().logJson || ''));
    // Skills board: a move up needs evidence, then saves
    await ip.click('nav >> text=Progress');
    await ip.click('main >> text=Skills board');
    await ip.waitForFunction(() => /Save marks for this skill/.test(document.querySelector('main').innerText), null, { timeout: 20000 });
    const kRow = ip.locator('main div').filter({ hasText: 'Kelechi Ike' }).filter({ has: ip.locator('button:has-text("Can do it")') }).last();
    await kRow.locator('button:has-text("Can do it")').first().click();
    await ip.click('main button:has-text("Save marks for this skill")');
    await ip.waitForTimeout(500);
    chk('Skills: moving a child up asks what you saw first', /Add what you saw/.test(await ip.innerText('body')));
    await ip.fill('main textarea[placeholder*="Kelechi"], main input[placeholder*="Kelechi"]', 'Read the error out loud and fixed the missing tag.');
    await ip.click('main button:has-text("Save marks for this skill")');
    await ip.waitForTimeout(2000);
    const km = q(`db_row("SELECT level, evidence FROM skill_marks WHERE subjectId = 'NGG-IN-K2' AND skill = 'Reads an error message and acts on it'")`) || {};
    chk('Skills: the new level and its evidence are on the record', Number(km.level) === 3 && /missing tag/.test(km.evidence || ''));
    await shot(ip, 'skills');
    // Analytics and Teach: both loop over lists whose design variable was once `h`, which shadowed
    // the view's own createElement and crashed the screen ("h is not a function").
    await ip.click('main >> text=Analytics');
    await ip.waitForFunction(() => /Where the class is on each skill/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    const anaTxt = await ip.innerText('body');
    chk('Analytics: opens, with the class on each skill and every student’s row', /Where the class is on each skill/.test(anaTxt) && /Every student, every skill/.test(anaTxt) && !/SOMETHING BROKE/i.test(anaTxt));
    await ip.click('nav >> text=Saturday'); await ip.click('main >> text=Teach');
    await ip.waitForFunction(() => /Hinge check/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    const teachTxt = await ip.innerText('body');
    chk('Teach: opens with the hinge question’s answers to count', /Hinge check/.test(teachTxt) && /which tag is a heading/.test(teachTxt) && !/SOMETHING BROKE/i.test(teachTxt));
    // Curriculum: the course's lessons by term and week, with the week the Club is on.
    await ip.click('nav >> text=Resources'); await ip.click('main >> text=Curriculum');
    await ip.waitForFunction(() => /Coding week 1/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    const curTxt = await ip.innerText('main');
    chk('Curriculum: lessons grouped by term with the week the Club is on and this week’s lesson first, never a made-up class size',
      /Term 1/.test(curTxt) && /the Club is on week 3/.test(curTxt) && /This week[\s\S]*Coding week 3/.test(curTxt) && !/of 12 students/.test(curTxt));
    const views = ['src/modules/instructor6/ip6-view.jsx', 'src/modules/member9/mp9-view.jsx', 'src/modules/mentor15/mp15-view.jsx'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
    chk('Generated views: every loop variable is prefixed, so none can shadow h or F', views.every(t => !/\.map\(\((?!l_)/.test(t)));
    // Students → one student
    await ip.click('nav >> text=Students');
    await ip.waitForFunction(() => /Zara Ibrahim/.test(document.querySelector('main').innerText), null, { timeout: 20000 });
    chk('Students: the class list, with each child’s mentor available', q(`instructor_class(['requesterId' => 'NGG-IN-INS'])['roster'][3]['mentor'] ?? ''`) === 'Ngozi Eke' || /Ngozi Eke/.test(JSON.stringify(q(`instructor_class(['requesterId' => 'NGG-IN-INS'])['roster']`))));
    // Report a concern
    await ip.click('button[aria-label="Report a concern"]').catch(() => ip.click('text=Report a concern'));
    await ip.waitForSelector('select[aria-label="Which child"]', { timeout: 20000 });
    await ip.selectOption('select[aria-label="Which child"]', 'NGG-IN-K3');
    await ip.click('main button:has-text("Something they told me")');
    await ip.fill('main textarea[aria-label="What happened"]', 'She said someone at the gate took her phone.');
    await ip.click('main button:has-text("Send to safeguarding")');
    await ip.waitForFunction(() => /Reference SG-\d{6}/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    chk('Report a concern: one safeguarding case, with its reference on screen', q(`(int)db_row("SELECT COUNT(*) c FROM safeguarding_cases WHERE subjectId = 'NGG-IN-K3'")['c']`) === 1 && /Reference SG-/.test(await ip.innerText('body')));
    chk('a child outside the class is refused by the server', q(`instructor_class_roll(['requesterId' => 'NGG-IN-INS', 'marks' => ['NGG-IN-ADM' => 'here']])['ok'] ?? false`) === true && !/NGG-IN-ADM/.test(sess().rollJson || ''));
    // ── Assess and monitor: a member on Coding as their SECOND course is in the class; a written answer is marked and the child is told ──
    php(`$now = now_iso();
      db_insert('members', ['memberId' => 'NGG-IN-K5', 'fullName' => 'Bisi Okafor', 'email' => 'bisi@class.example', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda',
        'track' => 'Robotics', 'courses' => json_encode(['Robotics', 'Coding']), 'dob' => '2013-04-01', 'createdAt' => $now, 'updatedAt' => $now]);
      db_insert('curriculum_checks', ['checkId' => 'CHK-IN-TXT', 'unitId' => 'CU-IN-2', 'kind' => 'text', 'prompt' => 'Explain what a loop is', 'options' => '', 'answer' => 'It repeats steps', 'points' => 2, 'position' => 2]);
      $r = backend_dispatch('member.curriculum.submit', ['memberId' => 'NGG-IN-K2', 'unitId' => 'CU-IN-2', 'answers' => ['CHK-IN0002' => '1', 'CHK-IN-TXT' => 'A loop repeats the same steps until it is told to stop']]);
      echo json_encode($r);`);
    await ip.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(ip);
    await ip.waitForSelector('.i6-app', { timeout: 60000 });
    await ip.click('nav >> text=Students');
    await ip.waitForFunction(() => /Bisi Okafor/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    chk('Students: a member who takes Coding as their second course is in the class', /Bisi Okafor/.test(await ip.innerText('main')) && /5 in your class/.test(await ip.innerText('main')));
    await ip.click('nav >> text=Progress'); await ip.click('main >> text=Analytics');
    await ip.waitForFunction(() => /Coding week 2/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    chk('Analytics: each lesson says how many of the class finished it, not a made-up "/12"', /0\/5/.test(await ip.innerText('main')) && !/\/12\b/.test(await ip.innerText('main')));
    await ip.click('main >> text=Marking');
    await ip.waitForFunction(() => /Explain what a loop is/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    const mkTxt = await ip.innerText('main');
    chk('Marking: the written answer waits here, with the question and what the child wrote', /Explain what a loop is/.test(mkTxt) && /repeats the same steps/.test(mkTxt));
    await ip.click('main button[aria-pressed]:text-is("2")');
    await ip.fill('main textarea', 'Exactly right. Next, say when it stops.');
    await ip.click('main button:has-text("Save and next")');
    await ip.waitForFunction(() => /told/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    const pr = q(`db_row("SELECT pending, score, marks FROM curriculum_progress WHERE memberId = 'NGG-IN-K2' AND unitId = 'CU-IN-2'")`) || {};
    chk('Marking: the mark and the feedback are on the record, nothing left pending', Number(pr.pending) === 0 && /Exactly right/.test(pr.marks || ''));
    const nt = q(`db_row("SELECT title, body FROM notifications WHERE memberId = 'NGG-IN-K2' AND kind = 'curriculum' ORDER BY id DESC LIMIT 1")`) || {};
    chk('Marking: the child is told — the lesson, the score and the instructor\'s words', /Coding week 2/.test(nt.title || '') && /%/.test(nt.title || '') && /Exactly right/.test(nt.body || ''));
    await ip.waitForFunction(() => /All clear|Every written answer is marked/.test(document.querySelector('main').innerText), null, { timeout: 15000 }).catch(() => {});
    chk('Marking: the queue empties once it is marked', /All clear|Every written answer is marked/.test(await ip.innerText('main')));
    chk('no page errors (instructor)', ip.errs.length === 0);
    if (ip.errs.length) console.error(ip.errs.join('\n'));

    // ── A new instructor: every screen opens, but nothing saves until the Academy is complete ──
    const nw = await as('NGG-IN-NEW', false);
    await nw.goto(BASE + '/instructor/ngg', { waitUntil: 'domcontentloaded' });
    await waitForBoot(nw);
    const navTxt = () => nw.$$eval('.i6-app nav', ns => ns.map(n => n.innerText).join(' '));
    const bannerIn = await nw.waitForFunction(() => /Your Academy: 0 of 9 done/.test((document.querySelector('.m15x-acad') || {}).innerText || ''), null, { timeout: 60000 }).then(() => true).catch(() => false);
    chk('a new instructor can open the portal and move around it: Saturday, Progress and Students are there', /Saturday/.test(await navTxt()) && /Progress/.test(await navTxt()) && /Students/.test(await navTxt()));
    chk('…with a banner saying nothing saves until the Academy is complete', bannerIn && /nothing you do here saves/.test(await nw.innerText('.m15x-acad')));
    chk('…and the server refuses the class’s writes until then', q(`backend_dispatch('instructor.class.roll', ['requesterId' => 'NGG-IN-NEW'])['error'] ?? ''`) === 'orientation_required');
    php(`foreach (array_merge(['t01', 't02', 's01'], array_slice(academy_orientation_ids('instructor'), 0, 5)) as $m) db_insert('academy_passes', ['track' => 'instructor', 'personId' => 'NGG-IN-NEW', 'moduleId' => $m, 'score' => 100, 'passedAt' => now_iso()]);`);
    await nw.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(nw);
    await nw.waitForFunction(() => /Your Academy: 8 of 9 done/.test((document.querySelector('.m15x-acad') || {}).innerText || ''), null, { timeout: 60000 });
    await nw.click('.m15x-acad button:has-text("Open the Academy")');
    await nw.waitForSelector('main .sa-list', { timeout: 20000 });
    const lastI = q(`(function () { $id = academy_orientation_ids('instructor')[5]; foreach (academy_track('instructor')['modules'] as $m) if ($m['id'] === $id) return $m; })()`);
    await nw.click('main button:has-text("Start ' + lastI.title + '")');
    const cont = () => nw.click('main .sa-nav .sa-btn.is-primary');
    for (let k = 0; k < lastI.lessons.length; k++) await cont();
    const choose = async t => { await nw.click('main .sa-opt:has-text("' + t.replace(/"/g, '\\"') + '")'); await cont(); };
    if (lastI.scenario) await choose(lastI.scenario.options.find(o => o.right).text);
    for (const qq of lastI.quiz) await choose(qq.options[qq.answer]);
    const passed = await nw.waitForFunction(() => /Passed · 100%/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true).catch(() => false);
    await nw.click('nav >> text=Today');
    await nw.waitForFunction(() => !document.querySelector('.m15x-acad'), null, { timeout: 30000 }).catch(() => {});
    chk('completing the Academy lifts the banner, and the class saves', passed && (await nw.$$('.m15x-acad')).length === 0
      && q(`backend_dispatch('instructor.class.roll', ['requesterId' => 'NGG-IN-NEW'])['error'] ?? ''`) !== 'orientation_required');
    chk('no page errors (new instructor)', nw.errs.length === 0);
    if (nw.errs.length) console.error(nw.errs.join('\n'));

    // ── An admin teaches both programmes: a chooser ──
    const ad = await as('NGG-IN-ADM', true);
    await ad.goto(BASE + '/instructor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ad);
    await ad.waitForSelector('.m15x-cards', { timeout: 60000 }).catch(() => {});
    chk('/instructor offers an admin the NGG class and Summer School', /NGG Club class/.test(await ad.innerText('body')) && /Summer School/.test(await ad.innerText('body')));
    chk('no page errors (admin)', ad.errs.length === 0);
    if (ad.errs.length) console.error(ad.errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (instructor v6)` : `✅ PASS: ${passed} passed, 0 failed (instructor v6)`));
  process.exit(failed ? 1 : 0);
})();
