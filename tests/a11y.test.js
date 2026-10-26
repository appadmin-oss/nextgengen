#!/usr/bin/env node
/* ============================================================================
   Accessibility, measured. axe-core (the standard WCAG engine, a test-only dev
   dependency — nothing ships to the site) runs on every screen of the member
   portal (wide, phone and the simple view), the mentor portal, the
   instructor portal and the Anchor Journal, signed in on real records.

   It fails on any WCAG 2.1 A/AA violation, whatever its impact, and prints
   each one with the element, so the fix is findable. CLAUDE.md §9 states
   these as requirements; this suite is what holds them.

   Run:  node tests/a11y.test.js     (A11Y_ONLY=member|mentor|journal|instructor)
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.A11Y_PORT || '8341';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-a11y-'));
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
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 }, permissions: ['microphone'] });
  await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
                        { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const pg = await ctx.newPage();
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e).slice(0, 300)));
  return pg;
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  a11y: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to run this suite.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'a11y_e2e_secret_portal_0123456789abcd',
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
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@a11y.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk('NGG-AX-ADM', 'Ade Admin', 'super_admin');
      $mk('NGG-AX-K1', 'Tolu Adebayo', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-14 years')), 'displayId' => '026-014', 'school' => 'Egbeda High', 'parentName' => 'Mrs Adebayo', 'parentPhone' => '08031234567']);
      $mk('NGG-AX-K2', 'Ada Okafor', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-11 years'))]);
      $mk('NGG-AX-MEN', 'Ngozi Eke');
      db_insert('mentors', ['mentorId' => 'MEN-AX-1', 'fullName' => 'Ngozi Eke', 'email' => 'ngozi.eke@a11y.example', 'status' => 'active', 'centre' => 'Egbeda', 'tracks' => 'Coding',
        'programme' => 'ngg', 'memberId' => 'NGG-AX-MEN', 'checkedAt' => $now, 'maxMentees' => 8, 'createdAt' => $now]);
      foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId' => 'MEN-AX-1', 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
      db_insert('mentor_policy', ['mentorId' => 'MEN-AX-1', 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'x', 'acceptedAt' => $now]);
      foreach (['NGG-AX-K1', 'NGG-AX-K2'] as $k) {
        $a = backend_dispatch('admin.ms.match.approve', ['requesterId' => 'NGG-AX-ADM', 'memberId' => $k, 'mentorIds' => ['MEN-AX-1']]);
        backend_dispatch('admin.ms.match.choose', ['requesterId' => 'NGG-AX-ADM', 'matchId' => $a['matchId'], 'mentorId' => 'MEN-AX-1', 'chosenBy' => 'mentee']);
        if (!db_row("SELECT 1 FROM mentor_assignments WHERE memberId = ? AND status = 'active'", [$k])) db_insert('mentor_assignments', ['mentorId' => 'MEN-AX-1', 'memberId' => $k, 'status' => 'active', 'startedAt' => $now]);
      }
      db_insert('mentor_messages', ['threadId' => 'chat:NGG-AX-K1', 'kind' => 'Reply', 'subjectId' => 'NGG-AX-K1', 'fromId' => 'NGG-AX-MEN', 'fromName' => 'Ngozi Eke', 'toId' => 'NGG-AX-K1', 'body' => 'Well done on Saturday.', 'status' => 'sent', 'readAt' => '', 'createdAt' => $now]);
      backend_dispatch('member.mentor.chat.send', ['memberId' => 'NGG-AX-K1', 'body' => 'Thank you, coach.']);
      backend_dispatch('journal.mine.save', ['memberId' => 'NGG-AX-K1', 'data' => ['new' => true, 'body' => 'I led the warm-up.', 'mood' => 4, 'visibility' => 'mentor']]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const exe = require('./_responsive-probe').chromiumPath(fs);
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const AXE = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
    const only = process.env.A11Y_ONLY || '';
    const report = [];
    /* One screen: settle, run axe for WCAG 2.1 A/AA, keep serious and critical. */
    const audit = async (pg, label, ready) => {
      // A screen that never drew is not a pass: auditing a spinner proves nothing.
      const drew = await ready(pg).then(() => true, () => false);
      if (!drew) { chk(label + ': the screen drew (so it could be checked)', false); return; }
      await pg.waitForTimeout(600);
      await pg.addScriptTag({ path: AXE });
      const res = await pg.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })
        .then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help,
          nodes: v.nodes.slice(0, 6).map(n => (n.target || []).join(' ') + (n.failureSummary ? ' — ' + n.failureSummary.split('\n').slice(1, 2).join(' ').trim() : '')), count: v.nodes.length }))));
      res.forEach(v => report.push({ screen: label, ...v }));
      chk(label + ': no WCAG 2.1 A/AA violation' + (res.length ? ' (' + res.map(v => v.id + '×' + v.count).join(', ') + ')' : ''), res.length === 0);
    };
    const mainReady = text => pg => pg.waitForFunction(t => new RegExp(t).test((document.querySelector('main') || document.body).innerText), text, { timeout: 40000 });
    const boot = async (pg, url) => { await pg.goto(BASE + url, { waitUntil: 'domcontentloaded' }); if (!/^\/journal\//.test(url)) await waitForBoot(pg); };

    /* The checker itself: a planted unlabelled image must be caught, or every pass above means nothing. */
    {
      const sp = await as('NGG-AX-K1', false);
      await boot(sp, '/dashboard');
      await sp.waitForSelector('.m9-app main', { timeout: 60000 });
      await sp.evaluate(() => { const i = document.createElement('img'); i.src = '/assets/logo.png'; i.id = 'a11y-plant'; document.querySelector('main').appendChild(i); });
      await sp.addScriptTag({ path: AXE });
      const hit = await sp.evaluate(() => window.axe.run(document, { runOnly: { type: 'rule', values: ['image-alt'] } }).then(r => r.violations.some(v => v.nodes.some(n => (n.target || []).join(' ').includes('a11y-plant')))));
      chk('the checker works: a planted image with no alt text is caught', hit === true);
      await sp.close();
    }
    if (!only || only === 'member') {
      const mb = await as('NGG-AX-K1', false);
      for (const [url, label, ready] of [
        ['/dashboard', 'Member · Today', mainReady('Getting started|Your next step|All caught up')],
        ['/dashboard/mentor', 'Member · Mentor and messages', mainReady('Messages')],
        ['/dashboard/journal', 'Member · Journal', mainReady('Your entries')],
        ['/dashboard/me', 'Member · Me (profile, sign-in)', mainReady('Sign-in and password')],
        ['/dashboard/help', 'Member · Help', mainReady('Talk to someone now')],
        ['/dashboard/learn', 'Member · Learn', mainReady('.')],
        ['/dashboard/growth', 'Member · Grow', mainReady('.')],
        ['/dashboard/records', 'Member · Records', mainReady('.')],
        ['/dashboard/community', 'Member · Community', mainReady('.')],
      ]) { await boot(mb, url); await audit(mb, label, ready); }
      await boot(mb, '/dashboard/help');
      await mb.click('main button:has-text("Share an idea")').catch(() => {});
      await audit(mb, 'Member · feedback sheet', pg => pg.waitForSelector('[role="dialog"] textarea', { timeout: 15000 }));
      await boot(mb, '/dashboard/me');
      await mb.waitForFunction(() => /You have a password|No password yet/.test((document.querySelector('main') || {}).innerText || ''), null, { timeout: 40000 }).catch(() => {});
      await mb.click('main section:has(h2:has-text("Sign-in and password")) button:has-text("password")').catch(() => {});
      await audit(mb, 'Member · password sheet', pg => pg.waitForSelector('[role="dialog"] input[aria-label="New password"]', { timeout: 15000 }));
      const ph = await as('NGG-AX-K1', false, { width: 390, height: 844 });
      await boot(ph, '/dashboard/more');
      await audit(ph, 'Member · phone · More', mainReady('Sign out'));
      await boot(ph, '/dashboard/mentor');
      await audit(ph, 'Member · phone · Mentor', pg => pg.waitForSelector('main textarea[aria-label="Message"]', { timeout: 40000 }));
      const kid = await as('NGG-AX-K2', false);
      await boot(kid, '/dashboard');
      await audit(kid, 'Member · simple view (age 11)', pg => pg.waitForSelector('.m9x-kid', { timeout: 40000 }));
    }
    if (!only || only === 'journal') {
      const jb = await as('NGG-AX-K1', false);
      await jb.addInitScript(() => { try { localStorage.setItem('ngg_aj_onb', '1'); } catch (_) {} });
      await boot(jb, '/journal/');
      await audit(jb, 'Anchor Journal · home', pg => pg.waitForSelector('a.aj-back-ngg', { timeout: 60000 }));
      await boot(jb, '/journal/?write=1');
      await audit(jb, 'Anchor Journal · writer', pg => pg.waitForSelector('textarea.aj-musing', { timeout: 60000 }));
    }
    if (!only || only === 'mentor') {
      const mt = await as('NGG-AX-MEN', false);
      await boot(mt, '/mentor/ngg');
      await audit(mt, 'Mentor portal · this week', pg => pg.waitForSelector('aside[aria-label="Mentor portal"]', { timeout: 60000 }));
    }
    if (!only || only === 'instructor') {
      const it = await as('NGG-AX-ADM', true);
      await boot(it, '/instructor');
      await audit(it, 'Instructor portal · entry', pg => pg.waitForSelector('main, [role="main"], h1', { timeout: 60000 }));
    }
    if (report.length) {
      console.error('\n  Violations:');
      report.forEach(v => { console.error('  • [' + v.screen + '] ' + v.id + ' (' + v.impact + ', ' + v.count + '): ' + v.help); v.nodes.forEach(n => console.error('      ' + n.slice(0, 240))); });
    }
  } catch (e) {
    failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌' : '✅') + ` a11y: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
