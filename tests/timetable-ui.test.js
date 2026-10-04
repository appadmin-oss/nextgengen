#!/usr/bin/env node
/* ============================================================================
   The timetable, end to end: the Control Room adds slots and is refused a
   clash with the reason on screen; a member sees their centre's week with
   their course marked; the public page shows it without instructors' names,
   accessibly, at phone width.

   Run:  node tests/timetable-ui.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.TIMETABLE_PORT || '8285';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-timetable-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'timetable');

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
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b).toString() }));
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

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  timetable UI: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'timetable_test_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-TU-ADM','fullName'=>'Timetable Admin','email'=>'tu-adm@example.org','type'=>'NGG','status'=>'active','role'=>'club_admin','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-TU-M','fullName'=>'Ada Learner','email'=>'tu-m@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Piano','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('centres', ['centreId'=>'CEN-TU-1','name'=>'Egbeda','code'=>'EG','status'=>'active','meetDays'=>'Saturdays','meetTime'=>'9am - 2pm','slug'=>'egbeda','createdAt'=>${now}]);`
      + `db_insert('volunteers', ['volunteerId'=>'VOL-TU-1','fullName'=>'Ife Instructor','email'=>'tu-v@example.org','role'=>'instructor','status'=>'active','createdAt'=>${now},'updatedAt'=>${now}]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];
    const ctxFor = async (mid, admin, viewport) => {
      const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${mid}'"), ${admin ? 'true' : 'false'});`, ['session']);
      const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                            { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      return ctx;
    };

    /* ── The Control Room ── */
    const ap = await (await ctxFor('NGG-TU-ADM', true)).newPage();
    ap.on('pageerror', e => errs.push('admin: ' + String(e).slice(0, 200)));
    await ap.goto(BASE + '/nextadmin?s=timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForSelector('button:has-text("Add a slot")', { timeout: 40000 });
    await ap.selectOption('.admin-filters select', 'CEN-TU-1');
    const addSlot = async (course, start, end, room, instructor) => {
      await ap.click('button:has-text("Add a slot")');
      await ap.waitForSelector('.admin-drawer-panel');
      await ap.selectOption('.admin-drawer-panel select >> nth=1', '6');
      await ap.fill('.admin-drawer-panel input[type=time] >> nth=0', start);
      await ap.fill('.admin-drawer-panel input[type=time] >> nth=1', end);
      await ap.selectOption('.admin-drawer-panel select >> nth=2', course);
      if (room) await ap.fill('.admin-drawer-panel input[placeholder="e.g. Studio 2"]', room);
      if (instructor) await ap.selectOption('.admin-drawer-panel select >> nth=3', instructor);
      await ap.click('.admin-drawer-panel button[type=submit]');
    };
    await addSlot('Piano', '10:00', '11:30', '', 'VOL-TU-1');
    await ap.waitForSelector('.tt-table td:has-text("Piano")', { timeout: 15000 });
    chk('the Control Room adds a slot to the centre\'s timetable', php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '1');
    await addSlot('Guitar', '11:00', '12:00', '', '');
    await ap.waitForSelector('.admin-drawer-panel .admin-form-err', { timeout: 15000 });
    const why = await ap.$eval('.admin-drawer-panel .admin-form-err', el => el.innerText);
    chk('a clash is refused, and the drawer says what it clashes with', /clashes/i.test(why) && /main room already has Piano/i.test(why)
      && php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '1');
    await ap.fill('.admin-drawer-panel input[type=time] >> nth=0', '11:30');
    await ap.fill('.admin-drawer-panel input[type=time] >> nth=1', '12:30');
    await ap.click('.admin-drawer-panel button[type=submit]');
    await ap.waitForSelector('.tt-table td:has-text("Guitar")', { timeout: 15000 });
    chk('moving it to the next hour saves', php(`echo db_row("SELECT COUNT(*) c FROM timetable_slots WHERE status = 'active'")['c'];`) === '2');
    chk('the timetable is a real table: a caption and column headers', await ap.$eval('.tt-table', t => !!t.querySelector('caption') && t.querySelectorAll('th[scope=col]').length >= 4));
    await ap.screenshot({ path: path.join(SHOTS, 'admin.png'), fullPage: true });

    /* ── The member ── */
    const mp = await (await ctxFor('NGG-TU-M', false, { width: 390, height: 844 })).newPage();
    mp.on('pageerror', e => errs.push('member: ' + String(e).slice(0, 200)));
    await mp.goto(BASE + '/dashboard/timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForSelector('.tt-table', { timeout: 40000 });
    const mine = await mp.$eval('.tt-table tr.is-mine', el => el.innerText);
    chk('the member\'s dashboard has a Timetable tab with their centre\'s week', (await mp.$$('.tt-table tbody tr')).length === 2);
    chk('…their own course marked in words, not only colour', /Piano/.test(mine) && /Your course/.test(mine));
    chk('…readable on a phone without sideways scrolling', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    chk('…and "Design my own timetable" opens the maker on their centre', await mp.$eval('a:has-text("Design my own timetable")', a => /\/timetable\?centre=egbeda$/.test(a.getAttribute('href'))).catch(() => false));
    await mp.screenshot({ path: path.join(SHOTS, 'member-phone.png'), fullPage: true });

    /* ── The public: the timetable maker ── */
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const pp = await pctx.newPage();
    pp.on('pageerror', e => errs.push('public: ' + String(e).slice(0, 200)));
    await pp.goto(BASE + '/timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pp);
    await pp.waitForSelector('.tmp .tmb', { timeout: 40000 });
    chk('/timetable is the maker: a designed poster with a sample week, and the classes listed in words', (await pp.$$('.tm-item')).length >= 5 && (await pp.$$('.tmp .tmb')).length >= 10);
    chk('…the poster says what it shows, and points at the list', /class/.test(await pp.$eval('.tmp', el => el.getAttribute('aria-label') || '')) && (await pp.$eval('.tmp', el => el.getAttribute('role'))) === 'img');
    chk('…fits a phone with no sideways scroll', await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await pp.screenshot({ path: path.join(SHOTS, 'maker-phone.png'), fullPage: true });

    // A centre's official week is a place to start.
    await pp.click('#tm-tab-start');
    await pp.waitForSelector('.tt-pick select', { timeout: 20000 });
    await pp.selectOption('.tt-pick select', 'egbeda');
    await pp.waitForSelector('.tt-table', { timeout: 15000 });
    chk('choosing a centre shows its official week', (await pp.$$('.tt-table tbody tr')).length === 2);
    chk('…puts the centre in the address, so the link can be shared', /\?centre=egbeda/.test(pp.url()));
    chk('…and never names the instructor', !/Ife Instructor/.test(await pp.$eval('body', el => el.innerText)));
    chk('…labelled controls: the centre picker has a visible label', await pp.$eval('.tt-pick', el => /Centre/.test(el.innerText) && !!el.querySelector('select')));
    await pp.click('button:has-text("Start from these 2 classes")');
    await pp.waitForFunction(() => document.querySelectorAll('.tm-item').length === 2, null, { timeout: 10000 });
    chk('"Start from these classes" brings the centre\'s classes into the maker', (await pp.$$('.tmp .tmb')).length === 2 && /Piano/.test(await pp.$eval('.tm-list', el => el.innerText)));

    // Adding a class is a form, with nothing to drag; an overlap is said in words.
    await pp.click('.tm-add');
    chk('the form takes focus on its first field', await pp.evaluate(() => document.activeElement && document.activeElement.closest('.tm-form') !== null));
    await pp.keyboard.press('Escape');
    chk('Escape closes the form and returns focus to "Add a class"', await pp.waitForFunction(() => !document.querySelector('.tm-form') && document.activeElement && document.activeElement.classList.contains('tm-add'), null, { timeout: 3000 }).then(() => true, () => false));
    await pp.click('.tm-add');
    await pp.fill('.tm-form input >> nth=0', 'Homework');
    await pp.click('.tm-form .tm-day[aria-label="Saturday"]');
    await pp.click('.tm-form .tm-day[aria-label="Monday"]');   // Monday was on by default; this turns it off
    await pp.fill('.tm-form input[type=time] >> nth=0', '10:30');
    await pp.fill('.tm-form input[type=time] >> nth=1', '11:00');
    await pp.click('.tm-form button[type=submit]');
    await pp.waitForFunction(() => document.querySelectorAll('.tm-item').length === 3, null, { timeout: 10000 });
    chk('a class added through the form appears on the poster and in the list', (await pp.$$('.tmp .tmb')).length === 3);
    chk('…an overlap is named in words', /Overlaps Piano/.test(await pp.$eval('.tm-list', el => el.innerText)));
    chk('…and announced', /Added Homework, Saturday/.test(await pp.$eval('.tm-say', el => el.innerText)));
    chk('the class list buttons say which class they act on', !!(await pp.$('button[aria-label="Remove Homework"]')));

    // Templates are radio buttons; the poster changes with them.
    await pp.click('#tm-tab-design');
    await pp.click('.tm-tpl:has-text("Midnight")');
    chk('choosing a template restyles the poster', !!(await pp.$('.tmp.tmp--midnight')));

    // Downloads: a picture, a PDF and a calendar file — drawn in the browser.
    const dl = async (label) => { const [d] = await Promise.all([pp.waitForEvent('download', { timeout: 60000 }), pp.click('.tm-actions button:has-text("' + label + '")')]); return d; };
    const png = await dl('Picture (PNG)');
    const pngPath = path.join(TMP, 'tt.png'); await png.saveAs(pngPath);
    const pngBuf = fs.readFileSync(pngPath);
    chk('the picture downloads as a real PNG at twice the print size', /\.png$/.test(png.suggestedFilename()) && pngBuf.slice(1, 4).toString() === 'PNG' && pngBuf.readUInt32BE(16) === 3200);
    const pdf = await dl('Download PDF');
    const pdfPath = path.join(TMP, 'tt.pdf'); await pdf.saveAs(pdfPath);
    chk('the PDF downloads, one page', /\.pdf$/.test(pdf.suggestedFilename()) && fs.readFileSync(pdfPath).slice(0, 5).toString() === '%PDF-');
    const ics = await dl('Add to calendar (.ics)');
    const icsPath = path.join(TMP, 'tt.ics'); await ics.saveAs(icsPath);
    const icsTxt = fs.readFileSync(icsPath, 'utf8');
    chk('the calendar file repeats each class weekly, in Lagos time', /\.ics$/.test(ics.suggestedFilename()) && (icsTxt.match(/BEGIN:VEVENT/g) || []).length === 3
      && /RRULE:FREQ=WEEKLY/.test(icsTxt) && /DTSTART;TZID=Africa\/Lagos:\d{8}T103000/.test(icsTxt) && /SUMMARY:Homework/.test(icsTxt));

    chk('starting from a centre fits the poster to its days and hours', (await pp.$$('.tmp-dayhead')).length === 1 && /10:00 – 13:00/.test(await pp.$eval('.tmp-range', el => el.innerText)));
    // Saved in this browser: a reload keeps it.
    await pp.goto(BASE + '/timetable', { waitUntil: 'domcontentloaded' });
    await pp.waitForSelector('.tmp .tmb', { timeout: 40000 });
    chk('it is still there after a reload', (await pp.$$('.tm-item')).length === 3 && !!(await pp.$('.tmp.tmp--midnight')));
    await pp.goto(BASE + '/timetable?centre=egbeda', { waitUntil: 'domcontentloaded' });
    await pp.waitForSelector('.tt-table', { timeout: 40000 });
    chk('a shared centre link opens straight on that centre\'s week', (await pp.$$('.tt-table tbody tr')).length === 2);

    // Desktop: two columns, poster beside the editor.
    const dp = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    dp.on('pageerror', e => errs.push('public desktop: ' + String(e).slice(0, 200)));
    await dp.goto(BASE + '/timetable', { waitUntil: 'domcontentloaded' });
    await waitForBoot(dp);
    await dp.waitForSelector('.tmp .tmb', { timeout: 40000 });
    const boxes = await dp.evaluate(() => [document.querySelector('.tm-panel').getBoundingClientRect(), document.querySelector('.tm-preview').getBoundingClientRect()].map(r => ({ x: r.x, y: r.y })));
    chk('on a wide screen the editor and the poster sit side by side', boxes[1].x > boxes[0].x + 200 && Math.abs(boxes[1].y - boxes[0].y) < 120);
    await dp.screenshot({ path: path.join(SHOTS, 'maker-desktop.png') });
    // Every template with the sample week, as it downloads: one poster, print size.
    await dp.click('#tm-tab-design');
    const TPLS = ['studio', 'midnight', 'sunrise', 'blueprint', 'bold', 'kente', 'pastel', 'chalkboard'];
    for (const t of TPLS) {
      await dp.click('.tm-tpl >> nth=' + TPLS.indexOf(t));
      await dp.waitForSelector('.tmp.tmp--' + t);
      await (await dp.$('.tm-stage')).screenshot({ path: path.join(SHOTS, 'template-' + t + '.png') });
    }
    const contrast = await dp.evaluate(() => {
      const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      return Array.from(document.querySelectorAll('.tmp .tmb')).map(b => ratio(getComputedStyle(b).color, getComputedStyle(b).backgroundColor));
    });
    chk('every class block reads at 4.5:1 or better on its own colour', contrast.length > 5 && Math.min(...contrast) >= 4.5);

    // A title colour that cannot be read is said so, with a one-tap fix.
    await dp.click('.tm-tpl:has-text("Studio")');
    await dp.click('.tm-swatch[title="Gold"]');
    await dp.waitForSelector('.tm-warn', { timeout: 5000 });
    chk('a pale title colour on white is flagged with its ratio', /hard to read on Studio/.test(await dp.$eval('.tm-warn', el => el.innerText)));
    await dp.click('.tm-warn .tm-linkbtn');
    await dp.waitForFunction(() => !document.querySelector('.tm-warn'), null, { timeout: 5000 });
    chk('…and "use the nearest shade" fixes it, on the poster too', /Reads clearly/.test(await dp.$eval('#tm-pane-design', el => el.innerText))
      && await dp.$eval('.tmp-title', el => getComputedStyle(el).color !== 'rgb(245, 176, 38)'));
    await dp.click('.tm-check:has-text("Larger text") input');
    chk('larger text is one tick away', !!(await dp.$('.tmp.is-large')));

    // Undo and redo, by button and by keyboard.
    await dp.click('#tm-tab-classes');
    const n0 = (await dp.$$('.tm-item')).length;
    await dp.click('button[aria-label^="Remove "] >> nth=0');
    await dp.waitForFunction((n) => document.querySelectorAll('.tm-item').length === n - 1, n0);
    await dp.click('.tm-history button:has-text("Undo")');
    await dp.waitForFunction((n) => document.querySelectorAll('.tm-item').length === n, n0, { timeout: 5000 }).then(() => chk('Undo brings a removed class back', true), () => chk('Undo brings a removed class back', false));
    await dp.keyboard.press('Control+Shift+Z');
    await dp.waitForFunction((n) => document.querySelectorAll('.tm-item').length === n - 1, n0, { timeout: 5000 }).then(() => chk('…and Ctrl+Shift+Z redoes it', true), () => chk('…and Ctrl+Shift+Z redoes it', false));
    await dp.keyboard.press('Control+Z');
    await dp.waitForFunction((n) => document.querySelectorAll('.tm-item').length === n, n0, { timeout: 5000 });

    // Quick add fills the form; an icon is a named choice.
    await dp.click('.tm-quick .tm-chip >> nth=0');
    const quickName = await dp.$eval('.tm-form input', el => el.value);
    chk('a quick-add chip opens the form with the name filled in', quickName.length > 1);
    await dp.click('.tm-icon[title="Music"]');
    await dp.click('.tm-form .tm-day[aria-label="Wednesday"]');
    await dp.fill('.tm-form input[type=time] >> nth=0', '15:30');
    await dp.fill('.tm-form input[type=time] >> nth=1', '16:00');
    await dp.click('.tm-form button[type=submit]');
    await dp.waitForFunction((n) => document.querySelectorAll('.tm-item').length === n + 1, n0);
    chk('…and the icon shows on the poster', await dp.evaluate(() => Array.from(document.querySelectorAll('.tmb-icon')).some(i => i.textContent === '🎵')));

    // Sunday first.
    await dp.click('#tm-tab-layout');
    await dp.click('.tm-segbtn:has-text("Sunday")');
    await dp.click('#tm-tab-classes');
    await dp.click('.tm-add'); await dp.fill('.tm-form input >> nth=0', 'Church'); await dp.click('.tm-form .tm-day[aria-label="Monday"]'); await dp.click('.tm-form .tm-day[aria-label="Sunday"]');
    await dp.click('.tm-form button[type=submit]');
    await dp.waitForFunction(() => /Church/.test(document.querySelector('.tm-list').innerText));
    chk('"week starts on Sunday" puts Sunday first', /Sun/.test(await dp.$eval('.tmp-dayhead', el => el.innerText)));

    // Paste rows from a spreadsheet.
    const before = (await dp.$$('.tm-item')).length;
    await dp.click('#tm-tab-start');
    await dp.fill('.tm-paste', 'Day\tStart\tEnd\tClass\tWhere\nMon/Wed\t4pm\t5pm\tPiano\tHall\nTue\t16:00-17:30\tCoding club\tLab 2\nFriday\t9\tnot a time\tBroken');
    await dp.waitForSelector('.tm-paste-res');
    const pr = await dp.$eval('.tm-paste-res', el => el.innerText);
    chk('pasted rows are read in any column order, a header is skipped, and a bad line is named', /2\s*classes ready/.test(pr) && /line 4: needs a start and an end time/.test(pr));
    await dp.click('.tm-paste-res button:has-text("Add 2 classes")');
    await dp.waitForFunction((n) => document.querySelectorAll('.tm-item').length === n + 2, before, { timeout: 5000 }).then(() => chk('…and "Add 2 classes" adds them', true), () => chk('…and "Add 2 classes" adds them', false));

    chk('no page errors on any screen', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (timetable UI)');
  process.exit(failed ? 1 : 0);
})();
