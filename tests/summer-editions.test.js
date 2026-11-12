#!/usr/bin/env node
/* ============================================================================
   Summer School editions and groups — the whole flow, against a real backend.

   An edition is one season; a group is a class inside it. Before this there was
   only the season: participants were one flat list filtered by centre and
   track, so two Music classes at one centre could not be expressed, no register
   could be handed to a named lead, and the smallest attendance number that
   existed was a centre-wide average.

   What this drives, through the actual Control Room UI against a real PHP +
   SQLite stack (no stubbed API — the point is that the ops, the route, the
   client and the screen agree):

     · Summer School is ONE section, and the retired /registration and /qr
       section ids still land inside it rather than on the Overview
     · creating an edition, and the date rules refusing before a round trip
     · the one-live-edition invariant, and that making another live CLOSES the
       previous one rather than claiming it was archived
     · creating a group, with a code derived from its centre and course
     · assigning participants in bulk, PARTIALLY: a group with two seats takes
       two of four and the screen says who did not fit
     · the "not in a group" count, which is what says whether the grouping work
       has actually been done
     · the per-group report showing a dash for a group that has not met, not 0%

   Self-contained: throwaway api/config.php (SQLite temp), seeded fixtures, PHP
   built-in server, Chromium, then everything cleaned up. NEVER overwrites an
   existing config.php.

   Run:  node tests/summer-editions.test.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, SUMED_PORT (default 8263).
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.SUMED_PORT || '8263';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-sumed-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-sumed-cache-${process.pid}`);
const ADMIN = 'NGG-SUMED-ADM';

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-sumed-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}
/** Mint a real admin session the app's own way, with 2FA already satisfied. */
function mintSession() {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/session.php')};`
    + `echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`;
  const f = path.join(os.tmpdir(), `ngg-sumed-sess-${process.pid}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
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
  try { fs.unlinkSync(DB); } catch (_) {}
  try { fs.rmSync(CACHE, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const ok = (m) => { passed++; console.log('  ✓ ' + m); };
const bad = (m) => { failed++; console.error('  ✗ FAIL: ' + m); };
const chk = (m, cond) => cond ? ok(m) : bad(m);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  summer editions: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }

  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'sumed_test_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'debug' => false,
  ];\n`);

  try {
    /* Seed: a super admin, two centres, one edition already live, and four
       participants with no group — the state a coordinator actually starts a
       season in. */
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Sumed Admin','email'=>'sumed@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Ijaiye','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-IJ','name'=>'Ijaiye','code'=>'IJ','color'=>'#76B043','status'=>'active','capacity'=>0,'createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-EG','name'=>'Egbeda','code'=>'EG','color'=>'#3B5BDB','status'=>'active','capacity'=>0,'createdAt'=>now_iso()]);`
      + `db_insert('summer_cohorts', ['cohortId'=>'SUM-2026','code'=>'SS26','name'=>'Summer School 2026','year'=>2026,'status'=>'active','startDate'=>'2026-07-06','endDate'=>'2026-08-14','createdAt'=>now_iso()]);`
      + [1, 2, 3, 4].map(i =>
          `db_insert('summer_students', ['studentId'=>'SUM-P${i}','cohortId'=>'SUM-2026','token'=>'SUMQR-P${i}','handle'=>'p${i}','fullName'=>'Participant ${i}','age'=>12,'centre'=>'Ijaiye','track'=>'Piano','status'=>'active','regStatus'=>'verified','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`
        ).join(''));

    const tok = mintSession();
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 220)));

    await page.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
    await waitForBoot(page);
    await page.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });

    const go = async (section) => {
      await page.evaluate(s => window.__adminSection(s), section);
      await page.waitForTimeout(900);
    };
    const bodyText = () => page.evaluate(() => (document.querySelector('#cr-main') || document.body).innerText);

    // ── One Summer School door ───────────────────────────────────────────
    console.log('\n── One door, and the retired ids still find it ──────────────');
    await go('summer');
    let t = await bodyText();
    chk('the Summer School section opens on Editions & groups', /Editions & groups/.test(t) && /Summer School 2026/.test(t));
    chk('…and names the four panel groups rather than one flat strip of tabs',
      /structure/i.test(t) && /intake/i.test(t) && /running/i.test(t) && /records/i.test(t));
    chk('…including the panels only the Control Room used to have',
      /Academy catalogue/.test(t) && /Bulk import/.test(t) && /Certificates/.test(t));
    chk('…and the ones only the coordinator portal used to have',
      /Roster/.test(t) && /Check-in kiosk/.test(t) && /Enrol at the desk/.test(t));

    /* The retired ids forward to the Summer School portal's panels (CR_ALIASES in cr-pages.jsx:
       registration → summer-admin ▸ gates, qr → summer-admin ▸ qr) — a bookmark lands, it does not 404. */
    const back = async () => {
      await page.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
    };
    const here = () => page.evaluate(() => location.pathname + location.search);
    await go('registration');
    let at = await here();
    chk('the retired "registration" section id lands in Summer School, on its sign-up links (' + at + ')', /^\/summer-admin\b/.test(at) && /panel=gates/.test(at));
    await back();
    await go('qr');
    at = await here();
    chk('…and "qr" lands on its QR panel (' + at + ')', /^\/summer-admin\b/.test(at) && /panel=qr/.test(at));
    await back();

    // ── The centre directory moved out of Summer School ──────────────────
    console.log('\n── A centre is an NGG place, not a Summer School record ─────');
    await go('centres');
    t = await bodyText();
    chk('Centres is its own section under People', /Centres/.test(t));
    chk('…and reports the two programmes separately', /ngg members/i.test(t) && /summer school/i.test(t));
    chk('…saying plainly that the code is the printed ID prefix', /printed ID prefix/i.test(t));

    // ── Editions ─────────────────────────────────────────────────────────
    console.log('\n── Creating an edition ──────────────────────────────────────');
    await go('summer');
    try {
      await page.waitForSelector('#cr-main button:has-text("+ New edition")', { timeout: 30000 });
    } catch (_) {
      console.error('      panel was: ' + (await bodyText()).slice(0, 2500).replace(/\n+/g, ' | '));
      throw new Error('the Editions panel never offered "+ New edition"');
    }
    await page.click('#cr-main button:has-text("+ New edition")');
    await page.waitForSelector('.admin-drawer-panel', { timeout: 10000 });
    const setField = async (label, value) => {
      await page.evaluate(({ label, value }) => {
        const wraps = Array.from(document.querySelectorAll('.admin-drawer-panel .admin-field'));
        for (const w of wraps) {
          const t = (w.querySelector('span') || {}).textContent || '';
          if (t.trim().toLowerCase().indexOf(label.toLowerCase()) !== 0) continue;
          const el = w.querySelector('input, select, textarea');
          if (!el) continue;
          const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, { label, value });
    };
    await setField('Name', 'Summer School 2027');
    await setField('Year', '2027');
    await setField('Starts', '2027-07-05');
    await setField('Ends', '2027-06-01');   // deliberately inverted
    await page.waitForTimeout(300);
    t = await page.evaluate(() => document.querySelector('.admin-drawer-panel').innerText);
    chk('an end date before the start is refused on the spot, before a round trip',
      /end date is before the start/i.test(t));
    chk('…and the Save button is disabled while it is wrong',
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('.admin-drawer-panel button')).filter(x => /Create edition/.test(x.textContent))[0];
        return !!b && b.disabled;
      }));
    await setField('Ends', '2027-08-13');
    await page.waitForTimeout(300);
    await page.click('.admin-drawer-panel button:has-text("Create edition")');
    await page.waitForTimeout(1400);
    chk('the edition is created', php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_cohorts WHERE cohortId='SUM-2027'")['c'];`) === '1');
    chk('…in Planning, so it is not accidentally taking anyone yet',
      php(`echo (string) db_row("SELECT status FROM summer_cohorts WHERE cohortId='SUM-2027'")['status'];`) === 'planning');
    // The drawer closes and the table refetches; wait for the row rather than
    // for a fixed number of milliseconds.
    await page.waitForFunction(() => /Summer School 2027/.test(document.querySelector('#cr-main').innerText),
      null, { timeout: 15000 }).catch(() => {});
    t = await bodyText();
    chk('…and appears in the table with its state', /Summer School 2027/.test(t) && /planning/i.test(t));

    console.log('\n── Exactly one edition is live ──────────────────────────────');
    // "Make live" on the 2027 row.
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#cr-main tbody tr'));
      for (const r of rows) {
        if (!/Summer School 2027/.test(r.innerText)) continue;
        const b = Array.from(r.querySelectorAll('button')).filter(x => /Make live/.test(x.textContent))[0];
        if (b) { b.click(); return; }
      }
    });
    await page.waitForSelector('.dialog-card, .ngg-dialog, [role="dialog"]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).filter(x => /Make it live/.test(x.textContent))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(1500);
    chk('the new edition is live', php(`echo (string) db_row("SELECT status FROM summer_cohorts WHERE cohortId='SUM-2027'")['status'];`) === 'active');
    chk('…and the previous one is CLOSED, not "archived" — nothing was rolled up',
      php(`echo (string) db_row("SELECT status FROM summer_cohorts WHERE cohortId='SUM-2026'")['status'];`) === 'closed');
    chk('…so exactly one edition is live',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_cohorts WHERE status='active'")['c'];`) === '1');

    // Put 2026 back in charge — its participants are the ones we group below.
    php(`db_exec("UPDATE summer_cohorts SET status='closed' WHERE cohortId='SUM-2027'");`
      + `db_exec("UPDATE summer_cohorts SET status='active' WHERE cohortId='SUM-2026'");`);

    // ── Groups ───────────────────────────────────────────────────────────
    console.log('\n── Groups inside an edition ─────────────────────────────────');
    await go('summer');
    await page.waitForTimeout(600);
    // Open the 2026 edition's groups.
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#cr-main tbody tr'));
      for (const r of rows) {
        if (!/Summer School 2026/.test(r.innerText)) continue;
        const b = Array.from(r.querySelectorAll('button')).filter(x => /^Groups$/.test(x.textContent.trim()))[0];
        if (b) { b.click(); return; }
      }
    });
    await page.waitForTimeout(1200);
    t = await bodyText();
    chk('an edition with no groups says so, and says what a group IS',
      /No groups in this edition yet/.test(t) && /a centre, a course, a lead and a capacity/i.test(t));
    chk('…and counts the participants waiting to be placed', /4 participants are waiting/.test(t));

    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('#cr-main button')).filter(x => /\+ New group/.test(x.textContent))[0];
      if (b) b.click();
    });
    await page.waitForSelector('.admin-drawer-panel', { timeout: 10000 });
    await setField('Centre', 'CTR-IJ');
    await page.waitForTimeout(200);
    /* Academy first, then course — the course list is scoped to the academy, so
       picking a course before an academy is deliberately impossible. */
    await setField('Academy', 'Music');
    await page.waitForTimeout(250);
    await setField('Course', 'Piano');
    await page.waitForTimeout(200);
    await setField('Group name', 'Ijaiye · Piano · Morning');
    await setField('Capacity', '2');
    // Two meeting days, through the real checkboxes.
    await page.evaluate(() => {
      const days = Array.from(document.querySelectorAll('.admin-daypick-day'));
      days.filter(d => /Mon|Wed/.test(d.textContent)).forEach(d => d.querySelector('input').click());
    });
    await page.waitForTimeout(200);
    await page.click('.admin-drawer-panel button:has-text("Create group")');
    await page.waitForTimeout(1500);
    const gRow = php(`$g = db_row("SELECT * FROM summer_groups WHERE cohortId='SUM-2026' LIMIT 1"); echo json_encode($g ?: []);`);
    const g = JSON.parse(gRow);
    chk('the group is created against the right edition', g.cohortId === 'SUM-2026');
    chk('…with a code derived from the centre and course (' + g.code + ')', g.code === 'IJ-PIA');
    chk('…and the meeting days stored as weekday numbers (' + g.meetDays + ')', g.meetDays === '1,3');
    chk('…and the capacity it was given', String(g.capacity) === '2');

    // ── Assignment: partial by design ────────────────────────────────────
    console.log('\n── Filling it: two seats, four children ─────────────────────');
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('#cr-main button')).filter(x => /^Participants$/.test(x.textContent.trim()))[0];
      if (b) b.click();
    });
    await page.waitForSelector('.admin-drawer-panel', { timeout: 10000 });
    await page.waitForTimeout(1200);
    t = await page.evaluate(() => document.querySelector('.admin-drawer-panel').innerText);
    chk('the drawer says how many seats are left', /2 seats left/.test(t));
    chk('…and lists everybody in the edition who is in no group', /Not in any group/.test(t) && /Participant 1/.test(t));

    // Tick all four, then add.
    await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.admin-drawer-panel .admin-bulk-all input[type=checkbox]'));
      if (boxes.length) boxes[boxes.length - 1].click();
    });
    await page.waitForTimeout(300);
    t = await page.evaluate(() => document.querySelector('.admin-drawer-panel').innerText);
    chk('selecting all four offers to add four', /Add 4 to this group/.test(t));
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.admin-drawer-panel button')).filter(x => /Add 4 to this group/.test(x.textContent))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(500);
    t = await page.evaluate(() => document.body.innerText);
    chk('the confirm warns that only two will fit, and that the rest are not lost',
      /2 seats? left/.test(t) && /rest left in the ungrouped list/i.test(t));
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).filter(x => /^Add 4$/.test(x.textContent.trim()))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(1800);
    const inGroup = parseInt(php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId='${g.groupId}'")['c'];`), 10);
    chk('exactly two were placed — the cap is a refusal, not a warning', inGroup === 2);
    chk('…and the other two are still in the edition, ungrouped',
      parseInt(php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId='SUM-2026' AND (groupId IS NULL OR groupId='')")['c'];`), 10) === 2);
    t = await page.evaluate(() => document.body.innerText);
    chk('…and the screen says so rather than reporting a clean success',
      /2 placed/.test(t) && /not \(/.test(t));

    // Close the drawer and check the counters.
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.admin-drawer-panel button')).filter(x => /^Done$/.test(x.textContent.trim()))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(1500);
    t = await bodyText();
    chk('the group row shows it full at 2/2', /2\/2/.test(t));
    chk('the edition row flags the two who are in no group', /2 not in a group/.test(t));

    // ── The report ───────────────────────────────────────────────────────
    console.log('\n── The per-group report ─────────────────────────────────────');
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.admin-panelnav button')).filter(x => /Group report/.test(x.textContent))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(1600);
    t = await bodyText();
    chk('the report lists the group', /Ijaiye · Piano · Morning/.test(t));
    chk('…and says out loud that a class that has not started is not failing',
      /not met yet shows a dash rather than 0%/i.test(t));
    const rate = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#cr-main tbody tr'));
      for (const r of rows) if (/Ijaiye · Piano/.test(r.innerText)) return r.cells[5].innerText.trim();
      return '';
    });
    chk('…so a group with no sessions reports "—", not 0% (' + JSON.stringify(rate) + ')', rate === '—');

    chk('no uncaught page errors across the whole run', errs.length === 0);
    if (errs.length) errs.slice(0, 5).forEach(e => console.error('      ' + e));
  } catch (e) {
    bad('harness — ' + (e && e.message ? e.message : e));
    if (e && e.stack) console.error(String(e.stack).split('\n').slice(0, 4).join('\n'));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }

  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (summer editions & groups)');
  process.exit(failed ? 1 : 0);
})();
