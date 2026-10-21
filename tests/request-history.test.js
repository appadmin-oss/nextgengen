#!/usr/bin/env node
/* ============================================================================
   Request history (/control/members/request-log), end to end.

   The Inbox shows what is waiting. A request someone has already approved,
   declined or withdrawn left the Inbox — and with it, the Control Room — so
   the REQ- id an alert or a webhook carried led nowhere. This pins that every
   request is findable after it is decided: in the history, by its id (search,
   deep link, ⌘K), on the member's record, and by the Inbox's own search.

   Run:  node tests/request-history.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.RH_PORT || '8293';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-rh-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-RH-ADM', MEM = 'NGG-2026-4829';
const CSRF = 'rh-csrf-0123456789abcdef';

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
let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  request history: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'request_history_secret_0123456789ab',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());
      db_insert('centres', ['centreId'=>'CEN-RH-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','totpSecret'=>'JBSWY3DPEHPK3PXP','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'${MEM}','fullName'=>'Dada Jesimiel Oyeniran','email'=>'dj@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','displayId'=>'026-001','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const memTok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${MEM}'"), false);`, ['session']);
    const admTok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const call = (tok, url, body) => fetch(BASE + url, { method: body ? 'POST' : 'GET',
      headers: { Cookie: 'ngg_sess=' + tok + '; ngg_csrf=' + CSRF, 'X-NGG-CSRF': CSRF, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

    console.log('three ₦18,000 claims through the member route, then decided through the admin route');
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = await call(memTok, '/api/member/self.php', { kind: 'payment', amount: 18000, reference: 'GTB-55' + i, paidAt: '2026-10-20' });
      ids.push(r.json && r.json.request && r.json.request.requestId);
    }
    chk('the member raised three claims', ids.every(Boolean) && new Set(ids).size === 3);
    const [A, D, W] = ids;
    const ap = await call(admTok, '/api/admin/requests.php', { requestId: A, approve: true, decision: 'Found it on the statement.', amount: 18000 });
    const dc = await call(admTok, '/api/admin/requests.php', { requestId: D, approve: false, decision: 'This one is the same transfer as the first.' });
    const wd = await call(memTok, '/api/member/self.php', { action: 'withdraw', requestId: W });
    chk('one approved, one declined, one withdrawn', ap.status === 200 && dc.status === 200 && wd.status === 200);
    const inbox = await call(admTok, '/api/admin/requests.php?status=open');
    chk('none of them is in the Inbox any more (the case that led nowhere)', inbox.json && inbox.json.requests.length === 0);
    const byId = await call(admTok, '/api/admin/requests.php?status=all&q=' + encodeURIComponent(D.toLowerCase()));
    chk('the route finds a decided request by its id, with who decided it',
      byId.json && byId.json.total === 1 && byId.json.requests[0].status === 'declined' && byId.json.requests[0].decidedByName === 'Adaeze Okafor');

    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: admTok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: CSRF, domain: '127.0.0.1', path: '/' }]);
    const P = await ctx.newPage();
    const errs = [];
    P.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    P.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
    const rows = async () => (await P.$$eval('.cr-tbl tbody tr', r => r.map(x => x.innerText.replace(/\s+/g, ' ')))).filter(t => /REQ-/.test(t));

    console.log('the history');
    await P.goto(BASE + '/control/members/request-log', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.cr-tbl tbody tr', { timeout: 60000 });
    let R = await rows();
    chk('every request is listed, decided and withdrawn ones too', R.length === 3 && ids.every(id => R.some(t => t.includes(id))));
    chk('each says what happened', R.some(t => /Approved/.test(t)) && R.some(t => /Declined/.test(t)) && R.some(t => /Withdrawn/.test(t)));
    chk('…and who decided it', R.filter(t => /Adaeze Okafor/.test(t)).length === 2);
    chk('the tab is in the Members page, labelled', /Request history/.test(await P.innerText('body')));

    await P.fill('.cr-searchbox input', D);
    await P.waitForFunction(id => { const r = [...document.querySelectorAll('.cr-tbl tbody tr')].filter(x => /REQ-/.test(x.innerText)); return r.length === 1 && r[0].innerText.includes(id); }, D, { timeout: 10000 }).catch(() => {});
    R = await rows();
    chk('searching a REQ- id narrows to that request', R.length === 1 && R[0].includes(D));
    await P.fill('.cr-searchbox input', 'gtb-550');
    await P.waitForFunction(id => { const r = [...document.querySelectorAll('.cr-tbl tbody tr')].filter(x => /REQ-/.test(x.innerText)); return r.length === 1 && r[0].innerText.includes(id); }, A, { timeout: 10000 }).catch(() => {});
    chk('a payment reference finds its claim', (await rows()).length === 1 && (await rows())[0].includes(A));
    await P.fill('.cr-searchbox input', '');
    await P.waitForFunction(() => [...document.querySelectorAll('.cr-tbl tbody tr')].filter(x => /REQ-/.test(x.innerText)).length === 3, null, { timeout: 10000 }).catch(() => {});
    await P.click('.cr-fchip:has-text("Status")');
    await P.click('.cr-fopts .cr-fchip:has-text("Declined")');
    await P.waitForFunction(() => [...document.querySelectorAll('.cr-tbl tbody tr')].filter(x => /REQ-/.test(x.innerText)).length === 1, null, { timeout: 10000 }).catch(() => {});
    R = await rows();
    chk('the Status filter shows the declined one only', R.length === 1 && R[0].includes(D));

    console.log('a deep link, and the drawer');
    await P.goto(BASE + '/control/members/request-log/' + D, { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.cr-tbl tbody tr', { timeout: 60000 });
    await P.waitForFunction(id => { const r = [...document.querySelectorAll('.cr-tbl tbody tr')].filter(x => /REQ-/.test(x.innerText)); return r.length === 1 && r[0].innerText.includes(id); }, D, { timeout: 10000 }).catch(() => {});
    R = await rows();
    chk('/control/members/request-log/<REQ id> opens on that one request', R.length === 1 && R[0].includes(D));
    await P.click('.cr-tbl tbody tr:has-text("' + D + '")');
    await P.waitForSelector('.cr-sheet', { timeout: 10000 });
    const sheet = (await P.innerText('.cr-sheet')).replace(/\s+/g, ' ');
    chk('the drawer shows the claim, its status, who decided and the reply',
      sheet.includes(D) && /Declined/.test(sheet) && /Adaeze Okafor/.test(sheet) && /same transfer as the first/.test(sheet) && /GTB-551/.test(sheet));
    chk('…with no Inbox action for a request that is not waiting', !/Decide it in the Inbox/.test(sheet) && /Open the member’s record/.test(sheet));
    await P.keyboard.press('Escape');

    console.log('⌘K');
    await P.keyboard.press('Control+k');
    await P.waitForSelector('.cr-cmd');
    await P.fill('.cr-cmd-in input', A);
    await P.waitForFunction(id => /Requests/.test((document.querySelector('.cr-cmd-list') || {}).innerText || '') && ((document.querySelector('.cr-cmd-list') || {}).innerText || '').includes(id), A, { timeout: 10000 }).catch(() => {});
    const cmd = await P.innerText('.cr-cmd-list');
    chk('a REQ- id in ⌘K shows the request under Requests, with its status', /Requests/.test(cmd) && cmd.includes(A) && /Approved/.test(cmd));
    await P.click('.cr-cmd-opt:has-text("' + A + '")');
    await P.waitForFunction(id => location.pathname === '/control/members/request-log/' + id, A, { timeout: 10000 }).catch(() => {});
    chk('…and choosing it opens the history on it', new URL(P.url()).pathname === '/control/members/request-log/' + A);

    console.log('the member’s record');
    await P.goto(BASE + '/control/members/members/' + MEM, { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('[aria-label="Part of the record"]', { timeout: 60000 });
    await P.click('[aria-label="Part of the record"] >> text=Requests');
    await P.waitForFunction(() => /REQ-/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    const rec = (await P.innerText('body')).replace(/\s+/g, ' ');
    chk('the record has a Requests part listing all three, with outcomes', ids.every(id => rec.includes(id)) && /Approved/.test(rec) && /Declined/.test(rec) && /Withdrawn/.test(rec));

    console.log('the Inbox search');
    const N = (await call(memTok, '/api/member/self.php', { kind: 'payment', amount: 5000, reference: 'NEW-1' })).json.request.requestId;
    await P.goto(BASE + '/control/inbox/requests', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.cr-ib-row', { timeout: 60000 });
    await P.fill('.cr-ib-tools input', N);
    await P.waitForTimeout(600);
    chk('the Inbox search matches a waiting request by its id', (await P.$$('.cr-ib-row')).length === 1);
    chk('no page errors', errs.length === 0);
    if (errs.length) console.log(errs.slice(0, 5));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: the suite crashed: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
