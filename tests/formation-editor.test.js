#!/usr/bin/env node
/* ============================================================================
   The Saturday formation editor (Control Room → Learning → Saturday
   formation) and the portals that read it, end to end.

   The promises: a block's new end moves the rest of the day with it; a block
   can be added where it is put and removed again; a centre gets its own day,
   which the URL names so a refresh opens it again; the whole day moves at
   once; a Saturday can be marked off with a note; and a member at that centre
   sees their centre's day, not the main one.

   Run:  node tests/formation-editor.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FM_PORT || '8312';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-fm-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-FM-ADM', MEM = 'NGG-FM-MEM';
const CSRF = 'fm-csrf-0123456789abcdef';

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet;
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
const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
const text = pg => pg.evaluate(() => document.body.innerText);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  formation editor: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'formation_editor_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const sat = php(`db_migrate(db_conn());
      db_insert('centres', ['centreId'=>'CEN-FM-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);
      db_insert('centres', ['centreId'=>'CEN-FM-2','name'=>'Ayobo','code'=>'AY','color'=>'#123456','status'=>'active','slug'=>'ayobo','createdAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','totpSecret'=>'JBSWY3DPEHPK3PXP','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${MEM}','fullName'=>'Tobi Adeyemi','email'=>'tobi@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','displayId'=>'026-201','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      echo sf_next_saturday();`);
    const end = k => php(`echo sf_blocks(${JSON.stringify(k)})[count(sf_blocks(${JSON.stringify(k)})) - 1]['end'];`);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const tok = (id, adm) => php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), ${adm ? 'true' : 'false'});`);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    browser = await launch();
    const errs = [];
    const open = async (id, adm, at, w = 1440, h = 1000) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addCookies([{ name: 'ngg_sess', value: tok(id, adm), domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: CSRF, domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };
    const dialog = async (P, fill, submit) => {
      await P.waitForSelector('[role="dialog"] form, [role="dialog"] button[type="submit"]');
      for (const [sel, v] of fill) {
        const tag = await P.$eval(sel, el => el.tagName);
        if (tag === 'SELECT') await P.selectOption(sel, v); else await P.fill(sel, v);
      }
      await P.click('[role="dialog"] button[type="submit"]' + (submit ? ':has-text("' + submit + '")' : ''));
    };

    console.log('Control Room → Learning → Saturday formation');
    const P = await open(ADMIN, true, '/control/learning/formation');
    chk('the main day: every Saturday, nine blocks, 8:00am – 2:00pm', await until(P, () => /Every Saturday · 8:00am – 2:00pm/.test(document.body.innerText) && document.querySelectorAll('tbody tr').length === 9, null, 60000));

    await P.click('tr:has-text("Musing")');
    await until(P, () => /Change this block/.test(document.body.innerText));
    await P.click('button:has-text("Change this block")');
    await dialog(P, [['#crf-end', '10:15']], 'Save block');
    chk('a longer breakout says the blocks after it moved too', await until(P, () => /7 blocks after it moved too/.test(document.body.innerText)));
    chk('…the day now ends at 2:15pm, on screen and on the server', await until(P, () => /8:00am – 2:15pm/.test(document.body.innerText)) && end('') === '14:15');

    await P.click('button:has-text("Add a block")');
    const anthem = php(`echo 'anthem';`);
    await dialog(P, [['#crf-title', 'Guest talk'], ['#crf-after', anthem], ['#crf-minutes', '20']], 'Add');
    chk('a new block goes where it was put, and the day after it moves on', await until(P, () => /Guest talk added\. \d+ blocks after it moved too/.test(document.body.innerText) && document.querySelectorAll('tbody tr').length === 10)
      && php(`$k = array_column(sf_blocks(), 'key'); echo array_search('guest-talk', $k) === array_search('anthem', $k) + 1 ? 'y' : 'n';`) === 'y' && end('') === '14:35');
    await P.click('tr:has-text("Guest talk")');
    await until(P, () => /Remove this block/.test(document.body.innerText));
    await P.click('button:has-text("Remove this block")');
    chk('removing it closes its gap', await until(P, () => /Guest talk removed\. The blocks after it moved up/.test(document.body.innerText) && document.querySelectorAll('tbody tr').length === 9) && end('') === '14:15');

    await P.click('button:has-text("A centre’s own day")');
    await dialog(P, [['#crf-centre', 'CEN-FM-1']], 'Create');
    chk('a centre’s own day opens, named in words and in the address', await until(P, () => /Egbeda’s own day/.test(document.body.innerText) && /\/control\/learning\/formation\/centre:CEN-FM-1$/.test(location.pathname)));
    chk('the versions are listed to choose between', await until(P, () => /Versions of the day/.test(document.body.innerText) && /Showing/.test(document.body.innerText)));
    await P.click('button:has-text("Move the day")');
    await dialog(P, [['#crf-startAt', '09:00']], 'Move');
    chk('the whole centre day moves to 9:00, the main day stays', await until(P, () => /9:00am – 3:15pm/.test(document.body.innerText)) && end('centre:CEN-FM-1') === '15:15' && end('') === '14:15');
    await P.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(P);
    chk('a refresh opens the same version (the URL is the state)', await until(P, () => /Egbeda’s own day · 9:00am – 3:15pm/.test(document.body.innerText), null, 60000));

    await P.click('button:has-text("Mark a Saturday off")');
    await dialog(P, [['#crf-date', sat], ['#crf-centre', 'CEN-FM-2']], 'Save');
    chk('a Saturday off without a reason is refused on the form', await until(P, () => /Say why, in a line families will read/.test((document.querySelector('[role="dialog"]') || {}).innerText || '')));
    await P.fill('#crf-note', 'The hall is being painted.');
    await P.click('[role="dialog"] button[type="submit"]');
    chk('…with one, it is listed with its note', await until(P, () => /Saturdays off and notes/.test(document.body.innerText) && /The hall is being painted/.test(document.body.innerText) && /Ayobo/.test(document.body.innerText)));
    chk('every change was audited, one event each', +php(`echo db_row("SELECT COUNT(*) c FROM audit_log WHERE event LIKE 'formation.%'")['c'];`) === 6);
    await P.context().close().catch(() => {});

    console.log('a member at that centre');
    await browser.close().catch(() => {}); browser = await launch();
    const M = await open(MEM, false, '/dashboard/saturday', 420, 900);
    chk('the member sees their centre’s day (9:00), not the main one', await until(M, () => /Saturday formation · 9:00am – 3:15pm/.test((document.querySelector('.sf-day') || {}).innerText || ''), null, 60000));
    chk('…dated, at their centre', await until(M, () => /Egbeda/.test((document.querySelector('.sf-head') || {}).innerText || '')));
    chk('the public read for the centre that is off says so, with no blocks', php(`$r = public_formation(['centre' => 'Ayobo', 'date' => '${sat}']); echo $r['off'] && !$r['blocks'] && $r['note'] === 'The hall is being painted.' ? 'y' : 'n';`) === 'y');
    chk('no page errors', errs.length === 0);
    if (errs.length) console.log(errs.slice(0, 5));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: the suite crashed: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
