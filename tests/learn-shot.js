#!/usr/bin/env node
/* ============================================================================
   The Learn app and the provider registry — photographed against the REAL
   backend, not a stub.

   Same harness as tests/learn-app.test.js: a throwaway api/config.php, a
   temp SQLite file, `php -S`, and the app booted through Babel exactly as a
   member's browser boots it. What comes out is the product, not a mock-up of
   it — which is the only kind of screenshot worth looking at.

   Run:  node tests/learn-shot.js
   Out:  tests/screens/learn-*.png
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.LEARNSHOT_PORT || '8297';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-learnshot-'));
const DB = path.join(TMP, 'ngg.db');
const OUT = path.join(ROOT, 'tests', 'screens');

let _seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} }
  return null;
}
let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('skipped: playwright not installed'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite.'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'learn_shot_screenshot_secret_0123456789',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
    'seed_bundled_curriculum' => false,
  ];\n`);

  try {
    const now = 'now_iso()';
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'NGG-SHOT-M1','fullName'=>'Ada Okonkwo','email'=>'ada@example.org','type'=>'NGG','status'=>'active','role'=>'member','track'=>'Piano','courses'=>json_encode(['Piano']),'centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'NGG-SHOT-ADM','fullName'=>'Bisi Adeyemi','email'=>'bisi@example.org','type'=>'NGG','status'=>'active','role'=>'club_admin','createdAt'=>${now},'updatedAt'=>${now}]);`
      /* Three lessons so "this week" has an order to show, and one of them
         already finished so the progress meter is not at zero. */
      + `db_insert('curriculum_units', ['unitId'=>'SHOT-U1','course'=>'Piano','level'=>'Year 1 · Foundation','week'=>1,'position'=>1,'title'=>'Finding middle C','summary'=>'Where the hands go, and why that note.','status'=>'published','passMark'=>50,'version'=>1,'objectives'=>json_encode(['Find middle C without looking','Name the white keys in an octave']),'body'=>"## Warm-up\\n\\nSit tall, both feet flat. Press **middle C** with your right thumb.\\n",'durationMins'=>30,'createdAt'=>${now},'updatedAt'=>${now},'publishedAt'=>${now}]);`
      + `db_insert('curriculum_checks', ['checkId'=>'SHOT-C1','unitId'=>'SHOT-U1','kind'=>'mcq','prompt'=>'How many white keys are there in one octave?','options'=>json_encode(['5','7','8']),'answer'=>'1','rubric'=>'','points'=>2,'position'=>1,'source'=>'manual']);`
      + `db_insert('curriculum_units', ['unitId'=>'SHOT-U2','course'=>'Piano','level'=>'Year 1 · Foundation','week'=>2,'position'=>1,'title'=>'The C major scale','summary'=>'Thumb under, evenly, both hands.','status'=>'published','passMark'=>50,'version'=>1,'objectives'=>json_encode(['Play C major, one octave']),'body'=>'Play it slowly, then once more slower.','durationMins'=>30,'createdAt'=>${now},'updatedAt'=>${now},'publishedAt'=>${now}]);`
      + `db_insert('curriculum_checks', ['checkId'=>'SHOT-C2','unitId'=>'SHOT-U2','kind'=>'mcq','prompt'=>'Which finger starts the scale?','options'=>json_encode(['Thumb','Little finger']),'answer'=>'0','rubric'=>'','points'=>2,'position'=>1,'source'=>'manual']);`
      + `db_insert('curriculum_units', ['unitId'=>'SHOT-U3','course'=>'Piano','level'=>'Year 1 · Foundation','week'=>3,'position'=>1,'title'=>'Reading the treble clef','summary'=>'Every good boy deserves fruit.','status'=>'published','passMark'=>50,'version'=>1,'objectives'=>json_encode(['Name a note on the stave']),'body'=>'The five lines, bottom to top.','durationMins'=>25,'createdAt'=>${now},'updatedAt'=>${now},'publishedAt'=>${now}]);`
      /* A school plan, so the School screen and the week's school strip have
         something real in them. */
      + `db_insert('growth_plans', ['planId'=>'GP-SHOT','uploadId'=>'UP-SHOT','memberId'=>'NGG-SHOT-M1','term'=>'2026-1','summary'=>'Two subjects to lift this term.','status'=>'live','committed'=>1,'createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('growth_plan_items', ['itemId'=>'GI-SHOT-1','planId'=>'GP-SHOT','subject'=>'Mathematics','current'=>62,'target'=>75,'method'=>'retrieval','what'=>'Past questions, out loud, no notes.','whenWhere'=>'After supper, at the table.','sessionsPerWeek'=>3,'helper'=>'self','position'=>0]);`
      + `db_insert('growth_plan_items', ['itemId'=>'GI-SHOT-2','planId'=>'GP-SHOT','subject'=>'English','current'=>71,'target'=>80,'method'=>'practice','what'=>'One comprehension passage, timed.','whenWhere'=>'Saturday morning.','sessionsPerWeek'=>2,'helper'=>'sibling','position'=>1]);`
    , ['bootstrap']);

    /* The registry, filled the way a coordinator fills it: one press of the
       button, from the curriculum's own links. Then one result recorded. */
    php(`backend_dispatch('admin.providers.seed', ['requesterId' => 'NGG-SHOT-ADM']);
         $aw = db_row("SELECT awardId FROM provider_awards WHERE title LIKE 'Classical%' LIMIT 1");
         if ($aw) backend_dispatch('admin.providers.credential.set', ['requesterId' => 'NGG-SHOT-ADM',
            'memberId' => 'NGG-SHOT-M1', 'data' => ['awardId' => $aw['awardId'], 'state' => 'earned',
            'awardedOn' => '2026-03-14', 'grade' => 'Merit']]);
         /* Piano is not on the seeded music award (it lists Drums, Saxophone,
            Violin, Vocal Training), so give the member's own course a route —
            otherwise the course page has nothing to show. */
         $t = db_row("SELECT providerId, awardId, courses FROM provider_awards WHERE title LIKE 'Classical%' LIMIT 1");
         if ($t) { $c = json_decode($t['courses'], true); $c[] = 'Piano';
            db_update('provider_awards', ['courses' => json_encode($c)], ['awardId' => $t['awardId']]); }`, ['bootstrap']);

    console.log('  fixture: ' + php(`echo 'members=' . (int)db_row("SELECT COUNT(*) c FROM members")['c']
      . ' units=' . (int)db_row("SELECT COUNT(*) c FROM curriculum_units")['c']
      . ' providers=' . (int)db_row("SELECT COUNT(*) c FROM providers")['c']
      . ' awards=' . (int)db_row("SELECT COUNT(*) c FROM provider_awards")['c']
      . ' creds=' . (int)db_row("SELECT COUNT(*) c FROM member_credentials")['c']
      . ' db=' . $GLOBALS['CONFIG']['db']['sqlite_path'];`, ['bootstrap']));

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    // The shared probe finds this image's Chromium (chrome-linux or chrome-linux64), as the other suites do.
    browser = await chromium.launch(d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});

    const shoot = async (who, at, name, { w = 1280, h = 900, sel, wait } = {}) => {
      const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${who}'"), ${who.endsWith('ADM') ? 'true' : 'false'});`, ['session']);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true },
                            { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      await p.goto(BASE + at, { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      if (sel) await p.waitForSelector(sel, { timeout: 60000 });
      if (wait) await wait(p);
      await p.waitForTimeout(900);
      const file = path.join(OUT, 'learn-' + name + '.png');
      await p.screenshot({ path: file, fullPage: true });
      console.log('  · ' + path.relative(ROOT, file));
      await ctx.close();
    };

    console.log('Learn app (member):');
    await shoot('NGG-SHOT-M1', '/learn', 'week', { sel: '.lrn-card' });
    await shoot('NGG-SHOT-M1', '/learn/course/piano', 'course-awards', { sel: '.lrn-award' });
    await shoot('NGG-SHOT-M1', '/learn/plan', 'school', { sel: '.lrn-plan' });
    await shoot('NGG-SHOT-M1', '/learn/lesson/SHOT-U1', 'lesson', { sel: '.lrn-lesson' });
    await shoot('NGG-SHOT-M1', '/learn', 'week-phone', { w: 390, h: 844, sel: '.lrn-card' });
    await shoot('NGG-SHOT-M1', '/learn/course/piano', 'course-awards-phone', { w: 390, h: 844, sel: '.lrn-award' });
    await shoot('NGG-SHOT-M1', '/learn/lesson/SHOT-U1', 'lesson-phone', { w: 360, h: 780, sel: '.lrn-lesson' });
    await shoot('NGG-SHOT-M1', '/learn/plan', 'school-phone', { w: 360, h: 780, sel: '.lrn-plan' });
    await shoot('NGG-SHOT-M1', '/learn', 'week-tablet', { w: 768, h: 1024, sel: '.lrn-card' });

    console.log('Control Room (staff):');
    await shoot('NGG-SHOT-ADM', '/control/learning/providers', 'control-providers',
      { sel: '.cr-kpi, .cr-note, .cr-card' });
  } catch (e) {
    console.error('FAILED: ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
})();
