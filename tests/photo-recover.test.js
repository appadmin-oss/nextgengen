#!/usr/bin/env node
/* ============================================================================
   Lost photo files, found again — Diagnostics → Photo storage, end to end.

   A record points at a stored photo whose file is gone from the store, and a
   copy survives in an old copy of the site. Diagnostics names it, offers
   "Search this account", and the search puts the exact file back; restoring
   a backup file by file works through the same page. (domain/photos.php)

   Run:  node tests/photo-recover.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PR_PORT || '8297';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-pr-'));
const DB = path.join(TMP, 'ngg.db');
const OLD = path.join(TMP, 'old-site', 'api', 'storage', 'photos');
const ADMIN = 'NGG-PR-ADM';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=stderr ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed: ' + String(e.stdout || '') + String(e.stderr || '')); }
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
  if (!process.env.PR_KEEP) try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  photo recovery: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.mkdirSync(OLD, { recursive: true });
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'photo_recover_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'photo_recover_dirs' => [${JSON.stringify(OLD)}],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    // Two photos on record; both files vanish from the store, one survives in the old site.
    const ids = JSON.parse(php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `$mk = function ($c) { $im = imagecreatetruecolor(300, 360); imagefill($im, 0, 0, imagecolorallocate($im, $c, 90, 140)); ob_start(); imagepng($im); $raw = ob_get_clean(); return photo_store_put('data:image/png;base64,' . base64_encode($raw)); };`
      + `$a = $mk(10); $b = $mk(200);`
      + `db_insert('summer_students', ['studentId'=>'SUM-PR-1','fullName'=>'Kemi Ade','status'=>'active','photoUrl'=>$a['url']]);`
      + `db_insert('summer_students', ['studentId'=>'SUM-PR-2','fullName'=>'Tunde Bello','status'=>'active','photoUrl'=>$b['url']]);`
      + `rename(photo_store_find($a['id']), ${JSON.stringify(OLD)} . '/' . $a['id']);`
      + `copy(photo_store_find($b['id']), ${JSON.stringify(TMP)} . '/' . $b['id']); unlink(photo_store_find($b['id']));`
      + `echo json_encode([$a['id'], $b['id']]);`, ['bootstrap']));

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                          { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const errs = [];
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto(BASE + '/control/settings/ops', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('button:has-text("Search this account")', { timeout: 60000 });
    const body = await pg.innerText('body');
    chk('Diagnostics names the photos on record with no file, and where they are', /2 photos on record with no file on disk/.test(body) && /summer_students\.photoUrl/.test(body));
    chk('…and no longer says they can’t be recovered', !/can’t be recovered/.test(body));
    await pg.click('button:has-text("Search this account")');
    await pg.waitForFunction(() => /found and put back/.test(document.body.innerText), null, { timeout: 60000 });
    chk('Search this account puts back the copy left in the old site, and says what is still missing', /1 photo found and put back/.test(await pg.innerText('body')) && /1 still missing/.test(await pg.innerText('body'))
      && php(`echo photo_store_find('${ids[0]}') !== '' ? 'yes' : 'no';`, ['bootstrap']) === 'yes');
    // Restore the other from "a backup" by choosing its file.
    await pg.setInputFiles('input[aria-label="Photo files from a backup"]', path.join(TMP, ids[1]));
    await pg.waitForFunction(() => /restored/.test(document.body.innerText), null, { timeout: 60000 });
    chk('Restore from a backup accepts the missing photo’s own file', /1 photo restored/.test(await pg.innerText('body'))
      && php(`echo photo_store_find('${ids[1]}') !== '' ? 'yes' : 'no';`, ['bootstrap']) === 'yes');
    const served = await pg.evaluate(async u => (await fetch(u)).status, '/api/public/photo.php?p=' + ids[1]);
    chk('…and the photo serves again', served === 200);
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (photo recovery)');
  process.exit(failed ? 1 : 0);
})();
