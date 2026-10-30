#!/usr/bin/env node
/* ============================================================================
   Uploading a sheet of fines, end to end: real PHP server, real session, the
   real screen (Control Room → Money → Conduct & fines), reached through the
   upload's OLD address (/control/money/fees/fines), which must still land here.

   The sheet is the kind the programme actually keeps, not a tidy template:
   a workbook with a sheet per centre, a title above the headings, "S/N" and
   "Names", a column per kind of fine and a TOTAL line, an ID written inside a
   name, "#2,000", "4th October, 2026", and two members of the same name at
   different centres. What must hold:

     · The screen says how it read each sheet, and splits a row with a column
       per kind of fine into one fine per kind; totals are not fines.
     · Every row names the member it matched and how; the sheet's name settles
       a shared name; an unknown name is refused; nothing posts on the check.
     · A conduct rule that caps a kind of fine is shown in the check — the
       figure that will really post — and that is what posts.
     · A count under a kind ("Late: 2") is that many fines at the rule's
       standard amount, and the check says so.
     · Post fines writes exactly the rows that passed; the same file checked
       again reports every fine as already posted.

   Run:  node tests/fines-upload.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FINES_PORT || '8282';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-fines-'));
const DB = path.join(TMP, 'ngg.db');
const CACHE = path.join(TMP, 'cache');
const SHOTS = path.join(ROOT, 'tests', 'screens', 'fines');

let _seq = 0;
function php(snippet, extra = []) {
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
function get(url, headers) {
  return new Promise((res, rej) => http.get(url, { headers }, r => {
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) }));
  }).on('error', rej));
}

let server, browser;
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) { try { server && server.kill(); } catch (_) {} }
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}

let passed = 0, failed = 0;
const chk = (m, cond) => { if (cond) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

async function contextFor(memberId, admin, viewport) {
  const token = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = '${memberId}'"), ${admin ? 'true' : 'false'});`, ['session']);
  const ctx = await browser.newContext({ viewport: viewport || { width: 1360, height: 1000 } });
  await ctx.addCookies([
    { name: 'ngg_sess', value: token, domain: '127.0.0.1', path: '/', httpOnly: true },
    { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' },
  ]);
  return { ctx, token };
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  fines upload: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => 'next@afrovanguard.org.ng', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'fines_test_secret_0123456789abcdefg',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(CACHE)},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]],
    'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200,
    'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const now = 'now_iso()';
    const mk = (id, extra) => `db_insert('members', array_merge(['memberId'=>'${id}','fullName'=>'X ${id}','email'=>strtolower('${id}').'@example.org','type'=>'NGG','status'=>'active','role'=>'member','centre'=>'Egbeda','createdAt'=>${now},'updatedAt'=>${now}], ${extra}));`;
    php(`db_migrate(db_conn());`
      + `db_insert('centres', ['centreId'=>'CEN-FU-1','name'=>'Egbeda','code'=>'EG','status'=>'active','slug'=>'egbeda','createdAt'=>now_iso()]);`
      + `db_insert('centres', ['centreId'=>'CEN-FU-2','name'=>'Ayobo','code'=>'AY','status'=>'active','slug'=>'ayobo','createdAt'=>now_iso()]);`
      + mk('NGG-FU-ADM', "['role'=>'super_admin','fullName'=>'Fines Admin']")
      + mk('NGG-FU-1', "['fullName'=>'Chidi Okafor','displayId'=>'026-501']")
      + mk('NGG-FU-2', "['fullName'=>'Tunde Bello','centre'=>'Egbeda']")
      + mk('NGG-FU-3', "['fullName'=>'Tunde Bello','centre'=>'Ayobo']")
      + mk('NGG-FU-4', "['fullName'=>'Daniel Ayomide Mobolaji']")
      + mk('NGG-FU-5', "['fullName'=>'Naomi Akintola','centre'=>'Ayobo']")
      + `db_insert('conduct_rules', ['ruleId'=>'FU-LATE','reason'=>'late','name'=>'Late','amount'=>500,'capTerm'=>1500,'active'=>1,'createdAt'=>now_iso()]);`, ['bootstrap']);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.existsSync('/opt/pw-browsers') && fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : d ? { executablePath: require('./_responsive-probe').chromiumPath(require('fs')) } : {});
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];
    const { ctx } = await contextFor('NGG-FU-ADM', true);
    const ap = await ctx.newPage();
    ap.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const until = (fn, arg, ms) => ap.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
    const body = () => ap.evaluate(() => document.body.innerText);
    const ledger = () => JSON.parse(php(`echo json_encode(db_all("SELECT memberId, amount FROM member_ledger WHERE kind = 'fine' ORDER BY memberId, amount"));`, ['bootstrap']));

    // ── The workbook: two sheets, as kept ──
    const JSZip = require(path.join(ROOT, 'vendor', 'jszip.min.js'));
    const sheets = {
      Egbeda: [['NGG EGBEDA — FINES REGISTER, TERM 1'], [], ['S/N', 'Names', 'Late', 'Absent', 'Total', 'Remarks'],
        [1, 'Chidi Okafor', 1000, 500, 1500, ''], [2, 'Tunde Bello', '', 2000, 2000, 'missed two Saturdays'],
        [3, 'Daniel Mobolaji', 2, '', 1000, ''], [4, 'Nobody We Know', 500, '', 500, ''], ['', 'TOTAL', 2500, 2500, 5000, '']],
      Ayobo: [['Name of child', 'Fine (₦)', 'Offence', 'Date'],
        ['Tunde Bello', '#2,000', 'fighting during break', '4th October, 2026'], ['Akintola Naomi (026-777)', '1k', 'Late', '04/10/2026'],
        ['Chidi Okafor (026-501)', '₦1,000', 'came late', '05/10/2026']],
    };
    const strs = [];
    const si = t => { const k = strs.indexOf(t); if (k >= 0) return k; strs.push(t); return strs.length - 1; };
    const cell = (ref, v) => typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${si(String(v))}</v></c>`;
    const sheetXml = rows => '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + rows.map((r, i) => `<row r="${i + 1}">` + r.map((v, k) => v === '' || v == null ? '' : cell('ABCDEF'[k] + (i + 1), v)).join('') + '</row>').join('') + '</sheetData></worksheet>';
    const zip = new JSZip(); const names = Object.keys(sheets);
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>');
    names.forEach((n, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheets[n])));
    zip.file('xl/sharedStrings.xml', '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + strs.map(t => `<si><t>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('') + '</sst>');
    const xlsx = path.join(TMP, 'register.xlsx');
    fs.writeFileSync(xlsx, await zip.generateAsync({ type: 'nodebuffer' }));

    await ap.goto(BASE + '/control/money/fees/fines', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    chk('the upload’s old address lands on Conduct & fines', await until(() => /Upload a fines register/.test(document.body.innerText), null, 60000)
      && /\/control\/money\/conduct$/.test(new URL(ap.url()).pathname));
    if (process.env.DUMP) { console.error(ap.url(), errs, (await body()).slice(0, 1500)); }
    const how = async () => { const b = await ap.$('button:has-text("How the file was read")[aria-expanded="false"]'); if (b) await b.click(); };
    const check = async () => {
      await ap.click('button:has-text("Upload fines") >> nth=0');
      await ap.waitForSelector('[role="dialog"] input[type=file]', { state: 'attached' });
      await ap.setInputFiles('[role="dialog"] input[type=file]', xlsx);
      await ap.click('[role="dialog"] button[type="submit"]');
      return until(() => /How the file was read/.test(document.body.innerText) && !document.querySelector('[role="dialog"]'), null, 30000);
    };
    chk('the workbook is read and checked', await check());
    await how();
    let t = await body();
    chk('it says how each sheet was read: headings found under the title, a column per kind of fine, the TOTAL line skipped',
      /Sheet “Egbeda”: headings on row 3/.test(t) && /a column per kind of fine/.test(t) && /1 total line skipped/.test(t) && /Sheet “Ayobo”: headings on row 1/.test(t)
      && /1 cell ticked or counted/.test(t));
    chk('“2” under Late is two late fines at the rule’s standard ₦500, and the check says so', /2 × ₦500 standard/.test(t));
    chk('a row with Late and Absent filled becomes two fines; the Total column is not a third', /Egbeda · row 4 · late/.test(t) && /Egbeda · row 4 · absent/.test(t));
    chk('two Tunde Bellos: the sheet’s centre settles which one', /name \+ centre/.test(t));
    chk('a name with a middle name missing still matches, as a weak match to check', /Daniel Ayomide Mobolaji/.test(t) && /part of it/.test(t));
    chk('an ID written inside the name is used, and an unknown person is refused', /Chidi Okafor/.test(t) && /no member matches/i.test(t));
    chk('the late-fine cap is shown before posting: what will really post, and what the sheet said', /To post · capped/.test(t) && /sheet: ₦/.test(t));
    chk('nothing is posted by the check', ledger().length === 0);
    await ap.screenshot({ path: path.join(SHOTS, 'checked.png'), fullPage: true });
    await ap.click('button:has-text("Post ") >> nth=0');
    await ap.waitForSelector('[role="alertdialog"]');
    await ap.click('[role="alertdialog"] button:has-text("Post fines")');
    chk('posting says what was posted', await until(() => /posted · ₦/.test(document.body.innerText), null, 20000));
    const posted = ledger();
    const late1 = Number(php(`echo (int)db_row("SELECT COALESCE(SUM(amount),0) s FROM member_ledger WHERE memberId = 'NGG-FU-1' AND kind = 'fine' AND method = 'late'")['s'];`, ['bootstrap']));
    chk('the late fines on one member stop at the rule’s cap (₦1,500), as the check said', late1 === 1500);
    chk('every row that passed is on a ledger, and nobody unknown', posted.length >= 6 && !posted.some(r => !/^NGG-FU-[1-5]$/.test(r.memberId)));
    chk('Tunde Bello at Ayobo got the Ayobo sheet’s fine and Tunde Bello at Egbeda the Egbeda one',
      posted.some(r => r.memberId === 'NGG-FU-3' && r.amount === 2000) && posted.some(r => r.memberId === 'NGG-FU-2' && r.amount === 2000));
    chk('the same workbook checked again fines nobody twice', await check() && /already posted/.test(await body()) && !(await ap.$('button:has-text("Post ")')) && ledger().length === posted.length);
    chk('no page errors', errs.length === 0);
    if (errs.length) console.error(errs.join('\n'));
  } catch (e) {
    failed++;
    console.error('  ✗ FAIL: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log((failed ? '❌ FAIL: ' : '✅ PASS: ') + passed + ' passed, ' + failed + ' failed (fines upload)');
  process.exit(failed ? 1 : 0);
})();
