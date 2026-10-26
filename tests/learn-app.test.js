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
      + `db_insert('members', ['memberId'=>'NGG-LRN-M1','fullName'=>'Ada Learner','email'=>'lrn-m1@example.org','type'=>'NGG','status'=>'active','role'=>'member','track'=>'Piano','courses'=>json_encode(['Piano']),'centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`
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
    browser = await chromium.launch(d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-LRN-M1'"), false);`, ['session']);
    const errs = [];
    const open = async (at, w) => {
      const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                            { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      await p.waitForSelector('.lrn-app', { timeout: 30000 });
      return p;
    };

    console.log('the app has a place of its own');
    const P = await open('/learn');
    await P.waitForSelector('.lrn-card', { timeout: 20000 });
    chk('/learn opens This week, with the lesson to start', /Finding middle C/.test(await P.innerText('.lrn-main')));
    /* Pin the promise — every area of the app is reachable from its own rail —
       rather than a count, which goes stale the moment an area is added. */
    const rail = (await P.$$eval('.lrn-rail-item', ns => ns.map(n => n.innerText.trim()))).join('|');
    chk('…and its own navigation, not the portal\'s',
      ['This week', 'My courses', 'School', 'Review', 'Helper'].every(l => rail.includes(l)));
    chk('…and says how far through they are', /0 of 2 lessons done/.test(await P.innerText('.lrn-prog')));

    await P.click('.lrn-rail-item:has-text("My courses")');
    await P.waitForFunction(() => location.pathname === '/learn/courses');
    chk('a view has a real address, and switching does not reload', /Piano/.test(await P.innerText('.lrn-shelf')));
    await P.click('.lrn-course:has-text("Piano")');
    await P.waitForFunction(() => /^\/learn\/course\//.test(location.pathname));
    /* The address changes on the push; the screen changes on the render after
       it. Wait for the screen, or this reads the previous one. */
    await P.waitForSelector('.lrn-course-title', { timeout: 10000 });
    /* Case-insensitively: the week headings are `text-transform: uppercase`
       and innerText reflects that (CLAUDE.md §9). */
    chk('a course has its own address too, with its weeks in order',
      new URL(P.url()).pathname === '/learn/course/piano' && /week 1[\s\S]*week 2/i.test(await P.innerText('.lrn-main')));

    await P.click('.lrn-card:has-text("Finding middle C")');
    await P.waitForSelector('.lrn-lesson', { timeout: 15000 });
    const lessonUrl = new URL(P.url()).pathname;
    chk('a LESSON has an address — the thing it could never have as a sheet', lessonUrl === '/learn/lesson/LRN-U1');
    chk('…and opens full screen, with the lesson and its questions', !!(await P.$('.lrn-lesson-title')) && !!(await P.$('.lrn-checks')));

    await P.goBack();
    await P.waitForFunction(() => /^\/learn\/course\//.test(location.pathname));
    chk('Back goes BACK, instead of closing an overlay', !(await P.$('.lrn-lesson')));

    console.log('the address survives a cold load');
    const Q = await open('/learn/lesson/LRN-U2');
    await Q.waitForSelector('.lrn-lesson', { timeout: 20000 });
    chk('a lesson link opens that lesson, loaded cold — so it can be sent to somebody',
      /The C major scale/.test(await Q.innerText('.lrn-lesson-title')));
    chk('…and the router leaves the address alone rather than rewriting it to /learn',
      new URL(Q.url()).pathname === '/learn/lesson/LRN-U2');

    console.log('the work itself');
    /* Week 2 opens with week 1's questions — the review comes first, and
       today's teaching waits behind it. Skipping is always allowed: being
       away last week is not a reason to be shut out of this one. */
    chk('a lesson opens with the PREVIOUS one\'s review, before today\'s teaching', !!(await Q.$('.cur-review')) || !!(await Q.$('[aria-label*="review" i]')));
    const skip = await Q.$('.lrn-lesson button:has-text("Skip"), .lrn-lesson button:has-text("skip")');
    if (skip) await skip.click();
    await Q.waitForSelector('.lrn-checks', { timeout: 15000 });
    await Q.click('.lrn-checks .cur-opt:has-text("Thumb")');
    await Q.click('.lrn-checks button[type="submit"]');
    await Q.waitForFunction(() => /Score:|complete/i.test(document.querySelector('.lrn-checks').innerText), { timeout: 15000 });
    chk('answering in the app marks it and completes the lesson',
      php(`echo (string)db_row("SELECT status FROM curriculum_progress WHERE unitId='LRN-U2' AND memberId='NGG-LRN-M1'")['status'];`, ['bootstrap']) === 'completed');
    chk('…and the lesson asks how it went, which is never published',
      !!(await Q.$('.cur-fb-taps')) && (await Q.$$('.cur-fb-tap')).length === 3);
    await Q.context().close();

    console.log('signed out');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const R = await ctx.newPage();
    await R.goto(BASE + '/learn/lesson/LRN-U1', { waitUntil: 'domcontentloaded' });
    await waitForBoot(R);
    await R.waitForSelector('.lrn-app', { timeout: 30000 });
    chk('signed out, /learn is still a real page that says what it is and offers the way in',
      /Sign in to open your lessons/.test(await R.innerText('.lrn-main')));
    chk('…and the lesson address is kept, so signing in lands on the lesson',
      new URL(R.url()).pathname === '/learn/lesson/LRN-U1');
    await ctx.close();

    console.log('on a phone');
    const M = await open('/learn', 390);
    await M.waitForSelector('.lrn-card', { timeout: 20000 });
    const bar = await M.evaluate(() => { const r = document.querySelector('.lrn-rail').getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; });
    chk('the phone gets a bottom bar, not a rail squeezed sideways', bar.w > 300 && bar.top > 400);
    const tap = await M.evaluate(() => Math.min.apply(null, [...document.querySelectorAll('.lrn-rail-item')].map(e => Math.round(e.getBoundingClientRect().height))));
    chk('…and every target is a real one (' + tap + 'px)', tap >= 44);
    chk('nothing scrolls sideways', await M.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
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
    await S.waitForSelector('.lrn-plan', { timeout: 20000 });
    chk('School shows the subjects their own results chose, with the week so far',
      /Mathematics/.test(await S.innerText('.lrn-main')) && /62% now/.test(await S.innerText('.lrn-plan'))
      && /0 of 3 this week/i.test(await S.innerText('.lrn-plan')));
    await S.click('.lrn-plan');
    await S.waitForFunction(() => location.pathname === '/learn/plan/GI-LRN');
    chk('a subject has its own address too — the drill is not an overlay either',
      !!(await S.$('.lrn-plan-go')) && /Past questions/.test(await S.innerText('.lrn-main')));
    /* No AI is configured in this suite, so starting one must REFUSE in
       words rather than hand a child a blank paper. That is the state a
       deployment without a key is actually in. */
    await S.click('.lrn-sec button:has-text("Start")');
    await S.waitForSelector('.lrn-plan-err', { timeout: 20000 });
    chk('with no question source it says so plainly, and points somewhere real',
      /flashcards|questions right now/i.test(await S.innerText('.lrn-plan-err')));
    await S.goBack();
    await S.waitForFunction(() => location.pathname === '/learn/plan');
    chk('Back goes back from a subject, like everywhere else in the app', !!(await S.$('.lrn-plan')));

    const W = await open('/learn');
    await W.waitForSelector('.lrn-card', { timeout: 20000 });
    chk('…and the week shows school WITH the Club lessons, not behind another tab',
      /school this week/i.test(await W.innerText('.lrn-main')) && /Mathematics/.test(await W.innerText('.lrn-main')));
    await W.context().close();
    await S.context().close();
    await P.context().close();

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
