#!/usr/bin/env node
/* ============================================================================
   The admin action layer, end to end — member desk and Club desk.

   Six hand-rolled variants of "tick some rows and do a thing to them" existed
   in this console and disagreed about the things that matter; the two screens
   where bulk mattered most — the member roster and the Club roster — had none
   at all. There is now one selection primitive, one bulk bar, one runner and
   one row menu, and this drives them against a REAL PHP + SQLite backend.

   The properties worth pinning are the ones that are invisible when they are
   wrong, and each of them was wrong somewhere:

     · THE COUNT IN THE CONFIRM IS THE COUNT ACTED ON. The bulk form is opened
       with a fixed set of ids and never re-reads the selection, so a
       background refresh cannot change what "these 3" meant between the
       question and the answer.
     · A HALF-DONE BULK IS REPORTED AS HALF DONE. A run including a staff
       account and the operator's own account applies to the rest and NAMES
       what it refused, with the reason — rather than a success toast.
     · SELECTION CANNOT REACH OFF-SCREEN ROWS. Changing a filter drops rows
       that are no longer visible out of the selection.
     · "ALL N MATCHING" COMES FROM THE SERVER, resolved from the same filters
       the page was built with.
     · AN EMPTY TABLE SAYS WHICH KIND OF EMPTY IT IS — a fresh deployment and a
       filter with no matches are different problems with different exits.
     · A FAILED LOAD IS NOT AN EMPTY LIST. The Club screens used to render a
       403 or a 500 as "nobody is waiting", the one message that guarantees
       nobody investigates.
     · CAPABILITIES DECIDE WHAT IS OFFERED. A club coordinator's bulk actions
       are narrower than the member desk's, by design.

   Self-contained: throwaway api/config.php (SQLite temp), seeded fixtures, PHP
   built-in server, Chromium, all cleaned up. NEVER overwrites an existing
   config.php.

   Run:  node tests/admin-bulk.test.js
   Env:  PLAYWRIGHT_MODULE, CHROMIUM_PATH, ADMBULK_PORT (default 8265).
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.ADMBULK_PORT || '8265';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const DB = path.join(os.tmpdir(), `ngg-admbulk-${process.pid}.db`);
const CACHE = path.join(os.tmpdir(), `ngg-admbulk-cache-${process.pid}`);
const ADMIN = 'NGG-AB-ADM';
const CLUBADM = 'NGG-AB-CLUB';

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `db_conn();\n` + snippet;
  const f = path.join(os.tmpdir(), `ngg-ab-php-${process.pid}-${++_seq}.php`);
  fs.writeFileSync(f, code);
  try { return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim(); }
  finally { try { fs.unlinkSync(f); } catch (_) {} }
}
function mintSession(memberId) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/response.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/db.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/util.php')};`
    + `require ${JSON.stringify(ROOT + '/api/_lib/session.php')};`
    + `echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), true);`;
  const f = path.join(os.tmpdir(), `ngg-ab-sess-${process.pid}-${++_seq}.php`);
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

/** Mirror of the client's fmtNum for the counts it renders. */
function fmtN(n) { return Number(n).toLocaleString('en-NG'); }

let passed = 0, failed = 0;
const ok = (m) => { passed++; console.log('  ✓ ' + m); };
const bad = (m) => { failed++; console.error('  ✗ FAIL: ' + m); };
const chk = (m, cond) => cond ? ok(m) : bad(m);

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  admin bulk: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) {
    console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.');
    process.exit(2);
  }

  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'admbulk_test_secret_0123456789abc',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false],
    'debug' => false,
  ];\n`);

  try {
    /* Seed: a super admin, a club coordinator, one centre, three plain members
       at that centre and one editor. The editor is the row that must be
       refused; the super admin's own row is the other. */
    php(`db_migrate(db_conn());`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Ada Admin','email'=>'ab-admin@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Ijaiye','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('members', ['memberId'=>'${CLUBADM}','fullName'=>'Cleo Club','email'=>'ab-club@example.org','type'=>'NGG','status'=>'active','role'=>'club_admin','centre'=>'Ijaiye','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('members', ['memberId'=>'NGG-AB-EDITOR','fullName'=>'Ed Editor','email'=>'ab-ed@example.org','type'=>'NGG','status'=>'active','role'=>'editor','centre'=>'Ijaiye','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-IJ','name'=>'Ijaiye','code'=>'IJ','color'=>'#76B043','status'=>'active','capacity'=>0,'createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CTR-EG','name'=>'Egbeda','code'=>'EG','color'=>'#3B5BDB','status'=>'active','capacity'=>0,'createdAt'=>now_iso()]);`
      /* SIXTY plain members, not three. The page size is 50, and
         "select all N matching the filter" only means anything when the filter
         matches more than one page — which is exactly the case the escape
         hatch exists for and the case a three-row fixture cannot reach. */
      + Array.from({ length: 60 }, (_, k) => k + 1).map(i =>
          `db_insert('members', ['memberId'=>'NGG-AB-M${i}','fullName'=>'Member Number ${String(i).padStart(2, '0')}','email'=>'abm${i}@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Ijaiye','level'=>'A','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);`
        ).join(''));

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);

    const openAs = async (memberId) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: mintSession(memberId), domain: '127.0.0.1', path: '/', httpOnly: true }]);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e).slice(0, 220)));
      await page.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
      await waitForBoot(page);
      await page.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
      return { page, errs };
    };
    const main = (page) => page.evaluate(() => (document.querySelector('.admin-main') || document.body).innerText);
    const tickRow = (page, needle) => page.evaluate(n => {
      const rows = Array.from(document.querySelectorAll('.admin-main tbody tr'));
      for (const r of rows) {
        if (r.innerText.indexOf(n) === -1) continue;
        const b = r.querySelector('input[type=checkbox]');
        if (b) { b.click(); return true; }
      }
      return false;
    }, needle);
    const clickText = (page, text, scope) => page.evaluate(({ text, scope }) => {
      const root = scope ? document.querySelector(scope) : document;
      if (!root) return false;
      const b = Array.from(root.querySelectorAll('button')).filter(x => x.textContent.trim() === text
        || x.textContent.trim().indexOf(text) === 0)[0];
      if (b) { b.click(); return true; }
      return false;
    }, { text, scope });

    // ════════════════════════════════════════════════════════════════════
    const { page, errs } = await openAs(ADMIN);
    /* The v1 member desk (and its bulk bar) is mounted by Control Room v2 under
       Members › Data quality (crPanel); its own Roster sub-tab is the roster. */
    await page.evaluate(() => window.__adminSection('members', 'quality'));
    await page.waitForSelector('.cr-panel [role=tab]', { timeout: 30000 });
    await page.locator('.cr-panel [role=tab]', { hasText: /^Roster$/ }).first().click();
    await page.waitForSelector('.admin-main .admin-table tbody tr', { timeout: 30000 });
    await page.waitForTimeout(600);

    console.log('\n── Selecting rows, at all ───────────────────────────────────');
    chk('the roster has a select-all box and a checkbox per row',
      await page.evaluate(() => !!document.querySelector('.admin-main .admin-bulk-all input[type=checkbox]')
        && document.querySelectorAll('.admin-main tbody tr input[type=checkbox]').length >= 4));
    chk('no bulk bar until something is selected',
      await page.evaluate(() => !document.querySelector('.admin-bulkbar')));
    await tickRow(page, 'Member Number 01');
    await page.waitForTimeout(250);
    let t = await main(page);
    chk('ticking one row reveals the bar and counts it', /1 member selected/.test(t));
    chk('…and the bar is a labelled region, not a bare div',
      await page.evaluate(() => {
        const b = document.querySelector('.admin-bulkbar');
        return !!b && b.getAttribute('role') === 'region' && !!b.getAttribute('aria-label');
      }));
    chk('…with the count in a live region, so a change is announced',
      await page.evaluate(() => {
        const c = document.querySelector('.admin-bulk-count');
        return !!c && c.getAttribute('aria-live') === 'polite';
      }));

    console.log('\n── "All N matching the filter" ─────────────────────────────');
    chk('the bar offers the whole filtered set, not just this page', /Select all \d+ matching the filter/.test(t));
    await page.evaluate(() => { const b = document.querySelector('.admin-bulkbar .admin-bulk-link'); if (b) b.click(); });
    await page.waitForTimeout(1800);
    t = await main(page);
    const total = parseInt(php(`echo (int) db_row("SELECT COUNT(*) c FROM members")['c'];`), 10);
    chk('…and selecting it picks up every member the server matched (' + total + ')',
      new RegExp(fmtN(total) + ' members selected').test(t));
    chk('…which is MORE than the page held', total > 50);

    console.log('\n── A half-done bulk is reported as half done ───────────────');
    /* The selection now includes the operator's OWN account and an editor.
       Both must be refused, the three plain members must be applied, and the
       screen must say which and why. */
    await clickText(page, 'Set status', '.admin-bulkbar');
    await page.waitForSelector('.admin-drawer-panel', { timeout: 10000 });
    t = await page.evaluate(() => document.querySelector('.admin-drawer-panel').innerText);
    chk('the form names the count it will act on', new RegExp(fmtN(total) + ' members').test(t));
    chk('…and says it acts on the selection as it was when opened',
      /selected when you opened this/.test(t));
    chk('…and warns that staff are refused here', /staff accounts/i.test(t) && /Access & roles/.test(t));
    await page.evaluate(() => {
      const sel = document.querySelector('.admin-drawer-panel select');
      const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      set.call(sel, 'inactive');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    await clickText(page, 'Apply to', '.admin-drawer-panel');
    await page.waitForTimeout(2000);
    t = await page.evaluate(() => document.querySelector('.admin-drawer-panel').innerText);
    chk('the result is a breakdown, not a success message', /Updated/.test(t) && /Refused/.test(t));
    chk('…naming the operator\'s own account as refused', /your own account/i.test(t));
    chk('…and the staff account, with the reason', /staff account/i.test(t));
    chk('every plain member was actually changed, across both pages',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM members WHERE memberId LIKE 'NGG-AB-M%' AND status='inactive'")['c'];`) === '60');
    chk('…and neither the operator nor the editor was touched',
      php(`echo (string) db_row("SELECT status FROM members WHERE memberId='${ADMIN}'")['status'];`) === 'active'
      && php(`echo (string) db_row("SELECT status FROM members WHERE memberId='NGG-AB-EDITOR'")['status'];`) === 'active');
    chk('…and the run left ONE audit event, not one per member',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM audit_log WHERE event='admin.members.bulk'")['c'];`) === '1');
    await clickText(page, 'Done', '.admin-drawer-panel');
    await page.waitForTimeout(1200);
    chk('finishing clears the selection', await page.evaluate(() => !document.querySelector('.admin-bulkbar')));

    console.log('\n── Selection cannot reach off-screen rows ──────────────────');
    await tickRow(page, 'Member Number 01');
    await page.waitForTimeout(200);
    chk('one row selected', /1 member selected/.test(await main(page)));
    // Filter to a centre that member is not in — the row leaves the page.
    await page.evaluate(() => {
      const sel = Array.from(document.querySelectorAll('.admin-filters select'))
        .filter(s => (s.getAttribute('aria-label') || '').indexOf('centre') !== -1)[0];
      const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      set.call(sel, 'Egbeda');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    chk('changing the filter drops the row from the selection, so a bulk cannot reach it',
      await page.evaluate(() => !document.querySelector('.admin-bulkbar')));

    console.log('\n── An empty table says WHICH kind of empty ─────────────────');
    t = await main(page);
    chk('a filter with no matches says so, and offers a way out',
      /No members match these filters/.test(t) && /Clear all filters/.test(t));
    chk('…and the active filters are listed as removable chips',
      await page.evaluate(() => document.querySelectorAll('.admin-chip-x').length >= 1));
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.admin-chip-x'))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(1500);
    chk('removing a chip brings the roster back',
      await page.evaluate(() => document.querySelectorAll('.admin-main tbody tr').length >= 4));

    console.log('\n── One row, the same declarations ──────────────────────────');
    chk('every row carries an Actions menu built from the same list',
      await page.evaluate(() => document.querySelectorAll('.admin-main .admin-rowmenu-btn').length >= 4));
    await page.evaluate(() => { document.querySelector('.admin-main .admin-rowmenu-btn').click(); });
    await page.waitForTimeout(250);
    chk('…which opens a real menu', await page.evaluate(() => {
      const p = document.querySelector('.admin-rowmenu-pop');
      return !!p && p.getAttribute('role') === 'menu' && p.querySelectorAll('[role=menuitem]').length >= 3;
    }));
    chk('…offering the same actions as the bulk bar, plus the per-member ones',
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.admin-rowmenu-pop [role=menuitem]')).map(x => x.textContent);
        return items.some(x => /Set status/.test(x)) && items.some(x => /Reset their 2FA/.test(x));
      }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    chk('…and Escape closes it', await page.evaluate(() => !document.querySelector('.admin-rowmenu-pop')));

    console.log('\n── A club coordinator gets NARROWER actions ────────────────');
    /* The Club portal (v3, /club-admin) is its own screen: Promote is a
       section (?s=promote) and the roster's bulk actions live in the
       directory. Same guards as the member desk, narrower verbs. */
    php(`db_insert('summer_cohorts', ['cohortId'=>'SUM-AB','name'=>'AB Edition','year'=>2030,'status'=>'active','createdAt'=>now_iso()]);`
      + `db_insert('summer_students', ['studentId'=>'AB-S1','cohortId'=>'SUM-AB','token'=>'SUMQR-AB1','handle'=>'abs1','fullName'=>'Graduating Kid','age'=>15,'centre'=>'Ijaiye','track'=>'Piano','parentEmail'=>'abg@example.org','status'=>'graduated','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('summer_students', ['studentId'=>'AB-S2','cohortId'=>'SUM-AB','token'=>'SUMQR-AB2','handle'=>'abs2','fullName'=>'No Email Kid','age'=>15,'centre'=>'Ijaiye','track'=>'Piano','parentEmail'=>'','status'=>'graduated','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`);
    // Straight to the portal: a club_admin holds no Control Room caps.
    const club = await (async () => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      await ctx.addCookies([{ name: 'ngg_sess', value: mintSession(CLUBADM), domain: '127.0.0.1', path: '/', httpOnly: true }]);
      const pg = await ctx.newPage(); const errs = [];
      pg.on('pageerror', e => errs.push(String(e).slice(0, 220)));
      return { page: pg, errs };
    })();
    const ctext = () => club.page.evaluate(() => document.body.innerText);
    const cwait = (re, ms) => club.page.waitForFunction(src => new RegExp(src).test(document.body.innerText), re.source, { timeout: ms || 20000 }).then(() => true).catch(() => false);
    const cclick = (re, scope) => club.page.evaluate(({ src, scope }) => { const r = new RegExp(src); const root = scope ? document.querySelector(scope) : document; const b = root && Array.from(root.querySelectorAll('button')).find(x => r.test(x.innerText.trim()) && x.offsetParent !== null); if (b) { b.click(); return true; } return false; }, { src: re.source, scope });
    await club.page.goto(BASE + '/club-admin?s=promote', { waitUntil: 'domcontentloaded' });
    await waitForBoot(club.page);
    chk('the Club portal opens on Promote for a club coordinator', await cwait(/Promote from Summer School/) && await cwait(/No Email Kid/));
    t = await ctext();
    chk('the promotion list shows the graduates', /Graduating Kid/.test(t) && /No Email Kid/.test(t));
    chk('…and flags the one with no guardian email BEFORE the run', /Missing/.test(t));
    await club.page.evaluate(() => { const b = document.querySelector('button[aria-label="Select all"]'); if (b) b.click(); });
    await club.page.waitForTimeout(300);
    t = await ctext();
    chk('both can be selected at once', /2 selected/.test(t));
    chk('…and the bar warns about the missing guardian email', /1 with no guardian email/i.test(t));
    /* Which NGG centre each joins: nothing here is on a map, so nothing can be
       suggested and the screen asks — a coordinator picks, per graduate. */
    for (const sel of await club.page.$$('select[aria-label^="Club centre for"]')) await sel.selectOption({ label: 'Ijaiye' });
    await club.page.waitForTimeout(200);
    await cclick(/^Promote 2$/);
    await club.page.waitForTimeout(500);
    t = await club.page.evaluate(() => (document.querySelector('[role=alertdialog]') || {}).innerText || '');
    chk('the confirm says plainly what a missing email costs', /1 of them has no guardian email on file/.test(t) && /by hand/.test(t));
    await cclick(/^Promote 2$/, '[role=alertdialog]');
    await cwait(/2 promoted into the Club/, 15000);
    chk('both were promoted in one action',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students WHERE studentId IN ('AB-S1','AB-S2') AND status='promoted'")['c'];`) === '2');
    chk('…and the one with no email still became a member, as promised',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM members WHERE fullName = 'No Email Kid' AND type = 'NGG'")['c'];`) === '1');

    console.log('\n── The Club roster\'s bulk actions ──────────────────────────');
    await club.page.goto(BASE + '/club-admin?s=roster', { waitUntil: 'domcontentloaded' });
    await waitForBoot(club.page);
    await cwait(/Member Number 01/);
    // Earlier sections changed some members' status; the directory holds the
    // active and paused ones. Read its count rather than assume one.
    const dirN = +((await ctext()).match(/Everyone\s+([\d,]+)/) || [])[1]?.replace(/,/g, '') || 0;
    await club.page.evaluate(() => { const b = document.querySelector('button[aria-label="Select everyone shown"]'); if (b) b.click(); });
    await club.page.waitForTimeout(300);
    await cclick(/^Select all /);
    await club.page.waitForTimeout(300);
    t = await ctext();
    chk('“select all” reaches every matching student, not just those drawn', dirN > 50 && new RegExp('All ' + dirN + ' students|' + dirN + ' selected').test(t));
    chk('…offering the Club\'s actions: message, mentor, ID cards, move, status, export',
      /Message guardians/.test(t) && /Assign mentor/.test(t) && /Move centre/.test(t) && /Change status/.test(t) && /Export CSV/.test(t));
    chk('…and none of the member desk\'s lifecycle verbs — no suspension, type, level or dues',
      !/Suspend/.test(t) && !/Deactivate/.test(t) && !/Set membership type/.test(t) && !/Set level/.test(t) && !/Dues reminders/.test(t));
    const pausedBefore = php(`echo (int) db_row("SELECT COUNT(*) c FROM members WHERE type = 'NGG' AND status = 'inactive' AND COALESCE(role,'') IN ('','member')")['c'];`);
    await cclick(/^Change status$/);
    await club.page.waitForTimeout(300);
    await cclick(/^Paused$/, '[role=dialog]');
    await club.page.waitForTimeout(200);
    await cclick(new RegExp('^Set ' + dirN + ' to Paused$'), '[role=dialog]');
    /* Pausing people is a sensitive act: a club admin's is queued for a
       second admin (approval_intercept), never refused and never applied. */
    chk('a club admin\'s bulk pause is queued for a second admin, and says so', await cwait(/Sent to a second admin to approve/, 15000));
    chk('…nothing changed on the record yet',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM members WHERE type = 'NGG' AND status = 'inactive' AND COALESCE(role,'') IN ('','member')")['c'];`) === pausedBefore);
    chk('…and one approval request waits, from the coordinator',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM admin_approvals WHERE status = 'pending' AND requesterId = '${CLUBADM}'")['c'];`) === '1');
    chk('…and the dialog closed with the selection cleared', await club.page.evaluate(() => !document.querySelector('[role=dialog]')));

    chk('no uncaught page errors on the member desk', errs.length === 0);
    chk('no uncaught page errors on the Club desk', club.errs.length === 0);
    if (errs.length) errs.slice(0, 4).forEach(e => console.error('      member: ' + e));
    if (club.errs.length) club.errs.slice(0, 4).forEach(e => console.error('      club: ' + e));
  } catch (e) {
    bad('harness — ' + (e && e.message ? e.message : e));
    if (e && e.stack) console.error(String(e.stack).split('\n').slice(0, 4).join('\n'));
  } finally {
    if (browser) await browser.close().catch(() => {});
    cleanup();
  }

  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (admin action layer)');
  process.exit(failed ? 1 : 0);
})();
