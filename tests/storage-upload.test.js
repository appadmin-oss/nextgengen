#!/usr/bin/env node
/* ============================================================================
   Uploads to a storage bucket (Cloudflare R2 / Backblaze B2), end to end: a
   real PHP server, a real browser, and a stand-in bucket over HTTPS that
   checks every request's AWS Signature V4 with its OWN implementation (below),
   not the server's — so a signing bug cannot vouch for itself.

   What must hold:
     · With storage set, a member's upload is signed by the server and PUT
       straight to the bucket; the file that arrives is the file that was sent,
       stored as the type the server chose, and read back from the public URL.
     · The headshot path (no session) uses the bucket the same way, image only.
     · The signature holds the upload to its length: a different body fails.
     · A file type nothing should serve (svg) is refused before signing.

   Needs openssl (for the stand-in bucket's certificate); skips without it.
   Run:  node tests/storage-upload.test.js
   ========================================================================== */
'use strict';
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs'), path = require('path'), os = require('os'), https = require('https'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.STORE_PORT || '8373';
const BPORT = process.env.STORE_BUCKET_PORT || '8374';
const BASE = 'http://127.0.0.1:' + PORT;
const BUCKET_URL = 'https://127.0.0.1:' + BPORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-store-'));
const DB = path.join(TMP, 'ngg.db');
const AK = 'TESTACCESSKEY01', SK = 'test/secret/key+0123456789abcdefghij', BUCKET = 'ngg-media';
let _seq = 0;
function php(snippet) {
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() { for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} } return null; }
let passed = 0, failed = 0;
const chk = (m, c, extra) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m + (extra ? ' — ' + extra : '')); } };

/* ── The stand-in bucket: path-style S3, query-auth PUT, public GET under /pub ── */
const objects = new Map(); const log = [];
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
function verifyPresigned(req, u) {
  const q = Object.fromEntries(u.searchParams.entries());
  if (q['X-Amz-Algorithm'] !== 'AWS4-HMAC-SHA256') return 'no_algorithm';
  const [ak, date, region, svc, term] = String(q['X-Amz-Credential'] || '').split('/');
  if (ak !== AK || svc !== 's3' || term !== 'aws4_request') return 'bad_credential';
  const t = Date.UTC(+q['X-Amz-Date'].slice(0, 4), +q['X-Amz-Date'].slice(4, 6) - 1, +q['X-Amz-Date'].slice(6, 8), +q['X-Amz-Date'].slice(9, 11), +q['X-Amz-Date'].slice(11, 13), +q['X-Amz-Date'].slice(13, 15));
  if (Date.now() > t + (+q['X-Amz-Expires']) * 1000) return 'expired';
  const signed = String(q['X-Amz-SignedHeaders'] || '').split(';');
  const canonHeaders = signed.map(h => h + ':' + String(h === 'host' ? req.headers.host : (req.headers[h] || '')).trim() + '\n').join('');
  const qs = Object.keys(q).filter(k => k !== 'X-Amz-Signature').sort().map(k => enc(k) + '=' + enc(q[k])).join('&');
  const canon = [req.method, u.pathname, qs, canonHeaders, signed.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', q['X-Amz-Date'], [date, region, 's3', 'aws4_request'].join('/'), crypto.createHash('sha256').update(canon).digest('hex')].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + SK, date), region), 's3'), 'aws4_request');
  return crypto.createHmac('sha256', key).update(sts).digest('hex') === q['X-Amz-Signature'] ? '' : 'SignatureDoesNotMatch';
}
function bucketServer(cert) {
  return https.createServer(cert, (req, res) => {
    const u = new URL(req.url, BUCKET_URL);
    const cors = { 'Access-Control-Allow-Origin': BASE, 'Access-Control-Allow-Methods': 'GET, PUT, HEAD', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method === 'GET' && u.pathname.startsWith('/pub/')) {
      const o = objects.get(decodeURIComponent(u.pathname.slice(5)));
      if (!o) { res.writeHead(404, cors); return res.end(); }
      res.writeHead(200, Object.assign({ 'Content-Type': o.type, 'Content-Length': o.body.length }, cors)); return res.end(o.body);
    }
    if (req.method === 'PUT' && u.pathname.startsWith('/' + BUCKET + '/')) {
      const b = []; req.on('data', c => b.push(c)); req.on('end', () => {
        const body = Buffer.concat(b); const why = verifyPresigned(req, u);
        const key = decodeURIComponent(u.pathname.slice(BUCKET.length + 2));
        log.push({ key, why, type: req.headers['content-type'], len: body.length });
        if (why) { res.writeHead(403, Object.assign({ 'Content-Type': 'application/xml' }, cors)); return res.end('<Error><Code>' + why + '</Code></Error>'); }
        objects.set(key, { type: req.headers['content-type'], body });
        res.writeHead(200, Object.assign({ ETag: '"' + crypto.createHash('md5').update(body).digest('hex') + '"' }, cors)); res.end();
      }); return;
    }
    res.writeHead(400, cors); res.end();
  });
}

let server, bucket, browser;
function cleanup() { try { if (server) process.kill(-server.pid); } catch (_) {} try { bucket && bucket.close(); } catch (_) {} try { fs.unlinkSync(CFG); } catch (_) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} }

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  storage upload: skipped (playwright not installed)'); process.exit(0); }
  try { execSync('openssl version', { stdio: 'ignore' }); } catch (_) { console.log('⏭  storage upload: skipped (no openssl)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 -keyout ${JSON.stringify(path.join(TMP, 'k.pem'))} -out ${JSON.stringify(path.join(TMP, 'c.pem'))}`, { stdio: 'ignore' });
  bucket = bucketServer({ key: fs.readFileSync(path.join(TMP, 'k.pem')), cert: fs.readFileSync(path.join(TMP, 'c.pem')) });
  await new Promise(r => bucket.listen(+BPORT, '127.0.0.1', r));
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'store_e2e_secret_bucket_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
    'storage' => ['endpoint' => ${JSON.stringify(BUCKET_URL)}, 'region' => 'auto', 'bucket' => '${BUCKET}', 'access_key' => '${AK}', 'secret_key' => ${JSON.stringify(SK)},
                  'public_base' => ${JSON.stringify(BUCKET_URL + '/pub')}, 'folder' => 'ngg'],
  ];\n`);
  try {
    php(`$now = now_iso(); db_insert('members', ['memberId' => 'NGG-ST-1', 'fullName' => 'Bucket Member', 'email' => 'st@example.org', 'type' => 'NGG', 'status' => 'active', 'createdAt' => $now, 'updatedAt' => $now]); echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/' + d + '/chrome-linux/chrome' });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-ST-1'"), false);`);
    await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p);

    // A member's hand-in: a PDF, PUT straight to the bucket.
    const pdf = '%PDF-1.4\n% NGG storage test ' + 'x'.repeat(2000) + '\n%%EOF\n';
    const r = await p.evaluate(async (body) => {
      try { return await NGGApi.uploadFile(new File([body], 'My Essay.pdf', { type: 'application/pdf' }), 'assignment'); } catch (e) { return { error: String(e.message || e) }; }
    }, pdf);
    const got = log[log.length - 1] || {};
    chk('a member\'s PDF goes straight to the bucket, with a signature the bucket accepts', r && r.url && got.why === '' && got.len === Buffer.byteLength(pdf), JSON.stringify(r).slice(0, 200) + ' ' + JSON.stringify(got));
    chk('…stored under our folder, as a PDF, keeping its name and extension', /^ngg\/assignments\/u[0-9a-f]{16}\/\d{4}\/\d{2}\/[0-9a-f]{24}-my-essay\.pdf$/.test(got.key || '') && got.type === 'application/pdf' && r.format === 'pdf');
    chk('…and the URL handed back is the public one, which serves the same bytes', r.url === BUCKET_URL + '/pub/' + got.key
      && (await p.evaluate(async (u) => (await (await fetch(u)).text()), r.url)) === pdf);

    // The headshot path has no session: image only, through the public signer.
    const ctx2 = await browser.newContext({ ignoreHTTPSErrors: true });
    const p2 = await ctx2.newPage(); p2.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await waitForBoot(p2);
    const jpg = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'face', 'man_a.jpg')).toString('base64');
    const h = await p2.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      try { return await NGGApi.uploadFile(new File([bin], 'me.jpg', { type: 'image/jpeg' }), 'headshot'); } catch (e) { return { error: String(e.message || e) }; }
    }, jpg);
    const hg = log[log.length - 1] || {};
    chk('a headshot with no session uploads to the bucket too, as a JPEG in the headshot folder', h && h.url && hg.why === '' && /^ngg\/headshot\//.test(hg.key) && hg.type === 'image/jpeg', JSON.stringify(h).slice(0, 200));
    chk('…and the server accepts that address as a photo', php(`echo photo_intake_url(${JSON.stringify(h.url || '')});`) === h.url);

    // The signature is for one exact length: a different body is refused by the bucket.
    const bad = await p.evaluate(async () => {
      const sig = await (await fetch('/api/member/upload-sign.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-NGG-CSRF': (document.cookie.match(/(?:^|; )ngg_csrf=([^;]+)/) || [])[1] || '' },
        body: JSON.stringify({ kind: 'assignment', mediaKind: 'pdf', name: 'a.pdf', contentType: 'application/pdf', size: 10 }) })).json();
      const r1 = await fetch(sig.uploadUrl, { method: 'PUT', headers: sig.headers, body: 'a much longer body than ten bytes' }).then(x => x.status, () => 0);
      const r2 = await fetch(sig.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: '0123456789' }).then(x => x.status, () => 0);
      return { r1, r2 };
    });
    chk('a signed upload cannot be swapped for a longer file, or stored as another type', bad.r1 === 403 && bad.r2 === 403, JSON.stringify(bad));
    const svg = await p.evaluate(async () => (await fetch('/api/member/upload-sign.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-NGG-CSRF': (document.cookie.match(/(?:^|; )ngg_csrf=([^;]+)/) || [])[1] || '' },
        body: JSON.stringify({ kind: 'headshot', mediaKind: 'image', name: 'x.svg', contentType: 'image/svg+xml', size: 100 }) })).json());
    chk('an SVG is refused before anything is signed', svg.ok === false && svg.error === 'bad_file_type' && !svg.uploadUrl, JSON.stringify(svg));
    chk('no page errors', !errs.length, errs.join(' | '));
  } catch (e) { failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e)); }
  finally { try { browser && await browser.close(); } catch (_) {} cleanup(); }
  console.log((failed ? '❌' : '✅') + ' storage upload: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
