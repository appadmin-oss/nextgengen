#!/usr/bin/env node
/* ============================================================================
   Focus rings on the public site (styles.css --focus-ring, styles-app.css).

   Walks every Tab stop on the main public pages with the keyboard and checks
   what a keyboard user actually sees:
     · a ring is drawn (on the control, or on the container it sits in);
     · it is at least 3:1 against the surface behind it (WCAG 1.4.11) — the
       gold ring measured 1.3–1.9:1 on cream, and 1:1 on a gold button;
     · focus does not change the control's shape (a global rule once set
       border-radius: 6px on everything focused);
     · it is not cut off by a card that clips its overflow, nor covered.
   A new dark section whose ring comes out navy-on-navy fails here: give it
   the dark-surface class (or add it to the --focus-ring: lime list).

   Run:  node tests/focus-ring.test.js     (PAGES=/,/about to narrow)
   ========================================================================== */
'use strict';
const ROOT = require('path').resolve(__dirname, '..');
process.chdir(ROOT);
const { spawn } = require('child_process');
const { waitForServer, waitForBoot } = require(ROOT + '/tests/_serve');
const { chromiumPath } = require(ROOT + '/tests/_responsive-probe');
const fs = require('fs'), path = require('path'), os = require('os');
const PORT = process.env.FOCUS_PORT || '8341', BASE = 'http://127.0.0.1:' + PORT, CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-focus-'));
const PAGES = (process.env.PAGES || '/,/about,/summer,/parents,/community,/blog,/support,/contact,/join,/timetable,/login').split(',');
const W = Number(process.env.W || 1280), H = Number(process.env.H || 900);
let server, browser;
(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return ['db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(path.join(TMP, 'ngg.db'))}], 'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'focus_probe_secret_0123456789abcdefgh', 'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'maps' => ['offline' => true], 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false];\n`);
  try {
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    browser = await (() => { for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright', ROOT + '/node_modules/playwright-core'].filter(Boolean)) { try { return require(m); } catch (_) {} } return null; })().chromium.launch({ executablePath: chromiumPath(fs) });
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const pg = await ctx.newPage();
    const all = [];
    for (const p of PAGES) {
      await pg.goto(BASE + p, { waitUntil: 'domcontentloaded' });
      await waitForBoot(pg).catch(() => {});
      await pg.waitForTimeout(1500);
      // Remember each focusable's shape before it is focused.
      await pg.evaluate(() => { let i = 0; document.querySelectorAll('a,button,input,select,textarea,summary,[tabindex],[role=button]').forEach(e => { const c = getComputedStyle(e); e.dataset.frId = String(i++); e.dataset.frR = c.borderRadius; e.dataset.frS = c.boxShadow; e.dataset.frO = c.outlineStyle + ' ' + c.outlineWidth; }); });
      await pg.mouse.click(2, H - 2).catch(() => {});
      await pg.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
      const seen = new Set();
      for (let i = 0; i < 70; i++) {
        await pg.keyboard.press('Tab');
        await pg.waitForTimeout(60);
        const r = await pg.evaluate(() => {
          const el = document.activeElement; if (!el || el === document.body) return null;
          const c = getComputedStyle(el);
          const parse = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(x => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
          const lum = ({ r, g, b }) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
          const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const off = parseFloat(c.outlineOffset) || 0;
          let bgEl = off >= 0 ? el.parentElement : el, bg = null, img = false;
          let ringFrom = null;
          while (bgEl) { const bc = getComputedStyle(bgEl); if (bc.backgroundImage && /gradient/.test(bc.backgroundImage)) { const g = parse(bc.backgroundImage); if (g && g.a > 0.5) { bg = g; img = true; break; } } const p = parse(bc.backgroundColor); if (p && p.a > 0.5) { bg = p; break; } bgEl = bgEl.parentElement; }
          bg = bg || { r: 255, g: 255, b: 255, a: 1 };
          let hasOutline = c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 1;
          // A field whose container draws the ring (:focus-within) is ringed by the container.
          let ringBox = null;
          if (!hasOutline) for (let a = el.parentElement, n = 0; a && n < 3; a = a.parentElement, n++) { const ac = getComputedStyle(a); if (ac.outlineStyle !== 'none' && parseFloat(ac.outlineWidth) >= 1) { ringBox = ac; ringFrom = a; break; } }
          // A container's ring is drawn outside the container: measure it against what is behind the container.
          if (ringFrom && (parseFloat(ringBox.outlineOffset) || 0) >= 0) {
            bgEl = ringFrom.parentElement; bg = null;
            while (bgEl) { const bc = getComputedStyle(bgEl); if (bc.backgroundImage && /gradient/.test(bc.backgroundImage)) { const g = parse(bc.backgroundImage); if (g && g.a > 0.5) { bg = g; break; } } const p = parse(bc.backgroundColor); if (p && p.a > 0.5) { bg = p; break; } bgEl = bgEl.parentElement; }
            bg = bg || { r: 255, g: 255, b: 255, a: 1 };
          }
          const shadowChanged = c.boxShadow !== el.dataset.frS && c.boxShadow !== 'none';
          let ratio = null;
          if (hasOutline) { const oc = parse(c.outlineColor); if (oc) ratio = Math.round(cr(over(oc, bg), bg) * 100) / 100; }
          else if (ringBox) { const oc = parse(ringBox.outlineColor); hasOutline = true; if (oc) ratio = Math.round(cr(over(oc, bg), bg) * 100) / 100; }
          const rect = el.getBoundingClientRect(); const pad = off + (parseFloat(c.outlineWidth) || 0);
          let clipped = '';
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const ac = getComputedStyle(a); if (/hidden|clip|auto|scroll/.test(ac.overflowX + ac.overflowY)) { const ar = a.getBoundingClientRect();
              if (rect.left - pad < ar.left - 0.5 || rect.right + pad > ar.right + 0.5 || rect.top - pad < ar.top - 0.5 || rect.bottom + pad > ar.bottom + 0.5) { clipped = (a.className && String(a.className).split(' ')[0]) || a.tagName; break; } } }
          const cx = rect.left + rect.width / 2, cy = rect.top + Math.min(rect.height / 2, 10);
          const top = document.elementFromPoint(cx, cy);
          const covered = rect.width > 0 && top && !el.contains(top) && !top.contains(el) ? ((top.className && String(top.className).split(' ')[0]) || top.tagName) : '';
          const offscreen = rect.bottom < 0 || rect.top > innerHeight || rect.width === 0;
          const sig = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
          return { sig, text: (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().slice(0, 40), id: el.dataset.frId || '',
            outline: hasOutline ? c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor + ' off ' + c.outlineOffset : 'none', shadow: shadowChanged,
            ratio, bg: `rgb(${bg.r},${bg.g},${bg.b})`, img, radiusBefore: el.dataset.frR || '?', radius: c.borderRadius, clipped, covered, offscreen };
        });
        if (!r) continue;
        const key = r.id + '|' + r.sig + '|' + r.text;
        if (seen.has(key)) break; seen.add(key);
        all.push(Object.assign({ page: p }, r));
      }
    }
    if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(all, null, 1));
    const bad = all.filter(x => (!x.shadow && x.outline === 'none') || (x.ratio !== null && x.ratio < 3 && !x.shadow) || (x.radiusBefore !== '?' && x.radius !== x.radiusBefore) || x.clipped || x.covered);
    console.log('Tab stops walked: ' + all.length + ' on ' + PAGES.length + ' pages; with a problem: ' + bad.length);
    const agg = {};
    bad.forEach(x => { const why = [(!x.shadow && x.outline === 'none') ? 'NO RING' : '', x.ratio !== null && x.ratio < 3 && !x.shadow ? 'LOW ' + x.ratio : '', x.radius !== x.radiusBefore && x.radiusBefore !== '?' ? 'RADIUS ' + x.radiusBefore + '→' + x.radius : '', x.clipped ? 'CLIPPED by ' + x.clipped : '', x.covered ? 'COVERED by ' + x.covered : ''].filter(Boolean).join(' · ');
      const k = x.sig + ' :: ' + why.replace(/LOW [\d.]+/, 'LOW'); (agg[k] = agg[k] || { n: 0, ex: [] }).n++; if (agg[k].ex.length < 2) agg[k].ex.push(x.page + ' "' + x.text + '" ' + why + ' bg ' + x.bg + (x.img ? ' (img)' : '') + ' ' + x.outline); });
    Object.entries(agg).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => console.log(String(v.n).padStart(3), k, '\n      ' + v.ex.join('\n      ')));
    process.exitCode = all.length > 50 && bad.length === 0 ? 0 : 1;
    console.log('\n' + (process.exitCode ? '❌ FAIL: ' + bad.length + ' focus stops with a problem' + (all.length <= 50 ? ' (or too few stops walked: ' + all.length + ')' : '') : '✅ PASS: every one of ' + all.length + ' focus stops has a visible, unclipped ring at 3:1 or better, and keeps its shape') + ' (focus rings)');
  } catch (e) {
    process.exitCode = 1; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    try { process.kill(-server.pid); } catch (_) {}
    try { fs.unlinkSync(CFG); } catch (_) {}
  }
})();
