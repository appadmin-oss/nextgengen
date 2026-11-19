#!/usr/bin/env node
/* ============================================================================
   Receipts drawn on the server, through the real routes (php -S):

     · /api/public/document.php?t=<token>&as=pdf  → an A4 PDF, as a download
     · …&as=png                                   → a PNG, as a download
     · /api/public/receipt.php?t=<receiptToken>&as=png (the link in the email)
     · the receipt page shows "Download PDF" and "Download image"
     · a link that is not one is a 404, never somebody else's receipt
   The files need nothing from the browser: no fonts, no script, no printing.

   Run:  node tests/receipt-download.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RCPT_PORT || '8295';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-rcpt-'));
const DB = path.join(TMP, 'ngg.db');

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function get(p) {
  return new Promise((resolve, reject) => http.get(BASE + p, res => { const b = []; res.on('data', c => b.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(b) })); }).on('error', reject));
}
let server;
let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'rcpt_test_secret_0123456789abcdefghi',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60], 'membership.receipt' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0], 'session_ttl' => 604800, 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const seeded = JSON.parse(php(`db_migrate(db_conn());
      db_insert('membership_invoices', ['invoiceId' => 'NGG-INV-2026-77001', 'memberId' => 'NGG-RC-1', 'payToken' => 'pay-tok-rc-1', 'items' => '[]', 'total' => 10188,
        'status' => 'paid', 'paidVia' => 'paystack', 'paystackRef' => 'T-RC-1', 'receiptToken' => 'rcpttok0123456789abcdef', 'receiptNo' => 'NGG-RCP-2026-77001', 'createdAt' => now_iso(), 'paidAt' => now_iso()]);
      $d = doc_record('receipt', 'NGG-RCP-2026-77001', 'NGG-RC-1', 'rcp:NGG-INV-2026-77001', ['no' => 'NGG-RCP-2026-77001', 'invoiceNo' => 'NGG-INV-2026-77001', 'invoiceIssued' => now_iso(), 'paidAt' => now_iso(),
        'member' => ['name' => 'Adébáyọ̀ Ògúnfáyọ̀', 'id' => '026-077', 'centre' => 'Egbeda'], 'payer' => ['name' => 'Kemi Ògúnfáyọ̀', 'rel' => 'Mother'], 'method' => ['icon' => 'card', 'text' => 'Card, via Paystack'], 'ref' => 'T-RC-1',
        'lines' => [['label' => 'Membership fee', 'detail' => '', 'period' => '2026–27', 'qty' => 1, 'unit' => 1000000, 'kobo' => 1000000], ['label' => 'Payment processing fee', 'detail' => 'charged by Paystack', 'period' => '', 'qty' => 1, 'unit' => 18800, 'kobo' => 18800]],
        'vat' => 'exempt', 'balanceAfter' => 0]);
      echo json_encode(['token' => $d['token']]);`));
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const pdf = await get('/api/public/document.php?t=' + seeded.token + '&as=pdf');
    chk('PDF: 200, application/pdf, offered as a download named for the receipt', pdf.status === 200 && pdf.headers['content-type'] === 'application/pdf'
      && /attachment; filename="NGG-receipt-NGG-RCP-2026-77001\.pdf"/.test(pdf.headers['content-disposition'] || ''));
    const ps = pdf.body.toString('latin1');
    chk('…a real one-page A4 PDF', ps.startsWith('%PDF-1.4') && /\/MediaBox \[0 0 595\.28 841\.89\]/.test(ps) && /\/Count 1/.test(ps) && /%%EOF\n$/.test(ps));
    const png = await get('/api/public/document.php?t=' + seeded.token + '&as=png');
    chk('Image: 200, image/png, a download, 1588 px wide', png.status === 200 && png.headers['content-type'] === 'image/png' && /\.png"/.test(png.headers['content-disposition'] || '')
      && png.body.slice(1, 4).toString() === 'PNG' && png.body.readUInt32BE(16) === 1588);
    const em = await get('/api/public/receipt.php?t=rcpttok0123456789abcdef&as=png');
    chk('the link in the receipt email gives the image too', em.status === 200 && em.headers['content-type'] === 'image/png');
    const page = await get('/api/public/document.php?t=' + seeded.token);
    const ph = page.body.toString('utf8');
    chk('the receipt page offers "Download PDF" and "Download image"', page.status === 200 && /Download PDF/.test(ph) && /Download image/.test(ph) && ph.includes('as=pdf') && ph.includes('as=png'));
    const bad = await get('/api/public/document.php?t=' + '0'.repeat(32) + '&as=pdf');
    chk('a link that is not one is a 404, not a file', bad.status === 404 && !/pdf/.test(bad.headers['content-type'] || ''));
    const noRcp = await get('/api/public/receipt.php?t=nope&as=pdf');
    chk('…and so is a wrong receipt link', noRcp.status === 404);
  } catch (e) {
    failed++; console.error('  ✗ FAIL: threw — ' + (e && e.stack || e));
  } finally {
    try { if (server) process.kill(-server.pid); } catch (_) {}
    try { fs.unlinkSync(CFG); } catch (_) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nreceipt download: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
