#!/usr/bin/env node
/* ============================================================================
   Public registration — offline outbox E2E.

   Proves the promise the copy now makes: a submission is banked on the device
   BEFORE it is sent, so it survives a dead network and a page reload, and the
   retry replays server-side instead of registering the child twice.

   Four things, in the order they matter:
     1. Offline submit → queued (outbox non-empty), NO student row yet, and the
        form says it is saved rather than telling the family to try again.
     2. Back online → the queue drains by itself into exactly ONE student row.
     3. A reload while something is queued does not lose it (the whole point of
        persisting rather than holding it in React state).
     4. A genuine refusal (validation) is NOT queued — it dequeues and reports,
        or the queue would never drain.

   Self-contained: throwaway api/config.php (SQLite temp), seeds a cohort +
   public gate + centre, serves the SOURCE tree with PHP's built-in server,
   drives Chromium, then cleans up. NEVER touches an existing config.php.

   Run:  node tests/forms-offline.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, OFFLINE_PORT (default 8204)
   ============================================================================ */
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.OFFLINE_PORT || '8204';
const BASE = `http://127.0.0.1:${PORT}`;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-offline-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-offline-cache-${process.pid}`);
const GATE = 'GL-OFFLINE';
let _seq = 0;

function loadChromium() {
  const mods = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const m of mods) { try { return require(m).chromium; } catch (_) {} }
  console.error('playwright not found — `npm i playwright` or set PLAYWRIGHT_MODULE');
  process.exit(2);
}

function php(snippet) {
  const req = (f) => `require ${JSON.stringify(ROOT + '/api/_lib/' + f)};`;
  const domains = ['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2',
    'mentorship', 'summer', 'policy', 'club', 'circle', 'momentum', 'integrations',
    'registration', 'selfreg', 'hooks', 'behaviour', 'volunteers', 'photos', 'mentor',
    'instructor', 'ops', 'analytics', 'profiles', 'community', 'arcade'];
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + req('response.php') + req('db.php') + req('util.php') + req('mailer.php')
    + req('anchor-content.php') + req('ai.php') + req('bus.php') + req('sms.php')
    + domains.map(d => `require ${JSON.stringify(ROOT + '/api/_lib/domain/' + d + '.php')};`).join('')
    + req('backend.php') + req('sheets.php') + req('webcron.php')
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-off-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}

let server;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.unlinkSync(DB); } catch (_) {}
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

const students = () => parseInt(php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students")['c'];`), 10);

(async () => {
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'r@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'offline_test_secret_0123456789ab',
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

  let failed = 0;
  const ok = (m) => console.log('  ✓ ' + m);
  const bad = (m) => { console.error('  ✗ ' + m); failed++; };
  let browser;

  try {
    php(`db_migrate(db_conn());`
      + `db_insert('summer_cohorts', ['cohortId'=>'C1','name'=>'Summer 2026','status'=>'active','createdAt'=>now_iso()]);`
      + `db_insert('gate_links', ['gateId'=>'${GATE}','kind'=>'self','name'=>'Public sign-up','cohortId'=>'C1','centreId'=>'','status'=>'active','passHash'=>'','createdBy'=>'seed','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CT1','name'=>'Egbeda','code'=>'EGB','status'=>'active','createdAt'=>now_iso()]);`);
    const fac = php(`echo academy_faculties()[0] ?? '';`);
    const crs = php(`$c = academy_courses_for(${JSON.stringify(fac)}); echo is_array($c[0] ?? null) ? ($c[0]['name'] ?? '') : (string)($c[0] ?? '');`);

    server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const chromium = loadChromium();
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => console.error('    [pageerror]', String(e)));

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);

    if (await page.evaluate(() => !!(window.outbox && window.outbox.intake))) ok('outbox.js loaded and exposes intake()');
    else { bad('outbox.js did not load — nothing else here can pass'); throw new Error('no outbox'); }

    // Drive the outbox directly rather than through twelve form fields: this
    // suite is about the queue's behaviour, and tests/forms-submit.js already
    // covers the endpoint contract.
    const payload = {
      gate: GATE,
      data: { firstName: 'Ada', lastName: 'Offline', age: '12', centre: 'Egbeda',
              faculty: fac, course: crs, sex: 'Female',
              parentName: 'P Test', parentPhone: '08030000000', parentEmail: 'p@example.org' },
      photo: 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAUAAAAFACAIAAAB'.repeat(40),
    };

    // 1 · offline: banked, not sent.
    await context.setOffline(true);
    const offRes = await page.evaluate(async (p) => {
      try {
        await window.outbox.intake('selfreg.submit', p, 'ngg_apply_draft_test');
        return { sent: true };
      } catch (e) { return { sent: false, queued: !!e.queued, code: e.code || e.message }; }
    }, payload);
    const qLen = await page.evaluate(() => window.outbox.pending());

    if (!offRes.sent && offRes.queued) ok('an offline submit reports "queued", not a bare failure');
    else bad(`offline submit reported ${JSON.stringify(offRes)}`);
    if (qLen === 1) ok('it is banked in the outbox (1 entry)');
    else bad(`expected 1 queued entry, found ${qLen}`);
    if (students() === 0) ok('and nothing reached the database yet');
    else bad(`expected 0 student rows while offline, found ${students()}`);

    /* 3 · it is in DURABLE storage, not React state. Read the backing store
       directly — a reload cannot be used to prove this while offline, because
       the source tree served by php -S has nothing cached to reload from. */
    const durable = await page.evaluate(async () => {
      if (window.indexedDB) {
        const rows = await new Promise((resolve) => {
          const rq = indexedDB.open('ngg-outbox', 1);
          rq.onsuccess = () => {
            try {
              const g = rq.result.transaction('queue', 'readonly').objectStore('queue').getAll();
              g.onsuccess = () => resolve(g.result || []);
              g.onerror = () => resolve([]);
            } catch (_) { resolve([]); }
          };
          rq.onerror = () => resolve([]);
        });
        if (rows.length) return { where: 'indexeddb', n: rows.length, sid: rows[0].payload && rows[0].payload.submissionId };
      }
      const ls = JSON.parse(localStorage.getItem('ngg_outbox_v1') || '[]');
      return { where: 'localstorage', n: ls.length, sid: ls[0] && ls[0].payload && ls[0].payload.submissionId };
    });
    if (durable.n === 1) ok(`it is written to durable storage (${durable.where})`);
    else bad(`nothing durable found (${JSON.stringify(durable)})`);
    if (durable.sid && /^sub_[A-Za-z0-9]+$/.test(durable.sid)) ok('the banked payload carries the submissionId that makes a retry safe');
    else bad(`banked payload has no usable submissionId (${durable.sid})`);

    // 2 · back online: drains itself, then survives a reload without re-sending.
    await context.setOffline(false);
    let drained = false;
    for (let i = 0; i < 40 && !drained; i++) {
      drained = (await page.evaluate(() => window.outbox.pending())) === 0;
      if (!drained) await new Promise(r => setTimeout(r, 250));
    }
    if (drained) ok('coming back online drains the queue on its own (no button pressed)');
    else bad('the queue never drained after coming back online');

    const n = students();
    if (n === 1) ok(`it landed exactly once (${n} student row)`);
    else bad(`expected exactly 1 student row after the flush, found ${n}`);

    // A reload must not resurrect a completed submission as a second child.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await new Promise(r => setTimeout(r, 800));
    const n2 = students();
    if (n2 === 1) ok('reloading after it sent does not register the child again');
    else bad(`reload produced ${n2} rows — expected 1`);

    // 4 · a real refusal must not be queued for ever.
    const refusal = await page.evaluate(async (g) => {
      try {
        await window.outbox.intake('selfreg.submit', { gate: g, data: { firstName: 'NoFields' }, photo: 'data:image/png;base64,AAAA' }, 'ngg_apply_draft_bad');
        return { sent: true };
      } catch (e) { return { sent: false, queued: !!e.queued, errors: (e.data && e.data.errors) || null }; }
    }, GATE);
    const qAfter = await page.evaluate(() => window.outbox.pending());
    if (!refusal.sent && !refusal.queued && refusal.errors) ok('a validation refusal reports its fields instead of being queued');
    else bad(`refusal handled wrongly: ${JSON.stringify(refusal)}`);
    if (qAfter === 0) ok('and it is not left in the queue to retry for ever');
    else bad(`a refused submission stayed queued (${qAfter})`);
    /* 6 · THE REGRESSION: an `in_flight` reply must not fail the submission.

       send() banks the row before awaiting the response, so the 20s flush tick
       used to pick up the SAME row and send the same payload again. The server
       claims a submissionId before doing the work, so the loser was told
       `in_flight` — correct, but it arrives as a 4xx, and a 4xx meant "declined,
       stop": the row was dropped and an error shown to somebody with a perfectly
       good connection who had submitted exactly once. Any submission slower than
       the tick tripped it, and a photo upload comfortably is.

       Reproduced by INTERCEPTING the first POST and answering `in_flight`, not by
       racing two real requests: php -S is single-threaded, so a second request
       serialises behind the first and gets a replay rather than the concurrent
       claim. Production runs FPM or Apache with several workers, where the
       overlap is genuine — so the stub is the faithful reproduction here and a
       real race is not. */
    let served = 0;
    await page.route('**/api/public/selfreg.php', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      served++;
      if (served === 1) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'in_flight' }),
        });
      }
      return route.continue();   // the retry reaches the real server
    });

    const raced = await page.evaluate(async (p) => {
      const payload = JSON.parse(JSON.stringify(p));
      payload.data = Object.assign({}, p.data, { firstName: 'Raced', lastName: 'Child' });
      const out = { queued: false, terminal: null };
      try {
        await window.outbox.intake('selfreg.submit', payload, 'ngg_race_draft');
        out.sentFirstTry = true;
      } catch (e) {
        out.queued = !!e.queued;
        out.terminal = e.queued ? null : (e.code || e.message || String(e));
      }
      return out;
    }, payload);

    // An in_flight must leave the work QUEUED, never reported as a dead end.
    if (raced.queued) ok('an in_flight reply keeps the submission queued, not failed');
    else bad(`in_flight was treated as terminal (${raced.terminal}) — the shipped regression`);

    // …and the retry must actually land it, exactly once.
    let landed = false;
    for (let i = 0; i < 40 && !landed; i++) {
      await page.evaluate(() => window.outbox.flush());
      landed = students() === 2;
      if (!landed) await new Promise(r => setTimeout(r, 250));
    }
    if (landed) ok('and the retry lands it — exactly one extra student row');
    else bad(`the retry never landed (${students()} rows; expected 2)`);

    const qEnd = await page.evaluate(() => window.outbox.pending());
    if (qEnd === 0) ok('the queue drains rather than holding a ghost');
    else bad(`queue still holds ${qEnd} after the retry landed`);
    await page.unroute('**/api/public/selfreg.php');

    // 7 · in_flight must be classified as retryable, not as a refusal.
    const cls = await page.evaluate(() => {
      const mk = (code, status) => { const e = new Error(code); e.code = code; e.status = status; return e; };
      return {
        inflight: window.outbox.isRetryable(mk('in_flight', 400)),
        validation: window.outbox.isRetryable(mk('bad_age', 400)),
        network: window.outbox.isRetryable(mk('network', 0)),
        server: window.outbox.isRetryable(mk('http_500', 500)),
      };
    });
    if (cls.inflight && cls.network && cls.server && !cls.validation)
      ok('in_flight retries; a real validation refusal still does not');
    else bad(`retry classification wrong: ${JSON.stringify(cls)}`);
  } catch (e) {
    bad('threw: ' + (e && e.message ? e.message : String(e)));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }

  if (failed) { console.error(`\n❌ FAIL: ${failed} failed (offline outbox)`); process.exit(1); }
  console.log('\n✅ FORMS OFFLINE E2E: all checks passed');
})().catch((e) => { cleanup(); console.error(e); process.exit(1); });
