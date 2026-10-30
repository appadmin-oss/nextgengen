#!/usr/bin/env node
/* ============================================================================
   Money › Conduct & fines, end to end: real PHP server, real session, the
   rebuilt screen (src/modules/control/cr-tab-conduct.jsx).

   It replaced the v1 `SummerPolicy` screen, and every promise ui-smoke.js held
   that screen to is held here instead, against the new one:

     · the calendar says whether today is a programme day, offers the window
       and the weekday picker with Mon–Fri on, lists the cancelled and added
       dates, and turning a weekday off is what gets saved;
     · the compliance board lists people worst-first with their fines; a
       record opens with what it is based on and the consequences, shows a
       voided entry as voided, and offers the manual ID-card logs;
     · the thresholds for each population are editable and saved.

   And what the rebuild added:

     · the fine rules are on the screen that uploads fines, and editable there
       (a cap below the standard amount is refused on the form);
     · a voided entry is voided from the record, with its reason;
     · each view is offered only to whoever holds what its server ops gate
       on — a club admin (people, no summer, no fees) sees the board alone;
     · the Summer workspace's old "Programme & policy" panel points here.

   Run:  node tests/conduct-tab.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CONDUCT_PORT || '8284';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-conduct-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'conduct');

let _seq = 0;
function php(snippet, extra = ['bootstrap']) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
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

async function pageFor(memberId, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), true);`, ['session']);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
  await ctx.addCookies([
    { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
    { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
  ]);
  return ctx.newPage();
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  conduct tab: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'conduct_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  const errs = [];
  try {
    const mk = (id, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'X ${id}','email'=>strtolower('${id}').'@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','createdAt'=>now_iso(),'updatedAt'=>now_iso()], ${extra}));`;
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-CT-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);`
      + mk('NGG-CT-ADM', "['role'=>'super_admin','fullName'=>'Conduct Admin']")
      + mk('NGG-CT-CLUB', "['role'=>'club_admin','fullName'=>'Club Lead']")
      + mk('NGG-CT-1', "['fullName'=>'Musa Lateef']")
      + mk('NGG-CT-2', "['fullName'=>'Grace Obi']")
      + `$t = attendance_today(); $y = gmdate('Y-m-d', strtotime($t . ' -1 day')); $y2 = gmdate('Y-m-d', strtotime($t . ' -2 day'));`
      + `programme_settings_save(['enabled'=>true,'startDate'=>gmdate('Y-m-d', strtotime($t . ' -30 day')),'endDate'=>gmdate('Y-m-d', strtotime($t . ' +60 day')),'weekdays'=>[1,2,3,4,5],'holidays'=>[$t],'extraDays'=>[gmdate('Y-m-d', strtotime($t . ' +9 day'))]], 'NGG-CT-ADM');`
      + `policy_settings_save(['enabled'=>true,'member'=>['enabled'=>true]], 'NGG-CT-ADM');`
      + `foreach ([['NGG-CT-1','idcard_lost',$y], ['NGG-CT-1','idcard_missing',$y2], ['NGG-CT-2','idcard_lost',$y2]] as [$id,$k,$d]) backend_dispatch('admin.policy.infraction', ['requesterId'=>'NGG-CT-ADM','personId'=>$id,'personType'=>'member','kind'=>$k,'date'=>$d,'note'=>'logged by the test']);`
      + `cp_rules_seed();`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });

    const P = await pageFor('NGG-CT-ADM');
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (fn, arg, ms) => P.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const text = () => P.evaluate(() => document.body.innerText);
    const view = async name => { await P.click(`[role="radiogroup"][aria-label="Conduct view"] >> text="${name}"`).catch(() => P.click(`button:has-text("${name}")`)); };

    // ── Fines: the rules live beside the upload ──
    await P.goto(BASE + '/control/money/conduct', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('Fines opens with the upload and the rules on one screen', await until(() => /Upload a fines register/.test(document.body.innerText) && /Fine rules/.test(document.body.innerText) && /Late attendance/.test(document.body.innerText), null, 60000));
    chk('…and the four views, for a super admin', (await P.locator('[aria-label="Conduct view"] button').allInnerTexts()).join(',') === 'Fines,Compliance,Policy,Calendars');
    await P.screenshot({ path: path.join(SHOTS, 'fines.png'), fullPage: true });
    await P.click('tr:has-text("Late attendance")');
    await P.waitForSelector('[role="dialog"]');
    const dlg = '[role="dialog"]';
    await P.fill(dlg + ' input#crf-amount', '700');
    await P.fill(dlg + ' input#crf-capTerm', '100');
    await P.click(dlg + ' button[type="submit"]');
    chk('a cap below the standard amount is refused on the form', await until(() => /at least the standard amount/.test(document.querySelector('[role="dialog"]')?.innerText || '')));
    await P.fill(dlg + ' input#crf-capTerm', '2100');
    await P.click(dlg + ' button[type="submit"]');
    await until(() => !document.querySelector('[role="dialog"]'));
    const rule = JSON.parse(php(`echo json_encode(db_row("SELECT amount, capTerm FROM conduct_rules WHERE reason = 'late'"));`));
    chk('a rule changed here is the rule the server holds (₦700, ₦2,100 a term), and the card says so',
      +rule.amount === 700 && +rule.capTerm === 2100 && await until(() => /₦700/.test(document.body.innerText) && /₦2,100/.test(document.body.innerText)));
    chk('…and it is audited', +php(`echo db_row("SELECT COUNT(*) c FROM audit_log WHERE event = 'fees.rule.save'")['c'];`) === 1);

    // ── The rule book, as a document ──
    const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 30000 }), P.click('button:has-text("Export the rules (PDF)")')]);
    const pdfPath = path.join(SHOTS, 'rules.pdf');
    await dl.saveAs(pdfPath);
    const pdf = fs.readFileSync(pdfPath);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    chk('“Export the rules” downloads a real PDF (' + pages + ' pages, ' + Math.round(pdf.length / 1024) + ' KB) named for the day', pdf.slice(0, 5).toString() === '%PDF-' && pages >= 2 && /NGG-Conduct-and-Fines-\d{4}-\d{2}-\d{2}\.pdf/.test(dl.suggestedFilename()));

    // ── Compliance: the board and one record ──
    await view('Compliance');
    chk('the compliance board lists everyone with something on record', await until(() => /Everyone with something on record/.test(document.body.innerText) && /Musa Lateef/.test(document.body.innerText) && /Grace Obi/.test(document.body.innerText)));
    let t = await text();
    const order = JSON.parse(php(`echo json_encode(array_map(static fn($r) => $r['fullName'], backend_dispatch('admin.policy.board', ['requesterId' => 'NGG-CT-ADM'])['board']));`));
    chk('…in the server’s order, worst first (' + order.join(', ') + ')', order.length === 2 && t.indexOf(order[0]) < t.indexOf(order[1]));
    chk('…with the URL naming the view', /\/control\/money\/conduct\/compliance$/.test(new URL(P.url()).pathname));
    await P.screenshot({ path: path.join(SHOTS, 'compliance.png'), fullPage: true });
    await P.click('tr:has-text("Musa Lateef")');
    chk('a record opens with what it is based on, and the consequences', await until(() => /What they are based on/.test(document.body.innerText) && /Consequences/.test(document.body.innerText) && /Lost ID card/.test(document.body.innerText)));
    chk('…and offers the manual ID-card logs', /No ID card today/.test(await text()) && /Lost ID card/.test(await text()));
    await P.screenshot({ path: path.join(SHOTS, 'record.png') });
    await P.click('.cr-list-row:has-text("No ID card") button:has-text("Void")');
    await P.waitForSelector(dlg);
    await P.fill(dlg + ' input', 'The card was in the bag all along');
    await P.click(dlg + ' button[type="submit"]');
    chk('voiding an entry asks why, records it, and the reopened record shows it as voided — not hidden',
      await until(() => /Voided — The card was in the bag all along/.test(document.body.innerText))
      && php(`echo db_row("SELECT voidReason FROM infractions WHERE personId = 'NGG-CT-1' AND kind = 'idcard_missing'")['voidReason'] ?? '';`) === 'The card was in the bag all along');
    await P.keyboard.press('Escape');

    // ── Policy: thresholds ──
    await view('Policy');
    chk('the policy names each population’s thresholds', await until(() => /Summer School participants/.test(document.body.innerText) && /Volunteers, mentors and instructors/.test(document.body.innerText) && /NGG members/.test(document.body.innerText)));
    chk('…with a lateness time for each', await P.locator('input[type=time]').count() >= 3);
    const absences = P.locator('#summer-school-participants input[aria-label="Absences allowed"], [id*="participants"] input[aria-label="Absences allowed"]').first();
    await (await absences.count() ? absences : P.locator('input[aria-label="Absences allowed"]').first()).fill('4');
    await P.click('button:has-text("Save changes")');
    await until(() => !document.querySelector('.cr-unsaved'));
    const pol = JSON.parse(php(`echo json_encode(policy_settings());`));
    chk('changing a threshold is what gets saved (participants may miss 4)', +pol.student.absenceLimit === 4 && pol.enabled === true && pol.member.enabled === true);
    await P.screenshot({ path: path.join(SHOTS, 'policy.png'), fullPage: true });

    // ── Calendars ──
    await view('Calendars');
    chk('the calendar says today is not a programme day, and when the next one is', await until(() => /Today is not a Summer day\. Next:/.test(document.body.innerText)));
    const grp = P.locator('[role="group"][aria-label="Meets on"]').first();
    const on = await grp.locator('[aria-checked="true"]').allInnerTexts();
    chk('…offers the window and the weekday picker, Mon–Fri on (' + on.join(',') + ')', await P.locator('input[type=date]').count() >= 4 && on.join(',') === 'Mon,Tue,Wed,Thu,Fri');
    chk('…and lists the cancelled and the added dates', await P.locator('ul[aria-label="Cancelled days"] li').count() >= 1 && await P.locator('ul[aria-label="Extra days"] li').count() >= 1);
    await grp.locator('button:has-text("Fri")').click();
    await P.click('button:has-text("Save changes")');
    await until(() => !document.querySelector('.cr-unsaved'));
    const prog = JSON.parse(php(`echo json_encode(programme_settings());`));
    chk('turning a weekday off is what gets saved — and nothing else moves (the calendar stays on)', prog.weekdays.join(',') === '1,2,3,4' && prog.holidays.length === 1 && prog.extraDays.length === 1 && prog.enabled === true);
    chk('…and the screen still says the calendar is on', await until(() => /Today is (not )?a Summer day/.test(document.body.innerText) && !/No Summer calendar/.test(document.body.innerText)));
    await P.screenshot({ path: path.join(SHOTS, 'calendars.png'), fullPage: true });

    // ── Who sees what ──
    const C = await pageFor('NGG-CT-CLUB');
    C.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await C.goto(BASE + '/control/money/conduct', { waitUntil: 'domcontentloaded' });
    await waitForBoot(C);
    const okC = await C.waitForFunction(() => /Everyone with something on record/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true, () => false);
    const ct = await C.evaluate(() => document.body.innerText);
    chk('a club admin (people, no fees, no summer) is shown the board alone — no rules, no upload, no policy', okC && !/Fine rules/.test(ct) && !/Upload a fines register/.test(ct) && !(await C.$('[aria-label="Conduct view"]')));

    // ── Phone ──
    const M = await pageFor('NGG-CT-ADM', { width: 390, height: 844 });
    M.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await M.goto(BASE + '/control/money/conduct', { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    await M.waitForFunction(() => /Upload a fines register/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
    const over = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk('on a phone the screen fits its width (overflow ' + over + 'px)', over <= 1);
    await M.screenshot({ path: path.join(SHOTS, 'fines-phone.png'), fullPage: true });

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (conduct & fines)');
  process.exit(failed ? 1 : 0);
})();
