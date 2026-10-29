#!/usr/bin/env node
/* ============================================================================
   ID Card Studio × Afrovanguard, end to end against BOTH real backends.

   Held: the studio lists Afrovanguard's members with the numbers Afrovanguard
   prints; their cards come onto the sheet drawn by Afrovanguard's own card
   (laid out alone in an iframe, rasterised by snapDOM) — the same pixels
   Afrovanguard draws; a member with no photo is not blocked (initials, as
   designed); printing makes a PDF with every face at print resolution, fronts
   and backs; the run is logged under "afrovanguard" and the printed people
   leave the queue; and no page errors.

   Needs an Afrovanguard site running (its integrations/ngg-cards.php):
     AV_BASE=http://127.0.0.1:8099 AV_SECRET=<its NGG_WEBHOOK_SECRET> node tests/ids-av.test.js
   Skips when AV_BASE does not answer.
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.IDS_AV_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const AV_BASE = process.env.AV_BASE || 'http://127.0.0.1:8099';
const AV_SECRET = process.env.AV_SECRET || '';
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-idsav-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-AV-ADM';
const OUT = process.env.IDS_AV_SHOTS || '';

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
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
function up(url) { return new Promise(r => { const q = http.get(url, s => { s.resume(); r(true); }); q.on('error', () => r(false)); q.setTimeout(1500, () => { q.destroy(); r(false); }); }); }
function pdfFacts(buf) {
  const t = buf.toString('latin1');
  const widths = [...t.matchAll(/\/Subtype \/Image[^>]*?\/Width (\d+)/g)].map(m => +m[1]);
  return { ok: t.startsWith('%PDF-'), pages: (t.match(/\/Type \/Page\b(?!s)/g) || []).length, images: widths.length, minImageW: widths.length ? Math.min(...widths) : 0 };
}

/* Per page, where each image is drawn: [{x, y, w, h}] from "w 0 0 h x y cm … Do". */
function pdfPlacements(buf) {
  const t = buf.toString('latin1'), zlib = require('zlib');
  const pages = [];
  for (const m of t.matchAll(/\/Type \/Page\b(?!s)[\s\S]*?\/Contents (\d+) 0 R/g)) {
    const obj = new RegExp('\\n' + m[1] + ' 0 obj[\\s\\S]*?stream\\r?\\n').exec(t);
    if (!obj) { pages.push([]); continue; }
    const start = obj.index + obj[0].length, end = t.indexOf('endstream', start);
    let s = '';
    try { s = zlib.inflateSync(buf.subarray(start, end)).toString('latin1'); } catch (_) { s = buf.subarray(start, end).toString('latin1'); }
    pages.push([...s.matchAll(/([\d.-]+) 0 0 ([\d.-]+) ([\d.-]+) ([\d.-]+) cm\s*\/I\w* Do/g)].map(k => ({ w: +k[1], h: +k[2], x: +k[3], y: +k[4] })));
  }
  return pages;
}

let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  id studio × afrovanguard: skipped (playwright not installed)'); process.exit(0); }
  if (!AV_SECRET || !(await up(AV_BASE + '/robots.txt'))) { console.log('⏭  id studio × afrovanguard: skipped (no Afrovanguard at ' + AV_BASE + ')'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'id_studio_av_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
    'afrovanguard' => ['org_url' => ${JSON.stringify(AV_BASE)}, 'ngv_webhook_secret' => ${JSON.stringify(AV_SECRET)}],
  ];\n`);
  try {
    fs.mkdirSync(path.join(TMP, 'cache'), { recursive: true });
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-AV-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Tunde Akin','email'=>'tunde@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','photoUrl'=>'/assets/logo.png','displayId'=>'EG-24-0001','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const errs = [];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const P = await ctx.newPage();
    P.on('pageerror', e => errs.push(String(e).slice(0, 240)));
    await P.goto(BASE + '/club/id-cards', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.ids-rec', { timeout: 40000 });

    await P.selectOption('select[aria-label="Kind"]', 'afrovanguard');
    await P.waitForTimeout(300);
    const list = await P.innerText('.ids-recs');
    chk('the studio lists Afrovanguard’s members, with the IDs Afrovanguard prints',
      /Babatunde Adeola/.test(list) && /E-AVM-17-0001/.test(list) && /B-NGV-25-0005/.test(list) && /Omolade Oyedokun/.test(list));
    chk('…all nine of them, and none blocked for want of a photo', (await P.$$('.ids-rec')).length === 9 && !/can’t print/.test(list));
    chk('a member with no photo says it prints initials', /no photo, prints initials/.test(list));

    await P.click('.ids-btn--ink:has-text("Add all 9")');
    await P.waitForSelector('.ids-slot.is-card .ids-face-tpl', { timeout: 60000 });
    await P.waitForFunction(() => [...document.querySelectorAll('.ids-slot.is-card')].every(s => s.querySelector('.ids-face-tpl') || s.querySelector('[data-ids-failed]')), null, { timeout: 90000 });
    chk('every slot is drawn by Afrovanguard’s own card, none failed',
      (await P.$$('.ids-slot.is-card .ids-face-tpl')).length === 9 && !(await P.$('.ids-slot.is-card [data-ids-failed]')));

    /* The same pixels Afrovanguard draws: the studio's raster of Babatunde's
       front against Afrovanguard's own page for that face, at 10 px per mm. */
    const studio = await P.evaluate(async () => {
      const r = { id: '2', raw: { version: 'fidelity', design: '' } };
      const v = await window.idsAvRaster(r, 'front', 254);
      return v.url || '';
    });
    const A = await ctx.newPage();
    await A.setViewportSize({ width: 700, height: 1000 });
    await A.goto(AV_BASE + '/uploads/_scratch/face.php?id=2', { waitUntil: 'networkidle' }).catch(() => {});
    const avShot = studio ? await (await A.$('#h > article')).screenshot() : null;
    const diff = studio && avShot ? await A.evaluate(async ([a, b]) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const [x, y] = await Promise.all([load(a), load('data:image/png;base64,' + b)]);
      const w = Math.min(x.width, y.width), h = Math.min(x.height, y.height);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.drawImage(x, 0, 0, w, h); const p = g.getImageData(0, 0, w, h).data;
      g.clearRect(0, 0, w, h); g.drawImage(y, 0, 0, w, h); const q = g.getImageData(0, 0, w, h).data;
      let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 96) n++;
      return { w: x.width, h: x.height, aw: y.width, ah: y.height, off: n / (w * h) };
    }, [studio, avShot.toString('base64')]) : null;
    if (diff) console.log('       fidelity: studio ' + diff.w + '×' + diff.h + ', Afrovanguard ' + diff.aw + '×' + diff.ah + ', ' + (diff.off * 100).toFixed(3) + '% of pixels off');
    chk('the studio’s card is Afrovanguard’s card: the same size and under 0.5% of pixels off', !!diff && diff.w === diff.aw && Math.abs(diff.h - diff.ah) <= 1 && diff.off < 0.005);
    if (OUT && studio) fs.writeFileSync(path.join(OUT, 'av-studio-front.png'), Buffer.from(studio.split(',')[1], 'base64'));
    await A.close();

    // Backs live in the Printing section (v4), closed until opened.
    await P.evaluate(() => { const d = [...document.querySelectorAll('details.ids-more')].find(x => x.querySelector('.ids-more-t').textContent === 'Printing'); if (d && !d.open) d.open = true; });
    await P.waitForTimeout(150);
    await P.click('.ids-radio:has-text("Double-sided · long edge")');
    await P.click('.ids-seg-opt:has-text("Backs")');
    await P.waitForFunction(() => [...document.querySelectorAll('.ids-slot.is-card')].every(s => s.querySelector('.ids-face-tpl')), null, { timeout: 90000 }).catch(() => {});
    chk('the backs are Afrovanguard’s backs', (await P.$$('.ids-slot.is-card .ids-face-tpl')).length === 9);
    /* Mirrored like NGG's: a long-edge flip turns the sheet left to right, so
       each row runs the other way on the back — the back of the card in the
       first column sits in the last, behind its own front. */
    const where = () => P.$$eval('.ids-slot.is-card', els => els.map(e => { const r = e.getBoundingClientRect(); return { who: (e.getAttribute('aria-label') || '').replace(/^Slot \d+: /, '').replace(/,.*$/, ''), x: Math.round(r.x), y: Math.round(r.y) }; }));
    const backs = await where();
    await P.click('.ids-seg-opt:has-text("Fronts")');
    await P.waitForTimeout(200);
    const fronts = await where();
    const xs = [...new Set(fronts.map(f => f.x))].sort((a, b) => a - b);
    const mirrored = fronts.every(f => { const b = backs.find(k => k.who === f.who); return b && b.y === f.y && b.x === xs[xs.length - 1 - xs.indexOf(f.x)]; });
    if (!mirrored) console.error('       fronts ' + JSON.stringify(fronts.slice(0, 3)) + ' backs ' + JSON.stringify(backs.slice(0, 3)));
    chk('long edge: every back is mirrored left to right, behind its own front, same row', mirrored && xs.length === 3);
    await P.click('.ids-seg-opt:has-text("Backs")');
    if (OUT) await (await P.$('.ids-sheet')).screenshot({ path: path.join(OUT, 'av-sheet-backs.png') });
    await P.click('.ids-seg-opt:has-text("Fronts")');
    if (OUT) await (await P.$('.ids-sheet')).screenshot({ path: path.join(OUT, 'av-sheet-fronts.png') });

    await P.click('.ids-btn--headprint');
    await P.waitForSelector('[role=alertdialog]');
    chk('the confirm counts nine cards and names Afrovanguard’s card', /Print 9 cards\?/.test(await P.innerText('[role=alertdialog]')) && /Afrovanguard’s card/.test(await P.innerText('[role=alertdialog]')));
    const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 180000 }), P.click('[role=alertdialog] .ids-btn--primary')]);
    const buf = fs.readFileSync(await dl.path());
    if (OUT) fs.writeFileSync(path.join(OUT, 'av-print.pdf'), buf);
    const pdf = pdfFacts(buf);
    chk('Print makes a PDF: nine fronts and nine backs', pdf.ok && pdf.images === 18);
    chk('…every face at 300 dpi with bleed', pdf.minImageW >= Math.floor((54 + 6) / 25.4 * 300) - 2);
    /* The PDF itself: where each sheet page draws its faces (the cm matrix
       before each image). Slot i's back must sit at slot i's front mirrored
       across the page — the same rule the screen showed. */
    const placed = pdfPlacements(buf).filter(pg => pg.length === 9);
    const pageW = 595.28;
    const pmirror = placed.length === 2 && placed[0].every((f, i) => {
      const b = placed[1][i];
      return Math.abs(b.y - f.y) < 0.5 && Math.abs((b.x + b.w) - (pageW - f.x)) < 0.5;
    });
    if (!pmirror) console.error('       pdf placements ' + JSON.stringify(placed.map(pg => pg.slice(0, 3))));
    chk('…and in the PDF, every back is drawn mirrored across the page from its front, same height, not rotated', pmirror
      && placed[1].every(b => b.w > 0 && b.h > 0));
    await P.waitForFunction(() => /logged as CRUN-/.test((document.querySelector('.ids-toast') || {}).innerText || ''), null, { timeout: 20000 }).catch(() => {});
    chk('the run is logged under Afrovanguard, one issue per person',
      php(`echo db_row("SELECT COUNT(*) c FROM card_issues WHERE subjectType = 'afrovanguard' AND ok = 1")['c'];`) === '9');
    chk('…with the printed IDs', php(`echo db_row("SELECT displayId FROM card_issues WHERE subjectType = 'afrovanguard' AND subjectId = '2'")['displayId'];`) === 'E-AVM-17-0001');
    await P.waitForTimeout(800);
    await P.selectOption('select[aria-label="Kind"]', 'afrovanguard');
    chk('the printed people leave the queue', (await P.$$('.ids-rec')).length === 0 || !/Babatunde Adeola/.test(await P.innerText('.ids-recs').catch(() => '')));

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (id card studio × afrovanguard)`);
    process.exit(failed ? 1 : 0);
  }
})();
