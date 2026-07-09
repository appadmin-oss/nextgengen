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
foreach (['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2', 'mentorship', 'summer', 'club', 'circle', 'momentum', 'integrations', 'registration', 'hooks'] as $d) require $ROOT . "/_lib/domain/$d.php";
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

// ── Program tagging (Summer vs Anchor) + convert respects program ──
backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['applications_open' => true]]);
backend_dispatch('public.apply', ['kind' => 'teen', 'name' => 'Summer Kid', 'email' => 'summer1@example.com', 'age' => 12, 'track' => 'Dance', 'centre' => 'Egbeda', 'program' => 'summer']);
chk('summer application tagged', db_row("SELECT program FROM applications WHERE email='summer1@example.com'")['program'] === 'summer');
backend_dispatch('public.apply', ['kind' => 'teen', 'name' => 'Anchor Kid', 'email' => 'anchor1@example.com', 'age' => 16, 'track' => 'Tech', 'centre' => 'Egbeda', 'program' => 'anchor']);
$anchorApp = db_row("SELECT id FROM applications WHERE email='anchor1@example.com'")['id'];
$convA = backend_dispatch('admin.application.convert', ['requesterId' => 'NGG-2025-0099', 'id' => $anchorApp]);
chk('anchor applicant becomes NGG member', db_row('SELECT type FROM members WHERE memberId=?', [$convA['memberId']])['type'] === 'NGG');
$summerAppId = db_row("SELECT id FROM applications WHERE email='summer1@example.com'")['id'];
$convS = backend_dispatch('admin.application.convert', ['requesterId' => 'NGG-2025-0099', 'id' => $summerAppId]);
chk('summer applicant becomes Summer member', db_row('SELECT type FROM members WHERE memberId=?', [$convS['memberId']])['type'] === 'Summer');
chk('invalid program falls back to anchor', (function () {
    backend_dispatch('public.apply', ['kind' => 'teen', 'name' => 'Junk Prog', 'email' => 'junkprog@example.com', 'age' => 14, 'program' => 'bogus']);
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
backend_dispatch('public.apply', ['kind' => 'mentor', 'name' => 'Mentor Ada', 'email' => 'mentorada@example.com', 'role' => 'Music coach', 'why' => 'I want to help teens find their voice.']);
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
    $r2 = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => ['fullName' => 'Chidi Okafor', 'age' => 14, 'course' => 'Coding & Robotics', 'parentName' => 'Mrs Okafor']]);
    return !empty($r2['errors']['parentPhone']);
})());
$REG = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => ['fullName' => 'Chidi Okafor', 'age' => 14, 'course' => 'Coding & Robotics', 'parentName' => 'Mrs Okafor', 'parentPhone' => '08031234567', 'parentEmail' => 'okafor@example.com', 'allergies' => 'Peanuts']]);
chk('gate: registration lands parent_pending with normalised phone + no QR yet', (function () use ($REG) {
    if (empty($REG['ok']) || $REG['regStatus'] !== 'parent_pending') return false;
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ?', [$REG['studentId']]);
    return $s['guardianPhone'] === '+2348031234567' && ($s['token'] ?? '') === '' && !empty($s['verifyToken']);
})());
chk('gate: duplicate guard flags same child + parent, force overrides', (function () use ($GATE) {
    $d = ['fullName' => 'Chidi Okafor', 'age' => 14, 'course' => 'Coding & Robotics', 'parentName' => 'Mrs Okafor', 'parentPhone' => '08031234567'];
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

echo "\n" . ($failed ? "❌ FAIL: $passed passed, $failed failed\n" : "✅ PASS: $passed passed, 0 failed\n");
exit($failed ? 1 : 0);
