#!/usr/bin/env node
/* ============================================================================
   The Timetable Maker (/timetable, v5), end to end against the real PHP
   backend: the tree chosen by the page's own width, quick add and Undo, the
   overlap fix, a skipped day, Back closing layers in order, every download
   made for real (calendar file, share image, wallpaper, print-PDF, link),
   saving by email and to a member account, a save conflict and its Retry, a
   centre that moved a session, and the links that open a copy.

   The model's arithmetic is timetable-core.test.js's; this holds that the page
   does what the model says.

   Run:  node tests/timetable-maker.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.TIMETABLE_MAKER_PORT || '8287';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ttmaker-'));
const DB = path.join(TMP, 'ngg.db');
const NOW = '2026-10-05T10:40:00';   // a Monday, in the morning break
const SHOTS = process.env.TT_SHOTS || '';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
const pngSize = buf => buf.slice(1, 4).toString() === 'PNG' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null;

/* Tobi's week: a school week, Egbeda's Saturday sessions, Piano on top of
   Coding, Maths off on Wednesday and a one-off test on Thursday. */
const FIXTURE = {
  s: { title: 'Tobi’s week', subtitle: 'JSS2 · Term 1', theme: 'paper', look: 'classic', layout: 'timeline', orient: 'auto', clock: '24', weekStart: 1, showPlace: true, legend: true, large: false, hideBreaks: false, fold: true, note: '', mode: 'school' },
  entries: [
    { id: 'm1', title: 'Mathematics', days: [1, 3, 5], start: '08:00', end: '09:00', place: 'Room 4', color: 0, kind: 'class' },
    { id: 'm3', title: 'English', days: [1, 2, 4], start: '09:00', end: '10:00', place: 'Room 2', color: 3, kind: 'class' },
    { id: 'm6', title: 'Break', days: [1, 2, 3, 4, 5], start: '10:30', end: '11:00', place: '', color: 7, kind: 'break' },
    { id: 'm7', title: 'French', days: [1, 3], start: '11:00', end: '12:00', place: 'Room 6', color: 4, kind: 'class' },
    { id: 'm10', title: 'Homework club', days: [1, 3], start: '14:00', end: '15:00', place: 'Library', color: 4, kind: 'study' },
    { id: 'p1', title: 'Piano', days: [6], start: '11:00', end: '12:00', place: 'Music room', color: 3, kind: 'activity' },
    { id: 'o1', title: 'Chess', days: [6], start: '10:00', end: '11:00', place: 'Main hall', color: 0, kind: 'activity', official: true, source: 'Egbeda', mine: false },
    { id: 'o2', title: 'Coding', days: [6], start: '11:00', end: '12:30', place: 'ICT room', color: 6, kind: 'class', official: true, source: 'Egbeda', mine: true },
  ],
  ex: { '2026-10-05': { skip: { 'm1:3': true }, once: [{ id: 'x1', title: 'Maths test', days: [4], start: '14:00', end: '15:00', place: 'Hall', color: 0, kind: 'class', once: true }] } },
};

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  timetable maker: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'timetable_maker_secret_0123456789ab',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-TM-1','fullName'=>'Tobi Adeyemi','email'=>'tm-1@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Coding','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-TM-2','fullName'=>'Kemi Bello','email'=>'tm-2@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Coding','courses'=>'Coding','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('centres', ['centreId'=>'CEN-TM-1','name'=>'Egbeda','code'=>'EG','status'=>'active','meetDays'=>'Saturdays','meetTime'=>'10am - 2pm','slug'=>'egbeda','createdAt'=>${now}]);`
      + `foreach ([['Chess','10:00','11:00','Main hall'],['Coding','11:00','12:30','ICT room']] as $i => $s) db_insert('timetable_slots', ['slotId'=>'SL-TM-'.$i,'centreId'=>'CEN-TM-1','course'=>$s[0],'level'=>'','weekday'=>6,'startTime'=>$s[1],'endTime'=>$s[2],'room'=>$s[3],'instructorId'=>'VOL-SECRET','note'=>'','status'=>'active','createdAt'=>${now},'updatedAt'=>${now}]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else {
      const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
      if (d) launch.executablePath = require('./_responsive-probe').chromiumPath(require('fs'));
    }
    browser = await chromium.launch(launch);
    const errs = [];

    /** A viewport with the clock pinned, a seeded browser, and optionally a member's session. */
    const open = async ({ w, h, seed, mid, at, touch }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'Africa/Lagos', hasTouch: !!touch, acceptDownloads: true });
      await ctx.addInitScript(n => {
        const R = Date, off = new R(n).getTime() - R.now();
        class D extends R { constructor(...a) { super(...(a.length ? a : [R.now() + off])); } static now() { return R.now() + off; } }
        window.Date = D;
      }, NOW);
      if (seed) await ctx.addInitScript(s => { try { if (!sessionStorage.getItem('tt-seeded')) { localStorage.setItem(s.k, s.v); sessionStorage.setItem('tt-seeded', '1'); } } catch (_) {} }, seed);
      if (mid) {
        const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${mid}'"), false);`, ['session']);
        await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                              { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      }
      const page = await ctx.newPage();
      page.on('pageerror', e => errs.push(w + ': ' + String(e).slice(0, 240)));
      await page.goto(BASE + (at || '/timetable'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForSelector('.tt-app', { timeout: 30000 });
      await page.waitForTimeout(500);
      return page;
    };
    const v2 = { k: 'ngg.timetable.maker.v2', v: JSON.stringify(FIXTURE) };
    const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ngg.timetable.maker.v2') || 'null'));
    const toast = page => page.waitForSelector('.tt-toast', { timeout: 6000 }).then(el => el.innerText()).catch(() => '');
    const layers = page => page.$$eval('.tt-layer', l => l.length);
    const pill = page => page.$eval('.tt-savepill', b => b.innerText + '|' + b.title);
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

    /* ── Phone ── */
    console.log('phone (390)');
    const P = await open({ w: 390, h: 844, seed: v2, touch: true });
    chk('the phone tree, not a reflowed desktop: an app bar and a composer, no header or panes',
      !!(await P.$('.tt-pbar')) && !!(await P.$('.tt-composer')) && !(await P.$('.tt-head')) && !(await P.$('.tt-listpane')));
    chk('…nothing scrolls sideways, and <main> is the one scroll container', await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && getComputedStyle(document.querySelector('.tt-pmain')).overflowY === 'auto'));
    chk('the week strip has a button per day in use, today named and counted',
      (await P.$$('.tt-stripday')).length === 6 && (await P.getAttribute('.tt-stripday >> nth=0', 'aria-label')) === 'Monday 5, today, 5 on');
    chk('the day opens on Today, with its span', (await P.innerText('.tt-dayhead h1')) === 'Today' && /Monday 5 · 5 on, 08:00–15:00/.test(await P.innerText('.tt-dayhead-text')));
    chk('the week label counts this week\'s changes', /This week · 2 changes/.test(await P.innerText('.tt-weeklabel')));
    chk('the break is on now, and says so', /Break\s*Now/.test(await P.innerText('.tt-prow-wrap.is-now')));
    chk('a free gap of 30 minutes or more shows between rows', /Free · 30 min/.test(await P.innerText('.tt-psec')));

    await P.click('.tt-composer-input');
    await P.keyboard.type('Football Tue Thu 4–5:30pm at the field');
    const preview = await P.innerText('.tt-qa-preview');
    chk('quick add shows what it understood before anything is added', /Football/.test(preview) && /Tue Thu · 16:00–17:30 · The field/.test(preview) && await P.$eval('.tt-send', b => b.classList.contains('is-ready')));
    await P.keyboard.press('Enter');
    chk('adding says what was added, with Undo', /Added Football · Tue Thu 16:00\s*Undo/.test(await toast(P)));
    await P.waitForTimeout(450);
    const fb = (await stored(P)).entries.find(e => e.title === 'Football');
    chk('…and keeps it in this browser, typed as an activity', !!fb && fb.days.join() === '2,4' && fb.start === '16:00' && fb.end === '17:30' && fb.kind === 'activity' && fb.place === 'The field');
    await P.click('.tt-toast-undo');
    await P.waitForTimeout(450);
    chk('Undo takes it away again', !(await stored(P)).entries.some(e => e.title === 'Football'));
    await P.fill('.tt-composer-input', '8-9');
    await P.keyboard.press('Enter');
    chk('a line with no name is refused with an example', /Add a name, like “Maths Mon 8–9”/.test(await toast(P)));
    await P.fill('.tt-composer-input', '');

    await P.click('.tt-prow >> nth=0');
    await P.waitForSelector('.tt-form');
    chk('a row opens the class form, offering to skip just that date', /Skip just Mon 5 Oct/.test(await P.innerText('.tt-skipbtn')));
    await shot(P, 'phone-form');
    await P.click('.tt-skipbtn');
    chk('skipping says so, with Undo', /Mathematics is off Mon 5 Oct\s*Undo/.test(await toast(P)));
    chk('…the row stays, struck through and marked', await P.$eval('.tt-prow >> nth=0', b => b.classList.contains('is-skipped')) && /Off this week/.test(await P.innerText('.tt-prow >> nth=0')));
    chk('…and the day counts one fewer', (await P.getAttribute('.tt-stripday >> nth=0', 'aria-label')) === 'Monday 5, today, 4 on');

    await P.click('.tt-more');
    await P.waitForSelector('.tt-layer');
    chk('More opens as one layer', (await layers(P)) === 1);
    await P.evaluate(() => history.back());
    await P.waitForTimeout(400);
    chk('the browser Back button closes it', (await layers(P)) === 0);

    const swipe = (x0, x1) => P.evaluate(([a, b]) => {
      const m = document.querySelector('.tt-pmain');
      const t = x => new Touch({ identifier: 1, target: m, clientX: x, clientY: 400 });
      m.dispatchEvent(new TouchEvent('touchstart', { touches: [t(a)], changedTouches: [t(a)], bubbles: true }));
      m.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(b)], bubbles: true }));
    }, [x0, x1]);
    await swipe(8, 300);
    await P.waitForTimeout(200);
    chk('a swipe that starts at the screen edge is left to the system', (await P.innerText('.tt-dayhead h1')) === 'Today');
    await swipe(300, 120);
    await P.waitForTimeout(200);
    chk('a swipe left moves to the next day', (await P.innerText('.tt-dayhead h1')) === 'Tomorrow');
    await P.click('[aria-label="Next week"]');
    chk('another week says how to come back', /Next week · tap for this week/.test(await P.innerText('.tt-weeklabel')));
    await P.click('.tt-weeklabel');

    await P.context().setOffline(true);
    await P.waitForTimeout(300);
    chk('offline is said, and nothing is lost', /You’re offline\. Changes are saved on this device\./.test(await P.innerText('.tt-app')));
    await P.context().setOffline(false);
    await P.click('[aria-label="Download or share"]');
    await P.waitForSelector('.tt-fmtrow');
    chk('the phone download sheet lists the five formats first', (await P.$$('.tt-fmtrow')).length === 5 && /Best for printing/.test(await P.innerText('.tt-dl')));
    await P.click('.tt-fmtrow >> nth=0');
    await P.waitForSelector('.tt-dl-box .tt-stage');
    chk('…a format opens its detail, with its preview and a way back', !!(await P.$('[aria-label="All formats"]')) && /Download PDF/.test(await P.innerText('.tt-lfoot--dl')));
    await P.context().close();

    /* ── Desktop, three panes ── */
    console.log('desktop (1440)');
    const Dk = await open({ w: 1440, h: 900, seed: v2 });
    chk('three panes at 1440: the list, the preview and the right column', !!(await Dk.$('.tt-head')) && !!(await Dk.$('.tt-listpane')) && !!(await Dk.$('.tt-previewpane')) && !!(await Dk.$('.tt-rail')));
    chk('…print options live in the right column, so there is no Options button', !(await Dk.$('.tt-optbtn')) && /Print options/.test(await Dk.innerText('.tt-rail')));
    chk('…and now/next is said once, in the right column, not in the toolbar too', !(await Dk.$('.tt-nowline')) && /Now · until 11:00/.test(await Dk.innerText('.tt-nowcard')));
    chk('the preview is the poster at its print size, scaled', await Dk.$eval('.tt-stage--preview .tt-pos', el => el.style.width === '1600px'));
    chk('each pane scrolls on its own; the page does not', await Dk.evaluate(() => ['.tt-listpane', '.tt-previewpane', '.tt-rail'].every(s => getComputedStyle(document.querySelector(s)).overflowY === 'auto') && getComputedStyle(document.querySelector('.tt-app')).overflow === 'hidden'));
    chk('the overlap offers a one-tap fix', /Overlaps Coding/.test(await Dk.innerText('.tt-listpane')) && /Move to 12:30/.test(await Dk.innerText('.tt-fixbtn')));
    await Dk.click('.tt-fixbtn');
    chk('…which moves it and says where', /Moved Piano to 12:30\s*Undo/.test(await toast(Dk)));
    await Dk.waitForTimeout(450);
    chk('…for real', (await stored(Dk)).entries.find(e => e.id === 'p1').start === '12:30');
    chk('changes this week are listed, the day off restorable', /One-offs and days off/.test(await Dk.innerText('.tt-listpane')) && /Off Wed 7 Oct · click to restore/.test(await Dk.innerText('.tt-listpane')));

    await Dk.click('.tt-btnrow .tt-btn >> nth=0');
    await Dk.waitForSelector('.tt-form');
    await Dk.waitForTimeout(100);
    chk('"Add with all options" opens the class form with its name focused', await Dk.evaluate(() => document.activeElement && document.activeElement.id === 'tt-form-name'));
    await Dk.click('.tt-form button[type=submit]');
    chk('an empty name is refused in words', /Give it a name\./.test(await Dk.innerText('.tt-form [role=alert]')));
    await Dk.keyboard.press('Escape');
    await Dk.waitForTimeout(300);
    chk('Escape closes it, and focus goes back to the button that opened it', (await layers(Dk)) === 0 && await Dk.evaluate(() => /Add with all options/.test(document.activeElement && document.activeElement.innerText)));
    await Dk.evaluate(() => document.activeElement.blur());
    await Dk.keyboard.press('f');
    await Dk.waitForSelector('.tt-layer--fs .tt-fsposter');
    await Dk.keyboard.press('Shift+?');
    await Dk.waitForSelector('.tt-layer--keys');
    chk('F opens full screen, and ? the shortcuts over it', (await layers(Dk)) === 2 && /Add in plain words\s*\//.test(await Dk.innerText('.tt-layer--keys')));
    await Dk.evaluate(() => history.back());
    await Dk.waitForTimeout(400);
    chk('Back closes the shortcuts first…', !(await Dk.$('.tt-layer--keys')) && !!(await Dk.$('.tt-layer--fs')));
    await Dk.evaluate(() => history.back());
    await Dk.waitForTimeout(400);
    chk('…then full screen', (await layers(Dk)) === 0);

    /* A finished download closes its drawer through history.back(), which lands
       a tick later; D is ignored while any layer is open, so wait for none. */
    const openDownload = async () => {
      await Dk.waitForFunction(() => !document.querySelector(".tt-layer"), null, { timeout: 15000 });
      await Dk.keyboard.press("d");
      await Dk.waitForSelector(".tt-fmtchips");
    };
    const download = async chip => {
      await openDownload();
      if (chip) await Dk.click('.tt-fmtchip:has-text("' + chip + '")');
      const [dl] = await Promise.all([Dk.waitForEvent('download', { timeout: 60000 }), Dk.click('.tt-lfoot--dl .tt-btn')]);
      return dl;
    };
    let dl = await download('Calendar');
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    chk('the calendar file is a real file, named after the timetable', dl.suggestedFilename() === 'tobis-week.ics' && /^BEGIN:VCALENDAR/.test(ics));
    chk('…weekly events in Lagos time until the end of term', /X-WR-TIMEZONE:Africa\/Lagos/.test(ics) && /RRULE:FREQ=WEEKLY;UNTIL=\d{8}T225959Z/.test(ics));
    chk('…the skipped Wednesday excluded', /EXDATE;TZID=Africa\/Lagos:20261007T080000/.test(ics));
    chk('…the one-off a single event with no rule', /DTSTART;TZID=Africa\/Lagos:20261008T140000\r\nDTEND;TZID=Africa\/Lagos:20261008T150000\r\nSUMMARY:Maths test/.test(ics));
    chk('…with a reminder ten minutes before', /TRIGGER:-PT10M/.test(ics));
    dl = await download('Image');
    let sz = pngSize(fs.readFileSync(await dl.path()));
    chk('the share image is the 1080×1350 card drawn at 2×', dl.suggestedFilename() === 'tobis-week.png' && !!sz && sz[0] === 2160 && sz[1] === 2700);
    dl = await download('Wallpaper');
    sz = pngSize(fs.readFileSync(await dl.path()));
    chk('the wallpaper is 1080×2340', dl.suggestedFilename() === 'tobis-week-wallpaper.png' && !!sz && sz[0] === 1080 && sz[1] === 2340);

    await openDownload();
    chk('the PDF says its text stays sharp', /Text stays sharp and searchable\./.test(await Dk.innerText('.tt-dl')));
    await Dk.click('.tt-lfoot--dl .tt-btn');
    await Dk.waitForSelector('.tt-print-frame', { state: 'attached', timeout: 30000 });
    await Dk.waitForTimeout(800);
    const pdf = await Dk.evaluate(() => { const d = document.querySelector('.tt-print-frame').contentDocument; return { css: d.querySelector('style').textContent, text: d.body.innerText, title: d.title }; });
    chk('the PDF prints the full-size poster onto an A4 landscape page', /@page\{size:297mm 210mm;margin:0\}/.test(pdf.css) && pdf.title === 'tobis-week');
    chk('…as real, selectable text', /Tobi’s week/.test(pdf.text) && /Mathematics/.test(pdf.text));

    await openDownload();
    await Dk.click('.tt-fmtchip:has-text("Link")');
    const link = await Dk.inputValue('.tt-linkfield');
    const back = await Dk.evaluate(u => { const d = ttDecode(u.split('#t=')[1]); return d && d.doc.entries.length; }, link);
    chk('the share link carries the whole timetable', link.startsWith(BASE + '/timetable#t=') && back === FIXTURE.entries.length);
    await Dk.keyboard.press('Escape');
    await shot(Dk, 'desktop');

    await Dk.click('.tt-savepill');
    await Dk.waitForSelector('.tt-who');
    await Dk.click('.tt-whocard >> nth=1');
    await Dk.click('.tt-layer button[type=submit]');
    chk('a guest\'s email is checked before anything is sent', /That email looks incomplete\./.test(await Dk.innerText('.tt-layer')));
    await Dk.fill('.tt-layer input[type=email]', 'parent@example.org');
    await Dk.click('.tt-layer button[type=submit]');
    await Dk.waitForSelector('.tt-points--ok', { timeout: 15000 });
    chk('saving by email says where the link went', /We sent a link to parent@example\.org\./.test(await Dk.innerText('.tt-layer')));
    chk('…and the timetable is behind a link whose token is kept only hashed',
      php(`$r = db_row("SELECT * FROM timetable_links WHERE email = 'parent@example.org'"); echo $r && strlen($r['tokenHash']) === 64 && json_decode($r['doc'], true)['settings']['title'] === 'Tobi’s week' ? 'yes' : 'no';`) === 'yes');
    await Dk.click('.tt-layer .tt-btn--primary');
    await Dk.fill('.tt-head-title', 'Tobi’s term');
    await Dk.waitForTimeout(2500);
    chk('from then on, changes save as they happen', php(`echo json_decode(db_row("SELECT doc FROM timetable_links WHERE email = 'parent@example.org'")['doc'], true)['settings']['title'];`) === 'Tobi’s term'
      && /^Saved\|/.test(await pill(Dk)));
    await Dk.context().close();

    /* ── A member's account ── */
    console.log('member (1280)');
    const M = await open({ w: 1280, h: 800, seed: v2, mid: 'NGG-TM-1' });
    await M.waitForFunction(() => /Save to my account/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    await M.click('.tt-savepill');
    chk('a signed-in member is asked to confirm, told who and what it means', /Signed in as Tobi Adeyemi · NGG-TM-1\./.test(await M.innerText('.tt-layer')) && /family app/.test(await M.innerText('.tt-layer')));
    await M.click('.tt-layer .tt-btn--primary');
    await M.waitForFunction(() => /Saved to account/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    chk('it is saved to their account', php(`echo db_row("SELECT COUNT(*) c FROM member_timetables WHERE memberId = 'NGG-TM-1'")['c'];`) === '1');
    // Somebody else (another tab, the family app) saves in between: a conflict, never an overwrite.
    php(`db_exec("UPDATE member_timetables SET updatedAt = '2030-01-01T00:00:00Z' WHERE memberId = 'NGG-TM-1'");`);
    await M.fill('.tt-head-title', 'Tobi’s week, v2');
    await M.waitForFunction(() => /Retry/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    const storedTitle = () => JSON.parse(php(`echo db_row("SELECT doc FROM member_timetables WHERE memberId = 'NGG-TM-1'")['doc'];`)).settings.title;
    chk('a save that collides is not forced through: it says so and offers Retry', /Couldn’t save\. Changes are kept here\./.test(await pill(M)) && storedTitle() === 'Tobi’s week');
    await M.click('.tt-savepill');
    await M.waitForFunction(() => /Saved to account/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    chk('…and Retry is the visitor choosing this copy', storedTitle() === 'Tobi’s week, v2');

    // The centre moves Coding: the next load says so and changes nothing until accepted.
    php(`db_exec("UPDATE timetable_slots SET startTime = '11:30', endTime = '13:00' WHERE slotId = 'SL-TM-1'");`);
    await M.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    await M.waitForSelector('.tt-note-act', { timeout: 20000 });
    chk('a centre that changed a session is reported, not applied', /Egbeda changed 1 session\./.test(await M.innerText('.tt-listpane')) && (await stored(M)).entries.find(e => e.title === 'Coding' && e.official).start === '11:00');
    await M.click('.tt-note-act');
    await M.waitForSelector('.tt-syncrow');
    await M.click('.tt-syncrow .tt-seg-opt:has-text("Accept")');
    await M.click('.tt-layer .tt-lfoot .tt-btn');
    await M.waitForTimeout(500);
    const coding = (await stored(M)).entries.find(e => e.title === 'Coding' && e.official);
    chk('accepting applies the centre\'s change', coding.start === '11:30' && coding.end === '13:00' && !(await M.$('.tt-note-act')));
    await M.context().close();

    /* A child's week holds THEIR classes. Egbeda also runs Piano; Kemi takes
       Coding (and Chess, which everyone takes). */
    php(`db_insert('timetable_slots', ['slotId'=>'SL-TM-9','centreId'=>'CEN-TM-1','course'=>'Piano','level'=>'','weekday'=>6,'startTime'=>'12:30','endTime'=>'13:30','room'=>'Music room','instructorId'=>'','note'=>'','status'=>'active','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`);
    const K = await open({ w: 1280, h: 800, mid: 'NGG-TM-2', at: '/timetable/me?centre=egbeda' });
    await K.waitForFunction(() => /your classes at Egbeda, are in/.test((document.querySelector('.tt-note') || {}).innerText || ''), null, { timeout: 30000 });
    const kOff = async () => (await stored(K)).entries.filter(e => e.official).map(e => e.title).sort().join();
    chk('a member\'s centre link puts only their own classes in, and says how many more run there', await kOff() === 'Chess,Coding'
      && /Chess and Coding, your classes at Egbeda, are in\. 1 more runs there\./.test(await K.innerText('.tt-note')) && (await K.inputValue('.tt-head-title')) === 'Kemi’s week');
    chk('…and "Your course" is not stamped on every class when every class is theirs', !/Your course/.test(await K.innerText('.tt-listpane')));
    await K.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(K);
    await K.waitForSelector('.tt-listpane', { timeout: 30000 });
    await K.waitForTimeout(2500);
    chk('a class left out at the centre is never reported as a change', !/changed \d+ session/.test(await K.innerText('.tt-listpane')));
    await K.click('.tt-steps .tt-textbtn:has-text("Choose classes")');
    await K.waitForSelector('.tt-pick-row', { timeout: 15000 });
    const rows = await K.$$eval('.tt-pick-row', r => r.map(x => x.innerText.split('\n')[0] + ':' + x.querySelector('input').checked));
    chk('"Choose classes" lists every class at the centre, theirs ticked', rows.join() === 'Chess:true,Coding:true,Piano:false');
    await K.click('.tt-pick-row:has-text("Piano")');
    await K.click('.tt-pick .tt-btn--primary');
    await K.waitForFunction(() => !document.querySelector('.tt-pick'), null, { timeout: 10000 });
    await K.waitForFunction(() => /Piano/.test(localStorage.getItem('ngg.timetable.maker.v2') || ''), null, { timeout: 5000 }).catch(() => {});
    const kAfter = await kOff();
    chk('…ticking another puts it in the week too', kAfter === 'Chess,Coding,Piano');
    if (kAfter !== 'Chess,Coding,Piano') console.log('    week holds: ' + kAfter);
    await K.context().close();

    /* ── Links that open a copy ── */
    console.log('links');
    const shared = Buffer.from(JSON.stringify({ s: FIXTURE.s, e: FIXTURE.entries.map(({ id, ...r }) => r), sharedBy: 'Mrs Okafor' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const S = await open({ w: 1100, h: 800, at: '/timetable#t=' + shared });
    chk('a shared link opens a copy and says whose', /Shared by Mrs Okafor\. This is your own copy; changes won’t reach them\./.test(await S.innerText('.tt-listpane'))
      && /Your copy · only in this browser/.test(await pill(S)));
    chk('at 1100 the print options are a popover, and now/next sits in the toolbar', !!(await S.$('.tt-optbtn')) && !!(await S.$('.tt-nowline')) && !(await S.$('.tt-rail')));
    await S.context().close();

    const Ce = await open({ w: 834, h: 1112, at: '/timetable?centre=egbeda' });
    /* A timetable is a person's: a centre link asks which classes are yours,
       with nothing ticked, and adds only those. */
    await Ce.waitForSelector('.tt-pick-row', { timeout: 15000 });
    chk('a centre link asks which of its classes are yours, with nothing ticked and nothing added yet',
      (await Ce.$$eval('.tt-pick-row input', r => r.filter(x => x.checked).length)) === 0 && await Ce.$eval('.tt-pick .tt-btn--primary', b => b.disabled)
      && !((await stored(Ce)) || { entries: [] }).entries.some(e => e.official));
    await Ce.click('.tt-pick-row:has-text("Coding")');
    await Ce.click('.tt-pick .tt-btn--primary');
    await Ce.waitForFunction(() => /Coding/.test(localStorage.getItem('ngg.timetable.maker.v2') || ''), null, { timeout: 8000 }).catch(() => {});
    const ceDoc = await stored(Ce);
    chk('…only the ticked class goes in, and the week keeps its own title', ceDoc.entries.filter(e => e.official).map(e => e.title).join() === 'Coding'
      && (await Ce.inputValue('.tt-head-title')) !== 'Egbeda timetable');
    chk('…without anything about its instructors', !/VOL-SECRET|instructor/i.test(await Ce.evaluate(() => localStorage.getItem('ngg.timetable.maker.v2') || '')));
    chk('at 834 the tablet shows one pane, switched by tabs, with the save label', (await Ce.$$('.tt-tab')).length === 2 && !!(await Ce.$('.tt-listpane')) && !(await Ce.$('.tt-previewpane'))
      && await Ce.$eval('.tt-savepill-l', el => getComputedStyle(el).display !== 'none'));
    await Ce.click('.tt-tab >> nth=1');
    chk('…the Preview tab swaps in the poster', !!(await Ce.$('.tt-previewpane .tt-stage')) && !(await Ce.$('.tt-listpane')));
    await Ce.context().close();

    const v1 = { k: 'ngg.timetable.maker.v1', v: JSON.stringify({ settings: { title: 'Old week', template: 'midnight', clock: '12' }, entries: [{ id: 'a', title: 'Maths', days: [1], start: '08:00', end: '09:00', place: '', color: 2 }] }) };
    const O = await open({ w: 1280, h: 800, seed: v1 });
    await O.waitForTimeout(500);
    const mig = await stored(O);
    chk('a v1 timetable in this browser is read and kept as v2', !!mig && mig.s.title === 'Old week' && mig.s.theme === 'navy' && mig.s.clock === '12' && mig.entries[0].kind === 'class');
    await O.context().close();

    chk('no page errors anywhere', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (timetable maker)`);
    process.exit(failed ? 1 : 0);
  }
})();
