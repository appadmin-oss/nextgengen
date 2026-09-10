#!/usr/bin/env node
/* ============================================================================
   The route registry — the drift guard app.jsx did not have.

   A route used to be described by four hand-maintained lists that nothing
   compared: PAGE_IDS, a PAGE_META map, OWN_CHROME_PAGES, and a noindexPages
   array buried inside an effect. They drifted, and the drift shipped:

     · /apply (the public Direct Apply sign-up a centre hands to a family) and
       /review were in PAGE_IDS and in the render map but NOT in PAGE_META, so
       both working pages titled their own browser tab, their og:title — every
       shared link preview — and their polite screen-reader route announcement
       "Page not found · NGG".
     · /apply was missing from the noindex list too, so a form asking for a
       child's name, date of birth, photograph and guardian email shipped
       robots: index,follow and a canonical URL, while the desk version of the
       same form (/gate) was correctly noindexed.

   Neither is visible from the render map, from the router, or from a build that
   passes. It is visible from here.

   What this pins, against the REAL production bundle:
     · every page the router can render has a registry row, and every row has a
       page — routeAudit() reports both directions and reports ok
     · every row has a non-empty title, so no route can announce itself as a 404
     · the public intake surfaces are noindexed, and the public marketing pages
       are not
     · Direct Apply specifically: a real title, noindex, own chrome
     · goApply() puts the programme in the URL, so a refresh of the application
       form cannot silently change which programme is being applied to

   Run:  node tests/route-registry.test.js
   Skips with a pass if playwright isn't installed (like the other E2E tests).
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ROUTE_REG_PORT || 8261;
const BASE = 'http://127.0.0.1:' + PORT;
const FIX = path.join(ROOT, 'tests', '_route_registry_fixture.html');

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

/* The registry and its derived tables are top-level `const`s in the bundle, not
   exports — the app is one concatenated classic script. The fixture loads the
   real bundle and copies them onto window, which is the only way to assert on
   the shipped artifact rather than on a re-parse of the source. */
const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>route registry</title>
<link rel="canonical" href="https://next.afrovanguard.org.ng/">
<meta name="description" content="seed">
<meta name="robots" content="index, follow">
<meta property="og:title" content="seed"><meta property="og:description" content="seed">
<meta property="og:url" content="https://next.afrovanguard.org.ng/">
</head><body><div id="root"></div>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script>
<script src="/dist/photos.js"></script>
<script src="/dist/api-client.js"></script>
<script src="/dist/outbox.js"></script>
<script src="/dist/app.min.js"></script>
<script src="/dist/vendor/tanstack-table.min.js"></script>
<script>
  window.__reg = {
    routes: (typeof ROUTES !== 'undefined') ? ROUTES : null,
    pageIds: (typeof PAGE_IDS !== 'undefined') ? PAGE_IDS : null,
    meta: (typeof PAGE_META !== 'undefined') ? PAGE_META : null,
    ownChrome: (typeof OWN_CHROME_PAGES !== 'undefined') ? OWN_CHROME_PAGES : null,
    noindex: (typeof NOINDEX_PAGES !== 'undefined') ? NOINDEX_PAGES : null,
    audit: (typeof routeAudit !== 'undefined') ? routeAudit : null,
    goApply: (typeof goApply !== 'undefined') ? goApply : null,
  };
</script>
</body></html>`;

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  route registry: skipped (playwright not installed)'); process.exit(0); }
  if (!fs.existsSync(path.join(ROOT, 'dist', 'app.min.js'))) {
    console.error('✗ dist/app.min.js missing — run `node build.js` first');
    process.exit(1);
  }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  fs.writeFileSync(FIX, FIXTURE);
  let server, browser;
  try {
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(BASE + '/tests/_route_registry_fixture.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__reg && window.__reg.routes, null, { timeout: 30000 });
    /* The audit and __navigate are published from effects, so the app has to
       have actually MOUNTED — which is the point: a registry that agrees with a
       render map nobody rendered proves nothing. */
    await page.waitForFunction(() => !!window.__routeAudit && !!window.__navigate, null, { timeout: 30000 });

    const reg = await page.evaluate(() => {
      const r = window.__reg;
      return {
        routes: r.routes,
        pageIds: r.pageIds,
        metaKeys: Object.keys(r.meta || {}),
        ownChrome: r.ownChrome,
        noindex: r.noindex,
        hasAudit: typeof r.audit === 'function',
        hasGoApply: typeof r.goApply === 'function',
        /* The router publishes its own audit against the live render map on
           mount. That is the assertion that actually matters: it compares the
           registry with the components the router can put on screen. */
        audit: window.__routeAudit || null,
      };
    });

    console.log('\n── The registry and the render map name the same pages ──────');
    chk('the bundle exposes the route registry', Array.isArray(reg.routes) && reg.routes.length > 0);
    chk('…and the derived tables', Array.isArray(reg.pageIds) && Array.isArray(reg.ownChrome) && Array.isArray(reg.noindex));
    chk('…and routeAudit()', reg.hasAudit);
    chk('the router published its audit on mount', !!reg.audit);
    chk('no page renders without a registry row (' + JSON.stringify((reg.audit || {}).missingRoute || []) + ')',
      !!reg.audit && (reg.audit.missingRoute || []).length === 0);
    chk('no registry row renders nothing (' + JSON.stringify((reg.audit || {}).missingPage || []) + ')',
      !!reg.audit && (reg.audit.missingPage || []).length === 0);
    chk('no duplicate route ids', !!reg.audit && (reg.audit.duplicateIds || []).length === 0);
    chk('the audit reports ok', !!reg.audit && reg.audit.ok === true);

    console.log('\n── Every route can name itself ──────────────────────────────');
    const untitled = (reg.routes || []).filter(r => !r.title || !String(r.title).trim()).map(r => r.id);
    chk('every route has a title (' + JSON.stringify(untitled) + ')', untitled.length === 0);
    const says404 = (reg.routes || []).filter(r => /not found/i.test(String(r.title))).map(r => r.id);
    chk('no route titles itself "not found" (' + JSON.stringify(says404) + ')', says404.length === 0);
    chk('every route id has metadata', (reg.routes || []).every(r => reg.metaKeys.indexOf(r.id) !== -1));

    console.log('\n── Direct Apply, specifically ───────────────────────────────');
    const apply = (reg.routes || []).filter(r => r.id === 'apply')[0];
    chk('/apply is a registered route', !!apply);
    chk('…with a real title, not the 404 fallback',
      !!apply && /apply/i.test(apply.title) && !/not found/i.test(apply.title));
    chk('…addressable, so /apply?g=… resolves rather than 404ing',
      (reg.pageIds || []).indexOf('apply') !== -1);
    chk('…drawing its own chrome (no topnav over a public form)',
      (reg.ownChrome || []).indexOf('apply') !== -1);
    chk('…and NOT indexable — it collects a child\'s identity',
      (reg.noindex || []).indexOf('apply') !== -1);
    const review = (reg.routes || []).filter(r => r.id === 'review')[0];
    chk('/review has a real title too', !!review && !/not found/i.test(review.title));

    console.log('\n── What may and may not be indexed ─────────────────────────');
    // Operational + token-scoped surfaces. Each was verified by hand against
    // the list app.jsx shipped before the registry existed.
    ['dashboard', 'profile', 'admin', 'summer-admin', 'club-admin', 'gate', 'verify',
      'circle', 'mentor', 'certificate', 'review', 'journal-entry', 'apply', 'reshoot',
      'cards', 'designer'].forEach(id => {
      chk('noindex: /' + id, (reg.noindex || []).indexOf(id) !== -1);
    });
    // The public marketing + discovery pages must stay indexable, or the fix
    // above would have quietly delisted the site.
    ['home', 'summer', 'centres', 'club', 'anchor', 'book', 'media', 'parents',
      'volunteers', 'mentors', 'blog', 'contact', 'legal', 'join', 's-status',
      'v-status'].forEach(id => {
      chk('indexed: /' + id, (reg.noindex || []).indexOf(id) === -1);
    });

    console.log('\n── The title actually reaches the document ─────────────────');
    /* The registry being right is half of it. This drives the real router
       through a route change and reads the tab, the share preview and the
       polite announcement — the three places the old bug was visible. */
    const applied = await page.evaluate(async () => {
      window.history.replaceState({}, '', '/apply?g=GL-TEST');
      window.__navigate && window.__navigate('apply');
      await new Promise(r => setTimeout(r, 400));
      return {
        title: document.title,
        og: (document.querySelector('meta[property="og:title"]') || {}).content,
        robots: (document.querySelector('meta[name="robots"]') || {}).content,
        live: (document.getElementById('ngg-route-live') || {}).textContent || '',
        search: window.location.search,
      };
    });
    chk('the browser tab does not say "Page not found" (' + JSON.stringify(applied.title) + ')',
      !/not found/i.test(applied.title || ''));
    chk('…nor does the share preview (' + JSON.stringify(applied.og) + ')',
      !/not found/i.test(applied.og || ''));
    chk('…and robots is noindex (' + JSON.stringify(applied.robots) + ')',
      /noindex/.test(applied.robots || ''));
    chk('the gate parameter survives the route change', /g=GL-TEST/.test(applied.search || ''));

    console.log('\n── An address nobody defined still 404s ────────────────────');
    const nf = await page.evaluate(async () => {
      window.history.replaceState({}, '', '/definitely-not-a-page');
      window.__navigate && window.__navigate('_notfound');
      await new Promise(r => setTimeout(r, 400));
      return { title: document.title, robots: (document.querySelector('meta[name="robots"]') || {}).content };
    });
    chk('an unknown route still titles itself "Page not found"', /not found/i.test(nf.title || ''));

    console.log('\n── The programme lives in the URL, not in a global ─────────');
    const ga = await page.evaluate(async () => {
      const seen = [];
      window.history.replaceState({}, '', '/summer');
      window.__reg.goApply((p) => seen.push(p), 'summer', { centre: 'Ijaiye', track: 'Music' });
      await new Promise(r => setTimeout(r, 60));
      return { url: window.location.pathname + window.location.search, seen, legacy: window.__nggProgram };
    });
    chk('goApply() exists', reg.hasGoApply);
    chk('…and routes to the application form', ga.seen.indexOf('join') !== -1);
    chk('…putting the programme in the address (' + ga.url + ')', /program=summer/.test(ga.url));
    chk('…carrying the centre the applicant clicked', /centre=Ijaiye/.test(ga.url));
    chk('…and the course', /track=Music/.test(ga.url));
    chk('…on the /join path, so a refresh reloads the same form', /^\/join\?/.test(ga.url));

    chk('no uncaught page errors across the run', pageErrors.length === 0);
    if (pageErrors.length) pageErrors.slice(0, 5).forEach(e => console.log('      ' + e.slice(0, 200)));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: harness — ' + (e && e.message ? e.message : e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && server.pid) { try { process.kill(-server.pid); } catch (_) { try { server.kill(); } catch (_) {} } }
    fs.rmSync(FIX, { force: true });
  }

  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (route registry)');
  process.exit(failed ? 1 : 0);
})();
