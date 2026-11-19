#!/usr/bin/env node
/* ============================================================================
   Push notifications, end to end: the real PHP server and route, the real
   portals, the real encryption — and a "browser" that opens what was sent.

   Chromium in a container has no push service to subscribe to, so the one
   thing faked is PushManager itself: subscribe() hands back a subscription
   whose keys THIS SCRIPT holds (made with Node's WebCrypto). Everything after
   that is real — the page posts it to /api/auth/push.php, the server encrypts
   to it and signs a VAPID token, and the push it would have sent to the push
   service is caught by `push.test_sink` and DECRYPTED here. A push the
   browser could not read fails this test, not a user's phone.

   What must hold:
     · member: the Notifications panel offers "Get these on your phone"; Turn
       on registers this device; Send a test arrives and reads correctly;
     · an in-app notification reaches the phone — but not while the person is
       looking at the portal, which the page reports on its own;
     · Control Room: the inbox asks once, at the inbox; a new inbox item
       reaches the device, opening that inbox view; staff can switch inbox
       email off from Account › Notifications;
     · family: the card is on Account and says what a parent would get;
     · the service worker shows a push it is handed, with its words.

   Run:  node tests/push-e2e.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { subtle } = crypto.webcrypto;

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PUSH_E2E_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-push-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SINK = path.join(TMP, 'push-sink.jsonl');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'push');

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util', 'bootstrap', 'session'].map(f => `require_once ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
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
let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hkdf(salt, ikm, info, len) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return Buffer.from(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
/** A device: its key pair and auth secret, and the ability to open what is sent to it (RFC 8291). */
async function device(name) {
  const keys = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = Buffer.from(await subtle.exportKey('raw', keys.publicKey));
  const auth = crypto.randomBytes(16);
  const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-' + name + '-' + crypto.randomBytes(4).toString('hex');
  return {
    endpoint, p256dh: b64u(pub), auth: b64u(auth),
    async open(bodyB64) {
      const body = Buffer.from(bodyB64, 'base64');
      const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
      const peer = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const ecdh = Buffer.from(await subtle.deriveBits({ name: 'ECDH', public: peer }, keys.privateKey, 256));
      const ikm = await hkdf(auth, ecdh, Buffer.concat([Buffer.from('WebPush: info\0'), pub, asPub]), 32);
      const cek = await hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
      const nonce = await hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
      const k = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
      const plain = Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct));
      let end = plain.length - 1; while (end >= 0 && plain[end] === 0) end--;
      return JSON.parse(plain.subarray(0, end).toString('utf8'));
    },
  };
}
const sinkLines = () => fs.existsSync(SINK) ? fs.readFileSync(SINK, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

/* The page's PushManager, faked to hand back the device's subscription.
   Notification.permission starts 'default' (so the ask can be seen) and
   becomes 'granted' when the page asks. */
function fakePush(dev) {
  return `(() => {
    const D = ${JSON.stringify({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth })};
    let perm = 'default', subbed = false, key = null;
    try { Object.defineProperty(Notification, 'permission', { configurable: true, get: () => perm }); } catch (_) {}
    Notification.requestPermission = async () => { perm = 'granted'; return 'granted'; };
    const sub = { endpoint: D.endpoint, options: { get applicationServerKey() { return key; } },
      toJSON: () => ({ endpoint: D.endpoint, expirationTime: null, keys: { p256dh: D.p256dh, auth: D.auth } }),
      unsubscribe: async () => { subbed = false; return true; } };
    PushManager.prototype.subscribe = async function (o) { key = new Uint8Array(o.applicationServerKey).buffer; subbed = true; return sub; };
    PushManager.prototype.getSubscription = async function () { return subbed ? sub : null; };
  })();`;
}

async function pageFor(cookies, dev, opts) {
  const ctx = await browser.newContext({ viewport: (opts && opts.viewport) || { width: 1360, height: 1000 } });
  await ctx.addCookies(cookies.concat([{ name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]));
  if (dev) await ctx.addInitScript(fakePush(dev));
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 200)));
  return p;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  push e2e: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'push_e2e_test_secret_0123456789abcdefg',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'push' => ['test_sink' => ${JSON.stringify(SINK)}, 'contact' => 'mailto:ops@example.org'],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());
      db_insert('centres', ['centreId'=>'CEN-PS-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);
      foreach ([['NGG-PS-ADM','Desk Admin','super_admin'], ['NGG-PS-1','Tolu Member','member']] as $m)
        db_insert('members', ['memberId'=>$m[0],'fullName'=>$m[1],'email'=>strtolower($m[0]).'@example.org','type'=>'NGG','status'=>'active','role'=>$m[2],'centre'=>'Egbeda','displayId'=>'026-0'.rand(10,99),'createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('guardians', ['guardianId'=>'GDN-PSE2E0001','email'=>'parent.push@example.org','fullName'=>'Push Parent','status'=>'active','sessionEpoch'=>1,'createdAt'=>now_iso()]);
      db_insert('guardian_wards', ['linkId'=>'LNK-PSE2E0001','guardianId'=>'GDN-PSE2E0001','memberId'=>'NGG-PS-1','status'=>'active','relationship'=>'parent','via'=>'code','notify'=>'','createdAt'=>now_iso()]);`);
    // Quiet hours off for everyone in this run: the clock must not decide the result.
    php(`foreach (['m:NGG-PS-1','m:NGG-PS-ADM','g:GDN-PSE2E0001'] as $s) push_prefs_save(['subject'=>$s,'prefs'=>['quiet'=>false]]); echo 1;`);
    const tok = id => php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), true);`);
    const famTok = php(`echo session_issue_family(db_row("SELECT * FROM guardians WHERE guardianId = 'GDN-PSE2E0001'"));`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const serverPub = php(`echo push_vapid()['pub'];`);

    // ── Member: the panel, turning on, a test that reads back ──
    const phone = await device('member');
    const M = await pageFor([{ name: 'ngg_sess', value: tok('NGG-PS-1'), domain: '127.0.0.1', path: '/', httpOnly: true }], phone);
    await M.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    await M.waitForSelector('.m9-app main', { timeout: 60000 });
    await M.click('button[aria-label="Notifications"]:visible');
    await M.waitForSelector('.m9n-panel .ngp', { timeout: 15000 });
    await M.waitForFunction(() => /Turn on notifications/.test((document.querySelector('.m9n-panel .ngp') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    let card = await M.innerText('.m9n-panel .ngp');
    chk('member: the Notifications panel offers "Get these on your phone", off, with what they would get', /Get these on your phone/.test(card) && /\bOff\b/.test(card) && /Answers to your requests/.test(card));
    await M.screenshot({ path: path.join(SHOTS, 'member-off.png') });
    await M.click('.m9n-panel .ngp button:has-text("Turn on notifications")');
    await M.waitForFunction(() => /Send a test/.test((document.querySelector('.m9n-panel .ngp') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    const row = JSON.parse(php(`echo json_encode(db_row("SELECT subjectKey, surface, endpoint FROM push_subscriptions WHERE subjectKey = 'm:NGG-PS-1'"));`) || 'null');
    chk('member: Turn on registers THIS device for this member, from the session', row && row.endpoint === phone.endpoint && row.surface === 'member');
    card = await M.innerText('.m9n-panel .ngp');
    chk('member: …and the card now says On, with Send a test and Turn off here', /\bOn\b/.test(card) && /Send a test/.test(card) && /Turn off here/.test(card));
    await M.click('.m9n-panel .ngp button[aria-expanded]');
    card = await M.innerText('.m9n-panel .ngp');
    chk('member: settings show quiet hours and the topics a member can mute (no staff inbox)', /Quiet hours/.test(card) && /Payments, dues and fines/.test(card) && !/staff inbox/i.test(card));
    await M.screenshot({ path: path.join(SHOTS, 'member-on.png') });
    fs.writeFileSync(SINK, '');
    await M.click('.m9n-panel .ngp button:has-text("Send a test")');
    await M.waitForFunction(() => /Sent to 1 device/.test((document.querySelector('.m9n-panel .ngp') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    chk('member: the test says where it went', /Sent to 1 device/.test(await M.innerText('.m9n-panel .ngp')));
    let lines = sinkLines();
    let msg = lines[0] ? await phone.open(lines[0].body).catch(() => null) : null;
    chk('member: the test push went to this device\'s push service, and the device can read it', lines.length === 1 && lines[0].url === phone.endpoint && msg && msg.title === 'Notifications are on');
    const auth = (lines[0] && lines[0].headers.find(h => /^Authorization: vapid/.test(h))) || '';
    chk('member: …signed with the server\'s published key', auth.includes('k=' + serverPub));

    // ── Presence: the page reports itself; nothing buzzes for what is on screen ──
    await M.waitForTimeout(1500);
    const pres = JSON.parse(php(`echo json_encode(db_row("SELECT lastSurface, lastActiveAt FROM notify_prefs WHERE subjectKey = 'm:NGG-PS-1'"));`));
    chk('member: the open portal tells the server it is in front of them', pres && pres.lastSurface === 'member' && pres.lastActiveAt !== '');
    fs.writeFileSync(SINK, '');
    let decided = php(`echo push_dispatch('m:NGG-PS-1', ['title'=>'Your dues for November','kind'=>'dues','page'=>'money','url'=>'/dashboard/account','surface'=>'member']);`);
    chk('member: while they are looking at the portal, the phone is not buzzed as well', decided === 'active' && sinkLines().length === 0);
    php(`db_update('notify_prefs', ['lastActiveAt' => gmdate('Y-m-d\\TH:i:s\\Z', time() - 600)], ['subjectKey' => 'm:NGG-PS-1']);`);
    php(`push_notification('NGG-PS-1', ['kind'=>'dues','title'=>'Your dues for November','body'=>'₦2,000 is due on the 7th','linkPage'=>'money']); push_flush(); echo 1;`);
    lines = sinkLines(); msg = lines[0] ? await phone.open(lines[0].body).catch(() => null) : null;
    chk('member: away from the screen, an in-app notification reaches the phone, opening the right page',
      lines.length === 1 && msg && msg.title === 'Your dues for November' && msg.body === '₦2,000 is due on the 7th' && msg.url === '/dashboard/account');

    // ── Control Room: asked at the inbox; a new item reaches the device ──
    const laptop = await device('admin');
    const A = await pageFor([{ name: 'ngg_sess', value: tok('NGG-PS-ADM'), domain: '127.0.0.1', path: '/', httpOnly: true }], laptop);
    await A.goto(BASE + '/control/inbox', { waitUntil: 'domcontentloaded' });
    await waitForBoot(A);
    await A.waitForSelector('.ngp-nudge', { timeout: 60000 }).catch(() => {});
    const nudge = await A.$('.ngp-nudge');
    chk('Control Room: the inbox asks, once, with what it would tell them', !!nudge && /requests and messages/i.test(await nudge.innerText()));   // the compact strip (5568aee) names what it will send
    await A.screenshot({ path: path.join(SHOTS, 'admin-nudge.png') });
    await A.click('.ngp-nudge button:has-text("Turn on")');
    await A.waitForFunction(() => /notifications are on/i.test((document.querySelector('.ngp-nudge') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    chk('Control Room: Turn on registers this device for the admin', php(`echo db_row("SELECT surface FROM push_subscriptions WHERE subjectKey = 'm:NGG-PS-ADM'")['surface'] ?? '';`) === 'admin');
    await A.waitForTimeout(1500);
    fs.writeFileSync(SINK, '');
    php(`staff_inbox_alert('messages', ['who'=>'Kemi Visitor','what'=>'Do you run sessions in Ikeja?']); push_flush(); echo 1;`);
    chk('Control Room: while they sit in the Control Room, a new item does not buzz their device', sinkLines().length === 0);
    php(`db_update('notify_prefs', ['lastActiveAt' => ''], ['subjectKey' => 'm:NGG-PS-ADM']); staff_inbox_alert('applications', ['who'=>'Ada Obi','what'=>'Anchor 12 application · Egbeda']); push_flush(); echo 1;`);
    lines = sinkLines(); msg = lines[0] ? await laptop.open(lines[0].body).catch(() => null) : null;
    chk('Control Room: away from it, a new application reaches the device, opening that inbox view',
      lines.length === 1 && msg && /New application · Ada Obi/.test(msg.title) && msg.url === '/control/inbox/applications' && msg.tag === 'inbox-applications');

    // Account › Notifications: inbox email can be switched off.
    await A.click('button[aria-label="Account menu"]');
    let opened = await A.$('.cr-acct button:has-text("Notifications")');
    if (opened) await opened.click();
    await A.waitForSelector('[role="dialog"] .ngp', { timeout: 15000 }).catch(() => {});
    const drawer = await A.$('[role="dialog"] .ngp');
    chk('Control Room: Account › Notifications opens the settings for this device', !!drawer);
    if (drawer) {
      await A.waitForFunction(() => /Email me about new inbox items/.test((document.querySelector('[role="dialog"] .ngp') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
      chk('Control Room: …including email for new inbox items, on by default', await A.getAttribute('[role="dialog"] .ngp button[aria-label="Email me about new inbox items"]', 'aria-pressed') === 'true');
      await A.screenshot({ path: path.join(SHOTS, 'admin-settings.png') });
      await A.click('[role="dialog"] .ngp button[aria-label="Email me about new inbox items"]');
      await A.waitForFunction(() => /Saved\./.test((document.querySelector('[role="dialog"] .ngp') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
      chk('Control Room: …and switching it off is saved', php(`echo json_encode(push_prefs('m:NGG-PS-ADM')['inboxEmail']);`) === 'false');
    }

    // ── Family: the card on Account ──
    const fam = await device('family');
    const F = await pageFor([{ name: 'ngg_sess_family', value: famTok, domain: '127.0.0.1', path: '/', httpOnly: true }], fam);
    await F.goto(BASE + '/family?view=account', { waitUntil: 'domcontentloaded' });
    await waitForBoot(F);
    await F.waitForSelector('.fp3x-push .ngp', { timeout: 60000 }).catch(() => {});
    await F.waitForFunction(() => /Turn on notifications/.test((document.querySelector('.fp3x-push .ngp') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    const ftxt = (await F.$('.fp3x-push .ngp')) ? await F.innerText('.fp3x-push .ngp') : '';
    chk('family: Account has the card, saying what a parent would get', /checks in or out/.test(ftxt) && /Turn on notifications/.test(ftxt));
    await F.screenshot({ path: path.join(SHOTS, 'family-account.png') });
    if (ftxt) {
      await F.click('.fp3x-push .ngp button:has-text("Turn on notifications")');
      await F.waitForFunction(() => /Send a test/.test((document.querySelector('.fp3x-push .ngp') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
      chk('family: Turn on registers the phone for the family account, not a member', php(`echo db_row("SELECT subjectKey FROM push_subscriptions WHERE endpoint = '${fam.endpoint}'")['subjectKey'] ?? '';`) === 'g:GDN-PSE2E0001');
      const ft = (await F.innerText('.fp3x-push .ngp'));
      chk('family: a parent is not offered the staff inbox or community topics', !/staff inbox/i.test(ft) && !/Community and events/.test(ft));
    }

    // ── The service worker shows what it is handed ──
    const S = await browser.newContext();
    await S.grantPermissions(['notifications'], { origin: BASE });
    const sp = await S.newPage();
    await sp.goto(BASE + '/offline-probe-' + Date.now(), { waitUntil: 'domcontentloaded' }).catch(() => {});
    const cdp = await S.newCDPSession(sp);
    const regs = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', e => regs.push(...e.registrations));
    await cdp.send('ServiceWorker.enable');
    await sp.evaluate(() => navigator.serviceWorker.register('/service-worker.js').then(() => navigator.serviceWorker.ready));
    await sp.waitForTimeout(800);
    const reg = regs.find(r => r.scopeURL === BASE + '/');
    if (reg) {
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: reg.registrationId,
        data: JSON.stringify({ title: 'Tobi checked in at Egbeda', body: 'At 10:02', url: '/family', tag: 'checkin-1', urgent: true }) });
      await sp.waitForTimeout(800);
    }
    const shown = await sp.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/'); const n = r ? await r.getNotifications() : []; return n.map(x => ({ t: x.title, b: x.body, tag: x.tag, url: x.data && x.data.url, ri: x.requireInteraction })); });
    chk('service worker: a push it is handed is shown with its words, tag and page', !!reg && shown.length === 1 && shown[0].t === 'Tobi checked in at Egbeda'
      && shown[0].b === 'At 10:02' && shown[0].tag === 'checkin-1' && shown[0].url === '/family');
    chk('service worker: …and an urgent one stays on screen until it is dealt with', shown[0] && shown[0].ri === true);
    if (reg) {
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: reg.registrationId, data: JSON.stringify({ title: 'x', url: 'https://evil.example/' }) });
      await sp.waitForTimeout(600);
    }
    const evil = await sp.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/'); return (await r.getNotifications()).filter(x => x.title === 'x').map(x => x.data.url); });
    chk('service worker: a link that is not one of our pages opens the home page instead', evil[0] === '/');

    const errs = [].concat(M.errs, A.errs, F.errs).filter(e => !/ResizeObserver/.test(e));
    chk('no page errors in any portal' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''), errs.length === 0);
  } catch (e) {
    console.error(e); failed++;
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
    console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed` : `✅ PASS: ${passed} passed, 0 failed`));
    process.exit(failed ? 1 : 0);
  }
})();
