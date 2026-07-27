#!/usr/bin/env node
/* ============================================================================
   Scanner chain test — every QR surface, end to end, with the shipped code.

   There are four places a code gets scanned, and until now nothing proved the
   chain that connects them actually closes:

     ID card  --qrcode.min.js-->  QR image  --jsQR-->  text  --parser-->  token
              --> /api  --> attendance row

   Each link was exercised somewhere; the join was not. This encodes the exact
   payload CardQR prints, decodes it with the exact decoder the kiosks load,
   runs it through BOTH token parsers the app ships, and checks the result
   against a real backend.

   Two parsers is not a typo. The admin kiosk uses extractToken; the gate desk
   and the community sign-in use extractCheckinToken. They are different
   functions with different rules, so this asserts they agree on every code
   shape the system actually prints — a divergence would mean a card that works
   at one desk and not another.

   Run:  node tests/scanners.test.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, SCAN_PORT (default 8201).
   Skips with a pass if playwright isn't installed, like the other E2E suites.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { waitForServer } = require('./_serve');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SCAN_PORT || '8201';
const BASE = `http://127.0.0.1:${PORT}`;
const FIX = path.join(ROOT, 'tests', '_scan_fixture.html');
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(require('os').tmpdir(), `ngg-scan-${process.pid}.db`);

const GATE = 'GATE-SCAN-1';
const DESK_PW = 'scan-desk-pw-1';
const STU_TOKEN = 'SUMQR-SCAN0001';
const VOL_TOKEN = 'VOLQR-SCAN0002';

let pass = 0, fail = 0;
const ok = (l) => { pass++; console.log('  ✓ ' + l); };
const bad = (l) => { fail++; console.error('  ✗ ' + l); };
const is = (cond, l) => (cond ? ok(l) : bad(l));

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

let server;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.existsSync(CFG) && fs.unlinkSync(CFG); } catch (_) {}
  for (const f of [FIX, DB]) { try { fs.existsSync(f) && fs.unlinkSync(f); } catch (_) {} }
}
process.on('exit', cleanup);

/** Run PHP against the seeded DB and return stdout. */
function php(body) {
  const f = path.join(require('os').tmpdir(), `ngg-scan-php-${process.pid}.php`);
  fs.writeFileSync(f, `<?php require '${ROOT}/api/_lib/bootstrap.php'; ${body}`);
  try { return execSync(`php ${JSON.stringify(f)}`, { encoding: 'utf8' }); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  scanners: skipped (playwright not installed)'); process.exit(0); }
  const exe = process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

  // 1) A throwaway config + DB, seeded with one student card and one volunteer
  //    card — the two code shapes the studio actually prints. Refuses to run
  //    against a real config rather than overwrite one, same as the kiosk E2E.
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  const CACHE = path.join(require('os').tmpdir(), `ngg-scan-cache-${process.pid}`);
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'scan_test_secret_0123456789abcdef',
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

  php(`
    db_migrate(db_conn());
    db_insert('summer_cohorts', ['cohortId'=>'C1','name'=>'Summer 2026','status'=>'active','createdAt'=>now_iso()]);
    db_insert('gate_links', ['gateId'=>'${GATE}','name'=>'Scan Desk','cohortId'=>'C1','centreId'=>'Egbeda','status'=>'active','passHash'=>password_hash('${DESK_PW}', PASSWORD_DEFAULT),'createdBy'=>'seed','createdAt'=>now_iso()]);
    db_insert('qr_codes', ['token'=>'${STU_TOKEN}','batch'=>'B1','cohortId'=>'C1','status'=>'assigned','studentId'=>'STU-SCAN-1','assignedName'=>'Scan Kid','createdAt'=>now_iso(),'assignedAt'=>now_iso()]);
    db_insert('summer_students', ['studentId'=>'STU-SCAN-1','cohortId'=>'C1','token'=>'${STU_TOKEN}','handle'=>'scankid','fullName'=>'Scan Kid','age'=>12,'centre'=>'Egbeda','track'=>'Tech','status'=>'active','guardianPhone'=>'08031112222','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);
    db_insert('qr_codes', ['token'=>'${VOL_TOKEN}','batch'=>'B1','cohortId'=>'C1','status'=>'assigned','studentId'=>'VOL-INS-26-500','assignedName'=>'Scan Instructor','createdAt'=>now_iso(),'assignedAt'=>now_iso()]);
    db_insert('volunteers', ['volunteerId'=>'VOL-INS-26-500','fullName'=>'Scan Instructor','email'=>'si@ex.co','phone'=>'+2348033334444','role'=>'instructor','token'=>'${VOL_TOKEN}','status'=>'active','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
  `);

  // 2) A page that loads ONLY the shipped encoder, decoder and app bundle.
  fs.writeFileSync(FIX, `<!doctype html><html><body>
<div id="root"></div>
<script src="/vendor/qrcode.min.js"></script>
<script src="/vendor/jsQR.min.js"></script>
<script src="/dist/vendor/react.production.min.js"></script>
<script src="/dist/vendor/react-dom.production.min.js"></script>
<script src="/dist/data.js"></script><script src="/dist/photos.js"></script>
<script>window.NGGApi = new Proxy({}, { get: function () { return function () { return Promise.resolve({}); }; } });</script>
<script src="/dist/app.min.js"></script>
</body></html>`);

  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
  await waitForServer(BASE);

  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e.message)));
  await page.goto(BASE + '/tests/_scan_fixture.html', { waitUntil: 'networkidle' });

  // ── The libraries the scanners depend on are actually reachable ──────────
  const libs = await page.evaluate(() => ({
    encoder: typeof window.qrcode,
    decoder: typeof window.jsQR,
    kioskParser: typeof window.extractToken,
    deskParser: typeof window.extractCheckinToken,
  }));
  is(libs.encoder === 'function', 'the QR encoder the cards print with loads (/vendor/qrcode.min.js)');
  is(libs.decoder === 'function', 'the QR decoder every scanner reads with loads (/vendor/jsQR.min.js)');
  is(libs.kioskParser === 'function', 'the admin kiosk token parser is reachable');
  is(libs.deskParser === 'function', 'the gate desk / sign-in token parser is reachable');

  /* ── The full chain, per code shape ───────────────────────────────────────
   * Encode exactly what CardQR prints (origin + "/q/" + token), rasterise it,
   * decode it with jsQR out of raw pixel data the way a camera frame arrives,
   * and run both parsers over the result. */
  const chain = await page.evaluate(({ origin, tokens }) => {
    const out = {};
    for (const tok of tokens) {
      const payload = origin + '/q/' + tok;
      const q = window.qrcode(0, 'M');
      q.addData(payload); q.make();
      // Draw at a camera-ish size with a quiet zone, as a real card photograph
      // would arrive — not the pristine module grid.
      const cell = 6, margin = 4, n = q.getModuleCount();
      const size = (n + margin * 2) * cell;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (q.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
      }
      const img = ctx.getImageData(0, 0, size, size);
      const res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      out[tok] = {
        payload,
        decoded: res ? res.data : null,
        kiosk: res ? window.extractToken(res.data) : null,
        desk: res ? window.extractCheckinToken(res.data) : null,
        // A handheld/USB reader types the payload rather than decoding pixels.
        kioskTyped: window.extractToken(payload),
        deskTyped: window.extractCheckinToken(payload),
        // And some readers are configured to emit the bare token.
        kioskBare: window.extractToken(tok),
        deskBare: window.extractCheckinToken(tok),
      };
    }
    return out;
  }, { origin: BASE, tokens: [STU_TOKEN, VOL_TOKEN] });

  for (const tok of [STU_TOKEN, VOL_TOKEN]) {
    const r = chain[tok];
    const kind = tok.startsWith('SUM') ? 'student' : 'volunteer';
    is(r.decoded === r.payload, `a printed ${kind} card QR decodes back to its exact payload`);
    is(r.kiosk === tok, `…and the admin kiosk parser recovers the token (got ${r.kiosk})`);
    is(r.desk === tok, `…and the gate desk parser recovers the same token (got ${r.desk})`);
    is(r.kiosk === r.desk, '…the two parsers agree, so a card works at either desk');
    is(r.kioskTyped === tok && r.deskTyped === tok, '…a handheld reader typing the URL gives the same token');
    is(r.kioskBare === tok && r.deskBare === tok, '…and a reader emitting the bare code does too');
  }

  /* ── Awkward real-world shapes ────────────────────────────────────────────
   * A trailing slash, a tracking query, a lowercased URL. Each of these has
   * reached a desk at some point; all must land on the same token. */
  const shapes = await page.evaluate(({ origin, tokens }) => {
    const out = {};
    for (const tok of tokens) {
      const cases = {
        'trailing slash': origin + '/q/' + tok + '/',
        'tracking query': origin + '/q/' + tok + '?src=card',
        'fragment': origin + '/q/' + tok + '#top',
        'lowercased': (origin + '/q/' + tok).toLowerCase(),
        'whitespace padded': '  ' + origin + '/q/' + tok + '  ',
      };
      for (const k in cases) {
        out[tok + ' · ' + k] = { tok, kiosk: window.extractToken(cases[k]), desk: window.extractCheckinToken(cases[k]) };
      }
    }
    return out;
  }, { origin: BASE, tokens: [STU_TOKEN, VOL_TOKEN] });
  /* Both token shapes, because the two parsers reach the answer by different
     routes: the SUMQR- pattern matches directly, while a volunteer code falls
     through to the path-splitting branch. A case rule that only exists on one
     of those branches is invisible if you only ever test a student card — and
     the DB compares tokens case-sensitively, so a lowercased scan that is not
     normalised simply does not match anybody. */
  for (const k in shapes) {
    const r = shapes[k];
    is(r.kiosk === r.tok && r.desk === r.tok,
      `both parsers survive a ${k.replace(/^\S+ · /, '')} on a ${r.tok.startsWith('SUM') ? 'student' : 'volunteer'} code (${r.kiosk} / ${r.desk})`);
  }

  /* ── Straight through to the backend ──────────────────────────────────────
   * The decoded token has to actually check somebody in. Uses the public gate
   * route with a real desk session, which is the path a field kiosk takes. */
  const api = await page.evaluate(async ({ base, gate, pw, stu, vol }) => {
    const post = async (url, body) => {
      const r = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-NGG-CSRF': (document.cookie.match(/ngg_csrf=([^;]*)/) || [])[1] || '' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    // The double-submit CSRF cookie is minted by /api/auth/me.php, which is the
    // SPA's boot call — so a kiosk gets one simply by loading the page. Do the
    // same rather than inventing a token.
    await fetch(base + '/api/auth/me.php', { credentials: 'include' });
    const unlock = await post(base + '/api/public/gate-unlock.php', { gate, password: pw });
    const s = await post(base + '/api/public/gate.php', { action: 'checkin', gate, token: stu });
    const v = await post(base + '/api/public/gate.php', { action: 'checkin', gate, token: vol });
    const dupe = await post(base + '/api/public/gate.php', { action: 'checkin', gate, token: stu });
    const outStu = await post(base + '/api/public/gate.php', { action: 'checkout', gate, token: stu });
    const junk = await post(base + '/api/public/gate.php', { action: 'checkin', gate, token: 'SUMQR-NOTREAL' });
    return { unlock: unlock.status, s, v, dupe, outStu, junk };
  }, { base: BASE, gate: GATE, pw: DESK_PW, stu: STU_TOKEN, vol: VOL_TOKEN });

  is(api.unlock === 200, 'the desk unlocks with its password');
  is(api.s.status === 200 && api.s.body.student && api.s.body.student.fullName === 'Scan Kid',
    'a scanned student card checks the student in by name');
  is(api.v.status === 200 && api.v.body.student && api.v.body.student.fullName === 'Scan Instructor',
    'a scanned volunteer card checks the instructor in through the same scanner');
  is(api.dupe.status === 200 && api.dupe.body.already === true, 'a second scan of the same card reads as already checked in');
  is(api.outStu.status === 200 && !!api.outStu.body.checkOutAt, 'the same card scans back OUT');
  is(api.junk.status === 400 && api.junk.body.error === 'qr_unassigned', 'an unknown code is refused, not silently accepted');

  const rows = php(`echo (int)(db_row("SELECT COUNT(*) c FROM attendance")['c'] ?? 0);`).trim();
  is(rows === '2', `both scans landed one attendance row each (got ${rows})`);

  is(pageErrs.length === 0, 'no uncaught page errors across the whole chain');
  if (pageErrs.length) console.error('       ', pageErrs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(fail
    ? `\n❌ SCANNERS: ${pass} passed, ${fail} failed\n`
    : `\n✅ SCANNERS: ${pass} passed, 0 failed (encode → decode → parse → API)\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  ✗ harness error:', e && e.message || e); process.exit(1); });
