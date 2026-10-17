#!/usr/bin/env node
/* ============================================================================
   Public registration — endpoint submit contract (HTTP level).

   The bug this exists to catch: api/public/selfreg.php reduced every refusal to
   `$res['error'] ?? 'failed'`. A field-level rejection from gate_register comes
   back as ['ok' => false, 'errors' => [field => message]] with NO 'error' key,
   so the family received {"ok":false,"error":"failed"} — the per-field map was
   dropped, the form had nothing to highlight, and "failed" matches no case in
   its handler, so it fell through to "check your connection" for a request that
   arrived perfectly. The public sign-up form could not be submitted at all.

   Why HTTP and not backend_dispatch: api/tests/run.php exercises the DOMAIN
   layer directly, which returned the right shape all along. The loss happened
   in the route file, between the domain and the wire — the one seam that suite
   cannot see. That is precisely why the bug survived 1200+ passing tests.

   Asserted here:
     1. GET context on a `self` gate returns the form.
     2. A refusal carries the per-field `errors` map, not a bare "failed".
     3. The POST does not require a CSRF cookie (anonymous intake, like apply).
     4. A valid submission returns ok + lands exactly one self_pending row.
     5. Re-submitting the SAME child is refused as a duplicate, not silently
        double-registered.

   Self-contained: throwaway api/config.php (SQLite temp), seeds a cohort +
   public gate + centre, serves the repo with PHP's built-in server, then
   cleans everything up. NEVER touches an existing config.php.

   Run:  node tests/forms-submit.js
   Env:  FORMS_PORT (default 8203)
   ============================================================================ */
const { execSync, spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FORMS_PORT || '8203';
const BASE = `http://127.0.0.1:${PORT}`;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-forms-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-forms-cache-${process.pid}`);
const GATE = 'GL-SELFTEST';
let _seq = 0;

/** Run a PHP snippet with the throwaway config + the full domain layer booted. */
function php(snippet) {
  const req = (f) => `require ${JSON.stringify(ROOT + '/api/_lib/' + f)};`;
  /* THE DOMAIN LIST IS READ FROM bootstrap.php, NEVER COPIED.
   *
   * This helper used to keep its own array of domain names. It went stale the
   * moment a domain started calling across to another: registration.php began
   * calling summer_edition_card_expiry(), which lives in summer-editions.php,
   * and this list had never heard of it — so selfreg.approve died with
   * "Call to undefined function" HERE and nowhere else. The app bootstraps and
   * was always fine; the test was the only thing broken, and it reported the
   * product as broken, which is the expensive direction.
   *
   * CLAUDE.md §3 and §11 both say it: tests bootstrap, and a second list of
   * anything drifts. Reading the real one means a new domain is picked up with
   * no edit here, and a renamed one fails loudly instead of silently. */
  const domains = (() => {
    const boot = fs.readFileSync(ROOT + '/api/_lib/bootstrap.php', 'utf8');
    const m = boot.match(/foreach\s*\(\s*\[([^\]]*)\]\s*as\s*\$__d\s*\)/);
    if (!m) throw new Error('cannot find the domain list in bootstrap.php');
    return m[1].match(/'([a-z0-9-]+)'/g).map(s => s.slice(1, -1));
  })();
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + req('response.php') + req('db.php') + req('util.php') + req('mailer.php')
    + req('anchor-content.php') + req('ai.php') + req('bus.php') + req('sms.php') + req('object-store.php')
    + domains.map(d => `require ${JSON.stringify(ROOT + '/api/_lib/domain/' + d + '.php')};`).join('')
    + req('backend.php') + req('sheets.php') + req('webcron.php')
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-forms-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}

/** POST JSON. `headers` may add a CSRF header; omit for the anonymous case. */
function post(pathname, body, headers) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + pathname, {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      }, headers || {}),
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get(BASE + pathname, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    }).on('error', reject);
  });
}

let server;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.unlinkSync(DB); } catch (_) {}
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }

  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'r@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'forms_test_secret_0123456789abcd',
    'cookie_secure' => false,
    'cookie_name' => 'ngg_sess',
    'cookie_domain' => '',
    'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    // Deliberately tiny so the per-gate scoping is observable. Counts below are
    // written against max=5: the main gate spends 4, the throwaway gate proves
    // the 429, and the main gate's 5th proves the buckets are separate.
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60], 'selfreg.submit' => ['max' => 5, 'window' => 300]],
    'session_ttl' => 604800,
    'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'debug' => false,
  ];\n`);

  let failed = 0;
  const ok = (m) => console.log('  ✓ ' + m);
  const bad = (m) => { console.error('  ✗ ' + m); failed++; };

  try {
    // Seed: a public sign-up gate (kind=self, no password) + a centre.
    php(`db_migrate(db_conn());`
      + `db_insert('summer_cohorts', ['cohortId'=>'C1','name'=>'Summer 2026','status'=>'active','createdAt'=>now_iso()]);`
      + `db_insert('gate_links', ['gateId'=>'${GATE}','kind'=>'self','name'=>'Public sign-up','cohortId'=>'C1','centreId'=>'','status'=>'active','passHash'=>'','createdBy'=>'seed','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CT1','name'=>'Egbeda','code'=>'EGB','status'=>'active','createdAt'=>now_iso()]);`);

    // A faculty/course pair the validator will actually accept.
    const fac = php(`echo academy_faculties()[0] ?? '';`);
    const crs = php(`$c = academy_courses_for(${JSON.stringify(php(`echo academy_faculties()[0] ?? '';`))});`
      + `echo is_array($c[0] ?? null) ? ($c[0]['name'] ?? '') : (string)($c[0] ?? '');`);
    const photo = php(`echo 'data:image/png;base64,' . base64_encode(file_get_contents(${JSON.stringify(ROOT + '/assets/logo.png')}));`);

    server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    // 1 · the form loads.
    const ctx = await get(`/api/public/selfreg.php?g=${GATE}`);
    if (ctx.status === 200 && ctx.json && ctx.json.form && Array.isArray(ctx.json.form.fields) && ctx.json.form.fields.length)
      ok('GET context returns the form for a public sign-up gate');
    else bad(`GET context failed (status ${ctx.status}): ${ctx.raw.slice(0, 160)}`);

    // 2 · THE REGRESSION. A refusal must carry the per-field map.
    const short = await post('/api/public/selfreg.php', {
      gate: GATE, photo, consent: true,
      data: { firstName: 'Ada', lastName: 'Test' },   // deliberately incomplete
    });
    if (short.json && short.json.errors && typeof short.json.errors === 'object' && Object.keys(short.json.errors).length) {
      ok(`a refusal carries the per-field errors map (${Object.keys(short.json.errors).join(', ')})`);
    } else {
      bad(`refusal lost its field errors — got ${short.raw.slice(0, 200)}`);
    }
    if (short.json && short.json.error === 'failed') {
      bad('refusal collapsed to the generic "failed" code (the bug this test exists for)');
    } else {
      ok('refusal is not the generic "failed" the form reports as a connection error');
    }

    /* 2b · consent is enforced by the SERVER, not by the checkbox.
       The endpoint is public and unauthenticated, so a submission with the tick
       omitted is one POST away — and a registration with no recorded consent is
       data there was never a basis to hold. */
    const noConsent = await post('/api/public/selfreg.php', { gate: GATE, photo, data: { firstName: 'NoTick' } });
    if (noConsent.json && noConsent.json.error === 'consent_required') ok('a submission with no consent is refused by the server');
    else bad(`consent was not enforced server-side — got ${noConsent.status} ${noConsent.raw.slice(0, 160)}`);

    // 3 · anonymous intake: no CSRF cookie was ever minted here.
    if (short.status !== 403) ok('POST does not demand a CSRF cookie on the public sign-up link');
    else bad('POST returned 403 csrf_failed with no cookie — the public form cannot submit');

    // 4 · the happy path actually registers.
    const good = {
      firstName: 'Ada', lastName: 'Test', dob: '2013-04-02', centre: 'Egbeda',
      faculty: fac, course: crs, sex: 'Female',
      parentName: 'P Test', parentPhone: '08030000000', parentEmail: 'p@example.org',
    };
    const sent = await post('/api/public/selfreg.php', { gate: GATE, photo, consent: true, data: good });
    if (sent.status === 200 && sent.json && sent.json.studentId && sent.json.regStatus === 'self_pending')
      ok(`a complete submission is accepted (${sent.json.studentId}, self_pending)`);
    else bad(`valid submission was refused (status ${sent.status}): ${sent.raw.slice(0, 200)}`);

    const n = parseInt(php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students")['c'];`), 10);
    if (n === 1) ok('exactly one student row was created');
    else bad(`expected 1 student row, found ${n}`);

    const via = php(`echo (string) (db_row("SELECT submittedVia FROM summer_students LIMIT 1")['submittedVia'] ?? '');`);
    if (via === GATE) ok('the row records which gate link it came through');
    else bad(`submittedVia was "${via}", expected "${GATE}"`);

    /* The form asks for a date of birth; the row still carries an age, because
       every report, band and eligibility rule downstream reads `age`. Derived
       on submit rather than typed, so it cannot drift and cannot be guessed. */
    const born = php(`$r = db_row("SELECT dob, age FROM summer_students LIMIT 1"); echo $r['dob'] . '|' . (int)$r['age'];`);
    const expectAge = String(php(`echo dob_age('2013-04-02');`));
    if (born === `2013-04-02|${expectAge}`) ok(`the date of birth is stored and the age derived from it (${expectAge})`);
    else bad(`expected "2013-04-02|${expectAge}" from the row, got "${born}"`);

    // 5 · the same child twice is caught, not double-registered.
    const again = await post('/api/public/selfreg.php', { gate: GATE, photo, consent: true, data: good });
    const n2 = parseInt(php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students")['c'];`), 10);
    if (again.status !== 200 && n2 === 1) ok('a repeat submission is refused rather than duplicating the child');
    else bad(`repeat submission left ${n2} rows (status ${again.status}) — expected 1 and a refusal`);

    /* 6 · Rate limiting is keyed per gate, not per IP alone.
       Every family on a mobile carrier or a centre's WiFi shares one address, so
       an IP-only bucket lets the busiest centre ration every other centre's
       link. GATE has spent its own allowance above; this second gate spends its own. */
    php(`db_insert('gate_links', ['gateId'=>'GL-RL','kind'=>'self','name'=>'Other centre','cohortId'=>'C1','centreId'=>'','status'=>'active','passHash'=>'','createdBy'=>'seed','createdAt'=>now_iso()]);`);
    let limited = null;
    for (let i = 0; i < 6 && !limited; i++) {
      const r = await post('/api/public/selfreg.php', { gate: 'GL-RL', photo, consent: true, data: { firstName: 'X' + i } });
      if (r.status === 429) limited = r;
    }
    if (limited) ok('a genuine flood on one gate is still rate-limited (429)');
    else bad('the rate limiter never fired — the ceiling is not being enforced');

    // Retry-After is what lets an offline outbox back off instead of hammering.
    const ra = await post('/api/public/selfreg.php', { gate: 'GL-RL', photo, consent: true, data: { firstName: 'Y' } });
    if (ra.status === 429) {
      const hdr = await new Promise((resolve) => {
        const p = JSON.stringify({ gate: 'GL-RL', photo, consent: true, data: { firstName: 'Z' } });
        const rq = http.request(BASE + '/api/public/selfreg.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(p) },
        }, (res) => { res.resume(); resolve(res.headers['retry-after']); });
        rq.on('error', () => resolve(undefined));
        rq.end(p);
      });
      if (hdr && parseInt(hdr, 10) > 0) ok(`a 429 carries Retry-After (${hdr}s) so a client can back off`);
      else bad(`429 had no usable Retry-After header (got ${hdr})`);
    } else bad('expected the flooded gate to stay limited');

    // The other gate's bucket is untouched — this is the whole point.
    const other = await post('/api/public/selfreg.php', { gate: GATE, photo, consent: true, data: { firstName: 'Q' } });
    if (other.status !== 429) ok('a different gate on the SAME ip still has its own allowance');
    else bad('one gate exhausting its bucket also locked out another gate on the same IP');
  } catch (e) {
    bad('threw: ' + (e && e.message ? e.message : String(e)));
  } finally {
    cleanup();
  }

  if (failed) { console.error(`\n❌ FAIL: ${failed} failed (public registration submit)`); process.exit(1); }
  console.log('\n✅ PASS: public registration submit contract');
})().catch((e) => { cleanup(); console.error(e); process.exit(1); });
