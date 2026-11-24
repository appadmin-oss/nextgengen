#!/usr/bin/env node
/* ============================================================================
   A nearer centre, offered (owner, 24 Nov 2026), through the real route.

   The promises: the family's link SHOWS the offer and answers nothing (a mail
   scanner that follows it changes nothing, however often); the page is two
   buttons in a form that posts, and the post works with no session and no
   CSRF cookie, because the emailed token is the proof; "yes" accepts the child
   at the offered centre at once; the link answers once; a bad link is a 404.

   Run:  node tests/centre-offer.test.js
   ========================================================================== */
'use strict';

const { execSync, spawn } = require('child_process');
const { waitForServer } = require('./_serve');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.CO_PORT || '8317';
const BASE = 'http://127.0.0.1:' + PORT;
const CFG = path.join(ROOT, 'api', 'config.php');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ngg-co-'));
const DB = path.join(TMP, 'ngg.db');
const ADMIN = 'NGG-CO-ADM';

let seq = 0;
function php(snippet) {
  const code = `<?php $GLOBALS['CONFIG']=require ${JSON.stringify(CFG)};require ${JSON.stringify(ROOT + '/api/_lib/bootstrap.php')};db_conn();\n` + snippet;
  const f = path.join(TMP, `s${++seq}.php`);
  fs.writeFileSync(f, code);
  return execSync('php ' + JSON.stringify(f), { cwd: ROOT }).toString().trim();
}
let server, passed = 0, failed = 0;
const chk = (m, c) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.error('  ✗ FAIL: ' + m); } };
function cleanup() {
  try { if (server) process.kill(-server.pid); } catch (_) {}
  try { fs.unlinkSync(CFG); } catch (_) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
}
const get = async (q) => { const r = await fetch(BASE + '/api/public/centre-offer.php' + q, { redirect: 'manual' }); return { status: r.status, body: await r.text() }; };
const post = async (t, answer) => { const r = await fetch(BASE + '/api/public/centre-offer.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ t, answer }).toString() }); return { status: r.status, body: await r.text() }; };
const state = () => JSON.parse(php(`$a = db_row("SELECT offerAnswer, convertedMemberId FROM applications WHERE email = 'co-ada@example.org'");
  $m = $a['convertedMemberId'] ? db_row('SELECT centre FROM members WHERE memberId = ?', [$a['convertedMemberId']]) : null;
  echo json_encode(['answer' => $a['offerAnswer'], 'member' => (string)$a['convertedMemberId'], 'centre' => $m ? $m['centre'] : '']);`));

(async () => {
  if (fs.existsSync(CFG)) { console.error('api/config.php already exists — refusing to overwrite. Move it aside and re-run.'); process.exit(2); }
  fs.writeFileSync(CFG, `<?php return [
    'db' => ['dsn' => '', 'sqlite_path' => ${JSON.stringify(DB)}],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'no-reply@example.org', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => ${JSON.stringify(BASE)},
    'cookie_secret' => 'centre_offer_secret_0123456789abcdef_xyz',
    'cookie_secure' => false, 'cookie_name' => 'ngg_sess', 'cookie_domain' => '', 'cookie_samesite' => 'Lax',
    'cache_dir' => ${JSON.stringify(path.join(TMP, 'cache'))},
    'rate_limits' => ['default' => ['max' => 100000, 'window' => 60]], 'cache_ttl' => ['default' => 0],
    'session_ttl' => 604800, 'kiosk_ttl' => 43200, 'session_idle' => ['admin' => 1800, 'member' => 43200, 'kiosk' => 43200],
    'webcron' => ['enabled' => false], 'ai' => ['enabled' => false], 'debug' => false,
  ];\n`);
  try {
    const tok = php(`db_migrate(db_conn()); $now = now_iso();
      foreach ([['CEN-CO-A', 'Coa', 1, 6.60, 3.30], ['CEN-CO-B', 'Cob', 0, 6.61, 3.31]] as [$cid, $cn, $cap, $lat, $lng])
        db_insert('centres', ['centreId' => $cid, 'name' => $cn, 'code' => substr($cid, -1) . 'X', 'color' => '#123456', 'status' => 'active', 'programmes' => 'ngg', 'capacity' => $cap, 'lat' => $lat, 'lng' => $lng, 'createdAt' => $now]);
      db_insert('members', ['memberId' => '${ADMIN}', 'fullName' => 'Admin Co', 'email' => 'admin.co@example.org', 'type' => 'NGG', 'status' => 'active', 'role' => 'super_admin', 'centre' => 'Coa', 'createdAt' => $now, 'updatedAt' => $now]);
      db_insert('members', ['memberId' => 'NGG-CO-FULL', 'fullName' => 'Full Seat', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Coa', 'createdAt' => $now, 'updatedAt' => $now]);
      db_insert('applications', ['kind' => 'teen', 'program' => 'anchor', 'name' => 'Ada Offer', 'firstName' => 'Ada', 'lastName' => 'Offer', 'email' => 'co-ada@example.org', 'phone' => '08031110000',
        'dob' => gmdate('Y-m-d', strtotime('-12 years')), 'centre' => 'Coa', 'status' => 'new', 'createdAt' => $now]);
      $id = (int)db_row("SELECT id FROM applications WHERE email = 'co-ada@example.org'")['id'];
      $GLOBALS['__mail_sink'] = [];
      $r = admin_application_offer_centre(['requesterId' => '${ADMIN}', 'id' => $id, 'centre' => 'Cob']);
      preg_match('/t=([a-f0-9]{48})/', (string)($GLOBALS['__mail_sink'][0]['html'] ?? ''), $m);
      echo empty($r['ok']) ? 'ERR:' . json_encode($r) : ($m[1] ?? 'NOTOKEN');`);
    chk('the offer is made and its email carries the one link', /^[a-f0-9]{48}$/.test(tok));
    if (!/^[a-f0-9]{48}$/.test(tok)) console.log('   ', tok.slice(0, 300));

    server = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT, path.join(ROOT, '_router.php')], { cwd: ROOT, detached: true, stdio: 'ignore' });
    await waitForServer(BASE);

    const g1 = await get('?t=' + tok); await get('?t=' + tok);
    chk('opening the link shows the offer as a page: two buttons in a form that posts, and no script', g1.status === 200 && /<form method="post">/.test(g1.body)
      && /value="yes"/.test(g1.body) && /value="wait"/.test(g1.body) && /Cob/.test(g1.body) && !/<script/i.test(g1.body));
    chk('…and opening it (twice, as a mail scanner might) answers nothing', state().answer === '' && state().member === '');
    const p1 = await post(tok, 'yes');
    const s1 = state();
    chk('"Yes", posted with no session and no CSRF cookie, accepts the child at the offered centre', p1.status === 200 && /is accepted at Cob/.test(p1.body) && s1.answer === 'yes' && s1.member !== '' && s1.centre === 'Cob');
    const p2 = await post(tok, 'wait');
    chk('the link answers once: a second answer changes nothing', /already answered/i.test(p2.body) && state().answer === 'yes');
    const bad = await get('?t=' + 'a'.repeat(48));
    chk('a link that is not one is a 404, in words', bad.status === 404 && /not valid/.test(bad.body));
  } catch (e) {
    failed++; console.error('  ✗ FAIL: the suite crashed: ' + (e && e.stack || e));
  } finally {
    cleanup();
  }
  console.log('\n' + (failed ? '❌ FAIL' : '✅ PASS') + ': ' + passed + ' passed, ' + failed + ' failed (centre offer)');
  process.exit(failed ? 1 : 0);
})();
