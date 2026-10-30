#!/usr/bin/env node
/* ============================================================================
   Official notices, end to end: the Management notice pasted as it was written
   for WhatsApp, checked as a draft, published to a centre, read and
   acknowledged by a member and by a parent from their family account, and
   counted at the desk. Real PHP server, real sessions.

   Run:  node tests/notices.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.NOTICES_PORT || '8295';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-notices-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'notices');

let _seq = 0;
function php(snippet, extra = ['bootstrap']) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};`
    + ['response', 'db', 'util'].concat(extra).map(f => `require ${JSON.stringify(ROOT + '/api/_lib/' + f + '.php')};`).join('')
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

async function pageFor(memberId, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), true);`, ['session']);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
  await ctx.addCookies([
    { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
    { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
  ]);
  return ctx.newPage();
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  notices: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'notices_test_secret_0123456789abcdef',
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
    const mk = (id, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'X ${id}','email'=>strtolower('${id}').'@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Ikotun','createdAt'=>now_iso(),'updatedAt'=>now_iso()], ${extra}));`;
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-NT-1','name'=>'Ikotun','code'=>'IK','status'=>'active','slug'=>'ikotun','createdAt'=>now_iso()]);`
      + mk('NGG-NT-ADM', "['role'=>'super_admin','fullName'=>'Notices Admin','centre'=>'']")
      + mk('NGG-NT-1', "['fullName'=>'Musa Lateef']") + mk('NGG-NT-2', "['fullName'=>'Grace Obi']")
      + `db_insert('guardians', ['guardianId'=>'GRD-NT-1','email'=>'mrs.obi@example.org','fullName'=>'Mrs Obi','status'=>'active','sessionEpoch'=>1,'createdAt'=>now_iso()]);`
      + `db_insert('guardian_wards', ['linkId'=>'LNK-NT-1','guardianId'=>'GRD-NT-1','memberId'=>'NGG-NT-2','relationship'=>'parent','status'=>'active','createdAt'=>now_iso()]);`);
    const notice = fs.readFileSync(path.join(ROOT, 'api', 'tests', 'sts-notice.txt'), 'utf8');

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(fs) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const P = await pageFor('NGG-NT-ADM');
    P.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const text = pg => pg.evaluate(() => document.body.innerText);
    const dlg = 'form[role="dialog"]';

    const paste = (pg, t, html) => pg.evaluate(([t, html]) => {
      const el = document.querySelector('#nte-body'); el.focus();
      const dt = new DataTransfer(); dt.setData('text/plain', t); if (html) dt.setData('text/html', html);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [t, html || '']);
    const val = (pg, sel) => pg.$eval(sel, e => e.value);

    // ── The desk: a notice is written on the page, like a document ──
    await P.goto(BASE + '/control/comms/broadcast', { waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    chk('Announcements opens on notices, with “New notice”', await until(P, () => /New notice/.test(document.body.innerText) && /Notices published/.test(document.body.innerText), null, 60000));
    await P.click('button:has-text("New notice")');
    chk('“New notice” opens the editor on its own address — a blank page: a title and a message, nothing else asked',
      await until(P, () => !!document.querySelector('.nte .nte-paper #nte-body'))
      && new URL(P.url()).pathname === '/control/comms/broadcast/new'
      && (await P.locator('.nte .nte-in.nt-org').count()) === 0 && (await P.locator('.nte-add:has-text("Letterhead")').count()) === 1
      && (await P.locator('.nte-paper textarea[aria-label="Title"]').count()) === 1);
    chk('…the title has the focus, so writing starts at once', await P.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'Title'));
    await P.screenshot({ path: path.join(SHOTS, 'editor-blank.png') });
    chk('the formatting band sits above the page, never over the words, with paragraph styles named “Text” and “Heading”',
      await P.evaluate(() => document.querySelector('.nte-format').getBoundingClientRect().bottom <= document.querySelector('.nte-desk').getBoundingClientRect().top + 1)
      && (await P.locator('.nte-tool.is-label:has-text("Text")').count()) === 1 && (await P.locator('.nte-tool.is-label:has-text("Heading")').count()) === 1);
    chk('the panel says what will happen first: who it goes to, in a sentence', /To Everyone/.test(await P.locator('.nte-sum').innerText()) && /Reaches 3 members and their families/.test(await P.locator('.nte-sum').innerText()));

    // Paste the whole Management notice onto the empty page.
    await paste(P, notice);
    chk('pasting a whole notice fills every part: letterhead, kind, subject, the body and the sign-off',
      await until(P, () => document.querySelectorAll('#nte-body h3').length >= 7, null, 20000)
      && await val(P, '.nte-in.nt-org') === 'STREET TO STARDOM (STS)' && /MANAGEMENT OFFICIAL NOTICE/.test(await val(P, '.nte-in.nt-kind'))
      && /^REVISED SATURDAY RESUMPTION/.test(await val(P, '.nte-paper textarea[aria-label="Subject"]')) && await val(P, '.nte-in.nt-sign') === 'STS MANAGEMENT');
    const ed = P.locator('#nte-body');
    chk('…the body is the formatted notice, editable in place — sections are headings, dashes a list, no asterisks',
      (await ed.locator('li').count()) >= 15 && (await ed.locator('strong, b').count()) >= 2 && !/\*[A-Z]/.test(await ed.innerText()));
    await P.selectOption('#nte-aud', 'Ikotun');
    await P.click('button[role="switch"][aria-label="Ask readers to acknowledge it"]');
    chk('it saves itself as a draft, and the address becomes the notice’s own', await until(P, () => /\/broadcast\/NTC-[^/]+\/edit$/.test(location.pathname) && /^Saved/.test((document.querySelector('.nte-state') || {}).innerText || ''), null, 20000));
    const fid = () => php(`echo db_row("SELECT noticeId FROM notices ORDER BY id LIMIT 1")['noticeId'];`);
    chk('…and what it stored is the WhatsApp text: the same sections, list and sign-off as the notice pasted',
      php(`$o = notice_parse(file_get_contents(${JSON.stringify(path.join(ROOT, 'api', 'tests', 'sts-notice.txt'))})); $n = db_row("SELECT * FROM notices LIMIT 1");`
        + `$a = notice_html($o['body']); $b = notice_html($n['body']);`
        + `echo (substr_count($a, '<h3') === substr_count($b, '<h3') && substr_count($a, '<li') === substr_count($b, '<li') && $n['audience'] === 'Ikotun' && (int)$n['needsAck'] === 1 && $n['signoff'] === 'STS MANAGEMENT' && strpos($n['body'], '1. *') !== false) ? 'y' : 'n:' . substr_count($a, '<h3') . '/' . substr_count($b, '<h3') . ' ' . substr_count($a, '<li') . '/' . substr_count($b, '<li');`) === 'y');

    // Write on the page with the toolbar, as in a document.
    await ed.click();
    await P.keyboard.press('Control+End');
    await P.keyboard.press('Enter');
    await P.click('.nte-tool[aria-label="Bold"]');
    await P.keyboard.type('Bring your ID card.');
    chk('the toolbar says what the caret is in (Bold pressed while typing bold)', await until(P, () => document.querySelector('.nte-tool[aria-label="Bold"]').getAttribute('aria-pressed') === 'true', null, 5000));
    chk('…and what is typed is saved as WhatsApp bold, at the end of the body', await until(P, () => /^Saved/.test(document.querySelector('.nte-state').innerText), null, 20000)
      && /\*Bring your ID card\.\*\s*$/.test(php(`echo db_row("SELECT body FROM notices LIMIT 1")['body'];`)));
    await P.screenshot({ path: path.join(SHOTS, 'editor-official.png') });
    await P.click('.nte-bar button:has-text("Preview")');
    chk('Preview shows it exactly as members will read it', await until(P, () => /Subject: REVISED SATURDAY RESUMPTION/.test(document.body.innerText) && !!document.querySelector('.nte .nt-doc h3'), null, 20000));
    chk('a draft reaches nobody yet', php(`echo (int)db_row("SELECT COUNT(*) c FROM notifications WHERE kind = 'notice'")['c'];`) === '0');

    // ── Publish ──
    await P.click('.nte-bar button:has-text("Publish…")');
    await P.waitForSelector('[role="alertdialog"]');
    chk('the confirm says how many it is about to reach', /2 members and their families/.test(await P.locator('[role="alertdialog"]').innerText()));
    await P.click('[role="alertdialog"] .cr-confirm-acts button:has-text("Publish")');
    chk('published: both members have it in their feed, and the family account once', await until(P, () => /Published · 2 members · 1 family account/.test(document.body.innerText), null, 20000)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM notifications WHERE kind = 'notice' AND linkPage = 'notice'")['c'];`) === '2'
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM guardian_notices WHERE kind = 'notice' AND sign = 1")['c'];`) === '1');
    const id = fid();
    chk('…and the desk leaves the editor for the notice itself', await until(P, id => location.pathname === '/control/comms/broadcast/' + id && !document.querySelector('.nte'), id, 20000));

    // ── A member reads it and acknowledges ──
    const M = await pageFor('NGG-NT-1');
    M.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await M.goto(BASE + '/notice/' + id, { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    chk('a member opens /notice/<id> and reads the formatted notice', await until(M, () => /LATENESS AND DISCIPLINARY MEASURES/.test(document.body.innerText) && /I have read and understood this notice/.test(document.body.innerText), null, 60000));
    await M.screenshot({ path: path.join(SHOTS, 'member.png'), fullPage: true });
    await M.click('button:has-text("I have read and understood this notice")');
    chk('…acknowledges it in one press, and is told so with the date', await until(M, () => /Acknowledged on/.test(document.body.innerText))
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM notice_reads WHERE readerKey = 'm:NGG-NT-1' AND ackAt <> ''")['c'];`) === '1');
    await M.goto(BASE + '/notice', { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    chk('the member’s notices list shows it, acknowledged', await until(M, () => !!document.querySelector('.nt-list') && /REVISED SATURDAY RESUMPTION/.test(document.body.innerText) && /Acknowledged/.test(document.body.innerText), null, 60000));

    // ── A parent reads it from the family account ──
    const famToken = php(`echo session_issue_family(db_row("SELECT * FROM guardians WHERE guardianId = 'GRD-NT-1'"), true);`, ['session']);
    const fctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await fctx.addCookies([{ name: 'ngg_sess_family', value: famToken, domain: '127.0.0.1', path: '/', httpOnly: true },
                           { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const F = await fctx.newPage();
    F.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await F.goto(BASE + '/notice/' + id, { waitUntil: 'domcontentloaded' });
    await waitForBoot(F);
    chk('a parent with only a family account reads it too, for their child', await until(F, () => /REQUESTING PERMISSION/.test(document.body.innerText) && /for Grace Obi/.test(document.body.innerText), null, 60000));
    await F.click('button:has-text("I have read and understood this notice")');
    chk('…and acknowledges it for their child; the family inbox shows it signed', await until(F, () => /Acknowledged on/.test(document.body.innerText))
      && php(`echo (string)db_row("SELECT signedAt FROM guardian_notices WHERE kind = 'notice'")['signedAt'] !== '' ? 'y' : 'n';`) === 'y');
    const over = await F.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    chk('on a phone the notice fits its width (overflow ' + over + 'px)', over <= 1);
    await F.screenshot({ path: path.join(SHOTS, 'family-phone.png'), fullPage: true });

    // ── Back at the desk: who has read it ──
    await P.reload({ waitUntil: 'domcontentloaded' });
    await waitForBoot(P);
    await until(P, () => /Notices published/.test(document.body.innerText), null, 60000);
    await P.click('tr:has-text("REVISED SATURDAY RESUMPTION")');
    chk('the desk sees both read and acknowledged — one by the member, one by a parent', await until(P, () => /Who has read it/.test(document.body.innerText) && /By a parent/.test(document.body.innerText), null, 20000));
    const t = await text(P);
    chk('…and nobody is left to remind', !/Remind the/.test(t) && /Not yet acknowledged\s*0/.test(t));

    // ── A correction is made on the same page, and says so ──
    await P.click('.cr-list-row:has-text("Correct…"), button:has-text("Correct…")');
    chk('“Correct…” opens the published notice in the editor, with what a correction means', await until(P, () => !!document.querySelector('.nte #nte-body h3') && /It has gone out/.test(document.body.innerText), null, 20000)
      && (await P.locator('.nte-bar button:has-text("Save the correction")').count()) === 1 && (await P.locator('#nte-aud').count()) === 0);
    await P.fill('.nte-paper textarea[aria-label="Subject"]', 'REVISED SATURDAY RESUMPTION TIME AND CONDUCT');
    await P.click('.nte-bar button:has-text("Save the correction")');
    chk('…a correction without a note is refused on the page, before anything is sent', await until(P, () => /Say what was corrected/.test(document.body.innerText)) && php(`echo db_row("SELECT correctedAt FROM notices WHERE noticeId = '${id}'")['correctedAt'];`) === '');
    await P.fill('#nte-note', 'The subject now names conduct as well');
    await P.click('.nte-bar button:has-text("Save the correction")');
    chk('…with the note it is corrected, and readers are shown that it was', await until(P, () => !document.querySelector('.nte') && /Corrected/.test(document.body.innerText), null, 20000)
      && php(`echo db_row("SELECT subject FROM notices WHERE noticeId = '${id}'")['subject'] . '|' . db_row("SELECT correctionNote FROM notices WHERE noticeId = '${id}'")['correctionNote'];`) === 'REVISED SATURDAY RESUMPTION TIME AND CONDUCT|The subject now names conduct as well');

    // ── A short announcement: a title and a sentence ──
    await P.click('button:has-text("New notice")');
    await until(P, () => !!document.querySelector('.nte #nte-body'));
    await P.fill('.nte-paper textarea[aria-label="Title"]', 'No class this Saturday');
    await P.keyboard.press('Enter');
    chk('Enter in the title moves to the message', await P.evaluate(() => document.activeElement && document.activeElement.id === 'nte-body'));
    await P.keyboard.type('The centre is closed for repairs. See you next week.');
    await P.keyboard.press('Control+s');
    chk('one line is enough: Ctrl+S saves it as a draft with no letterhead and no sign-off', await until(P, () => /\/edit$/.test(location.pathname) && /^Saved/.test(document.querySelector('.nte-state').innerText), null, 20000)
      && php(`$n = db_row("SELECT * FROM notices WHERE subject = 'No class this Saturday'"); echo $n && $n['org'] === '' && $n['signoff'] === '' && $n['body'] === 'The centre is closed for repairs. See you next week.' ? 'y' : 'n';`) === 'y');
    const sid = php(`echo db_row("SELECT noticeId FROM notices WHERE subject = 'No class this Saturday'")['noticeId'];`);
    // The toolbar is one tab stop, walked with the arrows.
    await P.focus('.nte-tool[aria-label="Bold"]');
    await P.keyboard.press('ArrowRight');
    chk('the formatting toolbar is one tab stop, and the arrows walk it', await P.evaluate(() => document.activeElement.getAttribute('aria-label') === 'Italic'
      && document.querySelectorAll('.nte-tools button[tabindex="0"]').length === 1));
    // Publish later.
    await P.click('.nte-side button:has-text("Publish later…")');
    await P.fill('#nte-time', '18:00');
    await P.click('.nte-side button:has-text("Schedule it")');
    chk('“Publish later…” schedules it: the bar shows the time, the draft carries it', await until(P, () => !!document.querySelector('.nte-sched') && /Goes out by itself/.test(document.querySelector('.nte-side').innerText), null, 20000)
      && /T17:00:00Z$/.test(php(`echo db_row("SELECT scheduledAt FROM notices WHERE noticeId = '${sid}'")['scheduledAt'];`))
      && (await P.locator('.nte-bar button:has-text("Publish now…")').count()) === 1);
    await P.click('.nte-side button:has-text("Don’t schedule it")');
    chk('…and “Don’t schedule it” takes the time away again; it stays a draft', await until(P, () => !document.querySelector('.nte-sched'), null, 20000)
      && php(`echo db_row("SELECT scheduledAt FROM notices WHERE noticeId = '${sid}'")['scheduledAt'];`) === '');
    // The connection drops while writing.
    await P.context().setOffline(true);
    await P.click('#nte-body');
    await P.keyboard.press('End');
    await P.keyboard.type(' Thanks.');
    chk('a save that fails on the connection says so, keeps the words, and does not pretend', await until(P, () => /connection failed/.test(document.body.innerText), null, 20000));
    await P.context().setOffline(false);
    chk('…and saves by itself when the connection is back', await until(P, () => /^Saved/.test(document.querySelector('.nte-state').innerText) && !/connection failed/.test(document.body.innerText), null, 30000)
      && /Thanks\.$/.test(php(`echo db_row("SELECT body FROM notices WHERE noticeId = '${sid}'")['body'];`)));
    // Somebody else saves the same draft.
    php(`db_exec("UPDATE notices SET body = 'The centre is closed for repairs. See you next week.', updatedAt = '2099-01-01T00:00:00Z' WHERE noticeId = '${sid}'");`);
    await P.keyboard.type(' Bring water.');
    chk('a save over somebody else’s newer words is stopped, and says so — nothing is overwritten', await until(P, () => /Somebody else changed this notice/.test(document.body.innerText), null, 20000)
      && php(`echo db_row("SELECT body FROM notices WHERE noticeId = '${sid}'")['body'];`) === 'The centre is closed for repairs. See you next week.');
    await P.click('.nte-banner button:has-text("Load their version")');
    chk('…“Load their version” puts their words on the page', await until(P, () => document.querySelector('#nte-body').innerText.trim() === 'The centre is closed for repairs. See you next week.' && !/Somebody else changed/.test(document.body.innerText)));
    await P.screenshot({ path: path.join(SHOTS, 'editor-short.png') });
    await P.click('.nte-bar button:has-text("Publish…")');
    await P.waitForSelector('[role="alertdialog"]');
    await P.click('[role="alertdialog"] .cr-confirm-acts button:has-text("Publish")');
    const id2 = await until(P, () => /Published ·/.test(document.body.innerText), null, 20000) && php(`echo db_row("SELECT noticeId FROM notices WHERE subject = 'No class this Saturday'")['noticeId'];`);
    chk('…published to everyone; its WhatsApp copy is the title and the sentence — no “SUBJECT:”', !!id2
      && php(`echo notice_whatsapp(notice_get('${id2}'));`) === '*No class this Saturday*\n\nThe centre is closed for repairs. See you next week.');
    await M.goto(BASE + '/notice/' + id2, { waitUntil: 'domcontentloaded' });
    await waitForBoot(M);
    chk('a member reads it as an announcement: its title, its sentence, no “Subject:” banner', await until(M, () => /No class this Saturday/.test(document.body.innerText) && /closed for repairs/.test(document.body.innerText), null, 60000)
      && !/Subject:/.test(await text(M)) && (await M.locator('.nt-head.is-plain').count()) === 1);

    // From the published notice: a copy for next week, and the readers as a sheet.
    await until(P, id2 => location.pathname === '/control/comms/broadcast/' + id2, id2, 20000);
    const [dl] = await Promise.all([P.waitForEvent('download', { timeout: 20000 }).catch(() => null), P.click('button:has-text("Export who has read it (CSV)")')]);
    chk('the readers export as a CSV, to chase from', !!dl && /notice-.*-readers/.test(dl.suggestedFilename()));
    await P.click('button:has-text("Duplicate as a new draft")');
    chk('“Duplicate as a new draft” opens a copy in the editor — a new draft, nothing sent', await until(P, () => /\/broadcast\/NTC-[^/]+\/edit$/.test(location.pathname) && (document.querySelector('.nte textarea[aria-label="Title"]') || {}).value === 'No class this Saturday', null, 20000)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM notices WHERE subject = 'No class this Saturday' AND status = 'draft'")['c'];`) === '1');
    await P.click('.nte-bar button:has-text("Notices")');
    await until(P, () => !document.querySelector('.nte'));

    // ── The editor on a phone ──
    const Q = await pageFor('NGG-NT-ADM', { width: 390, height: 844 });
    Q.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await Q.goto(BASE + '/control/comms/broadcast/new', { waitUntil: 'domcontentloaded' });
    await waitForBoot(Q);
    chk('on a phone the editor opens from its address, the page fills the width, nothing scrolls sideways',
      await until(Q, () => !!document.querySelector('.nte #nte-body'), null, 60000)
      && await Q.evaluate(() => { const n = document.querySelector('.nte'); return n.scrollWidth <= n.clientWidth + 1 && document.querySelector('.nte-paper').getBoundingClientRect().width > 340; }));
    chk('…the sending choices are a sheet, closed until asked for', !(await Q.isVisible('#nte-aud')) && await Q.isVisible('.nte-sheet-btn'));
    await Q.click('.nte-sheet-btn');
    chk('…and open from “Sending”', await until(Q, () => { const r = document.querySelector('#nte-aud').getBoundingClientRect(); return r.height > 0 && r.top < innerHeight; }));
    await Q.waitForTimeout(300);
    await Q.screenshot({ path: path.join(SHOTS, 'editor-phone.png') });

    // A signed-out visitor is asked to sign in, not shown the notice.
    const V = await (await browser.newContext()).newPage();
    await V.goto(BASE + '/notice/' + id, { waitUntil: 'domcontentloaded' });
    await waitForBoot(V);
    chk('somebody signed out is asked to sign in — the notice is not public', await until(V, () => /Sign in to read this notice/.test(document.body.innerText), null, 60000) && !/LATENESS/.test(await text(V)));

    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (notices)');
  process.exit(failed ? 1 : 0);
})();
