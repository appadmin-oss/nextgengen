#!/usr/bin/env node
/* ============================================================================
   Tours that know the device (src/modules/guide/guide.jsx), on the real
   member portal: a phone is told about the bar at the bottom and how to put
   NGG on its home screen, a computer about the list on the left; the control
   a step is about is lit up on the page; a step about another screen shows
   its screenshot (tools/guide-shots.js); and somebody who did the tour on a
   phone gets a short tour of what is different the first time they sign in
   on a computer — once.
   Run:  node tests/guide.test.js
   ========================================================================== */
'use strict';
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.GUIDE_PORT || '8333', BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-guide-'));
let seq = 0, passed = 0, failed = 0, server, browser;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function php(snippet) {
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' };
const DESK = { viewport: { width: 1280, height: 860 } };
async function open(dev, state) {
  if (state !== undefined) php(`db_exec("DELETE FROM member_state WHERE memberId = 'NGG-GT-K1' AND stateKey = 'onboard.member'");` + (state ? ` db_insert('member_state', ['memberId' => 'NGG-GT-K1', 'stateKey' => 'onboard.member', 'stateValue' => ${JSON.stringify(JSON.stringify(state))}, 'updatedAt' => now_iso()]);` : ''));
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-GT-K1'"), false);`);
  const ctx = await browser.newContext(Object.assign({ reducedMotion: 'reduce' }, dev));
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'gt-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('ngg.guide.force', '1'); } catch (_) {} });
  const pg = await ctx.newPage();
  pg.errs = []; pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 300)));
  await pg.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await waitForBoot(pg);
  return pg;
}
const stateNow = () => { const r = php(`echo db_row("SELECT stateValue FROM member_state WHERE memberId = 'NGG-GT-K1' AND stateKey = 'onboard.member'")['stateValue'] ?? 'null';`); try { return JSON.parse(r); } catch (_) { return null; } };
const stepTexts = async pg => { const out = []; for (let k = 0; k < 14; k++) { const t = await pg.innerText('.ngt-card').catch(() => ''); if (!t) break; out.push(t); const last = await pg.$('.ngt-next:has-text("Start"), .ngt-next:has-text("Got it")'); if (last) break; await pg.click('.ngt-next'); await pg.waitForTimeout(120); } return out; };

(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return ['db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(path.join(TMP, 'ngg.db'))}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'x@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'guide_test_secret_0123456789abcdefghij', 'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'maps' => ['offline' => true], 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false];\n`);
  try {
    php(`$now = now_iso();
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      db_insert('members', ['memberId' => 'NGG-GT-K1', 'fullName' => 'Tolu Adebayo', 'email' => 'tolu@gt.example', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda',
        'track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-13 years')), 'displayId' => '026-014', 'createdAt' => $now, 'updatedAt' => $now]); echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await require(ROOT + '/node_modules/playwright-core').chromium.launch(d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});

    console.log('on a phone, first visit');
    const P = await open(PHONE, null);
    await P.waitForSelector('.ngt-card', { timeout: 60000 });
    chk('the tour opens on a first visit, by name', /Hi Tolu, this is your space/.test(await P.innerText('.ngt-card')));
    const phoneSteps = await stepTexts(P);
    const nav = phoneSteps.find(t => /Finding your way/.test(t)) || '';
    chk('a phone is told about the bar at the bottom', /bar at the bottom/.test(nav) && !/list on the left/.test(nav));
    chk('…and how to put NGG on its home screen, in Android’s words', phoneSteps.some(t => /home screen/.test(t) && /Install app|Add to Home screen/.test(t)));
    await P.click('.ngt-next'); await P.waitForTimeout(300);
    chk('the last step ends the tour', !(await P.$('.ngt-card')));
    const st1 = stateNow();
    chk('…and the record says it was seen, on a phone', st1 && st1.done === true && Array.isArray(st1.devices) && st1.devices.join() === 'phone');
    // The light on the real control, from the tour opened again.
    await P.evaluate(() => window.nggGuide('member'));
    await P.waitForSelector('.ngt-card', { timeout: 10000 });
    await P.click('.ngt-next');
    await P.waitForTimeout(400);
    const spot = await P.$('.ngt-spot');
    const ring = spot && await spot.boundingBox(), navEl = await P.$(".m9-app nav[aria-label='My NGG']"), nb = navEl && await navEl.boundingBox();
    chk('a step about a control lights it up on the page, over the control itself',
      !!ring && !!nb && ring.x <= nb.x + 1 && ring.y <= nb.y + 1 && ring.x + ring.width >= nb.x + nb.width - 1 && ring.y + ring.height >= nb.y + nb.height - 1);
    chk('…and the card moves out of its way', await P.evaluate(() => { const c = document.querySelector('.ngt-card').getBoundingClientRect(), s = document.querySelector('.ngt-spot').getBoundingClientRect(); return c.bottom <= s.top + 1 || c.top >= s.bottom - 1; }));
    await P.keyboard.press('Escape');
    chk('Escape closes it', !(await P.$('.ngt-card')));
    chk('no page errors on the phone', P.errs.length === 0); if (P.errs.length) console.error(P.errs.join('\n'));
    await P.context().close();

    console.log('the same person, now on a computer');
    const D = await open(DESK);
    await D.waitForSelector('.ngt-card', { timeout: 60000 });
    const dtext = await D.innerText('.ngt-card');
    chk('a computer, after a phone, gets the short tour of what is different', /New here on a computer/.test(dtext));
    const deskSteps = await stepTexts(D);
    chk('…about the list on the left, not the bar at the bottom', deskSteps.some(t => /list on the left/.test(t)) && !deskSteps.some(t => /bar at the bottom/.test(t)));
    chk('…without the home-screen step, and short', !deskSteps.some(t => /home screen/.test(t)) && deskSteps.length <= 4);
    await D.click('.ngt-next'); await D.waitForTimeout(300);
    const st2 = stateNow();
    chk('…once: both devices are on the record now', st2 && st2.devices.includes('phone') && st2.devices.includes('desktop'));
    await D.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(D); await D.waitForTimeout(2500);
    chk('signing in again on the computer shows nothing', !(await D.$('.ngt-card')));
    // A step about another screen shows its screenshot.
    await D.evaluate(() => window.nggGuide('member'));
    await D.waitForSelector('.ngt-card', { timeout: 10000 });
    let img = null;
    for (let k = 0; k < 6 && !img; k++) { img = await D.$('.ngt-shot img'); if (!img) { await D.click('.ngt-next'); await D.waitForTimeout(250); } }
    chk('a step about another screen shows a real screenshot of it, with words for a screen reader',
      !!img && (await img.evaluate(i => i.complete ? i.naturalWidth : new Promise(r => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); }))) > 100 && ((await img.getAttribute('alt')) || '').length > 8);
    await D.keyboard.press('Escape');
    chk('no page errors on the computer', D.errs.length === 0); if (D.errs.length) console.error(D.errs.join('\n'));
    await D.context().close();

    console.log('somebody who did the tour before devices were kept');
    const L = await open(DESK, { done: true, at: '2026-01-01T00:00:00Z' });
    await L.waitForTimeout(4000);
    chk('is not shown a tour out of the blue', !(await L.$('.ngt-card')));
    const st3 = stateNow();
    chk('…and this device is recorded for next time', st3 && Array.isArray(st3.devices) && st3.devices.join() === 'desktop');
    await L.context().close();
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    try { process.kill(-server.pid); } catch (_) {}
    try { fs.unlinkSync(CFG); } catch (_) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (device-aware tours)`);
    process.exit(failed ? 1 : 0);
  }
})();
