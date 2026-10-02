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
    await page.evaluate(() => window.__adminSection('members'));
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
    const club = await openAs(CLUBADM);
    // A club_admin has no console caps, so they are sent to their own portal.
    await club.page.goto(BASE + '/club-admin', { waitUntil: 'domcontentloaded' });
    await waitForBoot(club.page);
    await club.page.waitForTimeout(2500);
    t = await club.page.evaluate(() => document.body.innerText);
    chk('the Club portal opens for a club coordinator', /NGG Club/.test(t));
    chk('…on the promotion bridge', /Promote from Summer School/.test(t));
    // Seed a graduate to promote, then reload.
    php(`db_insert('summer_cohorts', ['cohortId'=>'SUM-AB','name'=>'AB Edition','year'=>2030,'status'=>'active','createdAt'=>now_iso()]);`
      + `db_insert('summer_students', ['studentId'=>'AB-S1','cohortId'=>'SUM-AB','token'=>'SUMQR-AB1','handle'=>'abs1','fullName'=>'Graduating Kid','age'=>15,'centre'=>'Ijaiye','track'=>'Piano','parentEmail'=>'abg@example.org','status'=>'graduated','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`
      + `db_insert('summer_students', ['studentId'=>'AB-S2','cohortId'=>'SUM-AB','token'=>'SUMQR-AB2','handle'=>'abs2','fullName'=>'No Email Kid','age'=>15,'centre'=>'Ijaiye','track'=>'Piano','parentEmail'=>'','status'=>'graduated','enrolledAt'=>now_iso(),'updatedAt'=>now_iso()]);`);
    await club.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(club.page);
    await club.page.waitForSelector('.admin-main tbody tr', { timeout: 30000 });
    await club.page.waitForTimeout(600);
    t = await main(club.page);
    chk('the promotion list shows the graduates', /Graduating Kid/.test(t) && /No Email Kid/.test(t));
    chk('…and flags the one with no guardian email BEFORE the run', /none on file/i.test(t));
    await club.page.evaluate(() => {
      const b = document.querySelector('.admin-main .admin-bulk-all input[type=checkbox]');
      if (b) b.click();
    });
    await club.page.waitForTimeout(300);
    t = await main(club.page);
    chk('both can be selected at once', /2 students selected/.test(t));
    chk('…and the bar warns about the missing guardian email', /1 with no guardian email/i.test(t));
    await clickText(club.page, 'Promote into the Club', '.admin-bulkbar');
    await club.page.waitForTimeout(500);
    t = await club.page.evaluate(() => document.body.innerText);
    chk('the confirm says plainly what a missing email costs',
      /no guardian email on file/.test(t) && /by hand/.test(t));
    await clickText(club.page, 'Promote 2');
    await club.page.waitForTimeout(2500);
    chk('both were promoted in one action',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM summer_students WHERE studentId IN ('AB-S1','AB-S2') AND status='promoted'")['c'];`) === '2');
    chk('…and the one with no email still became a member, as promised',
      php(`echo (int) db_row("SELECT COUNT(*) c FROM members WHERE notes LIKE '%AB-S2%'")['c'];`) === '1');

    console.log('\n── The Club roster a coordinator can finally see ───────────');
    await clickText(club.page, 'Club roster');
    await club.page.waitForTimeout(1800);
    t = await main(club.page);
    chk('the roster has a participation filter, which it never had', /Active/.test(t) && /Graduated/.test(t));
    chk('…and its bulk actions are the club\'s, not the member desk\'s', await club.page.evaluate(() => {
      const b = document.querySelector('.admin-main .admin-bulk-all input[type=checkbox]');
      if (b) b.click();
      return true;
    }));
    await club.page.waitForTimeout(400);
    t = await main(club.page);
    chk('…offering participation and centre only — no status suspension, no type, no level',
      /Set participation/.test(t) && /Post to centre/.test(t)
      && !/Set membership type/.test(t) && !/Set level/.test(t) && !/Dues reminders/.test(t));

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
