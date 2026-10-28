#!/usr/bin/env node
/* ============================================================================
   /about — the NGGC 2040 formation brief, as a page.

   Two halves, because the page has two distinct ways of going wrong.

   1. DOCTRINE. formation.jsx is the single source for the six goals, four
      divisions, five-rung courage ladder and twelve mentor questions that the
      About page, the mentor portal and a member's dashboard all read. The
      failure mode is silent arithmetic: a division quietly carrying nine
      courses instead of ten, a "five-point index" with four rungs, chess
      missing from one of the four lists. None of that breaks a render, none
      of it fails a screenshot, and it is wrong in a document parents are
      handed. So the counts are asserted as counts.

   2. REGISTRATION. A page in this app is only reachable once it appears in
      eight places — PAGE_IDS, PAGE_META, the pages map, build.js ORDER,
      index.html, the nav, the palette and both sitemaps. Miss one and the
      symptom is specific and unobvious: the route 404s, or it renders but has
      no <title>, or it works everywhere except a hard refresh, or Google
      never sees it. Each one is checked by name.

   Then the real bundle is mounted at /about and photographed, so the assertions
   above are being made about a page that actually renders.

   Run:  node tests/about-page.test.js
   Out:  tests/screens/about-*.png
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ABOUT_PORT || 8219;
const BASE = 'http://127.0.0.1:' + PORT;
const OUT = path.join(ROOT, 'tests', 'screens');

let pass = 0, fail = 0;
const ok = (l, c) => { c ? (pass++, console.log('  ✓ ' + l)) : (fail++, console.error('  ✗ FAIL: ' + l)); };

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

/* ── 1 · The doctrine ──────────────────────────────────────────────────────
   formation.jsx is data, not a module — it ends in an Object.assign onto
   `window`. Evaluated here in a throwaway sandbox with that one global, which
   reads the real values rather than regexing the source for them. */
function loadDoctrine() {
  const src = read('formation.jsx');
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(sandbox.window);
  return sandbox.window;
}

function doctrineSuite() {
  console.log('\nThe formation doctrine (formation.jsx)');
  const D = loadDoctrine();

  ok('the brief\'s four divisions are all present', D.NGGC_DIVISIONS.length === 4);
  ok('each division carries a mandate', D.NGGC_DIVISIONS.every(d => typeof d.mandate === 'string' && d.mandate.length > 20));
  // Chess is compulsory across all four divisions — §6 is the reason the
  // programme is not just four unrelated syllabuses, so it is asserted per list.
  ok('chess appears in every division\'s course list (it is compulsory)',
     D.NGGC_DIVISIONS.every(d => d.courses.includes('Chess')));
  /* The programme's Divisional Heads list (2026-10): arts 10, media 8, tech 8,
     business 10, chess in each. A flat number here once caught the About page
     claiming a total the divisions did not hold — so the lists are pinned per
     division and the page's total is computed from them. */
  /* Creative & Performing Arts grew from 10 to 14 when each instrument became
     a course of its own: a child learning drums and a child learning piano
     were on one course called "Musical Instruments" and could not both be
     given the right lesson. */
  ok('each division lists the programme\'s courses (14 · 8 · 8 · 10)',
     D.NGGC_DIVISIONS.map(d => d.courses.length).join() === '14,8,8,10');
  ok('the divisions hold 40 courses between them',
     D.NGGC_DIVISIONS.reduce((n, d) => n + d.courses.length, 0) === 40);
  ok('every instrument is named, not hidden behind one umbrella course',
     ['Piano', 'Guitar', 'Drums', 'Violin', 'Saxophone'].every(i => D.NGGC_DIVISIONS[0].courses.includes(i))
     && !D.NGGC_DIVISIONS.some(d => d.courses.includes('Musical Instruments')));
  ok('each division says which children it is for',
     D.NGGC_DIVISIONS.every(d => /^For children interested in /.test(d.audience || '')));
  ok('no division repeats a course',
     D.NGGC_DIVISIONS.every(d => new Set(d.courses).size === d.courses.length));

  ok('six goals, numbered 01–06',
     D.NGGC_GOALS.length === 6 && D.NGGC_GOALS.map(g => g.code).join() === '01,02,03,04,05,06');

  ok('the courage ladder has five rungs scored 1–5',
     D.NGGC_COURAGE_LADDER.length === 5 && D.NGGC_COURAGE_LADDER.map(r => r.score).join() === '1,2,3,4,5');
  ok('the top rung is other-directed, not merely bolder',
     /good of others/i.test(D.NGGC_COURAGE_LADDER[4].label));
  ok('ten courage observations a mentor scores against', D.NGGC_COURAGE_PROMPTS.length === 10);
  ok('courage is defined against loudness, aggression and stubbornness',
     D.NGGC_COURAGE_IS_NOT.length === 3);

  ok('the Anchor Journal has nine blocks with stable keys',
     D.NGGC_ANCHOR_JOURNAL.length === 9 && new Set(D.NGGC_ANCHOR_JOURNAL.map(b => b.key)).size === 9);
  ok('every journal block is a question',
     D.NGGC_ANCHOR_JOURNAL.every(b => b.q.trim().endsWith('?')));

  ok('the mentor\'s weekly review is twelve questions', D.NGGC_WEEKLY_REVIEW.length === 12);
  ok('the Rational Leadership Test is nine questions', D.NGGC_LEADERSHIP_TEST.length === 9);
  ok('leadership is measured on eight things', D.NGGC_LEADERSHIP.measures.length === 8);
  ok('nine musing prompts', D.NGGC_MUSING.prompts.length === 9);
  ok('the timetable handover is five rungs ending in teaching others',
     D.NGGC_TIMETABLE.progression.length === 5 && /teaches others/i.test(D.NGGC_TIMETABLE.progression[4]));

  ok('the pathway runs NGG → NGV → Afrovanguard → Institution Builders → Africa 2040',
     D.NGGC_PATHWAY.map(s => s.label).join(' → ') ===
     'NGG → NGV → Afrovanguard → Institution Builders → Africa 2040');
  ok('the four-layer model is numbered 1–4',
     D.NGGC_LAYERS.length === 4 && D.NGGC_LAYERS.map(l => l.n).join() === '1,2,3,4');
  ok('progression has three stages, NGG / NGV / Afrovanguard',
     D.NGGC_PROGRESSION.map(p => p.stage).join() === 'NGG,NGV,Afrovanguard');
  ok('the member dashboard has seven groups', D.NGGC_MEMBER_DASHBOARD.length === 7);
  ok('the NGGC standard is fourteen lines', D.NGGC_STANDARD.length === 14);
  ok('the vision is 1,000,000 by 2040',
     D.NGGC_VISION_2040.target === 1000000 && D.NGGC_VISION_2040.horizon === 2040);
  ok('the declaration keeps the three-part refrain',
     D.NGGC_DECLARATION.refrain.join(' ') === 'Cannot be bought. Cannot be bent. Cannot be broken.');

  // Helpers — both are called from surfaces that hand them untrusted values.
  ok('nggcDivision() resolves by id and by name',
     D.nggcDivision('tech').code === '03' && D.nggcDivision('Media & Content Strategy').id === 'media');
  ok('nggcDivision() returns null for an unknown division', D.nggcDivision('xxx') === null);
  ok('nggcCourageRung() maps a score to its rung', D.nggcCourageRung(4).label === 'Takes responsibility voluntarily');
  ok('nggcCourageRung() treats unscored as unscored, not as 1',
     D.nggcCourageRung(0) === null && D.nggcCourageRung(null) === null && D.nggcCourageRung('') === null);
  ok('nggcCourageRung() clamps a stored out-of-range score instead of blanking the record',
     D.nggcCourageRung(9).score === 5);
}

/* ── 2 · Registration ──────────────────────────────────────────────────── */
function registrationSuite() {
  console.log('\nRegistration — the places a page has to appear');
  const app = read('app.jsx');
  const build = read('build.js');
  const index = read('index.html');
  const comp = read('components.jsx');
  const cmd = read('command.jsx');

  /* One ROUTES row, per CLAUDE.md §2 — PAGE_IDS, PAGE_META, OWN_CHROME_PAGES
     and NOINDEX_PAGES are all derived from it, and a second list of pages is
     named in §11 as a structure that must not come back. So the row is what is
     asserted, and its absent flags are asserted as absent: a public page is
     one that says nothing about chrome or indexing. tests/route-registry.test.js
     separately guarantees every row has a renderer and vice versa. */
  const aboutRow = (app.match(/^\s*\{ id: "about",.*$/m) || [''])[0];
  ok('app.jsx ROUTES has an about row (without it the route 404s)', !!aboutRow);
  ok('the about row carries a title (tab, og:title, route announcement)',
     /title: "[^"]+"/.test(aboutRow));
  ok('the about row carries a real meta description (share card, SEO)',
     /desc: "[^"]{60,}"/.test(aboutRow));
  ok('app.jsx renders <AboutPage> for the about route', /about:\s*<AboutPage\s/.test(app));
  ok('about is indexable — it is the programme\'s public statement of itself',
     !/index:\s*false/.test(aboutRow));
  ok('about does not claim its own chrome — it keeps the topnav and footer',
     !/chrome:/.test(aboutRow));
  ok('about is addressable at /about', !/addressable:\s*false/.test(aboutRow));

  ok('build.js bundles formation.jsx before the pages that read it',
     build.indexOf("'formation.jsx'") > -1 &&
     build.indexOf("'formation.jsx'") < build.indexOf("'page-about.jsx'"));
  ok('build.js bundles page-about.jsx', build.includes("'page-about.jsx'"));
  ok('index.html loads both new files (the build fails if these drift apart)',
     index.includes('src="formation.jsx"') && index.includes('src="page-about.jsx"'));

  ok('the topnav offers About under "The room"', /id: "about",\s*label: "About NGGC"/.test(comp));
  ok('the topnav highlights "The room" while on /about', /match: \["about",/.test(comp));
  ok('the footer links to About', /label: "About NGGC", page: "about"/.test(comp));
  ok('the command palette can jump to About', /id: "nav\.about"/.test(cmd));

  ok('the dynamic sitemap lists /about', read('api/public/sitemap.php').includes("['/about'"));
  ok('the static fallback sitemap lists /about', read('sitemap.xml').includes('/about<'));
}

/* ── 3 · The page actually renders ─────────────────────────────────────── */
async function renderSuite() {
  console.log('\nThe page, rendered from the shipped bundle');
  const chromium = loadChromium();
  if (!chromium) { console.log('  — playwright unavailable, skipping render checks'); return; }
  // Same resolution as ui-smoke.js: playwright-core's pinned revision is not
  // necessarily the browser this image has on disk.
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  const distIndex = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) { console.error('  ✗ dist/ missing — run node build.js first'); fail++; return; }

  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', path.join(ROOT, 'dist')], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(BASE, 15000);
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

    const errors = [], badLoads = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) badLoads.push(r.status() + ' ' + new URL(r.url()).pathname); });

    // `php -S` has no SPA fallback, so /about would 404 on the static server.
    // Load the app and navigate the way a visitor does — which also exercises
    // the router rather than only the component.
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('main', { timeout: 15000 });
    await page.evaluate(() => window.__navigate('about'));
    await page.waitForSelector('[data-screen-label="About NGGC"]', { timeout: 15000 });

    const body = await page.evaluate(() => document.body.innerText);

    ok('the route sets a document title', /About NGGC/.test(await page.title()));
    ok('the router rewrites the address bar to /about',
       (await page.evaluate(() => location.pathname)) === '/about');
    ok('the page is marked indexable for crawlers',
       /index/.test(await page.evaluate(() => (document.querySelector('meta[name="robots"]') || {}).content || '')));
    ok('the canonical URL points at /about',
       /\/about$/.test(await page.evaluate(() => (document.querySelector('link[rel="canonical"]') || {}).href || '')));

    ok('the core objective is on the page', /cannot be bought, bent or broken/i.test(body));
    ok('the 2040 target is stated', body.includes('1,000,000') && body.includes('2040'));
    ok('all four divisions render', ['Creative & Performing Arts', 'Media & Content Strategy',
       'Technology & Applied Engineering', 'Business Strategy'].every(n => body.includes(n)));
    ok('the courage ladder renders all five rungs',
       ['Avoids responsibility', 'Acts only when instructed', 'Attempts difficult things',
        'Takes responsibility voluntarily', 'Acts courageously for the good of others']
         .every(l => body.includes(l)));
    ok('the nine Anchor Journal blocks render',
       ['VALUE', 'VISION', 'VIRTUE', 'REFLECTION', 'FAILURE', 'COURAGE',
        'RESPONSIBILITY', 'IMPACT', 'NEXT MOVE'].every(l => body.includes(l)));
    ok('the declaration closes the page', /Cannot be broken\./.test(body));

    // The disclosures are the page's only interactive elements; a collapsed
    // panel that never opens is indistinguishable from missing content.
    const firstDivisionToggle = page.locator('button[aria-controls^="division-courses-"]').first();
    ok('a division\'s courses are collapsed until asked for',
       (await page.locator('#division-courses-media').isVisible()) === false);
    await page.locator('button[aria-controls="division-courses-media"]').click();
    ok('opening a division reveals its eight courses',
       (await page.locator('#division-courses-media li').count()) === 8);

    await page.locator('button[aria-controls="about-weekly-review"]').click();
    ok('the mentor\'s weekly review opens to twelve questions',
       (await page.locator('#about-weekly-review li').count()) === 12);
    await page.locator('button[aria-controls="about-leadership-test"]').click();
    ok('the Rational Leadership Test opens to nine questions',
       (await page.locator('#about-leadership-test li').count()) === 9);

    /* Every disclosure is a real button with a real aria relationship, and
       every one is thumb-sized. This page is read on a phone more than not.
       Scoped to `.page`: the shared topnav's own aria-expanded controls (the
       mega-menu triggers at 38px, the burger at 0×0 while hidden on desktop)
       are pre-existing chrome, and a page suite that fails on them is
       reporting someone else's defect every run. */
    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.page button[aria-expanded]'))
        .map(el => el.getBoundingClientRect().height));
    ok('all ' + boxes.length + ' disclosure toggles meet the 44px touch floor',
       boxes.length >= 6 && boxes.every(h => h >= 44));

    /* The static harness serves dist/ from `php -S` with no api/config.php, so
       the app's four boot fetches answer 500. That is the fixture, not the
       page — but a genuine JS error still has to fail, so only those four are
       forgiven rather than network errors as a class. */
    const real = errors.filter(e => !/Failed to load resource/.test(e));
    ok('the page renders without a JavaScript error', real.length === 0);
    if (real.length) real.slice(0, 4).forEach(e => console.error('      ' + e));
    /* Checked against the response log rather than the console text, which
       does not carry the URL: anything outside /api/ that failed to load is a
       missing asset this page put on the host, and that is a real defect. */
    const notApi = badLoads.filter(l => !/ \/api\//.test(l));
    ok('every failed request is the un-configured API, not a missing asset',
       notApi.length === 0);
    if (notApi.length) notApi.slice(0, 4).forEach(l => console.error('      ' + l));

    await page.screenshot({ path: path.join(OUT, 'about-desktop.png'), fullPage: true });

    // Phone width — the grids are all auto-fit minmax(), so this is where a
    // fixed two-column layout would show up as a sideways scroll.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await phone.waitForSelector('main', { timeout: 15000 });
    await phone.evaluate(() => window.__navigate('about'));
    await phone.waitForSelector('[data-screen-label="About NGGC"]', { timeout: 15000 });
    /* Measured on <body>, not <html>. A global `overflow-x: hidden` pins
       documentElement.scrollWidth to the viewport width, so the obvious check
       passes while content sits clipped off the side of the screen — which is
       worse than a scrollbar, because a phone reader cannot reach it at all.
       This page shipped four hard two-column grids past that check once. */
    const over = await phone.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const strays = Array.from(document.querySelectorAll('.page *'))
        .filter(el => el.getBoundingClientRect().right > w + 1).length;
      return { body: document.body.scrollWidth, view: w, strays };
    });
    ok('nothing is clipped off the side at 390px (body ' + over.body + 'px, '
       + over.strays + ' stray elements)', over.body <= over.view + 1 && over.strays === 0);
    await phone.screenshot({ path: path.join(OUT, 'about-phone.png'), fullPage: true });

    console.log('  → tests/screens/about-desktop.png, about-phone.png');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
}

(async () => {
  doctrineSuite();
  registrationSuite();
  await renderSuite();
  console.log('\n' + (fail ? '❌ FAIL' : '✅ PASS') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
