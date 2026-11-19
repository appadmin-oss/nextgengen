#!/usr/bin/env node
/* ============================================================================
   The Summer School promotion page — discovery, and honesty about failure.

   This is the page a poster, a WhatsApp forward or a radio mention sends people
   to. It had one job — get a family from "I heard about this" to an application
   — and it answered none of the three questions they arrive with:

     · WHERE is my nearest centre? (the directory was on another page)
     · WHAT does it teach? (the academy catalogue was admin-only, so the
       courses this programme runs were nowhere on the public site)
     · IS IT OPEN, and when does it start? (the edition's dates and its
       application window were in the database and never published)

   What this drives, against a real PHP + SQLite backend:

     · the edition's name, dates and application state ARE on the page
     · one search box answers all three questions — a place finds the centre,
       a craft finds the course AND the centres teaching it
     · a search with no matches says so, in a live region, rather than
       rendering an empty section that looks like a broken page
     · "Apply here" on a centre carries that centre into the form, and "Apply
        for this" on a course carries the course
     · a FAILED read is reported as a failure with a retry — not as an empty
       programme, which is what the page used to do with a 500
     · the child cards are real links to that child's own profile, keyboard
       reachable, instead of divs opening the generic profile page
     · the academy filters are real toggles with aria-pressed
     · nothing scrolls sideways at 390px, and the six-week schedule is not six
       columns wide on a phone

   Run:  node tests/summer-page.test.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, SUMPAGE_PORT (default 8267).
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SUMPAGE_PORT || '8267';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-sumpage-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-sumpage-cache-${process.pid}`);

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-sp-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.unlinkSync(DB); } catch (_) {}
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const ok = (m) => { passed++; console.log('  ✓ ' + m); };
const bad = (m) => { failed++; console.error('  ✗ FAIL: ' + m); };
const chk = (m, cond) => cond ? ok(m) : bad(m);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  summer page: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }

  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'sumpage_test_secret_0123456789abc',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    /* No caching in the test: the point is what the page renders from the
       CURRENT data, and a five-minute window would hide a stale read rather
       than prove one. */
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'debug' => false,
  ];\n`);

  try {
    /* Seed: a live edition WITH dates and an open application window, two
       published centres, and a group at one of them so the page can say which
       course runs where. Plus two children on the public board — one consented
       (named) and one not (handle only), because the page must not invent a
       face for the second. */
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const past = new Date(today.getTime() - 30 * 864e5), future = new Date(today.getTime() + 30 * 864e5);
    php(`db_migrate(db_conn());`
      + `db_insert('summer_cohorts', ['cohortId'=>'SUM-2026','code'=>'SS26','name'=>'Summer School 2026','year'=>2026,`
      + `'status'=>'active','startDate'=>'2026-07-06','endDate'=>'2026-08-14',`
      + `'applyOpensAt'=>'${iso(past)}','applyClosesAt'=>'${iso(future)}','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-IJ','name'=>'Ijaiye','code'=>'IJ','color'=>'#76B043','status'=>'active',`
      + `'pageStatus'=>'published','slug'=>'ijaiye','area'=>'Ijaiye · Lagos','tagline'=>'The room on Ijaiye Road','capacity'=>2,'createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-EG','name'=>'Egbeda','code'=>'EG','color'=>'#3B5BDB','status'=>'active',`
      + `'pageStatus'=>'published','slug'=>'egbeda','area'=>'Egbeda · Lagos','tagline'=>'Where it started','capacity'=>0,'createdAt'=>now_iso()]);`
      // Egbeda's own public sign-up link: /join?program=summer forwards to the live link for the centre.
      + `db_insert('gate_links', ['gateId'=>'G-EG-SELF','name'=>'Egbeda sign-up','cohortId'=>'SUM-2026','kind'=>'self','centreId'=>'CTR-EG','status'=>'active','createdAt'=>now_iso()]);`
      // A group, so "Piano runs at Ijaiye" is a fact and not a hope.
      + `db_insert('summer_groups', ['groupId'=>'SG-PIA','cohortId'=>'SUM-2026','name'=>'Ijaiye · Piano · Morning',`
      + `'code'=>'IJ-PIA','centreId'=>'CTR-IJ','faculty'=>'Music','track'=>'Piano','status'=>'active','createdAt'=>now_iso()]);`
      // Two children at Ijaiye, so the capacity of 2 makes the centre full.
      + `db_insert('summer_students', ['studentId'=>'SP-1','cohortId'=>'SUM-2026','token'=>'SUMQR-SP1','handle'=>'adaobi',`
      + `'fullName'=>'Ada Obi','age'=>13,'centre'=>'Ijaiye','track'=>'Piano','status'=>'active','regStatus'=>'verified','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('summer_students', ['studentId'=>'SP-2','cohortId'=>'SUM-2026','token'=>'SUMQR-SP2','handle'=>'bodeq',`
      + `'fullName'=>'Bode Quiet','age'=>14,'centre'=>'Ijaiye','track'=>'Guitar','status'=>'active','regStatus'=>'verified','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 220)));

    await page.goto(BASE + '/summer', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForSelector('#summer-q', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const text = () => page.evaluate(() => document.body.innerText);
    const type = async (v) => {
      await page.fill('#summer-q', v);
      await page.waitForTimeout(450);
    };

    console.log('\n── The three questions a family arrives with ────────────────');
    let t = await text();
    chk('the page names the edition', /Summer School 2026/.test(t));
    chk('…and publishes its DATES, which were in the database and never shown',
      /Jul/.test(t) && /Aug/.test(t));
    chk('…and says whether applications are open', /applications open/i.test(t));
    chk('the centres are on the page, which they never were', /Ijaiye/.test(t) && /Egbeda/.test(t));
    chk('…with the area, so "nearest" is answerable', /Ijaiye · Lagos/.test(t));
    chk('the COURSES are on the public site at last', /Piano/.test(t) && /Graphics Design/.test(t));
    chk('…grouped by academy', /Music/.test(t) && /Creative Arts/.test(t));
    chk('…and each one says WHERE it is taught', /at Ijaiye/.test(t));

    console.log('\n── One search, three answers ────────────────────────────────');
    chk('there is a labelled search box, in a search landmark',
      await page.evaluate(() => {
        const f = document.querySelector('form[role="search"]');
        const i = document.getElementById('summer-q');
        return !!f && !!i && !!document.querySelector('label[for="summer-q"]');
      }));
    chk('…with a live count, so a search that returns nothing is distinguishable from one that did not run',
      await page.evaluate(() => {
        const c = document.getElementById('summer-q-count');
        return !!c && c.getAttribute('role') === 'status';
      }));

    await type('ijaiye');
    t = await text();
    /* Assert on the CENTRE LIST, not on the whole page. Slicing the body text
       and hoping the other centre appears nowhere else in it is a test that
       fails for reasons that are not the feature — the class gallery, a
       tagline or a course's "at Ijaiye" line all mention centres too. */
    const centreList = () => page.evaluate(() => {
      const ul = document.querySelector('.summer-cards-centres');
      return ul ? Array.from(ul.querySelectorAll('.summer-card-h')).map(h => h.textContent.trim()) : [];
    });
    let hits = await centreList();
    chk('a PLACE finds the centre, and only that one (' + JSON.stringify(hits) + ')',
      hits.length === 1 && hits[0] === 'Ijaiye');
    chk('…and says how many matched', /match(es)? for/.test(t));

    await type('piano');
    t = await text();
    chk('a CRAFT finds the course', /Piano/.test(t));
    hits = await centreList();
    chk('…and the centre that teaches it, so "near us" is answerable (' + JSON.stringify(hits) + ')',
      hits.indexOf('Ijaiye') !== -1 && hits.indexOf('Egbeda') === -1);

    await type('zzzznothing');
    t = await text();
    chk('a search with no matches says so rather than rendering an empty page',
      /Nothing matches/.test(t));
    chk('…and offers the way back', /Show all/.test(t));
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.link-btn')).filter(x => /Show all/.test(x.textContent))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(500);
    chk('…which restores the full list', /Ijaiye/.test(await text()) && /Egbeda/.test(await text()));

    console.log('\n── The CTAs carry what was clicked ─────────────────────────');
    /* "Apply here" on a centre that opened a form with a different centre
       preselected is decoration. Ijaiye is FULL in this fixture (capacity 2,
       two children), so its Apply is withheld and Egbeda's is the live one —
       which is itself the behaviour worth pinning. */
    t = await text();
    chk('a full centre says it is full instead of offering a place', /Ijaiye is full|This centre is full/i.test(t));
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.summer-card'));
      for (const c of cards) {
        if (!/Egbeda/.test(c.innerText)) continue;
        const b = Array.from(c.querySelectorAll('button')).filter(x => /Apply here/.test(x.textContent))[0];
        if (b) { b.click(); return; }
      }
    });
    /* "Apply here" goes through /join?program=summer, which forwards to the centre's own live
       sign-up link (public.summer.signup) — Egbeda's, seeded above — carrying what was pressed. */
    await page.waitForFunction(() => /^\/apply\?g=/.test(location.pathname + location.search), null, { timeout: 15000 }).catch(() => {});
    let url = await page.evaluate(() => window.location.pathname + window.location.search);
    chk('"Apply here" opens that centre\'s own Summer School sign-up (' + url + ')', /^\/apply\?g=G-EG-SELF\b/.test(url));
    chk('…carrying the centre it was clicked on', /centre=Egbeda/.test(url));
    const chosen = () => page.evaluate(() => Array.from(document.querySelectorAll('select')).map(s => s.value).filter(Boolean));
    await page.waitForFunction(() => document.querySelectorAll('select').length > 0, null, { timeout: 20000 }).catch(() => {});
    let picked = await chosen();
    chk('…and the form opens with that centre chosen (' + picked.join(', ') + ')', picked.includes('Egbeda') || /Centre\s*·?\s*Egbeda/.test(await text()));

    // Back to the promotion page for the course CTA.
    await page.goto(BASE + '/summer', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForSelector('.summer-course', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { try { Object.keys(localStorage).filter(k => /selfreg|apply/i.test(k)).forEach(k => localStorage.removeItem(k)); } catch (_) {} });
    await page.evaluate(() => {
      const li = Array.from(document.querySelectorAll('.summer-course')).filter(x => /Piano/.test(x.innerText))[0];
      if (li) { const b = li.querySelector('button'); if (b) b.click(); }
    });
    await page.waitForFunction(() => /^\/apply\?g=/.test(location.pathname + location.search), null, { timeout: 15000 }).catch(() => {});
    url = await page.evaluate(() => window.location.pathname + window.location.search);
    chk('"Apply for this" on a course carries the course to the sign-up (' + url + ')', /track=Piano/.test(url));
    await page.waitForFunction(() => document.querySelectorAll('select').length > 0, null, { timeout: 20000 }).catch(() => {});
    picked = await chosen();
    chk('…and the form opens with that course (and its faculty) chosen, not asking again (' + picked.join(', ') + ')', picked.includes('Piano') && picked.includes('Music'));

    console.log('\n── A failed read is a failure, not an empty programme ───────');
    /* The old page did `.catch(() => setCohort([]))`, so a 500 rendered "the
       summer class has not been enrolled yet" — a broken page reporting itself
       as a programme with no children in it. */
    await page.route('**/api/public/summer.php', r => r.fulfill({ status: 500, body: '{"ok":false,"error":"boom"}' }));
    await page.route('**/api/public/status.php', r => r.fulfill({ status: 500, body: '{"ok":false,"error":"boom"}' }));
    await page.goto(BASE + '/summer', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForTimeout(2500);
    t = await text();
    chk('a failed discovery read says it failed', /couldn't load the centres and courses/i.test(t));
    chk('…and offers Try again', /try again/i.test(t));
    chk('a failed class read says it failed too', /couldn't load this summer's class/i.test(t));
    chk('…and does NOT claim the programme has no children',
      !/has not been enrolled yet/.test(t));
    await page.unroute('**/api/public/summer.php');
    await page.unroute('**/api/public/status.php');

    console.log('\n── The class gallery ───────────────────────────────────────');
    await page.goto(BASE + '/summer', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForSelector('.summer-facs', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    chk('the academy filters are real toggles, with their state exposed',
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('.summer-fac'));
        return b.length > 0 && b.every(x => x.hasAttribute('aria-pressed'))
          && b.filter(x => x.getAttribute('aria-pressed') === 'true').length === 1
          && !!document.querySelector('.summer-facs[role="group"][aria-label]');
      }));
    chk('…and the filter group is named', await page.evaluate(() =>
      /academy/i.test((document.querySelector('.summer-facs') || {}).getAttribute('aria-label') || '')));
    /* Each child is a real LINK to their own profile. It was a div with a click
       handler that opened the generic /profile page: unreachable by keyboard,
       and wrong when it worked. */
    const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.member-card a.member-card-hit')).map(a => a.getAttribute('href')));
    chk('every child card is a real link (' + cards.length + ')', cards.length >= 1);
    chk('…to THAT child\'s profile, not the generic one', cards.every(h => /^\/s\//.test(h)));
    chk('…and is keyboard focusable', await page.evaluate(() => {
      const a = document.querySelector('.member-card a.member-card-hit');
      if (!a) return false;
      a.focus();
      return document.activeElement === a;
    }));

    console.log('\n── A phone ─────────────────────────────────────────────────');
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await phone.newPage();
    await p2.goto(BASE + '/summer', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p2);
    await p2.waitForTimeout(2000);
    const m = await p2.evaluate(() => {
      const weeks = document.querySelector('.summer-weeks');
      const cols = weeks ? getComputedStyle(weeks).gridTemplateColumns.split(' ').length : 0;
      return {
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        weekCols: cols,
        searchH: (document.getElementById('summer-q') || {}).getBoundingClientRect
          ? Math.round(document.getElementById('summer-q').getBoundingClientRect().height) : 0,
      };
    });
    chk('nothing scrolls sideways at 390px (' + m.over + 'px over)', m.over <= 0);
    chk('the six-week schedule is NOT six columns on a phone (' + m.weekCols + ')', m.weekCols > 0 && m.weekCols <= 2);
    chk('the search field clears the 44px touch target (' + m.searchH + 'px)', m.searchH >= 44);
    await phone.close();

    chk('no uncaught page errors across the run', errs.length === 0);
    if (errs.length) errs.slice(0, 4).forEach(e => console.error('      ' + e));
  } catch (e) {
    bad('harness — ' + (e && e.message ? e.message : e));
    if (e && e.stack) console.error(String(e.stack).split('\n').slice(0, 4).join('\n'));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }

  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (Summer School promotion page)');
  process.exit(failed ? 1 : 0);
})();
