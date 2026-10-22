#!/usr/bin/env node
/* ============================================================================
   Member Portal v9, end to end (docs/design/portals/member-portal-v9.dc.html):
   an NGG member at /dashboard gets the v9 portal on their real records, and
   every write lands where staff will read it — the check-in, the mentor
   thread, the relationship check, self-scores, "Who I'm becoming" (on the
   mentor's timeline), a lesson's check, an opportunity bookmark, a request to
   the desk and a safeguarding concern. The Control Room adds an opportunity
   and the member sees it. Classic stays one query string away.

   Run:  node tests/member-v9.test.js     (MP9_SHOTS=dir for screenshots)
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.MP9_PORT || '8317';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-mp9-'));
const DB = path.join(TMP, 'ngg.db');

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=1 -d error_reporting=-1 ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed (' + e.status + '): ' + String(e.stdout || '') + String(e.stderr || '')); }
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
async function as(memberId, admin, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && /Warning: Cannot update|Maximum update depth|is not a function|undefined/.test(m.text())) pg.errs.push('console: ' + m.text().slice(0, 300)); });
  return pg;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  member v9: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'mp9_e2e_secret_portal_x_0123456789abc',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    php(`
      $now = now_iso(); $ago = fn($d) => gmdate('Y-m-d\\TH:i:s\\Z', time() - $d * 86400);
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@mv.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk('NGG-MV-ADM', 'Ade Admin', 'super_admin');
      $mk('NGG-MV-K1', 'Tolu Adebayo', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-14 years -2 months')), 'school' => 'Egbeda High', 'displayId' => '026-014', 'phone' => '08031234567']);
      $mk('NGG-MV-K2', 'Ada Okafor', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-11 years -3 months')), 'school' => 'Egbeda Primary', 'displayId' => '026-015']);
      $mk('NGG-MV-K3', 'Bayo Lowercase', 'member', ['type' => 'ngg', 'track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-15 years'))]);
      $mk('NGG-MV-MEN', 'Ngozi Eke');
      db_insert('mentors', ['mentorId' => 'MEN-MV-1', 'fullName' => 'Ngozi Eke', 'email' => 'ngozi.eke@mv.example', 'status' => 'active', 'centre' => 'Egbeda', 'tracks' => 'Coding',
        'programme' => 'ngg', 'memberId' => 'NGG-MV-MEN', 'checkedAt' => $now, 'maxMentees' => 8, 'createdAt' => $now]);
      foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId' => 'MEN-MV-1', 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
      db_insert('mentor_policy', ['mentorId' => 'MEN-MV-1', 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'x', 'acceptedAt' => $now]);
      $a = backend_dispatch('admin.ms.match.approve', ['requesterId' => 'NGG-MV-ADM', 'memberId' => 'NGG-MV-K1', 'mentorIds' => ['MEN-MV-1']]);
      backend_dispatch('admin.ms.match.choose', ['requesterId' => 'NGG-MV-ADM', 'matchId' => $a['matchId'], 'mentorId' => 'MEN-MV-1', 'chosenBy' => 'mentee']);
      db_exec("UPDATE mentor_matches SET startedAt = ? WHERE memberId = 'NGG-MV-K1'", [gmdate('Y-m-d', time() - 95 * 86400)]);
      db_exec("UPDATE mentor_assignments SET startedAt = ? WHERE memberId = 'NGG-MV-K1'", [$ago(95)]);
      if (!db_row("SELECT 1 FROM mentor_assignments WHERE memberId = 'NGG-MV-K1' AND status = 'active'")) db_insert('mentor_assignments', ['mentorId' => 'MEN-MV-1', 'memberId' => 'NGG-MV-K1', 'status' => 'active', 'startedAt' => $ago(95)]);
      db_insert('mentor_messages', ['threadId' => 'chat:NGG-MV-K1', 'kind' => 'Reply', 'subjectId' => 'NGG-MV-K1', 'fromId' => 'NGG-MV-MEN', 'fromName' => 'Ngozi Eke', 'toId' => 'NGG-MV-K1', 'body' => 'Well done leading the team on Saturday.', 'createdAt' => $ago(1)]);
      $m0 = gmdate('Y-m'); $m1 = gmdate('Y-m', strtotime('first day of last month'));
      db_insert('mentor_scorecards', ['subjectId' => 'NGG-MV-K1', 'month' => $m1, 'scores' => '6,5,6,4,5,6,5,6,7,4', 'total' => 54, 'byKind' => 'mentor', 'mentorId' => 'MEN-MV-1', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]);
      db_insert('mentor_scorecards', ['subjectId' => 'NGG-MV-K1', 'month' => $m0, 'scores' => '7,6,6,4,6,7,6,7,8,5', 'total' => 62, 'byKind' => 'mentor', 'mentorId' => 'MEN-MV-1', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]);
      setting_set('curriculum', ['startDate' => gmdate('Y-m-d', time() - 14 * 86400)]);
      for ($w = 1; $w <= 3; $w++) {
        db_insert('curriculum_units', ['unitId' => "CU-MV-$w", 'course' => 'Coding', 'level' => '', 'week' => $w, 'position' => 1, 'title' => "Web pages, part $w", 'body' => "Pages are built from tags. Week $w.", 'objectives' => '["What a tag is"]', 'status' => 'published', 'version' => 1, 'passMark' => 50, 'createdAt' => $now]);
        db_insert('curriculum_checks', ['checkId' => "CHK-MV000$w", 'unitId' => "CU-MV-$w", 'kind' => 'mcq', 'prompt' => "Which tag makes the biggest heading? ($w)", 'options' => json_encode(['<p>', '<h1>', '<img>']), 'answer' => '1', 'points' => 1, 'position' => 1]);
      }
      setting_set('opportunities', [
        ['oppId' => 'OPP-FIT', 'title' => 'Girls in Tech Saturday bootcamp', 'org' => 'Lagos Tech Hub', 'type' => 'Training', 'closesOn' => gmdate('Y-m-d', time() + 20 * 86400), 'why' => 'You are learning to code', 'ageMin' => 12, 'ageMax' => 17, 'status' => 'active'],
        ['oppId' => 'OPP-OLD', 'title' => 'Internship for school leavers', 'org' => 'A bank', 'type' => 'Internship', 'closesOn' => '', 'why' => '', 'ageMin' => 17, 'ageMax' => 0, 'status' => 'active'],
        ['oppId' => 'OPP-SHUT', 'title' => 'Closed competition', 'org' => 'NGG', 'type' => 'Competition', 'closesOn' => '2020-01-01', 'why' => '', 'ageMin' => 0, 'ageMax' => 0, 'status' => 'active'],
      ]);
      db_insert('notifications', ['notifId' => 'N-MV-1', 'memberId' => 'NGG-MV-K1', 'kind' => 'mentor', 'title' => 'Ngozi replied to you', 'body' => '', 'linkPage' => 'mentor', 'readAt' => '', 'createdAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const q = sql => JSON.parse(php(`echo json_encode(${sql});`));
    const shot = (pg, n) => pg.screenshot({ path: (process.env.MP9_SHOTS || TMP) + '/' + n + '.png' });
    const main = pg => pg.innerText('main');
    const settle = pg => pg.waitForFunction(() => !document.querySelector('.m9x-load'), null, { timeout: 30000 }).catch(() => {});
    const nav = async (pg, area, tab) => { await pg.click('aside nav button:has-text("' + area + '")'); if (tab) await pg.click('main nav button:has-text("' + tab + '")'); await settle(pg); };

    // ── Today ──
    const mb = await as('NGG-MV-K1', false);
    await mb.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mb);
    await mb.waitForSelector('.m9-app main', { timeout: 60000 }).catch(async e => { console.error('DEBUG', mb.errs.join('\n'), (await mb.innerText('body')).slice(0, 800)); throw e; });
    await mb.waitForFunction(() => /Good (morning|afternoon|evening), Tolu/.test(document.body.innerText), null, { timeout: 30000 });
    const today = await main(mb);
    chk('Today: the banner shows the level, the XP to the next one, and one next step', await mb.isVisible('.m9x-hero') && /Level \d/.test(today) && /XP to/.test(today) && /Your next step|All caught up/i.test(today));
    chk('Today: the banner sits inside the page column, under the greeting', await mb.evaluate(() => { const h = document.querySelector('.m9x-hero'); return !!h && !!h.closest('main > div'); }));
    chk('/dashboard opens the Member Portal for an NGG member, by name', /Tolu/.test(today));
    chk('Today: account, To do, the mentor’s last message and the Leadership Index from the server', /Account/.test(today) && /To do/i.test(today) && /Well done leading the team/.test(today) && /62 \/ 100/.test(today) && /\+8/.test(today));
    await shot(mb, 'today');
    await mb.click('main [role="radiogroup"][aria-label="How are you doing"] button:has-text("Okay")');
    await mb.waitForTimeout(1200);
    chk('Today: the wellbeing answer is this week’s check-in', q(`db_row("SELECT wellbeing FROM member_checkins WHERE memberId = 'NGG-MV-K1'")['wellbeing'] ?? ''`) === 'Okay');

    // ── My mentor ──
    await nav(mb, 'Mentor');
    await mb.fill('main input[aria-label="Message"]', 'Can we practise my talk on Saturday?');
    await mb.click('main button[aria-label="Send"]');
    await mb.waitForFunction(() => /Can we practise my talk/.test(document.querySelector('main').innerText), null, { timeout: 15000 }).catch(() => {});
    chk('Mentor: a message lands in the mentor thread', q(`(int)db_row("SELECT COUNT(*) c FROM mentor_messages WHERE threadId = 'chat:NGG-MV-K1' AND fromId = 'NGG-MV-K1'")['c']`) >= 1);
    await shot(mb, 'mentor');
    await mb.click('main [role="tab"]:has-text("Sessions")');
    await mb.click('main button[aria-pressed]:has-text("My goal")');
    // A child addresses their mentor by title and surname (staff_public_name), never by first name.
    chk('Mentor: the mentor is “Coach Eke” on the child’s screen, never “Ngozi”', /Coach Eke/.test(await mb.innerText('main')) && !/Ngozi/.test(await mb.innerText('main')));
    await mb.click('main button:has-text("Send to Coach Eke")');
    await mb.waitForTimeout(1200);
    chk('Mentor: “Prepare for Saturday” sends the topics to the mentor', q(`(int)db_row("SELECT COUNT(*) c FROM mentor_messages WHERE threadId = 'chat:NGG-MV-K1' AND body LIKE 'Before Saturday%'")['c']`) === 1);
    await mb.click('main [role="tab"]:has-text("How it")');
    for (const b of await mb.$$('main [role="radiogroup"] button:has-text("Yes")')) await b.click();
    await mb.click('main button:has-text("Send to NGG")');
    await mb.waitForTimeout(1200);
    chk('Mentor: the relationship check is the child’s side, four answers', q(`db_row("SELECT answers FROM mentor_rel_checks WHERE subjectId = 'NGG-MV-K1' AND side = 'child'")['answers'] ?? ''`) === '[5,5,5,5]');

    // ── My growth ──
    await nav(mb, 'Grow');
    await mb.waitForFunction(() => /My Leadership Index/.test(document.querySelector('main').innerText), null, { timeout: 20000 });
    await mb.click('main [role="tab"]:has-text("My view")');
    const growTxt = await main(mb);
    chk('Growth: every row of the scorecard is named (the skills arrive as [name, hint] pairs)', /Communication/.test(growTxt) && /Speaks and listens clearly/.test(growTxt) && /Multiplication/.test(growTxt));
    await mb.click('main button[aria-label^="Raise"]');
    await mb.click('main button:has-text("Save my scores"), main button:has-text("Update my scores")');
    await mb.waitForTimeout(1200);
    chk('Growth: the member’s own scores are saved as their self-score', !!q(`db_row("SELECT scores FROM mentor_scorecards WHERE subjectId = 'NGG-MV-K1' AND byKind = 'member'")`));
    await shot(mb, 'growth');
    // The mentor's Saturday evaluation reaches the member: criteria, strength, next step — never the ratings.
    chk('Growth: before any evaluation, the card says when one will come', await mb.isVisible('.m9x-ev') && /evaluates you after each Saturday/.test(await mb.innerText('.m9x-ev')));
    php(`db_insert('mentor_reviews', ['subjectId' => 'NGG-MV-K1', 'period' => '2026-W42', 'mentorId' => 'NGG-MV-M1', 'answers' => '{}', 'evalJson' => json_encode(['date' => '2026-10-17', 'by' => 'Ngozi', 'strength' => 'Led the huddle calmly', 'next' => 'Hand the assignment in at check-in',
      'criteria' => ['punctuality' => 'Strong', 'assignment' => 'Not yet', 'participation' => 'Demonstrated', 'respect' => 'Strong', 'teamwork' => 'Demonstrated', 'courage' => 'Emerging', 'initiative' => 'Emerging', 'reflection' => 'Demonstrated'], 'staffNote' => 'SECRET-STAFF-NOTE'])]);`);
    // Loaded once a visit, so a fresh visit picks it up.
    await mb.reload({ waitUntil: 'domcontentloaded' }); await waitForBoot(mb); await mb.waitForSelector('.m9-app main', { timeout: 60000 }); await nav(mb, 'Grow');
    await mb.waitForFunction(() => /Led the huddle calmly/.test((document.querySelector('.m9x-ev') || {}).innerText || ''), null, { timeout: 20000 });
    const evT = await mb.innerText('.m9x-ev');
    chk('Growth: the evaluation shows each criterion, the strength and the next step', /Punctuality/.test(evT) && /Strong/.test(evT) && /Hand the assignment in/.test(evT));
    chk('Growth: and never the mentor\'s staff note', !/SECRET-STAFF-NOTE/.test(evT));
    await mb.click('main [role="tab"]:has-text("This week")');
    await mb.fill('main textarea[placeholder^="e.g. builds"], main textarea[placeholder^="e.g. is brave"]', 'builds apps that help my community');
    await mb.fill('main input[aria-label="Step 1"]', 'Finish the loops lesson');
    await mb.click('main article button:has-text("Save")');
    await mb.waitForTimeout(1200);
    const mentee = q(`backend_dispatch('member.mentor.mentee', ['requesterId' => 'NGG-MV-MEN', 'subjectId' => 'NGG-MV-K1'])`);
    if (!mentee.ok) console.error('mentee view:', JSON.stringify(mentee).slice(0, 300));
    chk('Growth: “Who I’m becoming” is saved and shows on the mentor’s timeline', /builds apps that help my community/.test(JSON.stringify(mentee.timeline || [])));
    await mb.click('main [role="tab"]:has-text("Wellness")');
    await mb.fill('main input[aria-label="A line for the record"]', 'Built my first page with a heading today.');
    await mb.click('main button:has-text("Save"):near(input[aria-label="A line for the record"])');
    await mb.waitForTimeout(1200);
    chk('Growth: a line for the record is a journal entry shared with the mentor', q(`(int)db_row("SELECT COUNT(*) c FROM journal WHERE memberId = 'NGG-MV-K1' AND visibility = 'mentor' AND body LIKE 'Built my first page%'")['c']`) === 1);

    // ── Learn: a lesson and its check ──
    await nav(mb, 'Learn');
    await mb.waitForFunction(() => /Web pages, part/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(async e => { console.error('DEBUG', mb.errs && mb.errs.join('\n'), (await mb.innerText('main')).slice(0, 1200)); throw e; });
    await mb.click('main button:has-text("Web pages, part")');
    await mb.waitForSelector('[role="dialog"] button:has-text("I\'ve done")', { timeout: 20000 });
    await mb.click('[role="dialog"] button:has-text("I\'ve done")');
    await mb.click('[role="dialog"] button:has-text("<h1>")');
    await mb.click('[role="dialog"] button:has-text("Check answers")');
    await mb.waitForTimeout(1500);
    chk('Learn: the lesson’s check is marked by the server', q(`(int)db_row("SELECT COUNT(*) c FROM curriculum_progress WHERE memberId = 'NGG-MV-K1' AND attempts >= 1")['c']`) >= 1);
    await shot(mb, 'lesson');
    await mb.keyboard.press('Escape');

    // ── Opportunities ──
    await nav(mb, 'Learn', 'Opportunities');
    await mb.waitForFunction(() => /Girls in Tech/.test(document.querySelector('main').innerText), null, { timeout: 20000 });
    const opp = await main(mb);
    chk('Opportunities: only the open ones that fit a 14-year-old', /Girls in Tech/.test(opp) && !/school leavers/.test(opp) && !/Closed competition/.test(opp));
    await mb.click('main article button[aria-pressed]');
    await mb.waitForTimeout(900);
    chk('Opportunities: Save is the member’s own bookmark', /OPP-FIT/.test(q(`db_row("SELECT stateValue FROM member_state WHERE memberId = 'NGG-MV-K1' AND stateKey = 'mp9.opps'")['stateValue'] ?? ''`)));

    // ── Records: a request to the desk ──
    await nav(mb, 'Account', 'Records');
    await mb.click('main button[aria-pressed]:has-text("Correct my details")');
    await mb.fill('main label:has-text("What needs changing") input', 'My school is now Egbeda Grammar.');
    await mb.click('main button:has-text("Send")');
    await mb.waitForTimeout(1200);
    chk('Records: a request reaches the desk', q(`(int)db_row("SELECT COUNT(*) c FROM member_requests WHERE memberId = 'NGG-MV-K1' AND kind = 'details'")['c']`) === 1);

    // ── Help: a concern ──
    await nav(mb, 'Account', 'Help');
    await mb.click('main button[aria-pressed]:has-text("Someone is bullying me")');
    await mb.fill('main textarea', 'Two older boys keep taking my lunch at the gate.');
    await mb.click('main button:has-text("Send privately")');
    await mb.waitForFunction(() => /Your reference is/.test(document.querySelector('main').innerText), null, { timeout: 20000 }).catch(() => {});
    chk('Help: a concern is a safeguarding case, with its reference on screen', q(`(int)db_row("SELECT COUNT(*) c FROM safeguarding_cases WHERE reporterId = 'NGG-MV-K1'")['c']`) === 1 && /Your reference is \S+/.test(await main(mb)));
    await shot(mb, 'help');

    // ── Me: the gate pass ──
    await nav(mb, 'Account');
    await mb.click('main button:has-text("Show at the gate")');
    await mb.waitForSelector('[role="dialog"] img[alt="Your gate pass QR code"]', { timeout: 20000 }).catch(() => {});
    chk('Me: the gate pass is the member’s real QR', await mb.isVisible('[role="dialog"] img[alt="Your gate pass QR code"]'));
    await mb.keyboard.press('Escape');

    // ── Phone width ──
    const ph = await as('NGG-MV-K1', false, { width: 390, height: 844 });
    await ph.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ph);
    await ph.waitForSelector('.m9-app nav[aria-label="My NGG"]', { timeout: 60000 });
    const fit = await ph.evaluate(() => { const n = document.querySelector('.m9-app nav[aria-label="My NGG"]'); const r = n.getBoundingClientRect();
      const css = [...document.styleSheets].some(sh => { try { return [...sh.cssRules].some(x => /100dvh/.test(x.cssText) && /m9-e375159/.test(x.cssText)); } catch (_) { return false; } });
      return { bottom: Math.round(r.bottom), vh: innerHeight, scroll: document.scrollingElement.scrollHeight, dvh: css }; });
    chk('Phone: the bottom bar sits fully on screen, and nothing pushes the page past it', fit.bottom <= fit.vh && fit.scroll <= fit.vh + 1);
    chk('Phone: the frame is the visible height (dvh), so a browser address bar cannot push the bar off screen', fit.dvh);
    chk('Phone: the bottom tab bar replaces the sidebar', await ph.isVisible('.m9-app nav[aria-label="My NGG"]') && !(await ph.isVisible('.m9-app aside')));
    await shot(ph, 'phone-today');
    chk('no page errors (member)', mb.errs.length === 0 && ph.errs.length === 0);
    if (mb.errs.length || ph.errs.length) console.error(mb.errs.concat(ph.errs).join('\n'));

    // ── Age: an 11-year-old gets the simple view, and can switch it ──
    const kid = await as('NGG-MV-K2', false);
    await kid.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForBoot(kid);
    await kid.waitForSelector('.m9x-kid', { timeout: 60000 }).catch(() => {});
    const kidNav = await kid.innerText('aside nav').catch(() => '');
    chk('Simple view: on by default for an 11-year-old, with big buttons on Today (the journal among them)', await kid.isVisible('.m9x-kid') && (await kid.$$('.m9x-kid-tile')).length === 5 && /My journal/.test(await kid.innerText('.m9x-kid')));
    chk('Simple view: five plainly named areas, no Money or Account in the nav', /My mentor/.test(kidNav) && /Help/.test(kidNav) && /\bMe\b/.test(kidNav) && !/Money|Account/.test(kidNav));
    await kid.click('.m9x-kid-tile:has-text("My lessons")'); await settle(kid);
    chk('Simple view: a big button opens its page, with plain tab names', /My lessons/.test(await kid.innerText('main nav').catch(() => '')));
    await kid.click('aside nav button:has-text("Help")'); await kid.click('main nav button:has-text("My profile")'); await settle(kid);
    chk('Profile: the view switch says which view is on', (await kid.getAttribute('.m9x-view-opt:has-text("Simple")', 'aria-pressed')) === 'true');
    await kid.click('.m9x-view-opt:has-text("Full")');
    await kid.waitForFunction(() => /Account/.test((document.querySelector('aside nav') || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
    await kid.waitForTimeout(400);
    chk('Profile: switching to Full is the member’s own choice, saved', q(`db_row("SELECT stateValue FROM member_state WHERE memberId = 'NGG-MV-K2' AND stateKey = 'mp9.view'")['stateValue'] ?? ''`).replace(/"/g, '') === 'full' && /Account/.test(await kid.innerText('aside nav')));
    chk('Full view by default from 13: a 14-year-old sees no big buttons', !(await mb.isVisible('.m9x-kid')));
    await shot(kid, 'kid-profile');
    chk('no page errors (11-year-old)', kid.errs.length === 0);
    if (kid.errs.length) console.error(kid.errs.join('\n'));

    // ── An account whose type is not spelled exactly "NGG" is still a member ──
    const lc = await as('NGG-MV-K3', false);
    await lc.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' }); await waitForBoot(lc);
    await lc.waitForSelector('.m9-app main', { timeout: 60000 }).catch(() => {});
    chk('Type "ngg" (any case) opens the new portal, as the server counts it', await lc.isVisible('.m9-app main'));

    // ── Classic stays reachable ──
    await mb.goto(BASE + '/dashboard?classic=1', { waitUntil: 'domcontentloaded' });
    await waitForBoot(mb);   // a dev boot is ~60s; a bare 60s selector wait was a coin flip
    await mb.waitForSelector('.page.dashboard', { timeout: 60000 }).catch(() => {});
    chk('?classic=1 still opens the older dashboard, with the site header', await mb.isVisible('.page.dashboard'));

    // ── Control Room: an admin adds an opportunity, the member sees it ──
    const ad = await as('NGG-MV-ADM', true);
    await ad.goto(BASE + '/control/learning/opps', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ad);
    await ad.waitForSelector('button:has-text("Add an opportunity")', { timeout: 60000 });
    await ad.click('button:has-text("Add an opportunity")');
    await ad.fill('[role="dialog"] input >> nth=0', 'Young Speakers competition');
    await ad.click('[role="dialog"] button:has-text("Add")');
    await ad.waitForTimeout(1500);
    chk('Control Room: an opportunity added there is offered to the member', (q(`member_opps(['memberId' => 'NGG-MV-K1'])['items']`) || []).some(o => o.title === 'Young Speakers competition'));
    await shot(ad, 'control-opps');
    chk('no page errors (admin)', ad.errs.length === 0);
    if (ad.errs.length) console.error(ad.errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed (member v9)` : `✅ PASS: ${passed} passed, 0 failed (member v9)`));
  process.exit(failed ? 1 : 0);
})();
