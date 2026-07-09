#!/usr/bin/env node
/* ============================================================================
   Anchor Journal PWA — runtime smoke test.

   `node build.js` only proves the JSX compiles; this drives the REAL app in
   a real Chromium against the real PHP backend and fails on any uncaught
   page error. It exercises: OTP sign-in → 4-step onboarding → Journey
   (greeting + flat XP model) → Shop (freeze + themes) → Growth (rank
   ladder) → You (live Anchor Link code from member.circle) → Focus →
   anchoring a reflection (celebration + XP advance).

   Setup (throwaway — NEVER a production DB):
     1. Write a scratch api/config.php pointing sqlite_path at a temp file
        (config.php is git-ignored; delete it afterwards).
     2. Seed one member:
        php -r '$GLOBALS["CONFIG"]=require "api/config.php";
          require "api/_lib/response.php"; require "api/_lib/db.php";
          require "api/_lib/util.php";
          db_insert("members",["memberId"=>"NGG-2025-0001","fullName"=>"Smoke Tester",
            "email"=>"smoke@example.com","type"=>"NGG","status"=>"active","role"=>"member",
            "centre"=>"Egbeda","createdAt"=>now_iso(),"updatedAt"=>now_iso()]);'
     3. php -S 127.0.0.1:8123 -t .
     4. node tests/journal-smoke.js

   Env overrides: SMOKE_BASE (default http://127.0.0.1:8123),
   SMOKE_MEMBER (NGG-2025-0001), PLAYWRIGHT_MODULE (playwright),
   CHROMIUM_PATH (Playwright's own download when unset).

   Without a mail transport the OTP request errors `mail_failed` AFTER the
   OTP row is stored — the test takes the "I already have a code" path and
   reads the OTP straight from the DB via api/config.php.
   ============================================================================ */
const { execSync } = require('child_process');
const path = require('path');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8123';
const MEMBER = process.env.SMOKE_MEMBER || 'NGG-2025-0001';
const ROOT = path.resolve(__dirname, '..');

let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (e) { console.error('playwright not found — npm i playwright (or set PLAYWRIGHT_MODULE)'); process.exit(2); }

function otpFromDb() {
  const php = `$GLOBALS["CONFIG"]=require "${ROOT}/api/config.php";`
    + `require "${ROOT}/api/_lib/response.php";require "${ROOT}/api/_lib/db.php";require "${ROOT}/api/_lib/util.php";`
    + `echo db_row("SELECT otp FROM auth_sessions ORDER BY id DESC LIMIT 1")["otp"];`;
  return execSync('php -r ' + JSON.stringify(php)).toString().trim();
}

(async () => {
  const launch = {};
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 400, height: 850 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  const step = (m) => console.log('  ✓ ' + m);
  const fail = (m) => { console.error('  ✗ ' + m); process.exitCode = 1; };

  try {
    // ── Sign-in gate (real OTP flow) ──
    await page.goto(BASE + '/journal/', { waitUntil: 'networkidle' });
    await page.waitForSelector('input.aj-input', { timeout: 20000 });
    step('sign-in gate rendered');
    await page.fill('input.aj-input', MEMBER);
    await page.click('button.btn-a');
    await page.waitForSelector('.aj-gate-err:has-text("mail_failed"), input.aj-otp', { timeout: 15000 });
    if (await page.$('.aj-gate-err:has-text("mail_failed")')) {
      await page.click('button.aj-linkbtn:has-text("I already have a code")');
      await page.waitForSelector('input.aj-otp', { timeout: 15000 });
      await page.fill('input[placeholder="Member ID"]', MEMBER);
    }
    const otp = otpFromDb();
    if (!/^\d{6}$/.test(otp)) throw new Error('no OTP found in DB: ' + otp);
    step('OTP requested + read from DB');
    await page.fill('input.aj-otp', otp);
    await page.click('button.btn-a');

    // ── Onboarding: 4 steps (fresh profile) ──
    await page.waitForSelector('.aj-onb', { timeout: 20000 });
    if (!(await page.textContent('.aj-onb')).includes('ANCHOR')) throw new Error('welcome step missing brand');
    step('onboarding step 1 (welcome)');
    await page.click('.aj-onb .btn-a');
    await page.waitForSelector('.aj-onb input.aj-input');
    await page.fill('.aj-onb input.aj-input', 'Smokey');
    step('onboarding step 2 (name)');
    await page.click('.aj-onb .btn-a');
    await page.waitForSelector('.aj-onb-chip');
    const whyPicked = await page.$('.aj-onb-chip.on');   // replay pre-fill
    if (!whyPicked && !(await page.isDisabled('.aj-onb .btn-a'))) fail('why step: continue enabled before pick');
    await page.click('.aj-onb-chip >> nth=1');
    step('onboarding step 3 (why chip)');
    await page.click('.aj-onb .btn-a');
    await page.waitForSelector('.aj-onb-time');
    await page.click('.aj-onb-time >> nth=3');
    step('onboarding step 4 (study time)');
    await page.click('.aj-onb .btn-a');

    // ── Journey — greeting uses the chosen name; XP meta = flat model ──
    await page.waitForSelector('.aj-hero-h', { timeout: 15000 });
    const hero = await page.textContent('.aj-hero-h');
    if (!hero.includes('Smokey')) fail('greeting does not use onboarding name: ' + hero.trim());
    else step('journey greets by chosen name');
    const xpMeta = await page.textContent('.aj-xp-meta');
    if (!/\d+ \/ 250 XP/.test(xpMeta)) fail('xp meta not flat-model: ' + xpMeta);
    else step('flat XP model on the level card (' + xpMeta.trim() + ')');

    // ── Shop (via diamonds tap) ──
    await page.click('button.aj-metric.dia');
    await page.waitForSelector('.aj-shop-item');
    const shopTxt = await page.textContent('.aj-view');
    if (!shopTxt.includes('Streak Freeze') || !shopTxt.includes('Anchor Lime')) fail('shop content missing');
    else step('shop renders (freeze + themes)');
    if (!(await page.textContent('.aj-shop-theme.on')).includes('EQUIPPED')) fail('no equipped theme');
    else step('a theme is equipped');

    // ── Growth — flat rank ladder + shop link ──
    await page.click('.aj-nav-btn >> nth=2');
    await page.waitForSelector('.aj-ranks');
    const ranks = await page.textContent('.aj-ranks');
    if (!ranks.includes('1000 XP') && !ranks.includes('CURRENT')) fail('rank ladder wrong: ' + ranks);
    else step('rank ladder uses flat thresholds');
    if (!(await page.textContent('.aj-view')).includes('Anchor shop')) fail('growth missing shop link');
    else step('growth has Anchor shop row');

    // ── You — live Anchor Link code + circle rows + settings ──
    await page.click('.aj-nav-btn >> nth=3');
    await page.waitForSelector('.aj-code-card', { timeout: 15000 });
    await page.waitForFunction(() => /\d{3} \d{3}/.test(document.querySelector('.aj-code')?.textContent || ''), null, { timeout: 15000 });
    step('You shows a real Anchor Link code');
    const youTxt = await page.textContent('.aj-view');
    for (const s of ['Home · Parent', 'School · Teacher', 'Sound & haptics', 'Replay intro'])
      if (!youTxt.includes(s)) fail('You screen missing: ' + s);
    step('You circle rows + settings rows present');

    // ── Focus renders ──
    await page.click('.aj-nav-btn >> nth=1');
    await page.waitForSelector('.aj-focus-ring');
    step('focus tool renders');

    // ── Anchor a reflection end-to-end ──
    await page.click('.aj-nav-btn >> nth=0');
    await page.waitForSelector('.aj-pnode');
    const xpBefore = parseInt((await page.textContent('.aj-xp-meta')).match(/(\d+) \/ 250/)[1], 10);
    await page.click('.aj-pnode >> nth=0');
    await page.waitForSelector('.aj-musing');
    await page.fill('.aj-musing', 'Runtime smoke musing — the journal works end to end.');
    await page.click('button.btn-a:has-text("Anchor it")');
    await page.waitForSelector('.aj-celebrate-in', { timeout: 15000 });
    step('reflection anchored → celebration overlay');
    await page.waitForSelector('.aj-celebrate-in', { state: 'detached', timeout: 10000 });
    const xpAfter = parseInt((await page.textContent('.aj-xp-meta')).match(/(\d+) \/ 250/)[1], 10);
    // First reflection of the day adds 60; a re-run same-day stays flat.
    if (xpAfter !== xpBefore && xpAfter !== ((xpBefore + 60) % 250)) fail(`xp moved oddly: ${xpBefore} → ${xpAfter}`);
    else step(`xp consistent after anchoring (${xpBefore} → ${xpAfter})`);

    if (pageErrors.length) fail('uncaught page errors: ' + pageErrors.join(' | '));
    else step('zero uncaught page errors');
  } catch (e) {
    console.error('  ✗ SMOKE FAILED: ' + e.message);
    try { await page.screenshot({ path: 'journal-smoke-fail.png' }); console.error('  screenshot: journal-smoke-fail.png'); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
  console.log(process.exitCode ? 'SMOKE: FAIL' : 'SMOKE: PASS');
})();
