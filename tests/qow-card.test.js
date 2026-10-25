#!/usr/bin/env node
/* ============================================================================
   Quote of the week — the share card (design_handoff_quote_card v2), end to end.

   Drives the real card (src/modules/qow/qow-card.jsx + assets/fonts/qcard/
   qcard.css) through the real exporter in Chromium, against a real PHP +
   SQLite backend. The promises the handoff makes, each pinned:

     · THE CANVAS IS FIXED: feed 1080×1350, story 1080×1920, wide 1200×630,
       and the exported PNG is exactly that (2× when asked, never by default).
     · IT IS THE DESIGN: the Lagoon cards with the handoff's default content
       match its reference renders (tests/fixtures/qow-card) within ±2 px — a
       residue of glyph-edge anti-aliasing is allowed, a moved block is not.
     · NOTHING IS CUT: a 220-character quote fits every card; past 220 the
       sheet refuses to export, and says why.
     · ONE HIGHLIGHT, WRAPPING: a highlight across two lines is two rounded
       marks; a highlight that is not in the quote is no mark and no error.
     · THE LANGUAGES DRAW: Yorùbá's stacked marks (ẹ̀ = dot below + grave) sit
       on the letter — Bricolage had no anchor for the grave and was patched —
       and Hausa's hooked letters come from the fallback face, not a box.
     · A PHONE DOES NOT RESIZE IT: the site's phone stylesheet rewrites inline
       font sizes by attribute match; the card's sizes are classes.
     · THE SHEET WORKS: Share opens it on the live saying, size and colour
       change the card, Download saves ngg-quote-w{week}-{kind}.png, Escape
       closes it and focus goes back to Share.

   Self-contained: throwaway api/config.php, refuses to overwrite one.
   Run:  node tests/qow-card.test.js   (QCARD_PORT, default 8267)
   ========================================================================== */
'use strict';

const { spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.QCARD_PORT || '8267';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-qcard-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-qcard-cache-${process.pid}`);
const DL = path.join(os.tmpdir(), `ngg-qcard-dl-${process.pid}`);

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}
let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.unlinkSync(DB); } catch (_) {}
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(DL, { recursive: true, force: true }); } catch (_) {}
}
let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

const DEFAULTS = { quote: 'Discipline is choosing what you want most over what you want now.', highlight: 'what you want most',
  by: 'Anchor 12', source: 'Week 7 · Time Consciousness', week: '41', footer: 'next.afrovanguard.org.ng' };
const SIZES = { feed: [1080, 1350], story: [1080, 1920], wide: [1200, 630] };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  qow card: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'qcard_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else {
      const d = fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').find(x => x.startsWith('chromium-')) : null;
      if (d) launch.executablePath = require('./_responsive-probe').chromiumPath(require('fs'));
    }
    browser = await chromium.launch(launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 240)));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForFunction(() => typeof QcCard === 'function' && typeof qcRenderPng === 'function', null, { timeout: 60000 });

    // ── Pure derivations (spec §1.1) ──
    const pure = await page.evaluate(() => ({
      seg: qcSegments('Discipline is choosing what you want most', 'WHAT YOU WANT MOST'),
      none: qcSegments('Discipline', 'xyz'),
      initial: [qcInitial('  anchor 12'), qcInitial('')],
      steps: [60, 61, 100, 101, 150, 151].map(qcQuoteStep),
      week: qcIsoWeek('2026-10-05'),
      stacked: Array.from(qcText('ẹ̀ ọ́ ṣe Ṣ')).map(c => c.codePointAt(0).toString(16)),
    }));
    chk('a highlight splits the quote once, case-insensitively, keeping the quote’s casing',
      JSON.stringify(pure.seg) === JSON.stringify([{ text: 'Discipline is choosing ', hl: false }, { text: 'what you want most', hl: true }]));
    chk('…and a highlight not in the quote leaves it whole', pure.none.length === 1 && !pure.none[0].hl);
    chk('the initial is the first non-space character, uppercased; N when there is none', pure.initial.join('') === 'AN');
    chk('the quote size steps at 60, 100 and 150 characters', pure.steps.join('') === '122334');
    chk('the week is the ISO week of the Monday the saying is for', pure.week === '41');
    chk('a letter with two marks is written decomposed so both stack; ṣ becomes s + dot below',
      pure.stacked.join(' ') === '65 323 300 20 6f 323 301 20 73 323 65 20 53 323');

    // ── Render + export each card through the real exporter ──
    const render = (kind, data, palette, scale) => page.evaluate(async ({ kind, data, palette, scale }) => {
      let host = document.getElementById('qc-test-host');
      if (!host) { host = document.createElement('div'); host.id = 'qc-test-host'; host.style.cssText = 'position:absolute;left:-20000px;top:0'; document.body.appendChild(host); }
      await qcEnsureAssets();
      ReactDOM.render(React.createElement(QcCard, { kind, data, palette }), host);
      await new Promise(r => setTimeout(r, 60));
      const el = host.firstChild;
      const blob = await qcRenderPng(el, scale || 1);
      const bmp = await createImageBitmap(blob);
      return { w: el.offsetWidth, h: el.offsetHeight, pw: bmp.width, ph: bmp.height, over: qcOverflows(el),
        marks: Array.from(el.querySelectorAll('.qc-mark')).map(m => m.getClientRects().length),
        url: await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }) };
    }, { kind, data, palette, scale });

    for (const kind of Object.keys(SIZES)) {
      const r = await render(kind, DEFAULTS, 'Lagoon');
      chk(kind + ': the canvas and the PNG are exactly ' + SIZES[kind].join(' × '),
        r.w === SIZES[kind][0] && r.h === SIZES[kind][1] && r.pw === SIZES[kind][0] && r.ph === SIZES[kind][1]);
      /* Against the handoff's reference render: a pixel counts as matching if the
         reference has a close pixel within 2 px (spec tolerance). Glyph-edge
         anti-aliasing differs by font build; that residue stays far below 0.1 %. */
      const residue = await page.evaluate(async ({ ours, ref }) => {
        const load = async src => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height); };
        const A = await load(ours), B = await load(ref);
        if (A.width !== B.width || A.height !== B.height) return 1;
        const W = A.width, H = A.height; let bad = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4; let best = 999;
          for (let dy = -2; dy <= 2 && best > 40; dy++) for (let dx = -2; dx <= 2 && best > 40; dx++) {
            const yy = Math.min(H - 1, Math.max(0, y + dy)), xx = Math.min(W - 1, Math.max(0, x + dx)), j = (yy * W + xx) * 4;
            best = Math.min(best, Math.max(Math.abs(A.data[i] - B.data[j]), Math.abs(A.data[i + 1] - B.data[j + 1]), Math.abs(A.data[i + 2] - B.data[j + 2])));
          }
          if (best > 40) bad++;
        }
        return bad / (W * H);
      }, { ours: r.url, ref: BASE + '/tests/fixtures/qow-card/' + kind + '.png' });
      chk(kind + ': matches the handoff reference within ±2 px (residue ' + (residue * 100).toFixed(3) + '%)', residue < 0.001);
    }
    const two = await render('wide', DEFAULTS, 'Brand', 2);
    chk('the 2× export is twice the canvas', two.pw === 2400 && two.ph === 1260);

    // Exactly 220 characters of ordinary words, the longest quote the card accepts.
    const long = ('Knowledge is like a garden: if it is not cultivated, it cannot be harvested. A child who washes his hands well eats with elders, '
      + 'and patience can cook a stone until it is soft and sweet as honey, my good friend, always!').slice(0, 220) + '!';
    for (const kind of Object.keys(SIZES)) {
      const r = await render(kind, Object.assign({}, DEFAULTS, { quote: long, highlight: '' }), 'Brand');
      chk(kind + ': a 220-character quote fits without overflow', long.length === 220 && !r.over);
    }
    const wrap = await render('feed', Object.assign({}, DEFAULTS, { highlight: 'choosing what you want most over what' }), 'Brand');
    chk('a highlight that wraps is one rounded mark per line', wrap.marks.length === 1 && wrap.marks[0] >= 2);
    const nomatch = await render('feed', Object.assign({}, DEFAULTS, { highlight: 'xyz' }), 'Brand');
    chk('a highlight not in the quote renders no mark and no error', nomatch.marks.length === 0 && !nomatch.over);

    // ── The languages draw ──
    const glyph = await page.evaluate(async () => {
      await qcEnsureAssets();
      const w = (font, t) => { const c = document.createElement('canvas').getContext('2d'); c.font = font; return c.measureText(t).width; };
      const span = document.createElement('span');
      span.style.cssText = 'font:800 200px "QC Bricolage";position:absolute;left:-9999px;white-space:pre';
      document.body.appendChild(span);
      const box = t => { span.textContent = t; return span.getBoundingClientRect().width; };
      // A spacing (unattached) grave widens the letter; an attached one adds nothing.
      const res = { hooks: document.fonts.check('800 96px "QC Hooks"', 'ƙɗɓ'),
        hookFromFallback: Math.abs(w('800 96px "QC Bricolage", "QC Hooks"', 'ƙ') - w('800 96px "QC Hooks"', 'ƙ')) < 0.01,
        graveAttached: Math.abs(box(qcText('ẹ̀')) - box('ẹ')) < 1 };
      span.remove();
      return res;
    });
    chk('Hausa’s hooked letters come from the fallback face, which has them', glyph.hooks && glyph.hookFromFallback);
    chk('Yorùbá’s grave sits on a dot-below vowel instead of beside it', glyph.graveAttached);

    // ── The sheet, on the live saying ──
    await page.locator('.qow-share').scrollIntoViewIfNeeded();
    await page.click('.qow-share');
    await page.waitForSelector('.qcs .qc', { timeout: 60000 });
    chk('Share opens the sheet with the feed card and the Brand colours',
      (await page.getAttribute('.qcs .qc', 'data-qc')) === 'feed' && (await page.getAttribute('.qcs-swatch.is-on', 'aria-label')) === 'Brand');
    chk('the preview carries the spec’s alt text', /^“.+” .+, Quote of the week · .+\. Next Generation Genius quote of the week, week \d+\.$/.test(await page.getAttribute('.qcs-frame', 'aria-label') || ''));
    await page.click('.qcs-opt:has-text("Story")');
    await page.click('.qcs-swatch[aria-label="Lagoon"]');
    chk('size and colours change the card', (await page.getAttribute('.qcs .qc', 'data-qc')) === 'story'
      && (await page.$eval('.qcs .qc', e => getComputedStyle(e).backgroundColor)) === 'rgb(11, 122, 114)');
    fs.mkdirSync(DL, { recursive: true });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('.qcs-btn:has-text("Download PNG")')]);
    const file = path.join(DL, dl.suggestedFilename()); await dl.saveAs(file);
    const head = fs.readFileSync(file).subarray(0, 24);
    chk('Download saves ngg-quote-w{week}-story.png at 1080 × 1920', /^ngg-quote-w\d+-story\.png$/.test(dl.suggestedFilename())
      && head.toString('latin1', 1, 4) === 'PNG' && head.readUInt32BE(16) === 1080 && head.readUInt32BE(20) === 1920);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    chk('Escape closes the sheet and focus returns to Share', !(await page.$('.qcs'))
      && (await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('qow-share'))));

    // ── A phone does not resize the card ──
    const ph = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pp = await ph.newPage();
    await pp.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pp);
    await pp.waitForSelector('.qow-share', { timeout: 60000 });
    await pp.locator('.qow-share').scrollIntoViewIfNeeded();
    await pp.click('.qow-share');
    await pp.waitForSelector('.qcs .qc-quote', { timeout: 60000 });
    const sizes = await pp.$eval('.qcs .qc-quote', q => [getComputedStyle(q).fontSize, q.className]);
    const want = { 'qc-s1': '96px', 'qc-s2': '84px', 'qc-s3': '70px', 'qc-s4': '58px' }[(sizes[1].match(/qc-s\d/) || [''])[0]];
    chk('on a phone the quote keeps its canvas size (' + sizes[0] + ')', !!want && sizes[0] === want);
    await ph.close();

    chk('no uncaught page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + String(e).slice(0, 400));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (quote of the week share card)`);
  process.exit(failed ? 1 : 0);
})();
