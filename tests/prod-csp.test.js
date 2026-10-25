#!/usr/bin/env node
/* The production Content-Security-Policy, held in a real browser.
 *
 * dist/.htaccess carries a script-src with no 'unsafe-inline' and no
 * 'unsafe-eval' — each inline script and handler allowed by its hash, written
 * by build.js (writeProductionCsp). php -S does not read .htaccess, so the
 * header is applied here exactly as Apache would send it, and the built site
 * is booted under it. A single violation fails the suite: a hash that went
 * stale with an edit, a new inline script, or a vendor that turns out to need
 * eval would each be a blank or broken page on the live host.
 *
 * Also held: the deploy ships no source map and no PHP test suite.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.CSP_PORT || '8311';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(DIST, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-csp-'));

let passed = 0, failed = 0, server, browser;
const chk = (label, ok, extra) => { if (ok) { passed++; console.log('  ✓ ' + label); } else { failed++; console.log('  ✗ ' + label + (extra ? ' — ' + extra : '')); } };

function loadChromium() { try { return require('playwright-core').chromium; } catch (_) { try { return require('playwright').chromium; } catch (__) { return null; } } }

(async () => {
  const ht = fs.readFileSync(path.join(DIST, '.htaccess'), 'utf8');
  const CSP = ((ht.match(/Content-Security-Policy "([^"]+)"/) || [])[1] || '').replace(/\\\n/g, ' ').replace(/\s+/g, ' ');
  const scriptSrc = (CSP.match(/script-src ([^;]+);/) || [])[1] || '';
  chk('the production script-src has no unsafe-inline and no unsafe-eval', scriptSrc !== '' && !/unsafe-inline|unsafe-eval/.test(scriptSrc), scriptSrc.slice(0, 80));
  chk('…and the development .htaccess still allows them (in-browser Babel needs both)',
      /script-src 'self' 'unsafe-inline' 'unsafe-eval';/.test(fs.readFileSync(path.join(ROOT, '.htaccess'), 'utf8')));
  const maps = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.map$/.test(e.name)) maps.push(path.relative(DIST, p)); } };
  walk(DIST);
  chk('the deploy ships no source map', maps.length === 0, maps.slice(0, 3).join(', '));
  chk('…and no bundle points at one', !fs.readdirSync(DIST).filter(f => /\.min\.js$/.test(f)).some(f => /sourceMappingURL/.test(fs.readFileSync(path.join(DIST, f), 'utf8'))));
  chk('the deploy ships no PHP test suite', !fs.existsSync(path.join(DIST, 'api', 'tests')));

  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  browser half skipped (playwright not installed)'); return finish(); }
  if (fs.existsSync(CFG)) { console.error('dist/api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(path.join(TMP, 'ngg.db'))}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'prod_csp_secret_0123456789abcdefghij',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', DIST], { cwd: DIST, detached: true, stdio: 'ignore' });
    await waitForServer(BASE + '/index.html');
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const ctx = await browser.newContext();
    await ctx.route(u => String(u).startsWith(BASE), async route => {
      const r = await route.fetch();
      if (!/text\/html/.test(r.headers()['content-type'] || '')) return route.fulfill({ response: r });
      return route.fulfill({ response: r, headers: Object.assign({}, r.headers(), { 'content-security-policy': CSP }) });
    });
    // Google Fonts answered locally, so the stylesheet loads and its onload handler gets the chance to run.
    await ctx.route(u => String(u).startsWith('https://fonts.googleapis.com/'), route => route.fulfill({ status: 200, contentType: 'text/css', body: '/* test */' }));
    // Every violation the page sees, script or otherwise, from the first byte.
    await ctx.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline') + ' ' + (e.sample || '')));
    });
    const visit = async (url, label, boot) => {
      const page = await ctx.newPage();
      const console_ = [];
      page.on('console', m => { if (/Content Security Policy/i.test(m.text())) console_.push(m.text().slice(0, 160)); });
      await page.goto(BASE + url, { waitUntil: 'load' });
      if (boot) await boot(page);
      await page.waitForTimeout(800);
      const v = await page.evaluate(() => window.__csp || []);
      chk(label + ': no CSP violation', v.length === 0 && console_.length === 0, (v[0] || console_[0] || ''));
      return page;
    };
    const home = await visit('/', 'the home page boots under the production CSP', p => waitForBoot(p));
    chk('…and the inline a11y script ran (it is allowed by its hash, not by unsafe-inline)',
        await home.evaluate(() => document.documentElement.getAttribute('data-contrast') !== null));
    chk('…and the fonts stylesheet\'s onload handler ran (unsafe-hashes)',
        await home.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet][href*="fonts.googleapis"]')].every(l => l.media === 'all')));
    await visit('/journal/', 'the Anchor Journal shell');
    await visit('/timetable-about.html', 'the Timetable Maker landing');
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    try { if (server) process.kill(-server.pid); } catch (_) {}
    try { fs.unlinkSync(CFG); } catch (_) {}
  }
  finish();
})().catch(e => { console.log('  ✗ harness error: ' + e.message); failed++; try { fs.unlinkSync(CFG); } catch (_) {} try { if (server) process.kill(-server.pid); } catch (_) {} finish(); });

function finish() {
  console.log(failed ? `❌ FAIL: ${passed} passed, ${failed} failed (production CSP)` : `✅ PASS: ${passed} passed, 0 failed (production CSP)`);
  process.exit(failed ? 1 : 0);
}
