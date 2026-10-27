#!/usr/bin/env node
/* ============================================================================
   Wi-Fi (domain/wifi.php), in the browser against the real PHP backend:
   the Control Room's Settings → Wi-Fi workspace (gateways and their health,
   who gets on, speeds), adding a gateway (its key shown once), the gateway's
   own feed over HTTP, the Club portal's door for `network` holders only, and
   the member's Me → Wi-Fi card.

   Run:  node tests/wifi.test.js      (screenshots: WIFI_SHOTS=<dir>)
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.WIFI_PORT || '8311';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-wifi-'));
const DB = path.join(TMP, 'ngg.db');
const SHOTS = process.env.WIFI_SHOTS || '';
const ADMIN = 'NGG-WF-ADM', CLUB = 'NGG-WF-CLUB', MEMBER = 'NGG-WF-M1';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require_once ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
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
// The boot splash fades out once the app is up; a picture is taken after it has gone.
const settle = p => p.waitForFunction(() => { const b = document.getElementById('ngg-boot'); return !b || b.classList.contains('gone'); }, null, { timeout: 30000 }).then(() => p.waitForTimeout(700), () => {});
const shot = async (p, n, full = true) => { if (!SHOTS) return; await settle(p); await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: full }).catch(() => {}); };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  wifi: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'wifi_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    // Four centres, members, and four gateways in four states: working, silent, never connected, reporting a problem.
    const keys = JSON.parse(php(`db_migrate(db_conn()); $now = now_iso();
      foreach ([['CEN-1','Egbeda','EG'],['CEN-2','Ikeja','IK'],['CEN-3','Yaba','YB'],['CEN-4','Surulere','SU'],['CEN-5','Ajah','AJ']] as $c) db_insert('centres', ['centreId'=>$c[0],'name'=>$c[1],'code'=>$c[2],'status'=>'active','createdAt'=>$now]);
      db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Tunde Systems','email'=>'tunde@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','displayId'=>'026-001','createdAt'=>$now,'updatedAt'=>$now]);
      db_insert('members', ['memberId'=>'${CLUB}','fullName'=>'Kemi Club','email'=>'kemi@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'club_admin','centre'=>'Egbeda','createdAt'=>$now,'updatedAt'=>$now]);
      for ($i = 1; $i <= 12; $i++) db_insert('members', ['memberId'=>'NGG-WF-M'.$i,'fullName'=>'Member '.$i,'email'=>'m'.$i.'@example.org','type'=>'NGG','status'=>$i === 12 ? 'suspended' : 'active','role'=>'member','centre'=>$i % 2 ? 'Egbeda' : 'Ikeja','displayId'=>sprintf('026-%03d', 100 + $i),'createdAt'=>$now,'updatedAt'=>$now]);
      $out = [];
      foreach ([['mikrotik','Egbeda','Main hall router'],['radius','Ikeja','UniFi via RADIUS bridge'],['openwrt','Yaba','Library openNDS'],['mikrotik','Surulere','Front office hAP']] as $g) {
        $r = admin_wifi_gateway_save(['requesterId'=>'${ADMIN}','platform'=>$g[0],'centre'=>$g[1],'label'=>$g[2]]);
        $out[] = [$r['gateway']['gatewayId'], $r['key']];
      }
      $f = wifi_feed(['gatewayId'=>$out[0][0],'key'=>$out[0][1],'since'=>0,'os'=>'7.16.2']); wifi_feed(['gatewayId'=>$out[0][0],'key'=>$out[0][1],'since'=>$f['version']]);
      $f = wifi_feed(['gatewayId'=>$out[1][0],'key'=>$out[1][1],'since'=>0,'os'=>'FreeRADIUS 3.2.1']); wifi_feed(['gatewayId'=>$out[1][0],'key'=>$out[1][1],'since'=>$f['version']]);
      db_update('wifi_gateways', ['lastSeenAt'=>gmdate('Y-m-d\\\\TH:i:s\\\\Z', time() - 3 * 3600)], ['gatewayId'=>$out[1][0]]);
      $f = wifi_feed(['gatewayId'=>$out[3][0],'key'=>$out[3][1],'since'=>0,'os'=>'7.12','error'=>'fetch: certificate verify failed']);
      echo json_encode($out);`, ['bootstrap']));
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    // The gateway's own fetch, over HTTP, with its key in a header.
    const feed = async (id, key, q) => { const r = await fetch(BASE + '/api/hooks/wifi-feed.php' + (q || ''), { headers: { 'X-NGG-Gateway': id, 'X-NGG-Key': key } }); return { status: r.status, text: await r.text() }; };
    const f0 = await feed(keys[0][0], keys[0][1], '?since=0&os=7.16.2');
    chk('a gateway fetches its list over HTTP with its key in a header', f0.status === 200 && /^#ngg-wifi;v=\d+;full=1;/.test(f0.text) && /\nu;026-101;\d{6};ngg-member;add\n/.test(f0.text) && /#end\n$/.test(f0.text));
    chk('a suspended member is not on it', !/026-112/.test(f0.text));
    const fb = await feed(keys[0][0], 'nope');
    chk('a wrong key is a 401 with a word the router can log', fb.status === 401 && fb.text.trim() === '#error;bad_key');

    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const tok = (id, adm) => php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), ${adm ? 'true' : 'false'});`, ['bootstrap', 'session']);
    const errs = [];
    const open = async (id, adm, at, w = 1440, h = 1000) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addCookies([{ name: 'ngg_sess', value: tok(id, adm), domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      return p;
    };

    console.log('Control Room → Settings → Wi-Fi');
    const P = await open(ADMIN, true, '/control/wifi');
    await P.waitForSelector('.cr-app', { timeout: 30000 });
    await P.waitForFunction(() => /Main hall router/.test(document.body.innerText), null, { timeout: 30000 });
    const body = await P.innerText('body');
    chk('Wi-Fi is its own page under System, opening on Gateways', /Each centre’s Wi-Fi gateway/.test(body) && /Who gets on/.test(body) && /Setup guides/.test(body) && /\/control\/wifi$/.test(P.url()));
    chk('each gateway is shown with its platform and health', /Main hall router/.test(body) && /UniFi via RADIUS bridge/.test(body) && /Not connected yet/.test(body));
    chk('a silent gateway and one reporting a problem are listed as needing a look', /Silent for 3 hours/.test(body) && /reported a problem/i.test(body));
    chk('a centre without a gateway is shown, ready to add one', /Ajah/.test(body) && /No gateway yet/.test(body));
    chk('a working gateway with one wrong-key attempt is a warning, not “not working”', /Main hall router · 1 fetch with the wrong key/.test(body));
    await shot(P, 'wifi-1-gateways');
    await P.click('.cr-card:has-text("Main hall router")');
    await P.waitForSelector('.cr-sheet', { timeout: 10000 });
    const dr = await P.innerText('.cr-sheet');
    chk('a gateway opens with how it is and what it can do', /Online now/.test(dr) && /Working/.test(dr) && /Rotate the key/.test(dr) && /What it holds/.test(dr));
    await shot(P, 'wifi-2-gateway');
    await P.click('.cr-sheet button:has-text("Setup guide")');
    await P.waitForFunction(() => /ngg-wifi-sync/.test((document.querySelector('.cr-sheet') || {}).innerText || ''), null, { timeout: 10000 });
    chk('its setup guide has the steps and the RouterOS script, key left out', /Paste the script/.test(await P.innerText('.cr-sheet')) && /PASTE-THE-KEY-HERE/.test(await P.innerText('.cr-sheet')));
    await shot(P, 'wifi-3-guide');
    await P.keyboard.press('Escape');

    await P.goto(BASE + '/control/wifi/wifi-access', { waitUntil: 'domcontentloaded' });
    await P.waitForFunction(() => /Speeds, devices and hours/.test(document.body.innerText), null, { timeout: 30000 });
    const acc = await P.innerText('body');
    chk('Who gets on shows the table and the speeds, edited in place', /From people’s records/.test(acc) && /Suspended, evicted or inactive/.test(acc) && /Download \(Mbit\/s\)/.test(acc));
    await shot(P, 'wifi-4-access');
    await P.click('button:has-text("Why can’t somebody get on?")');
    await P.fill('[role="dialog"] input', '026-112');
    await P.click('[role="dialog"] button[type="submit"]');
    await P.waitForFunction(() => /Suspended, evicted or inactive/.test((document.querySelector('.cr-sheet') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    chk('the lookup says why somebody can’t get on', /Member 12/.test(await P.innerText('.cr-sheet')) && /Suspended, evicted or inactive/.test(await P.innerText('.cr-sheet')));
    await shot(P, 'wifi-5-lookup');

    await P.goto(BASE + '/control/wifi/wifi-guides', { waitUntil: 'domcontentloaded' });
    await P.waitForFunction(() => /Which gateway/.test(document.body.innerText), null, { timeout: 30000 });
    await settle(P);
    chk('Setup guides compares the platforms, pilot status included', /Pilot first/i.test(await P.innerText('body')) && /OpenWrt with openNDS/.test(await P.innerText('body')));
    await shot(P, 'wifi-6-guides');

    console.log('Speed & health');
    await P.goto(BASE + '/control/wifi/wifi-health', { waitUntil: 'domcontentloaded' });
    await P.waitForFunction(() => /Each centre’s line/.test(document.body.innerText), null, { timeout: 30000 });
    await P.click('button:has-text("Test this connection")');
    await P.waitForSelector('[role="dialog"] select', { timeout: 10000 });
    await P.selectOption('[role="dialog"] select', 'Egbeda');
    await P.fill('[role="dialog"] input', 'Main hall, test');
    await P.click('[role="dialog"] button[type="submit"]');
    await P.waitForFunction(() => /down/.test((document.querySelector('.cr-sheet') || {}).innerText || '') && /Delay/.test((document.querySelector('.cr-sheet') || {}).innerText || ''), null, { timeout: 60000 });
    const sp = await P.innerText('.cr-sheet');
    chk('a speed test runs from the browser: download, upload and delay', /Download/.test(sp) && /Upload/.test(sp) && /\d+ ms/.test(sp));
    await shot(P, 'wifi-7-speedtest');
    await P.keyboard.press('Escape');
    await P.waitForFunction(() => /Main hall, test/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    chk('…and is kept for the centre', /Main hall, test/.test(await P.innerText('body')));
    await shot(P, 'wifi-8-health');

    console.log('Wi-Fi inside the Club portal');
    const C = await open(ADMIN, true, '/club-admin?s=wifi');
    await C.waitForFunction(() => /Main hall router/.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {});
    const cb = await C.innerText('body');
    chk('somebody holding network gets Wi-Fi inside the Club portal, not sent away', /\/club-admin/.test(C.url()) && /Main hall router/.test(cb) && /Speed & health/.test(cb) && /Who gets on/.test(cb));
    await shot(C, 'wifi-9-club-portal');
    await C.click('.cr-embed .cr-card:has-text("Main hall router")');
    await C.waitForSelector('.cr-sheet', { timeout: 10000 }).catch(() => {});
    chk('…with the same gateway drawer', /Rotate the key/.test(await C.innerText('.cr-sheet').catch(() => '')));
    await shot(C, 'wifi-10-club-drawer', false);
    const K = await open(CLUB, true, '/club-admin');
    await K.waitForFunction(() => /Roster/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    chk('a club coordinator without network does not', !/\bWi-Fi\b/.test(await K.innerText('body')));

    console.log('the member’s Me → Wi-Fi');
    const M = await open(MEMBER, false, '/dashboard/me', 420, 900);
    await M.waitForSelector('.m9x-wifi', { timeout: 30000 });
    await M.waitForFunction(() => /Username/.test((document.querySelector('.m9x-wifi') || {}).innerText || ''), null, { timeout: 20000 });
    const w = await M.innerText('.m9x-wifi');
    chk('a member sees their username, with the PIN hidden until asked', /026-101/.test(w) && /••••••/.test(w));
    await M.click('.m9x-wifi [aria-label="Show your PIN"]');
    chk('…and shown when asked', /\d{6}/.test(await M.innerText('.m9x-wifi')));
    await shot(M, 'wifi-member-card');

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
    console.log('\n' + (failed ? '❌ FAIL: ' + passed + ' passed, ' + failed + ' failed (wifi)' : '✅ PASS: ' + passed + ' passed (wifi)'));
    process.exit(failed ? 1 : 0);
  }
})();
