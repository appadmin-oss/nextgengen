/* Lite mode (owner, 7 Nov 2026: "the site cannot run on low end devices … create a lite version").
 * Against the real build:
 *   1. an ordinary device is not put into Lite;
 *   2. a low-end device (≤ 2 GB reported) is, BEFORE first paint, and the page still draws with no error;
 *   3. in Lite, animations finish instantly (so nothing that fades in is left invisible) and blur is off;
 *   4. the visitor's own choice beats the automatic one, both ways;
 *   5. the Accessibility panel offers the switch, and says when it is on automatically.
 *   node build.js && node tests/lite-mode.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const ok = (label, cond, extra) => { if (cond) { passed++; console.log('  ✓ ' + label); } else { failed++; console.log('  ✗ FAIL: ' + label + (extra ? '\n      ' + extra : '')); } };

(async () => {
  const dist = path.join(ROOT, 'dist');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-lite-'));
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
    // memory: the GB the device reports, or null for an ordinary one; pref: the stored choice.
    const open = async (memory, pref) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript(([m, p]) => {
        if (m !== null) Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => m, configurable: true });
        Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8, configurable: true });
        if (p !== undefined) localStorage.setItem('ngg.a11y', JSON.stringify({ lite: p }));
        // What the head script decided, before any app code could change it.
        document.addEventListener('DOMContentLoaded', () => { window.__liteAtPaint = document.documentElement.getAttribute('data-lite'); });
      }, [memory, pref]);
      const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await page.waitForFunction(() => { const r = document.getElementById('root'); return r && r.children.length; }, null, { timeout: 60000 }).catch(() => errs.push('never drew'));
      return { ctx, page, errs };
    };

    let t = await open(8);
    ok('an ordinary device is not put into Lite', await t.page.evaluate(() => document.documentElement.getAttribute('data-lite')) === 'off');
    await t.ctx.close();

    t = await open(1);
    ok('a low-end device (1 GB) is in Lite before first paint', await t.page.evaluate(() => window.__liteAtPaint) === 'on' && await t.page.evaluate(() => document.documentElement.getAttribute('data-lite')) === 'on');
    ok('…and the home page still draws, with no error', t.errs.length === 0, t.errs.join(' | '));
    const css = await t.page.evaluate(() => {
      const el = document.createElement('div'); el.style.cssText = 'animation: spin 2s infinite; transition: opacity 1s; backdrop-filter: blur(8px)';
      document.body.appendChild(el); const c = getComputedStyle(el);
      const r = { a: c.animationDuration, n: c.animationIterationCount, t: c.transitionDuration, b: c.backdropFilter }; el.remove(); return r;
    });
    ok('in Lite, animations and transitions finish instantly (an element that fades in still arrives) and blur is off',
      parseFloat(css.a) < 0.001 && css.n === '1' && parseFloat(css.t) < 0.001 && (css.b === 'none' || css.b === ''), JSON.stringify(css));
    await t.page.locator('.a11y-nav-btn').first().click().catch(() => {});
    const panel = await t.page.locator('.a11y-settings').first().innerText().catch(() => '');
    ok('the Accessibility panel offers Lite mode and says it is on automatically for this device', /Lite mode/.test(panel) && /on automatically for this device/.test(panel), panel.slice(0, 200));
    await t.ctx.close();

    t = await open(1, false);
    ok('a visitor who switched Lite OFF keeps it off, even on a low-end device', await t.page.evaluate(() => document.documentElement.getAttribute('data-lite')) === 'off');
    await t.ctx.close();
    t = await open(8, true);
    ok('a visitor who switched Lite ON gets it on any device', await t.page.evaluate(() => window.__liteAtPaint) === 'on');
    await t.ctx.close();
  } catch (e) {
    ok('the Lite mode check ran', false, String(e && e.stack || e).slice(0, 400));
  } finally {
    if (browser) await browser.close();
    try { process.kill(-server.pid); } catch (_) {}
  }
  console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (lite mode)`);
  process.exit(failed ? 1 : 0);
})();
