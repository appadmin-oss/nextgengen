#!/usr/bin/env node
/* ============================================================================
   THE LEARN APP (/learn), end to end against the real PHP backend.

   The curriculum used to be a sheet over the member portal: no address,
   nothing to bookmark or send, and the browser's Back closing it instead of
   going back. This suite pins the thing that changed — that it is a PLACE.

     · /learn, /learn/courses, /learn/course/<slug> and /learn/lesson/<id>
       are all real addresses: loaded cold, each renders its own screen.
     · A deep lesson address SURVIVES the router — app.jsx must not rewrite
       /learn/lesson/<id> back to /learn on mount, which is exactly what made
       a lesson unbookmarkable before.
     · Back goes back, rather than closing an overlay.
     · The lesson is answered and completes, in the app, at the pass mark.
     · Signed out, /learn is still a real page that says what it is.
     · Coming back: pick up, save, notes, Go deeper, next lesson, search,
       and a lesson with no questions can still be finished.

   Run:  node tests/learn-app.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.LEARN_PORT || '8296';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-learn-'));
const DB = path.join(TMP, 'ngg.db');

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

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  learn app: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'learn_app_test_secret_0123456789',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
    /* The bundled curricula seed themselves on first boot. 588 lessons
       arriving unasked turns "0 of 2" into "0 of 588" and buries the two
       this suite is about, so they are declined — as a deployment running a
       different programme would decline them. */
    'seed_bundled_curriculum' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'C-LRN-EG','name'=>'Egbeda','code'=>'EG','status'=>'active','createdAt'=>${now}]);`
      + `db_insert('timetable_slots', ['slotId'=>'TT-LRN-1','centreId'=>'C-LRN-EG','course'=>'Piano','weekday'=>6,'startTime'=>'11:00','endTime'=>'12:30','room'=>'Music room','status'=>'active','createdAt'=>${now}]);`
      + `db_insert('timetable_slots', ['slotId'=>'TT-LRN-2','centreId'=>'C-LRN-EG','course'=>'Coding','weekday'=>6,'startTime'=>'09:00','endTime'=>'10:30','room'=>'Lab 1','status'=>'active','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-LRN-M1','fullName'=>'Ada Learner','email'=>'lrn-m1@example.org','type'=>'NGG','status'=>'active','role'=>'member','track'=>'Piano','courses'=>json_encode(['Piano']),'centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`
      /* A club admin holds `curriculum`, which is what writes the provider
         registry and records a result against a member. */
      + `db_insert('members', ['memberId'=>'NGG-LRN-ADM','fullName'=>'Lrn Admin','email'=>'lrn-adm@example.org','type'=>'NGG','status'=>'active','role'=>'club_admin','createdAt'=>${now},'updatedAt'=>${now}]);`
      /* Two lessons in one course, so "this week" has something to order and
         the course page has more than one row. */
      + `db_insert('curriculum_units', ['unitId'=>'LRN-U1','course'=>'Piano','level'=>'Year 1 · Foundation','week'=>1,'position'=>1,'title'=>'Finding middle C','summary'=>'Where the hands go.','status'=>'published','passMark'=>50,'version'=>1,'objectives'=>json_encode(['Find middle C']),'body'=>"## Warm-up\\n\\nSit tall. Press **middle C**.\\n",'durationMins'=>30,'createdAt'=>${now},'updatedAt'=>${now},'publishedAt'=>${now}]);`
      + `db_insert('curriculum_checks', ['checkId'=>'LRN-C1','unitId'=>'LRN-U1','kind'=>'mcq','prompt'=>'How many white keys in an octave?','options'=>json_encode(['5','7','8']),'answer'=>'1','rubric'=>'','points'=>2,'position'=>1,'source'=>'manual']);`
      + `db_insert('curriculum_units', ['unitId'=>'LRN-U2','course'=>'Piano','level'=>'Year 1 · Foundation','week'=>2,'position'=>1,'title'=>'The C major scale','summary'=>'Thumb under.','status'=>'published','passMark'=>50,'version'=>1,'objectives'=>json_encode(['Play C major']),'body'=>'Play it slowly.','durationMins'=>30,'createdAt'=>${now},'updatedAt'=>${now},'publishedAt'=>${now}]);`
      + `db_insert('curriculum_checks', ['checkId'=>'LRN-C2','unitId'=>'LRN-U2','kind'=>'mcq','prompt'=>'Which finger starts?','options'=>json_encode(['Thumb','Little finger']),'answer'=>'0','rubric'=>'','points'=>2,'position'=>1,'source'=>'manual']);`
    , ['bootstrap']);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    // The shared probe finds this image's Chromium (chrome-linux or chrome-linux64), as the other suites do.
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-LRN-M1'"), false);`, ['session']);
    const errs = [];
    const open = async (at, w, watch) => {
      const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                            { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      if (watch) watch(p);
      p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      await p.waitForSelector('.lrn-app', { timeout: 60000 });
      /* The shell is up; its DATA is still in flight. Everything below waits
         on a round trip through a cold `php -S`, so it gets the same generous
         budget the boot does — a tight one passes on an idle machine and
         flakes the moment this suite runs after the others (CLAUDE.md §1). */
      return p;
    };

    console.log('the app has a place of its own');
    /* The first screen must cost ONE request. It asked for lessons, school
       and where-the-work-leads separately, which is three PHP bootstraps and
       three round trips before a child on a phone sees a lesson — on shared
       hosting that is the slowest part of opening the app. */
    const bootCalls = [];
    const P = await open('/learn', null, p => p.on('request', r => {
      const u = new URL(r.url());
      /* Only the Learn app's OWN data. The page boots a session like every
         other page; the claim here is about the three calls this screen used
         to make for itself. */
      if (u.pathname === '/api/member/curriculum.php') bootCalls.push('view=' + (u.searchParams.get('view') || ''));
    }));
    await P.waitForSelector('.lrn-card', { timeout: 60000 });
    /* LRN_SHOTS=<dir> saves what a member sees, for design review. */
    const shot = async (pg, n) => { if (process.env.LRN_SHOTS) await pg.screenshot({ path: process.env.LRN_SHOTS + '/' + n + '.png', fullPage: true }); };
    await shot(P, 'learn-week');
    chk('/learn opens This week, with the lesson to start', /Finding middle C/.test(await P.innerText('.lrn-main')));
    chk('…in ONE request, not one per thing the screen shows (was three) — got ' + JSON.stringify(bootCalls),
      bootCalls.length === 1 && bootCalls[0] === 'view=boot');
    /* Pin the promise — every area of the app is reachable from its own rail —
       rather than a count, which goes stale the moment an area is added. */
    const rail = (await P.$$eval('.lrn-rail-item', ns => ns.map(n => n.innerText.trim()))).join('|');
    chk('…and its own navigation, not the portal\'s',
      ['This week', 'My courses', 'School', 'Review', 'Helper'].every(l => rail.includes(l)));
    chk('…and says how far through they are', /0 of 2 lessons done/.test(await P.innerText('.lrn-prog')));
    const wk = await P.innerText('.lrn-main');
    chk('the week greets them by name and says what to start with', /Ada/.test(wk) && /Start with Finding middle C/.test(wk));
    chk('…with their next class beside it: their course, Saturday at 11, the room — never another course', /Your (next class|class is on now)/i.test(wk) && /Piano/.test(await P.innerText('.lrn-next')) /* During the class itself (a Saturday between 11 and 12:30) the card says "on now, until 12:30pm" instead
       of the start time — both are right; the suite must pass whatever hour it runs at. */
      && /11am|On now, until 12:30pm/i.test(await P.innerText('.lrn-next')) && /Music room/.test(await P.innerText('.lrn-next')) && !/Coding/.test(await P.innerText('.lrn-next')));
    chk('…and each course\'s standing', /Piano/.test(await P.innerText('.lrn-bars')) && /0%/.test(await P.innerText('.lrn-bars')));

    await P.click('.lrn-rail-item:has-text("Timetable")');
    await P.waitForFunction(() => location.pathname === '/learn/timetable');
    await P.waitForSelector('.lrn-days', { timeout: 15000 });
    let tt = await P.innerText('.lrn-main');
    chk('Timetable: their own classes first, by day, with the time and room', /My timetable/.test(tt) && /Saturday/i.test(tt) && /Music room/.test(tt) && !/Lab 1/.test(tt));
    await shot(P, 'learn-timetable');
    await P.click('.lrn-seg button:has-text("The whole centre")');
    tt = await P.innerText('.lrn-main');
    chk('…and the whole centre\'s week a tap away, theirs marked', /Lab 1/.test(tt) && /Coding/.test(tt) && (await P.$$('.lrn-slot.is-mine')).length === 1);

    await P.click('.lrn-rail-item:has-text("My courses")');
    await P.waitForFunction(() => location.pathname === '/learn/courses');
    chk('a view has a real address, and switching does not reload', /Piano/.test(await P.innerText('.lrn-shelf')));
    await shot(P, 'learn-courses');
    await P.click('.lrn-course:has-text("Piano")');
    await P.waitForFunction(() => /^\/learn\/course\//.test(location.pathname));
    /* The address changes on the push; the screen changes on the render after
       it. Wait for the screen, or this reads the previous one. */
    await P.waitForSelector('.lrn-course-title', { timeout: 60000 });
    /* Case-insensitively: the week headings are `text-transform: uppercase`
       and innerText reflects that (CLAUDE.md §9). */
    chk('a course has its own address too, with its weeks in order',
      new URL(P.url()).pathname === '/learn/course/piano' && /week 1[\s\S]*week 2/i.test(await P.innerText('.lrn-main')));
    await shot(P, 'learn-course');

    await P.click('.lrn-card:has-text("Finding middle C")');
    await P.waitForSelector('.lrn-lesson', { timeout: 60000 });
    await shot(P, 'learn-lesson');
    const lessonUrl = new URL(P.url()).pathname;
    chk('a LESSON has an address — the thing it could never have as a sheet', lessonUrl === '/learn/lesson/LRN-U1');
    chk('…and opens full screen, with the lesson and its questions', !!(await P.$('.lrn-lesson-title')) && !!(await P.$('.lrn-checks')));

    await P.goBack();
    await P.waitForFunction(() => /^\/learn\/course\//.test(location.pathname));
    chk('Back goes BACK, instead of closing an overlay', !(await P.$('.lrn-lesson')));

    console.log('the address survives a cold load');
    /* Lesson 1 was opened moments ago above, and the review deliberately waits for a later day (asking now is not
       recall). Date that opening three days back, so this asks the real promise — it used to pass only because the
       question form's label happened to contain the word "review". */
    php(`db_exec("UPDATE curriculum_progress SET startedAt = ? WHERE unitId = 'LRN-U1' AND memberId = 'NGG-LRN-M1'", [gmdate('Y-m-d\\TH:i:s\\Z', time() - 3 * 86400)]);`, ['bootstrap']);
    const Q = await open('/learn/lesson/LRN-U2');
    await Q.waitForSelector('.lrn-lesson', { timeout: 60000 });
    chk('a lesson link opens that lesson, loaded cold — so it can be sent to somebody',
      /The C major scale/.test(await Q.innerText('.lrn-lesson-title')));
    chk('…and the router leaves the address alone rather than rewriting it to /learn',
      new URL(Q.url()).pathname === '/learn/lesson/LRN-U2');

    console.log('the work itself');
    /* Week 2 opens with week 1's questions — the review comes first, and
       today's teaching waits behind it. Skipping is always allowed: being
       away last week is not a reason to be shut out of this one. */
    chk('a lesson opens with the PREVIOUS one\'s review, before today\'s teaching', !!(await Q.waitForSelector('.cur-review, .lx-intro', { timeout: 30000 }).catch(() => null)));
    const skip = await Q.$('.lrn-lesson button:has-text("Skip"), .lrn-lesson button:has-text("skip")');
    if (skip) await skip.click();
    await Q.waitForSelector('.lrn-checks', { timeout: 60000 });
    await Q.click('.lrn-checks .cur-opt:has-text("Thumb")');
    await Q.click('.lrn-checks button[type="submit"]');
    await Q.waitForFunction(() => /Score:|complete/i.test(document.querySelector('.lrn-checks').innerText), { timeout: 60000 });
    chk('answering in the app marks it and completes the lesson',
      php(`echo (string)db_row("SELECT status FROM curriculum_progress WHERE unitId='LRN-U2' AND memberId='NGG-LRN-M1'")['status'];`, ['bootstrap']) === 'completed');
    chk('…and the lesson asks how it went, which is never published',
      !!(await Q.$('.cur-fb-taps')) && (await Q.$$('.cur-fb-tap')).length === 3);
    await Q.context().close();

    console.log('coming back, keeping, and going deeper');
    /* Go deeper fetches from Wikipedia on the server. A test must not depend
       on a third party answering, so the read is planted where the server
       caches it — the same file a real fetch would leave behind. */
    php(`foreach (['Finding middle C', 'Piano'] as $q) cache_put('learn-wiki-' . sha1(mb_strtolower($q)), ['title'=>'Middle C',
          'extract'=>'Middle C is the C note near the middle of a piano keyboard. It is the fourth C key from the left on an 88-key piano.',
          'url'=>'https://simple.wikipedia.org/wiki/Middle_C','source'=>'Simple English Wikipedia','licence'=>'CC BY-SA 4.0','licenceUrl'=>'https://creativecommons.org/licenses/by-sa/4.0/']);`);
    const K = await open('/learn');
    await K.waitForSelector('.lrn-pickup', { timeout: 20000 });
    chk('This week leads with the lesson they opened and have not finished',
      /Pick up where you left off/i.test(await K.innerText('.lrn-pickup')) && /Finding middle C/.test(await K.innerText('.lrn-pickup')));
    chk('…and with what their finished lessons add up to', /1\s*done this week/.test(await K.innerText('.lrn-figs')));
    await K.click('.lrn-pickup');
    await K.waitForSelector('.lrn-lesson-title', { timeout: 15000 });
    chk('picking up opens that lesson, and says where it sits in the course', /Lesson 1 of 2/.test(await K.innerText('.lrn-lesson-head')));

    await K.click('.lrn-save');
    await K.waitForFunction(() => document.querySelector('.lrn-save').getAttribute('aria-pressed') === 'true');
    chk('Save for later is a toggle that says it is on, and is kept',
      php(`echo (int)(db_row("SELECT saved FROM learn_state WHERE memberId='NGG-LRN-M1' AND unitId='LRN-U1'")['saved'] ?? 0);`) === '1');
    await K.fill('.lrn-textarea', 'Thumb on middle C, little finger on G.');
    await K.click('.lrn-lesson-title');   // leaving the box saves it
    await K.waitForFunction(() => /Saved\./.test(document.querySelector('.lrn-mynote').innerText), { timeout: 10000 });
    chk('a note saves itself when they leave the box',
      php(`echo (string)(db_row("SELECT note FROM learn_state WHERE memberId='NGG-LRN-M1' AND unitId='LRN-U1'")['note'] ?? '');`) === 'Thumb on middle C, little finger on G.');

    await K.waitForSelector('.lrn-read', { timeout: 15000 });
    const deeper = await K.innerText('.lrn-deeper');
    chk('Go deeper gives a short read on the topic, naming its source and licence',
      /Middle C is the C note/.test(deeper) && /Simple English Wikipedia/.test(deeper) && /CC BY-SA 4\.0/.test(deeper));
    const srcs = await K.$$eval('.lrn-sources a', ns => ns.map(a => ({ h: a.href, t: a.target, r: a.rel })));
    chk('…and vetted places to go further for this course, opening in a new tab (' + srcs.length + ')',
      srcs.length >= 3 && srcs.some(s => /musictheory\.net/.test(s.h)) && srcs.every(s => s.t === '_blank' && /noopener/.test(s.r)));

    chk('the next lesson is one press away', /The C major scale/.test(await K.innerText('.lrn-pager-a.is-next')));
    await K.click('.lrn-pager-a.is-next');
    await K.waitForFunction(() => location.pathname === '/learn/lesson/LRN-U2');
    /* The address changes before the next lesson's data arrives; wait for the lesson itself rather than
       reading the old title in the gap (a fixed read raced the round trip once the lesson also asks for
       its session exam). */
    await K.waitForFunction(() => { const t = document.querySelector('.lrn-lesson-title'); return t && /The C major scale/.test(t.innerText); }, null, { timeout: 15000 }).catch(() => {});
    chk('…and moving on changes the address, so Back still works', /The C major scale/.test(await K.innerText('.lrn-lesson-title')));

    await K.click('.lrn-rail-item:has-text("Notes")');
    await K.waitForFunction(() => location.pathname === '/learn/notes');
    await K.waitForSelector('.lrn-notecard', { timeout: 15000 });
    const notes = await K.innerText('.lrn-main');
    chk('Notes collects what they saved and what they wrote, in one place',
      /Saved for later · 1/i.test(notes) && /Thumb on middle C/.test(notes));

    await K.click('.lrn-rail-item:has-text("My courses")');
    await K.waitForSelector('.lrn-search-box input', { timeout: 15000 });
    await K.fill('.lrn-search-box input', 'scale');
    await K.waitForFunction(() => /1 lesson matches/.test(document.querySelector('.lrn-search [role=status]').innerText));
    chk('a lesson can be found by what it is about, with the count said aloud', /The C major scale/.test(await K.innerText('.lrn-search')));
    await K.context().close();

    /* A lesson with nothing to answer used to have no way to be finished. */
    php(`db_insert('curriculum_units', ['unitId'=>'LRN-U3','course'=>'Piano','level'=>'Year 1 · Foundation','week'=>3,'position'=>1,'title'=>'Listening to a march','summary'=>'Just listen.','status'=>'published','passMark'=>50,'version'=>1,'objectives'=>json_encode(['Hear the beat']),'body'=>'Listen twice.','durationMins'=>15,'createdAt'=>now_iso(),'updatedAt'=>now_iso(),'publishedAt'=>now_iso()]);`);
    const N = await open('/learn/lesson/LRN-U3');
    await N.waitForSelector('.lrn-lesson', { timeout: 20000 });
    const skip3 = await N.$('.lrn-lesson button:has-text("Skip"), .lrn-lesson button:has-text("skip")');
    if (skip3) await skip3.click();
    await N.waitForSelector('.lrn-markread button', { timeout: 15000 });
    await N.click('.lrn-markread button');
    await N.waitForFunction(() => /finished this lesson/.test(document.querySelector('.lrn-markread').innerText), { timeout: 15000 });
    chk('a lesson with no questions can be marked done, and is',
      php(`echo (string)db_row("SELECT status FROM curriculum_progress WHERE unitId='LRN-U3' AND memberId='NGG-LRN-M1'")['status'];`, ['bootstrap']) === 'completed');
    await N.context().close();

    console.log('signed out');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const R = await ctx.newPage();
    await R.goto(BASE + '/learn/lesson/LRN-U1', { waitUntil: 'domcontentloaded' });
    await waitForBoot(R);
    await R.waitForSelector('.lrn-app', { timeout: 60000 });
    chk('signed out, /learn is still a real page that says what it is and offers the way in',
      /Sign in to open your lessons/.test(await R.innerText('.lrn-main')));
    chk('…and the lesson address is kept, so signing in lands on the lesson',
      new URL(R.url()).pathname === '/learn/lesson/LRN-U1');
    await ctx.close();

    console.log('on a phone');
    const M = await open('/learn', 390);
    await M.waitForSelector('.lrn-week', { timeout: 60000 });
    const bar = await M.evaluate(() => { const r = document.querySelector('.lrn-rail').getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; });
    chk('the phone gets a bottom bar, not a rail squeezed sideways', bar.w > 300 && bar.top > 400);
    // The targets SHOWN on the phone: the bar's four places and "More" (the rest open from More, LearnNav).
    const tap = await M.evaluate(() => Math.min.apply(null, [...document.querySelectorAll('.lrn-rail-item')].filter(e => e.offsetParent !== null).map(e => Math.round(e.getBoundingClientRect().height))));
    chk('the phone bar is four places and More — nothing squeezed or clipped', await M.evaluate(() => [...document.querySelectorAll('.lrn-rail-item')].filter(e => e.offsetParent !== null).length) === 5);
    chk('…and every target is a real one (' + tap + 'px)', tap >= 44);
    chk('nothing scrolls sideways', await M.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await M.click('.lrn-rail-more');
    const moreTxt = await M.innerText('#lrn-more').catch(() => '');
    chk('…and "More" opens the rest: Timetable, School and Notes', /Timetable/.test(moreTxt) && /School/.test(moreTxt) && /Notes/.test(moreTxt));
    await M.keyboard.press('Escape');
    chk('…which Escape closes, with focus back on More', await M.locator('#lrn-more').count() === 0 && await M.evaluate(() => document.activeElement && document.activeElement.classList.contains('lrn-rail-more')));
    await M.context().close();

    /* ── Studying for school ───────────────────────────────────────────
       The growth plan from this member's own results said what to work on;
       the drill is one of those sessions, actually done. */
    console.log('studying for school');
    php(`db_insert('growth_plans', ['planId'=>'GP-LRN','uploadId'=>'UP-LRN','memberId'=>'NGG-LRN-M1','term'=>'2026-1',
          'summary'=>'Two subjects this term.','status'=>'live','committed'=>1,'createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
        db_insert('growth_plan_items', ['itemId'=>'GI-LRN','planId'=>'GP-LRN','subject'=>'Mathematics','current'=>62,'target'=>70,
          'method'=>'retrieval','what'=>'Past questions, out loud.','whenWhere'=>'After supper.','sessionsPerWeek'=>3,'helper'=>'self','position'=>0]);`, ['bootstrap']);

    const S = await open('/learn/plan');
    await S.waitForSelector('.lrn-plan', { timeout: 60000 });
    chk('School shows the subjects their own results chose, with the week so far',
      /Mathematics/.test(await S.innerText('.lrn-main')) && /62% now/.test(await S.innerText('.lrn-plan'))
      && /0 of 3 this week/i.test(await S.innerText('.lrn-plan')));
    await S.click('.lrn-plan');
    await S.waitForFunction(() => location.pathname === '/learn/plan/GI-LRN');
    await S.waitForSelector('.lrn-plan-go', { timeout: 15000 }).catch(() => {});   // the subject's data, not the gap before it
    chk('a subject has its own address too — the drill is not an overlay either',
      !!(await S.$('.lrn-plan-go')) && /Past questions/.test(await S.innerText('.lrn-main')));
    /* No AI is configured in this suite, so starting one must REFUSE in
       words rather than hand a child a blank paper. That is the state a
       deployment without a key is actually in. */
    await S.click('.lrn-sec button:has-text("Start")');
    await S.waitForSelector('.lrn-plan-err', { timeout: 60000 });
    chk('with no question source it says so plainly, and points somewhere real',
      /flashcards|questions right now/i.test(await S.innerText('.lrn-plan-err')));
    await S.goBack();
    await S.waitForFunction(() => location.pathname === '/learn/plan');
    chk('Back goes back from a subject, like everywhere else in the app', !!(await S.$('.lrn-plan')));

    const W = await open('/learn');
    await W.waitForSelector('.lrn-card', { timeout: 60000 });
    chk('…and the week shows school WITH the Club lessons, not behind another tab',
      /school this week/i.test(await W.innerText('.lrn-main')) && /Mathematics/.test(await W.innerText('.lrn-main')));

    /* ── Where the work leads ──────────────────────────────────────────────
       A child who finishes a course should be able to see there is a
       recognised certificate at the end of it, and say they are going for
       it. What they must NOT be able to do is claim they hold one — that is
       the centre's record of them (domain/providers.php). */
    console.log('where the work leads');
    php(`$p = backend_dispatch('admin.providers.save', ['requesterId' => 'NGG-LRN-ADM',
            'data' => ['name' => 'Trinity College London', 'url' => 'https://www.trinitycollege.com/']]);
         $a = backend_dispatch('admin.providers.award.save', ['requesterId' => 'NGG-LRN-ADM',
            'data' => ['providerId' => $p['providerId'], 'title' => 'Graded Examination in Music',
                       'kind' => 'graded_exam', 'level' => 'Grade 3', 'courses' => ['Piano']]]);
         file_put_contents('${TMP.replace(/\\/g, '/')}/award.txt', $a['awardId']);`, ['bootstrap']);

    const C = await open('/learn/course/piano');
    await C.waitForSelector('.lrn-award', { timeout: 60000 });
    chk('a course says where it leads, and names the body that awards it',
      /Where this leads/i.test(await C.innerText('.lrn-main'))
      && /Graded Examination in Music/.test(await C.innerText('.lrn-award'))
      && /Trinity College London/.test(await C.innerText('.lrn-award')));
    chk('…and offers no way to claim they hold it — their centre records that',
      (await C.$$('.lrn-award-aim')).length === 1
      && !/I (hold|have) (it|this)/i.test(await C.innerText('.lrn-main')));

    await C.click('.lrn-award-aim');
    await C.waitForFunction(() => {
      const b = document.querySelector('.lrn-award-aim');
      return b && /You're going for this/.test(b.innerText);
    }, null, { timeout: 30000 });
    chk('"I\'m going for this" is the member\'s own aim, recorded against them',
      php(`echo (string)(db_row("SELECT state FROM member_credentials WHERE memberId = 'NGG-LRN-M1'")['state'] ?? '');`, ['bootstrap']) === 'aiming');

    /* A result the CENTRE records shows as held, and on the week page —
       a credential does not belong to the course it came from. */
    php(`$aw = trim(file_get_contents('${TMP.replace(/\\/g, '/')}/award.txt'));
         backend_dispatch('admin.providers.credential.set', ['requesterId' => 'NGG-LRN-ADM',
            'memberId' => 'NGG-LRN-M1', 'data' => ['awardId' => $aw, 'state' => 'earned',
            'awardedOn' => '2026-03-14', 'grade' => 'Merit']]);`, ['bootstrap']);
    const H = await open('/learn');
    await H.waitForSelector('.lrn-earned', { timeout: 60000 });
    chk('a credential their centre recorded shows on the week, wherever it came from',
      /1 credential/i.test(await H.innerText('.lrn-earned'))
      && /Graded Examination in Music/.test(await H.innerText('.lrn-earned')));
    await H.context().close();
    await C.context().close();
    await W.context().close();
    await S.context().close();
    await P.context().close();

    /* The session exam (src/modules/learn/lrn-exam.jsx; owner, 7 Nov 2026: "turn on the per session exam
       by default … a standard honourable exam"). Last week's lesson, opened a week ago and never recalled,
       is examined before this week's: rules first, an honour pledge, one question at a time, a report. */
    console.log('the session exam');
    php(`db_exec("DELETE FROM curriculum_sittings WHERE memberId = 'NGG-LRN-M1'");`
      + `db_exec("DELETE FROM curriculum_progress WHERE memberId = 'NGG-LRN-M1' AND unitId = 'LRN-U1'");`
      + `db_insert('curriculum_progress', ['unitId'=>'LRN-U1','memberId'=>'NGG-LRN-M1','status'=>'attempted','startedAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time() - 7 * 86400),'updatedAt'=>now_iso()]);`, ['bootstrap']);
    const X = await open('/learn/lesson/LRN-U2');
    await X.waitForSelector('.lx-intro', { timeout: 60000 }).catch(() => {});
    const intro = await X.innerText('.lx-intro').catch(() => '');
    chk('exam: the lesson opens on the session exam, stating the questions, the time, the pass mark and the bands first',
      /Questions/.test(intro) && /Time/.test(intro) && /Pass mark/.test(intro) && /Distinction/.test(intro) && await X.locator('.lrn-sec-h:has-text("The lesson")').count() === 0);
    chk('exam: it cannot start until the honour pledge is made', await X.locator('.lx-intro .lrn-btn:not(.is-ghost)').isDisabled());
    await X.locator('.lx-pledge input').check();
    await X.locator('.lx-intro .lrn-btn:not(.is-ghost)').click();
    await X.waitForSelector('.lx-sit', { timeout: 15000 });
    chk('exam: the paper is locked — the rules say so, and the candidate\'s name is watermarked across it',
      /Pasting into answers and copying the questions are switched off/.test(intro) && /NGG-LRN-M1|Learn/.test(await X.innerText('.lx-mark').catch(() => '')) && await X.locator('.lx-locked').count() === 1);
    chk('exam: one question at a time, with the clock and "how sure are you?"',
      await X.locator('.lx-q').count() === 1 && /\d+:\d\d/.test(await X.innerText('.lx-clock')) && await X.locator('.lx-conf .lx-chip').count() === 3);
    await X.locator('.lx-opt', { hasText: /^\s*[A-H]?\s*7\s*$/ }).first().click();
    await X.locator('.lx-chip', { hasText: 'Sure' }).click();
    await X.locator('.lx-nav .lrn-btn:not(.is-ghost)').click();
    await X.waitForSelector('.lx-review', { timeout: 10000 });
    chk('exam: a review screen before handing in says what is answered', /1 of 1 answered/.test(await X.innerText('.lx-review')));
    await X.locator('.lx-review .lrn-btn:not(.is-ghost)').click();
    await X.waitForSelector('.lx-result', { timeout: 60000 });
    const rep = await X.innerText('.lx-result');
    chk('exam: the report gives the band, the score and that it was sat on their honour', /Outstanding/.test(rep) && /100%/.test(rep) && /sat on your honour/.test(rep));
    chk('exam: …and the sitting is recorded, marked, with the pledge',
      php(`$s = db_row("SELECT status, integrity FROM curriculum_sittings WHERE memberId = 'NGG-LRN-M1' ORDER BY id DESC LIMIT 1"); echo $s['status'] . '|' . (json_decode($s['integrity'], true)['pledgedAt'] ?? '' ? 'pledged' : '');`, ['bootstrap']) === 'marked|pledged');
    await X.locator('.lx-result .lrn-btn', { hasText: /Start today/ }).click();
    await X.waitForSelector('.lrn-sec-h:has-text("The lesson")', { timeout: 10000 }).catch(() => {});
    chk('exam: then today\'s lesson opens', await X.locator('.lrn-sec-h:has-text("The lesson")').count() === 1);
    await X.screenshot({ path: require('path').join(require('os').tmpdir(), 'learn-exam-done.png'), fullPage: true }).catch(() => {});
    await X.context().close();

    console.log('the lesson in steps');
    {
      /* A real lesson from the shipped Foundation course (the seed file, not text written to suit the test).
         Added HERE, after the home screen's counts were checked, so "0 of 2 lessons" still means the Piano pair. */
      php(`$L = array_values(array_filter(curriculum_seed_files()['curriculum-tech-foundations-2026']['lessons'], fn($x) => $x['course'] === 'Artificial Intelligence'))[1];`
        + `db_insert('curriculum_units', ['unitId'=>'LRN-U9','course'=>'','level'=>'Year 1 · Foundation','week'=>1,'position'=>9,'title'=>$L['title'],'summary'=>$L['summary'],'status'=>'published','passMark'=>50,'version'=>1,'objectives'=>json_encode($L['objectives']),'body'=>$L['body'],'durationMins'=>45,'createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`, ['bootstrap']);
      const S = await open('/learn/lesson/LRN-U9', 390);
      await S.waitForSelector('.lrn-lesson', { timeout: 60000 });
      const skip9 = await S.$('.lrn-lesson button:has-text("Skip")'); if (skip9) await skip9.click();
      await S.waitForSelector('.lrn-step-h', { timeout: 30000 });
      const total = Number(await S.getAttribute('.lrn-step-progress', 'aria-valuemax'));
      /* (owner, 28 Nov 2026: "Kids cannot take the lessons … tough for them to understand") — one thing at a time:
         nothing to answer and no materials under step 1, and help on the step itself. */
      chk('kid-friendly: on step 1 the questions and materials wait — the page says they come after the last step',
        await S.locator('.lrn-checks, .lrn-markread, .lrn-mynote, .lrn-deeper').count() === 0 && /come after the last step/.test(await S.innerText('.lrn-after-note')));
      await S.click('.lrn-simpler-btn');
      await S.waitForFunction(() => /simpler words|switched on|couldn’t answer|questions to Guide/i.test((document.querySelector('.lrn-simpler') || {}).innerText || ''), null, { timeout: 15000 });
      chk('kid-friendly: "I don’t get this part" answers on the step — in simpler words, or honestly says why it cannot', true);
      const heads = [];
      for (let k = 0; k < total; k++) {
        heads.push(await S.innerText('.lrn-step-h'));
        if (k < total - 1) { await S.click('.lrn-step-nav .lrn-btn:not(.is-ghost)'); await S.waitForFunction(n => document.querySelector('.lrn-step-progress').getAttribute('aria-valuenow') === String(n), k + 2); }
      }
      const wordsAt = heads.findIndex(h => /Words you’ll meet/.test(h)), understandAt = heads.findIndex(h => /^Understand it/.test(h));
      chk('lesson in steps: a long Foundation lesson is shown one step at a time, with progress (' + total + ' steps)', total >= 5 && /Step \d+ of \d+/.test(await S.innerText('.lrn-step-count')));
      chk('lesson in steps: the key words come BEFORE the explanation that uses them', wordsAt >= 0 && understandAt > wordsAt, heads.join(' | '));
      chk('lesson in steps: the long explanation is cut into pieces, and further reading is last and optional',
        heads.filter(h => /^Understand it \(\d of \d\)/.test(h)).length >= 2 && /Going further \(optional\)/.test(heads[heads.length - 1]));
      chk('lesson in steps: Next moves focus to the new step\'s heading (keyboard and screen readers)', await S.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('lrn-step-h')));
      chk('lesson in steps: the last step says the lesson is read and the questions are below', /read the whole lesson/i.test(await S.innerText('.lrn-step-done')));
      const tryAt = heads.findIndex(h => /^Now you try/.test(h)), lastUnderstand = heads.map(h => /^Understand it/.test(h)).lastIndexOf(true);
      chk('kid-friendly: the tasks ("Now you try") come AFTER the explanation, not as step 1', tryAt > lastUnderstand && lastUnderstand >= 0, heads.join(' | '));
      chk('kid-friendly: "Assessed this week" is not a step — those are the questions shown after the lesson', !heads.some(h => /Assessed this week/i.test(h)));
      chk('kid-friendly: on the last step, what comes after the lesson appears', await S.locator('.lrn-checks, .lrn-markread').count() === 1 && await S.locator('.lrn-mynote').count() === 1);
      await S.click('.lrn-step-whole');
      chk('lesson in steps: "Whole lesson on one page" shows it all at once', (await S.$$('.lrn-step-h')).length === 0 && /Key words/.test(await S.innerText('.lrn-lesson')) && /Understand it/.test(await S.innerText('.lrn-lesson')));
      await S.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(S);
      const skip9b = await S.$('.lrn-lesson button:has-text("Skip")'); if (skip9b) await skip9b.click();
      await S.waitForSelector('.lrn-step-whole', { timeout: 30000 });
      chk('lesson in steps: …and that choice is remembered', await S.getAttribute('.lrn-step-whole', 'aria-pressed') === 'true');
      await S.screenshot({ path: require('path').join(require('os').tmpdir(), 'learn-steps.png'), fullPage: true }).catch(() => {});
      await S.context().close();
    }

    chk('no page errors anywhere in the app', errs.length === 0);
    if (errs.length) console.error(errs.slice(0, 5).join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (learn app)`);
    process.exit(failed ? 1 : 0);
  }
})();
