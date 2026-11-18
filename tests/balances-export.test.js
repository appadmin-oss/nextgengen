#!/usr/bin/env node
/* ============================================================================
   Outstanding balances, downloaded: real PHP server, real session, the real
   screen (Control Room → Money → Dues & arrears → "Download balances").

   32 members owe (dues, fines or both) across two centres; one owes nothing.
   What must hold:

     · Images: one PNG per fifteen members — three parts — each an A4-shaped
       page at 2× (1544 × 2184), not blank, named "part-N-of-3".
     · PDF: one A4 page per part, three pages.
     · CSV: every member owing and nobody else, largest first, and on every
       row Dues + Fines = Payable, with Dues split into what it is made of.
     · A centre chosen in the form narrows all three to that centre.

   The drawn PNGs are kept in tests/screens/balances/ to look at.

   Run:  node tests/balances-export.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.BALX_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-balx-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'balances');

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet;
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
function pngSize(buf) { return buf.slice(1, 4).toString() === 'PNG' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null; }
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
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
  if (!chromium) { console.log('⏭  balances export: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'balx_test_secret_0123456789abcdefgh',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    // 32 owing: 26 at Egbeda, 6 at Ayobo. Member k owes dues of (k % 9 + 1) × ₦1,000 and, every other one, a fine.
    // Charges are written straight to the ledger, dated 17 days ago, so the screen and the files read what is stored.
    php(`db_migrate(db_conn()); $now = now_iso(); $due = gmdate('Y-m-d\\TH:i:s\\Z', strtotime('-17 days'));
      db_insert('centres', ['centreId'=>'CEN-BX-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>$now]);
      db_insert('centres', ['centreId'=>'CEN-BX-2','name'=>'Ayobo','code'=>'AY','status'=>'active','slug'=>'ayobo','createdAt'=>$now]);
      db_insert('members', ['memberId'=>'NGG-BX-ADM','fullName'=>'Balances Admin','email'=>'adm.bx@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>$now,'updatedAt'=>$now]);
      setting_set('fees', ['enabled'=>true,'monthlyDues'=>0,'membershipFee'=>0,'trainingFee'=>0] + FEES_DEFAULTS, 'test');
      for ($k = 1; $k <= 33; $k++) {
        $id = sprintf('NGG-BX-%03d', $k);
        db_insert('members', ['memberId'=>$id,'fullName'=>($k === 3 ? 'Oluwashetemi Daniel Fasanmi-Babatunde Adeyemi' : 'Member ' . $k),'email'=>strtolower($id).'@example.org','type'=>'NGG','status'=>'active','role'=>'member',
          'centre'=>($k > 26 && $k <= 32 ? 'Ayobo' : 'Egbeda'),'joinDate'=>gmdate('Y-m-d', strtotime('-60 days')),'createdAt'=>$now,'updatedAt'=>$now]);
        if ($k === 33) continue;   // owes nothing: must appear nowhere
        $add = function ($kind, $amt) use ($id, $due) {
          db_insert('member_ledger', ['entryId'=>'FEE-'.strtoupper(bin2hex(random_bytes(6))),'memberId'=>$id,'kind'=>$kind,'direction'=>'charge','amount'=>$amt,
            'periodKey'=>$kind.':'.bin2hex(random_bytes(5)),'sessionId'=>'','note'=>'test','method'=>'','reference'=>'','createdAt'=>$due,'createdBy'=>'test']);
        };
        $add('dues', ($k % 9 + 1) * 1000);
        if ($k % 2 === 0) $add('fine', ($k % 5 + 1) * 500);
      }`);
    const owing = JSON.parse(php(`$r = admin_fees_arrears(['requesterId' => 'NGG-BX-ADM', 'limit' => 1000]); echo json_encode(['n' => $r['matched'], 'total' => $r['totalPayable']]);`));
    chk('the server counts 32 members owing (the one who owes nothing is not among them)', owing.n === 32);

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });

    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-BX-ADM'"), true);`);
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
    await ctx.addCookies([
      { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
      { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
    ]);
    const ap = await ctx.newPage();
    const errs = [];
    ap.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (fn, arg, ms) => ap.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);

    await ap.goto(BASE + '/control/money/fees', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    chk('Money opens with "Download balances" beside the Dues register',
      await until(() => [...document.querySelectorAll('button')].some(b => /Download balances/.test(b.textContent) && !b.disabled), null, 60000));

    // Press "Download balances", pick a format (and a centre), submit; collect what the browser saves.
    const run = async (fmtLabel, centre, expectFiles) => {
      await ap.click('button:has-text("Download balances")');
      await ap.waitForSelector('text=Download outstanding balances');
      await ap.click(`[role="dialog"] button:has-text("${fmtLabel}"), [role="dialog"] [role="radio"]:has-text("${fmtLabel}")`);
      if (centre) await ap.selectOption('[role="dialog"] select', centre);
      const files = [];
      const onDl = dl => files.push(dl);
      ap.on('download', onDl);
      await ap.click('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Download") >> nth=-1');
      const t0 = Date.now();
      while (files.length < expectFiles && Date.now() - t0 < 30000) await new Promise(r => setTimeout(r, 200));
      await new Promise(r => setTimeout(r, 800));   // and no stray extra file
      ap.off('download', onDl);
      const out = [];
      for (const f of files) { const p = path.join(TMP, f.suggestedFilename()); await f.saveAs(p); out.push({ name: f.suggestedFilename(), buf: fs.readFileSync(p) }); }
      await until(() => !document.querySelector('[role="dialog"]'), null, 10000);
      return out;
    };

    // ── Images ──
    const pngs = await run('Images (PNG)', '', 3);
    chk('Images: three PNGs for 32 members (15 + 15 + 2)', pngs.length === 3);
    chk('…named part-1-of-3 … part-3-of-3', pngs.map(f => f.name).sort().every((n, i) => new RegExp('^outstanding-balances-\\d{4}-\\d{2}-\\d{2}-part-' + (i + 1) + '-of-3\\.png$').test(n)));
    chk('…each an A4-shaped page at 2× (1544 × 2184)', pngs.every(f => { const s = pngSize(f.buf); return s && s[0] === 1544 && s[1] === 2184; }));
    pngs.forEach(f => fs.writeFileSync(path.join(SHOTS, f.name.replace(/-\d{4}-\d{2}-\d{2}/, '')), f.buf));
    // Not blank, and the page carries the words: read the pixels back through the browser.
    const ink = await ap.evaluate(async b64s => Promise.all(b64s.map(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data; let dark = 0, gold = 0;
      for (let i = 0; i < px.length; i += 4) { if (px[i] < 80 && px[i + 1] < 80 && px[i + 2] < 80) dark++; if (px[i] > 200 && px[i + 1] > 150 && px[i + 1] < 190 && px[i + 2] < 60) gold++; }
      return { dark, gold };
    })), pngs.map(f => f.buf.toString('base64')));
    chk('…every part has text on it and the gold rule under the heading', ink.every(x => x.dark > 20000 && x.gold > 1500));
    // A centre name fits its column whole: "Egbeda" was once cut to "Eg…".
    const fits = await ap.evaluate(async () => { await crBalFonts(); const g = document.createElement('canvas').getContext('2d');
      g.font = '400 15.5px ' + CR_BAL_FONT + ', sans-serif'; return ['Egbeda', 'Ayobo', 'Ikotun'].every(n => crBalFit(g, n, CR_BAL_CENTRE_W) === n); });
    chk('…centre names (Egbeda, Ayobo, Ikotun) are drawn whole, not cut short', fits);
    chk('…and the last part (2 members) carries less ink than a full one', ink[2].dark < ink[0].dark * 0.6);

    // ── PDF ──
    const pdfs = await run('PDF', '', 1);
    chk('PDF: one file', pdfs.length === 1 && /^outstanding-balances-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdfs[0].name));
    const pdf = pdfs[0] ? pdfs[0].buf.toString('latin1') : '';
    chk('…a real PDF of three pages', pdf.startsWith('%PDF-') && (pdf.match(/\/Type \/Page\b(?!s)/g) || []).length === 3);
    chk('…on A4 (595.28 × 841.89 pt)', /\/MediaBox \[0 0 595\.2\d+ 841\.8\d+\]/.test(pdf));

    // ── CSV ──
    const csvs = await run('CSV', '', 1);
    const rows = csvs[0] ? parseCsv(csvs[0].buf.toString('utf8')) : [];
    const head = rows[0] || [], body = rows.slice(1).filter(r => r.length > 1);
    const col = n => head.indexOf(n);
    chk('CSV: the columns of the sheet, then what Dues is made of',
      ['Member ID', 'Member', 'Centre', 'Days', 'Dues', 'Fines', 'Payable', 'Dues: monthly', 'Dues: other'].every(h => col(h) >= 0));
    chk('…32 rows: everyone owing, and not the member who owes nothing', body.length === 32 && !body.some(r => r[col('Member ID')] === 'NGG-BX-033'));
    chk('…Dues + Fines = Payable on every row', body.every(r => +r[col('Dues')] + +r[col('Fines')] === +r[col('Payable')]));
    chk('…largest first', body.every((r, i) => i === 0 || +body[i - 1][col('Payable')] >= +r[col('Payable')]));
    chk('…the total is the server’s total', body.reduce((s, r) => s + +r[col('Payable')], 0) === owing.total);
    chk('…Days is days since the oldest unpaid charge (17)', body.every(r => r[col('Days')] === '17'));
    const m8 = body.find(r => r[col('Member ID')] === 'NGG-BX-008');
    chk('…a member’s figures are their ledger’s: NGG-BX-008 owes ₦9,000 dues + ₦2,000 fine', m8 && m8[col('Dues')] === '9000' && m8[col('Fines')] === '2000' && m8[col('Payable')] === '11000');

    // ── One centre ──
    const ay = await run('CSV', 'Ayobo', 1);
    const ayRows = ay[0] ? parseCsv(ay[0].buf.toString('utf8')).slice(1).filter(r => r.length > 1) : [];
    chk('Choosing Ayobo narrows it: 6 rows, all Ayobo, and the file says so', ayRows.length === 6 && ayRows.every(r => r[col('Centre')] === 'Ayobo') && /outstanding-balances-ayobo-/.test(ay[0].name));
    const ayPng = await run('Images (PNG)', 'Ayobo', 1);
    chk('…and as images it is one part, with no "Part 1 of 1"', ayPng.length === 1 && /^outstanding-balances-ayobo-\d{4}-\d{2}-\d{2}\.png$/.test(ayPng[0].name));
    if (ayPng[0]) fs.writeFileSync(path.join(SHOTS, 'outstanding-balances-ayobo.png'), ayPng[0].buf);

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: threw — ' + (e && e.stack || e));
  } finally {
    try { await browser && browser.close(); } catch (_) {}
    cleanup();
  }
  console.log(`\nbalances export: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
