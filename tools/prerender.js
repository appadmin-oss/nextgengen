#!/usr/bin/env node
/* Prerender each public page's first screen (docs/PERFORMANCE.md, "first paint").
 *
 *   node tools/prerender.js            (build.js runs it at the end; NGG_PRERENDER=0 skips it)
 *
 * Why: the shell's #root was empty, so a phone painted nothing of the page until ~1.6 MB of script had arrived
 * and run — the whole of the wait on a low-end phone. PROXX's (web.dev) biggest first-paint win was the same
 * move. The host has no Node and no headless browser, so the snapshot is taken here, at build time, by the real
 * app in Chromium — never a second rendering of any page (CLAUDE.md §7, one renderer).
 *
 * How:
 *   - dist/ is served exactly as built, and every /api/ request is HELD OPEN: data areas are captured in the
 *     loading state a first visitor genuinely sees, never as stale content or as an error;
 *   - each indexable route in routes.json (the one registry) is opened at a phone's width, anonymous, no saved
 *     preferences, and #root's markup is saved to dist/prerender/<id>.html;
 *   - the home page's goes straight into dist/index.html between <!--ngg-pre--> markers (DirectoryIndex serves
 *     it for "/"); api/public/spa.php puts each other page's own snapshot there, and empties it for anything else.
 * React's createRoot clears #root on its first render and draws the same screen, so the swap is not seen.
 *
 * Skipped with a notice — never a failed build — when Chromium or playwright-core is missing.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MAX_BYTES = 300 * 1024;          // a snapshot bigger than this costs more to send than it saves
const SETTLE_MS = 1500;                // after the app has drawn, for fonts and late layout
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const MARK = /<!--ngg-pre-->[\s\S]*?<!--\/ngg-pre-->/;

function findChromium() {
  return process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome']
    .find(f => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } });
}

/** Strip what must not be frozen into a static page: scripts, the app's own transient attributes. */
function clean(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s(data-reactroot|data-ngg-live)="[^"]*"/g, '')
    .trim();
}

/** A skipped run leaves no snapshot behind: the shell was rebuilt without one, and an old snapshot (or its CSS) served by
 *  spa.php would be last build's page painted under this build's app. */
function skip(why, msg) {
  fs.rmSync(path.join(DIST, 'prerender'), { recursive: true, force: true });
  console.log('[prerender] skipped: ' + msg);
  return { skipped: why };
}

async function run() {
  const routesFile = path.join(ROOT, 'routes.json');
  if (!fs.existsSync(path.join(DIST, 'index.html')) || !fs.existsSync(routesFile)) return skip('no_build', 'build first');
  let chromium;
  try { ({ chromium } = require('playwright-core')); } catch (_) { return skip('no_playwright', 'playwright-core not installed'); }
  const exe = findChromium();
  const routes = JSON.parse(fs.readFileSync(routesFile, 'utf8')).filter(r => r.index);

  // The template is the built shell with the marker emptied, so a re-run never snapshots a snapshot.
  const shell = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').replace(MARK, '<!--ngg-pre--><!--/ngg-pre-->');
  const held = [];
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url.startsWith('/api/')) { held.push(res); return; }          // the loading state, not an answer
    let file = path.join(DIST, url);
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    if (url === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(shell); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
  } catch (e) {
    server.close();
    return skip('no_chromium', 'no Chromium (' + String(e.message || e).split('\n')[0] + ')');
  }
  const outDir = path.join(DIST, 'prerender');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const done = {}, refused = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    for (const r of routes) {
      const page = await ctx.newPage();
      const pathFor = r.id === 'home' ? '/' : '/' + r.id;
      try {
        await page.goto(base + pathFor, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => { const el = document.getElementById('root'); return el && el.children.length > 0; }, null, { timeout: 60000 });
        await page.waitForTimeout(SETTLE_MS);
        const html = clean(await page.evaluate(() => document.getElementById('root').innerHTML));
        // A page that drew its not-found or an error screen is not worth freezing.
        if (/Page not found|Something went wrong/i.test(html.slice(0, 4000))) { refused[r.id] = 'error_screen'; continue; }
        if (Buffer.byteLength(html) > MAX_BYTES) { refused[r.id] = 'too_big'; continue; }
        fs.writeFileSync(path.join(outDir, r.id + '.html'), html);
        done[r.id] = Buffer.byteLength(html);
      } catch (e) {
        refused[r.id] = String(e.message || e).split('\n')[0].slice(0, 80);
      } finally { await page.close(); }
    }
  } finally {
    for (const res of held) { try { res.destroy(); } catch (_) {} }
    await browser.close(); server.close();
  }
  // The home page's snapshot lives in index.html itself ("/" is served by DirectoryIndex, not spa.php).
  if (done.home) {
    const idx = path.join(DIST, 'index.html');
    fs.writeFileSync(idx, shell.replace(MARK, '<!--ngg-pre-->' + fs.readFileSync(path.join(outDir, 'home.html'), 'utf8') + '<!--/ngg-pre-->'));
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), pages: done, refused }, null, 1));
  const kb = Object.values(done).reduce((a, b) => a + b, 0) / 1024;
  console.log(`[prerender] ${Object.keys(done).length} page(s) prerendered (${kb.toFixed(0)} KB)` + (Object.keys(refused).length ? `; not: ${Object.entries(refused).map(([k, v]) => k + ' (' + v + ')').join(', ')}` : ''));
  return { done, refused };
}

module.exports = { run, MARK };
if (require.main === module) run().catch(e => { console.error('[prerender] failed:', e); process.exit(1); });
