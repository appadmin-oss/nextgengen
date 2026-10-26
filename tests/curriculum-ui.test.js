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
    /* This suite is about what the IMPORT writes, counted row by row. The
       bundled curricula seed themselves on first boot, and 540 lessons
       arriving unasked turns "2 new" into "2 unchanged" and an empty section
       into a full one. Declined here, as a deployment running a different
       programme would decline them. */
    'seed_bundled_curriculum' => false,
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
    await ap.waitForSelector('.led');
    await ap.fill('.led-title', 'Finding middle C');
    await ap.selectOption('.led-card select >> nth=0', 'Music');
    await ap.selectOption('.led-status select', 'published');
    await ap.fill('.led textarea[placeholder^="What this session is"]', 'Where every pianist starts.');
    /* THE EDITOR IS NOT A TEXTAREA. An instructor writes into blocks that
       draw themselves, and markdown is only the file format underneath — so
       what is driven here is typing, not filling a field. Everything asserted
       is what a person would see on the screen. */
    const type = async (text) => { await ap.keyboard.type(text); await ap.keyboard.press('Enter'); };
    /* A blank lesson opens on the way IN, not on an empty page: the
       programme knows the shape of a Saturday, so it offers to lay one out.
       Here we take the other door and write from nothing. */
    await ap.waitForSelector('.le-start');
    chk('a blank lesson offers to lay out a whole NGG session rather than showing an empty page',
        /Lay out a whole session/.test(await ap.$eval('.le-start', el => el.innerText)));
    await ap.click('.le-start-alt:has-text("Start from nothing")');
    await ap.waitForSelector('.le-row:last-child .le-ed');
    await ap.click('.le-row:last-child .le-ed');
    await type('Middle C sits in the centre.');
    // "## " at the start of a line becomes a heading — and the characters go.
    await type('## Find it');
    chk('typing "## " makes a heading, and leaves no "##" on the screen',
        await ap.$eval('.le-doc', el => !!el.querySelector('.le-ed-h2') && !el.innerText.includes('##')));
    // "- " does the same for a list, and Enter continues it.
    await type('- Find the two black keys');
    await type('C is just to their left');
    chk('a list carries on by itself, one block per point',
        await ap.$$eval('.le-row-ul', els => els.length >= 2 && els[1].innerText.trim() === 'C is just to their left'));
    // "/" opens the add menu, where the diagrams are — nobody can guess a fence.
    await ap.keyboard.type('/');
    await ap.waitForSelector('.le-menu');
    await ap.fill('.le-menu-q', 'piano');
    await ap.click('.le-menu-list button:has-text("Piano keyboard")');
    await ap.waitForSelector('.le-row-keys');
    chk('the add menu puts a REAL keyboard in the lesson, drawn and already playing C E G',
        await ap.$eval('.le-row-keys', el => !!el.querySelector('.lb-keys svg') && el.querySelectorAll('.lb-keys .is-on').length === 6));
    chk('…and it is edited as notes, with no fence anywhere on the screen',
        await ap.$eval('.le-row-keys', el => {
          const chips = [...el.querySelectorAll('.le-chip > span')].map(c => c.textContent);
          return chips.join(' ') === 'C E G' && !el.innerText.includes('```');
        }));
    // A note is added as a note. The drawing follows.
    await ap.fill('.le-row-keys .le-chip-new input', 'B');
    await ap.keyboard.press('Enter');
    chk('adding a note redraws the keyboard', await ap.$eval('.le-row-keys', el => el.querySelectorAll('.lb-keys .is-on').length === 8));
    // …and taking it off again redraws it back, so the lesson that is saved
    // below is the C E G the member's own screen is checked against.
    await ap.click('.le-row-keys button[aria-label="Remove B"]');
    chk('removing a note redraws it back', await ap.$eval('.le-row-keys', el => el.querySelectorAll('.lb-keys .is-on').length === 6));

    // The session plan, built as minutes and names rather than "10 Warm up |".
    await ap.click('.le-bar .le-bbtn.is-add');
    await ap.click('.le-menu-list button:has-text("Session plan")');
    await ap.waitForSelector('.le-row-steps');
    chk('a session plan is minutes and names, drawn to scale as they are typed',
        await ap.$eval('.le-row-steps', el => el.querySelectorAll('.le-pairs > li').length === 3 && !!el.querySelector('.lb-steps')));

    chk('nothing anywhere in the editor shows raw markup',
        await ap.$eval('.le', el => !/```|\*\*|^#{1,3} /m.test(el.innerText)));

    // Bold, from the toolbar, on a real selection.
    await ap.$eval('.le-row:first-child .le-ed', el => {
      const r = document.createRange(); r.setStart(el.firstChild, 0); r.setEnd(el.firstChild, 8);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await ap.click('.le-bar .le-bbtn[aria-label^="Bold"]');
    chk('the toolbar bolds what is selected, on the screen and not as asterisks',
        await ap.$eval('.le-row:first-child .le-ed', el => (el.querySelector('strong') || el.querySelector('b'))?.textContent === 'Middle C' && !el.innerText.includes('**')));
    // A material file, uploaded to this server's store.
    const pdf = path.join(TMP, 'scale-sheet.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    await ap.setInputFiles('.led-upload input[type=file]', pdf);
    await ap.waitForSelector('.led-mat', { timeout: 15000 });
    const matUrl = await ap.$eval('.led-mat input[aria-label^="Material 1 link"]', el => el.value);
    chk('a material file uploads to this server and joins the lesson', /^\/api\/member\/curriculum-file\.php\?f=[a-f0-9]+\.pdf$/.test(matUrl));
    /* The review: one question they answer, one thing they DO. A published
       lesson cannot be multiple choice alone — in a programme where the
       thing being learned is played with two hands, picking the right words
       off a list a week later is not evidence that anybody can play. */
    await ap.click('.led-exam button:has-text("Add a question")');
    /* A new question is PRACTICAL by default. Four options is the quickest
       thing to type, so defaulting to it was defaulting to the review the
       programme refuses to publish. */
    chk('a new question is a practical one by default, not four options',
        await ap.$eval('.led-q >> nth=0 >> select[aria-label="Question 1 type"]', el => el.value) === 'task');
    await ap.selectOption('.led-q >> nth=0 >> select[aria-label="Question 1 type"]', 'mcq');
    await ap.fill('.led-q textarea[aria-label="Question 1"]', 'How many white keys are in an octave?');
    await ap.fill('.led-opt >> nth=0 >> input.admin-input', '5');
    await ap.fill('.led-opt >> nth=1 >> input.admin-input', '7');
    await ap.check('.led-opt >> nth=1 >> input[type=radio]');
    await ap.click('.led-exam button:has-text("Add a question")');
    await ap.fill('.led-q >> nth=1 >> textarea[aria-label="Question 2"]', 'Play a C major scale and say where your thumb went under.');
    await ap.fill('.led-q >> nth=1 >> textarea[aria-label="Rubric for question 2"]', 'Up to 3: played evenly (2); can say where the thumb crossed (1).');
    chk('the editor names the exam this course points at, so a question is held to that standard',
        /Trinity College London/.test(await ap.$eval('.led-exam', el => el.innerText)));
    await ap.click('.led-top button:has-text("Create lesson")');
    await ap.waitForFunction(() => /CUR-[A-F0-9]+ · version 1/.test(document.querySelector('.led-sub')?.innerText || ''), null, { timeout: 15000 });
    chk('the lesson saves, published, with its questions and material', php(`echo json_encode(db_row("SELECT u.status, (SELECT COUNT(*) FROM curriculum_checks c WHERE c.unitId = u.unitId) checks, (SELECT COUNT(*) FROM curriculum_materials m WHERE m.unitId = u.unitId) mats, (SELECT answer FROM curriculum_checks c WHERE c.unitId = u.unitId AND kind = 'mcq') ans FROM curriculum_units u WHERE title = 'Finding middle C'"));`) === '{"status":"published","checks":2,"mats":1,"ans":"1"}');
    await ap.screenshot({ path: path.join(SHOTS, 'editor.png'), fullPage: true });

    // The stored file serves to a signed-in reader, and not to a stranger.
    chk('the stored material does not serve without a session', (await get(BASE + matUrl)).status === 401);

    // Import a CSV: checked first, then imported.
    await ap.click('.led-back');
    await ap.click('.admin-tab:has-text("Import")');
    const csv = path.join(TMP, 'lessons.csv');
    fs.writeFileSync(csv, 'course,week,position,title,summary,check1,check1_answer,check1_rubric\n'
      + 'Music,1,2,"Hand position, and posture",Curved fingers.,Why curve your fingers?,Control and speed,Mentions control\n'
      /* Every row that is to PUBLISH needs a question for the week after to
         review. One without lands as a draft instead of being thrown out —
         which is what the row below is for. */
      + ',1,1,Welcome to the Club,Who we are.,Name one Club value and a time you saw somebody live it.,A named value and a real occasion,Not a definition\n'
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
    /* The member's own screen, which is the only one that counts. */
    chk('the lesson draws its keyboard diagram for the member, with C, E and G held down',
        await mp.$eval('.cur-text', el => !!el.querySelector('.lb-keys svg') && el.querySelectorAll('.lb-keys .is-on').length === 6));
    chk('…and it is announced, so the diagram reads aloud',
        /C, E, G/.test(await mp.$eval('.cur-text .lb-keys svg', el => el.getAttribute('aria-label') || '')));
    /* And it can be HEARD. A picture of a chord cannot teach what the chord
       sounds like, which for most of these lessons is the thing being taught.
       Nothing is marked as sounding until the learner asks. */
    chk('the diagram is silent and still until the learner presses play',
        (await mp.$$('.cur-text .lb-keys .is-sounding')).length === 0 && (await mp.$$('.cur-text .lb-keys .lb-play')).length === 1);
    await mp.click('.cur-text .lb-keys .lb-play');
    await mp.waitForTimeout(250);
    chk('…and pressing it walks the notes, lighting each as it sounds',
        (await mp.$$('.cur-text .lb-keys .is-sounding')).length >= 1);
    chk('…with every control labelled, and a button per note so one can be checked alone',
        (await mp.$$eval('.cur-text .lb-keys button', els => els.length === 4 && els.every(e => (e.getAttribute('aria-label') || '').length > 3))));
    /* The session bars are measured as DRAWN, not as declared. The share was
       computed correctly for weeks while the stylesheet put it in a fixed 4px
       column, so ten minutes and forty minutes were the same length on screen
       and the unit test — which read the style property — passed throughout. */
    const bars = await mp.$$eval('.cur-text .lb-step-bar', els => els.map(e => e.getBoundingClientRect().width));
    chk('the session bars are drawn to scale: 10 | 30 | 40 minutes reads 1 : 3 : 4 (' + bars.map(w => Math.round(w)).join(' | ') + ')',
        bars.length === 3 && bars[0] > 4 && Math.abs(bars[1] / bars[0] - 3) < 0.12 && Math.abs(bars[2] / bars[0] - 4) < 0.12);
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
    /* The lesson's OWN bullets — not every <li> on the screen. A diagram is
       allowed to be a list too (the session steps are an <ol>), so counting
       all of them made this check about which blocks the lesson happens to
       contain rather than about its prose. */
    chk('the lesson shows its text as a list, never as HTML, and its material',
        (await mp.$$('.cur-text ul:not(.lb-step-list) li')).length === 2 && (await mp.$$('.cur-mat')).length === 1);
    /* THE EXAM. It is two things now: what they can answer, and what they
       can DO — and the practical can be done HERE, with the work attached,
       rather than "bring it next Saturday". */
    chk('the exam asks for the work, not only an answer, and the work can be attached in the exam itself',
        (await mp.$$('.cur-check')).length === 2 && !!(await mp.$('.cur-attach-btn')));
    await mp.screenshot({ path: path.join(SHOTS, 'exam.png'), fullPage: true });
    await mp.click('.cur-opt:has-text("5")');
    await mp.fill('.cur-check >> nth=1 >> .cur-answer', 'I played it twice. My thumb went under on F.');
    await mp.click('button:has-text("Submit answers")');
    await mp.waitForSelector('.cur-result');
    chk('the recall half is marked on the spot; the practical holds the lesson open for a marker',
        /with your instructor/i.test(await mp.$eval('.cur-result', el => el.innerText)));
    await mp.click('.cur-opt:has-text("7")');
    await mp.click('button:has-text("Submit again")');
    await mp.waitForTimeout(1200);
    chk('…and a corrected answer still does not complete it by itself',
        php(`echo db_row("SELECT p.status FROM curriculum_progress p JOIN curriculum_units u ON u.unitId = p.unitId WHERE u.title = 'Finding middle C'")["status"];`) === 'submitted');
    await mp.screenshot({ path: path.join(SHOTS, 'member-lesson.png'), fullPage: true });
    await mp.click('button:has-text("← All lessons")');
    await mp.click('.cur-item:has-text("Hand position")');
    /* THE OPENING REVIEW. This is the second lesson of the course, so it
       opens on the PREVIOUS lesson's questions — before today's teaching is
       on the screen at all. That is the whole point: a test at the end of
       the hour measures the hour, with everything still on the whiteboard;
       a week later it measures what survived, and the remembering is what
       fixes it there. */
    await mp.waitForSelector('.cur-review');
    chk('a session opens with LAST week\'s questions, before today\'s teaching',
        /Finding middle C/.test(await mp.$eval('.cur-review', el => el.innerText))
        && !(await mp.$('.cur-text')) && !(await mp.$('.cur-checks')));
    chk('…and skipping to the lesson is always there, in plain words, for anyone who was away',
        /Skip to today/.test(await mp.$eval('.cur-review-acts', el => el.innerText)));
    /* Toasts from the previous lesson's submits are still on screen and sit
       over the first question; the shot is of the review, not of them.
       HIDDEN, not removed: these nodes belong to React, and deleting them
       from under it throws on the next render — which is what broke the
       click that follows. */
    await mp.addStyleTag({ content: '.toast-host { display: none !important; }' });
    await mp.screenshot({ path: path.join(SHOTS, 'opening-review.png'), fullPage: true });
    await mp.click('.cur-review button:has-text("Skip to today")');
    await mp.waitForSelector('.cur-answer');
    /* This one was imported from a sheet with a summary and no body, so
       what appears past the review is its own questions, not prose. */
    chk('…and today\'s own session is there once they move past it', !!(await mp.$('.cur-checks')));
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
    /* TWO answers wait, not one: this member's written answer on 'Hand
       position' and their practical on 'Finding middle C'. That is the
       shape of every review now a published one cannot be multiple choice
       alone — so the card is found by what is IN it, not by being first. */
    const cards = await ip.$$eval('.cur-staff-card', els => els.map(e => e.innerText));
    chk('the instructor sees both answers waiting, each beside its model answer',
        cards.length === 2 && cards.some(t => /play faster and with control/.test(t) && /Control and speed/.test(t))
        && cards.some(t => /thumb went under on F/.test(t)));
    const hp = ip.locator('.cur-staff-card').filter({ hasText: 'play faster and with control' });
    await hp.locator('.cur-mark-pts').first().fill('1');
    await hp.locator('.cur-mark-fb').first().fill('Yes — control matters most.');
    await hp.locator('button:has-text("Save marks")').first().click();
    await ip.waitForFunction(() => document.querySelectorAll('.cur-staff-card').length === 1, null, { timeout: 15000 });
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

    /* ── Watch a video and tell me ──────────────────────────────────────
       Last, on its own lesson, so nothing above has to be counted around
       it. The video belongs to the QUESTION and plays inside the exam: a
       learner sent away to find it loses the exam, the question and — on a
       phone — the tab. */
    await ap.goto(BASE + '/control/learning/curriculum/desk', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForSelector('button:has-text("New lesson")', { timeout: 60000 });
    await ap.click('button:has-text("New lesson")');
    await ap.waitForSelector('.led');
    await ap.fill('.led-title', 'Watch: how a hand crosses under');
    await ap.selectOption('.led-card select >> nth=0', 'Music');
    await ap.fill('.led-card input[type=number] >> nth=0', '4');
    await ap.selectOption('.led-status select', 'published');
    await ap.fill('.led textarea[placeholder^="What this session is"]', 'Someone else\'s hands, slowed right down.');
    await ap.click('.le-start-alt:has-text("Start from nothing")');
    await ap.click('.le-row:last-child .le-ed');
    await ap.keyboard.type('Watch it twice: once for the sound, once for the hand.');
    await ap.click('.led-exam button:has-text("Add a question")');
    await ap.selectOption('.led-q >> nth=0 >> select[aria-label="Question 1 type"]', 'watch');
    await ap.waitForSelector('.led-q-video');
    chk('a watch question asks for the video it is about',
        /The video they watch/.test(await ap.$eval('.led-q-video', el => el.innerText)));
    await ap.fill('.led-q-video input', 'https://example.org/not-a-video.mp4');
    chk('…and says so when the exam could not play it, where it is written',
        /not a YouTube or Vimeo link/.test(await ap.$eval('.led-q-video', el => el.innerText)));
    await ap.fill('.led-q-video input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await ap.fill('.led-q textarea[aria-label="Question 1"]', 'What did her thumb do before the hand moved?');
    await ap.fill('.led-q textarea[aria-label="Rubric for question 1"]', 'Up to 3 for a detail from the video itself, in their own words.');
    await ap.click('.led-top button:has-text("Create lesson")');
    await ap.waitForFunction(() => /CUR-[A-F0-9]+ · version 1/.test(document.querySelector('.led-sub')?.innerText || ''), null, { timeout: 15000 });
    await ap.screenshot({ path: path.join(SHOTS, 'video-question-editor.png'), fullPage: true });
    chk('a watch lesson saves with the video on the question itself',
        php(`echo db_row("SELECT k.videoUrl FROM curriculum_checks k JOIN curriculum_units u ON u.unitId = k.unitId WHERE u.title LIKE 'Watch:%'")['videoUrl'];`)
          === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    await mp.goto(BASE + '/dashboard/learning?classic=1', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.cur-item', { timeout: 40000 });
    await mp.click('.cur-item:has-text("Watch: how a hand crosses under")');
    await mp.waitForSelector('.cur-review, .cur-checks', { timeout: 20000 });
    if (await mp.$('.cur-review button:has-text("Skip to today")')) await mp.click('.cur-review button:has-text("Skip to today")');
    await mp.waitForSelector('.cur-watch', { timeout: 20000 });
    chk('the member watches it INSIDE the exam, and is told what a good answer has in it',
        !!(await mp.$('.cur-watch iframe')) && /in your own words/.test(await mp.$eval('.cur-watch-note', el => el.innerText)));
    chk('…and the player is the privacy-preserving embed, not a bare YouTube page',
        /youtube-nocookie\.com\/embed\//.test(await mp.$eval('.cur-watch iframe', el => el.getAttribute('src'))));
    await mp.addStyleTag({ content: '.toast-host { display: none !important; }' });
    await mp.screenshot({ path: path.join(SHOTS, 'video-question.png'), fullPage: true });
    // The question on its own, so the shot is of the thing and not the page
    // it sits on. (The player is blank in CI: this sandbox cannot reach
    // YouTube, and every off-origin request is aborted on purpose.)
    await mp.locator('.cur-checks').screenshot({ path: path.join(SHOTS, 'video-question-close.png') });

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
