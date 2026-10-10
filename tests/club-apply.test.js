#!/usr/bin/env node
/* ============================================================================
   The Club application (/join?program=anchor, page-apply.jsx), end to end
   against the real PHP backend: the bad data the old Google Form took cannot
   be sent (a surname typed twice, "@gmail", a ten-digit phone, a dark photo,
   a phone number as a promo code); 18 and over is sent to NGV; the answers
   are normalised; the agreements land in the ledger with the policy version;
   the same child sent again updates the application; "Apply for another
   child" keeps the family; the policy opens in place; and the phone layout is
   its own (full-screen pickers, a fixed Back / Continue bar).

   Run:  node tests/club-apply.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CA_PORT || '8341';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ca-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
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
const SHOTS = path.join(ROOT, 'tests', 'screens', 'club-apply');
const yearsAgo = (n, md) => (new Date().getFullYear() - n) + '-' + (md || '01-15');

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  club application: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'club_apply_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-CA-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','programmes'=>'ngg','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CEN-CA-2','name'=>'Ayobo','code'=>'AY','color'=>'#3b5bdb','status'=>'active','slug'=>'ayobo','programmes'=>'ngg','createdAt'=>now_iso()]);`
      + `setting_set('fees', ['enabled'=>true,'membershipFee'=>10000,'membershipEveryMonths'=>12,'monthlyDues'=>4000,'trainingFee'=>0,'balanceCap'=>0,'remindEnabled'=>false], 't');`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const errs = [];
    const open = async (w, h, at) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h || 900 } });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      await p.goto(BASE + (at || '/join?program=anchor'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      await p.waitForSelector(at === '/policies' ? '.pol-page' : '.apf', { timeout: 30000 });
      return p;
    };
    // A photo made in the page: grey (passes) or near-black (too dark), 900 × 1200.
    const photo = async (p, lum) => {
      const b64 = await p.evaluate(l => {
        const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const g = c.getContext('2d');
        g.fillStyle = 'rgb(' + l + ',' + l + ',' + l + ')'; g.fillRect(0, 0, 900, 1200);
        g.fillStyle = 'rgb(' + Math.min(255, l + 60) + ',' + Math.min(255, l + 40) + ',' + Math.min(255, l + 30) + ')';
        for (let i = 0; i < 40; i++) g.fillRect((i * 37) % 860, (i * 53) % 1160, 40, 40);
        return c.toDataURL('image/png').split(',')[1];
      }, lum);
      return { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
    };
    const blurField = async (p, sel) => { await p.focus(sel); await p.keyboard.press('Tab'); };
    const pickCombo = async (p, id, text) => { await p.fill('#apf-in-' + id, text); await p.keyboard.press('Enter'); };
    const cont = p => p.click('.apf-inlinebar .apf-btn--ink, .apf-bar .apf-btn--ink');

    console.log('desktop (1320): the form, step by step');
    fs.mkdirSync(SHOTS, { recursive: true });
    const P = await open(1320, 1000);
    await P.waitForSelector('#apf-fld-centre [role=radio]', { timeout: 30000 });
    chk('the step list and the ID card preview sit either side of the form', (await P.$$('.apf-steprow')).length === 8 && !!(await P.$('.apf-idprev')) && !(await P.$('.apf-bar')));
    await cont(P);
    chk('Continue with nothing chosen lists what is missing, at the top', /2 things need fixing/.test(await P.innerText('.apf-errsum')));
    await P.click('#apf-fld-filledBy [role=radio]:has-text("parent or guardian")');
    await P.click('#apf-fld-centre [role=radio]:has-text("Egbeda")');
    await cont(P);
    await P.waitForSelector('#apf-in-firstName');
    await P.fill('#apf-in-firstName', 'tolu'); await P.fill('#apf-in-surname', 'TOLU'); await blurField(P, '#apf-in-surname'); await blurField(P, '#apf-in-firstName');
    chk('a surname typed as the first name is caught', /First name and surname are the same/.test(await P.innerText('#apf-fld-firstName')));
    await P.fill('#apf-in-surname', 'adebayo'); await blurField(P, '#apf-in-surname');
    chk('names are title-cased, and the ID card preview prints SURNAME, First', (await P.inputValue('#apf-in-firstName')) === 'Tolu' && (await P.inputValue('#apf-in-surname')) === 'Adebayo'
      && /ADEBAYO, Tolu/.test(await P.innerText('.apf-idprev')) && /ID card: ADEBAYO, Tolu/.test(await P.innerText('#apf-fld-surname')));
    await P.fill('#apf-in-dob', yearsAgo(20)); await blurField(P, '#apf-in-dob');
    chk('18 and over is sent to NGV, by name, not just refused', /Tolu is 20: register for NGV instead/.test(await P.innerText('.apf-ngv')) && /At 18 and over, register for NGV/.test(await P.innerText('#apf-fld-dob')));
    chk('…on Afrovanguard, where NGV registers', (await P.getAttribute('.apf-ngv-btn', 'href')) === 'https://afrovanguard.org.ng/ngv/register');
    await P.fill('#apf-in-dob', yearsAgo(6)); await blurField(P, '#apf-in-dob');
    chk('under 10 says the age the date makes them', /This date makes them [56]\./.test(await P.innerText('#apf-fld-dob')));
    await P.fill('#apf-in-dob', yearsAgo(13)); await blurField(P, '#apf-in-dob');
    chk('a good date of birth shows the age today', /Age 1[23] today/.test(await P.innerText('#apf-fld-dob')) && !(await P.$('.apf-ngv')));
    await P.click('#apf-fld-sex [role=radio]:has-text("Female")');
    await P.screenshot({ path: path.join(SHOTS, 'desktop-applicant.png'), fullPage: true });
    await P.fill('#apf-in-email', ' Tolu.Family@GMAIL '); await blurField(P, '#apf-in-email');
    chk('an email with no dot-domain is refused and the likely fix offered', /Enter a full email address/.test(await P.innerText('#apf-fld-email')) && /Did you mean tolu\.family@gmail\.com\?/.test(await P.innerText('#apf-fld-email')));
    await P.click('#apf-fld-email .apf-help button');
    chk('…“Use it” takes the fix', (await P.inputValue('#apf-in-email')) === 'tolu.family@gmail.com');
    await P.fill('#apf-in-mobile', '+234 803 123 4567'); await blurField(P, '#apf-in-mobile');
    chk('phones are normalised to 0XXXXXXXXXX', (await P.inputValue('#apf-in-mobile')) === '08031234567');
    await cont(P);

    await P.waitForSelector('#apf-in-school');
    await pickCombo(P, 'school', 'Egbeda Sen');
    await pickCombo(P, 'class', 'jss 2');
    chk('the school and class pickers search and pick with the keyboard', (await P.inputValue('#apf-in-school')) === 'Egbeda Senior High School' && (await P.inputValue('#apf-in-class')) === 'JSS 2');
    await cont(P);

    await P.waitForSelector('#apf-in-address');
    await P.fill('#apf-in-address', '12 Ola Street, Egbeda, near the bus stop');
    await pickCombo(P, 'resState', 'Lagos'); await pickCombo(P, 'resLga', 'Alim');
    chk('the LGA list is the state’s own', (await P.inputValue('#apf-in-resLga')) === 'Alimosho');
    await pickCombo(P, 'resState', 'Ogun');
    chk('changing the state clears the LGA', (await P.inputValue('#apf-in-resLga')) === '');
    await pickCombo(P, 'resState', 'Lagos'); await pickCombo(P, 'resLga', 'Alimosho');
    await pickCombo(P, 'originState', 'Ogun');
    chk('nationality starts as Nigerian', (await P.inputValue('#apf-in-nationality')) === 'Nigerian');
    await cont(P);

    await P.waitForSelector('#apf-in-parent1Name');
    await P.click('#apf-fld-parent1Rel [role=radio]:has-text("Mother")');
    await P.fill('#apf-in-parent1Name', 'mrs adunni adebayo'); await blurField(P, '#apf-in-parent1Name');
    await P.fill('#apf-in-parent1Phone', '8031234567'); await blurField(P, '#apf-in-parent1Phone');
    chk('a ten-digit number missing its 0 is mended', (await P.inputValue('#apf-in-parent1Phone')) === '08031234567');
    await cont(P);
    chk('the second parent is asked for unless the family says there is none', /Second parent or guardian/.test(await P.innerText('.apf-card')) && !!(await P.$('#apf-fld-parent2Name .apf-err')));
    await P.click('#apf-fld-parent2None [role=switch]');
    chk('…“no second parent” hides those fields', !(await P.$('#apf-in-parent2Name')));
    await cont(P);

    await P.waitForSelector('.apf-courses');
    await P.click('.apf-course:has-text("Robotics")');
    await P.fill('#apf-in-vision', 'Yes');
    await blurField(P, '#apf-in-vision');
    chk('"Yes" is not a vision', /Write at least 40 characters/.test(await P.innerText('#apf-fld-vision')) && /more characters/.test(await P.innerText('#apf-fld-vision .apf-meter')));
    await P.fill('#apf-in-vision', '');
    await P.click('.apf-starters button:has-text("I want to become")');
    await P.waitForFunction(() => document.activeElement && document.activeElement.id === 'apf-in-vision', null, { timeout: 3000 });
    await P.type('#apf-in-vision', 'an engineer who builds robots that clean our streets.');
    chk('a starter puts the words in, and the meter turns to “Great”', /^I want to become an engineer/.test(await P.inputValue('#apf-in-vision')) && /Great · \d+ characters/.test(await P.innerText('#apf-fld-vision .apf-meter')));
    await P.click('#apf-fld-hobbies .apf-chip:has-text("Chess")');
    await P.fill('.apf-addown input', 'baking'); await P.keyboard.press('Enter');
    chk('an own hobby becomes a title-cased chip', !!(await P.$('#apf-fld-hobbies .apf-chip.is-on:has-text("Baking")')));
    for (const a of ['Education', 'Health', 'Sport']) await P.click('#apf-fld-influenceAreas .apf-chip:has-text("' + a + '")');
    chk('areas of influence stop at three', await P.$eval('#apf-fld-influenceAreas .apf-chip:has-text("Media")', b => b.disabled));
    await cont(P);

    await P.waitForSelector('#apf-fld-agree');
    chk('the fees are said before anybody applies, from the server’s own terms', /₦10,000 membership fee/.test(await P.innerText('.apf-info')) && /Nothing to pay today/.test(await P.innerText('.apf-info')));
    await P.setInputFiles('.apf-photo input[type=file]:not([capture])', await photo(P, 12));
    await P.waitForFunction(() => /Needs another try/.test((document.querySelector('.apf-photo-badge') || {}).innerText || ''), null, { timeout: 10000 });
    chk('a photo too dark to see the face is refused, with the reason', /Too dark/.test(await P.innerText('.apf-photo')));
    await P.setInputFiles('.apf-photo input[type=file]:not([capture])', await photo(P, 150));
    await P.waitForFunction(() => /Meets the rules|Check sharpness/.test((document.querySelector('.apf-photo-badge') || {}).innerText || ''), null, { timeout: 10000 });
    chk('a usable photo is cropped to the card and shown in the preview', !!(await P.$('.apf-idprev-ph img')));
    await P.click('.apf-agree-row:has-text("Photos, videos and website") .apf-agree-read');
    await P.waitForSelector('.apf-pol');
    chk('the policy opens in place, as a drawer, at its own section', /Photos and videos/.test(await P.innerText('.apf-pol-h')) && /This consent is a condition of membership/.test(await P.innerText('.apf-pol-body')));
    await P.click('.apf-pol-f .apf-btn--ink');
    chk('…“I agree” there ticks that agreement', (await P.getAttribute('.apf-agree-row:has-text("Photos, videos and website") [role=checkbox]', 'aria-checked')) === 'true' && !(await P.$('.apf-pol')));
    await P.click('button:has-text("Agree to all")');
    await P.screenshot({ path: path.join(SHOTS, 'desktop-finish.png'), fullPage: true });
    chk('Agree to all ticks the rest', /All agreed/.test(await P.innerText('.apf-agree-h')));
    await P.fill('#apf-in-promoCode', '0704 653 6485 NEXTGENREG'); await blurField(P, '#apf-in-promoCode');
    chk('a phone number in the promo code is refused', /4 to 20 letters or numbers/.test(await P.innerText('#apf-fld-promoCode')));
    await P.fill('#apf-in-promoCode', 'nextgen26'); await blurField(P, '#apf-in-promoCode');
    await pickCombo(P, 'heardFrom', 'WhatsApp');
    await cont(P);

    await P.waitForSelector('.apf-review');
    await P.screenshot({ path: path.join(SHOTS, 'desktop-review.png'), fullPage: true });
    const rev = await P.innerText('.apf-review');
    chk('the review shows every section with an Edit', (await P.$$('.apf-rev')).length === 7 && /Tolu Adebayo/.test(rev) && /JSS 2/.test(rev) && /Alimosho, Lagos/.test(rev) && /All agreed \(v2026\.10\)/.test(rev) && /NEXTGEN26/.test(rev));
    await cont(P);
    await P.waitForSelector('.apf-done', { timeout: 30000 });
    chk('sent: a reference, the copy’s address and three next steps', /Application sent for Tolu/.test(await P.innerText('.apf-done')) && /NGG-/.test(await P.innerText('.apf-done')) && (await P.$$('.apf-next li')).length === 3);
    const row = JSON.parse(php(`echo json_encode(db_row("SELECT * FROM applications WHERE email = 'tolu.family@gmail.com'"));`));
    const det = JSON.parse(row.details || '{}');
    chk('the application keeps every answer, normalised', row.program === 'anchor' && row.track === 'Robotics' && row.phone && det.school === 'Egbeda Senior High School' && det.class === 'JSS 2'
      && det.parent1Name === 'Mrs Adunni Adebayo' && det.parent1Phone === '08031234567' && det.hobbies.includes('Baking') && det.promoCode === 'NEXTGEN26' && det.filledBy === 'parent' && row.photoUrl);
    chk('the agreements are in the ledger, version 2026.10', php(`echo db_row("SELECT COUNT(*) c FROM consents WHERE studentId = ? AND policyVersion = '2026.10' AND status = 'granted'", ['APP:' . '${row.ref}'])['c'];`) === '6');
    chk('the saved draft is cleared on send', await P.evaluate(() => localStorage.getItem('ngg-apply') === null));

    await P.click('button:has-text("Apply for another child")');
    await P.waitForSelector('#apf-in-firstName');
    chk('Apply for another child keeps the family and starts at the applicant', (await P.inputValue('#apf-in-firstName')) === '' && (await P.inputValue('#apf-in-email')) === 'tolu.family@gmail.com'
      && /Step 2|You’re here/.test(await P.innerText('.apf-steprow.is-cur')));
    await P.context().close();

    console.log('the same child again');
    const S = await open(1100, 900);
    await S.evaluate(v => localStorage.setItem('ngg-apply', JSON.stringify({ step: 7, v })), Object.assign({ filledBy: 'parent', centre: 'Egbeda', firstName: 'Tolu', middleName: '', surname: 'Adebayo', dob: det && row.dob, sex: 'Female',
      email: 'tolu.family@gmail.com', mobile: '08031234567', school: 'Egbeda Senior High School', class: 'JSS 3', classArm: '', address: '12 Ola Street, Egbeda', resState: 'Lagos', resLga: 'Alimosho',
      originState: 'Ogun', originLga: '', nationality: 'Nigerian', parent1Rel: 'Mother', parent1Name: 'Adunni Adebayo', parent1Phone: '08031234567', parent2None: true, course: 'Robotics',
      vision: 'I want to become an engineer who builds robots that clean our streets.', hobbies: ['Chess'], influenceAreas: ['Education'], photoUrl: row.photoUrl, heardFrom: 'WhatsApp',
      cParticipation: true, cMedical: true, cData: true, cComms: true, cMedia: true }));
    await S.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(S);
    await S.waitForSelector('.apf-review', { timeout: 30000 });
    chk('a reload resumes at the same step with the same answers', /JSS 3/.test(await S.innerText('.apf-review')) && /Saved on this device/.test(await S.innerText('.apf-head')));
    await cont(S);
    await S.waitForSelector('.apf-done', { timeout: 30000 }).catch(async e => { console.error('    page said: ' + (await S.innerText('.apf-card').catch(() => '')).slice(0, 300)); throw e; });
    chk('the same child sent again updates the application, and says so', /Application updated/.test(await S.innerText('.apf-done')) && /updated it with these answers/.test(await S.innerText('.apf-done'))
      && php(`echo db_row("SELECT COUNT(*) c FROM applications WHERE email = 'tolu.family@gmail.com'")['c'];`) === '1'
      && JSON.parse(php(`echo db_row("SELECT details FROM applications WHERE email = 'tolu.family@gmail.com'")['details'];`)).class === 'JSS 3');
    await S.context().close();

    console.log('/policies');
    const Q = await open(1200, 900, '/policies');
    await Q.waitForSelector('.pol-doc', { timeout: 30000 });
    chk('/policies is a page of its own, with a contents list and every section', (await Q.$$('.pol-toc a')).length === 11 && (await Q.$$('.pol-sec')).length === 11 && /Version 2026\.10/.test(await Q.innerText('.pol-doc-h')));
    await Q.context().close();

    console.log('phone (390)');
    const M = await open(390, 844);
    await M.waitForSelector('#apf-fld-centre [role=radio]', { timeout: 30000 });
    await M.screenshot({ path: path.join(SHOTS, 'phone-start.png') });
    chk('on a phone: the top progress bar and a fixed Back / Continue bar, no step list', !!(await M.$('.apf-topsteps')) && !!(await M.$('.apf-bar')) && !(await M.$('.apf-steprow')));
    await M.click('#apf-fld-filledBy [role=radio] >> nth=0'); await M.click('#apf-fld-centre [role=radio] >> nth=0');
    await cont(M);
    await M.waitForSelector('#apf-in-firstName');
    await cont(M); // to show errors, then go on with a valid draft for the School step
    await M.evaluate(() => { const s = JSON.parse(localStorage.getItem('ngg-apply')); s.step = 2; localStorage.setItem('ngg-apply', JSON.stringify(s)); });
    await M.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(M);
    await M.waitForSelector('#apf-in-school', { timeout: 30000 });
    await M.click('#apf-in-school');
    await M.waitForSelector('.apf-sheet', { timeout: 5000 });
    await M.screenshot({ path: path.join(SHOTS, 'phone-picker.png') });
    chk('a picker opens as a full-screen sheet with its search focused', await M.evaluate(() => document.activeElement && document.activeElement.closest('.apf-sheet') !== null));
    await M.keyboard.type('Ayobo Sen');
    await M.click('.apf-sheet .apf-lb-o >> nth=0');
    chk('…and a tap picks', (await M.inputValue('#apf-in-school')) === 'Ayobo Senior High School' && !(await M.$('.apf-sheet')));
    chk('nothing scrolls sideways on a phone', await M.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await M.context().close();

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (club application)`);
    process.exit(failed ? 1 : 0);
  }
})();
