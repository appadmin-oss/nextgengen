#!/usr/bin/env node
/* ============================================================================
   Public self-registration — the form itself, in a browser.

   Three changes are asserted here, and all three are the kind that only a real
   browser can prove:

   1 · THE 413. The headshot on this form travels inline, inside the submission
       JSON, because a public sign-up has no session and cannot use the signed
       upload path. A phone hands over 4–12MB and base64 adds a third, so every
       server in front of PHP refused the body — LimitRequestBody,
       client_max_body_size, post_max_size — and the family got a bare 413 on
       the last tap of a five-minute form. The form now resamples to 1000px
       before the file ever becomes a data URL. Asserted both as a RATIO against
       the file on disk and as an absolute ceiling on the body that goes on the
       wire, so it fails if the resampler is bypassed again.

   2 · DATE OF BIRTH. The form asks for a date; the row keeps a derived age,
       because every band, report and eligibility rule downstream reads `age`.
       The point is that a family cannot type an age that disagrees with a
       birthday, so the check is that the SUBMITTED row's age matches the date.

   3 · ONE CONSENT TICK. The guardian filling this in is the person whose
       consent is needed, so it is taken here, once, against a linked document —
       not emailed as a second round. Publication permission stays a separate,
       optional answer: consent conditioned on losing a child's place is not
       freely given, so it cannot ride inside the mandatory tick.

   Self-contained: throwaway api/config.php (SQLite temp), seeds a cohort +
   public gate + centre, serves the SOURCE tree with PHP's built-in server,
   drives Chromium, then cleans up. NEVER touches an existing config.php.

   Run:  node tests/forms-selfreg-ui.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, SELFREG_PORT (default 8205)
   ============================================================================ */
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SELFREG_PORT || '8205';
const BASE = `http://127.0.0.1:${PORT}`;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-selfreg-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-selfreg-cache-${process.pid}`);
const PHOTO = path.join(os.tmpdir(), `ngg-selfreg-photo-${process.pid}.jpg`);
const GATE = 'GL-SELFUI';
const DOB = '2013-04-02';
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
  const f = path.join(os.tmpdir(), `ngg-selfui-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}

let server;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  for (const f of [CFG, DB, PHOTO]) { try { fs.unlinkSync(f); } catch (_) {} }
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

/* A big, real, portrait JPEG — the thing a phone actually produces. Noise
   rather than flat colour, or JPEG would compress it to nothing and the size
   assertion below would pass without the resampler doing anything. */
function makeBigPhoto() {
  php(`$w=2400; $h=3000; $im=imagecreatetruecolor($w,$h);
    for ($y=0;$y<$h;$y+=4) for ($x=0;$x<$w;$x+=4) {
      $c=imagecolorallocate($im, ($x*7+$y*3)%256, ($x*13+$y*5)%256, ($x*3+$y*11)%256);
      imagefilledrectangle($im,$x,$y,$x+3,$y+3,$c);
    }
    imagejpeg($im, ${JSON.stringify(PHOTO)}, 95);`);
  if (!fs.existsSync(PHOTO)) { console.error('could not build the test photo (GD missing?)'); process.exit(2); }
  return fs.statSync(PHOTO).size;
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
    'cookie_secret' => 'selfui_test_secret_0123456789abc',
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
    const originalBytes = makeBigPhoto();

    server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const chromium = loadChromium();
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 420, height: 940 } });
    const page = await context.newPage();
    page.on('pageerror', e => console.error('    [pageerror]', String(e)));

    /* Measure the body the browser actually sends, which is the only number the
       413 cared about. Read off the wire, not off React state. */
    let sentBody = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && /selfreg\.php/.test(r.url())) {
        sentBody = Buffer.byteLength(r.postData() || '');
      }
    });

    await page.goto(BASE + '/apply?g=' + GATE, { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForSelector('input, select', { timeout: 20000 });

    // ── Step 0 · the answers ────────────────────────────────────────────────
    const fill = async (key, value) => {
      const box = page.locator(`[data-fieldkey="${key}"]`).first();
      const input = box.locator('input, select, textarea').first();
      const tag = await input.evaluate(el => el.tagName);
      if (tag === 'SELECT') await input.selectOption(value);
      else await input.fill(value);
    };
    // The form asks for a DATE now; there is no age box to type into any more.
    const ageBoxes = await page.locator('[data-fieldkey="age"] input').count();
    if (ageBoxes === 0) ok('the form asks for a date of birth, not a typed age');
    else bad('a free-typed Age box is still on the form');

    await fill('firstName', 'Ada');
    await fill('lastName', 'Browser');
    await fill('dob', DOB);
    await fill('centre', 'Egbeda');
    await fill('faculty', fac);
    await fill('course', crs);
    await fill('parentName', 'Mrs Browser');
    await fill('parentPhone', '08030000123');
    await fill('parentEmail', 'browser@example.org');
    await page.click('button:has-text("Continue → Photo")');
    await page.waitForTimeout(600);

    // ── Step 1 · the photo, and the whole point of this file ────────────────
    await page.setInputFiles('input[type="file"]', PHOTO);
    // Resampling is async (canvas + pica), so wait for the form to accept it.
    await page.waitForSelector('button:has-text("Continue → Consent"):not([disabled])', { timeout: 30000 });
    const photoLen = await page.evaluate(() => {
      const img = document.querySelector('img[alt="The photo you chose"]');
      return img ? (img.getAttribute('src') || '').length : 0;
    });
    if (!photoLen) {
      bad('the chosen photo never became a preview — the resize path threw');
    } else if (photoLen < originalBytes / 4) {
      ok(`the headshot is resampled before it is embedded (${Math.round(originalBytes / 1024)}KB file → ${Math.round(photoLen / 1024)}KB data URL)`);
    } else {
      bad(`the photo was NOT shrunk: ${Math.round(originalBytes / 1024)}KB file → ${Math.round(photoLen / 1024)}KB data URL (this is the 413)`);
    }

    await page.click('button:has-text("Continue → Consent")');
    await page.waitForTimeout(500);

    // ── Step 2 · one tick, one link, publication kept separate ──────────────
    const boxes = await page.locator('input[type="checkbox"]').count();
    if (boxes === 2) ok('consent is one required tick plus the separate publication answer');
    else bad(`expected 2 checkboxes on the consent step (consent + publication), found ${boxes}`);

    const docLink = await page.locator('a:has-text("Read the full consent document")').count();
    if (docLink === 1) ok('the full consent document is linked beside the tick');
    else bad('there is no link to the full consent document — one tick cannot stand for clauses nobody can read');

    // The derived age, shown back for checking against the date given.
    const summary = await page.locator('text=/born ' + DOB + '/').count();
    if (summary === 1) ok('the summary shows the age worked out from the date of birth');
    else bad('the review summary does not show the derived age and birth date');

    /* Sending with the tick clear must refuse and SAY SO — not sit there
       greyed out. A dead button that will not explain itself is the worst
       outcome on the last tap of a five-minute form. */
    await page.click('button:has-text("Agree & send registration")');
    await page.waitForTimeout(700);
    if (php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students")['c'];`) === '0') ok('sending without the tick registers nobody');
    else bad('a submission went through with the consent box clear');
    const alerted = await page.locator('[role="alert"]').first().textContent().catch(() => '');
    if (/tick/i.test(String(alerted || ''))) ok('…and it says why, rather than doing nothing');
    else bad(`no usable message when the tick was missing (got "${String(alerted || '').slice(0, 80)}")`);

    // Tick it and send for real.
    await page.locator('input[type="checkbox"]').first().check();
    await page.click('button:has-text("Agree & send registration")');
    await page.waitForSelector('text=Sent for checking', { timeout: 25000 });
    ok('a ticked submission goes through');

    /* The ceiling is nginx's client_max_body_size default of 1MB — the
       tightest limit in common use, and the one a shared host is most likely
       to be sitting behind. A real photograph lands nearer 150KB; this test
       feeds it incompressible noise, so passing here is the worst case. */
    if (sentBody > 0 && sentBody < 1000000) ok(`the request body is ${Math.round(sentBody / 1024)}KB — inside a 1MB body limit even for an incompressible photo`);
    else bad(`the request body was ${Math.round(sentBody / 1024)}KB, which is what produced the 413`);

    const row = php(`$r = db_row("SELECT dob, age, regStatus FROM summer_students WHERE fullName LIKE 'Ada%' LIMIT 1");`
      + `echo ($r['dob'] ?? '') . '|' . (int)($r['age'] ?? 0) . '|' . ($r['regStatus'] ?? '');`);
    const want = `${DOB}|${php(`echo dob_age(${JSON.stringify(DOB)});`)}|self_pending`;
    if (row === want) ok(`the row keeps the date and the age derived from it (${row})`);
    else bad(`expected "${want}", got "${row}"`);

    // The ledger: everything the place depends on granted, publication declined
    // because it was left unticked, and the place unaffected either way.
    const ledger = php(`$id = (string) db_row("SELECT studentId FROM summer_students WHERE fullName LIKE 'Ada%' LIMIT 1")['studentId'];`
      + `$out = []; foreach (db_all("SELECT type, status, method FROM consents WHERE studentId = ? ORDER BY type", [$id]) as $c)`
      + ` $out[] = $c['type'] . ':' . $c['status'] . ':' . $c['method']; echo implode(',', $out);`);
    const parts = ledger ? ledger.split(',') : [];
    const bad0 = parts.filter(p => p.split(':')[2] !== 'self_serve');
    const pubRows = parts.filter(p => /^(media|site_visibility):/.test(p));
    const others = parts.filter(p => !/^(media|site_visibility):/.test(p));
    if (parts.length && !bad0.length) ok(`every clause is on the ledger as self_serve (${parts.length} rows)`);
    else bad(`the consent ledger is wrong: ${ledger || '(empty)'}`);
    if (others.length && others.every(p => p.split(':')[1] === 'granted')) ok('the one tick granted everything the place depends on');
    else bad(`bundled consents were not granted: ${others.join(', ')}`);
    if (pubRows.length === 2 && pubRows.every(p => p.split(':')[1] === 'declined')) ok('an unticked publication box is recorded as declined, and the place stands');
    else bad(`publication consent was not recorded as declined: ${pubRows.join(', ')}`);

    /* And approval finishes it — no second consent email, ID issued there. */
    const rev = php(`db_insert('gate_links', ['gateId'=>'GL-REVUI','kind'=>'review','name'=>'Desk','cohortId'=>'C1','centreId'=>'','status'=>'active','passHash'=>'','createdBy'=>'seed','createdAt'=>now_iso()]);`
      + `$id = (string) db_row("SELECT studentId FROM summer_students WHERE fullName LIKE 'Ada%' LIMIT 1")['studentId'];`
      + `$r = backend_dispatch('selfreg.approve', ['gate'=>'GL-REVUI','studentId'=>$id]);`
      + `$s = db_row("SELECT regStatus, token FROM summer_students WHERE studentId=?", [$id]);`
      + `echo ($r['regStatus'] ?? '') . '|' . count($r['verificationSending'] ?? ['x']) . '|' . ($s['regStatus'] ?? '') . '|' . (trim((string)$s['token']) !== '' ? 'id' : 'noid');`);
    if (rev === 'verified|0|verified|id') ok('approving completes the registration and issues the ID — nothing emailed to re-ask for consent');
    else bad(`approval did not complete the registration: "${rev}"`);
  } catch (e) {
    bad('threw: ' + (e && e.stack ? e.stack : String(e)));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }

  if (failed) { console.error(`\n❌ FAIL: ${failed} failed (self-registration form)`); process.exit(1); }
  console.log('\n✅ SELF-REGISTRATION FORM: all checks passed');
})().catch((e) => { cleanup(); console.error(e); process.exit(1); });
