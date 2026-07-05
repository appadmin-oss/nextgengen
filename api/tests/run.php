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
    'debug' => true,
];
$GLOBALS['CONFIG'] = $CONFIG;
function client_ip() { return '127.0.0.1'; }

require $ROOT . '/_lib/response.php';
require $ROOT . '/_lib/db.php';
require $ROOT . '/_lib/util.php';
require $ROOT . '/_lib/mailer.php';
require $ROOT . '/_lib/anchor-content.php';
foreach (['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2'] as $d) require $ROOT . "/_lib/domain/$d.php";
require $ROOT . '/_lib/backend.php';

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

// ── Announcement ──
backend_dispatch('admin.broadcast', ['requesterId' => 'NGG-2025-0099', 'title' => 'Hello all', 'body' => 'Welcome', 'audience' => 'all']);
$seen = false;
foreach (backend_dispatch('member.notifications', ['memberId' => 'NGG-2025-0001'])['notifications'] as $n) if ($n['title'] === 'Hello all') $seen = true;
chk('broadcast reaches member feed', $seen);

// ── TOTP ──
$secret = backend_dispatch('auth.totpSetup', ['memberId' => 'NGG-2025-0099'])['secret'];
chk('totp accepts current code', backend_dispatch('auth.totpVerify', ['memberId' => 'NGG-2025-0099', 'code' => totp_code($secret, intdiv(time(), 30))])['ok'] === true);
chk('totp rejects bad code', backend_dispatch('auth.totpVerify', ['memberId' => 'NGG-2025-0099', 'code' => '000000'])['ok'] === false);

// ── Posts / newsletter / apply ──
chk('post publishes with slug', !empty(backend_dispatch('admin.posts.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'blog', 'title' => 'First Post', 'body' => 'Hi', 'status' => 'published']])['slug']));
chk('public reads published post', count(backend_dispatch('public.posts', ['kind' => 'blog'])['posts']) === 1);
chk('newsletter idempotent', backend_dispatch('public.newsletter', ['email' => 'sub@example.com'])['ok'] && backend_dispatch('public.newsletter', ['email' => 'sub@example.com'])['ok']);
chk('apply validates age', backend_dispatch('public.apply', ['kind' => 'teen', 'name' => 'Kid', 'email' => 'k@example.com', 'age' => 40])['error'] === 'bad_age');

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
backend_dispatch('public.apply', ['kind' => 'teen', 'name' => 'Applicant One', 'email' => 'app1@example.com', 'age' => 15, 'track' => 'Music', 'centre' => 'Ayobo']);
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
chk('apply blocked when closed', backend_dispatch('public.apply', ['kind' => 'teen', 'name' => 'X Y', 'email' => 'x@example.com', 'age' => 14])['error'] === 'applications_closed');
chk('newsletter list works', is_array(backend_dispatch('admin.newsletter.list', ['requesterId' => 'NGG-2025-0099'])['subscribers']));

echo "\n" . ($failed ? "❌ FAIL: $passed passed, $failed failed\n" : "✅ PASS: $passed passed, 0 failed\n");
exit($failed ? 1 : 0);
