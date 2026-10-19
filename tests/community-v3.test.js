#!/usr/bin/env node
/* Community v3 (/community) end to end — real PHP + SQLite, Chromium.
   Run: node tests/community-v3.test.js   (CMV3_SHOTS=<dir> to keep screenshots) */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CMV3_PORT || '8293';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-cmv3-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-cmv3-cache-${process.pid}`);
const CLIP = path.join(ROOT, 'tests', `_cmv3_clip_${process.pid}.webm`);
const SHOTS = process.env.CMV3_SHOTS || '';
// The Community's own dialogs (the site's mobile drawer is a dialog too).
const DLG = '.cm3-app div[role=dialog]';
const STUDENT = 'NGG-CM-S', STUDENT2 = 'NGG-CM-S2', MENTOR = 'NGG-CM-T', LEAD = 'NGG-CM-ADM';

let _seq = 0;
function phpRun(code) {
  const f = path.join(os.tmpdir(), `ngg-cmv3-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}
const head = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
  + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
  + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
  + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`;
const php = snippet => phpRun(head + `db_conn();\n` + snippet);
const q = sql => JSON.parse(php(`echo json_encode(db_all(${JSON.stringify(sql)}));`) || '[]');
const mintSession = id => phpRun(head + `require ${JSON.stringify(ROOT + '/api/_lib/session.php')};`
  + `echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), true);`);
function loadChromium() { for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} } return null; }

let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  for (const f of [CFG, DB, CLIP]) { try { fs.unlinkSync(f); } catch (_) {} }
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  community v3: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'cmv3_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    // A real 8-second clip, so the player plays a real <video>.
    execSync(`ffmpeg -loglevel error -f lavfi -i testsrc=size=320x180:rate=15 -t 8 -c:v libvpx -b:v 200k -pix_fmt yuv420p -y ${JSON.stringify(CLIP)}`);
    const clipUrl = '/tests/' + path.basename(CLIP);
    const now = 'now_iso()';
    const mem = (id, name, role, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'${name}','email'=>'${id.toLowerCase()}@example.org','type'=>'NGG','status'=>'active','role'=>'${role}','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}], ${extra || '[]'}));`;
    const post = (id, author, name, ch, body, extra) => `db_insert('community_posts', array_merge(['postId'=>'${id}','channelId'=>'${ch}','authorId'=>'${author}','authorName'=>'${name}','authorCentre'=>'Egbeda','body'=>${JSON.stringify(body)},'status'=>'published','kind'=>'post','createdAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-7200),'updatedAt'=>${now}], ${extra || '[]'}));`;
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CTR-EG','name'=>'Egbeda','code'=>'EG','color'=>'#3B5BDB','status'=>'active','createdAt'=>${now}]);`
      + mem(STUDENT, 'Sade Adeyemi', 'member', `['track'=>'Cv Coding']`) + mem(STUDENT2, 'Kunle Bello', 'member', `['track'=>'Cv Coding']`)
      + mem(MENTOR, 'Tunde Okafor', 'mentor') + mem(LEAD, 'Ada Lead', 'super_admin')
      + `setting_set('community_moderation', ['mode' => 'strict']);`
      + `db_insert('community_channels', ['channelId'=>'CH-COMMONS','slug'=>'commons','name'=>'Commons','kind'=>'commons','color'=>'#f5b026','icon'=>'ph ph-house','status'=>'active','pinned'=>1,'description'=>'Everyone in NGG','createdAt'=>${now}]);`
      + `db_insert('community_channels', ['channelId'=>'CH-CODE','slug'=>'cv-coding','name'=>'Cv Coding','kind'=>'course','color'=>'#3b5bdb','icon'=>'ph ph-code','status'=>'active','description'=>'Practical coding · Saturdays','createdAt'=>${now}]);`
      + `db_insert('community_channels', ['channelId'=>'CH-ROBO','slug'=>'cv-robots','name'=>'Cv Robots','kind'=>'course','color'=>'#1d6b30','icon'=>'ph ph-robot','status'=>'active','createdAt'=>${now}]);`
      + post('CP-ANN1', MENTOR, 'Tunde O.', 'CH-CODE', "Showcase is on Saturday\nBring one thing you made.", `['kind'=>'announce','pinned'=>1]`)
      + post('CP-VID1', MENTOR, 'Tunde O.', 'CH-CODE', 'Lesson 3: wiring a button', `['mediaType'=>'video','mediaUrl'=>'${clipUrl}','mediaDuration'=>8,'mediaMeta'=>json_encode(['title'=>'Wiring a button','chapters'=>[[0,'Hello'],[4,'Wiring']],'captions'=>[[0,'Hello everyone'],[4,'Now the wires']]])]`)
      + post('CP-CODE1', STUDENT2, 'Kunle B.', 'CH-CODE', 'My first page', `['mediaType'=>'code','mediaCode'=>'<h1 id="hi">Hi</h1>','mediaMeta'=>json_encode(['title'=>'about.html'])]`)
      + post('CP-Q1', STUDENT2, 'Kunle B.', 'CH-CODE', 'How do I centre a div?', `['kind'=>'question']`)
      + post('CP-ROBO', MENTOR, 'Tunde O.', 'CH-ROBO', 'Robots only post')
      + `db_insert('community_comments', ['commentId'=>'CC-A1','postId'=>'CP-Q1','memberId'=>'${MENTOR}','memberName'=>'Tunde O.','body'=>'Use flexbox on the parent.','status'=>'published','createdAt'=>${now}]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    if (process.env.CMV3_LAB) {   // keep the seeded server up for manual driving
      fs.writeFileSync(process.env.CMV3_LAB, JSON.stringify({ BASE, DB, toks: Object.fromEntries([STUDENT, STUDENT2, MENTOR, LEAD].map(id => [id, mintSession(id)])) }));
      console.log('LAB READY ' + BASE); await new Promise(() => {});
    }
    browser = await chromium.launch(launch);
    const openAs = async (id, p, vp) => {
      const ctx = await browser.newContext({ viewport: vp || { width: 1320, height: 960 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: mintSession(id), domain: '127.0.0.1', path: '/', httpOnly: true }]);
      const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|\[BABEL\] Note/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
      await page.goto(BASE + (p || '/community'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForFunction(() => !!document.querySelector('.cm3-app') || /Couldn’t open the Community/.test(document.body.innerText), null, { timeout: 60000 });
      return { page, errs };
    };
    const text = page => page.evaluate(() => document.body.innerText);
    const waitText = (page, re, ms) => page.waitForFunction(src => new RegExp(src).test(document.body.innerText), re.source, { timeout: ms || 15000 }).then(() => true).catch(() => false);
    const click = (page, re, scope) => page.evaluate(({ src, scope }) => { const r = new RegExp(src); const root = scope ? document.querySelector(scope) : document; const all = root ? Array.from(root.querySelectorAll('button')).filter(x => r.test((x.innerText || x.getAttribute('aria-label') || '').trim()) && x.getClientRects().length) : []; const b = all[all.length - 1]; if (b) { b.click(); return true; } return false; }, { src: re.source, scope });
    const shot = async (page, n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };

    console.log('\n── A student\'s home ───────────────────────────────────────');
    const s = await openAs(STUDENT);
    chk('the v3 Community opens for a student', await waitText(s.page, /NGG Community/, 20000));
    chk('the carousel shows a real announcement from their channel', await waitText(s.page, /Showcase is on Saturday/, 15000));
    let t = await text(s.page);
    chk('the feed reads only the channels they follow', /Wiring a button/.test(t) && !/Robots only post/.test(t));
    chk('a question shows it is waiting for an answer', /Waiting for an answer/.test(t));
    await shot(s.page, '01-home');

    console.log('\n── The safety check, as you type ───────────────────────────');
    await click(s.page, /^New post$/);
    await s.page.waitForTimeout(400);
    const ta = DLG + ' textarea';
    await s.page.fill(ta, 'call me on 08031234567');
    chk('a phone number is flagged before posting', await waitText(s.page, /looks like a phone number/, 5000));
    chk('…and the button says it will be checked', await waitText(s.page, /Send for a check/, 3000));
    await s.page.fill(ta, 'that is so stupid');
    chk('an unkind word gets a kinder rewrite', await waitText(s.page, /Use a kinder version/, 5000));
    await click(s.page, /^Use a kinder version$/);
    chk('…which replaces the word', (await s.page.inputValue(ta)) === 'that is so not right');
    await s.page.fill(ta, 'Built my first robot arm today, it waves!');
    chk('kind words say so', await waitText(s.page, /Looks kind and clear/, 5000));
    await click(s.page, /^Post$/, DLG);
    chk('posting publishes it to the feed', await waitText(s.page, /Built my first robot arm today/, 10000));
    const sp = q("SELECT status FROM community_posts WHERE body LIKE 'Built my first robot arm%'")[0] || {};
    chk('…and it is stored as published or held, never lost', sp.status === 'published' || sp.status === 'pending');

    console.log('\n── Reactions, save, reply ──────────────────────────────────');
    await s.page.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(x => /Wiring a button/.test(x.innerText)); const b = a && Array.from(a.querySelectorAll('button')).find(x => x.getAttribute('aria-label') === 'Add a reaction'); if (b) b.click(); });
    await s.page.waitForTimeout(300);
    const picked = await s.page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /React with 🔥/.test(x.getAttribute('aria-label') || '') && x.offsetParent); if (b) { b.click(); return true; } return false; });
    await s.page.waitForTimeout(1200);
    chk('a reaction can be added from the picker', picked && (q("SELECT emoji FROM community_reactions WHERE postId = 'CP-VID1' AND memberId = '" + STUDENT + "'")[0] || {}).emoji === '🔥');
    chk('the reaction emoji is self-hosted', await s.page.evaluate(() => Array.from(document.querySelectorAll('img')).some(i => /\/assets\/emoji\/1f525\.gif/.test(i.src)) || /assets\/emoji\/1f525/.test(document.body.innerHTML)));
    await s.page.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(x => /Wiring a button/.test(x.innerText)); const b = a && Array.from(a.querySelectorAll('button')).find(x => x.getAttribute('aria-label') === 'Save'); if (b) b.click(); });
    await s.page.waitForTimeout(1000);
    chk('saving bookmarks the post', q("SELECT id FROM community_bookmarks WHERE postId = 'CP-VID1' AND memberId = '" + STUDENT + "'").length === 1);
    await s.page.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(x => /How do I centre a div/.test(x.innerText)); const b = a && Array.from(a.querySelectorAll('button')).find(x => /repl|Reply/.test(x.innerText)); if (b) b.click(); });
    chk('a thread opens with the replies', await waitText(s.page, /Use flexbox on the parent/, 8000));
    await s.page.fill('textarea[aria-label="Write a reply"]', 'Thanks, that worked!');
    await click(s.page, /^Send reply$/);
    await s.page.waitForTimeout(1500);
    chk('a reply is sent', q("SELECT status FROM community_comments WHERE postId = 'CP-Q1' AND memberId = '" + STUDENT + "'").length === 1);
    await click(s.page, /^Close replies$/);

    console.log('\n── The video player ────────────────────────────────────────');
    await s.page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Play video/.test(x.getAttribute('aria-label') || '')); if (b) b.click(); });
    chk('the player opens on a real video with its chapters', await waitText(s.page, /Chapters/, 8000) && await s.page.evaluate(() => !!document.querySelector('video.cm3x-video')));
    await s.page.evaluate(() => { const v = document.querySelector('video.cm3x-video'); v.muted = true; return v.play().catch(() => {}); });
    await s.page.waitForTimeout(2500);
    chk('it really plays (time moves)', await s.page.evaluate(() => document.querySelector('video.cm3x-video').currentTime > 0.5));
    // php -S serves no byte ranges, so the clip cannot seek here; let it play past the 4s cue.
    chk('captions follow the time', await waitText(s.page, /Now the wires/, 8000));
    await s.page.evaluate(() => document.querySelector('video.cm3x-video').pause());
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(1200);
    const pos = q("SELECT pos FROM community_video_progress WHERE postId = 'CP-VID1' AND memberId = '" + STUDENT + "'")[0] || {};
    chk('closing remembers where they stopped, on the server', +pos.pos >= 4);
    chk('the card offers to resume', await waitText(s.page, /Resume at 0:0[45]/, 5000));

    console.log('\n── Code and files ──────────────────────────────────────────');
    await s.page.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(x => /My first page/.test(x.innerText)); const b = a && Array.from(a.querySelectorAll('button')).find(x => /Open & run/.test(x.innerText)); if (b) b.click(); });
    chk('a code post opens in the editor with its source', await waitText(s.page, /your edits stay on your device/, 8000) && await s.page.evaluate(() => /<h1 id="hi">Hi<\/h1>/.test((document.querySelector('textarea[aria-label="Code"]') || {}).value || '')));
    chk('…and runs in a sandboxed preview', await s.page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); return !!f && f.getAttribute('sandbox') === 'allow-scripts'; }));
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(400);
    chk('Escape closes the code viewer', await s.page.evaluate(() => !document.querySelector('iframe[title="Preview"]')));
    await click(s.page, /^Files$/, '.cm3-app aside');
    chk('Files lists videos and code across their channels', await waitText(s.page, /about\.html/, 8000) && /Wiring a button/.test(await text(s.page)));

    console.log('\n── Reporting ───────────────────────────────────────────────');
    await click(s.page, /^Home$/, '.cm3-app aside');
    await waitText(s.page, /My first page/, 8000);
    await s.page.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(x => /My first page/.test(x.innerText)); const b = a && Array.from(a.querySelectorAll('button')).find(x => x.getAttribute('aria-label') === 'Report this post' || /Report/.test(x.innerText)); if (b) b.click(); });
    await s.page.waitForTimeout(400);
    await click(s.page, /I’m worried someone is not safe/);
    await click(s.page, /^Send report$/);
    await s.page.waitForTimeout(1500);
    chk('"worried someone is not safe" opens a safeguarding case', q("SELECT severity, source FROM community_safeguarding WHERE postId = 'CP-CODE1'").some(r => r.source === 'report' && r.severity === 'high'));
    chk('no page errors for the student', s.errs.length === 0);
    if (s.errs.length) s.errs.slice(0, 6).forEach(e => console.error('      ' + e));

    console.log('\n── A mentor ────────────────────────────────────────────────');
    const m = await openAs(MENTOR);
    await waitText(m.page, /NGG Community/, 20000);
    await click(m.page, /^Homework$/, '.cm3-app aside');
    await click(m.page, /^New post$/);
    await m.page.waitForTimeout(400);
    await click(m.page, /^Homework$/, DLG);
    await m.page.waitForTimeout(300);
    await m.page.fill(DLG + ' input', 'About me page');
    await m.page.fill(DLG + ' textarea', 'Build a page about yourself and share a screenshot.');
    await click(m.page, /^Set homework$/, DLG);
    chk('a mentor sets homework from the composer', await waitText(m.page, /Homework set/, 10000) && q("SELECT title FROM community_homework WHERE title = 'About me page'").length === 1);
    const qid = 'CP-Q1';
    await click(m.page, /^Home$/, '.cm3-app aside');
    await waitText(m.page, /How do I centre a div/, 8000);
    await m.page.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(x => /How do I centre a div/.test(x.innerText)); const b = a && Array.from(a.querySelectorAll('button')).find(x => /repl|Reply/.test(x.innerText)); if (b) b.click(); });
    await waitText(m.page, /Thanks, that worked/, 8000);
    chk('staff can mark a reply as the answer', await click(m.page, /^Mark as the answer$/));
    await m.page.waitForTimeout(1200);
    chk('…and the question is answered', (q("SELECT answerId FROM community_posts WHERE postId = '" + qid + "'")[0] || {}).answerId !== '');
    chk('no page errors for the mentor', m.errs.length === 0);
    if (m.errs.length) m.errs.slice(0, 6).forEach(e => console.error('      ' + e));

    console.log('\n── The student hands in homework ───────────────────────────');
    await s.page.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(s.page);
    await waitText(s.page, /NGG Community/, 20000);
    await click(s.page, /^Homework/, '.cm3-app aside');
    chk('the student sees the task to do', await waitText(s.page, /About me page/, 10000));
    await s.page.fill('textarea', 'I made a page with three facts.').catch(() => {});
    await click(s.page, /^Hand in$/);
    await s.page.waitForTimeout(1500);
    chk('handing in is recorded', q("SELECT s.submittedAt FROM community_homework_state s JOIN community_homework h ON h.homeworkId = s.homeworkId WHERE h.title = 'About me page' AND s.memberId = '" + STUDENT + "'").some(r => r.submittedAt));

    console.log('\n── The community team moderates ────────────────────────────');
    const a = await openAs(LEAD);
    await waitText(a.page, /NGG Community/, 20000);
    await click(a.page, /^Moderation/, '.cm3-app aside');
    chk('moderation opens with the queue', await waitText(a.page, /Waiting for review/, 15000));
    chk('…and the safeguarding case is there for a trained lead', await click(a.page, /^Safeguarding/, '.cm3-app aside') && await waitText(a.page, /High concern/, 8000));
    await shot(a.page, '05-moderation');
    chk('no page errors for the lead', a.errs.length === 0);
    if (a.errs.length) a.errs.slice(0, 6).forEach(e => console.error('      ' + e));

    console.log('\n── Phone ───────────────────────────────────────────────────');
    const p = await openAs(STUDENT, '/community', { width: 390, height: 800 });
    await waitText(p.page, /Showcase is on Saturday/, 20000);
    const fits = await p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    chk('nothing runs off the side of a phone', fits);
    await shot(p.page, '06-phone');
  } catch (e) {
    failed++; console.error('  ✗ FAIL: harness — ' + (e && e.message ? e.message : e));
    if (e && e.stack) console.error(String(e.stack).split('\n').slice(0, 4).join('\n'));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (community v3)');
  process.exit(failed ? 1 : 0);
})();
