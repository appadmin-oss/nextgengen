#!/usr/bin/env node
/* ============================================================================
   Assignments, end to end: real PHP server, real sessions, the real screens.

   What must hold:
     · The Control Room's desk opens empty and says how to start; a new
       assignment is drafted from a lesson's own weekly assignment, shows who
       it reaches before it is published, and publishes to that member.
     · The member's portal shows it as due, takes a hand-in, and after it is
       returned with feedback, takes it again and says so.
     · The instructor's portal has the same desk under Progress, scoped to
       their course: it returns the work with feedback.
     · The admin marks it; the mark is the member's, and the bulk Close asks
       first, counts, and closes.

   Run:  node tests/assign-desk.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ASD_PORT || '8297';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-asd-'));
const DB = path.join(TMP, 'ngg.db');

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
const q = sql => JSON.parse(php(`echo json_encode(${sql});`));
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
async function as(memberId, admin, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 200)));
  return pg;
}
const confirm = async (pg, cta) => { await pg.waitForSelector('[role=dialog] button:has-text("' + cta + '")', { timeout: 10000 }); await pg.click('[role=dialog] button:has-text("' + cta + '")'); };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  assignments desk: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'asd_e2e_secret_desk_x_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`
      $now = now_iso();
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@asd.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk('NGG-AD-ADM', 'Ade Admin', 'super_admin');
      $mk('NGG-AD-INS', 'Tunde Teacher');
      db_insert('volunteers', ['volunteerId' => 'VOL-AD-1', 'fullName' => 'Tunde Teacher', 'email' => 'tunde.teacher@asd.example', 'role' => 'instructor', 'courses' => '["Piano"]', 'centre' => 'Egbeda',
        'status' => 'active', 'programme' => 'ngg', 'safeguarding' => 'cleared', 'memberId' => 'NGG-AD-INS', 'createdAt' => $now]);
      $mk('NGG-AD-M1', 'Zara Ibrahim', 'member', ['track' => 'Piano']);
      $mk('NGG-AD-M2', 'Kelechi Ike', 'member', ['track' => 'Coding']);
      db_insert('curriculum_units', ['unitId' => 'CU-AD-1', 'course' => 'Piano', 'level' => 'Year 1 · Foundation', 'week' => 2, 'position' => 1, 'title' => 'Building scales on C', 'status' => 'published', 'version' => 1,
        'objectives' => json_encode(['You will play C major one octave']), 'body' => "## Learn\\n\\nTones and semitones.\\n\\n## This week's assignment\\n\\nConstruct and play the major scales on D, G and F.\\n\\n> Practise slowly.", 'createdAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});

    /* ── The Control Room ── */
    const ap = await as('NGG-AD-ADM', true);
    await ap.goto(BASE + '/control/learning/assignments', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForSelector('.asd .asd-state', { timeout: 60000 }).catch(async e => { console.error('DEBUG', ap.errs.join('\n'), (await ap.innerText('body')).slice(0, 800)); throw e; });
    await ap.waitForFunction(() => !/Loading assignments/.test(document.querySelector('.asd').innerText), null, { timeout: 20000 });
    chk('the desk opens empty and says how to start', /No assignments yet/.test(await ap.innerText('.asd')));
    await ap.click('.asd-head button:has-text("New assignment")');
    await ap.waitForSelector('.asd-edit');
    await ap.selectOption('.asd-edit select >> nth=0', 'Piano');
    await ap.waitForFunction(() => /Reaches 1 member/.test(document.querySelector('.asd-aud')?.innerText || ''), null, { timeout: 15000 });
    chk('before it is published, the editor says who it reaches (the Piano member, not the Coding one)', /Zara Ibrahim/.test(await ap.innerText('.asd-aud')) && !/Kelechi/.test(await ap.innerText('.asd-aud')));
    await ap.selectOption('.asd-edit select[aria-label="Lesson"]', 'CU-AD-1');
    await ap.click('button:has-text("Draft from the lesson")');
    await ap.waitForFunction(() => /scales on D, G and F/.test(document.querySelector('.asd-edit textarea')?.value || ''), null, { timeout: 15000 });
    const title = await ap.$eval('.asd-edit input.asd-input', el => el.value);
    chk('drafting from the lesson lifts its own weekly assignment, objectives included, with no AI', /^Week 2: /.test(title)
      && /play C major one octave/.test(await ap.$eval('.asd-edit textarea', el => el.value)));
    chk('…and suggests the hand-in a Piano lesson calls for: a recording', await ap.$eval('.asd-kind[aria-checked="true"]', el => /recording/i.test(el.innerText)));
    // This class hands it in as writing, with two success criteria to tick.
    await ap.click('.asd-kind:has-text("Writing")');
    await ap.fill('.asd-edit textarea[placeholder^="Totals"]', 'All three scales written out\nFingering marked');
    // Publishing with no instructions is refused field by field.
    await ap.fill('.asd-edit textarea', '');
    await ap.click('.asd-foot button:has-text("Publish")');
    await ap.waitForSelector('#asd-e-instructions', { timeout: 10000 });
    chk('publishing without instructions is refused at the field, and nothing is written', /Say what to do/.test(await ap.innerText('#asd-e-instructions')) && q(`(int)db_row("SELECT COUNT(*) c FROM assignments")['c']`) === 0);
    await ap.click('button:has-text("Draft from the lesson")');
    await ap.waitForFunction(() => /scales on D, G and F/.test(document.querySelector('.asd-edit textarea')?.value || ''), null, { timeout: 15000 });
    await ap.click('.asd-kind:has-text("Writing")');
    await ap.fill('.asd-edit textarea[placeholder^="Totals"]', 'All three scales written out\nFingering marked');
    await ap.click('.asd-foot button:has-text("Publish")');
    await ap.waitForSelector('.asd-marks', { timeout: 15000 }).catch(() => ap.waitForSelector('.asd-list', { timeout: 15000 }));
    const A = q(`db_row("SELECT * FROM assignments LIMIT 1")`);
    chk('it publishes: the lesson link, its course and week, a due date (next Saturday), the kind and the steps', A && A.status === 'published' && A.unitId === 'CU-AD-1' && A.track === 'Piano' && +A.week === 2 && /^\d{4}-\d{2}-\d{2}/.test(A.dueAt)
      && A.proof === 'text' && JSON.parse(A.steps || '[]').length === 2);
    chk('…and the member it is for is told', q(`(int)db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'NGG-AD-M1'")['c']`) >= 1
      && q(`(int)db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'NGG-AD-M2'")['c']`) === 0);

    /* ── The member ── */
    const mp = await as('NGG-AD-M1', false, { width: 420, height: 900 });
    await mp.goto(BASE + '/member/learn', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForFunction(() => /Week 2: Construct/.test(document.body.innerText), null, { timeout: 60000 }).catch(async e => { console.error('DEBUG', mp.errs.join('\n'), (await mp.innerText('body')).slice(0, 1500)); throw e; });
    chk('the member sees it with when it is due', /Due (in \d+ days|today|tomorrow)/.test(await mp.innerText('body')));
    // The hand-in panel: the kind, the steps to tick, and the answer.
    await mp.click('main button:has-text("Week 2: Construct")').catch(() => mp.click('text=Week 2: Construct'));
    await mp.waitForSelector('.ahi[role="dialog"]', { timeout: 15000 });
    const panel = await mp.innerText('.ahi');
    chk('the hand-in panel says how to hand it in and lists the steps to tick', /Hand in: Writing/.test(panel) && /All three scales written out/.test(panel) && /Fingering marked/.test(panel));
    await mp.fill('.ahi textarea', 'I played D major with F# and C#, then G and F. F is hardest.');
    chk('Hand in waits for the steps to be ticked', await mp.$eval('.ahi-foot .is-go', b => b.disabled) && /Tick every step/.test(await mp.innerText('.ahi-need')));
    await mp.click('.ahi-step >> nth=0'); await mp.click('.ahi-step >> nth=1');
    await mp.click('.ahi-foot .is-go');
    await mp.waitForSelector('.ahi', { state: 'detached', timeout: 15000 });
    const S1 = q(`db_row("SELECT status, stepsJson FROM assignment_submissions LIMIT 1")`);
    chk('the member hands it in through the panel, with both steps ticked', S1 && S1.status === 'submitted' && S1.stepsJson === '[0,1]');
    chk('a member it is not for cannot hand it in by id', php(`echo assignment_submit(['memberId' => 'NGG-AD-M2', 'assignmentId' => '${A.assignmentId}', 'text' => 'not mine at all here'])['error'] ?? '';`) === 'not_for_you');

    /* ── The instructor: the same desk under Progress ── */
    const ip = await as('NGG-AD-INS', false);
    await ip.goto(BASE + '/instructor', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ip);
    await ip.waitForSelector('.i6-app', { timeout: 60000 });
    await ip.click('nav >> text=Progress');
    await ip.click('main >> text=Assignments').catch(() => ip.click('text=Assignments'));
    await ip.waitForSelector('.ip6-asd .asd-list', { timeout: 30000 }).catch(async e => { console.error('DEBUG', ip.errs.join('\n'), (await ip.innerText('main')).slice(0, 1000)); throw e; });
    chk('the instructor portal has the desk, with the Piano assignment and 1 to mark', /Week 2: Construct/.test(await ip.innerText('.ip6-asd')) && /1 to mark/.test(await ip.innerText('.ip6-asd')));
    await ip.click('.ip6-asd .asd-link');
    await ip.waitForSelector('.asd-subhead', { timeout: 15000 });
    chk('the hand-ins say who handed in and that nobody is missing', /1<\/b>|1 handed in/.test(await ip.innerText('.asd-sum')) && !(await ip.$('.asd-missing')));
    await ip.click('.asd-subhead');
    await ip.click('.asd-markbox button:has-text("Return for changes")');
    chk('returning needs feedback first', /Say what to change/.test(await ip.innerText('.asd-markbox')));
    await ip.fill('.asd-markbox textarea', 'Good start. Add the fingering for F major.');
    await ip.click('.asd-markbox button:has-text("Return for changes")');
    await ip.waitForFunction(() => /Returned/.test(document.querySelector('.asd-subs')?.innerText || ''), null, { timeout: 15000 });
    chk('the instructor returns it with feedback', q(`db_row("SELECT status, feedback FROM assignment_submissions LIMIT 1")`).status === 'returned');

    /* ── Back to the member: returned, with the feedback; hand in again ── */
    await mp.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(mp);
    await mp.waitForFunction(() => /Returned/.test(document.body.innerText), null, { timeout: 60000 });
    chk('the member sees it was returned, to hand in again', /Returned — change it and hand in again/.test(await mp.innerText('body')));
    const sub2 = await mp.evaluate(id => NGGApi.member.submitAssignment({ assignmentId: id, text: 'F major: thumb turns under after finger 4. Played it 5 days.', steps: [0, 1] }), A.assignmentId);
    chk('…and hands it in again', sub2 && q(`db_row("SELECT status FROM assignment_submissions LIMIT 1")['status']`) === 'submitted');

    /* ── The admin marks it ── */
    await ap.goto(BASE + '/control/learning/assignments', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForSelector('.asd-list', { timeout: 60000 });
    await ap.click('.asd-link');
    await ap.waitForSelector('.asd-subhead', { timeout: 15000 });
    await ap.click('.asd-subhead');
    await ap.fill('.asd-markbox input[type=number]', '99');
    await ap.click('.asd-markbox button:has-text("Save mark")');
    chk('a mark above the points is refused before it is sent', /from 0 to 10/.test(await ap.innerText('.asd-markbox')));
    await ap.fill('.asd-markbox input[type=number]', '8');
    await ap.fill('.asd-markbox textarea', 'Well done — all three scales are right.');
    await ap.click('.asd-markbox button:has-text("Save mark")');
    await ap.waitForFunction(() => /8 \/ 10/.test(document.querySelector('.asd-subs')?.innerText || ''), null, { timeout: 15000 });
    chk('the mark is saved and shown', +q(`db_row("SELECT grade FROM assignment_submissions LIMIT 1")['grade']`) === 8);
    const mark = await mp.evaluate(() => NGGApi.member.assignments().then(r => r.assignments[0]));
    chk('the member sees the mark and the feedback', mark.state === 'marked' && mark.submission.grade === 8 && /all three/.test(mark.submission.feedback) && mark.canSubmit === false);

    /* ── Bulk: close asks first, counts, closes ── */
    await ap.click('.asd-head button:has-text("Assignments")');
    await ap.waitForSelector('.asd-list');
    await ap.check('.asd-row.is-head input[type=checkbox]');
    await ap.waitForSelector('.admin-bulkbar');
    chk('the bulk bar counts the selection', /1 assignment selected/.test(await ap.innerText('.admin-bulkbar')));
    await ap.click('.admin-bulkbar button:has-text("Close")');
    await confirm(ap, 'Close');
    await ap.waitForFunction(() => /Closed/.test(document.querySelector('.asd-list')?.innerText || ''), null, { timeout: 15000 });
    chk('bulk Close closes it', q(`db_row("SELECT status FROM assignments LIMIT 1")['status']`) === 'closed');
    await ap.check('.asd-row.is-head input[type=checkbox]');
    await ap.click('.admin-bulkbar button:has-text("Delete")');
    await confirm(ap, 'Delete');
    await ap.waitForTimeout(1200);
    chk('delete is refused for work that was handed in — the row says why', q(`(int)db_row("SELECT COUNT(*) c FROM assignments")['c']`) === 1);
    /* ── Lessons set their own homework ── */
    php(`setting_set('curriculum', ['startDate' => gmdate('Y-m-d', strtotime(attendance_today() . ' UTC') - 8 * 86400)]);
      db_insert('curriculum_units', ['unitId' => 'CU-AD-2', 'course' => 'Piano', 'level' => 'Year 1 · Foundation', 'week' => 2, 'position' => 2, 'title' => 'Minor scales', 'status' => 'published', 'version' => 1,
        'body' => "## This week's assignment\\n\\nRecord the A minor scale, hands together.", 'createdAt' => now_iso()]); echo 'ok';`);
    await ap.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(ap);
    await ap.waitForSelector('.asd-auto', { timeout: 30000 }).catch(() => {});
    chk('the desk says lessons set their own homework, and the week of the term', /Lessons set their own homework/.test(await ap.innerText('.asd-auto')) && /week 2 of the term/.test(await ap.innerText('.asd-auto')));
    await ap.click('.asd-auto button[role="switch"]');   // off
    await ap.waitForFunction(() => /do not set homework/.test(document.querySelector('.asd-auto')?.innerText || ''), null, { timeout: 15000 });
    await ap.click('.asd-auto button[role="switch"]');   // on again: this week's lessons are set now
    await ap.waitForFunction(() => /set from this week/.test(document.querySelector('.asd-auto')?.innerText || ''), null, { timeout: 15000 }).catch(() => {});
    const auto = q(`db_row("SELECT title, status, createdBy, track FROM assignments WHERE unitId = 'CU-AD-2'")`);
    chk('turning it on sets this week’s lesson homework, published, for the lesson’s course', auto && auto.status === 'published' && auto.createdBy === 'curriculum' && auto.track === 'Piano');
    chk('…once: the lesson that already had an assignment is left alone', +q(`(int)db_row("SELECT COUNT(*) c FROM assignments WHERE unitId = 'CU-AD-1'")['c']`) === 1);
    await ap.waitForSelector('.asd-chip.is-lesson', { timeout: 15000 }).catch(() => {});
    chk('the desk marks it as set by the lesson', /Set by the lesson/i.test(await ap.innerText('.asd-list')));
    await mp.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(mp); await mp.waitForTimeout(2500);
    chk('the Piano member sees the lesson’s homework', (q(`assignment_list_for_member(['memberId' => 'NGG-AD-M1'])['assignments']`) || []).some(x => x.unitId === 'CU-AD-2'));
    if (process.env.ASD_SHOTS) { await ap.screenshot({ path: process.env.ASD_SHOTS + '/desk.png', fullPage: true }); await ip.screenshot({ path: process.env.ASD_SHOTS + '/instructor.png', fullPage: true }); }
    chk('no page errors on any screen', !ap.errs.length && !ip.errs.length && !mp.errs.length);
    if (ap.errs.length || ip.errs.length || mp.errs.length) console.error(ap.errs, ip.errs, mp.errs);
  } catch (e) {
    failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌' : '✅') + ' assignments desk: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
