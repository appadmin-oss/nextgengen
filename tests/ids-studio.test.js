#!/usr/bin/env node
/* ============================================================================
   ID Card Studio (/club/id-cards), end to end against the real PHP backend.

   Held: the studio opens at its address and at the old /cards alias; the
   queue says New / Reprint / Blocked from the issue log; the sheet lays out
   the cards the grid maths says, with the real card renderer in each slot;
   the checks block a bad run; printing opens a window at the paper's size in
   mm, logs the run, and takes the printed people off the queue; a card
   marked bad afterwards is marked on that run and comes back as a reprint;
   the log, look up and the phone's Queue each read the same data.
   Round 2: a photo request reaches the person and is reported from the
   server's verdicts, one by one or for everyone blocked; a member card has a
   back; the sheet follows the size the cards are designed at; a member with
   no ID number is given one before printing; and a card type prints with
   its assigned, published design, logged with that design's version.

   Run:  node tests/ids-studio.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.IDS_PORT || '8289';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ids-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-IDS-ADM';

let seq = 0;
function php(snippet, extra = []) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
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

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  id studio: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'id_studio_secret_0123456789abcdefgh',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    // A centre, an admin (who holds a card already), 14 members with photos (one of them printed before and asked for again),
    // one printed before with no request (done, so not queued), and two with no photo.
    let seed = `db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-IDS-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Tunde Akin','email'=>'tunde@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','photoUrl'=>'/assets/logo.png','displayId'=>'EG-24-0001','createdAt'=>${now},'updatedAt'=>${now}]);`;
    for (let i = 1; i <= 14; i++) {
      const photo = i <= 12 ? `'/assets/logo.png'` : `''`;
      seed += `db_insert('members', ['memberId'=>'NGG-IDS-${i}','fullName'=>'Member ${String.fromCharCode(64 + i)} Test','email'=>'ids${i}@example.org','type'=>'NGG','status'=>'active','role'=>'member',`
        + `'centre'=>'Egbeda','track'=>${i === 3 ? "''" : "'Coding'"},'displayId'=>${i === 10 ? "''" : `'EG-25-${String(i).padStart(4, '0')}'`},'photoUrl'=>${photo},'createdAt'=>${now},'updatedAt'=>${now}]);`;
    }
    // A published member design (v2) and a draft one: only the first may be assigned.
    const tpl = JSON.stringify({ kind: 'member', face: 'front', w: 590, h: 929, wMm: 54, hMm: 85, safe: 30, bleedMm: 3, background: '#0B1F51',
      elements: [{ id: 'n', type: 'text', x: 40, y: 400, w: 510, h: 60, text: '{{fullName}}', size: 40, weight: 700, color: '#ffffff' }] });
    seed += `db_insert('card_templates', ['templateId'=>'TPL-IDS-1','name'=>'Club card','kind'=>'member','face'=>'front','pairId'=>'','status'=>'published','version'=>2,'schemaJson'=>${JSON.stringify(tpl)},'publishedJson'=>${JSON.stringify(tpl)},'createdAt'=>${now},'updatedAt'=>${now}]);`
      + `db_insert('card_templates', ['templateId'=>'TPL-IDS-DRAFT','name'=>'Unfinished','kind'=>'member','face'=>'front','pairId'=>'','status'=>'draft','version'=>1,'schemaJson'=>${JSON.stringify(tpl)},'publishedJson'=>'','createdAt'=>${now},'updatedAt'=>${now}]);`;
    seed += `$GLOBALS['__s'] = ['requesterId'=>'${ADMIN}'];`
      + `backend_dispatch('admin.card.run.record', ['requesterId'=>'${ADMIN}','kind'=>'member','subjectType'=>'member','output'=>'sheet','items'=>[['subjectId'=>'NGG-IDS-11','displayId'=>'EG-25-0011'],['subjectId'=>'NGG-IDS-12','displayId'=>'EG-25-0012'],['subjectId'=>'${ADMIN}','displayId'=>'EG-24-0001']]]);`
      + `backend_dispatch('admin.ids.reprint.request', ['requesterId'=>'${ADMIN}','items'=>[['subjectType'=>'member','subjectId'=>'NGG-IDS-11','why'=>'Lost']]]);`;
    php(seed, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const errs = [];
    const open = async (w, h, at) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 240)));
      await p.goto(BASE + (at || '/club/id-cards'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      await p.waitForSelector('.ids-app', { timeout: 30000 });
      return p;
    };
    // Waits for the toast to SAY something: an earlier toast can still be on screen when the next action fires.
    const toastHas = (p, re) => p.waitForFunction(src => new RegExp(src).test((document.querySelector('.ids-toast') || {}).innerText || ''), re.source, { timeout: 8000 }).then(() => true, () => false);

    console.log('desktop (1440)');
    const P = await open(1440, 900);
    await P.waitForSelector('.ids-rec', { timeout: 20000 });
    chk('it opens at /club/id-cards, with three columns', new URL(P.url()).pathname === '/club/id-cards' && !!(await P.$('.ids-src')) && !!(await P.$('.ids-sheetcol')) && !!(await P.$('.ids-set')));
    const chip = async k => P.$eval('.ids-fchip:has-text("' + k + '") .ids-fchip-n', e => +e.textContent);
    chk('the queue is New 10, Reprints 1, Blocked 2 — the member printed with no request is done', (await chip('New')) === 10 && (await chip('Reprints')) === 1 && (await chip('Blocked')) === 2);
    chk('a blank division says so on the row', /New · division is blank/.test(await P.innerText('.ids-recs')));
    await P.click('.ids-fchip:has-text("Blocked")');
    chk('blocked rows say why and offer to ask for a photo', /No photo yet · can’t print/.test(await P.innerText('.ids-recs')) && (await P.$$('.ids-rec .ids-btn--28')).length === 2);
    // A person can press it (aria-disabled, not disabled) and is told why; Playwright needs force for that.
    await P.click('.ids-rec .ids-cb', { force: true });
    chk('ticking a blocked row is refused in words', await toastHas(P, /Needs a photo first/));
    const asks = () => php(`echo db_row("SELECT COUNT(*) c FROM id_photo_asks WHERE subjectType = 'member'")['c'];`);
    await P.click('.ids-btn--outline:has-text("Ask everyone blocked for a photo (2)")');
    await P.waitForSelector('[role=alertdialog]:has-text("Ask 2 people for a photo?")');
    await P.click('[role=alertdialog] .ids-btn--primary:has-text("Ask 2")');
    chk('asking everyone blocked confirms the count first, then reports what the server did', await toastHas(P, /^Asked 2 people\./) && asks() === '2'
      && /"member"/.test(php(`echo db_row("SELECT channels FROM id_photo_asks ORDER BY id DESC LIMIT 1")['channels'];`)));
    await P.waitForTimeout(200);
    chk('…each row then says when they were asked, and offers to ask again', /No photo yet · asked \d+ \w+/.test(await P.innerText('.ids-recs'))
      && (await P.$$eval('.ids-rec .ids-btn--28', bs => bs.every(b => b.textContent === 'Ask again'))) && !(await P.$('.ids-btn--outline:has-text("Ask everyone blocked")')));
    await P.click('.ids-rec .ids-btn--28');
    chk('"Ask again" inside the quiet period goes through, and says where it went', await toastHas(P, /Asked them by email\./) && asks() === '3');
    await P.click('.ids-fchip:has-text("New")');
    await P.click('.ids-btn--outline:has-text("Add 10 to the sheet")');
    chk('"Add 10 to the sheet" adds them, with Undo', await toastHas(P, /10 cards added\s*Undo/));
    await P.waitForTimeout(300);
    chk('the sheet is A4 at 3 × 3, so 10 cards are 2 sheets', /Sheet 1 of 2/.test(await P.innerText('.ids-pager')) && /9 cards/.test(await P.innerText('.ids-perline')));
    chk('…each slot draws the real member card', (await P.$$('.ids-slot.is-card')).length === 9 && (await P.$$('.ids-slot.is-card .ids-face-rec')).length === 9);
    chk('the member with no ID number is told they get one at print', /1 member gets their ID number when you print/.test(await P.innerText('.ids-set')));
    chk('the blank division is flagged on its slot', (await P.$$('.ids-slot-warn.is-warn')).length === 1);
    chk('while piles are kept apart by centre, there is no gap bar (§3.2)', !(await P.$('.ids-gapbar')));
    await P.click('.ids-slot.is-card >> nth=0');
    const first = await P.getAttribute('.ids-slot.is-card >> nth=0', 'aria-label');
    await P.keyboard.press('ArrowRight');
    await P.waitForTimeout(200);
    chk('arrow keys move the selected card, and switch to My order', (await P.getAttribute('.ids-slot.is-card >> nth=1', 'aria-label')).replace(/^Slot \d+: /, '') === first.replace(/^Slot \d+: /, '').replace(', selected', '') + ', selected'
      && (await P.getAttribute('.ids-seg-opt:has-text("My order")', 'aria-checked')) === 'true');
    chk('in My order, the gap bar counts the empty slots on the last sheet and offers to fill them',
      /8 empty slots on the last sheet/.test(await P.innerText('.ids-gapbar')) && /Fill with 1 more ready cards/.test(await P.innerText('.ids-gapbar')));
    await P.keyboard.press('Delete');
    chk('Delete takes it off, with Undo', await toastHas(P, /Taken off the sheet\s*Undo/));
    await P.click('.ids-toast-undo');
    await P.waitForTimeout(200);
    chk('…and Undo puts it back', /10 cards ·/.test(await P.innerText('.ids-stat')));

    await P.click('.ids-size:has-text("A6 portrait")');
    chk('cards designed at one size on a sheet of another block the print, with the fix one click away', /designed at 54 × 85.6 mm but the sheet is set to 105 × 148 mm/.test(await P.innerText('.ids-set'))
      && await P.$eval('.ids-btn--print', b => b.getAttribute('aria-disabled') === 'true'));
    await P.click('.ids-set .ids-linkbtn:has-text("Use 54 × 85.6 mm")');
    chk('…which puts the sheet back to the cards’ size', (await P.getAttribute('.ids-size:has-text("CR80 portrait")', 'aria-checked')) === 'true');
    await P.click('.ids-size:has-text("Custom")');
    await P.fill('#ids-cw', '200'); await P.press('#ids-cw', 'Enter');
    await P.fill('#ids-ch', '280'); await P.press('#ids-ch', 'Enter');
    const setText = await P.innerText('.ids-set');
    chk('a custom size that cannot fit says so, and blocks the print', /don’t fit on A4/.test(setText));
    if (!/don’t fit on A4/.test(setText)) console.error('       settings said: ' + setText.replace(/\s+/g, ' ').slice(0, 400));
    await P.click('.ids-size:has-text("CR80 portrait")');

    await P.click('.ids-seg-opt:has-text("All sheets")');
    chk('All sheets shows one mini sheet per sheet', (await P.$$('.ids-ov')).length === 2);
    await P.click('.ids-ov >> nth=1');
    chk('…and opens the one clicked', /Sheet 2 of 2/.test(await P.innerText('.ids-pager')));

    await P.click('.ids-radio:has-text("Double-sided · long edge")');
    await P.click('.ids-seg-opt:has-text("Backs")');
    const back = await P.innerText('.ids-slot.is-card >> nth=0');
    chk('a member card has a back: who it belongs to, where to return it, and no money or medical details',
      /if found, please return to/i.test(back) && /no money and no medical details/i.test(back) && /holder’s signature/i.test(back));
    await P.click('.ids-seg-opt:has-text("Fronts")');
    await P.click('.ids-radio:has-text("Fronts only")');

    await P.click('.ids-scen-btn:has-text("Proof")');
    chk('the Proof scenario sets 150 dpi and watermarks every slot', (await P.$eval('.ids-set .ids-field:has-text("Image quality") select', s => s.value)) === '150' && (await P.$$('.ids-slot-proof')).length > 0);
    await P.click('.ids-scen-btn:has-text("New intake")');

    // Print: confirm, the print window, the log, the queue.
    await P.click('.ids-btn--print');
    await P.waitForSelector('[role=alertdialog]');
    chk('the confirm asks, and sums up the run', /Print 10 cards\?/.test(await P.innerText('[role=alertdialog]')) && /2 × A4/.test(await P.innerText('.ids-sum')));
    const [win] = await Promise.all([P.context().waitForEvent('page'), P.click('[role=alertdialog] .ids-btn--primary')]);
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(600);
    const pw = await win.evaluate(() => ({ css: document.querySelector('style').textContent, pages: document.querySelectorAll('.ids-pg').length, slots: document.querySelectorAll('.ids-ps').length, list: !!document.querySelector('.ids-pg--list') }));
    chk('the print window is sized to the paper in mm, with a packing list and 2 sheets of 10 cards', /@page\{size:210mm 297mm;margin:0\}/.test(pw.css) && pw.list && pw.pages === 3 && pw.slots === 10);
    await win.close();
    chk('it is logged as a run', await toastHas(P, /logged as CRUN-/) && php(`echo db_row("SELECT COUNT(*) c FROM card_runs")['c'];`) === '2');
    chk('the member with no ID number was given one first, from the member series', /^\d{3}-\d{3,}$/.test(php(`echo db_row("SELECT displayId FROM members WHERE memberId = 'NGG-IDS-10'")['displayId'];`)));
    await P.waitForSelector('.ids-dialog:has-text("Did all 10 print properly?")', { timeout: 10000 });
    chk('the printed people leave the queue', (await chip('New')) === 0);
    await P.click('.ids-after-card >> nth=0');
    await P.click('.ids-dialog .ids-btn--primary:has-text("Reprint 1")');
    chk('a card marked bad goes back on the sheet as a reprint',
      await P.waitForFunction(() => /1 card back on the sheet as reprints/.test((document.querySelector('.ids-toast') || {}).innerText || ''), null, { timeout: 8000 }).then(() => true, () => false)
      && (await chip('Reprints')) >= 1);
    chk('…and is marked failed on the run it came from', php(`echo db_row("SELECT COUNT(*) c FROM card_issues WHERE ok = 0")['c'];`) === '1');

    await P.click('.ids-tab:has-text("Print log")');
    await P.waitForSelector('.ids-logrow', { timeout: 15000 });
    chk('the print log lists both runs, the new one with "1 not printed"', (await P.$$('.ids-logrow')).length === 2 && /1 not printed/.test(await P.innerText('.ids-log')));
    await P.click('.ids-logrow >> nth=0');
    await P.waitForSelector('.ids-drawer');
    await P.waitForFunction(() => document.querySelectorAll('.ids-people li').length > 0, null, { timeout: 10000 });
    chk('a run opens in a drawer with the people in it', (await P.$$('.ids-people li')).length === 10);
    await P.keyboard.press('Escape');
    await P.click('.ids-tab:has-text("Look up")');
    await P.fill('#ids-lq', 'eg-25-0012');
    await P.keyboard.press('Enter');
    await P.waitForSelector('.ids-lookup-res, .ids-lookup-none', { timeout: 10000 });
    chk('look up finds a person’s cards by printed ID, any case', /Member L Test/.test(await P.innerText('.ids-page')) && /1 card issued/.test(await P.innerText('.ids-page')));
    await P.fill('#ids-lq', 'EG-99-9999'); await P.keyboard.press('Enter');
    await P.waitForSelector('.ids-lookup-none', { timeout: 10000 });
    chk('…and says plainly when nobody has a card under that ID', /No card has been issued to EG-99-9999/.test(await P.innerText('.ids-page')));

    // Option 1: a card type prints with its assigned, published design.
    await P.click('.ids-tab:has-text("Make cards")');
    const pick = '.ids-set .ids-field:has-text("NGG members") select';
    await P.waitForSelector(pick);
    chk('only published designs are offered — the draft is not', await P.$eval(pick, s => [...s.options].map(o => o.value).join(',')) === ',TPL-IDS-1');
    await P.selectOption(pick, 'TPL-IDS-1');
    chk('assigning one says so, the header names it, and it is stored', await toastHas(P, /NGG members now print with Club card v2/)
      && /Member: Club card v2/.test(await P.innerText('.ids-head')) && php(`echo db_row("SELECT templateId FROM id_designs WHERE kind = 'member'")['templateId'];`) === 'TPL-IDS-1');
    await P.waitForSelector('.ids-slot.is-card .ids-face-tpl', { timeout: 30000 });
    chk('the sheet draws it with the Design Studio’s own renderer', (await P.$$('.ids-slot.is-card .ids-face-tpl')).length >= 1);
    await P.click('.ids-btn--print');
    await P.waitForSelector('[role=alertdialog]');
    chk('the confirm names the design', /Club card v2/.test(await P.innerText('.ids-sum')));
    const [win2] = await Promise.all([P.context().waitForEvent('page'), P.click('[role=alertdialog] .ids-btn--primary')]);
    await win2.waitForLoadState('domcontentloaded');
    chk('the print carries the drawn design', await win2.evaluate(() => document.querySelectorAll('.ids-ps img.ids-face-tpl').length) >= 1);
    await win2.close();
    await toastHas(P, /logged as CRUN-/);
    chk('…and the run records that design and its version', php(`$r = db_row("SELECT templateId, templateVersion FROM card_runs ORDER BY id DESC LIMIT 1"); echo $r['templateId'] . '@' . $r['templateVersion'];`) === 'TPL-IDS-1@2');
    await P.context().close();

    console.log('phone (390) and the old address');
    const Q = await open(390, 844, '/cards');
    await Q.waitForSelector('.ids-kpis', { timeout: 20000 });
    chk('/cards forwards to /club/id-cards', new URL(Q.url()).pathname === '/club/id-cards');
    chk('on a phone it is a Queue — no sheet, no settings', (await Q.innerText('.ids-tab.is-on')).startsWith('Queue') && !(await Q.$('.ids-sheet')) && !(await Q.$('.ids-set')));
    chk('…with the KPIs and the blocked count in red', /Blocked/.test(await Q.innerText('.ids-kpis')) && (await Q.$eval('.ids-kpi.is-bad b', b => b.textContent)) === '2');
    chk('nothing scrolls sideways', await Q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await Q.context().close();

    chk('no page errors anywhere', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (id card studio)`);
    process.exit(failed ? 1 : 0);
  }
})();
