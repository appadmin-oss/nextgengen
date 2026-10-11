#!/usr/bin/env node
/* ============================================================================
   Every drop-down opens as the application's list (installNggSelect,
   components.jsx). Tested on a real React form (the Summer School join form
   and the contact form): mouse, keyboard, search, a phone's sheet, and that
   the page's own state changes — the <select> stays the source of truth.

   Run:  node tests/select-layer.test.js
   ==========================================================================
   (harness below is shared with the Club application test)
   against the real PHP backend: the bad data the old Google Form took cannot
   be sent (a surname typed twice, "@gmail", a ten-digit phone, a dark photo,
   a phone number as a promo code); 18 and over is sent to NGV; the answers
   are normalised; the agreements land in the ledger with the policy version;
   the same child sent again updates the application; "Apply for another
   child" keeps the family; the policy opens in place; and the phone layout is
   its own (full-screen pickers, a fixed Back / Continue bar).

   Run:  node tests/club-apply.test.js
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
    const draftCity = p => p.evaluate(() => (JSON.parse(localStorage.getItem('ngg.join.draft.summer') || '{}')).city || '');

    console.log('desktop: the Summer School join form');
    const P = await open(1280, 900, '/join?program=summer');
    await P.waitForFunction(() => document.querySelectorAll('#join-centre option').length > 2, null, { timeout: 30000 });
    await P.click('#join-centre');
    await P.waitForSelector('.ngs--pop', { timeout: 5000 });
    fs.mkdirSync(path.join(ROOT, 'tests', 'screens', 'select-layer'), { recursive: true });
    await P.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'select-layer', 'desktop.png') });
    chk('clicking a drop-down opens the application-style list, not the OS one', (await P.$$eval('.ngs--pop .ngs-o', bs => bs.map(b => b.textContent))).some(t => /Ayobo/.test(t)));
    await P.click('.ngs--pop .ngs-o:has-text("Ayobo")');
    chk('choosing sets the select and the page’s own state (its draft) follows', (await P.$eval('#join-centre', s => s.value)) === 'Ayobo' && !(await P.$('.ngs')) && /Ayobo/.test(await draftCity(P)));
    await P.focus('#join-centre');
    await P.keyboard.press('Enter');
    await P.waitForSelector('.ngs--pop');
    chk('the chosen option is ticked when it opens again', !!(await P.$('.ngs-o[aria-selected="true"]:has-text("Ayobo") i.ph-check')));
    await P.keyboard.press('ArrowDown'); await P.keyboard.press('Enter');
    chk('keyboard: Enter opens, arrows move, Enter picks, focus returns to the field', (await P.$eval('#join-centre', s => s.value)) !== 'Ayobo' && await P.evaluate(() => document.activeElement && document.activeElement.id === 'join-centre'));
    await P.keyboard.press('Enter'); await P.waitForSelector('.ngs--pop'); await P.keyboard.press('Escape');
    chk('Escape closes without changing anything', !(await P.$('.ngs')));
    await P.context().close();

    console.log('phone: a sheet');
    const M = await open(390, 844, '/join?program=summer', true);
    await M.waitForFunction(() => document.querySelectorAll('#join-centre option').length > 2, null, { timeout: 30000 });
    await M.tap('#join-centre');
    await M.waitForSelector('.ngs--sheet', { timeout: 5000 });
    await M.screenshot({ path: path.join(ROOT, 'tests', 'screens', 'select-layer', 'phone.png') });
    chk('on a phone the list is a full-screen sheet with its label and a search box', /centre|Centre/.test(await M.innerText('.ngs-h b')) && !!(await M.$('.ngs--sheet .ngs-s input')));
    await M.fill('.ngs-s input', 'ikot');
    chk('…and the search filters', (await M.$$('.ngs-o')).length === 1);
    await M.tap('.ngs-o:has-text("Ikotun")');
    chk('…a tap picks', (await M.$eval('#join-centre', s => s.value)) === 'Ikotun' && !(await M.$('.ngs')));
    await M.context().close();

    console.log('contact form');
    const C = await open(1280, 900, '/contact');
    const csel = await C.waitForSelector('select', { timeout: 30000 });
    await csel.click();
    await C.waitForSelector('.ngs--pop');
    await C.click('.ngs-o:has-text("Press")');
    chk('another form’s drop-down works the same way', (await C.$eval('select', s => s.options[s.selectedIndex].text)) === 'Press / media');
    await C.context().close();

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
