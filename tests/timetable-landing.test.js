#!/usr/bin/env node
/* ============================================================================
   The Timetable Maker's landing page (/timetable/about) and the door to it.

   The page is prerendered by build.js, so it is rendered here the same way
   (buildTimetableLanding) and served at /timetable/about as .htaccess serves
   it. Held:
   - it reads in full with JavaScript off, and its one control (the hero's
     style switcher) is not on screen until the script can drive it;
   - what it says about the maker comes from the maker: the example chips are
     the real parser's, the modes, styles and downloads the maker's own tables;
   - the poster images are committed at their real size, with both formats;
   - it fits every width the handoff names, and the switcher is a radio group;
   - /timetable shows it only to a first-time visitor, and every way of saying
     what you came to do (a link, a mode, an import, a sign-in, a saved
     timetable, the landing's own buttons) opens the maker instead.

   Run:  node tests/timetable-landing.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const esbuild = require('esbuild');
const L = require('../src/modules/timetable/landing/tt-landing-build');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.TIMETABLE_LANDING_PORT || '8288';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ttlanding-'));
const DB = path.join(TMP, 'ngg.db');
const SHOTS = process.env.TT_SHOTS || '';

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

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
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
const pngSize = buf => buf.slice(1, 4).toString() === 'PNG' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null;

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  try {
    /* ── The page as the build writes it ── */
    console.log('the prerendered page');
    const now = new Date('2026-10-06T12:00:00');
    const html = L.buildTimetableLanding({ root: ROOT, dist: TMP, esbuild, now });
    const T = L.ttLandingLoadMaker(ROOT, esbuild);
    const body = html.slice(html.indexOf('<body>'));
    chk('it is written as one file, not a folder that would shadow /timetable', fs.existsSync(path.join(TMP, L.OUT_FILE)) && !fs.existsSync(path.join(TMP, 'timetable')));
    chk('the title, and the hero lead as the description', /<title>Timetable Maker · NextGen Genius<\/title>/.test(html)
      && html.includes('<meta name="description" content="Type your classes the way you’d say them. See what’s on today and what’s next. Print a poster for the wall, put it on your lock screen, or add it to your calendar.">'));
    chk('the share image is the Classic poster, at the site\'s own address', /<meta property="og:image" content="https:\/\/next\.afrovanguard\.org\.ng\/assets\/timetable\/landing\/style-classic\.png">/.test(html)
      && /<link rel="canonical" href="https:\/\/next\.afrovanguard\.org\.ng\/timetable\/about">/.test(html));
    const chips = [...body.matchAll(/<li class="tt-lp-part"><i class="ph ph-([a-z-]+)"[^>]*><\/i>([^<]+)<\/li>/g)].map(m => m[1] + ':' + m[2]);
    chk('the example chips are what the parser understood', chips.join('|') === [
      'book-open:Maths', 'calendar-blank:Mon Wed', 'clock:08:00–09:00', 'map-pin:Room 4',
      'person-simple-run:Football', 'calendar-blank:Tue Thu', 'clock:16:00–17:30', 'map-pin:The field',
      'book-open:Maths test', 'calendar-dots:Only Thu 8 Oct', 'clock:10:00–10:40'].join('|'));
    const tq = T.ttQuick('Maths test Thu 10am this week', { entries: [], mode: 'school', today: 2, defDay: 2 });
    chk('…computed, not typed: they follow the parser and the week the page was built', tq.e.once && tq.e.start === '10:00' && tq.e.end === '10:40'
      && L.ttLandingParts(T, 'Maths test Thu 10am this week', new Date('2026-10-13T12:00:00')).some(p => p.t === 'Only Thu 15 Oct'));
    chk('the four modes link into the maker with their §7.1 copy, verbatim from the maker', T.TT_MODE_IDS.every(k => body.includes(`href="/timetable?mode=${k}"`) && body.includes(T.TT_MODES[k].example))
      && body.includes('Football Tue Thu 4–5:30pm at the field'));
    chk('the five downloads are the maker\'s own list', T.TT_FORMATS.every(f => body.includes('<b>' + f.name + '</b><span>' + f.desc.replace(/’/g, '’') + '</span>')));
    const imgs = [...body.matchAll(/<img src="\/assets\/timetable\/landing\/style-([a-z]+)\.png" alt="([^"]+)" width="872" height="616" ([^>]*)>/g)];
    chk('six posters (the hero and five styles), each sized so nothing shifts and named in its alt', imgs.length === 6 && imgs.every(m => m[2] === 'A school week printed in the ' + T.TT_LOOKS[m[1]].name + ' style'));
    chk('…the hero loads first, the rest lazily', /fetchpriority="high"/.test(imgs[0][3]) && imgs.slice(1).every(m => /loading="lazy"/.test(m[3])));
    chk('…and each has a WebP source', T.TT_LOOK_IDS.every(k => body.includes(`srcset="/assets/timetable/landing/style-${k}.webp"`)));
    chk('the switcher is in the markup but hidden until the script can drive it', /<div class="tt-lp-pick" role="radiogroup" aria-label="Preview a style" data-tt-lp-pick hidden>/.test(body));
    chk('the links the handoff names', ['/timetable?signin=1', '/timetable?import=centre', '/timetable?import=paste', '/join', '/privacy', '/contact'].every(h => body.includes(`href="${h}"`)));
    chk('no inline styles, and no colour typed into the markup', !/\sstyle="/.test(body) && !/#[0-9a-f]{3,8}\b/i.test(body.replace(/href="#[a-z-]+"/g, '')));
    const css = fs.readFileSync(path.join(ROOT, 'src/modules/timetable/landing/tt-landing.css'), 'utf8');
    chk('every colour in the stylesheet is a token declared on :root', !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css.slice(css.indexOf('}', css.indexOf(':root')))));

    for (const k of T.TT_LOOK_IDS) {
      const png = path.join(ROOT, 'assets/timetable/landing/style-' + k + '.png'), webp = path.join(ROOT, 'assets/timetable/landing/style-' + k + '.webp');
      const sz = fs.existsSync(png) ? pngSize(fs.readFileSync(png)) : null;
      chk('the ' + k + ' poster is committed at 1744×1232, PNG and WebP', !!sz && sz[0] === 1744 && sz[1] === 1232
        && fs.existsSync(webp) && fs.readFileSync(webp).slice(8, 12).toString() === 'WEBP');
    }
    const bare = path.join(TMP, 'bare');
    fs.mkdirSync(bare);
    fs.symlinkSync(path.join(ROOT, 'src'), path.join(bare, 'src'));
    fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(bare, 'index.html'));
    let refused = '';
    try { L.buildTimetableLanding({ root: bare, dist: TMP, esbuild }); } catch (e) { refused = e.message; }
    chk('a build with a poster missing stops and says how to make them', /missing .*style-classic\.png.*npm run build:ttposters/.test(refused));

    /* ── In a browser ── */
    const chromium = loadChromium();
    if (!chromium) { console.log('⏭  browser half skipped (playwright not installed)'); return; }
    if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); failed++; return; }
    fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'timetable_landing_secret_0123456789',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
    const nowIso = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-TL-1','fullName'=>'Tobi Adeyemi','email'=>'tl-1@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Coding','createdAt'=>${nowIso},'updatedAt'=>${nowIso}]);`
      + `db_insert('members', ['memberId'=>'NGG-TL-2','fullName'=>'Ada Obi','email'=>'tl-2@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Coding','createdAt'=>${nowIso},'updatedAt'=>${nowIso}]);`
      + `db_insert('member_timetables', ['memberId'=>'NGG-TL-2','doc'=>json_encode(['settings'=>['title'=>'Ada’s week'],'entries'=>[],'exceptions'=>[]]),'updatedAt'=>${nowIso}]);`);
    // .htaccess's one rule, for PHP's built-in server: the landing file at
    // /timetable/about, real files as they are, everything else the SPA shell.
    const router = path.join(TMP, 'router.php');
    fs.writeFileSync(router, `<?php
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/timetable/about/?$#', $p)) { header('Content-Type: text/html; charset=utf-8'); readfile(${JSON.stringify(path.join(TMP, L.OUT_FILE))}); return true; }
if ($p !== '/' && is_file(${JSON.stringify(ROOT)} . $p)) return false;
header('Content-Type: text/html; charset=utf-8'); readfile(${JSON.stringify(path.join(ROOT, 'index.html'))}); return true;
`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, router], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (d) launch.executablePath = '/opt/pw-browsers/' + d + '/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    const errs = [];
    const ctx = async (o = {}) => {
      const c = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 }, timezoneId: 'Africa/Lagos' }, o.opts || {}));
      if (o.seed) await c.addInitScript(s => { try { if (!sessionStorage.getItem('tt-seeded')) { localStorage.setItem('ngg.timetable.maker.v2', s); sessionStorage.setItem('tt-seeded', '1'); } } catch (_) {} }, o.seed);
      if (o.mid) {
        const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${o.mid}'"), false);`, ['session']);
        await c.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                            { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      }
      const p = await c.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
      return p;
    };

    console.log('with JavaScript off');
    const off = await ctx({ opts: { javaScriptEnabled: false, viewport: { width: 390, height: 844 } } });
    await off.goto(BASE + '/timetable/about');
    const offText = await off.innerText('body');
    chk('every section reads without a script', ['Your whole week on one page.', 'Type it the way you’d say it.', 'Pick a style, then the colours.',
      'One timetable, laid out for where you’ll use it.', 'What’s your week like?', 'Keep it, with or without an NGG account.', 'Start with a blank week, or your centre’s sessions.'].every(s => offText.includes(s)));
    chk('…the switcher is not on screen, so nothing visible cannot act', !(await off.isVisible('.tt-lp-pick')));
    chk('…and the hero poster is there anyway', await off.isVisible('.tt-lp-poster img'));
    await off.context().close();

    console.log('at every width');
    for (const w of [360, 390, 768, 1024, 1280, 1440]) {
      const p = await ctx({ opts: { viewport: { width: w, height: 900 } } });
      await p.goto(BASE + '/timetable/about');
      await p.waitForLoadState('networkidle').catch(() => {});
      const m = await p.evaluate(() => ({
        over: document.documentElement.scrollWidth > window.innerWidth + 1,
        anchors: [...document.querySelectorAll('.tt-lp-anchors a')].filter(a => a.checkVisibility()).length,
        cta: Math.round(document.querySelector('.tt-lp-head .tt-lp-btn').getBoundingClientRect().right),
        signin: document.querySelector('.tt-lp-signin').checkVisibility(),
        heroBtn: Math.round(document.querySelector('.tt-lp-hero .tt-lp-btn').getBoundingClientRect().height),
        head: Math.round(document.querySelector('.tt-lp-head').getBoundingClientRect().height),
      }));
      chk(w + 'px: nothing scrolls sideways, the header is 64px and the hero buttons 54px', !m.over && m.head === 65 && m.heroBtn === 54);
      chk(w + 'px: "Make my timetable" sits at the right edge of the header' + (w < 400 ? ', with sign-in left to the maker' : ''), m.cta === Math.round((w + Math.min(w, 1200)) / 2 - Math.max(16, Math.min(32, w * 0.04))) && m.signin === (w >= 400));
      chk(w + 'px: the anchor links ' + (w >= 860 ? 'show' : 'are hidden'), m.anchors === (w >= 860 ? 4 : 0));
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, 'landing-' + w + '.png'), fullPage: true }); }
      await p.context().close();
    }

    console.log('the style switcher');
    const sw = await ctx();
    await sw.goto(BASE + '/timetable/about');
    chk('with the script it appears, Classic chosen', await sw.isVisible('.tt-lp-pick') && (await sw.getAttribute('[data-look=classic]', 'aria-checked')) === 'true');
    await sw.focus('[data-look=classic]');
    await sw.keyboard.press('ArrowRight');
    chk('an arrow key moves to the next style and shows it', (await sw.getAttribute('[data-look=bold]', 'aria-checked')) === 'true'
      && await sw.evaluate(() => document.activeElement.dataset.look === 'bold')
      && /style-bold\.png$/.test(await sw.getAttribute('[data-tt-lp-img]', 'src')) && /style-bold\.webp$/.test(await sw.getAttribute('[data-tt-lp-src]', 'srcset'))
      && (await sw.getAttribute('[data-tt-lp-img]', 'alt')) === 'A school week printed in the Bold style');
    chk('…only the chosen one is a tab stop', (await sw.$$eval('[role=radio]', b => b.map(x => x.tabIndex).join())) === '-1,0,-1,-1,-1');
    await sw.keyboard.press('ArrowLeft');
    await sw.keyboard.press('ArrowLeft');
    chk('…and it wraps', (await sw.getAttribute('[data-look=editorial]', 'aria-checked')) === 'true');
    await sw.click('[data-look=notebook]');
    chk('a click chooses too', /style-notebook\.png$/.test(await sw.getAttribute('[data-tt-lp-img]', 'src')));

    console.log('the door at /timetable');
    const fresh = await ctx();
    await fresh.goto(BASE + '/timetable');
    await fresh.waitForURL(/\/timetable\/about$/, { timeout: 60000 });
    chk('a first visit to /timetable is shown the landing', (await fresh.innerText('h1')) === 'Your whole week on one page.');
    chk('…and nothing was kept in the browser on the way', await fresh.evaluate(() => localStorage.getItem('ngg.timetable.maker.v2') === null));
    await fresh.click('.tt-lp-hero .tt-lp-btn');
    await waitForBoot(fresh);
    await fresh.waitForSelector('.tt-app .tt-listpane', { timeout: 30000 });
    await fresh.waitForTimeout(1500);
    chk('"Make my timetable" opens the maker, and stays there', new URL(fresh.url()).pathname === '/timetable');
    await fresh.context().close();

    const go = async (url, o = {}) => {
      const p = await ctx(o);
      await p.goto(BASE + url);
      await waitForBoot(p);
      await p.waitForSelector('.tt-app .tt-head, .tt-lp-head', { timeout: 30000 });
      await p.waitForTimeout(1200);
      return p;
    };
    let p = await go('/timetable?mode=routine');
    chk('?mode= opens the maker with that mode chosen', new URL(p.url()).pathname === '/timetable'
      && await p.evaluate(() => (JSON.parse(localStorage.getItem('ngg.timetable.maker.v2') || '{}').s || {}).mode === 'routine'));
    await p.context().close();
    p = await go('/timetable?import=paste');
    chk('?import=paste opens Import, ready to paste', /Import classes/.test(await p.innerText('.tt-layer')) && await p.evaluate(() => document.activeElement && document.activeElement.id === 'tt-paste'));
    await p.context().close();
    p = await go('/timetable?signin=1');
    chk('?signin=1 opens Save on the member path', !!(await p.$('.tt-layer')) && /Member ID or email/.test(await p.innerText('.tt-layer')));
    await p.context().close();
    p = await go('/timetable', { seed: JSON.stringify({ s: { title: 'Mine' }, entries: [], ex: {} }) });
    chk('a timetable already in this browser opens the maker', new URL(p.url()).pathname === '/timetable' && (await p.inputValue('.tt-head-title')) === 'Mine');
    await p.context().close();
    p = await ctx({ mid: 'NGG-TL-1' });
    await p.goto(BASE + '/timetable');
    await p.waitForURL(/\/timetable\/about$/, { timeout: 60000 });
    chk('a signed-in member with nothing saved is shown the landing', true);
    await p.context().close();
    p = await go('/timetable', { mid: 'NGG-TL-2' });
    await p.waitForFunction(() => document.querySelector('.tt-head-title') && document.querySelector('.tt-head-title').value === 'Ada’s week', null, { timeout: 15000 }).catch(() => {});
    chk('a signed-in member with a saved timetable goes straight to it', new URL(p.url()).pathname === '/timetable' && (await p.inputValue('.tt-head-title')) === 'Ada’s week');
    await p.context().close();

    chk('no page errors anywhere', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (timetable landing)`);
    process.exit(failed ? 1 : 0);
  }
})();
