#!/usr/bin/env node
/* ============================================================================
   The check-in desk's face check, end to end: real PHP server, a real desk,
   a fake camera fed from a still photo, the real models (vendor/human).

   What must hold:
     · Off by default: with the setting off the desk offers no face check.
     · On: after a scan, "Check face" compares the camera with the photo on the
       record. The same man reads as a match; a different person does not.
     · Nothing but the verdict reaches the server: the audit row carries the
       verdict, the scores and the desk's decision, and no image.

   Needs ffmpeg (to turn a JPEG into the camera's y4m feed); skips without it.
   Run:  node tests/face-check.test.js
   ========================================================================== */
'use strict';
const { execSync, spawn } = require('child_process');
const { waitForServer, waitForBoot } = require('./_serve');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.FACE_PORT || '8371';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-face-'));
const DB = path.join(TMP, 'ngg.db');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'face');
const GATE = 'GATEFACE01';
let _seq = 0;
function php(snippet) {
  const f = path.join(TMP, `s${++_seq}.php`);
  fs.writeFileSync(f, `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)}; require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};\n` + snippet);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
const q = sql => JSON.parse(php(`echo json_encode(${sql});`));
function loadChromium() { for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) { try { return require(m).chromium; } catch (_) {} } return null; }
let server;
function cleanup() { try { if (server) process.kill(-server.pid); } catch (_) {} try { fs.unlinkSync(CFG); } catch (_) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} }
let passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };

async function desk(chromium, exe, cam, token) {
  const b = await chromium.launch({ executablePath: exe, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + cam,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, permissions: ['camera'] });
  const t = php(`echo session_issue(db_row("SELECT * FROM members WHERE memberId = 'NGG-FC-ADM'"), true);`);
  await ctx.addCookies([{ name: 'ngg_sess', value: t, domain: '127.0.0.1', path: '/', httpOnly: true }, { name: 'ngg_csrf', value: 'e2e-csrf-token-0123456789', domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 200)));
  await p.goto(BASE + '/gate?g=' + GATE, { waitUntil: 'domcontentloaded' });
  await waitForBoot(p);
  await p.waitForSelector('#gate-code', { timeout: 60000 });
  await p.fill('#gate-code', token); await p.press('#gate-code', 'Enter');
  await p.waitForSelector('.gate-result', { timeout: 20000 });
  return { b, p };
}

(async () => {
  const chromium = loadChromium();
  if (!chromium) { console.log('⏭  face check: skipped (playwright not installed)'); process.exit(0); }
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); } catch (_) { console.log('⏭  face check: skipped (no ffmpeg for the camera feed)'); process.exit(0); }
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  const cam = n => { const out = path.join(TMP, n + '.y4m');
    execSync(`ffmpeg -loglevel error -y -loop 1 -i ${JSON.stringify(path.join(FIX, n + '.jpg'))} -t 1 -r 6 -vf "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p" -f yuv4mpegpipe ${JSON.stringify(out)}`); return out; };
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)}, 'cookie_secret' => 'face_e2e_secret_desk_x_0123456789abcd',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))}, 'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200], 'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  let b1, b2;
  try {
    php(`$now = now_iso();
      db_insert('members', ['memberId' => 'NGG-FC-ADM', 'fullName' => 'Desk Admin', 'email' => 'fc@example.org', 'type' => 'NGG', 'status' => 'active', 'role' => 'super_admin', 'createdAt' => $now, 'updatedAt' => $now]);
      db_insert('summer_cohorts', ['cohortId' => 'C1', 'name' => 'Summer 2026', 'status' => 'active', 'startDate' => gmdate('Y-m-d', time() - 86400), 'endDate' => gmdate('Y-m-d', time() + 30 * 86400), 'createdAt' => $now]);
      db_insert('gate_links', ['gateId' => '${GATE}', 'name' => 'Face Desk', 'cohortId' => 'C1', 'centreId' => 'Egbeda', 'status' => 'active', 'createdBy' => 'seed', 'createdAt' => $now]);
      db_insert('qr_codes', ['token' => 'SUMQR-FACE0001', 'batch' => 'B1', 'cohortId' => 'C1', 'status' => 'assigned', 'studentId' => 'STU-FC-1', 'assignedName' => 'Tobi Face', 'createdAt' => $now, 'assignedAt' => $now]);
      db_insert('summer_students', ['studentId' => 'STU-FC-1', 'cohortId' => 'C1', 'token' => 'SUMQR-FACE0001', 'handle' => 'tobi', 'fullName' => 'Tobi Face', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'status' => 'active',
        'photoUrl' => '/tests/fixtures/face/man_a.jpg', 'enrolledAt' => $now, 'updatedAt' => $now]);
      echo 'ok';`);
    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);
    const d = fs.readdirSync('/opt/pw-browsers').find(x => /^chromium-\d+$/.test(x));
    const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/' + d + '/chrome-linux/chrome';

    // Off by default: no face check offered.
    let r = await desk(chromium, exe, cam('man_b'), 'SUMQR-FACE0001'); b1 = r.b;
    chk('off by default: a scan shows the result with no face check', !(await r.p.$('.gate-face-btn')));
    await b1.close(); b1 = null;

    php(`setting_set('face_check_enabled', '1', 'seed'); db_exec("DELETE FROM attendance"); echo 'ok';`);
    r = await desk(chromium, exe, cam('man_b'), 'SUMQR-FACE0001'); b1 = r.b;
    await r.p.waitForSelector('.gate-face-btn', { timeout: 10000 });
    chk('on: a check-in with a photo offers "Check face"', true);
    await r.p.click('.gate-face-btn');
    await r.p.waitForSelector('.fc-out', { timeout: 120000 }).catch(async e => { console.error('DEBUG', r.p.errs.join('\n'), (await r.p.innerText('.fc').catch(() => '')).slice(0, 500)); throw e; });
    const same = await r.p.getAttribute('.fc-out', 'class');
    console.log('    desk said: ' + (await r.p.innerText('.fc-out')).replace(/\s+/g, ' ').slice(0, 200));
    chk('the same man in front of the camera reads as a match (' + same + ')', /is-match/.test(same));
    await r.p.click('.fc-btn.is-go');
    await r.p.waitForTimeout(800);
    const A = q(`db_row("SELECT * FROM audit_log WHERE event = 'gate.face' ORDER BY id DESC LIMIT 1")`);
    const meta = JSON.parse((A && A.meta) || '{}');
    chk('the server keeps the verdict, the scores and the decision against the card holder — and no image', A && A.subject === 'STU-FC-1' && meta.verdict === 'match' && meta.decision === 'admitted'
      && typeof meta.similarity === 'number' && !/data:|base64|jpg/i.test(JSON.stringify(A)));
    chk('the camera is released and the scanner comes back when it closes', !(await r.p.$('.fc')));
    await b1.close(); b1 = null;

    php(`db_exec("DELETE FROM attendance"); echo 'ok';`);
    r = await desk(chromium, exe, cam('woman'), 'SUMQR-FACE0001'); b2 = r.b;
    await r.p.waitForSelector('.gate-face-btn', { timeout: 10000 });
    await r.p.click('.gate-face-btn');
    await r.p.waitForSelector('.fc-out', { timeout: 120000 });
    const other = await r.p.getAttribute('.fc-out', 'class');
    console.log('    desk said: ' + (await r.p.innerText('.fc-out')).replace(/\s+/g, ' ').slice(0, 200));
    chk('a different person on that card does not read as a match (' + other + ')', !/is-match/.test(other));
    await r.p.click('.fc-foot button:has-text("Hold")');
    await r.p.waitForTimeout(800);
    const B = q(`db_row("SELECT * FROM audit_log WHERE event = 'gate.face' ORDER BY id DESC LIMIT 1")`);
    chk('…and holding them is recorded', JSON.parse((B && B.meta) || '{}').decision === 'held');
    chk('no page errors', !r.p.errs.length);
    if (r.p.errs.length) console.error(r.p.errs);
  } catch (e) { failed++; console.error('  ✗ FAIL: ' + (e && e.stack || e)); }
  finally { try { b1 && await b1.close(); } catch (_) {} try { b2 && await b2.close(); } catch (_) {} cleanup(); }
  console.log((failed ? '❌' : '✅') + ' face check: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
