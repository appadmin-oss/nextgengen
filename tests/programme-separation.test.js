#!/usr/bin/env node
/* ============================================================================
   NGG and Summer School keep their own course and centre lists, end to end:
   the real join form and the real Control Room.

   What must hold:
     · The NGG join form offers the Club's courses at the Club's centres; the
       Summer form offers Summer School's catalogue at Summer centres. Neither
       offers the other's.
     · Each programme keeps its own saved draft.
     · Curriculum → Courses edits the Club's list, and says Summer's is separate.
     · People → Centres says which programmes run at a centre.

   Run:  node tests/programme-separation.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SEP_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-sep-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'programmes');

let _seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
function get(url, headers) {
  return new Promise((res, rej) => http.get(url, { headers }, r => {
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) }));
  }).on('error', rej));
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  programme separation: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'sep_test_secret_0123456789abcdefghij',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-SEP-ADM','fullName'=>'Sep Admin','email'=>'sep-adm@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `setting_set('academy_catalogue', ['Music' => ['Piano', 'Talking Drums']], 't');`
      // The NGG divisions seed is marked done so this fixture's own Club list stands.
      + `setting_set('club_catalogue_seed', 'ngg-divisions-2026-10', 't');`
      + `setting_set('club_catalogue', ['Media' => ['Media Lab'], 'AI & Technology' => ['Practical Coding']], 't');`
      + `foreach ([['CEN-1','Ayobo Club House','AY','ngg'],['CEN-2','Ijaiye Summer Venue','IJ','summer'],['CEN-3','Egbeda','EG','ngg,summer']] as $c) db_insert('centres', ['centreId'=>$c[0],'name'=>$c[1],'code'=>$c[2],'status'=>'active','programmes'=>$c[3],'slug'=>strtolower($c[2]),'createdAt'=>now_iso()]);`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));

    // NGG: the Club application, whose centres are its own radio cards.
    const clubCentres = () => pg.$$eval('#apf-fld-centre [role=radio] b', bs => bs.map(b => b.textContent));
    const clubDraft = () => pg.evaluate(() => (JSON.parse(localStorage.getItem('ngg-apply') || '{}').v || {}));
    await pg.goto(BASE + '/join?program=anchor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForFunction(() => document.querySelectorAll('#apf-fld-centre [role=radio]').length > 1, null, { timeout: 30000 });
    const ngg = await clubCentres();
    chk('the NGG form offers the Club\'s centres and not a Summer-only venue', ngg.includes('Ayobo Club House') && ngg.includes('Egbeda') && !ngg.includes('Ijaiye Summer Venue'));
    const offerN = await pg.evaluate(() => NGGApi.public.programme('anchor'));
    chk('the NGG form offers the Club\'s courses and not Summer School\'s', JSON.stringify(offerN.faculties).includes('Media Lab') && !JSON.stringify(offerN.faculties).includes('Piano'));
    await pg.click('#apf-fld-centre [role=radio]:has-text("Ayobo Club House")');
    await pg.waitForFunction(() => (JSON.parse(localStorage.getItem('ngg-apply') || '{}').v || {}).centre === 'Ayobo Club House', null, { timeout: 5000 })
      .then(() => chk('the NGG draft is saved under its own key', true), () => chk('the NGG draft is saved under its own key', false));

    // Summer School registers through its gated sign-up link, which offers Summer's own centres and courses.
    const offerS = await pg.evaluate(() => NGGApi.public.programme('summer'));
    chk('Summer School\'s list offers Summer centres and not a Club-only centre', offerS.centres.map(c => c.name).includes('Ijaiye Summer Venue') && !offerS.centres.map(c => c.name).includes('Ayobo Club House'));
    chk('the Summer form offers Summer School\'s catalogue and not the Club\'s courses', JSON.stringify(offerS.faculties).includes('Piano') && !JSON.stringify(offerS.faculties).includes('Media Lab'));

    // A Summer venue in a link to the NGG form is cleared, not submitted.
    await pg.evaluate(() => { localStorage.removeItem('ngg-apply'); });
    await pg.goto(BASE + '/join?program=anchor&track=Piano&centre=Ijaiye%20Summer%20Venue', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForFunction(() => document.querySelectorAll('#apf-fld-centre [role=radio]').length > 1, null, { timeout: 30000 });
    await pg.waitForFunction(() => { const d = JSON.parse(localStorage.getItem('ngg-apply') || '{}').v || {}; return d.centre === '' && !d.course; }, null, { timeout: 10000 })
      .then(() => chk('a Summer course or venue in a link to the NGG form is cleared', true), () => chk('a Summer course or venue in a link to the NGG form is cleared', false));
    void clubDraft;
    await pg.screenshot({ path: path.join(SHOTS, 'join-ngg.png') });

    // Control Room: Curriculum → Courses, and People → Centres.
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-SEP-ADM'"), true);`, ['session']);
    const actx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    await actx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
      { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const ap = await actx.newPage();
    ap.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await ap.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
    // The Club's course list lives in Learning → Divisions & courses.
    await ap.evaluate(() => window.__adminSection('divisions'));
    await ap.waitForSelector('.cr-dv-card', { timeout: 30000 }).catch(() => {});
    await ap.waitForFunction(() => /media lab/i.test(document.querySelector('.admin-main')?.innerText || ''), null, { timeout: 30000 });
    const main = await ap.$eval('.admin-main', el => el.innerText);
    chk('Learning → Divisions & courses shows the Club\'s own list and says Summer School keeps its own', /media lab/i.test(main) && !/talking drums/i.test(main) && /Summer School keeps its own catalogue/.test(main));
    await ap.fill('input[placeholder="Add a course…"] >> nth=0', 'Video Editing');
    await ap.keyboard.press('Enter');
    await ap.click('button:has-text("Save divisions")');
    await ap.waitForFunction(() => /Saved/.test(document.querySelector('.admin-main')?.innerText || ''), null, { timeout: 15000 });
    chk('saving changes the Club\'s list only', php(`echo json_encode([setting_get('club_catalogue')['Media'] ?? [], setting_get('academy_catalogue')]);`) === '[["Media Lab","Video Editing"],{"Music":["Piano","Talking Drums"]}]');
    await ap.screenshot({ path: path.join(SHOTS, 'club-courses.png'), fullPage: false });

    await ap.evaluate(() => window.__adminSection('centres'));
    await ap.waitForFunction(() => /Ayobo Club House/.test(document.querySelector('.admin-main')?.innerText || ''), null, { timeout: 30000 });
    const cm = (await ap.$eval('.admin-main', el => el.innerText)).toLowerCase();
    chk('People → Centres marks a centre that runs only one programme', cm.includes('ngg club only') && cm.includes('summer only'));
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (programme separation)');
  process.exit(failed ? 1 : 0);
})();
