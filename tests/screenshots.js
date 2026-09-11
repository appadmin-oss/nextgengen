#!/usr/bin/env node
/* ============================================================================
   Screenshot the features built on this branch, against a real server.

   Not a test — a capture run. It boots the app with seeded, plausible data and
   photographs the surfaces that changed, so the work can be reviewed by looking
   at it rather than by reading a diff.

   Real sessions rather than mocked API objects: the admin cookie is minted by
   the app's own session_issue() with adminOk already true, so the console opens
   without a TOTP round-trip while everything behind it is the genuine handler
   path talking to a genuine database.

   Output: docs/screens/*.png

   Run:  node tests/screenshots.js
   Env:  SHOT_PORT (default 8210), CHROMIUM_PATH, PLAYWRIGHT_MODULE
   ============================================================================ */
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot, writeScreenIndex } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const PORT = process.env.SHOT_PORT || '8210';
const BASE = `http://127.0.0.1:${PORT}`;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-shots-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-shots-cache-${process.pid}`);
const GATE_SELF = 'GL-PUBLIC1';
let _seq = 0;

function loadChromium() {
  const mods = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const m of mods) { try { return require(m).chromium; } catch (_) {} }
  console.error('playwright not found'); process.exit(2);
}

function php(snippet) {
  const req = (f) => `require ${JSON.stringify(ROOT + '/api/_lib/' + f)};`;
  const domains = ['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2',
    'mentorship', 'summer', 'policy', 'club', 'circle', 'momentum', 'integrations',
    'registration', 'selfreg', 'hooks', 'behaviour', 'volunteers', 'photos', 'mentor',
    'instructor', 'ops', 'analytics', 'growth', 'insight', 'insight-chat', 'journal', 'profiles', 'community', 'arcade'];
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `function client_ip(){return '127.0.0.1';} function client_ua(){return 'shots';}`
    + req('qr-encode.php') + req('response.php') + req('db.php') + req('util.php') + req('mailer.php')
    + req('anchor-content.php') + req('ai.php') + req('bus.php') + req('sms.php')
    + domains.map(d => `require ${JSON.stringify(ROOT + '/api/_lib/domain/' + d + '.php')};`).join('')
    + req('backend.php') + req('sheets.php') + req('webcron.php') + req('session.php')
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-shot-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}

let server;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.unlinkSync(DB); } catch (_) {}
  try { fs.rmSync(path.join(__dirname, '_faces'), { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

/* Realistic seed. Screenshots of empty states prove nothing, and a growth chart
   needs actual trajectories to have a shape at all. */
function seed() {
  const centres = [['CT-EG', 'Egbeda', 'EGB'], ['CT-AL', 'Alimosho', 'ALI'], ['CT-AY', 'Ayobo', 'AYO']];
  let s = `db_migrate(db_conn());`
    + `db_insert('summer_cohorts', ['cohortId'=>'C1','name'=>'Summer 2026','status'=>'active','createdAt'=>now_iso()]);`
    + `db_insert('members', ['memberId'=>'NGG-2026-0001','fullName'=>'Amara Okonkwo','email'=>'amara@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
    + `db_insert('members', ['memberId'=>'NGG-2026-0002','fullName'=>'Tunde Bello','email'=>'tunde@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`;
  centres.forEach(([id, name, code], i) => {
    s += `db_insert('centres', ['centreId'=>'${id}','name'=>'${name}','code'=>'${code}','color'=>'${['#4C6FFF', '#16a34a', '#f5b026'][i]}','status'=>'active','createdAt'=>now_iso()]);`;
    for (let m = 0; m < 2 + i; m++) {
      s += `db_insert('mentors', ['mentorId'=>'M-${code}-${m}','fullName'=>'Coach ${code}${m}','centre'=>'${name}','department'=>'${['STEM', 'Arts', 'Life skills'][m % 3]}','status'=>'active','createdAt'=>now_iso()]);`;
    }
  });
  // Gate links — one of each kind, plus a revoked one so Delete is visible.
  s += `db_insert('gate_links', ['gateId'=>'${GATE_SELF}','kind'=>'self','name'=>'Alimosho public sign-up','cohortId'=>'C1','centreId'=>'','status'=>'active','passHash'=>'','createdBy'=>'NGG-2026-0001','createdAt'=>now_iso()]);`
    + `db_insert('gate_links', ['gateId'=>'GL-DESK01','kind'=>'desk','name'=>'Egbeda desk · Sat','cohortId'=>'C1','centreId'=>'Egbeda','status'=>'active','passHash'=>password_hash('desk1234', PASSWORD_DEFAULT),'passSetAt'=>now_iso(),'passRotateDays'=>30,'passNotify'=>'ops@example.org','usedCount'=>31,'createdBy'=>'NGG-2026-0001','createdAt'=>now_iso()]);`
    + `db_insert('gate_links', ['gateId'=>'GL-REVIEW1','kind'=>'review','name'=>'Review desk','cohortId'=>'C1','centreId'=>'','status'=>'active','passHash'=>password_hash('rev12345', PASSWORD_DEFAULT),'passSetAt'=>now_iso(),'usedCount'=>7,'createdBy'=>'NGG-2026-0001','createdAt'=>now_iso()]);`
    + `db_insert('gate_links', ['gateId'=>'GL-OLD001','kind'=>'desk','name'=>'Ayobo desk (last term)','cohortId'=>'C1','centreId'=>'Ayobo','status'=>'revoked','revokedAt'=>now_iso(),'passHash'=>'','usedCount'=>112,'createdBy'=>'NGG-2026-0001','createdAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-90*86400)]);`;

  /* Students with deliberately DIFFERENT trajectories — that is the whole point
     of the growth level, and a flat cohort would photograph as a flat cohort. */
  const kids = [
    ['Chidi Okafor', 'Egbeda', 13, [5, 5, 4, 5], 6, 0],
    ['Ngozi Adeyemi', 'Egbeda', 12, [1, 2, 4, 5], 3, 0],
    ['Emeka Nwosu', 'Egbeda', 14, [5, 4, 2, 1], 0, 2],
    ['Aisha Bello', 'Alimosho', 11, [3, 3, 3, 3], 2, 0],
    ['Yusuf Ibrahim', 'Alimosho', 15, [5, 3, 1, 0], 0, 3],
    ['Funke Adebayo', 'Alimosho', 13, [2, 3, 5, 5], 5, 0],
    ['Kelechi Eze', 'Ayobo', 16, [4, 5, 5, 5], 8, 0],
    ['Zainab Musa', 'Ayobo', 12, [4, 4, 3, 2], 1, 1],
    ['Obi Chukwu', 'Ayobo', 14, [5, 5, 5, 4], 4, 0],
  ];
  kids.forEach(([name, centre, age, pattern, stars, infractions], i) => {
    const sid = 'SUM-26-' + String(i + 1).padStart(3, '0');
    s += `db_insert('summer_students', ['studentId'=>'${sid}','cohortId'=>'C1','token'=>'SUMQR-${i}','handle'=>'k${i}','fullName'=>${JSON.stringify(name)},'age'=>${age},'gender'=>'${i % 2 ? 'M' : 'F'}','centre'=>${JSON.stringify(centre)},'track'=>'${['STEM', 'Arts', 'Coding'][i % 3]}','status'=>'active','regStatus'=>'verified','enrolledAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-${28 - (i % 3) * 7}*86400),'updatedAt'=>now_iso()]);`;
    pattern.forEach((days, w) => {
      const back = pattern.length - 1 - w;
      for (let d = 0; d < days; d++) {
        s += `db_insert('attendance', ['cohortId'=>'C1','studentId'=>'${sid}','date'=>gmdate('Y-m-d', time()-${back}*7*86400-${d}*86400),'checkInAt'=>now_iso(),'method'=>'qr','createdAt'=>now_iso()]);`;
      }
    });
    if (stars) s += `db_insert('member_stars', ['subjectId'=>'${sid}','subjectType'=>'student','givenById'=>'M-EGB-0','stars'=>${stars},'category'=>'effort','centre'=>${JSON.stringify(centre)},'date'=>gmdate('Y-m-d'),'createdAt'=>now_iso()]);`;
    for (let n = 0; n < infractions; n++) {
      s += `db_insert('infractions', ['personId'=>'${sid}','personType'=>'student','kind'=>'lateness','date'=>gmdate('Y-m-d', time()-${n * 3}*86400),'note'=>'Arrived after the second bell','createdAt'=>now_iso()]);`;
    }
  });
  /* Desk registrations still waiting on a parent — the queue the consent
     recorder exists for. One has no guardian on file, which is the row a bulk
     record has to skip rather than invent a name for. */
  [['Ifeoma Nwachukwu', 'Mrs Nwachukwu', 'Egbeda', 6],
   ['Sade Balogun', 'Mr Balogun', 'Alimosho', 11],
   ['Tobi Ogun', '', 'Ayobo', 3]].forEach(([name, guardian, centre, waited], i) => {
    s += `db_insert('summer_students', ['studentId'=>'SUM-26-P0${i}','cohortId'=>'C1','fullName'=>${JSON.stringify(name)},`
      + `'age'=>12,'dob'=>gmdate('Y-m-d', strtotime('-12 years -2 months')),'centre'=>${JSON.stringify(centre)},'track'=>'STEM',`
      + `'status'=>'active','regStatus'=>'parent_pending','guardianName'=>${JSON.stringify(guardian)},`
      + `'guardianPhone'=>'080300001${i}','parentEmail'=>${JSON.stringify(guardian ? 'g' + i + '@example.org' : '')},`
      + `'enrolledAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-${waited}*86400),'updatedAt'=>now_iso()]);`;
  });

  // A couple of pending self-registrations, so the review queue is not empty.
  s += `db_insert('summer_students', ['studentId'=>'SUM-26-900','cohortId'=>'C1','fullName'=>'Blessing Eze','age'=>12,'centre'=>'Alimosho','track'=>'Arts','status'=>'active','regStatus'=>'self_pending','submittedVia'=>'${GATE_SELF}','guardianName'=>'Mrs Eze','guardianPhone'=>'08031234567','parentEmail'=>'eze@example.org','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`;

  // Journal entries across kinds and visibilities, plus one from last year so
  // "On this day" has something to resurface.
  const entries = [
    ['Board advised moving intake a week earlier', 'The board reviewed last term\\\'s queue and advised opening registration a week before the schools break up. Alimosho lost most of its walk-ins to the holiday rush.', 'advice', 'open', 'community', 'CT-AL', 4],
    ['Egbeda parents funded twenty ID cards', 'A group of guardians at Egbeda covered the printing cost for twenty cards after the batch ran short.', 'contribution', 'resolved', 'community', 'CT-EG', 11],
    ['Bus route to Ayobo unreliable on Saturdays', 'Three consecutive Saturdays with children arriving after the second bell. Raised with the transport contact; moved the Ayobo start to 09:30.', 'issue', 'resolved', 'staff', 'CT-AY', 18],
    ['Two hundredth Summer School registration', 'Reached two hundred confirmed registrations across the three centres.', 'milestone', 'open', 'public', '', 25],
    ['Decided against publishing attendance league tables', 'Discussed at length. Ranking centres publicly would put pressure on the smallest one for reasons outside its control. Aggregate only.', 'decision', 'resolved', 'staff', '', 40],
    ['First cohort graduation, one year on', 'The first Anchor cohort finished twelve weeks. Forty-one of forty-six completed.', 'milestone', 'open', 'community', '', 365],
  ];
  entries.forEach(([title, body, kind, status, vis, centre, daysAgo], i) => {
    const eid = 'PJ-2026-' + String(i + 1).padStart(4, '0');
    s += `db_insert('program_journal', ['entryId'=>'${eid}','title'=>${JSON.stringify(title)},'body'=>${JSON.stringify(body)},'kind'=>'${kind}','status'=>'${status}','visibility'=>'${vis}','authorId'=>'NGG-2026-0001','authorName'=>'Amara Okonkwo','centreId'=>'${centre}','occurredAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-${daysAgo}*86400),'mediaJson'=>'','shareToken'=>'','pinned'=>0,'createdAt'=>now_iso(),'updatedAt'=>now_iso(),'archivedAt'=>'']);`;
  });
  s += `journal_set_tags('PJ-2026-0001', [['personId'=>'NGG-2026-0001','name'=>'Amara Okonkwo','role'=>'raised'],['personId'=>'free:board','name'=>'Programme board','role'=>'advised']]);`
    + `journal_set_tags('PJ-2026-0003', [['personId'=>'M-AYO-0','name'=>'Coach AYO0','role'=>'reported'],['personId'=>'free:transport','name'=>'Transport contact','role'=>'resolved it']]);`;

  /* Volunteers, so the ID card studio has a real roster to render.
     One per centre plus a roving coordinator with no site, because the card the
     design has to get right is the one for somebody who belongs everywhere. */
  const vols = [
    ['VOL-ADM-26-001', 'Tunde Bakare', 'admin', 'Egbeda', ''],
    ['VOL-MEN-26-002', 'Ngozi Adeyemi', 'mentor', 'Alimosho', ''],
    ['VOL-INS-26-003', 'Amaka Okonjo', 'instructor', 'Ayobo', 'Music'],
    ['VOL-MEN-26-004', 'Chidi Nwankwo', 'mentor', 'Egbeda', ''],
    ['VOL-INS-26-005', 'Adaeze Obi', 'instructor', '', ''],
  ];
  vols.forEach(([vid, name, role, centre, faculty], i) => {
    s += `db_insert('volunteers', ['volunteerId'=>'${vid}','fullName'=>${JSON.stringify(name)},'email'=>'v${i}@example.org','role'=>'${role}','centre'=>${JSON.stringify(centre)},'faculty'=>${JSON.stringify(faculty)},'token'=>'VQR-${i}','photoUrl'=>'','status'=>'active','safeguarding'=>'cleared','createdAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-${20 - i * 3}*86400),'updatedAt'=>now_iso()]);`;
  });

  /* The card's own branding block, so the back does not print "127.0.0.1" as
     the programme website. */
  s += `setting_set('idcard', ['program'=>'NGG','year'=>'2026','motto'=>'GROW','website'=>'nextgengenius.org','phone'=>'+234 800 000 0000','widthMm'=>54,'heightMm'=>75]);`;

  // A couple of ops events so Diagnostics is not an empty table.
  s += `ops_record('cron', 'deliveries_dispatch', 'ran');`
    + `ops_record('warn', 'cache:public_status', 'serving stale (410s old)', 'transient db timeout');`;

  php(s);
}

(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php exists — refusing to overwrite.'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'r@example.org', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'shots_secret_0123456789abcdefghi',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'debug' => false,
  ];\n`);

  const shots = [];
  let browser;
  try {
    seed();
    // Mint sessions the app's own way. adminOk = true so the console opens
    // without a TOTP round-trip; everything behind it is the real handler path.
    const adminTok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId='NGG-2026-0001'"), true);`);
    const memberTok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId='NGG-2026-0002'"), false);`);

    server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const chromium = loadChromium();
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);

    const shoot = async (page, name, label) => {
      const file = path.join(OUT, name + '.png');
      await page.screenshot({ path: file, fullPage: true });
      const kb = Math.round(fs.statSync(file).size / 1024);
      shots.push({ name, label, kb });
      console.log(`  ✓ ${name}.png  (${kb} KB) — ${label}`);
    };

    const desktop = async (tok) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
      if (tok) await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }]);
      return ctx;
    };
    const phone = async (tok) => {
      const ctx = await browser.newContext({ viewport: { width: 414, height: 900 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      if (tok) await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }]);
      return ctx;
    };
    const goto = async (page, url, waitFor) => {
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      if (waitFor) await page.waitForSelector(waitFor, { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1400);   // charts + lazy fetches settle
    };

    // ── 1 · Growth Potential (Level 5) ───────────────────────────────────────
    {
      const ctx = await desktop(adminTok);
      const page = await ctx.newPage();
      page.on('pageerror', e => console.error('    [pageerror]', String(e)));
      // /nextadmin opens on Overview; Analytics is its own section.
      await goto(page, '/nextadmin', '.admin-shell');
      await page.evaluate(() => window.__adminSection && window.__adminSection('dashboard'));
      await page.waitForSelector('.an-wrap', { timeout: 25000 }).catch(() => {});
      await page.waitForSelector('#an-growth', { timeout: 25000 }).catch(() => {});
      await page.evaluate(() => { const el = document.getElementById('an-growth'); if (el) el.scrollIntoView(); });
      await page.waitForTimeout(3000);
      // Needs-support list is the default tab.
      const g = await page.$('#an-growth');
      if (g) {
        const file = path.join(OUT, '01-growth-needs-support.png');
        await g.screenshot({ path: file });
        shots.push({ name: '01-growth-needs-support', label: 'Level 5 · who needs support, with reason codes', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 01-growth-needs-support.png — Level 5, needs-support list');
      } else await shoot(page, '01-growth-needs-support', 'Level 5 · growth potential');

      // By-centre tab: named constraint per centre.
      await page.click('#an-growth a:has-text("By centre")').catch(() => {});
      await page.waitForTimeout(900);
      const g2 = await page.$('#an-growth');
      if (g2) {
        const file = path.join(OUT, '02-growth-by-centre.png');
        await g2.screenshot({ path: file });
        shots.push({ name: '02-growth-by-centre', label: 'Level 5 · per-centre readiness + named constraint', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 02-growth-by-centre.png — per-centre constraint');
      }
      // The published method.
      await page.click('#an-growth button:has-text("How this is calculated")').catch(() => {});
      await page.waitForTimeout(700);
      const g3 = await page.$('#an-growth');
      if (g3) {
        const file = path.join(OUT, '03-growth-method.png');
        await g3.screenshot({ path: file });
        shots.push({ name: '03-growth-method', label: 'Level 5 · published weights and method', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 03-growth-method.png — published methodology');
      }
      await ctx.close();
    }

    /* ── 1b · The ID cards, from the database ────────────────────────────────
     * Rendered by the real studio off real rows, not a fixture: three centres
     * with the colours an admin actually set, three hierarchy tiers, and a
     * volunteer with no single site. */
    {
      const ctx = await desktop(adminTok);
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 1680, height: 1200 });
      /* Real headshots on the real rows. An empty gradient frame flatters the
         design: the whole question about a coloured border round a photograph is
         whether it still reads once there is a face inside it. Drawn in-page and
         written to disk, so the capture has no network dependency. */
      const faceDir = path.join(ROOT, 'tests', '_faces');
      fs.mkdirSync(faceDir, { recursive: true });
      const blank = await ctx.newPage();
      await blank.setContent('<body></body>');
      for (let i = 1; i <= 5; i++) {
        const dataUrl = await blank.evaluate((seed) => {
          const c = document.createElement('canvas'); c.width = 900; c.height = 708;
          const x = c.getContext('2d'), hue = (seed * 47) % 360;
          const g = x.createLinearGradient(0, 0, 0, 708);
          g.addColorStop(0, `hsl(${hue},34%,76%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360},28%,54%)`);
          x.fillStyle = g; x.fillRect(0, 0, 900, 708);
          x.fillStyle = `hsl(${(hue + 200) % 360},22%,32%)`;
          x.beginPath(); x.ellipse(450, 750, 378, 269, 0, 0, 7); x.fill();
          x.fillStyle = `hsl(28,42%,${46 + (seed % 4) * 6}%)`;
          x.beginPath(); x.ellipse(450, 368, 180, 184, 0, 0, 7); x.fill();
          x.beginPath(); x.ellipse(450, 566, 108, 113, 0, 0, 7); x.fill();
          return c.toDataURL('image/png');
        }, i);
        fs.writeFileSync(path.join(faceDir, 'f' + i + '.png'),
          Buffer.from(dataUrl.split(',')[1], 'base64'));
      }
      await blank.close();
      php(`$vs = db_all("SELECT volunteerId FROM volunteers ORDER BY id ASC");`
        + `foreach ($vs as $i => $v) db_update('volunteers', ['photoUrl' => '/tests/_faces/f' . ($i + 1) . '.png'], ['volunteerId' => $v['volunteerId']]);`);

      // The studio is its own route, not an admin section.
      await goto(page, '/cards', '.print-zone');
      await page.waitForSelector('.card-pair', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2200);
      const volTab = await page.$('button:has-text("Volunteers")');
      if (volTab) { await volTab.click(); await page.waitForTimeout(2200); }
      // The per-card controls float over the artwork. They belong to the studio,
      // not to the card, and in a picture of the card they are just clutter.
      const hideChrome = () => page.evaluate(() => {
        document.querySelectorAll('.print-zone .no-print').forEach(n => { n.style.display = 'none'; });
        /* An element screenshot still renders whatever is painted over that box,
           so any fixed-position app chrome — sync indicator, scroll button —
           lands on top of a card and reads as part of the artwork. */
        document.querySelectorAll('body *').forEach(n => {
          if (getComputedStyle(n).position === 'fixed' && !n.closest('.print-zone')) n.style.display = 'none';
        });
      });
      await hideChrome();
      const zone = await page.$('.print-zone');
      if (zone) {
        const file = path.join(OUT, '21-volunteer-ids-real.png');
        await zone.screenshot({ path: file });
        shots.push({ name: '21-volunteer-ids-real', label: 'Volunteer IDs as the studio renders them from the database', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 21-volunteer-ids-real.png  (' + shots[shots.length - 1].kb + ' KB) — volunteer IDs, real rows');
      }
      // The children's cards from the same rows, for the side-by-side.
      const stuTab = await page.$('button:has-text("Participants")');
      if (stuTab) { await stuTab.click(); await page.waitForTimeout(2200); }
      await hideChrome();
      const zone2 = await page.$('.print-zone');
      if (zone2) {
        const file = path.join(OUT, '22-student-ids-real.png');
        await zone2.screenshot({ path: file });
        shots.push({ name: '22-student-ids-real', label: 'Summer School participant IDs from the same database, for comparison', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 22-student-ids-real.png  (' + shots[shots.length - 1].kb + ' KB) — student IDs, real rows');
      }
      await ctx.close();
    }

    /* ── 1b2 · Recording a consent a family gave off-line ────────────────────
     * The queue where a desk registration waits for a parent to click a link,
     * and the sheet for the ones it will never reach. */
    {
      const ctx = await desktop(adminTok);
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 1280, height: 1000 });
      await goto(page, '/nextadmin', '.admin-shell');
      await page.evaluate(() => window.__adminSection && window.__adminSection('registration', 'pending'));
      await page.waitForTimeout(1400);
      // The section opens on its own default tab; click through to the queue.
      const pt = await page.$('.admin-anchor-tab:has-text("Pending sign-ups")');
      if (pt) { await pt.click(); await page.waitForTimeout(2200); }
      // Tick two rows so the bulk bar is visible, then open the sheet.
      const boxes = await page.$$('.admin-table tbody input[type=checkbox]');
      for (const b of boxes.slice(0, 2)) { await b.click(); await page.waitForTimeout(200); }
      await page.waitForTimeout(600);
      await shoot(page, '24-consent-pending', 'Awaiting a parent — select the forms you are holding');
      const rec = await page.$('button:has-text("Record consent for")');
      if (rec) {
        await rec.click();
        await page.waitForTimeout(1600);
        // Grant everything, which is what a completed paper form means.
        const grant = await page.$('button:has-text("Grant everything")');
        if (grant) { await grant.click(); await page.waitForTimeout(500); }
        // Fixed app chrome paints over an element screenshot; it is not the sheet.
        await page.evaluate(() => {
          document.querySelectorAll('body *').forEach(n => {
            if (getComputedStyle(n).position === 'fixed' && !n.closest('div[role=dialog]')) n.style.display = 'none';
          });
        });
        const sheet = await page.$('div[role=dialog] > div');
        if (sheet) {
          const file = path.join(OUT, '25-consent-recorder.png');
          await sheet.screenshot({ path: file });
          shots.push({ name: '25-consent-recorder', label: 'Recording an off-line consent — method, permissions, and each child\'s own guardian', kb: Math.round(fs.statSync(file).size / 1024) });
          console.log('  ✓ 25-consent-recorder.png  (' + shots[shots.length - 1].kb + ' KB) — consent recorder');
        }
      }
      await ctx.close();
    }

    /* ── 1c · The analyst chat, mid-conversation ─────────────────────────────
     * Seeded with a real turn written straight into the thread tables, so the
     * capture shows the pane as a coordinator sees it after asking — the plan,
     * the claims, the grounding line — without spending a provider call to take
     * a screenshot. */
    {
      php(`db_insert('insight_threads', ['threadId'=>'IQ-SHOT01','title'=>'Which centre should get the next mentor?','ownerId'=>'NGG-2026-0001','centre'=>'','rangeLabel'=>'All weeks','turns'=>1,'createdAt'=>now_iso(),'updatedAt'=>now_iso(),'archivedAt'=>'']);`
        + `db_insert('insight_turns', ['threadId'=>'IQ-SHOT01','seq'=>1,'askedById'=>'NGG-2026-0001',`
        + `'question'=>'Which centre should get the next mentor, and what in this data says so?',`
        + `'answer'=>"Alimosho, on the evidence here — but the margin is thinner than it looks.\n\nAlimosho runs at 58.3% against a programme average of 71.8%, the widest shortfall of the three, and its weakest weekday sits 22 points below its best. Two lenses reached that independently. The caveat both raised: it rests on four children, so the gap cannot be distinguished from chance yet, and a mentor placed on this alone is a bet rather than a correction.",`
        + `'planJson'=>json_encode(['lenses'=>['mechanism','equity','risk'],'by'=>'router','why'=>'A placement decision comparing centres — mechanism for the cause, equity for the gap, risk because a decision resting on four children is where small samples do damage.','restated'=>'Which centre has the greatest unmet need this period, and is the evidence strong enough to act on?','composed'=>true,'followups'=>['What would make the Alimosho gap testable?','Is the weekday pattern the same at Ayobo?'],'lensesRan'=>[['key'=>'mechanism','label'=>'What is causing this','ok'=>true,'points'=>2,'error'=>''],['key'=>'equity','label'=>'Who is being left behind','ok'=>true,'points'=>2,'error'=>''],['key'=>'risk','label'=>'What this is missing','ok'=>true,'points'=>1,'error'=>'']]]),`
        + `'claimsJson'=>json_encode([['claim'=>'Alimosho is 13.5 points behind the programme average, the widest shortfall of the three centres.','lenses'=>['Who is being left behind','What is causing this'],'evidence'=>'58.3% vs 71.8%','confidence'=>'medium','agreed'=>true],['claim'=>'Its weakest weekday runs 22 points below its best, which points at the timetable rather than at engagement.','lenses'=>['What is causing this'],'evidence'=>'22.2% Mon vs 44.4% Fri','confidence'=>'medium','agreed'=>false],['claim'=>'The gap rests on four children and cannot be told apart from chance yet.','lenses'=>['What this is missing'],'evidence'=>'4 children, 48 child-days','confidence'=>'high','agreed'=>false]]),`
        + `'checksJson'=>json_encode(['grounded'=>true,'answerUnverified'=>[],'claims'=>[],'evidenceNumbers'=>184]),`
        + `'evidenceFp'=>'8f2c41d0a7b39e55','rangeLabel'=>'All weeks','status'=>'ok','error'=>'','providers'=>'groq,anthropic','ms'=>18400,'createdAt'=>now_iso()]);`);

      const ctx = await desktop(adminTok);
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 1180, height: 1500 });
      await goto(page, '/nextadmin', '.admin-shell');
      await page.evaluate(() => window.__adminSection && window.__adminSection('dashboard'));
      await page.waitForSelector('#an-chat', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2600);
      // Open the seeded thread, then the method disclosure under its answer.
      const chip = await page.$('#an-chat .an-chip');
      if (chip) { await chip.click(); await page.waitForTimeout(1600); }
      const how = await page.$('#an-chat button:has-text("How this was produced")');
      if (how) { await how.click(); await page.waitForTimeout(800); }
      /* An element screenshot still paints whatever overlays that box, so any
         fixed-position app chrome lands on the pane and reads as part of it. */
      await page.evaluate(() => {
        document.querySelectorAll('body *').forEach(n => {
          if (getComputedStyle(n).position === 'fixed' && !n.closest('#an-chat')) n.style.display = 'none';
        });
      });
      const pane = await page.$('#an-chat');
      if (pane) {
        const file = path.join(OUT, '23-analyst-chat.png');
        await pane.screenshot({ path: file });
        shots.push({ name: '23-analyst-chat', label: 'Level 7b · the analyst chat — the plan, the claims and the grounding check on the answer', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 23-analyst-chat.png  (' + shots[shots.length - 1].kb + ' KB) — analyst chat');
      }
      await ctx.close();
    }

    // ── 2 · Gate links, incl. Delete on a revoked row ────────────────────────
    {
      const ctx = await desktop(adminTok);
      const page = await ctx.newPage();
      await goto(page, '/nextadmin', '.admin-shell');
      await page.evaluate(() => window.__adminSection && window.__adminSection('registration', 'gates'));
      await page.waitForTimeout(2000);
      await shoot(page, '04-gate-links', 'Gate links · three kinds, Delete only on the revoked row');
      // Full workspace, every level, so its actual depth can be judged.
      await page.evaluate(() => window.__adminSection && window.__adminSection('dashboard'));
      await page.waitForSelector('.an-wrap', { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(3200);
      await shoot(page, '00-analytics-full', 'The whole analytics workspace, all levels');
      // Level 6 on its own — comparison, segments, rigour, narrative.
      await page.evaluate(() => { const el = document.getElementById('an-depth'); if (el) el.scrollIntoView(); });
      await page.waitForTimeout(2600);
      const dep = await page.$('#an-depth');
      if (dep) {
        const file = path.join(OUT, '13-depth.png');
        await dep.screenshot({ path: file });
        shots.push({ name: '13-depth', label: 'Level 6 · comparison, cross-tabs, confidence intervals, findings', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 13-depth.png — Level 6 depth');
      } else console.error('  ✗ #an-depth did not render');
      await ctx.close();
    }

    // ── 3 · Diagnostics, incl. Run now ───────────────────────────────────────
    {
      const ctx = await desktop(adminTok);
      const page = await ctx.newPage();
      await goto(page, '/nextadmin', '.admin-shell');
      await page.evaluate(() => window.__adminSection && window.__adminSection('ops'));
      await page.waitForTimeout(1800);
      await shoot(page, '05-diagnostics-run-now', 'Diagnostics · per-job "Run now" and the stale-cache warning');
      await ctx.close();
    }

    // ── 4 · Programme Journal in the Community ───────────────────────────────
    {
      const ctx = await desktop(adminTok);
      const page = await ctx.newPage();
      await goto(page, '/community', '.cm-app, .cm-sb-item');
      await page.click('.cm-sb-item:has-text("Programme journal")').catch(() => {});
      await page.waitForTimeout(2200);
      await shoot(page, '06-journal-staff', 'Programme journal as STAFF · memories rail, all visibilities');
      // The record itself sits below the memories rails, inside the scroller.
      await page.evaluate(() => {
        const el = document.querySelector('.cm-pj-filters');
        if (el) el.scrollIntoView({ block: 'start' });
      });
      await page.waitForTimeout(900);
      const rec = await page.$('.cm-pj');
      if (rec) {
        const file = path.join(OUT, '06b-journal-entries.png');
        await rec.screenshot({ path: file });
        shots.push({ name: '06b-journal-entries', label: 'The record itself · kinds, status, visibility, people tagged', kb: Math.round(fs.statSync(file).size / 1024) });
        console.log('  ✓ 06b-journal-entries.png — the entry list');
      }
      await ctx.close();
    }
    {
      // The same page as a plain member — staff-only entries are simply absent.
      const ctx = await desktop(memberTok);
      const page = await ctx.newPage();
      await goto(page, '/community', '.cm-app, .cm-sb-item');
      await page.click('.cm-sb-item:has-text("Programme journal")').catch(() => {});
      await page.waitForTimeout(2200);
      await shoot(page, '07-journal-member', 'Same journal as a MEMBER · staff-only entries not present');
      await ctx.close();
    }

    // ── 5 · The public registration form (the bug that started this) ─────────
    {
      const ctx = await phone(null);
      const page = await ctx.newPage();
      await goto(page, '/apply?g=' + GATE_SELF, 'input, select');
      /* The floating ⌘K hint used to land on top of a field's help text here.
         Assert it, rather than only photographing it: a capture run nobody reads
         closely is a poor guard against a float creeping back. */
      const floats = await page.evaluate(() => {
        const bad = [];
        if (!document.body.classList.contains('own-chrome')) bad.push('own-chrome class missing');
        for (const sel of ['.cmdk-hint', '.fab-top']) {
          const el = document.querySelector(sel);
          if (el && getComputedStyle(el).display !== 'none') bad.push(sel + ' is visible');
        }
        return bad;
      });
      if (floats.length) console.error('  ✗ floating helpers overlap the public form: ' + floats.join(', '));
      else console.log('  · no floating helpers over the public form (own-chrome honoured)');
      await shoot(page, '08-public-signup', 'Public sign-up on a phone — the form that would not submit');

      // A refusal now names the fields instead of blaming the connection.
      await page.click('button:has-text("Continue")').catch(() => {});
      await page.waitForTimeout(900);
      await shoot(page, '09-public-signup-errors', 'A refusal names the fields — no more "check your connection"');
      await ctx.close();
    }

    // ── 5a · The closed intake — the screen a family gets after the date ─────
    {
      /* Past its closing date the public link used to say "this link isn't open,
         ask for the current one" — for a link that is correct and an intake that
         is over. This is the screen that replaced it. */
      php(`setting_set('selfreg_closed_note', 'The July intake filled up in four days. September places open next.', 'seed');`
        + `db_update('gate_links', ['expiresAt' => gmdate('Y-m-d\\TH:i:s\\Z', time() - 3600)], ['gateId' => '${GATE_SELF}']);`);
      const ctx = await phone(null);
      const page = await ctx.newPage();
      await goto(page, '/apply?g=' + GATE_SELF, 'h1');
      await shoot(page, '15-signup-closed', 'Sign-ups closed — where to go instead, not a dead end');
      await ctx.close();
      php(`db_update('gate_links', ['expiresAt' => ''], ['gateId' => '${GATE_SELF}']);`
        + `setting_set('selfreg_closed_note', '', 'seed');`);
    }

    // ── 5b · Consent: one tick, one document, publication kept separate ──────
    {
      const ctx = await phone(null);
      const page = await ctx.newPage();
      await goto(page, '/apply?g=' + GATE_SELF, 'input, select');
      const fill = async (key, value) => {
        const input = page.locator(`[data-fieldkey="${key}"]`).first().locator('input, select, textarea').first();
        const tag = await input.evaluate(el => el.tagName).catch(() => '');
        if (tag === 'SELECT') await input.selectOption(value).catch(() => {});
        else if (tag) await input.fill(value).catch(() => {});
      };
      const fac = php(`echo academy_faculties()[0] ?? '';`);
      const crs = php(`$c = academy_courses_for(${JSON.stringify(php(`echo academy_faculties()[0] ?? '';`))});`
        + `echo is_array($c[0] ?? null) ? ($c[0]['name'] ?? '') : (string)($c[0] ?? '');`);
      await fill('firstName', 'Adaeze');
      await fill('lastName', 'Nwankwo');
      await fill('dob', '2013-04-02');
      await fill('centre', 'Alimosho');
      await fill('faculty', fac);
      await fill('course', crs);
      await fill('parentName', 'Mrs Nwankwo');
      await fill('parentPhone', '08031234567');
      await fill('parentEmail', 'n@example.org');
      await page.click('button:has-text("Continue → Photo")').catch(() => {});
      await page.waitForTimeout(600);
      /* A real file through the real picker — headless Chromium has no camera,
         but the file input is the path most families take anyway, and it
         exercises the resampler on the way through. */
      await page.setInputFiles('input[type="file"]', path.join(ROOT, 'assets', 'logo.png')).catch(() => {});
      await page.waitForSelector('button:has-text("Continue → Consent"):not([disabled])', { timeout: 30000 }).catch(() => {});
      await page.click('button:has-text("Continue → Consent")').catch(() => {});
      await page.waitForTimeout(800);
      await shoot(page, '14-selfreg-consent', 'One consent tick, the full document linked, publication a separate free choice');
      await ctx.close();
    }

    // ── 6 · The offline outbox ───────────────────────────────────────────────
    {
      const ctx = await phone(null);
      const page = await ctx.newPage();
      await goto(page, '/apply?g=' + GATE_SELF, 'input');
      await ctx.setOffline(true);
      await page.evaluate(async (g) => {
        try {
          await window.outbox.intake('selfreg.submit', {
            gate: g,
            consent: true,
            data: { firstName: 'Adaeze', lastName: 'Nwankwo', dob: '2013-04-02', centre: 'Alimosho',
                    parentName: 'Mrs Nwankwo', parentPhone: '08031234567', parentEmail: 'n@example.org' },
            photo: 'data:image/png;base64,iVBORw0KGgoAAAANS',
          }, 'shot_draft');
        } catch (_) {}
      }, GATE_SELF);
      await page.waitForTimeout(1200);
      await shoot(page, '10-outbox-queued', 'Offline: banked on the device, and the banner says so');
      await ctx.close();
    }

    // ── 7 · A shared journal entry, as an outsider sees it ───────────────────
    {
      const tok = php(`$r = journal_share(['requesterId'=>'NGG-2026-0001','entryId'=>'PJ-2026-0004']); echo $r['shareToken'] ?? '';`);
      if (tok) {
        const ctx = await phone(null);
        const page = await ctx.newPage();
        await goto(page, '/journal-entry?t=' + tok, 'h1');
        await shoot(page, '11-journal-shared', 'A shared entry (public visibility) — revocable link');

        // Narrow it and reload: every link already sent stops working.
        php(`journal_visibility_set(['requesterId'=>'NGG-2026-0001','entryId'=>'PJ-2026-0004','visibility'=>'staff']);`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForBoot(page);
        await page.waitForTimeout(1200);
        await shoot(page, '12-journal-share-revoked', 'Narrowed to staff — the same link no longer opens');
        await ctx.close();
      }
    }
  } catch (e) {
    console.error('capture failed: ' + (e && e.stack ? e.stack : String(e)));
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
  }

  writeScreenIndex(OUT, shots);
  console.log(`\n${shots.length} screenshot(s) in docs/screens/`);
})().catch((e) => { cleanup(); console.error(e); process.exit(1); });
