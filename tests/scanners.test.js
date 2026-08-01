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
    /* Dummy keys, never called: their only job is to make this host COUNT as
       one with a media cloud, which is the branch worth testing. A host with no
       cloud is meant to stay silent about local storage, and the PHP suite
       covers that side. */
    'cloudinary' => ['cloud_name' => 'test-cloud', 'api_key' => 'k', 'api_secret' => 's'],
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
  /* Name the unfinished requests if 'networkidle' never arrives. A bare
     "goto: Timeout 30000ms exceeded" says nothing about which request is
     still open, and that is the whole diagnosis — this is what identified a
     fire-and-forget fetch() in the error boundary whose response body was
     never read, holding its connection open for the life of the page. */
  const pending = new Set();
  page.on('request', r => pending.add(r.url()));
  page.on('requestfinished', r => pending.delete(r.url()));
  page.on('requestfailed', r => pending.delete(r.url()));
  try {
    await page.goto(BASE + '/tests/_scan_fixture.html', { waitUntil: 'networkidle' });
  } catch (e) {
    console.error('   still in flight:\n     ' + (Array.from(pending).join('\n     ') || '(none)'));
    throw e;
  }

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

  /* ── No API response may be HTTP-cacheable ────────────────────────────────
   * The client sends every read as a plain GET (no body ⇒ GET), and Apache's
   * mod_expires block ends with `ExpiresDefault "access plus 1 hour"` —
   * application/json is not one of the types it names, so JSON replies used
   * to inherit a one-hour freshness window. The browser then answered reads
   * from its own cache without asking the server, and an admin's save looked
   * like it had silently done nothing for the next hour.
   *
   * Asserted on the header rather than end-to-end on purpose: `php -S` sends
   * no Expires header of its own, so a staleness test here would pass even
   * with the bug present. The header is the thing that has to be true. */
  const cacheHdrs = await page.evaluate(async (base) => {
    const head = async (u) => {
      const r = await fetch(u, { credentials: 'include', cache: 'reload' });
      await r.text().catch(() => {});
      return (r.headers.get('cache-control') || '').toLowerCase();
    };
    return {
      pub:  await head(base + '/api/public/status.php'),
      auth: await head(base + '/api/auth/me.php'),
    };
  }, BASE);
  is(/no-store/.test(cacheHdrs.pub), `a public API read is no-store, not cacheable ("${cacheHdrs.pub}")`);
  is(/no-store/.test(cacheHdrs.auth), `an auth API read is no-store too ("${cacheHdrs.auth}")`);

  /* ── The SERVER's encoder, read by the kiosks' own decoder ─────────────────
   * The QR in an ID email is now produced in PHP, because the case that needed
   * it most — an ID issued when a parent clicks a consent link at 2am — has no
   * browser to render one. An encoder is only correct if a real reader agrees, so
   * the server's PNG is decoded here with jsQR, the same decoder the kiosks load,
   * and the text has to come back byte-identical.
   *
   * Every version boundary is covered, because three of the four bugs this found
   * were invisible below a size threshold: a reversed Reed-Solomon generator, a
   * format area that blanked two timing modules, and a version-information block
   * written with its rows inverted (which decoded perfectly up to 41x41 and on
   * nothing above it). */
  const serverQr = (() => {
    const cases = [];
    // Short, a mid-size real payload, and the exact capacity of each version that
    // changes something structural: 7 adds the version block, 10 widens the
    // character count to 16 bits, 20 is the last supported.
    [[1, 14], [4, 62], [6, 106], [7, 122], [9, 180], [10, 213], [14, 362], [20, 666]].forEach(([v, cap]) => {
      cases.push({ v, text: 'https://x.org/q/' + 'A'.repeat(Math.max(1, cap - 16)) });
    });
    cases.push({ v: 1, text: 'https://n.co/q/A' });
    cases.push({ v: 3, text: 'https://next.afrovanguard.org.ng/q/SUMQR-TEST123' });
    return cases.map(c => {
      const b64 = php(`echo base64_encode(qr_encode_png(${JSON.stringify(c.text)}, 6));`);
      return { ...c, b64 };
    });
  })();
  const decoded = await page.evaluate(async (items) => {
    const out = [];
    for (const it of items) {
      if (!it.b64) { out.push({ text: null, note: 'empty png' }); continue; }
      const img = new Image();
      try {
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + it.b64; });
      } catch (_) { out.push({ text: null, note: 'image would not load' }); continue; }
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      const r = window.jsQR(d.data, cv.width, cv.height);
      out.push({ text: r ? r.data : null, dim: cv.width });
    }
    return out;
  }, serverQr.map(c => ({ b64: c.b64 })));
  const badQr = serverQr.filter((c, i) => (decoded[i] || {}).text !== c.text);
  is(badQr.length === 0,
    'the server-side encoder is read back correctly by jsQR at every version (' + serverQr.length + ' payloads)');
  if (badQr.length) console.error('        failed at v' + badQr.map(c => c.v).join(', v'));

  /* And it agrees with the BROWSER encoder about what it encoded — not
     module-for-module (the mask each picks may differ) but as text, which is the
     only thing a scanner reports. Two encoders that disagree here would be found
     at a gate on a Saturday morning. */
  const agree = await page.evaluate((text) => {
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), scale = 6, quiet = 4, px = (n + quiet * 2) * scale;
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    const d = ctx.getImageData(0, 0, px, px);
    const res = window.jsQR(d.data, px, px);
    return res ? res.data : null;
  }, 'https://next.afrovanguard.org.ng/q/SUMQR-TEST123');
  is(agree === 'https://next.afrovanguard.org.ng/q/SUMQR-TEST123',
    'the browser encoder decodes to the same text, so both agree at level M');

  /* ── An email sent months ago still shows its QR ───────────────────────────
   * Every ID email carries an <img> pointing at api/public/qr.php. That endpoint
   * used to 404 on a cache miss, which is a broken-image icon in a message nobody
   * can re-send from — and permanent, because the file it was waiting for was
   * never going to appear. Messages sent before the encoder existed, a storage
   * directory cleared between hosts, a failed write: all ordinary, all the same
   * result. It encodes on demand now, so this deletes the cached file and asks
   * over HTTP exactly as a mail client would. */
  php(`@unlink(qr_cache_path('${STU_TOKEN}'));`);
  const healed = await page.evaluate(async (url) => {
    const r = await fetch(url, { cache: 'reload' });
    if (!r.ok) return { status: r.status, text: null };
    const blob = await r.blob();
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext('2d').drawImage(bmp, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    const q = window.jsQR(d.data, cv.width, cv.height);
    return { status: r.status, type: blob.type, text: q ? q.data : null };
  }, BASE + '/api/public/qr.php?t=' + STU_TOKEN);
  is(healed.status === 200 && healed.type === 'image/png',
    'the QR endpoint answers with a PNG even when nothing has cached one (' + healed.status + ')');
  is(typeof healed.text === 'string' && healed.text.indexOf('/q/' + STU_TOKEN) !== -1,
    'and it decodes to that student\'s profile URL, so an old email heals itself');
  // A token bound to nothing is still refused — this is not a QR-for-anything.
  const bogus = await page.evaluate(async (url) => (await fetch(url, { cache: 'reload' })).status,
    BASE + '/api/public/qr.php?t=NOT-A-REAL-TOKEN-AT-ALL');
  is(bogus === 404, 'a token bound to no record is still refused (' + bogus + ')');

  /* ── The upload fallback reports itself, over HTTP ─────────────────────────
   * When a configured media cloud refuses an upload the client keeps the image
   * locally and carries on, which is right. It used to do so in complete
   * silence — a cloud with rotated keys looked exactly like a working one from
   * every screen. Tested at the HTTP layer because a domain test cannot see a
   * missing route file, and this endpoint is only ever reached by a beacon that
   * nothing is waiting on: a 404 here would be invisible forever. */
  php(`db_exec("DELETE FROM ops_events WHERE source = 'cloudinary.upload'");`);
  const beacon = await page.evaluate(async (url) => {
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ kind: 'headshot', reason: 'signed: upload_failed_401' }) });
    return { status: r.status, body: await r.text() };
  }, BASE + '/api/public/upload-fallback.php');
  is(beacon.status === 200, 'the upload-fallback beacon has a route to land on (' + beacon.status + ')');
  const recorded = php(`$r = db_row("SELECT kind, detail FROM ops_events WHERE source = 'cloudinary.upload' LIMIT 1"); echo $r ? $r['kind'] . '|' . $r['detail'] : '';`).trim();
  /* Recorded only when a cloud is CONFIGURED — the test host has keys in its
     config, so this is the interesting branch. A deployment deliberately
     running without a cloud must stay quiet, which the PHP suite covers. */
  is(/^warn\|kind=headshot/.test(recorded) && recorded.indexOf('401') !== -1,
    'and a refused upload becomes a warning an admin can see (' + (recorded || 'nothing recorded') + ')');

  is(pageErrs.length === 0, 'no uncaught page errors across the whole chain');
  if (pageErrs.length) console.error('       ', pageErrs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(fail
    ? `\n❌ SCANNERS: ${pass} passed, ${fail} failed\n`
    : `\n✅ SCANNERS: ${pass} passed, 0 failed (encode → decode → parse → API)\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  ✗ harness error:', e && e.message || e); process.exit(1); });
