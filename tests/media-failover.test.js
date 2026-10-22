#!/usr/bin/env node
/* ============================================================================
   Cloudinary failover from the browser, end to end: a real PHP server signing
   uploads with a main account and the backup from Settings → API keys, a real
   browser running NGGApi.uploadFile, and Cloudinary's upload endpoints stood in
   by request interception (the main cloud answers like a spent plan).

   What must hold:
     · A spent main plan: the upload is reported, the server confirms it with
       its own check, signs for the backup, and the same upload lands there —
       signed with the BACKUP's secret (checked here, not by the server).
     · The next upload goes straight to the backup.
     · A bad file is not a spent plan: no second signature, the error shows.
     · A refusal the server cannot confirm moves nothing.
     · The headshot path (no session) fails over the same way.

   Run:  node tests/media-failover.test.js
   ========================================================================== */
'use strict';
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FAILOVER_PORT || '8391';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-failover-'));
const DB = path.join(TMP, 'ngg.db');
const PROBE = path.join(TMP, 'probe.json');
const SECRETS = { maincloud: 'mainsecret123', backupcloud: 'backupsecret1' };
let _seq = 0;
function php(snippet) {
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
function loadChromium() { for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} } return null; }
let passed = 0, failed = 0;
const chk = (m, c, extra) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m + (extra ? ' — ' + extra : '')); } };

/* The multipart fields of an upload, and whether Cloudinary would accept its signature. */
function fields(buf) {
  const out = {}; const s = buf.toString('latin1');
  for (const m of s.matchAll(/name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:Content-Type: [^\r]*\r\n)?\r\n([\s\S]*?)\r\n--/g)) out[m[1]] = m[2];
  return out;
}
function signedOk(f, secret) {
  const skip = new Set(['file', 'api_key', 'signature', 'resource_type', 'cloud_name']);
  const base = Object.keys(f).filter(k => !skip.has(k)).sort().map(k => k + '=' + f[k]).join('&');
  return crypto.createHash('sha1').update(base + secret).digest('hex') === f.signature;
}

let server, browser;
function cleanup() { try { if (server) process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(CFG); } catch (_) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} }

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  media failover: skipped (playwright not installed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  /* Cloudinary's admin API is not reachable here: usage reads say 40% (the
     reading lags a spent plan, which is the case that needs the probe), and
     the server's own test upload answers from PROBE. */
  fs.writeFileSync(PROBE, JSON.stringify({ ok: false, code: 420, message: 'Upload limit exceeded' }));
  fs.writeFileSync(CFG, `<?php
  $GLOBALS['__media_api_mock'] = fn($m, $path, $q, $acc) => ['code' => 200, 'body' => ['plan' => 'Free', 'credits' => ['usage' => 10, 'limit' => 25, 'used_percent' => 40.0]]];
  $GLOBALS['__media_probe_mock'] = function ($id) { $p = json_decode((string)file_get_contents(${JSON.stringify(PROBE)}), true); return $id === 'primary' ? $p : ['ok' => true, 'code' => 200, 'message' => '']; };
  $GLOBALS['__cloudinary_destroy_mock'] = fn() => true;
  return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'failover_e2e_secret_0123456789abcdef',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
    'cloudinary' => ['cloud_name' => 'maincloud', 'api_key' => '111111', 'api_secret' => ${JSON.stringify(SECRETS.maincloud)}, 'folder' => 'ngg',
                     'backup' => ['cloud_name' => 'backupcloud', 'api_key' => '444444', 'api_secret' => ${JSON.stringify(SECRETS.backupcloud)}]],
  ];\n`);
  try {
    php(`$now = now_iso(); db_insert('members', ['memberId' => 'NGG-FO-1', 'fullName' => 'Failover Member', 'email' => 'fo@example.org', 'type' => 'NGG', 'status' => 'active', 'createdAt' => $now, 'updatedAt' => $now]); echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/' + d + '/chrome-linux/chrome' });
    const ctx = await browser.newContext();
    const tok = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-FO-1'"), false);`);
    await ctx.addCookies([{ name: 'ngg_sess', value: tok, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);

    /* The stand-in Cloudinary: the main cloud is spent (or rejects a bad file); the backup takes uploads. */
    const hits = []; let mainSays = 'spent';
    await ctx.route('https://api.cloudinary.com/**', async route => {
      const req = route.request(); const u = new URL(req.url()); const cloud = u.pathname.split('/')[2];
      const f = fields(req.postDataBuffer() || Buffer.alloc(0));
      hits.push({ cloud, signed: signedOk(f, SECRETS[cloud] || ''), folder: f.folder });
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (cloud === 'maincloud') {
        return mainSays === 'spent'
          ? route.fulfill({ status: 420, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Upload limit exceeded' } }) })
          : route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid image file' } }) });
      }
      const id = 'ngg/x/' + crypto.randomBytes(4).toString('hex');
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json',
        body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/' + cloud + '/image/upload/v1/' + id + '.jpg', public_id: id, resource_type: 'image', format: 'jpg', bytes: 100 }) });
    });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitForBoot(p);
    const jpg = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'face', 'man_a.jpg')).toString('base64');
    const up = (kind, name) => p.evaluate(async ({ b64, kind, name }) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      try { return await NGGApi.uploadFile(new File([bin], name, { type: 'image/jpeg' }), kind); } catch (e) { return { error: String(e.message || e) }; }
    }, { b64: jpg, kind, name });
    const reset = () => php(`setting_set('media.usage', null, 'test'); setting_set('media.usage.accounts', null, 'test'); setting_set('media.refusal.checked', null, 'test'); echo 'ok';`);
    const active = () => php(`echo media_active_id();`);

    console.log('\n── A bad file is not a spent plan ──────────────────────────');
    mainSays = 'bad'; hits.length = 0;
    const bad = await up('post', 'bad.jpg');
    chk('the error Cloudinary gave is the error shown', bad.error === 'Invalid image file', JSON.stringify(bad));
    chk('…one attempt, no second signature, nothing moved', hits.length === 1 && active() === 'primary', JSON.stringify(hits));

    console.log('\n── A refusal the server cannot confirm ─────────────────────');
    mainSays = 'spent'; hits.length = 0;
    fs.writeFileSync(PROBE, JSON.stringify({ ok: true, code: 200, message: '' }));
    const wolf = await up('post', 'wolf.jpg');
    chk('the upload fails with what Cloudinary said', wolf.error === 'Upload limit exceeded', JSON.stringify(wolf));
    chk('…and uploads stay on the main account (the server\'s own upload landed)', active() === 'primary' && hits.every(h => h.cloud === 'maincloud'));

    console.log('\n── The main plan spent ─────────────────────────────────────');
    reset(); hits.length = 0;
    fs.writeFileSync(PROBE, JSON.stringify({ ok: false, code: 420, message: 'Upload limit exceeded' }));
    const moved = await up('post', 'kid.jpg');
    chk('the same upload lands on the backup account', /^https:\/\/res\.cloudinary\.com\/backupcloud\//.test(moved.url || ''), JSON.stringify(moved));
    chk('…after one refusal from the main account', hits.length === 2 && hits[0].cloud === 'maincloud' && hits[1].cloud === 'backupcloud', JSON.stringify(hits));
    chk('…signed with the backup\'s own secret, in the same folder', hits[1] && hits[1].signed && hits[1].folder === hits[0].folder);
    chk('the server now sends uploads to the backup, and says so', active() === 'backup'
      && php(`echo db_row("SELECT COUNT(*) AS n FROM audit_log WHERE event = 'media.storage.switch' AND subject = 'backup'")['n'];`) === '1');
    hits.length = 0;
    const next = await up('post', 'kid2.jpg');
    chk('the next upload goes straight to the backup', /backupcloud/.test(next.url || '') && hits.length === 1 && hits[0].cloud === 'backupcloud' && hits[0].signed);

    console.log('\n── A headshot (no session) ─────────────────────────────────');
    reset(); php(`media_activate(); echo 'ok';`);
    const p2 = await (await browser.newContext()).newPage();
    await p2.context().route('https://api.cloudinary.com/**', async route => {
      const cloud = new URL(route.request().url()).pathname.split('/')[2];
      hits.push({ cloud, signed: signedOk(fields(route.request().postDataBuffer() || Buffer.alloc(0)), SECRETS[cloud] || '') });
      if (cloud === 'maincloud') return route.fulfill({ status: 420, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Upload limit exceeded' } }) });
      return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/' + cloud + '/image/upload/v1/ngg/h/1.jpg', public_id: 'ngg/h/1', resource_type: 'image', format: 'jpg', bytes: 100 }) });
    });
    await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await waitForBoot(p2);
    hits.length = 0;
    const hs = await p2.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      try { return await NGGApi.uploadFile(new File([bin], 'me.jpg', { type: 'image/jpeg' }), 'headshot'); } catch (e) { return { error: String(e.message || e) }; }
    }, jpg);
    chk('a headshot taken on a public page moves to the backup the same way', /backupcloud/.test(hs.url || '') && hits.length === 2 && hits[1].signed, JSON.stringify([hs, hits]));
    chk('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) {
    failed++; console.error('  ✗ harness error: ' + (e && e.stack || e));
  } finally {
    try { browser && await browser.close(); } catch (_) {}
    cleanup();
  }
  console.log(failed ? `\n❌ FAIL: ${passed} passed, ${failed} failed (media failover)` : `\n✅ PASS: ${passed} passed, 0 failed (media failover)`);
  process.exit(failed ? 1 : 0);
})();
