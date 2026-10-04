#!/usr/bin/env node
/* ============================================================================
   Uploading a sheet of fines, end to end: real PHP server, real session, the
   real screen (Dues & fees → Upload fines).

   What must hold:
     · A CSV of fines is checked first: every row names the member it matched
       and how, ambiguous rows are refused with the candidates, nothing posts.
     · Post fines writes exactly the rows that passed, to the member ledger.
     · The same sheet checked again reports every fine as already posted.

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
      + mk('NGG-FU-ADM', "['role'=>'super_admin','fullName'=>'Fines Admin']")
      + mk('NGG-FU-1', "['fullName'=>'Chidi Okafor','displayId'=>'026-501']")
      + mk('NGG-FU-2', "['fullName'=>'Amaka Bello','email'=>'bello@example.org']")
      + mk('NGG-FU-3', "['fullName'=>'Tunde Bello','email'=>'bello@example.org']")
      + mk('NGG-FU-4', "['fullName'=>'Daniel Mobolaji']")
      + mk('NGG-FU-5', "['fullName'=>'Naomi Akintola']"));
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const launch = {};
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    browser = await chromium.launch(launch);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errs = [];
    const { ctx } = await contextFor('NGG-FU-ADM', true);
    const ap = await ctx.newPage();
    ap.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await ap.goto(BASE + '/nextadmin', { waitUntil: 'domcontentloaded' });
    await waitForBoot(ap);
    await ap.waitForFunction(() => !!window.__adminSection, null, { timeout: 60000 });
    await ap.evaluate(() => window.__adminSection('fees'));
    await ap.waitForSelector('button:has-text("Upload fines")', { timeout: 30000 });
    await ap.click('button:has-text("Upload fines")');
    await ap.waitForSelector('.fine-imp');
    const csv = path.join(TMP, 'fines.csv');
    fs.writeFileSync(csv, 'Member No,Name,Email,Amount,Reason,Date,Comments\n'
      + '026-501,,,"₦2,000",Lateness,04/10/2026,\n'
      + ',Tunde Bello,bello@example.org,500,conduct,2026-10-04,Shouting\n'
      + ',,bello@example.org,500,conduct,2026-10-04,\n'
      + ',Nobody Known,,500,late,,\n');
    await ap.setInputFiles('.fine-imp input[type=file]', csv);
    await ap.click('button:has-text("Check the file")');
    await ap.waitForSelector('.fine-imp-tally');
    const t1 = await ap.$eval('.fine-imp-plan', el => el.innerText);
    chk('the check matches by printed ID and by email + name, and posts nothing',
      /2\s*to post/.test(t1) && /Chidi Okafor/.test(t1) && /Tunde Bello/.test(t1)
      && php(`echo (int)db_row("SELECT COUNT(*) c FROM member_ledger")['c'];`) === '0');
    chk('a shared family email alone is refused, with both siblings named', /more than one member matches/i.test(t1) && /Amaka Bello/.test(t1));
    chk('an unknown person is refused', /no member matches/i.test(t1));
    await ap.screenshot({ path: path.join(SHOTS, 'checked.png'), fullPage: true });
    await ap.click('.fine-imp-plan button:has-text("Post fines")');
    await ap.click('.modal-ok, button:has-text("Post fines") >> nth=-1').catch(() => {});
    await ap.waitForFunction(() => /— posted\./.test(document.querySelector('.fine-imp-tally')?.innerText || ''), null, { timeout: 15000 });
    chk('Post fines writes the rows that passed, to the member ledger',
      php(`echo json_encode(db_all("SELECT memberId, amount FROM member_ledger WHERE kind = 'fine' ORDER BY memberId"));`) === '[{"memberId":"NGG-FU-1","amount":2000},{"memberId":"NGG-FU-3","amount":500}]');
    await ap.setInputFiles('.fine-imp input[type=file]', csv);
    await ap.click('button:has-text("Check the file")');
    await ap.waitForFunction(() => /2\s*already posted/.test(document.querySelector('.fine-imp-tally')?.innerText || ''), null, { timeout: 15000 });
    chk('the same sheet again fines nobody twice', !(await ap.$('.fine-imp-plan button:has-text("Post fines")')));

    /* The sheet the programme actually keeps: an Excel workbook, names in either
       order with a "*" marker, extra fee columns, no reason column, "Null" for
       no fine. It has to check without being retyped. */
    const JSZip = require(path.join(ROOT, 'vendor', 'jszip.min.js'));
    const zip = new JSZip();
    const strs = ['NAME', 'SUBSCRIPTION FEE', 'COMMITMENT FEE', 'FINE', 'Mobolaji Daniel *', 'Akintola Naomi', 'Ashowo Obaloluwa', 'Null'];
    const si = (t) => strs.indexOf(t);
    const c = (ref, v) => typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
    const sheetRows = [['NAME', 'SUBSCRIPTION FEE', 'COMMITMENT FEE', 'FINE'], ['Mobolaji Daniel *', null, 8000, 1000], ['Akintola Naomi', null, 8000, 6000], ['Ashowo Obaloluwa', null, 'Null', 'Null']];
    const rowsXml = sheetRows.map((r, i) => `<row r="${i + 1}">` + r.map((v, k) => v === null ? '' : c('ABCD'[k] + (i + 1), v)).join('') + '</row>').join('');
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fines" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/sharedStrings.xml', '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + strs.map(t => `<si><t>${t}</t></si>`).join('') + '</sst>');
    zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rowsXml + '</sheetData></worksheet>');
    const xlsx = path.join(TMP, 'outstanding.xlsx');
    fs.writeFileSync(xlsx, await zip.generateAsync({ type: 'nodebuffer' }));
    await ap.setInputFiles('.fine-imp input[type=file]', xlsx);
    await ap.waitForSelector('.fine-imp-reason input', { timeout: 10000 });
    chk('an Excel workbook is read, and a sheet with no reason column asks for one reason for all its rows',
      /3 rows/.test(await ap.$eval('.fine-imp', el => el.innerText)) && /Reason for the 3 rows/.test(await ap.$eval('.fine-imp-reason', el => el.innerText)));
    await ap.fill('.fine-imp-reason input', 'Outstanding fine');
    await ap.click('button:has-text("Check the file")');
    await ap.waitForFunction(() => /with no fine/.test(document.querySelector('.fine-imp-tally')?.innerText || ''), null, { timeout: 15000 });
    const t3 = await ap.$eval('.fine-imp-plan', el => el.innerText);
    chk('names in either order with a "*" still match, and say so; a "Null" fine is skipped, not refused',
      /2\s*to post/.test(t3) && /₦7,000/.test(t3) && /Daniel Mobolaji/.test(t3) && /words reordered/i.test(t3) && /1\s*with no fine/.test(t3) && /0\s*refused/.test(t3)
      && /skipped: no fine/i.test(t3) && !/already posted\s*$/im.test(t3.split('\n').filter(l => /Ashowo/.test(l)).join('\n')));
    await ap.screenshot({ path: path.join(SHOTS, 'xlsx-checked.png'), fullPage: true });
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
