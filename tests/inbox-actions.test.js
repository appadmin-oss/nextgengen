#!/usr/bin/env node
/* ============================================================================
   The Control Room inbox, item by item: every kind can be acted on from the
   pane, and the pane says what matters before the desk has to work it out.

   Seeded with the cases that come in every week:
     · a parent asking about dues — recognised as Tobi's parent, the reply
       box already holding a reply about Tobi's account, one press from his
       record;
     · a message saying a child was hurt — at the top, flagged to read first;
     · an application with no photo — "Ask for something" drafts the request
       for the photo, emails it, and the application stays, now in hand;
     · waitlisting it — the family is told in the drafted words, which are
       kept on the application;
     · a comment handing out a phone number on a children's site — flagged,
       and Approve is no longer the obvious button.

   Run:  node tests/inbox-actions.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.INBOX_ACT_PORT || '8293';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-inboxact-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'inbox');
const MAILS = path.join(TMP, 'mail.jsonl');
const mails = () => fs.existsSync(MAILS) ? fs.readFileSync(MAILS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

let _seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util', 'bootstrap', 'session'].map(f => `require_once ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
    + `db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
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
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  inbox actions: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => ''], 'test_sink' => ${JSON.stringify(MAILS)}],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'inbox_act_test_secret_0123456789abcdefg',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  const errs = [];
  try {
    const ids = JSON.parse(php(`db_migrate(db_conn());
      db_insert('centres', ['centreId'=>'CEN-IA-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'NGG-IA-ADM','fullName'=>'Desk Admin','email'=>'desk@example.org','type'=>'NGG','status'=>'active','role'=>'super_admin','centre'=>'Egbeda','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('members', ['memberId'=>'NGG-IA-KID','fullName'=>'Tobi Adewale','email'=>'tobi@example.org','parentEmail'=>'mum.adewale@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','displayId'=>'026-071','createdAt'=>now_iso(),'updatedAt'=>now_iso()]);
      db_insert('contact_messages', ['ref'=>'MSG-IA-1','purpose'=>'general','name'=>'Funke Adewale','email'=>'mum.adewale@example.org','subject'=>'Dues','message'=>'Good afternoon, how do I pay the dues for this month? I could not find the account number.','status'=>'new','createdAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-7200)]);
      db_insert('contact_messages', ['ref'=>'MSG-IA-2','purpose'=>'general','name'=>'Bisi Okon','email'=>'bisi@example.org','subject'=>'Last Saturday','message'=>'My son came home hurt after Saturday and would not say what happened. Please call me.','status'=>'new','createdAt'=>gmdate('Y-m-d\\TH:i:s\\Z', time()-60)]);
      $aid = db_insert('applications', ['kind'=>'teen','name'=>'Ada Okafor','firstName'=>'Ada','lastName'=>'Okafor','email'=>'okafor.family@example.org','program'=>'anchor','centre'=>'Egbeda','dob'=>'2013-05-01','status'=>'new','why'=>'I want to learn to code.','createdAt'=>now_iso()]);
      db_insert('posts', ['postId'=>'P-IA-1','slug'=>'robotics-day','kind'=>'post','title'=>'Robotics day','status'=>'published','createdAt'=>now_iso()]);
      db_insert('post_comments', ['commentId'=>'CM-IA-1','postId'=>'P-IA-1','memberId'=>'NGG-IA-KID','memberName'=>'Tobi','body'=>'This was great!! add me on whatsapp 08031234567','status'=>'pending','createdAt'=>now_iso()]);
      echo json_encode(['app' => $aid]);`));
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-IA-ADM'"), true);`);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addCookies([{ name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
      { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    let P = await ctx.newPage();
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const fresh = async () => { try { await P.close(); } catch (_) {} P = await ctx.newPage(); P.on('pageerror', e => errs.push(String(e).slice(0, 200))); };
    const until = (fn, arg, ms) => P.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const pane = () => P.evaluate(() => (document.querySelector('.cr-ib-pane') || document.body).innerText);
    const pick = async who => { await P.click('.cr-ib-list :text("' + who + '")'); await until(w => ((document.querySelector('.cr-ib-pane h2') || {}).textContent || '') === w, who); };

    // ── Messages ──
    await P.goto(BASE + '/control/inbox/messages', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await until(() => /Funke Adewale/.test(document.body.innerText), null, 60000);
    const order = await P.evaluate(() => Array.from(document.querySelectorAll('.cr-ib-rowbtn')).map(x => x.innerText).join('\n'));
    chk('messages: the one about a hurt child is above the older one about dues', order.indexOf('Bisi Okon') > -1 && order.indexOf('Bisi Okon') < order.indexOf('Funke Adewale'));
    await pick('Bisi Okon');
    let t = await pane();
    chk('messages: …and it says to read it first, and why', /Mentions “hurt”/.test(t) && /safeguarding/.test(t));
    await pick('Funke Adewale');
    t = await pane();
    chk('messages: a parent is recognised as Tobi’s parent', /Parent of Tobi Adewale/.test(t));
    const draft = await P.inputValue('.cr-ib-pane textarea');
    chk('messages: the reply box already holds a reply about Tobi’s account, in full sentences', /^Hello Funke,/.test(draft) && /Tobi’s account/.test(draft) && /I’ve paid/.test(draft) && /Desk Admin/.test(draft));
    chk('messages: …and Tobi’s record is one press away', await P.isVisible('.cr-ib-pane button:has-text("Open Tobi’s record")'));
    await P.screenshot({ path: path.join(SHOTS, 'message-known-parent.png') });
    await P.click('.cr-ib-pane button:has-text("Open Tobi’s record")');
    chk('messages: …which opens his record', await until(() => /\/control\/members/.test(location.pathname) && /Tobi Adewale/.test(document.body.innerText), null, 20000));

    // ── Applications ──
    await fresh();
    await P.goto(BASE + '/control/inbox/applications', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await until(() => /Ada Okafor/.test(document.body.innerText), null, 60000);
    await pick('Ada Okafor');
    t = await pane();
    chk('applications: a missing photo is named, with what to do about it', /No photo yet/.test(t) && /Ask for something/.test(t));
    await P.click('.cr-ib-pane .cr-ib-decide button:has-text("Ask for something")');
    const ask = await P.inputValue('.cr-ib-pane textarea');
    chk('applications: the request is drafted — the photo, why, and how to send it', /a clear, recent photo of Ada/.test(ask) && /ID card/.test(ask) && /reply to this email/i.test(ask));
    await P.screenshot({ path: path.join(SHOTS, 'application-ask.png') });
    await P.click('.cr-ib-pane .cr-ib-compose-f button:has-text("Ask for something")');
    await until(() => /Asked ·|email did not go/.test(document.body.innerText), null, 15000);
    const app = JSON.parse(php(`echo json_encode(db_row("SELECT status, messages FROM applications WHERE id = ${ids.app}"));`));
    const said = JSON.parse(app.messages || '[]');
    chk('applications: the ask is emailed to the family\'s address', mails().some(m => m.to === 'okafor.family@example.org' && /clear, recent photo/.test(m.html)));
    chk('applications: what was asked is kept on the application, and it is now in hand', said.length === 1 && said[0].what === 'ask' && /clear, recent photo/.test(said[0].text) && app.status === 'reviewing');
    chk('applications: …and the application stays in the inbox, the ask in its thread', (await pane()).includes('a clear, recent photo of Ada') && await P.isVisible('.cr-ib-list :text("Ada Okafor")'));
    await P.click('.cr-ib-pane .cr-ib-decide button:has-text("Waitlist")');
    const wl = await P.inputValue('.cr-ib-pane textarea');
    chk('applications: waitlisting drafts the message to the family', /on our waiting list/.test(wl) && /nothing more you need to do/.test(wl));
    await P.click('.cr-ib-pane .cr-ib-compose-f button:has-text("Waitlist")');
    await until(() => /Waitlisted ·/.test(document.body.innerText), null, 15000);
    const app2 = JSON.parse(php(`echo json_encode(db_row("SELECT status, messages FROM applications WHERE id = ${ids.app}"));`));
    const said2 = JSON.parse(app2.messages || '[]');
    chk('applications: …and the family is emailed those words', mails().some(m => m.to === 'okafor.family@example.org' && /waiting list/.test(m.subject)));
    chk('applications: waitlisted, with the message to the family kept on it', app2.status === 'waitlist' && said2.length === 2 && said2[1].what === 'waitlist' && /waiting list/.test(said2[1].text));

    // ── Comments ──
    await fresh();
    await P.goto(BASE + '/control/inbox/comments', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await until(() => /Robotics day/.test(document.body.innerText), null, 60000);
    await P.click('.cr-ib-list :text("Robotics day")').catch(() => {});
    await until(() => /contact details/.test((document.querySelector('.cr-ib-pane') || {}).innerText || ''));
    t = await pane();
    chk('comments: a phone number on a children’s site is flagged, with what to do', /shares contact details/.test(t) && /reject it/.test(t));
    const approvePrimary = await P.evaluate(() => { const b = Array.from(document.querySelectorAll('.cr-ib-pane button')).find(x => x.textContent.trim().startsWith('Approve')); return b ? b.className : ''; });
    chk('comments: …and Approve is no longer the obvious button', approvePrimary !== '' && !/is-primary/.test(approvePrimary));
    await P.screenshot({ path: path.join(SHOTS, 'comment-contact.png') });

    chk('no page errors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''), errs.length === 0);
  } catch (e) {
    console.error(e); failed++;
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    cleanup();
    console.log('\n' + (failed ? `❌ FAIL: ${passed} passed, ${failed} failed` : `✅ PASS: ${passed} passed, 0 failed`));
    process.exit(failed ? 1 : 0);
  }
})();
