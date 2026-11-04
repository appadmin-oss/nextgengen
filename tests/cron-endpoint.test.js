#!/usr/bin/env node
/* ============================================================================
   api/public/cron.php — the external scheduler door.

   Most NGG deployments have no scheduler, so background work rides real page
   traffic. A host that HAS one can drive the same jobs from outside, and this
   is that entry point. It is the only endpoint in the product whose credential
   travels in a URL — because cPanel cron can fetch a URL and cannot set a
   header — which makes its access control worth pinning rather than eyeballing.

   Four properties, all security-relevant:
     · with no key configured it is INDISTINGUISHABLE from not being deployed
     · a wrong key gets the same 404, not a 403 that confirms the door exists
     · only named jobs run; a caller cannot ask for arbitrary work
     · a scheduler that CAN send a header may use one instead of the URL

   NOTE ON PARALLELISM: this suite writes a throwaway api/config.php and deletes
   it on exit, like the kiosk, scanner and journal suites. They must run in
   SEQUENCE — npm run test:all chains them with && for that reason.

   Run:  node tests/cron-endpoint.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CRON_PORT || 8255;
const BASE = 'http://127.0.0.1:' + PORT;
const CONFIG = path.join(ROOT, 'api', 'config.php');
const KEY = 'k' + 'test-external-cron-key-0123456789';

let passed = 0, failed = 0;
function chk(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

function get(pathname, headers) {
  return new Promise((resolve) => {
    const req = http.get(BASE + pathname, { headers: headers || {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ status: 0, body: String(e.message) }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
}

/** A config with a valid cookie_secret (bootstrap refuses to serve without one)
 *  and whichever cron_key this case is testing. */
function writeConfig(cronKey) {
  const example = fs.readFileSync(path.join(ROOT, 'api', 'config.example.php'), 'utf8');
  const cfg = example
    .replace(/'cookie_secret'\s*=>\s*'[^']*'/, "'cookie_secret' => '" + 'c'.repeat(48) + "'")
    .replace(/'cron_key'\s*=>\s*'[^']*'/, "'cron_key' => '" + cronKey + "'");
  if (!cfg.includes("'cron_key' => '" + cronKey + "'")) throw new Error('cron_key not substituted — config.example.php changed shape');
  fs.writeFileSync(CONFIG, cfg);
}

(async () => {
  if (fs.existsSync(CONFIG)) {
    console.log('⏭  cron endpoint: skipped (api/config.php exists — refusing to overwrite a real config)');
    process.exit(0);
  }

  let srv = null;
  const start = async () => {
    srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, stdio: 'ignore' });
    await waitForServer(BASE);
  };
  const stop = () => { if (srv) { srv.kill(); srv = null; } };

  try {
    // ── Off: no key configured ──
    writeConfig('');
    await start();
    const off = await get('/api/public/cron.php');
    chk('with no key configured the endpoint answers 404, not 403', off.status === 404);
    chk('…and says nothing about itself', !/cron|job|forbidden/i.test(off.body));
    const offWithKey = await get('/api/public/cron.php?key=' + KEY);
    chk('…and stays 404 even when a key is offered', offWithKey.status === 404);
    stop();

    // ── On ──
    writeConfig(KEY);
    await start();

    chk('a wrong key gets the same 404 as no endpoint at all',
      (await get('/api/public/cron.php?key=wrong-' + KEY)).status === 404);
    chk('…as does a missing one', (await get('/api/public/cron.php')).status === 404);

    const one = await get('/api/public/cron.php?key=' + KEY + '&job=accrue');
    chk('the right key runs the named job', one.status === 200 && /^accrue\s+ran$/m.test(one.body));
    chk('…and reports how long it took, for a cron log', /took \d+ms/.test(one.body));

    /* `all` runs what is DUE. Earlier runs leave their markers in the cache, so
       start from a fresh install's state: nothing has run, everything is due. */
    const wc = path.join(ROOT, 'api', '_cache', 'webcron');
    for (const f of (fs.existsSync(wc) ? fs.readdirSync(wc) : [])) if (f.endsWith('.at')) { try { fs.unlinkSync(path.join(wc, f)); } catch (_) {} }
    const all = await get('/api/public/cron.php?key=' + KEY);
    chk('with no job named it runs them all',
      all.status === 200 && ['deliver', 'reminders', 'maint', 'accrue'].every((j) => new RegExp('^' + j + '\\s+\\w+$', 'm').test(all.body)));

    const bad = await get('/api/public/cron.php?key=' + KEY + '&job=../../etc/passwd');
    chk('a job the endpoint does not name is refused, and the list is offered',
      bad.status === 400 && bad.body.includes('available:') && !bad.body.includes('ran'));

    const hdr = await get('/api/public/cron.php?job=accrue', { 'X-NGG-Cron-Key': KEY });
    chk('a scheduler that can send a header need not put the key in the URL',
      hdr.status === 200 && /^accrue\s+ran$/m.test(hdr.body));

    /* The bucket is checked BEFORE the key is compared, so it caps both key
       guessing and free work. 12/minute — a per-minute cron is fine, a search
       is not. */
    let limited = false;
    for (let i = 0; i < 18; i++) {
      if ((await get('/api/public/cron.php?key=guess-' + i)).status === 429) { limited = true; break; }
    }
    chk('guessing the key runs into the rate limiter', limited);
  } finally {
    stop();
    try { fs.unlinkSync(CONFIG); } catch (_) {}
  }

  console.log('\n' + (failed === 0 ? '✅ PASS' : '❌ FAIL') + ': '
    + passed + ' passed, ' + failed + ' failed (external cron endpoint)');
  process.exit(failed === 0 ? 0 : 1);
})();
