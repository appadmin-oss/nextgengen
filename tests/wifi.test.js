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
/* WCAG 2.1 A/AA on one part of the page (axe-core, as tests/a11y.test.js): serious and critical only. */
const AXE = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
async function axeOk(p, sel) {
  if (!fs.existsSync(AXE)) { console.log('  (axe-core not installed: accessibility checks skipped)'); return true; }
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ path: AXE });
  const v = await p.evaluate(s => window.axe.run({ include: [[s]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })
    .then(r => r.violations.filter(x => x.impact === 'serious' || x.impact === 'critical').map(x => x.id + ' × ' + x.nodes.length + ': ' + x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | '))), sel);
  if (v.length) console.error('    ' + v.join('\n    '));
  return v.length === 0;
}
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
      db_insert('members', ['memberId'=>'NGG-WF-NADM','fullName'=>'Bola Centre Admin','email'=>'bola@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'admin','centre'=>'Egbeda','capsExtra'=>json_encode(['network']),'createdAt'=>$now,'updatedAt'=>$now]);
      // Thirty days of history, so the analytics have something to show.
      for ($d = 1; $d <= 30; $d++) foreach ([[$out[0][0], 22], [$out[1][0], 14]] as [$gid, $base]) {
        $peak = $base + (($d * 7) % 11) + (in_array((int)gmdate('N', time() - $d * 86400), [6], true) ? 18 : 0);
        db_insert('wifi_gateway_daily', ['gatewayId'=>$gid, 'date'=>gmdate('Y-m-d', time() - $d * 86400), 'samples'=>500, 'hoursUp'=>$d % 9 === 0 ? 17 : 24, 'activePeak'=>$peak, 'activeSum'=>$peak * 300, 'activeSamples'=>500, 'cpuMax'=>40 + $d % 30]);
      }
      for ($h = 1; $h <= 13 * 24; $h++) { $t = time() - $h * 3600; $hr = (int)gmdate('G', $t) + 1; $sat = (int)gmdate('N', $t) === 6;
        $a = $hr >= 8 && $hr <= 15 ? ($sat ? 30 : 6) + ($hr % 4) : 0; db_insert('wifi_gateway_stats', ['gatewayId'=>$out[0][0], 'hour'=>gmdate('Y-m-d\\TH', $t), 'samples'=>30, 'activeMax'=>$a, 'activeSum'=>$a * 30, 'activeSamples'=>30, 'cpuMax'=>35, 'memFreeMin'=>80]); }
      foreach ([[9.4, 'Egbeda', 6], [4.1, 'Ikeja', 3], [12.2, 'Egbeda', 1]] as [$dl, $c, $ago]) db_insert('wifi_speed_tests', ['centre'=>$c, 'source'=>'device', 'downMbps'=>$dl, 'upMbps'=>$dl / 3, 'rttMs'=>60, 'byId'=>'${ADMIN}', 'note'=>'Main hall', 'at'=>gmdate('Y-m-d\\TH:i:s\\Z', time() - $ago * 86400)]);
      $rg = admin_wifi_region_save(['requesterId'=>'${ADMIN}', 'name'=>'Lagos Mainland', 'code'=>'LM']);
      admin_wifi_region_assign(['requesterId'=>'${ADMIN}', 'regionId'=>$rg['regionId'], 'centres'=>['Egbeda', 'Ikeja', 'Yaba']]);
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
    const fl = JSON.parse(php(`echo json_encode(db_row('SELECT SUM(fetches) f, SUM(failed) x, MAX(msMax) m FROM wifi_feed_load'));`, ['bootstrap']));
    chk('each fetch over HTTP is measured into the hour: its time, and whether it was refused', +fl.f >= 2 && +fl.x >= 1 && +fl.m > 0);

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

    if (process.env.WIFI_REF) { const R = await open(ADMIN, true, '/club-admin?s=centres'); await R.waitForTimeout(6000); await shot(R, 'ref-club-centres', false); const R2 = await open(ADMIN, true, '/club-admin?s=desks'); await R2.waitForTimeout(6000); await shot(R2, 'ref-club-desks', false); const R3 = await open(ADMIN, true, '/club-admin'); await R3.waitForTimeout(6000); await shot(R3, 'ref-club-home', false); }
    console.log('Control Room → Wi-Fi → Analytics and Regions');
    await P.goto(BASE + '/control/wifi/wifi-analytics', { waitUntil: 'domcontentloaded' });
    await P.waitForFunction(() => /Most online at once/.test(document.body.innerText) && /Busiest centres/.test(document.body.innerText), null, { timeout: 60000 });
    chk('the Control Room has Wi-Fi analytics too', /People online/.test(await P.innerText('body')) && /Regions now/.test(await P.innerText('body')));
    await P.click('button:has-text("Last 7 days")');
    await P.waitForFunction(() => /in the last 7 days/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    chk('…and its period changes', /in the last 7 days/.test(await P.innerText('body')));
    await shot(P, 'wifi-cr-analytics');
    await P.goto(BASE + '/control/wifi/wifi-regions', { waitUntil: 'domcontentloaded' });
    await P.waitForFunction(() => /Lagos Mainland/.test(document.body.innerText), null, { timeout: 60000 });
    chk('…and regions', /Lagos Mainland/.test(await P.innerText('body')) && /New region/.test(await P.innerText('body')));
    await shot(P, 'wifi-cr-regions');

    console.log('Wi-Fi inside the Club portal, in its own design');
    const C = await open(ADMIN, true, '/club-admin?s=wifi');
    await C.waitForSelector('.cw-stats', { timeout: 40000 });
    await C.waitForFunction(() => /Most online at once/.test(document.body.innerText) && document.querySelector('.cw-chart svg'), null, { timeout: 60000 });
    const ov = await C.innerText('.cw');
    chk('the Club portal shows Wi-Fi in place, in the Club’s own design (no Control Room inside it)', /\/club-admin/.test(C.url()) && !(await C.$('.cr-app')) && /Most online at once/.test(ov));
    chk('the overview has the analytics: online per day, busy hours, availability, line speed, regions', /People online/.test(ov) && /Busy hours/.test(ov) && /Gateways there/.test(ov) && /Line speed/.test(ov) && /Lagos Mainland/.test(ov));
    chk('…and names what needs doing', /aren’t working|isn’t working/.test(ov) && /Busiest centres/.test(ov) && /Slowest lines/.test(ov));
    await C.waitForFunction(() => /Server load/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    chk('…and, for the Wi-Fi regions capability, what the feed costs this host and whether more regions can go live', /Server load/.test(await C.innerText('.cw')) && /Time per fetch/.test(await C.innerText('.cw')) && /Not measured yet|Within budget|Close to the budget|Over budget/.test(await C.innerText('.cw')));
    const nav = await C.innerText('nav, aside').catch(() => '');
    chk('Wi-Fi has its own sections in the Club sidebar', /Gateways/.test(await C.innerText('body')) && /Speed tests/.test(await C.innerText('body')) && /Regions/.test(await C.innerText('body')));
    await shot(C, 'wifi-club-1-overview');
    chk('the Club Wi-Fi overview passes WCAG 2.1 A/AA (axe)', await axeOk(C, '.cw'));
    await C.goto(BASE + '/club-admin?s=wifi-gateways', { waitUntil: 'domcontentloaded' });
    await C.waitForSelector('.cw-table.is-rows tbody tr', { timeout: 40000 });
    chk('Gateways is a server-paged table with search and filters', (await C.$$('.cw-table.is-rows tbody tr')).length === 4 && /1–4 of 4/.test(await C.innerText('.cw-pager')));
    await C.selectOption('.cw-tools select[aria-label="Status"]', 'bad');
    await C.waitForFunction(() => /of 2\b/.test((document.querySelector('.cw-pager') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    chk('…filtered on the server', /of 2\b/.test(await C.innerText('.cw-pager')));
    await C.selectOption('.cw-tools select[aria-label="Status"]', '');
    await C.waitForFunction(() => /of 4\b/.test((document.querySelector('.cw-pager') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    await shot(C, 'wifi-club-2-gateways');
    chk('the gateways table passes WCAG 2.1 A/AA (axe)', await axeOk(C, '.cw'));
    await C.click('.cw-table.is-rows tbody tr:has-text("Main hall router")');
    await C.waitForSelector('.cw-panel', { timeout: 10000 });
    const pn = await C.innerText('.cw-panel');
    chk('a gateway opens in a Club panel with its diagnosis and tools', /How it is/.test(pn) && /Rotate the key/.test(pn) && /Setup guide/.test(pn));
    await shot(C, 'wifi-club-3-gateway', false);
    chk('the gateway panel passes WCAG 2.1 A/AA (axe)', await axeOk(C, '.cw-panel'));
    await C.keyboard.press('Escape');
    await C.goto(BASE + '/club-admin?s=wifi-regions', { waitUntil: 'domcontentloaded' });
    await C.waitForSelector('.cw-tile', { timeout: 40000 });
    chk('Regions shows each region with its health and leads', /Lagos Mainland/.test(await C.innerText('.cw')) && /3 centres/.test(await C.innerText('.cw')));
    await shot(C, 'wifi-club-4-regions');
    chk('the regions page passes WCAG 2.1 A/AA (axe)', await axeOk(C, '.cw'));
    await C.click('.cw-tile:has-text("Lagos Mainland")');
    await C.waitForSelector('.cw-panel .cw-list li', { timeout: 10000 });
    chk('a region opens with its centres', /Egbeda/.test(await C.innerText('.cw-panel')) && /Region speeds/.test(await C.innerText('.cw-panel')));
    await shot(C, 'wifi-club-5-region', false);
    php(`db_exec("UPDATE wifi_gateways SET testAsked = 0");`, ['bootstrap']);
    await C.click('.cw-panel button:has-text("Line test, every gateway")');
    await C.waitForSelector('.cw-ask', { timeout: 10000 });
    const ask = await C.innerText('.cw-ask');
    await C.click('.cw-ask button:has-text("Ask for")');
    await C.waitForFunction(() => /asked/.test((document.querySelector('.cw-toast') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    const asked = +php(`echo db_row("SELECT COUNT(*) c FROM wifi_gateways w JOIN wifi_region_centres rc ON rc.centre = w.centre JOIN wifi_regions g ON g.regionId = rc.regionId WHERE g.name = 'Lagos Mainland' AND w.testAsked = 1 AND (w.removedAt = '' OR w.removedAt IS NULL)")['c'];`, ['bootstrap']);
    chk('a whole region’s gateways are asked for a line test in one press, the count said before it is confirmed', /Ask \d+ gateways? in Lagos Mainland/.test(ask) && asked >= 1
      && /asked/.test(await C.innerText('.cw-toast')) && +php(`echo db_row("SELECT COUNT(*) c FROM audit_log WHERE event = 'wifi.gateway.bulk'")['c'];`, ['bootstrap']) === 1);
    await C.keyboard.press('Escape');
    await C.goto(BASE + '/club-admin?s=wifi-speed', { waitUntil: 'domcontentloaded' });
    await C.waitForSelector('.cw-test', { timeout: 40000 });
    await shot(C, 'wifi-club-6-speed');
    const K = await open(CLUB, true, '/club-admin');
    await K.waitForFunction(() => /Roster/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    chk('a club coordinator without network does not see Wi-Fi', !/\bSpeed tests\b/.test(await K.innerText('body')));
    const N = await open('NGG-WF-NADM', true, '/club-admin?s=wifi-gateways');
    await N.waitForSelector('.cw-table.is-rows tbody tr, .cw-empty', { timeout: 40000 });
    const nb = await N.innerText('.cw');
    chk('an NGG admin with network sees only their own centre', /Showing the centre you look after: Egbeda/.test(nb) && /Main hall router/.test(nb) && !/Front office hAP|UniFi via RADIUS/.test(nb));
    await shot(N, 'wifi-club-7-own-centre');

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
