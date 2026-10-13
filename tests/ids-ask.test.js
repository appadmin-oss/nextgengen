#!/usr/bin/env node
/* ============================================================================
   ID Card Studio — print from a prompt, end to end against the real PHP
   backend (no AI key, so the studio's rules read the request).

   Held: a request becomes a plan the studio applies — the cards it selects go
   on the sheet, the settings it names change, the list on the left shows the
   same filter — and the result names the count, who was left out and why;
   Undo puts the sheet back; an ID already carded offers a reprint that queues
   it on the server and puts it on the sheet; "this week" is read as dates;
   Print on the result makes the PDF and logs the run; a request it cannot
   read says so and changes nothing.

   Run:  node tests/ids-ask.test.js
   ========================================================================== */
/* (setup shared with ids-studio.test.js)

   Held: the studio opens at its address and at the old /cards alias; the
   queue says New / Reprint / Blocked from the issue log; the sheet lays out
   the cards the grid maths says, with the real card renderer in each slot;
   the checks block a bad run; printing opens a window at the paper's size in
   mm, logs the run, and takes the printed people off the queue; a card
   marked bad afterwards is marked on that run and comes back as a reprint;
   the log, look up and the phone's Queue each read the same data.
*/
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.IDA_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-ida-'));
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
/* What a downloaded PDF holds, read from its (uncompressed) object dictionaries. */
function pdfFacts(buf) {
  const t = buf.toString('latin1');
  const widths = [...t.matchAll(/\/Subtype \/Image[^>]*?\/Width (\d+)/g)].map(m => +m[1]);
  return { ok: t.startsWith('%PDF-'), pages: (t.match(/\/Type \/Page\b(?!s)/g) || []).length,
    a4: /\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/.test(t), images: widths.length, minImageW: widths.length ? Math.min(...widths) : 0,
    // Page text lives in Flate streams: inflate the ones that are not images.
    text: [...t.matchAll(/\/FlateDecode[^>]*>>\s*stream\r?\n/g)].map(m => {
      const start = m.index + m[0].length, end = t.indexOf('endstream', start);
      try { return require('zlib').inflateSync(buf.subarray(start, end)).toString('latin1'); } catch (_) { return ''; }
    }).join('\n') };
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
    'cookie_secret' => 'id_ask_secret_0123456789abcdefghij',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    const today = php(`echo ids_plan_today();`, ['bootstrap']);
    let seed = `db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-IDA-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>${now}]);`
      + `db_insert('centres', ['centreId'=>'CEN-IDA-2','name'=>'Ijaiye','code'=>'IJ','color'=>'#3b6fd8','status'=>'active','slug'=>'ijaiye','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Tunde Akin','email'=>'tunde@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','photoUrl'=>'/assets/logo.png','displayId'=>'024-001','joinDate'=>'2024-01-10','createdAt'=>${now},'updatedAt'=>${now}]);`;
    const m = (id, name, centre, photo, did, join) => `db_insert('members', ['memberId'=>'${id}','fullName'=>'${name}','email'=>'${id.toLowerCase()}@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'${centre}','track'=>'Coding','displayId'=>'${did}','photoUrl'=>'${photo ? '/assets/logo.png' : ''}','joinDate'=>'${join}','createdAt'=>${now},'updatedAt'=>${now}]);`;
    // Egbeda: three who joined today, three last year, one with no photo. Ijaiye: three, one of whom already has a card.
    seed += m('NGG-A-1', 'Ada Obi', 'Egbeda', true, '026-001', today) + m('NGG-A-2', 'Bayo Ade', 'Egbeda', true, '026-002', today) + m('NGG-A-3', 'Chika Eze', 'Egbeda', true, '026-003', today)
      + m('NGG-A-4', 'Dayo Bello', 'Egbeda', true, '025-004', '2025-03-01') + m('NGG-A-5', 'Efe Okon', 'Egbeda', true, '025-005', '2025-03-01') + m('NGG-A-6', 'Funmi Ola', 'Egbeda', true, '025-006', '2025-03-01')
      + m('NGG-A-7', 'Gbenga Nophoto', 'Egbeda', false, '025-007', '2025-03-01')
      + m('NGG-B-1', 'Halima Musa', 'Ijaiye', true, '025-101', '2025-03-01') + m('NGG-B-2', 'Ifeanyi Uche', 'Ijaiye', true, '025-102', '2025-03-01') + m('NGG-B-3', 'Jumoke Carded', 'Ijaiye', true, '025-103', '2025-03-01');
    seed += `backend_dispatch('admin.card.run.record', ['requesterId'=>'${ADMIN}','kind'=>'member','subjectType'=>'member','output'=>'sheet','items'=>[['subjectId'=>'NGG-B-3','displayId'=>'025-103'],['subjectId'=>'${ADMIN}','displayId'=>'024-001']]]);`;
    php(seed, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: '/opt/pw-browsers/' + d + '/chrome-linux/chrome' } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const errs = [];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const P = await ctx.newPage();
    P.on('pageerror', e => errs.push(String(e).slice(0, 240)));
    await P.goto(BASE + '/club/id-cards', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.ids-ask-in', { timeout: 30000 });
    const nOnSheet = () => P.$$eval('.ids-sheet .ids-slot.is-card', s => s.length).catch(() => -1);
    const ask = async text => {
      await P.fill('.ids-ask-in', text);
      await P.click('.ids-ask-bar button[type=submit]');
      await P.waitForSelector('.ids-ask-card', { timeout: 30000 });
      await P.waitForTimeout(400);
      return P.innerText('.ids-ask-card');
    };

    console.log('the prompt bar');
    if (process.env.SHOTS) await P.screenshot({ path: path.join(process.env.SHOTS, 'ids-ask-empty.png') });
    chk('the bar sits above the workspace, with examples to start from', (await P.$$('.ids-ask-chip')).length === 4 && !!(await P.$('.ids-make-wrap > .ids-ask + .ids-make')));
    await P.click('.ids-ask-chip >> nth=0');
    chk('an example fills the bar, it does not run on its own', /Egbeda/.test(await P.inputValue('.ids-ask-in')) && !(await P.$('.ids-ask-card')));

    console.log('a selection with settings');
    let card = await ask('New cards for Egbeda members, front and back, with crop marks');
    chk('it says how many cards and what it understood', /6\s*cards on the sheet/.test(card) && /New cards/.test(card) && /NGG members/.test(card) && /Egbeda/.test(card));
    chk('…names who was left out and why, with the way to fix it', /1 person left out: no photo yet \(Gbenga Nophoto\)/.test(card) && /Ask for photos/.test(card));
    chk('…shows the sheet it will print, the settings it changed marked', /Double-sided · long edge/.test(await P.innerText('.ids-ask-how li.is-changed')) && /Crop marks/.test(card) && /A4/.test(card));
    chk('…and says what read it', /Read by the studio’s rules/.test(card));
    if (process.env.SHOTS) await P.screenshot({ path: path.join(process.env.SHOTS, 'ids-ask.png') });
    chk('the six cards are on the sheet, and the settings panel agrees', (await nOnSheet()) === 6 && (await P.$eval('.ids-radio[aria-checked="true"]', b => b.innerText)).startsWith('Double'));
    chk('the list on the left shows the same centre', (await P.$eval('.ids-src select >> nth=1', s => s.options[s.selectedIndex].text).catch(() => '')).includes('Egbeda') || /Egbeda/.test(await P.innerText('.ids-src')));
    chk('with each centre on its own sheets, no empty slot is offered to another centre', !/empty slot/.test(card));

    console.log('follow-ups refine the plan on screen');
    chk('with a plan on screen the bar asks for a change', /Change it/.test(await P.getAttribute('.ids-ask-in', 'placeholder')) && /Update/.test(await P.innerText('.ids-ask-bar button')));
    card = await ask('fronts only');
    chk('"fronts only" keeps the six and changes the sides, marked Updated', /6\s*cards on the sheet/.test(card) && /Updated/.test(card) && (await P.$eval('.ids-radio[aria-checked="true"]', b => b.innerText)).startsWith('Fronts'));
    card = await ask('not Ada Obbi');
    chk('"not <name>", misspelt, leaves that person out and says so', /5\s*cards on the sheet/.test(card) && /Left out as asked: Ada Obi/.test(card) && (await nOnSheet()) === 5);
    await P.click('.ids-ask-what li:has-text("not Ada Obbi") .ids-ask-x');
    await P.waitForFunction(() => /6\s*cards on the sheet/.test((document.querySelector('.ids-ask-card') || {}).innerText || ''), null, { timeout: 5000 });
    chk('a chip’s × takes that part out on the spot', (await nOnSheet()) === 6 && !(await P.$('.ids-ask-what li:has-text("not Ada")')));
    card = await ask('add 025-101');
    chk('"add <ID>" puts a card from another centre on top of the selection, on a sheet of its own', /7\s*cards on the sheet · 2 sheets/.test(card) && /\+ 025-101/.test(card));
    card = await ask('sort them by name');
    chk('"by name" puts everyone on one sheet and offers its empty slots to the cards still waiting', /7\s*cards on the sheet · 1 sheet/.test(card) && /The last sheet has 2 empty slots/.test(card) && /Fill it with 1 more waiting card/.test(card));
    if (process.env.SHOTS) await P.locator('.ids-ask').screenshot({ path: path.join(process.env.SHOTS, 'ids-ask-refined.png') });
    await P.click('.ids-ask-issue button:has-text("Fill")');
    await P.waitForFunction(() => /8\s*cards on the sheet/.test((document.querySelector('.ids-ask-card') || {}).innerText || ''), null, { timeout: 5000 });
    chk('filling the last sheet adds the waiting card and the count follows', (await nOnSheet()) === 8);
    await P.click('.ids-ask-acts button:has-text("Undo")');
    await P.waitForFunction(() => !document.querySelector('.ids-ask-card'), null, { timeout: 5000 });
    chk('Undo puts the sheet back as it was', (await nOnSheet()) <= 0 && (await P.$eval('.ids-radio[aria-checked="true"]', b => b.innerText)).startsWith('Fronts'));

    console.log('named cards, and one who already has a card');
    card = await ask('Reprint 025-103 and 025-101, fronts only');
    chk('an ID still waiting goes on the sheet; one already carded is offered as a reprint', /1\s*card on the sheet/.test(card) && /1 person already has a card \(Jumoke Carded\)/.test(card));
    await P.click('.ids-ask-issue button:has-text("Reprint it")');
    await P.waitForFunction(() => /2\s*cards on the sheet/.test((document.querySelector('.ids-ask-card') || {}).innerText || ''), null, { timeout: 15000 });
    chk('…pressing it queues the reprint on the server and puts the card on the sheet', php(`echo db_row("SELECT COUNT(*) c FROM id_reprints WHERE subjectId = 'NGG-B-3' AND doneAt = ''")['c'];`, ['bootstrap']) === '1'
      && (await nOnSheet()) === 2);
    card = await ask('reprint 999-999');
    chk('an ID nobody holds is named as not found, and the sheet is left alone', /Not found: 999-999/.test(card) && /Nothing to put on the sheet/.test(card) && (await nOnSheet()) === 2);
    await P.click('.ids-ask-acts button:has-text("Close")');
    card = await ask('new cards for Egbda members');
    chk('a misspelt centre is still the centre', /6\s*cards on the sheet/.test(card) && /Egbeda/.test(card));
    await P.click('.ids-ask-acts button:has-text("Close")');

    console.log('dates, then Print');
    card = await ask('members who joined this week at Egbeda');
    chk('"this week" is read as dates, and only those who joined in it are selected', /3\s*cards on the sheet/.test(card) && /joined/.test(card) && (await nOnSheet()) === 3);
    const runsBefore = +php(`echo db_row("SELECT COUNT(*) c FROM card_runs")['c'];`, ['bootstrap']);
    const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 180000 }), P.click('.ids-ask-acts .ids-btn--primary')]);
    const pdf = pdfFacts(fs.readFileSync(await dl.path()));
    chk('Print on the result makes the PDF straight away, with the 3 cards', pdf.ok && pdf.images >= 3);
    await P.waitForFunction(() => /logged as CRUN-/.test((document.querySelector('.ids-toast') || {}).innerText || ''), null, { timeout: 20000 }).catch(() => {});
    chk('…and logs the run with those three people', +php(`echo db_row("SELECT COUNT(*) c FROM card_runs")['c'];`, ['bootstrap']) === runsBefore + 1
      && php(`echo db_row("SELECT COUNT(*) c FROM card_issues WHERE subjectId IN ('NGG-A-1','NGG-A-2','NGG-A-3')")['c'];`, ['bootstrap']) === '3');

    await P.waitForSelector('.ids-dialog:has-text("Did all 3 print properly?")', { timeout: 20000 });
    chk('…then asks, as every print does, whether all three printed properly', true);
    await P.click('.ids-dialog button:has-text("Check later")');

    console.log('a request it cannot read');
    const before = await nOnSheet();
    card = await ask('hello there');
    chk('it says it could not tell, and changes nothing', /couldn’t tell what to print/.test(card) && (await nOnSheet()) === before);
    await P.fill('.ids-ask-in', 'x');
    await P.keyboard.press('Escape');
    chk('Escape with text in the bar clears the text first', (await P.inputValue('.ids-ask-in')) === '' && !!(await P.$('.ids-ask-card')));
    await P.keyboard.press('Escape');
    chk('Escape clears the bar, then closes the result', !(await P.$('.ids-ask-card')));
    chk('recent requests come back as chips', (await P.$$('.ids-ask-chip.is-recent')).length >= 1 && /members who joined this week|hello there|new cards for Egbda/.test(await P.innerText('.ids-ask-ex')));
    await P.click('.ids-ask-ex', { position: { x: 1, y: 1 } }).catch(() => {});
    await P.click('.ids-sheetcol', { position: { x: 5, y: 5 } }).catch(() => {});
    await P.keyboard.press('/');
    chk('"/" goes to the bar', await P.evaluate(() => document.activeElement && document.activeElement.id === 'ids-ask-in'));
    await P.keyboard.press('ArrowUp');
    chk('↑ in the empty bar brings back the last request', (await P.inputValue('.ids-ask-in')) === 'hello there');

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (print from a prompt)`);
    process.exit(failed ? 1 : 0);
  }
})();
