#!/usr/bin/env node
/* ============================================================================
   Projects and activities, end to end (domain/projects.php).

   A lead sets a project in the mentor portal (My role → Projects): a mentor
   they lead and three children at their centre, in two groups, finishing in
   five days. The child sees it on Community with their group (first names),
   the countdown and who set it as a title; it is on their Today; they mark
   their part done. The mentor sees it on My role — counted, not "None
   assigned" — and marks theirs. The lead sees every group's tally and
   excuses a part.

   Run:  node tests/projects.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PJ_PORT || '8294';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-pj-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util', 'bootstrap', 'session'].map(f => `require_once ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
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
async function as(memberId, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), false);`);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) pg.errs.push('console: ' + m.text().slice(0, 200)); });
  return pg;
}
const text = async (pg, sel) => (await pg.innerText(sel || 'body')).replace(/\s+/g, ' ');
const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 15000 }).then(() => true, () => false);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  projects: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'projects_e2e_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const today = php(`db_migrate(db_conn());
      $now = now_iso();
      db_insert('centres', ['centreId' => 'C-EGN', 'name' => 'Egbeda', 'code' => 'EGN', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk = function ($id, $name, $x = []) use ($now) { db_insert('members', $x + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@pj.example',
        'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'track' => 'tech', 'joinDate' => '2026-01-10', 'dob' => '2012-04-01', 'createdAt' => $now, 'updatedAt' => $now]); };
      $mentor = function ($mid, $memberId, $name, $x = []) use ($mk, $now) {
        $mk($memberId, $name, ['dob' => '1988-01-01', 'honorific' => $x['honorific'] ?? '']);
        db_insert('mentors', ['mentorId' => $mid, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@pj.example', 'status' => 'active', 'centre' => 'Egbeda',
          'tracks' => 'tech', 'programme' => 'ngg', 'memberId' => $memberId, 'checkedAt' => $now, 'maxMentees' => 8, 'rank' => $x['rank'] ?? 'mentor', 'leadId' => $x['leadId'] ?? '',
          'honorific' => $x['honorific'] ?? '', 'createdAt' => $now]);
        foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId' => $mid, 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
        db_insert('mentor_policy', ['mentorId' => $mid, 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'x', 'acceptedAt' => $now]);
      };
      $mentor('MEN-PJ-L', 'NGG-PJ-L', 'Lara Bello', ['rank' => 'lead', 'honorific' => 'Mrs']);
      $mentor('MEN-PJ-M', 'NGG-PJ-M', 'Tunde Bakare', ['leadId' => 'MEN-PJ-L', 'honorific' => 'Mr']);
      foreach ([1 => 'Mariam Yusuf', 2 => 'Daniel Okafor', 3 => 'Kemi Adewale'] as $i => $n) $mk("NGG-PJ-K$i", $n);
      foreach ([1, 2] as $i) db_insert('mentor_assignments', ['memberId' => "NGG-PJ-K$i", 'mentorId' => 'MEN-PJ-M', 'status' => 'active', 'startedAt' => '2026-07-01']);
      echo mp_today();`);
    const due = new Date(Date.parse(today + 'T12:00:00Z') + 5 * 86400000).toISOString().slice(0, 10);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));
    const openPortal = async pg => {
      await pg.goto(BASE + '/mentor', { waitUntil: 'domcontentloaded' });
      await waitForBoot(pg);
      await pg.waitForSelector('.m15-app', { timeout: 60000 });
      await pg.waitForFunction(() => !document.querySelector('.m15x-load'), null, { timeout: 30000 }).catch(() => {});
    };
    const toProjects = async pg => {
      await pg.click('aside nav >> text=My role');
      await pg.click('main button[aria-current]:has-text("Projects")');
      await pg.waitForSelector('.mpj', { timeout: 20000 });
    };

    console.log('the lead sets a project');
    const L = await as('NGG-PJ-L');
    await openPortal(L);
    await toProjects(L);
    chk('My role has a Projects tab, empty to begin with', /Projects you’re on/.test(await text(L, '.mpj')) && /haven’t set one yet/.test(await text(L, '.mpj')));
    await L.click('.mpj-go:has-text("New project")');
    await L.waitForSelector('.mpj-form');
    const go = L.locator('.mpj-form button[type="submit"]');
    chk('the form will not submit without a name, a finish date and a person', await go.isDisabled());
    await L.fill('.mpj-form input[placeholder^="e.g. Clean-up"]', 'Clean-up day');
    await L.fill('.mpj-form textarea', 'Clear the yard and plant the beds.');
    await L.fill('.mpj-form input[type="date"] >> nth=1', due);
    for (const g of ['Team A', 'Team B']) { await L.fill('.mpj-addg input', g); await L.click('.mpj-addg button'); }
    const who = (await text(L, '.mpj-who'));
    chk('the lead can choose the mentor they lead and every child at the centre, mentees marked', /Tunde Bakare/.test(who) && /Mariam Yusuf/.test(who) && /Kemi Adewale/.test(who) && /Your mentee/.test(who) && !/Lara Bello/.test(who));
    for (const [n, g] of [['Tunde Bakare', 'Team A'], ['Mariam Yusuf', 'Team A'], ['Daniel Okafor', 'Team B'], ['Kemi Adewale', 'Team B']]) {
      await L.click('.mpj-pick label:has-text("' + n + '") input');
      await L.selectOption('select[aria-label="Group for ' + n + '"]', g);
    }
    chk('the count of who is chosen is announced', /4 chosen/.test(await text(L, '.mpj-who legend')));
    await go.click();
    chk('it saves and says who was told', await until(L, () => /Project set · 4 people told/.test(document.body.innerText)));
    await L.waitForSelector('.mpj-card .mpj-group', { timeout: 15000 });
    const led = await text(L, '.mpj');
    chk('“Projects you set” shows both groups with their tallies and the countdown',
      /Clean-up day/.test(led) && /Team A 0 of 2 done/.test(led) && /Team B 0 of 2 done/.test(led) && /5 days left/.test(led));
    chk('the database holds four parts in two groups', q(`db_all("SELECT personId, groupName FROM project_people ORDER BY personId")`).map(r => r.personId + ':' + r.groupName).join(',')
      === 'MEN-PJ-M:Team A,NGG-PJ-K1:Team A,NGG-PJ-K2:Team B,NGG-PJ-K3:Team B');

    console.log('the child sees it');
    const K = await as('NGG-PJ-K1');
    await K.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForBoot(K);
    await K.waitForSelector('.m9-app main', { timeout: 60000 });
    chk('it is on their Today, finishing within a week', await until(K, () => /Clean-up day/.test(document.querySelector('main').innerText) && /5 days left/.test(document.querySelector('main').innerText), null, 20000));
    await K.goto(BASE + '/dashboard/community', { waitUntil: 'domcontentloaded' });
    await waitForBoot(K);
    await K.waitForSelector('#pj-h', { timeout: 60000 });
    const kc = await text(K, 'section[aria-labelledby="pj-h"]');
    chk('Community shows the project, their group and who set it — as a title, not a first name',
      /Your projects/.test(kc) && /Clean-up day/.test(kc) && /Team A · Set by Mrs Bello/.test(kc) && !/Lara/.test(kc));
    chk('…the countdown, the finish day and how much time has gone', /5 days left/.test(kc) && /Finishes/.test(kc) && !!(await K.$('section[aria-labelledby="pj-h"] [role="progressbar"]')));
    chk('…their group: the adult by title, nobody from the other group', /Mr Bakare/.test(kc) && !/Daniel/.test(kc) && !/Kemi/.test(kc) && !/Tunde/.test(kc));
    await K.fill('section[aria-labelledby="pj-h"] textarea', 'Planted three beds');
    await K.click('section[aria-labelledby="pj-h"] button:has-text("Mark my part done")');
    chk('the child marks their part done, with what they did', await until(K, () => /Your part is done/.test(document.body.innerText) && /Planted three beds/.test(document.body.innerText)));
    chk('…and it is saved', q(`db_row("SELECT status, note FROM project_people WHERE personId = 'NGG-PJ-K1'")`).status === 'done');
    chk('the child was told when it was set', !!q(`db_row("SELECT 1 FROM notifications WHERE memberId = 'NGG-PJ-K1' AND title = 'New project: Clean-up day'")`));

    console.log('the mentor on it');
    const M = await as('NGG-PJ-M');
    await openPortal(M);
    await M.click('aside nav >> text=My role');
    await until(M, () => /Support NGGC projects and activities/.test(document.querySelector('main').innerText), null, 20000);
    const role = await text(M, 'main');
    chk('My role counts it: “0 of 1 done · next finishes …”, never a fixed “None assigned”', /0 of 1 done · next finishes/.test(role));
    await M.click('main button[aria-current]:has-text("Projects")');
    await M.waitForSelector('.mpj', { timeout: 20000 });
    const mine = await text(M, '.mpj');
    chk('Projects shows the project they are on, with their group and who in it has finished', /Projects you’re on/.test(mine) && /Clean-up day/.test(mine) && /your group: Team A/.test(mine) && /Mariam Yusuf · Done/.test(mine));
    chk('a pod mentor can set a project too (who for — their own mentees — is checked by the server, PHP suite)', !!(await M.$('.mpj-go:has-text("New project")')));
    await M.click('.mpj-mark button:has-text("Mark my part done")');
    chk('the mentor marks their part done', await until(M, () => /Your part is done/.test(document.querySelector('.mpj').innerText)));
    await M.click('aside nav >> text=My role');
    await M.click('main button[aria-current]:has-text("My role")').catch(() => {});
    chk('…and My role says so', await until(M, () => /1 of 1 done/.test(document.querySelector('main').innerText), null, 20000));
    // A part past its finish date turns the commitment into a to-do, with a way straight to it.
    php(`db_insert('projects', ['projectId' => 'PRJ-LATE', 'title' => 'Book drive', 'detail' => '', 'startOn' => '2026-01-05', 'dueOn' => gmdate('Y-m-d', strtotime(mp_today()) - 2 * 86400), 'centre' => 'Egbeda',
           'status' => 'open', 'createdBy' => 'NGG-PJ-L', 'createdByName' => 'Lara Bello', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
         db_insert('project_people', ['projectId' => 'PRJ-LATE', 'kind' => 'mentor', 'personId' => 'MEN-PJ-M', 'groupName' => '', 'status' => 'assigned', 'note' => '', 'doneAt' => '', 'createdAt' => now_iso()]);`);
    await M.reload({ waitUntil: 'domcontentloaded' });
    await openPortal(M);
    await M.click('aside nav >> text=My role');
    chk('a part past its finish date makes it a to-do on My role', await until(M, () => /1 past the finish date/.test(document.querySelector('main').innerText), null, 20000));
    await M.click('main button:has-text("Open projects")');
    chk('…whose “Open projects” goes straight to Projects, with the late one saying so',
      await until(M, () => !!document.querySelector('.mpj') && /2 days past the finish date/.test(document.querySelector('.mpj').innerText), null, 20000));

    console.log('the lead follows up');
    await L.reload({ waitUntil: 'domcontentloaded' });
    await openPortal(L);
    await toProjects(L);
    await L.waitForSelector('.mpj-group', { timeout: 15000 });
    chk('the lead sees Team A finished', /Team A 2 of 2 done/.test(await text(L, '.mpj')));
    await L.selectOption('select[aria-label="Part for Kemi Adewale"]', 'excused');
    chk('the lead excuses a part, and the tally stops counting it', await until(L, () => /Team B 0 of 1 done/.test(document.querySelector('.mpj').innerText)));

    console.log('an admin sees and runs projects from the Control Room');
    php(`db_insert('members', ['memberId' => 'NGG-PJ-ADM', 'fullName' => 'Ada Admin', 'email' => 'ada.admin@pj.example', 'type' => 'NGG', 'status' => 'active', 'role' => 'super_admin', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);`);
    const tokA = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-PJ-ADM'"), true);`);
    const actx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await actx.addCookies([{ name: 'ngg_sess', value: tokA, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const A = await actx.newPage(); A.errs = [];
    A.on('pageerror', e => A.errs.push(String(e).slice(0, 200)));
    await A.goto(BASE + '/control/mentorship/ms-projects', { waitUntil: 'domcontentloaded' });
    await waitForBoot(A);
    const seen = await until(A, () => /Book drive/.test(document.body.innerText) && /Parts done/.test(document.body.innerText), null, 60000);
    chk('Mentorship › Projects lists the projects leads set in the mentor portal, with the countdown and the figures', seen && /past the finish date/.test(await text(A, 'main')));
    await A.click('.cr-head-acts button:has-text("New project")');
    await A.waitForSelector('#crf-title', { timeout: 20000 });
    await A.fill('#crf-title', 'Open day at the centre');
    await A.fill('#crf-dueOn', due);
    await A.click('[role="checkbox"]:has-text("Tunde Bakare")');
    await A.click('button[role="switch"][aria-label^="Every child at Egbeda"]');
    await A.fill('#crf-groups', 'Red, Blue');
    await A.click('button[type=submit]:has-text("Set the project")');
    await until(A, () => /Project set/.test(document.body.innerText), null, 20000);
    const made = q(`db_all("SELECT pp.kind, pp.personId, pp.groupName FROM project_people pp JOIN projects pr ON pr.projectId = pp.projectId WHERE pr.title = 'Open day at the centre' ORDER BY pp.kind, pp.personId")`);
    const kids = made.filter(x => x.kind === 'member');
    chk('an admin sets a project for a mentor and every child at the centre, shared out across two groups',
      made.length === 4 && made.some(x => x.kind === 'mentor' && x.personId === 'MEN-PJ-M') && kids.length === 3
      && new Set(made.map(x => x.groupName)).size === 2 && made.every(x => ['Red', 'Blue'].includes(x.groupName)));
    chk('…and it is on the list, with its groups', await until(A, () => /Open day at the centre/.test(document.body.innerText) && /Red 0\/\d/.test(document.body.innerText), null, 20000));
    await A.click('main tr:has-text("Open day at the centre")');
    await A.waitForSelector('.cr-sheet-sec:has-text("Mariam Yusuf") button:has-text("Set part")', { timeout: 20000 });
    await A.click('.cr-sheet-sec .cr-list-row:has-text("Mariam Yusuf") button:has-text("Set part")');
    // text-is, not has-text: "Not done yet" contains "done" too.
    await A.waitForSelector('[role="radio"]:text-is("Done")', { timeout: 20000 });
    await A.click('[role="radio"]:text-is("Done")');
    await A.click('button[type=submit]:has-text("Save")');
    chk('…and sets a child’s part from the project’s drawer', await until(A, () => true, null, 500) && (await (async () => { for (let i = 0; i < 40; i++) { const st = q(`(string)(db_row("SELECT pp.status FROM project_people pp JOIN projects pr ON pr.projectId = pp.projectId WHERE pr.title = 'Open day at the centre' AND pp.personId = 'NGG-PJ-K1'")['status'] ?? '')`); if (st === 'done') return true; await A.waitForTimeout(250); } return false; })()));
    chk('no page errors (Control Room)', A.errs.length === 0);
    if (A.errs.length) console.log(A.errs.slice(0, 6));
    chk('no page errors', L.errs.length + K.errs.length + M.errs.length === 0);
    if (L.errs.length + K.errs.length + M.errs.length) console.log(L.errs.concat(K.errs, M.errs).slice(0, 6));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: the suite crashed: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
