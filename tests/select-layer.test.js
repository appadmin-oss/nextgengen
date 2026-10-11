#!/usr/bin/env node
/* ============================================================================
   Every drop-down opens as the application's list (installNggSelect,
   components.jsx), tested on a real React form (the contact form): mouse,
   keyboard, search, a phone's sheet, and that the page's own state holds the
   choice — the <select> stays the source of truth. Also: Summer School's
   Apply goes to its gated public sign-up link (/apply?g=…).

   Run:  node tests/select-layer.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SL_PORT || '8343';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-sl-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
const SHOTS = path.join(ROOT, 'tests', 'screens', 'club-apply');
const yearsAgo = (n, md) => (new Date().getFullYear() - n) + '-' + (md || '01-15');

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  select layer: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'select_layer_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());`
      + `foreach (['Egbeda' => 'EG', 'Ayobo' => 'AY', 'Ikotun' => 'IK'] as $n => $c) db_insert('centres', ['centreId'=>'CEN-SL-'.$c,'name'=>$n,'code'=>$c,'color'=>'#e9a21b','status'=>'active','slug'=>strtolower($n),'programmes'=>'ngg,summer','createdAt'=>now_iso()]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const errs = [];
    const open = async (w, h, at, touch) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };

    console.log('desktop: the contact form');
    const sel = 'form select';
    const P = await open(1280, 900, '/contact');
    await P.waitForSelector(sel, { timeout: 30000 });
    await P.click(sel);
    await P.waitForSelector('.ngs--pop', { timeout: 5000 });
    fs.mkdirSync(path.join(ROOT, 'tests', 'screens', 'select-layer'), { recursive: true });
    await P.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'select-layer', 'desktop.png') });
    chk('clicking a drop-down opens the application-style list, not the OS one', (await P.$$eval('.ngs--pop .ngs-o', bs => bs.map(b => b.textContent))).some(t => /Press/.test(t)));
    await P.click('.ngs--pop .ngs-o:has-text("Press")');
    await P.fill('form input[type=email]', 'someone@example.org');   // a re-render: React would put back a value it never heard about
    chk('choosing sets the select, and the page’s own state holds it through a re-render', (await P.$eval(sel, s => s.options[s.selectedIndex].text)) === 'Press / media' && !(await P.$('.ngs')));
    await P.focus(sel);
    await P.keyboard.press('Enter');
    await P.waitForSelector('.ngs--pop');
    chk('the chosen option is ticked when it opens again', !!(await P.$('.ngs-o[aria-selected="true"]:has-text("Press") i.ph-check')));
    await P.keyboard.press('ArrowDown'); await P.keyboard.press('Enter');
    chk('keyboard: Enter opens, arrows move, Enter picks, focus returns to the field', (await P.$eval(sel, s => s.options[s.selectedIndex].text)) !== 'Press / media'
      && await P.evaluate(s => document.activeElement === document.querySelector(s), sel));
    await P.keyboard.press('Enter'); await P.waitForSelector('.ngs--pop'); await P.keyboard.press('Escape');
    chk('Escape closes without changing anything', !(await P.$('.ngs')));
    await P.context().close();

    console.log('phone: a sheet');
    const M = await open(390, 844, '/contact', true);
    await M.waitForSelector(sel, { timeout: 30000 });
    await M.tap(sel);
    await M.waitForSelector('.ngs--sheet', { timeout: 5000 });
    await M.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'select-layer', 'phone.png') });
    chk('on a phone the list is a full-screen sheet with its label and a search box', (await M.innerText('.ngs-h b')).trim().length > 0 && !!(await M.$('.ngs--sheet .ngs-s input')));
    await M.fill('.ngs-s input', 'partner');
    chk('…and the search filters', (await M.$$('.ngs-o')).length === 1);
    await M.tap('.ngs-o:has-text("Partnership")');
    chk('…a tap picks', /Partnership/.test(await M.$eval(sel, s => s.options[s.selectedIndex].text)) && !(await M.$('.ngs')));
    await M.context().close();

    console.log('Summer School: Apply goes to the gated sign-up link');
    php(`db_insert('gate_links', ['gateId'=>'GATE-SL-ALL','kind'=>'self','name'=>'Public sign-up','cohortId'=>'','centreId'=>'','status'=>'active','createdAt'=>now_iso()]);`
      + `db_insert('gate_links', ['gateId'=>'GATE-SL-AY','kind'=>'self','name'=>'Ayobo sign-up','cohortId'=>'','centreId'=>'Ayobo','status'=>'active','createdAt'=>now_iso()]);`);
    const S = await open(1280, 900, '/join?program=summer');
    await S.waitForFunction(() => location.pathname === '/apply', null, { timeout: 30000 }).catch(() => {});
    chk('/join?program=summer forwards to the live public sign-up link', new URL(S.url()).pathname === '/apply' && new URL(S.url()).searchParams.get('g') === 'GATE-SL-ALL');
    await S.goto(BASE + '/join?program=summer&centre=Ayobo', { waitUntil: 'domcontentloaded' }); await waitForBoot(S);
    await S.waitForFunction(() => location.pathname === '/apply', null, { timeout: 30000 }).catch(() => {});
    chk('…to that centre’s own link when the button named a centre', new URL(S.url()).searchParams.get('g') === 'GATE-SL-AY');
    php(`db_exec("UPDATE gate_links SET status = 'revoked'");`);
    await S.goto(BASE + '/join?program=summer', { waitUntil: 'domcontentloaded' }); await waitForBoot(S);
    await S.waitForSelector('.summer-fwd [role=status] h1', { timeout: 30000 });
    chk('…and with no link open, it says so and points to the centres (no old form)', /isn’t open online right now/.test(await S.innerText('.summer-fwd')));
    await S.context().close();

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (select layer)`);
    process.exit(failed ? 1 : 0);
  }
})();
