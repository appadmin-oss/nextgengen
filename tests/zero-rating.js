#!/usr/bin/env node
/* ============================================================================
   What this service costs a learner in data, and who it talks to.
   Run:  npm run zero-rating

   WHY IT EXISTS. A mobile operator asked to zero-rate an educational service
   wants two things, and neither of them is an adjective:

     1. The hostnames to whitelist. Zero-rating is implemented by matching
        traffic — SNI, or a proxy rule — so every extra host is a separate
        agreement and a separate thing to go wrong. A learner on free data
        whose fonts, icons or scripts come from a host nobody whitelisted
        either pays for them or waits for a timeout, and cannot tell which.

     2. What a session costs, in bytes. "Lightweight" is not a number an
        operator can put in a contract.

   So this measures rather than claims. It serves the production build,
   loads it in a real browser with an empty cache, and records every request:
   where it went, what it weighed, and what it was. It then reloads with the
   cache warm, because the number that matters for a weekly lesson is the
   SECOND visit, not the first.

   It fails if the app reaches any host but its own. That is the promise
   docs/ZERO-RATING.md makes on the programme's behalf, and a promise nobody
   checks is a promise that quietly stops being true the first time somebody
   adds a CDN link.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.ZR_PORT || 8311);
const BASE = 'http://127.0.0.1:' + PORT;

/* A first visit has to carry the whole app; a second should carry almost
   nothing. These are the budgets the programme holds itself to — raise them
   deliberately, in a commit that says why, or not at all. */
const BUDGET_FIRST_KB = 2600;
const BUDGET_REPEAT_KB = 120;

const TYPES = [
  ['script', /\.js(\?|$)/i],
  ['style', /\.css(\?|$)/i],
  ['font', /\.(woff2?|ttf|otf)(\?|$)/i],
  ['image', /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i],
  ['document', /(\/$|\.html?(\?|$))/i],
];
const kindOf = (u) => (TYPES.find(([, re]) => re.test(u)) || ['other'])[0];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
};

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let passed = 0, failed = 0;
const chk = (m, cond, extra) => {
  if (cond) { passed++; console.log('  ✓ ' + m); }
  else { failed++; console.error('  ✗ FAIL: ' + m + (extra ? '\n      ' + extra : '')); }
};
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  zero-rating: skipped (playwright not installed)'); process.exit(0); }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('✗ dist/index.html is missing — run `node build.js` first.');
    process.exit(1);
  }

  /* The production build, served the way the host serves it: the SPA
     fallback included, because a deep link is how most lessons are opened. */
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(String(req.url).split('?')[0]);
    let file = path.join(DIST, url);
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const index = path.join(file, 'index.html');
      file = fs.existsSync(index) ? index : path.join(DIST, 'index.html');
    }
    let body = fs.readFileSync(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'content-type': type, 'cache-control': 'public, max-age=31536000' };
    /* Compressed, because the host compresses (.htaccess, mod_deflate).
       Measuring the uncompressed bytes would overstate what a learner
       actually pays by a factor of three and make the budget meaningless. */
    const squash = /^(text\/|application\/(javascript|json|manifest))|image\/svg/.test(type);
    if (squash && /gzip/.test(String(req.headers['accept-encoding'] || ''))) {
      body = zlib.gzipSync(body, { level: 6 });
      head['content-encoding'] = 'gzip';
    }
    head['content-length'] = String(body.length);
    res.writeHead(200, head);
    res.end(body);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  try {
    /* TWO PASSES, because one cannot answer both questions.
       Playwright's request interception disables the browser cache, so a
       pass that ABORTS off-origin requests can prove the whitelist claim
       but reports every repeat visit as a cold one. Measuring bytes needs
       the cache; proving isolation needs the interception. So: pass one
       watches who is talked to, pass two weighs what is carried. */
    const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
    const localMedia = () => { window.NGG_LOCAL_MEDIA = true; };

    // ── Pass 1: who does it talk to? ────────────────────────────────────
    const offsite = [];
    {
      const ctx = await browser.newContext(mobile);
      await ctx.addInitScript(localMedia);
      await ctx.route(u => !String(u).startsWith(BASE), route => {
        offsite.push(route.request().url().slice(0, 120));
        return route.abort();
      });
      const p1 = await ctx.newPage();
      for (const url of ['/', '/about', '/join', '/dashboard']) {
        await p1.goto(BASE + url, { waitUntil: 'load' });
        await p1.waitForTimeout(1200);
      }
      await ctx.close();
    }

    // ── Pass 2: what does it weigh? ─────────────────────────────────────
    const seen = [];
    let firstTotal = 0, repeatTotal = 0, firstCount = 0;
    {
      const ctx = await browser.newContext(mobile);
      await ctx.addInitScript(localMedia);
      ctx.on('requestfinished', async (r) => {
        const u = r.url();
        if (!u.startsWith(BASE)) return;
        let bytes = 0;
        try {
          const sz = await r.sizes();
          // transferSize counts the headers too, and is 0 from cache —
          // which is exactly what a learner's bill reflects.
          bytes = Number(sz.responseBodySize) || 0;
          if (Number(sz.responseHeadersSize)) bytes += Number(sz.responseHeadersSize);
        } catch (_) {}
        seen.push({ url: u.slice(BASE.length), bytes, kind: kindOf(u) });
      });
      const p2 = await ctx.newPage();
      await p2.goto(BASE + '/', { waitUntil: 'load' });
      await p2.waitForTimeout(2500);
      const first = seen.slice();
      firstTotal = first.reduce((n, r) => n + r.bytes, 0);
      firstCount = first.length;
      var byKind = {};
      for (const r of first) byKind[r.kind] = (byKind[r.kind] || 0) + r.bytes;
      var heavy = first.filter(r => r.bytes > 120 * 1024).sort((x, y) => y.bytes - x.bytes);

      /* A second visit, as one page load. Next Saturday's open, not a
         reload — a reload revalidates, which is not what anybody does. */
      await p2.goto(BASE + '/about', { waitUntil: 'load' });
      await p2.waitForTimeout(800);
      seen.length = 0;
      await p2.goto(BASE + '/', { waitUntil: 'load' });
      await p2.waitForTimeout(2000);
      repeatTotal = seen.reduce((n, r) => n + r.bytes, 0);
      await ctx.close();
    }

    console.log('\n── Who it talks to ───────────────────────────────────────────');
    chk('across the home, about, join and dashboard pages it reaches no host but its own'
        + (offsite.length ? ' — reached ' + offsite.length : ''),
        offsite.length === 0, [...new Set(offsite)].slice(0, 5).join('\n      '));

    console.log('\n── What a learner pays for (gzipped, as the host serves) ─────');
    for (const [k, v] of Object.entries(byKind).sort((x, y) => y[1] - x[1])) {
      console.log('     ' + k.padEnd(10) + kb(v).padStart(10));
    }
    console.log('     ' + '─'.repeat(20));
    console.log('     ' + 'first'.padEnd(10) + kb(firstTotal).padStart(10) + '   (' + firstCount + ' requests)');
    console.log('     ' + 'repeat'.padEnd(10) + kb(repeatTotal).padStart(10));

    chk('a first visit fits the budget (' + BUDGET_FIRST_KB + ' KB)', firstTotal <= BUDGET_FIRST_KB * 1024, kb(firstTotal));
    chk('a repeat visit fits the budget (' + BUDGET_REPEAT_KB + ' KB) — the number that matters weekly',
        repeatTotal <= BUDGET_REPEAT_KB * 1024, kb(repeatTotal));

    if (heavy.length) {
      console.log('\n   heaviest single files:');
      heavy.slice(0, 6).forEach(r => console.log('     ' + kb(r.bytes).padStart(10) + '  ' + r.url));
    }

    const out = {
      measuredAt: new Date().toISOString().slice(0, 10),
      hostsReached: offsite.length ? [...new Set(offsite)] : [],
      firstVisitBytes: firstTotal,
      repeatVisitBytes: repeatTotal,
      requests: firstCount,
      byKind,
    };
    fs.writeFileSync(path.join(DIST, 'zero-rating.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('\n   wrote dist/zero-rating.json');
  } finally {
    try { await browser.close(); } catch (_) {}
    server.close();
  }

  console.log('\n' + (failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (zero-rating)\n');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
