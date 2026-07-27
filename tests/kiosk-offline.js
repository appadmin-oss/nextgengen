#!/usr/bin/env node
/* ============================================================================
   QR-first kiosk — offline scan queue E2E.

   Proves the field kiosk never loses a check-in when the network drops:
   unlock a gate with its desk password → go OFFLINE → enter a card code →
   it's banked to the offline queue (banner + localStorage, no attendance row)
   → come back ONLINE → the queue drains automatically into a real attendance
   row. Also asserts a genuine bad code still errors immediately (never queued).

   Self-contained: writes a throwaway api/config.php (SQLite temp), seeds a
   gate + student, serves the repo with PHP's built-in server, drives Chromium,
   then cleans everything up. NEVER touches an existing config.php.

   Run:  node tests/kiosk-offline.js
   Env:  PLAYWRIGHT_MODULE (default: tries playwright then playwright-core),
         CHROMIUM_PATH (executablePath; default = the pre-installed Chromium),
         KIOSK_PORT (default 8199).
   ============================================================================ */
const { execSync, spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
let _phpSeq = 0;

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.KIOSK_PORT || '8199';
const BASE = `http://127.0.0.1:${PORT}`;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(require('os').tmpdir(), `ngg-kiosk-${process.pid}.db`);
const GATE = 'GATE-KIOSK';
const DESK_PW = 'desk1234';
const TOKEN = 'SUMQR-TEST1';
const STUDENT = 'SUM-T-1';

function loadChromium() {
  const mods = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const m of mods) { try { return require(m).chromium; } catch (_) {} }
  console.error('playwright not found — `npm i playwright` or set PLAYWRIGHT_MODULE'); process.exit(2);
}
// Run a PHP snippet with the throwaway config + core libs booted; returns
// stdout. Executed from a temp FILE (not `php -r`) so the shell never expands
// `$GLOBALS`/`$…` in the code.
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-php-${process.pid}-${++_phpSeq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}

let server;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.unlinkSync(DB); } catch (_) {}
}

(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }

  // 1) Throwaway config (SQLite; http kiosk cookie ⇒ cookie_secure false).
  const CACHE = path.join(os.tmpdir(), `ngg-kiosk-cache-${process.pid}`);
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'kiosk_test_secret_0123456789abcdef',
    'cookie_secure' => false,
    'cookie_name' => 'ngg_sess',
    'cookie_domain' => '',
    'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800,
    'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'debug' => false,
  ];\n`);

  // 2) Seed: migrate, then a cohort + gate (desk password) + assigned QR + student.
  php(`db_migrate(db_conn());`
    + `db_insert('summer_cohorts', ['cohortId'=>'C1','name'=>'Summer 2026','status'=>'active','createdAt'=>now_iso()]);`
    + `db_insert('gate_links', ['gateId'=>'${GATE}','name'=>'Test Desk','cohortId'=>'C1','centreId'=>'Egbeda','status'=>'active','passHash'=>password_hash('${DESK_PW}', PASSWORD_DEFAULT),'createdBy'=>'seed','createdAt'=>now_iso()]);`
    + `db_insert('qr_codes', ['token'=>'${TOKEN}','batch'=>'B1','cohortId'=>'C1','status'=>'assigned','studentId'=>'${STUDENT}','assignedName'=>'Test Kid','createdAt'=>now_iso(),'assignedAt'=>now_iso()]);`
    + `db_insert('summer_students', ['studentId'=>'${STUDENT}','cohortId'=>'C1','token'=>'${TOKEN}','handle'=>'testkid','fullName'=>'Test Kid','age'=>12,'centre'=>'Egbeda','track'=>'Tech','status'=>'active','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`);

  // 3) Serve the repo (PHP executes /api/*.php; SPA fallback via router below).
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  await waitForServer(BASE);

  const chromium = loadChromium();
  const launch = {};
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 420, height: 880 } });
  const page = await context.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  if (process.env.KIOSK_DEBUG) page.on('response', async r => { if (r.url().includes('gate.php')) { let b = ''; try { b = (await r.text()).slice(0, 200); } catch (_) {} console.log('    [resp]', r.request().method(), r.status(), r.url().split('/api')[1], b); } });

  let failed = 0;
  const ok = (m) => console.log('  ✓ ' + m);
  const bad = (m) => { console.error('  ✗ ' + m); failed++; };
  const text = () => page.evaluate(() => document.body.innerText);
  const queueLen = () => page.evaluate(g => { try { return JSON.parse(localStorage.getItem('ngg.gate.q.' + g) || '[]').length; } catch (_) { return -1; } }, GATE);
  const attendanceCount = () => parseInt(php(`echo (int) db_row("SELECT COUNT(*) c FROM attendance WHERE studentId='${STUDENT}'")['c'];`), 10);

  try {
    // Land on the gate desk (SPA: load root, then route to /gate?g=…).
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__navigate, null, { timeout: 15000 });
    await page.evaluate(g => { history.pushState({}, '', '/gate?g=' + g); window.dispatchEvent(new PopStateEvent('popstate')); }, GATE);
    await page.waitForSelector('input[placeholder="Desk password"]', { timeout: 8000 });
    ok('gate desk renders the unlock form');

    // Unlock with the desk password.
    await page.fill('input[placeholder="Desk password"]', DESK_PW);
    await page.click('button:has-text("Unlock the desk")');
    await page.waitForSelector('button:has-text("Check-in")', { timeout: 8000 });
    ok('desk unlocked with the password (kiosk session)');

    // Open Check-in → reveal the typed fallback (headless has no camera).
    await page.click('button:has-text("Check-in")');
    await page.click('button:has-text("Enter the code")');
    await page.waitForSelector('input[placeholder*="Code from the ID card"]', { timeout: 8000 });

    // ---- OFFLINE: a scan must be banked, not lost ----
    await context.setOffline(true);
    await page.fill('input[placeholder*="Code from the ID card"]', TOKEN);
    await page.click('button:has-text("✓")');
    await page.waitForTimeout(800);
    (await queueLen()) === 1 ? ok('offline scan queued to localStorage') : bad('offline scan NOT queued (len=' + await queueLen() + ')');
    /saved offline/i.test(await text()) ? ok('offline banner shown') : bad('offline banner missing');
    (await attendanceCount()) === 0 ? ok('no attendance row while offline (as expected)') : bad('attendance written while offline');

    // ---- ONLINE: the queue drains automatically ----
    await context.setOffline(false);
    await page.waitForFunction(g => { try { return JSON.parse(localStorage.getItem('ngg.gate.q.' + g) || '[]').length === 0; } catch (_) { return false; } }, GATE, { timeout: 15000 });
    ok('queue drained to empty after reconnect');
    (await attendanceCount()) === 1 ? ok('attendance row written on sync') : bad('attendance NOT written after sync (count=' + await attendanceCount() + ')');
    /synced/i.test(await text()) ? ok('recent list shows "synced"') : bad('synced marker missing');

    // ---- A genuine bad code errors immediately and is never queued ----
    await page.fill('input[placeholder*="Code from the ID card"]', 'NOPE-XXXX');
    await page.click('button:has-text("✓")');
    await page.waitForTimeout(700);
    (await queueLen()) === 0 ? ok('bad code not queued') : bad('bad code was queued (should not be)');
    /isn't assigned|No student|couldn't check in/i.test(await text()) ? ok('bad code surfaces an error') : bad('bad code error not shown');

    if (errs.length) bad('uncaught page errors: ' + errs.slice(0, 2).join(' | '));
  } catch (e) {
    bad('exception: ' + (e && e.message || e));
  } finally {
    await browser.close();
    cleanup();
  }
  console.log(failed ? `\nKIOSK OFFLINE E2E: ${failed} failure(s)` : '\n✅ KIOSK OFFLINE E2E: all checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });

process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
