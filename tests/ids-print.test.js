#!/usr/bin/env node
/* ============================================================================
   ID Card Studio — printing, against the faults seen on the live site.

   Held, under the production Content-Security-Policy:
   - A browser holding last week's card-export.js (no renderFaceFast) still
     prints: the stale copy is noticed and fetched again past the cache,
     instead of every card failing to draw ("Nothing could be exported").
   - A record whose stored photo file is gone (photo.php 404) is named before
     printing and can be taken off in one press, rather than printing an
     empty photo box.
   - Cards of different sizes go onto sheets of their own, automatically, and
     print in one PDF; the print-shop export makes one PDF per size.
   - An uploaded image printed in copies draws once and prints every copy.
   - A sheet can be removed from the run, and put back with Undo.
   - A card photo from anywhere but Cloudinary is shown whole.

   Run:  node tests/ids-print.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.IDP_PORT || '8297';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-idp-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-IDP-ADM';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
/* What a downloaded PDF holds, read from its (uncompressed) object dictionaries. */
function pdfFacts(buf) {
  const t = buf.toString('latin1');
  const widths = [...t.matchAll(/\/Subtype \/Image[^>]*?\/Width (\d+)/g)].map(m => +m[1]);
  return { ok: t.startsWith('%PDF-'), pages: (t.match(/\/Type \/Page\b(?!s)/g) || []).length,
    a4: /\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/.test(t), images: widths.length, minImageW: widths.length ? Math.min(...widths) : 0,
    // Page text lives in Flate streams: inflate the ones that are not images.
    text: [...t.matchAll(/\/FlateDecode[^>]*>>\s*stream\r?\n/g)].map(m => {
      const start = m.index + m[0].length, end = t.indexOf('endstream', start);
      try { return require('zlib').inflateSync(buf.subarray(start, end)).toString('latin1'); } catch (_) { return ''; }
    }).join('\n') };
}

let server, browser, passed = 0, failed = 0, staleServed = 0;
const CSP = (fs.readFileSync(path.join(ROOT, '.htaccess'), 'utf8').match(/Content-Security-Policy "([^"]+)"/) || [])[1].replace(/\\\n/g, ' ');
// card-export.js as it was before renderFaceFast existed: what a browser cached the week before the deploy.
const OLD_CE = execSync('git show 79bf2bf^:vendor/card-export.js', { cwd: ROOT, maxBuffer: 1 << 26 }).toString();
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
// Layout and Designs are closed sections in the settings column: open one (and leave it open).
const openMore = (pg, title) => pg.evaluate(t => { const d = [...document.querySelectorAll('details.ids-more')].find(x => x.querySelector('.ids-more-t').textContent === t); if (d && !d.open) d.open = true; }, title).then(() => pg.waitForTimeout(150));
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  id studio: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'id_print_secret_0123456789abcdefghij',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    // Four members with a photo, one whose stored photo file is gone (photo.php answers 404), and the admin.
    let seed = `db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-IDP-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Tunde Akin','email'=>'tunde@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','photoUrl'=>'','displayId'=>'026-001','createdAt'=>${now},'updatedAt'=>${now}]);`;
    for (let i = 1; i <= 5; i++) {
      const photo = i === 5 ? `'/api/public/photo.php?p=0123456789abcdef0123456789abcdef.jpg'` : `'/assets/logo.png'`;
      seed += `db_insert('members', ['memberId'=>'NGG-IDP-${i}','fullName'=>'${i === 5 ? 'Ogunlaja Sarah Ayobami' : 'Member ' + String.fromCharCode(64 + i) + ' Print'}','email'=>'idp${i}@example.org','type'=>'NGG','status'=>'active','role'=>'member',`
        + `'centre'=>'Egbeda','track'=>'Coding','displayId'=>'026-${String(100 + i)}','photoUrl'=>${photo},'createdAt'=>${now},'updatedAt'=>${now}]);`;
    }
    php(seed, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const errs = [];
    const open = async (w, h, at) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      /* The production CSP from .htaccess (php -S does not read it), and the week-old
         card-export.js a browser held from before the last deploy, served for the
         unversioned URL exactly as a stale HTTP cache would. */
      await ctx.route(u => true, async route => {
        const url = route.request().url();
        if (/\/vendor\/card-export\.js$/.test(url)) { staleServed++; return route.fulfill({ status: 200, contentType: 'application/javascript', body: OLD_CE }); }
        const r = await route.fetch();
        if (!/text\/html/.test(r.headers()['content-type'] || '')) return route.fulfill({ response: r });
        return route.fulfill({ response: r, headers: Object.assign({}, r.headers(), { 'content-security-policy': CSP }) });
      });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 240)));
      await p.goto(BASE + (at || '/club/id-cards'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      await p.waitForSelector('.ids-app', { timeout: 30000 });
      return p;
    };
    // Waits for the toast to SAY something: an earlier toast can still be on screen when the next action fires.
    const toastHas = (p, re) => p.waitForFunction(src => new RegExp(src).test((document.querySelector('.ids-toast') || {}).innerText || ''), re.source, { timeout: 8000 }).then(() => true, () => false);


    console.log('desktop (1440), production CSP, stale print tools in the cache');
    const P = await open(1440, 900);
    await P.waitForSelector('.ids-rec', { timeout: 20000 });
    await P.click('.ids-fchip:has-text("New")');
    await P.click('.ids-btn--outline:has-text("Add 5 to the sheet")');
    const missing = await P.waitForFunction(() => /can’t be loaded/.test((document.querySelector('.ids-set') || {}).innerText || ''), null, { timeout: 20000 }).then(() => true, () => false);
    chk('a photo whose file is gone on the server is named before printing', missing && /Ogunlaja Sarah Ayobami/.test(await P.innerText('.ids-set')));
    chk('…its slot says so', (await P.$$('.ids-slot-warn.is-bad')).length === 1);
    chk('…and the print is held until it is dealt with', await P.$eval('.ids-btn--print', b => b.getAttribute('aria-disabled') === 'true'));
    await P.click('.ids-set .ids-linkbtn:has-text("Take it off")');
    await P.waitForTimeout(300);
    chk('one press takes it off the sheet', /4 cards ·/.test(await P.innerText('.ids-stat')) && await P.$eval('.ids-btn--print', b => b.getAttribute('aria-disabled') !== 'true'));
    chk('a photo from the local store is shown whole on the card', (await P.$$('.ids-slot.is-card [data-card-photo="plain"]')).length === 4);

    // An image made elsewhere, at A6, in two copies.
    const png = await P.evaluate(() => { const c = document.createElement('canvas'); c.width = 620; c.height = 874; const x = c.getContext('2d'); x.fillStyle = '#0B1F51'; x.fillRect(0, 0, 620, 874); x.fillStyle = '#FCB316'; x.fillRect(60, 60, 500, 300); return c.toDataURL('image/png').split(',')[1]; });
    const file = path.join(TMP, 'NEW NGGC Members ID 2 (A5) (7).png');
    fs.writeFileSync(file, Buffer.from(png, 'base64'));
    await P.click('.ids-seg-opt:has-text("Uploaded")');
    await P.setInputFiles('.ids-drop input[type=file]', file);
    await P.waitForSelector('.ids-up');
    chk('an uploaded image is shown whole by default', /Fill the card|White bars|Fits the card/.test(await P.innerText('.ids-up')) && !/Edges cropped/.test(await P.innerText('.ids-up')));
    await P.click('.ids-up .ids-stepper button[aria-label="One more"]');
    await openMore(P, 'Layout');
    await P.click('.ids-size:has-text("A6 portrait")');
    await P.waitForTimeout(400);
    chk('cards of another size go onto sheets of their own: 4 member cards on one, 2 A6 images on two more', /Sheet 1 of 3/.test(await P.innerText('.ids-pager')) && /2 sizes/.test(await P.innerText('.ids-set')));
    await P.click('[aria-label="Next sheet"]');
    chk('…and the pager says which size a sheet is', /Sheet 2 of 3 · 105 × 148 mm/.test(await P.innerText('.ids-pager')) && (await P.$$('.ids-slot.is-card')).length === 1);
    await P.click('[aria-label="Next sheet"]');
    await P.click('.ids-pager .ids-iconbtn--danger');
    await P.waitForSelector('[role=alertdialog]:has-text("Remove sheet 3?")');
    await P.click('[role=alertdialog] .ids-btn--primary');
    chk('a sheet can be removed (with a confirm naming what goes)', await toastHas(P, /Sheet 3 removed · 1 card off the run/) && /Sheet 2 of 2/.test(await P.innerText('.ids-pager')));
    await P.click('.ids-toast-undo');
    await P.waitForTimeout(300);
    chk('…and Undo puts it back', /of 3/.test(await P.innerText('.ids-pager')));

    await P.click('.ids-btn--print');
    await P.waitForSelector('[role=alertdialog]');
    chk('the confirm lists both sizes and their sheets', /54 × 85\.6 mm · 4 cards, 9 per sheet · sheet 1/.test(await P.innerText('.ids-sum')) && /105 × 148 mm · 2 cards, 1 per sheet · sheets 2–3/.test(await P.innerText('.ids-sum')));
    const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 120000 }), P.click('[role=alertdialog] .ids-btn--primary')]);
    const pdf = pdfFacts(fs.readFileSync(await dl.path()));
    chk('Print makes ONE PDF holding both sizes: a packing list and 3 sheets', pdf.ok && pdf.pages === 4 && pdf.images >= 5 && /Packing list/.test(pdf.text));
    chk('…drawn by the current print tools, fetched again past the stale copy', staleServed >= 1 && await P.evaluate(() => typeof CardExport.renderFaceFast === 'function'));
    chk('…with no card left out', !(await P.$('.ids-dialog:has-text("Nothing was printed")')));
    await toastHas(P, /logged as CRUN-/);
    await P.waitForSelector('.ids-dialog:has-text("print properly?")', { timeout: 10000 }).catch(() => {});
    if (await P.$('.ids-dialog:has-text("print properly?")')) await P.click('.ids-dialog .ids-btn--primary');

    // The uploaded copies are still on the sheet (records left the queue when printed): export them for a print shop.
    await P.waitForTimeout(300);
    const left = await P.innerText('.ids-stat');
    const downloads = [];
    P.on('download', d => downloads.push(d.suggestedFilename()));
    await P.click('button:has-text("Export files for a print shop")');
    await P.waitForSelector('[role=alertdialog]');
    await P.click('[role=alertdialog] .ids-btn--primary');
    await P.waitForSelector('.ids-dialog:has-text("Exported")', { timeout: 120000 }).catch(() => {});
    const res = await P.evaluate(() => Array.from(document.querySelectorAll('.ids-dialog')).map(d => d.innerText).join(' '));
    chk('the print-shop export of the copies works and leaves nothing out (' + left.replace(/\s+/g, ' ') + ')', /Exported/.test(res) && !/couldn’t be drawn/.test(res) && downloads.length === 1 && /print-shop\.pdf$/.test(downloads[0]));
    await P.context().close();

    chk('no page errors anywhere', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (id studio printing)`);
    process.exit(failed ? 1 : 0);
  }
})();
