#!/usr/bin/env node
/* ============================================================================
   The Timetable Maker (/timetable, v5), end to end, against the real PHP
   backend: the tree chosen by the page's own width, quick add and its Undo,
   the overlap fix, a skipped day, Back closing layers in order, every
   download made for real (calendar file, share image, wallpaper, print-PDF,
   link), saving by email and to a member account, a save conflict and its
   Retry, a centre that moved a session, and the links that open a copy.

   The model's arithmetic is held by timetable-core.test.js; this holds that
   the page does what the model says.

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
const NOW = '2026-10-05T10:40:00';   // a Monday, during the morning break
const SHOTS = process.env.TT_SHOTS || '';

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
function pngSize(buf) { return buf.slice(1, 4).toString() === 'PNG' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null; }

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
      + `db_insert('centres', ['centreId'=>'CEN-TM-1','name'=>'Egbeda','code'=>'EG','status'=>'active','meetDays'=>'Saturdays','meetTime'=>'10am - 2pm','slug'=>'egbeda','createdAt'=>${now}]);`
      + `foreach ([['Chess','10:00','11:00','Main hall'],['Coding','11:00','12:30','ICT room'],['Public speaking','12:30','13:30','Main hall']] as $i => $s) db_insert('timetable_slots', ['slotId'=>'SL-TM-'.$i,'centreId'=>'CEN-TM-1','course'=>$s[0],'level'=>'','weekday'=>6,'startTime'=>$s[1],'endTime'=>$s[2],'room'=>$s[3],'instructorId'=>'VOL-X','note'=>'','status'=>'active','createdAt'=>${now},'updatedAt'=>${now}]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else {
      const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
      if (d) launch.executablePath = '/opt/pw-browsers/' + d + '/chrome-linux/chrome';
    }
    browser = await chromium.launch(launch);
    const errs = [];

    /** A browsing context: a viewport, the clock pinned, a seeded browser and (optionally) a member's session. */
    const open = async ({ w, h, seed, mid, path: p, touch }) => {
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
      await page.goto(BASE + (p || '/timetable'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForSelector('.tt-app', { timeout: 30000 });
      await page.waitForTimeout(400);
      return { ctx, page };
    };
    const v2 = { k: 'ngg.timetable.maker.v2', v: JSON.stringify(FIXTURE) };
    const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ngg.timetable.maker.v2') || 'null'));
    const toast = async page => (await page.waitForSelector('.tt-toast', { timeout: 6000 }).then(el => el.innerText()).catch(() => ''));
    const layers = page => page.$$eval('.tt-layer', l => l.length);
    const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

    /* ── Phone ─────────────────────────────────────────────────────────── */
    console.log('phone (390)');
    const P = (await open({ w: 390, h: 844, seed: v2, touch: true })).page;
    chk('the phone tree, not a reflowed desktop: an app bar and a composer, no header or panes',
      !!(await P.$('.tt-pbar')) && !!(await P.$('.tt-composer')) && !(await P.$('.tt-head')) && !(await P.$('.tt-listpane')));
    chk('…and nothing scrolls sideways', await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    chk('the week strip has one button per day in use, today named and counted',
      (await P.$$('.tt-stripday')).length === 6 && (await P.getAttribute('.tt-stripday >> nth=0', 'aria-label')) === 'Monday 5, today, 5 on');
    chk('the day opens on Today, with its span', (await P.innerText('.tt-dayhead h1')) === 'Today' && /Monday 5 · 5 on, 08:00–15:00/.test(await P.innerText('.tt-dayhead-text')));
    chk('the week label says how many changes this week has', /This week · 2 changes/.test(await P.innerText('.tt-weeklabel')));
    chk('the break is on now, and says so', /Break\s*Now/.test(await P.innerText('.tt-prow-wrap.is-now')));
    chk('a free gap of 30 minutes or more is shown between rows', /Free · 30 min/.test(await P.innerText('.tt-card')));

    await P.click('.tt-composer-input');
    await P.keyboard.type('Football Tue Thu 4–5:30pm at the field');
    chk('quick add shows what it understood before anything is added',
      /Football/.test(await P.innerText('.tt-qa-preview')) && /Tue Thu · 16:00–17:30 · The field/.test(await P.innerText('.tt-qa-preview')));
    chk('…and the send button is live', await P.$eval('.tt-send', b => b.classList.contains('is-ready')));
    await P.keyboard.press('Enter');
    chk('adding says what was added, with Undo', /Added Football · Tue Thu 16:00\s*Undo/.test(await toast(P)));
    await P.waitForTimeout(450);
    const fb = (await stored(P)).entries.find(e => e.title === 'Football');
    chk('…and it is kept in this browser, typed as an activity', fb && fb.days.join() === '2,4' && fb.start === '16:00' && fb.end === '17:30' && fb.kind === 'activity' && fb.place === 'The field');
    await P.click('.tt-toast-undo');
    await P.waitForTimeout(450);
    chk('Undo takes it away again', !(await stored(P)).entries.some(e => e.title === 'Football'));
    await P.fill('.tt-composer-input', '8-9');
    await P.keyboard.press('Enter');
    chk('a line with no name is refused with an example', /Add a name, like “Maths Mon 8–9”/.test(await toast(P)));
    await P.fill('.tt-composer-input', '');

    await P.click('.tt-prow >> nth=0');
    await P.waitForSelector('.tt-form');
    chk('a row opens the class form on that day, offering to skip just that date', /Skip just Mon 5 Oct/.test(await P.innerText('.tt-skipbtn')));
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

    // A horizontal swipe in Day view moves a day; one that starts at the screen edge is the system's.
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
    chk('the next week says how to come back', /Next week · tap for this week/.test(await P.innerText('.tt-weeklabel')));
    await P.click('.tt-weeklabel');

    await P.context().setOffline(true);
    await P.waitForTimeout(300);
    chk('offline is said, and nothing is lost', /You’re offline\. Changes are saved on this device\./.test(await P.innerText('.tt-app')));
    await P.context().setOffline(false);
    await P.click('[aria-label="Download or share"]');
    await P.waitForSelector('.tt-fmtrow');
    chk('the phone download sheet lists the five formats first', (await P.$$('.tt-fmtrow')).length === 5 && /Best for printing/.test(await P.innerText('.tt-dl')));
    await P.click('.tt-fmtrow >> nth=0');
    chk('…and a format opens its detail with a way back', !!(await P.$('[aria-label="All formats"]')) && /Download PDF/.test(await P.innerText('.tt-lfoot--dl')));
    await P.context().close();

    /* ── Desktop, three panes ──────────────────────────────────────────── */
    console.log('desktop (1440)');
    const Dk = (await open({ w: 1440, h: 900, seed: v2 })).page;
    chk('three panes at 1440: the list, the preview and the right column', !!(await Dk.$('.tt-head')) && !!(await Dk.$('.tt-listpane')) && !!(await Dk.$('.tt-previewpane')) && !!(await Dk.$('.tt-rail')));
    chk('…the print options live in the right column, so there is no Options button', !(await Dk.$('.tt-optbtn')) && /Print options/.test(await Dk.innerText('.tt-rail')));
    chk('…and now/next is said once, in the right column, not in the toolbar too', !(await Dk.$('.tt-nowline')) && /Now · until 11:00/.test(await Dk.innerText('.tt-nowcard')));
    chk('the preview is the poster at its print size, scaled', await Dk.$eval('.tt-stage--preview .tt-pos', el => el.style.width === '1600px'));
    chk('each pane is its own scroll container', await Dk.evaluate(() => ['.tt-listpane', '.tt-previewpane', '.tt-rail'].every(s => getComputedStyle(document.querySelector(s)).overflowY === 'auto') && getComputedStyle(document.querySelector('.tt-app')).overflow === 'hidden'));
    chk('the overlap offers a one-tap fix', /Overlaps Coding/.test(await Dk.innerText('.tt-listpane')) && /Move to 12:30/.test(await Dk.innerText('.tt-fixbtn')));
    await Dk.click('.tt-fixbtn');
    chk('…which moves it and says where', /Moved Piano to 12:30\s*Undo/.test(await toast(Dk)));
    await Dk.waitForTimeout(450);
    chk('…for real', (await stored(Dk)).entries.find(e => e.id === 'p1').start === '12:30');
    chk('One-offs and days off are listed, the skip restorable', /One-offs and days off/.test(await Dk.innerText('.tt-listpane')) && /Off Wed 7 Oct · click to restore/.test(await Dk.innerText('.tt-listpane')));

    const addBtn = '.tt-btnrow .tt-btn >> nth=0';
    await Dk.click(addBtn);
    await Dk.waitForSelector('.tt-form');
    chk('the class form opens as the left drawer, its name focused', await Dk.evaluate(() => document.activeElement && document.activeElement.id === 'tt-form-name'));
    await Dk.click('.tt-form button[type=submit]');
    chk('an empty name is refused in words', /Give it a name\./.test(await Dk.innerText('.tt-form [role=alert]')));
    await Dk.keyboard.press('Escape');
    await Dk.waitForTimeout(300);
    chk('Escape closes it and focus goes back to the button that opened it', (await layers(Dk)) === 0 && await Dk.evaluate(() => /Add with all options/.test(document.activeElement && document.activeElement.innerText)));
    await Dk.keyboard.press('Tab');
    await Dk.evaluate(() => document.activeElement.blur());
    await Dk.keyboard.press('f');
    await Dk.waitForSelector('.tt-layer--fs');
    await Dk.keyboard.press('Shift+?');
    await Dk.waitForSelector('.tt-layer--keys');
    chk('F opens full screen, and ? the shortcuts over it', (await layers(Dk)) === 2 && /Add in plain words\s*\//.test(await Dk.innerText('.tt-layer--keys')));
    await Dk.evaluate(() => history.back());
    await Dk.waitForTimeout(400);
    chk('Back closes the shortcuts first…', !(await Dk.$('.tt-layer--keys')) && !!(await Dk.$('.tt-layer--fs')));
    await Dk.evaluate(() => history.back());
    await Dk.waitForTimeout(400);
    chk('…then full screen', (await layers(Dk)) === 0);

    await Dk.keyboard.press('d');
    await Dk.waitForSelector('.tt-fmtchips');
    await Dk.click('.tt-fmtchip:has-text("Calendar")');
    let [dl] = await Promise.all([Dk.waitForEvent('download'), Dk.click('.tt-lfoot--dl .tt-btn')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    chk('the calendar file is a real file, named after the timetable', dl.suggestedFilename() === 'tobis-week.ics' && /^BEGIN:VCALENDAR/.test(ics));
    chk('…weekly events in Lagos time, until the end of term', /X-WR-TIMEZONE:Africa\/Lagos/.test(ics) && /RRULE:FREQ=WEEKLY;UNTIL=\d{8}T225959Z/.test(ics));
    chk('…the skipped Wednesday excluded', /EXDATE;TZID=Africa\/Lagos:20261007T080000/.test(ics));
    chk('…the one-off a single event with no rule', /SUMMARY:Maths test/.test(ics) && /DTSTART;TZID=Africa\/Lagos:20261008T140000\r\nDTEND;TZID=Africa\/Lagos:20261008T150000\r\nSUMMARY:Maths test/.test(ics));
    chk('…and a reminder ten minutes before', /TRIGGER:-PT10M/.test(ics));

    await Dk.keyboard.press('d');
    await Dk.waitForSelector('.tt-fmtchips');
    await Dk.click('.tt-fmtchip:has-text("Image")');
    [dl] = await Promise.all([Dk.waitForEvent('download', { timeout: 60000 }), Dk.click('.tt-lfoot--dl .tt-btn')]);
    let sz = pngSize(fs.readFileSync(await dl.path()));
    chk('the share image is a 1080×1350 card drawn at 2×', dl.suggestedFilename() === 'tobis-week.png' && sz && sz[0] === 2160 && sz[1] === 2700);
    await Dk.keyboard.press('d');
    await Dk.waitForSelector('.tt-fmtchips');
    await Dk.click('.tt-fmtchip:has-text("Wallpaper")');
    [dl] = await Promise.all([Dk.waitForEvent('download', { timeout: 60000 }), Dk.click('.tt-lfoot--dl .tt-btn')]);
    sz = pngSize(fs.readFileSync(await dl.path()));
    chk('the wallpaper is 1080×2340', dl.suggestedFilename() === 'tobis-week-wallpaper.png' && sz && sz[0] === 1080 && sz[1] === 2340);

    await Dk.keyboard.press('d');
    await Dk.waitForSelector('.tt-fmtchips');
    chk('the PDF says its text stays sharp', /Text stays sharp and searchable\./.test(await Dk.innerText('.tt-dl')));
    await Dk.click('.tt-lfoot--dl .tt-btn');
    await Dk.waitForSelector('.tt-print-frame', { state: 'attached', timeout: 30000 });
    await Dk.waitForTimeout(600);
    const pdf = await Dk.evaluate(() => { const d = document.querySelector('.tt-print-frame').contentDocument; return { css: d.querySelector('style').textContent, text: d.body.innerText, title: d.title }; });
    chk('the PDF is printed from the full-size poster onto an A4 landscape page', /@page\{size:297mm 210mm;margin:0\}/.test(pdf.css) && pdf.title === 'tobis-week');
    chk('…as real, selectable text', /Tobi’s week/.test(pdf.text) && /Mathematics/.test(pdf.text));

    await Dk.keyboard.press('d');
    await Dk.waitForSelector('.tt-fmtchips');
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
    chk('a guest email is checked before anything is sent', /That email looks incomplete\./.test(await Dk.innerText('.tt-layer')));
    await Dk.fill('.tt-layer input[type=email]', 'parent@example.org');
    await Dk.click('.tt-layer button[type=submit]');
    await Dk.waitForSelector('.tt-points--ok', { timeout: 15000 });
    chk('saving by email confirms where the link went', /We sent a link to parent@example\.org\./.test(await Dk.innerText('.tt-layer')));
    chk('…and the timetable is behind a link, its token kept only hashed',
      php(`$r = db_row("SELECT * FROM timetable_links WHERE email = 'parent@example.org'"); echo $r && strlen($r['tokenHash']) === 64 && json_decode($r['doc'], true)['settings']['title'] === 'Tobi’s week' ? 'yes' : 'no';`) === 'yes');
    await Dk.click('.tt-layer .tt-btn--primary');
    await Dk.fill('.tt-head-title', 'Tobi’s term');
    await Dk.waitForTimeout(2500);
    chk('after that, changes save as they happen', php(`echo json_decode(db_row("SELECT doc FROM timetable_links WHERE email = 'parent@example.org'")['doc'], true)['settings']['title'];`) === 'Tobi’s term'
      && /Saved/.test(await Dk.innerText('.tt-savepill')));
    await Dk.context().close();

    /* ── A member's account ────────────────────────────────────────────── */
    console.log('member (1280)');
    let M = (await open({ w: 1280, h: 800, seed: v2, mid: 'NGG-TM-1' })).page;
    await M.waitForFunction(() => /Save to my account/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    await M.click('.tt-savepill');
    chk('a signed-in member is asked to confirm, with who and why', /Signed in as Tobi Adeyemi · NGG-TM-1\./.test(await M.innerText('.tt-layer')) && /family app/.test(await M.innerText('.tt-layer')));
    await M.click('.tt-layer .tt-btn--primary');
    await M.waitForFunction(() => /Saved to account/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    chk('it is saved to their account', php(`echo db_row("SELECT COUNT(*) c FROM member_timetables WHERE memberId = 'NGG-TM-1'")['c'];`) === '1');
    // Somebody else (another tab, the family app) saves in between: a conflict, never an overwrite.
    php(`db_exec("UPDATE member_timetables SET updatedAt = '2030-01-01T00:00:00Z' WHERE memberId = 'NGG-TM-1'");`);
    await M.fill('.tt-head-title', 'Tobi’s week, v2');
    await M.waitForFunction(() => /Retry/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    chk('a save that collides is not forced through; it says so and offers Retry', /Couldn’t save\. Changes are kept here\./.test(await M.getAttribute('.tt-savepill', 'title'))
      && JSON.parse(php(`echo db_row("SELECT doc FROM member_timetables WHERE memberId = 'NGG-TM-1'")['doc'];`)).settings.title === 'Tobi’s week');
    await M.click('.tt-savepill');
    await M.waitForFunction(() => /Saved to account/.test(document.querySelector('.tt-savepill').innerText), null, { timeout: 15000 });
    chk('…and Retry is the visitor choosing this copy', JSON.parse(php(`echo db_row("SELECT doc FROM member_timetables WHERE memberId = 'NGG-TM-1'")['doc'];`)).settings.title === 'Tobi’s week, v2');

    // The centre moves Coding: the next load reports it and changes nothing until it is accepted.
    php(`db_exec("UPDATE timetable_slots SET startTime = '11:30', endTime = '13:00' WHERE slotId = 'SL-TM-1'");`);
    await M.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    await M.waitForSelector('.tt-note:has-text("changed")', { timeout: 20000 });
    chk('a centre that changed a session is reported, not applied', /Egbeda changed 2 sessions\./.test(await M.innerText('.tt-listpane .tt-note:has-text("changed")'))
      && (await stored(M)).entries.find(e => e.title === 'Coding' && e.official).start === '11:00');
    await M.click('.tt-note button:has-text("Review")');
    await M.waitForSelector('.tt-syncrow');
    await M.click('.tt-syncrow:has-text("Coding") .tt-seg-opt:has-text("Accept")');
    await M.click('.tt-layer .tt-lfoot .tt-btn');
    await M.waitForTimeout(500);
    const coding = (await stored(M)).entries.find(e => e.title === 'Coding' && e.official);
    chk('accepting one change applies that one, and only that one', coding.start === '11:30' && coding.end === '13:00' && !(await stored(M)).entries.some(e => e.title === 'Public speaking'));
    await M.context().close();

    /* ── Links that open a copy ────────────────────────────────────────── */
    console.log('links');
    const shared = Buffer.from(JSON.stringify({ s: FIXTURE.s, e: FIXTURE.entries.map(({ id, ...r }) => r), sharedBy: 'Mrs Okafor' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const S = (await open({ w: 1100, h: 800, path: '/timetable#t=' + shared })).page;
    chk('a shared link opens a copy, and says whose', /Shared by Mrs Okafor\. This is your own copy; changes won’t reach them\./.test(await S.innerText('.tt-listpane'))
      && /Your copy · only in this browser/.test(await S.getAttribute('.tt-savepill', 'title')));
    chk('at 1100 the print options are a popover and now/next is in the toolbar', !!(await S.$('.tt-optbtn')) && !!(await S.$('.tt-nowline')) && !(await S.$('.tt-rail')));
    await S.context().close();

    const C = (await open({ w: 834, h: 1112, path: '/timetable?centre=egbeda' })).page;
    await C.waitForSelector('.tt-note', { timeout: 15000 });
    chk('a centre link brings its sessions in and says so', /Egbeda’s official sessions are in\. Add your school classes around them\./.test(await C.innerText('.tt-note'))
      && (await C.inputValue('.tt-head-title')) === 'Egbeda timetable');
    chk('…without the instructors', !/VOL-X/.test(JSON.stringify(await stored(C) || {})) && !(await C.evaluate(() => /instructor/i.test(localStorage.getItem('ngg.timetable.maker.v2') || ''))));
    chk('at 834 the tablet shows one pane, switched by tabs', (await C.$$('.tt-tab')).length === 2 && !!(await C.$('.tt-listpane')) && !(await C.$('.tt-previewpane')));
    await C.click('.tt-tab >> nth=1');
    chk('…the Preview tab swaps to the poster', !!(await C.$('.tt-previewpane .tt-stage')) && !(await C.$('.tt-listpane')));
    await C.context().close();

    const v1 = { k: 'ngg.timetable.maker.v1', v: JSON.stringify({ settings: { title: 'Old week', template: 'midnight', clock: '12' }, entries: [{ id: 'a', title: 'Maths', days: [1], start: '08:00', end: '09:00', place: '', color: 2 }] }) };
    const O = (await open({ w: 1280, h: 800, seed: v1 })).page;
    await O.waitForTimeout(500);
    const mig = await stored(O);
    chk('a v1 timetable in this browser is read and kept as v2', mig && mig.s.title === 'Old week' && mig.s.theme === 'navy' && mig.s.clock === '12' && mig.entries[0].kind === 'class');
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
