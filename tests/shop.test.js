#!/usr/bin/env node
/* ============================================================================
   The NGG shop, end to end against the real PHP backend (domain/shop.php,
   page-shop.jsx, cr-tab-shop.jsx): a closed shop says so; an open one lists a
   product, takes it into the cart, shows the SERVER's quote (Paystack's charge
   included) before Pay, records the order and hands the buyer to Paystack; the
   buyer comes back and the order page shows it paid with its number; the
   Control Room's Shop section takes it through ready and completed.

   Paystack cannot be reached from a test, so the PHP server is started with an
   auto_prepend_file that sets the domain's own test seam ($GLOBALS
   ['__paystack_mock'], api/_lib/domain/events.php): initialize answers with a
   checkout.paystack.com address, verify answers success for the order's exact
   amount. Nothing in the product changes for the test.

   Run:  node tests/shop.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SHOP_PORT || '8293';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-shop-'));
const DB = path.join(TMP, 'ngg.db');
const MOCK = path.join(TMP, 'paystack-mock.php');
const ADMIN = 'NGG-SHOP-ADM';

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
const config = paystack => `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'shop_test_secret_0123456789abcdef0123',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
    ${paystack ? "'paystack' => ['secret' => 'sk_test_shop_e2e']," : ''}
  ];\n`;

let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  shop: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, config(false));
  fs.writeFileSync(MOCK, `<?php
/* Paystack, for this test only: the domain's own seam (paystack_http). */
$GLOBALS['__paystack_mock'] = static function (string $method, string $path, array $body) {
    if ($path === '/transaction/initialize') return ['status' => true, 'data' => ['authorization_url' => 'https://checkout.paystack.com/e2eshop', 'reference' => $body['reference'] ?? '']];
    if (str_starts_with($path, '/transaction/verify/')) {
        $ref = rawurldecode(substr($path, strlen('/transaction/verify/')));
        $o = shop_order_by('paystackRef', $ref);
        if (!$o) return ['status' => false];
        $fee = paystack_family_charge((int)$o['total']);
        return ['status' => true, 'data' => ['status' => 'success', 'reference' => $ref, 'amount' => ((int)$o['total'] + $fee) * 100, 'currency' => 'NGN',
            'metadata' => ['orderId' => $o['orderId'], 'processingFee' => $fee]]];
    }
    return ['status' => false];
};
`);
  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-SH-1','name'=>'Egbeda','code'=>'EG','status'=>'active','programmes'=>'ngg','slug'=>'egbeda','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Kemi Shopkeeper','email'=>'kemi@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','totpSecret'=>'JBSWY3DPEHPK3PXP','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('shop_products', ['productId'=>'PRD-E2E1','slug'=>'ngg-t-shirt','name'=>'NGG T-shirt','category'=>'Clothing','description'=>'Navy, gold print.','price'=>8500,'imageUrl'=>'','options'=>'["S","M","L"]','stock'=>'{"S":3,"M":0,"L":5}','status'=>'live','sort'=>1,'createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('shop_products', ['productId'=>'PRD-E2E2','slug'=>'ngg-mug','name'=>'NGG mug','category'=>'Souvenirs','description'=>'','price'=>4000,'imageUrl'=>'','options'=>'[]','stock'=>'','status'=>'live','sort'=>2,'createdAt'=>${now},'updatedAt'=>${now}]);`,
      ['bootstrap']);
    server = spawn('php', ['-d', 'auto_prepend_file=' + MOCK, '-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : fs.existsSync('/opt/pw-browsers') ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    const errs = [];
    const watch = p => {
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]|refused \(HTTP/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
    };

    console.log('a closed shop');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let handoff = '';
    await ctx.route('https://checkout.paystack.com/**', r => { handoff = r.request().url(); r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Paystack (test)</p>' }); });
    const P = await ctx.newPage(); watch(P);
    await P.goto(BASE + '/shop', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.shop-msg', { timeout: 30000 });
    chk('/shop is a page with its title, and a closed shop says so plainly', /closed right now/.test(await P.innerText('.shop-msg')) && /^Shop/.test(await P.title()));
    chk('…the site\'s navigation links to it', (await P.$$('footer a, footer button')).length > 0 && /Shop/.test(await P.innerText('footer')));

    console.log('open, without Paystack set up');
    php(`setting_set('shop', ['enabled' => true, 'deliveryOn' => true, 'deliveryFee' => 2500], '${ADMIN}');`, ['bootstrap']);
    await P.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(P);
    await P.waitForSelector('.shop-card', { timeout: 30000 });
    chk('it lists what is on sale, with the price in naira', (await P.$$('.shop-card')).length === 2 && /₦8,500/.test(await P.innerText('.shop-grid')));
    const sizes = await P.$$eval('#shop-o-PRD-E2E1 option', o => o.map(x => [x.value, x.disabled]));
    chk('a sold-out size is offered disabled, and the first size with stock is chosen', JSON.stringify(sizes) === JSON.stringify([['S', false], ['M', true], ['L', false]]) && (await P.inputValue('#shop-o-PRD-E2E1')) === 'S');
    chk('stock is a limit: only 3 of size S can be chosen', (await P.$$eval('#shop-q-PRD-E2E1 option', o => o.length)) === 3 && /Only 3 left/.test(await P.innerText('.shop-card >> nth=0')));
    await P.click('button.shop-cat:has-text("Souvenirs")');
    chk('the category filter narrows the catalogue and is kept in the address', (await P.$$('.shop-card')).length === 1 && /cat=Souvenirs/.test(P.url()));
    await P.click('button.shop-cat:has-text("All")');
    await P.selectOption('#shop-q-PRD-E2E1', '2');
    await P.click('.shop-card >> nth=0 >> button.shop-add');
    await P.waitForSelector('.shop-sum', { timeout: 15000 });
    chk('the cart shows the server\'s quote before Pay: 2 × ₦8,500, no Paystack charge without Paystack', /₦17,000/.test(await P.innerText('.shop-sum')) && !/Paystack’s charge/.test(await P.innerText('.shop-sum')));
    chk('…and with no Paystack it says orders cannot be taken, and Pay is disabled', /can’t take orders/.test(await P.innerText('.shop-checkout')) && await P.isDisabled('.shop-pay'));
    await P.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(P);
    await P.waitForSelector('.shop-line', { timeout: 30000 });
    chk('the cart survives a refresh', /NGG T-shirt/.test(await P.innerText('.shop-lines')));

    console.log('open, with Paystack');
    fs.writeFileSync(CFG, config(true));
    await P.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(P);
    await P.waitForSelector('.shop-sum', { timeout: 30000 });
    await P.waitForFunction(() => !document.querySelector('.shop-pay').disabled, null, { timeout: 15000 });
    const sumText = await P.innerText('.shop-sum');
    const q = JSON.parse(php(`echo json_encode(shop_quote([['productId'=>'PRD-E2E1','option'=>'S','qty'=>2]], 'collect'));`, ['bootstrap']));
    chk('Paystack\'s charge (borne by the buyer) is in the quote, and Pay names the server\'s total', /Paystack’s charge/.test(sumText) === (q.onlineFee > 0)
      && (await P.innerText('.shop-pay')).replace(/\s/g, '') === ('Pay₦' + (q.total + q.onlineFee).toLocaleString('en-GB')));
    await P.click('.shop-pay');
    chk('checkout is checked before anything is sent: a name is asked for', /full name/.test(await P.innerText('#shop-f-name-err').catch(() => '')));
    await P.fill('#shop-f-name', 'Bola Ade'); await P.fill('#shop-f-email', 'bola.e2e@example.org'); await P.fill('#shop-f-phone', '08031234567');
    await P.selectOption('#shop-f-centre', 'Egbeda');
    await P.click('.shop-pay');
    await P.waitForFunction(() => /Paystack \(test\)/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    const row = JSON.parse(php(`echo json_encode(db_row("SELECT * FROM shop_orders ORDER BY id DESC LIMIT 1"));`, ['bootstrap']) || 'null');
    chk('the order is recorded pending, priced by the server, for collection at Egbeda', row && row.status === 'pending' && +row.total === 17000 && row.centre === 'Egbeda' && row.buyerName === 'Bola Ade');
    chk('…and the buyer is handed to Paystack\'s own checkout', handoff === 'https://checkout.paystack.com/e2eshop');

    console.log('back from Paystack');
    await P.goto(BASE + '/shop/order/' + row.token + '?trxref=' + row.paystackRef + '&reference=' + row.paystackRef, { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.shop-onum', { timeout: 30000 });
    chk('the order page confirms with Paystack (through the server) and shows it paid, with the order number to bring', /Paid/.test(await P.innerText('.shop-otitle')) && (await P.innerText('.shop-onum b')) === row.orderId && /Bring this number/.test(await P.innerText('.shop-onum')));
    chk('…the address loses the reference, and the page is not indexed', new URL(P.url()).search === '' && (await P.getAttribute('meta[name="robots"]', 'content')) === 'noindex, nofollow');
    chk('…the server has it paid and the stock taken off', php(`echo db_row("SELECT status FROM shop_orders WHERE orderId = '${row.orderId}'")['status'];`) === 'paid'
      && JSON.parse(php(`echo db_row("SELECT stock FROM shop_products WHERE productId = 'PRD-E2E1'")['stock'];`)).S === 1);
    chk('…and the cart that became the order is emptied', await P.evaluate(() => !localStorage.getItem('ngg.shop.cart.v1')));

    console.log('the Control Room');
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await actx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const A = await actx.newPage(); watch(A);
    await A.goto(BASE + '/control/shop', { waitUntil: 'domcontentloaded' });
    await waitForBoot(A);
    await A.waitForSelector('.cr-app', { timeout: 30000 });
    await A.waitForSelector('.cr-tbl tbody tr', { timeout: 30000 });
    const crTop = await A.innerText('.cr-app');
    chk('Shop is in the sidebar, and opens on Orders with the paid order to hand over', !!(await A.$('.cr-nav-item:has-text("Shop")')) && /Orders/.test(crTop) && new RegExp(row.orderId).test(await A.innerText('.cr-tbl')));
    if (!/Orders/.test(crTop) || !(await A.$('.cr-nav-item:has-text("Shop")'))) console.error('    (sidebar has Shop: ' + !!(await A.$('.cr-nav-item:has-text("Shop")')) + '; page: ' + crTop.slice(0, 300).replace(/\s+/g, ' ') + ')');
    await A.click('.cr-tbl tbody tr >> nth=0');
    await A.waitForSelector('.cr-sheet', { timeout: 10000 });
    chk('the order\'s drawer shows its items and buyer', /NGG T-shirt \(S\) × 2/.test(await A.innerText('.cr-sheet')) && /bola.e2e@example.org/.test(await A.innerText('.cr-sheet')));
    await A.click('.cr-sheet-foot button:has-text("Mark ready")');
    await A.click('.cr-confirm button:has-text("Mark ready")');
    await A.waitForFunction(id => /ready/i.test((document.querySelector('.cr-toast') || {}).innerText || ''), row.orderId, { timeout: 10000 }).catch(() => {});
    chk('Mark ready: the server has it ready', php(`echo db_row("SELECT status FROM shop_orders WHERE orderId = '${row.orderId}'")['status'];`) === 'ready');
    await A.waitForFunction(() => /Ready/.test((document.querySelector('.cr-tbl') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    await A.click('.cr-tbl tbody tr >> nth=0');
    await A.waitForSelector('.cr-sheet-foot button:has-text("Mark collected")', { timeout: 10000 });
    await A.click('.cr-sheet-foot button:has-text("Mark collected")');
    await A.click('.cr-confirm button:has-text("Mark collected")');
    await A.waitForFunction(() => /completed/i.test((document.querySelector('.cr-toast') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    chk('Mark collected: the server has it completed', php(`echo db_row("SELECT status FROM shop_orders WHERE orderId = '${row.orderId}'")['status'];`) === 'completed');

    await A.goto(BASE + '/control/shop/shop-products', { waitUntil: 'domcontentloaded' });
    await waitForBoot(A);
    await A.waitForSelector('.cr-tbl tbody tr', { timeout: 30000 });
    chk('Products lists the catalogue with stock left and what sold', /S 1 · M 0 · L 5/.test(await A.innerText('.cr-tbl')) && (await A.$$('.cr-tbl tbody tr')).length === 2);
    await A.click('.cr-btn:has-text("New product")');
    await A.waitForSelector('#crf-name', { timeout: 10000 });
    await A.fill('#crf-name', 'NGG cap'); await A.fill('#crf-price', '0');
    await A.click('[role="radio"]:has-text("On sale")');
    await A.click('.cr-sheet-foot button[type="submit"]');
    await A.waitForSelector('#crf-price-err', { timeout: 10000 }).catch(() => {});
    chk('a refusal from the server is shown on its field (no price, on sale)', /price/i.test(await A.innerText('#crf-price-err').catch(() => '')));
    await A.fill('#crf-price', '3000');
    await A.click('.cr-sheet-foot button[type="submit"]');
    await A.waitForFunction(() => !document.querySelector('#crf-name'), null, { timeout: 10000 }).catch(() => {});
    chk('a new product is saved and on sale', php(`echo db_row("SELECT status FROM shop_products WHERE name = 'NGG cap'")['status'] ?? '';`) === 'live');

    await A.goto(BASE + '/control/shop/shop-settings', { waitUntil: 'domcontentloaded' });
    await waitForBoot(A);
    await A.waitForSelector('.cr-app [role="switch"], .cr-app .cr-switch', { timeout: 30000 });
    chk('Settings shows the shop open', /Shop open/.test(await A.innerText('.cr-app')));

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (shop)');
  process.exit(failed ? 1 : 0);
})();
