#!/usr/bin/env node
/* ============================================================================
   Editing a volunteer in the Control Room, end to end.

   The editor used to misbehave in four ways (page-admin.jsx, volunteerEditForm):
   it wrote every field back, so the photo the roster row did not carry was
   wiped on every save; it refused a record with only a full name; it refused
   a blank email, so an ID-card volunteer could not be edited at all; and it
   sent a blank programme as Summer School. Each is pinned here, through the
   Control Room's own form, against a real server.

   Run:  node tests/volunteer-edit.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.VE_PORT || '8331';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ve-'));
const DB = path.join(TMP, 'ngg.db');
const OLD = path.join(TMP, 'old-site', 'api', 'storage', 'photos');
const ADMIN = 'NGG-VE-ADM';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=stderr ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed: ' + String(e.stdout || '') + String(e.stderr || '')); }
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
  if (!process.env.PR_KEEP) try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  volunteer edit: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'volunteer_edit_secret_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'cloudinary' => ['cloud_name' => 'from-file', 'api_key' => '12345', 'api_secret' => 'filesecretABCD'],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'C-EG','name'=>'Egbeda','code'=>'EGB','status'=>'active','programmes'=>'ngg','slug'=>'egbeda','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'C-IK','name'=>'Ikeja','code'=>'IKJ','status'=>'active','programmes'=>'ngg','slug'=>'ikeja','createdAt'=>now_iso()]);`
      // An ID-card instructor: a full name only, no email, NGG, with a photo.
      + `db_insert('volunteers', ['volunteerId'=>'VOL-VE-1','fullName'=>'Bola Ade','email'=>'','role'=>'instructor','centre'=>'Egbeda','programme'=>'ngg','status'=>'active','safeguarding'=>'cleared','token'=>'VETOK1','photoUrl'=>'https://res.cloudinary.com/demo/image/upload/bola.jpg','courses'=>'["Coding"]','createdAt'=>now_iso()]);`, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                          { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const errs = [];
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));

    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));
    const row = () => q(`db_row("SELECT fullName, firstName, lastName, email, phone, programme, photoUrl, centre, courses FROM volunteers WHERE volunteerId = 'VOL-VE-1'")`);

    await pg.goto(BASE + '/control/mentors/volunteers', { waitUntil: 'domcontentloaded' });
    await waitForBoot(pg);
    await pg.waitForSelector('button.admin-tab:has-text("Roster")', { timeout: 60000 });
    await pg.click('button.admin-tab:has-text("Roster")');
    await pg.waitForFunction(() => /Bola Ade/.test(document.body.innerText), null, { timeout: 30000 });
    const rowSel = 'tr:has-text("Bola Ade")';
    chk('a volunteer row offers Edit details (the Control Room form) and Photo & portal access', (await pg.$$(rowSel + ' button:has-text("Edit details")')).length === 1 && (await pg.$$(rowSel + ' button:has-text("Photo & portal access")')).length === 1);

    await pg.click(rowSel + ' button:has-text("Edit details")');
    const F = 'form[aria-label="Edit Bola Ade"]';
    await pg.waitForSelector(F, { timeout: 10000 });
    chk('a record with only a full name opens split into first and last name', (await pg.inputValue(F + ' #crf-firstName')) === 'Bola' && (await pg.inputValue(F + ' #crf-lastName')) === 'Ade');
    chk('…its programme is NGG, as on the record (not Summer School)', (await pg.getAttribute(F + ' button.cr-chip:has-text("NGG Club")', 'aria-checked')) === 'true');
    chk('…and a blank email is allowed, with the reason said', (await pg.inputValue(F + ' #crf-email')) === '' && /ID card/.test(await pg.innerText(F)));

    await pg.fill(F + ' #crf-lastName', 'Adeyemi');
    await pg.fill(F + ' #crf-phone', '08031234567');
    await pg.click(F + ' button[type=submit]');
    await pg.waitForSelector(F, { state: 'detached', timeout: 15000 });
    let r = row();
    chk('saving with no email works: the change lands', r.lastName === 'Adeyemi' && r.phone === '08031234567');
    chk('…the full name follows the name parts', r.fullName === 'Bola Adeyemi' && r.firstName === 'Bola');
    chk('…and nothing else was written over: the photo, the programme, the centre and the courses are as they were',
      r.photoUrl === 'https://res.cloudinary.com/demo/image/upload/bola.jpg' && r.programme === 'ngg' && r.centre === 'Egbeda' && r.courses === '["Coding"]' && r.email === '');
    await pg.waitForFunction(() => /Bola Adeyemi/.test(document.body.innerText), null, { timeout: 20000 });
    chk('the roster shows the new name after the save', true);

    const rowSel2 = 'tr:has-text("Bola Adeyemi")';
    await pg.click(rowSel2 + ' button:has-text("Edit details")');
    const F2 = 'form[aria-label="Edit Bola Adeyemi"]';
    await pg.waitForSelector(F2, { timeout: 10000 });
    await pg.fill(F2 + ' #crf-email', 'bola@');
    await pg.click(F2 + ' button[type=submit]');
    await pg.waitForSelector(F2 + ' #crf-email-err', { timeout: 5000 });
    chk('a half-typed email is caught on the field, and the form stays open with what was typed', (await pg.inputValue(F2 + ' #crf-email')) === 'bola@' && row().email === '');
    await pg.fill(F2 + ' #crf-email', 'Bola.Ade@Example.org');
    await pg.click(F2 + ' button.cr-chip:has-text("Both")');
    await pg.selectOption(F2 + ' #crf-centre', 'Ikeja');
    await pg.click(F2 + ' button[type=submit]');
    await pg.waitForSelector(F2, { state: 'detached', timeout: 15000 });
    r = row();
    chk('email, programme and centre save — the email the way sign-in compares it', r.email === 'bola.ade@example.org' && r.programme === 'both' && r.centre === 'Ikeja' && r.photoUrl.endsWith('bola.jpg'));

    await pg.click(rowSel2 + ' button:has-text("Edit details")');
    await pg.waitForSelector(F2, { timeout: 10000 });
    await pg.click(F2 + ' button[type=submit]');
    await pg.waitForFunction(() => /Nothing changed/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    chk('saving with nothing changed sends nothing and says so', /Nothing changed/.test(await pg.innerText('body')));

    await pg.click(rowSel2 + ' button:has-text("Photo & portal access")');
    await pg.waitForSelector('.vol-more', { timeout: 10000 });
    chk('Photo & portal access holds the photo, the profile and delete', (await pg.$$('.vol-more .vol-more-photo')).length === 1 && (await pg.$$('.vol-more button:has-text("Delete volunteer")')).length === 1);
    chk('the old inline editor is gone (one form, the Control Room’s)', (await pg.$$('button:has-text("Save volunteer")')).length === 0);
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (volunteer edit)');
  process.exit(failed ? 1 : 0);
})();
