#!/usr/bin/env node
/* ============================================================================
   "My week" (src/modules/timetable/tt-myweek.jsx) — a child's personal
   timetable, made by tapping (owner, 19 Nov 2026: "The timetable is also pretty
   complicated for kids" … "Personal timetable first!").

   1. The model: the week as entries (school as one block, the child's own
      things, the NGG sessions they keep), the merge that replaces only what this
      flow made, reading it back, and overlaps found in words.
   2. End to end, on a phone, against the real PHP backend: a member with no
      timetable opens /timetable and gets "My week", not the full maker; taps
      school, homework and football, keeps their NGG session, checks and saves.
      What was in the timetable already is kept, and the NGG registration item
      "Personal timetable on the site" passes.

   Run:  node tests/timetable-myweek.test.js
   ========================================================================== */
'use strict';

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

// ── 1. The model: the module's own source, compiled as the browser does, in a sandbox ──
const babel = require(path.join(ROOT, 'vendor', 'babel.min.js'));
const jsx = f => babel.transform(fs.readFileSync(path.join(ROOT, f), 'utf8'), { presets: ['react'], sourceType: 'script', configFile: false, babelrc: false }).code;
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(jsx('src/modules/timetable/tt-core.jsx') + '\n' + jsx('src/modules/timetable/tt-myweek.jsx')
  + '\n;Object.assign(this, { mwEntries, mwMerge, mwFrom, mwClashes, MW_ACTIVITIES });', sandbox);
const { mwEntries, mwMerge, mwFrom, mwClashes, MW_ACTIVITIES } = sandbox;

const school = { on: true, days: [5, 1, 2, 3, 4], start: '08:00', end: '14:00' };
const items = [{ title: 'Homework', kind: 'study', days: [1, 2, 3], start: '16:00', len: 60 }, { title: 'Football', kind: 'activity', days: [6], start: '09:00', len: 90 }];
const ngg = [{ keep: true, entry: { title: 'Coding', days: [6], start: '10:00', end: '12:00', kind: 'class', official: true, source: 'Egbeda', mine: true } },
             { keep: false, entry: { title: 'Chess', days: [6], start: '12:00', end: '13:00', kind: 'activity', official: true, source: 'Egbeda' } }];
const E = mwEntries(school, items, ngg);
chk('school is ONE block on its days, as a class (what the registration item counts)', E[0].id === 'mwschool' && E[0].kind === 'class' && JSON.stringify(E[0].days) === '[1,2,3,4,5]' && E[0].end === '14:00');
chk('the child’s own things end when they last: Football at 9:00 for 1½ hours ends at 10:30', (E.find(e => e.title === 'Football') || {}).end === '10:30');
chk('only the NGG sessions they keep go in, still marked as the centre’s', E.filter(e => e.official).length === 1 && E.some(e => e.title === 'Coding' && e.official) && !E.some(e => e.title === 'Chess'));
chk('"I don’t go to school" puts no school in', !mwEntries(Object.assign({}, school, { on: false }), items, []).some(e => e.id === 'mwschool'));
const clash = mwClashes(E);
chk('an overlap is found and said in words: Football and Coding on Saturday', clash.length === 1 && clash[0].day === 'Saturday' && clash[0].a === 'Football' && clash[0].b === 'Coding');
const saved = { settings: { title: 'Tobi’s week', theme: 'paper' }, entries: [
  { id: 'mw0', title: 'Old thing', days: [1], start: '18:00', end: '19:00', kind: 'activity' },
  { id: 'p1', title: 'Piano', days: [6], start: '15:00', end: '16:00', kind: 'activity' },
  { id: 'o1', title: 'Old NGG', days: [6], start: '09:00', end: '10:00', kind: 'class', official: true }], exceptions: { '2026-11-16': { skip: {}, once: [] } } };
const M = mwMerge(saved, E, true);
chk('saving replaces what this flow made and the NGG sessions, and keeps what the child made in the full maker',
  !M.entries.some(e => e.title === 'Old thing' || e.id === 'o1') && M.entries.some(e => e.id === 'p1') && M.settings.theme === 'paper' && !!M.exceptions['2026-11-16']);
chk('…but when the NGG sessions could not be read, the ones already there are kept', mwMerge(saved, mwEntries(school, items, []), false).entries.some(e => e.id === 'o1'));
const back = mwFrom({ entries: E });
chk('opening it again reads the answers back: the school days and times, and each thing with its days, time and length',
  back.school.on && back.school.start === '08:00' && back.items.length === 2 && back.items[1].len === 90 && back.items[0].days.join() === '1,2,3');
chk('the things to tap are a child’s week here, in their words', ['Homework', 'Extra lessons', 'Arabic school', 'Church', 'Mosque', 'Chores'].every(t => MW_ACTIVITIES.some(a => a[0] === t)));

// ── 2. On a phone, end to end ──
(async () => {
  let chromium = null;
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { chromium = require(m).chromium; break; } catch (_) {} }
  if (!chromium) { console.log('⏭  the browser part skipped (playwright not installed)'); return finish(); }
  const { waitForServer, waitForBoot } = require('./_serve');
  const PORT = process.env.TT_MYWEEK_PORT || '8291', BASE = 'http://127.0.0.1:' + PORT;
  const CFG = path.join(ROOT, 'api', 'config.php');
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ttmyweek-'));
  let seq = 0, server, browser;
  // A PHP snippet written to a file and run with execFile: no shell is involved.
  const php = snippet => { const f = path.join(TMP, `s${++seq}.php`);
    fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet);
    return execFileSync('php', [f], { cwd: ROOT }).toString().trim(); };
  fs.writeFileSync(CFG, `<?php return ['db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(path.join(TMP, 'ngg.db'))}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']], 'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'tt_myweek_secret_0123456789abcdefg', 'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false];\n`);
  try {
    php(`db_migrate(db_conn());
      db_insert('centres', ['centreId' => 'CEN-MW-1', 'name' => 'Egbeda', 'code' => 'EG', 'status' => 'active', 'slug' => 'egbeda', 'createdAt' => now_iso()]);
      db_insert('members', ['memberId' => 'NGG-MW-1', 'fullName' => 'Tobi Adeyemi', 'email' => 'mw1@example.org', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'track' => 'Coding', 'courses' => 'Coding', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
      foreach ([['Coding', '10:00', '12:00'], ['Drama', '12:00', '13:00']] as $i => $s) db_insert('timetable_slots', ['slotId' => 'SL-MW-' . $i, 'centreId' => 'CEN-MW-1', 'course' => $s[0], 'level' => '', 'weekday' => 6,
        'startTime' => $s[1], 'endTime' => $s[2], 'room' => 'ICT room', 'instructorId' => '', 'note' => '', 'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (fs.existsSync('/opt/pw-browsers')) launch.executablePath = require('./_responsive-probe').chromiumPath(require('fs'));
    browser = await chromium.launch(launch);
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-MW-1'"), false);`);
    await c.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const page = await c.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const SH = process.env.TT_SHOTS; const shot = async n => { if (SH) { fs.mkdirSync(SH, { recursive: true }); await page.screenshot({ path: path.join(SH, n + '.png'), fullPage: true }); } };
    await page.goto(BASE + '/timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    chk('a member with no timetable yet who opens /timetable gets "My week", not the full maker',
      await page.waitForSelector('.tsw', { timeout: 60000 }).then(() => true, () => false) && !(await page.$('.tt-app')));
    await page.waitForSelector('.tsw-chip:text-is("Yes")');
    await shot('myweek-1-school');
    const small = await page.$$eval('.tsw button', bs => bs.filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).length);
    chk('every button is big enough for a child’s finger (none under 44px tall)', small === 0);
    await page.click('.tsw-chip:text-is("2pm")');
    await page.click('.tsw-go:text-is("Next")');
    // Homework, Mon–Wed at 4pm for an hour.
    await page.click('.tsw-subj:text-is("Homework")');
    for (const d of ['Mon', 'Tue', 'Wed']) await page.click(`.tsw-sheet .tsw-chip:text-is("${d}")`);
    await page.click('.tsw-sheet .tsw-chip:text-is("4pm")');
    await page.click('.tsw-go:text-is("Add to my week")');
    // Football, Saturday morning at 9 for 1½ hours.
    await page.click('.tsw-subj:text-is("Football")');
    await page.click('.tsw-sheet .tsw-chip:text-is("Sat")');
    await page.click('.tsw-sheet .tsw-chip:text-is("Morning")');
    await page.click('.tsw-sheet .tsw-chip:text-is("9am")');
    await page.click('.tsw-sheet .tsw-chip:text-is("1½ hours")');
    await page.click('.tsw-go:text-is("Add to my week")');
    chk('things are added by tapping: what, which days, when and how long', /Homework[\s\S]*Mon, Tue, Wed · 4pm/.test(await page.innerText('.tsw-mine')) && /Football[\s\S]*Sat · 9am/.test(await page.innerText('.tsw-mine')));
    await shot('myweek-2-things');
    await page.click('.tsw-go:text-is("Next")');
    chk('their NGG sessions come from their centre, with their own course ticked and one they do not take left unticked',
      await page.waitForSelector('text=Your NGG sessions').then(() => true, () => false)
      && (await page.$eval('.tsw-row:has-text("Coding")', b => b.getAttribute('aria-checked'))) === 'true'
      && (await page.$eval('.tsw-row:has-text("Drama")', b => b.getAttribute('aria-checked'))) === 'false');
    await shot('myweek-3-ngg');
    await page.click('.tsw-go:text-is("Next")');
    chk('the check page lists the week day by day, and says in words what overlaps',
      /Saturday[\s\S]*9am[\s\S]*Football[\s\S]*10am[\s\S]*Coding/.test(await page.innerText('.tsw-week')) && /Football and Coding on Saturday/.test(await page.innerText('.tsw')));
    await shot('myweek-4-check');
    await page.click('.tsw-go:text-is("Save my week")');
    chk('saved, and the child is told so in plain words', await page.waitForSelector('text=Your week is saved', { timeout: 20000 }).then(() => true, () => false));
    await shot('myweek-5-saved');
    const doc = JSON.parse(php(`echo db_row("SELECT doc FROM member_timetables WHERE memberId = 'NGG-MW-1'")['doc'];`));
    chk('the saved week is the maker’s own document: school, homework, football and their NGG session',
      ['School', 'Homework', 'Football', 'Coding'].every(t => doc.entries.some(e => e.title === t)) && !doc.entries.some(e => e.title === 'Drama'));
    chk('…and the registration checklist’s "Personal timetable on the site" item passes for them',
      php(`echo rcl_verify_timetable(db_row("SELECT * FROM members WHERE memberId = 'NGG-MW-1'"), rcl_facts(['NGG-MW-1'])) ? 'yes' : 'no';`) === 'yes');
    const p2 = await c.newPage();
    await p2.goto(BASE + '/timetable', { waitUntil: 'domcontentloaded' }); await waitForBoot(p2);
    chk('with a week saved, /timetable opens the full maker to see and print it', await p2.waitForSelector('.tt-app', { timeout: 60000 }).then(() => true, () => false) && !(await p2.$('.tsw')));
    await p2.goto(BASE + '/timetable?easy=1', { waitUntil: 'domcontentloaded' }); await waitForBoot(p2);
    await p2.waitForSelector('.tsw'); await p2.click('.tsw-go:text-is("Next")');
    chk('…and "My week" opens again with their answers read back, ready to change', /Homework/.test(await p2.innerText('.tsw-mine')) && /Football/.test(await p2.innerText('.tsw-mine')));
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) { failed++; console.error('  ✗ FAIL: threw — ' + (e && e.stack || e)); }
  finally {
    try { if (browser) await browser.close(); } catch (_) {}
    try { if (server) process.kill(-server.pid); } catch (_) {}
    try { fs.unlinkSync(CFG); } catch (_) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  }
  finish();
})();

function finish() {
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (my week)` : `✅ PASS: ${passed} passed, 0 failed (my week)`));
  process.exit(failed ? 1 : 0);
}
