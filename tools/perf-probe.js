#!/usr/bin/env node
/* Performance probe: how the built site feels on a low-end phone (docs/PERFORMANCE.md).
 *
 *   node tools/perf-probe.js [path ...]        default: /  /club  /join
 *
 * Serves dist/ the way the host does — the SPA fallback, gzip or Brotli negotiated from Accept-Encoding,
 * and the precompressed .br/.gz files beside each asset when they exist (as dist/.htaccess serves them) —
 * then loads each page in Chromium emulating a low-end Android phone: CPU slowed 6×, 1.6 Mbps down,
 * 750 kbps up, 150 ms round trip. API calls are answered with an empty failure, as on a first visit
 * offline, so the numbers are the front end's alone.
 *
 * Prints, per page: first paint, first contentful paint, largest contentful paint, when the app had
 * drawn (#root has a child the app made), bytes over the wire, requests, and the long tasks (>50 ms)
 * that are what a person feels as lag. Cold cache, then warm (a repeat visit).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const COMPRESSIBLE = /\.(html|js|css|json|svg|webmanifest)$/;

function serve(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"ok":false,"error":"offline"}'); }
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(path.join(file, 'index.html')) ? path.join(file, 'index.html') : path.join(DIST, 'index.html');
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
  /* As api/public/spa.php: a page other than home gets its OWN prerendered first screen (or none), never the home
     page's that index.html carries. "/" is index.html as built. */
  if (file === path.join(DIST, 'index.html') && url !== '/' && url !== '/index.html') {
    const seg = url.split('/').filter(Boolean)[0] || '';
    const snapFile = path.join(DIST, 'prerender', seg + '.html');
    const snap = /^[a-z0-9-]+$/.test(seg) && fs.existsSync(snapFile) ? fs.readFileSync(snapFile, 'utf8') : '';
    const cssFile = path.join(DIST, 'prerender', seg + '.css');
    const css = snap && fs.existsSync(cssFile) ? fs.readFileSync(cssFile, 'utf8') : '';
    const html = fs.readFileSync(file, 'utf8').replace(/<!--ngg-pre-->[\s\S]*?<!--\/ngg-pre-->/, () => '<!--ngg-pre-->' + snap + '<!--/ngg-pre-->')
      .replace(/<style id="ngg-critical">[\s\S]*?<\/style>/, () => '<style id="ngg-critical">' + css + '</style>');
    const ae2 = String(req.headers['accept-encoding'] || '');
    const buf = Buffer.from(html);
    const enc = /\bbr\b/.test(ae2) ? ['br', zlib.brotliCompressSync(buf)] : /\bgzip\b/.test(ae2) ? ['gzip', zlib.gzipSync(buf)] : [null, buf];
    res.writeHead(200, Object.assign({ 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }, enc[0] ? { 'Content-Encoding': enc[0] } : {}));
    return res.end(enc[1]);
  }
  if (/\.[0-9a-f]{10}\./.test(path.basename(file))) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else headers['Cache-Control'] = ext === '.html' ? 'no-cache' : 'public, max-age=604800';
  const ae = String(req.headers['accept-encoding'] || '');
  let body;
  if (COMPRESSIBLE.test(file) && /\bbr\b/.test(ae)) {
    body = fs.existsSync(file + '.br') ? fs.readFileSync(file + '.br') : zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
    headers['Content-Encoding'] = 'br';
  } else if (COMPRESSIBLE.test(file) && /\bgzip\b/.test(ae)) {
    body = fs.existsSync(file + '.gz') ? fs.readFileSync(file + '.gz') : zlib.gzipSync(fs.readFileSync(file), { level: 6 });
    headers['Content-Encoding'] = 'gzip';
  } else body = fs.readFileSync(file);
  headers.Vary = 'Accept-Encoding';
  res.writeHead(200, headers); res.end(body);
}

async function measure(browser, base, route, warmCtx) {
  const ctx = warmCtx || await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 10; Low-end) Mobile' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  let bytes = 0, reqs = 0;
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; reqs++; });
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, long: [], drawn: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.long.push(e.duration); }).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(base + route, { waitUntil: 'load', timeout: 120000 });
  // "Drawn": the app has replaced or filled #root with something it made (the boot marker is set by app.jsx).
  await page.waitForFunction(() => window.__nggBooted || (document.getElementById('root') && document.getElementById('root').querySelector('[data-screen-label], main, nav, header')), null, { timeout: 120000 }).catch(() => {});
  const drawnWall = Date.now() - t0;
  await page.waitForTimeout(1500);
  const p = await page.evaluate(() => {
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime]));
    return { fp: paint['first-paint'] || 0, fcp: paint['first-contentful-paint'] || 0, lcp: window.__perf.lcp, long: window.__perf.long };
  });
  await page.close();
  if (!warmCtx) await ctx.close();
  const longTotal = p.long.reduce((a, b) => a + b, 0);
  return { route, fp: p.fp, fcp: p.fcp, lcp: p.lcp, drawn: drawnWall, kb: Math.round(bytes / 1024), reqs, longCount: p.long.length, longMax: Math.round(Math.max(0, ...p.long)), longTotal: Math.round(longTotal) };
}

(async () => {
  const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/club', '/join'];
  const server = http.createServer(serve);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const { chromium } = require('playwright-core');
  const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome'].find(f => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } });
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const s = ms => (ms / 1000).toFixed(1) + ' s';
  const out = [];
  try {
    for (const r of routes) {
      const cold = await measure(browser, base, r);
      // Warm: the same browser context visited once already (a returning visitor).
      const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 1 });
      const pg = await ctx.newPage(); await pg.goto(base + r, { waitUntil: 'load' }); await pg.waitForTimeout(800); await pg.close();
      const warm = await measure(browser, base, r, ctx);
      await ctx.close();
      out.push({ cold, warm });
      console.log(`${r.padEnd(8)} cold: FCP ${s(cold.fcp)}  LCP ${s(cold.lcp)}  app drawn ${s(cold.drawn)}  ${cold.kb} KB / ${cold.reqs} req  long tasks ${cold.longCount} (max ${cold.longMax} ms, total ${cold.longTotal} ms)`);
      console.log(`${''.padEnd(8)} warm: FCP ${s(warm.fcp)}  LCP ${s(warm.lcp)}  app drawn ${s(warm.drawn)}  ${warm.kb} KB / ${warm.reqs} req`);
    }
  } finally { await browser.close(); server.close(); }
  if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
