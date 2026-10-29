#!/usr/bin/env node
/* ============================================================================
   api/hooks/make.php — the one door Make.com comes back in through.

   Everything behind it is pinned by the PHP suite (domain/make.php); this
   pins the door itself, over real HTTP, because that is where a signature
   check is either enforced or not:
     · with no secret configured it answers 404, as if not deployed
     · an unsigned, wrongly-signed or stale request is refused (401)
     · a signed request reaches its action, on a database migrated from fresh
     · an unknown action is refused and the real ones are named

   NOTE ON PARALLELISM: this suite writes a throwaway api/config.php and
   deletes it on exit, like the cron and kiosk suites — run them in SEQUENCE.

   Run:  node tests/make-hook.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MAKE_PORT || 8257;
const BASE = 'http://127.0.0.1:' + PORT;
const CONFIG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), 'ngg-make-hook-' + process.pid + '.db');
const SECRET = 'm' + 'test-make-secret-0123456789abcdef';
const UI_SECRET = 'mk_' + 'made-on-screen-0123456789abcdef';
const UI_CRON = 'ck_' + 'made-on-screen-0123456789abcdef';

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

function post(body, headers) {
  return new Promise((resolve) => {
    const req = http.request(BASE + '/api/hooks/make.php', { method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers || {}) }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, body: data, json }); });
    });
    req.on('error', (e) => resolve({ status: 0, body: String(e.message), json: null }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: 'timeout', json: null }); });
    req.end(body);
  });
}

/** Sign exactly as docs/make.md tells a Make scenario to. */
function signed(obj, opts) {
  const o = opts || {};
  const body = JSON.stringify(obj);
  const ts = String(o.ts || Math.floor(Date.now() / 1000));
  const sig = 'sha256=' + crypto.createHmac('sha256', o.secret || SECRET).update(ts + '.' + body).digest('hex');
  return post(body, { 'X-NGG-Timestamp': ts, 'X-NGG-Signature': sig });
}

function writeConfig(secret) {
  const example = fs.readFileSync(path.join(ROOT, 'api', 'config.example.php'), 'utf8');
  const cfg = example
    .replace(/'cookie_secret'\s*=>\s*'[^']*'/, "'cookie_secret' => '" + 'c'.repeat(48) + "'")
    .replace(/'sqlite_path'\s*=>\s*[^,]+,/, "'sqlite_path' => " + JSON.stringify(DB) + ',')
    .replace(/'make_secret'\s*=>\s*'[^']*'/, "'make_secret' => '" + secret + "'");
  if (!cfg.includes("'make_secret' => '" + secret + "'") || !cfg.includes(DB)) throw new Error('config.example.php changed shape');
  fs.writeFileSync(CONFIG, cfg);
}

(async () => {
  if (fs.existsSync(CONFIG)) {
    console.log('⏭  make hook: skipped (api/config.php exists — refusing to overwrite a real config)');
    process.exit(0);
  }
  let srv = null;
  const start = async () => {
    srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
    await waitForServer(BASE);
  };
  const stop = () => { if (srv) { srv.kill(); srv = null; } };

  try {
    writeConfig('');
    await start();
    const off = await signed({ action: 'jobs' });
    chk('with no secret configured the door answers 404', off.status === 404);
    stop();

    writeConfig(SECRET);
    await start();

    chk('an unsigned request is refused', (await post(JSON.stringify({ action: 'jobs' }))).status === 401);
    chk('a request signed with the wrong secret is refused', (await signed({ action: 'jobs' }, { secret: 'not-it' })).status === 401);
    chk('a replayed request from ten minutes ago is refused',
      (await signed({ action: 'jobs' }, { ts: Math.floor(Date.now() / 1000) - 600 })).status === 401);

    const jobs = await signed({ action: 'jobs' });
    chk('a signed request reaches its action — the watchdog reads every job’s age',
      jobs.status === 200 && jobs.json && jobs.json.ok === true && Array.isArray(jobs.json.jobs) && jobs.json.jobs.length === 5);

    const eds = await signed({ action: 'editions' });
    chk('the season’s dates come back from a database migrated from fresh', eds.status === 200 && Array.isArray(eds.json && eds.json.editions));

    const imp = await signed({ action: 'impact', month: '2026-09' });
    chk('a month’s impact is counts only', imp.status === 200 && imp.json.month === '2026-09' && typeof imp.json.totals.checkIns === 'number');

    const unknown = await signed({ action: 'members.export' });
    chk('an action the door does not name is refused', unknown.status === 400 && unknown.json && unknown.json.error === 'unknown_action');

    const missing = await signed({ action: 'absence.reason', ref: 'AB-NOPE', reason: 'sick' });
    chk('an answer to a question never asked is a 404', missing.status === 404 && missing.json.error === 'not_found');

    /* Set up on screen: no secret in config.php at all — the key the Control
       Room made (stored sealed in the database) opens the door, and the
       scheduler key made beside it opens cron.php. */
    stop();
    writeConfig('');
    const seed = spawnSync('php', ['-r', [
      "$_SERVER['REQUEST_METHOD'] = 'GET';",
      "require 'api/_lib/bootstrap.php';",
      "make_link_save(['secret' => ai_ui_seal('" + UI_SECRET + "'), 'cronKey' => ai_ui_seal('" + UI_CRON + "')], 'test');",
      "echo make_secret() === '" + UI_SECRET + "' ? 'seeded' : 'no';",
    ].join(' ')], { cwd: ROOT, encoding: 'utf8' });
    chk('a key made on screen is stored (setup needs no config file)', /seeded/.test(seed.stdout || ''));
    await start();
    chk('…and opens the door', (await signed({ action: 'jobs' }, { secret: UI_SECRET })).status === 200);
    chk('…while the old config secret does not', (await signed({ action: 'jobs' })).status === 401);
    const cron = await new Promise((resolve) => http.get(BASE + '/api/public/cron.php?key=' + UI_CRON + '&job=accrue', (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', () => resolve({ status: 0, body: '' })));
    chk('the scheduler key made on screen runs the background jobs', cron.status === 200 && /accrue\s+ran/.test(cron.body));
  } finally {
    stop();
    try { fs.unlinkSync(CONFIG); } catch (_) {}
    for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (_) {} }
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (Make.com hook)');
  process.exit(failed === 0 ? 0 : 1);
})();
