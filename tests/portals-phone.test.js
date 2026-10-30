#!/usr/bin/env node
/* ============================================================================
   Every portal, signed in, on live data, held at the width of a phone.

   The owner's report was "the portals are terrible on a mobile", and the two
   responsive suites could not have seen it: responsive.test.js covers the
   public site, and responsive-staff.test.js mounts each surface WITHOUT data
   (its own header says so) — chrome, loading and empty states only. A portal
   is terrible on a phone with its rows in it: a long name, a roster, a chat,
   a week of lessons. So this suite seeds a small but real programme, signs in
   as each of the people who use a portal, and walks every destination the
   portal's own navigation offers, at 360px and 390px.

   What it asserts, per destination, from the shared probe
   (tests/_responsive-probe.js) plus three checks a phone adds:

     1. nothing sits off the side of the screen, unreachable;
     2. every standalone control meets the 44px touch floor;
     3. no text input is under 16px — iOS zooms the page into any field
        smaller than that and does not zoom back out;
     4. nothing the reader needs is under the fixed bottom bar at the end of
        the page (the last content must scroll clear of it);
     5. the destination rendered: no page error, and some text in it.

   The destinations are DISCOVERED from each portal's navigation, not
   listed here — a hand list goes stale the first time a tab is added, and a
   suite that quietly stops covering a tab is worse than none (CLAUDE.md §11).

   Run:  node tests/portals-phone.test.js     (PP_SHOTS=dir for screenshots)
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PROBE, chromiumPath, loadChromium } = require('./_responsive-probe');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PP_PORT || '8341';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-pp-'));
const DB = path.join(TMP, 'ngg.db');
const SHOTS = process.env.PP_SHOTS || '';
const ONLY = (process.env.PP_ONLY || '').split(',').filter(Boolean);
const PHONES = [{ w: 360, h: 800 }, { w: 390, h: 844 }];
const SECRET = 'pp_e2e_secret_portal_phone_0123456789';

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php -d display_errors=1 ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { throw new Error('php failed (' + e.status + '): ' + String(e.stdout || '') + String(e.stderr || '')); }
}

let server, browser, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

/* The checks a phone adds to the shared probe. Evaluated in the page. */
const PHONE = () => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const out = { zoom: [], under: [] };
  document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]), textarea, select').forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden],[aria-hidden="true"]')) return;
    if (parseFloat(cs.fontSize) < 15.5) out.zoom.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' ' + cs.fontSize + ' "' + (el.getAttribute('aria-label') || el.placeholder || el.name || '').slice(0, 24) + '"');
  });
  /* A fixed bar along the bottom, and the last piece of content on the page:
     scrolled to the end, that content must finish above the bar. */
  const bars = Array.from(document.querySelectorAll('body *')).filter(el => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
    const r = el.getBoundingClientRect();
    return r.width > vw * 0.6 && r.height > 30 && r.height < vh * 0.3 && Math.abs(r.bottom - vh) < 2 && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0;
  });
  if (bars.length) {
    const top = Math.min(...bars.map(b => b.getBoundingClientRect().top));
    const sc = document.scrollingElement;
    const scrollers = [sc, ...Array.from(document.querySelectorAll('main, [class*="scroll"], [class*="-main"], [class*="-body"]')).filter(e => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY))];
    /* The site scrolls smoothly, and a smooth scroll set from script has not
       moved when the next line measures — instant, then put back. */
    const prev = scrollers.map(s => s.style.scrollBehavior);
    scrollers.forEach(s => { s.style.scrollBehavior = 'auto'; s.scrollTop = s.scrollHeight; });
    const leaves = Array.from(document.querySelectorAll('main *, [role="main"] *')).filter(el => {
      if (bars.some(b => b.contains(el))) return false;
      if (el.children.length) return false;
      const t = (el.innerText || el.value || '').trim();
      if (!t && el.tagName !== 'BUTTON' && el.tagName !== 'INPUT') return false;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    let last = null;
    for (const el of leaves) { const r = el.getBoundingClientRect(); if (!last || r.bottom > last.r.bottom) last = { el, r }; }
    if (last && last.r.bottom > top + 1 && last.r.top < vh) out.under.push(Math.round(last.r.bottom) + '>' + Math.round(top) + ' "' + (last.el.innerText || '').trim().slice(0, 30) + '"');
    scrollers.forEach((s, i) => { s.scrollTop = 0; s.style.scrollBehavior = prev[i]; });
  }
  return out;
};

async function as(kind, id, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const cookies = [{ name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }];
  if (kind === 'family') cookies.push({ name: 'ngg_sess_family', value: php(`echo session_issue_family(db_row("SELECT * FROM guardians WHERE guardianId = '${id}'"));`), domain: '127.0.0.1', path: '/', httpOnly: true });
  else cookies.push({ name: 'ngg_sess', value: php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${id}'"), ${kind === 'staff' ? 'true' : 'false'});`), domain: '127.0.0.1', path: '/', httpOnly: true });
  await ctx.addCookies(cookies);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 240)));
  return pg;
}

/* The portals and who uses each. `ready` is a selector that exists once the
   portal has drawn; `busy` one that exists while it is still loading. */
const PORTALS = [
  { id: 'member',     who: ['member', 'NGG-PP-K1'],  path: '/dashboard',     ready: '.m9-app main' },
  { id: 'learn',      who: ['member', 'NGG-PP-K1'],  path: '/learn',         ready: 'main' },
  { id: 'community',  who: ['member', 'NGG-PP-K1'],  path: '/community',     ready: 'main' },
  { id: 'mentor',     who: ['member', 'NGG-PP-MEN'], path: '/mentor',        ready: 'main' },
  { id: 'instructor', who: ['member', 'NGG-PP-INS'], path: '/instructor',    ready: '.i6-app' },
  { id: 'family',     who: ['family', 'GDN-PP-1'],   path: '/family',        ready: '.fp3-app' },
  { id: 'club',       who: ['staff', 'NGG-PP-CLUB'], path: '/club-admin',    ready: 'main' },
  { id: 'summer',     who: ['staff', 'NGG-PP-ADM'],  path: '/summer-admin',  ready: 'main' },
].filter(p => !ONLY.length || ONLY.includes(p.id));

const BUSY = '.m9x-load, .m15x-load, [aria-busy="true"], .skeleton, .sk-line';

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  portals on a phone: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => '${SECRET}',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'maps' => ['offline' => true],
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 86400, 'member' => 43200, 'kiosk' => 43200],
    'seed_bundled_curriculum' => false,
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    /* A small programme with the lengths a real one has: a long name, a
       long school, several children, a chat, lessons, a slot, a guardian. */
    php(`
      $now = now_iso(); $ago = fn($d) => gmdate('Y-m-d\\TH:i:s\\Z', time() - $d * 86400);
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@pp.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg,summer', 'slug' => 'egbeda', 'meetDays' => 'Saturdays', 'meetTime' => '9am-2pm', 'createdAt' => $now]);
      $mk('NGG-PP-ADM', 'Ade Admin', 'super_admin');
      $mk('NGG-PP-CLUB', 'Cole Club', 'club_admin');
      $mk('NGG-PP-K1', 'Oluwatoluwalase Adebayo-Williams', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-14 years -2 months')), 'school' => 'Egbeda Community Grammar School, Idimu Road', 'displayId' => '026-014', 'phone' => '08031234567', 'parentEmail' => 'mum@pp.example', 'courses' => '["Coding"]']);
      foreach ([2 => 'Ada Okafor', 3 => 'Chukwuemeka Nwachukwu-Obi', 4 => 'Mariam Yusuf', 5 => 'Samuel Ade'] as $i => $n) $mk("NGG-PP-K$i", $n, 'member', ['track' => 'TECH', 'courses' => '["Coding"]', 'dob' => '2012-03-0' . $i, 'parentEmail' => $i === 2 ? 'mum@pp.example' : '']);
      $mk('NGG-PP-MEN', 'Ngozi Eke');
      db_insert('mentors', ['mentorId' => 'MEN-PP-1', 'fullName' => 'Ngozi Eke', 'email' => 'ngozi.eke@pp.example', 'status' => 'active', 'centre' => 'Egbeda', 'tracks' => 'Coding',
        'programme' => 'ngg', 'memberId' => 'NGG-PP-MEN', 'checkedAt' => $now, 'maxMentees' => 8, 'createdAt' => $now]);
      foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId' => 'MEN-PP-1', 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
      db_insert('mentor_policy', ['mentorId' => 'MEN-PP-1', 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'x', 'acceptedAt' => $now]);
      foreach (['NGG-PP-K1', 'NGG-PP-K3'] as $k) db_insert('mentor_assignments', ['mentorId' => 'MEN-PP-1', 'memberId' => $k, 'status' => 'active', 'startedAt' => $ago(95)]);
      db_insert('mentor_messages', ['threadId' => 'chat:NGG-PP-K1', 'kind' => 'Reply', 'subjectId' => 'NGG-PP-K1', 'fromId' => 'NGG-PP-MEN', 'fromName' => 'Ngozi Eke', 'toId' => 'NGG-PP-K1', 'body' => 'Well done leading the team on Saturday. Next week, try explaining the loop to Ada before you write it.', 'createdAt' => $ago(1)]);
      db_insert('mentor_messages', ['threadId' => 'chat:NGG-PP-K1', 'kind' => 'Note', 'subjectId' => 'NGG-PP-K1', 'fromId' => 'NGG-PP-K1', 'fromName' => 'Oluwatoluwalase Adebayo-Williams', 'toId' => 'NGG-PP-MEN', 'body' => 'Thank you! Can we practise my talk?', 'createdAt' => $ago(0.5)]);
      $m0 = gmdate('Y-m'); $m1 = gmdate('Y-m', strtotime('first day of last month'));
      db_insert('mentor_scorecards', ['subjectId' => 'NGG-PP-K1', 'month' => $m1, 'scores' => '6,5,6,4,5,6,5,6,7,4', 'total' => 54, 'byKind' => 'mentor', 'mentorId' => 'MEN-PP-1', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]);
      db_insert('mentor_scorecards', ['subjectId' => 'NGG-PP-K1', 'month' => $m0, 'scores' => '7,6,6,4,6,7,6,7,8,5', 'total' => 62, 'byKind' => 'mentor', 'mentorId' => 'MEN-PP-1', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]);
      $mk('NGG-PP-INS', 'Tunde Teacher');
      db_insert('volunteers', ['volunteerId' => 'VOL-PP-1', 'fullName' => 'Tunde Teacher', 'email' => 'tunde.teacher@pp.example', 'role' => 'instructor', 'courses' => '["Coding"]', 'centre' => 'Egbeda',
        'status' => 'active', 'programme' => 'ngg', 'safeguarding' => 'cleared', 'memberId' => 'NGG-PP-INS', 'createdAt' => $now]);
      foreach (academy_required_ids('instructor') as $mod) db_insert('academy_passes', ['track' => 'instructor', 'personId' => 'NGG-PP-INS', 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
      setting_set('course_skills', ['Coding' => ['Reads an error message and acts on it', 'Writes a loop that does what they meant', 'Breaks a problem into steps']]);
      setting_set('curriculum', ['startDate' => gmdate('Y-m-d', time() - 14 * 86400)]);
      for ($w = 1; $w <= 4; $w++) {
        db_insert('curriculum_units', ['unitId' => "CU-PP-$w", 'course' => 'Coding', 'level' => '', 'week' => $w, 'position' => 1, 'title' => "Web pages, part $w: tags, attributes and the structure of a document", 'body' => "Pages are built from tags. Week $w.", 'objectives' => '["What a tag is","Why structure matters"]', 'status' => 'published', 'version' => 1, 'passMark' => 50, 'createdAt' => $now]);
        db_insert('curriculum_checks', ['checkId' => "CHK-PP000$w", 'unitId' => "CU-PP-$w", 'kind' => 'mcq', 'prompt' => "Which tag makes the biggest heading? ($w)", 'options' => json_encode(['<p>', '<h1>', '<img>']), 'answer' => '1', 'points' => 1, 'position' => 1]);
      }
      db_insert('timetable_slots', ['slotId' => 'TT-PP-1', 'centreId' => 'C-EG', 'course' => 'Coding', 'weekday' => 6, 'startTime' => '11:00', 'endTime' => '12:30', 'room' => 'Lab 1', 'status' => 'active', 'createdAt' => $now]);
      db_insert('member_checkins', ['memberId' => 'NGG-PP-K3', 'week' => gmdate('o-\\WW'), 'wellbeing' => 'Struggling', 'note' => 'Exams are a lot this term', 'createdAt' => $now]);
      db_insert('applications', ['ref' => 'APP-PP1', 'kind' => 'teen', 'name' => 'Kemi Applicant-Oyelaran', 'age' => 13, 'centre' => 'Egbeda', 'track' => 'Coding', 'program' => 'anchor', 'email' => 'kemi@pp.example', 'status' => 'new', 'photoUrl' => '', 'createdAt' => $now]);
      db_insert('notifications', ['notifId' => 'N-PP-1', 'memberId' => 'NGG-PP-K1', 'kind' => 'mentor', 'title' => 'Ngozi replied to you', 'body' => '', 'linkPage' => 'mentor', 'readAt' => '', 'createdAt' => $now]);
      db_insert('summer_cohorts', ['cohortId' => 'SUM-PP', 'name' => 'Summer 2026', 'year' => 2026, 'status' => 'active', 'startDate' => gmdate('Y-m-d', time() - 7 * 86400), 'endDate' => gmdate('Y-m-d', time() + 30 * 86400), 'createdAt' => $now]);
      foreach ([1 => 'Graduating Kid', 2 => 'Temitope Oluwaseun-Bankole', 3 => 'Ife Ade'] as $i => $n)
        db_insert('summer_students', ['studentId' => "PP-S$i", 'cohortId' => 'SUM-PP', 'token' => "SUMQR-PP$i", 'handle' => "pps$i", 'fullName' => $n, 'age' => 12 + $i, 'centre' => 'Egbeda', 'track' => 'Coding', 'parentEmail' => "p$i@pp.example", 'status' => 'active', 'enrolledAt' => $now, 'updatedAt' => $now]);
      db_insert('guardians', ['guardianId' => 'GDN-PP-1', 'email' => 'mum@pp.example', 'fullName' => 'Funmilayo Adebayo-Williams', 'phone' => '08030000000', 'status' => 'active', 'sessionEpoch' => 1, 'createdAt' => $now, 'updatedAt' => $now]);
      foreach (['NGG-PP-K1', 'NGG-PP-K2'] as $i => $k) db_insert('guardian_wards', ['linkId' => "GW-PP-$i", 'guardianId' => 'GDN-PP-1', 'memberId' => $k, 'relationship' => 'parent', 'status' => 'active', 'via' => 'test', 'createdAt' => $now, 'updatedAt' => $now]);
      $d = (new DateTime('now', new DateTimeZone('Africa/Lagos')))->format('Y-m-d');
      db_insert('attendance', ['cohortId' => '', 'studentId' => 'NGG-PP-K1', 'date' => $d, 'checkInAt' => $d . 'T09:12:00Z', 'checkOutAt' => '', 'status' => 'late', 'lateMinutes' => 12, 'method' => 'test', 'createdAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    browser = await chromium.launch({ executablePath: chromiumPath(fs), args: ['--no-sandbox'] });
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

    const findings = { broken: [], clipped: [], tiny: [], zoom: [], under: [] };
    let visited = 0;

    const settle = async pg => {
      await pg.waitForFunction(b => !document.querySelector(b), BUSY, { timeout: 15000 }).catch(() => {});
      await pg.waitForTimeout(600);
    };
    /* The portal's own navigation: whatever is visible inside a nav or a
       tablist. Keyed by its label so a re-render does not lose our place. */
    const navItems = pg => pg.evaluate(() => {
      const seen = new Set(), out = [];
      document.querySelectorAll('nav button, nav a[href], [role="tablist"] [role="tab"]').forEach(el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden],[aria-hidden="true"]')) return;
        if (r.bottom < 0 || r.top > window.innerHeight * 3) return;
        const label = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        if (!label || /sign out|log out|^menu$|close|back to|switch/i.test(label)) return;
        if (el.tagName === 'A' && el.host && el.host !== location.host) return;
        const key = (el.closest('[role="tablist"]') ? 'tab:' : 'nav:') + label;
        if (seen.has(key)) return; seen.add(key);
        out.push({ key, label, tab: !!el.closest('[role="tablist"]') });
      });
      return out;
    });
    const clickItem = (pg, item) => pg.evaluate(it => {
      const els = Array.from(document.querySelectorAll(it.tab ? '[role="tablist"] [role="tab"]' : 'nav button, nav a[href]'));
      const el = els.find(e => { const r = e.getBoundingClientRect(); return r.width && r.height && ((e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)) === it.label; });
      if (!el) return false;
      el.scrollIntoView({ block: 'center' }); el.click(); return true;
    }, item);

    const measure = async (pg, label, vp) => {
      visited++;
      const r = await pg.evaluate(PROBE, { sel: 'body *', floor: 44, denseSel: '.admin-main, .cr-app', denseFloor: 40 });
      const p = await pg.evaluate(PHONE);
      if (process.env.PP_DEBUG) console.log('   dbg', label, vp.w, await pg.evaluate(() => matchMedia('(pointer: coarse)').matches + ' ' + location.pathname + ' ' + !!document.querySelector('.lrn-app')));
      const text = (await pg.evaluate(() => document.body.innerText || '')).trim();
      if (pg.errs.length) { findings.broken.push(label + ' @' + vp.w + ' — ' + pg.errs[0]); pg.errs.length = 0; }
      else if (text.length < 20) findings.broken.push(label + ' @' + vp.w + ' — rendered nothing');
      if (r.strays.length) findings.clipped.push({ label, w: vp.w, all: r.strays });
      if (r.small.length) findings.tiny.push({ label, w: vp.w, all: r.small });
      if (p.zoom.length) findings.zoom.push({ label, w: vp.w, all: p.zoom });
      if (p.under.length) findings.under.push({ label, w: vp.w, all: p.under });
      if (SHOTS && vp.w === 390) await pg.screenshot({ path: path.join(SHOTS, label.replace(/[^a-z0-9]+/gi, '_').slice(0, 80) + '.png'), fullPage: true }).catch(() => {});
    };

    for (const portal of PORTALS) {
      for (const vp of PHONES) {
        const pg = await as(portal.who[0], portal.who[1], vp);
        await pg.goto(BASE + portal.path, { waitUntil: 'domcontentloaded' });
        await waitForBoot(pg);
        const drew = await pg.waitForSelector(portal.ready, { timeout: 45000 }).then(() => true, () => false);
        if (!drew) { findings.broken.push(portal.id + ' @' + vp.w + ' — never drew (' + (pg.errs[0] || (await pg.innerText('body')).slice(0, 160).replace(/\s+/g, ' ')) + ')'); await pg.context().close(); continue; }
        await settle(pg);
        await measure(pg, portal.id + '/home', vp);
        const top = await navItems(pg);
        const done = new Set(['nav:' + 'home']);
        for (const it of top) {
          if (done.has(it.key)) continue; done.add(it.key);
          if (!(await clickItem(pg, it))) continue;
          await settle(pg);
          await measure(pg, portal.id + '/' + it.label, vp);
          /* One level down: tabs that appeared because of this destination. */
          const inner = (await navItems(pg)).filter(x => x.tab && !top.some(t => t.key === x.key) && !done.has(x.key + '@' + it.key));
          for (const sub of inner.slice(0, 8)) {
            done.add(sub.key + '@' + it.key);
            if (!(await clickItem(pg, sub))) continue;
            await settle(pg);
            await measure(pg, portal.id + '/' + it.label + '/' + sub.label, vp);
          }
          /* A "More" page is navigation too: every row on it is a destination,
             and the ones a phone used to grey out are exactly what this suite
             is for. Each is opened, measured, and More reopened. */
          if (/(^|\s)More(\s|$)/.test(it.label)) {
            const rows = await pg.evaluate(() => Array.from(document.querySelectorAll('main button')).filter(b => {
              const r = b.getBoundingClientRect(); return r.width > 200 && r.height >= 44 && !b.closest('nav,[role="tablist"]') && (b.innerText || '').trim();
            }).map(b => (b.innerText || '').trim().split('\n')[0].slice(0, 40)));
            for (const lab of rows.slice(0, 40)) {
              const hit = await pg.evaluate(l => { const b = Array.from(document.querySelectorAll('main button')).find(x => (x.innerText || '').trim().split('\n')[0].slice(0, 40) === l); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; }, lab);
              if (!hit) continue;
              await settle(pg);
              await measure(pg, portal.id + '/More/' + lab, vp);
              /* A row may open a sheet (the Club's "Your access"); close it, or
                 every later row is measured underneath it. */
              await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
              if (!(await clickItem(pg, it))) { await pg.goto(BASE + portal.path, { waitUntil: 'domcontentloaded' }); await settle(pg); await clickItem(pg, it); }
              await settle(pg);
            }
          }
          /* Back to where the top-level navigation is reachable again. */
          if (!(await navItems(pg)).some(x => x.key === it.key)) { await pg.goto(BASE + portal.path, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector(portal.ready, { timeout: 45000 }).catch(() => {}); await settle(pg); }
        }
        await pg.context().close();
      }
    }

    console.log('\nVisited ' + visited + ' destination(s) across ' + PORTALS.length + ' portal(s) at ' + PHONES.map(p => p.w + 'px').join(' and ') + '\n');
    chk('every portal destination draws on a phone without a page error', findings.broken.length === 0);
    findings.broken.slice(0, 12).forEach(b => console.error('      ' + b));
    const report = (name, list) => {
      chk(name, list.length === 0);
      const kinds = {};
      for (const f of list) for (const s of f.all) { const k = s.replace(/ "[^"]*"$/, '').replace(/^-?\d+→-?\d+ /, '').replace(/^\d+×\d+ /, '').replace(/^\d+>\d+ /, ''); (kinds[k] = kinds[k] || []).push(f.label + '@' + f.w + ' ' + (s.match(/"[^"]*"$/) || [''])[0]); }
      Object.keys(kinds).sort((a, b) => kinds[b].length - kinds[a].length).slice(0, 25).forEach(k => console.error('      ' + k + ' — ' + kinds[k].length + '× e.g. ' + kinds[k][0]));
    };
    report('nothing on any portal sits off the side of a phone', findings.clipped);
    report('every control on every portal meets the touch floor', findings.tiny);
    report('no field on any portal is small enough for iOS to zoom into', findings.zoom);
    report('the end of every portal page scrolls clear of its bottom bar', findings.under);
  } catch (e) { console.error(e); failed++; }
  finally { try { if (browser) await browser.close(); } catch (_) {} cleanup(); }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (portals on a phone)');
  process.exit(failed ? 1 : 0);
})();
