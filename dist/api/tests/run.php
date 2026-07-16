<?php
/**
 * NGG — zero-dependency backend test runner.
 *
 * Boots the PHP domain layer against a throwaway SQLite DB (no Composer, no
 * PHPUnit — matches the buildless philosophy) and exercises every domain
 * end-to-end. Exits non-zero on any failure so CI fails the build.
 *
 *   php api/tests/run.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); echo "CLI only\n"; exit(1); }
error_reporting(E_ALL & ~E_DEPRECATED);

$ROOT = dirname(__DIR__);                 // .../api
$tmp = sys_get_temp_dir() . '/ngg-tests-' . getmypid() . '-' . bin2hex(random_bytes(3)) . '.db';
register_shutdown_function(fn() => @unlink($tmp));

// Config normally loaded by bootstrap. Tests inject their own.
$CONFIG = [
    'db' => ['dsn' => '', 'sqlite_path' => $tmp],
    'mail' => ['from_name' => 'NGG', 'from_email' => 'test@example.com', 'reply_to' => '', 'smtp' => ['host' => '']],
    'app_origin' => 'https://ngg.example.org',
    'cookie_secret' => 'test_cookie_secret_0123456789abcdef',
    'cache_dir' => sys_get_temp_dir() . '/ngg-test-cache-' . getmypid(),
    'debug' => true,
];
$GLOBALS['CONFIG'] = $CONFIG;
function client_ip() { return '127.0.0.1'; }

require $ROOT . '/_lib/response.php';
require $ROOT . '/_lib/db.php';
require $ROOT . '/_lib/util.php';
require $ROOT . '/_lib/mailer.php';
require $ROOT . '/_lib/anchor-content.php';
require $ROOT . '/_lib/ai.php';
require $ROOT . '/_lib/bus.php';
require $ROOT . '/_lib/sms.php';
foreach (['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2', 'mentorship', 'summer', 'club', 'circle', 'momentum', 'integrations', 'registration', 'hooks', 'behaviour', 'volunteers', 'photos'] as $d) require $ROOT . "/_lib/domain/$d.php";
require $ROOT . '/_lib/backend.php';
require $ROOT . '/_lib/webcron.php';

// send_mail must not attempt real delivery in tests. Override with a no-op
// recorder BEFORE any handler calls it.
$GLOBALS['__sent_mail'] = [];
if (!function_exists('__ngg_test_mail_installed')) {
    // We can't redefine send_mail (already declared), so neutralise SMTP/mail
    // by ensuring no smtp host + mail() failure is tolerated. email_members
    // and send_mail already swallow failures and return false — fine for tests.
    function __ngg_test_mail_installed() { return true; }
}

$passed = 0; $failed = 0;
function chk(string $label, bool $cond): void {
    global $passed, $failed;
    if ($cond) { $passed++; }
    else { $failed++; echo "  ✗ FAIL: $label\n"; }
}

// ── Migration ──
db_conn();
chk('schema at target', (int)db_row('SELECT MAX(version) v FROM schema_version')['v'] === NGG_SCHEMA_TARGET);

// ── Seed ──
db_insert('members', ['memberId' => 'NGG-2025-0099', 'fullName' => 'Admin User', 'email' => 'admin@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'super_admin', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('members', ['memberId' => 'NGG-2025-0001', 'fullName' => 'Tunde Okonkwo', 'email' => 'tunde@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'track' => 'Tech', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);

// ── Sessions + stats ──
chk('year seeded 4 sessions', count(backend_dispatch('session.current', [])['all']) === 4);
chk('public stats active=2', backend_dispatch('public.stats', [])['stats']['activeMembers'] === 2);

// ── Admin gating ──
chk('member is not admin', backend_dispatch('admin.members.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('admin lists members', backend_dispatch('admin.members.list', ['requesterId' => 'NGG-2025-0099'])['total'] === 2);
chk('non-super cannot set role', (function () {
    // create a plain admin, verify they cannot promote via upsert
    backend_dispatch('admin.members.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Plain Admin', 'email' => 'pa@example.com', 'type' => 'NGG', 'centre' => 'Ayobo', 'role' => 'admin']]);
    $pa = db_row("SELECT memberId FROM members WHERE email='pa@example.com'");
    $r = backend_dispatch('admin.members.upsert', ['requesterId' => $pa['memberId'], 'data' => ['memberId' => 'NGG-2025-0001', 'role' => 'super_admin']]);
    $m = db_row("SELECT role FROM members WHERE memberId='NGG-2025-0001'");
    return $m['role'] === 'member'; // unchanged
})());

// Anchor missions self-seed a 12-week starter set on first access (empty table).
chk('anchor missions self-seed a 12-week starter set', (function () {
    $before = (int)db_row('SELECT COUNT(*) c FROM anchor_missions')['c'];
    backend_dispatch('anchor.weeks', ['memberId' => 'NGG-2025-0001']);
    $seeded = (int)db_row('SELECT COUNT(*) c FROM anchor_missions')['c'];
    db_exec("DELETE FROM anchor_missions WHERE missionId LIKE 'AM-W%'"); // reset for downstream tests
    return $before === 0 && $seeded === 12;
})());

// ── Missions + dashboard ──
$mid = backend_dispatch('admin.missions.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['week' => 1, 'order' => 1, 'theme' => 'Identity', 'title' => 'Name yourself', 'prompt' => 'Write it', 'type' => 'Reflect', 'proof' => 'none', 'xp' => 60, 'isActive' => true]])['missionId'];
db_exec("UPDATE sessions SET startDate=?, endDate=? WHERE code='SUMMER' AND year=?", [gmdate('Y-m-d', time() - 7 * 86400), gmdate('Y-m-d', time() + 30 * 86400), (int)gmdate('Y')]);
chk('mission order maps to orderIndex', (int)db_row('SELECT orderIndex FROM anchor_missions WHERE missionId=?', [$mid])['orderIndex'] === 1);
chk('auto-verify proof=none', backend_dispatch('anchor.mission.submit', ['memberId' => 'NGG-2025-0001', 'missionId' => $mid])['status'] === 'verified');
$dash = backend_dispatch('member.dashboard', ['memberId' => 'NGG-2025-0001']);
chk('dashboard xp=60', $dash['stats']['xp'] === 60);
chk('dashboard carries assignments', array_key_exists('assignments', $dash));

// ── Anchor journal (private visibility) ──
backend_dispatch('anchor.journal.create', ['memberId' => 'NGG-2025-0001', 'mood' => '🔥', 'body' => 'secret', 'private' => true]);
chk('owner reads own private journal', count(backend_dispatch('anchor.journal.list', ['memberId' => 'NGG-2025-0001', 'requesterId' => 'NGG-2025-0001'])['entries']) === 1);

// ── Assignments lifecycle ──
$aid = backend_dispatch('admin.assignments.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['title' => 'Essay', 'instructions' => 'Write 300 words', 'points' => 10, 'centre' => 'Egbeda', 'track' => 'Tech', 'status' => 'published', 'proof' => 'text']])['assignmentId'];
chk('member sees matching assignment', count(backend_dispatch('assignment.list', ['memberId' => 'NGG-2025-0001'])['assignments']) === 1);
chk('empty submission rejected', backend_dispatch('assignment.submit', ['memberId' => 'NGG-2025-0001', 'assignmentId' => $aid])['error'] === 'empty_submission');
chk('submit ok', !empty(backend_dispatch('assignment.submit', ['memberId' => 'NGG-2025-0001', 'assignmentId' => $aid, 'text' => 'My essay'])['ok']));
$subs = backend_dispatch('admin.assignments.submissions', ['requesterId' => 'NGG-2025-0099', 'assignmentId' => $aid]);
chk('admin sees submission text', $subs['submissions'][0]['text'] === 'My essay');
$sid = $subs['submissions'][0]['submissionId'];
backend_dispatch('admin.assignment.grade', ['requesterId' => 'NGG-2025-0099', 'submissionId' => $sid, 'grade' => 25, 'feedback' => 'Good']);
chk('grade clamps to max', backend_dispatch('assignment.list', ['memberId' => 'NGG-2025-0001'])['assignments'][0]['submission']['grade'] === 10);
chk('no resubmit after graded', backend_dispatch('assignment.submit', ['memberId' => 'NGG-2025-0001', 'assignmentId' => $aid, 'text' => 'x'])['error'] === 'already_graded');
// Return-for-revision reopens resubmission.
chk('return-for-revision unlocks the submission', !empty(backend_dispatch('admin.assignment.return', ['requesterId' => 'NGG-2025-0099', 'submissionId' => $sid, 'feedback' => 'Add a paragraph'])['ok']) && db_row('SELECT status FROM assignment_submissions WHERE submissionId=?', [$sid])['status'] === 'returned');
chk('member can resubmit after a return', !empty(backend_dispatch('assignment.submit', ['memberId' => 'NGG-2025-0001', 'assignmentId' => $aid, 'text' => 'My revised essay'])['ok']) && db_row('SELECT status FROM assignment_submissions WHERE submissionId=?', [$sid])['status'] === 'submitted');
backend_dispatch('admin.assignment.grade', ['requesterId' => 'NGG-2025-0099', 'submissionId' => $sid, 'grade' => 9, 'feedback' => 'Better']);

// ── Announcement ──
backend_dispatch('admin.broadcast', ['requesterId' => 'NGG-2025-0099', 'title' => 'Hello all', 'body' => 'Welcome', 'audience' => 'all']);
$seen = false;
foreach (backend_dispatch('member.notifications', ['memberId' => 'NGG-2025-0001'])['notifications'] as $n) if ($n['title'] === 'Hello all') $seen = true;
chk('broadcast reaches member feed', $seen);
// Audience targeting: a centre-scoped broadcast reaches matching members only.
$feedHas = function ($mid, $title) { foreach (backend_dispatch('member.notifications', ['memberId' => $mid])['notifications'] as $n) if ($n['title'] === $title) return true; return false; };
backend_dispatch('admin.broadcast', ['requesterId' => 'NGG-2025-0099', 'title' => 'Egbeda only', 'body' => 'x', 'audience' => 'Egbeda']);
backend_dispatch('admin.broadcast', ['requesterId' => 'NGG-2025-0099', 'title' => 'Ayobo only', 'body' => 'x', 'audience' => 'Ayobo']);
chk('centre-scoped broadcast reaches matching member', $feedHas('NGG-2025-0001', 'Egbeda only')); // NGG-2025-0001 is Egbeda
chk('centre-scoped broadcast hidden from non-matching member', !$feedHas('NGG-2025-0001', 'Ayobo only'));
// Email path is actually invoked when email=true (route used to drop it).
$GLOBALS['__mail_sink'] = [];
$br = backend_dispatch('admin.broadcast', ['requesterId' => 'NGG-2025-0099', 'title' => 'With email', 'body' => 'hi', 'audience' => 'all', 'email' => true]);
unset($GLOBALS['__mail_sink']);
chk('broadcast email fan-out runs when email=true', ($br['emailed'] ?? 0) >= 1);
chk('broadcast history lists past announcements', (function () {
    $h = backend_dispatch('admin.broadcast.history', ['requesterId' => 'NGG-2025-0099']);
    return !empty($h['ok']) && (bool)array_filter($h['announcements'], fn($a) => $a['title'] === 'Egbeda only' && $a['audience'] === 'Egbeda');
})());

// ── TOTP ──
$setup = backend_dispatch('auth.totpSetup', ['memberId' => 'NGG-2025-0099']);
$secret = $setup['secret'];
chk('totp accepts current code', backend_dispatch('auth.totpVerify', ['memberId' => 'NGG-2025-0099', 'code' => totp_code($secret, intdiv(time(), 30))])['ok'] === true);
chk('totp rejects bad code', backend_dispatch('auth.totpVerify', ['memberId' => 'NGG-2025-0099', 'code' => '000000'])['ok'] === false);
// Backup codes: setup mints 8; each works once at the gate, then is consumed.
chk('totp setup mints 8 backup codes', is_array($setup['backupCodes']) && count($setup['backupCodes']) === 8);
$bc = $setup['backupCodes'][0];
chk('a backup code satisfies the 2FA gate', backend_dispatch('auth.totpVerify', ['memberId' => 'NGG-2025-0099', 'code' => $bc])['backupUsed'] === true);
chk('a backup code cannot be reused', empty(backend_dispatch('auth.totpVerify', ['memberId' => 'NGG-2025-0099', 'code' => $bc])['ok']));
// Super-admin recovery: reset a member's 2FA + password; non-super is refused.
chk('super-admin can reset a member 2FA', !empty(backend_dispatch('admin.members.reset2fa', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0099'])['ok']) && (string)(db_row("SELECT totpSecret FROM members WHERE memberId='NGG-2025-0099'")['totpSecret'] ?? '') === '');
chk('non-super cannot reset 2FA', backend_dispatch('admin.members.reset2fa', ['requesterId' => 'NGG-2025-0001', 'memberId' => 'NGG-2025-0099'])['error'] === 'forbidden');
chk('super-admin can reset a member password', !empty(backend_dispatch('admin.members.resetPassword', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0001'])['ok']));

// ── Device sessions (Me → Security): list, per-device revoke, sign-out-everywhere ──
db_insert('device_sessions', ['sid' => 'SID-CUR', 'memberId' => 'NGG-2025-0001', 'ip' => '1.1.1.1', 'userAgent' => 'iPhone Safari', 'uaHash' => 'h1', 'createdAt' => now_iso(), 'lastSeenAt' => now_iso(), 'revokedAt' => '']);
db_insert('device_sessions', ['sid' => 'SID-OTH', 'memberId' => 'NGG-2025-0001', 'ip' => '2.2.2.2', 'userAgent' => 'Windows Chrome', 'uaHash' => 'h2', 'createdAt' => now_iso(), 'lastSeenAt' => now_iso(), 'revokedAt' => '']);
chk('security lists active devices, flags the current one', (function () {
    $r = backend_dispatch('member.security', ['requesterId' => 'NGG-2025-0001', 'sid' => 'SID-CUR']);
    $cur = array_filter($r['sessions'], fn($s) => $s['current']);
    return count($r['sessions']) === 2 && count($cur) === 1 && array_values($cur)[0]['sid'] === 'SID-CUR';
})());
chk('revoke one device removes it from the list', (function () {
    backend_dispatch('member.sessions.revoke', ['requesterId' => 'NGG-2025-0001', 'sid' => 'SID-CUR', 'targetSid' => 'SID-OTH']);
    return count(backend_dispatch('member.security', ['requesterId' => 'NGG-2025-0001', 'sid' => 'SID-CUR'])['sessions']) === 1;
})());
chk('sign-out-everywhere keeps only the current session', (function () {
    db_insert('device_sessions', ['sid' => 'SID-X', 'memberId' => 'NGG-2025-0001', 'ip' => '3.3.3.3', 'userAgent' => 'x', 'uaHash' => 'h3', 'createdAt' => now_iso(), 'lastSeenAt' => now_iso(), 'revokedAt' => '']);
    backend_dispatch('member.sessions.revoke', ['requesterId' => 'NGG-2025-0001', 'sid' => 'SID-CUR', 'others' => true]);
    $r = backend_dispatch('member.security', ['requesterId' => 'NGG-2025-0001', 'sid' => 'SID-CUR']);
    return count($r['sessions']) === 1 && $r['sessions'][0]['sid'] === 'SID-CUR';
})());
chk('logout revokes the current device session server-side', (function () {
    backend_dispatch('auth.logout', ['memberId' => 'NGG-2025-0001', 'sid' => 'SID-CUR']);
    return !empty(db_row("SELECT revokedAt FROM device_sessions WHERE sid='SID-CUR'")['revokedAt']);
})());

// ── Posts / newsletter / apply ──
chk('post publishes with slug', !empty(backend_dispatch('admin.posts.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'blog', 'title' => 'First Post', 'body' => 'Hi', 'status' => 'published']])['slug']));
chk('public reads published post', count(backend_dispatch('public.posts', ['kind' => 'blog'])['posts']) === 1);
chk('newsletter idempotent', backend_dispatch('public.newsletter', ['email' => 'sub@example.com'])['ok'] && backend_dispatch('public.newsletter', ['email' => 'sub@example.com'])['ok']);
chk('apply validates age', backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'Kid', 'lastName' => 'Test', 'email' => 'k@example.com', 'phone' => '08031234000', 'dob' => '1985-01-01'])['error'] === 'bad_age');

// ── Volunteer registration (public taxonomy: admin | mentor | instructor) ──
$vctx = backend_dispatch('public.volunteer.context', []);
chk('volunteer context lists roles', $vctx['roles'] === ['admin', 'mentor', 'instructor']);
chk('volunteer context serves the course catalogue', in_array('Coding & Robotics', $vctx['courses'], true));
chk('volunteer apply rejects unknown role', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'chef', 'firstName' => 'Vol', 'lastName' => 'One', 'email' => 'vol1@example.com', 'phone' => '08031110009', 'dob' => '1990-01-01'])['error'] === 'bad_role');
chk('instructor without a course is rejected', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'instructor', 'firstName' => 'Vol', 'lastName' => 'One', 'email' => 'vol1@example.com', 'phone' => '08031110001', 'dob' => '1990-01-01', 'courses' => ['Basket Weaving']])['error'] === 'course_required');
chk('volunteer admin role applies clean', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Vol', 'lastName' => 'Admin', 'email' => 'vol-admin@example.com', 'phone' => '08031234567', 'dob' => '1990-01-01'])['ok'] === true);
chk('volunteer phone stored normalized', db_row("SELECT phone FROM applications WHERE email = 'vol-admin@example.com'")['phone'] === '+2348031234567');
chk('instructor with valid courses applies clean', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'instructor', 'firstName' => 'Vol', 'lastName' => 'Teach', 'email' => 'vol-teach@example.com', 'phone' => '08031110002', 'dob' => '1990-01-01', 'courses' => ['Coding & Robotics', 'Chess & Strategy', 'Basket Weaving']])['ok'] === true);
chk('instructor courses stored filtered to catalogue', json_decode((string)db_row("SELECT courses FROM applications WHERE email = 'vol-teach@example.com'")['courses'], true) === ['Coding & Robotics', 'Chess & Strategy']);
chk('volunteer duplicate within 24h flagged', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Vol', 'lastName' => 'Admin', 'email' => 'vol-admin@example.com', 'phone' => '08031234567', 'dob' => '1990-01-01'])['duplicate'] === true);
chk('volunteer.applied event queued for the bus', (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind = 'volunteer.applied'")['c'] === 2);
// Standardised intake: structured name + DOB stored; legacy `name` composed.
chk('structured name + dob stored on application', (function () { $r = db_row("SELECT firstName,lastName,dob,name FROM applications WHERE email='vol-teach@example.com'"); return $r && $r['firstName'] === 'Vol' && $r['lastName'] === 'Teach' && $r['dob'] === '1990-01-01' && $r['name'] === 'Vol Teach'; })());
chk('apply rejects a malformed dob', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Bad', 'lastName' => 'Dob', 'email' => 'baddob@example.com', 'phone' => '08031110099', 'dob' => 'not-a-date'])['error'] === 'bad_dob');
chk('apply rejects an under-16 volunteer', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Too', 'lastName' => 'Young', 'email' => 'young@example.com', 'phone' => '08031110098', 'dob' => '2015-01-01'])['error'] === 'dob_too_young');
chk('apply requires a first name', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'lastName' => 'Only', 'email' => 'nofirst@example.com', 'phone' => '08031110097', 'dob' => '1990-01-01'])['error'] === 'bad_firstName');
// ── Multi-form builder (registration + volunteer + contact) ──
$fl = backend_dispatch('admin.forms.list', ['requesterId' => 'NGG-2025-0099']);
chk('forms list has all three forms', count($fl['forms']) === 3 && in_array('volunteer', array_column($fl['forms'], 'formId'), true) && in_array('contact', array_column($fl['forms'], 'formId'), true));
chk('form get is formId-scoped', backend_dispatch('admin.forms.get', ['requesterId' => 'NGG-2025-0099', 'formId' => 'contact'])['form']['formId'] === 'contact');
chk('unknown form rejected', backend_dispatch('admin.forms.get', ['requesterId' => 'NGG-2025-0099', 'formId' => 'nope'])['error'] === 'unknown_form');
$cf = backend_dispatch('admin.forms.get', ['requesterId' => 'NGG-2025-0099', 'formId' => 'contact'])['form']['fields'];
$cf2 = array_merge($cf, [['key' => 'phone_opt', 'label' => 'Phone (optional)', 'type' => 'phone']]);
chk('publish a custom field to the contact form', backend_dispatch('admin.forms.publish', ['requesterId' => 'NGG-2025-0099', 'formId' => 'contact', 'fields' => $cf2])['version'] === 2);
chk('custom field is live on contact form', in_array('phone_opt', array_column(form_live('contact')['fields'], 'key'), true));
chk('dropping a locked field is refused', backend_dispatch('admin.forms.publish', ['requesterId' => 'NGG-2025-0099', 'formId' => 'contact', 'fields' => [['key' => 'name', 'label' => 'Name', 'type' => 'text']]])['error'] === 'locked_field_missing');
chk('editing one form does not touch another', form_live('summer-reg')['version'] === 1);

// ── QR full lifecycle: mint → reassign → void ──
$qm = backend_dispatch('admin.summer.qr.mint', ['requesterId' => 'NGG-2025-0099', 'count' => 2]);
$qtok = $qm['tokens'][0];
chk('qr list reports status counts', is_array(backend_dispatch('admin.summer.qr.list', ['requesterId' => 'NGG-2025-0099'])['counts']));
// Bind that blank card to the verified summer student from earlier (SUM-2026-0001 exists in this run? use enroll path)
$enr = backend_dispatch('admin.summer.enroll', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'QR Test Kid', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'token' => $qm['tokens'][1]]]);
$qrKid = $enr['studentId'] ?? '';
chk('reassign moves a student onto another card', backend_dispatch('admin.summer.qr.reassign', ['requesterId' => 'NGG-2025-0099', 'token' => $qtok, 'studentId' => $qrKid])['ok'] === true);
chk('reassigned card is now assigned to the student', db_row('SELECT studentId FROM qr_codes WHERE token = ?', [$qtok])['studentId'] === $qrKid);
chk('old card freed on reassign', db_row('SELECT status FROM qr_codes WHERE token = ?', [$qm['tokens'][1]])['status'] === 'blank');
chk('void retires a card + detaches student', backend_dispatch('admin.summer.qr.void', ['requesterId' => 'NGG-2025-0099', 'token' => $qtok])['ok'] === true && db_row('SELECT status FROM qr_codes WHERE token = ?', [$qtok])['status'] === 'void' && db_row('SELECT token FROM summer_students WHERE studentId = ?', [$qrKid])['token'] === '');
chk('void card cannot be reassigned', backend_dispatch('admin.summer.qr.reassign', ['requesterId' => 'NGG-2025-0099', 'token' => $qtok, 'studentId' => $qrKid])['error'] === 'card_void');

chk('phone is required on volunteer intake', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'instructor', 'firstName' => 'No', 'lastName' => 'Phone', 'email' => 'nophone@example.com', 'dob' => '1990-01-01', 'courses' => ['Coding & Robotics']])['error'] === 'phone_required');

// ── Volunteer review desk: approve → ID + QR + profile; decline ──
$volAppId = (int)db_row("SELECT id FROM applications WHERE email = 'vol-teach@example.com'")['id'];
chk('non-admin cannot review volunteers', backend_dispatch('admin.volunteers.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('review desk lists the pending queue', count(backend_dispatch('admin.volunteers.list', ['requesterId' => 'NGG-2025-0099'])['pending']) >= 2);
$appr = backend_dispatch('admin.volunteers.approve', ['requesterId' => 'NGG-2025-0099', 'id' => $volAppId]);
chk('approval mints a VOL-CODE display id', preg_match('/^VOL-[A-Z]{2,4}-\d{2}-\d{3}$/', $appr['volunteer']['volunteerId']) === 1);
chk('instructor id carries the INS tier code', str_starts_with((string)$appr['volunteer']['volunteerId'], 'VOL-INS-'));
chk('approval binds a check-in token', str_starts_with((string)$appr['volunteer']['token'], 'VOLQR-'));
chk('approval marks the application accepted', db_row('SELECT status FROM applications WHERE id = ?', [$volAppId])['status'] === 'accepted');
chk('approval queues volunteer.approved for the bus', (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind = 'volunteer.approved'")['c'] === 1);
chk('re-approving is idempotent', backend_dispatch('admin.volunteers.approve', ['requesterId' => 'NGG-2025-0099', 'id' => $volAppId])['already'] === true);
$volTok = (string)$appr['volunteer']['token'];
$volId  = (string)$appr['volunteer']['volunteerId'];
chk('volunteer token serves the public digital ID', backend_dispatch('public.summerProfile', ['token' => $volTok])['profile']['kind'] === 'volunteer');
$vchk = backend_dispatch('admin.summer.checkin', ['requesterId' => 'NGG-2025-0099', 'token' => $volTok]);
chk('volunteer badge checks in through the scanner', $vchk['ok'] === true && $vchk['student']['volunteerId'] === $volId);
chk('volunteer re-scan flags already', backend_dispatch('admin.summer.checkin', ['requesterId' => 'NGG-2025-0099', 'token' => $volTok])['already'] === true);
chk('volunteer attendance shows on the profile', backend_dispatch('public.summerProfile', ['token' => $volTok])['profile']['attendanceCount'] === 1);
$volAppId2 = (int)db_row("SELECT id FROM applications WHERE email = 'vol-admin@example.com'")['id'];
chk('decline marks the application rejected', backend_dispatch('admin.volunteers.decline', ['requesterId' => 'NGG-2025-0099', 'id' => $volAppId2, 'reason' => 'Intake full'])['ok'] === true && db_row('SELECT status FROM applications WHERE id = ?', [$volAppId2])['status'] === 'rejected');
chk('approved roster lists the volunteer', in_array($volId, array_column(backend_dispatch('admin.volunteers.list', ['requesterId' => 'NGG-2025-0099'])['volunteers'], 'volunteerId'), true));

// ── Volunteer hierarchy (colour + code) + volunteer ID cards ──
chk('members cannot read the hierarchy', backend_dispatch('admin.hierarchy.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
$tiers = backend_dispatch('admin.hierarchy.list', ['requesterId' => 'NGG-2025-0099'])['tiers'];
chk('three tiers seeded (admin/mentor/instructor)', count($tiers) === 3 && in_array('INS', array_column($tiers, 'code'), true));
chk('instructor tier is crimson', (function () use ($tiers) { foreach ($tiers as $t) if ($t['tierId'] === 'VT-instructor') return $t['color'] === '#B0143C'; return false; })());
chk('tier code must stay unique', backend_dispatch('admin.hierarchy.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Clash', 'code' => 'INS', 'color' => '#123456']])['error'] === 'code_taken');
chk('tier colour is validated', backend_dispatch('admin.hierarchy.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Lead', 'code' => 'LED', 'color' => 'red']])['error'] === 'bad_color');
$newTier = backend_dispatch('admin.hierarchy.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Team Lead', 'code' => 'LED', 'color' => '#F5B026', 'rank' => 4]]);
chk('a new tier can be added', !empty($newTier['ok']) && count(backend_dispatch('admin.hierarchy.list', ['requesterId' => 'NGG-2025-0099'])['tiers']) === 4);
chk('recolouring the instructor tier sticks', backend_dispatch('admin.hierarchy.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['tierId' => 'VT-instructor', 'name' => 'Instructor', 'code' => 'INS', 'color' => '#7A0F2B']])['ok'] === true
    && (function () { foreach (backend_dispatch('admin.hierarchy.list', ['requesterId' => 'NGG-2025-0099'])['tiers'] as $t) if ($t['tierId'] === 'VT-instructor') return $t['color'] === '#7A0F2B'; return false; })());
$vcards = backend_dispatch('admin.vcards.data', ['requesterId' => 'NGG-2025-0099']);
chk('volunteer cards render for active volunteers', count($vcards['cards']) >= 1);
$vc = (function () use ($vcards, $volId) { foreach ($vcards['cards'] as $c) if ($c['volunteerId'] === $volId) return $c; return null; })();
chk('volunteer card carries the tier colour + code + split name', $vc
    && $vc['tier']['code'] === 'INS' && preg_match('/^#[0-9A-Fa-f]{6}$/', (string)$vc['tier']['color']) === 1
    && $vc['firstName'] !== '' && $vc['token'] === $volTok);
chk('tier delete removes it', backend_dispatch('admin.hierarchy.delete', ['requesterId' => 'NGG-2025-0099', 'tierId' => $newTier['tierId']])['ok'] === true
    && count(backend_dispatch('admin.hierarchy.list', ['requesterId' => 'NGG-2025-0099'])['tiers']) === 3);

// ── Minimalist email template + applicant acknowledgement ──
$__tpl = email_template(['eyebrow' => 'Verify', 'title' => 'Test', 'intro' => 'Hi', 'bodyHtml' => '<p>x</p>', 'ctaLabel' => 'Open', 'ctaUrl' => 'https://x.test', 'otp' => '482917']);
chk('email template is on-brand (navy + gold on cool neutrals, no legacy crimson)', str_contains($__tpl, '#0c1432') && str_contains($__tpl, '#f5b026') && !str_contains($__tpl, '#E4155F'));
chk('email cta button is navy, not gold', str_contains($__tpl, 'linear-gradient(180deg,#1a2954,#0c1432)'));
chk('email carries a hidden preheader', str_contains($__tpl, 'mso-hide:all'));
chk('email footer carries a reply path + contact', str_contains($__tpl, 'Reply to this email') && str_contains($__tpl, 'afrovanguard.org'));
$GLOBALS['__mail_sink'] = [];
$__ap = backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'mentor', 'firstName' => 'Ada', 'lastName' => 'Ack', 'email' => 'ada-ack@example.com', 'phone' => '08031110020', 'dob' => '1990-01-01', 'why' => 'Glad to help']);
chk('apply returns a traceable reference', isset($__ap['ref']) && preg_match('/^NGG-V-\d{5}$/', (string)$__ap['ref']) === 1 && $__ap['duplicate'] === false);
$__ack = array_values(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'ada-ack@example.com'));
chk('volunteer application acknowledges the applicant', count($__ack) === 1 && str_contains($__ack[0]['subject'], 'volunteer application'));
chk('ack is on-brand + names role + carries the reference', str_contains($__ack[0]['html'], '#0c1432') && str_contains($__ack[0]['html'], 'Mentor') && str_contains($__ack[0]['html'], (string)$__ap['ref']));
$__dup = backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'mentor', 'firstName' => 'Ada', 'lastName' => 'Ack', 'email' => 'ada-ack@example.com', 'phone' => '08031110020', 'dob' => '1990-01-01', 'why' => 'again']);
chk('resubmit is a no-op duplicate with the same reference', $__dup['duplicate'] === true && $__dup['ref'] === $__ap['ref']);
chk('duplicate does not re-acknowledge', count(array_values(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'ada-ack@example.com'))) === 1);
unset($GLOBALS['__mail_sink']);

// ── Service ledger + milestone certificates ──
$volProfile = backend_dispatch('public.summerProfile', ['token' => $volTok])['profile'];
chk('ledger counts sessions and hours (default 4h)', $volProfile['sessions'] === 1 && $volProfile['hours'] === 4);
chk('new volunteer starts safeguarding-pending', $volProfile['safeguardingCleared'] === false);
// Back-date four sessions so today's scan is the 5th — the first milestone.
db_exec('DELETE FROM attendance WHERE studentId = ?', [$volId]);
for ($i = 1; $i <= 4; $i++) db_insert('attendance', ['cohortId' => 'SUM-TEST', 'studentId' => $volId, 'token' => $volTok, 'date' => gmdate('Y-m-d', time() - $i * 86400), 'checkInAt' => now_iso(), 'method' => 'qr', 'byId' => 'NGG-2025-0099', 'device' => '', 'createdAt' => now_iso()]);
$m = backend_dispatch('admin.summer.checkin', ['requesterId' => 'NGG-2025-0099', 'token' => $volTok]);
chk('5th session mints the milestone certificate', is_array($m['certIssued']) && $m['certIssued']['milestone'] === 5 && str_starts_with($m['certIssued']['certId'], 'NGGV-'));
$certId = $m['certIssued']['certId'];
$cv = backend_dispatch('public.cert', ['id' => $certId]);
chk('certificate verifies publicly', $cv['cert']['fullName'] === 'Vol Teach' && $cv['cert']['milestone'] === 5 && $cv['cert']['hours'] === 20);
chk('unknown certificate rejects', backend_dispatch('public.cert', ['id' => 'NGGV-NOPE1'])['error'] === 'not_found');
chk('milestone never mints twice', (int)db_row('SELECT COUNT(*) c FROM volunteer_certs WHERE volunteerId = ?', [$volId])['c'] === 1);
chk('milestone event queued for the bus', (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind = 'volunteer.milestone'")['c'] === 1);
chk('profile lists the certificate', backend_dispatch('public.summerProfile', ['token' => $volTok])['profile']['certificates'][0]['certId'] === $certId);

// ── Safeguarding toggle ──
chk('safeguard validates status', backend_dispatch('admin.volunteers.safeguard', ['requesterId' => 'NGG-2025-0099', 'volunteerId' => $volId, 'status' => 'maybe'])['error'] === 'bad_status');
backend_dispatch('admin.volunteers.safeguard', ['requesterId' => 'NGG-2025-0099', 'volunteerId' => $volId, 'status' => 'cleared']);
chk('cleared safeguarding shows on the profile', backend_dispatch('public.summerProfile', ['token' => $volTok])['profile']['safeguardingCleared'] === true);
chk('scanner payload carries safeguarding', backend_dispatch('admin.summer.checkin', ['requesterId' => 'NGG-2025-0099', 'token' => $volTok])['student']['safeguardingCleared'] === true);

// ── Instructor roster view (token + email gate) ──
chk('roster refuses a wrong email', backend_dispatch('public.instructorRoster', ['token' => $volTok, 'email' => 'wrong@example.com'])['error'] === 'not_authorised');
$roster = backend_dispatch('public.instructorRoster', ['token' => $volTok, 'email' => 'VOL-TEACH@example.com']);
chk('roster opens with token + registered email', $roster['ok'] === true && $roster['courses'] === ['Coding & Robotics', 'Chess & Strategy'] && is_array($roster['students']));
chk('roster rows carry first names only', !array_filter($roster['students'], fn($r) => str_contains((string)$r['firstName'], ' ')));

// ── Overview + upcoming sessions ──
$ov = backend_dispatch('admin.overview', ['requesterId' => 'NGG-2025-0099']);
chk('overview counts volunteers', $ov['overview']['volunteers']['active'] === 1 && $ov['overview']['volunteers']['unscreened'] === 0);

// ── Attendance-taker rotation + gamified attendance (seeds active volunteers,
//    so this must run AFTER the overview volunteer-count assertion above) ──
db_insert('volunteers', ['volunteerId' => 'VOL-T-1', 'fullName' => 'Duty One', 'email' => 'd1@example.com', 'role' => 'admin', 'status' => 'active', 'safeguarding' => 'cleared', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('volunteers', ['volunteerId' => 'VOL-T-2', 'fullName' => 'Duty Two', 'email' => 'd2@example.com', 'role' => 'mentor', 'status' => 'active', 'safeguarding' => 'cleared', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
$today = gmdate('Y-m-d');
$board = backend_dispatch('attendance.duty.board', ['requesterId' => 'NGG-2025-0099', 'date' => $today]);
chk('duty board assigns a taker per centre', $board['ok'] === true && count($board['duties']) >= 1 && !empty($board['duties'][0]['volunteerId']));
$firstVol = $board['duties'][0]['volunteerId'];
chk('duty assignment is stable on re-read (round-robin persisted)', backend_dispatch('attendance.duty.board', ['requesterId' => 'NGG-2025-0099', 'date' => $today])['duties'][0]['volunteerId'] === $firstVol);
$centre0 = $board['duties'][0]['centre'];
chk('admin override pins a specific volunteer', backend_dispatch('admin.attendance.duty.set', ['requesterId' => 'NGG-2025-0099', 'date' => $today, 'centre' => $centre0, 'volunteerId' => 'VOL-T-2'])['ok'] === true);
chk('override is recorded as admin-sourced', db_row('SELECT source FROM attendance_duty WHERE date = ? AND centre = ?', [$today, $centre0])['source'] === 'admin');
// Safeguarding: an unscreened volunteer is never in the auto-rotation pool nor pinnable.
chk('duty pool excludes unscreened (pending) volunteers', (function () {
    db_insert('volunteers', ['volunteerId' => 'VOL-PEND', 'fullName' => 'Not Screened', 'email' => 'ns@example.com', 'role' => 'mentor', 'status' => 'active', 'safeguarding' => 'pending', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    foreach (attendance_duty_pool() as $v) if ($v['volunteerId'] === 'VOL-PEND') return false;
    return true;
})());
chk('admin cannot pin an unscreened volunteer to duty', backend_dispatch('admin.attendance.duty.set', ['requesterId' => 'NGG-2025-0099', 'date' => $today, 'centre' => $centre0, 'volunteerId' => 'VOL-PEND'])['error'] === 'not_cleared');
db_exec("DELETE FROM volunteers WHERE volunteerId = 'VOL-PEND'");
$done = backend_dispatch('attendance.duty.complete', ['requesterId' => 'NGG-2025-0099', 'date' => $today, 'centre' => $centre0, 'volunteerId' => 'VOL-T-2']);
chk('completing the roll awards points + returns a value-driven response', $done['ok'] === true && !empty($done['message']) && $done['game']['points'] > 0);
$ptsAfter = volunteer_game_state('VOL-T-2')['points'];
backend_dispatch('attendance.duty.complete', ['requesterId' => 'NGG-2025-0099', 'date' => $today, 'centre' => $centre0, 'volunteerId' => 'VOL-T-2']);
chk('duty completion is idempotent (no double points)', volunteer_game_state('VOL-T-2')['points'] === $ptsAfter);
chk('game state exposes level + level name', volunteer_game_state('VOL-T-2')['levelName'] === 'Recruit');
chk('point-award milestone mints once + surfaces in-app', (function () {
    $v = db_row("SELECT * FROM volunteers WHERE volunteerId = 'VOL-T-2'");
    volunteer_check_point_awards($v, 100, 200); // cross the 150 'Reliable Steward' threshold
    $has = count(array_filter(volunteer_game_state('VOL-T-2')['awards'], fn($a) => $a['name'] === 'Reliable Steward')) === 1;
    volunteer_check_point_awards($v, 100, 200); // re-run must not duplicate
    return $has && count(array_filter(volunteer_game_state('VOL-T-2')['awards'], fn($a) => $a['name'] === 'Reliable Steward')) === 1;
})());
// Gate kiosk carries the day's attendance duty for its centre (rotation banner).
db_insert('gate_links', ['gateId' => 'GATE-T-1', 'name' => 'Egbeda Desk', 'cohortId' => '', 'centreId' => 'Egbeda', 'status' => 'active', 'createdBy' => 'NGG-2025-0099', 'createdAt' => now_iso()]);
$gc = backend_dispatch('gate.context', ['gate' => 'GATE-T-1']);
chk('gate context resolves centre + attendance duty for the kiosk', ($gc['centre'] ?? '') === 'Egbeda' && !empty($gc['duty']) && !empty($gc['duty']['volunteerId']));
// Desk-password kiosk check-in: no staff cap, authorized by the gate token.
db_insert('qr_codes', ['token' => 'SUMQR-KIOSK1', 'batch' => 'BK', 'cohortId' => '', 'status' => 'assigned', 'studentId' => 'SUM-K-1', 'assignedName' => 'Kiosk Kid', 'createdAt' => now_iso(), 'assignedAt' => now_iso()]);
db_insert('summer_students', ['studentId' => 'SUM-K-1', 'cohortId' => '', 'token' => 'SUMQR-KIOSK1', 'handle' => 'kioskkid', 'fullName' => 'Kiosk Kid', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'status' => 'active', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
$ci = backend_dispatch('admin.summer.checkin', ['gateAuthorized' => true, 'byId' => 'gate:GATE-T-1', 'token' => 'SUMQR-KIOSK1', 'method' => 'gate']);
chk('gate-authorized kiosk check-in writes attendance (no staff cap needed)', $ci['ok'] === true && (int)db_row("SELECT COUNT(*) c FROM attendance WHERE studentId='SUM-K-1'")['c'] === 1);
chk('unauthorized check-in (no cap, no gate) is still refused', !empty(backend_dispatch('admin.summer.checkin', ['requesterId' => 'NGG-2025-0001', 'token' => 'SUMQR-KIOSK1'])['error']));
// Check-in state emails — synchronous (no SSH/cron), gated by a setting.
db_insert('qr_codes', ['token' => 'SUMQR-STATE1', 'batch' => 'BK', 'cohortId' => '', 'status' => 'assigned', 'studentId' => 'SUM-ST-1', 'assignedName' => 'State Kid', 'createdAt' => now_iso(), 'assignedAt' => now_iso()]);
db_insert('summer_students', ['studentId' => 'SUM-ST-1', 'cohortId' => '', 'token' => 'SUMQR-STATE1', 'handle' => 'statekid', 'fullName' => 'State Kid', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'status' => 'active', 'parentEmail' => 'guardian-state@example.com', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
$GLOBALS['__mail_sink'] = [];
$sci = backend_dispatch('admin.summer.checkin', ['gateAuthorized' => true, 'byId' => 'gate:GATE-T-1', 'token' => 'SUMQR-STATE1', 'method' => 'gate']);
chk('new student check-in emails the guardian a state note', $sci['ok'] === true && count(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'guardian-state@example.com')) === 1);
$GLOBALS['__mail_sink'] = [];
backend_dispatch('admin.summer.checkin', ['gateAuthorized' => true, 'byId' => 'gate:GATE-T-1', 'token' => 'SUMQR-STATE1', 'method' => 'gate']);
chk('same-day re-scan does not re-email the guardian', count($GLOBALS['__mail_sink']) === 0);
// Setting off ⇒ no state email even on a fresh check-in.
setting_set('checkin_state_emails', '0', 'test');
db_insert('qr_codes', ['token' => 'SUMQR-STATE2', 'batch' => 'BK', 'cohortId' => '', 'status' => 'assigned', 'studentId' => 'SUM-ST-2', 'assignedName' => 'Off Kid', 'createdAt' => now_iso(), 'assignedAt' => now_iso()]);
db_insert('summer_students', ['studentId' => 'SUM-ST-2', 'cohortId' => '', 'token' => 'SUMQR-STATE2', 'handle' => 'offkid', 'fullName' => 'Off Kid', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'status' => 'active', 'parentEmail' => 'guardian-off@example.com', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
$GLOBALS['__mail_sink'] = [];
backend_dispatch('admin.summer.checkin', ['gateAuthorized' => true, 'byId' => 'gate:GATE-T-1', 'token' => 'SUMQR-STATE2', 'method' => 'gate']);
chk('checkin_state_emails=0 suppresses the state email', count($GLOBALS['__mail_sink']) === 0);
setting_set('checkin_state_emails', '1', 'test');
// Volunteer check-in mails the volunteer their standing (award-focused / nudge).
db_insert('volunteers', ['volunteerId' => 'VOL-ST-99', 'fullName' => 'State Volunteer', 'email' => 'vol-state@example.com', 'role' => 'Mentor', 'token' => 'VOLQR-STATE', 'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('qr_codes', ['token' => 'VOLQR-STATE', 'batch' => 'BK', 'cohortId' => '', 'status' => 'assigned', 'studentId' => 'VOL-ST-99', 'assignedName' => 'State Volunteer', 'createdAt' => now_iso(), 'assignedAt' => now_iso()]);
$GLOBALS['__mail_sink'] = [];
$vsci = backend_dispatch('admin.summer.checkin', ['gateAuthorized' => true, 'byId' => 'gate:GATE-T-1', 'token' => 'VOLQR-STATE', 'method' => 'gate']);
chk('volunteer check-in emails the volunteer their state', $vsci['ok'] === true && empty($vsci['already']) && count(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'vol-state@example.com')) === 1);
unset($GLOBALS['__mail_sink']);

// ── Student completion certificates (verifiable) + revocation ──
$gr = backend_dispatch('admin.summer.student.status', ['requesterId' => 'NGG-2025-0099', 'studentId' => 'SUM-K-1', 'status' => 'graduated']);
chk('graduating a student mints a completion certificate', !empty($gr['ok']) && !empty($gr['cert']['certId']) && strpos($gr['cert']['certId'], 'NGGS-') === 0);
$stuCertId = $gr['cert']['certId'];
chk('public cert resolves the student completion cert', (function () use ($stuCertId) {
    $r = backend_dispatch('public.cert', ['id' => $stuCertId]);
    return !empty($r['ok']) && $r['cert']['type'] === 'completion' && $r['cert']['fullName'] === 'Kiosk Kid' && $r['cert']['revoked'] === false && $r['cert']['daysPresent'] >= 1;
})());
chk('re-graduating does not mint a second cert', (function () {
    backend_dispatch('admin.summer.student.status', ['requesterId' => 'NGG-2025-0099', 'studentId' => 'SUM-K-1', 'status' => 'active']);
    backend_dispatch('admin.summer.student.status', ['requesterId' => 'NGG-2025-0099', 'studentId' => 'SUM-K-1', 'status' => 'graduated']);
    return (int)db_row("SELECT COUNT(*) c FROM student_certs WHERE studentId='SUM-K-1'")['c'] === 1;
})());
chk('admin can revoke a certificate (public shows revoked)', (function () use ($stuCertId) {
    backend_dispatch('admin.cert.revoke', ['requesterId' => 'NGG-2025-0099', 'certId' => $stuCertId]);
    return backend_dispatch('public.cert', ['id' => $stuCertId])['cert']['revoked'] === true;
})());
chk('admin can restore a revoked certificate', (function () use ($stuCertId) {
    backend_dispatch('admin.cert.revoke', ['requesterId' => 'NGG-2025-0099', 'certId' => $stuCertId, 'restore' => true]);
    return backend_dispatch('public.cert', ['id' => $stuCertId])['cert']['revoked'] === false;
})());
db_insert('events', ['eventId' => 'EV-VOL-1', 'title' => 'Saturday session', 'kind' => 'session', 'sessionId' => '', 'startAt' => gmdate('Y-m-d\TH:i:s\Z', time() + 3 * 86400), 'endAt' => '', 'centre' => 'Egbeda', 'location' => 'Main hall', 'coverUrl' => '', 'body' => '', 'capacity' => 20, 'isPublic' => 1, 'status' => 'published', 'createdBy' => 'NGG-2025-0099', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
$slots = volunteer_upcoming_sessions();
chk('upcoming sessions are capacity-aware', $slots[0]['title'] === 'Saturday session' && $slots[0]['spotsLeft'] === 20);

// ── Anchor content (admin-managed, member_state) ──
chk('anchor defaults have 12 weeks', count(backend_dispatch('public.anchorContent', [])['content']['weeks']) === 12);
backend_dispatch('admin.anchor.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['quotes' => ['Only this one.']]]);
chk('admin edits anchor quotes', backend_dispatch('public.anchorContent', [])['content']['quotes'] === ['Only this one.']);
chk('anchor merge keeps weeks after partial save', count(backend_dispatch('public.anchorContent', [])['content']['weeks']) === 12);
chk('non-admin cannot edit anchor', backend_dispatch('admin.anchor.set', ['requesterId' => 'NGG-2025-0001', 'data' => ['quotes' => []]])['error'] === 'forbidden');
chk('member_state set+get roundtrips', (function () {
    backend_dispatch('member.state.set', ['memberId' => 'NGG-2025-0001', 'key' => 'systems:2026-07-04', 'value' => ['woke' => true, 'study' => true]]);
    $st = backend_dispatch('member.state.get', ['memberId' => 'NGG-2025-0001', 'keys' => 'systems:2026-07-04'])['state'];
    return isset($st['systems:2026-07-04']['woke']) && $st['systems:2026-07-04']['woke'] === true;
})());

// ── Enterprise admin: overview, applications, mentor assign, settings ──
chk('overview returns member counts', backend_dispatch('admin.overview', ['requesterId' => 'NGG-2025-0099'])['overview']['members']['active'] >= 2);
chk('overview gated', backend_dispatch('admin.overview', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'Applicant', 'lastName' => 'One', 'email' => 'app1@example.com', 'phone' => '08031110030', 'dob' => '2011-01-01', 'track' => 'Music', 'centre' => 'Ayobo']);
$apps = backend_dispatch('admin.applications.list', ['requesterId' => 'NGG-2025-0099', 'kind' => 'teen'])['applications'];
chk('applications listed', count($apps) >= 1);
$appId = $apps[0]['id'];
$conv = backend_dispatch('admin.application.convert', ['requesterId' => 'NGG-2025-0099', 'id' => $appId]);
chk('application converts to member', !empty($conv['memberId']));
chk('converted member exists', db_row('SELECT memberId FROM members WHERE email=?', ['app1@example.com']) !== null);
chk('application marked accepted', db_row('SELECT status FROM applications WHERE id=?', [$appId])['status'] === 'accepted');
// mentor assign
backend_dispatch('admin.mentors.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Mentor Zed', 'email' => 'mz@example.com', 'status' => 'active', 'tracks' => 'Tech', 'centre' => 'Egbeda']]);
$mz = db_row("SELECT mentorId FROM mentors WHERE email='mz@example.com'")['mentorId'];
backend_dispatch('admin.mentor.assign', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0001', 'mentorId' => $mz]);
$det = backend_dispatch('admin.member.detail', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0001']);
chk('member detail carries mentor', $det['detail']['mentor'] && $det['detail']['mentor']['mentorId'] === $mz);
chk('member detail has journal + progress', isset($det['detail']['journal']) && isset($det['detail']['progress']));
// settings roundtrip
backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['applications_open' => false, 'featured_session_id' => 'SUMMER-' . gmdate('Y')]]);
$set = backend_dispatch('admin.settings.get', ['requesterId' => 'NGG-2025-0099'])['settings'];
chk('settings persist (applications closed)', $set['applications_open'] === false);
// Site content: defaults, admin edit, public read, blank restores default
chk('site content serves defaults', backend_dispatch('public.siteContent', [])['site']['heroEmphasis'] === 'not waiting');
backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['site_content' => ['heroEmphasis' => 'not waiting anymore', 'heroCtaPrimary' => 'Start now']]]);
chk('site content edit goes live', backend_dispatch('public.siteContent', [])['site']['heroEmphasis'] === 'not waiting anymore');
chk('unedited site keys keep defaults', backend_dispatch('public.siteContent', [])['site']['heroTitle1'] === "Africa's next geniuses");
backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['site_content' => ['heroEmphasis' => '']]]);
chk('blank site field restores its default', backend_dispatch('public.siteContent', [])['site']['heroEmphasis'] === 'not waiting');
chk('volunteer settings roundtrip', (function () { backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['volunteer_session_hours' => 6, 'volunteer_applications_open' => false]]); $g = backend_dispatch('admin.settings.get', ['requesterId' => 'NGG-2025-0099'])['settings']; return $g['volunteer_session_hours'] === 6 && $g['volunteer_applications_open'] === false; })());
chk('idcard branding: defaults exposed', isset(backend_dispatch('admin.settings.get', ['requesterId' => 'NGG-2025-0099'])['settings']['idcard']['program']));
chk('mail delivery test op reports mode + delivered + recipient', (function () {
    $r = backend_dispatch('admin.mail.test', ['requesterId' => 'NGG-2025-0099', 'to' => 'diag@example.com']);
    return $r['ok'] === true && array_key_exists('delivered', $r) && $r['to'] === 'diag@example.com' && in_array($r['mode'], ['php_mail', 'smtp'], true);
})());
chk('mail test surfaces sender config + actionable hints', (function () {
    $r = backend_dispatch('admin.mail.test', ['requesterId' => 'NGG-2025-0099', 'to' => 'diag@example.com']);
    return $r['from'] === 'test@example.com' && $r['fromDomain'] === 'example.com' && is_array($r['hints'])
        && (bool)array_filter($r['hints'], fn($h) => stripos($h, 'SMTP') !== false || stripos($h, 'SPF') !== false);
})());
chk('mail test gives Gmail-specific guidance (From rewrite + App Password)', (function () {
    $save = $GLOBALS['CONFIG']['mail'];
    $GLOBALS['CONFIG']['mail'] = ['from_name' => 'NGG', 'from_email' => 'no-reply@ngg.afrovanguard.org', 'reply_to' => '', 'smtp' => ['host' => 'smtp.gmail.com', 'port' => 587, 'secure' => 'tls', 'user' => 'ngg.desk@gmail.com', 'pass' => 'x']];
    $GLOBALS['__mail_sink'] = [];
    $r = backend_dispatch('admin.mail.test', ['requesterId' => 'NGG-2025-0099', 'to' => 'diag@example.com']);
    unset($GLOBALS['__mail_sink']);
    $GLOBALS['CONFIG']['mail'] = $save;
    return $r['mode'] === 'smtp' && $r['smtp']['host'] === 'smtp.gmail.com'
        && (bool)array_filter($r['hints'], fn($h) => stripos($h, 'rewrites the From') !== false)
        && (bool)array_filter($r['hints'], fn($h) => stripos($h, 'App Password') !== false);
})());
// Deliverability headers: every message must carry Date + a domain-scoped Message-ID.
chk('mail headers include Date + domain-scoped Message-ID', (function () {
    $h = mail_std_headers('no-reply@afrovanguard.org.ng');
    return (bool)preg_grep('/^Date: /', $h) && (bool)preg_grep('/^Message-ID: <[0-9a-f]{32}@afrovanguard\.org\.ng>$/', $h);
})());
chk('mail domain falls back to localhost for a bare address', mail_domain_of('garbage') === 'localhost');
// multipart/alternative body carries both parts and is CRLF-clean (no bare LF).
chk('multipart body carries text + html parts, CRLF-normalized', (function () {
    $b = mail_alt_body("<p>Hi</p>\nMore", "Hi\nMore", 'BND');
    $hasBoth = strpos($b, 'text/plain') !== false && strpos($b, 'text/html') !== false && strpos($b, '--BND--') !== false;
    return $hasBoth && strpos($b, "\r\n") !== false && !preg_match('/[^\r]\n/', $b);
})());
chk('idcard branding roundtrip (editable)', (function () {
    backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['idcard' => ['website' => 'next.afrovanguard.org.ng', 'motto' => 'EMPOWERED 360°', 'logoLockup' => '/assets/idcard/logo-lockup.png']]]);
    $id = backend_dispatch('admin.cards.data', ['requesterId' => 'NGG-2025-0099'])['program'];
    return $id['website'] === 'next.afrovanguard.org.ng' && $id['logoLockup'] === '/assets/idcard/logo-lockup.png';
})());
chk('apply blocked when closed', backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'X', 'lastName' => 'Y', 'email' => 'x@example.com', 'phone' => '08031110050', 'dob' => '2011-01-01'])['error'] === 'applications_closed');
chk('newsletter list works', is_array(backend_dispatch('admin.newsletter.list', ['requesterId' => 'NGG-2025-0099'])['subscribers']));

// ── Program tagging (Summer vs Anchor) + convert respects program ──
backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['applications_open' => true]]);
backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'Summer', 'lastName' => 'Kid', 'email' => 'summer1@example.com', 'phone' => '08031110031', 'dob' => '2013-01-01', 'track' => 'Dance', 'centre' => 'Egbeda', 'program' => 'summer']);
chk('summer application tagged', db_row("SELECT program FROM applications WHERE email='summer1@example.com'")['program'] === 'summer');
backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'Anchor', 'lastName' => 'Kid', 'email' => 'anchor1@example.com', 'phone' => '08031110032', 'dob' => '2010-01-01', 'track' => 'Tech', 'centre' => 'Egbeda', 'program' => 'anchor']);
$anchorApp = db_row("SELECT id FROM applications WHERE email='anchor1@example.com'")['id'];
$convA = backend_dispatch('admin.application.convert', ['requesterId' => 'NGG-2025-0099', 'id' => $anchorApp]);
chk('anchor applicant becomes NGG member', db_row('SELECT type FROM members WHERE memberId=?', [$convA['memberId']])['type'] === 'NGG');
$summerAppId = db_row("SELECT id FROM applications WHERE email='summer1@example.com'")['id'];
$convS = backend_dispatch('admin.application.convert', ['requesterId' => 'NGG-2025-0099', 'id' => $summerAppId]);
chk('summer applicant becomes Summer member', db_row('SELECT type FROM members WHERE memberId=?', [$convS['memberId']])['type'] === 'Summer');
chk('invalid program falls back to anchor', (function () {
    backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'Junk', 'lastName' => 'Prog', 'email' => 'junkprog@example.com', 'phone' => '08031110033', 'dob' => '2011-06-01', 'program' => 'bogus']);
    return db_row("SELECT program FROM applications WHERE email='junkprog@example.com'")['program'] === 'anchor';
})());

// ── Contact form ──
chk('contact stores message', !empty(backend_dispatch('public.contact', ['name' => 'Ada Visitor', 'email' => 'ada@example.com', 'message' => 'I would love to learn more about mentoring.', 'purpose' => 'mentor'])['ref']));
chk('contact honeypot silently drops', (function () {
    $before = (int)db_row("SELECT COUNT(*) c FROM contact_messages")['c'];
    backend_dispatch('public.contact', ['name' => 'Spam Bot', 'email' => 'spam@example.com', 'message' => 'buy cheap things now cheap', 'website' => 'http://spam.example']);
    $after = (int)db_row("SELECT COUNT(*) c FROM contact_messages")['c'];
    return $before === $after;
})());
chk('contact rejects short message', backend_dispatch('public.contact', ['name' => 'Ada', 'email' => 'ada@example.com', 'message' => 'hi'])['error'] === 'message_too_short');
chk('admin lists contact messages', backend_dispatch('admin.contact.list', ['requesterId' => 'NGG-2025-0099'])['messages'][0]['name'] !== null);
chk('admin contact list gated', backend_dispatch('admin.contact.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
$firstMsg = backend_dispatch('admin.contact.list', ['requesterId' => 'NGG-2025-0099'])['messages'][0]['id'];
backend_dispatch('admin.contact.status', ['requesterId' => 'NGG-2025-0099', 'id' => $firstMsg, 'status' => 'replied']);
chk('admin sets contact status', db_row('SELECT status FROM contact_messages WHERE id=?', [$firstMsg])['status'] === 'replied');

// ── Standard password login (opt-in) ──
chk('login without a password → no_password', backend_dispatch('auth.login', ['identifier' => 'tunde@example.com', 'password' => 'anything'])['error'] === 'no_password');
chk('set password rejects short', backend_dispatch('auth.setPassword', ['memberId' => 'NGG-2025-0001', 'password' => 'short'])['error'] === 'password_too_short');
chk('set password ok', !empty(backend_dispatch('auth.setPassword', ['memberId' => 'NGG-2025-0001', 'password' => 'correcthorse9'])['ok']));
chk('member now exposes hasPassword', backend_dispatch('member.dashboard', ['memberId' => 'NGG-2025-0001'])['member']['hasPassword'] === true);
chk('login with correct password (by email)', !empty(backend_dispatch('auth.login', ['identifier' => 'tunde@example.com', 'password' => 'correcthorse9'])['ok']));
chk('login with correct password (by memberId)', !empty(backend_dispatch('auth.login', ['identifier' => 'NGG-2025-0001', 'password' => 'correcthorse9'])['ok']));
chk('login wrong password fails', backend_dispatch('auth.login', ['identifier' => 'tunde@example.com', 'password' => 'nope'])['error'] === 'invalid_login');
chk('login unknown account fails uniformly', backend_dispatch('auth.login', ['identifier' => 'ghost@example.com', 'password' => 'x'])['error'] === 'invalid_login');
chk('change password needs correct current', backend_dispatch('auth.setPassword', ['memberId' => 'NGG-2025-0001', 'password' => 'brandnewpass9', 'current' => 'wrong'])['error'] === 'bad_current_password');
chk('change password with current ok', !empty(backend_dispatch('auth.setPassword', ['memberId' => 'NGG-2025-0001', 'password' => 'brandnewpass9', 'current' => 'correcthorse9'])['ok']));
chk('old password no longer works', backend_dispatch('auth.login', ['identifier' => 'NGG-2025-0001', 'password' => 'correcthorse9'])['error'] === 'invalid_login');

// ── Sign-in gateway (one door, no account-type leaks) ──
chk('gateway: account with password offers both methods', backend_dispatch('auth.gateway', ['identifier' => 'tunde@example.com'])['methods'] === ['code', 'password']);
chk('gateway: unknown and passwordless answer identically', (function () {
    $unknown = backend_dispatch('auth.gateway', ['identifier' => 'ghost@example.com'])['methods'];
    db_insert('members', ['memberId' => 'NGG-2025-0770', 'fullName' => 'No Pass', 'email' => 'nopass@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    $passless = backend_dispatch('auth.gateway', ['identifier' => 'nopass@example.com'])['methods'];
    return $unknown === ['code'] && $passless === ['code'];
})());
chk('gateway: staff look like ordinary password accounts', backend_dispatch('auth.gateway', ['identifier' => 'pa@example.com'])['methods'] === (!empty(db_row("SELECT passwordHash FROM members WHERE email='pa@example.com'")['passwordHash']) ? ['code', 'password'] : ['code']));

// ── auth.request is resilient when the mail relay hiccups ──
// Delivered: banks an OTP row and reports delivery=true (sink captures the mail).
$GLOBALS['__mail_sink'] = [];
$rq = backend_dispatch('auth.request', ['identifier' => 'nopass@example.com']);
chk('auth.request delivered → ok + delivery=true', !empty($rq['ok']) && $rq['delivery'] === true && count($GLOBALS['__mail_sink']) === 1);
chk('auth.request banks an OTP session even so', (int)db_row("SELECT COUNT(*) c FROM auth_sessions WHERE email='nopass@example.com'")['c'] >= 1);
unset($GLOBALS['__mail_sink']);
// Mail relay down: must NOT hard-fail (no login dead-end) — still ok, delivery=false,
// and the OTP row is banked so a user who does get mail can still finish.
$before = (int)db_row("SELECT COUNT(*) c FROM auth_sessions WHERE email='nopass@example.com'")['c'];
$GLOBALS['__mail_fail'] = true;
$rq2 = backend_dispatch('auth.request', ['identifier' => 'nopass@example.com']);
unset($GLOBALS['__mail_fail']);
chk('auth.request mail failure stays ok with delivery=false', !empty($rq2['ok']) && $rq2['delivery'] === false && !empty($rq2['masked']));
chk('auth.request still banks the OTP when mail fails', (int)db_row("SELECT COUNT(*) c FROM auth_sessions WHERE email='nopass@example.com'")['c'] === $before + 1);

// ── Self-service password reset (set a password with no prior session) ──
$GLOBALS['__mail_sink'] = [];
$rr = backend_dispatch('auth.resetRequest', ['identifier' => 'nopass@example.com']);
chk('reset request → ok + delivery, emails the member', !empty($rr['ok']) && $rr['delivery'] === true && count($GLOBALS['__mail_sink']) === 1);
unset($GLOBALS['__mail_sink']);
chk('reset request banks a reset-purpose challenge', (int)db_row("SELECT COUNT(*) c FROM auth_sessions WHERE email='nopass@example.com' AND purpose='reset'")['c'] === 1);
$rsRow = db_row("SELECT * FROM auth_sessions WHERE memberId='NGG-2025-0770' AND purpose='reset' ORDER BY id DESC LIMIT 1");
chk('reset confirm rejects a short password', backend_dispatch('auth.resetConfirm', ['memberId' => 'NGG-2025-0770', 'otp' => $rsRow['otp'], 'password' => 'short'])['error'] === 'password_too_short');
chk('a reset token cannot be replayed as a login', backend_dispatch('auth.verify', ['token' => $rsRow['token']])['error'] === 'invalid');
$rc = backend_dispatch('auth.resetConfirm', ['memberId' => 'NGG-2025-0770', 'otp' => $rsRow['otp'], 'password' => 'freshpass12']);
chk('reset confirm sets the password + returns the member', !empty($rc['ok']) && ($rc['member']['memberId'] ?? '') === 'NGG-2025-0770');
chk('password sign-in now works for the reset account', !empty(backend_dispatch('auth.login', ['identifier' => 'nopass@example.com', 'password' => 'freshpass12'])['ok']));
chk('gateway now offers password after reset', backend_dispatch('auth.gateway', ['identifier' => 'nopass@example.com'])['methods'] === ['code', 'password']);
chk('reset challenge is single-use (consumed code no longer matches)', backend_dispatch('auth.resetConfirm', ['memberId' => 'NGG-2025-0770', 'otp' => $rsRow['otp'], 'password' => 'anotherpass12'])['error'] === 'invalid');
chk('reset token replay after use → already_used', backend_dispatch('auth.resetConfirm', ['token' => $rsRow['token'], 'password' => 'anotherpass12'])['error'] === 'already_used');
chk('reset request for an unknown account still looks ok (no oracle)', !empty(backend_dispatch('auth.resetRequest', ['identifier' => 'ghost-nobody@example.com'])['ok']));

// ── Mail transport selection (Apps Script is preferred once wired, like CEO) ──
chk('mail_mode is php_mail with nothing configured', mail_mode() === 'php_mail');
$GLOBALS['CONFIG']['apps_script_url'] = 'https://script.google.com/macros/s/x/exec';
$GLOBALS['CONFIG']['shared_secret'] = 'deadbeefdeadbeef';
chk('mail_mode picks apps_script when the Web App is wired', mail_mode() === 'apps_script');
$GLOBALS['CONFIG']['mail']['apps_script'] = false;
chk('mail_mode honours apps_script=false opt-out', mail_mode() === 'php_mail');
$GLOBALS['CONFIG']['apps_script_url'] = '';
$GLOBALS['CONFIG']['shared_secret'] = '';
unset($GLOBALS['CONFIG']['mail']['apps_script']);
// Unknown identifier looks identical (ok + delivery=true) — no account oracle.
chk('auth.request hides unknown accounts', (function () { $r = backend_dispatch('auth.request', ['identifier' => 'ghost@example.com']); return !empty($r['ok']) && $r['delivery'] === true && !empty($r['masked']); })());

// ── Web-cron (no-SSH host: opportunistic maintenance without cron) ──
chk('web_cron_due fires once then throttles', (function () {
    $a = web_cron_due('unit_test_job', 3600); $b = web_cron_due('unit_test_job', 3600); return $a === true && $b === false;
})());
chk('web-cron maintenance publishes a due scheduled post', (function () {
    db_insert('posts', ['postId' => 'P-SCHED-1', 'slug' => 'sched-1', 'kind' => 'blog', 'title' => 'Scheduled', 'body' => 'x', 'status' => 'draft', 'publishAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 60), 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    web_cron_maintenance();
    return db_row("SELECT status FROM posts WHERE slug = 'sched-1'")['status'] === 'published';
})());
chk('web-cron maintenance GCs an expired auth challenge', (function () {
    db_insert('auth_sessions', ['token' => 'gc-old', 'memberId' => 'NGG-2025-0099', 'email' => 'a@b.co', 'otp' => '000000', 'attempts' => 0, 'createdAt' => now_iso(), 'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 48 * 3600), 'verifiedAt' => '', 'ip' => '', 'userAgent' => '']);
    web_cron_maintenance();
    return !db_row("SELECT id FROM auth_sessions WHERE token = 'gc-old'");
})());
chk('web-cron reminders escalate a >48h unverified registration once', (function () {
    db_insert('summer_cohorts', ['cohortId' => 'WC1', 'name' => 'WC', 'status' => 'active', 'createdAt' => now_iso()]);
    $old = gmdate('Y-m-d\TH:i:s\Z', time() - 50 * 3600);
    db_insert('summer_students', ['studentId' => 'SUM-WC-1', 'cohortId' => 'WC1', 'token' => 'WCQR-1', 'handle' => 'wc1', 'fullName' => 'Stalled Kid', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'status' => 'active', 'regStatus' => 'parent_pending', 'parentEmail' => 'wcguardian@example.com', 'enrolledAt' => $old, 'remindedAt' => $old, 'updatedAt' => $old]);
    $GLOBALS['__mail_sink'] = [];
    web_cron_reminders(); web_cron_reminders(); // second run must not double-emit
    unset($GLOBALS['__mail_sink']);
    $ok = (int)db_row("SELECT COUNT(*) c FROM audit_log WHERE event='registration.stalled' AND subject='SUM-WC-1'")['c'] === 1
        && (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind='registration.stalled'")['c'] === 1;
    // Clean up so this fixture never pollutes the downstream cards dataset.
    db_exec("DELETE FROM summer_students WHERE studentId='SUM-WC-1'");
    db_exec("DELETE FROM summer_cohorts WHERE cohortId='WC1'");
    return $ok;
})());

// ── Account lockout (8 consecutive fails → 15-minute pause) ──
chk('lockout after repeated wrong passwords', (function () {
    for ($i = 0; $i < 8; $i++) backend_dispatch('auth.login', ['identifier' => 'NGG-2025-0001', 'password' => 'wrong-' . $i]);
    $r = backend_dispatch('auth.login', ['identifier' => 'NGG-2025-0001', 'password' => 'brandnewpass9']);
    return ($r['error'] ?? '') === 'account_locked';
})());
chk('lock expiry restores access + resets counters', (function () {
    db_update('members', ['lockedUntil' => gmdate('Y-m-d\TH:i:s\Z', time() - 60)], ['memberId' => 'NGG-2025-0001']);
    $r = backend_dispatch('auth.login', ['identifier' => 'NGG-2025-0001', 'password' => 'brandnewpass9']);
    $m = db_row("SELECT failedLogins, lastLoginAt FROM members WHERE memberId='NGG-2025-0001'");
    return !empty($r['ok']) && (int)$m['failedLogins'] === 0 && !empty($m['lastLoginAt']);
})());

// ── Device sessions (list + revoke) ──
chk('security overview lists sessions, flags current, revokes others', (function () {
    db_insert('device_sessions', ['sid' => 'sidAAA', 'memberId' => 'NGG-2025-0001', 'ip' => '1.2.3.4', 'userAgent' => 'Phone', 'uaHash' => 'h1', 'createdAt' => now_iso(), 'lastSeenAt' => now_iso()]);
    db_insert('device_sessions', ['sid' => 'sidBBB', 'memberId' => 'NGG-2025-0001', 'ip' => '5.6.7.8', 'userAgent' => 'Laptop', 'uaHash' => 'h2', 'createdAt' => now_iso(), 'lastSeenAt' => now_iso()]);
    $sec = backend_dispatch('member.security', ['requesterId' => 'NGG-2025-0001', 'sid' => 'sidAAA']);
    $cur = array_values(array_filter($sec['sessions'], fn($x) => $x['current']));
    if (count($sec['sessions']) < 2 || count($cur) !== 1 || $cur[0]['sid'] !== 'sidAAA' || $sec['hasPassword'] !== true) return false;
    $rv = backend_dispatch('member.sessions.revoke', ['requesterId' => 'NGG-2025-0001', 'sid' => 'sidAAA', 'others' => true]);
    if (empty($rv['ok'])) return false;
    return !empty(db_row("SELECT revokedAt FROM device_sessions WHERE sid='sidBBB'")['revokedAt'])
        && empty(db_row("SELECT revokedAt FROM device_sessions WHERE sid='sidAAA'")['revokedAt']);
})());
chk('cannot revoke another member\'s session', backend_dispatch('member.sessions.revoke', ['requesterId' => 'NGG-2025-0770', 'targetSid' => 'sidAAA'])['error'] === 'not_found');

// ── Admin tiers (RBAC) ──
db_insert('members', ['memberId' => 'NGG-2025-0002', 'fullName' => 'Edith Editor', 'email' => 'editor@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'editor', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
$paId = db_row("SELECT memberId FROM members WHERE email='pa@example.com'")['memberId'];
chk('editor caps = content only', backend_dispatch('member.dashboard', ['memberId' => 'NGG-2025-0002'])['member']['caps'] === ['content']);
chk('editor can manage anchor (content)', !empty(backend_dispatch('admin.anchor.get', ['requesterId' => 'NGG-2025-0002'])['ok']));
chk('editor blocked from members (people)', backend_dispatch('admin.members.list', ['requesterId' => 'NGG-2025-0002'])['error'] === 'forbidden');
chk('editor blocked from messages (inbox)', backend_dispatch('admin.contact.list', ['requesterId' => 'NGG-2025-0002'])['error'] === 'forbidden');
chk('editor blocked from settings', backend_dispatch('admin.settings.get', ['requesterId' => 'NGG-2025-0002'])['error'] === 'forbidden');
chk('admin can list members (people)', is_array(backend_dispatch('admin.members.list', ['requesterId' => $paId])['members'] ?? null));
chk('admin blocked from settings', backend_dispatch('admin.settings.get', ['requesterId' => $paId])['error'] === 'forbidden');
chk('super_admin reads settings', isset(backend_dispatch('admin.settings.get', ['requesterId' => 'NGG-2025-0099'])['settings']));
chk('admin cannot change roles (no rbac cap)', (function () use ($paId) {
    backend_dispatch('admin.members.upsert', ['requesterId' => $paId, 'data' => ['memberId' => 'NGG-2025-0002', 'role' => 'admin']]);
    return db_row("SELECT role FROM members WHERE memberId='NGG-2025-0002'")['role'] === 'editor';
})());
chk('super_admin can change roles', (function () {
    backend_dispatch('admin.members.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['memberId' => 'NGG-2025-0002', 'role' => 'admin']]);
    return db_row("SELECT role FROM members WHERE memberId='NGG-2025-0002'")['role'] === 'admin';
})());
chk('anchor defaults expose 12 weeks', count(backend_dispatch('admin.anchor.defaults', ['requesterId' => 'NGG-2025-0099'])['content']['weeks']) === 12);
chk('anchor set drops empty quotes', (function () {
    backend_dispatch('admin.anchor.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['quotes' => ['Keep this.', '', '   ']]]);
    return backend_dispatch('public.anchorContent', [])['content']['quotes'] === ['Keep this.'];
})());

// ── Mentorship (Afrovanguard-connected) ──
$GLOBALS['CONFIG']['afrovanguard'] = ['org_url' => 'https://afrovanguard.org.ng', 'sts_url' => 'https://afrovanguard.org.ng/projects/sts/programs/', 'volunteer_url' => 'https://cacentre.afrovanguard.org.ng/volunteer', 'mentor_program' => 'Street-To-Stardom · Next Gen'];
backend_dispatch('public.apply', ['kind' => 'mentor', 'sex' => 'Male', 'firstName' => 'Mentor', 'lastName' => 'Ada', 'email' => 'mentorada@example.com', 'phone' => '08031110040', 'dob' => '1990-01-01', 'role' => 'Music coach', 'why' => 'I want to help teens find their voice.']);
$mApp = db_row("SELECT id FROM applications WHERE email='mentorada@example.com' AND kind='mentor'")['id'];
$mConv = backend_dispatch('admin.mentor.application.convert', ['requesterId' => 'NGG-2025-0099', 'id' => $mApp]);
chk('mentor application converts to mentor', !empty($mConv['mentorId']));
chk('converted mentor tagged source=afrovanguard', db_row('SELECT source FROM mentors WHERE mentorId=?', [$mConv['mentorId']])['source'] === 'afrovanguard');
chk('mentorship overview carries Afrovanguard links', !empty(backend_dispatch('admin.mentorship.overview', ['requesterId' => 'NGG-2025-0099'])['overview']['afrovanguard']['volunteerUrl']));
chk('mentorship roster returns mentors', is_array(backend_dispatch('admin.mentorship.roster', ['requesterId' => 'NGG-2025-0099'])['mentors']));
chk('mentorship gated from non-staff', backend_dispatch('admin.mentorship.overview', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('convert refuses a teen app as mentor', backend_dispatch('admin.mentor.application.convert', ['requesterId' => 'NGG-2025-0099', 'id' => $anchorApp])['error'] === 'only_mentor_apps');
chk('mentor upsert stores new fields', (function () {
    backend_dispatch('admin.mentors.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Skilled Mentor', 'email' => 'skill@example.com', 'status' => 'active', 'tracks' => ['Tech', 'Music'], 'source' => 'afrovanguard', 'program' => 'STS', 'skills' => 'coding', 'maxMentees' => 2]]);
    $r = db_row("SELECT skills, program, tracks FROM mentors WHERE email='skill@example.com'");
    return $r['skills'] === 'coding' && $r['program'] === 'STS' && $r['tracks'] === 'Tech, Music';
})());

chk('public mentors dir carries AV links', !empty(backend_dispatch('public.mentors', [])['afrovanguard']['volunteerUrl']));
chk('public mentors shows active, hides pending', (function () {
    $names = array_map(fn($m) => $m['fullName'], backend_dispatch('public.mentors', [])['mentors']);
    return in_array('Skilled Mentor', $names, true) && !in_array('Mentor Ada', $names, true);
})());

// ── Superadmin audit trail ──
chk('admin (non-super) blocked from audit trail', backend_dispatch('admin.audit.tail', ['requesterId' => $paId])['error'] === 'forbidden');
$aud = backend_dispatch('admin.audit.tail', ['requesterId' => 'NGG-2025-0099']);
chk('super reads audit trail + actor list', is_array($aud['audit'] ?? null) && isset($aud['actors']));
chk('audit resolves a staff actor role', (function () {
    foreach (backend_dispatch('admin.audit.tail', ['requesterId' => 'NGG-2025-0099', 'staffOnly' => true])['audit'] as $r) {
        if (($r['actorRole'] ?? '') === 'super_admin') return true;
    }
    return false;
})());
chk('audit event filter narrows results', (function () {
    $r = backend_dispatch('admin.audit.tail', ['requesterId' => 'NGG-2025-0099', 'event' => 'mentor']);
    foreach ($r['audit'] as $row) { if (strpos((string)$row['event'], 'mentor') === false) return false; }
    return true;
})());

// ── Summer School (QR attendance + enrollment) ──
chk('summer_admin role caps = summer only', admin_role_caps('summer_admin') === ['summer']);
$mint = backend_dispatch('admin.summer.qr.mint', ['requesterId' => 'NGG-2025-0099', 'count' => 5]);
chk('summer mint creates blank QR cards', count($mint['tokens']) === 5);
$enr = backend_dispatch('admin.summer.enroll', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Kofi Junior', 'age' => 11, 'centre' => 'Egbeda', 'track' => 'Music']]);
chk('summer enroll binds a QR + handle', !empty($enr['studentId']) && !empty($enr['token']) && !empty($enr['handle']));
chk('bound QR flips to assigned', db_row('SELECT status FROM qr_codes WHERE token=?', [$enr['token']])['status'] === 'assigned');
chk('enrolled student in roster', (function () {
    foreach (backend_dispatch('admin.summer.students.list', ['requesterId' => 'NGG-2025-0099'])['students'] as $s) if ($s['fullName'] === 'Kofi Junior') return true;
    return false;
})());
$ci1 = backend_dispatch('admin.summer.checkin', ['requesterId' => 'NGG-2025-0099', 'token' => $enr['token']]);
chk('checkin records attendance', !empty($ci1['ok']) && $ci1['already'] === false);
chk('duplicate same-day checkin flagged', backend_dispatch('admin.summer.checkin', ['requesterId' => 'NGG-2025-0099', 'token' => $enr['token']])['already'] === true);
chk('public profile by QR token', backend_dispatch('public.summerProfile', ['token' => $enr['token']])['profile']['fullName'] === 'Kofi Junior');
chk('public profile by handle + attendance', backend_dispatch('public.summerProfile', ['handle' => $enr['handle']])['profile']['attendanceCount'] === 1);
chk('summer gated from non-staff', backend_dispatch('admin.summer.overview', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('enroll rejects an already-used QR', backend_dispatch('admin.summer.enroll', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Dupe Kid', 'age' => 12, 'token' => $enr['token']]])['error'] === 'qr_already_used');
// Admin single-enroll now captures parentEmail (was dropped → no guardian emails).
$enr2 = backend_dispatch('admin.summer.enroll', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Ada Guardianed', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'parentEmail' => 'ada-guardian@example.com']]);
chk('admin enroll persists parentEmail', db_row('SELECT parentEmail FROM summer_students WHERE studentId=?', [$enr2['studentId']])['parentEmail'] === 'ada-guardian@example.com');
// Check-OUT stamps a departure time on today's row (Kofi checked in above).
chk('checkout stamps a departure time', (function () use ($enr) {
    $r = backend_dispatch('admin.summer.checkout', ['requesterId' => 'NGG-2025-0099', 'token' => $enr['token']]);
    return !empty($r['ok']) && $r['already'] === false && !empty($r['checkOutAt']) && !empty(db_row('SELECT checkOutAt FROM attendance WHERE studentId=? AND date=?', [$enr['studentId'], gmdate('Y-m-d')])['checkOutAt']);
})());
chk('a second checkout is idempotent', backend_dispatch('admin.summer.checkout', ['requesterId' => 'NGG-2025-0099', 'token' => $enr['token']])['already'] === true);
chk('checkout without a check-in is refused', backend_dispatch('admin.summer.checkout', ['requesterId' => 'NGG-2025-0099', 'token' => $enr2['token']])['error'] === 'not_checked_in');
// Absence alert emails guardians of students absent today (enr2 is absent + has email).
chk('absence alert emails absent students\' guardians', (function () {
    $GLOBALS['__mail_sink'] = [];
    $r = backend_dispatch('admin.summer.absence.alert', ['requesterId' => 'NGG-2025-0099']);
    $hit = count(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'ada-guardian@example.com')) === 1;
    unset($GLOBALS['__mail_sink']);
    return !empty($r['ok']) && $r['sent'] >= 1 && $hit;
})());

// Attendance analytics (Phase 2 dashboard) — Kofi is enrolled + checked in above.
$att = backend_dispatch('admin.summer.attendance', ['requesterId' => 'NGG-2025-0099'])['attendance'];
chk('attendance analytics returns a 14-day series', count($att['days']) === 14);
chk('attendance counts someone present today', $att['today'] >= 1 && $att['days'][13]['present'] >= 1);
chk('attendance roster carries a present count + rate', (function () use ($att) {
    foreach ($att['roster'] as $r) if ($r['studentId'] === $GLOBALS['enr']['studentId']) return $r['present'] >= 1 && isset($r['rate']);
    return false;
})());
chk('attendance analytics gated from non-staff', backend_dispatch('admin.summer.attendance', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
// Empty cohortId (as the HTTP route passes it) must fall back to the active cohort.
chk('attendance falls back to active cohort on empty cohortId', backend_dispatch('admin.summer.attendance', ['requesterId' => 'NGG-2025-0099', 'cohortId' => ''])['attendance']['sessionDays'] >= 1);
chk('roster falls back to active cohort on empty cohortId', count(backend_dispatch('admin.summer.students.list', ['requesterId' => 'NGG-2025-0099', 'cohortId' => ''])['students']) >= 1);

// ── Stand-alone coordinator portals (Summer School + NGG Club are separate) ──
chk('admin role caps = console only (no summer/club)', admin_role_caps('admin') === ['content', 'people', 'inbox']);
chk('club_admin role caps = club only', admin_role_caps('club_admin') === ['club']);
chk('super_admin bridges both portals', in_array('summer', admin_role_caps('super_admin'), true) && in_array('club', admin_role_caps('super_admin'), true));

// Seed a summer_admin + club_admin to prove the two portals are isolated.
db_insert('members', ['memberId' => 'NGG-2025-0700', 'fullName' => 'Sunny Summer', 'email' => 'summeradmin@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'summer_admin', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('members', ['memberId' => 'NGG-2025-0701', 'fullName' => 'Clara Club', 'email' => 'clubadmin@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'club_admin', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
chk('summer_admin can read its own overview', !empty(backend_dispatch('admin.summer.overview', ['requesterId' => 'NGG-2025-0700'])['overview']));
chk('summer_admin is locked out of the Club portal', backend_dispatch('admin.club.overview', ['requesterId' => 'NGG-2025-0700'])['error'] === 'forbidden');
chk('club_admin can read its own overview', isset(backend_dispatch('admin.club.overview', ['requesterId' => 'NGG-2025-0701'])['overview']));
chk('club_admin is locked out of the Summer portal', backend_dispatch('admin.summer.overview', ['requesterId' => 'NGG-2025-0701'])['error'] === 'forbidden');
chk('club gated from non-staff', backend_dispatch('admin.club.overview', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');

// Summer → Club promotion (run by the club_admin, in their own portal).
$stuId = $enr['studentId'];
chk('promotable list carries active summer students', count(backend_dispatch('admin.club.promotable', ['requesterId' => 'NGG-2025-0701'])['students']) >= 1);
$pr = backend_dispatch('admin.club.promote', ['requesterId' => 'NGG-2025-0701', 'studentId' => $stuId]);
chk('promote mints an NGG member', !empty($pr['memberId']));
chk('promoted student flips to promoted', db_row('SELECT status FROM summer_students WHERE studentId=?', [$stuId])['status'] === 'promoted');
chk('promoted member appears in the club roster', (function () use ($pr) {
    foreach (backend_dispatch('admin.club.members', ['requesterId' => 'NGG-2025-0701'])['members'] as $m) if ($m['memberId'] === $pr['memberId']) return true;
    return false;
})());
chk('re-promoting the same student is rejected', backend_dispatch('admin.club.promote', ['requesterId' => 'NGG-2025-0701', 'studentId' => $stuId])['error'] === 'already_promoted');

// ── AI insights (rule-based fallback) + archival/compression (Phase 2 tail) ──
$ins = backend_dispatch('admin.summer.insights', ['requesterId' => 'NGG-2025-0099']);
chk('insights returns a rule-based summary when AI is off', !empty($ins['ok']) && $ins['aiConfigured'] === false && $ins['source'] === 'rules' && strlen($ins['insight']) > 10);
$scoh = db_row("SELECT cohortId FROM summer_students WHERE studentId = ?", [$enr['studentId']])['cohortId'];
$before = (int)(db_row("SELECT COUNT(*) c FROM attendance WHERE cohortId = ?", [$scoh])['c'] ?? 0);
$arch = backend_dispatch('admin.summer.cohort.archive', ['requesterId' => 'NGG-2025-0099', 'cohortId' => $scoh, 'compress' => true]);
chk('archive summarizes + compresses the cohort', !empty($arch['ok']) && $arch['compressed'] === true && $arch['purged'] === $before);
chk('archived cohort is marked archived', db_row("SELECT status FROM summer_cohorts WHERE cohortId = ?", [$scoh])['status'] === 'archived');
chk('granular attendance purged after compression', (int)(db_row("SELECT COUNT(*) c FROM attendance WHERE cohortId = ?", [$scoh])['c'] ?? 0) === 0);
chk('per-student attendance rolled up onto the row', (int)(db_row("SELECT daysPresent FROM summer_students WHERE studentId = ?", [$enr['studentId']])['daysPresent'] ?? 0) >= 1);
chk('archive gated from non-staff', backend_dispatch('admin.summer.cohort.archive', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');

// ── Anchor Circle (consent-based guardian/mentor linking) ──
$cc = backend_dispatch('member.circle', ['requesterId' => 'NGG-2025-0001']);
chk('member gets a 6-digit Anchor Link code', preg_match('/^\d{6}$/', (string)$cc['code']) === 1 && $cc['circle']['parent'] === false);
$code = $cc['code'];
chk('portal lookup resolves the student by code', !empty(backend_dispatch('circle.lookup', ['code' => $code])['student']['name']));
chk('lookup rejects an unknown code', backend_dispatch('circle.lookup', ['code' => '000000'])['error'] === 'not_found');
chk('connect requires consent', backend_dispatch('circle.connect', ['code' => $code, 'role' => 'parent'])['error'] === 'consent_required');
$conn = backend_dispatch('circle.connect', ['code' => $code, 'role' => 'parent', 'guardianName' => 'A Parent', 'consent' => true]);
chk('connect mints a portal token', !empty($conn['token']) && $conn['role'] === 'parent');
$ctok = $conn['token'];
chk('parent link now shows as linked for the student', backend_dispatch('member.circle', ['requesterId' => 'NGG-2025-0001'])['circle']['parent'] === true);
$dash = backend_dispatch('circle.dashboard', ['token' => $ctok]);
chk('portal dashboard returns read-only stats', !empty($dash['ok']) && isset($dash['stats']['weekBars']) && count($dash['stats']['weekBars']) === 7);
$today = gmdate('Y-m-d');
chk('guardian can confirm a conduct day', !empty(backend_dispatch('circle.confirm', ['token' => $ctok, 'date' => $today, 'on' => true])['ok']));
chk('confirmed day is reflected back', in_array($today, backend_dispatch('circle.dashboard', ['token' => $ctok])['confirmed'], true));
chk('guardian remark is stored + visible to the student', (function () use ($ctok) {
    backend_dispatch('circle.remark', ['token' => $ctok, 'text' => 'Proud of your consistency.']);
    foreach (backend_dispatch('member.circle', ['requesterId' => 'NGG-2025-0001'])['remarks'] as $r) if (strpos((string)$r['text'], 'Proud') !== false) return true;
    return false;
})());
chk('report carries stats + remarks', !empty(backend_dispatch('circle.report', ['token' => $ctok])['report']['stats']));
chk('dashboard carries behavioral intelligence (trend/at-risk/suggestion)', (function () use ($ctok) {
    $d = backend_dispatch('circle.dashboard', ['token' => $ctok]);
    return isset($d['stats']['trend'], $d['stats']['atRisk']) && strlen((string)($d['suggestion'] ?? '')) > 5;
})());
// Cohort strip — summaries for every token a device holds; dupes collapse,
// junk is skipped, and only that token's read-only aggregates come back.
$cohort = backend_dispatch('circle.cohort', ['tokens' => [$ctok, $ctok, 'garbage', 42]]);
chk('cohort summarises valid tokens once, skips junk', count($cohort['students']) === 1
    && $cohort['students'][0]['token'] === $ctok
    && isset($cohort['students'][0]['streak'], $cohort['students'][0]['atRisk'], $cohort['students'][0]['trend'])
    && !isset($cohort['students'][0]['reflections0'])); // shape sanity
chk('cohort never exposes private text', !preg_match('/body|musing|note/i', json_encode(array_keys($cohort['students'][0]))));
chk('cohort with no tokens is empty, not an error', backend_dispatch('circle.cohort', [])['students'] === []);

$rl = backend_dispatch('member.circle', ['requesterId' => 'NGG-2025-0001'])['links'][0]['linkId'];
chk('student can revoke a link', !empty(backend_dispatch('member.circle.revoke', ['requesterId' => 'NGG-2025-0001', 'linkId' => $rl])['ok']));
chk('revoked token no longer works', backend_dispatch('circle.dashboard', ['token' => $ctok])['error'] === 'link_invalid');
chk('revoked token drops out of the cohort', backend_dispatch('circle.cohort', ['tokens' => [$ctok]])['students'] === []);

// ── Integration bus (mocked HTTP — no network) ──
chk('bus: emit fans out only to subscribed destinations, dispatch delivers signed', (function () {
    $calls = [];
    $GLOBALS['__bus_http_mock'] = function ($url, $body, $headers) use (&$calls) {
        $calls[] = ['url' => $url, 'body' => $body, 'headers' => $headers];
        return ['ok' => true, 'body' => '{}'];
    };
    backend_dispatch('admin.integrations.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'webhook', 'name' => 'Partner', 'url' => 'https://partner.example/hook', 'secret' => 'whsec_test', 'events' => ['attendance.*']]]);
    backend_dispatch('admin.integrations.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'gchat', 'name' => 'Ops room', 'url' => 'https://chat.googleapis.com/v1/spaces/X/messages?key=k', 'events' => ['*']]]);
    $ev = event_emit('attendance.marked', ['memberId' => 'NGG-2025-0001', 'date' => '2026-07-09', 'source' => 'qr']);
    $pending = (int)db_row('SELECT COUNT(*) c FROM deliveries WHERE eventId = ?', [$ev])['c'];
    if ($pending !== 2) return false;                       // webhook (attendance.*) + gchat (*)
    $ev2 = event_emit('member.updated', ['memberId' => 'NGG-2025-0001']);
    if ((int)db_row('SELECT COUNT(*) c FROM deliveries WHERE eventId = ?', [$ev2])['c'] !== 1) return false; // gchat only
    $r = deliveries_dispatch(20);
    if ($r['delivered'] !== 3) return false;
    // Signed webhook call: verify HMAC over "ts.body" with the secret.
    foreach ($calls as $cl) {
        if (strpos($cl['url'], 'partner.example') === false) continue;
        $hdr = []; foreach ($cl['headers'] as $h) { $kv = explode(': ', $h, 2); if (count($kv) === 2) $hdr[$kv[0]] = $kv[1]; }
        if (($hdr['X-NGG-Event'] ?? '') !== 'attendance.marked') return false;
        $expect = 'sha256=' . hash_hmac('sha256', $hdr['X-NGG-Timestamp'] . '.' . $cl['body'], 'whsec_test');
        if (!hash_equals($expect, $hdr['X-NGG-Signature'] ?? '')) return false;
    }
    return true;
})());
chk('bus: failures back off then die; secrets never listed in full', (function () {
    $GLOBALS['__bus_http_mock'] = fn($u, $b, $h) => ['ok' => false, 'error' => 'http_500'];
    $ev = event_emit('attendance.marked', ['x' => 1]);
    deliveries_dispatch(20);
    $d = db_row('SELECT * FROM deliveries WHERE eventId = ? LIMIT 1', [$ev]);
    if ($d['status'] !== 'failed' || (int)$d['attempts'] !== 1 || $d['nextAttemptAt'] <= now_iso()) return false;
    db_update('deliveries', ['attempts' => 7, 'nextAttemptAt' => now_iso()], ['id' => $d['id']]);
    deliveries_dispatch(20);
    if (db_row('SELECT status FROM deliveries WHERE id = ?', [$d['id']])['status'] !== 'dead') return false;
    $list = backend_dispatch('admin.integrations.list', ['requesterId' => 'NGG-2025-0099']);
    foreach ($list['integrations'] as $i) { if (!empty($i['secret'])) return false; if (strpos(json_encode($i), 'whsec_test') !== false) return false; }
    $GLOBALS['__bus_http_mock'] = fn($u, $b, $h) => ['ok' => true, 'body' => '{}'];
    return true;
})());
chk('bus: sheets member snapshot chunks through the bridge', (function () {
    $seen = 0;
    $GLOBALS['__bus_http_mock'] = function ($url, $body, $h) use (&$seen) {
        $j = json_decode($body, true);
        if (($j['event'] ?? '') === 'members.snapshot' && ($j['secret'] ?? '') !== '' && !empty($j['data']['members'])) $seen++;
        return ['ok' => true, 'body' => '{}'];
    };
    backend_dispatch('admin.integrations.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'sheets', 'name' => 'Mirror', 'url' => 'https://script.google.com/macros/s/XX/exec', 'events' => ['member.*', 'attendance.*', 'registration.*']]]);
    $r = backend_dispatch('admin.sheets.syncMembers', ['requesterId' => 'NGG-2025-0099']);
    unset($GLOBALS['__bus_http_mock']);
    return !empty($r['ok']) && $r['chunksSent'] >= 1 && $seen >= 1;
})());
chk('bus: integrations gated to settings cap', backend_dispatch('admin.integrations.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('bus: url allowlists per kind enforced', backend_dispatch('admin.integrations.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'gchat', 'url' => 'https://evil.example/hook']])['error'] === 'bad_gchat_url');

// ── Behaviour monitor (log → triage → wellbeing escalation → review) ──
chk('behaviour: rule-triage tags a wellbeing note as urgent', (function () {
    $r = backend_dispatch('admin.behaviour.log', ['requesterId' => 'NGG-2025-0099', 'subjectId' => 'NGG-2025-0001', 'note' => 'Seemed very sad and withdrawn today, not eating.']);
    return !empty($r['ok']) && $r['category'] === 'wellbeing' && $r['severity'] === 'urgent';
})());
chk('behaviour: a wellbeing flag emits behaviour.flagged to the bus', (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind='behaviour.flagged'")['c'] >= 1);
chk('behaviour: manual category+severity overrides triage', backend_dispatch('admin.behaviour.log', ['requesterId' => 'NGG-2025-0099', 'subjectId' => 'NGG-2025-0001', 'note' => 'Helped a peer set up chairs.', 'category' => 'commendation', 'severity' => 'positive'])['aiSource'] === 'manual');
chk('behaviour: list returns logs, trend and open-flag count', (function () {
    $r = backend_dispatch('admin.behaviour.list', ['requesterId' => 'NGG-2025-0099']);
    return !empty($r['ok']) && count($r['logs']) >= 2 && is_array($r['trend']) && $r['openFlags'] >= 1;
})());
chk('behaviour: review marks a log reviewed', (function () {
    $r = backend_dispatch('admin.behaviour.list', ['requesterId' => 'NGG-2025-0099', 'status' => 'open']);
    $id = $r['logs'][0]['logId'];
    return !empty(backend_dispatch('admin.behaviour.review', ['requesterId' => 'NGG-2025-0099', 'logId' => $id])['ok'])
        && db_row('SELECT status FROM behaviour_logs WHERE logId = ?', [$id])['status'] === 'reviewed';
})());
chk('behaviour: gated to the people cap', backend_dispatch('admin.behaviour.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');

// ── SMS layer (pure normalisation + routing; no network) ──
chk('sms: NG numbers normalise to +234', sms_normalize('08031234567') === '+2348031234567' && sms_normalize('2348031234567') === '+2348031234567' && sms_normalize('+447911123456') === '+447911123456' && sms_normalize('abc') === '');
chk('sms: provider order routes NG→termii-first, intl→twilio-first', (function () {
    $GLOBALS['CONFIG']['sms'] = ['default_country' => 'NG', 'termii' => ['api_key' => 'tk'], 'twilio' => ['sid' => 's', 'token' => 't', 'from' => '+1000']];
    $ok = sms_provider_order('+2348031234567') === ['termii', 'twilio'] && sms_provider_order('+447911123456') === ['twilio', 'termii'] && sms_enabled();
    $GLOBALS['CONFIG']['sms'] = null;
    return $ok && !sms_enabled();
})());
chk('sms: falls through to second provider on failure', (function () {
    $GLOBALS['CONFIG']['sms'] = ['default_country' => 'NG', 'termii' => ['api_key' => 'tk'], 'twilio' => ['sid' => 's', 'token' => 't', 'from' => '+1000']];
    $tried = [];
    $GLOBALS['__sms_http_mock'] = function ($url, $opts) use (&$tried) {
        $tried[] = $url;
        return strpos($url, 'termii') !== false ? ['ok' => false, 'error' => 'http_500'] : ['ok' => true, 'body' => '{}'];
    };
    $r = sms_send('08031234567', 'Test message');
    unset($GLOBALS['__sms_http_mock']); $GLOBALS['CONFIG']['sms'] = null;
    return !empty($r['ok']) && $r['provider'] === 'twilio' && count($tried) === 2;
})());

// ── Registration stack: forms → gate → parent verification → QR bound ──
chk('form: live def seeds with locked system fields', (function () {
    $f = backend_dispatch('admin.forms.get', ['requesterId' => 'NGG-2025-0099']);
    $keys = array_column($f['form']['fields'], 'key');
    return $f['form']['version'] === 1 && in_array('fullName', $keys, true) && in_array('parentPhone', $keys, true);
})());
chk('form: publish is super_admin only; locked fields can\'t be dropped; versions bump', (function () {
    $pa = db_row("SELECT memberId FROM members WHERE email='pa@example.com'")['memberId'];
    if (backend_dispatch('admin.forms.publish', ['requesterId' => $pa, 'fields' => form_default_fields()])['error'] !== 'forbidden') return false;
    $noLocked = array_values(array_filter(form_default_fields(), fn($f) => $f['key'] !== 'fullName'));
    if (backend_dispatch('admin.forms.publish', ['requesterId' => 'NGG-2025-0099', 'fields' => $noLocked])['error'] !== 'locked_field_missing') return false;
    $plus = form_default_fields();
    $plus[] = ['key' => 'hasLaptop', 'label' => 'Has a laptop?', 'type' => 'yesno', 'showIf' => ['key' => 'course', 'value' => 'Coding & Robotics']];
    $r = backend_dispatch('admin.forms.publish', ['requesterId' => 'NGG-2025-0099', 'fields' => $plus]);
    return !empty($r['ok']) && $r['version'] === 2 && form_live()['version'] == 2;
})());
$GATE = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Front desk']);
chk('gate: created with URL, context serves live form', (function () use ($GATE) {
    if (empty($GATE['gateId']) || strpos($GATE['url'], '/gate?g=') === false) return false;
    $ctx = backend_dispatch('gate.context', ['gate' => $GATE['gateId']]);
    return !empty($ctx['ok']) && $ctx['form']['version'] === 2 && isset($ctx['consentTypes']['participation']);
})());
chk('gate: register validates fields and requires a parent channel', (function () use ($GATE) {
    $r = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => ['fullName' => 'K', 'age' => 3, 'course' => 'Nope']]);
    if (empty($r['errors'])) return false;
    $r2 = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => ['fullName' => 'Chidi Okafor', 'age' => 14, 'course' => 'Coding & Robotics', 'centre' => 'Main', 'parentName' => 'Mrs Okafor']]);
    return !empty($r2['errors']['parentPhone']);
})());
$REG = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => ['fullName' => 'Chidi Okafor', 'age' => 14, 'course' => 'Coding & Robotics', 'centre' => 'Main', 'parentName' => 'Mrs Okafor', 'parentPhone' => '08031234567', 'parentEmail' => 'okafor@example.com', 'allergies' => 'Peanuts']]);
chk('gate: registration lands parent_pending with normalised phone + no QR yet', (function () use ($REG) {
    if (empty($REG['ok']) || $REG['regStatus'] !== 'parent_pending') return false;
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ?', [$REG['studentId']]);
    return $s['guardianPhone'] === '+2348031234567' && ($s['token'] ?? '') === '' && !empty($s['verifyToken']);
})());
chk('gate: duplicate guard flags same child + parent, force overrides', (function () use ($GATE) {
    $d = ['fullName' => 'Chidi Okafor', 'age' => 14, 'course' => 'Coding & Robotics', 'centre' => 'Main', 'parentName' => 'Mrs Okafor', 'parentPhone' => '08031234567'];
    $r = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => $d]);
    if (($r['error'] ?? '') !== 'duplicate_suspect' || empty($r['existing']['studentId'])) return false;
    $r2 = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => $d, 'force' => true]);
    if (empty($r2['ok'])) return false;
    db_exec('DELETE FROM summer_students WHERE studentId = ?', [$r2['studentId']]); // tidy the forced dupe
    return true;
})());
chk('parent: context via token; P0 consents enforced; verify binds a QR', (function () use ($REG) {
    $vt = db_row('SELECT verifyToken FROM summer_students WHERE studentId = ?', [$REG['studentId']])['verifyToken'];
    $ctx = backend_dispatch('parent.verify.context', ['t' => $vt]);
    if (empty($ctx['ok']) || $ctx['done'] !== false || $ctx['student']['name'] !== 'Chidi Okafor') return false;
    $bad = backend_dispatch('parent.verify.submit', ['t' => $vt, 'consents' => ['participation' => true, 'medical' => true]]);
    if (($bad['error'] ?? '') !== 'consent_required') return false;
    $ok = backend_dispatch('parent.verify.submit', ['t' => $vt, 'consents' => ['participation' => true, 'medical' => true, 'data' => true, 'media' => false], 'actorName' => 'Mrs Okafor', 'feedback' => 'Please watch his peanut allergy.']);
    if (empty($ok['ok'])) return false;
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ?', [$REG['studentId']]);
    if ($s['regStatus'] !== 'verified' || empty($s['token'])) return false;
    $qr = db_row('SELECT status, studentId FROM qr_codes WHERE token = ?', [$s['token']]);
    $media = db_row("SELECT status FROM consents WHERE studentId = ? AND type = 'media'", [$REG['studentId']]);
    $p0 = db_row("SELECT status FROM consents WHERE studentId = ? AND type = 'participation'", [$REG['studentId']]);
    return $qr['status'] === 'assigned' && $qr['studentId'] === $REG['studentId'] && $media['status'] === 'declined' && $p0['status'] === 'granted';
})());
chk('parent: verified link answers done, resubmit is already', (function () use ($REG) {
    $vt = db_row('SELECT verifyToken FROM summer_students WHERE studentId = ?', [$REG['studentId']])['verifyToken'];
    return backend_dispatch('parent.verify.context', ['t' => $vt])['done'] === true
        && backend_dispatch('parent.verify.submit', ['t' => $vt, 'consents' => []])['already'] === true;
})());
chk('registrations list carries consent + pending queue; remind only for pending', (function () use ($REG) {
    $l = backend_dispatch('admin.registrations.list', ['requesterId' => 'NGG-2025-0099']);
    $mine = array_values(array_filter($l['registrations'], fn($r) => $r['studentId'] === $REG['studentId']));
    if (!$mine || !in_array('participation', $mine[0]['consents'], true)) return false;
    return backend_dispatch('admin.registrations.remind', ['requesterId' => 'NGG-2025-0099', 'studentId' => $REG['studentId']])['error'] === 'not_pending';
})());
chk('gate: revoked link stops working', (function () use ($GATE) {
    backend_dispatch('admin.gates.revoke', ['requesterId' => 'NGG-2025-0099', 'gateId' => $GATE['gateId']]);
    return backend_dispatch('gate.context', ['gate' => $GATE['gateId']])['error'] === 'gate_invalid';
})());
chk('registration events reached the outbox', (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind IN ('registration.created','registration.verified')")['c'] >= 2);

// ── Inbound attendance webhook ──
chk('hook: signature scheme verifies + rejects stale/bad', (function () {
    $sec = 'hooksecret'; $ts = (string)time(); $body = '{"a":1}';
    $sig = 'sha256=' . hash_hmac('sha256', $ts . '.' . $body, $sec);
    if (!hook_verify_signature($sec, $ts, $body, $sig)) return false;
    if (hook_verify_signature($sec, (string)(time() - 400), $body, $sig)) return false;   // stale
    if (hook_verify_signature($sec, $ts, $body, 'sha256=deadbeef')) return false;         // wrong
    if (hook_verify_signature('', $ts, $body, $sig)) return false;                        // disabled
    return true;
})());
chk('hook: batch marks summer student (by QR + ref) and member; idempotent; unknown reported', (function () {
    $st = db_row("SELECT studentId, token FROM summer_students WHERE regStatus = 'verified' ORDER BY id DESC LIMIT 1");
    $r = backend_dispatch('hooks.attendance', ['source' => 'unit', 'events' => [
        ['token' => $st['token']],
        ['ref' => 'NGG-2025-0001', 'date' => gmdate('Y-m-d')],
        ['ref' => 'GHOST-404'],
    ]]);
    if (empty($r['ok']) || $r['marked'] !== 2 || $r['unknown'] !== 1) return false;
    $r2 = backend_dispatch('hooks.attendance', ['source' => 'unit', 'events' => [['ref' => $st['studentId']]]]);
    if ($r2['already'] !== 1 || $r2['marked'] !== 0) return false;
    return (int)db_row("SELECT COUNT(*) c FROM attendance WHERE method = 'webhook'")['c'] === 2
        && (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind = 'attendance.marked'")['c'] >= 2;
})());

// ── Behaviour monitor (AI off → deterministic rules) ──
chk('behaviour: log auto-classifies, wellbeing flags emit, review closes', (function () {
    $flagsBefore = (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind = 'behaviour.flagged'")['c'];
    $r1 = backend_dispatch('admin.behaviour.log', ['requesterId' => 'NGG-2025-0099', 'subjectId' => 'NGG-2025-0001', 'note' => 'Helped a younger student pack up — a real leader today.']);
    if (empty($r1['ok']) || $r1['category'] !== 'commendation' || $r1['severity'] !== 'positive' || $r1['aiSource'] !== 'rules') return false;
    $r2 = backend_dispatch('admin.behaviour.log', ['requesterId' => 'NGG-2025-0099', 'subjectId' => 'NGG-2025-0001', 'note' => 'Seemed withdrawn and was crying quietly after the session.']);
    if ($r2['category'] !== 'wellbeing' || $r2['severity'] !== 'urgent') return false;
    if ((int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind = 'behaviour.flagged'")['c'] !== $flagsBefore + 1) return false;
    $l = backend_dispatch('admin.behaviour.list', ['requesterId' => 'NGG-2025-0099', 'subjectId' => 'NGG-2025-0001']);
    if (count($l['logs']) < 2 || $l['openFlags'] < 1 || ($l['trend']['commendation'] ?? 0) < 1) return false;
    if (empty(backend_dispatch('admin.behaviour.review', ['requesterId' => 'NGG-2025-0099', 'logId' => $r2['logId']])['ok'])) return false;
    return db_row('SELECT status FROM behaviour_logs WHERE logId = ?', [$r2['logId']])['status'] === 'reviewed';
})());
chk('behaviour: manual category wins over classifier', backend_dispatch('admin.behaviour.log', ['requesterId' => 'NGG-2025-0099', 'subjectId' => 'NGG-2025-0001', 'note' => 'Was late to class again', 'category' => 'peer', 'severity' => 'info'])['category'] === 'peer');
chk('behaviour: unknown subject + plain member both handled, non-staff blocked', (function () {
    if (backend_dispatch('admin.behaviour.log', ['requesterId' => 'NGG-2025-0099', 'subjectId' => 'NOPE-1', 'note' => 'ghost entry'])['error'] !== 'subject_not_found') return false;
    return backend_dispatch('admin.behaviour.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden';
})());

// ── Centres + ID cards ──
chk('centres: upsert validates, code unique, list works', (function () {
    $r = backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Ijaiye', 'code' => 'ij', 'color' => '#76B043']]);
    if (empty($r['ok'])) return false;
    if (backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Other', 'code' => 'IJ', 'color' => '#111111']])['error'] !== 'code_taken') return false;
    if (backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Bad', 'code' => 'B', 'color' => 'red']])['error'] !== 'bad_color') return false;
    $l = backend_dispatch('admin.centres.list', ['requesterId' => 'NGG-2025-0099']);
    return count($l['centres']) === 1 && $l['centres'][0]['code'] === 'IJ';
})());
chk('cards: verified student gets CODE-YY-serial + QR token + centre colour', (function () {
    db_update('summer_students', ['centre' => 'Ijaiye'], ['regStatus' => 'verified']);
    $d = backend_dispatch('admin.cards.data', ['requesterId' => 'NGG-2025-0099']);
    if (empty($d['ok']) || count($d['cards']) < 1) return false;
    $c = $d['cards'][0];
    $yy = gmdate('y');
    if (!preg_match('/^IJ-' . $yy . '-\d{3}$/', $c['displayId'])) return false;
    if (strpos($c['token'], 'SUMQR-') !== 0 || $c['centre']['color'] !== '#76B043') return false;
    if ($c['firstName'] === '' || $d['program']['program'] !== 'LCASP') return false;
    // Allocation is sticky — a second read must not re-serial.
    $d2 = backend_dispatch('admin.cards.data', ['requesterId' => 'NGG-2025-0099']);
    return $d2['cards'][0]['displayId'] === $c['displayId'];
})());
chk('cards: gate context serves centre options for the centre field', (function () {
    $g = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Card desk']);
    $ctx = backend_dispatch('gate.context', ['gate' => $g['gateId']]);
    foreach ($ctx['form']['fields'] as $f) if ($f['key'] === 'centre') return ($f['options'] ?? []) === ['Ijaiye'];
    return true; // no centre field in the form — acceptable
})());

// ── AI profiles (offline resolution only — no network in tests) ──
chk('ai disabled with no keys', ai_enabled() === false && ai_enabled('coach') === false && ai_complete('s', 'u')['error'] === 'ai_disabled');
chk('ai profile chain: profile → fallback → default, deduped', (function () {
    $GLOBALS['CONFIG']['ai'] = [
        'provider' => 'gemini', 'gemini_api_key' => 'DEFKEY', 'gemini_model' => 'gemini-1.5-flash',
        'profiles' => [
            'behaviour' => ['provider' => 'groq', 'api_key' => 'BKEY', 'model' => 'llama-3.1-8b-instant',
                            'fallback' => ['provider' => 'gemini', 'api_key' => 'DEFKEY', 'model' => 'gemini-1.5-flash']],
        ],
    ];
    $c = ai_profile_candidates('behaviour');
    $ok = count($c) === 2 && $c[0]['provider'] === 'groq' && $c[0]['api_key'] === 'BKEY' && $c[1]['api_key'] === 'DEFKEY';
    $ok = $ok && ai_provider('behaviour') === 'groq' && ai_provider('coach') === 'gemini'; // coach falls to default
    $GLOBALS['CONFIG']['ai'] = null;
    return $ok;
})());
chk('ai profile with junk provider is skipped', (function () {
    $GLOBALS['CONFIG']['ai'] = ['profiles' => ['x' => ['provider' => 'evilhost', 'api_key' => 'k']]];
    $ok = ai_profile_candidates('x') === [] && ai_enabled('x') === false;
    $GLOBALS['CONFIG']['ai'] = null;
    return $ok;
})());

// ── Behavioral Momentum engine + nudges (isolated fresh member) ──
db_insert('members', ['memberId' => 'NGG-2025-0800', 'fullName' => 'Momo Test', 'email' => 'momo@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('journal', ['entryId' => 'JM-1', 'memberId' => 'NGG-2025-0800', 'week' => 1, 'mood' => 'good', 'body' => 'x', 'createdAt' => gmdate('Y-m-d\TH:i:s', time() - 86400)]);
db_insert('journal', ['entryId' => 'JM-2', 'memberId' => 'NGG-2025-0800', 'week' => 1, 'mood' => 'good', 'body' => 'x', 'createdAt' => gmdate('Y-m-d\TH:i:s', time() - 2 * 86400)]);
$mo = backend_dispatch('member.momentum', ['requesterId' => 'NGG-2025-0800'])['momentum'];
chk('momentum computes a 2-day streak from entries', $mo['streak'] === 2 && $mo['reflectedToday'] === false);
chk('momentum returns level + progression fields', $mo['level'] >= 1 && $mo['levelName'] !== '' && isset($mo['xpToNext']));
chk('momentum longest-streak ≥ current', $mo['longestStreak'] >= $mo['streak']);
chk('momentum fires a loss-aversion nudge for the live streak', (function () use ($mo) {
    foreach ($mo['nudges'] as $x) if ($x['type'] === 'loss_aversion') return true;
    return false;
})());
chk('momentum gated to a real member', backend_dispatch('member.momentum', ['requesterId' => 'NOPE'])['error'] === 'member_gone');

// AI Reflection Coach — fallback path (no AI key configured in tests).
$co = backend_dispatch('member.coach', ['requesterId' => 'NGG-2025-0800', 'messages' => [['role' => 'me', 'text' => 'I felt distracted today.']]]);
chk('coach returns a reflective reply (fallback)', !empty($co['ok']) && $co['source'] === 'fallback' && strlen($co['reply']) > 5 && $co['aiConfigured'] === false);
chk('coach rejects an empty transcript', backend_dispatch('member.coach', ['requesterId' => 'NGG-2025-0800', 'messages' => []])['error'] === 'empty');
chk('coach gated to a real member', backend_dispatch('member.coach', ['requesterId' => 'NOPE', 'messages' => [['role' => 'me', 'text' => 'hi']]])['error'] === 'member_gone');

// ── Photo pipeline: free-AI analysis → Cloudinary edit (credit-gated) → approve/queue → alerts ──
$SRC = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
// Cloudinary edit: general optimization ALWAYS applied; the one credit-gated
// AI step (background replacement) gated on credits. Enhancement is identity-
// safe — no generative transforms (no e_upscale / e_gen_restore) ever appear.
$ed = cloudinary_edit($SRC, ['brighten' => true, 'sharpen' => true, 'removeBackground' => true], true);
chk('cloudinary always optimizes (f_auto,q_auto,e_improve,face crop)', strpos($ed['transforms'], 'f_auto') !== false && strpos($ed['transforms'], 'q_auto') !== false && strpos($ed['transforms'], 'g_face') !== false && strpos($ed['transforms'], 'e_improve') !== false);
chk('softness recovered with a NON-generative unsharp mask', strpos($ed['transforms'], 'e_sharpen') !== false);
chk('identity-safe: no generative transforms are ever emitted', strpos($ed['transforms'], 'e_upscale') === false && strpos($ed['transforms'], 'e_gen_') === false);
chk('background replacement applied when credits OK', $ed['aiUsed'] === true && strpos($ed['transforms'], 'e_background_removal') !== false);
$edNo = cloudinary_edit($SRC, ['sharpen' => true, 'removeBackground' => true], false);
chk('background replacement SKIPPED when credits exhausted (still optimizes + sharpens)', $edNo['aiUsed'] === false && strpos($edNo['transforms'], 'e_background_removal') === false && strpos($edNo['transforms'], 'e_sharpen') !== false && strpos($edNo['transforms'], 'f_auto') !== false);
chk('transform is inserted into the delivery URL', strpos($ed['url'], '/upload/c_fill,g_face') !== false);

// Clean photo → auto-approved.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => true, 'provider' => 'gemini', 'data' => ['score' => 92, 'issues' => [], 'flags' => [], 'recommend' => ['crop' => true]]];
$ing = photo_ingest('student', 'SUM-2026-9001', $SRC, 'NGG-2025-0099');
chk('photo_ingest creates a v1 asset', !empty($ing['ok']) && $ing['version'] === 1 && strpos($ing['assetId'], 'PH-') === 0);
$pr = photo_process($ing['assetId']);
chk('clean photo auto-approves with an edited URL', $pr['status'] === 'approved' && strpos($pr['editedUrl'], '/upload/') !== false);
chk('every ID headshot gets a clean studio backdrop by default (not only busy_background)', $pr['aiUsed'] === true && strpos($pr['editedUrl'], 'e_background_removal') !== false);
chk('approved photo satisfies the issuance gate', photo_approved_for('student', 'SUM-2026-9001') === true);
// Backdrop swap is switchable off without touching the rest of the pipeline.
setting_set('photo_bg_removal', '0');
$ingOff = photo_ingest('student', 'SUM-2026-9011', $SRC, 'NGG-2025-0099');
$prOff = photo_process($ingOff['assetId']);
chk('photo_bg_removal=0 disables the backdrop swap (still optimizes)', strpos($prOff['editedUrl'], 'e_background_removal') === false && strpos($prOff['editedUrl'], 'f_auto') !== false);
setting_set('photo_bg_removal', '1');

// Re-capture supersedes and versions.
$ing2 = photo_ingest('student', 'SUM-2026-9001', $SRC, 'NGG-2025-0099');
chk('re-capture supersedes v1 and creates v2', $ing2['version'] === 2 && db_row("SELECT status FROM photo_assets WHERE assetId=?", [$ing['assetId']])['status'] === 'superseded');

// Flagged photo (two faces) → human review queue, never auto-approved.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => true, 'provider' => 'gemini', 'data' => ['score' => 80, 'issues' => ['two people'], 'flags' => ['multiple_faces'], 'recommend' => ['crop' => true]]];
$fi = photo_ingest('volunteer', 'VOL-INS-26-777', $SRC, 'NGG-2025-0099');
$fp = photo_process($fi['assetId']);
chk('a flagged photo routes to human review, not auto-approve', $fp['status'] === 'pending_review');
$queue = backend_dispatch('admin.photo.queue', ['requesterId' => 'NGG-2025-0099']);
chk('review queue lists the flagged asset', in_array($fi['assetId'], array_column($queue['queue'], 'assetId'), true));
chk('editor cannot be a plain member', backend_dispatch('admin.photo.queue', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
// Atomic claim, then approve.
$c1 = backend_dispatch('admin.photo.claim', ['requesterId' => 'NGG-2025-0099', 'assetId' => $fi['assetId']]);
chk('editor claims the asset (atomic lock)', !empty($c1['ok']));
chk('a second claim on the same asset fails', backend_dispatch('admin.photo.claim', ['requesterId' => 'NGG-2025-0099', 'assetId' => $fi['assetId']])['error'] === 'already_claimed');
chk('editor approves after review', !empty(backend_dispatch('admin.photo.approve', ['requesterId' => 'NGG-2025-0099', 'assetId' => $fi['assetId'], 'note' => 'ok'])['ok']) && db_row("SELECT status,autoApproved FROM photo_assets WHERE assetId=?", [$fi['assetId']])['status'] === 'approved');

// AI unavailable → human review + alert on email + bus.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => false, 'error' => 'ai_disabled'];
$GLOBALS['CONFIG']['admin_email'] = 'ops@example.com'; // give the alert an inbox
$GLOBALS['__mail_sink'] = [];
$au = photo_ingest('student', 'SUM-2026-9002', $SRC, 'NGG-2025-0099');
$ap = photo_process($au['assetId']);
chk('AI-unavailable photo still gets a Cloudinary optimization', strpos((string)$ap['editedUrl'], 'f_auto') !== false);
chk('AI-unavailable photo goes to human review', $ap['status'] === 'pending_review');
chk('AI outage alerts a human by email', count(array_filter($GLOBALS['__mail_sink'], fn($m) => strpos($m['subject'], 'Photo pipeline') !== false)) >= 1);
unset($GLOBALS['__mail_sink'], $GLOBALS['__ai_photo_mock']);

// Credit guard: crossing the threshold flips the flag + alerts.
$GLOBALS['__cloudinary_usage_mock'] = fn() => 95;
$GLOBALS['CONFIG']['cloudinary'] = (($GLOBALS['CONFIG']['cloudinary'] ?? []) + []) ; $GLOBALS['CONFIG']['cloudinary']['credit_guard'] = ['enabled' => true, 'threshold_pct' => 90];
$GLOBALS['__mail_sink'] = [];
$ru = cloudinary_refresh_usage();
chk('credit guard flips to exhausted past the threshold', !empty($ru['exhausted']) && cloudinary_credits_ok() === false);
setting_set('cloudinary_credits', 'ok', 'system');
unset($GLOBALS['__cloudinary_usage_mock'], $GLOBALS['__mail_sink']);

// ── Geo-fencing: distance math, centre mapping, auto-select + anti-cheat ──
chk('geo: haversine ~111m per 0.001° latitude', (function () { $d = geo_distance_m(6.600, 3.300, 6.601, 3.300); return $d > 108 && $d < 114; })());
chk('geo: identical points are ~0m apart', geo_distance_m(6.6, 3.3, 6.6, 3.3) < 0.5);

$cA = backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'lat' => 6.6000, 'lng' => 3.3000, 'radiusM' => 150, 'geofence' => true, 'mapSource' => 'onsite', 'mapAccuracyM' => 8]]);
chk('geo: a centre maps with an on-site point', !empty($cA['ok']));
chk('geo: an out-of-range lat/lng is rejected', backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Bad Geo', 'code' => 'BGX', 'color' => '#123456', 'lat' => 200, 'lng' => 3.3]])['error'] === 'bad_latlng');
chk('geo: a lone lat with no lng is rejected', backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Half Geo', 'code' => 'HGX', 'color' => '#123456', 'lat' => 6.6]])['error'] === 'bad_latlng');
chk('geo: a device inside the fence matches its centre', (function () { $m = geo_match_centre(6.6000, 3.3000); return $m && $m['inFence'] === true && $m['centre']['code'] === 'AYB'; })());
chk('geo: a device ~500m out is the nearest fence but out of range', (function () { $m = geo_match_centre(6.6045, 3.3000); return $m && $m['inFence'] === false && $m['distanceM'] > 400; })());

setting_set('geofence_enabled', '1', 'system');
$geoGate = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Geo desk']);
chk('geo: registration is blocked with no location when the fence is on',
    backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid One', 'age' => 12, 'course' => 'Coding & Robotics', 'parentName' => 'P', 'parentPhone' => '08030000001']])['error'] === 'geo_unavailable');
$gi = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Two', 'age' => 12, 'course' => 'Coding & Robotics', 'parentName' => 'P', 'parentPhone' => '08030000002'], 'lat' => 6.6000, 'lng' => 3.3000]);
chk('geo: an in-fence registration auto-selects the fenced centre', !empty($gi['ok']) && ($gi['geo']['autoCentre'] ?? '') === 'Ayobo Hub' && $gi['geo']['ok'] === 1);
chk('geo: the student row records the fence pass + captured location', (function () use ($gi) { $s = db_row("SELECT regGeoOk, regLat, centre FROM summer_students WHERE studentId=?", [$gi['studentId']]); return (int)$s['regGeoOk'] === 1 && $s['centre'] === 'Ayobo Hub' && abs((float)$s['regLat'] - 6.6) < 0.0001; })());
$go = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Three', 'age' => 12, 'course' => 'Coding & Robotics', 'parentName' => 'P', 'parentPhone' => '08030000003'], 'lat' => 6.6045, 'lng' => 3.3000]);
chk('geo: an out-of-fence registration is blocked with the nearest distance', ($go['error'] ?? '') === 'geo_out_of_fence' && ($go['nearest']['distanceM'] ?? 0) > 400);
$gov = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Four', 'age' => 12, 'course' => 'Coding & Robotics', 'centre' => 'Ayobo Hub', 'parentName' => 'P', 'parentPhone' => '08030000004'], 'lat' => 6.6045, 'lng' => 3.3000, 'isAdmin' => true, 'geoOverride' => true]);
chk('geo: a full admin may override an out-of-fence registration', !empty($gov['ok']) && $gov['geo']['ok'] === 0);
setting_set('geofence_enabled', '0', 'system');
chk('geo: with the fence off, no location is required', !empty(backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Five', 'age' => 12, 'course' => 'Coding & Robotics', 'centre' => 'Ayobo Hub', 'parentName' => 'P', 'parentPhone' => '08030000005']])['ok']));

// Photo pipeline wiring: gate registration ingests the headshot end-to-end.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => true, 'provider' => 'gemini', 'data' => ['score' => 90, 'issues' => [], 'flags' => [], 'recommend' => ['crop' => true]]];
$rp = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Photo Reg Kid', 'age' => 12, 'course' => 'Coding & Robotics', 'centre' => 'Ayobo Hub', 'parentName' => 'P', 'parentPhone' => '08030000009'], 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/sample.jpg']);
chk('gate register ingests the headshot into the photo pipeline', !empty($rp['ok']) && photo_approved_for('student', $rp['studentId']) === true);
chk('an approved headshot is written back to the student record', strpos((string)(db_row("SELECT photoUrl FROM summer_students WHERE studentId=?", [$rp['studentId']])['photoUrl'] ?? ''), '/upload/') !== false);
unset($GLOBALS['__ai_photo_mock']);

// ── Gate kiosk password: run the desk without an admin login ──
$kg = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Kiosk desk', 'password' => 'desk123']);
chk('gate: created with a kiosk password', !empty($kg['ok']) && $kg['hasPassword'] === true);
chk('gate: list reports hasPassword and never leaks the hash', (function () use ($kg) { foreach (backend_dispatch('admin.gates.list', ['requesterId' => 'NGG-2025-0099'])['gates'] as $g) if ($g['gateId'] === $kg['gateId']) return ($g['hasPassword'] === true) && !isset($g['passHash']); return false; })());
chk('gate: a too-short kiosk password is refused', backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'x', 'password' => 'ab'])['error'] === 'weak_password');
chk('gate: a wrong kiosk password is rejected', backend_dispatch('gate.unlock', ['gate' => $kg['gateId'], 'password' => 'nope'])['error'] === 'bad_password');
$un = backend_dispatch('gate.unlock', ['gate' => $kg['gateId'], 'password' => 'desk123']);
chk('gate: the correct kiosk password unlocks the gate', !empty($un['ok']) && $un['gate']['gateId'] === $kg['gateId']);
$plainGate = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'No pass']);
chk('gate: a gate with no password cannot be kiosk-unlocked', backend_dispatch('gate.unlock', ['gate' => $plainGate['gateId']])['error'] === 'no_password');
chk('gate: setpass can add then clear a kiosk password', (function () use ($plainGate) {
    $a = backend_dispatch('admin.gates.setpass', ['requesterId' => 'NGG-2025-0099', 'gateId' => $plainGate['gateId'], 'password' => 'field99']);
    if (empty($a['ok']) || $a['hasPassword'] !== true) return false;
    if (empty(backend_dispatch('gate.unlock', ['gate' => $plainGate['gateId'], 'password' => 'field99'])['ok'])) return false;
    $b = backend_dispatch('admin.gates.setpass', ['requesterId' => 'NGG-2025-0099', 'gateId' => $plainGate['gateId'], 'password' => '']);
    return !empty($b['ok']) && $b['hasPassword'] === false && backend_dispatch('gate.unlock', ['gate' => $plainGate['gateId'], 'password' => 'field99'])['error'] === 'no_password';
})());
chk('gate: kiosk password admin ops require the summer cap', backend_dispatch('admin.gates.setpass', ['requesterId' => 'NGG-2025-0001', 'gateId' => $kg['gateId'], 'password' => 'xxxx'])['error'] === 'forbidden');

// Centre partial-update keeps the mapped point (done last — frees AYB's fence).
backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'geofence' => false]]);
chk('geo: a partial update keeps the point but flips the fence off', (function () use ($cA) { $c = db_row("SELECT lat,lng,geofence FROM centres WHERE centreId=?", [$cA['centreId']]); return $c && abs((float)$c['lat'] - 6.6) < 0.0001 && (int)$c['geofence'] === 0; })());

// ── Issuance gate on photo approval + guardian re-shoot ──
$issGate = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Issue desk']);
setting_set('photo_gate_issuance', '1', 'system');
// A flagged photo → pending_review, so the ID is held until an editor approves.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => true, 'provider' => 'gemini', 'data' => ['score' => 40, 'issues' => ['dark'], 'flags' => ['too_dark'], 'recommend' => ['crop' => true, 'brighten' => true]]];
$ir = backend_dispatch('gate.register', ['gate' => $issGate['gateId'], 'data' => ['fullName' => 'Gate Hold Kid', 'age' => 12, 'course' => 'Coding & Robotics', 'centre' => 'Ijaiye', 'parentName' => 'P', 'parentEmail' => 'hold@example.com'], 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/sample.jpg']);
chk('issuance gate: registration ok with a photo queued for review', !empty($ir['ok']));
$vtHold = db_row('SELECT verifyToken FROM summer_students WHERE studentId = ?', [$ir['studentId']])['verifyToken'];
$pvh = backend_dispatch('parent.verify.submit', ['t' => $vtHold, 'consents' => ['participation' => true, 'medical' => true, 'data' => true], 'actorName' => 'P']);
chk('issuance gate: consent verifies but the ID is held pending the photo', !empty($pvh['ok']) && ($pvh['photoPending'] ?? false) === true && ($pvh['idIssued'] ?? true) === false);
chk('issuance gate: no QR token is bound while the photo is pending', (string)(db_row('SELECT token FROM summer_students WHERE studentId = ?', [$ir['studentId']])['token']) === '');
$holdAsset = db_row("SELECT assetId FROM photo_assets WHERE subjectType='student' AND subjectId=? ORDER BY version DESC LIMIT 1", [$ir['studentId']])['assetId'];
backend_dispatch('admin.photo.approve', ['requesterId' => 'NGG-2025-0099', 'assetId' => $holdAsset]);
chk('issuance gate: approving the photo issues the ID', (string)(db_row('SELECT token FROM summer_students WHERE studentId = ?', [$ir['studentId']])['token']) !== '');
unset($GLOBALS['__ai_photo_mock']);
// A registration with NO photo is never blocked by the gate.
$np = backend_dispatch('gate.register', ['gate' => $issGate['gateId'], 'data' => ['fullName' => 'No Photo Kid', 'age' => 12, 'course' => 'Coding & Robotics', 'centre' => 'Ijaiye', 'parentName' => 'P', 'parentEmail' => 'nophoto@example.com']]);
$vtNp = db_row('SELECT verifyToken FROM summer_students WHERE studentId = ?', [$np['studentId']])['verifyToken'];
$pvn = backend_dispatch('parent.verify.submit', ['t' => $vtNp, 'consents' => ['participation' => true, 'medical' => true, 'data' => true], 'actorName' => 'P']);
chk('issuance gate: a photo-less registration still issues immediately', !empty($pvn['idIssued']) && (string)(db_row('SELECT token FROM summer_students WHERE studentId = ?', [$np['studentId']])['token']) !== '');
setting_set('photo_gate_issuance', '0', 'system');

// Guardian re-shoot after a retake.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => true, 'provider' => 'gemini', 'data' => ['score' => 88, 'issues' => [], 'flags' => [], 'recommend' => ['crop' => true]]];
$rsReg = backend_dispatch('gate.register', ['gate' => $issGate['gateId'], 'data' => ['fullName' => 'Reshoot Kid', 'age' => 12, 'course' => 'Coding & Robotics', 'centre' => 'Ijaiye', 'parentName' => 'P', 'parentEmail' => 'reshoot@example.com'], 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/sample.jpg']);
$rsAsset = db_row("SELECT assetId FROM photo_assets WHERE subjectType='student' AND subjectId=? ORDER BY version DESC LIMIT 1", [$rsReg['studentId']])['assetId'];
$GLOBALS['__mail_sink'] = [];
backend_dispatch('admin.photo.retake', ['requesterId' => 'NGG-2025-0099', 'assetId' => $rsAsset, 'reason' => 'Please use a plain background.']);
chk('re-shoot: a retake emails the guardian a link', count(array_filter($GLOBALS['__mail_sink'], fn($m) => stripos($m['subject'], 'new photo') !== false)) >= 1);
$ptok = db_row('SELECT photoToken FROM summer_students WHERE studentId = ?', [$rsReg['studentId']])['photoToken'];
chk('re-shoot: a photo token is minted', $ptok && strpos($ptok, 'PT') === 0);
$rc = backend_dispatch('reshoot.context', ['t' => $ptok]);
chk('re-shoot: context returns the retake reason + awaiting flag', !empty($rc['ok']) && $rc['awaiting'] === true && strpos($rc['reason'], 'plain background') !== false);
chk('re-shoot: a bad token is rejected', backend_dispatch('reshoot.context', ['t' => 'PTbogus'])['error'] === 'link_invalid');
chk('re-shoot: an empty token is rejected', backend_dispatch('reshoot.context', ['t' => ''])['error'] === 'link_invalid');
$rsub = backend_dispatch('reshoot.submit', ['t' => $ptok, 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/sample.jpg']);
chk('re-shoot: submitting a new photo creates a fresh version', !empty($rsub['ok']) && $rsub['version'] >= 2);
chk('re-shoot: a non-https photo is rejected', backend_dispatch('reshoot.submit', ['t' => $ptok, 'photoUrl' => 'ftp://nope'])['error'] === 'bad_photo');
unset($GLOBALS['__ai_photo_mock'], $GLOBALS['__mail_sink']);

// ── Centre capacity → waitlist, and bulk import (run last: they add centres/students) ──
chk('centre capacity waitlists once full', (function () {
    backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'CapCentre', 'code' => 'CAP', 'color' => '#123456', 'capacity' => 1]]);
    backend_dispatch('admin.summer.qr.mint', ['requesterId' => 'NGG-2025-0099', 'count' => 4]);
    $a = backend_dispatch('admin.summer.enroll', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Cap One', 'age' => 12, 'centre' => 'CapCentre']]);
    $b = backend_dispatch('admin.summer.enroll', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Cap Two', 'age' => 12, 'centre' => 'CapCentre']]);
    return empty($a['waitlisted']) && !empty($b['waitlisted'])
        && db_row('SELECT status FROM summer_students WHERE studentId=?', [$b['studentId']])['status'] === 'waitlisted';
})());
chk('centre list reports enrolled/capacity/full', (function () {
    foreach (backend_dispatch('admin.centres.list', ['requesterId' => 'NGG-2025-0099'])['centres'] as $c) if ($c['name'] === 'CapCentre') return (int)$c['capacity'] === 1 && $c['enrolled'] >= 1 && $c['full'] === true && $c['waitlisted'] >= 1;
    return false;
})());
chk('bulk import enrols multiple students', (function () {
    $r = backend_dispatch('admin.summer.import', ['requesterId' => 'NGG-2025-0099', 'rows' => [
        ['fullName' => 'Import A', 'age' => 12, 'centre' => 'Egbeda', 'parentEmail' => 'ia@example.com'],
        ['fullName' => 'Import B', 'age' => 13, 'centre' => 'Egbeda'],
    ]]);
    return !empty($r['ok']) && $r['enrolled'] === 2 && $r['failed'] === 0;
})());
chk('bulk import rejects an empty batch', backend_dispatch('admin.summer.import', ['requesterId' => 'NGG-2025-0099', 'rows' => []])['error'] === 'no_rows');

// ── Event RSVP capacity → waitlist, and staff attendance marking ──
db_insert('events', ['eventId' => 'EV-CAP', 'title' => 'Capped meetup', 'kind' => 'session', 'sessionId' => '', 'startAt' => gmdate('Y-m-d\TH:i:s\Z', time() + 5 * 86400), 'endAt' => '', 'centre' => 'Both', 'location' => 'Hall', 'coverUrl' => '', 'body' => '', 'capacity' => 1, 'isPublic' => 1, 'status' => 'published', 'createdBy' => 'NGG-2025-0099', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
chk('first RSVP within capacity is going', backend_dispatch('event.rsvp', ['memberId' => 'NGG-2025-0001', 'eventId' => 'EV-CAP', 'status' => 'going'])['status'] === 'going');
chk('RSVP past capacity is waitlisted', (function () {
    db_insert('members', ['memberId' => 'NGG-2025-0555', 'fullName' => 'RSVP Two', 'email' => 'r2@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    $r = backend_dispatch('event.rsvp', ['memberId' => 'NGG-2025-0555', 'eventId' => 'EV-CAP', 'status' => 'going']);
    return $r['status'] === 'waitlist' && !empty($r['waitlisted']);
})());
chk('staff can mark event attendance', (function () {
    backend_dispatch('admin.event.attendance', ['requesterId' => 'NGG-2025-0099', 'eventId' => 'EV-CAP', 'memberId' => 'NGG-2025-0001']);
    return !empty(db_row("SELECT attendedAt FROM event_rsvps WHERE eventId='EV-CAP' AND memberId='NGG-2025-0001'")['attendedAt']);
})());
chk('staff can clear event attendance', (function () {
    backend_dispatch('admin.event.attendance', ['requesterId' => 'NGG-2025-0099', 'eventId' => 'EV-CAP', 'memberId' => 'NGG-2025-0001', 'clear' => true]);
    return (string)db_row("SELECT attendedAt FROM event_rsvps WHERE eventId='EV-CAP' AND memberId='NGG-2025-0001'")['attendedAt'] === '';
})());

// ── Newsletter send + one-click unsubscribe ──
backend_dispatch('public.newsletter', ['email' => 'reader@example.com', 'source' => 'test']);
chk('newsletter send emails active subscribers', (function () {
    $GLOBALS['__mail_sink'] = [];
    $r = backend_dispatch('admin.newsletter.send', ['requesterId' => 'NGG-2025-0099', 'subject' => 'July update', 'body' => 'Lots happening this month at NGG.']);
    $hit = count(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'reader@example.com' && $m['subject'] === 'July update')) === 1;
    unset($GLOBALS['__mail_sink']);
    return !empty($r['ok']) && $r['sent'] >= 1 && $hit;
})());
chk('newsletter send rejects a too-short subject', backend_dispatch('admin.newsletter.send', ['requesterId' => 'NGG-2025-0099', 'subject' => 'hi', 'body' => 'long enough body here'])['error'] === 'subject_too_short');
chk('unsubscribe needs a valid signed token', backend_dispatch('public.newsletter.unsubscribe', ['email' => 'reader@example.com', 'token' => 'wrong'])['error'] === 'bad_token');
chk('one-click unsubscribe flips status', (function () {
    $tok = newsletter_unsub_token('reader@example.com');
    backend_dispatch('public.newsletter.unsubscribe', ['email' => 'reader@example.com', 'token' => $tok]);
    return db_row("SELECT status FROM newsletter WHERE email='reader@example.com'")['status'] === 'unsubscribed';
})());
chk('unsubscribed readers are excluded from a send', (function () {
    $GLOBALS['__mail_sink'] = [];
    backend_dispatch('admin.newsletter.send', ['requesterId' => 'NGG-2025-0099', 'subject' => 'Second update', 'body' => 'Another update body.']);
    $hit = count(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'reader@example.com'));
    unset($GLOBALS['__mail_sink']);
    return $hit === 0;
})());

// ── Homepage promo reader ──
chk('active promo is served publicly', (function () {
    backend_dispatch('admin.promotions.set', ['requesterId' => 'NGG-2025-0099', 'promo' => ['text' => 'Registration closes Friday', 'ctaLabel' => 'Register', 'ctaUrl' => '/join', 'expires' => '']]);
    $r = backend_dispatch('public.siteContent', []);
    return !empty($r['promo']) && $r['promo']['text'] === 'Registration closes Friday' && $r['promo']['ctaUrl'] === '/join';
})());
chk('an expired promo is hidden', (function () {
    backend_dispatch('admin.promotions.set', ['requesterId' => 'NGG-2025-0099', 'promo' => ['text' => 'Old news', 'expires' => gmdate('Y-m-d\TH:i:s\Z', time() - 3600)]]);
    return backend_dispatch('public.siteContent', [])['promo'] === null;
})());

// ── Account lifecycle: verified email change, staff invite, export, deletion ──
db_insert('members', ['memberId' => 'NGG-2025-0900', 'fullName' => 'Life Cycle', 'email' => 'life@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
chk('email change requires confirmation (pending set, not applied)', (function () {
    $GLOBALS['__mail_sink'] = [];
    $r = backend_dispatch('member.email.changeRequest', ['memberId' => 'NGG-2025-0900', 'email' => 'newlife@example.com']);
    $sent = count(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'newlife@example.com')) === 1;
    unset($GLOBALS['__mail_sink']);
    return !empty($r['ok']) && db_row("SELECT email FROM members WHERE memberId='NGG-2025-0900'")['email'] === 'life@example.com' && db_row("SELECT pendingEmail FROM members WHERE memberId='NGG-2025-0900'")['pendingEmail'] === 'newlife@example.com' && $sent;
})());
chk('a bad email-change token is rejected', backend_dispatch('member.email.confirm', ['memberId' => 'NGG-2025-0900', 'token' => 'nope'])['error'] === 'invalid');
chk('confirming the token applies the new email', (function () {
    $tok = db_row("SELECT emailChangeToken FROM members WHERE memberId='NGG-2025-0900'")['emailChangeToken'];
    $r = backend_dispatch('member.email.confirm', ['memberId' => 'NGG-2025-0900', 'token' => $tok]);
    return !empty($r['ok']) && db_row("SELECT email FROM members WHERE memberId='NGG-2025-0900'")['email'] === 'newlife@example.com';
})());
chk('granting a staff role emails an invite', (function () {
    $GLOBALS['__mail_sink'] = [];
    backend_dispatch('admin.members.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['memberId' => 'NGG-2025-0900', 'role' => 'editor']]);
    $hit = count(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'newlife@example.com' && stripos($m['subject'], 'team') !== false)) === 1;
    unset($GLOBALS['__mail_sink']);
    return $hit;
})());
chk('member export returns their data bundle', (function () {
    $r = backend_dispatch('member.export', ['memberId' => 'NGG-2025-0900']);
    return !empty($r['ok']) && isset($r['export']['profile']) && $r['export']['profile']['memberId'] === 'NGG-2025-0900' && array_key_exists('journal', $r['export']);
})());
chk('super-admin deletes & anonymises a member', (function () {
    $r = backend_dispatch('admin.members.delete', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0900']);
    $m = db_row("SELECT fullName, email, status FROM members WHERE memberId='NGG-2025-0900'");
    return !empty($r['ok']) && $m['status'] === 'deleted' && $m['email'] === '' && $m['fullName'] === 'Deleted member';
})());
chk('deletion refuses the last super admin', backend_dispatch('admin.members.delete', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0099'])['error'] === 'cannot_delete_super_admin');

// ── Applicant status lookup + peer interaction (reactions + moderated comments) ──
chk('applicant status: ref+email returns a friendly status', (function () {
    db_insert('applications', ['kind' => 'teen', 'name' => 'Status Seeker', 'email' => 'seeker@example.com', 'status' => 'reviewing', 'createdAt' => now_iso()]);
    $id = (int)db_row("SELECT id FROM applications WHERE email='seeker@example.com'")['id'];
    $ref = 'NGG-A-' . str_pad((string)$id, 5, '0', STR_PAD_LEFT);
    $r = backend_dispatch('public.application.status', ['ref' => $ref, 'email' => 'seeker@example.com']);
    return !empty($r['ok']) && $r['status'] === 'reviewing' && $r['label'] === 'Under review';
})());
chk('applicant status: wrong email is not found (no enumeration)', (function () {
    $id = (int)db_row("SELECT id FROM applications WHERE email='seeker@example.com'")['id'];
    $ref = 'NGG-A-' . str_pad((string)$id, 5, '0', STR_PAD_LEFT);
    return backend_dispatch('public.application.status', ['ref' => $ref, 'email' => 'wrong@example.com'])['error'] === 'not_found';
})());
$peerPost = backend_dispatch('admin.posts.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'blog', 'title' => 'Peer Post', 'body' => 'Hi', 'status' => 'published']])['slug'];
chk('member reaction is recorded and toggles off', (function () use ($peerPost) {
    $a = backend_dispatch('post.react', ['memberId' => 'NGG-2025-0001', 'post' => $peerPost, 'emoji' => '🔥']);
    $on = ($a['reactions']['🔥'] ?? 0) === 1 && $a['myReaction'] === '🔥';
    $b = backend_dispatch('post.react', ['memberId' => 'NGG-2025-0001', 'post' => $peerPost, 'emoji' => '🔥']);
    return $on && ($b['reactions']['🔥'] ?? 0) === 0 && $b['myReaction'] === '';
})());
chk('a comment is held for moderation (not public)', (function () use ($peerPost) {
    backend_dispatch('post.comment', ['memberId' => 'NGG-2025-0001', 'post' => $peerPost, 'body' => 'Great piece!']);
    $pub = backend_dispatch('public.post.engagement', ['post' => $peerPost]);
    $queue = backend_dispatch('admin.comments.list', ['requesterId' => 'NGG-2025-0099', 'status' => 'pending']);
    return count($pub['comments']) === 0 && $queue['pending'] >= 1;
})());
chk('approving a comment makes it public', (function () use ($peerPost) {
    $q = backend_dispatch('admin.comments.list', ['requesterId' => 'NGG-2025-0099', 'status' => 'pending']);
    $cid = $q['comments'][0]['commentId'];
    backend_dispatch('admin.comments.moderate', ['requesterId' => 'NGG-2025-0099', 'commentId' => $cid, 'do' => 'approve']);
    return count(backend_dispatch('public.post.engagement', ['post' => $peerPost])['comments']) === 1;
})());
chk('comment moderation gated to content cap', backend_dispatch('admin.comments.list', ['requesterId' => 'NGG-2025-0555'])['error'] === 'forbidden');

// ── RBAC: per-member extra capabilities ──
db_insert('members', ['memberId' => 'NGG-2025-0710', 'fullName' => 'Extra Editor', 'email' => 'ee@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'editor', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
chk('editor lacks the summer cap by default', backend_dispatch('admin.summer.overview', ['requesterId' => 'NGG-2025-0710'])['error'] === 'forbidden');
chk('super grants an extra capability', !empty(backend_dispatch('admin.members.caps', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0710', 'caps' => ['summer']])['ok']));
chk('the extra cap now passes the gate', !empty(backend_dispatch('admin.summer.overview', ['requesterId' => 'NGG-2025-0710'])['ok']));
chk('extra caps cannot be granted to a plain member', backend_dispatch('admin.members.caps', ['requesterId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0555', 'caps' => ['content']])['error'] === 'not_staff');
chk('only super can edit capabilities', backend_dispatch('admin.members.caps', ['requesterId' => 'NGG-2025-0710', 'memberId' => 'NGG-2025-0710', 'caps' => ['rbac']])['error'] === 'forbidden');

// ── Donations (Paystack, mocked) ──
chk('donations are unavailable without a Paystack secret', backend_dispatch('public.donate.init', ['email' => 'giver@example.com', 'amount' => 5000])['error'] === 'donations_unavailable');
chk('donation init returns a checkout URL and banks a pending row', (function () {
    $GLOBALS['CONFIG']['paystack'] = ['secret' => 'sk_test_x'];
    $GLOBALS['__paystack_mock'] = function ($method, $path, $body) {
        if (strpos($path, '/transaction/initialize') === 0) return ['status' => true, 'data' => ['authorization_url' => 'https://checkout.paystack.com/xyz', 'reference' => $body['reference']]];
        return ['status' => true, 'data' => ['status' => 'success', 'channel' => 'card']];
    };
    $r = backend_dispatch('public.donate.init', ['email' => 'giver@example.com', 'name' => 'Ada', 'amount' => 5000]);
    $ok = !empty($r['ok']) && strpos($r['authorizationUrl'], 'paystack.com') !== false && db_row('SELECT status FROM donations WHERE reference = ?', [$r['reference']])['status'] === 'pending';
    $v = donation_verify($r['reference']);
    $paid = ($v['status'] ?? '') === 'paid' && db_row('SELECT status FROM donations WHERE reference = ?', [$r['reference']])['status'] === 'paid';
    unset($GLOBALS['__paystack_mock'], $GLOBALS['CONFIG']['paystack']);
    return $ok && $paid;
})());
chk('donations ledger totals paid amounts (settings cap)', (function () {
    $r = backend_dispatch('admin.donations.list', ['requesterId' => 'NGG-2025-0099']);
    return !empty($r['ok']) && $r['totalPaid'] >= 5000 && count($r['donations']) >= 1;
})());

// ── Full-CSV export (all matching rows, not just the current page) ──
chk('members export returns all rows, unpaged', (function () {
    $paged = backend_dispatch('admin.members.list', ['requesterId' => 'NGG-2025-0099', 'pageSize' => 2, 'page' => 1]);
    $all = backend_dispatch('admin.members.list', ['requesterId' => 'NGG-2025-0099', 'all' => 1]);
    return count($paged['members']) === 2 && count($all['members']) === $all['total'] && $all['total'] > 2;
})());
chk('audit export returns all rows, unpaged', (function () {
    $all = backend_dispatch('admin.audit.tail', ['requesterId' => 'NGG-2025-0099', 'all' => 1]);
    return !empty($all['ok']) && count($all['audit']) === $all['total'];
})());

// ── Leaderboards (member cohort + volunteer duty) ──
chk('public leaderboard ranks members by XP, privacy-safe', (function () {
    $r = backend_dispatch('public.leaderboard', ['limit' => 10]);
    if (empty($r['ok']) || !count($r['leaderboard'])) return false;
    $l = $r['leaderboard'];
    // Descending XP, ranks sequential, no full surnames leaked.
    for ($i = 1; $i < count($l); $i++) if ($l[$i]['xp'] > $l[$i - 1]['xp']) return false;
    return $l[0]['rank'] === 1 && isset($l[0]['first']) && !isset($l[0]['fullName']);
})());
chk('duty leaderboard ranks volunteers by points (staff)', (function () {
    $r = backend_dispatch('attendance.duty.leaderboard', ['requesterId' => 'NGG-2025-0099']);
    return !empty($r['ok']) && count($r['leaderboard']) >= 1 && $r['leaderboard'][0]['rank'] === 1 && isset($r['leaderboard'][0]['points']);
})());
chk('duty leaderboard gated from non-staff', backend_dispatch('attendance.duty.leaderboard', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');

// ── Attendance punctuality (per-member-type resumption time) ─────────────────
chk('punctuality: disabled ⇒ always present', (function () {
    attendance_settings_save(['enabled' => false], 'test');
    return attendance_punctuality('student')['status'] === 'present';
})());
chk('punctuality: on-time before resumption+grace', (function () {
    // Resumption far in the future for the local clock ⇒ never late.
    attendance_settings_save(['enabled' => true, 'tzOffset' => 0, 'graceMinutes' => 5, 'resumptionByType' => ['student' => '23:59']], 'test');
    return attendance_punctuality('student')['status'] === 'present';
})());
chk('punctuality: late after resumption+grace, minutes computed', (function () {
    // Resumption at 00:00 with no grace ⇒ any time today is late by now-of-day.
    attendance_settings_save(['enabled' => true, 'tzOffset' => 0, 'graceMinutes' => 0, 'resumptionByType' => ['student' => '00:00']], 'test');
    $r = attendance_punctuality('student');
    return $r['status'] === 'late' && $r['lateMinutes'] >= 0;
})());
chk('punctuality: unknown type falls back to default', (function () {
    attendance_settings_save(['enabled' => true, 'tzOffset' => 0, 'graceMinutes' => 0, 'resumptionByType' => ['default' => '00:00']], 'test');
    return attendance_punctuality('mentor')['status'] === 'late';
})());
chk('punctuality: invalid HH:MM rejected, valid kept', (function () {
    attendance_settings_save(['enabled' => true, 'resumptionByType' => ['student' => '99:99', 'volunteer' => '08:30']], 'test');
    $cfg = attendance_settings();
    // '99:99' rejected ⇒ student falls back to the default '09:00'; '08:30' kept.
    return $cfg['resumptionByType']['student'] === '09:00' && $cfg['resumptionByType']['volunteer'] === '08:30';
})());

// ── Admin resend ID ─────────────────────────────────────────────────────────
db_insert('summer_cohorts', ['cohortId' => 'RC1', 'name' => 'Resend Cohort', 'status' => 'active', 'createdAt' => now_iso()]);
db_insert('summer_students', ['studentId' => 'SUM-R-1', 'cohortId' => 'RC1', 'token' => 'SUMQR-RS1', 'handle' => 'rskid', 'fullName' => 'Resend Kid', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'regStatus' => 'verified', 'parentEmail' => 'parent@example.com', 'status' => 'active', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('summer_students', ['studentId' => 'SUM-R-2', 'cohortId' => 'RC1', 'token' => '', 'handle' => 'noid', 'fullName' => 'No Id', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech', 'regStatus' => 'verified', 'parentEmail' => 'p2@example.com', 'status' => 'active', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
chk('resend ID: missing id rejected', backend_dispatch('admin.id.resend', ['requesterId' => 'NGG-2025-0099', 'kind' => 'student', 'id' => ''])['error'] === 'missing_id');
chk('resend ID: non-staff forbidden', backend_dispatch('admin.id.resend', ['requesterId' => 'NGG-2025-0001', 'kind' => 'student', 'id' => 'SUM-R-1'])['error'] === 'forbidden');
chk('resend ID: unknown student not_found', backend_dispatch('admin.id.resend', ['requesterId' => 'NGG-2025-0099', 'kind' => 'student', 'id' => 'SUM-NOPE'])['error'] === 'not_found');
chk('resend ID: student without a token ⇒ no_id', backend_dispatch('admin.id.resend', ['requesterId' => 'NGG-2025-0099', 'kind' => 'student', 'id' => 'SUM-R-2'])['error'] === 'no_id');
chk('resend ID: issued student ⇒ ok + audited', (function () {
    $r = backend_dispatch('admin.id.resend', ['requesterId' => 'NGG-2025-0099', 'kind' => 'student', 'id' => 'SUM-R-1']);
    if (empty($r['ok']) || !isset($r['channels'])) return false;
    return (int)db_row("SELECT COUNT(*) c FROM audit_log WHERE event='admin.id.resend' AND subject='SUM-R-1'")['c'] === 1;
})());

// ── Mission proof-review queue (M13: verify was built but unreachable) ────────
$pmid = backend_dispatch('admin.missions.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['week' => 2, 'order' => 1, 'theme' => 'Proof', 'title' => 'Show your work', 'prompt' => 'Upload a photo', 'type' => 'Do', 'proof' => 'photo', 'xp' => 90, 'isActive' => true]])['missionId'];
chk('proof mission submit ⇒ submitted (not auto-verified)', backend_dispatch('anchor.mission.submit', ['memberId' => 'NGG-2025-0001', 'missionId' => $pmid, 'proofUrl' => 'https://example.org/p.jpg'])['status'] === 'submitted');
chk('review queue lists the pending proof', (function () use ($pmid) {
    $r = backend_dispatch('admin.missions.submissions', ['requesterId' => 'NGG-2025-0099']);
    return !empty($r['ok']) && count(array_filter($r['submissions'], fn($x) => $x['missionId'] === $pmid)) === 1;
})());
chk('review queue gated from non-staff', backend_dispatch('admin.missions.submissions', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('verify approve awards XP + clears from queue', (function () use ($pmid) {
    $v = backend_dispatch('anchor.mission.verify', ['verifierId' => 'NGG-2025-0099', 'memberId' => 'NGG-2025-0001', 'missionId' => $pmid, 'approve' => true]);
    if (empty($v['ok'])) return false;
    $row = db_row('SELECT status, xpAwarded FROM member_progress WHERE memberId=? AND missionId=?', ['NGG-2025-0001', $pmid]);
    $q = backend_dispatch('admin.missions.submissions', ['requesterId' => 'NGG-2025-0099']);
    return $row['status'] === 'verified' && (int)$row['xpAwarded'] === 90 && count(array_filter($q['submissions'], fn($x) => $x['missionId'] === $pmid)) === 0;
})());

echo "\n" . ($failed ? "❌ FAIL: $passed passed, $failed failed\n" : "✅ PASS: $passed passed, 0 failed\n");
exit($failed ? 1 : 0);
