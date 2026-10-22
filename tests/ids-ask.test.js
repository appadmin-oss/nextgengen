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
    await P.waitForSelector('.ids-panes', { timeout: 30000 });
    const nOnSheet = () => P.$$eval('.ids-sheet .ids-slot.is-card', s => s.length).catch(() => -1);
    const live = () => P.innerText('.ids-ai-card.is-live').catch(() => '');
    // Send a message and wait for the studio's reply to land in the transcript.
    const ask = async text => {
      const n = (await P.$$('.ids-ai-card')).length;
      await P.fill('#ids-ai-in', text);
      await P.press('#ids-ai-in', 'Enter');
      await P.waitForFunction(k => document.querySelectorAll('.ids-ai-card').length > k && !document.querySelector('.ids-ai-reading'), n, { timeout: 30000 });
      await P.waitForTimeout(400);
      const cards = await P.$$('.ids-ai-card');
      return cards[cards.length - 1].innerText();
    };

    console.log('a calmer studio (v4)');
    chk('the checks come first, then Layout open; Printing and Designs closed, each summed up on one line',
      await P.$eval('.ids-set-scroll > :first-child', e => e.classList.contains('ids-checks'))
      && (await P.$$('details.ids-more[open]')).length === 1 && (await P.$$('details.ids-more:not([open])')).length === 2
      && /Fronts only · cut marks · 300 dpi/.test(await P.innerText('.ids-set')) && /Designs\s*Standard cards/.test(await P.innerText('.ids-set')));
    chk('the header carries the tabs, the Settings / Assistant switch and Print with its count — nothing else',
      /Print 0/.test(await P.innerText('.ids-btn--headprint')) && !/Design:/.test(await P.innerText('.ids-head')) && (await P.$$('.ids-panes [aria-pressed]')).length === 2);
    chk('a deployment with no Afrovanguard link is not told so on every visit', !/Afrovanguard/.test(await P.evaluate(() => (document.querySelector('.ids-toast') || {}).innerText || '')));

    console.log('the assistant pane');
    await P.click('.ids-panes button:has-text("Assistant")');
    await P.waitForSelector('#ids-ai-in');
    if (process.env.SHOTS) await P.screenshot({ path: path.join(process.env.SHOTS, 'ids-ask-empty.png') });
    chk('it replaces Settings beside the sheet, which stays in view, and starts with examples', !(await P.$('.ids-set')) && !!(await P.$('.ids-sheetcol')) && (await P.$$('.ids-ai-starter')).length >= 4);
    chk('it says plainly that it cannot print or mark anyone printed', /Can’t print or mark anyone as printed/.test(await P.innerText('.ids-ai')));
    let card = await ask('Why can’t I print yet?');
    chk('a question about the sheet is answered from the sheet’s own checks', /Nothing is on the sheet yet/.test(card) && (await nOnSheet()) <= 0);

    console.log('Ask mode suggests; Act mode applies');
    chk('Ask is the mode it starts in', (await P.getAttribute('.ids-ai-mode button:has-text("Ask")', 'aria-pressed')) === 'true');
    console.log('requests the rules used to misread (read in Ask mode, before anything is printed)');
    {
      const r1 = await ask('print 026-001 to 026-003');
      chk('"026-001 to 026-003" is the three in that block, not two people and not 2025\'s', /^Assistant\s*3 cards\b/.test(r1.trim()) && /numbers 026-001–026-003/.test(r1) && (await nOnSheet()) <= 0);
      await P.click('.ids-ai-bar button[aria-label="New conversation"]');
      const r2 = await ask('Egbeda and Ijaiye members who still need a card');
      chk('two centres at once, only the people still waiting: Egbeda\'s six with photos and Ijaiye\'s two without a card', /^Assistant\s*8 cards\b/.test(r2.trim()) && /Egbeda/.test(r2) && /Ijaiye/.test(r2));
      await P.click('.ids-ai-bar button[aria-label="New conversation"]');
      chk('…and nothing went on the sheet: Ask mode waits for Apply', (await nOnSheet()) <= 0);
    }

    card = await ask('New cards for Egbeda members, front and back, with crop marks');
    chk('in Ask mode a plan says what it would do and waits for Apply; the sheet is untouched', /6\s*cards/.test(card) && /Apply/.test(card) && (await nOnSheet()) <= 0);
    await P.click('.ids-ai-card:last-child button:has-text("Apply")');
    await P.waitForSelector('.ids-ai-card.is-live');
    card = await live();
    chk('Apply puts it on the sheet and says what it ran', /6\s*cards on the sheet/.test(card) && /Put 6 cards on the sheet/.test(card) && (await nOnSheet()) === 6);
    chk('…what it understood', /New cards/.test(card) && /NGG members/.test(card) && /Egbeda/.test(card));
    chk('…who was left out and why, with the way to fix it', /1 person left out: no photo yet \(Gbenga Nophoto\)/.test(card) && /Ask for photos/.test(card));
    chk('…the settings it changed, marked', /Double-sided · long edge/.test(await P.innerText('.ids-ask-how li.is-changed')) && /Crop marks/.test(card) && /A4/.test(card));
    chk('…and says what read it', /Read by the studio’s rules/.test(card));
    if (process.env.SHOTS) await P.screenshot({ path: path.join(process.env.SHOTS, 'ids-ask.png') });
    chk('the header’s Print stays the one solid button, with the count; the reply’s Print is outlined',
      /Print 6/.test(await P.innerText('.ids-btn--headprint')) && await P.$eval('.ids-ai-card.is-live button:has-text("Print 6 cards")', b => b.classList.contains('ids-btn--outline')));
    // v4: one centre is one group; small groups share a sheet, so its empty slots are offered.
    chk('6 Egbeda cards are one group: the 3 empty slots are offered to cards still waiting', /The last sheet has 3 empty slots/.test(card));
    await P.click('.ids-ai-mode button:has-text("Act")');

    console.log('follow-ups refine the plan, and the transcript keeps the earlier replies');
    chk('with a plan live the composer asks for a change', /Change it/.test(await P.getAttribute('#ids-ai-in', 'placeholder')));
    card = await ask('fronts only');
    if (!/Changed: Fronts only/.test(await P.innerText('.ids-ai-card.is-live .ids-ask-how').catch(() => ''))) console.error('       fronts card: ' + card.replace(/\s+/g, ' ').slice(0, 300));
    chk('"fronts only" keeps the six and changes the sides, marked updated', /6\s*cards on the sheet/.test(card) && /updated/.test(card) && /Fronts only/.test(await P.innerText('.ids-ai-card.is-live .ids-ask-how')) && !/Double-sided/.test(card));
    chk('…and the earlier reply stays in the transcript, marked superseded', /superseded/.test(await P.innerText('.ids-ai-log')) && (await P.$$('.ids-ai-card.is-live')).length === 1);
    card = await ask('not Ada Obbi');
    chk('"not <name>", misspelt, leaves that person out and says so', /5\s*cards on the sheet/.test(card) && /Left out as asked: Ada Obi/.test(card) && (await nOnSheet()) === 5);
    await P.click('.ids-ai-card.is-live .ids-ask-what li:has-text("not Ada Obi") .ids-ask-x');
    await P.waitForFunction(() => /6\s*cards on the sheet/.test((document.querySelector('.ids-ai-card.is-live') || {}).innerText || ''), null, { timeout: 5000 });
    chk('a chip’s × takes that part out on the spot', (await nOnSheet()) === 6 && !(await P.$('.ids-ai-card.is-live .ids-ask-what li:has-text("not Ada")')));
    card = await ask('add 025-101');
    chk('"add <ID>" puts a card from another centre on the selection; two small groups share one sheet (v4)', /7\s*cards on the sheet · 1 sheet/.test(card) && /\+ 025-101/.test(card));
    card = await ask('sort them by name');
    chk('"by name" keeps one sheet and offers its empty slots to the cards still waiting', /7\s*cards on the sheet · 1 sheet/.test(card) && /The last sheet has 2 empty slots/.test(card) && /Fill it with 1 more waiting card/.test(card));
    if (process.env.SHOTS) await P.locator('.ids-ai').screenshot({ path: path.join(process.env.SHOTS, 'ids-ask-refined.png') });
    await P.click('.ids-ai-card.is-live .ids-ask-issue button:has-text("Fill")');
    await P.waitForFunction(() => /8\s*cards on the sheet/.test((document.querySelector('.ids-ai-card.is-live') || {}).innerText || ''), null, { timeout: 5000 });
    chk('filling the last sheet adds the waiting card and the count follows', (await nOnSheet()) === 8);
    await P.click('.ids-ai-card.is-live button:has-text("Undo")');
    await P.waitForFunction(() => !document.querySelector('.ids-ai-card.is-live'), null, { timeout: 5000 });
    chk('Undo puts the sheet back as it was, and the reply says it was undone', (await nOnSheet()) <= 0 && /undone/.test(await P.innerText('.ids-ai-log')));

    console.log('named cards, and one who already has a card');
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    card = await ask('Reprint 025-103 and 025-101, fronts only');
    chk('an ID still waiting goes on the sheet; one already carded is offered as a reprint', /1\s*card on the sheet/.test(card) && /1 person already has a card \(Jumoke Carded\)/.test(card));
    await P.click('.ids-ai-card.is-live .ids-ask-issue button:has-text("Reprint it")');
    await P.waitForFunction(() => /2\s*cards on the sheet/.test((document.querySelector('.ids-ai-card.is-live') || {}).innerText || ''), null, { timeout: 15000 });
    chk('…pressing it queues the reprint on the server and puts the card on the sheet', php(`echo db_row("SELECT COUNT(*) c FROM id_reprints WHERE subjectId = 'NGG-B-3' AND doneAt = ''")['c'];`, ['bootstrap']) === '1'
      && (await nOnSheet()) === 2);
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    card = await ask('reprint 999-999');
    chk('an ID nobody holds is named as not found, and the sheet is left alone', /Not found: 999-999/.test(card) && /Nothing to put on the sheet/.test(card) && (await nOnSheet()) === 2);
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    card = await ask('new cards for Egbda members');
    chk('a misspelt centre is still the centre', /6\s*cards on the sheet/.test(card) && /Egbeda/.test(card));
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');

    console.log('dates, then Print');
    card = await ask('members who joined this week at Egbeda');
    chk('"this week" is read as dates, and only those who joined in it are selected', /3\s*cards on the sheet/.test(card) && /joined/.test(card) && (await nOnSheet()) === 3);
    const runsBefore = +php(`echo db_row("SELECT COUNT(*) c FROM card_runs")['c'];`, ['bootstrap']);
    await P.click('.ids-ai-card.is-live button:has-text("Print 3 cards")');
    await P.waitForSelector('[role=alertdialog]');
    chk('the reply’s Print opens the same confirm as the header’s, with the count on it — the assistant never prints', /Print 3 cards\?/.test(await P.innerText('[role=alertdialog]')));
    const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 180000 }), P.click('[role=alertdialog] .ids-btn--primary')]);
    const pdf = pdfFacts(fs.readFileSync(await dl.path()));
    chk('…which makes the PDF with the 3 cards', pdf.ok && pdf.images >= 3);
    await P.waitForFunction(() => /logged as CRUN-/.test((document.querySelector('.ids-toast') || {}).innerText || ''), null, { timeout: 20000 }).catch(() => {});
    chk('…and logs the run with those three people', +php(`echo db_row("SELECT COUNT(*) c FROM card_runs")['c'];`, ['bootstrap']) === runsBefore + 1
      && php(`echo db_row("SELECT COUNT(*) c FROM card_issues WHERE subjectId IN ('NGG-A-1','NGG-A-2','NGG-A-3')")['c'];`, ['bootstrap']) === '3');
    await P.waitForSelector('.ids-dialog:has-text("Did all 3 print properly?")', { timeout: 20000 });
    chk('…then asks, as every print does, whether all three printed properly', true);
    await P.click('.ids-dialog button:has-text("Check later")');

    console.log('answers from the studio’s own data');
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    card = await ask('What can you do?');
    chk('"what can you do?" lists what it can choose, change, do and answer — and that it cannot print', /Choose who/.test(card) && /Change it/.test(card) && /Act/.test(card) && /can’t print/.test(card));
    card = await ask('Has Jumoke Carded got a card?');
    // Her card was printed at seeding, and a reprint was queued for her earlier in this run.
    chk('a person, by name: her status, from the queue — a reprint is waiting', /Jumoke Carded \(025-103, Ijaiye\)/.test(card) && /(waiting for a reprint|on the sheet now)/.test(card));
    if (!/Jumoke/.test(card)) console.error('       person card: ' + card.replace(/\s+/g, ' ').slice(0, 200));
    card = await ask('where is 025-005?');
    chk('a person, by printed ID: it says where they are in the queue', /Efe Okon/.test(card) && /waiting for their first card/.test(card));
    // The answer carries what can be done for the person, and the buttons follow them.
    const sheetBefore = await nOnSheet();
    await P.click('.ids-ai-card >> nth=-1 >> .ids-ai-person button:has-text("Put on the sheet")');
    await P.waitForTimeout(250);
    chk('a person’s answer offers what can be done: "Put on the sheet" puts them on it', (await nOnSheet()) === Math.max(0, sheetBefore) + 1);
    chk('…and the button follows them: it now offers to take them off', !!(await P.$('.ids-ai-card >> nth=-1 >> .ids-ai-person button:has-text("Take off the sheet")')));
    await P.click('.ids-ai-card >> nth=-1 >> .ids-ai-person button:has-text("Take off the sheet")');
    await P.waitForTimeout(200);
    card = await ask('Has Jumoke Cardd got a card?');
    chk('a misspelt name still finds the person, and says it is the closest match', /Closest match/.test(card) && /Jumoke Carded/.test(card));
    card = await ask('Is Gbenga Nophoto ready?');
    chk('someone with no photo is offered "Ask for a photo"', /waiting for a photo/.test(card) && !!(await P.$('.ids-ai-card >> nth=-1 >> .ids-ai-person button:has-text("Ask for a photo")')));
    card = await ask('What is a proof?');
    chk('it explains the studio’s own terms: a proof', /test print/.test(card) && /150 dpi/.test(card));
    card = await ask('What does long edge mean?');
    chk('…long edge, for double-sided printing', /flips left to right/.test(card));
    card = await ask('What does blocked mean?');
    chk('…and blocked', /no approved photo/.test(card));
    card = await ask('Who is waiting for a photo?');
    chk('"who is waiting for a photo?" names them, and offers the request', /Gbenga Nophoto/.test(card) && /ask them for photos/.test(card));
    chk('…answered without asking the planner (no "Read by" line)', !/Read by/.test(card));

    console.log('commands on the sheet as it is');
    card = await ask('New cards for Egbeda members');
    const onSheet0 = await nOnSheet();
    chk('a plan to work on', onSheet0 === 3 || onSheet0 === 6);
    chk('after a reply, next steps are suggested', (await P.$$('.ids-ai-nextbtn')).length >= 1);
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    card = await ask('make it A3 with a 6mm margin');
    chk('a settings-only request changes the sheet, not who is on it', /Set paper A3/.test(card) && /Set margin 6 mm/.test(card) && (await nOnSheet()) === onSheet0);
    await P.click('.ids-ai-card >> nth=-1 >> button:has-text("Undo")');
    await P.waitForTimeout(200);
    await P.click('.ids-panes button:has-text("Settings")');
    chk('…and its Undo puts the settings back', (await P.getAttribute('.ids-seg-opt:has-text("A4")', 'aria-checked')) === 'true' && (await P.inputValue('#ids-margin')) === '10');
    await P.click('.ids-panes button:has-text("Assistant")');
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    card = await ask('New cards for Egbeda members, then fill the gaps');
    await P.waitForTimeout(400);
    card = await live();
    chk('a request with a "then": the cards go on, then the gaps are filled from the cards waiting', /cards on the sheet/.test(card) && /Filled \d+ empty slots?|already used|No card that is ready/.test(card));
    await P.click('.ids-ai-card.is-live button:has-text("Undo")');
    await P.waitForTimeout(200);
    card = await ask('fill the gaps');
    chk('"fill the gaps" fills the last sheet from the cards waiting, or says why not', /Filled \d+ empty slots?/.test(card) || /already used|No card that is ready/.test(card));
    card = await ask('ask the ones with no photo for photos');
    await P.waitForSelector('[role=alertdialog]');
    chk('"ask … for photos" opens the request with its count; nothing is sent until it is confirmed',
      /Ask 1 person for a photo\?/.test(await P.innerText('[role=alertdialog]')) && /Opened the photo request for 1 person/.test(card));
    await P.click('[role=alertdialog] button:has-text("Cancel")');
    const beforeClear = await nOnSheet();
    card = await ask('clear the sheet');
    chk('"clear the sheet" takes every card off, and says how many', new RegExp('Took ' + beforeClear + ' cards? off the sheet').test(card) && (await nOnSheet()) <= 0);
    await P.click('.ids-ai-card >> nth=-1 >> button:has-text("Undo")');
    await P.waitForTimeout(200);
    chk('…with Undo', (await nOnSheet()) === beforeClear);
    card = await ask('print them and mark them printed');
    if ((await nOnSheet()) !== beforeClear || /Took/.test(card) || (await P.$('[role=alertdialog]'))) console.error('       print card: ' + card.replace(/\s+/g, ' ').slice(0, 300) + ' · on sheet ' + (await nOnSheet()) + ' of ' + beforeClear);
    chk('asked to print, it does not: Print stays a press', (await nOnSheet()) === beforeClear && !(await P.$('[role=alertdialog]')) && !/Took/.test(card));

    console.log('the conversation survives a refresh');
    const said = await P.innerText('.ids-ai-log');
    await P.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await P.waitForSelector('.ids-panes', { timeout: 30000 });
    if (!(await P.$('.ids-ai'))) await P.click('.ids-panes button:has-text("Assistant")');
    await P.waitForSelector('.ids-ai-log');
    chk('after a reload the transcript is still there', /clear the sheet/.test(await P.innerText('.ids-ai-log')) && /clear the sheet/.test(said));
    chk('…as a record: nothing in it is live, and no Undo comes back', !(await P.$('.ids-ai-card.is-live')) && !(await P.$('.ids-ai-card button:has-text("Undo")')));

    console.log('printing that has happened, reprint reasons, and undo in words');
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    card = await ask('What did we print last?');
    chk('"what did we print last?" reads the print log: the run, its cards and who printed it', /The last run was/.test(card) && /CRUN-/.test(card) && /3 cards/.test(card));
    await P.click('.ids-ai-card >> nth=-1 >> button:has-text("Open CRUN-")');
    await P.waitForSelector('.ids-drawer', { timeout: 8000 });
    chk('…and opens that run from the answer', /CRUN-/.test(await P.innerText('.ids-drawer')));
    await P.keyboard.press('Escape');
    card = await ask('What did we print today?');
    chk('"what did we print today?" counts today’s cards across the runs', /cards? printed today/.test(card));
    card = await ask('Who hasn’t been asked for a photo yet?');
    chk('"who hasn’t been asked?" names only the people with no photo who were not asked', /Gbenga Nophoto/.test(card) && /been asked in the last 3 days/.test(card));
    card = await ask('Reprint 025-103, she lost it');
    chk('"she lost it" is understood as a lost card, which gets a new QR', /lost: new QR/.test(card));
    card = await ask('undo');
    chk('"undo" in words undoes the newest change', /back as it was/.test(card) && (await nOnSheet()) <= 0);
    card = await ask('undo');
    chk('…and says so when there is nothing left to undo', /nothing of mine to undo/.test(card));


    console.log('a request it cannot read, and the keys');
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    const before = await nOnSheet();
    card = await ask('hello there');
    if (!/couldn’t tell/.test(card)) console.error('       hello card: ' + card.replace(/\s+/g, ' ').slice(0, 300));
    chk('it says it could not tell, and changes nothing', /couldn’t tell what to print/.test(card) && (await nOnSheet()) === before);
    await P.type('#ids-ai-in', '@Bay');
    await P.waitForSelector('.ids-ai-pop li');
    await P.keyboard.press('Enter');
    chk('"@" tags a person by their printed ID', /025-?00|026-002/.test(await P.inputValue('#ids-ai-in')));
    await P.keyboard.press('Escape');
    chk('Escape with text in the composer clears the text first', (await P.inputValue('#ids-ai-in')) === '' && !!(await P.$('.ids-ai')));
    await P.keyboard.press('Escape');
    await P.waitForTimeout(150);
    chk('…then closes the pane, back to Settings', !(await P.$('.ids-ai')) && !!(await P.$('.ids-set')));
    await P.evaluate(() => document.activeElement && document.activeElement.blur());
    await P.keyboard.press('/');
    await P.waitForTimeout(200);
    chk('"/" opens the assistant and goes to the composer, the transcript kept', await P.evaluate(() => document.activeElement && document.activeElement.id === 'ids-ai-in') && /hello there/.test(await P.innerText('.ids-ai-log')));
    await P.keyboard.press('ArrowUp');
    const upVal = await P.inputValue('#ids-ai-in');
    chk('↑ in the empty composer brings back the last request', upVal === 'hello there');
    if (upVal !== 'hello there') console.error('       composer holds: ' + JSON.stringify(upVal));
    await P.fill('#ids-ai-in', '');
    await P.click('.ids-ai-bar button[aria-label="New conversation"]');
    chk('recent requests come back as starters', (await P.$$('.ids-ai-starter.is-recent')).length >= 1);

    console.log('tablet (900): the side panel is a drawer');
    await P.setViewportSize({ width: 900, height: 800 });
    await P.waitForTimeout(400);
    chk('two columns: no settings column until asked', !(await P.$('.ids-set')) && !(await P.$('.ids-ai')) && !!(await P.$('.ids-sheetcol')));
    await P.click('.ids-panes button:has-text("Settings")');
    chk('Settings opens as a drawer over the sheet', !!(await P.$('.ids-pane-drawer .ids-set')));
    await P.keyboard.press('Escape');
    await P.waitForTimeout(150);
    chk('Escape closes the drawer and returns focus to its trigger', !(await P.$('.ids-pane-drawer')) && /Settings/.test(await P.evaluate(() => document.activeElement && document.activeElement.textContent)));

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
