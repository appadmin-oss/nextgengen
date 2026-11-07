/* The production build ships two bundles (build.js MORE): the public site, and
 * everything behind a sign-in. A public visitor must never download the
 * second, and nothing may break because it is not there.
 *
 *  1. STATIC: a core file may name something the second bundle defines only
 *     where that is reached at run time on a signed-in route, or behind a
 *     `typeof X === "function"` guard. Each such name is listed below with its
 *     reason; a new one fails here, so somebody decides rather than finds out
 *     in production.
 *  2. IN A BROWSER, against dist/: every route of the registry. A public route
 *     renders without fetching the second bundle; a signed-in route fetches it
 *     and renders; no route throws.
 *
 *   node build.js && node tests/bundle-split.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const ok = (label, cond, extra) => { if (cond) { passed++; console.log('  ✓ ' + label); } else { failed++; console.log('  ✗ FAIL: ' + label + (extra ? '\n      ' + extra : '')); } };

/* ── 1. Static ─────────────────────────────────────────────────────────── */
const buildSrc = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
const ORDER = [...buildSrc.match(/const ORDER = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
// Which file went where is the build's own record, not a re-reading of its rules.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-manifest.json'), 'utf8'));
const MORE_LIST = new Set((manifest.more && manifest.more.list) || []);
const isMore = f => MORE_LIST.has(f);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
const text = {}, decl = {};
for (const f of ORDER) {
  const t = strip(fs.readFileSync(path.join(ROOT, f), 'utf8')); text[f] = t;
  decl[f] = new Set([...t.matchAll(/^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
}
const core = ORDER.filter(f => !isMore(f)), more = ORDER.filter(isMore);
ok('the split moves the signed-in areas out of what a public visitor loads', more.length >= 30 && core.includes('app.jsx') && core.includes('page-home.jsx'));
const coreNames = new Set(); core.forEach(f => decl[f].forEach(n => coreNames.add(n)));
const moreNames = new Set(); more.forEach(f => decl[f].forEach(n => { if (!coreNames.has(n) && n.length >= 4) moreNames.add(n); }));
/* Names a core file may mention, and why that is safe. */
const ALLOWED = {
  // app.jsx: the route map, behind thunks; NggChunkGate loads the bundle first (NGG_MORE_ROUTES).
  ControlRoomPage: 'route', IdCardStudioPage: 'route', MentorHome: 'route', InstructorHome: 'route', FamilyPage: 'route', DesignerPage: 'route',
  crPalettePages: 'typeof guard in command.jsx',
  CurriculumEditor: 'staff lesson form, staff routes only; NggChunkGate loads and redraws',
  Mp9Portal: 'typeof guard; dashboard is in NGG_MORE_ROUTES', mp9Speakable: 'typeof guard', mp9AsgState: 'typeof guard',
  Cm3App: 'typeof guard; community is in NGG_MORE_ROUTES', cm3DocUrl: 'inside the community app (community route)',
  SummerAdminPortal: 'summer-admin route (NGG_MORE_ROUTES); the chunk gate loads it first', ClubAdminPortal: 'club-admin route (NGG_MORE_ROUTES); the chunk gate loads it first',

};
const found = {};
for (const f of core) for (const n of moreNames) {
  if (new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(text[f])) (found[n] = found[n] || []).push(f);
}
const unexplained = Object.keys(found).filter(n => !ALLOWED[n]);
ok('every name the public bundle borrows from the signed-in one is listed with its reason', unexplained.length === 0,
  unexplained.map(n => n + ' ← ' + found[n].join(', ')).join('\n      '));
const stale = Object.keys(ALLOWED).filter(n => !found[n]);
ok('…and the list names nothing that is no longer borrowed', stale.length === 0, stale.join(', '));

/* ── 2. In a browser, against the real build ───────────────────────────── */
(async () => {
  const dist = path.join(ROOT, 'dist');
  const meta = (fs.readFileSync(path.join(dist, 'index.html'), 'utf8').match(/name="ngg-more" content="([^"]+)"/) || [])[1];
  ok('the production page says where the signed-in bundle is, and loads only the public one', !!meta && fs.existsSync(path.join(dist, meta))
    && !/<script[^>]+app-more/.test(fs.readFileSync(path.join(dist, 'index.html'), 'utf8')));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-split-'));
  const router = path.join(tmp, 'router.php');
  fs.writeFileSync(router, `<?php $p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH); $f = ${JSON.stringify(dist)} . $p;
if ($p !== '/' && is_file($f)) return false;
if (preg_match('#^/api/#', $p)) { http_response_code(503); header('Content-Type: application/json'); echo '{"ok":false,"error":"offline"}'; return true; }
readfile(${JSON.stringify(dist)} . '/index.html');`);
  const PORT = 8000 + Math.floor(Math.random() * 900);
  const BASE = 'http://127.0.0.1:' + PORT;
  const server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', dist, router], { detached: true, stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(BASE);
    const pw = require('playwright-core');
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await pw.chromium.launch(d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [], wire = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    page.on('request', r => wire.push(r.url()));
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof pathForPage === 'function' && typeof ROUTES !== 'undefined', null, { timeout: 60000 });
    const routes = await page.evaluate(() => ROUTES.filter(r => r.addressable !== false).map(r => ({ id: r.id, path: pathForPage(r.id) })));
    const needs = await page.evaluate(() => NGG_MORE_ROUTES);
    const bad = [], leaked = [], missing = [];
    for (const r of routes) {
      const p = await ctx.newPage(); const e = [], w = [];
      p.on('pageerror', x => e.push(String(x).slice(0, 160))); p.on('request', x => w.push(x.url()));
      await p.goto(BASE + r.path, { waitUntil: 'load' });
      await p.waitForFunction(() => { const el = document.getElementById('root'); return el && el.children.length && !document.querySelector('.ngg-chunk-wait[role=status]'); }, null, { timeout: 45000 }).catch(() => e.push('never drew'));
      await p.waitForTimeout(600);
      const fetched = w.some(u => /app-more\./.test(u));
      if (e.length) bad.push(r.id + ': ' + e[0]);
      if (!needs.includes(r.id) && fetched) leaked.push(r.id);
      if (needs.includes(r.id) && !fetched) missing.push(r.id);
      await p.close();
    }
    ok('every route draws from the production build with no error (' + routes.length + ' routes)', bad.length === 0, bad.join('\n      '));
    ok('a public route never downloads the signed-in bundle', leaked.length === 0, 'fetched it: ' + leaked.join(', '));
    ok('…and a signed-in route fetches it before it draws', missing.length === 0, 'did not: ' + missing.join(', '));
    ok('the home page itself downloaded nothing it does not use', !wire.some(u => /app-more\./.test(u)) && errs.length === 0, errs.join(' | '));
  } catch (e) {
    ok('browser run', false, String(e && e.stack || e).slice(0, 400));
  } finally {
    if (browser) await browser.close();
    try { process.kill(-server.pid); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (bundle split)` : `✅ PASS: ${passed} passed, 0 failed (bundle split)`));
  process.exit(failed ? 1 : 0);
})();
