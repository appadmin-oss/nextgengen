#!/usr/bin/env node
/* ============================================================================
   The screenshots in the portals' tours (src/modules/guide/guide.jsx), taken
   from the real portals on a phone and on a computer.

   Each tour step can name a `shot`; this signs in as a believable member and
   mentor on a throwaway database, opens each screen at a phone's size
   (390 × 844) and a computer's (1100 × 760), and saves what the step is about
   to assets/guide/<portal>-<device>-<shot>.jpg, with assets/guide/shots.json
   naming them. The tour shows a step's screenshot when the control it is
   about is not on the screen the person is looking at.

   Run after a portal's layout changes:  node tools/guide-shots.js
   (it writes a throwaway api/config.php and refuses to run if one exists).
   ========================================================================== */
'use strict';
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const { waitForServer, waitForBoot } = require(ROOT + '/tests/_serve');
const PORT = process.env.GS_PORT || '8331', BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-gshots-'));
const OUT = path.join(ROOT, 'assets', 'guide');
const DEVICES = { phone: { width: 390, height: 844, isMobile: true, hasTouch: true }, desktop: { width: 1100, height: 760 } };

let seq = 0;
function php(snippet) {
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')}; db_conn();\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

/* What each shot is: the page, then either the whole screen or one part of it
   (a selector per device). `alt` is what the picture shows, read to a screen
   reader in its place. */
const SHOTS = {
  member: {
    who: 'NGG-GS-K1',
    home:   { url: '/dashboard', alt: 'The Today screen of My NGG' },
    nav:    { url: '/dashboard', sel: { phone: ".m9-app nav[aria-label='My NGG']", desktop: '.m9-app aside' }, alt: { phone: 'The bar at the bottom of My NGG: Today, Mentor, Grow, Learn and Me', desktop: 'The list on the left of My NGG: Today, Mentor, Grow, Learn and Me' } },
    today:  { url: '/dashboard', sel: '.m9-app main', alt: 'Today: what to do first, at the top' },
    start:  { url: '/dashboard', sel: '.m9x-start', alt: 'The Getting started list on Today' },
    mentor: { url: '/dashboard/mentor', alt: 'The Mentor screen: messages with your mentor' },
    grow:   { url: '/dashboard/growth', alt: 'The Grow screen: Leadership Index, courage and goal' },
    learn:  { url: '/dashboard/learn', alt: 'The Learn screen: this week’s lessons' },
    help:   { url: '/dashboard/help', alt: 'The Get help screen' },
  },
  mentor: {
    who: 'NGG-GS-MEN',
    home: { url: '/mentor', alt: 'The Mentor Portal: this week' },
    nav:  { url: '/mentor', sel: { phone: '.m15-app nav[aria-label]:last-of-type', desktop: '.m15-app aside' }, alt: { phone: 'The bar at the bottom of the Mentor Portal', desktop: 'The list on the left of the Mentor Portal' } },
  },
};

(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — move it aside to take the screenshots.'); process.exit(1); }
  fs.writeFileSync(CFG, `<?php return ['db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(path.join(TMP, 'ngg.db'))}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'x@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'guide_shots_secret_0123456789abcdefgh', 'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'maps' => ['offline' => true], 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false];\n`);
  let server, browser;
  try {
    php(`
      $now = now_iso(); $ago = fn($d) => gmdate('Y-m-d\\TH:i:s\\Z', time() - $d * 86400);
      $mk = function ($id, $name, $role = 'member', $extra = []) use ($now) { db_insert('members', $extra + ['memberId' => $id, 'fullName' => $name, 'email' => strtolower(str_replace(' ', '.', $name)) . '@gs.example',
        'type' => 'NGG', 'status' => 'active', 'role' => $role, 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]); };
      db_insert('centres', ['centreId' => 'C-EG', 'name' => 'Egbeda', 'code' => 'EGB', 'status' => 'active', 'programmes' => 'ngg', 'slug' => 'egbeda', 'createdAt' => $now]);
      $mk('NGG-GS-ADM', 'Ade Admin', 'super_admin');
      $mk('NGG-GS-K1', 'Tolu Adebayo', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-13 years -2 months')), 'school' => 'Egbeda High', 'displayId' => '026-014']);
      $mk('NGG-GS-K2', 'Ada Okafor', 'member', ['track' => 'TECH', 'dob' => gmdate('Y-m-d', strtotime('-12 years')), 'school' => 'Egbeda High', 'displayId' => '026-015']);
      $mk('NGG-GS-MEN', 'Ngozi Eke');
      db_insert('mentors', ['mentorId' => 'MEN-GS-1', 'fullName' => 'Ngozi Eke', 'email' => 'ngozi.eke@gs.example', 'status' => 'active', 'centre' => 'Egbeda', 'tracks' => 'Coding',
        'programme' => 'ngg', 'memberId' => 'NGG-GS-MEN', 'checkedAt' => $now, 'maxMentees' => 8, 'createdAt' => $now]);
      foreach (array_merge(ms_required_modules(), academy_orientation_ids('mentor')) as $mod) db_insert('mentor_academy', ['mentorId' => 'MEN-GS-1', 'moduleId' => $mod, 'score' => 100, 'passedAt' => $now]);
      db_insert('mentor_policy', ['mentorId' => 'MEN-GS-1', 'policyVersion' => MS_POLICY_VERSION, 'signedName' => 'Ngozi Eke', 'acceptedAt' => $now]);
      foreach (['NGG-GS-K1', 'NGG-GS-K2'] as $k) {
        $a = backend_dispatch('admin.ms.match.approve', ['requesterId' => 'NGG-GS-ADM', 'memberId' => $k, 'mentorIds' => ['MEN-GS-1']]);
        backend_dispatch('admin.ms.match.choose', ['requesterId' => 'NGG-GS-ADM', 'matchId' => $a['matchId'], 'mentorId' => 'MEN-GS-1', 'chosenBy' => 'mentee']);
        if (!db_row("SELECT 1 FROM mentor_assignments WHERE memberId = ? AND status = 'active'", [$k])) db_insert('mentor_assignments', ['mentorId' => 'MEN-GS-1', 'memberId' => $k, 'status' => 'active', 'startedAt' => $ago(60)]);
      }
      db_insert('mentor_messages', ['threadId' => 'chat:NGG-GS-K1', 'kind' => 'Reply', 'subjectId' => 'NGG-GS-K1', 'fromId' => 'NGG-GS-MEN', 'fromName' => 'Ngozi Eke', 'toId' => 'NGG-GS-K1', 'body' => 'Well done leading the team on Saturday. What will you try next week?', 'createdAt' => $ago(1)]);
      db_insert('mentor_messages', ['threadId' => 'chat:NGG-GS-K1', 'kind' => 'Message', 'subjectId' => 'NGG-GS-K1', 'fromId' => 'NGG-GS-K1', 'fromName' => 'Tolu Adebayo', 'toId' => 'NGG-GS-MEN', 'body' => 'I want to give my 2-minute talk.', 'createdAt' => $ago(0.5)]);
      $m0 = gmdate('Y-m');
      db_insert('mentor_scorecards', ['subjectId' => 'NGG-GS-K1', 'month' => $m0, 'scores' => '7,6,6,4,6,7,6,7,8,5', 'total' => 62, 'byKind' => 'mentor', 'mentorId' => 'MEN-GS-1', 'centre' => 'Egbeda', 'createdAt' => $now, 'updatedAt' => $now]);
      setting_set('curriculum', ['startDate' => gmdate('Y-m-d', time() - 14 * 86400)]);
      for ($w = 1; $w <= 3; $w++) db_insert('curriculum_units', ['unitId' => "CU-GS-$w", 'course' => 'Coding', 'level' => '', 'week' => $w, 'position' => 1, 'title' => "Web pages, part $w",
        'body' => "Pages are built from tags.", 'objectives' => '["What a tag is"]', 'status' => 'published', 'version' => 1, 'passMark' => 50, 'createdAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await require(ROOT + '/node_modules/playwright-core').chromium.launch(d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = {};
    for (const [portal, def] of Object.entries(SHOTS)) {
      const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${def.who}'"), false);`);
      for (const [kind, vp] of Object.entries(DEVICES)) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'gs-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
        const pg = await ctx.newPage();
        for (const [key, s] of Object.entries(def)) {
          if (key === 'who') continue;
          await pg.goto(BASE + s.url, { waitUntil: 'domcontentloaded' });
          await waitForBoot(pg); await pg.waitForLoadState('networkidle').catch(() => {});
          await pg.waitForFunction(() => !document.querySelector('.m9x-load, .m15x-load'), null, { timeout: 30000 }).catch(() => {});
          await pg.waitForTimeout(800);
          const sel = s.sel && typeof s.sel === 'object' ? s.sel[kind] : s.sel;
          const file = portal + '-' + kind + '-' + key + '.jpg';
          let box = null;
          if (sel) {
            const el = await pg.$(sel);
            if (!el || !(await el.isVisible())) { console.log('  · ' + portal + ' ' + kind + ' ' + key + ': ' + sel + ' is not on this screen — skipped'); continue; }
            await el.scrollIntoViewIfNeeded().catch(() => {});
            box = await el.boundingBox();
            // One part of the screen, cropped to what fits a tour card.
            const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(vp.width, box.width + 16), height: Math.min(kind === 'phone' ? 560 : 520, box.height + 16) };
            await pg.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 72, clip });
            box = clip;
          } else {
            await pg.evaluate(() => window.scrollTo(0, 0));
            await pg.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 70 });
            box = { width: vp.width, height: vp.height };
          }
          const alt = typeof s.alt === 'object' ? s.alt[kind] : s.alt + (kind === 'phone' ? ', on a phone' : ', on a computer');
          ((manifest[portal] = manifest[portal] || {})[kind] = manifest[portal][kind] || {})[key] = { file, w: Math.round(box.width), h: Math.round(box.height), alt };
          console.log('  ✓ ' + file + ' (' + Math.round(fs.statSync(path.join(OUT, file)).size / 1024) + ' KB)');
        }
        await ctx.close();
      }
    }
    fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(manifest, null, 1) + '\n');
    console.log('wrote assets/guide/shots.json');
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { process.kill(-server.pid); } catch (_) {}
    try { fs.unlinkSync(CFG); } catch (_) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(e => { console.error(e); process.exit(1); });
