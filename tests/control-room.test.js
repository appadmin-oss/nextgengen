#!/usr/bin/env node
/* ============================================================================
   Control Room v2 (/control), end to end against the real PHP backend.
   CONTROL_ROOM.md §8: the shell at its breakpoints, the palette, the queue
   (j/k, resolve, Undo, all clear), forms, the drawer, density, Ask overlay,
   the phone tree, and the old addresses forwarding.

   Run:  node tests/control-room.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CR_PORT || '8291';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-cr-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-CR-ADM';

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
  if (!chromium) { console.log('⏭  control room: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'control_room_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    let seed = `db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-CR-1','name'=>'Egbeda','code'=>'EG','color'=>'#e9a21b','status'=>'active','slug'=>'egbeda','createdAt'=>${now}]);`
      + `db_insert('members', ['memberId'=>'${ADMIN}','fullName'=>'Adaeze Okafor','email'=>'adaeze@afrovanguard.org.ng','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','totpSecret'=>'JBSWY3DPEHPK3PXP','createdAt'=>${now},'updatedAt'=>${now}]);`;
    for (let i = 1; i <= 8; i++) {
      seed += `db_insert('members', ['memberId'=>'NGG-CR-${i}','fullName'=>'Member ${String.fromCharCode(64 + i)} Test','email'=>'cr${i}@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','track'=>'Technology','createdAt'=>${now},'updatedAt'=>${now}]);`;
    }
    // Three things waiting: two applications and a contact message.
    seed += `db_insert('applications', ['kind'=>'teen','program'=>'ngg','name'=>'Chiamaka Eze','email'=>'ce@example.org','age'=>14,'centre'=>'Egbeda','track'=>'Technology','status'=>'new','why'=>'I want to build an app.','createdAt'=>gmdate('Y-m-d\\\\TH:i:s\\\\Z', time()-4*86400)]);`
      + `db_insert('applications', ['kind'=>'teen','program'=>'summer','name'=>'Samuel Afolabi','email'=>'sa@example.org','age'=>16,'centre'=>'Egbeda','track'=>'Business','status'=>'new','why'=>'Runs a stall.','createdAt'=>gmdate('Y-m-d\\\\TH:i:s\\\\Z', time()-86400)]);`
      + `db_insert('contact_messages', ['ref'=>'MSG-1','purpose'=>'general','name'=>'Funke Adeyemi','email'=>'fa@example.org','phone'=>'08021234118','subject'=>'Pick-up time changed?','message'=>'Is Saturday ending at 3pm now?','status'=>'new','createdAt'=>${now}]);`;
    php(seed, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${ADMIN}'"), true);`, ['session']);
    const errs = [];
    const open = async (w, h, at) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
      p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource|\[BABEL\]/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
      await p.goto(BASE + (at || '/control'), { waitUntil: 'domcontentloaded' });
      await waitForBoot(p);
      await p.waitForSelector('.cr-app', { timeout: 30000 });
      return p;
    };
    const toastHas = (p, re) => p.waitForFunction(src => new RegExp(src).test((document.querySelector('.cr-toast') || {}).innerText || ''), re.source, { timeout: 8000 }).then(() => true, () => false);

    console.log('desktop (1440) — the shell and Home');
    const P = await open(1440, 900);
    await P.waitForSelector('.cr-side', { timeout: 20000 });
    chk('it opens at /control with the sidebar, the top bar and Home', new URL(P.url()).pathname === '/control' && !!(await P.$('.cr-top')) && /Home/.test(await P.innerText('.cr-head h1')));
    await P.waitForSelector('.cr-att-row', { timeout: 20000 });
    const att = await P.$$eval('.cr-att-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
    chk('Needs you lists the queues, oldest first (applications waited 4 days)', /Applications to review/.test(att[0]) && /2/.test(att[0]) && att.some(x => /Unread messages/.test(x)));
    chk('the inbox badge counts what is waiting', (await P.innerText('.cr-nav-item:has-text("Inbox") .cr-badge')).trim() === '3');
    await P.screenshot({ path: path.join(TMP, '..', 'cr-home.png') }).catch(() => {});

    console.log('the Inbox workspace');
    await P.click('.cr-nav-item:has-text("Inbox")');
    await P.waitForSelector('.cr-ib-row', { timeout: 20000 });
    chk('Inbox opens at /control/inbox on All, with every waiting item', new URL(P.url()).pathname === '/control/inbox' && (await P.$$('.cr-ib-row')).length === 3);
    chk('the views come from the registry, each with its own count',
      (await P.getAttribute('.cr-ib-view[aria-current="page"]', 'aria-label')) === 'All, 3 waiting' && (await P.getAttribute('.cr-ib-view[title="Applications"]', 'aria-label')) === 'Applications, 2 waiting');
    chk('the tab title carries what is waiting', /^\(3\) Inbox/.test(await P.title()));
    chk('the list is triaged: the application waiting 4 days is overdue and first',
      /overdue/i.test(await P.innerText('.cr-ib-ghead >> nth=0')) && /Chiamaka/.test(await P.innerText('.cr-ib-row >> nth=0')));
    const selName = async () => (await P.innerText('.cr-ib-row.is-on .cr-ib-row1 b')).trim();
    const sel0 = await selName();
    await P.keyboard.press('j');
    const sel1 = await selName();
    chk('j moves down the list', sel0 !== sel1);
    await P.keyboard.press('k');
    chk('k moves back up', (await selName()) === sel0);
    await P.fill('.cr-ib-tools input', 'pick-up');
    chk('search finds the message by its subject', (await P.$$('.cr-ib-row')).length === 1 && /Funke/.test(await P.innerText('.cr-ib-row')));
    await P.fill('.cr-ib-tools input', '');

    await P.click('.cr-ib-view[title="Applications"]');
    await P.waitForFunction(() => location.pathname === '/control/inbox/applications');
    chk('a view has its own address, and switching does not reload', (await P.$$('.cr-ib-row')).length === 2);
    const who = await selName();
    /* Waitlisting SAYS so: pressing 2 opens the drafted message to the family
       (cr-tab-inbox.jsx · crAppDraft), and sending it runs the decision. */
    await P.keyboard.press('2');
    await P.waitForSelector('.cr-ib-pane .cr-ib-compose textarea', { timeout: 10000 });
    chk('pressing 2 opens the second decision (Waitlist) with the message to the family drafted', /waiting list/.test(await P.inputValue('.cr-ib-pane .cr-ib-compose textarea')));
    await P.click('.cr-ib-pane .cr-ib-compose-f button:has-text("Waitlist")');
    chk('…sending it waitlists and offers Undo', await toastHas(P, /Waitlisted · [\s\S]*Undo/));
    const st = () => php(`echo db_row("SELECT status FROM applications WHERE name = '${who}'")['status'];`);
    chk('…and the server has it', st() === 'waitlist');
    chk('…the item leaves the list and the next is open', (await P.$$('.cr-ib-row')).length === 1 && (await selName()) !== who);
    await P.click('.cr-toast-undo');
    await P.waitForTimeout(600);
    chk('Undo puts it back, on the server too', st() === 'new' && (await P.$$('.cr-ib-row')).length === 2);

    console.log('replying in the app');
    await P.click('.cr-ib-view[title="Messages"]');
    await P.waitForSelector('.cr-ib-pane textarea', { timeout: 20000 });
    chk('a message opens as a conversation with its thread', /Is Saturday ending at 3pm now\?/.test(await P.innerText('.cr-ib-thread')));
    chk('…and a reply box, not a link to a mail program', !(await P.$('a[href^="mailto:"]')) && /Reply to fa@example\.org/.test(await P.innerText('.cr-ib-compose-h')));
    await P.click('button:has-text("Saved replies")');
    await P.click('.cr-ib-tpls .cr-menuitem:has-text("Session times")');
    chk('a saved reply fills in their name', /^Hello Funke,/.test(await P.inputValue('.cr-ib-pane textarea')));
    if (process.env.CR_SHOTS) await P.screenshot({ path: path.join(process.env.CR_SHOTS, 'inbox-reply.png') });
    await P.click('.cr-ib-compose-f button.is-primary');
    /* This test server has no mail transport, so the send is refused — which
       is the path that must be honest: nothing recorded, the words kept. */
    chk('a reply the mail relay refuses says so', await toastHas(P, /could not be sent|wasn’t sent/));
    chk('…records nothing', php(`echo db_row("SELECT COUNT(*) c FROM contact_replies")['c'];`) === '0');
    chk('…and keeps what was typed', /^Hello Funke,/.test(await P.inputValue('.cr-ib-pane textarea')));
    await P.waitForTimeout(1400);
    chk('opening a new message marks it read on the server', php(`echo db_row("SELECT status FROM contact_messages WHERE ref = 'MSG-1'")['status'];`) === 'read');
    await P.click('.cr-ib-quick button:has-text("Mark done")');
    chk('Mark done clears it, with Undo', await toastHas(P, /Done · Funke Adeyemi[\s\S]*Undo/)
      && php(`echo db_row("SELECT status FROM contact_messages WHERE ref = 'MSG-1'")['status'];`) === 'archived');
    chk('an emptied view says so, while other views still wait', /This view is clear/.test(await P.innerText('.cr-ib-list')));
    await P.screenshot({ path: path.join(TMP, '..', 'cr-inbox.png') }).catch(() => {});

    console.log('the Inbox at other widths');
    const SHOTS = process.env.CR_SHOTS || '';
    const W = await open(1440, 900, '/control/inbox');
    await W.waitForSelector('.cr-ib-row', { timeout: 20000 });
    chk('wide: the rail shows its labels', /Applications/.test(await W.innerText('.cr-ib-rail')));
    chk('wide: the conversation pane fills the rest, its composer on screen', await W.evaluate(() => {
      const f = document.querySelector('.cr-ib-act'); if (!f) return false;
      const r = f.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.top > 0;
    }));
    if (SHOTS) { await W.waitForTimeout(2500); await W.screenshot({ path: path.join(SHOTS, 'inbox-1440.png') }); }
    await W.context().close();
    const M = await open(390, 844, '/control/inbox');
    await M.waitForSelector('.cr-ib-row', { timeout: 20000 });
    chk('phone: no conversation is open until one is chosen', !(await M.$('.cr-ib-sheet')));
    if (SHOTS) { await M.waitForTimeout(2500); await M.screenshot({ path: path.join(SHOTS, 'inbox-390-list.png') }); }
    await M.click('.cr-ib-rowbtn >> nth=0');
    await M.waitForSelector('.cr-ib-sheet', { timeout: 8000 });
    chk('phone: a chosen item opens full screen, decisions at the bottom, with a way back',
      !!(await M.$('.cr-ib-sheet button[aria-label="Back to the list"]')) && !!(await M.$('.cr-ib-sheet .cr-ib-decide')));
    if (SHOTS) await M.screenshot({ path: path.join(SHOTS, 'inbox-390-open.png') });
    await M.click('.cr-ib-sheet button[aria-label="Back to the list"]');
    chk('phone: back returns to the list', !(await M.$('.cr-ib-sheet')));
    await M.context().close();

    console.log('palette (§4.1) and Escape order');
    await P.keyboard.press('Control+k');
    await P.waitForSelector('.cr-cmd');
    chk('⌘/Ctrl K opens the palette with the input focused', await P.evaluate(() => document.activeElement && document.activeElement.closest('.cr-cmd') !== null));
    await P.keyboard.type('mon');
    chk('typing ranks pages (Money first for “mon”)', /Money/.test(await P.innerText('.cr-cmd-opt[aria-selected="true"]')));
    await P.keyboard.press('Tab');
    chk('Tab switches scope', (await P.innerText('.cr-cmd-scope[aria-selected="true"]')) === 'Pages');
    await P.keyboard.press('Escape');
    chk('Escape closes the palette', !(await P.$('.cr-cmd')));
    await P.keyboard.press('/');
    await P.waitForSelector('.cr-cmd-in input:focus');
    await P.keyboard.type('zzzz');
    chk('no match says so', /Nothing called “zzzz”/.test(await P.innerText('.cr-cmd')));
    await P.keyboard.press('Escape');

    console.log('old addresses');
    const Q = await open(1280, 800, '/nextadmin?s=messages');
    await Q.waitForSelector('.cr-ib-view[aria-current="page"]', { timeout: 20000 });
    chk('/nextadmin?s=messages lands on Inbox › Messages at /control/inbox/messages', new URL(Q.url()).pathname === '/control/inbox/messages' && /Messages/.test(await Q.innerText('.cr-crumb')) && /^Messages/.test(await Q.getAttribute('.cr-ib-view[aria-current="page"]', 'aria-label')));
    await Q.context().close();

    console.log('image storage');
    /* A full Cloudinary plan, as the six-hourly check would have recorded it: the
       Diagnostics page must say so with the numbers, and offer both remedies. */
    php(`setting_set('media.usage', ['configured' => true, 'level' => 'critical', 'pct' => 97.0, 'plan' => 'Free', 'checkedAt' => gmdate('c'), 'error' => '',
      'parts' => ['credits' => ['usage' => 24.2, 'limit' => 25, 'pct' => 97.0], 'storage' => ['usage' => 1, 'limit' => 0, 'pct' => 61.0]]], 'test');`, ['bootstrap']);
    const D = await open(1280, 900, '/control/settings/ops');
    await D.waitForSelector('text=Image storage', { timeout: 30000 });
    const dtext = await D.evaluate(() => document.body.innerText);
    chk('Diagnostics shows image storage as full, with each part of the plan', /Full — new uploads are paused/.test(dtext) && /Plan credits\s*97% used/.test(dtext) && /Storage\s*61% used/.test(dtext));
    chk('…says what that does to uploads, and offers Check now and Free space', /photos are kept on this site instead/.test(dtext) && !!(await D.$('button:has-text("Check now")')) && !!(await D.$('button:has-text("Free space")')));
    chk('…and says photos on a spent account move only when needed, never in bulk', /move only when they are needed/.test(dtext) && !(await D.$('button:has-text("Move photos")')));
    await D.click('button:has-text("Free space")');
    await D.waitForSelector('text=Type FREE SPACE', { timeout: 10000 });
    chk('…and freeing space asks for the typed confirmation first', /Originals are not touched/.test(await D.evaluate(() => document.body.innerText)));
    await D.context().close();

    console.log('several Cloudinary accounts');
    /* A second account whose plan has room while the main one is full: the list
       says where uploads go, an account opens with its usage and its order
       controls, and adding one asks for the three keys. */
    php(`setting_set('media.accounts', [['id' => 'acc_t1', 'label' => 'Second plan', 'cloudName' => 'extra-one', 'apiKey' => '222222', 'secret' => ai_ui_seal('extrasecret1'), 'enabled' => true, 'addedAt' => now_iso(), 'addedBy' => 'x']], 'test');
      setting_set('media.usage.accounts', ['acc_t1' => ['configured' => true, 'level' => 'ok', 'pct' => 20.0, 'plan' => 'Free', 'checkedAt' => gmdate('c'), 'error' => '', 'parts' => ['credits' => ['usage' => 5, 'limit' => 25, 'pct' => 20.0]]]], 'test');`, ['bootstrap']);
    const MA = await open(1280, 900, '/control/settings/ops');
    await MA.waitForSelector('text=Cloudinary accounts', { timeout: 30000 });
    const mtext = await MA.evaluate(() => document.body.innerText);
    chk('the accounts list names the extra account, its cloud, and that new uploads go to it', /Second plan/.test(mtext) && /extra-one/.test(mtext) && /Uploads go here/.test(mtext));
    chk('…and never shows a secret', !/extrasecret1/.test(await MA.content()));
    await MA.click('text=Second plan');
    await MA.waitForSelector('button:has-text("Check usage now")', { timeout: 10000 });
    chk('an account opens with its usage and its controls', /20% used/.test(await MA.evaluate(() => document.body.innerText)) && !!(await MA.$('button:has-text("Pause uploads to it")')) && !!(await MA.$('button:has-text("Remove…")')));
    await MA.keyboard.press('Escape');
    await MA.click('button:has-text("Add an account…")');
    await MA.waitForSelector('text=Cloud name', { timeout: 10000 });
    chk('adding an account asks for the cloud name, API key and secret, and says they are checked', /API secret/.test(await MA.evaluate(() => document.body.innerText)) && /checked with Cloudinary/.test(await MA.evaluate(() => document.body.innerText)));
    await MA.context().close();
    php(`setting_set('media.accounts', null, 'test'); setting_set('media.usage.accounts', null, 'test');`, ['bootstrap']);

    console.log('testimonials waiting to be read');
    /* Two members said something about their session. One guardian granted
       "Feature on our website", the other never answered. The queue must make
       that difference visible BEFORE anybody presses anything — and must not
       draw a Publish button that the server would refuse. */
    php(`db_insert('testimonials', ['tid'=>'TST-YES','memberId'=>'NGG-CR-1','unitId'=>'U-1','course'=>'Technology','centre'=>'Egbeda','body'=>'I built a calculator that actually works.','showAs'=>'first','status'=>'new','createdAt'=>now_iso()]);
      db_insert('testimonials', ['tid'=>'TST-NO','memberId'=>'NGG-CR-2','unitId'=>'U-1','course'=>'Technology','centre'=>'Egbeda','body'=>'I was scared of the keyboard and now I am not.','showAs'=>'initials','status'=>'new','createdAt'=>now_iso()]);
      consent_record('NGG-CR-1', 'site_visibility', 'granted', 'Paper form', 'Test');`, ['bootstrap']);
    const T = await open(1280, 900, '/control/inbox/testimonials');
    await T.waitForSelector('.cr-ib-row', { timeout: 20000 });
    chk('the queue lists what members said, newest work first', (await T.$$('.cr-ib-row')).length === 2);
    const openSay = async (who) => {
      await T.click(`.cr-ib-row:has-text("${who}")`);
      await T.waitForFunction(w => ((document.querySelector('.cr-ib-pane h2') || {}).innerText || '').indexOf(w) === 0, who, { timeout: 8000 });
    };
    await openSay('Member A');
    const yes = await T.evaluate(() => document.querySelector('.cr-ib-pane').innerText);
    chk('a consented one can be published, and says how it will be signed',
      !!(await T.$('.cr-ib-pane button:has-text("Publish")')) && /first name and age/.test(yes) && /Guardian granted/.test(yes));
    await openSay('Member B');
    const no = await T.evaluate(() => document.querySelector('.cr-ib-pane').innerText);
    chk('without that consent there is NO Publish button to press, and it says why',
      !(await T.$('.cr-ib-pane button:has-text("Publish")')) && /has not granted/.test(no));
    chk('…and the words are still readable, because they are useful to staff either way',
      /scared of the keyboard/.test(no) && !!(await T.$('.cr-ib-pane button:has-text("Not this one")')));
    await openSay('Member A');
    await T.click('.cr-ib-pane button:has-text("Publish")');
    chk('publishing says it is live and offers Undo', await toastHas(T, /home page[\s\S]*Undo/));
    chk('…and the public page now carries it, signed the way the MEMBER chose',
      php(`$r = public_testimonials(); echo count($r['testimonials']) . '|' . ($r['testimonials'][0]['from'] ?? '');`, ['bootstrap']) === '1|Member');
    await T.context().close();
    php(`db_exec("DELETE FROM testimonials"); db_exec("DELETE FROM consents");`, ['bootstrap']);

    // One focus ring on a framed search field: the frame's, never a second on the bare input inside it.
    const R = await open(1366, 768, '/control/members');
    await R.waitForSelector('[role=search] input', { timeout: 30000 });
    await R.focus('[role=search] input'); await R.keyboard.press('Shift+Tab'); await R.keyboard.press('Tab');
    const ring = await R.$eval('[role=search] input', el => ({ focused: document.activeElement === el, inner: getComputedStyle(el).outlineStyle, frame: getComputedStyle(el.parentElement).boxShadow }));
    chk('the members search draws one focus ring, on its frame, not a second on the input inside it', ring.focused && ring.inner === 'none' && ring.frame !== 'none');
    await R.context().close();

    /* Conduct and progression: each row says what it does and goes where that
       is done — not "Review" on every row, opening a filtered list. */
    php(`db_insert('sanctions', ['personId'=>'NGG-CR-1','personType'=>'member','kind'=>'fine','tier'=>1,'amount'=>2000,'status'=>'active','reason'=>'late','issuedAt'=>now_iso(),'issuedBy'=>'t']);
         db_insert('sanctions', ['personId'=>'NGG-CR-2','personType'=>'member','kind'=>'suspension','tier'=>2,'status'=>'proposed','reason'=>'proposed','issuedAt'=>now_iso(),'issuedBy'=>'t']);`, ['bootstrap']);
    const C = await open(1366, 900, '/control/members');
    await C.waitForFunction(() => /Conduct and progression/.test(document.body.innerText), null, { timeout: 30000 });
    const rows = await C.$$eval('.cr-att-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
    const decide = rows.find(x => /to decide/.test(x)) || '', owe = rows.find(x => /owing a fine/.test(x)) || '';
    chk('conduct: a sanction to decide says Decide, and an owed fine says Collect with the amount', /Decide/.test(decide) && /Collect/.test(owe) && /₦2,000/.test(owe) && !rows.some(x => /^\d+ fined\b/.test(x)));
    /* Records needing attention: the fixes, not "Review". A gap a family can
       fill is asked for in one press, after a confirm that reads the count. */
    const rec = rows.find(x => /with no date of birth/.test(x)) || '';
    chk('records: a missing date of birth offers to ask the families, children with no guardian contact come first',
      /Ask families/.test(rec) && rows.findIndex(x => /guardian contact/.test(x)) < rows.findIndex(x => /date of birth/.test(x)) && !rows.some(x => /Review$/.test(x)));
    await C.click('.cr-att-row:has-text("with no date of birth")');
    await C.waitForSelector('.cr-confirm', { timeout: 10000 });
    const ask = await C.innerText('.cr-confirm');
    await C.click('.cr-confirm .is-primary');
    await C.waitForFunction(() => /Emailed/.test((document.querySelector('.cr-toast') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
    const said = await C.evaluate(() => (document.querySelector('.cr-toast') || {}).innerText || '');
    chk('records: …it asks first, naming how many, then says what was sent', /^Ask \d+ famil/.test(ask) && /Emailed \d+ famil/.test(said));
    await C.click('.cr-att-row:has-text("to decide")');
    await C.waitForFunction(() => /\/control\/money\/conduct/.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
    chk('conduct: …Decide opens Conduct & fines, where it is decided', /\/control\/money\/conduct/.test(new URL(C.url()).pathname));
    await C.context().close();
    php(`db_exec("DELETE FROM sanctions WHERE personId LIKE 'NGG-CR-%'");`, ['bootstrap']);

    /* No attention row anywhere says only "Review". CrAttention still draws a
       row declared without an `act`, but marks it [data-act-missing] — this is
       what catches it. Home: a waiting message says Reply and opens Messages. */
    php(`db_insert('contact_messages', ['ref'=>'CR-ACT-1','name'=>'A parent','email'=>'p@example.invalid','subject'=>'Hello','message'=>'Hi','status'=>'new','createdAt'=>now_iso()]);`, ['bootstrap']);
    const H = await open(1366, 900, '/control');
    await H.waitForFunction(() => /Unread messages/.test(document.body.innerText), null, { timeout: 30000 });
    const hrows = await H.$$eval('.cr-att-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
    const msg = hrows.find(x => /Unread messages/.test(x)) || '';
    chk('home: every "Needs you" row names what it does — none is a bare Review, none is missing its verb',
      hrows.length > 0 && !hrows.some(x => /\bReview$/.test(x)) && !(await H.$('[data-act-missing]')));
    chk('home: …a waiting message says Reply, and why it matters', /Reply$/.test(msg) && /waiting for a reply/.test(msg));
    await H.click('.cr-att-row:has-text("Unread messages")');
    await H.waitForFunction(() => /\/control\/inbox\/messages/.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
    chk('home: …Reply opens the Messages inbox, where it is answered', /\/control\/inbox\/messages/.test(new URL(H.url()).pathname));
    await H.context().close();
    php(`db_exec("DELETE FROM contact_messages WHERE ref = 'CR-ACT-1'");`, ['bootstrap']);
    const M2 = await open(1366, 900, '/control/members');
    await M2.waitForFunction(() => /Records needing attention/.test(document.body.innerText), null, { timeout: 30000 });
    const mrows = await M2.$$eval('.cr-att-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
    chk('members dashboard: no attention row is a bare Review or missing its verb', !mrows.some(x => /\bReview$/.test(x)) && !(await M2.$('[data-act-missing]')));
    await M2.context().close();

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
    console.log(`\n${failed ? '❌ FAIL' : '✅ PASS'}: ${passed} passed, ${failed} failed (control room)`);
    process.exit(failed ? 1 : 0);
  }
})();
