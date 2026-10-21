#!/usr/bin/env node
/* ============================================================================
   The NGG Club curriculum, end to end: real PHP server, real sessions, the
   real screens.

   What must hold:
     · The Control Room writes a lesson with a multiple-choice check, uploads a
       material file to this server's own store, and imports a CSV — checked
       first, nothing written until Import is pressed.
     · The member's dashboard shows their course's lessons by week; a lesson
       opens, is answered, and completes at the pass mark.
     · A written answer with no AI configured waits for the instructor, whose
       portal shows it beside the model answer; marking it completes the lesson.
     · The stored material serves to a signed-in reader and not to a stranger.

   Run:  node tests/curriculum-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CURRICULUM_PORT || '8281';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-curriculum-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'curriculum');

let _seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
function get(url, headers) {
  return new Promise((res, rej) => http.get(url, { headers }, r => {
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) }));
  }).on('error', rej));
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

async function contextFor(memberId, admin, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`, ['session']);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
  await ctx.addCookies([
    { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
    { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
  ]);
  return { ctx, token };
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  curriculum UI: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'curriculum_test_secret_0123456789ab',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'ai' => ['enabled' => false],
    'debug' => false,
  ];\n`);

  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-CU-ADM','fullName'=>'Curriculum Admin','email'=>'cu-adm@example.org','type'=>'NGG','status'=>'active','role'=>'club_admin','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-CU-M1','fullName'=>'Ada Learner','email'=>'cu-m1@example.org','type'=>'NGG','status'=>'active','role'=>'member','track'=>'Music','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-CU-INS','fullName'=>'Tobi Instructor','email'=>'cu-ins@example.org','type'=>'NGG','status'=>'active','role'=>'member','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('volunteers', ['volunteerId'=>'VOL-CU-1','fullName'=>'Tobi Instructor','email'=>'cu-ins@example.org','role'=>'instructor','courses'=>'["Music"]','centre'=>'Egbeda','status'=>'active','programme'=>'ngg','safeguarding'=>'cleared','createdAt'=>${now},'updatedAt'=>${now}]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];

    /* ── The Control Room ── */
    const { ctx: actx } = await contextFor('NGG-CU-ADM', true);
    const ap = await actx.newPage();
    ap.on('pageerror', e => errs.push('admin: ' + String(e).slice(0, 200)));
    /* The lesson editor, import, submissions and progress are the curriculum
       desk inside the Control Room (cr-tab-learning.jsx), one press below the
       lesson list — addressed directly. */
    await ap.goto(BASE + '/control/learning/curriculum/desk', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForSelector('.admin-empty, .admin-table', { timeout: 60000 });
    chk('the curriculum section opens, empty, saying how to start', /No lessons yet/.test(await ap.$eval('.admin-main', el => el.innerText)));

    await ap.click('button:has-text("New lesson")');
    await ap.waitForSelector('.cur-ed');
    await ap.fill('.cur-ed input[placeholder="e.g. Finding middle C"]', 'Finding middle C');
    await ap.selectOption('.cur-ed-grid select >> nth=0', 'Music');
    await ap.selectOption('.cur-ed-grid select >> nth=1', 'published');
    await ap.fill('.cur-ed textarea[placeholder^="Two or three"]', 'Where every pianist starts.');
    await ap.fill('.cur-ed-body', 'Middle C sits in the centre.\n\n- Find the two black keys\n- C is just to their left');
    // The editor's toolbar wraps the selection, and the preview renders it.
    await ap.$eval('.cur-ed-body', el => { el.focus(); el.setSelectionRange(0, 8); });
    await ap.click('.cur-rte-btn.is-b');
    chk('the toolbar bolds the selected words', (await ap.$eval('.cur-ed-body', el => el.value)).startsWith('**Middle C** sits'));
    await ap.click('.cur-rte-btn.is-preview');
    chk('…and the preview shows the lesson as a learner will see it', await ap.$eval('.cur-rte-preview', el => !!el.querySelector('strong') && !!el.querySelector('ul')));
    await ap.click('.cur-rte-btn.is-preview');
    await ap.waitForSelector('.cur-ed-body');
    // A material file, uploaded to this server's store.
    const pdf = path.join(TMP, 'scale-sheet.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    await ap.setInputFiles('.cur-ed-upload input[type=file]', pdf);
    await ap.waitForSelector('.cur-ed-mat', { timeout: 15000 });
    const matUrl = await ap.$eval('.cur-ed-mat input[aria-label="Material link"]', el => el.value);
    chk('a material file uploads to this server and joins the lesson', /^\/api\/member\/curriculum-file\.php\?f=[a-f0-9]+\.pdf$/.test(matUrl));
    await ap.click('button:has-text("+ Add a question")');
    await ap.fill('.cur-ed-check textarea[aria-label="Question"]', 'How many white keys are in an octave?');
    await ap.fill('.cur-ed-opt >> nth=0 >> input.admin-input', '5');
    await ap.fill('.cur-ed-opt >> nth=1 >> input.admin-input', '7');
    await ap.check('.cur-ed-opt >> nth=1 >> input[type=radio]');
    await ap.click('.cur-ed-foot button:has-text("Create lesson")');
    await ap.waitForFunction(() => /CUR-[A-F0-9]+ · v1/.test(document.querySelector('.cur-ed-bar')?.innerText || ''), null, { timeout: 15000 });
    chk('the lesson saves, published, with its check and material', php(`echo json_encode(db_row("SELECT u.status, (SELECT COUNT(*) FROM curriculum_checks c WHERE c.unitId = u.unitId) checks, (SELECT COUNT(*) FROM curriculum_materials m WHERE m.unitId = u.unitId) mats, (SELECT answer FROM curriculum_checks c WHERE c.unitId = u.unitId) ans FROM curriculum_units u WHERE title = 'Finding middle C'"));`) === '{"status":"published","checks":1,"mats":1,"ans":"1"}');
    await ap.screenshot({ path: path.join(SHOTS, 'editor.png'), fullPage: true });

    // The stored file serves to a signed-in reader, and not to a stranger.
    chk('the stored material does not serve without a session', (await get(BASE + matUrl)).status === 401);

    // Import a CSV: checked first, then imported.
    await ap.click('button:has-text("← All lessons")');
    await ap.click('.admin-tab:has-text("Import")');
    const csv = path.join(TMP, 'lessons.csv');
    fs.writeFileSync(csv, 'course,week,position,title,summary,check1,check1_answer,check1_rubric\n'
      + 'Music,1,2,"Hand position, and posture",Curved fingers.,Why curve your fingers?,Control and speed,Mentions control\n'
      + ',1,1,Welcome to the Club,Who we are.,,,\n'
      + 'Musik,2,1,Misspelt course,,,,\n');
    await ap.setInputFiles('.cur-imp input[type=file]', csv);
    await ap.waitForSelector('button:has-text("Check the file")');
    chk('a quoted comma stays in one cell', /3 lessons/.test(await ap.$eval('.cur-imp', el => el.innerText)));
    await ap.check('.cur-imp-opt:has-text("Publish") input');
    await ap.click('button:has-text("Check the file")');
    await ap.waitForSelector('.cur-imp-tally');
    const tally = await ap.$eval('.cur-imp-tally', el => el.innerText);
    chk('the check reports per row and writes nothing', /2\s*new/.test(tally) && /1\s*refused/.test(tally) && /nothing written/.test(tally)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM curriculum_units")['c'];`) === '1');
    chk('the misspelt course is refused with the nearest catalogue course', /did you mean Music/i.test(await ap.$eval('.cur-imp-plan', el => el.innerText)));
    await ap.click('.cur-imp-plan button:has-text("Import")');
    await ap.click('.modal-ok, button:has-text("Import") >> nth=-1').catch(() => {});
    await ap.waitForFunction(() => /imported\./.test(document.querySelector('.cur-imp-tally')?.innerText || ''), null, { timeout: 15000 });
    chk('Import writes the rows that passed', php(`echo (int)db_row("SELECT COUNT(*) c FROM curriculum_units WHERE status = 'published'")['c'];`) === '3');
    await ap.screenshot({ path: path.join(SHOTS, 'import.png'), fullPage: true });
    // The bundled course loads into the same check — and nothing is written by checking it.
    await ap.uncheck('.cur-imp-opt:has-text("Publish") input').catch(() => {});
    await ap.click('.cur-imp-seed:has-text("Practical Coding") button:has-text("Load to check")');
    await ap.waitForFunction(() => /72 lessons/.test(document.querySelector('.cur-imp')?.innerText || ''), null, { timeout: 15000 });
    await ap.click('button:has-text("Check the file")');
    await ap.waitForFunction(() => /nothing written/.test(document.querySelector('.cur-imp-tally')?.innerText || ''), null, { timeout: 30000 });
    const seedTally = await ap.$eval('.cur-imp-tally', el => el.innerText);
    chk('the bundled Practical Coding course loads to check: 72 new, none refused, nothing written', /72\s*new/.test(seedTally) && /0\s*refused/.test(seedTally)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM curriculum_units")['c'];`) === '3');

    /* ── The member ── */
    const { ctx: mctx, token: mtoken } = await contextFor('NGG-CU-M1', false, { width: 420, height: 900 });
    const mp = await mctx.newPage();
    mp.on('pageerror', e => errs.push('member: ' + String(e).slice(0, 200)));
    await mp.goto(BASE + '/dashboard/learning?classic=1', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.cur-item', { timeout: 40000 });
    chk('the member sees their course\'s lessons and the Club-wide one', (await mp.$$('.cur-item')).length === 3);
    chk('…grouped by week', /Week 1/i.test(await mp.$eval('.cur', el => el.innerText)));
    await mp.click('.cur-item:has-text("Finding middle C")');
    await mp.waitForSelector('.cur-mats button.cur-mat', { timeout: 15000 });
    chk('the lesson renders its formatting', await mp.$eval('.cur-text strong, .cur strong', el => el.textContent === 'Middle C'));
    await mp.click('.cur-mats button.cur-mat');
    chk('a PDF material opens inside the lesson, without leaving the platform', !!(await mp.waitForSelector('.cur-viewer iframe', { timeout: 10000 })));
    await mp.goto(BASE + '/dashboard/learning?classic=1', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.cur-item', { timeout: 40000 });
    const mat = await get(BASE + matUrl, { Cookie: 'ngg_sess=' + mtoken });
    chk('the stored material serves to a signed-in member, as the PDF it was', mat.status === 200 && mat.headers['content-type'] === 'application/pdf' && mat.body.toString().startsWith('%PDF'));
    chk('the dashboard offers the curriculum as a document', (await mp.$$('.cur-download a')).length === 2);
    const docHtml = await get(BASE + '/api/member/curriculum-doc.php', { Cookie: 'ngg_sess=' + mtoken });
    chk('the document opens print-ready, with every lesson and no answers', docHtml.status === 200 && /text\/html/.test(docHtml.headers['content-type'])
      && /Finding middle C/.test(docHtml.body) && /Save as PDF/.test(docHtml.body) && !/Control and speed/.test(docHtml.body));
    const docWord = await get(BASE + '/api/member/curriculum-doc.php?format=doc', { Cookie: 'ngg_sess=' + mtoken });
    chk('…and downloads as a Word file', docWord.status === 200 && docWord.headers['content-type'].startsWith('application/msword')
      && /attachment; filename="Music-curriculum-Ada-Learner\.doc"/.test(docWord.headers['content-disposition']));
    chk('…and is nobody else\'s to read', (await get(BASE + '/api/member/curriculum-doc.php')).status === 401);
    const dp = await mctx.newPage();
    await dp.goto(BASE + '/api/member/curriculum-doc.php');
    await dp.screenshot({ path: path.join(SHOTS, 'document.png'), fullPage: true });
    await dp.close();
    await mp.click('.cur-item:has-text("Finding middle C")');
    await mp.waitForSelector('.cur-lesson');
    chk('the lesson shows its text as a list, never as HTML, and its material', (await mp.$$('.cur-text li')).length === 2 && (await mp.$$('.cur-mat')).length === 1);
    await mp.click('.cur-opt:has-text("5")');
    await mp.click('button:has-text("Submit answers")');
    await mp.waitForSelector('.cur-result');
    chk('a wrong answer is marked on the spot, not completed', /0 of 1/.test(await mp.$eval('.cur-result', el => el.innerText)));
    await mp.click('.cur-opt:has-text("7")');
    await mp.click('button:has-text("Submit again")');
    await mp.waitForFunction(() => /Done/.test(document.querySelector('.cur-lesson-head .cur-chip')?.innerText || ''), null, { timeout: 15000 });
    chk('the right answer completes the lesson, and the right option is shown', (await mp.$$('.cur-opt.is-right')).length === 1);
    await mp.screenshot({ path: path.join(SHOTS, 'member-lesson.png'), fullPage: true });
    await mp.click('button:has-text("← All lessons")');
    await mp.click('.cur-item:has-text("Hand position")');
    await mp.waitForSelector('.cur-answer');
    await mp.fill('.cur-answer', 'So I can play faster and with control');
    await mp.click('button:has-text("Submit answers")');
    await mp.waitForSelector('.cur-result');
    chk('a written answer with no AI waits for the instructor', /with your instructor/.test(await mp.$eval('.cur-result', el => el.innerText)));

    /* ── The instructor ── */
    const { ctx: ictx } = await contextFor('NGG-CU-INS', false);
    const ip = await ictx.newPage();
    ip.on('pageerror', e => errs.push('instructor: ' + String(e).slice(0, 200)));
    await ip.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ip);
    await ip.waitForSelector('[role=tab]:has-text("Curriculum")', { timeout: 40000 });
    await ip.click('[role=tab]:has-text("Curriculum")');
    await ip.waitForSelector('.cur-staff-card', { timeout: 20000 });
    const card = await ip.$eval('.cur-staff-card', el => el.innerText);
    chk('the NGG instructor sees the answer beside the model answer', /play faster and with control/.test(card) && /Control and speed/.test(card));
    await ip.fill('.cur-mark-pts', '1');
    await ip.fill('.cur-mark-fb', 'Yes — control matters most.');
    await ip.click('button:has-text("Save marks")');
    await ip.waitForFunction(() => /Nothing waiting/.test(document.querySelector('.cur-staff')?.innerText || ''), null, { timeout: 15000 });
    chk('marking it completes the member\'s lesson', php(`echo db_row("SELECT p.status FROM curriculum_progress p JOIN curriculum_units u ON u.unitId = p.unitId WHERE u.title LIKE 'Hand position%'")['status'];`) === 'completed');
    await ip.screenshot({ path: path.join(SHOTS, 'instructor.png'), fullPage: true });

    /* ── An instructor's material, approved ── */
    await ip.click('.scm-row-btn:has-text("Finding middle C")');
    await ip.click('button:has-text("+ Add a material")');
    await ip.fill('.cur-staff-matform input[placeholder^="e.g. Bow hold"]', 'Middle C, slowed down');
    await ip.fill('.cur-staff-matform input[placeholder^="https://"]', 'https://www.youtube.com/watch?v=middlec');
    await ip.click('button:has-text("Send for approval")');
    await ip.waitForSelector('.cur-staff-sub', { timeout: 15000 });
    chk('an instructor sends a material, and it waits for approval', /Waiting for approval/.test(await ip.$eval('.cur-staff-sub', el => el.innerText))
      && php(`echo db_row("SELECT status FROM curriculum_materials WHERE title = 'Middle C, slowed down'")['status'];`) === 'pending');
    await ap.click('.admin-tab:has-text("Submissions")');
    await ap.waitForSelector('.cur-subs .admin-table', { timeout: 15000 });
    chk('the editor sees it in Submissions, from the instructor', /Middle C, slowed down/.test(await ap.$eval('.cur-subs', el => el.innerText)) && /Tobi Instructor/.test(await ap.$eval('.cur-subs', el => el.innerText)));
    await ap.click('.cur-subs .admin-table thead input[type=checkbox]');
    await ap.click('.admin-bulkbar button:has-text("Approve")');
    await ap.click('.modal-ok, button:has-text("Approve") >> nth=-1').catch(() => {});
    await ap.waitForFunction(() => /Nothing waiting/.test(document.querySelector('.cur-subs')?.innerText || ''), null, { timeout: 15000 });
    chk('approving puts it in the lesson', php(`echo db_row("SELECT status FROM curriculum_materials WHERE title = 'Middle C, slowed down'")['status'];`) === 'approved');
    await ap.screenshot({ path: path.join(SHOTS, 'submissions.png'), fullPage: true });

    /* ── Progress ── */
    await ap.click('.admin-tab:has-text("Progress")');
    await ap.waitForSelector('.cur-bar');
    chk('the progress report counts completions per lesson', /1 of 1/.test(await ap.$eval('.admin-main', el => el.innerText)));

    // Deadlines: the term is set on the Progress tab.
    chk('the Progress tab offers deadlines, unset until a term is given', /not set: nothing is due yet/.test(await ap.$eval('.cur-sched summary', el => el.innerText)));
    await ap.fill('.cur-sched input[type=date]', '2026-09-07');
    await ap.click('.cur-sched button:has-text("Save deadlines")');
    await ap.waitForFunction(() => /term began 2026-09-07/.test(document.querySelector('.cur-sched summary')?.innerText || ''), null, { timeout: 15000 });
    chk('…and saving the term start is kept', JSON.parse(php(`echo setting_raw('curriculum');`)).startDate === '2026-09-07');

    // The companion: the member's weekly check-in, and the staff board.
    await mp.goto(BASE + '/dashboard/companion?classic=1', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.comp-now', { timeout: 40000 });
    chk('the member sees their companion check-in, with next steps', (await mp.$$('.comp-list.is-focus li')).length >= 1 && (await mp.$$('.comp-tile')).length === 6);
    await mp.screenshot({ path: path.join(SHOTS, 'companion.png'), fullPage: true });
    await ap.evaluate(() => window.__adminSection('companion'));
    await ap.waitForSelector('.admin-main .admin-table', { timeout: 30000 });
    chk('the staff board lists the member with their rating and reasons', /Ada Learner/.test(await ap.$eval('.admin-main', el => el.innerText)));

    chk('no page errors on any screen', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (curriculum UI)');
  process.exit(failed ? 1 : 0);
})();
